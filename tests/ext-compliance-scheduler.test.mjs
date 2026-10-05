// EXT-07 — teste focal: execução agendada da avaliação temporal.
// Unidade com fake pool (sem banco real) + guardas estáticas sobre a migração
// 156, o módulo do agendador e a ligação em server.mjs. A jornada HTTP/PG com
// o agendador de verdade é provada pelo gate dedicado
// (scripts/qa-ext07-compliance-postgres.mjs) em cluster descartável.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSchedulerConfig,
  runScheduledEvaluationOnce,
  startExtComplianceScheduler,
} from "../src/server/ext-compliance-scheduler.mjs";
import { createExtComplianceApi } from "../src/server/ext-compliance-api.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readRepo = (p) => readFile(path.join(root, p), "utf8");

const actorIdentity = "22222222-2222-4222-8222-222222222222";
const today = "2026-10-04";
const dayKey = `agendada:${today}`;

// ---------------------------------------------------------------------------
// Configuração por ambiente: opt-in explícito; valor inválido não liga nada.
// ---------------------------------------------------------------------------

test("EXT-07 agendador sem ambiente configurado permanece desligado", () => {
  const config = parseSchedulerConfig({});
  assert.equal(config.intervalSeconds, null);
  assert.equal(config.actorIdentity, null);
});

test("EXT-07 agendador recusa intervalo inválido e aceita inteiro >= 1", () => {
  for (const invalid of ["", "0", "-5", "1.5", "abc", "  ", "NaN", "Infinity", null, undefined]) {
    const config = parseSchedulerConfig({ EXT07_EVALUATE_INTERVAL_SECONDS: String(invalid ?? "") });
    assert.equal(config.intervalSeconds, null, `intervalo inválido não pode ligar: ${invalid}`);
  }
  // Números válidos para Number() são aceitos (mesma semântica de LEAD_MAX_ATTEMPTS).
  assert.equal(parseSchedulerConfig({ EXT07_EVALUATE_INTERVAL_SECONDS: "1" }).intervalSeconds, 1);
  assert.equal(parseSchedulerConfig({ EXT07_EVALUATE_INTERVAL_SECONDS: "300" }).intervalSeconds, 300);
  assert.equal(parseSchedulerConfig({ EXT07_EVALUATE_INTERVAL_SECONDS: " 3600 " }).intervalSeconds, 3600);
  assert.equal(parseSchedulerConfig({ EXT07_EVALUATE_INTERVAL_SECONDS: "1e3" }).intervalSeconds, 1000);
});

test("EXT-07 agendador exige identidade UUID bem-formada declarada por ambiente", () => {
  assert.equal(parseSchedulerConfig({ EXT07_EVALUATE_IDENTITY: actorIdentity }).actorIdentity, actorIdentity);
  for (const invalid of ["", "não-uuid", "123", `${actorIdentity.toUpperCase()}x`]) {
    assert.equal(parseSchedulerConfig({ EXT07_EVALUATE_IDENTITY: invalid }).actorIdentity, null, invalid);
  }
});

// ---------------------------------------------------------------------------
// Migração 156: ledger aditivo, append-only, sem seed e sem UPDATE retroativo.
// ---------------------------------------------------------------------------

