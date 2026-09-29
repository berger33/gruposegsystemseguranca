// CRM-07..CRM-10 — engajamento comercial:
//   CRM-07: tarefas (com vencidas), histórico de ligações/reuniões, anexos e
//           notas internas autorizadas (somente sessão de staff).
//   CRM-08: agenda de visitas com responsável, participantes, confirmação,
//           reagendamento e cancelamento.
//   CRM-09: cadências de prospecção materializadas como tarefas reais.
//   CRM-10: carteira — renovações, oportunidades sem próxima ação, candidatas
//           a reativação e relacionamentos por grupo/unidade.
//
// Regras seguidas aqui (mesmas do restante da entrega):
//   - id/papel/responsável nunca vêm confiáveis do cliente: o autor é sempre
//     derivado da sessão; responsável alternativo é validado contra staff ativo.
//   - anexos seguem o padrão do L02: bytes fora do banco, storage_key opaco,
//     sha256 conferido no download (integridade), sem assinatura nem entrega.
//   - nenhuma automação de mensagem: cadência gera tarefa para humano executar.

import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { listCadences, getCadence } from "../lib/commercial-cadences.mjs";

const TASK_STATUS = new Set(["aberta", "em_andamento", "concluida", "cancelada"]);
const TASK_PRIORITY = new Set(["baixa", "media", "alta", "critica"]);

// Matriz de transição de tarefa (server-side, sem confiar no cliente).
// 'cancelada' é terminal: cancelamento é decisão deliberada; para retomar,
// cria-se nova tarefa (mantém o histórico honesto).
const TASK_TRANSITIONS = {
  aberta: new Set(["em_andamento", "concluida", "cancelada"]),
  em_andamento: new Set(["concluida", "cancelada", "aberta"]),
  concluida: new Set(["aberta"]),
  cancelada: new Set(),
};

const INTERACTION_TYPES = new Set(["ligacao", "reuniao", "email", "whatsapp", "visita", "nota", "outro"]);

const VISIT_TERMINAL = new Set(["realizada", "cancelada"]);
const VISIT_ACTIONS = new Set(["agendar", "confirmar", "reagendar", "realizar", "cancelar"]);

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENT_JSON = 7 * 1024 * 1024;
const STORAGE_KEY_PATTERN = /^[0-9a-f]{48}$/;

function isValidUuid(v) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function sanitizeText(s, max) {
  if (typeof s !== "string") return null;
  const t = s.trim();
  if (t.length === 0) return null;
  if (t.length > max) return null;
  return t;
}

