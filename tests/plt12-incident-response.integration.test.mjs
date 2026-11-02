// PLT-12 — resposta a incidente: jornada/RBAC/evidência em HTTP real + PostgreSQL 17 real.
// Invariante: leitura de estado (listagem/detalhe) é somente leitura (sem
// auth_access_audit, sem alterar incidentes); escritas exigem sessão admin/ti e
// mesma origem; o id do incidente chega ao handler e recebe 400 invalid_id;
// evidência é referência com checksum; comunicação é registro interno; não
// promove aba, não abre a borda legada de RH, não substitui superfície.
// Requer `RUN_DATABASE_INTEGRATION=1` e `DATABASE_URL` (cluster descartável do gate).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import path from 'node:path';
import pg from 'pg';
import { hashPassword } from '../src/lib/client-auth-core.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);
const REQUIRE = process.env.QA_PLT12_REQUIRE_DB === '1';
const root = path.resolve(import.meta.dirname, '..');
const opt = { skip: !RUN };

const TYPES = ['vazamento_dados', 'acesso_nao_autorizado', 'perda_dados', 'indisponibilidade', 'malware', 'phishing', 'violacao_privacidade', 'outro'];
const SEVERITIES = ['baixa', 'media', 'alta', 'critica'];
const STATUSES = ['aberto', 'em_contencao', 'em_analise', 'em_remediacao', 'aguardando_comunicacao', 'comunicado', 'encerrado', 'reaberto'];
const SESSION_SECRET = randomUUID().repeat(2);
const MFA_KEY = randomBytes(32).toString('base64url');

let server, base, pool, ti, rh, admin, cookieTi, cookieRh, cookieAdmin;
const incidentIds = { created: randomUUID() };

const freeLoopbackPort = () => new Promise((resolve, reject) => {
  const probe = createServer(); probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});

async function startServer() {
  const port = await freeLoopbackPort();
  const distDir = `.next/integration-plt12-${randomUUID().slice(0, 8)}`;
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
  const email = `qa-plt12-${role}-${id.slice(0, 8)}@example.invalid`;
  const password = 'Senha-Sintetica-12!';
  await pool.query(`INSERT INTO auth_identities(id,kind,email,display_name,status) VALUES($1,'staff',$2,$3,'active')`, [id, email, `QA PLT-12 ${role}`]);
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

async function insertIncident(id, status = 'aberto') {
  await pool.query(
    `INSERT INTO security_incidents(id,incident_type,severity,status,title,description)\n     VALUES($1,'indisponibilidade','media',$2,'Incidente de base','Descrição de base do prober PLT-12.')`,
    [id, status]);
}

async function call(pathname, options = {}) {
  const { method = 'GET', cookie = cookieTi, originBase = base, body, headers = {}, originHeader = null } = options;
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

async function auditCount() {
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
  await insertIncident(incidentIds.created);
  await fetch(`${base}/api/health/live`);
  await new Promise(resolve => setTimeout(resolve, 300));
});

after(async () => {
  await new Promise(resolve => setTimeout(resolve, 200));
  await pool?.end().catch(() => {});
  await stopServer(server);
});

test('PLT-12 gate exige PostgreSQL real e não aceita skip silencioso', () => {
  if (REQUIRE) assert.ok(RUN);
});

test('PLT-12 gate: o cluster descartável aplicou as migrações 001–181', opt, async () => {
  const ledger = (await pool.query(
    `SELECT count(*)::int AS n, min(filename) AS primeira, max(filename) AS ultima
     FROM __migrations WHERE filename LIKE '___-%'`,
  )).rows[0];
  assert.equal(ledger.n, 181);
  assert.match(ledger.primeira, /^001-/);
  assert.match(ledger.ultima, /^181-/);
});

test('PLT-12 HTTP: anônimo recebe 401 na leitura e na criação', opt, async () => {
  const { response, body } = await call('/api/admin/incidents', { cookie: null });
  assert.equal(response.status, 401);
  assert.equal(body.error, 'unauthorized');
  const created = await call('/api/admin/incidents', { method: 'POST', cookie: null, body: { incident_type: 'phishing', title: 'x', description: 'y' } });
  assert.equal(created.response.status, 401);
  assert.equal(created.body.error, 'unauthorized');
});

test('PLT-12 HTTP: rh recebe 403 sem abrir a borda legada de RH', opt, async () => {
  const { response, body } = await call('/api/admin/incidents', { cookie: cookieRh });
  assert.equal(response.status, 403);
  assert.equal(body.error, 'forbidden');
  const created = await call('/api/admin/incidents', { method: 'POST', cookie: cookieRh, body: {} });
  assert.equal(created.response.status, 403);
  assert.equal(created.body.error, 'forbidden');
});

test('PLT-12 HTTP: ti e admin leem a lista e o detalhe com 200', opt, async () => {
  for (const cookie of [cookieTi, cookieAdmin]) {
    const { response, body } = await call('/api/admin/incidents', { cookie });
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(body.incidents));
    const { response: detail, body: detailBody } = await call(`/api/admin/incidents/${incidentIds.created}`, { cookie });
    assert.equal(detail.status, 200);
    assert.ok(detailBody.incident);
    assert.ok(Array.isArray(detailBody.evidences));
    assert.ok(Array.isArray(detailBody.actions));
    assert.ok(Array.isArray(detailBody.communications));
    assert.ok(Array.isArray(detailBody.history));
  }
});

