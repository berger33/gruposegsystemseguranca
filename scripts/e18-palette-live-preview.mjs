#!/usr/bin/env node
// E18 — prévias das PÁGINAS REAIS com cada opção de paleta injetada no browser.
// Sobe PostgreSQL 17 descartável + migrações + server.mjs --dev, abre as rotas
// de prévia em Chromium real e recoloriza somente os textos cujas cores estão
// no conjunto das 144 problemáticas — calculando o fundo efetivo de cada um.
// NENHUM CSS de produção é alterado: a mudança vive só no DOM da screenshot.
//
// Uso: AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x node scripts/e18-palette-live-preview.mjs
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { withCleanGeneratedFiles } from './qa-generated-files.mjs';

const root = path.resolve(import.meta.dirname, '..');
const OUT = path.join(root, 'docs/e18-paletas-2026-10-27');
const ROTAS = ['/layout-03', '/layout-05', '/layout-08', '/layout-09'];
const OPCOES = [
  { id: 'ANTES', alvo: 0, tokens: null, titulo: 'Hoje (sem correção)' },
  { id: 'A', alvo: 4.5, tokens: null, titulo: 'A — Ajuste mínimo (AA ≥4.5:1)' },
  { id: 'B', alvo: 7, tokens: null, titulo: 'B — Contraste alto (AAA ≥7:1)' },
  { id: 'C', alvo: 4.5, tokens: 'C', titulo: 'C — Marca unificada (AA ≥4.5:1)' },
];

const samples = JSON.parse(await (await import('node:fs/promises')).readFile(
  path.join(root, 'docs/UX-PRO-10B-CONTRASTE-AMOSTRAS-2026-10-27.json'), 'utf8'));
const toHex = css => {
  const m = String(css).match(/[\d.]+/g);
  return m && m.length >= 3 ? '#' + m.slice(0, 3).map(v => Number(v).toString(16).padStart(2, '0')).join('') : null;
};
const problematicas = new Set();
for (const [key, cenario] of Object.entries(samples.cenarios)) {
  if (!key.endsWith('|main')) continue;
  for (const s of cenario.under45) { const h = toHex(s.foreground); if (h) problematicas.add(h); }
}
const { readFile } = await import('node:fs/promises');
const tokensC = JSON.parse(await readFile(path.join(OUT, 'mapa-C.json'), 'utf8'));

