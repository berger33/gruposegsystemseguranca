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
// O prefixo herdado (1340 linhas / 76.468 bytes / SHA-256
// e9fc84369f227c5308e240ca92dc21262c14c59c5648689457157d820e98c487) permanece
// byte a byte: nenhuma asserção herdada foi editada, removida ou relaxada.
//
// O que estes casos provam: as 20 exibições de data/hora de /admin/financeiro
// deixam de sair em ISO cru (colunas DATE) e os 3 carimbos TIMESTAMPTZ deixam
// de herdar o fuso da máquina que renderiza — passam a DD/MM/AAAA, MM/AAAA e
// "DD/MM/AAAA HH:mm UTC" (fuso declarado) — SEM que o contrato HTTP mude: o
// primeiro caso prova que os dez endpoints seguem devolvendo o valor cru em
// ISO no 200, e que a formatação é decisão de tela.
//
// Nada é injetado em servidor, banco, proxy ou auditoria. A única injeção é a
// herdada `openFinanceInvalidBody` (somente em GET e somente em window.fetch),
// usada por UM dos casos para provar data ausente e formato inesperado; o caso
// do fuso abre contextos com `timezoneId` diferente e compara o MESMO carimbo.
// ---------------------------------------------------------------------------

/** Massa sintética da 07F-1, criada pelas PRÓPRIAS APIs no primeiro caso. */
const QA07F1_COMPETENCIA = '2038-02-17';
const QA07F1_PERIODO_INICIO = '2038-03-01';
const QA07F1_PERIODO_FIM = '2038-03-31';
const QA07F1_VENCIMENTO = '2038-01-10';
const QA07F1_COMPETENCIA_UI = '2038-04-11';
/** Textos esperados na tela para as datas acima (asserções literais, não espelho do código). */
const QA07F1_DATA = '17/02/2038';
const QA07F1_PERIODO = '01/03/2038 a 31/03/2038';
const QA07F1_MES = '02/2038';
const QA07F1_MES_UI = '04/2038';
const QA07F1_CARIMBO = /\d{1,2}\/\d{1,2}\/\d{4} \d{2}:\d{2} UTC/;
const QA07F1_ISO = /\d{4}-\d{2}-\d{2}T/;

let qa07f1RuleId = '', qa07f1BudgetId = '', qa07f1ClosureId = '', qa07f1ProvisionId = '', qa07f1ExportId = '';
let qa07f1SnapshotId = '', qa07f1StatementId = '', qa07f1TransactionId = '', qa07f1ImportId = '', qa07f1CostId = '';
let qa07f1AgingReceivableId = '', qa07f1ResultId = '', qa07f1ReportId = '', qa07f1ProvisionReviewIso = '';