test('PLT-12 HTTP: same_origin_required nas escritas com origem divergente (GET seguro não exige Origin)', opt, async () => {
  const cross = 'https://example.invalid';
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const { response, body } = await call('/api/admin/incidents', {
      method, cookie: cookieTi, body: {}, headers: { origin: cross }, originHeader: cross,
    });
    assert.equal(response.status, 403, `${method} cross-origin`);
    assert.equal(body.error, 'forbidden');
  }
  const getCross = await call('/api/admin/incidents', {
    cookie: cookieTi, headers: { origin: cross }, originHeader: cross,
  });
  assert.equal(getCross.response.status, 200);
  const anonymousCross = await call('/api/admin/incidents', {
    cookie: null, headers: { origin: cross }, originHeader: cross,
  });
  assert.equal(anonymousCross.response.status, 401);
});

test('PLT-12 HTTP+DB: criar incidente grava linha, histórico de abertura e auditoria', opt, async () => {
  const auditBefore = await auditCount();
  const { response, body } = await call('/api/admin/incidents', {
    method: 'POST', cookie: cookieTi,
    body: { incident_type: 'vazamento_dados', severity: 'alta', title: 'Incidente de prober PLT-12',
      description: 'Descrição sintética com mais de vinte caracteres.', affected_data_categories: ['identificacao', 'contato'],
      affected_records_estimate: 3, affected_systems: ['sistema-a'], responsible_name: 'QA', responsible_id: 'resp-1' },
  });
  assert.equal(response.status, 201, `esperado 201, obteve ${response.status} ${JSON.stringify(body?.error)}`);
  assert.ok(body.incident && body.incident.id);
  assert.match(body.incident.id, /^[0-9a-f-]{36}$/i);
  incidentIds.created = body.incident.id;
  const row = (await pool.query('SELECT status,incident_type,severity FROM security_incidents WHERE id=$1', [incidentIds.created])).rows[0];
  assert.equal(row.status, 'aberto');
  const hist = (await pool.query('SELECT * FROM incident_history WHERE incident_id=$1 ORDER BY created_at', [incidentIds.created])).rows;
  assert.equal(hist.length, 1);
  assert.equal(hist[0].next_status, 'aberto');
  const audit = (await pool.query("SELECT count(*)::int n FROM audit_log WHERE action='incident_create' AND target=$1", [incidentIds.created])).rows[0].n;
  assert.equal(audit, 1);
  assert.ok(await auditCount() > auditBefore);
});

