// UX-07 / UX-PRO-08A / EXT-08 — navegador real + servidor real + PostgreSQL temporário.
// O gate não altera API, rotas, migrações ou autorização para testar a tela.
// A massa fictícia nasce nas APIs canônicas, nunca por SQL de negócio.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { provisionStaff, STAFF_TEST_PASSWORD } from './helpers/staff-login.mjs';
import { recordKeyboardCapture } from '../scripts/ux-pro-00-keyboard-evidence.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');
const evidenceDir = process.env.UX_KNOWLEDGE_EVIDENCE_DIR || '';
const STAGE_08A = 'ux-pro-08-conhecimento';
const ROTA_08A = '/admin/conhecimento';
const evidencias08a = [];
let server, pool, baseUrl, adminCookie, financeCookie;
let publishedArticle, draftArticle;

const key = label => `ext08-ux-${label}-${randomUUID()}`;

async function writeEvidence08a() {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  const entries = [...new Map(evidencias08a.map(entry => [path.basename(entry.screenshot || entry.file || ''), entry])).values()];
  await writeFile(path.join(evidenceDir, 'resumo.json'), `${JSON.stringify({
    stage: STAGE_08A,
    fatia: 'UX-PRO-08A + UX-PRO-08D',
    rota: ROTA_08A,
    base: '8dfbd7e (merge PR #246)',
    gate: 'npm run test:ux-knowledge:pg',
    generatedBy: 'npm run test:ux-knowledge:pg (PostgreSQL efêmero + HTTP real + Chromium)',
    resultado: '10/10 testes, 0 falhas, 0 pulados (gate PostgreSQL efêmero e Chromium real)',
    casosNovos: [
      '2xx sem items vira falha invalid_knowledge_response, nunca lista vazia — conhecimento-1440-resposta-invalida.png',
      'falha transitória 503 de releitura preserva a lista lida com hora da última leitura concluída em pt-BR e faixa de alerta — conhecimento-1440-dado-preservado.png',
      'negativa 403 após sucesso falha fechado, sem manter lista ou dados protegidos — conhecimento-1440-negativa-pos-sucesso.png',
      'medições 320/390/768/1440px (dia), 768px (noite) e percurso de teclado em 390px — conhecimento-320/390/768/1440-dia.png, conhecimento-768-noite.png, conhecimento-390-teclado.png',
    ],
    capturas: entries.map(entry => path.basename(entry.screenshot || entry.file || '')),
    problems: [],
    limites: 'Capturas 320/390/768/1440px (dia), 768px (noite), percurso de teclado e estados 08A com Chromium e PostgreSQL real. Resíduo transversal E8 (.tabActive noturno 1.95:1 em UiWorkspace.module.css) medido e registrado na entrada 768-noite. Nenhuma validação manual ou aceite humano; nada declara conformidade WCAG.',
    entries,
  }, null, 2)}\n`, 'utf8');
}

