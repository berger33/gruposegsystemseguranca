#!/usr/bin/env node
// E18 — prévias visuais das 3 opções de paleta + estado atual.
// Gera um HTML autocontido e captura PNGs com Chromium real. As cores são as
// MESMAS calculadas em scripts/e18-palette-options.mjs sobre as amostras reais;
// nenhum CSS de produção é alterado por este script.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';

const root = path.resolve(import.meta.dirname, '..');
const OUT = path.join(root, 'docs/e18-paletas-2026-10-27');
const data = JSON.parse(await readFile(path.join(OUT, 'opcoes.json'), 'utf8'));

const lum = rgb => {
  const c = rgb.map(v => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return Math.round((h + 0.05) / (l + 0.05) * 100) / 100; };
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = css => {
  const m = String(css).match(/[\d.]+/g);
  if (!m || m.length < 3) return '#33414d';
  return '#' + m.slice(0, 3).map(v => Number(v).toString(16).padStart(2, '0')).join('');
};

const WHITE = [255, 255, 255];
const PAPER = [246, 248, 250];
const DARK = [17, 24, 39];

// Estado atual: cores problemáticas reais extraídas das amostras (top pares).
const atual = JSON.parse(await readFile(path.join(root, 'docs/UX-PRO-10B-CONTRASTE-INVENTARIO-2026-10-27.json'), 'utf8'));
const atuais = atual.causas.abaixo45.pares.slice(0, 8).map(p => toHex(p.foreground));

const top = id => data.opcoes[id].coresEfetivas.slice(0, 14).map(x => x.cor);
const todas = id => data.opcoes[id].coresEfetivas.map(x => x.cor);
const palette = (id, i, fundo = WHITE) => {
  const cores = top(id);
  const candidatas = cores.length ? cores : ['#33414d'];
  const escolhida = candidatas[i % candidatas.length];
  return { cor: escolhida, ratio: ratio(rgb(escolhida), fundo) };
};

const PANELS = [
  {
    id: 'ANTES', titulo: 'Hoje (sem correção)', alvo: '—',
    subtitulo: '144 cores com contraste insuficiente',
    nota: '708 sinais abaixo de 4.5:1',
    cores: atuais, todas: atuais, ratioMedio: 3.34, distintas: 144,
    fixo: true,
  },
  {
    id: 'A', titulo: 'Opção A — Ajuste mínimo', alvo: '≥ 4.5:1 (AA)',
    subtitulo: 'Mesma identidade, só o ajuste necessário',
    nota: '708/708 corrigidos · 158 variantes',
    cores: top('A'), todas: todas('A'), ratioMedio: data.opcoes.A.ratioMedio, distintas: data.opcoes.A.coresResultantes,
  },
  {
    id: 'B', titulo: 'Opção B — Contraste alto (AAA)', alvo: '≥ 7:1 (AAA)',
    subtitulo: 'Cores profundas, matizes preservados',
    nota: '704/708 a 7:1 · 4 exigem clarear o fundo',
    cores: top('B'), todas: todas('B'), ratioMedio: data.opcoes.B.ratioMedio, distintas: data.opcoes.B.coresResultantes,
  },
  {
    id: 'C', titulo: 'Opção C — Marca unificada', alvo: '≥ 4.5:1 (AA)',
    subtitulo: 'Navy + aço + terracota em todos os layouts',
    nota: '708/708 corrigidos · 10 variantes de 4 tokens',
    cores: top('C'), todas: todas('C'), ratioMedio: data.opcoes.C.ratioMedio, distintas: data.opcoes.C.coresResultantes,
  },
];

function swatch(cor, fundo, label) {
  const r = ratio(rgb(cor), fundo);
  const ok = r >= 4.5;
  return `<span class="sw" style="color:${cor};background:rgb(${fundo.join(',')})">${label} <b class="${ok ? 'ok' : 'bad'}">${r}:1</b></span>`;
}

function panel(p) {
  const c = i => p.cores[i % p.cores.length];
  const r = (i, f = WHITE) => ratio(rgb(c(i)), f);
  const accent = c(0);
  const accent2 = p.cores.find(x => rgb(x)[0] > rgb(x)[2] + 20) || c(1);
  const darkText = p.fixo ? c(2) : '#f1f5f9';
  // As opções dinâmicas geram variantes CLARAS para superfícies escuras e
  // variantes ESCURAS para superfícies claras. Medir uma variante clara sobre
  // branco daria um badge vermelho enganoso — separar por luminância.
  const base = p.todas || p.cores;
  // PAPER (#f6f8fa) é ligeiramente mais escuro que o branco: é o pior caso
  // entre as duas superfícies claras. Filtrar por ele evita badge vermelho.
  const escuras = base.filter(x => ratio(rgb(x), PAPER) >= (p.fixo ? 0 : 4.5));
  const claras = base.filter(x => ratio(rgb(x), DARK) >= 4.5);
  const sobreClaro = (p.fixo ? p.cores : (escuras.length ? escuras : p.cores));
  const sobreEscuro = claras.length ? claras : base.slice(-4);
  return `
<section class="panel" id="painel-${p.id}">
  <header class="panel-head">
    <div class="eyebrow">${p.id === 'ANTES' ? 'ESTADO ATUAL' : 'PROPOSTA ' + p.id}</div>
    <h2>${p.titulo}</h2>
    <p class="sub">${p.subtitulo}</p>
    <div class="meta"><span>Alvo <b>${p.alvo}</b></span><span>Ratio médio <b>${p.ratioMedio}:1</b></span><span>Cores <b>${p.distintas}</b></span></div>
    <div class="nota">${p.nota}</div>
  </header>

  <div class="site">
    <div class="topbar"><span>GRUPO SEG · SEGURANÇA ELETRÔNICA</span><span>Atendimento 24h</span></div>
    <nav class="nav"><strong>SegSystem</strong><span>Serviços</span><span>Segmentos</span><span>Sobre</span><a style="color:${accent}">Contato</a></nav>

    <div class="hero">
      <div class="kicker" style="color:${accent2}">MONITORAMENTO INTELIGENTE</div>
      <h1>Proteção que <em style="color:${accent}">nunca dorme</em>.</h1>
      <p style="color:${c(1)}">Câmeras, alarmes e controle de acesso integrados em uma única plataforma, com resposta humana em minutos.</p>
      <div class="cta"><button style="background:${accent}">Solicitar proposta</button><a style="color:${c(3)}">Conhecer serviços →</a></div>
      <div class="assina" style="color:${c(4)}"><b>4.200+</b> unidades monitoradas · <b>18</b> anos de operação</div>
    </div>

    <div class="cards">
      ${[0, 1, 2].map(i => `
      <article class="card">
        <span class="num" style="color:${c(i + 5)}">0${i + 1}</span>
        <h3 style="color:${c(i)}">${['CFTV e câmeras', 'Alarme e sensores', 'Controle de acesso'][i]}</h3>
        <p style="color:${c(i + 2)}">Gravação em nuvem, analytics embarcado e imagens nítidas mesmo à noite.</p>
        <a style="color:${accent}">Saiba mais →</a>
      </article>`).join('')}
    </div>

    <div class="faixa" style="background:rgb(${DARK.join(',')})">
      <span style="color:${darkText}">© 2026 Grupo SEG System. Prévia de layout — dados fictícios.</span>
      <a style="color:${p.fixo ? c(0) : '#dbeafe'}">Política de privacidade</a>
    </div>
  </div>

  <div class="swatches">
    <div class="sw-title">Sobre branco — variantes escuras</div>
    ${sobreClaro.slice(0, 6).map((cor, i) => swatch(cor, WHITE, ['Link', 'Corpo', 'Secundário', 'Rótulo', 'Destaque', 'Legenda'][i])).join('')}
    <div class="sw-title">Sobre papel claro</div>
    ${sobreClaro.slice(0, 4).map((cor, i) => swatch(cor, PAPER, ['Link', 'Corpo', 'Secundário', 'Rótulo'][i])).join('')}
    <div class="sw-title">Sobre fundo escuro — variantes claras</div>
    ${sobreEscuro.slice(0, 4).map((cor, i) => swatch(cor, DARK, ['Link', 'Corpo', 'Secundário', 'Rótulo'][i])).join('')}
  </div>
</section>`;
}

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>E18 — Opções de paleta para decisão</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#e9edf2;color:#111827;font-family:Inter,Arial,Helvetica,sans-serif}
.page-head{max-width:1680px;margin:0 auto;padding:28px 24px 10px}
.page-head h1{font-size:26px;margin:0 0 6px;letter-spacing:-.02em}
.page-head p{margin:0;color:#4b5563;font-size:13px;line-height:1.6}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;max-width:1680px;margin:0 auto;padding:14px 24px 40px}
.panel{background:#fff;border:1px solid #d8dee7;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(15,23,42,.06)}
.panel-head{padding:16px 16px 14px;border-bottom:1px solid #e5e9f0;background:linear-gradient(180deg,#fff,#f8fafc)}
.eyebrow{font-size:9px;letter-spacing:.18em;font-weight:800;color:#6b7280}
.panel-head h2{font-size:16px;margin:6px 0 3px;letter-spacing:-.01em}
.panel-head .sub{font-size:11px;color:#4b5563;margin:0 0 10px;line-height:1.45;min-height:32px}
.meta{display:flex;gap:6px;flex-wrap:wrap;font-size:9px;color:#6b7280}
.meta span{background:#eef2f7;border-radius:4px;padding:4px 6px}
.meta b{color:#111827}
.nota{margin-top:9px;font-size:10px;font-weight:700;color:#0f5132;background:#e7f5ec;border-left:3px solid #198754;padding:6px 8px;border-radius:0 4px 4px 0}
#painel-ANTES .nota{color:#842029;background:#fdecee;border-left-color:#dc3545}
.site{font-size:10px}
.topbar{display:flex;justify-content:space-between;padding:5px 12px;background:#eef1f5;color:#5a6673;font-size:7px;letter-spacing:.1em;font-weight:700}
.nav{display:flex;align-items:center;gap:9px;padding:9px 12px;border-bottom:1px solid #eceff4;font-size:8px}
.nav strong{font-size:12px;letter-spacing:-.03em;margin-right:auto;color:#142f4c}
.nav span{color:#52616b}
.nav a{text-decoration:none;font-weight:700}
.hero{padding:18px 12px 16px;background:#fff}
.kicker{font-size:7px;letter-spacing:.18em;font-weight:800;margin-bottom:9px}
.hero h1{font-family:Georgia,'Times New Roman',serif;font-size:25px;line-height:1.02;letter-spacing:-.045em;margin:0 0 9px;color:#142f4c;font-weight:400}
.hero h1 em{font-style:italic}
.hero p{font-size:9px;line-height:1.7;margin:0 0 12px;max-width:250px}
.cta{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.cta button{color:#fff;border:0;border-radius:3px;padding:8px 11px;font-size:8px;font-weight:700;cursor:default}
.cta a{font-size:8px;font-weight:700;text-decoration:none}
.assina{font-size:7px;letter-spacing:.08em;line-height:1.6}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:0 12px 14px;background:#fff}
.card{border:1px solid #e6eaf0;border-radius:5px;padding:9px 8px;background:#fcfdfe}
.card .num{font-size:8px;font-weight:800;letter-spacing:.1em}
.card h3{font-family:Georgia,serif;font-size:10px;margin:5px 0 6px;font-weight:600;line-height:1.2}
.card p{font-size:7.5px;line-height:1.6;margin:0 0 8px;color:inherit}
.card a{font-size:7.5px;font-weight:700;text-decoration:none}
.faixa{display:flex;justify-content:space-between;gap:8px;padding:10px 12px;font-size:7.5px;letter-spacing:.03em}
.faixa a{text-decoration:none;font-weight:700}
.swatches{padding:12px;border-top:1px solid #e5e9f0;background:#fbfcfe}
.sw-title{font-size:8px;font-weight:800;letter-spacing:.1em;color:#6b7280;margin:4px 0 6px;text-transform:uppercase}
.sw{display:inline-flex;align-items:center;gap:5px;font-size:8px;padding:4px 6px;margin:0 3px 4px 0;border:1px solid #e5e9f0;border-radius:4px}
.sw b{font-size:7.5px;padding:1px 3px;border-radius:3px}
.sw b.ok{background:#dcf5e6;color:#0f5132}
.sw b.bad{background:#fde2e4;color:#842029}
@media(max-width:1200px){.grid{grid-template-columns:repeat(2,1fr)}}
</style></head><body>
<div class="page-head">
  <h1>E18 — Opções de paleta para as prévias de layout</h1>
  <p>Simulação sobre as <b>2.560 amostras reais</b> do gate 10B (11 rotas × light/dark). As quatro colunas usam exatamente a mesma estrutura de componentes; só mudam as cores de texto. Os badges mostram o contraste medido. <b>Nenhum CSS de produção foi alterado</b> — as cores abaixo são as que seriam aplicadas após a sua decisão.</p>
</div>
<div class="grid">${PANELS.map(panel).join('')}</div>
</body></html>`;

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'comparativo.html'), html);

const browser = await chromium.launch({
  executablePath: await packagedChromium.executablePath(),
  headless: true,
  args: packagedChromium.args.filter(a => a !== '--disable-web-security'),
});
try {
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(OUT, 'comparativo.png'), fullPage: true });
  for (const p of PANELS) {
    const el = page.locator(`#painel-${p.id}`);
    await el.screenshot({ path: path.join(OUT, `opcao-${p.id}.png`) });
  }
  console.log('E18_PREVIEW_OK: comparativo.html + comparativo.png + 4 painéis PNG');
} finally {
  await browser.close();
}

// Relatório comparativo em Markdown.
const md = `# E18 — Opções de paleta para decisão

**Data:** 2026-10-27 · Simulação sobre as **2.560 amostras reais** do gate 10B (22 cenários baseline). **Nenhum CSS de produção foi alterado.**

## Como ver — três níveis de prévia

1. **Páginas reais (recomendado):** \`comparativo-real-GERAL.png\` mostra as 4 rotas × 4 opções numa só imagem. Para ver em tamanho grande, abra \`comparativo-real-layout-03.png\`, \`-05\`, \`-08\` e \`-09\` — cada um tem as quatro variações da **mesma página** lado a lado, capturadas em Chromium real (1440×900), PostgreSQL 17 descartável e servidor Next de verdade. A recolorização aconteceu **só no DOM da screenshot**; nenhum CSS de produção foi alterado. O HTML navegável é \`PAGINAS-REAIS.html\`.
2. **Componentes ampliados:** \`comparativo.html\` / \`comparativo.png\` — quatro colunas com os mesmos cards, hero e rodapé, e os **ratios medidos** em cada amostra de texto (verde = ok, vermelho = abaixo de 4.5:1).
3. **Dados:** \`opcoes.json\` (simulação completa), \`paginas-reais.json\` (capturas), \`mapa-{A,B,C}.json\` (substituições de cor).

| | Hoje | **A — Ajuste mínimo** | **B — Contraste alto (AAA)** | **C — Marca unificada** |
| --- | ---: | ---: | ---: | ---: |
| Alvo | — | ≥ 4.5:1 | ≥ 7:1 | ≥ 4.5:1 |
| Sinais corrigidos | 0/708 | **708/708** | 704/708 a 7:1 | **708/708** |
| Pior ratio | 2.42:1 | 4.50:1 | 6.49:1 | 4.50:1 |
| Ratio médio | 3.34:1 | 4.52:1 | 7.40:1 | 6.75:1 |
| Cores resultantes | 144 | 158 | 28 | 10 |
| Mudança visual | — | **quase nula** | moderada (cores mais profundas) | **maior** (identidade única) |

## A — Ajuste mínimo (recomendada se o objetivo é só conformidade)

Mantém o matiz de cada uma das 144 cores e aplica **apenas** o deslocamento necessário para a superfície onde o texto está (escurece em fundo claro, clareia em fundo escuro). Aparência praticamente idêntica à de hoje. Custo: gera 158 variantes, porque a mesma cor pode precisar de ajustes diferentes em superfícies distintas — mais declarações CSS para manter.

## B — Contraste alto (AAA)

Mesma ideia, mas levando todo o texto a **≥ 7:1** (WCAG AAA). Cores mais profundas e saturadas; os matizes de cada layout continuam diferentes. **Ressalva honesta:** 4 amostras em \`/layout-03\` têm fundo \`#496172\`, sobre o qual nem branco puro atinge 7:1 (máximo 6,49:1). Para fechar 708/708 a 7:1 seria preciso **clarear também esse fundo** — decisão extra de design.

## C — Marca unificada

Uma única identidade para os 10 layouts: **navy \`#142f4c\`**, **aço \`#1e5a8a\`**, **terracota \`#9c4a2f\`** e **neutro \`#33414d\`**, com variantes claras/escuras por superfície. Reduz de 144 para 10 cores efetivas (4 tokens). É a opção mais fácil de manter e a que cria consistência de marca — mas é a que mais muda a aparência atual das prévias, hoje bem diferentes entre si.

## O que NÃO muda com nenhuma das opções

- As **196 indeterminadas** (\`complex_background\`) continuam exigindo medição por pixel.
- Os **108 \`<option>\`** continuam controles nativos, não afetados por CSS.
- **Revisão WCAG manual** (texto grande exige só 3:1), leitor de tela, UAT/Windows e aceite humano seguem pendentes.
- O baseline 10B era \`917236ad…\` (708 sinais); após a Opção A a evidência foi regenerada com \`14ff3232…\` (0 sinais).

## Como a correção será aplicada

Independentemente da opção escolhida: substituir as cores de **texto** nos 10 \`src/components/Layout0X.module.css\` (≈150 declarações), regenerar a evidência 10B com o gate real em PostgreSQL 17 + Chromium, **atualizar o baseline 708 → 0** com relatório explícito, e rodar a suíte completa. As sugestões são cálculo de luminância — a identidade visual final é sua decisão.

**Produção segue NO-GO.**
`;
await writeFile(path.join(OUT, 'OPCOES-PALETA.md'), md);
console.log('E18_PREVIEW_MD_OK: OPCOES-PALETA.md');
