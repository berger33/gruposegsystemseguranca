#!/usr/bin/env node
// QA-HOM-008: isolated integration test of the opt-in persistent preview.
// Creates exactly one owned mkdtemp path, removes ONLY that path after stop.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, readFile, readdir, rm, rmdir, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';

if (process.argv.length !== 2 || ['DATABASE_URL','DATABASE_MIGRATION_URL','CLIENT_DOCS_DIR','MAIL_HOST','SEG_DEMO_TEST_DIR'].some(k => process.env[k])) {
  console.error('QA-HOM-008_REFUSED: no operator database, documents, SMTP or alternate data dir allowed'); process.exit(2);
}
const root = path.resolve(import.meta.dirname, '..');
const dir = await mkdtemp(path.join(tmpdir(), 'seg-demo-qa-'));
await rmdir(dir); // initialiseDirectory requires an exclusively NEW path
const port = await new Promise((resolve, reject) => {
  const probe = createServer(); probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); });
});
const origin = `http://127.0.0.1:${port}`;
const env = { PATH: process.env.PATH || process.env.Path || '', SystemRoot: process.env.SystemRoot || '',
  HOME: process.env.HOME || '', USERPROFILE: process.env.USERPROFILE || '',
  TEMP: process.env.TEMP || '', TMP: process.env.TMP || '', TMPDIR: process.env.TMPDIR || '',
  SEG_DEMO_TEST_MODE: '1', SEG_DEMO_TEST_DIR: dir, SEG_DEMO_WEB_PORT: String(port) };
