import assert from "node:assert/strict";
import { test } from "node:test";
import { createCliFinanceApi } from "../src/server/cli-finance-api.mjs";

const accountId = "11111111-1111-4111-8111-111111111111";
const identityId = "22222222-2222-4222-8222-222222222222";
const surveyId = "66666666-6666-4666-8666-666666666666";
const responsibleId = "44444444-4444-4444-8444-444444444444";

function responseCapture() {
  return {
    status: 0,
    payload: null,
    writeHead(status) { this.status = status; },
    end(body) { this.payload = JSON.parse(body); },
  };
}

function request({ method = "GET", url = `/api/client/satisfaction-surveys?account=${accountId}`, body, key = "cli11-test-key" } = {}) {
  const bytes = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  return {
    method,
    url,
    headers: { host: "portal.test", origin: "https://portal.test", "idempotency-key": key },
    async *[Symbol.asyncIterator]() { yield* bytes; },
  };
}

function api(pool, session = { identityId }) {
  return createCliFinanceApi({
    pool,
    auditLog: async () => {},
    sameOrigin: () => true,
    requireSession: async () => null,
    requireClientSession: async () => session,
    requireRole: () => false,
  });
}

function transactionalPool({ counts, responsibleName }) {
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes("response_idempotency_key=$2 FOR UPDATE")) return { rows: [] };
      if (sql.includes("FROM cli_satisfaction_surveys survey")) {
        return { rows: [{ id: surveyId, status: "pendente", client_account_id: accountId, responsible_id: responsibleId, responsible_name: responsibleName }] };
      }
      if (sql.includes("AS open_tickets")) return { rows: [counts] };
      if (sql.startsWith("UPDATE cli_satisfaction_surveys")) {
        return { rows: [{ id: surveyId, protocol: "SAT-CLI-20261003-ABCD", status: "em_acao" }] };
      }
      if (sql.includes("INSERT INTO cli_satisfaction_action_plans")) return { rows: [{ id: "plan", survey_id: surveyId }] };
      return { rows: [] };
    },
    release() { statements.push("RELEASE"); },
  };
  return { statements, pool: { connect: async () => client, query: async () => ({ rows: [] }) } };
}

const answerBody = { survey_id: surveyId, score: 3, feedback: "O atendimento noturno demorou mais do que o combinado." };

test("CLI-11 exige sessão cliente antes de consultar pesquisas", async () => {
  let queried = false;
  const handler = api({ query: async () => { queried = true; } }, null);
  const res = responseCapture();
  await handler.handleSatisfactionSurveys(request(), res);
  assert.equal(res.status, 401);
  assert.equal(res.payload.error, "client_session_required");
  assert.equal(queried, false);
});

test("CLI-11 nega conta sem grant, audita a recusa e não lê pesquisas", async () => {
  const statements = [];
  const pool = { query: async sql => { statements.push(sql); return { rows: [] }; } };
  const res = responseCapture();
  await api(pool).handleSatisfactionSurveys(request(), res);
  assert.equal(res.status, 403);
  assert.equal(res.payload.error, "forbidden");
  assert.ok(statements.some(sql => sql.includes("satisfaction_survey_list") && sql.includes("denied")));
  assert.ok(!statements.some(sql => sql.includes("FROM cli_satisfaction_surveys\n")));
});

test("CLI-11 grava resposta, fatos, plano de ação e auditoria na mesma transação", async () => {
  const { statements, pool } = transactionalPool({
    counts: { open_tickets: "2", overdue_charges: "0", previous_low_scores: "1" },
    responsibleName: "Responsável real",
  });
  const res = responseCapture();
  await api(pool).handleSatisfactionSurveys(request({ method: "POST", url: "/api/client/satisfaction-surveys", body: answerBody }), res);

  assert.equal(res.status, 200);
  assert.equal(res.payload.actionPlan.survey_id, surveyId);
  const begin = statements.indexOf("BEGIN");
  const facts = statements.findIndex(sql => sql.includes("AS open_tickets"));
  const update = statements.findIndex(sql => sql.startsWith("UPDATE cli_satisfaction_surveys"));
  const plan = statements.findIndex(sql => sql.includes("INSERT INTO cli_satisfaction_action_plans"));
  const audit = statements.findIndex(sql => sql.includes("satisfaction_survey_respond") && sql.includes("allowed"));
  const commit = statements.indexOf("COMMIT");
  assert.ok(begin >= 0 && begin < facts && facts < update && update < plan && plan < audit && audit < commit);
  assert.ok(!statements.some(sql => /INSERT INTO (client_contracts|cli_charges_v2|crm_contracts)/.test(sql)));
});

test("CLI-11 não abre plano de ação sem responsável real e declara a pendência", async () => {
  const { statements, pool } = transactionalPool({
    counts: { open_tickets: "0", overdue_charges: "0", previous_low_scores: "0" },
    responsibleName: null,
  });
  const res = responseCapture();
  await api(pool).handleSatisfactionSurveys(request({ method: "POST", url: "/api/client/satisfaction-surveys", body: answerBody }), res);

  assert.equal(res.status, 200);
  assert.equal(res.payload.actionPlan, null);
  assert.ok(!statements.some(sql => sql.includes("INSERT INTO cli_satisfaction_action_plans")));
  assert.ok(statements.indexOf("COMMIT") >= 0);
});

test("CLI-11 recusa nota fora da faixa e comentário curto sem abrir transação", async () => {
  let connected = false;
  const pool = { connect: async () => { connected = true; return null; }, query: async () => ({ rows: [] }) };
  const handler = api(pool);

  const invalidScore = responseCapture();
  await handler.handleSatisfactionSurveys(request({ method: "POST", url: "/api/client/satisfaction-surveys", body: { ...answerBody, score: 11 } }), invalidScore);
  assert.equal(invalidScore.status, 400);
  assert.equal(invalidScore.payload.error, "score_0_10");

  const shortFeedback = responseCapture();
  await handler.handleSatisfactionSurveys(request({ method: "POST", url: "/api/client/satisfaction-surveys", body: { ...answerBody, feedback: "ruim" } }), shortFeedback);
  assert.equal(shortFeedback.status, 400);
  assert.equal(shortFeedback.payload.error, "feedback_10_2000");

  const noKey = responseCapture();
  await handler.handleSatisfactionSurveys(request({ method: "POST", url: "/api/client/satisfaction-surveys", body: answerBody, key: "x" }), noKey);
  assert.equal(noKey.status, 400);
  assert.equal(noKey.payload.error, "idempotency_key_required");

  assert.equal(connected, false);
});

test("CLI-11 devolve a resposta original no replay da mesma chave", async () => {
  const stored = { id: surveyId, protocol: "SAT-CLI-20261003-ABCD", response_fingerprint: null };
  const statements = [];
  const client = {
    async query(sql) {
      statements.push(sql);
      if (sql.includes("response_idempotency_key=$2 FOR UPDATE")) return { rows: [stored] };
      return { rows: [] };
    },
    release() {},
  };
  const pool = { connect: async () => client, query: async () => ({ rows: [] }) };
  const res = responseCapture();
  await api(pool).handleSatisfactionSurveys(request({ method: "POST", url: "/api/client/satisfaction-surveys", body: answerBody }), res);
  assert.equal(res.status, 409);
  assert.equal(res.payload.error, "idempotency_key_reused");
  assert.ok(statements.includes("ROLLBACK"));
});
