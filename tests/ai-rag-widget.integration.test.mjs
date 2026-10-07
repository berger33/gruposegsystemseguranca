// FECH-01 — gate focal do assistente (RagWidget) e do contrato `POST /api/ai/answer`.
//
// Ambiente REAL: PostgreSQL 17 descartável com o ledger canônico aplicado,
// `server.mjs` de verdade, cookies de sessão emitidos pelos endpoints reais de
// login e Chromium real. A massa é fictícia e criada pelas PRÓPRIAS APIs de
// curadoria (`/api/admin/ai-rag-indexes`, `/api/admin/ai-rag-documents`); o SQL
// direto prepara apenas identidades, contas, vínculos e os dois registros
// incoerentes (flag ligada com estado arquivado/rascunho) que provam a trava.
//
// O provedor de modelo é um STUB DETERMINÍSTICO em 127.0.0.1, identificado como
// stub: ele prova o contrato HTTP (quando o modelo é chamado, com qual contexto
// autorizado e o que a tela faz com cada resposta/negativa). NADA aqui é Ollama
// real e nenhum teste deste arquivo mede desempenho, qualidade ou RAM do modelo.
//
// O que este gate prova: RH só lê corpus RH, gestão só lê corpus de gestão,
// cliente A não lê B, público não lê privado, vínculo revogado deixa de
// recuperar, documento arquivado/rascunho não é recuperado nem com flag antiga,
// sem fonte o modelo não é chamado, e a tela apresenta loading/401/403/ausência/
// banco indisponível/modelo desligado-ou-lento/ocupado sem inventar protocolo,
// modelo ou resposta.
//
// O que este gate NÃO prova: homologação humana, aceite de Marcelo/Andreia,
// WCAG integral, produção, Windows, SMTP ou funcionamento do Ollama real.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createServer as createProbe } from 'node:net';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { hashPassword } from '../src/lib/client-auth-core.mjs';
import { provisionStaff, STAFF_TEST_PASSWORD } from './helpers/staff-login.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);
const REQUIRE = process.env.QA_AI_RAG_WIDGET_REQUIRE_DB === '1';
const root = path.resolve(import.meta.dirname, '..');
const opt = { skip: !RUN };
const STUB_MODEL = 'stub-deterministico-fech01';

// Marcadores únicos de um único token: a busca lexical do servidor casa por
// palavra (e prefixo de 5 caracteres), então nenhum marcador pode compartilhar
// prefixo com outro nem com palavras do corpus.
const MARK = {
  rh: 'zxrhferias9f3a',
  marcelo: 'qwmarcelogestao7b21',
  clienteA: 'pvcontacerta4c11',
  clienteB: 'qwcontacebeta5d22',
  clienteC: 'rzcontacegama6e33',
  arquivado: 'kwarquivado8e44',
  rascunho: 'kwrascunho1a55',
};

let server;
let baseUrl;
let serverPort;
let pool;
let stub;
let admin;
let adminCookie;
let rhStaff;
let rhCookie;
let marceloStaff;
let marceloCookie;
let accountA;
let accountB;
let accountC;
let clientA;
let clientB;
let clientC;
let indexes = {};

const sessionSecret = `${randomUUID()}${randomUUID()}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createProbe();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function api(pathname, { method = 'GET', cookie = adminCookie, body, headers = {} } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
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
    signal: AbortSignal.timeout(60_000),
  }).then(async response => ({
    status: response.status,
    body: await response.json().catch(() => null),
    setCookie: response.headers.getSetCookie?.() || [],
  }));
}

const ask = (ragKey, query, cookie = null) => api('/api/ai/answer', { method: 'POST', body: { rag_key: ragKey, query }, cookie });

async function waitForServer(timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/admin/session`, { signal: AbortSignal.timeout(2_000) });
      if ([200, 401].includes(response.status)) return;
    } catch { /* o Next ainda está iniciando */ }
    await wait(400);
  }
  throw new Error('server_did_not_start');
}

function spawnServer() {
  server = spawn(process.execPath, ['server.mjs', '--dev'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(serverPort),
      BIND_HOST: '127.0.0.1',
      NODE_ENV: 'development',
      NEXT_DIST_DIR: '.next/integration-fech01-rag',
      SITE_ADMIN_SESSION_SECRET: sessionSecret,
      EMPLOYEE_SESSION_SECRET: sessionSecret,
      CLIENT_MFA_ENCRYPTION_KEY: Buffer.from(randomUUID()).toString('base64url').slice(0, 43),
      ADMIN_LOGIN_MAX_ATTEMPTS: '200',
      SITE_ADMIN_LEGACY_TOKENS: '',
      // O provedor apontado é o STUB local deste gate — não é Ollama.
      OLLAMA_ENABLED: 'true',
      OLLAMA_BASE_URL: `http://127.0.0.1:${stub.port}`,
      OLLAMA_MODEL: STUB_MODEL,
      MAIL_HOST: '',
      NEXT_TELEMETRY_DISABLED: '1',
      AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', () => {});
  return waitForServer();
}

async function stopServer() {
  if (!server || server.killed) return;
  const current = server;
  current.kill('SIGTERM');
  await Promise.race([new Promise(resolve => current.once('exit', resolve)), wait(4_000)]);
  if (!current.killed) current.kill('SIGKILL');
  server = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { await fetch(`${baseUrl}/api/admin/session`, { signal: AbortSignal.timeout(600) }); } catch { return; }
    await wait(150);
  }
}

/** Provedor determinístico identificado como STUB (nunca Ollama real). */
function createStubProvider() {
  const state = {
    calls: 0, requests: [], mode: 'answer', held: false, release: null,
    answer: 'Resposta determinística do provedor de teste (stub), gerada a partir do contexto autorizado.',
  };
  const held = () => new Promise(resolve => { state.release = resolve; });
  let gate = null;
  const http = createServer(async (req, res) => {
    if (req.method !== 'POST' || !String(req.url).startsWith('/api/chat')) { res.writeHead(404); return res.end('{}'); }
    let raw = '';
    for await (const chunk of req) raw += chunk.toString('utf8');
    let body = null;
    try { body = JSON.parse(raw); } catch { body = null; }
    state.calls += 1;
    state.requests.push(body);
    if (gate) await gate;
    if (state.mode === 'http_error') { res.writeHead(500, { 'Content-Type': 'application/json' }); return res.end('{"error":"stub_failure"}'); }
    if (state.mode === 'empty') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ model: STUB_MODEL, message: { content: '' } })); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ model: STUB_MODEL, message: { content: state.answer } }));
  });
  return {
    state,
    port: null,
    async start(port) {
      await new Promise((resolve, reject) => { http.once('error', reject); http.listen(port, '127.0.0.1', resolve); });
      this.port = http.address().port;
    },
    hold() { if (!state.held) { state.held = true; gate = held(); } },
    release() { if (state.held) { state.held = false; const r = state.release; gate = null; r?.(); } },
    async stop() {
      http.closeAllConnections?.();
      await new Promise(resolve => http.close(resolve));
    },
    reset() { state.mode = 'answer'; state.held = false; gate = null; },
  };
}

