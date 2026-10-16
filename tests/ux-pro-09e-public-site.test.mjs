// UX-PRO-09E — regressão das correções do site público autorizadas após o 09B.
//
// O que este arquivo PROVA, lido do código e das capturas versionadas:
//  1. que somente as quatro sugestões e o CTA público usam o acento interativo
//     >=4,5:1; o título/base do RAG e os três escopos privados ficam intactos;
//  2. que os três grupos textuais do simulador passam de 4,5:1, enquanto os
//     números em span permanecem #8397a8 e fora das 104 amostras autorizadas;
//  3. que os dois e-mails podem quebrar sem alterar conteúdo ou fluxo de lead;
//  4. que o público não ganhou tema sistêmico e que a evidência mantém o antes,
//     o after corrigido, os oito títulos sem defeito demonstrado e os 96 sinais
//     reais corrigidos, sem esconder amostras.
//
// Não prova: conformidade WCAG integral, aceite humano, UAT, leitor de tela,
// zoom, outros navegadores nem produção. Razão de contraste calculada aqui é a
// mesma fórmula do probe de captura (scripts/ux-evidence-capture.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const source = file => readFileSync(new URL(file, root), 'utf8');

const hex = value => {
  const m = /#([0-9a-f]{6}|[0-9a-f]{3})/i.exec(value || '');
  if (!m) return null;
  const digits = m[1].length === 3 ? [...m[1]].map(digit => digit + digit).join('') : m[1];
  return digits.toLowerCase();
};
const channel = v => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
// Mesma fórmula do probe de captura: luminância relativa sRGB e razão (L1+0.05)/(L2+0.05).
const luminance = digits => [0, 2, 4].reduce((sum, offset, index) => sum + [0.2126, 0.7152, 0.0722][index] * channel(parseInt(digits.slice(offset, offset + 2), 16)), 0);
const ratio = (a, b) => {
  const [x, y] = [luminance(hex(a)), luminance(hex(b))].sort((m, n) => n - m);
  assert.ok(!Number.isNaN(x) && !Number.isNaN(y), `cor não resolvida para calcular contraste: ${a} / ${b}`);
  return Math.round((x + 0.05) / (y + 0.05) * 100) / 100;
};

/** `RAG_COLORS` literal, por escopo. */
function ragColors() {
  const source = readFileSync(new URL('src/components/RagWidget.tsx', root), 'utf8');
  const block = /const RAG_COLORS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(source);
  assert.ok(block, 'RAG_COLORS precisa continuar sendo um literal nomeado em RagWidget.tsx');
  const scopes = {};
  for (const scope of ['publico', 'cliente', 'rh', 'marcelo']) {
    const entry = new RegExp(`${scope}:\\s*\\{([^}]*)\\}`).exec(block[1]);
    assert.ok(entry, `escopo ${scope} ausente em RAG_COLORS`);
    for (const role of ['border', 'bg', 'accent', 'light']) {
      const value = new RegExp(`${role}:\\s*"(#[0-9a-f]{6})"`, 'i').exec(entry[1]);
      assert.ok(value, `${scope}.${role} ausente`);
      (scopes[scope] ||= {})[role] = value[1].toLowerCase();
    }
  }
  return scopes;
}

const MIN = 4.5;

