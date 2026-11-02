// PLT-06 — jornada de observabilidade: focal hermético no `test:unit`.
// Invariante provado aqui: as cinco leituras são somente leitura de ESTADO
// (nenhum INSERT em auth_access_audit, nenhuma alteração de alertas), exigem
// sessão admin/ti e mesmo origem nas escritas, validam tipo/status/ação/método
// e sanitizam erros de dependência. A aba `observacao` já montada não é
// promovida, substituída nem ligada à borda legada de RH.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { createObservabilityApi } from '../src/server/observability-api.mjs';
import { createObservability } from '../src/server/observability.mjs';
import {
  OBSERVABILITY_READ_TYPES,
  OBSERVABILITY_ALERT_STATUSES,
  OBSERVABILITY_ALERT_ACTIONS,
  OBSERVABILITY_READ_BOUNDARY,
  isObservabilityReadMethod,
  parseObservabilityReadType,
  parseObservabilityAlertStatus,
  parseObservabilityAlertAction,
  sanitizeDependencyError,
} from '../src/server/observability-read-contract.mjs';

const apiSource = await readFile(new URL('../src/server/observability-api.mjs', import.meta.url), 'utf8');
const telemetrySource = await readFile(new URL('../src/server/observability.mjs', import.meta.url), 'utf8');
const serverSource = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const consoleSource = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const componentSource = await readFile(new URL('../src/app/admin/ti/ObservabilityClient.tsx', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const ALERT_ID = '00000000-0000-4000-8000-000000000606';

function fakeObservability() {
  return {
    getMetrics: () => ({ http_requests_total: 0, http_requests_5xx: 0, jobs_failed: 0 }),
    getRecentRequests: () => [], getRecentJobs: () => [], getRecentDb: () => [], getAlerts: () => [],
  };
}

function fakePool({ failStatus = false, failUpdate = false, emptyUpdate = false } = {}) {
  const statements = [];
  return {
    statements,
    async query(sql, values = []) {
      statements.push({ sql: String(sql), values });
      if (failStatus && values.includes('status-invalido')) {
        throw Object.assign(new Error('invalid input value for enum crm_observability_alert_status'), { code: '22P02' });
      }
      if (failUpdate && /^UPDATE observability_alerts/i.test(String(sql).trim())) {
        throw new Error('falha sintética de dependência: password=senha-sintetica');
      }
      if (/^UPDATE observability_alerts/i.test(String(sql).trim())) {
        return { rows: emptyUpdate ? [] : [{ id: values[0], status: 'acknowledged' }] };
      }
      if (/^SELECT/i.test(String(sql).trim())) return { rows: [{}] };
      return { rows: [] };
    },
  };
}

function buildApi({ pool = fakePool(), sameOrigin = true, role = 'ti', getPool } = {}) {
  const output = [];
  const api = createObservabilityApi({
    json: (_res, status, body, headers = {}) => {
      output.push({ status, body, headers });
      return { status, body, headers };
    },
    sameOrigin: typeof sameOrigin === 'function' ? sameOrigin : () => sameOrigin,
    getPool: getPool || (() => pool),
    readAdminSession: async req => (req.role === null ? null : { role: req.role ?? role, identityId: 'qa-plt06-ti' }),
    observability: fakeObservability(),
  });
  return { api, output, pool, last: () => output.at(-1) };
}

function request(method, url, body, extra = {}) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  stream.method = method;
  stream.url = url;
  stream.headers = { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' };
  return Object.assign(stream, extra);
}

test('PLT-06 contrato puro: os cinco tipos, quatro estados e duas ações são fechados', () => {
  assert.deepEqual([...OBSERVABILITY_READ_TYPES], ['summary', 'requests', 'jobs', 'db', 'alerts']);
  assert.deepEqual([...OBSERVABILITY_ALERT_STATUSES], ['firing', 'acknowledged', 'resolved', 'suppressed']);
  assert.deepEqual([...OBSERVABILITY_ALERT_ACTIONS], ['acknowledge', 'resolve']);
  assert.deepEqual(OBSERVABILITY_READ_BOUNDARY, {
    leitura_grava_auditoria: false,
    leitura_altera_alertas: false,
    leitura_altera_permissoes: false,
    abre_borda_rh_legada: false,
    substitui_superficie_existente: false,
    promocao_de_tela: false,
    ciclo_de_alerta_e_explicito: true,
  });
  assert.equal(isObservabilityReadMethod('GET'), true);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'get', '']) {
    assert.equal(isObservabilityReadMethod(method), false, `${method} não é leitura`);
  }
});

