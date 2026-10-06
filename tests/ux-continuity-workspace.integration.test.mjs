// UX-11 / EXT-10 — gate focal da tela /admin/continuidade, por HTTP real
// contra PostgreSQL real (o cluster descartável é criado por
// scripts/qa-ux-continuity-postgres.mjs) e por Chromium real.
//
// O que este gate PROVA, por execução:
//  - as invariantes de código da apresentação (transporte discriminado,
//    estados separados, URLs/métodos/cabeçalhos canônicos, sem estilo inline);
//  - que a rota canônica continua exigindo sessão, chave de idempotência e
//    mesma origem, e que a negativa não vaza plano algum;
//  - "menu não é autorização": o papel `ti` está em `allowedRoles` do
//    AdminGate de /admin/continuidade, abre a tela e é recusado pelo próprio
//    servidor com 403 `forbidden` porque não tem o grant `continuity.read`.
//    Na tela isso é o estado NEGADO — nunca lista vazia, nunca falha;
//  - que 404 de ESCOPO (`plan_not_found`) é dito como indisponibilidade de
//    escopo e não como "plano removido" nem como vazio. A recusa é real: o
//    grant do supervisor é reescopado da conta A para a conta B entre a
//    listagem e a abertura do plano, exatamente como acontece quando um
//    escopo é revisto em produção;
//  - que falha de LEITURA não vira lista vazia. A falha é real: o servidor
//    HTTP é derrubado com a página aberta e "Atualizar lista" encontra a rede
//    indisponível (`status: 0`). Depois o servidor volta e a lista se
//    recupera pelo próprio botão de nova tentativa;
//  - que ausência de data é dita ("Simulado nunca realizado", "Próximo teste
//    não agendado") e nunca vira `01/01/1970`, zero ou "em dia", enquanto o
//    plano com simulado documentado mostra a data real;
//  - que a chave de idempotência `cont-` sobrevive a uma falha REAL do
//    servidor (503 `audit_unavailable`, provocada por gatilho de banco, igual
//    ao que a suíte EXT-10 já faz) e é descartada somente após o sucesso: a
//    repetição usa a MESMA chave, e a operação seguinte usa outra;
//  - que as abas são um tablist de verdade, com roving tabindex, setas,
//    Home/End e um único tabpanel montado;
//  - que 390px não produz transbordo horizontal.
//
// O que este gate NÃO prova: homologação humana, aceite de Marcelo ou de
// Andreia, conformidade WCAG integral, nem comportamento em produção.
//
// Nenhuma resposta do servidor é falsificada: não há `page.route()`,
// substituição de `window.fetch` nem monkey-patch de resposta. A confirmação
// de idempotência vem do ledger canônico depois do clique real. A massa é
// fictícia e nasce pelas APIs canônicas; nenhum dado
// pessoal real é usado. O servidor canônico, `server.mjs` e as migrações não
// são tocados.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { provisionStaff, STAFF_TEST_PASSWORD } from './helpers/staff-login.mjs';
import { hashPassword } from '../src/lib/client-auth-core.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);
const REQUIRE = process.env.QA_UX_CONTINUITY_REQUIRE_DB === '1';
const root = path.resolve(import.meta.dirname, '..');
const opt = { skip: !RUN };

let server, baseUrl, serverPort, pool;
let adminStaff, tiStaff, supervisorStaff;
let adminCookie, tiCookie, supervisorCookie;
let accountA, accountB;
let planoSemData, planoComData, planoContaA, planoContaB, planoFluxoTela;
let clientA, clientB;

const sessionSecret = `${randomUUID()}${randomUUID()}`;

const key = label => `cont-gate-${label}-${randomUUID()}`;
const SIMULADO_EM = '2026-03-11';
const PROXIMO_EM = '2026-09-11';
const SIMULADO_BR = '11/03/2026';
const PROXIMO_BR = '11/09/2026';

// ---------------------------------------------------------------- transporte

function api(pathname, { method = 'GET', body, cookie = adminCookie, headers = {}, idempotencyKey } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { origin: baseUrl } : {}),
      ...(method !== 'GET' && idempotencyKey !== null ? { 'idempotency-key': idempotencyKey || key('api') } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(60_000),
  }).then(async res => ({ status: res.status, body: await res.json().catch(() => null), headers: res.headers }));
}

async function loginStaffHttp(email) {
  const res = await fetch(`${baseUrl}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', origin: baseUrl },
    body: JSON.stringify({ email, password: STAFF_TEST_PASSWORD }),
  });
  assert.equal(res.status, 200, `login deveria retornar 200, veio ${res.status}`);
  const raw = (res.headers.getSetCookie?.() || []).find(c => c.startsWith('seg_admin_session='));
  assert.ok(raw, 'o login precisa emitir o cookie de sessão de equipe');
  return raw.split(';')[0];
}

async function createClient(tag, accountId) {
  const id = randomUUID();
  const email = `ux11-continuity-workspace-${tag}-${id.slice(0, 8)}@example.invalid`;
  const password = `Cliente-Ficticio-${randomUUID()}!`;
  await pool.query(
    `INSERT INTO auth_identities (id, kind, email, display_name, status, verification_method, verified_at)
     VALUES ($1,'client',$2,$3,'active','email_link',NOW())`,
    [id, email, `Cliente fictício UX-11 ${tag}`],
  );
  await pool.query('INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)', [id, await hashPassword(password)]);
  await pool.query(
    `INSERT INTO client_access_grants (id, identity_id, client_account_id, reason, granted_by)
     VALUES ($1,$2,$3,'Vínculo fictício do gate UX-11 da tela de continuidade','ti')`,
    [randomUUID(), id, accountId],
  );
  const response = await api('/api/auth/login', { method: 'POST', cookie: null, body: { email, password } });
  assert.equal(response.status, 200, `login do cliente ${tag} deveria retornar 200, veio ${response.status}`);
  const raw = response.headers?.getSetCookie?.() || [];
  return { id, accountId, cookie: raw.map(item => item.split(';')[0]).join('; ') };
}

async function waitForServer(timeoutMs = 240_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/admin/session`, { headers: { accept: 'application/json' } });
      if (res.status === 200 || res.status === 401) return;
    } catch { /* ainda subindo */ }
    await new Promise(r => setTimeout(r, 400));
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
      NEXT_DIST_DIR: '.next/integration-ux-continuity',
      SITE_ADMIN_SESSION_SECRET: sessionSecret,
      EMPLOYEE_SESSION_SECRET: sessionSecret,
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
  return waitForServer();
}