test("EXT-07 migração 156 cria ledger de execuções agendadas sem tocar 001–155", async () => {
  const migration = await readRepo("db/migrations/156-ext07-scheduled-evaluation.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS ext_compliance_evaluation_runs/);
  assert.match(migration, /CHECK \(status IN \('concluida','falha'\)\)/);
  assert.match(migration, /CHECK \(origem = 'agendada'\)/);
  assert.match(migration, /char_length\(idempotency_key\) BETWEEN 8 AND 200/);
  assert.match(migration, /compliance evaluation run is immutable/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON ext_compliance_evaluation_runs/);
  assert.match(migration, /actor_identity UUID REFERENCES auth_identities\(id\) ON DELETE RESTRICT/);
  // Aditiva: nenhum seed, nenhuma reescrita retroativa de dados existentes.
  assert.doesNotMatch(migration, /INSERT INTO ext_compliance_(documents|obligations|tasks|events)/);
  assert.doesNotMatch(migration, /UPDATE ext_compliance_(documents|obligations|tasks|events)\s/);
  assert.doesNotMatch(migration, /ALTER TABLE ext_compliance_(documents|obligations|tasks|events)/);
});

test("Migrações 156–168 preservadas e 168 registrada nos pontos do manifesto", async () => {
  const migrator = await readRepo("scripts/migrate-site-visual.mjs");
  assert.match(migrator, /'156-ext07-scheduled-evaluation\.sql'/);
  assert.match(migrator, /'157-f03-employee-request-rh-return\.sql'/);
  assert.match(migrator, /'158-f03-client-ticket-acceptance\.sql'/);
  assert.match(migrator, /'159-f03-receivable-settlement-report\.sql'/);
  assert.match(migrator, /'160-ext08-knowledge-canonical-journey\.sql'/);
  assert.match(migrator, /'161-ext09-expansion-canonical-journey\.sql'/);
  assert.match(migrator, /'162-ext10-continuity-canonical-journey\.sql'/);
  assert.match(migrator, /'163-ext11-analytics-canonical-journey\.sql'/);
  assert.match(migrator, /'164-ext12-visual-editor-canonical-journey\.sql'/);
  assert.match(migrator, /'165-ext13-reports-canonical-journey\.sql'/);
  assert.match(migrator, /'166-ext14-intel-canonical-journey\.sql'/);
  assert.match(migrator, /'167-ext15-emergency-canonical-journey\.sql'/);
  assert.match(migrator, /'168-ext07-compliance-action-plans\.sql'/);
  assert.match(migrator, /files\.length !== 169/);
  assert.match(migrator, /001–169/);
  const wave0 = await readRepo("scripts/qa-wave0-static.mjs");
  assert.match(wave0, /const latestMigration = 169;/);
});

// ---------------------------------------------------------------------------
// Fake client/pool: semântica SQL do tick sem banco real.
// ---------------------------------------------------------------------------

function fakeClient({
  activeStaff = true,
  lockAcquired = true,
  expiredDocuments = [],
  auditFails = false,
  eventConflict = false,
  workFails = false,
} = {}) {
  const statements = [];
  const runInserts = [];
  let eventInserts = 0;
  const client = {
    async query(rawSql, params = []) {
      const sql = String(rawSql).replace(/\s+/g, " ");
      statements.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ acquired: lockAcquired }] };
      if (sql.includes("FROM auth_identities")) return { rows: activeStaff ? [{ id: params[0] }] : [] };
      if (sql.includes("SELECT CURRENT_DATE::text")) return { rows: [{ today }] };
      if (sql.includes("FOR UPDATE OF d")) {
        if (workFails) throw new Error("falha sintética na seleção de vencidos");
        return { rows: expiredDocuments.map((d) => ({ ...d })) };
      }
      if (sql.includes("INSERT INTO ext_compliance_tasks")) return { rows: [{ id: "tarefa-sintetica" }] };
      if (sql.includes("UPDATE ext_compliance_documents SET status='a_vencer'")) return { rows: [], rowCount: 0 };
      if (sql.includes("UPDATE ext_compliance_documents")) return { rows: [], rowCount: 1 };
      if (sql.includes("UPDATE ext_compliance_obligations")) return { rows: [], rowCount: 1 };
      if (sql.includes("FROM ext_compliance_documents WHERE obligation_id=$1")) return { rows: [] };
      if (sql.includes("INSERT INTO ext_compliance_events")) {
        eventInserts += 1;
        return { rows: [], rowCount: eventConflict ? 0 : 1 };
      }
      if (sql.includes("INSERT INTO audit_log")) {
        if (auditFails) throw new Error("audit offline");
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO ext_compliance_evaluation_runs")) {
        runInserts.push({ params });
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      statements.push({ sql: "RELEASE", params: [] });
    },
  };
  return { statements, runInserts, client, pool: { connect: async () => client } };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("EXT-07 tick completo: lock, identidade, núcleo, evento do dia, auditoria e run concluida", async () => {
  const fake = fakeClient({ expiredDocuments: [] });
  const result = await runScheduledEvaluationOnce({ pool: fake.pool, actorIdentity, intervalSeconds: 300 });
  assert.equal(result.outcome, "concluida");
  assert.equal(fake.runInserts.length, 1);
  const run = fake.runInserts[0];
  assert.equal(run.params[1], actorIdentity);
  assert.equal(run.params[2], 300);
  assert.equal(run.params[3], dayKey);
  const facts = JSON.parse(run.params[4]);
  assert.equal(facts.trigger, "agendada");
  assert.equal(facts.event_written, true);
  assert.equal(facts.documents_expired, 0);
  assert.equal(facts.absence_is_not_zero, undefined); // ausência é afirmação da resposta, não do fato
  // Evento do dia com chave determinística e fingerprint sha256.
  const event = fake.statements.find((s) => s.sql.includes("INSERT INTO ext_compliance_events"));
  assert.ok(event, "evento do dia deve ser gravado");
  assert.equal(event.params[1], dayKey);
  assert.match(event.params[2], /^[0-9a-f]{64}$/);
  const payload = JSON.parse(event.params[0]);
  assert.equal(payload.trigger, "agendada");
  assert.equal(payload.interval_seconds, 300);
  assert.equal(payload.source, "server_date");
  assert.ok(event.sql.includes("ON CONFLICT (created_by_identity, idempotency_key) DO NOTHING"));
  // Auditoria na mesma transação, antes do COMMIT.
  const positions = ["BEGIN", "INSERT INTO ext_compliance_events", "INSERT INTO audit_log", "INSERT INTO ext_compliance_evaluation_runs", "COMMIT"]
    .map((needle) => fake.statements.findIndex((s) => s.sql.includes(needle)));
  for (let i = 1; i < positions.length; i += 1) {
    assert.ok(positions[i] > positions[i - 1], `ordem esperada violada no índice ${i}`);
    assert.ok(positions[i] !== -1);
  }
  assert.ok(!fake.statements.some((s) => s.sql === "ROLLBACK"));
});

