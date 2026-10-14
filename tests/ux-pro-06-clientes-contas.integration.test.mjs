// UX-PRO-06 — contas administrativas do cliente (/admin/clientes): gate focal.
// Executado por scripts/qa-ux-pro-06-clientes-postgres.mjs, que sobe um
// PostgreSQL 17 descartável, aplica as migrações vigentes e passa a URL por
// DATABASE_URL. HTTP real, sessão de staff individual provisionada pelo fluxo
// real de login e Chromium real.
//
// O que este gate prova:
//  - o contrato de leitura/escrita dos cadastros centrais não mudou: 401 sem
//    sessão, 403 `forbidden` fora de `marcelo|ti`, 200 com `{accounts,limit,
//    offset,role}` para os dois papéis, `POST` 201 e `PATCH` de situação com
//    trilha de auditoria (`account_create`, `account_status`);
//  - "menu não é autorização": o papel `comercial` recebe o estado negado do
//    AdminGate (`data-admin-gate="forbidden"`) e nenhuma lista de cadastros;
//  - os defeitos corrigidos nesta fatia: a falha na RELEITURA preserva os
//    cadastros já lidos (lista e seletores das sete seções) e vira faixa
//    `role="alert"` com o motivo real, a hora da última leitura concluída e
//    "Tentar novamente"; a releitura em curso é `role="status"` e NÃO esconde
//    o conteúdo; a falha na PRIMEIRA leitura não vira "Carregando cadastros…"
//    eterno; a negativa (401/403) descarta o dado e falha fechada, sem
//    convidar a repetir a mesma chamada;
//  - 320/390/768/1440 px em dia e 768 px à noite sem transbordo de documento,
//    com percurso de teclado e foco visível medido.
//
// A falha é injetada apenas em `window.fetch` dentro da própria página, pela
// bandeira `window.__uxp06Falha` (mesma convenção dos gates da carteira, dos
// contratos e do detalhe). O servidor NUNCA é enfraquecido.
//
// O que este gate NÃO prova: validação manual, aceite humano de Marcelo,
// Andreia ou TI, homologação em produção, HTTPS hospedado ou banco do
// operador. Os dados são inteiramente sintéticos e o cluster é destruído no fim.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { provisionStaff, STAFF_TEST_PASSWORD } from './helpers/staff-login.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);
const root = path.resolve(import.meta.dirname, '..');
const evidenceDir = process.env.UX_PRO_06_CLIENTES_EVIDENCE_DIR || '';
const STAGE = 'ux-pro-06-contas-admin';
const ROUTE = '/admin/clientes';
const READ_PATH = '/api/admin/client-accounts';

let server, baseUrl, pool;
let tiCookie, marceloCookie, comercialCookie;
let accountOne, accountTwo;
const evidenceEntries = [];
const evidenceProblems = [];

async function waitForServer(url, timeoutMs = 180_000) {
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
  }).then(async res => ({
    status: res.status,
    body: await res.json().catch(() => null),
    setCookie: res.headers.getSetCookie?.() || [],
  }));
}

async function loginStaffHttp(email) {
  const res = await api('/api/admin/session', { method: 'POST', body: { email, password: STAFF_TEST_PASSWORD } });
  assert.equal(res.status, 200, `login deveria retornar 200, veio ${res.status}`);
  const raw = res.setCookie.find(item => item.startsWith('seg_admin_session='));
  assert.ok(raw, 'login precisa emitir o cookie de sessão de equipe');
  return raw.split(';')[0];
}

// O Chromium empacotado roda com --single-process e às vezes sai com SIGSEGV no
// próprio lançamento. Repetir o `launch` não enfraquece asserção alguma.
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

// Um crash do navegador NÃO é resultado de teste: repete a sessão inteira e
// repassa na hora qualquer falha de asserção.
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
      console.log(`UX_PRO_06_CLIENTES_BROWSER_RETRY tentativa=${tentativa}: ${String(erro.message).split('\n')[0]}`);
    } finally {
      await browser.close().catch(() => {});
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw ultimo;
}

