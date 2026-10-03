#!/usr/bin/env node
// EXT-07 — gate probatório: PostgreSQL 17 descartável, migrações 001–154,
// servidor HTTP real, sessão staff real e TAP autoauditado. Não usa banco do
// operador nem prova upload, bytes, armazenamento, integração regulatória ou
// aceite humano.
import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === "1") {
  console.error("QA_PG_REFUSED: limpe DATABASE_URL, DATABASE_MIGRATION_URL e RUN_DATABASE_INTEGRATION_REMOTE; o gate usa somente cluster descartável.");
  process.exit(2);
}
const root = path.resolve(import.meta.dirname, "..");
const freeLoopbackPort = () => new Promise((resolve, reject) => {
  const probe = createServer(); probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});
const run = (args, env, capture = false) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
  let output = "";
  if (capture) {
    child.stdout.on("data", chunk => { output += chunk; process.stdout.write(chunk); });
    child.stderr.on("data", chunk => { output += chunk; process.stderr.write(chunk); });
  }
  child.once("error", reject); child.once("exit", code => resolve({ code: code ?? 1, output }));
});
const MINIMUM_CASES = 50;
function auditTap(output) {
  const number = label => { const match = output.match(new RegExp(`^# ${label} (\\d+)$`, "m")); return match ? Number(match[1]) : null; };
  const summary = { tests: number("tests"), pass: number("pass"), fail: number("fail"), cancelled: number("cancelled"), skipped: number("skipped"), todo: number("todo") };
  const problems = [];
  if (summary.tests === null || summary.pass === null || summary.fail === null) problems.push("resumo TAP ausente: a suíte HTTP/PG não terminou");
  if (summary.fail) problems.push(`${summary.fail} caso(s) reprovado(s)`);
  if (summary.cancelled) problems.push(`${summary.cancelled} caso(s) cancelado(s)`);
  if (summary.skipped || /^ok .*# SKIP/im.test(output)) problems.push(`${summary.skipped || "algum"} caso(s) pulado(s): skip não é prova`);
  if (summary.todo || /^ok .*# TODO/im.test(output)) problems.push(`${summary.todo || "algum"} caso(s) TODO`);
  if (summary.pass !== null && summary.pass < MINIMUM_CASES) problems.push(`apenas ${summary.pass} caso(s) aprovados; mínimo explícito ${MINIMUM_CASES}`);
  if (summary.tests !== null && summary.pass !== null && summary.tests !== summary.pass) problems.push(`tests=${summary.tests} difere de pass=${summary.pass}`);
  return { ...summary, problems };
}

const database = "seg_qa_ext07", port = await freeLoopbackPort();
const directory = await mkdtemp(path.join(tmpdir(), "seg-qa-ext07-pg-"));
const nextDirectory = path.join(root, ".next", "integration-ext07");
const password = randomBytes(24).toString("hex");
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, "data"), port, user: "seg_qa", password,
  persistent: false, postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  onLog: () => {}, onError: error => console.error("QA_PG_ENGINE_ERROR", String(error).replaceAll(password, "[redacted]").slice(0, 300)),
});
let result = 1;
try {
  await postgres.initialise(); await postgres.start(); await postgres.createDatabase(database);
  const url = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
  console.log(`QA_PG_READY: 127.0.0.1:${port}/${database}; PostgreSQL 17 temporário exclusivo; segredo omitido.`);
  const migrated = await run(["scripts/migrate-site-visual.mjs"], { DATABASE_MIGRATION_URL: url, DATABASE_URL: "", QA_MIGRATION_ONLY: "true" });
  if (migrated.code !== 0) throw new Error(`migrations_failed_exit_${migrated.code}`);
  const countScript = `import pg from 'pg';const p=new pg.Pool({connectionString:process.env.DATABASE_URL});const r=await p.query("SELECT count(*)::int n FROM __migrations");console.log('EXT07_MIGRATIONS_APPLIED='+r.rows[0].n);await p.end();if(r.rows[0].n!==154)process.exit(1);`;
  const counted = await run(["--input-type=module", "--eval", countScript], { DATABASE_URL: url, DATABASE_MIGRATION_URL: "" });
  if (counted.code !== 0) throw new Error("migration_count_not_154");
  const executed = await run(["--test", "--test-concurrency=1", "tests/ext07-compliance.integration.test.mjs"], {
    RUN_DATABASE_INTEGRATION: "1", QA_EXT07_REQUIRE_DB: "1", RUN_DATABASE_INTEGRATION_REMOTE: "",
    DATABASE_URL: url, DATABASE_MIGRATION_URL: "", QA_PGLITE_ONLY: "", ALLOW_REMOTE_MIGRATIONS: "",
    OLLAMA_ENABLED: "false", MAIL_HOST: "", NEXT_TELEMETRY_DISABLED: "1",
  }, true);
  result = executed.code;
  const summary = auditTap(executed.output);
  console.log(`EXT07_TAP_SUMMARY: tests=${summary.tests} pass=${summary.pass} fail=${summary.fail} cancelled=${summary.cancelled} skipped=${summary.skipped} todo=${summary.todo} minimo_exigido=${MINIMUM_CASES}`);
  if (summary.problems.length) { console.error(`EXT07_GATE_REJECTED: ${summary.problems.join("; ")}`); result = result || 1; }
  console.log(`EXT07_COMPLIANCE_TEST_EXIT: ${result}`);
} catch (error) {
  console.error("QA_PG_FAILED", String(error?.message || error).replaceAll(password, "[redacted]").slice(0, 700)); result = 1;
} finally {
  await postgres.stop().catch(() => {});
  await rm(directory, { recursive: true, force: true }).catch(() => {});
  await rm(nextDirectory, { recursive: true, force: true }).catch(() => {});
  console.log("QA_EXT07_PG_TEMP_CLEANED: true");
}
process.exit(result);
