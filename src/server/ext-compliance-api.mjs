// EXT-07 — jornada interna canônica de compliance corporativo.
//
// Fonte canônica do documento: `ext_compliance_documents` (086) endurecida pela
// migração 153. Fonte da tarefa: `ext_compliance_tasks` (153) — ver justificativa
// na própria migração. Jornada exclusivamente de staff: não há ator externo,
// portal de órgão emissor, respondente, link público ou token documental.
//
// Documento é referência declarada e rastreável. Nada aqui cria upload, bytes,
// checksum, varredura de malware, download ou armazenamento verificado, e nada
// aqui consulta órgão público ou emite parecer jurídico.
//
// Toda mutação roda em uma transação que contém revalidação, replay da chave de
// idempotência, escrita de negócio, geração de tarefa quando a regra exige,
// evento imutável e `audit_log`. Falha da auditoria => ROLLBACK + 503.
import { createHash, randomUUID } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const ROLES = ["admin", "marcelo", "ti"];
const MAX_BODY = 32768;

export const COMPLIANCE_TYPES = Object.freeze(["licenca", "certidao", "seguro", "alvara", "outro"]);
export const SCOPE_KINDS = Object.freeze(["entidade", "unidade", "contrato", "operacao", "outro"]);
export const PERIODICITIES = Object.freeze(["unica", "mensal", "trimestral", "semestral", "anual", "sem_vencimento", "outra"]);
export const CRITICALITIES = Object.freeze(["baixa", "media", "alta", "critica"]);

export const COMPLIANCE_TRANSITIONS = Object.freeze({
  obligation: Object.freeze({
    rascunho: ["sem_documento", "nao_aplicavel", "encerrada"],
    sem_documento: ["vigente", "a_vencer", "vencida", "nao_aplicavel", "encerrada"],
    vigente: ["a_vencer", "vencida", "em_renovacao", "sem_documento", "nao_aplicavel", "encerrada"],
    a_vencer: ["vencida", "em_renovacao", "vigente", "sem_documento", "nao_aplicavel", "encerrada"],
    vencida: ["em_renovacao", "vigente", "sem_documento", "nao_aplicavel", "encerrada"],
    em_renovacao: ["vigente", "a_vencer", "vencida", "sem_documento", "nao_aplicavel", "encerrada"],
    nao_aplicavel: [],
    encerrada: [],
  }),
  document: Object.freeze({
    vigente: ["a_vencer", "vencida", "em_renovacao", "cancelada"],
    a_vencer: ["vencida", "em_renovacao", "cancelada"],
    vencida: ["em_renovacao", "substituida", "cancelada"],
    em_renovacao: ["substituida", "vencida", "cancelada"],
    substituida: [],
    cancelada: [],
  }),
  task: Object.freeze({
    aberta: ["em_andamento", "cancelada"],
    em_andamento: ["concluida", "cancelada"],
    concluida: [],
    cancelada: [],
  }),
});

// Fronteira declarada: nada abaixo é inventado como verificado.
export const COMPLIANCE_BOUNDARY = Object.freeze({
  journey: "staff_interno",
  external_actor: false,
  public_route: false,
  issuer_portal: false,
  upload: false,
  stored_bytes: false,
  verified_storage: false,
  checksum: false,
  malware_scan: false,
  download: false,
  regulator_integration: false,
  legal_opinion: false,
  continuous_monitoring: false,
  document: "referência documental privada declarada e rastreável; não é arquivo recebido, verificado, armazenado ou baixável",
  applicability: "aplicabilidade declarada pela equipe interna, com fonte; não é confirmação de órgão público nem parecer jurídico",
  evaluation: "a avaliação temporal é uma operação administrativa explícita; não existe scheduler canônico e não há monitoramento contínuo",
});

// Allowlist das listagens amplas: minimização imposta no servidor.
export const OBLIGATION_LIST_FIELDS = Object.freeze([
  "id", "protocol", "obligation_type", "title", "scope_kind", "scope_reference",
  "periodicity", "criticality", "status", "renewal_window_days",
  "responsible_display_name", "current_document_status", "open_task_count", "created_at",
]);
export const DOCUMENT_LIST_FIELDS = Object.freeze([
  "id", "protocol", "obligation_id", "version", "compliance_type", "title", "status",
  "is_current", "is_private", "issue_date", "validity_start", "expiry_date", "no_expiry",
  "renewal_window_days", "document_number_masked", "created_at",
]);
export const TASK_LIST_FIELDS = Object.freeze([
  "id", "protocol", "obligation_id", "document_id", "trigger_rule", "period_start",
  "period_end", "evaluation_base_date", "status", "responsible_display_name",
  "pending_reason", "created_at",
]);

