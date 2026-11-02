// E16 — teste focal do worker/scheduler DURÁVEL (fila de intenção persistida).
//
// Herético: nenhum banco real. O que é provado aqui é o QUE o SQL faz (forma da
// instrução, guardas de reivindicação, atômica da conclusão, matemática do
// backoff, recusa de configuração inválida e ordem boot→enqueue→executar). A
// prova de que o PostgreSQL decide a exclusão mútua e retoma um lease órfão por
// outro processo está no gate `npm run test:durable-scheduler:pg` (cluster
// descartável com initdb + kill real no meio do lease).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  backoffDelaySeconds,
  claimJob,
  completeJob,
  completeJobOrThrow,
  DURABLE_NON_RUN_REASONS,
  enqueue,
  failJob,
  hasDurableJobsSchema,
  parseDurableSchedulerConfig,
  runDueJobs,
} from "../src/server/durable-scheduler.mjs";
import {
  EXT07_EVALUATION_JOB_KEY,
  computeNextDueAt,
  evaluationSlotFor,
  parseSchedulerConfig,
  runScheduledEvaluationOnce,
  startExt07DurableWorker,
} from "../src/server/ext-compliance-scheduler.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readRepo = (p) => readFile(path.join(root, p), "utf8");

const actorIdentity = "22222222-2222-4222-8222-222222222222";
const TOKEN = "11111111-1111-4111-8111-111111111111";

/** Fila sintética: cada query responde pela forma; `statements` é a prova. */
function fakeDb({ rows = {}, failOnce = null } = {}) {
  const statements = [];
  const db = {
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, " ").trim();
      statements.push({ sql: text, params });
      if (failOnce && failOnce(text)) throw new Error("banco sintético indisponível");
      // Casa por PREFIXO normalizado: `INSERT INTO durable_jobs` e
      // `UPDATE durable_jobs SET status = 'executando'` são instruções
      // diferentes e não podem compartilhar uma resposta.
      for (const [match, value] of Object.entries(rows)) {
        if (text.startsWith(match)) {
          return typeof value === "function" ? value(text, params) : { rows: value, rowCount: value.length };
        }
      }
      return { rows: [], rowCount: 0 };
    },
  };
  return { db, statements };
}

const settle = () => new Promise((resolve) => setImmediate(() => setImmediate(resolve)));

// ---------------------------------------------------------------------------
// Configuração por ambiente: o modo durável é opt-in; lixo não liga nada.
// ---------------------------------------------------------------------------

test("E16 modo padrão do agendador continua in-process; 'durable' é opt-in", () => {
  assert.deepEqual(
    { mode: parseDurableSchedulerConfig({}).mode, enabled: parseDurableSchedulerConfig({}).durableEnabled },
    { mode: "in-process", enabled: false },
  );
  for (const invalid of ["", "DURABLEX", "cron", "queue", "0", "true"]) {
    assert.equal(parseDurableSchedulerConfig({ EXT07_SCHEDULER_MODE: invalid }).mode, "in-process", `não pode ligar: ${invalid}`);
  }
  assert.equal(parseDurableSchedulerConfig({ EXT07_SCHEDULER_MODE: "DURABLE" }).mode, "durable", "maiúscula é normalizada");
  assert.equal(parseDurableSchedulerConfig({ EXT07_SCHEDULER_MODE: " durable " }).mode, "durable", "espaço ao redor é tolerado");
  assert.equal(parseDurableSchedulerConfig({ EXT07_SCHEDULER_MODE: " durable " }).durableEnabled, true);
});

test("E16 parâmetros da fila: valor inválido cai no padrão declarado", () => {
  const defaults = parseDurableSchedulerConfig({ EXT07_SCHEDULER_MODE: "durable" });
  assert.equal(defaults.leaseSeconds, 120);
  assert.equal(defaults.backoffSeconds, 60);
  assert.equal(defaults.backoffMaxSeconds, 3600);
  assert.equal(defaults.batchSize, 5);
  for (const invalid of ["", "abc", "0", "-1", "1.5", "1e99", "Infinity"]) {
    const config = parseDurableSchedulerConfig({ EXT07_SCHEDULER_MODE: "durable", EXT07_SCHEDULER_LEASE_SECONDS: invalid });
    assert.equal(config.leaseSeconds, 120, `valor inválido não pode valer nada: ${invalid}`);
  }
  assert.equal(parseDurableSchedulerConfig({ EXT07_SCHEDULER_LEASE_SECONDS: "5" }).leaseSeconds, 5);
  assert.equal(parseDurableSchedulerConfig({ EXT07_SCHEDULER_BATCH_SIZE: "999" }).batchSize, 5, "fora do teto cai no padrão");
});

test("E16 backoff mais curto que o lease é recusa explícita, não comportamento estranho", () => {
  const bad = parseDurableSchedulerConfig({
    EXT07_SCHEDULER_MODE: "durable",
    EXT07_SCHEDULER_LEASE_SECONDS: "3600",
    EXT07_SCHEDULER_BACKOFF_MAX_SECONDS: "1",
  });
  assert.equal(bad.configError, "backoff_menor_que_lease");
  assert.equal(parseDurableSchedulerConfig({ EXT07_SCHEDULER_MODE: "durable", EXT07_SCHEDULER_LEASE_SECONDS: "300" }).configError, null);
  assert.equal(parseDurableSchedulerConfig({ EXT07_SCHEDULER_MODE: "durable", EXT07_SCHEDULER_LEASE_SECONDS: "5", EXT07_SCHEDULER_BACKOFF_MAX_SECONDS: "5" }).configError, null,
    "lease == teto é o limite permitido");
});

test("E16 parseSchedulerConfig do EXT-07 expõe o modo escolhido para o boot", () => {
  const base = { EXT07_EVALUATE_INTERVAL_SECONDS: "3600", EXT07_EVALUATE_IDENTITY: actorIdentity };
  assert.equal(parseSchedulerConfig(base).mode, "in-process");
  assert.equal(parseSchedulerConfig(base).actorIdentity, actorIdentity);
  const durable = parseSchedulerConfig({ ...base, EXT07_SCHEDULER_MODE: "durable" });
  assert.equal(durable.mode, "durable");
  assert.equal(durable.durable.leaseSeconds, 120);
  assert.equal(parseSchedulerConfig({ ...base, EXT07_EVALUATE_INTERVAL_SECONDS: "0" }).intervalSeconds, null);
});

// ---------------------------------------------------------------------------
// Backoff e cadência: funções puras, relógio entra por parâmetro.
// ---------------------------------------------------------------------------

