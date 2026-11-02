// PLT-06 — jornada/RBAC/evidência de gate em HTTP real + PostgreSQL 17 real.
// Invariante: a leitura dos cinco tipos é somente leitura de ESTADO (grava a
// telemetria da própria requisição, mas não cria auth_access_audit nem altera
// observability_alerts); a escrita só existe no ciclo explícito do alerta.
// Dados sintéticos `.invalid`; não prova aceite humano, UAT nem produção.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import path from 'node:path';
import pg from 'pg';
import { hashPassword } from '../src/lib/client-auth-core.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);
const REQUIRE = process.env.QA_PLT06_REQUIRE_DB === '1';
const root = path.resolve(import.meta.dirname, '..');
const TYPES = ['summary', 'requests', 'jobs', 'db', 'alerts'];
const ALERT_STATUSES = ['firing', 'acknowledged', 'resolved', 'suppressed'];
const RESPONSE_KEYS = {
  summary: ['db_aggregates', 'memory', 'note'],
  requests: ['memory_recent', 'requests'],
  jobs: ['jobs', 'memory_recent'],
  db: ['db_metrics', 'memory_recent'],
  alerts: ['alerts', 'memory_firing'],
};
const SESSION_SECRET = randomUUID().repeat(2);
const MFA_KEY = randomBytes(32).toString('base64url');
const opt = { skip: !RUN };

let server, base, pool, ti, rh, admin, cookieTi, cookieRh, cookieAdmin;
const alertIds = {
  cycle: randomUUID(), rh: randomUUID(), action: randomUUID(), patch: randomUUID(),
  status: Object.fromEntries(ALERT_STATUSES.map(status => [status, randomUUID()])),
};

test('PLT-06 gate exige PostgreSQL real e não aceita skip silencioso', () => {
  if (REQUIRE) assert.ok(RUN);
});

test('PLT-06 gate: o cluster descartável aplicou as migrações 001–183', opt, async () => {
  const ledger = (await pool.query(
    `SELECT count(*)::int AS n, min(filename) AS primeira, max(filename) AS ultima
     FROM __migrations WHERE filename LIKE '___-%'`,
  )).rows[0];
  assert.equal(ledger.n, 183);
  assert.match(ledger.primeira, /^001-/);
  assert.match(ledger.ultima, /^183-/);
});

const freeLoopbackPort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