async function stopServer() {
  if (!server || server.killed) return;
  const current = server;
  current.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => current.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 4000)),
  ]);
  if (!current.killed) current.kill('SIGKILL');
  server = null;
  // A porta precisa parar de aceitar conexão antes de o teste medir a falha.
  for (let i = 0; i < 40; i += 1) {
    try {
      await fetch(`${baseUrl}/api/admin/session`, { signal: AbortSignal.timeout(1500) });
    } catch { return; }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('server_did_not_stop');
}

// ----------------------------------------------------------------- navegador

async function launchBrowser() {
  // @sparticuz/chromium roda com --single-process; nesta máquina o próprio
  // `launch` às vezes sai com SIGSEGV. Repetir o lançamento não enfraquece
  // asserção alguma.
  let ultimo;
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
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

const CRASH = /Target (page|closed)|has been closed|Target crashed|browser has disconnected|crashed|SIGSEGV|Protocol error/i;

// Crash de navegador NÃO é resultado de teste: repete a sessão inteira e
// repassa na hora qualquer falha de asserção.
async function comNavegador(corpo) {
  let ultimo;
  for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
    const browser = await launchBrowser();
    try {
      return await corpo(browser);
    } catch (erro) {
      if (erro?.code === 'ERR_ASSERTION' || !CRASH.test(String(erro?.message || ''))) throw erro;
      ultimo = erro;
      console.log(`UX_CONTINUITY_BROWSER_RETRY tentativa=${tentativa}: ${String(erro.message).split('\n')[0]}`);
    } finally {
      await browser.close().catch(() => {});
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw ultimo;
}

const evidenceDir = process.env.UX_CONTINUITY_EVIDENCE_DIR || '';
async function capture(page, nome) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage: false });
}

/**
 * Abre /admin/continuidade já autenticada, sem interceptar transporte algum.
 */
async function abrir(browser, cookie, { width = 1440, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const separador = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, separador), value: cookie.slice(separador + 1), url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(120_000);
  await page.goto(`${baseUrl}/admin/continuidade`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1, name: 'Continuidade de negócios e contingência' }).waitFor();
  return { context, page };
}

