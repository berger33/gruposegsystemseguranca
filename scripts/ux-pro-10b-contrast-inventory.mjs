#!/usr/bin/env node
// E18 — inventário ACIONÁVEL do contraste das prévias 10B.
//
// O gate 10B já media 2.560 amostras e congelava os totais (708 < 4.5:1,
// 196 indeterminadas, 108 textos não medidos). Só que o JSON de evidência
// guardava CONTAGENS, não amostras: era impossível dizer qual cor ou qual
// seletor corrigir. Este script lê as amostras brutas escritas pelo gate em
// `docs/UX-PRO-10B-CONTRASTE-AMOSTRAS-2026-10-27.json` e produz:
//   - JSON com causas, pares de cor, motivos e sugestão técnica de contraste;
//   - CSV agrupado por rota/esquema/classe/par de cor/seletor;
//   - relatório Markdown para decisão do proprietário.
//
// NENHUM CSS, paleta ou token é alterado. A "sugestão" é apenas um cálculo de
// luminância: escurecer o foreground mantendo o fundo até 4.5:1. A decisão de
// design (e a revisão manual WCAG) continua com o proprietário.
//
// Uso: node scripts/ux-pro-10b-contrast-inventory.mjs [--check]
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SOURCE = 'docs/UX-PRO-10B-CONTRASTE-AMOSTRAS-2026-10-27.json';
const BASELINE = 'docs/UX-PRO-10B-PREVIAS-MEDICOES-2026-10-27.json';
const OUT_JSON = 'docs/UX-PRO-10B-CONTRASTE-INVENTARIO-2026-10-27.json';
const OUT_CSV = 'docs/UX-PRO-10B-CONTRASTE-INVENTARIO-2026-10-27.csv';
const OUT_MD = 'docs/E18-CONTRASTE-INVENTARIO-2026-10-27.md';
const CHECK = process.argv.includes('--check');

const read = async file => readFile(path.join(root, file), 'utf8');
const sha = text => createHash('sha256').update(text).digest('hex');

