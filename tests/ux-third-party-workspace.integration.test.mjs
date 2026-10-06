// UX-07 / EXT-02 — gate da tela /admin/terceiros, por HTTP real contra
// PostgreSQL real (executado por scripts/qa-ux-third-party-postgres.mjs, que
// sobe um cluster descartável) e por Chromium real.
//
// O que este gate prova:
//  - a rota canônica continua exigindo sessão de equipe (401 `unauthorized`),
//    recusando papel fora da lista do servidor (403 `forbidden_role`),
//    exigindo `Idempotency-Key` (400) e recusando origem cruzada (403), sem
//    vazar terceiro algum na negativa;
//  - a rota LEGADA continua viva em leitura (200) e aposentada em escrita
//    (410 `legacy_route_retired`, com `use` apontando a canônica) — e a tela
//    NÃO a consome;
//  - a chave de idempotência é PRESERVADA após a recusa e fica visível para
//    repetição segura — a mesma chave é reaproveitada no acerto;
//  - falha de leitura não vira lista vazia nem indicador zero: a tabela e os
//    contadores ficam AUSENTES do DOM, e a falha diz que não significa
//    ausência de terceiros;
//  - recusa de papel é estado NEGADO, distinto de falha e de vazio;
//  - uma leitura que falha não contamina a outra (dossiê × decisão de
//    autorização);
//  - as oito abas são um tablist de verdade, com roving tabindex e teclado;
//  - português no lugar do valor cru do banco (`ativo`, `com_acesso_vigente`,
//    `expirado`, `a_vencer`, `terceiro_criado`, `acesso_concedido`);
//  - ausência honesta: terceiro sem contrato, sem janela, sem documento, sem
//    regra e sem avaliação — nunca 0, 0%, R$ 0,00 ou 01/01/1970;
//  - zero REAL do servidor continua aparecendo: avaliação com nota 0 é 0/10;
//  - a FRONTEIRA EXTERNA é declarada e nunca simulada: a tela mostra a
//    declaração do servidor e o ponto de imposição, sem criar sessão, login ou
//    canal externo de terceiro;
//  - 390px não produz transbordo horizontal.
//
// O que este gate NÃO prova: aceite humano. Marcelo e Andreia não
// participaram; nada aqui é homologação.
//
// MASSA: tudo que é de EXT-02 (terceiro, vínculo de contrato, janela de
// acesso, documento, regra de documento e avaliação) nasce nas PRÓPRIAS APIs
// canônicas de terceiros, por HTTP. Nenhuma linha de `ext_third_party_*` é
// escrita por SQL. O único acesso direto ao banco a essas tabelas é LEITURA —
// conferência do que o servidor persistiu.
//
// PROVISIONAMENTO MÍNIMO DE OUTRA FAMÍLIA, DECLARADO: conceder janela de
// acesso exige um contrato canônico de CRM (`crm_contracts`, migração 027),
// que não tem rota de criação nesta jornada. O contrato — e a proposta mínima
// que ele exige por chave estrangeira — é inserido por SQL, exatamente como já
// faz o gate herdado tests/ext02-third-parties.integration.test.mjs. É
// provisionamento de pré-requisito de OUTRA família, nunca simulação de
// resultado de EXT-02.
//
// As datas da massa são ancoradas no CURRENT_DATE do SERVIDOR (via pool),
// nunca no relógio do processo de teste: esta família valida
// `evaluated_on_in_future` contra a data do servidor e deriva janela de acesso
// e vencimento de documento por comparação de datas. Uma diferença de fuso
// entre runner e banco tornaria a massa incoerente com o que o servidor
// aceita.
//
// Nenhuma asserção é enfraquecida: a falha de leitura é injetada APENAS em
// `window.fetch`, dentro da própria página. O servidor nunca é alterado para o
// teste passar, e `ERR_ASSERTION` nunca é repetido pelo laço de retomada.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { provisionStaff, STAFF_TEST_PASSWORD } from './helpers/staff-login.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');

let server, baseUrl, pool;
let tiStaff, rhStaff, tiCookie, rhCookie;
let terceiroCompleto, terceiroVazio;
let contratoCanonico;
let documentoAtivo = '';
let janelaVigente = '';
let dataDoServidor = '';
let dataDeOntem = '';
let dataFutura = '';

const key = label => `ext02-ux-${label}-${randomUUID()}`;

