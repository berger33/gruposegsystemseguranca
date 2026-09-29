#!/usr/bin/env node
// QA-HOM-001..004: only a fresh, loopback, disposable PostgreSQL cluster.
// Never accept a caller-supplied DB, credentials or external service configuration.
// Keep preflight dependency-free: reject unsafe input before npm installation.
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from '../src/lib/client-auth-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verify = process.argv.includes('--verify');
const preflightOnly = process.argv.includes('--preflight');
const unsupported = process.argv.filter(arg => arg.startsWith('--') && !['--verify', '--preflight'].includes(arg));
const refused = ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'ALLOW_REMOTE_MIGRATIONS',
  'QA_PGLITE_ONLY', 'CLIENT_DOCS_DIR', 'PGLITE_DATA_DIR', 'PGHOST', 'PGSERVICE',
  'SITE_ADMIN_SESSION_SECRET', 'SITE_ADMIN_TOKEN_TI', 'SITE_ADMIN_TOKEN_MARCELO',
  'MAIL_HOST', 'MAIL_USER', 'MAIL_PASSWORD', 'OLLAMA_HOST', 'TRUST_PROXY', 'PUBLIC_BASE_URL'];

async function preflight() {
  if (unsupported.length || (verify && preflightOnly)) throw new Error('qa_unknown_option');
  if (process.versions.node.split('.')[0] !== '22') throw new Error('qa_requires_node_22');
  for (const key of refused) if (process.env[key]) throw new Error(`qa_env_refused_${key}`);
  for (const name of await readdir(root)) if (name === '.env' || name.startsWith('.env.')) {
    if (name !== '.env.example') throw new Error(`qa_env_file_refused_${name}`);
  }
  await access(path.join(root, 'db/migrations/096-ai-rag-feedback-custo-token-rollback.sql'));
  // A previous preview should not silently change the database or test credentials.
  console.log('QA_HOM_PREFLIGHT: loopback only, no external DB, SMTP, Ollama or .env files.');
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function assertWebPortFree() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error('qa_port_3000_busy_stop_the_old_preview')));
    server.listen(3000, '127.0.0.1', () => server.close(resolve));
  });
}

function randomPassword() { return randomBytes(24).toString('base64url'); }

async function seed(pool) {
  const identities = [
    { label: 'TI', email: 'ti.qa@example.invalid', role: 'ti', password: randomPassword() },
    { label: 'RH', email: 'rh.qa@example.invalid', role: 'rh', password: randomPassword() },
    { label: 'Admin de API (não Marcelo)', email: 'admin.qa@example.invalid', role: 'admin', password: randomPassword() },
    { label: 'Cliente A', email: 'cliente.a.qa@example.invalid', role: null, password: randomPassword() },
  ];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of identities) {
      item.id = randomUUID();
      await client.query(`INSERT INTO auth_identities (id, kind, email, display_name, status)
        VALUES ($1,$2,$3,$4,'active')`, [item.id, item.role ? 'staff' : 'client', item.email, `QA fictício ${item.label}`]);
      await client.query(`INSERT INTO auth_credentials (identity_id, password_hash)
        VALUES ($1,$2)`, [item.id, await hashPassword(item.password)]);
      if (item.role) await client.query(`INSERT INTO auth_staff_profiles (identity_id, role, assigned_by)
        VALUES ($1,$2,'admin_system')`, [item.id, item.role]);
    }
    const accountA = randomUUID();
    const accountB = randomUUID();
    for (const [id, name] of [[accountA, 'QA Empresa A fictícia'], [accountB, 'QA Empresa B fictícia']]) {
      await client.query(`INSERT INTO client_accounts (id, display_name, status, created_by)
        VALUES ($1,$2,'active','ti')`, [id, name]);
    }
    await client.query(`INSERT INTO client_access_grants
      (id, identity_id, client_account_id, reason, granted_by)
      VALUES ($1,$2,$3,'Vínculo somente para homologação descartável','ti')`,
    [randomUUID(), identities[3].id, accountA]);
    await client.query('COMMIT');
    return identities;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

