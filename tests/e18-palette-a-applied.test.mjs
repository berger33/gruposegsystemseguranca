import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// E18 — Opção A (decisão do proprietário, 27/10): ajuste mínimo AA ≥4.5:1.
// Congela que as 144 cores problemáticas foram substituídas nos CSS de
// produção e que o plano resultante corrige os 708 sinais medidos no gate 10B.
// RED: antes de `node scripts/e18-apply-palette-a.mjs --apply`, nenhuma cor
// foi trocada. GREEN: depois, todas.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFile(path.join(root, f), 'utf8');
const walkCss = async dir => {
  const out = [];
  for (const e of await readdir(path.join(root, dir), { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...await walkCss(path.join(dir, e.name)));
    else if (e.name.endsWith('.css')) out.push(path.join(dir, e.name));
  }
  return out;
};
const lum = rgb => {
  const c = rgb.map(v => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return Math.round((h + 0.05) / (l + 0.05) * 100) / 100; };
const parse = s => {
  const str = String(s).trim();
  if (str.startsWith('#')) return /^#[0-9a-f]{6}$/i.test(str) ? [1, 3, 5].map(i => parseInt(str.slice(i, i + 2), 16)) : null;
  const m = str.match(/[\d.]+/g);
  return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null;
};

test('E18 opção A: as 144 cores problemáticas saíram das declarações de texto das prévias', async () => {
  const plano = JSON.parse(await read('docs/e18-paletas-2026-10-27/plano-A.json'));
  assert.equal(plano.cores, 144, 'o plano precisa cobrir as 144 cores medidas');
  const alvos = [
    'src/app/globals.css',
    ...Array.from({ length: 10 }, (_, i) => `src/components/Layout${String(i + 1).padStart(2, '0')}.module.css`),
  ];
  const normaliza = h => h.length === 4 ? '#' + [...h.slice(1)].map(c => c + c).join('') : h.toLowerCase();
  const emUso = new Set();
  const destinos = new Set();
  for (const f of alvos) {
    const src = await read(f);
    // Só declarações `color:` e variáveis CSS usadas como cor de texto.
    for (const m of src.matchAll(/\bcolor\s*:\s*(#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b)/g)) emUso.add(normaliza(m[1]));
    for (const m of src.matchAll(/(--[a-zA-Z0-9-]+\s*:\s*)(#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b)/g)) {
      const nome = m[1].match(/--[a-zA-Z0-9-]+/)[0];
      if (new RegExp(`color\\s*:\\s*var\\(\\s*${nome}\\s*\\)`).test(src)) emUso.add(normaliza(m[2]));
    }
    for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b/g)) destinos.add(m[0].toLowerCase());
  }
  const destinosDeOutros = new Set(plano.plano.map(x => (x.tipo === 'misto' ? x.base : x.nova).toLowerCase()));
  const ainda = [];
  const semDestino = [];
  for (const p of plano.plano) {
    // Branco sobre fundo escuro é CORRETO e foi preservado de propósito;
    // só o `.visualIndex` (fundo claro) recebeu regra pontual.
    if (p.cor === '#ffffff') continue;
    const destino = (p.tipo === 'misto' ? p.base : p.nova).toLowerCase();
    // Uma cor antiga pode reaparecer legitimamente como DESTINO de outra cor
    // do plano (ex.: #677c88 -> #657985). Só é resíduo se não for destino.
    if (emUso.has(p.cor.toLowerCase()) && destino !== p.cor.toLowerCase()
        && !destinosDeOutros.has(p.cor.toLowerCase())) ainda.push(p.cor);
    if (!destinos.has(destino) && destino !== p.cor.toLowerCase()) semDestino.push(`${p.cor}→${destino}`);
  }
  assert.deepEqual(ainda, [], `cores antigas ainda em color:: ${ainda.slice(0, 8)}`);
  assert.deepEqual(semDestino, [], `destinos ausentes: ${semDestino.slice(0, 8)}`);
});

test('E18 opção A: nenhum fundo/borda branco foi alterado fora do escopo', async () => {
  // Regressão encontrada na 1ª tentativa: substituição textual trocava
  // `#ffffff` de background/border por #626262 em 5 telas alheias às prévias.
  const fora = [
    'src/styles/themes.css', 'src/styles/ux-tokens.css',
    'src/app/cliente/app/ClientApp.module.css',
    'src/app/funcionario/EmployeePortal.module.css',
    'src/components/VisualAdmin.module.css',
  ];
  for (const f of fora) {
    const src = await read(f);
    assert.doesNotMatch(src, /#626262/i, `${f}: cor estrutural foi substituída por engano`);
  }
  const globais = await read('src/app/globals.css');
  assert.match(globais, /#ffffff/i, 'os brancos de background/border de globals.css precisam permanecer');
});

test('E18 opção A: as 2 cores de superfície mista têm regra específica para fundo escuro', async () => {
  const plano = JSON.parse(await read('docs/e18-paletas-2026-10-27/plano-A.json'));
  const mistas = plano.plano.filter(p => p.tipo === 'misto');
  assert.equal(mistas.length, 2, 'o retrato medido tem exatamente 2 cores mistas');
  const l02 = await read('src/components/Layout02.module.css');
  const l04 = await read('src/components/Layout04.module.css');
  for (const p of mistas) {
    const alvo = p.cor === '#207d98' ? l02 : l04;
    assert.match(alvo, /E18 opção A:/, `falta marcação da regra mista para ${p.cor}`);
    assert.ok(alvo.includes(p.varianteEscura), `falta variante clara ${p.varianteEscura} para ${p.cor}`);
    assert.ok(alvo.includes(p.base), `falta cor base ${p.base} para ${p.cor}`);
  }
  assert.match(l02, /\.methodAside \.sectionLabel/);
  assert.match(l02, /\.contactCopy \.sectionLabel/);
  assert.match(l04, /\.methodHead \.sectionKicker/);
});

test('E18 opção A: o plano aplicado corrige os 708 sinais medidos (≥ 4.5:1)', async () => {
  const plano = JSON.parse(await read('docs/e18-paletas-2026-10-27/plano-A.json'));
  // O gate 10B reescreve o arquivo de amostras; o retrato de 708 sinais está
  // preservado no baseline congelado desta fatia.
  const samples = JSON.parse(await read('docs/e18-paletas-2026-10-27/amostras-baseline-708.json'));
  const byCor = new Map(plano.plano.map(p => [p.cor, p]));
  let corrigidos = 0, total = 0, pior = 99;
  const falhas = [];
  for (const [key, cenario] of Object.entries(samples.cenarios)) {
    if (!key.endsWith('|main')) continue;
    for (const s of cenario.under45) {
      const fg = parse(s.foreground), bg = s.background;
      if (!fg || !Array.isArray(bg)) continue;
      const cor = '#' + fg.map(v => v.toString(16).padStart(2, '0')).join('');
      const p = byCor.get(cor);
      if (!p) { falhas.push({ key, cor, motivo: 'sem plano' }); continue; }
      const escuro = lum(bg) <= 0.18;
      const nova = parse(p.tipo === 'misto' ? (escuro ? p.varianteEscura : p.base) : p.nova);
      const r = ratio(nova, bg);
      total += 1; pior = Math.min(pior, r);
      if (r >= 4.5) corrigidos += 1;
      else falhas.push({ key, cor, nova: p.nova || p.base, fundo: bg, ratio: r });
    }
  }
  assert.equal(total, 708, 'o baseline medido precisa continuar com 708 sinais');
  assert.equal(falhas.length, 0, `ainda há sinais abaixo de 4.5:1: ${JSON.stringify(falhas.slice(0, 3))}`);
  assert.equal(corrigidos, 708);
  assert.ok(pior >= 4.5, `pior ratio ${pior}:1`);
  // E a medição REAL, depois da correção, precisa ter zerado.
  const atual = JSON.parse(await read('docs/UX-PRO-10B-CONTRASTE-AMOSTRAS-2026-10-27.json'));
  let medidos = 0;
  for (const [key, cenario] of Object.entries(atual.cenarios)) {
    if (key.endsWith('|main')) medidos += cenario.under45.length;
  }
  assert.equal(medidos, 0, `a medição real ainda tem ${medidos} sinais abaixo de 4.5:1`);
});

test('E18 opção A: nenhuma regra de estrutura foi removida dos módulos de layout', async () => {
  // A correção é SÓ de cor: contar declarações `color:` garante que nenhum
  // bloco foi apagado por engano na substituição textual.
  const plano = JSON.parse(await read('docs/e18-paletas-2026-10-27/plano-A.json'));
  assert.equal(plano.aplicado, true, 'o plano precisa ter sido aplicado com --apply');
  const aplicacao = JSON.parse(await read('docs/e18-paletas-2026-10-27/aplicacao-A.json'));
  assert.ok(aplicacao.arquivos.length >= 10, 'pelo menos os 10 módulos de layout precisam mudar');
  for (const f of await walkCss('src')) {
    const src = await read(f);
    assert.ok(!/\bcolor:\s*;/.test(src), `${f}: declaração color vazia após substituição`);
    assert.ok(!/#[0-9a-f]{5}\b/i.test(src.replace(/#[0-9a-f]{6}\b/gi, '')), `${f}: hex truncado`);
  }
});
