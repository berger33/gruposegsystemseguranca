// UX-07 (fatia B — Financeiro) — gate da tela financeira, por HTTP real
// contra PostgreSQL real (executado por scripts/qa-ux-finance-postgres.mjs,
// que sobe um cluster descartável) e por Chromium real.
//
// O que este gate prova:
//  - as rotas financeiras continuam respondendo 401 sem sessão;
//  - "menu não é autorização": o papel `ti` abre /admin/financeiro (está na
//    lista do AdminGate) e mesmo assim é recusado em escrita, com `read_only`
//    decidido pelo servidor — a tela não finge uma permissão que não existe;
//  - o defeito corrigido nesta fatia: uma FALHA de leitura (503 em um dos três
//    endpoints do painel próprio) não vira "nenhum registro" — carregando,
//    vazio, falha e negado continuam quatro estados distintos, com o código
//    canônico disponível como detalhe e opção de repetir;
//  - as 16 abas são um tablist de verdade, com roving tabindex e teclado;
//  - o vocabulário em português aparece na tela (situação da conta, tipo de
//    movimento, valores em reais) em vez do valor cru do banco;
//  - o vocabulário também chega às áreas legadas FIN-05..FIN-16: a falha de
//    leitura da aba Exportações deixa de ser o código cru `internal`;
//  - 390px não produz transbordo horizontal.
//
// O que este gate NÃO prova: aceite humano, homologação de Marcelo/Andreia,
// nem a reescrita completa das treze áreas FIN-05..FIN-16 (ver pendências em
// docs/UX-07-FINANCEIRO-2026-10-05.md).

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
let financeCookie, tiCookie;
let accountId, contractId, receivableId, receivableProtocol;

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

const evidenceDir = process.env.UX_FINANCE_EVIDENCE_DIR || '';
async function capture(page, nome) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage: true });
}

/**
 * Abre /admin/financeiro já autenticado com o cookie indicado. `failRoutes`
 * derruba, dentro da própria página, as respostas indicadas: `page.route()` é
 * instável com este Chromium empacotado, então a substituição é feita em
 * `window.fetch`, como nos demais gates do repositório. O servidor NÃO é
 * enfraquecido.
 */
