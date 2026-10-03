import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  SATISFACTION_TRANSITIONS, ACTION_PLAN_TRANSITIONS, SATISFACTION_PRIVACY_BOUNDARY, createExtSatisfactionApi,
} from "../src/server/ext-satisfaction-api.mjs";
import { validateMethodologyConfig, classifyScore, evaluateRecovery } from "../src/server/satisfaction-methodology.mjs";

test("EXT-06: máquina de estados da pesquisa não salta nem reabre terminal", () => {
  assert.deepEqual(SATISFACTION_TRANSITIONS.pendente, ["respondida", "em_acao", "cancelada"]);
  assert.deepEqual(SATISFACTION_TRANSITIONS.respondida, ["concluida"]);
  assert.deepEqual(SATISFACTION_TRANSITIONS.em_acao, ["concluida"]);
  assert.deepEqual(SATISFACTION_TRANSITIONS.concluida, []);
  assert.deepEqual(SATISFACTION_TRANSITIONS.cancelada, []);
});

test("EXT-06: máquina de estados do plano de recuperação é terminal e sem saltos", () => {
  assert.deepEqual(ACTION_PLAN_TRANSITIONS.aberta, ["em_andamento", "concluida", "cancelada"]);
  assert.deepEqual(ACTION_PLAN_TRANSITIONS.em_andamento, ["concluida", "cancelada"]);
  assert.deepEqual(ACTION_PLAN_TRANSITIONS.concluida, []);
  assert.deepEqual(ACTION_PLAN_TRANSITIONS.cancelada, []);
});

test("EXT-06: fronteira de privacidade declara exatamente o que o cliente nunca vê", () => {
  assert.equal(SATISFACTION_PRIVACY_BOUNDARY.criterion, "Resposta gera acompanhamento sem expor funcionário");
  for (const field of ["responsible_identity_id", "responsible_name", "staff_author", "internal_notes", "internal_facts", "internal_risk_reason", "private_task", "audit_log"]) {
    assert.ok(SATISFACTION_PRIVACY_BOUNDARY.client_never_sees.includes(field), `faltando ${field}`);
  }
});

test("EXT-06: validação de metodologia recusa configuração incompleta ou inconsistente", () => {
  assert.deepEqual(validateMethodologyConfig({ methodology: "none", scale_min: 0, scale_max: 10, recovery_rule: { trigger: "none" } }), []);
  assert.ok(validateMethodologyConfig({ methodology: "invalida", scale_min: 0, scale_max: 10, recovery_rule: { trigger: "none" } }).includes("invalid_methodology"));
  assert.ok(validateMethodologyConfig({ methodology: "none", scale_min: 5, scale_max: 2, recovery_rule: { trigger: "none" } }).includes("invalid_scale"));
  assert.ok(validateMethodologyConfig({ methodology: "csat", scale_min: 0, scale_max: 5, methodology_source: "curta", classification_rule: { positive_min: 4 }, recovery_rule: { trigger: "none" } }).includes("methodology_source_required"));
  assert.ok(validateMethodologyConfig({ methodology: "nps", scale_min: 0, scale_max: 5, methodology_source: "Pesquisa NPS trimestral declarada", classification_rule: { detractor_max: 6, passive_max: 8 }, recovery_rule: { trigger: "none" } }).includes("nps_requires_0_10_scale"));
  assert.ok(validateMethodologyConfig({ methodology: "nps", scale_min: 0, scale_max: 10, methodology_source: "Pesquisa NPS trimestral declarada", classification_rule: { detractor_max: 9, passive_max: 8 }, recovery_rule: { trigger: "none" } }).includes("invalid_nps_classification_rule"));
  assert.ok(validateMethodologyConfig({ methodology: "csat", scale_min: 0, scale_max: 5, methodology_source: "Pesquisa CSAT pós-atendimento declarada", classification_rule: { positive_min: 4 }, recovery_rule: { trigger: "nps_detractor" } }).includes("recovery_trigger_requires_nps"));
  assert.ok(validateMethodologyConfig({ methodology: "none", scale_min: 0, scale_max: 10, recovery_rule: { trigger: "score_at_or_below", threshold: 99 } }).includes("invalid_recovery_threshold"));
  const validNps = validateMethodologyConfig({ methodology: "nps", scale_min: 0, scale_max: 10, methodology_source: "Pesquisa NPS trimestral declarada em contrato", classification_rule: { detractor_max: 6, passive_max: 8 }, recovery_rule: { trigger: "nps_detractor" } });
  assert.deepEqual(validNps, []);
});

