// RAG-01b — gate Chromium dos assistentes privados (cliente / RH / Marcelo).
//
// O que este gate PROVA, em navegador real sobre PostgreSQL descartável:
//   - o papel decide o acesso à TELA: anônimo vai ao login central, papel sem
//     permissão vê a recusa honesta do AdminGate e nenhuma estrutura de assistente;
//   - o vínculo decide o CORPUS: o cliente A só recebe documento da própria conta,
//     o cliente B idem, e nenhum dos dois vê o documento do outro;
//   - RH e Marcelo recebem cada um a sua base, nunca a do outro;
//   - sem modelo local, o assistente privado mostra as fontes recuperadas e diz
//     "nenhuma resposta foi gerada" — nunca um texto simulado;
//   - o feedback do cliente é gravado pelo protocolo canônico, ligado ao evento do
//     próprio cliente que perguntou.
//
// O que este gate NÃO prova: qualidade de resposta do modelo (exige Ollama com
// modelo instalado), homologação humana e desempenho. Massa 100% fictícia.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { hashPassword } from '../src/lib/client-auth-core.mjs';
import { provisionStaff, loginStaff, STAFF_TEST_PASSWORD } from './helpers/staff-login.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);
const REQUIRE = process.env.QA_RAG_CHROMIUM_REQUIRE_DB === '1';
const SKIP = RUN ? false : (REQUIRE ? false : 'requer PostgreSQL descartável + Chromium (scripts/qa-rag-private-chromium.mjs)');
const root = path.resolve(import.meta.dirname, '..');

let server;
let baseUrl;
let pool;
let staff;
let clients;
const documents = {};

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
  });
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function api(pathname, { method = 'GET', cookie = null, body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { origin: baseUrl } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
    signal: AbortSignal.timeout(90_000),
  });
  return { status: response.status, body: await response.json().catch(() => null), setCookie: response.headers.getSetCookie?.() || [] };
}