/** Abre /admin/financeiro com um fuso declarado no contexto, sem injetar nada. */
async function openFinanceTimezone(browser, cookie, { timezoneId, width = 1440, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR', timezoneId });
  const separator = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(90_000);
  watchPageErrors(page);
  await page.goto(`${baseUrl}/admin/financeiro`, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

/**
 * Texto de uma opção de `<select>` nativo. O Playwright considera opção de
 * select nativo um elemento OCULTO, então a existência é esperada por
 * `waitForFunction` e a leitura é feita dentro da página — nunca por clique.
 */
async function qa07f1TextoDaOpcao(page, selectTestId, valor, timeout = 30_000) {
  await page.waitForFunction(
    ({ testId, value }) => {
      const select = document.querySelector(`[data-testid="${testId}"]`);
      return Boolean(select) && Array.from(select.options).some(option => option.value === value);
    },
    { testId: selectTestId, value: valor },
    { timeout },
  );
  return page.evaluate(({ testId, value }) => {
    const select = document.querySelector(`[data-testid="${testId}"]`);
    const option = select ? Array.from(select.options).find(item => item.value === value) : null;
    return option ? option.textContent.replace(/\s+/g, ' ').trim() : '';
  }, { testId: selectTestId, value: valor });
}

/** Seleciona uma opção por valor e espera o detalhe correspondente aparecer. */
async function qa07f1Selecionar(page, selectTestId, valor, detalheTestId) {
  await qa07f1TextoDaOpcao(page, selectTestId, valor);
  await page.selectOption(`[data-testid="${selectTestId}"]`, valor);
  await page.locator(`[data-testid="${detalheTestId}"]`).first().waitFor({ timeout: 30_000 });
}

test('UX-PRO-07F-1 contrato: os dez endpoints de data seguem devolvendo o valor cru em ISO no 200 (a formatação é só de tela)', { skip: !RUN }, async () => {
  // Massa sintética pelas PRÓPRIAS APIs financeiras, com datas próprias (as
  // herdadas usam 2037-01-15/2037-01-01; competência, período, vencimento e
  // chaves de armazenamento aqui são exclusivos para não colidir com nenhum
  // UNIQUE dos casos anteriores).
  const suffix = randomUUID().slice(0, 8);

  const rule = await api('/api/fin/recurrence-rules', {
    method: 'POST', cookie: financeCookie,
    body: {
      contract_id: contractId, recurrence_id: `QA-07F1-${suffix}`, recurrence_type: 'mensal',
      start_date: QA07F1_PERIODO_INICIO, amount_cents: 123456,
    },
  });
  assert.equal(rule.status, 201, `regra sintética deveria ser 201, veio ${rule.status} ${JSON.stringify(rule.body)}`);
  qa07f1RuleId = rule.body.rule.id;

  const budget = await api('/api/fin/budgets', {
    method: 'POST', cookie: financeCookie,
    body: {
      idempotency_key: `qa-07f1-budget-${suffix}`,
      title: `Orçamento sintético 07F-1 ${suffix}`,
      description: 'Estimativa sintética criada pelo gate UX-PRO-07F-1 para provar data de calendário em pt-BR.',
      premises: 'Premissas sintéticas do gate 07F-1: estimativa com premissas explícitas; não prometer resultado.',
      period_start: QA07F1_PERIODO_INICIO, period_end: QA07F1_PERIODO_FIM,
      total_revenue_cents: 500000, total_cost_cents: 400000,
    },
  });
  assert.equal(budget.status, 201, `orçamento sintético deveria ser 201, veio ${budget.status} ${JSON.stringify(budget.body)}`);
  qa07f1BudgetId = budget.body.budget.id;

  const provision = await api('/api/fin/commission-provisions', {
    method: 'POST', cookie: financeCookie,
    body: {
      provision_date: QA07F1_COMPETENCIA, amount_cents: 250000,
      notes: 'Provisão sintética criada pelo contrato UX-PRO-07F-1.', idempotency_key: `qa-07f1-commission-${suffix}`, is_auto_paid: false,
    },
  });
  assert.equal(provision.status, 201, `provisão sintética deveria ser 201, veio ${provision.status} ${JSON.stringify(provision.body)}`);
  qa07f1ProvisionId = provision.body.provision.id;
  // Revisão real pela API: é o que carimba `reviewed_at` (TIMESTAMPTZ) para o
  // caso do fuso comparar o MESMO instante em contextos diferentes.
  for (const status of ['em_revisao', 'revisada']) {
    const transition = await api('/api/fin/commission-provisions', {
      method: 'PATCH', cookie: financeCookie,
      body: {
        id: qa07f1ProvisionId, status,
        reason: `Transição sintética 07F-1 para ${status}.`,
        revision_reason: 'Revisão sintética do gate UX-PRO-07F-1 sem pagamento automático.',
      },
    });
    assert.equal(transition.status, 200, `transição para ${status} deveria ser 200, veio ${transition.status} ${JSON.stringify(transition.body)}`);
    if (status === 'revisada') qa07f1ProvisionReviewIso = String(transition.body.provision.reviewed_at);
  }
  assert.match(qa07f1ProvisionReviewIso, /^\d{4}-\d{2}-\d{2}T/, 'a revisão precisa carimbar reviewed_at em ISO');

  const exportRow = await api('/api/fin/exports', {
    method: 'POST', cookie: financeCookie,
    body: {
      period_start: QA07F1_PERIODO_INICIO, period_end: QA07F1_PERIODO_FIM, total_records: 3, total_amount_cents: 300000,
      file_name: `qa-07f1-export-${suffix}.csv`, filters: { origem: 'interface_sintetica' }, totals: { total_cents: 300000 },
      storage_key: `synthetic/fin14/qa-07f1-${suffix}.csv`, is_accountant_limited: true,
    },
  });
  assert.equal(exportRow.status, 201, `exportação sintética deveria ser 201, veio ${exportRow.status} ${JSON.stringify(exportRow.body)}`);
  qa07f1ExportId = exportRow.body.export.id;
  // A trilha (fin_export_logs) só ganha linha em transição; a trilha tem
  // `created_at` TIMESTAMPTZ, que é o carimbo provado no caso do FIN-14.
  const exportTransition = await api('/api/fin/exports', {
    method: 'PATCH', cookie: financeCookie, body: { id: qa07f1ExportId, status: 'gerando' },
  });
  assert.equal(exportTransition.status, 200, `transição da exportação deveria ser 200, veio ${exportTransition.status} ${JSON.stringify(exportTransition.body)}`);

  const snapshot = await api('/api/fin/cashflow-snapshots', {
    method: 'POST', cookie: financeCookie,
    body: {
      competence_date: QA07F1_COMPETENCIA, cashflow_type: 'previsto',
      total_receivable_cents: 700000, total_payable_cents: 200000, vencidos_cents: 100000, proximos_pagamentos_cents: 50000,
      notes: 'Fluxo de caixa sintético do gate UX-PRO-07F-1.',
    },
  });
  assert.equal(snapshot.status, 201, `snapshot sintético deveria ser 201, veio ${snapshot.status} ${JSON.stringify(snapshot.body)}`);
  qa07f1SnapshotId = snapshot.body.snapshot.id;

  const receivable = await api('/api/fin/receivables', {
    method: 'POST', cookie: financeCookie,
    body: {
      client_account_id: accountId, contract_id: contractId,
      competence_date: QA07F1_VENCIMENTO, due_date: QA07F1_VENCIMENTO, amount_cents: 90000, description: 'Recebível sintético do aging 07F-1.',
    },
  });
  assert.equal(receivable.status, 201, `recebível sintético deveria ser 201, veio ${receivable.status} ${JSON.stringify(receivable.body)}`);
  qa07f1AgingReceivableId = receivable.body.receivable.id;

  const aging = await api('/api/fin/aging-receivables', {
    method: 'POST', cookie: financeCookie,
    body: {
      receivable_id: qa07f1AgingReceivableId, competence_date: QA07F1_COMPETENCIA, due_date: QA07F1_VENCIMENTO,
      amount_cents: 90000, amount_paid_cents: 0,
    },
  });
  assert.equal(aging.status, 201, `aging sintético deveria ser 201, veio ${aging.status} ${JSON.stringify(aging.body)}`);

  const statement = await api('/api/fin/bank-statements', {
    method: 'POST', cookie: financeCookie,
    body: {
      source: 'extrato', file_name: `qa-07f1-${suffix}.ofx`, file_url: `synthetic://fin05/qa-07f1-${suffix}.ofx`,
      storage_key: `synthetic/fin05/qa-07f1-${suffix}.ofx`, import_date: QA07F1_COMPETENCIA, total_transactions: 0, total_amount_cents: 0,
    },
  });
  assert.equal(statement.status, 201, `extrato sintético deveria ser 201, veio ${statement.status} ${JSON.stringify(statement.body)}`);
  qa07f1StatementId = statement.body.statement.id;

  const transaction = await api('/api/fin/bank-transactions', {
    method: 'POST', cookie: financeCookie,
    body: {
      statement_id: qa07f1StatementId, transaction_date: QA07F1_COMPETENCIA, amount_cents: 45000,
      description: 'Transação sintética do gate UX-PRO-07F-1.', bank_ref: `QA-07F1-${suffix}`,
    },
  });
  assert.equal(transaction.status, 201, `transação sintética deveria ser 201, veio ${transaction.status} ${JSON.stringify(transaction.body)}`);
  qa07f1TransactionId = transaction.body.transaction.id;

  const costImport = await api('/api/fin/cost-imports', {
    method: 'POST', cookie: financeCookie,
    body: {
      source: 'pessoal', file_name: `qa-07f1-${suffix}.csv`, file_url: `synthetic://fin08/qa-07f1-${suffix}.csv`,
      storage_key: `synthetic/fin08/qa-07f1-${suffix}.csv`, competence_date: QA07F1_COMPETENCIA,
      total_costs_cents: 60000, total_records: 1,
    },
  });
  assert.equal(costImport.status, 201, `importação de custo deveria ser 201, veio ${costImport.status} ${JSON.stringify(costImport.body)}`);
  qa07f1ImportId = costImport.body.import.id;

  const cost = await api('/api/fin/costs', {
    method: 'POST', cookie: financeCookie,
    body: {
      import_id: qa07f1ImportId, import_record_key: `qa-07f1-record-${suffix}`,
      client_account_id: accountId, contract_id: contractId, cost_source: 'pessoal',
      competence_date: QA07F1_COMPETENCIA, amount_cents: 60000,
      description: 'Custo sintético do rateio 07F-1.', rateio_rule: 'Rateio sintético 100% para a conta do gate', rateio_percent: 100,
    },
  });
  assert.equal(cost.status, 201, `custo sintético deveria ser 201, veio ${cost.status} ${JSON.stringify(cost.body)}`);
  qa07f1CostId = cost.body.cost.id;

  // O FECHAMENTO vem DEPOIS dos lançamentos do MESMO mês: o gatilho
  // `trg_fin_cost_competence_open` (db/migrations/137-…:63) recusa custo em
  // competência fechada — ordem invertida aqui reprovaria a criação do custo
  // com 400 em vez de medir a exibição da data.
  const closure = await api('/api/fin/competence-closures', {
    method: 'POST', cookie: financeCookie,
    body: { competence_date: QA07F1_COMPETENCIA, notes: 'Competência sintética criada pelo contrato UX-PRO-07F-1.', totals: { origem: 'interface_sintetica' } },
  });
  assert.equal(closure.status, 201, `fechamento sintético deveria ser 201, veio ${closure.status} ${JSON.stringify(closure.body)}`);
  qa07f1ClosureId = closure.body.closure.id;

  // `contract_id` é OMITIDO de propósito: a API valida contra crm_contracts e o
  // fixture do gate vive em client_contracts (o campo é opcional).
  const result = await api('/api/fin/management-results', {
    method: 'POST', cookie: financeCookie,
    body: {
      client_account_id: accountId, competence_date: QA07F1_COMPETENCIA,
      revenue_contracted_cents: 800000, revenue_billed_cents: 500000, costs_cents: 350000,
      is_complete: false, incomplete_reason: 'Dados sintéticos incompletos do gate UX-PRO-07F-1.',
    },
  });
  assert.equal(result.status, 201, `resultado gerencial deveria ser 201, veio ${result.status} ${JSON.stringify(result.body)}`);
  qa07f1ResultId = result.body.result.id;

  // O relatório f03 exige a `Idempotency-Key` que o contrato JÁ tem (a mesma
  // que o L07 usa); nenhuma chave nova foi inventada.
  const report = await api('/api/admin/finance/f03/reports', {
    method: 'POST', cookie: financeCookie,
    headers: { 'idempotency-key': `qa-07f1-f03-report-${suffix}` },
    body: { account_id: accountId, period_start: QA07F1_PERIODO_INICIO, period_end: QA07F1_PERIODO_FIM },
  });
  assert.equal(report.status, 201, `relatório f03 deveria ser 201, veio ${report.status} ${JSON.stringify(report.body)}`);
  qa07f1ReportId = report.body.report.id;

  // Contrato cru: as colunas DATE continuam saindo em ISO (sem pt-BR) e os
  // TIMESTAMPTZ continuam saindo como instante ISO completo.
  const esperados = [
    ['/api/fin/recurrence-rules', 'rules', 'start_date', 'date'],
    ['/api/fin/budgets', 'budgets', 'period_start', 'date'],
    ['/api/fin/competence-closures', 'closures', 'competence_date', 'date'],
    ['/api/fin/commission-provisions', 'provisions', 'provision_date', 'date'],
    ['/api/fin/commission-provisions', 'provisions', 'reviewed_at', 'instant'],
    ['/api/fin/exports', 'exports', 'period_start', 'date'],
    ['/api/fin/cashflow-snapshots', 'snapshots', 'competence_date', 'date'],
    ['/api/fin/cost-imports', 'imports', 'competence_date', 'date'],
    ['/api/fin/management-results', 'results', 'competence_date', 'date'],
    ['/api/fin/bank-transactions', 'transactions', 'transaction_date', 'date'],
    ['/api/admin/finance/f03/reports', 'reports', 'period_start', 'date'],
  ];
  const ids = [qa07f1RuleId, qa07f1BudgetId, qa07f1ClosureId, qa07f1ProvisionId, qa07f1ProvisionId, qa07f1ExportId, qa07f1SnapshotId, qa07f1ImportId, qa07f1ResultId, qa07f1TransactionId, qa07f1ReportId];
  for (const [indice, [caminho, chave, campo, tipo]] of esperados.entries()) {
    const resposta = await api(caminho, { cookie: financeCookie });
    assert.equal(resposta.status, 200, `${caminho} deveria responder 200, veio ${resposta.status}`);
    const lista = resposta.body?.[chave];
    assert.ok(Array.isArray(lista), `${caminho} precisa devolver a lista canônica "${chave}"`);
    const registro = lista.find(item => item.id === ids[indice]);
    assert.ok(registro, `${caminho} precisa conter o registro sintético ${ids[indice]} (massa criada por este caso)`);
    const cru = String(registro[campo]);
    assert.match(cru, tipo === 'date' ? /^\d{4}-\d{2}-\d{2}/ : /^\d{4}-\d{2}-\d{2}T/,
      `${caminho}.${campo} precisa seguir CRU em ISO no 200 (contrato preservado); veio "${cru}"`);
    assert.doesNotMatch(cru, /\/\d{2}\/\d{4}/,
      `${caminho}.${campo} não pode sair formatado em pt-BR: a formatação é decisão de tela, não de payload`);
  }
});

test('UX-PRO-07F-1 browser: FIN-15 mostra a competência como MM/AAAA na opção, no detalhe e no aviso do fechamento', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinance(browser, financeCookie, {});
    await gotoTab07e2(page, 'closures');
    await settle07e2(page, '[data-testid="fin15-select"]', ['[data-testid="fin15-read-error"]']);
    await capture(page, '07f1-fechamento-competencia-pt-br');

    const opcao = await qa07f1TextoDaOpcao(page, 'fin15-select', qa07f1ClosureId);
    assert.match(opcao, new RegExp(QA07F1_MES.replace('/', '\\/')),
      `a opção do FIN-15 precisa mostrar ${QA07F1_MES}; texto: "${opcao}"`);
    assert.doesNotMatch(opcao, /2038-02/, `a opção não pode mostrar o ISO cru; texto: "${opcao}"`);

    await qa07f1Selecionar(page, 'fin15-select', qa07f1ClosureId, 'fin15-detail');
    const detalhe = await textOf(page, '[data-testid="fin15-detail"]');
    assert.match(detalhe, /02\/2038/, `o detalhe do FIN-15 precisa mostrar 02/2038; texto: "${detalhe.slice(0, 200)}"`);

    // Aviso do fechamento (ClosureWorkspace): criado pela própria tela, em
    // competência própria, para não colidir com o UNIQUE de competence_date.
    await page.getByTestId('fin15-date').fill(QA07F1_COMPETENCIA_UI);
    await page.getByTestId('fin15-notes').fill('Observações sintéticas do aviso UX-PRO-07F-1.');
    await page.getByTestId('fin15-create').click();
    await page.locator('[data-testid="fin15-notice"]').first().waitFor({ timeout: 30_000 });
    const aviso = await textOf(page, '[data-testid="fin15-notice"]');
    assert.match(aviso, /04\/2038/, `o aviso do fechamento precisa mostrar 04/2038; texto: "${aviso}"`);
    assert.doesNotMatch(aviso, /2038-04/, `o aviso não pode mostrar o ISO cru; texto: "${aviso}"`);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07F-1 browser: FIN-16 mostra a data da provisão em pt-BR e o carimbo da revisão com fuso declarado', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinance(browser, financeCookie, {});
    await gotoTab07e2(page, 'commissions');
    await settle07e2(page, '[data-testid="fin16-select"]', ['[data-testid="fin16-read-error"]']);
    await capture(page, '07f1-comissoes-data-e-carimbo');

    const opcao = await qa07f1TextoDaOpcao(page, 'fin16-select', qa07f1ProvisionId);
    assert.match(opcao, /17\/02\/2038/, `a opção do FIN-16 precisa mostrar 17/02/2038; texto: "${opcao}"`);

    await qa07f1Selecionar(page, 'fin16-select', qa07f1ProvisionId, 'fin16-review-audit');
    const auditoria = await textOf(page, '[data-testid="fin16-review-audit"]');
    assert.match(auditoria, QA07F1_CARIMBO,
      `o carimbo da revisão precisa declarar o fuso (DD/MM/AAAA HH:mm UTC); texto: "${auditoria.slice(0, 240)}"`);
    assert.doesNotMatch(auditoria, QA07F1_ISO, `o carimbo não pode sair em ISO cru; texto: "${auditoria.slice(0, 240)}"`);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07F-1 browser: FIN-14 mostra o período em pt-BR e a trilha com carimbo em UTC', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinance(browser, financeCookie, {});
    await gotoTab07e2(page, 'exports');
    await settle07e2(page, '[data-testid="fin14-select"]', ['[data-testid="fin14-read-error"]']);
    await qa07f1Selecionar(page, 'fin14-select', qa07f1ExportId, 'fin14-detail');

    const detalhe = await textOf(page, '[data-testid="fin14-detail"]');
    assert.match(detalhe, /01\/03\/2038 a 31\/03\/2038/,
      `o período do FIN-14 precisa sair como 01/03/2038 a 31/03/2038; texto: "${detalhe.slice(0, 240)}"`);

    await page.getByTestId('fin14-logs').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="fin14-log-list"] li').length > 0, null, { timeout: 30_000 });
    await capture(page, '07f1-exportacoes-periodo-e-trilha');
    const trilha = await textOf(page, '[data-testid="fin14-log-list"]');
    assert.match(trilha, QA07F1_CARIMBO, `a trilha precisa carimbar em UTC; texto: "${trilha.slice(0, 240)}"`);
    assert.doesNotMatch(trilha, QA07F1_ISO, `a trilha não pode sair em ISO cru; texto: "${trilha.slice(0, 240)}"`);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07F-1 browser: FIN-13 mostra o período do orçamento em pt-BR e o histórico com carimbo em UTC', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinance(browser, financeCookie, {});
    await gotoTab07e2(page, 'budgets');
    await settle07e2(page, '[data-testid="fin13-budget-select"]', ['[data-testid="fin13-budgets-error"]']);
    await qa07f1Selecionar(page, 'fin13-budget-select', qa07f1BudgetId, 'fin13-budget-detail');

    const detalhe = await textOf(page, '[data-testid="fin13-budget-detail"]');
    assert.match(detalhe, /01\/03\/2038 a 31\/03\/2038/,
      `o período do FIN-13 precisa sair como 01/03/2038 a 31/03/2038; texto: "${detalhe.slice(0, 240)}"`);

    await page.getByTestId('fin13-load-history').click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="fin13-history-empty"]'), null, { timeout: 30_000 });
    await capture(page, '07f1-orcamento-periodo-e-historico');
    const historico = await textOf(page, '[data-testid="fin13-history-list"]');
    assert.match(historico, QA07F1_CARIMBO, `o histórico precisa carimbar em UTC; texto: "${historico.slice(0, 300)}"`);
    assert.doesNotMatch(historico, QA07F1_ISO, `o histórico não pode sair em ISO cru; texto: "${historico.slice(0, 300)}"`);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07F-1 browser: FIN-05/07/08/09 mostram data de calendário em pt-BR nas tabelas e listas', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinance(browser, financeCookie, {});

    await gotoTab07e2(page, 'reconciliation');
    await settle07e2(page, '[data-testid="fin05-transactions"]', ['[data-testid="fin05-transactions-unavailable"]']);
    await capture(page, '07f1-conciliacao-transacao-data');
    const transacoes = await textOf(page, '[data-testid="fin05-transactions"]');
    assert.match(transacoes, /17\/02\/2038/, `a transação do FIN-05 precisa mostrar 17/02/2038; texto: "${transacoes.slice(0, 240)}"`);
    assert.doesNotMatch(transacoes, QA07F1_ISO, `a transação não pode sair em ISO cru; texto: "${transacoes.slice(0, 240)}"`);

    await gotoTab07e2(page, 'cashflow');
    await settle07e2(page, '[data-testid="fin07-snapshots"]', ['[data-testid="fin07-snapshots-unavailable"]']);
    await capture(page, '07f1-fluxo-caixa-snapshot-e-aging');
    const snapshots = await textOf(page, '[data-testid="fin07-snapshots"]');
    assert.match(snapshots, /17\/02\/2038/, `a competência do snapshot precisa sair em pt-BR; texto: "${snapshots.slice(0, 240)}"`);
    assert.doesNotMatch(snapshots, QA07F1_ISO, `o snapshot não pode sair em ISO cru; texto: "${snapshots.slice(0, 240)}"`);
    const aging = await textOf(page, '[data-testid="fin07-aging"]');
    assert.match(aging, /17\/02\/2038/, `a competência do aging precisa sair em pt-BR; texto: "${aging.slice(0, 240)}"`);
    assert.doesNotMatch(aging, QA07F1_ISO, `o aging não pode sair em ISO cru; texto: "${aging.slice(0, 240)}"`);

    await gotoTab07e2(page, 'costs');
    await settle07e2(page, '[data-testid="fin08-imports"]', ['[data-testid="fin08-imports-unavailable"]']);
    await capture(page, '07f1-custos-importacao-e-custo');
    const importacoes = await textOf(page, '[data-testid="fin08-imports"]');
    assert.match(importacoes, /17\/02\/2038/, `a competência da importação precisa sair em pt-BR; texto: "${importacoes.slice(0, 240)}"`);
    assert.doesNotMatch(importacoes, QA07F1_ISO, `a importação não pode sair em ISO cru; texto: "${importacoes.slice(0, 240)}"`);
    const custos = await textOf(page, '[data-testid="fin08-costs"]');
    assert.match(custos, /17\/02\/2038/, `a competência do custo precisa sair em pt-BR; texto: "${custos.slice(0, 240)}"`);
    assert.doesNotMatch(custos, QA07F1_ISO, `o custo não pode sair em ISO cru; texto: "${custos.slice(0, 240)}"`);

    await gotoTab07e2(page, 'results');
    await settle07e2(page, `[data-testid="fin09-result-${qa07f1ResultId}"]`, ['[data-testid="fin09-list"]']);
    await capture(page, '07f1-resultado-gerencial-data');
    // A asserção fica DENTRO do laço que abre a aba: a linha só existe com a
    // aba ativa (não há superfície de resultado em outra aba).
    const resultado = await textOf(page, `[data-testid="fin09-result-${qa07f1ResultId}"]`);
    assert.match(resultado, /17\/02\/2038/, `a competência do FIN-09 precisa sair em pt-BR; texto: "${resultado.slice(0, 240)}"`);
    assert.doesNotMatch(resultado, QA07F1_ISO, `o resultado não pode sair em ISO cru; texto: "${resultado.slice(0, 240)}"`);
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07F-1 browser: painel mostra o início da regra e o período do relatório f03 em pt-BR', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openFinance(browser, financeCookie, {});

    await gotoTab07e2(page, 'recurrence');
    await settle07e2(page, `[data-testid="finance-rule-${qa07f1RuleId}"]`, ['[data-testid="finance-error"]']);
    await capture(page, '07f1-painel-inicio-da-regra');
    const regra = await textOf(page, `[data-testid="finance-rule-${qa07f1RuleId}"]`);
    assert.match(regra, /01\/03\/2038/, `o início da regra precisa sair em pt-BR; texto: "${regra.slice(0, 240)}"`);
    assert.doesNotMatch(regra, QA07F1_ISO, `o início da regra não pode sair em ISO cru; texto: "${regra.slice(0, 240)}"`);

    await gotoTab07e2(page, 'f03reports');
    await page.locator('[data-testid="finance-f03-reports"]').waitFor();
    await page.getByRole('button', { name: 'Atualizar lista' }).click();
    // Espera a linha existir — condição verdadeira nas DUAS implementações —
    // e só depois lê o texto, para que a linha de base reprove pela asserção
    // (com o ISO cru visível no relatório) e não por tempo esgotado.
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="finance-f03-reports"] li').length > 0
        || Boolean(document.querySelector('[data-testid="finance-error"]')),
      null, { timeout: 30_000 });
    await capture(page, '07f1-painel-periodo-do-relatorio-f03');
    const painel = await textOf(page, '[data-testid="finance-f03-reports"]');
    assert.match(painel, /01\/03\/2038 a 31\/03\/2038/,
      `o período do relatório f03 precisa sair em pt-BR; texto: "${painel.slice(0, 300)}"`);
    const erro = await page.locator('[data-testid="finance-error"]').count();
    assert.equal(erro, 0, 'a leitura dos relatórios não pode ter falhado');
    await context.close();
  } finally { await browser.close(); }
});

