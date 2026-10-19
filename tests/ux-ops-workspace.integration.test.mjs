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

// ============================================================================
// UX-PRO-07D-1 — leitura honesta da superfície canônica de /admin/operacao.
//
// Casos estritamente ADITIVOS: nenhum caso herdado acima é editado, removido
// ou relaxado, e o auxiliar herdado `openOps` continua intacto. Os casos
// abaixo reaproveitam o servidor, o pool e as sessões do `before` herdado —
// mesmo PostgreSQL descartável, mesmo servidor HTTP real, mesmo Chromium.
//
// Atrasos, falhas e corpos 2xx sem a lista canônica são injetados SOMENTE em
// `window.fetch` da própria página e SOMENTE em GET de `/api/ops/*`. Nenhuma
// escrita passa pelo injetor; nenhuma API, permissão ou auditoria é alterada.
//
// O que estes casos provam (subfatia 07D-1):
//  - as 17 leituras canônicas da tela continuam exigindo sessão e respondendo
//    com a lista canônica (contrato preservado);
//  - o carregamento inicial não presume abas, vazio nem falha;
//  - corpo 2xx sem a lista canônica vira falha declarada
//    (`invalid_ops_response`) no painel inicial, na estrutura, no
//    dimensionamento, nas versões de escala e no detalhe da versão — nunca
//    lista vazia;
//  - a coluna "Necessidades" dos postos não afirma zero enquanto a leitura de
//    estrutura não foi confirmada;
//  - a falha do detalhe da versão é declarada também nas seções dependentes
//    (ciência e histórico), sem oferecer ação de ciência;
//  - a resposta atrasada de uma versão escolhida antes é descartada;
//  - 1440/768/390/320 px, tema noturno e percurso de teclado medidos; o que
//    a medição encontrar fora do recorte desta rota (estilo compartilhado) é
//    registrado em `problems` da evidência, nunca escondido.
//
// O que NÃO provam: a escrita de ciência de escala (subfatia própria), as
// abas legadas (OpsAdvanced2Client/OpsAdvanced3Client), apresentação de
// datas/horas, aceite humano ou auditoria WCAG completa.
// ============================================================================

import { readFile as readFile07d, writeFile as writeFile07d } from 'node:fs/promises';
import { recordKeyboardCapture } from '../scripts/ux-pro-00-keyboard-evidence.mjs';

const STAGE_07D = 'ux-pro-07-operacao';
const ROTA_07D = '/admin/operacao';
const evidenceDir07d = process.env.UX_OPS_07D_EVIDENCE_DIR || '';
const evidencias07d = [];
let massa07d = null;

// [nome no injetor, caminho exato usado pela tela, chave canônica da lista]
const LEITURAS_07D = [
  ['posts', '/api/ops/posts?limit=100', 'posts'],
  ['allocations', '/api/ops/allocations', 'allocations'],
  ['coverage-requests', '/api/ops/coverage-requests', 'requests'],
  ['handovers', '/api/ops/handovers', 'handovers'],
  ['occurrence-book', '/api/ops/occurrence-book', 'occurrences'],
  ['checklist-instances', '/api/ops/checklist-instances', 'instances'],
  ['work-rules', '/api/ops/work-rules', 'rules'],
  ['qualifications', '/api/ops/qualifications', 'qualifications'],
  ['validations', '/api/ops/validations?is_valid=false', 'validations'],
  ['job-roles', '/api/ops/job-roles', 'roles'],
  ['post-shift-needs', '/api/ops/post-shift-needs', 'needs'],
  ['dimensioning', '/api/ops/dimensioning', 'dimensionings'],
  ['coverage-gaps', '/api/ops/coverage-gaps', 'gaps'],
  ['schedule-versions', '/api/ops/schedule-versions', 'versions'],
  ['schedule-entries', '/api/ops/schedule-entries?version_id=:version', 'entries'],
  ['schedule-acks', '/api/ops/schedule-acks?version_id=:version', 'acknowledgments'],
  ['schedule-history', '/api/ops/schedule-history?version_id=:version', 'history'],
];

const escape07d = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const CRASH_07D = /Target (page|closed)|has been closed|Target crashed|browser has disconnected|crashed|SIGSEGV|Protocol error/i;
/** Repete somente quando o Chromium empacotado cai; asserção nunca é repetida. */
async function withBrowser07d(body) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let browser;
    try {
      browser = await launchBrowser();
      return await body(browser);
    } catch (error) {
      if (error?.code === 'ERR_ASSERTION' || !CRASH_07D.test(String(error?.message || ''))) throw error;
      lastError = error;
      console.log(`UX_OPS_07D_BROWSER_RETRY tentativa=${attempt}: ${String(error.message).split('\n')[0]}`);
    } finally {
      await browser?.close().catch(() => {});
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw lastError;
}

/**
 * Abre /admin/operacao com regras por leitura. Cada regra aceita `delay`,
 * `fail`, `failCount`, `malformed`, `status`, `code` e `versionId` (este último
 * restringe a regra ao `version_id` de uma versão de escala). Só GET de
 * `/api/ops/*` passa pelo injetor; o resto segue para o servidor real.
 */