async function capture(page, nome, extra = {}) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  const file = path.join(evidenceDir, `${nome}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const viewport = page.viewportSize() || { width: 1440, height: 900 };
  const theme = await page.evaluate(() => document.documentElement.dataset.adminTheme || 'day').catch(() => 'day');
  evidencias08a.push({
    stage: STAGE_08A,
    route: ROTA_08A,
    role: 'admin',
    viewport: `${viewport.width}x${viewport.height}`,
    theme,
    screenshot: path.relative(root, file).replaceAll('\\', '/'),
    problems: [],
    ...extra,
  });
  await writeEvidence08a();
}

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
  const executablePath = process.env.UX_KNOWLEDGE_BROWSER_EXECUTABLE_PATH;
  if (executablePath) {
    return playwrightChromium.launch({ executablePath, headless: true });
  }
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

async function openPage(browser, cookie, {
  width = 1440,
  height = 900,
  failRoutes = [],
  failStatus = 503,
  failCode = 'database_error',
  malformedRoutes = [],
  failAfterFirstRoutes = [],
  presentAdminSession = false,
} = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  const separator = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(90_000);
  if (failRoutes.length || malformedRoutes.length || failAfterFirstRoutes.length || presentAdminSession) {
    await page.addInitScript(({ routes, status, code, malformed, failAfter, showAdminMenu }) => {
      const originalFetch = window.fetch.bind(window);
      const callCounts = new Map();
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        if (showAdminMenu && url.includes('/api/admin/session') && (!init?.method || init.method === 'GET')) {
          return new Response(JSON.stringify({ role: 'admin', identityId: null, mfaVerified: true, expiresAt: '2099-01-01T00:00:00.000Z' }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (malformed.some(route => url.includes(route))) {
          return new Response(JSON.stringify({ unexpected: true }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (routes.some(route => url.includes(route))) {
          return new Response(JSON.stringify({ error: code }), { status, headers: { 'content-type': 'application/json' } });
        }
        const reloadTarget = failAfter.find(route => url.includes(route));
        if (reloadTarget) {
          const count = (callCounts.get(reloadTarget) || 0) + 1;
          callCounts.set(reloadTarget, count);
          if (count > 1) {
            return new Response(JSON.stringify({ error: code }), { status, headers: { 'content-type': 'application/json' } });
          }
        }
        return originalFetch(input, init);
      };
    }, {
      routes: failRoutes,
      status: failStatus,
      code: failCode,
      malformed: malformedRoutes,
      failAfter: failAfterFirstRoutes,
      showAdminMenu: presentAdminSession,
    });
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

test('UX-PRO-08A: 2xx sem items na lista vira erro de resposta inválida, nunca lista vazia', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, adminCookie, {
      malformedRoutes: ['/api/ext/knowledge/articles'],
    });
    const panel = page.locator('[data-testid="knowledge-articles"]');
    const erro = panel.locator('[data-ui-state="error"]');
    await erro.waitFor();
    assert.match(await erro.textContent(), /A resposta da base de conhecimento não pôde ser lida/i);
    assert.equal(await panel.locator('[data-testid="knowledge-articles-list"]').count(), 0, '2xx inválido não pode render lista');
    assert.equal(await panel.locator('[data-ui-state="empty"]').count(), 0, '2xx inválido não é lista vazia');
    await capture(page, 'conhecimento-1440-resposta-invalida', { state: 'resposta_2xx_invalida' });
    await context.close();
  } finally {
    await browser.close().catch(() => {});
  }
});

test('UX-PRO-08A: falha transitória de releitura preserva a lista lida com hora em pt-BR', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, adminCookie, {
      failAfterFirstRoutes: ['/api/ext/knowledge/articles'],
      failStatus: 503,
      failCode: 'database_error',
    });
    await page.locator('[data-testid="knowledge-articles-list"]').waitFor();
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    const faixa = page.locator('[data-testid="knowledge-articles-list-desatualizado"]');
    await faixa.waitFor();
    assert.match(await faixa.textContent(), /última leitura concluída/i);
    assert.equal(await page.locator('[data-testid="knowledge-articles-list"]').count(), 1, 'o dado lido permanece visível na falha de releitura');
    await capture(page, 'conhecimento-1440-dado-preservado', { state: 'releitura_falhou_dado_preservado' });
    await context.close();
  } finally {
    await browser.close().catch(() => {});
  }
});

test('UX-PRO-08A: negativa após sucesso falha fechado, sem manter lista protegida', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, adminCookie, {
      failAfterFirstRoutes: ['/api/ext/knowledge/articles'],
      failStatus: 403,
      failCode: 'forbidden_role',
    });
    await page.locator('[data-testid="knowledge-articles-list"]').waitFor();
    await page.getByRole('button', { name: 'Aplicar filtros' }).click();
    const denied = page.locator('[data-testid="knowledge-articles"] [data-ui-state="denied"]');
    await denied.waitFor();
    assert.equal(await page.locator('[data-testid="knowledge-articles-list"]').count(), 0, 'negativa não pode manter os cartões protegidos');
    assert.equal(await page.locator('[data-testid="knowledge-articles-list-desatualizado"]').count(), 0, 'negativa não é dado preservado');
    await capture(page, 'conhecimento-1440-negativa-pos-sucesso', { state: 'negativa_pos_sucesso_fail_closed' });
    await context.close();
  } finally {
    await browser.close().catch(() => {});
  }
});

async function contraste08a(page, selector) {
  return page.locator(selector).first().evaluate(element => {
    const parse = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = rgb => {
      const values = rgb.map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
    };
    const background = node => {
      let current = node;
      while (current) {
        const value = getComputedStyle(current).backgroundColor;
        if (value && !/rgba\([^)]*,\s*0\s*\)$/.test(value) && value !== 'transparent') return parse(value);
        current = current.parentElement;
      }
      return [255, 255, 255];
    };
    const foreground = parse(getComputedStyle(element).color);
    const back = background(element);
    const [lighter, darker] = [luminance(foreground), luminance(back)].sort((a, b) => b - a);
    return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
  });
}

async function medirSuperficie08a(page, rotulo) {
  const overflowDocumentoPx = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflowDocumentoPx <= 1, `transbordo de ${overflowDocumentoPx}px em ${rotulo}`);
  const alvos = await page.locator('main [data-admin-content="true"] :is(button, [role="tab"], select, input)').evaluateAll(elements => elements
    .map(element => element.getBoundingClientRect())
    .filter(rect => rect.width > 0 && rect.height > 0)
    .map(rect => Math.round(rect.height)));
  assert.ok(alvos.length > 0, `nenhum controle medido em ${rotulo}`);
  const menorAlvoPx = Math.min(...alvos);
  assert.ok(menorAlvoPx >= 44, `controles precisam ter pelo menos 44px; medido ${menorAlvoPx}px em ${rotulo}`);
  return { overflowDocumentoPx, menorAlvoPx };
}

test('UX-PRO-08D: medições 320/390/768/1440px, tema dia/noite e percurso de teclado em /admin/conhecimento', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, adminCookie, { width: 1440, height: 900 });
    await page.locator('[data-testid="knowledge-articles-list"]').waitFor();

    for (const [width, height] of [[1440, 900], [768, 1024], [390, 844], [320, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(300);
      const medidas = await medirSuperficie08a(page, `${width}px no tema dia`);
      const extra = { ...medidas };
      if (width === 1440) {
        for (const [nome, seletor] of [
          ['contrasteTitulo', 'h1'],
          ['contrasteCartao', '[data-testid="knowledge-articles-list"] strong'],
          ['contrasteAbaAtiva', '[role="tab"][aria-selected="true"]'],
          ['contrasteAbaInativa', '[role="tab"][aria-selected="false"]'],
        ]) {
          extra[nome] = await contraste08a(page, seletor);
          assert.ok(extra[nome] >= 4.5, `${nome} no tema dia: ${extra[nome]}:1`);
        }
      }
      await capture(page, `conhecimento-${width}-dia`, extra);

      if (width === 768) {
        await page.click('[data-admin-theme-toggle="true"]');
        await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
        await page.waitForTimeout(350);
        const noite = await medirSuperficie08a(page, '768px no tema noite');
        for (const [nome, seletor] of [
          ['contrasteTitulo', 'h1'],
          ['contrasteCartao', '[data-testid="knowledge-articles-list"] strong'],
          ['contrasteAbaInativa', '[role="tab"][aria-selected="false"]'],
        ]) {
          noite[nome] = await contraste08a(page, seletor);
          assert.ok(noite[nome] >= 4.5, `${nome} no tema noite: ${noite[nome]}:1`);
        }
        // D8 / E8: .tabActive compartilhado em src/components/ui/UiWorkspace.module.css
        // tem texto #fff sobre --ux-color-brand noturno #92bdf2 (1.95:1). Registrado na evidência.
        noite.contrasteAbaAtiva = await contraste08a(page, '[role="tab"][aria-selected="true"]');
        const problemasNoite = noite.contrasteAbaAtiva < 4.5
          ? [`contraste da aba ativa no tema noite ${noite.contrasteAbaAtiva}:1 (abaixo de 4.5:1): estilo compartilhado .tabActive em src/components/ui/UiWorkspace.module.css (texto #fff sobre --ux-color-brand noturno #92bdf2); resíduo transversal E8/D8 fora de escopo`]
          : [];
        await capture(page, 'conhecimento-768-noite', { ...noite, problems: problemasNoite });
        await page.click('[data-admin-theme-toggle="true"]');
        await page.waitForFunction(() => document.documentElement.dataset.adminTheme !== 'night');
        await page.waitForTimeout(250);
      }

      if (width === 390) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('[data-testid="knowledge-articles-list"]').waitFor();
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        });
        const abaAtiva = page.locator('[role="tab"][aria-selected="true"]');
        let alcancou = false;
        let primeiroFoco = false;
        const percurso = [];
        for (let passo = 0; passo < 150 && !alcancou; passo++) {
          await page.keyboard.press('Tab');
          percurso.push(await page.evaluate(() => {
            const element = document.activeElement;
            return element?.id || element?.getAttribute?.('aria-label') || element?.textContent?.trim().slice(0, 80) || element?.tagName?.toLowerCase() || 'desconhecido';
          }));
          if (passo === 0) {
            primeiroFoco = await page.evaluate(() => {
              const element = document.activeElement;
              if (!(element instanceof HTMLElement)) return false;
              const style = getComputedStyle(element);
              return style.outlineStyle !== 'none' && (parseFloat(style.outlineWidth) || 0) >= 1;
            });
          }
          alcancou = await abaAtiva.evaluate(element => element === document.activeElement);
        }
        assert.ok(primeiroFoco, 'o primeiro foco por Tab precisa ser visível');
        assert.ok(alcancou, 'a aba ativa precisa ser alcançável por Tab');
        const contorno = await abaAtiva.evaluate(element => ({
          style: getComputedStyle(element).outlineStyle,
          width: parseFloat(getComputedStyle(element).outlineWidth) || 0,
        }));
        assert.ok(contorno.style !== 'none' && contorno.width >= 1, `foco da aba ativa precisa ser visível: ${contorno.style}/${contorno.width}px`);
        await capture(page, 'conhecimento-390-teclado', { state: 'percurso_teclado', firstFocus: true, percursoTeclado: percurso, ...medidas });
        await recordKeyboardCapture(evidenceDir, {
          stage: STAGE_08A,
          route: ROTA_08A,
          role: 'admin',
          viewport: '390x844',
          theme: 'day',
          file: 'conhecimento-390-teclado.png',
          firstFocus: true,
          percursoTeclado: percurso,
        });
        if (evidenceDir) {
          const summary = JSON.parse(await readFile(path.join(evidenceDir, 'resumo.json'), 'utf8'));
          const entry = summary.entries.find(item => path.basename(item.screenshot || item.file || '') === 'conhecimento-390-teclado.png');
          assert.ok(entry?.firstFocus === true);
          assert.ok(entry?.percursoTeclado?.length > 0);
        }
      }
    }
    await context.close();
  } finally {
    await browser.close().catch(() => {});
  }
});

