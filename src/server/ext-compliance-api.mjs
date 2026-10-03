// EXT-07 — API canônica interna de compliance corporativo.
// Jornada exclusiva de staff (admin|ti); nenhum ator externo, portal público,
// integração regulatória, upload, bytes, checksum, malware scan, armazenamento
// verificado ou download. Documentos canônicos são REFERÊNCIAS privadas
// declaradas, versionadas por cadeia (renovação = registro novo, nunca
// sobrescrita). Tarefas nascem somente da avaliação temporal na data do
// servidor PostgreSQL, falham fechado sem responsável staff ativo e são
// únicas por documento/período/regra.
import { createHash, randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BODY_LIMIT = 128 * 1024;
const CRITICALITIES = ["baixa", "media", "alta", "critica"];
const COMPLIANCE_TYPES = ["licenca", "certidao", "seguro", "alvara", "outro"];
const STAFF_ROLES = ["admin", "ti"];

// Fronteira declarada: nada além de referência privada declarada.
export const COMPLIANCE_BOUNDARY = Object.freeze({
  journey: "staff_interno",
  external_actor: false,
  upload: false,
  verified_storage: false,
  checksum: false,
  malware_scan: false,
  download: false,
  file_boundary: "referencia_declarada_nao_arquivo_verificado",
});
export const TASK_TRANSITIONS = Object.freeze({
  aberta: ["em_andamento", "concluida", "cancelada"],
  em_andamento: ["concluida", "cancelada"],
  concluida: [],
  cancelada: [],
});
export const DOC_TRANSITIONS = Object.freeze({
  vigente: ["a_vencer", "vencida", "cancelada"],
  a_vencer: ["vencida", "cancelada"],
  vencida: ["em_renovacao", "cancelada"],
  em_renovacao: ["vencida", "cancelada"],
  cancelada: [],
});

const json = (res, status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };

// Fingerprint canônico e profundo: ordena chaves em TODOS os níveis (a versão
// anterior usava o replacer de chaves de topo e colidia em objetos aninhados).
export function stableFingerprint(value) {
  const canon = (v) => {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`;
  };
  return createHash("sha256").update(canon(value)).digest("hex");
}

export function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
const addDaysIso = (isoDate, days) => { const d = new Date(`${isoDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
export const toDateIso = (value) => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
};

async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw Object.assign(new Error("body_too_large"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  let parsed;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("invalid_json"), { status: 400 }); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw Object.assign(new Error("object_required"), { status: 400 });
  return parsed;
}
const text = (v, min, max) => typeof v === "string" && v.trim().length >= min && v.trim().length <= max ? v.trim() : null;
const maskNumber = (v) => { const s = String(v || ""); return s ? `…${s.slice(-4)}` : null; };

export function createExtComplianceApi({ pool, sameOrigin, requireSession }) {
  async function staffSession(req, res) {
    const session = await requireSession(req);
    if (!session) { json(res, 401, { error: "unauthorized" }); return null; }
    const role = String(session.role || session.userRole || "").toLowerCase();
    if (!STAFF_ROLES.includes(role)) { json(res, 403, { error: "forbidden" }); return null; }
    return session;
  }
  async function activeCanonicalResponsible(client, identityId) {
    if (!UUID.test(String(identityId || ""))) return null;
    const q = await client.query(
      `SELECT i.id, i.display_name FROM auth_identities i
        WHERE i.id = $1 AND i.kind = 'staff' AND i.status = 'active'
          AND EXISTS (SELECT 1 FROM auth_staff_profiles p WHERE p.identity_id = i.id AND p.role IN ('admin','ti'))`,
      [identityId]);
    return q.rows[0] || null;
  }

  // Toda mutação canônica: BEGIN → lock/revalidação → replay da chave →
  // escrita da entidade → (tarefa) → evento imutável → audit_log → COMMIT.
  // Falha de audit_log: ROLLBACK + 503 sem deixar estado escrito.
  async function mutate(req, res, session, work) {
    if (!sameOrigin(req)) return json(res, 403, { error: "forbidden" });
    const key = String(req.headers["idempotency-key"] || "").trim();
    if (key.length < 8 || key.length > 200) return json(res, 400, { error: "idempotency_key_required" });
    let input;
    try { input = await readBody(req); }
    catch (e) { return json(res, e.status || 400, { error: e.message }); }
    const fingerprint = stableFingerprint(input);
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ext07:${session.identityId}:${key}`]);
      const replayCheck = await client.query(
        "SELECT request_fingerprint, payload FROM ext_compliance_events WHERE created_by_identity = $1 AND idempotency_key = $2",
        [session.identityId, key]);
      const prior = replayCheck.rows[0];
      if (prior) {
        if (prior.request_fingerprint !== fingerprint) {
          await client.query("ROLLBACK");
          return json(res, 409, { error: "idempotency_key_reused" });
        }
        await client.query("COMMIT");
        return json(res, 200, { ...prior.payload, replayed: true });
      }
      const out = await work(client, input);
      if (out.deny) {
        await client.query("ROLLBACK");
        return json(res, out.deny.status, out.deny.body);
      }
      await client.query(
        `INSERT INTO ext_compliance_events(obligation_id,document_id,task_id,event_type,payload,idempotency_key,request_fingerprint,created_by_identity)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [out.obligationId || null, out.documentId || null, out.taskId || null, out.eventType, JSON.stringify(out.body), key, fingerprint, session.identityId]);
      try {
        await client.query("INSERT INTO audit_log(action,actor,target,meta) VALUES($1,$2,$3,$4)",
          [out.auditAction, session.identityId, out.target, JSON.stringify(out.auditMeta || {})]);
      } catch {
        await client.query("ROLLBACK");
        return json(res, 503, { error: "audit_unavailable" });
      }
      await client.query("COMMIT");
      return json(res, out.status || 200, out.body);
    } catch (e) {
      await client?.query("ROLLBACK").catch(() => {});
      console.error("EXT-07 mutation failed:", e.message);
      return json(res, e.code === "23505" ? 409 : 503, { error: e.code === "23505" ? "conflict" : "compliance_journey_unavailable" });
    } finally { client?.release(); }
  }

  const serverDate = async (client) => (await client.query("SELECT CURRENT_DATE::text AS today")).rows[0].today;

  // ---------- consultas (somente leitura, projeção minimizada) ----------
  async function listObligations(req, res) {
    const q = await pool.query(
      `SELECT o.id,o.obligation_type,o.title,o.description,o.declared_source,o.applicability_scope,
              o.applicability_justification,o.validity_rule,o.renewal_lead_days,o.criticality,o.status,
              o.responsible_identity,i.display_name AS responsible_name
         FROM ext_compliance_obligations o
         JOIN auth_identities i ON i.id = o.responsible_identity
        ORDER BY o.created_at DESC LIMIT 200`);
    return json(res, 200, {
      items: q.rows, source: "ext07_canonica", period: null,
      denominator: q.rows.length, absence_is_not_zero: q.rows.length === 0,
    });
  }

  async function obligationDetail(req, res, id) {
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_obligation" });
    const o = (await pool.query(
      `SELECT o.id,o.obligation_type,o.title,o.description,o.declared_source,o.applicability_scope,
              o.applicability_justification,o.validity_rule,o.renewal_lead_days,o.criticality,o.status,
              o.responsible_identity,i.display_name AS responsible_name,o.created_by_identity,o.created_at,o.updated_at
         FROM ext_compliance_obligations o JOIN auth_identities i ON i.id = o.responsible_identity WHERE o.id = $1`, [id])).rows[0];
    if (!o) return json(res, 404, { error: "obligation_not_found" });
    const current = (await pool.query(
      `SELECT d.id,d.protocol,d.status,d.expiry_date,d.version_no FROM ext_compliance_documents d
        WHERE d.obligation_id = $1 AND d.origin = 'ext07_canonica'
          AND NOT EXISTS (SELECT 1 FROM ext_compliance_documents s WHERE s.replacement_of = d.id)
        LIMIT 1`, [id])).rows[0] || null;
    const tasks = await pool.query(
      `SELECT count(*)::int AS open_tasks FROM ext_compliance_tasks WHERE obligation_id = $1 AND status IN ('aberta','em_andamento')`, [id]);
    return json(res, 200, { obligation: o, current_document: current, open_tasks: tasks.rows[0].open_tasks, source: "ext07_canonica" });
  }

  const DOC_COLUMNS = `id,protocol,title,description,compliance_type,status,obligation_id,origin,
    effective_start_date,issue_date,expiry_date,validity_rule,evaluation_date,
    reference_type,version_no,replacement_of,is_private,created_at,updated_at`;
  async function listDocuments(req, res) {
    const q = await pool.query(
      `SELECT ${DOC_COLUMNS} FROM ext_compliance_documents d
        WHERE d.origin = 'ext07_canonica'
          AND NOT EXISTS (SELECT 1 FROM ext_compliance_documents s WHERE s.replacement_of = d.id)
        ORDER BY d.expiry_date ASC LIMIT 200`);
    return json(res, 200, {
      items: q.rows, source: "ext07_canonica", file_boundary: COMPLIANCE_BOUNDARY.file_boundary,
      denominator: q.rows.length, absence_is_not_zero: q.rows.length === 0,
    });
  }

  async function documentDetail(req, res, id) {
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_document" });
    const row = (await pool.query(
      `SELECT ${DOC_COLUMNS}, document_number, issuer, responsible_identity, created_by_identity, declared_reference
         FROM ext_compliance_documents WHERE id = $1 AND origin = 'ext07_canonica'`, [id])).rows[0];
    if (!row) return json(res, 404, { error: "document_not_found" });
    const successor = (await pool.query(
      "SELECT id, protocol FROM ext_compliance_documents WHERE replacement_of = $1", [id])).rows[0] || null;
    const predecessor = row.replacement_of
      ? (await pool.query("SELECT id, protocol FROM ext_compliance_documents WHERE id = $1", [row.replacement_of])).rows[0] || null
      : null;
    const { document_number, declared_reference, ...rest } = row;
    return json(res, 200, {
      document: {
        ...rest,
        issuer: row.issuer,
        responsible_identity: row.responsible_identity,
        created_by_identity: row.created_by_identity,
        reference: { type: row.reference_type, declared: true, is_file: false },
        document_number_masked: maskNumber(document_number),
        successor, predecessor,
      },
      file_boundary: COMPLIANCE_BOUNDARY.file_boundary,
      source: "ext07_canonica",
    });
  }

  async function listTasks(req, res, query) {
    const params = []; let where = "";
    if (query.get("obligation_id")) {
      if (!UUID.test(query.get("obligation_id"))) return json(res, 400, { error: "invalid_obligation" });
      params.push(query.get("obligation_id"));
      where = "WHERE t.obligation_id = $1";
    }
    const q = await pool.query(
      `SELECT t.id,t.obligation_id,t.document_id,t.validity_period,t.rule,t.evaluation_date,t.due_date,t.facts,
              t.status,t.responsible_identity,i.display_name AS responsible_name,
              t.completion_result,t.cancellation_justification,t.created_at,t.started_at,t.completed_at,t.cancelled_at
         FROM ext_compliance_tasks t
         LEFT JOIN auth_identities i ON i.id = t.responsible_identity
        ${where} ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC LIMIT 200`, params);
    return json(res, 200, {
      items: q.rows, source: "ext_compliance_tasks", rule: "expiry_at_or_before_evaluation_date",
      denominator: q.rows.length, absence_is_not_zero: q.rows.length === 0,
    });
  }

  async function listEvents(req, res, query) {
    const clauses = []; const params = [];
    for (const [param, column] of [["obligation_id", "obligation_id"], ["document_id", "document_id"], ["task_id", "task_id"]]) {
      const value = query.get(param);
      if (!value) continue;
      if (!UUID.test(value)) return json(res, 400, { error: `invalid_${param}` });
      params.push(value); clauses.push(`e.${column} = $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const q = await pool.query(
      `SELECT e.id,e.event_type,e.obligation_id,e.document_id,e.task_id,e.created_by_identity,e.created_at
         FROM ext_compliance_events e ${where} ORDER BY e.created_at DESC LIMIT 200`, params);
    return json(res, 200, { items: q.rows, source: "ext_compliance_events", immutable: true, denominator: q.rows.length });
  }

  // ---------- mutações ----------
  async function createObligation(req, res, session) {
    return mutate(req, res, session, async (client, input) => {
      const type = text(input.obligation_type, 3, 100);
      const title = text(input.title, 5, 200);
      const description = text(input.description, 10, 2000);
      const source = text(input.declared_source, 5, 1000);
      const scope = text(input.applicability_scope, 3, 500);
      const justification = text(input.applicability_justification, 10, 2000);
      const rule = text(input.validity_rule, 5, 500);
      if (!type || !title || !description || !source || !scope || !justification || !rule) {
        return { deny: { status: 400, body: { error: "invalid_obligation" } } };
      }
      const responsible = await activeCanonicalResponsible(client, input.responsible_identity);
      if (!responsible) return { deny: { status: 400, body: { error: "responsible_staff_required" } } };
      const criticality = CRITICALITIES.includes(input.criticality) ? input.criticality : "media";
      const lead = Number.isInteger(input.renewal_lead_days) ? input.renewal_lead_days : 30;
      const r = (await client.query(
        `INSERT INTO ext_compliance_obligations(obligation_type,title,description,declared_source,applicability_scope,
           applicability_justification,validity_rule,renewal_lead_days,criticality,responsible_identity,created_by_identity)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [type, title, description, source, scope, justification, rule, lead, criticality, responsible.id, session.identityId])).rows[0];
      return {
        status: 201, body: { obligation: r, source: "ext07_canonica" },
        obligationId: r.id, eventType: "obligation_created",
        auditAction: "ext07_obligation_create", target: r.id, auditMeta: { obligation_type: type, criticality },
      };
    });
  }

  function readValidity(input, today) {
    const issue = text(input.issue_date, 10, 10);
    const effective = input.effective_start_date ? text(input.effective_start_date, 10, 10) : null;
    const expiry = text(input.expiry_date, 10, 10);
    if (!isIsoDate(issue) || !isIsoDate(expiry)) return { error: "invalid_validity" };
    const effectiveStart = effective ? (isIsoDate(effective) ? effective : null) : issue;
    if (!effectiveStart) return { error: "invalid_validity" };
    if (expiry < issue || expiry < effectiveStart) return { error: "invalid_validity" };
    if (expiry < today) return { error: "expired_validity" };
    return { issue, effectiveStart, expiry };
  }

  async function createDocument(req, res, session) {
    return mutate(req, res, session, async (client, input) => {
      if (!UUID.test(String(input.obligation_id || ""))) return { deny: { status: 400, body: { error: "invalid_obligation" } } };
      const obligation = (await client.query("SELECT * FROM ext_compliance_obligations WHERE id = $1 FOR UPDATE", [input.obligation_id])).rows[0];
      if (!obligation) return { deny: { status: 404, body: { error: "obligation_not_found" } } };
      const responsible = await activeCanonicalResponsible(client, obligation.responsible_identity);
      if (!responsible) return { deny: { status: 409, body: { error: "responsible_staff_missing" } } };
      const existingRoot = (await client.query(
        "SELECT id FROM ext_compliance_documents d WHERE d.obligation_id = $1 AND d.origin = 'ext07_canonica' AND d.replacement_of IS NULL AND d.status::text <> 'cancelada' LIMIT 1",
        [obligation.id])).rows[0];
      if (existingRoot) return { deny: { status: 409, body: { error: "chain_exists_use_renew" } } };
      const today = await serverDate(client);
      const validity = readValidity(input, today);
      if (validity.error) return { deny: { status: 400, body: { error: validity.error } } };
      const title = text(input.title, 5, 200);
      const description = text(input.description, 10, 2000);
      const referenceType = text(input.reference_type, 3, 100);
      const declaredReference = text(input.declared_reference, 3, 1000);
      const referenceSource = input.reference_source ? text(input.reference_source, 3, 500) : null;
      const documentNumber = input.document_number ? text(input.document_number, 3, 200) : null;
      const issuer = input.issuer ? text(input.issuer, 3, 200) : null;
      const complianceType = COMPLIANCE_TYPES.includes(input.compliance_type) ? input.compliance_type : null;
      if (!title || !description || !referenceType || !declaredReference || !complianceType) {
        return { deny: { status: 400, body: { error: "invalid_document" } } };
      }
      const protocol = `COMP-EXT-${today.replaceAll("-", "")}-${randomUUID().slice(0, 4).toUpperCase()}`;
      const r = (await client.query(
        `INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,document_number,issuer,
           responsible_name,responsible_identity,issue_date,effective_start_date,expiry_date,validity_rule,evaluation_date,
           reference_type,declared_reference,reference_source,is_private,created_by_identity,obligation_id,origin,version_no)
         VALUES($1,$2,$3,$4,'vigente',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,$17,$18,'ext07_canonica',1)
         RETURNING ${DOC_COLUMNS}`,
        [protocol, title, description, complianceType, documentNumber, issuer, responsible.display_name || null,
         responsible.id, validity.issue, validity.effectiveStart, validity.expiry, obligation.validity_rule, today,
         referenceType, declaredReference, referenceSource, session.identityId, obligation.id])).rows[0];
      return {
        status: 201, body: { document: r, message: "referência privada declarada registrada; não é arquivo, upload ou armazenamento verificado", file_boundary: COMPLIANCE_BOUNDARY.file_boundary },
        obligationId: obligation.id, documentId: r.id, eventType: "document_created",
        auditAction: "ext07_document_create", target: r.id, auditMeta: { protocol, obligation_id: obligation.id },
      };
    });
  }

  async function renewDocument(req, res, session, id) {
    return mutate(req, res, session, async (client, input) => {
      if (!UUID.test(id)) return { deny: { status: 400, body: { error: "invalid_document" } } };
      const predecessor = (await client.query("SELECT * FROM ext_compliance_documents WHERE id = $1 FOR UPDATE", [id])).rows[0];
      if (!predecessor || predecessor.origin !== "ext07_canonica") return { deny: { status: 404, body: { error: "document_not_found" } } };
      if (predecessor.status === "cancelada") return { deny: { status: 409, body: { error: "terminal_document_cannot_renew" } } };
      const successor = (await client.query("SELECT id FROM ext_compliance_documents WHERE replacement_of = $1", [id])).rows[0];
      if (successor) return { deny: { status: 409, body: { error: "renewal_requires_chain_tip" } } };
      const justification = text(input.justification, 10, 1000);
      if (!justification) return { deny: { status: 400, body: { error: "renewal_justification_required" } } };
      const obligation = (await client.query("SELECT * FROM ext_compliance_obligations WHERE id = $1 FOR UPDATE", [predecessor.obligation_id])).rows[0];
      const responsible = await activeCanonicalResponsible(client, obligation?.responsible_identity);
      if (!responsible) return { deny: { status: 409, body: { error: "responsible_staff_missing" } } };
      const today = await serverDate(client);
      const validity = readValidity(input, today);
      if (validity.error) return { deny: { status: 400, body: { error: validity.error } } };
      const title = text(input.title, 5, 200) || predecessor.title;
      const description = text(input.description, 10, 2000) || predecessor.description;
      const referenceType = text(input.reference_type, 3, 100);
      const declaredReference = text(input.declared_reference, 3, 1000);
      const referenceSource = input.reference_source ? text(input.reference_source, 3, 500) : predecessor.reference_source;
      const documentNumber = input.document_number ? text(input.document_number, 3, 200) : predecessor.document_number;
      const issuer = input.issuer ? text(input.issuer, 3, 200) : predecessor.issuer;
      const complianceType = COMPLIANCE_TYPES.includes(input.compliance_type) ? input.compliance_type : predecessor.compliance_type;
      if (!referenceType || !declaredReference) return { deny: { status: 400, body: { error: "private_reference_required" } } };
      // Substituição formal: a versão anterior fica intacta; se já vencida pela
      // data do servidor, o estado temporal é registrado sem reescrita.
      const predExpired = toDateIso(predecessor.expiry_date) < today;
      if (predExpired && predecessor.status !== "vencida") {
        await client.query(
          "UPDATE ext_compliance_documents SET status = 'vencida', evaluation_date = $2 WHERE id = $1",
          [predecessor.id, today]);
      } else if (toDateIso(predecessor.evaluation_date) !== today) {
        await client.query("UPDATE ext_compliance_documents SET evaluation_date = $2 WHERE id = $1", [predecessor.id, today]);
      }
      const protocol = `COMP-EXT-${today.replaceAll("-", "")}-${randomUUID().slice(0, 4).toUpperCase()}`;
      const r = (await client.query(
        `INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,document_number,issuer,
           responsible_name,responsible_identity,issue_date,effective_start_date,expiry_date,validity_rule,evaluation_date,
           reference_type,declared_reference,reference_source,is_private,created_by_identity,obligation_id,origin,version_no,replacement_of)
         VALUES($1,$2,$3,$4,'vigente',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,$17,$18,'ext07_canonica',$19,$20)
         RETURNING ${DOC_COLUMNS}`,
        [protocol, title, description, complianceType, documentNumber, issuer, responsible.display_name || null,
         responsible.id, validity.issue, validity.effectiveStart, validity.expiry, obligation.validity_rule, today,
         referenceType, declaredReference, referenceSource, session.identityId, predecessor.obligation_id,
         predecessor.version_no + 1, predecessor.id])).rows[0];
      return {
        status: 201,
        body: {
          document: r, version_no: r.version_no, replaced_version: predecessor.id,
          message: "renovação formal registrada como nova versão; a versão anterior permanece intacta no histórico; referência declarada não é arquivo",
          file_boundary: COMPLIANCE_BOUNDARY.file_boundary,
        },
        obligationId: predecessor.obligation_id, documentId: r.id, eventType: "document_renewed",
        auditAction: "ext07_document_renew", target: r.id,
        auditMeta: { predecessor: predecessor.id, version_no: r.version_no },
      };
    });
  }

  async function evaluate(req, res, session) {
    return mutate(req, res, session, async (client, input) => {
      const today = await serverDate(client);
      if (input.evaluation_date !== undefined) {
        if (!isIsoDate(input.evaluation_date)) return { deny: { status: 400, body: { error: "invalid_validity" } } };
        if (input.evaluation_date !== today) return { deny: { status: 400, body: { error: "client_clock_rejected", evaluation_date: today, source: "postgres_current_date" } } };
      }
      const docs = (await client.query(
        `SELECT d.id,d.obligation_id,d.expiry_date,d.issue_date,d.effective_start_date,d.version_no,d.status,
                o.renewal_lead_days,o.responsible_identity,o.title AS obligation_title
           FROM ext_compliance_documents d
           JOIN ext_compliance_obligations o ON o.id = d.obligation_id
          WHERE d.origin = 'ext07_canonica' AND d.status::text <> 'cancelada'
            AND NOT EXISTS (SELECT 1 FROM ext_compliance_documents s WHERE s.replacement_of = d.id)
          ORDER BY d.expiry_date ASC
          FOR UPDATE OF d`)).rows;
      const expired = docs.filter(d => toDateIso(d.expiry_date) <= today);
      // Fail-closed: sem responsável staff ativo em QUALQUER vencimento, nada é escrito.
      const missing = [];
      const responsibles = new Map();
      for (const d of expired) {
        const active = await activeCanonicalResponsible(client, d.responsible_identity);
        if (!active) missing.push({ obligation_id: d.obligation_id, document_id: d.id });
        else responsibles.set(d.id, active);
      }
      if (missing.length) {
        return { deny: { status: 409, body: { error: "responsible_staff_missing", fail_closed: true, missing } } };
      }
      const rule = "expiry_at_or_before_evaluation_date";
      let tasksCreated = 0; const invalidated = [];
      for (const d of expired) {
        const expiryIso = toDateIso(d.expiry_date);
        const issueIso = toDateIso(d.issue_date || d.effective_start_date);
        const period = `${issueIso}:${expiryIso}`;
        const facts = { expiry_date: expiryIso, evaluation_date: today, renewal_lead_days: d.renewal_lead_days, rule, source: "postgres_current_date", version_no: d.version_no };
        const task = (await client.query(
          `INSERT INTO ext_compliance_tasks(obligation_id,document_id,validity_period,rule,evaluation_date,due_date,facts,responsible_identity,created_by_identity)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (document_id,validity_period,rule) DO NOTHING RETURNING id`,
          [d.obligation_id, d.id, period, rule, today, expiryIso, JSON.stringify(facts), responsibles.get(d.id).id, session.identityId])).rows[0];
        if (task) tasksCreated += 1;
        if (d.status !== "vencida") {
          const isVigente = d.status === "vigente";
          if (!isVigente && d.status !== "a_vencer") continue; // em_renovacao: não rebaixa
          await client.query("UPDATE ext_compliance_documents SET status = 'vencida', evaluation_date = $2 WHERE id = $1", [d.id, today]);
          invalidated.push(d.id);
        } else {
          await client.query("UPDATE ext_compliance_documents SET evaluation_date = $2 WHERE id = $1", [d.id, today]);
        }
      }
      let upcoming = 0;
      for (const d of docs.filter(d => toDateIso(d.expiry_date) > today)) {
        const until = addDaysIso(today, d.renewal_lead_days);
        if (toDateIso(d.expiry_date) <= until && d.status === "vigente") {
          await client.query("UPDATE ext_compliance_documents SET status = 'a_vencer', evaluation_date = $2 WHERE id = $1", [d.id, today]);
          upcoming += 1;
        } else if (toDateIso(d.evaluation_date) !== today && d.status !== "vencida") {
          await client.query("UPDATE ext_compliance_documents SET evaluation_date = $2 WHERE id = $1", [d.id, today]);
        }
      }
      const body = {
        evaluated: docs.length, tasks_created: tasksCreated, invalidated, marked_expiring_soon: upcoming,
        evaluation_date: today, rule, source: "postgres_current_date",
        denominator: docs.length, absence_is_not_zero: docs.length === 0,
      };
      return {
        body, eventType: "expiry_evaluated", auditAction: "ext07_expiry_evaluate",
        target: session.identityId, auditMeta: { evaluated: docs.length, tasks_created: tasksCreated },
      };
    });
  }

  async function taskTransition(req, res, session, id, action) {
    return mutate(req, res, session, async (client, input) => {
      if (!UUID.test(id)) return { deny: { status: 400, body: { error: "invalid_task" } } };
      const task = (await client.query("SELECT * FROM ext_compliance_tasks WHERE id = $1 FOR UPDATE", [id])).rows[0];
      if (!task) return { deny: { status: 404, body: { error: "task_not_found" } } };
      if (["concluida", "cancelada"].includes(task.status)) return { deny: { status: 409, body: { error: "terminal_task_immutable" } } };
      const next = action === "start" ? "em_andamento" : action === "complete" ? "concluida" : "cancelada";
      if (!TASK_TRANSITIONS[task.status].includes(next)) return { deny: { status: 409, body: { error: "invalid_transition" } } };
      let result = null, justification = null;
      if (action === "complete") {
        result = text(input.result, 10, 2000);
        const responsible = await activeCanonicalResponsible(client, task.responsible_identity);
        if (!result || !responsible) return { deny: { status: 409, body: { error: "completion_requires_responsible_and_result" } } };
      }
      if (action === "cancel") {
        justification = text(input.justification, 10, 1000);
        if (!justification) return { deny: { status: 400, body: { error: "cancellation_justification_required" } } };
      }
      const r = (await client.query(
        `UPDATE ext_compliance_tasks
            SET status = $2,
                responsible_identity = COALESCE(responsible_identity, $3),
                completion_result = $4,
                cancellation_justification = $5,
                started_at = CASE WHEN $2 = 'em_andamento' THEN NOW() ELSE started_at END,
                completed_at = CASE WHEN $2 = 'concluida' THEN NOW() ELSE completed_at END,
                cancelled_at = CASE WHEN $2 = 'cancelada' THEN NOW() ELSE cancelled_at END
          WHERE id = $1 RETURNING *`,
        [id, next, session.identityId, result, justification])).rows[0];
      return {
        body: { task: r }, taskId: id, eventType: `task_${action}`,
        auditAction: `ext07_task_${action}`, target: id, auditMeta: { from: task.status, to: next },
      };
    });
  }

  async function handle(req, res) {
    const session = await staffSession(req, res);
    if (!session) return;
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;
    const method = req.method;

    if (method === "GET") {
      if (path === "/api/ext/compliance/obligations") return listObligations(req, res);
      if (path === "/api/ext/compliance/documents") return listDocuments(req, res);
      if (path === "/api/ext/compliance/tasks") return listTasks(req, res, url.searchParams);
      if (path === "/api/ext/compliance/events") return listEvents(req, res, url.searchParams);
      // Detalhe obriga id canônico: segmento não-UUID é bad request (entrada
      // malformada), não método inexistente.
      const obligationProbe = path.match(/^\/api\/ext\/compliance\/obligations\/([^/]+)$/i);
      if (obligationProbe) {
        if (!UUID.test(obligationProbe[1])) return json(res, 400, { error: "invalid_uuid" });
        return obligationDetail(req, res, obligationProbe[1].toLowerCase());
      }
      const documentProbe = path.match(/^\/api\/ext\/compliance\/documents\/([^/]+)$/i);
      if (documentProbe) {
        if (!UUID.test(documentProbe[1])) return json(res, 400, { error: "invalid_uuid" });
        return documentDetail(req, res, documentProbe[1].toLowerCase());
      }
      return json(res, 405, { error: "method_not_allowed" });
    }
    if (method === "POST") {
      if (path === "/api/ext/compliance/obligations") return createObligation(req, res, session);
      if (path === "/api/ext/compliance/documents") return createDocument(req, res, session);
      if (path === "/api/ext/compliance/evaluate") return evaluate(req, res, session);
      const renewMatch = path.match(/^\/api\/ext\/compliance\/documents\/([^/]+)\/renew$/i);
      if (renewMatch) {
        if (!UUID.test(renewMatch[1])) return json(res, 400, { error: "invalid_uuid" });
        return renewDocument(req, res, session, renewMatch[1].toLowerCase(), "renew");
      }
      const taskMatch = path.match(/^\/api\/ext\/compliance\/tasks\/([^/]+)\/(start|complete|cancel)$/i);
      if (taskMatch) {
        if (!UUID.test(taskMatch[1])) return json(res, 400, { error: "invalid_uuid" });
        return taskTransition(req, res, session, taskMatch[1].toLowerCase(), taskMatch[2]);
      }
      return json(res, 405, { error: "method_not_allowed" });
    }
    return json(res, 405, { error: "method_not_allowed" });
  }

  return { handle };
}