async function openOps07d(browser, { cookie = tiCookie, width = 1440, height = 900, rules = {} } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  const separator = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(Number(process.env.UX_OPS_07D_UI_TIMEOUT || 45_000));
  page.setDefaultNavigationTimeout(90_000);
  const normalized = {};
  for (const [name, rule] of Object.entries(rules)) {
    normalized[name] = { delay: 0, fail: false, failCount: 0, malformed: false, status: 503, code: 'read_unavailable', versionId: null, ...rule };
  }
  await page.addInitScript(control => {
    const original = window.fetch.bind(window);
    const state = { rules: control.rules, calls: {}, delivered: {} };
    window.__uxOps07d = state;
    window.fetch = async (input, init) => {
      const raw = typeof input === 'string' ? input : (input?.url || '');
      const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
      let url;
      try { url = new URL(raw, window.location.origin); } catch { return original(input, init); }
      if (method !== 'GET' || !url.pathname.startsWith('/api/ops/')) return original(input, init);
      const name = url.pathname.slice('/api/ops/'.length);
      const versionId = url.searchParams.get('version_id');
      const tag = versionId ? `${name}@${versionId}` : name;
      state.calls[name] = (state.calls[name] || 0) + 1;
      state.calls[tag] = tag === name ? state.calls[name] : (state.calls[tag] || 0) + 1;
      const rule = state.rules[name];
      const applies = Boolean(rule) && (!rule.versionId || rule.versionId === versionId);
      try {
        if (applies) {
          if (rule.delay > 0) await new Promise(resolve => setTimeout(resolve, rule.delay));
          if (rule.malformed) {
            return new Response(JSON.stringify({ note: 'corpo 2xx sem a lista canônica' }), {
              status: 200, headers: { 'content-type': 'application/json' },
            });
          }
          const shouldFail = rule.fail || rule.failCount > 0;
          if (rule.failCount > 0) rule.failCount -= 1;
          if (shouldFail) {
            return new Response(JSON.stringify({ error: rule.code }), {
              status: rule.status, headers: { 'content-type': 'application/json' },
            });
          }
        }
        return await original(input, init);
      } finally {
        state.delivered[tag] = (state.delivered[tag] || 0) + 1;
      }
    };
  }, { rules: normalized });
  await page.goto(`${baseUrl}${ROTA_07D}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1, name: /Operação — controle e gestão operacional/ }).waitFor();
  return { context, page };
}

async function writeEvidence07d() {
  if (!evidenceDir07d) return;
  await mkdir(evidenceDir07d, { recursive: true });
  const entries = [...new Map(evidencias07d.map(entry => [path.basename(entry.screenshot), entry])).values()];
  await writeFile07d(path.join(evidenceDir07d, 'resumo.json'), `${JSON.stringify({
    stage: STAGE_07D,
    generatedBy: 'npm run test:ux-ops:pg (PostgreSQL descartável + HTTP real + Chromium)',
    notes: 'Massa inteiramente sintética criada pelas APIs de operação. problems resulta das medições automatizadas; não representa validação manual, homologação nem aceite humano, e não equivale a auditoria WCAG completa. A rolagem horizontal interna das tabelas é medida e registrada (tabelasComRolagemInterna), não corrigida nesta subfatia.',
    entries,
  }, null, 2)}\n`, 'utf8');
}

async function capture07d(page, name, extra = {}) {
  if (!evidenceDir07d) return;
  await mkdir(evidenceDir07d, { recursive: true });
  const file = path.join(evidenceDir07d, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const viewport = page.viewportSize();
  evidencias07d.push({
    stage: STAGE_07D,
    route: ROTA_07D,
    role: 'ti',
    viewport: `${viewport.width}x${viewport.height}`,
    theme: await page.evaluate(() => document.documentElement.dataset.adminTheme || 'day'),
    screenshot: path.relative(root, file).replaceAll('\\', '/'),
    problems: [],
    ...extra,
  });
  await writeEvidence07d();
}

async function contraste07d(page, selector) {
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

/** Transbordo do documento, menor controle e rolagem interna das tabelas. */
async function medirSuperficie07d(page, rotulo) {
  const overflowDocumentoPx = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflowDocumentoPx <= 1, `transbordo de ${overflowDocumentoPx}px em ${rotulo}`);
  const alvos = await page.locator('main [data-admin-content="true"] :is(button, [role="tab"], select, input)').evaluateAll(elements => elements
    .map(element => element.getBoundingClientRect())
    .filter(rect => rect.width > 0 && rect.height > 0)
    .map(rect => Math.round(rect.height)));
  assert.ok(alvos.length > 0, `nenhum controle medido em ${rotulo}`);
  const menorAlvoPx = Math.min(...alvos);
  assert.ok(menorAlvoPx >= 44, `controles precisam ter pelo menos 44px; medido ${menorAlvoPx}px em ${rotulo}`);
  // Links de texto em linha (trilha "Contratos · Empresas e funil") são
  // medidos à parte e só registrados: não são controles de formulário.
  const links = await page.locator('main [data-admin-content="true"] a[href]').evaluateAll(elements => elements
    .map(element => element.getBoundingClientRect())
    .filter(rect => rect.width > 0 && rect.height > 0)
    .map(rect => Math.round(rect.height)));
  // Registrado, não corrigido nesta subfatia: tabelas mais largas que a tela
  // rolam dentro do próprio contêiner; o contêiner não declara região focável.
  const tabelas = await page.locator('main [data-admin-content="true"] table').evaluateAll(tables => tables.map(table => {
    const wrapper = table.parentElement;
    const rolagemInterna = Boolean(wrapper) && wrapper.scrollWidth - wrapper.clientWidth > 1;
    return { rolagemInterna, regiaoFocavel: Boolean(wrapper) && wrapper.hasAttribute('tabindex') };
  }));
  return {
    overflowDocumentoPx,
    menorAlvoPx,
    menorLinkEmLinhaPx: links.length ? Math.min(...links) : null,
    tabelasVisiveis: tabelas.length,
    tabelasComRolagemInterna: tabelas.filter(item => item.rolagemInterna).length,
    tabelasComRolagemSemRegiaoFocavel: tabelas.filter(item => item.rolagemInterna && !item.regiaoFocavel).length,
  };
}

after(async () => {
  await writeEvidence07d().catch(() => {});
});

test('07D-1 massa sintética pelas APIs reais: duas versões de escala distintas e necessidade por turno', { skip: !RUN }, async () => {
  const sufixo = randomUUID().slice(0, 8);
  const agora = Date.now();
  const dia = offset => new Date(agora + offset * 86_400_000).toISOString().slice(0, 10);

  const criarProfissional = async letra => {
    const nome = `Vigilante 07D ${letra} ${sufixo}`;
    const resposta = await api('/api/hr/employees', {
      method: 'POST', cookie: rhCookie,
      body: { matricula: `QA-07D-${letra}-${sufixo}`, display_name: nome, cargo: 'vigilante', status: 'ativo', employment_type: 'clt' },
    });
    assert.equal(resposta.status, 201, `profissional ${letra}: ${resposta.status} ${JSON.stringify(resposta.body)}`);
    return { id: resposta.body.employee.id, name: nome };
  };
  const criarPosto = async letra => {
    const nome = `Posto 07D ${letra} ${sufixo}`;
    const resposta = await api('/api/ops/posts', { method: 'POST', cookie: tiCookie, body: { name: nome } });
    assert.equal(resposta.status, 201, `posto ${letra}: ${resposta.status} ${JSON.stringify(resposta.body)}`);
    return { id: resposta.body.post.id, name: nome };
  };
  const criarVersao = async (inicio, fim) => {
    const resposta = await api('/api/ops/schedule-versions', {
      method: 'POST', cookie: tiCookie, body: { valid_from: inicio, valid_to: fim },
    });
    assert.equal(resposta.status, 201, `versão ${inicio}: ${resposta.status} ${JSON.stringify(resposta.body)}`);
    const version = resposta.body.version;
    return {
      id: version.id,
      version: version.version,
      validity: `${String(version.valid_from).slice(0, 10)} a ${String(version.valid_to).slice(0, 10)}`,
    };
  };

  const employeeA = await criarProfissional('A');
  const employeeB = await criarProfissional('B');
  const postA = await criarPosto('A');
  const postB = await criarPosto('B');

  const turno = await api('/api/ops/shift-templates', {
    method: 'POST', cookie: tiCookie,
    body: { name: `Turno 07D ${sufixo}`, shift_type: 'diurno', start_time: '07:00', end_time: '19:00', duration_hours: 12 },
  });
  assert.equal(turno.status, 201, `turno: ${turno.status} ${JSON.stringify(turno.body)}`);
  const templateId = turno.body.template.id;

  // Uma necessidade por turno ativa no posto A: a coluna "Necessidades" do
  // posto A vale 1 quando a estrutura é lida; antes disso não vale zero.
  const necessidade = await api('/api/ops/post-shift-needs', {
    method: 'POST', cookie: tiCookie, body: { post_id: postA.id, shift_template_id: templateId, required_headcount: 2 },
  });
  assert.equal(necessidade.status, 201, `necessidade: ${necessidade.status} ${JSON.stringify(necessidade.body)}`);

  const versionA = await criarVersao(dia(30), dia(36));
  const versionB = await criarVersao(dia(60), dia(66));
  for (const [versao, posto, profissional, data] of [
    [versionA, postA, employeeA, dia(30)],
    [versionB, postB, employeeB, dia(60)],
  ]) {
    const entrada = await api('/api/ops/schedule-entries', {
      method: 'POST', cookie: tiCookie,
      body: { version_id: versao.id, post_id: posto.id, employee_id: profissional.id, shift_template_id: templateId, entry_date: data },
    });
    assert.equal(entrada.status, 201, `entrada ${versao.validity}: ${entrada.status} ${JSON.stringify(entrada.body)}`);
  }
  massa07d = { sufixo, postA, postB, employeeA, employeeB, versionA, versionB };
});

test('07D-1 contrato preservado: as 17 leituras canônicas exigem sessão e respondem com a lista canônica', { skip: !RUN }, async () => {
  assert.ok(massa07d, 'a massa sintética da 07D-1 precisa existir');
  for (const [nome, caminho, chave] of LEITURAS_07D) {
    const url = caminho.replace(':version', massa07d.versionB.id);
    const anonimo = await api(url);
    assert.equal(anonimo.status, 401, `${nome}: anônimo recusado`);
    assert.equal(anonimo.body?.error, 'unauthorized', `${nome}: código canônico da negativa preservado`);
    assert.ok(!(chave in (anonimo.body || {})), `${nome}: a negativa não vaza ${chave}`);
    const autorizado = await api(url, { cookie: tiCookie });
    assert.equal(autorizado.status, 200, `${nome}: sessão de staff continua lendo`);
    assert.ok(Array.isArray(autorizado.body?.[chave]), `${nome}: a resposta continua trazendo a lista canônica "${chave}"`);
  }
});

test('browser 07D-1: carregamento inicial não presume abas, vazio nem falha', { skip: !RUN }, async () => {
  assert.ok(massa07d, 'a massa sintética da 07D-1 precisa existir');
  await withBrowser07d(async browser => {
    const { context, page } = await openOps07d(browser, { rules: { posts: { delay: 5000 } } });
    const carregando = page.locator('main [data-admin-content="true"] [data-ui-state="loading"]').first();
    await carregando.waitFor();
    assert.match(await carregando.innerText(), /Consultando a operação/);
    assert.equal(await page.locator('[role="tablist"]').count(), 0, 'sem leitura concluída, as abas não aparecem');
    assert.equal(await page.locator('main [data-admin-content="true"] [data-ui-state="empty"]').count(), 0, 'nenhum vazio é presumido durante a leitura');
    assert.equal(await page.locator('main [data-admin-content="true"] [data-ui-state="error"]').count(), 0, 'carregando não é falha');
    await capture07d(page, 'operacao-1440-carregando', { state: 'carregando_painel_inicial' });
    await page.locator('[role="tablist"]').waitFor();
    await page.locator('section[aria-labelledby="posts-title"] table', { hasText: massa07d.postA.name }).waitFor();
    await context.close();
  });
});

test('browser 07D-1: 2xx sem a lista canônica no painel inicial é falha declarada, não vazio', { skip: !RUN }, async () => {
  assert.ok(massa07d, 'a massa sintética da 07D-1 precisa existir');
  await withBrowser07d(async browser => {
    const { context, page } = await openOps07d(browser, { rules: { posts: { malformed: true } } });
    await page.locator('main [data-admin-content="true"] [data-ui-state="error"], [role="tablist"]').first().waitFor();
    await capture07d(page, 'operacao-1440-resposta-invalida', { state: 'resposta_2xx_sem_lista_painel_inicial' });
    const falha = page.locator('main [data-admin-content="true"] [data-ui-state="error"]');
    assert.equal(await falha.count(), 1, 'corpo 2xx sem "posts" precisa virar falha declarada');
    const texto = await falha.innerText();
    assert.match(texto, /invalid_ops_response/, 'o código de diagnóstico fica disponível');
    assert.match(texto, /HTTP 200/, 'a resposta real do servidor é declarada');
    assert.match(texto, /não significa que não existam registros/i);
    assert.equal(await page.getByText('Nenhum posto cadastrado ainda').count(), 0, 'a resposta ilegível não vira "nenhum posto"');
    assert.equal(await page.locator('main [data-admin-content="true"] [data-ui-state="empty"]').count(), 0, 'nenhum vazio é presumido');
    assert.equal(await page.locator('[role="tablist"]').count(), 0, 'sem leitura completa, as abas não aparecem (mesma regra herdada da falha)');

    const leiturasAntes = await page.evaluate(() => window.__uxOps07d.calls.posts || 0);
    await page.evaluate(() => { window.__uxOps07d.rules.posts.malformed = false; });
    await falha.getByRole('button', { name: 'Tentar carregar novamente' }).click();
    await page.locator('[role="tablist"]').waitFor();
    await page.locator('section[aria-labelledby="posts-title"] table', { hasText: massa07d.postA.name }).waitFor();
    const leiturasDepois = await page.evaluate(() => window.__uxOps07d.calls.posts || 0);
    assert.ok(leiturasDepois > leiturasAntes, `a repetição relê de verdade (${leiturasAntes} → ${leiturasDepois})`);
    await context.close();
  });
});

test('browser 07D-1: 2xx sem a lista canônica em estrutura, dimensionamento e versões de escala é falha declarada em cada grupo', { skip: !RUN }, async () => {
  assert.ok(massa07d, 'a massa sintética da 07D-1 precisa existir');
  await withBrowser07d(async browser => {
    const { context, page } = await openOps07d(browser, {
      rules: { 'job-roles': { malformed: true }, 'coverage-gaps': { malformed: true }, 'schedule-versions': { malformed: true } },
    });
    await page.locator('[role="tablist"]').waitFor();

    const postos = page.locator('#ops-painel-postos');
    await postos.locator('[data-ui-state="error"], #job-roles-title').first().waitFor();
    await capture07d(page, 'operacao-1440-estrutura-resposta-invalida', { state: 'resposta_2xx_sem_lista_estrutura' });
    const falhaEstrutura = postos.locator('[data-ui-state="error"]');
    assert.equal(await falhaEstrutura.count(), 1, 'estrutura com 2xx sem "roles" precisa virar falha declarada');
    assert.match(await falhaEstrutura.innerText(), /invalid_ops_response/);
    assert.equal(await postos.getByText('Nenhum cargo ou função cadastrado').count(), 0, 'resposta ilegível não vira "nenhum cargo"');
    assert.equal(await postos.getByText('Nenhuma necessidade por turno cadastrada').count(), 0, 'resposta ilegível não vira "nenhuma necessidade"');

    await page.getByRole('tab', { name: 'Dimensionamento', exact: true }).click();
    const dimensionamento = page.locator('#ops-painel-dimensionamento');
    await dimensionamento.locator('[data-ui-state="error"], #coverage-gaps-title').first().waitFor();
    const falhaDim = dimensionamento.locator('[data-ui-state="error"]');
    assert.equal(await falhaDim.count(), 1, 'dimensionamento com 2xx sem "gaps" precisa virar falha declarada');
    assert.match(await falhaDim.innerText(), /invalid_ops_response/);
    assert.equal(await dimensionamento.getByText('Nenhuma lacuna de cobertura registrada').count(), 0, 'resposta ilegível não vira "nenhuma lacuna"');

    await page.getByRole('tab', { name: 'Escalas', exact: true }).click();
    const escalas = page.locator('#ops-painel-escalas');
    await escalas.locator('[data-ui-state="error"], #schedule-versions-title').first().waitFor();
    const falhaEscalas = escalas.locator('[data-ui-state="error"]');
    assert.equal(await falhaEscalas.count(), 1, 'versões com 2xx sem "versions" precisa virar falha declarada');
    assert.match(await falhaEscalas.innerText(), /invalid_ops_response/);
    assert.equal(await escalas.getByText('Nenhuma versão de escala registrada').count(), 0, 'resposta ilegível não vira "nenhuma versão"');
    await context.close();
  });
});

test('browser 07D-1: a coluna Necessidades não afirma zero enquanto a estrutura não foi confirmada', { skip: !RUN }, async () => {
  assert.ok(massa07d, 'a massa sintética da 07D-1 precisa existir');
  await withBrowser07d(async browser => {
    const { context, page } = await openOps07d(browser, {
      // Regra persistente: em modo de desenvolvimento o React executa o efeito
      // de carga duas vezes; uma falha "de uma vez só" ficaria só com uma delas.
      rules: { 'post-shift-needs': { delay: 8000, fail: true, status: 503, code: 'read_unavailable' } },
    });
    await page.locator('[role="tablist"]').waitFor();
    const linha = page.locator('section[aria-labelledby="posts-title"] tr', { hasText: massa07d.postA.name });
    await linha.waitFor();
    // Colunas: Posto, Tipo, Cliente, Unidade atendida, Contrato, Necessidades, Situação.
    const celula = linha.locator('td').nth(5);
    // As duas leituras da célula são capturadas antes das asserções, para que a
    // execução contra a implementação anterior registre o estado de antes.
    const durante = (await celula.innerText()).trim();
    await capture07d(page, 'operacao-1440-necessidades-aguardando', { state: 'estrutura_lendo_coluna_aguardando', celulaNecessidades: durante });
    const falhaEstrutura = page.locator('#ops-painel-postos [data-ui-state="error"]');
    await falhaEstrutura.waitFor();
    const depoisDaFalha = (await celula.innerText()).trim();
    await capture07d(page, 'operacao-1440-necessidades-nao-confirmadas', { state: 'estrutura_falhou_coluna_nao_confirmada', celulaNecessidades: depoisDaFalha });

    assert.notEqual(durante, '0', 'enquanto a estrutura é lida, a coluna não pode afirmar zero necessidades');
    assert.match(durante, /aguardando/i, 'a célula declara que aguarda a leitura da estrutura');
    assert.notEqual(depoisDaFalha, '0', 'falha da estrutura não pode virar zero necessidades');
    assert.match(depoisDaFalha, /não confirmad/i, 'a célula declara que a quantidade não foi confirmada');

    await page.evaluate(() => { Object.assign(window.__uxOps07d.rules['post-shift-needs'], { delay: 0, fail: false }); });
    await falhaEstrutura.getByRole('button', { name: 'Tentar carregar novamente' }).click();
    await page.locator('#shift-needs-title').waitFor();
    assert.equal((await celula.innerText()).trim(), '1', 'com a estrutura confirmada, a contagem real aparece');
    await context.close();
  });
});

test('browser 07D-1: falha do detalhe da versão é declarada também em ciência e histórico, sem ação de ciência', { skip: !RUN }, async () => {
  assert.ok(massa07d, 'a massa sintética da 07D-1 precisa existir');
  await withBrowser07d(async browser => {
    const { context, page } = await openOps07d(browser, {
      rules: { 'schedule-acks': { fail: true, status: 503, code: 'read_unavailable', versionId: massa07d.versionB.id } },
    });
    await page.locator('[role="tablist"]').waitFor();
    await page.getByRole('tab', { name: 'Escalas', exact: true }).click();
    await page.locator('#ops-painel-escalas tr', { hasText: massa07d.versionB.validity })
      .getByRole('button', { name: 'Ver calendário' }).click();

    const calendario = page.locator('section[aria-labelledby="schedule-calendar-title"]');
    const falha = calendario.locator('[data-ui-state="error"]');
    await falha.waitFor();
    await capture07d(page, 'operacao-1440-detalhe-falha', { state: 'detalhe_da_versao_falhou' });
    assert.match(await falha.innerText(), /HTTP 503/, 'a resposta real do servidor é declarada');
    const ciencias = page.locator('section[aria-labelledby="schedule-acks-title"]');
    const historico = page.locator('section[aria-labelledby="schedule-history-title"]');
    assert.equal(await ciencias.locator('[data-testid="operacao-ciencias-indisponiveis"]').count(), 1,
      'a seção de ciência declara que depende da leitura que falhou');
    assert.equal(await historico.locator('[data-testid="operacao-historico-indisponivel"]').count(), 1,
      'a seção de histórico declara que depende da leitura que falhou');
    assert.equal(await ciencias.getByRole('button', { name: 'Registrar ciência' }).count(), 0,
      'sem leitura da versão, nenhuma ação de ciência é oferecida');

    await page.evaluate(() => { window.__uxOps07d.rules['schedule-acks'].fail = false; });
    await falha.getByRole('button', { name: 'Tentar carregar novamente' }).click();
    await calendario.locator('table', { hasText: massa07d.postB.name }).waitFor();
    await ciencias.locator('tr', { hasText: massa07d.employeeB.name }).waitFor();
    assert.equal(await ciencias.locator('[data-testid="operacao-ciencias-indisponiveis"]').count(), 0);
    assert.equal(await historico.locator('[data-testid="operacao-historico-indisponivel"]').count(), 0);
    await context.close();
  });
});

test('browser 07D-1: 2xx sem a lista canônica no detalhe da versão é falha declarada, não calendário vazio', { skip: !RUN }, async () => {
  assert.ok(massa07d, 'a massa sintética da 07D-1 precisa existir');
  await withBrowser07d(async browser => {
    const { context, page } = await openOps07d(browser, {
      rules: { 'schedule-entries': { malformed: true, versionId: massa07d.versionB.id } },
    });
    await page.locator('[role="tablist"]').waitFor();
    await page.getByRole('tab', { name: 'Escalas', exact: true }).click();
    await page.locator('#ops-painel-escalas tr', { hasText: massa07d.versionB.validity })
      .getByRole('button', { name: 'Ver calendário' }).click();

    const calendario = page.locator('section[aria-labelledby="schedule-calendar-title"]');
    await calendario.locator('[data-ui-state="error"], [data-ui-state="empty"], table').first().waitFor();
    await capture07d(page, 'operacao-1440-detalhe-resposta-invalida', { state: 'resposta_2xx_sem_lista_detalhe' });
    const falha = calendario.locator('[data-ui-state="error"]');
    assert.equal(await falha.count(), 1, 'detalhe com 2xx sem "entries" precisa virar falha declarada');
    assert.match(await falha.innerText(), /invalid_ops_response/);
    assert.equal(await calendario.getByText('Nenhuma entrada nesta versão').count(), 0, 'resposta ilegível não vira "nenhuma entrada"');
    assert.equal(await page.locator('section[aria-labelledby="schedule-acks-title"]').getByText('Nenhum profissional com entrada nesta versão').count(), 0,
      'resposta ilegível não vira "nenhum profissional"');
    await context.close();
  });
});

test('browser 07D-1: resposta atrasada de uma versão escolhida antes é descartada', { skip: !RUN }, async () => {
  assert.ok(massa07d, 'a massa sintética da 07D-1 precisa existir');
  const { versionA, versionB, postA, postB, employeeA, employeeB } = massa07d;
  await withBrowser07d(async browser => {
    const { context, page } = await openOps07d(browser, {
      rules: {
        'schedule-entries': { delay: 3500, versionId: versionA.id },
        'schedule-acks': { delay: 3500, versionId: versionA.id },
        'schedule-history': { delay: 3500, versionId: versionA.id },
      },
    });
    await page.locator('[role="tablist"]').waitFor();
    await page.getByRole('tab', { name: 'Escalas', exact: true }).click();
    const versoes = page.locator('#ops-painel-escalas');
    await versoes.locator('tr', { hasText: versionB.validity }).waitFor();
    await versoes.locator('tr', { hasText: versionA.validity }).getByRole('button', { name: 'Ver calendário' }).click();
    await versoes.locator('tr', { hasText: versionB.validity }).getByRole('button', { name: 'Ver calendário' }).click();

    const calendario = page.locator('section[aria-labelledby="schedule-calendar-title"]');
    await calendario.locator('table', { hasText: postB.name }).waitFor();
    await page.waitForFunction(id => ['schedule-entries', 'schedule-acks', 'schedule-history']
      .every(name => (window.__uxOps07d.delivered[`${name}@${id}`] || 0) >= 1), versionA.id, { timeout: 30_000 });
    await page.waitForTimeout(800);
    await capture07d(page, 'operacao-1440-versao-superada', { state: 'resposta_atrasada_de_versao_anterior_descartada' });

    assert.match(await page.locator('#schedule-calendar-title').innerText(), new RegExp(`v${versionB.version}\\b`),
      'o título continua sendo o da versão escolhida por último');
    const textoCalendario = await calendario.innerText();
    assert.match(textoCalendario, new RegExp(escape07d(postB.name)), 'o calendário mostra a versão escolhida por último');
    assert.doesNotMatch(textoCalendario, new RegExp(escape07d(postA.name)),
      'a resposta atrasada da versão anterior não pode substituir o calendário da versão escolhida');
    const textoCiencias = await page.locator('section[aria-labelledby="schedule-acks-title"]').innerText();
    assert.match(textoCiencias, new RegExp(escape07d(employeeB.name)));
    assert.doesNotMatch(textoCiencias, new RegExp(escape07d(employeeA.name)),
      'a lista de ciência não pode receber profissionais de outra versão');
    await context.close();
  });
});

test('browser 07D-1: 1440, 768, 390 e 320 px, tema noturno e percurso de teclado medidos', { skip: !RUN }, async () => {
  assert.ok(massa07d, 'a massa sintética da 07D-1 precisa existir');
  await withBrowser07d(async browser => {
    const { context, page } = await openOps07d(browser);
    await page.locator('[role="tablist"]').waitFor();
    await page.locator('section[aria-labelledby="posts-title"] table', { hasText: massa07d.postA.name }).waitFor();
    await page.locator('#shift-needs-title').waitFor();

    for (const [width, height] of [[1440, 900], [768, 1024], [390, 844], [320, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(500);
      const medidas = await medirSuperficie07d(page, `${width}px no tema dia`);
      const extra = { ...medidas };
      if (width === 1440) {
        for (const [nome, seletor] of [
          ['contrasteTitulo', 'h1'],
          ['contrasteTabela', 'section[aria-labelledby="posts-title"] td'],
          ['contrasteAbaAtiva', '[role="tab"][aria-selected="true"]'],
          ['contrasteAbaInativa', '[role="tab"][aria-selected="false"]'],
        ]) {
          extra[nome] = await contraste07d(page, seletor);
          assert.ok(extra[nome] >= 4.5, `${nome} no tema dia: ${extra[nome]}:1`);
        }
      }
      await capture07d(page, `operacao-${width}-dia`, extra);

      if (width === 768) {
        await page.click('[data-admin-theme-toggle="true"]');
        await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
        await page.waitForTimeout(400);
        const noite = await medirSuperficie07d(page, '768px no tema noite');
        for (const [nome, seletor] of [
          ['contrasteTitulo', 'h1'],
          ['contrasteTabela', 'section[aria-labelledby="posts-title"] td'],
          ['contrasteAbaInativa', '[role="tab"][aria-selected="false"]'],
        ]) {
          noite[nome] = await contraste07d(page, seletor);
          assert.ok(noite[nome] >= 4.5, `${nome} no tema noite: ${noite[nome]}:1`);
        }
        // A aba ativa usa `.tabActive` do estilo COMPARTILHADO
        // (src/components/ui/UiWorkspace.module.css: texto #fff sobre
        // --ux-color-brand, que no tema noite vale #92bdf2). Corrigir ali muda
        // cerca de vinte rotas; fica fora do recorte desta rota. A medição é
        // registrada como problema na evidência — nunca escondida.
        noite.contrasteAbaAtiva = await contraste07d(page, '[role="tab"][aria-selected="true"]');
        const problemasNoite = noite.contrasteAbaAtiva < 4.5
          ? [`contraste da aba ativa no tema noite ${noite.contrasteAbaAtiva}:1 (abaixo de 4.5:1): estilo compartilhado .tabActive em src/components/ui/UiWorkspace.module.css (texto #fff sobre --ux-color-brand noturno #92bdf2); fora do recorte da rota, registrado para decisão transversal`]
          : [];
        await capture07d(page, 'operacao-768-noite', { ...noite, problems: problemasNoite });
        if (evidenceDir07d && problemasNoite.length) {
          const summary = JSON.parse(await readFile07d(path.join(evidenceDir07d, 'resumo.json'), 'utf8'));
          const entry = summary.entries.find(item => path.basename(item.screenshot || '') === 'operacao-768-noite.png');
          assert.deepEqual(entry?.problems, problemasNoite, 'o problema medido fica registrado na evidência');
        }
        await page.click('[data-admin-theme-toggle="true"]');
        await page.waitForFunction(() => document.documentElement.dataset.adminTheme !== 'night');
        await page.waitForTimeout(300);
      }

      if (width === 390) {
        // Recarrega para que o percurso comece do início do documento, e não
        // do último controle clicado (o seletor de tema, logo acima).
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('[role="tablist"]').waitFor();
        await page.locator('#shift-needs-title').waitFor();
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
        await capture07d(page, 'operacao-390-teclado', { state: 'percurso_teclado', firstFocus: true, percursoTeclado: percurso, ...medidas });
        await recordKeyboardCapture(evidenceDir07d, {
          stage: STAGE_07D,
          route: ROTA_07D,
          role: 'ti',
          viewport: '390x844',
          theme: 'day',
          file: 'operacao-390-teclado.png',
          firstFocus: true,
          percursoTeclado: percurso,
        });
        // As setas continuam movendo foco e seleção juntos (contrato herdado).
        await page.keyboard.press('ArrowRight');
        const segunda = page.getByRole('tab', { name: 'Jornada e habilitação', exact: true });
        assert.equal(await segunda.getAttribute('aria-selected'), 'true');
        assert.ok(await segunda.evaluate(element => element === document.activeElement), 'a seta move o foco junto com a seleção');
        await page.keyboard.press('ArrowLeft');
        assert.equal(await abaAtiva.first().evaluate(element => element.textContent?.trim()), 'Postos e alocações');
        await page.locator('#shift-needs-title').waitFor();
        if (evidenceDir07d) {
          const summary = JSON.parse(await readFile07d(path.join(evidenceDir07d, 'resumo.json'), 'utf8'));
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

// UX-PRO-07D-2 — adição pura aos 19 casos herdados (inclusive 07D-1).
// Massa por API real. Injeção exclusivamente em window.fetch, nunca no servidor.
const evidenceDir07d2 = process.env.UX_OPS_07D2_EVIDENCE_DIR || '';
let fixtureSequence07d2 = 0;
async function fixture07d2() {
  const suffix = randomUUID().slice(0, 8);
  const day = new Date(Date.now() + (200 + fixtureSequence07d2++) * 86_400_000).toISOString().slice(0, 10);
  const employee = await api('/api/hr/employees', { method: 'POST', cookie: rhCookie,
    body: { matricula: `07D2-${suffix}`, display_name: `Profissional 07D2 ${suffix}`, cargo: 'vigilante', status: 'ativo', employment_type: 'clt' } });
  assert.equal(employee.status, 201);
  const version = await api('/api/ops/schedule-versions', { method: 'POST', cookie: tiCookie,
    body: { valid_from: day, valid_to: day, status: 'revisada' } });
  assert.equal(version.status, 201);
  const entry = await api('/api/ops/schedule-entries', { method: 'POST', cookie: tiCookie,
    body: { version_id: version.body.version.id, post_id: postId, employee_id: employee.body.employee.id, shift_template_id: shiftTemplateId, entry_date: day } });
  assert.equal(entry.status, 201);
  return { version: version.body.version, employee: employee.body.employee };
}
async function capture07d2(page, name) {
  if (!evidenceDir07d2) return;
  await mkdir(evidenceDir07d2, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir07d2, `${name}.png`), fullPage: true });
}
async function openAck07d2(browser, fixture, width = 1440) {
  const opened = await openOps(browser, tiCookie, { width });
  const { page } = opened;
  await page.getByRole('tab', { name: 'Escalas', exact: true }).click();
  await page.getByRole('row').filter({ has: page.getByRole('cell', { name: `v${fixture.version.version}`, exact: true }) })
    .getByRole('button', { name: 'Ver calendário', exact: true }).click();
  const section = page.locator('section[aria-labelledby="schedule-acks-title"]');
  await section.getByRole('button', { name: 'Registrar ciência', exact: true }).waitFor();
  await page.evaluate(firstVersionId => {
    const original = window.fetch.bind(window);
    const state = { posts: [], gets: 0, returned: 0, holdPost: false, holdGet: false, failGet: false, malformed: false, denied: false, loseResponse: false, releasePost: null, releaseGet: null };
    const postBarrier = new Promise(resolve => { state.releasePost = resolve; });
    const getBarrier = new Promise(resolve => { state.releaseGet = resolve; });
    window.__ack07d2 = state;
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      const method = String(init?.method || 'GET').toUpperCase();
      if (url.pathname !== '/api/ops/schedule-acks') return original(input, init);
      if (method === 'POST') {
        state.posts.push({ method, url: url.pathname, body: JSON.parse(init.body), headers: init.headers });
        const response = await original(input, init); // escrita e auditoria REAIS
        if (state.holdPost) await postBarrier;
        state.returned++;
        if (state.loseResponse) throw new TypeError('Resposta perdida depois do POST real');
        return response;
      }
      state.gets++;
      const response = await original(input, init);
      if (state.holdGet && url.searchParams.get('version_id') === firstVersionId) await getBarrier;
      if (state.failGet || state.denied) return new Response(JSON.stringify({ error: state.denied ? 'forbidden' : 'internal' }), {
        status: state.denied ? 403 : 503, headers: { 'content-type': 'application/json' },
      });
      if (state.malformed) return new Response(JSON.stringify({ note: 'sem lista canônica' }), { status: 200, headers: { 'content-type': 'application/json' } });
      return response;
    };
  }, fixture.version.id);
  return { ...opened, section, button: section.getByRole('button', { name: 'Registrar ciência', exact: true }) };
}
async function waitAckRead07d2(page) {
  await page.waitForFunction(() => window.__ack07d2.gets >= 1);
  await page.waitForTimeout(250);
}

test('07D-2 envio pendente bloqueia duplo clique sem mudar o contrato POST', { skip: !RUN }, async () => {
  const fixture = await fixture07d2();
  const browser = await launchBrowser();
  try {
    const { context, page, section, button } = await openAck07d2(browser, fixture);
    await page.evaluate(() => { window.__ack07d2.holdPost = true; });
    await button.click();
    await page.waitForFunction(() => window.__ack07d2.posts.length === 1);
    // O mesmo elemento é acionado também antes de novo render: a guarda síncrona é necessária.
    await section.locator('button').first().evaluate(el => { el.click(); el.click(); });
    await capture07d2(page, 'envio-pendente');
    const posts = await page.evaluate(() => window.__ack07d2.posts);
    assert.equal(posts.length, 1, 'um único POST durante o envio');
    assert.deepEqual(posts[0].body, { version_id: fixture.version.id, employee_id: fixture.employee.id });
    assert.equal(posts[0].url, '/api/ops/schedule-acks');
    assert.equal(posts[0].headers['Idempotency-Key'], undefined, 'não inventar chave que o contrato não possui');
    assert.equal(await section.locator('button').first().isDisabled(), true);
    assert.match(await section.innerText(), /Registrando ciência/);
    await page.evaluate(() => window.__ack07d2.releasePost());
    await waitAckRead07d2(page);
    await section.getByText(/Ciência registrada para/).waitFor();
    const read = await api(`/api/ops/schedule-acks?version_id=${fixture.version.id}`, { cookie: tiCookie });
    assert.equal(read.body.acknowledgments.length, 1);
    await context.close();
  } finally { await browser.close(); }
});

test('07D-2 POST confirmado + GET 503 permite repetir somente a consulta; duplicate_ack continua sucesso idempotente', { skip: !RUN }, async () => {
  const fixture = await fixture07d2();
  const browser = await launchBrowser();
  try {
    const { context, page, section, button } = await openAck07d2(browser, fixture);
    await page.evaluate(() => { window.__ack07d2.failGet = true; });
    await button.click();
    await waitAckRead07d2(page);
    await capture07d2(page, 'post-confirmado-leitura-falhou');
    assert.match(await section.innerText(), /Ciência registrada para/);
    assert.equal(await section.getByRole('button', { name: 'Consultar ciências novamente', exact: true }).count(), 1);
    assert.equal(await section.getByRole('button', { name: 'Registrar ciência', exact: true }).isDisabled(), true,
      'sem reconciliar, não oferecer novo envio');
    await page.evaluate(() => { window.__ack07d2.failGet = false; });
    await section.getByRole('button', { name: 'Consultar ciências novamente', exact: true }).click();
    await section.getByText(/Ciente desde/).waitFor();
    assert.equal(await page.evaluate(() => window.__ack07d2.posts.length), 1, 'retry é só GET');
    await section.getByRole('button', { name: 'Registrar ciência', exact: true }).click();
    await section.getByText(/já registrada.*não duplica efeito/).waitFor();
    assert.equal(await page.evaluate(() => window.__ack07d2.posts.length), 2, 'segunda ciência somente por decisão explícita');
    const read = await api(`/api/ops/schedule-acks?version_id=${fixture.version.id}`, { cookie: tiCookie });
    assert.equal(read.body.acknowledgments.length, 1);
    await capture07d2(page, 'reconciliado-duplicate-ack');
    await context.close();
  } finally { await browser.close(); }
});

test('07D-2 GET 2xx sem lista não apaga ciência conhecida nem simula pendência', { skip: !RUN }, async () => {
  const fixture = await fixture07d2();
  const seed = await api('/api/ops/schedule-acks', { method: 'POST', cookie: tiCookie,
    body: { version_id: fixture.version.id, employee_id: fixture.employee.id } });
  assert.equal(seed.status, 201);
  const browser = await launchBrowser();
  try {
    const { context, page, section, button } = await openAck07d2(browser, fixture);
    await page.evaluate(() => { window.__ack07d2.malformed = true; });
    await button.click();
    await waitAckRead07d2(page);
    await capture07d2(page, 'releitura-corpo-invalido');
    assert.match(await section.innerText(), /invalid_ops_response/);
    assert.match(await section.innerText(), /Ciente desde/);
    assert.doesNotMatch(await section.innerText(), /\bPendente\b/);
    await context.close();
  } finally { await browser.close(); }
});

for (const phase of ['Post', 'Get']) {
  test(`07D-2 resultado atrasado de ${phase} não contamina outra seleção`, { skip: !RUN }, async () => {
    const fixture = await fixture07d2();
    const fixtureB = await fixture07d2();
    const b = fixtureB.version;
    const ackB = await api('/api/ops/schedule-acks', { method: 'POST', cookie: tiCookie,
      body: { version_id: b.id, employee_id: fixtureB.employee.id } });
    assert.equal(ackB.status, 201);
    const browser = await launchBrowser();
    try {
      const { context, page, section, button } = await openAck07d2(browser, fixture);
      await page.evaluate(phase => { window.__ack07d2[`hold${phase}`] = true; }, phase);
      await button.click();
      await page.waitForFunction(phase => phase === 'Post' ? window.__ack07d2.posts.length === 1 : window.__ack07d2.gets >= 1, phase);
      await page.getByRole('row').filter({ has: page.getByRole('cell', { name: `v${b.version}`, exact: true }) })
        .getByRole('button', { name: 'Ver calendário', exact: true }).click();
      await section.getByText(fixtureB.employee.display_name, { exact: true }).waitFor();
      await section.getByText(/Ciente desde/).waitFor();
      await page.evaluate(phase => window.__ack07d2[`release${phase}`](), phase);
      await page.waitForFunction(() => window.__ack07d2.returned >= 1);
      await page.waitForTimeout(300);
      await capture07d2(page, `resposta-${phase.toLowerCase()}-superada`);
      assert.doesNotMatch(await section.innerText(), /Ciência registrada para|Ciência já registrada/);
      assert.doesNotMatch(await section.innerText(), new RegExp(fixture.employee.display_name));
      assert.equal(await section.getByText('Pendente', { exact: true }).count(), 0, 'a leitura atrasada de A não pode apagar a ciência já conhecida de B');
      assert.match(await section.innerText(), /Ciente desde/);
      await context.close();
    } finally { await browser.close(); }
  });
}

test('07D-2 resposta POST perdida não é sucesso presumido e não causa reenvio automático', { skip: !RUN }, async () => {
  const fixture = await fixture07d2();
  const browser = await launchBrowser();
  try {
    const { context, page, section, button } = await openAck07d2(browser, fixture);
    await page.evaluate(() => { window.__ack07d2.loseResponse = true; });
    await button.click();
    await waitAckRead07d2(page);
    await capture07d2(page, 'resposta-post-perdida');
    assert.match(await section.innerText(), /Não foi possível confirmar o registro/);
    assert.doesNotMatch(await section.innerText(), /Ciência registrada para/);
    await section.getByText(/Ciente desde/).waitFor(); // GET confirma dado real, não o resultado do POST perdido.
    assert.equal(await page.evaluate(() => window.__ack07d2.posts.length), 1);
    const read = await api(`/api/ops/schedule-acks?version_id=${fixture.version.id}`, { cookie: tiCookie });
    assert.equal(read.body.acknowledgments.length, 1);
    await context.close();
  } finally { await browser.close(); }
});

test('07D-2 negativa 403 na reconciliação fecha ações sem simular ausência de ciência', { skip: !RUN }, async () => {
  const fixture = await fixture07d2();
  const browser = await launchBrowser();
  try {
    const { context, page, section, button } = await openAck07d2(browser, fixture);
    await page.evaluate(() => { window.__ack07d2.denied = true; });
    await button.click();
    await waitAckRead07d2(page);
    await capture07d2(page, 'reconciliacao-negada');
    assert.equal(await section.getByRole('button', { name: 'Registrar ciência', exact: true }).count(), 0);
    assert.equal(await section.getByText('Pendente', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Consultar ciências novamente', exact: true }).count(), 0);
    assert.match(await page.locator('#ops-painel-escalas').innerText(), /HTTP 403|forbidden/);
    await context.close();
  } finally { await browser.close(); }
});

test('07D-2 envio com teclado em 320/390/768/1440 e tema noite sem transbordo', { skip: !RUN }, async () => {
  const fixture = await fixture07d2();
  for (const width of [320, 390, 768, 1440]) {
    const browser = await launchBrowser();
    try {
      const { context, page, section, button } = await openAck07d2(browser, fixture, width);
      // Percurso medido entre os controles da lista de ciência, sem alterar layout.
      await button.focus();
      assert.equal(await button.evaluate(el => el === document.activeElement), true);
      await page.evaluate(() => { window.__ack07d2.holdPost = true; });
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__ack07d2.posts.length === 1);
      await capture07d2(page, `envio-${width}-dia`);
      assert.match(await section.innerText(), /Registrando ciência/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1);
      await page.locator('[data-admin-theme-toggle="true"]').click();
      await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
      await capture07d2(page, `envio-${width}-noite`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1);
      await page.evaluate(() => window.__ack07d2.releasePost());
      await waitAckRead07d2(page);
      await context.close();
    } finally { await browser.close(); }
  }
});

// ============================================================================
// UX-PRO-E3 — carimbos `TIMESTAMPTZ` de /admin/operacao.
//
// Caso ADITIVO: nenhum caso herdado (UX-07, 07D-1 ou 07D-2) é editado,
// removido ou relaxado. A massa é criada pelas próprias APIs de operação e as
// respostas que este caso precisa datar são reescritas SOMENTE em
// `window.fetch` da própria página — servidor, banco, permissões e auditoria
// continuam intactos.
//
// O que este caso prova (decisão do proprietário em 19/10/2026, via (a)):
//  - as sete linhas de carimbo saem no fuso America/Sao_Paulo, com o fuso
//    DECLARADO no próprio texto;
//  - o instante ISO original continua visível como texto secundário;
//  - duas marcas distintas do mesmo dia (14:32Z e 17:32Z) NÃO colidem: uma
//    sai 11:32 e a outra 14:32, e o texto ISO antigo (`2026-10-05 14:32`) some.
//
// O que NÃO prova: aceite humano, leitor de tela, homologação, produção ou
// conversão de datas de calendário (`DATE`), que ficam fora desta fatia.
// ============================================================================
const E3_STAMP_A = '2026-10-05T14:32:00Z';   // 11:32 em America/Sao_Paulo
const E3_STAMP_B = '2026-10-05T17:32:00Z';   // 14:32 em America/Sao_Paulo
const E3_LOCAL_A = '05/10/2026 11:32 (America/Sao_Paulo)';
const E3_LOCAL_B = '05/10/2026 14:32 (America/Sao_Paulo)';

async function fixtureE3(suffix) {
  const employee = await api('/api/hr/employees', {
    method: 'POST', cookie: rhCookie,
    body: { matricula: `QA-E3-${suffix}`, display_name: `Profissional E3 ${suffix}`, cargo: 'vigilante', status: 'ativo', employment_type: 'clt' },
  });
  assert.equal(employee.status, 201, `funcionário E3: ${employee.status} ${JSON.stringify(employee.body)}`);
  const post = await api('/api/ops/posts', { method: 'POST', cookie: tiCookie, body: { name: `Posto E3 ${suffix}` } });
  assert.equal(post.status, 201);
  const turno = await api('/api/ops/shift-templates', {
    method: 'POST', cookie: tiCookie,
    body: { name: `Turno E3 ${suffix}`, shift_type: 'diurno', start_time: '07:00', end_time: '19:00', duration_hours: 12 },
  });
  assert.equal(turno.status, 201);
  const version = await api('/api/ops/schedule-versions', {
    method: 'POST', cookie: tiCookie, body: { valid_from: '2037-06-01', valid_to: '2037-06-03', status: 'revisada' },
  });
  assert.equal(version.status, 201, `versão E3: ${version.status} ${JSON.stringify(version.body)}`);
  const entry = await api('/api/ops/schedule-entries', {
    method: 'POST', cookie: tiCookie,
    body: {
      version_id: version.body.version.id, post_id: post.body.post.id,
      employee_id: employee.body.employee.id, shift_template_id: turno.body.template.id,
      entry_date: '2037-06-01',
    },
  });
  assert.equal(entry.status, 201, `entrada E3: ${entry.status} ${JSON.stringify(entry.body)}`);
  return { version: version.body.version, employee: employee.body.employee };
}

/** Abre /admin/operacao com as respostas datadas reescritas em `window.fetch`. */
async function openOpsE3(browser, { versionId, employeeId }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  const separator = tiCookie.indexOf('=');
  await context.addCookies([{ name: tiCookie.slice(0, separator), value: tiCookie.slice(separator + 1), url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(90_000);
  await page.addInitScript(({ stampA, stampB, ackVersionId, ackEmployeeId }) => {
    const original = window.fetch.bind(window);
    const state = { rewrites: {} };
    window.__e3 = state;
    const respond = body => new Response(JSON.stringify(body), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
    window.fetch = async (input, init) => {
      const raw = typeof input === 'string' ? input : (input?.url || '');
      const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
      let url;
      try { url = new URL(raw, location.origin); } catch { return original(input, init); }
      if (method !== 'GET' || !url.pathname.startsWith('/api/ops/')) return original(input, init);
      const name = url.pathname.slice('/api/ops/'.length);
      const response = await original(input, init);
      if (!response.ok) return response;
      const data = await response.clone().json().catch(() => null);
      if (!data || typeof data !== 'object') return response;
      state.rewrites[name] = (state.rewrites[name] || 0) + 1;
      if (name === 'coverage-gaps') {
        return respond({ ...data, gaps: [{
          id: 'e3-gap', post_name: 'Posto E3', gap_date: '2026-10-05',
          gap_start: stampA, gap_end: stampB, uncovered_minutes: 180,
          reason: 'massa E3', status: 'aberto',
        }] });
      }
      if (name === 'validations') {
        return respond({ ...data, validations: [{
          id: 'e3-validation', validation_type: 'conflito', is_valid: false,
          validated_at: stampB, conflict_details: { error: 'massa E3' },
        }] });
      }
      if (name === 'handovers') {
        return respond({ ...data, handovers: [{
          id: 'e3-handover', protocol: 'HND-OPS-E3', handover_date: stampA,
          status: 'aceito', pending_tasks: null,
        }] });
      }
      if (name === 'checklist-instances') {
        return respond({ ...data, instances: [{
          id: 'e3-checklist', scheduled_date: '2026-10-05', status: 'concluido', executed_at: stampB,
        }] });
      }
      if (name === 'schedule-versions') {
        return respond({ ...data, versions: (data.versions || []).map(item => ({ ...item, published_at: stampA })) });
      }
      if (name === 'schedule-acks' && url.searchParams.get('version_id') === ackVersionId) {
        return respond({ ...data, acknowledgments: [{
          id: 'e3-ack', version_id: ackVersionId, employee_id: ackEmployeeId,
          employee_name: 'Profissional E3', acknowledged_at: stampB,
        }] });
      }
      if (name === 'schedule-history' && url.searchParams.get('version_id') === ackVersionId) {
        return respond({ ...data, history: [{
          id: 'e3-history', version_id: ackVersionId, previous_status: 'revisada',
          next_status: 'publicada', changed_by: 'qa', reason: 'massa E3', created_at: stampA,
        }] });
      }
      return response;
    };
  }, { stampA: E3_STAMP_A, stampB: E3_STAMP_B, ackVersionId: versionId, ackEmployeeId: employeeId });
  await page.goto(`${baseUrl}/admin/operacao`, { waitUntil: 'domcontentloaded' });
  await page.locator('[role="tablist"]').waitFor();
  return { context, page };
}

test('E3 browser: carimbos timestamptz saem em São Paulo com o fuso declarado e o ISO preservado, sem colidir', { skip: !RUN }, async () => {
  const fixture = await fixtureE3(randomUUID().slice(0, 8));
  const browser = await launchBrowser();
  try {
    const { context, page } = await openOpsE3(browser, {
      versionId: fixture.version.id, employeeId: fixture.employee.id,
    });

    // 1) gap_start/gap_end (linha 1140): duas marcas distintas do mesmo dia.
    await page.getByRole('tab', { name: 'Dimensionamento', exact: true }).click();
    const lacunas = page.locator('section[aria-labelledby="coverage-gaps-title"]');
    await lacunas.locator('table').waitFor();
    const janela = (await lacunas.locator('tbody tr').first().locator('td').nth(2).innerText()).trim();
    assert.match(janela, new RegExp(escape07d(E3_LOCAL_A)),
      `gap_start precisa sair em São Paulo com o fuso declarado; recebido: ${JSON.stringify(janela)}`);
    assert.match(janela, new RegExp(escape07d(E3_LOCAL_B)),
      `gap_end precisa sair em São Paulo com o fuso declarado; recebido: ${JSON.stringify(janela)}`);
    assert.ok(janela.includes(E3_STAMP_A) && janela.includes(E3_STAMP_B),
      `o instante ISO de cada marca precisa continuar visível; recebido: ${JSON.stringify(janela)}`);
    assert.doesNotMatch(janela, /2026-10-05 14:32/,
      `o texto anterior (ISO fatiado sem fuso) não pode permanecer; recebido: ${JSON.stringify(janela)}`);
    const marcas = janela.match(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2} \(America\/Sao_Paulo\)/g) || [];
    assert.equal(new Set(marcas).size, 2,
      `as duas marcas distintas do mesmo dia precisam permanecer distintas no texto exibido; recebido: ${JSON.stringify(janela)}`);

    // 2) validated_at (linha 1014).
    await page.getByRole('tab', { name: 'Jornada e habilitação', exact: true }).click();
    const bloqueios = page.locator('section[aria-labelledby="validations-title"]');
    await bloqueios.locator('table').waitFor();
    const quando = (await bloqueios.locator('tbody tr').first().locator('td').first().innerText()).trim();
    assert.match(quando, new RegExp(escape07d(E3_LOCAL_B)),
      `validated_at precisa sair em São Paulo com o fuso declarado; recebido: ${JSON.stringify(quando)}`);
    assert.ok(quando.includes(E3_STAMP_B), `o ISO de validated_at precisa continuar visível; recebido: ${JSON.stringify(quando)}`);
    assert.doesNotMatch(quando, /2026-10-05 17:32/, `o ISO fatiado não pode permanecer; recebido: ${JSON.stringify(quando)}`);

    // 3) handover_date (linha 1513).
    await page.getByRole('tab', { name: 'Passagem de turno', exact: true }).click();
    const passagem = page.locator('section[aria-labelledby="handover-title"]');
    await passagem.locator('table').waitFor();
    const dataHora = (await passagem.locator('tbody tr').first().locator('td').nth(1).innerText()).trim();
    assert.match(dataHora, new RegExp(escape07d(E3_LOCAL_A)),
      `handover_date precisa sair em São Paulo com o fuso declarado; recebido: ${JSON.stringify(dataHora)}`);
    assert.ok(dataHora.includes(E3_STAMP_A), `o ISO de handover_date precisa continuar visível; recebido: ${JSON.stringify(dataHora)}`);

    // 4) executed_at (linha 1583).
    await page.getByRole('tab', { name: 'Checklists de posto', exact: true }).click();
    const checklists = page.locator('section[aria-labelledby="checklist-title"]');
    await checklists.locator('table').waitFor();
    const execucao = (await checklists.locator('tbody tr').first().locator('td').nth(2).innerText()).trim();
    assert.match(execucao, new RegExp(escape07d(E3_LOCAL_B)),
      `executed_at precisa sair em São Paulo com o fuso declarado; recebido: ${JSON.stringify(execucao)}`);
    assert.ok(execucao.includes(E3_STAMP_B), `o ISO de executed_at precisa continuar visível; recebido: ${JSON.stringify(execucao)}`);

    // 5) published_at (linha 1209), acknowledged_at (linha 1374) e created_at (linha 1432).
    await page.getByRole('tab', { name: 'Escalas', exact: true }).click();
    const versoes = page.locator('section[aria-labelledby="schedule-versions-title"]');
    await versoes.locator('table').waitFor();
    const linha = versoes.locator('tbody tr', { hasText: '2037-06-01' });
    const publicada = (await linha.locator('td').nth(5).innerText()).trim();
    assert.match(publicada, new RegExp(escape07d(E3_LOCAL_A)),
      `published_at precisa sair em São Paulo com o fuso declarado; recebido: ${JSON.stringify(publicada)}`);
    assert.ok(publicada.includes(E3_STAMP_A), `o ISO de published_at precisa continuar visível; recebido: ${JSON.stringify(publicada)}`);
    assert.doesNotMatch(publicada, /2026-10-05 14:32/, `o ISO fatiado não pode permanecer; recebido: ${JSON.stringify(publicada)}`);

    await linha.getByRole('button', { name: 'Ver calendário', exact: true }).click();
    const calendario = page.locator('section[aria-labelledby="schedule-calendar-title"]');
    await calendario.locator('table').waitFor();
    const ciencias = page.locator('section[aria-labelledby="schedule-acks-title"]');
    await ciencias.locator('table').waitFor();
    const ciente = (await ciencias.locator('tbody tr').first().locator('td').nth(1).innerText()).trim();
    assert.match(ciente, new RegExp(`Ciente desde ${escape07d(E3_LOCAL_B)}`),
      `acknowledged_at precisa sair em São Paulo com o fuso declarado, preservando "Ciente desde"; recebido: ${JSON.stringify(ciente)}`);
    assert.ok(ciente.includes(E3_STAMP_B), `o ISO de acknowledged_at precisa continuar visível; recebido: ${JSON.stringify(ciente)}`);
    const historico = page.locator('section[aria-labelledby="schedule-history-title"]');
    const criada = (await historico.locator('tbody tr').first().locator('td').first().innerText()).trim();
    assert.match(criada, new RegExp(escape07d(E3_LOCAL_A)),
      `created_at do histórico precisa sair em São Paulo com o fuso declarado; recebido: ${JSON.stringify(criada)}`);
    assert.ok(criada.includes(E3_STAMP_A), `o ISO de created_at precisa continuar visível; recebido: ${JSON.stringify(criada)}`);

    // 6) Nenhum carimbo antigo sobrou em todo o documento.
    const corpo = await page.textContent('body');
    assert.doesNotMatch(corpo || '', /2026-10-05 14:32|2026-10-05 17:32/,
      'nenhum carimbo pode continuar no formato ISO fatiado sem fuso');

    await context.close();
  } finally { await browser.close(); }
});
