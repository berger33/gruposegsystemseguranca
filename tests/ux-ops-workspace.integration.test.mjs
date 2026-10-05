// UX-07A — gate da família de operação (L06), por HTTP real contra PostgreSQL
// real (executado por scripts/qa-ux-ops-postgres.mjs, que sobe um cluster
// descartável) e por Chromium real.
//
// O que este gate prova:
//  - o contrato de acesso da operação continua intacto: 401 sem sessão e 403
//    para quem passa pelo menu mas não tem a concessão de escrita;
//  - o defeito central desta fatia: uma FALHA de leitura não vira painel
//    vazio, e 403 (negado) não se confunde com 503 (indisponível);
//  - as abas são um `tablist` de verdade, com `tabpanel`, roving tabindex e
//    ←/→/Home/End;
//  - vazio é dito como vazio, declarando que a leitura foi concluída;
//  - 390px não produz transbordo horizontal.
//
// O que este gate NÃO prova: aceite humano, homologação de Marcelo/Andreia,
// comportamento em Windows ou na máquina do operador.
//
// O servidor NUNCA é enfraquecido: a falha é injetada apenas em `window.fetch`,
// dentro da página (`page.route()` é instável com este Chromium empacotado).

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
let tiCookie, supervisorCookie;

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
  return res.setCookie.map(item => item.split(';')[0]).join('; ');
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
 * Abre `/admin/operacao` com a sessão informada. `fail` derruba, dentro da
 * própria página, apenas as respostas de `/api/ops/` — a sessão administrativa
 * continua sendo decidida pelo servidor de verdade.
 */
async function openOperacao(browser, cookie, { width = 1440, height = 900, fail = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  await context.addCookies(cookie.split('; ').filter(Boolean).map(item => {
    const separator = item.indexOf('=');
    return { name: item.slice(0, separator), value: item.slice(separator + 1), url: baseUrl };
  }));
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(90_000);
  if (fail) {
    await page.addInitScript(({ failStatus, failCode }) => {
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        if (url.includes('/api/ops/')) {
          return new Response(JSON.stringify({ error: failCode }), {
            status: failStatus, headers: { 'content-type': 'application/json' },
          });
        }
        return original(input, init);
      };
    }, { failStatus: fail.status, failCode: fail.code });
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
  tiCookie = await loginStaffHttp(ti.email);
  // Supervisor passa pelo AdminGate de `/admin/operacao`, mas NÃO tem a
  // concessão de escrita das rotas de operação. Essa diferença é o caso
  // "menu não é autorização" que o gate precisa provar.
  const supervisor = await provisionStaff(pool, { role: 'supervisor' });
  supervisorCookie = await loginStaffHttp(supervisor.email);

  const deadline = Date.now() + 240_000;
  for (;;) {
    try {
      const res = await fetch(`${baseUrl}/admin/operacao`, { redirect: 'manual' });
      if (res.status !== 404) break;
    } catch { /* ainda compilando */ }
    if (Date.now() > deadline) throw new Error('page_compile_timeout_operacao');
    await new Promise(r => setTimeout(r, 500));
  }
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) { server.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); server.kill('SIGKILL'); }
});

test('o contrato de acesso da operação não mudou: 401 sem sessão', { skip: !RUN }, async () => {
  for (const rota of ['/api/ops/posts', '/api/ops/allocations', '/api/ops/schedule-versions', '/api/ops/work-rules']) {
    const anonima = await api(rota);
    assert.equal(anonima.status, 401, `${rota} precisa exigir sessão, veio ${anonima.status}`);
    assert.equal(anonima.body.error, 'unauthorized');
    assert.ok(!('posts' in (anonima.body || {})) && !('allocations' in (anonima.body || {})),
      'a negativa não pode vazar dado algum');
  }
});

test('menu não é autorização: supervisor abre a tela, mas a escrita continua recusada', { skip: !RUN }, async () => {
  const leitura = await api('/api/ops/posts?limit=5', { cookie: supervisorCookie });
  assert.equal(leitura.status, 200, 'a leitura de operação é concedida ao supervisor');

  const escrita = await api('/api/ops/job-roles', {
    method: 'POST', cookie: supervisorCookie,
    body: { name: `QA UX07A ${randomUUID().slice(0, 8)}`, role_type: 'cargo' },
  });
  assert.equal(escrita.status, 403, `a escrita precisa continuar recusada, veio ${escrita.status}`);
  assert.equal(escrita.body.error, 'forbidden');
  assert.ok(!escrita.body.role, 'a recusa não pode devolver registro criado');

  // E a tela não amplia acesso: segue montando para o supervisor, sem esconder
  // que a concessão de escrita é verificada no servidor.
  const pagina = await fetch(`${baseUrl}/admin/operacao`, { headers: { cookie: supervisorCookie } });
  assert.equal(pagina.status, 200);
});

