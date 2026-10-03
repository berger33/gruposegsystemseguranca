// EXT-06 — jornada staff canônica de satisfação/carteira.
//
// Fonte de dados: cli_satisfaction_surveys / cli_satisfaction_action_plans
// (CLI-09..14, migrações 076/142), endurecida pela migração 152. Esta API
// NUNCA escreve em ext_satisfaction_surveys (legado EXT-06/085). A jornada
// autenticada do cliente (CLI-11) continua em
// src/server/cli-finance-api.mjs#handleClientSatisfactionSurveys e
// compartilha a mesma metodologia declarada via
// src/server/satisfaction-methodology.mjs — uma única regra, dois atores.
//
// Toda mutação: BEGIN, replay por idempotência, negócio, acompanhamento
// quando exigido, evento imutável, audit_log, COMMIT. Falha de audit_log =>
// ROLLBACK + 503. Nenhuma mutação aceita autoria, destinatário, responsável
// ou estado vindos do corpo.
import { createHash } from "node:crypto";
import { validateMethodologyConfig } from "./satisfaction-methodology.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/;
const ROLES = ["admin", "marcelo", "ti"];

export const SATISFACTION_TRANSITIONS = Object.freeze({
  pendente: ["respondida", "em_acao", "cancelada"],
  respondida: ["concluida"],
  em_acao: ["concluida"],
  concluida: [],
  cancelada: [],
});
export const ACTION_PLAN_TRANSITIONS = Object.freeze({
  aberta: ["em_andamento", "concluida", "cancelada"],
  em_andamento: ["concluida", "cancelada"],
  concluida: [],
  cancelada: [],
});
export const SATISFACTION_PRIVACY_BOUNDARY = Object.freeze({
  criterion: "Resposta gera acompanhamento sem expor funcionário",
  client_sees: ["survey", "scale", "own_response", "public_follow_up_status", "neutral_ack_message"],
  client_never_sees: [
    "responsible_identity_id", "responsible_name", "staff_author", "internal_notes",
    "internal_facts", "internal_risk_reason", "private_task", "audit_log",
  ],
});

const fp = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const text = (v, min, max) => (typeof v === "string" && v.trim().length >= min && v.trim().length <= max ? v.trim() : null);
const int = v => (Number.isInteger(v) ? v : (typeof v === "string" && /^-?\d+$/.test(v) ? Number(v) : null));

function protocol() {
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `SAT-CLI-${stamp}-${createHash("sha256").update(`${Date.now()}:${Math.random()}`).digest("hex").slice(0, 4).toUpperCase()}`;
}

