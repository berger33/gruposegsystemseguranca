// UX-PRO-E6 — prova de DOM: um único <main> por documento nas rotas /admin.
// Executado por scripts/qa-ux-pro-e6-postgres.mjs (PostgreSQL descartável,
// HTTP real, Chromium Playwright; massa sintética criada pelas APIs/repositórios
// do próprio gate). O servidor nunca é enfraquecido: falha de sessão é injetada
// apenas em window.fetch, dentro da página.
//
// Padrão de navegador dos gates herdados: o Chromium empacotado roda com
// --single-process e não sobrevive à reutilização de contextos — cada teste abre
// o SEU browser e usa um único contexto (navegação por page.goto reutilizado).
//
// O que este gate PROVA:
//  1. varredura de TODOS os documentos /admin (páginas sob AdminGate e as três
//     exceções deliberadas): cada documento renderiza exatamente UM <main>;
//  2. nas 28 rotas E6 em estado pronto, o <main> único é o do shell
//     (data-admin-theme-scope) e a região de conteúdo (data-admin-content)
//     existe e vive dentro dele — o marco e seu nome acessível (nenhum) não
//     mudam;
//  3. os estados forbidden e error do gate continuam com um único <main>;
//  4. com UX_E6_EVIDENCE_DIR, grava varredura.json + capturas de amostra
//     (dia/noite) para revisão antes/depois; com UX_E6_WRITE_RESUMO=1 grava
//     também resumo.json legível por máquina (somente na execução "depois" —
//     antes/ fica sem resumo.json para não virar evidência vigente no inventário).
//
// O que NÃO prova: aceite humano, UAT, leitor de tela, zoom, outros navegadores
// nem conformidade WCAG.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { provisionStaff, STAFF_TEST_PASSWORD } from './helpers/staff-login.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');
const evidenceDir = process.env.UX_E6_EVIDENCE_DIR
  ? path.resolve(root, process.env.UX_E6_EVIDENCE_DIR)
  : '';
const writeResumo = process.env.UX_E6_WRITE_RESUMO === '1';

let server, baseUrl, pool;

// Todas as rotas de página de /admin; /admin/visual redireciona e não gera
// documento próprio.
const GATED_ROUTES = [
  '/admin', '/admin/analytics', '/admin/aparencia', '/admin/carteira', '/admin/clientes',
  '/admin/comercial', '/admin/compliance', '/admin/conhecimento', '/admin/continuidade',
  '/admin/contratos', '/admin/contratos/e6-sintetico-000', '/admin/crm', '/admin/emergencial',
  '/admin/expansao', '/admin/financeiro', '/admin/fornecedores', '/admin/frota',
  '/admin/funcionarios', '/admin/inteligencia', '/admin/leads', '/admin/licitacoes',
  '/admin/marcelo', '/admin/marcelo/assistente', '/admin/operacao', '/admin/patrimonio',
  '/admin/pendencias', '/admin/portal', '/admin/portal/alertas', '/admin/portal/autocadastro',
  '/admin/portal/convites', '/admin/portal/permissoes', '/admin/portal/solicitacoes',
  '/admin/publicacao', '/admin/qualidade', '/admin/relatorios', '/admin/rh/assistente',
  '/admin/satisfacao', '/admin/tema', '/admin/terceiros', '/admin/ti',
];
const STANDALONE_ROUTES = ['/admin/entrar', '/admin/convite', '/admin/verificacao-manual'];

// As 28 rotas com <main> de conteúdo antes do reparo (E6) — nas outras, o marco
// do shell é o único por projeto e o teste só exige a contagem.
const E6_CONTENT_ROUTES = [
  '/admin/analytics', '/admin/carteira', '/admin/comercial', '/admin/compliance',
  '/admin/conhecimento', '/admin/continuidade', '/admin/contratos', '/admin/contratos/e6-sintetico-000',
  '/admin/crm', '/admin/expansao', '/admin/financeiro', '/admin/frota', '/admin/funcionarios',
  '/admin/inteligencia', '/admin/licitacoes', '/admin/marcelo', '/admin/operacao',
  '/admin/pendencias', '/admin/portal/alertas', '/admin/portal/autocadastro', '/admin/portal/convites',
  '/admin/portal/permissoes', '/admin/portal/solicitacoes', '/admin/publicacao', '/admin/tema',
  '/admin/qualidade', '/admin/satisfacao', '/admin/terceiros',
];

// Amostra de captura visual dia/noite (aparência revisada por rotas representativas
// das famílias de superfície + controle sem conteúdo próprio).
const CAPTURE_SAMPLE = [
  { route: '/admin/operacao', slug: 'operacao' },
  { route: '/admin/conhecimento', slug: 'conhecimento' },
  { route: '/admin/crm', slug: 'crm' },
  { route: '/admin/pendencias', slug: 'pendencias' },
  { route: '/admin/portal/alertas', slug: 'portal-alertas' },
  { route: '/admin/publicacao', slug: 'publicacao' },
  { route: '/admin', slug: 'hub' },
];

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