async function abrirPortal(browser, cookie, { width = 1440, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await context.addCookies(cookie.split('; ').filter(Boolean).map(pair => {
    const separator = pair.indexOf('=');
    return { name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl };
  }));
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(120_000);
  await page.goto(`${baseUrl}/cliente/app/continuidade`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Planos de continuidade publicados' }).waitFor();
  return { context, page };
}

const abaPlanos = page => page.getByRole('tab', { name: 'Planos', exact: true });
const cartao = (page, id) => page.locator(`[data-testid="continuity-plan-card"][data-plan="${id}"]`);

// --------------------------------------------------------------- preparação

before(async () => {
  if (!RUN) return;
  serverPort = 4900 + Math.floor(Math.random() * 400);
  baseUrl = `http://127.0.0.1:${serverPort}`;
  await spawnServer();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

  adminStaff = await provisionStaff(pool, { role: 'admin' });
  // `ti` está em allowedRoles do AdminGate de /admin/continuidade e NÃO
  // recebe grant algum: é a prova de que o menu não concede autorização.
  tiStaff = await provisionStaff(pool, { role: 'ti' });
  supervisorStaff = await provisionStaff(pool, { role: 'supervisor' });

  for (const permission of ['continuity.read', 'continuity.write', 'continuity.activate']) {
    await pool.query(
      `INSERT INTO auth_permissions (id, identity_id, permission, scope_type, granted_by, granted_by_role, reason)
       VALUES ($1,$2,$3,'global',$4,'admin','Gate UX-11: provisionamento administrativo global')`,
      [randomUUID(), adminStaff.id, permission, adminStaff.id],
    );
  }

  accountA = randomUUID();
  accountB = randomUUID();
  await pool.query(
    `INSERT INTO client_accounts (id, display_name, status, created_by)
     VALUES ($1,'Cliente Fictício A — gate UX-11','active','ti'),($2,'Cliente Fictício B — gate UX-11','active','ti')`,
    [accountA, accountB],
  );
  // A preparação por SQL limita-se a identidades, contas e vínculos. Os
  // planos e cada ação do fluxo visual abaixo são enviados pelos controles da
  // própria tela para as APIs canônicas.
  clientA = await createClient('vinculado', accountA);
  clientB = await createClient('sem-vinculo-do-plano', accountB);
  for (const permission of ['continuity.read', 'continuity.write']) {
    await pool.query(
      `INSERT INTO auth_permissions (id, identity_id, permission, scope_type, scope_id, granted_by, granted_by_role, reason)
       VALUES ($1,$2,$3,'account',$4,$5,'admin','Gate UX-11: grant restrito à conta A')`,
      [randomUUID(), supervisorStaff.id, permission, accountA, adminStaff.id],
    );
  }

  adminCookie = await loginStaffHttp(adminStaff.email);
  tiCookie = await loginStaffHttp(tiStaff.email);
  supervisorCookie = await loginStaffHttp(supervisorStaff.email);

  // Massa fictícia criada pelas PRÓPRIAS rotas canônicas, por HTTP.
  const semData = await api('/api/ext/continuity/plans', {
    method: 'POST',
    body: {
      title: 'Plano fictício de contingência sem simulado registrado',
      description: 'Massa fictícia do gate UX-11: plano aberto, ainda sem simulado documentado e sem próximo teste agendado.',
      responsible_name: 'Equipe fictícia de continuidade',
      contingency_steps: ['Acionar a equipe interna de plantão'],
      recovery_steps: ['Registrar a retomada no próprio sistema'],
    },
  });
  assert.equal(semData.status, 201, `criação deveria ser 201, veio ${semData.status} ${JSON.stringify(semData.body)}`);
  planoSemData = semData.body.plan;
  assert.match(planoSemData.protocol, /^CONT-EXT-\d{8}-[A-Z0-9]{4}$/);
  assert.equal(planoSemData.last_tested_at, null, 'o plano nasce sem data de simulado');
  assert.equal(planoSemData.next_test_due, null, 'o plano nasce sem próximo teste agendado');

  const comData = await api('/api/ext/continuity/plans', {
    method: 'POST',
    body: {
      title: 'Plano fictício de contingência com simulado documentado',
      description: 'Massa fictícia do gate UX-11: plano que recebe um simulado documentado pela rota canônica de exercícios.',
      responsible_name: 'Equipe fictícia de simulados',
    },
  });
  assert.equal(comData.status, 201);
  planoComData = comData.body.plan;
  const exercicio = await api(`/api/ext/continuity/plans/${planoComData.id}/exercises`, {
    method: 'POST',
    body: {
      exercise_date: SIMULADO_EM,
      result: 'Simulado interno fictício concluído; procedimento percorrido ponta a ponta pela equipe de plantão.',
      responsible_name: 'Equipe fictícia de simulados',
      next_due: PROXIMO_EM,
    },
  });
  assert.equal(exercicio.status, 201, `simulado deveria ser 201, veio ${exercicio.status} ${JSON.stringify(exercicio.body)}`);

  const contaA = await api('/api/ext/continuity/plans', {
    method: 'POST',
    body: {
      title: 'Plano fictício vinculado à conta A',
      description: 'Massa fictícia do gate UX-11: plano vinculado à conta de cliente A, usado para provar o escopo por conta.',
      responsible_name: 'Equipe fictícia da conta A',
      client_account_id: accountA,
    },
  });
  assert.equal(contaA.status, 201);
  planoContaA = contaA.body.plan;

  const contaB = await api('/api/ext/continuity/plans', {
    method: 'POST',
    body: {
      title: 'Plano fictício vinculado à conta B',
      description: 'Massa fictícia do gate UX-11: plano vinculado à conta de cliente B, invisível para o grant da conta A.',
      responsible_name: 'Equipe fictícia da conta B',
      client_account_id: accountB,
    },
  });
  assert.equal(contaB.status, 201);
  planoContaB = contaB.body.plan;

  // A página precisa estar compilada antes de qualquer medição no navegador.
  for (const route of ['/admin/entrar', '/admin/continuidade']) {
    const deadline = Date.now() + 300_000;
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
  await stopServer().catch(() => {});
  await pool?.end().catch(() => {});
});

// ------------------------------------------------- invariantes de código (1)

test('workspace usa transporte discriminado e preserva estados', async () => {
  const page = await readFile(new URL('../src/app/admin/continuidade/ContinuityWorkspace.tsx', import.meta.url), 'utf8');
  assert.match(page, /continuityRequest/);
  assert.match(page, /phase==='loading'/);
  assert.match(page, /phase==='failed'/);
  assert.match(page, /variant="empty"/);
  assert.match(page, /variant=\{x.kind==='denied'\?'denied':'error'\}/);
  assert.match(page, /Idempotency-Key/);
  assert.doesNotMatch(page, /style=/);
});

test('ações canônicas não mudam URLs nem métodos', async () => {
  const page = await readFile(new URL('../src/app/admin/continuidade/ContinuityWorkspace.tsx', import.meta.url), 'utf8');
  for (const rota of ['/api/ext/continuity/plans', '/transition', '/exercises', '/client-visibility']) {
    assert.match(page, new RegExp(rota.replaceAll('/', '\\/')));
  }
  assert.match(page, /method:'POST'/);
  // O prefixo de idempotência e os placeholders são contrato verificado pela
  // prova herdada tests/ext10-continuity.integration.test.mjs.
  assert.match(page, /`cont-\$\{Date\.now\(\)\}/);
  for (const marca of ['Título', 'Descrição e escopo', 'Responsável', 'Passos de contingência, um por linha', 'Passos de recuperação, um por linha']) {
    assert.match(page, new RegExp(`placeholder="${marca}"`));
  }
});

test('o gate focal exige PostgreSQL real quando é cobrado', () => {
  if (REQUIRE) assert.ok(RUN, 'QA_UX_CONTINUITY_REQUIRE_DB=1 exige DATABASE_URL e RUN_DATABASE_INTEGRATION=1');
});

// ---------------------------------------------------------- contrato HTTP (3)

test('a rota canônica continua exigindo sessão, chave e origem, e não vaza plano na negativa', opt, async () => {
  const anonimo = await api('/api/ext/continuity/plans', { cookie: null });
  assert.equal(anonimo.status, 401);
  assert.equal(anonimo.body.error, 'unauthorized');
  assert.ok(!('items' in (anonimo.body || {})), 'a negativa anônima não pode vazar plano algum');

  const semChave = await api('/api/ext/continuity/plans', { method: 'POST', idempotencyKey: null, body: {} });
  assert.equal(semChave.status, 400);
  assert.equal(semChave.body.error, 'idempotency_key_required');

  const origemEstranha = await api('/api/ext/continuity/plans', {
    method: 'POST', headers: { origin: 'https://attacker.invalid' }, body: {},
  });
  assert.equal(origemEstranha.status, 403);
  assert.equal(origemEstranha.body.error, 'origin_forbidden');

  const foraDaRota = await api('/api/ext/continuity/nao-existe');
  assert.equal(foraDaRota.status, 404);
  assert.equal(foraDaRota.body.error, 'not_found');
});

test('sem grant o servidor recusa com 403 e o grant de conta devolve 404 fora do escopo', opt, async () => {
  // `ti` abre a tela pelo AdminGate e é recusado pelo servidor na leitura.
  const semGrant = await api('/api/ext/continuity/plans', { cookie: tiCookie });
  assert.equal(semGrant.status, 403, 'papel sem grant é recusado pelo servidor, não pelo menu');
  assert.equal(semGrant.body.error, 'forbidden');
  assert.ok(!('items' in (semGrant.body || {})), 'a recusa 403 não pode vazar plano algum');

  // Escopo de conta: vê só a própria conta e recebe 404 nas demais.
  const listaEscopo = await api('/api/ext/continuity/plans', { cookie: supervisorCookie });
  assert.equal(listaEscopo.status, 200);
  const ids = listaEscopo.body.items.map(item => item.id);
  assert.ok(ids.includes(planoContaA.id), 'o grant de conta A enxerga o plano da conta A');
  assert.ok(!ids.includes(planoContaB.id), 'o grant de conta A não enxerga o plano da conta B');
  assert.ok(!ids.includes(planoSemData.id), 'plano sem conta exige escopo global/organization');

  const escopo404 = await api(`/api/ext/continuity/plans/${planoContaB.id}`, { cookie: supervisorCookie });
  assert.equal(escopo404.status, 404, 'fora do escopo o servidor responde 404 para não vazar existência');
  assert.equal(escopo404.body.error, 'plan_not_found');
  assert.ok(!('plan' in (escopo404.body || {})), 'o 404 de escopo não devolve plano');
});

test('ausência de data vem nula do servidor e a data documentada vem preenchida', opt, async () => {
  const semData = await api(`/api/ext/continuity/plans/${planoSemData.id}`);
  assert.equal(semData.status, 200);
  assert.equal(semData.body.plan.last_tested_at, null, 'o servidor não inventa data de simulado');
  assert.equal(semData.body.plan.next_test_due, null, 'o servidor não inventa próximo teste');
  assert.equal(semData.body.exercises.length, 0);

  const comData = await api(`/api/ext/continuity/plans/${planoComData.id}`);
  assert.equal(comData.status, 200);
  assert.ok(comData.body.plan.last_tested_at, 'o simulado documentado carimba a data no servidor');
  assert.equal(String(comData.body.plan.last_tested_at).slice(0, 10), SIMULADO_EM);
  assert.equal(String(comData.body.plan.next_test_due).slice(0, 10), PROXIMO_EM);
  assert.equal(comData.body.exercises.length, 1);
});

test('idempotência real: replay com a mesma chave, 409 divergente, e falha não consome a chave', opt, async () => {
  const chave = key('replay');
  const corpo = {
    title: 'Plano fictício de verificação de idempotência',
    description: 'Massa fictícia do gate UX-11 usada para comprovar replay e conflito de chave no servidor canônico.',
    responsible_name: 'Equipe fictícia de idempotência',
  };
  const primeiro = await api('/api/ext/continuity/plans', { method: 'POST', body: corpo, idempotencyKey: chave });
  assert.equal(primeiro.status, 201);
  const replay = await api('/api/ext/continuity/plans', { method: 'POST', body: corpo, idempotencyKey: chave });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.plan.id, primeiro.body.plan.id, 'replay devolve o mesmo plano, sem duplicar');

  const divergente = await api('/api/ext/continuity/plans', {
    method: 'POST', idempotencyKey: chave, body: { ...corpo, title: 'Plano fictício com conteúdo divergente' },
  });
  assert.equal(divergente.status, 409);
  assert.equal(divergente.body.error, 'idempotency_conflict_payload_mismatch');

  // Falha real (auditoria indisponível) NÃO consome a chave: a mesma chave
  // volta a ser aceita depois, inclusive com outro conteúdo.
  const chaveFalha = key('falha');
  await pool.query(`CREATE OR REPLACE FUNCTION qa_ux11_fail_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'qa_ux11_audit_unavailable'; END; $$ LANGUAGE plpgsql`);
  await pool.query(`CREATE TRIGGER qa_ux11_fail_audit BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_ux11_fail_audit()`);
  try {
    const falhou = await api('/api/ext/continuity/plans', {
      method: 'POST', idempotencyKey: chaveFalha,
      body: { ...corpo, title: 'Plano fictício que sofre rollback de auditoria' },
    });
    assert.equal(falhou.status, 503);
    assert.equal(falhou.body.error, 'audit_unavailable');
    assert.equal(
      (await pool.query(`SELECT count(*)::int AS n FROM ext_continuity_plans WHERE title=$1`, ['Plano fictício que sofre rollback de auditoria'])).rows[0].n,
      0,
      'a falha de auditoria faz rollback completo',
    );
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS qa_ux11_fail_audit ON auth_access_audit`);
    await pool.query(`DROP FUNCTION IF EXISTS qa_ux11_fail_audit()`);
  }
  const reaproveitada = await api('/api/ext/continuity/plans', {
    method: 'POST', idempotencyKey: chaveFalha,
    body: { ...corpo, title: 'Plano fictício criado ao repetir a chave preservada' },
  });
  assert.equal(reaproveitada.status, 201, 'a chave preservada volta a ser aceita depois da falha');
});

// ------------------------------------------------------------- navegador (7)

test('browser: recusa 403 do servidor é estado NEGADO, nunca lista vazia nem falha', opt, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, tiCookie);
    await abaPlanos(page).click();
    const lista = page.locator('[data-testid="continuity-list"]');
    await lista.waitFor();
    const negado = lista.locator('[data-ui-state="denied"]');
    await negado.waitFor();

    const texto = await negado.textContent();
    assert.match(texto, /Acesso negado/, 'a recusa é nomeada como acesso negado');
    assert.match(texto, /Estar no menu não concede autorização/, 'a tela diz que o menu não autoriza');
    assert.match(texto, /Código técnico: forbidden/, 'o código canônico fica disponível para diagnóstico');

    assert.equal(await lista.locator('[data-ui-state="empty"]').count(), 0, 'recusa não pode virar vazio');
    assert.equal(await lista.locator('[data-ui-state="error"]').count(), 0, 'recusa não pode virar falha genérica');
    assert.equal(await page.locator('[data-testid="continuity-plan-card"]').count(), 0, 'nenhum plano é renderizado na recusa');
    assert.equal(await negado.locator('button').count(), 0, 'recusa de grant não convida a repetir: o servidor recusaria de novo');

    await capture(page, 'gate-negado-403');
    await context.close();
  });
});

