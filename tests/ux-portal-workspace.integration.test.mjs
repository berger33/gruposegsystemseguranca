// UX-06 — gate dos portais do funcionário e do cliente, por HTTP real contra
// PostgreSQL real (executado por scripts/qa-ux-portal-postgres.mjs, que sobe um
// cluster descartável) e por Chromium real.
//
// O que este gate prova:
//  - o contrato de acesso dos portais continua intacto: 401 sem sessão de
//    funcionário, 401 sem sessão de cliente, e o isolamento por conta recusa
//    a leitura de conta alheia;
//  - o defeito central da UX-06: uma FALHA de leitura não devolve a tela de
//    login no portal do funcionário, e não vira "sem vínculo" na área do
//    cliente. Carregando, vazio, falha e negado são quatro estados distintos;
//  - as abas do portal do funcionário são um tablist de verdade, com teclado;
//  - todo campo tem rótulo visível e associado;
//  - nos formulários públicos de entrada (pedido manual de recuperação e
//    reenvio de confirmação), falha real de serviço (503 produzido no
//    PostgreSQL descartável) e rejeição de rede nunca aparecem como sucesso:
//    o erro recebe foco, o formulário permanece para repetição e a resposta
//    pública continua genérica (202) para endereço elegível e desconhecido;
//  - 390px não produz transbordo horizontal.
//
// O que este gate NÃO prova: aceite humano, homologação de Marcelo/Andreia,
// comportamento em Windows ou na máquina do operador.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { provisionStaff, STAFF_TEST_PASSWORD } from './helpers/staff-login.mjs';
import { hashToken, hashPassword } from '../src/lib/client-auth-core.mjs';
import { generate as generateTotp } from 'otplib';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');

let server, baseUrl, pool;
let rhCookie;
let employee, employeeEmail, employeePassword;
let employeeCookie;
let clientEmail, clientPassword, clientCookie;

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

function api(pathname, { method = 'GET', body, cookie, headers = {} } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { origin: baseUrl } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
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

// O Chromium empacotado roda com --single-process: reaproveitar o mesmo
// browser entre contextos derruba o alvo. Cada teste abre o seu.
async function launchChromiumOnce() {
  // @sparticuz/chromium contains a Linux binary. On Windows use the installed
  // Edge channel so the same browser checks can run on the operator machine.
  if (process.platform === 'win32') {
    return playwrightChromium.launch({ channel: 'msedge', headless: true });
  }
  return playwrightChromium.launch({
    executablePath: await packagedChromium.executablePath(),
    args: packagedChromium.args.filter(arg => arg !== '--disable-web-security'),
    headless: true,
  });
}

// O Chromium empacotado roda em --single-process e, em sandbox/CI, pode morrer
// ao NASCER (SIGSEGV antes de navegar). Isso é infraestrutura, não asserção: o
// lançamento recebe até duas novas tentativas; nenhuma verificação é afrouxada.
async function launchBrowser() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await launchChromiumOnce();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

const evidenceDir = process.env.UX_PORTAL_EVIDENCE_DIR || '';
async function capture(page, nome) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage: true });
}

/**
 * Abre uma rota com o cookie informado. `failRoutes` derruba, dentro da
 * própria página, as respostas indicadas: `page.route()` é instável com este
 * Chromium empacotado, então a substituição é feita em `window.fetch`, como
 * nos demais gates do repositório. O servidor NÃO é enfraquecido.
 */
async function openPage(browser, route, cookie, { width = 1440, height = 900, failRoutes = [], status = 503, code = 'employee_home_unavailable', onPage } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  if (cookie) {
    await context.addCookies(cookie.split('; ').filter(Boolean).map(item => {
      const separator = item.indexOf('=');
      return { name: item.slice(0, separator), value: item.slice(separator + 1), url: baseUrl };
    }));
  }
  const page = await context.newPage();
  if (typeof onPage === 'function') onPage(page);
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
  return { context, page, navigationResponse };
}

/** Entra no portal do funcionário pela tela, como a pessoa faria. */
async function signInEmployee(page) {
  await page.getByRole('heading', { name: 'Portal do funcionário' }).waitFor();
  await page.getByLabel('E-mail').fill(employeeEmail);
  await page.getByLabel('Senha').fill(employeePassword);
  await page.getByRole('button', { name: 'Entrar com segurança' }).click();
  await page.getByRole('tablist').waitFor();
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
      NEXT_DIST_DIR: '.next/integration-ux-portal',
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      EMPLOYEE_SESSION_SECRET: randomUUID().repeat(2),
      // 32 bytes aleatórios cabem exatamente em 43 chars base64url e passam no
      // roundtrip exigido por mfaKey(). A fórmula anterior
      // (Buffer.from(randomUUID()).slice(0, 43)) cortava o encoding no meio de
      // um char e falhava no roundtrip em ~38% das execuções, derrubando todo
      // preparo de MFA com 503 — os gates que exercitam MFA já usavam
      // randomBytes(32).
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

  // --- Funcionário: criado pelo RH, exatamente como na vida real -----------
  const rh = await provisionStaff(pool, { role: 'rh' });
  rhCookie = await loginStaffHttp(rh.email);

  const suffix = randomUUID().slice(0, 8);
  const created = await api('/api/hr/employees', {
    method: 'POST', cookie: rhCookie,
    body: {
      matricula: `QA-UX06-${suffix}`,
      display_name: `Funcionario Sintetico ${suffix}`,
      cargo: 'vigilante',
      status: 'ativo',
      employment_type: 'clt',
    },
  });
  assert.equal(created.status, 201, `criação do funcionário deveria ser 201, veio ${created.status}`);
  employee = created.body.employee;
  employeeEmail = `ux06-${suffix}@exemplo.invalid`;

  const access = await api(`/api/admin/hr/employees/${employee.id}/access`, {
    method: 'POST', cookie: rhCookie, body: { email: employeeEmail },
  });
  assert.equal(access.status, 201, `provisionamento de acesso deveria ser 201, veio ${access.status}`);

  // A senha temporária obriga a troca; trocamos pelo fluxo real.
  const temporary = access.body.temporaryPassword;
  const firstLogin = await api('/api/employee/session', { method: 'POST', body: { email: employeeEmail, password: temporary } });
  assert.equal(firstLogin.status, 200, 'o primeiro acesso com a senha temporária precisa funcionar');
  const firstCookie = firstLogin.setCookie.find(c => c.startsWith('seg_employee_session='))?.split(';')[0];
  employeePassword = `Sintetica-${randomUUID()}!`;
  const changed = await api('/api/employee/session/password', {
    method: 'PUT', cookie: firstCookie,
    body: { currentPassword: temporary, newPassword: employeePassword },
  });
  assert.equal(changed.status, 200, 'a troca da senha temporária precisa funcionar');

  // --- Cliente: identidade com vínculo criado pela equipe -------------------
  clientEmail = `cliente-ux06-${suffix}@exemplo.invalid`;
  clientPassword = `Cliente-${randomUUID()}!`;
  const identityId = randomUUID();
  await pool.query(
    `INSERT INTO auth_identities (id, kind, email, display_name, status, verification_method, verified_at)
     VALUES ($1,'client',$2,$3,'active','email_link',NOW())`,
    [identityId, clientEmail, `Cliente Sintetico ${suffix}`],
  );
  await pool.query('INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)',
    [identityId, await hashPassword(clientPassword)]);

  const clientLogin = await api('/api/auth/login', { method: 'POST', body: { email: clientEmail, password: clientPassword } });
  assert.equal(clientLogin.status, 200, `login do cliente deveria ser 200, veio ${clientLogin.status} ${JSON.stringify(clientLogin.body)}`);
  clientCookie = clientLogin.setCookie.map(item => item.split(';')[0]).join('; ');
  assert.ok(clientCookie, 'o login do cliente precisa emitir cookie de sessão');

  for (const route of ['/funcionario', '/cliente/app', '/cliente/redefinir-senha', '/cliente/confirmar-email']) {
    const deadline = Date.now() + 240_000;
    for (;;) {
      try {
        const res = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
        if (res.status !== 404) break;
      } catch { /* ainda compilando */ }
      if (Date.now() > deadline) throw new Error(`page_compile_timeout_${route}`);
      await new Promise(r => setTimeout(r, 500));
    }
  }
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) { server.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); server.kill('SIGKILL'); }
});

test('o contrato de acesso dos portais não mudou: 401 sem sessão, dado próprio com sessão', { skip: !RUN }, async () => {
  const anonymousEmployee = await api('/api/employee/home');
  assert.equal(anonymousEmployee.status, 401);
  assert.equal(anonymousEmployee.body.error, 'employee_session_required');
  assert.ok(!('shifts' in (anonymousEmployee.body || {})), 'a negativa não pode vazar dado algum');

  const anonymousClient = await api('/api/client/accounts');
  assert.equal(anonymousClient.status, 401, 'a área do cliente continua exigindo sessão');
  assert.ok(!('accounts' in (anonymousClient.body || {})), 'a negativa não pode vazar vínculo algum');

  const session = await api('/api/employee/session', { method: 'POST', body: { email: employeeEmail, password: employeePassword } });
  assert.equal(session.status, 200);
  const cookie = session.setCookie.find(c => c.startsWith('seg_employee_session='))?.split(';')[0];
  employeeCookie = cookie;
  const home = await api('/api/employee/home', { cookie });
  assert.equal(home.status, 200);
  assert.equal(home.body.employeeId, employee.id, 'o portal só devolve o cadastro da própria pessoa');
});

test('o isolamento por conta do cliente continua decidido no servidor', { skip: !RUN }, async () => {
  const minhas = await api('/api/client/accounts', { cookie: clientCookie });
  assert.equal(minhas.status, 200);
  assert.ok(Array.isArray(minhas.body.accounts));

  // Uma conta que existe, mas não é desta identidade, continua recusada.
  const alheia = randomUUID();
  const contratos = await api(`/api/client/contracts?account=${alheia}`, { cookie: clientCookie });
  assert.ok([403, 404].includes(contratos.status),
    `conta alheia precisa ser recusada, veio ${contratos.status}`);
  assert.ok(!(contratos.body || {}).contracts, 'a recusa não pode vazar contrato algum');
});

test('browser: falha de leitura NÃO devolve a tela de login do funcionário', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    // A pessoa entra de verdade (o POST de sessão não é tocado) e, em seguida,
    // a LEITURA do portal falha. É o cenário que o defeito antigo confundia
    // com "não autenticado".
    const { context: contextFalha, page: falha } = await openPage(browser, '/funcionario', null, {
      failRoutes: ['/api/employee/home'], status: 503, code: 'employee_home_unavailable',
    });
    await falha.getByRole('heading', { name: 'Portal do funcionário' }).waitFor();
    await falha.getByLabel('E-mail').fill(employeeEmail);
    await falha.getByLabel('Senha').fill(employeePassword);
    await falha.getByRole('button', { name: 'Entrar com segurança' }).click();

    const estado = falha.locator('[data-ui-state="error"]').first();
    await estado.waitFor();
    const texto = await estado.innerText();
    assert.match(texto, /não foi possível carregar o seu portal/i,
      'a falha precisa ser dita em português');
    assert.match(texto, /NÃO significa que você não tenha plantão/i,
      'a falha não pode ser confundida com ausência de dado');
    assert.match(texto, /HTTP 503|employee_home_unavailable/,
      'o código canônico fica disponível para diagnóstico');

    // O defeito que esta fatia tranca: a pessoa NÃO é devolvida ao login.
    assert.equal(await falha.getByRole('button', { name: 'Entrar com segurança' }).count(), 0,
      'uma falha de leitura não pode apresentar a tela de entrada');
    // E a nova tentativa é oferecida.
    assert.ok(await estado.locator('button').count() >= 1, 'falha transitória precisa oferecer nova tentativa');

    await capture(falha, 'ux-06-funcionario-falha-nao-vira-login');
    await contextFalha.close();
  } finally { await browser.close(); }
});

test('browser: sessão ausente leva ao login, e isso continua sendo o comportamento certo', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/funcionario', null);
    await page.getByRole('heading', { name: 'Portal do funcionário' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Entrar com segurança' }).count(), 1,
      'sem sessão, a tela de entrada é o destino correto');
    assert.equal(await page.locator('[data-ui-state="error"]').count(), 0,
      'não estar autenticado não é um erro a reportar');
    await capture(page, 'ux-06-funcionario-login');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: credencial errada diz o que houve, sem despejar o código cru', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/funcionario', null);
    await page.getByRole('heading', { name: 'Portal do funcionário' }).waitFor();
    await page.getByLabel('E-mail').fill(employeeEmail);
    await page.getByLabel('Senha').fill('senha-errada-sintetica');
    await page.getByRole('button', { name: 'Entrar com segurança' }).click();

    const estado = page.locator('[data-ui-state="error"], [data-ui-state="denied"]').first();
    await estado.waitFor();
    const texto = await estado.innerText();
    assert.match(texto, /E-mail ou senha não conferem/i);
    // O token técnico não pode ser o título.
    assert.doesNotMatch(texto.split('\n')[1] || '', /^invalid_credentials$/);
    await context.close();
  } finally { await browser.close(); }
});

test('browser: as abas do portal do funcionário são um tablist de verdade', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/funcionario', null);
    await signInEmployee(page);

    const abas = page.getByRole('tab');
    assert.equal(await abas.count(), 5, 'o portal tem cinco seções');
    assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1);
    assert.equal(await page.locator('[role="tab"][tabindex="-1"]').count(), 4);
    assert.equal(await page.locator('[role="tabpanel"]').count(), 1, 'só o painel ativo fica montado');

    await abas.first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await abas.nth(1).getAttribute('aria-selected'), 'true');
    assert.equal(await abas.nth(1).evaluate(el => el === document.activeElement), true,
      'a seta precisa mover o foco junto com a seleção');
    await page.keyboard.press('End');
    assert.equal(await abas.nth(4).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await abas.nth(0).getAttribute('aria-selected'), 'true');

    await capture(page, 'ux-06-funcionario-abas');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: tema dia/noite cobre o portal do funcionário, persiste no navegador e reflowa em quatro larguras', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/funcionario', null);
    await signInEmployee(page);
    const toggle = page.locator('[data-admin-theme-toggle="true"]');
    await toggle.waitFor();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false', 'o portal começa no tema dia sem preferência anterior');

    // Ativa o controle pelo teclado e verifica também um card e uma ação,
    // além do escopo global. Isso cobre valores CSS reais, não só atributos.
    await toggle.focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    const darkColors = await page.evaluate(() => ({
      app: getComputedStyle(document.querySelector('main[data-admin-theme-scope="true"] > div')).backgroundColor,
      hero: getComputedStyle(document.querySelector('main[data-admin-theme-scope="true"] section')).backgroundColor,
      action: getComputedStyle(document.querySelector('main[data-admin-theme-scope="true"] [class*="button"]')).backgroundColor,
      stored: localStorage.getItem('segsystem.admin.appearance.v1'),
    }));
    assert.equal(darkColors.app, 'rgb(17, 30, 48)');
    assert.equal(darkColors.hero, 'rgb(36, 58, 87)');
    assert.equal(darkColors.action, 'rgb(46, 95, 152)');
    assert.equal(darkColors.stored, 'night', 'a preferência continua local ao navegador/perfil');

    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      for (const theme of ['night', 'day']) {
        if (theme === 'day') await toggle.click();
        else if (await page.locator('html').getAttribute('data-admin-theme') !== 'night') await toggle.click();
        await page.waitForTimeout(80);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `${width}px/${theme}: transbordo horizontal de ${overflow}px`);
        await capture(page, `ux-pro-02-funcionario-${width}-${theme}`);
      }
    }

    await toggle.click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('tablist', { name: 'Seções do portal do funcionário' }).waitFor();
    await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
    assert.equal(await page.locator('[data-admin-theme-toggle="true"]').getAttribute('aria-pressed'), 'true',
      'a preferência volta após recarregar, sem estar vinculada à identidade de funcionário');

    // A alteração visual não encerra nem modifica a sessão de funcionário.
    assert.equal(await page.getByRole('tablist', { name: 'Seções do portal do funcionário' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Sair' }).count(), 1);
    await context.close();
  } finally { await browser.close(); }
});

test('browser: Minha jornada hierarquiza marcações próprias, endereço opcional, hash e pedido de ajuste', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const punch = await api('/api/employee/time-clock', {
      method: 'POST', cookie: employeeCookie,
      body: { requestId: randomUUID(), kind: 'entrada', position: { latitude: -23.55, longitude: -46.63, accuracy: 18, positionAt: new Date().toISOString() } },
    });
    assert.equal(punch.status, 201, `marca sintética do portal deveria ser 201, veio ${punch.status}`);
    const correction = await api('/api/employee/actions/time-correction', {
      method: 'POST', cookie: employeeCookie,
      body: { timeEntryId: punch.body.timeEntryId, reason: 'Ajuste sintético para validar o estado visual', requestedChanges: { clock_in: '08:00' } },
    });
    assert.equal(correction.status, 201, `pedido sintético deveria ser 201, veio ${correction.status}`);
    const { context, page } = await openPage(browser, '/funcionario', null);
    await signInEmployee(page);
    await page.getByRole('tab', { name: 'Jornada' }).click();
    const area = page.getByRole('heading', { name: 'Registrar ponto com localização' }).locator('..');
    await area.getByRole('heading', { name: 'Comprovantes de marcação' }).waitFor();
    const receipt = area.locator('article').filter({ hasText: 'Entrada' }).first();
    await receipt.waitFor();
    assert.match(await receipt.innerText(), /Consulta de endereço não configurada|Endereço retornado pelo HERE|Endereço não consultado|serviço de endereço estava indisponível|não localizou um endereço/i);
    assert.equal(await receipt.locator('details[open]').count(), 0, 'hash fica recolhido por padrão');
    await receipt.locator('summary').click();
    assert.match(await receipt.innerText(), /Hash SHA-256 da solicitação/);
    assert.match(await receipt.innerText(), /Identificador do registro/);
    assert.equal(await area.getByRole('heading', { name: 'Meus pedidos de ajuste' }).count(), 1);
    assert.match(await area.locator('text=O pedido não altera as marcações originais').first().innerText(), /marcações originais/);

    const theme = page.locator('[data-admin-theme-toggle="true"]');
    await theme.focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
    const button = area.getByRole('button', { name: 'Entrada' });
    const night = await button.evaluate(el => getComputedStyle(el).backgroundColor);
    assert.equal(night, 'rgb(24, 38, 58)', 'a ação usa a superfície do tema noturno');
    await button.focus();
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.activeElement instanceof HTMLElement && getComputedStyle(document.activeElement).outlineStyle !== 'none'), 'o foco de teclado permanece visível no fluxo');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `${width}px: transbordo horizontal de ${overflow}px`);
      await capture(page, `ux-pro-05-jornada-${width}-night`);
    }
    await context.close();
  } finally { await browser.close(); }
});

