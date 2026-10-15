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