test("EXT-07 segundo tick no mesmo dia executa o trabalho e não duplica o evento", async () => {
  const fake = fakeClient({ expiredDocuments: [], eventConflict: true });
  const result = await runScheduledEvaluationOnce({ pool: fake.pool, actorIdentity, intervalSeconds: 60 });
  assert.equal(result.outcome, "concluida");
  assert.equal(fake.runInserts.length, 1);
  assert.equal(JSON.parse(fake.runInserts[0].params[4]).event_written, false, "conflito diário é ausência de novo evento, não erro");
  assert.equal(fake.statements.filter((s) => s.sql.includes("INSERT INTO ext_compliance_events")).length, 1);
});

test("EXT-07 identidade declarada inválida: falha fechada com run 'falha' e zero mutação", async () => {
  const fake = fakeClient({ activeStaff: false });
  const result = await runScheduledEvaluationOnce({ pool: fake.pool, actorIdentity, intervalSeconds: 300 });
  assert.equal(result.outcome, "falha");
  assert.equal(result.reason, "scheduler_identity_invalid");
  assert.equal(fake.runInserts.length, 1);
  const run = fake.runInserts[0];
  const sql = run ? "INSERT INTO ext_compliance_evaluation_runs" : "";
  const insertStatement = fake.statements.find((s) => s.sql.includes(sql));
  assert.match(String(insertStatement.sql), /'falha'/);
  const facts = JSON.parse(run.params[4]);
  assert.equal(facts.reason, "scheduler_identity_invalid");
  assert.ok(run.params[5].includes("staff admin/ti ativa"), "erro descreve a causa");
  // Nenhuma mutação de compliance e nenhum evento.
  assert.ok(!fake.statements.some((s) => s.sql.includes("INSERT INTO ext_compliance_tasks")));
  assert.ok(!fake.statements.some((s) => s.sql.includes("INSERT INTO ext_compliance_events")));
  assert.ok(!fake.statements.some((s) => s.sql.includes("UPDATE ext_compliance_documents")));
});

