// CRM-07..CRM-10 — engajamento comercial sobre o schema já existente (migração 014):
//   CRM-07  tarefas (com vencidas), histórico de ligações/reuniões, anexos e notas internas
//   CRM-08  agenda de visitas com confirmação, reagendamento e cancelamento
//   CRM-09  cadências de prospecção materializadas como tarefas (sem automação de mensagem)
//   CRM-10  carteira: renovação, oportunidades sem próxima ação, reativação e grupo/unidade
//
// Regras que valem para todo o módulo:
//   - identidade do ator SEMPRE derivada da sessão (nunca do corpo da requisição);
//   - responsável pode ser outro colega, mas é validado contra staff ativo no servidor;
//   - nenhuma transição de estado aceita salto arbitrário: a matriz é explícita;
//   - anexo tem bytes fora do banco, chave de storage gerada no servidor e
//     verificação de integridade por hash no download (mesma disciplina do L02);
//   - nada aqui promete entrega/automação de mensagem: cadência é fila de trabalho humano.

import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";

import { listCadences, getCadence } from "../lib/commercial-cadences.mjs";

const TASK_STATUS = new Set(["aberta", "em_andamento", "concluida", "cancelada"]);
const TASK_PRIORITY = new Set(["baixa", "media", "alta", "critica"]);
const INTERACTION_TYPES = new Set(["ligacao", "reuniao", "email", "whatsapp", "visita", "nota", "outro"]);
const VISIT_ACTIONS = new Set(["agendar", "confirmar", "reagendar", "realizar", "cancelar"]);

// Matriz de transição de tarefa. 'cancelada' é terminal de propósito: cancelar é
// decisão deliberada; retomar trabalho abandonado deve criar tarefa nova e rastreável.
const TASK_TRANSITIONS = Object.freeze({
  aberta: new Set(["em_andamento", "cancelada"]),
  em_andamento: new Set(["concluida", "cancelada"]),
  concluida: new Set(["aberta"]),
  cancelada: new Set(),
});

// Matriz de transição de visita por ação (CRM-08).
const VISIT_TRANSITIONS = Object.freeze({
  agendar: { from: new Set(["solicitada"]), to: "em_agendamento", audit: "crm_visit_status_em_agendamento" },
  confirmar: { from: new Set(["solicitada", "em_agendamento"]), to: "confirmada", audit: "crm_visit_status_confirmada" },
  reagendar: { from: new Set(["solicitada", "em_agendamento", "confirmada"]), to: "em_agendamento", audit: "crm_visit_reschedule" },
  realizar: { from: new Set(["confirmada"]), to: "realizada", audit: "crm_visit_status_realizada" },
  cancelar: { from: new Set(["solicitada", "em_agendamento", "confirmada"]), to: "cancelada", audit: "crm_visit_status_cancelada" },
});

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ATTACHMENT_JSON_LIMIT = 7 * 1024 * 1024; // base64 de 5 MiB cabe; acima disso recusa antes de decodificar
const STORAGE_KEY_PATTERN = /^[0-9a-f]{48}$/;
const CONTENT_TYPE_PATTERN = /^[\w.+-]+\/[\w.+-]+$/;

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

function parseDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined; // undefined = inválido (distinto de "ausente")
  return d;
}

function safeFileName(name) {
  return String(name || "anexo")
    .replace(/[^\w.\- ]+/g, "_")
    .slice(0, 100) || "anexo";
}

