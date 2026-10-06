import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describeIntelError, intelStatusLabel, intelTypeLabel, honestDate, count } from '../src/lib/intel-vocabulary.mjs';

const source = await readFile(new URL('../src/server/ext-intel-api.mjs', import.meta.url), 'utf8');
function serverErrorCodes(text) {
  const codes = new Set();
  const cleaned = text.replace(/\.includes\(\s*[`'\"][^`'\"]*[`'\"]\s*\)/g, '').replace(/[=!]==?\s*[`'\"][^`'\"]*[`'\"]/g, '');
  for (const match of cleaned.matchAll(/error:\s*([^,}\n]{1,200})/g)) for (const literal of match[1].matchAll(/[`'\"]([a-z0-9_]+)[`'\"]/g)) codes.add(literal[1]);
  for (const match of cleaned.matchAll(/new (?:HttpError|E)\(\s*\d+\s*,\s*[`'\"]([a-z0-9_]+)[`'\"]/g)) codes.add(match[1]);
  for (const match of cleaned.matchAll(/\b(?:bad|unavailable)\(\s*res\s*,\s*[`'\"]([a-z0-9_]+)[`'\"]/g)) codes.add(match[1]);
  return codes;
}
const codes = serverErrorCodes(source);

test('UX-07 inteligência: o levantamento real de códigos fica acima do limiar anti-deriva', () => assert.ok(codes.size > 28, `esperava mais de 28 códigos, achei ${codes.size}`));
test('UX-07 inteligência: todo código literal dos servidores tem descrição', () => {
  for (const code of codes) { const item = describeIntelError(code, 500); assert.ok(item.title.length > 0); assert.equal(item.code, code); assert.notEqual(item.title, code); }
});
test('UX-07 inteligência: desconhecido passa cru e ausência nunca vira data ou zero', () => {
  const unknown = describeIntelError('codigo_novo_do_servidor', 422);
  assert.equal(unknown.code, 'codigo_novo_do_servidor');
  assert.equal(unknown.title, 'Falha no servidor');
  assert.equal(honestDate(null), 'Dado ausente');
  assert.equal(count(null), 'Dado ausente');
  assert.equal(intelStatusLabel('estado_novo'), 'estado_novo');
  assert.equal(intelTypeLabel('tipo_novo'), 'tipo_novo');
});
test('UX-07 inteligência: vocabulário lê a apresentação e não expõe style inline', async () => {
  const workspace = await readFile(new URL('../src/app/admin/inteligencia/IntelWorkspace.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(workspace, /style\s*=\s*\{/);
  assert.match(workspace, /role="tablist"/);
  assert.match(workspace, /ArrowRight/);
  assert.match(workspace, /Home/);
  assert.match(workspace, /<UiState/);
});