test("EXT-07 lock concorrente: tick é pulado sem gravar run", async () => {
  const fake = fakeClient({ lockAcquired: false });
  const result = await runScheduledEvaluationOnce({ pool: fake.pool, actorIdentity, intervalSeconds: 300 });
  assert.equal(result.outcome, "pulado");
  assert.equal(result.reason, "concurrent_tick");
  assert.equal(fake.runInserts.length, 0);
  assert.ok(fake.statements.some((s) => s.sql === "ROLLBACK"));
});

test("EXT-07 falha de auditoria reverte a execução e grava run 'falha'", async () => {
  const fake = fakeClient({ auditFails: true });
  const result = await runScheduledEvaluationOnce({ pool: fake.pool, actorIdentity, intervalSeconds: 300 });
  assert.equal(result.outcome, "falha");
  assert.equal(result.reason, "audit_unavailable");
  assert.equal(fake.runInserts.length, 1);
  assert.equal(JSON.parse(fake.runInserts[0].params[4]).reason, "audit_unavailable");
  assert.ok(fake.statements.some((s) => s.sql === "ROLLBACK"));
});

test("EXT-07 falha do núcleo reverte e grava run 'falha' com reason evaluation_failed", async () => {
  const fake = fakeClient({ workFails: true });
  const result = await runScheduledEvaluationOnce({ pool: fake.pool, actorIdentity, intervalSeconds: 300 });
  assert.equal(result.outcome, "falha");
  assert.equal(result.reason, "evaluation_failed");
  assert.equal(fake.runInserts.length, 1);
  const errorText = fake.runInserts[0].params[5];
  assert.ok(errorText.length <= 500, "erro é truncado em 500 caracteres");
});

test("EXT-07 ator malformado em chamada direta falha fechado sem tocar o banco", async () => {
  const fake = fakeClient();
  const result = await runScheduledEvaluationOnce({ pool: fake.pool, actorIdentity: "não-uuid", intervalSeconds: 300 });
  assert.equal(result.outcome, "falha");
  assert.equal(result.reason, "scheduler_identity_malformed");
  assert.equal(fake.statements.length, 0);
});

test("EXT-07 falha ao registrar a run falha não lança e deixa a evidência no log", async () => {
  const logs = [];
  const logger = { log: () => {}, error: (message) => logs.push(String(message)) };
  const fake = fakeClient({ workFails: true });
  // O INSERT da run falha também (por exemplo, banco caindo entre rollback e registro).
  const originalQuery = fake.client.query.bind(fake.client);
  fake.client.query = async (sql, params) => {
    if (String(sql).includes("INSERT INTO ext_compliance_evaluation_runs")) {
      throw new Error("ledger indisponível");
    }
    return originalQuery(sql, params);
  };
  const result = await runScheduledEvaluationOnce({ pool: fake.pool, actorIdentity, intervalSeconds: 300, logger });
  assert.equal(result.outcome, "falha");
  assert.ok(logs.some((line) => line.includes("falha ao registrar execução falha")), "log registra a falha do registro");
});

// ---------------------------------------------------------------------------
// Timer in-process: primeiro tick imediato, sobreposição, parada e estado.
// ---------------------------------------------------------------------------

function fakeTimer() {
  const timers = [];
  const setIntervalFn = (callback, ms) => {
    const timer = { unrefCalled: false, callback, ms, unref() { this.unrefCalled = true; } };
    timers.push(timer);
    return timer;
  };
  const cleared = [];
  const clearIntervalFn = (timer) => cleared.push(timer);
  return { timers, cleared, setIntervalFn, clearIntervalFn };
}

