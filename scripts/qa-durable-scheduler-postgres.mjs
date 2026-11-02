#!/usr/bin/env node
// E16 — gate do worker/scheduler DURÁVEL: prova de retomada em PostgreSQL real.
//
// O que este gate prova (e o `test:unit` não pode provar):
//   1. o PostgreSQL decide a exclusão mútua entre processos: dois reivindicadores
//      concorrentes nunca levam o mesmo intervalo (`FOR UPDATE SKIP LOCKED` +
//      lease + token de cercamento);
//   2. matar o processo no meio do lease NÃO deixa efeito parcial nem linha
//      duplicada: a transação do trabalho aborta junto com o backend;
//   3. o restart retoma o intervalo órfão e o conclui EXATAMENTE UMA vez
//      (uma linha 'concluida' no ledger EXT-07, um evento do dia, uma tarefa,
//      `attempts` coerente, backoff zerado);
//   4. falha permanente vira retry no teto do backoff, sem storm de erro.
//
// Nada de banco do operador: cluster `embedded-postgres` temporário, base
// `seg_qa_e16…`, migrações oficiais 001–182, dados sintéticos `.invalid`.
// Saída: TAP do arquivo de integração + autoaudit (zero skip, zero fail).
import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import './qa-generated-files-guard.mjs';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === "1") {
  console.error("QA_PG_REFUSED: limpe DATABASE_URL, DATABASE_MIGRATION_URL e RUN_DATABASE_INTEGRATION_REMOTE antes deste teste local.");
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, "..");
const MINIMUM_CASES = 9;
const TEST_FILE = "tests/e16-durable-scheduler.integration.test.mjs";

const freeLoopbackPort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const run = (cmd, args, env, capture = false) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  let output = "";
  if (capture) {
    child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
  }
  child.once("error", reject);
  child.once("exit", (code) => resolve({ code: code ?? 1, output }));
});

function auditTap(output) {
  const number = (label) => {
    const match = output.match(new RegExp(`^# ${label} (\\d+)$`, "m"));
    return match ? Number(match[1]) : null;
  };
  const pass = number("pass");
  const fail = number("fail");
  const skipped = number("skipped");
  const todo = number("todo");
  const problems = [];
  if (pass === null || fail === null) problems.push("resumo TAP ausente: a suíte não chegou a rodar");
  if (fail) problems.push(`${fail} caso(s) reprovado(s)`);
  if (skipped) problems.push(`${skipped} caso(s) com skip — skip não é prova neste gate`);
  if (todo) problems.push(`${todo} caso(s) marcado(s) como todo`);
  if (pass !== null && pass < MINIMUM_CASES) problems.push(`apenas ${pass} caso(s) aprovado(s); a prova de retomada exige ao menos ${MINIMUM_CASES}`);
  return { pass, fail, skipped, todo, problems };
}

const database = `seg_qa_e16_${randomBytes(3).toString("hex")}`;
const port = await freeLoopbackPort();
const directory = await mkdtemp(path.join(tmpdir(), "seg-qa-e16-pg-"));
const password = randomBytes(24).toString("hex");
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, "data"),
  port,
  user: "seg_qa",
  password,
  persistent: false,
  postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  onLog: () => {}, // não registrar senhas nem dados de teste
  onError: (error) => console.error("QA_PG_ENGINE_ERROR", String(error).replaceAll(password, "[redacted]").slice(0, 300)),
});

let result = 1;
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase(database);
  const url = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
  console.log(`QA_PG_READY: 127.0.0.1:${port}/${database}; cluster temporário exclusivo; segredo omitido.`);
  const migrated = await run(process.execPath, ["scripts/migrate-site-visual.mjs"], {
    DATABASE_MIGRATION_URL: url, DATABASE_URL: "", QA_MIGRATION_ONLY: "true",
  });
  if (migrated.code !== 0) throw new Error(`migrations_failed_exit_${migrated.code}`);
  const executed = await run(process.execPath, ["--test", "--test-concurrency=1", TEST_FILE], {
    RUN_DATABASE_INTEGRATION: "1",
    QA_E16_REQUIRE_DB: "1",
    RUN_DATABASE_INTEGRATION_REMOTE: "",
    DATABASE_URL: url,
    DATABASE_MIGRATION_URL: "",
    QA_PGLITE_ONLY: "",
    ALLOW_REMOTE_MIGRATIONS: "",
    OLLAMA_ENABLED: "false",
    MAIL_HOST: "",
    NEXT_TELEMETRY_DISABLED: "1",
  }, true);
  result = executed.code;
  const summary = auditTap(executed.output);
  console.log(`E16_TAP_SUMMARY: pass=${summary.pass} fail=${summary.fail} skipped=${summary.skipped} todo=${summary.todo} minimo_exigido=${MINIMUM_CASES}`);
  if (summary.problems.length) {
    console.error(`E16_GATE_REJECTED: ${summary.problems.join("; ")}`);
    result = result || 1;
  }
  console.log(`E16_DURABLE_SCHEDULER_TEST_EXIT: ${result}`);
} catch (error) {
  console.error("QA_PG_FAILED", String(error?.message || error).replaceAll(password, "[redacted]").slice(0, 500));
  result = 1;
} finally {
  await postgres.stop().catch(() => {});
  await rm(directory, { recursive: true, force: true }).catch(() => {});
  console.log("QA_E16_PG_TEMP_CLEANED: true");
}
process.exit(result);
