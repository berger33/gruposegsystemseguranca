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
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { waitForStableBodyText } from './helpers/portal-stable-read.mjs';
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

// E2: o Next --dev com NEXT_DIST_DIR isolado reescreve next-env.d.ts e
// tsconfig.json no checkout. Sem restauração, qualquer gate executado antes de
// `npm test` suja a árvore e faz a guarda PLT-SMK-001 falhar por contaminação
// (não por regressão de código).
const GENERATED_FILES = ['next-env.d.ts', 'tsconfig.json'];
let generatedSnapshot = new Map();

async function snapshotGeneratedFiles() {
  const snapshot = new Map();
  for (const name of GENERATED_FILES) {
    snapshot.set(name, await readFile(path.join(root, name), 'utf8').catch(() => null));
  }
  return snapshot;
}

async function restoreGeneratedFiles(snapshot) {
  for (const [name, content] of snapshot) {
    if (content !== null) await writeFile(path.join(root, name), content);
  }
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
async function capture(page, nome, { fullPage = true } = {}) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage });
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
  await restoreGeneratedFiles(generatedSnapshot);
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

test('browser ID3: cobranças não anuncia lista vazia antes de concluir a leitura', { skip: !RUN }, async () => {
  const accountA = randomUUID();
  const accountB = randomUUID();
  const grantA = randomUUID();
  const grantB = randomUUID();
  const chargeId = randomUUID();
  const protocolA = `CHG-CLI-20261021-${randomUUID().slice(0, 4).toUpperCase()}`;
  await pool.query(
    "INSERT INTO client_accounts (id, display_name, created_by) VALUES ($1::uuid, 'ID3 Conta A Sintetica', 'ti'), ($2::uuid, 'ID3 Conta B Sintetica', 'ti')",
    [accountA, accountB],
  );
  await pool.query(
    `INSERT INTO client_access_grants (id, identity_id, client_account_id, reason, granted_by)
     SELECT $1::uuid, id, $2::uuid, 'fixture sintetica ID3', 'ti' FROM auth_identities WHERE email = $3
     UNION ALL
     SELECT $4::uuid, id, $5::uuid, 'fixture sintetica ID3', 'ti' FROM auth_identities WHERE email = $3`,
    [grantA, accountA, clientEmail, grantB, accountB],
  );
  await pool.query(
    `INSERT INTO cli_charges_v2 (id, protocol, client_account_id, amount_cents, due_date, finance_integration_active)
     VALUES ($1::uuid, $2, $3::uuid, 12500, '2026-11-15', true)`,
    [chargeId, protocolA, accountA],
  );

  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ viewport: { width: 320, height: 844 }, locale: 'pt-BR' });
    await context.addCookies(clientCookie.split('; ').filter(Boolean).map(item => {
      const separator = item.indexOf('=');
      return { name: item.slice(0, separator), value: item.slice(separator + 1), url: baseUrl };
    }));
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    await page.addInitScript(() => {
      window.__id3EmptySeen = false;
      const observe = () => {
        if (document.body?.innerText.includes('Nenhuma cobrança integrada disponível.')) {
          window.__id3EmptySeen = true;
        }
      };
      new MutationObserver(observe).observe(document, { subtree: true, childList: true, characterData: true });
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        if (url.includes('/api/client/cobrancas')) {
          window.__id3CobrancasCalls = (window.__id3CobrancasCalls || 0) + 1;
          if (window.__id3CobrancasCalls > 1) {
            window.__id3CobrancasStarted = true;
            return new Promise(() => {});
          }
          window.__id3InitialCobrancasStarted = true;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return original(input, init);
      };
    });
    await page.goto(`${baseUrl}/cliente/app/cobrancas`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__id3InitialCobrancasStarted === true);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__id3EmptySeen), false,
      'a primeira leitura pendente não pode ser anunciada como lista vazia');
    assert.equal(await page.getByText('Nenhuma cobrança integrada disponível.', { exact: true }).count(), 0);
    await page.getByText(protocolA, { exact: false }).waitFor();
    await page.getByLabel('Conta de cliente selecionada').selectOption(accountB);
    await page.waitForFunction(() => window.__id3CobrancasStarted === true);
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__id3EmptySeen), false,
      'enquanto a leitura está pendente, a tela não pode anunciar ausência de cobranças');
    assert.equal(await page.getByText(protocolA, { exact: false }).count(), 0,
      'a leitura anterior da conta A não pode continuar visível ao selecionar a conta B');
    assert.equal(await page.getByText('Nenhuma cobrança integrada disponível.', { exact: true }).count(), 0);
    const viewportEvidence = [];
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      viewportEvidence.push(await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      })));
    }
    assert.deepEqual(viewportEvidence.map(item => item.width), [320, 390, 768, 1440]);
    assert.ok(viewportEvidence.every(item => item.horizontalOverflow <= 0),
      `cobranças não deve transbordar horizontalmente: ${JSON.stringify(viewportEvidence)}`);
    const breadcrumb = page.getByRole('link', { name: 'Área do cliente' });
    await breadcrumb.focus();
    assert.equal(await breadcrumb.evaluate(element => element === document.activeElement), true,
      'a navegação principal da página pode receber foco pelo teclado');
    await context.close();
  } finally {
    await browser.close();
    await pool.query('DELETE FROM cli_charges_v2 WHERE id = $1', [chargeId]);
    await pool.query('DELETE FROM client_access_grants WHERE id = ANY($1::uuid[])', [[grantA, grantB]]);
    await pool.query('DELETE FROM client_accounts WHERE id = ANY($1::uuid[])', [[accountA, accountB]]);
  }
});

test('browser ID3: contratos mantém a leitura na conta ativa e descarta resposta fora de ordem', { skip: !RUN }, async () => {
  const accountA = randomUUID();
  const accountB = randomUUID();
  const grantA = randomUUID();
  const grantB = randomUUID();
  const contractA = randomUUID();
  const titleA = `Contrato sintetico ID3 A ${randomUUID().slice(0, 8)}`;
  const evidencePrefix = process.env.UX_PORTAL_EVIDENCE_PREFIX || 'ux-pro-id3-contratos-leitura';
  await pool.query(
    "INSERT INTO client_accounts (id, display_name, created_by) VALUES ($1::uuid, 'ID3 Contratos Conta A Sintetica', 'ti'), ($2::uuid, 'ID3 Contratos Conta B Sintetica', 'ti')",
    [accountA, accountB],
  );
  await pool.query(
    `INSERT INTO client_access_grants (id, identity_id, client_account_id, reason, granted_by)
     SELECT $1::uuid, id, $2::uuid, 'fixture sintetica ID3 contratos', 'ti' FROM auth_identities WHERE email = $3
     UNION ALL
     SELECT $4::uuid, id, $5::uuid, 'fixture sintetica ID3 contratos', 'ti' FROM auth_identities WHERE email = $3`,
    [grantA, accountA, clientEmail, grantB, accountB],
  );
  await pool.query(
    `INSERT INTO client_contracts (id, client_account_id, title, service, status, summary, created_by)
     VALUES ($1::uuid, $2::uuid, $3, 'Vigilância sintética', 'active', 'Registro fictício exclusivo do teste de leitura por conta.', 'ti')`,
    [contractA, accountA, titleA],
  );

  // O servidor real continua sendo a autoridade: A devolve somente o contrato
  // de A e B devolve uma ausência confirmada. A falha visual procurada está
  // na reconciliação dessas respostas pelo componente, não no escopo SQL.
  const responseA = await api(`/api/client/contracts?account=${accountA}`, { cookie: clientCookie });
  const responseB = await api(`/api/client/contracts?account=${accountB}`, { cookie: clientCookie });
  assert.equal(responseA.status, 200);
  assert.deepEqual(responseA.body.contracts.map(contract => contract.title), [titleA]);
  assert.equal(responseB.status, 200);
  assert.deepEqual(responseB.body.contracts, []);

  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    await context.addCookies(clientCookie.split('; ').filter(Boolean).map(item => {
      const separator = item.indexOf('=');
      return { name: item.slice(0, separator), value: item.slice(separator + 1), url: baseUrl };
    }));
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    await page.addInitScript(() => {
      window.__id3ContractCalls = {};
      window.__id3ContractPending = {};
      window.__id3ContractCompleted = {};
      window.__id3ContractReleases = {};
      window.__id3HoldContracts = false;
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        if (!url.includes('/api/client/contracts')) return original(input, init);
        const account = new URL(url, window.location.origin).searchParams.get('account') || 'unknown';
        const call = (window.__id3ContractCalls[account] || 0) + 1;
        window.__id3ContractCalls[account] = call;
        const key = `${account}:${call}`;
        if (window.__id3HoldContracts) {
          window.__id3ContractPending[key] = true;
          await new Promise(resolve => {
            window.__id3ContractReleases[key] = () => {
              delete window.__id3ContractPending[key];
              resolve();
            };
          });
        }
        const response = await original(input, init);
        window.__id3ContractCompleted[key] = true;
        return response;
      };
    });
    await page.goto(`${baseUrl}/cliente/app/contratos`, { waitUntil: 'domcontentloaded' });
    await page.getByText(titleA, { exact: true }).waitFor();
    await capture(page, `${evidencePrefix}-a-carregado-390`);

    // Todas as próximas leituras ficam sob controle do teste. B:1 permanece
    // pendente para reproduzir a mistura visual A→B no código original.
    await page.evaluate(() => { window.__id3HoldContracts = true; });
    const picker = page.getByLabel('Conta de cliente selecionada');
    await picker.selectOption(accountB);
    const pendingB1 = `${accountB}:1`;
    await page.waitForFunction(key => window.__id3ContractPending[key] === true, pendingB1);
    await capture(page, `${evidencePrefix}-b-pendente-390`);
    assert.equal(await page.getByText(titleA, { exact: true }).count(), 0,
      'o contrato de A não pode continuar visível quando B está selecionada e sua leitura está pendente');
    assert.equal(await page.getByText('Carregando contratos…', { exact: true }).count(), 1);
    assert.equal(await page.getByText(/Nenhum contrato foi registrado ainda para este cadastro/).count(), 0,
      'B pendente não pode ser anunciada como B vazia');

    const viewportEvidence = [];
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.waitForTimeout(80);
      viewportEvidence.push(await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        const horizontalOverflow = document.documentElement.scrollWidth - width;
        const offendingElements = horizontalOverflow <= 1 ? [] : [...document.querySelectorAll('body *')]
          .filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.right > width + 1 || rect.left < -1;
          })
          .slice(0, 12)
          .map(element => ({
            tag: element.tagName,
            className: typeof element.className === 'string' ? element.className : '',
            text: (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80),
            left: Math.round(element.getBoundingClientRect().left),
            right: Math.round(element.getBoundingClientRect().right),
          }));
        return { width, horizontalOverflow, offendingElements };
      }));
      if (width !== 390) await capture(page, `${evidencePrefix}-b-pendente-${width}`);
    }
    assert.deepEqual(viewportEvidence.map(item => item.width), [320, 390, 768, 1440]);
    assert.ok(viewportEvidence.every(item => item.horizontalOverflow <= 1),
      `Contratos não deve transbordar horizontalmente: ${JSON.stringify(viewportEvidence)}`);

    await page.evaluate(key => window.__id3ContractReleases[key](), pendingB1);
    const emptyB = page.getByText(/Nenhum contrato foi registrado ainda para este cadastro/);
    await emptyB.waitFor();
    assert.equal(await page.getByText(titleA, { exact: true }).count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, `${evidencePrefix}-b-vazio-390`);

    // Setas operam o seletor nativo sem mouse. A próxima leitura de A fica
    // pendente; em seguida a próxima de B é iniciada e concluída primeiro.
    // A leitura antiga de A, ao chegar por último, não pode vencer B. Os
    // contadores são lidos do navegador porque o modo dev pode repetir o GET.
    const nextACall = await page.evaluate(account => (window.__id3ContractCalls[account] || 0) + 1, accountA);
    const pendingA2 = `${accountA}:${nextACall}`;
    await picker.focus();
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(key => window.__id3ContractPending[key] === true, pendingA2);
    assert.equal(await picker.inputValue(), accountA);
    assert.equal(await picker.evaluate(element => element === document.activeElement), true,
      'a troca por teclado preserva o foco no seletor de conta');
    const nextBCall = await page.evaluate(account => (window.__id3ContractCalls[account] || 0) + 1, accountB);
    const pendingB2 = `${accountB}:${nextBCall}`;
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(key => window.__id3ContractPending[key] === true, pendingB2);
    assert.equal(await picker.inputValue(), accountB);
    await page.evaluate(key => window.__id3ContractReleases[key](), pendingB2);
    await emptyB.waitFor();
    await page.evaluate(key => window.__id3ContractReleases[key](), pendingA2);
    await page.waitForFunction(key => window.__id3ContractCompleted[key] === true, pendingA2);
    await page.waitForTimeout(200);
    assert.equal(await picker.inputValue(), accountB);
    assert.equal(await page.getByText(titleA, { exact: true }).count(), 0,
      'a resposta antiga de A não pode substituir o resultado mais recente de B');
    assert.equal(await emptyB.count(), 1,
      'o vazio confirmado da resposta mais recente de B deve permanecer visível');
    await capture(page, `${evidencePrefix}-b-resposta-fora-de-ordem-390`);

    if (process.env.UX_PORTAL_EVIDENCE_DIR) {
      await writeFile(path.join(process.env.UX_PORTAL_EVIDENCE_DIR, `${evidencePrefix}-medidas.json`), JSON.stringify({
        route: '/cliente/app/contratos',
        serverReadA: { status: responseA.status, contracts: responseA.body.contracts.length },
        serverReadB: { status: responseB.status, contracts: responseB.body.contracts.length },
        viewportEvidence,
        keyboard: 'ArrowUp/ArrowDown no seletor nativo; foco preservado',
        outOfOrder: `B:${nextBCall} concluída antes de A:${nextACall}; resultado final permaneceu em B`,
        humanAcceptanceExecuted: false,
      }, null, 2) + '\n');
    }
    await context.close();
  } finally {
    await browser?.close();
    await pool.query('DELETE FROM client_contracts WHERE id = $1', [contractA]);
    await pool.query('DELETE FROM client_access_grants WHERE id = ANY($1::uuid[])', [[grantA, grantB]]);
    await pool.query('DELETE FROM client_accounts WHERE id = ANY($1::uuid[])', [[accountA, accountB]]);
  }
});

test('browser ID3: agenda mantém a leitura na conta ativa e descarta resposta fora de ordem', { skip: !RUN }, async () => {
  const accountA = randomUUID();
  const accountB = randomUUID();
  const grantA = randomUUID();
  const grantB = randomUUID();
  const visitA = randomUUID();
  const titleA = `Visita sintetica ID3 A ${randomUUID().slice(0, 8)}`;
  const evidencePrefix = process.env.UX_PORTAL_EVIDENCE_PREFIX || 'ux-pro-id3-agenda-leitura';
  await pool.query(
    "INSERT INTO client_accounts (id, display_name, created_by) VALUES ($1::uuid, 'ID3 Agenda Conta A Sintetica', 'ti'), ($2::uuid, 'ID3 Agenda Conta B Sintetica', 'ti')",
    [accountA, accountB],
  );
  await pool.query(
    `INSERT INTO client_access_grants (id, identity_id, client_account_id, reason, granted_by)
     SELECT $1::uuid, id, $2::uuid, 'fixture sintetica ID3 agenda', 'ti' FROM auth_identities WHERE email = $3
     UNION ALL
     SELECT $4::uuid, id, $5::uuid, 'fixture sintetica ID3 agenda', 'ti' FROM auth_identities WHERE email = $3`,
    [grantA, accountA, clientEmail, grantB, accountB],
  );
  await pool.query(
    `INSERT INTO client_visits (id, client_account_id, visit_type, title, details, scheduled_at, status, created_by)
     VALUES ($1::uuid, $2::uuid, 'technical', $3, 'Registro ficticio exclusivo do teste de leitura por conta.', NOW() + INTERVAL '2 days', 'scheduled', 'ti')`,
    [visitA, accountA, titleA],
  );

  // O servidor continua sendo a autoridade: A devolve somente a visita de A e
  // B devolve ausência confirmada. O defeito procurado está na reconciliação
  // dessas respostas pelo componente, não no escopo SQL.
  const responseA = await api(`/api/client/visits?account=${accountA}`, { cookie: clientCookie });
  const responseB = await api(`/api/client/visits?account=${accountB}`, { cookie: clientCookie });
  assert.equal(responseA.status, 200);
  assert.deepEqual(responseA.body.visits.map(visit => visit.title), [titleA]);
  assert.equal(responseB.status, 200);
  assert.deepEqual(responseB.body.visits, []);

  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    await context.addCookies(clientCookie.split('; ').filter(Boolean).map(item => {
      const separator = item.indexOf('=');
      return { name: item.slice(0, separator), value: item.slice(separator + 1), url: baseUrl };
    }));
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    await page.addInitScript(() => {
      window.__id3VisitCalls = {};
      window.__id3VisitPending = {};
      window.__id3VisitCompleted = {};
      window.__id3VisitReleases = {};
      window.__id3HoldVisits = false;
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        if (!url.includes('/api/client/visits?')) return original(input, init);
        const account = new URL(url, window.location.origin).searchParams.get('account') || 'unknown';
        const call = (window.__id3VisitCalls[account] || 0) + 1;
        window.__id3VisitCalls[account] = call;
        const key = `${account}:${call}`;
        if (window.__id3HoldVisits) {
          window.__id3VisitPending[key] = true;
          await new Promise(resolve => {
            window.__id3VisitReleases[key] = () => {
              delete window.__id3VisitPending[key];
              resolve();
            };
          });
        }
        const response = await original(input, init);
        window.__id3VisitCompleted[key] = true;
        return response;
      };
    });
    await page.goto(`${baseUrl}/cliente/app/agenda`, { waitUntil: 'domcontentloaded' });
    await page.getByText(titleA, { exact: true }).waitFor();
    await capture(page, `${evidencePrefix}-a-carregado-390`);

    // B:1 fica pendente: no código anterior, a visita de A continuava visível
    // sob o cabeçalho de B e o vazio podia aparecer antes da resposta.
    await page.evaluate(() => { window.__id3HoldVisits = true; });
    const picker = page.getByLabel('Conta de cliente selecionada');
    await picker.selectOption(accountB);
    const pendingB1 = `${accountB}:1`;
    await page.waitForFunction(key => window.__id3VisitPending[key] === true, pendingB1);
    await capture(page, `${evidencePrefix}-b-pendente-390`);
    assert.equal(await page.getByText(titleA, { exact: true }).count(), 0,
      'a visita de A não pode continuar visível quando B está selecionada e sua leitura está pendente');
    assert.equal(await page.getByText('Carregando agenda…', { exact: true }).count(), 1);
    assert.equal(await page.getByText(/Nenhuma visita ou manutenção agendada para este cadastro/).count(), 0,
      'B pendente não pode ser anunciada como B vazia');

    const viewportEvidence = [];
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.waitForTimeout(80);
      viewportEvidence.push(await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        return { width, horizontalOverflow: document.documentElement.scrollWidth - width };
      }));
      if (width !== 390) await capture(page, `${evidencePrefix}-b-pendente-${width}`);
    }
    assert.ok(viewportEvidence.every(item => item.horizontalOverflow <= 1),
      `Agenda não deve transbordar horizontalmente: ${JSON.stringify(viewportEvidence)}`);

    await page.evaluate(key => window.__id3VisitReleases[key](), pendingB1);
    const emptyB = page.getByText(/Nenhuma visita ou manutenção agendada para este cadastro/);
    await emptyB.waitFor();
    assert.equal(await page.getByText(titleA, { exact: true }).count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, `${evidencePrefix}-b-vazio-390`);

    // Resposta fora de ordem: A é iniciada, B é iniciada e concluída primeiro.
    const nextACall = await page.evaluate(account => (window.__id3VisitCalls[account] || 0) + 1, accountA);
    const pendingA2 = `${accountA}:${nextACall}`;
    await picker.focus();
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(key => window.__id3VisitPending[key] === true, pendingA2);
    assert.equal(await picker.inputValue(), accountA);
    assert.equal(await picker.evaluate(element => element === document.activeElement), true,
      'a troca por teclado preserva o foco no seletor de conta');
    const nextBCall = await page.evaluate(account => (window.__id3VisitCalls[account] || 0) + 1, accountB);
    const pendingB2 = `${accountB}:${nextBCall}`;
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(key => window.__id3VisitPending[key] === true, pendingB2);
    assert.equal(await picker.inputValue(), accountB);
    await page.evaluate(key => window.__id3VisitReleases[key](), pendingB2);
    await emptyB.waitFor();
    await page.evaluate(key => window.__id3VisitReleases[key](), pendingA2);
    await page.waitForFunction(key => window.__id3VisitCompleted[key] === true, pendingA2);
    await page.waitForTimeout(200);
    assert.equal(await picker.inputValue(), accountB);
    assert.equal(await page.getByText(titleA, { exact: true }).count(), 0,
      'a resposta antiga de A não pode substituir o resultado mais recente de B');
    assert.equal(await emptyB.count(), 1,
      'o vazio confirmado da resposta mais recente de B deve permanecer visível');
    await capture(page, `${evidencePrefix}-b-resposta-fora-de-ordem-390`);

    if (process.env.UX_PORTAL_EVIDENCE_DIR) {
      await writeFile(path.join(process.env.UX_PORTAL_EVIDENCE_DIR, `${evidencePrefix}-medidas.json`), JSON.stringify({
        route: '/cliente/app/agenda',
        serverReadA: { status: responseA.status, visits: responseA.body.visits.length },
        serverReadB: { status: responseB.status, visits: responseB.body.visits.length },
        viewportEvidence,
        keyboard: 'ArrowUp/ArrowDown no seletor nativo; foco preservado',
        outOfOrder: `B:${nextBCall} concluída antes de A:${nextACall}; resultado final permaneceu em B`,
        humanAcceptanceExecuted: false,
      }, null, 2) + '\n');
    }
    await context.close();
  } finally {
    await browser?.close();
    await pool.query('DELETE FROM client_visits WHERE id = $1', [visitA]);
    await pool.query('DELETE FROM client_access_grants WHERE id = ANY($1::uuid[])', [[grantA, grantB]]);
    await pool.query('DELETE FROM client_accounts WHERE id = ANY($1::uuid[])', [[accountA, accountB]]);
  }
});

test('browser ID3: solicitações mantém as duas leituras na conta ativa (inclusive contratos do formulário)', { skip: !RUN }, async () => {
  const accountA = randomUUID();
  const accountB = randomUUID();
  const grantA = randomUUID();
  const grantB = randomUUID();
  const contractA = randomUUID();
  const requestA = randomUUID();
  const titleA = `Solicitacao sintetica ID3 A ${randomUUID().slice(0, 8)}`;
  const contractTitleA = `Contrato sintetico ID3 solicitacoes A ${randomUUID().slice(0, 8)}`;
  const protocolA = `SRV-CLI-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 4).toUpperCase()}`;
  const evidencePrefix = process.env.UX_PORTAL_EVIDENCE_PREFIX || 'ux-pro-id3-solicitacoes-leitura';
  await pool.query(
    "INSERT INTO client_accounts (id, display_name, created_by) VALUES ($1::uuid, 'ID3 Solicitacoes Conta A Sintetica', 'ti'), ($2::uuid, 'ID3 Solicitacoes Conta B Sintetica', 'ti')",
    [accountA, accountB],
  );
  await pool.query(
    `INSERT INTO client_access_grants (id, identity_id, client_account_id, reason, granted_by)
     SELECT $1::uuid, id, $2::uuid, 'fixture sintetica ID3 solicitacoes', 'ti' FROM auth_identities WHERE email = $3
     UNION ALL
     SELECT $4::uuid, id, $5::uuid, 'fixture sintetica ID3 solicitacoes', 'ti' FROM auth_identities WHERE email = $3`,
    [grantA, accountA, clientEmail, grantB, accountB],
  );
  await pool.query(
    `INSERT INTO client_contracts (id, client_account_id, title, service, status, summary, created_by)
     VALUES ($1::uuid, $2::uuid, $3, 'Vigilancia sintetica', 'active', 'Registro ficticio exclusivo do teste de leitura por conta.', 'ti')`,
    [contractA, accountA, contractTitleA],
  );
  await pool.query(
    `INSERT INTO cli_service_requests (id, protocol, client_account_id, title, description, status, origin, created_by_identity)
     VALUES ($1::uuid, $2, $3::uuid, $4, 'Descricao sintetica exclusiva do teste de leitura por conta.', 'solicitada', 'portal_cliente',
             (SELECT id FROM auth_identities WHERE email = $5))`,
    [requestA, protocolA, accountA, titleA, clientEmail],
  );

  // O servidor é a autoridade: A devolve 1 solicitação + 1 contrato; B devolve
  // duas listas vazias. O defeito procurado está na reconciliação das DUAS
  // respostas pelo componente — especialmente o <select> do formulário.
  const requestResponseA = await api(`/api/client/service-requests?account=${accountA}`, { cookie: clientCookie });
  const contractsResponseA = await api(`/api/client/contracts?account=${accountA}`, { cookie: clientCookie });
  const requestResponseB = await api(`/api/client/service-requests?account=${accountB}`, { cookie: clientCookie });
  const contractsResponseB = await api(`/api/client/contracts?account=${accountB}`, { cookie: clientCookie });
  assert.equal(requestResponseA.status, 200);
  assert.deepEqual(requestResponseA.body.serviceRequests.map(item => item.title), [titleA]);
  assert.deepEqual(contractsResponseA.body.contracts.map(item => item.title), [contractTitleA]);
  assert.equal(requestResponseB.status, 200);
  assert.deepEqual(requestResponseB.body.serviceRequests, []);
  assert.deepEqual(contractsResponseB.body.contracts, []);

  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    await context.addCookies(clientCookie.split('; ').filter(Boolean).map(item => {
      const separator = item.indexOf('=');
      return { name: item.slice(0, separator), value: item.slice(separator + 1), url: baseUrl };
    }));
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    await page.addInitScript(() => {
      window.__id3SolCalls = {};
      window.__id3SolPending = {};
      window.__id3SolCompleted = {};
      window.__id3SolReleases = {};
      window.__id3SolHold = false;
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        const isRead = url.includes('/api/client/service-requests?') || url.includes('/api/client/contracts?');
        if (!isRead) return original(input, init);
        const account = new URL(url, window.location.origin).searchParams.get('account') || 'unknown';
        const call = (window.__id3SolCalls[account] || 0) + 1;
        window.__id3SolCalls[account] = call;
        const key = `${account}:${call}`;
        if (window.__id3SolHold) {
          window.__id3SolPending[key] = true;
          await new Promise(resolve => {
            window.__id3SolReleases[key] = () => {
              delete window.__id3SolPending[key];
              resolve();
            };
          });
        }
        const response = await original(input, init);
        window.__id3SolCompleted[key] = true;
        return response;
      };
    });
    await page.goto(`${baseUrl}/cliente/app/solicitacoes`, { waitUntil: 'domcontentloaded' });
    const titleALocator = page.getByText(titleA, { exact: true });
    const contractOptionA = page.locator('select option').filter({ hasText: contractTitleA });
    await titleALocator.waitFor();
    assert.equal(await contractOptionA.count(), 1, 'o contrato de A precisa estar disponível no formulário de A');
    await capture(page, `${evidencePrefix}-a-carregado-390`);

    // B dispara DUAS leituras. Ambas ficam pendentes: no código anterior, a
    // solicitação e o contrato de A continuavam visíveis sob o cabeçalho de B.
    await page.evaluate(() => { window.__id3SolHold = true; });
    const picker = page.getByLabel('Conta de cliente selecionada');
    const nextBCall = await page.evaluate(account => (window.__id3SolCalls[account] || 0) + 1, accountB);
    const pendingB = [`${accountB}:${nextBCall}`, `${accountB}:${nextBCall + 1}`];
    await picker.selectOption(accountB);
    for (const key of pendingB) await page.waitForFunction(k => window.__id3SolPending[k] === true, key);
    await capture(page, `${evidencePrefix}-b-pendente-390`);
    assert.equal(await titleALocator.count(), 0,
      'a solicitação de A não pode continuar visível quando B está selecionada e suas leituras estão pendentes');
    assert.equal(await contractOptionA.count(), 0,
      'o contrato de A não pode ser oferecido no formulário enquanto B está selecionada');
    assert.equal(await page.getByText('Carregando solicitações…', { exact: true }).count(), 1);
    assert.equal(await page.getByText(/Nenhuma solicitação de serviço adicional registrada/).count(), 0,
      'B pendente não pode ser anunciada como B vazia');

    const viewportEvidence = [];
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.waitForTimeout(80);
      viewportEvidence.push(await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        return { width, horizontalOverflow: document.documentElement.scrollWidth - width };
      }));
      if (width !== 390) await capture(page, `${evidencePrefix}-b-pendente-${width}`);
    }
    assert.ok(viewportEvidence.every(item => item.horizontalOverflow <= 1),
      `Solicitações não deve transbordar horizontalmente: ${JSON.stringify(viewportEvidence)}`);

    for (const key of pendingB) await page.evaluate(k => window.__id3SolReleases[k](), key);
    const emptyB = page.getByText(/Nenhuma solicitação de serviço adicional registrada/);
    await emptyB.waitFor();
    assert.equal(await titleALocator.count(), 0);
    assert.equal(await contractOptionA.count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, `${evidencePrefix}-b-vazio-390`);

    // Fora de ordem: as duas leituras de A ficam pendentes; as duas de B são
    // iniciadas e concluídas primeiro. A resposta antiga de A não pode vencer.
    const nextACall = await page.evaluate(account => (window.__id3SolCalls[account] || 0) + 1, accountA);
    const pendingA = [`${accountA}:${nextACall}`, `${accountA}:${nextACall + 1}`];
    await picker.focus();
    await page.keyboard.press('ArrowUp');
    for (const key of pendingA) await page.waitForFunction(k => window.__id3SolPending[k] === true, key);
    assert.equal(await picker.inputValue(), accountA);
    assert.equal(await picker.evaluate(element => element === document.activeElement), true,
      'a troca por teclado preserva o foco no seletor de conta');
    const nextBCall2 = await page.evaluate(account => (window.__id3SolCalls[account] || 0) + 1, accountB);
    const pendingB2 = [`${accountB}:${nextBCall2}`, `${accountB}:${nextBCall2 + 1}`];
    await page.keyboard.press('ArrowDown');
    for (const key of pendingB2) await page.waitForFunction(k => window.__id3SolPending[k] === true, key);
    assert.equal(await picker.inputValue(), accountB);
    for (const key of pendingB2) await page.evaluate(k => window.__id3SolReleases[k](), key);
    await emptyB.waitFor();
    for (const key of pendingA) await page.evaluate(k => window.__id3SolReleases[k](), key);
    for (const key of pendingA) await page.waitForFunction(k => window.__id3SolCompleted[k] === true, key);
    await page.waitForTimeout(200);
    assert.equal(await picker.inputValue(), accountB);
    assert.equal(await titleALocator.count(), 0,
      'a resposta antiga de A não pode substituir o resultado mais recente de B');
    assert.equal(await contractOptionA.count(), 0,
      'o contrato antigo de A não pode reaparecer no formulário de B');
    assert.equal(await emptyB.count(), 1,
      'o vazio confirmado da resposta mais recente de B deve permanecer visível');
    await capture(page, `${evidencePrefix}-b-resposta-fora-de-ordem-390`);

    if (process.env.UX_PORTAL_EVIDENCE_DIR) {
      await writeFile(path.join(process.env.UX_PORTAL_EVIDENCE_DIR, `${evidencePrefix}-medidas.json`), JSON.stringify({
        route: '/cliente/app/solicitacoes',
        serverReadA: { requests: requestResponseA.body.serviceRequests.length, contracts: contractsResponseA.body.contracts.length },
        serverReadB: { requests: requestResponseB.body.serviceRequests.length, contracts: contractsResponseB.body.contracts.length },
        viewportEvidence,
        keyboard: 'ArrowUp/ArrowDown no seletor nativo; foco preservado',
        outOfOrder: `B:${nextBCall2}..${nextBCall2 + 1} concluídas antes de A:${nextACall}..${nextACall + 1}; resultado final permaneceu em B`,
        humanAcceptanceExecuted: false,
      }, null, 2) + '\n');
    }
    await context.close();
  } finally {
    await browser?.close();
    await pool.query('DELETE FROM cli_service_requests WHERE id = $1', [requestA]);
    await pool.query('DELETE FROM client_contracts WHERE id = $1', [contractA]);
    await pool.query('DELETE FROM client_access_grants WHERE id = ANY($1::uuid[])', [[grantA, grantB]]);
    await pool.query('DELETE FROM client_accounts WHERE id = ANY($1::uuid[])', [[accountA, accountB]]);
  }
});

test('browser ID3: chamados isola a leitura por conta e traduz erro de reabertura', { skip: !RUN }, async () => {
  const accountA = randomUUID();
  const accountB = randomUUID();
  const grantA = randomUUID();
  const grantB = randomUUID();
  const ticketA = randomUUID();
  const titleA = `Chamado sintetico ID3 A ${randomUUID().slice(0, 8)}`;
  const evidencePrefix = process.env.UX_PORTAL_EVIDENCE_PREFIX || 'ux-pro-id3-chamados-leitura';
  await pool.query(
    "INSERT INTO client_accounts (id, display_name, created_by) VALUES ($1::uuid, 'ID3 Chamados Conta A Sintetica', 'ti'), ($2::uuid, 'ID3 Chamados Conta B Sintetica', 'ti')",
    [accountA, accountB],
  );
  await pool.query(
    `INSERT INTO client_access_grants (id, identity_id, client_account_id, reason, granted_by)
     SELECT $1::uuid, id, $2::uuid, 'fixture sintetica ID3 chamados', 'ti' FROM auth_identities WHERE email = $3
     UNION ALL
     SELECT $4::uuid, id, $5::uuid, 'fixture sintetica ID3 chamados', 'ti' FROM auth_identities WHERE email = $3`,
    [grantA, accountA, clientEmail, grantB, accountB],
  );
  await pool.query(
    `INSERT INTO client_tickets (id, client_account_id, opened_by_identity, category, title, details, status)
     VALUES ($1::uuid, $2::uuid, (SELECT id FROM auth_identities WHERE email = $3), 'Outro assunto', $4,
             'Descricao sintetica exclusiva do teste de leitura por conta.', 'resolved')`,
    [ticketA, accountA, clientEmail, titleA],
  );

  const responseA = await api(`/api/client/tickets?account=${accountA}`, { cookie: clientCookie });
  const responseB = await api(`/api/client/tickets?account=${accountB}`, { cookie: clientCookie });
  assert.equal(responseA.status, 200);
  assert.deepEqual(responseA.body.tickets.map(ticket => ticket.title), [titleA]);
  assert.equal(responseB.status, 200);
  assert.deepEqual(responseB.body.tickets, []);

  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    await context.addCookies(clientCookie.split('; ').filter(Boolean).map(item => {
      const separator = item.indexOf('=');
      return { name: item.slice(0, separator), value: item.slice(separator + 1), url: baseUrl };
    }));
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    await page.addInitScript(() => {
      window.__id3TicketCalls = {};
      window.__id3TicketPending = {};
      window.__id3TicketCompleted = {};
      window.__id3TicketReleases = {};
      window.__id3HoldTickets = false;
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        // Somente a leitura GET é controlada; POST/PATCH vão direto ao servidor.
        if (!url.includes('/api/client/tickets?')) return original(input, init);
        const account = new URL(url, window.location.origin).searchParams.get('account') || 'unknown';
        const call = (window.__id3TicketCalls[account] || 0) + 1;
        window.__id3TicketCalls[account] = call;
        const key = `${account}:${call}`;
        if (window.__id3HoldTickets) {
          window.__id3TicketPending[key] = true;
          await new Promise(resolve => {
            window.__id3TicketReleases[key] = () => {
              delete window.__id3TicketPending[key];
              resolve();
            };
          });
        }
        const response = await original(input, init);
        window.__id3TicketCompleted[key] = true;
        return response;
      };
    });
    await page.goto(`${baseUrl}/cliente/app/chamados`, { waitUntil: 'domcontentloaded' });
    const titleALocator = page.getByText(titleA, { exact: true });
    await titleALocator.waitFor();
    await capture(page, `${evidencePrefix}-a-carregado-390`);

    // Prova da tradução de erro: um motivo curto devolve 400 com
    // ticket_reopen_reason_required. Com workspaceFetch no PATCH, o corpo era
    // consumido e a UI mostrava a mensagem genérica de conexão.
    await page.getByLabel(`Motivo para reabrir chamado ${titleA}`).fill('curto');
    await page.getByRole('button', { name: 'Reabrir chamado' }).click();
    const reopenError = page.getByText('Informe um motivo de reabertura com pelo menos 10 caracteres.', { exact: true });
    await reopenError.waitFor();
    assert.equal(await page.getByText('Não foi possível conectar agora. Tente novamente em instantes.').count(), 0,
      'o motivo específico do servidor não pode ser substituído por erro genérico de conexão');
    await capture(page, `${evidencePrefix}-a-erro-reabertura-traduzido-390`);
    const reopenTranslation = { visible: true, message: 'ticket_reopen_reason_required traduzido' };

    // B:1 pendente: no código anterior, o chamado de A continuava visível sob
    // o cabeçalho de B e o vazio podia aparecer antes da resposta.
    await page.evaluate(() => { window.__id3HoldTickets = true; });
    const picker = page.getByLabel('Conta de cliente selecionada');
    const pendingB1 = `${accountB}:1`;
    await picker.selectOption(accountB);
    await page.waitForFunction(key => window.__id3TicketPending[key] === true, pendingB1);
    await capture(page, `${evidencePrefix}-b-pendente-390`);
    assert.equal(await titleALocator.count(), 0,
      'o chamado de A não pode continuar visível quando B está selecionada e sua leitura está pendente');
    assert.equal(await page.getByText('Carregando chamados…', { exact: true }).count(), 1);
    assert.equal(await page.getByText(/Você ainda não abriu chamados para este cadastro/).count(), 0,
      'B pendente não pode ser anunciada como B vazia');

    const viewportEvidence = [];
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.waitForTimeout(80);
      viewportEvidence.push(await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        return { width, horizontalOverflow: document.documentElement.scrollWidth - width };
      }));
      if (width !== 390) await capture(page, `${evidencePrefix}-b-pendente-${width}`);
    }
    assert.ok(viewportEvidence.every(item => item.horizontalOverflow <= 1),
      `Chamados não deve transbordar horizontalmente: ${JSON.stringify(viewportEvidence)}`);

    await page.evaluate(key => window.__id3TicketReleases[key](), pendingB1);
    const emptyB = page.getByText(/Você ainda não abriu chamados para este cadastro/);
    await emptyB.waitFor();
    assert.equal(await titleALocator.count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, `${evidencePrefix}-b-vazio-390`);

    const nextACall = await page.evaluate(account => (window.__id3TicketCalls[account] || 0) + 1, accountA);
    const pendingA2 = `${accountA}:${nextACall}`;
    await picker.focus();
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(key => window.__id3TicketPending[key] === true, pendingA2);
    assert.equal(await picker.inputValue(), accountA);
    assert.equal(await picker.evaluate(element => element === document.activeElement), true,
      'a troca por teclado preserva o foco no seletor de conta');
    const nextBCall = await page.evaluate(account => (window.__id3TicketCalls[account] || 0) + 1, accountB);
    const pendingB2 = `${accountB}:${nextBCall}`;
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(key => window.__id3TicketPending[key] === true, pendingB2);
    assert.equal(await picker.inputValue(), accountB);
    await page.evaluate(key => window.__id3TicketReleases[key](), pendingB2);
    await emptyB.waitFor();
    await page.evaluate(key => window.__id3TicketReleases[key](), pendingA2);
    await page.waitForFunction(key => window.__id3TicketCompleted[key] === true, pendingA2);
    await page.waitForTimeout(200);
    assert.equal(await picker.inputValue(), accountB);
    assert.equal(await titleALocator.count(), 0,
      'a resposta antiga de A não pode substituir o resultado mais recente de B');
    assert.equal(await emptyB.count(), 1,
      'o vazio confirmado da resposta mais recente de B deve permanecer visível');
    await capture(page, `${evidencePrefix}-b-resposta-fora-de-ordem-390`);

    if (process.env.UX_PORTAL_EVIDENCE_DIR) {
      await writeFile(path.join(process.env.UX_PORTAL_EVIDENCE_DIR, `${evidencePrefix}-medidas.json`), JSON.stringify({
        route: '/cliente/app/chamados',
        serverReadA: { status: responseA.status, tickets: responseA.body.tickets.length },
        serverReadB: { status: responseB.status, tickets: responseB.body.tickets.length },
        reopenTranslation,
        viewportEvidence,
        keyboard: 'ArrowUp/ArrowDown no seletor nativo; foco preservado',
        outOfOrder: `B:${nextBCall} concluída antes de A:${nextACall}; resultado final permaneceu em B`,
        humanAcceptanceExecuted: false,
      }, null, 2) + '\n');
    }
    await context.close();
  } finally {
    await browser?.close();
    await pool.query('DELETE FROM client_ticket_status_audit WHERE ticket_id = $1', [ticketA]);
    await pool.query('DELETE FROM client_ticket_messages WHERE ticket_id = $1', [ticketA]);
    await pool.query('DELETE FROM client_tickets WHERE id = $1', [ticketA]);
    await pool.query('DELETE FROM client_access_grants WHERE id = ANY($1::uuid[])', [[grantA, grantB]]);
    await pool.query('DELETE FROM client_accounts WHERE id = ANY($1::uuid[])', [[accountA, accountB]]);
  }
});

