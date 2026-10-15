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
import { recordKeyboardCapture } from '../scripts/ux-pro-00-keyboard-evidence.mjs';
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

// Um crash do navegador NÃO é resultado de teste. `comNavegador` repete a
// sessão inteira quando o Chromium morre (SIGSEGV, alvo fechado), e repassa
// na hora qualquer falha de asserção — nenhuma asserção fica tolerante.
const CRASH = /Target (page|closed)|has been closed|Target crashed|browser has disconnected|crashed|SIGSEGV|Protocol error/i;

async function comNavegador(corpo) {
  let ultimo;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const browser = await launchBrowser();
    try {
      return await corpo(browser);
    } catch (erro) {
      if (erro?.code === 'ERR_ASSERTION' || !CRASH.test(String(erro?.message || ''))) throw erro;
      ultimo = erro;
      console.log(`UX_CONTRACT_BROWSER_RETRY tentativa=${tentativa}: ${String(erro.message).split('\n')[0]}`);
    } finally {
      await browser.close().catch(() => {});
    }
    await new Promise(r => setTimeout(r, 2000));
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
async function abrir(browser, rota, cookie, { width = 1440, height = 900, failRoutes = [], status = 503, code = 'contracts_unavailable', malformedRoutes = [] } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  const separador = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, separador), value: cookie.slice(separador + 1), url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(90_000);
  if (failRoutes.length || malformedRoutes.length) {
    await page.addInitScript(({ routes, failStatus, failCode, malformed }) => {
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        if (malformed.some(route => url.includes(route))) {
          return new Response(JSON.stringify({ unexpected: true }), {
            status: 200, headers: { 'content-type': 'application/json' },
          });
        }
        if (routes.some(route => url.includes(route))) {
          return new Response(JSON.stringify({ error: failCode }), {
            status: failStatus, headers: { 'content-type': 'application/json' },
          });
        }
        return original(input, init);
      };
    }, { routes: failRoutes, failStatus: status, failCode: code, malformed: malformedRoutes });
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

test('browser UX-PRO-07M: resposta 2xx sem contracts não vira carteira vazia', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
      const { context, page } = await abrir(browser, '/admin/contratos', adminCookie, {
        malformedRoutes: ['/api/crm/contracts'],
      });
      const lista = page.locator('[data-testid="contracts-list"]');
      await lista.waitFor();
      const estado = lista.locator('[data-ui-state="error"]');
      await estado.waitFor();
      assert.match(await estado.textContent(), /não pôde ser lida/);
      assert.equal(await page.locator('[data-testid="contracts-table"]').count(), 0, '2xx inválido não pode render tabela vazia');
      assert.equal(await lista.locator('[data-ui-state="empty"]').count(), 0, '2xx inválido não é vazio concluído');
      await capture(page, 'contratos-1440-resposta-invalida');
      await context.close();
  });
});

test('browser UX-PRO-07M: resposta 2xx sem history não vira ciclo de vida vazio', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
      const { context, page } = await abrir(browser, `/admin/contratos/${contractId}`, adminCookie, {
        malformedRoutes: ['/status'],
      });
      await page.locator('[role="tablist"]').waitFor();
      const falha = page.locator('[data-testid="contract-status-error"]');
      await falha.waitFor();
      assert.match(await falha.textContent(), /não pôde ser lida/);
      await capture(page, 'contrato-detalhe-1440-resposta-invalida');
      await context.close();
  });
});

test('browser: a falha de UMA leitura não derruba mais a página inteira do contrato', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
      const { context, page } = await abrir(browser, `/admin/contratos/${contractId}`, adminCookie, {
        failRoutes: ['/management-diary'], status: 503, code: 'diary_unavailable',
      });
      await page.locator('[role="tablist"]').waitFor();
    // O tablist é montado antes das leituras terminarem: esperar o cabeçalho
    // do contrato evita medir a tela ainda em "Lendo o contrato…".
    await page.getByRole('heading', { level: 1, name: /Contrato sintético UX-07 fatia C/ }).waitFor();

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
  });
});

