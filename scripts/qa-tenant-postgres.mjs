#!/usr/bin/env node
// TENANT-SEG-001: PostgreSQL real, descartável e exclusivamente local.
// Nunca conecta a DATABASE_URL/host configurado pelo operador nem a produção.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('QA_PG_REFUSED: unset DATABASE_URL, DATABASE_MIGRATION_URL and RUN_DATABASE_INTEGRATION_REMOTE before running this local-only test.');
  process.exit(2);
}

async function freeLoopbackPort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const database = 'seg_qa_tenant';
const port = await freeLoopbackPort();
const directory = await mkdtemp(path.join(tmpdir(), 'seg-qa-tenant-pg-'));
const password = randomBytes(24).toString('hex');
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, 'data'),
  port, user: 'seg_qa', password, persistent: false,
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog: () => {}, // não registrar senhas nem dados de teste do DB
  onError: error => console.error('QA_PG_ENGINE_ERROR', String(error).replaceAll(password, '[redacted]').slice(0, 300)),
});
let result = 1;
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase(database);
  console.log(`QA_PG_READY: 127.0.0.1:${port}/${database}; cluster temporário exclusivo; segredo omitido.`);
  const child = spawn(process.execPath, ['--test', '--test-concurrency=1', 'tests/client-space.integration.test.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      RUN_DATABASE_INTEGRATION: '1', RUN_DATABASE_INTEGRATION_REMOTE: '',
      DATABASE_URL: `postgresql://seg_qa:${password}@127.0.0.1:${port}/${database}`,
      DATABASE_MIGRATION_URL: '', QA_PGLITE_ONLY: '', ALLOW_REMOTE_MIGRATIONS: '',
      OLLAMA_ENABLED: 'false', MAIL_HOST: '', NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: 'inherit',
  });
  result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  console.log(`TENANT_SEG_001_TEST_EXIT: ${result}`);
} catch (error) {
  console.error('QA_PG_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 500));
  result = 1;
} finally {
  try { await postgres.stop(); } catch (error) {
    console.error('QA_PG_STOP_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 300));
    result = 1;
  }
  await rm(directory, { recursive: true, force: true }); // somente o diretório criado com mkdtemp acima
  console.log('QA_PG_TEMP_CLEANED: true');
}
// embedded-postgres usa async-exit-hook, que pode limpar process.exitCode; sair explicitamente
// APÓS o stop/cleanup impede falso verde quando o teste filho falha.
process.exit(result);
