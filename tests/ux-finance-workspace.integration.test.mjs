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

// ---------------------------------------------------------------------------
// UX-PRO-07E-1 — casos NOVOS, acrescentados APÓS os 8 herdados.
//
// O prefixo herdado (347 linhas / 17.004 bytes / SHA-256
// 42dc4da39b583445e338c9fb7d8586d43c6b1a9bc8745768b4290280f7e8ec74) permanece
// byte a byte: nenhuma asserção herdada foi editada, removida ou relaxada.
//
// O que estes casos provam: uma resposta 2xx cujo corpo NÃO traz a lista
// canônica deixa de ser apresentada como "nenhum registro" no painel próprio e
// em quatro sub-workspaces de /admin/financeiro (conciliação, orçamento, fluxo
// de caixa e cobrança). O vazio LEGÍTIMO — chave presente com `[]`, que é como
// o servidor expressa ausência real — continua sendo vazio concluído.
//
// Injeção somente em `window.fetch` da página e somente em GET: servidor,
// banco, proxy e todas as escritas permanecem reais e intactos.
//
// Duas escolhas de método, ambas para tornar a linha de base comparável:
//  1. as capturas são feitas ANTES de afirmar, para que a implementação
//     anterior também produza a imagem do vazio falso;
//  2. as asserções leem o TEXTO renderizado em vez de esperar um elemento que
//     só existe na implementação nova — assim a linha de base reprova rápido e
//     com a frase do vazio falso na mensagem, em vez de estourar timeout e
//     degradar o servidor ao fim da suíte.
//
// As oito áreas restantes da rota (Closure, Commission, CostAllocation,
// Expense, Export, Fiscal, Gateway, ManagementResults) continuam com o vazio
// falso e estão registradas como pendência 07E-2 — estes casos NÃO as cobrem.
// ---------------------------------------------------------------------------

/**
 * Abre /admin/financeiro com corpos 2xx INVÁLIDOS injetados em `window.fetch`.
 * As regras são persistentes (em modo de desenvolvimento o React executa os
 * efeitos de carga duas vezes) e podem ser desligadas por `releaseInvalidBody`,
 * o que permite provar que a repetição recupera o dado real.
 */