test('browser: as seis abas do contrato são um tablist de verdade, com teclado', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
      const { context, page } = await abrir(browser, `/admin/contratos/${contractId}`, adminCookie);
      await page.locator('[role="tablist"]').waitFor();
    // O tablist é montado antes das leituras terminarem: esperar o cabeçalho
    // do contrato evita medir a tela ainda em "Lendo o contrato…".
    await page.getByRole('heading', { level: 1, name: /Contrato sintético UX-07 fatia C/ }).waitFor();

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
  });
});

test('browser: situação, origem e etapas aparecem com vocabulário em português', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
      const { context, page } = await abrir(browser, `/admin/contratos/${contractId}`, adminCookie);
      await page.locator('[role="tablist"]').waitFor();
    // O tablist é montado antes das leituras terminarem: esperar o cabeçalho
    // do contrato evita medir a tela ainda em "Lendo o contrato…".
    await page.getByRole('heading', { level: 1, name: /Contrato sintético UX-07 fatia C/ }).waitFor();

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
  });
});

test('browser: falha de leitura da carteira NÃO vira "nenhum contrato"', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
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
  });
});

test('browser: carteira legitimamente vazia não é apresentada como falha', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
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
  });
});

// ---------------------------------------------------------------------------
// UX-PRO-06 (contratos, lista) — estados de releitura de /admin/contratos.
// A falha é controlada por bandeiras em `window` (mesma convenção do gate da
// carteira): a leitura inicial conclui de verdade e só a RELEITURA falha,
// atrasada ou negada. O servidor nunca é enfraquecido.
// ---------------------------------------------------------------------------

/**
 * Abre a lista de contratos com `window.fetch` controlável:
 * - `window.__ux06Falha` = { status, code } derruba os GETs indicados por
 *   `window.__ux06Alvos` (trechos de URL); `null` desliga;
 * - `window.__ux06Atraso` = ms atrasa os GETs de `/api/crm/contracts`.
 */
async function abrirListaControlada(browser, cookie, { width = 1440, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  const separador = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, separador), value: cookie.slice(separador + 1), url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(90_000);
  await page.addInitScript(() => {
    window.__ux06Falha = null;
    window.__ux06Alvos = ['/api/crm/contracts'];
    window.__ux06Atraso = 0;
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input?.url || '');
      const metodo = (init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
      if (metodo === 'GET' && window.__ux06Atraso && url.includes('/api/crm/contracts') && !url.includes('/api/crm/contracts/')) {
        await new Promise(r => setTimeout(r, window.__ux06Atraso));
      }
      if (metodo === 'GET' && window.__ux06Falha && window.__ux06Alvos.some(alvo => url.includes(alvo))) {
        const { status, code } = window.__ux06Falha;
        return new Response(JSON.stringify({ error: code }), {
          status, headers: { 'content-type': 'application/json' },
        });
      }
      return original(input, init);
    };
  });
  await page.goto(`${baseUrl}/admin/contratos`, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

/** Dispara uma releitura real da lista pelo caminho da pessoa: criar um contrato manual recarrega os contratos. */
async function criarManualEDispararReleitura(page, titulo) {
  await page.selectOption('#contract-company', companyId);
  await page.fill('#contract-title', titulo);
  await page.fill('#contract-scope', 'Escopo sintético da releitura UX-PRO-06, sem dado real algum.');
  await page.fill('#contract-origin', 'Massa fictícia do gate UX-PRO-06 para disparar a releitura da lista.');
  await page.click('[data-testid="contracts-manual"] button[type="submit"]');
}

test('UX-PRO-06 contratos: falha na releitura preserva os contratos ja lidos, com hora e repeticao', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrirListaControlada(browser, adminCookie);
    const lista = page.locator('[data-testid="contracts-list"]');
    await lista.locator('[data-testid="contracts-table"]').waitFor();
    assert.ok(await page.locator(`[data-testid="contract-row-${contractId}"]`).isVisible(), 'o contrato semeado esta na lista inicial');

    // A releitura (disparada pela criação manual) passa a falhar com 503.
    await page.evaluate(() => { window.__ux06Falha = { status: 503, code: 'contracts_unavailable' }; });
    await criarManualEDispararReleitura(page, 'Contrato sintético releitura UX-PRO-06');

    const faixa = lista.locator('[data-testid="contratos-desatualizada"]');
    await faixa.waitFor({ timeout: 30_000 });
    assert.equal(await faixa.getAttribute('role'), 'alert', 'a faixa de dados preservados e um alerta');
    const texto = await faixa.textContent();
    assert.match(texto, /desatualizados/i, 'a faixa diz que os dados podem estar desatualizados');
    assert.match(texto, /não significa que a carteira esteja vazia/i, 'a faixa nega a leitura de carteira vazia');
    assert.match(texto, /última leitura concluída/i, 'a faixa diz de quando e o dado preservado');
    assert.match(texto, /\d{1,2}:\d{2}/, 'a faixa cita a hora da ultima leitura concluida');
    assert.ok(await page.locator(`[data-testid="contract-row-${contractId}"]`).isVisible(),
      'o contrato ja lido NAO pode sumir quando a releitura falha');
    assert.equal(await lista.locator('[data-ui-state="error"]').count(), 0,
      'com dados preservados nao deve haver estado de erro em tela cheia');
    await capture(page, 'desktop-contratos-desatualizada');

    // Repetir dentro da faixa volta a falar com o servidor e limpa o aviso.
    await page.evaluate(() => { window.__ux06Falha = null; });
    await faixa.locator('button', { hasText: 'Tentar novamente' }).click();
    await faixa.waitFor({ state: 'detached', timeout: 30_000 });
    assert.ok(await page.locator(`[data-testid="contract-row-${contractId}"]`).isVisible(),
      'o contrato continua na tela apos a repeticao concluir');
    await context.close();
  });
});

