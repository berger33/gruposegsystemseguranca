// EXT-07 — API canônica de compliance corporativo.
// Fonte canônica documental: ext_compliance_documents (origin='ext07_canonica').
// Fonte canônica de tarefa: ext_compliance_tasks.
// Fronteira documental: a referência é declarada e privada; não prova upload,
// bytes, checksum, malware scan, armazenamento verificado nem download.
import { createHash, randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BODY_LIMIT = 128 * 1024;
const CRITICALITY = ["baixa", "media", "alta", "critica"];
const COMPLIANCE_TYPES = ["licenca", "certidao", "seguro", "alvara", "outro"];

// Projeção mínima (allowlist). storage_key, file_url, file_name e metadados de
// armazenamento nunca saem desta API.
const DOCUMENT_ALLOWLIST = [
  "id", "protocol", "title", "description", "compliance_type", "status",
  "obligation_id", "origin", "issue_date", "effective_start_date", "expiry_date",
  "validity_rule", "evaluation_date", "reference_type", "reference_source",
  "is_private", "version_no", "replacement_of", "created_at", "updated_at",
];
const DOCUMENT_COLUMNS = DOCUMENT_ALLOWLIST.join(",");

const json = (res, status, body, extraHeaders) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...extraHeaders });
  res.end(JSON.stringify(body));
};
// Datas do PostgreSQL chegam como Date: períodos e fatos precisam de ISO curto.
const isoDate = (value) => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value, Object.keys(value).sort())).digest("hex");
const DATE_FIELDS = new Set(["issue_date", "effective_start_date", "expiry_date", "evaluation_date"]);
const project = (row) => {
  if (!row) return row;
  const out = {};
  for (const key of DOCUMENT_ALLOWLIST) if (key in row) out[key] = DATE_FIELDS.has(key) ? isoDate(row[key]) : row[key];
  return out;
};

