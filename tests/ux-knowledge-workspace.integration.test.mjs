// UX-07 / EXT-08 — navegador real + servidor real + PostgreSQL temporário.
// O gate não altera API, rotas, migrações ou autorização para testar a tela.
// A massa fictícia nasce nas APIs canônicas, nunca por SQL de negócio.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { provisionStaff, STAFF_TEST_PASSWORD } from './helpers/staff-login.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');
let server, pool, baseUrl, adminCookie, financeCookie;
let publishedArticle, draftArticle;

const key = label => `ext08-ux-${label}-${randomUUID()}`;

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(timeoutMs = 180_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const response = await fetch(`${baseUrl}/api/admin/session`);
      if ([200, 401].includes(response.status)) return;
    } catch { /* processo ainda iniciando */ }
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error('server_did_not_start');
}

async function api(pathname, { method = 'GET', body, cookie, idempotencyKey, origin = baseUrl } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { origin, 'idempotency-key': idempotencyKey || key('request') } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function login(email) {
  const response = await fetch(`${baseUrl}/api/admin/session`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', origin: baseUrl },
    body: JSON.stringify({ email, password: STAFF_TEST_PASSWORD }),
  });
  assert.equal(response.status, 200, 'sessão de equipe deve ser criada pelo login real');
  const cookie = (response.headers.getSetCookie?.() || []).find(value => value.startsWith('seg_admin_session='));
  assert.ok(cookie, 'login deve devolver cookie de sessão');
  return cookie.split(';')[0];
}

async function launchBrowser() {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await playwrightChromium.launch({
        executablePath: await packagedChromium.executablePath(),
        args: packagedChromium.args.filter(argument => argument !== '--disable-web-security'),
        headless: true,
      });
    } catch (error) {
      last = error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw last;
}

async function openPage(browser, cookie, { width = 1440, height = 900, failRoutes = [], failStatus = 503, failCode = 'database_error', presentAdminSession = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  const separator = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(90_000);
  if (failRoutes.length || presentAdminSession) {
    await page.addInitScript(({ routes, status, code, showAdminMenu }) => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        // A simulação é APENAS da apresentação do menu. A chamada EXT-08
        // continua com o cookie financeiro real e o 403 abaixo vem do servidor
        // canônico, provando que o menu não substitui autorização.
        if (showAdminMenu && url.includes('/api/admin/session') && (!init?.method || init.method === 'GET')) {
          return new Response(JSON.stringify({ role: 'admin', identityId: null, mfaVerified: true, expiresAt: '2099-01-01T00:00:00.000Z' }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (routes.some(route => url.includes(route))) {
          return new Response(JSON.stringify({ error: code }), { status, headers: { 'content-type': 'application/json' } });
        }
        return originalFetch(input, init);
      };
    }, { routes: failRoutes, status: failStatus, code: failCode, showAdminMenu: presentAdminSession });
  }
  await page.goto(`${baseUrl}/admin/conhecimento`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1, name: 'Base de Conhecimento e Procedimentos Operacionais' }).waitFor();
  return { context, page };
}

before(async () => {
  if (!RUN) return;
  baseUrl = `http://127.0.0.1:${await freePort()}`;
  server = spawn(process.execPath, ['server.mjs', '--dev'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: baseUrl.split(':').at(-1),
      BIND_HOST: '127.0.0.1',
      NODE_ENV: 'development',
      NEXT_DIST_DIR: '.next/integration-ux-knowledge',
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      EMPLOYEE_SESSION_SECRET: randomUUID().repeat(2),
      ADMIN_LOGIN_MAX_ATTEMPTS: '200',
      SITE_ADMIN_LEGACY_TOKENS: '',
      OLLAMA_ENABLED: 'false',
      MAIL_HOST: '',
      NEXT_TELEMETRY_DISABLED: '1',
      AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', () => {});
  await waitForServer();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  const admin = await provisionStaff(pool, { role: 'admin' });
  const finance = await provisionStaff(pool, { role: 'financeiro' });
  adminCookie = await login(admin.email);
  financeCookie = await login(finance.email);

  const published = await api('/api/ext/knowledge/articles', {
    method: 'POST', cookie: adminCookie,
    body: {
      slug: 'pop-seguranca-portaria-ux07',
      title: 'POP de controle de acesso à portaria',
      summary: 'Passos canônicos para identificação, registro e liberação de visitantes da unidade.',
      content: 'Este procedimento descreve a identificação, o registro e a liberação de visitantes na portaria, com conferência obrigatória de credencial.',
      category: 'seguranca', tags: ['portaria', 'acesso'], access_roles: [],
    },
  });
  assert.equal(published.status, 201);
  publishedArticle = published.body.article;
  for (const status of ['em_revisao', 'aprovado', 'publicado']) {
    const transition = await api(`/api/ext/knowledge/articles/${publishedArticle.id}/transition`, { method: 'POST', cookie: adminCookie, body: { status, notes: 'Transição sintética do gate de interface.' } });
    assert.equal(transition.status, 200, `transição ${status} precisa ser canônica`);
    publishedArticle = transition.body.article;
  }

  const draft = await api('/api/ext/knowledge/articles', {
    method: 'POST', cookie: adminCookie,
    body: {
      slug: 'pop-sem-resumo-ux07',
      title: 'POP sem resumo para ausência honesta',
      content: 'Este procedimento de teste permanece em rascunho para demonstrar ausência explícita de resumo e de data de publicação.',
      category: 'operacional', tags: [], access_roles: [],
    },
  });
  assert.equal(draft.status, 201);
  draftArticle = draft.body.article;

  // Aguarda a compilação de produto antes de asserções de navegador.
  const deadline = Date.now() + 240_000;
  while (true) {
    const response = await fetch(`${baseUrl}/admin/conhecimento`, { redirect: 'manual' }).catch(() => null);
    if (response && response.status !== 404) break;
    if (Date.now() > deadline) throw new Error('knowledge_page_compile_timeout');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) {
    server.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 300));
    server.kill('SIGKILL');
  }
});

test('EXT-08 UX: rota canônica exige sessão e negativa não vaza lista', { skip: !RUN }, async () => {
  const anonymous = await api('/api/ext/knowledge/articles');
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error, 'unauthorized');
  assert.ok(!('items' in anonymous.body), '401 não deve disfarçar nem vazar uma lista');
});

