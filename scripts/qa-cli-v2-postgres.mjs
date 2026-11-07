#!/usr/bin/env node
// TENANT-SEG-003 / PLT-AUD-003: somente cluster novo PG loopback; nunca URL de operador.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { releaseSignalHandlers } from './qa-generated-files-guard.mjs';
import { assertTapSummary, collectTap } from './lib/qa-tap-summary.mjs';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.ALLOW_REMOTE_MIGRATIONS === 'true' || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('QA_CLI_V2_REFUSED: unset database URLs and remote migrations before local-only QA.');
  process.exit(2);
}
const objectContract = process.env.QA_CLI_V2_OBJECT_CONTRACT === '1';
if (objectContract && process.env.CLIENT_DOCS_DIR) {
  console.error('QA_CLI_V2_REFUSED: unset CLIENT_DOCS_DIR for synthetic-object QA.');
  process.exit(2);
}

// Grupo 05A: supervisor POSIX; Windows mantém o caminho de lifecycle anterior.
const supervised = process.env.QA_PG_SUPERVISED === '1' && !!process.send;
if (process.platform !== 'win32' && !supervised) {
  releaseSignalHandlers();
  const { superviseLocalPg, PG_PHASE_LIMITS } = await import('./lib/qa-pg-supervisor.mjs');
  const result = await superviseLocalPg({ entry: path.resolve(import.meta.filename),
    args: process.argv.slice(2), limits: { ...PG_PHASE_LIMITS, migrate: 90_000, test: 180_000 } });
  if (result.cleaned) console.log('QA_CLI_V2_TEMP_CLEANED: true');
  process.exit(result.code);
}
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const phase = name => { if (supervised) process.send({ type: 'phase', name }); };

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const port = await freePort();
const directory = supervised ? process.env.QA_PG_DIRECTORY : await mkdtemp(path.join(tmpdir(), 'seg-qa-cli-v2-pg-'));
if (!directory) throw new Error('qa_pg_sandbox_missing');
const password = randomBytes(24).toString('hex');
const database = 'seg_qa_cli_v2';
const connectionString = `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`;
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, 'data'), port, user: 'seg_qa', password,
  persistent: false, postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog: () => {},
  onError: error => console.error('QA_PG_ENGINE_ERROR', String(error).replaceAll(password, '[redacted]').slice(0, 300)),
});
const cwd = path.resolve(import.meta.dirname, '..');
async function run(args, extraEnv) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, DATABASE_URL: '', DATABASE_MIGRATION_URL: connectionString,
      QA_MIGRATION_ONLY: 'true', ALLOW_REMOTE_MIGRATIONS: '', RUN_DATABASE_INTEGRATION_REMOTE: '',
      MAIL_HOST: '', OLLAMA_ENABLED: 'false', NEXT_TELEMETRY_DISABLED: '1', ...extraEnv },
    stdio: 'inherit',
  });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
}

// Fatia 06B: o recorte de jornada (11 casos no CLI-09, 1 no contrato de objeto)
// passou a auditar o resumo TAP; migração continua no caminho simples porque
// migração não é jornada. Sem isto, arquivo todo `skip` sairia com código 0.
async function runJourney(args, extraEnv) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...process.env, DATABASE_URL: '', DATABASE_MIGRATION_URL: connectionString,
      QA_MIGRATION_ONLY: 'true', ALLOW_REMOTE_MIGRATIONS: '', RUN_DATABASE_INTEGRATION_REMOTE: '',
      MAIL_HOST: '', OLLAMA_ENABLED: 'false', NEXT_TELEMETRY_DISABLED: '1', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return collectTap(child);
}

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
  console.log(`QA_CLI_V2_READY: 127.0.0.1:${port}/${database}; senha omitida; cluster novo.`);
  phase('migrate');
  const migrated = await run(['scripts/migrate-site-visual.mjs']);
  if (migrated !== 0) throw new Error(`qa_cli_v2_migrations_failed_exit_${migrated}`);
  const migracoesNoDisco = (await readdir(path.join(cwd, 'db/migrations'))).filter(f => /^\d{3}-.*\.sql$/.test(f)).length;
  console.log(`QA_CLI_V2_MIGRATIONS: ${migracoesNoDisco}/${migracoesNoDisco} on disposable database`);
  phase('test');
  if (objectContract) {
    const journey = await runJourney(['--test', 'tests/qa-cli-v2-object-pg.integration.test.mjs'],
      { RUN_CLI_V2_OBJECT_QA: '1', QA_MIGRATION_ONLY: '' });
    result = journey.code;
    console.log(`QA_CLI_V2_OBJECT_TEST_EXIT: ${result}`);
    if (result === 0 && !assertTapSummary(journey.output, { minimum: 1, truncated: journey.truncated, label: 'CLI-04 objeto' }).ok) result = 1;
  } else {
    const journey = await runJourney(['--test', 'tests/cli-v2.integration.test.mjs'], { RUN_CLI_V2_QA: '1', QA_MIGRATION_ONLY: '' });
    result = journey.code;
    console.log(`QA_CLI_V2_TEST_EXIT: ${result}`);
    if (result === 0 && !assertTapSummary(journey.output, { minimum: 11, truncated: journey.truncated, label: 'CLI-09' }).ok) result = 1;
  }
} catch (error) {
  console.error('QA_CLI_V2_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 400));
  result = 1;
} finally {
  phase('stop');
  try { await postgres.stop(); } catch (error) {
    console.error('QA_PG_STOP_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 300));
    result = 1;
  }
  if (!supervised) {
    await rm(directory, { recursive: true, force: true });
    console.log('QA_CLI_V2_TEMP_CLEANED: true');
  }
}
if (supervised) {
  phase('done');
  await new Promise(resolve => process.send({ type: 'complete', code: result }, resolve));
}
process.exit(result);