test('browser: 404 de escopo não vira "plano removido" nem lista vazia', opt, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, supervisorCookie);
    await abaPlanos(page).click();
    await cartao(page, planoContaA.id).waitFor();
    assert.equal(await page.locator('[data-testid="continuity-plan-card"]').count(), 1, 'o grant de conta A lista só o plano da conta A');

    // Reescopo REAL do grant: da conta A para a conta B, com a página aberta.
    try {
      await pool.query(
        `UPDATE auth_permissions SET revoked_at=NOW() WHERE identity_id=$1 AND scope_type='account' AND scope_id=$2 AND revoked_at IS NULL`,
        [supervisorStaff.id, accountA],
      );
      for (const permission of ['continuity.read', 'continuity.write']) {
        await pool.query(
          `INSERT INTO auth_permissions (id, identity_id, permission, scope_type, scope_id, granted_by, granted_by_role, reason)
           VALUES ($1,$2,$3,'account',$4,$5,'admin','Gate UX-11: escopo revisto para a conta B')`,
          [randomUUID(), supervisorStaff.id, permission, accountB, adminStaff.id],
        );
      }

      await cartao(page, planoContaA.id).getByRole('button', { name: 'Abrir plano' }).click();
      const detalhe = page.locator('[data-testid="continuity-detail"]');
      await detalhe.waitFor();
      const estado = detalhe.locator('[data-ui-state="error"]');
      await estado.waitFor();
      const texto = await estado.textContent();
      assert.match(texto, /Plano indisponível neste escopo/, 'o 404 de escopo é dito como escopo, não como sumiço');
      assert.match(texto, /Esta resposta não informa a causa da indisponibilidade/, 'a tela não especula a causa da indisponibilidade');
      assert.match(texto, /Código técnico: plan_not_found/);
      assert.doesNotMatch(texto, /removido|exclu[ií]|não existe mais/i, 'a tela não afirma remoção');
      assert.equal(await detalhe.locator('[data-ui-state="empty"]').count(), 0, '404 de escopo não vira vazio');
      assert.equal(await estado.locator('button').count(), 0, '404 de escopo não oferece repetição inútil');

      // A lista anterior continua intacta: a recusa é do plano, não da leitura.
      await abaPlanos(page).click();
      assert.equal(await page.locator('[data-testid="continuity-plan-card"]').count(), 1, 'o 404 de detalhe não apaga a lista já lida');
      assert.equal(await page.locator('[data-testid="continuity-list"] [data-ui-state="empty"]').count(), 0);

      await capture(page, 'gate-404-escopo');
    } finally {
      await pool.query(
        `UPDATE auth_permissions SET revoked_at=NOW() WHERE identity_id=$1 AND scope_type='account' AND scope_id=$2 AND revoked_at IS NULL`,
        [supervisorStaff.id, accountB],
      );
      for (const permission of ['continuity.read', 'continuity.write']) {
        await pool.query(
          `INSERT INTO auth_permissions (id, identity_id, permission, scope_type, scope_id, granted_by, granted_by_role, reason)
           VALUES ($1,$2,$3,'account',$4,$5,'admin','Gate UX-11: escopo restaurado para a conta A')`,
          [randomUUID(), supervisorStaff.id, permission, accountA, adminStaff.id],
        );
      }
    }
    await context.close();
  });
});

