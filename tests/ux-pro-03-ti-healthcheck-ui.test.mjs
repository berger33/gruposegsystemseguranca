import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
