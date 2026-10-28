import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Reauditoria técnica da família SEC — guarda do mapa de evidências.
// RED: sem o mapa gerado e sem a evidência de EXECUÇÃO dos gates, isto falha.
// GREEN: 15 IDs, 35 âncoras, 5 execuções de gates com exit 0, 0 aceite humano.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFile(path.join(root, f), 'utf8');
const MAPA = 'docs/REQUISITOS-SEC-REAUDITORIA-2026-10-28.json';
const EXEC = 'docs/REQUISITOS-SEC-EVIDENCIA-EXECUCAO-2026-10-28.json';

test('SEC: o mapa cobre os 15 IDs com 35 âncoras de asserção executável', async () => {
  const data = JSON.parse(await read(MAPA));
  assert.equal(data.stage, 'requisitos-sec-reaudit');
  assert.equal(data.resumo.familia, 'SEC');
  assert.equal(data.resumo.total, 15);
  assert.equal(data.resumo.ancoras, 35);
  assert.equal(data.resumo.ancorasEncontradas, 35,
    'toda âncora precisa existir no código — ausência é lacuna real');
  assert.deepEqual(data.resumo.porClasse, { evidencia_tecnica_mapeada: 15 });
  const ids = data.requisitos.map(r => r.id);
  assert.equal(new Set(ids).size, 15);
  for (let i = 1; i <= 15; i += 1) {
    assert.ok(ids.includes(`SEC-${String(i).padStart(2, '0')}`), `SEC-${i} ausente`);
  }
  for (const r of data.requisitos) {
    assert.ok(r.gate_existe, `${r.id}: gate ${r.gate} precisa existir`);
    assert.ok(r.evidencias.every(e => e.encontrado && e.linha > 0),
      `${r.id}: toda evidência precisa apontar arquivo:linha`);
    assert.ok(r.evidencias.every(e => e.trecho && !/^\s*(\/\/|\*|#)/.test(e.trecho)),
      `${r.id}: a âncora precisa ser uma linha de código executável, não comentário`);
  }
});

test('SEC: o mapa NÃO inventa aceite humano nem reauditoria integral', async () => {
  const data = JSON.parse(await read(MAPA));
  assert.equal(data.resumo.aceiteHumano, 0);
  assert.equal(data.resumo.reauditoriaIntegral, 0);
  for (const r of data.requisitos) {
    assert.equal(r.aceite_humano, 'nao_registrado');
    assert.equal(r.reauditoria_integral, 'nao_executada');
    assert.match(r.limite, /aceite humano/);
  }
  const md = await read('docs/REQUISITOS-SEC-REAUDITORIA-2026-10-28.md');
  assert.match(md, /Aceite humano: 0\/15/);
  assert.match(md, /Reauditoria integral: 0\/15/);
  assert.match(md, /NO-GO/);
  assert.doesNotMatch(md, /aceite humano (?:realizado|concluído|aprovado)/i);
});

test('SEC: o gerador tem --check e está no workflow de CI', async () => {
  const script = await read('scripts/requisitos-sec-reaudit.mjs');
  assert.match(script, /process\.argv\.includes\('--check'\)/);
  assert.match(script, /SEC_REAUDIT_MISMATCH/);
  assert.match(script, /aceite_humano: 'nao_registrado'/);
  assert.match(script, /NÃO conta menção literal de ID|não conta menção literal/);
  const pkg = JSON.parse(await read('package.json'));
  assert.ok(pkg.scripts['reaudit:sec'], 'script reaudit:sec precisa existir');
  assert.match(pkg.scripts['test:unit'], /tests\/requisitos-sec-reaudit\.test\.mjs/,
    'a guarda precisa rodar na suíte local/CI');
  const ci = await read('.github/workflows/ci.yml');
  assert.match(ci, /npm run reaudit:sec/,
    'o CI precisa validar que as âncoras e o mapa continuam sincronizados');
});

test('SEC: as 5 execuções de gates foram EXECUTADAS com exit 0 nesta fatia', async () => {
  const data = JSON.parse(await read(EXEC));
  assert.equal(data.stage, 'requisitos-sec-evidencia-execucao');
  assert.equal(data.gates.length, 5);
  assert.equal(data.gates.filter(g => g.exit === 0).length, 5,
    `gates com falha: ${data.gates.filter(g => g.exit !== 0).map(g => g.gate).join(', ')}`);
  assert.ok(data.gates.some(g => g.filtro === 'E6 grupo 2' && /# pass 7/.test(g.resumo)),
    'SEC-10 precisa de execução observada da jornada de orçamento/simulador');
  assert.ok(data.gates.some(g => g.filtro === 'UX-PRO-10B previas' && /# pass 5/.test(g.resumo)),
    'SEC-11 precisa de execução observada das prévias');
  for (const g of data.gates) {
    assert.ok(g.duracaoMs > 0, `${g.gate}: precisa de duração medida`);
    assert.ok(g.resumo, `${g.gate}: precisa de resumo da saída`);
    const ambienteEsperado = g.gate === 'scripts/qa-wave0-static.mjs'
      ? 'não aplicável (gate estático)'
      : g.gate === 'scripts/qa-ux-public-routes-postgres.mjs'
        ? 'PostgreSQL 17 descartável + Chromium' : 'PostgreSQL 17 descartável';
    assert.equal(g.database, ambienteEsperado,
    `${g.gate}: precisa declarar com precisão o ambiente usado`);
  }
  assert.match(data.limite, /aceite humano/);
});

test('SEC: a matriz de 222 reconhece o mapa como evidência de gate', async () => {
  const matriz = JSON.parse(await read('docs/REQUISITOS-222-INVENTARIO-2026-10-27.json'));
  const secs = matriz.requisitos.filter(r => r.prefixo === 'SEC');
  assert.equal(secs.length, 15);
  // Antes da fatia, 9 SEC eram `somente_documento`. O mapa de reauditoria é
  // uma fonte de GATE (asserções executáveis), então nenhum SEC pode ficar
  // classificado como somente_documento sem que isso seja uma lacuna explícita.
  const semEvidencia = secs.filter(r => r.classe_evidencia_atual === 'somente_documento');
  assert.equal(semEvidencia.length, 0,
    `SEC ainda sem evidência de gate: ${semEvidencia.map(r => r.id).join(', ')}`);
  for (const r of secs) {
    assert.equal(r.aceite_humano, 'nao_registrado', `${r.id}: aceite humano não pode ser inventado`);
  }
});