// Marca de progresso do preparo: quando o gate falha em CI, ela diz em qual
// etapa parou. Não altera asserção alguma.
const etapa = nome => console.log(`UX_THIRD_PARTY_SETUP: ${nome}`);

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/admin/session`, { headers: { accept: 'application/json' } });
      if ([200, 401].includes(res.status)) return;
    } catch { /* ainda subindo */ }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error('server_did_not_start');
}

function api(pathname, { method = 'GET', body, cookie, headers = {}, idempotencyKey, origin = baseUrl, raw } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { origin } : {}),
      ...(method !== 'GET' && idempotencyKey !== null ? { 'idempotency-key': idempotencyKey || key('api') } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  }).then(async res => {
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    return { status: res.status, body: parsed, text };
  });
}

async function loginStaffHttp(email) {
  const res = await fetch(`${baseUrl}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', origin: baseUrl },
    body: JSON.stringify({ email, password: STAFF_TEST_PASSWORD }),
  });
  assert.equal(res.status, 200, `login deveria retornar 200, veio ${res.status}`);
  const raw = (res.headers.getSetCookie?.() || []).find(c => c.startsWith('seg_admin_session='));
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
// sessão inteira quando o Chromium morre e repassa na hora qualquer falha de
// asserção — nenhuma asserção fica tolerante.
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
      console.log(`UX_THIRD_PARTY_BROWSER_RETRY tentativa=${tentativa}: ${String(erro.message).split('\n')[0]}`);
    } finally {
      await browser.close().catch(() => {});
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw ultimo;
}

const evidenceDir = process.env.UX_THIRD_PARTY_EVIDENCE_DIR || '';
async function capture(page, nome) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage: true });
}

/**
 * Abre /admin/terceiros já autenticada.
 *
 * `failRoutes` derruba, dentro da própria página, as respostas indicadas:
 * `page.route()` é instável com este Chromium empacotado, então a substituição
 * é feita em `window.fetch`, como nos demais gates da série.
 *
 * `presentAdminSession` responde apenas ao `GET /api/admin/session` do
 * AdminGate, para a tela montar com um papel que o menu deixaria entrar. A
 * chamada de EXT-02 continua com o cookie real, e o 403 vem do servidor
 * canônico: a simulação é só da apresentação do menu, nunca da autorização.
 */
async function abrir(browser, cookie, {
  width = 1440, height = 900, failRoutes = [], status = 503,
  code = 'third_party_unavailable', presentAdminSession = false,
} = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  const separador = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, separador), value: cookie.slice(separador + 1), url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(90_000);
  if (failRoutes.length || presentAdminSession) {
    await page.addInitScript(({ routes, failStatus, failCode, showAdminMenu }) => {
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        if (showAdminMenu && url.includes('/api/admin/session') && (!init?.method || init.method === 'GET')) {
          return new Response(
            JSON.stringify({ role: 'admin', identityId: null, mfaVerified: true, expiresAt: '2099-01-01T00:00:00.000Z' }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }
        if (routes.some(route => url.includes(route))) {
          return new Response(JSON.stringify({ error: failCode }), {
            status: failStatus, headers: { 'content-type': 'application/json' },
          });
        }
        return original(input, init);
      };
    }, { routes: failRoutes, failStatus: status, failCode: code, showAdminMenu: presentAdminSession });
  }
  await page.goto(`${baseUrl}/admin/terceiros`, { waitUntil: 'domcontentloaded' });
  // O h1 real é a marca de que a página de produto montou. Esperar o contêiner
  // da aba mediria a tela antes de a leitura terminar.
  await page.getByRole('heading', { level: 1, name: 'Terceiros, acesso por escopo autorizado e perda de acesso ao término' }).waitFor();
  return { context, page };
}

async function criarTerceiro(body) {
  const criado = await api('/api/ext/third-party/parties', { method: 'POST', cookie: tiCookie, body });
  assert.equal(criado.status, 201, `criação de terceiro deveria ser 201, veio ${criado.status} ${criado.text}`);
  return criado.body.third_party;
}

/**
 * Pré-requisito de OUTRA família (CRM), declarado no cabeçalho: contrato
 * canônico em `crm_contracts`, com a proposta mínima que a chave estrangeira
 * exige. Nenhuma tabela de EXT-02 é tocada por SQL aqui.
 */
async function provisionarContratoCrm() {
  const proposal = await pool.query(
    `INSERT INTO crm_proposals (title) VALUES ($1) RETURNING id`,
    [`Proposta sintética UX-07 ${randomUUID().slice(0, 8)}`],
  );
  const { rows } = await pool.query(
    `INSERT INTO crm_contracts (proposal_id, proposal_version, title, status, idempotency_key, created_by)
     VALUES ($1, 1, $2, 'ativo'::crm_contract_status, $3, 'qa_ux_ext02') RETURNING id, title, status`,
    [proposal.rows[0].id, `Contrato sintético UX-07 ${randomUUID().slice(0, 8)}`, randomUUID()],
  );
  return rows[0];
}

