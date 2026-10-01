#!/usr/bin/env node
// L07 delivery gate: isolated PostgreSQL, real HTTP and Chromium. Never uses a
// caller-provided database, so synthetic financial data cannot touch user data.
import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === "1") {
  console.error("QA_PG_REFUSED: clear DATABASE_URL, DATABASE_MIGRATION_URL and RUN_DATABASE_INTEGRATION_REMOTE."); process.exit(2);
}
const root = path.resolve(import.meta.dirname, "..");
const nextDistDir = path.join(root, ".next", "integration-l07");
const freePort = () => new Promise((resolve, reject) => { const server = createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); }); });
const run = (command, args, env) => new Promise((resolve, reject) => { const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: "inherit" }); child.once("error", reject); child.once("exit", code => resolve(code ?? 1)); });
const database = "seg_qa_l07"; const port = await freePort(); const directory = await mkdtemp(path.join(tmpdir(), "seg-qa-l07-pg-")); const password = randomBytes(24).toString("hex");
const postgres = new EmbeddedPostgres({ databaseDir: path.join(directory, "data"), port, user: "seg_qa", password, persistent: false, postgresFlags: ["-c", "listen_addresses=127.0.0.1"], onLog: () => {}, onError: error => console.error("QA_PG_ENGINE_ERROR", String(error).replaceAll(password, "[redacted]").slice(0, 300)) });
let result = 1;
try {
  await rm(nextDistDir, { recursive: true, force: true });
  await postgres.initialise(); await postgres.start(); await postgres.createDatabase(database);
  const databaseUrl = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
  console.log(`QA_L07_PG_READY: 127.0.0.1:${port}/${database}; temporary isolated cluster; secret omitted.`);
  console.log("QA_L07_SCOPE: 12 serial subtests (FIN-01..04 regression + FIN-05 + FIN-06 + FIN-07); real HTTP, PostgreSQL and packaged Chromium; synthetic data only.");
  if (await run(process.execPath, ["scripts/migrate-site-visual.mjs"], { DATABASE_MIGRATION_URL: databaseUrl, DATABASE_URL: "", QA_MIGRATION_ONLY: "true" }) !== 0) throw new Error("migrations_failed");
  result = await run(process.execPath, ["--test", "--test-concurrency=1", "tests/l07-delivery.integration.test.mjs"], { RUN_DATABASE_INTEGRATION: "1", DATABASE_URL: databaseUrl, DATABASE_MIGRATION_URL: "", RUN_DATABASE_INTEGRATION_REMOTE: "", QA_PGLITE_ONLY: "", ALLOW_REMOTE_MIGRATIONS: "", OLLAMA_ENABLED: "false", MAIL_HOST: "", NEXT_TELEMETRY_DISABLED: "1", CLIENT_DOCS_DIR: path.join(directory, "private-documents"), AWS_EXECUTION_ENV: "AWS_Lambda_nodejs22.x" });
  console.log(`L07_DELIVERY_TEST_EXIT: ${result}`);
} catch (error) { console.error("QA_L07_PG_FAILED", String(error?.message || error).replaceAll(password, "[redacted]").slice(0, 500)); result = 1; }
finally {
  try { await postgres.stop(); } catch (error) { console.error("QA_L07_PG_STOP_FAILED", String(error).slice(0, 300)); result = 1; }
  try { await rm(nextDistDir, { recursive: true, force: true }); console.log("QA_L07_NEXT_DIST_CLEANED: true"); } catch (error) { console.error("QA_L07_NEXT_DIST_CLEANUP_FAILED", String(error).slice(0, 300)); result = 1; }
  await rm(directory, { recursive: true, force: true }); console.log("QA_L07_PG_TEMP_CLEANED: true");
}
process.exit(result);