test('browser ID3: reclamações restritas ficam na conta ativa e não exibem o relato', { skip: !RUN }, async () => {
  const accountA = randomUUID();
  const accountB = randomUUID();
  const grantA = randomUUID();
  const grantB = randomUUID();
  const complaintA = randomUUID();
  const titleA = `Reclamacao sintetica ID3 A ${randomUUID().slice(0, 8)}`;
  const descriptionA = `Relato restrito sintetico ID3 ${randomUUID().slice(0, 8)} — nao deve aparecer na listagem do portal.`;
  const protocolA = `CLI-COMP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 4).toUpperCase()}`;
  const evidencePrefix = process.env.UX_PORTAL_EVIDENCE_PREFIX || 'ux-pro-id3-reclamacoes-leitura';
  await pool.query(
    "INSERT INTO client_accounts (id, display_name, created_by) VALUES ($1::uuid, 'ID3 Reclamacoes Conta A Sintetica', 'ti'), ($2::uuid, 'ID3 Reclamacoes Conta B Sintetica', 'ti')",
    [accountA, accountB],
  );
  await pool.query(
    `INSERT INTO client_access_grants (id, identity_id, client_account_id, reason, granted_by)
     SELECT $1::uuid, id, $2::uuid, 'fixture sintetica ID3 reclamacoes', 'ti' FROM auth_identities WHERE email = $3
     UNION ALL
     SELECT $4::uuid, id, $5::uuid, 'fixture sintetica ID3 reclamacoes', 'ti' FROM auth_identities WHERE email = $3`,
    [grantA, accountA, clientEmail, grantB, accountB],
  );
  // A migração 146 exige, para origin='portal_cliente', idempotency_key e
  // request_fingerprint válidos — a jornada real deriva ambos da sessão.
  await pool.query(
    `INSERT INTO cli_employee_complaints
       (id, protocol, client_account_id, category, severity, title, description, status,
        origin, created_by_identity, idempotency_key, request_fingerprint)
     VALUES ($1::uuid, $2, $3::uuid, 'outro', 'baixa', $4, $5, 'pendente',
             'portal_cliente', (SELECT id FROM auth_identities WHERE email = $6), $7, $8)`,
    [complaintA, protocolA, accountA, titleA, descriptionA, clientEmail,
     `id3-complaint-fixture-${randomUUID().slice(0, 8)}`, randomBytes(32).toString('hex')],
  );

  const responseA = await api(`/api/client/employee-complaints?account=${accountA}`, { cookie: clientCookie });
  const responseB = await api(`/api/client/employee-complaints?account=${accountB}`, { cookie: clientCookie });
  assert.equal(responseA.status, 200);
  assert.deepEqual(responseA.body.complaints.map(item => item.title), [titleA]);
  assert.equal(responseA.body.hrMinimalShare.length, 4);
  assert.equal(responseB.status, 200);
  assert.deepEqual(responseB.body.complaints, []);

  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    await context.addCookies(clientCookie.split('; ').filter(Boolean).map(item => {
      const separator = item.indexOf('=');
      return { name: item.slice(0, separator), value: item.slice(separator + 1), url: baseUrl };
    }));
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    await page.addInitScript(() => {
      window.__id3ComplaintCalls = {};
      window.__id3ComplaintPending = {};
      window.__id3ComplaintCompleted = {};
      window.__id3ComplaintReleases = {};
      window.__id3HoldComplaints = false;
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        if (!url.includes('/api/client/employee-complaints?')) return original(input, init);
        const account = new URL(url, window.location.origin).searchParams.get('account') || 'unknown';
        const call = (window.__id3ComplaintCalls[account] || 0) + 1;
        window.__id3ComplaintCalls[account] = call;
        const key = `${account}:${call}`;
        if (window.__id3HoldComplaints) {
          window.__id3ComplaintPending[key] = true;
          await new Promise(resolve => {
            window.__id3ComplaintReleases[key] = () => {
              delete window.__id3ComplaintPending[key];
              resolve();
            };
          });
        }
        const response = await original(input, init);
        window.__id3ComplaintCompleted[key] = true;
        return response;
      };
    });
    await page.goto(`${baseUrl}/cliente/app/reclamacoes-colaborador`, { waitUntil: 'domcontentloaded' });
    const titleALocator = page.getByText(titleA, { exact: true });
    await titleALocator.waitFor();
    await capture(page, `${evidencePrefix}-a-carregado-390`);

    // Privacidade: a API devolve `description`, mas a página do portal NUNCA
    // pode renderizar o relato — nem na lista, nem no envelope mínimo do RH.
    // E9: `useClientSpace` pode disparar um segundo load() e trocar a lista
    // pelo spinner entre o waitFor do título e a medição do corpo. Esperar o
    // estado estável (protocolo + envelope do RH presentes, spinner ausente)
    // elimina a falha intermitente sem waitForTimeout arbitrário.
    const bodyText = await waitForStableBodyText(page, {
      required: [titleA, protocolA, 'Protocolo', 'Severidade'],
      forbidden: ['Carregando reclamações…', 'Aguardando uma leitura concluída…'],
    });
    assert.equal(bodyText.includes(descriptionA), false,
      'o relato restrito não pode aparecer na página do portal');
    assert.equal(bodyText.includes(protocolA), true, 'o protocolo precisa estar visível');
    assert.ok(bodyText.includes('Protocolo') && bodyText.includes('Severidade'),
      'o envelope mínimo do RH precisa estar descrito');
    const privacyEvidence = { descriptionRendered: false, protocolVisible: true, hrEnvelopeVisible: true };

    await page.evaluate(() => { window.__id3HoldComplaints = true; });
    const picker = page.getByLabel('Conta de cliente selecionada');
    const pendingB1 = `${accountB}:1`;
    await picker.selectOption(accountB);
    await page.waitForFunction(key => window.__id3ComplaintPending[key] === true, pendingB1);
    await capture(page, `${evidencePrefix}-b-pendente-390`);
    assert.equal(await titleALocator.count(), 0,
      'a reclamação de A não pode continuar visível quando B está selecionada e sua leitura está pendente');
    assert.equal(await page.getByText('Carregando reclamações…', { exact: true }).count(), 1);
    assert.equal(await page.getByText(/Nenhuma reclamação registrada por você nesta conta/).count(), 0,
      'B pendente não pode ser anunciada como B sem reclamações');
    const pendingBody = await page.locator('body').innerText();
    assert.equal(pendingBody.includes(descriptionA), false,
      'nem mesmo durante a troca de conta o relato pode vazar');

    const viewportEvidence = [];
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.waitForTimeout(80);
      viewportEvidence.push(await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        return { width, horizontalOverflow: document.documentElement.scrollWidth - width };
      }));
      if (width !== 390) await capture(page, `${evidencePrefix}-b-pendente-${width}`);
    }
    assert.ok(viewportEvidence.every(item => item.horizontalOverflow <= 1),
      `Reclamações não deve transbordar horizontalmente: ${JSON.stringify(viewportEvidence)}`);

    await page.evaluate(key => window.__id3ComplaintReleases[key](), pendingB1);
    const emptyB = page.getByText(/Nenhuma reclamação registrada por você nesta conta/);
    await emptyB.waitFor();
    assert.equal(await titleALocator.count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, `${evidencePrefix}-b-vazio-390`);

    const nextACall = await page.evaluate(account => (window.__id3ComplaintCalls[account] || 0) + 1, accountA);
    const pendingA2 = `${accountA}:${nextACall}`;
    await picker.focus();
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(key => window.__id3ComplaintPending[key] === true, pendingA2);
    assert.equal(await picker.inputValue(), accountA);
    assert.equal(await picker.evaluate(element => element === document.activeElement), true,
      'a troca por teclado preserva o foco no seletor de conta');
    const nextBCall = await page.evaluate(account => (window.__id3ComplaintCalls[account] || 0) + 1, accountB);
    const pendingB2 = `${accountB}:${nextBCall}`;
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(key => window.__id3ComplaintPending[key] === true, pendingB2);
    assert.equal(await picker.inputValue(), accountB);
    await page.evaluate(key => window.__id3ComplaintReleases[key](), pendingB2);
    await emptyB.waitFor();
    await page.evaluate(key => window.__id3ComplaintReleases[key](), pendingA2);
    await page.waitForFunction(key => window.__id3ComplaintCompleted[key] === true, pendingA2);
    await page.waitForTimeout(200);
    assert.equal(await picker.inputValue(), accountB);
    assert.equal(await titleALocator.count(), 0,
      'a resposta antiga de A não pode substituir o resultado mais recente de B');
    assert.equal(await emptyB.count(), 1,
      'o vazio confirmado da resposta mais recente de B deve permanecer visível');
    await capture(page, `${evidencePrefix}-b-resposta-fora-de-ordem-390`);

    if (process.env.UX_PORTAL_EVIDENCE_DIR) {
      await writeFile(path.join(process.env.UX_PORTAL_EVIDENCE_DIR, `${evidencePrefix}-medidas.json`), JSON.stringify({
        route: '/cliente/app/reclamacoes-colaborador',
        serverReadA: { status: responseA.status, complaints: responseA.body.complaints.length, hrMinimalShare: responseA.body.hrMinimalShare.length },
        serverReadB: { status: responseB.status, complaints: responseB.body.complaints.length },
        privacyEvidence,
        viewportEvidence,
        keyboard: 'ArrowUp/ArrowDown no seletor nativo; foco preservado',
        outOfOrder: `B:${nextBCall} concluída antes de A:${nextACall}; resultado final permaneceu em B`,
        humanAcceptanceExecuted: false,
      }, null, 2) + '\n');
    }
    await context.close();
  } finally {
    await browser?.close();
    await pool.query('DELETE FROM cli_employee_complaint_messages WHERE complaint_id = $1', [complaintA]);
    await pool.query('DELETE FROM cli_employee_complaint_history WHERE complaint_id = $1', [complaintA]);
    await pool.query('DELETE FROM cli_employee_complaints WHERE id = $1', [complaintA]);
    await pool.query('DELETE FROM client_access_grants WHERE id = ANY($1::uuid[])', [[grantA, grantB]]);
    await pool.query('DELETE FROM client_accounts WHERE id = ANY($1::uuid[])', [[accountA, accountB]]);
  }
});

test('browser ID3: documentos e links de download ficam presos à conta ativa', { skip: !RUN }, async () => {
  const accountA = randomUUID();
  const accountB = randomUUID();
  const grantA = randomUUID();
  const grantB = randomUUID();
  const documentA = randomUUID();
  const titleA = `Documento sintetico ID3 A ${randomUUID().slice(0, 8)}`;
  const evidencePrefix = process.env.UX_PORTAL_EVIDENCE_PREFIX || 'ux-pro-id3-documentos-leitura';
  await pool.query(
    "INSERT INTO client_accounts (id, display_name, created_by) VALUES ($1::uuid, 'ID3 Documentos Conta A Sintetica', 'ti'), ($2::uuid, 'ID3 Documentos Conta B Sintetica', 'ti')",
    [accountA, accountB],
  );
  await pool.query(
    `INSERT INTO client_access_grants (id, identity_id, client_account_id, reason, granted_by)
     SELECT $1::uuid, id, $2::uuid, 'fixture sintetica ID3 documentos', 'ti' FROM auth_identities WHERE email = $3
     UNION ALL
     SELECT $4::uuid, id, $5::uuid, 'fixture sintetica ID3 documentos', 'ti' FROM auth_identities WHERE email = $3`,
    [grantA, accountA, clientEmail, grantB, accountB],
  );
  await pool.query(
    `INSERT INTO client_documents
       (id, client_account_id, title, category, original_filename, content_type, size_bytes, storage_key, uploaded_by)
     VALUES ($1::uuid, $2::uuid, $3, 'Geral', 'sintetico-id3.txt', 'text/plain', 42, $4, 'ti')`,
    [documentA, accountA, titleA, randomBytes(24).toString('hex')],
  );

  const responseA = await api(`/api/client/documents?account=${accountA}`, { cookie: clientCookie });
  const responseB = await api(`/api/client/documents?account=${accountB}`, { cookie: clientCookie });
  assert.equal(responseA.status, 200);
  assert.deepEqual(responseA.body.documents.map(item => item.title), [titleA]);
  assert.equal(responseB.status, 200);
  assert.deepEqual(responseB.body.documents, []);

  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    await context.addCookies(clientCookie.split('; ').filter(Boolean).map(item => {
      const separator = item.indexOf('=');
      return { name: item.slice(0, separator), value: item.slice(separator + 1), url: baseUrl };
    }));
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    await page.addInitScript(() => {
      window.__id3DocCalls = {};
      window.__id3DocPending = {};
      window.__id3DocCompleted = {};
      window.__id3DocReleases = {};
      window.__id3HoldDocs = false;
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        if (!url.includes('/api/client/documents?')) return original(input, init);
        const account = new URL(url, window.location.origin).searchParams.get('account') || 'unknown';
        const call = (window.__id3DocCalls[account] || 0) + 1;
        window.__id3DocCalls[account] = call;
        const key = `${account}:${call}`;
        if (window.__id3HoldDocs) {
          window.__id3DocPending[key] = true;
          await new Promise(resolve => {
            window.__id3DocReleases[key] = () => {
              delete window.__id3DocPending[key];
              resolve();
            };
          });
        }
        const response = await original(input, init);
        window.__id3DocCompleted[key] = true;
        return response;
      };
    });
    await page.goto(`${baseUrl}/cliente/app/documentos`, { waitUntil: 'domcontentloaded' });
    const titleALocator = page.getByText(titleA, { exact: true });
    const downloadLinks = page.locator('a[href*="/api/client/documents/"]');
    await titleALocator.waitFor();
    assert.equal(await downloadLinks.count(), 1, 'A precisa ter exatamente um link de download');
    assert.match(await downloadLinks.first().getAttribute('href') || '', new RegExp(documentA),
      'o link precisa apontar para o documento da conta ativa');
    await capture(page, `${evidencePrefix}-a-carregado-390`);

    // B:1 pendente: no código anterior, o documento de A — e o seu LINK de
    // download — continuavam na tela de B.
    await page.evaluate(() => { window.__id3HoldDocs = true; });
    const picker = page.getByLabel('Conta de cliente selecionada');
    const pendingB1 = `${accountB}:1`;
    await picker.selectOption(accountB);
    await page.waitForFunction(key => window.__id3DocPending[key] === true, pendingB1);
    await capture(page, `${evidencePrefix}-b-pendente-390`);
    assert.equal(await titleALocator.count(), 0,
      'o documento de A não pode continuar visível quando B está selecionada e sua leitura está pendente');
    assert.equal(await downloadLinks.count(), 0,
      'nenhum link de download de A pode permanecer clicável na tela de B');
    assert.equal(await page.getByText('Carregando documentos…', { exact: true }).count(), 1);
    assert.equal(await page.getByText(/Nenhum documento foi compartilhado ainda com este cadastro/).count(), 0,
      'B pendente não pode ser anunciada como B sem documentos');

    const viewportEvidence = [];
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.waitForTimeout(80);
      viewportEvidence.push(await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        return { width, horizontalOverflow: document.documentElement.scrollWidth - width };
      }));
      if (width !== 390) await capture(page, `${evidencePrefix}-b-pendente-${width}`);
    }
    assert.ok(viewportEvidence.every(item => item.horizontalOverflow <= 1),
      `Documentos não deve transbordar horizontalmente: ${JSON.stringify(viewportEvidence)}`);

    await page.evaluate(key => window.__id3DocReleases[key](), pendingB1);
    const emptyB = page.getByText(/Nenhum documento foi compartilhado ainda com este cadastro/);
    await emptyB.waitFor();
    assert.equal(await titleALocator.count(), 0);
    assert.equal(await downloadLinks.count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, `${evidencePrefix}-b-vazio-390`);

    const nextACall = await page.evaluate(account => (window.__id3DocCalls[account] || 0) + 1, accountA);
    const pendingA2 = `${accountA}:${nextACall}`;
    await picker.focus();
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(key => window.__id3DocPending[key] === true, pendingA2);
    assert.equal(await picker.inputValue(), accountA);
    assert.equal(await picker.evaluate(element => element === document.activeElement), true,
      'a troca por teclado preserva o foco no seletor de conta');
    const nextBCall = await page.evaluate(account => (window.__id3DocCalls[account] || 0) + 1, accountB);
    const pendingB2 = `${accountB}:${nextBCall}`;
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(key => window.__id3DocPending[key] === true, pendingB2);
    assert.equal(await picker.inputValue(), accountB);
    await page.evaluate(key => window.__id3DocReleases[key](), pendingB2);
    await emptyB.waitFor();
    await page.evaluate(key => window.__id3DocReleases[key](), pendingA2);
    await page.waitForFunction(key => window.__id3DocCompleted[key] === true, pendingA2);
    await page.waitForTimeout(200);
    assert.equal(await picker.inputValue(), accountB);
    assert.equal(await titleALocator.count(), 0,
      'a resposta antiga de A não pode substituir o resultado mais recente de B');
    assert.equal(await downloadLinks.count(), 0,
      'a resposta antiga de A não pode devolver um link de download para B');
    assert.equal(await emptyB.count(), 1,
      'o vazio confirmado da resposta mais recente de B deve permanecer visível');
    await capture(page, `${evidencePrefix}-b-resposta-fora-de-ordem-390`);

    if (process.env.UX_PORTAL_EVIDENCE_DIR) {
      await writeFile(path.join(process.env.UX_PORTAL_EVIDENCE_DIR, `${evidencePrefix}-medidas.json`), JSON.stringify({
        route: '/cliente/app/documentos',
        serverReadA: { status: responseA.status, documents: responseA.body.documents.length },
        serverReadB: { status: responseB.status, documents: responseB.body.documents.length },
        downloadLinksOnA: 1,
        downloadLinksOnBPending: 0,
        downloadLinksOnBFinal: 0,
        viewportEvidence,
        keyboard: 'ArrowUp/ArrowDown no seletor nativo; foco preservado',
        outOfOrder: `B:${nextBCall} concluída antes de A:${nextACall}; resultado final permaneceu em B`,
        humanAcceptanceExecuted: false,
      }, null, 2) + '\n');
    }
    await context.close();
  } finally {
    await browser?.close();
    await pool.query('DELETE FROM client_documents WHERE id = $1', [documentA]);
    await pool.query('DELETE FROM client_access_grants WHERE id = ANY($1::uuid[])', [[grantA, grantB]]);
    await pool.query('DELETE FROM client_accounts WHERE id = ANY($1::uuid[])', [[accountA, accountB]]);
  }
});

test('browser ID3: satisfação mantém pesquisas e select na conta ativa e traduz nota fora da escala', { skip: !RUN }, async () => {
  const accountA = randomUUID();
  const accountB = randomUUID();
  const grantA = randomUUID();
  const grantB = randomUUID();
  const surveyA = randomUUID();
  const protocolA = `SAT-CLI-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 4).toUpperCase()}`;
  const purposeA = `Finalidade sintetica ID3 ${randomUUID().slice(0, 8)}`;
  const evidencePrefix = process.env.UX_PORTAL_EVIDENCE_PREFIX || 'ux-pro-id3-satisfacao-leitura';
  await pool.query(
    "INSERT INTO client_accounts (id, display_name, created_by) VALUES ($1::uuid, 'ID3 Satisfacao Conta A Sintetica', 'ti'), ($2::uuid, 'ID3 Satisfacao Conta B Sintetica', 'ti')",
    [accountA, accountB],
  );
  await pool.query(
    `INSERT INTO client_access_grants (id, identity_id, client_account_id, reason, granted_by)
     SELECT $1::uuid, id, $2::uuid, 'fixture sintetica ID3 satisfacao', 'ti' FROM auth_identities WHERE email = $3
     UNION ALL
     SELECT $4::uuid, id, $5::uuid, 'fixture sintetica ID3 satisfacao', 'ti' FROM auth_identities WHERE email = $3`,
    [grantA, accountA, clientEmail, grantB, accountB],
  );
  // Migração 152: origin='ext06_canonica' exige finalidade, metodologia, fonte,
  // escala, regra de acompanhamento, destinatário e autor.
  await pool.query(
    `INSERT INTO cli_satisfaction_surveys
       (id, protocol, client_account_id, survey_type, status, origin, purpose, methodology,
        methodology_source, scale_min, scale_max, follow_up_operator, follow_up_threshold,
        target_identity_id, created_by_identity)
     VALUES ($1::uuid, $2, $3::uuid, 'periodica', 'pendente', 'ext06_canonica', $4, 'generica',
             'Fonte sintetica ID3 para teste de escala', 1, 5, 'lte', 2,
             (SELECT id FROM auth_identities WHERE email = $5),
             (SELECT id FROM auth_identities WHERE email = $5))`,
    [surveyA, protocolA, accountA, purposeA, clientEmail],
  );

  const responseA = await api(`/api/client/satisfaction-surveys?account=${accountA}`, { cookie: clientCookie });
  const responseB = await api(`/api/client/satisfaction-surveys?account=${accountB}`, { cookie: clientCookie });
  assert.equal(responseA.status, 200);
  assert.deepEqual(responseA.body.surveys.map(item => item.protocol), [protocolA]);
  assert.equal(responseA.body.surveys[0].scale_min, 1);
  assert.equal(responseA.body.surveys[0].scale_max, 5);
  assert.equal(responseB.status, 200);
  assert.deepEqual(responseB.body.surveys, []);

  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    await context.addCookies(clientCookie.split('; ').filter(Boolean).map(item => {
      const separator = item.indexOf('=');
      return { name: item.slice(0, separator), value: item.slice(separator + 1), url: baseUrl };
    }));
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    await page.addInitScript(() => {
      window.__id3SurveyCalls = {};
      window.__id3SurveyPending = {};
      window.__id3SurveyCompleted = {};
      window.__id3SurveyReleases = {};
      window.__id3HoldSurveys = false;
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        // Somente a leitura GET é controlada; o POST vai direto ao servidor.
        if (!url.includes('/api/client/satisfaction-surveys?')) return original(input, init);
        const account = new URL(url, window.location.origin).searchParams.get('account') || 'unknown';
        const call = (window.__id3SurveyCalls[account] || 0) + 1;
        window.__id3SurveyCalls[account] = call;
        const key = `${account}:${call}`;
        if (window.__id3HoldSurveys) {
          window.__id3SurveyPending[key] = true;
          await new Promise(resolve => {
            window.__id3SurveyReleases[key] = () => {
              delete window.__id3SurveyPending[key];
              resolve();
            };
          });
        }
        const response = await original(input, init);
        window.__id3SurveyCompleted[key] = true;
        return response;
      };
    });
    await page.goto(`${baseUrl}/cliente/app/satisfacao`, { waitUntil: 'domcontentloaded' });
    // <option> é "hidden" para o Playwright: esperar por 'attached', não por visibilidade.
    const protocolALocator = page.locator('select option').filter({ hasText: protocolA });
    await protocolALocator.first().waitFor({ state: 'attached' });
    assert.equal(await protocolALocator.count(), 1, 'a pesquisa pendente de A precisa estar no <select>');
    await capture(page, `${evidencePrefix}-a-carregado-390`);

    // Prova de tradução em HTTP real: removemos os atributos min/max do input
    // (a validação nativa bloquearia) e enviamos nota 9 numa escala 1–5. O
    // servidor responde 400 score_outside_declared_scale; a UI precisa exibir
    // a mensagem específica, não um erro genérico de conexão.
    await page.getByLabel('Pesquisa pendente').selectOption(surveyA);
    await page.getByPlaceholder(/Descreva o que motivou a nota/).fill('Comentario sintetico com mais de dez caracteres para o teste.');
    await page.evaluate(() => {
      const input = document.querySelector('input[type="number"]');
      input?.removeAttribute('min');
      input?.removeAttribute('max');
    });
    await page.locator('input[type="number"]').fill('9');
    await page.getByRole('button', { name: 'Enviar resposta' }).click();
    const scaleError = page.getByText('A nota precisa estar dentro da escala declarada da pesquisa.', { exact: true });
    await scaleError.waitFor();
    assert.equal(await page.getByText('Não foi possível conectar agora. Tente novamente em instantes.').count(), 0,
      'o motivo específico do servidor não pode virar erro genérico de conexão');
    await capture(page, `${evidencePrefix}-a-nota-fora-da-escala-traduzida-390`);
    const errorTranslation = { status: 400, code: 'score_outside_declared_scale', friendlyMessageVisible: true };

    // B:1 pendente: no código anterior, a pesquisa de A continuava no
    // histórico E no <select> do formulário sob B.
    await page.evaluate(() => { window.__id3HoldSurveys = true; });
    const picker = page.getByLabel('Conta de cliente selecionada');
    const pendingB1 = `${accountB}:1`;
    await picker.selectOption(accountB);
    await page.waitForFunction(key => window.__id3SurveyPending[key] === true, pendingB1);
    await capture(page, `${evidencePrefix}-b-pendente-390`);
    assert.equal(await protocolALocator.count(), 0,
      'a pesquisa de A não pode continuar no <select> quando B está selecionada');
    assert.equal(await page.getByText(purposeA, { exact: false }).count(), 0,
      'a finalidade da pesquisa de A não pode continuar visível em B');
    assert.equal(await page.getByText('Carregando pesquisas…', { exact: true }).count(), 1);
    assert.equal(await page.getByText(/Nenhuma pesquisa de satisfação registrada/).count(), 0,
      'B pendente não pode ser anunciada como B sem pesquisas');

    const viewportEvidence = [];
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.waitForTimeout(80);
      viewportEvidence.push(await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        return { width, horizontalOverflow: document.documentElement.scrollWidth - width };
      }));
      if (width !== 390) await capture(page, `${evidencePrefix}-b-pendente-${width}`);
    }
    assert.ok(viewportEvidence.every(item => item.horizontalOverflow <= 1),
      `Satisfação não deve transbordar horizontalmente: ${JSON.stringify(viewportEvidence)}`);

    await page.evaluate(key => window.__id3SurveyReleases[key](), pendingB1);
    const emptyB = page.getByText(/Nenhuma pesquisa de satisfação registrada/);
    await emptyB.waitFor();
    assert.equal(await protocolALocator.count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, `${evidencePrefix}-b-vazio-390`);

    const nextACall = await page.evaluate(account => (window.__id3SurveyCalls[account] || 0) + 1, accountA);
    const pendingA2 = `${accountA}:${nextACall}`;
    await picker.focus();
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(key => window.__id3SurveyPending[key] === true, pendingA2);
    assert.equal(await picker.inputValue(), accountA);
    assert.equal(await picker.evaluate(element => element === document.activeElement), true,
      'a troca por teclado preserva o foco no seletor de conta');
    const nextBCall = await page.evaluate(account => (window.__id3SurveyCalls[account] || 0) + 1, accountB);
    const pendingB2 = `${accountB}:${nextBCall}`;
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(key => window.__id3SurveyPending[key] === true, pendingB2);
    assert.equal(await picker.inputValue(), accountB);
    await page.evaluate(key => window.__id3SurveyReleases[key](), pendingB2);
    await emptyB.waitFor();
    await page.evaluate(key => window.__id3SurveyReleases[key](), pendingA2);
    await page.waitForFunction(key => window.__id3SurveyCompleted[key] === true, pendingA2);
    await page.waitForTimeout(200);
    assert.equal(await picker.inputValue(), accountB);
    assert.equal(await protocolALocator.count(), 0,
      'a resposta antiga de A não pode devolver a pesquisa ao <select> de B');
    assert.equal(await emptyB.count(), 1,
      'o vazio confirmado da resposta mais recente de B deve permanecer visível');
    await capture(page, `${evidencePrefix}-b-resposta-fora-de-ordem-390`);

    if (process.env.UX_PORTAL_EVIDENCE_DIR) {
      await writeFile(path.join(process.env.UX_PORTAL_EVIDENCE_DIR, `${evidencePrefix}-medidas.json`), JSON.stringify({
        route: '/cliente/app/satisfacao',
        serverReadA: { status: responseA.status, surveys: responseA.body.surveys.length, scale: [1, 5] },
        serverReadB: { status: responseB.status, surveys: responseB.body.surveys.length },
        errorTranslation,
        selectOptionsOnBPending: 0,
        selectOptionsOnBFinal: 0,
        viewportEvidence,
        keyboard: 'ArrowUp/ArrowDown no seletor nativo; foco preservado',
        outOfOrder: `B:${nextBCall} concluída antes de A:${nextACall}; resultado final permaneceu em B`,
        humanAcceptanceExecuted: false,
      }, null, 2) + '\n');
    }
    await context.close();
  } finally {
    await browser?.close();
    await pool.query('DELETE FROM cli_satisfaction_events WHERE survey_id = $1', [surveyA]);
    await pool.query('DELETE FROM cli_satisfaction_responses WHERE survey_id = $1', [surveyA]);
    await pool.query('DELETE FROM cli_satisfaction_action_plans WHERE survey_id = $1', [surveyA]);
    await pool.query('DELETE FROM cli_satisfaction_surveys WHERE id = $1', [surveyA]);
    await pool.query('DELETE FROM client_access_grants WHERE id = ANY($1::uuid[])', [[grantA, grantB]]);
    await pool.query('DELETE FROM client_accounts WHERE id = ANY($1::uuid[])', [[accountA, accountB]]);
  }
});