before(async () => {
  if (!RUN) return;
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.mjs', '--dev'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: '127.0.0.1',
      NODE_ENV: 'development',
      NEXT_DIST_DIR: '.next/integration-ux-third-party',
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      EMPLOYEE_SESSION_SECRET: randomUUID().repeat(2),
      CLIENT_MFA_ENCRYPTION_KEY: randomBytes(32).toString('base64url'),
      ADMIN_LOGIN_MAX_ATTEMPTS: '200',
      SITE_ADMIN_LEGACY_TOKENS: '',
      OLLAMA_ENABLED: 'false',
      MAIL_HOST: '',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  try {
    await waitForServer();
  } catch (erro) {
    throw new Error(`${erro.message}\n${logs.slice(-3000)}`);
  }
  etapa('servidor no ar');

  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  // Relógio do SERVIDOR: o servidor canônico compara datas com o próprio
  // `todayIso()`. Ancorar a massa aqui evita incoerência de fuso.
  const relogio = await pool.query(
    `SELECT CURRENT_DATE::text AS hoje,
            (CURRENT_DATE - INTERVAL '1 day')::date::text AS ontem,
            (CURRENT_DATE + INTERVAL '10 days')::date::text AS futuro`,
  );
  dataDoServidor = relogio.rows[0].hoje;
  dataDeOntem = relogio.rows[0].ontem;
  dataFutura = relogio.rows[0].futuro;
  etapa(`data-base do servidor ${dataDoServidor} (ontem ${dataDeOntem}, futuro ${dataFutura})`);

  // `ti` está na lista do servidor canônico (admin|marcelo|ti). `rh` não está:
  // é o papel que prova a recusa real.
  tiStaff = await provisionStaff(pool, { role: 'ti' });
  rhStaff = await provisionStaff(pool, { role: 'rh' });
  tiCookie = await loginStaffHttp(tiStaff.email);
  rhCookie = await loginStaffHttp(rhStaff.email);
  etapa('identidades de equipe provisionadas');

  contratoCanonico = await provisionarContratoCrm();
  etapa(`contrato CRM de pré-requisito ${contratoCanonico.id}`);

  // Terceiro 1: completo. Contrato vinculado, janela vigente, documento com
  // validade, regra de antecedência e avaliação — tudo pelas APIs canônicas.
  terceiroCompleto = await criarTerceiro({
    name: `Prestadora Sintética UX-07 ${randomUUID().slice(0, 8)}`,
    document: '00.000.000/0001-00',
    category: 'Prestador sintético',
    responsible_name: 'Responsável sintético UX-07',
    notes: 'Terceiro fictício criado pelo gate UX-07; nenhum dado real.',
  });
  etapa(`terceiro completo ${terceiroCompleto.name}`);

  // Terceiro 2: fica sem contrato, sem janela, sem documento, sem regra e sem
  // avaliação — a ausência honesta de ponta a ponta.
  terceiroVazio = await criarTerceiro({
    name: `Prestadora Sintética Sem Histórico ${randomUUID().slice(0, 8)}`,
  });
  assert.equal(terceiroVazio.contract_id, null, 'o terceiro vazio não pode nascer com contrato');
  assert.equal(terceiroVazio.evaluation_score, null, 'o terceiro vazio não pode nascer com nota');
  etapa(`terceiro vazio ${terceiroVazio.name}`);

  const vinculo = await api(`/api/ext/third-party/parties/${terceiroCompleto.id}/contract`, {
    method: 'POST', cookie: tiCookie,
    body: { contract_id: contratoCanonico.id, justification: 'Vínculo sintético registrado pelo gate UX-07.' },
  });
  assert.equal(vinculo.status, 201, `vínculo de contrato deveria ser 201, veio ${vinculo.status} ${vinculo.text}`);

  const janela = await api(`/api/ext/third-party/parties/${terceiroCompleto.id}/access-grants`, {
    method: 'POST', cookie: tiCookie,
    body: {
      scope_kind: 'contrato',
      scope_id: contratoCanonico.id,
      access_start: dataDeOntem,
      access_end: dataFutura,
      justification: 'Janela sintética vigente registrada pelo gate UX-07 para provar a derivação do término.',
    },
  });
  assert.equal(janela.status, 201, `janela deveria ser 201, veio ${janela.status} ${janela.text}`);
  janelaVigente = janela.body.access_grant?.id || '';
  assert.ok(janelaVigente, `a resposta precisa devolver a janela criada: ${janela.text}`);

  // Regra ANTES do documento: com regra explícita, o documento que vence
  // dentro da antecedência sai como `a_vencer` — nunca inferido sem regra.
  const regra = await api(`/api/ext/third-party/parties/${terceiroCompleto.id}/document-rules`, {
    method: 'POST', cookie: tiCookie,
    body: { alert_before_days: 30, justification: 'Regra sintética de antecedência registrada pelo gate UX-07.' },
  });
  assert.equal(regra.status, 201, `regra deveria ser 201, veio ${regra.status} ${regra.text}`);

  const documento = await api(`/api/ext/third-party/parties/${terceiroCompleto.id}/documents`, {
    method: 'POST', cookie: tiCookie,
    body: {
      document_type: 'Certidão sintética',
      document_number: 'DOC-UX07-0002',
      expiry_date: dataFutura,
      file_name: 'certidao-sintetica.pdf',
    },
  });
  assert.equal(documento.status, 201, `documento deveria ser 201, veio ${documento.status} ${documento.text}`);
  documentoAtivo = documento.body.document.id;

  // Avaliação com nota ZERO REAL: o zero do servidor precisa continuar
  // aparecendo como 0/10, sem se confundir com ausência de avaliação.
  const avaliacao = await api(`/api/ext/third-party/parties/${terceiroCompleto.id}/evaluations`, {
    method: 'POST', cookie: tiCookie,
    body: {
      score: 0,
      evaluated_on: dataDeOntem,
      justification: 'Avaliação sintética com nota zero real, registrada pelo gate UX-07 para separar zero de ausência.',
    },
  });
  assert.equal(avaliacao.status, 201, `avaliação deveria ser 201, veio ${avaliacao.status} ${avaliacao.text}`);

  // Conferência de LEITURA: o servidor realmente persistiu a massa.
  const persistido = await pool.query(
    `SELECT (SELECT count(*) FROM ext_third_party_access_grants WHERE third_party_id=$1) AS janelas,
            (SELECT count(*) FROM ext_third_party_documents WHERE third_party_id=$1) AS documentos,
            (SELECT count(*) FROM ext_third_party_evaluations WHERE third_party_id=$1) AS avaliacoes,
            (SELECT count(*) FROM ext_third_party_events WHERE third_party_id=$1) AS eventos`,
    [terceiroCompleto.id],
  );
  assert.equal(Number(persistido.rows[0].janelas), 1, 'a janela precisa existir no banco');
  assert.equal(Number(persistido.rows[0].documentos), 1, 'o documento precisa existir no banco');
  assert.equal(Number(persistido.rows[0].avaliacoes), 1, 'a avaliação precisa existir no banco');
  assert.ok(Number(persistido.rows[0].eventos) >= 5, 'a trilha precisa registrar cada escrita');
  etapa('massa canônica do terceiro completo');

  // A página precisa estar compilada antes de qualquer medição no navegador.
  for (const route of ['/admin/entrar', '/admin/terceiros']) {
    const deadline = Date.now() + 240_000;
    for (;;) {
      try {
        const res = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
        if (res.status !== 404) break;
      } catch { /* ainda compilando */ }
      if (Date.now() > deadline) throw new Error(`page_compile_timeout_${route}`);
      await new Promise(r => setTimeout(r, 500));
    }
    etapa(`página compilada ${route}`);
  }
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) {
    server.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 300));
    server.kill('SIGKILL');
  }
});

