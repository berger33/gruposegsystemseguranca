import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// UX-PRO-10B / 10C + 09E-8 — guarda das medições em navegador real das rotas
// DIRETAS das prévias. Congela o workflow, os cinco cenários e a evidência.
// ATUALIZADO em 27/10 após a decisão do proprietário pela OPÇÃO A: o baseline
// de 708 sinais abaixo de 4.5:1 foi CORRIGIDO (medição real: 0). O retrato
// congelado agora exige zero e bloqueia qualquer regressão. As 196
// indeterminadas e os 108 textos não medidos seguem fora deste escopo.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(root, file), 'utf8');

const WORKFLOW = '.github/workflows/ux-layout-previews-a11y-delivery.yml';
const EVIDENCE = 'docs/UX-PRO-10B-PREVIAS-MEDICOES-2026-10-27.json';
const REPORT = 'docs/UX-PRO-10B-PREVIAS-RESULTADO-2026-10-27.md';

const ROUTES = [
  '/layout-01', '/layout-02', '/layout-03', '/layout-04', '/layout-05',
  '/layout-06', '/layout-07', '/layout-08', '/layout-09', '/layout-10',
  '/layout-preview',
];

// Medido em 27/10/2026 em PostgreSQL 17 descartável + Chromium real, com o
// helper PU4 `measureTextContrast`, DEPOIS de aplicar a Opção A (ajuste
// mínimo AA). Antes da correção havia 708 sinais (baseline preservado em
// docs/e18-paletas-2026-10-27/amostras-baseline-708.json). Qualquer sinal
// novo abaixo de 4.5:1 é REGRESSÃO e derruba esta guarda.
const BASELINE_UNDER_45 = Object.fromEntries([
  '/layout-01', '/layout-02', '/layout-03', '/layout-04', '/layout-05',
  '/layout-06', '/layout-07', '/layout-08', '/layout-09', '/layout-10',
  '/layout-preview',
].map(route => [route, 0]));
const TOTALS = { samples: 2560, under45: 0, indeterminate: 196, unmeasured: 108 };

test('10B: o workflow mede teclado, zoom, cor e contraste nas rotas diretas', async () => {
  const workflow = await read(WORKFLOW);
  for (const prefix of [
    'src/app/layout-01/**', 'src/app/layout-09/**', 'src/app/layout-10/**',
    'src/app/layout-preview/**', 'public/visuals/layout-01/**',
    'scripts/ux-evidence-text-contrast.mjs',
    'docs/UX-PRO-10B-PREVIAS-MEDICOES-2026-10-27.json',
  ]) {
    assert.ok(workflow.includes(prefix), `o workflow precisa filtrar ${prefix}`);
  }
  assert.doesNotMatch(workflow, /-\s*'src\/\*\*'/, 'filtro amplo viraria baseline');
  assert.match(workflow, /UX_PUBLIC_TEST_PATTERN: 'UX-PRO-10B previas'/,
    'o workflow precisa isolar os cinco cenários da fatia');
  assert.match(workflow, /qa-ux-public-routes-postgres\.mjs/, 'o workflow precisa executar o gate');
  assert.match(workflow, /ux-pro-10b-previas-medicoes\.test\.mjs/, 'o workflow precisa executar esta guarda');
  assert.match(workflow, /Baseline de contraste nao pode regredir/,
    'a guarda de baseline precisa rodar DEPOIS do gate, sobre o JSON recém-escrito');
  assert.match(workflow, /--audit-level=moderate/, 'o workflow precisa manter o bloqueio de auditoria');
});

