import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const client = await readFile(new URL('../src/app/admin/ti/IntegrationLogClient.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/app/admin/ti/IntegrationLogClient.module.css', import.meta.url), 'utf8');
const consoleClient = await readFile(new URL('../src/app/admin/ti/TiConsole.tsx', import.meta.url), 'utf8');
const page = await readFile(new URL('../src/app/admin/ti/page.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/server/integration-log-api.mjs', import.meta.url), 'utf8');
const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');

test('UX-PRO-03 integration logs: improves the existing TI tab under the current role gates', () => {
  assert.match(consoleClient, /active==='integracoes'&&<IntegrationLogClient\/>/);
  assert.match(consoleClient, /\['integracoes','Registros de integração'\]/);
  assert.match(page, /allowedRoles=\{\['ti','admin'\]\}/);
  assert.match(api, /requireRole\(sess,\['admin','ti'\]\)/);
  assert.match(api, /if\(!sameOrigin\(req\)\)/);
});

test('UX-PRO-03 integration logs: preserves all existing endpoints, methods and request fields', () => {
  const paths = [
    '/api/admin/integrations/jobs',
    '/api/admin/integrations/logs',
    '/api/admin/integrations/webhooks',
    '/api/admin/integrations/webhooks/deliveries',
    '/api/admin/integrations/reconciliation',
  ];
  for (const path of paths) {
    assert.ok(client.includes(path), `expected client endpoint ${path}`);
    assert.ok(server.includes(path), `expected routed endpoint ${path}`);
  }
  for (const method of ['"POST"', '"PATCH"']) assert.ok(client.includes(method), `expected ${method} method`);
  for (const field of ['job_type', 'source', 'target', 'total_records', 'rate_limit_per_minute', 'max_retries', 'file_reference', 'name', 'url', 'secret', 'events', 'timeout_ms', 'webhook_id', 'event_type', 'payload', 'total_source', 'total_target', 'matched', 'mismatched', 'missing_in_target', 'missing_in_source']) {
    assert.ok(client.includes(field), `expected current API field ${field}`);
  }
  for (const action of ['integration_job_create', 'integration_job_execute', 'webhook_create', 'webhook_update', 'webhook_deliver', 'reconciliation_create']) assert.ok(api.includes(`action:'${action}'`), `expected existing audit action ${action}`);
});

test('UX-PRO-03 integration logs: distinguishes internal demonstration records from external integrations', () => {
  assert.match(client, /não conecta provedores externos/);
  assert.match(client, /sem chamar sistemas externos/);
  assert.match(client, /não faz chamada de rede/);
  assert.match(client, /não consulta nem compara as origens/);
  assert.match(client, /type="password"/);
  assert.doesNotMatch(client, /supersecret/);
});

test('UX-PRO-03 integration logs: gives distinct query states and responsive, themed, keyboard-operable controls', () => {
  for (const variant of ['loading', 'empty']) assert.ok(client.includes(`variant="${variant}"`), `expected ${variant} state`);
  assert.match(client, /variant: denied \? "denied" : "error"/);
  assert.match(client, /errors\[key\] \? "Indisponível"/);
  assert.match(client, /Tentar novamente/);
  assert.match(client, /aria-pressed=\{active === key\}/);
  assert.match(client, /role="region" aria-label="Tabela rolável/);
  for (const token of ['--ux-color-surface', '--ux-color-canvas', '--ux-color-text', '--ux-color-muted', '--ux-color-border', '--ux-color-focus', '--ux-color-warning', '--ux-color-success', '--ux-color-error']) assert.ok(styles.includes(token), `expected ${token}`);
  for (const breakpoint of ['@media(max-width:900px)', '@media(max-width:650px)']) assert.ok(styles.includes(breakpoint), `expected ${breakpoint}`);
  assert.match(styles, /:focus-visible/);
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}\b/i);
});