test('EXT-08 UX: recusa real do servidor vira estado NEGADO, não lista vazia', { skip: !RUN }, async () => {
  const denied = await api(`/api/ext/knowledge/articles/${publishedArticle.id}/acknowledgments`, { cookie: financeCookie });
  assert.equal(denied.status, 403, 'financeiro pode ler o POP publicado, mas não a métrica protegida');
  assert.equal(denied.body.error, 'forbidden_role');

  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, financeCookie, { presentAdminSession: true });
    await page.getByRole('button', { name: `Abrir procedimento ${publishedArticle.title}` }).click();
    await page.getByRole('tab', { name: 'Histórico e ciência', exact: true }).click();
    const panel = page.locator('[data-testid="knowledge-acknowledgments"]');
    const state = panel.locator('[data-ui-state="denied"]');
    await state.waitFor();
    const text = await state.textContent();
    assert.match(text, /Papel sem permissão/i);
    assert.match(text, /Menu não é autorização/i);
    assert.equal(await panel.locator('[data-ui-state="empty"]').count(), 0, '403 não pode aparecer como ausência de ciência');
    await context.close();
  } finally {
    await browser.close().catch(() => {});
  }
});

test('EXT-08 UX: falha de rede em ciência não apaga detalhe nem histórico', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, adminCookie, { failRoutes: ['/acknowledgments'] });
    await page.getByRole('button', { name: `Abrir procedimento ${publishedArticle.title}` }).click();
    await page.locator('[data-testid="knowledge-version-detail"]').waitFor();
    await page.getByRole('tab', { name: 'Histórico e ciência', exact: true }).click();
    await page.locator('[data-testid="knowledge-history"] ul li').first().waitFor();
    const science = page.locator('[data-testid="knowledge-acknowledgments"]');
    const error = science.locator('[data-ui-state="error"]');
    await error.waitFor();
    assert.match(await error.textContent(), /falha não significa que não existam as ciências registradas/i);
    assert.equal(await science.locator('[data-ui-state="empty"]').count(), 0, 'falha de ciência não vira vazio');
    assert.ok(await page.locator('[data-testid="knowledge-history"] ul li').count(), 'histórico independente continua na tela');
    // Apenas um painel de aba fica montado por acessibilidade. Ao voltar, o
    // detalhe independente já carregado precisa continuar disponível.
    await page.getByRole('tab', { name: 'Detalhe e versões', exact: true }).click();
    await page.locator('[data-testid="knowledge-version-detail"]').waitFor();
    await context.close();
  } finally {
    await browser.close().catch(() => {});
  }
});

test('EXT-08 UX: tablist usa roving tabindex e teclado', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, adminCookie);
    const tabs = page.getByRole('tab');
    assert.equal(await tabs.count(), 4);
    assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1);
    assert.equal(await page.locator('[role="tabpanel"]').count(), 1);
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true');
    assert.equal(await tabs.nth(1).evaluate(element => element === document.activeElement), true);
    await page.keyboard.press('End');
    assert.equal(await tabs.nth(3).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await tabs.nth(3).getAttribute('aria-selected'), 'true');
    await context.close();
  } finally {
    await browser.close().catch(() => {});
  }
});

test('EXT-08 UX: jornada traduz estados reais e declara ausência sem data inventada', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, adminCookie);
    const list = page.locator('[data-testid="knowledge-articles-list"]');
    await list.waitFor();
    const listText = await list.textContent();
    assert.match(listText, /Segurança/);
    assert.match(listText, /Publicado/);
    assert.doesNotMatch(listText, /\bseguranca\b|\bpublicado\b|\bem_revisao\b|\brascunho\b/);

    await page.getByRole('button', { name: `Abrir procedimento ${draftArticle.title}` }).click();
    const detail = page.locator('[data-testid="knowledge-version-detail"]');
    await detail.waitFor();
    const detailText = await detail.textContent();
    assert.match(detailText, /Resumo não informado/);
    assert.match(detailText, /Dado ausente/);
    assert.doesNotMatch(detailText, /01\/01\/1970/);
    await context.close();
  } finally {
    await browser.close().catch(() => {});
  }
});

test('EXT-08 UX: viewport 390px não cria rolagem horizontal do documento', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, adminCookie, { width: 390, height: 844 });
    await page.locator('[data-testid="knowledge-articles-list"]').waitFor();
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `houve ${overflow}px de transbordo horizontal em 390px`);
    await context.close();
  } finally {
    await browser.close().catch(() => {});
  }
});
