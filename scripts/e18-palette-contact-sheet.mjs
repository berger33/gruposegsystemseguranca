#!/usr/bin/env node
// E18 — monta comparativos lado a lado a partir das capturas das páginas reais.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';

const root = path.resolve(import.meta.dirname, '..');
const OUT = path.join(root, 'docs/e18-paletas-2026-10-27');
const ROTAS = ['layout-03', 'layout-05', 'layout-08', 'layout-09'];
const OPCOES = [
  { id: 'ANTES', titulo: 'HOJE', sub: 'sem correção' },
  { id: 'A', titulo: 'OPÇÃO A', sub: 'Ajuste mínimo · AA 4.5:1' },
  { id: 'B', titulo: 'OPÇÃO B', sub: 'Contraste alto · AAA 7:1' },
  { id: 'C', titulo: 'OPÇÃO C', sub: 'Marca unificada · AA 4.5:1' },
];
const src = f => pathToFileURL(path.join(OUT, f)).href;

const css = `*{box-sizing:border-box}body{margin:0;background:#0f172a;font-family:Inter,Arial,sans-serif;color:#e2e8f0}
.wrap{padding:18px}
.titulo{font-size:19px;font-weight:800;letter-spacing:-.02em;margin:0 0 4px}
.sub{font-size:11px;color:#94a3b8;margin:0 0 14px}
.row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.col{background:#1e293b;border:1px solid #334155;border-radius:8px;overflow:hidden}
.col header{padding:8px 10px;border-bottom:1px solid #334155}
.col header b{display:block;font-size:11px;letter-spacing:.08em}
.col header span{font-size:9px;color:#94a3b8}
.col .shot{height:940px;overflow:hidden;background:#fff}
.col img{display:block;width:100%;height:auto}
#c-ANTES{border-color:#7f1d1d}#c-ANTES header{background:#450a0a}
#c-A header{background:#1e3a5f}#c-B header{background:#3f2d12}#c-C header{background:#134e4a}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.grid4 .cell{position:relative;background:#1e293b;border:1px solid #334155;border-radius:6px;overflow:hidden;height:330px}
.grid4 .cell span{position:absolute;top:0;left:0;right:0;background:rgba(15,23,42,.88);font-size:9px;font-weight:700;padding:4px 6px;z-index:2}
.grid4 img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.rlabel{font-size:11px;font-weight:700;color:#cbd5e1;margin:14px 0 6px;letter-spacing:.06em}`;

// O Chromium empacotado roda --single-process e morre ao reaproveitar o
// browser entre páginas: um browser por captura (mesmo padrão dos gates).
const launch = async () => chromium.launch({
  executablePath: await packagedChromium.executablePath(),
  headless: true,
  args: packagedChromium.args.filter(a => a !== '--disable-web-security'),
});
async function shot(htmlFile, outFile, viewport, fullPage = false) {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
    await page.screenshot({ path: path.join(OUT, outFile), fullPage });
    await page.close();
  } finally {
    await browser.close();
  }
}

{
  // 1) Um comparativo por rota, 4 colunas em tamanho grande.
  for (const rota of ROTAS) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="wrap">
      <div class="titulo">/${rota} — as quatro opções na página real</div>
      <div class="sub">Capturas idênticas em Chromium 1440×900; só as cores de texto mudam. Recorte do topo da página. Nenhum CSS de produção foi alterado.</div>
      <div class="row">${OPCOES.map(o => `<div class="col" id="c-${o.id}"><header><b>${o.titulo}</b><span>${o.sub}</span></header><div class="shot"><img src="${src(`real-${rota}-${o.id}.png`)}"></div></div>`).join('')}</div>
    </div></body></html>`;
    const tmp = path.join(OUT, `_sheet-${rota}.html`);
    await writeFile(tmp, html);
    await shot(tmp, `comparativo-real-${rota}.png`, { width: 1640, height: 1040 });
    console.log(`E18_SHEET_OK comparativo-real-${rota}.png`);
  }
  // 2) Visão geral 4×4 (rotas × opções) numa só imagem.
  const geral = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
    .grid4 .rowhead{grid-column:1/-1;font-size:12px;font-weight:800;color:#e2e8f0;padding:6px 0 0}
  </style></head><body><div class="wrap">
    <div class="titulo">E18 — visão geral das paletas nas páginas reais</div>
    <div class="sub">Linhas = rotas. Colunas = HOJE / A / B / C. Miniaturas do topo de cada página; abra os comparativos por rota para ver em tamanho grande.</div>
    ${ROTAS.map(rota => `<div class="rlabel">/${rota}</div><div class="grid4">${OPCOES.map(o => `<div class="cell"><span>${o.titulo}</span><img src="${src(`real-${rota}-${o.id}.png`)}"></div>`).join('')}</div>`).join('')}
  </div></body></html>`;
  const tmpGeral = path.join(OUT, '_sheet-geral.html');
  await writeFile(tmpGeral, geral);
  await shot(tmpGeral, 'comparativo-real-GERAL.png', { width: 1640, height: 1560 }, true);
  console.log('E18_SHEET_OK comparativo-real-GERAL.png');
}
