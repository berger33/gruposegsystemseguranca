// EXT-07 — jornada canônica interna de compliance corporativo.
// ext_compliance_documents permanece a fonte documental; ext_compliance_tasks
// é a fonte das tarefas. Referências privadas não são arquivos nem bytes.
import { createHash, randomBytes, randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const AUTHORIZED_ROLES = new Set(["admin", "ti"]);
const DOCUMENT_TYPES = new Set(["licenca", "certidao", "seguro", "alvara", "outro"]);
const CRITICALITIES = new Set(["baixa", "media", "alta", "critica"]);
const MAX_BODY_BYTES = 32 * 1024;

export const COMPLIANCE_TASK_TRANSITIONS = Object.freeze({
  aberta: Object.freeze(["em_andamento", "cancelada"]),
  em_andamento: Object.freeze(["concluida", "cancelada"]),
  concluida: Object.freeze([]),
  cancelada: Object.freeze([]),
});
export const COMPLIANCE_DOCUMENT_BOUNDARY = Object.freeze({
  privacy: "private_staff_only",
  representation: "referencia_documental_declarada",
  file: false,
  upload: false,
  bytes: false,
  checksum: false,
  malware_scan: false,
  verified_storage: false,
  download: false,
});
export const COMPLIANCE_LIST_FIELDS = Object.freeze([
  "id", "protocol", "title", "compliance_type", "status", "obligation_id",
  "origin", "issue_date", "effective_start_date", "expiry_date",
  "reference_type", "version_no", "is_current", "is_private", "created_at",
]);

const text = (value, min, max) => typeof value === "string" && value.trim().length >= min && value.trim().length <= max ? value.trim() : null;
const isoDate = value => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
};
const stable = value => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
};
const fingerprint = value => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const protocol = () => `COMP-EXT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex").slice(0, 4).toUpperCase()}`;
const databaseDate = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
const role = session => String(session?.role || session?.userRole || "").toLowerCase();
const documentProjection = row => Object.fromEntries(COMPLIANCE_LIST_FIELDS.map(field => [field, row[field]]));

