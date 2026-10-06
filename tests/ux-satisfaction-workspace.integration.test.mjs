// UX-07 / EXT-06 — gate da tela /admin/satisfacao, por HTTP real contra
// PostgreSQL real (executado por scripts/qa-ux-satisfaction-postgres.mjs, que
// sobe um cluster descartável) e por Chromium real.
//
// O que este gate prova:
//  - a rota canônica continua exigindo sessão de equipe (401), recusando papel
//    fora da lista do servidor (403 `forbidden_role`), exigindo
//    `idempotency-key` (400) e recusando origem cruzada (403), sem vazar
//    registro algum na negativa;
//  - o DEFEITO CENTRAL desta fatia: o protótipo enviava `{justification}` em
//    `start` e inventava o texto do cancelamento
//    ("Cancelamento explicitamente justificado pela gestão."). O servidor lê
//    `note` em `start`, `result` em `complete` e `justification` em `cancel`.
//    Aqui a correção é provada nos dois níveis: por HTTP (corpo errado →
//    400 do servidor) e no navegador (texto escrito por quem opera → 200);
//  - a chave de idempotência é PRESERVADA após a recusa e fica visível para
//    repetição segura — a mesma chave é reaproveitada no acerto;
//  - falha de leitura não vira lista vazia nem indicador zero: a tabela e os
//    contadores ficam AUSENTES do DOM, e a falha diz que não significa
//    ausência de pesquisas;
//  - recusa de papel é estado NEGADO, distinto de falha e de vazio;
//  - uma leitura que falha não contamina a outra (lista × referências);
//  - as quatro abas são um tablist de verdade, com roving tabindex e teclado;
//  - português no lugar do valor cru do banco (`em_acao`, `ext06_canonica`,
//    `portal_cliente`, `nps`, `aberta`);
//  - ausência honesta: pesquisa sem resposta, acompanhamento sem início e sem
//    conclusão, e conta sem responsável canônico — nunca 0, 0% ou 01/01/1970;
//  - 390px não produz transbordo horizontal.
//
// O que este gate NÃO prova: aceite humano. Marcelo e Andreia não
// participaram; nada aqui é homologação.
//
// MASSA: tudo que é de EXT-06 (pesquisa, resposta do portal, acompanhamento,
// trilha) nasce nas PRÓPRIAS APIs canônicas, por HTTP. Conta de cliente e
// concessão de acesso nascem nas APIs canônicas de CLI/espaço do cliente
// (`POST /api/admin/client-accounts`, `POST /api/admin/grants`) e a empresa
// nasce em `POST /api/crm/companies`. Três vínculos NÃO têm API canônica em
// nenhuma família e ficam declarados como provisionamento, nunca como regra de
// negócio de satisfação: identidade de cliente + sessão do portal, o
// responsável canônico da empresa (`crm_companies.responsible_id`) e o elo
// conta↔empresa (`client_accounts.crm_company_id`). Nenhuma linha de
// `cli_satisfaction_*` é escrita por SQL.
//
// Nenhuma asserção é enfraquecida: a falha de leitura é injetada APENAS em
// `window.fetch`, dentro da própria página. O servidor nunca é alterado para o
// teste passar, e `ERR_ASSERTION` nunca é repetido pelo laço de retomada.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
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
let tiStaff, rhStaff, tiCookie, rhCookie, clientCookie, clientId;
let contaComResponsavel, contaSemResponsavel;
let pesquisaAcompanhada, pesquisaSemResponsavel, pesquisaPendente;
let planoAberto, prazoDoPlano;

const key = label => `ext06-ux-${label}-${randomUUID()}`;

// Marca de progresso do preparo: quando o gate falha em CI, ela diz em qual
// etapa parou. Não altera asserção alguma.
const etapa = nome => console.log(`UX_SATISFACTION_SETUP: ${nome}`);

// As datas da massa são ancoradas no relógio do SERVIDOR, nunca no do processo
// de teste: o prazo do acompanhamento é calculado pelo servidor, e uma
// diferença de fuso entre runner e banco tornaria a asserção incoerente com o
// que a tela mostra. Ler a data do banco é leitura de relógio, não massa.
let dataDoServidor = '';

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
      console.log(`UX_SATISFACTION_BROWSER_RETRY tentativa=${tentativa}: ${String(erro.message).split('\n')[0]}`);
    } finally {
      await browser.close().catch(() => {});
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw ultimo;
}

const evidenceDir = process.env.UX_SATISFACTION_EVIDENCE_DIR || '';
async function capture(page, nome) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage: true });
}