test('UX-PRO-09E PU2: somente as quatro sugestões e o CTA público recebem o acento interativo', () => {
  const publico = ragColors().publico;
  const widget = source('src/components/RagWidget.tsx');
  const contrastColor = /--rag-accent-contrast":\s*"(#[0-9a-f]{3,6})"/i.exec(widget)?.[1];
  const interactiveAccent = /const interactiveAccent = ragKey === "publico" \? "(#[0-9a-f]{6})" : colors\.accent;/.exec(widget)?.[1];
  assert.ok(contrastColor, 'o texto do CTA precisa continuar usando --rag-accent-contrast');
  assert.equal(interactiveAccent, '#c2410c', 'o acento interativo escuro é aplicado apenas ao escopo público');
  assert.deepEqual(publico, { border: '#ea580c', bg: '#fff7ed', accent: '#ea580c', light: '#ffedd5' },
    'a cor-base, borda, título e papéis não medidos do RAG público permanecem inalterados');

  const suggestions = /publico:\s*\[([^\]]*)\]/.exec(widget)?.[1];
  assert.ok(suggestions, 'as sugestões públicas precisam permanecer declaradas');
  assert.equal((suggestions.match(/"[^"]+"/g) || []).length, 4, 'o conjunto medido contém exatamente quatro sugestões');
  assert.match(widget, /className="rag-suggestion"[\s\S]*?color: "var\(--rag-interactive-accent\)"/,
    'as sugestões usam apenas a variável de acento interativo');
  assert.match(widget, /<h2[^>]*fontSize: 20, fontWeight: 700, color: "var\(--rag-accent\)"[^>]*>\{title\}<\/h2>/,
    'o título grande continua usando o acento-base original');
  assert.match(widget, /data-testid="rag-scope"[\s\S]*?color: "var\(--rag-accent\)"/,
    'o selo de escopo não entra na correção dos cinco controles');
  assert.match(widget, /data-testid="rag-submit"[\s\S]*?background: "var\(--rag-interactive-accent\)"/,
    'somente o CTA usa o acento interativo como fundo');
  assert.equal((widget.match(/var\(--rag-interactive-accent\)/g) || []).length, 2,
    'a variável interativa só é consumida pelo texto das sugestões e pelo fundo do CTA');

  const cases = [
    ['texto das sugestões sobre branco', ratio(interactiveAccent, '#ffffff')],
    ['texto branco do CTA sobre o acento interativo', ratio(contrastColor, interactiveAccent)],
  ];
  for (const [name, value] of cases) assert.ok(value >= MIN, `${name}: ${value}:1 < ${MIN}:1`);
  const titleRatio = ratio(publico.accent, publico.bg);
  assert.equal(titleRatio, 3.35, 'o título conserva a razão original medida');
  assert.ok(titleRatio >= 3, 'o título 20px/700 é texto grande no limiar revisado, não defeito demonstrado');
  assert.ok(ratio(publico.border, publico.bg) >= 3, 'a borda do cartão permanece no limiar de contraste não textual original');
});

test('UX-PRO-09E PU2: os escopos privados não são tocados pela correção do público', () => {
  const scopes = ragColors();
  assert.deepEqual(
    scopes.cliente, { border: '#0b5fff', bg: '#eff6ff', accent: '#0b5fff', light: '#dbeafe' },
    'o escopo do portal do cliente pertence a outro gate (09A/09C); a 09E não o recolora',
  );
  assert.deepEqual(
    scopes.rh, { border: '#059669', bg: '#ecfdf5', accent: '#059669', light: '#d1fae5' },
    'o escopo RH pertence ao gate FECH-01/08D',
  );
  assert.deepEqual(
    scopes.marcelo, { border: '#7c3aed', bg: '#f5f3ff', accent: '#7c3aed', light: '#ede9fe' },
    'o escopo Marcelo pertence ao gate FECH-01/08D',
  );
  // Identidade/base pública preservada; o acento interativo é uma variável separada.
  assert.deepEqual(scopes.publico, { border: '#ea580c', bg: '#fff7ed', accent: '#ea580c', light: '#ffedd5' });
});

/** Declarações de um seletor do CSS module do simulador, com tokens resolvidos. */
function simulatorRule(selector) {
  const css = source('src/app/simulador/Simulator.module.css');
  const tokens = {};
  const page = /\.page\s*\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(page, 'o bloco .page precisa declarar os tokens da página');
  for (const [, name, value] of page[1].matchAll(/(--[a-z-]+):\s*([^;]+);/g)) tokens[name] = value.trim();
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`\\n${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css);
  assert.ok(block, `seletor ${selector} ausente em Simulator.module.css`);
  const declarations = Object.fromEntries(
    [...block[1].matchAll(/^\s*([a-z-]+):\s*([^;]+);/gm)].map(([, prop, value]) => [prop, value.trim()]),
  );
  const resolve = value => (value?.startsWith('var(') ? tokens[/var\((--[\w-]+)\)/.exec(value)[1]] : value) || value;
  return { declarations, tokens, color: resolve(declarations.color), background: resolve(declarations.background) };
}

test('UX-PRO-09E PU3: textos medidos do simulador passam de 4,5:1 e números em span preservam #8397a8', () => {
  const muted = /\.page[\s\S]*?--muted:\s*(#[0-9a-f]{6})/.exec(source('src/app/simulador/Simulator.module.css'))[1].toLowerCase();
  const cases = [
    ['rótulos das etapas', '.steps li', '#ffffff'],
    ['introdução do resumo', '.asideIntro', '#ffffff'],
    ['resumo vazio', '.summaryEmpty', '#ffffff'],
  ];
  for (const [name, selector, paintedOn] of cases) {
    const rule = simulatorRule(selector);
    assert.equal(rule.declarations.color, 'var(--muted)', `${name}: esperava o token --muted da própria página, veio ${rule.declarations.color}`);
    const value = ratio(muted, paintedOn);
    assert.ok(value >= MIN, `${name}: ${value}:1 sobre ${paintedOn} < ${MIN}:1`);
  }
  const number = simulatorRule('.steps li span');
  assert.equal(number.declarations.color, '#8397a8', 'o número em span não pertence às 104 amostras e conserva seu estilo original');
  assert.equal(number.declarations.background, '#eef4fa');
  assert.equal(muted, '#5a7189', '--muted é token compartilhado: mudou, o gate inteiro do público precisa ser relido');
});

test('UX-PRO-09E PU1: os dois blocos que estouravam o documento a 320 px quebram a palavra e mantêm o conteúdo', () => {
  const contato = source('src/app/contato/page.tsx');
  const faq = source('src/app/faq/page.tsx');
  const probe = source('scripts/ux-evidence-capture.mjs');
  const EMAIL = 'contato@gruposegsystemseguranca.com.br';

  assert.match(probe, /attributeTextOverflow:\s*true/,
    'a stage 09E mede a execução de texto; retângulos de elementos sozinhos não atribuem o caso de /faq');
  assert.match(probe, /range\.selectNodeContents\(node\)[\s\S]*?range\.getClientRects\(\)/,
    'o culpado precisa ser medido com Range do nó de texto, não inferido do documento largo');
  assert.match(probe, /textOverflowCulprits/,
    'o resumo da captura deve poder reter a atribuição DOM quando o Range encontra overflow');

  const section = /<section style=\{\{([^}]*)\}\}>\s*<strong>Endereço:<\/strong>/.exec(contato);
  assert.ok(section, 'o bloco de endereço de /contato precisa continuar existindo com o mesmo texto');
  assert.match(section[1], /overflowWrap:\s*"(break-word|anywhere)"/, '/contato: sem a regra de quebra, o e-mail de 287 px estoura o documento em 343 px');

  const faqBlock = faq.slice(faq.indexOf('Contato claro'), faq.lastIndexOf('<FaqAssistedWidget'));
  assert.match(faqBlock, /overflowWrap:\s*"(break-word|anywhere)"/, '/faq: sem a regra de quebra, o e-mail estoura o documento em 347 px');
  assert.match(faqBlock, /<p style=\{\{[^}]*overflowWrap/, '/faq: a regra precisa estar no parágrafo que carrega o texto medido');

  // Preservação: corrigir overflow não pode esconder, abreviar nem remover o dado.
  assert.equal(contato.split(EMAIL).length - 1, 1, '/contato perdeu o e-mail institucional');
  assert.ok(faq.includes(EMAIL), '/faq perdeu o e-mail institucional');
  assert.ok(contato.includes('Av. Armando Bei, 305 - Sala 01'), '/contato perdeu o endereço');
  assert.ok(faq.includes('(11) 3437-2217'), '/faq perdeu o telefone');
  // Nem o formulário, nem o contrato do lead, nem os rótulos mudam por acréscimo de estilo.
  for (const fragment of ['"/api/leads"', 'consent: form.consent', 'origin', 'campaign: "site"', 'maxLength={1000}']) {
    assert.ok(contato.includes(fragment), `/contato: o trecho do formulário "${fragment}" deixou de existir`);
  }
});

test('UX-PRO-09E: nenhuma superfície pública recebeu tema sistêmico de contrapeso', () => {
  const files = [
    'src/app/contato/page.tsx', 'src/app/faq/page.tsx', 'src/app/simulador/page.tsx',
    'src/app/simulador/Simulator.module.css', 'src/app/globals.css', 'src/app/theme-tech.css',
  ];
  for (const file of files) {
    const text = source(file);
    for (const hook of ['prefers-color-scheme', 'seg-color-mode', 'data-color-mode', 'adminTheme', 'data-admin-theme']) {
      assert.ok(!text.includes(hook), `${file} passou a referenciar "${hook}": o público não ganha tema por consequência`);
    }
  }
});

test('UX-PRO-09E: evidência corrigida cruza cada sinal, dimensões, hashes e o antes/depois', async () => {
  const read = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'));
  const evidenceRoot = 'docs/UX-PRO-09E-evidencias-2026-10-16';
  const beforeRoot = `${evidenceRoot}/antes`;
  const correctionRoot = `${evidenceRoot}/correcao`;
  const slugs = ['home', 'contato', 'conteudos', 'conteudo-dinamico', 'faq', 'orcamento', 'pacotes', 'privacidade',
    'aceite-token-sintetico-invalido', 'segmentos', 'segmento-condominio', 'servicos', 'servico-seguranca-desarmada', 'simulador'];
  const before = {};
  const after = {};
  for (const slug of slugs) {
    before[slug] = await read(`${beforeRoot}/${slug}/resumo.json`);
    after[slug] = await read(`${correctionRoot}/${slug}/resumo.json`);
  }

  const tally = summaries => {
    let entries = 0, samples = 0, resolved = 0, under = 0, overflow = 0;
    for (const summary of Object.values(summaries)) {
      for (const entry of summary.entries) {
        entries += 1;
        samples += entry.audit.contrast.sampleCount;
        resolved += entry.audit.contrast.resolvedCount;
        under += entry.audit.contrast.under45.length;
        if (entry.problems.some(problem => problem.includes('rolagem horizontal'))) overflow += 1;
      }
    }
    return { entries, samples, resolved, under, overflow };
  };
  const a = tally(before);
  const b = tally(after);
  assert.deepEqual(a, { entries: 112, samples: 2214, resolved: 1246, under: 104, overflow: 4 },
    'antes: 14 rotas × 4 larguras × 2 preferências, com os 104 sinais e 4 overflows do diagnóstico');
  assert.deepEqual(b, { entries: 112, samples: 2214, resolved: 1246, under: 8, overflow: 0 },
    'after: universo preservado, sem overflow e somente os oito títulos grandes inalterados abaixo de 4,5:1');
  for (const [slug, documentWidth, cause] of [
    ['contato', 343, 'section "contato@gruposegsystemseguranca.com.br" rect=287px fim=343px'],
    ['faq', 347, 'p "E-mail: contato@gruposegsystemseguranca.com.br (" rect=287px fim=347px'],
  ]) {
    const at320 = before[slug].entries.filter(entry => entry.viewport === '320x780');
    assert.equal(at320.length, 2, `${slug}: antes deve conter day e night a 320px`);
    for (const entry of at320) {
      assert.ok(entry.problems.some(problem => problem.includes(`${documentWidth} > 320`)),
        `${slug} ${entry.theme}: overflow horizontal anterior ausente`);
      assert.ok(entry.problems.some(problem => problem.includes(`overflow atribuído a execução de texto: ${cause}`)),
        `${slug} ${entry.theme}: causa do overflow não foi confirmada pelo Range DOM`);
    }
  }

  const correctedTitleResiduals = [];
  const beforeByCapture = new Map();
  const afterByCapture = new Map();
  for (const summaries of [before, after]) {
    for (const summary of Object.values(summaries)) {
      for (const entry of summary.entries) {
        const key = `${entry.route}|${entry.viewport}|${entry.theme}`;
        (summaries === before ? beforeByCapture : afterByCapture).set(key, entry);
        if (summaries === after) {
          assert.ok(Array.isArray(entry.audit.contrast.samples), `${key}: lista DOM completa ausente`);
          assert.equal(entry.audit.contrast.samples.length, entry.audit.contrast.sampleCount, `${key}: contagem DOM divergente`);
          for (const signal of entry.audit.contrast.under45) correctedTitleResiduals.push({ entry, signal });
        }
      }
    }
  }
  assert.equal(correctedTitleResiduals.length, 8);
  for (const { entry, signal } of correctedTitleResiduals) {
    assert.equal(entry.route, '/contato');
    assert.equal(signal.tag, 'h2');
    assert.equal(signal.text, 'Assistente de dúvidas');
    assert.equal(signal.ratio, 3.35);
    assert.equal(signal.foreground, 'rgb(234, 88, 12)');
  }

  const correctedSummary = await read(`${correctionRoot}/resumo.json`);
  assert.equal(correctedSummary.beforeBase, '4a4b614b08046f93c59e44f9502218b0d9e47244');
  assert.equal(correctedSummary.correctiveBase, '6866b5019b0fcb12536ca51fcc7061e9b2e538d9');
  assert.deepEqual(correctedSummary.beforeMeasurements, {
    entries: 112, sampleCount: 2214, resolvedCount: 1246, indeterminateCount: 968,
    under45Count: 104, horizontalOverflowCount: 4, navigationStatus200: 112,
  });
  assert.deepEqual(correctedSummary.correctiveAfterMeasurements, {
    entries: 112, sampleCount: 2214, resolvedCount: 1246, indeterminateCount: 968,
    under45Count: 8, horizontalOverflowCount: 0, navigationStatus200: 112,
  });
  assert.deepEqual(correctedSummary.counts, {
    publicRoutes: 14,
    viewportCapturesBefore: 112,
    viewportCapturesCorrectiveAfter: 112,
    totalCorrectiveAfterPngs: 112,
    navigationStatus200: 112,
    reviewedBelow45Before: 104,
    correctedRealSignals: 96,
    realSignalsAtLeast4_5After: 96,
    largeTextNoDefectDemonstrated: 8,
    below45AfterIncludingUnchangedLargeText: 8,
  });

  const review = await read(`${correctionRoot}/contraste-revisao.json`);
  assert.equal(review.beforeBase, '4a4b614b08046f93c59e44f9502218b0d9e47244');
  assert.equal(review.correctiveBase, '6866b5019b0fcb12536ca51fcc7061e9b2e538d9');
  assert.deepEqual(review.counts, {
    reviewed: 104,
    matchedAfter: 104,
    originalCorrectedSignals: 96,
    correctedSignalsMeeting4_5: 96,
    noDefectDemonstrated: 8,
    correctedSignalsStillBelow4_5: 0,
    afterAuditUnder45: 8,
    byRoute: { contato: 48, simulador: 56 },
    byTarget: {
      'rag-suggestion': 32,
      'rag-submit': 8,
      'rag-title-no-change': 8,
      'simulator-step-label': 32,
      'simulator-summary-intro': 8,
      'simulator-summary-empty': 16,
    },
  });
  assert.equal(review.samples.length, 104, 'o crosswalk contém cada observação original, não só uma amostra por estilo');
  assert.equal(review.samples.filter(sample => sample.result === 'corrigido-na-amostra').length, 96);
  assert.equal(review.samples.filter(sample => sample.result === 'mantido-sem-alteracao').length, 8);
  for (const [group, count] of Object.entries(review.counts.byTarget)) {
    assert.equal(review.samples.filter(sample => sample.targetGroup === group).length, count, `${group}: quantidade fora do escopo`);
  }
  assert.ok(review.samples.filter(sample => sample.targetGroup === 'simulator-step-label')
    .every(sample => sample.measurementBoundary?.includes('#8397a8')),
  'o texto concatenado do li não deve atribuir seus números span às 104 amostras');
  assert.ok(review.observationsOutside104.some(item => item.route === '/simulador' && item.observation.includes('#8397a8')),
    'o registro explicita que os números em span ficam fora das 104 e preservam #8397a8');
  for (const sample of review.samples) {
    const key = `${sample.route}|${sample.viewport}|${sample.theme}`;
    const beforeEntry = beforeByCapture.get(key);
    const afterEntry = afterByCapture.get(key);
    assert.ok(beforeEntry && afterEntry, `${sample.sampleId}: captura antes/depois ausente`);
    const oldSignals = beforeEntry.audit.contrast.under45.filter(item => item.tag === sample.tag && item.text === sample.text);
    const newSignals = afterEntry.audit.contrast.samples.filter(item => item.tag === sample.tag && item.text === sample.text);
    assert.equal(oldSignals.length, 1, `${sample.sampleId}: sinal original não é único`);
    assert.equal(newSignals.length, 1, `${sample.sampleId}: sinal DOM posterior não é único`);
    assert.equal(oldSignals[0].ratio, sample.before.ratio, `${sample.sampleId}: razão before diverge`);
    assert.equal(newSignals[0].ratio, sample.after.ratio, `${sample.sampleId}: razão after diverge`);
    assert.equal(newSignals[0].foreground, sample.after.foreground, `${sample.sampleId}: cor after diverge`);
    if (sample.result === 'corrigido-na-amostra') assert.ok(sample.after.ratio >= 4.5, `${sample.sampleId}: sinal real não corrigido`);
    else {
      assert.equal(sample.tag, 'h2');
      assert.equal(sample.text, 'Assistente de dúvidas');
      assert.equal(sample.before.ratio, sample.after.ratio);
      assert.equal(sample.before.foreground, sample.after.foreground);
    }
  }

  // PNG: toda referência tem arquivo, todo arquivo está referenciado e IHDR = viewport.
  const referencedPaths = new Set();
  for (const [summaries, phase] of [[before, 'antes'], [after, 'correcao']]) {
    for (const slug of slugs) {
      const dir = phase === 'antes' ? `${beforeRoot}/${slug}` : `${correctionRoot}/${slug}`;
      const referenced = new Set();
      for (const entry of summaries[slug].entries) {
        referenced.add(entry.screenshot);
        referencedPaths.add(entry.screenshot);
        const png = await readFile(new URL(entry.screenshot, root));
        assert.equal(png.subarray(1, 4).toString(), 'PNG', `${entry.screenshot}: assinatura PNG ausente`);
        const [declaredWidth, declaredHeight] = entry.viewport.split('x').map(Number);
        const expected = { 320: 780, 390: 844, 768: 1024, 1440: 900 }[declaredWidth];
        assert.equal(declaredHeight, expected, `${entry.screenshot}: viewport declarado com altura improvável`);
        assert.equal(png.readUInt32BE(16), declaredWidth, `${entry.screenshot}: largura ${png.readUInt32BE(16)} ≠ viewport ${declaredWidth}`);
        assert.equal(png.readUInt32BE(20), expected, `${entry.screenshot}: altura ${png.readUInt32BE(20)} ≠ viewport ${expected}`);
      }
      const onDisk = new Set(readdirSync(new URL(`${dir}/`, root)).filter(name => name.endsWith('.png')).map(name => `${dir}/${name}`));
      assert.deepEqual([...referenced].filter(item => !onDisk.has(item)), [], `${dir}: captura referenciada sem arquivo`);
      assert.deepEqual([...onDisk].filter(item => !referenced.has(item)), [], `${dir}: PNG órfão em disco`);
    }
  }

  const manifest = await read(`${correctionRoot}/integridade.json`);
  assert.equal(manifest.algorithm, 'SHA-256');
  assert.equal(manifest.files.length, 224);
  assert.deepEqual(new Set(manifest.files.map(file => file.path)), referencedPaths,
    'o manifesto inclui exatamente os PNGs antes/depois referenciados, sem órfãos');
  for (const file of manifest.files) {
    const image = readFileSync(new URL(file.path, root));
    assert.equal(image.length, file.bytes, `${file.path}: tamanho diverge do manifesto`);
    assert.equal(createHash('sha256').update(image).digest('hex'), file.sha256, `${file.path}: SHA-256 diverge`);
  }

  // Day/night segue byte-idêntico nas três rotas em escopo: não se introduziu tema público.
  for (const slug of ['contato', 'faq', 'simulador']) {
    for (const summaries of [before, after]) {
      const byViewport = {};
      for (const entry of summaries[slug].entries) {
        const png = readFileSync(new URL(entry.screenshot, root));
        (byViewport[entry.viewport] ||= {})[entry.theme] = createHash('sha256').update(png).digest('hex');
      }
      for (const [viewport, themes] of Object.entries(byViewport)) {
        assert.equal(themes.day, themes.night, `${slug} ${viewport}: day e night divergiram — o público ganhou tema?`);
      }
    }
  }
});


test('UX-PRO-09E: captura própria before preserva resumos, referências e hashes', async () => {
  const read = async file => JSON.parse(await readFile(new URL(file, root), 'utf8'));
  const ownRoot = 'docs/UX-PRO-09E-evidencias-2026-10-16/captura-propria';
  const slugs = ['home', 'contato', 'conteudos', 'conteudo-dinamico', 'faq', 'orcamento', 'pacotes', 'privacidade',
    'aceite-token-sintetico-invalido', 'segmentos', 'segmento-condominio', 'servicos', 'servico-seguranca-desarmada', 'simulador'];
  const summaries = {};
  for (const slug of slugs) summaries[slug] = await read(`${ownRoot}/${slug}/resumo.json`);

  let entries = 0, samples = 0, resolved = 0, under = 0, overflow = 0;
  for (const summary of Object.values(summaries)) {
    assert.equal(summary.baseMain, '4a4b614b08046f93c59e44f9502218b0d9e47244');
    for (const entry of summary.entries) {
      entries += 1;
      samples += entry.audit.contrast.sampleCount;
      resolved += entry.audit.contrast.resolvedCount;
      under += entry.audit.contrast.under45.length;
      if (entry.problems.some(problem => problem.includes('rolagem horizontal'))) overflow += 1;
      assert.equal(entry.navigationStatus, 200);
      assert.ok(readdirSync(new URL(`${ownRoot}/`, root)).includes(entry.scenarioId));
    }
  }
  assert.deepEqual({ entries, samples, resolved, under, overflow },
    { entries: 112, samples: 2215, resolved: 1246, under: 104, overflow: 4 });
  for (const [slug, documentWidth] of [['contato', 343], ['faq', 347]]) {
    const at320 = summaries[slug].entries.filter(entry => entry.viewport === '320x780');
    assert.equal(at320.length, 2, `${slug}: esperava day/night a 320 px`);
    for (const entry of at320) {
      assert.ok(entry.problems.some(problem => problem.includes(`${documentWidth} > 320`)),
        `${slug} ${entry.theme}: overflow de ${documentWidth}px não reproduzido`);
    }
  }
  const ownReview = await read(`${ownRoot}/contraste-revisao.json`);
  assert.equal(ownReview.baseMain, '4a4b614b08046f93c59e44f9502218b0d9e47244');
  assert.deepEqual(ownReview.counts, {
    reviewed: 104,
    correctedSignals: 96,
    noDefectDemonstrated: 8,
    byRoute: { contato: 48, simulador: 56 },
  });
  assert.equal(ownReview.samples.length, 104);
  const fullPageSummary = await read(`${ownRoot}/visual-context/resumo.json`);
  assert.deepEqual(fullPageSummary.counts, { captures: 24, routes: 3, navigationStatus200: 24 });

  const manifest = await read(`${ownRoot}/integridade.json`);
  assert.equal(manifest.algorithm, 'SHA-256');
  assert.equal(manifest.files.length, 136, '112 capturas de viewport + 24 contextos full-page');
  const byPath = new Map(manifest.files.map(file => [file.path, file]));
  assert.equal(byPath.size, 136, 'o manifesto não deve repetir caminhos');
  assert.equal(manifest.files.filter(file => file.path.includes('/visual-context/')).length, 24);
  for (const [slug, width] of [['contato', 343], ['faq', 347]]) {
    const capture = manifest.files.find(file => file.path.includes(`/visual-context/${slug}/`)
      && file.path.endsWith('-320-day-full.png'));
    assert.ok(capture, `${slug}: captura full-page antes de 320px ausente`);
    assert.equal(capture.width, width, `${slug}: largura full-page não confirma o transbordo medido`);
  }

  const diskPngs = new Set();
  const visit = directory => {
    for (const entry of readdirSync(new URL(`${directory}/`, root), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith('.png')) diskPngs.add(path);
    }
  };
  visit(ownRoot);
  assert.deepEqual([...diskPngs].sort(), [...byPath.keys()].sort(), 'o manifesto cobre todos e somente os PNGs próprios');
  for (const file of manifest.files) {
    const image = readFileSync(new URL(file.path, root));
    assert.equal(image.subarray(1, 4).toString(), 'PNG', `${file.path}: assinatura PNG ausente`);
    assert.equal(image.length, file.bytes, `${file.path}: tamanho divergente`);
    assert.equal(createHash('sha256').update(image).digest('hex'), file.sha256, `${file.path}: SHA-256 divergente`);
    assert.equal(image.readUInt32BE(16), file.width, `${file.path}: largura divergente`);
    assert.equal(image.readUInt32BE(20), file.height, `${file.path}: altura divergente`);
    const dimensions = /-(320|390|768|1440)-(day|night)(-full)?\.png$/.exec(file.path);
    assert.ok(dimensions, `${file.path}: nome não identifica viewport/tema`);
    const viewportWidth = Number(dimensions[1]);
    const expectedHeight = { 320: 780, 390: 844, 768: 1024, 1440: 900 }[viewportWidth];
    if (dimensions[3]) {
      assert.ok(file.width >= viewportWidth, `${file.path}: full-page apagou a largura do documento`);
      assert.ok(file.height >= expectedHeight, `${file.path}: captura full-page menor que o viewport`);
    } else {
      assert.equal(file.width, viewportWidth, `${file.path}: largura não confere com o nome`);
      assert.equal(file.height, expectedHeight, `${file.path}: altura não confere com o viewport`);
    }
  }

  const jsonFiles = [];
  const visitJson = directory => {
    for (const entry of readdirSync(new URL(`${directory}/`, root), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) visitJson(path);
      else if (entry.isFile() && entry.name.endsWith('.json') && !path.endsWith('/integridade.json')) jsonFiles.push(path);
    }
  };
  visitJson(ownRoot);
  const screenshotRefs = [];
  const collectRefs = value => {
    if (Array.isArray(value)) for (const item of value) collectRefs(item);
    else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key === 'screenshot' && typeof child === 'string') screenshotRefs.push(child);
        collectRefs(child);
      }
    }
  };
  for (const file of jsonFiles) collectRefs(await read(file));
  assert.ok(screenshotRefs.length >= 136, 'os resumos e a revisão visual devem referenciar as capturas próprias');
  for (const path of screenshotRefs) {
    assert.ok(byPath.has(path), `${path}: referência não coberta pelo manifesto`);
    assert.ok(diskPngs.has(path), `${path}: referência sem PNG no disco`);
  }
});