test('a rota canônica de terceiros continua exigindo sessão, papel, origem e chave', { skip: !RUN }, async () => {
  const anonimo = await api('/api/ext/third-party/parties');
  assert.equal(anonimo.status, 401);
  assert.equal(anonimo.body.error, 'unauthorized');
  assert.ok(!('third_parties' in (anonimo.body || {})), 'a negativa não pode vazar terceiro algum');

  const papelRecusado = await api('/api/ext/third-party/parties', { cookie: rhCookie });
  assert.equal(papelRecusado.status, 403, 'o servidor recusa o papel fora da lista canônica');
  assert.equal(papelRecusado.body.error, 'forbidden_role');
  assert.ok(!('third_parties' in (papelRecusado.body || {})), 'a negativa não pode vazar terceiro algum');

  assert.equal((await api('/api/ext/third-party/parties', {
    method: 'POST', cookie: tiCookie, idempotencyKey: null, body: { name: 'Sem chave de idempotência' },
  })).status, 400, 'escrita sem chave de idempotência é recusada');
  assert.equal((await api('/api/ext/third-party/parties', {
    method: 'POST', cookie: tiCookie, origin: 'https://attacker.invalid', body: { name: 'Origem cruzada recusada' },
  })).status, 403, 'origem cruzada é recusada antes de qualquer efeito');

  // O recorte legado continua religado em leitura e aposentado em escrita, e
  // NÃO é consumido pela tela.
  assert.equal((await api('/api/ext/third-parties', { cookie: tiCookie })).status, 200);
  const legadaEscrita = await api('/api/ext/third-parties', { method: 'POST', cookie: tiCookie, body: {} });
  assert.equal(legadaEscrita.status, 410);
  assert.equal(legadaEscrita.body.error, 'legacy_route_retired');
  assert.equal(legadaEscrita.body.use, '/api/ext/third-party/parties');
});

