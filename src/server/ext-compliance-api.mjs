// EXT-07 — API canônica interna de compliance corporativo.
// Jornada exclusiva de staff (admin|ti); sessão única via requireSession.
// Fonte canônica: ext_compliance_documents (086, endurecida por 153/154).
// Fonte da tarefa: ext_compliance_tasks (153/154).
// Fronteira: documentos canônicos são referências declaradas privadas — sem
// upload, bytes, checksum, malware scan, armazenamento verificado ou download.
import { createHash, randomUUID } from "node:crypto";

export const COMPLIANCE_BOUNDARY = Object.freeze({
  journey: "staff_interno",
  document_source: "ext_compliance_documents",
  task_source: "ext_compliance_tasks",
  external_actor: false,
  public_route: false,
  upload: false,
  stored_bytes: false,
  checksum: false,
  malware_scan: false,
  verified_storage: false,
  download: false,
  file_boundary: "referencia_declarada_nao_arquivo_verificado",
});

export const COMPLIANCE_TASK_TRANSITIONS = Object.freeze({
  aberta: ["em_andamento", "concluida", "cancelada"],
  em_andamento: ["concluida", "cancelada"],
  concluida: [],
  cancelada: [],
});

export const COMPLIANCE_DOCUMENT_TRANSITIONS = Object.freeze({
  vigente: ["vencida", "em_renovacao", "cancelada"],
  a_vencer: ["vencida", "em_renovacao", "cancelada"],
  vencida: ["em_renovacao", "cancelada"],
  em_renovacao: [],
  cancelada: [],
});

