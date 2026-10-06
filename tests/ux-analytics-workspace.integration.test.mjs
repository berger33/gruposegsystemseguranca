// Contrato de inventário da sessão browser EXT-11 / F07.
// A execução HTTP + Chromium real está no mesmo processo de
// tests/ext11-analytics.integration.test.mjs para preservar a sessão staff
// autenticada; aqui se garante que o cenário não seja enfraquecido nem removido.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workspace = await readFile(new URL('../src/app/admin/analytics/AnalyticsWorkspace.tsx', import.meta.url), 'utf8');
const integration = await readFile(new URL('./ext11-analytics.integration.test.mjs', import.meta.url), 'utf8');

test('UX-07 analytics workspace: o cenário browser focal está acoplado ao gate real', () => {
  assert.match(workspace, /role="tablist"/);
  assert.match(workspace, /role="tabpanel"/);
  assert.doesNotMatch(workspace, /style\s*=\s*\{/);
  assert.match(integration, /page\.addInitScript/);
  assert.match(integration, /getByRole\("heading"/);
  assert.match(integration, /--single-process/);
  assert.match(integration, /scrollWidth/);
});

test('UX-07 analytics workspace: o gate browser cobre falha honesta, teclado e autorização do servidor', () => {
  assert.match(integration, /Dados indisponíveis/);
  assert.match(integration, /não significa que a lista esteja vazia/);
  assert.match(integration, /keyboard\.press\("End"\)/);
  assert.match(integration, /keyboard\.press\("Home"\)/);
  assert.match(integration, /aria-selected/);
  assert.match(integration, /cookie: cookieRh \}\)\)\.status, 403/);
});

test('UX-07 analytics workspace: a apresentação preserva o contrato canônico do servidor', () => {
  assert.match(workspace, /\/api\/ext\/analytics\/experiments/);
  assert.match(workspace, /\/approve/);
  assert.match(workspace, /\/transition/);
  assert.match(workspace, /"Idempotency-Key": requestKey\(\)/);
});
