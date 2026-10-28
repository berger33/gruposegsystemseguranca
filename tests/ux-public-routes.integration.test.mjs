// E6 / UX-PRO-06 — gate do grupo 1 de rotas públicas de descoberta.
//
// O que este gate PROVA (PostgreSQL 17 descartável + Chromium real):
//  - as sete rotas respondem 200 e mantêm o noindex de prévia (não produção);
//  - 320/390/768/1440 px não produzem transbordo horizontal;
//  - o teclado alcança controles reais e um <details> abre por Enter;
//  - /conteudos distingue carregando, vazio e falha de leitura, sem inventar
//    publicações quando a API falha;
//  - ids/slugs desconhecidos devolvem página honesta com caminho de volta.
//
// O que NÃO prova: aceite humano, UAT, leitor de tela, Windows, outros
// navegadores nem produção. Nenhuma destas rotas é publicada por este gate.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { measureTextContrast } from '../scripts/ux-evidence-text-contrast.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');

let server, baseUrl, pool;
let generatedSnapshot = new Map();
const GENERATED_FILES = ['next-env.d.ts', 'tsconfig.json'];
async function snapshotGeneratedFiles() {
  const snapshot = new Map();
  for (const name of GENERATED_FILES) snapshot.set(name, await readFile(path.join(root, name), 'utf8').catch(() => null));
  return snapshot;
}
async function restoreGeneratedFiles(snapshot) {
  for (const [name, content] of snapshot) if (content !== null) await writeFile(path.join(root, name), content);
}