function api(pathname, { method = 'GET', body, cookie } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { origin: baseUrl } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  }).then(async res => ({ status: res.status, body: await res.json().catch(() => null), setCookie: res.headers.getSetCookie?.() || [] }));
}

async function loginStaffHttp(email) {
  const res = await api('/api/admin/session', { method: 'POST', body: { email, password: STAFF_TEST_PASSWORD } });
  assert.equal(res.status, 200, `login deveria retornar 200, veio ${res.status}`);
  const raw = res.setCookie.find(c => c.startsWith('seg_admin_session='));
  assert.ok(raw, 'login precisa emitir o cookie de sessão de equipe');
  return raw.split(';')[0];
}

async function launchBrowser() {
  return playwrightChromium.launch({
    executablePath: await packagedChromium.executablePath(),
    args: packagedChromium.args.filter(arg => arg !== '--disable-web-security'),
    headless: true,
  });
}

/** Um contexto único por browser (padrão herdado); página reutilizada por goto. */
async function openSession(browser, cookie, { width = 1440, height = 900, failSession = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  const separator = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(120_000);
  if (failSession) {
    await page.addInitScript(() => {
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        if (url.includes('/api/admin/session')) {
          return new Response(JSON.stringify({ error: 'e6_inject' }), {
            status: 503, headers: { 'content-type': 'application/json' },
          });
        }
        return original(input, init);
      };
    });
  }
  return { context, page };
}

async function gotoRoute(page, route, standalone) {
  // Retry de navegação (3 tentativas): o compilador dev pode estagnar em uma
  // visita isolada (observado em /admin/expansao); as asserções não mudam.
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
      if (standalone) {
        await page.waitForFunction(() => document.querySelectorAll('main').length >= 1);
        return;
      }
      // Sai do estado transitório "checking" (que já tem 1 <main> próprio): pronto,
      // forbidden ou error carregam o marcador correspondente.
      await page.waitForFunction(() =>
        document.querySelector('[data-admin-chrome="true"]') || document.querySelector('[data-admin-gate="error"]'));
      return;
    } catch (error) {
      lastError = error;
      console.error(`E6DBG: gotoRoute ${route} tentativa ${attempt}/3 falhou: ${String(error).split('\n')[0]}`);
    }
  }
  throw lastError;
}

/** Medição estrutural do documento, em uma rodada. */
const measure = () => ({
  mains: [...document.querySelectorAll('main')].map(m => m.outerHTML.slice(0, 120)),
  mainCount: document.querySelectorAll('main').length,
  shellMain: Boolean(document.querySelector('main[data-admin-theme-scope="true"]')),
  contentRegions: document.querySelectorAll('[data-admin-content="true"]').length,
  contentInsideMain: [...document.querySelectorAll('[data-admin-content="true"]')].every(el => el.closest('main') !== null),
  landmarks: [...document.querySelectorAll('main,nav,header,footer,[role=main],[role=navigation]')]
    .filter(el => el.getClientRects().length > 0)
    .map(el => el.tagName.toLowerCase() + (el.getAttribute('aria-label') ? `[aria-label=${el.getAttribute('aria-label')}]` : '')),
  // Impressão de aparência: geometria + estilos computados, SEM o nome da tag
  // (a tag do conteúdo muda de main para div — a intenção da fatia).
  fingerprintInput: [...document.querySelectorAll('body *')].map(el => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return [el.getAttribute('class') || '', el.getAttribute('style') || '',
      Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height),
      s.display, s.position, s.color, s.backgroundColor, s.fontSize, s.fontWeight, s.overflowWrap].join('\u0001');
  }).join('\u0002'),
  scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
});

function fingerprintOf(input) {
  return createHash('sha256').update(input).digest('hex').slice(0, 32);
}

async function saveEvidence(name, data) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(path.join(evidenceDir, name), `${JSON.stringify(data, null, 1)}\n`);
}

const sweepRows = [];

before(async () => {
  if (!RUN) return;
  const port = 3000 + Math.floor(Math.random() * 2000);
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.mjs', '--dev'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: '127.0.0.1',
      NODE_ENV: 'development',
      NEXT_DIST_DIR: '.next/integration-ux-e6',
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      EMPLOYEE_SESSION_SECRET: randomUUID().repeat(2),
      // Fórmula correta do harness (guarda E6): roundtrip de mfaKey() exige
      // 32 bytes de entropia em base64url — NÃO usar Buffer.from(randomUUID()).
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
  // Logs do servidor encaminhados para o stderr do gate (diagnóstico em CI).
  server.stdout.on('data', () => {});
  server.stderr.on('data', chunk => process.stderr.write(chunk));
  server.on('exit', (code, signal) => console.error(`E6DBG: servidor saiu code=${code} signal=${signal}`));
  await waitForServer(baseUrl);
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  console.error('E6DBG: before() concluído — servidor e pool prontos');
});