async function openFinanceInvalidBody(browser, cookie, { width = 1440, height = 900, rules = [] } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  const separator = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(90_000);
  watchPageErrors(page);
  const injected = rules.map(rule => ({
    match: rule.match,
    status: rule.status ?? 200,
    body: typeof rule.body === 'string' ? rule.body : JSON.stringify(rule.body),
  }));
  await page.addInitScript(({ rules: injectedRules }) => {
    const original = window.fetch.bind(window);
    const state = { rules: injectedRules.map(rule => ({ ...rule, active: true })) };
    window.__qaFinanceInvalidBody = state;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input?.url || '');
      const method = String(init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
      // Somente GET: nenhuma escrita passa pelo injetor.
      if (method === 'GET') {
        const hit = state.rules.find(rule => rule.active && url.includes(rule.match));
        if (hit) return new Response(hit.body, { status: hit.status, headers: { 'content-type': 'application/json' } });
      }
      return original(input, init);
    };
  }, { rules: injected });
  await page.goto(`${baseUrl}/admin/financeiro`, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

/** Desliga uma regra de injeção, para provar que a repetição recupera de verdade. */
async function releaseInvalidBody(page, match) {
  await page.evaluate(target => {
    for (const rule of window.__qaFinanceInvalidBody.rules) if (rule.match === target) rule.active = false;
  }, match);
}

async function gotoTab(page, name) {
  await page.locator('[role="tablist"]').waitFor();
  await page.getByRole('tab', { name, exact: true }).click();
}

/**
 * Espera a superfície que existe nos DOIS cenários (implementação anterior e
 * nova) e dá tempo de a leitura assentar, para que a captura e a leitura de
 * texto sejam comparáveis antes/depois.
 */
/**
 * Registra erros não capturados da página. Não alteram nenhuma asserção: servem
 * para explicar, na mensagem de reprovação, por que uma superfície sumiu.
 */
function watchPageErrors(page) {
  const erros = [];
  page.on('pageerror', error => {
    if (erros.length < 3) erros.push(String(error?.message || error).replace(/\s+/g, ' ').slice(0, 220));
  });
  page.__qaPageErrors = erros;
  return erros;
}

async function settle(page, anchor, candidates, extraMs = 500) {
  let ancoraVisivel = true;
  try {
    await page.locator(anchor).first().waitFor({ timeout: 60_000 });
  } catch {
    ancoraVisivel = false;
  }
  if (ancoraVisivel) {
    await Promise.race(candidates.map(selector => page.locator(selector).first().waitFor({ timeout: 30_000 }))).catch(() => {});
  }
  await page.waitForTimeout(extraMs);
  return ancoraVisivel;
}

/**
 * Texto renderizado de uma superfície, para asserções que não dependem de
 * elemento novo. Se a superfície não existe no momento da leitura, devolve um
 * marcador explicativo em vez de estourar timeout: as asserções positivas
 * continuam reprovando, agora com a causa visível no relatório TAP.
 */
async function textOf(page, selector) {
  try {
    return (await page.locator(selector).first().innerText({ timeout: 15_000 })).replace(/\s+/g, ' ');
  } catch {
    const erros = page.__qaPageErrors || [];
    const causa = erros.length ? ` erro de página registrado: "${erros[0]}"` : '';
    return `[superficie ausente: ${selector} nao estava renderizada no momento da leitura.${causa}]`;
  }
}

test('UX-PRO-07E-1 contrato: todo GET canônico devolve a chave de lista no 200, e o vazio legítimo é chave presente com []', { skip: !RUN }, async () => {
  const esperados = [
    ['/api/admin/finance/f03/receivables', 'receivables'],
    ['/api/fin/recurrence-rules', 'rules'],
    ['/api/fin/payments', 'payments'],
    ['/api/admin/finance/f03/reports', 'reports'],
    ['/api/fin/bank-statements', 'statements'],
    ['/api/fin/bank-transactions', 'transactions'],
    ['/api/fin/receivables', 'receivables'],
    ['/api/fin/payables', 'payables'],
    ['/api/fin/conciliations', 'conciliations'],
    ['/api/fin/budgets', 'budgets'],
    ['/api/fin/budget-scenarios', 'scenarios'],
    ['/api/fin/cashflow-snapshots', 'snapshots'],
    ['/api/fin/aging-receivables', 'aging'],
    ['/api/fin/collection-policies', 'policies'],
    ['/api/fin/collection-reminders', 'reminders'],
  ];
  let vaziosLegitimos = 0;
  for (const [caminho, chave] of esperados) {
    const resposta = await api(caminho, { cookie: financeCookie });
    assert.equal(resposta.status, 200, `${caminho} deveria responder 200, veio ${resposta.status}`);
    assert.ok(Array.isArray(resposta.body?.[chave]),
      `${caminho} precisa devolver a lista canônica "${chave}": é isso que autoriza a tela a exigir a chave em vez de aceitar []`);
    if (resposta.body[chave].length === 0) vaziosLegitimos += 1;
  }
  assert.ok(vaziosLegitimos >= 1,
    'ao menos um endpoint precisa estar legitimamente vazio, para provar que ausência real é chave presente com [] e não chave ausente');
  // Nenhum extrato bancário é criado por esta suíte: vazio legítimo confirmado.
  const extratos = await api('/api/fin/bank-statements', { cookie: financeCookie });
  assert.deepEqual(extratos.body.statements, []);
});

test('UX-PRO-07E-1 browser: painel próprio — 2xx sem "receivables" declara falha, não "Nenhum recebível encontrado."', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [{ match: '/api/admin/finance/f03/receivables', body: { ok: true, note: 'corpo 2xx sem a lista canônica' } }],
    });
    await settle(page, '[data-testid="financeiro-workspace"]',
      ['[data-testid="finance-read-error"]', '[data-testid="finance-receivables-table"]']);
    await capture(page, '07e1-painel-recebiveis-corpo-invalido');

    const texto = await textOf(page, '[data-testid="financeiro-workspace"]');
    assert.match(texto, /invalid_finance_response/,
      `o corpo 2xx sem a lista precisa ser declarado como falha; texto renderizado: "${texto.slice(0, 300)}"`);
    assert.match(texto, /sem a lista esperada/i, 'a falha declara que a resposta veio sem a lista');
    assert.match(texto, /não significa que não existam registros/i, 'a falha não pode soar como ausência de dado');
    assert.match(texto, /HTTP 200/, 'o status real aparece: um 2xx inválido não pode virar status 0');
    assert.doesNotMatch(texto, /Nenhum recebível encontrado\./,
      'ausência de recebível não pode ser afirmada sobre uma resposta ilegível');
    assert.equal(await page.locator('[data-testid="finance-receivables-empty"]').count(), 0);
    assert.equal(await page.locator('[role="tablist"]').count(), 0,
      'sem leitura confirmada as abas não aparecem — comportamento herdado preservado');
    assert.ok(await page.locator('[data-testid="finance-read-error"] button').count() >= 1,
      'falha transitória precisa oferecer nova tentativa');
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-1 browser: painel próprio — 2xx com "rules" não-array declara falha, não "Nenhuma regra encontrada."', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [{ match: '/api/fin/recurrence-rules', body: { rules: 'não é uma lista' } }],
    });
    await settle(page, '[data-testid="financeiro-workspace"]',
      ['[data-testid="finance-read-error"]', '[role="tablist"]']);
    await capture(page, '07e1-painel-regras-nao-array');

    const texto = await textOf(page, '[data-testid="financeiro-workspace"]');
    assert.match(texto, /invalid_finance_response/,
      `lista não-array precisa ser declarada como falha; texto: "${texto.slice(0, 300)}"`);
    assert.doesNotMatch(texto, /Nenhuma regra encontrada\./, 'regra de recorrência não pode ser afirmada como ausente');
    assert.equal(await page.locator('[role="tablist"]').count(), 0);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-1 browser: painel próprio — corpo 2xx ilegível declara falha, não "Nenhum pagamento encontrado."', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      // JSON ilegível: o leitor de `financeRequest` já devolve `null`, que não
      // pode virar lista vazia.
      rules: [{ match: '/api/fin/payments', body: '<html>resposta que não é JSON</html>' }],
    });
    await settle(page, '[data-testid="financeiro-workspace"]',
      ['[data-testid="finance-read-error"]', '[role="tablist"]']);
    await capture(page, '07e1-painel-pagamentos-corpo-ilegivel');

    const texto = await textOf(page, '[data-testid="financeiro-workspace"]');
    assert.match(texto, /invalid_finance_response/,
      `corpo ilegível precisa ser declarado como falha; texto: "${texto.slice(0, 300)}"`);
    assert.doesNotMatch(texto, /Nenhum pagamento encontrado\./, 'pagamento não pode ser afirmado como ausente');
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-1 browser: vazio legítimo preservado — 2xx com listas vazias continua vazio concluído, não falha', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [
        { match: '/api/admin/finance/f03/receivables', body: { receivables: [] } },
        { match: '/api/fin/recurrence-rules', body: { rules: [] } },
        { match: '/api/fin/payments', body: { payments: [] } },
      ],
    });
    await settle(page, '[role="tablist"]', ['[data-testid="finance-receivables-table"]']);
    await capture(page, '07e1-painel-vazio-legitimo');

    const texto = await textOf(page, '[data-testid="financeiro-workspace"]');
    assert.doesNotMatch(texto, /invalid_finance_response/,
      'chave presente com [] é vazio concluído, nunca falha');
    assert.equal(await page.locator('[data-testid="finance-read-error"]').count(), 0);
    const vazio = page.locator('[data-testid="finance-receivables-empty"]');
    assert.equal(await vazio.count(), 1, 'o vazio honesto herdado continua existindo');
    assert.match(await vazio.innerText(), /Nenhum recebível encontrado\./);
    await gotoTab(page, 'Recorrência');
    await page.locator('[data-testid="finance-recurrence"]').waitFor();
    assert.match(await page.locator('[data-testid="finance-recurrence"]').innerText(), /Nenhuma regra encontrada\./,
      'o vazio herdado de recorrência é preservado');
    await gotoTab(page, 'Pagamentos');
    await page.locator('[data-testid="finance-payments"]').waitFor();
    assert.match(await page.locator('[data-testid="finance-payments"]').innerText(), /Nenhum pagamento encontrado\./,
      'o vazio herdado de pagamentos é preservado');
    await capture(page, '07e1-painel-vazio-legitimo-pagamentos');
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-1 browser: a repetição depois do corpo 2xx inválido recupera o dado real', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [{ match: '/api/admin/finance/f03/receivables', body: { receivables: null } }],
    });
    await settle(page, '[data-testid="financeiro-workspace"]',
      ['[data-testid="finance-read-error"]', '[data-testid="finance-receivables-table"]']);
    await capture(page, '07e1-painel-antes-de-repetir');

    const antes = await textOf(page, '[data-testid="financeiro-workspace"]');
    assert.match(antes, /invalid_finance_response/,
      `a falha precisa ser declarada antes de oferecer repetição; texto: "${antes.slice(0, 300)}"`);
    assert.equal(await page.locator('[role="tablist"]').count(), 0);

    await releaseInvalidBody(page, '/api/admin/finance/f03/receivables');
    await page.locator('[data-testid="finance-read-error"] button').first().click();
    await page.locator('[role="tablist"]').waitFor({ timeout: 90_000 });
    const linha = page.locator('tr', { hasText: receivableProtocol }).first();
    await linha.waitFor();
    await capture(page, '07e1-painel-depois-de-repetir');

    const depois = await textOf(page, '[data-testid="financeiro-workspace"]');
    assert.doesNotMatch(depois, /invalid_finance_response/, 'a repetição real limpa a falha');
    assert.match(await linha.innerText(), /Baixa parcial/, 'o dado real volta a ser exibido após repetir');
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-1 browser: conciliação bancária — 2xx sem "statements" declara indisponibilidade, não ausência de extrato', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [{ match: '/api/fin/bank-statements', body: { synthetic: true } }],
    });
    await gotoTab(page, 'Conciliação bancária');
    await settle(page, '[data-testid="fin05-reconciliation"]',
      ['[data-testid="fin05-error"]', '[data-testid="fin05-statements"]']);
    await capture(page, '07e1-conciliacao-corpo-invalido');

    const texto = await textOf(page, '[data-testid="fin05-reconciliation"]');
    assert.match(texto, /invalid_finance_response/,
      `o corpo 2xx sem "statements" precisa ser declarado; texto: "${texto.slice(0, 300)}"`);
    assert.match(texto, /HTTP 200/, 'o status real aparece na faixa herdada');
    assert.match(texto, /não confundir com ausência/i, 'a lista declara indisponibilidade, não ausência');
    assert.doesNotMatch(texto, /Nenhum extrato sintético\./, 'extrato não pode ser afirmado como ausente');
    assert.doesNotMatch(texto, /Nenhuma transação sintética\./, 'transação não pode ser afirmada como ausente');
    assert.doesNotMatch(texto, /Nenhuma sugestão\./, 'sugestão não pode ser afirmada como ausente');
    assert.equal(await page.locator('[data-testid="fin05-statements-unavailable"]').count(), 1);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-1 browser: orçamento — 2xx sem "budgets" declara indisponibilidade, não "Nenhum orçamento encontrado."', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [{ match: '/api/fin/budgets', body: { total: 0 } }],
    });
    await gotoTab(page, 'Orçamento e cenários');
    await settle(page, '[data-testid="finance-budget-workspace"]',
      ['[data-testid="fin13-budgets-error"]', '[data-testid="fin13-budget-list"]']);
    await capture(page, '07e1-orcamento-corpo-invalido');

    const texto = await textOf(page, '[data-testid="finance-budget-workspace"]');
    assert.match(texto, /invalid_finance_response/,
      `o corpo 2xx sem "budgets" precisa ser declarado; texto: "${texto.slice(0, 300)}"`);
    assert.match(texto, /não foi possível ler/i, 'a frase herdada continua em português');
    assert.doesNotMatch(texto, /Nenhum orçamento encontrado\./, 'orçamento não pode ser afirmado como ausente');
    assert.equal(await page.locator('[data-testid="fin13-budget-empty"]').count(), 0,
      'indisponibilidade não é apresentada como ausência de registros (asserção herdada do L07 preservada)');
    assert.equal(await page.locator('[data-testid="fin13-budget-unavailable"]').count(), 1,
      'o ramo indisponível já existente passa a cobrir também o corpo 2xx inválido');
    assert.equal(await page.locator('[data-testid="fin13-budgets-retry"]').count(), 1, 'a repetição herdada continua disponível');
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-1 browser: cenários — 2xx sem "scenarios" declara indisponibilidade, não ausência de cenário', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [{ match: '/api/fin/budget-scenarios', body: { scenarios: {} } }],
    });
    await gotoTab(page, 'Orçamento e cenários');
    await settle(page, '[data-testid="finance-budget-workspace"]',
      ['[data-testid="fin13-scenarios-error"]', '[data-testid="fin13-scenario-list"]']);
    await capture(page, '07e1-cenarios-corpo-invalido');

    const texto = await textOf(page, '[data-testid="finance-budget-workspace"]');
    assert.match(texto, /invalid_finance_response/,
      `o corpo 2xx sem "scenarios" precisa ser declarado; texto: "${texto.slice(0, 300)}"`);
    assert.doesNotMatch(texto, /Nenhum cenário para o orçamento selecionado\./,
      'cenário não pode ser afirmado como ausente sobre resposta ilegível');
    assert.equal(await page.locator('[data-testid="fin13-scenario-empty"]').count(), 0);
    assert.equal(await page.locator('[data-testid="fin13-scenario-unavailable"]').count(), 1);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-1 browser: fluxo de caixa — 2xx sem "snapshots" declara indisponibilidade, não "Nenhum snapshot registrado."', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [{ match: '/api/fin/cashflow-snapshots', body: { note: 'corpo sem a lista canônica' } }],
    });
    await gotoTab(page, 'Fluxo de caixa e aging');
    await settle(page, '[data-testid="fin07-cashflow"]',
      ['[data-testid="fin07-error"]', '[data-testid="fin07-snapshots"]']);
    await capture(page, '07e1-fluxo-caixa-corpo-invalido');

    const texto = await textOf(page, '[data-testid="fin07-cashflow"]');
    assert.match(texto, /invalid_finance_response/,
      `o corpo 2xx sem "snapshots" precisa ser declarado; texto: "${texto.slice(0, 300)}"`);
    assert.match(texto, /não confundir com ausência/i);
    assert.doesNotMatch(texto, /Nenhum snapshot registrado\./, 'snapshot não pode ser afirmado como ausente');
    assert.doesNotMatch(texto, /Nenhum aging registrado\./,
      'aging também não pode ser afirmado como ausente: a leitura do grupo não foi confirmada');
    assert.equal(await page.locator('[data-testid="fin07-snapshots-unavailable"]').count(), 1);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-1 browser: cobrança — 2xx sem "policies" declara indisponibilidade, não "Nenhuma política cadastrada."', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [{ match: '/api/fin/collection-policies', body: { policies: {} } }],
    });
    await gotoTab(page, 'Cobrança');
    await settle(page, '[data-testid="fin06-collection"]',
      ['[data-testid="fin06-error"]', '[data-testid="fin06-policies"]']);
    await capture(page, '07e1-cobranca-corpo-invalido');

    const texto = await textOf(page, '[data-testid="fin06-collection"]');
    assert.match(texto, /invalid_finance_response/,
      `o corpo 2xx sem "policies" precisa ser declarado; texto: "${texto.slice(0, 300)}"`);
    assert.match(texto, /não confundir com ausência/i);
    assert.doesNotMatch(texto, /Nenhuma política cadastrada\./, 'política não pode ser afirmada como ausente');
    assert.doesNotMatch(texto, /Nenhum lembrete sintético\./, 'lembrete não pode ser afirmado como ausente');
    assert.equal(await page.locator('[data-testid="fin06-policies-unavailable"]').count(), 1);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-1 browser: relatório de baixas — 2xx sem "reports" declara falha, não lista vazia', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [{ match: '/api/admin/finance/f03/reports', body: { note: 'sem a lista' } }],
    });
    await gotoTab(page, 'Relatório de baixas');
    await page.locator('[data-testid="finance-f03-reports"]').waitFor();
    await page.getByRole('button', { name: 'Atualizar lista' }).click();
    await page.waitForTimeout(1_500);
    await capture(page, '07e1-relatorios-corpo-invalido');

    const texto = await textOf(page, '[data-testid="finance-f03-reports"]');
    const painel = await textOf(page, '[data-testid="financeiro-workspace"]');
    assert.ok(/invalid_finance_response/.test(painel),
      `a atualização de relatórios precisa declarar o corpo inválido; texto do painel: "${painel.slice(0, 300)}"`);
    assert.match(painel, /HTTP 200/);
    assert.equal(await page.locator('[data-testid="finance-error"]').count(), 1,
      'a falha aparece no canal herdado de erro de ação');
    assert.ok(texto.length > 0);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-1 browser: histórico da conta — 2xx sem "history" declara falha, não ausência de evento', { skip: !RUN }, async () => {
  // O Chromium empacotado roda com --single-process: reaproveitar o mesmo
  // browser entre contextos derruba o alvo (limitação documentada no auxiliar
  // herdado `launchBrowser`). Cada caso abre o seu próprio browser.
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [{ match: '/api/fin/payment-history', body: { note: 'sem histórico' } }],
    });
    const linha = page.locator('tr', { hasText: receivableProtocol }).first();
    await linha.waitFor();
    await page.getByRole('button', { name: `Abrir conta ${receivableProtocol}` }).click();
    await page.waitForTimeout(1_500);
    await capture(page, '07e1-historico-corpo-invalido');

    const painel = await textOf(page, '[data-testid="financeiro-workspace"]');
    assert.match(painel, /invalid_finance_response/,
      `o histórico da conta precisa declarar o corpo inválido; texto: "${painel.slice(0, 300)}"`);
    assert.equal(await page.locator('[data-testid="finance-error"]').count(), 1);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-1 browser: a falha declarada não produz transbordo em 1440/768/390/320 e as capturas ficam registradas', { skip: !RUN }, async () => {
  const medicoes = [];
  for (const [width, height, nome] of [[1440, 900, '1440'], [768, 1024, '768'], [390, 844, '390'], [320, 844, '320']]) {
    // Um browser por largura, pela mesma limitação do --single-process.
    const browser = await launchBrowser();
    try {
      const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
        width, height,
        rules: [{ match: '/api/admin/finance/f03/receivables', body: { receivables: 'não é uma lista' } }],
      });
      await settle(page, '[data-testid="financeiro-workspace"]',
        ['[data-testid="finance-read-error"]', '[data-testid="finance-receivables-table"]']);
      await capture(page, `07e1-falha-declarada-${nome}`);

      const transbordo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(transbordo <= 1, `transbordo de ${transbordo}px em ${width}px com a falha declarada`);
      const elementoAtivo = await page.evaluate(() => {
        const ativo = document.activeElement;
        return ativo ? { tag: ativo.tagName.toLowerCase(), text: (ativo.textContent || '').trim().slice(0, 40) } : null;
      });
      const texto = await textOf(page, '[data-testid="financeiro-workspace"]');
      assert.match(texto, /invalid_finance_response/,
        `a falha precisa estar declarada em ${width}px; texto: "${texto.slice(0, 240)}"`);
      const alturaRepetir = await page.locator('[data-testid="finance-read-error"] button').first().evaluate(
        node => Math.round(node.getBoundingClientRect().height)).catch(() => null);
      if (alturaRepetir !== null) assert.ok(alturaRepetir >= 32, `botão de repetir com apenas ${alturaRepetir}px em ${width}px`);
      medicoes.push({ width, height, nome, transbordo, elementoAtivo, alturaRepetir });
      await context.close();
    } finally { await browser.close(); }
  }

  if (evidenceDir) {
    const { writeFile } = await import('node:fs/promises');
    const resumo = {
      stage: 'ux-pro-07-financeiro',
      generatedBy: 'gate PostgreSQL descartável + HTTP real + Chromium (scripts/qa-ux-pro-07e1-postgres.mjs)',
      notes: [
        'UX-PRO-07E-1: falha declarada por resposta 2xx sem a lista canônica em /admin/financeiro.',
        'Tema dia; papel financeiro; massa sintética criada pelas próprias APIs financeiras.',
        'elementoAtivoOnFailure é medição informativa do foco no momento da falha; NÃO é percurso de teclado nem primeiro foco visível. O percurso do tablist continua provado pelo caso herdado.',
        'O tema noturno não foi medido nesta fatia: contraste é achado transversal (E8) fora do escopo.',
      ],
      entries: medicoes.map(item => ({
        stage: 'ux-pro-07-financeiro',
        route: '/admin/financeiro',
        role: 'financeiro',
        viewport: `${item.width}x${item.height}`,
        theme: 'day',
        screenshot: `${evidenceDir}/07e1-falha-declarada-${item.nome}.png`,
        problems: [],
        state: 'falha_declarada_corpo_2xx_sem_lista',
        transbordoDocumentoPx: item.transbordo,
        alturaBotaoRepetirPx: item.alturaRepetir,
        elementoAtivoOnFailure: item.elementoAtivo,
      })),
    };
    await writeFile(path.join(evidenceDir, 'resumo.json'), `${JSON.stringify(resumo, null, 2)}\n`, 'utf8');
  }
});

// ---------------------------------------------------------------------------
// UX-PRO-07E-2 — casos NOVOS, acrescentados APÓS os 22 herdados.
//
// O prefixo herdado (858 linhas / 45.438 bytes / SHA-256
// 21c4f686f343bdea9f8dc972dc931edbd77320b912fb93166661af35df889884) permanece
// byte a byte: nenhuma asserção herdada foi editada, removida ou relaxada.
//
// O que estes casos provam: nas OITO superfícies restantes de /admin/financeiro
// (FIN-08, FIN-09, FIN-10, FIN-11, FIN-12, FIN-14, FIN-15 e FIN-16) uma resposta
// 2xx cujo corpo NÃO traz a lista canônica (chave ausente, chave não-array,
// `null` ou corpo ilegível) deixa de ser "nenhum registro" e passa a ser falha
// declarada de leitura; o vazio LEGÍTIMO (chave presente com `[]`) continua
// sendo vazio concluído.
//
// Injeção somente em `window.fetch` da página e somente em GET, pelo auxiliar
// herdado `openFinanceInvalidBody`: servidor, banco, proxy e TODAS as escritas
// permanecem reais e intactos. As capturas são feitas ANTES das asserções e as
// asserções leem o TEXTO renderizado (nunca esperam por um elemento que só
// existe na implementação nova), para que a linha de base reprove rápido, com
// a frase do vazio falso visível no relatório TAP.
// ---------------------------------------------------------------------------

