import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import pg from 'pg';
import { provisionStaff } from './helpers/staff-login.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const databaseUrl = process.env.DATABASE_MIGRATION_URL || '';
const allowed = process.env.RUN_CLI_V2_QA === '1' && databaseUrl &&
  new URL(databaseUrl).hostname === '127.0.0.1' && new URL(databaseUrl).pathname === '/seg_qa_cli_v2';
const testOptions = allowed ? {} : { skip: 'requires scripts/qa-cli-v2-postgres.mjs local disposable PG' };
const SESSION_SECRET = 'qa-cli-v2-session-secret-000000000000000000000000';
const ADMIN_TOKEN = 'qa-cli-v2-admin-token-000000000000000000000000';

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address(); probe.close(() => resolve(port));
    });
  });
}

// L01/SEC-04: cookie forjado não vale mais (a sessão tem estado no servidor).
// Para provar AUTORIZAÇÃO (403) e não apenas autenticação (401), o teste
// precisa de uma sessão de RH legítima, obtida pelo login real.
async function staffCookieFor(pool, api, role) {
  const staff = await provisionStaff(pool, { role });
  const login = await api('/api/admin/session', { method: 'POST', body: { email: staff.email, password: staff.password } });
  assert.equal(login.status, 200, `login ${role}: ${JSON.stringify(login.body)}`);
  return login.setCookie.map(c => c.split(';')[0]).join('; ');
}

async function ready(child, logs) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('server exited early: ' + logs.join('').slice(-700));
    if (logs.join('').includes('listening on')) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('server did not start: ' + logs.join('').slice(-700));
}

