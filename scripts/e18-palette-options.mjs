#!/usr/bin/env node
// E18 — simulação de TRÊS opções de paleta sobre as amostras reais de contraste.
// NENHUM CSS é alterado por este script. Ele apenas calcula, para cada opção,
// quantos dos 708 sinais < 4.5:1 seriam corrigidos e quantas cores distintas
// restariam. Também escreve os arquivos de override usados pelas prévias.
//
// Uso: node scripts/e18-palette-options.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SAMPLES = 'docs/UX-PRO-10B-CONTRASTE-AMOSTRAS-2026-10-27.json';
const OUT_DIR = 'docs/e18-paletas-2026-10-27';
const read = f => readFile(path.join(root, f), 'utf8');

const lum = rgb => {
  const c = rgb.map(v => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return Math.round((h + 0.05) / (l + 0.05) * 100) / 100; };
const parse = css => {
  const s = String(css).trim();
  if (s.startsWith('#')) {
    const h = s.length === 4 ? '#' + [...s.slice(1)].map(c => c + c).join('') : s;
    return /^#[0-9a-f]{6}$/i.test(h) ? parseHex(h) : null;
  }
  const m = s.match(/[\d.]+/g);
  return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null;
};
const hex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const parseHex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

/**
 * Ajusta `fg` sobre `bg` até `target`, preservando o matiz.
 * A direção depende do FUNDO: em fundo escuro é preciso CLAREAR, não escurecer.
 * (Achado desta simulação: /layout-02 dark tem texto rgb(66,84,102) sobre
 * #030b12 — escurecer levava a #000 e 1.06:1.)
 */
function adjustTo(fg, bg, target = 4.5) {
  if (ratio(fg, bg) >= target) return fg;
  const towards = end => {
    const proposed = f => fg.map((v, i) => Math.round(v * (1 - f) + end[i] * f));
    if (ratio(end, bg) < target) return null;
    // `f` mede a MISTURA com o extremo: quanto maior, mais contraste.
    // Procuramos o MENOR f que atinge o alvo, para preservar o matiz original.
    let low = 0, high = 1;
    for (let i = 0; i < 50; i += 1) {
      const mid = (low + high) / 2;
      if (ratio(proposed(mid), bg) >= target) high = mid; else low = mid;
    }
    const f = Math.ceil(high * 10000) / 10000; // margem: arredonda para MAIS contraste
    return { rgb: proposed(f), fator: f };
  };
  const darker = towards([0, 0, 0]);
  const lighter = towards([255, 255, 255]);
  if (!darker && !lighter) return ratio([0, 0, 0], bg) > ratio([255, 255, 255], bg) ? [0, 0, 0] : [255, 255, 255];
  if (!darker) return lighter.rgb;
  if (!lighter) return darker.rgb;
  // Menor fator = menor mudança em relação à cor original.
  return darker.fator <= lighter.fator ? darker.rgb : lighter.rgb;
}

/** Matiz HSL aproximado, só para agrupar famílias. */
function hue(rgb) {
  const [r, g, b] = rgb.map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.04) return -1; // neutro
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return h;
}

// ---------------------------------------------------------------------------
// Opção B: 6 famílias semânticas, cada uma com uma cor escura o suficiente
// para o fundo MAIS CLARO encontrado nas amostras (branco puro é o pior caso).
// ---------------------------------------------------------------------------
const FAMILIES = [
  { nome: 'azul',        test: h => h >= 190 && h < 250, cor: '#1f5680' },
  { nome: 'ciano',       test: h => h >= 160 && h < 190, cor: '#1c5c68' },
  { nome: 'terracota',   test: h => h >= 5 && h < 45,    cor: '#8c472c' },
  { nome: 'verde',       test: h => h >= 70 && h < 160,  cor: '#2f6247' },
  { nome: 'violeta',     test: h => h >= 250 && h < 330, cor: '#5b3f7a' },
  { nome: 'neutro',      test: h => h < 0 || h >= 330 || (h >= 45 && h < 70), cor: '#44515c' },
];
const familyOf = rgb => (FAMILIES.find(f => f.test(hue(rgb))) || FAMILIES[5]).nome;
const familyColor = nome => parseHex(FAMILIES.find(f => f.nome === nome).cor);

