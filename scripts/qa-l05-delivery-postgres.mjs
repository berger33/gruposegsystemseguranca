#!/usr/bin/env node
// L05 delivery gate: isolated PostgreSQL, real HTTP and Chromium. Never uses
// a caller-provided database, so synthetic contracts cannot touch user data.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { releaseSignalHandlers } from './qa-generated-files-guard.mjs';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === "1") {
  console.error("QA_PG_REFUSED: clear DATABASE_URL, DATABASE_MIGRATION_URL and RUN_DATABASE_INTEGRATION_REMOTE."); process.exit(2);
}
const root = path.resolve(import.meta.dirname, "..");
// Grupo 05J: contenção POSIX antes da biblioteca; jornadas e resultado preservados.
const supervised = process.env.QA_PG_SUPERVISED === '1' && !!process.send;
if (process.platform !== 'win32' && !supervised) {
  releaseSignalHandlers();
  const { superviseLocalPg, PG_PHASE_LIMITS } = await import('./lib/qa-pg-supervisor.mjs');
  const result = await superviseLocalPg({ entry: path.resolve(import.meta.filename),
    args: process.argv.slice(2), limits: { ...PG_PHASE_LIMITS, migrate: 90_000, test: 300_000 } });
  if (result.cleaned) console.log('QA_L05_PG_TEMP_CLEANED: true');
  process.exit(result.code);
}
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const phase = name => { if (supervised) process.send({ type: 'phase', name }); };

const freePort = () => new Promise((resolve, reject) => { const server = createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); }); });
const run = (command, args, env) => new Promise((resolve, reject) => { const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: "inherit" }); child.once("error", reject); child.once("exit", code => resolve(code ?? 1)); });
const database = "seg_qa_l05"; const port = await freePort(); const directory = supervised ? process.env.QA_PG_DIRECTORY : await mkdtemp(path.join(tmpdir(), "seg-qa-l05-pg-"));
if (!directory) throw new Error('qa_pg_sandbox_missing'); const password = randomBytes(24).toString("hex");
const postgres = new EmbeddedPostgres({ databaseDir: path.join(directory, "data"), port, user: "seg_qa", password, persistent: false, postgresFlags: ["-c", "listen_addresses=127.0.0.1"], onLog: () => {}, onError: error => console.error("QA_PG_ENGINE_ERROR", String(error).replaceAll(password, "[redacted]").slice(0, 300)) });
let result = 1;
try {
  phase('initialise');
  await postgres.initialise();
  phase('start');
  await postgres.start();
  phase('create');
  if (supervised) {
    const { createLocalQaDatabase } = await import('./lib/qa-pg-supervisor.mjs');
    await createLocalQaDatabase({ port, user: 'seg_qa', password, database });
  } else { await postgres.createDatabase(database); }
  const databaseUrl = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
  console.log(`QA_L05_PG_READY: 127.0.0.1:${port}/${database}; temporary isolated cluster; secret omitted.`);
  phase('migrate');
  if (await run(process.execPath, ["scripts/migrate-site-visual.mjs"], { DATABASE_MIGRATION_URL: databaseUrl, DATABASE_URL: "", QA_MIGRATION_ONLY: "true" }) !== 0) throw new Error("migrations_failed");
  phase('test');
  result = await run(process.execPath, ["--test", "--test-concurrency=1", "tests/l05-delivery.integration.test.mjs"], { RUN_DATABASE_INTEGRATION: "1", DATABASE_URL: databaseUrl, DATABASE_MIGRATION_URL: "", RUN_DATABASE_INTEGRATION_REMOTE: "", QA_PGLITE_ONLY: "", ALLOW_REMOTE_MIGRATIONS: "", OLLAMA_ENABLED: "false", MAIL_HOST: "", NEXT_TELEMETRY_DISABLED: "1", AWS_EXECUTION_ENV: "AWS_Lambda_nodejs22.x" });
  console.log(`L05_DELIVERY_TEST_EXIT: ${result}`);
} catch (error) { console.error("QA_L05_PG_FAILED", String(error?.message || error).replaceAll(password, "[redacted]").slice(0, 500)); result = 1; }
finally { phase('stop');
  try { await postgres.stop(); } catch (error) { console.error("QA_L05_PG_STOP_FAILED", String(error).slice(0, 300)); result = 1; } if (!supervised) {
    await rm(directory, { recursive: true, force: true }); console.log("QA_L05_PG_TEMP_CLEANED: true");
  } }
if (supervised) {
  phase('done');
  await new Promise(resolve => process.send({ type: 'complete', code: result }, resolve));
}
process.exit(result);