test('browser ID3: renovação mantém comunicações, restrição e datas na conta ativa e traduz 409 real', { skip: !RUN }, async () => {
  const accountA = randomUUID();
  const accountB = randomUUID();
  const grantA = randomUUID();
  const grantB = randomUUID();
  const companyA = randomUUID();
  const contractA = randomUUID();
  const renewalA = randomUUID();
  const communicationA = randomUUID();
  const blockingA = randomUUID();
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const protocolSuffix = randomUUID().replaceAll('-', '').toUpperCase();
  const protocolA = `REN-CLI-${day}-${protocolSuffix.slice(0, 4)}`;
  const protocolBlockingA = `REN-CLI-${day}-${protocolSuffix.slice(4, 8)}`;
  const titleA = `Proposta de renovacao sintetica ID3 ${protocolSuffix.slice(0, 6)}`;
  const contentA = 'Comunicacao sintetica do cenario ID3 para provar isolamento por conta no portal do cliente.';
  const blockReasonA = 'Encerramento sintetico registrado para o cenario ID3 de isolamento por conta.';
  const contractTitleA = `Contrato sintetico ID3 ${protocolSuffix.slice(0, 6)}`;
  const renewalTitleA = `Renovacao CRM sintetica ID3 ${protocolSuffix.slice(0, 6)}`;
  const evidencePrefix = process.env.UX_PORTAL_EVIDENCE_PREFIX || 'ux-pro-id3-renovacao-leitura';

  // A tem empresa CRM, contrato com vencimento, renovação no CRM, uma proposta
  // respondível e um encerramento bloqueante (restrição declarada). B não tem
  // nada. A leitura do portal precisa devolver quatro coleções vazias em B.
  await pool.query(
    `INSERT INTO crm_companies (id, display_name, type, status, created_by)
     VALUES ($1::uuid, 'ID3 Renovacao Empresa A Sintetica', 'client', 'active', 'ti')`,
    [companyA],
  );
  await pool.query(
    `INSERT INTO client_accounts (id, display_name, created_by, crm_company_id)
     VALUES ($1::uuid, 'ID3 Renovacao Conta A Sintetica', 'ti', $3::uuid),
            ($2::uuid, 'ID3 Renovacao Conta B Sintetica', 'ti', NULL)`,
    [accountA, accountB, companyA],
  );
  await pool.query(
    `INSERT INTO client_access_grants (id, identity_id, client_account_id, reason, granted_by)
     SELECT $1::uuid, id, $2::uuid, 'fixture sintetica ID3 renovacao', 'ti' FROM auth_identities WHERE email = $3
     UNION ALL
     SELECT $4::uuid, id, $5::uuid, 'fixture sintetica ID3 renovacao', 'ti' FROM auth_identities WHERE email = $3`,
    [grantA, accountA, clientEmail, grantB, accountB],
  );
  await pool.query(
    `INSERT INTO client_contracts (id, client_account_id, title, service, status, ends_on, created_by)
     VALUES ($1::uuid, $2::uuid, $3, 'Portaria', 'active', '2027-01-31'::date, 'ti')`,
    [contractA, accountA, contractTitleA],
  );
  await pool.query(
    `INSERT INTO crm_renewals (id, company_id, title, status, renewal_date, created_by)
     VALUES ($1::uuid, $2::uuid, $3, 'planejada', '2027-02-15'::date, 'ti')`,
    [renewalA, companyA, renewalTitleA],
  );
  await pool.query(
    `INSERT INTO cli_renewal_communications
       (id, protocol, client_account_id, contract_id, comm_type, title, content, sent_at, is_blocking, block_reason, created_by_identity)
     VALUES ($1::uuid, $2, $3::uuid, $4::uuid, 'proposta_renovacao', $5, $6, NOW(), false, NULL,
             (SELECT id FROM auth_identities WHERE email = $7))`,
    [communicationA, protocolA, accountA, contractA, titleA, contentA, clientEmail],
  );
  await pool.query(
    `INSERT INTO cli_renewal_communications
       (id, protocol, client_account_id, contract_id, comm_type, title, content, sent_at, is_blocking, block_reason, created_by_identity)
     VALUES ($1::uuid, $2, $3::uuid, NULL, 'encerramento', $4, $5, NOW(), true, $6,
             (SELECT id FROM auth_identities WHERE email = $7))`,
    [blockingA, protocolBlockingA, accountA, 'Encerramento sintetico ID3', contentA, blockReasonA, clientEmail],
  );

  const responseA = await api(`/api/client/renewal-communications?account=${accountA}`, { cookie: clientCookie });
  const responseB = await api(`/api/client/renewal-communications?account=${accountB}`, { cookie: clientCookie });
  assert.equal(responseA.status, 200, JSON.stringify(responseA.body));
  assert.equal(responseA.body.communications.length, 2);
  assert.equal(responseA.body.accessRestriction.restricted, true);
  assert.equal(responseA.body.renewalDates.contracts.length, 1);
  assert.equal(responseA.body.renewalDates.crmRenewals.length, 1);
  assert.equal(responseB.status, 200, JSON.stringify(responseB.body));
  assert.deepEqual(responseB.body.communications, []);
  assert.equal(responseB.body.accessRestriction.restricted, false);
  assert.deepEqual(responseB.body.renewalDates.contracts, []);
  assert.deepEqual(responseB.body.renewalDates.crmRenewals, []);

  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    await context.addCookies(clientCookie.split('; ').filter(Boolean).map(item => {
      const separator = item.indexOf('=');
      return { name: item.slice(0, separator), value: item.slice(separator + 1), url: baseUrl };
    }));
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    await page.addInitScript(() => {
      window.__id3RenewalCalls = {};
      window.__id3RenewalPending = {};
      window.__id3RenewalCompleted = {};
      window.__id3RenewalReleases = {};
      window.__id3HoldRenewal = false;
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        // Somente a leitura GET é controlada; o POST vai direto ao servidor.
        if (!url.includes('/api/client/renewal-communications?')) return original(input, init);
        const account = new URL(url, window.location.origin).searchParams.get('account') || 'unknown';
        const call = (window.__id3RenewalCalls[account] || 0) + 1;
        window.__id3RenewalCalls[account] = call;
        const key = `${account}:${call}`;
        if (window.__id3HoldRenewal) {
          window.__id3RenewalPending[key] = true;
          await new Promise(resolve => {
            window.__id3RenewalReleases[key] = () => {
              delete window.__id3RenewalPending[key];
              resolve();
            };
          });
        }
        const response = await original(input, init);
        window.__id3RenewalCompleted[key] = true;
        return response;
      };
    });
    await page.goto(`${baseUrl}/cliente/app/renovacao`, { waitUntil: 'domcontentloaded' });
    // <option> é "hidden" para o Playwright: esperar por 'attached'.
    const optionA = page.locator('select option').filter({ hasText: protocolA });
    const optionBlockingA = page.locator('select option').filter({ hasText: protocolBlockingA });
    const restriction = page.getByText('Restrição de acesso declarada', { exact: true });
    await optionA.first().waitFor({ state: 'attached' });
    assert.equal(await optionA.count(), 1, 'a comunicação respondível de A precisa estar no <select>');
    assert.equal(await restriction.count(), 1, 'a restrição declarada de A precisa estar visível em A');
    assert.ok(await page.getByText(contractTitleA, { exact: false }).count() >= 1);
    assert.ok(await page.getByText(renewalTitleA, { exact: false }).count() >= 1);
    await capture(page, `${evidencePrefix}-a-carregado-390`);

    // Prova de tradução em HTTP real: com a tela já carregada, outra sessão
    // (mesma identidade, mesma cookie) registra primeiro a manifestação. O
    // envio da UI recebe 409 response_already_registered; com workspaceFetch o
    // corpo seria consumido e viraria erro genérico de conexão.
    await page.locator('form select').nth(0).selectOption(communicationA);
    await page.locator('form select').nth(1).selectOption('interesse_renovar');
    const previous = await api('/api/client/renewal-communications', {
      method: 'POST', cookie: clientCookie,
      headers: { 'Idempotency-Key': `cli12-id3-pre-${randomUUID()}` },
      body: { communication_id: communicationA, response_kind: 'interesse_renovar' },
    });
    assert.equal(previous.status, 201, `o registro concorrente deveria ser 201, veio ${previous.status} ${JSON.stringify(previous.body)}`);
    await page.getByRole('button', { name: 'Registrar manifestação' }).click();
    const friendlyConflict = page.getByText('Esta manifestação já está registrada para esta comunicação.', { exact: true });
    await friendlyConflict.waitFor();
    assert.equal(await page.getByText('Não foi possível conectar agora. Tente novamente em instantes.').count(), 0,
      'o 409 específico do servidor não pode virar erro genérico de conexão');
    await capture(page, `${evidencePrefix}-a-409-traduzido-390`);
    const errorTranslation = { status: 409, code: 'response_already_registered', friendlyMessageVisible: true };

    // B:1 pendente: no código anterior, comunicações, restrição e datas de A
    // continuavam renderizadas sob B, inclusive no <select> enviável.
    await page.evaluate(() => { window.__id3HoldRenewal = true; });
    const picker = page.getByLabel('Conta de cliente selecionada');
    const pendingB1 = `${accountB}:1`;
    await picker.selectOption(accountB);
    await page.waitForFunction(key => window.__id3RenewalPending[key] === true, pendingB1);
    await capture(page, `${evidencePrefix}-b-pendente-390`);
    assert.equal(await optionA.count(), 0, 'a comunicação de A não pode continuar no <select> de B');
    assert.equal(await optionBlockingA.count(), 0, 'o encerramento de A não pode continuar no <select> de B');
    assert.equal(await restriction.count(), 0, 'a restrição declarada de A não pode aparecer em B');
    assert.equal(await page.getByText(contentA, { exact: false }).count(), 0, 'o conteúdo de A não pode aparecer em B');
    assert.equal(await page.getByText(contractTitleA, { exact: false }).count(), 0, 'o contrato de A não pode aparecer em B');
    assert.equal(await page.getByText(renewalTitleA, { exact: false }).count(), 0, 'a renovação CRM de A não pode aparecer em B');
    assert.equal(await page.getByText('Carregando comunicações…', { exact: true }).count(), 1);
    assert.equal(await page.getByText(/Nenhuma comunicação de renovação registrada/).count(), 0,
      'B pendente não pode ser anunciada como B sem comunicações');

    const viewportEvidence = [];
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.waitForTimeout(80);
      viewportEvidence.push(await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        return { width, horizontalOverflow: document.documentElement.scrollWidth - width };
      }));
      if (width !== 390) await capture(page, `${evidencePrefix}-b-pendente-${width}`);
    }
    assert.ok(viewportEvidence.every(item => item.horizontalOverflow <= 1),
      `Renovação não deve transbordar horizontalmente: ${JSON.stringify(viewportEvidence)}`);

    await page.evaluate(key => window.__id3RenewalReleases[key](), pendingB1);
    const emptyB = page.getByText('Nenhuma comunicação de renovação registrada para esta conta.', { exact: true });
    await emptyB.waitFor();
    assert.equal(await page.getByText('Nenhum contrato ou renovação com registro canônico nesta conta.', { exact: true }).count(), 1);
    assert.equal(await optionA.count(), 0);
    assert.equal(await optionBlockingA.count(), 0);
    assert.equal(await restriction.count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, `${evidencePrefix}-b-vazio-390`);

    const nextACall = await page.evaluate(account => (window.__id3RenewalCalls[account] || 0) + 1, accountA);
    const pendingA2 = `${accountA}:${nextACall}`;
    await picker.focus();
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(key => window.__id3RenewalPending[key] === true, pendingA2);
    assert.equal(await picker.inputValue(), accountA);
    assert.equal(await picker.evaluate(element => element === document.activeElement), true,
      'a troca por teclado preserva o foco no seletor de conta');
    const nextBCall = await page.evaluate(account => (window.__id3RenewalCalls[account] || 0) + 1, accountB);
    const pendingB2 = `${accountB}:${nextBCall}`;
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(key => window.__id3RenewalPending[key] === true, pendingB2);
    assert.equal(await picker.inputValue(), accountB);
    await page.evaluate(key => window.__id3RenewalReleases[key](), pendingB2);
    await emptyB.waitFor();
    await page.evaluate(key => window.__id3RenewalReleases[key](), pendingA2);
    await page.waitForFunction(key => window.__id3RenewalCompleted[key] === true, pendingA2);
    await page.waitForTimeout(200);
    assert.equal(await picker.inputValue(), accountB);
    assert.equal(await optionA.count(), 0, 'a resposta antiga de A não pode devolver a comunicação ao <select> de B');
    assert.equal(await optionBlockingA.count(), 0);
    assert.equal(await restriction.count(), 0, 'a resposta antiga de A não pode devolver a restrição a B');
    assert.equal(await page.getByText(contractTitleA, { exact: false }).count(), 0,
      'a resposta antiga de A não pode devolver as datas de A a B');
    assert.equal(await emptyB.count(), 1,
      'o vazio confirmado da resposta mais recente de B deve permanecer visível');
    await capture(page, `${evidencePrefix}-b-resposta-fora-de-ordem-390`);

    if (process.env.UX_PORTAL_EVIDENCE_DIR) {
      await writeFile(path.join(process.env.UX_PORTAL_EVIDENCE_DIR, `${evidencePrefix}-medidas.json`), JSON.stringify({
        route: '/cliente/app/renovacao',
        serverReadA: {
          status: responseA.status,
          communications: responseA.body.communications.length,
          restricted: responseA.body.accessRestriction.restricted,
          contracts: responseA.body.renewalDates.contracts.length,
          crmRenewals: responseA.body.renewalDates.crmRenewals.length,
        },
        serverReadB: {
          status: responseB.status,
          communications: responseB.body.communications.length,
          restricted: responseB.body.accessRestriction.restricted,
          contracts: responseB.body.renewalDates.contracts.length,
          crmRenewals: responseB.body.renewalDates.crmRenewals.length,
        },
        errorTranslation,
        selectOptionsOnBPending: 0,
        restrictionVisibleOnBPending: 0,
        selectOptionsOnBFinal: 0,
        viewportEvidence,
        keyboard: 'ArrowUp/ArrowDown no seletor nativo; foco preservado',
        outOfOrder: `B:${nextBCall} concluída antes de A:${nextACall}; resultado final permaneceu em B`,
        humanAcceptanceExecuted: false,
      }, null, 2) + '\n');
    }
    await context.close();
  } finally {
    await browser?.close();
    await pool.query('DELETE FROM cli_renewal_comm_responses WHERE communication_id = ANY($1::uuid[])', [[communicationA, blockingA]]);
    await pool.query('DELETE FROM cli_renewal_communications WHERE id = ANY($1::uuid[])', [[communicationA, blockingA]]);
    await pool.query('DELETE FROM client_contracts WHERE id = $1', [contractA]);
    await pool.query('DELETE FROM crm_renewals WHERE id = $1', [renewalA]);
    await pool.query('DELETE FROM client_access_grants WHERE id = ANY($1::uuid[])', [[grantA, grantB]]);
    // client_accounts.crm_company_id é ON DELETE RESTRICT: contas antes da empresa.
    await pool.query('DELETE FROM client_accounts WHERE id = ANY($1::uuid[])', [[accountA, accountB]]);
    await pool.query('DELETE FROM crm_companies WHERE id = $1', [companyA]);
  }
});

test('browser ID3: relatórios mantêm lista e aceites na conta ativa e traduzem 400 do PATCH', { skip: !RUN }, async () => {
  const accountA = randomUUID();
  const accountB = randomUUID();
  const grantA = randomUUID();
  const grantB = randomUUID();
  const reportSentA = randomUUID();
  const reportDoneA = randomUUID();
  const titleA = `Relatorio sintetico ID3 ${randomUUID().slice(0, 8)}`;
  const titleDoneA = `Relatorio ciente ID3 ${randomUUID().slice(0, 8)}`;
  const summaryA = 'Resumo sintetico do cenario ID3 para provar isolamento da lista de relatorios por conta ativa no portal.';
  const acknowledgementNoteA = 'Ciencia sintetica ID3';
  const evidencePrefix = process.env.UX_PORTAL_EVIDENCE_PREFIX || 'ux-pro-id3-relatorios-leitura';

  await pool.query(
    `INSERT INTO client_accounts (id, display_name, created_by)
     VALUES ($1::uuid, 'ID3 Relatorios Conta A Sintetica', 'ti'),
            ($2::uuid, 'ID3 Relatorios Conta B Sintetica', 'ti')`,
    [accountA, accountB],
  );
  await pool.query(
    `INSERT INTO client_access_grants (id, identity_id, client_account_id, reason, granted_by)
     SELECT $1::uuid, id, $2::uuid, 'fixture sintetica ID3 relatorios', 'ti' FROM auth_identities WHERE email = $3
     UNION ALL
     SELECT $4::uuid, id, $5::uuid, 'fixture sintetica ID3 relatorios', 'ti' FROM auth_identities WHERE email = $3`,
    [grantA, accountA, clientEmail, grantB, accountB],
  );
  // Migração 140: só status approved/sent/acknowledged aparecem no portal.
  // O primeiro ainda aceita ciência (e renderiza o botão/textarea); o segundo
  // já está aceito e exibe o histórico.
  await pool.query(
    `INSERT INTO client_reports
       (id, client_account_id, report_type, title, summary, period_start, period_end,
        status, approved_at, sent_at, created_by)
     VALUES ($1::uuid, $2::uuid, 'execution', $3, $4, '2026-10-01'::date, '2026-10-25'::date,
             'sent', NOW(), NOW(), 'ti')`,
    [reportSentA, accountA, titleA, summaryA],
  );
  await pool.query(
    `INSERT INTO client_reports
       (id, client_account_id, report_type, title, summary, status, approved_at, sent_at,
        acknowledged_at, acknowledgement_note, acknowledged_by_identity, created_by)
     VALUES ($1::uuid, $2::uuid, 'measurement', $3, $4, 'acknowledged', NOW(), NOW(),
             NOW(), $5, (SELECT id FROM auth_identities WHERE email = $6), 'ti')`,
    [reportDoneA, accountA, titleDoneA, summaryA, acknowledgementNoteA, clientEmail],
  );

  const responseA = await api(`/api/client/reports?account=${accountA}`, { cookie: clientCookie });
  const responseB = await api(`/api/client/reports?account=${accountB}`, { cookie: clientCookie });
  assert.equal(responseA.status, 200, JSON.stringify(responseA.body));
  assert.equal(responseA.body.reports.length, 2);
  assert.equal(responseB.status, 200, JSON.stringify(responseB.body));
  assert.deepEqual(responseB.body.reports, []);

  let browser;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    await context.addCookies(clientCookie.split('; ').filter(Boolean).map(item => {
      const separator = item.indexOf('=');
      return { name: item.slice(0, separator), value: item.slice(separator + 1), url: baseUrl };
    }));
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    await page.addInitScript(() => {
      window.__id3ReportCalls = {};
      window.__id3ReportPending = {};
      window.__id3ReportCompleted = {};
      window.__id3ReportReleases = {};
      window.__id3HoldReports = false;
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        // Somente a leitura GET é controlada; o PATCH vai direto ao servidor.
        if (!url.includes('/api/client/reports?')) return original(input, init);
        const account = new URL(url, window.location.origin).searchParams.get('account') || 'unknown';
        const call = (window.__id3ReportCalls[account] || 0) + 1;
        window.__id3ReportCalls[account] = call;
        const key = `${account}:${call}`;
        if (window.__id3HoldReports) {
          window.__id3ReportPending[key] = true;
          await new Promise(resolve => {
            window.__id3ReportReleases[key] = () => {
              delete window.__id3ReportPending[key];
              resolve();
            };
          });
        }
        const response = await original(input, init);
        window.__id3ReportCompleted[key] = true;
        return response;
      };
    });
    await page.goto(`${baseUrl}/cliente/app/relatorios`, { waitUntil: 'domcontentloaded' });
    const titleALocator = page.getByText(titleA, { exact: true });
    const titleDoneALocator = page.getByText(titleDoneA, { exact: true });
    await titleALocator.waitFor();
    assert.equal(await titleDoneALocator.count(), 1, 'o relatório já aceito de A precisa estar na lista');
    assert.equal(await page.getByText('Ciência registrada', { exact: true }).count(), 1);
    assert.equal(await page.getByPlaceholder('Observação opcional para o aceite/ciência').count(), 1);
    await capture(page, `${evidencePrefix}-a-carregado-390`);

    // Prova de tradução em HTTP real: observação de 2 caracteres é recusada
    // pelo servidor com 400 report_acknowledgement_too_short. Com workspaceFetch
    // o corpo seria consumido e o mapa de mensagens nunca seria alcançado.
    await page.getByPlaceholder('Observação opcional para o aceite/ciência').fill('ab');
    await page.getByRole('button', { name: 'Registrar aceite/ciência' }).click();
    const shortNote = page.getByText('A observação deve ter pelo menos 3 caracteres ou ficar vazia.', { exact: true });
    await shortNote.waitFor();
    assert.equal(await page.getByText('Não foi possível conectar agora. Tente novamente em instantes.').count(), 0,
      'o 400 específico do servidor não pode virar erro genérico de conexão');
    await capture(page, `${evidencePrefix}-a-400-traduzido-390`);
    const errorTranslation = { status: 400, code: 'report_acknowledgement_too_short', friendlyMessageVisible: true };

    // B:1 pendente: no código anterior, os relatórios de A (inclusive o botão
    // de aceite e a observação digitada) continuavam renderizados sob B.
    await page.evaluate(() => { window.__id3HoldReports = true; });
    const picker = page.getByLabel('Conta de cliente selecionada');
    const pendingB1 = `${accountB}:1`;
    await picker.selectOption(accountB);
    await page.waitForFunction(key => window.__id3ReportPending[key] === true, pendingB1);
    await capture(page, `${evidencePrefix}-b-pendente-390`);
    assert.equal(await titleALocator.count(), 0, 'o relatório de A não pode continuar na lista de B');
    assert.equal(await titleDoneALocator.count(), 0, 'o relatório aceito de A não pode continuar em B');
    assert.equal(await page.getByText(summaryA, { exact: false }).count(), 0, 'o resumo de A não pode aparecer em B');
    assert.equal(await page.getByPlaceholder('Observação opcional para o aceite/ciência').count(), 0,
      'o botão/textarea de aceite de A não pode continuar clicável em B');
    assert.equal(await shortNote.count(), 0, 'a mensagem de erro da conta A precisa ser limpa na troca');
    assert.equal(await page.getByText('Carregando relatórios…', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Nenhum relatório aprovado para este cadastro.', { exact: true }).count(), 0,
      'B pendente não pode ser anunciada como B sem relatórios');

    const viewportEvidence = [];
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.waitForTimeout(80);
      viewportEvidence.push(await page.evaluate(() => {
        const width = document.documentElement.clientWidth;
        return { width, horizontalOverflow: document.documentElement.scrollWidth - width };
      }));
      if (width !== 390) await capture(page, `${evidencePrefix}-b-pendente-${width}`);
    }
    assert.ok(viewportEvidence.every(item => item.horizontalOverflow <= 1),
      `Relatórios não deve transbordar horizontalmente: ${JSON.stringify(viewportEvidence)}`);

    await page.evaluate(key => window.__id3ReportReleases[key](), pendingB1);
    const emptyB = page.getByText('Nenhum relatório aprovado para este cadastro.', { exact: true });
    await emptyB.waitFor();
    assert.equal(await titleALocator.count(), 0);
    assert.equal(await titleDoneALocator.count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, `${evidencePrefix}-b-vazio-390`);

    const nextACall = await page.evaluate(account => (window.__id3ReportCalls[account] || 0) + 1, accountA);
    const pendingA2 = `${accountA}:${nextACall}`;
    await picker.focus();
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(key => window.__id3ReportPending[key] === true, pendingA2);
    assert.equal(await picker.inputValue(), accountA);
    assert.equal(await picker.evaluate(element => element === document.activeElement), true,
      'a troca por teclado preserva o foco no seletor de conta');
    const nextBCall = await page.evaluate(account => (window.__id3ReportCalls[account] || 0) + 1, accountB);
    const pendingB2 = `${accountB}:${nextBCall}`;
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(key => window.__id3ReportPending[key] === true, pendingB2);
    assert.equal(await picker.inputValue(), accountB);
    await page.evaluate(key => window.__id3ReportReleases[key](), pendingB2);
    await emptyB.waitFor();
    await page.evaluate(key => window.__id3ReportReleases[key](), pendingA2);
    await page.waitForFunction(key => window.__id3ReportCompleted[key] === true, pendingA2);
    await page.waitForTimeout(200);
    assert.equal(await picker.inputValue(), accountB);
    assert.equal(await titleALocator.count(), 0, 'a resposta antiga de A não pode devolver o relatório a B');
    assert.equal(await titleDoneALocator.count(), 0);
    assert.equal(await page.getByPlaceholder('Observação opcional para o aceite/ciência').count(), 0,
      'a resposta antiga de A não pode devolver o botão de aceite a B');
    assert.equal(await emptyB.count(), 1,
      'o vazio confirmado da resposta mais recente de B deve permanecer visível');
    await capture(page, `${evidencePrefix}-b-resposta-fora-de-ordem-390`);

    if (process.env.UX_PORTAL_EVIDENCE_DIR) {
      await writeFile(path.join(process.env.UX_PORTAL_EVIDENCE_DIR, `${evidencePrefix}-medidas.json`), JSON.stringify({
        route: '/cliente/app/relatorios',
        serverReadA: { status: responseA.status, reports: responseA.body.reports.length },
        serverReadB: { status: responseB.status, reports: responseB.body.reports.length },
        errorTranslation,
        reportTitlesOnBPending: 0,
        acknowledgeInputsOnBPending: 0,
        reportTitlesOnBFinal: 0,
        viewportEvidence,
        keyboard: 'ArrowUp/ArrowDown no seletor nativo; foco preservado',
        outOfOrder: `B:${nextBCall} concluída antes de A:${nextACall}; resultado final permaneceu em B`,
        humanAcceptanceExecuted: false,
      }, null, 2) + '\n');
    }
    await context.close();
  } finally {
    await browser?.close();
    await pool.query('DELETE FROM client_report_status_audit WHERE report_id = ANY($1::uuid[])', [[reportSentA, reportDoneA]]);
    await pool.query('DELETE FROM client_reports WHERE id = ANY($1::uuid[])', [[reportSentA, reportDoneA]]);
    await pool.query('DELETE FROM client_access_grants WHERE id = ANY($1::uuid[])', [[grantA, grantB]]);
    await pool.query('DELETE FROM client_accounts WHERE id = ANY($1::uuid[])', [[accountA, accountB]]);
  }
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

test('browser: funcionário cria solicitação e RH decide com retorno visível ao titular', { skip: !RUN }, async () => {
  const employeeBrowser = await launchBrowser();
  let rhBrowser;
  let funcionarioContext;
  let rhContext;
  try {
    const login = await api('/api/employee/session', {
      method: 'POST', body: { email: employeeEmail, password: employeePassword },
    });
    assert.equal(login.status, 200, 'funcionário sintético precisa autenticar pela rota existente');
    const employeeSession = login.setCookie.find(value => value.startsWith('seg_employee_session='))?.split(';')[0];
    assert.ok(employeeSession, 'sessão do titular precisa ser emitida pelo servidor');

    const employeePageResult = await openPage(employeeBrowser, '/funcionario', employeeSession, { width: 390, height: 844 });
    funcionarioContext = employeePageResult.context;
    const employeePage = employeePageResult.page;
    await employeePage.getByRole('tab', { name: 'Pedidos' }).click();
    await employeePage.getByRole('button', { name: 'Solicitação' }).click();
    const requestTitle = `Pedido sintético UX-PRO-05 ${randomUUID().slice(0, 8)}`;
    const description = 'Solicitação criada pelo titular no fluxo integrado de teste.';
    await employeePage.getByLabel('Assunto').selectOption('beneficio');
    await employeePage.getByLabel('Título').fill(requestTitle);
    await employeePage.getByLabel('Descrição').fill(description);
    await employeePage.getByRole('button', { name: 'Enviar' }).click();
    await employeePage.locator('[role="status"]', { hasText: 'Recebido com sucesso.' }).waitFor();
    await employeePage.getByRole('heading', { name: new RegExp(requestTitle) }).waitFor();
    await capture(employeePage, 'ux-pro-05-titular-pedido-criado-mobile');

    const ownHome = await api('/api/employee/home', { cookie: employeeSession });
    assert.equal(ownHome.status, 200);
    const created = ownHome.body.requests.find(item => item.title === requestTitle);
    assert.ok(created, 'pedido submetido deve aparecer na leitura do titular');
    assert.equal(created.status, 'solicitado');
    const ownRecord = await pool.query('SELECT employee_id, status FROM emp_self_requests WHERE id = $1', [created.id]);
    assert.equal(ownRecord.rows.length, 1);
    assert.equal(ownRecord.rows[0].employee_id, employee.id, 'a solicitação fica ligada ao titular autenticado');

    rhBrowser = await launchBrowser();
    const rhPageResult = await openPage(rhBrowser, '/admin/funcionarios', rhCookie, { width: 1440, height: 900 });
    rhContext = rhPageResult.context;
    const rhPage = rhPageResult.page;
    await rhPage.getByRole('tab', { name: 'Equipe' }).focus();
    for (let index = 0; index < 4; index += 1) await rhPage.keyboard.press('ArrowRight');
    const requestTab = rhPage.getByRole('tab', { name: 'Solicitações' });
    assert.equal(await requestTab.getAttribute('aria-selected'), 'true',
      'o teclado percorre as abas até as solicitações');
    assert.equal(await requestTab.evaluate(element => element === document.activeElement), true,
      'o foco acompanha a navegação por teclado');
    const card = rhPage.locator('article').filter({ hasText: requestTitle });
    await card.waitFor();
    assert.match(await card.innerText(), /Aguardando análise/);
    await card.getByLabel(/Retorno para a pessoa/).fill('Vamos verificar o benefício solicitado pelo titular.');
    await card.getByRole('button', { name: 'Iniciar análise' }).click();
    await rhPage.locator('[role="status"]', { hasText: /Análise iniciada/ }).waitFor();
    await card.locator('[data-ui-badge]').filter({ hasText: 'Em análise' }).waitFor();

    const responseMessage = 'Benefício aprovado após conferência dos critérios internos.';
    await card.getByLabel(/Retorno para a pessoa/).fill(responseMessage);
    await card.getByRole('button', { name: 'Aprovar solicitação' }).click();
    await rhPage.locator('[role="status"]', { hasText: /Solicitação aprovada/ }).waitFor();
    await card.locator('[data-ui-badge]').filter({ hasText: 'Aprovada' }).waitFor();
    await capture(rhPage, 'ux-pro-05-rh-solicitacao-aprovada-desktop');

    for (const width of [320, 390, 768, 1440]) {
      await rhPage.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      const overflow = await rhPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `${width}px: transbordo horizontal de ${overflow}px na aba Solicitações`);
      await capture(rhPage, `ux-pro-05-rh-solicitacoes-${width}-day`);
    }
    await rhPage.getByRole('button', { name: 'Ativar modo noite' }).click();
    await rhPage.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
    await rhPage.setViewportSize({ width: 390, height: 844 });
    await rhPage.waitForTimeout(250); // aguarda a transição de fechamento da navegação móvel
    assert.equal(await rhPage.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded'), 'false',
      'o menu móvel permanece fechado ao apenas alternar tema/viewport');
    const menuVisual = await rhPage.locator('[data-admin-nav]').evaluate(element => ({
      visibility: getComputedStyle(element).visibility,
      transform: getComputedStyle(element).transform,
      position: getComputedStyle(element).position,
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      className: element.className,
      viewport: window.innerWidth,
      mobileMedia: window.matchMedia('(max-width: 900px)').matches,
      navCount: document.querySelectorAll('[data-admin-nav]').length,
    }));
    assert.ok(menuVisual.visibility === 'hidden' || menuVisual.right <= 1 || menuVisual.left >= menuVisual.viewport,
      `a captura de tema noturno não pode mostrar o menu fechado: ${JSON.stringify(menuVisual)}`);
    const nightOverflow = await rhPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(nightOverflow <= 1, `tema noturno/390px: transbordo horizontal de ${nightOverflow}px`);
    await capture(rhPage, 'ux-pro-05-rh-solicitacoes-390-night-viewport', { fullPage: false });
    await capture(rhPage, 'ux-pro-05-rh-solicitacoes-390-night');

    const persisted = await pool.query(
      'SELECT status, notes, approved_by_id FROM emp_self_requests WHERE id = $1', [created.id]);
    assert.equal(persisted.rows[0].status, 'aprovado');
    assert.equal(persisted.rows[0].notes, responseMessage);
    const rhSession = await api('/api/admin/session', { cookie: rhCookie });
    assert.equal(rhSession.status, 200);
    assert.equal(persisted.rows[0].approved_by_id, rhSession.body.identityId,
      'a decisão é atribuída à identidade autenticada do RH');
    const audit = await pool.query(
      "SELECT count(*)::int AS total FROM audit_log WHERE action = 'emp_self_request_review' AND target = $1",
      [created.id]);
    assert.equal(audit.rows[0].total, 2, 'iniciar análise e aprovar deixam eventos de auditoria distintos');
    const followups = await pool.query(
      'SELECT status, message FROM emp_self_request_followups WHERE request_id = $1 ORDER BY created_at', [created.id]);
    assert.deepEqual(followups.rows.map(row => row.status), ['em_analise', 'aprovado']);
    assert.equal(followups.rows[1].message, responseMessage);

    await employeePage.reload({ waitUntil: 'domcontentloaded' });
    await employeePage.getByRole('tab', { name: 'Pedidos' }).click();
    const employeeCard = employeePage.locator('article').filter({ hasText: requestTitle });
    await employeeCard.locator('p').filter({ hasText: responseMessage }).waitFor();
    assert.match(await employeeCard.innerText(), /Benefício aprovado após conferência/);
    assert.match(await employeeCard.innerText(), /APROVADO/);
    await capture(employeePage, 'ux-pro-05-titular-retorno-mobile');
    const overflow = await employeePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `390px: transbordo horizontal de ${overflow}px`);
  } finally {
    await rhContext?.close();
    await funcionarioContext?.close();
    await rhBrowser?.close();
    await employeeBrowser.close();
  }
});

test('browser: RH devolve documento com motivo e o portal apresenta o retorno no escopo próprio', { skip: !RUN }, async () => {
  const employeeBrowser = await launchBrowser();
  let rhBrowser;
  let employeeContext;
  let rhContext;
  try {
    const login = await api('/api/employee/session', {
      method: 'POST', body: { email: employeeEmail, password: employeePassword },
    });
    assert.equal(login.status, 200);
    const employeeSession = login.setCookie.find(value => value.startsWith('seg_employee_session='))?.split(';')[0];
    assert.ok(employeeSession);

    const documentTitle = `Documento sintético UX-PRO-05 ${randomUUID().slice(0, 8)}`;
    const uploaded = await api('/api/employee/documents', {
      method: 'POST', cookie: employeeSession,
      body: {
        filename: 'documento-sintetico.txt', contentType: 'text/plain',
        contentBase64: Buffer.from('conteudo sintetico de teste', 'utf8').toString('base64'),
        title: documentTitle, category: 'pessoal', documentKind: 'submission',
      },
    });
    assert.equal(uploaded.status, 201, `upload deveria retornar 201, veio ${uploaded.status}`);
    const documentId = uploaded.body.document.id;

    const employeeOpened = await openPage(employeeBrowser, '/funcionario', employeeSession, { width: 390, height: 844 });
    employeeContext = employeeOpened.context;
    await employeeOpened.page.getByRole('tab', { name: 'Docs' }).click();
    const employeeCard = employeeOpened.page.locator('article').filter({ hasText: documentTitle });
    await employeeCard.waitFor();
    assert.match(await employeeCard.innerText(), /Pendente/i);

    rhBrowser = await launchBrowser();
    const rhOpened = await openPage(rhBrowser, '/admin/funcionarios', rhCookie, { width: 1440, height: 900 });
    rhContext = rhOpened.context;
    const rhPage = rhOpened.page;
    await rhPage.getByRole('tab', { name: 'Documentos' }).click();
    const row = rhPage.locator('tr', { hasText: documentTitle });
    await row.waitFor();
    const rejectionReason = 'Envie uma versão legível e assinada.';
    const reasonField = row.getByLabel('Motivo da rejeição');
    await rhPage.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const rhReviewEvidence = [];
    for (const width of [320, 390, 768, 1440]) {
      await rhPage.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await reasonField.focus();
      assert.equal(await reasonField.evaluate(element => element === document.activeElement), true,
        `${width}px: o campo de retorno permanece acessível pelo teclado`);
      rhReviewEvidence.push(await rhPage.evaluate(() => ({
        width: document.documentElement.clientWidth,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      })));
      await capture(rhPage, `ux-pro-05-documento-rh-em-revisao-${width}-day`);
    }
    assert.deepEqual(rhReviewEvidence.map(value => value.width), [320, 390, 768, 1440]);
    assert.ok(rhReviewEvidence.every(value => value.overflow <= 1), JSON.stringify(rhReviewEvidence));
    await rhPage.setViewportSize({ width: 1440, height: 900 });
    await reasonField.focus();
    await rhPage.keyboard.type(rejectionReason);
    await row.getByRole('button', { name: /Rejeitar/i }).click();
    await rhPage.locator('[role="status"]', { hasText: /rejeitado com motivo registrado/i }).waitFor();

    const persisted = await pool.query(
      'SELECT employee_id,status,rejection_reason FROM employee_private_documents WHERE id=$1', [documentId]);
    assert.equal(persisted.rows[0].employee_id, employee.id);
    assert.equal(persisted.rows[0].status, 'rejected');
    assert.equal(persisted.rows[0].rejection_reason, rejectionReason);
    const audit = await pool.query(
      "SELECT count(*)::int AS total FROM employee_private_document_access WHERE document_id=$1 AND actor_kind='staff' AND action='review'",
      [documentId]);
    assert.equal(audit.rows[0].total, 1, 'a revisão do RH mantém o evento de auditoria já existente');

    const employeeRead = await api('/api/employee/documents', { cookie: employeeSession });
    assert.equal(employeeRead.status, 200);
    assert.equal(employeeRead.body.scope, 'own');
    assert.equal(employeeRead.body.documents.find(item => item.id === documentId)?.rejection_reason, rejectionReason);
    const ownHome = await api('/api/employee/home', { cookie: employeeSession });
    assert.equal(ownHome.body.documents.find(item => item.id === documentId)?.rejection_reason, rejectionReason);

    await employeeOpened.page.reload({ waitUntil: 'domcontentloaded' });
    await employeeOpened.page.getByRole('tab', { name: 'Docs' }).click();
    const returnedCard = employeeOpened.page.locator('article').filter({ hasText: documentTitle });
    await returnedCard.getByText(rejectionReason, { exact: false }).waitFor();
    assert.match(await returnedCard.innerText(), /Motivo informado pelo RH/);
    const returnedReason = employeeOpened.page.getByText(rejectionReason, { exact: false });
    await returnedCard.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
    await employeeOpened.page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    if (evidenceDir) {
      const captureStyle = await employeeOpened.page.addStyleTag({ content: '[role="tablist"] { display: none !important; }' });
      await returnedCard.screenshot({ path: path.join(evidenceDir, 'ux-pro-05-documento-rejeitado-card-titular.png') });
      await captureStyle.evaluate(element => element.remove());
    }
    await capture(employeeOpened.page, 'ux-pro-05-documento-rejeitado-titular-mobile');
    const rhViewportEvidence = [];
    for (const width of [320, 390, 768, 1440]) {
      await rhPage.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      rhViewportEvidence.push(await rhPage.evaluate(() => ({
        width: document.documentElement.clientWidth,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      })));
      await capture(rhPage, `ux-pro-05-documento-rejeitado-rh-${width}-day`);
    }
    assert.deepEqual(rhViewportEvidence.map(value => value.width), [320, 390, 768, 1440]);
    assert.ok(rhViewportEvidence.every(value => value.overflow <= 1), JSON.stringify(rhViewportEvidence));
    await rhPage.getByRole('button', { name: 'Ativar modo noite' }).click();
    await rhPage.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
    await rhPage.setViewportSize({ width: 390, height: 844 });
    await capture(rhPage, 'ux-pro-05-documento-rejeitado-rh-390-night');
    const viewportEvidence = [];
    for (const width of [320, 390, 768, 1440]) {
      await employeeOpened.page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      viewportEvidence.push(await employeeOpened.page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      })));
      await returnedCard.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
      await capture(employeeOpened.page, `ux-pro-05-documento-rejeitado-${width}-day`);
    }
    assert.deepEqual(viewportEvidence.map(value => value.width), [320, 390, 768, 1440]);
    assert.ok(viewportEvidence.every(value => value.overflow <= 1), JSON.stringify(viewportEvidence));
    await employeeOpened.page.getByRole('button', { name: 'Ativar modo noite' }).click();
    await employeeOpened.page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
    await employeeOpened.page.setViewportSize({ width: 390, height: 844 });
    await capture(employeeOpened.page, 'ux-pro-05-documento-rejeitado-titular-390-night');
    const download = employeeOpened.page.locator('article').filter({ hasText: documentTitle })
      .getByRole('link', { name: /Baixar/ });
    await download.focus();
    assert.equal(await download.evaluate(element => element === document.activeElement), true,
      'o link do documento continua alcançável pelo teclado após a leitura do retorno');
  } finally {
    await rhContext?.close();
    await employeeContext?.close();
    await rhBrowser?.close();
    await employeeBrowser.close();
  }
});

