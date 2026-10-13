import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const base = new URL('../src/app/admin/ti/', import.meta.url);
const audit = await readFile(new URL('AuditClient.tsx', base), 'utf8');
const observability = await readFile(new URL('ObservabilityClient.tsx', base), 'utf8');
const styles = await readFile(new URL('TechnicalOpsClient.module.css', base), 'utf8');

test('UX-PRO-03 audit: retains query and audited export API contracts', () => {
  assert.match(audit, /fetch\(`\/api\/admin\/audit\?\$\{params\.toString\(\)\}`/);
  assert.match(audit, /fetch\("\/api\/admin\/audit\/export", \{/);
  assert.match(audit, /JSON\.stringify\(\{ filters, format: "json" \}\)/);
  assert.match(audit, /audit_export/);
  assert.match(audit, /data\.total/);
});

test('UX-PRO-03 audit: labels data states and identifies the returned count limit', () => {
  for (const text of ['Data e hora', 'Responsável', 'Resultado', 'Categoria', 'Nenhum evento corresponde aos filtros', 'Até 100 eventos recentes']) {
    assert.ok(audit.includes(text), `expected audit UI text: ${text}`);
  }
  assert.match(audit, /<UiState variant="error"/);
  assert.match(audit, /<UiState variant="empty"/);
});

test('UX-PRO-03 observability: retains summary query and alert action contracts', () => {
  assert.match(observability, /fetch\(`\/api\/admin\/observability\?type=\$\{selectedType\}&limit=\$\{safeLimit\}`/);
  assert.match(observability, /fetch\(`\/api\/admin\/observability\/alerts\/\$\{id\}`/);
  assert.match(observability, /JSON\.stringify\(\{ action \}\)/);
  assert.match(observability, /"acknowledge" \| "resolve"/);
});

test('UX-PRO-03 observability: keeps operational metrics apart from expandable diagnostics', () => {
  assert.match(observability, /className=\{styles\.metrics\}/);
  assert.match(observability, /<summary>Diagnóstico técnico:/);
  assert.match(observability, /r\.error_sanitized/);
  assert.match(observability, /Eventos técnicos detalhados/);
  assert.match(observability, /<UiState variant="loading"/);
  assert.match(observability, /<UiState variant="error"/);
  assert.match(observability, /<UiState variant="empty"/);
});

test('UX-PRO-03 technical screens: responsive layout and keyboard focus use semantic tokens', () => {
  assert.match(styles, /@media\(max-width:650px\)/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /var\(--ux-color-surface\)/);
  assert.match(styles, /var\(--ux-color-text\)/);
});