const lum = rgb => {
  const c = rgb.map(v => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return Math.round((h + 0.05) / (l + 0.05) * 100) / 100; };
const rgbOf = css => { const m = String(css).match(/[\d.]+/g); return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null; };
const cssRgb = rgb => `rgb(${rgb.map(Math.round).join(', ')})`;
// O helper PU4 compõe `rgba(fg, alpha)` sobre o fundo antes de calcular o
// ratio. Recalcular ignorando o alpha inverte o diagnóstico (ex.: rgba(182,
// 227, 255, 0.72) sobre rgb(22,79,216) parece 4.9:1, mas mede 3.3:1).
const effectiveForeground = (css, bg) => {
  const m = String(css).match(/[\d.]+/g);
  if (!m || m.length < 3 || !Array.isArray(bg)) return null;
  const rgb = m.slice(0, 3).map(Number);
  const alpha = m.length > 3 ? Number(m[3]) : 1;
  return { rgb: rgb.map((v, i) => v * alpha + bg[i] * (1 - alpha)), alpha };
};

// Escurece o foreground mantendo o fundo até atingir o alvo. Busca binária no
// fator de escala; quando nem preto puro alcança 4.5:1 o fundo é o problema.
function suggest(fg, bg, target = 4.5) {
  const current = ratio(fg, bg);
  if (current >= target) return { foreground: cssRgb(fg), ratio: current, fator: 1 };
  if (ratio([0, 0, 0], bg) < target) {
    return { foreground: null, ratio: null, fator: null, fundoInviavel: true };
  }
  let low = 0; let high = 1;
  // A busca usa o MESMO foreground que será exibido (já arredondado para
  // inteiros em cssRgb). Se usasse o float cru, a sugestão impressa poderia
  // cair para 4.49:1 — abaixo do alvo que ela mesma promete.
  const proposed = f => {
    const rgb = fg.map(v => Math.round(v * f));
    return { rgb, measured: ratio(rgb, bg) };
  };
  for (let i = 0; i < 50; i += 1) {
    const mid = (low + high) / 2;
    if (proposed(mid).measured >= target) low = mid; else high = mid;
  }
  // Arredondar PARA BAIXO: um fator maior deixa o texto mais claro e reduz o
  // contraste. Math.round aqui devolvia 4.49:1 em dezenas de sugestões.
  const factor = Math.floor(low * 10000) / 10000;
  const { rgb, measured } = proposed(factor);
  return { foreground: cssRgb(rgb), ratio: measured, fator: factor };
}

// CSS Modules geram sufixos de hash; normalizar para agrupar o mesmo componente.
const normalize = selector => selector
  .replace(/__[A-Za-z0-9_-]{5,}/g, '__*')
  .replace(/_[A-Za-z0-9_-]{9,}(?=[\s.>:#]|$)/g, '_*')
  .replace(/\s+/g, ' ')
  .trim();

const sourceText = await read(SOURCE);
const source = JSON.parse(sourceText);
const baseline = JSON.parse(await read(BASELINE));
const entries = Object.entries(source.cenarios).sort(([a], [b]) => a.localeCompare(b));

const groups = new Map();       // CSV: rota|esquema|classe|par|seletor
const pairs = new Map();        // par de cor agregado
const indeterminate = {};       // motivo -> contagem
const unmeasured = {};          // tag -> contagem
const routeStats = {};
const totals = { baseline: { samples: 0, under45: 0, indeterminate: 0, unmeasured: 0 }, complementar: { samples: 0, under45: 0, indeterminate: 0, unmeasured: 0 } };
let mainScenarios = 0; let extraScenarios = 0;

for (const [key, cenario] of entries) {
  const [rota, esquema, cenarioNome] = key.split('|');
  const bucket = cenarioNome === 'main' ? totals.baseline : totals.complementar;
  if (cenarioNome === 'main') mainScenarios += 1; else extraScenarios += 1;
  bucket.samples += cenario.samples.length;
  bucket.under45 += cenario.under45.length;
  bucket.indeterminate += cenario.samples.filter(s => s.ratio === null).length;
  bucket.unmeasured += cenario.unmeasuredSamples.length;

  // Os 2 cenários com zoom 200% (Layout 09) ficam CONTABILIZADOS acima, mas
  // fora do inventário de causas: o baseline 10B congela 11 rotas × 2 esquemas.
  // Misturá-los inflaria 196 → 236 indeterminadas e 708 → 780 sinais.
  if (cenarioNome !== 'main') continue;

  routeStats[rota] ||= { under45: 0, indeterminate: 0, unmeasured: 0, pares: new Set() };

  const classify = (classe, amostra) => {
    const fg = rgbOf(amostra.foreground);
    const bg = Array.isArray(amostra.background) ? amostra.background : null;
    const par = fg && bg ? `${cssRgb(fg)}|${cssRgb(bg)}` : (amostra.reason || 'sem_cor');
    const selector = normalize(amostra.selector || '');
    const gkey = `${rota}|${esquema}|${classe}|${par}|${selector}`;
    if (!groups.has(gkey)) groups.set(gkey, { rota, esquema, classe, par, selector, foreground: amostra.foreground || '', background: bg ? cssRgb(bg) : '', ratio: amostra.ratio ?? '', motivo: amostra.reason || '', ocorrencias: 0, exemplos: new Set() });
    const g = groups.get(gkey);
    g.ocorrencias += 1;
    if (amostra.text && g.exemplos.size < 3) g.exemplos.add(String(amostra.text).slice(0, 60));
  };

  for (const amostra of cenario.under45) {
    classify('abaixo_45', amostra);
    const fg = rgbOf(amostra.foreground); const bg = amostra.background;
    if (!fg || !Array.isArray(bg)) continue;
    // A chave usa a cor CSS ORIGINAL (inclui alpha): dois rgba com o mesmo RGB
    // mas alfas diferentes não devem ser fundidos no mesmo par.
    const par = `${amostra.foreground}|${cssRgb(bg)}`;
    if (!pairs.has(par)) {
      const efetivo = effectiveForeground(amostra.foreground, bg);
      pairs.set(par, {
        foreground: amostra.foreground,
        foregroundEfetivo: efetivo ? cssRgb(efetivo.rgb) : null,
        alpha: efetivo?.alpha ?? 1,
        background: cssRgb(bg),
        ratio: amostra.ratio,
        ocorrencias: 0, rotas: new Set(), seletores: new Set(),
      });
    }
    const p = pairs.get(par);
    // O ratio MEDIDO pelo helper é a fonte de verdade (ele compõe alpha e
    // arredonda o fundo). Se divergir entre amostras, fica o pior caso.
    p.ratio = Math.min(p.ratio, amostra.ratio);
    p.ocorrencias += 1; p.rotas.add(rota);
    p.seletores.add(normalize(amostra.selector || ''));
    routeStats[rota].pares.add(par);
    routeStats[rota].under45 += 1;
  }
  for (const amostra of cenario.samples) {
    if (amostra.ratio !== null) continue;
    const reason = amostra.reason || 'motivo_nao_classificado';
    indeterminate[reason] = (indeterminate[reason] || 0) + 1;
    routeStats[rota].indeterminate += 1;
    classify('indeterminada', amostra);
  }
  for (const amostra of cenario.unmeasuredSamples) {
    unmeasured[amostra.tag] = (unmeasured[amostra.tag] || 0) + 1;
    routeStats[rota].unmeasured += 1;
    classify('nao_medido', amostra);
  }
}

const pairList = [...pairs.values()]
  .map(p => ({
    ...p, rotas: [...p.rotas].sort(), seletores: [...p.seletores].sort().slice(0, 6),
    sugestao: suggest(rgbOf(p.foregroundEfetivo || p.foreground), rgbOf(p.background)),
  }))
  .sort((a, b) => b.ocorrencias - a.ocorrencias || a.ratio - b.ratio);

// Validação cruzada: as amostras precisam reproduzir EXATAMENTE o baseline.
const baselineTotals = { samples: 0, under45: 0, indeterminate: 0, unmeasured: 0 };
for (const rota of Object.keys(baseline.rotas)) for (const esquema of ['light', 'dark']) {
  const c = baseline.rotas[rota].contraste[esquema];
  baselineTotals.samples += c.sampleCount; baselineTotals.under45 += c.under45Count;
  baselineTotals.indeterminate += c.indeterminateCount; baselineTotals.unmeasured += c.unmeasuredVisibleTextCount;
}
for (const field of Object.keys(baselineTotals)) {
  if (totals.baseline[field] !== baselineTotals[field]) {
    console.error(`E18_INVENTORY_MISMATCH: ${field}: amostras=${totals.baseline[field]} baseline=${baselineTotals[field]}`);
    process.exit(1);
  }
}

const csvEscape = value => `"${String(value).replaceAll('"', '""')}"`;
const csvRows = [[
  'classe', 'rota', 'esquema', 'par_de_cor_ou_motivo', 'seletor_normalizado',
  'foreground', 'background', 'ratio', 'motivo', 'ocorrencias', 'exemplos',
].join(',')];
for (const g of [...groups.values()].sort((a, b) =>
  a.classe.localeCompare(b.classe) || a.rota.localeCompare(b.rota) ||
  a.esquema.localeCompare(b.esquema) || b.ocorrencias - a.ocorrencias)) {
  csvRows.push([
    g.classe, g.rota, g.esquema, g.par, g.selector, g.foreground, g.background,
    g.ratio, g.motivo, g.ocorrencias, [...g.exemplos].join(' / '),
  ].map(csvEscape).join(','));
}

const topPairs = pairList.slice(0, 12);
const report = `# E18 — Inventário acionável de contraste das prévias 10B

**Data:** 2026-10-27 · **Status:** diagnóstico entregue e **correção aplicada** pela **Opção A** (decisão do proprietário). O retrato abaixo é o **DEPois da correção**: **0 sinais abaixo de 4.5:1**.

> **Atualização 27/10.** O inventário original apontava **708** sinais abaixo de 4.5:1 em **165 pares de cor**. O proprietário escolheu a **Opção A — Ajuste mínimo (AA)** entre três propostas com prévia visual. As 144 cores de texto foram ajustadas nos 10 módulos de layout e em \`src/app/globals.css\`, com 2 regras pontuais e variantes claras/escuras para as 2 cores de superfície mista. O gate 10B foi **reexecutado em PostgreSQL 17 + Chromium**: 2.560 amostras, **0 abaixo de 4.5:1**. O baseline histórico (708) está preservado em \`docs/e18-paletas-2026-10-27/amostras-baseline-708.json\`; o SHA \`917236ad…\` citado abaixo é o do baseline ANTES da correção. Relatório: \`docs/E18-OPCAO-A-RESULTADO-2026-10-27.md\`. Permanecem **196 indeterminadas** (\`complex_background\`) e **108 textos não medidos** (\`<option>\` de \`<select>\`), fora do escopo deste método. Revisão WCAG manual, leitor de tela, UAT/Windows e aceite humano seguem pendentes; **NO-GO**.

## Por que esta fatia existe

O gate 10B media em Chromium real e congelava os totais em
\`docs/UX-PRO-10B-PREVIAS-MEDICOES-2026-10-27.json\`: **2.560 amostras,
708 abaixo de 4.5:1, 196 indeterminadas, 108 textos visíveis não medidos**.
O JSON guardava só CONTAGENS. Sem as amostras, "708 sinais" era um número
que não apontava para nenhum arquivo, cor ou componente. Esta fatia passa a
guardar as amostras brutas e as transforma em um inventário de causas.

Na fatia de **diagnóstico**, **NENHUM CSS**, token, paleta ou decisão de
design foi alterado — o baseline 10B (SHA \`917236ad…\`, hoje \`14ff3232…\`) apenas registrava a
pendência. Na fatia **posterior**, a decisão do proprietário autorizou a
correção (ver aviso acima); o baseline foi então atualizado para **0** e a
guarda \`tests/ux-pro-10b-previas-medicoes.test.mjs\` passou a bloquear
qualquer sinal novo.

## Validação cruzada

As amostras dos ${mainScenarios} cenários principais (11 rotas × 2 esquemas)
reproduzem **exatamente** o baseline congelado:

| Métrica | Baseline | Amostras |
| --- | ---: | ---: |
| Amostras | ${baselineTotals.samples} | ${totals.baseline.samples} |
| Abaixo de 4.5:1 | ${baselineTotals.under45} | ${totals.baseline.under45} |
| Indeterminadas | ${baselineTotals.indeterminate} | ${totals.baseline.indeterminate} |
| Textos não medidos | ${baselineTotals.unmeasured} | ${totals.baseline.unmeasured} |

Há ainda ${extraScenarios} cenários complementares (Layout 09 com zoom 200% em
light/dark): ${totals.complementar.samples} amostras,
${totals.complementar.under45} abaixo de 4.5:1,
${totals.complementar.indeterminate} indeterminadas. Eles **não** entram no
baseline e ficam fora do inventário de causas abaixo — estão contabilizados
no JSON (\`totais.complementar\`) para não inflar os números do proprietário.

## Causa 1 — ${totals.baseline.under45} sinais abaixo de 4.5:1

São **${pairList.length} pares foreground/background distintos**. Não é um
defeito único: é um padrão de texto secundário/link em azul claro e tons
pastel sobre fundos claros. Os 12 pares com mais ocorrências:

| Foreground | Background | Ratio | Ocorrências | Rotas | Sugestão técnica (não aplicada) |
| --- | --- | ---: | ---: | ---: | --- |
${topPairs.map(p => `| \`${p.foreground}\` | \`${p.background}\` | ${p.ratio}:1 | ${p.ocorrencias} | ${p.rotas.length} | ${p.sugestao.fundoInviavel ? 'fundo inviável (precisa clarear)' : `\`${p.sugestao.foreground}\` → ${p.sugestao.ratio}:1`} |`).join('\n')}

**Armadilha encontrada e corrigida nesta fatia:** 4 amostras usam foreground
com alpha (ex.: \`rgba(182, 227, 255, 0.72)\` sobre \`rgb(22, 79, 216)\`).
Quem recalcula o ratio a partir do RGB puro obtém 4.9:1 — parece aprovado —,
mas o helper PU4 compõe o alpha sobre o fundo e mede **3.3:1**. O inventário
usa o **ratio medido pelo helper** como fonte de verdade e expõe o
\`foregroundEfetivo\` composto; a sugestão parte dele, não do RGB cru.

A sugestão escurece apenas o foreground mantendo o fundo, até 4.5:1. É um
cálculo de luminância — **não** é uma proposta de identidade visual. A tabela
completa (com seletores normalizados e exemplos de texto) está em
\`docs/UX-PRO-10B-CONTRASTE-INVENTARIO-2026-10-27.csv\` e no JSON.

Distribuição por rota (light + dark):

| Rota | < 4.5:1 | Pares distintos | Indeterminadas | Não medidos |
| --- | ---: | ---: | ---: | ---: |
${Object.entries(routeStats).sort().map(([r, s]) => `| \`${r}\` | ${s.under45} | ${s.pares.size} | ${s.indeterminate} | ${s.unmeasured} |`).join('\n')}

## Causa 2 — ${totals.baseline.indeterminate} indeterminadas

Todas têm \`reason = complex_background\`: existe \`background-image\`
(gradiente/imagem) em algum ancestral, e o helper PU4 desiste de compor a cor
porque não amostra pixels. **Isso é uma limitação do medidor, não uma aprovação
nem uma reprovação de contraste.** A ação é medir sobre pixel renderizado
(screenshot + amostragem) antes de decidir; o valor continua registrado como
indeterminado, nunca convertido em "passou".

Motivos encontrados: ${Object.entries(indeterminate).map(([k, v]) => `\`${k}\` (${v})`).join(', ') || 'nenhum'}.