export const COMPLIANCE_TYPES = Object.freeze(["licenca", "certidao", "seguro", "alvara", "outro"]);
export const COMPLIANCE_CRITICALITIES = Object.freeze(["baixa", "media", "alta", "critica"]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BODY_LIMIT = 128 * 1024;
const STAFF_ROLES = ["admin", "ti"];

export function isIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
const text = (v, min, max) => (typeof v === "string" && v.trim().length >= min && v.trim().length <= max ? v.trim() : null);

// Stringificação canônica recursiva: o fingerprint de idempotência não pode
// depender da ordem das chaves nem perder chaves aninhadas.
function canonicalize(value) {
  if (value === null || value === undefined || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
}
const fingerprint = value => createHash("sha256").update(canonicalize(value)).digest("hex");

async function readBody(req) {
  let n = 0; const chunks = [];
  for await (const c of req) { n += c.length; if (n > BODY_LIMIT) throw Object.assign(new Error("body_too_large"), { status: 413 }); chunks.push(c); }
  if (!chunks.length) return {};
  let parsed;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("invalid_json"), { status: 400 }); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw Object.assign(new Error("object_required"), { status: 400 });
  return parsed;
}

const LIST_DOCUMENT_FIELDS = `id, protocol, title, status::text AS status, compliance_type::text AS compliance_type, obligation_id, origin, issue_date::text AS issue_date, effective_start_date::text AS effective_start_date, expiry_date::text AS expiry_date, reference_type, version_no, (superseded_by IS NULL) AS is_current, created_at, updated_at`;
const DETAIL_DOCUMENT_FIELDS = `d.id, d.protocol, d.title, d.description, d.compliance_type::text AS compliance_type, d.status::text AS status, d.document_number, d.issuer, d.obligation_id, d.responsible_identity, ri.display_name AS responsible_name, d.issue_date::text AS issue_date, d.effective_start_date::text AS effective_start_date, d.expiry_date::text AS expiry_date, d.validity_rule, d.evaluation_date::text AS evaluation_date, d.reference_type, d.declared_reference, d.reference_source, d.replacement_of, d.superseded_by, d.version_no, d.is_private, d.origin, d.renewal_justification, d.cancellation_justification, d.created_by_identity, ci.display_name AS created_by_name, d.created_at, d.updated_at`;

export function createExtComplianceApi({ pool, sameOrigin, requireSession }) {
  // Distinção explícita: anônimo 401 (com resposta), papel autenticado sem
  // autorização 403. A única fonte de login é requireSession (sessão staff).
  async function staff(req, res) {
    const s = await requireSession(req);
    if (!s) { json(res, 401, { error: "unauthorized" }); return null; }
    const role = String(s.role || s.userRole || "").toLowerCase();
    if (!STAFF_ROLES.includes(role)) { json(res, 403, { error: "forbidden" }); return null; }
    return s;
  }

  // Responsável staff canônico: identidade ativa com perfil staff autorizado.
  async function activeIdentity(client, identityId) {
    if (!UUID.test(String(identityId || ""))) return false;
    const q = await client.query(
      `SELECT i.id FROM auth_identities i
        WHERE i.id = $1 AND i.kind = 'staff' AND i.status = 'active'
          AND EXISTS (SELECT 1 FROM auth_staff_profiles p WHERE p.identity_id = i.id AND p.role IN ('admin','ti'))`,
      [identityId],
    );
    return Boolean(q.rows[0]);
  }

  // Toda mutação canônica: BEGIN → lock/revalidação → replay da chave →
  // escrita → evento imutável → audit_log → COMMIT. Falha de audit_log faz
  // rollback e responde 503, deixando entidades/eventos inalterados.
  async function mutate(req, res, s, work) {
    if (!sameOrigin(req)) return json(res, 403, { error: "forbidden" });
    const key = String(req.headers["idempotency-key"] || "").trim();
    if (key.length < 8 || key.length > 200) return json(res, 400, { error: "idempotency_key_required" });
    let b;
    try { b = await readBody(req); }
    catch (e) { return json(res, e.status || 400, { error: e.message }); }
    const fp = fingerprint(b);
    let c;
    try {
      c = await pool.connect();
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ext07:${s.identityId}:${key}`]);
      // Revalidação na transação: o autor ainda é staff ativo e autorizado.
      if (!(await activeIdentity(c, s.identityId))) {
        await c.query("ROLLBACK");
        return json(res, 403, { error: "forbidden" });
      }
      const prior = (await c.query(
        "SELECT payload, request_fingerprint FROM ext_compliance_events WHERE created_by_identity=$1 AND idempotency_key=$2",
        [s.identityId, key],
      )).rows[0];
      if (prior) {
        if (prior.request_fingerprint !== fp) {
          await c.query("ROLLBACK");
          return json(res, 409, { error: "idempotency_key_reused" });
        }
        await c.query("COMMIT");
        return json(res, 200, { ...prior.payload, replayed: true });
      }
      const out = await work(c, b);
      if (out.deny) {
        await c.query("ROLLBACK");
        return json(res, out.deny.status, out.deny.body);
      }
      await c.query(
        `INSERT INTO ext_compliance_events(obligation_id,document_id,task_id,event_type,payload,idempotency_key,request_fingerprint,created_by_identity)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [out.obligationId || null, out.documentId || null, out.taskId || null, out.eventType, JSON.stringify(out.body), key, fp, s.identityId],
      );
      try {
        await c.query("INSERT INTO audit_log(action,actor,target,meta) VALUES($1,$2,$3,$4)", [out.auditAction, s.identityId, out.target, JSON.stringify(out.auditMeta || {})]);
      } catch {
        await c.query("ROLLBACK");
        return json(res, 503, { error: "audit_unavailable" });
      }
      await c.query("COMMIT");
      return json(res, out.status || 200, out.body);
    } catch (e) {
      await c?.query("ROLLBACK").catch(() => {});
      console.error("EXT-07 mutation failed", e.message);
      return json(res, e.code === "23505" ? 409 : 503, { error: e.code === "23505" ? "conflict" : "compliance_journey_unavailable" });
    } finally {
      c?.release();
    }
  }

  async function handleDocumentList(req, res) {
    const s = await staff(req, res);
    if (!s) return;
    const q = await pool.query(`SELECT ${LIST_DOCUMENT_FIELDS} FROM ext_compliance_documents WHERE origin='ext07_canonica' ORDER BY expiry_date ASC NULLS LAST LIMIT 200`);
    return json(res, 200, {
      items: q.rows,
      source: "ext_compliance_documents",
      origin: "ext07_canonica",
      reference_model: "declared_reference_only",
      file_boundary: COMPLIANCE_BOUNDARY.file_boundary,
      denominator: q.rows.length,
      absence_is_not_zero: q.rows.length === 0,
    });
  }

  async function handleDocumentDetail(req, res, id) {
    const s = await staff(req, res);
    if (!s) return;
    const q = await pool.query(
      `SELECT ${DETAIL_DOCUMENT_FIELDS} FROM ext_compliance_documents d
        JOIN auth_identities ri ON ri.id = d.responsible_identity
        LEFT JOIN auth_identities ci ON ci.id = d.created_by_identity
       WHERE d.id = $1 AND d.origin = 'ext07_canonica'`,
      [id],
    );
    if (!q.rows[0]) return json(res, 404, { error: "document_not_found" });
    return json(res, 200, {
      document: q.rows[0],
      source: "ext_compliance_documents",
      storage_model: "reference_only_no_bytes",
      file_boundary: COMPLIANCE_BOUNDARY.file_boundary,
    });
  }

  async function handleObligationList(req, res) {
    const s = await staff(req, res);
    if (!s) return;
    const q = await pool.query(
      `SELECT o.id,o.obligation_type,o.title,o.description,o.declared_source,o.applicability_scope,o.applicability_justification,o.validity_rule,o.renewal_lead_days,o.criticality,o.status,o.responsible_identity,i.display_name AS responsible_name,o.created_by_identity,o.created_at,o.updated_at
         FROM ext_compliance_obligations o JOIN auth_identities i ON i.id = o.responsible_identity
        ORDER BY o.created_at DESC LIMIT 200`,
    );
    return json(res, 200, { items: q.rows, source: "ext_compliance_obligations", denominator: q.rows.length, absence_is_not_zero: q.rows.length === 0 });
  }

  async function handleTaskList(req, res) {
    const s = await staff(req, res);
    if (!s) return;
    const q = await pool.query(
      `SELECT t.id,t.obligation_id,o.title AS obligation_title,t.document_id,d.protocol AS document_protocol,t.validity_period,t.rule,t.evaluation_date::text AS evaluation_date,t.due_date::text AS due_date,t.facts,t.responsible_identity,i.display_name AS responsible_name,t.status,t.completion_result,t.cancellation_justification,t.created_at,t.started_at,t.completed_at,t.cancelled_at
         FROM ext_compliance_tasks t
         JOIN ext_compliance_obligations o ON o.id = t.obligation_id
         JOIN ext_compliance_documents d ON d.id = t.document_id
         LEFT JOIN auth_identities i ON i.id = t.responsible_identity
        ORDER BY t.due_date ASC LIMIT 200`,
    );
    return json(res, 200, { items: q.rows, source: "ext_compliance_tasks", denominator: q.rows.length, absence_is_not_zero: q.rows.length === 0 });
  }

  // Obrigação: autoria, estado inicial e timestamps nascem do servidor.
  async function handleCreateObligation(req, res) {
    const s = await staff(req, res);
    if (!s) return;
    return mutate(req, res, s, async (c, b) => {
      const obligationType = text(b.obligation_type, 3, 100);
      const title = text(b.title, 5, 200);
      const description = text(b.description, 10, 2000);
      const declaredSource = text(b.declared_source, 5, 1000);
      const scope = text(b.applicability_scope, 3, 500);
      const justification = text(b.applicability_justification, 10, 2000);
      const rule = text(b.validity_rule, 5, 500);
      if (!obligationType || !title || !description || !declaredSource || !scope || !justification || !rule) {
        return { deny: { status: 400, body: { error: "invalid_obligation" } } };
      }
      const criticality = b.criticality === undefined ? "media" : b.criticality;
      if (!COMPLIANCE_CRITICALITIES.includes(criticality)) return { deny: { status: 400, body: { error: "invalid_criticality" } } };
      const leadDays = b.renewal_lead_days === undefined ? 30 : b.renewal_lead_days;
      if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 3650) return { deny: { status: 400, body: { error: "invalid_renewal_lead_days" } } };
      if (!UUID.test(String(b.responsible_identity || ""))) return { deny: { status: 400, body: { error: "invalid_uuid" } } };
      if (!(await activeIdentity(c, b.responsible_identity))) return { deny: { status: 400, body: { error: "responsible_staff_required" } } };
      const r = (await c.query(
        `INSERT INTO ext_compliance_obligations(obligation_type,title,description,declared_source,applicability_scope,applicability_justification,validity_rule,renewal_lead_days,criticality,responsible_identity,created_by_identity)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [obligationType, title, description, declaredSource, scope, justification, rule, leadDays, criticality, b.responsible_identity, s.identityId],
      )).rows[0];
      return { status: 201, body: { obligation: r }, obligationId: r.id, eventType: "obligation_created", auditAction: "ext07_obligation_create", target: r.id };
    });
  }

  async function validateDocumentBody(b) {
    const title = text(b.title, 5, 200);
    const description = text(b.description, 10, 2000);
    if (!title || !description) return { error: "invalid_document" };
    const complianceType = b.compliance_type === undefined ? "outro" : b.compliance_type;
    if (!COMPLIANCE_TYPES.includes(complianceType)) return { error: "invalid_compliance_type" };
    if (b.document_number !== undefined && b.document_number !== null && !text(b.document_number, 3, 200)) return { error: "invalid_document" };
    if (b.issuer !== undefined && b.issuer !== null && !text(b.issuer, 3, 200)) return { error: "invalid_document" };
    if (!isIsoDate(b.issue_date) || !isIsoDate(b.expiry_date)) return { error: "invalid_validity" };
    const effectiveStart = b.effective_start_date === undefined || b.effective_start_date === null ? b.issue_date : b.effective_start_date;
    if (!isIsoDate(effectiveStart)) return { error: "invalid_validity" };
    if (b.expiry_date < b.issue_date || b.expiry_date < effectiveStart) return { error: "invalid_validity" };
    const referenceType = text(b.reference_type, 3, 100);
    const declaredReference = text(b.declared_reference, 3, 1000);
    if (!referenceType || !declaredReference) return { error: "private_reference_required" };
    if (b.reference_source !== undefined && b.reference_source !== null && !text(b.reference_source, 3, 500)) return { error: "private_reference_required" };
    return {
      title, description, complianceType, effectiveStart, referenceType, declaredReference,
      documentNumber: b.document_number ? text(b.document_number, 3, 200) : null,
      issuer: b.issuer ? text(b.issuer, 3, 200) : null,
      referenceSource: b.reference_source ? text(b.reference_source, 3, 500) : null,
      issueDate: b.issue_date, expiryDate: b.expiry_date,
    };
  }

  // Documento canônico: referência privada declarada. IDs, autoria, estado
  // temporal e contadores nascem do servidor; campos de arquivo do corpo são
  // descartados (fronteira: sem bytes).
  async function handleCreateDocument(req, res) {
    const s = await staff(req, res);
    if (!s) return;
    return mutate(req, res, s, async (c, b) => {
      if (!UUID.test(String(b.obligation_id || ""))) return { deny: { status: 400, body: { error: "invalid_uuid" } } };
      const o = (await c.query("SELECT * FROM ext_compliance_obligations WHERE id=$1 FOR UPDATE", [b.obligation_id])).rows[0];
      if (!o) return { deny: { status: 404, body: { error: "obligation_not_found" } } };
      if (["encerrada", "nao_aplicavel"].includes(o.status)) return { deny: { status: 409, body: { error: "obligation_not_applicable" } } };
      if (!(await activeIdentity(c, o.responsible_identity))) return { deny: { status: 409, body: { error: "responsible_staff_missing" } } };
      const v = await validateDocumentBody(b);
      if (v.error) return { deny: { status: 400, body: { error: v.error } } };
      const responsibleName = (await c.query("SELECT display_name FROM auth_identities WHERE id=$1", [o.responsible_identity])).rows[0]?.display_name || null;
      const protocol = `COMP-EXT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 4).toUpperCase()}`;
      const r = (await c.query(
        `INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,document_number,issuer,responsible_name,responsible_identity,issue_date,effective_start_date,expiry_date,validity_rule,evaluation_date,reference_type,declared_reference,reference_source,is_private,created_by_identity,obligation_id,origin,version_no)
         VALUES($1,$2,$3,$4, CASE WHEN $11::date >= CURRENT_DATE THEN 'vigente'::ext_compliance_status ELSE 'vencida'::ext_compliance_status END, $5,$6,$7,$8,$9,$10,$11,$12,CURRENT_DATE,$13,$14,$15,true,$16,$17,'ext07_canonica',1)
         RETURNING id,protocol,title,status::text AS status,obligation_id,origin,issue_date::text AS issue_date,effective_start_date::text AS effective_start_date,expiry_date::text AS expiry_date,reference_type,version_no,is_private`,
        [protocol, v.title, v.description, v.complianceType, v.documentNumber, v.issuer, responsibleName, o.responsible_identity, v.issueDate, v.effectiveStart, v.expiryDate, o.validity_rule, v.referenceType, v.declaredReference, v.referenceSource, s.identityId, o.id],
      )).rows[0];
      return {
        status: 201,
        body: { document: r, message: "Referência privada registrada; não representa arquivo armazenado, bytes, checksum ou armazenamento verificado.", file_boundary: COMPLIANCE_BOUNDARY.file_boundary },
        obligationId: o.id, documentId: r.id, eventType: "document_created", auditAction: "ext07_document_create", target: r.id,
      };
    });
  }

  // Renovação formal: novo registro vinculado à versão anterior; a anterior é
  // superada na mesma transação, sem alteração destrutiva. Histórico preservado.
  async function handleRenewDocument(req, res, id) {
    const s = await staff(req, res);
    if (!s) return;
    return mutate(req, res, s, async (c, b) => {
      const old = (await c.query(
        `SELECT d.*, o.responsible_identity AS obligation_responsible, o.status AS obligation_status, o.validity_rule AS obligation_rule
           FROM ext_compliance_documents d JOIN ext_compliance_obligations o ON o.id = d.obligation_id
          WHERE d.id = $1 AND d.origin = 'ext07_canonica' FOR UPDATE OF d, o`,
        [id],
      )).rows[0];
      if (!old) return { deny: { status: 404, body: { error: "document_not_found" } } };
      if (old.superseded_by) return { deny: { status: 409, body: { error: "already_superseded" } } };
      if (old.status === "cancelada") return { deny: { status: 409, body: { error: "terminal_document" } } };
      if (!(await activeIdentity(c, old.obligation_responsible))) return { deny: { status: 409, body: { error: "responsible_staff_missing" } } };
      const justification = text(b.renewal_justification, 10, 1000);
      if (!justification) return { deny: { status: 400, body: { error: "renewal_justification_required" } } };
      const merged = {
        title: b.title === undefined ? old.title : b.title,
        description: b.description === undefined ? old.description : b.description,
        compliance_type: b.compliance_type === undefined ? old.compliance_type : b.compliance_type,
        document_number: b.document_number === undefined ? old.document_number : b.document_number,
        issuer: b.issuer === undefined ? old.issuer : b.issuer,
        issue_date: b.issue_date,
        effective_start_date: b.effective_start_date,
        expiry_date: b.expiry_date,
        reference_type: b.reference_type === undefined ? old.reference_type : b.reference_type,
        declared_reference: b.declared_reference === undefined ? old.declared_reference : b.declared_reference,
        reference_source: b.reference_source === undefined ? old.reference_source : b.reference_source,
      };
      const v = await validateDocumentBody(merged);
      if (v.error) return { deny: { status: 400, body: { error: v.error } } };
      const future = (await c.query("SELECT ($1::date >= CURRENT_DATE) AS ok", [v.expiryDate])).rows[0].ok;
      if (!future) return { deny: { status: 400, body: { error: "renewal_requires_future_validity" } } };
      const newId = randomUUID();
      const protocol = `COMP-EXT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 4).toUpperCase()}`;
      const supersede = await c.query(
        `UPDATE ext_compliance_documents SET superseded_by=$2, status='em_renovacao' WHERE id=$1 AND superseded_by IS NULL AND status::text <> 'cancelada'`,
        [old.id, newId],
      );
      if (!supersede.rowCount) return { deny: { status: 409, body: { error: "already_superseded" } } };
      const created = (await c.query(
        `INSERT INTO ext_compliance_documents(id,protocol,title,description,compliance_type,status,document_number,issuer,responsible_name,responsible_identity,issue_date,effective_start_date,expiry_date,validity_rule,evaluation_date,reference_type,declared_reference,reference_source,is_private,created_by_identity,obligation_id,origin,version_no,replacement_of,renewal_justification)
         VALUES($1,$2,$3,$4,$5,'vigente',$6,$7,$8,$9,$10,$11,$12,$13,CURRENT_DATE,$14,$15,$16,true,$17,$18,'ext07_canonica',$19,$20,$21)
         RETURNING id,protocol,title,status::text AS status,obligation_id,origin,issue_date::text AS issue_date,effective_start_date::text AS effective_start_date,expiry_date::text AS expiry_date,reference_type,version_no,is_private`,
        [newId, protocol, v.title, v.description, v.complianceType, v.documentNumber, v.issuer, old.responsible_name, old.responsible_identity, v.issueDate, v.effectiveStart, v.expiryDate, old.obligation_rule, v.referenceType, v.declaredReference, v.referenceSource, s.identityId, old.obligation_id, old.version_no + 1, old.id, justification],
      )).rows[0];
      return {
        status: 201,
        body: { document: created, replaced_document_id: old.id, version_no: created.version_no, message: "Renovação formal: versão anterior superada sem alteração destrutiva; referência declarada não representa arquivo verificado." },
        obligationId: old.obligation_id, documentId: created.id, eventType: "document_renewed", auditAction: "ext07_document_renew", target: created.id,
        auditMeta: { replaced_document_id: old.id, version_no: created.version_no },
      };
    });
  }

  async function handleCancelDocument(req, res, id) {
    const s = await staff(req, res);
    if (!s) return;
    return mutate(req, res, s, async (c, b) => {
      const justification = text(b.cancellation_justification ?? b.justification, 10, 1000);
      if (!justification) return { deny: { status: 400, body: { error: "cancellation_justification_required" } } };
      const old = (await c.query("SELECT * FROM ext_compliance_documents WHERE id=$1 AND origin='ext07_canonica' FOR UPDATE", [id])).rows[0];
      if (!old) return { deny: { status: 404, body: { error: "document_not_found" } } };
      if (old.superseded_by) return { deny: { status: 409, body: { error: "already_superseded" } } };
      if (old.status === "cancelada") return { deny: { status: 409, body: { error: "terminal_document" } } };
      const r = (await c.query(
        `UPDATE ext_compliance_documents SET status='cancelada', cancellation_justification=$2 WHERE id=$1 AND superseded_by IS NULL AND status::text <> 'cancelada'
         RETURNING id,protocol,title,status::text AS status,obligation_id,origin,issue_date::text AS issue_date,expiry_date::text AS expiry_date,version_no,is_private`,
        [id, justification],
      )).rows[0];
      if (!r) return { deny: { status: 409, body: { error: "invalid_transition" } } };
      return { body: { document: r }, obligationId: old.obligation_id, documentId: r.id, eventType: "document_cancelled", auditAction: "ext07_document_cancel", target: r.id };
    });
  }

  // Avaliação temporal: data-base exclusivamente do servidor (PostgreSQL
  // CURRENT_DATE). O corpo não pode mover o relógio. Tarefa na mesma transação,
  // fail-closed sem responsável staff ativo, única por documento/período/regra.
  async function handleEvaluate(req, res) {
    const s = await staff(req, res);
    if (!s) return;
    return mutate(req, res, s, async (c) => {
      const today = (await c.query("SELECT CURRENT_DATE::text AS today")).rows[0].today;
      const docs = (await c.query(
        `SELECT d.id,d.obligation_id,d.status::text AS status,d.issue_date::text AS issue_date,d.effective_start_date::text AS effective_start_date,d.expiry_date::text AS expiry_date,d.validity_rule,o.responsible_identity
           FROM ext_compliance_documents d JOIN ext_compliance_obligations o ON o.id = d.obligation_id
          WHERE d.origin='ext07_canonica' AND d.superseded_by IS NULL AND d.status::text <> 'cancelada'
            AND d.expiry_date IS NOT NULL AND d.expiry_date <= CURRENT_DATE
          ORDER BY d.expiry_date ASC FOR UPDATE OF d`,
      )).rows;
      const denominator = (await c.query(
        `SELECT count(*)::int AS n FROM ext_compliance_documents WHERE origin='ext07_canonica' AND superseded_by IS NULL AND status::text <> 'cancelada'`,
      )).rows[0].n;
      let tasksCreated = 0; let transitioned = 0; const blocked = [];
      for (const d of docs) {
        const period = `${d.issue_date || d.effective_start_date}:${d.expiry_date}`;
        const rule = `expiry_at_or_before_evaluation_date; declared=${d.validity_rule}`.slice(0, 900);
        if (!(await activeIdentity(c, d.responsible_identity))) {
          blocked.push({ document_id: d.id, obligation_id: d.obligation_id, reason: "responsible_staff_inactive" });
        } else {
          const task = (await c.query(
            `INSERT INTO ext_compliance_tasks(obligation_id,document_id,validity_period,rule,evaluation_date,due_date,facts,responsible_identity,created_by_identity)
             VALUES($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7,$8)
             ON CONFLICT (document_id,validity_period,rule) DO NOTHING RETURNING id`,
            [d.obligation_id, d.id, period, rule, d.expiry_date, JSON.stringify({ expiry_date: d.expiry_date, evaluation_date: today, source: "postgresql_current_date" }), d.responsible_identity, s.identityId],
          )).rows[0];
          if (task) tasksCreated++;
        }
        if (["vigente", "a_vencer"].includes(d.status)) {
          const u = await c.query(
            `UPDATE ext_compliance_documents SET status='vencida', evaluation_date=CURRENT_DATE WHERE id=$1 AND status::text IN ('vigente','a_vencer')`,
            [d.id],
          );
          if (u.rowCount) transitioned++;
        }
      }
      const body = {
        evaluation_date: today,
        source: "postgresql_current_date",
        clock: "server_only",
        rule: "expiry_at_or_before_evaluation_date",
        documents_expired: docs.length,
        transitioned_to_vencida: transitioned,
        tasks_created: tasksCreated,
        blocked_without_responsible: blocked,
        denominator,
        absence_is_not_zero: docs.length === 0 && denominator === 0,
        scheduled_monitoring: "avaliação é operação administrativa explícita; execução agendada futura é necessária para monitoramento contínuo",
      };
      return { body, eventType: "expiry_evaluated", auditAction: "ext07_expiry_evaluate", target: s.identityId, auditMeta: { evaluation_date: today, tasks_created: tasksCreated, blocked: blocked.length } };
    });
  }

  async function handleTaskTransition(req, res, id, action) {
    const s = await staff(req, res);
    if (!s) return;
    return mutate(req, res, s, async (c, b) => {
      const t = (await c.query("SELECT * FROM ext_compliance_tasks WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!t) return { deny: { status: 404, body: { error: "task_not_found" } } };
      if (action === "start" && t.status !== "aberta") return { deny: { status: 409, body: { error: "invalid_transition" } } };
      if (action === "complete" && !COMPLIANCE_TASK_TRANSITIONS[t.status].includes("concluida")) return { deny: { status: 409, body: { error: "invalid_transition" } } };
      if (action === "cancel" && !COMPLIANCE_TASK_TRANSITIONS[t.status].includes("cancelada")) return { deny: { status: 409, body: { error: "invalid_transition" } } };
      let result = null; let justification = null;
      if (action === "complete") {
        result = text(b.result, 10, 2000);
        if (!result) return { deny: { status: 400, body: { error: "completion_result_required" } } };
        if (!(await activeIdentity(c, t.responsible_identity))) return { deny: { status: 409, body: { error: "completion_requires_responsible_and_result" } } };
      }
      if (action === "cancel") {
        justification = text(b.justification, 10, 1000);
        if (!justification) return { deny: { status: 400, body: { error: "cancellation_justification_required" } } };
      }
      const next = action === "start" ? "em_andamento" : action === "complete" ? "concluida" : "cancelada";
      const r = (await c.query(
        `UPDATE ext_compliance_tasks
            SET status=$2,
                completion_result=$3,
                cancellation_justification=$4,
                started_at=CASE WHEN $2='em_andamento' THEN NOW() ELSE started_at END,
                completed_at=CASE WHEN $2='concluida' THEN NOW() ELSE completed_at END,
                cancelled_at=CASE WHEN $2='cancelada' THEN NOW() ELSE cancelled_at END
          WHERE id=$1 RETURNING *`,
        [id, next, result, justification],
      )).rows[0];
      return { body: { task: r }, obligationId: t.obligation_id, documentId: t.document_id, taskId: id, eventType: `task_${action}`, auditAction: `ext07_task_${action}`, target: id };
    });
  }

  async function handle(req, res) {
    const p = new URL(req.url, "http://localhost").pathname;
    if (req.method !== "GET" && !sameOrigin(req)) return json(res, 403, { error: "forbidden" });
    if (req.method === "GET" && p === "/api/ext/compliance/documents") return handleDocumentList(req, res);
    if (req.method === "GET" && p === "/api/ext/compliance/obligations") return handleObligationList(req, res);
    if (req.method === "GET" && p === "/api/ext/compliance/tasks") return handleTaskList(req, res);
    if (req.method === "POST" && p === "/api/ext/compliance/obligations") return handleCreateObligation(req, res);
    if (req.method === "POST" && p === "/api/ext/compliance/documents") return handleCreateDocument(req, res);
    if (req.method === "POST" && p === "/api/ext/compliance/evaluate") return handleEvaluate(req, res);
    const docAction = p.match(/^\/api\/ext\/compliance\/documents\/([^/]+)\/(renew|cancel)$/i);
    if (docAction && req.method === "POST") {
      if (!UUID.test(docAction[1])) return json(res, 400, { error: "invalid_uuid" });
      return docAction[2].toLowerCase() === "renew" ? handleRenewDocument(req, res, docAction[1]) : handleCancelDocument(req, res, docAction[1]);
    }
    const docDetail = p.match(/^\/api\/ext\/compliance\/documents\/([^/]+)$/i);
    if (docDetail && req.method === "GET") {
      if (!UUID.test(docDetail[1])) return json(res, 400, { error: "invalid_uuid" });
      return handleDocumentDetail(req, res, docDetail[1]);
    }
    const taskAction = p.match(/^\/api\/ext\/compliance\/tasks\/([^/]+)\/(start|complete|cancel)$/i);
    if (taskAction && req.method === "POST") {
      if (!UUID.test(taskAction[1])) return json(res, 400, { error: "invalid_uuid" });
      return handleTaskTransition(req, res, taskAction[1], taskAction[2].toLowerCase());
    }
    return json(res, 404, { error: "not_found" });
  }

  return {
    handle,
    handleDocumentList,
    handleDocumentDetail,
    handleObligationList,
    handleTaskList,
    handleCreateObligation,
    handleCreateDocument,
    handleRenewDocument,
    handleCancelDocument,
    handleEvaluate,
    handleTaskTransition,
  };
}