test('browser: ausência de data é dita e nunca vira 01/01/1970, zero ou "em dia"', opt, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie);
    await abaPlanos(page).click();
    const semData = cartao(page, planoSemData.id);
    await semData.waitFor();

    const textoSemData = await semData.textContent();
    assert.match(textoSemData, /Simulado nunca realizado/, 'simulado inexistente é dito, não datado');
    assert.match(textoSemData, /Próximo teste não agendado/, 'próximo teste ausente é dito, não datado');
    assert.doesNotMatch(textoSemData, /01\/01\/1970/, 'ausência nunca vira data de época');
    assert.doesNotMatch(textoSemData, /em dia/i, 'ausência nunca vira "em dia"');
    assert.doesNotMatch(textoSemData, /R\$ 0,00|\b0%/, 'ausência nunca vira zero');

    const comData = cartao(page, planoComData.id);
    const textoComData = await comData.textContent();
    assert.match(textoComData, new RegExp(SIMULADO_BR.replaceAll('/', '\\/')), 'a data documentada aparece como data real');
    assert.match(textoComData, new RegExp(PROXIMO_BR.replaceAll('/', '\\/')));
    assert.doesNotMatch(textoComData, /Simulado nunca realizado/, 'o texto de ausência não é aplicado a quem tem data');

    const textoLista = await page.locator('[data-testid="continuity-list"]').textContent();
    assert.doesNotMatch(textoLista, /01\/01\/1970/);
    assert.doesNotMatch(textoLista, /em dia/i);
    assert.doesNotMatch(textoLista, /\brascunho\b|\bem_teste\b|\bdesatualizado\b/, 'nenhum valor cru do banco na lista');

    await capture(page, 'gate-datas-honestas');
    await context.close();
  });
});