async function loginStaff(email) {
  const response = await api('/api/admin/session', { method: 'POST', cookie: null, body: { email, password: STAFF_TEST_PASSWORD } });
  assert.equal(response.status, 200, `login staff deveria retornar 200, veio ${response.status}`);
  const raw = response.setCookie.find(item => item.startsWith('seg_admin_session='));
  assert.ok(raw, 'login staff precisa emitir cookie');
  return raw.split(';')[0];
}

async function createClient(tag, accountId) {
  const id = randomUUID();
  const email = `fech01-rag-client-${tag}-${id.slice(0, 8)}@example.invalid`;
  const password = `Cliente-Ficticio-${randomUUID()}!`;
  await pool.query(
    `INSERT INTO auth_identities (id, kind, email, display_name, status, verification_method, verified_at)
     VALUES ($1,'client',$2,$3,'active','email_link',NOW())`,
    [id, email, `Cliente fictício FECH-01 ${tag}`],
  );
  await pool.query('INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)', [id, await hashPassword(password)]);
  const grant = randomUUID();
  await pool.query(
    `INSERT INTO client_access_grants (id, identity_id, client_account_id, reason, granted_by)
     VALUES ($1,$2,$3,'Vínculo fictício do gate FECH-01 do assistente','ti')`,
    [grant, id, accountId],
  );
  const response = await api('/api/auth/login', { method: 'POST', cookie: null, body: { email, password } });
  assert.equal(response.status, 200, `login do cliente ${tag} deveria retornar 200, veio ${response.status}`);
  const cookie = response.setCookie.map(item => item.split(';')[0]).join('; ');
  assert.ok(cookie.includes('seg_client_session='), 'login do cliente precisa emitir sessão');
  return { id, email, password, accountId, grant, cookie };
}

async function publishIndex(ragKey) {
  const patch = await api('/api/admin/ai-rag-indexes', {
    method: 'PATCH',
    body: { id: indexes[ragKey].id, status: 'publicado', is_approved: true, is_published: true, is_active: true, reason: 'Publicação fictícia do gate FECH-01 para exercitar a recuperação por escopo' },
  });
  assert.equal(patch.status, 200, `publicar índice ${ragKey} deveria retornar 200, veio ${patch.status}`);
  assert.equal(patch.body.is_active, true, `índice ${ragKey} precisa ficar ativo ao publicar`);
  assert.equal(patch.body.status, 'publicado');
}

async function createPublishedDoc({ ragKey, title, content, keywords, clientAccountId, source = 'Gate FECH-01 (fictício)' }) {
  const created = await api('/api/admin/ai-rag-documents', {
    method: 'POST',
    body: { rag_key: ragKey, title, content, source, source_type: 'manual', keywords, ...(clientAccountId ? { client_account_id: clientAccountId } : {}) },
  });
  assert.equal(created.status, 201, `criar documento ${title} deveria retornar 201, veio ${created.status}`);
  const published = await api('/api/admin/ai-rag-documents', {
    method: 'PATCH',
    body: { id: created.body.id, status: 'publicado', is_approved: true, is_published: true },
  });
  assert.equal(published.status, 200, `publicar documento ${title} deveria retornar 200, veio ${published.status}`);
  return created.body;
}

async function launchBrowser() {
  return playwrightChromium.launch({
    executablePath: await packagedChromium.executablePath(),
    args: packagedChromium.args.filter(arg => arg !== '--disable-web-security'),
    headless: true,
  });
}

async function waitForStubCalls(total, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (stub.state.calls >= total) return;
    await wait(50);
  }
  throw new Error(`stub_never_received_call_${total}`);
}

const BROWSER_CRASH = /Target (page|closed)|has been closed|Target crashed|browser has disconnected|crashed|SIGSEGV|Protocol error/i;
async function withBrowser(body) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const browser = await launchBrowser();
    try {
      return await body(browser);
    } catch (error) {
      const message = String(error?.message || '');
      if (error?.code === 'ERR_ASSERTION' || !BROWSER_CRASH.test(message)) throw error;
      lastError = error;
      console.log(`FECH01_BROWSER_RETRY tentativa=${attempt}: ${message.split('\n')[0]}`);
    } finally {
      await browser.close().catch(() => {});
    }
    await wait(2_500);
  }
  throw lastError;
}