const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); });
});
const run = (cmd, args, env) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', c => { out += c; });
  child.stderr.on('data', c => { out += c; });
  child.once('error', reject);
  child.once('close', code => resolve({ code: code ?? 1, out }));
});
const waitForServer = async (url, timeoutMs = 120_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/admin/session`, { headers: { accept: 'application/json' } });
      if (res.status === 401 || res.status === 200) return;
    } catch { /* subindo */ }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error('server_did_not_start');
};

/** Executado DENTRO do browser. Devolve quantos textos foram recolorizados. */
function recolor(config) {
  const lum = rgb => {
    const c = rgb.map(v => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return Math.round((h + 0.05) / (l + 0.05) * 100) / 100; };
  const hex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const parseHex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const adjustTo = (fg, bg, target) => {
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
    const d = towards([0, 0, 0]); const l = towards([255, 255, 255]);
    if (!d && !l) return ratio([0, 0, 0], bg) > ratio([255, 255, 255], bg) ? [0, 0, 0] : [255, 255, 255];
    if (!d) return l.rgb;
    if (!l) return d.rgb;
    return d.fator <= l.fator ? d.rgb : l.rgb;
  };
  const effectiveBackground = el => {
    let bg = [255, 255, 255]; let opaque = false; let complex = false;
    const ancestors = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) ancestors.push(n);
    for (const n of ancestors.reverse()) {
      const s = getComputedStyle(n);
      if (s.backgroundImage !== 'none') complex = true;
      const m = s.backgroundColor.match(/[\d.]+/g);
      if (m && m.length >= 3) {
        const rgb = m.slice(0, 3).map(Number);
        const a = m.length > 3 ? Number(m[3]) : 1;
        if (a > 0) { bg = rgb.map((v, i) => v * a + bg[i] * (1 - a)); if (a === 1) opaque = true; }
      }
    }
    return opaque && !complex ? bg.map(Math.round) : null;
  };
  const problematicas = new Set(config.cores);
  const tokens = config.tokens;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node, changed = 0, skippedComplex = 0;
  while ((node = walker.nextNode())) {
    const el = node.parentElement;
    if (!el || !(node.textContent || '').trim()) continue;
    const m = getComputedStyle(el).color.match(/[\d.]+/g);
    if (!m || m.length < 3) continue;
    const fg = m.slice(0, 3).map(Number);
    const key = hex(fg);
    if (!problematicas.has(key)) continue;
    const bg = effectiveBackground(el);
    if (!bg) { skippedComplex += 1; continue; }
    const base = tokens && tokens[key] ? parseHex(tokens[key]) : fg;
    el.style.color = hex(adjustTo(base, bg, config.alvo));
    changed += 1;
  }
  return { changed, skippedComplex };
}

async function capture(browser, url, rota, opcao) {
  // --single-process: um browser por cenário. Aqui reaproveitamos o browser
  // mas abrimos UM contexto por captura e fechamos logo em seguida.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });
  const page = await context.newPage();
  try {
    await page.goto(url + rota, { waitUntil: 'networkidle', timeout: 90_000 });
    await page.locator('[data-testid="site-preview-notice"]').waitFor({ timeout: 30_000 }).catch(() => {});
    let stats = { changed: 0, skippedComplex: 0 };
    if (opcao.alvo > 0) {
      stats = await page.evaluate(recolor, {
        cores: [...problematicas],
        tokens: opcao.tokens ? tokensC : null,
        alvo: opcao.alvo,
      });
    }
    const file = path.join(OUT, `real-${rota.slice(1)}-${opcao.id}.png`);
    await page.screenshot({ path: file, fullPage: true });
    return { file: path.basename(file), ...stats };
  } finally {
    await context.close();
  }
}

const directory = await mkdtemp(path.join(tmpdir(), 'seg-e18-palette-'));
const pgPort = await freePort();
const webPort = await freePort();
const password = randomBytes(24).toString('hex');
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(directory, 'data'), port: pgPort, user: 'seg_qa', password,
  persistent: false, initdbFlags: ['--encoding=UTF8'],
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog: () => {}, onError: () => {},
});
let server;
const resultados = [];
let exitCode = 1;

await withCleanGeneratedFiles(async () => {
  try {
    await postgres.initialise();
    await postgres.start();
    await postgres.createDatabase('seg_qa_e18_palette');
    const dbUrl = `postgresql://seg_qa:${password}@127.0.0.1:${pgPort}/seg_qa_e18_palette`;
    const migrated = await run(process.execPath, ['scripts/migrate-site-visual.mjs'], {
      DATABASE_MIGRATION_URL: dbUrl, DATABASE_URL: '', QA_MIGRATION_ONLY: 'true',
    });
    if (migrated.code !== 0) throw new Error(`migrations_failed: ${migrated.out.slice(-400)}`);

    server = spawn(process.execPath, ['server.mjs', '--dev'], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(webPort), BIND_HOST: '127.0.0.1', NODE_ENV: 'development',
        NEXT_DIST_DIR: '.next/e18-palette-preview',
        DATABASE_URL: dbUrl, DATABASE_MIGRATION_URL: '',
        SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
        EMPLOYEE_SESSION_SECRET: randomUUID().repeat(2),
        CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
        ADMIN_LOGIN_MAX_ATTEMPTS: '200', SITE_ADMIN_LEGACY_TOKENS: '',
        SITE_ADMIN_TOKEN_MARCELO: '', SITE_ADMIN_TOKEN_TI: '',
        QA_PGLITE_ONLY: '', ALLOW_REMOTE_MIGRATIONS: '',
        OLLAMA_ENABLED: 'false', MAIL_HOST: '', NEXT_TELEMETRY_DISABLED: '1',
        AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', () => {}); server.stderr.on('data', () => {});
    const baseUrl = `http://127.0.0.1:${webPort}`;
    await waitForServer(baseUrl);

    for (const rota of ROTAS) {
      for (const opcao of OPCOES) {
        // Um browser por captura: o Chromium empacotado usa --single-process e
        // não sobrevive ao reaproveitamento entre contextos.
        const browser = await chromium.launch({
          executablePath: await packagedChromium.executablePath(),
          headless: true,
          args: packagedChromium.args.filter(a => a !== '--disable-web-security'),
        });
        try {
          const r = await capture(browser, baseUrl, rota, opcao);
          resultados.push({ rota, opcao: opcao.id, ...r });
          console.log(`E18_LIVE_OK ${rota} ${opcao.id}: ${r.changed} textos recoloridos, ${r.skippedComplex} fundos complexos ignorados`);
        } finally {
          await browser.close();
        }
      }
    }
    exitCode = 0;
  } finally {
    if (server && !server.killed) {
      server.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 400));
      server.kill('SIGKILL').catch?.(() => {});
    }
    await postgres.stop().catch(() => {});
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
});