async function waitForServer(url, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health/live`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch { /* ainda iniciando */ }
    await wait(400);
  }
  throw new Error('server_did_not_start');
}

function cookieHeaderFrom(setCookie, name) {
  const raw = setCookie.find(item => item.startsWith(`${name}=`));
  assert.ok(raw, `login deveria emitir o cookie ${name}`);
  return raw.split(';')[0];
}

// O índice nasce em rascunho no PostgreSQL (migração 095): publicar é curadoria.
async function publishIndex(ragKey) {
  const list = await api('/api/admin/ai-rag-indexes', { cookie: staff.admin.cookie });
  assert.equal(list.status, 200);
  const index = (list.body.items || []).find(item => item.rag_key === ragKey);
  assert.ok(index, `índice ${ragKey} deveria existir`);
  if (index.is_published && index.is_approved) return index;
  const published = await api('/api/admin/ai-rag-indexes', {
    method: 'PATCH', cookie: staff.admin.cookie,
    body: { id: index.id, status: 'publicado', is_approved: true, is_published: true, reason: 'Publicação do índice sintético do gate RAG-01b' },
  });
  assert.equal(published.status, 200, `índice ${ragKey} deveria ser publicado`);
  return published.body;
}

async function createPublishedDocument({ ragKey, title, content, clientAccountId }) {
  const created = await api('/api/admin/ai-rag-documents', {
    method: 'POST', cookie: staff.admin.cookie,
    body: { rag_key: ragKey, title, content, source: 'Gate Chromium RAG-01b (fictício)', source_type: 'politica', keywords: [], ...(clientAccountId ? { client_account_id: clientAccountId } : {}) },
  });
  assert.equal(created.status, 201, `documento sintético deveria ser criado: ${JSON.stringify(created.body)}`);
  const published = await api('/api/admin/ai-rag-documents', {
    method: 'PATCH', cookie: staff.admin.cookie,
    body: { id: created.body.id, status: 'publicado', is_approved: true, is_published: true },
  });
  assert.equal(published.status, 200);
  return published.body;
}

async function provisionClient({ tag, accountName }) {
  const identityId = randomUUID();
  const accountId = randomUUID();
  const email = `rag-01b-cliente-${tag.toLowerCase()}-${identityId.slice(0, 8)}@exemplo.invalid`;
  const password = `Cliente-Ficticio-${randomUUID()}!`;
  await pool.query(`INSERT INTO client_accounts (id, display_name, status, created_by) VALUES ($1,$2,'active','ti')`, [accountId, accountName]);
  await pool.query(
    `INSERT INTO auth_identities (id, kind, email, display_name, status, verification_method, verified_at)
     VALUES ($1,'client',$2,$3,'active','email_link',NOW())`,
    [identityId, email, `Cliente fictício ${tag} RAG-01b`],
  );
  await pool.query('INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)', [identityId, await hashPassword(password)]);
  await pool.query(
    `INSERT INTO client_access_grants (id, identity_id, client_account_id, reason, granted_by)
     VALUES ($1,$2,$3,'Vínculo fictício do gate RAG-01b','ti')`,
    [randomUUID(), identityId, accountId],
  );
  const login = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(login.status, 200, `login do cliente ${tag} deveria retornar 200 (${JSON.stringify(login.body)})`);
  return { id: identityId, email, accountId, cookie: cookieHeaderFrom(login.setCookie, 'seg_client_session') };
}

// O Chromium empacotado roda em --single-process: cada teste abre o seu browser.
async function launchBrowser() {
  return playwrightChromium.launch({
    executablePath: await packagedChromium.executablePath(),
    args: packagedChromium.args.filter(arg => arg !== '--disable-web-security'),
    headless: true,
  });
}

const lastAnswer = new WeakMap();
const consoleNoise = new WeakMap();

/**
 * Espera o React assumir o DOM. Interagir antes disso preenche o campo sem que o
 * componente veja o texto — o clique seguinte submeteria vazio. O sinal vem dos
 * internos do React no próprio elemento (anexados na hidratação).
 */
async function waitForHydration(page, selector, { reloads = 3 } = {}) {
  for (let attempt = 0; attempt <= reloads; attempt += 1) {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      const hydrated = await page.evaluate(sel => {
        const element = document.querySelector(sel);
        if (!element) return false;
        return Object.keys(element).some(key => key.startsWith('__reactFiber$') || key.startsWith('__reactContainer$'));
      }, selector).catch(() => false);
      if (hydrated) return true;
      await wait(400);
    }
    if (attempt < reloads) await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  }
  return false;
}

async function openPage(browser, route, cookie, { hydrateSelector = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  if (cookie) {
    await context.addCookies(cookie.split('; ').filter(Boolean).map(item => {
      const separator = item.indexOf('=');
      return { name: item.slice(0, separator), value: item.slice(separator + 1), url: baseUrl };
    }));
  }
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);
  page.setDefaultNavigationTimeout(120_000);
  // Diagnóstico honesto: guarda a última resposta do assistente para que a falha
  // do teste mostre o que o servidor devolveu, em vez de só "não apareceu".
  page.on('response', async response => {
    if (!response.url().includes('/api/ai/answer')) return;
    lastAnswer.set(page, { status: response.status(), body: await response.text().catch(() => '') });
  });
  const noise = [];
  consoleNoise.set(page, noise);
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) noise.push(`${message.type()}: ${message.text().slice(0, 200)}`); });
  page.on('pageerror', error => noise.push(`pageerror: ${String(error).slice(0, 200)}`));
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
  if (hydrateSelector) {
    const hydrated = await waitForHydration(page, hydrateSelector);
    if (!hydrated) throw new Error(`hidratação não concluída em ${route}: ${(consoleNoise.get(page) || []).slice(0, 3).join(' // ')}`);
  }
  return { context, page };
}

const TERMINAL_STATES = ['answered', 'empty', 'refused', 'unavailable', 'failed'];

/**
 * Pergunta pelo próprio widget e espera um estado terminal.
 *
 * Em modo de desenvolvimento o React hidrata depois do DOM: clicar antes da
 * hidratação não submete nada. O laço repete o clique até o estado sair de
 * `idle` — se o servidor responder com erro, o estado muda na mesma hora e o
 * teste segue para a asserção específica, sem esconder falha de produto.
 */
async function askWidget(page, ragKey, question) {
  const widget = page.locator(`[data-rag-key="${ragKey}"]`);
  await widget.waitFor();
  // O contador "N/500 caracteres" é renderizado pelo próprio React: ele prova que
  // a digitação chegou ao estado do componente. Sem essa espera o clique pode
  // submeter campo vazio (o DOM aceita o texto antes da hidratação).
  const counter = widget.locator('span[id$="-help"]').first();
  const typedDeadline = Date.now() + 75_000;
  let registered = false;
  while (Date.now() < typedDeadline && !registered) {
    await widget.locator('textarea:not([id$="-comment"])').first().fill(question);
    const text = await counter.innerText().catch(() => '');
    registered = text.trim().startsWith(`${question.length}/`);
    if (!registered) await wait(500);
  }
  if (!registered) {
    const field = await widget.locator('textarea:not([id$="-comment"])').first().inputValue().catch(() => '(sem textarea)');
    const help = await widget.locator('span[id$="-help"]').first().innerText().catch(() => '(sem contador)');
    throw new Error(`o campo de pergunta não registrou o texto digitado | valor no DOM: ${JSON.stringify(field)} | contador: ${JSON.stringify(help)}`
      + ` | console: ${(consoleNoise.get(page) || []).slice(0, 4).join(' // ')}`);
  }
  const deadline = Date.now() + 75_000;
  let state = await widget.getAttribute('data-rag-state');
  while (Date.now() < deadline && !TERMINAL_STATES.includes(state || '')) {
    await page.getByRole('button', { name: 'Perguntar' }).click().catch(() => {});
    await wait(700);
    state = await widget.getAttribute('data-rag-state');
    if (state === 'failed') {
      // Clique antes da hidratação não submete; campo vazio se declararia "curta"
      // sem sequer consultar o servidor. Reenvia com o texto já registrado.
      const alertText = await widget.locator('[role="alert"]').innerText().catch(() => '');
      if (/muito curta/i.test(alertText)) { state = 'idle'; continue; }
    }
  }
  if (!TERMINAL_STATES.includes(state || '')) {
    const text = await widget.innerText().catch(() => '');
    const seen = lastAnswer.get(page);
    throw new Error(`widget não saiu do estado ${state}: ${text.slice(0, 400)} | resposta: ${seen ? `${seen.status} ${seen.body.slice(0, 300)}` : 'nenhuma'}`);
  }
  return widget;
}

async function expectState(widget, expected, page = null) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const state = await widget.getAttribute('data-rag-state');
    if (state === expected) return;
    await wait(500);
  }
  const alert = await widget.locator('[role="alert"], [role="status"]').allInnerTexts().catch(() => []);
  const typed = await widget.locator('textarea:not([id$="-comment"])').first().inputValue().catch(() => '(sem textarea)');
  const seen = page ? lastAnswer.get(page) : null;
  throw new Error(`estado esperado ${expected}, atual ${await widget.getAttribute('data-rag-state')}`
    + ` | pergunta no campo: ${JSON.stringify(typed)}`
    + ` | avisos: ${alert.join(' // ').slice(0, 300)}`
    + ` | resposta: ${seen ? `${seen.status} ${seen.body.slice(0, 300)}` : 'nenhuma'}`);
}

async function sourceIds(page) {
  return page.$$eval('[data-rag-source]', nodes => nodes.map(node => node.getAttribute('data-rag-source')));
}

before(async () => {
  if (!RUN) {
    if (REQUIRE) throw new Error('QA_RAG_CHROMIUM_REQUIRE_DB=1 exige DATABASE_URL do gate descartável');
    return;
  }
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const port = Number(process.env.RAG_QA_CHROMIUM_PORT) || await freePort();
  const silentModelPort = Number(process.env.RAG_QA_MODEL_PORT) || await freePort();
  baseUrl = `http://127.0.0.1:${port}`;

  server = spawn(process.execPath, ['server.mjs', '--dev'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: '127.0.0.1',
      NODE_ENV: 'development',
      NEXT_DIST_DIR: '.next/integration-rag-chromium',
      QA_PGLITE_ONLY: '',
      SITE_ADMIN_SESSION_SECRET: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''),
      EMPLOYEE_SESSION_SECRET: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''),
      CLIENT_MFA_ENCRYPTION_KEY: Buffer.from(randomUUID()).toString('base64url').slice(0, 43),
      SITE_ADMIN_LEGACY_TOKENS: '',
      SITE_ADMIN_TOKEN_MARCELO: '',
      SITE_ADMIN_TOKEN_TI: '',
      ADMIN_LOGIN_MAX_ATTEMPTS: '500',
      NEXT_TELEMETRY_DISABLED: '1',
      // Provider habilitado e inalcançável: a resposta sai indisponível COM as
      // fontes recuperadas. Porta silenciosa, não endereço externo.
      OLLAMA_ENABLED: 'true',
      OLLAMA_BASE_URL: `http://127.0.0.1:${silentModelPort}`,
      OLLAMA_MODEL: 'qwen3:1.7b',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', chunk => { if (/error/i.test(String(chunk))) console.error('[server]', String(chunk).slice(0, 300)); });
  await waitForServer(baseUrl);

  const admin = await provisionStaff(pool, { role: 'admin' });
  const rh = await provisionStaff(pool, { role: 'rh' });
  const marcelo = await provisionStaff(pool, { role: 'marcelo' });
  const comercial = await provisionStaff(pool, { role: 'comercial' });
  staff = {
    admin: { ...admin, cookie: await loginStaff(api, admin) },
    rh: { ...rh, cookie: await loginStaff(api, rh) },
    marcelo: { ...marcelo, cookie: await loginStaff(api, marcelo) },
    comercial: { ...comercial, cookie: await loginStaff(api, comercial) },
  };

  // No PostgreSQL o índice de cada área nasce em rascunho (migração 095):
  // publicar é ato de curadoria e passa pela API canônica, nunca por SQL direto.
  for (const ragKey of ['publico', 'cliente', 'rh', 'marcelo']) await publishIndex(ragKey);

  clients = {
    a: await provisionClient({ tag: 'Alpha', accountName: 'Conta fictícia Alpha (gate RAG-01b)' }),
    b: await provisionClient({ tag: 'Beta', accountName: 'Conta fictícia Beta (gate RAG-01b)' }),
  };

  documents.rh = await createPublishedDocument({
    ragKey: 'rh',
    title: 'Admissão e férias na base de RH (fictício do gate)',
    content: 'O gaterecrutamento4471 descreve o fluxo fictício de admissão: documentos, exame admissional e cadastro no sistema. Férias são programadas pelo RH com antecedência e registro no sistema.',
  });
  documents.marcelo = await createPublishedDocument({
    ragKey: 'marcelo',
    title: 'Aprovações e margem na base administrativa (fictício do gate)',
    content: 'O gatereceita8832 descreve o fluxo fictício de aprovação de despesas por alçada e a leitura de margem por contrato no painel administrativo.',
  });
  documents.clienteA = await createPublishedDocument({
    ragKey: 'cliente',
    clientAccountId: clients.a.accountId,
    title: 'Contratos da conta fictícia Alpha',
    content: 'O gatecontratoA5521 é o procedimento fictício de consulta de contratos da conta Alpha: vigência, itens e documentos ficam na área Contratos do portal.',
  });
  documents.clienteB = await createPublishedDocument({
    ragKey: 'cliente',
    clientAccountId: clients.b.accountId,
    title: 'Contratos da conta fictícia Beta',
    content: 'O gatecontratoB7734 é o procedimento fictício de consulta de contratos da conta Beta: vigência, itens e documentos ficam na área Contratos do portal.',
  });
});