test('UX-PRO-07F-1 browser: data ausente vira "Não informada" e formato inesperado sai cru, sem truncar', { skip: !RUN }, async () => {
  // Ausente: `null` na coluna DATE não pode virar "null" nem "nenhuma data".
  const browserAusente = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browserAusente, financeCookie, {
      rules: [{
        match: '/api/fin/recurrence-rules',
        body: {
          rules: [{
            id: 'qa-07f1-ausente', contract_id: 'qa-07f1-contrato', recurrence_id: 'QA-07F1-AUSENTE',
            recurrence_type: 'mensal', start_date: null, end_date: null, amount_cents: 1000,
            is_approved: false, is_active: true, suspension_enabled: false,
          }],
        },
      }],
    });
    await gotoTab07e2(page, 'recurrence');
    await settle07e2(page, '[data-testid="finance-rule-qa-07f1-ausente"]');
    await capture(page, '07f1-data-ausente');
    const ausente = await textOf(page, '[data-testid="finance-rule-qa-07f1-ausente"]');
    assert.match(ausente, /Não informada/, `data ausente precisa ser declarada; texto: "${ausente.slice(0, 240)}"`);
    assert.doesNotMatch(ausente, /\bnull\b/, `data ausente não pode aparecer como "null"; texto: "${ausente.slice(0, 240)}"`);
    await context.close();
  } finally { await browserAusente.close(); }

  // Formato inesperado: o texto é devolvido INTEIRO (nada de `slice`), porque
  // a tela não sabe o que aquele texto significa.
  const browserInesperado = await launchBrowser();
  try {
    const { context, page } = await openFinanceInvalidBody(browserInesperado, financeCookie, {
      rules: [{
        match: '/api/fin/recurrence-rules',
        body: {
          rules: [{
            id: 'qa-07f1-inesperado', contract_id: 'qa-07f1-contrato', recurrence_id: 'QA-07F1-INESPERADO',
            recurrence_type: 'mensal', start_date: 'formato-inesperado', amount_cents: 1000,
            is_approved: false, is_active: true, suspension_enabled: false,
          }],
        },
      }],
    });
    await gotoTab07e2(page, 'recurrence');
    await settle07e2(page, '[data-testid="finance-rule-qa-07f1-inesperado"]');
    await capture(page, '07f1-formato-inesperado');
    const inesperado = await textOf(page, '[data-testid="finance-rule-qa-07f1-inesperado"]');
    assert.ok(inesperado.includes('formato-inesperado'),
      `formato inesperado precisa sair cru e inteiro; texto: "${inesperado.slice(0, 240)}"`);
    await context.close();
  } finally { await browserInesperado.close(); }
});