const evidenceDir = process.env.FECH01_EVIDENCE_DIR || '';
async function capture(page, name) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${name}.png`), fullPage: false });
}

async function openSources(page) {
  const details = page.locator('[data-testid="rag-sources"]');
  await details.waitFor();
  const open = await details.evaluate(node => node.open);
  if (!open) await details.locator('summary').click();
  return details.innerText();
}

async function openStaffAssistant(browser, { cookie, route = '/admin/rh/assistente', heading = 'Assistente RH', width = 1440, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await context.addCookies(cookie.split('; ').filter(Boolean).map(pair => {
    const separator = pair.indexOf('=');
    return { name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl };
  }));
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(120_000);
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1, name: heading }).waitFor();
  await page.locator('[data-testid="rag-widget"]').waitFor();
  return { context, page };
}

// Prova de hidratação antes de qualquer clique. `__reactProps*` é o sinal que
// o próprio React deixa no nó depois de assumir a árvore servida; sem isso um
// clique antes da hidratação enviaria o formulário com a pergunta vazia.
async function waitForHydration(page, timeout = 90_000) {
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="rag-question"]');
    return Boolean(node) && Object.keys(node).some(key => key.startsWith('__reactProps'));
  }, null, { timeout });
}

async function fillQuestion(page, question) {
  await waitForHydration(page);
  await page.locator('[data-testid="rag-question"]').fill(question);
  await page.waitForFunction(
    expected => document.querySelector('[data-testid="rag-counter"]')?.textContent === expected,
    `${question.length}/500`,
  );
}

async function askInWidget(page, question) {
  await fillQuestion(page, question);
  await page.locator('[data-testid="rag-submit"]').click();
  await page.waitForFunction(() => {
    const widget = document.querySelector('[data-testid="rag-widget"]');
    return widget && !['idle', 'loading'].includes(widget.getAttribute('data-ui-state'));
  });
  return page.locator('[data-testid="rag-widget"]').getAttribute('data-ui-state');
}

before(async () => {
  if (!RUN) return;
  stub = createStubProvider();
  await stub.start(await freePort());
  serverPort = await freePort();
  baseUrl = `http://127.0.0.1:${serverPort}`;
  await spawnServer();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });

  admin = await provisionStaff(pool, { role: 'admin' });
  rhStaff = await provisionStaff(pool, { role: 'rh' });
  marceloStaff = await provisionStaff(pool, { role: 'marcelo' });
  adminCookie = await loginStaff(admin.email);
  rhCookie = await loginStaff(rhStaff.email);
  marceloCookie = await loginStaff(marceloStaff.email);

  const indexList = await api('/api/admin/ai-rag-indexes');
  assert.equal(indexList.status, 200, 'a curadoria precisa listar os índices do ledger');
  for (const item of indexList.body.items) indexes[item.rag_key] = item;
  for (const ragKey of ['publico', 'cliente', 'rh', 'marcelo']) {
    assert.ok(indexes[ragKey], `índice ${ragKey} precisa existir após as migrações`);
    await publishIndex(ragKey);
  }

  accountA = randomUUID();
  accountB = randomUUID();
  accountC = randomUUID();
  await pool.query(
    `INSERT INTO client_accounts (id, display_name, status, created_by)
     VALUES ($1,'Conta fictícia A do gate FECH-01','active','ti'),($2,'Conta fictícia B do gate FECH-01','active','ti'),($3,'Conta fictícia C do gate FECH-01','active','ti')`,
    [accountA, accountB, accountC],
  );
  clientA = await createClient('a', accountA);
  clientB = await createClient('b', accountB);
  clientC = await createClient('c', accountC);

  await createPublishedDoc({
    ragKey: 'rh',
    title: 'Férias no RH — procedimento fictício do gate',
    content: `Procedimento fictício do gate FECH-01: o agendamento de férias do RH passa pelo fluxo interno de programação e pela confirmação da liderança. Chave ${MARK.rh}.`,
    keywords: [MARK.rh, 'ferias', 'rh'],
  });
  await createPublishedDoc({
    ragKey: 'marcelo',
    title: 'Gestão — aprovação de despesas fictícia do gate',
    content: `Procedimento fictício do gate FECH-01: a aprovação de despesas de gestão segue a alçada registrada na configuração. Chave ${MARK.marcelo}.`,
    keywords: [MARK.marcelo, 'gestao', 'despesas'],
  });
  await createPublishedDoc({
    ragKey: 'cliente',
    title: 'Conta A — contratos e documentos fictícios do gate',
    content: `Conteúdo fictício do gate FECH-01 restrito à conta A: os contratos e documentos desta conta ficam no portal autenticado. Chave ${MARK.clienteA}.`,
    keywords: [MARK.clienteA, 'contratos'],
    clientAccountId: accountA,
  });
  await createPublishedDoc({
    ragKey: 'cliente',
    title: 'Conta B — contratos e documentos fictícios do gate',
    content: `Conteúdo fictício do gate FECH-01 restrito à conta B: os contratos e documentos desta conta ficam no portal autenticado. Chave ${MARK.clienteB}.`,
    keywords: [MARK.clienteB, 'documentos'],
    clientAccountId: accountB,
  });
  await createPublishedDoc({
    ragKey: 'cliente',
    title: 'Conta C — contratos e documentos fictícios do gate',
    content: `Conteúdo fictício do gate FECH-01 restrito à conta C, usado somente para provar a perda de acesso após revogação do vínculo. Chave ${MARK.clienteC}.`,
    keywords: [MARK.clienteC, 'contratos'],
    clientAccountId: accountC,
  });

  // Registros incoerentes criados de propósito: flag publicada ligada com estado
  // arquivado/rascunho. A curadoria canônica não publica assim; o gate força o
  // estado pelo SQL porque é exatamente a incoerência que a trava precisa pegar.
  for (const [status, mark, title] of [['arquivado', MARK.arquivado, 'Arquivado com flag antiga'], ['rascunho', MARK.rascunho, 'Rascunho com flag antiga']]) {
    const doc = await createPublishedDoc({
      ragKey: 'rh',
      title: `${title} — registro fictício do gate`,
      content: `Conteúdo fictício do gate FECH-01 que NÃO pode ser recuperado; a chave ${mark} fica sem efeito.`,
      keywords: [mark, 'incoerente'],
    });
    await pool.query('UPDATE ai_rag_documents SET status=$2::ai_rag_status, is_approved=true, is_published=true WHERE id=$1', [doc.id, status]);
  }

  // Pré-aquecimento: compilar rotas custa memória; fazer isso sem navegador
  // aberto reduz o risco de o Chromium ser derrubado no meio de um caso.
  const deadline = Date.now() + 600_000;
  for (const route of ['/admin/rh/assistente', '/admin/marcelo/assistente', '/cliente/app/assistente', '/contato']) {
    while (true) {
      try {
        const response = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
        if (response.status < 500) break;
      } catch { /* o compilador ainda está preparando a rota */ }
      if (Date.now() > deadline) throw new Error(`route_compile_timeout_${route}`);
      await wait(500);
    }
  }
});

