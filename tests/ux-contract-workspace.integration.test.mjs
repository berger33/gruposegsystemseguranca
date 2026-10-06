// UX-07 (fatia C — Contratos) — gate das telas contratuais, por HTTP real
// contra PostgreSQL real (executado por scripts/qa-ux-contract-postgres.mjs,
// que sobe um cluster descartável) e por Chromium real.
//
// O que este gate prova:
//  - as rotas de contrato continuam respondendo 401 sem sessão;
//  - "menu não é autorização": o papel `comercial` está em `allowedRoles` do
//    AdminGate das duas telas e, mesmo assim, o servidor decide sozinho —
//    `contract_management_forbidden` nas frentes de gestão e escopo de
//    carteira (404 `contract_not_found`, lista vazia) no resto. A tela não
//    inventa uma permissão que a sessão não tem;
//  - o defeito central corrigido nesta fatia: as oito leituras do detalhe
//    estavam num único `Promise.all`; bastava UMA falhar para a página inteira
//    virar "Contrato indisponível", descartando as sete que funcionaram. Aqui
//    o diário é derrubado sozinho e o resto da tela continua de pé;
//  - falha de leitura na lista não vira "nenhum contrato", e a lista
//    legitimamente vazia não é apresentada como falha;
//  - as seis abas são um tablist de verdade, com roving tabindex e teclado;
//  - o vocabulário em português aparece na tela (situação do contrato, origem,
//    etapas de implantação) em vez do valor cru do banco;
//  - 390px não produz transbordo horizontal.
//
// O que este gate NÃO prova: aceite humano, homologação de Marcelo/Andreia,
// nem a reescrita dos dez clientes de contrato dentro de `/admin/ti`
// (ver pendências em docs/UX-07-CONTRATOS-2026-10-05.md).

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
let adminCookie, comercialCookie;
let companyId, contractId;

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

// O Chromium empacotado roda com --single-process e, nesta máquina, às vezes
// sai com SIGSEGV no próprio lançamento. A segunda tentativa não enfraquece
// asserção alguma: só repete o `launch`.
async function launchBrowser() {
  let ultimo;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      return await playwrightChromium.launch({
        executablePath: await packagedChromium.executablePath(),
        args: packagedChromium.args.filter(arg => arg !== '--disable-web-security'),
        headless: true,
      });
    } catch (erro) {
      ultimo = erro;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw ultimo;
}

const evidenceDir = process.env.UX_CONTRACT_EVIDENCE_DIR || '';
async function capture(page, nome) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage: true });
}

/**
 * Abre uma rota contratual já autenticada. `failRoutes` derruba, dentro da
 * própria página, as respostas indicadas: `page.route()` é instável com este
 * Chromium empacotado, então a substituição é feita em `window.fetch`, como
 * nos demais gates. O servidor NUNCA é enfraquecido.
 */