after(async () => {
  await saveEvidence('varredura.json', {
    stage: 'ux-pro-e6',
    gerado_em: new Date().toISOString(),
    base: 'ver relatório da subfatia (SHA registrado em UX-PRO-E6-RELATORIO)',
    entries: sweepRows,
  });
  if (writeResumo && evidenceDir) {
    const entries = sweepRows.filter(row => row.screenshot).map(row => ({
      stage: 'ux-pro-e6',
      route: row.route,
      role: row.role,
      viewport: row.viewport,
      theme: row.theme,
      screenshot: path.relative(root, path.join(evidenceDir, row.screenshot)).replaceAll('\\', '/'),
      problems: row.problems,
      state: 'depois',
      mainCount: row.mainCount,
      landmarks: row.landmarks,
    }));
    await saveEvidence('resumo.json', {
      stage: 'ux-pro-e6',
      gerado_em: new Date().toISOString(),
      observacao: 'captura estrutural/visual do reparo E6; problemas derivados da medição (mainCount != 1, marco ausente ou região de conteúdo fora do main)',
      entries,
    });
  }
  await pool?.end().catch(() => {});
  if (server && !server.killed) { server.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); server.kill('SIGKILL'); }
});

test('UX-PRO-E6: varredura — todo documento /admin renderiza exatamente um <main>', { skip: !RUN }, async () => {
  const admin = await provisionStaff(pool, { role: 'admin' });
  const cookie = await loginStaffHttp(admin.email);
  const browser = await launchBrowser();
  const problems = [];
  let routeIndex = 0;
  const total = GATED_ROUTES.length + STANDALONE_ROUTES.length;
  try {
    const { context, page } = await openSession(browser, cookie);
    for (const route of [...GATED_ROUTES, ...STANDALONE_ROUTES]) {
      routeIndex += 1;
      if (routeIndex % 5 === 0) console.error(`E6DBG: caso 1 — rota ${routeIndex}/${total} (${route})`);
      const standalone = STANDALONE_ROUTES.includes(route);
      await gotoRoute(page, route, standalone);
      const m = await page.evaluate(measure);
      const routeProblems = [];
      if (m.mainCount !== 1) routeProblems.push(`mainCount=${m.mainCount} (esperado 1)`);
      if (routeProblems.length) problems.push(`${route}: ${routeProblems.join('; ')}`);
      sweepRows.push({
        route, role: 'admin', viewport: '1440x900', theme: 'day', estado: standalone ? 'autonoma' : 'gate',
        mainCount: m.mainCount, mains: m.mains, shellMain: m.shellMain,
        contentRegions: m.contentRegions, contentInsideMain: m.contentInsideMain,
        landmarks: m.landmarks, fingerprint: fingerprintOf(m.fingerprintInput),
        scroll: m.scroll, problems: routeProblems,
      });
    }
    await context.close().catch(() => {});
  } finally {
    await browser.close().catch(() => {});
  }
  assert.deepEqual(problems, [],
    `UX-PRO-E6: documento(s) /admin com <main> != 1:\n${problems.join('\n')}`);
});

test('UX-PRO-E6: nas rotas E6 o <main> único é o do shell e a região de conteúdo vive dentro dele', { skip: !RUN }, async () => {
  const admin = await provisionStaff(pool, { role: 'admin' });
  const cookie = await loginStaffHttp(admin.email);
  const browser = await launchBrowser();
  const problems = [];
  try {
    const { context, page } = await openSession(browser, cookie);
    for (const route of E6_CONTENT_ROUTES) {
      await gotoRoute(page, route, false);
      const m = await page.evaluate(measure);
      if (m.mainCount !== 1) problems.push(`${route}: mainCount=${m.mainCount} (esperado 1)`);
      if (!m.shellMain) problems.push(`${route}: o <main> único não é o do shell (data-admin-theme-scope ausente)`);
      if (m.contentRegions !== 1) problems.push(`${route}: regiões [data-admin-content]=${m.contentRegions} (esperado 1)`);
      if (!m.contentInsideMain) problems.push(`${route}: região de conteúdo fora do <main>`);
      if (m.landmarks.filter(entry => entry === 'main').length !== 1) {
        problems.push(`${route}: landmarks=${JSON.stringify(m.landmarks)} com main != 1`);
      }
    }
    await context.close().catch(() => {});
  } finally {
    await browser.close().catch(() => {});
  }
  assert.deepEqual(problems, [],
    `UX-PRO-E6: marco/estrutura divergente:\n${problems.join('\n')}`);
});