const fingerprintOf = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const text = (v, min, max) => (typeof v === "string" && v.trim().length >= min && v.trim().length <= max ? v.trim() : null);
const dateOf = v => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v ? v : null);
const iso = v => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "string" ? v.slice(0, 10) : v);
const intIn = (v, min, max) => (Number.isSafeInteger(v) && v >= min && v <= max ? v : null);
const stamp = () => { const d = new Date(); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`; };
const suffix = () => createHash("sha256").update(`${Date.now()}:${randomUUID()}`).digest("hex").slice(0, 4).toUpperCase();
const protocolFor = prefix => `${prefix}-${stamp()}-${suffix()}`;
const maskNumber = value => {
  if (typeof value !== "string" || !value.length) return null;
  const tail = value.slice(-4);
  return value.length <= 4 ? `***${tail}` : `***${tail}`;
};
const daysBetween = (base, target) => Math.round((Date.parse(`${iso(target)}T00:00:00Z`) - Date.parse(`${iso(base)}T00:00:00Z`)) / 86400000);

// Estado do documento derivado exclusivamente da data-base do servidor e da
// janela registrada. Não há limiar global oculto.
export function deriveDocumentState({ baseDate, expiryDate, noExpiry, renewalWindowDays }) {
  if (noExpiry) return { status: "vigente", days_remaining: null, rule: null };
  const remaining = daysBetween(baseDate, expiryDate);
  if (remaining <= 0) return { status: "vencida", days_remaining: remaining, rule: "vencimento" };
  if (remaining <= renewalWindowDays) return { status: "a_vencer", days_remaining: remaining, rule: "janela_renovacao" };
  return { status: "vigente", days_remaining: remaining, rule: null };
}

export function createExtComplianceApi({ pool, sameOrigin, requireSession }) {
  const json = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
  const roleOf = s => String(s?.role || s?.userRole || "").toLowerCase();

  // 401 para anônimo, 403 para papel autenticado sem autorização, nesta ordem.
  async function guard(req, res, { write = false } = {}) {
    let session = null;
    try { session = await requireSession(req); } catch { session = null; }
    if (!session) { json(res, 401, { error: "unauthorized" }); return null; }
    if (!ROLES.includes(roleOf(session))) { json(res, 403, { error: "forbidden_role" }); return null; }
    if (!UUID.test(String(session.identityId || ""))) { json(res, 401, { error: "unauthorized" }); return null; }
    if (write && !sameOrigin(req)) { json(res, 403, { error: "origin_forbidden" }); return null; }
    return session;
  }

  // Lê o corpo uma única vez. Ao estourar o limite, para de bufferizar mas
  // drena o restante: abortar o stream no meio derruba a conexão keep-alive e
  // transformaria um 413 legítimo em erro de transporte para o cliente.
  async function readBody(req) {
    const chunks = []; let size = 0, large = false;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) {
        large = true;
        if (size > MAX_BODY * 64) { req.destroy(); break; }
        continue;
      }
      chunks.push(chunk);
    }
    if (large) return { large: true };
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      if (!value || typeof value !== "object" || Array.isArray(value)) return { invalid: true };
      return { value };
    } catch { return { invalid: true }; }
  }

  function idempotencyKey(req, res) {
    const value = String(req.headers["idempotency-key"] || "").trim();
    if (!KEY.test(value)) { json(res, 400, { error: "idempotency_key_required" }); return null; }
    return value;
  }

  // Lê guarda + corpo + chave uma única vez; nunca consome o corpo duas vezes.
  async function parsedWrite(req, res) {
    const session = await guard(req, res, { write: true });
    if (!session) return null;
    const parsed = await readBody(req);
    if (parsed.large) { json(res, 413, { error: "body_too_large" }); return null; }
    if (parsed.invalid) { json(res, 400, { error: "invalid_request" }); return null; }
    const key = idempotencyKey(req, res);
    return key ? { session, body: parsed.value, key } : null;
  }

  async function writeEvent(client, { obligationId = null, documentId = null, taskId = null, type, summary, payload, key, fingerprint, identity }) {
    await client.query(
      `INSERT INTO ext_compliance_events(obligation_id,document_id,task_id,event_type,summary,payload,idempotency_key,request_fingerprint,created_by_identity)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [obligationId, documentId, taskId, type, summary, JSON.stringify(payload || {}), key, fingerprint, identity],
    );
  }

  async function mutation(res, { session, key, fingerprint, auditAction, replay, work }) {
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      // Serializa a chave de idempotência ANTES de consultar o evento. Sem
      // isto duas requisições idênticas simultâneas não encontram evento
      // algum, ambas seguem para a regra de negócio e a perdedora devolve
      // conflito de negócio (409) em vez de replay — a idempotência só vale
      // se a janela entre consulta e gravação do evento for fechada.
      // Lock de transação: liberado no COMMIT/ROLLBACK, sem risco de vazamento.
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`ext07:${session.identityId}:${key}`]);
      const previous = await client.query(
        `SELECT * FROM ext_compliance_events WHERE created_by_identity=$1 AND idempotency_key=$2 FOR UPDATE`,
        [session.identityId, key],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].request_fingerprint !== fingerprint) { await client.query("ROLLBACK"); return json(res, 409, { error: "idempotency_key_reused" }); }
        const replayed = await replay(client, previous.rows[0]);
        await client.query("COMMIT");
        return json(res, 200, { ...replayed, replayed: true });
      }
      const out = await work(client);
      if (out.deny) { await client.query("ROLLBACK"); return json(res, out.deny.status, out.deny.body); }
      try {
        await client.query(`INSERT INTO audit_log(action,actor,target,meta) VALUES($1,$2,$3,$4)`, [auditAction, session.identityId, out.target, JSON.stringify(out.meta || {})]);
      } catch (error) {
        await client.query("ROLLBACK");
        console.error("EXT-07 audit unavailable", error?.message || error);
        return json(res, 503, { error: "audit_unavailable" });
      }
      await client.query("COMMIT");
      return json(res, out.status, out.body);
    } catch (error) {
      await client?.query("ROLLBACK").catch(() => {});
      if (error?.code === "23505" && /idempotency|ext_compliance_events/i.test(String(error.constraint || error.detail || ""))) {
        try {
          const previous = await client.query(`SELECT * FROM ext_compliance_events WHERE created_by_identity=$1 AND idempotency_key=$2`, [session.identityId, key]);
          if (previous.rows[0]) {
            if (previous.rows[0].request_fingerprint !== fingerprint) return json(res, 409, { error: "idempotency_key_reused" });
            return json(res, 200, { ...(await replay(client, previous.rows[0])), replayed: true });
          }
        } catch { /* cai no 503 abaixo */ }
      }
      console.error("EXT-07 mutation failed", error?.message || error);
      return json(res, 503, { error: "compliance_journey_unavailable" });
    } finally { client?.release(); }
  }

  async function activeStaff(client, identityId) {
    if (!UUID.test(String(identityId || ""))) return null;
    const { rows } = await client.query(
      `SELECT i.id,i.display_name,p.role FROM auth_identities i
       JOIN auth_staff_profiles p ON p.identity_id=i.id
       WHERE i.id=$1 AND i.kind='staff' AND i.status='active' AND p.role=ANY($2::text[]) FOR SHARE OF i`,
      [identityId, ROLES],
    );
    return rows[0] || null;
  }

  // ---------------------------------------------------------------- projeções
  const obligationListRow = row => ({
    id: row.id, protocol: row.protocol, obligation_type: row.obligation_type, title: row.title,
    scope_kind: row.scope_kind, scope_reference: row.scope_reference, periodicity: row.periodicity,
    criticality: row.criticality, status: row.status, renewal_window_days: row.renewal_window_days,
    responsible_display_name: row.responsible_display_name, current_document_status: row.current_document_status,
    open_task_count: Number(row.open_task_count || 0), created_at: row.created_at,
  });
  const documentListRow = row => ({
    id: row.id, protocol: row.protocol, obligation_id: row.obligation_id, version: row.version,
    compliance_type: row.compliance_type, title: row.title, status: row.status, is_current: row.is_current,
    is_private: row.is_private, issue_date: iso(row.issue_date), validity_start: iso(row.validity_start),
    expiry_date: iso(row.expiry_date), no_expiry: row.no_expiry, renewal_window_days: row.renewal_window_days,
    document_number_masked: maskNumber(row.document_number), created_at: row.created_at,
  });
  const taskListRow = row => ({
    id: row.id, protocol: row.protocol, obligation_id: row.obligation_id, document_id: row.document_id,
    trigger_rule: row.trigger_rule, period_start: iso(row.period_start), period_end: iso(row.period_end),
    evaluation_base_date: iso(row.evaluation_base_date), status: row.status,
    responsible_display_name: row.responsible_display_name ?? null, pending_reason: row.pending_reason,
    created_at: row.created_at,
  });
  // Detalhe autorizado: metadados necessários para gestão, sem storage_key,
  // sem file_url e sem apresentar referência como arquivo verificado.
  const documentDetailRow = row => ({
    ...documentListRow(row),
    description: row.description, document_number: row.document_number, issuer: row.issuer,
    responsible_identity: row.responsible_identity, responsible_display_name: row.responsible_display_name ?? null,
    validity_rule_source: row.validity_rule_source, evaluation_base_date: iso(row.evaluation_base_date),
    evaluated_at: row.evaluated_at, reference_kind: row.reference_kind, reference_value: row.reference_value,
    reference_source: row.reference_source, reference_note: row.reference_note,
    supersedes_document_id: row.supersedes_document_id, superseded_by_document_id: row.superseded_by_document_id,
    superseded_at: row.superseded_at, supersede_reason: row.supersede_reason,
    cancelled_at: row.cancelled_at, cancellation_justification: row.cancellation_justification,
    origin: row.origin, created_by_identity: row.created_by_identity,
    storage_boundary: "metadado/referência declarada; nenhum byte foi recebido, armazenado, verificado ou disponibilizado para download",
  });

  const OBLIGATION_SELECT = `
    SELECT o.*, ri.display_name responsible_display_name,
      (SELECT d.status::text FROM ext_compliance_documents d WHERE d.obligation_id=o.id AND d.is_current LIMIT 1) current_document_status,
      (SELECT count(*)::int FROM ext_compliance_tasks t WHERE t.obligation_id=o.id AND t.status IN ('aberta','em_andamento')) open_task_count
    FROM ext_compliance_obligations o
    LEFT JOIN auth_identities ri ON ri.id=o.responsible_identity`;
  const DOCUMENT_SELECT = `
    SELECT d.*, ri.display_name responsible_display_name FROM ext_compliance_documents d
    LEFT JOIN auth_identities ri ON ri.id=d.responsible_identity`;
  const TASK_SELECT = `
    SELECT t.*, ri.display_name responsible_display_name FROM ext_compliance_tasks t
    LEFT JOIN auth_identities ri ON ri.id=t.responsible_identity`;

  // ------------------------------------------------------- tarefa por regra
  // Cria, na mesma transação, exatamente uma tarefa para documento/período/regra.
  async function ensureTask(client, { document, obligation, baseDate, rule, facts, identity }) {
    const responsible = await activeStaff(client, obligation.responsible_identity);
    const pending = responsible ? null : "Responsável staff canônico ausente ou inativo: tarefa aberta em modo fail-closed, sem atribuição inventada.";
    const detail = {
      rule,
      renewal_window_days: document.renewal_window_days,
      validity_rule_source: document.validity_rule_source,
      obligation_periodicity: obligation.periodicity,
      source: "ext_compliance_obligations.renewal_window_days + ext_compliance_documents.expiry_date",
    };
    const { rows } = await client.query(
      `INSERT INTO ext_compliance_tasks(protocol,obligation_id,document_id,period_start,period_end,trigger_rule,trigger_rule_detail,trigger_facts,evaluation_base_date,responsible_identity,pending_reason,created_by_identity)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (document_id,period_end,trigger_rule) DO NOTHING RETURNING *`,
      [protocolFor("TRF-COMP"), obligation.id, document.id, iso(document.validity_start), iso(document.expiry_date), rule,
        JSON.stringify(detail), JSON.stringify(facts), baseDate, responsible?.id || null, pending, identity],
    );
    if (!rows[0]) {
      const existing = await client.query(`SELECT * FROM ext_compliance_tasks WHERE document_id=$1 AND period_end=$2 AND trigger_rule=$3`, [document.id, iso(document.expiry_date), rule]);
      return { task: existing.rows[0] || null, created: false };
    }
    return { task: rows[0], created: true };
  }

  async function syncObligationStatus(client, obligationId, nextStatus) {
    const current = (await client.query(`SELECT status::text status FROM ext_compliance_obligations WHERE id=$1 FOR UPDATE`, [obligationId])).rows[0];
    if (!current || current.status === nextStatus) return current?.status || null;
    if (!COMPLIANCE_TRANSITIONS.obligation[current.status]?.includes(nextStatus)) return current.status;
    await client.query(`UPDATE ext_compliance_obligations SET status=$2 WHERE id=$1`, [obligationId, nextStatus]);
    return nextStatus;
  }

  async function serverBaseDate(client) {
    return (await client.query(`SELECT CURRENT_DATE::text base`)).rows[0].base;
  }

  // ------------------------------------------------------------- handlers
  async function handleReferences(req, res) {
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    if (!await guard(req, res)) return;
    try {
      const { rows } = await pool.query(
        `SELECT i.id,i.display_name,p.role FROM auth_identities i JOIN auth_staff_profiles p ON p.identity_id=i.id
         WHERE i.kind='staff' AND i.status='active' AND p.role=ANY($1::text[]) ORDER BY i.display_name LIMIT 200`,
        [ROLES],
      );
      const base = (await pool.query(`SELECT CURRENT_DATE::text base`)).rows[0].base;
      return json(res, 200, {
        staff: rows, compliance_types: COMPLIANCE_TYPES, scope_kinds: SCOPE_KINDS,
        periodicities: PERIODICITIES, criticalities: CRITICALITIES,
        source: "auth_identities + auth_staff_profiles", server_base_date: base, boundary: COMPLIANCE_BOUNDARY,
      });
    } catch { return json(res, 503, { error: "compliance_journey_unavailable" }); }
  }

  async function handleObligationList(req, res) {
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    if (!await guard(req, res)) return;
    try {
      const { rows } = await pool.query(`${OBLIGATION_SELECT} ORDER BY o.created_at DESC LIMIT 200`);
      const base = (await pool.query(`SELECT CURRENT_DATE::text base`)).rows[0].base;
      const counters = {};
      for (const row of rows) counters[row.status] = (counters[row.status] || 0) + 1;
      return json(res, 200, {
        obligations: rows.map(obligationListRow),
        source: "ext_compliance_obligations",
        criterion: "Vencimento gera tarefa e documento privado",
        projection: "allowlist minimizada: sem storage_key, URL privada, número completo, notas internas ou auditoria",
        aggregate: {
          source: "ext_compliance_obligations",
          base_date: base,
          denominator: rows.length,
          by_status: counters,
          absence_note: rows.length ? null : "Ausência de dados: nenhuma obrigação registrada. Ausência não é zero medido.",
        },
        boundary: COMPLIANCE_BOUNDARY,
        empty_state: rows.length ? null : "Nenhuma obrigação de compliance registrada; o cluster limpo não recebe seed.",
      });
    } catch { return json(res, 503, { error: "compliance_journey_unavailable" }); }
  }

  async function handleDocumentList(req, res) {
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    if (!await guard(req, res)) return;
    try {
      const { rows } = await pool.query(`${DOCUMENT_SELECT} ORDER BY d.created_at DESC LIMIT 200`);
      const legacy = rows.filter(r => r.origin !== "jornada_canonica").length;
      return json(res, 200, {
        documents: rows.map(documentListRow),
        source: "ext_compliance_documents",
        legacy_rows: legacy,
        legacy_note: "Linhas com origin='registro_legado' vêm da migração 086 e não têm obrigação, responsável canônico, autoria, privacidade, regra de validade, tarefa ou armazenamento comprovados.",
        projection: "allowlist minimizada: file_url, storage_key, referência e número completo não são expostos em listagem",
        boundary: COMPLIANCE_BOUNDARY,
        empty_state: rows.length ? null : "Nenhum documento registrado; o cluster limpo não recebe seed.",
      });
    } catch { return json(res, 503, { error: "compliance_journey_unavailable" }); }
  }

  async function handleTaskList(req, res) {
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    if (!await guard(req, res)) return;
    try {
      const { rows } = await pool.query(`${TASK_SELECT} ORDER BY t.created_at DESC LIMIT 200`);
      const base = (await pool.query(`SELECT CURRENT_DATE::text base`)).rows[0].base;
      const counters = {};
      for (const row of rows) counters[row.status] = (counters[row.status] || 0) + 1;
      return json(res, 200, {
        tasks: rows.map(taskListRow),
        source: "ext_compliance_tasks",
        aggregate: {
          source: "ext_compliance_tasks", base_date: base, denominator: rows.length, by_status: counters,
          pending_without_responsible: rows.filter(r => !r.responsible_identity).length,
          absence_note: rows.length ? null : "Ausência de dados: nenhuma tarefa gerada. Ausência não é zero medido.",
        },
        boundary: COMPLIANCE_BOUNDARY,
        empty_state: rows.length ? null : "Nenhuma tarefa de vencimento gerada; a avaliação temporal é explícita e não há scheduler canônico.",
      });
    } catch { return json(res, 503, { error: "compliance_journey_unavailable" }); }
  }

  async function handleObligationDetail(req, res, id) {
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_reference" });
    if (!await guard(req, res)) return;
    try {
      const obligation = (await pool.query(`${OBLIGATION_SELECT} WHERE o.id=$1`, [id])).rows[0];
      if (!obligation) return json(res, 404, { error: "obligation_not_found" });
      const [documents, tasks, events] = await Promise.all([
        pool.query(`${DOCUMENT_SELECT} WHERE d.obligation_id=$1 ORDER BY d.version`, [id]),
        pool.query(`${TASK_SELECT} WHERE t.obligation_id=$1 ORDER BY t.created_at`, [id]),
        pool.query(`SELECT id,event_type,summary,payload,created_by_identity,created_at FROM ext_compliance_events WHERE obligation_id=$1 ORDER BY created_at`, [id]),
      ]);
      return json(res, 200, {
        obligation: {
          ...obligationListRow(obligation),
          description: obligation.description, legal_basis: obligation.legal_basis, basis_source: obligation.basis_source,
          applicability_justification: obligation.applicability_justification,
          validity_rule_source: obligation.validity_rule_source,
          responsible_identity: obligation.responsible_identity, created_by_identity: obligation.created_by_identity,
          closed_at: obligation.closed_at, closure_justification: obligation.closure_justification,
          updated_at: obligation.updated_at,
        },
        documents: documents.rows.map(documentDetailRow),
        tasks: tasks.rows.map(row => ({ ...taskListRow(row), trigger_rule_detail: row.trigger_rule_detail, trigger_facts: row.trigger_facts, completion_result: row.completion_result, cancellation_justification: row.cancellation_justification, started_at: row.started_at, completed_at: row.completed_at })),
        events: events.rows,
        boundary: COMPLIANCE_BOUNDARY,
      });
    } catch { return json(res, 503, { error: "compliance_journey_unavailable" }); }
  }

  async function handleObligationCreate(req, res) {
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const parsed = await parsedWrite(req, res);
    if (!parsed) return;
    const b = parsed.body;
    const title = text(b.title, 5, 200), description = text(b.description, 10, 2000);
    const legalBasis = text(b.legal_basis, 5, 500), basisSource = text(b.basis_source, 3, 300);
    const scopeReference = text(b.scope_reference, 3, 200), justification = text(b.applicability_justification, 10, 2000);
    const ruleSource = text(b.validity_rule_source, 3, 300);
    const type = COMPLIANCE_TYPES.includes(b.obligation_type) ? b.obligation_type : null;
    const scopeKind = SCOPE_KINDS.includes(b.scope_kind) ? b.scope_kind : null;
    const periodicity = PERIODICITIES.includes(b.periodicity) ? b.periodicity : null;
    const criticality = b.criticality === undefined || b.criticality === null || b.criticality === "" ? null : (CRITICALITIES.includes(b.criticality) ? b.criticality : undefined);
    const windowDays = periodicity === "sem_vencimento" ? 0 : intIn(b.renewal_window_days, 0, 365);
    const responsibleId = String(b.responsible_identity || "");
    if (!title || !description || !legalBasis || !basisSource || !scopeReference || !justification || !ruleSource || !type || !scopeKind || !periodicity || windowDays === null || criticality === undefined) {
      return json(res, 400, { error: "invalid_obligation" });
    }
    if (!UUID.test(responsibleId)) return json(res, 400, { error: "invalid_responsible_identity" });
    const fingerprint = fingerprintOf({ op: "obligation_create", title, type, scopeKind, scopeReference, periodicity, windowDays, responsibleId });
    return mutation(res, {
      session: parsed.session, key: parsed.key, fingerprint, auditAction: "ext_compliance_obligation_create",
      replay: async (client, event) => ({ obligation: obligationListRow((await client.query(`${OBLIGATION_SELECT} WHERE o.id=$1`, [event.obligation_id])).rows[0]) }),
      work: async client => {
        const responsible = await activeStaff(client, responsibleId);
        if (!responsible) return { deny: { status: 400, body: { error: "invalid_responsible_identity" } } };
        const { rows } = await client.query(
          `INSERT INTO ext_compliance_obligations(protocol,obligation_type,title,description,legal_basis,basis_source,scope_kind,scope_reference,applicability_justification,periodicity,validity_rule_source,renewal_window_days,criticality,status,responsible_identity,created_by_identity)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'sem_documento',$14,$15) RETURNING *`,
          [protocolFor("OBR-EXT"), type, title, description, legalBasis, basisSource, scopeKind, scopeReference, justification, periodicity, ruleSource, windowDays, criticality, responsible.id, parsed.session.identityId],
        );
        await writeEvent(client, { obligationId: rows[0].id, type: "obrigacao_registrada", summary: "Obrigação aplicável registrada com fundamento e escopo declarados.", payload: { scope_kind: scopeKind, periodicity, renewal_window_days: windowDays, basis_source: basisSource }, key: parsed.key, fingerprint, identity: parsed.session.identityId });
        const full = (await client.query(`${OBLIGATION_SELECT} WHERE o.id=$1`, [rows[0].id])).rows[0];
        return { status: 201, body: { obligation: obligationListRow(full), applicability_note: COMPLIANCE_BOUNDARY.applicability }, target: rows[0].id, meta: { protocol: rows[0].protocol, scope_kind: scopeKind } };
      },
    });
  }

  async function handleObligationClose(req, res, id) {
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_reference" });
    const parsed = await parsedWrite(req, res);
    if (!parsed) return;
    const justification = text(parsed.body.justification, 10, 1000);
    const target = ["nao_aplicavel", "encerrada"].includes(parsed.body.status) ? parsed.body.status : null;
    if (!justification || !target) return json(res, 400, { error: "justification_and_status_required" });
    const fingerprint = fingerprintOf({ op: "obligation_close", id, target, justification });
    return mutation(res, {
      session: parsed.session, key: parsed.key, fingerprint, auditAction: "ext_compliance_obligation_close",
      replay: async client => ({ obligation: obligationListRow((await client.query(`${OBLIGATION_SELECT} WHERE o.id=$1`, [id])).rows[0]) }),
      work: async client => {
        const current = (await client.query(`SELECT *,status::text status_text FROM ext_compliance_obligations WHERE id=$1 FOR UPDATE`, [id])).rows[0];
        if (!current) return { deny: { status: 404, body: { error: "obligation_not_found" } } };
        if (!COMPLIANCE_TRANSITIONS.obligation[current.status_text]?.includes(target)) return { deny: { status: 409, body: { error: "obligation_terminal_or_invalid_transition" } } };
        await client.query(`UPDATE ext_compliance_obligations SET status=$2,closed_at=NOW(),closed_by_identity=$3,closure_justification=$4 WHERE id=$1`, [id, target, parsed.session.identityId, justification]);
        await writeEvent(client, { obligationId: id, type: `obrigacao_${target}`, summary: "Obrigação formalmente encerrada com justificativa registrada.", payload: { target, justification }, key: parsed.key, fingerprint, identity: parsed.session.identityId });
        return { status: 200, body: { obligation: obligationListRow((await client.query(`${OBLIGATION_SELECT} WHERE o.id=$1`, [id])).rows[0]) }, target: id, meta: { target } };
      },
    });
  }

  function parseDocumentPayload(b) {
    const title = text(b.title, 5, 200), description = text(b.description, 10, 2000);
    const documentNumber = text(b.document_number, 3, 200), issuer = text(b.issuer, 3, 200);
    const issueDate = dateOf(b.issue_date), validityStart = dateOf(b.validity_start);
    const noExpiry = b.no_expiry === true;
    const expiryDate = noExpiry ? null : dateOf(b.expiry_date);
    const ruleSource = text(b.validity_rule_source, 3, 300);
    const referenceKind = ["referencia_declarada", "sem_referencia"].includes(b.reference_kind) ? b.reference_kind : null;
    const referenceValue = referenceKind === "sem_referencia" ? null : text(b.reference_value, 3, 500);
    const referenceSource = referenceKind === "sem_referencia" ? null : text(b.reference_source, 3, 300);
    const referenceNote = b.reference_note === undefined || b.reference_note === null || b.reference_note === "" ? null : text(b.reference_note, 3, 1000);
    if (!title || !description || !documentNumber || !issuer || !issueDate || !validityStart || !ruleSource || !referenceKind) return { error: "invalid_document" };
    if (referenceKind === "referencia_declarada" && (!referenceValue || !referenceSource)) return { error: "declared_reference_required" };
    if (b.reference_note !== undefined && b.reference_note !== null && b.reference_note !== "" && referenceNote === null) return { error: "invalid_document" };
    if (!noExpiry && !expiryDate) return { error: "expiry_or_no_expiry_required" };
    if (validityStart < issueDate) return { error: "validity_start_before_issue" };
    if (expiryDate && expiryDate < validityStart) return { error: "expiry_before_validity_start" };
    return { title, description, documentNumber, issuer, issueDate, validityStart, noExpiry, expiryDate, ruleSource, referenceKind, referenceValue, referenceSource, referenceNote };
  }

  // Registro do documento: deriva estado da data-base do servidor e, quando a
  // regra registrada exige, cria a tarefa na MESMA transação.
  async function registerDocument(client, { obligation, payload, session, key, fingerprint, previous = null, supersedeReason = null }) {
    const baseDate = await serverBaseDate(client);
    const derived = deriveDocumentState({ baseDate, expiryDate: payload.expiryDate, noExpiry: payload.noExpiry, renewalWindowDays: obligation.renewal_window_days });
    const responsible = await activeStaff(client, obligation.responsible_identity);
    const newId = randomUUID();
    if (previous) {
      await client.query(
        `UPDATE ext_compliance_documents SET status='substituida',is_current=false,superseded_by_document_id=$2,superseded_at=NOW(),supersede_reason=$3 WHERE id=$1`,
        [previous.id, newId, supersedeReason],
      );
    }
    const version = Number((await client.query(`SELECT COALESCE(MAX(version),0)+1 next FROM ext_compliance_documents WHERE obligation_id=$1`, [obligation.id])).rows[0].next);
    const { rows } = await client.query(
      `INSERT INTO ext_compliance_documents(id,protocol,title,description,compliance_type,status,document_number,issuer,responsible_name,responsible_identity,issue_date,expiry_date,is_private,created_by_identity,
         origin,obligation_id,version,is_current,supersedes_document_id,validity_start,no_expiry,validity_rule_source,renewal_window_days,evaluation_base_date,evaluated_at,reference_kind,reference_value,reference_source,reference_note)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13,'jornada_canonica',$14,$15,true,$16,$17,$18,$19,$20,$21,NOW(),$22,$23,$24,$25) RETURNING *`,
      [newId, protocolFor("COMP-EXT"), payload.title, payload.description, obligation.obligation_type, derived.status,
        payload.documentNumber, payload.issuer, responsible?.display_name || null, obligation.responsible_identity,
        payload.issueDate, payload.expiryDate, session.identityId, obligation.id, version, previous?.id || null,
        payload.validityStart, payload.noExpiry, payload.ruleSource, obligation.renewal_window_days, baseDate,
        payload.referenceKind, payload.referenceValue, payload.referenceSource, payload.referenceNote],
    );
    const document = rows[0];
    let task = null, taskCreated = false;
    if (derived.rule) {
      const facts = {
        base_date: baseDate, expiry_date: iso(payload.expiryDate), days_remaining: derived.days_remaining,
        renewal_window_days: obligation.renewal_window_days, derived_status: derived.status,
        cause: derived.rule === "vencimento" ? "vencimento alcançado na data-base do servidor" : "documento entrou na janela de renovação registrada",
        operation: previous ? "renovacao" : "registro",
      };
      const outcome = await ensureTask(client, { document, obligation, baseDate, rule: derived.rule, facts, identity: session.identityId });
      task = outcome.task; taskCreated = outcome.created;
    }
    await syncObligationStatus(client, obligation.id, derived.status);
    return { document, derived, baseDate, task, taskCreated, responsible };
  }

  async function handleDocumentCreate(req, res, obligationId) {
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    if (!UUID.test(obligationId)) return json(res, 400, { error: "invalid_reference" });
    const parsed = await parsedWrite(req, res);
    if (!parsed) return;
    const payload = parseDocumentPayload(parsed.body);
    if (payload.error) return json(res, 400, { error: payload.error });
    const fingerprint = fingerprintOf({ op: "document_create", obligationId, ...payload });
    return mutation(res, {
      session: parsed.session, key: parsed.key, fingerprint, auditAction: "ext_compliance_document_create",
      replay: async (client, event) => ({ document: documentDetailRow((await client.query(`${DOCUMENT_SELECT} WHERE d.id=$1`, [event.document_id])).rows[0]) }),
      work: async client => {
        const obligation = (await client.query(`SELECT *,status::text status_text FROM ext_compliance_obligations WHERE id=$1 FOR UPDATE`, [obligationId])).rows[0];
        if (!obligation) return { deny: { status: 404, body: { error: "obligation_not_found" } } };
        if (["nao_aplicavel", "encerrada"].includes(obligation.status_text)) return { deny: { status: 409, body: { error: "obligation_terminal" } } };
        const current = (await client.query(`SELECT id FROM ext_compliance_documents WHERE obligation_id=$1 AND is_current`, [obligationId])).rows[0];
        if (current) return { deny: { status: 409, body: { error: "current_document_exists", canonical: "use a renovação explícita para criar uma nova versão" } } };
        if (obligation.periodicity === "sem_vencimento" && !payload.noExpiry) return { deny: { status: 400, body: { error: "obligation_rule_requires_no_expiry" } } };
        if (obligation.periodicity !== "sem_vencimento" && payload.noExpiry) return { deny: { status: 400, body: { error: "obligation_rule_requires_expiry" } } };
        const out = await registerDocument(client, { obligation, payload, session: parsed.session, key: parsed.key, fingerprint });
        await writeEvent(client, {
          obligationId, documentId: out.document.id, taskId: out.task?.id || null, type: "documento_registrado",
          summary: "Documento privado registrado e estado derivado da data-base do servidor.",
          payload: { derived_status: out.derived.status, base_date: out.baseDate, rule: out.derived.rule, task_created: out.taskCreated },
          key: parsed.key, fingerprint, identity: parsed.session.identityId,
        });
        return {
          status: 201,
          body: {
            document: documentDetailRow({ ...out.document, responsible_display_name: out.responsible?.display_name || null }),
            task: out.task ? taskListRow({ ...out.task, responsible_display_name: out.responsible?.display_name || null }) : null,
            task_created: out.taskCreated, evaluation: { base_date: out.baseDate, rule: out.derived.rule, days_remaining: out.derived.days_remaining, source: "CURRENT_DATE do PostgreSQL; o relógio do cliente não é autoridade" },
            boundary: COMPLIANCE_BOUNDARY,
          },
          target: out.document.id, meta: { protocol: out.document.protocol, derived_status: out.derived.status, task_created: out.taskCreated },
        };
      },
    });
  }

  async function handleRenewalStart(req, res, documentId) {
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    if (!UUID.test(documentId)) return json(res, 400, { error: "invalid_reference" });
    const parsed = await parsedWrite(req, res);
    if (!parsed) return;
    const justification = text(parsed.body.justification, 10, 1000);
    if (!justification) return json(res, 400, { error: "justification_required" });
    const fingerprint = fingerprintOf({ op: "renewal_start", documentId, justification });
    return mutation(res, {
      session: parsed.session, key: parsed.key, fingerprint, auditAction: "ext_compliance_renewal_start",
      replay: async client => ({ document: documentDetailRow((await client.query(`${DOCUMENT_SELECT} WHERE d.id=$1`, [documentId])).rows[0]) }),
      work: async client => {
        const document = (await client.query(`SELECT *,status::text status_text FROM ext_compliance_documents WHERE id=$1 FOR UPDATE`, [documentId])).rows[0];
        if (!document) return { deny: { status: 404, body: { error: "document_not_found" } } };
        if (document.origin !== "jornada_canonica") return { deny: { status: 409, body: { error: "legacy_document_not_canonical" } } };
        if (!COMPLIANCE_TRANSITIONS.document[document.status_text]?.includes("em_renovacao")) return { deny: { status: 409, body: { error: "document_terminal_or_invalid_transition" } } };
        await client.query(`UPDATE ext_compliance_documents SET status='em_renovacao' WHERE id=$1`, [documentId]);
        await syncObligationStatus(client, document.obligation_id, "em_renovacao");
        await writeEvent(client, { obligationId: document.obligation_id, documentId, type: "renovacao_iniciada", summary: "Renovação formalmente iniciada; período anterior preservado.", payload: { justification }, key: parsed.key, fingerprint, identity: parsed.session.identityId });
        return { status: 200, body: { document: documentDetailRow((await client.query(`${DOCUMENT_SELECT} WHERE d.id=$1`, [documentId])).rows[0]) }, target: documentId, meta: { justification } };
      },
    });
  }

  async function handleRenew(req, res, documentId) {
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    if (!UUID.test(documentId)) return json(res, 400, { error: "invalid_reference" });
    const parsed = await parsedWrite(req, res);
    if (!parsed) return;
    const payload = parseDocumentPayload(parsed.body);
    if (payload.error) return json(res, 400, { error: payload.error });
    const reason = text(parsed.body.supersede_reason, 10, 1000);
    if (!reason) return json(res, 400, { error: "supersede_reason_required" });
    const fingerprint = fingerprintOf({ op: "document_renew", documentId, reason, ...payload });
    return mutation(res, {
      session: parsed.session, key: parsed.key, fingerprint, auditAction: "ext_compliance_document_renew",
      replay: async (client, event) => ({ document: documentDetailRow((await client.query(`${DOCUMENT_SELECT} WHERE d.id=$1`, [event.document_id])).rows[0]) }),
      work: async client => {
        const previous = (await client.query(`SELECT *,status::text status_text FROM ext_compliance_documents WHERE id=$1 FOR UPDATE`, [documentId])).rows[0];
        if (!previous) return { deny: { status: 404, body: { error: "document_not_found" } } };
        if (previous.origin !== "jornada_canonica") return { deny: { status: 409, body: { error: "legacy_document_not_canonical" } } };
        if (previous.status_text !== "em_renovacao") return { deny: { status: 409, body: { error: "renewal_must_start_first" } } };
        if (previous.superseded_by_document_id) return { deny: { status: 409, body: { error: "document_already_superseded" } } };
        const obligation = (await client.query(`SELECT *,status::text status_text FROM ext_compliance_obligations WHERE id=$1 FOR UPDATE`, [previous.obligation_id])).rows[0];
        if (!obligation) return { deny: { status: 404, body: { error: "obligation_not_found" } } };
        if (obligation.periodicity === "sem_vencimento" && !payload.noExpiry) return { deny: { status: 400, body: { error: "obligation_rule_requires_no_expiry" } } };
        if (obligation.periodicity !== "sem_vencimento" && payload.noExpiry) return { deny: { status: 400, body: { error: "obligation_rule_requires_expiry" } } };
        if (!payload.noExpiry && previous.expiry_date && payload.expiryDate <= iso(previous.expiry_date)) return { deny: { status: 400, body: { error: "renewal_must_extend_validity" } } };
        const out = await registerDocument(client, { obligation, payload, session: parsed.session, key: parsed.key, fingerprint, previous, supersedeReason: reason });
        await writeEvent(client, {
          obligationId: obligation.id, documentId: out.document.id, taskId: out.task?.id || null, type: "documento_renovado",
          summary: "Nova versão registrada; versão anterior formalmente substituída e preservada.",
          payload: { previous_document_id: previous.id, previous_version: previous.version, previous_expiry_date: iso(previous.expiry_date), new_version: out.document.version, supersede_reason: reason, base_date: out.baseDate },
          key: parsed.key, fingerprint, identity: parsed.session.identityId,
        });
        return {
          status: 201,
          body: {
            document: documentDetailRow({ ...out.document, responsible_display_name: out.responsible?.display_name || null }),
            previous_document: documentDetailRow((await client.query(`${DOCUMENT_SELECT} WHERE d.id=$1`, [previous.id])).rows[0]),
            task: out.task ? taskListRow({ ...out.task, responsible_display_name: out.responsible?.display_name || null }) : null,
            task_created: out.taskCreated, boundary: COMPLIANCE_BOUNDARY,
          },
          target: out.document.id, meta: { previous_document_id: previous.id, new_version: out.document.version },
        };
      },
    });
  }

  async function handleDocumentCancel(req, res, documentId) {
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    if (!UUID.test(documentId)) return json(res, 400, { error: "invalid_reference" });
    const parsed = await parsedWrite(req, res);
    if (!parsed) return;
    const justification = text(parsed.body.justification, 10, 1000);
    if (!justification) return json(res, 400, { error: "justification_required" });
    const fingerprint = fingerprintOf({ op: "document_cancel", documentId, justification });
    return mutation(res, {
      session: parsed.session, key: parsed.key, fingerprint, auditAction: "ext_compliance_document_cancel",
      replay: async client => ({ document: documentDetailRow((await client.query(`${DOCUMENT_SELECT} WHERE d.id=$1`, [documentId])).rows[0]) }),
      work: async client => {
        const document = (await client.query(`SELECT *,status::text status_text FROM ext_compliance_documents WHERE id=$1 FOR UPDATE`, [documentId])).rows[0];
        if (!document) return { deny: { status: 404, body: { error: "document_not_found" } } };
        if (document.origin !== "jornada_canonica") return { deny: { status: 409, body: { error: "legacy_document_not_canonical" } } };
        if (!COMPLIANCE_TRANSITIONS.document[document.status_text]?.includes("cancelada")) return { deny: { status: 409, body: { error: "document_terminal_or_invalid_transition" } } };
        await client.query(`UPDATE ext_compliance_documents SET status='cancelada',is_current=false,cancelled_at=NOW(),cancelled_by_identity=$2,cancellation_justification=$3 WHERE id=$1`, [documentId, parsed.session.identityId, justification]);
        await syncObligationStatus(client, document.obligation_id, "sem_documento");
        await writeEvent(client, { obligationId: document.obligation_id, documentId, type: "documento_cancelado", summary: "Documento cancelado com justificativa; histórico preservado.", payload: { justification }, key: parsed.key, fingerprint, identity: parsed.session.identityId });
        return { status: 200, body: { document: documentDetailRow((await client.query(`${DOCUMENT_SELECT} WHERE d.id=$1`, [documentId])).rows[0]) }, target: documentId, meta: { justification } };
      },
    });
  }

  // Operação administrativa explícita de avaliação temporal. Não há scheduler
  // canônico: a geração automática contínua dependeria de execução agendada
  // futura e não é declarada como existente.
  async function handleEvaluate(req, res) {
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const parsed = await parsedWrite(req, res);
    if (!parsed) return;
    const fingerprint = fingerprintOf({ op: "evaluate", actor: parsed.session.identityId, key: parsed.key });
    return mutation(res, {
      session: parsed.session, key: parsed.key, fingerprint, auditAction: "ext_compliance_evaluate",
      replay: async (client, event) => ({ evaluation: event.payload }),
      work: async client => {
        const baseDate = await serverBaseDate(client);
        const { rows } = await client.query(
          `SELECT d.*,d.status::text status_text,o.id o_id,o.responsible_identity o_responsible,o.periodicity o_periodicity,o.renewal_window_days o_window,o.status::text o_status
           FROM ext_compliance_documents d JOIN ext_compliance_obligations o ON o.id=d.obligation_id
           WHERE d.origin='jornada_canonica' AND d.is_current AND d.no_expiry=false
             AND o.status::text NOT IN ('nao_aplicavel','encerrada')
           ORDER BY d.expiry_date FOR UPDATE OF d`,
        );
        const created = [], unchanged = [];
        for (const row of rows) {
          const derived = deriveDocumentState({ baseDate, expiryDate: row.expiry_date, noExpiry: false, renewalWindowDays: row.renewal_window_days });
          if (row.status_text !== derived.status && COMPLIANCE_TRANSITIONS.document[row.status_text]?.includes(derived.status)) {
            await client.query(`UPDATE ext_compliance_documents SET status=$2,evaluation_base_date=$3,evaluated_at=NOW() WHERE id=$1`, [row.id, derived.status, baseDate]);
          } else {
            await client.query(`UPDATE ext_compliance_documents SET evaluation_base_date=$2,evaluated_at=NOW() WHERE id=$1`, [row.id, baseDate]);
          }
          if (!derived.rule) { unchanged.push(row.id); continue; }
          const obligation = { id: row.o_id, responsible_identity: row.o_responsible, periodicity: row.o_periodicity, renewal_window_days: row.renewal_window_days };
          const facts = {
            base_date: baseDate, expiry_date: iso(row.expiry_date), days_remaining: derived.days_remaining,
            renewal_window_days: row.renewal_window_days, derived_status: derived.status,
            cause: derived.rule === "vencimento" ? "vencimento alcançado na data-base do servidor" : "documento entrou na janela de renovação registrada",
            operation: "avaliacao_temporal",
          };
          const outcome = await ensureTask(client, { document: row, obligation, baseDate, rule: derived.rule, facts, identity: parsed.session.identityId });
          if (outcome.created) created.push({ task_id: outcome.task.id, document_id: row.id, rule: derived.rule });
          if (row.status_text !== derived.status) await syncObligationStatus(client, row.o_id, derived.status);
        }
        const summary = {
          source: "ext_compliance_documents (atuais, canônicos, com vencimento) + ext_compliance_obligations",
          base_date: baseDate, denominator: rows.length, tasks_created: created.length,
          documents_without_rule_hit: unchanged.length,
          absence_note: rows.length ? null : "Ausência de dados: nenhum documento canônico elegível avaliado. Ausência não é zero medido.",
          scheduler: "inexistente: esta é uma operação administrativa explícita; não há monitoramento contínuo",
        };
        await writeEvent(client, { type: "avaliacao_temporal", summary: "Avaliação temporal explícita executada com data-base do servidor.", payload: summary, key: parsed.key, fingerprint, identity: parsed.session.identityId });
        return { status: 200, body: { evaluation: summary, created, boundary: COMPLIANCE_BOUNDARY }, target: parsed.session.identityId, meta: summary };
      },
    });
  }

  async function handleTask(req, res, taskId, operation) {
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    if (!UUID.test(taskId)) return json(res, 400, { error: "invalid_reference" });
    const parsed = await parsedWrite(req, res);
    if (!parsed) return;
    const note = operation === "complete" ? text(parsed.body.result, 10, 2000)
      : operation === "cancel" ? text(parsed.body.justification, 10, 1000)
        : text(parsed.body.note, 3, 1000) || "Início registrado pela equipe interna.";
    if (!note) return json(res, 400, { error: operation === "complete" ? "result_required" : "justification_required" });
    const next = operation === "start" ? "em_andamento" : operation === "complete" ? "concluida" : "cancelada";
    const fingerprint = fingerprintOf({ op: `task_${operation}`, taskId, note });
    return mutation(res, {
      session: parsed.session, key: parsed.key, fingerprint, auditAction: `ext_compliance_task_${operation}`,
      replay: async client => ({ task: taskListRow((await client.query(`${TASK_SELECT} WHERE t.id=$1`, [taskId])).rows[0]) }),
      work: async client => {
        const task = (await client.query(`SELECT * FROM ext_compliance_tasks WHERE id=$1 FOR UPDATE`, [taskId])).rows[0];
        if (!task) return { deny: { status: 404, body: { error: "task_not_found" } } };
        if (!COMPLIANCE_TRANSITIONS.task[task.status]?.includes(next)) return { deny: { status: 409, body: { error: "task_terminal_or_invalid_transition" } } };
        if (operation === "complete" && (!task.responsible_identity || task.pending_reason)) return { deny: { status: 409, body: { error: "responsible_required", pending_reason: task.pending_reason } } };
        if (operation === "complete") {
          const responsible = await activeStaff(client, task.responsible_identity);
          if (!responsible) return { deny: { status: 409, body: { error: "responsible_required" } } };
        }
        let row;
        if (operation === "start") row = (await client.query(`UPDATE ext_compliance_tasks SET status='em_andamento',started_at=NOW(),started_by_identity=$2 WHERE id=$1 RETURNING *`, [taskId, parsed.session.identityId])).rows[0];
        else if (operation === "complete") row = (await client.query(`UPDATE ext_compliance_tasks SET status='concluida',completed_at=NOW(),completed_by_identity=$2,completion_result=$3 WHERE id=$1 RETURNING *`, [taskId, parsed.session.identityId, note])).rows[0];
        else row = (await client.query(`UPDATE ext_compliance_tasks SET status='cancelada',cancelled_at=NOW(),cancelled_by_identity=$2,cancellation_justification=$3 WHERE id=$1 RETURNING *`, [taskId, parsed.session.identityId, note])).rows[0];
        await writeEvent(client, { obligationId: task.obligation_id, documentId: task.document_id, taskId, type: `tarefa_${operation}`, summary: `Tarefa de vencimento: ${operation}.`, payload: { note, next }, key: parsed.key, fingerprint, identity: parsed.session.identityId });
        return { status: 200, body: { task: taskListRow({ ...row, responsible_display_name: null }) }, target: taskId, meta: { operation, next } };
      },
    });
  }

  // Legado exato da 086: leitura autorizada preserva `items`; mutação aposenta
  // com 410 somente depois de autenticação, papel e same-origin.
  async function handleLegacy(req, res) {
    if (req.method !== "GET") {
      const session = await guard(req, res, { write: true });
      if (!session) return;
      return json(res, 410, { error: "legacy_mutation_retired", canonical: "/api/ext/compliance/obligations" });
    }
    if (!await guard(req, res)) return;
    try {
      const { rows } = await pool.query(`${DOCUMENT_SELECT} ORDER BY d.expiry_date ASC NULLS LAST LIMIT 200`);
      const projected = rows.map(documentListRow);
      return json(res, 200, {
        items: projected, documents: projected,
        source: "ext_compliance_documents",
        canonical: "/api/ext/compliance/obligations",
        note: "Vencimento gera tarefa e documento privado",
        projection: "allowlist minimizada: file_url, storage_key e número completo não são expostos nem no alias legado",
        boundary: COMPLIANCE_BOUNDARY,
      });
    } catch { return json(res, 503, { error: "compliance_journey_unavailable" }); }
  }

  return {
    handleReferences, handleObligationList, handleObligationCreate, handleObligationDetail, handleObligationClose,
    handleDocumentList, handleDocumentCreate, handleRenewalStart, handleRenew, handleDocumentCancel,
    handleEvaluate, handleTaskList,
    handleTaskStart: (req, res, id) => handleTask(req, res, id, "start"),
    handleTaskComplete: (req, res, id) => handleTask(req, res, id, "complete"),
    handleTaskCancel: (req, res, id) => handleTask(req, res, id, "cancel"),
    handleLegacy,
  };
}