after(async () => {
  if (server) server.kill('SIGTERM');
  if (pool) await pool.end().catch(() => {});
});

test('RAG-01b: anônimo não alcança o assistente da equipe', { skip: SKIP }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/admin/rh/assistente');
    await page.waitForURL(/\/admin\/entrar/, { timeout: 90_000 });
    assert.match(page.url(), /\/admin\/entrar\?next=/, 'o anônimo vai ao login central com retorno');
    assert.equal(await page.locator('[data-rag-key="rh"]').count(), 0, 'nenhuma estrutura de assistente para o anônimo');
    await context.close();
  } finally { await browser.close(); }
});

test('RAG-01b: papel sem permissão vê a recusa honesta e nenhum assistente', { skip: SKIP }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/admin/rh/assistente', staff.comercial.cookie);
    await page.locator('[data-admin-gate="forbidden"]').waitFor();
    assert.equal(await page.locator('[data-rag-key="rh"]').count(), 0, 'papel sem permissão não carrega o assistente');
    assert.match(await page.locator('[data-admin-gate="forbidden"]').innerText(), /Acesso restrito a esta área/);
    await context.close();
  } finally { await browser.close(); }
});

test('RAG-01b: RH consulta a própria base e não alcança as outras', { skip: SKIP }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/admin/rh/assistente', staff.rh.cookie, { hydrateSelector: '[data-rag-key="rh"]' });
    const widget = await askWidget(page, 'rh', 'Como funciona o gaterecrutamento4471 na admissão?');
    await expectState(widget, 'unavailable', page);
    const ids = await sourceIds(page);
    assert.deepEqual(ids, [documents.rh.id], 'só a fonte de RH é recuperada');
    assert.ok(!ids.includes(documents.marcelo.id) && !ids.includes(documents.clienteA.id), 'nenhuma base alheia aparece');
    const text = await page.locator('[data-rag-unavailable]').innerText();
    assert.match(text, /nenhuma resposta foi gerada/i, 'o usuário sabe que o texto não foi gerado');
    assert.match(text, /Protocolo RAG-RH-[0-9]{8}-[A-Z0-9]{4}/, 'o protocolo do ledger aparece na tela');
  } finally { await browser.close(); }
});