test("E16 backoff exponencial com teto e sem overflow de expoente", () => {
  assert.equal(backoffDelaySeconds({ failures: 1, baseSeconds: 60, maxSeconds: 3600 }).seconds, 60);
  assert.equal(backoffDelaySeconds({ failures: 2, baseSeconds: 60, maxSeconds: 3600 }).seconds, 120);
  assert.equal(backoffDelaySeconds({ failures: 4, baseSeconds: 60, maxSeconds: 3600 }).seconds, 480);
  const capped = backoffDelaySeconds({ failures: 12, baseSeconds: 60, maxSeconds: 3600 });
  assert.equal(capped.seconds, 3600);
  assert.equal(capped.capped, true);
  // expoente gigante não pode virar Infinity nem NaN
  const huge = backoffDelaySeconds({ failures: 5000, baseSeconds: 60, maxSeconds: 3600 });
  assert.equal(huge.seconds, 3600);
  assert.equal(Number.isFinite(huge.seconds), true);
  assert.equal(backoffDelaySeconds({}).seconds, 60, "sem argumentos usa os padrões");
  assert.equal(backoffDelaySeconds({ failures: 0 }).seconds, 60, "falha zero ainda espera um intervalo-base");
  assert.equal(backoffDelaySeconds({ failures: -3, baseSeconds: "x", maxSeconds: "y" }).seconds, 60);
});

test("E16 slot de idempotência é derivado do due_at (segundos truncados)", () => {
  const due = new Date("2026-10-04T10:00:59.999Z");
  assert.equal(evaluationSlotFor(due), "agendada:2026-10-04T10:00");
  assert.equal(evaluationSlotFor(due), evaluationSlotFor(new Date(due.getTime())), "mesmo intervalo, mesmo slot");
  assert.notEqual(evaluationSlotFor(new Date(due.getTime() + 60_000)), evaluationSlotFor(due), "intervalo seguinte tem slot novo");
  assert.throws(() => evaluationSlotFor("não-data"), /data inválida/);
});

test("E16 cadência persegue o passado no máximo um intervalo (catch-up honesto)", () => {
  const now = new Date("2026-10-04T10:00:00.000Z");
  const next = computeNextDueAt({ currentDueAt: new Date("2026-10-04T10:59:00.000Z"), intervalSeconds: 3600, now });
  assert.equal(next.toISOString(), "2026-10-04T11:59:00.000Z", "um tick atrasado continua a cadência a partir do due_at, não do 'agora'");
  const late = computeNextDueAt({ currentDueAt: new Date(now.getTime() - 10 * 3600_000), intervalSeconds: 3600, now });
  assert.equal(late.toISOString(), "2026-10-04T11:00:00.000Z", "dez horas parado não gera dez execuções de atraso");
  const invalid = computeNextDueAt({ currentDueAt: "x", intervalSeconds: 3600, now });
  assert.equal(invalid.toISOString(), "2026-10-04T11:00:00.000Z");
  assert.equal(computeNextDueAt({ currentDueAt: now, intervalSeconds: 0, now }).getTime(), now.getTime());
});

// ---------------------------------------------------------------------------
// enqueue: a intenção existe antes de qualquer efeito.
// ---------------------------------------------------------------------------

test("E16 enqueue grava job_key único com due_at e payload mínimo", async () => {
  const { db, statements } = fakeDb({ rows: { "INSERT INTO durable_jobs": [{ id: "job-1", inserted: true }] } });
  const due = new Date("2026-10-04T10:00:00.000Z");
  const result = await enqueue(db, {
    jobKey: EXT07_EVALUATION_JOB_KEY, jobType: "ext07_expiry_evaluation", slot: "agendada:2026-10-04T10:00",
    dueAt: due, payload: { interval_seconds: 3600 },
  });
  assert.deepEqual(result, { status: "inserido", id: "job-1" });
  const insert = statements[0].sql;
  assert.match(insert, /INSERT INTO durable_jobs/);
  assert.match(insert, /ON CONFLICT \(job_key\) DO UPDATE/, "reenfileirar tem que ser upsert, não INSERT cru");
  assert.match(insert, /WHERE \$9 OR durable_jobs\.status <> 'executando'/, "não pode roubar uma execução em andamento");
  assert.equal(statements[0].params[0], EXT07_EVALUATION_JOB_KEY);
  assert.equal(statements[0].params[3], due);
  assert.deepEqual(JSON.parse(statements[0].params[4]), { interval_seconds: 3600 });
  assert.equal(statements[0].params[7], false, "refresh padrão = off");
  assert.equal(statements[0].params[8], false, "force padrão = off");
});

test("E16 enqueue rejeita configuração malformada antes de tocar o banco", async () => {
  const { db, statements } = fakeDb();
  for (const bad of [
    { jobType: "x", slot: "abc" },
    { jobKey: "ab", jobType: "x", slot: "abc" },
    { jobKey: "ok", jobType: "x".repeat(101), slot: "abc" },
    { jobKey: "ok", jobType: "x", slot: "ab" },
    { jobKey: "ok", jobType: "x", slot: "abc", dueAt: "ontem" },
  ]) {
    await assert.rejects(() => enqueue(db, bad), TypeError);
  }
  assert.equal(statements.length, 0, "validação de chamada não pode gerar SQL");
});

test("E16 force reabre o slot e limpa o histórico; refresh só atualiza o que não começou", async () => {
  const forced = fakeDb({ rows: { "INSERT INTO durable_jobs": [{ id: "job-1", inserted: false }] } });
  await enqueue(forced.db, { jobKey: "job", jobType: "t", slot: "slot-2", force: true, refresh: true });
  const sql = forced.statements[0].sql;
  assert.match(sql, /last_completed_slot\s*= CASE WHEN \$9 THEN NULL/);
  assert.match(sql, /status\s*= CASE WHEN \$9 THEN 'aguardando'/);
  assert.equal(forced.statements[0].params[8], true);
  const refreshed = fakeDb({ rows: { "INSERT INTO durable_jobs": [{ id: "job-1", inserted: false }] } });
  await enqueue(refreshed.db, { jobKey: "job", jobType: "t", slot: "slot-1", refresh: true });
  assert.equal(refreshed.statements[0].params[7], true);
  assert.equal(refreshed.statements[0].params[8], false);
  assert.equal(refreshed.statements[0].sql.includes("last_completed_slot"), true);
  // O boot NÃO pode rearmar o relógio: `due_at` e `slot` só mudam com `force`.
  // Medido no gate E16: com `due_at = CASE WHEN $8 ...` (refresh), dois boots
  // dentro do mesmo intervalo davam duas execuções — "um intervalo, uma
  // execução" deixava de ser verdade.
  assert.match(refreshed.statements[0].sql, /due_at\s*= CASE WHEN \$9 THEN EXCLUDED\.due_at/, "rearmar o tempo é decisão do force, não do boot");
  assert.match(refreshed.statements[0].sql, /slot\s*= CASE WHEN \$9 THEN EXCLUDED\.slot/);
  assert.match(refreshed.statements[0].sql, /payload\s*= CASE WHEN \$8 THEN EXCLUDED\.payload/, "payload (metadado) pode ser atualizado pelo boot");
});

// ---------------------------------------------------------------------------
// claim: uma instrução, lease, fencing token e guardas de não-repetição.
// ---------------------------------------------------------------------------

