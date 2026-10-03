// EXT-07 — compliance corporativo. Jornada interna de staff; não há ator externo,
// portal de órgão emissor, login de seguradora/corretora nem token documental público.
// Fonte canônica: ext_compliance_documents (086) endurecida pela migração 153.
// Tarefa de vencimento: ext_compliance_tasks (153) — tabela dedicada, decidida após
// inspecionar crm_tasks (014) e crm_document_obligations (037), que não impõem vínculo,
// privacidade, estado, responsável nem idempotência compatíveis com compliance.
// Metadados de arquivo são REFERÊNCIA DECLARADA: não provam upload, bytes, checksum,
// varredura, armazenamento verificado nem download.
import {createHash, randomBytes} from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const STAFF_ROLES = ["admin", "marcelo", "ti"];

export const COMPLIANCE_TYPES = Object.freeze(["licenca", "certidao", "seguro", "alvara", "outro"]);
export const BASIS_KINDS = Object.freeze(["declarada_interna", "norma_citada", "contrato", "outro"]);
export const SCOPE_KINDS = Object.freeze(["entidade", "unidade", "contrato", "operacao"]);
export const PERIODICITIES = Object.freeze(["unica", "mensal", "trimestral", "semestral", "anual", "sob_demanda"]);
export const CRITICALITIES = Object.freeze(["baixa", "media", "alta", "critica"]);
export const REFERENCE_KINDS = Object.freeze(["referencia_declarada", "protocolo_externo", "via_fisica", "outro"]);

// Projeção staff mais ampla: allowlist com minimização. Nada de file_url, storage_key,
// número documental, referência declarada, notas internas, auditoria ou conteúdo.
export const COMPLIANCE_LIST_FIELDS = Object.freeze([
  "id", "protocol", "obligation_type", "title", "scope_kind", "scope_label", "periodicity",
  "renewal_window_days", "criticality", "status", "temporal_state", "responsible_display_name",
  "document_version", "document_valid_from", "document_expiry_date", "document_has_expiry",
  "open_task_count", "document_count", "created_at",
]);

export const COMPLIANCE_TRANSITIONS = Object.freeze({
  document: {vigente: ["a_vencer", "vencida", "em_renovacao", "substituida", "cancelada"], a_vencer: ["vencida", "em_renovacao", "substituida", "cancelada"], vencida: ["em_renovacao", "substituida", "cancelada"], em_renovacao: ["substituida", "cancelada"], substituida: [], cancelada: []},
  task: {aberta: ["em_andamento", "concluida", "cancelada"], em_andamento: ["concluida", "cancelada"], concluida: [], cancelada: []},
  obligation: {ativa: ["encerrada", "nao_aplicavel"], encerrada: [], nao_aplicavel: []},
});

const hash = v => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const txt = (v, min, max) => (typeof v === "string" && v.trim().length >= min && v.trim().length <= max ? v.trim() : null);
const day = v => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v ? v : null);
const stamp = () => new Date().toISOString().slice(0, 10).replaceAll("-", "");
const protocolObligation = () => `OBR-EXT-${stamp()}-${randomBytes(3).toString("hex").slice(0, 4).toUpperCase()}`;
const protocolDocument = () => `COMP-EXT-${stamp()}-${randomBytes(3).toString("hex").slice(0, 4).toUpperCase()}`;
const addDays = (iso, n) => {const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);};

// Regra temporal explícita e armazenada. A data-base é sempre do servidor (CURRENT_DATE).
export function deriveTemporalState({baseDate, expiryDate, hasExpiry, renewalWindowDays}) {
  if (!hasExpiry) return {state: "vigente", task_required: false, absence: "sem_vencimento_declarado"};
  const alertFrom = addDays(expiryDate, -renewalWindowDays);
  if (baseDate > expiryDate) return {state: "vencida", task_required: true, alert_from: alertFrom, absence: null};
  if (baseDate >= alertFrom) return {state: "a_vencer", task_required: true, alert_from: alertFrom, absence: null};
  return {state: "vigente", task_required: false, alert_from: alertFrom, absence: null};
}

