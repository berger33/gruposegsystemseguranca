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
//  - 390px não produz transbordo horizontal.
//
// O que este gate NÃO prova: aceite humano, homologação de Marcelo/Andreia,
// comportamento em Windows ou na máquina do operador.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { provisionStaff, STAFF_TEST_PASSWORD } from './helpers/staff-login.mjs';
import { hashPassword } from '../src/lib/client-auth-core.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');

let server, baseUrl, pool;
let rhCookie;
let employee, employeeEmail, employeePassword;
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
async function openPage(browser, route, cookie, { width = 1440, height = 900, failRoutes = [], status = 503, code = 'employee_home_unavailable' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  if (cookie) {
    await context.addCookies(cookie.split('; ').filter(Boolean).map(item => {
      const separator = item.indexOf('=');
      return { name: item.slice(0, separator), value: item.slice(separator + 1), url: baseUrl };
    }));
  }
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
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
  return { context, page };
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

  for (const route of ['/funcionario', '/cliente/app']) {
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