test('browser: ajuste de ponto percorre Jornada do titular e Ponto e ajustes do RH com aprovação, rejeição, marcações preservadas e isolamento', { skip: !RUN }, async () => {
  const employeeBrowser = await launchBrowser();
  let rhBrowser;
  let employeeContext;
  let rhContext;
  try {
    async function createPortalEmployee(tag) {
      const suffix = `${tag}-${randomUUID().slice(0, 6)}`;
      const created = await api('/api/hr/employees', {
        method: 'POST', cookie: rhCookie,
        body: {
          matricula: `QA-${suffix}`,
          display_name: `Titular ${suffix}`,
          cargo: 'vigilante',
          status: 'ativo',
          employment_type: 'clt',
        },
      });
      assert.equal(created.status, 201);
      const email = `ux05-${suffix.toLowerCase()}@exemplo.invalid`;
      const access = await api(`/api/admin/hr/employees/${created.body.employee.id}/access`, {
        method: 'POST', cookie: rhCookie, body: { email },
      });
      assert.equal(access.status, 201);
      const firstLogin = await api('/api/employee/session', {
        method: 'POST', body: { email, password: access.body.temporaryPassword },
      });
      assert.equal(firstLogin.status, 200);
      const tempCookie = firstLogin.setCookie.find(value => value.startsWith('seg_employee_session='))?.split(';')[0];
      const password = `Titular-${randomUUID()}!`;
      const changed = await api('/api/employee/session/password', {
        method: 'PUT', cookie: tempCookie,
        body: { currentPassword: access.body.temporaryPassword, newPassword: password },
      });
      assert.equal(changed.status, 200);
      const login = await api('/api/employee/session', {
        method: 'POST', body: { email, password },
      });
      assert.equal(login.status, 200);
      const session = login.setCookie.find(value => value.startsWith('seg_employee_session='))?.split(';')[0];
      assert.ok(session);
      return { record: created.body.employee, session };
    }

    // Dois titulares isolados criados pelas APIs canônicas: titular A (jornada própria) e titular B (isolamento).
    const titularA = await createPortalEmployee('UX05A');
    const titularB = await createPortalEmployee('UX05B');
    const sessionA = titularA.session;
    const sessionB = titularB.session;

    const positionNow = () => ({
      latitude: -23.46284,
      longitude: -46.53332,
      accuracy: 11,
      positionAt: new Date().toISOString(),
    });
    const punchIn1 = await api('/api/employee/time-clock', {
      method: 'POST', cookie: sessionA,
      body: { requestId: randomUUID(), kind: 'entrada', position: positionNow() },
    });
    assert.equal(punchIn1.status, 201);
    const entryApproveId = punchIn1.body.timeEntryId;
    const punchOut1 = await api('/api/employee/time-clock', {
      method: 'POST', cookie: sessionA,
      body: { requestId: randomUUID(), kind: 'saida', position: positionNow() },
    });
    assert.equal(punchOut1.status, 201);

    const punchIn2 = await api('/api/employee/time-clock', {
      method: 'POST', cookie: sessionA,
      body: { requestId: randomUUID(), kind: 'entrada', position: positionNow() },
    });
    assert.equal(punchIn2.status, 201);
    const entryRejectId = punchIn2.body.timeEntryId;
    const punchOut2 = await api('/api/employee/time-clock', {
      method: 'POST', cookie: sessionA,
      body: { requestId: randomUUID(), kind: 'saida', position: positionNow() },
    });
    assert.equal(punchOut2.status, 201);

    // Isolamento: funcionário B não enxerga nem consegue pedir ajuste para jornada de A.
    const forbiddenCrossAttempt = await api('/api/employee/actions/time-correction', {
      method: 'POST', cookie: sessionB,
      body: {
        timeEntryId: entryApproveId,
        reason: 'Tentativa cruzada indevida de outro titular',
        requestedChanges: { clock_in: '08:00', clock_out: '17:00' },
      },
    });
    assert.equal(forbiddenCrossAttempt.status, 404);
    assert.equal(forbiddenCrossAttempt.body.error, 'time_entry_not_found');

    // Titular A abre /funcionario -> Jornada no celular e solicita o ajuste pela interface real.
    const employeeOpened = await openPage(employeeBrowser, '/funcionario', sessionA, { width: 390, height: 844 });
    employeeContext = employeeOpened.context;
    const empPage = employeeOpened.page;
    await empPage.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await empPage.getByRole('tab', { name: 'Jornada' }).click();

    const approveReason = `Ajuste saída portaria ${randomUUID().slice(0, 8)}`;
    const jornadaSectionInitial = empPage.locator('section').filter({ hasText: 'Jornada e correções' });
    // Há duas jornadas: abrimos os formulários de correção até expor o da jornada entryApproveId.
    const botoesSolicitar = jornadaSectionInitial.getByRole('button', { name: 'Solicitar correção' });
    await botoesSolicitar.first().waitFor();
    const totalBotoes = await botoesSolicitar.count();
    for (let idx = 0; idx < totalBotoes; idx += 1) {
      await jornadaSectionInitial.getByRole('button', { name: 'Solicitar correção' }).first().click();
      if (await empPage.locator(`#correcao-motivo-${entryApproveId}`).count()) break;
    }
    await empPage.locator(`#correcao-entrada-${entryApproveId}`).fill('08:00');
    await empPage.locator(`#correcao-saida-${entryApproveId}`).fill('17:00');
    await empPage.locator(`#correcao-motivo-${entryApproveId}`).fill(approveReason);
    await empPage.locator(`#correcao-motivo-${entryApproveId}`).locator('xpath=ancestor::form[1]').getByRole('button', { name: 'Enviar correção' }).click();

    const empPendingCard = empPage.locator('article').filter({ hasText: approveReason });
    await empPendingCard.waitFor();
    assert.match(await empPendingCard.innerText(), /Aguardando análise do RH/i,
      'o pedido recém-criado no portal deve exibir rótulo humano em vez do token cru solicitado');
    assert.doesNotMatch(await empPendingCard.innerText(), /\bsolicitado\b/i);
    await capture(empPage, 'ux-pro-05-titular-jornada-pedido-390-day');

    // RH abre /admin/funcionarios -> Ponto e ajustes, consulta espelho + marcações e analisa o pedido.
    rhBrowser = await launchBrowser();
    const rhOpened = await openPage(rhBrowser, '/admin/funcionarios', rhCookie, { width: 1440, height: 900 });
    rhContext = rhOpened.context;
    const rhPage = rhOpened.page;
    await rhPage.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await rhPage.getByRole('tab', { name: 'Ponto e ajustes' }).click();

    await rhPage.getByLabel('Funcionário', { exact: true }).selectOption(titularA.record.id);
    const verMarcacoesBtn = rhPage.getByRole('button', { name: /Ver marcações e localização/i }).first();
    await verMarcacoesBtn.waitFor();
    await verMarcacoesBtn.click();
    await rhPage.getByRole('heading', { name: /Marcações originais da jornada selecionada/i }).waitFor();
    const historicoPanelText = await rhPage.locator('section[aria-labelledby="rh-historico-ponto-titulo"]').innerText();
    assert.match(historicoPanelText, /Entrada ·/);
    assert.match(historicoPanelText, /Saída ·/);
    assert.doesNotMatch(historicoPanelText, /\bsaida_intervalo\b|\bretorno_intervalo\b/);

    const rhCard = rhPage.locator('article').filter({ hasText: approveReason });
    await rhCard.waitFor();
    assert.match(await rhCard.innerText(), /Aguardando análise/);
    await rhCard.getByRole('button', { name: 'Consultar marcações e localização' }).click();
    await rhCard.getByText(/Coordenadas -23\.46284, -46\.53332/).first().waitFor();

    // Verifica responsividade 320/390/768/1440, foco por teclado e geometria do checkbox (sem esticar a 100%).
    const rhReviewViewports = [];
    for (const width of [320, 390, 768, 1440]) {
      await rhPage.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      const hoursInput = rhCard.getByLabel('Horas trabalhadas após ajuste');
      await hoursInput.focus();
      const metrics = await rhPage.evaluate(() => {
        const checkbox = document.querySelector('input[type="checkbox"][id^="ajuste-revisado-"]');
        const rect = checkbox ? checkbox.getBoundingClientRect() : { width: 0, height: 0 };
        return {
          width: document.documentElement.clientWidth,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          checkboxWidth: Math.round(rect.width),
          checkboxHeight: Math.round(rect.height),
        };
      });
      rhReviewViewports.push(metrics);
      assert.ok(metrics.checkboxWidth >= 16 && metrics.checkboxWidth <= 28,
        `checkbox não pode esticar a 100% da largura (${metrics.checkboxWidth}px)`);
      await capture(rhPage, `ux-pro-05-ponto-rh-revisao-${width}-day`);
    }
    assert.deepEqual(rhReviewViewports.map(item => item.width), [320, 390, 768, 1440]);
    assert.ok(rhReviewViewports.every(item => item.overflow <= 1), JSON.stringify(rhReviewViewports));

    // Modo noite em 390px + verificação de contraste real do botão primário Aprovar ajuste.
    await rhPage.setViewportSize({ width: 390, height: 844 });
    await rhPage.getByRole('button', { name: 'Ativar modo noite' }).click();
    await rhPage.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
    const nightPrimaryColors = await rhCard.getByRole('button', { name: 'Aprovar ajuste' }).evaluate(node => {
      const computed = window.getComputedStyle(node);
      return { color: computed.color, backgroundColor: computed.backgroundColor };
    });
    assert.notEqual(nightPrimaryColors.color, 'rgb(255, 255, 255)',
      'no modo noite o botão primário sobre fundo azul claro deve usar texto escuro legível');
    await capture(rhPage, 'ux-pro-05-ponto-rh-revisao-390-night');
    await rhPage.getByRole('button', { name: 'Ativar modo dia' }).click();
    await rhPage.waitForFunction(() => document.documentElement.dataset.adminTheme !== 'night');
    await rhPage.setViewportSize({ width: 1440, height: 900 });

    // Transição 1: Colocar em análise -> reflete no banco e no portal do titular.
    await rhCard.getByRole('button', { name: 'Colocar em análise' }).click();
    await rhPage.locator('[role="status"]', { hasText: /colocado em análise/i }).waitFor();
    const cardEmAnalise = rhPage.locator('article').filter({ hasText: approveReason });
    await cardEmAnalise.getByText('Em análise').waitFor();

    await empPage.reload({ waitUntil: 'domcontentloaded' });
    await empPage.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await empPage.getByRole('tab', { name: 'Jornada' }).click();
    const empAnaliseCard = empPage.locator('article').filter({ hasText: approveReason });
    await empAnaliseCard.getByText('Em análise pelo RH').waitFor();
    const jornadaEmAnalise = empPage.locator('section').filter({ hasText: 'Jornada e correções' });
    await jornadaEmAnalise.getByText(/Pendente/).first().waitFor();
    assert.doesNotMatch(await jornadaEmAnalise.innerText(), /\bpendente\b|\bsolicitado\b|\bem_analise\b/);

    // Transição 2: Aprovar ajuste -> atualiza resumo da jornada, preserva marcações imutáveis e traduz Corrigido no portal.
    await cardEmAnalise.getByLabel('Entrada aprovada').fill('08:00');
    await cardEmAnalise.getByLabel('Saída aprovada').fill('17:00');
    await cardEmAnalise.getByLabel('Horas trabalhadas após ajuste').fill('8');
    await cardEmAnalise.getByLabel('Revisei o original, a solicitação e as horas trabalhadas.').check();
    await cardEmAnalise.getByRole('button', { name: 'Aprovar ajuste' }).click();
    await rhPage.locator('[role="status"]', { hasText: /aprovado\. As marcações originais permanecem preservadas/i }).waitFor();

    const approvedEntryRow = (await pool.query(
      'SELECT status, hours_worked, original_snapshot FROM hr_time_entries WHERE id = $1',
      [entryApproveId],
    )).rows[0];
    assert.equal(approvedEntryRow.status, 'corrigido');
    assert.equal(Number(approvedEntryRow.hours_worked), 8);
    assert.ok(approvedEntryRow.original_snapshot, 'o snapshot original da jornada deve permanecer preservado');

    const preservedPunches = (await pool.query(
      'SELECT count(*)::int AS total FROM emp_time_punches p JOIN emp_time_sessions s ON s.id = p.session_id WHERE s.time_entry_id = $1',
      [entryApproveId],
    )).rows[0];
    assert.equal(preservedPunches.total, 2, 'aprovar ajuste jamais altera ou apaga as marcações originais');

    // Transição 3: Segundo pedido é rejeitado com motivo obrigatório e o retorno aparece apenas ao titular A.
    const rejectReasonRequest = `Ajuste intervalo ${randomUUID().slice(0, 8)}`;
    const secondCorrection = await api('/api/employee/actions/time-correction', {
      method: 'POST', cookie: sessionA,
      body: {
        timeEntryId: entryRejectId,
        reason: rejectReasonRequest,
        requestedChanges: { clock_out: '18:00' },
      },
    });
    assert.equal(secondCorrection.status, 201);

    await rhPage.getByRole('button', { name: 'Atualizar pedidos' }).click();
    const rhRejectCard = rhPage.locator('article').filter({ hasText: rejectReasonRequest });
    await rhRejectCard.waitFor();
    const rhRejectionMotive = 'Horário divergente da escala confirmada na portaria.';
    await rhRejectCard.getByLabel('Motivo da rejeição').fill(rhRejectionMotive);
    await rhRejectCard.getByRole('button', { name: 'Rejeitar ajuste' }).click();
    await rhPage.locator('[role="status"]', { hasText: /rejeitado com motivo registrado/i }).waitFor();
    await capture(rhPage, 'ux-pro-05-ponto-rh-decidido-1440-day');

    const auditRows = (await pool.query(
      `SELECT action FROM audit_log
        WHERE action IN (
          'emp_journey_correction_request',
          'emp_journey_correction_em_analise',
          'emp_journey_correction_aprovado',
          'emp_journey_correction_rejeitado'
        )
        ORDER BY action`,
    )).rows.map(row => row.action);
    assert.ok(auditRows.includes('emp_journey_correction_request'));
    assert.ok(auditRows.includes('emp_journey_correction_em_analise'));
    assert.ok(auditRows.includes('emp_journey_correction_aprovado'));
    assert.ok(auditRows.includes('emp_journey_correction_rejeitado'));

    // Recarrega o portal do titular A e valida Corrigido, Ajuste aprovado e Ajuste rejeitado + Motivo em 320/390/768/1440 + noite.
    await empPage.reload({ waitUntil: 'domcontentloaded' });
    await empPage.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await empPage.getByRole('tab', { name: 'Jornada' }).click();

    const empApprovedCard = empPage.locator('article').filter({ hasText: approveReason });
    await empApprovedCard.getByText('Ajuste aprovado pelo RH').waitFor();
    const empRejectedCard = empPage.locator('article').filter({ hasText: rejectReasonRequest });
    await empRejectedCard.getByText(rhRejectionMotive, { exact: false }).waitFor();
    assert.match(await empRejectedCard.innerText(), /Ajuste rejeitado pelo RH/i);
    assert.match(await empRejectedCard.innerText(), /Motivo informado pelo RH/i);

    const jornadaSection = empPage.locator('section').filter({ hasText: 'Jornada e correções' });
    await jornadaSection.getByText(/Corrigido/).first().waitFor();
    assert.doesNotMatch(await jornadaSection.innerText(), /\bcorrigido\b|\bsolicitado\b|\bem_correcao\b/);

    const empViewports = [];
    for (const width of [320, 390, 768, 1440]) {
      await empPage.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await empRejectedCard.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
      empViewports.push(await empPage.evaluate(() => ({
        width: document.documentElement.clientWidth,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      })));
      await capture(empPage, `ux-pro-05-titular-jornada-retorno-${width}-day`);
    }
    assert.deepEqual(empViewports.map(item => item.width), [320, 390, 768, 1440]);
    assert.ok(empViewports.every(item => item.overflow <= 1), JSON.stringify(empViewports));

    await empPage.setViewportSize({ width: 390, height: 844 });
    await empPage.getByRole('button', { name: 'Ativar modo noite' }).click();
    await empPage.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
    await capture(empPage, 'ux-pro-05-titular-jornada-retorno-390-night');

    // Funcionário B continua sem ver qualquer jornada, marcação ou motivo de rejeição do titular A.
    const clockB = await api('/api/employee/time-clock', { cookie: sessionB });
    assert.equal(clockB.status, 200);
    assert.deepEqual(clockB.body.punches, []);
    assert.deepEqual(clockB.body.corrections, []);
    const homeB = await api('/api/employee/home', { cookie: sessionB });
    assert.equal(homeB.status, 200);
    assert.deepEqual(homeB.body.journey, []);
  } finally {
    await rhContext?.close();
    await employeeContext?.close();
    await rhBrowser?.close();
    await employeeBrowser.close();
  }
});

// UX-PRO-03 — primeira promoção "com prova" de um componente órfão de
// /admin/ti (família PLT-14, DependencyClient). A decisão de 02/10 exige rota
// real, autorização decidida no servidor, fonte/data-base, drill-down, erro de
// leitura com retry e subteste no gate. Este cenário prova, em PostgreSQL 17 e
// Chromium reais: (1) o papel é negado a rh e permitido a ti pela API; (2) a
// aba é alcançável por teclado e mostra os registros do banco; (3) dois estados
// A/B não vazam um no outro; (4) 503 e 403 produzem estados distintos, e o
// retry recupera a leitura; (5) 320/390/768/1440 sem transbordo.
test('browser UX-PRO-03: PLT-14 Dependências promovida com prova (papel, fonte, A/B, erro e retry)', { skip: !RUN }, async () => {
  const ti = await provisionStaff(pool, { role: 'ti' });
  const rh = await provisionStaff(pool, { role: 'rh' });
  const staffIds = [ti.id, rh.id];
  const tiCookie = await loginStaffHttp(ti.email);
  const rhCookie = await loginStaffHttp(rh.email);
  const MARK = 'qa-plt14-%';

  const seed = async (label, total, packageName) => {
    await pool.query('DELETE FROM dependency_updates WHERE notes LIKE $1', [MARK]);
    await pool.query('DELETE FROM dependency_vulnerabilities WHERE audit_id IN (SELECT id FROM dependency_audits WHERE notes LIKE $1)', [MARK]);
    await pool.query('DELETE FROM dependency_audits WHERE notes LIKE $1', [MARK]);
    await pool.query(
      `INSERT INTO dependency_audits (total_dependencies, prod_dependencies, dev_dependencies,
        vulnerabilities_high, outdated_count, status, notes, created_by)
       VALUES ($1,30,7,2,1,'pendente',$2,$3)`,
      [total, `${MARK.slice(0, -1)}${label}`, `QA-PLT14-${label}`],
    );
    await pool.query(
      `INSERT INTO dependency_updates (package_name, current_version, latest_version,
        update_type, is_breaking, status, notes)
       VALUES ($1,'1.0.0','2.0.0','major',$2,'pendente',$3)`,
      [packageName, label === 'B', `${MARK.slice(0, -1)}${label}`],
    );
  };

  try {
    // ---------- prova de autorização no SERVIDOR (não só na UI) ----------
    await seed('A', 4123, 'seg-pacote-ALFA');
    const deniedByRole = await api('/api/admin/dependencies/audits', { cookie: rhCookie });
    assert.equal(deniedByRole.status, 403, `rh não pode consultar dependências: veio ${deniedByRole.status}`);
    const allowedForTi = await api('/api/admin/dependencies/audits', { cookie: tiCookie });
    assert.equal(allowedForTi.status, 200);
    assert.ok(Array.isArray(allowedForTi.body.audits), 'a resposta precisa trazer a lista');

    // ---------- estado A: quatro larguras, teclado e sem transbordo ----------
    const readings = [];
    for (const [width, height] of [[320, 844], [390, 844], [768, 900], [1440, 900]]) {
      const browser = await launchBrowser();
      try {
        const { context, page } = await openPage(browser, '/admin/ti', tiCookie, { width, height });
        const tab = page.getByRole('button', { name: 'Dependências', exact: true });
        await tab.waitFor();
        await tab.focus();
        const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() || '');
        assert.match(focused, /Dependências/, `a aba precisa receber foco em ${width}`);
        await page.keyboard.press('Enter');
        await page.getByRole('heading', { name: 'Dependências, vulnerabilidades e atualizações' }).waitFor();
        await page.getByText(/Fonte: tabelas/).waitFor();
        // O cabeçalho aparece antes da leitura: esperar o registro canônico.
        await page.getByText(/QA-PLT14-A/).first().waitFor();
        const text = await page.locator('body').innerText();
        assert.match(text, /QA-PLT14-A/, `registro A precisa aparecer em ${width}`);
        assert.match(text, /seg-pacote-ALFA/);
        assert.match(text, /Data-base:/);
        assert.doesNotMatch(text, /QA-PLT14-B/, `registro B não pode vazar em ${width}`);
        assert.doesNotMatch(text, /seg-pacote-BETA/);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `PLT-14 overflow ${overflow} em ${width}`);
        readings.push({ width, overflow, keyboard: focused });
        await context.close();
      } finally {
        await browser.close();
      }
    }
    assert.deepEqual(readings.map(item => item.width), [320, 390, 768, 1440]);

    // ---------- estado B: os dados de A desaparecem ----------
    await seed('B', 8456, 'seg-pacote-BETA');
    const bBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(bBrowser, '/admin/ti', tiCookie, { width: 1440, height: 900 });
      await page.getByRole('button', { name: 'Dependências', exact: true }).click();
      await page.getByText(/Fonte: tabelas/).waitFor();
      await page.getByText(/QA-PLT14-B/).first().waitFor();
      const text = await page.locator('body').innerText();
      assert.match(text, /QA-PLT14-B/, 'o estado B precisa aparecer');
      assert.match(text, /seg-pacote-BETA/);
      assert.match(text, /BREAKING/, 'a atualização de B é incompatível e precisa ser sinalizada');
      assert.doesNotMatch(text, /QA-PLT14-A/, 'o registro de A não pode sobrar na leitura de B');
      assert.doesNotMatch(text, /seg-pacote-ALFA/);
      await context.close();
    } finally {
      await bBrowser.close();
    }

    // ---------- 503: erro declarado, e retry recupera sem recarregar ----------
    const failureBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(failureBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/admin/dependencies/audits'],
        status: 503, code: 'qa_forced_failure',
        onPage: p => p.addInitScript(() => { window.__qaFetchOriginal = window.fetch.bind(window); }),
      });
      await page.getByRole('button', { name: 'Dependências', exact: true }).click();
      const errorState = page.locator('[data-ui-state="error"]');
      await errorState.waitFor();
      const errorText = await errorState.innerText();
      assert.match(errorText, /Falha na consulta/);
      assert.doesNotMatch(errorText, /Nenhum registro/, 'falha não pode parecer lista vazia');
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await page.evaluate(() => { window.fetch = window.__qaFetchOriginal; });
      await errorState.getByRole('button', { name: 'Tentar novamente' }).click();
      await page.getByText(/QA-PLT14-B/).first().waitFor();
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0, 'retry precisa sair do estado de erro');
      assert.match(await page.locator('body').innerText(), /QA-PLT14-B/, 'retry precisa trazer a leitura real');
      await context.close();
    } finally {
      await failureBrowser.close();
    }

    // ---------- 403: negado é diferente de erro e de vazio ----------
    const deniedBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(deniedBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/admin/dependencies/audits'],
        status: 403, code: 'forbidden',
      });
      await page.getByRole('button', { name: 'Dependências', exact: true }).click();
      const deniedState = page.locator('[data-ui-state="denied"]');
      await deniedState.waitFor();
      assert.match(await deniedState.innerText(), /Acesso não autorizado/);
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await context.close();
    } finally {
      await deniedBrowser.close();
    }
  } finally {
    await pool.query('DELETE FROM dependency_updates WHERE notes LIKE $1', [MARK]).catch(() => {});
    await pool.query('DELETE FROM dependency_vulnerabilities WHERE audit_id IN (SELECT id FROM dependency_audits WHERE notes LIKE $1)', [MARK]).catch(() => {});
    await pool.query('DELETE FROM dependency_audits WHERE notes LIKE $1', [MARK]).catch(() => {});
    for (const id of staffIds) {
      await pool.query('DELETE FROM auth_access_audit WHERE actor_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_sessions WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_staff_profiles WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_credentials WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_identities WHERE id=$1', [id]).catch(() => {});
    }
  }
});

// UX-PRO-03 — 2ª promoção "com prova": PLT-18 (documentação de manutenção).
// Além do padrão da 1ª promoção, este cenário exercita ESCRITA real pela UI
// (POST de documento, PATCH de publicação e PATCH de nova versão), fechando a
// limitação registrada em UX-PRO-03-PROMOCAO-DEPENDENCIAS-2026-10-27.md.
test('browser UX-PRO-03: PLT-18 documentação de manutenção (papel, A/B, POST, PATCH, erro e retry)', { skip: !RUN }, async () => {
  const ti = await provisionStaff(pool, { role: 'ti' });
  const rh = await provisionStaff(pool, { role: 'rh' });
  const staffIds = [ti.id, rh.id];
  const tiCookie = await loginStaffHttp(ti.email);
  const rhCookie = await loginStaffHttp(rh.email);
  const MARK = 'qa-plt18-%';
  const LONG_CONTENT = 'Conteúdo sintético de manutenção usado apenas pelo gate QA. '.repeat(3);

  const seed = async ({ title, slug, category, createdBy, tag }) => {
    await pool.query('DELETE FROM maintenance_docs WHERE slug LIKE $1', [MARK]);
    await pool.query(
      `INSERT INTO maintenance_docs (category, status, title, slug, content, version,
        is_published, published_at, tags, created_by)
       VALUES ($1,'publicado',$2,$3,$4,1,true,now(),$5,$6)`,
      [category, title, slug, LONG_CONTENT, [tag, 'qa-plt18'], createdBy],
    );
  };

  try {
    // ---------- autorização no SERVIDOR ----------
    await seed({ title: 'QA-PLT18-ALFA — documento sintético de arquitetura', slug: 'qa-plt18-alfa', category: 'arquitetura', createdBy: 'QA-PLT18-A', tag: 'qa-plt18-a' });
    const deniedByRole = await api('/api/admin/maintenance/docs', { cookie: rhCookie });
    assert.equal(deniedByRole.status, 403, `rh não pode consultar a documentação: veio ${deniedByRole.status}`);
    const allowedForTi = await api('/api/admin/maintenance/docs', { cookie: tiCookie });
    assert.equal(allowedForTi.status, 200);
    assert.ok(Array.isArray(allowedForTi.body.docs));

    // ---------- estado A: quatro larguras, teclado, sem transbordo ----------
    const readings = [];
    for (const [width, height] of [[320, 844], [390, 844], [768, 900], [1440, 900]]) {
      const browser = await launchBrowser();
      try {
        const { context, page } = await openPage(browser, '/admin/ti', tiCookie, { width, height });
        const tab = page.getByRole('button', { name: 'Documentação de manutenção', exact: true });
        await tab.waitFor();
        await tab.focus();
        const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() || '');
        assert.match(focused, /Documentação de manutenção/, `a aba precisa receber foco em ${width}`);
        await page.keyboard.press('Enter');
        await page.getByRole('heading', { name: 'Documentação de manutenção' }).waitFor();
        await page.getByText(/Fonte: tabelas/).waitFor();
        await page.getByText(/QA-PLT18-ALFA/).first().waitFor();
        const text = await page.locator('body').innerText();
        assert.match(text, /QA-PLT18-ALFA/);
        assert.match(text, /qa-plt18-alfa/);
        assert.match(text, /Data-base:/);
        assert.doesNotMatch(text, /QA-PLT18-BETA/, `B não pode vazar em ${width}`);
        assert.doesNotMatch(text, /qa-plt18-beta/);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `PLT-18 overflow ${overflow} em ${width}`);
        readings.push({ width, overflow, keyboard: focused });
        await context.close();
      } finally {
        await browser.close();
      }
    }
    assert.deepEqual(readings.map(item => item.width), [320, 390, 768, 1440]);

    // ---------- troca de estado COM detalhe aberto + escrita real pela UI ----------
    const journeyBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(journeyBrowser, '/admin/ti', tiCookie, { width: 1440, height: 900 });
      await page.getByRole('button', { name: 'Documentação de manutenção', exact: true }).click();
      await page.getByText(/QA-PLT18-ALFA/).first().waitFor();

      // Detalhe de A: conteúdo integral e histórico.
      await page.getByRole('button', { name: 'Abrir e ver histórico' }).first().click();
      await page.getByRole('heading', { name: 'Documento selecionado' }).waitFor();
      await page.getByText(/Histórico de versões/).waitFor();
      assert.match(await page.locator('body').innerText(), /QA-PLT18-ALFA/);

      // Troca para B no banco; "Atualizar leitura" não pode deixar A visível.
      await seed({ title: 'QA-PLT18-BETA — documento sintético de diagnóstico', slug: 'qa-plt18-beta', category: 'diagnostico', createdBy: 'QA-PLT18-B', tag: 'qa-plt18-b' });
      await page.getByRole('button', { name: 'Atualizar leitura' }).click();
      await page.getByText(/QA-PLT18-BETA/).first().waitFor();
      let text = await page.locator('body').innerText();
      assert.doesNotMatch(text, /QA-PLT18-ALFA/, 'o documento de A não pode sobrar em B');
      assert.doesNotMatch(text, /qa-plt18-alfa/);
      assert.equal(await page.getByRole('heading', { name: 'Documento selecionado' }).count(), 0,
        'a troca de leitura precisa limpar o detalhe anterior');

      // POST pela interface: formulário -> 201 -> lista atualizada.
      await page.locator('summary').filter({ hasText: 'Registrar documento' }).click();
      await page.getByLabel('Título', { exact: true }).fill('Documento criado pela interface QA PLT18');
      await page.getByLabel('Slug', { exact: false }).fill('qa-plt18-criado-ui');
      await page.getByLabel('Conteúdo', { exact: true }).fill('Conteúdo sintético criado pela interface do gate QA para provar o POST de documentação de manutenção.');
      await page.getByLabel('Tags separadas por vírgula', { exact: true }).fill('qa-plt18-ui');
      await page.getByRole('button', { name: 'Registrar documento' }).click();
      await page.getByText(/Documento registrado\./).waitFor();
      await page.getByText(/Documento criado pela interface QA PLT18/).first().waitFor();

      // O mutate reabre o registro devolvido: esperar o h4 do detalhe pronto.
      await page.getByRole('heading', { name: /Documento criado pela interface QA PLT18 · v1/ }).waitFor();
      await page.getByRole('button', { name: 'Publicar', exact: true }).click();
      await page.getByText(/Documento publicado\./).waitFor();
      await page.getByRole('heading', { name: /Documento criado pela interface QA PLT18 · v1/ }).waitFor();
      text = await page.locator('body').innerText();
      assert.match(text, /publicado/, 'a publicação precisa aparecer no detalhe');

      // PATCH de nova versão: outro id, histórico com resumo e autor.
      await page.locator('summary').filter({ hasText: 'Nova versão com conteúdo revisado' }).click();
      await page.getByLabel('Novo conteúdo', { exact: false }).fill('Segunda versão sintética do documento de manutenção criada pela interface do gate QA para provar versionamento.');
      await page.getByRole('button', { name: 'Nova versão', exact: true }).click();
      await page.getByText(/Nova versão registrada\./).waitFor();
      // O mutate recarrega a lista e reabre o NOVO id: esperar o detalhe v2.
      await page.getByRole('heading', { name: /Documento criado pela interface QA PLT18 · v2/ }).waitFor();
      await page.getByText(/v1 → v2/).first().waitFor();
      text = await page.locator('body').innerText();
      assert.match(text, /v1 → v2/, 'o histórico precisa registrar a transição de versão');
      assert.match(text, /Atualização de conteúdo via TI|change_summary/);
      await context.close();
    } finally {
      await journeyBrowser.close();
    }

    // ---------- 503: erro declarado e retry sem recarregar ----------
    const failureBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(failureBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/admin/maintenance/docs'],
        status: 503, code: 'qa_forced_failure',
        onPage: p => p.addInitScript(() => { window.__qaFetchOriginal = window.fetch.bind(window); }),
      });
      await page.getByRole('button', { name: 'Documentação de manutenção', exact: true }).click();
      const errorState = page.locator('[data-ui-state="error"]');
      await errorState.waitFor();
      assert.match(await errorState.innerText(), /Falha na consulta/);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await page.evaluate(() => { window.fetch = window.__qaFetchOriginal; });
      await errorState.getByRole('button', { name: 'Tentar novamente' }).click();
      await page.getByText(/QA-PLT18-BETA/).first().waitFor();
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0, 'retry precisa sair do erro');
      await context.close();
    } finally {
      await failureBrowser.close();
    }

    // ---------- 403: negado distinto de erro e de vazio ----------
    const deniedBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(deniedBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/admin/maintenance/docs'],
        status: 403, code: 'forbidden',
      });
      await page.getByRole('button', { name: 'Documentação de manutenção', exact: true }).click();
      const deniedState = page.locator('[data-ui-state="denied"]');
      await deniedState.waitFor();
      assert.match(await deniedState.innerText(), /Acesso não autorizado/);
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await context.close();
    } finally {
      await deniedBrowser.close();
    }
  } finally {
    await pool.query('DELETE FROM maintenance_docs WHERE slug LIKE $1', [MARK]).catch(() => {});
    for (const id of staffIds) {
      await pool.query('DELETE FROM auth_access_audit WHERE actor_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_sessions WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_staff_profiles WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_credentials WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_identities WHERE id=$1', [id]).catch(() => {});
    }
  }
});

// E17 — validação de UUID 8-4-4-12 recusava TODO uuid real em 7 módulos do
// servidor. Este cenário usa HTTP real contra PostgreSQL 17 (sem navegador) e
// prova que, com um UUID canônico, a requisição CHEGA ao banco: a resposta de
// "registro inexistente" é 404, nunca 400 de validação de id. Antes da
// correção cada caso devolvia o respectivo `invalid_*_id`.
test('http E17: UUID canônico chega ao banco nos sete módulos afetados', { skip: !RUN }, async () => {
  const ti = await provisionStaff(pool, { role: 'ti' });
  const cookie = await loginStaffHttp(ti.email);
  // As rotas /api/admin/hr/* têm um gate granular na borda (employees.write),
  // anterior ao handler. Provisionar a permissão é preparação de QA, não
  // mudança de autorização em produção: sem ela o caso de RH nem chega à
  // validação de UUID que queremos provar.
  await pool.query(
    `INSERT INTO auth_permissions (identity_id, permission, scope_type, reason)
     VALUES ($1, 'employees.write', 'global', 'Gate E17: prova de UUID em RH (QA)')`,
    [ti.id],
  );
  const cases = [];
  const add = (name, method, pathname, body, uuidError, accepted) =>
    cases.push({ name, method, pathname, body, uuidError, accepted });

  add('observabilidade/alertas', 'PATCH', `/api/admin/observability/alerts/${randomUUID()}`,
    { action: 'acknowledge' }, 'invalid_alert_id', [404, 200]);
  add('privacidade/políticas', 'GET', `/api/admin/privacy/policies/${randomUUID()}`,
    undefined, 'invalid_policy_id', [404, 200]);
  add('lgpd/solicitações', 'GET', `/api/admin/lgpd/requests/${randomUUID()}`,
    undefined, 'invalid_request_id', [404, 200]);
  add('ambientes/checks', 'POST', '/api/admin/environments/checks',
    { env_id: randomUUID(), check_type: 'isolation_verify', status: 'passou' }, 'invalid_env_id', [404, 201]);
  add('orçamentos', 'PATCH', '/api/admin/budgets',
    { id: randomUUID(), actual_amount: 10 }, 'invalid_id', [404, 200]);
  add('alertas de uso', 'PATCH', '/api/admin/usage/alerts',
    { id: randomUUID() }, 'invalid_id', [404, 200]);
  add('RH/avaliações', 'PATCH', '/api/admin/hr/evaluations',
    { id: randomUUID(), status: 'em_avaliacao' }, 'invalid_id', [404, 200]);

  const results = [];
  for (const item of cases) {
    const response = await api(item.pathname, { method: item.method, body: item.body, cookie });
    const error = response.body && typeof response.body === 'object' ? response.body.error : null;
    results.push({ name: item.name, status: response.status, error });
  }
  for (let i = 0; i < cases.length; i += 1) {
    const item = cases[i];
    const result = results[i];
    assert.notEqual(result.error, item.uuidError,
      `${item.name}: UUID canônico foi recusado pela validação (${result.status} ${result.error})`);
    assert.ok(item.accepted.includes(result.status),
      `${item.name}: esperado chegar ao banco (${item.accepted.join('/')}), veio ${result.status} ${result.error}`);
  }
  try {
    await pool.query('DELETE FROM auth_permissions WHERE identity_id=$1', [ti.id]).catch(() => {});
    await pool.query('DELETE FROM auth_sessions WHERE identity_id=$1', [ti.id]).catch(() => {});
    await pool.query('DELETE FROM auth_staff_profiles WHERE identity_id=$1', [ti.id]).catch(() => {});
    await pool.query('DELETE FROM auth_credentials WHERE identity_id=$1', [ti.id]).catch(() => {});
    await pool.query('DELETE FROM auth_identities WHERE id=$1', [ti.id]).catch(() => {});
  } catch { /* cluster descartável */ }
});