test('UX-PRO-06 contratos: releitura em curso mantem a lista visivel com role=status', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrirListaControlada(browser, adminCookie);
    const lista = page.locator('[data-testid="contracts-list"]');
    await lista.locator('[data-testid="contracts-table"]').waitFor();

    await page.evaluate(() => { window.__ux06Atraso = 4000; });
    await criarManualEDispararReleitura(page, 'Contrato sintético atualização UX-PRO-06');

    const indicador = lista.locator('[data-testid="contratos-atualizando"]');
    await indicador.waitFor({ timeout: 30_000 });
    assert.equal(await indicador.getAttribute('role'), 'status', 'a releitura em curso e anunciada por role=status');
    assert.ok(await lista.locator('[data-testid="contracts-table"]').isVisible(),
      'a lista NAO pode desaparecer durante a atualizacao');

    await indicador.waitFor({ state: 'detached', timeout: 30_000 });
    assert.equal(await lista.locator('[data-testid="contratos-desatualizada"]').count(), 0,
      'releitura concluida nao e desatualizacao');
    await context.close();
  });
});

test('UX-PRO-06 contratos: negativa na releitura falha fechada, sem dado preservado nem repeticao', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrirListaControlada(browser, adminCookie);
    const lista = page.locator('[data-testid="contracts-list"]');
    await lista.locator('[data-testid="contracts-table"]').waitFor();
    assert.ok(await page.locator(`[data-testid="contract-row-${contractId}"]`).isVisible());

    await page.evaluate(() => { window.__ux06Falha = { status: 403, code: 'contract_management_forbidden' }; });
    await criarManualEDispararReleitura(page, 'Contrato sintético negativa UX-PRO-06');

    const negado = lista.locator('[data-ui-state="denied"]');
    await negado.waitFor({ timeout: 30_000 });
    assert.equal(await page.locator(`[data-testid="contract-row-${contractId}"]`).isVisible(), false,
      'duvida de autorizacao NAO mantem dado na tela');
    assert.equal(await lista.locator('[data-testid="contratos-desatualizada"]').count(), 0,
      'negativa nao vira faixa de dados desatualizados');
    assert.equal(await negado.locator('button').count(), 0,
      'negativa nao convida a repetir a mesma chamada');
    await context.close();
  });
});

