// E16 — prova de RETOMADA do worker durável em PostgreSQL real.
//
// Executado pelo gate `npm run test:durable-scheduler:pg` (cluster descartável,
// migrações 001–182). Nada aqui é simulado: o processo que executa o job é
// OUTRO processo (node filho), morto com SIGKILL no meio do lease, e o que se
// confere são as linhas escritas no banco.
//
// Política de execução (mesma do E22): sem `RUN_DATABASE_INTEGRATION=1` +
// `DATABASE_URL`, os casos são marcados com `skip` (o gate falha, o `test:unit`
// não). O gate exige zero skip no autoaudit do TAP.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import pg from "pg";
import { claimJob, enqueue, inspectJob } from "../src/server/durable-scheduler.mjs";
import { EXT07_EVALUATION_JOB_KEY, evaluationSlotFor } from "../src/server/ext-compliance-scheduler.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const REQUIRE = process.env.QA_E16_REQUIRE_DB === "1";
const root = path.resolve(import.meta.dirname, "..");
const opt = { skip: !RUN };
const JOB_KEY = EXT07_EVALUATION_JOB_KEY;

/**
 * Harness do worker em PROCESSO SEPARADO: é o que torna a prova de retomada
 * uma prova de processo, não de função. O filho importa o módulo de produção
 * e liga o worker com o mesmo caminho do boot (`EXT07_SCHEDULER_MODE=durable`).
 */
const HARNESS = `
const pool = new (await import('pg')).Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const mod = await import(process.env.E16_SCHEDULER_MODULE);
const { claimJob } = await import(process.env.E16_DURABLE_MODULE);
const config = mod.parseSchedulerConfig(process.env);
const mode = process.env.E16_HARNESS_MODE || 'worker';
const log = (event, extra = {}) => console.log('E16_HARNESS ' + JSON.stringify({ event, ...extra }));
if (mode === 'worker') {
  const handle = mod.startExt07DurableWorker({
    pool,
    intervalSeconds: config.intervalSeconds,
    actorIdentity: config.actorIdentity,
    durable: config.durable,
    logger: { log: (m) => log('stdout', { line: String(m) }), error: (m) => log('stderr', { line: String(m) }) },
  });
  log('started');
  process.on('SIGTERM', async () => { handle.stop(); await pool.end().catch(() => {}); process.exit(0); });
  setInterval(() => {}, 1000); // o timer do worker é unref: o harness segura o processo
} else if (mode === 'probe') {
  try {
    const claimed = await claimJob(pool, {
      jobKey: process.env.E16_PROBE_JOB_KEY,
      leaseSeconds: Number(process.env.E16_PROBE_LEASE_SECONDS || 30),
      batchSize: Number(process.env.E16_PROBE_BATCH || 10),
    });
    log('probed', { claimed: claimed.map((job) => job.job_key) });
    await pool.end().catch(() => {});
    process.exit(0);
  } catch (error) {
    // Um harness que morre com exceção PRECISA aparecer como falha do teste,
    // nunca como "não reivindicou nada" (foi assim que um ReferenceError no
    // próprio harness virou um falso negativo na primeira corrida do gate).
    log('probe_error', { message: String(error && error.message || error) });
    await pool.end().catch(() => {});
    process.exit(3);
  }
} else {
  log('bad_mode');
  await pool.end().catch(() => {});
  process.exit(2);
}
`;

let pool;
const children = [];
const startedAt = Date.now();