let child, pool, result = 1;
const logs = [];
function spawnDemo(action) {
  const proc = spawn(process.execPath, ['scripts/local-demo.mjs',action], { cwd: root, env, stdio: ['ignore','pipe','pipe'] });
  proc.stdout.on('data', data => logs.push(String(data)));
  proc.stderr.on('data', data => logs.push(String(data)));
  return proc;
}
function exitOf(proc) {
  if (proc.exitCode !== null) return Promise.resolve(proc.exitCode);
  return new Promise((resolve, reject) => { proc.once('error', reject); proc.once('exit', code => resolve(code ?? 1)); });
}
async function ready(proc) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error('demo_exited_before_ready');
    if (logs.join('').includes('DEMO_LOCAL_READY:')) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('demo_ready_timeout');
}
function expect(response, code, name) {
  if (response.status !== code) throw new Error(`${name}_expected_${code}_got_${response.status}`);
  console.log(`QA-HOM-008_${name}: HTTP ${code}`);
}
async function request(url, body, cookie) {
  const response = await fetch(origin + url, { method: body ? 'POST' : 'GET',
    headers: { origin, ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json().catch(() => ({})),
    cookie: response.headers.get('set-cookie')?.split(';')[0] || '' };
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGINT');
  const code = await Promise.race([exitOf(child), new Promise((_, reject) => setTimeout(() => reject(new Error('demo_shutdown_timeout')), 30_000))]);
  if (code !== 0) throw new Error(`demo_shutdown_exit_${code}`);
}
try {
  child = spawnDemo('--init'); await ready(child);
  const firstLog = logs.join('');
  const ti = firstLog.match(/TI: (\S+) \/ (\S+)/);
  if (!ti || !firstLog.includes('DEMO_LOCAL_READY')) throw new Error('demo_no_initial_credential_or_url');
  const cfg = JSON.parse(await readFile(path.join(dir,'config.json'),'utf8'));
  if (process.platform !== 'win32' && ((await stat(path.join(dir,'config.json'))).mode & 0o077)) {
    throw new Error('demo_config_group_or_world_readable');
  }
  const url = `postgresql://seg_demo:${encodeURIComponent(cfg.pgPassword)}@127.0.0.1:${cfg.pgPort}/seg_demo_local`;
  pool = new pg.Pool({ connectionString: url, max: 2 });
  const { rows:[before] } = await pool.query(`SELECT
    (SELECT count(*)::int FROM __migrations) AS migrations,
    (SELECT count(*)::int FROM auth_identities WHERE kind='staff') AS staff,
    (SELECT count(*)::int FROM auth_identities WHERE kind='client') AS clients,
    (SELECT count(*)::int FROM client_accounts) AS accounts,
    (SELECT count(*)::int FROM client_contracts) AS contracts`);
  if (JSON.stringify(before) !== JSON.stringify({ migrations:98,staff:3,clients:0,accounts:2,contracts:1 })) throw new Error('demo_seed_counts_mismatch');
  expect(await request('/api/client/accounts'), 401, 'ANON_DENIED');
  const tiLogin = await request('/api/admin/session', { email:ti[1], password:ti[2] });
  expect(tiLogin, 200, 'TI_INDIVIDUAL_LOGIN');
  const realDomain = await request('/api/admin/invites', { email:'pessoa@empresa.com.br' }, tiLogin.cookie);
  expect(realDomain, 400, 'REAL_ADDRESS_REFUSED');
  if (realDomain.data.error !== 'demo_synthetic_address_required' || realDomain.data.inviteUrl) {
    throw new Error('demo_real_address_generated_invite');
  }
  const email = 'qa.demo.cliente@example.invalid', password = randomBytes(24).toString('base64url');
  const invite = await request('/api/admin/invites', { email, scopeNote:'Demo fictícia QA' }, tiLogin.cookie);
  expect(invite, 201, 'CLIENT_INVITED');
  if (invite.data.emailStatus !== 'not_configured') throw new Error('demo_smtp_must_be_off');
  const accepted = await request('/api/auth/invite/accept', { token:new URL(invite.data.inviteUrl).searchParams.get('token'),
    displayName:'Cliente Fictício de QA', password });
  expect(accepted, 201, 'CLIENT_PENDING');
  expect(await request('/api/auth/login', { email,password }), 403, 'PENDING_DENIED');
  const queue = await request('/api/admin/client-verifications', undefined, tiLogin.cookie);
  expect(queue, 200, 'TI_REVIEW_QUEUE');
  const identity = queue.data.pending?.find(row => row.email === email);
  if (!identity) throw new Error('demo_client_not_pending');
  const approved = await request(`/api/admin/client-verifications/${identity.id}/approve`, {
    expectedEmail: email, method:'known_contact_callback',
    reason:'Somente ensaio sintético QA, contato previamente conhecido no roteiro fictício.', password:ti[2],
  }, tiLogin.cookie);
  expect(approved, 200, 'MANUAL_REVIEW');
  if (approved.data.emailConfirmed !== false) throw new Error('demo_claimed_mailbox_verified');
  const clientLogin = await request('/api/auth/login', { email,password });
  expect(clientLogin, 200, 'CLIENT_AFTER_REVIEW');
  const unscoped = await request('/api/client/accounts', undefined, clientLogin.cookie);
  expect(unscoped, 200, 'NO_GRANT');
  if (unscoped.data.accounts?.length !== 0) throw new Error('demo_implicit_grant');
  const { rows:accounts } = await pool.query('SELECT id,display_name FROM client_accounts ORDER BY display_name');
  const accountA = accounts.find(row => row.display_name.includes('Empresa A'));
  const accountB = accounts.find(row => row.display_name.includes('Empresa B'));
  expect(await request('/api/admin/grants', {
    identityId: identity.id, clientAccountId: accountA.id, reason:'Somente QA sintético: conceder apenas Empresa A',
  }, tiLogin.cookie), 201, 'EXPLICIT_A_GRANT');
  const scoped = await request('/api/client/accounts', undefined, clientLogin.cookie);
  expect(scoped, 200, 'A_VISIBLE');
  if (scoped.data.accounts?.length !== 1 || scoped.data.accounts[0].id !== accountA.id ||
      scoped.data.accounts.some(row => row.id === accountB.id)) throw new Error('demo_cross_account_exposure');
  const changed = await pool.query("UPDATE client_accounts SET notes='QA-HOM-008 persisted mutation, fictional only' WHERE id=$1",[accountA.id]);
  if (changed.rowCount !== 1) throw new Error('demo_synthetic_mutation_missing');
  await pool.end(); pool = undefined;
  await stop();
  if ((await readdir(dir)).includes('run.lock')) throw new Error('demo_run_lock_left_after_graceful_stop');
  if (process.platform !== 'win32') {
    const cfgFile = path.join(dir,'config.json');
    await chmod(cfgFile, 0o644);
    try {
      logs.length = 0; child = spawnDemo('--start');
      if (await exitOf(child) !== 1 || !logs.join('').includes('demo_insecure_data_permissions')) {
        throw new Error('demo_world_readable_config_not_refused');
      }
      console.log('QA-HOM-008_INSECURE_CONFIG_REFUSED: no database started');
    } finally { await chmod(cfgFile, 0o600); }
  }
  // An interrupted bootstrap must NEVER replace an existing local state.
  logs.length = 0; child = spawnDemo('--init');
  if (await exitOf(child) !== 1 || !logs.join('').includes('demo_directory_exists')) throw new Error('demo_reinit_not_refused');
  console.log('QA-HOM-008_REINIT_REFUSED: old data not reset');
  logs.length = 0; child = spawnDemo('--start'); await ready(child);
  if (logs.join('').includes('CREDENCIAIS APENAS')) throw new Error('demo_password_reprinted_on_restart');
  pool = new pg.Pool({ connectionString:url, max:2 });
  const { rows:[after] } = await pool.query(`SELECT
    (SELECT count(*)::int FROM client_accounts WHERE notes='QA-HOM-008 persisted mutation, fictional only') AS mutated,
    (SELECT count(*)::int FROM client_access_grants WHERE identity_id=$1 AND revoked_at IS NULL) AS grants,
    (SELECT count(*)::int FROM auth_identities WHERE kind='staff') AS staff,
    (SELECT count(*)::int FROM client_manual_verifications WHERE identity_id=$1) AS reviews,
    (SELECT count(*)::int FROM seg_demo_bootstrap WHERE installation_id=$2) AS marker`,[identity.id,cfg.installationId]);
  if (JSON.stringify(after) !== JSON.stringify({ mutated:1,grants:1,staff:3,reviews:1,marker:1 })) throw new Error('demo_restart_lost_data');
  expect(await request('/api/client/accounts', undefined, clientLogin.cookie), 200, 'CLIENT_SESSION_AFTER_RESTART');
  console.log('QA-HOM-008_RESTART: synthetic data, scope, review and stable session secret persisted; no credential replay');
  await pool.end(); pool = undefined; await stop();
  result = 0;
} catch (error) {
  console.error('QA-HOM-008_FAILED:', String(error?.message || error).slice(0,250));
} finally {
  await pool?.end().catch(() => {});
  try { await stop(); } catch { result = 1; }
  // The runner created exactly this mkdtemp path and no other; it never
  // touches the operator's default profile directory or any configured DB.
  if (child?.exitCode !== null) {
    await rm(dir, { recursive:true, force:true });
    console.log('QA-HOM-008_TEMP_CLEANED: true');
  } else { console.error('QA-HOM-008_TEMP_LEFT_FOR_INSPECTION: child still running'); result = 1; }
}
process.exit(result);
