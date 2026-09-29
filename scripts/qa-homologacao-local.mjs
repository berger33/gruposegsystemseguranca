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
import { hashPassword, hashToken } from '../src/lib/client-auth-core.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const simulateWin1252 = process.argv.includes('--verify-win1252');
const verify = process.argv.includes('--verify') || simulateWin1252;
const preflightOnly = process.argv.includes('--preflight');
const unsupported = process.argv.filter(arg => arg.startsWith('--') && !['--verify', '--verify-win1252', '--preflight'].includes(arg));
const refused = ['DATABASE_URL', 'DATABASE_MIGRATION_URL', 'ALLOW_REMOTE_MIGRATIONS',
  'QA_PGLITE_ONLY', 'CLIENT_DOCS_DIR', 'PGLITE_DATA_DIR', 'PGHOST', 'PGSERVICE',
  'SITE_ADMIN_SESSION_SECRET', 'SITE_ADMIN_TOKEN_TI', 'SITE_ADMIN_TOKEN_MARCELO', 'CLIENT_MFA_ENCRYPTION_KEY',
  'MAIL_HOST', 'MAIL_USER', 'MAIL_PASSWORD', 'OLLAMA_HOST', 'TRUST_PROXY', 'PUBLIC_BASE_URL'];

async function preflight() {
  if (unsupported.length || (verify && preflightOnly) ||
      (simulateWin1252 && process.platform === 'win32')) throw new Error('qa_unknown_option');
  if (process.versions.node.split('.')[0] !== '22') throw new Error('qa_requires_node_22');
  for (const key of refused) if (process.env[key]) throw new Error(`qa_env_refused_${key}`);
  for (const name of await readdir(root)) if (name === '.env' || name.startsWith('.env.')) {
    if (name !== '.env.example') throw new Error(`qa_env_file_refused_${name}`);
  }
  await access(path.join(root, 'db/migrations/098-client-manual-verification.sql'));
  // Fail before npm ci (which can take minutes on Windows) when the old preview is still open.
  // Check again immediately before starting: another program can take the port meanwhile.
  await assertWebPortFree();
  console.log('QA_HOM_PREFLIGHT: loopback only, port 3000 free, no external DB, SMTP, Ollama or .env files.');
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
    server.once('error', () => reject(new Error('qa_port_3000_busy_close_the_old_preview_before_install')));
    server.listen(3000, '127.0.0.1', () => server.close(resolve));
  });
}