/** Ids da massa sintética criada pelo caso de contrato, usados nas leituras sob demanda. */
let qa07e2ClosureId = '', qa07e2ProvisionId = '', qa07e2ExportId = '', qa07e2ExpenseId = '';

/** Espaço canônico de despesa (contrato + centro de custo + fornecedor), como nos demais gates. */
async function qa07e2ExpenseSpace(label) {
  const contractId = randomUUID(), costCenterId = randomUUID(), supplierId = randomUUID();
  await pool.query(`INSERT INTO crm_contracts (id,proposal_version,title,status,origin,idempotency_key,created_by) VALUES ($1,1,$2,'ativo','manual',$3,'admin')`, [contractId, `Contrato sintético 07E-2 ${label}`, `qa-07e2-contract-${label}-${contractId}`]);
  await pool.query("INSERT INTO fin_cost_centers (id,name,description) VALUES ($1,$2,$3)", [costCenterId, `Centro sintético 07E-2 ${label} ${costCenterId.slice(0,6)}`, `Centro de custo sintético do gate UX-PRO-07E-2 ${label}`]);
  await pool.query("INSERT INTO fin_suppliers (id,name,document_ref,category) VALUES ($1,$2,$3,'material')", [supplierId, `Fornecedor sintético 07E-2 ${label} ${supplierId.slice(0,6)}`, `SYN-07E2-${supplierId.slice(0,8)}`]);
  return { contractId, costCenterId, supplierId };
}

/**
 * Mesma semântica do `settle` herdado (espera a âncora presente nas DUAS
 * implementações e depois as candidatas), com teto de espera menor: mantém a
 * leitura comparável antes/depois sem inflar a linha de base, onde a candidata
 * nova nunca aparece.
 */
async function settle07e2(page, anchor, candidates = [], { extraMs = 700, candidateMs = 10_000 } = {}) {
  let ancoraVisivel = true;
  try {
    await page.locator(anchor).first().waitFor({ timeout: 60_000 });
  } catch {
    ancoraVisivel = false;
  }
  if (ancoraVisivel && candidates.length) {
    await Promise.race(candidates.map(selector => page.locator(selector).first().waitFor({ timeout: candidateMs }))).catch(() => {});
  }
  await page.waitForTimeout(extraMs);
  return ancoraVisivel;
}

/** Abre uma aba pelo testid estável usado também pelo gate herdado do L07. */
async function gotoTab07e2(page, id) {
  await page.locator('[role="tablist"]').waitFor();
  await page.getByTestId(`finance-tab-${id}`).click();
}

test('UX-PRO-07E-2 contrato: as 18 chaves canônicas existem no 200 e o vazio legítimo é chave presente com []', { skip: !RUN }, async () => {
  // Massa sintética pelas PRÓPRIAS APIs financeiras (mesma convenção do caso
  // herdado), necessária para as quatro leituras sob demanda com id real.
  const space = await qa07e2ExpenseSpace('contrato');
  const suffix = randomUUID().slice(0, 8);

  const closure = await api('/api/fin/competence-closures', {
    method: 'POST', cookie: financeCookie,
    body: { competence_date: '2037-01-15', notes: 'Competência sintética criada pelo contrato UX-PRO-07E-2.', totals: { origem: 'interface_sintetica' } },
  });
  assert.equal(closure.status, 201, `fechamento sintético deveria ser 201, veio ${closure.status} ${JSON.stringify(closure.body)}`);
  qa07e2ClosureId = closure.body.closure.id;

  const provision = await api('/api/fin/commission-provisions', {
    method: 'POST', cookie: financeCookie,
    body: { provision_date: '2037-01-15', amount_cents: 100000, notes: 'Provisão sintética criada pelo contrato UX-PRO-07E-2.', idempotency_key: `qa-07e2-commission-${suffix}`, is_auto_paid: false },
  });
  assert.equal(provision.status, 201, `provisão sintética deveria ser 201, veio ${provision.status} ${JSON.stringify(provision.body)}`);
  qa07e2ProvisionId = provision.body.provision.id;

  const exportRow = await api('/api/fin/exports', {
    method: 'POST', cookie: financeCookie,
    body: {
      period_start: '2037-01-01', period_end: '2037-01-31', total_records: 1, total_amount_cents: 100000,
      file_name: `qa-07e2-${suffix}.csv`, filters: { origem: 'interface_sintetica' }, totals: { total_cents: 100000 },
      storage_key: `synthetic/fin14/qa-07e2-${suffix}.csv`, is_accountant_limited: true,
    },
  });
  assert.equal(exportRow.status, 201, `exportação sintética deveria ser 201, veio ${exportRow.status} ${JSON.stringify(exportRow.body)}`);
  qa07e2ExportId = exportRow.body.export.id;

  const expense = await api('/api/fin/expenses', {
    method: 'POST', cookie: financeCookie,
    body: {
      expense_type: 'compra', category: 'material sintético',
      description: 'Compra sintética criada pelo contrato UX-PRO-07E-2 para o histórico.',
      amount_cents: 50000, threshold_cents: 50000, requester_name: 'Solicitante sintético 07E-2',
      contract_id: space.contractId, cost_center_id: space.costCenterId, supplier_id: space.supplierId,
      evidence_file_name: `qa-07e2-${suffix}.json`, evidence_file_url: `synthetic://fin10/qa-07e2-${suffix}.json`,
      evidence_storage_key: `synthetic/fin10/qa-07e2-${suffix}.json`, idempotency_key: `qa-07e2-expense-${suffix}`,
    },
  });
  assert.equal(expense.status, 201, `solicitação sintética deveria ser 201, veio ${expense.status} ${JSON.stringify(expense.body)}`);
  qa07e2ExpenseId = expense.body.expense.id;

  const esperados = [
    ['/api/fin/fiscal-activity-rules', 'rules'],
    ['/api/fin/fiscal-providers', 'providers'],
    ['/api/fin/fiscal-obligations', 'obligations'],
    ['/api/fin/fiscal-documents', 'documents'],
    ['/api/fin/payment-gateways', 'gateways'],
    ['/api/fin/gateway-webhooks', 'webhooks'],
    ['/api/fin/gateway-charges', 'charges'],
    ['/api/fin/competence-closures', 'closures'],
    [`/api/fin/report-versions?closure_id=${qa07e2ClosureId}`, 'versions'],
    ['/api/fin/commission-provisions', 'provisions'],
    [`/api/fin/commission-provision-history?provision_id=${qa07e2ProvisionId}`, 'history'],
    ['/api/fin/cost-imports', 'imports'],
    ['/api/fin/costs', 'costs'],
    ['/api/fin/exports', 'exports'],
    [`/api/fin/export-logs?export_id=${qa07e2ExportId}`, 'logs'],
    ['/api/fin/expenses', 'expenses'],
    [`/api/fin/expense-history?expense_id=${qa07e2ExpenseId}`, 'history'],
    ['/api/fin/management-results', 'results'],
  ];
  let vaziosLegitimos = 0;
  for (const [caminho, chave] of esperados) {
    const resposta = await api(caminho, { cookie: financeCookie });
    assert.equal(resposta.status, 200, `${caminho} deveria responder 200, veio ${resposta.status}`);
    assert.ok(Array.isArray(resposta.body?.[chave]),
      `${caminho} precisa devolver a lista canônica "${chave}": é isso que autoriza a tela a exigir a chave em vez de aceitar [] como ausência`);
    if (resposta.body[chave].length === 0) vaziosLegitimos += 1;
  }
  assert.ok(vaziosLegitimos >= 1,
    'ao menos um endpoint precisa estar legitimamente vazio, para provar que ausência real é chave presente com [] e não chave ausente');
  // As quatro leituras sob demanda foram exercitadas com registro real criado
  // por este caso; as demais áreas não receberam massa e seguem vazias.
  const versoes = await api(`/api/fin/report-versions?closure_id=${qa07e2ClosureId}`, { cookie: financeCookie });
  assert.ok(versoes.body.versions.length >= 1, 'o fechamento sintético preserva ao menos uma versão de relatório');
});