test('UX-PRO-07F-1 browser: o MESMO carimbo sai igual em America/Sao_Paulo e Asia/Tokyo (fuso declarado, não herdado)', { skip: !RUN }, async () => {
  const esperado = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC', hourCycle: 'h23', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(qa07f1ProvisionReviewIso)).replace(',', '') + ' UTC';
  const textos = {};
  for (const timezoneId of ['America/Sao_Paulo', 'Asia/Tokyo']) {
    const browser = await launchBrowser();
    try {
      const { context, page } = await openFinanceTimezone(browser, financeCookie, { timezoneId });
      await gotoTab07e2(page, 'commissions');
      await settle07e2(page, '[data-testid="fin16-select"]', ['[data-testid="fin16-read-error"]']);
      await qa07f1Selecionar(page, 'fin16-select', qa07f1ProvisionId, 'fin16-review-audit');
      await capture(page, `07f1-fuso-${timezoneId.replace('/', '-')}`);
      textos[timezoneId] = await textOf(page, '[data-testid="fin16-review-audit"]');
      assert.ok(textos[timezoneId].includes(esperado),
        `em ${timezoneId} o carimbo precisa ser o instante em UTC declarado ("${esperado}"); texto: "${textos[timezoneId].slice(0, 240)}"`);
      await context.close();
    } finally { await browser.close(); }
  }
  assert.equal(textos['America/Sao_Paulo'], textos['Asia/Tokyo'],
    'o carimbo não pode mudar com o fuso da máquina que renderiza a tela');
});

