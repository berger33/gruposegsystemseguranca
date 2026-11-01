import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHealthcheckApi } from '../src/server/healthcheck-api.mjs';

const client = await readFile(new URL('../src/app/admin/ti/HealthcheckClient.tsx', import.meta.url), 'utf8');
const consoleClient = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/admin/ti/page.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/server/healthcheck-api.mjs', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/app/admin/ti/HealthcheckClient.module.css', import.meta.url), 'utf8');

test('UX-PRO-03 health: improves the mounted TI health surface behind the existing role gate', () => {
  assert.match(consoleClient, /active==='saude'&&<HealthcheckClient\/>/);
  assert.match(consoleClient, /\['saude','Saúde do sistema'\]/);
  assert.match(page, /allowedRoles=\{\['ti','admin'\]\}/);
});

test('UX-PRO-03 health: keeps all health and history endpoints and separates their states', () => {
  for (const endpoint of ['/api/health', '/api/health/live', '/api/health/ready', '/api/admin/operational', '/api/admin/operational/history?limit=50']) {
    assert.ok(client.includes(endpoint), `expected endpoint ${endpoint}`);
  }
  for (const state of ['loading', 'empty', 'success']) {
    assert.ok(client.includes(`variant="${state}"`) || client.includes(`variant: '${state}'`), `expected ${state} UI state`);
  }
  assert.match(client, /variant: denied \? 'denied' : 'error'/);
  assert.match(client, /mode === 'ready' && response\.status === 503/);
  assert.match(client, /historyError/);
  assert.match(client, /historyLoading/);
});

test('UX-PRO-03 health: accurately describes status, diagnostics, and existing authorization rules', () => {
  for (const value of ['healthy', 'degraded', 'unhealthy', 'unknown']) assert.ok(client.includes(`${value}:`));
  for (const name of ['database', 'queue', 'integrations', 'observability']) assert.ok(api.includes(`name: '${name}'`));
  assert.match(api, /operational_panel_restricted_admin_ti/);
  assert.match(api, /operational_panel_restricted/);
  assert.match(api, /'healthcheck_query'/);
  assert.match(client, /Resposta técnica completa \(JSON\)/);
  assert.match(client, /Detalhe técnico sanitizado/);
  assert.match(client, /Processo respondendo/);
  assert.match(client, /Não pronto/);
});

test('UX-PRO-03 health: sanitizes credential-bearing connection strings in dependency failures', async () => {
  const syntheticSecret = 'synthetic-only-password';
  const pool = { query: async () => { throw new Error(`connect failed postgres://svc:${syntheticSecret}@db.invalid/app?token=synthetic-only-token`); } };
  let response;
  const health = createHealthcheckApi({
    json: (_res, status, body) => { response = { status, body }; },
    getPool: () => pool,
    readAdminSession: async () => ({ role: 'ti', identityId: 'synthetic-identity' }),
    sameOrigin: () => true,
    observability: null,
  });
  await health.handleReady({ url: '/api/health/ready', headers: { host: 'test.invalid' } }, {});
  const serialized = JSON.stringify(response);
  assert.equal(response.status, 503);
  assert.equal(response.body.ready, false);
  assert.doesNotMatch(serialized, /synthetic-only-password|synthetic-only-token/);
  assert.match(serialized, /REDACTED/);
});

