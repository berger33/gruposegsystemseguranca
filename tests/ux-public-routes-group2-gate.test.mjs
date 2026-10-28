import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// E6 / UX-PRO-06 — guarda estática do grupo 2 (rotas de conversão).
// Congela quatro coisas: o workflow com filtros precisos, a matriz de
// cobertura regenerada (18 → 13 lacunas), os sete cenários de navegador e as
// duas correções de acessibilidade encontradas pelo gate. Se qualquer uma
// regredir, o CI falha antes de abrir a PR.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(root, file), 'utf8');

const WORKFLOW = '.github/workflows/ux-public-routes-group2-delivery.yml';
const MATRIX = 'docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv';
const ROUTES = [
  '/orcamento',
  '/simulador',
  '/pacotes',
  '/privacidade',
  '/proposta/aceite/[token]',
];

function parseCsv(source) {
  const lines = source.split('\n').filter(line => line.trim().length > 0);
  const split = line => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map(match => match[1].replaceAll('""', '"'));
  const columns = split(lines[0]);
  return lines.slice(1).map(line => Object.fromEntries(split(line).map((value, index) => [columns[index], value])));
}

test('E6 grupo 2: o workflow de conversão usa paths precisos nas cinco rotas', async () => {
  const workflow = await read(WORKFLOW);
  for (const prefix of [
    'src/app/orcamento/**',
    'src/app/simulador/**',
    'src/app/pacotes/**',
    'src/app/privacidade/**',
    'src/app/proposta/aceite/**',
  ]) {
    assert.ok(workflow.includes(prefix), `o workflow precisa filtrar ${prefix}`);
  }
  assert.doesNotMatch(workflow, /-\s*'src\/\*\*'/, 'filtro amplo viraria baseline e não provaria a rota');
  assert.match(workflow, /qa-ux-public-routes-postgres\.mjs/, 'o workflow precisa executar o gate');
  assert.match(workflow, /ux-public-routes-group2-gate\.test\.mjs/, 'o workflow precisa executar esta guarda');
  assert.match(workflow, /UX_PUBLIC_TEST_PATTERN: 'E6 grupo 2'/, 'o workflow precisa selecionar apenas os cenários do grupo');
  assert.match(workflow, /ux-pro-00-inventory\.mjs --check/, 'o workflow precisa validar a matriz');
  assert.match(workflow, /--audit-level=moderate/, 'o workflow precisa manter o bloqueio de auditoria');
});

test('E6 grupo 2: a matriz registra gate nas cinco rotas e reduz as lacunas para 13', async () => {
  const rows = parseCsv(await read(MATRIX));
  const byRoute = new Map(rows.map(row => [row.rota, row]));
  for (const route of ROUTES) {
    const row = byRoute.get(route);
    assert.ok(row, `rota ${route} ausente da matriz`);
    assert.doesNotMatch(row.lacuna, /sem gate automatizado que alcance a rota/,
      `${route} continua sem gate automatizado`);
    assert.match(row.evidencia, /teste automatizado de jornada/, `${route} precisa registrar a evidência do gate`);
    assert.match(row.evidencia, /ux-public-routes-group2-delivery\.yml/, `${route} precisa citar o workflow`);
    assert.match(row.evidencia, /validacao manual: nao_registrado/, `${route} não pode inventar validação manual`);
    assert.match(row.evidencia, /aceite humano: nao_registrado/, `${route} não pode inventar aceite humano`);
  }
  const stillMissing = rows.filter(row => /sem gate automatizado/.test(row.lacuna)).map(row => row.rota);
  // 13 era o saldo após o grupo 2; o grupo 3 (raiz/prévias/QA) zerou as
  // lacunas de gate. A asserção acompanha o estado atual.
  assert.equal(stillMissing.length, 0,
    `as lacunas globais devem estar zeradas (25 → 18 → 13 → 0); restaram: ${stillMissing.join(', ')}`);
});