test('UX-PRO-07E-2 browser: FIN-15 — 2xx sem "closures" declara falha, não "Nenhuma competência encontrada."', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [{ match: '/api/fin/competence-closures', body: { synthetic: true, note: 'corpo 2xx sem a lista canônica' } }],
    });
    await gotoTab07e2(page, 'closures');
    await settle07e2(page, '[data-testid="finance-closure-workspace"]', ['[data-testid="fin15-read-error"]', '[data-testid="fin15-empty"]']);
    await capture(page, '07e2-fechamento-corpo-invalido');

    const texto = await textOf(page, '[data-testid="finance-closure-workspace"]');
    assert.match(texto, /invalid_finance_response/, `o corpo 2xx sem "closures" precisa ser declarado; texto: "${texto.slice(0, 300)}"`);
    assert.match(texto, /Não foi possível/i, 'a frase herdada continua em português');
    assert.match(texto, /HTTP 200/, 'o status real aparece: um 2xx inválido não pode virar status 0');
    assert.doesNotMatch(texto, /Nenhuma competência encontrada\./, 'competência não pode ser afirmada como ausente sobre resposta ilegível');
    assert.equal(await page.locator('[data-testid="fin15-empty"]').count(), 0);
    assert.equal(await page.locator('[data-testid="fin15-read-error"]').count(), 1);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-2 browser: FIN-16 — 2xx sem "provisions" declara falha, não "Nenhuma provisão encontrada."', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [{ match: '/api/fin/commission-provisions', body: { provisions: 'não é uma lista' } }],
    });
    await gotoTab07e2(page, 'commissions');
    await settle07e2(page, '[data-testid="finance-commission-workspace"]', ['[data-testid="fin16-read-error"]', '[data-testid="fin16-empty"]']);
    await capture(page, '07e2-comissoes-corpo-invalido');

    const texto = await textOf(page, '[data-testid="finance-commission-workspace"]');
    assert.match(texto, /invalid_finance_response/, `o corpo 2xx com "provisions" não-array precisa ser declarado; texto: "${texto.slice(0, 300)}"`);
    assert.match(texto, /Não foi possível/i);
    assert.doesNotMatch(texto, /Nenhuma provisão encontrada\./, 'provisão não pode ser afirmada como ausente sobre resposta ilegível');
    assert.equal(await page.locator('[data-testid="fin16-empty"]').count(), 0);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-2 browser: FIN-14 — 2xx sem "exports" declara falha, não "Nenhuma exportação encontrada."', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [{ match: '/api/fin/exports', body: '<html>resposta que não é JSON</html>' }],
    });
    await gotoTab07e2(page, 'exports');
    await settle07e2(page, '[data-testid="finance-export-workspace"]', ['[data-testid="fin14-read-error"]', '[data-testid="fin14-empty"]']);
    await capture(page, '07e2-exportacoes-corpo-invalido');

    const texto = await textOf(page, '[data-testid="finance-export-workspace"]');
    assert.match(texto, /invalid_finance_response/, `o corpo 2xx ilegível precisa ser declarado; texto: "${texto.slice(0, 300)}"`);
    assert.doesNotMatch(texto, /Nenhuma exportação encontrada\./, 'exportação não pode ser afirmada como ausente sobre resposta ilegível');
    assert.equal(await page.locator('[data-testid="fin14-empty"]').count(), 0);
    assert.equal(await page.locator('[data-testid="fin14-read-error"]').count(), 1);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-2 browser: FIN-10 — 2xx sem "expenses" declara falha, não "Nenhuma solicitação."', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [{ match: '/api/fin/expenses', body: { expenses: null } }],
    });
    await gotoTab07e2(page, 'expenses');
    await settle07e2(page, '[data-testid="fin10-policy"]', ['[data-testid="fin10-error"]', '[data-testid="fin10-empty"]']);
    await capture(page, '07e2-despesas-corpo-invalido');

    const erro = await textOf(page, '[data-testid="fin10-error"]');
    assert.match(erro, /invalid_finance_response/, `o corpo 2xx sem "expenses" precisa ser declarado; texto: "${erro.slice(0, 300)}"`);
    assert.match(erro, /Não foi possível ler as despesas/i, 'o canal herdado de erro continua declarando a leitura');
    const texto = await textOf(page, '[data-testid="fin10-expenses"]');
    assert.doesNotMatch(texto, /Nenhuma solicitação\./, 'solicitação não pode ser afirmada como ausente sobre resposta ilegível');
    assert.doesNotMatch(texto, /Nenhum resultado para a busca aplicada\./);
    assert.equal(await page.locator('[data-testid="fin10-empty"]').count(), 0);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-2 browser: FIN-09 — 2xx sem "results" declara falha, não "Nenhum resultado registrado."', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [{ match: '/api/fin/management-results', body: { results: { id: 'não é lista' } } }],
    });
    await gotoTab07e2(page, 'results');
    await settle07e2(page, '[data-testid="fin09-results"]', ['[data-testid="fin09-error"]', '[data-testid="fin09-list"]']);
    await capture(page, '07e2-resultado-gerencial-corpo-invalido');

    const erro = await textOf(page, '[data-testid="fin09-error"]');
    assert.match(erro, /invalid_finance_response/, `o corpo 2xx com "results" não-array precisa ser declarado; texto: "${erro.slice(0, 300)}"`);
    const texto = await textOf(page, '[data-testid="fin09-results"]');
    assert.doesNotMatch(texto, /Nenhum resultado registrado\./, 'resultado não pode ser afirmado como ausente sobre resposta ilegível');
    assert.equal(await page.locator('[data-testid="fin09-list"] li').count(), 0, 'falha de leitura não vira lista vazia (asserção herdada do L07 preservada)');
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-2 browser: leituras sob demanda — versões, histórico de comissão, trilha e histórico de despesa declaram falha em vez de vazio', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [
        { match: '/api/fin/report-versions', body: { note: 'sem a lista de versões' } },
        { match: '/api/fin/commission-provision-history', body: { history: 'não é uma lista' } },
        { match: '/api/fin/export-logs', body: { logs: {} } },
        { match: '/api/fin/expense-history', body: { note: 'sem histórico' } },
      ],
    });

    // FIN-15 versões preservadas (sob demanda)
    await page.locator('[role="tablist"]').waitFor();
    await page.getByTestId('finance-tab-closures').click();
    await settle07e2(page, '[data-testid="finance-closure-workspace"]', ['[data-testid="fin15-select"]']);
    await page.selectOption('[data-testid="fin15-select"]', qa07e2ClosureId);
    await page.getByTestId('fin15-versions').click();
    await page.waitForTimeout(1_200);
    await capture(page, '07e2-fechamento-versoes-corpo-invalido');
    const fechamento = await textOf(page, '[data-testid="finance-closure-workspace"]');
    assert.match(fechamento, /invalid_finance_response/, `versões sob demanda precisam declarar o corpo inválido; texto: "${fechamento.slice(0, 300)}"`);
    assert.equal(await page.locator('[data-testid="fin15-version-list"] li').count(), 0, 'nenhuma versão pode ser afirmada sobre resposta ilegível');

    // FIN-16 histórico auditável (sob demanda)
    await page.getByTestId('finance-tab-commissions').click();
    await settle07e2(page, '[data-testid="finance-commission-workspace"]', ['[data-testid="fin16-select"]']);
    await page.selectOption('[data-testid="fin16-select"]', qa07e2ProvisionId);
    await page.getByTestId('fin16-history').click();
    await page.waitForTimeout(1_200);
    await capture(page, '07e2-comissoes-historico-corpo-invalido');
    const comissoes = await textOf(page, '[data-testid="finance-commission-workspace"]');
    assert.match(comissoes, /invalid_finance_response/, `histórico de comissão sob demanda precisa declarar o corpo inválido; texto: "${comissoes.slice(0, 300)}"`);
    assert.equal(await page.locator('[data-testid="fin16-history-list"] li').count(), 0);

    // FIN-14 trilha da exportação (sob demanda)
    await page.getByTestId('finance-tab-exports').click();
    await settle07e2(page, '[data-testid="finance-export-workspace"]', ['[data-testid="fin14-select"]']);
    await page.selectOption('[data-testid="fin14-select"]', qa07e2ExportId);
    await page.getByTestId('fin14-logs').click();
    await page.waitForTimeout(1_200);
    await capture(page, '07e2-exportacoes-trilha-corpo-invalido');
    const exportacoes = await textOf(page, '[data-testid="finance-export-workspace"]');
    assert.match(exportacoes, /invalid_finance_response/, `trilha sob demanda precisa declarar o corpo inválido; texto: "${exportacoes.slice(0, 300)}"`);
    assert.equal(await page.locator('[data-testid="fin14-log-list"] li').count(), 0);

    // FIN-10 histórico da solicitação (sob demanda)
    await page.getByTestId('finance-tab-expenses').click();
    await settle07e2(page, '[data-testid="fin10-policy"]', [`[data-testid="fin10-history-toggle-${qa07e2ExpenseId}"]`]);
    await page.getByTestId(`fin10-history-toggle-${qa07e2ExpenseId}`).click();
    await page.waitForTimeout(1_200);
    await capture(page, '07e2-despesas-historico-corpo-invalido');
    const despesas = await textOf(page, '[data-testid="fin10-expenses"]');
    assert.match(despesas, /invalid_finance_response/, `histórico de despesa sob demanda precisa declarar o corpo inválido; texto: "${despesas.slice(0, 300)}"`);
    assert.doesNotMatch(despesas, /Sem eventos\./, 'histórico não pode ser afirmado vazio sobre resposta ilegível');
    assert.equal(await page.locator(`[data-testid="fin10-history-error-${qa07e2ExpenseId}"]`).count(), 1);

    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-2 browser: FIN-11 — grupo fiscal com 2xx sem "rules" declara indisponibilidade nas quatro listas', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [{ match: '/api/fin/fiscal-activity-rules', body: { synthetic: true } }],
    });
    await gotoTab07e2(page, 'fiscal');
    await settle07e2(page, '[data-testid="fin11-fiscal"]', ['[data-testid="fin11-error"]', '[data-testid="fin11-rules-table"]']);
    await capture(page, '07e2-fiscal-corpo-invalido');

    const texto = await textOf(page, '[data-testid="fin11-fiscal"]');
    assert.match(texto, /invalid_finance_response/, `o corpo 2xx sem "rules" precisa ser declarado; texto: "${texto.slice(0, 300)}"`);
    assert.match(texto, /não confundir com ausência/i, 'a lista declara indisponibilidade, não ausência');
    assert.doesNotMatch(texto, /Nenhuma regra cadastrada\./, 'regra não pode ser afirmada como ausente');
    assert.doesNotMatch(texto, /Nenhum provedor\./, 'provedor não pode ser afirmado como ausente: a leitura do grupo não foi confirmada');
    assert.doesNotMatch(texto, /Nenhuma obrigação\./, 'obrigação não pode ser afirmada como ausente');
    assert.doesNotMatch(texto, /Nenhum documento\./, 'documento não pode ser afirmado como ausente');
    assert.equal(await page.locator('[data-testid="fin11-rules-unavailable"]').count(), 1);
    assert.equal(await page.locator('[data-testid="fin11-providers-unavailable"]').count(), 1);
    assert.equal(await page.locator('[data-testid="fin11-obligations-unavailable"]').count(), 1);
    assert.equal(await page.locator('[data-testid="fin11-documents-unavailable"]').count(), 1);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-2 browser: FIN-12 — grupo gateway com 2xx sem "gateways" declara indisponibilidade nas três listas', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [{ match: '/api/fin/payment-gateways', body: { note: 'corpo sem a lista canônica' } }],
    });
    await gotoTab07e2(page, 'gateway');
    await settle07e2(page, '[data-testid="fin12-gateway"]', ['[data-testid="fin12-error"]', '[data-testid="fin12-gateways-table"]']);
    await capture(page, '07e2-gateway-corpo-invalido');

    const texto = await textOf(page, '[data-testid="fin12-gateway"]');
    assert.match(texto, /invalid_finance_response/, `o corpo 2xx sem "gateways" precisa ser declarado; texto: "${texto.slice(0, 300)}"`);
    assert.match(texto, /não confundir com ausência/i);
    assert.doesNotMatch(texto, /Nenhum gateway cadastrado\./, 'gateway não pode ser afirmado como ausente');
    assert.doesNotMatch(texto, /Nenhuma cobrança\./, 'cobrança não pode ser afirmada como ausente: a leitura do grupo não foi confirmada');
    assert.doesNotMatch(texto, /Nenhum webhook recebido\./, 'webhook não pode ser afirmado como ausente');
    assert.equal(await page.locator('[data-testid="fin12-gateways-unavailable"]').count(), 1);
    assert.equal(await page.locator('[data-testid="fin12-charges-unavailable"]').count(), 1);
    assert.equal(await page.locator('[data-testid="fin12-webhooks-unavailable"]').count(), 1);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-2 browser: FIN-08 — grupo de custos com 2xx sem "imports" declara indisponibilidade nas duas listas', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [{ match: '/api/fin/cost-imports', body: { imports: 'não é uma lista' } }],
    });
    await gotoTab07e2(page, 'costs');
    await settle07e2(page, '[data-testid="fin08-costs"]', ['[data-testid="fin08-error"]', '[data-testid="fin08-imports"]']);
    await capture(page, '07e2-custos-corpo-invalido');

    const texto = await textOf(page, '[data-testid="fin08-costs"]');
    assert.match(texto, /invalid_finance_response/, `o corpo 2xx com "imports" não-array precisa ser declarado; texto: "${texto.slice(0, 300)}"`);
    assert.match(texto, /não confundir com ausência/i);
    assert.doesNotMatch(texto, /Nenhuma importação\./, 'importação não pode ser afirmada como ausente');
    assert.doesNotMatch(texto, /Nenhum custo\./, 'custo não pode ser afirmado como ausente: a leitura do grupo não foi confirmada');
    assert.equal(await page.locator('[data-testid="fin08-imports-unavailable"]').count(), 1);
    assert.equal(await page.locator('[data-testid="fin08-costs-unavailable"]').count(), 1);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-2 browser: vazio legítimo preservado — chave presente com [] continua vazio concluído nas oito superfícies', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const vazio = chave => ({ [chave]: [] });
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
      rules: [
        { match: '/api/fin/fiscal-activity-rules', body: vazio('rules') },
        { match: '/api/fin/fiscal-providers', body: vazio('providers') },
        { match: '/api/fin/fiscal-obligations', body: vazio('obligations') },
        { match: '/api/fin/fiscal-documents', body: vazio('documents') },
        { match: '/api/fin/payment-gateways', body: vazio('gateways') },
        { match: '/api/fin/gateway-webhooks', body: vazio('webhooks') },
        { match: '/api/fin/gateway-charges', body: vazio('charges') },
        { match: '/api/fin/cost-imports', body: vazio('imports') },
        { match: '/api/fin/costs', body: vazio('costs') },
        { match: '/api/fin/competence-closures', body: vazio('closures') },
        { match: '/api/fin/commission-provisions', body: vazio('provisions') },
        { match: '/api/fin/exports', body: vazio('exports') },
        { match: '/api/fin/expenses', body: vazio('expenses') },
        { match: '/api/fin/management-results', body: vazio('results') },
      ],
    });

    const esperas = [
      ['fiscal', '[data-testid="fin11-fiscal"]', /Nenhuma regra cadastrada\.[\s\S]*Nenhum provedor\.[\s\S]*Nenhuma obrigação\.[\s\S]*Nenhum documento\./],
      ['gateway', '[data-testid="fin12-gateway"]', /Nenhum gateway cadastrado\.[\s\S]*Nenhuma cobrança\.[\s\S]*Nenhum webhook recebido\./],
      ['costs', '[data-testid="fin08-costs"]', /Nenhuma importação\.[\s\S]*Nenhum custo\./],
      ['closures', '[data-testid="finance-closure-workspace"]', /Nenhuma competência encontrada\./],
      ['commissions', '[data-testid="finance-commission-workspace"]', /Nenhuma provisão encontrada\./],
      ['exports', '[data-testid="finance-export-workspace"]', /Nenhuma exportação encontrada\./],
      ['expenses', '[data-testid="fin10-expenses"]', /Nenhuma solicitação\./],
      ['results', '[data-testid="fin09-results"]', /Nenhum resultado registrado\./],
    ];
    for (const [aba, superficie, esperado] of esperas) {
      await gotoTab07e2(page, aba);
      await settle07e2(page, superficie, [], { extraMs: 900 });
      await capture(page, `07e2-vazio-legitimo-${aba}`);
      const texto = await textOf(page, superficie);
      assert.doesNotMatch(texto, /invalid_finance_response/, `chave presente com [] é vazio concluído, nunca falha (${aba})`);
      assert.match(texto, esperado, `o vazio legítimo herdado continua sendo declarado (${aba}); texto: "${texto.slice(0, 240)}"`);
    }
    assert.equal(await page.locator('[data-testid$="-unavailable"]').count(), 0,
      'nenhum marcador de indisponibilidade pode aparecer quando a leitura foi confirmada');
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07E-2 browser: a falha declarada do grupo fiscal não produz transbordo em 1440/768/390/320 e as capturas ficam registradas', { skip: !RUN }, async () => {
  const medicoes = [];
  for (const [width, height, nome] of [[1440, 900, '1440'], [768, 1024, '768'], [390, 844, '390'], [320, 844, '320']]) {
    // Um browser por largura, pela mesma limitação do --single-process.
    const browser = await launchBrowser();
    try {
      const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
        width, height,
        rules: [{ match: '/api/fin/fiscal-activity-rules', body: { rules: 'não é uma lista' } }],
      });
      await gotoTab07e2(page, 'fiscal');
      await settle07e2(page, '[data-testid="fin11-fiscal"]', ['[data-testid="fin11-error"]', '[data-testid="fin11-rules-unavailable"]']);
      await capture(page, `07e2-falha-declarada-${nome}`);

      const transbordo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(transbordo <= 1, `transbordo de ${transbordo}px em ${width}px com a falha declarada`);
      const texto = await textOf(page, '[data-testid="fin11-fiscal"]');
      assert.match(texto, /invalid_finance_response/, `a falha precisa estar declarada em ${width}px; texto: "${texto.slice(0, 240)}"`);
      assert.match(texto, /não confundir com ausência/i, `o marcador de indisponibilidade precisa existir em ${width}px`);
      const alturaRepetir = await page.locator('[data-testid="fin11-retry"]').first().evaluate(
        node => Math.round(node.getBoundingClientRect().height)).catch(() => null);
      // O alvo de 32px é convenção dos componentes novos; o botão legado do
      // FIN-11 mede 29px em 1440px e isso fica registrado como observação no
      // resumo e no relatório — fora do escopo desta fatia (leitura honesta).
      // A prova exigida aqui é que o botão de repetir exista e seja acionável.
      assert.ok(alturaRepetir !== null && alturaRepetir > 0, `o botão de repetir precisa existir em ${width}px`);
      const elementoAtivo = await page.evaluate(() => {
        const ativo = document.activeElement;
        return ativo ? { tag: ativo.tagName.toLowerCase(), text: (ativo.textContent || '').trim().slice(0, 40) } : null;
      });
      medicoes.push({ width, height, nome, transbordo, alturaRepetir, elementoAtivo });
      await context.close();
    } finally { await browser.close(); }
  }

  if (evidenceDir) {
    const { writeFile } = await import('node:fs/promises');
    const resumo = {
      stage: 'ux-pro-07-financeiro',
      generatedBy: 'gate PostgreSQL descartável + HTTP real + Chromium (scripts/qa-ux-pro-07e2-postgres.mjs)',
      notes: [
        'UX-PRO-07E-2: falha declarada por resposta 2xx sem a lista canônica nas oito superfícies restantes de /admin/financeiro.',
        'Tema dia; papel financeiro; massa sintética criada pelas próprias APIs financeiras.',
        'elementoAtivoOnFailure é medição informativa do foco no momento da falha; NÃO é percurso de teclado nem primeiro foco visível. O percurso do tablist continua provado pelos casos herdados.',
        'Arquivo próprio (não sobrescreve resumo.json da 07E-1); o inventário agrega por rota.',
        'O tema noturno não foi medido nesta fatia: contraste é achado transversal (E8) fora do escopo.',
      ],
      entries: medicoes.map(item => ({
        stage: 'ux-pro-07-financeiro',
        route: '/admin/financeiro',
        role: 'financeiro',
        viewport: `${item.width}x${item.height}`,
        theme: 'day',
        screenshot: `${evidenceDir}/07e2-falha-declarada-${item.nome}.png`,
        problems: [],
        state: 'falha_declarada_corpo_2xx_sem_lista_grupo_fiscal',
        transbordoDocumentoPx: item.transbordo,
        alturaBotaoRepetirPx: item.alturaRepetir,
        elementoAtivoOnFailure: item.elementoAtivo,
      })),
    };
    await writeFile(path.join(evidenceDir, '07e2-resumo.json'), `${JSON.stringify(resumo, null, 2)}\n`, 'utf8');
  }
});

