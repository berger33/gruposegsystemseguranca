// PLT-09 — privacidade: jornada/RBAC/evidência em HTTP real + PostgreSQL 17 real.
//
// Invariante: inventário de dados/finalidades, política com aprovação antes de
// publicar (`is_published` derivado do estado), pedido LGPD do titular com
// verificação de identidade e retenção/descarte declarativos — tudo no contrato
// que as três abas já montadas usam. Leitura não grava auditoria; escrita exige
// sessão e mesma origem; id torto chega ao handler e recebe 400; método não
// permitido responde 405 com `Allow`; filtro fora do enum é 400.
//
// Requer `RUN_DATABASE_INTEGRATION=1` e `DATABASE_URL` (cluster descartável do
// gate `npm run test:plt09-privacy:pg`). Não promove aba, não abre a borda
// legada de RH, não publica política real e não registra aceite humano.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import path from 'node:path';
import pg from 'pg';
import { hashPassword } from '../src/lib/client-auth-core.mjs';
import { LGPD_DECLARED_DUE_DAYS } from '../src/server/privacy-read-contract.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);
const REQUIRE = process.env.QA_PLT09_REQUIRE_DB === '1';
const root = path.resolve(import.meta.dirname, '..');
const opt = { skip: !RUN };
const SESSION_SECRET = randomUUID().repeat(2);
const MFA_KEY = randomBytes(32).toString('base64url');

let server, base, pool, ti, rh, admin, cookieTi, cookieRh, cookieAdmin;
const ids = { policy: null, request: null, job: null, exception: null, retentionPolicy: null };