test('browser: falha da consulta de ponto mostra estado e repetição sem sugerir jornada vazia', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/funcionario', null, {
      failRoutes: ['/api/employee/time-clock'], status: 503, code: 'employee_time_clock_unavailable',
    });
    await signInEmployee(page);
    await page.getByRole('tab', { name: 'Jornada' }).click();
    const error = page.getByRole('alert').filter({ hasText: 'Não foi possível consultar seu ponto' });
    await error.waitFor();
    assert.equal(await error.getByRole('button', { name: 'Tentar carregar novamente' }).count(), 1);
    assert.equal(await page.getByRole('heading', { name: 'Comprovantes de marcação' }).count(), 0);
    assert.doesNotMatch(await error.innerText(), /Nenhuma marcação registrada/);
    await capture(page, 'ux-pro-05-jornada-falha-rede');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: todo campo do portal do funcionário tem rótulo visível e associado', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/funcionario', null);
    await signInEmployee(page);
    await page.getByRole('tab', { name: /Pedidos$/ }).click();
    await page.locator('form').first().waitFor();

    const semRotulo = await page.evaluate(() => {
      const faltando = [];
      for (const field of document.querySelectorAll('[role="tabpanel"] input, [role="tabpanel"] select, [role="tabpanel"] textarea')) {
        if (field.type === 'hidden') continue;
        const id = field.getAttribute('id');
        const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
        if (!label || label.textContent.trim().length === 0) {
          faltando.push(field.getAttribute('name') || field.outerHTML.slice(0, 60));
        }
      }
      return faltando;
    });
    assert.deepEqual(semRotulo, [], 'todo campo precisa de um <label for> visível');
    await capture(page, 'ux-06-funcionario-pedidos');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: vazio é dito como vazio, e separado de falha', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/funcionario', null);
    await signInEmployee(page);
    // Um funcionário recém-criado não tem comunicado nem notificação: a tela
    // precisa dizer que a LEITURA foi concluída e não há registro.
    const vazio = page.locator('[data-ui-state="empty"]').first();
    await vazio.waitFor();
    assert.match(await vazio.innerText(), /leitura foi concluída com sucesso/i,
      'o vazio precisa declarar que a leitura funcionou');
    assert.equal(await page.locator('[data-ui-state="error"]').count(), 0,
      'ausência de registro não pode ser apresentada como falha');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: a área do cliente não transforma falha de leitura em "sem vínculo"', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/cliente/app', clientCookie, {
      failRoutes: ['/api/client/accounts'], status: 503, code: 'internal',
    });
    const estado = page.locator('[data-ui-state="error"]').first();
    await estado.waitFor();
    const texto = await estado.innerText();
    assert.match(texto, /NÃO significa que você esteja sem vínculo/i,
      'a falha precisa dizer que nada foi lido');

    // O defeito que esta fatia tranca.
    assert.equal(await page.locator('text=/ainda não está vinculada a um cadastro/i').count(), 0,
      'uma falha de leitura não pode afirmar que a identidade está sem vínculo');
    await capture(page, 'ux-06-cliente-falha-nao-vira-sem-vinculo');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: a área do cliente diz "sem vínculo" só depois de uma leitura bem-sucedida', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/cliente/app', clientCookie);
    // Esta identidade sintética realmente não tem vínculo: a leitura devolve
    // zero, e só então a frase de negócio é legítima.
    await page.locator('text=/ainda não está vinculada a um cadastro/i').waitFor();
    assert.equal(await page.locator('[data-ui-state="error"]').count(), 0,
      'uma leitura bem-sucedida com zero resultados não é falha');
    // E o jargão interno de projeto saiu da tela de quem é cliente.
    assert.equal(await page.locator('text=/Etapa 2/').count(), 0,
      'a tela do cliente não anuncia etapa interna de projeto');
    await capture(page, 'ux-06-cliente-sem-vinculo');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: pedido manual de recuperação distingue falha real, mantém 202 genérico e é operável por teclado', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  const eligibleEmail = 'qa09a@example.invalid';
  const unknownEmail = 'missing09a@example.invalid';
  const identityId = randomUUID();
  const browserStatuses = [];
  const consoleErrors = [];
  const pageErrors = [];
  const evidenceDir = process.env.UX_PORTAL_EVIDENCE_DIR || '';
  const triggerName = 'qa_ux_pro09a_recovery_failure';
  const functionName = 'qa_ux_pro09a_recovery_failure_fn';
  let context, page;
  let keyboardPath = [];
  let focusedErrorStyle = null;
  let networkFailure = null;
  const viewportEvidence = [];
  const errorScreenshots = [];
  const safeDiagnostic = value => String(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[address]')
    .replace(/([?&](?:token|email)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/(authorization|cookie)[:=]\s*[^\s;]+/gi, '$1=[redacted]')
    .slice(0, 240);
  const focusName = () => page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return 'none';
    if (element instanceof HTMLInputElement) {
      return element.labels?.[0]?.innerText.trim().replace(/\s+/g, ' ') || element.id || 'input';
    }
    if (element.getAttribute('role') === 'alert') return 'Mensagem de erro';
    return (element.getAttribute('aria-label') || element.innerText || element.id || element.tagName)
      .trim().replace(/\s+/g, ' ').slice(0, 80);
  });
  const cleanup = async () => {
    await context?.close().catch(() => {});
    await browser.close().catch(() => {});
    await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON client_access_recovery_requests`).catch(() => {});
    await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`).catch(() => {});
    await pool.query('DELETE FROM auth_identities WHERE id=$1', [identityId]).catch(() => {});
  };

  try {
    // Trigger somente no PostgreSQL descartável: resposta HTTP e aplicação reais.
    await pool.query(
      `INSERT INTO auth_identities (id, kind, email, display_name, status, verification_method, verified_at)
       VALUES ($1,'client',$2,'QA Sintético UX-PRO-09A','active','email_link',NOW())`,
      [identityId, eligibleEmail],
    );
    await pool.query(`
      CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'qa_synthetic_recovery_failure'; END;
      $$;
    `);
    await pool.query(`
      CREATE TRIGGER ${triggerName} BEFORE INSERT ON client_access_recovery_requests
      FOR EACH ROW EXECUTE FUNCTION ${functionName}();
    `);

    const opened = await openPage(browser, '/cliente/redefinir-senha', null, {
      width: 390,
      height: 844,
      onPage: candidate => {
        candidate.on('response', response => {
          try {
            if (new URL(response.url()).pathname === '/api/auth/recovery/manual') {
              browserStatuses.push(response.status());
            }
          } catch { /* URL inválida não entra na evidência */ }
        });
        candidate.on('console', message => {
          if (message.type() !== 'error') return;
          let source = 'unknown';
          try {
            const url = new URL(message.location().url);
            source = `${url.origin}${url.pathname}`;
          } catch { /* mensagem sem URL */ }
          consoleErrors.push({ message: safeDiagnostic(message.text()), source });
        });
        candidate.on('pageerror', error => pageErrors.push(safeDiagnostic(error.message)));
      },
    });
    context = opened.context;
    page = opened.page;
    page.setDefaultTimeout(45_000);
    await page.waitForLoadState('networkidle');
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    assert.equal(opened.navigationResponse?.status(), 200);
    assert.equal(new URL(page.url()).pathname, '/cliente/redefinir-senha');
    assert.deepEqual(await context.cookies(), [], 'a rota pública é testada sem cookie ou sessão');

    const form = page.locator('section[aria-labelledby="recuperar-title"]');
    const emailField = form.getByRole('textbox', { name: 'E-mail' });
    assert.equal(await emailField.count(), 1);
    assert.equal(await form.getByRole('button', { name: 'Solicitar validação manual' }).count(), 1);
    assert.equal(await form.getByRole('alert').count(), 0);
    assert.equal(await form.getByRole('status').count(), 0);
    const theme = await page.evaluate(() => ({
      mode: 'light-default-only',
      themeTogglePresent: Boolean(document.querySelector('[data-admin-theme-toggle="true"]')),
      themeAttribute: document.documentElement.getAttribute('data-admin-theme'),
    }));
    assert.equal(theme.themeTogglePresent, false);
    assert.equal(theme.themeAttribute, null);
    if (evidenceDir) await capture(page, 'ux-pro-09a-recuperacao-inicial-390-claro');

    await page.locator('header a').first().focus();
    keyboardPath.push(await focusName());
    for (let step = 0; step < 2; step += 1) {
      await page.keyboard.press('Tab');
      keyboardPath.push(await focusName());
    }
    assert.deepEqual(keyboardPath, ['GRUPO SEG System', 'Sobre o portal', 'E-MAIL']);
    await page.keyboard.press('Tab');
    keyboardPath.push(await focusName());
    assert.equal(keyboardPath.at(-1), 'Solicitar validação manual');

    await emailField.fill('endereco-invalido');
    const malformedEmail = await emailField.evaluate(element => ({
      typeMismatch: element.validity.typeMismatch,
      valueMissing: element.validity.valueMissing,
    }));
    await emailField.press('Enter');
    assert.equal(malformedEmail.typeMismatch, true);
    await emailField.fill('');
    const emptyEmail = await emailField.evaluate(element => ({
      typeMismatch: element.validity.typeMismatch,
      valueMissing: element.validity.valueMissing,
    }));
    await emailField.press('Enter');
    assert.equal(emptyEmail.valueMissing, true);
    assert.deepEqual(browserStatuses, [], 'validação nativa não dispara HTTP');

    // Segura apenas a resolução da resposta real para capturar o estado de envio.
    await page.evaluate(() => {
      const nativeFetch = window.fetch.bind(window);
      let holdFirst = true;
      window.__uxPro09aRelease = null;
      window.fetch = async (input, init) => {
        const response = await nativeFetch(input, init);
        const url = typeof input === 'string' ? input : input.url;
        if (holdFirst && new URL(url, window.location.href).pathname === '/api/auth/recovery/manual') {
          holdFirst = false;
          await new Promise(resolve => { window.__uxPro09aRelease = resolve; });
        }
        return response;
      };
    });
    await emailField.fill(eligibleEmail);
    await page.keyboard.press('Tab');
    assert.equal(await focusName(), 'Solicitar validação manual');
    const failureResponsePromise = page.waitForResponse(response => {
      try { return new URL(response.url()).pathname === '/api/auth/recovery/manual'; }
      catch { return false; }
    });
    await page.keyboard.press('Enter');
    const failureResponse = await failureResponsePromise;
    assert.equal(failureResponse.status(), 503);
    await page.waitForFunction(() => typeof window.__uxPro09aRelease === 'function');
    const busyButton = page.getByRole('button', { name: 'Registrando…' });
    await busyButton.waitFor();
    assert.equal(await busyButton.isDisabled(), true);
    if (evidenceDir) await capture(page, 'ux-pro-09a-recuperacao-carregando-390-claro');
    await page.evaluate(() => window.__uxPro09aRelease?.());

    const error = form.getByRole('alert');
    await error.waitFor();
    await page.waitForFunction(() => document.activeElement?.matches('section[aria-labelledby="recuperar-title"] [role="alert"]'));
    const errorText = await error.innerText();
    assert.match(errorText, /Não foi possível confirmar o recebimento da solicitação/i);
    assert.doesNotMatch(errorText, /recovery_unavailable|503|example\.invalid|@/i);
    assert.equal(await form.getByRole('status').count(), 0, '503 nunca deve parecer sucesso');
    assert.equal(await emailField.inputValue(), eligibleEmail, 'o valor permanece para nova tentativa');
    assert.equal(await form.getByRole('button', { name: 'Solicitar validação manual' }).isEnabled(), true);
    assert.equal(await focusName(), 'Mensagem de erro');
    focusedErrorStyle = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    assert.deepEqual(focusedErrorStyle, { outlineStyle: 'solid', outlineWidth: '3px' });
    keyboardPath.push('Mensagem de erro');
    await page.keyboard.press('Tab');
    keyboardPath.push(await focusName());
    assert.equal(keyboardPath.at(-1), 'Solicitar validação manual');
    await page.keyboard.press('Tab');
    keyboardPath.push(await focusName());
    assert.equal(keyboardPath.at(-1), 'Voltar para a entrada');
    await error.focus();

    for (const width of [320, 390, 768, 1440]) {
      const height = width < 768 ? 844 : 900;
      await page.setViewportSize({ width, height });
      const metrics = await page.evaluate(() => {
        const root = document.documentElement;
        return {
          viewport: { width: innerWidth, height: innerHeight },
          horizontalOverflowPx: Math.max(root.scrollWidth, document.body.scrollWidth) - root.clientWidth,
          focusedTarget: document.activeElement?.matches('section[aria-labelledby="recuperar-title"] [role="alert"]')
            ? 'Mensagem de erro' : 'outro',
          themeAttribute: root.getAttribute('data-admin-theme'),
        };
      });
      assert.deepEqual(metrics.viewport, { width, height });
      assert.equal(metrics.horizontalOverflowPx, 0);
      assert.equal(metrics.focusedTarget, 'Mensagem de erro');
      const screenshot = `ux-pro-09a-recuperacao-falha-503-${width}-claro.png`;
      errorScreenshots.push(screenshot);
      if (evidenceDir) await capture(page, screenshot.slice(0, -4));
      viewportEvidence.push(metrics);
    }

    await page.evaluate(() => {
      const originalFetch = window.fetch.bind(window);
      window.__uxPro09aNetworkFailureTriggered = false;
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        if (new URL(url, window.location.href).pathname === '/api/auth/recovery/manual') {
          window.fetch = originalFetch;
          window.__uxPro09aNetworkFailureTriggered = true;
          throw new TypeError('Failed to fetch');
        }
        return originalFetch(input, init);
      };
    });
    await page.keyboard.press('Tab');
    assert.equal(await focusName(), 'Solicitar validação manual');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__uxPro09aNetworkFailureTriggered === true);
    await page.waitForFunction(() => document.activeElement?.matches('section[aria-labelledby="recuperar-title"] [role="alert"]'));
    assert.match(await error.innerText(), /Não foi possível confirmar o recebimento da solicitação/i);
    assert.equal(await emailField.inputValue(), eligibleEmail);
    assert.equal(await form.getByRole('status').count(), 0, 'falha de rede não deve parecer sucesso');
    assert.equal(await form.getByRole('button', { name: 'Solicitar validação manual' }).isEnabled(), true);
    assert.equal(await focusName(), 'Mensagem de erro');
    assert.deepEqual(browserStatuses, [503], 'a rejeição simulada ocorre antes de qualquer resposta HTTP');
    await page.setViewportSize({ width: 390, height: 844 });
    const networkViewport = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      horizontalOverflowPx: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
      focusedTarget: document.activeElement?.matches('section[aria-labelledby="recuperar-title"] [role="alert"]')
        ? 'Mensagem de erro' : 'outro',
    }));
    assert.deepEqual(networkViewport.viewport, { width: 390, height: 844 });
    assert.equal(networkViewport.horizontalOverflowPx, 0);
    assert.equal(networkViewport.focusedTarget, 'Mensagem de erro');
    const networkFailureScreenshot = 'ux-pro-09a-recuperacao-falha-rede-390-claro.png';
    if (evidenceDir) await capture(page, networkFailureScreenshot.slice(0, -4));
    await page.setViewportSize({ width: 1440, height: 900 });
    networkFailure = {
      screenshot: networkFailureScreenshot,
      viewport: networkViewport.viewport,
      horizontalOverflowPx: networkViewport.horizontalOverflowPx,
      simulatedFetchRejection: true,
      httpStatus: null,
      formRetainedForRetry: true,
      falseSuccessStatusShown: false,
      errorReceivesFocus: true,
      retryButtonEnabled: true,
      httpRequestIssued: false,
    };

    await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON client_access_recovery_requests`);
    await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
    await emailField.fill(eligibleEmail);
    await page.keyboard.press('Tab');
    const successResponsePromise = page.waitForResponse(response => {
      try { return new URL(response.url()).pathname === '/api/auth/recovery/manual'; }
      catch { return false; }
    });
    await page.keyboard.press('Enter');
    const successResponse = await successResponsePromise;
    assert.equal(successResponse.status(), 202);
    const success = form.getByRole('status');
    await success.waitFor();
    const successText = await success.innerText();
    assert.match(successText, /Se existir uma conta elegível/i);
    assert.match(successText, /não confirmamos se o endereço tem conta/i);
    assert.doesNotMatch(successText, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (evidenceDir) await capture(page, 'ux-pro-09a-recuperacao-sucesso-202-claro');

    const [eligibleApi, unknownApi] = await Promise.all([
      api('/api/auth/recovery/manual', { method: 'POST', body: { email: eligibleEmail } }),
      api('/api/auth/recovery/manual', { method: 'POST', body: { email: unknownEmail } }),
    ]);
    assert.equal(eligibleApi.status, 202);
    assert.equal(unknownApi.status, 202);
    assert.deepEqual(eligibleApi.body, unknownApi.body, 'respostas públicas não enumeram e-mails');
    assert.deepEqual(browserStatuses, [503, 202]);
    assert.deepEqual(pageErrors, []);
    const expected503Diagnostics = consoleErrors.filter(error =>
      /503/.test(error.message) && error.source.endsWith('/api/auth/recovery/manual'));
    const blockedFontDiagnostics = consoleErrors.filter(error =>
      /ERR_CONNECTION_CLOSED/.test(error.message) && error.source === 'https://fonts.googleapis.com/css2');
    const unexpectedConsoleErrors = consoleErrors.filter(error =>
      !expected503Diagnostics.includes(error) && !blockedFontDiagnostics.includes(error));

    if (evidenceDir) {
      const summary = {
        schemaVersion: 1,
        task: 'UX-PRO-09A — pedido manual de recuperação de senha',
        stage: 'UX-PRO-09A',
        date: '2026-10-15',
        entries: viewportEvidence.map((item, index) => ({
          route: '/cliente/redefinir-senha',
          viewport: `${item.viewport.width}x${item.viewport.height}`,
          screenshot: errorScreenshots[index],
          firstFocus: false,
          percursoTeclado: keyboardPath,
        })),
        baseSha: '0e3cfc78c8725b95cebfd57042d532bb95d456f5',
        branch: 'arena/85e48996-gruposegsystemseguranca',
        route: '/cliente/redefinir-senha',
        role: 'visitante anônimo; sem cookie ou sessão',
        routeHttpStatus: opened.navigationResponse?.status() ?? null,
        apiHttp: [
          ...browserStatuses.map(status => ({ path: '/api/auth/recovery/manual', status, source: 'browser' })),
          { path: '/api/auth/recovery/manual', status: eligibleApi.status, source: 'HTTP test client' },
          { path: '/api/auth/recovery/manual', status: unknownApi.status, source: 'HTTP test client' },
        ],
        states: [
          { name: 'initial', screenshot: 'ux-pro-09a-recuperacao-inicial-390-claro.png' },
          { name: 'loading', screenshot: 'ux-pro-09a-recuperacao-carregando-390-claro.png', buttonDisabled: true },
          {
            name: 'service_failure', httpStatus: 503, screenshot: errorScreenshots,
            formRetainedForRetry: true, falseSuccessStatusShown: false,
            userMessage: 'Não foi possível confirmar o recebimento da solicitação. Tente novamente em instantes; por segurança, não informamos se o endereço tem conta.',
          },
          { name: 'network_failure', ...networkFailure },
          {
            name: 'success', httpStatus: 202, screenshot: 'ux-pro-09a-recuperacao-sucesso-202-claro.png',
            genericMessageUnchangedForEligibleAndUnknownAddress: true, responseBodiesEqual: true,
          },
          { name: 'native_validation', malformedEmail, emptyEmail, httpRequestsBeforeValidSubmit: 0 },
        ],
        keyboard: { focusOrder: keyboardPath, errorReceivesFocus: true, errorFocusVisible: focusedErrorStyle },
        theme,
        viewports: viewportEvidence,
        console: {
          errorCount: consoleErrors.length,
          expectedHttp503DiagnosticCount: expected503Diagnostics.length,
          blockedExternalFontDiagnosticCount: blockedFontDiagnostics.length,
          unexpectedErrorCount: unexpectedConsoleErrors.length,
          errors: consoleErrors,
          pageErrorCount: pageErrors.length,
        },
        limitations: [
          '503 reproduzido por trigger no PostgreSQL temporário e descartável; HTTP, servidor, rota e Chromium reais; sem mock da resposta HTTP. Separadamente, uma rejeição de fetch foi simulada no navegador para cobrir falha de rede; não equivale a interromper o transporte real.',
          '202 genérico exercitado no navegador e por HTTP para identidade sintética elegível e endereço desconhecido; os corpos são comparados em memória, não salvos.',
          'Somente tema claro, o único oferecido por esta superfície. Sem SMTP/provedor real, sessão/cookie, dados reais, UAT, aceite humano ou alegação WCAG/produção.',
          'A busca externa de Google Fonts foi bloqueada pelo sandbox (ERR_CONNECTION_CLOSED); navegador usou fallback, sem erro de execução da página. O diagnóstico é separado do 503 reproduzido.',
          'Overflow medido por viewport; esta subfatia altera somente o estado de falha da solicitação manual.',
        ],
      };
      await mkdir(evidenceDir, { recursive: true });
      await writeFile(path.join(evidenceDir, 'resumo.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    }
  } finally {
    await cleanup();
  }
});

test('browser: reenvio de confirmação distingue falha real, mantém 202 genérico e preserva o limite de reenvio', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  const RESEND_PATH = '/api/auth/confirm-email/resend';
  const CONFIRM_PATH = '/api/auth/confirm-email';
  const eligibleEmail = 'qa09a2@example.invalid';
  const httpEligibleEmail = 'qa09a2-http@example.invalid';
  const unknownEmail = 'missing09a2@example.invalid';
  const syntheticEmails = [eligibleEmail, httpEligibleEmail, unknownEmail];
  const identityId = randomUUID();
  const httpIdentityId = randomUUID();
  const syntheticIdentityIds = [identityId, httpIdentityId];
  const resendStatuses = [];
  const confirmStatuses = [];
  const consoleErrors = [];
  const pageErrors = [];
  const evidenceDir = process.env.UX_PORTAL_EVIDENCE_DIR || '';
  const failureTable = 'qa_ux_pro09a2_audit_failure';
  const triggerName = 'qa_ux_pro09a2_reject_access_audit';
  const functionName = 'qa_ux_pro09a2_reject_access_audit_fn';
  let context, page;
  let keyboardPath = [];
  let focusedErrorStyle = null;
  let networkFailure = null;
  let nativeValidation = null;
  let tokenEvidence = null;
  const viewportEvidence = [];
  const errorScreenshots = [];
  const safeDiagnostic = value => String(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[address]')
    .replace(/([?&](?:token|email)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/(authorization|cookie)[:=]\s*[^\s;]+/gi, '$1=[redacted]')
    .slice(0, 240);
  const focusName = () => page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) return 'none';
    if (element instanceof HTMLInputElement) {
      return element.labels?.[0]?.innerText.trim().replace(/\s+/g, ' ') || element.id || 'input';
    }
    // O cartão também tem o aviso permanente de link inválido; só o erro do
    // formulário de reenvio conta como "mensagem de erro" deste percurso.
    if (element.getAttribute('role') === 'alert' && element.closest('form')) return 'Mensagem de erro';
    return (element.getAttribute('aria-label') || element.innerText || element.id || element.tagName)
      .trim().replace(/\s+/g, ' ').slice(0, 80);
  });
  const errorIsFocused = () => page.evaluate(() => Boolean(
    document.activeElement?.matches('section[aria-labelledby="confirmar-title"] form [role="alert"]')));
  const cleanup = async () => {
    await context?.close().catch(() => {});
    await browser.close().catch(() => {});
    await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON auth_access_audit`).catch(() => {});
    await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`).catch(() => {});
    await pool.query(`DROP TABLE IF EXISTS ${failureTable}`).catch(() => {});
    await pool.query('DELETE FROM auth_access_audit WHERE actor_id = ANY($1::text[])', [syntheticIdentityIds]).catch(() => {});
    await pool.query('DELETE FROM auth_email_tokens WHERE email = ANY($1::varchar[])', [syntheticEmails]).catch(() => {});
    await pool.query('DELETE FROM auth_identities WHERE id = ANY($1::uuid[])', [syntheticIdentityIds]).catch(() => {});
  };

  try {
    // Massa sintética em banco descartável: o reenvio de confirmação só é
    // elegível para identidade 'client' com status 'pending_email'.
    for (const [id, email] of [[identityId, eligibleEmail], [httpIdentityId, httpEligibleEmail]]) {
      await pool.query(
        `INSERT INTO auth_identities (id, kind, email, display_name, status)
         VALUES ($1,'client',$2,'QA Sintético UX-PRO-09A-2','pending_email')`,
        [id, email],
      );
    }
    // 503 REAL: a auditoria obrigatória do reenvio é recusada por trigger no
    // PostgreSQL descartável, a transação reverte e a API responde 503 de
    // verdade (mesmo padrão de tests/client-access.integration.test.mjs).
    // Servidor, rota, HTTP e Chromium permanecem reais; nada é enfraquecido.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${failureTable} (action TEXT PRIMARY KEY);
      CREATE OR REPLACE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM ${failureTable} f WHERE f.action = NEW.action) THEN
          RAISE EXCEPTION 'qa_synthetic_audit_failure:%', NEW.action;
        END IF;
        RETURN NEW;
      END;
      $$;
      DROP TRIGGER IF EXISTS ${triggerName} ON auth_access_audit;
      CREATE TRIGGER ${triggerName} BEFORE INSERT ON auth_access_audit
        FOR EACH ROW EXECUTE FUNCTION ${functionName}();
    `);
    await pool.query(`INSERT INTO ${failureTable} (action) VALUES ('email_confirm_resend') ON CONFLICT DO NOTHING`);

    const opened = await openPage(browser, '/cliente/confirmar-email', null, {
      width: 390,
      height: 844,
      onPage: candidate => {
        candidate.on('response', response => {
          try {
            const pathname = new URL(response.url()).pathname;
            if (pathname === RESEND_PATH) resendStatuses.push(response.status());
            if (pathname === CONFIRM_PATH) confirmStatuses.push(response.status());
          } catch { /* URL inválida não entra na evidência */ }
        });
        candidate.on('console', message => {
          if (message.type() !== 'error') return;
          let source = 'unknown';
          try {
            const url = new URL(message.location().url);
            source = `${url.origin}${url.pathname}`;
          } catch { /* mensagem sem URL */ }
          consoleErrors.push({ message: safeDiagnostic(message.text()), source });
        });
        candidate.on('pageerror', error => pageErrors.push(safeDiagnostic(error.message)));
      },
    });
    context = opened.context;
    page = opened.page;
    page.setDefaultTimeout(45_000);
    await page.waitForLoadState('networkidle');
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    assert.equal(opened.navigationResponse?.status(), 200);
    assert.equal(new URL(page.url()).pathname, '/cliente/confirmar-email');
    assert.deepEqual(await context.cookies(), [], 'a rota pública é testada sem cookie ou sessão');

    const card = page.locator('section[aria-labelledby="confirmar-title"]');
    const form = card.locator('form');
    const emailField = form.getByRole('textbox', { name: 'Seu e-mail' });
    const linkAlert = card.getByRole('alert').filter({ hasText: 'Este link de confirmação não é mais válido' });
    const error = form.getByRole('alert');
    const success = card.getByRole('status');
    await card.getByRole('heading', { name: 'Não foi possível confirmar' }).waitFor();
    assert.equal(await form.count(), 1);
    assert.equal(await emailField.count(), 1);
    assert.equal(await form.getByRole('button', { name: 'Pedir novo link de confirmação' }).count(), 1);
    assert.equal(await error.count(), 0);
    assert.equal(await success.count(), 0);
    assert.equal(await linkAlert.count(), 1, 'o aviso de link inválido já existente permanece');
    assert.deepEqual(resendStatuses, [], 'abrir a rota sem token não chama o reenvio');
    assert.deepEqual(confirmStatuses, [], 'sem token a página não emite POST /api/auth/confirm-email');
    const theme = await page.evaluate(() => ({
      mode: 'light-default-only',
      themeTogglePresent: Boolean(document.querySelector('[data-admin-theme-toggle="true"]')),
      themeAttribute: document.documentElement.getAttribute('data-admin-theme'),
    }));
    assert.equal(theme.themeTogglePresent, false);
    assert.equal(theme.themeAttribute, null);
    if (evidenceDir) await capture(page, 'ux-pro-09a2-reenvio-inicial-390-claro');

    await page.locator('header a').first().focus();
    keyboardPath.push(await focusName());
    for (let step = 0; step < 2; step += 1) {
      await page.keyboard.press('Tab');
      keyboardPath.push(await focusName());
    }
    assert.deepEqual(keyboardPath, ['GRUPO SEG System', 'Sobre o portal', 'SEU E-MAIL']);
    await page.keyboard.press('Tab');
    keyboardPath.push(await focusName());
    assert.equal(keyboardPath.at(-1), 'Pedir novo link de confirmação');

    await emailField.fill('endereco-invalido');
    const malformedEmail = await emailField.evaluate(element => ({
      typeMismatch: element.validity.typeMismatch,
      valueMissing: element.validity.valueMissing,
    }));
    await emailField.press('Enter');
    assert.equal(malformedEmail.typeMismatch, true);
    await emailField.fill('');
    const emptyEmail = await emailField.evaluate(element => ({
      typeMismatch: element.validity.typeMismatch,
      valueMissing: element.validity.valueMissing,
    }));
    await emailField.press('Enter');
    assert.equal(emptyEmail.valueMissing, true);
    assert.deepEqual(resendStatuses, [], 'validação nativa não dispara HTTP');
    nativeValidation = { malformedEmail, emptyEmail, httpRequestsBeforeValidSubmit: resendStatuses.length };

    // Segura apenas a resolução da resposta real para capturar o estado de envio.
    await page.evaluate(() => {
      const nativeFetch = window.fetch.bind(window);
      let holdFirst = true;
      window.__uxPro09a2Release = null;
      window.fetch = async (input, init) => {
        const response = await nativeFetch(input, init);
        const url = typeof input === 'string' ? input : input.url;
        if (holdFirst && new URL(url, window.location.href).pathname === '/api/auth/confirm-email/resend') {
          holdFirst = false;
          await new Promise(resolve => { window.__uxPro09a2Release = resolve; });
        }
        return response;
      };
    });
    await emailField.fill(eligibleEmail);
    await page.keyboard.press('Tab');
    assert.equal(await focusName(), 'Pedir novo link de confirmação');
    const failureResponsePromise = page.waitForResponse(response => {
      try { return new URL(response.url()).pathname === '/api/auth/confirm-email/resend'; }
      catch { return false; }
    });
    await page.keyboard.press('Enter');
    const failureResponse = await failureResponsePromise;
    assert.equal(failureResponse.status(), 503, 'a falha de serviço reproduzida no banco chega como 503');
    await page.waitForFunction(() => typeof window.__uxPro09a2Release === 'function');
    const busyButton = page.getByRole('button', { name: 'Enviando…' });
    await busyButton.waitFor();
    assert.equal(await busyButton.isDisabled(), true);
    if (evidenceDir) await capture(page, 'ux-pro-09a2-reenvio-enviando-390-claro');
    await page.evaluate(() => window.__uxPro09a2Release?.());

    await error.waitFor();
    await page.waitForFunction(() => document.activeElement?.matches('section[aria-labelledby="confirmar-title"] form [role="alert"]'));
    const errorText = await error.innerText();
    assert.match(errorText, /Não foi possível registrar o pedido de novo link/i);
    assert.doesNotMatch(errorText, /audit_unavailable|auth_unavailable|503|example\.invalid|@/i);
    assert.equal(await success.count(), 0, '503 nunca deve parecer sucesso');
    assert.equal(await form.count(), 1, 'o formulário permanece para nova tentativa');
    assert.equal(await emailField.inputValue(), eligibleEmail, 'o valor permanece para nova tentativa');
    assert.equal(await form.getByRole('button', { name: 'Pedir novo link de confirmação' }).isEnabled(), true);
    assert.equal(await linkAlert.count(), 1, 'o aviso de link inválido continua presente depois da falha');
    assert.equal(await focusName(), 'Mensagem de erro');
    assert.equal(await errorIsFocused(), true);
    focusedErrorStyle = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    assert.deepEqual(focusedErrorStyle, { outlineStyle: 'solid', outlineWidth: '3px' });
    const rolledBack = await pool.query(
      'SELECT COUNT(*)::int AS total FROM auth_email_tokens WHERE email = $1 AND kind = $2',
      [eligibleEmail, 'confirm_email'],
    );
    assert.equal(rolledBack.rows[0].total, 0, 'o 503 reverteu a transação: nenhum link foi emitido');

    keyboardPath.push('Mensagem de erro');
    await page.keyboard.press('Tab');
    keyboardPath.push(await focusName());
    assert.equal(keyboardPath.at(-1), 'Pedir novo link de confirmação');
    // tabindex="-1" mantém o erro fora da ordem sequencial (o foco é
    // programático); Shift+Tab devolve ao campo, que é o alvo útil da repetição.
    await page.keyboard.press('Shift+Tab');
    keyboardPath.push(await focusName());
    assert.equal(keyboardPath.at(-1), 'SEU E-MAIL');
    await page.keyboard.press('Tab');
    keyboardPath.push(await focusName());
    assert.equal(keyboardPath.at(-1), 'Pedir novo link de confirmação');
    await error.focus();

    for (const width of [320, 390, 768, 1440]) {
      const height = width < 768 ? 844 : 900;
      await page.setViewportSize({ width, height });
      const metrics = await page.evaluate(() => {
        const root = document.documentElement;
        return {
          viewport: { width: innerWidth, height: innerHeight },
          horizontalOverflowPx: Math.max(root.scrollWidth, document.body.scrollWidth) - root.clientWidth,
          focusedTarget: document.activeElement?.matches('section[aria-labelledby="confirmar-title"] form [role="alert"]')
            ? 'Mensagem de erro' : 'outro',
          themeAttribute: root.getAttribute('data-admin-theme'),
        };
      });
      assert.deepEqual(metrics.viewport, { width, height });
      assert.equal(metrics.horizontalOverflowPx, 0);
      assert.equal(metrics.focusedTarget, 'Mensagem de erro');
      const screenshot = `ux-pro-09a2-reenvio-falha-503-${width}-claro.png`;
      errorScreenshots.push(screenshot);
      if (evidenceDir) await capture(page, screenshot.slice(0, -4));
      viewportEvidence.push(metrics);
    }

    // SIMULAÇÃO declarada: a rejeição de fetch é produzida dentro da página para
    // cobrir falha de transporte. Não interrompe o transporte real e nenhum HTTP
    // é emitido; por isso fica registrada como simulação na evidência.
    await page.evaluate(() => {
      const originalFetch = window.fetch.bind(window);
      window.__uxPro09a2NetworkFailureTriggered = false;
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        if (new URL(url, window.location.href).pathname === '/api/auth/confirm-email/resend') {
          window.fetch = originalFetch;
          window.__uxPro09a2NetworkFailureTriggered = true;
          throw new TypeError('Failed to fetch');
        }
        return originalFetch(input, init);
      };
    });
    await page.keyboard.press('Tab');
    assert.equal(await focusName(), 'Pedir novo link de confirmação');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__uxPro09a2NetworkFailureTriggered === true);
    await page.waitForFunction(() => document.activeElement?.matches('section[aria-labelledby="confirmar-title"] form [role="alert"]'));
    assert.match(await error.innerText(), /Não foi possível registrar o pedido de novo link/i);
    assert.equal(await emailField.inputValue(), eligibleEmail);
    assert.equal(await success.count(), 0, 'falha de rede não deve parecer sucesso');
    assert.equal(await form.count(), 1, 'a repetição continua disponível depois da falha de rede');
    assert.equal(await form.getByRole('button', { name: 'Pedir novo link de confirmação' }).isEnabled(), true);
    assert.equal(await focusName(), 'Mensagem de erro');
    assert.deepEqual(resendStatuses, [503], 'a rejeição simulada ocorre antes de qualquer resposta HTTP');
    await page.setViewportSize({ width: 390, height: 844 });
    const networkViewport = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      horizontalOverflowPx: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth,
      focusedTarget: document.activeElement?.matches('section[aria-labelledby="confirmar-title"] form [role="alert"]')
        ? 'Mensagem de erro' : 'outro',
    }));
    assert.deepEqual(networkViewport.viewport, { width: 390, height: 844 });
    assert.equal(networkViewport.horizontalOverflowPx, 0);
    assert.equal(networkViewport.focusedTarget, 'Mensagem de erro');
    const networkFailureScreenshot = 'ux-pro-09a2-reenvio-falha-rede-simulada-390-claro.png';
    if (evidenceDir) await capture(page, networkFailureScreenshot.slice(0, -4));
    await page.setViewportSize({ width: 1440, height: 900 });
    networkFailure = {
      screenshot: networkFailureScreenshot,
      viewport: networkViewport.viewport,
      horizontalOverflowPx: networkViewport.horizontalOverflowPx,
      simulatedFetchRejection: true,
      simulationDeclaredInEvidence: true,
      httpStatus: null,
      formRetainedForRetry: true,
      falseSuccessStatusShown: false,
      errorReceivesFocus: true,
      retryButtonEnabled: true,
      httpRequestIssued: false,
    };

    // Repetição com o serviço restabelecido: o mesmo formulário, o mesmo endereço
    // e o mesmo percurso de teclado agora recebem 202 genérico de verdade.
    await pool.query(`DELETE FROM ${failureTable} WHERE action = 'email_confirm_resend'`);
    await emailField.fill(eligibleEmail);
    await page.keyboard.press('Tab');
    assert.equal(await focusName(), 'Pedir novo link de confirmação');
    const successResponsePromise = page.waitForResponse(response => {
      try { return new URL(response.url()).pathname === '/api/auth/confirm-email/resend'; }
      catch { return false; }
    });
    await page.keyboard.press('Enter');
    const successResponse = await successResponsePromise;
    assert.equal(successResponse.status(), 202);
    await success.waitFor();
    const successText = await success.innerText();
    assert.match(successText, /Se houver um cadastro aguardando confirmação/i);
    assert.match(successText, /não confirmamos se o e-mail existe/i);
    assert.doesNotMatch(successText, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    assert.equal(await form.count(), 0, 'o estado posterior ao pedido substitui o formulário, como antes');
    assert.equal(await linkAlert.count(), 1, 'o aviso de link inválido continua presente no sucesso');
    assert.deepEqual(resendStatuses, [503, 202]);
    assert.deepEqual(confirmStatuses, [], 'o fluxo de token de confirmação não foi tocado por esta subfatia');
    if (evidenceDir) await capture(page, 'ux-pro-09a2-reenvio-sucesso-202-claro');

    // Tokens e limites preservados: um único link, hash no banco, 7 dias, uso
    // único ainda disponível e auditoria transacional gravada.
    const tokens = await pool.query(
      `SELECT token_hash, expires_at, used_at, superseded_at FROM auth_email_tokens
       WHERE email = $1 AND kind = $2 ORDER BY created_at`,
      [eligibleEmail, 'confirm_email'],
    );
    assert.equal(tokens.rowCount, 1, 'o reenvio aceito emite exatamente um link de confirmação');
    assert.equal(tokens.rows[0].used_at, null);
    assert.equal(tokens.rows[0].superseded_at, null);
    assert.match(String(tokens.rows[0].token_hash).trim(), /^[0-9a-f]{64}$/, 'o banco guarda apenas o hash do token');
    const ttlHours = (new Date(tokens.rows[0].expires_at).getTime() - Date.now()) / 3_600_000;
    assert.ok(ttlHours > 167 && ttlHours <= 168.1, `validade de 7 dias preservada (medido ${ttlHours.toFixed(2)} h)`);
    const allowedAudit = await pool.query(
      `SELECT COUNT(*)::int AS total FROM auth_access_audit
       WHERE actor_id = $1 AND action = 'email_confirm_resend' AND result = 'allowed'`,
      [identityId],
    );
    assert.equal(allowedAudit.rows[0].total, 1, 'a auditoria do reenvio aceito permanece obrigatória');
    tokenEvidence = {
      confirmEmailTokensForEligibleAddress: tokens.rowCount,
      tokenStoredAsHashOnly: true,
      ttlHoursMeasured: Math.round(ttlHours * 100) / 100,
      usedAt: null,
      supersededAt: null,
      allowedAuditRows: allowedAudit.rows[0].total,
    };

    // Anti-enumeração por HTTP: endereço elegível e endereço desconhecido recebem
    // exatamente a mesma resposta pública.
    const [eligibleApi, unknownApi] = await Promise.all([
      api(RESEND_PATH, { method: 'POST', body: { email: httpEligibleEmail } }),
      api(RESEND_PATH, { method: 'POST', body: { email: unknownEmail } }),
    ]);
    assert.equal(eligibleApi.status, 202);
    assert.equal(unknownApi.status, 202);
    assert.deepEqual(eligibleApi.body, { ok: true }, 'o payload público do reenvio não mudou');
    assert.deepEqual(eligibleApi.body, unknownApi.body, 'respostas públicas não enumeram e-mails');
    const unknownTokens = await pool.query(
      'SELECT COUNT(*)::int AS total FROM auth_email_tokens WHERE email = $1', [unknownEmail],
    );
    assert.equal(unknownTokens.rows[0].total, 0, 'endereço desconhecido não gera link nem mensagem');

    // Limite de reenvio preservado: repetir dentro do intervalo mínimo continua
    // 202 genérico, não emite segundo link e audita a negação.
    const throttledRepeat = await api(RESEND_PATH, { method: 'POST', body: { email: eligibleEmail } });
    assert.equal(throttledRepeat.status, 202, 'o intervalo mínimo continua respondendo 202 genérico');
    assert.deepEqual(throttledRepeat.body, eligibleApi.body, 'a resposta não revela que o pedido foi limitado');
    const tokensAfterRepeat = await pool.query(
      'SELECT COUNT(*)::int AS total FROM auth_email_tokens WHERE email = $1 AND kind = $2',
      [eligibleEmail, 'confirm_email'],
    );
    assert.equal(tokensAfterRepeat.rows[0].total, 1, 'nenhum segundo link é emitido dentro do intervalo mínimo');
    const throttledAudit = await pool.query(
      `SELECT COUNT(*)::int AS total FROM auth_access_audit
       WHERE actor_id = $1 AND action = 'email_confirm_resend' AND result = 'denied' AND detail_category = 'throttled'`,
      [identityId],
    );
    assert.equal(throttledAudit.rows[0].total, 1, 'o limite de reenvio continua auditado como negação silenciosa');
    tokenEvidence = {
      ...tokenEvidence,
      tokensAfterImmediateRepeat: tokensAfterRepeat.rows[0].total,
      throttledAuditRows: throttledAudit.rows[0].total,
      throttledRepeatHttpStatus: throttledRepeat.status,
      tokensForUnknownAddress: unknownTokens.rows[0].total,
    };

    assert.deepEqual(pageErrors, []);
    const expected503Diagnostics = consoleErrors.filter(entry =>
      /503/.test(entry.message) && entry.source.endsWith(RESEND_PATH));
    const blockedFontDiagnostics = consoleErrors.filter(entry =>
      /ERR_CONNECTION_CLOSED/.test(entry.message) && entry.source === 'https://fonts.googleapis.com/css2');
    const unexpectedConsoleErrors = consoleErrors.filter(entry =>
      !expected503Diagnostics.includes(entry) && !blockedFontDiagnostics.includes(entry));
    assert.equal(expected503Diagnostics.length, 1, 'o 503 real chegou ao navegador uma única vez');
    assert.deepEqual(unexpectedConsoleErrors, [], 'nenhum erro de console fora dos diagnósticos esperados');

    if (evidenceDir) {
      const summary = {
        schemaVersion: 1,
        task: 'UX-PRO-09A-2 — reenvio de confirmação de e-mail',
        stage: 'UX-PRO-09A-2',
        date: '2026-10-16',
        entries: viewportEvidence.map((item, index) => ({
          route: '/cliente/confirmar-email',
          viewport: `${item.viewport.width}x${item.viewport.height}`,
          screenshot: errorScreenshots[index],
          firstFocus: false,
          percursoTeclado: keyboardPath,
        })),
        baseSha: 'c6682c11dd51fd98ceb480e59a2f8b5beafa5cfe',
        branch: 'arena/ccb60b64-gruposegsystemseguranca',
        route: '/cliente/confirmar-email',
        role: 'visitante anônimo; sem cookie ou sessão',
        routeHttpStatus: opened.navigationResponse?.status() ?? null,
        apiHttp: [
          ...resendStatuses.map(status => ({ path: RESEND_PATH, status, source: 'browser' })),
          { path: RESEND_PATH, status: eligibleApi.status, source: 'HTTP test client', case: 'endereço elegível' },
          { path: RESEND_PATH, status: unknownApi.status, source: 'HTTP test client', case: 'endereço desconhecido' },
          { path: RESEND_PATH, status: throttledRepeat.status, source: 'HTTP test client', case: 'repetição dentro do intervalo mínimo' },
          { path: CONFIRM_PATH, statusesObserved: confirmStatuses, source: 'browser', note: 'sem token a página não consome link algum' },
        ],
        states: [
          { name: 'initial', screenshot: 'ux-pro-09a2-reenvio-inicial-390-claro.png', invalidLinkAlertPreserved: true },
          { name: 'loading', screenshot: 'ux-pro-09a2-reenvio-enviando-390-claro.png', buttonDisabled: true },
          {
            name: 'service_failure', httpStatus: 503, screenshot: errorScreenshots,
            failureProducedIn: 'PostgreSQL descartável (auditoria obrigatória recusada por trigger)',
            formRetainedForRetry: true, falseSuccessStatusShown: false, tokenEmitted: false,
            userMessage: 'Não foi possível registrar o pedido de novo link. Tente novamente em instantes; por segurança, não confirmamos se o e-mail existe.',
          },
          { name: 'network_failure', ...networkFailure },
          {
            name: 'success', httpStatus: 202, screenshot: 'ux-pro-09a2-reenvio-sucesso-202-claro.png',
            genericMessageUnchangedForEligibleAndUnknownAddress: true, responseBodiesEqual: true,
            formReplacedByStatusMessageAsBefore: true,
          },
          { name: 'native_validation', ...nativeValidation },
        ],
        keyboard: {
          focusOrder: keyboardPath,
          errorReceivesFocus: true,
          errorFocusVisible: focusedErrorStyle,
          // O erro recebe foco programático (tabindex="-1") e não entra na ordem
          // sequencial do Tab; a repetição continua alcançável por teclado.
          errorInSequentialTabOrder: false,
          retryReachableByKeyboard: true,
        },
        theme,
        viewports: viewportEvidence,
        tokensAndLimits: tokenEvidence,
        console: {
          errorCount: consoleErrors.length,
          expectedHttp503DiagnosticCount: expected503Diagnostics.length,
          blockedExternalFontDiagnosticCount: blockedFontDiagnostics.length,
          unexpectedErrorCount: unexpectedConsoleErrors.length,
          errors: consoleErrors,
          pageErrorCount: pageErrors.length,
        },
        limitations: [
          '503 reproduzido por trigger no PostgreSQL temporário e descartável (auditoria obrigatória recusada, transação revertida); HTTP, servidor, rota e Chromium reais, sem mock da resposta HTTP. Separadamente, uma rejeição de fetch foi SIMULADA no navegador para cobrir falha de rede; não equivale a interromper o transporte real.',
          '202 genérico exercitado no navegador e por HTTP para identidade sintética elegível e endereço desconhecido; os corpos são comparados em memória, não salvos. Nenhum hash, token ou link é gravado na evidência.',
          'Limite de reenvio (5 por endereço em 24 h, intervalo mínimo de 2 min) verificado pela repetição imediata: 202 genérico, nenhum segundo link e auditoria denied/throttled. O teto de 5 em 24 h não foi percorrido por completo nesta subfatia; continua coberto pela regra pura em tests/client-auth-core.test.mjs.',
          'Somente tema claro, o único oferecido por esta superfície. Sem SMTP/provedor real (MAIL_HOST vazio: nenhuma mensagem é entregue), sem sessão/cookie, sem dados reais, sem UAT, aceite humano ou alegação WCAG/produção.',
          'A busca externa de Google Fonts foi bloqueada pelo sandbox (ERR_CONNECTION_CLOSED); o navegador usou fallback, sem erro de execução da página. O diagnóstico é separado do 503 reproduzido.',
          'Overflow medido por viewport; esta subfatia altera somente o estado de falha do formulário de reenvio em /cliente/confirmar-email.',
        ],
      };
      await mkdir(evidenceDir, { recursive: true });
      await writeFile(path.join(evidenceDir, 'resumo.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    }
  } finally {
    await cleanup();
  }
});

test('browser: em 390px os dois portais não produzem transbordo horizontal', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/funcionario', null, { width: 390, height: 844 });
    await signInEmployee(page);
    await page.waitForTimeout(400);
    const transbordoFuncionario = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(transbordoFuncionario <= 1, `transbordo de ${transbordoFuncionario}px no portal do funcionário`);

    const alturas = await page.locator('[role="tab"]').evaluateAll(nodes =>
      nodes.map(node => Math.round(node.getBoundingClientRect().height)));
    for (const altura of alturas) assert.ok(altura >= 32, `aba com apenas ${altura}px de altura`);
    await capture(page, 'ux-06-funcionario-390px');
    await context.close();
  } finally { await browser.close(); }

  // O Chromium empacotado roda em --single-process: fechar o contexto derruba
  // o processo. A área do cliente é medida em um browser novo.
  const browserCliente = await launchBrowser();
  try {
    const { context: clienteContexto, page: cliente } = await openPage(browserCliente, '/cliente/app', clientCookie, { width: 390, height: 844 });
    await cliente.locator('text=/Suas contas de cliente/i').waitFor();
    await cliente.waitForTimeout(400);
    const transbordoCliente = await cliente.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(transbordoCliente <= 1, `transbordo de ${transbordoCliente}px na área do cliente`);
    await capture(cliente, 'ux-06-cliente-390px');
    await clienteContexto.close();
  } finally { await browserCliente.close(); }
});