test('UX-PRO-07F-1 browser: as datas em pt-BR não produzem transbordo em 1440/768/390/320 e o resumo fica registrado', { skip: !RUN }, async () => {
  const medicoes = [];
  for (const [width, height, nome] of [[1440, 900, '1440'], [768, 1024, '768'], [390, 844, '390'], [320, 844, '320']]) {
    // Um browser por largura, pela mesma limitação do --single-process.
    const browser = await launchBrowser();
    try {
      const { context, page } = await openFinance(browser, financeCookie, { width, height });
      await gotoTab07e2(page, 'results');
      await settle07e2(page, `[data-testid="fin09-result-${qa07f1ResultId}"]`, ['[data-testid="fin09-list"]']);
      await capture(page, `07f1-datas-pt-br-${nome}`);

      const linha = await textOf(page, `[data-testid="fin09-result-${qa07f1ResultId}"]`);
      assert.match(linha, /17\/02\/2038/, `em ${width}px a competência precisa sair em pt-BR; texto: "${linha.slice(0, 200)}"`);
      const transbordo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(transbordo <= 1, `transbordo de ${transbordo}px em ${width}px com as datas em pt-BR`);
      medicoes.push({ width, height, nome, transbordo });
      await context.close();
    } finally { await browser.close(); }
  }

  if (evidenceDir) {
    const { writeFile } = await import('node:fs/promises');
    const resumo = {
      stage: 'ux-pro-07-financeiro',
      generatedBy: 'gate PostgreSQL descartável + HTTP real + Chromium (scripts/qa-ux-pro-07f1-postgres.mjs)',
      notes: [
        'UX-PRO-07F-1: as 20 exibições de data/hora de /admin/financeiro passam a DD/MM/AAAA, MM/AAAA e "DD/MM/AAAA HH:mm UTC" (fuso declarado).',
        'Tema dia; papel financeiro; massa sintética criada pelas próprias APIs financeiras em competência 2038-02-17 e período 2038-03-01 a 2038-03-31.',
        'NÃO mede firstFocus nem percursoTeclado: nesta fatia a medição é de texto de data e de transbordo, não de foco. A ausência é declarada de propósito, não omitida.',
        'Arquivo próprio (não sobrescreve resumo.json da 07E-1 nem 07e2-resumo.json); o inventário agrega por rota.',
        'O tema noturno não foi medido nesta fatia: contraste é achado transversal (E8) fora do escopo.',
        'O fuso é declarado no texto (UTC); a igualdade entre America/Sao_Paulo e Asia/Tokyo é provada por caso próprio, não por este resumo.',
      ],
      entries: medicoes.map(item => ({
        stage: 'ux-pro-07-financeiro',
        route: '/admin/financeiro',
        role: 'financeiro',
        viewport: `${item.width}x${item.height}`,
        theme: 'day',
        screenshot: `${evidenceDir}/07f1-datas-pt-br-${item.nome}.png`,
        problems: [],
        state: 'data_de_calendario_em_pt_br_e_carimbo_com_fuso_declarado',
        transbordoDocumentoPx: item.transbordo,
      })),
    };
    await writeFile(path.join(evidenceDir, '07f1-resumo.json'), `${JSON.stringify(resumo, null, 2)}\n`, 'utf8');
  }
});
