import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// E18 — guarda do inventário ACIONÁVEL de contraste. O gate 10B congelava os
// TOTAIS; esta guarda exige que as AMOSTRAS existam, que reproduzam o baseline
// exatamente e que as causas estejam classificadas. Impede que alguém "resolva"
// o E18 apagando números, zerando baseline ou inventando aceite humano.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFile(path.join(root, file), 'utf8');

const SAMPLES = 'docs/UX-PRO-10B-CONTRASTE-AMOSTRAS-2026-10-27.json';
const INVENTORY = 'docs/UX-PRO-10B-CONTRASTE-INVENTARIO-2026-10-27.json';
const CSV = 'docs/UX-PRO-10B-CONTRASTE-INVENTARIO-2026-10-27.csv';
const REPORT = 'docs/E18-CONTRASTE-INVENTARIO-2026-10-27.md';
const SCRIPT = 'scripts/ux-pro-10b-contrast-inventory.mjs';
const WORKFLOW = '.github/workflows/ux-layout-previews-a11y-delivery.yml';
// Retrato DEPOIS da Opção A: 708 -> 0. Indeterminadas e não medidos seguem.
const BASELINE_TOTALS = { samples: 2560, under45: 0, indeterminate: 196, unmeasured: 108 };

test('E18: o helper PU4 classifica indeterminadas e registra textos não medidos', async () => {
  const helper = await read('scripts/ux-evidence-text-contrast.mjs');
  assert.match(helper, /unmeasuredSamples/, 'o helper precisa devolver os textos não medidos, não só a contagem');
  assert.match(helper, /'complex_background'/, 'o helper precisa separar fundo complexo');
  assert.match(helper, /'no_opaque_background'/, 'o helper precisa separar fundo sem cor opaca');
  assert.match(helper, /invalid_foreground/, 'o helper precisa separar cor de texto inválida');
  assert.match(helper, /reason: 'no_client_rect'/, 'o helper precisa explicar por que não mediu');
  // Compatibilidade: os campos antigos seguem presentes (o baseline 10B depende).
  for (const field of ['renderedTextNodeCount', 'unmeasuredVisibleTextCount', 'sampleCount',
    'resolvedCount', 'indeterminateCount', 'under45', 'samples']) {
    assert.ok(helper.includes(field), `campo legado removido do helper: ${field}`);
  }
});

