#!/usr/bin/env node
// UX-07 analytics (EXT-11 / F07): PostgreSQL descartável + Chromium single-process.
// Recusa banco do operador e execução remota; aplica as migrações 001–174 sem
// alterá-las; usa HTTP real. Falhas de navegador são injetadas exclusivamente
// por page.addInitScript sobre window.fetch, nunca derrubando o servidor.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') { console.error('QA_PG_REFUSED: banco do operador ou remoto definido.'); process.exit(2); }
const root = path.resolve(import.meta.dirname, '..');
const embeddedLib = path.join(root, 'node_modules/@embedded-postgres/linux-x64/native/lib');
process.env.LD_LIBRARY_PATH = [embeddedLib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
for (const [target, link] of [['libpq.so.5.17', 'libpq.so.5'], ['libicuuc.so.60.2', 'libicuuc.so.60'], ['libicui18n.so.60.2', 'libicui18n.so.60'], ['libicudata.so.60.2', 'libicudata.so.60']]) await symlink(target, path.join(embeddedLib, link)).catch(() => {});
const port = await new Promise((resolve, reject) => { const s = createServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const dir = await mkdtemp(path.join(tmpdir(), 'seg-qa-ux-analytics-')); const password = randomBytes(24).toString('hex'); const database = 'seg_qa_ux_analytics';
const pg = new EmbeddedPostgres({ databaseDir: path.join(dir, 'data'), port, user: 'seg_qa', password, persistent: false, postgresFlags: ['-c', 'listen_addresses=127.0.0.1'], onLog: () => {}, onError: e => console.error('QA_PG_ENGINE_ERROR', String(e).replaceAll(password, '[redacted]').slice(0, 300)) });
const run = (args, env) => new Promise((resolve, reject) => { const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' }); child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
let result = 1;
try {
  await pg.initialise(); await pg.start(); await pg.createDatabase(database);
  const url = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
  const migrated = await run(['scripts/migrate-site-visual.mjs'], { DATABASE_MIGRATION_URL: url, DATABASE_URL: '', QA_MIGRATION_ONLY: 'true' });
  if (migrated !== 0) throw new Error(`migrations_failed_exit_${migrated}`);
  result = await run(['--test', '--test-concurrency=1', 'tests/ext11-analytics.integration.test.mjs'], { RUN_DATABASE_INTEGRATION: '1', QA_EXT11_REQUIRE_DB: '1', DATABASE_URL: url, DATABASE_MIGRATION_URL: '', RUN_DATABASE_INTEGRATION_REMOTE: '', QA_PGLITE_ONLY: '', ALLOW_REMOTE_MIGRATIONS: '', OLLAMA_ENABLED: 'false', MAIL_HOST: '', NEXT_TELEMETRY_DISABLED: '1', AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x' });
} catch (error) { console.error('QA_PG_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 600)); result = 1; }
finally { await pg.stop().catch(() => {}); await rm(dir, { recursive: true, force: true }).catch(() => {}); console.log('QA_UX_ANALYTICS_TEMP_CLEANED: true'); }
process.exit(result);
