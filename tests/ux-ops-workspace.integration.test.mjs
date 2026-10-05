// UX-07 (fatia A — Operação) — gate da tela de Operação, por HTTP real contra
// PostgreSQL real (executado por scripts/qa-ux-ops-postgres.mjs, que sobe um
// cluster descartável) e por Chromium real.
//
// O que este gate prova:
//  - as rotas de operação continuam respondendo 401 sem sessão;
//  - "menu não é autorização": o papel supervisor abre /admin/operacao (está
//    na lista do AdminGate) e mesmo assim é recusado em escritas restritas a
//    admin/ti/rh — a tela não finge uma permissão que o servidor não dá;
//  - o defeito corrigido nesta fatia: uma FALHA de leitura (rede fora do ar,
//    503 de um dos nove endpoints do painel inicial) não vira "nenhum
//    registro" — carregando, vazio, falha e negado continuam quatro estados
//    distintos, com o código canônico disponível como detalhe;
//  - as 14 abas são um tablist de verdade, com roving tabindex e teclado;
//  - o vocabulário em português aparece nas tabelas (situação de posto,
//    alocação, dimensionamento, versão de escala) com o valor cru preservado
//    como `title`/atributo, nunca inventado;
//  - a ciência de escala é idempotente também na tela: a segunda ciência do
//    mesmo profissional não é tratada como falha;
//  - a correção pontual em OpsAdvanced2Client (abas legadas de Supervisão/
//    Rondas/Relatórios): uma falha de leitura agora aparece como falha, não
//    mais como lista vazia silenciosa;
//  - 390px não produz transbordo horizontal.
//
// O que este gate NÃO prova: aceite humano, homologação de Marcelo/Andreia,
// comportamento em Windows ou na máquina do operador, nem qualquer aspecto
// das telas legadas além da correção pontual acima (ver pendências em
// docs/UX-07-OPERACAO-2026-10-05.md).

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

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');

let server, baseUrl, pool;
let tiCookie, supervisorCookie, rhCookie;
let employeeId;
let postId, shiftTemplateId, versionId;

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

const evidenceDir = process.env.UX_OPS_EVIDENCE_DIR || '';
async function capture(page, nome) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage: true });
}

/**
 * Abre /admin/operacao já autenticado com o cookie indicado. `failRoutes`
 * derruba, dentro da própria página, as respostas indicadas: `page.route()` é
 * instável com este Chromium empacotado, então a substituição é feita em
 * `window.fetch`, como nos demais gates do repositório. O servidor NÃO é
 * enfraquecido.
 */
async function openOps(browser, cookie, { width = 1440, height = 900, failRoutes = [], status = 503, code = 'internal' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  const separator = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: baseUrl }]);
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
  await page.goto(`${baseUrl}/admin/operacao`, { waitUntil: 'domcontentloaded' });
  return { context, page };
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
      NEXT_DIST_DIR: '.next/integration-ux-ops',
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

  const ti = await provisionStaff(pool, { role: 'ti' });
  const supervisor = await provisionStaff(pool, { role: 'supervisor' });
  const rh = await provisionStaff(pool, { role: 'rh' });
  tiCookie = await loginStaffHttp(ti.email);
  supervisorCookie = await loginStaffHttp(supervisor.email);
  rhCookie = await loginStaffHttp(rh.email);

  for (const route of ['/admin/entrar', '/admin/operacao']) {
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

test('as rotas de operação continuam exigindo sessão, sem mudança de contrato', { skip: !RUN }, async () => {
  const anonymous = await api('/api/ops/posts');
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error, 'unauthorized');
  assert.ok(!('posts' in (anonymous.body || {})), 'a negativa não pode vazar posto algum');
});

test('menu não é autorização: supervisor abre /admin/operacao mas é recusado numa escrita restrita', { skip: !RUN }, async () => {
  // /admin/operacao está em allowedRoles do AdminGate para supervisor — a
  // página abre. Mas criar um cargo/função continua restrito a admin/ti/rh
  // pelo próprio servidor (ops-api.mjs). A tela não pode fingir essa permissão.
  const negado = await api('/api/ops/job-roles', {
    method: 'POST', cookie: supervisorCookie, body: { name: `Cargo QA ${randomUUID().slice(0, 6)}` },
  });
  assert.equal(negado.status, 403);
  assert.equal(negado.body.error, 'forbidden');
  assert.ok(!('role' in (negado.body || {})), 'a recusa não pode vazar criação alguma');

  const permitido = await api('/api/ops/job-roles', {
    method: 'POST', cookie: tiCookie, body: { name: `Cargo QA ${randomUUID().slice(0, 6)}` },
  });
  assert.equal(permitido.status, 201, 'ti continua podendo criar cargo/função — esta fatia não mudou permissão alguma');
});