test("EXT-07 timer agenda no intervalo declarado, faz unref e roda o primeiro tick imediatamente", async () => {
  const fake = fakeClient();
  const { timers, cleared, setIntervalFn, clearIntervalFn } = fakeTimer();
  const handle = startExtComplianceScheduler({
    pool: fake.pool,
    intervalSeconds: 300,
    actorIdentity,
    logger: { log: () => {}, error: () => {} },
    setIntervalFn,
    clearIntervalFn,
  });
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 300000);
  assert.equal(timers[0].unrefCalled, true, "o timer não pode manter o processo vivo sozinho");
  await flush();
  assert.equal(fake.runInserts.length, 1, "primeiro tick imediato grava a run");
  const state = handle.state();
  assert.equal(state.enabled, true);
  assert.equal(state.intervalSeconds, 300);
  assert.equal(state.actorIdentity, actorIdentity);
  assert.equal(state.lastOutcome, "concluida");
  assert.ok(state.lastTickAt);
  handle.stop();
  assert.deepEqual(cleared, [timers[0]]);
});

test("EXT-07 tick sobreposto no processo é ignorado enquanto o anterior executa", async () => {
  let releaseGate;
  const gate = new Promise((resolve) => { releaseGate = resolve; });
  const fake = fakeClient();
  const originalQuery = fake.client.query.bind(fake.client);
  let stalled = false;
  fake.client.query = async (sql, params) => {
    const result = await originalQuery(sql, params);
    if (String(sql).includes("INSERT INTO ext_compliance_events") && !stalled) {
      stalled = true;
      await gate; // segura o primeiro tick no meio da execução
    }
    return result;
  };
  const { timers, setIntervalFn, clearIntervalFn } = fakeTimer();
  const handle = startExtComplianceScheduler({
    pool: fake.pool,
    intervalSeconds: 5,
    actorIdentity,
    logger: { log: () => {}, error: () => {} },
    setIntervalFn,
    clearIntervalFn,
  });
  await flush();
  assert.equal(handle.state().running, true, "primeiro tick em andamento");
  const dispatch = await handle.runOnce(); // dispara enquanto o primeiro está preso
  assert.equal(dispatch.value.outcome, "pulado");
  assert.equal(dispatch.value.reason, "tick_in_progress");
  releaseGate();
  await flush();
  await flush();
  assert.equal(handle.state().running, false);
  assert.equal(fake.runInserts.length, 1, "nenhuma execução duplicada");
  handle.stop();
});

test("EXT-07 start recusa argumentos inválidos (erro de programação, não de execução)", () => {
  assert.throws(() => startExtComplianceScheduler({ pool: {}, intervalSeconds: 0, actorIdentity }), /intervalSeconds/);
  assert.throws(() => startExtComplianceScheduler({ pool: {}, intervalSeconds: 10, actorIdentity: "x" }), /actorIdentity/);
});

// ---------------------------------------------------------------------------
// Guardas estáticas: ligação em server.mjs e núcleo compartilhado.
// ---------------------------------------------------------------------------

test("EXT-07 server.mjs liga o agendador somente depois da rede de segurança", async () => {
  const source = await readRepo("server.mjs");
  const posSafetyNet = source.indexOf("installProcessSafetyNet();");
  const posSchedulerStart = source.indexOf("extComplianceSchedulerHandle = startExtComplianceScheduler({");
  assert.ok(posSafetyNet !== -1, "installProcessSafetyNet deve ser chamado");
  assert.ok(posSchedulerStart !== -1, "o agendador deve ser ligado em server.mjs");
  assert.ok(posSafetyNet < posSchedulerStart, "a rede de segurança vem antes do agendador");
  assert.match(source, /import \{ parseSchedulerConfig, startExtComplianceScheduler \} from "\.\/src\/server\/ext-compliance-scheduler\.mjs";/);
  // A rota de observação recebe o estado deste processo.
  assert.match(source, /schedulerState: extComplianceSchedulerState/);
  // Modo PGlite beta (sem DATABASE_URL) não pode ligar o agendador.
  assert.match(source, /\[ext07-scheduler\] desativado: requer DATABASE_URL/);
});

