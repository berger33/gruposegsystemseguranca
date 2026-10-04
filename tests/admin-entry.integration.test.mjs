// F01 — Gate da entrada/navegação central de staff, por HTTP real contra
// PostgreSQL real (executado por scripts/qa-admin-entry-postgres.mjs, que sobe
// um cluster descartável e injeta DATABASE_URL) e por Chromium real para a
// jornada de navegador exigida no aceite: anônimo → login central → retorno
// ao destino, redireciono que recusa domínio externo, RBAC de Marcelo×RH e
// logout que revoga a sessão no servidor.
//
// Nada aqui usa SQL para simular o que a API deveria fazer: vereditos de
// autenticação/autorização vêm de respostas HTTP do servidor de verdade.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { provisionStaff, STAFF_TEST_PASSWORD } from './helpers/staff-login.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');

let server, baseUrl, pool;

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
      NEXT_DIST_DIR: '.next/integration-admin-entry',
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      CLIENT_MFA_ENCRYPTION_KEY: Buffer.from(randomUUID()).toString('base64url').slice(0, 43),
      ADMIN_LOGIN_MAX_ATTEMPTS: '200',
      // Sem SITE_ADMIN_LEGACY_TOKENS: o gate prova que a chave legada NÃO é
      // oferecida quando desativada (a ligação da flag tem prova unitária).
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
  // Warm-up de compilação das rotas usadas no browser (dev compila sob demanda).
  await Promise.all(['/admin', '/admin/entrar', '/admin/marcelo', '/admin/funcionarios'].map(async (route) => {
    const deadline = Date.now() + 120_000;
    for (;;) {
      try {
        const res = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
        if (res.status !== 404) return;
      } catch { /* ainda subindo */ }
      if (Date.now() > deadline) throw new Error(`page_compile_timeout_${route}`);
      await new Promise(r => setTimeout(r, 500));
    }
  }));
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) { server.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); server.kill('SIGKILL'); }
});

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

async function loginHttp(email, password = STAFF_TEST_PASSWORD) {
  const res = await api('/api/admin/session', { method: 'POST', body: { email, password } });
  assert.equal(res.status, 200, `login deveria retornar 200, veio ${res.status}: ${JSON.stringify(res.body)}`);
  const raw = res.setCookie.find(c => c.startsWith('seg_admin_session='));
  assert.ok(raw, 'login precisa emitir o cookie de sessão staff');
  return { cookie: raw.split(';')[0], data: res.body };
}

// ---------------------------------------------------------------------------
// Cenários HTTP (API real)
// ---------------------------------------------------------------------------

test('GET /admin deixa de responder 404 e serve a base do hub', { skip: !RUN }, async () => {
  const res = await fetch(`${baseUrl}/admin`, { redirect: 'manual' });
  assert.equal(res.status, 200, `/admin deveria responder 200, veio ${res.status}`);
  const html = await res.text();
  assert.match(html, /Área administrativa|Verificando sessão administrativa/, 'HTML da base administrativa ausente');
});

test('GET /admin/entrar serve a entrada canônica (não 404)', { skip: !RUN }, async () => {
  const res = await fetch(`${baseUrl}/admin/entrar`, { redirect: 'manual' });
  assert.equal(res.status, 200, `/admin/entrar deveria responder 200, veio ${res.status}`);
  const html = await res.text();
  assert.match(html, /Verificando sessão administrativa|Entrada da equipe/);
});

test('opções públicas do login: individual disponível, legada oculta quando desativada', { skip: !RUN }, async () => {
  const res = await api('/api/admin/session/options');
  assert.equal(res.status, 200);
  assert.equal(res.body.individual, true);
  assert.equal(res.body.legacyTokens, false, 'sem SITE_ADMIN_LEGACY_TOKENS=true a UI não deve sugerir chave legada');
  assert.equal(Object.keys(res.body).length, 2, 'nenhum dado extra vazado no endpoint público');
});

test('anônimo continua recebendo 401 claro da sessão (preservado)', { skip: !RUN }, async () => {
  const res = await api('/api/admin/session');
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'admin_session_required');
});

test('login por papel: marcelo, rh e supervisor entram com papéis distintos', { skip: !RUN }, async () => {
  const casos = [];
  for (const role of ['marcelo', 'rh', 'supervisor']) {
    const staff = await provisionStaff(pool, { role });
    const { cookie, data } = await loginHttp(staff.email);
    assert.equal(data.role, role, `papel devolvido deveria ser ${role}`);
    const sess = await api('/api/admin/session', { cookie });
    assert.equal(sess.status, 200);
    assert.equal(sess.body.role, role);
    assert.ok(sess.body.identityId === staff.id, 'sessão identifica a pessoa (auditoria por identidade)');
    casos.push({ staff, cookie });
  }
  return casos;
});