function sanitizedEnv(databaseUrl, temp, sessionSecret, marceloToken) {
  // Explicit allowlist: do not inherit deployment or provider secrets/configuration.
  const env = { PATH: process.env.PATH || process.env.Path || '',
    SystemRoot: process.env.SystemRoot || '', HOME: process.env.HOME || '',
    USERPROFILE: process.env.USERPROFILE || '', TMPDIR: process.env.TMPDIR || '',
    TEMP: process.env.TEMP || '', TMP: process.env.TMP || '',
    DATABASE_URL: databaseUrl, DATABASE_MIGRATION_URL: '', QA_MIGRATION_ONLY: 'true',
    QA_PGLITE_ONLY: '', ALLOW_REMOTE_MIGRATIONS: '', RUN_DATABASE_INTEGRATION_REMOTE: '',
    BIND_HOST: '127.0.0.1', PORT: '3000', PUBLIC_BASE_URL: 'http://127.0.0.1:3000',
    NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_ALLOW_INDEX: 'false',
    NEXT_PUBLIC_ENV: 'beta', QA_HOMOLOGATION_MODE: 'true',
    SITE_ADMIN_SESSION_SECRET: sessionSecret, SITE_ADMIN_TOKEN_MARCELO: marceloToken,
    OLLAMA_ENABLED: 'false', MAIL_HOST: '', CLIENT_DOCS_DIR: path.join(temp, 'documents'),
    NEXT_DISABLE_HTTPS: 'true' };
  return env;
}

