#!/usr/bin/env node
// EXT-07 — gate autoauditável de compliance corporativo.
// Prova real: cluster PostgreSQL 17 descartável, migrações 001–154 aplicadas,
// servidor HTTP real em porta temporária, identidade e sessão staff sintéticas
// e somente dados .invalid. Sem skip, sem todo, sem bypass, sem banco do
// operador, sem SMTP, sem armazenamento externo, sem aceite humano inventado.

import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === "1") {
  console.error("QA_PG_REFUSED: limpe DATABASE_URL, DATABASE_MIGRATION_URL e RUN_DATABASE_INTEGRATION_REMOTE antes deste gate local.");
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, "..");
const EXPECTED_MIGRATIONS = 154;
const MINIMUM_CASES = 74;
const SUITES = ["tests/ext07-compliance.test.mjs", "tests/ext07-compliance.integration.test.mjs"];

const freeLoopbackPort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

const run = (args, env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; process.stdout.write(chunk); });
  child.stderr.on("data", chunk => { output += chunk; process.stderr.write(chunk); });
  child.once("error", reject);
  child.once("exit", code => resolve({ code: code ?? 1, output }));
});

function auditTap(output) {
  const number = label => { const match = output.match(new RegExp(`^# ${label} (\\d+)$`, "m")); return match ? Number(match[1]) : null; };
  const pass = number("pass"), fail = number("fail"), skipped = number("skipped"), todo = number("todo");
  const problems = [];
  if (pass === null || fail === null) problems.push("resumo TAP ausente: a suíte não chegou a rodar");
  if (fail) problems.push(`${fail} caso(s) reprovado(s)`);
  if (skipped) problems.push(`${skipped} caso(s) pulado(s) — skip não é prova`);
  if (todo) problems.push(`${todo} caso(s) marcado(s) como todo`);
  if (pass !== null && pass < MINIMUM_CASES) problems.push(`apenas ${pass} caso(s) aprovado(s); a prova EXT-07 exige ao menos ${MINIMUM_CASES}`);
  return { pass, fail, skipped, todo, problems };
}

const database = "seg_qa_ext07";
const port = await freeLoopbackPort();
const directory = await mkdtemp(path.join(tmpdir(), "seg-qa-ext07-pg-"));
const password = randomBytes(24).toString("hex");
const redact = value => String(value ?? "").replaceAll(password, "[redacted]");
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, "data"),
  port, user: "seg_qa", password, persistent: false,
  postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  onLog: () => {},
  onError: error => console.error("QA_PG_ENGINE_ERROR", redact(error).slice(0, 300)),
});

let result = 1;
let pool;
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase(database);
  const url = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
  console.log(`QA_PG_READY: 127.0.0.1:${port}/${database}; cluster PostgreSQL 17 temporário exclusivo; segredo omitido.`);

  const migrated = await run(["scripts/migrate-site-visual.mjs"], { DATABASE_MIGRATION_URL: url, DATABASE_URL: "", QA_MIGRATION_ONLY: "true" });
  if (migrated.code !== 0) throw new Error(`migrations_failed_exit_${migrated.code}`);

  pool = new pg.Pool({ connectionString: url, max: 2 });
  const applied = (await pool.query("SELECT count(*)::int n FROM __migrations")).rows[0].n;
  const onDisk = (await readdir(path.join(root, "db/migrations"))).filter(name => name.endsWith(".sql")).length;
  const version = (await pool.query("SELECT version() v")).rows[0].v;
  console.log(`EXT07_MIGRATIONS: applied=${applied} on_disk=${onDisk} expected=${EXPECTED_MIGRATIONS}`);
  console.log(`EXT07_PG_VERSION: ${version.split(",")[0]}`);
  if (applied !== EXPECTED_MIGRATIONS || onDisk !== EXPECTED_MIGRATIONS) {
    throw new Error(`migration_count_mismatch applied=${applied} on_disk=${onDisk} expected=${EXPECTED_MIGRATIONS}`);
  }
  const hardening = (await pool.query("SELECT count(*)::int n FROM __migrations WHERE filename=$1", ["154-ext07-compliance-hardening.sql"])).rows[0].n;
  if (hardening !== 1) throw new Error("migration_154_missing");
  await pool.end();
  pool = null;

  // A suíte abre o servidor HTTP real (BIND_HOST=0.0.0.0) em porta temporária,
  // cria identidade/sessão staff sintéticas e exercita a jornada por HTTP.
  const executed = await run(["--test", "--test-concurrency=1", ...SUITES], {
    RUN_DATABASE_INTEGRATION: "1",
    QA_EXT07_REQUIRE_DB: "1",
    RUN_DATABASE_INTEGRATION_REMOTE: "",
    DATABASE_URL: url,
    DATABASE_MIGRATION_URL: "",
    QA_PGLITE_ONLY: "",
    ALLOW_REMOTE_MIGRATIONS: "",
    OLLAMA_ENABLED: "false",
    MAIL_HOST: "",
    NEXT_TELEMETRY_DISABLED: "1",
  });
  result = executed.code;
  const summary = auditTap(executed.output);
  console.log(`EXT07_TAP_SUMMARY: pass=${summary.pass} fail=${summary.fail} skipped=${summary.skipped} todo=${summary.todo} minimo_exigido=${MINIMUM_CASES}`);
  console.log(`EXT07_GATE_SCOPE: http_real=true pg17_temporario=true migracoes=${EXPECTED_MIGRATIONS}/${EXPECTED_MIGRATIONS} dados=.invalid`);
  if (summary.problems.length) {
    console.error(`EXT07_GATE_REJECTED: ${summary.problems.join("; ")}`);
    result = result || 1;
  }
  console.log(`EXT07_COMPLIANCE_TEST_EXIT: ${result}`);
} catch (error) {
  console.error("QA_PG_FAILED", redact(error?.message || error).slice(0, 600));
  result = 1;
} finally {
  await pool?.end().catch(() => {});
  await postgres.stop().catch(() => {});
  await rm(directory, { recursive: true, force: true }).catch(() => {});
  console.log("QA_EXT07_PG_TEMP_CLEANED: true");
}
process.exit(result);
