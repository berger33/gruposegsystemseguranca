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
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { recordKeyboardCapture } from '../scripts/ux-pro-00-keyboard-evidence.mjs';
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

// ============================================================================
// UX-PRO-07D-1 — casos aditivos de leitura. Nenhum caso herdado acima é
// editado; as falhas são injetadas somente em window.fetch da página.
// ============================================================================

const stagePro = 'ux-pro-07-operacao';
const evidenceEntriesPro = [];

async function writeEvidenceSummaryPro() {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  const entries = [...new Map(evidenceEntriesPro.map(entry => [path.basename(entry.screenshot), entry])).values()];
  await writeFile(path.join(evidenceDir, 'resumo.json'), `${JSON.stringify({
    stage: stagePro,
    generatedBy: 'npm run test:ux-ops:pg (PostgreSQL descartável + HTTP real + Chromium)',
    notes: 'Massa inteiramente sintética criada pelas APIs de operação. problems resulta das medições automatizadas; não representa validação manual nem aceite humano.',
    entries,
  }, null, 2)}\n`, 'utf8');
}

async function capturePro(page, name, extra = {}) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  const file = path.join(evidenceDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const viewport = page.viewportSize();
  evidenceEntriesPro.push({
    stage: stagePro,
    route: '/admin/operacao',
    role: 'ti',
    viewport: `${viewport.width}x${viewport.height}`,
    theme: await page.evaluate(() => document.documentElement.dataset.adminTheme || 'day'),
    screenshot: path.relative(root, file).replaceAll('\\', '/'),
    problems: [],
    ...extra,
  });
  await writeEvidenceSummaryPro();
}

async function contrastPro(page, selector) {
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
        if (value && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') return parse(value);
        current = current.parentElement;
      }
      return [255, 255, 255];
    };
    const foreground = parse(getComputedStyle(element).color);
    const back = background(element);
    const l1 = luminance(foreground);
    const l2 = luminance(back);
    return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
  });
}

const CRASH_PRO = /Target (page|closed)|has been closed|Target crashed|browser has disconnected|crashed|SIGSEGV|Protocol error/i;
async function withBrowserPro(body) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const browser = await launchBrowser();
    try {
      return await body(browser);
    } catch (error) {
      if (error?.code === 'ERR_ASSERTION' || !CRASH_PRO.test(String(error?.message || ''))) throw error;
      lastError = error;
      console.log(`UX_OPS_BROWSER_RETRY tentativa=${attempt}: ${String(error.message).split('\n')[0]}`);
    } finally {
      await browser.close().catch(() => {});
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw lastError;
}

const READ_RESOURCES_PRO = {
  posts: '/api/ops/posts',
  allocations: '/api/ops/allocations',
  coverageRequests: '/api/ops/coverage-requests',
  handovers: '/api/ops/handovers',
  occurrences: '/api/ops/occurrence-book',
  checklists: '/api/ops/checklist-instances',
  workRules: '/api/ops/work-rules',
  qualifications: '/api/ops/qualifications',
  validations: '/api/ops/validations',
  jobRoles: '/api/ops/job-roles',
  shiftNeeds: '/api/ops/post-shift-needs',
  dimensionings: '/api/ops/dimensioning',
  coverageGaps: '/api/ops/coverage-gaps',
  scheduleVersions: '/api/ops/schedule-versions',
  scheduleEntries: '/api/ops/schedule-entries',
  scheduleAcks: '/api/ops/schedule-acks',
  scheduleHistory: '/api/ops/schedule-history',
};

function defaultReadRulesPro(overrides = {}) {
  const base = {};
  for (const key of Object.keys(READ_RESOURCES_PRO)) {
    base[key] = { delay: 0, fail: false, malformed: false, status: 503, code: 'read_unavailable', ...(overrides[key] || {}) };
  }
  return base;
}