test('RAG-01b: RH não alcança o assistente do Marcelo', { skip: SKIP }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/admin/marcelo/assistente', staff.rh.cookie);
    await page.locator('[data-admin-gate="forbidden"]').waitFor();
    assert.equal(await page.locator('[data-rag-key="marcelo"]').count(), 0);
    await context.close();
  } finally { await browser.close(); }
});

test('RAG-01b: Marcelo consulta a base administrativa', { skip: SKIP }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/admin/marcelo/assistente', staff.marcelo.cookie, { hydrateSelector: '[data-rag-key="marcelo"]' });
    const widget = await askWidget(page, 'marcelo', 'Como funciona o gatereceita8832 na aprovação?');
    await expectState(widget, 'unavailable', page);
    const ids = await sourceIds(page);
    assert.deepEqual(ids, [documents.marcelo.id]);
    assert.ok(!ids.includes(documents.rh.id));
    await context.close();
  } finally { await browser.close(); }
});

test('RAG-01b: cliente A recebe só a própria conta e grava feedback pelo protocolo', { skip: SKIP }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/cliente/app/assistente', clients.a.cookie, { hydrateSelector: '[data-rag-key="cliente"]' });
    const widget = await askWidget(page, 'cliente', 'Como consultar o gatecontratoA5521 no portal?');
    await expectState(widget, 'unavailable', page);
    const ids = await sourceIds(page);
    assert.deepEqual(ids, [documents.clienteA.id], 'somente o documento da conta A');
    const bodyText = await page.locator('body').innerText();
    assert.ok(!bodyText.includes('Contratos da conta fictícia Beta'), 'o título da conta B não aparece');
    assert.ok(!bodyText.includes('gatecontratoB7734'), 'o conteúdo da conta B não aparece');

    const protocol = (await page.locator('[data-rag-unavailable]').innerText()).match(/RAG-CLI-[0-9]{8}-[A-Z0-9]{4}/)?.[0];
    assert.ok(protocol, 'protocolo do cliente visível na tela');

    await page.getByLabel('Comentário (opcional, até 500 caracteres)').fill('Avaliação fictícia do gate RAG-01b');
    await page.getByRole('button', { name: 'Foi útil' }).click();
    await page.getByText('Avaliação registrada').waitFor();

    const stored = await pool.query(
      `SELECT f.rating, f.is_helpful, f.answer_event_id, f.feedback_text, e.actor_identity, e.rag_key
         FROM ai_rag_feedback f JOIN ai_rag_answer_events e ON e.id = f.answer_event_id
        WHERE f.protocol=$1`,
      [protocol],
    );
    assert.equal(stored.rows.length, 1, 'o feedback foi gravado uma vez');
    assert.equal(stored.rows[0].rag_key, 'cliente');
    assert.equal(stored.rows[0].actor_identity, clients.a.id, 'o feedback pertence ao cliente que perguntou');
    assert.equal(stored.rows[0].is_helpful, true);
    assert.match(stored.rows[0].feedback_text, /gate RAG-01b/);
    await context.close();
  } finally { await browser.close(); }
});

