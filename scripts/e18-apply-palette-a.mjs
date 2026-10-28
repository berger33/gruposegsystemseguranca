#!/usr/bin/env node
// E18 — OPÇÃO A (decisão do proprietário em 27/10): ajuste mínimo AA ≥4.5:1.
// Gera o plano de substituição e aplica nos 10 Layout*.module.css.
//
// Estratégia: para cada uma das 144 cores problemáticas, calcula a MENOR
// alteração que atinge 4.5:1 sobre todos os fundos onde ela foi medida.
// 139 cores estão só em fundo claro, 3 só em fundo escuro e 2 em AMBOS —
// essas 2 recebem uma regra adicional, mais específica, para a superfície
// escura. Nenhuma regra de layout/estrutura é alterada.
//
// Uso: node scripts/e18-apply-palette-a.mjs [--apply|--revert]
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const OUT = path.join(root, 'docs/e18-paletas-2026-10-27');
const APPLY = process.argv.includes('--apply');
const REVERT = process.argv.includes('--revert');
const ALVO = 4.5;

// `#ffffff` NÃO pode ser substituído globalmente: é texto ótimo sobre os
// fundos escuros (headers, botões, rodapés) e só falha em UM lugar medido
// (`.visualIndex > span` sobre #d6e0e6). Mesmo problema para o hex com alpha
// `#b6e3ffb8`, que minha regex de 6 dígitos não alcança. Ambos viram regras
// pontuais, aplicadas só onde a medição real mostrou falha.
const PONTUAIS = [
  { arquivo: 'src/components/Layout05.module.css',
    marcador: '/* E18 opção A: texto branco sobre superfície clara do visualIndex. */',
    regra: '.visualIndex > span { color: #626262; }',
    de: '#ffffff', para: '#626262', fundo: [214, 224, 230], seletor: 'visualIndex' },
  { arquivo: 'src/components/Layout06.module.css',
    marcador: '/* E18 opção A: remove alpha do número decorativo para garantir 4.9:1. */',
    regra: '.artNumber { color: #b6e3ff; }',
    de: 'rgba(182, 227, 255, 0.72)', para: '#b6e3ff', fundo: [22, 79, 216], seletor: 'artNumber' },
];

if (REVERT) {
  // Desfaz EXATAMENTE o que --apply fez, sem `git checkout` (que apagaria
  // mudanças legítimas de outras fatias da sessão). Usa placeholders para
  // não confundir uma cor nova com uma cor original de outro par.
  const saved = JSON.parse(await readFile(path.join(OUT, 'plano-A.json'), 'utf8'));
  const walk = async d => {
    const out = [];
    for (const e of await readdir(path.join(root, d), { withFileTypes: true })) {
      if (e.isDirectory()) out.push(...await walk(path.join(d, e.name)));
      else if (e.name.endsWith('.css')) out.push(path.join(d, e.name));
    }
    return out;
  };
  const arquivos = await walk('src');
  let tocados = 0;
  for (const f of arquivos) {
    const original = await readFile(path.join(root, f), 'utf8');
    const linhas = original.split('\n');
    let s = linhas.filter((linha, i) =>
      !linha.startsWith('/* E18 opção A:') &&
      !(i > 0 && linhas[i - 1].startsWith('/* E18 opção A:'))).join('\n');
    const tokens = new Map();
    let i = 0;
    for (const p of saved.plano) {
      const destino = p.tipo === 'misto' ? p.base : p.nova;
      if (destino.toLowerCase() === p.cor.toLowerCase()) continue;
      const token = `__E18_REVERT_${i++}__`;
      tokens.set(token, p.cor);
      s = s.replace(new RegExp(destino, 'gi'), token);
    }
    for (const [token, cor] of tokens) s = s.split(token).join(cor);
    // Remove a linha em branco que sobrou antes da regra mista removida.
    s = s.replace(/\n{3,}$/, '\n');
    if (s !== original) { await writeFile(path.join(root, f), s); tocados += 1; }
  }
  console.log(`E18_REVERT_OK: ${tocados} arquivos restaurados`);
  process.exit(0);
}