test('PLT-12 HTTP: filtros de listagem type/severity/status', opt, async () => {
  const { body } = await call(`/api/admin/incidents?type=vazamento_dados&severity=alta&status=aberto`, { cookie: cookieTi });
  assert.ok(Array.isArray(body.incidents));
  for (const incident of body.incidents) {
    if (incident.id === incidentIds.created) {
      assert.equal(incident.incident_type, 'vazamento_dados');
      assert.equal(incident.severity, 'alta');
      assert.equal(incident.status, 'aberto');
    }
  }
  for (const type of TYPES) {
    const { response } = await call(`/api/admin/incidents?type=${type}`, { cookie: cookieTi });
    assert.equal(response.status, 200, `type=${type}`);
  }
  for (const severity of SEVERITIES) {
    const { response } = await call(`/api/admin/incidents?severity=${severity}`, { cookie: cookieTi });
    assert.equal(response.status, 200, `severity=${severity}`);
  }
  for (const status of STATUSES) {
    const { response } = await call(`/api/admin/incidents?status=${status}`, { cookie: cookieTi });
    assert.equal(response.status, 200, `status=${status}`);
  }
});

test('PLT-12 HTTP+DB: PATCH transição inválida é 400 invalid_transition e não altera o incidente', opt, async () => {
  const before = (await pool.query('SELECT status FROM security_incidents WHERE id=$1', [incidentIds.created])).rows[0].status;
  const { response, body } = await call(`/api/admin/incidents/${incidentIds.created}`, {
    method: 'PATCH', cookie: cookieTi, body: { next_status: 'comunicado', reason: 'salto invalido' },
  });
  assert.equal(response.status, 400);
  assert.equal(body.error, 'invalid_transition');
  assert.ok(Array.isArray(body.allowed));
  assert.ok(body.allowed.includes('em_contencao') || body.allowed.includes('em_analise') || body.allowed.includes('encerrado'));
  const after = (await pool.query('SELECT status FROM security_incidents WHERE id=$1', [incidentIds.created])).rows[0].status;
  assert.equal(after, before);
});

test('PLT-12 HTTP+DB: encerrado exige root_cause; contenção exige lead', opt, async () => {
  const { response: semCausa, body: semCausaBody } = await call(`/api/admin/incidents/${incidentIds.created}`, {
    method: 'PATCH', cookie: cookieTi, body: { next_status: 'encerrado', reason: 'sem causa' },
  });
  assert.equal(semCausa.status, 400);
  assert.equal(semCausaBody.error, 'root_cause_required_for_close');
  const { response: semLead, body: semLeadBody } = await call(`/api/admin/incidents/${incidentIds.created}`, {
    method: 'PATCH', cookie: cookieTi, body: { next_status: 'em_contencao', reason: 'sem lead' },
  });
  assert.equal(semLead.status, 400);
  assert.equal(semLeadBody.error, 'containment_lead_required');
  const { response: valida, body: validaBody } = await call(`/api/admin/incidents/${incidentIds.created}`, {
    method: 'PATCH', cookie: cookieTi,
    body: { next_status: 'em_contencao', reason: 'contendo', containment_lead_name: 'Líder QA', containment_lead_id: 'lead-1' },
  });
  assert.equal(valida.status, 200);
  assert.equal(validaBody.incident.status, 'em_contencao');
  const { response: fecha, body: fechaBody } = await call(`/api/admin/incidents/${incidentIds.created}`, {
    method: 'PATCH', cookie: cookieTi,
    body: { next_status: 'encerrado', root_cause: 'causa raiz sintetica do prober', reason: 'encerrando' },
  });
  assert.equal(fecha.status, 200);
  assert.equal(fechaBody.incident.status, 'encerrado');
  const row = (await pool.query('SELECT resolved_at,root_cause FROM security_incidents WHERE id=$1', [incidentIds.created])).rows[0];
  assert.ok(row.resolved_at);
  assert.equal(row.root_cause, 'causa raiz sintetica do prober');
  const hist = (await pool.query("SELECT * FROM incident_history WHERE incident_id=$1 AND next_status='encerrado' ORDER BY created_at DESC LIMIT 1", [incidentIds.created])).rows[0];
  assert.ok(hist);
});

