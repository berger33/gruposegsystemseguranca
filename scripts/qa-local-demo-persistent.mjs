#!/usr/bin/env node
// QA-HOM-008/009: isolated persistent preview and cold snapshot integration.
// Creates exclusively owned mkdtemp paths, removes ONLY those paths after stop.
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, readdir, rm, rmdir, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { seedFreshDemo } from './local-demo-seed.mjs';

if (process.argv.length !== 2 || ['DATABASE_URL','DATABASE_MIGRATION_URL','CLIENT_DOCS_DIR','MAIL_HOST','SEG_DEMO_TEST_DIR'].some(k => process.env[k])) {
  console.error('QA-HOM-008_REFUSED: no operator database, documents, SMTP or alternate data dir allowed'); process.exit(2);
}
const root = path.resolve(import.meta.dirname, '..');
const dir = await mkdtemp(path.join(tmpdir(), 'seg-demo-qa-'));
const snapshotDir = await mkdtemp(path.join(tmpdir(), 'seg-demo-qa-backup-'));
const restoredDir = await mkdtemp(path.join(tmpdir(), 'seg-demo-qa-restored-'));
for (const fresh of [dir,snapshotDir,restoredDir]) await rmdir(fresh); // new destinations only
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
function spawnDemo(action, overrides = {}) {
  const proc = spawn(process.execPath, ['scripts/local-demo.mjs',action], { cwd: root, env: { ...env, ...overrides }, stdio: ['pipe','pipe','pipe'] });
  proc.stdout.on('data', data => logs.push(String(data)));
  proc.stderr.on('data', data => logs.push(String(data)));
  return proc;
}
async function snapshot(...args) {
  const proc = spawn(process.execPath, ['scripts/demo-offline-snapshot.mjs',...args],
    { cwd: root, env, stdio: ['ignore','pipe','pipe'] });
  const output = [];
  proc.stdout.on('data', bytes => output.push(String(bytes)));
  proc.stderr.on('data', bytes => output.push(String(bytes)));
  // 'exit' may fire before stdout/stderr pipes are drained (especially after
  // embedded-postgres' async exit hook); 'close' includes the final marker.
  const code = await new Promise((resolve,reject) => {
    proc.once('error',reject); proc.once('close',n => resolve(n ?? 1));
  });
  return { code, output:output.join('') };
}
function exitOf(proc) {
  if (proc.exitCode !== null) return Promise.resolve(proc.exitCode);
  return new Promise((resolve, reject) => { proc.once('error', reject); proc.once('exit', code => resolve(code ?? 1)); });
}
async function ready(proc, { credentials = false } = {}) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      const safe = logs.join('').split('\n').filter(line =>
        /^(DEMO_LOCAL_FAILED:|DEMO_PG_ERROR|Migration failed:|DEMO_LOCAL_READY:)/.test(line)).slice(-5);
      throw new Error(`demo_exited_before_ready${safe.length ? ` (${safe.join(' | ').slice(0, 700)})` : ''}`);
    }
    const output = logs.join('');
    if (output.includes('DEMO_LOCAL_READY:') && (!credentials || /TI: (\S+) \/ (\S+)/.test(output))) return;
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
  child.stdin.write('STOP\n');
  child.stdin.end();
  const code = await Promise.race([exitOf(child), new Promise((_, reject) => setTimeout(() => reject(new Error('demo_shutdown_timeout')), 30_000))]);
  if (code !== 0) {
    const safe = logs.join('').split('\n').filter(line =>
      /^(DEMO_LOCAL_FAILED:|DEMO_PG_ERROR|DEMO_PG_STOP_FAILED:|DEMO_LOCAL_DATA_PRESERVED:)/.test(line)).slice(-6);
    throw new Error(`demo_shutdown_exit_${code}${safe.length ? ` (${safe.join(' | ').slice(0, 700)})` : ''}`);
  }
}
try {
  child = spawnDemo('--init'); await ready(child, { credentials:true });
  const firstLog = logs.join('');
  const ti = firstLog.match(/TI: (\S+) \/ (\S+)/);
  if (!ti || !firstLog.includes('DEMO_LOCAL_READY')) {
    const diagnostic = firstLog.split('\n').filter(line => /^(Migration failed:|DEMO_ERROR:|DEMO_LOCAL_FAILED:)/.test(line)).map(line => line.slice(0, 160)).slice(-3);
    throw new Error(`demo_no_initial_credential_or_url (${diagnostic.join(' | ') || 'no safe diagnostic'})`);
  }
  const cfg = JSON.parse(await readFile(path.join(dir,'config.json'),'utf8'));
  if (process.platform !== 'win32' && ((await stat(path.join(dir,'config.json'))).mode & 0o077)) {
    throw new Error('demo_config_group_or_world_readable');
  }
  const url = `postgresql://seg_demo:${encodeURIComponent(cfg.pgPassword)}@127.0.0.1:${cfg.pgPort}/seg_demo_local`;
  pool = new pg.Pool({ connectionString: url, max: 2 });
  // The seeder refuses missing capability and another installation before replay.
  await seedFreshDemo(pool, cfg.installationId).then(
    () => { throw new Error('demo_seed_missing_capability_accepted'); },
    error => { if (!String(error.message).includes('authorization_refused')) throw error; },
  );
  await seedFreshDemo(pool, randomUUID(), {
    mode: 'isolated-local-demo', databaseName: 'seg_demo_local',
  }).then(
    () => { throw new Error('demo_seed_wrong_installation_accepted'); },
    error => { if (!String(error.message).includes('marker_mismatch')) throw error; },
  );
  // Replay F03 must not rotate credentials or duplicate any business row.
  const replay = await seedFreshDemo(pool, cfg.installationId, {
    mode: 'isolated-local-demo', databaseName: 'seg_demo_local',
  });
  if (!replay.replay || replay.credentials.length !== 0) throw new Error('demo_seed_replay_not_noop');
  const { rows:[before] } = await pool.query(`SELECT
    (SELECT count(*)::int FROM __migrations) AS migrations,
    (SELECT count(*)::int FROM auth_identities WHERE kind='staff') AS staff,
    (SELECT count(*)::int FROM auth_identities WHERE kind='client') AS clients,
    (SELECT count(*)::int FROM auth_identities WHERE kind='employee') AS employee_identities,
    (SELECT count(*)::int FROM client_accounts) AS accounts,
    (SELECT count(*)::int FROM client_contracts) AS contracts,
    (SELECT count(*)::int FROM client_access_grants WHERE revoked_at IS NULL) AS grants,
    (SELECT count(*)::int FROM hr_employees) AS employees,
    (SELECT count(*)::int FROM auth_employee_access) AS employee_access,
    (SELECT count(*)::int FROM auth_permissions WHERE permission='employees.self_service' AND revoked_at IS NULL) AS employee_permissions,
    (SELECT count(*)::int FROM crm_companies WHERE display_name LIKE 'DEMO FICTÍCIA%') AS demo_companies,
    (SELECT count(*)::int FROM crm_opportunities WHERE title LIKE 'DEMO — %') AS demo_opportunities,
    (SELECT count(*)::int FROM crm_tasks WHERE title LIKE 'DEMO — %') AS demo_tasks,
    (SELECT count(*)::int FROM emp_journey_corrections WHERE reason LIKE 'DEMONSTRAÇÃO FICTÍCIA%') AS demo_corrections,
    (SELECT count(*)::int FROM ext_compliance_obligations WHERE title LIKE 'DEMO — %') AS demo_obligations,
    (SELECT count(*)::int FROM ext_compliance_tasks WHERE facts->>'synthetic'='true') AS demo_compliance_tasks,
    (SELECT count(*)::int FROM ext_knowledge_base WHERE slug='demo-rotina-interna') AS demo_knowledge,
    (SELECT count(*)::int FROM ext_expansion_plans WHERE protocol LIKE 'EXP-EXT-%-DEMO') AS demo_expansions,
    (SELECT count(*)::int FROM ext_continuity_plans WHERE protocol LIKE 'CONT-EXT-%-DEMO') AS demo_continuity,
    (SELECT count(*)::int FROM fin_expenses WHERE protocol LIKE 'DES-FIN-%-DEMO') AS demo_expenses,
    (SELECT count(*)::int FROM ops_occurrence_book WHERE protocol LIKE 'DEMO-OPS-%') AS demo_occurrences,
    (SELECT count(*)::int FROM ai_rag_indexes WHERE name LIKE 'DEMO — Base %') AS demo_rag_indexes,
    (SELECT count(*)::int FROM ai_rag_documents WHERE title LIKE 'DEMO — %') AS demo_rag_documents,
    (SELECT count(*)::int FROM ext_analytics_experiments WHERE protocol LIKE 'AB-EXT-%-DEMO') AS demo_analytics_drafts,
    (SELECT count(*)::int FROM emp_time_punches) AS fabricated_gps_punches,
    (SELECT count(*)::int FROM audit_log WHERE action='demo_f03_seed') AS seed_audit`);
  // A contagem de migrações vem do disco: fixá-la como literal só cria um
  // segundo lugar para esquecer de atualizar. As demais contagens descrevem
  // explicitamente a massa sintética F03 e também provam replay sem duplicação.
  const expectedMigrations = (await readdir(path.join(root,'db/migrations'))).filter(f => /^\d{3}-.*\.sql$/.test(f)).length;
  const expectedSeed = { migrations:expectedMigrations,staff:7,clients:2,employee_identities:1,
    accounts:2,contracts:2,grants:2,employees:1,employee_access:1,employee_permissions:1,
    demo_companies:2,demo_opportunities:2,demo_tasks:2,demo_corrections:1,demo_obligations:1,
    demo_compliance_tasks:1,demo_knowledge:1,demo_expansions:1,demo_continuity:1,demo_expenses:1,
    demo_occurrences:1,demo_rag_indexes:4,demo_rag_documents:5,demo_analytics_drafts:1,
    fabricated_gps_punches:0,seed_audit:1 };
  if (JSON.stringify(before) !== JSON.stringify(expectedSeed)) {
    throw new Error(`demo_seed_counts_mismatch: ${JSON.stringify(before)} != ${JSON.stringify(expectedSeed)}`);
  }
  console.log('F03_SEED_REPLAY: no-op; credentials unchanged; 7 staff, clients A/B and employee isolated');
  expect(await request('/api/client/accounts'), 401, 'ANON_DENIED');
  const tiLogin = await request('/api/admin/session', { email:ti[1], password:ti[2] });
  expect(tiLogin, 200, 'TI_INDIVIDUAL_LOGIN');
  const seededA = firstLog.match(/CLIENTE_A: (\S+) \/ (\S+)/);
  const seededB = firstLog.match(/CLIENTE_B: (\S+) \/ (\S+)/);
  const seededEmployee = firstLog.match(/FUNCIONARIO: (\S+) \/ (\S+)/);
  if (!seededA || !seededB || !seededEmployee) throw new Error('demo_f03_credentials_missing');
  const loginA = await request('/api/auth/login', { email:seededA[1], password:seededA[2] });
  const loginB = await request('/api/auth/login', { email:seededB[1], password:seededB[2] });
  expect(loginA, 200, 'F03_CLIENT_A_LOGIN'); expect(loginB, 200, 'F03_CLIENT_B_LOGIN');
  const visibleA = await request('/api/client/accounts', undefined, loginA.cookie);
  const visibleB = await request('/api/client/accounts', undefined, loginB.cookie);
  expect(visibleA, 200, 'F03_CLIENT_A_SCOPE'); expect(visibleB, 200, 'F03_CLIENT_B_SCOPE');
  if (visibleA.data.accounts?.length !== 1 || !visibleA.data.accounts[0].display_name.includes('Empresa A') ||
      visibleB.data.accounts?.length !== 1 || !visibleB.data.accounts[0].display_name.includes('Empresa B') ||
      visibleA.data.accounts[0].id === visibleB.data.accounts[0].id) throw new Error('demo_f03_client_scope_leak');
  const employeeLogin = await request('/api/employee/session', {
    email:seededEmployee[1], password:seededEmployee[2],
  });
  expect(employeeLogin, 200, 'F03_EMPLOYEE_LOGIN');
  const employeeMe = await request('/api/employee/me', undefined, employeeLogin.cookie);
  expect(employeeMe, 200, 'F03_EMPLOYEE_OWN_PROFILE');
  if (employeeMe.data.employee?.display_name !== 'Funcionário Fictício F03') throw new Error('demo_f03_employee_scope_mismatch');
  const realDomain = await request('/api/admin/invites', { email:'pessoa@empresa.com.br' }, tiLogin.cookie);
  expect(realDomain, 400, 'REAL_ADDRESS_REFUSED');
  if (realDomain.data.error !== 'demo_synthetic_address_required' || realDomain.data.inviteUrl) {
    throw new Error('demo_real_address_generated_invite');
  }
  const email = 'qa.demo.cliente@example.invalid', password = randomBytes(24).toString('base64url');
  const invite = await request('/api/admin/invites', { email, scopeNote:'Demo fictícia QA' }, tiLogin.cookie);
  expect(invite, 201, 'CLIENT_INVITED');
  // L02: sem SMTP o convite é gravado na CAIXA LOCAL. O estado honesto é
  // 'local_outbox' (nunca 'sent'), e o token deixa de ser ecoado na resposta —
  // o operador o obtém abrindo a mensagem, que é o caminho real e auditado.
  if (invite.data.emailStatus !== 'local_outbox') throw new Error(`demo_smtp_must_be_off: ${invite.data.emailStatus}`);
  if (invite.data.inviteUrl) throw new Error('demo_invite_token_leaked_in_response');
  const box = await request(`/api/admin/outbox?recipient=${encodeURIComponent(email)}`, undefined, tiLogin.cookie);
  expect(box, 200, 'LOCAL_OUTBOX_LISTED');
  if (box.data.messages?.length !== 1) throw new Error('demo_invite_not_in_local_outbox');
  if (box.data.messages[0].body) throw new Error('demo_outbox_list_leaked_body');
  const opened = await request(`/api/admin/outbox/${box.data.messages[0].id}`, undefined, tiLogin.cookie);
  expect(opened, 200, 'LOCAL_OUTBOX_OPENED');
  const inviteToken = /\/cliente\/convite\?token=([A-Za-z0-9_-]+)/.exec(opened.data.message?.body || '')?.[1];
  if (!inviteToken) throw new Error('demo_invite_token_not_in_local_outbox');
  const accepted = await request('/api/auth/invite/accept', { token:inviteToken,
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
  const runningBackup = await snapshot('--backup', snapshotDir);
  if (runningBackup.code !== 1 || !runningBackup.output.includes('EEXIST')) throw new Error('demo_live_snapshot_not_refused');
  if ((await readdir(tmpdir())).includes(path.basename(snapshotDir))) throw new Error('demo_live_snapshot_created');
  console.log('QA-HOM-009_LIVE_BACKUP_REFUSED: runner lock held; no snapshot written');
  await pool.end(); pool = undefined;
  await stop();
  if ((await readdir(dir)).includes('run.lock')) throw new Error('demo_run_lock_left_after_graceful_stop');
  const copied = await snapshot('--backup', snapshotDir);
  if (copied.code !== 0 || !copied.output.includes('DEMO_SNAPSHOT_COLD_COPY_OK')) throw new Error('demo_cold_copy_failed');
  const verified = await snapshot('--verify', snapshotDir);
  if (verified.code !== 0 || !verified.output.includes('DEMO_SNAPSHOT_SELF_CHECK_OK')) throw new Error('demo_snapshot_verify_failed');
  const restored = await snapshot('--restore-copy', snapshotDir, restoredDir);
  if (restored.code !== 0 || !restored.output.includes('DEMO_RESTORE_ISOLATED_COPY_OK')) {
    throw new Error(`demo_isolated_restore_failed exit=${restored.code}: ${restored.output.slice(0,480)}`);
  }
  if (!(await readdir(restoredDir)).includes('documents')) throw new Error('demo_empty_documents_dir_not_restored');
  console.log('QA-HOM-009_COPY_RESTORE: cold copy + self-check + isolated PostgreSQL marker/ledger + empty documents dir; no source overwrite');
  logs.length = 0; child = spawnDemo('--start', { SEG_DEMO_TEST_DIR:restoredDir }); await ready(child);
  const restoredAccess = await request('/api/client/accounts', undefined, clientLogin.cookie);
  expect(restoredAccess, 200, 'RESTORED_HTTP_CLIENT');
  if (restoredAccess.data.accounts?.length !== 1 || restoredAccess.data.accounts[0].id !== accountA.id) {
    throw new Error('demo_restored_http_scope_mismatch');
  }
  await stop();
  console.log('QA-HOM-009_RESTORED_HTTP_SCOPE: client A visible, B hidden, original source left stopped');
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
  if (JSON.stringify(after) !== JSON.stringify({ mutated:1,grants:1,staff:7,reviews:1,marker:1 })) throw new Error('demo_restart_lost_data');
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
    for (const owned of [dir,snapshotDir,restoredDir]) await rm(owned, { recursive:true, force:true });
    console.log('QA-HOM-008/009_TEMP_CLEANED: true');
  } else { console.error('QA-HOM-008_TEMP_LEFT_FOR_INSPECTION: child still running'); result = 1; }
}
process.exit(result);