// ---------------------------------------------------------------------------
// UX-PRO-07F-1 — casos NOVOS, acrescentados APÓS os 34 herdados.
//
// O prefixo herdado (1.340 linhas / 76.468 bytes / SHA-256
// e9fc84369f227c5308e240ca92dc21262c14c59c5648689457157d820e98c487) permanece
// byte a byte: nenhuma asserção herdada foi editada, removida ou relaxada.
//
// O que estes casos provam: as 20 exibições de data/hora de /admin/financeiro
// deixam de sair em ISO cru — `DD/MM/AAAA` nas datas de calendário, `MM/AAAA`
// na competência do fechamento e `DD/MM/AAAA HH:mm UTC` (fuso DECLARADO) nos
// três carimbos timestamptz — sem que nenhum payload, URL, método, permissão,
// idempotência ou auditoria mude. O primeiro caso existe justamente para provar
// que o CONTRATO cru continua ISO: é ele que autoriza a tela a formatar só a
// exibição.
//
// Injeção de falha somente em `window.fetch` da página e somente em GET, pelo
// auxiliar herdado `openFinanceInvalidBody`: servidor, banco, proxy e TODAS as
// escritas permanecem reais e intactos. As capturas são feitas ANTES das
// asserções e as asserções leem o TEXTO renderizado, para que a linha de base
// reprove rápido, com o ISO cru visível no relatório TAP.
// ---------------------------------------------------------------------------

/** Ids da massa sintética criada pelo caso de contrato, usados pelos demais. */
const qa07f1 = { ruleId: '', budgetId: '', closureId: '', provisionId: '', exportId: '', receivableId: '' };

/** Cria um registro sintético pelas PRÓPRIAS APIs da rota, com erro visível. */
async function qa07f1Create(rotulo, caminho, opcoes, esperado = 201) {
  const resposta = await api(caminho, opcoes);
  assert.equal(resposta.status, esperado,
    `${rotulo} deveria responder ${esperado}, veio ${resposta.status} ${JSON.stringify(resposta.body)}`);
  return resposta.body;
}

/**
 * Texto das opções de um <select> NATIVO. O Playwright considera `<option>`
 * oculto, então a espera é por EXISTÊNCIA (`waitForFunction`), nunca por
 * visibilidade; se a opção esperada não chegar, o texto atual volta mesmo assim
 * para que a reprovação mostre o que a tela exibiu.
 */
async function qa07f1OptionsText(page, testId, esperado) {
  await page.waitForFunction(({ id, regex }) => {
    const select = document.querySelector(`[data-testid="${id}"]`);
    if (!select) return false;
    return Array.from(select.options).some(option => new RegExp(regex).test(option.textContent || ''));
  }, { id: testId, regex: esperado }, { timeout: 45_000 }).catch(() => {});
  return page.evaluate(id => {
    const select = document.querySelector(`[data-testid="${id}"]`);
    return select
      ? Array.from(select.options).map(option => (option.textContent || '').trim()).join(' | ')
      : `[superficie ausente: ${id} nao renderizado no momento da leitura]`;
  }, testId);
}

/** Espera o `<select>` nativo ter a opção com o valor indicado (id da massa). */
async function qa07f1WaitOptionValue(page, testId, valor) {
  await page.waitForFunction(({ id, value }) => {
    const select = document.querySelector(`[data-testid="${id}"]`);
    return Boolean(select) && Array.from(select.options).some(option => option.value === value);
  }, { id: testId, value: valor }, { timeout: 45_000 });
}

/**
 * Abre /admin/financeiro em contexto com FUSO DECLARADO, para provar que o
 * carimbo exibido não depende da máquina de quem opera. Não substitui nem edita
 * o auxiliar herdado `openFinanceInvalidBody`: repete a mesma configuração de
 * cookie/página e acrescenta `timezoneId`.
 */