test('E18: o gate 10B escreve as amostras brutas sem tocar no baseline', async () => {
  const gate = await read('tests/ux-public-routes.integration.test.mjs');
  assert.match(gate, /PREVIEW_SAMPLES_EVIDENCE/, 'o gate precisa ter um arquivo de amostras separado');
  assert.match(gate, /measureContrast\(page,\s*`\$\{route\}\|\$\{scheme\}\|main`\)/,
    'o gate precisa amostrar as 11 rotas × 2 esquemas');
  assert.match(gate, /PREVIEW_SAMPLES\[sampleKey\]/, 'o gate precisa acumular as amostras por cenário');
  assert.match(gate, /unmeasuredSamples: result\.unmeasuredSamples/,
    'o gate precisa salvar os textos não medidos');
  assert.match(gate, /ux-pro-10b-contraste-amostras/, 'o artefato precisa ter stage identificável');
  // O arquivo de baseline é escrito separadamente e NÃO ganha novos campos.
  assert.match(gate, /JSON\.stringify\(\{ \.\.\.PREVIEW_MEDICOES, rotas: ordered \}/,
    'o JSON de baseline precisa continuar com a mesma forma');
});

test('E18: as amostras reproduzem exatamente o baseline congelado', async () => {
  const samples = JSON.parse(await read(SAMPLES));
  const inventory = JSON.parse(await read(INVENTORY));
  assert.equal(samples.stage, 'ux-pro-10b-contraste-amostras');
  assert.equal(inventory.stage, 'e18-inventario-contraste');
  assert.equal(inventory.baseline.validacaoCruzada, 'identica');
  assert.deepEqual(inventory.baseline.totais, BASELINE_TOTALS,
    'o baseline congelado não pode mudar sem uma nova fatia com relatório');
  assert.deepEqual(inventory.totais.baseline, BASELINE_TOTALS,
    'as amostras dos cenários principais precisam fechar com o baseline');
  assert.equal(inventory.escopo.cenariosBaseline, 22, '11 rotas × 2 esquemas');
  assert.equal(inventory.escopo.cenariosComplementares, 2, 'Layout 09 com zoom 200% em light/dark');
  assert.equal(inventory.escopo.cenarios, 24);
  // Os cenários complementares NÃO podem ser somados ao baseline por acidente.
  assert.equal(inventory.totais.complementar.samples, 190);
  assert.equal(inventory.totais.complementar.indeterminate, 40);
  assert.equal(inventory.totais.complementar.under45, 0);
  assert.notDeepEqual(inventory.totais.complementar, BASELINE_TOTALS);
});

test('E18: a correção zerou os pares e as duas causas fora de escopo permanecem', async () => {
  const inventory = JSON.parse(await read(INVENTORY));
  const { causas } = inventory;
  // Depois da Opção A não há mais par foreground/background abaixo de 4.5:1.
  assert.equal(causas.abaixo45.paresDeCorDistintos, 0,
    'a correção precisa ter eliminado todos os pares abaixo de 4.5:1');
  assert.deepEqual(causas.abaixo45.pares, []);
  // O que sobrou NÃO pode ser apagado nem reclassificado como aprovação.
  assert.equal(causas.indeterminadas.complex_background, 196,
    'as indeterminadas precisam continuar explicadas por fundo complexo');
  assert.equal(Object.keys(causas.indeterminadas).length, 1);
  assert.equal(causas.naoMedidos.option, 108,
    'os textos não medidos precisam continuar identificados como <option> de <select>');
  assert.equal(Object.keys(causas.naoMedidos).length, 1);
  assert.equal(Object.values(inventory.rotas).reduce((n, r) => n + r.under45, 0), 0);
  assert.equal(Object.values(inventory.rotas).reduce((n, r) => n + r.indeterminadas, 0), 196);
  assert.equal(Object.values(inventory.rotas).reduce((n, r) => n + r.naoMedidos, 0), 108);
  // O baseline histórico (708) precisa estar preservado para auditoria.
  const historico = JSON.parse(await read('docs/e18-paletas-2026-10-27/amostras-baseline-708.json'));
  let antes = 0;
  for (const [k, c] of Object.entries(historico.cenarios)) if (k.endsWith('|main')) antes += c.under45.length;
  assert.equal(antes, 708, 'o baseline de 708 precisa continuar disponível');
});

test('E18: CSV cobre as três classes e o relatório declara a pendência', async () => {
  const csv = await read(CSV);
  const lines = csv.trim().split('\n');
  assert.ok(lines.length > 100, `CSV raso: ${lines.length} linhas`);
  // Com 0 sinais, a classe abaixo_45 desaparece — as outras duas permanecem.
  assert.ok(!csv.includes('"abaixo_45"'), 'nenhum sinal abaixo de 4.5:1 pode restar no CSV');
  for (const classe of ['indeterminada', 'nao_medido']) {
    assert.ok(csv.includes(`"${classe}"`), `CSV precisa da classe ${classe}`);
  }
  assert.match(csv, /"complex_background"/, 'CSV precisa do motivo das indeterminadas');
  assert.match(csv, /"no_client_rect"/, 'CSV precisa do motivo dos não medidos');
  // Seletores normalizados continuam presentes nas classes restantes.
  const report = await read(REPORT);
  const inventory = JSON.parse(await read(INVENTORY));
  for (const expected of ['708', '196', '108', '0 sinais', 'Opção A',
    'complex_background', '<option>', 'NENHUM CSS', 'NO-GO', 'decisão do proprietário']) {
    assert.ok(report.includes(expected), `relatório precisa citar ${expected}`);
  }
  assert.match(report, /917236ad/, 'relatório precisa citar o SHA do baseline intacto');
  assert.doesNotMatch(report, /aceite humano (?:realizado|concluído|aprovado)/i,
    'nunca inventar aceite humano');
});

test('E18: o gerador roda com --check no CI e a guarda no test:unit', async () => {
  const workflow = await read(WORKFLOW);
  assert.match(workflow, /ux-pro-10b-contrast-inventory\.mjs --check/,
    'o workflow precisa validar que o inventário está regenerado');
  assert.match(workflow, /tests\/ux-pro-10b-contrast-inventory\.test\.mjs/,
    'o workflow precisa rodar esta guarda');
  assert.match(workflow, /docs\/UX-PRO-10B-CONTRASTE-AMOSTRAS-2026-10-27\.json/,
    'o workflow precisa reagir a mudanças nas amostras');
  const pkg = JSON.parse(await read('package.json'));
  assert.match(pkg.scripts['test:unit'], /tests\/ux-pro-10b-contrast-inventory\.test\.mjs/,
    'a guarda precisa fazer parte da suíte local/CI');
  const script = await read(SCRIPT);
  assert.match(script, /E18_INVENTORY_MISMATCH/, 'o gerador precisa recusar divergência com o baseline');
  assert.match(script, /process\.argv\.includes\('--check'\)/, 'o gerador precisa ter modo --check');
});