export function createExtComplianceApi({pool, sameOrigin, requireSession}) {
  const json = (res, status, value) => {res.writeHead(status, {"content-type": "application/json", "cache-control": "no-store"}); res.end(JSON.stringify(value));};
  const role = s => String(s?.role || s?.userRole || "").toLowerCase();

  async function staffGuard(req, res, write = false) {
    let s;
    try {s = await requireSession(req);} catch {}
    if (!s) return json(res, 401, {error: "unauthorized"});
    if (!STAFF_ROLES.includes(role(s))) return json(res, 403, {error: "forbidden_role"});
    if (write && !sameOrigin(req)) return json(res, 403, {error: "origin_forbidden"});
    if (write && !UUID.test(String(s.identityId || ""))) return json(res, 401, {error: "unauthorized"});
    return s;
  }
  async function readBody(req, res) {
    const chunks = []; let size = 0;
    for await (const c of req) {size += c.length; if (size > 32768) {json(res, 413, {error: "body_too_large"}); return null;} chunks.push(c);}
    try {const b = JSON.parse(Buffer.concat(chunks).toString() || "{}"); if (!b || typeof b !== "object" || Array.isArray(b)) throw 0; return b;}
    catch {json(res, 400, {error: "invalid_request"}); return null;}
  }
  function idem(req, res) {
    const key = String(req.headers["idempotency-key"] || "").trim();
    if (!KEY.test(key)) {json(res, 400, {error: "idempotency_key_required"}); return null;}
    return key;
  }

  // BEGIN → lock/replay → negócio → tarefa → evento imutável → audit_log → COMMIT.
  // Falha de auditoria ⇒ ROLLBACK e 503; nada persiste.
  async function mutate(res, {identity, key, fingerprint, auditAction, replay, work}) {
    let c;
    try {
      c = await pool.connect();
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ext07:${identity}:${key}`]);
      const prior = (await c.query("SELECT * FROM ext_compliance_events WHERE actor_identity_id=$1 AND idempotency_key=$2", [identity, key])).rows[0];
      if (prior) {
        if (prior.request_fingerprint !== fingerprint) {await c.query("ROLLBACK"); return json(res, 409, {error: "idempotency_key_reused"});}
        const value = await replay(c, prior);
        await c.query("COMMIT");
        return json(res, 200, {...value, replayed: true});
      }
      const out = await work(c);
      if (out.deny) {await c.query("ROLLBACK"); return json(res, out.deny.status, out.deny.body);}
      await c.query(
        "INSERT INTO ext_compliance_events(obligation_id,document_id,task_id,event_type,payload,actor_identity_id,idempotency_key,request_fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [out.obligationId, out.documentId || null, out.taskId || null, out.eventType, JSON.stringify(out.eventPayload || {}), identity, key, fingerprint],
      );
      try {
        await c.query("INSERT INTO audit_log(action,actor,target,meta) VALUES($1,$2,$3,$4)", [auditAction, identity, out.target, JSON.stringify(out.auditMeta || {})]);
      } catch (error) {
        await c.query("ROLLBACK");
        console.error("EXT-07 audit unavailable", error?.message || error);
        return json(res, 503, {error: "audit_unavailable"});
      }
      await c.query("COMMIT");
      return json(res, out.status, out.body);
    } catch (error) {
      await c?.query("ROLLBACK").catch(() => {});
      console.error("EXT-07 mutation failed", error?.message || error);
      return json(res, 503, {error: "compliance_journey_unavailable"});
    } finally {c?.release();}
  }

  const activeStaff = async (db, id) => (await db.query(
    "SELECT i.id FROM auth_identities i JOIN auth_staff_profiles p ON p.identity_id=i.id WHERE i.id=$1 AND i.kind='staff' AND i.status='active' AND p.role = ANY($2::text[])",
    [id, STAFF_ROLES],
  )).rows[0] || null;

  // Avalia o documento atual, grava o estado derivado e cria no máximo uma tarefa
  // por documento/período/regra — na mesma transação.
  async function evaluateDocument(db, {document, obligation, baseDate, actorIdentity}) {
    // Datas relidas como texto ISO: DATE -> Date do driver pode deslocar o dia conforme fuso.
    const d = (await db.query(
      `SELECT expiry_date::text AS expiry, valid_from::text AS valid_from, has_expiry, status::text AS status,
              version, protocol, is_current FROM ext_compliance_documents WHERE id=$1`, [document.id],
    )).rows[0];
    const rule = {
      kind: "renewal_window_days",
      renewal_window_days: obligation.renewal_window_days,
      periodicity: obligation.periodicity,
      source: "ext_compliance_obligations.renewal_window_days",
      has_expiry: d.has_expiry,
    };
    const expiry = d.expiry;
    const derived = deriveTemporalState({baseDate, expiryDate: expiry, hasExpiry: d.has_expiry, renewalWindowDays: obligation.renewal_window_days});
    let next = derived.state;
    // Renovação em andamento é estado formal declarado; não é sobrescrito pela avaliação.
    if (d.status === "em_renovacao" && derived.state !== "vencida") next = "em_renovacao";
    const updated = (await db.query(
      `UPDATE ext_compliance_documents SET status=$2::ext_compliance_status, state_base_date=$3::date, state_evaluated_at=NOW(), updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [document.id, next, baseDate],
    )).rows[0];

    let task = null, created = false;
    if (derived.task_required && obligation.status === "ativa" && d.is_current) {
      const ruleKey = `renewal_window_days:${obligation.renewal_window_days}`;
      const existing = (await db.query(
        "SELECT * FROM ext_compliance_tasks WHERE document_id=$1 AND validity_period_end=$2::date AND trigger_rule_key=$3 FOR UPDATE",
        [document.id, expiry, ruleKey],
      )).rows[0];
      if (existing) task = existing;
      else {
        const responsible = await activeStaff(db, obligation.responsible_identity_id);
        const facts = {
          base_date: baseDate, expiry_date: expiry, alert_from: derived.alert_from,
          observed_state: derived.state, renewal_window_days: obligation.renewal_window_days,
          document_version: d.version, document_protocol: d.protocol,
        };
        const inserted = await db.query(
          `INSERT INTO ext_compliance_tasks(obligation_id,document_id,validity_period_start,validity_period_end,trigger_rule,trigger_rule_key,trigger_facts,base_date,responsible_identity_id,pending_reason,created_by_identity)
           VALUES($1,$2,$3::date,$4::date,$5,$6,$7,$8::date,$9,$10,$11)
           ON CONFLICT (document_id,validity_period_end,trigger_rule_key) DO NOTHING RETURNING *`,
          [obligation.id, document.id, d.valid_from, expiry, JSON.stringify(rule), ruleKey, JSON.stringify(facts), baseDate,
            responsible ? obligation.responsible_identity_id : null,
            responsible ? null : "Pendência fail-closed: a obrigação não possui responsável staff canônico ativo no momento da avaliação.",
            actorIdentity],
        );
        task = inserted.rows[0] || (await db.query(
          "SELECT * FROM ext_compliance_tasks WHERE document_id=$1 AND validity_period_end=$2::date AND trigger_rule_key=$3",
          [document.id, expiry, ruleKey],
        )).rows[0];
        created = Boolean(inserted.rows[0]);
      }
    }
    return {document: updated, derived, rule, task, task_created: created};
  }

  const listObligations = async db => (await db.query(
    `SELECT o.id, o.protocol, o.obligation_type, o.title, o.scope_kind, o.scope_label, o.periodicity,
            o.renewal_window_days, o.criticality, o.status, o.created_at,
            i.display_name AS responsible_display_name,
            d.version AS document_version, d.valid_from::text AS document_valid_from,
            d.expiry_date::text AS document_expiry_date, d.has_expiry AS document_has_expiry,
            d.status::text AS document_status,
            (SELECT count(*)::int FROM ext_compliance_documents x WHERE x.obligation_id=o.id AND x.origin='ext07_canonica') AS document_count,
            (SELECT count(*)::int FROM ext_compliance_tasks t WHERE t.obligation_id=o.id AND t.status IN ('aberta','em_andamento')) AS open_task_count
       FROM ext_compliance_obligations o
       JOIN auth_identities i ON i.id=o.responsible_identity_id
       LEFT JOIN ext_compliance_documents d ON d.obligation_id=o.id AND d.origin='ext07_canonica' AND d.is_current
      ORDER BY o.created_at DESC LIMIT 200`,
  )).rows.map(r => {
    const temporal = r.status === "encerrada" ? "encerrada"
      : r.status === "nao_aplicavel" ? "nao_aplicavel"
      : !r.document_status ? "sem_documento"
      : r.document_status;
    const row = {...r, temporal_state: temporal};
    return Object.fromEntries(COMPLIANCE_LIST_FIELDS.map(f => [f, row[f] ?? null]));
  });

  async function obligationDetail(db, id) {
    const o = (await db.query(
      `SELECT o.*, i.display_name AS responsible_display_name, a.display_name AS created_by_display_name
         FROM ext_compliance_obligations o
         JOIN auth_identities i ON i.id=o.responsible_identity_id
         LEFT JOIN auth_identities a ON a.id=o.created_by_identity WHERE o.id=$1`, [id],
    )).rows[0];
    if (!o) return null;
    // Detalhe autorizado: metadados necessários à gestão; a fronteira de armazenamento é explícita.
    const documents = (await db.query(
      `SELECT d.id, d.protocol, d.title, d.description, d.compliance_type, d.status::text AS status, d.version,
              d.document_number, d.issuer, d.issue_date::text AS issue_date, d.valid_from::text AS valid_from, d.expiry_date::text AS expiry_date, d.has_expiry,
              d.reference_kind, d.reference_declared, d.reference_source, d.reference_note,
              d.is_private, d.is_current, d.supersedes_document_id, d.superseded_by_document_id,
              d.renewal_justification, d.state_rule, d.state_base_date::text AS state_base_date, d.state_evaluated_at,
              d.cancellation_justification, d.created_at,
              r.display_name AS responsible_display_name
         FROM ext_compliance_documents d
         LEFT JOIN auth_identities r ON r.id=d.responsible_identity_id
        WHERE d.obligation_id=$1 AND d.origin='ext07_canonica' ORDER BY d.version DESC`, [id],
    )).rows;
    const tasks = (await db.query(
      `SELECT t.*, t.base_date::text AS base_date, t.validity_period_start::text AS validity_period_start, t.validity_period_end::text AS validity_period_end, r.display_name AS responsible_display_name FROM ext_compliance_tasks t
         LEFT JOIN auth_identities r ON r.id=t.responsible_identity_id
        WHERE t.obligation_id=$1 ORDER BY t.created_at DESC`, [id],
    )).rows;
    const events = (await db.query("SELECT id,event_type,payload,created_at FROM ext_compliance_events WHERE obligation_id=$1 ORDER BY created_at", [id])).rows;
    const current = documents.find(d => d.is_current) || null;
    return {
      obligation: o,
      documents, tasks, events,
      current_document: current,
      storage_boundary: {
        kind: "referencia_declarada",
        note: "Metadado/referência declarada por staff. Não há upload, bytes recebidos, checksum, varredura de malware, armazenamento verificado nem download nesta fatia.",
        legacy_metadata_warning: "file_name/file_url/storage_key da migração 086 são metadados legados e não provam arquivo existente.",
      },
      applicability_boundary: "Fundamento e aplicabilidade são declaração interna rastreável; não há integração regulatória, consulta a órgão público nem parecer jurídico verificado.",
    };
  }

  // ---------------------------------------------------------------- rotas

  async function handleReferences(req, res) {
    if (req.method !== "GET") return json(res, 405, {error: "method_not_allowed"});
    if (!await staffGuard(req, res)) return;
    try {
      const staff = await pool.query(
        `SELECT i.id,i.display_name,p.role FROM auth_identities i JOIN auth_staff_profiles p ON p.identity_id=i.id
          WHERE i.kind='staff' AND i.status='active' AND p.role = ANY($1::text[]) ORDER BY i.display_name LIMIT 200`, [STAFF_ROLES],
      );
      const base = (await pool.query("SELECT CURRENT_DATE::text AS d")).rows[0].d;
      return json(res, 200, {
        staff: staff.rows, compliance_types: COMPLIANCE_TYPES, basis_kinds: BASIS_KINDS,
        scope_kinds: SCOPE_KINDS, periodicities: PERIODICITIES, criticalities: CRITICALITIES,
        reference_kinds: REFERENCE_KINDS, server_base_date: base,
        sources: ["auth_identities", "auth_staff_profiles", "ext_compliance_obligations"],
      });
    } catch {return json(res, 503, {error: "compliance_journey_unavailable"});}
  }

  async function handleObligationList(req, res) {
    if (req.method !== "GET") return json(res, 405, {error: "method_not_allowed"});
    if (!await staffGuard(req, res)) return;
    try {
      const rows = await listObligations(pool);
      const base = (await pool.query("SELECT CURRENT_DATE::text AS d")).rows[0].d;
      const counts = rows.reduce((acc, r) => {acc[r.temporal_state] = (acc[r.temporal_state] || 0) + 1; return acc;}, {});
      const tasks = (await pool.query(
        "SELECT count(*)::int AS total, count(*) FILTER (WHERE status IN ('aberta','em_andamento'))::int AS open, count(*) FILTER (WHERE responsible_identity_id IS NULL)::int AS pending FROM ext_compliance_tasks",
      )).rows[0];
      return json(res, 200, {
        obligations: rows,
        projection: {fields: COMPLIANCE_LIST_FIELDS, minimized: true, note: "Listagem minimizada: número documental, referência declarada, URL, storage_key, notas e auditoria só no detalhe autorizado."},
        aggregate: {
          source: "ext_compliance_obligations + ext_compliance_documents",
          base_date: base, period: {start: null, end: base},
          denominator: rows.length,
          by_state: rows.length ? counts : null,
          absence: rows.length ? null : "sem_obrigacoes_registradas",
          tasks: {source: "ext_compliance_tasks", denominator: tasks.total, open: tasks.total ? tasks.open : null, fail_closed_pending: tasks.total ? tasks.pending : null, absence: tasks.total ? null : "sem_tarefas_registradas"},
        },
        criterion: "Vencimento gera tarefa e documento privado",
        empty_state: rows.length ? null : "Nenhuma obrigação canônica registrada; a migração 153 não faz seed.",
      });
    } catch {return json(res, 503, {error: "compliance_journey_unavailable"});}
  }

  async function handleObligationDetail(req, res, id) {
    if (!UUID.test(id)) return json(res, 400, {error: "invalid_reference"});
    if (req.method !== "GET") return json(res, 405, {error: "method_not_allowed"});
    if (!await staffGuard(req, res)) return;
    try {
      const detail = await obligationDetail(pool, id);
      return detail ? json(res, 200, detail) : json(res, 404, {error: "not_found"});
    } catch {return json(res, 503, {error: "compliance_journey_unavailable"});}
  }

  async function handleObligationCreate(req, res) {
    const s = await staffGuard(req, res, true);
    if (!s) return;
    const b = await readBody(req, res), key = b && idem(req, res);
    if (!b || !key) return;
    const type = COMPLIANCE_TYPES.includes(b.obligation_type) ? b.obligation_type : null;
    const title = txt(b.title, 5, 200), description = txt(b.description, 10, 2000);
    const legalBasis = txt(b.legal_basis, 5, 500);
    const basisKind = BASIS_KINDS.includes(b.basis_kind) ? b.basis_kind : null;
    const scopeKind = SCOPE_KINDS.includes(b.scope_kind) ? b.scope_kind : null;
    const scopeLabel = txt(b.scope_label, 3, 200);
    const justification = txt(b.applicability_justification, 10, 2000);
    const periodicity = PERIODICITIES.includes(b.periodicity) ? b.periodicity : null;
    const window = Number.isInteger(b.renewal_window_days) && b.renewal_window_days >= 0 && b.renewal_window_days <= 365 ? b.renewal_window_days : null;
    const criticality = b.criticality === undefined || b.criticality === null ? null : (CRITICALITIES.includes(b.criticality) ? b.criticality : false);
    const responsible = String(b.responsible_identity_id || "");
    if (!type || !title || !description || !legalBasis || !basisKind || !scopeKind || !scopeLabel || !justification || !periodicity || window === null || criticality === false || !UUID.test(responsible)) {
      return json(res, 400, {error: "invalid_obligation_configuration"});
    }
    const fingerprint = hash({op: "obligation_create", type, title, description, legalBasis, basisKind, scopeKind, scopeLabel, justification, periodicity, window, criticality, responsible});
    return mutate(res, {
      identity: s.identityId, key, fingerprint, auditAction: "ext_compliance_obligation_create",
      replay: async (c, e) => await obligationDetail(c, e.obligation_id),
      work: async c => {
        if (!await activeStaff(c, responsible)) return {deny: {status: 400, body: {error: "responsible_must_be_active_authorized_staff"}}};
        const row = (await c.query(
          `INSERT INTO ext_compliance_obligations(protocol,obligation_type,title,description,legal_basis,basis_kind,scope_kind,scope_label,applicability_justification,periodicity,renewal_window_days,criticality,responsible_identity_id,created_by_identity)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [protocolObligation(), type, title, description, legalBasis, basisKind, scopeKind, scopeLabel, justification, periodicity, window, criticality, responsible, s.identityId],
        )).rows[0];
        return {
          status: 201, body: {obligation: row, temporal_state: "sem_documento"},
          obligationId: row.id, target: row.id, eventType: "obrigacao_registrada",
          eventPayload: {basis_kind: basisKind, scope_kind: scopeKind, renewal_window_days: window, declared_only: true},
          auditMeta: {protocol: row.protocol, obligation_type: type},
        };
      },
    });
  }

  async function handleObligationClose(req, res, id) {
    if (!UUID.test(id)) return json(res, 400, {error: "invalid_reference"});
    if (req.method !== "POST") return json(res, 405, {error: "method_not_allowed"});
    const s = await staffGuard(req, res, true);
    if (!s) return;
    const b = await readBody(req, res), key = b && idem(req, res);
    if (!b || !key) return;
    const target = ["encerrada", "nao_aplicavel"].includes(b.status) ? b.status : null;
    const justification = txt(b.justification, 10, 1000);
    if (!target || !justification) return json(res, 400, {error: "justification_and_status_required"});
    const fingerprint = hash({op: "obligation_close", id, target, justification});
    return mutate(res, {
      identity: s.identityId, key, fingerprint, auditAction: "ext_compliance_obligation_close",
      replay: async c => await obligationDetail(c, id),
      work: async c => {
        const o = (await c.query("SELECT * FROM ext_compliance_obligations WHERE id=$1 FOR UPDATE", [id])).rows[0];
        if (!o) return {deny: {status: 404, body: {error: "obligation_not_found"}}};
        if (!COMPLIANCE_TRANSITIONS.obligation[o.status]?.includes(target)) return {deny: {status: 409, body: {error: "obligation_terminal_or_invalid_transition"}}};
        const row = (await c.query(
          "UPDATE ext_compliance_obligations SET status=$2,closure_justification=$3,closed_at=NOW(),closed_by_identity=$4,updated_at=NOW() WHERE id=$1 RETURNING *", [id, target, justification, s.identityId],
        )).rows[0];
        return {status: 200, body: {obligation: row}, obligationId: id, target: id, eventType: `obrigacao_${target}`, eventPayload: {justification}, auditMeta: {status: target}};
      },
    });
  }

  // Registro de documento/referência e renovação explícita (versionamento, sem sobrescrita).
  async function handleDocumentCreate(req, res, obligationId) {
    if (!UUID.test(obligationId)) return json(res, 400, {error: "invalid_reference"});
    if (req.method !== "POST") return json(res, 405, {error: "method_not_allowed"});
    const s = await staffGuard(req, res, true);
    if (!s) return;
    const b = await readBody(req, res), key = b && idem(req, res);
    if (!b || !key) return;
    const type = COMPLIANCE_TYPES.includes(b.compliance_type) ? b.compliance_type : null;
    const title = txt(b.title, 5, 200), description = txt(b.description, 10, 2000);
    const documentNumber = b.document_number === undefined || b.document_number === null ? null : txt(b.document_number, 3, 200);
    const issuer = b.issuer === undefined || b.issuer === null ? null : txt(b.issuer, 3, 200);
    const issueDate = b.issue_date === undefined || b.issue_date === null ? null : day(b.issue_date);
    const validFrom = day(b.valid_from);
    const hasExpiry = typeof b.has_expiry === "boolean" ? b.has_expiry : null;
    const expiryDate = b.expiry_date === undefined || b.expiry_date === null ? null : day(b.expiry_date);
    const referenceKind = REFERENCE_KINDS.includes(b.reference_kind) ? b.reference_kind : null;
    const referenceDeclared = txt(b.reference_declared, 3, 500);
    const referenceSource = txt(b.reference_source, 3, 300);
    const referenceNote = b.reference_note === undefined || b.reference_note === null ? null : txt(b.reference_note, 3, 1000);
    const supersedes = b.supersedes_document_id === undefined || b.supersedes_document_id === null ? null : String(b.supersedes_document_id);
    const renewalJustification = supersedes ? txt(b.renewal_justification, 10, 1000) : null;
    if (!type || !title || !description || !validFrom || hasExpiry === null || !referenceKind || !referenceDeclared || !referenceSource
      || (b.document_number != null && !documentNumber) || (b.issuer != null && !issuer) || (b.issue_date != null && !issueDate)
      || (b.reference_note != null && !referenceNote)
      || (hasExpiry && !expiryDate) || (!hasExpiry && expiryDate)
      || (issueDate && validFrom < issueDate) || (expiryDate && expiryDate < validFrom)
      || (supersedes && (!UUID.test(supersedes) || !renewalJustification))) {
      return json(res, 400, {error: "invalid_document_configuration"});
    }
    const fingerprint = hash({op: "document_create", obligationId, type, title, description, documentNumber, issuer, issueDate, validFrom, hasExpiry, expiryDate, referenceKind, referenceDeclared, referenceSource, referenceNote, supersedes, renewalJustification});
    return mutate(res, {
      identity: s.identityId, key, fingerprint, auditAction: supersedes ? "ext_compliance_document_renew" : "ext_compliance_document_create",
      replay: async c => await obligationDetail(c, obligationId),
      work: async c => {
        const o = (await c.query("SELECT * FROM ext_compliance_obligations WHERE id=$1 FOR UPDATE", [obligationId])).rows[0];
        if (!o) return {deny: {status: 404, body: {error: "obligation_not_found"}}};
        if (o.status !== "ativa") return {deny: {status: 409, body: {error: "obligation_not_active"}}};
        if (!await activeStaff(c, o.responsible_identity_id)) return {deny: {status: 409, body: {error: "responsible_not_active_staff"}}};
        const current = (await c.query("SELECT * FROM ext_compliance_documents WHERE obligation_id=$1 AND origin='ext07_canonica' AND is_current FOR UPDATE", [obligationId])).rows[0];
        if (current && !supersedes) return {deny: {status: 409, body: {error: "current_document_exists_use_renewal"}}};
        if (supersedes) {
          if (!current || current.id !== supersedes) return {deny: {status: 409, body: {error: "supersedes_must_reference_current_document"}}};
          if (["cancelada", "substituida"].includes(current.status)) return {deny: {status: 409, body: {error: "terminal_document_cannot_be_renewed"}}};
        }
        const baseDate = (await c.query("SELECT CURRENT_DATE::text AS d")).rows[0].d;
        const version = current ? current.version + 1 : 1;
        const rule = {kind: "renewal_window_days", renewal_window_days: o.renewal_window_days, periodicity: o.periodicity, source: "ext_compliance_obligations.renewal_window_days", has_expiry: hasExpiry};
        const derived = deriveTemporalState({baseDate, expiryDate, hasExpiry, renewalWindowDays: o.renewal_window_days});
        if (current) {
          // Libera a corrente ANTES de inserir a nova versão: o índice único de
          // "uma versão atual por obrigação" não admite duas correntes nem por instante.
          // O estado terminal só é gravado no passo seguinte, junto do vínculo de
          // substituição, porque a CHECK exige superseded_by_document_id preenchido.
          await c.query("UPDATE ext_compliance_documents SET is_current=false, updated_at=NOW() WHERE id=$1", [current.id]);
        }
        const row = (await c.query(
          `INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,document_number,issuer,responsible_identity,responsible_identity_id,issue_date,valid_from,has_expiry,expiry_date,is_private,created_by_identity,origin,obligation_id,reference_kind,reference_declared,reference_source,reference_note,version,supersedes_document_id,is_current,renewal_justification,state_rule,state_base_date,state_evaluated_at)
           VALUES($1,$2,$3,$4::ext_compliance_type,$5::ext_compliance_status,$6,$7,$8,$8,$9::date,$10::date,$11,$12::date,true,$13,'ext07_canonica',$14,$15,$16,$17,$18,$19,$20,true,$21,$22,$23::date,NOW()) RETURNING *`,
          [protocolDocument(), title, description, type, derived.state, documentNumber, issuer, o.responsible_identity_id, issueDate, validFrom, hasExpiry, expiryDate, s.identityId, obligationId, referenceKind, referenceDeclared, referenceSource, referenceNote, version, supersedes, renewalJustification, JSON.stringify(rule), baseDate],
        )).rows[0];
        if (current) {
          await c.query(
            `UPDATE ext_compliance_documents SET status='substituida'::ext_compliance_status, superseded_by_document_id=$2, updated_at=NOW() WHERE id=$1`,
            [current.id, row.id],
          );
        }
        const evaluated = await evaluateDocument(c, {document: row, obligation: o, baseDate, actorIdentity: s.identityId});
        return {
          status: 201,
          body: {
            document: {id: evaluated.document.id, protocol: evaluated.document.protocol, version: evaluated.document.version, status: evaluated.document.status, is_private: evaluated.document.is_private, valid_from: validFrom, expiry_date: expiryDate, has_expiry: hasExpiry, state_base_date: baseDate},
            temporal_state: evaluated.document.status, rule: evaluated.rule, base_date: baseDate,
            expiry_absence: derived.absence,
            task: evaluated.task ? {id: evaluated.task.id, status: evaluated.task.status, responsible_identity_id: evaluated.task.responsible_identity_id, pending_reason: evaluated.task.pending_reason, trigger_rule: evaluated.task.trigger_rule, trigger_facts: evaluated.task.trigger_facts, base_date: evaluated.task.base_date} : null,
            task_created: evaluated.task_created,
            superseded_document_id: current?.id || null,
            storage_boundary: "Referência declarada; sem upload, bytes, checksum ou armazenamento verificado.",
          },
          obligationId, documentId: row.id, taskId: evaluated.task?.id, target: row.id,
          eventType: supersedes ? "documento_renovado" : "documento_registrado",
          eventPayload: {version, base_date: baseDate, derived_state: evaluated.document.status, task_created: evaluated.task_created, superseded: current?.id || null},
          auditMeta: {protocol: row.protocol, version, derived_state: evaluated.document.status},
        };
      },
    });
  }

  // Operação administrativa explícita de avaliação temporal. Não existe scheduler canônico
  // nesta base: a geração automática contínua depende de execução agendada futura.
  async function handleEvaluate(req, res) {
    if (req.method !== "POST") return json(res, 405, {error: "method_not_allowed"});
    const s = await staffGuard(req, res, true);
    if (!s) return;
    const b = await readBody(req, res), key = b && idem(req, res);
    if (!b || !key) return;
    const scope = b.obligation_id === undefined || b.obligation_id === null ? null : String(b.obligation_id);
    if (scope && !UUID.test(scope)) return json(res, 400, {error: "invalid_reference"});
    const fingerprint = hash({op: "evaluate", scope});
    return mutate(res, {
      identity: s.identityId, key, fingerprint, auditAction: "ext_compliance_evaluate",
      replay: async (c, e) => ({evaluation: e.payload, obligation: (await c.query("SELECT id,protocol FROM ext_compliance_obligations WHERE id=$1", [e.obligation_id])).rows[0]}),
      work: async c => {
        const baseDate = (await c.query("SELECT CURRENT_DATE::text AS d")).rows[0].d;
        const docs = (await c.query(
          `SELECT d.*, o.renewal_window_days, o.periodicity, o.responsible_identity_id AS obligation_responsible, o.status AS obligation_status
             FROM ext_compliance_documents d JOIN ext_compliance_obligations o ON o.id=d.obligation_id
            WHERE d.origin='ext07_canonica' AND d.is_current AND o.status='ativa'
              AND d.status::text NOT IN ('cancelada','substituida')
              AND ($1::uuid IS NULL OR d.obligation_id=$1::uuid)
            ORDER BY d.id FOR UPDATE OF d`, [scope],
        )).rows;
        if (!docs.length) {
          const any = (await c.query("SELECT id FROM ext_compliance_obligations ORDER BY created_at LIMIT 1")).rows[0];
          if (!any) return {deny: {status: 409, body: {error: "no_canonical_obligation_to_evaluate", absence: "sem_obrigacoes_registradas", base_date: baseDate}}};
          return {
            status: 200,
            body: {base_date: baseDate, source: "ext_compliance_documents", denominator: 0, evaluated: [], tasks_created: 0, absence: "sem_documentos_avaliaveis", scheduler: "Não há scheduler canônico nesta base; a avaliação é operação administrativa explícita."},
            obligationId: scope || any.id, target: scope || any.id, eventType: "avaliacao_temporal",
            eventPayload: {base_date: baseDate, denominator: 0, tasks_created: 0}, auditMeta: {base_date: baseDate, denominator: 0},
          };
        }
        const results = [];
        let createdCount = 0;
        for (const d of docs) {
          const obligation = {id: d.obligation_id, renewal_window_days: d.renewal_window_days, periodicity: d.periodicity, responsible_identity_id: d.obligation_responsible, status: d.obligation_status};
          const r = await evaluateDocument(c, {document: d, obligation, baseDate, actorIdentity: s.identityId});
          if (r.task_created) createdCount += 1;
          results.push({obligation_id: d.obligation_id, document_id: d.id, state: r.document.status, task_id: r.task?.id || null, task_created: r.task_created, pending_reason: r.task?.pending_reason || null, rule: r.rule});
        }
        return {
          status: 200,
          body: {base_date: baseDate, source: "ext_compliance_documents", denominator: docs.length, evaluated: results, tasks_created: createdCount, absence: null, scheduler: "Não há scheduler canônico nesta base; a avaliação é operação administrativa explícita e a geração contínua depende de execução agendada futura."},
          obligationId: scope || docs[0].obligation_id, target: scope || docs[0].obligation_id,
          eventType: "avaliacao_temporal",
          eventPayload: {base_date: baseDate, denominator: docs.length, tasks_created: createdCount},
          auditMeta: {base_date: baseDate, denominator: docs.length, tasks_created: createdCount},
        };
      },
    });
  }

  async function handleTask(req, res, id, operation) {
    if (!UUID.test(id)) return json(res, 400, {error: "invalid_reference"});
    if (req.method !== "POST") return json(res, 405, {error: "method_not_allowed"});
    const s = await staffGuard(req, res, true);
    if (!s) return;
    const b = await readBody(req, res), key = b && idem(req, res);
    if (!b || !key) return;
    const note = operation === "complete" ? txt(b.result, 10, 2000) : operation === "cancel" ? txt(b.justification, 10, 1000) : txt(b.note, 3, 1000);
    if (!note) return json(res, 400, {error: operation === "complete" ? "result_required" : operation === "cancel" ? "justification_required" : "note_required"});
    const next = operation === "start" ? "em_andamento" : operation === "complete" ? "concluida" : "cancelada";
    const fingerprint = hash({op: operation, id, note});
    return mutate(res, {
      identity: s.identityId, key, fingerprint, auditAction: `ext_compliance_task_${operation}`,
      replay: async c => ({task: (await c.query("SELECT * FROM ext_compliance_tasks WHERE id=$1", [id])).rows[0]}),
      work: async c => {
        const t = (await c.query("SELECT * FROM ext_compliance_tasks WHERE id=$1 FOR UPDATE", [id])).rows[0];
        if (!t) return {deny: {status: 404, body: {error: "task_not_found"}}};
        if (!COMPLIANCE_TRANSITIONS.task[t.status]?.includes(next)) return {deny: {status: 409, body: {error: "task_terminal_or_invalid_transition"}}};
        // Fail-closed: sem responsável canônico a tarefa não pode ser concluída.
        if (operation === "complete" && !t.responsible_identity_id) return {deny: {status: 409, body: {error: "responsible_required_fail_closed"}}};
        if (operation === "complete" && !await activeStaff(c, t.responsible_identity_id)) return {deny: {status: 409, body: {error: "responsible_not_active_staff"}}};
        let row;
        if (operation === "start") row = (await c.query("UPDATE ext_compliance_tasks SET status='em_andamento',started_at=NOW(),started_by_identity=$2 WHERE id=$1 RETURNING *", [id, s.identityId])).rows[0];
        else if (operation === "complete") row = (await c.query("UPDATE ext_compliance_tasks SET status='concluida',completed_at=NOW(),completed_by_identity=$2,completion_result=$3 WHERE id=$1 RETURNING *", [id, s.identityId, note])).rows[0];
        else row = (await c.query("UPDATE ext_compliance_tasks SET status='cancelada',cancelled_at=NOW(),cancelled_by_identity=$2,cancellation_justification=$3 WHERE id=$1 RETURNING *", [id, s.identityId, note])).rows[0];
        return {status: 200, body: {task: row}, obligationId: t.obligation_id, documentId: t.document_id, taskId: id, target: id, eventType: `tarefa_${operation}`, eventPayload: {note}, auditMeta: {status: next}};
      },
    });
  }

  // Rotas exatas legadas da 086: leitura autorizada com alias items; mutação aposentada
  // somente após autenticação, papel e same-origin.
  async function handleLegacy(req, res) {
    if (req.method !== "GET") {
      const s = await staffGuard(req, res, true);
      if (!s) return;
      return json(res, 410, {error: "legacy_mutation_retired", canonical: "/api/ext/compliance/obligations"});
    }
    if (!await staffGuard(req, res)) return;
    try {
      const rows = (await pool.query(
        `SELECT id,protocol,title,compliance_type,status::text AS status,origin,version,is_current,is_private,issue_date::text AS issue_date,valid_from::text AS valid_from,expiry_date::text AS expiry_date,has_expiry,obligation_id,created_at
           FROM ext_compliance_documents ORDER BY created_at DESC LIMIT 200`,
      )).rows;
      return json(res, 200, {
        items: rows, documents: rows, source: "ext_compliance_documents",
        canonical: "/api/ext/compliance/obligations",
        projection_note: "Leitura legada minimizada: file_url, storage_key, número documental e referência declarada não são expostos aqui.",
      });
    } catch {return json(res, 503, {error: "compliance_journey_unavailable"});}
  }

  return {
    handleReferences, handleObligationList, handleObligationDetail, handleObligationCreate,
    handleObligationClose, handleDocumentCreate, handleEvaluate, handleLegacy,
    handleTaskStart: (q, r, id) => handleTask(q, r, id, "start"),
    handleTaskComplete: (q, r, id) => handleTask(q, r, id, "complete"),
    handleTaskCancel: (q, r, id) => handleTask(q, r, id, "cancel"),
  };
}