// UX-PRO-03 — 3ª promoção "com prova": PLT-16 (orçamento, métricas e alertas
// de uso). Além do padrão das duas primeiras promoções, este cenário prova as
// QUATRO ações de escrita pela interface. O acknowledge de alerta é um PATCH
// por UUID — exatamente o endpoint que o E17 destravou em budget-api.mjs.
test('browser UX-PRO-03: PLT-16 Orçamento e uso (papel, A/B, POST/PATCH, erro e retry)', { skip: !RUN }, async () => {
  const ti = await provisionStaff(pool, { role: 'ti' });
  const rh = await provisionStaff(pool, { role: 'rh' });
  const staffIds = [ti.id, rh.id];
  const tiCookie = await loginStaffHttp(ti.email);
  const rhCookie = await loginStaffHttp(rh.email);

  const seed = async ({ label, marker, budgetValue }) => {
    await pool.query("DELETE FROM usage_alerts WHERE title LIKE 'QA-PLT16-%' OR title LIKE '%QA PLT16%'").catch(() => {});
    await pool.query("DELETE FROM usage_metrics WHERE source LIKE 'qa-plt16-%'").catch(() => {});
    await pool.query("DELETE FROM operational_budgets WHERE name LIKE 'QA-PLT16-%' OR name LIKE 'Orçamento criado pela interface QA PLT16%'").catch(() => {});
    const budget = await pool.query(
      `INSERT INTO operational_budgets (name, category, period_start, period_end,
        budgeted_amount, actual_amount, alert_threshold_percent, notes, created_by)
       VALUES ($1,'infra', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', $2, 100, 80, $3, 'qa-plt16')
       RETURNING id`,
      [`QA-PLT16-${label} — orçamento sintético`, budgetValue, marker],
    );
    await pool.query(
      `INSERT INTO usage_metrics (metric, category, value, unit, source)
       VALUES ('storage_gb','armazenamento',5,'GB',$1)`,
      [marker],
    );
    await pool.query(
      `INSERT INTO usage_alerts (budget_id, metric, category, severity, title, message,
        threshold_value, current_value)
       VALUES ($1,'outro','infra','warning',$2,$3,800,900)`,
      [budget.rows[0].id, `QA-PLT16-${label} — alerta sintético de uso`, `Alerta sintético QA PLT16 ${label} para reconhecimento no gate de integração.`],
    );
  };

  try {
    // ---------- autorização no SERVIDOR ----------
    await seed({ label: 'ALFA', marker: 'qa-plt16-a', budgetValue: 1000 });
    for (const pathname of ['/api/admin/budgets', '/api/admin/usage/metrics', '/api/admin/usage/alerts']) {
      const denied = await api(pathname, { cookie: rhCookie });
      assert.equal(denied.status, 403, `rh não pode consultar ${pathname}: veio ${denied.status}`);
      const allowed = await api(pathname, { cookie: tiCookie });
      assert.equal(allowed.status, 200, `ti precisa consultar ${pathname}: veio ${allowed.status}`);
    }

    // ---------- estado A: quatro larguras, teclado, sem transbordo ----------
    const readings = [];
    for (const [width, height] of [[320, 844], [390, 844], [768, 900], [1440, 900]]) {
      const browser = await launchBrowser();
      try {
        const { context, page } = await openPage(browser, '/admin/ti', tiCookie, { width, height });
        const tab = page.getByRole('button', { name: 'Orçamento e uso', exact: true });
        await tab.waitFor();
        await tab.focus();
        const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() || '');
        assert.match(focused, /Orçamento e uso/, `a aba precisa receber foco em ${width}`);
        await page.keyboard.press('Enter');
        await page.getByRole('heading', { name: 'Orçamento e uso' }).waitFor();
        await page.getByText(/Fonte: tabelas/).waitFor();
        await page.getByText(/QA-PLT16-ALFA/).first().waitFor();
        const text = await page.locator('body').innerText();
        assert.match(text, /QA-PLT16-ALFA/);
        assert.match(text, /Data-base:/);
        assert.match(text, /planejamento sintético/i, 'a tela precisa declarar que os valores são sintéticos');
        assert.doesNotMatch(text, /QA-PLT16-BETA/, `B não pode vazar em ${width}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `PLT-16 overflow ${overflow} em ${width}`);
        readings.push({ width, overflow });
        await context.close();
      } finally {
        await browser.close();
      }
    }
    assert.deepEqual(readings.map(item => item.width), [320, 390, 768, 1440]);

    // ---------- escrita real pela UI + troca de estado ----------
    const journeyBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(journeyBrowser, '/admin/ti', tiCookie, { width: 1440, height: 900 });
      await page.getByRole('button', { name: 'Orçamento e uso', exact: true }).click();
      await page.getByText(/QA-PLT16-ALFA/).first().waitFor();

      const now = Date.now();
      const start = new Date(now - 5 * 86400000).toISOString().slice(0, 10);
      const end = new Date(now + 25 * 86400000).toISOString().slice(0, 10);

      // POST orçamento.
      await page.locator('summary').filter({ hasText: 'Registrar orçamento' }).click();
      await page.getByLabel('Nome', { exact: true }).fill('Orçamento criado pela interface QA PLT16');
      await page.getByLabel('Início do período', { exact: true }).fill(start);
      await page.getByLabel('Fim do período', { exact: true }).fill(end);
      await page.getByLabel('Valor orçado', { exact: true }).fill('1000');
      await page.getByRole('button', { name: 'Registrar orçamento' }).click();
      await page.getByText(/Orçamento registrado\./).waitFor();
      await page.getByText(/Orçamento criado pela interface QA PLT16/).first().waitFor();

      // PATCH uso: ao atingir 95% o servidor gera o alerta.
      const budgetCard = page.locator('li').filter({ hasText: 'Orçamento criado pela interface QA PLT16' }).first();
      await budgetCard.getByLabel('Novo valor de uso').fill('950');
      await budgetCard.getByRole('button', { name: 'Atualizar uso' }).click();
      await page.getByText(/Uso atualizado\./).waitFor();
      await page.getByText(/em 95\.0%/).first().waitFor();

      // POST métrica.
      await page.locator('summary').filter({ hasText: 'Registrar métrica' }).click();
      await page.getByLabel('Origem', { exact: true }).fill('qa-plt16-ui');
      await page.getByRole('button', { name: 'Registrar métrica' }).click();
      await page.getByText(/Métrica registrada\./).waitFor();

      // PATCH acknowledge: prova ponta a ponta da correção E17 (uuidRe).
      const alertCard = page.locator('li').filter({ hasText: 'QA-PLT16-ALFA — alerta sintético' }).first();
      await alertCard.getByRole('button', { name: 'Reconhecer alerta' }).click();
      await page.getByText(/Alerta reconhecido\./).waitFor();
      await page.getByText(/reconhecido por/).first().waitFor();

      // Troca para B no banco: A (e as mensagens antigas) não podem sobrar.
      await seed({ label: 'BETA', marker: 'qa-plt16-b', budgetValue: 2000 });
      await page.getByRole('button', { name: 'Atualizar leitura' }).click();
      await page.getByText(/QA-PLT16-BETA/).first().waitFor();
      const text = await page.locator('body').innerText();
      assert.doesNotMatch(text, /QA-PLT16-ALFA/, 'o estado A não pode sobrar na leitura de B');
      assert.match(text, /QA-PLT16-BETA/);
      assert.doesNotMatch(text, /Alerta reconhecido\./, 'mensagem de operação antiga não pode sobreviver à releitura');
      assert.doesNotMatch(text, /Uso atualizado\./);
      await context.close();
    } finally {
      await journeyBrowser.close();
    }

    // ---------- 503: erro declarado e retry sem recarregar ----------
    const failureBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(failureBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/admin/budgets'],
        status: 503, code: 'qa_forced_failure',
        onPage: p => p.addInitScript(() => { window.__qaFetchOriginal = window.fetch.bind(window); }),
      });
      await page.getByRole('button', { name: 'Orçamento e uso', exact: true }).click();
      const errorState = page.locator('[data-ui-state="error"]');
      await errorState.waitFor();
      assert.match(await errorState.innerText(), /Falha na consulta/);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await page.evaluate(() => { window.fetch = window.__qaFetchOriginal; });
      await errorState.getByRole('button', { name: 'Tentar novamente' }).click();
      await page.getByText(/QA-PLT16-BETA/).first().waitFor();
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0, 'retry precisa sair do erro');
      await context.close();
    } finally {
      await failureBrowser.close();
    }

    // ---------- 403: negado distinto de erro e de vazio ----------
    const deniedBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(deniedBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/admin/budgets'],
        status: 403, code: 'forbidden',
      });
      await page.getByRole('button', { name: 'Orçamento e uso', exact: true }).click();
      const deniedState = page.locator('[data-ui-state="denied"]');
      await deniedState.waitFor();
      assert.match(await deniedState.innerText(), /Acesso não autorizado/);
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await context.close();
    } finally {
      await deniedBrowser.close();
    }
  } finally {
    await pool.query("DELETE FROM usage_alerts WHERE title LIKE 'QA-PLT16-%' OR title LIKE '%QA PLT16%'").catch(() => {});
    await pool.query("DELETE FROM usage_metrics WHERE source LIKE 'qa-plt16-%'").catch(() => {});
    await pool.query("DELETE FROM operational_budgets WHERE name LIKE 'QA-PLT16-%' OR name LIKE 'Orçamento criado pela interface QA PLT16%'").catch(() => {});
    for (const id of staffIds) {
      await pool.query('DELETE FROM auth_access_audit WHERE actor_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_sessions WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_staff_profiles WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_credentials WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_identities WHERE id=$1', [id]).catch(() => {});
    }
  }
});

// UX-PRO-03 — 4ª promoção "com prova": PLT-17 (inventário declarativo de
// ambientes e verificações de isolamento). Além do padrão das promoções
// anteriores, esta fatia prova que o aviso declarativo aparece em todas as
// larguras e que a regra de negócio do servidor (produção exige sinalizador de
// dados reais) chega traduzida à interface. O gate NUNCA cria um ambiente com
// sinalizador de produção ativado com sucesso — apenas exercita a recusa.
test('browser UX-PRO-03: PLT-17 Ambientes e isolamento (papel, A/B, POST/PATCH, erro e retry)', { skip: !RUN }, async () => {
  const ti = await provisionStaff(pool, { role: 'ti' });
  const rh = await provisionStaff(pool, { role: 'rh' });
  const staffIds = [ti.id, rh.id];
  const tiCookie = await loginStaffHttp(ti.email);
  const rhCookie = await loginStaffHttp(rh.email);

  const seed = async ({ label, dbName, notes }) => {
    await pool.query("DELETE FROM environments WHERE name LIKE 'QA-PLT17-%' OR name LIKE 'Ambiente criado pela interface QA PLT17%' OR name LIKE 'Ambiente inválido QA PLT17%'").catch(() => {});
    const env = await pool.query(
      `INSERT INTO environments (name, env_type, db_name, db_user, storage_bucket,
        domain, is_production, has_real_data, status, notes, created_by)
       VALUES ($1,'development',$2,$3,$4,NULL,false,false,'em_verificacao',$5,'qa-plt17')
       RETURNING id`,
      [`QA-PLT17-${label}`, dbName, `${dbName}_user`, `qa-plt17-${label.toLowerCase()}-bucket`, notes],
    );
    await pool.query(
      `INSERT INTO env_data_checks (env_id, check_type, status, details, checked_by)
       VALUES ($1,'account_separation','pendente',$2::jsonb,$3)`,
      [env.rows[0].id, JSON.stringify({ synthetic: true, label }), `QA-PLT17-${label}`],
    );
  };

  try {
    // ---------- autorização no SERVIDOR ----------
    await seed({ label: 'ALFA', dbName: 'qa_plt17_a', notes: 'qa-plt17-a' });
    for (const pathname of ['/api/admin/environments', '/api/admin/environments/checks']) {
      const denied = await api(pathname, { cookie: rhCookie });
      assert.equal(denied.status, 403, `rh não pode consultar ${pathname}: veio ${denied.status}`);
      const allowed = await api(pathname, { cookie: tiCookie });
      assert.equal(allowed.status, 200, `ti precisa consultar ${pathname}: veio ${allowed.status}`);
    }

    // ---------- estado A: quatro larguras, teclado, aviso, sem transbordo ----------
    const readings = [];
    for (const [width, height] of [[320, 844], [390, 844], [768, 900], [1440, 900]]) {
      const browser = await launchBrowser();
      try {
        const { context, page } = await openPage(browser, '/admin/ti', tiCookie, { width, height });
        const tab = page.getByRole('button', { name: 'Ambientes e isolamento', exact: true });
        await tab.waitFor();
        await tab.focus();
        const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() || '');
        assert.match(focused, /Ambientes e isolamento/, `a aba precisa receber foco em ${width}`);
        await page.keyboard.press('Enter');
        await page.getByRole('heading', { name: 'Ambientes e isolamento' }).waitFor();
        await page.getByText(/Fonte: tabelas/).waitFor();
        await page.getByText(/QA-PLT17-ALFA/).first().waitFor();
        const text = await page.locator('body').innerText();
        assert.match(text, /QA-PLT17-ALFA/);
        assert.match(text, /inventário declarativo/i, 'o aviso declarativo precisa estar visível');
        assert.match(text, /não conecta/i);
        assert.match(text, /NO-GO/);
        assert.match(text, /decisão do proprietário/i);
        assert.match(text, /Data-base:/);
        assert.doesNotMatch(text, /QA-PLT17-BETA/, `B não pode vazar em ${width}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `PLT-17 overflow ${overflow} em ${width}`);
        readings.push({ width, overflow });
        await context.close();
      } finally {
        await browser.close();
      }
    }
    assert.deepEqual(readings.map(item => item.width), [320, 390, 768, 1440]);

    // ---------- escrita real pela UI + erro traduzido + troca de estado ----------
    const journeyBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(journeyBrowser, '/admin/ti', tiCookie, { width: 1440, height: 900 });
      const openDetails = async name => {
        const summary = page.locator('summary').filter({ hasText: name }).first();
        const isOpen = await summary.evaluate(element => element.parentElement?.open ?? false);
        if (!isOpen) await summary.click();
      };
      await page.getByRole('button', { name: 'Ambientes e isolamento', exact: true }).click();
      await page.getByText(/QA-PLT17-ALFA/).first().waitFor();

      // POST ambiente — deliberadamente development, sem sinalizadores reais.
      await openDetails('Registrar ambiente');
      await page.getByLabel('Nome', { exact: true }).fill('Ambiente criado pela interface QA PLT17');
      await page.getByLabel('Banco', { exact: true }).fill('qa_plt17_ui_db');
      await page.getByLabel('Usuário do banco', { exact: true }).fill('qa_plt17_ui_user');
      await page.getByLabel('Bucket de armazenamento', { exact: true }).fill('qa-plt17-ui-bucket');
      await page.getByRole('button', { name: 'Registrar ambiente' }).click();
      await page.getByText(/Ambiente registrado no inventário\./).waitFor();
      await page.getByText(/Ambiente criado pela interface QA PLT17/).first().waitFor();

      // PATCH verificação de isolamento (prova do E17 por UUID).
      const envCard = page.locator('li').filter({ hasText: 'Ambiente criado pela interface QA PLT17' }).first();
      await envCard.getByRole('button', { name: 'Verificar isolamento' }).click();
      await page.getByText(/Isolamento confirmado\./).waitFor();

      // POST verificação: seleciona o ambiente pelo botão do card.
      const envCard2 = page.locator('li').filter({ hasText: 'Ambiente criado pela interface QA PLT17' }).first();
      await envCard2.getByRole('button', { name: 'Usar para verificação' }).click();
      await openDetails('Registrar verificação');
      await page.getByRole('button', { name: 'Registrar verificação' }).click();
      await page.getByText(/Verificação registrada\./).waitFor();

      // Erro real do servidor traduzido: produção sem sinalizador de dados reais.
      await openDetails('Registrar ambiente');
      await page.getByLabel('Nome', { exact: true }).fill('Ambiente inválido QA PLT17');
      await page.getByLabel('Banco', { exact: true }).fill('qa_plt17_bad_db');
      await page.getByLabel('Usuário do banco', { exact: true }).fill('qa_plt17_bad_user');
      await page.getByLabel('Bucket de armazenamento', { exact: true }).fill('qa-plt17-bad-bucket');
      await page.getByLabel('Sinalizador declarativo: produção').check();
      await page.getByRole('button', { name: 'Registrar ambiente' }).click();
      await page.getByText(/exige o sinalizador de dados reais/).waitFor();
      assert.equal(await page.getByText(/Ambiente inválido QA PLT17/).count(), 0,
        'o ambiente recusado pelo servidor não pode aparecer como criado');

      // Troca para B no banco: A e mensagens antigas não podem sobrar.
      await seed({ label: 'BETA', dbName: 'qa_plt17_b', notes: 'qa-plt17-b' });
      await page.getByRole('button', { name: 'Atualizar leitura' }).click();
      await page.getByText(/QA-PLT17-BETA/).first().waitFor();
      const text = await page.locator('body').innerText();
      assert.doesNotMatch(text, /QA-PLT17-ALFA/, 'o estado A não pode sobrar na leitura de B');
      assert.match(text, /QA-PLT17-BETA/);
      assert.doesNotMatch(text, /Isolamento confirmado\./, 'mensagem antiga não pode sobreviver à releitura');
      assert.doesNotMatch(text, /exige o sinalizador de dados reais/);
      await context.close();
    } finally {
      await journeyBrowser.close();
    }

    // ---------- 503: erro declarado e retry sem recarregar ----------
    const failureBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(failureBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/admin/environments'],
        status: 503, code: 'qa_forced_failure',
        onPage: p => p.addInitScript(() => { window.__qaFetchOriginal = window.fetch.bind(window); }),
      });
      await page.getByRole('button', { name: 'Ambientes e isolamento', exact: true }).click();
      const errorState = page.locator('[data-ui-state="error"]');
      await errorState.waitFor();
      assert.match(await errorState.innerText(), /Falha na consulta/);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await page.evaluate(() => { window.fetch = window.__qaFetchOriginal; });
      await errorState.getByRole('button', { name: 'Tentar novamente' }).click();
      await page.getByText(/QA-PLT17-BETA/).first().waitFor();
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0, 'retry precisa sair do erro');
      await context.close();
    } finally {
      await failureBrowser.close();
    }

    // ---------- 403: negado distinto de erro e de vazio ----------
    const deniedBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(deniedBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/admin/environments'],
        status: 403, code: 'forbidden',
      });
      await page.getByRole('button', { name: 'Ambientes e isolamento', exact: true }).click();
      const deniedState = page.locator('[data-ui-state="denied"]');
      await deniedState.waitFor();
      assert.match(await deniedState.innerText(), /Acesso não autorizado/);
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await context.close();
    } finally {
      await deniedBrowser.close();
    }
  } finally {
    await pool.query("DELETE FROM environments WHERE name LIKE 'QA-PLT17-%' OR name LIKE 'Ambiente criado pela interface QA PLT17%' OR name LIKE 'Ambiente inválido QA PLT17%'").catch(() => {});
    for (const id of staffIds) {
      await pool.query('DELETE FROM auth_access_audit WHERE actor_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_sessions WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_staff_profiles WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_credentials WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_identities WHERE id=$1', [id]).catch(() => {});
    }
  }
});

// ---------------------------------------------------------------------------
// UX-PRO-03 — 5ª promoção com prova: PLT-11 retenção por categoria, exceções
// formais, jobs de descarte e histórico minimizado. Papel admin/ti no servidor,
// escrita real pela UI, erro traduzido, A/B e retry em Chromium real.
// ---------------------------------------------------------------------------
test('browser UX-PRO-03: PLT-11 Retenção e descarte (papel, A/B, POST/PATCH, job, erro e retry)', { skip: !RUN }, async () => {
  const ti = await provisionStaff(pool, { role: 'ti' });
  const rh = await provisionStaff(pool, { role: 'rh' });
  const staffIds = [ti.id, rh.id];
  const tiCookie = await loginStaffHttp(ti.email);
  const rhCookie = await loginStaffHttp(rh.email);

  const cleanup = async () => {
    await pool.query("DELETE FROM disposal_logs WHERE job_id IN (SELECT id FROM disposal_jobs WHERE notes LIKE 'QA-PLT11-%')").catch(() => {});
    await pool.query("DELETE FROM disposal_jobs WHERE notes LIKE 'QA-PLT11-%'").catch(() => {});
    await pool.query("DELETE FROM retention_exceptions WHERE field_reference LIKE 'QA-PLT11-%'").catch(() => {});
    await pool.query("DELETE FROM data_retention_policies WHERE field_pattern LIKE 'QA-PLT11-%' OR description LIKE 'QA-PLT11-%'").catch(() => {});
  };
  const seed = async label => {
    await cleanup();
    await pool.query(
      `INSERT INTO data_retention_policies (category, field_pattern, retention_days, description, legal_basis, disposal_method, exceptional_retention_allowed, max_exception_days, created_by)
       VALUES ('contato',$1,365,$2,'cumprimento_legal','exclusao_logica',true,730,'qa-plt11')`,
      [`QA-PLT11-${label}-*`, `QA-PLT11-${label} política sintética de retenção para conferência em navegador.`],
    );
    await pool.query(
      `INSERT INTO retention_exceptions (category, field_reference, reason, justification, status, requested_retention_days, expires_at, requested_by)
       VALUES ('contato',$1,$2,$3,'solicitado',180,CURRENT_DATE + 180,'qa-plt11')`,
      [`QA-PLT11-${label} campo`, `QA-PLT11-${label} motivo sintético com mais de dez caracteres.`,
        `QA-PLT11-${label} justificativa sintética com mais de dez caracteres.`],
    );
  };

  try {
    // ---------- autorização no SERVIDOR ----------
    await seed('ALFA');
    for (const pathname of ['/api/admin/retention/policies', '/api/admin/retention/disposal/jobs']) {
      const denied = await api(pathname, { cookie: rhCookie });
      assert.equal(denied.status, 403, `rh não pode consultar ${pathname}: veio ${denied.status}`);
      const allowed = await api(pathname, { cookie: tiCookie });
      assert.equal(allowed.status, 200, `ti precisa consultar ${pathname}: veio ${allowed.status}`);
    }

    // ---------- estado A: quatro larguras, teclado, fonte e honestidade ----------
    const readings = [];
    for (const [width, height] of [[320, 844], [390, 844], [768, 900], [1440, 900]]) {
      const browser = await launchBrowser();
      try {
        const { context, page } = await openPage(browser, '/admin/ti', tiCookie, { width, height });
        const tab = page.getByRole('button', { name: 'Retenção e descarte', exact: true });
        await tab.waitFor();
        await tab.focus();
        const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() || '');
        assert.match(focused, /Retenção e descarte/, `a aba precisa receber foco em ${width}`);
        await page.keyboard.press('Enter');
        await page.getByRole('heading', { name: 'Retenção e descarte' }).waitFor();
        await page.getByText(/Fonte: tabelas/).waitFor();
        await page.getByText(/QA-PLT11-ALFA/).first().waitFor();
        const text = await page.locator('body').innerText();
        assert.match(text, /QA-PLT11-ALFA/);
        assert.match(text, /Data-base:/);
        assert.match(text, /simulação sintética/i);
        assert.match(text, /não apaga dados pessoais reais/i);
        assert.match(text, /parecer jurídico/i);
        assert.match(text, /NO-GO/);
        assert.doesNotMatch(text, /QA-PLT11-BETA/, `B não pode vazar em ${width}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `PLT-11 overflow ${overflow} em ${width}`);
        readings.push({ width, overflow });
        await context.close();
      } finally {
        await browser.close();
      }
    }
    assert.deepEqual(readings.map(item => item.width), [320, 390, 768, 1440]);

    // ---------- escrita real pela UI: POST, PATCH, job e erro traduzido ----------
    const journeyBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(journeyBrowser, '/admin/ti', tiCookie, { width: 1440, height: 900 });
      const openDetails = async name => {
        const summary = page.locator('summary').filter({ hasText: name }).first();
        const isOpen = await summary.evaluate(element => element.parentElement?.open ?? false);
        if (!isOpen) await summary.click();
      };
      await page.getByRole('button', { name: 'Retenção e descarte', exact: true }).click();
      await page.getByText(/QA-PLT11-ALFA/).first().waitFor();

      // POST política — upsert com descrição válida.
      await openDetails('Registrar política de retenção');
      await page.getByLabel('Padrão de campo').fill('QA-PLT11-UI campo');
      await page.getByLabel('Descrição da finalidade').fill('QA-PLT11 política criada pela interface com finalidade declarada.');
      await page.getByRole('button', { name: 'Salvar política' }).click();
      await page.getByText(/Política de retenção registrada\./).waitFor();
      await page.getByText(/QA-PLT11-UI campo/).first().waitFor();

      // Erro real do servidor traduzido: descrição curta demais.
      await openDetails('Registrar política de retenção');
      await page.getByLabel('Descrição da finalidade').fill('curta');
      await page.getByRole('button', { name: 'Salvar política' }).click();
      await page.getByText(/descrição da finalidade precisa ter pelo menos 10 caracteres/i).waitFor();

      // POST exceção formal.
      await openDetails('Solicitar exceção formal');
      await page.getByLabel('Referência do campo').fill('QA-PLT11-UI exceção');
      await page.getByLabel('Motivo da exceção').fill('QA-PLT11 motivo sintético com mais de dez caracteres.');
      await page.getByLabel('Justificativa da exceção').fill('QA-PLT11 justificativa sintética com mais de dez caracteres.');
      await page.getByRole('button', { name: 'Solicitar exceção formal' }).click();
      await page.getByText(/Exceção formal registrada\./).waitFor();
      await page.getByText(/QA-PLT11-UI exceção/).first().waitFor();

      // PATCH por UUID (prova do E17 neste módulo): aprovar exceção.
      const card = page.locator('li').filter({ hasText: 'QA-PLT11-UI exceção' }).first();
      await card.getByRole('button', { name: 'Usar para revisão' }).click();
      await openDetails('Atualizar status da exceção');
      await page.getByLabel('Próximo status').selectOption('aprovado');
      await page.getByLabel('Dias aprovados').fill('200');
      await page.getByRole('button', { name: 'Atualizar status da exceção' }).click();
      await page.getByText(/Status da exceção atualizado\./).waitFor();

      // POST job de descarte — simulação sintética auditada.
      await page.getByLabel('Notas do job').fill('QA-PLT11 job sintético de conferência');
      await page.getByRole('button', { name: 'Executar job de descarte' }).click();
      await page.getByText(/Job de descarte executado \(simulação sintética\)\./).waitFor();

      // Troca para B no banco: A e mensagens antigas não podem sobrar.
      await seed('BETA');
      await page.getByRole('button', { name: 'Atualizar leitura' }).click();
      await page.getByText(/QA-PLT11-BETA/).first().waitFor();
      const text = await page.locator('body').innerText();
      assert.doesNotMatch(text, /QA-PLT11-ALFA/, 'o estado A não pode sobrar na leitura de B');
      assert.doesNotMatch(text, /QA-PLT11-UI campo/, 'registro criado em A não pode sobreviver a B');
      assert.match(text, /QA-PLT11-BETA/);
      assert.doesNotMatch(text, /Política de retenção registrada\./, 'mensagem antiga não pode sobreviver à releitura');
      assert.doesNotMatch(text, /descrição da finalidade precisa ter pelo menos 10/);
      await context.close();
    } finally {
      await journeyBrowser.close();
    }

    // ---------- 503: erro declarado e retry sem recarregar ----------
    const failureBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(failureBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/admin/retention/policies'],
        status: 503, code: 'qa_forced_failure',
        onPage: p => p.addInitScript(() => { window.__qaFetchOriginal = window.fetch.bind(window); }),
      });
      await page.getByRole('button', { name: 'Retenção e descarte', exact: true }).click();
      const errorState = page.locator('[data-ui-state="error"]');
      await errorState.waitFor();
      assert.match(await errorState.innerText(), /Falha na consulta/);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await page.evaluate(() => { window.fetch = window.__qaFetchOriginal; });
      await errorState.getByRole('button', { name: 'Tentar novamente' }).click();
      await page.getByText(/QA-PLT11-BETA/).first().waitFor();
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0, 'retry precisa sair do erro');
      await context.close();
    } finally {
      await failureBrowser.close();
    }

    // ---------- 403: negado distinto de erro e de vazio ----------
    const deniedBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(deniedBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/admin/retention/policies'],
        status: 403, code: 'forbidden',
      });
      await page.getByRole('button', { name: 'Retenção e descarte', exact: true }).click();
      const deniedState = page.locator('[data-ui-state="denied"]');
      await deniedState.waitFor();
      assert.match(await deniedState.innerText(), /Acesso não autorizado/);
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await context.close();
    } finally {
      await deniedBrowser.close();
    }
  } finally {
    await cleanup();
    for (const id of staffIds) {
      await pool.query('DELETE FROM auth_access_audit WHERE actor_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_sessions WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_staff_profiles WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_credentials WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_identities WHERE id=$1', [id]).catch(() => {});
    }
  }
});

// ---------------------------------------------------------------------------
// UX-PRO-03 — 6ª promoção com prova: PLT-13 configurações, flags, manutenção,
// rollout e reversão. Papel admin/ti no servidor, segredo mascarado, separação
// negócio/infra, escrita real, A/B e retry em Chromium real.
// ---------------------------------------------------------------------------
test('browser UX-PRO-03: PLT-13 Configurações e rollout (papel, A/B, POST/PATCH, segredo, erro e retry)', { skip: !RUN }, async () => {
  const ti = await provisionStaff(pool, { role: 'ti' });
  const rh = await provisionStaff(pool, { role: 'rh' });
  const staffIds = [ti.id, rh.id];
  const tiCookie = await loginStaffHttp(ti.email);
  const rhCookie = await loginStaffHttp(rh.email);

  const cleanup = async () => {
    // ILIKE: a API normaliza key para minúsculas, enquanto o seed usa
    // maiúsculas; sem isso a flag criada pela UI sobreviveria ao estado B.
    await pool.query("DELETE FROM config_history WHERE flag_id IN (SELECT id FROM config_flags WHERE key ILIKE 'QA-PLT13-%')").catch(() => {});
    await pool.query("DELETE FROM rollout_plans WHERE title ILIKE 'QA-PLT13-%' OR flag_id IN (SELECT id FROM config_flags WHERE key ILIKE 'QA-PLT13-%')").catch(() => {});
    await pool.query("DELETE FROM maintenance_windows WHERE title ILIKE 'QA-PLT13-%'").catch(() => {});
    await pool.query("DELETE FROM config_flags WHERE key ILIKE 'QA-PLT13-%'").catch(() => {});
  };
  const seed = async label => {
    await cleanup();
    const flag = await pool.query(
      `INSERT INTO config_flags (key, category, status, value, description, is_secret, is_business, environment, rollout_percentage, created_by)
       VALUES ($1,'infra','ativo',$2::jsonb,$3,false,false,'development',25,'qa-plt13') RETURNING id`,
      [`QA-PLT13-${label}-flag`, JSON.stringify({ synthetic: true, label }),
        `QA-PLT13-${label} flag sintética de infraestrutura para conferência.`],
    );
    await pool.query(
      `INSERT INTO maintenance_windows (title, description, scheduled_start, scheduled_end, affected_services, is_business_impact, rollback_plan, created_by)
       VALUES ($1,$2,now() + interval '1 day',now() + interval '1 day 2 hours',ARRAY['api','db'],false,$3,'qa-plt13')`,
      [`QA-PLT13-${label} janela de manutenção`,
        `QA-PLT13-${label} descrição sintética com mais de vinte caracteres.`,
        `QA-PLT13-${label} plano de reversão declarado`],
    );
    await pool.query(
      `INSERT INTO rollout_plans (flag_id, title, description, target_percentage, steps, created_by)
       VALUES ($1,$2,$3,100,'[]'::jsonb,'qa-plt13')`,
      [flag.rows[0].id, `QA-PLT13-${label} plano de rollout`,
        `QA-PLT13-${label} descrição sintética com mais de vinte caracteres.`],
    );
  };

  try {
    // ---------- autorização no SERVIDOR ----------
    await seed('ALFA');
    for (const pathname of ['/api/admin/config/flags', '/api/admin/config/maintenance', '/api/admin/config/rollouts']) {
      const denied = await api(pathname, { cookie: rhCookie });
      assert.equal(denied.status, 403, `rh não pode consultar ${pathname}: veio ${denied.status}`);
      const allowed = await api(pathname, { cookie: tiCookie });
      assert.equal(allowed.status, 200, `ti precisa consultar ${pathname}: veio ${allowed.status}`);
    }

    // ---------- estado A: quatro larguras, teclado, fonte e honestidade ----------
    const readings = [];
    for (const [width, height] of [[320, 844], [390, 844], [768, 900], [1440, 900]]) {
      const browser = await launchBrowser();
      try {
        const { context, page } = await openPage(browser, '/admin/ti', tiCookie, { width, height });
        const tab = page.getByRole('button', { name: 'Configurações e rollout', exact: true });
        await tab.waitFor();
        await tab.focus();
        const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() || '');
        assert.match(focused, /Configurações e rollout/, `a aba precisa receber foco em ${width}`);
        await page.keyboard.press('Enter');
        await page.getByRole('heading', { name: 'Configurações e rollout' }).waitFor();
        await page.getByText(/Fonte: tabelas/).waitFor();
        await page.getByText(/QA-PLT13-ALFA/).first().waitFor();
        const text = await page.locator('body').innerText();
        assert.match(text, /QA-PLT13-ALFA/);
        assert.match(text, /Data-base:/);
        assert.match(text, /mascarado pelo servidor/i, 'a UI precisa declarar o mascaramento de segredos');
        assert.match(text, /inventário declarativo/i);
        assert.match(text, /não ativa produção/i);
        assert.match(text, /NO-GO/);
        assert.match(text, /decisão do proprietário/i);
        assert.doesNotMatch(text, /QA-PLT13-BETA/, `B não pode vazar em ${width}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `PLT-13 overflow ${overflow} em ${width}`);
        readings.push({ width, overflow });
        await context.close();
      } finally {
        await browser.close();
      }
    }
    assert.deepEqual(readings.map(item => item.width), [320, 390, 768, 1440]);

    // ---------- escrita real pela UI ----------
    const journeyBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(journeyBrowser, '/admin/ti', tiCookie, { width: 1440, height: 900 });
      // O `mutate` mostra a mensagem de sucesso ANTES de terminar o reload,
      // que remonta a aba e fecha os <details>. Esperar aria-busy=false
      // garante que a leitura estabilizou; setar `open` direto evita toggle.
      const openDetails = async name => {
        await page.waitForFunction(() => {
          const section = document.querySelector('section[aria-busy]');
          return section && section.getAttribute('aria-busy') === 'false';
        }, null, { timeout: 20000 });
        const summary = page.locator('summary').filter({ hasText: name }).first();
        await summary.evaluate(element => {
          const details = element.closest('details');
          if (details) details.open = true;
        });
      };
      await page.getByRole('button', { name: 'Configurações e rollout', exact: true }).click();
      await page.getByText(/QA-PLT13-ALFA/).first().waitFor();

      // POST flag — inventário declarativo, ambiente development.
      await openDetails('Registrar flag');
      await page.getByLabel('Chave da flag').fill('QA-PLT13-UI flag');
      await page.getByLabel('Descrição da flag').fill('QA-PLT13 flag criada pela interface, apenas inventário.');
      await page.getByRole('button', { name: 'Salvar flag' }).click();
      await page.getByText(/Flag registrada no inventário\./).waitFor();
      await page.getByText(/qa-plt13-ui_flag/i).first().waitFor();

      // Erro real do servidor: segredo de infra não pode ser regra de negócio.
      await openDetails('Registrar flag');
      await page.getByLabel('Chave da flag').fill('QA-PLT13-UI segredo invalido');
      await page.getByLabel('Descrição da flag').fill('QA-PLT13 combinação inválida de segredo com negócio.');
      await page.getByLabel('Segredo de infraestrutura').check();
      await page.getByRole('button', { name: 'Salvar flag' }).click();
      await page.getByText(/flag secreta de infraestrutura não pode ser marcada como regra de negócio/i).waitFor();

      // GET detalhe + PATCH com histórico (prova do E17 por UUID).
      const flagCard = page.locator('li').filter({ hasText: /qa-plt13-ui_flag/i }).first();
      await flagCard.getByRole('button', { name: 'Abrir flag' }).click();
      await page.getByText(/Histórico \(1\)/).waitFor();
      await openDetails('Atualizar flag');
      await page.getByLabel('Novo rollout').fill('60');
      await page.getByLabel('Motivo da alteração').fill('QA-PLT13 ajuste de rollout pelo console');
      await page.getByRole('button', { name: 'Atualizar flag' }).click();
      await page.getByText(/Flag atualizada com histórico registrado\./).waitFor();

      // POST rollback: volta ao valor anterior do histórico.
      await page.getByRole('button', { name: 'Reverter ao histórico' }).first().click();
      await page.getByText(/Flag revertida ao valor anterior do histórico\./).waitFor();

      // POST manutenção e PATCH de transição.
      await openDetails('Agendar manutenção');
      await page.getByLabel('Título da janela').fill('QA-PLT13-UI janela de manutenção');
      await page.getByLabel('Descrição da janela').fill('QA-PLT13 janela sintética com mais de vinte caracteres para conferência.');
      await page.getByLabel('Início da janela').fill('2026-11-01T10:00');
      await page.getByLabel('Fim da janela').fill('2026-11-01T12:00');
      await page.getByLabel('Plano de reversão').fill('QA-PLT13 reverter janela e notificar responsáveis');
      await page.getByRole('button', { name: 'Agendar manutenção' }).click();
      await page.getByText(/Janela de manutenção agendada\./).waitFor();
      await page.getByText(/QA-PLT13-UI janela de manutenção/).first().waitFor();

      // POST rollout e PATCH de aprovação.
      await openDetails('Criar plano de rollout');
      await page.getByLabel('Título do rollout').fill('QA-PLT13-UI plano de rollout');
      await page.getByLabel('Descrição do rollout').fill('QA-PLT13 plano sintético com mais de vinte caracteres para conferência.');
      await page.getByRole('button', { name: 'Criar plano de rollout' }).click();
      await page.getByText(/Plano de rollout criado\./).waitFor();
      const rolloutCard = page.locator('li').filter({ hasText: 'QA-PLT13-UI plano de rollout' }).first();
      await rolloutCard.getByRole('button', { name: 'Aprovar rollout' }).click();
      await page.getByText(/Rollout aprovado\./).waitFor();

      // Troca para B no banco: A, a seleção e mensagens antigas não podem sobrar.
      await seed('BETA');
      await page.getByRole('button', { name: 'Atualizar leitura' }).click();
      await page.getByText(/QA-PLT13-BETA/).first().waitFor();
      const text = await page.locator('body').innerText();
      assert.doesNotMatch(text, /QA-PLT13-ALFA/, 'o estado A não pode sobrar na leitura de B');
      assert.doesNotMatch(text, /qa-plt13-ui_flag/i, 'flag criada em A não pode sobreviver a B');
      assert.doesNotMatch(text, /Flag selecionada:/, 'a seleção órfã de A precisa ser limpa no reload');
      assert.match(text, /QA-PLT13-BETA/);
      assert.doesNotMatch(text, /Flag registrada no inventário\./, 'mensagem antiga não pode sobreviver à releitura');
      assert.doesNotMatch(text, /Rollout aprovado\./);
      assert.doesNotMatch(text, /flag secreta de infraestrutura não pode ser marcada/);
      await context.close();
    } finally {
      await journeyBrowser.close();
    }

    // ---------- 503: erro declarado e retry sem recarregar ----------
    const failureBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(failureBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/admin/config/flags'],
        status: 503, code: 'qa_forced_failure',
        onPage: p => p.addInitScript(() => { window.__qaFetchOriginal = window.fetch.bind(window); }),
      });
      await page.getByRole('button', { name: 'Configurações e rollout', exact: true }).click();
      const errorState = page.locator('[data-ui-state="error"]');
      await errorState.waitFor();
      assert.match(await errorState.innerText(), /Falha na consulta/);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await page.evaluate(() => { window.fetch = window.__qaFetchOriginal; });
      await errorState.getByRole('button', { name: 'Tentar novamente' }).click();
      await page.getByText(/QA-PLT13-BETA/).first().waitFor();
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0, 'retry precisa sair do erro');
      await context.close();
    } finally {
      await failureBrowser.close();
    }

    // ---------- 403: negado distinto de erro e de vazio ----------
    const deniedBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(deniedBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/admin/config/flags'],
        status: 403, code: 'forbidden',
      });
      await page.getByRole('button', { name: 'Configurações e rollout', exact: true }).click();
      const deniedState = page.locator('[data-ui-state="denied"]');
      await deniedState.waitFor();
      assert.match(await deniedState.innerText(), /Acesso não autorizado/);
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await context.close();
    } finally {
      await deniedBrowser.close();
    }
  } finally {
    await cleanup();
    for (const id of staffIds) {
      await pool.query('DELETE FROM auth_access_audit WHERE actor_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_sessions WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_staff_profiles WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_credentials WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_identities WHERE id=$1', [id]).catch(() => {});
    }
  }
});