// G4: fixtures expiradas no banco descartável; não simula emissão nem resposta HTTP.
test('browser: erro de link de redefinição não afirma prazo fixo para nenhuma origem', { skip: !RUN }, async () => {
  const g4EvidenceDir = process.env.UX_PORTAL_G4_EVIDENCE_DIR || '';
  const expected = 'Este link de redefinição não é mais válido. Ele tem prazo de validade, uso único e é substituído quando um novo é emitido. Peça outro link.';
  const entries = [];
  const observed = [];
  const ids = [];
  try {
    for (const [origin, minutes] of [['recover', 60], ['manual_ti', 15]]) {
      const identityId = randomUUID();
      ids.push(identityId);
      const raw = randomUUID() + randomUUID();
      await pool.query(`INSERT INTO auth_identities(id,kind,email,display_name,status)
        VALUES($1,'client',$2,'QA Sintético G4','active')`, [identityId, `g4-${identityId}@example.invalid`]);
      await pool.query(`INSERT INTO auth_email_tokens(id,identity_id,kind,email,token_hash,created_at,expires_at)
        VALUES($1,$2,'password_reset',$3,$4,NOW()-($5::int+1)*INTERVAL '1 minute',NOW()-INTERVAL '1 minute')`,
      [randomUUID(), identityId, `g4-${identityId}@example.invalid`, hashToken(raw), minutes]);
      const ttl = await pool.query(`SELECT EXTRACT(EPOCH FROM (expires_at-created_at))::int AS seconds
        FROM auth_email_tokens WHERE identity_id=$1`, [identityId]);
      assert.equal(ttl.rows[0].seconds, minutes * 60);
      const browser = await launchBrowser();
      try {
        const { context, page, navigationResponse } = await openPage(browser, `/cliente/redefinir-senha?token=${raw}`, null);
        assert.equal(navigationResponse.status(), 200);
        await page.getByRole('heading', { name: 'Definir nova senha' }).waitFor();
        await page.waitForLoadState('networkidle');
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
        for (const [width, height] of [[320,844],[390,844],[768,900],[1440,900]]) {
          await page.setViewportSize({ width, height });
          const password = page.getByLabel('Nova senha', { exact: true });
          const repeat = page.getByLabel('Repita a nova senha');
          const button = page.getByRole('button', { name: 'Redefinir senha', exact: true });
          // Percurso real além do primeiro Tab: campos -> envio -> erro -> repetição.
          await password.focus();
          const keyboard = [];
          const recordFocus = async action => keyboard.push({ action, target: await page.evaluate(() => {
            const e = document.activeElement;
            if (e === document.body) return 'BODY (foco perdido ao desabilitar botão; comportamento anterior)';
            return e?.id || e?.textContent?.trim().slice(0, 60) || e?.tagName;
          }) });
          await recordFocus('focus campo');
          await password.fill('Frase sintetica para percurso G4!');
          await page.keyboard.press('Tab');
          await recordFocus('Tab');
          assert.ok(await repeat.evaluate(e => e === document.activeElement));
          await repeat.fill('Frase sintetica para percurso G4!');
          await page.keyboard.press('Tab');
          await recordFocus('Tab');
          assert.ok(await button.evaluate(e => e === document.activeElement));
          const submit = async () => {
            const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/reset' && r.request().method() === 'POST');
            await page.keyboard.press('Enter');
            const response = await pending;
            assert.equal(response.status(), 400);
            assert.deepEqual(await response.json(), { error: 'reset_link_invalid' });
            await page.locator('section[aria-labelledby="redefinir-title"] [role="alert"]').waitFor();
            await button.waitFor({ state: 'visible' });
            await page.waitForFunction(() => !document.querySelector('button[type="submit"]')?.disabled);
          };
          await submit();
          await recordFocus('Enter / 400');
          // A repetição mantém o comportamento existente do ResetForm, sem novo foco programático.
          await page.keyboard.press('Shift+Tab');
          await recordFocus('Shift+Tab');
          assert.ok(await repeat.evaluate(e => e === document.activeElement));
          await page.keyboard.press('Tab');
          await recordFocus('Tab / repetir');
          await submit();
          await recordFocus('Enter / segundo 400');
          observed.push(await page.locator('section[aria-labelledby="redefinir-title"] [role="alert"]').innerText());
          assert.equal(await password.inputValue(), 'Frase sintetica para percurso G4!');
          assert.equal(await repeat.inputValue(), 'Frase sintetica para percurso G4!');
          await password.fill('');
          await repeat.fill('');
          // URL nunca entra na imagem ou no JSON. Campos limpos antes da captura.
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth);
          assert.ok(overflow <= 1, `G4: overflow ${overflow} em ${width}`);
          const screenshot = `g4-${origin}-${width}-claro.png`;
          if (g4EvidenceDir) {
            await mkdir(g4EvidenceDir, { recursive: true });
            await page.screenshot({ path: path.join(g4EvidenceDir, screenshot), fullPage: true });
          }
          entries.push({ route: '/cliente/redefinir-senha', origin, originalTtlSeconds: minutes*60,
            fixture: 'token expirado inserido no PostgreSQL descartável; emissão não exercitada',
            viewport: `${width}x${height}`, theme: 'claro (único suportado)', screenshot,
            percursoTeclado: keyboard, overflow, routeHttpStatus: 200, resetHttpStatuses: [400,400] });
        }
        assert.deepEqual(await context.cookies(), []);
        const unchanged = await pool.query(`SELECT used_at,superseded_at FROM auth_email_tokens WHERE identity_id=$1`, [identityId]);
        assert.equal(unchanged.rows[0].used_at, null);
        assert.equal(unchanged.rows[0].superseded_at, null);
        await context.close();
      } finally { await browser.close().catch(() => {}); }
    }
    if (g4EvidenceDir) await writeFile(path.join(g4EvidenceDir, 'resumo.json'), JSON.stringify({
      schemaVersion: 1, stage: 'UX-PRO-09A-3', date: '2026-10-16',
      baseSha: '091a878eb804720360c75f1b1d26bcf99ecb5233', entries,
      messagesObserved: observed, simulatedFetchRejection: false, mockedHttp: false,
      limitations: ['Fixtures de expiração, não emissão por SMTP/TI', 'Tema claro único',
        'Sem aceite humano, WCAG, UAT ou produção; NO-GO', 'Campos limpos antes de capturar; foco do ResetForm não alterado'],
    }, null, 2) + '\n');
    assert.deepEqual(observed, Array(8).fill(expected));
  } finally {
    await pool.query('DELETE FROM auth_email_tokens WHERE identity_id=ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM auth_identities WHERE id=ANY($1::uuid[])', [ids]);
  }
});