function spawnChild(args, env) {
  return spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
}
function exited(child) {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

async function request(url, init) {
  const response = await fetch(`http://127.0.0.1:3000${url}`, init);
  return { status: response.status, data: await response.json().catch(() => ({})), cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
}
async function smoke(identities, marceloToken) {
  const origin = 'http://127.0.0.1:3000';
  async function login(body) {
    return request('/api/admin/session', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }
  function expect(result, code, label) {
    if (result.status !== code) throw new Error(`qa_smoke_${label}_expected_${code}_got_${result.status}`);
    console.log(`QA-HOM-${label}: HTTP ${code}`);
  }
  // Verify the public route is only an index; its presence does not certify a module.
  const index = await fetch(`${origin}/qa/modulos`);
  expect({ status: index.status }, 200, '001_INDEX');
  const page = await index.text();
  if (!page.includes('Protótipo') || !page.includes('RH') || !page.includes('Marcelo')) throw new Error('qa_smoke_index_labels_missing');
  const ti = await login({ email: identities[0].email, password: identities[0].password });
  expect(ti, 200, '002_TI_LOGIN');
  const rh = await login({ email: identities[1].email, password: identities[1].password });
  expect(rh, 200, '002_RH_LOGIN');
  const adm = await login({ email: identities[2].email, password: identities[2].password });
  expect(adm, 200, '002_ADMIN_LOGIN');
  const marcelo = await login({ token: marceloToken });
  expect(marcelo, 200, '002_MARCELO_TOKEN');
  if (marcelo.data.role !== 'marcelo') throw new Error('qa_smoke_marcelo_role_mismatch');
  const client = await request('/api/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email: identities[3].email, password: identities[3].password }) });
  expect(client, 200, '002_CLIENT_LOGIN');
  expect(await request('/api/admin/leads'), 401, '003_ANON_LEADS_DENIED');
  expect(await request('/api/admin/leads', { headers: { cookie: rh.cookie } }), 403, '003_RH_LEADS_DENIED');
  expect(await request('/api/admin/client-accounts', { headers: { cookie: rh.cookie } }), 403, '003_RH_ACCOUNTS_DENIED');
  expect(await request(`/api/admin/leads/${randomUUID()}`, {
    method: 'PATCH', headers: { cookie: rh.cookie, origin, 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'closed' })
  }), 403, '003_RH_LEAD_WRITE_DENIED');
  expect(await request('/api/admin/client-accounts', { headers: { cookie: adm.cookie } }), 403, '003_ADMIN_LEGACY_ACCOUNTS_DENIED');
  expect(await request('/api/admin/leads', { headers: { cookie: ti.cookie } }), 200, '003_TI_LEADS_ALLOWED');
  expect(await request('/api/admin/client-accounts', { headers: { cookie: marcelo.cookie } }), 200, '003_MARCELO_ACCOUNTS_ALLOWED');
  expect(await request('/api/client/accounts'), 401, '004_ANON_CLIENT_DENIED');
  const accounts = await request('/api/client/accounts', { headers: { cookie: client.cookie } });
  expect(accounts, 200, '004_CLIENT_ACCOUNT');
  if (accounts.data.accounts?.length !== 1 || accounts.data.accounts[0].display_name !== 'QA Empresa A fictícia') {
    throw new Error('qa_smoke_client_tenant_scope_broken');
  }
  console.log('QA-HOM-004_CLIENT_B_NOT_VISIBLE: true (one QA-only grant).');
}

async function waitForHealth(child, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode) throw new Error('qa_web_server_exited');
    try {
      const result = await fetch('http://127.0.0.1:3000/api/health/live', { signal: AbortSignal.timeout(3000) });
      if (result.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('qa_web_health_timeout');
}

await preflight().catch(error => { console.error('QA_HOM_REFUSED:', error.message); process.exit(2); });
if (preflightOnly) process.exit(0);
const [{ default: EmbeddedPostgres }, { default: pg }] = await Promise.all([
  import('embedded-postgres'), import('pg')
]);
await assertWebPortFree().catch(error => { console.error('QA_HOM_REFUSED:', error.message); process.exit(2); });
const port = await freePort();
const directory = await mkdtemp(path.join(tmpdir(), 'seg-qa-homologacao-'));
const pgPassword = randomBytes(24).toString('hex');
const databaseUrl = `postgresql://seg_qa:${pgPassword}@127.0.0.1:${port}/seg_qa_homologacao`;
const pgEngine = new EmbeddedPostgres({
  databaseDir: path.join(directory, 'data'), port, user: 'seg_qa', password: pgPassword,
  persistent: false, postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog: () => {},
  onError: error => console.error('QA_HOM_PG_ERROR', String(error).replaceAll(pgPassword, '[redacted]').slice(0, 250)),
});
let pool;
let web;
let stopRequested = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { stopRequested = true; if (web && !web.killed) web.kill('SIGTERM'); });
}
let result = 1;
try {
  await pgEngine.initialise();
  await pgEngine.start();
  await pgEngine.createDatabase('seg_qa_homologacao');
  const secret = randomBytes(32).toString('base64url');
  const marceloToken = randomBytes(32).toString('base64url');
  const env = sanitizedEnv(databaseUrl, directory, secret, marceloToken);
  const migrator = spawnChild(['scripts/migrate-site-visual.mjs'], env);
  if (await exited(migrator) !== 0) throw new Error('qa_migrations_failed');
  pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const { rows } = await pool.query('SELECT count(*)::int AS count FROM __migrations WHERE checksum IS NOT NULL');
  if (rows[0].count !== 96) throw new Error(`qa_migrations_expected_96_got_${rows[0].count}`);
  const identities = await seed(pool);
  console.log('QA-HOM-001: 96/96 migrações no PostgreSQL novo; 4 identidades e 2 empresas 100% fictícias.');
  web = spawnChild(['server.mjs', '--dev'], { ...env, QA_MIGRATION_ONLY: '' });
  await waitForHealth(web);
  if (verify) {
    await smoke(identities, marceloToken);
    result = 0;
  } else {
    console.log('\n=== HOMOLOGAÇÃO LOCAL, SOMENTE NESTE TERMINAL ===');
    console.log('Abra http://127.0.0.1:3000/qa/modulos');
    for (const item of identities) console.log(`${item.label}: ${item.email} / ${item.password}`);
    console.log(`Marcelo (chave legada temporária, NÃO conta individual): ${marceloToken}`);
    console.log('Os segredos não foram salvos. NÃO os compartilhe; use somente dados fictícios.');
    console.log('Pare com Ctrl+C; o cluster exclusivo é removido ao encerrar normalmente.\n');
    await exited(web);
    result = stopRequested ? 0 : 1;
  }
} catch (error) {
  console.error('QA_HOM_FAILED:', String(error?.message || error).replaceAll(pgPassword, '[redacted]'));
} finally {
  if (web && !web.killed && web.exitCode === null) {
    web.kill('SIGTERM');
    await Promise.race([exited(web), new Promise(resolve => setTimeout(resolve, 10_000))]);
    if (web.exitCode === null) web.kill('SIGKILL');
  }
  await pool?.end().catch(() => {});
  try { await pgEngine.stop(); } catch (error) { console.error('QA_HOM_STOP_FAILED:', String(error).replaceAll(pgPassword, '[redacted]')); result = 1; }
  try { await rm(directory, { recursive: true, force: true }); console.log('QA_HOM_TEMP_CLEANED: true'); }
  catch (error) { console.error('QA_HOM_CLEAN_FAILED:', String(error).slice(0, 200)); result = 1; }
}
process.exit(result);
