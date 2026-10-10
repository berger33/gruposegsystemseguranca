// UX-PRO-00 — o inventário vigente é reproduzível e a matriz commitada corresponde ao código.
// Não executa navegador nem API: confere contagens e a igualdade byte a byte do CSV gerado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildMatrix, summarize, toCsv, MATRIX_FILE } from '../scripts/ux-pro-00-inventory.mjs';

const root = path.resolve(import.meta.dirname, '..');
const rows = buildMatrix(root);
const summary = summarize(rows);

test('inventário vigente: 100 arquivos page.tsx, separados por área', () => {
  assert.equal(summary.total_page_tsx, 100);
  assert.equal(summary.admin, 44);
  assert.equal(summary.cliente, 29);
  assert.equal(summary.cliente_app, 15);
  assert.equal(summary.demais, 27);
});

test('papéis literais no AdminGate e exceções administrativas permanecem como registradas', () => {
  assert.equal(summary.admin_gate_papeis_literais, 39);
  assert.deepEqual(summary.admin_sem_gate_literal, [
    '/admin',
    '/admin/convite',
    '/admin/entrar',
    '/admin/verificacao-manual',
    '/admin/visual',
  ]);
});

test('catálogo global de navegação: 26 destinos diretos, sem duplicidade', () => {
  assert.equal(summary.catalogo_destinos_diretos, 26);
});

test('a matriz commitada é exatamente a saída do gerador (reprodutível)', async () => {
  const committed = (await readFile(path.join(root, MATRIX_FILE), 'utf8')).replace(/\r\n/g, '\n');
  assert.equal(committed, toCsv(rows), `regenere com: node scripts/ux-pro-00-inventory.mjs --write`);
});

test('toda rota da matriz tem área, evidência de código e lacuna explícita', () => {
  for (const row of rows) {
    assert.ok(row.area, `${row.rota} sem área`);
    assert.match(row.evid_codigo, /^código: src\/app\//, `${row.rota} sem evidência de código`);
    assert.ok(row.lacunas.includes('teclado não validado'), `${row.rota} sem lacuna de teclado`);
    assert.ok(row.evid_validacao_manual.startsWith('não registrada'), `${row.rota} não pode ter validação manual inventada`);
    assert.ok(row.evid_aceite_humano.startsWith('não registrado'), `${row.rota} não pode ter aceite humano inventado`);
  }
});
