#!/usr/bin/env node
// F03 gate: conta → baixa → relatório (financeiro), com PostgreSQL
// 17 descartável, seed canônico, HTTP real e Chromium. Recusa banco do operador.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { seedFreshDemo } from './local-demo-seed.mjs';

if (process.env.DATABASE_URL || process.env.DATABASE_MIGRATION_URL || process.env.RUN_DATABASE_INTEGRATION_REMOTE === '1') {
  console.error('QA_F03_FINANCE_REFUSED: DATABASE_URL, DATABASE_MIGRATION_URL e banco remoto são proibidos neste gate.');
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, '..');
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
const run = (command, args, env, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: options.stdio || 'inherit' });
  child.once('error', reject);
  child.once('exit', code => resolve(code ?? 1));
});
const waitForHealth = async (url, child) => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('f03_finance_server_exited_before_health');
    try {
      const response = await fetch(`${url}/api/health/live`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error('f03_finance_server_health_timeout');
};

const pgPort = await freePort();
const webPort = await freePort();
const directory = await mkdtemp(path.join(tmpdir(), 'seg-qa-f03-finance-'));
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
  onError: error => console.error('QA_F03_FINANCE_PG_ERROR', String(error).replaceAll(password, '[redacted]').slice(0, 300)),
});
let server;
let pool;
let result = 1;
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase(database);
  console.log(`QA_F03_FINANCE_PG_READY: PostgreSQL 17 descartável em 127.0.0.1:${pgPort}/${database}; segredo omitido.`);

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
  if (migrated !== 0) throw new Error(`f03_finance_migrations_failed_exit_${migrated}`);

  pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
  const seeded = await seedFreshDemo(pool, installationId, {
    mode: 'isolated-local-demo',
    databaseName: database,
  });
  if (!seeded.credentials.length || seeded.credentials.length !== 10) {
    throw new Error('f03_seed_credentials_missing_or_unexpected');
  }
  await writeFile(credentialsFile, JSON.stringify(seeded.credentials), { mode: 0o600 });
  await chmod(credentialsFile, 0o600);

  const env = {
    DATABASE_URL: databaseUrl,
    DATABASE_MIGRATION_URL: '',
    PORT: String(webPort),
    BIND_HOST: '127.0.0.1',
    NODE_ENV: 'development',
    NEXT_DIST_DIR: '.next/integration-f03-finance',
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
  result = await run(process.execPath, ['--test', '--test-concurrency=1', 'tests/f03-accounts-settlement-report.integration.test.mjs'], {
    ...env,
    RUN_DATABASE_INTEGRATION: '1',
    F03_BASE_URL: baseUrl,
    F03_CREDENTIALS_FILE: credentialsFile,
  });
  console.log(`F03_ACCOUNTS_SETTLEMENT_REPORT_TEST_EXIT: ${result}`);
} catch (error) {
  console.error('QA_F03_FINANCE_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 800));
  result = 1;
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 500));
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  await pool?.end().catch(() => { result = 1; });
  try { await postgres.stop(); } catch (error) {
    console.error('QA_F03_FINANCE_PG_STOP_FAILED', String(error?.message || error).replaceAll(password, '[redacted]').slice(0, 300));
    result = 1;
  }
  await rm(directory, { recursive: true, force: true });
  console.log('QA_F03_FINANCE_TEMP_CLEANED: true');
}
process.exit(result);