function parseDate(v) {
  if (v === undefined || v === null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined; // undefined = inválido
  return d;
}

export function createCrmEngagementApi(ctx) {
  // ctx: { json, readJson, sameOrigin, getPool, readAdminSession, docsDir }

  const docsDir = ctx.docsDir;

  async function audit(db, { action, target, result, actorKind, actorId, category }) {
    try {
      await db.query(
        "INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,$5,$6)",
        [actorKind || "system", actorId || null, action, target || null, result || "allowed", category || "none"]
      );
    } catch (e) {
      console.error("crm engagement audit failed", e?.message);
    }
  }

  function requireMethod(req, res, allowed) {
    if (!allowed.includes(req.method)) {
      ctx.json(res, 405, { error: "method_not_allowed" }, { Allow: allowed.join(", ") });
      return false;
    }
    return true;
  }

  function requireSameOrigin(req, res) {
    if (ctx.sameOrigin(req)) return true;
    ctx.json(res, 403, { error: "same_origin_required" });
    return false;
  }

  async function requireStaffSession(req, res) {
    const session = await ctx.readAdminSession(req);
    if (!session) {
      ctx.json(res, 401, { error: "admin_session_required" });
      return null;
    }
    return session;
  }

  // Responsável alternativo: precisa ser identidade de staff ativa (validado
  // no servidor). Sem isso, cai no autor da sessão.
  async function resolveResponsible(db, bodyValue, session) {
    if (bodyValue === undefined || bodyValue === null || bodyValue === "") return { id: session.identityId };
    if (!isValidUuid(bodyValue)) return { error: "invalid_responsible_id" };
    const r = await db.query(
      `SELECT i.id FROM auth_identities i
         JOIN auth_staff_profiles p ON p.identity_id = i.id
        WHERE i.id = $1 AND i.status = 'active'`,
      [bodyValue]
    );
    if (!r.rows[0]) return { error: "responsible_not_staff" };
    return { id: r.rows[0].id };
  }

  // ---------------------------------------------------------------- tarefas
  async function handleTasks(req, res, url) {
    if (!requireMethod(req, res, ["GET", "POST"])) return;
    const session = await requireStaffSession(req, res);
    if (!session) return;
    const db = ctx.getPool();

    if (req.method === "GET") {
      const status = url.searchParams.get("status");
      const priority = url.searchParams.get("priority");
      const overdue = url.searchParams.get("overdue") === "1" || url.searchParams.get("overdue") === "true";
      const mine = url.searchParams.get("responsible") === "me";
      const responsibleId = url.searchParams.get("responsible_id");
      const companyId = url.searchParams.get("company_id");
      const opportunityId = url.searchParams.get("opportunity_id");
      const search = url.searchParams.get("search");
      const cadenceOnly = url.searchParams.get("cadence") === "1";
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "100", 10) || 100));
      const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);

      if (status && !TASK_STATUS.has(status)) return ctx.json(res, 400, { error: "invalid_status" });
      if (priority && !TASK_PRIORITY.has(priority)) return ctx.json(res, 400, { error: "invalid_priority" });
      if (responsibleId && !isValidUuid(responsibleId)) return ctx.json(res, 400, { error: "invalid_responsible_id" });
      if (companyId && !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
      if (opportunityId && !isValidUuid(opportunityId)) return ctx.json(res, 400, { error: "invalid_opportunity_id" });

      try {
        const conditions = [];
        const values = [];
        let idx = 1;
        if (status) { conditions.push(`t.status = $${idx++}`); values.push(status); }
        if (priority) { conditions.push(`t.priority = $${idx++}`); values.push(priority); }
        if (overdue) conditions.push("t.due_date < NOW() AND t.status IN ('aberta','em_andamento')");
        if (mine) { conditions.push(`t.responsible_id = $${idx++}`); values.push(session.identityId); }
        if (responsibleId) { conditions.push(`t.responsible_id = $${idx++}`); values.push(responsibleId); }
        if (companyId) { conditions.push(`t.company_id = $${idx++}`); values.push(companyId); }
        if (opportunityId) { conditions.push(`t.opportunity_id = $${idx++}`); values.push(opportunityId); }
        if (cadenceOnly) conditions.push("t.cadence_key IS NOT NULL");
        if (search) {
          conditions.push(`(t.title ILIKE $${idx} OR t.description ILIKE $${idx})`);
          values.push(`%${search}%`);
          idx++;
        }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const base = `FROM crm_tasks t
          LEFT JOIN crm_companies c ON c.id = t.company_id
          LEFT JOIN crm_opportunities o ON o.id = t.opportunity_id
          ${where}`;
        const countRes = await db.query(`SELECT COUNT(*)::int AS total ${base}`, values);
        const listRes = await db.query(
          `SELECT t.*, c.display_name AS company_name, o.title AS opportunity_title,
                  (t.due_date < NOW() AND t.status IN ('aberta','em_andamento')) AS is_overdue
             ${base}
            ORDER BY (t.status IN ('aberta','em_andamento')) DESC, t.due_date ASC NULLS LAST, t.created_at DESC
            LIMIT $${idx++} OFFSET $${idx++}`,
          [...values, limit, offset]
        );
        return ctx.json(res, 200, { tasks: listRes.rows, total: countRes.rows[0]?.total || 0, limit, offset });
      } catch (e) {
        console.error("crm tasks list failed", e?.message);
        return ctx.json(res, 503, { error: "crm_unavailable" });
      }
    }

    // POST
    if (!requireSameOrigin(req, res)) return;
    let body;
    try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

    const title = sanitizeText(body?.title, 200);
    if (!title) return ctx.json(res, 400, { error: "invalid_title" });
    const description = body?.description ? sanitizeText(body.description, 2000) : null;
    if (body?.description && !description) return ctx.json(res, 400, { error: "invalid_description" });
    const priority = body?.priority ? String(body.priority).toLowerCase() : "media";
    if (!TASK_PRIORITY.has(priority)) return ctx.json(res, 400, { error: "invalid_priority" });
    const companyId = body?.company_id || body?.companyId || null;
    const opportunityId = body?.opportunity_id || body?.opportunityId || null;
    if (companyId && !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
    if (opportunityId && !isValidUuid(opportunityId)) return ctx.json(res, 400, { error: "invalid_opportunity_id" });
    if (!companyId && !opportunityId) return ctx.json(res, 400, { error: "scope_required" });
    const dueDate = parseDate(body?.due_date ?? body?.dueDate);
    if (dueDate === undefined) return ctx.json(res, 400, { error: "invalid_due_date" });

    try {
      const db2 = ctx.getPool();
      let resolvedCompany = companyId;
      if (opportunityId) {
        const opp = await db2.query("SELECT id, company_id FROM crm_opportunities WHERE id = $1", [opportunityId]);
        if (!opp.rows[0]) return ctx.json(res, 404, { error: "opportunity_not_found" });
        if (companyId && opp.rows[0].company_id !== companyId) {
          return ctx.json(res, 409, { error: "opportunity_company_mismatch" });
        }
        resolvedCompany = opp.rows[0].company_id;
      } else {
        const comp = await db2.query("SELECT id FROM crm_companies WHERE id = $1", [companyId]);
        if (!comp.rows[0]) return ctx.json(res, 404, { error: "company_not_found" });
      }

      const responsible = await resolveResponsible(db2, body?.responsible_id ?? body?.responsibleId, session);
      if (responsible.error) return ctx.json(res, 400, { error: responsible.error });

      const id = crypto.randomUUID();
      const ins = await db2.query(
        `INSERT INTO crm_tasks (id, opportunity_id, company_id, title, description, responsible_id, due_date, status, priority, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'aberta',$8,$9) RETURNING *`,
        [id, opportunityId || null, resolvedCompany || null, title, description, responsible.id || null, dueDate, priority, session.identityId || null]
      );
      await audit(db2, { action: "crm_task_create", target: `${id}:${priority}`, actorKind: session.role, actorId: session.identityId });
      return ctx.json(res, 201, { task: ins.rows[0] });
    } catch (e) {
      console.error("crm task create failed", e?.message);
      return ctx.json(res, 503, { error: "crm_unavailable" });
    }
  }

  async function handleTaskById(req, res, id) {
    if (!requireMethod(req, res, ["GET", "PATCH"])) return;
    if (!isValidUuid(id)) return ctx.json(res, 400, { error: "invalid_id" });
    const session = await requireStaffSession(req, res);
    if (!session) return;
    const db = ctx.getPool();

    if (req.method === "GET") {
      try {
        const r = await db.query(
          `SELECT t.*, c.display_name AS company_name, o.title AS opportunity_title,
                  (t.due_date < NOW() AND t.status IN ('aberta','em_andamento')) AS is_overdue
             FROM crm_tasks t
             LEFT JOIN crm_companies c ON c.id = t.company_id
             LEFT JOIN crm_opportunities o ON o.id = t.opportunity_id
            WHERE t.id = $1`,
          [id]
        );
        if (!r.rows[0]) return ctx.json(res, 404, { error: "task_not_found" });
        return ctx.json(res, 200, { task: r.rows[0] });
      } catch (e) {
        console.error("crm task get failed", e?.message);
        return ctx.json(res, 503, { error: "crm_unavailable" });
      }
    }

    if (!requireSameOrigin(req, res)) return;
    let body;
    try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

    try {
      const cur = await db.query("SELECT * FROM crm_tasks WHERE id = $1", [id]);
      if (!cur.rows[0]) return ctx.json(res, 404, { error: "task_not_found" });
      const task = cur.rows[0];

      const fields = [];
      const values = [];
      let idx = 1;
      let statusAction = null;

      if (body?.status !== undefined) {
        const target = String(body.status).toLowerCase();
        if (!TASK_STATUS.has(target)) return ctx.json(res, 400, { error: "invalid_status" });
        const allowed = TASK_TRANSITIONS[task.status] || new Set();
        if (!allowed.has(target)) {
          return ctx.json(res, 409, { error: "task_transition_invalid", current: task.status, target });
        }
        fields.push(`status = $${idx++}`);
        values.push(target);
        statusAction = `crm_task_status_${target}`;
      }

      if (body?.title !== undefined) {
        const t = sanitizeText(body.title, 200);
        if (!t) return ctx.json(res, 400, { error: "invalid_title" });
        fields.push(`title = $${idx++}`); values.push(t);
      }
      if (body?.description !== undefined) {
        const d = body.description === null ? null : sanitizeText(body.description, 2000);
        if (body.description && !d) return ctx.json(res, 400, { error: "invalid_description" });
        fields.push(`description = $${idx++}`); values.push(d);
      }
      if (body?.priority !== undefined) {
        const p = String(body.priority).toLowerCase();
        if (!TASK_PRIORITY.has(p)) return ctx.json(res, 400, { error: "invalid_priority" });
        fields.push(`priority = $${idx++}`); values.push(p);
      }
      if (body?.due_date !== undefined || body?.dueDate !== undefined) {
        const d = parseDate(body.due_date ?? body.dueDate);
        if (d === undefined) return ctx.json(res, 400, { error: "invalid_due_date" });
        fields.push(`due_date = $${idx++}`); values.push(d);
      }
      if (body?.responsible_id !== undefined || body?.responsibleId !== undefined) {
        const resolved = await resolveResponsible(db, body.responsible_id ?? body.responsibleId, session);
        if (resolved.error) return ctx.json(res, 400, { error: resolved.error });
        fields.push(`responsible_id = $${idx++}`); values.push(resolved.id);
      }

      if (fields.length === 0) return ctx.json(res, 400, { error: "no_fields" });

      values.push(id);
      const upd = await db.query(
        `UPDATE crm_tasks SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
        values
      );
      await audit(db, {
        action: statusAction || "crm_task_update",
        target: `${id}:${statusAction ? upd.rows[0].status : "fields"}`,
        actorKind: session.role,
        actorId: session.identityId,
      });
      return ctx.json(res, 200, { task: upd.rows[0] });
    } catch (e) {
      console.error("crm task update failed", e?.message);
      return ctx.json(res, 503, { error: "crm_unavailable" });
    }
  }

  // ------------------------------------------------------------ interações
  async function handleInteractions(req, res, url) {
    if (!requireMethod(req, res, ["GET", "POST"])) return;
    const session = await requireStaffSession(req, res);
    if (!session) return;
    const db = ctx.getPool();

    if (req.method === "GET") {
      const companyId = url.searchParams.get("company_id");
      const opportunityId = url.searchParams.get("opportunity_id");
      const type = url.searchParams.get("type");
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "100", 10) || 100));
      if (!companyId && !opportunityId) return ctx.json(res, 400, { error: "scope_required" });
      if (companyId && !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
      if (opportunityId && !isValidUuid(opportunityId)) return ctx.json(res, 400, { error: "invalid_opportunity_id" });
      if (type && !INTERACTION_TYPES.has(type)) return ctx.json(res, 400, { error: "invalid_type" });

      try {
        const conditions = [];
        const values = [];
        let idx = 1;
        if (companyId) { conditions.push(`i.company_id = $${idx++}`); values.push(companyId); }
        if (opportunityId) { conditions.push(`i.opportunity_id = $${idx++}`); values.push(opportunityId); }
        if (type) { conditions.push(`i.type = $${idx++}`); values.push(type); }
        const r = await db.query(
          `SELECT i.*, ct.display_name AS contact_name,
                  (SELECT COUNT(*)::int FROM crm_interaction_attachments a WHERE a.interaction_id = i.id) AS attachment_count
             FROM crm_interactions i
             LEFT JOIN crm_contacts ct ON ct.id = i.contact_id
            WHERE ${conditions.join(" AND ")}
            ORDER BY i.occurred_at DESC, i.created_at DESC
            LIMIT $${idx}`,
          [...values, limit]
        );
        return ctx.json(res, 200, { interactions: r.rows, total: r.rows.length });
      } catch (e) {
        console.error("crm interactions list failed", e?.message);
        return ctx.json(res, 503, { error: "crm_unavailable" });
      }
    }

    if (!requireSameOrigin(req, res)) return;
    let body;
    try { body = await ctx.readJson(req, 20 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

    const type = body?.type ? String(body.type).toLowerCase() : null;
    if (!type || !INTERACTION_TYPES.has(type)) return ctx.json(res, 400, { error: "invalid_type" });
    const title = sanitizeText(body?.title, 200);
    if (!title) return ctx.json(res, 400, { error: "invalid_title" });
    const details = body?.details ? sanitizeText(body.details, 5000) : null;
    if (body?.details && !details) return ctx.json(res, 400, { error: "invalid_details" });
    const companyId = body?.company_id || body?.companyId || null;
    const opportunityId = body?.opportunity_id || body?.opportunityId || null;
    const contactId = body?.contact_id || body?.contactId || null;
    if (!companyId || !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
    if (opportunityId && !isValidUuid(opportunityId)) return ctx.json(res, 400, { error: "invalid_opportunity_id" });
    if (contactId && !isValidUuid(contactId)) return ctx.json(res, 400, { error: "invalid_contact_id" });
    const occurredAt = parseDate(body?.occurred_at ?? body?.occurredAt);
    if (occurredAt === undefined) return ctx.json(res, 400, { error: "invalid_occurred_at" });

    try {
      const comp = await db.query("SELECT id FROM crm_companies WHERE id = $1", [companyId]);
      if (!comp.rows[0]) return ctx.json(res, 404, { error: "company_not_found" });
      if (opportunityId) {
        const opp = await db.query("SELECT id, company_id FROM crm_opportunities WHERE id = $1", [opportunityId]);
        if (!opp.rows[0]) return ctx.json(res, 404, { error: "opportunity_not_found" });
        if (opp.rows[0].company_id !== companyId) return ctx.json(res, 409, { error: "opportunity_company_mismatch" });
      }
      if (contactId) {
        const c = await db.query("SELECT id, company_id FROM crm_contacts WHERE id = $1", [contactId]);
        if (!c.rows[0]) return ctx.json(res, 404, { error: "contact_not_found" });
        if (c.rows[0].company_id && c.rows[0].company_id !== companyId) {
          return ctx.json(res, 409, { error: "contact_company_mismatch" });
        }
      }

      const id = crypto.randomUUID();
      const ins = await db.query(
        `INSERT INTO crm_interactions (id, company_id, opportunity_id, contact_id, type, title, details, occurred_at, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8, NOW()),$9) RETURNING *`,
        [id, companyId, opportunityId || null, contactId || null, type, title, details, occurredAt, session.identityId || null]
      );
      await audit(db, { action: "crm_interaction_create", target: `${id}:${type}`, actorKind: session.role, actorId: session.identityId });
      return ctx.json(res, 201, { interaction: ins.rows[0] });
    } catch (e) {
      console.error("crm interaction create failed", e?.message);
      return ctx.json(res, 503, { error: "crm_unavailable" });
    }
  }

  // ------------------------------------------------------ anexos (CRM-07)
  async function handleInteractionAttachments(req, res, interactionId) {
    if (!requireMethod(req, res, ["GET", "POST"])) return;
    if (!isValidUuid(interactionId)) return ctx.json(res, 400, { error: "invalid_id" });
    const session = await requireStaffSession(req, res);
    if (!session) return;
    const db = ctx.getPool();

    try {
      const inter = await db.query("SELECT id FROM crm_interactions WHERE id = $1", [interactionId]);
      if (!inter.rows[0]) return ctx.json(res, 404, { error: "interaction_not_found" });
    } catch (e) {
      console.error("crm attachment scope failed", e?.message);
      return ctx.json(res, 503, { error: "crm_unavailable" });
    }

    if (req.method === "GET") {
      try {
        const r = await db.query(
          `SELECT id, interaction_id, display_name, content_type, size_bytes, content_sha256, uploaded_by_role, created_at
             FROM crm_interaction_attachments WHERE interaction_id = $1 ORDER BY created_at DESC`,
          [interactionId]
        );
        return ctx.json(res, 200, { attachments: r.rows, total: r.rows.length });
      } catch (e) {
        console.error("crm attachments list failed", e?.message);
        return ctx.json(res, 503, { error: "crm_unavailable" });
      }
    }

    if (!requireSameOrigin(req, res)) return;
    let body;
    try { body = await ctx.readJson(req, MAX_ATTACHMENT_JSON); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

    const displayName = sanitizeText(body?.display_name ?? body?.displayName, 200);
    if (!displayName) return ctx.json(res, 400, { error: "invalid_display_name" });
    const contentType = body?.content_type ? sanitizeText(body.content_type, 120) : "application/octet-stream";
    if (!contentType || !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(contentType)) {
      return ctx.json(res, 400, { error: "invalid_content_type" });
    }
    const b64 = typeof body?.contentBase64 === "string" ? body.contentBase64 : (typeof body?.content_base64 === "string" ? body.content_base64 : null);
    if (!b64) return ctx.json(res, 400, { error: "invalid_content" });

    let content;
    try { content = Buffer.from(b64, "base64"); } catch { return ctx.json(res, 400, { error: "invalid_content" }); }
    if (!content || content.length === 0) return ctx.json(res, 400, { error: "invalid_content" });
    if (content.length > MAX_ATTACHMENT_BYTES) return ctx.json(res, 413, { error: "attachment_too_large", max_bytes: MAX_ATTACHMENT_BYTES });

    const storageKey = crypto.randomBytes(24).toString("hex");
    if (!STORAGE_KEY_PATTERN.test(storageKey)) return ctx.json(res, 503, { error: "storage_key_failed" });
    const sha = crypto.createHash("sha256").update(content).digest("hex");
    const dir = path.join(docsDir, "crm-interactions");

    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, storageKey), content, { mode: 0o600 });
    } catch (e) {
      console.error("crm attachment write failed", e?.message);
      return ctx.json(res, 503, { error: "attachment_storage_unavailable" });
    }

    try {
      const id = crypto.randomUUID();
      const ins = await db.query(
        `INSERT INTO crm_interaction_attachments (id, interaction_id, display_name, content_type, size_bytes, content_sha256, storage_key, uploaded_by_id, uploaded_by_role)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, interaction_id, display_name, content_type, size_bytes, content_sha256, uploaded_by_role, created_at`,
        [id, interactionId, displayName, contentType, content.length, sha, storageKey, session.identityId || null, session.role || null]
      );
      await audit(db, { action: "crm_interaction_attachment_upload", target: `${id}:${content.length}`, actorKind: session.role, actorId: session.identityId });
      return ctx.json(res, 201, { attachment: ins.rows[0] });
    } catch (e) {
      console.error("crm attachment insert failed", e?.message);
      try { await fs.unlink(path.join(dir, storageKey)); } catch {}
      return ctx.json(res, 503, { error: "crm_unavailable" });
    }
  }

  async function handleInteractionAttachmentDownload(req, res, attachmentId) {
    if (!requireMethod(req, res, ["GET"])) return;
    if (!isValidUuid(attachmentId)) return ctx.json(res, 400, { error: "invalid_id" });
    const session = await requireStaffSession(req, res);
    if (!session) return;
    const db = ctx.getPool();

    let row;
    try {
      const r = await db.query("SELECT * FROM crm_interaction_attachments WHERE id = $1", [attachmentId]);
      row = r.rows[0];
    } catch (e) {
      console.error("crm attachment read failed", e?.message);
      return ctx.json(res, 503, { error: "crm_unavailable" });
    }
    if (!row) return ctx.json(res, 404, { error: "attachment_not_found" });
    if (!STORAGE_KEY_PATTERN.test(row.storage_key)) return ctx.json(res, 409, { error: "document_integrity_failed" });

    let bytes;
    try {
      bytes = await fs.readFile(path.join(docsDir, "crm-interactions", row.storage_key));
    } catch {
      return ctx.json(res, 409, { error: "document_integrity_failed", reason: "missing_bytes" });
    }

    const sha = crypto.createHash("sha256").update(bytes).digest("hex");
    if (sha !== row.content_sha256 || bytes.length !== row.size_bytes) {
      await audit(db, { action: "crm_interaction_attachment_download", target: `${attachmentId}:integrity_failed`, result: "denied", actorKind: session.role, actorId: session.identityId });
      return ctx.json(res, 409, { error: "document_integrity_failed" });
    }

    await audit(db, { action: "crm_interaction_attachment_download", target: `${attachmentId}:${bytes.length}`, actorKind: session.role, actorId: session.identityId });
    res.writeHead(200, {
      "Content-Type": row.content_type || "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="${row.display_name.replace(/["\\\r\n]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    res.end(bytes);
  }

  // -------------------------------------------------- agenda de visitas
  async function handleVisits(req, res, url) {
    if (!requireMethod(req, res, ["GET", "POST"])) return;
    const session = await requireStaffSession(req, res);
    if (!session) return;
    const db = ctx.getPool();

    if (req.method === "GET") {
      const status = url.searchParams.get("status");
      const companyId = url.searchParams.get("company_id");
      const mine = url.searchParams.get("responsible") === "me";
      const from = parseDate(url.searchParams.get("from"));
      const to = parseDate(url.searchParams.get("to"));
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "100", 10) || 100));
      if (status && !["solicitada", "em_agendamento", "confirmada", "realizada", "cancelada"].includes(status)) {
        return ctx.json(res, 400, { error: "invalid_status" });
      }
      if (companyId && !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
      if (from === undefined || to === undefined) return ctx.json(res, 400, { error: "invalid_range" });

      try {
        const conditions = [];
        const values = [];
        let idx = 1;
        if (status) { conditions.push(`v.status = $${idx++}`); values.push(status); }
        if (companyId) { conditions.push(`v.company_id = $${idx++}`); values.push(companyId); }
        if (mine) { conditions.push(`v.responsible_id = $${idx++}`); values.push(session.identityId); }
        if (from) { conditions.push(`v.scheduled_at >= $${idx++}`); values.push(from); }
        if (to) { conditions.push(`v.scheduled_at <= $${idx++}`); values.push(to); }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const r = await db.query(
          `SELECT v.*, c.display_name AS company_name, o.title AS opportunity_title, ct.display_name AS contact_name
             FROM crm_visits v
             LEFT JOIN crm_companies c ON c.id = v.company_id
             LEFT JOIN crm_opportunities o ON o.id = v.opportunity_id
             LEFT JOIN crm_contacts ct ON ct.id = v.contact_id
             ${where}
            ORDER BY v.scheduled_at ASC
            LIMIT $${idx}`,
          [...values, limit]
        );
        return ctx.json(res, 200, { visits: r.rows, total: r.rows.length });
      } catch (e) {
        console.error("crm visits list failed", e?.message);
        return ctx.json(res, 503, { error: "crm_unavailable" });
      }
    }

    if (!requireSameOrigin(req, res)) return;
    let body;
    try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

    const companyId = body?.company_id || body?.companyId || null;
    if (!companyId || !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
    const title = sanitizeText(body?.title, 200);
    if (!title) return ctx.json(res, 400, { error: "invalid_title" });
    const scheduledAt = parseDate(body?.scheduled_at ?? body?.scheduledAt);
    if (scheduledAt === undefined) return ctx.json(res, 400, { error: "invalid_scheduled_at" });
    if (!scheduledAt) return ctx.json(res, 400, { error: "scheduled_at_required" });
    const opportunityId = body?.opportunity_id || body?.opportunityId || null;
    const contactId = body?.contact_id || body?.contactId || null;
    if (opportunityId && !isValidUuid(opportunityId)) return ctx.json(res, 400, { error: "invalid_opportunity_id" });
    if (contactId && !isValidUuid(contactId)) return ctx.json(res, 400, { error: "invalid_contact_id" });
    const duration = body?.duration_minutes ?? body?.durationMinutes ?? null;
    if (duration !== null && duration !== undefined && duration !== "") {
      const n = Number(duration);
      if (!Number.isInteger(n) || n < 15 || n > 480) return ctx.json(res, 400, { error: "invalid_duration_minutes" });
    }
    const notes = body?.notes ? sanitizeText(body.notes, 2000) : null;
    if (body?.notes && !notes) return ctx.json(res, 400, { error: "invalid_notes" });

    let participants = [];
    if (body?.participants !== undefined) {
      if (!Array.isArray(body.participants)) return ctx.json(res, 400, { error: "invalid_participants" });
      if (body.participants.length > 12) return ctx.json(res, 400, { error: "too_many_participants" });
      for (const p of body.participants) {
        const name = sanitizeText(p, 80);
        if (!name) return ctx.json(res, 400, { error: "invalid_participants" });
        participants.push(name);
      }
    }

    try {
      const comp = await db.query("SELECT id FROM crm_companies WHERE id = $1", [companyId]);
      if (!comp.rows[0]) return ctx.json(res, 404, { error: "company_not_found" });
      if (opportunityId) {
        const opp = await db.query("SELECT id, company_id FROM crm_opportunities WHERE id = $1", [opportunityId]);
        if (!opp.rows[0]) return ctx.json(res, 404, { error: "opportunity_not_found" });
        if (opp.rows[0].company_id !== companyId) return ctx.json(res, 409, { error: "opportunity_company_mismatch" });
      }
      const responsible = await resolveResponsible(db, body?.responsible_id ?? body?.responsibleId, session);
      if (responsible.error) return ctx.json(res, 400, { error: responsible.error });

      const id = crypto.randomUUID();
      const ins = await db.query(
        `INSERT INTO crm_visits (id, company_id, opportunity_id, contact_id, title, responsible_id, participants, scheduled_at, duration_minutes, status, notes, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,'em_agendamento',$10,$11) RETURNING *`,
        [id, companyId, opportunityId || null, contactId || null, title, responsible.id || null, JSON.stringify(participants),
         scheduledAt, duration ? Number(duration) : null, notes, session.identityId || null]
      );
      await audit(db, { action: "crm_visit_create", target: `${id}:em_agendamento`, actorKind: session.role, actorId: session.identityId });
      return ctx.json(res, 201, { visit: ins.rows[0] });
    } catch (e) {
      console.error("crm visit create failed", e?.message);
      return ctx.json(res, 503, { error: "crm_unavailable" });
    }
  }

  async function handleVisitById(req, res, id) {
    if (!requireMethod(req, res, ["GET", "PATCH"])) return;
    if (!isValidUuid(id)) return ctx.json(res, 400, { error: "invalid_id" });
    const session = await requireStaffSession(req, res);
    if (!session) return;
    const db = ctx.getPool();

    if (req.method === "GET") {
      try {
        const r = await db.query(
          `SELECT v.*, c.display_name AS company_name FROM crm_visits v
             LEFT JOIN crm_companies c ON c.id = v.company_id WHERE v.id = $1`,
          [id]
        );
        if (!r.rows[0]) return ctx.json(res, 404, { error: "visit_not_found" });
        return ctx.json(res, 200, { visit: r.rows[0] });
      } catch (e) {
        console.error("crm visit get failed", e?.message);
        return ctx.json(res, 503, { error: "crm_unavailable" });
      }
    }

    if (!requireSameOrigin(req, res)) return;
    let body;
    try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

    const action = body?.action ? String(body.action).toLowerCase() : null;
    if (!action) return ctx.json(res, 400, { error: "no_fields" });
    if (!VISIT_ACTIONS.has(action)) return ctx.json(res, 400, { error: "invalid_action" });

    try {
      const cur = await db.query("SELECT * FROM crm_visits WHERE id = $1", [id]);
      if (!cur.rows[0]) return ctx.json(res, 404, { error: "visit_not_found" });
      const visit = cur.rows[0];

      if (VISIT_TERMINAL.has(visit.status)) {
        return ctx.json(res, 409, { error: "visit_transition_invalid", current: visit.status, action });
      }

      const note = body?.note ? sanitizeText(body.note, 500) : null;
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const appendNote = (extra) => {
        const line = `[${action} por ${session.role} em ${stamp}] ${extra}`;
        return visit.notes ? `${visit.notes}\n${line}`.slice(0, 2000) : line.slice(0, 2000);
      };

      let nextStatus = visit.status;
      let scheduledAt = visit.scheduled_at;
      let auditAction = null;

      if (action === "agendar" || action === "reagendar") {
        const d = parseDate(body?.scheduled_at ?? body?.scheduledAt);
        if (d === undefined) return ctx.json(res, 400, { error: "invalid_scheduled_at" });
        if (!d) return ctx.json(res, 400, { error: "scheduled_at_required" });
        scheduledAt = d;
        nextStatus = "em_agendamento"; // reagendar exige nova confirmação
        auditAction = action === "reagendar" ? "crm_visit_reschedule" : "crm_visit_status_em_agendamento";
      } else if (action === "confirmar") {
        if (!["solicitada", "em_agendamento"].includes(visit.status)) {
          return ctx.json(res, 409, { error: "visit_transition_invalid", current: visit.status, action });
        }
        nextStatus = "confirmada";
        auditAction = "crm_visit_status_confirmada";
      } else if (action === "realizar") {
        if (visit.status !== "confirmada") {
          return ctx.json(res, 409, { error: "visit_transition_invalid", current: visit.status, action });
        }
        nextStatus = "realizada";
        auditAction = "crm_visit_status_realizada";
      } else if (action === "cancelar") {
        nextStatus = "cancelada";
        auditAction = "crm_visit_status_cancelada";
      }

      const notes = appendNote(note || (action === "reagendar" ? `novo horário ${scheduledAt.toISOString?.() || scheduledAt}` : `status ${nextStatus}`));

      const upd = await db.query(
        `UPDATE crm_visits SET status = $2, scheduled_at = $3, notes = $4, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id, nextStatus, scheduledAt, notes]
      );
      await audit(db, { action: auditAction, target: `${id}:${nextStatus}`, actorKind: session.role, actorId: session.identityId });
      return ctx.json(res, 200, { visit: upd.rows[0] });
    } catch (e) {
      console.error("crm visit update failed", e?.message);
      return ctx.json(res, 503, { error: "crm_unavailable" });
    }
  }

  // ------------------------------------------------------------ cadências
  async function handleCadences(req, res) {
    if (!requireMethod(req, res, ["GET"])) return;
    const session = await requireStaffSession(req, res);
    if (!session) return;
    return ctx.json(res, 200, {
      cadences: listCadences(),
      note: "cadência materializa tarefas para execução humana; automação de mensagens depende de autorização, opt-out e provedor — fora do escopo local",
    });
  }

  async function handleCadenceEnroll(req, res) {
    if (!requireMethod(req, res, ["POST"])) return;
    const session = await requireStaffSession(req, res);
    if (!session) return;
    if (!requireSameOrigin(req, res)) return;
    let body;
    try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

    const cadenceKey = body?.cadence_key || body?.cadenceKey || null;
    const cadence = getCadence(cadenceKey);
    if (!cadence) return ctx.json(res, 400, { error: "invalid_cadence_key" });
    const companyId = body?.company_id || body?.companyId || null;
    const opportunityId = body?.opportunity_id || body?.opportunityId || null;
    if (!companyId || !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
    if (opportunityId && !isValidUuid(opportunityId)) return ctx.json(res, 400, { error: "invalid_opportunity_id" });
    const startAt = parseDate(body?.start_at ?? body?.startAt);
    if (startAt === undefined) return ctx.json(res, 400, { error: "invalid_start_at" });
    const start = startAt || new Date();

    const db = ctx.getPool();
    const client = await db.connect();
    try {
      const comp = await client.query("SELECT id FROM crm_companies WHERE id = $1", [companyId]);
      if (!comp.rows[0]) return ctx.json(res, 404, { error: "company_not_found" });
      if (opportunityId) {
        const opp = await client.query("SELECT id, company_id FROM crm_opportunities WHERE id = $1", [opportunityId]);
        if (!opp.rows[0]) return ctx.json(res, 404, { error: "opportunity_not_found" });
        if (opp.rows[0].company_id !== companyId) return ctx.json(res, 409, { error: "opportunity_company_mismatch" });
      }

      const responsible = await resolveResponsible(client, body?.responsible_id ?? body?.responsibleId, session);
      if (responsible.error) return ctx.json(res, 400, { error: responsible.error });

      await client.query("BEGIN");
      const created = [];
      for (const step of cadence.steps) {
        const due = new Date(start.getTime() + step.offsetDays * 24 * 60 * 60 * 1000);
        const id = crypto.randomUUID();
        const description = `Passo ${step.step}/${cadence.steps.length} da cadência "${cadence.name}". ` +
          "Execução humana: não há disparo automático de mensagem (depende de autorização, opt-out e provedor).";
        const ins = await client.query(
          `INSERT INTO crm_tasks (id, opportunity_id, company_id, title, description, responsible_id, due_date, status, priority, created_by_id, cadence_key, cadence_step)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'aberta',$8,$9,$10,$11) RETURNING *`,
          [id, opportunityId || null, companyId, step.title, description, responsible.id || null, due, step.priority, session.identityId || null, cadence.key, step.step]
        );
        created.push(ins.rows[0]);
      }
      await client.query("COMMIT");

      await audit(db, { action: "crm_cadence_enroll", target: `${opportunityId || companyId}:${cadence.key}`, actorKind: session.role, actorId: session.identityId });
      return ctx.json(res, 201, { cadence: cadence.key, enrolled: created.length, tasks: created });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      if (e?.code === "23505") {
        return ctx.json(res, 409, { error: "cadence_already_enrolled", cadence: cadenceKey });
      }
      console.error("crm cadence enroll failed", e?.message);
      return ctx.json(res, 503, { error: "crm_unavailable" });
    } finally {
      client.release();
    }
  }

  // ------------------------------------------------------- carteira (CRM-10)
  async function handlePortfolio(req, res) {
    if (!requireMethod(req, res, ["GET"])) return;
    const session = await requireStaffSession(req, res);
    if (!session) return;
    const db = ctx.getPool();

    try {
      const withoutNextAction = await db.query(
        `SELECT o.id, o.title, o.stage, o.estimated_value, o.company_id, c.display_name AS company_name, o.updated_at
           FROM crm_opportunities o
           JOIN crm_companies c ON c.id = o.company_id
          WHERE o.stage NOT IN ('ganho','perdido')
            AND (o.next_action IS NULL OR btrim(o.next_action) = '')
          ORDER BY o.updated_at ASC
          LIMIT 100`
      );

      const stalled = await db.query(
        `SELECT o.id, o.title, o.stage, o.next_action, o.next_action_date, c.display_name AS company_name
           FROM crm_opportunities o
           JOIN crm_companies c ON c.id = o.company_id
          WHERE o.stage NOT IN ('ganho','perdido')
            AND o.next_action_date IS NOT NULL
            AND o.next_action_date < NOW()
          ORDER BY o.next_action_date ASC
          LIMIT 100`
      );

      let renewals = { rows: [] };
      try {
        renewals = await db.query(
          `SELECT r.id, r.title, r.type, r.status, r.renewal_date, r.new_value, c.display_name AS company_name
             FROM crm_renewals r
             JOIN crm_companies c ON c.id = r.company_id
            WHERE r.status IN ('planejada','em_negociacao','proposta_enviada')
              AND (r.renewal_date IS NULL OR r.renewal_date <= (CURRENT_DATE + INTERVAL '90 days'))
            ORDER BY r.renewal_date ASC NULLS LAST
            LIMIT 100`
        );
      } catch (e) {
        console.error("crm portfolio renewals unavailable", e?.message);
      }

      const reactivation = await db.query(
        `SELECT c.id, c.display_name, c.city, c.segment, c.updated_at
           FROM crm_companies c
          WHERE c.type = 'client' AND c.status = 'inactive'
            AND NOT EXISTS (
              SELECT 1 FROM crm_opportunities o
               WHERE o.company_id = c.id AND o.stage NOT IN ('ganho','perdido')
            )
          ORDER BY c.updated_at DESC
          LIMIT 100`
      );

      const groups = await db.query(
        `SELECT parent.id, parent.display_name, parent.type, parent.status,
                COUNT(child.id)::int AS children_count,
                COALESCE(json_agg(json_build_object('id', child.id, 'display_name', child.display_name, 'city', child.city)
                         ORDER BY child.display_name) FILTER (WHERE child.id IS NOT NULL), '[]'::json) AS children
           FROM crm_companies parent
           JOIN crm_companies child ON child.parent_company_id = parent.id
          GROUP BY parent.id, parent.display_name, parent.type, parent.status
          ORDER BY children_count DESC, parent.display_name ASC
          LIMIT 50`
      );

      const units = await db.query(
        `SELECT u.company_id, c.display_name AS company_name, COUNT(u.id)::int AS units_count
           FROM crm_company_units u
           JOIN crm_companies c ON c.id = u.company_id
          GROUP BY u.company_id, c.display_name
          ORDER BY units_count DESC
          LIMIT 50`
      );

      return ctx.json(res, 200, {
        summary: {
          opportunities_without_next_action: withoutNextAction.rows.length,
          opportunities_stalled: stalled.rows.length,
          renewals_due: renewals.rows.length,
          reactivation_candidates: reactivation.rows.length,
          company_groups: groups.rows.length,
        },
        opportunities_without_next_action: withoutNextAction.rows,
        opportunities_stalled: stalled.rows,
        renewals_due: renewals.rows,
        reactivation_candidates: reactivation.rows,
        company_groups: groups.rows,
        company_units: units.rows,
      });
    } catch (e) {
      console.error("crm portfolio failed", e?.message);
      return ctx.json(res, 503, { error: "crm_unavailable" });
    }
  }

  return {
    handleTasks,
    handleTaskById,
    handleInteractions,
    handleInteractionAttachments,
    handleInteractionAttachmentDownload,
    handleVisits,
    handleVisitById,
    handleCadences,
    handleCadenceEnroll,
    handlePortfolio,
  };
}