async function startServer() {
  const port = await freeLoopbackPort();
  const distDir = `.next/integration-plt06-${randomUUID().slice(0, 8)}`;
  const child = spawn(process.execPath, ['server.mjs', '--dev'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port), BIND_HOST: '127.0.0.1', NODE_ENV: 'development',
      NEXT_DIST_DIR: distDir,
      SITE_ADMIN_SESSION_SECRET: SESSION_SECRET,
      CLIENT_MFA_ENCRYPTION_KEY: MFA_KEY,
      SITE_ADMIN_LEGACY_TOKENS: '', OLLAMA_ENABLED: 'false', MAIL_HOST: '',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i += 1) {
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
  const email = `qa-plt06-${role}-${id.slice(0, 8)}@example.invalid`;
  const password = 'Senha-Sintetica-9!';
  await pool.query(`INSERT INTO auth_identities(id,kind,email,display_name,status) VALUES($1,'staff',$2,$3,'active')`, [id, email, `QA PLT-06 ${role}`]);
  await pool.query(`INSERT INTO auth_credentials(identity_id,password_hash) VALUES($1,$2)`, [id, await hashPassword(password)]);
  await pool.query(`INSERT INTO auth_staff_profiles(identity_id,role,assigned_by) VALUES($1,$2,'admin_system')`, [id, role]);
  return { id, email, password };
}

async function login(person) {
  const response = await fetch(`${base}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email: person.email, password: person.password }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.getSetCookie().find(value => value.startsWith('seg_admin_session='));
  assert.ok(cookie, 'sessão real de staff esperada');
  return cookie.split(';')[0];
}

async function insertAlert(id, status = 'firing') {
  await pool.query(
    `INSERT INTO observability_alerts(id,alert_key,metric_name,severity,status,message)
     VALUES($1,$2,'qa_plt06_metric','warning',$3,$4)`,
    [id, `qa-plt06-${status}-${id.slice(0, 8)}`, status, `Alerta sintético PLT-06 (${status}).`],
  );
}

async function call(pathname, options = {}) {
  const {
    method = 'GET', cookie = cookieTi, originBase = base, body,
    headers = {}, originHeader = null,
  } = options;
  const requestHeaders = { accept: 'application/json', ...headers };
  if (cookie) requestHeaders.cookie = cookie;
  if (method !== 'GET' || originHeader) requestHeaders.origin = originHeader || originBase;
  if (body !== undefined) requestHeaders['content-type'] = 'application/json';
  const response = await fetch(`${originBase}${pathname}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  return { response, body: parsed, text };
}

async function auditCount() {
  return (await pool.query('SELECT count(*)::int AS n FROM auth_access_audit')).rows[0].n;
}

async function alertSnapshot() {
  const result = await pool.query(
    `SELECT count(*)::int AS total,
            COALESCE(md5(string_agg(id::text || ':' || status || ':' || updated_at::text, '|' ORDER BY id)), '') AS fingerprint
     FROM observability_alerts`,
  );
  return result.rows[0];
}

async function telemetryRow(requestId) {
  for (let i = 0; i < 60; i += 1) {
    const result = await pool.query(
      `SELECT request_id, correlation_id, method, path, status_code
       FROM observability_http_requests WHERE request_id=$1 ORDER BY created_at DESC LIMIT 1`,
      [requestId],
    );
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
  for (const [status, id] of Object.entries(alertIds.status)) await insertAlert(id, status);
  for (const id of [alertIds.cycle, alertIds.rh, alertIds.action, alertIds.patch]) await insertAlert(id);
  // Aquece o Next dev e deixa a telemetria assíncrona assentar ANTES do
  // snapshot de "leitura não altera estado".
  await fetch(`${base}/api/health/live`);
  await call('/api/admin/observability?type=summary');
  await new Promise(resolve => setTimeout(resolve, 400));
});

after(async () => {
  await new Promise(resolve => setTimeout(resolve, 200));
  await pool?.end().catch(() => {});
  await stopServer(server);
});

test('PLT-06 HTTP: anônimo recebe 401 nos cinco tipos de leitura', opt, async () => {
  for (const type of TYPES) {
    const { response, body } = await call(`/api/admin/observability?type=${type}`, { cookie: null });
    assert.equal(response.status, 401, `type=${type}`);
    assert.equal(body.error, 'admin_session_required');
  }
});

test('PLT-06 HTTP: rh recebe 403 nos cinco tipos sem abrir a borda legada', opt, async () => {
  for (const type of TYPES) {
    const { response, body } = await call(`/api/admin/observability?type=${type}`, { cookie: cookieRh });
    assert.equal(response.status, 403, `type=${type}`);
    assert.equal(body.error, 'observability_restricted_admin_ti');
  }
});

test('PLT-06 HTTP: ti e admin leem os cinco tipos com o contrato de chaves preservado', opt, async () => {
  for (const cookie of [cookieTi, cookieAdmin]) {
    for (const type of TYPES) {
      const { response, body } = await call(`/api/admin/observability?type=${type}`, { cookie });
      assert.equal(response.status, 200, `type=${type}`);
      assert.deepEqual(Object.keys(body).sort(), RESPONSE_KEYS[type]);
    }
  }
});

test('PLT-06 HTTP: same_origin_required permanece nas escritas com origem divergente', opt, async () => {
  const cross = 'https://example.invalid';
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const { response, body } = await call('/api/admin/observability?type=summary', {
      method, body: {}, headers: { origin: cross }, originHeader: cross,
    });
    assert.equal(response.status, 403, `${method} cross-origin`);
    assert.equal(body.error, 'same_origin_required');
  }
  const alert = await call(`/api/admin/observability/alerts/${alertIds.rh}`, {
    method: 'POST', body: { action: 'acknowledge' }, headers: { origin: cross }, originHeader: cross,
  });
  assert.equal(alert.response.status, 403);
  assert.equal(alert.body.error, 'same_origin_required');
});

test('PLT-06 HTTP: GET seguro continua protegido por sessão/RBAC, não por Origin', opt, async () => {
  const { response } = await call('/api/admin/observability?type=jobs', {
    headers: { origin: 'https://example.invalid' }, originHeader: 'https://example.invalid',
  });
  assert.equal(response.status, 200);
  const anonymous = await call('/api/admin/observability?type=jobs', {
    cookie: null, headers: { origin: 'https://example.invalid' }, originHeader: 'https://example.invalid',
  });
  assert.equal(anonymous.response.status, 401);
});

test('PLT-06 HTTP+DB: método não GET nas rotas de leitura é 405 e não grava auditoria', opt, async () => {
  const beforeAudit = await auditCount();
  const beforeAlerts = await alertSnapshot();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const { response, body } = await call('/api/admin/observability?type=summary', { method, body: {}, headers: { origin: base } });
    assert.equal(response.status, 405, `${method} não pode devolver 200`);
    assert.equal(body.error, 'method_not_allowed');
    assert.equal(response.headers.get('allow'), 'GET');
  }
  const alias = await call('/api/admin/observability/metrics', { method: 'POST', body: {}, headers: { origin: base } });
  assert.equal(alias.response.status, 405);
  assert.equal(alias.body.error, 'method_not_allowed');
  assert.equal(await auditCount(), beforeAudit);
  assert.deepEqual(await alertSnapshot(), beforeAlerts);
});

