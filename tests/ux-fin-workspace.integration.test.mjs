// UX-07B — gate da família financeira, por HTTP real contra PostgreSQL real
// (executado por scripts/qa-ux-fin-postgres.mjs, que sobe um cluster
// descartável) e por Chromium real.
//
// O que este gate prova:
//  - o contrato de acesso do financeiro continua intacto: 401 sem sessão e
//    403 para quem passa pelo menu sem a concessão;
//  - o defeito central desta fatia: em dinheiro, FALHA não vira zero. Com a
//    leitura caindo, a tabela de recebíveis não afirma "nenhum recebível";
//  - 403 (negado) e 503 (indisponível) são dois estados distintos;
//  - as abas são um `tablist` de verdade, com `tabpanel`, roving tabindex e
//    ←/→/Home/End;
//  - vazio é dito como vazio, declarando que a leitura foi concluída;
//  - 390px não produz transbordo horizontal.
//
// O que este gate NÃO prova: aceite humano, homologação de Marcelo/Andreia,
// comportamento em Windows ou na máquina do operador.
//
// O servidor NUNCA é enfraquecido: a falha é injetada apenas em `window.fetch`.

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
let financeiroCookie, comercialCookie;

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

// --single-process: um browser novo por contexto.
async function launchBrowser() {
  // O Chromium empacotado roda com --single-process e, logo depois de um
  // browser anterior ser fechado, o lançamento seguinte pode falhar com
  // "target has been closed". Tentar de novo é robustez de ambiente: nenhuma
  // asserção é afrouxada por isso.
  let ultimaFalha;
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    try {
      return await playwrightChromium.launch({
        executablePath: await packagedChromium.executablePath(),
        args: packagedChromium.args.filter(arg => arg !== '--disable-web-security'),
        headless: true,
      });
    } catch (cause) {
      ultimaFalha = cause;
      await new Promise(r => setTimeout(r, 1_500));
    }
  }
  throw ultimaFalha;
}

const evidenceDir = process.env.UX_FIN_EVIDENCE_DIR || '';
async function capture(page, nome) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage: true });
}

async function openFinanceiro(browser, cookie, { width = 1440, height = 900, fail = null } = {}) {
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
        // Só as leituras financeiras caem; a sessão continua sendo decidida
        // pelo servidor de verdade.
        if (url.includes('/api/fin/') || url.includes('/api/admin/finance/')) {
          return new Response(JSON.stringify({ error: failCode }), {
            status: failStatus, headers: { 'content-type': 'application/json' },
          });
        }
        return original(input, init);
      };
    }, { failStatus: fail.status, failCode: fail.code });
  }
  await page.goto(`${baseUrl}/admin/financeiro`, { waitUntil: 'domcontentloaded' });
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
      NEXT_DIST_DIR: '.next/integration-ux-fin',
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

  const financeiro = await provisionStaff(pool, { role: 'financeiro' });
  financeiroCookie = await loginStaffHttp(financeiro.email);
  // Papel que NÃO está no AdminGate de /admin/financeiro nem tem concessão
  // financeira: serve para provar que o menu não amplia acesso.
  const comercial = await provisionStaff(pool, { role: 'comercial' });
  comercialCookie = await loginStaffHttp(comercial.email);

  const deadline = Date.now() + 240_000;
  for (;;) {
    try {
      const res = await fetch(`${baseUrl}/admin/financeiro`, { redirect: 'manual' });
      if (res.status !== 404) break;
    } catch { /* ainda compilando */ }
    if (Date.now() > deadline) throw new Error('page_compile_timeout_financeiro');
    await new Promise(r => setTimeout(r, 500));
  }
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) { server.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); server.kill('SIGKILL'); }
});

test('o contrato de acesso do financeiro não mudou: 401 sem sessão', { skip: !RUN }, async () => {
  for (const rota of ['/api/fin/receivables', '/api/fin/payments', '/api/fin/budgets', '/api/fin/bank-statements']) {
    const anonima = await api(rota);
    assert.equal(anonima.status, 401, `${rota} precisa exigir sessão, veio ${anonima.status}`);
    assert.ok(!(anonima.body || {}).receivables && !(anonima.body || {}).budgets,
      'a negativa não pode vazar valor algum');
  }
});

test('menu não é autorização: papel comercial lê o que o servidor concede e nada além', { skip: !RUN }, async () => {
  // Achado registrado, não alterado: `handleReceivables` concede leitura a
  // `comercial` DE PROPÓSITO (`['admin','ti','financeiro','comercial']` em
  // `fin-api.mjs`). O gate documenta a concessão real em vez de supor — e
  // prova que ela não se estende ao resto do financeiro.
  const recebiveis = await api('/api/fin/receivables', { cookie: comercialCookie });
  assert.equal(recebiveis.status, 200,
    'a concessão de leitura de recebíveis ao comercial é decisão do servidor e segue valendo');

  for (const rota of ['/api/fin/payments', '/api/fin/suppliers', '/api/fin/budgets']) {
    const negada = await api(rota, { cookie: comercialCookie });
    assert.equal(negada.status, 403, `${rota} precisa recusar o comercial, veio ${negada.status}`);
    assert.equal(negada.body.error, 'forbidden');
    assert.ok(!(negada.body || {}).payments && !(negada.body || {}).budgets,
      'a recusa não pode vazar valor algum');
  }

  const escrita = await api('/api/fin/budgets', {
    method: 'POST', cookie: comercialCookie,
    body: { title: `QA UX07B ${randomUUID().slice(0, 8)}`, description: 'Tentativa sintética sem concessão financeira' },
  });
  assert.equal(escrita.status, 403, `a escrita precisa ser recusada, veio ${escrita.status}`);
  assert.ok(!(escrita.body || {}).budget, 'a recusa não pode devolver registro criado');
});