// G3 (UX-PRO-09A-4): a entrega manual da troca de e-mail apontava a rota pública
// /cliente/confirmar-email, cujo handler só consome tokens kind='confirm_email' de
// auth_email_tokens. O token de troca vive em auth_email_change e só é confirmado por
// PUT autenticado em /cliente/app/seguranca. Identidade sintética dedicada: nada aqui
// toca o cliente dos demais testes. Nenhum token vai para PNG, JSON versionado ou log.
test('browser: a troca de e-mail entrega o token manual na superfície que realmente confirma', { skip: !RUN }, async () => {
  const g3EvidenceDir = process.env.UX_PORTAL_G3_EVIDENCE_DIR || '';
  const suffix = randomUUID().slice(0, 8);
  const identityId = randomUUID();
  const currentEmail = `g3-atual-${suffix}@exemplo.invalid`;
  const newEmail = `g3-novo-${suffix}@exemplo.invalid`;
  const password = `Sintetica-${randomUUID()}!`;
  const entries = [];
  try {
    await pool.query(
      `INSERT INTO auth_identities (id, kind, email, display_name, status, verification_method, verified_at)
       VALUES ($1,'client',$2,$3,'active','email_link',NOW())`,
      [identityId, currentEmail, `Cliente Sintetico G3 ${suffix}`],
    );
    await pool.query('INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)',
      [identityId, await hashPassword(password)]);
    const login = await api('/api/auth/login', { method: 'POST', body: { email: currentEmail, password } });
    assert.equal(login.status, 200, `login G3 deveria ser 200, veio ${login.status} ${JSON.stringify(login.body)}`);
    const cookie = login.setCookie.map(item => item.split(';')[0]).join('; ');
    assert.ok(cookie, 'a sessão G3 precisa emitir cookie');

    // --- 1) pedido real de troca, com sessão ativa e mesma origem --------------
    const requested = await api('/api/client/security/email-change', { method: 'POST', cookie, body: { newEmail } });
    assert.equal(requested.status, 202,
      `pedido de troca deveria ser 202, veio ${requested.status} ${JSON.stringify(requested.body)}`);
    assert.equal(requested.body.delivery, 'local_outbox', 'sem SMTP a entrega continua sendo caixa local');

    const stored = await pool.query(
      `SELECT token_hash, EXTRACT(EPOCH FROM (expires_at-created_at))::int AS window_seconds
       FROM auth_email_change WHERE identity_id=$1`, [identityId]);
    assert.equal(stored.rowCount, 1, 'um único pedido pendente para a identidade');
    assert.equal(stored.rows[0].window_seconds, 24 * 3600, 'a validade de 24 h não muda nesta fatia');

    // --- 2) o corpo entregue nomeia a superfície que confirma ------------------
    const box = await pool.query(
      `SELECT template, subject, body, delivery_mode, is_sensitive
       FROM local_outbox_messages WHERE recipient_address=$1`, [newEmail]);
    assert.equal(box.rowCount, 1, 'a entrega manual grava exatamente uma mensagem');
    assert.equal(box.rows[0].template, 'client_email_change');
    assert.equal(box.rows[0].delivery_mode, 'local_outbox', 'o estado nunca afirma envio');
    assert.equal(box.rows[0].is_sensitive, true, 'o conteúdo continua marcado como sensível');
    const manual = box.rows[0].body;
    assert.match(manual, /\/cliente\/app\/seguranca/,
      'a entrega manual precisa nomear a superfície que realmente confirma');
    assert.doesNotMatch(manual, /\/cliente\/confirmar-email/,
      'a rota pública só consome confirm_email e não pode ser indicada para esta troca');
    const tokenMatch = manual.match(/Token:\s*(\S+)\s*$/);
    assert.ok(tokenMatch, 'o token continua disponível uma única vez pelo canal manual');
    const manualToken = tokenMatch[1];
    assert.match(stored.rows[0].token_hash, /^[0-9a-f]{64}$/, 'o banco guarda hash, nunca o token');
    assert.notEqual(stored.rows[0].token_hash, manualToken, 'o token entregue não é o valor persistido');

    // --- 3) prova do defeito anterior: a rota pública recusa este token --------
    const publicAttempt = await api('/api/auth/confirm-email', { method: 'POST', body: { token: manualToken } });
    assert.equal(publicAttempt.status, 400,
      `a rota pública precisa recusar token de troca de e-mail, veio ${publicAttempt.status}`);
    assert.equal(publicAttempt.body.error, 'confirmation_link_invalid');
    const untouched = await pool.query('SELECT used_at, cancelled_at FROM auth_email_change WHERE identity_id=$1', [identityId]);
    assert.equal(untouched.rows[0].used_at, null, 'a recusa pública não pode consumir o token de troca');

    // --- 4) superfície real, medida em quatro larguras, com campos vazios ------
    for (;;) {
      const probe = await fetch(`${baseUrl}/cliente/app/seguranca`, { redirect: 'manual' });
      if (probe.status !== 404) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    for (const [width, height] of [[320, 844], [390, 844], [768, 900], [1440, 900]]) {
      const browser = await launchBrowser();
      try {
        const { context, page, navigationResponse } = await openPage(browser, '/cliente/app/seguranca', cookie, { width, height });
        assert.equal(navigationResponse.status(), 200, `a área protegida deveria responder 200 em ${width}`);
        await page.getByRole('heading', { name: 'Trocar e-mail' }).waitFor();
        await page.waitForLoadState('networkidle');
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });

        const novoEmail = page.getByLabel('Novo e-mail', { exact: true });
        const tokenField = page.getByLabel('Token da URL manual', { exact: true });
        const confirmButton = page.getByRole('button', { name: 'Confirmar troca', exact: true });
        // Percurso real de vários passos, sem Enter: nada é submetido pelo teclado.
        const keyboard = [];
        const recordFocus = async action => keyboard.push({
          action,
          target: await page.evaluate(() => {
            const element = document.activeElement;
            if (!element || element === document.body) return 'BODY (foco perdido)';
            return element.id || element.textContent?.trim().slice(0, 40) || element.tagName;
          }),
        });
        await novoEmail.focus();
        await recordFocus('focus campo novo e-mail');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'new-email');
        await page.keyboard.press('Tab');
        await recordFocus('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Solicitar troca');
        await page.keyboard.press('Tab');
        await recordFocus('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'email-token');
        await page.keyboard.press('Tab');
        await recordFocus('Tab');
        assert.ok(await confirmButton.evaluate(element => element === document.activeElement));
        await page.keyboard.press('Shift+Tab');
        await recordFocus('Shift+Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'email-token');

        // Rótulos visíveis associados aos dois campos do recorte.
        const labels = await page.evaluate(() => ['new-email', 'email-token'].map(id => {
          const input = document.getElementById(id);
          const label = document.querySelector(`label[for="${id}"]`);
          return { id, labelText: label?.textContent?.trim() ?? null, inputType: input?.getAttribute('type') ?? null };
        }));
        assert.deepEqual(labels, [
          { id: 'new-email', labelText: 'Novo e-mail', inputType: 'email' },
          { id: 'email-token', labelText: 'Token da URL manual', inputType: null },
        ]);

        // Campos vazios: token nunca entra em captura nem em JSON versionado.
        assert.equal(await novoEmail.inputValue(), '');
        assert.equal(await tokenField.inputValue(), '');
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `G3: overflow ${overflow} em ${width}`);
        const screenshot = `ux-pro-09a4-troca-email-${width}-claro.png`;
        if (g3EvidenceDir) {
          await mkdir(g3EvidenceDir, { recursive: true });
          await page.screenshot({ path: path.join(g3EvidenceDir, screenshot), fullPage: true });
        }
        entries.push({
          route: '/cliente/app/seguranca', role: 'cliente autenticado (sessão sintética)',
          viewport: `${width}x${height}`, theme: 'claro (único suportado)', screenshot,
          percursoTeclado: keyboard, labels: labels.map(item => item.labelText), overflow,
          routeHttpStatus: 200, camposNasCapturas: 'vazios (token não exibido)',
        });
        await context.close();
      } finally { await browser.close().catch(() => {}); }
    }

    // --- 5) a instrução corrigida é verdadeira: o PUT autenticado confirma -----
    const confirmed = await api('/api/client/security/email-change', { method: 'PUT', cookie, body: { token: manualToken } });
    assert.equal(confirmed.status, 200,
      `o token manual precisa confirmar na superfície indicada, veio ${confirmed.status} ${JSON.stringify(confirmed.body)}`);
    assert.deepEqual(confirmed.body, { ok: true, sessionRevoked: true });
    const after = await pool.query('SELECT email FROM auth_identities WHERE id=$1', [identityId]);
    assert.equal(after.rows[0].email, newEmail, 'o e-mail da mesma identidade foi atualizado');
    const used = await pool.query('SELECT used_at IS NOT NULL AS used FROM auth_email_change WHERE identity_id=$1', [identityId]);
    assert.equal(used.rows[0].used, true, 'o token é de uso único');
    const reused = await api('/api/client/security/email-change', { method: 'PUT', cookie, body: { token: manualToken } });
    assert.equal(reused.status, 401, 'a confirmação revogou as sessões: a antiga não confirma de novo');
    const session = await api('/api/auth/me', { cookie });
    assert.equal(session.status, 401, 'a sessão anterior foi revogada pela troca confirmada');
    const auditRows = await pool.query(
      `SELECT action, result FROM auth_access_audit WHERE actor_id=$1 AND action IN ('email_change_request','email_change_confirm')
       ORDER BY action`, [identityId]);
    assert.deepEqual(auditRows.rows.map(row => `${row.action}/${row.result}`).sort(),
      ['email_change_confirm/allowed', 'email_change_request/allowed']);

    if (g3EvidenceDir) {
      await mkdir(g3EvidenceDir, { recursive: true });
      await writeFile(path.join(g3EvidenceDir, 'resumo.json'), `${JSON.stringify({
        schemaVersion: 1, stage: 'UX-PRO-09A-4', date: '2026-10-16', gap: 'G3',
        route: '/cliente/app/seguranca', entries,
        delivery: {
          channel: 'local_outbox (sem SMTP; nada foi enviado)',
          template: 'client_email_change',
          bodyMentionsRealSurface: /\/cliente\/app\/seguranca/.test(manual),
          bodyMentionsPublicConfirmRoute: /\/cliente\/confirmar-email/.test(manual),
          tokenInEvidence: 'redigido (nunca versionado, capturado ou registrado)',
          windowSeconds: stored.rows[0].window_seconds,
          storedValueIsHash: /^[0-9a-f]{64}$/.test(stored.rows[0].token_hash),
        },
        defectReproduced: {
          publicRouteStatus: publicAttempt.status,
          publicRouteError: publicAttempt.body.error,
          tokenStillUnusedAfterPublicAttempt: untouched.rows[0].used_at === null,
        },
        confirmation: {
          putStatus: confirmed.status, sessionRevoked: confirmed.body.sessionRevoked === true,
          identityEmailUpdated: after.rows[0].email === newEmail,
          tokenSingleUse: used.rows[0].used === true,
          previousSessionRefused: session.status === 401,
          audit: auditRows.rows.map(row => `${row.action}/${row.result}`),
        },
        simulatedFetchRejection: false, mockedHttp: false,
        limitations: [
          'Caixa local: sem SMTP/provedor real, nada é enviado de fato',
          'Tema claro único nesta superfície; sem alternador noturno',
          'Identidade e dados sintéticos em PostgreSQL descartável',
          'Sem aceite humano, UAT, certificação WCAG ou produção; NO-GO',
        ],
      }, null, 2)}\n`, 'utf8');
    }
  } finally {
    await pool.query('DELETE FROM local_outbox_messages WHERE recipient_address=$1', [newEmail]).catch(() => {});
    await pool.query('DELETE FROM auth_email_change WHERE identity_id=$1', [identityId]).catch(() => {});
    await pool.query('DELETE FROM auth_access_audit WHERE actor_id=$1', [identityId]).catch(() => {});
    await pool.query('DELETE FROM auth_sessions WHERE identity_id=$1', [identityId]).catch(() => {});
    await pool.query('DELETE FROM auth_credentials WHERE identity_id=$1', [identityId]).catch(() => {});
    await pool.query('DELETE FROM auth_identities WHERE id=$1', [identityId]).catch(() => {});
  }
});