test('PLT-06 HTTP+DB: correlation gerada no servidor aparece no cabeçalho e na linha persistida', opt, async () => {
  const first = await call('/api/admin/observability?type=summary');
  const second = await call('/api/admin/observability?type=summary');
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  const requestId = first.response.headers.get('x-request-id');
  const correlationId = first.response.headers.get('x-correlation-id');
  assert.ok(requestId);
  assert.ok(correlationId);
  assert.notEqual(requestId, second.response.headers.get('x-request-id'), 'cada requisição tem ID próprio');
  const row = await telemetryRow(requestId);
  assert.ok(row, 'a linha de telemetria precisa existir no PostgreSQL');
  assert.equal(row.request_id, requestId);
  assert.equal(row.correlation_id, correlationId);
  assert.equal(row.method, 'GET');
  assert.equal(row.path, '/api/admin/observability');
  assert.equal(row.status_code, 200);
  assert.match(correlationId, /^corr-/);
});

test('PLT-06 HTTP+DB: x-correlation-id do cliente é preservado no cabeçalho e no banco', opt, async () => {
  const clientCorrelation = `qa-plt06-${randomUUID()}`;
  const { response } = await call('/api/admin/observability?type=requests', {
    headers: { 'x-correlation-id': clientCorrelation },
  });
  assert.equal(response.status, 200);
  const requestId = response.headers.get('x-request-id');
  assert.equal(response.headers.get('x-correlation-id'), clientCorrelation);
  const row = await telemetryRow(requestId);
  assert.ok(row);
  assert.equal(row.request_id, requestId);
  assert.equal(row.correlation_id, clientCorrelation);
});

test('PLT-06 HTTP+DB: x-correlation-id longo é truncado de forma idêntica no cabeçalho e no banco', opt, async () => {
  const longCorrelation = `qa-plt06-${'a'.repeat(150)}`;
  const { response } = await call('/api/admin/observability?type=db', {
    headers: { 'x-correlation-id': longCorrelation },
  });
  const header = response.headers.get('x-correlation-id');
  assert.equal(header.length, 100);
  assert.equal(header, longCorrelation.slice(0, 100));
  const row = await telemetryRow(response.headers.get('x-request-id'));
  assert.ok(row);
  assert.equal(row.correlation_id, header);
});

test('PLT-06 HTTP: status de alerta inválido é 400 e não erro 503 de dependência', opt, async () => {
  const invalid = encodeURIComponent("firing' OR 1=1 --");
  const { response, body } = await call(`/api/admin/observability?type=alerts&status=${invalid}`);
  assert.equal(response.status, 400);
  assert.equal(body.error, 'invalid_status');
  for (const status of ALERT_STATUSES) {
    const valid = await call(`/api/admin/observability?type=alerts&status=${status}`);
    assert.equal(valid.response.status, 200, `status=${status}`);
    assert.ok(valid.body.alerts.every(row => row.status === status));
    assert.ok(valid.body.alerts.some(row => row.id === alertIds.status[status]));
  }
});

test('PLT-06 HTTP+DB: dez leituras não criam auth_access_audit nem alteram observability_alerts', opt, async () => {
  const auditBefore = await auditCount();
  const alertsBefore = await alertSnapshot();
  const httpBefore = (await pool.query('SELECT count(*)::int AS n FROM observability_http_requests')).rows[0].n;
  for (const cookie of [cookieTi, cookieAdmin]) {
    for (const type of TYPES) {
      const { response } = await call(`/api/admin/observability?type=${type}`, { cookie });
      assert.equal(response.status, 200);
    }
  }
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(await auditCount(), auditBefore, 'leitura não pode auditar como escrita');
  assert.deepEqual(await alertSnapshot(), alertsBefore, 'leitura não pode reconhecer/resolver/suprimir alerta');
  const httpAfter = (await pool.query('SELECT count(*)::int AS n FROM observability_http_requests')).rows[0].n;
  assert.ok(httpAfter >= httpBefore + 10, 'a telemetria da própria requisição continua registrada');
});