test('o corpo de cada escrita é o que o servidor realmente lê', { skip: !RUN }, async () => {
  // Regras de conteúdo conferidas contra o servidor real, antes de qualquer
  // efeito — o estado do terceiro não muda em nenhuma destas recusas.
  const semJustificativa = await api(`/api/ext/third-party/parties/${terceiroCompleto.id}/access-grants`, {
    method: 'POST', cookie: tiCookie,
    body: { scope_kind: 'contrato', scope_id: contratoCanonico.id, access_start: dataDeOntem, access_end: dataFutura, justification: '' },
  });
  assert.equal(semJustificativa.status, 400);
  assert.equal(semJustificativa.body.error, 'invalid_justification');

  const escopoInvalido = await api(`/api/ext/third-party/parties/${terceiroCompleto.id}/access-grants`, {
    method: 'POST', cookie: tiCookie,
    body: { scope_kind: 'escopo_que_nao_existe', scope_id: contratoCanonico.id, access_start: dataDeOntem, access_end: dataFutura, justification: 'Justificativa sintética do gate UX-07 para escopo inválido.' },
  });
  assert.equal(escopoInvalido.status, 400);
  assert.equal(escopoInvalido.body.error, 'invalid_scope_kind');

  // Data futura é recusada pelo relógio do SERVIDOR, não pelo do teste.
  const avaliacaoFutura = await api(`/api/ext/third-party/parties/${terceiroCompleto.id}/evaluations`, {
    method: 'POST', cookie: tiCookie,
    body: { score: 8, evaluated_on: dataFutura, justification: 'Avaliação sintética datada no futuro, recusada pelo servidor.' },
  });
  assert.equal(avaliacaoFutura.status, 400);
  assert.equal(avaliacaoFutura.body.error, 'evaluated_on_in_future');

  // O terceiro sem janela não é "autorizado por omissão": o ponto de imposição
  // responde com a ausência declarada.
  const decisaoVazia = await api(
    `/api/ext/third-party/parties/${terceiroVazio.id}/authorization?scope_kind=contrato&scope_id=${contratoCanonico.id}`,
    { cookie: tiCookie },
  );
  assert.equal(decisaoVazia.status, 200);
  assert.equal(decisaoVazia.body.authorized, false);
  assert.equal(decisaoVazia.body.reason, 'sem_janela_registrada');
});