test('10B: os cinco cenários usam navegador real, helper PU4 e dois esquemas de cor', async () => {
  const gate = await read('tests/ux-public-routes.integration.test.mjs');
  assert.equal((gate.match(/test\('(?:http|browser) UX-PRO-10B previas:/g) || []).length, 5,
    'a fatia precisa ter exatamente cinco cenários');
  assert.match(gate, /measureTextContrast/, 'o gate precisa reutilizar a medição de contraste do PU4');
  assert.match(gate, /colorScheme/, 'o gate precisa variar prefers-color-scheme');
  assert.match(gate, /style\.zoom = '2'/, 'o gate precisa medir zoom 200%');
  assert.match(gate, /keyboard\.press\('Shift\+Tab'\)/, 'o gate precisa provar que o iframe não prende o foco');
  assert.match(gate, /iframe\[title\]/, 'o gate precisa verificar o título do iframe');
  assert.match(gate, /:focus-visible/, 'o gate precisa medir foco visível de verdade');
  assert.match(gate, /PREVIEW_DIRECT_ROUTES/, 'o gate precisa abrir as rotas diretas, não só /layout-preview');
  for (const route of ['/layout-02', '/layout-09', '/layout-10', '/layout-preview']) {
    assert.ok(gate.includes(route) || gate.includes('PREVIEW_ALL_ROUTES'), `o gate precisa citar ${route}`);
  }
});

test('10B: a evidência cobre 11 rotas × 2 esquemas sem transformar ausência em aprovação', async () => {
  const data = JSON.parse(await read(EVIDENCE));
  assert.equal(data.stage, 'ux-pro-10b-previas');
  assert.equal(data.data, '2026-10-27');
  assert.equal(Object.keys(data.rotas).length, ROUTES.length);
  for (const route of ROUTES) {
    const row = data.rotas[route];
    assert.ok(row, `rota ${route} ausente da evidência`);
    assert.equal(row.zoom200.overflow, 0, `${route}: zoom 200% precisa seguir sem transbordo`);
    if (route !== '/layout-preview') {
      assert.ok(row.teclado?.primeiroFocoVisivel?.visible,
        `${route}: precisa de foco visível por teclado`);
    }
    for (const scheme of ['light', 'dark']) {
      const contrast = row.contraste[scheme];
      assert.equal(contrast.status, 'measured', `${route} (${scheme}): precisa medir, não declarar sem prova`);
      assert.ok(contrast.sampleCount > 0, `${route} (${scheme}): precisa de amostras`);
      assert.equal(contrast.resolvedCount + contrast.indeterminateCount, contrast.sampleCount,
        `${route} (${scheme}): indeterminadas precisam continuar contabilizadas`);
      // 09E-8: "não medida" é estado explícito. Se o helper parar de medir,
      // status vira not-measured e a asserção acima já falha.
      assert.ok(Number.isInteger(contrast.unmeasuredVisibleTextCount),
        `${route} (${scheme}): textos visíveis não medidos precisam ser registrados`);
    }
    assert.equal(typeof row.paleta.diferente, 'boolean',
      `${route}: a diferença de paleta claro/escuro precisa ter sido MEDIDA`);
  }
  assert.ok(data.iframe?.title && data.iframe.passosAteFoco > 0 && data.iframe.shiftTabSaiu,
    'o iframe do Layout 01 precisa ter título, foco e saída por Shift+Tab');
  for (const limite of ['leitor de tela nao executado', 'revisao manual de tema/contraste nao executada',
    'WCAG integral nao verificado', 'aceite humano/UAT/Windows nao executado', 'producao segue NO-GO']) {
    assert.ok(data.limites.includes(limite), `limite precisa continuar declarado: ${limite}`);
  }
});

test('10B: a correção Opção A zerou os sinais e bloqueia regressão', async () => {
  const data = JSON.parse(await read(EVIDENCE));
  let samples = 0; let under45 = 0; let indeterminate = 0; let unmeasured = 0;
  for (const route of ROUTES) {
    const row = data.rotas[route];
    for (const scheme of ['light', 'dark']) {
      const contrast = row.contraste[scheme];
      samples += contrast.sampleCount;
      under45 += contrast.under45Count;
      indeterminate += contrast.indeterminateCount;
      unmeasured += contrast.unmeasuredVisibleTextCount;
      assert.ok(contrast.under45Count <= BASELINE_UNDER_45[route],
        `${route} (${scheme}): contraste piorou de ${BASELINE_UNDER_45[route]} para ${contrast.under45Count} sinais abaixo de 4.5:1`);
    }
  }
  // Congela o retrato CORRIGIDO. Qualquer sinal novo exige nova fatia.
  assert.deepEqual({ samples, under45, indeterminate, unmeasured }, TOTALS,
    'o retrato de contraste mudou; é preciso uma nova fatia com relatório antes de atualizar o baseline');
  assert.equal(under45, 0, 'a correção Opção A precisa ter zerado os sinais abaixo de 4.5:1');
  assert.equal(indeterminate, 196, 'as indeterminadas (fundo complexo) seguem fora do escopo');
  assert.equal(unmeasured, 108, 'os <option> sem clientRect seguem fora do escopo');
  const report = await read(REPORT);
  assert.match(report, /708/, 'o relatório precisa registrar o baseline histórico de 708');
  assert.match(report, /Opção A|OPCAO A/i, 'o relatório precisa citar a decisão do proprietário');
  assert.match(report, /corrigid|zerou|0 sinais/i, 'o relatório precisa registrar a correção');
});

test('10B: a guarda roda no test:unit e a matriz cita o segundo gate', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.match(pkg.scripts['test:unit'], /tests\/ux-pro-10b-previas-medicoes\.test\.mjs/,
    'a guarda precisa fazer parte da suíte local/CI');
  const matrix = await read('docs/UX-PRO-00-MATRIZ-COBERTURA-2026-10-13.csv');
  for (const route of ['/layout-01', '/layout-09', '/layout-preview']) {
    const line = matrix.split('\n').find(entry => entry.startsWith(`"${route}"`));
    assert.ok(line, `rota ${route} ausente da matriz`);
    assert.match(line, /ux-layout-previews-a11y-delivery\.yml/,
      `${route} precisa citar o workflow de teclado/zoom/cor`);
    assert.match(line, /aceite humano: nao_registrado/,
      `${route} não pode inventar aceite humano por causa desta medição`);
  }
});