test('UX-PRO-06 contratos: 320/390/768/1440 dia e noite sem transbordo, com percurso de teclado', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    // Uma unica pagina, redimensionada por etapa (convencao dos demais gates):
    // menos lancamentos de navegador, mesma medicao de transbordo.
    const { context, page } = await abrirListaControlada(browser, adminCookie);
    const lista = page.locator('[data-testid="contracts-list"]');
    await lista.locator('[data-testid="contracts-table"]').waitFor();
    for (const largura of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width: largura, height: largura >= 1024 ? 900 : 844 });
      await page.waitForTimeout(700);
      // Reconfirma apos o reflow do resize, como no gate do funil: transiente
      // de layout nao reprova; transbordo persistente reprova.
      const transbordo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(transbordo <= 1, `transbordo de ${transbordo}px em ${largura}px (dia)`);
      await capture(page, `contratos-${largura}-dia`);
      if (largura === 768) {
        await page.click('[data-admin-theme-toggle="true"]');
        await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night', null, { timeout: 20_000 });
        await page.waitForTimeout(400);
        const transbordoNoite = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(transbordoNoite <= 1, `transbordo de ${transbordoNoite}px em 768px (noite)`);
        const cores = await page.evaluate(() => {
          const titulo = document.querySelector('[data-testid="contracts-list"] h2');
          const painel = document.querySelector('[data-testid="contracts-list"]');
          const soma = (cor) => (cor.match(/[\d.]+/g) || []).slice(0, 3).reduce((a, b) => a + Number(b), 0);
          return {
            titulo: titulo ? soma(getComputedStyle(titulo).color) : 0,
            painel: painel ? soma(getComputedStyle(painel).backgroundColor) : 999,
          };
        });
        assert.ok(cores.painel < 240, `o painel precisa escurecer no tema noturno (soma=${cores.painel})`);
        assert.ok(cores.titulo > 480, `o titulo precisa clarear no tema noturno (soma=${cores.titulo})`);
        await capture(page, 'contratos-768-noite');
        await page.click('[data-admin-theme-toggle="true"]');
        await page.waitForFunction(() => document.documentElement.dataset.adminTheme !== 'night', null, { timeout: 20_000 });
      }
      if (largura === 390) {
        // Percurso de teclado ate a acao de abrir o contrato, com foco visivel.
        const link = page.locator(`[data-testid="contract-row-${contractId}"] a`);
        await link.waitFor();
        let focou = false;
        const percursoTeclado = [];
        for (let i = 0; i < 60 && !focou; i++) {
          await page.keyboard.press('Tab');
          percursoTeclado.push(await page.evaluate(() => {
            const el = document.activeElement;
            return el.id || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 80) || el.tagName.toLowerCase();
          }));
          focou = await link.evaluate(el => el === document.activeElement);
        }
        assert.ok(focou, 'o link do contrato precisa ser alcancavel por Tab');
        const contorno = await link.evaluate(el => ({
          estilo: getComputedStyle(el).outlineStyle,
          espessura: parseFloat(getComputedStyle(el).outlineWidth) || 0,
        }));
        assert.ok(contorno.estilo !== 'none' && contorno.espessura >= 1,
          `foco visivel no link do contrato (estilo=${contorno.estilo}, espessura=${contorno.espessura})`);
        await capture(page, 'contratos-390-teclado');
        // Emissão após as asserções existentes de Tab + contorno; não inferir
        // percurso/primeiro foco a partir do nome da captura ou de role=alert.
        const viewport = page.viewportSize();
        await recordKeyboardCapture(evidenceDir, {
          stage: 'ux-pro-06-contratos', route: '/admin/contratos', role: 'admin',
          viewport: `${viewport.width}x${viewport.height}`,
          theme: await page.evaluate(() => document.documentElement.dataset.adminTheme || 'day'),
          file: 'contratos-390-teclado.png', firstFocus: true, percursoTeclado,
        });
      }
    }
    await context.close();
  });
});

test('browser: em 390px as telas contratuais não produzem transbordo horizontal', { skip: !RUN }, async () => {
  for (const rota of ['/admin/contratos', `/admin/contratos/${contractId}`]) {
    await comNavegador(async browser => {
      const { context, page } = await abrir(browser, rota, adminCookie, { width: 390, height: 844 });
      await page.locator('main').waitFor();
      await page.waitForTimeout(600);
      const transbordo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(transbordo <= 1, `transbordo de ${transbordo}px em ${rota}`);
      await capture(page, `mobile-${rota.includes('/admin/contratos/') ? 'contrato-detalhe' : 'contratos-lista'}-390px`);
      await context.close();
    });
  }
});