test('PLT-06 HTTP+DB: acknowledge grava status, autor e auditoria própria', opt, async () => {
  const { response, body } = await call(`/api/admin/observability/alerts/${alertIds.cycle}`, {
    method: 'POST', body: { action: 'acknowledge' }, headers: { origin: base },
  });
  assert.equal(response.status, 200);
  assert.equal(body.alert.status, 'acknowledged');
  assert.equal(body.alert.acknowledged_by, 'ti');
  const row = (await pool.query('SELECT status, acknowledged_by, acknowledged_at FROM observability_alerts WHERE id=$1', [alertIds.cycle])).rows[0];
  assert.equal(row.status, 'acknowledged');
  assert.equal(row.acknowledged_by, 'ti');
  assert.ok(row.acknowledged_at);
  // Desde a migração 183 a trilha chega à tabela: o handler grava
  // `observability_alert_ack` e o `CHECK` a aceita. O `try {} catch {}` do
  // gravador continua no lugar como rede de segurança, mas deixa de ter do que
  // proteger nesta jornada — a prova é o teste de trilha abaixo.
  const ackTrilha = (await pool.query(
    `SELECT count(*)::int AS n FROM auth_access_audit
     WHERE action = 'observability_alert_ack' AND target = $1`, [alertIds.cycle],
  )).rows[0].n;
  assert.ok(ackTrilha >= 1, 'a 183 faz a ação do ciclo de alerta chegar à tabela');
});

test('PLT-06 HTTP+DB: resolve grava status/data e a trilha de auditoria', opt, async () => {
  const { response, body } = await call(`/api/admin/observability/alerts/${alertIds.cycle}`, {
    method: 'POST', body: { action: 'resolve' }, headers: { origin: base },
  });
  assert.equal(response.status, 200);
  assert.equal(body.alert.status, 'resolved');
  const row = (await pool.query('SELECT status, acknowledged_by, acknowledged_at, resolved_at FROM observability_alerts WHERE id=$1', [alertIds.cycle])).rows[0];
  assert.equal(row.status, 'resolved');
  assert.equal(row.acknowledged_by, 'ti', 'resolve não apaga o reconhecimento anterior');
  assert.ok(row.resolved_at);
  const resolveTrilha = (await pool.query(
    `SELECT count(*)::int AS n FROM auth_access_audit
     WHERE action = 'observability_alert_resolve' AND target = $1`, [alertIds.cycle],
  )).rows[0].n;
  assert.ok(resolveTrilha >= 1, 'a 183 faz o resolve chegar à tabela');
});

test('PLT-06 HTTP+DB: a migração 183 devolve as cinco ações ao CHECK e as duas do alerta chegam à tabela', opt, async () => {
  const constraint = (await pool.query(
    `SELECT pg_get_expr(conbin, conrelid) AS definition FROM pg_constraint
     WHERE conrelid='auth_access_audit'::regclass
       AND conname='auth_access_audit_action_check' AND contype='c'`,
  )).rows[0];
  assert.ok(constraint?.definition);
  for (const action of [
    'observability_alert_ack', 'observability_alert_resolve',
    'healthcheck_query', 'backup_status', 'backup_retention_update',
  ]) {
    assert.ok(constraint.definition.includes(`'${action}'`),
      `a 183 precisa aceitar ${action} no banco real do gate`);
  }
  // As duas do ciclo de alerta não são só aceitas pelo CHECK: os POST reais de
  // acknowledge/resolve acima as gravaram, uma por evento, com o alvo correto.
  const trilhas = (await pool.query(
    `SELECT action, count(*)::int AS n FROM auth_access_audit
     WHERE action IN ('observability_alert_ack','observability_alert_resolve')
     GROUP BY action`,
  )).rows;
  assert.equal(trilhas.length, 2, 'ack e resolve deixam de ser descartados em silêncio');
  for (const trilha of trilhas) assert.ok(trilha.n >= 1, `${trilha.action} não gravou linha alguma`);
});

