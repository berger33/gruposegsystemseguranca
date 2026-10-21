import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../scripts/ux-evidence-capture.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const start = source.indexOf("  'ux-pro-09e-7': {");
const end = source.indexOf('// UX-PRO-09B — diagnóstico visual público', start);
const stage = start >= 0 && end > start ? source.slice(start, end) : '';

test('UX-PRO-09E-7: captura opt-in possui 14 rotas, 8 viewports e saída exclusiva', () => {
  assert.ok(stage, 'o stage isolado ux-pro-09e-7 precisa estar declarado');
  assert.match(stage, /attributeTextOverflow:\s*true/);
  assert.match(stage, /probeTextOverflowWithoutDocumentOverflow:\s*true/);
  assert.match(stage, /reportTextOverflowProbe:\s*true/);
  assert.match(stage, /UX_EVIDENCE_09E7_DIR/);
  assert.match(stage, /docs\/UX-PRO-09E-7-evidencias-2026-10-21/);
  assert.equal((stage.match(/route:\s*['"][^'"]+['"]/g) || []).length, 14,
    'somente as 14 rotas públicas listadas no escopo devem ser medidas');
  assert.match(stage, /viewports:\s*\[320, 390, 768, 1440\]/);
  assert.equal(packageJson.scripts['test:ux-pro-09e-7'], 'node --test tests/ux-pro-09e-7-text-overflow.test.mjs');
});

test('UX-PRO-09E-7: probe de texto opt-in executa mesmo sem overflow horizontal do documento', () => {
  const globalOverflow = source.indexOf('if (overflow.scrollWidth > overflow.clientWidth + 1)');
  const textProbe = source.indexOf('if (plan.attributeTextOverflow &&');
  assert.ok(globalOverflow >= 0 && textProbe >= 0 && textProbe < globalOverflow,
    'o scanner de texto deve ser avaliado antes do ramo de overflow global');
  assert.match(source, /if \(plan\.attributeTextOverflow && \(plan\.probeTextOverflowWithoutDocumentOverflow\s*\|\|\s*overflow\.scrollWidth > overflow\.clientWidth \+ 1\)\)/,
    'somente o stage que habilita a opção deve medir sem overflow global; stages históricos preservam seu gatilho');
  assert.match(source, /reportTextOverflowProbe\s*\?\s*\{\s*textOverflowProbed:\s*true\s*\}/,
    'cada captura da etapa nova deve marcar que o probe foi executado');
  assert.match(source, /reportTextOverflowProbe\s*\?\s*\{\s*textOverflowCandidates\s*\}/,
    'a etapa nova registra array vazio quando mediu e não encontrou candidato');
});

test('UX-PRO-09E-7: mantém stages históricos fora da saída nova', () => {
  const stage09bStart = source.indexOf("  'ux-pro-09b': {");
  const stage09bEnd = source.indexOf('// UX-PRO-08C', stage09bStart);
  const stage09b = source.slice(stage09bStart, stage09bEnd);
  assert.ok(stage09bStart >= 0 && stage09bEnd > stage09bStart);
  assert.doesNotMatch(stage09b, /attributeTextOverflow|reportTextOverflowProbe/);
  assert.doesNotMatch(source.slice(source.indexOf("  'ux-pro-09e': {"), start), /probeTextOverflowWithoutDocumentOverflow/);
  assert.match(source, /'ux-pro-09e':\s*\{[\s\S]*?attributeTextOverflow:\s*true/,
    'a medição original da 09E permanece configurada como antes');
});

test('UX-PRO-09E-7: evidência registra 112 probes e integridade dos PNGs', () => {
  const output = execFileSync(process.execPath, ['scripts/ux-pro-09e-7-verify-evidence.mjs'], { encoding: 'utf8' });
  const result = JSON.parse(output);
  assert.equal(result.captures, 112);
  assert.equal(result.screenshots, 112);
  assert.equal(result.probes, 112);
});