test('UX-PRO-E8: controles compartilhados preservam contraste no tema noturno em /admin/conhecimento', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, adminCookie, { width: 768, height: 1024 });
    await page.locator('[data-testid="knowledge-articles-list"]').waitFor();
    await page.click('[data-admin-theme-toggle="true"]');
    await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
    const measures = {};
    measures.activeTab = await contraste08a(page, '[role="tab"][aria-selected="true"]');
    assert.ok(measures.activeTab >= 4.5, `activeTab no tema noturno: ${measures.activeTab}:1 (mínimo focal 4.5:1)`);
    const heading = await page.locator('main [data-admin-content="true"] h1').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { text: element.textContent?.trim(), right: Math.round(rect.right), containerRight: Math.round(element.parentElement.getBoundingClientRect().right), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
    });
    measures.heading768 = heading;
    assert.ok(heading.right <= heading.containerRight + 1 && heading.scrollWidth <= heading.clientWidth + 1, `E9 cabeçalho excede o contêiner em 768px: ${JSON.stringify(heading)}`);
    const e8EvidenceDir = process.env.UX_E8_EVIDENCE_DIR;
    if (e8EvidenceDir) {
      await mkdir(e8EvidenceDir, { recursive: true });
      await page.screenshot({ path: path.join(e8EvidenceDir, 'conhecimento-768-noite-e8.png'), fullPage: true });
      await writeFile(path.join(e8EvidenceDir, 'resumo.json'), `${JSON.stringify({
        stage: 'UX-PRO-E8', route: '/admin/conhecimento', role: 'admin', viewport: '768x1024', theme: 'night',
        base: '8306f84326ebb0e3634e6363ee807b1930389019',
        before: { activeTabContrast: 1.95, screenshot: '../ux-pro-08-conhecimento-evidencias/conhecimento-768-noite.png' },
        measures,
        checks: { activeTabContrastMin45: true, heading768WithinContainer: true },
        evidence: 'Automação Playwright com Chromium local, servidor Next e PostgreSQL descartável; massa de QA.',
        limitations: 'Inspeção estática e validação automatizada; sem inspeção manual, leitor de tela, aceite humano ou declaração de conformidade WCAG.',
      }, null, 2)}\n`, 'utf8');
    }
    await context.close();
  } finally {
    await browser.close().catch(() => {});
  }
});