test('PLT-06 HTTP+DB: a 183 é aditiva — o que a 103 já aceitava continua, o resto continua recusado', opt, async () => {
  // Provar aditividade pelo constraint, não pela trilha: os gravadores têm
  // `try {} catch {}`, então um `DROP CONSTRAINT` (cheque em branco) NÃO seria
  // visível em nenhuma contagem de eventos. É esta asserção que a impede.
  const constraint = (await pool.query(
    `SELECT pg_get_expr(conbin, conrelid) AS definition FROM pg_constraint
     WHERE conrelid='auth_access_audit'::regclass
       AND conname='auth_access_audit_action_check' AND contype='c'`,
  )).rows[0].definition;
  assert.ok(constraint.includes(`'login'`), 'a 183 não pode ter derrubado ação aceita desde a 103');
  assert.ok(constraint.includes(`'audit_query'`), 'a 183 não pode ter derrubado ação aceita desde a 103');
  // Uma ação fora das 425 continua recusada no banco real.
  await assert.rejects(() => pool.query(
    `INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category)
     VALUES ('ti','plt06','acao_fora_do_ledger_183','x','allowed','none')`,
  ), /violates check constraint/, 'ampliação aditiva não é constraint removida');
});


test('PLT-06 HTTP+DB: rh é recusado no ciclo de alerta e não altera o alerta', opt, async () => {
  for (const action of ['acknowledge', 'resolve']) {
    const { response, body } = await call(`/api/admin/observability/alerts/${alertIds.rh}`, {
      method: 'POST', cookie: cookieRh, body: { action }, headers: { origin: base },
    });
    assert.equal(response.status, 403);
    assert.equal(body.error, 'observability_restricted');
  }
  const row = (await pool.query('SELECT status, acknowledged_at, resolved_at FROM observability_alerts WHERE id=$1', [alertIds.rh])).rows[0];
  assert.equal(row.status, 'firing');
  assert.equal(row.acknowledged_at, null);
  assert.equal(row.resolved_at, null);
});

test('PLT-06 HTTP: id inválido chega ao handler e responde 400 invalid_alert_id', opt, async () => {
  const { response, body } = await call('/api/admin/observability/alerts/alerta-invalido', {
    method: 'POST', body: { action: 'acknowledge' }, headers: { origin: base },
  });
  assert.equal(response.status, 400);
  assert.equal(body.error, 'invalid_alert_id');
});

test('PLT-06 HTTP: alerta inexistente responde 404 not_found', opt, async () => {
  const { response, body } = await call(`/api/admin/observability/alerts/${randomUUID()}`, {
    method: 'POST', body: { action: 'acknowledge' }, headers: { origin: base },
  });
  assert.equal(response.status, 404);
  assert.equal(body.error, 'not_found');
});

test('PLT-06 HTTP+DB: ação inválida responde 400 sem alterar o alerta', opt, async () => {
  const before = await alertSnapshot();
  const { response, body } = await call(`/api/admin/observability/alerts/${alertIds.action}`, {
    method: 'POST', body: { action: 'delete' }, headers: { origin: base },
  });
  assert.equal(response.status, 400);
  assert.equal(body.error, 'invalid_action');
  assert.deepEqual(await alertSnapshot(), before);
});

test('PLT-06 HTTP+DB: PATCH continua aceito no ciclo de alerta', opt, async () => {
  const { response, body } = await call(`/api/admin/observability/alerts/${alertIds.patch}`, {
    method: 'PATCH', body: { action: 'acknowledge' }, headers: { origin: base },
  });
  assert.equal(response.status, 200);
  assert.equal(body.alert.status, 'acknowledged');
  const row = (await pool.query('SELECT status FROM observability_alerts WHERE id=$1', [alertIds.patch])).rows[0];
  assert.equal(row.status, 'acknowledged');
});

test('PLT-06 HTTP: aliases existentes de leitura seguem servidos e protegidos', opt, async () => {
  const metrics = await call('/api/admin/observability/metrics?type=jobs');
  assert.equal(metrics.response.status, 200);
  assert.ok(Array.isArray(metrics.body.jobs));
  const crm = await call('/api/crm/observability?type=requests');
  assert.equal(crm.response.status, 200);
  assert.ok(Array.isArray(crm.body.requests));
  const anonymous = await call('/api/crm/observability?type=requests', { cookie: null });
  assert.equal(anonymous.response.status, 401);
});

test('PLT-06 HTTP: console de TI segue servido sem promoção de aba', opt, async () => {
  const response = await fetch(`${base}/admin/ti`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<html/i);
});