test("EXT-07 agendador usa o MESMO núcleo da rota explícita e nunca relança para o timer", async () => {
  const schedulerSource = await readRepo("src/server/ext-compliance-scheduler.mjs");
  assert.match(schedulerSource, /import \{ isActiveStaffIdentity, runExpiryEvaluation \} from "\.\/ext-compliance-api\.mjs";/);
  assert.match(schedulerSource, /dispatchGuarded\(/, "o tick roda sob dispatchGuarded");
  assert.match(schedulerSource, /unref\?\.\(\)/, "o timer não segura o processo");
  const apiSource = await readRepo("src/server/ext-compliance-api.mjs");
  assert.match(apiSource, /export async function runExpiryEvaluation\(client, \{ actorIdentityId \}\)/);
  assert.match(apiSource, /mutate\(req, res, session, \(client\) => runExpiryEvaluation\(client, \{ actorIdentityId: session\.identityId \}\)\)/,
    "a rota HTTP explícita delega ao mesmo núcleo");
  assert.doesNotMatch(apiSource, /pendência documentada/, "a pendência foi entregue; a nota não pode continuar prometendo");
});

test("EXT-07 rota de observação GET /api/ext/compliance/schedule exige staff autorizada", async () => {
  const runs = [
    {
      id: "run-1", origem: "agendada", status: "concluida", evaluation_date: today,
      started_at: "2026-10-04T10:00:00.000Z", finished_at: "2026-10-04T10:00:01.000Z",
      interval_seconds: 300, idempotency_key: dayKey, facts: { trigger: "agendada" }, error: null,
      actor_identity: actorIdentity, actor_display_name: "QA Sintético",
    },
  ];
  const pool = {
    async query(sql) {
      if (String(sql).includes("FROM ext_compliance_evaluation_runs")) return { rows: runs };
      if (String(sql).includes("FROM auth_identities WHERE id=$1")) return { rows: [{ id: actorIdentity, display_name: "QA Sintético" }] };
      return { rows: [] };
    },
  };
  const capture = () => ({ status: 0, payload: null, writeHead(status) { this.status = status; }, end(body) { this.payload = JSON.parse(body); } });
  const request = { method: "GET", url: "/api/ext/compliance/schedule", headers: {} };
  const make = (session) =>
    createExtComplianceApi({
      pool,
      sameOrigin: () => true,
      requireSession: async () => session,
      schedulerState: () => ({ enabled: true, intervalSeconds: 300, actorIdentity, lastTickAt: new Date(), lastOutcome: "concluida" }),
    });

  const anon = capture();
  await make(null).handle(request, anon);
  assert.equal(anon.status, 401);

  const rh = capture();
  await make({ identityId: "44444444-4444-4444-8444-444444444444", role: "rh" }).handle({ ...request, headers: {} }, rh);
  assert.equal(rh.status, 403);

  const ti = capture();
  await make({ identityId: actorIdentity, role: "ti" }).handle(request, ti);
  assert.equal(ti.status, 200);
  assert.equal(ti.payload.enabled, true);
  assert.equal(ti.payload.interval_seconds, 300);
  assert.equal(ti.payload.actor.id, actorIdentity);
  assert.equal(ti.payload.actor.display_name, "QA Sintético");
  assert.equal(ti.payload.source, "ext_compliance_evaluation_runs");
  assert.equal(ti.payload.runs.length, 1);
  assert.equal(ti.payload.runs[0].status, "concluida");
  assert.match(ti.payload.activation, /EXT07_EVALUATE_INTERVAL_SECONDS/);
});

test("EXT-07 rota de observação sem agendador no processo declara enabled false e mantém o ledger", async () => {
  const pool = { async query(sql) { return String(sql).includes("ext_compliance_evaluation_runs") ? { rows: [] } : { rows: [] }; } };
  const capture = { status: 0, payload: null, writeHead(status) { this.status = status; }, end(body) { this.payload = JSON.parse(body); } };
  const api = createExtComplianceApi({ pool, sameOrigin: () => true, requireSession: async () => ({ identityId: actorIdentity, role: "admin" }) });
  await api.handle({ method: "GET", url: "/api/ext/compliance/schedule", headers: {} }, capture);
  assert.equal(capture.status, 200);
  assert.equal(capture.payload.enabled, false);
  assert.equal(capture.payload.interval_seconds, null);
  assert.deepEqual(capture.payload.runs, []);
});