export function createExtSatisfactionApi({ pool, sameOrigin, requireSession }) {
  const json = (res, status, body) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
  const role = s => String(s?.role || s?.userRole || "").toLowerCase();

  async function guard(req, res, { write = false } = {}) {
    let s = null;
    try { s = await requireSession(req); } catch {}
    if (!s) { json(res, 401, { error: "unauthorized" }); return null; }
    if (!ROLES.includes(role(s))) { json(res, 403, { error: "forbidden_role" }); return null; }
    if (write && !sameOrigin(req)) { json(res, 403, { error: "origin_forbidden" }); return null; }
    if (write && !UUID.test(String(s.identityId || ""))) { json(res, 401, { error: "unauthorized" }); return null; }
    return s;
  }

  async function body(req) {
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 32768) return { large: true }; chunks.push(c); }
    try {
      const v = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      return (!v || typeof v !== "object" || Array.isArray(v)) ? { invalid: true } : { value: v };
    } catch { return { invalid: true }; }
  }

  function key(req, res) {
    const v = String(req.headers["idempotency-key"] || "").trim();
    if (!KEY.test(v)) { json(res, 400, { error: "idempotency_key_required" }); return null; }
    return v;
  }

  async function parsedWrite(req, res) {
    const s = await guard(req, res, { write: true }); if (!s) return null;
    const p = await body(req);
    if (p.large) { json(res, 413, { error: "body_too_large" }); return null; }
    if (p.invalid) { json(res, 400, { error: "invalid_request" }); return null; }
    const k = key(req, res); return k ? { s, b: p.value, k } : null;
  }

  async function event(client, { surveyId = null, planId = null, type, summary, payload, actorKind, k, fingerprint, identity }) {
    await client.query(
      `INSERT INTO cli_satisfaction_events(survey_id,action_plan_id,event_type,summary,payload,actor_kind,idempotency_key,request_fingerprint,created_by_identity)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [surveyId, planId, type, summary, JSON.stringify(payload || {}), actorKind, k, fingerprint, identity],
    );
  }

  async function mutation(res, { session, k, fingerprint, auditAction, replay, work }) {
    let c;
    try {
      c = await pool.connect();
      await c.query("BEGIN");
      const old = await c.query(`SELECT * FROM cli_satisfaction_events WHERE created_by_identity=$1 AND idempotency_key=$2 FOR UPDATE`, [session.identityId, k]);
      if (old.rows[0]) {
        if (old.rows[0].request_fingerprint !== fingerprint) { await c.query("ROLLBACK"); return json(res, 409, { error: "idempotency_key_reused" }); }
        const out = await replay(c, old.rows[0]);
        await c.query("COMMIT");
        return json(res, 200, { ...out, replayed: true });
      }
      const out = await work(c);
      if (out.deny) { await c.query("ROLLBACK"); return json(res, out.deny.status, out.deny.body); }
      try {
        await c.query(`INSERT INTO audit_log(action,actor,target,meta) VALUES($1,$2,$3,$4)`, [auditAction, session.identityId, out.target, JSON.stringify(out.meta || {})]);
      } catch (error) {
        await c.query("ROLLBACK");
        console.error("EXT-06 audit unavailable", error?.message || error);
        return json(res, 503, { error: "audit_unavailable" });
      }
      await c.query("COMMIT");
      return json(res, out.status, out.body);
    } catch (error) {
      await c?.query("ROLLBACK").catch(() => {});
      if (error?.code === "23505" && /idempotency/i.test(String(error.constraint || error.detail || ""))) {
        try {
          const old = await c.query(`SELECT * FROM cli_satisfaction_events WHERE created_by_identity=$1 AND idempotency_key=$2`, [session.identityId, k]);
          if (old.rows[0]) {
            if (old.rows[0].request_fingerprint !== fingerprint) return json(res, 409, { error: "idempotency_key_reused" });
            return json(res, 200, { ...(await replay(c, old.rows[0])), replayed: true });
          }
        } catch {}
      }
      console.error("EXT-06 mutation failed", error?.message || error);
      return json(res, 503, { error: "satisfaction_journey_unavailable" });
    } finally { c?.release(); }
  }

  async function survey(db, id, lock = "") {
    return (await db.query(`SELECT * FROM cli_satisfaction_surveys WHERE id=$1 AND origin='jornada_canonica' ${lock}`, [id])).rows[0] || null;
  }

  async function plan(db, id, lock = "") {
    return (await db.query(`SELECT * FROM cli_satisfaction_action_plans WHERE id=$1 ${lock}`, [id])).rows[0] || null;
  }

  async function detail(db, id) {
    const item = await survey(db, id);
    if (!item) return null;
    const [plans, events] = await Promise.all([
      db.query(`SELECT * FROM cli_satisfaction_action_plans WHERE survey_id=$1 ORDER BY created_at`, [id]),
      db.query(`SELECT * FROM cli_satisfaction_events WHERE survey_id=$1 ORDER BY created_at`, [id]),
    ]);
    return { survey: item, action_plans: plans.rows, events: events.rows, privacy_boundary: SATISFACTION_PRIVACY_BOUNDARY };
  }

  async function responsibleFor(db, clientAccountId) {
    const { rows } = await db.query(
      `SELECT company.responsible_id, company.responsible_name
         FROM client_accounts account
         LEFT JOIN crm_companies company ON company.id = account.crm_company_id AND company.status='active'
        WHERE account.id=$1`,
      [clientAccountId],
    );
    return rows[0] || { responsible_id: null, responsible_name: null };
  }

  // GET /api/ext/satisfaction/references[?account_id=]
  async function handleReferences(req, res) {
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    if (!await guard(req, res)) return;
    const url = new URL(req.url, "http://internal");
    const accountId = url.searchParams.get("account_id");
    const accounts = await pool.query(`SELECT id, display_name, status FROM client_accounts WHERE status='active' ORDER BY display_name LIMIT 200`);
    const out = { accounts: accounts.rows, source: "client_accounts" };
    if (accountId) {
      if (!UUID.test(accountId)) return json(res, 400, { error: "invalid_reference" });
      const [targets, contracts, tickets, visits] = await Promise.all([
        pool.query(
          `SELECT i.id, i.display_name, i.email FROM auth_identities i
             JOIN client_access_grants g ON g.identity_id=i.id AND g.revoked_at IS NULL AND g.client_account_id=$1
            WHERE i.kind='client' AND i.status='active' ORDER BY i.display_name LIMIT 100`,
          [accountId],
        ),
        pool.query(`SELECT id, title FROM client_contracts WHERE client_account_id=$1 ORDER BY created_at DESC LIMIT 100`, [accountId]),
        pool.query(`SELECT id, protocol, title FROM cli_tickets_v2 WHERE client_account_id=$1 ORDER BY created_at DESC LIMIT 100`, [accountId]),
        pool.query(`SELECT id, protocol, title FROM cli_visits WHERE client_account_id=$1 ORDER BY scheduled_at DESC LIMIT 100`, [accountId]),
      ]);
      out.targets = targets.rows; out.contracts = contracts.rows; out.tickets = tickets.rows; out.visits = visits.rows;
    }
    return json(res, 200, out);
  }

  // GET /api/ext/satisfaction/surveys (POST roteado para handleCreate)
  async function handleList(req, res) {
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    if (!await guard(req, res)) return;
    const url = new URL(req.url, "http://internal");
    const accountId = url.searchParams.get("account_id");
    const types = url.searchParams.getAll("survey_type");
    const params = []; const clauses = ["origin='jornada_canonica'"];
    if (accountId) { if (!UUID.test(accountId)) return json(res, 400, { error: "invalid_reference" }); params.push(accountId); clauses.push(`client_account_id=$${params.length}`); }
    if (types.length) { params.push(types); clauses.push(`survey_type::text = ANY($${params.length}::text[])`); }
    const { rows } = await pool.query(
      `SELECT * FROM cli_satisfaction_surveys WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT 200`, params,
    );
    return json(res, 200, {
      surveys: rows, source: "cli_satisfaction_surveys", criterion: "Resposta gera acompanhamento sem expor funcionário",
      empty_state: rows.length ? null : "Nenhuma pesquisa canônica registrada; o cluster limpo não recebe seed.",
    });
  }

  async function handleCreate(req, res) {
    const p = await parsedWrite(req, res); if (!p) return;
    const clientAccountId = String(p.b.client_account_id || "");
    const targetIdentityId = String(p.b.target_identity_id || "");
    const contractId = p.b.contract_id ? String(p.b.contract_id) : null;
    const ticketId = p.b.ticket_id ? String(p.b.ticket_id) : null;
    const visitId = p.b.visit_id ? String(p.b.visit_id) : null;
    const surveyType = ["pos_atendimento", "periodica", "outro"].includes(p.b.survey_type) ? p.b.survey_type : "pos_atendimento";
    const methodology = p.b.methodology;
    const scaleMin = int(p.b.scale_min);
    const scaleMax = int(p.b.scale_max);
    const methodologySource = p.b.methodology_source;
    const classificationRule = p.b.classification_rule ?? null;
    const recoveryRule = p.b.recovery_rule ?? { trigger: "none" };
    if (!UUID.test(clientAccountId) || !UUID.test(targetIdentityId)) return json(res, 400, { error: "invalid_reference" });
    if (contractId && !UUID.test(contractId)) return json(res, 400, { error: "invalid_reference" });
    if (ticketId && !UUID.test(ticketId)) return json(res, 400, { error: "invalid_reference" });
    if (visitId && !UUID.test(visitId)) return json(res, 400, { error: "invalid_reference" });
    const errors = validateMethodologyConfig({ methodology, scale_min: scaleMin, scale_max: scaleMax, methodology_source: methodologySource, classification_rule: classificationRule, recovery_rule: recoveryRule });
    if (errors.length) return json(res, 400, { error: "invalid_methodology_config", details: errors });
    const fingerprint = fp({ op: "create", clientAccountId, targetIdentityId, contractId, ticketId, visitId, surveyType, methodology, scaleMin, scaleMax, methodologySource, classificationRule, recoveryRule });
    return mutation(res, {
      session: p.s, k: p.k, fingerprint, auditAction: "ext_satisfaction_survey_create",
      replay: async (c, e) => ({ survey: await survey(c, e.survey_id) }),
      work: async c => {
        const account = await c.query(`SELECT id FROM client_accounts WHERE id=$1 AND status='active' FOR SHARE`, [clientAccountId]);
        if (!account.rows[0]) return { deny: { status: 400, body: { error: "invalid_client_account" } } };
        const grant = await c.query(
          `SELECT 1 FROM auth_identities i JOIN client_access_grants g ON g.identity_id=i.id AND g.revoked_at IS NULL AND g.client_account_id=$2
            WHERE i.id=$1 AND i.kind='client' AND i.status='active'`,
          [targetIdentityId, clientAccountId],
        );
        if (!grant.rows[0]) return { deny: { status: 400, body: { error: "invalid_target_identity" } } };
        let row;
        try {
          const insert = await c.query(
            `INSERT INTO cli_satisfaction_surveys
               (protocol, client_account_id, contract_id, ticket_id, visit_id, survey_type, target_identity_id,
                methodology, scale_min, scale_max, methodology_source, classification_rule, recovery_rule,
                created_by_identity, origin)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'jornada_canonica') RETURNING *`,
            [protocol(), clientAccountId, contractId, ticketId, visitId, surveyType, targetIdentityId,
              methodology, scaleMin, scaleMax, methodology === "none" ? null : methodologySource,
              methodology === "none" ? null : JSON.stringify(classificationRule), JSON.stringify(recoveryRule),
              p.s.identityId],
          );
          row = insert.rows[0];
        } catch (error) {
          if (error?.code === "23514" || error?.code === "P0001") return { deny: { status: 400, body: { error: "invalid_survey_scope" } } };
          throw error;
        }
        await event(c, { surveyId: row.id, type: "pesquisa_criada", summary: "Pesquisa de satisfação criada com metodologia declarada.", payload: { methodology, scaleMin, scaleMax }, actorKind: "staff", k: p.k, fingerprint, identity: p.s.identityId });
        return { status: 201, body: { survey: row }, target: row.id, meta: { protocol: row.protocol } };
      },
    });
  }

  async function handleDetail(req, res, id) {
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    if (!await guard(req, res)) return;
    const out = await detail(pool, id);
    return out ? json(res, 200, out) : json(res, 404, { error: "not_found" });
  }

  async function handleCancel(req, res, id) {
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const p = await parsedWrite(req, res); if (!p) return;
    const justification = text(p.b.justification, 10, 1000);
    if (!justification) return json(res, 400, { error: "justification_required" });
    const fingerprint = fp({ op: "cancel", id, justification });
    return mutation(res, {
      session: p.s, k: p.k, fingerprint, auditAction: "ext_satisfaction_survey_cancel",
      replay: async c => ({ survey: await survey(c, id) }),
      work: async c => {
        const current = await survey(c, id, "FOR UPDATE");
        if (!current) return { deny: { status: 404, body: { error: "not_found" } } };
        if (current.status !== "pendente") return { deny: { status: 409, body: { error: "invalid_status_transition", previous_status: current.status } } };
        const row = (await c.query(
          `UPDATE cli_satisfaction_surveys SET status='cancelada', cancelled_at=NOW(), cancelled_by_identity=$2, cancellation_justification=$3 WHERE id=$1 RETURNING *`,
          [id, p.s.identityId, justification],
        )).rows[0];
        await event(c, { surveyId: id, type: "pesquisa_cancelada", summary: "Pesquisa cancelada antes de qualquer resposta.", payload: { justification }, actorKind: "staff", k: p.k, fingerprint, identity: p.s.identityId });
        return { status: 200, body: { survey: row }, target: id, meta: {} };
      },
    });
  }

  async function handleConclude(req, res, id) {
    if (!UUID.test(id)) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const p = await parsedWrite(req, res); if (!p) return;
    const result = text(p.b.conclusion_result, 5, 1000);
    if (!result) return json(res, 400, { error: "conclusion_result_required" });
    const fingerprint = fp({ op: "conclude", id, result });
    return mutation(res, {
      session: p.s, k: p.k, fingerprint, auditAction: "ext_satisfaction_survey_conclude",
      replay: async c => ({ survey: await survey(c, id) }),
      work: async c => {
        const current = await survey(c, id, "FOR UPDATE");
        if (!current) return { deny: { status: 404, body: { error: "not_found" } } };
        if (!["respondida", "em_acao"].includes(current.status)) return { deny: { status: 409, body: { error: "invalid_status_transition", previous_status: current.status } } };
        if (current.recovery_required) {
          const latestPlan = (await c.query(`SELECT status FROM cli_satisfaction_action_plans WHERE survey_id=$1 ORDER BY created_at DESC LIMIT 1`, [id])).rows[0];
          if (!latestPlan || latestPlan.status !== "concluida") return { deny: { status: 409, body: { error: "recovery_plan_pending" } } };
        }
        const row = (await c.query(
          `UPDATE cli_satisfaction_surveys SET status='concluida', concluded_at=NOW(), concluded_by_identity=$2, conclusion_result=$3 WHERE id=$1 RETURNING *`,
          [id, p.s.identityId, result],
        )).rows[0];
        await event(c, { surveyId: id, type: "pesquisa_concluida", summary: "Pesquisa concluída pela equipe interna.", payload: { result }, actorKind: "staff", k: p.k, fingerprint, identity: p.s.identityId });
        return { status: 200, body: { survey: row }, target: id, meta: {} };
      },
    });
  }

  // Abre manualmente um plano de recuperação quando a resposta exigiu
  // acompanhamento mas não havia responsável real no momento da resposta
  // (fail-closed). O responsável é sempre derivado de crm_companies; nunca
  // aceito do corpo.
  async function handlePlanCreate(req, res, surveyId) {
    if (!UUID.test(surveyId)) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const p = await parsedWrite(req, res); if (!p) return;
    const fingerprint = fp({ op: "plan_create", surveyId });
    return mutation(res, {
      session: p.s, k: p.k, fingerprint, auditAction: "ext_satisfaction_plan_create",
      replay: async (c, e) => ({ action_plan: await plan(c, e.action_plan_id) }),
      work: async c => {
        const current = await survey(c, surveyId, "FOR UPDATE");
        if (!current) return { deny: { status: 404, body: { error: "not_found" } } };
        if (!current.recovery_required) return { deny: { status: 409, body: { error: "recovery_not_required" } } };
        const existing = await c.query(`SELECT 1 FROM cli_satisfaction_action_plans WHERE survey_id=$1`, [surveyId]);
        if (existing.rows[0]) return { deny: { status: 409, body: { error: "action_plan_already_exists" } } };
        const responsible = await responsibleFor(c, current.client_account_id);
        if (!responsible.responsible_id) return { deny: { status: 409, body: { error: "no_real_responsible_available" } } };
        const due = new Date(); due.setUTCDate(due.getUTCDate() + 7);
        const row = (await c.query(
          `INSERT INTO cli_satisfaction_action_plans (id, survey_id, action, responsible_name, responsible_identity_id, due_date, status, origin, facts_json)
           VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,'aberta','registro_interno',$6::jsonb) RETURNING *`,
          [surveyId, `Tratar insatisfação registrada na pesquisa ${surveyId}.`, responsible.responsible_name, responsible.responsible_id, due.toISOString().slice(0, 10), JSON.stringify(current.recovery_facts || {})],
        )).rows[0];
        if (current.status !== "em_acao") {
          await c.query(`UPDATE cli_satisfaction_surveys SET status='em_acao' WHERE id=$1`, [surveyId]);
        }
        await event(c, { surveyId, planId: row.id, type: "plano_aberto_manual", summary: "Plano de recuperação aberto manualmente com responsável canônico.", payload: { responsible_identity_id: responsible.responsible_id }, actorKind: "staff", k: p.k, fingerprint, identity: p.s.identityId });
        return { status: 201, body: { action_plan: row }, target: row.id, meta: { survey_id: surveyId } };
      },
    });
  }

  async function handlePlanTransition(req, res, planId, operation) {
    if (!UUID.test(planId)) return json(res, 400, { error: "invalid_reference" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const p = await parsedWrite(req, res); if (!p) return;
    let extra = {};
    if (operation === "complete") {
      const result = text(p.b.completion_result, 5, 1000);
      if (!result) return json(res, 400, { error: "completion_result_required" });
      extra = { result };
    } else if (operation === "cancel") {
      const justification = text(p.b.justification, 10, 1000);
      if (!justification) return json(res, 400, { error: "justification_required" });
      extra = { justification };
    }
    const fingerprint = fp({ op: `plan_${operation}`, planId, ...extra });
    return mutation(res, {
      session: p.s, k: p.k, fingerprint, auditAction: `ext_satisfaction_plan_${operation}`,
      replay: async (c, e) => ({ action_plan: await plan(c, e.action_plan_id) }),
      work: async c => {
        const current = await plan(c, planId, "FOR UPDATE");
        if (!current) return { deny: { status: 404, body: { error: "action_plan_not_found" } } };
        if (!ACTION_PLAN_TRANSITIONS[current.status]?.includes(
          operation === "start" ? "em_andamento" : operation === "complete" ? "concluida" : "cancelada",
        )) return { deny: { status: 409, body: { error: "action_plan_terminal_or_invalid" } } };
        let row;
        if (operation === "start") {
          row = (await c.query(`UPDATE cli_satisfaction_action_plans SET status='em_andamento', started_at=NOW(), started_by_identity=$2 WHERE id=$1 RETURNING *`, [planId, p.s.identityId])).rows[0];
        } else if (operation === "complete") {
          if (!current.responsible_identity_id) return { deny: { status: 409, body: { error: "responsible_required_to_complete" } } };
          row = (await c.query(`UPDATE cli_satisfaction_action_plans SET status='concluida', completed_at=NOW(), completed_by_identity=$2, completion_result=$3 WHERE id=$1 RETURNING *`, [planId, p.s.identityId, extra.result])).rows[0];
        } else {
          row = (await c.query(`UPDATE cli_satisfaction_action_plans SET status='cancelada', cancelled_at=NOW(), cancelled_by_identity=$2, cancellation_justification=$3 WHERE id=$1 RETURNING *`, [planId, p.s.identityId, extra.justification])).rows[0];
        }
        await event(c, { surveyId: current.survey_id, planId, type: `plano_${operation}`, summary: `Plano de recuperação: ${operation}.`, payload: extra, actorKind: "staff", k: p.k, fingerprint, identity: p.s.identityId });
        return { status: 200, body: { action_plan: row }, target: planId, meta: { survey_id: current.survey_id } };
      },
    });
  }

  // GET /api/ext/satisfaction/aggregates?account_id=&from=&to=
  async function handleAggregates(req, res) {
    if (req.method !== "GET") return json(res, 405, { error: "method_not_allowed" });
    if (!await guard(req, res)) return;
    const url = new URL(req.url, "http://internal");
    const accountId = url.searchParams.get("account_id");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (accountId && !UUID.test(accountId)) return json(res, 400, { error: "invalid_reference" });
    const params = []; const clauses = ["origin='jornada_canonica'"];
    if (accountId) { params.push(accountId); clauses.push(`client_account_id=$${params.length}`); }
    if (from) { params.push(from); clauses.push(`created_at >= $${params.length}::timestamptz`); }
    if (to) { params.push(to); clauses.push(`created_at < $${params.length}::timestamptz`); }
    const { rows } = await pool.query(
      `SELECT methodology, count(*)::int total,
              count(*) FILTER (WHERE responded_at IS NOT NULL)::int answered,
              count(*) FILTER (WHERE score_classification='promotor')::int promoters,
              count(*) FILTER (WHERE score_classification='neutro')::int passives,
              count(*) FILTER (WHERE score_classification='detrator')::int detractors,
              count(*) FILTER (WHERE score_classification='satisfeito')::int satisfied,
              count(*) FILTER (WHERE score_classification='insatisfeito')::int dissatisfied,
              avg(score) FILTER (WHERE score IS NOT NULL) AS average_score
         FROM cli_satisfaction_surveys WHERE ${clauses.join(" AND ")} GROUP BY methodology`,
      params,
    );
    const groups = rows.map(r => ({
      methodology: r.methodology, denominator: r.total, answered: Number(r.answered),
      average_score: r.answered > 0 ? Number(r.average_score) : null,
      no_data: Number(r.answered) === 0,
      promoters: r.promoters, passives: r.passives, detractors: r.detractors,
      satisfied: r.satisfied, dissatisfied: r.dissatisfied,
    }));
    return json(res, 200, {
      source: "cli_satisfaction_surveys", period: { from: from || null, to: to || null }, account_id: accountId || null,
      groups, empty_state: groups.length ? null : "Sem pesquisas no período; ausência não é apresentada como zero.",
    });
  }

  return {
    handleReferences, handleList, handleCreate, handleDetail, handleCancel, handleConclude, handlePlanCreate,
    handlePlanStart: (q, s, id) => handlePlanTransition(q, s, id, "start"),
    handlePlanComplete: (q, s, id) => handlePlanTransition(q, s, id, "complete"),
    handlePlanCancel: (q, s, id) => handlePlanTransition(q, s, id, "cancel"),
    handleAggregates,
  };
}