after(async () => {
  await stopServer().catch(() => {});
  await pool?.end().catch(() => {});
  await stub?.stop().catch(() => {});
});

test('o gate focal exige PostgreSQL real quando é cobrado', () => {
  if (REQUIRE) assert.ok(RUN, 'QA_AI_RAG_WIDGET_REQUIRE_DB=1 exige DATABASE_URL e RUN_DATABASE_INTEGRATION=1');
});

test('HTTP: visita anônima não entra em base privada e a pública não vê conteúdo privado', opt, async () => {
  for (const ragKey of ['rh', 'marcelo', 'cliente']) {
    const anonymous = await ask(ragKey, MARK.rh, null);
    assert.equal(anonymous.status, 401, `${ragKey} sem sessão precisa ser 401`);
    assert.ok(String(anonymous.body.error).endsWith('_session_required'), `código esperado de sessão ausente em ${ragKey}`);
    assert.ok(!('response' in (anonymous.body || {})), 'a negativa não pode trazer resposta');
    assert.ok(!('protocol' in (anonymous.body || {})), 'a negativa não pode trazer protocolo');
  }
  const publicProbe = await ask('publico', MARK.clienteA, null);
  assert.equal(publicProbe.status, 200, 'a base pública responde sem sessão');
  assert.equal(publicProbe.body.ollama_used, false);
  assert.deepEqual(publicProbe.body.sources, []);
  assert.equal(publicProbe.body.reason, 'empty_scope', 'a base pública do gate não tem conteúdo publicado');
  const serialized = JSON.stringify(publicProbe.body);
  for (const mark of [MARK.clienteA, MARK.clienteB, MARK.rh, MARK.marcelo]) {
    assert.ok(!serialized.includes(mark), `conteúdo privado (${mark}) não pode vazar para o público`);
  }
});

test('HTTP: RH responde só com o corpus RH e o limite de pergunta é o do servidor', opt, async () => {
  const callsBefore = stub.state.calls;
  const answered = await ask('rh', MARK.rh, rhCookie);
  assert.equal(answered.status, 200);
  assert.equal(answered.body.ollama_used, true);
  assert.equal(answered.body.rag_key, 'rh');
  assert.match(answered.body.protocol, /^RAG-RH-/);
  assert.deepEqual(answered.body.sources.map(item => item.title), ['Férias no RH — procedimento fictício do gate']);
  assert.equal(stub.state.calls, callsBefore + 1, 'com fonte relacionada o stub é chamado uma vez');

  const denied = await ask('marcelo', MARK.marcelo, rhCookie);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, 'scope_forbidden');
  assert.equal(stub.state.calls, callsBefore + 1, 'a negativa por papel não pode chamar o modelo');

  const tooLong = await ask('rh', 'a'.repeat(501), rhCookie);
  assert.equal(tooLong.status, 400);
  assert.equal(tooLong.body.error, 'invalid_query');

  const boundary = await ask('rh', 'a'.repeat(500), rhCookie);
  assert.equal(boundary.status, 200, 'exatamente 500 caracteres é aceito (mesmo limite do widget)');
  assert.equal(boundary.body.ollama_used, false, 'sem trecho relacionado o modelo não é chamado');
});

test('HTTP: gestão responde só com o corpus de gestão', opt, async () => {
  const answered = await ask('marcelo', MARK.marcelo, marceloCookie);
  assert.equal(answered.status, 200);
  assert.equal(answered.body.ollama_used, true);
  assert.deepEqual(answered.body.sources.map(item => item.title), ['Gestão — aprovação de despesas fictícia do gate']);

  const denied = await ask('rh', MARK.rh, marceloCookie);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, 'scope_forbidden');
});