test('PLT-12 HTTP: id inválido chega ao handler e responde 400 invalid_id', opt, async () => {
  const { response, body } = await call('/api/admin/incidents/nao-e-uuid', {
    method: 'PATCH', cookie: cookieTi, body: { next_status: 'encerrado', root_cause: 'x' },
  });
  assert.equal(response.status, 400);
  assert.equal(body.error, 'invalid_id');
});

test('PLT-12 HTTP: id UUID inexistente responde 404 not_found', opt, async () => {
  const { response, body } = await call(`/api/admin/incidents/${randomUUID()}`, {
    method: 'PATCH', cookie: cookieTi, body: { next_status: 'encerrado', root_cause: 'x' },
  });
  assert.equal(response.status, 404);
  assert.equal(body.error, 'not_found');
});

test('PLT-12 HTTP+DB: ação inválida e método não suportado', opt, async () => {
  const { response: invalido, body: invalidoBody } = await call('/api/admin/incidents', { method: 'PUT', cookie: cookieTi, body: {} });
  assert.equal(invalido.status, 405);
  assert.equal(invalidoBody.error, 'method_not_allowed');
  const { response: getEvid, body: getEvidBody } = await call('/api/admin/incidents/evidences', { method: 'GET', cookie: cookieTi });
  assert.equal(getEvid.status, 405);
  const { response: resp, body: patchBody } = await call(`/api/admin/incidents/actions`, { method: 'PATCH', cookie: cookieTi, body: { id: randomUUID(), status: 'finalizada' } });
  assert.equal(resp.status, 400);
  assert.equal(patchBody.error, 'invalid_status');
});

test('PLT-12 HTTP+DB: evidência é referência com checksum e auditoria', opt, async () => {
  const { response, body } = await call('/api/admin/incidents/evidences', {
    method: 'POST', cookie: cookieTi,
    body: { incident_id: incidentIds.created, evidence_type: 'log', title: 'Log do prober', description: 'd', file_reference: '/sintetico/log.txt' },
  });
  assert.equal(response.status, 201, 'criação de evidência respondeu 201');
  assert.ok(body.evidence && body.evidence.id);
  const checksum = (await pool.query('SELECT checksum FROM incident_evidences WHERE id=$1', [body.evidence.id])).rows[0].checksum;
  const crypto = await import('node:crypto');
  const esperado = crypto.createHash('sha256').update('/sintetico/log.txt').digest('hex').slice(0, 32);
  assert.equal(checksum, esperado);
  const audit = (await pool.query("SELECT count(*)::int n FROM audit_log WHERE action='incident_evidence_add' AND target=$1", [incidentIds.created])).rows[0].n;
  assert.equal(audit, 1);
});

test('PLT-12 HTTP+DB: ação de resposta e conclusão com auditoria', opt, async () => {
  const { response, body } = await call('/api/admin/incidents/actions', {
    method: 'POST', cookie: cookieTi,
    body: { incident_id: incidentIds.created, action_type: 'contencao', title: 'Ação do prober',
      description: 'Descrição da ação com mais de dez caracteres.', assigned_to_name: 'A', due_at: '2027-01-01T00:00:00Z' },
  });
  assert.equal(response.status, 201, 'criação de ação respondeu 201');
  const actionId = body.action.id;
  const { response: concluida, text: concluidaText } = await call('/api/admin/incidents/actions', {
    method: 'PATCH', cookie: cookieTi, body: { id: actionId, status: 'concluida' },
  });
  assert.equal(concluida.status, 200, `conclusão respondeu ${concluida.status} body=${JSON.stringify(concluida.body)} text=${JSON.stringify(concluidaText)}`);
  const row = (await pool.query('SELECT completed_at FROM incident_actions WHERE id=$1', [actionId])).rows[0];
  assert.ok(row.completed_at);
  const audit = (await pool.query("SELECT count(*)::int n FROM audit_log WHERE action='incident_action_complete' AND target=$1", [incidentIds.created])).rows[0].n;
  assert.equal(audit, 1);
});