async function openOpsPro(browser, cookie, { width = 1440, height = 900, rules = {} } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  const separator = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(90_000);
  await page.addInitScript(control => {
    const original = window.fetch.bind(window);
    const paths = control.paths;
    window.__uxOpsControl = { rules: control.rules, calls: {} };
    for (const key of Object.keys(paths)) window.__uxOpsControl.calls[key] = 0;
    window.fetch = async (input, init) => {
      const raw = typeof input === 'string' ? input : (input?.url || '');
      const pathname = new URL(raw, window.location.origin).pathname;
      const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
      if (method === 'GET') {
        const key = Object.keys(paths).find(name => paths[name] === pathname);
        const rule = key ? window.__uxOpsControl.rules[key] : null;
        if (key && rule) {
          window.__uxOpsControl.calls[key] += 1;
          if (rule.delay > 0) await new Promise(resolve => setTimeout(resolve, rule.delay));
          if (rule.malformed) {
            return new Response(JSON.stringify({ note: 'corpo 2xx sem a chave canônica' }), {
              status: 200, headers: { 'content-type': 'application/json' },
            });
          }
          if (rule.fail) {
            return new Response(JSON.stringify({ error: rule.code }), {
              status: rule.status, headers: { 'content-type': 'application/json' },
            });
          }
        }
      }
      return original(input, init);
    };
  }, { rules: defaultReadRulesPro(rules), paths: READ_RESOURCES_PRO });
  await page.goto(`${baseUrl}/admin/operacao`, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

async function setRulePro(page, resource, patch) {
  await page.evaluate(({ resource: name, patch: value }) => {
    Object.assign(window.__uxOpsControl.rules[name], value);
  }, { resource, patch });
}

async function callsPro(page) {
  return page.evaluate(() => ({ ...window.__uxOpsControl.calls }));
}

test('07D-1: as dezessete leituras continuam exigindo sessão, sem vazar a chave canônica', { skip: !RUN }, async () => {
  const endpoints = [
    ['/api/ops/posts?limit=100', 'posts'], ['/api/ops/allocations', 'allocations'],
    ['/api/ops/coverage-requests', 'requests'], ['/api/ops/handovers', 'handovers'],
    ['/api/ops/occurrence-book', 'occurrences'], ['/api/ops/checklist-instances', 'instances'],
    ['/api/ops/work-rules', 'rules'], ['/api/ops/qualifications', 'qualifications'],
    ['/api/ops/validations?is_valid=false', 'validations'], ['/api/ops/job-roles', 'roles'],
    ['/api/ops/post-shift-needs', 'needs'], ['/api/ops/dimensioning', 'dimensionings'],
    ['/api/ops/coverage-gaps', 'gaps'], ['/api/ops/schedule-versions', 'versions'],
    [`/api/ops/schedule-entries?version_id=${versionId}`, 'entries'],
    [`/api/ops/schedule-acks?version_id=${versionId}`, 'acknowledgments'],
    [`/api/ops/schedule-history?version_id=${versionId}`, 'history'],
  ];
  for (const [pathname, key] of endpoints) {
    const anonymous = await api(pathname);
    assert.equal(anonymous.status, 401, `${pathname} deveria exigir sessão`);
    assert.equal(anonymous.body.error, 'unauthorized');
    assert.ok(!(key in (anonymous.body || {})), `a negativa de ${pathname} não pode vazar ${key}`);
  }
  const authorized = await api('/api/ops/schedule-versions', { cookie: tiCookie });
  assert.equal(authorized.status, 200);
  assert.ok(Array.isArray(authorized.body.versions), 'ti continua lendo versões — permissão alguma mudou');
});

test('07D-1: leitura não concluída não é vazio; o vazio só aparece depois da resposta válida', { skip: !RUN }, async () => {
  await withBrowserPro(async browser => {
    const { context, page } = await openOpsPro(browser, tiCookie, { rules: { posts: { delay: 1500 } } });
    const loading = page.locator('[data-ui-state="loading"]').first();
    await loading.waitFor();
    assert.equal(await page.locator('[role="tablist"]').count(), 0, 'durante a leitura as abas não aparecem');
    assert.equal(await page.getByText('Nenhum posto cadastrado ainda').count(), 0,
      'leitura em curso nunca é apresentada como vazio');
    await page.locator('[role="tablist"]').waitFor();
    const leitura = page.locator('[data-testid="operacao-principal-leitura"]');
    await leitura.waitFor();
    assert.match(await leitura.innerText(), /Leitura concluída às/);
    await page.getByRole('tab', { name: 'Cobertura', exact: true }).click();
    await page.getByText('Nenhuma pendência de cobertura registrada').waitFor();
    await context.close();
  });
});

test('07D-1: falha inicial transitória declara o código real e a repetição emite nova leitura', { skip: !RUN }, async () => {
  await withBrowserPro(async browser => {
    const { context, page } = await openOpsPro(browser, tiCookie, {
      rules: { occurrences: { fail: true, status: 503, code: 'read_unavailable' } },
    });
    const failure = page.locator('[data-testid="operacao-principal-falha"]');
    await failure.waitFor();
    assert.match(await failure.innerText(), /read_unavailable|HTTP 503/);
    assert.equal(await page.locator('[role="tablist"]').count(), 0);
    await capturePro(page, 'operacao-1440-falha-inicial', { state: 'falha_inicial' });
    const before = await callsPro(page);
    await setRulePro(page, 'occurrences', { fail: false });
    await failure.getByRole('button', { name: 'Tentar carregar novamente' }).click();
    await page.locator('[role="tablist"]').waitFor();
    await page.locator('table', { hasText: 'Portaria QA' }).first().waitFor();
    const after = await callsPro(page);
    assert.ok(after.occurrences > before.occurrences, 'a repetição precisa emitir nova leitura de verdade');
    await context.close();
  });
});

test('07D-1: falha de releitura do grupo principal preserva o conteúdo com hora e não mostra dado novo', { skip: !RUN }, async () => {
  await withBrowserPro(async browser => {
    const { context, page } = await openOpsPro(browser, tiCookie);
    await page.locator('[role="tablist"]').waitFor();
    await page.locator('table', { hasText: 'Portaria QA' }).first().waitFor();
    const suffix = randomUUID().slice(0, 8);
    const novoNome = `Portaria QA desatualizada ${suffix}`;
    const created = await api('/api/ops/posts', { method: 'POST', cookie: tiCookie, body: { name: novoNome } });
    assert.equal(created.status, 201);
    await setRulePro(page, 'occurrences', { fail: true, status: 503, code: 'read_unavailable' });
    await page.locator('[data-testid="operacao-principal-atualizar"]').click();
    const stale = page.locator('[data-testid="operacao-principal-desatualizado"]');
    await stale.waitFor();
    assert.match(await stale.innerText(), /read_unavailable/);
    assert.match(await stale.innerText(), /última leitura concluída às/);
    assert.equal(await page.locator('[role="tablist"]').count(), 1, 'o conteúdo lido continua na tela');
    await page.locator('table', { hasText: 'Portaria QA' }).first().waitFor();
    assert.equal(await page.getByText(novoNome, { exact: true }).count(), 0,
      'dado criado durante a falha não entra no recorte preservado');
    const ratio = await contrastPro(page, '[data-testid="operacao-principal-desatualizado"]');
    assert.ok(ratio >= 4.5, `contraste da faixa de desatualizado precisa ser >= 4.5:1, medido ${ratio}:1`);
    await capturePro(page, 'operacao-1440-desatualizado', { state: 'releitura_falhou_dado_preservado', contrasteFaixa: ratio });
    await setRulePro(page, 'occurrences', { fail: false });
    await stale.getByRole('button', { name: 'Tentar novamente' }).click();
    await stale.waitFor({ state: 'detached' });
    await page.getByText(novoNome, { exact: true }).waitFor();
    await context.close();
  });
});

test('07D-1: negativa 403 depois do sucesso falha fechado no grupo principal', { skip: !RUN }, async () => {
  await withBrowserPro(async browser => {
    const { context, page } = await openOpsPro(browser, tiCookie);
    await page.locator('[role="tablist"]').waitFor();
    await page.locator('table', { hasText: 'Portaria QA' }).first().waitFor();
    await setRulePro(page, 'allocations', { fail: true, status: 403, code: 'forbidden' });
    await page.locator('[data-testid="operacao-principal-atualizar"]').click();
    const denied = page.locator('[data-ui-state="denied"]').first();
    await denied.waitFor();
    assert.equal(await page.locator('[role="tablist"]').count(), 0, 'a negativa remove as abas e o conteúdo lido');
    assert.equal(await page.locator('[data-testid="operacao-principal-desatualizado"]').count(), 0,
      'negativa não é apresentada como dado desatualizado');
    assert.equal(await denied.getByRole('button').count(), 0, 'negativa não oferece repetição da mesma chamada');
    assert.equal(await page.locator('table', { hasText: 'Portaria QA' }).count(), 0,
      'nenhuma tabela protegida permanece na tela');
    await capturePro(page, 'operacao-1440-negada', { state: 'negativa_falha_fechado' });
    await context.close();
  });
});

test('07D-1: resposta 2xx sem a chave canônica de versões vira falha, nunca vazio', { skip: !RUN }, async () => {
  await withBrowserPro(async browser => {
    const { context, page } = await openOpsPro(browser, tiCookie, { rules: { scheduleVersions: { malformed: true } } });
    await page.locator('[role="tablist"]').waitFor();
    await page.getByRole('tab', { name: 'Escalas', exact: true }).click();
    const failure = page.locator('[data-testid="operacao-escalas-falha"]');
    await failure.waitFor();
    assert.match(await failure.innerText(), /invalid_ops_response/);
    assert.equal(await page.getByText('Nenhuma versão de escala registrada').count(), 0,
      'corpo 2xx sem versions não pode virar vazio');
    await capturePro(page, 'operacao-1440-resposta-invalida', { state: 'resposta_2xx_invalida' });
    await setRulePro(page, 'scheduleVersions', { malformed: false });
    await failure.getByRole('button', { name: 'Tentar carregar novamente' }).click();
    await page.getByRole('button', { name: 'Ver calendário' }).first().waitFor();
    await context.close();
  });
});

test('07D-1: atualizar o detalhe relê somente o detalhe e preserva o calendário na falha', { skip: !RUN }, async () => {
  await withBrowserPro(async browser => {
    const { context, page } = await openOpsPro(browser, tiCookie);
    await page.locator('[role="tablist"]').waitFor();
    await page.getByRole('tab', { name: 'Escalas', exact: true }).click();
    await page.getByRole('button', { name: 'Ver calendário' }).first().click();
    await page.locator('[data-testid="operacao-detalhe-leitura"]').waitFor();
    await page.locator('table').filter({ hasText: 'Portaria QA' }).first().waitFor();
    const before = await callsPro(page);
    await setRulePro(page, 'scheduleEntries', { fail: true, status: 503, code: 'read_unavailable' });
    await page.locator('[data-testid="operacao-detalhe-atualizar"]').click();
    const stale = page.locator('[data-testid="operacao-detalhe-desatualizado"]');
    await stale.waitFor();
    await page.locator('table').filter({ hasText: 'Portaria QA' }).first().waitFor();
    const during = await callsPro(page);
    assert.equal(during.scheduleVersions, before.scheduleVersions, 'o detalhe não relança a lista de versões');
    assert.equal(during.posts, before.posts, 'o detalhe não relança o grupo principal');
    assert.equal(during.dimensionings, before.dimensionings, 'o detalhe não relança o dimensionamento');
    assert.ok(during.scheduleEntries > before.scheduleEntries, 'o detalhe relê as entradas da versão');
    await setRulePro(page, 'scheduleEntries', { fail: false });
    await stale.getByRole('button', { name: 'Tentar novamente' }).click();
    await stale.waitFor({ state: 'detached' });
    await context.close();
  });
});

test('07D-1: falha de releitura do dimensionamento preserva contratado × realizado já lido', { skip: !RUN }, async () => {
  await withBrowserPro(async browser => {
    const { context, page } = await openOpsPro(browser, tiCookie);
    await page.locator('[role="tablist"]').waitFor();
    await page.getByRole('tab', { name: 'Dimensionamento', exact: true }).click();
    await page.locator('[data-ui-badge]', { hasText: '70%' }).first().waitFor();
    await setRulePro(page, 'coverageGaps', { fail: true, status: 503, code: 'read_unavailable' });
    await page.locator('[data-testid="operacao-dimensionamento-atualizar"]').click();
    const stale = page.locator('[data-testid="operacao-dimensionamento-desatualizado"]');
    await stale.waitFor();
    assert.match(await stale.innerText(), /última leitura concluída às/);
    await page.locator('[data-ui-badge]', { hasText: '70%' }).first().waitFor();
    await setRulePro(page, 'coverageGaps', { fail: false });
    await stale.getByRole('button', { name: 'Tentar novamente' }).click();
    await stale.waitFor({ state: 'detached' });
    await context.close();
  });
});

test('07D-1: falha de releitura da estrutura preserva cargos e necessidades já lidos', { skip: !RUN }, async () => {
  await withBrowserPro(async browser => {
    const { context, page } = await openOpsPro(browser, tiCookie);
    await page.locator('[role="tablist"]').waitFor();
    await page.getByRole('heading', { name: 'Cargos e funções' }).waitFor();
    await setRulePro(page, 'jobRoles', { fail: true, status: 503, code: 'read_unavailable' });
    await page.locator('[data-testid="operacao-estrutura-atualizar"]').click();
    const stale = page.locator('[data-testid="operacao-estrutura-desatualizado"]');
    await stale.waitFor();
    await page.getByRole('heading', { name: 'Cargos e funções' }).waitFor();
    await page.getByRole('heading', { name: 'Necessidade por turno' }).waitFor();
    await setRulePro(page, 'jobRoles', { fail: false });
    await stale.getByRole('button', { name: 'Tentar novamente' }).click();
    await stale.waitFor({ state: 'detached' });
    await context.close();
  });
});

test('07D-1: 320 390 768 1440, tema noturno e percurso de teclado medidos sem problemas', { skip: !RUN }, async () => {
  await withBrowserPro(async browser => {
    const { context, page } = await openOpsPro(browser, tiCookie);
    await page.locator('[role="tablist"]').waitFor();
    await page.locator('table', { hasText: 'Portaria QA' }).first().waitFor();
    for (const [width, height] of [[1440, 900], [768, 1024], [390, 844], [320, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `transbordo de ${overflow}px em ${width}px no tema dia`);
      const minTarget = await page.locator('[data-operacao-workspace] button')
        .evaluateAll(elements => Math.min(...elements.filter(element => element.getClientRects().length > 0).map(element => element.getBoundingClientRect().height)));
      assert.ok(minTarget >= 44, `alvos precisam ter pelo menos 44px; medido ${minTarget}px em ${width}px`);
      await capturePro(page, `operacao-${width}-dia`, { overflowDocumentoPx: overflow, menorAlvoPx: Math.round(minTarget) });

      if (width === 768) {
        await page.click('[data-admin-theme-toggle="true"]');
        await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
        await page.waitForTimeout(400);
        const nightOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(nightOverflow <= 1, `transbordo de ${nightOverflow}px no tema noite`);
        const headingContrast = await contrastPro(page, 'h1');
        assert.ok(headingContrast >= 4.5, `contraste do título no tema noite: ${headingContrast}:1`);
        await capturePro(page, 'operacao-768-noite', {
          overflowDocumentoPx: nightOverflow, contrasteTitulo: headingContrast,
        });
        await page.click('[data-admin-theme-toggle="true"]');
        await page.waitForFunction(() => document.documentElement.dataset.adminTheme !== 'night');
      }

      if (width === 390) {
        await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
        const target = page.locator('[data-testid="operacao-principal-atualizar"]');
        let reached = false;
        let firstFocus = false;
        const traversal = [];
        for (let step = 0; step < 120 && !reached; step++) {
          await page.keyboard.press('Tab');
          const label = await page.evaluate(() => {
            const element = document.activeElement;
            return element?.id || element?.getAttribute?.('aria-label') || element?.textContent?.trim().slice(0, 80) || element?.tagName?.toLowerCase() || 'desconhecido';
          });
          traversal.push(label);
          if (step === 0) {
            firstFocus = await page.evaluate(() => {
              const element = document.activeElement;
              if (!(element instanceof HTMLElement)) return false;
              const style = getComputedStyle(element);
              return style.outlineStyle !== 'none' && (parseFloat(style.outlineWidth) || 0) >= 1;
            });
          }
          reached = await target.evaluate(element => element === document.activeElement);
        }
        assert.ok(firstFocus, 'o primeiro foco por Tab precisa ser visível');
        assert.ok(reached, 'o controle de atualizar o grupo principal precisa ser alcançável por Tab');
        const outline = await target.evaluate(element => ({
          style: getComputedStyle(element).outlineStyle,
          width: parseFloat(getComputedStyle(element).outlineWidth) || 0,
        }));
        assert.ok(outline.style !== 'none' && outline.width >= 1,
          `foco do controle precisa ser visível: ${outline.style}/${outline.width}px`);
        await capturePro(page, 'operacao-390-teclado', {
          state: 'percurso_teclado', firstFocus: true, percursoTeclado: traversal,
        });
        await recordKeyboardCapture(evidenceDir, {
          stage: stagePro,
          route: '/admin/operacao',
          role: 'ti',
          viewport: '390x844',
          theme: 'day',
          file: 'operacao-390-teclado.png',
          firstFocus: true,
          percursoTeclado: traversal,
        });
        if (evidenceDir) {
          const summary = JSON.parse(await readFile(path.join(evidenceDir, 'resumo.json'), 'utf8'));
          const entry = summary.entries.find(item => path.basename(item.screenshot || item.file || '') === 'operacao-390-teclado.png');
          assert.ok(entry?.firstFocus);
          assert.ok(entry?.percursoTeclado?.length > 0);
          assert.deepEqual(entry.problems, []);
        }
      }
    }
    await context.close();
  });
});