async function body(req) {
  if (req.__ext07BodyConsumed) throw Object.assign(new Error("body_already_consumed"), { status: 500 });
  req.__ext07BodyConsumed = true;
  let size = 0;
  const chunks = [];
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

const text = (value, min, max) => (typeof value === "string" && value.trim().length >= min && value.trim().length <= max ? value.trim() : null);
const isDate = (value) => typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

// Campos derivados do servidor: nunca aceitos do cliente.
const SERVER_OWNED = ["id", "protocol", "origin", "created_by_identity", "created_at", "updated_at", "status", "version_no", "replacement_of", "responsible_identity", "responsible_name", "is_private", "storage_key", "file_url", "file_name", "evaluation_date"];
const forgedFields = (payload) => SERVER_OWNED.filter(key => key in payload);

export function createExtComplianceApi({ pool, sameOrigin, requireSession }) {
  async function staff(req, res) {
    const session = await requireSession(req);
    if (!session) { json(res, 401, { error: "unauthorized" }); return null; }
    const role = String(session.role || session.userRole || "").toLowerCase();
    if (!["admin", "ti"].includes(role)) { json(res, 403, { error: "forbidden" }); return null; }
    if (!UUID.test(String(session.identityId || ""))) { json(res, 401, { error: "unauthorized" }); return null; }
    return session;
  }

  async function activeIdentity(client, id) {
    if (!UUID.test(String(id || ""))) return false;
    const found = await client.query(
      `SELECT id FROM auth_identities WHERE id=$1 AND kind='staff' AND status='active'
         AND EXISTS (SELECT 1 FROM auth_staff_profiles p WHERE p.identity_id=auth_identities.id AND p.role IN ('admin','ti'))`,
      [id],
    );
    return Boolean(found.rows[0]);
  }

  // Mutação canônica: same-origin, Idempotency-Key, transação única,
  // evento imutável e audit_log obrigatório (falha de auditoria => 503 + rollback).
  async function mutate(req, res, session, work) {
    if (!sameOrigin(req)) return json(res, 403, { error: "forbidden" });
    const key = String(req.headers["idempotency-key"] || "").trim();
    if (key.length < 8 || key.length > 200) return json(res, 400, { error: "idempotency_key_required" });
    let payload;
    try {
      payload = await body(req);
    } catch (error) {
      const status = error.status || 400;
      // O corpo não foi drenado: manter keep-alive envenenaria a conexão.
      return json(res, status, { error: error.message }, status === 413 ? { connection: "close" } : undefined);
    }
    const fp = fingerprint(payload);
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ext07:${session.identityId}:${key}`]);
      const prior = (await client.query(
        "SELECT * FROM ext_compliance_events WHERE created_by_identity=$1 AND idempotency_key=$2",
        [session.identityId, key],
      )).rows[0];
      if (prior) {
        if (prior.request_fingerprint !== fp) { await client.query("ROLLBACK"); return json(res, 409, { error: "idempotency_key_reused" }); }
        await client.query("COMMIT");
        return json(res, 200, { ...prior.payload, replayed: true });
      }
      const out = await work(client, payload);
      if (out.deny) { await client.query("ROLLBACK"); return json(res, out.deny.status, out.deny.body); }
      await client.query(
        `INSERT INTO ext_compliance_events(obligation_id,document_id,task_id,event_type,payload,idempotency_key,request_fingerprint,created_by_identity)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [out.obligationId || null, out.documentId || null, out.taskId || null, out.eventType, JSON.stringify(out.body), key, fp, session.identityId],
      );
      try {
        await client.query("INSERT INTO audit_log(action,actor,target,meta) VALUES($1,$2,$3,$4)", [out.auditAction, session.identityId, out.target, JSON.stringify(out.auditMeta || {})]);
      } catch {
        await client.query("ROLLBACK");
        return json(res, 503, { error: "audit_unavailable" });
      }
      await client.query("COMMIT");
      return json(res, out.status || 200, out.body);
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => {});
      console.error("EXT-07 mutation failed", error?.message);
      const conflict = error?.code === "23505";
      return json(res, conflict ? 409 : 503, { error: conflict ? "conflict" : "compliance_journey_unavailable" });
    } finally {
      client?.release();
    }
  }

  async function list(req, res) {
    const result = await pool.query(
      `SELECT ${DOCUMENT_COLUMNS} FROM ext_compliance_documents WHERE origin='ext07_canonica' ORDER BY expiry_date NULLS LAST LIMIT 200`,
    );
    return json(res, 200, {
      items: result.rows.map(project),
      source: "ext_compliance_documents",
      canonical_origin: "ext07_canonica",
      denominator: result.rowCount,
      absence_is_not_zero: result.rowCount === 0,
      file_boundary: "referencia_declarada_nao_arquivo_verificado",
      storage_claim: "nenhum upload, byte, checksum, malware scan, storage verificado ou download é declarado",
      public_route: false,
    });
  }

  async function documentDetail(req, res, id) {
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_document" });
    const result = await pool.query(
      `SELECT ${DOCUMENT_COLUMNS} FROM ext_compliance_documents WHERE id=$1 AND origin='ext07_canonica'`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return json(res, 404, { error: "document_not_found" });
    const history = await pool.query(
      `SELECT ${DOCUMENT_COLUMNS} FROM ext_compliance_documents WHERE origin='ext07_canonica' AND (id=$1 OR replacement_of=$1) ORDER BY version_no ASC`,
      [id],
    );
    return json(res, 200, {
      document: project(row),
      history: history.rows.map(project),
      source: "ext_compliance_documents",
      file_boundary: "referencia_declarada_nao_arquivo_verificado",
      public_route: false,
    });
  }

  async function obligations(req, res) {
    const result = await pool.query(
      `SELECT o.id,o.obligation_type,o.title,o.description,o.declared_source,o.applicability_scope,
              o.applicability_justification,o.validity_rule,o.renewal_lead_days,o.criticality,o.status,
              o.responsible_identity,i.display_name responsible_name,o.created_by_identity,o.created_at
         FROM ext_compliance_obligations o
         JOIN auth_identities i ON i.id=o.responsible_identity
        ORDER BY o.created_at DESC LIMIT 200`,
    );
    return json(res, 200, {
      items: result.rows,
      source: "ext_compliance_obligations",
      period: null,
      denominator: result.rowCount,
      absence_is_not_zero: result.rowCount === 0,
      declared_source_disclaimer: "fonte declarada pelo operador; não é validação jurídica nem confirmação por órgão público",
    });
  }

  async function tasks(req, res) {
    const result = await pool.query(
      `SELECT id,obligation_id,document_id,validity_period,rule,evaluation_date,due_date,facts,
              responsible_identity,status,completion_result,cancellation_justification,created_by_identity,created_at
         FROM ext_compliance_tasks ORDER BY created_at DESC LIMIT 200`,
    );
    return json(res, 200, {
      items: result.rows,
      source: "ext_compliance_tasks",
      denominator: result.rowCount,
      absence_is_not_zero: result.rowCount === 0,
    });
  }

  async function createObligation(req, res, session) {
    return mutate(req, res, session, async (client, payload) => {
      const title = text(payload.title, 5, 200);
      const description = text(payload.description, 10, 2000);
      const declaredSource = text(payload.declared_source, 5, 1000);
      const scope = text(payload.applicability_scope, 3, 500);
      const justification = text(payload.applicability_justification, 10, 2000);
      const rule = text(payload.validity_rule, 5, 500);
      const type = text(payload.obligation_type, 3, 100);
      if (!title || !description || !declaredSource || !scope || !justification || !rule || !type) {
        return { deny: { status: 400, body: { error: "invalid_obligation" } } };
      }
      const responsible = payload.responsible_identity;
      if (!UUID.test(String(responsible || ""))) return { deny: { status: 400, body: { error: "invalid_responsible_uuid" } } };
      if (!(await activeIdentity(client, responsible))) return { deny: { status: 400, body: { error: "responsible_staff_required" } } };
      // created_by_identity e status forjados são ignorados: a sessão é a autoria.
      const row = (await client.query(
        `INSERT INTO ext_compliance_obligations(obligation_type,title,description,declared_source,applicability_scope,
            applicability_justification,validity_rule,renewal_lead_days,criticality,responsible_identity,created_by_identity)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [type, title, description, declaredSource, scope, justification, rule,
          Number.isInteger(payload.renewal_lead_days) && payload.renewal_lead_days >= 0 && payload.renewal_lead_days <= 3650 ? payload.renewal_lead_days : 30,
          CRITICALITY.includes(payload.criticality) ? payload.criticality : "media",
          responsible, session.identityId],
      )).rows[0];
      return {
        status: 201,
        body: {
          obligation: row,
          author_source: "session",
          declared_source_disclaimer: "fonte declarada; não é validação jurídica nem confirmação por órgão público",
        },
        obligationId: row.id,
        eventType: "obligation_created",
        auditAction: "ext07_obligation_create",
        target: row.id,
      };
    });
  }

  function validateDocumentDates(payload, obligation) {
    const issue = payload.issue_date;
    const expiry = payload.expiry_date;
    if (!isDate(issue) || !isDate(expiry)) return { error: "invalid_validity" };
    const start = payload.effective_start_date === undefined || payload.effective_start_date === null ? issue : payload.effective_start_date;
    if (!isDate(start)) return { error: "invalid_validity" };
    if (start < issue) return { error: "effective_start_before_issue" };
    if (expiry < issue) return { error: "expiry_before_issue" };
    if (expiry < start) return { error: "expiry_before_effective_start" };
    if (!text(obligation.validity_rule, 5, 500)) return { error: "validity_rule_required" };
    return { issue, expiry, start };
  }

  async function createDocument(req, res, session) {
    return mutate(req, res, session, async (client, payload) => {
      const forged = forgedFields(payload);
      if (forged.length) return { deny: { status: 400, body: { error: "server_owned_fields_rejected", fields: forged } } };
      if (!UUID.test(String(payload.obligation_id || ""))) return { deny: { status: 400, body: { error: "invalid_obligation" } } };
      const obligation = (await client.query("SELECT * FROM ext_compliance_obligations WHERE id=$1 FOR UPDATE", [payload.obligation_id])).rows[0];
      if (!obligation) return { deny: { status: 404, body: { error: "obligation_not_found" } } };
      if (!(await activeIdentity(client, obligation.responsible_identity))) return { deny: { status: 409, body: { error: "responsible_staff_missing" } } };
      const dates = validateDocumentDates(payload, obligation);
      if (dates.error) return { deny: { status: 400, body: { error: dates.error } } };
      const reference = text(payload.declared_reference, 3, 1000);
      const referenceType = text(payload.reference_type, 3, 100);
      const title = text(payload.title, 5, 200);
      const description = text(payload.description, 10, 2000);
      if (!reference || !referenceType) return { deny: { status: 400, body: { error: "private_reference_required" } } };
      if (!title || !description) return { deny: { status: 400, body: { error: "invalid_document" } } };
      const complianceType = COMPLIANCE_TYPES.includes(payload.compliance_type) ? payload.compliance_type : "outro";
      const protocol = `COMP-EXT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 4).toUpperCase()}`;
      const row = (await client.query(
        `INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,document_number,issuer,
            responsible_name,responsible_identity,issue_date,effective_start_date,expiry_date,validity_rule,evaluation_date,
            reference_type,declared_reference,reference_source,is_private,created_by_identity,obligation_id,origin,version_no)
         VALUES($1,$2,$3,$4,'vigente',$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_DATE,$13,$14,$15,true,$16,$17,'ext07_canonica',1)
         RETURNING ${DOCUMENT_COLUMNS}`,
        [protocol, title, description, complianceType, text(payload.document_number, 3, 200), text(payload.issuer, 3, 200),
          obligation.responsible_identity, obligation.responsible_identity, dates.issue, dates.start, dates.expiry,
          obligation.validity_rule, referenceType, reference, text(payload.reference_source, 3, 500), session.identityId, obligation.id],
      )).rows[0];
      return {
        status: 201,
        body: {
          document: project(row),
          author_source: "session",
          file_boundary: "referencia_declarada_nao_arquivo_verificado",
          message: "referência privada registrada; não representa arquivo armazenado, verificado ou baixável",
        },
        obligationId: obligation.id,
        documentId: row.id,
        eventType: "document_created",
        auditAction: "ext07_document_create",
        target: row.id,
      };
    });
  }

  // Renovação versionada: cria novo registro, preserva o anterior intacto e
  // mantém o vínculo explícito replacement_of. Ciclos e bifurcações recusadas.
  async function renewDocument(req, res, session, id) {
    return mutate(req, res, session, async (client, payload) => {
      if (!UUID.test(id)) return { deny: { status: 400, body: { error: "invalid_document" } } };
      const forged = forgedFields(payload);
      if (forged.length) return { deny: { status: 400, body: { error: "server_owned_fields_rejected", fields: forged } } };
      const prior = (await client.query(
        "SELECT * FROM ext_compliance_documents WHERE id=$1 AND origin='ext07_canonica' FOR UPDATE", [id],
      )).rows[0];
      if (!prior) return { deny: { status: 404, body: { error: "document_not_found" } } };
      const replaced = (await client.query("SELECT id FROM ext_compliance_documents WHERE replacement_of=$1", [id])).rows[0];
      if (replaced) return { deny: { status: 409, body: { error: "document_already_replaced", replacement_cycle_guard: true } } };
      // Guarda anticiclo: a cadeia ascendente não pode conter o próprio alvo.
      const seen = new Set([id]);
      let cursor = prior.replacement_of;
      while (cursor) {
        if (seen.has(cursor)) return { deny: { status: 409, body: { error: "replacement_cycle_rejected" } } };
        seen.add(cursor);
        cursor = (await client.query("SELECT replacement_of FROM ext_compliance_documents WHERE id=$1", [cursor])).rows[0]?.replacement_of || null;
      }
      const obligation = (await client.query("SELECT * FROM ext_compliance_obligations WHERE id=$1 FOR UPDATE", [prior.obligation_id])).rows[0];
      if (!obligation) return { deny: { status: 409, body: { error: "obligation_not_found" } } };
      if (!(await activeIdentity(client, obligation.responsible_identity))) return { deny: { status: 409, body: { error: "responsible_staff_missing" } } };
      const justification = text(payload.justification, 10, 2000);
      if (!justification) return { deny: { status: 400, body: { error: "renewal_justification_required" } } };
      const dates = validateDocumentDates(payload, obligation);
      if (dates.error) return { deny: { status: 400, body: { error: dates.error } } };
      const reference = text(payload.declared_reference, 3, 1000);
      const referenceType = text(payload.reference_type, 3, 100);
      if (!reference || !referenceType) return { deny: { status: 400, body: { error: "private_reference_required" } } };
      const protocol = `COMP-EXT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 4).toUpperCase()}`;
      const row = (await client.query(
        `INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,document_number,issuer,
            responsible_name,responsible_identity,issue_date,effective_start_date,expiry_date,validity_rule,evaluation_date,
            reference_type,declared_reference,reference_source,is_private,created_by_identity,obligation_id,origin,
            replacement_of,version_no)
         VALUES($1,$2,$3,$4,'vigente',$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_DATE,$13,$14,$15,true,$16,$17,'ext07_canonica',$18,$19)
         RETURNING ${DOCUMENT_COLUMNS}`,
        [protocol, text(payload.title, 5, 200) || prior.title, text(payload.description, 10, 2000) || prior.description,
          prior.compliance_type, prior.document_number, prior.issuer, obligation.responsible_identity, obligation.responsible_identity,
          dates.issue, dates.start, dates.expiry, obligation.validity_rule, referenceType, reference,
          text(payload.reference_source, 3, 500), session.identityId, obligation.id, prior.id, (prior.version_no || 1) + 1],
      )).rows[0];
      return {
        status: 201,
        body: {
          document: project(row),
          replacement_of: prior.id,
          previous_preserved: true,
          justification,
          author_source: "session",
          file_boundary: "referencia_declarada_nao_arquivo_verificado",
        },
        obligationId: obligation.id,
        documentId: row.id,
        eventType: "document_renewed",
        auditAction: "ext07_document_renew",
        target: row.id,
      };
    });
  }

  // Avaliação de validade: a data-base é SEMPRE a data do servidor PostgreSQL.
  // Nenhuma data do cliente controla a avaliação.
  async function evaluate(req, res, session) {
    return mutate(req, res, session, async (client, payload) => {
      const clientDateIgnored = "evaluation_date" in payload;
      const serverDate = (await client.query("SELECT CURRENT_DATE::text AS d")).rows[0].d;
      const rule = "expiry_at_or_before_server_date";
      const documents = (await client.query(
        `SELECT d.*, o.renewal_lead_days, o.responsible_identity AS obligation_responsible
           FROM ext_compliance_documents d
           JOIN ext_compliance_obligations o ON o.id=d.obligation_id
          WHERE d.origin='ext07_canonica' AND d.expiry_date IS NOT NULL AND d.expiry_date <= $1::date
          ORDER BY d.expiry_date ASC
            FOR UPDATE OF d`,
        [serverDate],
      )).rows;
      let created = 0;
      const failClosed = [];
      for (const document of documents) {
        const responsible = document.obligation_responsible;
        if (!(await activeIdentity(client, responsible))) {
          // Fail-closed: sem responsável canônico ativo não há tarefa silenciosa.
          failClosed.push({ document_id: document.id, reason: "responsible_staff_missing" });
          continue;
        }
        const period = `${isoDate(document.effective_start_date || document.issue_date)}:${isoDate(document.expiry_date)}`;
        const facts = {
          expiry_date: isoDate(document.expiry_date),
          base_date: serverDate,
          source: "server_date",
          rule,
          validity_rule: document.validity_rule,
        };
        const task = (await client.query(
          `INSERT INTO ext_compliance_tasks(obligation_id,document_id,validity_period,rule,evaluation_date,due_date,facts,responsible_identity,created_by_identity)
           VALUES($1,$2,$3,$4,$5::date,GREATEST($6::date,$5::date),$7,$8,$9)
           ON CONFLICT(document_id,validity_period,rule) DO NOTHING RETURNING id`,
          [document.obligation_id, document.id, period, rule, serverDate, document.expiry_date, JSON.stringify(facts), responsible, session.identityId],
        )).rows[0];
        if (task) created++;
        if (document.status !== "vencida") {
          await client.query("UPDATE ext_compliance_documents SET status='vencida', evaluation_date=$2::date WHERE id=$1", [document.id, serverDate]);
        }
      }
      return {
        body: {
          evaluated: documents.length,
          tasks_created: created,
          fail_closed: failClosed,
          evaluation_date: serverDate,
          base_date: serverDate,
          rule,
          source: "server_date",
          client_date_ignored: clientDateIgnored,
          task_source: "ext_compliance_tasks",
          denominator: documents.length,
          absence_is_not_zero: documents.length === 0,
          correction: "estado vigente com vencimento atingido é corrigido para vencida pela regra declarada",
        },
        eventType: "expiry_evaluated",
        auditAction: "ext07_expiry_evaluate",
        target: session.identityId,
      };
    });
  }

  async function taskTransition(req, res, session, id, action) {
    return mutate(req, res, session, async (client, payload) => {
      if (!UUID.test(id)) return { deny: { status: 400, body: { error: "invalid_task" } } };
      const task = (await client.query("SELECT * FROM ext_compliance_tasks WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!task) return { deny: { status: 404, body: { error: "task_not_found" } } };
      if (["concluida", "cancelada"].includes(task.status)) return { deny: { status: 409, body: { error: "terminal_task_cannot_reopen" } } };
      if (action === "start" && task.status !== "aberta") return { deny: { status: 409, body: { error: "invalid_transition" } } };
      if (action === "complete") {
        if (!text(payload.result, 10, 2000)) return { deny: { status: 409, body: { error: "completion_requires_responsible_and_result" } } };
        if (!(await activeIdentity(client, task.responsible_identity))) return { deny: { status: 409, body: { error: "completion_requires_responsible_and_result" } } };
      }
      if (action === "cancel" && !text(payload.justification, 10, 1000)) return { deny: { status: 400, body: { error: "cancellation_justification_required" } } };
      const next = action === "start" ? "em_andamento" : action === "complete" ? "concluida" : "cancelada";
      const row = (await client.query(
        `UPDATE ext_compliance_tasks
            SET status=$2,
                responsible_identity=COALESCE(responsible_identity,$3),
                completion_result=COALESCE($4,completion_result),
                cancellation_justification=COALESCE($5,cancellation_justification),
                started_at=CASE WHEN $2='em_andamento' THEN NOW() ELSE started_at END,
                completed_at=CASE WHEN $2='concluida' THEN NOW() ELSE completed_at END,
                cancelled_at=CASE WHEN $2='cancelada' THEN NOW() ELSE cancelled_at END
          WHERE id=$1 RETURNING *`,
        [id, next, session.identityId, text(payload.result, 10, 2000), text(payload.justification, 10, 1000)],
      )).rows[0];
      return {
        body: { task: row, source: "ext_compliance_tasks" },
        obligationId: task.obligation_id,
        documentId: task.document_id,
        taskId: id,
        eventType: `task_${action}`,
        auditAction: `ext07_task_${action}`,
        target: id,
      };
    });
  }

  async function handle(req, res) {
    const session = await staff(req, res);
    if (!session) return;
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (req.method !== "GET" && !sameOrigin(req)) return json(res, 403, { error: "forbidden" });
    if (req.method === "GET" && pathname === "/api/ext/compliance/documents") return list(req, res);
    if (req.method === "GET" && pathname === "/api/ext/compliance/obligations") return obligations(req, res);
    if (req.method === "GET" && pathname === "/api/ext/compliance/tasks") return tasks(req, res);
    const detail = pathname.match(/^\/api\/ext\/compliance\/documents\/([^/]+)$/);
    if (req.method === "GET" && detail) return documentDetail(req, res, detail[1]);
    if (req.method === "POST" && pathname === "/api/ext/compliance/obligations") return createObligation(req, res, session);
    if (req.method === "POST" && pathname === "/api/ext/compliance/documents") return createDocument(req, res, session);
    if (req.method === "POST" && pathname === "/api/ext/compliance/evaluate") return evaluate(req, res, session);
    const renewal = pathname.match(/^\/api\/ext\/compliance\/documents\/([^/]+)\/renew$/);
    if (req.method === "POST" && renewal) return renewDocument(req, res, session, renewal[1]);
    const transition = pathname.match(/^\/api\/ext\/compliance\/tasks\/([^/]+)\/(start|complete|cancel)$/i);
    if (req.method === "POST" && transition) return taskTransition(req, res, session, transition[1], transition[2].toLowerCase());
    return json(res, 405, { error: "method_not_allowed" });
  }

  return { handle };
}