test('PLT-12 HTTP+DB: comunicação é registro interno (flags, sem envio externo)', opt, async () => {
  const { response, body } = await call('/api/admin/incidents/communications', {
    method: 'POST', cookie: cookieTi,
    body: { incident_id: incidentIds.created, recipient_type: 'dpo', recipient_contact: 'dpo@exemplo.invalid',
      subject: 'Comunicação do prober', content: 'Conteúdo da comunicação sintética com mais de vinte caracteres.' },
  });
  assert.equal(response.status, 201, 'criação de comunicação respondeu 201');
  assert.ok(body.communication);
  const flag = (await pool.query('SELECT dpo_notified FROM security_incidents WHERE id=$1', [incidentIds.created])).rows[0].dpo_notified;
  assert.equal(flag, true);
  const audit = (await pool.query("SELECT count(*)::int n FROM audit_log WHERE action='incident_communicate' AND target=$1", [incidentIds.created])).rows[0].n;
  assert.equal(audit, 1);
});

test('PLT-12 HTTP+DB: leitura não grava audit_log nem altera incidentes', opt, async () => {
  const auditBefore = await auditCount();
  const fingerprintBefore = (await pool.query(
    `SELECT md5(string_agg(id::text || ':' || status || ':' || updated_at::text, '|' ORDER BY id)) AS f FROM security_incidents`,
  )).rows[0].f;
  for (const cookie of [cookieTi, cookieAdmin]) {
    await call('/api/admin/incidents?type=vazamento_dados', { cookie });
    await call(`/api/admin/incidents/${incidentIds.created}`, { cookie });
  }
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await auditCount(), auditBefore, 'leitura não grava audit_log');
  const fingerprintAfter = (await pool.query(
    `SELECT md5(string_agg(id::text || ':' || status || ':' || updated_at::text, '|' ORDER BY id)) AS f FROM security_incidents`,
  )).rows[0].f;
  assert.equal(fingerprintAfter, fingerprintBefore, 'leitura não altera incidentes');
});

test('PLT-12 HTTP: correlação — x-request-id e x-correlation-id no cabeçalho e na telemetria', opt, async () => {
  const clientCorrelation = `qa-plt12-${randomUUID()}`;
  const { response } = await call('/api/admin/incidents?type=requests', {
    headers: { 'x-correlation-id': clientCorrelation },
  });
  assert.equal(response.status, 200);
  const requestId = response.headers.get('x-request-id');
  assert.ok(requestId);
  assert.equal(response.headers.get('x-correlation-id'), clientCorrelation);
  const row = await telemetryRow(requestId);
  assert.ok(row, 'linha de telemetria existe no PostgreSQL');
  assert.equal(row.request_id, requestId);
  assert.equal(row.correlation_id, clientCorrelation);
  assert.equal(row.method, 'GET');
  assert.equal(row.path, '/api/admin/incidents');
  assert.equal(row.status_code, 200);
});

test('PLT-12 HTTP: aliases existentes seguem servidos e protegidos', opt, async () => {
  const crm = await call('/api/crm/incidents', { cookie: cookieTi });
  assert.equal(crm.response.status, 200);
  const security = await call('/api/security/incidents', { cookie: cookieTi });
  assert.equal(security.response.status, 200);
  const anonymous = await call('/api/crm/incidents', { cookie: null });
  assert.equal(anonymous.response.status, 401);
});

test('PLT-12 HTTP: console de TI segue servido sem promoção de aba', opt, async () => {
  const response = await fetch(`${base}/admin/ti`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<html/i);
});