test('PLT-06 contrato puro: parsers preservam padrões e recusam valores inventados', () => {
  assert.equal(parseObservabilityReadType(null), 'summary');
  assert.equal(parseObservabilityReadType(''), 'summary');
  assert.equal(parseObservabilityReadType('requests'), 'requests');
  assert.equal(parseObservabilityReadType('resumo'), null, 'não inventa tradução de tipo');
  assert.equal(parseObservabilityReadType(' summary '), null, 'espaço não altera contrato anterior');
  assert.equal(parseObservabilityAlertStatus(null), 'firing');
  assert.equal(parseObservabilityAlertStatus(''), 'firing');
  assert.equal(parseObservabilityAlertStatus('suppressed'), 'suppressed');
  assert.equal(parseObservabilityAlertStatus("firing' OR 1=1 --"), null);
  assert.equal(parseObservabilityAlertAction(undefined), 'acknowledge');
  assert.equal(parseObservabilityAlertAction(''), 'acknowledge');
  assert.equal(parseObservabilityAlertAction('resolve'), 'resolve');
  assert.equal(parseObservabilityAlertAction('delete'), null);
});

test('PLT-06 contrato puro: erro de dependência nunca carrega segredo sintético', () => {
  const secret = 'senha-sintetica-9';
  const token = 'token-sintetico-9';
  const error = new Error(`connect failed postgres://svc:${secret}@db.invalid/app?token=${token}&password=${secret} api_key: ${token} Bearer ${token}`);
  const sanitized = sanitizeDependencyError(error);
  assert.ok(sanitized);
  assert.doesNotMatch(sanitized, new RegExp(secret));
  assert.doesNotMatch(sanitized, new RegExp(token));
  assert.match(sanitized, /\[REDACTED\]/);
  assert.ok(sanitized.length <= 1000);
  assert.equal(sanitizeDependencyError(null), null);
  assert.equal(sanitizeDependencyError(''), null);
  assert.equal(sanitizeDependencyError(new Error('x'.repeat(2000))).length, 1000);
});

test('PLT-06 API: same-origin, 401 anônimo e 403 rh são anteriores a qualquer leitura', async () => {
  const cross = buildApi({ sameOrigin: false, role: null });
  await cross.api.handleMetrics(request('POST', '/api/admin/observability?type=summary', {}), {});
  assert.equal(cross.last().status, 403);
  assert.equal(cross.last().body.error, 'same_origin_required');
  assert.deepEqual(cross.pool.statements, []);

  const anonymous = buildApi({ role: null });
  await anonymous.api.handleMetrics(request('GET', '/api/admin/observability?type=summary', undefined, { role: null }), {});
  assert.equal(anonymous.last().status, 401);
  assert.equal(anonymous.last().body.error, 'admin_session_required');

  const rh = buildApi();
  await rh.api.handleMetrics(request('GET', '/api/admin/observability?type=summary', undefined, { role: 'rh' }), {});
  assert.equal(rh.last().status, 403);
  assert.equal(rh.last().body.error, 'observability_restricted_admin_ti');

  await rh.api.handleAlertAction(request('POST', `/api/admin/observability/alerts/${ALERT_ID}`, { action: 'acknowledge' }, { role: 'rh' }), {}, ALERT_ID);
  assert.equal(rh.last().status, 403);
  assert.equal(rh.last().body.error, 'observability_restricted');
  assert.ok(rh.pool.statements.every(({ sql }) => /^SELECT/i.test(sql.trim()) === false));
});

test('PLT-06 API: as cinco leituras só executam SELECT e preservam as chaves de resposta', async () => {
  const { api, pool, last } = buildApi();
  for (const type of OBSERVABILITY_READ_TYPES) {
    await api.handleMetrics(request('GET', `/api/admin/observability?type=${type}`), {});
    assert.equal(last().status, 200, `type=${type}`);
    const body = last().body;
    if (type === 'summary') assert.deepEqual(Object.keys(body).sort(), ['db_aggregates', 'memory', 'note']);
    if (type === 'requests') assert.deepEqual(Object.keys(body).sort(), ['memory_recent', 'requests']);
    if (type === 'jobs') assert.deepEqual(Object.keys(body).sort(), ['jobs', 'memory_recent']);
    if (type === 'db') assert.deepEqual(Object.keys(body).sort(), ['db_metrics', 'memory_recent']);
    if (type === 'alerts') assert.deepEqual(Object.keys(body).sort(), ['alerts', 'memory_firing']);
  }
  assert.ok(pool.statements.length > 0);
  for (const { sql } of pool.statements) {
    assert.match(sql.trim(), /^SELECT\b/i, 'nenhuma leitura pode escrever auditoria, alerta ou permissão');
  }
  const invalid = buildApi();
  await invalid.api.handleMetrics(request('GET', '/api/admin/observability?type=resumo'), {});
  assert.equal(invalid.last().status, 400);
  assert.equal(invalid.last().body.error, 'invalid_type');
  assert.deepEqual(invalid.pool.statements, [], 'tipo inválido não consulta banco');
});