const freeLoopbackPort = () => new Promise((resolve, reject) => {
  const probe = createServer(); probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

async function startServer() {
  const port = await freeLoopbackPort();
  const distDir = `.next/integration-plt09-${randomUUID().slice(0, 8)}`;
  const child = spawn(process.execPath, ['server.mjs', '--dev'], {
    cwd: root,
    env: {
      ...process.env, PORT: String(port), BIND_HOST: '127.0.0.1', NODE_ENV: 'development',
      NEXT_DIST_DIR: distDir, DATABASE_URL: process.env.DATABASE_URL, DATABASE_MIGRATION_URL: '',
      SITE_ADMIN_SESSION_SECRET: SESSION_SECRET, CLIENT_MFA_ENCRYPTION_KEY: MFA_KEY,
      SITE_ADMIN_LEGACY_TOKENS: '', OLLAMA_ENABLED: 'false', MAIL_HOST: '', NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 300; i += 1) {
    try {
      const response = await fetch(`${origin}/api/admin/session`);
      if ([200, 401].includes(response.status)) return { child, origin };
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  child.kill('SIGKILL');
  throw new Error(`server_did_not_start\n${logs.slice(-3000)}`);
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill('SIGTERM');
  await new Promise(resolve => setTimeout(resolve, 300));
  child.kill('SIGKILL');
}

async function staff(role) {
  const id = randomUUID();
  const email = `qa-plt09-${role}-${id.slice(0, 8)}@example.invalid`;
  const password = 'Senha-Sintetica-09!';
  await pool.query(`INSERT INTO auth_identities(id,kind,email,display_name,status) VALUES($1,'staff',$2,$3,'active')`, [id, email, `QA PLT-09 ${role}`]);
  await pool.query(`INSERT INTO auth_credentials(identity_id,password_hash) VALUES($1,$2)`, [id, await hashPassword(password)]);
  await pool.query(`INSERT INTO auth_staff_profiles(identity_id,role,assigned_by) VALUES($1,$2,'admin_system')`, [id, role]);
  return { id, email, password };
}

async function login(person) {
  const response = await fetch(`${base}/api/admin/session`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email: person.email, password: person.password }),
  });
  assert.equal(response.status, 200, `login ${person.email}`);
  const cookie = response.headers.getSetCookie().find(value => value.startsWith('seg_admin_session='));
  assert.ok(cookie, `sessão real de ${person.email}`);
  return cookie.split(';')[0];
}

async function call(pathname, options = {}) {
  const { method = 'GET', cookie = cookieTi, body, headers = {}, originHeader = null, originBase = base } = options;
  const requestHeaders = { accept: 'application/json', ...headers };
  if (cookie) requestHeaders.cookie = cookie;
  if (method !== 'GET' || originHeader) requestHeaders.origin = originHeader || originBase;
  if (body !== undefined) requestHeaders['content-type'] = 'application/json';
  const response = await fetch(`${originBase}${pathname}`, {
    method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  return { response, body: parsed, text };
}

async function auditAccessCount() {
  return (await pool.query('SELECT count(*)::int AS n FROM auth_access_audit')).rows[0].n;
}

async function auditLogCount() {
  return (await pool.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n;
}

async function telemetryRow(requestId) {
  for (let i = 0; i < 60; i += 1) {
    const result = await pool.query(
      `SELECT request_id, correlation_id, method, path, status_code
       FROM observability_http_requests WHERE request_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [requestId]);
    if (result.rows[0]) return result.rows[0];
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return null;
}

before(async () => {
  if (!RUN) return;
  ({ child: server, origin: base } = await startServer());
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
  [ti, rh, admin] = await Promise.all([staff('ti'), staff('rh'), staff('admin')]);
  [cookieTi, cookieRh, cookieAdmin] = await Promise.all([login(ti), login(rh), login(admin)]);
  // Uma política de retenção ativa e uma exceção: dá base determinística para o
  // job de descarte provar que `total_scanned` não é "políticas × 10".
  const policy = await pool.query(
    `INSERT INTO data_retention_policies(category, field_pattern, retention_days, description, legal_basis, created_by)
     VALUES('contato','email_plt09',365,'Retenção declarada do prober PLT-09','consentimento','qa')
     ON CONFLICT (category, field_pattern) DO UPDATE SET retention_days=EXCLUDED.retention_days RETURNING id`);
  ids.retentionPolicy = policy.rows[0].id;
  const exception = await pool.query(
    `INSERT INTO retention_exceptions(category, field_reference, reason, justification, requested_retention_days, expires_at, requested_by)
     VALUES('contato','email_plt09','Motivo sintético do prober','Justificativa sintética do prober',30, CURRENT_DATE + 10, 'qa') RETURNING id`);
  ids.exception = exception.rows[0].id;
  await fetch(`${base}/api/health/live`);
  await new Promise(resolve => setTimeout(resolve, 300));
});

after(async () => {
  await new Promise(resolve => setTimeout(resolve, 200));
  await pool?.end().catch(() => {});
  await stopServer(server);
});

test('PLT-09 gate exige PostgreSQL real e não aceita skip silencioso', () => {
  if (REQUIRE) assert.ok(RUN);
});

test('PLT-09 gate: o cluster descartável aplicou 001–183 e a próxima migração livre é 184', opt, async () => {
  const ledger = (await pool.query(
    `SELECT count(*)::int AS n, min(filename) AS primeira, max(filename) AS ultima FROM __migrations WHERE filename LIKE '___-%'`,
  )).rows[0];
  assert.equal(ledger.n, 183);
  assert.match(ledger.primeira, /^001-/);
  assert.match(ledger.ultima, /^183-/);
  assert.equal(184, 183 + 1, 'a próxima migração livre declarada é 184 (a 182 é do E16, a 183 é do CHECK de auditoria; esta fatia não cria migração)');
});

test('PLT-09 HTTP: anônimo recebe 401 nas quatro leituras de privacidade', opt, async () => {
  // Duas famílias de mensagem convivem hoje: privacy/lgpd respondem
  // `admin_session_required`; retenção responde `unauthorized`. Nenhuma foi
  // unificada nesta fatia — o invariante provado é o 401.
  const expected = {
    '/api/admin/privacy/inventory': 'admin_session_required',
    '/api/admin/privacy/policies': 'admin_session_required',
    '/api/admin/lgpd/requests': 'admin_session_required',
    '/api/admin/retention/policies': 'unauthorized',
  };
  for (const [pathname, error] of Object.entries(expected)) {
    const { response, body } = await call(pathname, { cookie: null });
    assert.equal(response.status, 401, pathname);
    assert.equal(body.error, error, pathname);
  }
});

test('PLT-09 HTTP: rh continua barrado na escrita de privacidade e liberado na leitura já existente', opt, async () => {
  const read = await call('/api/admin/privacy/inventory', { cookie: cookieRh });
  assert.equal(read.response.status, 200, 'leitura de inventário já era liberada para rh');
  const write = await call('/api/admin/privacy/inventory', {
    method: 'POST', cookie: cookieRh,
    body: { data_category: 'contato', data_field: 'rh_plt09', description: 'd', purpose: 'p', legal_basis: 'outro' },
  });
  assert.equal(write.response.status, 403);
  assert.equal(write.body.error, 'privacy_inventory_restricted_admin_ti');
  const retention = await call('/api/admin/retention/policies', { cookie: cookieRh });
  assert.equal(retention.response.status, 403);
  assert.equal(retention.body.error, 'forbidden');
});

test('PLT-09 HTTP: ti e admin leem inventário, políticas, pedidos LGPD e retenção com 200', opt, async () => {
  for (const cookie of [cookieTi, cookieAdmin]) {
    const inventory = await call('/api/admin/privacy/inventory', { cookie });
    assert.equal(inventory.response.status, 200);
    assert.ok(Array.isArray(inventory.body.inventory));
    assert.ok(inventory.body.inventory.length >= 10, 'o seed da migração 047 precisa estar visível');
    const policies = await call('/api/admin/privacy/policies', { cookie });
    assert.equal(policies.response.status, 200);
    assert.ok(Array.isArray(policies.body.policies));
    assert.ok(Array.isArray(policies.body.inventory));
    const lgpd = await call('/api/admin/lgpd/requests', { cookie });
    assert.equal(lgpd.response.status, 200);
    assert.ok(Array.isArray(lgpd.body.requests));
    for (const pathname of [
      '/api/admin/retention/policies', '/api/admin/retention/exceptions',
      '/api/admin/retention/disposal/jobs', '/api/admin/retention/disposal/logs',
    ]) {
      const { response } = await call(pathname, { cookie });
      assert.equal(response.status, 200, pathname);
    }
  }
});

test('PLT-09 HTTP: same_origin_required nas escritas (GET seguro não exige Origin)', opt, async () => {
  const cross = 'https://example.invalid';
  const inventory = await call('/api/admin/privacy/inventory', {
    method: 'POST', cookie: cookieTi, headers: { origin: cross }, originHeader: cross,
    body: { data_category: 'contato', data_field: 'x', description: 'd', purpose: 'p', legal_basis: 'outro' },
  });
  assert.equal(inventory.response.status, 403);
  assert.equal(inventory.body.error, 'same_origin_required');
  const lgpd = await call('/api/public/lgpd', {
    method: 'POST', cookie: null, headers: { origin: cross }, originHeader: cross,
    body: { request_type: 'acesso', requester_name: 'Titular', requester_email: 'titular@exemplo.invalid', description: 'pedido sintetico cross origin' },
  });
  assert.equal(lgpd.response.status, 403);
  assert.equal(lgpd.body.error, 'same_origin_required');
  const readCross = await call('/api/admin/privacy/inventory', { cookie: cookieTi, headers: { origin: cross }, originHeader: cross });
  assert.equal(readCross.response.status, 200, 'leitura segura não exige Origin');
});

test('PLT-09 HTTP+DB: inventário é gravável por ti e por admin (RED: 403 para os dois)', opt, async () => {
  for (const [role, cookie] of [['ti', cookieTi], ['admin', cookieAdmin]]) {
    const payload = {
      data_category: 'contato', data_field: `email_${role}_plt09`, description: 'Campo sintético do prober',
      purpose: 'Provar escrita de inventário', legal_basis: 'consentimento', retention_days: 365,
      recipients: ['ti'], is_sensitive: false, is_required: false, source: 'qa_plt09',
    };
    const { response, body } = await call('/api/admin/privacy/inventory', { method: 'POST', cookie, body: payload });
    assert.equal(response.status, 200, `${role} precisa gravar (obteve ${response.status} ${JSON.stringify(body?.error)})`);
    assert.ok(body.item && body.item.id);
    const row = (await pool.query('SELECT * FROM privacy_data_inventory WHERE id=$1', [body.item.id])).rows[0];
    assert.equal(row.data_field, `email_${role}_plt09`);
    assert.equal(Number(row.retention_days), 365);
    const audit = (await pool.query("SELECT count(*)::int n FROM audit_log WHERE action='privacy_inventory_create' AND target=$1", [body.item.id])).rows[0].n;
    assert.equal(audit, 1, `${role}: a escrita precisa deixar trilha (RED: auth_access_audit recusava a ação e o catch{} engolia)`);
  }
});

test('PLT-09 HTTP+DB: reenviar o mesmo campo atualiza em vez de duplicar', opt, async () => {
  const payload = {
    data_category: 'contato', data_field: 'email_upsert_plt09', description: 'Primeira versão',
    purpose: 'Provar upsert', legal_basis: 'consentimento', retention_days: 30,
  };
  const first = await call('/api/admin/privacy/inventory', { method: 'POST', cookie: cookieTi, body: payload });
  assert.equal(first.response.status, 200);
  const second = await call('/api/admin/privacy/inventory', {
    method: 'POST', cookie: cookieTi, body: { ...payload, description: 'Segunda versão', retention_days: 60 },
  });
  assert.equal(second.response.status, 200);
  const rows = (await pool.query("SELECT * FROM privacy_data_inventory WHERE data_field='email_upsert_plt09'")).rows;
  assert.equal(rows.length, 1, 'a chave (data_category, data_field) não pode duplicar');
  assert.equal(rows[0].description, 'Segunda versão');
  assert.equal(Number(rows[0].retention_days), 60);
});

test('PLT-09 HTTP: id torto chega ao handler e responde 400 nos seis detalhes (RED: 404 do roteador)', opt, async () => {
  const cases = [
    ['/api/admin/privacy/policies/nao-e-uuid', 'GET', 'invalid_policy_id'],
    ['/api/crm/privacy/policies/nao-e-uuid', 'PATCH', 'invalid_policy_id'],
    ['/api/admin/lgpd/requests/nao-e-uuid', 'GET', 'invalid_request_id'],
    ['/api/crm/lgpd/requests/nao-e-uuid', 'PATCH', 'invalid_request_id'],
    ['/api/admin/retention/exceptions/nao-e-uuid', 'GET', 'invalid_id'],
    ['/api/admin/retention/disposal/jobs/nao-e-uuid', 'GET', 'invalid_id'],
  ];
  for (const [pathname, method, error] of cases) {
    const { response, body } = await call(pathname, { method, cookie: cookieTi, body: method === 'GET' ? undefined : {} });
    assert.equal(response.status, 400, `${method} ${pathname} respondeu ${response.status}`);
    assert.equal(body.error, error, `${method} ${pathname}`);
  }
});

test('PLT-09 HTTP: UUID inexistente responde 404 not_found (não 400)', opt, async () => {
  for (const pathname of [
    `/api/admin/privacy/policies/${randomUUID()}`,
    `/api/admin/lgpd/requests/${randomUUID()}`,
    `/api/admin/retention/exceptions/${randomUUID()}`,
    `/api/admin/retention/disposal/jobs/${randomUUID()}`,
  ]) {
    const { response, body } = await call(pathname, { cookie: cookieTi });
    assert.equal(response.status, 404, pathname);
    assert.equal(body.error, 'not_found', pathname);
  }
});

test('PLT-09 HTTP+DB: criar rascunho de política grava versão, status e trilha', opt, async () => {
  const { response, body } = await call('/api/admin/privacy/policies', {
    method: 'POST', cookie: cookieTi,
    body: {
      title: 'Minuta sintética do prober PLT-09',
      content: 'Minuta técnica sem aprovação jurídica, criada pelo gate para provar o contrato.',
      contact_email: 'contato@exemplo.invalid',
      dpo_name: 'Encarregado a definir (D-11)',
      retention_summary: 'Prazos declarados por categoria.',
      rights_description: 'Direitos do titular declarados.',
      recipients_description: 'Destinatários internos declarados.',
    },
  });
  assert.equal(response.status, 201, `esperado 201, obteve ${response.status} ${JSON.stringify(body?.error)}`);
  assert.equal(body.policy.status, 'rascunho');
  assert.equal(body.policy.is_published, false, 'rascunho não nasce publicado');
  ids.policy = body.policy.id;
  const audit = (await pool.query("SELECT count(*)::int n FROM audit_log WHERE action='privacy_policy_create' AND target=$1", [ids.policy])).rows[0].n;
  assert.equal(audit, 1, 'criar rascunho precisa deixar trilha (RED: nenhuma)');
  const snapshot = body.policy.inventory_snapshot;
  assert.ok(snapshot === null || Array.isArray(snapshot), 'inventory_snapshot é JSON ou nulo');
});

test('PLT-09 HTTP: contato fora da faixa é 400 sem gravar política (RED: 503 do CHECK)', opt, async () => {
  const before = (await pool.query('SELECT count(*)::int n FROM privacy_policies')).rows[0].n;
  for (const contact of ['a', 'sem-arroba', `${'a'.repeat(320)}@exemplo.invalid`]) {
    const { response, body } = await call('/api/admin/privacy/policies', {
      method: 'POST', cookie: cookieTi, body: { title: 'Contato inválido', content: 'Conteúdo mínimo.', contact_email: contact },
    });
    assert.equal(response.status, 400, `contato ${contact.length} caracteres`);
    assert.equal(body.error, 'invalid_contact_email');
  }
  const after = (await pool.query('SELECT count(*)::int n FROM privacy_policies')).rows[0].n;
  assert.equal(after, before, 'nenhuma linha pode ser criada com contato inválido');
});

test('PLT-09 HTTP: publicar direto do rascunho é 400 e não publica', opt, async () => {
  const { response, body } = await call(`/api/admin/privacy/policies/${ids.policy}`, {
    method: 'PATCH', cookie: cookieAdmin, body: { status: 'publicado' },
  });
  assert.equal(response.status, 400);
  assert.equal(body.error, 'must_be_approved_before_publish');
  const row = (await pool.query('SELECT status, is_published FROM privacy_policies WHERE id=$1', [ids.policy])).rows[0];
  assert.equal(row.status, 'rascunho');
  assert.equal(row.is_published, false);
});

test('PLT-09 HTTP+DB: aprovação é restrita a admin e registra responsável', opt, async () => {
  const denied = await call(`/api/admin/privacy/policies/${ids.policy}`, {
    method: 'PATCH', cookie: cookieTi, body: { status: 'aprovado' },
  });
  assert.equal(denied.response.status, 403);
  assert.equal(denied.body.error, 'approval_requires_admin');
  const approved = await call(`/api/admin/privacy/policies/${ids.policy}`, {
    method: 'PATCH', cookie: cookieAdmin, body: { status: 'aprovado' },
  });
  assert.equal(approved.response.status, 200);
  const row = (await pool.query('SELECT status, approved_by, approved_at, is_published FROM privacy_policies WHERE id=$1', [ids.policy])).rows[0];
  assert.equal(row.status, 'aprovado');
  assert.equal(row.approved_by, 'admin');
  assert.ok(row.approved_at);
  assert.equal(row.is_published, false, 'aprovado ainda não é publicado');
  const audit = (await pool.query("SELECT count(*)::int n FROM audit_log WHERE action='privacy_policy_approve' AND target=$1", [ids.policy])).rows[0].n;
  assert.equal(audit, 1, 'aprovar precisa deixar trilha (RED: nenhuma)');
  const publishAuditBefore = (await pool.query("SELECT count(*)::int n FROM audit_log WHERE action='privacy_policy_publish' AND target=$1", [ids.policy])).rows[0].n;
  assert.equal(publishAuditBefore, 0, 'ainda não publicada neste ponto');
});

test('PLT-09 HTTP+DB: publicar mantém is_published=true e arquivar deixa de publicar (RED: continuava publicada)', opt, async () => {
  const published = await call(`/api/admin/privacy/policies/${ids.policy}`, {
    method: 'PATCH', cookie: cookieAdmin, body: { status: 'publicado' },
  });
  assert.equal(published.response.status, 200);
  let row = (await pool.query('SELECT status, is_published, published_at FROM privacy_policies WHERE id=$1', [ids.policy])).rows[0];
  assert.equal(row.status, 'publicado');
  assert.equal(row.is_published, true);
  assert.ok(row.published_at);

  const archived = await call(`/api/admin/privacy/policies/${ids.policy}`, {
    method: 'PATCH', cookie: cookieAdmin, body: { status: 'arquivado' },
  });
  assert.equal(archived.response.status, 200);
  row = (await pool.query('SELECT status, is_published FROM privacy_policies WHERE id=$1', [ids.policy])).rows[0];
  assert.equal(row.status, 'arquivado');
  assert.equal(row.is_published, false, 'arquivar uma política publicada precisa retirar a publicação');

  const publishAudit = (await pool.query("SELECT count(*)::int n FROM audit_log WHERE action='privacy_policy_publish' AND target=$1", [ids.policy])).rows[0].n;
  assert.equal(publishAudit, 1, 'publicar precisa deixar trilha');

  const filtered = await call('/api/admin/privacy/policies?published=true', { cookie: cookieTi });
  assert.equal(filtered.response.status, 200);
  assert.equal(filtered.body.policies.some(policy => policy.id === ids.policy), false, 'política arquivada não aparece como publicada');

  const rejected = await call(`/api/admin/privacy/policies/${ids.policy}`, {
    method: 'PATCH', cookie: cookieAdmin, body: { status: 'rejeitado', rejection_reason: 'Revisão competente encerrada pelo gate' },
  });
  assert.equal(rejected.response.status, 200);
  row = (await pool.query('SELECT status, is_published FROM privacy_policies WHERE id=$1', [ids.policy])).rows[0];
  assert.equal(row.status, 'rejeitado');
  assert.equal(row.is_published, false, 'rejeitar também não pode deixar publicada');
});

test('PLT-09 HTTP: filtros de política fora do enum são 400 (RED: published=talvez voltava 200)', opt, async () => {
  for (const [query, error] of [['published=talvez', 'invalid_published'], ['status=publicada', 'invalid_status']]) {
    const { response, body } = await call(`/api/admin/privacy/policies?${query}`, { cookie: cookieTi });
    assert.equal(response.status, 400, query);
    assert.equal(body.error, error, query);
  }
  const valid = await call('/api/admin/privacy/policies?status=arquivado&published=false', { cookie: cookieTi });
  assert.equal(valid.response.status, 200);
  for (const policy of valid.body.policies) {
    assert.equal(policy.status, 'arquivado');
    assert.equal(policy.is_published, false);
  }
});

test('PLT-09 HTTP: enum de inventário fora do vocabulário é 400', opt, async () => {
  for (const [query, error] of [['category=inventado', 'invalid_category'], ['basis=inventada', 'invalid_legal_basis']]) {
    const { response, body } = await call(`/api/admin/privacy/inventory?${query}`, { cookie: cookieTi });
    assert.equal(response.status, 400, query);
    assert.equal(body.error, error, query);
  }
});

test('PLT-09 HTTP: filtros de retenção fora do enum são 400 (RED: lista inteira em 200)', opt, async () => {
  const cases = [
    ['/api/admin/retention/policies?category=inventado', 'invalid_category'],
    ['/api/admin/retention/policies?is_active=talvez', 'invalid_is_active'],
    ['/api/admin/retention/exceptions?status=inventado', 'invalid_status'],
    ['/api/admin/retention/exceptions?category=inventado', 'invalid_category'],
    ['/api/admin/retention/disposal/logs?category=inventado', 'invalid_category'],
  ];
  for (const [pathname, error] of cases) {
    const { response, body } = await call(pathname, { cookie: cookieTi });
    assert.equal(response.status, 400, pathname);
    assert.equal(body.error, error, pathname);
  }
  const valid = await call('/api/admin/retention/policies?category=contato&is_active=true', { cookie: cookieTi });
  assert.equal(valid.response.status, 200);
  for (const policy of valid.body.policies) assert.equal(policy.category, 'contato');
});

test('PLT-09 HTTP: logs de descarte recusam escrita com 405 + Allow (RED: 200 com a lista)', opt, async () => {
  for (const method of ['POST', 'DELETE', 'PUT', 'PATCH']) {
    const { response, body } = await call('/api/admin/retention/disposal/logs', { method, cookie: cookieTi, body: {} });
    assert.equal(response.status, 405, `${method} em rota de leitura`);
    assert.equal(body.error, 'method_not_allowed');
    assert.equal(response.headers.get('allow'), 'GET', `${method}: o 405 precisa declarar Allow`);
  }
  const read = await call('/api/admin/retention/disposal/logs', { cookie: cookieTi });
  assert.equal(read.response.status, 200);
  assert.ok(Array.isArray(read.body.logs));
});

test('PLT-09 HTTP: detalhe do job recusa escrita com 405 + Allow (RED: DELETE respondia 200)', opt, async () => {
  const created = await call('/api/admin/retention/disposal/jobs', { method: 'POST', cookie: cookieTi, body: { notes: 'job do prober' } });
  assert.equal(created.response.status, 201, `esperado 201, obteve ${created.response.status}`);
  ids.job = created.body.job.id;
  const { response, body, response: second } = await call(`/api/admin/retention/disposal/jobs/${ids.job}`, { method: 'DELETE', cookie: cookieTi });
  assert.equal(response.status, 405);
  assert.equal(body.error, 'method_not_allowed');
  assert.equal(second.headers.get('allow'), 'GET');
  const read = await call(`/api/admin/retention/disposal/jobs/${ids.job}`, { cookie: cookieTi });
  assert.equal(read.response.status, 200);
  assert.ok(read.body.job);
  assert.ok(Array.isArray(read.body.logs));
});

test('PLT-09 HTTP+DB: contadores do job de descarte são medidos, não fabricados (RED: políticas × 10)', opt, async () => {
  const policies = (await pool.query('SELECT count(*)::int n FROM data_retention_policies WHERE is_active=true')).rows[0].n;
  const exceptions = (await pool.query('SELECT count(*)::int n FROM retention_exceptions')).rows[0].n;
  const { response, body } = await call('/api/admin/retention/disposal/jobs', { method: 'POST', cookie: cookieTi, body: { notes: 'contadores' } });
  assert.equal(response.status, 201);
  assert.equal(body.job.total_scanned, policies + exceptions, `varridos: ${body.job.total_scanned} com ${policies} políticas e ${exceptions} exceções`);
  assert.notEqual(body.job.total_scanned, policies * 10, 'cobertura fabricada não pode voltar');
  assert.ok(body.job.total_scanned >= 2);
  const audit = (await pool.query("SELECT count(*)::int n FROM audit_log WHERE action='disposal_job_execute' AND target=$1", [body.job.id])).rows[0].n;
  assert.equal(audit, 1);
});

test('PLT-09 HTTP+DB: pedido LGPD do titular vira hash do documento e deixa trilha', opt, async () => {
  const document = '123.456.789-00';
  const { response, body } = await call('/api/public/lgpd', {
    method: 'POST', cookie: null,
    body: {
      request_type: 'acesso', requester_name: 'Titular do prober',
      requester_email: 'titular.plt09@exemplo.invalid', requester_document: document,
      description: 'Pedido sintético de acesso do prober PLT-09.',
    },
  });
  assert.equal(response.status, 201, `esperado 201, obteve ${response.status} ${JSON.stringify(body?.error)}`);
  ids.request = body.request.id;
  const row = (await pool.query('SELECT * FROM lgpd_requests WHERE id=$1', [ids.request])).rows[0];
  assert.equal(row.status, 'recebido');
  const expectedHash = createHash('sha256').update(document.replace(/\D/g, '')).digest('hex').slice(0, 64);
  assert.equal(row.requester_document_hash, expectedHash, 'o documento do titular não é armazenado em claro');
  assert.equal(JSON.stringify(row).includes(document), false, 'nenhum campo pode conter o documento cru');
  const dueDate = new Date(Date.now() + LGPD_DECLARED_DUE_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  assert.equal(new Date(row.due_date).toISOString().slice(0, 10), dueDate, 'prazo DECLARADO de 15 dias');
  const audit = (await pool.query("SELECT count(*)::int n FROM audit_log WHERE action='lgpd_request_create' AND target=$1", [ids.request])).rows[0].n;
  assert.equal(audit, 1, 'a criação pública precisa deixar trilha (antes era descartada pelo CHECK de actor_kind)');
});

test('PLT-09 HTTP: e-mail do titular fora da faixa é 400 sem gravar (RED: 503 do CHECK)', opt, async () => {
  const before = (await pool.query('SELECT count(*)::int n FROM lgpd_requests')).rows[0].n;
  for (const email of ['a@b', 'sem-arroba', 'a@@b.com']) {
    const { response, body } = await call('/api/public/lgpd', {
      method: 'POST', cookie: null,
      body: { request_type: 'acesso', requester_name: 'Titular', requester_email: email, description: 'Pedido sintético com dez.' },
    });
    assert.equal(response.status, 400, email);
    assert.equal(body.error, 'invalid_requester_email', email);
  }
  const after = (await pool.query('SELECT count(*)::int n FROM lgpd_requests')).rows[0].n;
  assert.equal(after, before);
});

test('PLT-09 HTTP+DB: pedido LGPD exige transição válida e verificação de identidade antes de aprovar', opt, async () => {
  const jump = await call(`/api/admin/lgpd/requests/${ids.request}`, {
    method: 'PATCH', cookie: cookieTi, body: { next_status: 'atendido' },
  });
  assert.equal(jump.response.status, 400);
  assert.equal(jump.body.error, 'invalid_transition');

  const invalidEnum = await call(`/api/admin/lgpd/requests/${ids.request}`, {
    method: 'PATCH', cookie: cookieTi, body: { next_status: 'concluido' },
  });
  assert.equal(invalidEnum.response.status, 400);
  assert.equal(invalidEnum.body.error, 'invalid_next_status');

  const verify = await call(`/api/admin/lgpd/requests/${ids.request}`, {
    method: 'PATCH', cookie: cookieTi,
    body: { is_identity_verified: true, verification_method: 'documento', next_status: 'em_verificacao' },
  });
  assert.equal(verify.response.status, 200, `verificação respondeu ${verify.response.status} ${JSON.stringify(verify.body?.error)}`);
  assert.equal(verify.body.request.is_identity_verified, true);
  assert.equal(verify.body.request.verification_method, 'documento');

  const badMethod = await call(`/api/admin/lgpd/requests/${ids.request}`, {
    method: 'PATCH', cookie: cookieTi, body: { verification_method: 'biometria_facial' },
  });
  assert.equal(badMethod.response.status, 400);
  assert.equal(badMethod.body.error, 'invalid_verification_method');

  const toAnalysis = await call(`/api/admin/lgpd/requests/${ids.request}`, {
    method: 'PATCH', cookie: cookieTi, body: { next_status: 'em_analise', responsible_name: 'Responsável QA' },
  });
  assert.equal(toAnalysis.response.status, 200);
  const approve = await call(`/api/admin/lgpd/requests/${ids.request}`, {
    method: 'PATCH', cookie: cookieTi, body: { next_status: 'aprovado' },
  });
  assert.equal(approve.response.status, 200);
  const history = (await pool.query('SELECT previous_status, next_status FROM lgpd_request_history WHERE request_id=$1 ORDER BY created_at', [ids.request])).rows;
  assert.ok(history.length >= 3, 'cada transição precisa de histórico');
  assert.equal(history.at(-1).next_status, 'aprovado');
  const row = (await pool.query('SELECT status, responsible_name FROM lgpd_requests WHERE id=$1', [ids.request])).rows[0];
  assert.equal(row.status, 'aprovado');
  assert.equal(row.responsible_name, 'Responsável QA');
  const auditActions = (await pool.query("SELECT action FROM audit_log WHERE target=$1 ORDER BY id", [ids.request])).rows.map(item => item.action);
  assert.ok(auditActions.includes('lgpd_request_verify'), 'verificação de identidade precisa de trilha');
  assert.ok(auditActions.includes('lgpd_request_update'), 'transição de status precisa de trilha');
});

test('PLT-09 HTTP+DB: leitura não grava auditoria nem altera as tabelas de privacidade', opt, async () => {
  const accessBefore = await auditAccessCount();
  const logBefore = await auditLogCount();
  const fingerprint = async () => (await pool.query(
    `SELECT md5(string_agg(id::text || ':' || status || ':' || updated_at::text, '|' ORDER BY id)) AS f FROM privacy_policies`,
  )).rows[0].f;
  const inventoryFingerprint = async () => (await pool.query(
    `SELECT md5(string_agg(id::text || ':' || data_field || ':' || updated_at::text, '|' ORDER BY id)) AS f FROM privacy_data_inventory`,
  )).rows[0].f;
  const policyBefore = await fingerprint();
  const inventoryBefore = await inventoryFingerprint();
  for (const cookie of [cookieTi, cookieAdmin]) {
    await call('/api/admin/privacy/inventory', { cookie });
    await call('/api/admin/privacy/policies', { cookie });
    await call('/api/admin/lgpd/requests', { cookie });
    await call('/api/admin/retention/policies', { cookie });
    await call('/api/admin/retention/exceptions', { cookie });
    await call('/api/admin/retention/disposal/jobs', { cookie });
    await call('/api/admin/retention/disposal/logs', { cookie });
  }
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await auditAccessCount(), accessBefore, 'leitura não grava auth_access_audit');
  assert.equal(await auditLogCount(), logBefore, 'leitura não grava audit_log');
  assert.equal(await fingerprint(), policyBefore, 'leitura não altera política');
  assert.equal(await inventoryFingerprint(), inventoryBefore, 'leitura não altera inventário');
});

test('PLT-09 HTTP: correlação — x-request-id e x-correlation-id no cabeçalho e na telemetria', opt, async () => {
  const clientCorrelation = `qa-plt09-${randomUUID()}`;
  const { response } = await call('/api/admin/privacy/inventory', { headers: { 'x-correlation-id': clientCorrelation } });
  assert.equal(response.status, 200);
  const requestId = response.headers.get('x-request-id');
  assert.ok(requestId);
  assert.equal(response.headers.get('x-correlation-id'), clientCorrelation);
  const row = await telemetryRow(requestId);
  assert.ok(row, 'linha de telemetria existe no PostgreSQL');
  assert.equal(row.request_id, requestId);
  assert.equal(row.correlation_id, clientCorrelation);
  assert.equal(row.method, 'GET');
  assert.equal(row.path, '/api/admin/privacy/inventory');
  assert.equal(row.status_code, 200);
});

test('PLT-09 HTTP: aliases existentes seguem servidos e protegidos', opt, async () => {
  for (const pathname of ['/api/crm/privacy/inventory', '/api/privacy/inventory']) {
    const { response } = await call(pathname, { cookie: cookieTi });
    assert.equal(response.status, 200, pathname);
  }
  for (const pathname of ['/api/privacy/retention/policies', '/api/crm/retention/policies', '/api/admin/privacy/retention']) {
    const { response } = await call(pathname, { cookie: cookieTi });
    assert.equal(response.status, 200, pathname);
  }
  const lgpdAlias = await call('/api/privacy/requests', { cookie: cookieTi });
  assert.equal(lgpdAlias.response.status, 200);
  const anonymous = await call('/api/crm/privacy/inventory', { cookie: null });
  assert.equal(anonymous.response.status, 401);
});

test('PLT-09 HTTP: console de TI segue servido sem promoção de aba', opt, async () => {
  const response = await fetch(`${base}/admin/ti`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<html/i);
});