test('RAG-01b: cliente B recebe só a própria conta e não vê a fonte de A', { skip: SKIP }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/cliente/app/assistente', clients.b.cookie, { hydrateSelector: '[data-rag-key="cliente"]' });
    const widget = await askWidget(page, 'cliente', 'Como consultar o gatecontratoB7734 no portal?');
    await expectState(widget, 'unavailable', page);
    const ids = await sourceIds(page);
    assert.deepEqual(ids, [documents.clienteB.id]);
    const bodyText = await page.locator('body').innerText();
    assert.ok(!bodyText.includes('Contratos da conta fictícia Alpha'));
    assert.ok(!bodyText.includes('gatecontratoA5521'));
    await context.close();
  } finally { await browser.close(); }
});

test('RAG-01b: cliente A não descobre o documento da conta B', { skip: SKIP }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/cliente/app/assistente', clients.a.cookie, { hydrateSelector: '[data-rag-key="cliente"]' });
    const widget = await askWidget(page, 'cliente', 'Existe Contratos da conta fictícia Beta no meu acesso?');
    assert.ok(TERMINAL_STATES.includes(await widget.getAttribute('data-rag-state')), 'a consulta terminou em estado declarado');
    const ids = await sourceIds(page);
    assert.ok(!ids.includes(documents.clienteB.id), 'a conta B nunca aparece para a conta A');
    assert.ok(ids.every(id => id === documents.clienteA.id), `fontes inesperadas: ${ids.join(', ')}`);
    const sourcesText = await page.locator('[data-rag-sources], [data-rag-unavailable]').first().innerText().catch(() => '');
    assert.ok(!sourcesText.includes('gatecontratoB7734'), 'nenhum trecho da conta B é mostrado');
    await context.close();
  } finally { await browser.close(); }
});

