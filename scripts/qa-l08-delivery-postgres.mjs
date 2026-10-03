#!/usr/bin/env node
// L08 consolidated gate: disposable PostgreSQL, real HTTP and the existing
// client portal integration journeys. It deliberately reuses the legacy portal
// contract instead of creating a second, ambiguous source of truth.
import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { symlinkSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
// embedded-postgres ships libpq/ICU beside the native binaries; expose that
// directory explicitly on minimal GitHub runners and local QA images.
const embeddedNativeLib = path.join(root, "node_modules", "@embedded-postgres", "linux-x64", "native", "lib");
for (const [soname, file] of [["libpq.so.5", "libpq.so.5.17"], ["libicuuc.so.60", "libicuuc.so.60.2"], ["libicui18n.so.60", "libicui18n.so.60.2"], ["libicudata.so.60", "libicudata.so.60.2"]]) {
  const link = path.join(embeddedNativeLib, soname);
  if (!existsSync(link)) { try { symlinkSync(file, link); } catch {} }
}
process.env.LD_LIBRARY_PATH = [embeddedNativeLib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === "1") {
  console.error("QA_PG_REFUSED: clear DATABASE_URL, DATABASE_MIGRATION_URL and RUN_DATABASE_INTEGRATION_REMOTE.");
  process.exit(2);
}
const freePort = () => new Promise((resolve, reject) => {
  const server = createServer(); server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); });
});
const run = (command, args, env) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: "inherit" });
  child.once("error", reject); child.once("exit", code => resolve(code ?? 1));
});
const database = "seg_qa_l08";
const port = await freePort();
const directory = await mkdtemp(path.join(tmpdir(), "seg-qa-l08-pg-"));
const password = randomBytes(24).toString("hex");
const postgres = new EmbeddedPostgres({ databaseDir: path.join(directory, "data"), port, user: "seg_qa", password, persistent: false, postgresFlags: ["-c", "listen_addresses=127.0.0.1"], onLog: () => {}, onError: error => console.error("QA_PG_ENGINE_ERROR", String(error).replaceAll(password, "[redacted]").slice(0, 300)) });
let result = 1;
try {
  await postgres.initialise(); await postgres.start(); await postgres.createDatabase(database);
  const databaseUrl = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
  console.log(`QA_L08_PG_READY: 127.0.0.1:${port}/${database}; temporary isolated cluster; secret omitted.`);
  console.log("QA_L08_SCOPE: CLI-01..05 canonical legacy portal; full access journey, fail-closed atomic audit, A/B isolation, pre-header private-download audit, ticket/document idempotency and real Chromium entry; CLI-06..15, EXT-01..17 and v2 APIs not promoted.");
  result = await run(process.execPath, ["--test", "--test-concurrency=1", "tests/l08-delivery.integration.test.mjs"], {
    RUN_DATABASE_INTEGRATION: "1", DATABASE_URL: databaseUrl, DATABASE_MIGRATION_URL: "", RUN_DATABASE_INTEGRATION_REMOTE: "", QA_PGLITE_ONLY: "", ALLOW_REMOTE_MIGRATIONS: "", OLLAMA_ENABLED: "false", MAIL_HOST: "", NEXT_TELEMETRY_DISABLED: "1", CLIENT_DOCS_DIR: path.join(directory, "private-documents"), AWS_EXECUTION_ENV: "AWS_Lambda_nodejs22.x",
  });
  console.log(`L08_DELIVERY_TEST_EXIT: ${result}`);
} catch (error) { console.error("QA_L08_PG_FAILED", String(error?.message || error).replaceAll(password, "[redacted]").slice(0, 500)); result = 1; }
finally { try { await postgres.stop(); } catch (error) { console.error("QA_L08_PG_STOP_FAILED", String(error).slice(0, 300)); result = 1; } await rm(directory, { recursive: true, force: true }); console.log("QA_L08_PG_TEMP_CLEANED: true"); }
process.exit(result);