test('browser: a jornada canônica sai em português, com ausência honesta e zero real', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, tiCookie);
    await page.getByText(terceiroCompleto.name, { exact: false }).first().waitFor();

    // Fronteira externa declarada, nunca simulada.
    const fronteira = await page.locator('[data-testid="terceiros-fronteira"]').textContent();
    assert.match(fronteira, /Não existe hoje ator externo “terceiro” autenticado/);
    assert.match(fronteira, /PENDENTE/);
    const fronteiraServidor = await page.locator('[data-testid="terceiros-fronteira-servidor"]').textContent();
    assert.match(fronteiraServidor, /pendente/);
    assert.match(fronteiraServidor, /Ponto de imposição/);
    assert.match(fronteiraServidor, /authorization/);

    // Lista: vocabulário em português, sem valor cru do banco.
    const tabela = await page.locator('[data-testid="terceiros-tabela"]').textContent();
    assert.match(tabela, /Ativo/, 'a situação sai em português');
    assert.doesNotMatch(tabela, /com_acesso_vigente|sem_janela_registrada|ordem_servico/, 'nenhum valor cru do banco');
    const linhaVazia = await page.getByRole('row', { name: new RegExp(terceiroVazio.name) }).textContent();
    assert.match(linhaVazia, /Nenhum contrato canônico vinculado/);
    assert.match(linhaVazia, /Nenhuma avaliação canônica registrada/, 'ausência de nota nunca vira 0/10');
    assert.doesNotMatch(linhaVazia, /0\/10/, 'ausência de avaliação não é nota zero');

    // Zero REAL do servidor: o terceiro completo tem avaliação de nota 0.
    const linhaCompleta = await page.getByRole('row', { name: new RegExp(terceiroCompleto.name) }).textContent();
    assert.match(linhaCompleta, /0\/10/, 'a nota ZERO REAL do servidor continua aparecendo');
    assert.match(linhaCompleta, /Com acesso vigente/, 'a situação de acesso derivada sai em português');

    // Dossiê: fatos canônicos, contrato validado e situação derivada.
    await page.getByRole('row', { name: new RegExp(terceiroCompleto.name) })
      .getByRole('button', { name: 'Ver dossiê canônico' }).click();
    await page.locator('[data-testid="terceiros-dossie-fatos"]').waitFor();
    const fatos = await page.locator('[data-testid="terceiros-dossie-fatos"]').textContent();
    assert.match(fatos, /Ativo/);
    assert.match(fatos, /Com acesso vigente/);
    assert.match(fatos, /1 janela\(s\) vigente\(s\) de 1 registrada\(s\)/);
    assert.doesNotMatch(fatos, /01\/01\/1970/, 'ausência nunca vira 01/01/1970');
    const contrato = await page.locator('[data-testid="terceiros-contrato"]').textContent();
    assert.match(contrato, new RegExp(contratoCanonico.title.slice(0, 20)));

    // Janelas: derivação do término, em português.
    await page.getByRole('tab', { name: 'Janelas de acesso', exact: true }).click();
    await page.locator('[data-testid="terceiros-acessos-lista"]').waitFor();
    const acessos = await page.locator('[data-testid="terceiros-acessos-lista"]').textContent();
    assert.match(acessos, /Acesso vigente/);
    assert.match(acessos, /Contrato:/);
    assert.match(acessos, /Janela sintética vigente registrada pelo gate UX-07/);
    assert.doesNotMatch(acessos, /nao_iniciado|sem_acesso_vigente/, 'nenhum status cru de janela');

    // Documentos: `a_vencer` só com regra explícita registrada.
    await page.getByRole('tab', { name: 'Documentos e regra', exact: true }).click();
    await page.locator('[data-testid="terceiros-documentos-lista"]').waitFor();
    const documentos = await page.locator('[data-testid="terceiros-documentos-lista"]').textContent();
    assert.match(documentos, /A vencer, dentro da antecedência da regra/);
    assert.match(documentos, /Regra registrada de 30 dia\(s\) de antecedência/);
    assert.doesNotMatch(documentos, /a_vencer|sem_data_declarada/, 'nenhum status cru de vencimento');
    const regra = await page.locator('[data-testid="terceiros-regra"]').textContent();
    assert.match(regra, /Regra de antecedência registrada: 30 dia\(s\)/);

    // Avaliações: nota zero real preservada.
    await page.getByRole('tab', { name: 'Avaliações', exact: true }).click();
    await page.locator('[data-testid="terceiros-avaliacoes-lista"]').waitFor();
    const avaliacoes = await page.locator('[data-testid="terceiros-avaliacoes-lista"]').textContent();
    assert.match(avaliacoes, /0\/10/, 'nota zero real continua zero');
    assert.doesNotMatch(avaliacoes, /Dado ausente em/, 'nota real não é ausência');

    // Trilha: evento em português, nunca o `event_type` cru.
    await page.getByRole('tab', { name: 'Trilha de eventos', exact: true }).click();
    await page.locator('[data-testid="terceiros-eventos-lista"]').waitFor();
    const eventos = await page.locator('[data-testid="terceiros-eventos-lista"]').textContent();
    assert.match(eventos, /Terceiro registrado/);
    assert.match(eventos, /Contrato vinculado após validação canônica/);
    assert.match(eventos, /Acesso temporário concedido/);
    assert.match(eventos, /Documento registrado/);
    assert.match(eventos, /Avaliação registrada/);
    assert.doesNotMatch(eventos, /terceiro_criado|acesso_concedido|avaliacao_registrada/, 'nenhum event_type cru');

    // Terceiro vazio: ausência honesta em todas as leituras derivadas.
    await page.getByRole('tab', { name: 'Terceiros registrados', exact: true }).click();
    await page.getByRole('row', { name: new RegExp(terceiroVazio.name) })
      .getByRole('button', { name: 'Ver dossiê canônico' }).click();
    await page.locator('[data-testid="terceiros-dossie-fatos"]').waitFor();
    const vazioFatos = await page.locator('[data-testid="terceiros-dossie-fatos"]').textContent();
    assert.match(vazioFatos, /Nenhuma janela de acesso registrada/);
    assert.match(vazioFatos, /Sem responsável declarado no registro canônico/);
    assert.match(vazioFatos, /Dado ausente/, 'campo realmente ausente é dito como ausente');
    assert.doesNotMatch(vazioFatos, /01\/01\/1970/);

    await page.getByRole('tab', { name: 'Janelas de acesso', exact: true }).click();
    const semJanela = page.locator('[data-testid="terceiros-acessos-vazio"] [data-ui-state="empty"]');
    await semJanela.waitFor();
    const textoJanela = await semJanela.textContent();
    assert.match(textoJanela, /A leitura funcionou/i, 'vazio legítimo diz que a leitura funcionou');
    assert.match(textoJanela, /Ausência de janela não é acesso liberado/i);
    assert.equal(await page.locator('[data-testid="terceiros-acessos-lista"]').count(), 0);

    await page.getByRole('tab', { name: 'Documentos e regra', exact: true }).click();
    const semDocumento = page.locator('[data-testid="terceiros-documentos-vazio"] [data-ui-state="empty"]');
    await semDocumento.waitFor();
    assert.match(await semDocumento.textContent(), /Ausência de documento registrado não é prova de documentação em dia/i);
    assert.match(await page.locator('[data-testid="terceiros-regra"]').textContent(), /Sem regra de antecedência registrada/);

    await page.getByRole('tab', { name: 'Avaliações', exact: true }).click();
    const semAvaliacao = page.locator('[data-testid="terceiros-avaliacoes-vazio"] [data-ui-state="empty"]');
    await semAvaliacao.waitFor();
    assert.match(await semAvaliacao.textContent(), /Ausência de avaliação não é nota zero/i);

    await capture(page, 'desktop-terceiros-jornada');
    await context.close();
  });
});

test('browser: as oito abas são um tablist real, percorrido por teclado', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, tiCookie);
    await page.getByText(terceiroCompleto.name, { exact: false }).first().waitFor();

    const abas = page.getByRole('tab');
    assert.equal(await abas.count(), 8, 'a jornada tem oito abas reais');
    assert.equal(await page.getByRole('tablist').count(), 1);

    const primeira = abas.nth(0);
    await primeira.focus();
    assert.equal(await primeira.getAttribute('aria-selected'), 'true');
    assert.equal(await abas.nth(1).getAttribute('tabindex'), '-1', 'roving tabindex');

    await page.keyboard.press('ArrowRight');
    assert.equal(await abas.nth(1).getAttribute('aria-selected'), 'true');
    assert.equal(await abas.nth(1).evaluate(node => node === document.activeElement), true, 'o foco acompanha a aba');

    await page.keyboard.press('End');
    assert.equal(await abas.nth(7).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await abas.nth(0).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await abas.nth(7).getAttribute('aria-selected'), 'true', 'a navegação circula');

    // Cada aba controla um tabpanel existente e rotulado.
    for (let indice = 0; indice < 8; indice++) {
      const controls = await abas.nth(indice).getAttribute('aria-controls');
      assert.ok(controls, `a aba ${indice} precisa apontar um tabpanel`);
    }
    const painel = page.getByRole('tabpanel');
    assert.equal(await painel.count(), 1, 'apenas o painel ativo está no DOM');

    await context.close();
  });
});

