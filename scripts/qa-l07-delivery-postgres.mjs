#!/usr/bin/env node
// L07 delivery gate: isolated PostgreSQL, real HTTP and Chromium. Never uses a
// caller-provided database, so synthetic financial data cannot touch user data.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { releaseSignalHandlers } from './qa-generated-files-guard.mjs';
import { assertTapSummary, collectTap } from './lib/qa-tap-summary.mjs';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === "1") {
  console.error("QA_PG_REFUSED: clear DATABASE_URL, DATABASE_MIGRATION_URL and RUN_DATABASE_INTEGRATION_REMOTE."); process.exit(2);
}
const root = path.resolve(import.meta.dirname, "..");
// Grupo 05K: jornadas preservadas sob contenção POSIX, antes da biblioteca.
const supervised = process.env.QA_PG_SUPERVISED === '1' && !!process.send;
if (process.platform !== 'win32' && !supervised) {
  releaseSignalHandlers();
  const { superviseLocalPg, PG_PHASE_LIMITS } = await import('./lib/qa-pg-supervisor.mjs');
  const result = await superviseLocalPg({ entry: path.resolve(import.meta.filename),
    args: process.argv.slice(2), limits: { ...PG_PHASE_LIMITS, migrate: 90_000, test: 900_000 } });
  // Só tocar o distDir depois que o grupo do worker foi encerrado.
  let cleanupFailed = false;
  if (result.cleaned) {
    try { await cleanupNextDist(); } catch (error) {
      console.error('QA_L07_NEXT_DIST_CLEANUP_FAILED', String(error?.message || error).slice(0, 300));
      cleanupFailed = true;
    }
  }
  if (result.cleaned) console.log('QA_L07_PG_TEMP_CLEANED: true');
  process.exit(cleanupFailed ? 1 : result.code);
}
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const phase = name => { if (supervised) process.send({ type: 'phase', name }); };

const nextDistDir = path.join(root, ".next", "integration-l07");
const freePort = () => new Promise((resolve, reject) => { const server = createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); }); });
const run = async (command, args, env, tap) => {
  if (tap) {
    const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    const journey = await collectTap(child);
    const tapResult = assertTapSummary(journey.output, { minimum: tap.minimum, truncated: journey.truncated, label: tap.label });
    return journey.code === 0 && tapResult.ok ? 0 : (journey.code || 1);
  }
  return new Promise((resolve, reject) => { const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: "inherit" }); child.once("error", reject); child.once("exit", code => resolve(code ?? 1)); });
};
const database = "seg_qa_l07"; const port = await freePort(); const directory = supervised ? process.env.QA_PG_DIRECTORY : await mkdtemp(path.join(tmpdir(), "seg-qa-l07-pg-"));
if (!directory) throw new Error('qa_pg_sandbox_missing'); const password = randomBytes(24).toString("hex");
const postgres = new EmbeddedPostgres({ databaseDir: path.join(directory, "data"), port, user: "seg_qa", password, persistent: false, postgresFlags: ["-c", "listen_addresses=127.0.0.1"], onLog: () => {}, onError: error => console.error("QA_PG_ENGINE_ERROR", String(error).replaceAll(password, "[redacted]").slice(0, 300)) });
let result = 1;
try {
  phase('initialise');
  await rm(nextDistDir, { recursive: true, force: true });
  await postgres.initialise();
  phase('start');
  await postgres.start();
  phase('create');
  if (supervised) {
    const { createLocalQaDatabase } = await import('./lib/qa-pg-supervisor.mjs');
    await createLocalQaDatabase({ port, user: 'seg_qa', password, database });
  } else { await postgres.createDatabase(database); }
  const databaseUrl = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
  console.log(`QA_L07_PG_READY: 127.0.0.1:${port}/${database}; temporary isolated cluster; secret omitted.`);
  console.log("QA_L07_SCOPE: 43 serial subtests (FIN-01..04 regression + FIN-05/fatia aditiva #47 + FIN-06 + FIN-07 + FIN-08 + FIN-09 + FIN-10/fatia aditiva #53 com política de alçada configurável, replay, duplicidade natural e trava de exclusão + FIN-11 + FIN-12 + FIN-13 incluindo a fatia aditiva de revisão/margem/idempotência/histórico + FIN-14 + FIN-15 + FIN-16, incluindo jornadas UI/idempotência/trava de competência + ADM-01..12 do painel do Marcelo (papéis/anônimo, origem e drill-down de cada indicador até o registro canônico, falha de leitura com retry, decisão unificada com alçada/segregação/idempotência concorrente, relatórios limitados e auditados, configuração versionada, meta x realizado, diário CON-11 por permissão, análises de expansão, auditoria fail-closed e jornada Chromium ponta a ponta)); real HTTP, PostgreSQL and packaged Chromium; synthetic data only.");
  phase('migrate');
  if (await run(process.execPath, ["scripts/migrate-site-visual.mjs"], { DATABASE_MIGRATION_URL: databaseUrl, DATABASE_URL: "", QA_MIGRATION_ONLY: "true" }) !== 0) throw new Error("migrations_failed");
  phase('test');
  result = await run(process.execPath, ["--test", "--test-concurrency=1", "tests/l07-delivery.integration.test.mjs"], { RUN_DATABASE_INTEGRATION: "1", DATABASE_URL: databaseUrl, DATABASE_MIGRATION_URL: "", RUN_DATABASE_INTEGRATION_REMOTE: "", QA_PGLITE_ONLY: "", ALLOW_REMOTE_MIGRATIONS: "", OLLAMA_ENABLED: "false", MAIL_HOST: "", NEXT_TELEMETRY_DISABLED: "1", CLIENT_DOCS_DIR: path.join(directory, "private-documents"), AWS_EXECUTION_ENV: "AWS_Lambda_nodejs22.x" }, { minimum: 43, label: "L07 delivery" });
  console.log(`L07_DELIVERY_TEST_EXIT: ${result}`);
} catch (error) { console.error("QA_L07_PG_FAILED", String(error?.message || error).replaceAll(password, "[redacted]").slice(0, 500)); result = 1; }
finally {
  phase('stop');
  try { await postgres.stop(); } catch (error) { console.error("QA_L07_PG_STOP_FAILED", String(error).slice(0, 300)); result = 1; }
  if (!supervised) try { await rm(nextDistDir, { recursive: true, force: true }); console.log("QA_L07_NEXT_DIST_CLEANED: true"); } catch (error) { console.error("QA_L07_NEXT_DIST_CLEANUP_FAILED", String(error).slice(0, 300)); result = 1; }
  if (!supervised) {
    await rm(directory, { recursive: true, force: true }); console.log("QA_L07_PG_TEMP_CLEANED: true");
  }
}
if (supervised) {
  phase('done');
  await new Promise(resolve => process.send({ type: 'complete', code: result }, resolve));
}
process.exit(result);

// Declaração hoisted: usada pelo pai antes da importação dinâmica da biblioteca.
async function cleanupNextDist() {
  let timer;
  try {
    await Promise.race([
      rm(path.join(root, '.next', 'integration-l07'), { recursive: true, force: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('next_dist_cleanup_timeout')), 10_000); }),
    ]);
    console.log('QA_L07_NEXT_DIST_CLEANED: true');
  } finally { clearTimeout(timer); }
}