// ---------------------------------------------------------------------------
// UX-PRO-06 — detalhe do contrato (`/admin/contratos/[id]`)
//
// Mesmo padrao ja entregue na fila de pedidos (#210/#211), no funil (#212), na
// carteira (#213), no comercial (#214) e na lista de contratos (#216): falha
// transitoria DEPOIS de uma leitura concluida preserva o que ja foi lido e vira
// faixa `role="alert"` com o motivo real, a hora da ultima leitura concluida e
// a repeticao; a releitura em curso mostra `role="status"` sem esconder o
// conteudo; a negativa (denied/auth) continua fail-closed, sem dado preservado
// e sem convite a repetir a mesma chamada.
//
// O servidor NUNCA e enfraquecido: a falha e o atraso sao injetados em
// `window.fetch` dentro da propria pagina, apenas nas requisicoes GET cujo
// caminho termina exatamente no recurso escolhido.
// ---------------------------------------------------------------------------

const sufixoContrato = (caminho) => `/api/crm/contracts/${contractId}${caminho}`;

async function abrirDetalheControlado(browser, { width = 1440, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  const separador = adminCookie.indexOf('=');
  await context.addCookies([{ name: adminCookie.slice(0, separador), value: adminCookie.slice(separador + 1), url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(90_000);
  await page.addInitScript(() => {
    window.__ux06d = { alvos: [], atraso: 0, falha: null };
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input?.url || '');
      const metodo = (init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
      const caminho = url.split('?')[0];
      if (metodo === 'GET' && window.__ux06d.alvos.some(alvo => caminho.endsWith(alvo))) {
        if (window.__ux06d.atraso) await new Promise(r => setTimeout(r, window.__ux06d.atraso));
        if (window.__ux06d.falha) {
          const { status, code } = window.__ux06d.falha;
          return new Response(JSON.stringify({ error: code }), {
            status, headers: { 'content-type': 'application/json' },
          });
        }
      }
      return original(input, init);
    };
  });
  await page.goto(`${baseUrl}/admin/contratos/${contractId}`, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

/** Le um contador do painel de composicao (Itens/Unidades/Responsaveis). */
function contadorComposicao(page, rotulo) {
  return page.evaluate(rotulo => {
    const itens = [...document.querySelectorAll('[data-testid="contract-composition"] dl > div')];
    const alvo = itens.find(div => div.querySelector('dt')?.textContent?.trim() === rotulo);
    const texto = alvo?.querySelector('dd')?.textContent?.trim();
    return texto === undefined ? -1 : Number(texto);
  }, rotulo);
}

/** Espera o contador chegar ao valor da leitura nova (sinal de releitura concluida). */
function esperarContador(page, rotulo, valor) {
  return page.waitForFunction(({ rotulo, valor }) => {
    const itens = [...document.querySelectorAll('[data-testid="contract-composition"] dl > div')];
    const alvo = itens.find(div => div.querySelector('dt')?.textContent?.trim() === rotulo);
    return Number(alvo?.querySelector('dd')?.textContent?.trim() || '-1') === valor;
  }, { rotulo, valor }, { timeout: 30_000 });
}

test('UX-PRO-06 detalhe: falha na releitura preserva o que ja foi lido, com hora e repeticao', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrirDetalheControlado(browser);
    const titulo = page.getByRole('heading', { level: 1, name: /Contrato sintético UX-07 fatia C/ });
    await titulo.waitFor();

    // --- alertas: leitura concluida, com uma regra criada pela propria tela
    await page.getByRole('tab', { name: 'Alertas e obrigações', exact: true }).click();
    const regras = page.locator('[data-testid="contract-alert-rules"]');
    await page.fill('#alert-title', 'Alerta sintetico da leitura UX-PRO-06');
    await page.getByRole('button', { name: 'Configurar alerta' }).click();
    await regras.waitFor();
    assert.match(await regras.textContent(), /Alerta sintetico da leitura UX-PRO-06/,
      'a regra criada aparece na leitura concluida');

    // --- a releitura (disparada pelo proprio formulario) passa a falhar no GET
    await page.evaluate(alvo => {
      window.__ux06d.alvos = [alvo];
      window.__ux06d.falha = { status: 503, code: 'contracts_unavailable' };
    }, sufixoContrato('/alert-rules'));
    await page.fill('#alert-title', 'Alerta sintetico que dispara a releitura falhada');
    await page.getByRole('button', { name: 'Configurar alerta' }).click();

    const faixaAlertas = page.locator('[data-testid="contract-alerts-desatualizada"]');
    await faixaAlertas.waitFor({ timeout: 30_000 });
    assert.equal(await faixaAlertas.getAttribute('role'), 'alert', 'a faixa de dados preservados e um alerta');
    const textoAlertas = await faixaAlertas.textContent();
    assert.match(textoAlertas, /desatualizados/i, 'a faixa diz que os dados podem estar desatualizados');
    assert.match(textoAlertas, /última leitura concluída/i, 'a faixa diz de quando e o dado preservado');
    assert.match(textoAlertas, /\d{1,2}:\d{2}/, 'a faixa cita a hora da ultima leitura concluida');
    assert.ok(await regras.isVisible(), 'as regras ja lidas NAO podem sumir quando a releitura falha');
    assert.match(await regras.textContent(), /Alerta sintetico da leitura UX-PRO-06/,
      'a regra da leitura anterior continua na tela');
    assert.equal(await page.locator('[data-testid="contract-alerts"] [data-ui-state="error"]').count(), 0,
      'com dados preservados nao pode haver estado de erro em tela cheia');
    assert.match(await page.locator('[data-testid="contract-notice"]').textContent(), /Registro gravado/,
      'a escrita continua indo ao servidor: o que falhou foi a releitura');
    await capture(page, 'contrato-detalhe-alertas-desatualizada');

    // --- repetir dentro da faixa volta a falar com o servidor e limpa o aviso
    await page.evaluate(() => { window.__ux06d.falha = null; });
    await faixaAlertas.getByRole('button', { name: 'Tentar novamente' }).click();
    await faixaAlertas.waitFor({ state: 'detached', timeout: 30_000 });
    assert.ok(await regras.isVisible(), 'as regras continuam na tela apos a repeticao concluir');

    // --- detalhe (cabecalho + composicao): mesmo padrao, com o contador como prova
    await page.getByRole('tab', { name: 'Composição', exact: true }).click();
    await page.fill('#resp-name', 'Responsavel sintetico UX-PRO-06 A');
    await page.fill('#resp-role', 'gestor');
    await page.getByRole('button', { name: 'Vincular responsável' }).click();
    await page.waitForFunction(() => {
      const itens = [...document.querySelectorAll('[data-testid="contract-composition"] dl > div')];
      const alvo = itens.find(div => div.querySelector('dt')?.textContent?.trim() === 'Responsáveis');
      return Number(alvo?.querySelector('dd')?.textContent?.trim() || '0') >= 1;
    });
    const preservados = await contadorComposicao(page, 'Responsáveis');
    assert.ok(preservados >= 1, `a composicao ja lida mostra o responsavel vinculado (veio ${preservados})`);

    await page.evaluate(alvo => {
      window.__ux06d.alvos = [alvo];
      window.__ux06d.falha = { status: 503, code: 'contracts_unavailable' };
    }, sufixoContrato(''));
    // Funcao distinta de proposito: a chave unica e (contract_id,
    // responsible_id, role) e o formulario nao envia responsible_id (NULL).
    // Funcao nova garante linha nova qualquer que seja o tratamento de NULL
    // nessa chave, entao o contador prova a leitura nova sem depender disso.
    await page.fill('#resp-name', 'Responsavel sintetico UX-PRO-06 B');
    await page.fill('#resp-role', 'gestor senior UX-PRO-06');
    await page.getByRole('button', { name: 'Vincular responsável' }).click();

    const faixaDetalhe = page.locator('[data-testid="contract-detail-desatualizada"]');
    await faixaDetalhe.waitFor({ timeout: 30_000 });
    assert.equal(await faixaDetalhe.getAttribute('role'), 'alert', 'o cabecalho tambem anuncia a desatualizacao');
    assert.ok(await titulo.isVisible(), 'o titulo do contrato ja lido NAO pode sumir quando a releitura falha');
    assert.equal(await contadorComposicao(page, 'Responsáveis'), preservados,
      'os numeros preservados sao os da ultima leitura concluida');
    assert.equal(await page.locator('[data-testid="contract-composition-error"]').count(), 0,
      'com dados preservados a composicao nao vira estado de erro em tela cheia');
    await capture(page, 'contrato-detalhe-desatualizada');

    await page.evaluate(() => { window.__ux06d.falha = null; });
    await faixaDetalhe.getByRole('button', { name: 'Tentar novamente' }).click();
    // A faixa sai quando a repeticao COMECA; esperar so o `detached` leria o
    // contador antes de o servidor responder. O sinal honesto de conclusao e o
    // proprio contador chegar ao valor da leitura nova.
    await esperarContador(page, 'Responsáveis', preservados + 1);
    assert.equal(await page.locator('[data-testid="contract-detail-desatualizada"]').count(), 0,
      'a repeticao concluida com sucesso limpa a faixa de desatualizacao');
    await context.close();
  });
});

test('UX-PRO-06 detalhe: releitura em curso mantem o conteudo visivel com role=status', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrirDetalheControlado(browser);
    const titulo = page.getByRole('heading', { level: 1, name: /Contrato sintético UX-07 fatia C/ });
    await titulo.waitFor();
    await page.getByRole('tab', { name: 'Composição', exact: true }).click();
    await page.locator('[data-testid="contract-composition"] dl').waitFor();
    // O contrato e compartilhado pela suite: a contagem e medida antes e
    // conferida por DIFERENCA, nunca por um valor absoluto suposto.
    const antes = await contadorComposicao(page, 'Responsáveis');

    await page.evaluate(alvo => { window.__ux06d.alvos = [alvo]; window.__ux06d.atraso = 4000; }, sufixoContrato(''));
    await page.fill('#resp-name', 'Responsavel sintetico da releitura lenta');
    await page.fill('#resp-role', 'analista de contrato UX-PRO-06');
    await page.getByRole('button', { name: 'Vincular responsável' }).click();

    const indicador = page.locator('[data-testid="contract-detail-atualizando"]');
    await indicador.waitFor({ timeout: 30_000 });
    assert.equal(await indicador.getAttribute('role'), 'status', 'a releitura em curso e anunciada por role=status');
    assert.ok(await titulo.isVisible(), 'o cabecalho NAO pode desaparecer durante a releitura');
    assert.ok(await page.locator('[data-testid="contract-composition"] dl').isVisible(),
      'a composicao NAO pode desaparecer durante a releitura');

    await indicador.waitFor({ state: 'detached', timeout: 30_000 });
    assert.equal(await page.locator('[data-testid="contract-detail-desatualizada"]').count(), 0,
      'releitura concluida nao e desatualizacao');
    assert.equal(await contadorComposicao(page, 'Responsáveis'), antes + 1,
      `a releitura concluida aplica a leitura nova (antes=${antes})`);
    await context.close();
  });
});