test('PLT-06 API: método não GET na rota de leitura é 405 e não toca no banco', async () => {
  const { api, pool, last } = buildApi();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    await api.handleMetrics(request(method, '/api/admin/observability?type=summary', method === 'POST' ? {} : undefined), {});
    assert.equal(last().status, 405, `${method} precisa ser recusado`);
    assert.equal(last().body.error, 'method_not_allowed');
    assert.equal(last().headers.Allow, 'GET');
  }
  assert.deepEqual(pool.statements, []);
  const alias = buildApi();
  await alias.api.handleMetrics(request('POST', '/api/admin/observability/metrics', {}), {});
  assert.equal(alias.last().status, 405);
  assert.equal(alias.last().headers.Allow, 'GET');
});

test('PLT-06 API: filtro status inválido é 400 e não vira erro 503 de dependência', async () => {
  const { api, pool, last } = buildApi({ pool: fakePool({ failStatus: true }) });
  await api.handleMetrics(request('GET', '/api/admin/observability?type=alerts&status=status-invalido'), {});
  assert.equal(last().status, 400);
  assert.equal(last().body.error, 'invalid_status');
  assert.deepEqual(pool.statements, [], 'status fora do enum não pode chegar ao PostgreSQL');
  for (const status of OBSERVABILITY_ALERT_STATUSES) {
    const valid = buildApi();
    await valid.api.handleMetrics(request('GET', `/api/admin/observability?type=alerts&status=${status}`), {});
    assert.equal(valid.last().status, 200);
    assert.equal(valid.pool.statements.at(-1).values[0], status);
  }
});

test('PLT-06 API: falha de dependência mantém o código e devolve error_sanitized', async () => {
  const secret = 'senha-sintetica-9';
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const failure = buildApi({ getPool: () => { throw new Error(`postgres://svc:${secret}@db.invalid/app?token=token-sintetico`); } });
    await failure.api.handleMetrics(request('GET', '/api/admin/observability?type=requests'), {});
    assert.equal(failure.last().status, 503);
    assert.equal(failure.last().body.error, 'observability_unavailable');
    assert.doesNotMatch(JSON.stringify(failure.last().body), new RegExp(secret));
    assert.match(failure.last().body.error_sanitized, /\[REDACTED\]/);

    const alertFailure = buildApi({ pool: fakePool({ failUpdate: true }) });
    await alertFailure.api.handleAlertAction(request('POST', `/api/admin/observability/alerts/${ALERT_ID}`, { action: 'acknowledge' }), {}, ALERT_ID);
    assert.equal(alertFailure.last().status, 503);
    assert.equal(alertFailure.last().body.error, 'alert_action_failed');
    assert.doesNotMatch(JSON.stringify(alertFailure.last().body), new RegExp(secret));
    assert.ok(alertFailure.last().body.error_sanitized);
  } finally {
    console.error = originalConsoleError;
  }
});

test('PLT-06 telemetria: error_sanitized persistido usa a mesma sanitização', async () => {
  const statements = [];
  const pool = { query: async (sql, values = []) => { statements.push({ sql, values }); return { rows: [] }; } };
  const obs = createObservability({ getPool: () => pool });
  const secret = 'senha-sintetica-9';
  obs.recordHttp({
    request_id: 'req-plt06-sintetico',
    correlation_id: 'corr-plt06-sintetico',
    method: 'GET', path: '/api/admin/observability', status_code: 503, duration_ms: 12,
    error: new Error(`postgres://svc:${secret}@db.invalid/app?token=token-sintetico`),
  });
  await new Promise(resolve => setImmediate(resolve));
  const insert = statements.find(({ sql }) => sql.includes('INSERT INTO observability_http_requests'));
  assert.ok(insert, 'a linha de telemetria precisa ser persistida');
  assert.equal(insert.values[0], 'req-plt06-sintetico');
  assert.equal(insert.values[1], 'corr-plt06-sintetico');
  assert.doesNotMatch(JSON.stringify(insert.values), new RegExp(secret));
  assert.match(insert.values[10], /\[REDACTED\]/);
});