// HTML comparativo: uma linha por rota, quatro colunas por opção.
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>E18 — Paletas aplicadas nas páginas reais</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#eef2f7;font-family:Inter,Arial,sans-serif;color:#111827}
header{max-width:1900px;margin:0 auto;padding:26px 24px 10px}
h1{font-size:25px;margin:0 0 6px;letter-spacing:-.02em}
header p{font-size:13px;color:#4b5563;line-height:1.6;margin:0;max-width:1100px}
.bloco{max-width:1900px;margin:0 auto;padding:16px 24px 30px}
.rota{font-size:16px;font-weight:800;margin:18px 0 10px;letter-spacing:-.01em}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.cardx{background:#fff;border:1px solid #d8dee7;border-radius:10px;overflow:hidden}
.cardx h3{font-size:12px;margin:0;padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e5e9f0}
.cardx .stats{font-size:10px;color:#6b7280;padding:6px 12px;border-bottom:1px solid #eef1f5}
.cardx img{display:block;width:100%;height:auto;max-height:620px;object-fit:cover;object-position:top}
#ANTES h3{background:#fdecee;color:#842029}
@media(max-width:1300px){.grid{grid-template-columns:repeat(2,1fr)}}
</style></head><body>
<header><h1>E18 — as três paletas aplicadas nas páginas reais</h1>
<p>Capturas em Chromium real (1440×900, light), PostgreSQL 17 descartável e servidor Next de verdade. A recolorização acontece <b>só no DOM da screenshot</b>: nenhum CSS de produção foi alterado. Cada linha é uma rota; as quatro colunas usam exatamente a mesma página — só mudam as cores de texto. Textos sobre fundo com imagem/gradiente ficam de fora (o medidor não amostra pixels).</p></header>
${ROTAS.map(rota => `<div class="bloco"><div class="rota">${rota}</div><div class="grid">${OPCOES.map(o => {
  const r = resultados.find(x => x.rota === rota && x.opcao === o.id) || {};
  return `<div class="cardx" id="${o.id}"><h3>${o.titulo}</h3><div class="stats">${o.id === 'ANTES' ? 'estado atual · 144 cores com contraste insuficiente' : `${r.changed || 0} textos ajustados · ${r.skippedComplex || 0} fundos complexos preservados`}</div><img src="real-${rota.slice(1)}-${o.id}.png" alt="${rota} ${o.id}"></div>`;
}).join('')}</div></div>`).join('')}
</body></html>`;
await writeFile(path.join(OUT, 'PAGINAS-REAIS.html'), html);
await writeFile(path.join(OUT, 'paginas-reais.json'), JSON.stringify({
  stage: 'e18-paletas-paginas-reais', data: '2026-10-27',
  metodo: 'PostgreSQL 17 descartavel + server.mjs --dev + Chromium real; recolorizacao apenas no DOM',
  rotas: ROTAS, opcoes: OPCOES.map(o => ({ id: o.id, alvo: o.alvo })),
  coresProblematicas: problematicas.size, resultados,
  limite: 'nenhum CSS de producao alterado; aguardando decisao do proprietario; producao NO-GO',
}, null, 2) + '\n');
console.log(`E18_LIVE_DONE: ${resultados.length} capturas em ${OUT}`);
process.exit(exitCode);