// G5 (UX-PRO-09A-5): nas entradas públicas do cliente, o erro pós-submissão recebia
// role="alert" mas nenhum foco: ao desabilitar o botão em "busy", o foco caía em BODY.
// Aplica-se aqui o padrão já mergeado de G1/G2 (ref + tabIndex={-1} + focus no efeito,
// contorno existente em RealAccess.module.css), localmente em cada rota. O resumo é
// gravado ANTES das asserções de correção: a execução RED registra o estado anterior.
// Nenhuma senha, token de convite ou cookie entra em PNG, JSON versionado ou log.
test('browser: erro pós-submissão recebe foco nas entradas públicas do cliente (G5)', { skip: !RUN }, async () => {
  const g5EvidenceDir = process.env.UX_PORTAL_G5_EVIDENCE_DIR || '';
  const entries = [];
  const inviteEmail = `g5-convite-${randomUUID().slice(0, 8)}@exemplo.invalid`;
  let inviteId = null;
  const staffIds = [];
  const recordFocusOf = page => async action => {
    const target = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return 'BODY (foco perdido ao desabilitar o botão)';
      return element.id || element.textContent?.trim().slice(0, 60) || element.tagName;
    });
    return { action, target };
  };
  try {
    // Convite pendente real, emitido pelo fluxo administrativo canônico (papel TI).
    const ti = await provisionStaff(pool, { role: 'ti' });
    staffIds.push(ti.id);
    const tiCookie = await loginStaffHttp(ti.email);
    const created = await api('/api/admin/invites', { method: 'POST', cookie: tiCookie, body: { email: inviteEmail } });
    assert.equal(created.status, 201, `emissão de convite deveria ser 201, veio ${created.status} ${JSON.stringify(created.body)}`);
    assert.equal(created.body.emailStatus, 'local_outbox', 'sem SMTP o convite vai para a caixa local');
    inviteId = created.body.inviteId;
    const box = await pool.query(
      "SELECT body FROM local_outbox_messages WHERE recipient_address=$1 AND template='client_invite'",
      [inviteEmail],
    );
    assert.equal(box.rowCount, 1, 'o convite pendente precisa estar na caixa local');
    const inviteUrl = box.rows[0].body.match(/\/cliente\/convite\?token=\S+/)?.[0];
    assert.ok(inviteUrl, 'o corpo do convite precisa trazer o link de aceite');

    for (const [width, height] of [[320, 844], [390, 844], [768, 900], [1440, 900]]) {
      // ---------------- /cliente/entrar: credencial recusada ----------------
      {
        const browser = await launchBrowser();
        try {
          const { context, page, navigationResponse } = await openPage(browser, '/cliente/entrar', null, { width, height });
          assert.equal(navigationResponse.status(), 200, `a entrada do cliente deveria responder 200 em ${width}`);
          await page.getByRole('heading', { name: 'Entrar na área do cliente' }).waitFor();
          await page.waitForLoadState('networkidle');
          await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
          const recordFocus = recordFocusOf(page);
          const email = page.getByLabel('E-mail', { exact: true });
          const senha = page.getByLabel('Senha', { exact: true });
          const button = page.getByRole('button', { name: 'Entrar', exact: true });
          const keyboard = [];
          await email.focus();
          keyboard.push(await recordFocus('focus e-mail'));
          await email.fill(`g5-entrar-${randomUUID().slice(0, 8)}@exemplo.invalid`);
          await page.keyboard.press('Tab');
          keyboard.push(await recordFocus('Tab'));
          assert.equal(await page.evaluate(() => document.activeElement.id), 'password');
          await senha.fill('Frase sintetica G5 sem conta!');
          await page.keyboard.press('Tab');
          keyboard.push(await recordFocus('Tab'));
          assert.ok(await button.evaluate(element => element === document.activeElement));
          const pending = page.waitForResponse(response =>
            new URL(response.url()).pathname === '/api/auth/login' && response.request().method() === 'POST');
          await page.keyboard.press('Enter');
          const loginResponse = await pending;
          assert.equal(loginResponse.status(), 401, 'credencial desconhecida responde 401 genérico');
          const alert = page.locator('section[aria-labelledby="entrar-title"] form [role="alert"]');
          await alert.waitFor();
          keyboard.push(await recordFocus('Enter / 401 genérico'));
          keyboard.push(await recordFocus('passo seguinte após o erro (repetição por teclado)'));
          await page.keyboard.press('Tab');
          keyboard.push(await recordFocus('Tab após o erro'));
          const repetition = keyboard[keyboard.length - 1].target;
          // Senha nunca entra em captura: campos limpos antes do PNG.
          await email.fill('');
          await senha.fill('');
          const overflow = await page.evaluate(() =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth);
          assert.ok(overflow <= 1, `G5 entrar: overflow ${overflow} em ${width}`);
          const screenshot = `ux-pro-09a5-entrar-erro-${width}-claro.png`;
          if (g5EvidenceDir) {
            await mkdir(g5EvidenceDir, { recursive: true });
            await page.screenshot({ path: path.join(g5EvidenceDir, screenshot), fullPage: true });
          }
          entries.push({
            route: '/cliente/entrar', state: 'erro pós-submissão (401 genérico real, conta desconhecida)',
            viewport: `${width}x${height}`, theme: 'claro (único suportado)', screenshot,
            percursoTeclado: keyboard, overflow, loginHttpStatus: 401,
            focusAposFalha: keyboard.find(item => item.action === 'Enter / 401 genérico')?.target ?? null,
            repeticaoAposErro: repetition,
          });
          await context.close();
        } finally { await browser.close().catch(() => {}); }
      }

      // ---------------- /cliente/convite: senha comum recusada --------------
      {
        const browser = await launchBrowser();
        try {
          const { context, page, navigationResponse } = await openPage(browser, inviteUrl, null, { width, height });
          assert.equal(navigationResponse.status(), 200, `o aceite de convite deveria responder 200 em ${width}`);
          await page.getByRole('heading', { name: 'Aceitar convite' }).waitFor();
          await page.getByLabel('Senha', { exact: true }).waitFor();
          await page.waitForLoadState('networkidle');
          await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
          const recordFocus = recordFocusOf(page);
          const senha = page.getByLabel('Senha', { exact: true });
          const repetir = page.getByLabel('Repita a senha', { exact: true });
          const button = page.getByRole('button', { name: 'Criar meu acesso', exact: true });
          const keyboard = [];
          await senha.focus();
          keyboard.push(await recordFocus('focus senha'));
          await senha.fill('password1234');
          await page.keyboard.press('Tab');
          keyboard.push(await recordFocus('Tab'));
          assert.equal(await page.evaluate(() => document.activeElement.id), 'passwordAgain');
          await repetir.fill('password1234');
          await page.keyboard.press('Tab');
          keyboard.push(await recordFocus('Tab'));
          assert.ok(await button.evaluate(element => element === document.activeElement));
          const pending = page.waitForResponse(response =>
            new URL(response.url()).pathname === '/api/auth/invite/accept' && response.request().method() === 'POST');
          await page.keyboard.press('Enter');
          const acceptResponse = await pending;
          assert.equal(acceptResponse.status(), 400, 'senha comum é recusada no servidor');
          assert.deepEqual(await acceptResponse.json(), { error: 'password_common' });
          const alert = page.locator('section[aria-labelledby="convite-title"] form [role="alert"]');
          await alert.waitFor();
          keyboard.push(await recordFocus('Enter / 400 password_common'));
          await page.keyboard.press('Tab');
          keyboard.push(await recordFocus('Tab após o erro'));
          const repetition = keyboard[keyboard.length - 1].target;
          await senha.fill('');
          await repetir.fill('');
          const overflow = await page.evaluate(() =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth);
          assert.ok(overflow <= 1, `G5 convite: overflow ${overflow} em ${width}`);
          const screenshot = `ux-pro-09a5-convite-erro-${width}-claro.png`;
          if (g5EvidenceDir) {
            await mkdir(g5EvidenceDir, { recursive: true });
            await page.screenshot({ path: path.join(g5EvidenceDir, screenshot), fullPage: true });
          }
          entries.push({
            route: '/cliente/convite', state: 'erro pós-submissão (400 password_common real, convite continua pendente)',
            viewport: `${width}x${height}`, theme: 'claro (único suportado)', screenshot,
            percursoTeclado: keyboard, overflow, acceptHttpStatus: 400,
            focusAposFalha: keyboard.find(item => item.action === 'Enter / 400 password_common')?.target ?? null,
            repeticaoAposErro: repetition,
          });
          await context.close();
        } finally { await browser.close().catch(() => {}); }
      }
    }

    // O convite não pode ter sido consumido pelas recusas de senha.
    const stillPending = await pool.query('SELECT used_at, revoked_at FROM auth_invites WHERE id=$1', [inviteId]);
    assert.equal(stillPending.rows[0].used_at, null, 'a recusa de senha não consome o convite');
    assert.equal(stillPending.rows[0].revoked_at, null);

    // Resumo gravado ANTES das asserções de correção: a execução RED (código ainda
    // sem foco no erro) deixa a medição do estado anterior registrada em disco.
    if (g5EvidenceDir) {
      await mkdir(g5EvidenceDir, { recursive: true });
      await writeFile(path.join(g5EvidenceDir, 'resumo.json'), `${JSON.stringify({
        schemaVersion: 1, stage: 'UX-PRO-09A-5', date: '2026-10-16', gap: 'G5',
        routes: ['/cliente/entrar', '/cliente/convite'], entries,
        simulatedFetchRejection: false, mockedHttp: false,
        invite: { estadoAposRecusas: 'pendente (não consumido)', tokenEmEvidencia: 'não (somente em memória)' },
        limitations: [
          'Tema claro único nestas superfícies; sem alternador noturno',
          'Percurso medido no Chromium empacotado em Linux; sem leitores de tela/zoom 200%/Windows',
          'Dados sintéticos em PostgreSQL descartável; sem SMTP real',
          'Sem aceite humano, UAT, certificação WCAG ou produção; NO-GO',
        ],
      }, null, 2)}\n`, 'utf8');
    }

    // Expectativas corrigidas (falham na execução RED, passam com o padrão G1/G2).
    for (const entry of entries) {
      assert.ok(entry.focusAposFalha && !entry.focusAposFalha.startsWith('BODY'),
        `G5: após a falha o foco precisa ir para o erro, não para "${entry.focusAposFalha}" em ${entry.route} ${entry.viewport}`);
      assert.match(entry.focusAposFalha, /não conferem|comum|segura/i,
        `G5: o foco precisa estar na mensagem de erro visível em ${entry.route} ${entry.viewport}`);
      assert.match(entry.repeticaoAposErro, /Entrar|Criar meu acesso/,
        `G5: o passo seguinte ao erro precisa alcançar a repetição em ${entry.route} ${entry.viewport}`);
    }
  } finally {
    await pool.query('DELETE FROM local_outbox_messages WHERE recipient_address=$1', [inviteEmail]).catch(() => {});
    await pool.query('DELETE FROM auth_invites WHERE id=$1', [inviteId]).catch(() => {});
    if (staffIds.length) {
      await pool.query('DELETE FROM auth_access_audit WHERE actor_id=ANY($1::uuid[])', [staffIds]).catch(() => {});
      await pool.query('DELETE FROM auth_sessions WHERE identity_id=ANY($1::uuid[])', [staffIds]).catch(() => {});
      await pool.query('DELETE FROM auth_staff_profiles WHERE identity_id=ANY($1::uuid[])', [staffIds]).catch(() => {});
      await pool.query('DELETE FROM auth_credentials WHERE identity_id=ANY($1::uuid[])', [staffIds]).catch(() => {});
      await pool.query('DELETE FROM auth_identities WHERE id=ANY($1::uuid[])', [staffIds]).catch(() => {});
    }
  }
});