test('RAG-01b: visitante é levado ao login do cliente e não recebe fonte privada', { skip: SKIP }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPage(browser, '/cliente/app/assistente');
    // O portal redireciona o anônimo para a entrada do cliente assim que a sessão
    // é confirmada ausente. A tela aparece por um instante, o servidor não cede nada.
    await page.waitForURL(/\/cliente\/entrar/, { timeout: 90_000 });
    assert.equal(await page.locator('[data-rag-key="cliente"]').count(), 0, 'sem sessão o assistente não permanece na tela');
    assert.deepEqual(await sourceIds(page), [], 'sem sessão não existe fonte recuperada');

    const refused = await api('/api/ai/answer', { method: 'POST', body: { rag_key: 'cliente', query: 'Como consultar o gatecontratoA5521 no portal?' } });
    assert.equal(refused.status, 401, 'a rota do cliente exige sessão');
    assert.equal(refused.body.error, 'client_session_required');
    assert.equal(refused.body.sources, undefined, 'recusa não devolve fonte');
    await context.close();
  } finally { await browser.close(); }
});

test('RAG-01b: cliente com sessão de equipe não avalia resposta de cliente alheio', { skip: SKIP }, async () => {
  // Guarda de escopo no servidor: staff de RH não avalia protocolo de cliente.
  const eventos = await pool.query('SELECT protocol FROM ai_rag_answer_events WHERE rag_key=$1 ORDER BY created_at DESC LIMIT 1', ['cliente']);
  assert.ok(eventos.rows.length >= 1);
  const attempt = await api('/api/ai/rag/feedback', {
    method: 'POST', cookie: staff.rh.cookie,
    body: { protocol: eventos.rows[0].protocol, rag_key: 'cliente', rating: 5, is_helpful: true },
  });
  assert.ok([401, 403].includes(attempt.status), `esperado 401/403, veio ${attempt.status}`);
  assert.equal(attempt.body.error === 'unauthorized' || attempt.body.error === 'scope_forbidden', true);
});