test('TENANT-SEG-003 / PLT-AUD-003: HTTP CLI v2 docs staff-only, legacy client scope and audit on PG 001–098', testOptions, async t => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 3 });
  const files = new Map();
  for (const name of ['next-env.d.ts', 'tsconfig.json']) files.set(name, await readFile(path.join(projectRoot, name), 'utf8').catch(() => null));
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs', '--dev'], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl, DATABASE_MIGRATION_URL: '', QA_MIGRATION_ONLY: '',
      PORT: String(port), BIND_HOST: '127.0.0.1', NODE_ENV: 'development',
      NEXT_DIST_DIR: '.next/integration-cli-v2', PUBLIC_BASE_URL: origin, TRUST_PROXY: 'false',
      SITE_ADMIN_TOKEN_MARCELO: '', SITE_ADMIN_TOKEN_TI: ADMIN_TOKEN,
      SITE_ADMIN_SESSION_SECRET: SESSION_SECRET, MAIL_HOST: '', OLLAMA_ENABLED: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  child.stdout.on('data', chunk => logs.push(String(chunk)));
  child.stderr.on('data', chunk => logs.push(String(chunk)));
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise(resolve => child.once('exit', resolve));
    }
    await pool.end();
    for (const [name, content] of files) if (content !== null) await writeFile(path.join(projectRoot, name), content);
  });

  const idA = randomUUID(), idB = randomUUID(), accountA = randomUUID(), accountB = randomUUID();
  const tokenA = randomBytes(32).toString('hex');
  await pool.query("INSERT INTO auth_identities (id, kind, email, status, verification_method, verified_at) VALUES ($1,'client','qa-a@exemplo.invalid','active','email_link',NOW()),($2,'client','qa-b@exemplo.invalid','active','email_link',NOW())", [idA, idB]);
  await pool.query("INSERT INTO client_accounts (id, display_name, created_by) VALUES ($1,'QA Conta A','ti'),($2,'QA Conta B','ti')", [accountA, accountB]);
  await pool.query("INSERT INTO client_access_grants (id, identity_id, client_account_id, reason, granted_by) VALUES ($1,$2,$3,'QA synthetic only','ti')", [randomUUID(), idA, accountA]);
  const contractB = randomUUID();
  await pool.query(`INSERT INTO client_contracts (id, client_account_id, title, service, created_by)
    VALUES ($1,$2,'QA contrato B','QA serviço sintético','ti')`, [contractB, accountB]);
  await pool.query("INSERT INTO auth_sessions (id, identity_id, token_hash, expires_at) VALUES ($1,$2,$3,NOW() + INTERVAL '1 hour')", [randomUUID(), idA, createHash('sha256').update(tokenA).digest('hex')]);
  const cookieA = `seg_client_session=${tokenA}`;

  const docA = randomUUID(), docB = randomUUID();
  for (const [id, account, suffix] of [[docA, accountA, 'A'], [docB, accountB, 'B']]) {
    await pool.query(`INSERT INTO cli_client_documents_v2 (id, client_account_id, title, file_name, file_url, storage_key, status)
      VALUES ($1,$2,$3,$4,$5,$6,'publicado')`, [id, account, `QA documento ${suffix}`, `qa-${suffix}.pdf`, `/qa/secret-${suffix}`, `qa-key-${suffix}`]);
  }
  await pool.query("INSERT INTO cli_document_versions (document_id, version, file_name, file_url, storage_key) VALUES ($1,1,'qa-A.pdf','/qa/secret-A','qa-key-A')", [docA]);
  await pool.query(`INSERT INTO cli_client_contacts (client_account_id, display_name, email, status)
    VALUES ($1,'QA Contato A','qa-contato-a@exemplo.invalid','ativo'),
           ($2,'QA Contato B','qa-contato-b@exemplo.invalid','ativo')`, [accountA, accountB]);
  const ticketB = randomUUID();
  await pool.query(`INSERT INTO cli_tickets_v2 (id, protocol, client_account_id, title, description)
    VALUES ($1,'CLI-20260928-TEST',$2,'QA chamado B','Conteúdo sintético da conta B')`, [ticketB, accountB]);
  await ready(child, logs);

  async function api(url, { method = 'GET', cookie, body } = {}) {
    const headers = { Origin: origin };
    if (cookie) headers.Cookie = cookie;
    if (body) headers['Content-Type'] = 'application/json';
    const response = await fetch(origin + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await response.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 200) }; }
    return { status: response.status, body: parsed, setCookie: response.headers.getSetCookie?.() || [] };
  }

  // L01/SEC-05: conta individual de staff; o token compartilhado é recusado.
  const staff = await provisionStaff(pool, { role: 'ti' });
  const login = await api('/api/admin/session', { method: 'POST', body: { email: staff.email, password: staff.password } });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const adminCookie = login.setCookie.map(c => c.split(';')[0]).join('; ');
  assert.match(adminCookie, /seg_admin_session=/);
  const rhCookie = await staffCookieFor(pool, api, 'rh');

  await t.test('PLT-BAK-001: backup/restore HTTP não criam sucesso simulado e legado não é certificado', async () => {
    const legacyId = randomUUID();
    await pool.query(`INSERT INTO backup_jobs(id, backup_type, status, storage_location, checksum, created_by, is_restore_tested)
      VALUES ($1,'full','success','encrypted://qa/legacy','sha256:qa-fake','ti',true)`, [legacyId]);
    const denied = await api('/api/admin/backups', { cookie: rhCookie });
    assert.equal(denied.status, 403);
    const listed = await api('/api/admin/backups', { cookie: adminCookie });
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    const fake = listed.body.backups.find(row => row.id === legacyId);
    assert.equal(fake.status, 'unverified');
    assert.equal(fake.recorded_status, 'success');
    assert.equal(fake.is_restore_tested, false);
    assert.equal(fake.recorded_is_restore_tested, true);
    assert.equal(fake.verified_artifact, false);
    assert.match(listed.body.note, /não comprovam/);
    for (const [route, method, body, error] of [
      ['/api/admin/backups', 'POST', { backup_type: 'full' }, 'backup_execution_unavailable'],
      ['/api/admin/backups/restores', 'POST', { backup_job_id: legacyId, restore_type: 'test' }, 'restore_execution_unavailable'],
      [`/api/admin/backups/${legacyId}`, 'PATCH', { status: 'success' }, 'backup_job_mutation_unavailable'],
      [`/api/admin/backups/${legacyId}`, 'DELETE', undefined, 'backup_job_mutation_unavailable'],
    ]) {
      const rejected = await api(route, { method, cookie: adminCookie, body });
      assert.equal(rejected.status, 503, `${method} ${route}: ${JSON.stringify(rejected.body)}`);
      assert.equal(rejected.body.error, error);
    }
    const { rows: [unchanged] } = await pool.query(`SELECT
      (SELECT count(*)::int FROM backup_jobs) AS jobs,
      (SELECT count(*)::int FROM backup_restores) AS restores,
      (SELECT status FROM backup_jobs WHERE id=$1) AS status`, [legacyId]);
    assert.equal(unchanged.jobs, 1);
    assert.equal(unchanged.restores, 0);
    assert.equal(unchanged.status, 'success', 'histórico preservado sem certificá-lo');
  });

  await t.test('valid portal client cookie works on legacy account scope, but cannot read any v2 document alias', async () => {
    const legacy = await api(`/api/client/documents?account=${accountA}`, { cookie: cookieA });
    assert.equal(legacy.status, 200, JSON.stringify(legacy.body));
    const aliases = [
      `/api/client/documents-v2?client_account_id=${accountA}`,
      `/api/client/documents-v2?client_account_id=${accountB}`,
      `/api/client/document-download?document_id=${docA}`,
      `/api/client/document-download?document_id=${docB}`,
      `/api/cli/document-versions?document_id=${docA}`,
    ];
    for (const alias of aliases) {
      const result = await api(alias, { cookie: cookieA });
      assert.equal(result.status, 401, `${alias}: ${JSON.stringify(result.body)}`);
      assert.ok(!JSON.stringify(result.body).includes('secret-'), 'URL de armazenamento não deve vazar');
    }
    const anon = await api(`/api/client/document-download?document_id=${docB}`);
    assert.equal(anon.status, 401);
  });

  await t.test('signed RH staff session cannot read/list/write v2 documents via any alias', async () => {
    for (const alias of [
      '/api/cli/client-documents-v2', '/api/client/documents-v2',
      `/api/cli/document-versions?document_id=${docA}`,
      `/api/client/document-download?document_id=${docA}`,
      `/api/cli/document-download?document_id=${docB}`,
    ]) {
      const response = await api(alias, { cookie: rhCookie });
      assert.equal(response.status, 403, `${alias}: ${JSON.stringify(response.body)}`);
      assert.ok(!JSON.stringify(response.body).includes('secret-'));
    }
    const deniedWrite = await api('/api/client/documents-v2', { method: 'POST', cookie: rhCookie, body: { client_account_id: accountA, title: 'QA denied' } });
    assert.equal(deniedWrite.status, 403);
    for (const alias of ['/api/client/tickets-v2', '/api/cli/tickets-v2', '/api/client/reports-v2', '/api/client/charges-v2']) {
      const denied = await api(alias, { cookie: rhCookie });
      assert.equal(denied.status, 403, `${alias}: ${JSON.stringify(denied.body)}`);
      assert.ok(!JSON.stringify(denied.body).includes(ticketB), 'chamado B não deve vazar');
    }
    for (const alias of ['/api/client/tickets-v2', '/api/client/reports-v2', '/api/client/charges-v2']) {
      const denied = await api(alias, { cookie: cookieA });
      assert.equal(denied.status, 401, `${alias}: cookie do portal não é staff`);
    }
  });

  await t.test('TENANT-SEG-004: RH cannot enumerate contacts, scopes, contracts or document metadata without account grant', async () => {
    for (const alias of ['/api/cli/entry-points', '/api/cli/old-routes', '/api/cli/client-contacts', '/api/cli/contact-scopes', '/api/cli/contract-items', '/api/cli/contract-scopes', '/api/cli/contract-vigencia', '/api/cli/document-categories', '/api/cli/document-access-logs']) {
      const denied = await api(alias, { cookie: rhCookie });
      assert.equal(denied.status, 403, `${alias}: ${JSON.stringify(denied.body)}`);
      assert.ok(!JSON.stringify(denied.body).includes('qa-contato-b@exemplo.invalid'));
      const portal = await api(alias, { cookie: cookieA });
      assert.equal(portal.status, 401);
    }
  });

  await t.test('admin/ti can list metadata and a document creation is persisted in operational audit_log', async () => {
    const list = await api('/api/cli/client-documents-v2', { cookie: adminCookie });
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.ok(list.body.documents.some(d => d.id === docA));
    assert.ok(list.body.documents.some(d => d.id === docB));
    const tickets = await api('/api/cli/tickets-v2', { cookie: adminCookie });
    assert.equal(tickets.status, 200, JSON.stringify(tickets.body));
    assert.ok(tickets.body.tickets.some(ticket => ticket.id === ticketB));
    const inserted = await api('/api/cli/client-documents-v2', { method: 'POST', cookie: adminCookie, body: {
      client_account_id: accountA, title: 'QA novo documento', file_name: 'novo.pdf',
      file_url: '/qa/new-doc', storage_key: 'qa-new-doc', status: 'rascunho',
    } });
    assert.equal(inserted.status, 201, JSON.stringify(inserted.body));
    const newId = inserted.body.document.id;
    const { rows: audit } = await pool.query("SELECT id, action, actor, target FROM audit_log WHERE action='cli_document_create' AND target=$1", [newId]);
    assert.equal(audit.length, 1, 'audit_log deve registrar criação no caminho HTTP real');
    // L01: a auditoria passa a identificar a PESSOA (identityId), não o papel.
    assert.equal(audit[0].actor, staff.id,
      'auditoria sensível precisa identificar a identidade individual, não apenas o papel');
    const download = await api(`/api/cli/document-download?document_id=${docA}`, { cookie: adminCookie });
    assert.equal(download.status, 200, JSON.stringify(download.body));
    assert.equal(download.body.download_url, '/qa/secret-A');
    assert.match(download.body.note, /não é streaming privado/);
    const { rows: auditsDownload } = await pool.query("SELECT id FROM audit_log WHERE action='cli_document_download' AND target=$1", [docA]);
    assert.equal(auditsDownload.length, 1);
  });

  await t.test('TENANT-SEG-004: admin cannot link a document in account A to a contract in B', async () => {
    const rejected = await api('/api/cli/client-documents-v2', { method: 'POST', cookie: adminCookie, body: {
      client_account_id: accountA, contract_id: contractB, title: 'QA vínculo cruzado A B',
      file_name: 'cross.pdf', file_url: '/qa/cross', storage_key: 'qa-cross-account',
    } });
    assert.equal(rejected.status, 400, JSON.stringify(rejected.body));
    const { rows: [{ n }] } = await pool.query("SELECT count(*)::int AS n FROM cli_client_documents_v2 WHERE storage_key='qa-cross-account'");
    assert.equal(n, 0);
  });

  await t.test('PLT-AUD-004: injected operational audit failure rolls back v2 document and version', async () => {
    // Falha artificial apenas neste cluster QA descartável; sem DROP em banco preexistente.
    await pool.query(`CREATE FUNCTION qa_reject_cli_document_audit() RETURNS trigger AS $$
      BEGIN IF NEW.action='cli_document_create' THEN RAISE EXCEPTION 'qa_injected_audit_unavailable'; END IF;
      RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER qa_reject_cli_document_audit BEFORE INSERT ON audit_log
      FOR EACH ROW EXECUTE FUNCTION qa_reject_cli_document_audit()`);
    try {
      const failed = await api('/api/cli/client-documents-v2', { method: 'POST', cookie: adminCookie, body: {
        client_account_id: accountA, title: 'QA auditar ou rejeitar', file_name: 'qa-audit.pdf',
        file_url: '/qa/no-exposure', storage_key: 'qa-injected-audit-fail', status: 'rascunho',
      } });
      assert.equal(failed.status, 503, JSON.stringify(failed.body));
      const { rows: [row] } = await pool.query(`SELECT
        (SELECT count(*)::int FROM cli_client_documents_v2 WHERE storage_key='qa-injected-audit-fail') AS documents,
        (SELECT count(*)::int FROM cli_document_versions WHERE storage_key='qa-injected-audit-fail') AS versions`);
      assert.equal(row.documents, 0, 'não persistir documento se auditoria falhar');
      assert.equal(row.versions, 0, 'não persistir versão órfã se auditoria falhar');
    } finally {
      await pool.query('DROP TRIGGER qa_reject_cli_document_audit ON audit_log');
      await pool.query('DROP FUNCTION qa_reject_cli_document_audit()');
    }
  });

  await t.test('CLI-09: rota canônica do portal serve só as cobranças integradas da própria conta', async () => {
    // Três cobranças sintéticas para separar os dois filtros da rota: uma
    // integrada na conta A (deve aparecer), uma NÃO integrada na conta A
    // (filtrada por finance_integration_active) e uma integrada na conta B
    // (filtrada pelo escopo de grant).
    const visivel = randomUUID(), naoIntegrada = randomUUID(), outraConta = randomUUID();
    await pool.query(`INSERT INTO cli_charges_v2
        (id, protocol, client_account_id, amount_cents, due_date, finance_integration_active)
      VALUES ($1,'CHG-CLI-20261010-QA0A',$2,15000,'2026-11-05',true),
             ($3,'CHG-CLI-20261010-QA0B',$2,25000,'2026-11-10',false),
             ($4,'CHG-CLI-20261010-QA0C',$5,35000,'2026-11-15',true)`,
      [visivel, accountA, naoIntegrada, outraConta, accountB]);

    const anon = await api('/api/client/cobrancas');
    assert.equal(anon.status, 401, JSON.stringify(anon.body));
    assert.equal(anon.body.error, 'client_session_required');

    const portal = await api('/api/client/cobrancas', { cookie: cookieA });
    assert.equal(portal.status, 200, JSON.stringify(portal.body));
    const protocolos = portal.body.charges.map(row => row.protocol);
    assert.ok(protocolos.includes('CHG-CLI-20261010-QA0A'), 'cobrança integrada da própria conta deve aparecer');
    assert.ok(!protocolos.includes('CHG-CLI-20261010-QA0B'), 'cobrança não integrada não deve aparecer');
    assert.ok(!protocolos.includes('CHG-CLI-20261010-QA0C'), 'cobrança de outra conta não deve aparecer');

    // Sessão de staff não é sessão de cliente: a rota do portal é só do cliente.
    // É o outro lado da separação que tornou /api/client/charges-v2 só de staff.
    for (const [rotulo, cookie] of [['TI', adminCookie], ['RH', rhCookie]]) {
      const negado = await api('/api/client/cobrancas', { cookie });
      assert.equal(negado.status, 401, `${rotulo}: ${JSON.stringify(negado.body)}`);
    }

    // sameOrigin() libera GET/HEAD de propósito (navegadores não mandam Origin
    // em GET same-origin), então o guarda de origem só é observável em método
    // que muda estado. O 405 e o 403 são provados com POST, nunca com GET.
    const metodoErrado = await api('/api/client/cobrancas', { method: 'POST', cookie: cookieA, body: {} });
    assert.equal(metodoErrado.status, 405, JSON.stringify(metodoErrado.body));
    const origemEstrangeira = await fetch(origin + '/api/client/cobrancas', {
      method: 'POST',
      headers: { Origin: 'https://origem-estranha.invalid', Cookie: cookieA, 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(origemEstrangeira.status, 403, 'origem estrangeira em método que muda estado');
  });

  await t.test('revoking client grant closes the legacy account route; v2 remains disabled', async () => {
    await pool.query('UPDATE client_access_grants SET revoked_at=NOW(), revoked_by=\'ti\', revoke_reason=\'QA revocation\' WHERE identity_id=$1 AND client_account_id=$2', [idA, accountA]);
    const legacy = await api(`/api/client/documents?account=${accountA}`, { cookie: cookieA });
    assert.equal(legacy.status, 403, JSON.stringify(legacy.body));
    const v2 = await api(`/api/client/documents-v2?client_account_id=${accountA}`, { cookie: cookieA });
    assert.equal(v2.status, 401);
  });

  await t.test('CLI-09: grant revogado esvazia a rota canônica do portal sem derrubar a sessão', async () => {
    const portal = await api('/api/client/cobrancas', { cookie: cookieA });
    assert.equal(portal.status, 200, JSON.stringify(portal.body));
    assert.deepEqual(portal.body.charges, [], 'sem grant ativo não há cobrança visível');
  });
});