// G5 (UX-PRO-09A-6): na entrada do funcionário, o aviso de falha de submissão
// (ErrorNotice/UiState, role="alert") não recebia foco; ao desabilitar o botão em
// "busy", o foco caía em BODY. Correção local: invólucro focável com ref + tabIndex
// {-1} + focus no efeito, contorno novo e local em EmployeePortal.module.css. O
// UiState compartilhado permanece intacto. Resumo gravado ANTES das asserções de
// correção: a execução RED registra o estado anterior em antes/.
test('browser: falha de submissão na entrada do funcionário recebe foco, em dia e noite (G5)', { skip: !RUN }, async () => {
  const baseEvidenceDir = process.env.UX_PRO_09A6_EVIDENCE_DIR || '';
  const evidenceDir = baseEvidenceDir ? path.join(baseEvidenceDir, 'funcionario') : '';
  const entries = [];
  for (const theme of ['day', 'night']) {
    for (const [width, height] of [[320, 844], [390, 844], [768, 900], [1440, 900]]) {
      const browser = await launchBrowser();
      try {
        const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
        if (theme === 'night') {
          await context.addInitScript(() => {
            try { window.localStorage.setItem('segsystem.admin.appearance.v1', 'night'); } catch { /* sem storage */ }
          });
        }
        const page = await context.newPage();
        page.setDefaultTimeout(45_000);
        page.setDefaultNavigationTimeout(90_000);
        await page.goto(`${baseUrl}/funcionario`, { waitUntil: 'domcontentloaded' });
        await page.getByRole('heading', { name: 'Portal do funcionário' }).waitFor();
        await page.waitForLoadState('networkidle');
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
        assert.equal(await page.evaluate(() => document.documentElement.dataset.adminTheme ?? 'day'), theme,
          `o tema pedido precisa estar aplicado em ${width}/${theme}`);
        const keyboard = [];
        const recordFocus = async action => keyboard.push({ action, target: await page.evaluate(() => {
          const element = document.activeElement;
          if (!element || element === document.body) return 'BODY (foco perdido ao desabilitar o botão)';
          if (element.getAttribute('data-login-error-focus') === 'true') return `[data-login-error-focus] ${element.textContent?.trim().slice(0, 50)}`;
          return element.id || element.textContent?.trim().slice(0, 40) || element.tagName;
        }) });
        const email = page.locator('#portal-email');
        const senha = page.locator('#portal-senha');
        const button = page.getByRole('button', { name: 'Entrar com segurança', exact: true });
        await email.focus();
        await recordFocus('focus e-mail');
        await email.fill(employeeEmail);
        await page.keyboard.press('Tab');
        await recordFocus('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'portal-senha');
        await senha.fill(`Errada-${randomUUID()}!`);
        await page.keyboard.press('Tab');
        await recordFocus('Tab');
        assert.ok(await button.evaluate(element => element === document.activeElement));
        const pending = page.waitForResponse(response =>
          new URL(response.url()).pathname === '/api/employee/session' && response.request().method() === 'POST');
        await page.keyboard.press('Enter');
        const loginResponse = await pending;
        assert.ok([401, 429].includes(loginResponse.status()),
          `senha errada deve responder 401 (ou 429 sob limite), veio ${loginResponse.status()}`);
        // Espera o estado de erro que existe ANTES e DEPOIS da correção (UiState);
        // o invólucro focável é verificado pelas medições de foco logo abaixo.
        const notice = page.locator('[data-ui-state="error"]');
        await notice.waitFor({ timeout: 30_000 });
        await recordFocus('Enter / falha real');
        // O aviso fica antes do formulário no DOM: mede-se um percurso limitado até
        // o botão de repetir, em vez de supor que um único Tab chegaria nele.
        let repetition = 'não alcançada em 6 passos de Tab';
        for (let step = 1; step <= 6; step += 1) {
          await page.keyboard.press('Tab');
          await recordFocus(`Tab ${step} após o erro`);
          const target = keyboard[keyboard.length - 1].target;
          if (/Entrar com segurança/.test(target)) { repetition = target; break; }
        }
        await email.fill('');
        await senha.fill('');
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `G5 funcionário: overflow ${overflow} em ${width}/${theme}`);
        const screenshot = `ux-pro-09a6-funcionario-${theme}-${width}.png`;
        if (evidenceDir) {
          await mkdir(evidenceDir, { recursive: true });
          await page.screenshot({ path: path.join(evidenceDir, screenshot), fullPage: true });
        }
        entries.push({
          route: '/funcionario', theme, viewport: `${width}x${height}`, screenshot,
          percursoTeclado: keyboard, overflow, loginHttpStatus: loginResponse.status(),
          focusAposFalha: keyboard.find(item => item.action === 'Enter / falha real')?.target ?? null,
          repeticaoAposErro: repetition,
        });
        await context.close();
      } finally { await browser.close().catch(() => {}); }
    }
  }
  if (evidenceDir) {
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(path.join(evidenceDir, 'resumo.json'), `${JSON.stringify({
      schemaVersion: 1, stage: 'UX-PRO-09A-6', date: '2026-10-16', gap: 'G5',
      route: '/funcionario', entries,
      simulatedFetchRejection: false, mockedHttp: false,
      limitations: [
        'Percurso medido no Chromium empacotado em Linux; sem leitores de tela/zoom 200%/Windows',
        'Funcionário e dados sintéticos em PostgreSQL descartável',
        'Sem aceite humano, UAT, certificação WCAG ou produção; NO-GO',
      ],
    }, null, 2)}\n`, 'utf8');
  }
  for (const entry of entries) {
    assert.ok(entry.focusAposFalha?.startsWith('[data-login-error-focus]'),
      `G5: após a falha o foco precisa ir para o aviso, não para "${entry.focusAposFalha}" em ${entry.viewport}/${entry.theme}`);
    assert.match(entry.repeticaoAposErro, /Entrar com segurança/,
      `G5: o passo seguinte ao erro precisa alcançar a repetição em ${entry.viewport}/${entry.theme}`);
  }
});