test('HTTP: documento arquivado ou em rascunho não é recuperado nem com flag antiga ligada', opt, async () => {
  const callsBefore = stub.state.calls;
  for (const mark of [MARK.arquivado, MARK.rascunho]) {
    const probe = await ask('rh', mark, rhCookie);
    assert.equal(probe.status, 200);
    assert.equal(probe.body.ollama_used, false);
    assert.deepEqual(probe.body.sources, []);
    assert.equal(probe.body.reason, 'no_relevant_source');
    assert.ok(!JSON.stringify(probe.body).includes(mark), `${mark} não pode aparecer na resposta`);
  }
  assert.equal(stub.state.calls, callsBefore, 'registro não recuperado não pode chamar o modelo');

  const rows = await pool.query('SELECT status, is_published FROM ai_rag_documents WHERE content LIKE $1', [`%${MARK.arquivado}%`]);
  assert.equal(rows.rows[0].status, 'arquivado', 'o cenário precisa manter o registro realmente arquivado no banco');
  assert.equal(rows.rows[0].is_published, true, 'a flag antiga precisa continuar ligada para provar a trava de estado');
});

test('HTTP: cliente A lê a própria conta e nunca a conta B', opt, async () => {
  const callsBefore = stub.state.calls;
  const own = await ask('cliente', MARK.clienteA, clientA.cookie);
  assert.equal(own.status, 200);
  assert.equal(own.body.ollama_used, true);
  assert.deepEqual(own.body.sources.map(item => item.title), ['Conta A — contratos e documentos fictícios do gate']);
  assert.equal(stub.state.calls, callsBefore + 1);

  const cross = await ask('cliente', MARK.clienteB, clientA.cookie);
  assert.equal(cross.status, 200);
  assert.equal(cross.body.ollama_used, false);
  assert.deepEqual(cross.body.sources, []);
  assert.equal(cross.body.reason, 'no_relevant_source');
  assert.ok(!JSON.stringify(cross.body).includes(MARK.clienteB), 'a conta B não pode ser recuperada pelo cliente A');
  assert.equal(stub.state.calls, callsBefore + 1, 'sem fonte no escopo o modelo não é chamado');

  const ownByB = await ask('cliente', MARK.clienteB, clientB.cookie);
  assert.equal(ownByB.body.ollama_used, true, 'a conta B lê a própria base');
  const ownByBText = JSON.stringify(ownByB.body);
  assert.ok(!ownByBText.includes(MARK.clienteA), 'a conta A não pode ser recuperada pelo cliente B');
  assert.equal(stub.state.calls, callsBefore + 2);
});

test('HTTP: vínculo revogado deixa de recuperar a fonte', opt, async () => {
  await pool.query('UPDATE client_access_grants SET revoked_at=NOW() WHERE id=$1', [clientC.grant]);
  const callsBefore = stub.state.calls;
  const afterRevoke = await ask('cliente', MARK.clienteC, clientC.cookie);
  assert.equal(afterRevoke.status, 200);
  assert.equal(afterRevoke.body.ollama_used, false);
  assert.deepEqual(afterRevoke.body.sources, []);
  assert.equal(afterRevoke.body.reason, 'empty_scope', 'sem vínculo ativo o escopo fica sem conteúdo publicado');
  assert.equal(stub.state.calls, callsBefore, 'vínculo revogado não pode chamar o modelo');
  assert.ok(!JSON.stringify(afterRevoke.body).includes(MARK.clienteC), 'a fonte revogada não pode voltar a aparecer');

  const grant = await pool.query('SELECT revoked_at FROM client_access_grants WHERE id=$1', [clientC.grant]);
  assert.ok(grant.rows[0].revoked_at, 'a revogação precisa estar persistida no banco do gate');
});

test('HTTP: o contexto enviado ao provedor contém apenas o corpus autorizado', opt, async () => {
  const before = stub.state.requests.length;
  const answer = await ask('rh', MARK.rh, rhCookie);
  assert.equal(answer.status, 200);
  assert.ok(stub.state.requests.length > before, 'o stub precisa ter recebido a chamada');
  const payload = JSON.stringify(stub.state.requests[stub.state.requests.length - 1]);
  assert.ok(payload.includes(MARK.rh), 'o contexto autorizado precisa chegar ao provedor');
  for (const mark of [MARK.clienteA, MARK.clienteB, MARK.clienteC, MARK.marcelo, MARK.arquivado, MARK.rascunho]) {
    assert.ok(!payload.includes(mark), `contexto fora do escopo (${mark}) não pode ir para a base RH`);
  }
  assert.match(String(stub.state.requests[stub.state.requests.length - 1]?.messages?.[0]?.content), /escopo rh/);
});

test('HTTP: provedor devolvendo texto vazio vira 503 explícito, sem resposta simulada', opt, async () => {
  stub.state.mode = 'empty';
  try {
    const empty = await ask('rh', MARK.rh, rhCookie);
    assert.equal(empty.status, 503);
    assert.equal(empty.body.error, 'ai_unavailable');
    assert.equal(empty.body.reason, 'empty_response');
    assert.ok(!('response' in (empty.body || {})), 'nada de texto fabricado no lugar do modelo');
  } finally { stub.reset(); }
});

test('HTTP: base indisponível vira 503 rag_unavailable e depois se recupera', opt, async () => {
  await pool.query('ALTER TABLE ai_rag_chunks RENAME TO ai_rag_chunks_fech01_hidden');
  try {
    const down = await ask('rh', MARK.rh, rhCookie);
    assert.equal(down.status, 503);
    assert.equal(down.body.error, 'rag_unavailable');
    assert.ok(!('response' in (down.body || {})), 'falha de leitura não pode virar resposta');
  } finally {
    await pool.query('ALTER TABLE ai_rag_chunks_fech01_hidden RENAME TO ai_rag_chunks');
  }
  const recovered = await ask('rh', MARK.rh, rhCookie);
  assert.equal(recovered.status, 200, 'com a base de volta a consulta volta a funcionar');
});