test('browser: em dinheiro, falha de leitura NÃO vira zero nem "nenhum recebível"', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceiro(browser, financeiroCookie, {
      fail: { status: 503, code: 'finance_flow_unavailable' },
    });
    const estado = page.locator('[data-testid="finance-error"] [data-ui-state]').first();
    await estado.waitFor();
    const texto = await estado.innerText();
    assert.match(texto, /não foi possível ler o financeiro/i, 'a falha precisa ser dita em português');
    assert.match(texto, /NÃO significa que não existam contas, baixas ou regras/i);
    assert.match(texto, /HTTP 503/, 'o rodapé declara a resposta real do servidor');
    assert.match(texto, /\(finance_flow_unavailable\)/, 'o código canônico fica entre parênteses, no rodapé');

    // A afirmação cara: a tabela NÃO pode dizer que não há recebível.
    const tabela = await page.getByTestId('finance-receivables-table').innerText();
    assert.doesNotMatch(tabela, /Nenhum recebível encontrado/i,
      'com a leitura falhando, a tela não pode afirmar ausência de cobrança');
    assert.match(tabela, /ainda não lidos/i, 'a tabela precisa dizer que ainda não leu');

    await capture(page, 'ux-07b-financeiro-falha-nao-vira-zero');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: negado e indisponível são dois estados distintos', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceiro(browser, financeiroCookie, {
      fail: { status: 403, code: 'forbidden' },
    });
    const negado = page.locator('[data-testid="finance-error"] [data-ui-state="denied"]').first();
    await negado.waitFor();
    const texto = await negado.innerText();
    assert.match(texto, /não tem concessão/i);
    assert.match(texto, /menu pode mostrar o caminho/i, 'menu não é autorização, e a tela diz isso');
    assert.match(texto, /HTTP 403/);
    assert.equal(await negado.locator('button').count(), 0,
      'uma negativa de concessão não se resolve repetindo o pedido');

    await capture(page, 'ux-07b-financeiro-negado');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: as abas do financeiro são um tablist de verdade, com teclado', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceiro(browser, financeiroCookie);
    await page.getByRole('tablist').waitFor();
    const abas = page.getByRole('tab');
    assert.equal(await abas.count(), 16, 'o financeiro tem dezesseis abas declaradas');

    const painel = page.locator('[role="tabpanel"]').first();
    assert.equal(await painel.getAttribute('id'), 'finance-painel-receivables');
    assert.equal(await painel.getAttribute('aria-labelledby'), 'finance-aba-receivables');

    const primeira = abas.first();
    assert.equal(await primeira.getAttribute('tabindex'), '0', 'só a aba ativa fica na ordem de tabulação');
    assert.equal(await abas.nth(1).getAttribute('tabindex'), '-1');

    await primeira.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await abas.nth(1).getAttribute('aria-selected'), 'true', '→ move para a próxima aba');
    await page.keyboard.press('End');
    assert.equal(await abas.nth(15).getAttribute('aria-selected'), 'true', 'End vai para a última aba');
    await page.keyboard.press('Home');
    assert.equal(await abas.nth(0).getAttribute('aria-selected'), 'true', 'Home volta para a primeira');

    await capture(page, 'ux-07b-financeiro-abas');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: vazio é dito como vazio, declarando que a leitura foi concluída', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceiro(browser, financeiroCookie);
    const vazio = page.getByTestId('finance-receivables-empty');
    await vazio.waitFor();
    // Antes da primeira leitura a célula diz "ainda não lidos" — que é o
    // estado honesto. Esperamos a leitura concluir para então exigir a frase
    // de vazio; esperar a transição não enfraquece nada, é a transição real.
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-testid="finance-receivables-empty"]');
      return Boolean(node && /leitura foi concluída/i.test(node.textContent || ''));
    });
    const texto = await vazio.innerText();
    assert.match(texto, /leitura foi concluída com sucesso/i,
      'o vazio precisa declarar que a leitura aconteceu');
    assert.equal(await page.locator('[data-testid="finance-error"]').count(), 0,
      'leitura bem-sucedida não pode exibir falha');

    await capture(page, 'ux-07b-financeiro-vazio');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: em 390px o financeiro não produz transbordo horizontal', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceiro(browser, financeiroCookie, { width: 390, height: 844 });
    await page.getByRole('tablist').waitFor();
    const transbordo = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(transbordo <= 1, `transbordo horizontal de ${transbordo}px em 390px`);
    await capture(page, 'ux-07b-financeiro-390px');
    await context.close();
  } finally { await browser.close(); }
});
