#!/usr/bin/env node
// F03 gate: funcionário → solicitação → análise RH → retorno, com PostgreSQL
// 17 descartável, seed canônico, HTTP real e Chromium. Recusa banco do operador.
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { seedFreshDemo } from './local-demo-seed.mjs';
import { releaseSignalHandlers } from './qa-generated-files-guard.mjs';
import { assertTapSummary, collectTap } from './lib/qa-tap-summary.mjs';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('QA_F03_EMPLOYEE_REFUSED: DATABASE_URL, DATABASE_MIGRATION_URL e banco remoto são proibidos neste gate.');
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, '..');
// Grupo 05M: seed canônico preservado; contenção POSIX antes da biblioteca.
const supervised = process.env.QA_PG_SUPERVISED === '1' && !!process.send;
if (process.platform !== 'win32' && !supervised) {
  releaseSignalHandlers();
  const { superviseLocalPg, PG_PHASE_LIMITS } = await import('./lib/qa-pg-supervisor.mjs');
  const result = await superviseLocalPg({ entry: path.resolve(import.meta.filename),
    args: process.argv.slice(2), limits: { ...PG_PHASE_LIMITS, migrate: 90_000, test: 600_000 } });
  if (result.cleaned) console.log('QA_F03_EMPLOYEE_TEMP_CLEANED: true');
  process.exit(result.code);
}
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const phase = name => { if (supervised) process.send({ type: 'phase', name }); };

