// EXT-07 — compliance corporativo canônico (endurecimento pós-PR #103).
// Fonte canônica: ext_compliance_documents (herdada da migração 086, estendida
// pelas 153/154). Fonte dedicada de tarefa: ext_compliance_tasks — única por
// documento/período/regra declarada, responsável staff canônico obrigatório
// (falha fechada). Jornada exclusivamente interna de staff: nenhuma rota
// pública, nenhum ator externo. A "referência privada" declarada em cada
// documento NUNCA representa upload, bytes, checksum, varredura de malware,
// armazenamento verificado ou download — apenas um dado declarado pelo staff.
import { createHash, randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STAFF_ROLES = ["admin", "ti"];
const CRITICALITIES = ["baixa", "media", "alta", "critica"];
const COMPLIANCE_TYPES = ["licenca", "certidao", "seguro", "alvara", "outro"];
const BODY_LIMIT = 32 * 1024;
const FILE_BOUNDARY = "Referência documental privada e declarada pelo staff; não representa upload, bytes, checksum, varredura de malware, armazenamento verificado ou download reais.";

const LIST_COLUMNS = "id,protocol,title,description,compliance_type,status,obligation_id,origin,effective_start_date,issue_date,expiry_date,reference_type,is_private,version_no,superseded_at,replacement_of,created_at,updated_at";
const DETAIL_COLUMNS = `${LIST_COLUMNS},document_number,issuer,responsible_identity,responsible_name,validity_rule,evaluation_date,declared_reference,reference_source,renewal_justification,superseded_by_identity,cancellation_justification,created_by_identity`;

const txt = (v, min, max) => typeof v === "string" && v.trim().length >= min && v.trim().length <= max ? v.trim() : null;
const day = v => typeof v === "string" && DATE.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v ? v : null;
const fingerprint = value => createHash("sha256").update(JSON.stringify(value, Object.keys(value).sort())).digest("hex");
const protocol = () => `COMP-EXT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 4).toUpperCase()}`;

export function createExtComplianceApi({ pool, sameOrigin, requireSession }) {
  const json = (res, status, value) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(value)); };

  // Fail-closed: sessão ausente -> 401; papel não autorizado -> 403; escrita
  // fora da mesma origem -> 403. Nunca confunde uma coisa com a outra, e nunca
  // deixa a resposta HTTP sem terminar (bug corrigido da entrega anterior).
  async function staffGuard(req, res, write = false) {
    let s;
    try { s = await requireSession(req); } catch { s = null; }
    if (!s) { json(res, 401, { error: "unauthorized" }); return null; }
    const role = String(s.role || s.userRole || "").toLowerCase();
    if (!STAFF_ROLES.includes(role)) { json(res, 403, { error: "forbidden_role" }); return null; }
    if (write && !sameOrigin(req)) { json(res, 403, { error: "origin_forbidden" }); return null; }
    if (write && !UUID.test(String(s.identityId || ""))) { json(res, 401, { error: "unauthorized" }); return null; }
    return s;
  }

  async function readBody(req, res) {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > BODY_LIMIT) { json(res, 413, { error: "body_too_large" }); return null; }
      chunks.push(chunk);
    }
    let value;
    try { value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
    catch { json(res, 400, { error: "invalid_json" }); return null; }
    if (!value || typeof value !== "object" || Array.isArray(value)) { json(res, 400, { error: "object_required" }); return null; }
    return value;
  }

  function idemKey(req, res) {
    const key = String(req.headers["idempotency-key"] || "").trim();
    if (!KEY.test(key)) { json(res, 400, { error: "idempotency_key_required" }); return null; }
    return key;
  }

  async function activeStaffRow(c, id) {
    if (!UUID.test(String(id || ""))) return null;
    const q = await c.query(
      `SELECT i.id, i.display_name FROM auth_identities i
         JOIN auth_staff_profiles p ON p.identity_id = i.id
        WHERE i.id = $1 AND i.kind = 'staff' AND i.status = 'active' AND p.role = ANY($2::text[])`,
      [id, STAFF_ROLES]);
    return q.rows[0] || null;
  }

  // Transação canônica: BEGIN -> lock de replay -> trabalho -> evento imutável
  // -> audit_log -> COMMIT. Falha de audit_log faz ROLLBACK e devolve 503 sem
  // deixar obrigação/documento/tarefa/evento alterados — nunca usa o helper
  // legado tolerante a falha do restante do servidor.
  async function mutate(res, { identity, key, fp, auditAction, target, work }) {
    let c;
    try {
      c = await pool.connect();
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ext07:${identity}:${key}`]);
      const prior = (await c.query(
        `SELECT * FROM ext_compliance_events WHERE created_by_identity = $1 AND idempotency_key = $2`,
        [identity, key])).rows[0];
      if (prior) {
        if (prior.request_fingerprint !== fp) { await c.query("ROLLBACK"); return json(res, 409, { error: "idempotency_key_reused" }); }
        await c.query("COMMIT");
        return json(res, 200, { ...prior.payload, replayed: true });
      }
      const out = await work(c);
      if (out.deny) { await c.query("ROLLBACK"); return json(res, out.deny.status, out.deny.body); }
      await c.query(
        `INSERT INTO ext_compliance_events(obligation_id,document_id,task_id,event_type,payload,idempotency_key,request_fingerprint,created_by_identity)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [out.obligationId || null, out.documentId || null, out.taskId || null, out.eventType, JSON.stringify(out.body), key, fp, identity]);
      try {
        await c.query(`INSERT INTO audit_log(action,actor,target,meta) VALUES($1,$2,$3,$4)`,
          [auditAction, identity, String(out.target ?? target ?? ""), JSON.stringify(out.auditMeta || {})]);
      } catch (error) {
        await c.query("ROLLBACK");
        console.error("EXT-07 audit unavailable", error?.message || error);
        return json(res, 503, { error: "audit_unavailable" });
      }
      await c.query("COMMIT");
      return json(res, out.status || 200, out.body);
    } catch (error) {
      await c?.query("ROLLBACK").catch(() => {});
      console.error("EXT-07 mutation failed", error?.message || error);
      return json(res, error?.code === "23505" ? 409 : 503, { error: error?.code === "23505" ? "conflict" : "compliance_journey_unavailable" });
    } finally { c?.release(); }
  }

  async function references(req, res) {
    const s = await staffGuard(req, res); if (!s) return;
    const staff = (await pool.query(
      `SELECT i.id, i.display_name, p.role FROM auth_identities i
         JOIN auth_staff_profiles p ON p.identity_id = i.id
        WHERE i.kind = 'staff' AND i.status = 'active' AND p.role = ANY($1::text[])
        ORDER BY i.display_name LIMIT 200`, [STAFF_ROLES])).rows;
    const obligations = (await pool.query(`SELECT id, title, status FROM ext_compliance_obligations ORDER BY title LIMIT 200`)).rows;
    return json(res, 200, { staff, obligations, sources: ["auth_identities", "auth_staff_profiles", "ext_compliance_obligations"] });
  }

  async function obligationsList(req, res) {
    const s = await staffGuard(req, res); if (!s) return;
    try {
      const rows = (await pool.query(
        `SELECT o.*, i.display_name responsible_name FROM ext_compliance_obligations o
           JOIN auth_identities i ON i.id = o.responsible_identity
          ORDER BY o.created_at DESC LIMIT 200`)).rows;
      return json(res, 200, {
        items: rows, obligations: rows, source: "ext_compliance_obligations",
        aggregate: { source: "ext_compliance_obligations", denominator: rows.length, absence: rows.length ? null : "sem_obrigacoes_registradas" },
        empty_state: rows.length ? null : "Nenhuma obrigação registrada; não há seed.",
      });
    } catch (error) {
      console.error("EXT-07 obligations list failed", error?.message || error);
      return json(res, 503, { error: "compliance_journey_unavailable" });
    }
  }

  async function obligationDetail(req, res, id) {
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_reference" });
    const s = await staffGuard(req, res); if (!s) return;
    const obligation = (await pool.query(
      `SELECT o.*, i.display_name responsible_name FROM ext_compliance_obligations o
         JOIN auth_identities i ON i.id = o.responsible_identity WHERE o.id = $1`, [id])).rows[0];
    if (!obligation) return json(res, 404, { error: "not_found" });
    const documents = (await pool.query(
      `SELECT ${LIST_COLUMNS} FROM ext_compliance_documents WHERE obligation_id = $1 AND origin = 'ext07_canonica' ORDER BY version_no`, [id])).rows;
    const tasks = (await pool.query(
      `SELECT id,document_id,validity_period,rule,evaluation_date,due_date,facts,responsible_identity,status,completion_result,cancellation_justification,created_at,started_at,completed_at,cancelled_at
         FROM ext_compliance_tasks WHERE obligation_id = $1 ORDER BY created_at DESC`, [id])).rows;
    return json(res, 200, { obligation, documents, tasks });
  }

  async function obligationCreate(req, res) {
    const s = await staffGuard(req, res, true); if (!s) return;
    const b = await readBody(req, res); if (!b) return;
    const key = idemKey(req, res); if (!key) return;
    const type = txt(b.obligation_type, 3, 100);
    const title = txt(b.title, 5, 200);
    const description = txt(b.description, 10, 2000);
    const source = txt(b.declared_source, 5, 1000);
    const scope = txt(b.applicability_scope, 3, 500);
    const justification = txt(b.applicability_justification, 10, 2000);
    const rule = txt(b.validity_rule, 5, 500);
    const criticality = CRITICALITIES.includes(b.criticality) ? b.criticality : "media";
    const leadDays = Number.isInteger(b.renewal_lead_days) && b.renewal_lead_days >= 0 && b.renewal_lead_days <= 3650 ? b.renewal_lead_days : 30;
    const responsibleId = String(b.responsible_identity || "");
    if (!type || !title || !description || !source || !scope || !justification || !rule) return json(res, 400, { error: "invalid_obligation" });
    const fp = fingerprint({ op: "obligation_create", type, title, description, source, scope, justification, rule, criticality, leadDays, responsibleId });
    return mutate(res, {
      identity: s.identityId, key, fp, auditAction: "ext07_obligation_create", target: null,
      work: async c => {
        const staffRow = await activeStaffRow(c, responsibleId);
        if (!staffRow) return { deny: { status: 400, body: { error: "responsible_staff_required" } } };
        const row = (await c.query(
          `INSERT INTO ext_compliance_obligations(obligation_type,title,description,declared_source,applicability_scope,applicability_justification,validity_rule,renewal_lead_days,criticality,status,responsible_identity,created_by_identity)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendente',$10,$11) RETURNING *`,
          [type, title, description, source, scope, justification, rule, leadDays, criticality, responsibleId, s.identityId])).rows[0];
        return { status: 201, body: { obligation: { ...row, responsible_name: staffRow.display_name } }, obligationId: row.id, target: row.id, eventType: "obligation_created", auditMeta: { obligation_type: type, criticality } };
      },
    });
  }

  async function documentsList(req, res) {
    const s = await staffGuard(req, res); if (!s) return;
    try {
      const rows = (await pool.query(`SELECT ${LIST_COLUMNS} FROM ext_compliance_documents WHERE origin = 'ext07_canonica' ORDER BY expiry_date NULLS LAST, created_at DESC LIMIT 200`)).rows;
      const agg = (await pool.query(
        `SELECT count(*)::int denominator,
                count(*) FILTER (WHERE status::text = 'vencida')::int overdue,
                count(*) FILTER (WHERE superseded_at IS NULL)::int current_versions
           FROM ext_compliance_documents WHERE origin = 'ext07_canonica'`)).rows[0];
      return json(res, 200, {
        items: rows, documents: rows, source: "ext_compliance_documents", file_boundary: FILE_BOUNDARY,
        aggregate: { source: "ext_compliance_documents", denominator: agg.denominator, overdue: agg.overdue, current_versions: agg.current_versions, absence: agg.denominator ? null : "sem_documentos_canonicos" },
        criterion: "Vencimento gera tarefa e documento privado.",
        empty_state: rows.length ? null : "Nenhum documento canônico; não há seed.",
      });
    } catch (error) {
      console.error("EXT-07 documents list failed", error?.message || error);
      return json(res, 503, { error: "compliance_journey_unavailable" });
    }
  }

  async function documentDetail(req, res, id) {
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_reference" });
    const s = await staffGuard(req, res); if (!s) return;
    const row = (await pool.query(`SELECT ${DETAIL_COLUMNS} FROM ext_compliance_documents WHERE id = $1 AND origin = 'ext07_canonica'`, [id])).rows[0];
    if (!row) return json(res, 404, { error: "not_found" });
    const history = (await pool.query(`SELECT ${LIST_COLUMNS} FROM ext_compliance_documents WHERE obligation_id = $1 AND origin = 'ext07_canonica' ORDER BY version_no`, [row.obligation_id])).rows;
    return json(res, 200, { document: row, history, file_boundary: FILE_BOUNDARY });
  }

  function validateDocumentInput(b) {
    const title = txt(b.title, 5, 200);
    const description = txt(b.description, 10, 2000);
    const complianceType = COMPLIANCE_TYPES.includes(b.compliance_type) ? b.compliance_type : null;
    const issue = day(b.issue_date);
    const expiry = day(b.expiry_date);
    const start = b.effective_start_date ? day(b.effective_start_date) : issue;
    const refType = txt(b.reference_type, 3, 100);
    const declaredRef = txt(b.declared_reference, 3, 1000);
    const refSource = b.reference_source ? txt(b.reference_source, 3, 500) : null;
    const documentNumber = b.document_number ? txt(b.document_number, 3, 200) : null;
    const issuer = b.issuer ? txt(b.issuer, 3, 200) : null;
    const ok = title && description && complianceType && issue && expiry && start && expiry >= issue && expiry >= start && refType && declaredRef;
    return { ok, title, description, complianceType, issue, expiry, start, refType, declaredRef, refSource, documentNumber, issuer };
  }

  async function documentCreate(req, res) {
    const s = await staffGuard(req, res, true); if (!s) return;
    const b = await readBody(req, res); if (!b) return;
    const key = idemKey(req, res); if (!key) return;
    const obligationId = String(b.obligation_id || "");
    if (!UUID.test(obligationId)) return json(res, 400, { error: "invalid_obligation" });
    const v = validateDocumentInput(b);
    if (!v.ok) return json(res, 400, { error: "invalid_document" });
    const fp = fingerprint({ op: "document_create", obligationId, ...v });
    return mutate(res, {
      identity: s.identityId, key, fp, auditAction: "ext07_document_create", target: null,
      work: async c => {
        const obligation = (await c.query(`SELECT * FROM ext_compliance_obligations WHERE id = $1 FOR UPDATE`, [obligationId])).rows[0];
        if (!obligation) return { deny: { status: 404, body: { error: "obligation_not_found" } } };
        if (["encerrada", "nao_aplicavel"].includes(obligation.status)) return { deny: { status: 409, body: { error: "obligation_terminal" } } };
        const staffRow = await activeStaffRow(c, obligation.responsible_identity);
        if (!staffRow) return { deny: { status: 409, body: { error: "responsible_staff_missing" } } };
        const existing = (await c.query(
          `SELECT id FROM ext_compliance_documents WHERE obligation_id = $1 AND origin = 'ext07_canonica' AND superseded_at IS NULL AND status::text <> 'cancelada'`,
          [obligationId])).rows[0];
        if (existing) return { deny: { status: 409, body: { error: "current_version_exists", canonical_action: `/api/ext/compliance/documents/${existing.id}/renew` } } };
        const row = (await c.query(
          `INSERT INTO ext_compliance_documents(
             protocol,title,description,compliance_type,status,document_number,issuer,responsible_name,responsible_identity,
             issue_date,effective_start_date,expiry_date,validity_rule,evaluation_date,reference_type,declared_reference,reference_source,
             is_private,created_by_identity,obligation_id,origin,version_no)
           VALUES($1,$2,$3,$4,(CASE WHEN $11::date < CURRENT_DATE THEN 'vencida' ELSE 'vigente' END)::ext_compliance_status,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_DATE,$13,$14,$15,true,$16,$17,'ext07_canonica',1)
           RETURNING ${DETAIL_COLUMNS}`,
          [protocol(), v.title, v.description, v.complianceType, v.documentNumber, v.issuer, staffRow.display_name, obligation.responsible_identity,
            v.issue, v.start, v.expiry, obligation.validity_rule, v.refType, v.declaredRef, v.refSource, s.identityId, obligationId])).rows[0];
        await c.query(`UPDATE ext_compliance_obligations SET status = 'vigente', updated_at = NOW() WHERE id = $1`, [obligationId]);
        return { status: 201, body: { document: row, file_boundary: FILE_BOUNDARY }, obligationId, documentId: row.id, target: row.id, eventType: "document_created", auditMeta: { obligation_id: obligationId, protocol: row.protocol } };
      },
    });
  }

  async function documentRenew(req, res, id) {
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_reference" });
    const s = await staffGuard(req, res, true); if (!s) return;
    const b = await readBody(req, res); if (!b) return;
    const key = idemKey(req, res); if (!key) return;
    const issue = day(b.issue_date), expiry = day(b.expiry_date), start = b.effective_start_date ? day(b.effective_start_date) : issue;
    const justification = txt(b.renewal_justification, 10, 2000);
    const refType = txt(b.reference_type, 3, 100);
    const declaredRef = txt(b.declared_reference, 3, 1000);
    const refSource = b.reference_source ? txt(b.reference_source, 3, 500) : null;
    const documentNumber = b.document_number ? txt(b.document_number, 3, 200) : null;
    const issuer = b.issuer ? txt(b.issuer, 3, 200) : null;
    const title = b.title ? txt(b.title, 5, 200) : null;
    const description = b.description ? txt(b.description, 10, 2000) : null;
    if (!issue || !expiry || !start || expiry < issue || expiry < start || !justification || !declaredRef || !refType) return json(res, 400, { error: "invalid_renewal" });
    const fp = fingerprint({ op: "document_renew", id, issue, expiry, start, justification, declaredRef, refType, refSource, documentNumber, issuer, title, description });
    return mutate(res, {
      identity: s.identityId, key, fp, auditAction: "ext07_document_renew", target: id,
      work: async c => {
        const old = (await c.query(`SELECT * FROM ext_compliance_documents WHERE id = $1 FOR UPDATE`, [id])).rows[0];
        if (!old || old.origin !== "ext07_canonica") return { deny: { status: 404, body: { error: "document_not_found" } } };
        if (old.superseded_at) return { deny: { status: 409, body: { error: "document_already_superseded" } } };
        if (String(old.status) === "cancelada") return { deny: { status: 409, body: { error: "document_cancelled" } } };
        const obligation = (await c.query(`SELECT * FROM ext_compliance_obligations WHERE id = $1 FOR UPDATE`, [old.obligation_id])).rows[0];
        if (!obligation) return { deny: { status: 404, body: { error: "obligation_not_found" } } };
        if (["encerrada", "nao_aplicavel"].includes(obligation.status)) return { deny: { status: 409, body: { error: "obligation_terminal" } } };
        const staffRow = await activeStaffRow(c, obligation.responsible_identity);
        if (!staffRow) return { deny: { status: 409, body: { error: "responsible_staff_missing" } } };
        const nextVersion = Number(old.version_no || 1) + 1;
        // A linha anterior precisa ser marcada como substituída ANTES do INSERT
        // da nova versão: o índice único parcial (obligation_id) WHERE
        // superseded_at IS NULL AND status <> 'cancelada' só permite uma linha
        // "corrente" por obrigação, e a antiga ainda conta como corrente até
        // este UPDATE rodar. Ordem invertida causava 409 falso (23505) em toda
        // renovação válida.
        await c.query(`UPDATE ext_compliance_documents SET superseded_at = NOW(), superseded_by_identity = $2, updated_at = NOW() WHERE id = $1`, [old.id, s.identityId]);
        const row = (await c.query(
          `INSERT INTO ext_compliance_documents(
             protocol,title,description,compliance_type,status,document_number,issuer,responsible_name,responsible_identity,
             issue_date,effective_start_date,expiry_date,validity_rule,evaluation_date,reference_type,declared_reference,reference_source,
             is_private,created_by_identity,obligation_id,origin,version_no,replacement_of,renewal_justification)
           VALUES($1,$2,$3,$4,(CASE WHEN $11::date < CURRENT_DATE THEN 'vencida' ELSE 'vigente' END)::ext_compliance_status,$5,$6,$7,$8,$9,$10,$11,$12,CURRENT_DATE,$13,$14,$15,true,$16,$17,'ext07_canonica',$18,$19,$20)
           RETURNING ${DETAIL_COLUMNS}`,
          [protocol(), title || old.title, description || old.description, old.compliance_type, documentNumber || old.document_number, issuer || old.issuer,
            staffRow.display_name, obligation.responsible_identity, issue, start, expiry, obligation.validity_rule, refType, declaredRef, refSource,
            s.identityId, old.obligation_id, nextVersion, old.id, justification])).rows[0];
        await c.query(`UPDATE ext_compliance_obligations SET status = 'vigente', updated_at = NOW() WHERE id = $1`, [old.obligation_id]);
        return { status: 201, body: { document: row, superseded_document_id: old.id, file_boundary: FILE_BOUNDARY }, obligationId: old.obligation_id, documentId: row.id, target: row.id, eventType: "document_renewed", auditMeta: { replaces: old.id, version: nextVersion } };
      },
    });
  }

  // Avaliação de vencimento — usa somente a data do banco (CURRENT_DATE),
  // nunca a data enviada pelo cliente ou o relógio do processo Node. Cria
  // tarefa na MESMA transação do documento/obrigação e falha fechada (não
  // cria tarefa) quando o responsável canônico não está ativo.
  async function evaluate(req, res) {
    const s = await staffGuard(req, res, true); if (!s) return;
    const b = await readBody(req, res); if (!b) return;
    const key = idemKey(req, res); if (!key) return;
    const fp = fingerprint({ op: "evaluate_expiry" });
    return mutate(res, {
      identity: s.identityId, key, fp, auditAction: "ext07_expiry_evaluate", target: s.identityId,
      work: async c => {
        const base = (await c.query(`SELECT CURRENT_DATE::text AS d`)).rows[0].d;
        // Inclui documentos que JÁ nasceram "vencida" (expiry_date no passado
        // no momento da criação — o servidor nunca cria "vigente" inconsistente,
        // ver documentCreate/documentRenew), não só os que transicionam agora.
        // Sem isto, um documento cadastrado retroativamente como já vencido
        // nunca ganharia tarefa, pois a cláusula excluiria logo o único estado
        // em que ele poderia aparecer aqui. A deduplicação por (document_id,
        // validity_period, rule) com ON CONFLICT DO NOTHING garante que
        // reavaliações repetidas continuem sem duplicar.
        const due = (await c.query(
          `SELECT d.id, d.obligation_id, d.issue_date, d.effective_start_date, d.expiry_date, o.responsible_identity
             FROM ext_compliance_documents d JOIN ext_compliance_obligations o ON o.id = d.obligation_id
            WHERE d.origin = 'ext07_canonica' AND d.superseded_at IS NULL AND d.status::text <> 'cancelada'
              AND d.expiry_date IS NOT NULL AND d.expiry_date <= $1::date
            FOR UPDATE OF d`, [base])).rows;
        let created = 0, blocked = 0;
        const blockedDocuments = [];
        for (const doc of due) {
          await c.query(`UPDATE ext_compliance_documents SET status = 'vencida', evaluation_date = $2, updated_at = NOW() WHERE id = $1`, [doc.id, base]);
          await c.query(`UPDATE ext_compliance_obligations SET status = 'vencida', updated_at = NOW() WHERE id = $1 AND status::text NOT IN ('encerrada','nao_aplicavel')`, [doc.obligation_id]);
          const staffRow = await activeStaffRow(c, doc.responsible_identity);
          if (!staffRow) { blocked++; blockedDocuments.push(doc.id); continue; }
          const period = `${doc.effective_start_date || doc.issue_date}:${doc.expiry_date}`;
          const rule = "expiry_at_or_before_evaluation_date";
          const inserted = (await c.query(
            `INSERT INTO ext_compliance_tasks(obligation_id,document_id,validity_period,rule,evaluation_date,due_date,facts,responsible_identity,created_by_identity)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (document_id,validity_period,rule) DO NOTHING RETURNING id`,
            [doc.obligation_id, doc.id, period, rule, base, doc.expiry_date, JSON.stringify({ expiry_date: doc.expiry_date, evaluation_date: base, source: "server_clock" }), doc.responsible_identity, s.identityId])).rows[0];
          if (inserted) created++;
        }
        return {
          status: 200,
          body: { evaluated: due.length, tasks_created: created, blocked_missing_responsible: blocked, blocked_documents: blockedDocuments, evaluation_date: base, source: "server_clock", rule: "expiry_at_or_before_evaluation_date" },
          target: s.identityId, eventType: "expiry_evaluated", auditMeta: { evaluated: due.length, created, blocked },
        };
      },
    });
  }

  async function tasksList(req, res) {
    const s = await staffGuard(req, res); if (!s) return;
    const rows = (await pool.query(
      `SELECT id,obligation_id,document_id,validity_period,rule,evaluation_date,due_date,facts,responsible_identity,status,completion_result,cancellation_justification,created_at,started_at,completed_at,cancelled_at
         FROM ext_compliance_tasks ORDER BY due_date, created_at DESC LIMIT 200`)).rows;
    return json(res, 200, { items: rows, tasks: rows, source: "ext_compliance_tasks" });
  }

  async function taskTransition(req, res, id, action) {
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_reference" });
    const s = await staffGuard(req, res, true); if (!s) return;
    const b = await readBody(req, res); if (!b) return;
    const key = idemKey(req, res); if (!key) return;
    const note = action === "complete" ? txt(b.result, 10, 2000) : action === "cancel" ? txt(b.justification, 10, 1000) : txt(b.note, 0, 1000) || "";
    if (action === "complete" && !note) return json(res, 400, { error: "result_required" });
    if (action === "cancel" && !note) return json(res, 400, { error: "justification_required" });
    const fp = fingerprint({ op: `task_${action}`, id, note });
    return mutate(res, {
      identity: s.identityId, key, fp, auditAction: `ext07_task_${action}`, target: id,
      work: async c => {
        const t = (await c.query(`SELECT * FROM ext_compliance_tasks WHERE id = $1 FOR UPDATE`, [id])).rows[0];
        if (!t) return { deny: { status: 404, body: { error: "task_not_found" } } };
        if (["concluida", "cancelada"].includes(t.status)) return { deny: { status: 409, body: { error: "task_terminal" } } };
        if (action === "start" && t.status !== "aberta") return { deny: { status: 409, body: { error: "invalid_transition" } } };
        if (action === "complete") {
          if (!["aberta", "em_andamento"].includes(t.status)) return { deny: { status: 409, body: { error: "invalid_transition" } } };
          const staffRow = await activeStaffRow(c, t.responsible_identity);
          if (!staffRow) return { deny: { status: 409, body: { error: "responsible_required" } } };
        }
        const next = action === "start" ? "em_andamento" : action === "complete" ? "concluida" : "cancelada";
        const row = (await c.query(
          `UPDATE ext_compliance_tasks SET
             status = $2,
             completion_result = CASE WHEN $2 = 'concluida' THEN $3 ELSE completion_result END,
             cancellation_justification = CASE WHEN $2 = 'cancelada' THEN $3 ELSE cancellation_justification END,
             started_at = CASE WHEN $2 = 'em_andamento' THEN NOW() ELSE started_at END,
             completed_at = CASE WHEN $2 = 'concluida' THEN NOW() ELSE completed_at END,
             cancelled_at = CASE WHEN $2 = 'cancelada' THEN NOW() ELSE cancelled_at END
           WHERE id = $1 RETURNING *`,
          [id, next, note || null])).rows[0];
        return { status: 200, body: { task: row }, taskId: id, obligationId: t.obligation_id, documentId: t.document_id, target: id, eventType: `task_${action}`, auditMeta: { from: t.status, to: next } };
      },
    });
  }

  async function handle(req, res) {
    const p = new URL(req.url, "http://localhost").pathname;
    if (p === "/api/ext/compliance/references") return req.method === "GET" ? references(req, res) : json(res, 405, { error: "method_not_allowed" });
    if (p === "/api/ext/compliance/obligations") {
      if (req.method === "GET") return obligationsList(req, res);
      if (req.method === "POST") return obligationCreate(req, res);
      return json(res, 405, { error: "method_not_allowed" });
    }
    const obligationDetailMatch = p.match(/^\/api\/ext\/compliance\/obligations\/([0-9a-f-]{36})$/i);
    if (obligationDetailMatch) return req.method === "GET" ? obligationDetail(req, res, obligationDetailMatch[1]) : json(res, 405, { error: "method_not_allowed" });
    if (p === "/api/ext/compliance/documents") {
      if (req.method === "GET") return documentsList(req, res);
      if (req.method === "POST") return documentCreate(req, res);
      return json(res, 405, { error: "method_not_allowed" });
    }
    const renewMatch = p.match(/^\/api\/ext\/compliance\/documents\/([0-9a-f-]{36})\/renew$/i);
    if (renewMatch) return req.method === "POST" ? documentRenew(req, res, renewMatch[1]) : json(res, 405, { error: "method_not_allowed" });
    const documentDetailMatch = p.match(/^\/api\/ext\/compliance\/documents\/([0-9a-f-]{36})$/i);
    if (documentDetailMatch) return req.method === "GET" ? documentDetail(req, res, documentDetailMatch[1]) : json(res, 405, { error: "method_not_allowed" });
    if (p === "/api/ext/compliance/evaluate") return req.method === "POST" ? evaluate(req, res) : json(res, 405, { error: "method_not_allowed" });
    if (p === "/api/ext/compliance/tasks") return req.method === "GET" ? tasksList(req, res) : json(res, 405, { error: "method_not_allowed" });
    const taskMatch = p.match(/^\/api\/ext\/compliance\/tasks\/([0-9a-f-]{36})\/(start|complete|cancel)$/i);
    if (taskMatch) return req.method === "POST" ? taskTransition(req, res, taskMatch[1], taskMatch[2]) : json(res, 405, { error: "method_not_allowed" });
    return json(res, 404, { error: "not_found" });
  }

  return { handle };
}
