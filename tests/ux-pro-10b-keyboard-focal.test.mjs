import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('UX-PRO-10B: o campo de busca do shell administrativo recebe foco visível por teclado', async () => {
  const css = await readFile(new URL('../src/app/admin/AdminChrome.module.css', import.meta.url), 'utf8');
  const rule = css.match(/\.sideNav\s+:is\(([^)]*)\):focus-visible\s*\{([^}]*)\}/);
  assert.ok(rule, 'a navegação lateral precisa de uma regra de foco visível');
  assert.match(rule[1], /\binput\b/, 'a regra existente precisa incluir o campo Buscar módulo');
  assert.match(rule[2], /outline:\s*var\(--ux-focus-ring-width\)\s+solid\s+var\(--ux-color-focus\)/);
});