async function abrir(browser, rota, cookie, { width = 1440, height = 900, failRoutes = [], status = 503, code = 'contracts_unavailable' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  const separador = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, separador), value: cookie.slice(separador + 1), url: baseUrl }]);
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
  await page.goto(`${baseUrl}${rota}`, { waitUntil: 'domcontentloaded' });
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
      NEXT_DIST_DIR: '.next/integration-ux-contract',
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      EMPLOYEE_SESSION_SECRET: randomUUID().repeat(2),
      CLIENT_MFA_ENCRYPTION_KEY: Buffer.from(randomUUID()).toString('base64url').slice(0, 43),
      ADMIN_LOGIN_MAX_ATTEMPTS: '200',
      SITE_ADMIN_LEGACY_TOKENS: '',
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

  const admin = await provisionStaff(pool, { role: 'admin' });
  const comercial = await provisionStaff(pool, { role: 'comercial' });
  adminCookie = await loginStaffHttp(admin.email);
  comercialCookie = await loginStaffHttp(comercial.email);

  companyId = randomUUID();
  await pool.query(
    "INSERT INTO crm_companies (id,display_name,type,status,created_by) VALUES ($1,$2,'client','active','admin')",
    [companyId, `QA UX07C Empresa ${companyId.slice(0, 8)}`],
  );

  const criado = await api('/api/crm/contracts', {
    method: 'POST', cookie: adminCookie,
    body: {
      source: 'manual', request_key: randomUUID(), company_id: companyId,
      title: 'Contrato sintético UX-07 fatia C',
      service_summary: 'Cobertura sintética de segurança para validar a tela contratual',
      starts_on: '2036-03-01', total_cost: 1000, total_price: 2500,
      origin_details: 'Massa fictícia criada pelo gate UX-07 fatia C, sem proposta inventada.',
    },
  });
  assert.equal(criado.status, 201, `criação do contrato deveria ser 201, veio ${criado.status} ${JSON.stringify(criado.body)}`);
  contractId = criado.body.contract.id;

  for (const route of ['/admin/entrar', '/admin/contratos', `/admin/contratos/${contractId}`]) {
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

test('as rotas de contrato continuam exigindo sessão, sem mudança de contrato', { skip: !RUN }, async () => {
  const anonimo = await api('/api/crm/contracts');
  assert.equal(anonimo.status, 401);
  assert.ok(!('contracts' in (anonimo.body || {})), 'a negativa não pode vazar contrato algum');
});

test('menu não é autorização: comercial abre a tela e quem recusa é o servidor', { skip: !RUN }, async () => {
  // `comercial` está em allowedRoles do AdminGate das duas telas. No servidor
  // (contract-l05-api.mjs) ele é CONTRACT_READER, não MANAGER, e o contrato
  // desta massa não está na carteira dele.
  const gestao = {};
  for (const rota of ['/fiscal', '/management-diary']) {
    gestao[rota] = await api(`/api/crm/contracts/${contractId}${rota}`, { cookie: comercialCookie });
    assert.equal(gestao[rota].status, 403, `${rota} deveria ser recusada para comercial`);
    assert.equal(gestao[rota].body.error, 'contract_management_forbidden');
  }

  const detalhe = await api(`/api/crm/contracts/${contractId}`, { cookie: comercialCookie });
  assert.equal(detalhe.status, 404, 'contrato fora da carteira não é exibido a comercial');
  assert.equal(detalhe.body.error, 'contract_not_found');
  assert.ok(!('contract' in (detalhe.body || {})), 'a negativa não pode vazar o contrato');

  const lista = await api('/api/crm/contracts', { cookie: comercialCookie });
  assert.equal(lista.status, 200);
  assert.deepEqual(lista.body.contracts, [], 'o isolamento por carteira continua valendo');

  const escrita = await api('/api/crm/contracts', {
    method: 'POST', cookie: comercialCookie,
    body: { source: 'manual', request_key: randomUUID(), company_id: companyId, title: 'Tentativa indevida' },
  });
  assert.equal(escrita.status, 403, 'comercial não cria contrato');
  assert.equal(escrita.body.error, 'contract_management_forbidden');

  // admin segue com tudo: esta fatia não mexeu em permissão nenhuma.
  assert.equal((await api(`/api/crm/contracts/${contractId}`, { cookie: adminCookie })).status, 200);
  assert.equal((await api(`/api/crm/contracts/${contractId}/management-diary`, { cookie: adminCookie })).status, 200);
});

test('browser: a falha de UMA leitura não derruba mais a página inteira do contrato', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await abrir(browser, `/admin/contratos/${contractId}`, adminCookie, {
      failRoutes: ['/management-diary'], status: 503, code: 'diary_unavailable',
    });
    await page.locator('[role="tablist"]').waitFor();

    assert.match(await page.locator('h1').innerText(), /Contrato sintético UX-07 fatia C/,
      'o cabeçalho do contrato continua na tela apesar da falha do diário');
    assert.equal(await page.locator('[data-testid="contract-detail-error"]').count(), 0,
      'a falha de um recurso não pode virar erro da página inteira');

    await page.getByRole('tab', { name: 'Fiscalização e decisões', exact: true }).click();
    const falha = page.locator('[data-testid="contract-diary-error"]');
    await falha.waitFor();
    const texto = await falha.textContent();
    assert.match(texto, /não significa/i, 'a falha nega explicitamente a ausência de registros');
    assert.match(texto, /\(diary_unavailable\)/, 'o código canônico fica disponível para diagnóstico');
    assert.equal(await falha.locator('[data-ui-state="error"]').count(), 1,
      'falha de leitura é estado próprio, distinto de vazio');
    assert.ok(await falha.locator('button').count() >= 1, 'falha transitória precisa oferecer nova tentativa');

    // Dossiês fiscais, no mesmo painel, foram lidos e continuam na tela.
    assert.equal(await page.locator('[data-testid="contract-fiscal-error"]').count(), 0,
      'a leitura que funcionou continua valendo');
    assert.equal(await page.locator('[data-testid="contract-fiscal"]').count(), 1);

    await capture(page, 'desktop-contrato-falha-parcial');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: as seis abas do contrato são um tablist de verdade, com teclado', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await abrir(browser, `/admin/contratos/${contractId}`, adminCookie);
    await page.locator('[role="tablist"]').waitFor();

    const abas = page.getByRole('tab');
    assert.equal(await abas.count(), 6, 'o contrato tem seis frentes de trabalho');
    assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1);
    assert.equal(await page.locator('[role="tab"][tabindex="-1"]').count(), 5);
    assert.equal(await page.locator('[role="tabpanel"]').count(), 1, 'só o painel ativo fica montado');

    await abas.first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await abas.nth(1).getAttribute('aria-selected'), 'true');
    assert.equal(await abas.nth(1).evaluate(el => el === document.activeElement), true,
      'a seta precisa mover o foco junto com a seleção');
    await page.keyboard.press('End');
    assert.equal(await abas.nth(5).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await abas.nth(0).getAttribute('aria-selected'), 'true');

    await capture(page, 'desktop-contrato-abas');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: situação, origem e etapas aparecem com vocabulário em português', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await abrir(browser, `/admin/contratos/${contractId}`, adminCookie);
    await page.locator('[role="tablist"]').waitFor();

    // textContent, e não innerText: o prefixo de leitor de tela do UiBadge é
    // recortado por CSS e não entra no texto renderizado.
    const cabecalho = await page.getByTestId('contract-detail').locator('p').first().textContent();
    assert.match(cabecalho, /Situação do contrato:\s*Rascunho/i, 'a situação `rascunho` é exibida em português');
    assert.match(cabecalho, /Cadastro manual identificado/, 'a origem `manual` é exibida em português');
    assert.match(cabecalho, /01\/03\/2036/, 'a vigência aparece em formato brasileiro');

    await page.getByRole('tab', { name: 'Implantação', exact: true }).click();
    const etapas = page.locator('[data-testid="contract-implantation-steps"]');
    await etapas.waitFor();
    const textoEtapas = await etapas.textContent();
    assert.match(textoEtapas, /Situação da etapa:\s*Pendente/i, 'a situação da etapa sai em português');
    assert.doesNotMatch(textoEtapas, /nao_aplicavel|em_andamento/, 'nenhum valor cru do banco é exibido');

    await capture(page, 'desktop-contrato-vocabulario');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: falha de leitura da carteira NÃO vira "nenhum contrato"', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await abrir(browser, '/admin/contratos', adminCookie, {
      failRoutes: ['/api/crm/contracts'], status: 503, code: 'contracts_unavailable',
    });
    const lista = page.locator('[data-testid="contracts-list"]');
    await lista.waitFor();
    const estado = lista.locator('[data-ui-state="error"]');
    await estado.waitFor();
    const texto = await estado.textContent();
    assert.match(texto, /não significa que a carteira esteja vazia/i, 'a falha nega explicitamente a lista vazia');
    assert.match(texto, /\(contracts_unavailable\)/, 'o código canônico fica disponível');
    assert.equal(await page.locator('[data-testid="contracts-table"]').count(), 0, 'nenhuma tabela vazia é renderizada');
    assert.ok(await estado.locator('button').count() >= 1, 'falha transitória precisa oferecer nova tentativa');

    // As outras duas leituras da página são independentes e seguem na tela.
    assert.equal(await page.locator('[data-testid="contracts-manual"]').count(), 1,
      'o cadastro manual continua utilizável mesmo com a lista fora do ar');

    await capture(page, 'desktop-contratos-falha-lista');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: carteira legitimamente vazia não é apresentada como falha', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await abrir(browser, '/admin/contratos', comercialCookie);
    const lista = page.locator('[data-testid="contracts-list"]');
    await lista.waitFor();
    const vazio = lista.locator('[data-ui-state="empty"]');
    await vazio.waitFor();
    const texto = await vazio.textContent();
    assert.match(texto, /A leitura funcionou/i, 'vazio honesto diz que a leitura funcionou');
    assert.equal(await lista.locator('[data-ui-state="error"]').count(), 0,
      'lista vazia não pode ser confundida com falha');
    await capture(page, 'desktop-contratos-vazio-honesto');
    await context.close();
  } finally { await browser.close(); }
});

test('browser: em 390px as telas contratuais não produzem transbordo horizontal', { skip: !RUN }, async () => {
  for (const rota of ['/admin/contratos', `/admin/contratos/${contractId}`]) {
    const browser = await launchBrowser();
    try {
      const { context, page } = await abrir(browser, rota, adminCookie, { width: 390, height: 844 });
      await page.locator('main').waitFor();
      await page.waitForTimeout(600);
      const transbordo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(transbordo <= 1, `transbordo de ${transbordo}px em ${rota}`);
      await capture(page, `mobile-${rota.includes('/admin/contratos/') ? 'contrato-detalhe' : 'contratos-lista'}-390px`);
      await context.close();
    } finally { await browser.close(); }
  }
});