test('browser: cria um plano e efetiva a transição de situação pela tela', opt, async () => {
  await comNavegador(async browser => {
    const title = `Plano fictício de fluxo pela tela ${randomUUID().slice(0, 8)}`;
    const description = 'Massa fictícia criada com os controles da tela para provar a transição de estado pelo navegador real.';
    const { context, page } = await abrir(browser, adminCookie);

    await page.getByPlaceholder('Título').fill(title);
    await page.getByPlaceholder('Descrição e escopo').fill(description);
    await page.getByPlaceholder('Responsável').fill('Equipe fictícia de fluxo visual');
    await page.getByLabel('Conta de cliente (UUID, opcional)').fill(accountA);
    await page.getByPlaceholder('Passos de contingência, um por linha').fill('Registrar a ocorrência fictícia');
    await page.getByPlaceholder('Passos de recuperação, um por linha').fill('Confirmar a recuperação fictícia');
    await page.getByRole('button', { name: 'Registrar plano' }).click();

    await abaPlanos(page).waitFor();
    await page.getByText(title, { exact: true }).waitFor();
    const listed = await api('/api/ext/continuity/plans');
    assert.equal(listed.status, 200);
    planoFluxoTela = listed.body.items.find(item => item.title === title);
    assert.ok(planoFluxoTela?.id, 'o servidor canônico confirma a criação enviada pela tela');
    assert.equal(planoFluxoTela.status, 'rascunho');
    assert.equal(planoFluxoTela.client_account_id, accountA, 'a conta vinculada pela tela permanece no plano criado');

    await cartao(page, planoFluxoTela.id).getByRole('button', { name: 'Abrir plano' }).click();
    const detail = page.locator('[data-testid="continuity-detail"]');
    await detail.getByRole('button', { name: 'Aprovar' }).click();
    await detail.getByText('Aprovado', { exact: true }).waitFor();
    const transitioned = await api(`/api/ext/continuity/plans/${planoFluxoTela.id}`);
    assert.equal(transitioned.status, 200);
    assert.equal(transitioned.body.plan.status, 'aprovado', 'o servidor confirma a transição realizada pelo botão');
    assert.match(await detail.textContent(), /Estado:\s*Aprovado/);

    await capture(page, 'gate-transicao-efetivada');
    await context.close();
  });
});

test('browser: documenta simulado pela tela com datas honestas, responsável e efeito de estado', opt, async () => {
  await comNavegador(async browser => {
    assert.ok(planoFluxoTela?.id, 'o caso de transição anterior precisa criar o plano do fluxo');
    const { context, page } = await abrir(browser, adminCookie);
    await abaPlanos(page).click();
    await cartao(page, planoFluxoTela.id).getByRole('button', { name: 'Abrir plano' }).click();
    const detail = page.locator('[data-testid="continuity-detail"]');

    await detail.getByRole('button', { name: 'Colocar em teste' }).click();
    await detail.getByText('Em teste', { exact: true }).waitFor();
    await detail.getByLabel('Data').fill(SIMULADO_EM);
    await detail.getByLabel('Resultado').fill('Simulado fictício documentado pela tela para comprovar a data, responsável e a passagem para testado.');
    await detail.getByLabel('Responsável', { exact: true }).fill('Responsável fictício do simulado');
    await detail.getByLabel('Próximo teste (opcional)').fill(PROXIMO_EM);
    await detail.getByRole('button', { name: 'Registrar simulado' }).click();

    await detail.getByText('Testado', { exact: true }).waitFor();
    const summary = detail.locator('[data-testid="continuity-last-exercise"]');
    await summary.waitFor();
    const visible = await summary.textContent();
    assert.match(visible, /11\/03\/2026/);
    assert.match(visible, /Responsável fictício do simulado/);
    assert.doesNotMatch(visible, /1970|\b0\b/);
    assert.match(await detail.textContent(), /Próximo:\s*11\/09\/2026/);

    const exercised = await api(`/api/ext/continuity/plans/${planoFluxoTela.id}`);
    assert.equal(exercised.status, 200);
    assert.equal(exercised.body.plan.status, 'testado', 'o simulado da tela aplica o efeito canônico de estado');
    assert.equal(String(exercised.body.plan.last_tested_at).slice(0, 10), SIMULADO_EM);
    assert.equal(String(exercised.body.plan.next_test_due).slice(0, 10), PROXIMO_EM);
    assert.equal(exercised.body.exercises[0].responsible_name, 'Responsável fictício do simulado');

    await capture(page, 'gate-simulado-documentado');
    await context.close();
  });
});