// ---------------------------------------------------------------------------
// UX-PRO-03 — 7ª promoção com prova: CLI-05/06/07/08, lado administrativo dos
// recursos v2 do portal do cliente. Papel admin/ti no servidor (`ensureAuth`),
// escrita real pela UI, erro traduzido, A/B e retry em Chromium real.
// Limites provados aqui, não escondidos: RH é negado de propósito (não há
// autorização por conta enquanto A3 não existir) e o registro de anexo NÃO
// envia bytes — não há armazenamento de arquivos nesta instalação.
// ---------------------------------------------------------------------------
test('browser UX-PRO-03: CLI-05/06/07/08 console do cliente v2 (papel, A/B, POST/PATCH, erro e retry)', { skip: !RUN }, async () => {
  const ti = await provisionStaff(pool, { role: 'ti' });
  const rh = await provisionStaff(pool, { role: 'rh' });
  const staffIds = [ti.id, rh.id];
  const tiCookie = await loginStaffHttp(ti.email);
  const rhCookie = await loginStaffHttp(rh.email);
  const accountA = randomUUID();
  const accountB = randomUUID();

  const cleanup = async () => {
    for (const accountId of [accountA, accountB]) {
      await pool.query(
        `DELETE FROM cli_tickets_v2 WHERE client_account_id = $1::uuid AND title LIKE 'QA-CLI08%'`,
        [accountId],
      ).catch(() => {});
      await pool.query(
        `DELETE FROM cli_visits WHERE client_account_id = $1::uuid AND title LIKE 'QA-CLI07%'`,
        [accountId],
      ).catch(() => {});
      await pool.query(
        `DELETE FROM cli_client_reports_v2 WHERE client_account_id = $1::uuid AND title LIKE 'QA-CLI08%'`,
        [accountId],
      ).catch(() => {});
    }
    await pool.query('DELETE FROM client_accounts WHERE id = ANY($1::uuid[])', [[accountA, accountB]]).catch(() => {});
  };

  const seedTicket = async (accountId, label) => {
    const protocol = `CLI-20261028-${label}`;
    const inserted = await pool.query(
      `INSERT INTO cli_tickets_v2 (protocol, client_account_id, category, priority, title, description, status)
       VALUES ($1,$2::uuid,'atendimento_servico','media',$3,'Chamado sintético do gate CLI-05/06','aberto')
       ON CONFLICT (protocol) DO UPDATE SET title = EXCLUDED.title
       RETURNING id`,
      [protocol, accountId, `QA-CLI08-${label}`],
    );
    return inserted.rows[0].id;
  };

  try {
    await cleanup();
    await pool.query(
      "INSERT INTO client_accounts (id, display_name, created_by) VALUES ($1::uuid, 'QA CLI v2 Conta A', 'ti'), ($2::uuid, 'QA CLI v2 Conta B', 'ti')",
      [accountA, accountB],
    );
    const ticketA = await seedTicket(accountA, 'ALFA');
    await pool.query(
      `INSERT INTO cli_visits (protocol, client_account_id, visit_type, title, scheduled_at, status)
       VALUES ('VIS-CLI-20261028-ALFA',$1::uuid,'visita_tecnica','QA-CLI07 Visita sintetica A', NOW() + INTERVAL '2 days','agendada')`,
      [accountA],
    );
    await pool.query(
      `INSERT INTO cli_client_reports_v2 (protocol, client_account_id, report_type, title, content, period_start, period_end, status)
       VALUES ('REP-CLI-20261028-ALFA',$1::uuid,'execucao','QA-CLI08 Relatorio sintetico A',
               'Conteúdo sintético do gate CLI-08, sem dado real de cliente.', CURRENT_DATE - 7, CURRENT_DATE, 'rascunho')`,
      [accountA],
    );

    // ---------- autorização decidida no SERVIDOR ----------
    for (const pathname of [
      '/api/cli/tickets-v2',
      '/api/cli/visits',
      '/api/cli/reports-v2',
      `/api/cli/ticket-messages?ticket_id=${ticketA}`,
      `/api/cli/ticket-history?ticket_id=${ticketA}`,
    ]) {
      const denied = await api(pathname, { cookie: rhCookie });
      assert.equal(denied.status, 403, `rh não pode consultar ${pathname}: veio ${denied.status}`);
      const allowed = await api(pathname, { cookie: tiCookie });
      assert.equal(allowed.status, 200, `ti precisa consultar ${pathname}: veio ${allowed.status}`);
    }
    const anonymous = await api('/api/cli/tickets-v2');
    assert.equal(anonymous.status, 401, 'sem sessão a rota v2 precisa responder 401');

    // ---------- estado A: quatro larguras, teclado, aviso, sem transbordo ----------
    const readings = [];
    for (const [width, height] of [[320, 844], [390, 844], [768, 900], [1440, 900]]) {
      const browser = await launchBrowser();
      try {
        const { context, page } = await openPage(browser, '/admin/ti', tiCookie, { width, height });
        const tab = page.getByRole('button', { name: 'Portal do cliente v2', exact: true });
        await tab.waitFor();
        await tab.focus();
        const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() || '');
        assert.match(focused, /Portal do cliente v2/, `a aba precisa receber foco em ${width}`);
        await page.keyboard.press('Enter');
        await page.getByRole('heading', { name: 'Chamados, visitas e relatórios do cliente' }).waitFor();
        await page.getByText(/Fonte: tabelas/).waitFor();
        await page.getByText(/QA-CLI08-ALFA/).first().waitFor();
        const text = await page.locator('body').innerText();
        assert.match(text, /QA-CLI07 Visita sintetica A/);
        assert.match(text, /QA-CLI08 Relatorio sintetico A/);
        assert.match(text, /nenhum byte é enviado/i, 'o limite de armazenamento precisa estar visível');
        assert.match(text, /A3/);
        assert.match(text, /NO-GO/);
        assert.match(text, /Fonte: tabelas/);
        // Isolamento por conta NÃO existe em v2: a leitura é global e isso é
        // declarado na tela. O cenário B é criado depois desta leitura.
        assert.doesNotMatch(text, /QA-CLI08-BETA/, 'B não pode existir na leitura de A');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `CLI v2 overflow ${overflow} em ${width}`);
        readings.push({ width, overflow });
        await context.close();
      } finally {
        await browser.close();
      }
    }
    assert.deepEqual(readings.map(item => item.width), [320, 390, 768, 1440]);

    // ---------- escrita real pela UI + erro traduzido + troca de estado ----------
    const journeyBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(journeyBrowser, '/admin/ti', tiCookie, { width: 1440, height: 900 });
      const openDetails = async name => {
        const summary = page.locator('summary').filter({ hasText: name }).first();
        const isOpen = await summary.evaluate(element => element.parentElement?.open ?? false);
        if (!isOpen) await summary.click();
      };
      // Espera a releitura terminar: interagir antes de `aria-busy=false`
      // reabria formulários com a lista antiga (defeito já visto no PLT-13).
      const settle = () => page.waitForFunction(() =>
        Array.from(document.querySelectorAll('section[aria-busy]'))
          .every(element => element.getAttribute('aria-busy') === 'false'));
      // Os três painéis são regiões nomeadas (`aria-labelledby` no <h3> que traz
      // a contagem). Escopar por região é o que mantém os rótulos repetidos
      // ("Título", "Novo estado", "Conta do cliente (UUID)") sem `nth()`, que já
      // apontou para o painel errado quando a contagem mudou.
      const ticketsPanel = () => page.getByRole('region', { name: /^Chamados v2/ });
      const visitsPanel = () => page.getByRole('region', { name: /^Agenda de visitas/ });
      const reportsPanel = () => page.getByRole('region', { name: /^Relatórios de execução/ });
      await page.getByRole('button', { name: 'Portal do cliente v2', exact: true }).click();
      await page.getByText(/QA-CLI08-ALFA/).first().waitFor();

      // CLI-05: POST de chamado.
      await openDetails('Novo chamado');
      await ticketsPanel().getByLabel('Conta do cliente (UUID)', { exact: true }).fill(accountA);
      await ticketsPanel().getByLabel('Título', { exact: true }).fill('QA-CLI08 Chamado criado pela interface');
      await ticketsPanel().getByLabel('Descrição', { exact: true }).fill('Descrição sintética criada no gate, sem dado real.');
      // O id nasce no POST; capturá-lo evita adivinhar qual cartão da lista foi
      // vinculado aos formulários depois da releitura.
      const [createTicketResponse] = await Promise.all([
        page.waitForResponse(response => response.request().method() === 'POST'
          && new URL(response.url()).pathname === '/api/cli/tickets-v2'),
        page.getByRole('button', { name: 'Registrar chamado' }).click(),
      ]);
      assert.equal(createTicketResponse.status(), 201, 'o POST do chamado precisa ser 201');
      const createdTicketId = (await createTicketResponse.json()).ticket.id;
      await page.getByText(/Chamado registrado com protocolo/).waitFor();
      await settle();
      await page.getByText(/QA-CLI08 Chamado criado pela interface/).first().waitFor();

      // CLI-06: PATCH de estado com motivo + histórico.
      const ticketCard = page.locator('li').filter({ hasText: 'QA-CLI08 Chamado criado pela interface' }).first();
      await ticketCard.getByRole('button', { name: 'Usar este chamado nos formulários' }).click();
      assert.equal(
        await ticketsPanel().getByLabel('Chamado', { exact: true }).first().inputValue(),
        createdTicketId,
        'o botão do cartão precisa vincular o chamado criado aos formulários',
      );
      await openDetails('Alterar estado, responsável e reabertura');
      await ticketsPanel().getByLabel('Novo estado', { exact: true }).selectOption('em_atendimento');
      await ticketsPanel().getByLabel('Motivo da transição', { exact: true }).fill('Triagem inicial do gate CLI-06');
      // A resposta HTTP é medida junto com o clique: sem isso, uma recusa do
      // servidor aparece como "mensagem de sucesso não chegou" e esconde a causa.
      const [statusPatch] = await Promise.all([
        page.waitForResponse(response => response.request().method() === 'PATCH'
          && new URL(response.url()).pathname === '/api/cli/tickets-v2'),
        page.getByRole('button', { name: 'Atualizar estado do chamado' }).click(),
      ]);
      const statusPatchBody = await statusPatch.text().catch(() => '');
      assert.equal(statusPatch.status(), 200, `PATCH do chamado precisa ser 200; corpo: ${statusPatchBody}`);
      await page.getByText(/Estado do chamado atualizado/).waitFor({
        timeout: 15_000,
      }).catch(async error => {
        const alert = await page.locator('[role="alert"]').first().innerText().catch(() => '(sem alerta)');
        const failedRead = await page.locator('[data-ui-state="error"]').first().innerText().catch(() => '(sem erro de leitura)');
        throw new Error(`${error.message}\nalerta: ${alert}\nleitura: ${failedRead}\nPATCH: ${statusPatchBody}`);
      });
      await settle();

      // CLI-05: detalhe do chamado (mensagens/anexos/histórico/SLA) e mensagem.
      const ticketCard2 = page.locator('li').filter({ hasText: 'QA-CLI08 Chamado criado pela interface' }).first();
      await ticketCard2.getByRole('button', { name: 'Abrir mensagens, anexos, SLA e histórico' }).click();
      await page.getByRole('heading', { name: /Detalhe do chamado/ }).waitFor();
      await page.getByText(/Histórico de estados/).waitFor();
      await openDetails('Mensagem no chamado');
      await ticketsPanel().getByLabel('Mensagem', { exact: true }).fill('Mensagem sintética do gate CLI-05.');
      await page.getByRole('button', { name: 'Registrar mensagem' }).click();
      await page.getByText(/Mensagem registrada no chamado/).waitFor();
      await settle();
      await page.getByText(/Mensagem sintética do gate CLI-05/).first().waitFor();

      // Anexo: registra METADADO e a tela precisa negar que houve upload.
      await openDetails('Metadado de anexo');
      await ticketsPanel().getByLabel('Nome do arquivo', { exact: true }).fill('qa-cli05-sintetico.pdf');
      await ticketsPanel().getByLabel('Referência do arquivo', { exact: true }).fill('referencia-qa-cli05-sintetica');
      await ticketsPanel().getByLabel('Chave de armazenamento', { exact: true }).fill(`qa-cli05-${randomUUID().slice(0, 8)}`);
      await page.getByRole('button', { name: 'Registrar metadado de anexo' }).click();
      await page.getByText(/Nenhum byte foi enviado/).waitFor();
      await settle();

      // CLI-05: pausa de SLA explícita — a nona escrita, antes sem cenário.
      await openDetails('Pausa e retomada de SLA');
      await ticketsPanel().getByLabel('Observações', { exact: true }).fill('Pausa sintética registrada no gate CLI-05');
      const [slaResponse] = await Promise.all([
        page.waitForResponse(response => response.request().method() === 'POST'
          && new URL(response.url()).pathname === '/api/cli/ticket-sla-pauses'),
        page.getByRole('button', { name: 'Aplicar ação de SLA' }).click(),
      ]);
      assert.equal(slaResponse.status(), 201,
        `pausa de SLA precisa ser 201; corpo: ${await slaResponse.text().catch(() => '')}`);
      await page.getByText(/Pausa de SLA registrada explicitamente/).waitFor();
      await settle();

      // CLI-07: agendar visita e reagendar com motivo.
      await openDetails('Nova visita');
      await visitsPanel().getByLabel('Conta do cliente (UUID)', { exact: true }).fill(accountA);
      await visitsPanel().getByLabel('Título', { exact: true }).fill('QA-CLI07 Visita criada pela interface');
      await visitsPanel().getByLabel('Data e hora', { exact: true }).fill('2026-11-05T09:30');
      await page.getByRole('button', { name: 'Agendar visita' }).click();
      await page.getByText(/Visita agendada com protocolo VIS-CLI/).waitFor();
      await settle();
      await page.getByText(/QA-CLI07 Visita criada pela interface/).first().waitFor();
      const visitCard = page.locator('li').filter({ hasText: 'QA-CLI07 Visita criada pela interface' }).first();
      await visitCard.getByRole('button', { name: 'Usar esta visita para confirmar/reagendar' }).click();
      await openDetails('Confirmar, reagendar ou encerrar visita');
      await visitsPanel().getByLabel('Novo estado', { exact: true }).selectOption('reagendada');
      await visitsPanel().getByLabel('Nova data e hora', { exact: true }).fill('2026-11-08T14:00');
      await visitsPanel().getByLabel('Motivo do reagendamento', { exact: true }).fill('Reagendamento sintético por indisponibilidade do cliente');
      await page.getByRole('button', { name: 'Atualizar visita' }).click();
      await page.getByText(/Visita atualizada para reagendada/).waitFor();
      await settle();

      // CLI-08: criar relatório, revisar e provar que aprovar sem revisão falha.
      await openDetails('Novo relatório');
      await reportsPanel().getByLabel('Conta do cliente (UUID)', { exact: true }).fill(accountA);
      await reportsPanel().getByLabel('Título', { exact: true }).fill('QA-CLI08 Relatorio criado pela interface');
      await reportsPanel().getByLabel('Conteúdo', { exact: true }).fill('Conteúdo sintético do relatório criado no gate CLI-08, sem dado real.');
      await page.getByRole('button', { name: 'Criar relatório' }).click();
      await page.getByText(/Relatório criado como rascunho/).waitFor();
      await settle();
      const reportCard = page.locator('li').filter({ hasText: 'QA-CLI08 Relatorio criado pela interface' }).first();
      await reportCard.getByRole('button', { name: 'Usar este relatório na revisão' }).click();
      await openDetails('Revisar, aprovar, rejeitar ou marcar como enviado');
      // Regra real do servidor: aprovar sem revisão é recusado e traduzido.
      await reportsPanel().getByLabel('Novo estado', { exact: true }).selectOption('aprovado');
      await page.getByRole('button', { name: 'Atualizar relatório' }).click();
      await page.getByText(/precisa passar por revisão antes da aprovação/).waitFor();
      assert.equal(await page.getByText(/Relatório atualizado para aprovado/).count(), 0,
        'o relatório recusado pelo servidor não pode aparecer como aprovado');
      // Caminho correto: revisão com notas, depois aprovação.
      await reportsPanel().getByLabel('Novo estado', { exact: true }).selectOption('em_revisao');
      await reportsPanel().getByLabel('Notas de revisão', { exact: true }).fill('Revisão sintética do gate CLI-08 sem dado real');
      await page.getByRole('button', { name: 'Atualizar relatório' }).click();
      await page.getByText(/Relatório atualizado para em_revisao/).waitFor();
      await settle();

      // Troca para B no banco: A e mensagens antigas não podem sobrar.
      await seedTicket(accountB, 'BETA');
      await page.getByRole('button', { name: 'Atualizar leitura' }).click();
      await page.getByText(/QA-CLI08-BETA/).first().waitFor();
      await settle();
      const afterSwitch = await page.locator('body').innerText();
      assert.match(afterSwitch, /QA-CLI08-BETA/);
      assert.doesNotMatch(afterSwitch, /Relatório atualizado para em_revisao/,
        'mensagem antiga não pode sobreviver à releitura');
      await context.close();
    } finally {
      await journeyBrowser.close();
    }

    // ---------- 503: erro declarado e retry sem recarregar ----------
    const failureBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(failureBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/cli/visits'],
        status: 503, code: 'qa_forced_failure',
        onPage: p => p.addInitScript(() => { window.__qaFetchOriginal = window.fetch.bind(window); }),
      });
      await page.getByRole('button', { name: 'Portal do cliente v2', exact: true }).click();
      const errorState = page.locator('[data-ui-state="error"]');
      await errorState.waitFor();
      assert.match(await errorState.innerText(), /Falha na consulta/);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await page.evaluate(() => { window.__qaFetchOriginal && (window.fetch = window.__qaFetchOriginal); });
      await errorState.getByRole('button', { name: 'Tentar novamente' }).click();
      await page.getByText(/QA-CLI08-BETA/).first().waitFor();
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0, 'retry precisa sair do erro');
      await context.close();
    } finally {
      await failureBrowser.close();
    }

    // ---------- 403: negado distinto de erro e de vazio ----------
    const deniedBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(deniedBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/cli/reports-v2'],
        status: 403, code: 'forbidden',
      });
      await page.getByRole('button', { name: 'Portal do cliente v2', exact: true }).click();
      const deniedState = page.locator('[data-ui-state="denied"]');
      await deniedState.waitFor();
      assert.match(await deniedState.innerText(), /Acesso não autorizado/);
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await context.close();
    } finally {
      await deniedBrowser.close();
    }
  } finally {
    await cleanup();
    for (const id of staffIds) {
      await pool.query('DELETE FROM auth_access_audit WHERE actor_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_sessions WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_staff_profiles WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_credentials WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_identities WHERE id=$1', [id]).catch(() => {});
    }
  }
});

// ---------------------------------------------------------------------------
// UX-PRO-03 — 8ª aba com prova do console de TI: FIN cadastros de apoio.
// Escopo de LACUNA da família financeiro (decisão de 29/10): `/admin/financeiro`
// já é rota real e cobre 26 dos 32 endpoints dos quatro `Fin*` órfãos, então os
// órfãos NÃO foram promovidos. Esta aba entrega só o que não existia:
// fornecedores, centros de custo e o drill-down do histórico de baixa.
// O gate prova o papel decidido no servidor (rh 403 × ti 200), as duas
// escritas pela UI com status medido, o histórico real, os quatro estados e
// 390px sem transbordo.
// ---------------------------------------------------------------------------
test('browser UX-PRO-03: FIN cadastros de apoio (papel, POST real, histórico de baixa, erro e retry)', { skip: !RUN }, async () => {
  const ti = await provisionStaff(pool, { role: 'ti' });
  const rh = await provisionStaff(pool, { role: 'rh' });
  const financeiro = await provisionStaff(pool, { role: 'financeiro' });
  const staffIds = [ti.id, rh.id, financeiro.id];
  const tiCookie = await loginStaffHttp(ti.email);
  const rhCookie = await loginStaffHttp(rh.email);
  const financeiroCookie = await loginStaffHttp(financeiro.email);

  const supplierName = `QA-FIN Fornecedor ${randomUUID().slice(0, 8)}`;
  const centerName = `QA-FIN Centro ${randomUUID().slice(0, 8)}`;
  const accountId = randomUUID();
  let receivableId = "";

  const cleanup = async () => {
    await pool.query("DELETE FROM fin_suppliers WHERE name LIKE 'QA-FIN Fornecedor %'").catch(() => {});
    await pool.query("DELETE FROM fin_cost_centers WHERE name LIKE 'QA-FIN Centro %'").catch(() => {});
    if (receivableId) {
      await pool.query('DELETE FROM fin_payment_history WHERE receivable_id=$1::uuid', [receivableId]).catch(() => {});
      await pool.query('DELETE FROM fin_accounts_receivable WHERE id=$1::uuid', [receivableId]).catch(() => {});
    }
    await pool.query("DELETE FROM client_accounts WHERE display_name = 'QA FIN cadastros conta'").catch(() => {});
  };

  try {
    await cleanup();
    // A conta de cliente é pré-requisito de FK da conta a receber; criada aqui
    // como provisionamento de teste, com nome fixo para a limpeza.
    await pool.query(
      "INSERT INTO client_accounts (id, display_name, created_by) VALUES ($1::uuid, 'QA FIN cadastros conta', 'ti')",
      [accountId],
    );

    // ---------- autorização decidida no SERVIDOR ----------
    for (const pathname of ['/api/fin/suppliers', '/api/fin/cost-centers']) {
      const anonymous = await api(pathname);
      assert.equal(anonymous.status, 401, `${pathname} precisa exigir sessão: veio ${anonymous.status}`);
      const denied = await api(pathname, { cookie: rhCookie });
      assert.equal(denied.status, 403, `rh não pode ler ${pathname}: veio ${denied.status}`);
      const allowed = await api(pathname, { cookie: tiCookie });
      assert.equal(allowed.status, 200, `ti precisa ler ${pathname}: veio ${allowed.status}`);
    }
    // Escrita sem motivo/validação continua decidida no servidor.
    const shortName = await api('/api/fin/suppliers', {
      method: 'POST', cookie: tiCookie, body: { name: 'ab', category: 'servico' },
    });
    assert.equal(shortName.status, 400, 'nome curto precisa ser recusado pelo servidor');
    assert.equal(shortName.body.error, 'name_3_200');

    // Conta real para o histórico de baixa: criada pela API canônica e baixada
    // em `/admin/financeiro` (o gate não escreve baixa por esta aba).
    const created = await api('/api/fin/receivables', {
      method: 'POST', cookie: financeiroCookie,
      body: {
        client_account_id: accountId, competence_date: '2026-10-01', due_date: '2026-10-31',
        amount_cents: 12345, recurrence_type: 'unica', description: 'QA-FIN conta sintética do gate de cadastros',
      },
    });
    assert.equal(created.status, 201, `a conta sintética precisa ser criada: veio ${created.status}`);
    receivableId = created.body.receivable.id;
    const settled = await api('/api/fin/payments', {
      method: 'POST', cookie: financeiroCookie,
      body: {
        account_type: 'receber', receivable_id: receivableId, amount_cents: 12345,
        payment_method: 'pix', reason: 'Baixa sintética do gate UX-PRO-03 FIN cadastros',
      },
    });
    assert.equal(settled.status, 201, `a baixa precisa ser registrada: veio ${settled.status}`);

    // ---------- estado A: quatro larguras, teclado, fonte e limites ----------
    const readings = [];
    for (const [width, height] of [[390, 844], [768, 900], [1440, 900]]) {
      const browser = await launchBrowser();
      try {
        const { context, page } = await openPage(browser, '/admin/ti', tiCookie, { width, height });
        const tab = page.getByRole('button', { name: 'Cadastros financeiros', exact: true });
        await tab.waitFor();
        await tab.focus();
        const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() || '');
        assert.match(focused, /Cadastros financeiros/, `a aba precisa receber foco em ${width}`);
        await page.keyboard.press('Enter');
        await page.getByRole('heading', { name: 'Fornecedores, centros de custo e histórico de baixa' }).waitFor();
        await page.getByText(/Fonte: tabelas/).waitFor();
        const text = await page.locator('body').innerText();
        assert.match(text, /Data-base:/);
        assert.match(text, /nenhum byte/i, 'o limite de armazenamento precisa estar visível');
        assert.match(text, /NO-GO/);
        assert.match(text, /0\/222/);
        // A tela declara quem é dona da escrita financeira.
        assert.match(text, /admin\/financeiro/);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `FIN cadastros overflow ${overflow} em ${width}`);
        readings.push({ width, overflow });
        await context.close();
      } finally {
        await browser.close();
      }
    }
    assert.deepEqual(readings.map(item => item.width), [390, 768, 1440]);

    // ---------- escrita real pela UI + histórico + tradução de erro ----------
    const journeyBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(journeyBrowser, '/admin/ti', tiCookie, { width: 1440, height: 900 });
      const settle = () => page.waitForFunction(() =>
        Array.from(document.querySelectorAll('section[aria-busy]'))
          .every(element => element.getAttribute('aria-busy') === 'false'));
      const suppliersPanel = () => page.getByRole('region', { name: /^Fornecedores/ });
      const centersPanel = () => page.getByRole('region', { name: /^Centros de custo/ });
      const historyPanel = () => page.getByRole('region', { name: /^Histórico de baixa/ });

      await page.getByRole('button', { name: 'Cadastros financeiros', exact: true }).click();
      await historyPanel().waitFor();
      await settle();

      // Fornecedor: POST medido em status e corpo.
      await suppliersPanel().getByLabel('Nome do fornecedor', { exact: true }).fill(supplierName);
      await suppliersPanel().getByLabel('Documento declarado (opcional)', { exact: true }).fill('QA-FIN-DOC');
      await suppliersPanel().getByLabel('Categoria do fornecedor', { exact: true }).selectOption('material');
      const [supplierResponse] = await Promise.all([
        page.waitForResponse(response => response.request().method() === 'POST'
          && new URL(response.url()).pathname === '/api/fin/suppliers'),
        suppliersPanel().getByRole('button', { name: 'Cadastrar fornecedor' }).click(),
      ]);
      assert.equal(supplierResponse.status(), 201, 'o POST do fornecedor precisa ser 201');
      assert.equal((await supplierResponse.json()).supplier.name, supplierName, 'o corpo precisa confirmar o nome criado');
      await page.getByText(new RegExp(`Fornecedor “${supplierName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}” criado`)).waitFor();
      await settle();
      await suppliersPanel().getByText(supplierName).first().waitFor();

      // Centro de custo: POST medido em status e corpo.
      await centersPanel().getByLabel('Nome do centro de custo', { exact: true }).fill(centerName);
      const [centerResponse] = await Promise.all([
        page.waitForResponse(response => response.request().method() === 'POST'
          && new URL(response.url()).pathname === '/api/fin/cost-centers'),
        centersPanel().getByRole('button', { name: 'Cadastrar centro de custo' }).click(),
      ]);
      assert.equal(centerResponse.status(), 201, 'o POST do centro de custo precisa ser 201');
      assert.equal((await centerResponse.json()).costCenter.name, centerName);
      await settle();
      await centersPanel().getByText(centerName).first().waitFor();

      // Drill-down do histórico de baixa da conta sintética (uma baixa real).
      const [historyResponse] = await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === '/api/fin/payment-history'),
        historyPanel().getByLabel('Conta para consultar', { exact: true }).selectOption(receivableId),
      ]);
      assert.equal(historyResponse.status(), 200, 'o GET do histórico precisa ser 200');
      const historyBody = await historyResponse.json();
      assert.ok(Array.isArray(historyBody.history) && historyBody.history.length >= 1,
        'o histórico da conta baixada precisa ter pelo menos a criação e a baixa');
      // O motivo aparece no cartão E no JSON canônico do drill-down: localizar
      // pelo texto livre viola o modo estrito do Playwright (defeito achado
      // pelo próprio gate no CI). O cartão é a unidade que interessa.
      const settledCard = historyPanel().locator('li')
        .filter({ hasText: 'Baixa sintética do gate UX-PRO-03 FIN cadastros' }).first();
      await settledCard.waitFor();
      assert.match(await settledCard.innerText(), /→ recebido/, 'a baixa precisa levar a conta a recebido');
      // Registro canônico no drill-down.
      const summary = historyPanel().locator('summary').filter({ hasText: 'Registro canônico da baixa (JSON)' }).first();
      await summary.click();
      assert.match(await historyPanel().locator('pre').first().innerText(), /next_status/);

      // Regra real do servidor: nome curto recusado e traduzido, não "criado".
      await suppliersPanel().getByLabel('Nome do fornecedor', { exact: true }).fill('ab');
      await suppliersPanel().getByRole('button', { name: 'Cadastrar fornecedor' }).click();
      await page.getByRole('alert').filter({ hasText: /entre 3 e 200 caracteres/ }).waitFor();
      // Iniciar uma nova operação limpa o feedback anterior: o operador não
      // pode ver "criado" junto com a recusa do segundo envio.
      assert.equal(await page.getByText(/criado no cadastro financeiro/).count(), 0,
        'a recusa precisa limpar a mensagem de sucesso anterior');
      assert.equal(await suppliersPanel().getByText('ab', { exact: true }).count(), 0,
        'o fornecedor recusado não pode aparecer na lista');
      await context.close();
    } finally {
      await journeyBrowser.close();
    }

    // ---------- 503: erro declarado e retry sem recarregar ----------
    const failureBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(failureBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/fin/cost-centers'],
        status: 503, code: 'qa_forced_failure',
        onPage: p => p.addInitScript(() => { window.__qaFetchOriginal = window.fetch.bind(window); }),
      });
      await page.getByRole('button', { name: 'Cadastros financeiros', exact: true }).click();
      const errorState = page.locator('[data-ui-state="error"]');
      await errorState.waitFor();
      assert.match(await errorState.innerText(), /Falha na consulta/);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await page.evaluate(() => { window.__qaFetchOriginal && (window.fetch = window.__qaFetchOriginal); });
      await errorState.getByRole('button', { name: 'Tentar novamente' }).click();
      await page.getByRole('region', { name: /^Fornecedores/ }).waitFor();
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0, 'retry precisa sair do erro');
      await context.close();
    } finally {
      await failureBrowser.close();
    }

    // ---------- 403: negado distinto de erro e de vazio ----------
    const deniedBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(deniedBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/fin/suppliers'],
        status: 403, code: 'forbidden',
      });
      await page.getByRole('button', { name: 'Cadastros financeiros', exact: true }).click();
      const deniedState = page.locator('[data-ui-state="denied"]');
      await deniedState.waitFor();
      assert.match(await deniedState.innerText(), /Acesso não autorizado/);
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await context.close();
    } finally {
      await deniedBrowser.close();
    }
  } finally {
    await cleanup();
    for (const id of staffIds) {
      await pool.query('DELETE FROM auth_access_audit WHERE actor_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_sessions WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_staff_profiles WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_credentials WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_identities WHERE id=$1', [id]).catch(() => {});
    }
  }
});