test('browser: falha de leitura NÃO vira painel vazio', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openOperacao(browser, tiCookie, {
      fail: { status: 503, code: 'read_unavailable' },
    });
    const estado = page.locator('[data-ui-state="error"]').first();
    await estado.waitFor();
    const texto = await estado.innerText();
    assert.match(texto, /não foi possível ler os dados de operação/i, 'a falha precisa ser dita em português');
    assert.match(texto, /NÃO significa que não existam postos, escalas ou ocorrências/i,
      'falha de leitura não pode ser apresentada como ausência de registro');
    assert.match(texto, /HTTP 503/, 'o rodapé declara a resposta real do servidor');
    assert.match(texto, /\(read_unavailable\)/, 'o código canônico fica entre parênteses, no rodapé');
    assert.doesNotMatch(texto, /^read_unavailable/, 'o código cru nunca é a mensagem principal');

    // Nenhum painel pode afirmar ausência quando a leitura falhou.
    assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0,
      'com a leitura falhando, nenhum estado vazio pode aparecer');
    assert.ok(await estado.locator('button').count() >= 1,
      'uma falha transitória precisa oferecer nova tentativa');

    await capture(page, 'ux-07a-operacao-falha-nao-vira-vazio');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: negado e indisponível são dois estados distintos', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openOperacao(browser, tiCookie, {
      fail: { status: 403, code: 'forbidden' },
    });
    const negado = page.locator('[data-ui-state="denied"]').first();
    await negado.waitFor();
    const texto = await negado.innerText();
    assert.match(texto, /não tem concessão/i, 'a recusa precisa ser dita como recusa');
    assert.match(texto, /menu pode mostrar o caminho/i, 'menu não é autorização, e a tela diz isso');
    assert.match(texto, /HTTP 403/);
    assert.equal(await negado.locator('button').count(), 0,
      'uma negativa de concessão não se resolve repetindo o pedido');
    assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0,
      'acesso negado jamais aparece como ausência de registro');

    await capture(page, 'ux-07a-operacao-negado');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: as abas da operação são um tablist de verdade, com teclado', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openOperacao(browser, tiCookie);
    const tablist = page.getByRole('tablist');
    await tablist.waitFor();
    const abas = page.getByRole('tab');
    assert.equal(await abas.count(), 14, 'a operação tem catorze abas declaradas');

    const painel = page.locator('[role="tabpanel"]');
    assert.equal(await painel.count(), 1, 'o painel ativo precisa existir — era o que faltava');
    assert.equal(await painel.getAttribute('id'), 'ops-painel-postos');
    assert.equal(await painel.getAttribute('aria-labelledby'), 'ops-aba-postos');

    const primeira = abas.first();
    assert.equal(await primeira.getAttribute('aria-selected'), 'true');
    assert.equal(await primeira.getAttribute('tabindex'), '0', 'só a aba ativa fica na ordem de tabulação');
    assert.equal(await abas.nth(1).getAttribute('tabindex'), '-1');

    await primeira.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await abas.nth(1).getAttribute('aria-selected'), 'true', '→ move para a próxima aba');
    assert.equal(await painel.getAttribute('id'), 'ops-painel-jornada', 'o painel acompanha a aba ativa');

    await page.keyboard.press('End');
    assert.equal(await abas.nth(13).getAttribute('aria-selected'), 'true', 'End vai para a última aba');
    await page.keyboard.press('Home');
    assert.equal(await abas.nth(0).getAttribute('aria-selected'), 'true', 'Home volta para a primeira');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await abas.nth(13).getAttribute('aria-selected'), 'true', '← circula para a última');

    await capture(page, 'ux-07a-operacao-abas');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: vazio é dito como vazio, declarando que a leitura foi concluída', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openOperacao(browser, tiCookie);
    const vazio = page.locator('[data-ui-state="empty"]').first();
    await vazio.waitFor();
    const texto = await vazio.innerText();
    assert.match(texto, /leitura foi concluída com sucesso/i,
      'o vazio precisa declarar que a leitura aconteceu');
    // O selo é maiusculizado por CSS: comparar sem distinguir caixa.
    assert.match(texto, /nenhum registro/i, 'o selo do estado vazio precisa aparecer');
    assert.equal(await page.locator('[data-ui-state="error"]').count(), 0,
      'leitura bem-sucedida não pode exibir falha');

    await capture(page, 'ux-07a-operacao-vazio');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: em 390px a operação não produz transbordo horizontal', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openOperacao(browser, tiCookie, { width: 390, height: 844 });
    await page.getByRole('tablist').waitFor();
    const transbordo = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(transbordo <= 1, `transbordo horizontal de ${transbordo}px em 390px`);
    await capture(page, 'ux-07a-operacao-390px');
    await context.close();
  } finally { await browser.close(); }
});