test('browser: publica e retira no portal pela tela de equipe e o cliente vê somente o vínculo correto', opt, async () => {
  assert.ok(planoFluxoTela?.id, 'o plano do fluxo precisa existir antes de publicar');

  // Cada sessão fica no seu próprio Chromium: o binário empacotado usa
  // --single-process e fechar/reabrir entre atores não muda os controles nem
  // as respostas medidas, só evita queda do processo ao manter três contexts.
  await comNavegador(async browser => {
    const { context: staffContext, page: staffPage } = await abrir(browser, adminCookie);
    await abaPlanos(staffPage).click();
    const card = cartao(staffPage, planoFluxoTela.id);
    await card.waitFor();
    const publishedState = card.getByText('Portal do cliente: publicado, somente leitura');
    if (await publishedState.count() === 0) {
      const publicationNote = card.locator('input[aria-label^="Justificativa de publicação"]');
      await publicationNote.waitFor();
      await publicationNote.fill('Publicação fictícia justificada para a conta vinculada no fluxo visual.');
      await card.getByRole('button', { name: 'Publicar no portal' }).click();
    }
    await publishedState.waitFor();
    const published = await api(`/api/ext/continuity/plans/${planoFluxoTela.id}`);
    assert.equal(published.status, 200);
    assert.equal(published.body.plan.client_visible, true, 'o servidor confirma a publicação acionada pela tela');
    await staffContext.close();
  });

  await comNavegador(async browser => {
    const { context: otherContext, page: otherPage } = await abrirPortal(browser, clientB.cookie);
    const emptyOther = otherPage.locator('[data-ui-state="empty"]');
    await emptyOther.waitFor();
    assert.match(await emptyOther.textContent(), /Nenhum plano de continuidade publicado/);
    assert.equal(await otherPage.locator(`[data-testid="client-continuity-plan"][data-plan="${planoFluxoTela.id}"]`).count(), 0, 'o plano não aparece para a conta sem vínculo');
    await otherContext.close();
  });

  await comNavegador(async browser => {
    const { context: linkedContext, page: linkedPage } = await abrirPortal(browser, clientA.cookie);
    const linkedPlan = linkedPage.locator(`[data-testid="client-continuity-plan"][data-plan="${planoFluxoTela.id}"]`);
    await linkedPlan.waitFor();
    assert.match(await linkedPlan.textContent(), new RegExp(planoFluxoTela.title));
    await capture(linkedPage, 'gate-plano-visivel-no-portal');

    const staffBrowser = await launchBrowser();
    try {
      const { context: staffContext, page: staffPage } = await abrir(staffBrowser, adminCookie);
      await abaPlanos(staffPage).click();
      const card = cartao(staffPage, planoFluxoTela.id);
      await card.getByRole('button', { name: 'Retirar publicação' }).click();
      await card.getByText('Portal do cliente: não publicado por padrão').waitFor();
      const withdrawn = await api(`/api/ext/continuity/plans/${planoFluxoTela.id}`);
      assert.equal(withdrawn.status, 200);
      assert.equal(withdrawn.body.plan.client_visible, false, 'o servidor confirma a retirada acionada pela tela');
      await staffContext.close();
    } finally {
      await staffBrowser.close().catch(() => {});
    }

    await linkedPage.getByRole('button', { name: 'Atualizar lista' }).click();
    const empty = linkedPage.locator('[data-ui-state="empty"]');
    await empty.waitFor();
    assert.match(await empty.textContent(), /Nenhum plano de continuidade publicado/);
    assert.equal(await linkedPage.locator('[data-ui-state="error"], [data-ui-state="denied"]').count(), 0, 'retirada não é erro nem perda do vínculo');
    await capture(linkedPage, 'gate-retirada-vazio-honesto');
    await linkedContext.close();
  });
});

test('browser: a chave de idempotência sobrevive à falha real e é descartada após o sucesso', opt, async () => {
  await comNavegador(async browser => {
    const marca = randomUUID().slice(0, 8);
    const tituloFalha = `Plano fictício de idempotência pela tela ${marca}`;
    const tituloNovo = `Plano fictício seguinte pela tela ${marca}`;
    const { context, page } = await abrir(browser, adminCookie);

    await pool.query(`CREATE OR REPLACE FUNCTION qa_ux11_fail_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'qa_ux11_audit_unavailable'; END; $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER qa_ux11_fail_audit BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_ux11_fail_audit()`);
    let derrubado = true;
    try {
      await page.getByPlaceholder('Título').fill(tituloFalha);
      await page.getByPlaceholder('Descrição e escopo').fill('Massa fictícia do gate UX-11 para provar que a chave sobrevive a uma falha real do servidor.');
      await page.getByPlaceholder('Responsável').fill('Equipe fictícia de idempotência');
      await page.getByRole('button', { name: 'Registrar plano' }).click();

      const erro = page.locator('[data-testid="continuity-action-error"]');
      await erro.waitFor();
      assert.equal(await erro.locator('[data-ui-state="error"]').count(), 1, 'falha de infraestrutura é falha, não recusa');
      const textoErro = await erro.textContent();
      assert.match(textoErro, /Auditoria indisponível/, 'a falha real do servidor é nomeada');
      assert.match(textoErro, /Código técnico: audit_unavailable/);
      const chaveVisivel = await page.locator('[data-testid="continuity-held-key"]').textContent();
      const chavePreservada = chaveVisivel?.match(/Chave preservada para repetição segura: (cont-[^\s]+)/)?.[1];
      assert.ok(chavePreservada, 'a tela precisa expor a chave preservada para a repetição segura');

      await pool.query(`DROP TRIGGER IF EXISTS qa_ux11_fail_audit ON auth_access_audit`);
      await pool.query(`DROP FUNCTION IF EXISTS qa_ux11_fail_audit()`);
      derrubado = false;

      // Repetição da MESMA operação no controle real: a chave que a tela
      // mostrou depois da falha precisa chegar ao ledger canônico.
      await page.getByRole('button', { name: 'Registrar plano' }).click();
      await page.getByText(tituloFalha, { exact: true }).waitFor();
      assert.equal(await page.locator('[data-testid="continuity-held-key"]').count(), 0, 'depois do sucesso não há chave pendente');
      const eventoFalha = await pool.query(
        `SELECT e.idempotency_key FROM ext_continuity_events e
         JOIN ext_continuity_plans p ON p.id=e.plan_id
         WHERE p.title=$1 AND e.event_type='plan_created'`,
        [tituloFalha],
      );
      assert.equal(eventoFalha.rows.length, 1, 'a repetição não duplicou o plano');
      assert.equal(eventoFalha.rows[0].idempotency_key, chavePreservada, 'o ledger confirma que a repetição usou a chave preservada');

      // Operação seguinte: chave nova, porque a anterior foi descartada.
      await page.getByRole('tab', { name: 'Novo plano', exact: true }).click();
      await page.getByPlaceholder('Título').fill(tituloNovo);
      await page.getByPlaceholder('Descrição e escopo').fill('Massa fictícia do gate UX-11 para provar que a chave é descartada depois do sucesso.');
      await page.getByPlaceholder('Responsável').fill('Equipe fictícia de idempotência');
      await page.getByRole('button', { name: 'Registrar plano' }).click();
      await page.getByText(tituloNovo, { exact: true }).waitFor();
      const eventoNovo = await pool.query(
        `SELECT e.idempotency_key FROM ext_continuity_events e
         JOIN ext_continuity_plans p ON p.id=e.plan_id
         WHERE p.title=$1 AND e.event_type='plan_created'`,
        [tituloNovo],
      );
      assert.equal(eventoNovo.rows.length, 1);
      assert.match(eventoNovo.rows[0].idempotency_key, /^cont-/);
      assert.notEqual(eventoNovo.rows[0].idempotency_key, chavePreservada, 'a operação seguinte usa chave nova');

      await capture(page, 'gate-idempotencia');
    } finally {
      if (derrubado) {
        await pool.query(`DROP TRIGGER IF EXISTS qa_ux11_fail_audit ON auth_access_audit`).catch(() => {});
        await pool.query(`DROP FUNCTION IF EXISTS qa_ux11_fail_audit()`).catch(() => {});
      }
    }
    await context.close();
  });
});