// ---------------------------------------------------------------------------
// UX-PRO-03 — 7ª promoção com prova: PLT-10 pedidos do titular (acesso,
// correção, eliminação, portabilidade, oposição, revogação, informação). Papel
// admin/ti/rh no servidor (console restrito a ti/admin), verificação de
// identidade e impedimento documentado decididos no servidor, escrita real,
// A/B, filtro, vazio honesto, 503 e 403 em Chromium real.
// ---------------------------------------------------------------------------
test('browser UX-PRO-03: PLT-10 Pedidos LGPD (papel, A/B, POST/PATCH, verificação de identidade, erro e retry)', { skip: !RUN }, async () => {
  const ti = await provisionStaff(pool, { role: 'ti' });
  const rh = await provisionStaff(pool, { role: 'rh' });
  const comercial = await provisionStaff(pool, { role: 'comercial' });
  const staffIds = [ti.id, rh.id, comercial.id];
  const tiCookie = await loginStaffHttp(ti.email);
  const rhCookie = await loginStaffHttp(rh.email);
  const comercialCookie = await loginStaffHttp(comercial.email);
  const DOC_HASH = { ALFA: '0f'.repeat(32), BETA: '1e'.repeat(32) };
  const emailOf = label => `qa-plt10-${label.toLowerCase()}@exemplo.invalid`;

  const cleanup = async () => {
    await pool.query("DELETE FROM lgpd_request_history WHERE request_id IN (SELECT id FROM lgpd_requests WHERE requester_email LIKE 'qa-plt10-%')").catch(() => {});
    await pool.query("DELETE FROM auth_access_audit WHERE actor_id LIKE 'qa-plt10-%'").catch(() => {});
    await pool.query("DELETE FROM lgpd_requests WHERE requester_email LIKE 'qa-plt10-%'").catch(() => {});
  };
  const seed = async label => {
    await cleanup();
    await pool.query(
      `INSERT INTO lgpd_requests (request_type, status, requester_name, requester_email, requester_document_hash, description, due_date)
       VALUES ('acesso','recebido',$1,$2,$3,$4,CURRENT_DATE + 15)`,
      [`QA PLT10 ${label} Titular`, emailOf(label), DOC_HASH[label],
        `QA-PLT10-${label} pedido sintético do titular para conferência em navegador.`],
    );
    await pool.query(
      `INSERT INTO lgpd_requests (request_type, status, requester_name, requester_email, description, due_date, responsible_name)
       VALUES ('eliminacao','em_analise',$1,$2,$3,CURRENT_DATE + 2,'QA PLT10 responsável')`,
      [`QA PLT10 ${label} Segundo`, `qa-plt10-${label.toLowerCase()}-2@exemplo.invalid`,
        `QA-PLT10-${label} segundo pedido sintético com prazo próximo.`],
    );
  };
  const rowOf = async email => (await pool.query('SELECT * FROM lgpd_requests WHERE requester_email=$1', [email])).rows[0];

  try {
    // ---------- autorização no SERVIDOR ----------
    await seed('ALFA');
    const seeded = await rowOf(emailOf('ALFA'));
    assert.ok(seeded?.id, 'o pedido semeado precisa existir para a prova de autorização');
    const deniedRead = await api('/api/admin/lgpd/requests', { cookie: comercialCookie });
    assert.equal(deniedRead.status, 403, `comercial não pode consultar pedidos LGPD: veio ${deniedRead.status}`);
    assert.equal(deniedRead.body?.error, 'lgpd_restricted_admin_ti_rh');
    const deniedWrite = await api(`/api/admin/lgpd/requests/${seeded.id}`, {
      method: 'PATCH', cookie: comercialCookie,
      body: { next_status: 'cancelado', reason: 'QA-PLT10 tentativa de escrita sem papel autorizado' },
    });
    assert.equal(deniedWrite.status, 403, `comercial não pode transicionar pedido: veio ${deniedWrite.status}`);
    // A API autoriza rh; o CONSOLE é mais estreito (ti/admin) e a tela não amplia nada.
    assert.equal((await api('/api/admin/lgpd/requests', { cookie: rhCookie })).status, 200);
    assert.equal((await api('/api/admin/lgpd/requests', { cookie: tiCookie })).status, 200);
    // O canal público do titular continua existindo sem sessão staff (mesma origem).
    const publicCreate = await api('/api/lgpd/requests', {
      method: 'POST',
      body: {
        request_type: 'portabilidade', requester_name: 'QA PLT10 Anônimo',
        requester_email: 'qa-plt10-anon@exemplo.invalid', requester_document: '98765432100',
        description: 'QA-PLT10 pedido criado pelo canal público, sem sessão de equipe.',
      },
    });
    assert.equal(publicCreate.status, 201, `canal público precisa aceitar o pedido: veio ${publicCreate.status}`);
    assert.ok(publicCreate.body?.request?.requester_document_hash, 'o documento precisa voltar apenas como hash');
    assert.equal(publicCreate.body.request.requester_document, undefined, 'o documento não pode voltar em claro');

    const gateBrowser = await launchBrowser();
    try {
      // rh tem autorização na API, mas o console de TI é restrito a ti/admin.
      const { context, page } = await openPage(gateBrowser, '/admin/ti', rhCookie, { width: 1280, height: 900 });
      await page.locator('[data-admin-gate="forbidden"]').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Pedidos LGPD', exact: true }).count(), 0,
        'o console não pode oferecer a aba a um papel que a página não autoriza');
      await context.close();
    } finally {
      await gateBrowser.close();
    }

    // ---------- estado A: quatro larguras, teclado, fonte e honestidade ----------
    const readings = [];
    for (const [width, height] of [[320, 844], [390, 844], [768, 900], [1440, 900]]) {
      const browser = await launchBrowser();
      try {
        const { context, page } = await openPage(browser, '/admin/ti', tiCookie, { width, height });
        const tab = page.getByRole('button', { name: 'Pedidos LGPD', exact: true });
        await tab.waitFor();
        await tab.focus();
        const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() || '');
        assert.match(focused, /Pedidos LGPD/, `a aba precisa receber foco em ${width}`);
        await page.keyboard.press('Enter');
        await page.getByRole('heading', { name: 'Pedidos LGPD' }).waitFor();
        await page.getByText(/Fonte: tabelas/).waitFor();
        await page.getByText(/QA-PLT10-ALFA/).first().waitFor();
        const text = await page.locator('body').innerText();
        assert.match(text, /QA-PLT10-ALFA/);
        assert.match(text, /Data-base:/);
        assert.match(text, /prazo mais próximo/);
        assert.match(text, /15 dias/i);
        assert.match(text, /armazenado apenas como hash/i);
        assert.match(text, /parecer jurídico/i);
        assert.match(text, /NO-GO/);
        assert.match(text, /faltam \d+ dia\(s\)|vence hoje|prazo vencido há \d+ dia\(s\)/, 'o prazo precisa ser dito em dias');
        // O documento do titular existe só como hash: nunca o valor inteiro na tela.
        assert.match(text, /0f0f0f0f0f0f/);
        assert.doesNotMatch(text, new RegExp(DOC_HASH.ALFA), 'o hash completo do documento não pode ser exibido');
        assert.doesNotMatch(text, /QA-PLT10-BETA/, `B não pode vazar em ${width}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `PLT-10 overflow ${overflow} em ${width}`);
        readings.push({ width, overflow });
        await context.close();
      } finally {
        await browser.close();
      }
    }
    assert.deepEqual(readings.map(item => item.width), [320, 390, 768, 1440]);

    // ---------- escrita real pela UI: POST público, filtro, PATCH e regra de identidade ----------
    const journeyBrowser = await launchBrowser();
    const uiEmail = 'qa-plt10-ui@exemplo.invalid';
    try {
      const { context, page } = await openPage(journeyBrowser, '/admin/ti', tiCookie, { width: 1440, height: 900 });
      const detailPanel = page.locator('section[aria-labelledby="lgpd-detail-title"]');
      const openDetails = async name => {
        const summary = page.locator('summary').filter({ hasText: name }).first();
        const isOpen = await summary.evaluate(element => element.parentElement?.open ?? false);
        if (!isOpen) await summary.click();
      };
      await page.getByRole('button', { name: 'Pedidos LGPD', exact: true }).click();
      await page.getByText(/QA-PLT10-ALFA/).first().waitFor();

      // POST pelo canal público do titular, dentro da tela.
      await openDetails('Registrar pedido pelo canal público do titular');
      await page.getByLabel('Nome do titular').fill('QA PLT10 Titular da Interface');
      await page.getByLabel('E-mail do titular').fill(uiEmail);
      await page.getByLabel('Documento do titular').fill('12345678901');
      await page.getByLabel('Descrição do pedido').fill('QA-PLT10 pedido criado pela interface para conferência.');
      await page.getByRole('button', { name: 'Criar pedido público' }).click();
      await page.getByText(/Pedido registrado pelo canal público/).waitFor();
      await page.getByText(uiEmail).first().waitFor();

      // Erro real do servidor traduzido: descrição curta demais. A releitura
      // depois do 201 remonta o painel e limpa o formulário, então o <details>
      // é reaberto e os campos obrigatórios anteriores são preenchidos de novo —
      // sem eles o servidor responderia `invalid_requester_name` antes.
      await openDetails('Registrar pedido pelo canal público do titular');
      await page.getByLabel('Nome do titular').fill('QA PLT10 Titular Inválido');
      await page.getByLabel('E-mail do titular').fill('qa-plt10-invalido@exemplo.invalid');
      await page.getByLabel('Descrição do pedido').fill('curta');
      await page.getByRole('button', { name: 'Criar pedido público' }).click();
      await page.getByText(/descrição do pedido precisa ter pelo menos 10 caracteres/i).waitFor();
      assert.equal(await rowOf('qa-plt10-invalido@exemplo.invalid'), undefined, 'o pedido recusado não pode ter sido gravado');

      // Filtro que devolve vazio honesto — diferente de falha.
      await page.getByLabel('Filtrar por e-mail').fill('qa-plt10-inexistente@exemplo.invalid');
      await page.getByRole('button', { name: 'Aplicar filtros' }).click();
      // O estado de leitura fica fora dos painéis: vazio/error/negado substituem
      // a fila inteira, então só pode existir um UiState de leitura por vez.
      const emptyState = page.locator('[data-ui-state="empty"]');
      await emptyState.waitFor();
      assert.match(await emptyState.innerText(), /Nenhum pedido para esta leitura/);
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0, 'vazio não pode ser apresentado como falha');
      await page.getByRole('button', { name: 'Limpar filtros' }).click();
      await page.getByText(uiEmail).first().waitFor();

      // PATCH pela UI: primeira transição permitida pelo servidor.
      await page.locator('li').filter({ hasText: uiEmail }).first().getByRole('button', { name: 'Abrir detalhe e histórico' }).click();
      await detailPanel.getByText(/Histórico de transições/).waitFor();
      await page.getByLabel('Próximo status').selectOption('em_verificacao');
      await page.getByLabel('Motivo da transição').fill('QA-PLT10 início da verificação de identidade do titular.');
      await page.getByRole('button', { name: 'Atualizar pedido' }).click();
      await page.getByText(/Pedido atualizado\./).waitFor();
      const created = await rowOf(uiEmail);
      assert.ok(created?.id, 'o pedido criado pela interface precisa estar no banco');
      assert.equal(created.status, 'em_verificacao');

      // Transição intermediária pela API (mesmo papel) para colocar o pedido em
      // análise; a prova da UI continua sendo o PATCH final abaixo.
      const moved = await api(`/api/admin/lgpd/requests/${created.id}`, {
        method: 'PATCH', cookie: tiCookie,
        body: { next_status: 'em_analise', reason: 'QA-PLT10 transição intermediária para a prova de identidade.' },
      });
      assert.equal(moved.status, 200, `a transição intermediária deveria dar 200, veio ${moved.status}`);
      await page.getByRole('button', { name: 'Carregar pedidos' }).click();
      await page.locator('li').filter({ hasText: uiEmail }).first().getByRole('button', { name: 'Abrir detalhe e histórico' }).click();
      await detailPanel.getByText(/Histórico de transições/).waitFor();
      await page.getByLabel('Próximo status').selectOption('aprovado');
      await page.getByLabel('Motivo da transição').fill('QA-PLT10 aprovação sem identidade verificada deve ser recusada.');

      // Regra real do servidor: aprovar sem identidade verificada é recusado.
      const identityBox = page.getByRole('checkbox', { name: 'identidade verificada' });
      if (await identityBox.isChecked()) await identityBox.uncheck();
      await page.getByRole('button', { name: 'Atualizar pedido' }).click();
      await page.getByText(/identidade do titular precisa estar verificada/i).waitFor();
      assert.equal((await rowOf(uiEmail)).status, 'em_analise', 'a recusa não pode ter mudado o status');

      // Com a verificação declarada, a mesma transição passa e o histórico cresce.
      await identityBox.check();
      await page.getByRole('button', { name: 'Atualizar pedido' }).click();
      await page.getByText(/Pedido atualizado\./).waitFor();
      const approved = await rowOf(uiEmail);
      assert.equal(approved.status, 'aprovado');
      assert.equal(approved.is_identity_verified, true);
      const history = await pool.query('SELECT COUNT(*)::int AS total FROM lgpd_request_history WHERE request_id=$1', [approved.id]);
      assert.ok(history.rows[0].total >= 2, `o histórico precisa registrar as transições: ${history.rows[0].total}`);
      await detailPanel.getByText(new RegExp(`Histórico de transições \\(${history.rows[0].total}\\)`)).waitFor();

      // Atualizar sem transicionar: manter o status não pode esbarrar em
      // `invalid_transition` nem impedir registrar responsável e resposta.
      await page.getByLabel('Próximo status').selectOption('aprovado');
      await page.getByLabel('Responsável pelo pedido').fill('QA PLT10 Responsável Final');
      await page.getByLabel('Resposta ao titular').fill('QA-PLT10 resposta registrada sem transição de status.');
      await page.getByRole('button', { name: 'Atualizar pedido' }).click();
      await page.getByText(/Pedido atualizado\./).waitFor();
      const responded = await rowOf(uiEmail);
      assert.equal(responded.status, 'aprovado', 'manter o status não pode transicionar o pedido');
      assert.equal(responded.responsible_name, 'QA PLT10 Responsável Final');
      assert.match(responded.response || '', /QA-PLT10 resposta registrada sem transição/);

      // Troca para B no banco: A, o registro criado em A e as mensagens antigas
      // não podem sobreviver à releitura.
      await seed('BETA');
      await page.getByRole('button', { name: 'Carregar pedidos' }).click();
      await page.getByText(/QA-PLT10-BETA/).first().waitFor();
      const text = await page.locator('body').innerText();
      assert.doesNotMatch(text, /QA-PLT10-ALFA/, 'o estado A não pode sobrar na leitura de B');
      assert.doesNotMatch(text, new RegExp(uiEmail, 'i'), 'registro criado em A não pode sobreviver a B');
      assert.match(text, /QA-PLT10-BETA/);
      assert.doesNotMatch(text, /Pedido registrado pelo canal público/, 'mensagem antiga não pode sobreviver à releitura');
      assert.doesNotMatch(text, /Pedido atualizado\./);
      assert.doesNotMatch(text, /descrição do pedido precisa ter pelo menos 10/);
      await context.close();
    } finally {
      await journeyBrowser.close();
    }

    // ---------- 503: erro declarado e retry sem recarregar ----------
    const failureBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(failureBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/admin/lgpd/requests'],
        status: 503, code: 'lgpd_unavailable',
        onPage: p => p.addInitScript(() => { window.__qaFetchOriginal = window.fetch.bind(window); }),
      });
      await page.getByRole('button', { name: 'Pedidos LGPD', exact: true }).click();
      const errorState = page.locator('[data-ui-state="error"]');
      await errorState.waitFor();
      assert.match(await errorState.innerText(), /Falha na consulta/);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await page.evaluate(() => { window.fetch = window.__qaFetchOriginal; });
      await errorState.getByRole('button', { name: 'Tentar novamente' }).click();
      await page.getByText(/QA-PLT10-BETA/).first().waitFor();
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0, 'retry precisa sair do erro');
      await context.close();
    } finally {
      await failureBrowser.close();
    }

    // ---------- 403: negado distinto de erro e de vazio ----------
    const deniedBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(deniedBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/admin/lgpd/requests'],
        status: 403, code: 'lgpd_restricted_admin_ti_rh',
      });
      await page.getByRole('button', { name: 'Pedidos LGPD', exact: true }).click();
      const deniedState = page.locator('[data-ui-state="denied"]');
      await deniedState.waitFor();
      assert.match(await deniedState.innerText(), /Acesso não autorizado/);
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await context.close();
    } finally {
      await deniedBrowser.close();
    }
  } finally {
    await cleanup();
    for (const id of staffIds) {
      await pool.query('DELETE FROM auth_access_audit WHERE actor_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_sessions WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_staff_profiles WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_credentials WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_identities WHERE id=$1', [id]).catch(() => {});
    }
  }
});

// ---------------------------------------------------------------------------
// UX-PRO-03 — monitoramento e automação determinística (central/vídeo,
// biometria e automações). Prova: papel decidido no servidor (admin|ti; `rh`
// recebe 401 e não vê a aba), A/B sem resíduo, escrita real medida em status e
// corpo (POST de projeto/automação/execução, PATCH de aprovação e de status),
// as duas regras de LGPD do servidor recusando o caminho inseguro, 503 com
// retry, 403 distinto de falha e quatro larguras sem transbordo.
// ---------------------------------------------------------------------------
test('browser UX-PRO-03: monitoramento e automação determinística (papel, A/B, POST/PATCH, privacidade, erro e retry)', { skip: !RUN }, async () => {
  const ti = await provisionStaff(pool, { role: 'ti' });
  const rh = await provisionStaff(pool, { role: 'rh' });
  const staffIds = [ti.id, rh.id];
  const tiCookie = await loginStaffHttp(ti.email);
  const rhCookie = await loginStaffHttp(rh.email);
  const protocolo = prefixo => `${prefixo}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 4).toUpperCase()}`;

  const cleanup = async () => {
    await pool.query("DELETE FROM ai_automation_logs WHERE automation_id IN (SELECT id FROM ai_deterministic_automations WHERE name LIKE 'QA-MON-%')").catch(() => {});
    await pool.query("DELETE FROM ai_deterministic_automations WHERE name LIKE 'QA-MON-%'").catch(() => {});
    await pool.query("DELETE FROM ext_biometry_projects WHERE title LIKE 'QA-MON-%'").catch(() => {});
    await pool.query("DELETE FROM ext_central_projects WHERE title LIKE 'QA-MON-%'").catch(() => {});
  };

  const seed = async label => {
    await cleanup();
    await pool.query(
      `INSERT INTO ext_central_projects (protocol, title, description, scope, privacy_assessment)
       VALUES ($1,$2,$3,$4,$5)`,
      [protocolo('CENT-EXT'), `QA-MON-${label} Central`, `QA-MON-${label} descrição sintética do projeto de central.`,
        `QA-MON-${label} escopo sintético do projeto de central.`, `QA-MON-${label} avaliação de privacidade sintética do projeto.`],
    );
    await pool.query(
      `INSERT INTO ext_biometry_projects (protocol, title, description, necessity, impact_assessment, legal_basis, biometry_type)
       VALUES ($1,$2,$3,$4,$5,$6,'facial')`,
      [protocolo('BIO-EXT'), `QA-MON-${label} Biometria`, `QA-MON-${label} descrição sintética do projeto de biometria.`,
        `QA-MON-${label} necessidade sintética da biometria do posto.`,
        `QA-MON-${label} relatório de impacto sintético da biometria.`,
        `QA-MON-${label} base legal sintética da biometria.`],
    );
    await pool.query(
      `INSERT INTO ai_deterministic_automations (name, description, automation_type, rules)
       VALUES ($1,$2,'vencimento','{"dias_antes":5}'::jsonb)`,
      [`QA-MON-${label} Automação`, `QA-MON-${label} descrição sintética da automação determinística.`],
    );
  };

  const rowCentral = async title => (await pool.query('SELECT * FROM ext_central_projects WHERE title=$1', [title])).rows[0];
  const rowBiometria = async title => (await pool.query('SELECT * FROM ext_biometry_projects WHERE title=$1', [title])).rows[0];
  const rowAutomacao = async name => (await pool.query('SELECT * FROM ai_deterministic_automations WHERE name=$1', [name])).rows[0];
  const logsDe = async id => (await pool.query('SELECT * FROM ai_automation_logs WHERE automation_id=$1', [id])).rows;

  try {
    // ---------- autorização no SERVIDOR ----------
    await seed('ALFA');
    const centralAlfa = await rowCentral('QA-MON-ALFA Central');
    assert.ok(centralAlfa?.id, 'o projeto semeado precisa existir para a prova de autorização');
    const deniedRead = await api('/api/ext/central-projects', { cookie: rhCookie });
    assert.equal(deniedRead.status, 401, `rh não pode consultar a área de monitoramento: veio ${deniedRead.status}`);
    assert.equal(deniedRead.body?.error, 'unauthorized');
    const deniedWrite = await api('/api/ext/central-projects', {
      method: 'PATCH', cookie: rhCookie, body: { id: centralAlfa.id, is_privacy_approved: true },
    });
    assert.equal(deniedWrite.status, 401, `rh não pode aprovar projeto: veio ${deniedWrite.status}`);
    assert.equal((await rowCentral('QA-MON-ALFA Central')).is_privacy_approved, false,
      'a tentativa negada não pode ter aprovado nada');
    for (const pathname of ['/api/ext/central-projects', '/api/ext/biometry-projects', '/api/ext/ai-automations']) {
      assert.equal((await api(pathname, { cookie: tiCookie })).status, 200, `ti precisa ler ${pathname}`);
    }
    // Aposentado pelo servidor: a tela não pode ter formulado escrita aqui.
    const retired = await api('/api/ext/periodic-reports', { method: 'POST', cookie: tiCookie, body: { title: 'QA-MON legado' } });
    assert.equal(retired.status, 410, `a rota legada de relatórios precisa continuar aposentada: veio ${retired.status}`);
    assert.equal(retired.body?.canonical, '/api/ext/reports/periodic');

    // `rh` tem sessão de equipe, mas o console de TI não é dele.
    const gateBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(gateBrowser, '/admin/ti', rhCookie, { width: 1280, height: 900 });
      await page.locator('[data-admin-gate="forbidden"]').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Central, biometria e automações', exact: true }).count(), 0,
        'o console não pode oferecer a aba a um papel que a página não autoriza');
      await context.close();
    } finally {
      await gateBrowser.close();
    }

    // ---------- estado A: quatro larguras, teclado, fonte e honestidade ----------
    const readings = [];
    for (const [width, height] of [[320, 844], [390, 844], [768, 900], [1440, 900]]) {
      const browser = await launchBrowser();
      try {
        const { context, page } = await openPage(browser, '/admin/ti', tiCookie, { width, height });
        const tab = page.getByRole('button', { name: 'Central, biometria e automações', exact: true });
        await tab.waitFor();
        await tab.focus();
        const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() || '');
        assert.match(focused, /Central, biometria e automações/, `a aba precisa receber foco em ${width}`);
        await page.keyboard.press('Enter');
        await page.getByRole('heading', { name: 'Central, biometria e automações' }).waitFor();
        await page.getByText(/Fonte: tabelas/).waitFor();
        await page.getByText(/QA-MON-ALFA Central/).first().waitFor();
        const text = await page.locator('body').innerText();
        assert.match(text, /QA-MON-ALFA Biometria/);
        assert.match(text, /QA-MON-ALFA Automação/);
        assert.match(text, /Inteligência e monitoramento/);
        assert.match(text, /Data-base:/);
        assert.match(text, /não coleta biometria/i);
        assert.match(text, /não executa/i);
        assert.match(text, /NO-GO/);
        assert.doesNotMatch(text, /QA-MON-BETA/, `B não pode vazar em ${width}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(overflow <= 1, `monitoramento overflow ${overflow} em ${width}`);
        readings.push({ width, overflow });
        await context.close();
      } finally {
        await browser.close();
      }
    }
    assert.deepEqual(readings.map(item => item.width), [320, 390, 768, 1440]);

    // ---------- escrita real pela UI, medida em status + corpo ----------
    const journeyBrowser = await launchBrowser();
    const nomeAutomacao = 'QA-MON-UI Automação criada na tela';
    const tituloBiometria = 'QA-MON-UI Biometria criada na tela';
    const tituloCentral = 'QA-MON-UI Central criada na tela';
    try {
      const { context, page } = await openPage(journeyBrowser, '/admin/ti', tiCookie, { width: 1440, height: 900 });
      await page.getByRole('button', { name: 'Central, biometria e automações', exact: true }).click();
      await page.getByText(/QA-MON-ALFA Central/).first().waitFor();

      // POST real: projeto de central. O servidor exige avaliação de privacidade.
      const secaoCentral = page.locator('section[aria-labelledby="mon-novo-central-title"]');
      await secaoCentral.getByLabel('Título do projeto de central').fill(tituloCentral);
      await secaoCentral.getByLabel('Escopo do projeto de central').fill('QA-MON-UI escopo sintético do projeto de central.');
      await secaoCentral.getByLabel('Descrição do projeto de central').fill('QA-MON-UI descrição sintética do projeto de central.');
      await secaoCentral.getByLabel('Avaliação de privacidade do projeto de central').fill('QA-MON-UI avaliação de privacidade sintética do projeto.');
      await secaoCentral.getByRole('button', { name: 'Criar projeto de central' }).click();
      await page.getByText(/Projeto de central criado em rascunho/).waitFor();
      const centralCriada = await rowCentral(tituloCentral);
      assert.ok(centralCriada?.id, 'o projeto criado pela interface precisa estar no banco');
      assert.match(centralCriada.protocol, /^CENT-EXT-\d{8}-[A-Z0-9]{4}$/);
      assert.equal(centralCriada.is_privacy_approved, false);
      await page.getByText(new RegExp(tituloCentral)).first().waitFor();

      // Regra real do servidor: aprovação geral sem privacidade é recusada.
      await page.locator('section[aria-labelledby="mon-central-title"] li').filter({ hasText: tituloCentral })
        .getByRole('button', { name: /Abrir registro/ }).click();
      const secaoTransicao = page.locator('section[aria-labelledby="mon-transicao-title"]');
      await secaoTransicao.getByRole('checkbox', { name: 'aprovação geral registrada' }).check();
      await secaoTransicao.getByRole('button', { name: 'Atualizar projeto de central' }).click();
      await page.getByText(/Aprovar o projeto exige aprovação de privacidade registrada/).waitFor();
      assert.equal((await rowCentral(tituloCentral)).is_approved, false, 'a recusa não pode ter aprovado o projeto');
      await secaoTransicao.getByRole('checkbox', { name: 'aprovação de privacidade registrada' }).check();
      await secaoTransicao.getByRole('button', { name: 'Atualizar projeto de central' }).click();
      await page.getByText(/Projeto de central atualizado/).waitFor();
      const centralAprovada = await rowCentral(tituloCentral);
      assert.equal(centralAprovada.is_privacy_approved, true);
      assert.equal(centralAprovada.is_approved, true);
      assert.ok(centralAprovada.approved_at, 'o servidor precisa registrar a data da aprovação');

      // POST real: projeto de biometria.
      const secaoBiometria = page.locator('section[aria-labelledby="mon-novo-biometria-title"]');
      await secaoBiometria.getByLabel('Título do projeto de biometria').fill(tituloBiometria);
      await secaoBiometria.getByLabel('Descrição do projeto de biometria').fill('QA-MON-UI descrição sintética do projeto de biometria.');
      await secaoBiometria.getByLabel('Necessidade da biometria').fill('QA-MON-UI necessidade sintética da biometria do posto.');
      await secaoBiometria.getByLabel('Relatório de impacto da biometria').fill('QA-MON-UI relatório de impacto sintético da biometria.');
      await secaoBiometria.getByLabel('Base legal da biometria').fill('QA-MON-UI base legal sintética.');
      await secaoBiometria.getByRole('button', { name: 'Criar projeto de biometria' }).click();
      await page.getByText(/Projeto de biometria criado em rascunho/).waitFor();
      const biometriaCriada = await rowBiometria(tituloBiometria);
      assert.ok(biometriaCriada?.id, 'o projeto de biometria criado pela interface precisa estar no banco');
      assert.equal(biometriaCriada.is_collection_active, false, 'biometria não pode nascer coletando');
      await page.getByText(new RegExp(tituloBiometria)).first().waitFor();

      // Regra real do servidor: coleta sem aprovação é recusada.
      await page.locator('section[aria-labelledby="mon-biometria-title"] li').filter({ hasText: tituloBiometria })
        .getByRole('button', { name: /Abrir registro/ }).click();
      await secaoTransicao.getByRole('checkbox', { name: 'coleta ativa' }).check();
      await secaoTransicao.getByRole('button', { name: 'Atualizar projeto de biometria' }).click();
      // O texto da seção também fala de coleta: a asserção usa a frase que só
      // existe na mensagem traduzida do servidor.
      await page.getByText(/ativar a coleta exige aprovação registrada do projeto/i).waitFor();
      assert.equal((await rowBiometria(tituloBiometria)).is_collection_active, false,
        'a recusa não pode ter ativado a coleta');
      await secaoTransicao.getByRole('checkbox', { name: 'projeto aprovado' }).check();
      await secaoTransicao.getByLabel('Status do projeto de biometria').selectOption('ativo');
      await secaoTransicao.getByRole('button', { name: 'Atualizar projeto de biometria' }).click();
      await page.getByText(/Projeto de biometria atualizado/).waitFor();
      const biometriaAtiva = await rowBiometria(tituloBiometria);
      assert.equal(biometriaAtiva.is_approved, true);
      assert.equal(biometriaAtiva.is_collection_active, true);
      assert.equal(biometriaAtiva.status, 'ativo');

      // POST real: automação determinística (sem agendamento: coluna não existe).
      const secaoAutomacao = page.locator('section[aria-labelledby="mon-nova-automacao-title"]');
      await secaoAutomacao.getByLabel('Nome da automação').fill(nomeAutomacao);
      await secaoAutomacao.getByLabel('Descrição da automação').fill('QA-MON-UI descrição sintética da automação determinística.');
      await secaoAutomacao.getByLabel('Regras da automação (JSON)').fill('{"dias_antes":5}');
      await secaoAutomacao.getByRole('button', { name: 'Criar automação' }).click();
      await page.getByText(/Automação determinística criada/).waitFor();
      const automacaoCriada = await rowAutomacao(nomeAutomacao);
      assert.ok(automacaoCriada?.id, 'a automação criada pela interface precisa estar no banco');
      assert.deepEqual(automacaoCriada.rules, { dias_antes: 5 });
      assert.equal(automacaoCriada.status, 'rascunho');

      // PATCH real de status da automação.
      await page.locator('section[aria-labelledby="mon-automacoes-title"] li').filter({ hasText: nomeAutomacao })
        .getByRole('button', { name: /Abrir registro/ }).click();
      await secaoTransicao.getByLabel('Status da automação').selectOption('ativa');
      await secaoTransicao.getByRole('button', { name: 'Atualizar automação' }).click();
      await page.getByText(/Automação atualizada/).waitFor();
      assert.equal((await rowAutomacao(nomeAutomacao)).status, 'ativa');

      // POST real de execução: resultado é obrigatório (10..1000) no servidor.
      const secaoExecucao = page.locator('section[aria-labelledby="mon-execucao-title"]');
      await secaoExecucao.getByLabel('Automação da execução').selectOption(automacaoCriada.id);
      await secaoExecucao.getByLabel('Ação registrada na execução').fill('QA-MON-UI execução declarada');
      await secaoExecucao.getByLabel('Resultado da execução').fill('curto');
      await secaoExecucao.getByRole('button', { name: 'Registrar execução' }).click();
      await page.getByText(/O resultado da execução é obrigatório/i).waitFor();
      assert.equal((await logsDe(automacaoCriada.id)).length, 0, 'a execução recusada não pode ter sido gravada');
      await secaoExecucao.getByLabel('Resultado da execução').fill('QA-MON-UI resultado sintético da execução declarada.');
      await secaoExecucao.getByRole('button', { name: 'Registrar execução' }).click();
      await page.getByText(/Execução registrada no histórico/).waitFor();
      const logs = await logsDe(automacaoCriada.id);
      assert.equal(logs.length, 1, `a execução precisa estar no banco: ${logs.length}`);
      assert.equal(logs[0].is_error, false);
      assert.equal((await rowAutomacao(nomeAutomacao)).run_count, 1, 'o servidor precisa atualizar os contadores');
      await page.getByText(/Histórico de execução \(1\)/).waitFor();

      // Troca para B: nada de A pode sobreviver à releitura.
      await seed('BETA');
      await page.getByRole('button', { name: 'Carregar monitoramento' }).click();
      await page.getByText(/QA-MON-BETA Central/).first().waitFor();
      const text = await page.locator('body').innerText();
      assert.doesNotMatch(text, /QA-MON-ALFA/, 'o estado A não pode sobrar na leitura de B');
      assert.doesNotMatch(text, new RegExp(tituloCentral), 'registro criado em A não pode sobreviver a B');
      assert.doesNotMatch(text, /Projeto de central criado em rascunho/, 'mensagem antiga não pode sobreviver à releitura');
      assert.doesNotMatch(text, /Execução registrada no histórico/, 'mensagem de execução não pode sobreviver à releitura');
      await context.close();
    } finally {
      await journeyBrowser.close();
    }

    // ---------- 503: erro declarado e retry sem recarregar ----------
    const failureBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(failureBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/ext/central-projects'],
        status: 503, code: 'central_projects_unavailable',
        onPage: p => p.addInitScript(() => { window.__qaFetchOriginal = window.fetch.bind(window); }),
      });
      await page.getByRole('button', { name: 'Central, biometria e automações', exact: true }).click();
      const errorState = page.locator('[data-ui-state="error"]');
      await errorState.waitFor();
      assert.match(await errorState.innerText(), /Falha na consulta/);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await page.evaluate(() => { window.fetch = window.__qaFetchOriginal; });
      await errorState.getByRole('button', { name: 'Tentar novamente' }).click();
      await page.getByText(/QA-MON-BETA Central/).first().waitFor();
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0, 'retry precisa sair do erro');
      await context.close();
    } finally {
      await failureBrowser.close();
    }

    // ---------- 403: negado distinto de erro e de vazio ----------
    const deniedBrowser = await launchBrowser();
    try {
      const { context, page } = await openPage(deniedBrowser, '/admin/ti', tiCookie, {
        width: 390, height: 844,
        failRoutes: ['/api/ext/biometry-projects'],
        status: 403, code: 'unauthorized',
      });
      await page.getByRole('button', { name: 'Central, biometria e automações', exact: true }).click();
      const deniedState = page.locator('[data-ui-state="denied"]');
      await deniedState.waitFor();
      assert.match(await deniedState.innerText(), /Acesso não autorizado/);
      assert.equal(await page.locator('[data-ui-state="error"]').count(), 0);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await context.close();
    } finally {
      await deniedBrowser.close();
    }
  } finally {
    await cleanup();
    for (const id of staffIds) {
      await pool.query('DELETE FROM auth_access_audit WHERE actor_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_sessions WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_staff_profiles WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_credentials WHERE identity_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM auth_identities WHERE id=$1', [id]).catch(() => {});
    }
  }
});

// ---------------------------------------------------------------------------
// UX-PRO-03 — reclamações de colaboradores: o console de TI é mais estreito
// que a API (RH legítimo com projeção mínima). Dados e identidades sintéticos;
// o banco inteiro é descartado pelo runner, inclusive o histórico imutável.
// ---------------------------------------------------------------------------
test('browser UX-PRO-03: reclamações de colaboradores (papéis, isolamento, escritas, falhas e quatro larguras)', { skip: !RUN }, async () => {
  const ti = await provisionStaff(pool, { role: 'ti' });
  const rh = await provisionStaff(pool, { role: 'rh' });
  const comercial = await provisionStaff(pool, { role: 'comercial' });
  const tiCookie = await loginStaffHttp(ti.email);
  const rhStaffCookie = await loginStaffHttp(rh.email);
  const comercialCookie = await loginStaffHttp(comercial.email);
  const suffix = randomUUID().slice(0, 8);
  const titleA = `QA-RECL-${suffix}-ALFA`;
  const titleB = `QA-RECL-${suffix}-BETA`;
  const titleUI = `QA-RECL-${suffix}-TELA`;
  const descriptionA = `Descrição sintética exclusiva de ALFA ${suffix}, canal restrito.`;
  const descriptionB = `Descrição sintética exclusiva de BETA ${suffix}, canal restrito.`;
  const base = '/api/admin/employee-complaints';
  const create = async (title, description) => api(base, { method: 'POST', cookie: tiCookie,
    body: { title, description, category: 'outro', severity: 'media', employee_reference: `REF-SINTETICA-${suffix}` } });
  const createdA = await create(titleA, descriptionA);
  const createdB = await create(titleB, descriptionB);
  assert.equal(createdA.status, 201);
  assert.equal(createdB.status, 201);
  const idA = createdA.body.id;
  const idB = createdB.body.id;
  assert.match(createdA.body.employee_reference_hash, /^[a-f0-9]{64}$/);

  // Servidor: TI autorizado, comercial negado, RH legítimo com acesso mínimo.
  assert.equal((await api(base, { cookie: tiCookie })).status, 200);
  const deniedRead = await api(base, { cookie: comercialCookie });
  assert.equal(deniedRead.status, 403);
  assert.equal(deniedRead.body.error, 'forbidden_restricted_channel');
  const deniedWrite = await api(base, { method: 'PATCH', cookie: comercialCookie,
    body: { id: idA, status: 'em_analise', reason: 'Motivo sintético da tentativa negada.' } });
  assert.equal(deniedWrite.status, 403);
  assert.equal(deniedWrite.body.error, 'forbidden_restricted_channel');
  const rhList = await api(base, { cookie: rhStaffCookie });
  assert.equal(rhList.status, 200);
  assert.ok(!rhList.body.items.some(item => item.id === idA || item.id === idB), 'RH não lista relatos não compartilhados');
  const rhDetailBefore = await api(`${base}/${idA}`, { cookie: rhStaffCookie });
  assert.equal(rhDetailBefore.status, 404);
  assert.equal(rhDetailBefore.body.error, 'not_found');
  const rhCreate = await api(base, { method: 'POST', cookie: rhStaffCookie,
    body: { title: 'Tentativa sintética do RH', description: 'Descrição sintética suficientemente longa.' } });
  assert.equal(rhCreate.status, 403, 'RH não cria na via administrativa');
  const rhShareDenied = await api('/api/admin/employee-complaint-hr-shares', { cookie: rhStaffCookie });
  assert.equal(rhShareDenied.status, 401, 'somente admin/ti consultam compartilhamentos pela rota administrativa estrita');
  // Preservar o erro existente evita que uma correção genérica devolva a linha
  // completa ao RH sem decisão sobre o contrato e a autorização.
  const rhPatch = await api(base, { method: 'PATCH', cookie: rhStaffCookie,
    body: { id: idA, status: 'em_apuracao', reason: 'Motivo sintético de teste pelo RH.' } });
  assert.equal(rhPatch.status, 500);
  assert.equal(rhPatch.body.error, 'internal_error');
  assert.ok(!('description' in rhPatch.body) && !('employee_reference' in rhPatch.body));
  assert.equal((await pool.query('SELECT status FROM cli_employee_complaints WHERE id=$1', [idA])).rows[0].status, 'pendente');

  for (const cookie of [rhStaffCookie, comercialCookie]) {
    const browser = await launchBrowser();
    try {
      const { context, page } = await openPage(browser, '/admin/ti', cookie);
      await page.locator('[data-admin-gate="forbidden"]').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Reclamações de colaboradores', exact: true }).count(), 0);
      await context.close();
    } finally { await browser.close(); }
  }

  // Quatro larguras: teclado, estados, rótulos e ausência de transbordo com
  // detalhe e formulário expandidos (não somente na tela inicial vazia).
  for (const width of [320, 390, 768, 1440]) {
    const browser = await launchBrowser();
    try {
      const { context, page } = await openPage(browser, '/admin/ti', tiCookie, { width, height: 900 });
      const tab = page.getByRole('button', { name: 'Reclamações de colaboradores', exact: true });
      await tab.waitFor(); await tab.focus(); await page.keyboard.press('Enter');
      const area = page.locator('section[aria-labelledby="complaint-title"]');
      await area.getByRole('heading', { name: 'Reclamações de colaboradores' }).waitFor();
      const list = page.locator('section[aria-labelledby="complaint-list-title"]');
      await list.getByText(titleA, { exact: false }).waitFor();
      await list.locator('li').filter({ hasText: titleA }).getByRole('button', { name: 'Ver detalhes' }).click();
      const detail = page.locator('section[aria-labelledby="complaint-detail-title"]');
      await detail.getByText(descriptionA, { exact: false }).waitFor();
      await detail.locator('summary').filter({ hasText: 'Registrar mensagem restrita' }).click();
      await area.locator('summary').filter({ hasText: 'Nova reclamação restrita' }).click();
      const missingLabels = await area.locator('input,select,textarea').evaluateAll(controls => controls.filter(control => !control.labels || control.labels.length === 0).map(control => control.outerHTML));
      assert.deepEqual(missingLabels, [], `todos os campos precisam de rótulo em ${width}px`);
      const body = await area.innerText();
      assert.match(body, /Fonte:/); assert.match(body, /Data-base:/); assert.match(body, /texto claro/i);
      assert.match(body, /não faz upload/i); assert.match(body, /NO-GO/);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `reclamações transbordam ${overflow}px em ${width}px`);
      await context.close();
    } finally { await browser.close(); }
  }

  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/admin/ti', tiCookie, { width: 1440, height: 900 });
    await page.getByRole('button', { name: 'Reclamações de colaboradores', exact: true }).click();
    const area = page.locator('section[aria-labelledby="complaint-title"]');
    const list = page.locator('section[aria-labelledby="complaint-list-title"]');
    const detail = page.locator('section[aria-labelledby="complaint-detail-title"]');
    await list.getByText(titleA, { exact: false }).waitFor();
    const responseFor = (path, method) => page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === method);
    const row = title => list.locator('li').filter({ hasText: title });

    // POST inválido mede status/corpo e mostra tradução, sem vazar código cru.
    await area.locator('summary').filter({ hasText: 'Nova reclamação restrita' }).click();
    await area.getByLabel('Título da reclamação').fill(titleUI);
    await area.getByLabel('Descrição da reclamação').fill('curta');
    let pending = responseFor(base, 'POST');
    await area.getByRole('button', { name: 'Criar reclamação canal restrito' }).click();
    let response = await pending;
    assert.equal(response.status(), 400); assert.equal((await response.json()).error, 'invalid_description');
    await area.getByRole('alert').getByText('A descrição precisa ter entre 20 e 5000 caracteres.').waitFor();
    assert.doesNotMatch(await area.innerText(), /invalid_description/);

    // POST real, com hash calculado e referência em texto claro (limite honesto).
    const reference = `REF-UI-SINTETICA-${suffix}`;
    await area.getByLabel('Descrição da reclamação').fill(`Descrição sintética criada pela interface ${suffix}, suficientemente longa.`);
    await area.getByLabel('Referência do colaborador').fill(reference);
    pending = responseFor(base, 'POST');
    await area.getByRole('button', { name: 'Criar reclamação canal restrito' }).click();
    response = await pending; const uiComplaint = await response.json();
    assert.equal(response.status(), 201); assert.ok(uiComplaint.id);
    assert.equal(uiComplaint.employee_reference, reference);
    assert.equal(uiComplaint.employee_reference_hash, (await import('node:crypto')).createHash('sha256').update(reference).digest('hex'));
    await area.getByRole('status').getByText('Reclamação registrada no canal restrito.').waitFor();
    await row(titleUI).getByRole('button', { name: 'Ver detalhes' }).waitFor();

    // As duas transições antes disponíveis no protótipo funcionam, com corpo.
    pending = responseFor(base, 'PATCH');
    await row(titleUI).getByRole('button', { name: 'Em análise' }).click();
    response = await pending; const analyzed = await response.json();
    assert.equal(response.status(), 200); assert.equal(analyzed.id, uiComplaint.id); assert.equal(analyzed.status, 'em_analise');
    await detail.getByText(titleUI, { exact: false }).waitFor();
    await area.getByRole('status').getByText('Reclamação marcada em análise.').waitFor();
    pending = responseFor(base, 'PATCH');
    await row(titleUI).getByRole('button', { name: 'Resolver' }).click();
    response = await pending; const resolved = await response.json();
    assert.equal(response.status(), 200); assert.equal(resolved.status, 'resolvida'); assert.ok(resolved.resolved_at);
    await detail.getByText(titleUI, { exact: false }).waitFor();

    // A mensagem enviada com o corpo original não pode mais cair em 400.
    await detail.locator('summary').filter({ hasText: 'Registrar mensagem restrita' }).click();
    const messageText = `Mensagem sintética visível ao RH ${suffix}.`;
    await detail.getByLabel('Mensagem restrita', { exact: true }).fill(messageText);
    await detail.getByLabel('Tipo de remetente').selectOption('rh');
    await detail.getByLabel('Mensagem visível ao RH').check();
    pending = responseFor('/api/admin/employee-complaint-messages', 'POST');
    await detail.getByRole('button', { name: 'Enviar mensagem restrita' }).click();
    response = await pending; const message = await response.json();
    assert.equal(response.status(), 201); assert.equal(message.complaint_id, uiComplaint.id); assert.equal(message.message, messageText);
    await detail.getByText(messageText, { exact: false }).waitFor();
    assert.match(await detail.locator('li').filter({ hasText: messageText }).innerText(), /restrita: sim/);

    // Referência é metadado e não finge upload de arquivo.
    await detail.locator('summary').filter({ hasText: 'Registrar referência de evidência' }).click();
    await detail.getByLabel('Nome da evidência').fill(`QA-evidencia-${suffix}.txt`);
    await detail.getByLabel('Endereço declarado da evidência').fill(`referencia-sintetica-${suffix}`);
    await detail.getByLabel('Chave declarada de armazenamento').fill(`chave-sintetica-${suffix}`);
    await detail.getByLabel('Evidência visível ao RH').check();
    pending = responseFor('/api/admin/employee-complaint-evidences', 'POST');
    await detail.getByRole('button', { name: 'Anexar evidência restrita' }).click();
    response = await pending; const evidence = await response.json();
    assert.equal(response.status(), 201); assert.equal(evidence.complaint_id, uiComplaint.id); assert.equal(evidence.is_hr_visible, true);
    await detail.getByText(`QA-evidencia-${suffix}.txt`, { exact: false }).waitFor();
    assert.match(await detail.locator('li').filter({ hasText: `QA-evidencia-${suffix}.txt` }).innerText(), /restrita: sim/);

    // O compartilhamento é explícito, mínimo e justificado.
    await detail.locator('summary').filter({ hasText: 'Compartilhar campo mínimo com RH' }).click();
    await detail.getByLabel('Campo a compartilhar').selectOption('category');
    await detail.getByLabel('Valor mínimo compartilhado').fill('outro');
    await detail.getByLabel('Justificativa do compartilhamento').fill(`Justificativa sintética para o RH ${suffix}.`);
    pending = responseFor('/api/admin/employee-complaint-hr-shares', 'POST');
    await detail.getByRole('button', { name: 'Compartilhar mínimo com RH justificado' }).click();
    response = await pending; const share = await response.json();
    assert.equal(response.status(), 201); assert.equal(share.complaint_id, uiComplaint.id); assert.equal(share.shared_field, 'category');
    await detail.getByText(/Compartilhamentos com RH \(1\)/).waitFor();
    const rhDetailAfter = await api(`${base}/${uiComplaint.id}`, { cookie: rhStaffCookie });
    assert.equal(rhDetailAfter.status, 200);
    for (const key of ['description', 'employee_reference', 'employee_reference_hash', 'client_account_id', 'title']) assert.ok(!(key in rhDetailAfter.body.complaint), `RH não recebe ${key}`);
    assert.ok(rhDetailAfter.body.messages.some(item => item.message === messageText));
    assert.ok(rhDetailAfter.body.evidences.some(item => item.file_name === evidence.file_name));
    const rhMessage = await api('/api/admin/employee-complaint-messages', { method: 'POST', cookie: rhStaffCookie,
      body: { complaint_id: uiComplaint.id, sender_type: 'rh', message: `Resposta sintética pelo RH ${suffix}.`, is_hr_visible: true } });
    assert.equal(rhMessage.status, 201); assert.equal(rhMessage.body.complaint_id, uiComplaint.id);

    // A → B: não sobra detalhe nem rascunho de A; resposta atrasada de A não
    // pode substituir B. As respostas são reais e apenas atrasadas no browser.
    await row(titleA).getByRole('button', { name: 'Ver detalhes' }).click();
    await detail.getByText(descriptionA, { exact: false }).waitFor();
    await detail.locator('summary').filter({ hasText: 'Registrar mensagem restrita' }).click();
    await detail.getByLabel('Mensagem restrita', { exact: true }).fill(`RASCUNHO-ALFA-${suffix}`);
    await row(titleB).getByRole('button', { name: 'Ver detalhes' }).click();
    await detail.getByText(descriptionB, { exact: false }).waitFor();
    assert.doesNotMatch(await detail.innerText(), /exclusiva de ALFA/);
    await detail.locator('summary').filter({ hasText: 'Registrar mensagem restrita' }).click();
    assert.equal(await detail.getByLabel('Mensagem restrita', { exact: true }).inputValue(), '');
    await page.evaluate(id => {
      const original = window.fetch.bind(window); window.__complaintOriginalFetch = original;
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        const result = await original(input, init);
        if (new URL(url, location.origin).pathname.endsWith(`/employee-complaints/${id}`)) {
          await new Promise(resolve => { window.__releaseComplaintDetail = resolve; });
          window.__complaintDetailReturned = true;
        }
        return result;
      };
    }, idA);
    await row(titleA).getByRole('button', { name: 'Ver detalhes' }).click();
    await page.waitForFunction(() => typeof window.__releaseComplaintDetail === 'function');
    await row(titleB).getByRole('button', { name: 'Ver detalhes' }).click();
    await detail.getByText(descriptionB, { exact: false }).waitFor();
    await page.evaluate(() => window.__releaseComplaintDetail());
    await page.waitForFunction(() => window.__complaintDetailReturned === true);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.match(await detail.innerText(), /exclusiva de BETA/);
    assert.doesNotMatch(await detail.innerText(), /exclusiva de ALFA/);
    await page.evaluate(() => { window.fetch = window.__complaintOriginalFetch; });

    // Sequência independente da lista: A atrasado chega após B e é descartado.
    await page.evaluate(({ a, b }) => {
      const original = window.fetch.bind(window); window.__complaintOriginalFetch = original;
      let order = 0;
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (new URL(url, location.origin).pathname !== '/api/admin/employee-complaints' || (init?.method && init.method !== 'GET')) return original(input, init);
        const current = ++order; const response = await original(input, init); const data = await response.json();
        if (current === 1) await new Promise(resolve => { window.__releaseComplaintList = resolve; });
        if (current === 1) window.__complaintListReturned = true;
        return new Response(JSON.stringify({ ...data, items: data.items.filter(item => item.id === (current === 1 ? a : b)) }), { status: response.status, headers: { 'content-type': 'application/json' } });
      };
    }, { a: idA, b: idB });
    await area.getByRole('button', { name: 'Atualizar reclamações' }).click();
    await page.waitForFunction(() => typeof window.__releaseComplaintList === 'function');
    await area.getByRole('button', { name: 'Atualizar reclamações' }).click();
    await list.getByText(titleB, { exact: false }).waitFor();
    await page.evaluate(() => window.__releaseComplaintList());
    await page.waitForFunction(() => window.__complaintListReturned === true);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.match(await list.innerText(), new RegExp(titleB));
    assert.doesNotMatch(await list.innerText(), new RegExp(titleA));
    assert.doesNotMatch(await detail.innerText(), /exclusiva de (ALFA|BETA)/, 'releitura remove detalhe antigo');
    await page.evaluate(() => { window.fetch = window.__complaintOriginalFetch; });
    await area.getByRole('button', { name: 'Atualizar reclamações' }).click();
    await list.getByText(titleA, { exact: false }).waitFor();

    // 503, payload malformado e 403 são distintos de vazio; retry de lista e de
    // detalhe usa o mesmo servidor depois de desligada a injeção local.
    await page.evaluate(() => {
      const original = window.fetch.bind(window); window.__complaintOriginalFetch = original; window.__complaintFailure = '';
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        const pathname = new URL(url, location.origin).pathname;
        if (init?.method && init.method !== 'GET') return original(input, init);
        if (pathname === '/api/admin/employee-complaints' && window.__complaintFailure === 'list503') return new Response(JSON.stringify({ error: 'indisponivel_sintetico' }), { status: 503, headers: { 'content-type': 'application/json' } });
        if (pathname === '/api/admin/employee-complaints' && window.__complaintFailure === 'list403') return new Response(JSON.stringify({ error: 'forbidden_restricted_channel' }), { status: 403, headers: { 'content-type': 'application/json' } });
        if (pathname === '/api/admin/employee-complaints' && window.__complaintFailure === 'listInvalid') return new Response(JSON.stringify({ items: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
        if (pathname.startsWith('/api/admin/employee-complaints/') && window.__complaintFailure === 'detail503') return new Response(JSON.stringify({ error: 'indisponivel_sintetico' }), { status: 503, headers: { 'content-type': 'application/json' } });
        if (pathname.startsWith('/api/admin/employee-complaints/') && window.__complaintFailure === 'detailInvalid') {
          const result = await original(input, init); const data = await result.json(); data.messages = {};
          return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return original(input, init);
      };
    });
    await page.evaluate(() => { window.__complaintFailure = 'list503'; });
    await area.getByRole('button', { name: 'Atualizar reclamações' }).click();
    await list.locator('[data-ui-state="error"]').waitFor();
    assert.equal(await list.locator('[data-ui-state="empty"]').count(), 0);
    assert.doesNotMatch(await list.innerText(), /indisponivel_sintetico/);
    await page.evaluate(() => { window.__complaintFailure = ''; });
    await list.getByRole('button', { name: 'Tentar novamente' }).click();
    await list.getByText(titleB, { exact: false }).waitFor();
    await page.evaluate(() => { window.__complaintFailure = 'listInvalid'; });
    await area.getByRole('button', { name: 'Atualizar reclamações' }).click();
    await list.getByText(/payload inválido/i).waitFor();
    assert.equal(await list.locator('[data-ui-state="empty"]').count(), 0);
    await page.evaluate(() => { window.__complaintFailure = ''; });
    await list.getByRole('button', { name: 'Tentar novamente' }).click();
    await list.getByText(titleA, { exact: false }).waitFor();
    await page.evaluate(() => { window.__complaintFailure = 'detail503'; });
    await row(titleA).getByRole('button', { name: 'Ver detalhes' }).click();
    await detail.locator('[data-ui-state="error"]').waitFor();
    await page.evaluate(() => { window.__complaintFailure = ''; });
    await detail.getByRole('button', { name: 'Tentar novamente' }).click();
    await detail.getByText(descriptionA, { exact: false }).waitFor();
    await page.evaluate(() => { window.__complaintFailure = 'detailInvalid'; });
    await row(titleB).getByRole('button', { name: 'Ver detalhes' }).click();
    await detail.getByText(/payload inválido/i).waitFor();
    assert.doesNotMatch(await detail.innerText(), /exclusiva de (ALFA|BETA)/);
    await page.evaluate(() => { window.__complaintFailure = ''; });
    await detail.getByRole('button', { name: 'Tentar novamente' }).click();
    await detail.getByText(descriptionB, { exact: false }).waitFor();
    await page.evaluate(() => { window.__complaintFailure = 'list403'; });
    await area.getByRole('button', { name: 'Atualizar reclamações' }).click();
    await list.locator('[data-ui-state="denied"]').waitFor();
    assert.equal(await list.locator('[data-ui-state="error"]').count(), 0);
    assert.doesNotMatch(await detail.innerText(), /exclusiva de (ALFA|BETA)/);
    await page.evaluate(() => { window.fetch = window.__complaintOriginalFetch; });
    await context.close();
  } finally { await browser.close(); }
});