export function createCrmEngagementApi(ctx) {
  // ctx: { json, readJson, sameOrigin, getPool, readAdminSession, docsDir }

  const attachmentsDir = () => path.join(ctx.docsDir, "crm-interactions");

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

  async function requireAdminSession(req, res) {
    const session = await ctx.readAdminSession(req);
    if (!session) {
      ctx.json(res, 401, { error: "admin_session_required" });
      return null;
    }
    return session;
  }

  // Responsável pode ser delegado, mas o servidor confere que o alvo é staff ativo.
  async function resolveResponsible(db, rawId, session) {
    if (rawId === undefined || rawId === null || rawId === "") return { id: session.identityId };
    if (!isValidUuid(rawId)) return { error: "invalid_responsible_id" };
    const r = await db.query(
      `SELECT i.id FROM auth_identities i
         JOIN auth_staff_profiles p ON p.identity_id = i.id
        WHERE i.id = $1 AND i.status = 'active'`,
      [rawId]
    );
    if (!r.rows[0]) return { error: "responsible_not_staff" };
    return { id: r.rows[0].id };
  }

  // ------------------------------------------------------------------ TAREFAS

  async function handleTasks(req, res, url) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!requireMethod(req, res, ["GET", "POST"])) return;

    const db = ctx.getPool();

    if (req.method === "GET") {
      const status = url.searchParams.get("status");
      const priority = url.searchParams.get("priority");
      const overdue = ["1", "true"].includes(url.searchParams.get("overdue") || "");
      const mine = url.searchParams.get("responsible") === "me";
      const responsibleId = url.searchParams.get("responsible_id");
      const companyId = url.searchParams.get("company_id");
      const opportunityId = url.searchParams.get("opportunity_id");
      const search = url.searchParams.get("search");
      const cadenceOnly = ["1", "true"].includes(url.searchParams.get("cadence") || "");
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
          LEFT JOIN auth_identities r ON r.id = t.responsible_id
          ${where}`;

        const countRes = await db.query(`SELECT COUNT(*)::int AS total ${base}`, values);
        const listRes = await db.query(
          `SELECT t.*, c.display_name AS company_name, o.title AS opportunity_title,
                  r.display_name AS responsible_display,
                  (t.due_date < NOW() AND t.status IN ('aberta','em_andamento')) AS is_overdue
             ${base}
            ORDER BY t.status IN ('aberta','em_andamento') DESC, t.due_date ASC NULLS LAST, t.created_at DESC
            LIMIT $${idx++} OFFSET $${idx++}`,
          [...values, limit, offset]
        );
        return ctx.json(res, 200, { tasks: listRes.rows, total: countRes.rows[0]?.total || 0, limit, offset });
      } catch (e) {
        console.error("crm tasks list failed", e?.message);
        return ctx.json(res, 503, { error: "crm_unavailable" });
      }
    }

    // POST — criar tarefa
    if (!requireSameOrigin(req, res)) return;
    let body;
    try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

    const title = sanitizeText(body?.title, 200);
    if (!title) return ctx.json(res, 400, { error: "invalid_title" });
    const description = body?.description ? sanitizeText(body.description, 2000) : null;
    if (body?.description && !description) return ctx.json(res, 400, { error: "invalid_description" });

    const priority = body?.priority ? String(body.priority).toLowerCase() : "media";
    if (!TASK_PRIORITY.has(priority)) return ctx.json(res, 400, { error: "invalid_priority" });

    const dueDate = parseDate(body?.due_date ?? body?.dueDate);
    if (dueDate === undefined) return ctx.json(res, 400, { error: "invalid_due_date" });

    const companyId = body?.company_id ?? body?.companyId ?? null;
    const opportunityId = body?.opportunity_id ?? body?.opportunityId ?? null;
    if (companyId && !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
    if (opportunityId && !isValidUuid(opportunityId)) return ctx.json(res, 400, { error: "invalid_opportunity_id" });
    if (!companyId && !opportunityId) return ctx.json(res, 400, { error: "target_required" });

    const db2 = ctx.getPool();
    try {
      // Coerência de alvo: se vierem os dois, a oportunidade tem que ser da empresa.
      let resolvedCompanyId = companyId || null;
      if (opportunityId) {
        const opp = await db2.query("SELECT id, company_id FROM crm_opportunities WHERE id = $1", [opportunityId]);
        if (!opp.rows[0]) return ctx.json(res, 404, { error: "opportunity_not_found" });
        if (companyId && opp.rows[0].company_id !== companyId) {
          return ctx.json(res, 409, { error: "opportunity_company_mismatch" });
        }
        resolvedCompanyId = opp.rows[0].company_id;
      } else {
        const comp = await db2.query("SELECT id FROM crm_companies WHERE id = $1", [companyId]);
        if (!comp.rows[0]) return ctx.json(res, 404, { error: "company_not_found" });
      }

      const responsible = await resolveResponsible(db2, body?.responsible_id ?? body?.responsibleId, session);
      if (responsible.error) return ctx.json(res, 400, { error: responsible.error });

      const id = randomUUID();
      const ins = await db2.query(
        `INSERT INTO crm_tasks (id, opportunity_id, company_id, title, description, responsible_id, due_date, priority, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [id, opportunityId || null, resolvedCompanyId, title, description, responsible.id, dueDate, priority, session.identityId]
      );
      await audit(db2, { action: "crm_task_create", target: `${id}:${priority}`, actorKind: session.role, actorId: session.identityId });
      return ctx.json(res, 201, { task: ins.rows[0] });
    } catch (e) {
      console.error("crm task create failed", e?.message);
      return ctx.json(res, 503, { error: "crm_unavailable" });
    }
  }

  async function handleTaskById(req, res, id) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!requireMethod(req, res, ["GET", "PATCH"])) return;
    if (!isValidUuid(id)) return ctx.json(res, 400, { error: "invalid_id" });

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
        console.error("crm task read failed", e?.message);
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
      let auditAction = "crm_task_update";

      if (body?.status !== undefined) {
        const target = String(body.status).toLowerCase();
        if (!TASK_STATUS.has(target)) return ctx.json(res, 400, { error: "invalid_status" });
        const allowed = TASK_TRANSITIONS[task.status] || new Set();
        if (!allowed.has(target)) {
          return ctx.json(res, 409, { error: "task_transition_invalid", current: task.status, target });
        }
        fields.push(`status = $${idx++}`);
        values.push(target);
        auditAction = `crm_task_status_${target}`;
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
        const d = parseDate(body?.due_date ?? body?.dueDate);
        if (d === undefined) return ctx.json(res, 400, { error: "invalid_due_date" });
        fields.push(`due_date = $${idx++}`); values.push(d);
      }
      if (body?.responsible_id !== undefined || body?.responsibleId !== undefined) {
        const responsible = await resolveResponsible(db, body?.responsible_id ?? body?.responsibleId, session);
        if (responsible.error) return ctx.json(res, 400, { error: responsible.error });
        fields.push(`responsible_id = $${idx++}`); values.push(responsible.id);
      }

      if (fields.length === 0) return ctx.json(res, 400, { error: "no_fields" });

      values.push(id);
      const upd = await db.query(
        `UPDATE crm_tasks SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
        values
      );
      await audit(db, { action: auditAction, target: `${id}:${task.status}`, actorKind: session.role, actorId: session.identityId });
      return ctx.json(res, 200, { task: upd.rows[0] });
    } catch (e) {
      console.error("crm task update failed", e?.message);
      return ctx.json(res, 503, { error: "crm_unavailable" });
    }
  }

  // --------------------------------------------------------------- HISTÓRICO

  async function handleInteractions(req, res, url) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!requireMethod(req, res, ["GET", "POST"])) return;

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
        const where = `WHERE ${conditions.join(" AND ")}`;
        const r = await db.query(
          `SELECT i.*, ct.display_name AS contact_name, a.display_name AS author_display,
                  (SELECT COUNT(*)::int FROM crm_interaction_attachments att WHERE att.interaction_id = i.id) AS attachment_count
             FROM crm_interactions i
             LEFT JOIN crm_contacts ct ON ct.id = i.contact_id
             LEFT JOIN auth_identities a ON a.id = i.created_by_id
             ${where}
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
    try { body = await ctx.readJson(req, 30 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

    const type = String(body?.type || "").toLowerCase();
    if (!INTERACTION_TYPES.has(type)) return ctx.json(res, 400, { error: "invalid_type" });
    const title = sanitizeText(body?.title, 200);
    if (!title) return ctx.json(res, 400, { error: "invalid_title" });
    const details = body?.details ? sanitizeText(body.details, 5000) : null;
    if (body?.details && !details) return ctx.json(res, 400, { error: "invalid_details" });

    const companyId = body?.company_id ?? body?.companyId ?? null;
    const opportunityId = body?.opportunity_id ?? body?.opportunityId ?? null;
    const contactId = body?.contact_id ?? body?.contactId ?? null;
    if (!companyId || !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
    if (opportunityId && !isValidUuid(opportunityId)) return ctx.json(res, 400, { error: "invalid_opportunity_id" });
    if (contactId && !isValidUuid(contactId)) return ctx.json(res, 400, { error: "invalid_contact_id" });

    const occurredAt = parseDate(body?.occurred_at ?? body?.occurredAt);
    if (occurredAt === undefined) return ctx.json(res, 400, { error: "invalid_occurred_at" });

    try {
      const comp = await db.query("SELECT id FROM crm_companies WHERE id = $1", [companyId]);
      if (!comp.rows[0]) return ctx.json(res, 404, { error: "company_not_found" });
      if (opportunityId) {
        const opp = await db.query("SELECT company_id FROM crm_opportunities WHERE id = $1", [opportunityId]);
        if (!opp.rows[0]) return ctx.json(res, 404, { error: "opportunity_not_found" });
        if (opp.rows[0].company_id !== companyId) return ctx.json(res, 409, { error: "opportunity_company_mismatch" });
      }
      if (contactId) {
        const ct = await db.query("SELECT company_id FROM crm_contacts WHERE id = $1", [contactId]);
        if (!ct.rows[0]) return ctx.json(res, 404, { error: "contact_not_found" });
        if (ct.rows[0].company_id !== companyId) return ctx.json(res, 409, { error: "contact_company_mismatch" });
      }

      const id = randomUUID();
      const ins = await db.query(
        `INSERT INTO crm_interactions (id, company_id, opportunity_id, contact_id, type, title, details, occurred_at, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8, NOW()),$9) RETURNING *`,
        [id, companyId, opportunityId || null, contactId || null, type, title, details, occurredAt, session.identityId]
      );
      await audit(db, { action: "crm_interaction_create", target: `${id}:${type}`, actorKind: session.role, actorId: session.identityId });
      return ctx.json(res, 201, { interaction: { ...ins.rows[0], attachment_count: 0 } });
    } catch (e) {
      console.error("crm interaction create failed", e?.message);
      return ctx.json(res, 503, { error: "crm_unavailable" });
    }
  }

  // ------------------------------------------------------------------ ANEXOS

  async function handleInteractionAttachments(req, res, interactionId) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!requireMethod(req, res, ["GET", "POST"])) return;
    if (!isValidUuid(interactionId)) return ctx.json(res, 400, { error: "invalid_id" });

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
          `SELECT id, interaction_id, display_name, content_type, size_bytes, content_sha256,
                  uploaded_by_id, uploaded_by_role, created_at
             FROM crm_interaction_attachments WHERE interaction_id = $1 ORDER BY created_at DESC`,
          [interactionId]
        );
        return ctx.json(res, 200, { attachments: r.rows, total: r.rows.length });
      } catch (e) {
        console.error("crm attachment list failed", e?.message);
        return ctx.json(res, 503, { error: "crm_unavailable" });
      }
    }

    if (!requireSameOrigin(req, res)) return;
    let body;
    try {
      body = await ctx.readJson(req, ATTACHMENT_JSON_LIMIT);
    } catch {
      return ctx.json(res, 413, { error: "attachment_too_large" });
    }

    const displayName = sanitizeText(body?.display_name ?? body?.displayName, 200);
    if (!displayName) return ctx.json(res, 400, { error: "invalid_display_name" });

    const contentType = body?.content_type ?? body?.contentType ?? null;
    if (contentType !== null && contentType !== undefined) {
      const ct = String(contentType);
      if (ct.length > 120 || !CONTENT_TYPE_PATTERN.test(ct)) return ctx.json(res, 400, { error: "invalid_content_type" });
    }

    const raw = body?.contentBase64 ?? body?.content_base64;
    if (typeof raw !== "string" || raw.length === 0) return ctx.json(res, 400, { error: "invalid_content" });

    let bytes;
    try {
      bytes = Buffer.from(raw, "base64");
    } catch {
      return ctx.json(res, 400, { error: "invalid_content" });
    }
    if (bytes.length === 0) return ctx.json(res, 400, { error: "invalid_content" });
    if (bytes.length > MAX_ATTACHMENT_BYTES) return ctx.json(res, 413, { error: "attachment_too_large" });

    const storageKey = randomBytes(24).toString("hex"); // 48 hex — chave é do servidor, nunca do cliente
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const target = path.join(attachmentsDir(), storageKey);

    try {
      await mkdir(attachmentsDir(), { recursive: true });
      await writeFile(target, bytes, { mode: 0o600 });
    } catch (e) {
      console.error("crm attachment write failed", e?.message);
      return ctx.json(res, 503, { error: "attachment_storage_unavailable" });
    }

    try {
      const id = randomUUID();
      const ins = await db.query(
        `INSERT INTO crm_interaction_attachments
           (id, interaction_id, display_name, content_type, size_bytes, content_sha256, storage_key, uploaded_by_id, uploaded_by_role)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, interaction_id, display_name, content_type, size_bytes, content_sha256, uploaded_by_id, uploaded_by_role, created_at`,
        [id, interactionId, displayName, contentType || null, bytes.length, sha256, storageKey, session.identityId, session.role || null]
      );
      await audit(db, {
        action: "crm_interaction_attachment_upload",
        target: `${id}:${bytes.length}`,
        actorKind: session.role,
        actorId: session.identityId,
      });
      return ctx.json(res, 201, { attachment: ins.rows[0] });
    } catch (e) {
      console.error("crm attachment insert failed", e?.message);
      try { await unlink(target); } catch {}
      return ctx.json(res, 503, { error: "crm_unavailable" });
    }
  }

  async function handleInteractionAttachmentDownload(req, res, attachmentId) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!requireMethod(req, res, ["GET"])) return;
    if (!isValidUuid(attachmentId)) return ctx.json(res, 400, { error: "invalid_id" });

    const db = ctx.getPool();
    let row;
    try {
      const r = await db.query(
        `SELECT a.*, i.company_id FROM crm_interaction_attachments a
           JOIN crm_interactions i ON i.id = a.interaction_id
          WHERE a.id = $1`,
        [attachmentId]
      );
      row = r.rows[0];
    } catch (e) {
      console.error("crm attachment read failed", e?.message);
      return ctx.json(res, 503, { error: "crm_unavailable" });
    }
    if (!row) return ctx.json(res, 404, { error: "attachment_not_found" });
    if (!STORAGE_KEY_PATTERN.test(row.storage_key)) return ctx.json(res, 409, { error: "attachment_storage_invalid" });

    let bytes;
    try {
      bytes = await readFile(path.join(attachmentsDir(), row.storage_key));
    } catch {
      await audit(db, { action: "crm_interaction_attachment_download", target: `${attachmentId}:missing`, result: "denied", actorKind: session.role, actorId: session.identityId });
      return ctx.json(res, 410, { error: "attachment_bytes_missing" });
    }

    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== row.content_sha256 || bytes.length !== row.size_bytes) {
      await audit(db, { action: "crm_interaction_attachment_download", target: `${attachmentId}:integrity`, result: "denied", actorKind: session.role, actorId: session.identityId });
      return ctx.json(res, 409, { error: "document_integrity_failed" });
    }

    await audit(db, { action: "crm_interaction_attachment_download", target: `${attachmentId}:${bytes.length}`, actorKind: session.role, actorId: session.identityId });

    res.writeHead(200, {
      "Content-Type": row.content_type && CONTENT_TYPE_PATTERN.test(row.content_type) ? row.content_type : "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="${safeFileName(row.display_name)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    res.end(bytes);
  }

  // ------------------------------------------------------------------ AGENDA

  async function handleVisits(req, res, url) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!requireMethod(req, res, ["GET", "POST"])) return;

    const db = ctx.getPool();

    if (req.method === "GET") {
      const status = url.searchParams.get("status");
      const mine = url.searchParams.get("responsible") === "me";
      const companyId = url.searchParams.get("company_id");
      const from = parseDate(url.searchParams.get("from"));
      const to = parseDate(url.searchParams.get("to"));
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "100", 10) || 100));

      if (status && !["solicitada", "em_agendamento", "confirmada", "realizada", "cancelada"].includes(status)) {
        return ctx.json(res, 400, { error: "invalid_status" });
      }
      if (from === undefined || to === undefined) return ctx.json(res, 400, { error: "invalid_range" });
      if (companyId && !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });

      try {
        const conditions = [];
        const values = [];
        let idx = 1;
        if (status) { conditions.push(`v.status = $${idx++}`); values.push(status); }
        if (mine) { conditions.push(`v.responsible_id = $${idx++}`); values.push(session.identityId); }
        if (companyId) { conditions.push(`v.company_id = $${idx++}`); values.push(companyId); }
        if (from) { conditions.push(`v.scheduled_at >= $${idx++}`); values.push(from); }
        if (to) { conditions.push(`v.scheduled_at <= $${idx++}`); values.push(to); }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const r = await db.query(
          `SELECT v.*, c.display_name AS company_name, o.title AS opportunity_title,
                  ct.display_name AS contact_name, resp.display_name AS responsible_display
             FROM crm_visits v
             JOIN crm_companies c ON c.id = v.company_id
             LEFT JOIN crm_opportunities o ON o.id = v.opportunity_id
             LEFT JOIN crm_contacts ct ON ct.id = v.contact_id
             LEFT JOIN auth_identities resp ON resp.id = v.responsible_id
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

    const title = sanitizeText(body?.title, 200);
    if (!title) return ctx.json(res, 400, { error: "invalid_title" });

    const companyId = body?.company_id ?? body?.companyId ?? null;
    if (!companyId || !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
    const opportunityId = body?.opportunity_id ?? body?.opportunityId ?? null;
    if (opportunityId && !isValidUuid(opportunityId)) return ctx.json(res, 400, { error: "invalid_opportunity_id" });
    const contactId = body?.contact_id ?? body?.contactId ?? null;
    if (contactId && !isValidUuid(contactId)) return ctx.json(res, 400, { error: "invalid_contact_id" });

    const scheduledAt = parseDate(body?.scheduled_at ?? body?.scheduledAt);
    if (scheduledAt === undefined || scheduledAt === null) return ctx.json(res, 400, { error: "invalid_scheduled_at" });

    let duration = body?.duration_minutes ?? body?.durationMinutes ?? null;
    if (duration !== null && duration !== undefined && duration !== "") {
      duration = Number(duration);
      if (!Number.isInteger(duration) || duration < 15 || duration > 480) return ctx.json(res, 400, { error: "invalid_duration" });
    } else {
      duration = null;
    }

    const notes = body?.notes ? sanitizeText(body.notes, 2000) : null;
    if (body?.notes && !notes) return ctx.json(res, 400, { error: "invalid_notes" });

    let participants = [];
    if (body?.participants !== undefined) {
      if (!Array.isArray(body.participants)) return ctx.json(res, 400, { error: "invalid_participants" });
      if (body.participants.length > 12) return ctx.json(res, 400, { error: "invalid_participants" });
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
        const opp = await db.query("SELECT company_id FROM crm_opportunities WHERE id = $1", [opportunityId]);
        if (!opp.rows[0]) return ctx.json(res, 404, { error: "opportunity_not_found" });
        if (opp.rows[0].company_id !== companyId) return ctx.json(res, 409, { error: "opportunity_company_mismatch" });
      }
      if (contactId) {
        const ct = await db.query("SELECT company_id FROM crm_contacts WHERE id = $1", [contactId]);
        if (!ct.rows[0]) return ctx.json(res, 404, { error: "contact_not_found" });
        if (ct.rows[0].company_id !== companyId) return ctx.json(res, 409, { error: "contact_company_mismatch" });
      }

      const responsible = await resolveResponsible(db, body?.responsible_id ?? body?.responsibleId, session);
      if (responsible.error) return ctx.json(res, 400, { error: responsible.error });

      const id = randomUUID();
      const ins = await db.query(
        `INSERT INTO crm_visits (id, company_id, opportunity_id, contact_id, title, responsible_id, participants, scheduled_at, duration_minutes, status, notes, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,'em_agendamento',$10,$11) RETURNING *`,
        [id, companyId, opportunityId || null, contactId || null, title, responsible.id, JSON.stringify(participants), scheduledAt, duration, notes, session.identityId]
      );
      await audit(db, { action: "crm_visit_create", target: `${id}:em_agendamento`, actorKind: session.role, actorId: session.identityId });
      return ctx.json(res, 201, { visit: ins.rows[0] });
    } catch (e) {
      console.error("crm visit create failed", e?.message);
      return ctx.json(res, 503, { error: "crm_unavailable" });
    }
  }

  async function handleVisitById(req, res, id) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!requireMethod(req, res, ["GET", "PATCH"])) return;
    if (!isValidUuid(id)) return ctx.json(res, 400, { error: "invalid_id" });

    const db = ctx.getPool();

    if (req.method === "GET") {
      try {
        const r = await db.query(
          `SELECT v.*, c.display_name AS company_name FROM crm_visits v
             JOIN crm_companies c ON c.id = v.company_id WHERE v.id = $1`,
          [id]
        );
        if (!r.rows[0]) return ctx.json(res, 404, { error: "visit_not_found" });
        return ctx.json(res, 200, { visit: r.rows[0] });
      } catch (e) {
        console.error("crm visit read failed", e?.message);
        return ctx.json(res, 503, { error: "crm_unavailable" });
      }
    }

    if (!requireSameOrigin(req, res)) return;
    let body;
    try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

    const action = String(body?.action || "").toLowerCase();
    if (!VISIT_ACTIONS.has(action)) return ctx.json(res, 400, { error: "invalid_action" });

    const rule = VISIT_TRANSITIONS[action];
    const newScheduledAt = parseDate(body?.scheduled_at ?? body?.scheduledAt);
    if (newScheduledAt === undefined) return ctx.json(res, 400, { error: "invalid_scheduled_at" });
    if ((action === "agendar" || action === "reagendar") && !newScheduledAt) {
      return ctx.json(res, 400, { error: "scheduled_at_required" });
    }

    const reason = body?.reason ? sanitizeText(body.reason, 500) : null;
    if (body?.reason && !reason) return ctx.json(res, 400, { error: "invalid_reason" });

    try {
      const cur = await db.query("SELECT * FROM crm_visits WHERE id = $1", [id]);
      if (!cur.rows[0]) return ctx.json(res, 404, { error: "visit_not_found" });
      const visit = cur.rows[0];

      if (!rule.from.has(visit.status)) {
        return ctx.json(res, 409, { error: "visit_transition_invalid", current: visit.status, action });
      }

      // O rastro de reagendamento/cancelamento fica na própria visita, não só na auditoria:
      // quem abre a agenda precisa ver que houve mudança e por quê.
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const noteLine = action === "reagendar"
        ? `[reagendar ${stamp}] de ${new Date(visit.scheduled_at).toISOString()} para ${newScheduledAt.toISOString()}${reason ? ` — ${reason}` : ""}`
        : reason
          ? `[${action} ${stamp}] ${reason}`
          : null;
      const notes = noteLine ? [visit.notes, noteLine].filter(Boolean).join("\n").slice(0, 2000) : visit.notes;

      const upd = await db.query(
        `UPDATE crm_visits
            SET status = $2,
                scheduled_at = COALESCE($3, scheduled_at),
                notes = $4,
                updated_at = NOW()
          WHERE id = $1 RETURNING *`,
        [id, rule.to, newScheduledAt || null, notes]
      );
      await audit(db, { action: rule.audit, target: `${id}:${visit.status}->${rule.to}`, actorKind: session.role, actorId: session.identityId });
      return ctx.json(res, 200, { visit: upd.rows[0] });
    } catch (e) {
      console.error("crm visit update failed", e?.message);
      return ctx.json(res, 503, { error: "crm_unavailable" });
    }
  }

  // --------------------------------------------------------------- CADÊNCIAS

  async function handleCadences(req, res) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!requireMethod(req, res, ["GET"])) return;
    return ctx.json(res, 200, {
      cadences: listCadences(),
      note: "cadência é fila de tarefas humanas; automação de mensagem exigiria autorização, opt-out e provedor — fora do escopo local",
    });
  }

  async function handleCadenceEnroll(req, res) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!requireMethod(req, res, ["POST"])) return;
    if (!requireSameOrigin(req, res)) return;

    let body;
    try { body = await ctx.readJson(req, 15 * 1024); } catch { return ctx.json(res, 400, { error: "invalid_request" }); }

    const cadence = getCadence(body?.cadence_key ?? body?.cadenceKey);
    if (!cadence) return ctx.json(res, 400, { error: "invalid_cadence_key" });

    const companyId = body?.company_id ?? body?.companyId ?? null;
    const opportunityId = body?.opportunity_id ?? body?.opportunityId ?? null;
    if (!companyId || !isValidUuid(companyId)) return ctx.json(res, 400, { error: "invalid_company_id" });
    if (opportunityId && !isValidUuid(opportunityId)) return ctx.json(res, 400, { error: "invalid_opportunity_id" });

    const startAt = parseDate(body?.start_at ?? body?.startAt) || new Date();
    if (startAt === undefined) return ctx.json(res, 400, { error: "invalid_start_at" });

    const db = ctx.getPool();
    const client = await db.connect();
    try {
      const comp = await client.query("SELECT id FROM crm_companies WHERE id = $1", [companyId]);
      if (!comp.rows[0]) return ctx.json(res, 404, { error: "company_not_found" });
      if (opportunityId) {
        const opp = await client.query("SELECT company_id FROM crm_opportunities WHERE id = $1", [opportunityId]);
        if (!opp.rows[0]) return ctx.json(res, 404, { error: "opportunity_not_found" });
        if (opp.rows[0].company_id !== companyId) return ctx.json(res, 409, { error: "opportunity_company_mismatch" });
      }

      const responsible = await resolveResponsible(client, body?.responsible_id ?? body?.responsibleId, session);
      if (responsible.error) return ctx.json(res, 400, { error: responsible.error });

      const existing = opportunityId
        ? await client.query("SELECT 1 FROM crm_tasks WHERE opportunity_id = $1 AND cadence_key = $2 LIMIT 1", [opportunityId, cadence.key])
        : await client.query("SELECT 1 FROM crm_tasks WHERE company_id = $1 AND opportunity_id IS NULL AND cadence_key = $2 LIMIT 1", [companyId, cadence.key]);
      if (existing.rows[0]) return ctx.json(res, 409, { error: "cadence_already_enrolled" });

      await client.query("BEGIN");
      const created = [];
      for (const step of cadence.steps) {
        const due = new Date(startAt.getTime() + step.offsetDays * 24 * 60 * 60 * 1000);
        const taskId = randomUUID();
        const description =
          `Passo ${step.step}/${cadence.steps.length} da cadência "${cadence.name}". ` +
          "Execução humana: nenhuma mensagem é disparada automaticamente por este sistema.";
        const ins = await client.query(
          `INSERT INTO crm_tasks (id, opportunity_id, company_id, title, description, responsible_id, due_date, priority, created_by_id, cadence_key, cadence_step)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [taskId, opportunityId || null, companyId, step.title, description, responsible.id, due, step.priority, session.identityId, cadence.key, step.step]
        );
        created.push(ins.rows[0]);
      }
      await client.query("COMMIT");

      await audit(db, {
        action: "crm_cadence_enroll",
        target: `${opportunityId || companyId}:${cadence.key}:${created.length}`,
        actorKind: session.role,
        actorId: session.identityId,
      });
      return ctx.json(res, 201, { cadence: cadence.key, enrolled: created.length, tasks: created });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      if (e?.code === "23505") return ctx.json(res, 409, { error: "cadence_already_enrolled" });
      console.error("crm cadence enroll failed", e?.message);
      return ctx.json(res, 503, { error: "crm_unavailable" });
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------- CARTEIRA

  async function handlePortfolio(req, res) {
    const session = await requireAdminSession(req, res);
    if (!session) return;
    if (!requireMethod(req, res, ["GET"])) return;

    const db = ctx.getPool();
    try {
      const withoutNextAction = await db.query(
        `SELECT o.id, o.title, o.stage, o.estimated_value, o.updated_at, c.display_name AS company_name, c.id AS company_id
           FROM crm_opportunities o
           JOIN crm_companies c ON c.id = o.company_id
          WHERE o.is_won = false AND o.is_lost = false
            AND (o.next_action IS NULL OR btrim(o.next_action) = '')
          ORDER BY o.updated_at ASC
          LIMIT 100`
      );

      const stalled = await db.query(
        `SELECT o.id, o.title, o.stage, o.next_action, o.next_action_date, c.display_name AS company_name
           FROM crm_opportunities o
           JOIN crm_companies c ON c.id = o.company_id
          WHERE o.is_won = false AND o.is_lost = false
            AND o.next_action_date IS NOT NULL AND o.next_action_date < NOW()
          ORDER BY o.next_action_date ASC
          LIMIT 100`
      );

      const renewals = await db.query(
        `SELECT r.id, r.title, r.type::text AS type, r.status::text AS status, r.renewal_date,
                r.previous_value, r.new_value, c.display_name AS company_name
           FROM crm_renewals r
           JOIN crm_companies c ON c.id = r.company_id
          WHERE r.status IN ('planejada','em_negociacao','proposta_enviada')
            AND (r.renewal_date IS NULL OR r.renewal_date <= CURRENT_DATE + INTERVAL '90 days')
          ORDER BY r.renewal_date ASC NULLS LAST
          LIMIT 100`
      );

      // Reativação: cliente inativo que não tem nenhuma oportunidade aberta.
      const reactivation = await db.query(
        `SELECT c.id, c.display_name, c.city, c.segment, c.updated_at
           FROM crm_companies c
          WHERE c.type = 'client' AND c.status = 'inactive'
            AND NOT EXISTS (
              SELECT 1 FROM crm_opportunities o
               WHERE o.company_id = c.id AND o.is_won = false AND o.is_lost = false
            )
          ORDER BY c.updated_at ASC
          LIMIT 100`
      );

      // Relacionamento por grupo/unidade: matriz com filhas e unidades.
      const groups = await db.query(
        `SELECT p.id, p.display_name, p.type, p.status,
                (SELECT COUNT(*)::int FROM crm_companies ch WHERE ch.parent_company_id = p.id) AS children_count,
                (SELECT COUNT(*)::int FROM crm_company_units u WHERE u.company_id = p.id) AS units_count,
                COALESCE(
                  (SELECT json_agg(json_build_object('id', ch.id, 'display_name', ch.display_name, 'type', ch.type) ORDER BY ch.display_name)
                     FROM crm_companies ch WHERE ch.parent_company_id = p.id),
                  '[]'::json
                ) AS children
           FROM crm_companies p
          WHERE EXISTS (SELECT 1 FROM crm_companies ch WHERE ch.parent_company_id = p.id)
             OR EXISTS (SELECT 1 FROM crm_company_units u WHERE u.company_id = p.id)
          ORDER BY p.display_name ASC
          LIMIT 100`
      );

      const openReferrals = await db.query(
        `SELECT COUNT(*)::int AS total FROM crm_referrals WHERE status IN ('registrada','em_contato','qualificada')`
      ).catch(() => ({ rows: [{ total: 0 }] }));

      return ctx.json(res, 200, {
        summary: {
          without_next_action: withoutNextAction.rows.length,
          stalled: stalled.rows.length,
          renewals_due: renewals.rows.length,
          reactivation_candidates: reactivation.rows.length,
          company_groups: groups.rows.length,
          open_referrals: openReferrals.rows[0]?.total || 0,
        },
        opportunities_without_next_action: withoutNextAction.rows,
        opportunities_stalled: stalled.rows,
        renewals_due: renewals.rows,
        reactivation_candidates: reactivation.rows,
        company_groups: groups.rows,
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