// UX-PRO-09C (ID1) — identidade de conta/autenticação: em /cliente/app/seguranca,
// todo manuseador baseado em workspaceFetch morria ANTES do ramo honesto — o helper
// lança exceção em qualquer não-2xx, e os ramos `!ok`/`d.error` escritos na página
// eram código morto. O resultado observável: senha recusada virava "erro de conexão",
// token inválido e revogação de sessão não produziam NENHUM aviso (rejeição não
// tratada), e o código TOTP errado era apresentado como indisponibilidade do MFA.
//
// O cenário ID1g MEDIU — não supôs — o efeito da ativação sobre a sessão: o
// servidor invalida a sessão antiga (readClientSession: mfa_verified_at deve
// postdatar activated_at), e o teste registra o 401 em vez de reivindicar defeito.
//
// Este teste registra o estado observado (resumo.json + PNGs) ANTES das asserções:
// a execução RED, com a página ainda não corrigida, preserva o "antes" na pasta
// indicada por UX_PORTAL_09C_EVIDENCE_DIR; a execução GREEN, com o reparo, grava o
// "depois". A falha injetada existe APENAS em window.fetch, dentro da página, e o
// servidor nunca é enfraquecido; os cenários de recusa real usam o HTTP verdadeiro
// do PostgreSQL descartável. Nenhuma senha, token ou cookie entra em PNG ou JSON.
test('browser: /cliente/app/seguranca descreve falhas e sucessos sem mentir (ID1 — UX-PRO-09C)', { skip: !RUN }, async () => {
  const evidenceDir = process.env.UX_PORTAL_09C_EVIDENCE_DIR || '';
  const suffix = randomUUID().slice(0, 8);
  const entries = [];
  const identities = [];
  const observations = { apiMeStatusAfterActivation: null, mfaActivated: false, pendingEmail: null };
  const windowFetchInjection = [];

  async function makeClient(label) {
    const email = `09c-${label}-${suffix}@exemplo.invalid`;
    const password = `Cliente-${randomUUID()}!`;
    const identityId = randomUUID();
    await pool.query(
      `INSERT INTO auth_identities (id, kind, email, display_name, status, verification_method, verified_at)
       VALUES ($1,'client',$2,$3,'active','email_link',NOW())`,
      [identityId, email, `Cliente Sintetico 09C ${label} ${suffix}`],
    );
    await pool.query('INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)',
      [identityId, await hashPassword(password)]);
    const login = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    assert.equal(login.status, 200, `login 09C/${label} deveria ser 200, veio ${login.status} ${JSON.stringify(login.body)}`);
    const cookie = login.setCookie.map(item => item.split(';')[0]).join('; ');
    assert.ok(cookie, `o login 09C/${label} precisa emitir cookie de sessão`);
    identities.push(identityId);
    return { identityId, email, password, cookie };
  }

  /**
   * Sonda de rejeições não tratadas, com opcional injeção de falha apenas no
   * método DELETE de revogação (o failRoutes do openPage não distingue método:
   * derrubar a URL também derrubaria o GET da lista). Tudo em UM addInitScript —
   * o openPage dispara o goto sem aguardar o onPage, e um segundo script
   * registrado depois disso não se aplicaria à navegação.
   */
  async function installTruthProbe(page, { failSessionDelete = false } = {}) {
    await page.addInitScript(inject => {
      window.__ux09c = { unhandled: [], injections: [] };
      window.addEventListener('unhandledrejection', event => {
        window.__ux09c.unhandled.push(String(event.reason?.message || event.reason));
      });
      if (inject.failSessionDelete) {
        const original = window.fetch.bind(window);
        window.fetch = (input, init) => {
          const url = typeof input === 'string' ? input : (input?.url || '');
          const method = ((init && init.method) || 'GET').toUpperCase();
          if (method === 'DELETE' && url.includes('/api/client/security/sessions/')) {
            window.__ux09c.injections.push(`DELETE ${new URL(url, window.location.origin).pathname} → 503 security_unavailable`);
            return Promise.resolve(new Response(JSON.stringify({ error: 'security_unavailable' }),
              { status: 503, headers: { 'content-type': 'application/json' } }));
          }
          return original(input, init);
        };
      }
    }, { failSessionDelete });
  }

  async function readState(page) {
    return page.evaluate(() => ({
      notices: [...document.querySelectorAll('p[role="status"], p[role="alert"]')]
        .map(node => node.textContent.trim()).filter(Boolean),
      unhandled: (window.__ux09c && window.__ux09c.unhandled) || [],
      injections: (window.__ux09c && window.__ux09c.injections) || [],
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
  }

  async function snap(page, scenarioId, viewport) {
    if (!evidenceDir) return;
    await mkdir(evidenceDir, { recursive: true });
    await page.screenshot({ path: path.join(evidenceDir, `ux-pro-09c-${scenarioId}-${viewport}.png`), fullPage: true });
  }

  try {
    // --- ID1a: senha recusada (403 invalid_credentials) precisa falar de senha —
    // falha injetada só em window.fetch; o servidor não participa.
    {
      const client = await makeClient('a');
      windowFetchInjection.push('POST /api/client/security/mfa/setup → 403 invalid_credentials (somente window.fetch)');
      const browser = await launchBrowser();
      try {
        const { context, page, navigationResponse } = await openPage(browser, '/cliente/app/seguranca', client.cookie, {
          width: 390, height: 844,
          failRoutes: ['/api/client/security/mfa/setup'], status: 403, code: 'invalid_credentials',
          onPage: installTruthProbe,
        });
        assert.equal(navigationResponse.status(), 200, 'a área protegida deveria responder 200');
        await page.getByRole('heading', { name: 'Segurança da conta · aplicativo autenticador' }).waitFor();
        await page.getByLabel('Confirme sua senha').fill(`Errada-${randomUUID()}!`);
        await page.getByRole('button', { name: 'Preparar autenticador' }).click();
        await page.locator('p[role="status"]').first().waitFor({ timeout: 30_000 });
        const state = await readState(page);
        await snap(page, 'id1a-setup-senha-recusada', '390');
        entries.push({
          scenario: 'ID1a — senha recusada no preparo do MFA (403 injetado em window.fetch)',
          route: '/cliente/app/seguranca', viewport: '390x844', theme: 'claro (único suportado)',
          screenshot: 'ux-pro-09c-id1a-setup-senha-recusada-390.png', ...state,
        });
        await context.close();
      } finally { await browser.close().catch(() => {}); }
    }

    // --- ID1d: segundo pedido de troca com pendente real → recusa do servidor ---
    // Medido nesta fatia: o 409 intocado (email_change_pending) colapsa em
    // 503 security_unavailable porque o catch de handleEmailChangeRequest não
    // tem o ramo `e.status` dos handlers irmãos (resíduo ID6, contrato de API —
    // fora deste slice). O teste aceita os dois status e exige que a interface
    // descreva a recusa sem fingir "erro de conexão".
    {
      const client = await makeClient('d');
      observations.pendingEmail = `09c-pendente-${suffix}@exemplo.invalid`;
      const first = await api('/api/client/security/email-change', {
        method: 'POST', cookie: client.cookie, body: { newEmail: observations.pendingEmail } });
      assert.equal(first.status, 202, `o pedido inicial de troca deveria ser 202, veio ${first.status}`);
      const browser = await launchBrowser();
      try {
        const { context, page, navigationResponse } = await openPage(browser, '/cliente/app/seguranca', client.cookie,
          { width: 390, height: 844, onPage: installTruthProbe });
        assert.equal(navigationResponse.status(), 200, 'a área protegida deveria responder 200');
        await page.getByRole('heading', { name: 'Trocar e-mail' }).waitFor();
        await page.getByLabel('Novo e-mail', { exact: true }).fill(`09c-outro-${randomUUID().slice(0, 8)}@exemplo.invalid`);
        const postPending = page.waitForResponse(response =>
          response.url().includes('/api/client/security/email-change') && response.request().method() === 'POST');
        await page.getByRole('button', { name: 'Solicitar troca', exact: true }).click();
        const refused = await postPending;
        await page.locator('p[role="status"]').first().waitFor({ timeout: 30_000 });
        const state = await readState(page);
        await snap(page, 'id1d-segundo-pedido-recusado', '390');
        entries.push({
          scenario: `ID1d — segundo pedido de troca recusado pelo servidor (HTTP ${refused.status()} real)`,
          route: '/cliente/app/seguranca', viewport: '390x844', theme: 'claro (único suportado)',
          screenshot: 'ux-pro-09c-id1d-segundo-pedido-recusado-390.png', httpStatus: refused.status(), ...state,
        });
        await context.close();
      } finally { await browser.close().catch(() => {}); }
    }

    // --- ID1e: token inválido no PUT → o aviso precisa existir, em 4 larguras --
    for (const [width, height] of [[320, 844], [390, 844], [768, 900], [1440, 900]]) {
      const client = await makeClient(`e${width}`);
      const browser = await launchBrowser();
      try {
        const { context, page, navigationResponse } = await openPage(browser, '/cliente/app/seguranca', client.cookie,
          { width, height, onPage: installTruthProbe });
        assert.equal(navigationResponse.status(), 200, `a área protegida deveria responder 200 em ${width}`);
        await page.getByRole('heading', { name: 'Trocar e-mail' }).waitFor();
        const putPending = page.waitForResponse(response =>
          response.url().includes('/api/client/security/email-change') && response.request().method() === 'PUT');
        await page.getByLabel('Token da URL manual', { exact: true }).fill('token-sintetico-invalido-09c');
        await page.getByRole('button', { name: 'Confirmar troca', exact: true }).click();
        const put = await putPending;
        await page.waitForTimeout(800);
        const state = await readState(page);
        await snap(page, 'id1e-token-invalido', String(width));
        entries.push({
          scenario: `ID1e — token inválido no PUT (HTTP ${put.status()} real) em ${width}px`,
          route: '/cliente/app/seguranca', viewport: `${width}x${height}`, theme: 'claro (único suportado)',
          screenshot: `ux-pro-09c-id1e-token-invalido-${width}.png`, httpStatus: put.status(), ...state,
        });
        await context.close();
      } finally { await browser.close().catch(() => {}); }
    }

    // --- ID1f: revogação de sessão recusada (503 injetado só em DELETE) --------
    {
      const client = await makeClient('f');
      // Segunda sessão real da mesma identidade: sem ela não existe botão
      // "Revogar" por item (a sessão atual nunca se revoga a si mesma).
      const second = await api('/api/auth/login', { method: 'POST', body: { email: client.email, password: client.password } });
      assert.equal(second.status, 200, 'a segunda sessão do mesmo cliente deveria ser 200');
      windowFetchInjection.push('DELETE /api/client/security/sessions/:id → 503 security_unavailable (somente window.fetch, apenas no método DELETE)');
      const browser = await launchBrowser();
      try {
        const { context, page, navigationResponse } = await openPage(browser, '/cliente/app/seguranca', client.cookie, {
          width: 390, height: 844,
          onPage: pageArg => installTruthProbe(pageArg, { failSessionDelete: true }),
        });
        assert.equal(navigationResponse.status(), 200, 'a área protegida deveria responder 200');
        await page.getByRole('heading', { name: 'Sessões da conta' }).waitFor();
        const revokeButton = page.getByRole('button', { name: 'Revogar', exact: true });
        await revokeButton.waitFor({ timeout: 30_000 });
        await revokeButton.click();
        await page.waitForTimeout(1_200);
        const state = await readState(page);
        assert.ok(state.injections.some(item => item.startsWith('DELETE /api/client/security/sessions/')),
          `a injeção de falha no DELETE precisa ter disparado; veio ${JSON.stringify(state.injections)}`);
        await snap(page, 'id1f-revogacao-recusada-503', '390');
        entries.push({
          scenario: 'ID1f — revogação de sessão recusada (503 injetado em window.fetch)',
          route: '/cliente/app/seguranca', viewport: '390x844', theme: 'claro (único suportado)',
          screenshot: 'ux-pro-09c-id1f-revogacao-recusada-503-390.png', httpStatus: 503, ...state,
        });
        await context.close();
      } finally { await browser.close().catch(() => {}); }
    }

    // --- ID1b/ID1g/ID1c: jornada real de MFA — código errado, ativação e o que
    // acontece DEPOIS com a sessão (o aviso antigo afirmava "bloqueada").
    {
      const client = await makeClient('mfa');
      const browser = await launchBrowser();
      try {
        const { context, page, navigationResponse } = await openPage(browser, '/cliente/app/seguranca', client.cookie,
          { width: 390, height: 844, onPage: installTruthProbe });
        assert.equal(navigationResponse.status(), 200, 'a área protegida deveria responder 200');
        await page.getByRole('heading', { name: 'Segurança da conta · aplicativo autenticador' }).waitFor();
        await page.getByLabel('Confirme sua senha').fill(client.password);
        const setupPending = page.waitForResponse(response =>
          response.url().includes('/api/client/security/mfa/setup') && response.request().method() === 'POST',
          { timeout: 30_000 }).catch(() => null);
        await page.getByRole('button', { name: 'Preparar autenticador' }).click();
        const setupResponse = await setupPending;
        await page.getByLabel('Código do aplicativo').waitFor({ timeout: 30_000 }).catch(() => {});
        if (!(await page.locator('#mfa-activate-code').count())) {
          const setupState = await readState(page);
          throw new Error(
            `preparo do MFA não abriu o campo de código (POST ${setupResponse ? setupResponse.status() : 'nenhum'}); avisos=${JSON.stringify(setupState.notices)}`);
        }
        const secret = (await page.locator('code').first().textContent())?.trim() || '';
        assert.ok(secret.length >= 16, `o segredo TOTP precisa aparecer na tela de configuração, veio "${secret}"`);

        // ID1b: código com formato válido porém errado.
        const correct = String(await generateTotp({ secret }));
        const wrong = String((Number(correct) + 1) % 1_000_000).padStart(6, '0');
        await page.getByLabel('Código do aplicativo').fill(wrong);
        await page.getByRole('button', { name: 'Ativar MFA', exact: true }).click();
        await page.locator('p[role="status"]').first().waitFor({ timeout: 30_000 });
        const wrongState = await readState(page);
        await snap(page, 'id1b-codigo-errado', '390');
        entries.push({
          scenario: 'ID1b — código TOTP errado (403 mfa_code_invalid real)',
          route: '/cliente/app/seguranca', viewport: '390x844', theme: 'claro (único suportado)',
          screenshot: 'ux-pro-09c-id1b-codigo-errado-390.png', ...wrongState,
        });

        // ID1g: ativação real (uma repetição protege contra virada de janela TOTP).
        for (let attempt = 1; attempt <= 2 && !observations.mfaActivated; attempt += 1) {
          const code = String(await generateTotp({ secret }));
          await page.getByLabel('Código do aplicativo').fill(code);
          await page.getByRole('button', { name: 'Ativar MFA', exact: true }).click();
          try {
            await page.getByRole('heading', { name: 'Códigos de recuperação' }).waitFor({ timeout: 12_000 });
            observations.mfaActivated = true;
          } catch { /* virada de janela: nova tentativa com código novo */ }
        }
        if (observations.mfaActivated) {
          const activeState = await readState(page);
          await snap(page, 'id1g-ativo-sessao-bloqueada', '390');
          entries.push({
            scenario: 'ID1g — ativação real: o aviso de bloqueio precisa corresponder ao servidor (bloqueio confirmado)',
            route: '/cliente/app/seguranca', viewport: '390x844', theme: 'claro (único suportado)',
            screenshot: 'ux-pro-09c-id1g-ativo-sessao-bloqueada-390.png', ...activeState,
          });
          // readClientSession (client-access-api.mjs:242-247) invalida sessão sem
          // mfa_verified_at posterior à ativação: o servidor BLOQUEIA a sessão
          // antiga de fato. O teste mede isso em vez de supor.
          const me = await api('/api/auth/me', { cookie: client.cookie });
          observations.apiMeStatusAfterActivation = me.status;

          // O botão continua levando à entrada; a sessão antiga já não serve.
          await page.getByRole('button', { name: /Já guardei/ }).click();
          await page.waitForURL('**/cliente/entrar**', { timeout: 30_000 });
          await context.close();

          // ID1c: reentra pelo desafio MFA real (a senha sozinha não autentica
          // mais) e tenta desativar com senha recusada.
          const relogin = await api('/api/auth/login', {
            method: 'POST', body: { email: client.email, password: client.password } });
          assert.equal(relogin.status, 202,
            `com MFA ativo o login precisa desafiar com 202, veio ${relogin.status} ${JSON.stringify(relogin.body)}`);
          const challengeCode = String(await generateTotp({ secret }));
          const completed = await api('/api/auth/mfa/complete', {
            method: 'POST', body: { challenge: relogin.body.challenge, code: challengeCode } });
          assert.equal(completed.status, 200,
            `a conclusão do desafio MFA deveria ser 200, veio ${completed.status} ${JSON.stringify(completed.body)}`);
          const mfaCookie = completed.setCookie.map(item => item.split(';')[0]).join('; ');
          assert.ok(mfaCookie, 'o desafio MFA concluído precisa emitir cookie de sessão');

          const browser2 = await launchBrowser();
          try {
            const back = await openPage(browser2, '/cliente/app/seguranca', mfaCookie,
              { width: 390, height: 844, onPage: installTruthProbe });
            assert.equal(back.navigationResponse.status(), 200,
              'a sessão nova, provada por MFA, precisa abrir a área sem novo login');
            await back.page.getByRole('heading', { name: 'Segurança da conta · aplicativo autenticador' }).waitFor();
            await back.page.getByLabel('Senha atual').fill(`Errada-${randomUUID()}!`);
            // O servidor confere a senha ANTES do código: senha errada + código
            // com formato válido bastam para reproduzir o 403 invalid_credentials.
            await back.page.getByLabel('Código', { exact: true }).fill('000000');
            await back.page.getByRole('button', { name: 'Desativar MFA e sair', exact: true }).click();
            await back.page.locator('p[role="status"]').first().waitFor({ timeout: 30_000 });
            const disableState = await readState(back.page);
            await snap(back.page, 'id1c-desativar-senha-recusada', '390');
            entries.push({
              scenario: 'ID1c — desativação com senha recusada (403 invalid_credentials real)',
              route: '/cliente/app/seguranca', viewport: '390x844', theme: 'claro (único suportado)',
              screenshot: 'ux-pro-09c-id1c-desativar-senha-recusada-390.png', ...disableState,
            });
            await back.context.close();
          } finally { await browser2.close().catch(() => {}); }
        } else {
          entries.push({ scenario: 'ID1g — ativação real', error: 'ativação de MFA não concluiu em duas tentativas' });
          entries.push({ scenario: 'ID1c — desativação com senha recusada', error: 'pulado: a ativação não concluiu' });
        }
      } finally { await browser.close().catch(() => {}); }
    }
  } finally {
    // Evidência gravada ANTES das asserções: a execução RED preserva o "antes".
    if (evidenceDir) {
      await mkdir(evidenceDir, { recursive: true });
      await writeFile(path.join(evidenceDir, 'resumo.json'), `${JSON.stringify({
        schemaVersion: 1, stage: 'UX-PRO-09C', date: '2026-10-16', gap: 'ID1',
        route: '/cliente/app/seguranca', entries,
        apiMeStatusAfterActivation: observations.apiMeStatusAfterActivation ?? null,
        serverBlocksSessionOnMfaActivation: observations.apiMeStatusAfterActivation === 401,
        mfaActivated: observations.mfaActivated,
        windowFetchInjection,
        realHttpRefusals: [
          '403 invalid_credentials (preparo/desativação do MFA)',
          '403 mfa_code_invalid (código TOTP errado)',
          '400 invalid_or_expired_token (token de troca inválido)',
          'recusa real do segundo pedido de troca (HTTP medido; o 409 email_change_pending colapsa em 503 — resíduo ID6)',
        ],
        serverIntegrity: 'nenhum endpoint, contrato, sessão ou banco alterado; servidor real em toda a jornada',
        limitations: [
          'Capturas no Chromium empacotado em Linux, tema claro (único suportado na área do cliente)',
          'Identidades, sessões e códigos sintéticos em PostgreSQL descartável; nada é versionado com senha ou token',
          'Sem leitores de tela, zoom 200%, Windows ou outros navegadores',
          'Sem aceite humano, UAT, certificação WCAG ou produção; NO-GO',
        ],
      }, null, 2)}\n`, 'utf8');
    }
    // Limpeza real das identidades sintéticas desta fatia.
    for (const identityId of identities) {
      await pool.query('DELETE FROM auth_mfa WHERE identity_id=$1', [identityId]).catch(() => {});
      await pool.query('DELETE FROM auth_access_audit WHERE actor_id=$1', [identityId]).catch(() => {});
      await pool.query('DELETE FROM auth_sessions WHERE identity_id=$1', [identityId]).catch(() => {});
      await pool.query('DELETE FROM auth_email_change WHERE identity_id=$1', [identityId]).catch(() => {});
      await pool.query('DELETE FROM auth_credentials WHERE identity_id=$1', [identityId]).catch(() => {});
      await pool.query('DELETE FROM auth_identities WHERE id=$1', [identityId]).catch(() => {});
    }
    await pool.query(`DELETE FROM local_outbox_messages WHERE recipient_address LIKE '09c-%'`).catch(() => {});
  }

  // ---- Asserções de correção (a execução RED falha AQUI, depois de gravar) ----
  const pick = scenarioId => {
    const entry = entries.find(item => item.scenario.startsWith(scenarioId));
    assert.ok(entry, `o cenário ${scenarioId} precisa ter rodado`);
    assert.ok(!entry.error, `${scenarioId}: ${entry.error || 'sem erro de execução'}`);
    return entry;
  };

  const a = pick('ID1a');
  assert.ok(a.notices.join(' '), 'ID1a: a senha recusada precisa produzir um aviso visível');
  assert.doesNotMatch(a.notices.join(' '), /conex/i,
    `ID1a: senha recusada não pode aparecer como erro de conexão; veio "${a.notices.join(' | ')}"`);
  assert.match(a.notices.join(' '), /senha/i,
    `ID1a: o aviso precisa falar da senha; veio "${a.notices.join(' | ')}"`);

  const b = pick('ID1b');
  assert.ok(b.notices.join(' '), 'ID1b: o código recusado precisa produzir um aviso visível');
  assert.match(b.notices.join(' '), /Código incorreto/i,
    `ID1b: o aviso precisa dizer que o código não confere; veio "${b.notices.join(' | ')}"`);

  const d = pick('ID1d');
  assert.ok([409, 503].includes(d.httpStatus),
    `ID1d: o servidor recusa o segundo pedido com 409 ou 503; veio ${d.httpStatus}`);
  assert.ok(d.notices.join(' '), 'ID1d: a recusa real do servidor precisa produzir um aviso visível');
  assert.doesNotMatch(d.notices.join(' '), /conex/i,
    `ID1d: recusa real do servidor não pode aparecer como erro de conexão; veio "${d.notices.join(' | ')}"`);
  if (d.httpStatus === 409) {
    assert.match(d.notices.join(' '), /andamento|em uso|diferente/i,
      `ID1d: com 409 o aviso precisa nomear o motivo; veio "${d.notices.join(' | ')}"`);
  } else {
    assert.match(d.notices.join(' '), /indisponível|HTTP 503/i,
      `ID1d: com 503 o aviso precisa dizer indisponibilidade real (sem "conexão"); veio "${d.notices.join(' | ')}"`);
  }

  const tokenEntries = entries.filter(item => item.scenario.startsWith('ID1e'));
  assert.equal(tokenEntries.length, 4, 'ID1e precisa cobrir as quatro larguras');
  for (const entry of tokenEntries) {
    assert.equal(entry.httpStatus, 400, `ID1e: o servidor precisa recusar o token com 400 em ${entry.viewport}`);
    assert.ok(entry.notices.join(' '), `ID1e: o token recusado precisa produzir aviso em ${entry.viewport}; veio silêncio`);
    assert.match(entry.notices.join(' '), /token/i,
      `ID1e: o aviso precisa nomear o token; veio "${entry.notices.join(' | ')}" em ${entry.viewport}`);
    assert.deepEqual(entry.unhandled, [],
      `ID1e: nenhuma rejeição não tratada é aceita em ${entry.viewport}; veio ${JSON.stringify(entry.unhandled)}`);
    assert.ok(entry.overflow <= 1, `ID1e: overflow ${entry.overflow} em ${entry.viewport}`);
  }

  const f = pick('ID1f');
  assert.ok(f.notices.join(' '), 'ID1f: a revogação recusada precisa produzir um aviso visível');
  assert.match(f.notices.join(' '), /revog/i,
    `ID1f: o aviso precisa falar em revogar; veio "${f.notices.join(' | ')}"`);
  assert.deepEqual(f.unhandled, [],
    `ID1f: nenhuma rejeição não tratada é aceita; veio ${JSON.stringify(f.unhandled)}`);

  assert.equal(observations.mfaActivated, true, 'a jornada de ativação real precisa concluir');
  const g = pick('ID1g');
  assert.ok(g.notices.join(' '), 'ID1g: a ativação precisa produzir aviso');
  assert.match(g.notices.join(' '), /MFA ativado/i,
    `ID1g: o aviso de sucesso precisa continuar dizendo que o MFA foi ativado; veio "${g.notices.join(' | ')}"`);
  assert.equal(observations.apiMeStatusAfterActivation, 401,
    `ID1g: o servidor precisa manter o bloqueio da sessão antiga na ativação (readClientSession → 401); veio ${observations.apiMeStatusAfterActivation}`);

  const c = pick('ID1c');
  assert.ok(c.notices.join(' '), 'ID1c: a senha recusada na desativação precisa produzir aviso');
  assert.match(c.notices.join(' '), /Confira sua senha/i,
    `ID1c: o aviso precisa apontar a senha/código; veio "${c.notices.join(' | ')}"`);
  assert.deepEqual(c.unhandled, [],
    `ID1c: nenhuma rejeição não tratada é aceita; veio ${JSON.stringify(c.unhandled)}`);
});

// ============================================================================
// UX-PRO-09D (ID6) — contrato de erro do POST /api/client/security/email-change.
//
// Registrado como resíduo ID6 na UX-PRO-09C: as recusas de regra de negócio
// lançadas com status explícito DENTRO da transação (email_change_pending e
// email_already_in_use, {status: 409}) colapsavam em 503 security_unavailable,
// porque o catch de handleEmailChangeRequest não tinha o ramo `if(e?.status)`
// que os handlers irmãos (setup/activate/disable/confirm) têm. Medido no
// cenário ID1d da 09C (HTTP real): segundo pedido → 503.
//
// O proprietário AUTORIZOU explicitamente a mudança de contrato nesta sessão
// (16/10/2026): o endpoint passa a honrar o 409 pretendido. Este gate mede e
// asseriona o novo contrato EXATAMENTE — sem afrouxar nenhuma asserção:
//   ID6a — segundo pedido com pendente real → 409 email_change_pending (servidor
//          real, sem injeção); a UI nomeia o motivo e o banco comprova a
//          rejeição transacional (exatamente 1 linha pendente, sem duplicata);
//   ID6b — pedido para e-mail de outra conta → 409 email_already_in_use
//          (servidor real, sem injeção); o e-mail do dono permanece intacto;
//   ID6c — indisponibilidade real continua descrita com honestidade:
//          503 security_unavailable injetado APENAS em window.fetch (mesmo
//          padrão declarado dos ID1a/ID1f da 09C) — a UI não pode voltar a
//          mentir "erro de conexão".
//
// A evidência é gravada ANTES das asserções: a execução RED, com o servidor
// ainda não corrigido, preserva o "antes" (503 medido) na pasta indicada por
// UX_PORTAL_09D_EVIDENCE_DIR; a execução GREEN, com o reparo, grava o "depois".
// Nenhum servidor é enfraquecido; nenhuma senha, token ou cookie entra em
// PNG ou JSON.
test('browser: email-change honra os 409 do contrato e descreve o 503 sem mentir (ID6 — UX-PRO-09D)', { skip: !RUN }, async () => {
  const evidenceDir = process.env.UX_PORTAL_09D_EVIDENCE_DIR || '';
  const suffix = randomUUID().slice(0, 8);
  const entries = [];
  const identities = [];
  const windowFetchInjection = [];

  async function makeClient(label) {
    const email = `09d-${label}-${suffix}@exemplo.invalid`;
    const password = `Cliente-${randomUUID()}!`;
    const identityId = randomUUID();
    await pool.query(
      `INSERT INTO auth_identities (id, kind, email, display_name, status, verification_method, verified_at)
       VALUES ($1,'client',$2,$3,'active','email_link',NOW())`,
      [identityId, email, `Cliente Sintetico 09D ${label} ${suffix}`],
    );
    await pool.query('INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)',
      [identityId, await hashPassword(password)]);
    const login = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    assert.equal(login.status, 200, `login 09D/${label} deveria ser 200, veio ${login.status} ${JSON.stringify(login.body)}`);
    const cookie = login.setCookie.map(item => item.split(';')[0]).join('; ');
    assert.ok(cookie, `o login 09D/${label} precisa emitir cookie de sessão`);
    identities.push(identityId);
    return { identityId, email, password, cookie };
  }

  /**
   * Sonda de rejeições não tratadas, com opcional injeção de falha APENAS no
   * método POST de email-change (para medir o caminho de indisponibilidade sem
   * enfraquecer o servidor — resposta sintética em window.fetch, declarada no
   * resumo). Nada de outro endpoint é tocado.
   */
  async function installProbe(page, { failEmailChangePost = false } = {}) {
    await page.addInitScript(inject => {
      window.__ux09d = { unhandled: [], injections: [] };
      window.addEventListener('unhandledrejection', event => {
        window.__ux09d.unhandled.push(String(event.reason?.message || event.reason));
      });
      if (inject.failEmailChangePost) {
        const original = window.fetch.bind(window);
        window.fetch = (input, init) => {
          const url = typeof input === 'string' ? input : (input?.url || '');
          const method = ((init && init.method) || 'GET').toUpperCase();
          if (method === 'POST' && url.includes('/api/client/security/email-change')) {
            window.__ux09d.injections.push('POST /api/client/security/email-change → 503 security_unavailable');
            return Promise.resolve(new Response(JSON.stringify({ error: 'security_unavailable' }),
              { status: 503, headers: { 'content-type': 'application/json' } }));
          }
          return original(input, init);
        };
      }
    }, { failEmailChangePost });
  }

  async function readState(page) {
    return page.evaluate(() => ({
      notices: [...document.querySelectorAll('p[role="status"], p[role="alert"]')]
        .map(node => node.textContent.trim()).filter(Boolean),
      unhandled: (window.__ux09d && window.__ux09d.unhandled) || [],
      injections: (window.__ux09d && window.__ux09d.injections) || [],
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
  }

  async function snap(page, scenarioId, viewport) {
    if (!evidenceDir) return;
    await mkdir(evidenceDir, { recursive: true });
    await page.screenshot({ path: path.join(evidenceDir, `ux-pro-09d-${scenarioId}-${viewport}.png`), fullPage: true });
  }

  try {
    // --- ID6a: segundo pedido com pendente real → 409 email_change_pending ---
    {
      const client = await makeClient('a');
      const pendingEmail = `09d-pendente-${suffix}@exemplo.invalid`;
      const first = await api('/api/client/security/email-change', {
        method: 'POST', cookie: client.cookie, body: { newEmail: pendingEmail } });
      assert.equal(first.status, 202, `o pedido inicial de troca deveria ser 202, veio ${first.status}`);
      const browser = await launchBrowser();
      try {
        const { context, page, navigationResponse } = await openPage(browser, '/cliente/app/seguranca', client.cookie,
          { width: 390, height: 844, onPage: installProbe });
        assert.equal(navigationResponse.status(), 200, 'a área protegida deveria responder 200');
        await page.getByRole('heading', { name: 'Trocar e-mail' }).waitFor();
        await page.getByLabel('Novo e-mail', { exact: true }).fill(`09d-outro-${randomUUID().slice(0, 8)}@exemplo.invalid`);
        const postPending = page.waitForResponse(response =>
          response.url().includes('/api/client/security/email-change') && response.request().method() === 'POST');
        await page.getByRole('button', { name: 'Solicitar troca', exact: true }).click();
        const refused = await postPending;
        const refusedBody = await refused.json().catch(() => null);
        await page.locator('p[role="status"]').first().waitFor({ timeout: 30_000 });
        const state = await readState(page);
        const pendingRows = await pool.query(
          'SELECT count(*) AS n FROM auth_email_change WHERE identity_id=$1 AND used_at IS NULL AND cancelled_at IS NULL AND expires_at>NOW()',
          [client.identityId]);
        state.pendingRows = Number(pendingRows.rows[0].n);
        await snap(page, 'id6a-segundo-pedido-409', '390');
        entries.push({
          scenario: `ID6a — segundo pedido com pendente real (HTTP ${refused.status()} real, code ${refusedBody?.error ?? 'sem corpo'})`,
          route: '/cliente/app/seguranca', viewport: '390x844', theme: 'claro (único suportado)',
          screenshot: 'ux-pro-09d-id6a-segundo-pedido-409-390.png',
          httpStatus: refused.status(), serverCode: refusedBody?.error ?? null, ...state,
        });
        await context.close();
      } finally { await browser.close().catch(() => {}); }
    }

    // --- ID6b: pedido para e-mail de outra conta → 409 email_already_in_use --
    {
      const owner = await makeClient('b-owner');
      const requester = await makeClient('b-req');
      const browser = await launchBrowser();
      try {
        const { context, page, navigationResponse } = await openPage(browser, '/cliente/app/seguranca', requester.cookie,
          { width: 390, height: 844, onPage: installProbe });
        assert.equal(navigationResponse.status(), 200, 'a área protegida deveria responder 200');
        await page.getByRole('heading', { name: 'Trocar e-mail' }).waitFor();
        await page.getByLabel('Novo e-mail', { exact: true }).fill(owner.email);
        const postBusy = page.waitForResponse(response =>
          response.url().includes('/api/client/security/email-change') && response.request().method() === 'POST');
        await page.getByRole('button', { name: 'Solicitar troca', exact: true }).click();
        const refused = await postBusy;
        const refusedBody = await refused.json().catch(() => null);
        await page.locator('p[role="status"]').first().waitFor({ timeout: 30_000 });
        const state = await readState(page);
        const ownerRow = (await pool.query('SELECT email FROM auth_identities WHERE id=$1', [owner.identityId])).rows[0];
        const requesterRows = (await pool.query(
          'SELECT count(*) AS n FROM auth_email_change WHERE identity_id=$1', [requester.identityId])).rows[0];
        state.ownerEmailUntouched = ownerRow.email === owner.email;
        state.requesterPendingRows = Number(requesterRows.n);
        await snap(page, 'id6b-email-em-uso-409', '390');
        entries.push({
          scenario: `ID6b — pedido para e-mail de outra conta (HTTP ${refused.status()} real, code ${refusedBody?.error ?? 'sem corpo'})`,
          route: '/cliente/app/seguranca', viewport: '390x844', theme: 'claro (único suportado)',
          screenshot: 'ux-pro-09d-id6b-email-em-uso-409-390.png',
          httpStatus: refused.status(), serverCode: refusedBody?.error ?? null, ...state,
        });
        await context.close();
      } finally { await browser.close().catch(() => {}); }
    }

    // --- ID6c: indisponibilidade real (503) descrita com honestidade --------
    // A resposta 503 é SINTÉTICA e existe apenas em window.fetch (nenhum
    // pacote chega ao servidor): serve para garantir que o caminho de
    // indisponibilidade continua descrito sem voltar a "erro de conexão".
    {
      const client = await makeClient('c');
      windowFetchInjection.push('POST /api/client/security/email-change → 503 security_unavailable (somente window.fetch)');
      const browser = await launchBrowser();
      try {
        const { context, page, navigationResponse } = await openPage(browser, '/cliente/app/seguranca', client.cookie, {
          width: 390, height: 844,
          onPage: pageArg => installProbe(pageArg, { failEmailChangePost: true }),
        });
        assert.equal(navigationResponse.status(), 200, 'a área protegida deveria responder 200');
        await page.getByRole('heading', { name: 'Trocar e-mail' }).waitFor();
        await page.getByLabel('Novo e-mail', { exact: true }).fill(`09d-c-${suffix}@exemplo.invalid`);
        await page.getByRole('button', { name: 'Solicitar troca', exact: true }).click();
        await page.locator('p[role="status"]').first().waitFor({ timeout: 30_000 });
        await page.waitForTimeout(600);
        const state = await readState(page);
        assert.ok(state.injections.some(item => item.startsWith('POST /api/client/security/email-change')),
          `a injeção de falha no POST de email-change precisa ter disparado; veio ${JSON.stringify(state.injections)}`);
        await snap(page, 'id6c-indisponivel-503', '390');
        entries.push({
          scenario: 'ID6c — indisponibilidade do serviço (503 security_unavailable injetado em window.fetch)',
          route: '/cliente/app/seguranca', viewport: '390x844', theme: 'claro (único suportado)',
          screenshot: 'ux-pro-09d-id6c-indisponivel-503-390.png', httpStatus: 503, ...state,
        });
        await context.close();
      } finally { await browser.close().catch(() => {}); }
    }
  } finally {
    // Evidência gravada ANTES das asserções: a execução RED preserva o "antes".
    if (evidenceDir) {
      await mkdir(evidenceDir, { recursive: true });
      await writeFile(path.join(evidenceDir, 'resumo.json'), `${JSON.stringify({
        schemaVersion: 1, stage: 'UX-PRO-09D', date: '2026-10-16', gap: 'ID6',
        route: '/cliente/app/seguranca',
        authorization: 'mudança de contrato autorizada explicitamente pelo proprietário em 2026-10-16 (resíduo ID6 da UX-PRO-09C); antes do reparo o 409 pretendido colapsava em 503 security_unavailable, medido no ID1d da 09C',
        entries,
        windowFetchInjection,
        realHttpRefusals: [
          '202 (pedido inicial de troca — caminho feliz, real)',
          'recusa real do segundo pedido com pendente (HTTP medido: 409 email_change_pending após o reparo; 503 security_unavailable antes)',
          'recusa real de e-mail de outra conta (HTTP medido: 409 email_already_in_use após o reparo; 503 security_unavailable antes)',
        ],
        serverIntegrity: 'apenas o status/código de erro das recusas de regra de negócio do POST /api/client/security/email-change muda (503 → 409 com código canônico, mesmo formato de corpo); sessões, cookies, MFA, rate limit, auditoria, grants e isolamento intactos',
        limitations: [
          'Capturas no Chromium empacotado em Linux, tema claro (único suportado na área do cliente)',
          'Identidades, sessões e endereços sintéticos em PostgreSQL descartável; nada é versionado com senha ou token',
          'ID6c usa resposta sintética em window.fetch (sem tráfego real) para cobrir o caminho de indisponibilidade; ID6a/ID6b usam HTTP real do servidor',
          'Sem leitores de tela, zoom 200%, Windows ou outros navegadores',
          'Sem aceite humano, UAT, certificação WCAG ou produção; NO-GO',
        ],
      }, null, 2)}\n`, 'utf8');
    }
    // Limpeza real das identidades sintéticas desta fatia.
    for (const identityId of identities) {
      await pool.query('DELETE FROM auth_access_audit WHERE actor_id=$1', [identityId]).catch(() => {});
      await pool.query('DELETE FROM auth_sessions WHERE identity_id=$1', [identityId]).catch(() => {});
      await pool.query('DELETE FROM auth_email_change WHERE identity_id=$1', [identityId]).catch(() => {});
      await pool.query('DELETE FROM auth_credentials WHERE identity_id=$1', [identityId]).catch(() => {});
      await pool.query('DELETE FROM auth_identities WHERE id=$1', [identityId]).catch(() => {});
    }
    await pool.query(`DELETE FROM local_outbox_messages WHERE recipient_address LIKE '09d-%'`).catch(() => {});
  }

  // ---- Asserções de contrato (a execução RED falha AQUI, depois de gravar) ----
  const pick = scenarioId => {
    const entry = entries.find(item => item.scenario.startsWith(scenarioId));
    assert.ok(entry, `o cenário ${scenarioId} precisa ter rodado`);
    assert.ok(!entry.error, `${scenarioId}: ${entry.error || 'sem erro de execução'}`);
    return entry;
  };

  const a = pick('ID6a');
  assert.equal(a.httpStatus, 409,
    `ID6a: o contrato corrigido precisa recusar o segundo pedido com pendente real com 409; veio ${a.httpStatus}`);
  assert.equal(a.serverCode, 'email_change_pending',
    `ID6a: o corpo precisa trazer o código canônico email_change_pending; veio ${a.serverCode}`);
  assert.equal(a.pendingRows, 1,
    `ID6a: a recusa é transacional — exatamente 1 linha pendente no banco; veio ${a.pendingRows}`);
  assert.ok(a.notices.join(' '), 'ID6a: a recusa real do servidor precisa produzir um aviso visível');
  assert.match(a.notices.join(' '), /andamento|em uso|diferente/i,
    `ID6a: o aviso precisa nomear o motivo (troca em andamento); veio "${a.notices.join(' | ')}"`);
  assert.doesNotMatch(a.notices.join(' '), /conex/i,
    `ID6a: recusa real do servidor não pode aparecer como erro de conexão; veio "${a.notices.join(' | ')}"`);
  assert.deepEqual(a.unhandled, [],
    `ID6a: nenhuma rejeição não tratada é aceita; veio ${JSON.stringify(a.unhandled)}`);

  const b = pick('ID6b');
  assert.equal(b.httpStatus, 409,
    `ID6b: o contrato corrigido precisa recusar e-mail de outra conta com 409; veio ${b.httpStatus}`);
  assert.equal(b.serverCode, 'email_already_in_use',
    `ID6b: o corpo precisa trazer o código canônico email_already_in_use; veio ${b.serverCode}`);
  assert.ok(b.ownerEmailUntouched, 'ID6b: o e-mail da outra conta precisa permanecer intacto');
  assert.equal(b.requesterPendingRows, 0,
    `ID6b: a recusa é transacional — nenhum pedido novo gravado; veio ${b.requesterPendingRows}`);
  assert.ok(b.notices.join(' '), 'ID6b: a recusa real do servidor precisa produzir um aviso visível');
  assert.match(b.notices.join(' '), /já pertence a outra conta|em uso/i,
    `ID6b: o aviso precisa nomear o motivo (e-mail em uso); veio "${b.notices.join(' | ')}"`);
  assert.doesNotMatch(b.notices.join(' '), /conex/i,
    `ID6b: recusa real do servidor não pode aparecer como erro de conexão; veio "${b.notices.join(' | ')}"`);
  assert.deepEqual(b.unhandled, [],
    `ID6b: nenhuma rejeição não tratada é aceita; veio ${JSON.stringify(b.unhandled)}`);

  const c = pick('ID6c');
  assert.equal(c.httpStatus, 503, `ID6c: o cenário de indisponibilidade mede 503; veio ${c.httpStatus}`);
  assert.ok(c.notices.join(' '), 'ID6c: a indisponibilidade precisa produzir um aviso visível');
  assert.match(c.notices.join(' '), /indisponível|HTTP 503/i,
    `ID6c: o aviso precisa nomear a indisponibilidade real; veio "${c.notices.join(' | ')}"`);
  assert.doesNotMatch(c.notices.join(' '), /conex/i,
    `ID6c: indisponibilidade não pode aparecer como erro de conexão; veio "${c.notices.join(' | ')}"`);
  assert.deepEqual(c.unhandled, [],
    `ID6c: nenhuma rejeição não tratada é aceita; veio ${JSON.stringify(c.unhandled)}`);
});