const database = 'seg_demo_local';
const installationId = randomUUID();
const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const port = probe.address().port;
    probe.close(() => resolve(port));
  });
});
const run = async (command, args, env, tap) => {
  if (tap) {
    const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const journey = await collectTap(child);
    const tapResult = assertTapSummary(journey.output, { minimum: tap.minimum, truncated: journey.truncated, label: tap.label });
    return journey.code === 0 && tapResult.ok ? 0 : (journey.code || 1);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
};
const waitForHealth = async (url, child) => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('f03_employee_server_exited_before_health');
    try {
      const response = await fetch(`${url}/api/health/live`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error('f03_employee_server_health_timeout');
};

const pgPort = await freePort();
const webPort = await freePort();
const directory = supervised ? process.env.QA_PG_DIRECTORY : await mkdtemp(path.join(tmpdir(), 'seg-qa-f03-employee-'));
if (!directory) throw new Error('qa_pg_sandbox_missing');
const password = randomBytes(24).toString('hex');
const databaseUrl = `postgresql://seg_demo:${password}@127.0.0.1:${pgPort}/${database}`;
const baseUrl = `http://127.0.0.1:${webPort}`;
const credentialsFile = path.join(directory, 'credentials.json');
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, 'data'),
  port: pgPort,
  user: 'seg_demo',
  password,
  persistent: false,
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog: () => {},
  onError: error => console.error('QA_F03_EMPLOYEE_PG_ERROR', String(error).replaceAll(password, '[redacted]').slice(0, 300)),
});
let server;
let pool;
let poolFailed = false;
let result = 1;
try {
  phase('initialise');
  await postgres.initialise();
  phase('start');
  await postgres.start();
  phase('create');
  if (supervised) await createF03Database();
  else await postgres.createDatabase(database);
  console.log(`QA_F03_EMPLOYEE_PG_READY: PostgreSQL 17 descartável em 127.0.0.1:${pgPort}/${database}; segredo omitido.`);

  phase('migrate');
  const migrationEnv = {
    DATABASE_MIGRATION_URL: databaseUrl,
    DATABASE_URL: '',
    // The canonical local-demo seed is deliberately authorized only for
    // seg_demo_local. This runner is still fully disposable and loopback-only;
    // the normal seg_qa_* migration guard would reject the canonical seed name.
    QA_MIGRATION_ONLY: '',
    SEG_LOCAL_DEMO_ONLY: 'true',
    ALLOW_REMOTE_MIGRATIONS: '',
    QA_PGLITE_ONLY: '',
  };
  const migrated = await run(process.execPath, ['scripts/migrate-site-visual.mjs'], migrationEnv);
  if (migrated !== 0) throw new Error(`f03_employee_migrations_failed_exit_${migrated}`);

  pool = new pg.Pool({ connectionString: databaseUrl, max: 5,
    ...(supervised ? { connectionTimeoutMillis: 5_000, query_timeout: 30_000, statement_timeout: 30_000 } : {}) });
  if (supervised) pool.on('error', () => { poolFailed = true; });
  const seeded = await seedFreshDemo(pool, installationId, {
    mode: 'isolated-local-demo',
    databaseName: database,
  });
  if (!seeded.credentials.length || seeded.credentials.length !== 10) {
    throw new Error('f03_seed_credentials_missing_or_unexpected');
  }
  await writeFile(credentialsFile, JSON.stringify(seeded.credentials), { mode: 0o600 });
  await chmod(credentialsFile, 0o600);

  // A fase migrate inclui seed e gravação restrita; test inclui boot HTTP/browser.
  phase('test');
  const env = {
    DATABASE_URL: databaseUrl,
    DATABASE_MIGRATION_URL: '',
    PORT: String(webPort),
    BIND_HOST: '127.0.0.1',
    NODE_ENV: 'development',
    NEXT_DIST_DIR: '.next/integration-f03-employee',
    SITE_ADMIN_SESSION_SECRET: `${randomUUID()}${randomUUID()}`,
    EMPLOYEE_SESSION_SECRET: `${randomUUID()}${randomUUID()}`,
    ADMIN_LOGIN_MAX_ATTEMPTS: '200',
    LEAD_MAX_ATTEMPTS: '200',
    SITE_ADMIN_LEGACY_TOKENS: '',
    SITE_ADMIN_TOKEN_TI: '',
    SITE_ADMIN_TOKEN_MARCELO: '',
    OLLAMA_ENABLED: 'false',
    MAIL_HOST: '',
    CLIENT_DOCS_DIR: path.join(directory, 'private-documents'),
    NEXT_TELEMETRY_DISABLED: '1',
    AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x',
  };
  server = spawn(process.execPath, ['server.mjs', '--dev'], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', chunk => { if (process.env.QA_VERBOSE === '1') process.stdout.write(chunk); });
  server.stderr.on('data', chunk => {
    if (process.env.QA_VERBOSE === '1') process.stderr.write(chunk);
  });
  await waitForHealth(baseUrl, server);
  result = await run(process.execPath, ['--test', '--test-concurrency=1', 'tests/f03-employee-request-rh-return.integration.test.mjs'], {
    ...env,
    RUN_DATABASE_INTEGRATION: '1',
    F03_BASE_URL: baseUrl,
    F03_CREDENTIALS_FILE: credentialsFile,
  }, { minimum: 2, label: 'F03 employee-request' });
  console.log(`F03_EMPLOYEE_REQUEST_RH_RETURN_TEST_EXIT: ${result}`);
} catch (error) {
  console.error('QA_F03_EMPLOYEE_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 800));
  result = 1;
} finally {
  phase('stop');
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 500));
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  await pool?.end().catch(() => { result = 1; });
  if (poolFailed) result = 1;
  try { await postgres.stop(); } catch (error) {
    console.error('QA_F03_EMPLOYEE_PG_STOP_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 300));
    result = 1;
  }
  if (!supervised) {
    await rm(directory, { recursive: true, force: true });
    console.log('QA_F03_EMPLOYEE_TEMP_CLEANED: true');
  }
}
if (supervised) {
  phase('done');
  await new Promise(resolve => process.send({ type: 'complete', code: result }, resolve));
}
process.exit(result);

// Exceção local estrita para o nome exigido pelo seed; não relaxa o helper seg_qa_*.
async function createF03Database() {
  if (database !== 'seg_demo_local') throw new Error('f03_database_refused');
  const client = new pg.Client({ host: '127.0.0.1', port: pgPort, user: 'seg_demo', password,
    database: 'postgres', connectionTimeoutMillis: 5_000, query_timeout: 5_000, statement_timeout: 5_000 });
  let clientFailed = false;
  client.on('error', () => { clientFailed = true; });
  try { await client.connect(); await client.query(`CREATE DATABASE ${client.escapeIdentifier(database)}`); }
  finally { await client.end(); }
  if (clientFailed) throw new Error('f03_create_client_error');
}