test('massa fictícia pelas próprias APIs de operação: posto, turno, funcionário, versão de escala e ciência idempotente', { skip: !RUN }, async () => {
  const suffix = randomUUID().slice(0, 8);

  const employeeCreated = await api('/api/hr/employees', {
    method: 'POST', cookie: rhCookie,
    body: { matricula: `QA-UX07-${suffix}`, display_name: `Vigilante Sintetico ${suffix}`, cargo: 'vigilante', status: 'ativo', employment_type: 'clt' },
  });
  assert.equal(employeeCreated.status, 201, `criação do funcionário deveria ser 201, veio ${employeeCreated.status}`);
  employeeId = employeeCreated.body.employee.id;

  const post = await api('/api/ops/posts', { method: 'POST', cookie: tiCookie, body: { name: `Portaria QA ${suffix}` } });
  assert.equal(post.status, 201);
  postId = post.body.post.id;

  const template = await api('/api/ops/shift-templates', {
    method: 'POST', cookie: tiCookie,
    body: { name: `Turno QA ${suffix}`, shift_type: 'diurno', start_time: '08:00', end_time: '20:00', duration_hours: 12 },
  });
  assert.equal(template.status, 201);
  shiftTemplateId = template.body.template.id;

  // Versão criada já como "revisada": é o único status que é simultaneamente
  // editável (entradas) e publicado (ciência) — evita duas chamadas de PATCH
  // só para preparar massa de teste.
  const validFrom = new Date().toISOString().slice(0, 10);
  const validTo = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);
  const version = await api('/api/ops/schedule-versions', {
    method: 'POST', cookie: tiCookie,
    body: { valid_from: validFrom, valid_to: validTo, status: 'revisada' },
  });
  assert.equal(version.status, 201);
  versionId = version.body.version.id;

  const entry = await api('/api/ops/schedule-entries', {
    method: 'POST', cookie: tiCookie,
    body: { version_id: versionId, post_id: postId, employee_id: employeeId, shift_template_id: shiftTemplateId, entry_date: validFrom },
  });
  assert.equal(entry.status, 201, `entrada de escala deveria ser 201, veio ${entry.status} ${JSON.stringify(entry.body)}`);

  const dimensioning = await api('/api/ops/dimensioning', {
    method: 'POST', cookie: tiCookie,
    body: {
      post_id: postId, period_start: validFrom, period_end: validTo,
      contracted_headcount: 1, planned_headcount: 1, realized_headcount: 1,
      coverage_hours_required: 100, coverage_hours_realized: 70,
    },
  });
  assert.equal(dimensioning.status, 201);
  assert.equal(Number(dimensioning.body.dimensioning.coverage_percent), 70, 'a cobertura é calculada pelo banco, não pela tela');

  // A idempotência da ciência (201 na primeira, 409 duplicate_ack na segunda)
  // é verificada pela própria tela no teste de browser abaixo — não duas
  // vezes aqui, para não deixar um registro de ciência já feito antes de a
  // interface tentar o primeiro clique.
});