test('senha inválida e conta suspensa têm erros distintos e compreensíveis', { skip: !RUN }, async () => {
  const ativo = await provisionStaff(pool, { role: 'ti' });
  const errada = await api('/api/admin/session', { method: 'POST', body: { email: ativo.email, password: 'senha-errada-0!' } });
  assert.equal(errada.status, 401);
  assert.equal(errada.body.error, 'invalid_credentials', 'senha inválida não detalha qual parte falhou');
  const suspenso = await provisionStaff(pool, { role: 'rh', status: 'suspended' });
  const negado = await api('/api/admin/session', { method: 'POST', body: { email: suspenso.email, password: STAFF_TEST_PASSWORD } });
  assert.equal(negado.status, 401);
  assert.equal(negado.body.error, 'identity_not_active');
});

test('RBAC do painel do Marcelo: RH recebe 403 real da API, marcelo 200', { skip: !RUN }, async () => {
  const marcelo = await provisionStaff(pool, { role: 'marcelo' });
  const { cookie: cookieMarcelo } = await loginHttp(marcelo.email);
  const rh = await provisionStaff(pool, { role: 'rh' });
  const { cookie: cookieRh } = await loginHttp(rh.email);
  const periodo = '?period_start=2026-01-01&period_end=2026-12-31';
  const leitura = await api(`/api/adm/panel/indicators${periodo}`, { cookie: cookieMarcelo });
  assert.equal(leitura.status, 200, `marcelo deveria ler indicadores, veio ${leitura.status}`);
  assert.ok(Array.isArray(leitura.body.indicators), 'resposta do painel preserva o contrato');
  const negado = await api(`/api/adm/panel/indicators${periodo}`, { cookie: cookieRh });
  assert.equal(negado.status, 403, `RH NÃO pode receber acesso à administração pelo conserto da navegação; veio ${negado.status}`);
});

test('logout revoga a sessão no servidor: cookie reutilizado passa a 401', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'marcelo' });
  const { cookie } = await loginHttp(staff.email);
  const antes = await api('/api/admin/session', { cookie });
  assert.equal(antes.status, 200);
  const saida = await api('/api/admin/session', { method: 'DELETE', body: {}, cookie });
  assert.equal(saida.status, 200);
  const depois = await api('/api/admin/session', { cookie });
  assert.equal(depois.status, 401, 'cópia do cookie não pode continuar válida após logout');
});

// ---------------------------------------------------------------------------
// Jornada de navegador (Chromium real)
// ---------------------------------------------------------------------------

async function launchBrowser() {
  return playwrightChromium.launch({
    executablePath: await packagedChromium.executablePath(),
    // O pacote serverless inclui --disable-web-security, que removeria Origin
    // dos POSTs e mascararia a proteção CSRF; removido como no gate L04.
    args: packagedChromium.args.filter(arg => arg !== '--disable-web-security'),
    headless: true,
  });
}

async function newPage(browser) {
  const context = await browser.newContext({ baseURL: baseUrl });
  const page = await context.newPage();
  return { context, page };
}