const lum = rgb => {
  const c = rgb.map(v => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return Math.round((h + 0.05) / (l + 0.05) * 100) / 100; };
const parse = s => {
  const str = String(s).trim();
  if (str.startsWith('#')) {
    const h = str.length === 4 ? '#' + [...str.slice(1)].map(c => c + c).join('') : str;
    return /^#[0-9a-f]{6}$/i.test(h) ? parseHex(h) : null;
  }
  const m = str.match(/[\d.]+/g);
  return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null;
};
const hex = r => '#' + r.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const parseHex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

function adjustTo(fg, bg, target = ALVO) {
  if (ratio(fg, bg) >= target) return fg;
  const towards = end => {
    const proposed = f => fg.map((v, i) => Math.round(v * (1 - f) + end[i] * f));
    if (ratio(end, bg) < target) return null;
    let low = 0, high = 1;
    for (let i = 0; i < 50; i += 1) {
      const mid = (low + high) / 2;
      if (ratio(proposed(mid), bg) >= target) high = mid; else low = mid;
    }
    const f = Math.ceil(high * 10000) / 10000;
    return { rgb: proposed(f), fator: f };
  };
  const d = towards([0, 0, 0]), l = towards([255, 255, 255]);
  if (!d && !l) return ratio([0, 0, 0], bg) > ratio([255, 255, 255], bg) ? [0, 0, 0] : [255, 255, 255];
  if (!d) return l.rgb;
  if (!l) return d.rgb;
  return d.fator <= l.fator ? d.rgb : l.rgb;
}

// O gate 10B REESCREVE o arquivo de amostras a cada execução. O plano precisa
// ser calculado sobre o BASELINE ORIGINAL (708 sinais), preservado antes da
// primeira aplicação — senão a 2ª execução calcularia o plano sobre as cores
// já corrigidas e perderia as cores originais.
const samples = JSON.parse(await readFile(path.join(root, 'docs/e18-paletas-2026-10-27/amostras-baseline-708.json'), 'utf8'));

// Agrupa, por cor, os fundos claros/escuros e os seletores de cada superfície.
const grupos = new Map();
for (const [key, cenario] of Object.entries(samples.cenarios)) {
  if (!key.endsWith('|main')) continue;
  for (const s of cenario.under45) {
    const fg = parse(s.foreground), bg = s.background;
    if (!fg || !Array.isArray(bg)) continue;
    const k = hex(fg);
    if (!grupos.has(k)) grupos.set(k, { rgb: fg, claros: [], escuros: [], selClaro: new Set(), selEscuro: new Set(), n: 0 });
    const g = grupos.get(k); g.n += 1;
    const escuro = lum(bg) <= 0.18;
    (escuro ? g.escuros : g.claros).push(bg);
    (escuro ? g.selEscuro : g.selClaro).add(s.selector);
  }
}

// Pior caso para texto ESCURO sobre fundo claro = o fundo MENOS claro
// (menor luminância). Para texto CLARO sobre fundo escuro = o fundo MAIS
// claro (maior luminância). A ordem é contrária ao que parece à primeira vista.
const pior = (fundos, maiorLuminancia) => fundos.slice().sort((a, b) => maiorLuminancia ? lum(b) - lum(a) : lum(a) - lum(b))[0];

const plano = [];
for (const [cor, g] of grupos) {
  if (g.claros.length && g.escuros.length) {
    plano.push({ cor, tipo: 'misto',
      base: hex(adjustTo(g.rgb, pior(g.claros, false))),
      varianteEscura: hex(adjustTo(g.rgb, pior(g.escuros, true))),
      fundosClaros: [...new Set(g.claros.map(hex))], fundosEscuros: [...new Set(g.escuros.map(hex))],
      seletoresClaros: [...g.selClaro], seletoresEscuros: [...g.selEscuro], amostras: g.n });
  } else if (g.claros.length) {
    plano.push({ cor, tipo: 'claro', nova: hex(adjustTo(g.rgb, pior(g.claros, false))),
      fundos: [...new Set(g.claros.map(hex))], amostras: g.n });
  } else {
    plano.push({ cor, tipo: 'escuro', nova: hex(adjustTo(g.rgb, pior(g.escuros, true))),
      fundos: [...new Set(g.escuros.map(hex))], amostras: g.n });
  }
}

// Validação do plano: simula TODAS as amostras com a substituição proposta.
let wouldFix = 0, stillBad = [];
for (const [key, cenario] of Object.entries(samples.cenarios)) {
  if (!key.endsWith('|main')) continue;
  for (const s of cenario.under45) {
    const fg = parse(s.foreground), bg = s.background;
    if (!fg || !Array.isArray(bg)) continue;
    const p = plano.find(x => x.cor === hex(fg));
    const pontual = PONTUAIS.find(x => String(s.foreground).startsWith('rgba') && x.de.startsWith('rgba')
      ? String(s.foreground).replace(/\s/g, '') === x.de.replace(/\s/g, '')
      : x.de === hex(fg) && String(s.selector).includes(x.seletor));
    let nova;
    if (pontual) nova = parseHex(pontual.para);
    else if (p.cor === '#ffffff') nova = fg; // branco intacto nos demais contextos
    else {
      const escuro = lum(bg) <= 0.18;
      nova = parse(p.tipo === 'misto' ? (escuro ? p.varianteEscura : p.base) : p.nova);
    }
    const r = ratio(nova, bg);
    if (r >= ALVO) wouldFix += 1;
    else stillBad.push({ key, cor: p.cor, nova: hex(nova), fundo: hex(bg), ratio: r });
  }
}
console.log(`E18_PLANO_A: ${plano.length} cores | ${wouldFix}/708 sinais corrigíveis | ${stillBad.length} ainda abaixo`);
if (stillBad.length) console.log(JSON.stringify(stillBad.slice(0, 8), null, 2));

// Onde cada cor aparece literalmente nos CSS de produção.
// Varre TODOS os CSS de src/: uma das 144 cores (#c76748) vive em
// src/app/globals.css, usada pela própria rota /layout-preview.
const walkCss = async dir => {
  const out = [];
  for (const e of await readdir(path.join(root, dir), { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...await walkCss(path.join(dir, e.name)));
    else if (e.name.endsWith('.css')) out.push(path.join(dir, e.name));
  }
  return out;
};
const cssFiles = (await walkCss('src')).sort();
const ocorrencias = new Map();
for (const f of cssFiles) {
  const source = await readFile(path.join(root, f), 'utf8');
  for (const p of plano) {
    const re = new RegExp(p.cor.replace('#', '#').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const n = (source.match(re) || []).length;
    if (n) {
      if (!ocorrencias.has(p.cor)) ocorrencias.set(p.cor, []);
      ocorrencias.get(p.cor).push({ arquivo: f, n });
    }
  }
}
const naoEncontradas = plano.filter(p => !ocorrencias.has(p.cor));
console.log(`E18_PLANO_A: cores encontradas literalmente: ${plano.length - naoEncontradas.length}/${plano.length}`);
if (naoEncontradas.length) console.log('  não encontradas:', naoEncontradas.map(p => p.cor).join(', '));

const relatorio = {
  stage: 'e18-opcao-a-plano', data: '2026-10-27',
  decisao: 'Opção A — Ajuste mínimo AA ≥4.5:1 (escolha do proprietário)',
  alvo: ALVO, sinais: 708, sinaisCorrigiveis: wouldFix, aindaAbaixo: stillBad,
  cores: plano.length, porTipo: {
    claro: plano.filter(p => p.tipo === 'claro').length,
    escuro: plano.filter(p => p.tipo === 'escuro').length,
    misto: plano.filter(p => p.tipo === 'misto').length,
  },
  ocorrencias: Object.fromEntries(ocorrencias), naoEncontradas: naoEncontradas.map(p => p.cor),
  plano,
  aplicado: APPLY,
  limite: 'simulação até --apply; indeterminadas (196) e <option> (108) fora do escopo',
};
await writeFile(path.join(OUT, 'plano-A.json'), JSON.stringify(relatorio, null, 2) + '\n');
console.log(`E18_PLANO_A: plano-A.json escrito (aplicado=${APPLY})`);

if (!APPLY) { console.log('E18_PLANO_A: modo simulação; rode com --apply para alterar os CSS.'); process.exit(0); }
if (stillBad.length) { console.error('E18_PLANO_A: recusa aplicar — plano não corrige 708/708'); process.exit(1); }

// Aplicação SEGURA: mexe APENAS em declarações `color:` dos arquivos das
// prévias. A primeira tentativa (substituição textual de qualquer hex) trocava
// `#ffffff` de backgrounds/bordas por `#626262` em telas fora do escopo —
// revertido por git e corrigido aqui. Nenhuma outra propriedade é tocada.
const ARQUIVOS_ALVO = new Set([
  'src/app/globals.css', // #c76748, usado pela própria rota /layout-preview
  ...Array.from({ length: 10 }, (_, i) => `src/components/Layout${String(i + 1).padStart(2, '0')}.module.css`),
]);
const normaliza = h => {
  const v = h.toLowerCase();
  return v.length === 4 ? '#' + [...v.slice(1)].map(c => c + c).join('') : v;
};
const corPorHex = new Map(plano.map(p => [p.cor.toLowerCase(), p]));
const regrasMistas = {
  'Layout02.module.css': p => `\n/* E18 opção A: ${p.cor} também aparece em superfícies escuras. */\n.methodAside .sectionLabel, .contactCopy .sectionLabel { color: ${p.varianteEscura}; }\n`,
  'Layout04.module.css': p => `\n/* E18 opção A: ${p.cor} também aparece em superfície escura. */\n.methodHead .sectionKicker { color: ${p.varianteEscura}; }\n`,
};
const alterados = [];
const naoAplicadas = [];
for (const f of [...ARQUIVOS_ALVO].sort()) {
  let source = await readFile(path.join(root, f), 'utf8');
  const original = source;
  let mudancas = 0;
  const vistas = new Set();
  // Casa `color: #abc123` (3 ou 6 dígitos), preservando !important e o resto.
  source = source.replace(/(\bcolor\s*:\s*)(#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b)/g, (m, prefixo, corHex) => {
    const chave = normaliza(corHex);
    const p = corPorHex.get(chave);
    if (!p) return m; // cor não medida: intacta
    if (chave === '#ffffff') return m; // tratada por regra pontual (PONTUAIS)
    vistas.add(chave);
    const destino = p.tipo === 'misto' ? p.base : p.nova;
    if (destino.toLowerCase() === chave) return m;
    mudancas += 1;
    return prefixo + destino;
  });
  // Variáveis CSS usadas como cor de TEXTO (ex.: `--muted: #66727b` com
  // `color: var(--muted)`). Só troca quando a variável é realmente usada em
  // `color:` — fundos como `--paper`/`--white` permanecem intactos.
  source = source.replace(/(--[a-zA-Z0-9-]+\s*:\s*)(#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b)/g, (m, prefixo, corHex) => {
    const chave = normaliza(corHex);
    const p = corPorHex.get(chave);
    if (!p) return m;
    if (chave === '#ffffff' || chave === '#fffefa') return m; // branco: só regra pontual
    const nome = prefixo.match(/--[a-zA-Z0-9-]+/)[0];
    if (!new RegExp(`color\\s*:\\s*var\\(\\s*${nome}\\s*\\)`).test(source)) return m;
    vistas.add(chave);
    const destino = p.tipo === 'misto' ? p.base : p.nova;
    if (destino.toLowerCase() === chave) return m;
    mudancas += 1;
    return prefixo + destino;
  });
  for (const pt of PONTUAIS.filter(x => x.arquivo === f)) {
    // Caso alpha: substituir a declaração original na própria linha.
    if (pt.de.startsWith('rgba')) {
      const reHex8 = /#b6e3ffb8/gi;
      if (reHex8.test(source)) { source = source.replace(reHex8, pt.para); mudancas += 1; }
    }
    if (source.includes(pt.marcador)) continue;
    source += `\n${pt.marcador}\n${pt.regra}\n`;
    mudancas += 1;
  }
  for (const p of plano.filter(x => x.tipo === 'misto')) {
    const fn = regrasMistas[path.basename(f)];
    if (!fn || !ocorrencias.get(p.cor)?.some(o => o.arquivo === f)) continue;
    const classe = f.includes('Layout02') ? 'methodAside' : 'methodHead';
    if (!source.includes(`.${classe}`)) throw new Error(`classe .${classe} ausente em ${f}`);
    if (source.includes('E18 opção A:')) continue;
    source += fn(p);
    mudancas += 1;
  }
  for (const p of plano) if (!vistas.has(p.cor.toLowerCase())) naoAplicadas.push({ arquivo: f, cor: p.cor });
  if (source !== original) {
    await writeFile(path.join(root, f), source);
    alterados.push({ arquivo: f, substituicoes: mudancas });
  }
}
console.log('E18_PLANO_A: arquivos alterados:', JSON.stringify(alterados, null, 2));
// Garante que TODA cor do plano foi trocada em PELO MENOS um arquivo alvo.
const aplicadas = new Set();
for (const f of ARQUIVOS_ALVO) {
  const src = await readFile(path.join(root, f), 'utf8');
  for (const match of src.matchAll(/(?:\bcolor\s*:\s*|--[a-zA-Z0-9-]+\s*:\s*)(#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b)/g)) {
    aplicadas.add(normaliza(match[1]));
  }
}
const faltando = plano.filter(p => {
  const destino = (p.tipo === 'misto' ? p.base : p.nova).toLowerCase();
  return !aplicadas.has(destino) && destino !== p.cor.toLowerCase();
});
console.log(`E18_PLANO_A: cores com destino presente nos CSS alvo: ${plano.length - faltando.length}/${plano.length}`);
if (faltando.length) console.log('  faltando:', faltando.map(p => `${p.cor}→${p.nova || p.base}`).join(', '));
await writeFile(path.join(OUT, 'aplicacao-A.json'), JSON.stringify({
  stage: 'e18-opcao-a-aplicada', data: '2026-10-27', alvo: ALVO,
  decisao: relatorio.decisao,
  escopo: 'apenas declarações color: nos 10 Layout*.module.css + src/app/globals.css',
  arquivos: alterados, cores: plano.length, sinaisCorrigiveis: wouldFix,
  coresSemDestino: faltando.map(p => p.cor),
}, null, 2) + '\n');