async function qa07f1OpenTimezone(browser, cookie, timezoneId) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId });
  const separator = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(90_000);
  await page.goto(`${baseUrl}/admin/financeiro`, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

test('UX-PRO-07F-1 contrato: os 10 endpoints com data continuam devolvendo ISO cru no JSON e o payload não muda', { skip: !RUN, timeout: 180_000 }, async () => {
  // Massa sintética pelas PRÓPRIAS APIs financeiras, com data/chave próprias
  // para não colidir com as unicidades já usadas pelos casos herdados
  // (competence-closures por competência, cashflow por competência+tipo,
  // fin_exports por storage_key).
  const suffix = randomUUID().slice(0, 8);
  const ano = '2037';

  const regra = await qa07f1Create('regra de recorrência sintética', '/api/fin/recurrence-rules', {
    method: 'POST', cookie: financeCookie,
    body: { contract_id: contractId, recurrence_type: 'mensal', start_date: `${ano}-02-03`, amount_cents: 150000, recurrence_id: `qa-07f1-rec-${suffix}` },
  });
  qa07f1.ruleId = regra.rule.id;

  const orcamento = await qa07f1Create('orçamento sintético', '/api/fin/budgets', {
    method: 'POST', cookie: financeCookie,
    body: {
      idempotency_key: `qa-07f1-budget-${suffix}`,
      title: `Orçamento sintético 07F-1 ${suffix}`,
      description: 'Orçamento gerencial sintético do gate UX-PRO-07F-1 para provar data de período.',
      premises: 'Premissas sintéticas documentadas; estimativa sem promessa de resultado financeiro.',
      period_start: `${ano}-02-01`, period_end: `${ano}-02-28`,
      total_revenue_cents: 500000, total_cost_cents: 300000,
    },
  });
  qa07f1.budgetId = orcamento.budget.id;

  const provisao = await qa07f1Create('provisão sintética', '/api/fin/commission-provisions', {
    method: 'POST', cookie: financeCookie,
    body: { provision_date: `${ano}-02-15`, amount_cents: 250000, notes: 'Provisão sintética criada pelo contrato UX-PRO-07F-1.', idempotency_key: `qa-07f1-commission-${suffix}`, is_auto_paid: false },
  });
  qa07f1.provisionId = provisao.provision.id;
  // Revisão humana: só ela preenche `reviewed_at`, o carimbo timestamptz do FIN-16.
  await qa07f1Create('início de revisão da provisão', '/api/fin/commission-provisions', {
    method: 'PATCH', cookie: financeCookie,
    body: {
      id: qa07f1.provisionId, status: 'em_revisao',
      reason: 'Início da revisão humana pela massa sintética do gate UX-PRO-07F-1.',
      revision_reason: 'Conferência sintética da base de cálculo da comissão.',
    },
  }, 200);

  const exportacao = await qa07f1Create('exportação sintética', '/api/fin/exports', {
    method: 'POST', cookie: financeCookie,
    body: {
      period_start: `${ano}-02-01`, period_end: `${ano}-02-28`, total_records: 3, total_amount_cents: 250000,
      file_name: `qa-07f1-${suffix}.csv`, filters: { origem: 'interface_sintetica' }, totals: { total_cents: 250000 },
      storage_key: `synthetic/fin14/qa-07f1-${suffix}.csv`, is_accountant_limited: true,
    },
  });
  qa07f1.exportId = exportacao.export.id;
  // Transição real: é ela que grava a trilha (fin_export_logs) com o carimbo.
  await qa07f1Create('início da geração da exportação', '/api/fin/exports', {
    method: 'PATCH', cookie: financeCookie, body: { id: qa07f1.exportId, status: 'gerando' },
  }, 200);

  const recebivel = await qa07f1Create('recebível sintético do aging', '/api/fin/receivables', {
    method: 'POST', cookie: financeCookie,
    body: { client_account_id: accountId, contract_id: contractId, competence_date: `${ano}-02-01`, due_date: `${ano}-02-10`, amount_cents: 42000, description: 'Recebível sintético do aging do gate UX-PRO-07F-1.' },
  });
  qa07f1.receivableId = recebivel.receivable.id;
  await qa07f1Create('snapshot de fluxo de caixa', '/api/fin/cashflow-snapshots', {
    method: 'POST', cookie: financeCookie,
    body: { competence_date: `${ano}-02-01`, cashflow_type: 'realizado', total_receivable_cents: 120000, total_payable_cents: 40000, vencidos_cents: 15000, proximos_pagamentos_cents: 55000, notes: 'Snapshot realizado sintético do gate UX-PRO-07F-1.' },
  });
  await qa07f1Create('aging sintético', '/api/fin/aging-receivables', {
    method: 'POST', cookie: financeCookie,
    body: { receivable_id: qa07f1.receivableId, competence_date: `${ano}-02-01`, due_date: `${ano}-02-10`, amount_cents: 42000 },
  });

  const importacao = await qa07f1Create('importação sintética de custos', '/api/fin/cost-imports', {
    method: 'POST', cookie: financeCookie,
    body: { source: 'pessoal', file_name: `qa-07f1-${suffix}.csv`, file_url: `local://synthetic/fin08/qa-07f1-${suffix}.csv`, storage_key: `qa-07f1-${suffix}`, competence_date: `${ano}-02-01`, total_costs_cents: 120000, total_records: 1 },
  });
  assert.ok(importacao.import?.id, 'a importação sintética precisa devolver o registro criado');
  await qa07f1Create('custo rateado sintético', '/api/fin/costs', {
    method: 'POST', cookie: financeCookie,
    body: {
      client_account_id: accountId, contract_id: contractId, cost_source: 'pessoal', competence_date: `${ano}-02-01`,
      source_amount_cents: 120000, description: 'Custo sintético do gate UX-PRO-07F-1 para a tabela de rateio.',
      rateio_rule: 'Rateio sintético integral documentado pelo gate UX-PRO-07F-1.', rateio_percent: 100,
      source_material: `QA-07F1-${suffix}`,
    },
  });

  // `contract_id` é OMITIDO de propósito: o FIN-09 valida contra `crm_contracts`,
  // e o fixture contratual deste gate vive em `client_contracts` (campo opcional).
  await qa07f1Create('resultado gerencial sintético', '/api/fin/management-results', {
    method: 'POST', cookie: financeCookie,
    body: {
      client_account_id: accountId, competence_date: `${ano}-02-01`,
      revenue_received_cents: 90000, costs_cents: 45000, is_complete: false,
      incomplete_reason: 'Faturamento sintético ainda aguarda conferência do período.',
    },
  });

  const extrato = await qa07f1Create('extrato bancário sintético', '/api/fin/bank-statements', {
    method: 'POST', cookie: financeCookie,
    body: { source: 'importacao', file_name: `qa-07f1-${suffix}.csv`, file_url: `/synthetic/fin05/qa-07f1-${suffix}.csv`, storage_key: `fin05-07f1-${suffix}`, import_date: `${ano}-02-05` },
  });
  await qa07f1Create('transação bancária sintética', '/api/fin/bank-transactions', {
    method: 'POST', cookie: financeCookie,
    body: { statement_id: extrato.statement.id, transaction_date: `${ano}-02-05`, amount_cents: 32000, description: 'Transação sintética do gate UX-PRO-07F-1.', bank_ref: `FIN05-07F1-${suffix}` },
  });

  // Chave de idempotência EXISTENTE do contrato do f03 (nenhuma inventada).
  await qa07f1Create('relatório f03 sintético', '/api/admin/finance/f03/reports', {
    method: 'POST', cookie: financeCookie,
    body: { account_id: accountId, period_start: `${ano}-02-01`, period_end: `${ano}-02-28` },
    headers: { 'Idempotency-Key': `qa-07f1-report-${suffix}` },
  });

  // O fechamento vem por ÚLTIMO e em OUTRA competência: a migração 137 bloqueia
  // lançamentos no mês fechado (`fin_competence_closed`), então fechar 02/2037
  // antes da massa impediria o próprio recebível desta fatia.
  const fechamento = await qa07f1Create('fechamento sintético', '/api/fin/competence-closures', {
    method: 'POST', cookie: financeCookie,
    body: { competence_date: `${ano}-04-15`, notes: 'Competência sintética criada pelo contrato UX-PRO-07F-1.', totals: { origem: 'interface_sintetica' } },
  });
  qa07f1.closureId = fechamento.closure.id;

  // Contrato CRU: os 10 endpoints com data seguem devolvendo ISO no JSON. É a
  // prova de que a formatação é só de exibição e nada mudou no payload.
  const brutos = [
    ['/api/fin/recurrence-rules', 'rules', 'start_date'],
    ['/api/fin/budgets', 'budgets', 'period_start'],
    ['/api/fin/competence-closures', 'closures', 'competence_date'],
    ['/api/fin/commission-provisions', 'provisions', 'provision_date'],
    ['/api/fin/exports', 'exports', 'period_start'],
    ['/api/fin/cashflow-snapshots', 'snapshots', 'competence_date'],
    ['/api/fin/cost-imports', 'imports', 'competence_date'],
    ['/api/fin/management-results', 'results', 'competence_date'],
    ['/api/fin/bank-transactions', 'transactions', 'transaction_date'],
    ['/api/admin/finance/f03/reports', 'reports', 'period_start'],
  ];
  for (const [caminho, chave, campo] of brutos) {
    const resposta = await api(caminho, { cookie: financeCookie });
    assert.equal(resposta.status, 200, `${caminho} deveria responder 200, veio ${resposta.status}`);
    const lista = resposta.body?.[chave];
    assert.ok(Array.isArray(lista), `${caminho} precisa devolver a lista canônica "${chave}"`);
    assert.ok(lista.length > 0, `${caminho} precisa ter ao menos a massa sintética desta fatia`);
    const alvo = lista.find(item => item && item[campo]) || lista[0];
    assert.match(String(alvo[campo]), /^\d{4}-\d{2}-\d{2}/,
      `${caminho}.${campo} precisa continuar ISO cru no JSON; veio "${String(alvo[campo])}"`);
  }
});

test('UX-PRO-07F-1 browser: FIN-15 mostra a competência em MM/AAAA na opção, no detalhe e no aviso do POST', { skip: !RUN, timeout: 120_000 }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, { rules: [] });
    await gotoTab07e2(page, 'closures');
    await settle07e2(page, '[data-testid="finance-closure-workspace"]', ['[data-testid="fin15-select"]']);

    const opcoes = await qa07f1OptionsText(page, 'fin15-select', '04/2037');
    await capture(page, '07f1-fin15-competencia-opcao');
    assert.match(opcoes, /04\/2037/, `a opção do FIN-15 precisa trazer MM/AAAA; opções: "${opcoes}"`);
    assert.doesNotMatch(opcoes, /2037-04/, `o ISO cru não pode mais aparecer no FIN-15; opções: "${opcoes}"`);

    await qa07f1WaitOptionValue(page, 'fin15-select', qa07f1.closureId);
    await page.selectOption('[data-testid="fin15-select"]', qa07f1.closureId);
    await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="fin15-detail"]')));
    const detalhe = await textOf(page, '[data-testid="fin15-detail"]');
    await capture(page, '07f1-fin15-competencia-detalhe');
    assert.match(detalhe, /04\/2037/, `o detalhe do FIN-15 precisa trazer MM/AAAA; texto: "${detalhe.slice(0, 200)}"`);
    assert.doesNotMatch(detalhe, /2037-04/, `o detalhe do FIN-15 não pode trazer ISO cru; texto: "${detalhe.slice(0, 200)}"`);

    // Aviso do POST (terceira exibição do FIN-15): competência própria, sem
    // colidir com a unicidade de `competence_date` já usada pelos casos herdados.
    await page.getByTestId('fin15-date').fill('2037-03-15');
    await page.getByTestId('fin15-notes').fill('Fechamento sintético do gate UX-PRO-07F-1 para o aviso de competência.');
    await page.getByTestId('fin15-create').click();
    await page.waitForFunction(() => (document.querySelector('[data-testid="fin15-notice"]')?.textContent || '').length > 0);
    const aviso = await textOf(page, '[data-testid="fin15-notice"]');
    await capture(page, '07f1-fin15-competencia-aviso');
    assert.match(aviso, /03\/2037/, `o aviso do POST do FIN-15 precisa trazer MM/AAAA; texto: "${aviso.slice(0, 200)}"`);
    assert.doesNotMatch(aviso, /2037-03/, `o aviso do FIN-15 não pode trazer ISO cru; texto: "${aviso.slice(0, 200)}"`);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07F-1 browser: FIN-16 traz a provisão em pt-BR e o carimbo da revisão com fuso declarado (UTC)', { skip: !RUN, timeout: 120_000 }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, { rules: [] });
    await gotoTab07e2(page, 'commissions');
    await settle07e2(page, '[data-testid="finance-commission-workspace"]', ['[data-testid="fin16-select"]']);

    const opcoes = await qa07f1OptionsText(page, 'fin16-select', '15/02/2037');
    await capture(page, '07f1-fin16-provisao-opcao');
    assert.match(opcoes, /15\/02\/2037/, `a opção do FIN-16 precisa trazer DD/MM/AAAA; opções: "${opcoes}"`);
    assert.doesNotMatch(opcoes, /2037-02/, `o ISO cru não pode mais aparecer no FIN-16; opções: "${opcoes}"`);

    await qa07f1WaitOptionValue(page, 'fin16-select', qa07f1.provisionId);
    await page.selectOption('[data-testid="fin16-select"]', qa07f1.provisionId);
    await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="fin16-review-audit"]')));
    const auditoria = await textOf(page, '[data-testid="fin16-review-audit"]');
    await capture(page, '07f1-fin16-carimbo-utc');
    assert.match(auditoria, /\d{1,2}\/\d{1,2}\/\d{4} \d{2}:\d{2} UTC/,
      `o carimbo da revisão precisa sair em pt-BR com fuso declarado; texto: "${auditoria.slice(0, 200)}"`);
    assert.doesNotMatch(auditoria, /Invalid Date|NaN/,
      `carimbo inválido nunca pode ser exibido; texto: "${auditoria.slice(0, 200)}"`);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07F-1 browser: FIN-14 traz o período em pt-BR e a trilha com fuso declarado (UTC)', { skip: !RUN, timeout: 120_000 }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, { rules: [] });
    await gotoTab07e2(page, 'exports');
    await settle07e2(page, '[data-testid="finance-export-workspace"]', ['[data-testid="fin14-select"]']);

    await qa07f1WaitOptionValue(page, 'fin14-select', qa07f1.exportId);
    await page.selectOption('[data-testid="fin14-select"]', qa07f1.exportId);
    await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="fin14-detail"]')));
    const detalhe = await textOf(page, '[data-testid="fin14-detail"]');
    await capture(page, '07f1-fin14-periodo-detalhe');
    assert.match(detalhe, /01\/02\/2037 a 28\/02\/2037/,
      `o período do FIN-14 precisa sair em pt-BR; texto: "${detalhe.slice(0, 200)}"`);
    assert.doesNotMatch(detalhe, /2037-02/, `o período do FIN-14 não pode trazer ISO cru; texto: "${detalhe.slice(0, 200)}"`);

    await page.getByTestId('fin14-logs').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="fin14-log-list"] li').length > 0
      || Boolean(document.querySelector('[data-testid="fin14-logs-error"]')));
    const trilha = await textOf(page, '[data-testid="fin14-log-list"]');
    await capture(page, '07f1-fin14-trilha-utc');
    assert.match(trilha, /\d{1,2}\/\d{1,2}\/\d{4} \d{2}:\d{2} UTC/,
      `a trilha do FIN-14 precisa declarar o fuso; texto: "${trilha.slice(0, 240)}"`);
    assert.doesNotMatch(trilha, /Invalid Date|NaN/, `a trilha do FIN-14 não pode exibir carimbo inválido; texto: "${trilha.slice(0, 240)}"`);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07F-1 browser: FIN-13 traz o período em pt-BR e o histórico da trilha com fuso declarado (UTC)', { skip: !RUN, timeout: 120_000 }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, { rules: [] });
    await gotoTab07e2(page, 'budgets');
    await settle07e2(page, '[data-testid="finance-budget-workspace"]', ['[data-testid="fin13-budget-select"]']);

    await qa07f1WaitOptionValue(page, 'fin13-budget-select', qa07f1.budgetId);
    await page.selectOption('[data-testid="fin13-budget-select"]', qa07f1.budgetId);
    await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="fin13-budget-detail"]')));
    const detalhe = await textOf(page, '[data-testid="fin13-budget-detail"]');
    await capture(page, '07f1-fin13-periodo-detalhe');
    assert.match(detalhe, /01\/02\/2037 a 28\/02\/2037/,
      `o período do FIN-13 precisa sair em pt-BR; texto: "${detalhe.slice(0, 240)}"`);
    assert.doesNotMatch(detalhe, /2037-02/, `o período do FIN-13 não pode trazer ISO cru; texto: "${detalhe.slice(0, 240)}"`);

    await page.getByTestId('fin13-load-history').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^="fin13-history-row-"]').length > 0
      || Boolean(document.querySelector('[data-testid="fin13-history-error"]')));
    const historico = await textOf(page, '[data-testid="fin13-history-list"]');
    await capture(page, '07f1-fin13-historico-utc');
    assert.match(historico, /\d{1,2}\/\d{1,2}\/\d{4} \d{2}:\d{2} UTC/,
      `o histórico do FIN-13 precisa declarar o fuso; texto: "${historico.slice(0, 240)}"`);
    assert.doesNotMatch(historico, /Invalid Date|NaN/, `o histórico do FIN-13 não pode exibir carimbo inválido; texto: "${historico.slice(0, 240)}"`);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07F-1 browser: FIN-05, FIN-07, FIN-08 e FIN-09 trazem as datas das listas em pt-BR', { skip: !RUN, timeout: 180_000 }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, { rules: [] });

    const esperas = [
      ['reconciliation', '[data-testid="fin05-transactions"]', /05\/02\/2037/, /2037-02-05/, '07f1-fin05-transacao'],
      ['cashflow', '[data-testid="fin07-snapshots"]', /01\/02\/2037/, /2037-02-01/, '07f1-fin07-snapshot'],
      ['costs', '[data-testid="fin08-imports"]', /01\/02\/2037/, /2037-02-01/, '07f1-fin08-importacao'],
      ['results', '[data-testid="fin09-list"]', /01\/02\/2037/, /2037-02-01/, '07f1-fin09-resultado'],
    ];
    for (const [aba, superficie, esperado, cru, capture_nome] of esperas) {
      await gotoTab07e2(page, aba);
      await settle07e2(page, superficie, [], { extraMs: 900 });
      const Aba = aba.charAt(0).toUpperCase() + aba.slice(1);
      const texto = await textOf(page, superficie);
      await capture(page, capture_nome);
      assert.match(texto, esperado, `a ${Aba} precisa exibir a data em pt-BR; texto: "${texto.slice(0, 240)}"`);
      assert.doesNotMatch(texto, cru, `a ${Aba} não pode mais exibir ISO cru; texto: "${texto.slice(0, 240)}"`);
    }

    // Aging e custos rateados: as outras duas tabelas com data das mesmas abas.
    await gotoTab07e2(page, 'cashflow');
    await settle07e2(page, '[data-testid="fin07-aging"]', [], { extraMs: 900 });
    const aging = await textOf(page, '[data-testid="fin07-aging"]');
    await capture(page, '07f1-fin07-aging');
    assert.match(aging, /01\/02\/2037/, `a tabela de aging precisa exibir a data em pt-BR; texto: "${aging.slice(0, 240)}"`);

    await gotoTab07e2(page, 'costs');
    await settle07e2(page, '[data-testid="fin08-cost-list"]', [], { extraMs: 900 });
    const custos = await textOf(page, '[data-testid="fin08-cost-list"]');
    await capture(page, '07f1-fin08-custo');
    assert.match(custos, /01\/02\/2037/, `a tabela de custos rateados precisa exibir a data em pt-BR; texto: "${custos.slice(0, 240)}"`);
    assert.doesNotMatch(custos, /2037-02/, `a tabela de custos rateados não pode mais exibir ISO cru; texto: "${custos.slice(0, 240)}"`);

    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07F-1 browser: o painel traz o início da regra e o período do relatório f03 em pt-BR', { skip: !RUN, timeout: 120_000 }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, { rules: [] });
    await settle(page, '[data-testid="financeiro-workspace"]', ['[role="tablist"]']);
    // A lista "Regras cadastradas" (com o campo Início) vive na aba Recorrência.
    await gotoTab07e2(page, 'recurrence');
    await settle07e2(page, '[data-testid="finance-recurrence"]', [`[data-testid="finance-rule-${qa07f1.ruleId}"]`]);

    const regra = await textOf(page, `[data-testid="finance-rule-${qa07f1.ruleId}"]`);
    await capture(page, '07f1-painel-regra-inicio');
    assert.match(regra, /03\/02\/2037/, `o início da regra precisa sair em pt-BR; texto: "${regra.slice(0, 240)}"`);
    assert.doesNotMatch(regra, /2037-02-03/, `o início da regra não pode trazer ISO cru; texto: "${regra.slice(0, 240)}"`);

    await gotoTab07e2(page, 'f03reports');
    await page.locator('[data-testid="finance-f03-reports"]').waitFor();
    await page.getByRole('button', { name: 'Atualizar lista' }).click();
    await page.waitForFunction(() => /01\/02\/2037/.test(document.querySelector('[data-testid="finance-f03-reports"]')?.textContent || '')
      || Boolean(document.querySelector('[data-testid="finance-error"]')));
    const relatorios = await textOf(page, '[data-testid="finance-f03-reports"]');
    await capture(page, '07f1-painel-relatorio-periodo');
    assert.match(relatorios, /01\/02\/2037 a 28\/02\/2037/,
      `o período do relatório f03 precisa sair em pt-BR; texto: "${relatorios.slice(0, 300)}"`);
    assert.doesNotMatch(relatorios, /2037-02-01/, `o período do relatório f03 não pode trazer ISO cru; texto: "${relatorios.slice(0, 300)}"`);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07F-1 browser: data ausente é declarada e formato inesperado é preservado cru (sem data inventada)', { skip: !RUN, timeout: 180_000 }, async () => {
  // Rodada A — ausente (`null` em um registro e campo omitido em outro):
  // o auxiliar herdado injeta o corpo 2xx só em GET, e o FIN-09 é superfície
  // de lista simples (não depende de <option> oculto).
  const browserA = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browserA, financeCookie, {
      rules: [{
        match: '/api/fin/management-results',
        body: {
          results: [
            { id: 'qa-07f1-ausente-nulo', protocol: 'RES-FIN-07F1-A', competence_date: null, status: 'incompleto', is_complete: false, margin_cents: null, computed_margin_percent: null, margin_basis: 'dados_incompletos', incomplete_reason: 'Competência ausente injetada pelo gate UX-PRO-07F-1.' },
            { id: 'qa-07f1-ausente-omitido', protocol: 'RES-FIN-07F1-B', status: 'incompleto', is_complete: false, margin_cents: null, computed_margin_percent: null, margin_basis: 'dados_incompletos', incomplete_reason: 'Competência omitida injetada pelo gate UX-PRO-07F-1.' },
          ],
        },
      }],
    });
    await gotoTab07e2(page, 'results');
    await settle07e2(page, '[data-testid="fin09-results"]', ['[data-testid="fin09-list"]']);
    const texto = await textOf(page, '[data-testid="fin09-list"]');
    await capture(page, '07f1-fin09-data-ausente');
    const declaracoes = (texto.match(/Não informada/g) || []).length;
    assert.ok(declaracoes >= 2,
      `data ausente precisa ser declarada nas duas linhas (nulo e campo omitido); texto: "${texto.slice(0, 300)}"`);
    assert.doesNotMatch(texto, /Invalid Date|NaN|undefined/,
      `data ausente nunca pode virar data inventada; texto: "${texto.slice(0, 300)}"`);
    await context.close();
  } finally { await browserA.close(); }

  // Rodada B — formato inesperado: nada é convertido por adivinhação; o texto
  // volta como veio e o auxiliar jamais inventa uma data.
  const browserB = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browserB, financeCookie, {
      rules: [{
        match: '/api/fin/management-results',
        body: {
          results: [
            { id: 'qa-07f1-formato-inesperado', protocol: 'RES-FIN-07F1-C', competence_date: 'formato-inesperado', status: 'incompleto', is_complete: false, margin_cents: null, computed_margin_percent: null, margin_basis: 'dados_incompletos', incomplete_reason: 'Formato inesperado injetado pelo gate UX-PRO-07F-1.' },
          ],
        },
      }],
    });
    await gotoTab07e2(page, 'results');
    await settle07e2(page, '[data-testid="fin09-results"]', ['[data-testid="fin09-list"]']);
    const texto = await textOf(page, '[data-testid="fin09-list"]');
    await capture(page, '07f1-fin09-formato-inesperado');
    assert.match(texto, /formato-inesperado/,
      `formato inesperado precisa ser preservado como veio; texto: "${texto.slice(0, 300)}"`);
    assert.doesNotMatch(texto, /\d{2}\/\d{2}\/\d{4}/,
      `formato inesperado não pode virar data adivinhada; texto: "${texto.slice(0, 300)}"`);
    await context.close();
  } finally { await browserB.close(); }
});

