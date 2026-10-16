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
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { provisionStaff, STAFF_TEST_PASSWORD } from './helpers/staff-login.mjs';
import { hashToken, hashPassword } from '../src/lib/client-auth-core.mjs';

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
async function launchBrowser() {
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
      CLIENT_MFA_ENCRYPTION_KEY: Buffer.from(randomUUID()).toString('base64url').slice(0, 43),
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
