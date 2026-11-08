#!/usr/bin/env node
// UX-07 inteligência comercial: PostgreSQL descartável + Chromium single-process.
// Falhas de navegador são injetadas exclusivamente por page.addInitScript.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { snapshotGeneratedFiles, restoreGeneratedFiles } from './qa-generated-files.mjs';
import { releaseSignalHandlers } from './qa-generated-files-guard.mjs';
import { assertTapSummary, collectTap } from './lib/qa-tap-summary.mjs';
if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') { console.error('QA_PG_REFUSED: banco do operador ou remoto definido.'); process.exit(2); }
const root = path.resolve(import.meta.dirname, '..');
// Grupo 05W: resultado e jornadas originais sob contenção POSIX.
const supervised = process.env.QA_PG_SUPERVISED === '1' && !!process.send;
if (process.platform !== 'win32' && !supervised) {
  releaseSignalHandlers();
  const { superviseLocalPg, PG_PHASE_LIMITS } = await import('./lib/qa-pg-supervisor.mjs');
  const generatedSnapshot = await snapshotGeneratedFiles();
  let result;
  try {
    result = await superviseLocalPg({ entry: path.resolve(import.meta.filename),
      args: process.argv.slice(2), limits: { ...PG_PHASE_LIMITS, migrate: 90_000, test: 300_000 } });
  } finally {
    await restoreGeneratedFiles(generatedSnapshot);
    console.log('QA_UX_INTEL_GENERATED_FILES_RESTORED: true');
  }
  process.exit(result.code);
}
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const phase = name => { if (supervised) process.send({ type: 'phase', name }); };

const embeddedLib = path.join(root, 'node_modules/@embedded-postgres/linux-x64/native/lib');
process.env.LD_LIBRARY_PATH = [embeddedLib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
for (const [target, link] of [['libpq.so.5.17', 'libpq.so.5'], ['libicuuc.so.60.2', 'libicuuc.so.60'], ['libicui18n.so.60.2', 'libicui18n.so.60'], ['libicudata.so.60.2', 'libicudata.so.60']]) await symlink(target, path.join(embeddedLib, link)).catch(() => {});
const port = await new Promise((resolve, reject) => { const s = createServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const dir = supervised ? process.env.QA_PG_DIRECTORY : await mkdtemp(path.join(tmpdir(), 'seg-qa-ux-intel-'));
if (!dir) throw new Error('qa_pg_sandbox_missing');
const password = randomBytes(24).toString('hex'); const database = 'seg_qa_ux_intel';
const pg = new EmbeddedPostgres({ databaseDir: path.join(dir, 'data'), port, user: 'seg_qa', password, persistent: false, postgresFlags: ['-c', 'listen_addresses=127.0.0.1'], onLog: () => {}, onError: e => console.error('QA_PG_ENGINE_ERROR', String(e).replaceAll(password, '[redacted]').slice(0, 300)) });
const run = async (args, env, tap) => {
  if (tap) {
    const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const journey = await collectTap(child);
    const tapResult = assertTapSummary(journey.output, { minimum: tap.minimum, truncated: journey.truncated, label: tap.label });
    return journey.code === 0 && tapResult.ok ? 0 : (journey.code || 1);
  }
  return new Promise((resolve, reject) => { const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' }); child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
};
let result = 1;
try {
  phase('initialise');
  await pg.initialise();
  phase('start');
  await pg.start();
  phase('create');
  if (supervised) {
    const { createLocalQaDatabase } = await import('./lib/qa-pg-supervisor.mjs');
    await createLocalQaDatabase({ port, user: 'seg_qa', password, database });
  } else { await pg.createDatabase(database); }
  const url = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
  console.log(`QA_PG_READY: 127.0.0.1:${port}/${database}; cluster temporário exclusivo; segredo omitido.`);
  phase('migrate');
  const migrated = await run(['scripts/migrate-site-visual.mjs'], { DATABASE_MIGRATION_URL: url, DATABASE_URL: '', QA_MIGRATION_ONLY: 'true' });
  if (migrated !== 0) throw new Error(`migrations_failed_exit_${migrated}`);
  phase('test');
  result = await run(['--test', '--test-concurrency=1', 'tests/ext14-intel.integration.test.mjs'], { RUN_DATABASE_INTEGRATION: '1', QA_EXT14_REQUIRE_DB: '1', DATABASE_URL: url, DATABASE_MIGRATION_URL: '', RUN_DATABASE_INTEGRATION_REMOTE: '', QA_PGLITE_ONLY: '', ALLOW_REMOTE_MIGRATIONS: '', OLLAMA_ENABLED: 'false', MAIL_HOST: '', NEXT_TELEMETRY_DISABLED: '1', AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x' }, { minimum: 18, label: 'UX intel' });
} catch (error) { console.error('QA_PG_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 600)); result = 1; }
finally {
  phase('stop');
  try { await pg.stop(); } catch (error) {
    if (supervised) {
      console.error('QA_PG_STOP_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 300));
      result = 1;
    }
  }
  if (!supervised) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    console.log('QA_UX_INTEL_TEMP_CLEANED: true');
  }
}
if (supervised) {
  phase('done');
  await new Promise(resolve => process.send({ type: 'complete', code: result }, resolve));
}
process.exit(result);