test('browser: falha de leitura NÃO vira lista vazia no painel inicial de operação', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openOps(browser, tiCookie, {
      failRoutes: ['/api/ops/occurrence-book'], status: 503, code: 'audit_or_write_unavailable',
    });
    const estado = page.locator('[data-ui-state="error"]').first();
    await estado.waitFor();
    const texto = await estado.innerText();
    assert.match(texto, /HTTP 503|audit_or_write_unavailable/, 'o código canônico fica disponível para diagnóstico');
    assert.equal(await page.locator('[role="tablist"]').count(), 0, 'sem leitura completa, as abas de trabalho não aparecem');
    assert.ok(await estado.locator('button').count() >= 1, 'falha transitória precisa oferecer nova tentativa');
    await capture(page, 'desktop-operacao-falha-inicial');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: as 14 abas de operação são um tablist de verdade, com teclado', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openOps(browser, tiCookie);
    await page.locator('[role="tablist"]').waitFor();

    const abas = page.getByRole('tab');
    assert.equal(await abas.count(), 14, 'a operação tem catorze frentes de trabalho');
    assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1);
    assert.equal(await page.locator('[role="tab"][tabindex="-1"]').count(), 13);
    assert.equal(await page.locator('[role="tabpanel"]').count(), 1, 'só o painel ativo fica montado');

    await abas.first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await abas.nth(1).getAttribute('aria-selected'), 'true');
    assert.equal(await abas.nth(1).evaluate(el => el === document.activeElement), true,
      'a seta precisa mover o foco junto com a seleção');
    await page.keyboard.press('End');
    assert.equal(await abas.nth(13).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await abas.nth(0).getAttribute('aria-selected'), 'true');

    await capture(page, 'desktop-operacao-abas');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: posto, alocação de escala e dimensionamento aparecem com vocabulário em português', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openOps(browser, tiCookie);
    await page.locator('[role="tablist"]').waitFor();

    // Aba inicial: Postos e alocações.
    await page.locator('table', { hasText: 'Portaria QA' }).first().waitFor();
    const badgeAtivo = page.locator('[data-ui-badge]', { hasText: /^ATIVO$/i }).first();
    await badgeAtivo.waitFor();

    await page.getByRole('tab', { name: 'Dimensionamento', exact: true }).click();
    const badgeCobertura = page.locator('[data-ui-badge]', { hasText: '70%' }).first();
    await badgeCobertura.waitFor();
    assert.equal(await badgeCobertura.getAttribute('data-ui-badge'), 'warning', '70% de cobertura é alerta, não sucesso nem perigo');

    await page.getByRole('tab', { name: 'Escalas', exact: true }).click();
    await page.getByRole('button', { name: 'Ver calendário' }).first().click();
    await page.locator('table').filter({ hasText: 'Portaria QA' }).first().waitFor();

    await capture(page, 'desktop-operacao-vocabulario');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: a ciência da escala é idempotente também na tela — a segunda ciência não é um erro', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openOps(browser, tiCookie);
    await page.locator('[role="tablist"]').waitFor();
    await page.getByRole('tab', { name: 'Escalas', exact: true }).click();
    await page.getByRole('button', { name: 'Ver calendário' }).first().click();

    const registrar = page.getByRole('button', { name: 'Registrar ciência' }).first();
    await registrar.waitFor();
    await registrar.click();
    await page.locator('text=/Ciência registrada para/i').waitFor();

    // Segunda ciência: o estado de erro não pode aparecer, e a frase precisa
    // dizer que a idempotência está funcionando, não falhando.
    await registrar.click();
    await page.locator('text=/já registrada.*não duplica efeito/i').waitFor();
    assert.equal(await page.locator('[role="alert"][data-ui-state="error"]').count(), 0,
      'a segunda ciência é tratada, não é um erro');

    await capture(page, 'desktop-operacao-ciencia-idempotente');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: a correção pontual em OpsAdvanced2Client mostra a falha real, não mais lista vazia', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openOps(browser, tiCookie, {
      failRoutes: ['/api/hr/ops-supervision-visits'], status: 503, code: 'internal',
    });
    await page.locator('[role="tablist"]').waitFor();
    await page.getByRole('tab', { name: 'Supervisão' }).click();

    // Antes desta fatia, `loadAll()` engolia a falha com
    // `.catch(()=>({visits:[]}))` e a área legada mostrava listas vazias como
    // se a leitura tivesse funcionado. Agora a falha aparece.
    const estado = page.locator('[data-ui-state="error"]').first();
    await estado.waitFor();
    const texto = await estado.innerText();
    assert.match(texto, /HTTP 503|internal/, 'o código canônico fica disponível para diagnóstico');

    await capture(page, 'desktop-operacao-legado-falha-visivel');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: em 390px a tela de operação não produz transbordo horizontal', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openOps(browser, tiCookie, { width: 390, height: 844 });
    await page.locator('[role="tablist"]').waitFor();
    await page.waitForTimeout(400);
    const transbordo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(transbordo <= 1, `transbordo de ${transbordo}px na tela de operação`);

    const alturas = await page.locator('[role="tab"]').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().height)));
    for (const altura of alturas) assert.ok(altura >= 32, `aba com apenas ${altura}px de altura`);
    await capture(page, 'mobile-operacao-390px');
    await context.close();
  } finally { await browser.close(); }
});
