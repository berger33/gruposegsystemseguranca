import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const GENERATOR = 'scripts/ux-pro-00-inventory.mjs';
const INVENTORY = 'docs/UX-PRO-00-INVENTARIO-ROTAS-2026-10-10.csv';
const MATRIX = 'docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-10.csv';

async function pageEntries() {
  const appRoot = path.join(root, 'src', 'app');
  const found = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (/[\\/]page\.(?:tsx|jsx|ts|js)$/.test(absolute)) found.push(absolute);
    }
  }
  await walk(appRoot);
  return found;
}

/** Lê um CSV simples com campos sempre entre aspas duplas, como o gerador escreve. */
function parseCsv(source) {
  const lines = source.split('\n').filter((line) => line.trim().length > 0);
  const split = (line) => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((match) => match[1].replaceAll('""', '"'));
  const columns = split(lines[0]);
  return lines.slice(1).map((line) => Object.fromEntries(split(line).map((value, index) => [columns[index], value])));
}

function runGenerator(args) {
  return execFileSync(process.execPath, [GENERATOR, ...args], { cwd: root, encoding: 'utf8' });
}

function summaryFrom(stdout) {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  return JSON.parse(stdout.slice(start, end + 1));
}

test('o gerador confirma que os CSVs versionados correspondem ao código atual', () => {
  const stdout = runGenerator(['--check']);
  assert.match(stdout, /^OK: /m, 'os CSVs precisam ser regenerados antes de versionar');
});

test('o inventário vigente conta exatamente as entradas de rota que existem em src/app', async () => {
  const summary = summaryFrom(runGenerator(['--check']));
  const entries = await pageEntries();
  assert.equal(summary.entradasDeRota, entries.length, 'cada arquivo page.* conta como uma entrada');
  assert.equal(summary.rotasDistintas, summary.entradasDeRota, 'nenhuma rota pode ser contada duas vezes');

  const inventory = parseCsv(await readFile(path.join(root, INVENTORY), 'utf8'));
  assert.equal(inventory.length, entries.length);
  assert.equal(new Set(inventory.map((row) => row.rota)).size, entries.length, 'rotas duplicadas no inventário');
  for (const row of inventory) {
    assert.ok(row.rota.startsWith('/'), `rota precisa começar com barra: ${row.rota}`);
    assert.ok(row.area.length > 0, `rota sem área: ${row.rota}`);
    assert.ok(row.arquivo_entrada.startsWith('src/app/'), `entrada fora de src/app: ${row.arquivo_entrada}`);
    assert.ok(row.layout.startsWith('src/app/'), `layout não resolvido para ${row.rota}`);
  }
});

test('a diferença 98 → 100 fica explicada por rotas nomeadas, sem reescrever os históricos', async () => {
  const summary = summaryFrom(runGenerator(['--check']));
  const byId = Object.fromEntries(summary.reconciliacao.map((entry) => [entry.inventario, entry]));

  for (const id of ['UX-00 05/10/2026', 'FECH-12 07/10/2026']) {
    assert.equal(byId[id].rotasDistintasRegistradas, 98, `${id} registra 98 rotas`);
    assert.deepEqual(byId[id].adicionadasDesde, ['/admin/aparencia', '/layout-preview']);
    assert.deepEqual(byId[id].removidasDesde, []);
  }

  const auditoria = byId['Auditoria 08/10/2026'];
  assert.equal(auditoria.rotasDistintasRegistradas, 100);
  assert.deepEqual(auditoria.adicionadasDesde, []);
  assert.deepEqual(auditoria.removidasDesde, []);
  assert.equal(auditoria.linhasSemBarraInicial, 100, 'o CSV de 08/10 grava a rota sem barra inicial');
  assert.equal(auditoria.raizGravadaComoArquivo, 1, 'o CSV de 08/10 grava a raiz como page.tsx');

  for (const historical of summary.reconciliacao) {
    const file = await readFile(path.join(root, historical.arquivo), 'utf8');
    assert.ok(file.length > 0, `histórico preservado: ${historical.arquivo}`);
  }
});

test('a matriz cobre todas as rotas e nunca inventa validação manual nem aceite humano', async () => {
  const matrix = parseCsv(await readFile(path.join(root, MATRIX), 'utf8'));
  const inventory = parseCsv(await readFile(path.join(root, INVENTORY), 'utf8'));
  assert.deepEqual(
    matrix.map((row) => row.rota),
    inventory.map((row) => row.rota),
    'matriz e inventário precisam listar as mesmas rotas na mesma ordem',
  );

  const allowedClasses = new Set(['codigo', 'teste automatizado de jornada', 'captura visual']);
  for (const row of matrix) {
    assert.ok(allowedClasses.has(row.classe_evidencia), `classe inesperada em ${row.rota}: ${row.classe_evidencia}`);
    assert.match(row.evidencia, /teste automatizado de compilacao\/unidade \(baseline\): /);
    assert.match(row.evidencia, /validacao manual: nao_registrado/);
    assert.match(row.evidencia, /aceite humano: nao_registrado/);
    assert.ok(row.lacuna.length > 0, `rota sem lacuna declarada: ${row.rota}`);
  }

  // Captura visual só pode vir de um resumo.json que já existe no repositório.
  for (const row of matrix.filter((entry) => entry.classe_evidencia === 'captura visual')) {
    const stage = row.evidencia.match(/captura visual: ([^ ]+) @/)[1];
    const directories = await readdir(path.join(root, 'docs'));
    assert.ok(
      directories.some((name) => name.startsWith(`${stage}-evidencias`)),
      `captura declarada sem pasta de evidências: ${stage}`,
    );
  }
});