/**
 * Abre `/admin/clientes` autenticado, com `window.fetch` controlável:
 * - `window.__uxp06Falha` = { status, code } derruba os GET da leitura de
 *   cadastros; `null` desliga;
 * - `window.__uxp06Atraso` = ms atrasa esses mesmos GET.
 * As escritas (POST/PATCH) e as leituras das outras seções nunca são tocadas.
 */
async function abrirTela(browser, cookie, { width = 1440, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  const separador = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, separador), value: cookie.slice(separador + 1), url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(90_000);
  await page.addInitScript(({ leitura }) => {
    window.__uxp06Falha = null;
    window.__uxp06Atraso = 0;
    const original = window.fetch.bind(window);
    const ehLeituraDeCadastros = (url, metodo) => metodo === 'GET'
      && url.includes(leitura)
      && !new URL(url, window.location.origin).pathname.replace(/\/$/, '').match(/\/[0-9a-f-]{36}$/i);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input?.url || '');
      const metodo = (init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
      if (ehLeituraDeCadastros(url, metodo) && window.__uxp06Atraso) {
        await new Promise(r => setTimeout(r, window.__uxp06Atraso));
      }
      if (ehLeituraDeCadastros(url, metodo) && window.__uxp06Falha) {
        const { status, code } = window.__uxp06Falha;
        return new Response(JSON.stringify({ error: code }), {
          status, headers: { 'content-type': 'application/json' },
        });
      }
      return original(input, init);
    };
  }, { leitura: READ_PATH });
  await page.goto(`${baseUrl}${ROUTE}`, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

/** Tema dia/noite pelo controle real do envelope administrativo. */
async function ajustarTema(page, desejado) {
  const atual = await page.evaluate(() => document.documentElement.dataset.adminTheme || 'day');
  if (atual === desejado) return;
  await page.click('[data-admin-theme-toggle="true"]');
  await page.waitForFunction(
    valor => (document.documentElement.dataset.adminTheme || 'day') === valor,
    desejado,
    { timeout: 20_000 },
  );
}

/** Transbordo do documento e dos painéis da rota, medido no navegador. */
async function medirTransbordo(page) {
  return page.evaluate(() => {
    const documento = {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
    const largos = [...document.querySelectorAll('main *')]
      .filter(el => el.getBoundingClientRect().width > 0)
      .map(el => ({
        seletor: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`,
        right: Math.round(el.getBoundingClientRect().right),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }))
      .filter(item => item.right > documento.clientWidth + 1 || item.scrollWidth > item.clientWidth + 1)
      .slice(0, 8);
    return { documento, sobra: documento.scrollWidth - documento.clientWidth, largos };
  });
}

async function capture(page, nome) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage: true });
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
      NEXT_DIST_DIR: '.next/integration-ux-pro-06-clientes',
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      EMPLOYEE_SESSION_SECRET: randomUUID().repeat(2),
      ADMIN_LOGIN_MAX_ATTEMPTS: '200',
      SITE_ADMIN_LEGACY_TOKENS: '',
      SITE_ADMIN_TOKEN_TI: '',
      SITE_ADMIN_TOKEN_MARCELO: '',
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
  const marcelo = await provisionStaff(pool, { role: 'marcelo' });
  const comercial = await provisionStaff(pool, { role: 'comercial' });
  tiCookie = await loginStaffHttp(ti.email);
  marceloCookie = await loginStaffHttp(marcelo.email);
  comercialCookie = await loginStaffHttp(comercial.email);

  // Massa sintética criada pela própria API canônica — nada de SQL de negócio.
  const sufixo = randomUUID().slice(0, 8);
  const criado = await api(READ_PATH, {
    method: 'POST',
    cookie: tiCookie,
    body: {
      displayName: `Condomínio Sintético UX-PRO-06 ${sufixo}`,
      documentRef: '12.345.678/0001-90',
      notes: 'Massa fictícia do gate UX-PRO-06 de /admin/clientes; nenhum dado real.',
    },
  });
  assert.equal(criado.status, 201, `criação do cadastro deveria ser 201, veio ${criado.status} ${JSON.stringify(criado.body)}`);
  accountOne = { id: criado.body.accountId, displayName: `Condomínio Sintético UX-PRO-06 ${sufixo}` };

  const segundo = await api(READ_PATH, {
    method: 'POST',
    cookie: tiCookie,
    body: {
      displayName: `Empresa Sintética Releitura ${sufixo}`,
      notes: 'Segundo cadastro sintético, criado para provar que a repetição volta a ler de verdade.',
    },
  });
  assert.equal(segundo.status, 201, `segundo cadastro deveria ser 201, veio ${segundo.status}`);
  accountTwo = { id: segundo.body.accountId, displayName: `Empresa Sintética Releitura ${sufixo}` };

  // A rota precisa estar compilada antes do primeiro navegador (dev sob demanda).
  for (const rota of ['/admin/entrar', ROUTE]) {
    const deadline = Date.now() + 300_000;
    for (;;) {
      try {
        const res = await fetch(`${baseUrl}${rota}`, { redirect: 'manual' });
        if (res.status !== 404) break;
      } catch { /* ainda compilando */ }
      if (Date.now() > deadline) throw new Error(`page_compile_timeout_${rota}`);
      await new Promise(r => setTimeout(r, 500));
    }
  }
});

after(async () => {
  if (evidenceDir && evidenceEntries.length) {
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(path.join(evidenceDir, 'resumo.json'), JSON.stringify({
      stage: STAGE,
      generatedBy: 'gate npm run test:ux-pro-06-clientes:pg (UX_PRO_06_CLIENTES_EVIDENCE_DIR=docs/ux-pro-06-contas-admin-evidencias)',
      notes: 'Evidências da fatia UX-PRO-06 — estados de leitura dos cadastros centrais de clientes em /admin/clientes. Massa inteiramente sintética criada pela própria API canônica; sessão de staff individual provisionada pelo gate. Nenhuma captura contém dado pessoal, credencial ou segredo. Chromium automatizado com PostgreSQL descartável NÃO é validação manual nem aceite humano.',
      entries: evidenceEntries,
      problems: evidenceProblems,
      limites: [
        'Medição automatizada por Chromium com massa sintética; não é validação manual nem aceite de Marcelo, Andreia ou TI.',
        'As capturas da main SEM a correção ficam em antes/ e documentam o defeito corrigido, fora deste resumo de propósito.',
        'O inventário continua registrando validacao manual: nao_registrado e aceite humano: nao_registrado.',
      ],
    }, null, 2) + '\n', 'utf8');
  }
  await pool?.end().catch(() => {});
  if (server && !server.killed) {
    server.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 300));
    server.kill('SIGKILL');
  }
});

function registrarEvidencia(entry) {
  if (!evidenceDir) return;
  evidenceEntries.push({ stage: STAGE, route: ROUTE, role: 'ti', ...entry });
}

test('UX-PRO-06 contas: o contrato de leitura e escrita dos cadastros não mudou', { skip: !RUN }, async () => {
  const anonimo = await api(READ_PATH);
  assert.equal(anonimo.status, 401, 'sem sessão a leitura é recusada');
  assert.equal(anonimo.body?.error, 'admin_session_required');
  assert.ok(!('accounts' in (anonimo.body || {})), 'a negativa não pode vazar cadastro algum');

  const foraDoPapel = await api(READ_PATH, { cookie: comercialCookie });
  assert.equal(foraDoPapel.status, 403, 'papel fora de marcelo|ti é recusado pelo servidor');
  assert.equal(foraDoPapel.body?.error, 'forbidden');

  for (const [papel, cookie] of [['ti', tiCookie], ['marcelo', marceloCookie]]) {
    const leitura = await api(READ_PATH, { cookie });
    assert.equal(leitura.status, 200, `${papel} lê os cadastros`);
    assert.equal(leitura.body?.role, papel);
    assert.ok(Array.isArray(leitura.body?.accounts), 'a resposta mantém a forma {accounts,limit,offset,role}');
    assert.equal(typeof leitura.body?.limit, 'number');
    assert.equal(typeof leitura.body?.offset, 'number');
    const nomes = leitura.body.accounts.map(item => item.id);
    assert.ok(nomes.includes(accountOne.id) && nomes.includes(accountTwo.id), 'os dois cadastros sintéticos estão na leitura');
  }

  const suspendido = await api(`${READ_PATH}/${accountTwo.id}`, { method: 'PATCH', cookie: tiCookie, body: { status: 'suspended' } });
  assert.equal(suspendido.status, 200, 'a escrita de situação continua funcionando');
  const depois = await api(READ_PATH, { cookie: tiCookie });
  assert.equal(depois.body.accounts.find(item => item.id === accountTwo.id).status, 'suspended');
  const ativa = await api(`${READ_PATH}/${accountTwo.id}`, { method: 'PATCH', cookie: marceloCookie, body: { status: 'active' } });
  assert.equal(ativa.status, 200, 'marcelo também opera a situação, como antes');

  const auditoria = await pool.query(
    `SELECT action, count(*)::int AS total FROM auth_access_audit
     WHERE target = $1 AND action IN ('account_create','account_status')
     GROUP BY action ORDER BY action`,
    [accountTwo.id],
  );
  assert.deepEqual(auditoria.rows.map(row => [row.action, row.total]), [['account_create', 1], ['account_status', 2]],
    'a trilha de auditoria das escritas continua gravada');

  const metodoErrado = await api(READ_PATH, { method: 'DELETE', cookie: tiCookie });
  assert.equal(metodoErrado.status, 405, 'métodos fora do contrato continuam recusados');
});

test('UX-PRO-06 contas: menu não é autorização — comercial vê o gate negar e nenhuma lista', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrirTela(browser, comercialCookie);
    await page.locator('[data-admin-gate="forbidden"]').waitFor({ timeout: 60_000 });
    assert.equal(await page.locator('[data-testid="clientes-contas-lista"]').count(), 0,
      'quem não tem papel não vê lista de cadastros');
    assert.equal(await page.getByRole('heading', { name: 'Administração de clientes' }).count(), 0,
      'a tela não é renderizada para papel recusado');
    await context.close();
  });
});

test('UX-PRO-06 contas: leitura concluída mostra os cadastros sem faixa alguma', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrirTela(browser, tiCookie);
    const lista = page.locator('[data-testid="clientes-contas-lista"]');
    await lista.waitFor({ timeout: 60_000 });
    assert.ok(await page.locator(`[data-testid="clientes-contas-cadastro-${accountOne.id}"]`).isVisible(),
      'o cadastro sintético está na lista');
    assert.ok(await page.getByText(accountTwo.displayName).first().isVisible(), 'o segundo cadastro também aparece');
    for (const faixa of ['clientes-contas-desatualizada', 'clientes-contas-atualizando', 'clientes-contas-falha', 'clientes-contas-negada', 'clientes-contas-carregando']) {
      assert.equal(await page.locator(`[data-testid="${faixa}"]`).count(), 0, `${faixa} não pode aparecer com leitura concluída`);
    }
    // As sete seções continuam consumindo a mesma leitura.
    assert.ok(await page.locator('#grant-account option', { hasText: accountOne.displayName }).count() > 0,
      'a seção 2 (vínculos) mantém o seletor de cadastros');
    assert.ok(await page.locator('#contracts-account option', { hasText: accountOne.displayName }).count() > 0,
      'a seção 3 (contratos) mantém o seletor de cadastros');
    await capture(page, 'contas-admin-leitura-concluida');
    await context.close();
  });
});

test('UX-PRO-06 contas: falha na releitura preserva os cadastros já lidos, com hora e repetição', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrirTela(browser, tiCookie);
    const lista = page.locator('[data-testid="clientes-contas-lista"]');
    await lista.waitFor({ timeout: 60_000 });

    // A releitura passa a falhar com 503 e é disparada pelo caminho da pessoa.
    await page.evaluate(() => { window.__uxp06Falha = { status: 503, code: 'database_not_configured' }; });
    await page.locator('[data-testid="clientes-contas-recarregar"]').click();

    const faixa = page.locator('[data-testid="clientes-contas-desatualizada"]');
    await faixa.waitFor({ timeout: 30_000 });
    assert.equal(await faixa.getAttribute('role'), 'alert', 'a faixa de dados preservados é um alerta');
    const texto = await faixa.textContent();
    assert.match(texto, /desatualizados/i, 'a faixa diz que os dados podem estar desatualizados');
    assert.match(texto, /última leitura concluída/i, 'a faixa diz de quando é o dado preservado');
    assert.match(texto, /\d{1,2}:\d{2}/, 'a faixa cita a hora da última leitura concluída');
    assert.match(texto, /não significa/i, 'a faixa nega a leitura de "nenhum cadastro"');
    assert.ok(await page.locator(`[data-testid="clientes-contas-cadastro-${accountOne.id}"]`).isVisible(),
      'o cadastro já lido NÃO pode sumir quando a releitura falha');
    assert.ok(await lista.isVisible(), 'a lista continua na tela');
    assert.ok(await page.locator('#grant-account option', { hasText: accountOne.displayName }).count() > 0,
      'as outras seções também preservam os cadastros já lidos');
    assert.equal(await page.locator('[data-testid="clientes-contas-carregando"]').count(), 0,
      'com dado preservado não há "carregando" eterno');
    await capture(page, 'contas-admin-desatualizada');

    // Repetir dentro da faixa volta a falar com o servidor e limpa o aviso.
    await page.evaluate(() => { window.__uxp06Falha = null; });
    await faixa.locator('button', { hasText: 'Tentar novamente' }).click();
    await faixa.waitFor({ state: 'detached', timeout: 30_000 });
    assert.ok(await page.locator(`[data-testid="clientes-contas-cadastro-${accountOne.id}"]`).isVisible(),
      'os cadastros continuam na tela após a repetição concluir');
    await context.close();
  });
});

test('UX-PRO-06 contas: a repetição lê de verdade e traz o cadastro criado durante a falha', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrirTela(browser, tiCookie);
    const lista = page.locator('[data-testid="clientes-contas-lista"]');
    await lista.waitFor({ timeout: 60_000 });

    await page.evaluate(() => { window.__uxp06Falha = { status: 503, code: 'database_not_configured' }; });
    await page.locator('[data-testid="clientes-contas-recarregar"]').click();
    const faixa = page.locator('[data-testid="clientes-contas-desatualizada"]');
    await faixa.waitFor({ timeout: 30_000 });

    // O cadastro é criado DURANTE a falha, por HTTP real e fora da página.
    const terceiro = await api(READ_PATH, {
      method: 'POST',
      cookie: tiCookie,
      body: { displayName: `Cadastro Criado Durante a Falha ${randomUUID().slice(0, 8)}` },
    });
    assert.equal(terceiro.status, 201, `criação durante a falha deveria ser 201, veio ${terceiro.status}`);
    assert.equal(await page.locator(`[data-testid="clientes-contas-cadastro-${terceiro.body.accountId}"]`).count(), 0,
      'o dado preservado é o da última leitura concluída: não inclui o que foi criado durante a falha');

    await page.evaluate(() => { window.__uxp06Falha = null; });
    await faixa.locator('button', { hasText: 'Tentar novamente' }).click();
    await faixa.waitFor({ state: 'detached', timeout: 30_000 });
    // A faixa sai assim que a repetição começa (o indicador role="status" assume
    // o lugar dela); o que prova a leitura nova é o cadastro criado durante a
    // falha aparecer depois de a repetição concluir.
    const novo = page.locator(`[data-testid="clientes-contas-cadastro-${terceiro.body.accountId}"]`);
    await novo.waitFor({ timeout: 30_000 });
    assert.ok(await novo.isVisible(), 'a repetição bem-sucedida traz a leitura nova, não um cache');
    assert.equal(await page.locator('[data-testid="clientes-contas-desatualizada"]').count(), 0,
      'repetição concluída com sucesso limpa a faixa de desatualização');
    await context.close();
  });
});

test('UX-PRO-06 contas: releitura em curso mantém o conteúdo visível com role=status', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrirTela(browser, tiCookie);
    const lista = page.locator('[data-testid="clientes-contas-lista"]');
    await lista.waitFor({ timeout: 60_000 });

    await page.evaluate(() => { window.__uxp06Atraso = 4000; });
    await page.locator('[data-testid="clientes-contas-recarregar"]').click();

    const indicador = page.locator('[data-testid="clientes-contas-atualizando"]');
    await indicador.waitFor({ timeout: 30_000 });
    assert.equal(await indicador.getAttribute('role'), 'status', 'a releitura em curso é anunciada por role=status');
    assert.ok(await lista.isVisible(), 'a lista NÃO pode desaparecer durante a atualização');
    assert.ok(await page.locator(`[data-testid="clientes-contas-cadastro-${accountOne.id}"]`).isVisible(),
      'o conteúdo já lido permanece visível durante a releitura');
    await capture(page, 'contas-admin-atualizando');

    await indicador.waitFor({ state: 'detached', timeout: 30_000 });
    assert.equal(await page.locator('[data-testid="clientes-contas-desatualizada"]').count(), 0,
      'releitura concluída não é desatualização');
    await context.close();
  });
});

test('UX-PRO-06 contas: falha na primeira leitura não vira "Carregando cadastros…" eterno', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
    const separador = tiCookie.indexOf('=');
    await context.addCookies([{ name: tiCookie.slice(0, separador), value: tiCookie.slice(separador + 1), url: baseUrl }]);
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);
    await page.addInitScript(({ leitura }) => {
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        const metodo = (init?.method || 'GET').toUpperCase();
        if (metodo === 'GET' && url.includes(leitura) && !/[0-9a-f-]{36}$/i.test(new URL(url, window.location.origin).pathname)) {
          return new Response(JSON.stringify({ error: 'database_not_configured' }), {
            status: 503, headers: { 'content-type': 'application/json' },
          });
        }
        return original(input, init);
      };
    }, { leitura: READ_PATH });
    await page.goto(`${baseUrl}${ROUTE}`, { waitUntil: 'domcontentloaded' });

    const falha = page.locator('[data-testid="clientes-contas-falha"]');
    await falha.waitFor({ timeout: 60_000 });
    assert.equal(await falha.getAttribute('role'), 'alert', 'a falha sem leitura anterior é um alerta');
    assert.equal(await page.locator('[data-testid="clientes-contas-carregando"]').count(), 0,
      'o spinner não pode ficar eterno depois da falha');
    assert.equal(await page.locator('[data-testid="clientes-contas-lista"]').count(), 0,
      'falha de leitura não é lista vazia');
    assert.equal(await page.getByText('Nenhum cadastro criado ainda').count(), 0,
      'falha de leitura não é "nenhum cadastro"');
    assert.match(await falha.textContent(), /Tentar novamente/i, 'a falha transitória oferece repetição');
    assert.ok(await page.getByRole('heading', { name: 'Administração de clientes' }).isVisible(),
      'a casca da tela permanece, com o erro declarado');
    await capture(page, 'contas-admin-falha-sem-leitura');
    await context.close();
  });
});

test('UX-PRO-06 contas: negativa na releitura falha fechada, sem dado preservado nem repetição', { skip: !RUN }, async () => {
  for (const [rotulo, injecao] of [
    ['sessão expirada', { status: 401, code: 'admin_session_required' }],
    ['papel recusado', { status: 403, code: 'forbidden' }],
  ]) {
    // Um navegador por caso: o Chromium empacotado roda com --single-process e
    // não tolera vários contextos sequenciais na mesma instância (mesma
    // convenção dos gates da carteira, dos contratos e do detalhe).
    await comNavegador(async browser => {
      const { context, page } = await abrirTela(browser, tiCookie);
      const lista = page.locator('[data-testid="clientes-contas-lista"]');
      await lista.waitFor({ timeout: 60_000 });
      assert.ok(await page.locator(`[data-testid="clientes-contas-cadastro-${accountOne.id}"]`).isVisible());

      await page.evaluate(valor => { window.__uxp06Falha = valor; }, injecao);
      await page.locator('[data-testid="clientes-contas-recarregar"]').click();

      const negada = page.locator('[data-testid="clientes-contas-negada"]');
      await negada.waitFor({ timeout: 30_000 });
      assert.equal(await negada.getAttribute('role'), 'alert', `negativa (${rotulo}) é alerta`);
      assert.equal(await page.locator(`[data-testid="clientes-contas-cadastro-${accountOne.id}"]`).isVisible(), false,
        `dúvida de autorização (${rotulo}) NÃO mantém dado na tela`);
      assert.equal(await page.locator('[data-testid="clientes-contas-desatualizada"]').count(), 0,
        `negativa (${rotulo}) não vira faixa de dados desatualizados`);
      assert.equal(await negada.locator('button').count(), 0,
        `negativa (${rotulo}) não convida a repetir a mesma chamada`);
      assert.equal(await page.locator('#grant-account option', { hasText: accountOne.displayName }).count(), 0,
        `as outras seções (${rotulo}) também não mantêm o dado`);
      assert.equal(await page.locator('[data-testid="clientes-contas-lista"]').count(), 0,
        `a lista (${rotulo}) sai de tela junto com o dado`);
      if (rotulo === 'sessão expirada') await capture(page, 'contas-admin-negada');
      await context.close();
    });
  }
});

test('UX-PRO-06 contas: 320/390/768/1440 dia e noite sem transbordo, com percurso de teclado', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrirTela(browser, tiCookie, { width: 1440, height: 900 });
    await page.locator('[data-testid="clientes-contas-lista"]').waitFor({ timeout: 60_000 });

    const larguras = [[320, 844], [390, 844], [768, 1024], [1440, 900]];
    for (const tema of ['day', 'night']) {
      await ajustarTema(page, tema);
      for (const [largura, altura] of larguras) {
        // O escopo pedido registra noite apenas em 768 px; as demais larguras
        // noturnas continuam medidas para não deixar transbordo passar.
        await page.setViewportSize({ width: largura, height: altura });
        await page.waitForTimeout(250);
        let medida = await medirTransbordo(page);
        if (medida.sobra > 1) { await page.waitForTimeout(400); medida = await medirTransbordo(page); }
        if (medida.sobra > 1) {
          evidenceProblems.push({ viewport: `${largura}x${altura}`, theme: tema, sobra: medida.sobra, largos: medida.largos });
        }
        assert.ok(medida.sobra <= 1, `transbordo de documento em ${largura}px (${tema}): ${JSON.stringify(medida)}`);
        if (tema === 'day' || largura === 768) {
          const nome = `contas-admin-${largura}-${tema === 'night' ? 'noite' : 'dia'}`;
          await capture(page, nome);
          registrarEvidencia({
            viewport: `${largura}x${altura}`,
            theme: tema,
            screenshot: `${evidenceDir}/${nome}.png`,
            problems: medida.sobra > 1 ? [`sobra de ${medida.sobra}px`] : [],
          });
        }
      }
    }

    // Percurso de teclado em 390 px: foco visível medido, do link de trilha ao
    // botão de recarregar e ao primeiro campo do formulário de cadastro.
    await ajustarTema(page, 'day');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    await page.evaluate(() => document.body.focus());
    const percorridos = [];
    let primeiroFoco = false;
    for (let passo = 0; passo < 40; passo++) {
      await page.keyboard.press('Tab');
      const foco = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const estilo = getComputedStyle(el);
        const caixa = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          testid: el.getAttribute('data-testid') || null,
          rotulo: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('name') || '').trim().slice(0, 60),
          outline: estilo.outlineStyle,
          outlineWidth: parseFloat(estilo.outlineWidth || '0'),
          boxShadow: estilo.boxShadow,
          visivel: caixa.width > 0 && caixa.height > 0,
        };
      });
      if (!foco) continue;
      if (!primeiroFoco) {
        primeiroFoco = foco.outline !== 'none' || foco.outlineWidth > 0 || foco.boxShadow !== 'none';
      }
      percorridos.push(foco);
      if (foco.testid === 'clientes-contas-recarregar') break;
    }
    assert.ok(primeiroFoco, 'o primeiro elemento focável precisa ter foco visível');
    assert.ok(percorridos.some(item => item.testid === 'clientes-contas-recarregar'),
      'o percurso de teclado alcança a recarga da leitura');
    assert.ok(percorridos.some(item => item.id === 'new-account-name'),
      'o percurso de teclado alcança o formulário de criação de cadastro');
    await page.locator('[data-testid="clientes-contas-recarregar"]').focus();
    await capture(page, 'contas-admin-390-teclado');
    registrarEvidencia({
      viewport: '390x844',
      theme: 'day',
      state: 'percurso_teclado',
      firstFocus: primeiroFoco,
      keyboardPath: percorridos.slice(0, 12).map(item => item.rotulo || item.tag),
      screenshot: `${evidenceDir}/contas-admin-390-teclado.png`,
      problems: [],
    });

    // Faixa de desatualização também é medida nas duas larguras extremas.
    for (const [largura, altura] of [[320, 844], [1440, 900]]) {
      await page.setViewportSize({ width: largura, height: altura });
      await page.waitForTimeout(200);
      await page.evaluate(() => { window.__uxp06Falha = { status: 503, code: 'database_not_configured' }; });
      await page.locator('[data-testid="clientes-contas-recarregar"]').click();
      const faixa = page.locator('[data-testid="clientes-contas-desatualizada"]');
      await faixa.waitFor({ timeout: 30_000 });
      const medida = await medirTransbordo(page);
      assert.ok(medida.sobra <= 1, `faixa de desatualização causa transbordo em ${largura}px: ${JSON.stringify(medida)}`);
      const contraste = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="clientes-contas-desatualizada"]');
        if (!el) return null;
        const canal = cor => (cor.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const fundo = (() => {
          for (let alvo = el; alvo; alvo = alvo.parentElement) {
            const cor = getComputedStyle(alvo).backgroundColor;
            const valores = (cor.match(/[\d.]+/g) || []).map(Number);
            if (valores.length >= 3 && (valores.length < 4 || valores[3] > 0.5)) return valores.slice(0, 3);
          }
          return [255, 255, 255];
        })();
        const lum = ([r, g, b]) => {
          const f = x => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const [l1, l2] = [lum(canal(getComputedStyle(el).color)), lum(fundo)].sort((a, b) => b - a);
        return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
      });
      assert.ok(contraste >= 4.5, `contraste da faixa em ${largura}px ficou em ${contraste}`);
      const nome = `contas-admin-${largura}-desatualizada`;
      await capture(page, nome);
      registrarEvidencia({
        viewport: `${largura}x${altura}`,
        theme: 'day',
        state: 'dados_preservados',
        contrastRatio: contraste,
        screenshot: `${evidenceDir}/${nome}.png`,
        problems: [],
      });
      await page.evaluate(() => { window.__uxp06Falha = null; });
      await faixa.locator('button', { hasText: 'Tentar novamente' }).click();
      await faixa.waitFor({ state: 'detached', timeout: 30_000 });
    }
    await context.close();
  });
});