test("EXT-06: classificação nunca inventa nada fora da metodologia declarada", () => {
  assert.equal(classifyScore({ methodology: "none", classification_rule: null, score: 2 }), null);
  assert.equal(classifyScore({ methodology: "nps", classification_rule: { detractor_max: 6, passive_max: 8 }, score: 3 }), "detrator");
  assert.equal(classifyScore({ methodology: "nps", classification_rule: { detractor_max: 6, passive_max: 8 }, score: 7 }), "neutro");
  assert.equal(classifyScore({ methodology: "nps", classification_rule: { detractor_max: 6, passive_max: 8 }, score: 10 }), "promotor");
  assert.equal(classifyScore({ methodology: "csat", classification_rule: { positive_min: 4 }, score: 3 }), "insatisfeito");
  assert.equal(classifyScore({ methodology: "csat", classification_rule: { positive_min: 4 }, score: 4 }), "satisfeito");
});

test("EXT-06: acompanhamento só dispara pela regra declarada na própria pesquisa, nunca por limiar global", () => {
  assert.equal(evaluateRecovery({ recovery_rule: { trigger: "none" }, methodology: "none", classification: null, score: 1 }).required, false);
  assert.equal(evaluateRecovery({ recovery_rule: { trigger: "never" }, methodology: "nps", classification: "detrator", score: 0 }).required, false);
  assert.equal(evaluateRecovery({ recovery_rule: { trigger: "score_at_or_below", threshold: 6 }, methodology: "none", classification: null, score: 6 }).required, true);
  assert.equal(evaluateRecovery({ recovery_rule: { trigger: "score_at_or_below", threshold: 6 }, methodology: "none", classification: null, score: 7 }).required, false);
  assert.equal(evaluateRecovery({ recovery_rule: { trigger: "nps_detractor" }, methodology: "nps", classification: "detrator", score: 2 }).required, true);
  assert.equal(evaluateRecovery({ recovery_rule: { trigger: "nps_detractor" }, methodology: "nps", classification: "promotor", score: 10 }).required, false);
  assert.equal(evaluateRecovery({ recovery_rule: { trigger: "csat_below_positive" }, methodology: "csat", classification: "insatisfeito", score: 1 }).required, true);
});

test("EXT-06: migração 152 endurece metodologia, escala, máquina de estados e histórico imutável", async () => {
  const sql = await readFile(new URL("../db/migrations/152-ext06-satisfaction-journey.sql", import.meta.url), "utf8");
  for (const token of [
    "cli_satisfaction_surveys", "cli_satisfaction_action_plans", "cli_satisfaction_events",
    "methodology", "recovery_rule", "score_classification", "cancelada",
    "satisfaction historical record is immutable", "canonical satisfaction survey configuration is immutable",
    "satisfaction survey response is immutable", "invalid satisfaction survey transition",
    "satisfaction survey conclusion requires", "terminal satisfaction action plan is immutable",
    "::text", "NOT VALID",
  ]) {
    assert.match(sql, new RegExp(token.replaceAll(" ", "\\s+"), "i"), `faltando token: ${token}`);
  }
  assert.doesNotMatch(sql, /INSERT INTO cli_satisfaction_surveys/i);
  assert.doesNotMatch(sql, /INSERT INTO auth_identities/i);
});