test('browser: as abas são um tablist real, com roving tabindex e teclado', opt, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie);
    await page.locator('[role="tablist"]').waitFor();

    const abas = page.getByRole('tab');
    assert.equal(await abas.count(), 3, 'a jornada tem três frentes de trabalho');
    assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1, 'roving tabindex: só uma aba tabulável');
    assert.equal(await page.locator('[role="tab"][tabindex="-1"]').count(), 2);
    assert.equal(await page.locator('[role="tabpanel"]').count(), 1, 'só o painel ativo fica montado');
    assert.equal(await page.locator('[aria-pressed]').count(), 0, 'aria-pressed não substitui tab');
    assert.equal(await abas.first().getAttribute('aria-controls'), 'continuity-panel-planos');

    await abas.first().click();
    assert.equal(await abas.first().getAttribute('aria-selected'), 'true');
    await abas.first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await abas.nth(1).getAttribute('aria-selected'), 'true');
    assert.equal(await abas.nth(1).evaluate(el => el === document.activeElement), true, 'a seta move o foco junto com a seleção');
    await page.keyboard.press('End');
    assert.equal(await abas.nth(2).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await abas.nth(0).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await abas.nth(2).getAttribute('aria-selected'), 'true', '← na primeira aba volta para a última');

    await capture(page, 'gate-tablist');
    await context.close();
  });
});

test('browser: em 390px a tela de continuidade não produz transbordo horizontal', opt, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie, { width: 390, height: 844 });
    const transbordo = async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    await page.getByPlaceholder('Título').waitFor();
    await page.waitForTimeout(400);
    const noFormulario = await transbordo();
    assert.ok(noFormulario <= 1, `transbordo de ${noFormulario}px na aba inicial de /admin/continuidade`);

    await abaPlanos(page).click();
    await cartao(page, planoSemData.id).waitFor();
    await page.waitForTimeout(400);
    const naLista = await transbordo();
    assert.ok(naLista <= 1, `transbordo de ${naLista}px na lista de /admin/continuidade`);

    await capture(page, 'gate-mobile-390px');
    await context.close();
  });
});

test('browser: queda do servidor é dita como rede indisponível, nunca como lista vazia', opt, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie);
    await abaPlanos(page).click();
    await cartao(page, planoSemData.id).waitFor();
    const antes = await page.locator('[data-testid="continuity-plan-card"]').count();
    assert.ok(antes >= 1, 'a lista precisa estar cheia antes da queda');

    try {
      await stopServer();
      await page.getByRole('button', { name: 'Atualizar lista' }).click();

      const lista = page.locator('[data-testid="continuity-list"]');
      const falha = lista.locator('[data-ui-state="error"]');
      await falha.waitFor();
      const texto = await falha.textContent();
      assert.match(texto, /Rede indisponível/, 'a falha de transporte é nomeada');
      assert.match(texto, /Isto não é uma lista vazia/, 'a tela nega explicitamente a leitura vazia');
      assert.equal(await lista.locator('[data-ui-state="empty"]').count(), 0, 'falha de leitura nunca vira vazio');
      assert.equal(await page.locator('[data-testid="continuity-plan-card"]').count(), 0, 'nenhum plano é inventado durante a falha');
      assert.ok(await falha.locator('button').count() >= 1, 'falha transitória precisa oferecer nova tentativa');

      await capture(page, 'gate-falha-de-rede');
    } finally {
      if (!server) await spawnServer();
    }

    // Com o servidor de volta, o próprio botão de nova tentativa recupera.
    await page.locator('[data-testid="continuity-list"] [data-ui-state="error"] button').first().click();
    await cartao(page, planoSemData.id).waitFor();
    assert.equal(await page.locator('[data-testid="continuity-list"] [data-ui-state="error"]').count(), 0, 'a recuperação limpa o estado de falha');

    await capture(page, 'gate-recuperacao');
    await context.close();
  });
});