test('UX-PRO-E6: estado forbidden do gate mantém um único <main> e não renderiza conteúdo de página', { skip: !RUN }, async () => {
  const ti = await provisionStaff(pool, { role: 'ti' });
  const cookie = await loginStaffHttp(ti.email);
  const browser = await launchBrowser();
  try {
    // /admin/contratos exige marcelo/admin/comercial: ti cai no forbidden do gate.
    const { context, page } = await openSession(browser, cookie);
    await gotoRoute(page, '/admin/contratos', false);
    await page.waitForFunction(() => document.querySelector('[data-admin-gate="forbidden"]'));
    const m = await page.evaluate(measure);
    assert.equal(m.mainCount, 1, `estado forbidden: mainCount=${m.mainCount} (esperado 1)`);
    assert.equal(m.shellMain, true, 'estado forbidden mantém o marco do shell');
    assert.equal(m.contentRegions, 0, 'estado forbidden não renderiza a região de conteúdo da página');
    await context.close().catch(() => {});
  } finally {
    await browser.close().catch(() => {});
  }
});

test('UX-PRO-E6: estado error do gate mantém um único <main>', { skip: !RUN }, async () => {
  const admin = await provisionStaff(pool, { role: 'admin' });
  const cookie = await loginStaffHttp(admin.email);
  const browser = await launchBrowser();
  try {
    const { context, page } = await openSession(browser, cookie, { failSession: true });
    await gotoRoute(page, '/admin/operacao', false);
    await page.waitForFunction(() => document.querySelector('[data-admin-gate="error"]'));
    const m = await page.evaluate(measure);
    assert.equal(m.mainCount, 1, `estado error: mainCount=${m.mainCount} (esperado 1)`);
    assert.equal(m.shellMain, true, 'estado error mantém o marco do shell');
    await context.close().catch(() => {});
  } finally {
    await browser.close().catch(() => {});
  }
});

test('UX-PRO-E6: captura de amostra dia/noite com medições por rota (evidência)', { skip: !RUN }, async () => {
  const admin = await provisionStaff(pool, { role: 'admin' });
  const cookie = await loginStaffHttp(admin.email);
  for (const sample of CAPTURE_SAMPLE) {
    for (const viewport of ['1440x900', '390x844']) {
      const [width, height] = viewport.split('x').map(Number);
      for (const theme of ['day', 'night']) {
        // Browser novo por captura: screenshots fullPage repetidos derrubam o
        // alvo do Chromium --single-process empacotado.
        const browser = await launchBrowser();
        try {
          const { context, page } = await openSession(browser, cookie, { width, height });
          await gotoRoute(page, sample.route, false);
          // O toggle grava este atributo em <html>; aplicá-lo diretamente renderiza
          // exatamente o mesmo tema (admin-theme/AdminChrome.module.css).
          await page.evaluate(t => {
            if (t === 'night') document.documentElement.dataset.adminTheme = 'night';
            else delete document.documentElement.dataset.adminTheme;
          }, theme);
          const m = await page.evaluate(measure);
          const file = `ux-pro-e6-${sample.slug}-${viewport}-${theme}.png`;
          const routeProblems = [];
          if (m.mainCount !== 1) routeProblems.push(`mainCount=${m.mainCount} (esperado 1)`);
          if (evidenceDir) {
            await mkdir(evidenceDir, { recursive: true });
            await page.screenshot({ path: path.join(evidenceDir, file), fullPage: true });
          }
          sweepRows.push({
            route: sample.route, role: 'admin', viewport, theme, estado: 'captura',
            mainCount: m.mainCount, shellMain: m.shellMain, contentRegions: m.contentRegions,
            contentInsideMain: m.contentInsideMain, landmarks: m.landmarks,
            fingerprint: fingerprintOf(m.fingerprintInput), scroll: m.scroll,
            problems: routeProblems, screenshot: evidenceDir ? file : '',
          });
          await context.close().catch(() => {});
        } finally {
          await browser.close().catch(() => {});
        }
      }
    }
  }
  const captured = sweepRows.filter(row => row.estado === 'captura');
  assert.equal(captured.length, CAPTURE_SAMPLE.length * 4,
    'a amostra de captura precisa fechar 7 rotas × 2 temas × 2 larguras');
  const captureProblems = captured.flatMap(row => row.problems.map(p => `${row.route} ${row.viewport} ${row.theme}: ${p}`));
  assert.deepEqual(captureProblems, [],
    `UX-PRO-E6: captura com documento fora do contrato:\n${captureProblems.join('\n')}`);
});