export function createExtComplianceApi({ pool, sameOrigin, requireSession }) {
  const json = (res, status, value) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, max-age=0" });
    res.end(JSON.stringify(value));
  };

  async function guard(req, res, { write = false } = {}) {
    let session = null;
    try { session = await requireSession(req); } catch {}
    if (!session) { json(res, 401, { error: "unauthorized" }); return null; }
    if (!AUTHORIZED_ROLES.has(role(session))) { json(res, 403, { error: "forbidden_role" }); return null; }
    if (write && !sameOrigin(req)) { json(res, 403, { error: "origin_forbidden" }); return null; }
    if (write && !UUID.test(String(session.identityId || ""))) { json(res, 401, { error: "unauthorized" }); return null; }
    return session;
  }

  async function readBody(req, res) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { json(res, 413, { error: "body_too_large" }); return null; }
      chunks.push(chunk);
    }
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object_required");
      return value;
    } catch {
      json(res, 400, { error: "invalid_json" });
      return null;
    }
  }

  function idempotencyKey(req, res) {
    const key = String(req.headers["idempotency-key"] || "").trim();
    if (!IDEMPOTENCY_KEY.test(key)) { json(res, 400, { error: "idempotency_key_required" }); return null; }
    return key;
  }

  async function parsedMutation(req, res) {
    const session = await guard(req, res, { write: true });
    if (!session) return null;
    const body = await readBody(req, res);
    if (!body) return null;
    const key = idempotencyKey(req, res);
    return key ? { session, body, key } : null;
  }

  async function lockActor(client, session) {
    return (await client.query(
      `SELECT i.id,p.role
         FROM auth_identities i
         JOIN auth_staff_profiles p ON p.identity_id=i.id
        WHERE i.id=$1 AND i.kind='staff' AND i.status='active'
          AND p.role IN ('admin','ti')
        FOR SHARE`,
      [session.identityId],
    )).rows[0] || null;
  }

  async function activeResponsible(client, identityId) {
    if (!UUID.test(String(identityId || ""))) return null;
    return (await client.query(
      `SELECT i.id,i.display_name,p.role
         FROM auth_identities i
         JOIN auth_staff_profiles p ON p.identity_id=i.id
        WHERE i.id=$1 AND i.kind='staff' AND i.status='active'
          AND p.role IN ('admin','ti')
        FOR SHARE`,
      [identityId],
    )).rows[0] || null;
  }

  async function mutate(res, { session, key, operation, request, auditAction, work }) {
    const requestFingerprint = fingerprint({ operation, request });
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      if (!await lockActor(client, session)) {
        await client.query("ROLLBACK");
        return json(res, 401, { error: "session_identity_unavailable" });
      }
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ext07:${session.identityId}:${key}`]);
      const prior = (await client.query(
        `SELECT * FROM ext_compliance_events
          WHERE created_by_identity=$1 AND idempotency_key=$2`,
        [session.identityId, key],
      )).rows[0];
      if (prior) {
        if (prior.request_fingerprint !== requestFingerprint) {
          await client.query("ROLLBACK");
          return json(res, 409, { error: "idempotency_key_reused" });
        }
        await client.query("COMMIT");
        return json(res, 200, { ...prior.payload, replayed: true });
      }

      const output = await work(client);
      if (output.deny) {
        await client.query("ROLLBACK");
        return json(res, output.deny.status, output.deny.body);
      }
      await client.query(
        `INSERT INTO ext_compliance_events(
           obligation_id,document_id,task_id,event_type,payload,
           idempotency_key,request_fingerprint,created_by_identity
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [output.obligationId || null, output.documentId || null, output.taskId || null,
          output.eventType, JSON.stringify(output.body), key, requestFingerprint, session.identityId],
      );
      try {
        await client.query(
          `INSERT INTO audit_log(action,actor,target,meta) VALUES($1,$2,$3,$4)`,
          [auditAction, session.identityId, output.target, JSON.stringify(output.auditMeta || {})],
        );
      } catch (error) {
        await client.query("ROLLBACK");
        console.error("EXT-07 audit unavailable", error?.message || error);
        return json(res, 503, { error: "audit_unavailable" });
      }
      await client.query("COMMIT");
      return json(res, output.status || 200, output.body);
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => {});
      const conflict = error?.code === "23505" || error?.code === "40001";
      console.error("EXT-07 mutation failed", error?.message || error);
      return json(res, conflict ? 409 : 503, { error: conflict ? "conflict" : "compliance_journey_unavailable" });
    } finally {
      client?.release();
    }
  }

  async function getObligation(db, id, lock = "") {
    return (await db.query(
      `SELECT o.id,o.obligation_type,o.title,o.description,o.declared_source,
              o.applicability_scope,o.applicability_justification,o.validity_rule,
              o.renewal_lead_days,o.criticality,o.status,o.responsible_identity,
              o.created_by_identity,o.created_at,o.updated_at,
              i.display_name AS responsible_name,p.role AS responsible_role
         FROM ext_compliance_obligations o
         JOIN auth_identities i ON i.id=o.responsible_identity
         JOIN auth_staff_profiles p ON p.identity_id=i.id
        WHERE o.id=$1 ${lock}`,
      [id],
    )).rows[0] || null;
  }

  async function getDocumentDetail(db, id, lock = "") {
    const document = (await db.query(
      `SELECT d.id,d.protocol,d.title,d.description,d.compliance_type,d.status,
              d.document_number,d.issuer,d.responsible_identity,d.issue_date,
              d.effective_start_date,d.expiry_date,d.validity_rule,d.evaluation_date,
              d.reference_type,d.declared_reference,d.reference_source,d.is_private,
              d.obligation_id,d.origin,d.replacement_of,d.superseded_by,d.version_no,
              d.is_current,d.renewal_justification,d.renewed_by_identity,d.renewed_at,
              d.created_by_identity,d.created_at,d.updated_at,
              i.display_name AS responsible_name
         FROM ext_compliance_documents d
         JOIN auth_identities i ON i.id=d.responsible_identity
        WHERE d.id=$1 AND d.origin='ext07_canonica' ${lock}`,
      [id],
    )).rows[0] || null;
    if (!document) return null;
    const events = (await db.query(
      `SELECT id,event_type,payload,created_by_identity,created_at
         FROM ext_compliance_events
        WHERE document_id=$1 ORDER BY created_at,id`,
      [id],
    )).rows;
    return { document, events, file_boundary: COMPLIANCE_DOCUMENT_BOUNDARY };
  }

  async function handleObligations(req, res) {
    if (req.method === "GET") {
      if (!await guard(req, res)) return;
      try {
        const rows = (await pool.query(
          `SELECT o.id,o.obligation_type,o.title,o.description,o.declared_source,
                  o.applicability_scope,o.applicability_justification,o.validity_rule,
                  o.renewal_lead_days,o.criticality,o.status,o.responsible_identity,
                  o.created_by_identity,o.created_at,o.updated_at,
                  i.display_name AS responsible_name,p.role AS responsible_role
             FROM ext_compliance_obligations o
             JOIN auth_identities i ON i.id=o.responsible_identity
             JOIN auth_staff_profiles p ON p.identity_id=i.id
            ORDER BY o.created_at DESC LIMIT 200`,
        )).rows;
        return json(res, 200, {
          items: rows,
          source: "ext_compliance_obligations",
          period: null,
          denominator: rows.length,
          absence: rows.length ? null : "sem_obrigacoes_declaradas",
          legal_boundary: "registro interno declarado; não constitui validação jurídica nem confirmação por órgão público",
        });
      } catch { return json(res, 503, { error: "compliance_journey_unavailable" }); }
    }
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const parsed = await parsedMutation(req, res);
    if (!parsed) return;
    const b = parsed.body;
    const obligationType = text(b.obligation_type, 3, 100);
    const title = text(b.title, 5, 200);
    const description = text(b.description, 10, 2000);
    const declaredSource = text(b.declared_source, 5, 1000);
    const scope = text(b.applicability_scope, 3, 500);
    const justification = text(b.applicability_justification, 10, 2000);
    const validityRule = text(b.validity_rule, 5, 500);
    const leadDays = b.renewal_lead_days === undefined ? 30 : b.renewal_lead_days;
    const criticality = b.criticality === undefined ? "media" : b.criticality;
    if (!obligationType || !title || !description || !declaredSource || !scope || !justification || !validityRule
        || !Number.isInteger(leadDays) || leadDays < 0 || leadDays > 3650 || !CRITICALITIES.has(criticality)
        || !UUID.test(String(b.responsible_identity || ""))) {
      return json(res, 400, { error: "invalid_obligation" });
    }
    const request = { obligationType, title, description, declaredSource, scope, justification, validityRule, leadDays, criticality, responsibleIdentity: b.responsible_identity };
    return mutate(res, {
      ...parsed, operation: "obligation_create", request, auditAction: "ext07_obligation_create",
      work: async client => {
        if (!await activeResponsible(client, b.responsible_identity)) return { deny: { status: 400, body: { error: "responsible_staff_required" } } };
        const row = (await client.query(
          `INSERT INTO ext_compliance_obligations(
             obligation_type,title,description,declared_source,applicability_scope,
             applicability_justification,validity_rule,renewal_lead_days,criticality,
             status,responsible_identity,created_by_identity
           ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendente',$10,$11) RETURNING *`,
          [obligationType, title, description, declaredSource, scope, justification,
            validityRule, leadDays, criticality, b.responsible_identity, parsed.session.identityId],
        )).rows[0];
        return { status: 201, body: { obligation: row }, obligationId: row.id, eventType: "obligation_created", target: row.id, auditMeta: { obligation_type: obligationType } };
      },
    });
  }

  async function handleDocuments(req, res) {
    if (req.method === "GET") {
      if (!await guard(req, res)) return;
      try {
        const rows = (await pool.query(
          `SELECT id,protocol,title,compliance_type,status,obligation_id,origin,
                  issue_date,effective_start_date,expiry_date,reference_type,
                  version_no,is_current,is_private,created_at
             FROM ext_compliance_documents
            WHERE origin='ext07_canonica'
            ORDER BY is_current DESC,expiry_date NULLS LAST,created_at DESC LIMIT 200`,
        )).rows.map(documentProjection);
        return json(res, 200, { items: rows, source: "ext_compliance_documents", file_boundary: COMPLIANCE_DOCUMENT_BOUNDARY, empty_state: rows.length ? null : "sem_referencias_canonicas" });
      } catch { return json(res, 503, { error: "compliance_journey_unavailable" }); }
    }
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const parsed = await parsedMutation(req, res);
    if (!parsed) return;
    return createDocument(req, res, parsed, null);
  }

  function documentInput(body, { renewal = false } = {}) {
    const obligationId = renewal ? null : String(body.obligation_id || "");
    const title = text(body.title, 5, 200);
    const description = text(body.description, 10, 2000);
    const type = DOCUMENT_TYPES.has(body.compliance_type) ? body.compliance_type : null;
    const issueDate = isoDate(body.issue_date);
    const effectiveStartDate = isoDate(body.effective_start_date || body.issue_date);
    const expiryDate = isoDate(body.expiry_date);
    const referenceType = text(body.reference_type, 3, 100);
    const declaredReference = text(body.declared_reference, 3, 1000);
    const referenceSource = text(body.reference_source, 3, 500);
    const documentNumber = body.document_number == null || body.document_number === "" ? null : text(body.document_number, 3, 200);
    const issuer = body.issuer == null || body.issuer === "" ? null : text(body.issuer, 3, 200);
    const justification = renewal ? text(body.justification, 10, 1000) : null;
    const valid = (renewal || UUID.test(obligationId)) && title && description && type && issueDate && effectiveStartDate && expiryDate
      && referenceType && declaredReference && referenceSource
      && !(body.document_number && !documentNumber) && !(body.issuer && !issuer)
      && (!renewal || justification)
      && issueDate <= effectiveStartDate && issueDate <= expiryDate && effectiveStartDate <= expiryDate;
    return valid ? { obligationId, title, description, type, issueDate, effectiveStartDate, expiryDate, referenceType, declaredReference, referenceSource, documentNumber, issuer, justification } : null;
  }

  async function createDocument(req, res, parsed, previousId) {
    const input = documentInput(parsed.body, { renewal: Boolean(previousId) });
    if (!input) return json(res, 400, { error: previousId ? "invalid_renewal" : "invalid_document" });
    const operation = previousId ? "document_renew" : "document_create";
    const request = { ...input, previousId: previousId || null };
    return mutate(res, {
      ...parsed, operation, request, auditAction: previousId ? "ext07_document_renew" : "ext07_document_create",
      work: async client => {
        let obligation;
        let previous = null;
        let documentId = randomUUID();
        if (previousId) {
          previous = (await client.query(
            `SELECT * FROM ext_compliance_documents
              WHERE id=$1 AND origin='ext07_canonica' FOR UPDATE`,
            [previousId],
          )).rows[0];
          if (!previous) return { deny: { status: 404, body: { error: "document_not_found" } } };
          if (previous.is_current !== true || ["cancelada", "substituida"].includes(String(previous.status))) return { deny: { status: 409, body: { error: "document_not_current" } } };
          obligation = await getObligation(client, previous.obligation_id, "FOR UPDATE");
        } else {
          obligation = await getObligation(client, input.obligationId, "FOR UPDATE");
        }
        if (!obligation) return { deny: { status: 404, body: { error: "obligation_not_found" } } };
        const responsible = await activeResponsible(client, obligation.responsible_identity);
        if (!responsible) return { deny: { status: 409, body: { error: "responsible_staff_missing" } } };
        if (!previous) {
          const current = (await client.query(
            `SELECT id FROM ext_compliance_documents
              WHERE obligation_id=$1 AND origin='ext07_canonica' AND is_current IS TRUE FOR UPDATE`,
            [obligation.id],
          )).rows[0];
          if (current) return { deny: { status: 409, body: { error: "renewal_required", current_document_id: current.id } } };
        } else {
          await client.query(
            `UPDATE ext_compliance_documents
                SET is_current=false,status='substituida',superseded_by=$2,updated_at=NOW()
              WHERE id=$1`,
            [previous.id, documentId],
          );
        }
        const version = previous ? Number(previous.version_no) + 1 : 1;
        const row = (await client.query(
          `INSERT INTO ext_compliance_documents(
             id,protocol,title,description,compliance_type,status,document_number,issuer,
             responsible_name,responsible_identity,issue_date,effective_start_date,expiry_date,
             validity_rule,evaluation_date,reference_type,declared_reference,reference_source,
             is_private,created_by_identity,obligation_id,origin,replacement_of,version_no,
             is_current,renewal_justification,renewed_by_identity,renewed_at
           ) VALUES(
             $1,$2,$3,$4,$5,
             CASE WHEN $11::date<=CURRENT_DATE THEN 'vencida'::ext_compliance_status
                  WHEN $11::date<=CURRENT_DATE+$12::integer THEN 'a_vencer'::ext_compliance_status
                  ELSE 'vigente'::ext_compliance_status END,
             $6,$7,$8,$9,$10::date,$13::date,$11::date,$14,NULL,$15,$16,$17,
             true,$18,$19,'ext07_canonica',$20,$21,true,$22,$23,
             CASE WHEN $20::uuid IS NULL THEN NULL ELSE NOW() END
           ) RETURNING id,protocol,title,compliance_type,status,obligation_id,origin,
                       issue_date,effective_start_date,expiry_date,reference_type,
                       version_no,is_current,is_private,created_by_identity,replacement_of,
                       superseded_by,renewal_justification,renewed_by_identity,renewed_at,created_at`,
          [documentId, protocol(), input.title, input.description, input.type, input.documentNumber,
            input.issuer, responsible.display_name, responsible.id, input.issueDate, input.expiryDate,
            obligation.renewal_lead_days, input.effectiveStartDate, obligation.validity_rule,
            input.referenceType, input.declaredReference, input.referenceSource,
            parsed.session.identityId, obligation.id, previous?.id || null, version,
            input.justification, previous ? parsed.session.identityId : null],
        )).rows[0];
        await client.query(
          `UPDATE ext_compliance_obligations
              SET status=$2,updated_at=NOW() WHERE id=$1`,
          [obligation.id, row.status],
        );
        const body = { document: row, message: "Referência privada registrada; não representa arquivo, bytes ou armazenamento verificado.", file_boundary: COMPLIANCE_DOCUMENT_BOUNDARY };
        if (previous) body.previous_document_id = previous.id;
        return {
          status: 201, body, obligationId: obligation.id, documentId: row.id,
          eventType: previous ? "document_renewed" : "document_created", target: row.id,
          auditMeta: { obligation_id: obligation.id, version_no: version, replacement_of: previous?.id || null },
        };
      },
    });
  }

  async function handleDocumentDetail(req, res, id) {
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_document_id" });
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    if (!await guard(req, res)) return;
    const detail = await getDocumentDetail(pool, id);
    return detail ? json(res, 200, detail) : json(res, 404, { error: "document_not_found" });
  }

  async function handleRenew(req, res, id) {
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_document_id" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const parsed = await parsedMutation(req, res);
    if (!parsed) return;
    return createDocument(req, res, parsed, id);
  }

  async function handleEvaluate(req, res) {
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const parsed = await parsedMutation(req, res);
    if (!parsed) return;
    if (Object.keys(parsed.body).length) return json(res, 400, { error: "server_clock_only" });
    return mutate(res, {
      ...parsed, operation: "expiry_evaluate", request: {}, auditAction: "ext07_expiry_evaluate",
      work: async client => {
        const currentDate = (await client.query("SELECT CURRENT_DATE::text AS date_base")).rows[0].date_base;
        const rows = (await client.query(
          `SELECT d.*,o.renewal_lead_days,o.responsible_identity AS obligation_responsible,
                  CASE WHEN d.expiry_date<=CURRENT_DATE THEN 'vencida'
                       WHEN d.expiry_date<=CURRENT_DATE+o.renewal_lead_days THEN 'a_vencer'
                       ELSE 'vigente' END AS derived_status
             FROM ext_compliance_documents d
             JOIN ext_compliance_obligations o ON o.id=d.obligation_id
            WHERE d.origin='ext07_canonica' AND d.is_current IS TRUE
            ORDER BY d.id FOR UPDATE OF d,o`,
        )).rows;
        for (const document of rows) {
          if (!await activeResponsible(client, document.obligation_responsible)) {
            return { deny: { status: 409, body: { error: "responsible_staff_missing", document_id: document.id } } };
          }
        }
        const tasks = [];
        let created = 0;
        for (const document of rows) {
          const expiryDate = databaseDate(document.expiry_date);
          const state = document.derived_status;
          await client.query(
            `UPDATE ext_compliance_documents
                SET status=$2,evaluation_date=CURRENT_DATE,updated_at=NOW() WHERE id=$1`,
            [document.id, state],
          );
          await client.query(`UPDATE ext_compliance_obligations SET status=$2,updated_at=NOW() WHERE id=$1`, [document.obligation_id, state]);
          if (expiryDate > currentDate) continue;
          const validityPeriod = `${databaseDate(document.issue_date)}:${expiryDate}:v${document.version_no}`;
          const rule = "expiry_at_or_before_server_date";
          const facts = { source: "ext_compliance_documents", date_base: currentDate, expiry_date: expiryDate, comparison: "expiry_date <= date_base", document_status: state };
          const task = (await client.query(
            `INSERT INTO ext_compliance_tasks(
               obligation_id,document_id,validity_period,rule,evaluation_date,due_date,
               facts,responsible_identity,created_by_identity
             ) VALUES($1,$2,$3,$4,CURRENT_DATE,$5,$6,$7,$8)
             ON CONFLICT(document_id,validity_period,rule) DO NOTHING
             RETURNING id,obligation_id,document_id,validity_period,rule,evaluation_date,
                       due_date,facts,responsible_identity,status,created_by_identity,created_at`,
            [document.obligation_id, document.id, validityPeriod, rule, expiryDate,
              JSON.stringify(facts), document.obligation_responsible, parsed.session.identityId],
          )).rows[0];
          if (task) { tasks.push(task); created += 1; }
        }
        const body = {
          source: "ext_compliance_documents",
          date_base: currentDate,
          rule: "expiry_at_or_before_server_date",
          facts: { current_documents: rows.length, expired_or_due: rows.filter(row => databaseDate(row.expiry_date) <= currentDate).length },
          denominator: rows.length,
          absence: rows.length ? null : "sem_documentos_atuais",
          evaluated: rows.length,
          tasks_created: created,
          tasks,
          continuous_monitoring: "A avaliação é administrativa e explícita; monitoramento contínuo exige execução agendada futura.",
        };
        return { status: 200, body, eventType: "expiry_evaluated", target: parsed.session.identityId, auditMeta: { date_base: currentDate, denominator: rows.length, tasks_created: created } };
      },
    });
  }

  async function handleTasks(req, res) {
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    if (!await guard(req, res)) return;
    const rows = (await pool.query(
      `SELECT t.id,t.obligation_id,t.document_id,t.validity_period,t.rule,
              t.evaluation_date,t.due_date,t.facts,t.responsible_identity,t.status,
              t.completion_result,t.cancellation_justification,t.created_by_identity,
              t.started_by_identity,t.completed_by_identity,t.cancelled_by_identity,
              t.created_at,t.started_at,t.completed_at,t.cancelled_at,t.updated_at,
              i.display_name AS responsible_name
         FROM ext_compliance_tasks t
         JOIN auth_identities i ON i.id=t.responsible_identity
        ORDER BY t.created_at DESC LIMIT 200`,
    )).rows;
    return json(res, 200, { items: rows, source: "ext_compliance_tasks", denominator: rows.length, absence: rows.length ? null : "sem_tarefas" });
  }

  async function handleTaskTransition(req, res, id, operation) {
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_task_id" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const parsed = await parsedMutation(req, res);
    if (!parsed) return;
    const result = operation === "complete" ? text(parsed.body.result, 10, 2000) : null;
    const justification = operation === "cancel" ? text(parsed.body.justification, 10, 1000) : null;
    if (operation === "complete" && !result) return json(res, 400, { error: "completion_result_required" });
    if (operation === "cancel" && !justification) return json(res, 400, { error: "cancellation_justification_required" });
    const request = { id, operation, result, justification };
    return mutate(res, {
      ...parsed, operation: `task_${operation}`, request, auditAction: `ext07_task_${operation}`,
      work: async client => {
        const task = (await client.query(`SELECT * FROM ext_compliance_tasks WHERE id=$1 FOR UPDATE`, [id])).rows[0];
        if (!task) return { deny: { status: 404, body: { error: "task_not_found" } } };
        const next = operation === "start" ? "em_andamento" : operation === "complete" ? "concluida" : "cancelada";
        if (!COMPLIANCE_TASK_TRANSITIONS[task.status]?.includes(next)) return { deny: { status: 409, body: { error: "task_terminal_or_invalid_transition" } } };
        if (!await activeResponsible(client, task.responsible_identity)) return { deny: { status: 409, body: { error: "responsible_staff_missing" } } };
        let row;
        if (operation === "start") {
          row = (await client.query(
            `UPDATE ext_compliance_tasks
                SET status='em_andamento',started_at=NOW(),started_by_identity=$2,updated_at=NOW()
              WHERE id=$1 RETURNING *`,
            [id, parsed.session.identityId],
          )).rows[0];
        } else if (operation === "complete") {
          row = (await client.query(
            `UPDATE ext_compliance_tasks
                SET status='concluida',completion_result=$2,completed_at=NOW(),
                    completed_by_identity=$3,updated_at=NOW()
              WHERE id=$1 RETURNING *`,
            [id, result, parsed.session.identityId],
          )).rows[0];
        } else {
          row = (await client.query(
            `UPDATE ext_compliance_tasks
                SET status='cancelada',cancellation_justification=$2,cancelled_at=NOW(),
                    cancelled_by_identity=$3,updated_at=NOW()
              WHERE id=$1 RETURNING *`,
            [id, justification, parsed.session.identityId],
          )).rows[0];
        }
        return { status: 200, body: { task: row }, obligationId: task.obligation_id, documentId: task.document_id, taskId: task.id, eventType: `task_${operation}`, target: task.id, auditMeta: { operation } };
      },
    });
  }

  async function handleLegacy(req, res) {
    const write = req.method !== "GET";
    const session = await guard(req, res, { write });
    if (!session) return;
    if (write) return json(res, 410, { error: "legacy_writer_retired", canonical: "/api/ext/compliance/*" });
    const rows = (await pool.query(
      `SELECT id,protocol,title,compliance_type,status,obligation_id,origin,
              issue_date,effective_start_date,expiry_date,reference_type,
              version_no,is_current,is_private,created_at
         FROM ext_compliance_documents
        ORDER BY expiry_date NULLS LAST,created_at DESC LIMIT 200`,
    )).rows.map(documentProjection);
    return json(res, 200, { items: rows, source: "ext_compliance_documents", canonical: "/api/ext/compliance/documents", file_boundary: COMPLIANCE_DOCUMENT_BOUNDARY });
  }

  async function handle(req, res) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/api/ext/compliance/obligations") return handleObligations(req, res);
    if (pathname === "/api/ext/compliance/documents") return handleDocuments(req, res);
    if (pathname === "/api/ext/compliance/evaluate") return handleEvaluate(req, res);
    if (pathname === "/api/ext/compliance/tasks") return handleTasks(req, res);
    const renewal = pathname.match(/^\/api\/ext\/compliance\/documents\/([^/]+)\/renew$/i);
    if (renewal) return handleRenew(req, res, renewal[1]);
    const detail = pathname.match(/^\/api\/ext\/compliance\/documents\/([^/]+)$/i);
    if (detail) return handleDocumentDetail(req, res, detail[1]);
    const transition = pathname.match(/^\/api\/ext\/compliance\/tasks\/([^/]+)\/(start|complete|cancel)$/i);
    if (transition) return handleTaskTransition(req, res, transition[1], transition[2]);
    return json(res, 404, { error: "not_found" });
  }

  return { handle, handleLegacy };
}