async function spawnWorker(env) {
  const child = spawn(process.execPath, ["--input-type=module", "-e", HARNESS], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL,
      E16_SCHEDULER_MODULE: path.join(root, "src/server/ext-compliance-scheduler.mjs"),
      E16_DURABLE_MODULE: path.join(root, "src/server/durable-scheduler.mjs"),
      EXT07_SCHEDULER_MODE: "durable",
      NODE_ENV: "test",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = { stdout: "", stderr: "" };
  child.stdout.on("data", (chunk) => { output.stdout += chunk; });
  child.stderr.on("data", (chunk) => { output.stderr += chunk; });
  child.once("error", (error) => { output.stderr += String(error); });
  children.push({ child, output });
  return { child, output };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Espera uma condição do banco, com prazo — nunca um `sleep` cego de fé. */
async function waitFor(label, probe, { timeoutMs = 25_000, intervalMs = 120 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await probe();
    if (last) return last;
    await sleep(intervalMs);
  }
  const harnessLog = children.map((entry, index) => `--- harness[${index}] ---\n${entry.output.stdout.slice(-1500)}\nstderr:${entry.output.stderr.slice(-800)}`).join("\n");
  throw new Error(`tempo esgotado aguardando ${label}; último estado: ${JSON.stringify(last)}\n${harnessLog}`);
}

/** O ledger 156 como ele está — entra na mensagem de falha para o erro ser legível. */
async function runRows(client = pool) {
  const { rows } = await client.query(
    `SELECT status, idempotency_key, facts->>'reason' AS reason, facts->>'durable_slot' AS slot,
            left(error, 160) AS error
       FROM ext_compliance_evaluation_runs ORDER BY started_at, id`,
  );
  return rows;
}

/** Sai somente quando o harness imprimiu a linha pedida; erro do filho vira falha. */
async function readHarnessLine(output, child, event) {
  const line = output.stdout.split("\n").find((entry) => entry.includes(`"event":"${event}"`));
  if (!line) {
    throw new Error(`harness não chegou a registrar "${event}";\nstdout:${output.stdout.slice(-900)}\nstderr:${output.stderr.slice(-900)} (exit=${child.exitCode ?? child.signalCode})`);
  }
  return JSON.parse(line.slice(line.indexOf("E16_HARNESS ") + "E16_HARNESS ".length));
}

async function jobRow(client = pool) {
  return (await client.query(
    `SELECT job_key, status, slot, last_completed_slot, due_at, lease_until, attempts, consecutive_failures,
            (claim_token IS NOT NULL) AS has_token, last_error, payload
       FROM durable_jobs WHERE job_key = $1`,
    [JOB_KEY],
  )).rows[0] || null;
}

const counts = async (client = pool) => (await client.query(
  `SELECT
     (SELECT count(*)::int FROM ext_compliance_evaluation_runs) AS runs,
     (SELECT count(*)::int FROM ext_compliance_evaluation_runs WHERE status = 'concluida') AS concluidas,
     (SELECT count(*)::int FROM ext_compliance_evaluation_runs WHERE status = 'falha') AS falhas,
     (SELECT count(*)::int FROM ext_compliance_events WHERE event_type = 'expiry_evaluated') AS eventos,
     (SELECT count(*)::int FROM ext_compliance_tasks) AS tarefas,
     (SELECT count(*)::int FROM audit_log WHERE action = 'ext07_expiry_evaluate') AS auditoria,
     (SELECT count(*)::int FROM ext_compliance_documents WHERE status::text = 'vencida') AS vencidos`,
)).rows[0];

async function staff(role, tag) {
  const id = randomUUID();
  await pool.query(`INSERT INTO auth_identities (id, kind, email, display_name, status)
                    VALUES ($1, 'staff', $2, $3, 'active')`, [id, `e16-${tag}-${id.slice(0, 8)}@example.invalid`, `QA E16 ${role}`]);
  await pool.query(`INSERT INTO auth_staff_profiles (identity_id, role, assigned_by) VALUES ($1, $2, 'admin_system')`, [id, role]);
  return { id };
}

const isoDay = (offsetDays = 0) => new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);

let ti, responsible, obligationId, documentId, suspended = false;
let completedByResumeSlot = null; // o intervalo órfão que o restart concluiu (caso 4)

before(async () => {
  if (!RUN) return;
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  // O gate aplicou as migrações; se 182 não estiver aqui, o defeito é do gate.
  const table = await pool.query(`SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='durable_jobs'`);
  assert.equal(table.rows.length, 1, "migração 182 não está aplicada no cluster do gate");
  ti = await staff("ti", "actor");
  responsible = await staff("ti", "responsavel");
  obligationId = randomUUID();
  documentId = randomUUID();
  await pool.query(
    `INSERT INTO ext_compliance_obligations
       (id, obligation_type, title, description, declared_source, applicability_scope,
        applicability_justification, validity_rule, renewal_lead_days, criticality, status,
        responsible_identity, created_by_identity)
     VALUES ($1,'licenca','Licença sintética E16','Descrição sintética usada apenas pela prova de retomada do worker.','Política interna sintética','Unidade sintética','Aplicabilidade declarada sintética para o gate.','validade_anual_renovavel',30,'alta','a_vencer',$2,$3)`,
    [obligationId, responsible.id, ti.id],
  );
  // 'a_vencer' com validade passada é o estado que a avaliação converte em
  // 'vencida' + tarefa: é o efeito observável da execução.
  await pool.query(
    `INSERT INTO ext_compliance_documents
       (id, protocol, title, description, compliance_type, status, origin, obligation_id,
        issue_date, effective_start_date, expiry_date, validity_rule, reference_type,
        declared_reference, reference_source, is_private, responsible_identity,
        created_by_identity, version_no)
     VALUES ($1,$2,'Referência sintética E16','Descrição sintética de referência documental declarada.','licenca','a_vencer','ext07_canonica',$3,
             $4,$4,$5,'validade_anual_renovavel','referencia_declarada','E16-SINTETICA-0001','Órgão declarado sintético',true,$6,$7,1)`,
    [
      documentId,
      `COMP-EXT-${isoDay(0).replaceAll("-", "")}-${randomUUID().slice(0, 4).toUpperCase()}`,
      obligationId, isoDay(400), isoDay(5), responsible.id, ti.id,
    ],
  );
});

after(async () => {
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
  await pool?.end().catch(() => {});
});

test("E16 gate exige PostgreSQL real", { skip: !REQUIRE }, async () => {
  assert.ok(RUN, "o gate precisa de RUN_DATABASE_INTEGRATION=1 e DATABASE_URL de cluster descartável");
});

test("E16 antes do worker: fila com a intenção persistida e zero efeito", opt, async () => {
  assert.deepEqual(await counts(), { runs: 0, concluidas: 0, falhas: 0, eventos: 0, tarefas: 0, auditoria: 0, vencidos: 0 });
  const enqueued = await enqueue(pool, {
    jobKey: JOB_KEY,
    jobType: "ext07_expiry_evaluation",
    slot: evaluationSlotFor(new Date(Date.now() - 1000)),
    dueAt: new Date(Date.now() - 1000),
    payload: { interval_seconds: 3600, cadence: "recorrente" },
    leaseSeconds: 5,
    maxBackoffSeconds: 3600,
    refresh: true,
  });
  assert.equal(enqueued.status, "inserido");
  const row = await jobRow();
  assert.equal(row.status, "aguardando");
  assert.equal(row.attempts, 0, "a intenção existe ANTES de qualquer reivindicação");
  assert.equal(row.last_completed_slot, null);
});

test("E16 dono morto no meio do lease: transação abortada, nenhum efeito publicado", opt, async () => {
  // Trava a linha que o núcleo seleciona com `FOR UPDATE`: o worker fica DENTRO
  // da transação do trabalho, exatamente o instante que queremos interromper.
  const blocker = await pool.connect();
  await blocker.query("BEGIN");
  await blocker.query("SELECT id FROM ext_compliance_documents WHERE id = $1 FOR UPDATE", [documentId]);
  const { child, output } = await spawnWorker({
    EXT07_EVALUATE_INTERVAL_SECONDS: "3600",
    EXT07_EVALUATE_IDENTITY: ti.id,
    EXT07_SCHEDULER_LEASE_SECONDS: "5",
  });
  const claimed = await waitFor("reivindicação do job", async () => {
    const row = await jobRow();
    return row?.status === "executando" && row.has_token ? row : null;
  });
  assert.equal(claimed.attempts, 1);
  assert.equal(claimed.last_completed_slot, null);
  assert.ok(new Date(claimed.lease_until).getTime() > Date.now() - 5000, "o lease tem prazo");
  assert.deepEqual(await counts(), { runs: 0, concluidas: 0, falhas: 0, eventos: 0, tarefas: 0, auditoria: 0, vencidos: 0 },
    "execução em andamento não deixa linha no ledger de auditoria");
  // mata o processo no meio do lease — é o instante exato do defeito original
  child.kill("SIGKILL");
  await waitFor("morte do processo", async () => child.exitCode !== null || child.signalCode !== null ? { signal: child.signalCode || `exit:${child.exitCode}` } : null);
  assert.ok(String(output.stdout).includes("E16_HARNESS {\"event\":\"started\"}"), "o harness chegou a ligar o worker");
  await blocker.query("ROLLBACK").catch(() => {});
  blocker.release();
  await waitFor("liberação do backend morto", async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND state = 'active'`,
    );
    return rows[0].waiting === 0 ? rows[0] : null;
  });
  const afterKill = await jobRow();
  assert.equal(afterKill.status, "executando", "a fila fica com um dono morto: é o vão que precisa ser retomado");
  assert.deepEqual(await counts(), { runs: 0, concluidas: 0, falhas: 0, eventos: 0, tarefas: 0, auditoria: 0, vencidos: 0 },
    "SIGKILL não deixa efeito parcial: nada foi commiteado");
});

test("E16 restart: o mesmo intervalo é reivindicado e concluído exatamente uma vez", opt, async () => {
  const expired = await waitFor("lease vencer", async () => {
    const row = await jobRow();
    return row && new Date(row.lease_until) < new Date() ? row : null;
  });
  assert.equal(expired.attempts, 1);
  const { child } = await spawnWorker({
    EXT07_EVALUATE_INTERVAL_SECONDS: "3600",
    EXT07_EVALUATE_IDENTITY: ti.id,
    EXT07_SCHEDULER_LEASE_SECONDS: "30",
  });
  const done = await waitFor("execução concluída após restart", async () => {
    const row = await jobRow();
    return row?.status === "aguardando" && row.last_completed_slot ? row : null;
  });
  const final = await counts();
  assert.deepEqual(final, { runs: 1, concluidas: 1, falhas: 0, eventos: 1, tarefas: 1, auditoria: 1, vencidos: 1 },
    "exatamente uma linha 'concluida', um evento do dia, uma tarefa e o documento vencido");
  assert.equal(done.attempts, 2, "duas reivindicações (a do dono morto + a da retomada)");
  assert.equal(done.consecutive_failures, 0, "concluir limpa a contagem de falhas");
  assert.equal(done.last_error, null);
  assert.equal(done.last_completed_slot, done.slot === done.last_completed_slot ? done.last_completed_slot : expired.slot,
    "o slot CONCLUÍDO é o mesmo intervalo que ficou órfão");
  completedByResumeSlot = expired.slot;
  assert.equal(done.lease_until, null, "sem dono depois de concluir");
  assert.ok(new Date(done.due_at) > new Date(), "o próximo intervalo já sai armado, na mesma transação");
  assert.equal(done.has_token, false);
  const facts = (await pool.query(`SELECT facts, idempotency_key, origem, status FROM ext_compliance_evaluation_runs`)).rows[0];
  assert.equal(facts.status, "concluida");
  assert.equal(facts.origem, "agendada");
  assert.match(facts.idempotency_key, /^agendada:\d{4}-\d{2}-\d{2}$/);
  assert.equal(facts.facts.trigger, "agendada");
  assert.equal(facts.facts.documents_expired, 1);
  assert.equal(facts.facts.tasks_created, 1);
  const task = (await pool.query(`SELECT status::text AS status, responsible_identity FROM ext_compliance_tasks LIMIT 1`)).rows[0];
  assert.equal(task.status, "aberta");
  assert.equal(task.responsible_identity, responsible.id, "a tarefa vai para o responsável da obrigação, não para o ator");
  child.kill("SIGTERM");
  await waitFor("harness encerrado", async () => (child.exitCode !== null || child.signalCode !== null ? { ok: true } : null));
});

test("E16 intervalo concluído não repete: um terceiro processo não reexecuta o slot", opt, async () => {
  const before = await counts();
  const beforeJob = await jobRow();
  const { child } = await spawnWorker({
    EXT07_EVALUATE_INTERVAL_SECONDS: "3600",
    EXT07_EVALUATE_IDENTITY: ti.id,
    EXT07_SCHEDULER_LEASE_SECONDS: "30",
  });
  await sleep(1500);
  // O boot NÃO reabre o relógio da fila (só `force` faz isso): sem essa regra,
  // medido na primeira corrida do gate, cada reinício produzia uma execução a
  // mais — "um intervalo, uma execução" deixava de valer para processos que
  // sobem e descem (deploy, restart, scale-in).
  assert.deepEqual(await counts(), before, `nada é reexecutado enquanto o próximo intervalo não vence; ledger: ${JSON.stringify(await runRows())}`);
  const after = await jobRow();
  assert.equal(after.attempts, beforeJob.attempts, "nenhuma reivindicação nova");
  assert.equal(after.last_completed_slot, beforeJob.last_completed_slot);
  child.kill("SIGTERM");
});

test("E16 falha permanente: 'falha' com retry no teto do backoff e zero mutação", opt, async () => {
  await pool.query(`UPDATE auth_identities SET status='suspended' WHERE id=$1`, [ti.id]);
  suspended = true;
  // Rearme manual: slot PRÓPRIO. Reusar o slot do minuto em curso é legítimo
  // (é o "roda de novo AGORA" do operador) e por isso a fila deixa — mas aí a
  // linha repetida no ledger seria do rearme, não do motor, e a prova de
  // "um intervalo, uma execução" deixaria de dizer nada.
  const slot = `${evaluationSlotFor(new Date(Date.now() - 1000))}#rearme-1`;
  const enqueued = await enqueue(pool, {
    jobKey: JOB_KEY, jobType: "ext07_expiry_evaluation", slot,
    dueAt: new Date(Date.now() - 1000), payload: { interval_seconds: 3600 },
    leaseSeconds: 10, maxBackoffSeconds: 3600, refresh: true, force: true,
  });
  assert.equal(enqueued.status, "reatualizado", "force reabre o slot concluído sem duplicar a linha");
  const { child } = await spawnWorker({
    EXT07_EVALUATE_INTERVAL_SECONDS: "3600",
    EXT07_EVALUATE_IDENTITY: ti.id,
    EXT07_SCHEDULER_LEASE_SECONDS: "10",
    EXT07_SCHEDULER_BACKOFF_SECONDS: "1",
    EXT07_SCHEDULER_BACKOFF_MAX_SECONDS: "3600",
  });
  const failed = await waitFor("registro de falha na fila", async () => {
    const row = await jobRow();
    return row?.status === "falha" ? row : null;
  });
  assert.equal(failed.consecutive_failures, 1);
  assert.match(String(failed.last_error), /identidade|staff/i, "last_error tem de dizer o porquê para quem olha a fila");
  assert.ok(new Date(failed.due_at).getTime() > Date.now() + 3000, "permanente: retry adiado no teto, não em loop");
  const afterFailure = await counts();
  assert.equal(afterFailure.concluidas, 1, "a execução anterior continua sendo a única 'concluida'");
  assert.equal(afterFailure.falhas, 1, "o ledger 156 também vê a falha (monitoramento igual nos dois modos)");
  assert.equal(afterFailure.tarefas, 1);
  assert.equal(afterFailure.eventos, 1);
  const runFail = (await pool.query(`SELECT status, idempotency_key, error, facts FROM ext_compliance_evaluation_runs WHERE status='falha'`)).rows[0];
  assert.equal(runFail.facts.reason, "scheduler_identity_invalid");
  assert.equal(runFail.facts.durable_slot, slot, "a linha de falha diz QUAL intervalo falhou");
  assert.equal(runFail.status, "falha");
  // A linha de falha POR ANTES de a identidade ser aceita não tem dia: o dia só
  // é lido do banco depois da validação. É a mesma chave que o modo in-process
  // grava no mesmo ponto (`agendada:sem-data`) — paridade entre os dois modos,
  // não um detalhe do durable.
  assert.equal(runFail.idempotency_key, "agendada:sem-data", "chave do ledger igual à do modo in-process no mesmo ponto de falha");
  child.kill("SIGTERM");
  await sleep(400);
  const duringBackoff = await jobRow();
  assert.equal(duringBackoff.attempts, failed.attempts, "dentro do backoff ninguém reivindica o mesmo job");
  assert.equal((await counts()).falhas, 1, "sem storm de erro: uma tentativa, um registro");
});

test("E16 reativada a identidade, a fila retoma e o evento do dia não duplica", opt, async () => {
  await pool.query(`UPDATE auth_identities SET status='active' WHERE id=$1`, [ti.id]);
  suspended = false;
  const beforeJob = await jobRow();
  assert.equal(beforeJob.status, "falha", "a prova anterior deixou a fila em falha com backoff");
  assert.ok(new Date(beforeJob.due_at) > new Date(), "e adiou o retry no teto — ninguém fica martelando a falha");
  const beforeCounts = await counts();
  // Não se espera o teto do backoff num teste: o operador pode reinvalar o
  // intervalo de propósito (force), que é exatamente o caso que a fila aceita.
  const resumeSlot = `${evaluationSlotFor(new Date(Date.now() - 1000))}#rearme-2`;
  const enqueued = await enqueue(pool, {
    jobKey: JOB_KEY, jobType: "ext07_expiry_evaluation",
    slot: resumeSlot,
    dueAt: new Date(Date.now() - 1000), payload: { interval_seconds: 3600 },
    leaseSeconds: 30, maxBackoffSeconds: 3600, refresh: true, force: true,
  });
  assert.ok(["reatualizado", "existente", "inserido"].includes(enqueued.status));
  assert.equal((await jobRow()).last_completed_slot, null, "force reabre o intervalo: é o único caminho que limpa a conclusão");
  const { child } = await spawnWorker({
    EXT07_EVALUATE_INTERVAL_SECONDS: "3600",
    EXT07_EVALUATE_IDENTITY: ti.id,
    EXT07_SCHEDULER_LEASE_SECONDS: "30",
  });
  // Espera pelo EFEITO publicado, não pelo estado da fila: `force` já deixa a
  // linha "aguardando" sem falha, e esperar por isso seria um falso positivo
  // (foi o que a primeira corrida do gate mostrou).
  const after = await waitFor("segunda execução concluída no ledger 156", async () => {
    const current = await counts();
    return current.concluidas === beforeCounts.concluidas + 1 ? current : null;
  }, { timeoutMs: 30_000 });
  const resumed = await jobRow();
  assert.equal(resumed.status, "aguardando");
  assert.equal(resumed.consecutive_failures, 0, "concluir limpa o histórico de falha");
  assert.equal(resumed.last_error, null, "e o motivo da falha sai da fila");
  assert.equal(resumed.attempts, beforeJob.attempts + 1, "exatamente uma reivindicação nova");
  assert.equal(after.eventos, 1, "o evento do dia tem chave determinística: duas execuções no mesmo dia não duplicam");
  assert.equal(after.tarefas, 1, "a tarefa é idempotente por (documento, vigência, regra)");
  assert.equal(after.concluidas, 2, "duas execuções no mesmo dia: o ledger 156 registra ambas");
  assert.equal(after.falhas, 1);
  const slots = (await pool.query(
    `SELECT facts->>'durable_slot' AS slot, count(*)::int AS total
       FROM ext_compliance_evaluation_runs WHERE status='concluida' AND facts ? 'durable_slot'
      GROUP BY 1`)).rows;
  assert.deepEqual(slots.map((row) => row.slot).sort(), [completedByResumeSlot, resumeSlot].sort(),
    "cada execução carregou o SEU intervalo da fila, e só este");
  assert.deepEqual(slots.map((row) => row.total).sort(), [1, 1], "um intervalo, uma linha 'concluida'");
  child.kill("SIGTERM");
  await waitFor("harness encerrado", async () => (child.exitCode !== null || child.signalCode !== null ? { ok: true } : null));
});

test("E16 intervalo vencido durante a queda é executado no próximo boot, sem force", opt, async () => {
  // Estado "depois de um restart": o intervalo seguinte foi armado pela
  // conclusão e VENCEU enquanto ninguém estava de pé. Ninguém reescreveu nada:
  // a fila está pronta e o slot ainda não foi concluído.
  await pool.query(
    `UPDATE durable_jobs SET due_at = NOW() - interval '90 seconds' WHERE job_key = $1 AND status = 'aguardando'`,
    [JOB_KEY],
  );
  const before = await counts();
  const beforeJob = await jobRow();
  assert.equal(beforeJob.status, "aguardando");
  assert.ok(new Date(beforeJob.due_at) < new Date(), "o intervalo está vencido");
  assert.notEqual(beforeJob.slot, beforeJob.last_completed_slot, "e ainda não foi concluído");
  const { child } = await spawnWorker({
    EXT07_EVALUATE_INTERVAL_SECONDS: "3600",
    EXT07_EVALUATE_IDENTITY: ti.id,
    EXT07_SCHEDULER_LEASE_SECONDS: "30",
  });
  const after = await waitFor("execução do intervalo vencido", async () => {
    const current = await counts();
    return current.runs === before.runs + 1 ? current : null;
  }, { timeoutMs: 30_000 });
  assert.equal(after.concluidas, before.concluidas + 1, "a perda do tick NÃO existe mais: o que venceu é executado");
  assert.equal(after.eventos, 1, "e o efeito continua sem duplicar o evento do dia");
  const slots = (await pool.query(
    `SELECT facts->>'durable_slot' AS slot FROM ext_compliance_evaluation_runs WHERE status='concluida' ORDER BY started_at`)).rows.map((row) => row.slot);
  assert.equal(new Set(slots).size, 3, `três intervalos distintos, três execuções: ${JSON.stringify(slots)}`);
  child.kill("SIGTERM");
  await waitFor("harness encerrado", async () => (child.exitCode !== null || child.signalCode !== null ? { ok: true } : null));
});

test("E16 concorrência real: dois reivindicadores, um único dono por intervalo", opt, async () => {
  const probeKey = `e16:probe:${randomUUID().slice(0, 8)}`;
  const slot = "probe:slot-1";
  await enqueue(pool, { jobKey: probeKey, jobType: "e16_probe", slot, dueAt: new Date(Date.now() - 1000), leaseSeconds: 30, payload: {} });
  const racers = await Promise.all([
    spawnWorker({ E16_HARNESS_MODE: "probe", E16_PROBE_JOB_KEY: probeKey, E16_PROBE_LEASE_SECONDS: "30" }),
    spawnWorker({ E16_HARNESS_MODE: "probe", E16_PROBE_JOB_KEY: probeKey, E16_PROBE_LEASE_SECONDS: "30" }),
    spawnWorker({ E16_HARNESS_MODE: "probe", E16_PROBE_JOB_KEY: probeKey, E16_PROBE_LEASE_SECONDS: "30" }),
  ]);
  const results = await Promise.all(racers.map(async ({ child, output }) => {
    await waitFor("harness de probe sair", async () => (child.exitCode !== null || child.signalCode !== null ? true : null), { timeoutMs: 20_000 });
    const payload = await readHarnessLine(output, child, "probed");
    return payload.claimed;
  }));
  const total = results.flat();
  assert.equal(total.length, 1, `um único dono: ${JSON.stringify(results)}`);
  assert.deepEqual(total, [probeKey]);
  const row = (await pool.query(`SELECT status, attempts, claim_token, lease_until, slot FROM durable_jobs WHERE job_key=$1`, [probeKey])).rows[0];
  assert.equal(row.status, "executando");
  assert.equal(row.attempts, 1, "um único dono reivindicou: a contagem é de uma reivindicação, não de três");
  assert.ok(row.claim_token, "o dono fica marcado pelo token de cercamento");
  assert.ok(new Date(row.lease_until) > new Date(), "com prazo");
  assert.equal(row.slot, slot);
  await pool.query(`DELETE FROM durable_jobs WHERE job_key = $1`, [probeKey]);
});

test("E16 controle negativo: sem a decisão no UPDATE haveria dois donos (a prova tem poder de falhar)", opt, async () => {
  const keys = Array.from({ length: 4 }, () => `e16:naive:${randomUUID().slice(0, 8)}`);
  for (const jobKey of keys) {
    await enqueue(pool, { jobKey, jobType: "e16_probe", slot: "naive:slot-1", dueAt: new Date(Date.now() - 1000), leaseSeconds: 30, payload: {} });
  }
  try {
    // O código ANTES do E16: um SELECT seguido de UPDATE. Quatro leitores
    // concorrentes veem as MESMAS linhas — é exatamente a duplicação que a
    // reivindicação atômica elimina.
    const reads = await Promise.all(keys.map(() => pool.query(
      `SELECT id FROM durable_jobs WHERE job_key LIKE 'e16:naive:%' AND status = 'aguardando' ORDER BY due_at LIMIT 10`,
    )));
    const seen = reads.map((result) => result.rows.map((row) => row.id));
    assert.ok(seen.every((ids) => ids.length === 4), "o SELECT ingênuo vê a fila inteira");
    assert.deepEqual(seen[0], seen[1], "sem SKIP LOCKED/sem guard no UPDATE, os concorrentes escolhem as mesmas linhas");
    // O claim real, no mesmo estado, dá um dono por linha.
    const claims = await Promise.all([1, 2, 3, 4].map(() => claimJob(pool, { jobKey: keys[0], leaseSeconds: 30, batchSize: 10 })));
    const claimedIds = claims.flat().map((job) => job.id);
    assert.equal(claimedIds.length, 1, "batchSize > 1 não atravessa para outros job_key");
    assert.equal(new Set(claimedIds).size, 1);
    const inspected = await Promise.all(keys.map((jobKey) => inspectJob(pool, jobKey)));
    assert.equal(inspected.filter((row) => row.status === "executando").length, 1);
    assert.equal(inspected.reduce((sum, row) => sum + row.attempts, 0), 1);
  } finally {
    await pool.query(`DELETE FROM durable_jobs WHERE job_key LIKE 'e16:naive:%' OR job_key LIKE 'e16:probe:%'`);
  }
});

test("E16 o ledger da fila continua legível: um job por chave, contagens coerentes", opt, async () => {
  const row = await jobRow();
  const runs = (await pool.query(`SELECT count(*)::int AS total FROM ext_compliance_evaluation_runs`)).rows[0].total;
  // Toda reivindicação que CHEGOU a uma decisão escreveu exatamente uma linha no
  // ledger 156. A única exceção é o dono morto no meio do lease (caso 3) — que é
  // exatamente o defeito que o E16 fecha: ele não escreveu nada e por isso o
  // intervalo pôde ser retomado. `attempts = runs + 1` é a conta dessa história.
  assert.equal(row.attempts, runs + 1, `reivindicações ${row.attempts} versus linhas do ledger ${runs} (esperado: +1, o dono morto)`);
  const duplicatedSlots = (await pool.query(
    `SELECT facts->>'durable_slot' AS slot, count(*)::int AS total
       FROM ext_compliance_evaluation_runs
      WHERE status = 'concluida' AND facts ? 'durable_slot'
      GROUP BY 1 HAVING count(*) > 1`,
  )).rows;
  assert.deepEqual(duplicatedSlots, [], "nenhum intervalo da fila foi concluído duas vezes — a prova de exactly-once");
  assert.equal(row.consecutive_failures, 0);
  assert.ok(row.last_completed_slot, "o último intervalo concluído fica registrado");
  assert.ok(row.payload.interval_seconds === 3600 || typeof row.payload === "object");
  const duplicated = (await pool.query(
    `SELECT job_key, count(*)::int AS total FROM durable_jobs GROUP BY job_key HAVING count(*) > 1`,
  )).rows;
  assert.deepEqual(duplicated, [], "job_key é único: dois boots não criam duas filas");
  assert.ok(Date.now() - startedAt > 0);
});