/**
 * Abre /admin/satisfacao já autenticada.
 *
 * `failRoutes` derruba, dentro da própria página, as respostas indicadas:
 * `page.route()` é instável com este Chromium empacotado, então a substituição
 * é feita em `window.fetch`, como nos demais gates da série.
 *
 * `presentAdminSession` responde apenas ao `GET /api/admin/session` do
 * AdminGate, para a tela montar com um papel que o menu deixaria entrar. A
 * chamada de EXT-06 continua com o cookie real, e o 403 vem do servidor
 * canônico: a simulação é só da apresentação do menu, nunca da autorização.
 */
async function abrir(browser, cookie, {
  width = 1440, height = 900, failRoutes = [], status = 503,
  code = 'satisfaction_journey_unavailable', presentAdminSession = false,
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
  await page.goto(`${baseUrl}/admin/satisfacao`, { waitUntil: 'domcontentloaded' });
  // O h1 real é a marca de que a página de produto montou. Esperar o contêiner
  // da aba mediria a tela antes de a leitura terminar.
  await page.getByRole('heading', { level: 1, name: 'Satisfação do cliente e acompanhamento interno' }).waitFor();
  return { context, page };
}

const configuracao = (over = {}) => ({
  survey_type: 'pos_atendimento',
  purpose: 'Medir o atendimento da ronda sintética do gate de interface UX-07.',
  methodology: 'nps',
  methodology_source: 'Política interna sintética de pesquisa, versão 1 do gate UX-07.',
  scale_min: 0,
  scale_max: 10,
  follow_up_threshold: 6,
  reference_start: null,
  reference_end: null,
  ...over,
});

async function criarPesquisa(over = {}) {
  const criada = await api('/api/ext/satisfaction/surveys', {
    method: 'POST', cookie: tiCookie, body: configuracao(over),
  });
  assert.equal(criada.status, 201, `criação deveria ser 201, veio ${criada.status} ${criada.text}`);
  return criada.body.survey;
}

async function responderPeloPortal(surveyId, score, feedback) {
  const respondida = await api('/api/client/satisfaction-surveys', {
    method: 'POST', cookie: clientCookie, body: { survey_id: surveyId, score, feedback },
  });
  assert.equal(respondida.status, 200, `resposta do portal deveria ser 200, veio ${respondida.status} ${respondida.text}`);
  return respondida.body;
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
      NEXT_DIST_DIR: '.next/integration-ux-satisfaction',
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
  dataDoServidor = (await pool.query('SELECT CURRENT_DATE::text AS hoje')).rows[0].hoje;
  etapa(`data-base do servidor ${dataDoServidor}`);

  // `ti` está na lista do servidor canônico (admin|marcelo|ti) e também é
  // aceito pela administração do espaço do cliente. `rh` não está em nenhuma
  // das duas: é o papel que prova a recusa real.
  tiStaff = await provisionStaff(pool, { role: 'ti' });
  rhStaff = await provisionStaff(pool, { role: 'rh' });
  tiCookie = await loginStaffHttp(tiStaff.email);
  rhCookie = await loginStaffHttp(rhStaff.email);
  etapa('identidades de equipe provisionadas');

  // Provisionamento declarado: nenhuma API canônica cria identidade de cliente
  // nem sessão do portal. É autenticação, não massa de satisfação.
  clientId = randomUUID();
  const token = randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO auth_identities(id,kind,email,display_name,status,verification_method,verified_at)
     VALUES($1,'client',$2,'Cliente sintético UX-07','active','email_link',NOW())`,
    [clientId, `cliente-ux07-${clientId.slice(0, 8)}@exemplo.invalid`],
  );
  await pool.query(
    `INSERT INTO auth_sessions(id,identity_id,token_hash,expires_at)
     VALUES($1,$2,$3,NOW()+INTERVAL '2 hours')`,
    [randomUUID(), clientId, createHash('sha256').update(token).digest('hex')],
  );
  clientCookie = `seg_client_session=${token}`;
  etapa('identidade e sessão do portal do cliente');

  // Contas e concessões pelas APIs canônicas do espaço do cliente.
  const contaA = await api('/api/admin/client-accounts', {
    method: 'POST', cookie: tiCookie,
    body: { displayName: 'Conta sintética UX-07 com responsável', notes: 'Massa fictícia do gate UX-07; nenhum dado pessoal real.' },
  });
  assert.equal(contaA.status, 201, `conta deveria ser 201, veio ${contaA.status} ${contaA.text}`);
  contaComResponsavel = contaA.body.accountId;

  const contaB = await api('/api/admin/client-accounts', {
    method: 'POST', cookie: tiCookie,
    body: { displayName: 'Conta sintética UX-07 sem responsável', notes: 'Massa fictícia do gate UX-07 para ausência honesta de acompanhamento.' },
  });
  assert.equal(contaB.status, 201, `conta deveria ser 201, veio ${contaB.status} ${contaB.text}`);
  contaSemResponsavel = contaB.body.accountId;

  for (const conta of [contaComResponsavel, contaSemResponsavel]) {
    const grant = await api('/api/admin/grants', {
      method: 'POST', cookie: tiCookie,
      body: {
        identityId: clientId,
        clientAccountId: conta,
        reason: 'Concessão sintética do gate UX-07 para o portal responder a pesquisa.',
        scopeNote: 'Escopo sintético do gate UX-07.',
      },
    });
    assert.equal(grant.status, 201, `concessão deveria ser 201, veio ${grant.status} ${grant.text}`);
  }
  etapa('contas e concessões canônicas');

  // Empresa pela API canônica do CRM. O responsável canônico e o elo
  // conta↔empresa não têm API em família alguma: ficam declarados aqui como
  // provisionamento, e nenhuma linha de satisfação é escrita por SQL.
  const empresa = await api('/api/crm/companies', {
    method: 'POST', cookie: tiCookie,
    body: { display_name: 'Empresa sintética UX-07', type: 'client', responsible_name: 'Nome legado ignorado pelo servidor' },
  });
  assert.equal(empresa.status, 201, `empresa deveria ser 201, veio ${empresa.status} ${empresa.text}`);
  await pool.query('UPDATE crm_companies SET responsible_id=$2 WHERE id=$1', [empresa.body.company.id, tiStaff.id]);
  await pool.query('UPDATE client_accounts SET crm_company_id=$2 WHERE id=$1', [contaComResponsavel, empresa.body.company.id]);
  etapa('empresa canônica e responsável declarado');

  // Pesquisa 1: nota baixa em conta COM responsável canônico → o servidor abre
  // o acompanhamento sozinho, com regra e fatos registrados.
  pesquisaAcompanhada = await criarPesquisa({
    client_account_id: contaComResponsavel,
    target_identity_id: clientId,
  });
  await responderPeloPortal(
    pesquisaAcompanhada.id, 2,
    'Resposta sintética do gate: a ronda noturna atrasou duas vezes na semana declarada.',
  );
  const planos = await pool.query(
    'SELECT id, due_date::text AS prazo, status FROM cli_satisfaction_action_plans WHERE survey_id=$1',
    [pesquisaAcompanhada.id],
  );
  assert.equal(planos.rowCount, 1, 'a regra declarada precisa abrir exatamente um acompanhamento');
  assert.equal(planos.rows[0].status, 'aberta');
  planoAberto = planos.rows[0].id;
  // O prazo é lido do próprio servidor, nunca recalculado pelo relógio do
  // processo de teste.
  prazoDoPlano = planos.rows[0].prazo;
  etapa(`acompanhamento aberto com prazo ${prazoDoPlano}`);

  // Pesquisa 2: nota baixa em conta SEM responsável canônico → o servidor
  // falha fechado e registra o motivo, sem abrir acompanhamento.
  pesquisaSemResponsavel = await criarPesquisa({
    client_account_id: contaSemResponsavel,
    target_identity_id: clientId,
    survey_type: 'periodica',
    methodology: 'csat',
    methodology_source: 'Política interna sintética de CSAT, versão 1 do gate UX-07.',
    scale_min: 1,
    scale_max: 5,
    follow_up_threshold: 2,
    purpose: 'Medir a percepção periódica sintética da conta sem responsável canônico.',
  });
  await responderPeloPortal(
    pesquisaSemResponsavel.id, 1,
    'Resposta sintética do gate: a conta não tem responsável canônico ativo declarado.',
  );
  const semPlano = await pool.query(
    'SELECT count(*)::int AS n FROM cli_satisfaction_action_plans WHERE survey_id=$1',
    [pesquisaSemResponsavel.id],
  );
  assert.equal(semPlano.rows[0].n, 0, 'sem responsável canônico o servidor não pode abrir acompanhamento');
  etapa('pesquisa sem responsável canônico');

  // Pesquisa 3: permanece pendente, para provar ausência honesta de resposta.
  pesquisaPendente = await criarPesquisa({
    client_account_id: contaComResponsavel,
    target_identity_id: clientId,
    survey_type: 'outro',
    methodology: 'generica',
    methodology_source: 'Escala genérica sintética declarada pela equipe no gate UX-07.',
    purpose: 'Pesquisa sintética que permanece sem resposta para provar ausência honesta.',
  });
  etapa('pesquisa pendente');

  // A página precisa estar compilada antes de qualquer medição no navegador.
  for (const route of ['/admin/entrar', '/admin/satisfacao']) {
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

test('a rota canônica de satisfação continua exigindo sessão, papel e origem', { skip: !RUN }, async () => {
  const anonimo = await api('/api/ext/satisfaction/surveys');
  assert.equal(anonimo.status, 401);
  assert.equal(anonimo.body.error, 'unauthorized');
  assert.ok(!('surveys' in (anonimo.body || {})), 'a negativa não pode vazar pesquisa alguma');

  const papelRecusado = await api('/api/ext/satisfaction/surveys', { cookie: rhCookie });
  assert.equal(papelRecusado.status, 403, 'o servidor recusa o papel fora da lista canônica');
  assert.equal(papelRecusado.body.error, 'forbidden_role');
  assert.ok(!('surveys' in (papelRecusado.body || {})), 'a negativa não pode vazar pesquisa alguma');

  assert.equal((await api('/api/ext/satisfaction/surveys', {
    method: 'POST', cookie: tiCookie, idempotencyKey: null, body: configuracao({ client_account_id: contaComResponsavel, target_identity_id: clientId }),
  })).status, 400, 'escrita sem chave de idempotência é recusada');
  assert.equal((await api('/api/ext/satisfaction/surveys', {
    method: 'POST', cookie: tiCookie, origin: 'https://attacker.invalid', body: configuracao({ client_account_id: contaComResponsavel, target_identity_id: clientId }),
  })).status, 403, 'origem cruzada é recusada antes de qualquer efeito');

  // O recorte legado continua religado em leitura e aposentado em escrita, e
  // NÃO é consumido pela tela.
  assert.equal((await api('/api/ext/satisfaction-surveys', { cookie: tiCookie })).status, 200);
  const legadaEscrita = await api('/api/ext/satisfaction-surveys', { method: 'POST', cookie: tiCookie, body: {} });
  assert.equal(legadaEscrita.status, 410);
  assert.equal(legadaEscrita.body.error, 'legacy_mutation_retired');
  assert.equal(legadaEscrita.body.canonical, '/api/ext/satisfaction/surveys');
});

test('o corpo de cada transição é o que o servidor realmente lê', { skip: !RUN }, async () => {
  // Defeito corrigido nesta fatia, provado contra o servidor real: o protótipo
  // mandava `{justification}` em `start`. As três recusas abaixo acontecem
  // ANTES de qualquer efeito, então o acompanhamento continua aberto.
  const inicioComCorpoErrado = await api(`/api/ext/satisfaction/plans/${planoAberto}/start`, {
    method: 'POST', cookie: tiCookie, body: { justification: 'Texto longo o bastante para passar em outro campo.' },
  });
  assert.equal(inicioComCorpoErrado.status, 400);
  assert.equal(inicioComCorpoErrado.body.error, 'note_required');

  const conclusaoComCorpoErrado = await api(`/api/ext/satisfaction/plans/${planoAberto}/complete`, {
    method: 'POST', cookie: tiCookie, body: { note: 'Texto de nota usado no campo errado.' },
  });
  assert.equal(conclusaoComCorpoErrado.status, 400);
  assert.equal(conclusaoComCorpoErrado.body.error, 'result_required');

  const cancelamentoComCorpoErrado = await api(`/api/ext/satisfaction/plans/${planoAberto}/cancel`, {
    method: 'POST', cookie: tiCookie, body: { result: 'Texto de resultado usado no campo errado.' },
  });
  assert.equal(cancelamentoComCorpoErrado.status, 400);
  assert.equal(cancelamentoComCorpoErrado.body.error, 'justification_required');

  assert.equal(
    (await pool.query('SELECT status FROM cli_satisfaction_action_plans WHERE id=$1', [planoAberto])).rows[0].status,
    'aberta',
    'recusa de validação não pode mudar o estado do acompanhamento',
  );
});

test('browser: recusa de papel vira estado NEGADO, nunca lista vazia', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    // O papel `rh` não está em allowedRoles do AdminGate: a sessão sintética
    // existe só para a tela montar. A chamada canônica segue com o cookie real
    // de `rh` e o 403 abaixo vem do servidor de verdade.
    const { context, page } = await abrir(browser, rhCookie, { presentAdminSession: true });
    const painel = page.locator('[data-testid="satisfacao-surveys"]');
    await painel.waitFor();
    const negado = page.locator('[data-testid="satisfacao-surveys-error"] [data-ui-state="denied"]');
    await negado.waitFor();
    const texto = await negado.textContent();
    assert.match(texto, /Papel sem acesso à jornada de satisfação/i, 'a recusa explica o papel, não diz que não há dado');
    assert.match(texto, /\(forbidden_role\)/, 'o código canônico fica disponível para diagnóstico');
    assert.match(texto, /Menu não é autorização/i, 'abrir a tela pelo menu não concede acesso');

    assert.equal(await painel.locator('[data-ui-state="empty"]').count(), 0, 'recusa não pode ser confundida com vazio');
    assert.equal(await page.locator('[data-testid="satisfacao-surveys-table"]').count(), 0, 'nenhuma tabela vazia é renderizada');
    assert.equal(await page.locator('[data-testid="satisfacao-survey-metrics"]').count(), 0, 'nenhum indicador zero é renderizado');
    assert.equal(await page.locator('[data-testid="satisfacao-aggregate"]').count(), 0, 'nenhum agregado é renderizado na recusa');

    await capture(page, 'desktop-satisfacao-negado');
    await context.close();
  });
});

test('browser: falha de leitura NÃO vira lista vazia nem indicador zero', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, tiCookie, {
      failRoutes: ['/api/ext/satisfaction/surveys'], status: 503, code: 'satisfaction_journey_unavailable',
    });
    const erro = page.locator('[data-testid="satisfacao-surveys-error"] [data-ui-state="error"]');
    await erro.waitFor();
    const texto = await erro.textContent();
    assert.match(texto, /Isto não significa que não existam pesquisas registradas/i, 'a falha nega explicitamente a lista vazia');
    assert.match(texto, /\(satisfaction_journey_unavailable\)/, 'o código canônico fica disponível');
    assert.ok(await erro.locator('button').count() >= 1, 'falha transitória precisa oferecer nova tentativa');

    assert.equal(await page.locator('[data-testid="satisfacao-surveys-table"]').count(), 0, 'nenhuma tabela vazia é renderizada');
    assert.equal(await page.locator('[data-testid="satisfacao-survey-metrics"]').count(), 0, 'nenhum indicador zero é renderizado');
    assert.equal(await page.locator('[data-testid="satisfacao-aggregate"]').count(), 0, 'nenhuma média zero é renderizada');
    assert.equal(await page.locator('[data-testid="satisfacao-surveys"] [data-ui-state="empty"]').count(), 0, 'falha não vira vazio');

    // A falha de UMA leitura não contamina a outra: o formulário, que depende
    // das referências canônicas, continua montado com conteúdo real.
    await page.getByRole('tab', { name: 'Configurar pesquisa', exact: true }).click();
    await page.locator('[data-testid="satisfacao-create-form"]').waitFor();
    assert.equal(await page.locator('[data-testid="satisfacao-references-error"]').count(), 0,
      'a leitura de referências não pode ser contaminada pela falha da lista');

    await capture(page, 'desktop-satisfacao-falha-leitura');
    await context.close();
  });
});

test('browser: falha nas referências não apaga a lista já carregada', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, tiCookie, {
      failRoutes: ['/api/ext/satisfaction/references'], status: 503, code: 'satisfaction_journey_unavailable',
    });
    // Espera pelo CONTEÚDO carregado, nunca pelo contêiner.
    await page.getByText(pesquisaAcompanhada.protocol, { exact: false }).first().waitFor();
    await page.locator('[data-testid="satisfacao-surveys-table"]').waitFor();
    await page.locator('[data-testid="satisfacao-survey-metrics"]').waitFor();

    await page.getByRole('tab', { name: 'Configurar pesquisa', exact: true }).click();
    const erro = page.locator('[data-testid="satisfacao-references-error"] [data-ui-state="error"]');
    await erro.waitFor();
    assert.match(await erro.textContent(), /Isto não significa que não existam contas ou destinatários autorizados/i);
    assert.equal(await page.locator('[data-testid="satisfacao-create-form"]').count(), 0,
      'sem referências não existe formulário: a tela não digita identidade');

    await page.getByRole('tab', { name: 'Pesquisas e indicador', exact: true }).click();
    await page.locator('[data-testid="satisfacao-surveys-table"]').waitFor();

    await capture(page, 'desktop-satisfacao-falha-referencias');
    await context.close();
  });
});

test('browser: as quatro abas são um tablist de verdade, com teclado', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, tiCookie);
    await page.locator('[role="tablist"]').waitFor();

    const abas = page.getByRole('tab');
    assert.equal(await abas.count(), 4, 'a jornada tem quatro frentes de trabalho');
    assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1, 'roving tabindex: só uma aba tabulável');
    assert.equal(await page.locator('[role="tab"][tabindex="-1"]').count(), 3);
    assert.equal(await page.locator('[role="tabpanel"]').count(), 1, 'só o painel ativo fica montado');
    assert.equal(await page.locator('[aria-pressed]').count(), 0, 'aria-pressed não substitui tab');
    assert.equal(await abas.first().getAttribute('aria-controls'), 'satisfacao-panel-pesquisas');

    await abas.first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await abas.nth(1).getAttribute('aria-selected'), 'true');
    assert.equal(await abas.nth(1).evaluate(el => el === document.activeElement), true,
      'a seta precisa mover o foco junto com a seleção');
    await page.keyboard.press('End');
    assert.equal(await abas.nth(3).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await abas.nth(0).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await abas.nth(3).getAttribute('aria-selected'), 'true', '← na primeira aba volta para a última');

    await capture(page, 'desktop-satisfacao-abas');
    await context.close();
  });
});

test('browser: a jornada real aparece em português, com ausência honesta', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, tiCookie);
    const tabela = page.locator('[data-testid="satisfacao-surveys-table"]');
    await page.getByText(pesquisaAcompanhada.protocol, { exact: false }).first().waitFor();
    await tabela.waitFor();

    // textContent, e não innerText: o prefixo de leitor de tela do UiBadge é
    // recortado por CSS e não entra no texto renderizado.
    const textoTabela = await tabela.textContent();
    assert.match(textoTabela, new RegExp(pesquisaAcompanhada.protocol));
    assert.match(textoTabela, new RegExp(pesquisaPendente.protocol));
    assert.match(textoTabela, /NPS declarado/, 'a metodologia declarada sai em português');
    assert.match(textoTabela, /CSAT declarado/, 'CSAT declarado também sai em português');
    assert.match(textoTabela, /Em acompanhamento/, 'a situação em_acao sai em português');
    assert.match(textoTabela, /Aguardando resposta/, 'a situação pendente sai em português');
    assert.match(textoTabela, /Pós-atendimento/, 'o tipo sai em português');
    assert.doesNotMatch(textoTabela, /em_acao|pos_atendimento|\bnps\b|\bcsat\b|periodica/,
      'nenhum valor cru do banco na lista');
    assert.doesNotMatch(textoTabela, /01\/01\/1970/, 'ausência nunca vira data inicial');

    // Indicador agregado: o denominador é contagem REAL do servidor e a média
    // existe porque há resposta registrada.
    const agregado = await page.locator('[data-testid="satisfacao-aggregate"]').textContent();
    assert.match(agregado, /cli_satisfaction_responses/, 'a fonte declarada do indicador é a do servidor');
    assert.match(agregado, /Resposta gera acompanhamento sem expor funcionário/, 'o critério é o do servidor');
    assert.match(agregado, /1,5/, 'a média das duas respostas reais (2 e 1) é mostrada como o servidor calculou');
    assert.doesNotMatch(agregado, /Média não calculada/, 'com resposta registrada a média existe');
    assert.doesNotMatch(agregado, /01\/01\/1970/);

    // Detalhe da pesquisa acompanhada: espera pelo CONTEÚDO, não pelo cartão.
    await page.getByRole('row', { name: new RegExp(pesquisaAcompanhada.protocol) })
      .getByRole('button', { name: 'Ver respostas e acompanhamento' }).click();
    const fatos = page.locator('[data-testid="satisfacao-detail-facts"]');
    await fatos.waitFor();
    await page.locator('[data-testid="satisfacao-responses"]').waitFor();
    const textoFatos = await fatos.textContent();
    assert.match(textoFatos, /Jornada canônica EXT-06/, 'a origem sai em português');
    assert.match(textoFatos, /0 a 10/, 'a escala declarada aparece como o servidor a guardou');
    assert.match(textoFatos, /nota menor ou igual ao limiar \(limiar 6\)/, 'a regra declarada sai em português');
    assert.match(textoFatos, /Nenhum impedimento registrado pelo servidor/, 'sem impedimento, a tela diz que não há');
    assert.doesNotMatch(textoFatos, /ext06_canonica|em_acao|\bnps\b/, 'nenhum valor cru de origem, situação ou metodologia');
    const respostas = await page.locator('[data-testid="satisfacao-responses"]').textContent();
    assert.match(respostas, /Nota 2 na escala declarada 0 a 10/, 'a nota real do portal aparece como veio');
    assert.match(respostas, /a ronda noturna atrasou duas vezes/, 'o comentário do cliente aparece como veio');

    // Acompanhamento: regra, fatos, responsável canônico e ausências honestas.
    await page.getByRole('tab', { name: 'Acompanhamento e trilha', exact: true }).click();
    const planos = page.locator('[data-testid="satisfacao-plans"]');
    await planos.waitFor();
    const textoPlanos = await planos.textContent();
    assert.match(textoPlanos, /Aberto/, 'a situação do acompanhamento sai em português');
    assert.match(textoPlanos, /Derivado da resposta do portal/, 'a origem do acompanhamento sai em português');
    assert.match(textoPlanos, /Regra declarada: nota menor ou igual ao limiar \(limiar 6\); nota observada 2/);
    assert.match(textoPlanos, /Nota registrada 2; NPS declarado/, 'os fatos canônicos aparecem como o servidor gravou');
    assert.match(textoPlanos, new RegExp(`QA Staff ${tiStaff.role}`), 'o responsável canônico fica na fronteira staff');
    assert.match(textoPlanos, /Início pendente/, 'início ausente é dito, não datado');
    assert.match(textoPlanos, /Conclusão pendente/, 'conclusão ausente é dita, não datada');
    assert.match(textoPlanos, /Dado ausente/, 'resultado ainda inexistente aparece como ausência');
    assert.doesNotMatch(textoPlanos, /01\/01\/1970/, 'ausência nunca vira 01/01/1970');
    assert.doesNotMatch(textoPlanos, /\baberta\b|portal_cliente/, 'nenhum valor cru de situação ou origem');
    // O prazo mostrado é exatamente o que o SERVIDOR gravou, formatado em
    // pt-BR; o relógio do processo de teste não participa.
    const [ano, mes, dia] = prazoDoPlano.split('-');
    assert.match(textoPlanos, new RegExp(`${dia}/${mes}/${ano}`), 'o prazo exibido é o do servidor');

    const trilha = await page.locator('[data-testid="satisfacao-events"]').textContent();
    assert.match(trilha, /Pesquisa configurada/, 'o evento de criação sai em português');
    assert.match(trilha, /Resposta do cliente registrada/, 'o evento da resposta sai em português');
    assert.match(trilha, /Equipe interna/, 'a autoria de equipe sai em português');
    assert.match(trilha, /Cliente, pelo portal/, 'a autoria do cliente sai em português');

    // Conta sem responsável canônico: o servidor falha fechado e a tela mostra
    // o motivo real, sem fingir acompanhamento e sem prometer satisfação.
    await page.getByRole('tab', { name: 'Pesquisas e indicador', exact: true }).click();
    await page.getByRole('row', { name: new RegExp(pesquisaSemResponsavel.protocol) })
      .getByRole('button', { name: 'Ver respostas e acompanhamento' }).click();
    await page.locator('[data-testid="satisfacao-detail-facts"]').waitFor();
    await page.locator('[data-testid="satisfacao-responses"]').waitFor();
    const semResponsavel = await page.locator('[data-testid="satisfacao-detail-facts"]').textContent();
    assert.match(semResponsavel, /a conta não possui responsável staff canônico ativo/i,
      'o motivo do servidor aparece como veio');
    await page.getByRole('tab', { name: 'Acompanhamento e trilha', exact: true }).click();
    const vazioHonesto = page.locator('[data-testid="satisfacao-followup"] [data-ui-state="empty"]');
    await vazioHonesto.waitFor();
    const textoVazio = await vazioHonesto.textContent();
    assert.match(textoVazio, /A leitura funcionou/i, 'vazio legítimo diz que a leitura funcionou');
    assert.match(textoVazio, /Ausência de acompanhamento não é prova de satisfação/i);
    assert.equal(await page.locator('[data-testid="satisfacao-followup"] [data-ui-state="error"]').count(), 0,
      'vazio legítimo não pode ser confundido com falha');
    assert.equal(await page.locator('[data-testid="satisfacao-plans"]').count(), 0);

    // Pesquisa sem resposta: ausência honesta de nota, de média e de data.
    await page.getByRole('tab', { name: 'Pesquisas e indicador', exact: true }).click();
    await page.getByRole('row', { name: new RegExp(pesquisaPendente.protocol) })
      .getByRole('button', { name: 'Ver respostas e acompanhamento' }).click();
    const pendente = page.locator('[data-testid="satisfacao-detail"]');
    await page.locator('[data-testid="satisfacao-detail-facts"]').waitFor();
    await pendente.getByText('Resposta ainda não registrada').waitFor();
    const textoPendente = await pendente.textContent();
    assert.match(textoPendente, /Escala genérica declarada \(não é NPS nem CSAT\)/,
      'escala genérica não é apresentada como NPS nem CSAT');
    assert.match(textoPendente, /Sem janela de referência declarada/);
    assert.match(textoPendente, /nenhuma resposta foi registrada nesta pesquisa/i);
    assert.doesNotMatch(textoPendente, /01\/01\/1970/, 'ausência nunca vira data inicial');

    await capture(page, 'desktop-satisfacao-jornada');
    await context.close();
  });
});

test('browser: a transição usa o texto de quem opera e preserva a chave na recusa', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, tiCookie);
    await page.getByText(pesquisaAcompanhada.protocol, { exact: false }).first().waitFor();
    await page.getByRole('row', { name: new RegExp(pesquisaAcompanhada.protocol) })
      .getByRole('button', { name: 'Ver respostas e acompanhamento' }).click();
    await page.locator('[data-testid="satisfacao-detail-facts"]').waitFor();
    await page.getByRole('tab', { name: 'Acompanhamento e trilha', exact: true }).click();
    await page.locator('[data-testid="satisfacao-plans"]').waitFor();

    // 1) Sem texto, o servidor recusa com o código real. A tela NÃO escreve
    // nota no lugar de quem opera — era exatamente o defeito do protótipo.
    await page.getByRole('button', { name: 'Iniciar com nota registrada' }).click();
    const erroAcao = page.locator('[data-testid="satisfacao-action-error"]');
    await erroAcao.waitFor();
    const textoErro = await erroAcao.textContent();
    assert.match(textoErro, /Nota de início obrigatória/i, 'a recusa real do servidor é mostrada como veio');
    assert.match(textoErro, /\(note_required\)/, 'o código canônico fica no rodapé técnico');
    assert.match(textoErro, /Chave preservada para repetição segura/i, 'a chave continua visível para repetir sem duplicar');
    const chave = (textoErro.match(/ext06-[0-9a-f-]{36}-start-[0-9a-f-]{36}/) || [])[0];
    assert.ok(chave, `a chave de idempotência precisa aparecer na íntegra: ${textoErro}`);
    assert.equal(
      (await pool.query('SELECT status FROM cli_satisfaction_action_plans WHERE id=$1', [planoAberto])).rows[0].status,
      'aberta',
      'a recusa não pode ter iniciado o acompanhamento',
    );

    // 2) Com o texto escrito por quem opera, a MESMA chave é reaproveitada e o
    // servidor confirma a transição.
    await page.getByLabel('Registro desta operação, escrito por quem opera')
      .fill('Contato sintético com a conta registrado pelo gate UX-07.');
    await page.getByRole('button', { name: 'Iniciar com nota registrada' }).click();
    await page.locator('[data-testid="satisfacao-plans"]').getByText('Em andamento').first().waitFor();
    assert.equal(await page.locator('[data-testid="satisfacao-action-error"]').count(), 0,
      'confirmado pelo servidor, o erro anterior sai da tela');

    const persistido = await pool.query(
      'SELECT status, started_by_identity FROM cli_satisfaction_action_plans WHERE id=$1', [planoAberto],
    );
    assert.equal(persistido.rows[0].status, 'em_andamento', 'o servidor realmente iniciou o acompanhamento');
    assert.equal(persistido.rows[0].started_by_identity, tiStaff.id, 'o autor é a identidade da sessão, não a tela');
    const evento = await pool.query(
      `SELECT payload, idempotency_key FROM cli_satisfaction_events
       WHERE action_plan_id=$1 AND event_type='acompanhamento_start'`, [planoAberto],
    );
    assert.equal(evento.rowCount, 1, 'a trilha registra exatamente um início');
    assert.equal(evento.rows[0].payload.note, 'Contato sintético com a conta registrado pelo gate UX-07.',
      'o texto gravado é o de quem operou, não um texto inventado pela tela');
    assert.equal(evento.rows[0].idempotency_key, chave, 'a chave preservada é a mesma usada na repetição');

    const trilha = await page.locator('[data-testid="satisfacao-events"]').textContent();
    assert.match(trilha, /Acompanhamento iniciado/, 'a trilha mostra o início em português');

    await capture(page, 'desktop-satisfacao-transicao');
    await context.close();
  });
});

test('browser: em 390px a tela de satisfação não produz transbordo horizontal', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, tiCookie, { width: 390, height: 844 });
    await page.getByText(pesquisaAcompanhada.protocol, { exact: false }).first().waitFor();
    await page.locator('[data-testid="satisfacao-surveys-table"]').waitFor();
    await page.waitForTimeout(600);
    const transbordo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(transbordo <= 1, `transbordo de ${transbordo}px em /admin/satisfacao`);
    await capture(page, 'mobile-satisfacao-390px');
    await context.close();
  });
});
