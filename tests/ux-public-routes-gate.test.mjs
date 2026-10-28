import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// E6 / UX-PRO-06 — guarda estática do grupo 1 de rotas públicas.
// Amarra quatro coisas que antes viviam soltas: o workflow com filtros
// precisos, a matriz de cobertura regenerada, o gate de navegador e a correção
// do parâmetro codificado. Se qualquer um deles regredir, o CI falha.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(root, file), 'utf8');

const WORKFLOW = '.github/workflows/ux-public-routes-delivery.yml';
const MATRIX = 'docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv';
const ROUTES = [
  '/servicos', '/servicos/[id]',
  '/segmentos', '/segmentos/[key]',
  '/conteudos', '/conteudos/[slug]',
  '/faq',
];

function parseCsv(source) {
  const lines = source.split('\n').filter(line => line.trim().length > 0);
  const split = line => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map(match => match[1].replaceAll('""', '"'));
  const columns = split(lines[0]);
  return lines.slice(1).map(line => Object.fromEntries(split(line).map((value, index) => [columns[index], value])));
}

test('E6: o workflow de jornada usa paths precisos nos quatro diretórios públicos', async () => {
  const workflow = await read(WORKFLOW);
  for (const prefix of ['src/app/servicos/**', 'src/app/segmentos/**', 'src/app/conteudos/**', 'src/app/faq/**']) {
    assert.ok(workflow.includes(prefix), `o workflow precisa filtrar ${prefix}`);
  }
  assert.doesNotMatch(workflow, /-\s*'src\/\*\*'/, 'filtro amplo viraria baseline e não provaria a rota');
  assert.match(workflow, /qa-ux-public-routes-postgres\.mjs/, 'o workflow precisa executar o gate');
  assert.match(workflow, /ux-public-routes-gate\.test\.mjs/, 'o workflow precisa executar esta guarda');
  assert.match(workflow, /--audit-level=moderate/, 'o workflow precisa manter o bloqueio de auditoria');
  assert.match(workflow, /UX_PUBLIC_TEST_PATTERN: 'E6 grupo 1'/,
    'o workflow precisa isolar os seus seis cenários dos cenários do grupo 2');
});

test('E6: a matriz de cobertura registra gate automatizado nas sete rotas do grupo', async () => {
  const rows = parseCsv(await read(MATRIX));
  const byRoute = new Map(rows.map(row => [row.rota, row]));
  for (const route of ROUTES) {
    const row = byRoute.get(route);
    assert.ok(row, `rota ${route} ausente da matriz`);
    assert.doesNotMatch(row.lacuna, /sem gate automatizado que alcance a rota/,
      `${route} continua sem gate automatizado`);
    assert.match(row.evidencia, /teste automatizado de jornada/, `${route} precisa registrar a evidência do gate`);
    assert.match(row.evidencia, /ux-public-routes-delivery\.yml/, `${route} precisa citar o workflow`);
  }
  const stillMissing = rows.filter(row => /sem gate automatizado/.test(row.lacuna)).map(row => row.rota);
  // 18 era o saldo após o grupo 1; o grupo 2 (conversão) cobriu mais cinco
  // rotas e baixou o saldo global para 13. A asserção acompanha o estado atual.
  assert.equal(stillMissing.length, 0,
    `as lacunas globais devem estar zeradas (25 → 18 → 13 → 0); restaram: ${stillMissing.join(', ')}`);
});

test('E6: o gate de navegador cobre as sete rotas, quatro larguras e estados honestos', async () => {
  const gate = await read('tests/ux-public-routes.integration.test.mjs');
  for (const fragment of ['/servicos', '/segmentos', '/conteudos', '/faq', 'nao-existe-qa']) {
    assert.ok(gate.includes(fragment), `o gate precisa citar ${fragment}`);
  }
  for (const width of [320, 390, 768, 1440]) {
    assert.ok(gate.includes(String(width)), `o gate precisa medir ${width}px`);
  }
  assert.match(gate, /noindex/, 'o gate precisa verificar o noindex de prévia');
  assert.match(gate, /role="alert"/, 'o gate precisa distinguir falha de leitura');
  assert.match(gate, /Não há publicações disponíveis no momento/, 'o gate precisa verificar o estado vazio');
  assert.match(gate, /decodeURIComponent\(href/, 'o gate precisa seguir os links reais de serviço');
  const runner = await read('scripts/qa-ux-public-routes-postgres.mjs');
  assert.match(runner, /tests\/ux-public-routes\.integration\.test\.mjs/);
  assert.match(runner, /RUN_DATABASE_INTEGRATION: '1'/);
  assert.match(runner, /AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22\.x'/);
});

test('E6: o detalhe de serviço normaliza o parâmetro codificado do Next 16', async () => {
  const page = await read('src/app/servicos/[id]/page.tsx');
  assert.match(page, /function decodeParam\(value: string\)/);
  assert.match(page, /decodeURIComponent\(value\)/);
  assert.equal((page.match(/findService\(decodeParam\(id\)\)/g) || []).length, 2,
    'generateMetadata e o componente da página precisam usar o mesmo parâmetro normalizado');
  assert.match(page, /Voltar aos serviços/, 'o caminho honesto de "não encontrado" precisa ser preservado');
});