test('PLT-06 ciclo de alerta: acknowledge/resolve gravam e auditoria própria é preservada', async () => {
  const { api, pool, last } = buildApi();
  await api.handleAlertAction(request('POST', `/api/admin/observability/alerts/${ALERT_ID}`, { action: 'acknowledge' }), {}, ALERT_ID);
  assert.equal(last().status, 200);
  assert.equal(last().body.alert.id, ALERT_ID);
  assert.ok(pool.statements.some(({ sql }) => sql.includes('observability_alert_ack')));
  await api.handleAlertAction(request('PATCH', `/api/admin/observability/alerts/${ALERT_ID}`, { action: 'resolve' }), {}, ALERT_ID);
  assert.equal(last().status, 200, 'PATCH continua aceito');
  assert.ok(pool.statements.some(({ sql }) => sql.includes('observability_alert_resolve')));
});

test('PLT-06 ciclo de alerta: id inválido, alerta ausente, ação inválida e método são recusados', async () => {
  const { api, pool, last } = buildApi();
  await api.handleAlertAction(request('POST', '/api/admin/observability/alerts/alerta-invalido', { action: 'acknowledge' }), {}, 'alerta-invalido');
  assert.equal(last().status, 400);
  assert.equal(last().body.error, 'invalid_alert_id');

  const missing = buildApi({ pool: fakePool({ emptyUpdate: true }) });
  await missing.api.handleAlertAction(request('POST', `/api/admin/observability/alerts/${ALERT_ID}`, { action: 'acknowledge' }), {}, ALERT_ID);
  assert.equal(missing.last().status, 404);
  assert.equal(missing.last().body.error, 'not_found');

  const badAction = buildApi();
  await badAction.api.handleAlertAction(request('POST', `/api/admin/observability/alerts/${ALERT_ID}`, { action: 'delete' }), {}, ALERT_ID);
  assert.equal(badAction.last().status, 400);
  assert.equal(badAction.last().body.error, 'invalid_action');
  assert.deepEqual(badAction.pool.statements, []);

  const badMethod = buildApi();
  await badMethod.api.handleAlertAction(request('GET', `/api/admin/observability/alerts/${ALERT_ID}`, undefined), {}, ALERT_ID);
  assert.equal(badMethod.last().status, 405);
  assert.equal(badMethod.last().body.error, 'method_not_allowed');
  assert.equal(badMethod.last().headers.Allow, 'POST, PATCH');
  assert.deepEqual(pool.statements, []);
});