test("EXT-06: servidor liga o namespace canônico novo sem remover a rota legada exata", async () => {
  const source = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(source, /createExtSatisfactionApi/);
  assert.match(source, /\/api\/ext\/satisfaction\/surveys/);
  assert.match(source, /pathname\.startsWith\("\/api\/ext\/satisfaction\/"\)/);
  assert.match(source, /ext-satisfaction-surveys/);
  assert.match(source, /extApi\.handleSatisfactionSurveys/);
});

test("EXT-06: jornada do cliente nunca projeta responsável, risco interno ou fatos internos", async () => {
  const source = await readFile(new URL("../src/server/cli-finance-api.mjs", import.meta.url), "utf8");
  const projectionStart = source.indexOf("function projectClientSurvey");
  const projectionEnd = source.indexOf("\n}", projectionStart);
  const projection = source.slice(projectionStart, projectionEnd);
  for (const forbidden of ["renewal_risk", "facts_json", "responsible", "action_plan_pending_reason"]) {
    assert.doesNotMatch(projection, new RegExp(forbidden, "i"), `projeção do cliente vazou ${forbidden}`);
  }
  const planProjectionStart = source.indexOf("function projectClientActionPlan");
  const planProjectionEnd = source.indexOf("\n}", planProjectionStart);
  const planProjection = source.slice(planProjectionStart, planProjectionEnd);
  assert.doesNotMatch(planProjection, /responsible/i);
  assert.match(source, /legacy_mutation_retired/);
  assert.match(source, /score<=6\) AS previous_low_scores/); // fato interno continua sendo contado, nunca exposto
});

test("EXT-06: UI do cliente não renderiza risco de renovação nem fatos internos", async () => {
  const source = await readFile(new URL("../src/app/cliente/app/satisfacao/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /renewal_risk/i);
  assert.doesNotMatch(source, /facts_json/i);
  assert.doesNotMatch(source, /action_plan_pending_reason/i);
  assert.doesNotMatch(source, /responsible/i);
});

test("EXT-06: UI staff preserva chave de idempotência após falha e declara o critério de aceite", async () => {
  const source = await readFile(new URL("../src/app/admin/satisfacao/SatisfacaoWorkspace.tsx", import.meta.url), "utf8");
  assert.match(source, /keys\.current\[op\]=k/);
  assert.match(source, /delete keys\.current\[op\]/);
  assert.match(source, /Resposta gera acompanhamento sem expor funcionário/);
});

test("EXT-06: guardas distinguem 401 e 403 antes de qualquer leitura", async () => {
  function response() { return { status: 0, body: null, writeHead(s) { this.status = s; }, end(v) { this.body = JSON.parse(v); } }; }
  const pool = { query: async () => ({ rows: [] }) };
  const anonymous = createExtSatisfactionApi({ pool, sameOrigin: () => true, requireSession: async () => null });
  let r = response();
  await anonymous.handleList({ method: "GET", headers: {}, url: "/api/ext/satisfaction/surveys" }, r);
  assert.equal(r.status, 401);

  const deniedRole = createExtSatisfactionApi({ pool, sameOrigin: () => true, requireSession: async () => ({ identityId: "00000000-0000-4000-8000-000000000001", role: "rh" }) });
  r = response();
  await deniedRole.handleList({ method: "GET", headers: {}, url: "/api/ext/satisfaction/surveys" }, r);
  assert.equal(r.status, 403);

  const deniedOrigin = createExtSatisfactionApi({ pool, sameOrigin: () => false, requireSession: async () => ({ identityId: "00000000-0000-4000-8000-000000000001", role: "admin" }) });
  r = response();
  await deniedOrigin.handleCreate({ method: "POST", headers: { "idempotency-key": "ext06-test-key-0001" }, url: "/api/ext/satisfaction/surveys", async *[Symbol.asyncIterator]() {} }, r);
  assert.equal(r.status, 403);
});