test('browser: falha de leitura não vira lista vazia nem indicador zero', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, tiCookie, {
      failRoutes: ['/api/ext/third-party/parties'], status: 503, code: 'third_party_unavailable',
    });
    const erro = page.locator('[data-testid="terceiros-lista-erro"] [data-ui-state="error"]');
    await erro.waitFor();
    const texto = await erro.textContent();
    assert.match(texto, /Jornada de terceiros indisponível/);
    assert.match(texto, /Isto não significa que não existam terceiros registrados/);
    assert.match(texto, /\(third_party_unavailable\)/, 'o código canônico fica no rodapé técnico');
    // A tabela e os contadores ficam AUSENTES do DOM: falha não é vazio.
    assert.equal(await page.locator('[data-testid="terceiros-tabela"]').count(), 0);
    assert.equal(await page.locator('[data-testid="terceiros-metricas"]').count(), 0);
    assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0, 'falha nunca é lida como vazio');
    await capture(page, 'desktop-terceiros-falha');
    await context.close();
  });
});

test('browser: recusa de papel é estado NEGADO, distinto de falha e de vazio', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    // O menu deixa entrar (sessão sintética só no GET /api/admin/session), mas
    // a chamada canônica segue com o cookie REAL de papel recusado: a
    // autorização nunca é simulada, o 403 vem do servidor.
    const { context, page } = await abrir(browser, rhCookie, { presentAdminSession: true });
    const negado = page.locator('[data-testid="terceiros-lista-erro"] [data-ui-state="denied"]');
    await negado.waitFor();
    const texto = await negado.textContent();
    assert.match(texto, /Papel sem acesso à jornada de terceiros/);
    assert.match(texto, /\(forbidden_role\)/);
    assert.match(texto, /Menu não é autorização/);
    assert.equal(await page.locator('[data-ui-state="error"]').count(), 0, 'negado não é falha genérica');
    assert.equal(await page.locator('[data-testid="terceiros-tabela"]').count(), 0, 'a negativa não vaza terceiro algum');
    await capture(page, 'desktop-terceiros-negado');
    await context.close();
  });
});

test('browser: a falha da decisão de autorização não contamina o dossiê', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, tiCookie, {
      failRoutes: ['/authorization'], status: 503, code: 'third_party_unavailable',
    });
    await page.getByText(terceiroCompleto.name, { exact: false }).first().waitFor();
    await page.getByRole('row', { name: new RegExp(terceiroCompleto.name) })
      .getByRole('button', { name: 'Ver dossiê canônico' }).click();
    await page.locator('[data-testid="terceiros-dossie-fatos"]').waitFor();

    await page.getByRole('tab', { name: 'Decisão de autorização', exact: true }).click();
    await page.getByLabel(/Identificador do contrato ou da ordem de serviço consultada/).fill(contratoCanonico.id);
    await page.getByRole('button', { name: 'Consultar a decisão do servidor' }).click();
    const erro = page.locator('[data-testid="terceiros-autorizacao-erro"] [data-ui-state="error"]');
    await erro.waitFor();
    assert.match(await erro.textContent(), /Falha de consulta não é negativa de acesso/i);
    assert.equal(await page.locator('[data-testid="terceiros-decisao"]').count(), 0, 'sem decisão, nada de AUTORIZADO/NEGADO');

    // O dossiê continua inteiro: a falha de uma leitura não apaga a outra.
    await page.getByRole('tab', { name: 'Dossiê e contrato', exact: true }).click();
    await page.locator('[data-testid="terceiros-dossie-fatos"]').waitFor();
    assert.match(await page.locator('[data-testid="terceiros-dossie-fatos"]').textContent(), /Com acesso vigente/);
    await context.close();
  });
});

