// UX-PRO-09E — regressão das correções do site público autorizadas após o 09B.
//
// O que este arquivo PROVA, lido direto do código vigente (sem navegador):
//  1. que os quatro papéis de cor do widget RAG no escopo público resolvem
//     >=4,5:1 contra o fundo em que cada um é pintado, e que os três escopos
//     privados seguem com as cores exatas de antes (a correção não vaza);
//  2. que as quatro regras do simulador usam o token próprio da página e que a
//     razão medida contra o fundo real passa de 4,5:1;
//  3. que os dois blocos que estouravam o documento a 320 px carregam a regra
//     de quebra de palavra E continuam com o mesmo conteúdo (nada foi hiding
//     para "resolver" o overflow);
//  4. que nenhuma superfície pública ganhou gancho de tema nesta fatia;
//  5. que a matriz de evidência versionada é íntegra e conta o antes/depois.
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

test('UX-PRO-09E PU2: o escopo público do widget resolve >=4,5:1 nos quatro papéis medidos', () => {
  const publico = ragColors().publico;
  // Os papéis são os que o probe do 09B amostrou em /contato, com o fundo em que
  // cada um é realmente pintado: título sobre o cartão, sugestões sobre o branco
  // do controle, pílula de escopo sobre `light` e o texto branco do botão.
  const widget = source('src/components/RagWidget.tsx');
  const contrastColor = /--rag-accent-contrast":\s*"(#[0-9a-f]{3,6})"/i.exec(widget)?.[1];
  assert.ok(contrastColor, 'o contraste do texto sobre o acento precisa continuar vindo de --rag-accent-contrast');
  const cases = [
    ['título (accent sobre o cartão)', ratio(publico.accent, publico.bg)],
    ['sugestões (accent sobre o controle)', ratio(publico.accent, '#ffffff')],
    ['pílula de escopo (accent sobre light)', ratio(publico.accent, publico.light)],
    ['botão de envio (texto sobre accent)', ratio(contrastColor, publico.accent)],
  ];
  for (const [name, value] of cases) assert.ok(value >= MIN, `${name}: ${value}:1 < ${MIN}:1`);
  assert.equal(ratio(publico.border, publico.bg) >= 3, true, 'borda do cartão mantém 3:1 de não-texto');
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
  // Fundo e pílula do público são identidade, não alvo do reparo: preservados.
  assert.equal(scopes.publico.bg, '#fff7ed');
  assert.equal(scopes.publico.light, '#ffedd5');
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

test('UX-PRO-09E PU3: as quatro regras do simulador passam pelo token da página e resolvem >=4,5:1', () => {
  const muted = /\.page[\s\S]*?--muted:\s*(#[0-9a-f]{6})/.exec(source('src/app/simulador/Simulator.module.css'))[1].toLowerCase();
  const cases = [
    ['rótulo das etapas', '.steps li', '#ffffff'],
    ['número da etapa', '.steps li span', '#eef4fa'],
    ['introdução do resumo', '.asideIntro', '#ffffff'],
    ['resumo vazio', '.summaryEmpty', '#ffffff'],
  ];
  for (const [name, selector, paintedOn] of cases) {
    const rule = simulatorRule(selector);
    assert.equal(rule.declarations.color, 'var(--muted)', `${name}: esperava o token --muted da própria página, veio ${rule.declarations.color}`);
    const value = ratio(muted, paintedOn);
    assert.ok(value >= MIN, `${name}: ${value}:1 sobre ${paintedOn} < ${MIN}:1`);
  }
  assert.equal(muted, '#5a7189', '--muted é token compartilhado: mudou, o gate inteiro do público precisa ser relido');
});

test('UX-PRO-09E PU1: os dois blocos que estouravam o documento a 320 px quebram a palavra e mantêm o conteúdo', () => {
  const contato = source('src/app/contato/page.tsx');
  const faq = source('src/app/faq/page.tsx');
  const EMAIL = 'contato@gruposegsystemseguranca.com.br';

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

test('UX-PRO-09E: a evidência versionada bate a contagem, as dimensões e o antes/depois', async () => {
  const read = async dir => JSON.parse(await readFile(new URL(dir, root), 'utf8'));
  const before = {};
  const after = {};
  const slugs = ['home', 'contato', 'conteudos', 'conteudo-dinamico', 'faq', 'orcamento', 'pacotes', 'privacidade',
    'aceite-token-sintetico-invalido', 'segmentos', 'segmento-condominio', 'servicos', 'servico-seguranca-desarmada', 'simulador'];
  for (const slug of slugs) {
    before[slug] = await read(`docs/UX-PRO-09E-evidencias-2026-10-16/antes/${slug}/resumo.json`);
    after[slug] = await read(`docs/UX-PRO-09E-evidencias-2026-10-16/${slug}/resumo.json`);
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
  assert.equal(a.entries, 112, 'antes: 14 rotas × 4 larguras × 2 preferências');
  assert.equal(a.under, 104, 'o ANTES precisa reproduzir os 104 registros do diagnóstico 09B');
  assert.equal(a.overflow, 4, 'o ANTES precisa reproduzir as 4 capturas com overflow do 09B (/contato e /faq, day e night)');
  assert.equal(b.entries, 112, 'depois: 14 rotas × 4 larguras × 2 preferências');
  assert.equal(b.samples, a.samples, 'depois: o universo de amostras não pode encolher — menos amostra não é melhoria');
  assert.equal(b.resolved, a.resolved, 'depois: o fundo resolvido tem de ser o mesmo conjunto; esconder texto não resolve contraste');
  assert.equal(b.under, 0, `depois: ${b.under} amostras continuam abaixo de 4,5:1`);
  assert.equal(b.overflow, 0, 'depois: ainda há documento com rolagem horizontal');

  // PNG: cada captura referenciada existe, cada arquivo do disco está referenciado,
  // e a largura/altura gravadas no IHDR são as do viewport declarado.
  for (const [summaries, dir] of [[before, 'docs/UX-PRO-09E-evidencias-2026-10-16/antes'], [after, 'docs/UX-PRO-09E-evidencias-2026-10-16']]) {
    for (const slug of slugs) {
      const referenced = new Set();
      for (const entry of summaries[slug].entries) {
        referenced.add(entry.screenshot);
        const png = await readFile(new URL(entry.screenshot, root));
        assert.equal(png.subarray(1, 4).toString(), 'PNG', `${entry.screenshot}: assinatura PNG ausente`);
        const [declaredWidth, declaredHeight] = entry.viewport.split('x').map(Number);
        const expected = { 320: 780, 390: 844, 768: 1024, 1440: 900 }[declaredWidth];
        assert.equal(declaredHeight, expected, `${entry.screenshot}: viewport declarado com altura improvável`);
        assert.equal(png.readUInt32BE(16), declaredWidth, `${entry.screenshot}: largura ${png.readUInt32BE(16)} ≠ viewport ${declaredWidth}`);
        assert.equal(png.readUInt32BE(20), expected, `${entry.screenshot}: altura ${png.readUInt32BE(20)} ≠ altura declarada ${expected}`);
      }
      const onDisk = new Set(readdirSync(new URL(`${dir}/${slug}`, root)).filter(name => name.endsWith('.png')).map(name => `${dir}/${slug}/${name}`));
      assert.deepEqual([...referenced].filter(item => !onDisk.has(item)), [], `${dir}/${slug}: captura referenciada sem arquivo`);
      assert.deepEqual([...onDisk].filter(item => !referenced.has(item)), [], `${dir}/${slug}: PNG órfão em disco`);
    }
  }

  // O sinal de que a preferência de cor não mudou de comportamento: nas rotas em
  // escopo, day e night continuam sendo a mesma pintura, antes e depois.
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
