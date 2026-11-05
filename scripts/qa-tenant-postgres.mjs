#!/usr/bin/env node
// TENANT-SEG-001: PostgreSQL real, descartável e exclusivamente local.
// Nunca conecta a DATABASE_URL/host configurado pelo operador nem a produção.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { releaseSignalHandlers } from './qa-generated-files-guard.mjs';

const clientAccess = process.argv.length === 3 && process.argv[2] === '--client-access';
if ((process.argv.length > 2 && !clientAccess) || process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('QA_PG_REFUSED: unset DATABASE_URL, DATABASE_MIGRATION_URL and RUN_DATABASE_INTEGRATION_REMOTE before running this local-only test.');
  process.exit(2);
}

// Piloto: a dependência e seus hooks só existem no worker, nunca no supervisor.
// Windows mantém o caminho anterior, sem declarar hardening POSIX validado lá.
const supervised = process.env.QA_PG_SUPERVISED === '1' && !!process.send;
if (process.platform !== 'win32' && !supervised) {
  releaseSignalHandlers();
  const { superviseLocalPg } = await import('./lib/qa-pg-supervisor.mjs');
  const result = await superviseLocalPg({
    entry: path.resolve(import.meta.filename), args: clientAccess ? ['--client-access'] : [],
  });
  process.exit(result.code);
}
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const phase = name => { if (supervised) process.send({ type: 'phase', name }); };

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
const directory = supervised ? process.env.QA_PG_DIRECTORY : await mkdtemp(path.join(tmpdir(), 'seg-qa-tenant-pg-'));
if (!directory) throw new Error('qa_pg_sandbox_missing');
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
  phase('initialise');
  await postgres.initialise();
  phase('start');
  await postgres.start();
  phase('create');
  if (supervised) {
    // Client explícito IPv4, com limites de conexão/query/statement e fechamento.
    const { default: pg } = await import('pg');
    const client = new pg.Client({ host: '127.0.0.1', port, user: 'seg_qa', password,
      database: 'postgres', connectionTimeoutMillis: 5_000, query_timeout: 5_000, statement_timeout: 5_000 });
    let clientError = false;
    client.on('error', () => { clientError = true; }); // não deixar erro ocioso virar uncaughtException
    try { await client.connect(); await client.query(`CREATE DATABASE ${client.escapeIdentifier(database)}`); }
    finally { await client.end(); }
    if (clientError) throw new Error('qa_pg_create_client_error');
  } else { await postgres.createDatabase(database); }
  console.log(`QA_PG_READY: 127.0.0.1:${port}/${database}; cluster temporário exclusivo; segredo omitido.`);
  phase('test');
  const child = spawn(process.execPath, ['--test', '--test-concurrency=1', clientAccess ? 'tests/client-access.integration.test.mjs' : 'tests/client-space.integration.test.mjs'], {
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
  console.log(`${clientAccess ? 'CLIENT_ACCESS_PG' : 'TENANT_SEG_001'}_TEST_EXIT: ${result}`);
} catch (error) {
  console.error('QA_PG_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 500));
  result = 1;
} finally {
  phase('stop');
  try { await postgres.stop(); } catch (error) {
    console.error('QA_PG_STOP_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 300));
    result = 1;
  }
  if (!supervised) {
    await rm(directory, { recursive: true, force: true }); // somente o mkdtemp próprio
    console.log('QA_PG_TEMP_CLEANED: true');
  }
}
// embedded-postgres usa async-exit-hook, que pode limpar process.exitCode; sair explicitamente
// APÓS o stop/cleanup impede falso verde quando o teste filho falha.
if (supervised) {
  phase('done');
  await new Promise(resolve => process.send({ type: 'complete', code: result }, resolve));
}
process.exit(result);
