// Contrato de inventário da sessão browser EXT-14.
// A execução HTTP + Chromium real está no mesmo processo de
// tests/ext14-intel.integration.test.mjs para preservar a sessão autenticada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('UX-07 inteligência workspace: o cenário browser focal está acoplado ao gate real', async () => {
  const workspace = await readFile(new URL('../src/app/admin/inteligencia/IntelWorkspace.tsx', import.meta.url), 'utf8');
  const integration = await readFile(new URL('./ext14-intel.integration.test.mjs', import.meta.url), 'utf8');
  assert.match(workspace, /role="tablist"/);
  assert.match(workspace, /role="tabpanel"/);
  assert.doesNotMatch(workspace, /style\s*=\s*\{/);
  assert.match(integration, /page\.addInitScript/);
  assert.match(integration, /getByRole\("heading"/);
  assert.match(integration, /--single-process/);
});
