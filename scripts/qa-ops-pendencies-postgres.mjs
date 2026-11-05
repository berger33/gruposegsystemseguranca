#!/usr/bin/env node
// F15 — gate focal autoauditável da caixa interna de pendências.
// PostgreSQL 17 descartável, ledger 001–183, servidor HTTP real e sessões staff
// fictícias. Não usa banco remoto e não cria negócio por SQL.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { releaseSignalHandlers } from './qa-generated-files-guard.mjs';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === "1") {
  console.error("QA_PG_REFUSED: DATABASE_URL, DATABASE_MIGRATION_URL e banco remoto são proibidos neste gate local.");
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, "..");
// Grupo 05H: preserva jornadas e contratos, com contenção POSIX antes da biblioteca.
const supervised = process.env.QA_PG_SUPERVISED === '1' && !!process.send;
if (process.platform !== 'win32' && !supervised) {
  releaseSignalHandlers();
  const { superviseLocalPg, PG_PHASE_LIMITS } = await import('./lib/qa-pg-supervisor.mjs');
  const result = await superviseLocalPg({ entry: path.resolve(import.meta.filename),
    args: process.argv.slice(2), limits: { ...PG_PHASE_LIMITS, migrate: 90_000, test: 180_000 } });
  if (result.cleaned) console.log('QA_PENDENCY_PG_TEMP_CLEANED: true');
  process.exit(result.code);
}
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const phase = name => { if (supervised) process.send({ type: 'phase', name }); };

const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const port = probe.address().port;
    probe.close(() => resolve(port));
  });
});

const run = (command, args, env) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; process.stdout.write(chunk); });
  child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
  child.once("error", reject);
  child.once("exit", (code) => resolve({ code: code ?? 1, output }));
});

const auditTap = (output) => {
  const value = (label) => {
    const match = output.match(new RegExp(`^# ${label} (\\d+)$`, "m"));
    return match ? Number(match[1]) : null;
  };
  const pass = value("pass");
  const fail = value("fail");
  const skipped = value("skipped");
  const todo = value("todo");
  const problems = [];
  if (pass === null || fail === null) problems.push("resumo TAP ausente");
  if (fail) problems.push(`${fail} falha(s)`);
  if (skipped) problems.push(`${skipped} caso(s) pulado(s)`);
  if (todo) problems.push(`${todo} caso(s) todo`);
  if (pass !== null && pass < 17) problems.push(`apenas ${pass} casos aprovados; mínimo 17`);
  return { pass, fail, skipped, todo, problems };
};

const port = await freePort();
const directory = supervised ? process.env.QA_PG_DIRECTORY : await mkdtemp(path.join(tmpdir(), "seg-qa-pendency-pg-"));
if (!directory) throw new Error('qa_pg_sandbox_missing');
const password = randomBytes(24).toString("hex");
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, "data"),
  port,
  user: "seg_qa",
  password,
  persistent: false,
  initdbFlags: ["--encoding=UTF8"],
  postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  onLog: () => {},
  onError: (error) => console.error("QA_PG_ENGINE_ERROR", String(error).replaceAll(password, "[redacted]").slice(0, 500)),
});

let exitCode = 1;
try {
  phase('initialise');
  await postgres.initialise();
  phase('start');
  await postgres.start();
  const database = "seg_qa_pendency";
  phase('create');
  if (supervised) {
    const { createLocalQaDatabase } = await import('./lib/qa-pg-supervisor.mjs');
    await createLocalQaDatabase({ port, user: 'seg_qa', password, database });
  } else { await postgres.createDatabase(database); }
  const url = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
  console.log(`QA_PG_READY: PostgreSQL 17 descartável em 127.0.0.1:${port}/${database}; segredo omitido.`);

  phase('migrate');
  const migrated = await run(process.execPath, ["scripts/migrate-site-visual.mjs"], {
    DATABASE_MIGRATION_URL: url,
    DATABASE_URL: "",
    QA_MIGRATION_ONLY: "true",
  });
  if (migrated.code !== 0) throw new Error(`migrations_failed_exit_${migrated.code}`);

  phase('test');
  const executed = await run(process.execPath, ["--test", "--test-concurrency=1", "tests/ops-pendencies.integration.test.mjs"], {
    RUN_DATABASE_INTEGRATION: "1",
    QA_PENDENCY_REQUIRE_DB: "1",
    DATABASE_URL: url,
    DATABASE_MIGRATION_URL: "",
    RUN_DATABASE_INTEGRATION_REMOTE: "",
    QA_PGLITE_ONLY: "",
    ALLOW_REMOTE_MIGRATIONS: "",
    OLLAMA_ENABLED: "false",
    MAIL_HOST: "",
    NEXT_TELEMETRY_DISABLED: "1",
    AWS_EXECUTION_ENV: "AWS_Lambda_nodejs22.x",
  });
  exitCode = executed.code;
  const summary = auditTap(executed.output);
  console.log(`PENDENCY_TAP_SUMMARY: pass=${summary.pass} fail=${summary.fail} skipped=${summary.skipped} todo=${summary.todo} minimo_exigido=17`);
  if (summary.problems.length) {
    console.error(`PENDENCY_GATE_REJECTED: ${summary.problems.join("; ")}`);
    exitCode = 1;
  }
  console.log(`PENDENCY_TEST_EXIT: ${exitCode}`);
} catch (error) {
  console.error("QA_PG_FAILED", String(error?.message || error).replaceAll(password, "[redacted]").slice(0, 700));
  exitCode = 1;
} finally {
  phase('stop');
  if (supervised) {
    try { await postgres.stop(); } catch { exitCode = 1; console.error('QA_PG_STOP_FAILED: stop rejected'); }
  } else {
    await postgres.stop().catch(() => {});
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    console.log('QA_PENDENCY_PG_TEMP_CLEANED: true');
  }
}
if (supervised) {
  phase('done');
  await new Promise(resolve => process.send({ type: 'complete', code: exitCode }, resolve));
}
process.exit(exitCode);