test('UX-PRO-07F-1 browser: o MESMO carimbo é idêntico com timezoneId America/Sao_Paulo e Asia/Tokyo', { skip: !RUN, timeout: 120_000 }, async () => {
  const leituras = [];
  for (const timezoneId of ['America/Sao_Paulo', 'Asia/Tokyo']) {
    // O Chromium empacotado roda com --single-process: um browser por contexto.
    const browser = await launchBrowser();
    try {
      const { context, page } = await qa07f1OpenTimezone(browser, financeCookie, timezoneId);
      const fusoEfetivo = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
      assert.equal(fusoEfetivo, timezoneId,
        `o contexto precisa realmente emular o fuso "${timezoneId}"; o navegador respondeu "${fusoEfetivo}"`);
      await gotoTab07e2(page, 'commissions');
      await settle07e2(page, '[data-testid="finance-commission-workspace"]', ['[data-testid="fin16-select"]']);
      await qa07f1WaitOptionValue(page, 'fin16-select', qa07f1.provisionId);
      await page.selectOption('[data-testid="fin16-select"]', qa07f1.provisionId);
      await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="fin16-review-audit"]')));
      const carimbo = await textOf(page, '[data-testid="fin16-review-audit"]');
      await capture(page, `07f1-fuso-${timezoneId.replace(/[^A-Za-z]/g, '-')}`);
      assert.match(carimbo, /\d{1,2}\/\d{1,2}\/\d{4} \d{2}:\d{2} UTC/,
        `o carimbo precisa declarar o fuso em "${timezoneId}"; texto: "${carimbo.slice(0, 200)}"`);
      leituras.push({ timezoneId, carimbo });
      await context.close();
    } finally { await browser.close(); }
  }
  assert.equal(leituras[0].carimbo, leituras[1].carimbo,
    `o mesmo instante não pode mudar de texto com o fuso da máquina (${leituras[0].timezoneId}: "${leituras[0].carimbo}" × ${leituras[1].timezoneId}: "${leituras[1].carimbo}")`);
});

test('UX-PRO-07F-1 browser: as datas em pt-BR não produzem transbordo em 1440/768/390/320 e as capturas ficam registradas', { skip: !RUN, timeout: 180_000 }, async () => {
  const medicoes = [];
  for (const [width, height, nome] of [[1440, 900, '1440'], [768, 1024, '768'], [390, 844, '390'], [320, 844, '320']]) {
    // Um browser por largura, pela mesma limitação do --single-process.
    const browser = await launchBrowser();
    try {
      const { context, page } = await openFinanceInvalidBody(browser, financeCookie, { width, height, rules: [] });
      await gotoTab07e2(page, 'closures');
      await settle07e2(page, '[data-testid="finance-closure-workspace"]', ['[data-testid="fin15-select"]']);
      const opcoes = await qa07f1OptionsText(page, 'fin15-select', '04/2037');
      await capture(page, `07f1-datas-ptbr-${nome}`);

      const transbordo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.match(opcoes, /04\/2037/, `a competência em pt-BR precisa existir em ${width}px; opções: "${opcoes}"`);
      assert.ok(transbordo <= 0, `transbordo de ${transbordo}px em ${width}px com as datas em pt-BR`);
      medicoes.push({ width, height, nome, transbordo, opcoes: opcoes.slice(0, 120) });
      await context.close();
    } finally { await browser.close(); }
  }

  if (evidenceDir) {
    const { writeFile } = await import('node:fs/promises');
    const resumo = {
      stage: 'ux-pro-07-financeiro',
      generatedBy: 'gate PostgreSQL descartável + HTTP real + Chromium (scripts/qa-ux-pro-07f1-postgres.mjs)',
      notes: [
        'UX-PRO-07F-1: as 20 exibições de data/hora de /admin/financeiro saem em DD/MM/AAAA, MM/AAAA e DD/MM/AAAA HH:mm UTC (fuso declarado) em vez de ISO cru.',
        'Tema dia; papel financeiro; massa sintética criada pelas próprias APIs financeiras.',
        'Este resumo NÃO mede percurso de teclado nem primeiro foco (ausentes de propósito): são cobertos pelos stages herdados ux-07-financeiro e ux-pro-07-financeiro, e o inventário agrega por rota.',
        'Arquivo próprio (não sobrescreve resumo.json da 07E-1 nem 07e2-resumo.json da 07E-2).',
        'O tema noturno não foi medido nesta fatia: contraste é achado transversal (E8) fora do escopo.',
      ],
      entries: medicoes.map(item => ({
        stage: 'ux-pro-07-financeiro',
        route: '/admin/financeiro',
        role: 'financeiro',
        viewport: `${item.width}x${item.height}`,
        theme: 'day',
        screenshot: `${evidenceDir}/07f1-datas-ptbr-${item.nome}.png`,
        problems: [],
        state: 'datas_em_ptbr_e_fuso_declarado_fin15',
        transbordoDocumentoPx: item.transbordo,
        formatoDataObservado: `MM/AAAA na competência do FIN-15; opções: ${item.opcoes}`,
      })),
    };
    await writeFile(path.join(evidenceDir, '07f1-resumo.json'), `${JSON.stringify(resumo, null, 2)}\n`, 'utf8');
  }
});

// ---------------------------------------------------------------------------
// UX-PRO-07E-2-ALVO — casos NOVOS, acrescentados APÓS os 44 herdados.
//
// Todo o conteúdo anterior permanece byte a byte (SHA-256 da base
// bcc1771e69f8788e969e29326968ac24cf7b1fe8b1462610e572ede4138cbbf7): nenhuma
// asserção herdada foi editada, removida ou afrouxada. Em particular, o caso
// "UX-PRO-07E-2 browser: a falha declarada do grupo fiscal ..." continua
// medindo `alturaRepetir` apenas como OBSERVAÇÃO (`> 0`), como foi escrito em
// 15/10 — aquele registro histórico não é reescrito por esta fatia.
//
// O que estes casos provam: os dois botões "Tentar novamente" legados de
// /admin/financeiro — `fin11-retry` (`FiscalWorkspace.tsx:118`) e `fin10-retry`
// (`ExpenseWorkspace.tsx:158`), ambos SEM classe e portanto com a caixa nativa
// do navegador (~29px) — passam a ter alvo de toque >= 44px de altura E de
// largura, com rótulo de contraste >= 4,5:1 nos temas dia e noite, sem
// transbordo do documento acima de 1px, nos 4 viewports canônicos.
//
// Limiar revalidado ANTES do RED, não inventado aqui:
//   - token de projeto `--ux-height-target: 44px` (src/styles/ux-tokens.css:57),
//     já consumido por AdminThemeToggle.module.css:6 e Comercial.module.css:68;
//   - gate vizinho `measureSurface()`/`measuredProblems()` em
//     tests/ux-emergency-workspace.integration.test.mjs (alvo >= 44, contraste
//     >= 4,5, transbordo <= 1).
//
// Nada de comportamento é tocado: o segundo caso prova que repetir continua
// recuperando a leitura real nos dois botões, com texto, `data-testid`,
// `disabled`-state e destino intactos.
//
// Injeção somente em `window.fetch` da página e somente em GET, como nos casos
// herdados: servidor, banco, proxy e escritas permanecem reais e intactos.
// ---------------------------------------------------------------------------