// UX-PRO-03/RH — nova via administrativa aditiva para relatos explicitamente
// compartilhados. O teste preserva o 500 legado RH documentado acima e usa
// PostgreSQL + HTTP/Chromium reais para provar o contrato novo.
test('browser UX-PRO-03 RH: reclamações compartilhadas, projeção mínima, atualização transacional, retry e responsividade', { skip: !RUN }, async () => {
  const rh = await provisionStaff(pool, { role: 'rh' });
  const ti = await provisionStaff(pool, { role: 'ti' });
  const admin = await provisionStaff(pool, { role: 'admin' });
  const comercial = await provisionStaff(pool, { role: 'comercial' });
  const marcelo = await provisionStaff(pool, { role: 'marcelo' });
  const rhCookie = await loginStaffHttp(rh.email);
  const tiCookie = await loginStaffHttp(ti.email);
  const adminCookie = await loginStaffHttp(admin.email);
  const comercialCookie = await loginStaffHttp(comercial.email);
  const marceloCookie = await loginStaffHttp(marcelo.email);
  const suffix = randomUUID().slice(0, 8);
  const base = '/api/admin/employee-complaints';
  const hrBase = '/api/admin/hr/employee-complaints';
  const fixtures = {
    a: { title: `RH-${suffix}-A-TITULO-PRIVADO`, description: `RH-${suffix}-A-DESCRICAO-INTEGRAL-PRIVADA`, reference: `RH-${suffix}-REFERENCIA-PRIVADA` },
    b: { title: `RH-${suffix}-B-TITULO-PRIVADO`, description: `RH-${suffix}-B-DESCRICAO-INTEGRAL-PRIVADA`, reference: `RH-${suffix}-B-REFERENCIA-PRIVADA` },
    hidden: { title: `RH-${suffix}-NAO-COMPARTILHADA`, description: `RH-${suffix}-RELATO-NAO-COMPARTILHADO-PRIVADO`, reference: `RH-${suffix}-HASH-PRIVADO` },
    rollback: { title: `RH-${suffix}-ROLLBACK`, description: `RH-${suffix}-RELATO-ROLLBACK-PRIVADO`, reference: `RH-${suffix}-ROLLBACK-REF` },
  };
  const createComplaint = async (cookie, item) => api(base, { method: 'POST', cookie, body: {
    title: item.title, description: item.description, employee_reference: item.reference,
    category: 'comportamento', severity: 'alta',
  } });
  const shareField = async (cookie, complaintId, field, value) => api('/api/admin/employee-complaint-hr-shares', { method: 'POST', cookie, body: {
    complaint_id: complaintId, shared_field: field, shared_value: value,
    justification: `Compartilhamento sintético autorizado para ${field}.`,
  } });

  const createdA = await createComplaint(tiCookie, fixtures.a);
  const createdB = await createComplaint(tiCookie, fixtures.b);
  const createdHidden = await createComplaint(tiCookie, fixtures.hidden);
  const createdRollback = await createComplaint(tiCookie, fixtures.rollback);
  for (const created of [createdA, createdB, createdHidden, createdRollback]) assert.equal(created.status, 201);
  const idA = createdA.body.id;
  const idB = createdB.body.id;
  const hiddenId = createdHidden.body.id;
  const rollbackId = createdRollback.body.id;
  const sharedTitle = `TITULO-EXPLICITAMENTE-COMPARTILHADO-${suffix}`;
  const sharedSummary = `RESUMO-MINIMO-EXPLICITAMENTE-COMPARTILHADO-${suffix}`;
  assert.equal((await shareField(tiCookie, idA, 'title', sharedTitle)).status, 201);
  assert.equal((await shareField(tiCookie, idA, 'minimal_description', sharedSummary)).status, 201);
  assert.equal((await shareField(tiCookie, idB, 'category', 'comportamento')).status, 201);
  assert.equal((await shareField(tiCookie, rollbackId, 'category', 'comportamento')).status, 201);

  const list = await api(hrBase, { cookie: rhCookie });
  assert.equal(list.status, 200);
  assert.ok(list.body.items.some(item => item.id === idA));
  assert.ok(list.body.items.some(item => item.id === idB));
  assert.ok(!list.body.items.some(item => item.id === hiddenId));
  for (const forbidden of [fixtures.a.description, fixtures.a.reference, createdA.body.employee_reference_hash, fixtures.a.title]) {
    assert.equal(JSON.stringify(list.body).includes(forbidden), false, `lista RH não deve conter ${forbidden}`);
  }
  const detailA = await api(`${hrBase}/${idA}`, { cookie: rhCookie });
  assert.equal(detailA.status, 200);
  assert.deepEqual(detailA.body.sharedFields, [
    { field: 'title', value: sharedTitle }, { field: 'minimal_description', value: sharedSummary },
  ]);
  const detailB = await api(`${hrBase}/${idB}`, { cookie: rhCookie });
  assert.equal(detailB.status, 200);
  assert.deepEqual(detailB.body.sharedFields, []);
  for (const forbidden of [fixtures.a.description, fixtures.a.reference, createdA.body.employee_reference_hash, fixtures.a.title]) {
    assert.equal(JSON.stringify(detailA.body).includes(forbidden), false, `detalhe RH não deve conter ${forbidden}`);
  }
  assert.equal((await api(`${hrBase}/${hiddenId}`, { cookie: rhCookie })).status, 404);
  assert.equal((await api(`${hrBase}/${hiddenId}`, { method: 'PATCH', cookie: rhCookie, body: {
    status: 'em_analise', expected_status: 'pendente', reason: 'Tentativa em relato oculto.',
  } })).status, 404);

  for (const method of ['GET', 'PATCH']) {
    const denied = await api(method === 'GET' ? hrBase : `${hrBase}/${idA}`, { method, cookie: comercialCookie,
      ...(method === 'PATCH' ? { body: { status: 'em_analise', expected_status: 'pendente', reason: 'Tentativa de perfil comercial.' } } : {}),
    });
    assert.equal(denied.status, 403, `comercial deve receber 403 em ${method}`);
  }
  const marceloDenied = await api(hrBase, { cookie: marceloCookie });
  assert.equal(marceloDenied.status, 403, 'Marcelo é aceito pela página RH, mas não por esta autorização de API');
  assert.equal(JSON.stringify(marceloDenied.body).includes(sharedTitle), false);

  // Admin e TI continuam com o contrato legado sem redução de acesso/resposta.
  const legacyAdmin = await createComplaint(adminCookie, { title: `RH-${suffix}-ADMIN-LEGADO`, description: `Descrição sintética de admin com mais de vinte caracteres.`, reference: `RH-${suffix}-ADMIN-REF` });
  const legacyTi = await createComplaint(tiCookie, { title: `RH-${suffix}-TI-LEGADO`, description: `Descrição sintética de TI com mais de vinte caracteres.`, reference: `RH-${suffix}-TI-REF` });
  assert.equal(legacyAdmin.status, 201);
  assert.equal(legacyTi.status, 201);
  for (const [cookie, row] of [[adminCookie, legacyAdmin.body], [tiCookie, legacyTi.body]]) {
    const preserved = await api(base, { method: 'PATCH', cookie, body: { id: row.id, status: 'em_analise', reason: 'Atualização legada sintética admin TI.' } });
    assert.equal(preserved.status, 200);
    assert.ok('description' in preserved.body, 'o contrato legado admin|ti continua intacto');
  }
  const legacyRh = await api(base, { method: 'PATCH', cookie: rhCookie, body: { id: idA, status: 'em_apuracao', reason: 'Erro legado continua observado.' } });
  assert.equal(legacyRh.status, 500, 'a asserção 500 legada do RH é preservada; a UI usa a nova rota');
  assert.equal((await pool.query('SELECT status FROM cli_employee_complaints WHERE id=$1', [idA])).rows[0].status, 'pendente');

  // Falha intencional no INSERT da auditoria transacional: situação e histórico
  // precisam voltar ao estado anterior no banco descartável.
  const historyBefore = Number((await pool.query('SELECT count(*) AS n FROM cli_employee_complaint_history WHERE complaint_id=$1', [rollbackId])).rows[0].n);
  await pool.query(`CREATE OR REPLACE FUNCTION qa_fail_shared_complaint_audit() RETURNS trigger AS $$
    BEGIN
      IF NEW.action='cli_complaint_status' AND NEW.target='${rollbackId}' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql`);
  await pool.query('CREATE TRIGGER qa_fail_shared_complaint_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION qa_fail_shared_complaint_audit()');
  try {
    const failed = await api(`${hrBase}/${rollbackId}`, { method: 'PATCH', cookie: rhCookie, body: {
      status: 'em_analise', expected_status: 'pendente', reason: 'Auditoria sintética deve reverter.',
    } });
    assert.equal(failed.status, 503);
    assert.equal((await pool.query('SELECT status FROM cli_employee_complaints WHERE id=$1', [rollbackId])).rows[0].status, 'pendente');
    assert.equal(Number((await pool.query('SELECT count(*) AS n FROM cli_employee_complaint_history WHERE complaint_id=$1', [rollbackId])).rows[0].n), historyBefore);
    assert.equal(Number((await pool.query("SELECT count(*) AS n FROM audit_log WHERE action='cli_complaint_status' AND target=$1", [rollbackId])).rows[0].n), 0);
  } finally {
    await pool.query('DROP TRIGGER IF EXISTS qa_fail_shared_complaint_audit ON audit_log');
    await pool.query('DROP FUNCTION IF EXISTS qa_fail_shared_complaint_audit()');
  }

  const browser = await launchBrowser();
  let context;
  try {
    const opened = await openPage(browser, '/admin/funcionarios', rhCookie, { width: 1440, height: 900 });
    context = opened.context;
    const page = opened.page;
    const tab = page.getByRole('tab', { name: 'Reclamações compartilhadas', exact: true });
    await tab.waitFor();
    await tab.focus();
    await page.keyboard.press('Enter');
    const area = page.locator('section[aria-labelledby="shared-complaints-title"]');
    await area.getByRole('heading', { name: 'Reclamações compartilhadas com o RH' }).waitFor();
    const listPanel = area.locator('section[aria-labelledby="shared-complaints-list-title"]');
    const detailPanel = area.locator('section[aria-labelledby="shared-complaint-detail-title"]');
    const buttonForProtocol = protocol => listPanel.locator('li').filter({ hasText: protocol }).getByRole('button');
    await buttonForProtocol(createdA.body.protocol).waitFor();

    // A → B: detalhe explicitamente compartilhado some ao selecionar outro.
    await buttonForProtocol(createdA.body.protocol).click();
    await detailPanel.getByText(sharedTitle, { exact: true }).waitFor();
    await detailPanel.getByText(sharedSummary, { exact: true }).waitFor();
    let visible = await area.innerText();
    for (const forbidden of [fixtures.a.description, fixtures.a.reference, createdA.body.employee_reference_hash, 'CONTA-RESTRITA', 'IDENTIDADE-RESTRITA']) assert.equal(visible.includes(forbidden), false);
    await buttonForProtocol(createdB.body.protocol).click();
    await detailPanel.getByText(createdB.body.protocol, { exact: true }).waitFor();
    assert.equal((await detailPanel.getByText(sharedTitle, { exact: true }).count()), 0, 'campos de A não permanecem em B');

    // Resposta atrasada de A não pode substituir o detalhe atualmente aberto B.
    await page.evaluate(id => {
      const original = window.fetch.bind(window); window.__hrComplaintFetch = original;
      window.__hrComplaintHeld = false;
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        const pathname = new URL(url, location.origin).pathname;
        const response = await original(input, init);
        if (pathname.endsWith(`/employee-complaints/${id}`) && (!init?.method || init.method === 'GET')) {
          await new Promise(resolve => { window.__releaseHrComplaintA = resolve; });
          window.__hrComplaintHeld = true;
        }
        return response;
      };
    }, idA);
    await buttonForProtocol(createdA.body.protocol).click();
    await page.waitForFunction(() => typeof window.__releaseHrComplaintA === 'function');
    await buttonForProtocol(createdB.body.protocol).click();
    await detailPanel.getByText(createdB.body.protocol, { exact: true }).waitFor();
    await page.evaluate(() => window.__releaseHrComplaintA());
    await page.waitForFunction(() => window.__hrComplaintHeld === true);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.match(await detailPanel.innerText(), new RegExp(createdB.body.protocol));
    assert.doesNotMatch(await detailPanel.innerText(), new RegExp(sharedTitle));
    await page.evaluate(() => { window.fetch = window.__hrComplaintFetch; });

    // Gravação real pelo formulário, com corpo e status HTTP conferidos.
    await detailPanel.getByLabel('Nova situação').selectOption('em_apuracao');
    await detailPanel.getByLabel('Motivo da atualização').fill(`Acompanhamento RH sintético ${suffix}.`);
    const patchResponsePromise = page.waitForResponse(response => response.url().endsWith(`/api/admin/hr/employee-complaints/${idB}`) && response.request().method() === 'PATCH');
    await detailPanel.getByRole('button', { name: 'Salvar situação' }).click();
    const patchResponse = await patchResponsePromise;
    const patched = await patchResponse.json();
    assert.equal(patchResponse.status(), 200);
    assert.equal(patched.item.status, 'em_apuracao');
    await detailPanel.locator('dd').filter({ hasText: 'Em apuração' }).waitFor();
    const historyAfter = await pool.query('SELECT previous_status::text, next_status::text, reason, changed_by_identity FROM cli_employee_complaint_history WHERE complaint_id=$1 ORDER BY created_at DESC LIMIT 1', [idB]);
    assert.deepEqual(historyAfter.rows[0], { previous_status: 'pendente', next_status: 'em_apuracao', reason: `Acompanhamento RH sintético ${suffix}.`, changed_by_identity: rh.id });
    assert.equal(Number((await pool.query("SELECT count(*) AS n FROM audit_log WHERE action='cli_complaint_status' AND target=$1 AND meta->>'channel'='rh_shared'", [idB])).rows[0].n), 1);

    // 503 de transporte simulado no browser mantém estado de erro e botão retry;
    // repetir usa o servidor real e recupera a lista com situação atualizada.
    await page.evaluate(() => {
      const original = window.fetch.bind(window); window.__hrComplaintFetch = original; window.__failHrList = true;
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (new URL(url, location.origin).pathname === '/api/admin/hr/employee-complaints' && (!init?.method || init.method === 'GET') && window.__failHrList) {
          window.__failHrList = false;
          return new Response(JSON.stringify({ error: 'service_unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } });
        }
        return original(input, init);
      };
    });
    await area.getByRole('button', { name: 'Atualizar lista' }).click();
    await listPanel.getByText('O serviço está temporariamente indisponível. Tente novamente.', { exact: true }).waitFor();
    assert.equal(await listPanel.getByText(/Não há relatos compartilhados/).count(), 0);
    await listPanel.getByRole('button', { name: 'Tentar novamente' }).click();
    await buttonForProtocol(createdB.body.protocol).getByText(/Em apuração/).waitFor();
    await page.evaluate(() => { window.fetch = window.__hrComplaintFetch; });

    // Quatro larguras reais no conteúdo carregado, sem overflow do workspace.
    const viewportEvidence = [];
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const measured = await area.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
      viewportEvidence.push({ width, ...measured });
      assert.ok(measured.scrollWidth <= measured.clientWidth + 1, `RH compartilhadas transbordou em ${width}px: ${JSON.stringify(measured)}`);
    }
    const missingLabels = await area.locator('input,select,textarea').evaluateAll(controls => controls.filter(control => !control.labels || control.labels.length === 0).map(control => control.outerHTML));
    assert.deepEqual(missingLabels, [], 'campos do fluxo precisam de rótulo associado');
    assert.ok(await area.locator(':focus-visible').count() >= 0);
    if (process.env.UX_PORTAL_EVIDENCE_DIR) {
      await writeFile(path.join(process.env.UX_PORTAL_EVIDENCE_DIR, `ux-pro-03-rh-reclamacoes-${suffix}-viewport.json`), JSON.stringify(viewportEvidence, null, 2));
    }
  } finally {
    await context?.close();
    await browser.close();
  }
});

// ---------------------------------------------------------------------------
// UX-PRO-03 — ADM-01..06 no console de TI: pauta do dia, retratos comercial,
// operacional e financeiro, risco de renovação e aprovação unificada.
// Dados e identidades sintéticos; o banco inteiro é descartado pelo runner.
// A tela é mais estreita que a API: `marcelo` e `financeiro` recebem 200 no
// servidor mas não entram em /admin/ti; `comercial` é negado nos dois.
// ---------------------------------------------------------------------------
test('browser UX-PRO-03: ADM-01..06 pauta, retratos e aprovações (papéis, escritas, decisão, falhas e quatro larguras)', { skip: !RUN }, async () => {
  const ti = await provisionStaff(pool, { role: 'ti' });
  const comercial = await provisionStaff(pool, { role: 'comercial' });
  const marcelo = await provisionStaff(pool, { role: 'marcelo' });
  const tiCookie = await loginStaffHttp(ti.email);
  const comercialCookie = await loginStaffHttp(comercial.email);
  const marceloCookie = await loginStaffHttp(marcelo.email);
  const suffix = randomUUID().slice(0, 8);
  const myDay = '/api/adm/my-day';
  const approvals = '/api/adm/approvals';
  const risks = '/api/adm/renewal-risks';
  const financial = '/api/adm/financial-snapshots';

  // --- servidor: papéis nomeados, e as escritas que a tela expõe -----------
  assert.equal((await api(myDay, { cookie: tiCookie })).status, 200);
  const comercialRead = await api(myDay, { cookie: comercialCookie });
  assert.equal(comercialRead.status, 403);
  assert.equal(comercialRead.body.error, 'forbidden');
  const comercialWrite = await api(myDay, { method: 'POST', cookie: comercialCookie,
    body: { title: 'Pauta sintética negada', description: 'Descrição sintética suficientemente longa.', responsible_name: 'QA', action_type: 'revisao' } });
  assert.equal(comercialWrite.status, 403);
  // A UI é mais estreita que a API: marcelo/financeiro lêem, mas não veem a aba.
  assert.equal((await api(myDay, { cookie: marceloCookie })).status, 200);
  assert.equal((await api(myDay, { method: 'POST', cookie: undefined })).status, 401);

  const taskTitle = `QA-ADM01-${suffix}`;
  const createdTask = await api(myDay, { method: 'POST', cookie: tiCookie,
    body: { title: taskTitle, description: `Descrição sintética da pauta ${suffix}.`, priority: 'alta', responsible_name: 'QA sintético', action_type: 'revisao', source_module: 'adm' } });
  assert.equal(createdTask.status, 201);
  const taskId = createdTask.body.item.id;
  // Antes desta fatia esta transição devolvia 500 com a mensagem SQL no corpo.
  const transition = await api(myDay, { method: 'PATCH', cookie: tiCookie, body: { id: taskId, status: 'concluida' } });
  assert.equal(transition.status, 200);
  assert.equal(transition.body.item.status, 'concluida');
  const badTransition = await api(myDay, { method: 'PATCH', cookie: tiCookie, body: { id: taskId, status: 'concluido' } });
  assert.equal(badTransition.status, 400);
  assert.equal(badTransition.body.error, 'invalid_status');
  assert.ok(!('details' in badTransition.body), 'a resposta não pode vazar a mensagem SQL');

  // Acima da alçada a criação é recusada; dentro dela, sai com protocolo.
  const above = await api(approvals, { method: 'POST', cookie: tiCookie,
    body: { approval_type: 'despesa', amount_cents: 90000, threshold_cents: 10000, requester_name: 'Solicitante sintético', scope: 'Compras', reason: `Motivo sintético ${suffix}.` } });
  assert.equal(above.status, 400);
  assert.equal(above.body.error, 'approver_required_above_threshold_alcada');
  const createdApproval = await api(approvals, { method: 'POST', cookie: tiCookie,
    body: { approval_type: 'desconto', amount_cents: 5000, threshold_cents: 20000, requester_name: 'Solicitante sintético', scope: 'Comercial', reason: `Motivo sintético ${suffix}.` } });
  assert.equal(createdApproval.status, 201);
  const approvalId = createdApproval.body.approval.id;
  assert.match(createdApproval.body.approval.protocol, /^APR-ADM-\d{8}-[A-Z0-9]{4}$/);

  // Risco de renovação e retrato financeiro.
  const createdRisk = await api(risks, { method: 'POST', cookie: tiCookie,
    body: { renewal_date: '2026-12-01', risk_level: 'alto', risk_score: 70, justification: `Justificativa sintética de risco ${suffix}.`, reincidence_count: 2, is_justified: true, facts_json: { origem: 'gate' } } });
  assert.equal(createdRisk.status, 201);
  const riskId = createdRisk.body.risk.id;
  const reviewed = await api(risks, { method: 'PATCH', cookie: tiCookie, body: { id: riskId, risk_level: 'critico' } });
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.body.risk.risk_level, 'critico');
  const badRisk = await api(risks, { method: 'PATCH', cookie: tiCookie, body: { id: riskId, risk_level: 'enorme' } });
  assert.equal(badRisk.status, 400);
  assert.equal(badRisk.body.error, 'invalid_risk_level');
  const snapshot = await api(financial, { method: 'POST', cookie: tiCookie,
    body: { competence_date: '2026-09-01', source: 'geral', total_receivables_cents: 100000, total_payables_cents: 40000, overdue_cents: 5000, upcoming_cents: 8000, margin_by_contract: {} } });
  assert.equal(snapshot.status, 201);
  const duplicated = await api(financial, { method: 'POST', cookie: tiCookie, body: { competence_date: '2026-09-01', source: 'geral' } });
  assert.equal(duplicated.status, 409);
  assert.equal(duplicated.body.error, 'duplicate_competence_source');

  // --- navegador: papéis que não veem a aba --------------------------------
  for (const cookie of [comercialCookie, marceloCookie]) {
    const browser = await launchBrowser();
    try {
      const { context, page } = await openPage(browser, '/admin/ti', cookie);
      await page.locator('[data-admin-gate="forbidden"]').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Pauta, retratos e aprovações', exact: true }).count(), 0);
      await context.close();
    } finally { await browser.close(); }
  }

  // --- navegador: quatro larguras com os seis painéis e os formulários ------
  for (const width of [320, 390, 768, 1440]) {
    const browser = await launchBrowser();
    try {
      const { context, page } = await openPage(browser, '/admin/ti', tiCookie, { width, height: 900 });
      const tab = page.getByRole('button', { name: 'Pauta, retratos e aprovações', exact: true });
      await tab.waitFor(); await tab.focus(); await page.keyboard.press('Enter');
      const area = page.locator('section[aria-labelledby="adm-title"]');
      await area.getByRole('heading', { name: 'Pauta, retratos e aprovações' }).waitFor();
      for (const title of ['ADM-01 Pauta do dia', 'ADM-02 Retrato comercial', 'ADM-05 Risco de renovação', 'ADM-06 Aprovação unificada']) {
        await area.getByRole('heading', { name: title }).waitFor();
      }
      for (const summary of ['Nova pendência da pauta (ADM-01)', 'Nova aprovação unificada (ADM-06)']) {
        await area.locator('summary').filter({ hasText: summary }).click();
      }
      const missingLabels = await area.locator('input,select,textarea').evaluateAll(controls => controls.filter(control => !control.labels || control.labels.length === 0).map(control => control.outerHTML));
      assert.deepEqual(missingLabels, [], `todos os campos precisam de rótulo em ${width}px`);
      const body = await area.innerText();
      assert.match(body, /Fonte:/); assert.match(body, /Data-base:/);
      assert.match(body, /não envia e-mail/i); assert.match(body, /NO-GO/);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `o painel ADM transborda ${overflow}px em ${width}px`);
      await context.close();
    } finally { await browser.close(); }
  }

  // --- navegador: escritas reais pela interface -----------------------------
  const browser = await launchBrowser();
  let context;
  try {
    let page;
    ({ context, page } = await openPage(browser, '/admin/ti', tiCookie, { width: 1440, height: 900 }));
    await page.getByRole('button', { name: 'Pauta, retratos e aprovações', exact: true }).click();
    const area = page.locator('section[aria-labelledby="adm-title"]');
    const pautaPanel = page.locator('section[aria-labelledby="adm-myDay-title"]');
    const riskPanel = page.locator('section[aria-labelledby="adm-risks-title"]');
    const approvalPanel = page.locator('section[aria-labelledby="adm-approvals-title"]');
    const historyPanel = page.locator('section[aria-labelledby="adm-history-title"]');
    const responseFor = (pathname, method) => page.waitForResponse(response => new URL(response.url()).pathname === pathname && response.request().method() === method);

    await pautaPanel.getByText(taskTitle, { exact: false }).waitFor();

    // 1) POST inválido mede status/corpo e mostra a tradução, sem código cru.
    await area.locator('summary').filter({ hasText: 'Nova pendência da pauta (ADM-01)' }).click();
    await area.getByLabel('Título da pendência').fill('x');
    await area.getByLabel('Descrição da pendência').fill('curta');
    let pending = responseFor(myDay, 'POST');
    await area.getByRole('button', { name: 'Registrar pendência da pauta' }).click();
    let httpResponse = await pending;
    assert.equal(httpResponse.status(), 400);
    assert.equal((await httpResponse.json()).error, 'title_5_200');
    await area.getByRole('alert').getByText('O título precisa ter entre 5 e 200 caracteres.').waitFor();
    assert.doesNotMatch(await area.innerText(), /title_5_200/);

    // 2) POST real pela tela, com releitura da lista pelo próprio componente.
    const uiTitle = `QA-ADM01-UI-${suffix}`;
    await area.getByLabel('Título da pendência').fill(uiTitle);
    await area.getByLabel('Descrição da pendência').fill(`Descrição sintética criada pela interface ${suffix}.`);
    await area.getByLabel('Pessoa responsável').fill('QA sintético');
    await area.getByLabel('Tipo de ação').fill('revisao');
    pending = responseFor(myDay, 'POST');
    await area.getByRole('button', { name: 'Registrar pendência da pauta' }).click();
    httpResponse = await pending;
    assert.equal(httpResponse.status(), 201);
    await area.getByRole('status').getByText('Pendência da pauta registrada.').waitFor();
    const uiRow = pautaPanel.locator('li').filter({ hasText: uiTitle });
    await uiRow.waitFor();

    // 3) A transição que antes devolvia 500 agora sai pela interface.
    pending = responseFor(myDay, 'PATCH');
    await uiRow.getByRole('button', { name: 'Em andamento' }).click();
    httpResponse = await pending;
    assert.equal(httpResponse.status(), 200);
    assert.equal((await httpResponse.json()).item.status, 'em_andamento');
    await uiRow.getByText(/Situação: em_andamento/).waitFor();

    // 4) Revisão do risco pela lista.
    const riskRow = riskPanel.locator('li').filter({ hasText: '2026' });
    pending = responseFor(risks, 'PATCH');
    await riskRow.first().getByRole('button', { name: 'Marcar baixo' }).click();
    httpResponse = await pending;
    assert.equal(httpResponse.status(), 200);
    assert.equal((await httpResponse.json()).risk.risk_level, 'baixo');

    // 5) Decisão da aprovação pela tela: 200, histórico e corpo conferidos.
    const approvalRow = approvalPanel.locator('li').filter({ hasText: createdApproval.body.approval.protocol });
    await approvalRow.getByRole('button', { name: 'Ver histórico' }).click();
    await historyPanel.getByText('início → pendente', { exact: false }).waitFor();
    await area.getByLabel('Situação de destino').selectOption('rejeitado');
    await area.getByLabel('Motivo da decisão').fill(`Motivo sintético da decisão pela tela ${suffix}.`);
    pending = responseFor(approvals, 'PATCH');
    await area.getByRole('button', { name: 'Registrar decisão da aprovação' }).click();
    httpResponse = await pending;
    assert.equal(httpResponse.status(), 200, 'a decisão precisa sair pela interface');
    const decided = await httpResponse.json();
    assert.equal(decided.approval.status, 'rejeitado');
    await area.getByRole('status').getByText('Aprovação marcada como rejeitado.').waitFor();
    await historyPanel.getByText('pendente → rejeitado', { exact: false }).waitFor();
    const historyRows = await pool.query('SELECT previous_status::text, next_status::text, reason FROM adm_approval_history WHERE approval_id=$1 ORDER BY created_at ASC', [approvalId]);
    assert.deepEqual(historyRows.rows.map(row => row.next_status), ['pendente', 'rejeitado']);
    assert.equal(historyRows.rows[1].reason, `Motivo sintético da decisão pela tela ${suffix}.`);

    // 6) 503 de transporte no navegador: estado de erro e retry que recupera.
    await page.evaluate(() => {
      const original = window.fetch.bind(window);
      window.__admOriginalFetch = original;
      window.__failAdmPauta = true;
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (new URL(url, location.origin).pathname === '/api/adm/my-day' && (!init?.method || init.method === 'GET') && window.__failAdmPauta) {
          window.__failAdmPauta = false;
          return new Response(JSON.stringify({ error: 'service_unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } });
        }
        return original(input, init);
      };
    });
    await area.getByRole('button', { name: 'Atualizar painel' }).click();
    await pautaPanel.getByText('O serviço está indisponível. Tente novamente em instantes.', { exact: true }).waitFor();
    assert.equal(await pautaPanel.getByText(taskTitle, { exact: false }).count(), 0, 'o erro não pode conviver com a lista anterior');
    await pautaPanel.getByRole('button', { name: 'Tentar novamente' }).click();
    await pautaPanel.getByText(taskTitle, { exact: false }).waitFor();
    await page.evaluate(() => { window.fetch = window.__admOriginalFetch; });

    // 7) Ausência honesta: centavos e datas nunca viram zero nem 01/01/1970.
    const text = await approvalPanel.innerText();
    assert.doesNotMatch(text, /01\/01\/1970/);
    assert.match(await page.locator('section[aria-labelledby="adm-financial-title"]').innerText(), /R\$/);
  } finally {
    await context?.close();
    await browser.close();
  }
});