test("E16 claim decide no banco: SKIP LOCKED, lease, token e slot já concluído fora", async () => {
  const { db, statements } = fakeDb({
    rows: { "UPDATE durable_jobs SET status = 'executando'": [{ id: "j1", claim_token: TOKEN, slot: "agendada:2026-10-04T10:00", consecutive_failures: 0 }] },
  });
  const claimed = await claimJob(db, { jobKey: "job", claimant: TOKEN, leaseSeconds: 90, batchSize: 3 });
  const sql = statements[0].sql;
  assert.match(sql, /^UPDATE durable_jobs/, "reivindicar é um UPDATE único (autocommit = intenção durável antes do efeito)");
  assert.match(sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(sql, /last_completed_slot IS DISTINCT FROM slot/, "slot concluído não pode ser reivindicado de novo");
  assert.match(sql, /\(status = 'executando' AND lease_until < NOW\(\)\)/, "dono com lease vencido é retomado");
  assert.match(sql, /status IN \('aguardando', 'falha'\) AND due_at <= NOW\(\)/, "o relógio canônico é o do banco");
  assert.match(sql, /claim_token = \$4::uuid/);
  assert.match(sql, /attempts = attempts \+ 1/);
  assert.deepEqual(claimed[0].token, TOKEN);
  assert.equal(statements[0].params[1], 3);
  assert.equal(statements[0].params[2], 90);
  assert.equal(statements[0].params[3], TOKEN);
  assert.match(statements[0].sql, /make_interval\(secs => \$3::int\)/);
});

test("E16 claim sem trabalho devolve lista vazia e exige job_key", async () => {
  const { db } = fakeDb();
  assert.deepEqual(await claimJob(db, { jobKey: "job" }), []);
  await assert.rejects(() => claimJob(db, {}), TypeError);
});

test("E16 claim gera fencing token quando o chamador não traz um", async () => {
  const { db, statements } = fakeDb();
  await claimJob(db, { jobKey: "job" });
  assert.match(String(statements[0].params[3]), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

// ---------------------------------------------------------------------------
// complete/fail: as duas metades da prova de retomada.
// ---------------------------------------------------------------------------

test("E16 complete só vale para o dono atual e já arma o próximo intervalo", async () => {
  const { db, statements } = fakeDb({ rows: { "UPDATE durable_jobs SET status = 'aguardando'": [{ id: "j1" }] } });
  const next = new Date("2026-10-04T11:00:00.000Z");
  const applied = await completeJob(db, { jobKey: "job", token: TOKEN, slot: "s1", nextSlot: "s2", nextDueAt: next });
  assert.deepEqual(applied, { applied: true });
  const sql = statements[0].sql;
  assert.match(sql, /last_completed_slot = \$3/);
  assert.match(sql, /slot = COALESCE\(\$4, \$3\)/, "sem próximo slot, o próprio intervalo concluído fica marcado");
  assert.match(sql, /due_at = COALESCE\(\$5::timestamptz, NOW\(\)\)/);
  assert.match(sql, /WHERE job_key = \$1\s*AND status = 'executando'\s*AND claim_token = \$2::uuid\s*AND lease_until > NOW\(\)\s*AND slot = \$3/);
  assert.equal(statements[0].params[4], next);
});

test("E16 complete de dono com lease vencido não marca nada (zero linhas)", async () => {
  const { db } = fakeDb();
  const applied = await completeJob(db, { jobKey: "job", token: TOKEN, slot: "s1" });
  assert.deepEqual(applied, { applied: false, reason: "claim_ou_lease_perdido" });
});

test("E16 completeJobOrThrow faz a transação do trabalho ROLAR BACK quando o lease caiu", async () => {
  const { db } = fakeDb();
  await assert.rejects(
    () => completeJobOrThrow(db, { jobKey: "job", token: TOKEN, slot: "s1" }),
    (error) => error.message === "durable_claim_lost" && error.retryable === true,
  );
  const ok = fakeDb({ rows: { "UPDATE durable_jobs SET status = 'aguardando'": [{ id: "j1" }] } });
  assert.deepEqual(await completeJobOrThrow(ok.db, { jobKey: "job", token: TOKEN, slot: "s1" }), { applied: true });
});

test("E16 fail grava 'falha' com backoff a partir do contador do banco", async () => {
  const { db, statements } = fakeDb({
    rows: { "UPDATE durable_jobs SET status = 'falha'": [{ id: "j1", consecutive_failures: 3, attempts: 4 }] },
  });
  const result = await failJob(db, { jobKey: "job", token: TOKEN, error: new Error("x".repeat(900)), failures: 2, backoffSeconds: 60, backoffMaxSeconds: 3600 });
  assert.equal(result.applied, true);
  assert.equal(result.retryInSeconds, 120, "2 falhas consecutivas → 60·2^(2-1)");
  assert.match(statements[0].sql, /status = 'falha'/);
  assert.match(statements[0].sql, /due_at = NOW\(\) \+ make_interval\(secs => \$4::int\)/, "o retry é adiado no próprio due_at");
  assert.equal(statements[0].params[2].length, 500, "last_error tem teto de 500 caracteres");
  assert.equal(statements[0].params[3], 120);
});

test("E16 falha permanente não vira loop: retry no teto e job visível na fila", async () => {
  const { db, statements } = fakeDb({ rows: { "UPDATE durable_jobs SET status = 'falha'": [{ id: "j1", consecutive_failures: 1, attempts: 1 }] } });
  const result = await failJob(db, {
    jobKey: "job", token: TOKEN, error: new Error("identidade suspensa"), retryable: false,
    backoffSeconds: 1, backoffMaxSeconds: 7200,
  });
  assert.equal(result.retryInSeconds, 7200);
  assert.equal(statements[0].params[3], 7200);
});

test("E16 falha de registrar a falha não derruba o worker", async () => {
  const { db } = fakeDb({ failOnce: (sql) => sql.startsWith("UPDATE durable_jobs SET status = 'falha'") });
  const result = await failJob(db, { jobKey: "job", token: TOKEN, error: new Error("boom") });
  assert.equal(result.applied, false);
  assert.equal(result.reason, "registro_indisponivel");
  assert.match(result.error, /banco sintético indisponível/);
});

// ---------------------------------------------------------------------------
// runDueJobs: o laço do worker.
// ---------------------------------------------------------------------------

test("E16 runDueJobs exige handle e não deixa rejeição do claim escapar", async () => {
  await assert.rejects(() => runDueJobs({ db: fakeDb().db, jobKey: "job" }), TypeError);
  const { db } = fakeDb({ failOnce: (sql) => sql.startsWith("UPDATE durable_jobs SET status = 'executando'") });
  const summary = await runDueJobs({ db, jobKey: "job", handle: async () => ({}), logger: { error() {}, log() {} } });
  assert.equal(summary.claimed, 0);
  assert.match(summary.error, /banco sintético indisponível/);
});

test("E16 runDueJobs conclui o intervalo quando o handler não é transacional", async () => {
  // A fila devolve `claim_token`; o mapper do claim o expõe como `token`.
  const claimed = { id: "j1", job_key: "job", slot: "s1", consecutive_failures: 0, claim_token: TOKEN };
  const { db, statements } = fakeDb({
    rows: { "UPDATE durable_jobs SET status = 'executando'": [claimed], "UPDATE durable_jobs SET status = 'aguardando'": [{ id: "j1" }] },
  });
  const seen = [];
  const summary = await runDueJobs({
    db, jobKey: "job",
    handle: async (job) => { seen.push(job); return { ok: 1 }; },
    nextInterval: async () => ({ slot: "s2", dueAt: new Date("2026-10-04T11:00:00.000Z") }),
    logger: { error() {}, log() {} },
  });
  assert.equal(summary.claimed, 1);
  assert.equal(summary.results[0].status, "concluida");
  assert.equal(seen[0].slot, "s1");
  assert.equal(seen[0].token, TOKEN, "o handler recebe o job reivindicado, com o token do lease");
  const complete = statements.find((s) => s.sql.startsWith("UPDATE durable_jobs SET status = 'aguardando'"));
  assert.ok(complete, "a conclusão do intervalo tem de sair");
  assert.equal(complete.params[3], "s2");
  assert.deepEqual(complete.params[4], new Date("2026-10-04T11:00:00.000Z"));
});

test("E16 runDueJobs não conclui duas vezes quando o handler já é transacional", async () => {
  // A fila devolve `claim_token`; o mapper do claim o expõe como `token`.
  const claimed = { id: "j1", job_key: "job", slot: "s1", consecutive_failures: 0, claim_token: TOKEN };
  const { db, statements } = fakeDb({
    rows: { "UPDATE durable_jobs SET status = 'executando'": [claimed], "UPDATE durable_jobs SET status = 'aguardando'": [{ id: "j1" }] },
  });
  await runDueJobs({ db, jobKey: "job", handle: async () => ({ completed: true }), logger: { error() {}, log() {} } });
  assert.equal(statements.filter((s) => s.sql.startsWith("UPDATE durable_jobs SET status = 'aguardando'")).length, 0);
});

test("E16 runDueJobs registra falha com backoff e continua vivo", async () => {
  // A fila devolve `claim_token`; o mapper do claim o expõe como `token`.
  const claimed = { id: "j1", job_key: "job", slot: "s1", consecutive_failures: 0, claim_token: TOKEN };
  const { db, statements } = fakeDb({
    rows: {
      "UPDATE durable_jobs SET status = 'executando'": [claimed],
      "UPDATE durable_jobs SET status = 'falha'": [{ id: "j1", consecutive_failures: 1, attempts: 2 }],
    },
  });
  const logs = [];
  const summary = await runDueJobs({
    db, jobKey: "job",
    handle: async () => { throw new Error("núcleo quebrou"); },
    logger: { error: (m) => logs.push(m), log: () => {} },
    backoffSeconds: 30, backoffMaxSeconds: 3600,
  });
  assert.equal(summary.results[0].status, "falha");
  assert.equal(summary.results[0].retryInSeconds, 30, "1 falha → 1 × intervalo-base");
  assert.match(statements.find((s) => s.sql.startsWith("UPDATE durable_jobs SET status = 'falha'")).sql, /consecutive_failures \+ 1/);
  assert.match(logs.join("\n"), /nova tentativa em 30s/);
});

test("E16 falha permanente é marcada como tal e não se repete sem fim", async () => {
  // A fila devolve `claim_token`; o mapper do claim o expõe como `token`.
  const claimed = { id: "j1", job_key: "job", slot: "s1", consecutive_failures: 4, claim_token: TOKEN };
  const { db, statements } = fakeDb({
    rows: {
      "UPDATE durable_jobs SET status = 'executando'": [claimed],
      "UPDATE durable_jobs SET status = 'falha'": [{ id: "j1", consecutive_failures: 5, attempts: 6 }],
    },
  });
  const summary = await runDueJobs({
    db, jobKey: "job",
    handle: async () => { throw Object.assign(new Error("identidade suspensa"), { retryable: false }); },
    logger: { error() {}, log() {} },
    backoffSeconds: 1, backoffMaxSeconds: 30,
  });
  assert.equal(summary.results[0].permanent, true);
  assert.equal(summary.results[0].retryInSeconds, 30, "permanente: retry no teto, não no intervalo-base");
  assert.equal(statements.length, 2, "nenhum efeito é tentado depois da recusa");
});

test("E16 hasDurableJobsSchema: tabela ausente é false, erro é false (nunca 'talvez')", async () => {
  assert.equal(await hasDurableJobsSchema(fakeDb({ rows: { "SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'durable_jobs'": [{ "?column?": 1 }] } }).db), true);
  assert.equal(await hasDurableJobsSchema(fakeDb().db), false);
  assert.equal(await hasDurableJobsSchema({ async query() { throw new Error("sem banco"); } }), false);
});

// ---------------------------------------------------------------------------
// Núcleo EXT-07 com transação do chamador (é o que dá atomicidade).
// ---------------------------------------------------------------------------

/**
 * Banco sintético dos dois mundos: a fila (`durable_jobs`) e o núcleo EXT-07
 * (`ext_compliance_*`). `statements` é a prova da ORDEM das escritas — é o que
 * valora a atômica "efeito + conclusão do slot no mesmo COMMIT".
 */
function fakeTickDb({ identityActive = true, completeApplied = true, lockAcquired = true, claimRows = null } = {}) {
  const statements = [];
  const queue = claimRows === null ? [] : claimRows.map((row) => ({ ...row }));
  const client = {
    async query(rawSql, params = []) {
      const sql = String(rawSql).replace(/\s+/g, " ").trim();
      statements.push({ sql, params });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (sql.startsWith("SELECT 1 FROM pg_tables")) return { rows: [{ "?column?": 1 }], rowCount: 1 };
      if (sql.startsWith("INSERT INTO durable_jobs")) return { rows: [{ id: "j1", inserted: true }], rowCount: 1 };
      if (sql.startsWith("UPDATE durable_jobs SET status = 'executando'")) {
        return { rows: queue, rowCount: queue.length };
      }
      if (sql.startsWith("UPDATE durable_jobs SET status = 'aguardando'")) {
        return { rows: completeApplied ? [{ id: "j1" }] : [], rowCount: completeApplied ? 1 : 0 };
      }
      if (sql.startsWith("UPDATE durable_jobs SET status = 'falha'")) {
        return { rows: [{ id: "j1", consecutive_failures: 1, attempts: 2 }], rowCount: 1 };
      }
      if (sql.startsWith("SELECT job_key, job_type, status, slot, last_completed_slot")) {
        return { rows: [{ job_key: EXT07_EVALUATION_JOB_KEY, status: "aguardando", attempts: 1 }] };
      }
      if (sql.includes("pg_try_advisory_xact_lock")) return { rows: [{ acquired: lockAcquired }] };
      if (sql.includes("FROM auth_identities")) return { rows: identityActive ? [{ id: params[0] }] : [] };
      if (sql.includes("SELECT CURRENT_DATE::text")) return { rows: [{ today: "2026-10-04" }] };
      if (sql.includes("FOR UPDATE OF d")) return { rows: [] };
      if (sql.includes("INSERT INTO ext_compliance_events")) return { rows: [], rowCount: 1 };
      if (sql.includes("INSERT INTO audit_log")) return { rows: [], rowCount: 1 };
      if (sql.includes("INSERT INTO ext_compliance_evaluation_runs")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release() { statements.push({ sql: "RELEASE", params: [] }); },
  };
  return { statements, client, pool: { connect: async () => client, query: (sql, params) => client.query(sql, params) } };
}

const claimedRow = { id: "j1", job_key: EXT07_EVALUATION_JOB_KEY, slot: "agendada:2026-10-04T10:00", due_at: new Date("2026-10-04T10:00:00.000Z"), consecutive_failures: 0, claim_token: TOKEN };

test("E16 núcleo chamado com transação do chamador: nenhum BEGIN/COMMIT/ROLLBACK próprios", async () => {
  const { statements, client } = fakeTickDb();
  const result = await runScheduledEvaluationOnce({
    client, beginTransaction: false, actorIdentity, intervalSeconds: 3600, logger: { log() {}, error() {} },
  });
  assert.equal(result.outcome, "concluida");
  assert.equal(result.dayKey, "agendada:2026-10-04", "a chave do evento do dia não muda no modo durável");
  for (const control of ["BEGIN", "COMMIT", "ROLLBACK"]) {
    assert.equal(statements.filter((s) => s.sql === control).length, 0, `${control} é decisão de quem abriu a transação`);
  }
  assert.equal(statements.some((s) => s.sql.includes("INSERT INTO ext_compliance_evaluation_runs")), true);
});

test("E16 onBeforeCommit é a última escrita do efeito: conclusão do slot antes do COMMIT", async () => {
  const { statements, client } = fakeTickDb();
  let onBeforeCommitAt = -1;
  const result = await runScheduledEvaluationOnce({
    client,
    beginTransaction: false,
    actorIdentity,
    intervalSeconds: 3600,
    logger: { log() {}, error() {} },
    onBeforeCommit: async (inner) => {
      onBeforeCommitAt = statements.length;
      await completeJobOrThrow(inner, { jobKey: EXT07_EVALUATION_JOB_KEY, token: TOKEN, slot: "agendada:2026-10-04T10:00" });
    },
  });
  assert.equal(result.outcome, "concluida");
  const runInsert = statements.findIndex((s) => s.sql.includes("INSERT INTO ext_compliance_evaluation_runs"));
  const queueUpdate = statements.findIndex((s) => s.sql.startsWith("UPDATE durable_jobs SET status = 'aguardando'"));
  assert.ok(queueUpdate > runInsert, "a fila é a última escrita da transação");
  assert.equal(onBeforeCommitAt, queueUpdate, "a conclusão sai do onBeforeCommit, não de fora dele");
});

test("E16 worker: BEGIN, núcleo, conclusão do slot e COMMIT numa única transação", async () => {
  const fake = fakeTickDb({ claimRows: [claimedRow] });
  const worker = startExt07DurableWorker({
    pool: fake.pool, intervalSeconds: 3600, actorIdentity,
    durable: parseDurableSchedulerConfig({ EXT07_SCHEDULER_MODE: "durable" }),
    logger: { log() {}, error() {} },
    setIntervalFn: () => ({ unref() {} }),
    clearIntervalFn: () => {},
  });
  await settle();
  const order = fake.statements.map((s) => s.sql);
  const begin = order.indexOf("BEGIN");
  const commit = order.indexOf("COMMIT");
  const runInsert = order.findIndex((s) => s.includes("INSERT INTO ext_compliance_evaluation_runs"));
  const queueComplete = order.findIndex((s) => s.startsWith("UPDATE durable_jobs SET status = 'aguardando'"));
  const claim = order.findIndex((s) => s.startsWith("UPDATE durable_jobs SET status = 'executando'"));
  assert.ok(claim >= 0, "o worker reivindica");
  assert.ok(begin >= 0 && commit > begin, "uma transação por execução");
  assert.ok(claim < begin, "reivindicar é autocommit ANTES da transação do trabalho (intenção durável)");
  assert.ok(begin < runInsert && runInsert < queueComplete && queueComplete < commit,
    `ordem esperada BEGIN→run→fila→COMMIT: ${JSON.stringify(order.slice(0, 12))}`);
  assert.equal(worker.state().lastOutcome, "concluida");
  worker.stop();
});

test("E16 lease perdido no meio do trabalho: rollback, COMMIT zero antes do rollback", async () => {
  const fake = fakeTickDb({ completeApplied: false, claimRows: [claimedRow] });
  const worker = startExt07DurableWorker({
    pool: fake.pool, intervalSeconds: 3600, actorIdentity,
    durable: parseDurableSchedulerConfig({ EXT07_SCHEDULER_MODE: "durable" }),
    logger: { log() {}, error() {} },
    setIntervalFn: () => ({ unref() {} }),
    clearIntervalFn: () => {},
  });
  await settle();
  const order = fake.statements.map((entry) => entry.sql);
  const rollbackAt = order.indexOf("ROLLBACK");
  const firstCommit = order.indexOf("COMMIT");
  const queueComplete = order.findIndex((sql) => sql.startsWith("UPDATE durable_jobs SET status = 'aguardando'"));
  assert.ok(rollbackAt >= 0, "a transação do trabalho é desfeita pelo worker");
  assert.equal(firstCommit, -1, "nenhum COMMIT em toda a execução: sem dono do lease não se publica efeito");
  assert.ok(queueComplete >= 0 && queueComplete < rollbackAt, "a conclusão do slot estava DENTRO da transação desfeita");
  assert.equal(order.filter((sql) => sql.includes("INSERT INTO ext_compliance_evaluation_runs")).length, 1,
    "a linha 'concluida' estava na transação desfeita; e um dono que perdeu o lease NÃO grava 'falha' no ledger de auditoria");
  const failUpdate = fake.statements.find((entry) => entry.sql.startsWith("UPDATE durable_jobs SET status = 'falha'"));
  assert.ok(failUpdate, "a fila pode registrar a falha enquanto ninguém reivindicou de novo");
  assert.match(failUpdate.sql, /WHERE job_key = \$1\s*AND claim_token = \$2::uuid/,
    "e o registro é cercado pelo token: se outro processo já assumiu o slot, são zero linhas");
  assert.match(order.find((sql) => sql.startsWith("UPDATE durable_jobs SET status = 'aguardando'")), /AND claim_token = \$2::uuid\s*AND lease_until > NOW\(\)/,
    "a conclusão é cercada por token E lease vivo");
  assert.equal(worker.state().lastOutcome, "falha");
  worker.stop();
});

test("E16 identidade inválida no modo durável: rollback, slot NÃO concluído, retry no teto", async () => {
  const fake = fakeTickDb({ identityActive: false, claimRows: [claimedRow] });
  const worker = startExt07DurableWorker({
    pool: fake.pool, intervalSeconds: 3600, actorIdentity,
    durable: parseDurableSchedulerConfig({ EXT07_SCHEDULER_MODE: "durable" }),
    logger: { log() {}, error() {} },
    setIntervalFn: () => ({ unref() {} }),
    clearIntervalFn: () => {},
  });
  await settle();
  const order = fake.statements.map((entry) => entry.sql);
  assert.equal(order.findIndex((sql) => sql.startsWith("UPDATE durable_jobs SET status = 'aguardando'")), -1,
    "o slot não é marcado como concluído: ao reativar a identidade o intervalo é retomado");
  assert.ok(order.indexOf("ROLLBACK") >= 0 && order.indexOf("COMMIT") > order.indexOf("ROLLBACK"),
    "zero mutação de compliance; o único commit é o do registro de falha");
  assert.equal(order.filter((sql) => sql.includes("INSERT INTO ext_compliance_events")).length, 0);
  const failUpdate = fake.statements.find((entry) => entry.sql.startsWith("UPDATE durable_jobs SET status = 'falha'"));
  assert.ok(failUpdate, "a fila registra a falha");
  assert.equal(failUpdate.params[3], 3600, "permanente: retry no teto do backoff, não em loop");
  worker.stop();
});

test("E16 worker recusa argumentos inválidos (erro de programação, não de execução)", () => {
  const throws = (fn) => assert.throws(fn, TypeError);
  throws(() => startExt07DurableWorker({ pool: {}, intervalSeconds: 0, actorIdentity }));
  throws(() => startExt07DurableWorker({ pool: {}, intervalSeconds: 10, actorIdentity: "x" }));
  throws(() => startExt07DurableWorker({
    pool: {}, intervalSeconds: 10, actorIdentity,
    durable: { ...parseDurableSchedulerConfig({}), configError: "backoff_menor_que_lease" },
  }));
});

test("E16 worker sem a migração 182 recusa com motivo explícito (e não cai para o modo antigo)", async () => {
  const { db, statements } = fakeDb();
  const logs = [];
  let timers = 0;
  const worker = startExt07DurableWorker({
    pool: db, intervalSeconds: 3600, actorIdentity,
    durable: parseDurableSchedulerConfig({ EXT07_SCHEDULER_MODE: "durable" }),
    logger: { log: () => {}, error: (m) => logs.push(m) },
    setIntervalFn: () => { timers += 1; return { unref() {} }; },
    clearIntervalFn: () => { timers -= 1; },
  });
  await settle(); // o tick imediato do boot falha antes de qualquer reivindicação
  assert.equal(worker.state().schemaPresent, false);
  assert.equal(worker.state().lastError, "durable_jobs_schema_missing");
  assert.equal(statements.length, 1, "nenhum enqueue e nenhum claim: falha antes de tocar a fila");
  assert.match(statements[0].sql, /FROM pg_tables/);
  assert.match(logs.join("\n"), /durable_jobs_schema_missing: aplique a migração 182/);
  const result = await worker.runOnce();
  assert.equal(result.outcome, "failed_unreported", "a recusa é reportada pelo dispatchGuarded, nunca relançada ao timer (PLAT-01)");
  assert.match(result.error.message, /durable_jobs_schema_missing/);
  worker.stop();
  assert.equal(timers, 0);
});

test("E16 worker persiste a intenção ANTES de reivindicar qualquer coisa", async () => {
  const { db, statements } = fakeDb({
    rows: {
      "SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'durable_jobs'": [{ "?column?": 1 }],
      "INSERT INTO durable_jobs": [{ id: "j1", inserted: true }],
    },
  });
  const worker = startExt07DurableWorker({
    pool: db, intervalSeconds: 3600, actorIdentity,
    durable: parseDurableSchedulerConfig({ EXT07_SCHEDULER_MODE: "durable" }),
    logger: { log() {}, error() {} },
    setIntervalFn: () => ({ unref() {} }),
    clearIntervalFn: () => {},
  });
  await settle(); // boot: schema ok → enqueue → claim (nada reivindicado)
  const insertAt = statements.findIndex((s) => s.sql.startsWith("INSERT INTO durable_jobs"));
  const claimAt = statements.findIndex((s) => s.sql.startsWith("UPDATE durable_jobs SET status = 'executando'"));
  assert.ok(insertAt >= 0, "o boot precisa enfileirar");
  assert.ok(claimAt > insertAt, "reivindicar só depois de a intenção estar gravada");
  assert.equal(statements[insertAt].params[0], EXT07_EVALUATION_JOB_KEY);
  assert.equal(statements[insertAt].params[7], true, "boot usa refresh=true para atualizar o payload");
  assert.equal(statements[insertAt].params[8], false, "boot jamais usa force: rearmar o intervalo é ato do operador");
  assert.equal(worker.state().mode, "durable");
  assert.equal(worker.state().enqueuedAtBoot, true);
  worker.stop();
});

test("E16 facts do ledger 156 carregam o slot da fila quando executado pela fila", async () => {
  const { pool, statements } = fakeTickDb({
    claimRows: [{ ...claimedRow, slot: "agendada:2026-10-04T10:00" }],
  });
  const result = await runScheduledEvaluationOnce({
    pool, actorIdentity, intervalSeconds: 3600,
    logger: { log() {}, error() {} },
    durableSlot: "agendada:2026-10-04T10:00",
  });
  assert.equal(result.outcome, "concluida");
  const runInsert = statements.find((entry) => entry.sql.includes("INSERT INTO ext_compliance_evaluation_runs"));
  assert.ok(runInsert, "o ledger 156 precisa da linha da execução");
  const facts = JSON.parse(runInsert.params[4]);
  assert.equal(facts.durable_slot, "agendada:2026-10-04T10:00", "prova de \"um intervalo, uma execução\" no ledger");
  assert.equal(runInsert.params[3], "agendada:2026-10-04", "a chave de idempotência continua sendo a do DIA");
  const bare = fakeTickDb();
  const bareResult = await runScheduledEvaluationOnce({ pool: bare.pool, actorIdentity, logger: { log() {}, error() {} } });
  assert.equal(bareResult.outcome, "concluida");
  assert.equal(bareResult.facts?.durable_slot, undefined, "modo in-process não inventa slot de fila");
});

test("E16 motivos que não são execução não viram linha \'falha\' no ledger 156", async () => {
  assert.deepEqual(
    [...DURABLE_NON_RUN_REASONS].sort(),
    ["claim_ou_lease_perdido", "concurrent_tick", "tick_in_progress"],
    "a lista é a única fonte da regra \"quem não executou não grava linha\"",
  );
  const schedulerSource = await readRepo("src/server/ext-compliance-scheduler.mjs");
  assert.match(schedulerSource, /if \(!DURABLE_NON_RUN_REASONS\.includes\(error\?\.reason\)\)/,
    "o handler compara com a lista compartilhada, não com strings soltas");
  assert.doesNotMatch(schedulerSource, /error\?\.reason !== "concurrent_tick" && error\?\.reason !== "claim_ou_lease_perdido"/,
    "lista local duplicada é como a regra sai de sincronia");
});

test("E16 identidade inválida devolve mensagem legível para last_error da fila", async () => {
  const { pool, statements } = fakeTickDb({ identityActive: false, claimRows: [{ ...claimedRow }] });
  const worker = startExt07DurableWorker({
    pool, intervalSeconds: 3600, actorIdentity,
    durable: parseDurableSchedulerConfig({ EXT07_SCHEDULER_MODE: "durable" }),
    logger: { log() {}, error() {} },
    setIntervalFn: () => ({ unref() {} }),
    clearIntervalFn: () => {},
  });
  await settle(); // o primeiro tick do boot é imediato
  const failUpdate = statements.find((entry) => entry.sql.startsWith("UPDATE durable_jobs SET status = 'falha'"));
  assert.ok(failUpdate, "a fila precisa registrar a falha com backoff");
  assert.equal(failUpdate.params[2], "identidade declarada não é staff admin/ti ativa",
    "last_error guarda o PORQUÊ legível, não só o código interno");
  const runInsert = statements.find((entry) => entry.sql.includes("INSERT INTO ext_compliance_evaluation_runs"));
  assert.ok(runInsert, "a falha também aparece no ledger 156 (monitoramento igual nos dois modos)");
  const failFacts = JSON.parse(runInsert.params[4]);
  assert.equal(failFacts.reason, "scheduler_identity_invalid", "e o código fica nos facts do ledger");
  assert.equal(failFacts.durable_slot, claimedRow.slot, "a linha de falha diz qual intervalo da fila falhou");
  assert.equal(runInsert.params[5], "identidade declarada não é staff admin/ti ativa", "a coluna `error` do ledger 156 diz o porquê");
  worker.stop();
});

test("E16 worker tick sobreposto é ignorado e o timer é unref (não segura o processo)", async () => {
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  let calls = 0;
  const db = {
    async query(sql) {
      const text = String(sql);
      if (text.includes("FROM pg_tables")) return { rows: [{ x: 1 }] };
      if (text.includes("INSERT INTO durable_jobs")) return { rows: [{ id: "j1", inserted: true }] };
      if (text.includes("SET status = 'executando'")) {
        calls += 1;
        if (calls === 1) await firstGate;
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  let unrefed = 0;
  const worker = startExt07DurableWorker({
    pool: db, intervalSeconds: 3600, actorIdentity,
    durable: parseDurableSchedulerConfig({ EXT07_SCHEDULER_MODE: "durable" }),
    logger: { log() {}, error() {} },
    setIntervalFn: () => ({ unref() { unrefed += 1; } }),
    clearIntervalFn: () => {},
  });
  const running = worker.runOnce();
  const overlapped = await worker.runOnce();
  assert.equal(overlapped.value.outcome, "pulado");
  assert.equal(overlapped.value.reason, "tick_in_progress");
  releaseFirst();
  await running;
  assert.equal(unrefed, 1);
  worker.stop();
});

test("E16 queueState lê a fila para observação (e diz null sem o schema)", async () => {
  const withSchema = fakeDb({ rows: {
    "SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'durable_jobs'": [{ "?column?": 1 }],
    "SELECT job_key, job_type, status, slot, last_completed_slot, due_at, lease_until": [{ job_key: EXT07_EVALUATION_JOB_KEY, status: "aguardando", attempts: 2 }],
  } });
  const worker = startExt07DurableWorker({
    pool: withSchema.db, intervalSeconds: 3600, actorIdentity,
    durable: parseDurableSchedulerConfig({ EXT07_SCHEDULER_MODE: "durable" }),
    logger: { log() {}, error() {} },
    setIntervalFn: () => ({ unref() {} }),
    clearIntervalFn: () => {},
  });
  assert.equal((await worker.queueState()).attempts, 2);
  worker.stop();
  const without = fakeDb();
  const worker2 = startExt07DurableWorker({
    pool: without.db, intervalSeconds: 3600, actorIdentity,
    durable: parseDurableSchedulerConfig({ EXT07_SCHEDULER_MODE: "durable" }),
    logger: { log() {}, error() {} },
    setIntervalFn: () => ({ unref() {} }),
    clearIntervalFn: () => {},
  });
  assert.equal(await worker2.queueState(), null);
  worker2.stop();
});

// ---------------------------------------------------------------------------
// Guardas estáticas: forma do SQL, migração 182 e ligação do servidor.
// ---------------------------------------------------------------------------

test("E16 migração 182 cria o ledger da fila sem tocar 001–181", async () => {
  const migration = await readRepo("db/migrations/182-plat-durable-jobs-ledger.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS durable_jobs/);
  assert.match(migration, /job_key TEXT NOT NULL UNIQUE/);
  assert.match(migration, /CHECK \(status IN \('aguardando', 'executando', 'falha'\)\)/);
  assert.match(migration, /lease_until TIMESTAMPTZ/);
  assert.match(migration, /claim_token UUID/);
  assert.match(migration, /last_completed_slot TEXT/);
  assert.match(migration, /CHECK \(last_completed_slot IS NULL OR last_completed_slot IS DISTINCT FROM slot\)/);
  assert.match(migration, /CHECK \(max_backoff_seconds >= lease_seconds\)/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS durable_jobs_due_idx/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS durable_jobs_lease_idx/);
  assert.match(migration, /WHERE status IN \('aguardando', 'falha'\)/);
  // Medido no gate: predicado de índice parcial com função não-IMMUTABLE
  // (`NOW()`) faz a MIGRAÇÃO falhar no PostgreSQL — o `test:unit` não vê isso.
  const predicates = [...migration.matchAll(/CREATE INDEX[^;]*?WHERE[^;]*;/gs)].map((match) => match[0]);
  assert.ok(predicates.length >= 2, "os dois índices parciais precisam existir");
  for (const predicate of predicates) {
    assert.doesNotMatch(predicate, /NOW\(\)|CURRENT_DATE|CURRENT_TIMESTAMP/, "predicado de índice não pode chamar função STABLE");
  }
  assert.doesNotMatch(migration, /CREATE UNIQUE INDEX[^;]*last_completed_slot/, "job_key já é único: índice redundante não é prova");
  assert.match(migration, /char_length\(last_error\) <= 500/);
  // Aditiva: nada de 001–181 é reescrito e nenhum seed entra.
  assert.doesNotMatch(migration, /^(UPDATE|DELETE)\s/m, "comentário não é conta: só DML/DDL de primeira coluna");
  assert.doesNotMatch(migration, /^DROP TABLE/m, "DROP TRIGGER idempotente é permitido; drop de tabela, não");
  assert.doesNotMatch(migration, /INSERT INTO (?!durable_jobs)/);
  assert.doesNotMatch(migration, /ALTER TABLE (?!durable_jobs)/);
});

test("E16 o boot explica a regra CERTA quando a configuração da fila é inválida", async () => {
  const source = await readRepo("server.mjs");
  assert.match(source, /EXT07_SCHEDULER_BACKOFF_MAX_SECONDS >= EXT07_SCHEDULER_LEASE_SECONDS/,
    "a mensagem do boot tem de enunciar a guarda real (teto >= lease)");
  // A regra antiga (lease <= 60 × backoff máximo) misturava unidades e quase
  // nunca pegava ninguém: uma configuração que quebrava a semântica passava.
  assert.doesNotMatch(source, /60 × EXT07_SCHEDULER_BACKOFF_MAX_SECONDS/);
  const config = parseDurableSchedulerConfig({
    EXT07_SCHEDULER_MODE: "durable",
    EXT07_SCHEDULER_LEASE_SECONDS: "120",
    EXT07_SCHEDULER_BACKOFF_MAX_SECONDS: "60",
  });
  assert.equal(config.configError, "backoff_menor_que_lease");
});

test("E16 runbook e .env.example declaram o modo durável (documentação não pode derivar)", async () => {
  const env = await readRepo(".env.example");
  for (const key of [
    "EXT07_SCHEDULER_MODE",
    "EXT07_SCHEDULER_LEASE_SECONDS",
    "EXT07_SCHEDULER_BACKOFF_SECONDS",
    "EXT07_SCHEDULER_BACKOFF_MAX_SECONDS",
    "EXT07_SCHEDULER_BATCH_SIZE",
  ]) {
    assert.match(env, new RegExp(`^${key}=`, "m"), `chave ${key} ausente do .env.example`);
  }
  assert.match(env, /`in-process` \(padrão\)/, "o default precisa estar escrito junto da chave");
  assert.match(env, /EXT07_SCHEDULER_MODE=in-process/, "e o valor de exemplo tem de ser o default, não o modo novo");
  const runbook = await readRepo("docs/APLICACAO-BANCO-DESTINO.md");
  assert.match(runbook, /EXT07_SCHEDULER_MODE=durable/);
  assert.match(runbook, /durable_jobs_schema_missing/, "o operador precisa saber o que aparece no log quando falta a 182");
  assert.match(runbook, /last_completed_slot/, "rearmar manualmente sem entender o slot é como se duplica execução");
  // A limitação do meio de teste é parte da entrega: "gate PGlite verde" não é
  // prova de concorrência, e isso tem de estar escrito onde o leitor veria.
  assert.match(runbook, /PGlite[^.]*serializa|serializa as consultas na mesma sessão/, "limitação do PGlite declarada");
  assert.match(runbook, /test:durable-scheduler:pg/);
  // O motivo SUPERADO da recusa (schema ausente) não pode voltar: o PGlite da
  // demo tem as migrações desde o E7; a recusa é por DATABASE_URL.
  assert.doesNotMatch(runbook, /não possui o schema EXT-07/);
});

test("E16 o agendador usa o MESMO núcleo nos dois modos e nenhuma cron fake", async () => {
  const source = await readRepo("src/server/ext-compliance-scheduler.mjs");
  assert.match(source, /import \{ isActiveStaffIdentity, runExpiryEvaluation \} from "\.\/ext-compliance-api\.mjs";/,
    "o modo durável não reimplementa a avaliação: reivindica e chama o mesmo núcleo");
  assert.match(source, /EXT07_EVALUATION_JOB_KEY = "ext07:expiry-evaluation"/);
  assert.match(source, /onBeforeCommit\(client\)/, "a conclusão do slot tem de ser a última escrita antes do COMMIT");
  assert.match(source, /completeJobOrThrow\(innerClient/, "o dono do lease é conferido dentro da transação");
  assert.match(source, /nextSlot: evaluationSlotFor\(nextDueAt\),\s*nextDueAt,/, "próximo intervalo armado na MESMA instrução da conclusão");
  assert.match(source, /if \(!DURABLE_NON_RUN_REASONS\.includes\(error\?\.reason\)\)/,
    "execução que não aconteceu não grava linha no ledger 156 — pela lista única do módulo da fila");
  assert.match(source, /setIntervalFn\(guardedTick, intervalSeconds \* 1000\)/);
  assert.doesNotMatch(source, /node-cron|cronstrue|crontab|child_process/, "nada de cron fake nem subprocesso");
  assert.equal((source.match(/dispatchGuarded\(/g) || []).length, 2, "os dois modos rodam sob dispatchGuarded");
  assert.doesNotMatch(source, /unref\?\.\(\)\);\s*\n\s*guardedTick\(\);\s*\n\s*return \{\s*\n\s*stop\(\) \{\s*\n\s*clearIntervalFn\(timer\);\s*\n\s*\},\s*\n\s*runOnce: guardedTick,\s*\n\s*ensureEnqueued/,
    "o handle in-process não pode ganhar campos novos por engano");
});

test("E16 server.mjs escolhe o executor por ambiente e declara o motivo real da recusa do PGlite", async () => {
  const source = await readRepo("server.mjs");
  assert.match(source, /import \{ parseSchedulerConfig, startExt07DurableWorker, startExtComplianceScheduler \} from "\.\/src\/server\/ext-compliance-scheduler\.mjs";/);
  assert.match(source, /const durableMode = ext07SchedulerConfig\.mode === "durable";/);
  assert.match(source, /extComplianceSchedulerHandle = startExt07DurableWorker\(\{/);
  assert.match(source, /extComplianceSchedulerHandle = startExtComplianceScheduler\(\{/);
  // Deriva corrigida: o PGlite TEM o schema EXT-07 desde o E7; o que falta é o
  // executor. A mensagem não pode voltar a culpar o schema.
  assert.doesNotMatch(source, /não possui o schema EXT-07/);
  assert.match(source, /tem o schema EXT-07 desde o E7/);
  assert.match(source, /escritor único por diretório/);
  // A exigência de DATABASE_URL permanece (decisão do proprietário): nada de
  // ligar worker na demo por conveniência.
  assert.match(source, /\[ext07-scheduler\] desativado: requer DATABASE_URL/);
  assert.match(source, /durable_jobs_schema_missing|modo durable recusado/, "recusa do worker durável é logada, não engolida");
  const posSafetyNet = source.indexOf("installProcessSafetyNet();");
  const posDurable = source.indexOf("startExt07DurableWorker({");
  assert.ok(posSafetyNet < posDurable, "a rede de segurança vem antes de qualquer executor");
});

test("E16 observação da rota expõe modo e fila sem quebrar o contrato antigo", async () => {
  const source = await readRepo("src/server/ext-compliance-api.mjs");
  assert.match(source, /export const EXT07_EVALUATION_JOB_KEY = "ext07:expiry-evaluation";/);
  assert.match(source, /mode: state\?\.mode \?\? "in-process"/);
  assert.match(source, /queue_source: state\?\.mode === "durable" \? "durable_jobs" : null/);
  assert.match(source, /FROM durable_jobs WHERE job_key = \$1/);
  assert.match(source, /queue = null;/, "fila ausente é `null`, nunca 500 numa rota de leitura");
  // Os campos já prometidos a UI não podem sumir (preservação de contrato).
  for (const field of ["enabled:", "interval_seconds:", "actor,", "runs,", "source: \"ext_compliance_evaluation_runs\"", "activation:"]) {
    assert.ok(source.includes(field), `campo da rota perdido: ${field}`);
  }
});

test("E16 gate do worker durável está declarado no package.json", async () => {
  const pkg = JSON.parse(await readRepo("package.json"));
  assert.equal(pkg.scripts["test:durable-scheduler:pg"], "node scripts/qa-durable-scheduler-postgres.mjs");
  assert.match(pkg.scripts["test:unit"], /tests\/e16-durable-scheduler\.test\.mjs/, "a guarda precisa rodar no npm test");
});

test("E16 migração 182 entra no migrador PG, no wave0 e na demo PGlite", async () => {
  const migrator = await readRepo("scripts/migrate-site-visual.mjs");
  assert.match(migrator, /'182-plat-durable-jobs-ledger\.sql'/);
  assert.match(migrator, /files\.length !== 182/);
  assert.match(migrator, /001–182/);
  const wave0 = await readRepo("scripts/qa-wave0-static.mjs");
  assert.match(wave0, /const latestMigration = 182;/);
  const pool = await readRepo("src/server/pglite-pool.mjs");
  assert.match(pool, /readdirSync\(directory\)/, "a demo aplica 182 sem lista à mão (herança do E7)");
  assert.match(pool, /001–182/);
});