test('UX-PRO-06 detalhe: negativa na releitura falha fechada, sem dado preservado nem repeticao', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrirDetalheControlado(browser);
    const titulo = page.getByRole('heading', { level: 1, name: /Contrato sintético UX-07 fatia C/ });
    await titulo.waitFor();
    assert.ok(await titulo.isVisible(), 'houve leitura concluida antes da negativa');

    await page.evaluate(alvo => {
      window.__ux06d.alvos = [alvo];
      window.__ux06d.falha = { status: 403, code: 'contract_management_forbidden' };
    }, sufixoContrato(''));
    await page.getByRole('tab', { name: 'Composição', exact: true }).click();
    await page.fill('#resp-name', 'Responsavel sintetico da negativa');
    await page.fill('#resp-role', 'gestor');
    await page.getByRole('button', { name: 'Vincular responsável' }).click();

    const negado = page.locator('[data-testid="contract-detail-error"] [data-ui-state="denied"]');
    await negado.waitFor({ timeout: 30_000 });
    assert.equal(await titulo.count(), 0, 'duvida de autorizacao NAO mantem o contrato ja lido na tela');
    assert.equal(await page.locator('[data-testid="contract-detail-desatualizada"]').count(), 0,
      'negativa nao vira faixa de dados desatualizados');
    assert.equal(await negado.locator('button').count(), 0,
      'negativa nao convida a repetir a mesma chamada');

    // As outras leituras continuam independentes: a negativa de UMA nao derruba as sete.
    await page.getByRole('tab', { name: 'Ciclo de vida', exact: true }).click();
    await page.locator('[data-testid="contract-next-status"]').waitFor();
    assert.equal(await page.locator('[data-testid="contract-status-error"]').count(), 0,
      'a leitura da situacao nao foi descartada pela negativa do detalhe');
    await capture(page, 'contrato-detalhe-negado');
    await context.close();
  });
});