## Causa 3 — ${totals.baseline.unmeasured} textos não medidos

**${Object.entries(unmeasured).map(([k, v]) => `${v} são \`<${k}>\``).join(', ')} dentro de \`<select>\`**, todos com
\`reason = no_client_rect\`. O Chromium não dá \`getClientRects()\` para um
\`<option>\` enquanto o controle está fechado — o texto existe e está visível
no DOM, mas não é renderizado como caixa própria. São **controles nativos**,
não texto corriqueiro: o contraste deles depende do tema do widget nativo do
sistema operacional, não do CSS do site.

Conclusão honesta: esses ${totals.baseline.unmeasured} casos devem ser
**reclassificados como "não aplicável a este método"**, não como 108 defeitos de
contraste escondidos. Eles NÃO podem ser zerados do baseline sem uma decisão
explícita — por isso o baseline e a guarda 10B foram preservados.

## Ações recomendadas (nenhuma executada)

1. **Decisão de paleta (proprietário):** escolher, entre as sugestões da tabela,
   os tokens de texto secundário/link que serão escurecidos. São
   ${pairList.length} pares; os 12 primeiros cobrem ${topPairs.reduce((n, p) => n + p.ocorrencias, 0)} ocorrências.
2. **Revisão WCAG manual:** texto grande (≥18,66px negrito ou ≥24px) exige
   apenas 3:1; o helper usa 4.5:1 para tudo. Parte dos ${totals.baseline.under45} pode ser
   legítima — exige leitura humana, não automação.
3. **Medição por pixel** para as ${totals.baseline.indeterminate} indeterminadas com fundo complexo.
4. **Leitor de tela e UAT/Windows** seguem não executados.
5. **Reclassificar** os ${totals.baseline.unmeasured} \`<option>\` como não aplicáveis — com nova
   fatia, relatório e atualização explícita do baseline (nunca por acidente).

## Artefatos

- Amostras brutas (escritas pelo gate 10B): \`${SOURCE}\` — SHA \`${sha(sourceText).slice(0, 12)}…\`
- Inventário estruturado: \`${OUT_JSON}\`
- Inventário tabular: \`${OUT_CSV}\`
- Baseline original (intacto): \`${BASELINE}\` — SHA \`917236ad…\` à época; hoje \`14ff3232…\` (0 sinais)

## Limites

Revisão manual de tema/contraste não executada; WCAG integral não verificado;
leitor de tela não executado; aceite humano/UAT/Windows não executado.
**Produção segue NO-GO.**
`;