test('browser: anônimo em /admin/marcelo é levado ao login central e volta ao destino', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'marcelo' });
  const browser = await launchBrowser();
  try {
    const { context, page } = await newPage(browser);
    await page.goto('/admin/marcelo', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForURL(/\/admin\/entrar\?next=/, { timeout: 30_000 });
    assert.match(page.url(), /next=%2Fadmin%2Fmarcelo/, 'o destino original precisa ir no parâmetro next');
    await page.waitForSelector('label[for="login-email"]', { timeout: 90_000 });
    const rotulo = await page.textContent('label[for="login-email"]');
    assert.match(rotulo || '', /E-mail da conta individual/i, 'rótulo correto, sem a marca equivocada de TI');
    assert.ok(!(rotulo || '').includes('de TI'), 'rótulo não deve dizer "individual de TI" para administrador');
    const legada = await page.getAttribute('[data-login-tab-legacy="true"]', 'disabled');
    assert.ok(legada !== null, 'aba de chave legada deve estar desabilitada quando desativada');
    await page.waitForSelector('p[data-legacy-note="true"]', { timeout: 10_000 });
    await page.fill('#login-email', staff.email);
    await page.fill('#login-password', STAFF_TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin\/marcelo(\?|#|$)/, { timeout: 60_000 });
    await page.waitForSelector('[data-admin-chrome="true"]', { timeout: 60_000 });
    await page.waitForSelector('[data-role-chip="marcelo"]', { timeout: 30_000 });
    const chip = await page.textContent('[data-role-chip="marcelo"]');
    assert.match(chip || '', /Marcelo/i, 'chip do papel deve identificar Marcelo');
    const gate = await page.$(`[data-admin-gate="forbidden"]`);
    assert.equal(gate, null, 'marcelo não pode ver estado 403 no próprio painel');
    await context.close();
  } finally {
    await browser.close();
  }
});

test('browser: RH entra em /admin/funcionarios e NÃO recebe o painel do Marcelo', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'rh' });
  const browser = await launchBrowser();
  try {
    const { context, page } = await newPage(browser);
    await page.goto('/admin/entrar', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('#login-email', { timeout: 90_000 });
    await page.fill('#login-email', staff.email);
    await page.fill('#login-password', STAFF_TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin\/funcionarios/, { timeout: 60_000 });
    await page.waitForSelector('[data-admin-chrome="true"]', { timeout: 60_000 });
    // Navegação por papel: o menu de RH não lista o painel administrativo.
    const menu = await page.$$eval('[data-admin-nav="true"] a', links => links.map(a => a.getAttribute('href')));
    assert.ok(!menu.includes('/admin/marcelo'), 'menu de RH não deve oferecer o painel do Marcelo');
    assert.ok(menu.includes('/admin/funcionarios'), 'menu de RH deve oferecer a área de RH');
    // Mas navegação não é autorização: digitando a URL, o gate mostra o 403 claro.
    await page.goto('/admin/marcelo', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('[data-admin-gate="forbidden"]', { timeout: 60_000 });
    const texto = await page.textContent('[data-admin-gate="forbidden"]');
    assert.match(texto || '', /Acesso restrito/i);
    assert.match(texto || '', /RH/i, 'estado 403 declara o papel atual da sessão');
    await context.close();
  } finally {
    await browser.close();
  }
});

test('browser: next externo/domínio alheio é recusado no redireciono pós-login', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'supervisor' });
  const browser = await launchBrowser();
  try {
    const { context, page } = await newPage(browser);
    await page.goto('/admin/entrar?next=https://malicioso.example/roubar', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('#login-email', { timeout: 90_000 });
    await page.fill('#login-email', staff.email);
    await page.fill('#login-password', STAFF_TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => url.pathname.startsWith('/admin') && !url.pathname.startsWith('/admin/entrar'), { timeout: 60_000 });
    const finalUrl = page.url();
    assert.ok(finalUrl.startsWith(baseUrl), `redireciono NUNCA pode sair do domínio: ${finalUrl}`);
    assert.match(finalUrl, /\/admin\/operacao(\?|#|$)/, 'next inválido cai na home do papel supervisor');
    await context.close();
  } finally {
    await browser.close();
  }
});

test('browser: senha errada mostra erro compreensível sem sair da entrada', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'ti' });
  const browser = await launchBrowser();
  try {
    const { context, page } = await newPage(browser);
    await page.goto('/admin/entrar', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('#login-email', { timeout: 90_000 });
    await page.fill('#login-email', staff.email);
    await page.fill('#login-password', 'senha-errada-0!');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-login-error="true"]', { timeout: 30_000 });
    const erro = await page.textContent('[data-login-error="true"]');
    assert.match(erro || '', /E-mail ou senha não conferem/i, 'erro compreensível sem detalhar internos');
    assert.match(page.url(), /\/admin\/entrar/, 'permanece na entrada para nova tentativa');
    await context.close();
  } finally {
    await browser.close();
  }
});

test('browser: logout devolve à entrada e a sessão sai revogada', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'marcelo' });
  const browser = await launchBrowser();
  try {
    const { context, page } = await newPage(browser);
    await page.goto('/admin/entrar', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('#login-email', { timeout: 90_000 });
    await page.fill('#login-email', staff.email);
    await page.fill('#login-password', STAFF_TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin\/marcelo/, { timeout: 60_000 });
    await page.waitForSelector('[data-admin-chrome="true"]', { timeout: 60_000 });
    await page.click('header button:has-text("Sair")');
    await page.waitForURL(/\/admin\/entrar/, { timeout: 60_000 });
    // A cópia do cookie no contexto do browser passa a ser recusada:
    const sess = await page.evaluate(async () => {
      const res = await fetch('/api/admin/session', { headers: { accept: 'application/json' } });
      return res.status;
    });
    assert.equal(sess, 401, 'sessão reutilizada após logout precisa responder 401');
    // E qualquer página protegida volta a exigir login:
    await page.goto('/admin', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForURL(/\/admin\/entrar\?next=/, { timeout: 30_000 });
    await context.close();
  } finally {
    await browser.close();
  }
});
