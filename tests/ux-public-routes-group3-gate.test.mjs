import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// E6 / UX-PRO-06 — guarda estática do grupo 3 (raiz, prévias e índice QA).
// Congela: o workflow com filtros precisos nas 13 rotas restantes, o ajuste do
// gerador que reconhece src/app/page.tsx como gate de "/", a matriz com ZERO
// lacunas de gate, os seis cenários de navegador e o fail-closed de /qa/modulos.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(root, file), 'utf8');

const WORKFLOW = '.github/workflows/ux-public-routes-group3-delivery.yml';
const MATRIX = 'docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv';
const ROUTES = [
  '/',
  '/layout-01', '/layout-02', '/layout-03', '/layout-04', '/layout-05',
  '/layout-06', '/layout-07', '/layout-08', '/layout-09', '/layout-10',
  '/layout-preview', '/qa/modulos',
];

function parseCsv(source) {
  const lines = source.split('\n').filter(line => line.trim().length > 0);
  const split = line => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map(match => match[1].replaceAll('""', '"'));
  const columns = split(lines[0]);
  return lines.slice(1).map(line => Object.fromEntries(split(line).map((value, index) => [columns[index], value])));
}

test('E6 grupo 3: o workflow usa paths precisos nas treze rotas restantes', async () => {
  const workflow = await read(WORKFLOW);
  const prefixes = [
    'src/app/page.tsx',
    ...Array.from({ length: 10 }, (_, index) => `src/app/layout-${String(index + 1).padStart(2, '0')}/**`),
    'src/app/layout-preview/**',
    'src/app/qa/modulos/**',
  ];
  assert.equal(prefixes.length, 13);
  for (const prefix of prefixes) {
    assert.ok(workflow.includes(prefix), `o workflow precisa filtrar ${prefix}`);
  }
  assert.doesNotMatch(workflow, /-\s*'src\/\*\*'/, 'filtro amplo viraria baseline e não provaria a rota');
  assert.match(workflow, /qa-ux-public-routes-postgres\.mjs/, 'o workflow precisa executar o gate');
  assert.match(workflow, /ux-public-routes-group3-gate\.test\.mjs/, 'o workflow precisa executar esta guarda');
  assert.match(workflow, /UX_PUBLIC_TEST_PATTERN: 'E6 grupo 3'/, 'o workflow precisa isolar os seus cenários');
  assert.match(workflow, /ux-pro-00-inventory\.mjs --check/, 'o workflow precisa validar a matriz');
  assert.match(workflow, /--audit-level=moderate/, 'o workflow precisa manter o bloqueio de auditoria');
});

test('E6 grupo 3: o gerador reconhece o arquivo da raiz como gate preciso', async () => {
  const generator = await read('scripts/ux-pro-00-inventory.mjs');
  assert.ok(generator.includes('page\\.(?:tsx|jsx|ts|js)'),
    'o gerador precisa detectar src/app/page.tsx');
  assert.match(generator, /prefixes\.add\('\/'\)/,
    'o gerador precisa registrar o prefixo "/" como gate de jornada da raiz');
  assert.match(generator, /gate\.broad/, 'filtros amplos precisam continuar separados como baseline');
  const inventoryTest = await read('tests/ux-pro-00-inventory.test.mjs');
  assert.match(inventoryTest, /CURRENT_INVENTORY/,
    'a guarda da raiz precisa ler o inventário vigente, não o histórico de 10/10');
});

test('E6 grupo 3: a matriz fecha TODAS as lacunas de gate sem inventar aceite', async () => {
  const rows = parseCsv(await read(MATRIX));
  const byRoute = new Map(rows.map(row => [row.rota, row]));
  for (const route of ROUTES) {
    const row = byRoute.get(route);
    assert.ok(row, `rota ${route} ausente da matriz`);
    assert.doesNotMatch(row.lacuna, /sem gate automatizado que alcance a rota/,
      `${route} continua sem gate automatizado`);
    assert.match(row.evidencia, /teste automatizado de jornada/, `${route} precisa registrar a evidência do gate`);
    assert.match(row.evidencia, /ux-public-routes-group3-delivery\.yml/, `${route} precisa citar o workflow`);
    assert.match(row.evidencia, /validacao manual: nao_registrado/, `${route} não pode inventar validação manual`);
    assert.match(row.evidencia, /aceite humano: nao_registrado/, `${route} não pode inventar aceite humano`);
  }
  const stillMissing = rows.filter(row => /sem gate automatizado/.test(row.lacuna)).map(row => row.rota);
  assert.equal(stillMissing.length, 0,
    `o grupo 3 deve zerar as lacunas de gate; restaram: ${stillMissing.join(', ')}`);
  // Zerar a lacuna NÃO é sinônimo de aprovar: toda rota segue sem aceite humano.
  assert.equal(rows.filter(row => /aceite humano: nao_registrado/.test(row.evidencia)).length, rows.length,
    'aceite humano não pode ser inferido em nenhuma rota');
});

test('E6 grupo 3: o gate cobre doze prévias, quatro larguras e o fail-closed do índice QA', async () => {
  const gate = await read('tests/ux-public-routes.integration.test.mjs');
  assert.equal((gate.match(/test\('(?:http|browser) E6 grupo 3:/g) || []).length, 6,
    'o grupo 3 precisa ter exatamente seis cenários');
  for (const fragment of ['/layout-01', '/layout-09', '/layout-10', '/layout-preview', '/qa/modulos', '/api/site-visual']) {
    assert.ok(gate.includes(fragment), `o gate precisa citar ${fragment}`);
  }
  for (const width of [320, 390, 768, 1440]) {
    assert.ok(gate.includes(String(width)), `o gate precisa medir ${width}px`);
  }
  assert.match(gate, /noindex/, 'o gate precisa verificar que a prévia não é indexada');
  assert.match(gate, /site-preview-notice/, 'o gate precisa verificar o aviso declarativo de prévia');
  assert.match(gate, /não foi reconhecido/i, 'o gate precisa provar o fallback honesto de /layout-preview');
  assert.match(gate, /Roteiro de homologação local/, 'o 404 de /qa/modulos não pode vazar o índice interno');
  assert.match(gate, /keyboard\.press\('Tab'\)/, 'o gate precisa percorrer as prévias por teclado');
  assert.match(gate, /Abrir módulo de aparência do site/, 'o atalho público D7 precisa ser preservado');
  assert.match(gate, /scrollWidth/, 'o gate precisa medir transbordo horizontal');

  const runner = await read('scripts/qa-ux-public-routes-postgres.mjs');
  assert.match(runner, /tests\/ux-public-routes\.integration\.test\.mjs/);
  assert.match(runner, /RUN_DATABASE_INTEGRATION: '1'/);
  assert.match(runner, /AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22\.x'/);
});

test('E6 grupo 3: a guarda roda no test:unit', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.match(pkg.scripts['test:unit'], /tests\/ux-public-routes-group3-gate\.test\.mjs/,
    'a guarda precisa fazer parte da suíte local/CI');
});