test('HTTP: uma geração por vez devolve ai_busy com retry sem inventar resposta', opt, async () => {
  const callsBefore = stub.state.calls;
  stub.hold();
  try {
    const first = ask('rh', MARK.rh, rhCookie);
    await waitForStubCalls(callsBefore + 1);
    const second = await ask('rh', MARK.rh, rhCookie);
    assert.equal(second.status, 503);
    assert.equal(second.body.error, 'ai_busy');
    assert.equal(second.body.retry_after_seconds, 5);
    assert.ok(!('response' in (second.body || {})));
    stub.release();
    const done = await first;
    assert.equal(done.status, 200);
    assert.equal(done.body.ollama_used, true);
  } finally { stub.release(); stub.reset(); }
});

test('browser: o assistente RH responde pela tela real com fonte, protocolo e anúncio', opt, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openStaffAssistant(browser, { cookie: rhCookie });
    const widget = page.locator('[data-testid="rag-widget"]');
    assert.equal(await widget.getAttribute('data-ui-state'), 'idle');
    assert.equal(await page.locator('[data-testid="rag-counter"]').innerText(), '0/500');
    const textareaId = await page.locator('[data-testid="rag-question"]').getAttribute('id');
    const labelFor = await page.locator('label[for]').evaluateAll(nodes => nodes.map(node => node.getAttribute('for')));
    assert.ok(labelFor.includes(textareaId), 'o campo de pergunta precisa de rótulo persistente ligado por for/id');
    assert.match(await page.locator(`label[for="${textareaId}"]`).innerText(), /Pergunta para/);
    assert.match(await page.locator('[data-testid="rag-scope"]').innerText(), /Somente a base de RH/);

    await fillQuestion(page, MARK.rh);
    assert.equal(await page.locator('[data-testid="rag-counter"]').innerText(), `${MARK.rh.length}/500`);
    await page.locator('[data-testid="rag-submit"]').click();
    await page.locator('[data-testid="rag-answer"]').waitFor();
    assert.equal(await widget.getAttribute('data-ui-state'), 'answered');
    assert.match(await page.locator('[data-testid="rag-protocol"]').innerText(), /^RAG-RH-/);
    assert.ok(await page.locator('[data-testid="rag-copy-protocol"]').isVisible(), 'com protocolo o botão de copiar existe');
    assert.match(await openSources(page), /Férias no RH/);
    assert.match(await page.locator('[data-testid="rag-status"]').innerText(), /Resposta recebida com 1 fonte/);
    assert.equal(await page.locator('[data-testid="rag-failure"]').count(), 0);
    await capture(page, 'desktop-rh-resposta-com-fonte');
    await context.close();
  });
});

test('browser: teclado alcança o envio com foco visível e ordem previsível', opt, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openStaffAssistant(browser, { cookie: rhCookie });
    const textarea = page.locator('[data-testid="rag-question"]');
    await textarea.focus();
    const before = await textarea.evaluate(node => ({ active: document.activeElement === node, outline: getComputedStyle(node).outlineStyle }));
    assert.equal(before.active, true);
    assert.notEqual(before.outline, 'none', 'o foco precisa ser visível no campo de pergunta');
    await page.keyboard.press('Tab');
    const submitFocused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    assert.equal(submitFocused, 'rag-submit', 'a ordem de foco segue rótulo → campo → envio');
    const submitOutline = await page.locator('[data-testid="rag-submit"]').evaluate(node => getComputedStyle(node).outlineStyle);
    assert.notEqual(submitOutline, 'none', 'o botão de envio também precisa de foco visível');
    await capture(page, 'desktop-teclado-foco-visivel');
    await context.close();
  });
});

test('browser: sem fonte a tela declara ausência e não oferece protocolo', opt, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openStaffAssistant(browser, { cookie: rhCookie });
    const state = await askInWidget(page, MARK.marcelo);
    assert.equal(state, 'no_source');
    assert.equal(await page.locator('[data-testid="rag-protocol"]').count(), 0, 'sem protocolo não existe protocolo para copiar');
    assert.equal(await page.locator('[data-testid="rag-copy-protocol"]').count(), 0, 'copiar protocolo é ocultado quando ausente');
    assert.match(await page.locator('[data-testid="rag-answer-origin"]').innerText(), /modelo não consultado/);
    await capture(page, 'desktop-sem-fonte');
    await context.close();
  });
});

test('browser: documento arquivado com flag antiga não aparece na tela', opt, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openStaffAssistant(browser, { cookie: rhCookie });
    const state = await askInWidget(page, MARK.arquivado);
    assert.equal(state, 'no_source');
    assert.ok(!(await page.locator('[data-testid="rag-widget"]').innerText()).includes(MARK.arquivado), 'a chave arquivada não pode aparecer');
    await context.close();
  });
});

