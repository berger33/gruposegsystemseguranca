#!/usr/bin/env node
// TENANT-SEG-003 / PLT-AUD-003: somente cluster novo PG loopback; nunca URL de operador.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.ALLOW_REMOTE_MIGRATIONS === 'true' || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('QA_CLI_V2_REFUSED: unset database URLs and remote migrations before local-only QA.');
  process.exit(2);
}
const objectContract = process.env.QA_CLI_V2_OBJECT_CONTRACT === '1';
if (objectContract && process.env.CLIENT_DOCS_DIR) {
  console.error('QA_CLI_V2_REFUSED: unset CLIENT_DOCS_DIR for synthetic-object QA.');
  process.exit(2);
}

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
const directory = await mkdtemp(path.join(tmpdir(), 'seg-qa-cli-v2-pg-'));
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

let result = 1;
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase(database);
  console.log(`QA_CLI_V2_READY: 127.0.0.1:${port}/${database}; senha omitida; cluster novo.`);
  const migrated = await run(['scripts/migrate-site-visual.mjs']);
  if (migrated !== 0) throw new Error(`qa_cli_v2_migrations_failed_exit_${migrated}`);
  console.log('QA_CLI_V2_MIGRATIONS: 98/98 on disposable database');
  if (objectContract) {
    result = await run(['--test', 'tests/qa-cli-v2-object-pg.integration.test.mjs'],
      { RUN_CLI_V2_OBJECT_QA: '1', QA_MIGRATION_ONLY: '' });
    console.log(`QA_CLI_V2_OBJECT_TEST_EXIT: ${result}`);
  } else {
    result = await run(['--test', 'tests/cli-v2.integration.test.mjs'], { RUN_CLI_V2_QA: '1', QA_MIGRATION_ONLY: '' });
    console.log(`QA_CLI_V2_TEST_EXIT: ${result}`);
  }
} catch (error) {
  console.error('QA_CLI_V2_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 400));
  result = 1;
} finally {
  try { await postgres.stop(); } catch (error) {
    console.error('QA_PG_STOP_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 300));
    result = 1;
  }
  await rm(directory, { recursive: true, force: true });
  console.log('QA_CLI_V2_TEMP_CLEANED: true');
}
process.exit(result);