// The cluster itself may use WIN1252 on Windows. Create a fresh UTF8 database
// from template0 using ASCII-only SQL while connected to its default database.
// No existing DB can be touched: engine owns only the mkdtemp cluster above.
async function createUtf8QaDatabase(engine) {
  const admin = engine.getPgClient('postgres', '127.0.0.1');
  try {
    await admin.connect();
    const { rows: [cluster] } = await admin.query('SHOW server_encoding');
    if (simulateWin1252 && cluster.server_encoding !== 'WIN1252') throw new Error('qa_win1252_simulation_failed');
    console.log(`QA-HOM-001_CLUSTER_ENCODING: ${cluster.server_encoding} (cluster descartável, não DB da aplicação)`);
    await admin.query("CREATE DATABASE seg_qa_homologacao WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'");
  } finally {
    await admin.end().catch(() => {});
  }
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
      await client.query(`INSERT INTO auth_identities (id, kind, email, display_name, status, verification_method, verified_at)
        VALUES ($1,$2,$3,$4,'active',$5,$6)`, [item.id, item.role ? 'staff' : 'client', item.email,
        `QA fictício ${item.label}`, item.role ? null : 'email_link', item.role ? null : new Date()]);
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
    CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
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
async function smoke(identities, marceloToken, pool) {
  const { generate } = await import('otplib');
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
  // SEC-06/07: historical handlers must never pretend to activate MFA or
  // change an e-mail before there is a verified challenge and delivery channel.
  const mfaPath = '/api/client/security/mfa/activate';
  const changePath = '/api/client/security/email-change';
  const post = (path, headers) => request(path, { method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: '{}' });
  expect(await post(mfaPath), 401, '005_MFA_ANON_DENIED');
  expect(await post(mfaPath, { cookie: client.cookie }), 409, '005_MFA_SETUP_REQUIRED');
  expect(await post(changePath, { cookie: client.cookie }), 503, '005_EMAIL_CHANGE_EXPLICIT_UNAVAILABLE');
  expect(await request(mfaPath, { method: 'POST', headers: { cookie: client.cookie, origin: 'https://foreign.invalid' }, body: '{}' }), 403, '005_MFA_FOREIGN_ORIGIN_DENIED');
  // A legacy record with activated_at must not let a password-only login (or an
  // earlier cookie) bypass the absent challenge. This DB is synthetic + disposable.
  await pool.query("INSERT INTO auth_mfa (identity_id, totp_secret_encrypted, activated_at) VALUES ($1,'qa-disabled-legacy-secret',NOW())", [identities[3].id]);
  try {
    expect(await request('/api/auth/me', { headers: { cookie: client.cookie } }), 401, '005_OLD_COOKIE_MFA_DENIED');
    const blocked = await request('/api/auth/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: identities[3].email, password: identities[3].password }) });
    expect(blocked, 503, '005_MFA_PASSWORD_ONLY_DENIED');
    if (blocked.cookie || blocked.data.error !== 'mfa_login_unavailable') throw new Error('qa_mfa_password_bypass');
  } finally {
    await pool.query('DELETE FROM auth_mfa WHERE identity_id = $1', [identities[3].id]);
  }
  // SEC-06 real vertical path: password -> setup -> TOTP -> session-bound
  // challenge -> scoped resource, then single-use recovery and disable.
  const auth = (url, body, cookie = '') => request(url, { method: 'POST',
    headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  expect(await auth('/api/client/security/mfa/setup', { password: 'wrong' }, client.cookie), 403, '006_SETUP_WRONG_PASSWORD');
  const setup = await auth('/api/client/security/mfa/setup', { password: identities[3].password }, client.cookie);
  expect(setup, 200, '006_SETUP');
  if (!setup.data.uri?.startsWith('otpauth://') || !setup.data.secret) throw new Error('qa_mfa_setup_secret_missing');
  const otp = await generate({ secret: setup.data.secret });
  const wrong = otp === '000000' ? '111111' : '000000';
  expect(await auth(mfaPath, { code: wrong }, client.cookie), 403, '006_ACTIVATE_WRONG_CODE');
  const activated = await auth(mfaPath, { code: otp }, client.cookie);
  expect(activated, 200, '006_ACTIVATE');
  if (activated.data.recoveryCodes?.length !== 8) throw new Error('qa_mfa_recovery_codes_missing');
  const { rows: [storedMfa] } = await pool.query('SELECT totp_secret_encrypted, recovery_hashes FROM auth_mfa WHERE identity_id=$1', [identities[3].id]);
  if (!storedMfa.totp_secret_encrypted.startsWith('v1:') || storedMfa.totp_secret_encrypted.includes(setup.data.secret) ||
      storedMfa.recovery_hashes.some(hash => activated.data.recoveryCodes.includes(hash))) throw new Error('qa_mfa_secrets_not_protected_at_rest');
  console.log('QA-HOM-006_AT_REST: encrypted TOTP and hashed recovery codes.');
  expect(await request('/api/auth/me', { headers: { cookie: client.cookie } }), 401, '006_OLD_COOKIE_REVOKED');
  const mfaLogin = () => auth('/api/auth/login', { email: identities[3].email, password: identities[3].password });
  const first = await mfaLogin(); expect(first, 202, '006_CHALLENGE');
  if (first.cookie || !first.data.challenge) throw new Error('qa_mfa_session_issued_before_code');
  expect(await auth('/api/auth/mfa/complete', { challenge: first.data.challenge, code: wrong }), 401, '006_WRONG_CODE');
  const verified = await auth('/api/auth/mfa/complete', { challenge: first.data.challenge, code: otp });
  expect(verified, 200, '006_TOTP_LOGIN');
  if (!verified.cookie) throw new Error('qa_mfa_session_cookie_missing');
  expect(await auth('/api/auth/mfa/complete', { challenge: first.data.challenge, code: otp }), 401, '006_REPLAY_CHALLENGE_DENIED');
  expect(await request('/api/client/accounts', { headers: { cookie: verified.cookie } }), 200, '006_MFA_SCOPED_ACCOUNT');
  const second = await mfaLogin(); expect(second, 202, '006_SECOND_CHALLENGE');
  const recoveryCode = activated.data.recoveryCodes[0];
  expect(await auth('/api/auth/mfa/complete', { challenge: second.data.challenge, code: recoveryCode }), 200, '006_RECOVERY_LOGIN');
  const third = await mfaLogin(); expect(third, 202, '006_THIRD_CHALLENGE');
  expect(await auth('/api/auth/mfa/complete', { challenge: third.data.challenge, code: recoveryCode }), 401, '006_RECOVERY_REPLAY_DENIED');
  expect(await auth('/api/auth/mfa/complete', { challenge: third.data.challenge, code: otp }), 401, '006_TOTP_TIME_STEP_REPLAY_DENIED');
  const expiring = await mfaLogin(); expect(expiring, 202, '006_EXPIRING_CHALLENGE');
  await pool.query("UPDATE auth_mfa_challenges SET expires_at=NOW()-INTERVAL '1 second' WHERE token_hash=$1", [hashToken(expiring.data.challenge)]);
  expect(await auth('/api/auth/mfa/complete', { challenge: expiring.data.challenge, code: activated.data.recoveryCodes[2] }), 401, '006_EXPIRED_CHALLENGE_DENIED');
  expect(await auth('/api/client/security/mfa/disable', { password: identities[3].password, code: activated.data.recoveryCodes[1] }, verified.cookie), 200, '006_DISABLE');
  expect(await request('/api/auth/me', { headers: { cookie: verified.cookie } }), 401, '006_REVOKED_AFTER_DISABLE');
  expect(await mfaLogin(), 200, '006_PASSWORD_LOGIN_AFTER_DISABLE');
  // Existing active records without evidence of verification do not inherit a
  // confirmed status merely because an older version stored status='active'.
  await pool.query('UPDATE auth_identities SET verification_method=NULL, verified_at=NULL WHERE id=$1', [identities[3].id]);
  try {
    expect(await mfaLogin(), 403, '007_LEGACY_UNVERIFIED_LOGIN_DENIED');
  } finally {
    await pool.query("UPDATE auth_identities SET verification_method='email_link', verified_at=NOW() WHERE id=$1", [identities[3].id]);
  }

  // QA-HOM-007: no SMTP and no existing client identity may silently become
  // 'email confirmed'. A signed individual TI session plus re-auth and a
  // documented independent human check are mandatory for manual activation.
  const pendingEmail = 'manual.qa@example.invalid';
  const pendingPassword = randomPassword();
  const created = await auth('/api/admin/invites', { email: pendingEmail, scopeNote: 'Somente QA sintético sem dados reais' }, ti.cookie);
  expect(created, 201, '007_INVITE_CREATED');
  if (created.data.emailStatus !== 'not_configured' || !created.data.inviteUrl) throw new Error('qa_manual_invite_delivery_mismatch');
  const accepted = await auth('/api/auth/invite/accept', {
    token: new URL(created.data.inviteUrl).searchParams.get('token'), password: pendingPassword, displayName: 'Cliente Manual Fictício',
  });
  expect(accepted, 201, '007_INVITE_ACCEPTED_PENDING');
  if (accepted.data.status !== 'pending_email' || accepted.data.emailStatus !== 'not_configured') throw new Error('qa_manual_pending_expected');
  const pendingLogin = () => auth('/api/auth/login', { email: pendingEmail, password: pendingPassword });
  const blockedPending = await pendingLogin(); expect(blockedPending, 403, '007_PENDING_LOGIN_DENIED');
  if (blockedPending.cookie) throw new Error('qa_pending_cookie_issued');
  expect(await request('/api/admin/client-verifications'), 401, '007_ANON_QUEUE_DENIED');
  expect(await request('/api/admin/client-verifications', { headers: { cookie: rh.cookie } }), 403, '007_RH_QUEUE_DENIED');
  expect(await request('/api/admin/client-verifications', { headers: { cookie: marcelo.cookie } }), 403, '007_LEGACY_QUEUE_DENIED');
  const queue = await request('/api/admin/client-verifications', { headers: { cookie: ti.cookie } });
  expect(queue, 200, '007_INDIVIDUAL_TI_QUEUE');
  const target = queue.data.pending?.find(row => row.email === pendingEmail);
  if (!target) throw new Error('qa_manual_identity_not_listed');
  const approvalPath = `/api/admin/client-verifications/${target.id}/approve`;
  const review = { expectedEmail: pendingEmail, method: 'known_contact_callback',
    reason: 'QA fictício: retorno feito para contato previamente conhecido pela equipe.', password: identities[0].password };
  expect(await auth(approvalPath, { ...review, password: 'wrong' }, ti.cookie), 403, '007_TI_WRONG_PASSWORD_DENIED');
  expect(await auth(approvalPath, { ...review, expectedEmail: 'other@example.invalid' }, ti.cookie), 409, '007_WRONG_TARGET_DENIED');
  expect(await auth(approvalPath, review, rh.cookie), 403, '007_RH_APPROVAL_DENIED');
  const approved = await auth(approvalPath, review, ti.cookie);
  expect(approved, 200, '007_MANUAL_APPROVAL');
  if (approved.data.emailConfirmed !== false || approved.data.verificationMethod !== 'manual') throw new Error('qa_manual_claimed_email_verified');
  expect(await auth(approvalPath, review, ti.cookie), 409, '007_REPEAT_APPROVAL_DENIED');
  const loginManual = await pendingLogin(); expect(loginManual, 200, '007_MANUAL_CLIENT_LOGIN');
  const manualMe = await request('/api/auth/me', { headers: { cookie: loginManual.cookie } });
  expect(manualMe, 200, '007_MANUAL_SESSION');
  if (manualMe.data.emailConfirmed || manualMe.data.verificationMethod !== 'manual') throw new Error('qa_manual_email_claim_mismatch');
  const manualAccess = await request('/api/client/accounts', { headers: { cookie: loginManual.cookie } });
  expect(manualAccess, 200, '007_MANUAL_UNSCOPED_LIST');
  if (manualAccess.data.accounts?.length !== 0) throw new Error('qa_manual_client_gained_unapproved_grant');
  const { rows: [storedReview] } = await pool.query(`SELECT i.verification_method, v.staff_identity_id,
    (SELECT count(*)::int FROM auth_email_tokens t WHERE t.identity_id=i.id AND t.kind='confirm_email' AND t.superseded_at IS NOT NULL) AS invalidated
    FROM auth_identities i JOIN client_manual_verifications v ON v.identity_id=i.id WHERE i.id=$1`, [target.id]);
  const { rows: [auditReview] } = await pool.query(`SELECT count(*)::int AS events FROM auth_access_audit
    WHERE action='account_status' AND actor_kind='staff' AND actor_id=$1 AND target=$2 AND result='allowed'`, [identities[0].id, target.id]);
  if (storedReview.verification_method !== 'manual' || storedReview.staff_identity_id !== identities[0].id ||
      storedReview.invalidated < 1 || auditReview.events !== 1) {
    throw new Error('qa_manual_review_not_auditable_or_email_token_not_revoked');
  }
  console.log('QA-HOM-007_AUDIT: individual TI, audit event, confirmation token invalidated, no grant for newly approved synthetic client.');
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
  // Do NOT force UTF8 in initdb: on Portuguese Windows its internal bootstrap
  // fails on locale data (0xe7); the default cluster DID start there. The
  // disposable application database is created as UTF8 from template0 below.
  persistent: false,
  ...(simulateWin1252 ? { initdbFlags: ['--locale=C', '--encoding=WIN1252'] } : {}),
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
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
  await createUtf8QaDatabase(pgEngine);
  pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  // Fail closed *before* migrations if the application DB or client uses WIN1252.
  // A round-trip probe ensures that non-ASCII SQL literals are transferable too.
  const { rows: [encoding] } = await pool.query(`SELECT current_setting('server_encoding') AS server_encoding,
    current_setting('client_encoding') AS client_encoding, $1::text AS probe`, ['QA → UTF-8']);
  if (encoding.server_encoding !== 'UTF8' || encoding.client_encoding !== 'UTF8' ||
      encoding.probe !== 'QA → UTF-8') throw new Error('qa_utf8_required_before_migrations');
  console.log('QA-HOM-001_ENCODING: server=UTF8 client=UTF8 Unicode round-trip OK.');
  const secret = randomBytes(32).toString('base64url');
  const marceloToken = randomBytes(32).toString('base64url');
  const env = sanitizedEnv(databaseUrl, directory, secret, marceloToken);
  const migrator = spawnChild(['scripts/migrate-site-visual.mjs'], env);
  if (await exited(migrator) !== 0) throw new Error('qa_migrations_failed');
  const { rows } = await pool.query('SELECT count(*)::int AS count FROM __migrations WHERE checksum IS NOT NULL');
  if (rows[0].count !== 98) throw new Error(`qa_migrations_expected_98_got_${rows[0].count}`);
  const identities = await seed(pool);
  console.log('QA-HOM-001: 98/98 migrações no PostgreSQL novo; 4 identidades e 2 empresas 100% fictícias.');
  web = spawnChild(['server.mjs', '--dev'], { ...env, QA_MIGRATION_ONLY: '' });
  await waitForHealth(web);
  if (verify) {
    await smoke(identities, marceloToken, pool);
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