test('E6 grupo 2: o gate de navegador cobre cinco rotas, quatro larguras e estados reais', async () => {
  const gate = await read('tests/ux-public-routes.integration.test.mjs');
  assert.equal((gate.match(/test\('(?:http|browser) E6 grupo 2:/g) || []).length, 7,
    'o grupo 2 precisa ter exatamente sete cenários');
  for (const fragment of ['/orcamento', '/simulador', '/pacotes', '/privacidade', '/proposta/aceite/']) {
    assert.ok(gate.includes(fragment), `o gate precisa citar ${fragment}`);
  }
  for (const width of [320, 390, 768, 1440]) {
    assert.ok(gate.includes(String(width)), `o gate precisa medir ${width}px`);
  }
  assert.match(gate, /waitForLoadState\('networkidle'/, 'o gate precisa esperar a hidratação dos client components');
  assert.match(gate, /noindex/, 'o gate precisa verificar o noindex de prévia');
  assert.match(gate, /Prot[ôo]colo|protocolo/i, 'o gate precisa verificar o protocolo real do orçamento');
  assert.match(gate, /\/api\/leads/, 'o gate precisa falhar e registrar o POST real de orçamento');
  assert.match(gate, /aceite/i, 'o gate precisa cobrir o aceite de proposta');
  assert.match(gate, /Nenhum pre[cç]o|não exibe preços|R\$/, 'o simulador não pode exibir preço');
  assert.match(gate, /pacotes/i, 'o gate precisa distinguir vazio de falha em /pacotes');
  assert.match(gate, /minuta|privacidade/i, 'o gate precisa preservar a minuta de privacidade');

  const runner = await read('scripts/qa-ux-public-routes-postgres.mjs');
  assert.match(runner, /tests\/ux-public-routes\.integration\.test\.mjs/);
  assert.match(runner, /RUN_DATABASE_INTEGRATION: '1'/);
  assert.match(runner, /AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22\.x'/);
});

test('E6 grupo 2: /orcamento anuncia carregando, sucesso e erro com foco', async () => {
  const page = await read('src/app/orcamento/page.tsx');
  assert.match(page, /aria-busy=\{status\.type === "loading"\}/, 'o formulário precisa sinalizar envio em andamento');
  assert.match(page, /role="status"/, 'carregando e sucesso precisam ser anunciados');
  assert.match(page, /role="alert"/, 'a falha precisa ser anunciada');
  assert.match(page, /ref=\{errorRef\}/, 'a falha precisa ser focalizável');
  assert.match(page, /tabIndex=\{-1\}/, 'a falha precisa receber foco programático');
  assert.match(page, /errorRef\.current\?\.focus\(\)/, 'o foco precisa ser movido para a falha');
  assert.match(page, /status\.type === "error"\) errorRef/, 'o efeito precisa reagir ao erro');
  assert.match(page, /<form/, 'o formulário precisa ser preservado após a falha');
});

test('E6 grupo 2: o aceite de proposta anuncia carregando, erro e sucesso', async () => {
  const client = await read('src/app/proposta/aceite/[token]/AcceptanceClient.tsx');
  assert.match(client, /role="status"/, 'carregando e aceite registrado precisam ser anunciados');
  assert.match(client, /role="alert"/, 'token inválido/expirado precisa ser anunciado');
  assert.match(client, /ref=\{errorRef\}/, 'o erro precisa ser focalizável');
  assert.match(client, /errorRef\.current\?\.focus\(\)/, 'o foco precisa ser movido para o erro');
  assert.match(client, /Não foi possível carregar este aceite agora\./,
    'a mensagem honesta de falha técnica precisa ser preservada');
  assert.match(client, /Link não encontrado|expirado|inválido/i,
    'o estado de token inválido precisa continuar traduzido');
});

test('E6 grupo 2: a guarda roda no test:unit e não depende só do workflow', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.match(pkg.scripts['test:unit'], /tests\/ux-public-routes-group2-gate\.test\.mjs/,
    'a guarda precisa fazer parte da suíte local/CI');
});