test('browser: papel sem escopo é NEGADO pela tela, não apenas escondido', opt, async () => {
  // O 403 `scope_forbidden` não é alcançável pela navegação normal: o menu já
  // esconde a área e o trigger da migração 102 revoga as sessões quando o papel
  // muda. Para exercitar a APRESENTAÇÃO da negativa, o gate monta um cenário
  // explícito: a tela é aberta com o papel antigo (rh) e a pergunta seguinte é
  // feita com uma sessão real, nova, emitida pelo login canônico para o papel
  // já rebaixado (comercial). O 403 vem do servidor de verdade — nada é
  // interceptado — mas o gate NÃO afirma que esse caminho é navegável.
  const demoted = await provisionStaff(pool, { role: 'rh' });
  const beforeCookie = await loginStaff(demoted.email);

  await withBrowser(async browser => {
    const { context, page } = await openStaffAssistant(browser, { cookie: beforeCookie });
    await waitForHydration(page);

    // Papel rebaixado de verdade: o banco revoga a sessão antiga (trigger 102).
    await pool.query(`UPDATE auth_staff_profiles SET role='comercial' WHERE identity_id=$1`, [demoted.id]);
    const revoked = await ask('rh', MARK.rh, beforeCookie);
    assert.equal(revoked.status, 401, 'a sessão emitida antes da mudança de papel precisa morrer');
    assert.equal(revoked.body.error, 'staff_session_required');

    const afterCookie = await loginStaff(demoted.email);
    const denied = await ask('rh', MARK.rh, afterCookie);
    assert.equal(denied.status, 403, 'papel sem escopo precisa ser negado pelo servidor');
    assert.equal(denied.body.error, 'scope_forbidden');
    assert.ok(!('response' in (denied.body || {})), 'a negativa não pode trazer resposta');

    const separator = afterCookie.indexOf('=');
    await context.addCookies([{ name: afterCookie.slice(0, separator), value: afterCookie.slice(separator + 1), url: baseUrl }]);
    const state = await askInWidget(page, MARK.rh);
    assert.equal(state, 'denied', `papel sem escopo precisa ser negado na tela, veio ${state}`);
    const failure = await page.locator('[data-testid="rag-failure"]').innerText();
    assert.match(failure, /Acesso negado para esta base/);
    assert.match(failure, /scope_forbidden/);
    assert.match(failure, /Estar no menu não concede autorização/);
    assert.equal(await page.locator('[data-testid="rag-answer"]').count(), 0);
    assert.equal(await page.locator('[data-testid="rag-copy-protocol"]').count(), 0);
    await capture(page, 'desktop-negado-403');
    await context.close();
  });

  await pool.query(`UPDATE auth_staff_profiles SET role='rh' WHERE identity_id=$1`, [demoted.id]);
});

test('browser: página pública não vê conteúdo privado pela tela', opt, async () => {
  await withBrowser(async browser => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);
    page.setDefaultNavigationTimeout(120_000);
    await page.goto(`${baseUrl}/contato`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="rag-widget"][data-rag-key="publico"]').waitFor();
    const state = await askInWidget(page, MARK.rh);
    assert.equal(state, 'empty_scope', 'a base pública do gate não tem conteúdo publicado');
    const text = await page.locator('[data-testid="rag-widget"]').innerText();
    // A chave digitada é do próprio visitante; o que não pode existir é conteúdo
    // privado: título, trecho ou lista de fontes de outra área/conta.
    assert.ok(!text.includes('Férias no RH — procedimento fictício do gate'), 'título privado não pode aparecer no público');
    assert.ok(!text.includes('fluxo interno de programação'), 'trecho privado não pode aparecer no público');
    assert.equal(await page.locator('[data-testid="rag-sources"]').count(), 0, 'a página pública não pode listar fonte privada');
    assert.equal(await page.locator('[data-testid="rag-protocol"]').count(), 0, 'sem fonte não existe protocolo para exibir');
    assert.equal(await page.locator('[data-testid="rag-copy-protocol"]').count(), 0, 'sem protocolo não existe o que copiar');
    assert.match(await page.locator('[data-testid="rag-answer-origin"]').innerText(), /modelo não consultado/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 2, `390px no site público não pode transbordar (medido ${overflow}px)`);
    await capture(page, 'mobile-390-publico-sem-fonte');
    await context.close();
  });
});

test('browser: a área de gestão responde na própria tela', opt, async () => {
  await withBrowser(async browser => {
    const marcelo = await openStaffAssistant(browser, { cookie: marceloCookie, route: '/admin/marcelo/assistente', heading: 'Assistente Marcelo' });
    const marceloState = await askInWidget(marcelo.page, MARK.marcelo);
    assert.equal(marceloState, 'answered');
    assert.match(await marcelo.page.locator('[data-testid="rag-protocol"]').innerText(), /^RAG-MAR-/);
    assert.match(await openSources(marcelo.page), /Gestão — aprovação de despesas fictícia do gate/);
    await capture(marcelo.page, 'desktop-marcelo-resposta');
    await marcelo.context.close();
  });
});

test('browser: o portal do cliente (390px) só lê a conta vinculada', opt, async () => {
  await withBrowser(async browser => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    await context.addCookies(clientA.cookie.split('; ').filter(Boolean).map(pair => {
      const separator = pair.indexOf('=');
      return { name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl };
    }));
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);
    page.setDefaultNavigationTimeout(120_000);
    await page.goto(`${baseUrl}/cliente/app/assistente`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="rag-widget"]').waitFor();
    const state = await askInWidget(page, MARK.clienteA);
    assert.equal(state, 'answered');
    assert.match(await openSources(page), /Conta A/);
    const otherAccount = await askInWidget(page, MARK.clienteB);
    assert.equal(otherAccount, 'no_source', 'o cliente A não pode receber conteúdo da conta B');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 2, `390px não pode ter transbordo horizontal (medido ${overflow}px)`);
    await capture(page, 'mobile-390-cliente-resposta');
    await context.close();
  });
});