async function waitForServer(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/admin/session`, { headers: { accept: 'application/json' } });
      if (res.status === 401 || res.status === 200) return true;
    } catch { /* ainda subindo */ }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error('server_did_not_start');
}

function api(pathname) {
  return fetch(`${baseUrl}${pathname}`, { headers: { accept: 'application/json' }, redirect: 'manual' })
    .then(async res => ({ status: res.status, body: await res.json().catch(() => null) }));
}

async function launchChromiumOnce() {
  if (process.platform === 'win32') return playwrightChromium.launch({ channel: 'msedge', headless: true });
  return playwrightChromium.launch({
    executablePath: await packagedChromium.executablePath(),
    args: packagedChromium.args.filter(arg => arg !== '--disable-web-security'),
    headless: true,
  });
}
async function launchBrowser() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { return await launchChromiumOnce(); } catch (error) { lastError = error; }
  }
  throw lastError;
}

/** Abre rota pública. `failRoutes` substitui window.fetch só dentro da página. */
async function openPage(browser, route, { width = 1440, height = 900, colorScheme, failRoutes = [], status = 503, code = 'qa_forced_failure' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR', ...(colorScheme ? { colorScheme } : {}) });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(90_000);
  if (failRoutes.length) {
    await page.addInitScript(({ routes, failStatus, failCode }) => {
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        if (routes.some(route => url.includes(route))) {
          return new Response(JSON.stringify({ error: failCode }), {
            status: failStatus, headers: { 'content-type': 'application/json' },
          });
        }
        return original(input, init);
      };
    }, { routes: failRoutes, failStatus: status, failCode: code });
  }
  const navigationResponse = await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
  // Formulários públicos são client components: sem esperar a hidratação,
  // cliques em checkboxes/botões são perdidos e o teste mede o HTML morto.
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  return { context, page, navigationResponse };
}

const SERVICE = 'Segurança Desarmada';
const SEGMENT_KEY = 'condominios_residenciais';
const ROUTES = [
  { route: '/servicos', heading: 'Serviços' },
  { route: `/servicos/${encodeURIComponent(SERVICE)}`, heading: SERVICE },
  { route: '/segmentos', heading: 'Fale sobre seu espaço' },
  { route: `/segmentos/${SEGMENT_KEY}`, heading: 'Condomínios' },
  { route: '/conteudos', heading: 'Conteúdos publicados' },
  { route: '/conteudos/nao-existe-qa', heading: 'Conteúdo' },
  { route: '/faq', heading: 'FAQ revisada' },
];
const VIEWPORTS = [[320, 780], [390, 844], [768, 1024], [1440, 900]];

// UX-PRO-10B/10C + 09E-8 — medições em navegador real das rotas DIRETAS das
// prévias (não só /layout-preview?visual=XX). O relatório é escrito no `after`
// e é determinístico: sem timestamps, sem dados do operador, sem aceite humano.
const PREVIEW_DIRECT_ROUTES = Array.from({ length: 10 }, (_, i) => `/layout-${String(i + 1).padStart(2, '0')}`);
const PREVIEW_ALL_ROUTES = [...PREVIEW_DIRECT_ROUTES, '/layout-preview'];
const PREVIEW_EVIDENCE = 'docs/UX-PRO-10B-PREVIAS-MEDICOES-2026-10-27.json';
// E18: o JSON acima congela CONTAGENS (baseline). Este novo artefato guarda as
// AMOSTRAS que o helper PU4 já produzia, para que os 708 sinais < 4.5:1, as
// 196 indeterminadas e os 108 textos não medidos virem uma lista acionável.
// Arquivo separado para não mudar o SHA do baseline nem a guarda 10B.
const PREVIEW_SAMPLES_EVIDENCE = 'docs/UX-PRO-10B-CONTRASTE-AMOSTRAS-2026-10-27.json';
const PREVIEW_SAMPLES = {};
const PREVIEW_MEDICOES = {
  stage: 'ux-pro-10b-previas',
  data: '2026-10-27',
  metodo: 'PostgreSQL 17 descartavel + Chromium real; measureTextContrast (PU4) reutilizado; page.evaluate sem IIFE externa',
  rotas: {},
  iframe: null,
  limites: [
    'leitor de tela nao executado',
    'revisao manual de tema/contraste nao executada',
    'WCAG integral nao verificado',
    'aceite humano/UAT/Windows nao executado',
    'producao segue NO-GO',
  ],
};
function previewRow(route) {
  PREVIEW_MEDICOES.rotas[route] ||= { teclado: null, zoom200: null, contraste: {}, paleta: {} };
  return PREVIEW_MEDICOES.rotas[route];
}
async function focusState(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    const shadow = cs.boxShadow && cs.boxShadow !== 'none';
    return {
      tag: el.tagName,
      label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 80),
      outline: cs.outlineStyle, outlineWidth: cs.outlineWidth,
      focusVisible: el.matches(':focus-visible'),
      visible: Boolean(outline || shadow),
    };
  });
}
async function measureContrast(page, sampleKey = null) {
  const result = await page.evaluate(measureTextContrast);
  if (sampleKey) {
    // E18: guarda as amostras BRUTAS (não um resumo) para o inventário de
    // contraste. `samples` mantém a ordem do TreeWalker: evidência determinística.
    PREVIEW_SAMPLES[sampleKey] = {
      samples: result.samples,
      under45: result.under45,
      unmeasuredSamples: result.unmeasuredSamples,
    };
  }
  return {
    status: result.status,
    renderedTextNodeCount: result.renderedTextNodeCount,
    unmeasuredVisibleTextCount: result.unmeasuredVisibleTextCount,
    sampleCount: result.sampleCount,
    resolvedCount: result.resolvedCount,
    indeterminateCount: result.indeterminateCount,
    under45Count: result.under45.length,
  };
}
async function pagePalette(page) {
  return page.evaluate(() => {
    const read = el => {
      const cs = getComputedStyle(el);
      return { background: cs.backgroundColor, color: cs.color };
    };
    return { html: read(document.documentElement), body: read(document.body) };
  });
}

before(async () => {
  if (!RUN) return;
  generatedSnapshot = await snapshotGeneratedFiles();
  const port = 3000 + Math.floor(Math.random() * 2000);
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.mjs', '--dev'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: '127.0.0.1',
      NODE_ENV: 'development',
      NEXT_DIST_DIR: '.next/integration-ux-public-routes',
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      EMPLOYEE_SESSION_SECRET: randomUUID().repeat(2),
      CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
      ADMIN_LOGIN_MAX_ATTEMPTS: '200',
      SITE_ADMIN_LEGACY_TOKENS: '',
      SITE_ADMIN_TOKEN_MARCELO: '',
      SITE_ADMIN_TOKEN_TI: '',
      QA_PGLITE_ONLY: '',
      OLLAMA_ENABLED: 'false',
      MAIL_HOST: '',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', () => {});
  await waitForServer(baseUrl);
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) { server.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); server.kill('SIGKILL'); }
  if (RUN && Object.keys(PREVIEW_MEDICOES.rotas).length) {
    // Evidência legível por máquina, determinística. `not-measured` e
    // `indeterminate` são preservados: nunca viram aprovação automática.
    const ordered = Object.fromEntries(Object.entries(PREVIEW_MEDICOES.rotas).sort(([a], [b]) => a.localeCompare(b)));
    await writeFile(path.join(root, PREVIEW_EVIDENCE),
      JSON.stringify({ ...PREVIEW_MEDICOES, rotas: ordered }, null, 2) + '\n');
    // E18: amostras brutas de contraste, em chaves ordenadas, sem timestamp e
    // sem dados do operador. Alimentam `scripts/ux-pro-10b-contrast-inventory.mjs`.
    const orderedSamples = Object.fromEntries(Object.entries(PREVIEW_SAMPLES).sort(([a], [b]) => a.localeCompare(b)));
    await writeFile(path.join(root, PREVIEW_SAMPLES_EVIDENCE),
      JSON.stringify({
        stage: 'ux-pro-10b-contraste-amostras',
        data: '2026-10-27',
        metodo: 'measureTextContrast (PU4) em Chromium real; amostras brutas por rota/esquema/cenario',
        limite: 'diagnostico; nenhuma paleta ou CSS foi alterado; decisao de design pendente do proprietario',
        cenarios: orderedSamples,
      }, null, 2) + '\n');
  }
  await restoreGeneratedFiles(generatedSnapshot);
});

test('http E6 grupo 1: as sete rotas públicas respondem 200', { skip: !RUN }, async () => {
  for (const { route } of ROUTES) {
    const res = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
    assert.equal(res.status, 200, `${route} precisa responder 200, veio ${res.status}`);
    assert.doesNotMatch(res.headers.get('content-type') || '', /text\/plain/, `${route} precisa renderizar HTML`);
  }
  const cms = await api('/api/public/cms');
  assert.equal(cms.status, 200, 'a API pública de conteúdos precisa estar disponível no gate');
});

test('browser E6 grupo 1: 320/390/768/1440 sem transbordo e com noindex de prévia', { skip: !RUN }, async () => {
  // O Chromium empacotado roda em --single-process: reaproveitar o MESMO
  // browser entre contextos derruba o alvo (mesma ressalva do gate do portal).
  // Cada viewport ganha seu próprio browser e um único contexto.
  const readings = [];
  for (const [width, height] of VIEWPORTS) {
    const browser = await launchBrowser();
    try {
      const { context, page } = await openPage(browser, '/servicos', { width, height });
      for (const { route, heading } of ROUTES) {
        const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200, `${route} em ${width}: veio ${response.status()}`);
        await page.getByRole('heading', { name: new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first().waitFor();
        const robots = await page.locator('meta[name="robots"]').first().getAttribute('content');
        assert.match(robots || '', /noindex/i, `${route}: o site de prévia precisa manter noindex`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        readings.push({ width, route, overflow });
        assert.ok(overflow <= 1, `${route} em ${width}px: transbordo horizontal de ${overflow}px`);
      }
      await context.close();
    } finally {
      await browser.close();
    }
  }
  assert.equal(readings.length, VIEWPORTS.length * ROUTES.length, 'todas as combinações precisam ser medidas');
});

test('browser E6 grupo 1: teclado alcança controles reais e o FAQ abre por Enter', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/faq', { width: 390, height: 844 });
    await page.getByRole('heading', { name: /FAQ revisada/ }).waitFor();
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? { tag: el.tagName, text: (el.textContent || '').trim().slice(0, 60) } : null;
    });
    assert.ok(focused && focused.tag !== 'BODY', 'o primeiro Tab precisa sair do BODY');
    assert.ok(['A', 'BUTTON', 'SUMMARY', 'INPUT'].includes(focused.tag),
      `o primeiro Tab precisa chegar a um controle interativo, veio ${focused.tag}`);

    const details = page.locator('details').first();
    await details.locator('summary').focus();
    assert.equal(await details.evaluate(el => el.open), false, 'o primeiro item do FAQ começa fechado');
    await page.keyboard.press('Enter');
    assert.equal(await details.evaluate(el => el.open), true, 'Enter precisa abrir o <details> do FAQ');
    await context.close();
  } finally {
    await browser.close();
  }
});

test('browser E6 grupo 1: /conteudos distingue vazio e falha de leitura sem inventar dados', { skip: !RUN }, async () => {
  // Um browser por cenário (Chromium --single-process não tolera contextos
  // reaproveitados); cada cenário abre e fecha o seu.
  const scenarios = [
    {
      name: 'vazio honesto',
      run: async page => {
        await page.getByRole('heading', { name: 'Conteúdos publicados' }).waitFor();
        await page.getByText(/Não há publicações disponíveis no momento\./).waitFor();
        // O RagWidget global pode ter seu próprio alerta (IA desligada):
        // escopar ao <main> da rota para medir só o estado do conteúdo.
        assert.equal(await page.locator('main [role="alert"]').count(), 0, 'vazio não é erro');
        assert.doesNotMatch(await page.locator('main').innerText(), /Conteúdo indisponível no momento/);
      },
      options: { width: 390, height: 844 },
      route: '/conteudos',
    },
    {
      name: 'falha de leitura',
      run: async page => {
        const alert = page.locator('main [role="alert"]');
        await alert.waitFor();
        assert.match(await alert.innerText(), /Conteúdo indisponível no momento/);
        const text = await page.locator('body').innerText();
        assert.doesNotMatch(text, /Não há publicações disponíveis no momento\./,
          'falha de leitura não pode parecer lista vazia');
        assert.doesNotMatch(text, /Carregando…/, 'falha não pode ficar presa em carregando');
      },
      options: { width: 390, height: 844, failRoutes: ['/api/public/cms'], status: 503, code: 'qa_forced_failure' },
      route: '/conteudos',
    },
    {
      name: 'slug desconhecido',
      run: async page => {
        await page.getByText(/Este conteúdo não está disponível\./).waitFor();
      },
      options: { width: 390, height: 844 },
      route: '/conteudos/nao-existe-qa',
    },
  ];
  for (const scenario of scenarios) {
    const browser = await launchBrowser();
    try {
      const { context, page } = await openPage(browser, scenario.route, scenario.options);
      await scenario.run(page);
      await context.close();
    } finally {
      await browser.close();
    }
  }
});

test('browser E6 grupo 1: ids desconhecidos devolvem página honesta com volta', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/servicos', { width: 390, height: 844 });
    for (const [route, heading, back] of [
      ['/servicos/servico-inexistente-qa', /Serviço não encontrado/, 'Voltar aos serviços'],
      ['/segmentos/segmento-inexistente-qa', /Segmento não encontrado/, 'Voltar aos segmentos'],
    ]) {
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200, `${route} precisa responder uma página honesta`);
      await page.getByRole('heading', { name: heading }).waitFor();
      await page.getByRole('link', { name: back }).waitFor();
      const text = await page.locator('body').innerText();
      assert.doesNotMatch(text, /Solicitar avaliação|Solicite uma avaliação/i,
        `${route} não pode oferecer orçamento para algo inexistente`);
    }
    await context.close();
  } finally {
    await browser.close();
  }
});

// E6 — defeito real encontrado pelo gate: no Next 16 `generateMetadata` recebe
// params decodificados, mas o componente da pagina recebe o segmento ainda
// codificado ("Seguran%C3%A7a%20Desarmada"). findService() falhava e os seis
// links da listagem exibiam "Servico nao encontrado". Este teste segue os links
// REAIS da pagina e exige que cada detalhe mostre o nome do servico.
test('browser E6 grupo 1: os seis links de servico da listagem abrem o detalhe correto', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/servicos', { width: 1440, height: 900 });
    await page.getByRole('heading', { name: 'Serviços', exact: true }).waitFor();
    const links = page.locator('a[href^="/servicos/"]');
    const count = await links.count();
    assert.equal(count, 6, `a listagem precisa oferecer os seis servicos, veio ${count}`);
    const hrefs = [];
    for (let index = 0; index < count; index += 1) hrefs.push(await links.nth(index).getAttribute('href'));
    for (const href of hrefs) {
      assert.ok(href, 'cada link de servico precisa ter href');
      const expected = decodeURIComponent(href.slice('/servicos/'.length));
      const response = await page.goto(`${baseUrl}${href}`, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200, `${href} precisa responder 200`);
      const heading = page.getByRole('heading', { level: 1 });
      await heading.waitFor();
      assert.equal((await heading.innerText()).trim(), expected,
        `${href} precisa mostrar o servico "${expected}", nao uma pagina de nao encontrado`);
      const title = await page.title();
      assert.match(title, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `${href} precisa manter o title correto`);
      await page.getByRole('link', { name: /Voltar aos serviços|Todos os serviços/ }).first().waitFor();
    }
    await context.close();
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------------------
// E6 / UX-PRO-06 — GRUPO 2: rotas de conversão.
// /orcamento, /simulador, /pacotes, /privacidade e /proposta/aceite/[token].
// ---------------------------------------------------------------------------
const GROUP2_ROUTES = [
  { route: '/orcamento', heading: /Monte sua necessidade/ },
  { route: '/simulador', heading: /Conte o que você precisa/ },
  { route: '/pacotes', heading: /Pacotes de serviços/ },
  { route: '/privacidade', heading: /Privacidade/ },
  { route: '/proposta/aceite/token-invalido-qa-1234567890', heading: /Aceite de proposta comercial/ },
];

test('http E6 grupo 2: as cinco rotas de conversão respondem 200', { skip: !RUN }, async () => {
  for (const { route } of GROUP2_ROUTES) {
    const res = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
    assert.equal(res.status, 200, `${route} precisa responder 200, veio ${res.status}`);
  }
  const packages = await api('/api/public/packages');
  assert.equal(packages.status, 200, 'a API pública de pacotes precisa estar disponível');
});

test('browser E6 grupo 2: 320/390/768/1440 sem transbordo e com noindex', { skip: !RUN }, async () => {
  const readings = [];
  for (const [width, height] of VIEWPORTS) {
    // Chromium --single-process: um browser por viewport, como no grupo 1.
    const browser = await launchBrowser();
    try {
      const { context, page } = await openPage(browser, '/orcamento', { width, height });
      for (const { route, heading } of GROUP2_ROUTES) {
        const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200, `${route} em ${width}: veio ${response.status()}`);
        await page.getByRole('heading', { name: heading }).first().waitFor();
        const robots = await page.locator('meta[name="robots"]').first().getAttribute('content');
        assert.match(robots || '', /noindex/i, `${route}: prévia precisa manter noindex`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        readings.push({ width, route, overflow });
        assert.ok(overflow <= 1, `${route} em ${width}px: transbordo horizontal de ${overflow}px`);
      }
      await context.close();
    } finally {
      await browser.close();
    }
  }
  assert.equal(readings.length, VIEWPORTS.length * GROUP2_ROUTES.length);
});

test('browser E6 grupo 2: /orcamento anuncia falha com foco e mantém o formulário', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/orcamento', {
      width: 390, height: 844, failRoutes: ['/api/leads'], status: 503, code: 'qa_forced_failure',
    });
    await page.getByRole('heading', { name: /Monte sua necessidade/ }).waitFor();
    await page.locator('label').filter({ hasText: 'Segurança Desarmada' }).getByRole('checkbox').check();
    const form = page.locator('form');
    await form.getByRole('textbox').nth(0).fill('Cliente Sintético QA');
    await form.getByRole('textbox').nth(1).fill('11999998888');
    await form.getByRole('textbox').nth(2).fill('Guarulhos');
    await form.getByRole('checkbox').check();
    await form.getByRole('button', { name: /Solicitar orçamento/ }).click();

    // O erro precisa ser ANUNCIADO (role=alert) e receber foco para repetição.
    const alert = page.locator('main [role="alert"]');
    await alert.waitFor();
    assert.match(await alert.innerText(), /qa_forced_failure|falha|Erro/i);
    const focus = await page.evaluate(() => {
      const el = document.activeElement;
      return el && el !== document.body ? { tag: el.tagName, text: (el.textContent || '').trim().slice(0, 80) } : null;
    });
    assert.ok(focus, 'o erro pós-submissão precisa receber foco (padrão G5)');
    assert.match(focus.text, /qa_forced_failure|falha|Erro/i);
    assert.equal(await form.getByRole('button', { name: /Solicitar orçamento/ }).isEnabled(), true,
      'o formulário precisa permanecer para nova tentativa');
    await context.close();
  } finally {
    await browser.close();
  }
});

test('browser E6 grupo 2: /orcamento registra protocolo real e anuncia sucesso', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/orcamento', { width: 1440, height: 900 });
    await page.getByRole('heading', { name: /Monte sua necessidade/ }).waitFor();
    await page.locator('label').filter({ hasText: 'Segurança Desarmada' }).getByRole('checkbox').check();
    const form = page.locator('form');
    await form.getByRole('textbox').nth(0).fill('Cliente Sintético QA Orcamento');
    await form.getByRole('textbox').nth(1).fill(`11${Date.now().toString().slice(-9)}`);
    await form.getByRole('textbox').nth(2).fill('Guarulhos');
    await form.getByRole('checkbox').check();
    const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/leads' && r.request().method() === 'POST');
    await form.getByRole('button', { name: /Solicitar orçamento/ }).click();
    const response = await pending;
    assert.ok([200, 201].includes(response.status()), `POST /api/leads: veio ${response.status()}`);
    const success = page.locator('main [role="status"]');
    await success.waitFor();
    assert.match(await success.innerText(), /Protocolo/);
    assert.match(await success.innerText(), /Sem preço automático/i);
    await context.close();
  } finally {
    await browser.close();
  }
});

test('browser E6 grupo 2: aceite com token inválido anuncia erro sem expor proposta', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/proposta/aceite/token-invalido-qa-1234567890', { width: 390, height: 844 });
    await page.getByRole('heading', { name: /Aceite de proposta comercial/ }).waitFor();
    const alert = page.locator('main [role="alert"]');
    await alert.waitFor();
    assert.match(await alert.innerText(), /Link não encontrado|link/i);
    const text = await page.locator('main').innerText();
    assert.doesNotMatch(text, /Total: R\$/, 'um token inválido não pode exibir valores de proposta');
    assert.doesNotMatch(text, /Carregando proposta…/, 'não pode ficar preso em carregando');
    assert.equal(await page.locator('main form').count(), 0, 'não pode oferecer aceite sem proposta válida');
    await context.close();
  } finally {
    await browser.close();
  }
});

test('browser E6 grupo 2: /pacotes distingue vazio e falha; /privacidade mantém minuta', { skip: !RUN }, async () => {
  const scenarios = [
    {
      route: '/pacotes', options: { width: 390, height: 844 },
      run: async page => {
        await page.getByRole('heading', { name: 'Pacotes de serviços' }).waitFor();
        await page.getByText(/Não há publicações disponíveis no momento\./).waitFor();
        assert.equal(await page.locator('main [role="alert"]').count(), 0, 'vazio não é erro');
      },
    },
    {
      route: '/pacotes',
      options: { width: 390, height: 844, failRoutes: ['/api/public/packages'], status: 503, code: 'qa_forced_failure' },
      run: async page => {
        const alert = page.locator('main [role="alert"]');
        await alert.waitFor();
        assert.match(await alert.innerText(), /Conteúdo indisponível no momento/);
        assert.doesNotMatch(await page.locator('main').innerText(), /Não há publicações disponíveis/);
      },
    },
    {
      route: '/privacidade', options: { width: 390, height: 844 },
      run: async page => {
        await page.getByRole('heading', { name: /Privacidade/ }).waitFor();
        const text = await page.locator('main').innerText();
        assert.match(text, /não comprova a aprovação formal/i);
        assert.match(text, /noindex/i);
        assert.match(text, /não substitui a política aprovada/i);
      },
    },
  ];
  for (const scenario of scenarios) {
    const browser = await launchBrowser();
    try {
      const { context, page } = await openPage(browser, scenario.route, scenario.options);
      await scenario.run(page);
      await context.close();
    } finally {
      await browser.close();
    }
  }
});

test('browser E6 grupo 2: /simulador valida etapas por teclado e nunca exibe preço', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/simulador', { width: 390, height: 844 });
    await page.getByRole('heading', { name: /Conte o que você precisa/ }).waitFor();
    // Avançar sem escolher o espaço precisa produzir erro anunciado.
    await page.getByRole('button', { name: /Continuar/ }).click();
    const alert = page.locator('main [role="alert"]');
    await alert.waitFor();
    assert.match(await alert.innerText(), /Escolha o tipo de imóvel/);
    await page.getByRole('button', { name: /Condomínio/ }).click();
    await page.getByRole('button', { name: /Continuar/ }).click();
    await page.getByRole('heading', { name: 'O que você precisa', exact: true }).waitFor();
    await page.getByRole('button', { name: /Continuar/ }).click();
    await page.getByRole('heading', { name: 'Seus dados' }).waitFor();
    // Validação de consentimento/telefone antes de avançar.
    await page.getByRole('button', { name: /Continuar/ }).click();
    await alert.waitFor();
    assert.match(await alert.innerText(), /Informe seu nome|nome/);
    const text = await page.locator('main').innerText();
    assert.doesNotMatch(text, /R\$/, 'o simulador não pode exibir preço');
    assert.match(text, /Nenhum preço|não exibe preços/i);
    await context.close();
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------------------
// E6 / UX-PRO-06 — GRUPO 3: raiz, prévias de layout e índice QA.
// Encerra as lacunas de gate automatizado do inventário (13 → 0).
// ---------------------------------------------------------------------------
const GROUP3_PREVIEW_ROUTES = [
  '/',
  '/layout-01', '/layout-02', '/layout-03', '/layout-04', '/layout-05',
  '/layout-06', '/layout-07', '/layout-08', '/layout-09', '/layout-10',
  '/layout-preview',
];
const GROUP3_NOTICE_ROUTES = GROUP3_PREVIEW_ROUTES.slice(1);

test('http E6 grupo 3: doze rotas de prévia respondem 200 e /qa/modulos é fail-closed', { skip: !RUN }, async () => {
  for (const route of GROUP3_PREVIEW_ROUTES) {
    const res = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
    assert.equal(res.status, 200, `${route} precisa responder 200, veio ${res.status}`);
  }
  const siteVisual = await api('/api/site-visual');
  assert.equal(siteVisual.status, 200, 'a leitura do layout publicado precisa estar disponível');

  // /qa/modulos só existe no cluster descartável de homologação (nome de banco,
  // BIND_HOST e flag próprios). Fora dele a rota TEM de devolver 404 e não pode
  // vazar o roteiro interno — isso é uma propriedade de segurança, não um erro.
  const qa = await fetch(`${baseUrl}/qa/modulos`, { redirect: 'manual' });
  assert.equal(qa.status, 404, `fora do modo de homologação /qa/modulos precisa ser 404, veio ${qa.status}`);
  const body = await qa.text();
  assert.doesNotMatch(body, /Roteiro de homologação local|QA-HOM-002|cliente\.a\.qa@example\.invalid/,
    'o 404 não pode vazar o índice interno de homologação');
});

test('browser E6 grupo 3: 320/390/768/1440 sem transbordo nas doze prévias', { skip: !RUN }, async () => {
  const readings = [];
  for (const [width, height] of VIEWPORTS) {
    // Chromium --single-process: um browser por viewport, como nos grupos 1/2.
    const browser = await launchBrowser();
    try {
      const { context, page } = await openPage(browser, '/', { width, height });
      for (const route of GROUP3_PREVIEW_ROUTES) {
        const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
        assert.equal(response.status(), 200, `${route} em ${width}: veio ${response.status()}`);
        if (route === '/') {
          await page.getByRole('link', { name: /Abrir módulo de aparência do site/ }).waitFor();
        } else {
          await page.locator('[data-testid="site-preview-notice"]').waitFor();
        }
        const robots = await page.locator('meta[name="robots"]').first().getAttribute('content');
        assert.match(robots || '', /noindex/i, `${route}: prévia precisa manter noindex`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        readings.push({ width, route, overflow });
        assert.ok(overflow <= 1, `${route} em ${width}px: transbordo horizontal de ${overflow}px`);
      }
      await context.close();
    } finally {
      await browser.close();
    }
  }
  assert.equal(readings.length, VIEWPORTS.length * GROUP3_PREVIEW_ROUTES.length);
});

test('browser E6 grupo 3: as onze prévias declaram aviso, voltas e alcançam links por teclado', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/layout-01', { width: 390, height: 844 });
    for (const route of GROUP3_NOTICE_ROUTES) {
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200, `${route}: veio ${response.status()}`);
      const notice = page.locator('[data-testid="site-preview-notice"]');
      await notice.waitFor();
      assert.match(await notice.innerText(), /Prévia interna/, `${route} precisa declarar que é prévia`);
      assert.match(await notice.innerText(), /não é o site público/i, `${route} precisa negar ser o site público`);
      assert.equal(await notice.getByRole('link', { name: /Abrir Aparência do site/ }).count(), 1,
        `${route} precisa oferecer caminho para a publicação auditada`);
      assert.equal(await notice.getByRole('link', { name: /Ver site atual/ }).count(), 1,
        `${route} precisa oferecer volta para a raiz`);
    }
    // Teclado: a partir do topo, Tab precisa alcançar um link real da prévia.
    await page.goto(`${baseUrl}/layout-09`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="site-preview-notice"]').waitFor();
    let reached = false;
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return el && el !== document.body ? { tag: el.tagName, href: el.getAttribute('href'), label: el.getAttribute('aria-label') } : null;
      });
      if (focused && focused.tag === 'A' && (focused.href === '/admin/aparencia' || focused.href === '/')) {
        reached = true;
        break;
      }
    }
    assert.ok(reached, 'Tab precisa alcançar os links de volta da prévia');
    await context.close();
  } finally {
    await browser.close();
  }
});

test('browser E6 grupo 3: /layout-preview valida o parâmetro e faz fallback honesto', { skip: !RUN }, async () => {
  const scenarios = [
    { query: '?visual=09', expected: /Layout 09/, invalid: false },
    { query: '?visual=03', expected: /Layout 03/, invalid: false },
    { query: '?visual=nao-existe-qa', expected: /Layout 06/, invalid: true },
    { query: '', expected: /Layout 06/, invalid: false },
  ];
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/layout-preview', { width: 390, height: 844 });
    for (const scenario of scenarios) {
      await page.goto(`${baseUrl}/layout-preview${scenario.query}`, { waitUntil: 'domcontentloaded' });
      const notice = page.locator('[data-testid="site-preview-notice"]');
      await notice.waitFor();
      const text = await notice.innerText();
      assert.match(text, scenario.expected, `${scenario.query || '(sem query)'} precisa mostrar o layout correto`);
      if (scenario.invalid) {
        assert.match(text, /não foi reconhecido/i, 'um id inválido precisa ser declarado, não silenciado');
      } else {
        assert.doesNotMatch(text, /não foi reconhecido/i, 'um id válido não pode parecer inválido');
      }
      assert.match(await page.locator('meta[name="robots"]').first().getAttribute('content') || '', /noindex/i);
    }
    await context.close();
  } finally {
    await browser.close();
  }
});

test('browser E6 grupo 3: a raiz lê o layout publicado e mantém os avisos de desenvolvimento', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/', { width: 1440, height: 900 });
    await page.getByRole('link', { name: /Abrir módulo de aparência do site/ }).waitFor();
    const visual = await api('/api/site-visual');
    assert.equal(visual.status, 200);
    assert.ok(visual.body && typeof visual.body.visual === 'string', 'a API precisa devolver um visual');
    const text = await page.locator('body').innerText();
    assert.match(text, /Grupo SEG|Segurança/i, 'a raiz precisa renderizar o site publicado');
    assert.match(text, /PRÉVIAS · SOMENTE DESENVOLVIMENTO/i,
      'em desenvolvimento a navegação de prévias precisa estar declarada');
    assert.equal(await page.getByRole('link', { name: /Abrir módulo de aparência do site/ }).count(), 1,
      'o atalho público de aparência (D7) precisa continuar acessível');
    const robots = await page.locator('meta[name="robots"]').first().getAttribute('content');
    assert.match(robots || '', /noindex/i, 'a prévia global não pode ser indexada');
    await context.close();
  } finally {
    await browser.close();
  }
});

test('http E6 grupo 3: /qa/modulos permanece fechado em variações de URL', { skip: !RUN }, async () => {
  for (const suffix of ['', '?modo=homologacao', '?visual=09']) {
    const res = await fetch(`${baseUrl}/qa/modulos${suffix}`, { redirect: 'manual' });
    assert.equal(res.status, 404, `/qa/modulos${suffix} precisa ser 404, veio ${res.status}`);
    const body = await res.text();
    assert.doesNotMatch(body, /Roteiro de homologação local|AccessPanel|QA-HOM-002/,
      `/qa/modulos${suffix} não pode vazar o índice interno`);
  }
  const headers = await fetch(`${baseUrl}/qa/modulos`, { redirect: 'manual' });
  assert.equal(headers.status, 404);
  assert.ok(!/text\/html/.test(headers.headers.get('content-type') || '') ||
    !/Roteiro de homologação/.test(await headers.text()), 'o corpo do 404 precisa ser genérico');
});

// ---------------------------------------------------------------------------
// UX-PRO-10B / 10C + 09E-8 — fechamento automatizável dos limites das prévias.
// Rotas DIRETAS /layout-01..10 (não só /layout-preview), zoom 200%,
// prefers-color-scheme claro/escuro com medição de contraste e foco por teclado.
// ---------------------------------------------------------------------------

test('browser UX-PRO-10B previas: as dez rotas diretas alcançam foco visível por teclado', { skip: !RUN }, async () => {
  for (const route of PREVIEW_DIRECT_ROUTES) {
    const browser = await launchBrowser();
    try {
      const { context, page } = await openPage(browser, route, { width: 390, height: 844 });
      await page.locator('[data-testid="site-preview-notice"]').waitFor();
      const percurso = [];
      let visible = null;
      for (let step = 1; step <= 20; step += 1) {
        await page.keyboard.press('Tab');
        const state = await focusState(page);
        if (!state) continue;
        percurso.push({ step, ...state });
        if (state.visible && !visible) visible = { step, ...state };
      }
      assert.ok(percurso.length > 0, `${route}: Tab precisa alcançar algum controle`);
      assert.ok(visible, `${route}: nenhum controle com foco visível em 20 passos de Tab`);
      const row = previewRow(route);
      row.teclado = { passos: percurso.length, primeiroFocoVisivel: visible, amostras: percurso.slice(0, 6) };
      await context.close();
    } finally {
      await browser.close();
    }
  }
});

test('browser UX-PRO-10B previas: zoom 200% não produz transbordo nas onze prévias', { skip: !RUN }, async () => {
  for (const route of PREVIEW_ALL_ROUTES) {
    const browser = await launchBrowser();
    try {
      const { context, page } = await openPage(browser, route, { width: 390, height: 844 });
      await page.locator('[data-testid="site-preview-notice"]').waitFor();
      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      await page.waitForTimeout(80);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      previewRow(route).zoom200 = { overflow, zoom: 2, viewport: '390x844' };
      assert.ok(overflow <= 1, `${route} com zoom 200%: transbordo horizontal de ${overflow}px`);
      await context.close();
    } finally {
      await browser.close();
    }
  }
});

test('browser UX-PRO-10B previas: prefers-color-scheme mede contraste e reclassifica amostras', { skip: !RUN }, async () => {
  for (const route of PREVIEW_ALL_ROUTES) {
    for (const scheme of ['light', 'dark']) {
      const browser = await launchBrowser();
      try {
        const { context, page } = await openPage(browser, route, { width: 1440, height: 900, colorScheme: scheme });
        await page.locator('[data-testid="site-preview-notice"]').waitFor();
        const contrast = await measureContrast(page, `${route}|${scheme}|main`);
        const palette = await pagePalette(page);
        // 09E-8: "não medida" precisa continuar explícita. Medir é obrigatório;
        // amostras indeterminadas são REGISTRADAS, nunca convertidas em aprovação.
        assert.equal(contrast.status, 'measured', `${route} (${scheme}): precisa produzir amostras de texto`);
        assert.ok(contrast.sampleCount > 0, `${route} (${scheme}): nenhuma amostra de contraste`);
        assert.ok(contrast.resolvedCount + contrast.indeterminateCount === contrast.sampleCount,
          `${route} (${scheme}): resolvidas + indeterminadas precisam fechar o total`);
        const row = previewRow(route);
        row.contraste[scheme] = contrast;
        row.paleta[scheme] = palette;
        await context.close();
      } finally {
        await browser.close();
      }
    }
    const row = previewRow(route);
    row.paleta.diferente = JSON.stringify(row.paleta.light) !== JSON.stringify(row.paleta.dark);
    // A igualdade NÃO é exigida: o produto pode manter a mesma paleta (PU6).
    // O que se exige é que a diferença tenha sido MEDIDA e registrada.
    assert.equal(typeof row.paleta.diferente, 'boolean');
  }
});

test('browser UX-PRO-10B previas: o iframe do Layout 01 tem título, recebe foco e permite Shift+Tab', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/layout-01', { width: 1440, height: 900 });
    const frame = page.locator('iframe[title]');
    await frame.waitFor();
    const title = await frame.getAttribute('title');
    assert.match(title || '', /Layout 01/i, 'o iframe precisa de título descritivo');
    let reachedAt = null;
    for (let step = 1; step <= 20; step += 1) {
      await page.keyboard.press('Tab');
      const tag = await page.evaluate(() => document.activeElement?.tagName || null);
      if (tag === 'IFRAME') { reachedAt = step; break; }
    }
    assert.ok(reachedAt, 'Tab precisa alcançar o iframe do Layout 01');
    await page.keyboard.press('Shift+Tab');
    const afterBack = await page.evaluate(() => document.activeElement?.tagName || null);
    assert.notEqual(afterBack, 'IFRAME', 'Shift+Tab precisa sair do iframe, sem armadilha de teclado');
    const inside = await page.frameLocator('iframe[title]').locator('body').count();
    PREVIEW_MEDICOES.iframe = {
      title, passosAteFoco: reachedAt, shiftTabSaiu: afterBack !== 'IFRAME',
      corpoAcessivel: inside > 0,
    };
    assert.ok(inside > 0, 'o conteúdo do iframe precisa estar acessível ao seletor de frame');
    await context.close();
  } finally {
    await browser.close();
  }
});

test('browser UX-PRO-10B previas: /layout-preview?visual=09 mantém foco, zoom e contraste nos dois esquemas', { skip: !RUN }, async () => {
  for (const scheme of ['light', 'dark']) {
    const browser = await launchBrowser();
    try {
      const { context, page } = await openPage(browser, '/layout-preview?visual=09', { width: 390, height: 844, colorScheme: scheme });
      await page.locator('[data-testid="site-preview-notice"]').waitFor();
      let visible = false;
      for (let step = 0; step < 12; step += 1) {
        await page.keyboard.press('Tab');
        const state = await focusState(page);
        if (state?.visible) { visible = true; break; }
      }
      assert.ok(visible, `Layout 09 (${scheme}) precisa de foco visível por teclado`);
      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `Layout 09 (${scheme}) com zoom 200%: transbordo de ${overflow}px`);
      const contrast = await measureContrast(page, `/layout-preview|${scheme}|layout09zoom`);
      assert.equal(contrast.status, 'measured', `Layout 09 (${scheme}) precisa medir contraste`);
      const row = previewRow('/layout-preview');
      row.layout09 ||= {};
      row.layout09[scheme] = { focoVisivel: visible, overflow, contraste: contrast };
      await context.close();
    } finally {
      await browser.close();
    }
  }
});