test('UX-PRO-03 health: enforces same-origin and admin/ti RBAC on operational health and history', async () => {
  const queries = [];
  const pool = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('COUNT(*) FILTER')) return { rows: [{ total: 0, failures: 0 }] };
    if (sql.includes('COUNT(*) AS queued')) return { rows: [{ queued: 0 }] };
    if (sql.startsWith('SELECT * FROM operational_')) return { rows: [] };
    return { rows: [{ ok: 1 }] };
  } };
  const outcomes = [];
  const health = createHealthcheckApi({
    json: (_res, status, body) => { outcomes.push({ status, body }); },
    getPool: () => pool,
    readAdminSession: async req => req.role ? { role: req.role, identityId: 'synthetic-id' } : null,
    sameOrigin: req => req.origin !== 'cross-site',
    observability: null,
  });
  const request = (url, role, origin = 'same-site') => ({ url, role, origin, headers: { host: 'test.invalid' } });

  await health.handleHealth(request('/api/admin/operational', 'ti', 'cross-site'), {});
  assert.equal(outcomes.at(-1).status, 403);
  assert.equal(outcomes.at(-1).body.error, 'same_origin_required');
  await health.handleHealth(request('/api/admin/operational', null), {});
  assert.equal(outcomes.at(-1).status, 401);
  await health.handleHealth(request('/api/admin/operational', 'rh'), {});
  assert.equal(outcomes.at(-1).status, 403);
  assert.equal(outcomes.at(-1).body.error, 'operational_panel_restricted_admin_ti');
  await health.handleHealth(request('/api/admin/operational', 'ti'), {});
  assert.equal(outcomes.at(-1).status, 200);
  assert.ok(queries.some(({ sql }) => sql.includes('healthcheck_query')));

  await health.handleOperationalHistory(request('/api/admin/operational/history?limit=999', 'admin'), {});
  assert.equal(outcomes.at(-1).status, 200);
  assert.ok(queries.some(({ sql, params }) => sql.startsWith('SELECT * FROM operational_health_checks') && params[0] === 200));
  await health.handleOperationalHistory(request('/api/admin/operational/history', 'rh'), {});
  assert.equal(outcomes.at(-1).status, 403);
  await health.handleOperationalHistory(request('/api/admin/operational/history', 'ti', 'cross-site'), {});
  assert.equal(outcomes.at(-1).status, 403);
  assert.equal(outcomes.at(-1).body.error, 'same_origin_required');
});

test('UX-PRO-03 health: preserves liveness and reports readiness degradation without hiding a ready database', async () => {
  const writes = [];
  let dependencyQueries = 0;
  const pool = { query: async (sql, params) => {
    dependencyQueries += 1;
    if (sql.startsWith('SELECT 1')) return { rows: [{ ok: 1 }] };
    if (sql.includes('notification_queue')) return { rows: [{ queued: 150 }] };
    if (sql.includes('FROM integrations')) return { rows: [{ total: 2, failures: 1 }] };
    writes.push({ sql, params });
    return { rows: [] };
  } };
  const metrics = { http_requests_5xx: 8, jobs_failed: 2 };
  const outcomes = [];
  const health = createHealthcheckApi({
    json: (_res, status, body) => { outcomes.push({ status, body }); },
    getPool: () => pool,
    readAdminSession: async () => null,
    sameOrigin: () => true,
    observability: { getMetrics: () => metrics },
  });
  await health.handleLive({ url: '/api/health/live' }, {});
  assert.equal(outcomes.at(-1).status, 200);
  assert.equal(outcomes.at(-1).body.check, 'liveness');
  assert.equal(dependencyQueries, 0, 'liveness must not depend on database availability');

  await health.handleReady({ url: '/api/health/ready' }, {});
  const { status, body } = outcomes.at(-1);
  assert.equal(status, 200);
  assert.equal(body.ready, true);
  assert.equal(body.overall_status, 'degraded');
  assert.deepEqual(body.degraded_dependencies, ['queue', 'integrations', 'observability']);
  assert.equal(body.checks.find(check => check.name === 'queue').metadata.queued, 150);
  assert.equal(body.checks.find(check => check.name === 'observability').metadata.http_5xx, 8);
  assert.ok(writes.some(({ sql }) => sql.startsWith('INSERT INTO operational_status')));
  assert.equal(writes.filter(({ sql }) => sql.startsWith('INSERT INTO operational_health_checks')).length, 4);
});

test('UX-PRO-03 health: uses responsive theme tokens, labels, and visible keyboard focus', () => {
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /@media \(max-width: 650px\)/);
  assert.match(styles, /:focus-visible/);
  for (const token of ['--ux-color-surface', '--ux-color-canvas', '--ux-color-text', '--ux-color-muted', '--ux-color-border', '--ux-color-focus']) {
    assert.ok(styles.includes(token), `expected theme token ${token}`);
  }
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
  assert.match(client, /<label className=\{styles\.field\}>Tipo de consulta/);
  assert.match(client, /type="button"/);
  assert.match(client, /<details className=\{styles\.technical\}>/);
});