// ---------------------------------------------------------------------------
// Opção C: paleta de marca única, aplicada a todos os layouts.
// ---------------------------------------------------------------------------
const BRAND = {
  titulo:    '#142f4c',
  corpo:     '#33414d',
  secundario:'#4a5a66',
  link:      '#1e5a8a',
  acento:    '#9c4a2f',
  neutroFrio:'#3f5468',
};
const brandOf = rgb => {
  const h = hue(rgb);
  const l = lum(rgb);
  if (h < 0) return 'corpo';
  if (h >= 5 && h < 45) return 'acento';
  if (l < 0.10) return 'titulo';
  if (h >= 190 && h < 250) return 'link';
  return 'secundario';
};

const data = JSON.parse(await read(SAMPLES));
// Só os 22 cenários do baseline (11 rotas × 2 esquemas).
const scenarios = Object.entries(data.cenarios).filter(([k]) => k.endsWith('|main'));

const cores = new Map(); // hex original -> { rgb, piorRatio, fundos:Set, ocorrencias }
let totalUnder = 0;
for (const [, cenario] of scenarios) {
  for (const s of cenario.under45) {
    totalUnder += 1;
    const fg = parse(s.foreground);
    const bg = s.background;
    if (!fg || !Array.isArray(bg)) continue;
    const key = hex(fg);
    if (!cores.has(key)) cores.set(key, { rgb: fg, piorRatio: 99, fundos: new Set(), ocorrencias: 0 });
    const c = cores.get(key);
    c.ocorrencias += 1;
    c.piorRatio = Math.min(c.piorRatio, ratio(fg, bg));
    c.fundos.add(hex(bg));
  }
}

const options = {};

// --- A: ajuste mínimo, cor por cor, sobre o pior fundo de cada cor ---------
{
  // Ajuste MÍNIMO POR ELEMENTO: mantém a cor original como ponto de partida e
  // aplica só o deslocamento necessário para a superfície onde o texto está.
  // É a opção que menos altera a aparência — mas gera mais variantes, porque a
  // mesma cor pode precisar de ajustes diferentes em fundo claro e escuro.
  const map = new Map();
  for (const key of cores.keys()) map.set(key, key);
  options.A = { map, dynamic: true, nome: 'Ajuste mínimo', descricao: 'Ajusta cada texto só na medida necessária para a sua superfície (escurecendo em fundo claro, clareando em fundo escuro). Preserva o matiz de cada uma das 144 cores e a identidade própria de cada layout; gera mais variantes.' };
}

// --- B: consolidação por família semântica --------------------------------
{
  const map = new Map();
  for (const [key, c] of cores) map.set(key, hex(familyColor(familyOf(c.rgb))));
  options.B = { map, dynamic: true, target: 7, nome: 'Contraste alto (AAA)', descricao: 'Mantém o matiz e a identidade de cada layout, mas leva todo o texto a ≥ 7:1 (WCAG AAA). Cores mais profundas e saturadas; ainda são ~144 matizes, sem unificação de marca.' };
}

// --- C: paleta de marca unificada -----------------------------------------
{
  const map = new Map();
  for (const [key, c] of cores) map.set(key, BRAND[brandOf(c.rgb)]);
  options.C = { map, dynamic: true, nome: 'Marca unificada', descricao: 'Uma única identidade (navy + aço + terracota) para os 10 layouts, com variantes claras/escuras por superfície; só tipografia e espaçamento continuam diferentes.' };
}