test('UX-PRO-06 detalhe: 320/390/768/1440 dia e noite sem transbordo, com percurso de teclado', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    // Uma unica pagina, redimensionada por etapa (convencao dos demais gates):
    // menos lancamentos de navegador, mesma medicao de transbordo. A altura de
    // cada etapa e a mesma declarada no resumo de evidencias.
    const { context, page } = await abrirDetalheControlado(browser);
    await page.getByRole('heading', { level: 1, name: /Contrato sintético UX-07 fatia C/ }).waitFor();
    for (const [largura, altura] of [[1440, 900], [768, 1024], [390, 844], [320, 844]]) {
      await page.setViewportSize({ width: largura, height: altura });
      await page.waitForTimeout(700);
      // Reconfirma apos o reflow do resize, como nos gates anteriores:
      // transiente de layout nao reprova; transbordo persistente reprova.
      const transbordo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(transbordo <= 1, `transbordo de ${transbordo}px em ${largura}px (dia)`);
      await capture(page, `contrato-detalhe-${largura}-dia`);
      if (largura === 768) {
        await page.click('[data-admin-theme-toggle="true"]');
        await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night', null, { timeout: 20_000 });
        await page.waitForTimeout(400);
        const transbordoNoite = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(transbordoNoite <= 1, `transbordo de ${transbordoNoite}px em 768px (noite)`);
        const cores = await page.evaluate(() => {
          const titulo = document.querySelector('[data-testid="contract-detail"] h1');
          const painel = document.querySelector('[data-testid="contract-lifecycle"]');
          const soma = (cor) => (cor.match(/[\d.]+/g) || []).slice(0, 3).reduce((a, b) => a + Number(b), 0);
          return {
            titulo: titulo ? soma(getComputedStyle(titulo).color) : 0,
            painel: painel ? soma(getComputedStyle(painel).backgroundColor) : 999,
          };
        });
        assert.ok(cores.painel < 240, `o painel precisa escurecer no tema noturno (soma=${cores.painel})`);
        assert.ok(cores.titulo > 480, `o titulo precisa clarear no tema noturno (soma=${cores.titulo})`);
        await capture(page, 'contrato-detalhe-768-noite');
        await page.click('[data-admin-theme-toggle="true"]');
        await page.waitForFunction(() => document.documentElement.dataset.adminTheme !== 'night', null, { timeout: 20_000 });
      }
      if (largura === 390) {
        // Percurso de teclado ate a aba ativa, com foco visivel medido.
        const aba = page.locator('[data-testid="contract-tab-ciclo"]');
        await aba.waitFor();
        let focou = false;
        for (let i = 0; i < 60 && !focou; i++) {
          await page.keyboard.press('Tab');
          focou = await aba.evaluate(el => el === document.activeElement);
        }
        assert.ok(focou, 'a aba ativa do contrato precisa ser alcancavel por Tab');
        const contorno = await aba.evaluate(el => ({
          estilo: getComputedStyle(el).outlineStyle,
          espessura: parseFloat(getComputedStyle(el).outlineWidth) || 0,
        }));
        assert.ok(contorno.estilo !== 'none' && contorno.espessura >= 1,
          `foco visivel na aba do contrato (estilo=${contorno.estilo}, espessura=${contorno.espessura})`);
        await capture(page, 'contrato-detalhe-390-teclado');
      }
    }
    await context.close();
  });
});