test('browser: sessão revogada na equipe vira estado de sessão necessária sem apagar a tela', opt, async () => {
  await withBrowser(async browser => {
    const logoutCookie = await loginStaff(rhStaff.email);
    const { context, page } = await openStaffAssistant(browser, { cookie: logoutCookie });
    const closed = await api('/api/admin/session', { method: 'DELETE', cookie: logoutCookie, body: {} });
    assert.equal(closed.status, 200, 'o logout precisa revogar a sessão usada pela página');
    const state = await askInWidget(page, MARK.rh);
    assert.equal(state, 'session_required');
    const failure = await page.locator('[data-testid="rag-failure"]').innerText();
    assert.match(failure, /Sessão da equipe necessária/);
    assert.equal(await page.locator('[data-testid="rag-answer"]').count(), 0);
    await capture(page, 'desktop-sessao-revogada');
    await context.close();
  });
});

test('browser: modelo ocupado mostra estado de ocupado com nova tentativa', opt, async () => {
  const callsBefore = stub.state.calls;
  stub.hold();
  const first = ask('rh', MARK.rh, rhCookie);
  try {
    await waitForStubCalls(callsBefore + 1);
    await withBrowser(async browser => {
      const { context, page } = await openStaffAssistant(browser, { cookie: rhCookie });
      const state = await askInWidget(page, MARK.rh);
      assert.equal(state, 'busy');
      const failure = await page.locator('[data-testid="rag-failure"]').innerText();
      assert.match(failure, /Assistente ocupado/);
      assert.match(failure, /Nova tentativa sugerida em 5s/);
      assert.ok(await page.locator('[data-testid="rag-retry"]').isVisible(), 'ocupado é recuperável e oferece nova tentativa');
      assert.equal(await page.locator('[data-testid="rag-answer"]').count(), 0);
      await capture(page, 'desktop-ocupado');
      await context.close();
    });
  } finally {
    stub.release();
    await first.catch(() => {});
    stub.reset();
  }
});

test('browser: envio duplicado não dispara duas gerações', opt, async () => {
  const callsBefore = stub.state.calls;
  stub.hold();
  try {
    await withBrowser(async browser => {
      const { context, page } = await openStaffAssistant(browser, { cookie: rhCookie });
      await fillQuestion(page, MARK.rh);
      const submit = page.locator('[data-testid="rag-submit"]');
      await submit.click();
      await page.waitForFunction(() => document.querySelector('[data-testid="rag-widget"]')?.getAttribute('data-ui-state') === 'loading');
      assert.equal(await submit.isDisabled(), true, 'durante a geração o envio fica desabilitado');
      assert.equal(await page.locator('[data-testid="rag-question"]').isDisabled(), true, 'o campo também fica indisponível durante a geração');
      await submit.evaluate(node => node.click());
      await page.waitForTimeout(700);
      assert.equal(stub.state.calls, callsBefore + 1, 'exatamente uma geração para uma pergunta');
      stub.release();
      await page.locator('[data-testid="rag-answer"]').waitFor();
      assert.equal(await page.locator('[data-testid="rag-protocol"]').count(), 1);
      await context.close();
    });
  } finally { stub.release(); stub.reset(); }
});

test('browser: banco indisponível mostra falha recuperável sem resposta inventada', opt, async () => {
  await pool.query('ALTER TABLE ai_rag_chunks RENAME TO ai_rag_chunks_fech01_hidden');
  try {
    await withBrowser(async browser => {
      const { context, page } = await openStaffAssistant(browser, { cookie: rhCookie });
      const state = await askInWidget(page, MARK.rh);
      assert.equal(state, 'source_unavailable');
      const failure = await page.locator('[data-testid="rag-failure"]').innerText();
      assert.match(failure, /Base aprovada indisponível/);
      assert.ok(await page.locator('[data-testid="rag-retry"]').isVisible());
      assert.equal(await page.locator('[data-testid="rag-answer"]').count(), 0);
      await capture(page, 'desktop-base-indisponivel');
      await context.close();
    });
  } finally {
    await pool.query('ALTER TABLE ai_rag_chunks_fech01_hidden RENAME TO ai_rag_chunks');
  }
});

test('browser: provedor recusando a chamada vira falha explícita do modelo', opt, async () => {
  stub.state.mode = 'http_error';
  try {
    await withBrowser(async browser => {
      const { context, page } = await openStaffAssistant(browser, { cookie: rhCookie });
      const state = await askInWidget(page, MARK.rh);
      assert.equal(state, 'ai_unavailable');
      const failure = await page.locator('[data-testid="rag-failure"]').innerText();
      assert.match(failure, /Falha ao falar com o modelo local/);
      assert.equal(await page.locator('[data-testid="rag-answer"]').count(), 0);
      assert.equal(await page.locator('[data-testid="rag-protocol"]').count(), 0);
      await capture(page, 'desktop-modelo-falhou');
      await context.close();
    });
  } finally { stub.reset(); }
});

test('browser: modelo local fora do ar vira tempo esgotado sem resposta inventada', opt, async () => {
  await stub.stop();
  try {
    await withBrowser(async browser => {
      const { context, page } = await openStaffAssistant(browser, { cookie: rhCookie });
      const state = await askInWidget(page, MARK.rh);
      assert.equal(state, 'ai_timeout');
      const failure = await page.locator('[data-testid="rag-failure"]').innerText();
      assert.match(failure, /não respondeu a tempo/i);
      assert.equal(await page.locator('[data-testid="rag-answer"]').count(), 0, 'sem modelo não existe resposta');
      assert.equal(await page.locator('[data-testid="rag-protocol"]').count(), 0, 'sem modelo não existe protocolo');
      await capture(page, 'desktop-modelo-indisponivel');
      await context.close();
    });
  } finally {
    await stub.start(stub.port);
  }
});