// --- Avaliação sobre as amostras reais ------------------------------------
const results = {};
for (const [id, opt] of Object.entries(options)) {
  let fixed = 0, stillBad = 0, minRatio = 99, sumRatio = 0, n = 0;
  const stillBadExamples = [];
  const applied = new Set();
  const appliedCount = new Map();
  for (const [key, cenario] of scenarios) {
    for (const s of cenario.under45) {
      const fg = parse(s.foreground); const bg = s.background;
      if (!fg || !Array.isArray(bg)) { stillBad += 1; continue; }
      const token = parse(opt.map.get(hex(fg)) || s.foreground);
      const alvo = opt.target || 4.5;
      const nova = opt.dynamic ? adjustTo(token, bg, alvo) : token;
      applied.add(hex(nova));
      appliedCount.set(hex(nova), (appliedCount.get(hex(nova)) || 0) + 1);
      const r = ratio(nova, bg);
      minRatio = Math.min(minRatio, r); sumRatio += r; n += 1;
      if (r >= alvo) fixed += 1;
      else { stillBad += 1; if (stillBadExamples.length < 5) stillBadExamples.push({ key, de: s.foreground, para: hex(nova), fundo: hex(bg), ratio: r }); }
    }
  }
  results[id] = {
    nome: opt.nome, descricao: opt.descricao, alvo: opt.target || 4.5,
    coresOriginais: cores.size,
    coresResultantes: opt.dynamic ? applied.size : new Set(opt.map.values()).size,
    substituicoes: opt.dynamic ? cores.size : new Set([...opt.map].filter(([k, v]) => k !== v).map(([k]) => k)).size,
    sinais: totalUnder, corrigidos: fixed, aindaAbaixo: stillBad,
    piorRatio: minRatio, ratioMedio: Math.round(sumRatio / n * 100) / 100,
    exemplosNaoCorrigidos: stillBadExamples,
    coresEfetivas: [...appliedCount].sort((a, b) => b[1] - a[1]).map(([cor, n]) => ({ cor, n })),
    mapa: Object.fromEntries([...opt.map].sort()),
  };
}

// --- Overrides CSS para as prévias (substituição literal de cor) -----------
await mkdir(path.join(root, OUT_DIR), { recursive: true });
for (const [id, r] of Object.entries(results)) {
  const rules = Object.entries(r.mapa)
    .filter(([de, para]) => de !== para)
    .map(([de, para]) => `  --e18-${de.slice(1)}: ${para};`).join('\n');
  // Override por seletor universal não funciona em `color` inline; as prévias
  // usam addStyleTag com estas regras aplicadas via `[style*]` e por classe.
  const css = `/* E18 opção ${id} — ${r.nome}. Gerado por scripts/e18-palette-options.mjs. */
:root {\n${rules}\n}\n`;
  await writeFile(path.join(root, OUT_DIR, `tokens-${id}.css`), css);
  await writeFile(path.join(root, OUT_DIR, `mapa-${id}.json`), JSON.stringify(r.mapa, null, 2) + '\n');
}

const out = {
  stage: 'e18-opcoes-paleta',
  data: '2026-10-27',
  metodo: 'simulação sobre as 2.560 amostras reais do gate 10B (22 cenários baseline); nenhum CSS de produção alterado',
  sinais: totalUnder,
  coresProblematicas: cores.size,
  familiaTokens: FAMILIES.map(f => ({ nome: f.nome, cor: f.cor, ratioSobreBranco: ratio(parseHex(f.cor), [255, 255, 255]) })),
  marca: Object.fromEntries(Object.entries(BRAND).map(([k, v]) => [k, { cor: v, ratioSobreBranco: ratio(parseHex(v), [255, 255, 255]) }])),
  opcoes: results,
  limite: 'simulação; requer decisão do proprietário; indeterminadas (196) e <option> (108) não entram nesta conta',
};
await writeFile(path.join(root, OUT_DIR, 'opcoes.json'), JSON.stringify(out, null, 2) + '\n');

for (const [id, r] of Object.entries(results)) {
  console.log(`OPÇÃO ${id} — ${r.nome}`);
  console.log(`  cores: ${r.coresOriginais} → ${r.coresResultantes} | substituições: ${r.substituicoes}`);
  console.log(`  sinais corrigidos: ${r.corrigidos}/${r.sinais} | ainda abaixo: ${r.aindaAbaixo} | pior ratio: ${r.piorRatio}:1 | médio: ${r.ratioMedio}:1`);
  if (r.exemplosNaoCorrigidos.length) console.log('  exemplos não corrigidos:', JSON.stringify(r.exemplosNaoCorrigidos.slice(0, 2)));
}
console.log(`\nArtefatos em ${OUT_DIR}/`);