const ALVO_MINIMO_PX = 44;
const CONTRASTE_MINIMO = 4.5;
const TRANSBORDO_MAXIMO_PX = 1;
const VIEWPORTS_ALVO = [[1440, 900, '1440'], [768, 1024, '768'], [390, 844, '390'], [320, 844, '320']];
const REGRAS_ALVO = [
  { match: '/api/fin/fiscal-activity-rules', body: { rules: 'não é uma lista' } },
  { match: '/api/fin/expenses', body: { expenses: null } },
];

async function temaAtual(page) {
  return (await page.locator('html').getAttribute('data-admin-theme')) || 'day';
}

/** Alterna pelo controle REAL da tela (AdminThemeToggle), não por estilo inline. */
async function aplicarTema(page, tema) {
  if (await temaAtual(page) === tema) return;
  await page.locator('[data-admin-theme-toggle="true"]').first().click();
  await page.waitForFunction(
    esperado => (document.documentElement.dataset.adminTheme || 'day') === esperado,
    tema,
    { timeout: 20_000 },
  );
}

async function medirTransbordo(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/**
 * Mede o alvo e o contraste do rótulo de um botão no próprio navegador, com o
 * mesmo método de `contrast()` do gate vizinho (ux-emergency): a cor de fundo
 * é a primeira não transparente na cadeia de ancestrais.
 */
async function medirBotao(page, seletor) {
  const locator = page.locator(seletor).first();
  await locator.waitFor({ timeout: 30_000 });
  return locator.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const parse = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = rgb => {
      const values = rgb.map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
    };
    const backgroundOf = element => {
      let current = element;
      while (current) {
        const value = getComputedStyle(current).backgroundColor;
        if (value && !/rgba\([^)]*,\s*0\s*\)$/.test(value) && value !== 'transparent') return parse(value);
        current = current.parentElement;
      }
      return [255, 255, 255];
    };
    const foreground = parse(style.color);
    const back = backgroundOf(node);
    const [lighter, darker] = [luminance(foreground), luminance(back)].sort((a, b) => b - a);
    return {
      alturaPx: Math.round(rect.height),
      larguraPx: Math.round(rect.width),
      contraste: Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100,
      texto: (node.textContent || '').trim(),
      tagName: node.tagName.toLowerCase(),
      testid: node.getAttribute('data-testid'),
      disabled: node.disabled === true,
      minHeightComputado: style.minHeight,
      corTexto: style.color,
      corFundo: getComputedStyle(node).backgroundColor,
    };
  });
}

function problemasAlvo(item) {
  const problems = [];
  if (!Number.isFinite(item.alturaPx) || item.alturaPx < ALVO_MINIMO_PX) {
    problems.push(`alturaPx=${item.alturaPx} abaixo de ${ALVO_MINIMO_PX}px`);
  }
  if (!Number.isFinite(item.larguraPx) || item.larguraPx < ALVO_MINIMO_PX) {
    problems.push(`larguraPx=${item.larguraPx} abaixo de ${ALVO_MINIMO_PX}px`);
  }
  if (!Number.isFinite(item.contraste) || item.contraste < CONTRASTE_MINIMO) {
    problems.push(`contraste=${item.contraste}:1 abaixo de ${CONTRASTE_MINIMO}:1`);
  }
  if (Number.isFinite(item.transbordoDocumentoPx) && item.transbordoDocumentoPx > TRANSBORDO_MAXIMO_PX) {
    problems.push(`transbordoDocumentoPx=${item.transbordoDocumentoPx}px acima de ${TRANSBORDO_MAXIMO_PX}px`);
  }
  return problems;
}

test('UX-PRO-07E-2-ALVO browser: os botões "Tentar novamente" de FIN-11 e FIN-10 têm alvo >= 44px nos 4 viewports, dia e noite', { skip: !RUN, timeout: 420_000 }, async () => {
  const medicoes = [];
  for (const [width, height, nome] of VIEWPORTS_ALVO) {
    // Um browser por largura, pela mesma limitação do --single-process.
    const browser = await launchBrowser();
    try {
      const { context, page } = await openFinanceInvalidBody(browser, financeCookie, {
        width, height, rules: REGRAS_ALVO,
      });

      // FIN-11 — aba "Fiscal e obrigações", falha declarada com botão de repetir.
      await gotoTab07e2(page, 'fiscal');
      await settle07e2(page, '[data-testid="fin11-fiscal"]', ['[data-testid="fin11-error"]']);
      for (const tema of ['day', 'night']) {
        await aplicarTema(page, tema);
        const medicao = await medirBotao(page, '[data-testid="fin11-retry"]');
        const transbordoDocumentoPx = await medirTransbordo(page);
        await capture(page, `07e2-alvo-fin11-retry-${tema === 'night' ? 'noite' : 'dia'}-${nome}`);
        medicoes.push({ botao: 'fin11-retry', width, height, nome, tema, transbordoDocumentoPx, ...medicao });
      }

      // FIN-10 — aba "Despesas e compras", mesmo estado de falha declarada.
      await gotoTab07e2(page, 'expenses');
      await settle07e2(page, '[data-testid="fin10-policy"]', ['[data-testid="fin10-error"]']);
      for (const tema of ['night', 'day']) {
        await aplicarTema(page, tema);
        const medicao = await medirBotao(page, '[data-testid="fin10-retry"]');
        const transbordoDocumentoPx = await medirTransbordo(page);
        await capture(page, `07e2-alvo-fin10-retry-${tema === 'night' ? 'noite' : 'dia'}-${nome}`);
        medicoes.push({ botao: 'fin10-retry', width, height, nome, tema, transbordoDocumentoPx, ...medicao });
      }
      await context.close();
    } finally { await browser.close(); }
  }

  // 2 botões × 2 temas × 4 viewports = 16 medições; nenhuma pode faltar.
  assert.equal(medicoes.length, 16, `esperava 16 medições (2 botões × 2 temas × 4 viewports), obtidas ${medicoes.length}`);
  const tabela = medicoes
    .map(item => `${item.botao} ${item.nome}px ${item.tema}: altura=${item.alturaPx}px largura=${item.larguraPx}px contraste=${item.contraste}:1 transbordo=${item.transbordoDocumentoPx}px disabled=${item.disabled}`)
    .join('\n  ');

  for (const item of medicoes) {
    const onde = `${item.botao} em ${item.width}x${item.height} no tema ${item.tema}`;
    // Identidade preservada: o reparo é só de apresentação.
    assert.equal(item.tagName, 'button', `${onde}: o alvo precisa continuar sendo um <button> nativo`);
    assert.equal(item.texto, 'Tentar novamente', `${onde}: o rótulo não pode mudar`);
    assert.equal(item.testid, item.botao, `${onde}: o data-testid não pode mudar`);
    assert.equal(item.disabled, false, `${onde}: com a leitura já assentada o botão precisa continuar habilitado`);
    assert.ok(item.alturaPx >= ALVO_MINIMO_PX,
      `${onde}: altura do alvo de ${item.alturaPx}px abaixo do limiar da casa (${ALVO_MINIMO_PX}px)\n  ${tabela}`);
    assert.ok(item.larguraPx >= ALVO_MINIMO_PX,
      `${onde}: largura do alvo de ${item.larguraPx}px abaixo do limiar da casa (${ALVO_MINIMO_PX}px)\n  ${tabela}`);
    assert.ok(item.contraste >= CONTRASTE_MINIMO,
      `${onde}: contraste do rótulo de ${item.contraste}:1 abaixo de ${CONTRASTE_MINIMO}:1\n  ${tabela}`);
    assert.ok(item.transbordoDocumentoPx <= TRANSBORDO_MAXIMO_PX,
      `${onde}: transbordo do documento de ${item.transbordoDocumentoPx}px acima de ${TRANSBORDO_MAXIMO_PX}px\n  ${tabela}`);
  }

  if (evidenceDir) {
    const { writeFile } = await import('node:fs/promises');
    const resumo = {
      stage: 'ux-pro-07-financeiro',
      generatedBy: 'gate PostgreSQL descartável + HTTP real + Chromium (scripts/qa-ux-pro-07e2-alvo-postgres.mjs)',
      notes: [
        'UX-PRO-07E-2-ALVO: alvo de toque dos botões "Tentar novamente" legados de /admin/financeiro (fin11-retry e fin10-retry).',
        'Estado medido: falha declarada de leitura (2xx sem a lista canônica), injetada somente em window.fetch e somente em GET.',
        'Tema alternado pelo controle real da tela (AdminThemeToggle), não por estilo inline.',
        'problems é DERIVADO das medições desta entrada (alvo < 44px, contraste < 4,5:1, transbordo > 1px), nunca um literal.',
        'Arquivo próprio (não sobrescreve resumo.json da 07E-1, 07e2-resumo.json da 07E-2 nem 07f1-resumo.json).',
        'Medições automatizadas: não equivalem a auditoria WCAG completa, a aceite humano nem a homologação.',
      ],
      entries: medicoes.map(item => ({
        stage: 'ux-pro-07-financeiro',
        route: '/admin/financeiro',
        role: 'financeiro',
        viewport: `${item.width}x${item.height}`,
        theme: item.tema,
        screenshot: `${evidenceDir}/07e2-alvo-${item.botao}-${item.tema === 'night' ? 'noite' : 'dia'}-${item.nome}.png`,
        problems: problemasAlvo(item),
        state: 'falha_declarada_com_botao_de_repetir',
        button: item.botao,
        alturaAlvoPx: item.alturaPx,
        larguraAlvoPx: item.larguraPx,
        menorAlvoPx: Math.min(item.alturaPx, item.larguraPx),
        contrasteRotulo: item.contraste,
        transbordoDocumentoPx: item.transbordoDocumentoPx,
        minHeightComputado: item.minHeightComputado,
        corTexto: item.corTexto,
        corFundo: item.corFundo,
        disabled: item.disabled,
      })),
    };
    await writeFile(path.join(evidenceDir, '07e2-alvo-resumo.json'), `${JSON.stringify(resumo, null, 2)}\n`, 'utf8');
  }
});

test('UX-PRO-07E-2-ALVO browser: o reparo do alvo não muda comportamento — repetir recupera a leitura real em FIN-11 e FIN-10', { skip: !RUN, timeout: 240_000 }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browser, financeCookie, { rules: REGRAS_ALVO });

    // FIN-11: falha declarada -> solta a injeção -> repetir recupera de verdade.
    await gotoTab07e2(page, 'fiscal');
    await settle07e2(page, '[data-testid="fin11-fiscal"]', ['[data-testid="fin11-error"]']);
    const antesFin11 = await textOf(page, '[data-testid="fin11-fiscal"]');
    assert.match(antesFin11, /invalid_finance_response/,
      `a falha declarada precisa estar visível antes de repetir; texto: "${antesFin11.slice(0, 240)}"`);
    await releaseInvalidBody(page, '/api/fin/fiscal-activity-rules');
    await page.locator('[data-testid="fin11-retry"]').first().click();
    await settle07e2(page, '[data-testid="fin11-fiscal"]', ['[data-testid="fin11-rules-table"]'], { extraMs: 1_200 });
    assert.equal(await page.locator('[data-testid="fin11-error"]').count(), 0,
      'depois de repetir com a leitura real disponível, a falha declarada precisa desaparecer');
    assert.equal(await page.locator('[data-testid="fin11-rules-unavailable"]').count(), 0,
      'o marcador de indisponibilidade não pode sobreviver a uma leitura confirmada');
    const depoisFin11 = await textOf(page, '[data-testid="fin11-fiscal"]');
    assert.doesNotMatch(depoisFin11, /invalid_finance_response/, 'a repetição precisa refazer a leitura de verdade');
    await capture(page, '07e2-alvo-fin11-retry-recuperou');

    // FIN-10: mesma prova no outro botão.
    await gotoTab07e2(page, 'expenses');
    await settle07e2(page, '[data-testid="fin10-policy"]', ['[data-testid="fin10-error"]']);
    const antesFin10 = await textOf(page, '[data-testid="fin10-error"]');
    assert.match(antesFin10, /invalid_finance_response/,
      `a falha declarada do FIN-10 precisa estar visível antes de repetir; texto: "${antesFin10.slice(0, 240)}"`);
    await releaseInvalidBody(page, '/api/fin/expenses');
    await page.locator('[data-testid="fin10-retry"]').first().click();
    await settle07e2(page, '[data-testid="fin10-policy"]', ['[data-testid="fin10-expenses"]'], { extraMs: 1_200 });
    assert.equal(await page.locator('[data-testid="fin10-error"]').count(), 0,
      'depois de repetir com a leitura real disponível, o canal de erro do FIN-10 precisa desaparecer');
    const depoisFin10 = await textOf(page, '[data-testid="fin10-expenses"]');
    assert.doesNotMatch(depoisFin10, /invalid_finance_response/, 'a repetição do FIN-10 precisa refazer a leitura de verdade');
    await capture(page, '07e2-alvo-fin10-retry-recuperou');

    await context.close();
  } finally { await browser.close(); }
});