async function openFinance(browser, cookie, { width = 1440, height = 900, failRoutes = [], status = 503, code = 'internal' } = {}) {
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
      NEXT_DIST_DIR: '.next/integration-ux-finance',
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

  const financeiro = await provisionStaff(pool, { role: 'financeiro' });
  const ti = await provisionStaff(pool, { role: 'ti' });
  financeCookie = await loginStaffHttp(financeiro.email);
  tiCookie = await loginStaffHttp(ti.email);

  // Espaço canônico do cliente: conta + contrato, como nos demais gates.
  accountId = randomUUID();
  await pool.query("INSERT INTO client_accounts (id,display_name,status,created_by) VALUES ($1,$2,'active','marcelo')",
    [accountId, `QA UX07B Conta ${accountId.slice(0, 8)}`]);
  contractId = randomUUID();
  await pool.query("INSERT INTO client_contracts (id,client_account_id,title,service,status,created_by) VALUES ($1,$2,$3,'Vigilância','active','marcelo')",
    [contractId, accountId, `QA UX07B Contrato ${contractId.slice(0, 8)}`]);

  for (const route of ['/admin/entrar', '/admin/financeiro']) {
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

test('as rotas financeiras continuam exigindo sessão, sem mudança de contrato', { skip: !RUN }, async () => {
  const anonymous = await api('/api/fin/receivables');
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error, 'unauthorized');
  assert.ok(!('receivables' in (anonymous.body || {})), 'a negativa não pode vazar recebível algum');
});

test('menu não é autorização: ti abre /admin/financeiro mas é recusado na escrita', { skip: !RUN }, async () => {
  // /admin/financeiro está em allowedRoles do AdminGate para ti — a página
  // abre. Mesmo assim, gravar continua recusado pelo próprio servidor
  // (fin-budget-api.mjs devolve `read_only` para o papel ti).
  const pagina = await fetch(`${baseUrl}/admin/financeiro`, { headers: { cookie: tiCookie }, redirect: 'manual' });
  assert.equal(pagina.status, 200, 'o papel ti enxerga a tela financeira');

  const negado = await api('/api/fin/exports', {
    method: 'POST', cookie: tiCookie,
    body: { period_start: '2036-01-01', period_end: '2036-01-31', file_name: 'negado.csv', filters: {} },
  });
  assert.equal(negado.status, 403);
  assert.equal(negado.body.error, 'read_only');
  assert.ok(!('export' in (negado.body || {})), 'a recusa não pode vazar exportação alguma');

  const permitido = await api('/api/fin/exports', {
    method: 'POST', cookie: financeCookie,
    body: {
      period_start: '2036-01-01', period_end: '2036-01-31',
      file_name: `qa-ux07b-${randomUUID().slice(0, 8)}.csv`, filters: {},
    },
  });
  assert.equal(permitido.status, 201, `o papel financeiro continua podendo exportar — esta fatia não mudou permissão alguma (veio ${permitido.status} ${JSON.stringify(permitido.body)})`);
});

test('massa fictícia pelas próprias APIs financeiras: recebível e baixa parcial calculada no servidor', { skip: !RUN }, async () => {
  const created = await api('/api/fin/receivables', {
    method: 'POST', cookie: financeCookie,
    body: {
      client_account_id: accountId, contract_id: contractId,
      competence_date: '2036-02-01', due_date: '2036-02-10', amount_cents: 100000,
      description: 'Mensalidade sintética do gate UX-07 fatia B',
    },
  });
  assert.equal(created.status, 201, `criação do recebível deveria ser 201, veio ${created.status} ${JSON.stringify(created.body)}`);
  receivableId = created.body.receivable.id;
  receivableProtocol = created.body.receivable.protocol;

  const settled = await api(`/api/admin/finance/f03/receivables/${receivableId}/settlements`, {
    method: 'POST', cookie: financeCookie,
    headers: { 'Idempotency-Key': randomUUID() },
    body: { amount_cents: 40000, reason: 'Baixa parcial sintética do gate UX-07 fatia B' },
  });
  assert.equal(settled.status, 201, `baixa deveria ser 201, veio ${settled.status} ${JSON.stringify(settled.body)}`);

  const row = await pool.query('SELECT status, amount_paid_cents FROM fin_accounts_receivable WHERE id=$1', [receivableId]);
  assert.equal(row.rows[0].status, 'parcial', 'a situação parcial é calculada pelo banco, nunca pela tela');
  assert.equal(Number(row.rows[0].amount_paid_cents), 40000);
});

test('browser: falha de leitura NÃO vira lista vazia no painel financeiro', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinance(browser, financeCookie, {
      failRoutes: ['/api/fin/payments'], status: 503, code: 'audit_unavailable',
    });
    const estado = page.locator('[data-ui-state="error"]').first();
    await estado.waitFor();
    const texto = await estado.innerText();
    assert.match(texto, /HTTP 503|audit_unavailable/, 'o código canônico fica disponível para diagnóstico');
    assert.doesNotMatch(texto, /^audit_unavailable$/, 'o código cru não pode ser a frase principal');
    assert.equal(await page.locator('[role="tablist"]').count(), 0, 'sem leitura completa, as abas de trabalho não aparecem');
    assert.equal(await page.locator('[data-testid="finance-receivables-table"]').count(), 0, 'falha de leitura não renderiza tabela vazia');
    assert.ok(await estado.locator('button').count() >= 1, 'falha transitória precisa oferecer nova tentativa');
    await capture(page, 'desktop-financeiro-falha-inicial');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: as 16 abas do financeiro são um tablist de verdade, com teclado', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinance(browser, financeCookie);
    await page.locator('[role="tablist"]').waitFor();

    const abas = page.getByRole('tab');
    assert.equal(await abas.count(), 16, 'o financeiro tem dezesseis frentes de trabalho');
    assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1);
    assert.equal(await page.locator('[role="tab"][tabindex="-1"]').count(), 15);
    assert.equal(await page.locator('[role="tabpanel"]').count(), 1, 'só o painel ativo fica montado');

    await abas.first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await abas.nth(1).getAttribute('aria-selected'), 'true');
    assert.equal(await abas.nth(1).evaluate(el => el === document.activeElement), true,
      'a seta precisa mover o foco junto com a seleção');
    await page.keyboard.press('End');
    assert.equal(await abas.nth(15).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await abas.nth(0).getAttribute('aria-selected'), 'true');

    await capture(page, 'desktop-financeiro-abas');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: a situação da conta aparece com vocabulário em português e valor em reais', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinance(browser, financeCookie);
    await page.locator('[role="tablist"]').waitFor();

    const linha = page.locator('tr', { hasText: receivableProtocol }).first();
    await linha.waitFor();
    const texto = await linha.innerText();
    assert.match(texto, /Baixa parcial/, 'a situação `parcial` do banco é exibida em português');
    assert.match(texto, /R\$ 1\.000,00/, 'o valor aparece em reais, não em centavos crus');

    const badge = linha.locator('[data-ui-badge]').first();
    assert.equal(await badge.getAttribute('data-ui-badge'), 'info', 'baixa parcial é informação, não sucesso nem perigo');

    await capture(page, 'desktop-financeiro-vocabulario');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: o vocabulário também chega às áreas FIN-05..FIN-16 — a falha deixa de ser código cru', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinance(browser, financeCookie, {
      failRoutes: ['/api/fin/exports'], status: 500, code: 'internal',
    });
    await page.locator('[role="tablist"]').waitFor();
    await page.getByRole('tab', { name: 'Exportações', exact: true }).click();

    const erro = page.locator('[data-testid="fin14-read-error"]');
    await erro.waitFor();
    const texto = await erro.innerText();
    assert.match(texto, /não foi possível/i, 'a frase continua em português');
    assert.match(texto, /\(internal\)/, 'o código canônico fica disponível, entre parênteses');
    assert.doesNotMatch(texto, /Erro 500/, 'a mensagem genérica anterior não pode voltar');

    await capture(page, 'desktop-financeiro-legado-vocabulario');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: em 390px a tela financeira não produz transbordo horizontal', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinance(browser, financeCookie, { width: 390, height: 844 });
    await page.locator('[role="tablist"]').waitFor();
    await page.waitForTimeout(400);
    const transbordo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(transbordo <= 1, `transbordo de ${transbordo}px na tela financeira`);

    const alturas = await page.locator('[role="tab"]').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().height)));
    for (const altura of alturas) assert.ok(altura >= 32, `aba com apenas ${altura}px de altura`);
    await capture(page, 'mobile-financeiro-390px');
    await context.close();
  } finally { await browser.close(); }
});