const jsonOut = JSON.stringify({
  stage: 'e18-inventario-contraste',
  data: '2026-10-27',
  metodo: 'amostras brutas de measureTextContrast (PU4) em Chromium real; agrupadas por par de cor, seletor normalizado e motivo',
  origem: { arquivo: SOURCE, sha256: sha(sourceText) },
  baseline: { arquivo: BASELINE, totais: baselineTotals, validacaoCruzada: 'identica' },
  escopo: { cenarios: entries.length, cenariosBaseline: mainScenarios, cenariosComplementares: extraScenarios },
  totais: totals,
  causas: {
    abaixo45: { paresDeCorDistintos: pairList.length, pares: pairList },
    indeterminadas: indeterminate,
    naoMedidos: unmeasured,
  },
  rotas: Object.fromEntries(Object.entries(routeStats).sort().map(([r, s]) => [r, {
    under45: s.under45, paresDistintos: s.pares.size,
    indeterminadas: s.indeterminate, naoMedidos: s.unmeasured,
  }])),
  grupos: groups.size,
  limite: 'diagnostico; nenhuma paleta ou CSS alterado; decisao de design pendente do proprietario; producao NO-GO',
}, null, 2) + '\n';
const csvOut = csvRows.join('\n') + '\n';

if (CHECK) {
  let failed = false;
  for (const [file, expected] of [[OUT_JSON, jsonOut], [OUT_CSV, csvOut], [OUT_MD, report]]) {
    let actual;
    try { actual = await read(file); } catch { actual = null; }
    if (actual !== expected) { console.error(`E18_INVENTORY_CHECK_FAIL: ${file} ${actual === null ? 'ausente' : 'desatualizado'}`); failed = true; }
    else console.log(`E18_INVENTORY_CHECK_OK: ${file}`);
  }
  process.exit(failed ? 1 : 0);
}

for (const [file, content] of [[OUT_JSON, jsonOut], [OUT_CSV, csvOut], [OUT_MD, report]]) {
  await writeFile(path.join(root, file), content);
  console.log(`E18_INVENTORY_WRITTEN: ${file}`);
}
console.log(`E18_INVENTORY_RESUMO: ${pairList.length} pares de cor | ${groups.size} grupos | ` +
  `${totals.baseline.under45} abaixo de 4.5:1 | ${totals.baseline.indeterminate} indeterminadas | ${totals.baseline.unmeasured} nao medidos`);