test('browser: a decisão real do servidor é mostrada como veio', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, tiCookie);
    await page.getByText(terceiroCompleto.name, { exact: false }).first().waitFor();
    await page.getByRole('row', { name: new RegExp(terceiroCompleto.name) })
      .getByRole('button', { name: 'Ver dossiê canônico' }).click();
    await page.locator('[data-testid="terceiros-dossie-fatos"]').waitFor();

    await page.getByRole('tab', { name: 'Decisão de autorização', exact: true }).click();
    await page.getByLabel(/Identificador do contrato ou da ordem de serviço consultada/).fill(contratoCanonico.id);
    await page.getByRole('button', { name: 'Consultar a decisão do servidor' }).click();
    const decisao = page.locator('[data-testid="terceiros-decisao"]');
    await decisao.waitFor();
    const autorizado = await decisao.textContent();
    assert.match(autorizado, /AUTORIZADO/);
    assert.match(autorizado, /Janela canônica vigente para o escopo pedido/);
    assert.doesNotMatch(autorizado, /janela_vigente/, 'nenhum motivo cru do servidor');

    // Escopo que o terceiro não tem: NEGADO pelo servidor, em português.
    await page.getByLabel(/Identificador do contrato ou da ordem de serviço consultada/).fill(randomUUID());
    await page.getByRole('button', { name: 'Consultar a decisão do servidor' }).click();
    await page.locator('[data-testid="terceiros-decisao"]').getByText('NEGADO').waitFor();
    const negado = await page.locator('[data-testid="terceiros-decisao"]').textContent();
    assert.match(negado, /Escopo não autorizado para este terceiro/);
    assert.doesNotMatch(negado, /escopo_nao_autorizado/);

    await capture(page, 'desktop-terceiros-decisao');
    await context.close();
  });
});

test('browser: a escrita usa o texto de quem opera e preserva a chave na recusa', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, tiCookie);
    await page.getByText(terceiroCompleto.name, { exact: false }).first().waitFor();
    await page.getByRole('row', { name: new RegExp(terceiroCompleto.name) })
      .getByRole('button', { name: 'Ver dossiê canônico' }).click();
    await page.locator('[data-testid="terceiros-dossie-fatos"]').waitFor();
    await page.getByRole('tab', { name: 'Documentos e regra', exact: true }).click();
    await page.locator('[data-testid="terceiros-documentos-lista"]').waitFor();

    // 1) Sem motivo escrito, o servidor recusa com o código real. A tela NÃO
    // escreve motivo no lugar de quem opera.
    await page.getByRole('button', { name: 'Desativar documento com motivo registrado' }).first().click();
    const erroAcao = page.locator('[data-testid="terceiros-action-error"]');
    await erroAcao.waitFor();
    const textoErro = await erroAcao.textContent();
    assert.match(textoErro, /Motivo obrigatório/i, 'a recusa real do servidor é mostrada como veio');
    assert.match(textoErro, /\(invalid_reason\)/, 'o código canônico fica no rodapé técnico');
    assert.match(textoErro, /Chave preservada para repetição segura/i);
    const chave = (textoErro.match(/ext02-dcx-[0-9a-f-]{36}/) || [])[0];
    assert.ok(chave, `a chave de idempotência precisa aparecer na íntegra: ${textoErro}`);
    assert.equal(
      (await pool.query('SELECT is_active FROM ext_third_party_documents WHERE id=$1', [documentoAtivo])).rows[0].is_active,
      true,
      'a recusa não pode ter desativado o documento',
    );

    // 2) Com o motivo escrito por quem opera, a MESMA chave é reaproveitada e
    // o servidor confirma a desativação.
    await page.getByLabel(/Motivo da desativação deste documento/)
      .fill('Documento sintético substituído, conforme registro do gate UX-07.');
    await page.getByRole('button', { name: 'Desativar documento com motivo registrado' }).first().click();
    await page.locator('[data-testid="terceiros-documentos-lista"]').getByText('Desativado com autor e motivo').first().waitFor();
    assert.equal(await page.locator('[data-testid="terceiros-action-error"]').count(), 0,
      'confirmado pelo servidor, o erro anterior sai da tela');

    const persistido = await pool.query(
      'SELECT is_active, deactivate_reason FROM ext_third_party_documents WHERE id=$1', [documentoAtivo],
    );
    assert.equal(persistido.rows[0].is_active, false, 'o servidor realmente desativou o documento');
    assert.equal(persistido.rows[0].deactivate_reason, 'Documento sintético substituído, conforme registro do gate UX-07.',
      'o texto gravado é o de quem operou, não um texto inventado pela tela');

    const evento = await pool.query(
      `SELECT idempotency_key FROM ext_third_party_events
       WHERE third_party_id=$1 AND event_type='documento_desativado'`, [terceiroCompleto.id],
    );
    assert.equal(evento.rowCount, 1, 'a trilha registra exatamente uma desativação');
    assert.equal(evento.rows[0].idempotency_key, chave, 'a chave preservada é a mesma usada na repetição');

    await capture(page, 'desktop-terceiros-escrita');
    await context.close();
  });
});

test('browser: em 390px a tela de terceiros não produz transbordo horizontal', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, tiCookie, { width: 390, height: 844 });
    await page.getByText(terceiroCompleto.name, { exact: false }).first().waitFor();
    await page.locator('[data-testid="terceiros-tabela"]').waitFor();
    await page.waitForTimeout(600);
    const transbordo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(transbordo <= 1, `transbordo de ${transbordo}px em /admin/terceiros`);
    await capture(page, 'mobile-terceiros-390px');
    await context.close();
  });
});