test('PLT-06 superfície: gate nomeado sem promoção de tela nem borda legada de RH', () => {
  assert.match(apiSource, /from '\.\/observability-read-contract\.mjs'/);
  assert.match(telemetrySource, /from '\.\/observability-read-contract\.mjs'/);
  const metricsHandler = apiSource.slice(apiSource.indexOf('async function handleMetrics'), apiSource.indexOf('async function handleAlertAction'));
  assert.doesNotMatch(metricsHandler, /INSERT INTO auth_access_audit/);
  assert.match(metricsHandler, /Allow: 'GET'/);
  assert.match(metricsHandler, /invalid_status/);
  assert.match(apiSource, /error_sanitized/);

  const alertLine = serverSource.split('\n').find(line => line.includes('const obsAlertMatch'));
  assert.ok(alertLine, 'despacho do alerta precisa existir');
  assert.ok(alertLine.includes('([^/]+)$/i'), 'id inválido precisa chegar ao handler para responder 400');
  assert.match(serverSource, /authorizeLegacyHrRequest/);
  assert.match(serverSource, /employees\.read/);
  assert.doesNotMatch(apiSource, /authorizeLegacyHrRequest|employees\.read/);

  assert.match(consoleSource, /\['observacao','Observabilidade'\]/);
  assert.match(consoleSource, /active==='observacao'&&<ObservabilityClient\/>/);
  assert.match(componentSource, /fetch\(`\/api\/admin\/observability\?type=/);
  assert.match(componentSource, /fetch\(`\/api\/admin\/observability\/alerts\//);
  assert.ok(pkg.scripts['test:unit'].includes('tests/plt06-observability-read-contract.test.mjs'));
  assert.equal(pkg.scripts['test:plt06-observability:pg'], 'node scripts/qa-plt06-observability-postgres.mjs');
});

// A dívida medida pelo gate (a 103 reescreveu o CHECK a partir de uma cópia
// literal e deixou cair as ações de 044/045/046) foi autorizada como fatia
// própria e entrou como migração 183 aditiva. Esta guarda é hermética: prova a
// forma do SQL e o encaixe no ledger, sem tocar em banco. A recusa e a aceitação
// reais são medidas no gate de PostgreSQL (plt06-…integration.test.mjs).
test('PLT-06/07/08: a migração 183 devolve as cinco ações que o CHECK da 103 recusava', async () => {
  const ACOES = [
    'observability_alert_ack', 'observability_alert_resolve',
    'healthcheck_query', 'backup_status', 'backup_retention_update',
  ];
  const migration = await readFile(
    new URL('../db/migrations/183-plt-audit-actions-check-widening.sql', import.meta.url), 'utf8');

  for (const action of ACOES) {
    assert.ok(migration.includes(`'${action}'`), `a 183 precisa nomear ${action}`);
    assert.match(migration, new RegExp(`position\\(quote_literal\\('${action}'\\) IN previous_check\\) = 0`),
      `${action} precisa estar na guarda de idempotência, para reexecutar sem duplicar`);
  }
  assert.equal(migration.split("NOT VALID'").length - 1, 1,
    'o apêndice entra validado uma única vez, no EXECUTE — não pode haver segunda constraint');
  assert.match(migration, /SELECT pg_get_expr\(conbin, conrelid\) INTO previous_check/,
    'a ampliação parte da definição vigente, lida do catálogo');
  assert.match(migration, /CHECK \(\(%s\) OR action IN \(%L,%L,%L,%L,%L\)\)/,
    'a definição anterior é preservada por referência, não copiada');
  // O defeito da 103 foi reescrever a lista a partir de uma cópia. Reeditar assim
  // reintroduziria a perda, então a forma é afirmada em teste. As asserções de
  // estrutura correm sobre o SQL sem prosa: comentário não é fato executável.
  const sqlOnly = migration.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(migration, /CHECK \(action IN \(/,
    'a 183 não pode reescrever a lista literalmente — foi assim que a 103 perdeu as ações');
  assert.doesNotMatch(sqlOnly, /\bCREATE\s+(TABLE|INDEX|TYPE|VIEW|TRIGGER|FUNCTION)\b/i,
    'a 183 é só constraint: nenhuma tabela, índice ou tipo nasce aqui');
  assert.doesNotMatch(sqlOnly, /\bDROP\s+(TABLE|INDEX|COLUMN|SCHEMA)\b/i,
    'a 183 não pode derrubar estrutura nem dado');
  assert.doesNotMatch(sqlOnly, /\bDELETE\s+FROM\b/i, 'a 183 não reescreve linhas existentes');
  assert.equal(sqlOnly.split('ADD CONSTRAINT auth_access_audit_action_check').length - 1, 1,
    'exatamente uma constraint reinstalada');
  assert.equal(sqlOnly.split('DROP CONSTRAINT auth_access_audit_action_check').length - 1, 1,
    'exatamente a constraint vigente substituída, nada além');

  // Os cinco nomes são exatamente os que o código tenta gravar — a fatia não
  // inventa ação nova nem promoce escrita: os gravadores continuam engolindo o
  // erro, só que agora não há erro a engolir.
  const healthSource = await readFile(new URL('../src/server/healthcheck-api.mjs', import.meta.url), 'utf8');
  const backupSource = await readFile(new URL('../src/server/backup-api.mjs', import.meta.url), 'utf8');
  const attempted = [
    ...apiSource.matchAll(/INSERT INTO auth_access_audit[^;]*?'([a-z0-9_]+)'/g),
    ...healthSource.matchAll(/INSERT INTO auth_access_audit[^;]*?'([a-z0-9_]+)'/g),
    ...backupSource.matchAll(/INSERT INTO auth_access_audit[^;]*?'([a-z0-9_]+)'/g),
  ].map(match => match[1]);
  for (const action of ACOES) {
    assert.ok(attempted.includes(action), `${action} precisa continuar sendo tentada pelo código`);
  }

  const migrator = await readFile(new URL('../scripts/migrate-site-visual.mjs', import.meta.url), 'utf8');
  assert.match(migrator, /'183-plt-audit-actions-check-widening\.sql'/);
  assert.match(migrator, /files\.length !== 183/);
  assert.match(migrator, /001–183/);
  const wave0 = await readFile(new URL('../scripts/qa-wave0-static.mjs', import.meta.url), 'utf8');
  assert.match(wave0, /const latestMigration = 183;/);
  const pglite = await readFile(new URL('../src/server/pglite-pool.mjs', import.meta.url), 'utf8');
  assert.match(pglite, /001–183/, 'a demo PGlite não pode ficar declarando ledger velho');
});
