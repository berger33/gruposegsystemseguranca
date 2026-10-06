// UX-11 / EXT-10 — gate focal do portal do cliente em /cliente/app/continuidade.
// PostgreSQL descartável, servidor HTTP canônico e Chromium reais. Nenhuma
// resposta é substituída: 403 é obtido ao revogar o vínculo, 503 por falha
// real da auditoria e status 0 ao derrubar o servidor com a página aberta.
//
// O que este gate prova: o portal mostra separadamente lista publicada, vazio,
// recusa, indisponibilidade e rede; respeita canRetry; conserva as datas em
// UTC; e continua limitado à conta vinculada. A massa é exclusivamente
// fictícia. Planos nascem, mudam de estado e são publicados pelas APIs HTTP
// canônicas; SQL prepara apenas identidades, contas, vínculos e controles de
// falha do ambiente descartável.
//
// O que este gate não prova: homologação humana, aceite de Marcelo/Andreia,
// WCAG integral ou comportamento em produção.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { hashPassword } from '../src/lib/client-auth-core.mjs';
import { provisionStaff, STAFF_TEST_PASSWORD } from './helpers/staff-login.mjs';
import { describeContinuityError } from '../src/lib/continuity-vocabulary.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);
const REQUIRE = process.env.QA_UX_CONTINUITY_CLIENT_REQUIRE_DB === '1';
const root = path.resolve(import.meta.dirname, '..');
const opt = { skip: !RUN };

let server;
let baseUrl;
let serverPort;
let pool;
let admin;
let adminCookie;
let accountA;
let accountB;
let clientA;
let clientB;
let planA;

const sessionSecret = `${randomUUID()}${randomUUID()}`;
const key = label => `cont-client-gate-${label}-${randomUUID()}`;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function api(pathname, { method = 'GET', cookie = adminCookie, body, headers = {}, idempotencyKey } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { origin: baseUrl } : {}),
      ...(method !== 'GET' && pathname.startsWith('/api/ext/continuity/')
        ? { 'idempotency-key': idempotencyKey || key('http') }
        : {}),
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

async function waitForServer(timeoutMs = 240_000) {
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
      NEXT_DIST_DIR: '.next/integration-ux-continuity-client',
      SITE_ADMIN_SESSION_SECRET: sessionSecret,
      EMPLOYEE_SESSION_SECRET: sessionSecret,
      CLIENT_MFA_ENCRYPTION_KEY: Buffer.from(randomUUID()).toString('base64url').slice(0, 43),
      ADMIN_LOGIN_MAX_ATTEMPTS: '200',
      SITE_ADMIN_LEGACY_TOKENS: '',
      OLLAMA_ENABLED: 'false',
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
  await Promise.race([
    new Promise(resolve => current.once('exit', resolve)),
    wait(4_000),
  ]);
  if (!current.killed) current.kill('SIGKILL');
  server = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await fetch(`${baseUrl}/api/admin/session`, { signal: AbortSignal.timeout(600) });
    } catch {
      return;
    }
    await wait(150);
  }
  throw new Error('server_did_not_stop');
}

async function loginStaff(email) {
  const response = await api('/api/admin/session', {
    method: 'POST', cookie: null, body: { email, password: STAFF_TEST_PASSWORD },
  });
  assert.equal(response.status, 200, `login staff deveria retornar 200, veio ${response.status}`);
  const raw = response.setCookie.find(item => item.startsWith('seg_admin_session='));
  assert.ok(raw, 'login staff precisa emitir cookie');
  return raw.split(';')[0];
}

async function createClient(tag, accountId) {
  const id = randomUUID();
  const email = `ux11-continuity-client-${tag}-${id.slice(0, 8)}@example.invalid`;
  const password = `Cliente-Ficticio-${randomUUID()}!`;
  await pool.query(
    `INSERT INTO auth_identities (id, kind, email, display_name, status, verification_method, verified_at)
     VALUES ($1,'client',$2,$3,'active','email_link',NOW())`,
    [id, email, `Cliente fictício UX-11 ${tag}`],
  );
  await pool.query('INSERT INTO auth_credentials (identity_id, password_hash) VALUES ($1,$2)', [id, await hashPassword(password)]);
  await pool.query(
    `INSERT INTO client_access_grants (id, identity_id, client_account_id, reason, granted_by)
     VALUES ($1,$2,$3,'Vínculo fictício do gate UX-11 do portal de continuidade','ti')`,
    [randomUUID(), id, accountId],
  );

  const response = await api('/api/auth/login', { method: 'POST', cookie: null, body: { email, password } });
  assert.equal(response.status, 200, `login do cliente ${tag} deveria retornar 200, veio ${response.status}`);
  const cookie = response.setCookie.map(item => item.split(';')[0]).join('; ');
  assert.ok(cookie.includes('seg_client_session='), 'login do cliente precisa emitir sessão');
  return { id, email, password, accountId, cookie };
}

async function launchBrowser() {
  return playwrightChromium.launch({
    executablePath: await packagedChromium.executablePath(),
    args: packagedChromium.args.filter(arg => arg !== '--disable-web-security'),
    headless: true,
  });
}

const BROWSER_CRASH = /Target (page|closed)|has been closed|Target crashed|browser has disconnected|crashed|SIGSEGV|Protocol error/i;
const RETRYABLE_CLIENT_RACE = /stale_client_list_race/i;
async function withBrowser(body, beforeAttempt = null) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (beforeAttempt) await beforeAttempt();
    const browser = await launchBrowser();
    try {
      return await body(browser);
    } catch (error) {
      const message = String(error?.message || '');
      if (error?.code === 'ERR_ASSERTION' || !(BROWSER_CRASH.test(message) || RETRYABLE_CLIENT_RACE.test(message))) throw error;
      lastError = error;
      console.log(`UX_CONTINUITY_CLIENT_BROWSER_RETRY tentativa=${attempt}: ${String(error.message).split('\n')[0]}`);
    } finally {
      await browser.close().catch(() => {});
    }
    await wait(1_500);
  }
  throw lastError;
}

const evidenceDir = process.env.UX_CONTINUITY_CLIENT_EVIDENCE_DIR || '';
async function capture(page, name) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${name}.png`), fullPage: false });
}

async function openPortal(browser, cookie, { width = 1440, height = 900 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  await context.addCookies(cookie.split('; ').filter(Boolean).map(pair => {
    const separator = pair.indexOf('=');
    return { name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl };
  }));
  const page = await context.newPage();
  const continuityTraffic = { pending: new Set(), lastActivityAt: Date.now() };
  const tracksContinuity = request => request.url().includes('/api/client/continuity/');
  page.on('request', request => {
    if (!tracksContinuity(request)) return;
    continuityTraffic.pending.add(request);
    continuityTraffic.lastActivityAt = Date.now();
  });
  const finishContinuity = request => {
    if (!tracksContinuity(request)) return;
    continuityTraffic.pending.delete(request);
    continuityTraffic.lastActivityAt = Date.now();
  };
  page.on('requestfinished', finishContinuity);
  page.on('requestfailed', finishContinuity);
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(120_000);
  await page.goto(`${baseUrl}/cliente/app/continuidade`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Planos de continuidade publicados' }).waitFor();
  return { context, page, continuityTraffic };
}

async function waitForContinuitySettled(traffic, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (traffic.pending.size === 0 && Date.now() - traffic.lastActivityAt >= 800) return;
    await wait(100);
  }
  throw new Error('client_continuity_initial_read_did_not_settle');
}

async function waitForPlan(page) {
  const card = page.locator('[data-testid="client-continuity-plan"]');
  await card.waitFor();
  return card;
}

// A página desmonta o botão assim que inicia a requisição. O evento abaixo é
// disparado no próprio controle real (não há route, resposta ou fetch falso),
// evitando que o Playwright tente uma segunda ação num nó que o React removeu.
async function refreshList(page) {
  const button = page.getByRole('button', { name: 'Atualizar lista' });
  await button.waitFor();
  await button.evaluate(element => element.click());
}

async function openStaffWorkspace(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const separator = adminCookie.indexOf('=');
  await context.addCookies([{ name: adminCookie.slice(0, separator), value: adminCookie.slice(separator + 1), url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(120_000);
  await page.goto(`${baseUrl}/admin/continuidade`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1, name: 'Continuidade de negócios e contingência' }).waitFor();
  return { context, page };
}

const staffPlanCard = (page, id) => page.locator(`[data-testid="continuity-plan-card"][data-plan="${id}"]`);

// O cenário de 404 deliberadamente muda disponibilidade entre duas leituras.
// Se o Chromium cair depois da retirada, uma nova tentativa recompõe a
// publicação pelo mesmo controle de equipe antes de abrir uma nova lista do
// cliente. Isso preserva a precondição sem falsificar resposta alguma.
async function ensurePlanPublishedByTeam() {
  const current = await api(`/api/ext/continuity/plans/${planA.id}`);
  assert.equal(current.status, 200, 'a equipe precisa consultar o plano antes de recompor a publicação');
  if (current.body.plan.client_visible) return;

  const staffBrowser = await launchBrowser();
  try {
    const { context, page } = await openStaffWorkspace(staffBrowser);
    await page.getByRole('tab', { name: 'Planos', exact: true }).click();
    const card = staffPlanCard(page, planA.id);
    await card.waitFor();
    await card.locator('input[aria-label^="Justificativa de publicação"]').fill('Republicação fictícia para recompor a precondição do 404 visual.');
    await card.getByRole('button', { name: 'Publicar no portal' }).click();
    await card.getByText('Portal do cliente: publicado, somente leitura').waitFor();
    await context.close();
  } finally {
    await staffBrowser.close().catch(() => {});
  }
}

before(async () => {
  if (!RUN) return;
  serverPort = await freePort();
  baseUrl = `http://127.0.0.1:${serverPort}`;
  await spawnServer();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });

  admin = await provisionStaff(pool, { role: 'admin' });
  for (const permission of ['continuity.read', 'continuity.write', 'continuity.activate']) {
    await pool.query(
      `INSERT INTO auth_permissions (id, identity_id, permission, scope_type, granted_by, granted_by_role, reason)
       VALUES ($1,$2,$3,'global',$2,'admin','Gate UX-11 cliente: grant global fictício')`,
      [randomUUID(), admin.id, permission],
    );
  }
  adminCookie = await loginStaff(admin.email);

  accountA = randomUUID();
  accountB = randomUUID();
  await pool.query(
    `INSERT INTO client_accounts (id, display_name, status, created_by)
     VALUES ($1,'Conta fictícia publicada UX-11','active','ti'),($2,'Conta fictícia sem plano UX-11','active','ti')`,
    [accountA, accountB],
  );
  clientA = await createClient('publicado', accountA);
  clientB = await createClient('vazio', accountB);

  const created = await api('/api/ext/continuity/plans', {
    method: 'POST',
    body: {
      title: 'Plano fictício publicado no portal de continuidade',
      description: 'Massa sintética do gate UX-11 do portal; não representa um plano ou cliente real.',
      responsible_name: 'Equipe fictícia de continuidade',
      client_account_id: accountA,
      contingency_steps: ['Registrar a ocorrência no sistema interno'],
      recovery_steps: ['Confirmar a recuperação no procedimento interno'],
    },
  });
  assert.equal(created.status, 201, `criação canônica do plano deveria retornar 201, veio ${created.status}`);
  planA = created.body.plan;

  const approved = await api(`/api/ext/continuity/plans/${planA.id}/transition`, {
    method: 'POST', body: { status: 'aprovado' },
  });
  assert.equal(approved.status, 200, `aprovação canônica deveria retornar 200, veio ${approved.status}`);
  const exercise = await api(`/api/ext/continuity/plans/${planA.id}/exercises`, {
    method: 'POST',
    body: {
      exercise_date: '2026-03-11',
      next_due: '2026-09-11',
      result: 'Simulado fictício documentado para provar a apresentação de datas no portal.',
      responsible_name: 'Equipe fictícia de simulados',
    },
  });
  assert.equal(exercise.status, 201, `simulado canônico deveria retornar 201, veio ${exercise.status}`);
  const published = await api(`/api/ext/continuity/plans/${planA.id}/client-visibility`, {
    method: 'POST',
    body: { visible: true, note: 'Publicado para a conta fictícia conferir o procedimento de continuidade.' },
  });
  assert.equal(published.status, 200, `publicação canônica deveria retornar 200, veio ${published.status}`);

  const deadline = Date.now() + 300_000;
  while (true) {
    try {
      const response = await fetch(`${baseUrl}/cliente/app/continuidade`, { redirect: 'manual' });
      if (response.status !== 404) break;
    } catch { /* o compilador ainda está preparando a rota */ }
    if (Date.now() > deadline) throw new Error('client_continuity_page_compile_timeout');
    await wait(500);
  }
});

after(async () => {
  await stopServer().catch(() => {});
  await pool?.end().catch(() => {});
});

test('o gate focal exige PostgreSQL real quando é cobrado', () => {
  if (REQUIRE) assert.ok(RUN, 'QA_UX_CONTINUITY_CLIENT_REQUIRE_DB=1 exige DATABASE_URL e RUN_DATABASE_INTEGRATION=1');
});

test('HTTP real: sessão, vínculo e 404 não vazam planos e preservam a classificação', opt, async () => {
  const anonymous = await api(`/api/client/continuity/plans?account=${accountA}`, { cookie: null });
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error, 'client_session_required');
  assert.ok(!('plans' in (anonymous.body || {})), 'a sessão ausente não pode vazar lista');

  const crossAccount = await api(`/api/client/continuity/plans?account=${accountA}`, { cookie: clientB.cookie });
  assert.equal(crossAccount.status, 403);
  assert.equal(crossAccount.body.error, 'forbidden');
  assert.ok(!('plans' in (crossAccount.body || {})), 'o vínculo de outra conta não pode vazar lista');

  const missing = await api(`/api/client/continuity/plans/${randomUUID()}`, { cookie: clientA.cookie });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, 'plan_not_found');
  assert.equal(describeContinuityError(missing.body.error, missing.status).canRetry, false);
});

test('browser: plano publicado usa data UTC e mostra somente a projeção do cliente', opt, async () => {
  await withBrowser(async browser => {
    const { context, page, continuityTraffic } = await openPortal(browser, clientA.cookie);
    const card = await waitForPlan(page);
    await waitForContinuitySettled(continuityTraffic);
    const text = await card.innerText();
    assert.match(text, /Plano fictício publicado no portal de continuidade/);
    assert.match(text, /último simulado 11\/03\/2026/, 'a data não pode voltar um dia em America/Sao_Paulo');
    assert.match(text, /próximo teste 11\/09\/2026/, 'a próxima data também usa UTC');
    assert.doesNotMatch(text, /1970|R\$ 0,00|em dia/i);
    assert.doesNotMatch(text, /contatos internos|resultados de simulado/i, 'a projeção não expõe conteúdo interno');
    assert.equal(await page.locator('[data-ui-state="error"], [data-ui-state="denied"]').count(), 0);
    await capture(page, 'gate-plano-publicado-datas-utc');
    await context.close();
  });
});

test('browser: lista vazia é estado concluído, não falha', opt, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openPortal(browser, clientB.cookie);
    const empty = page.locator('[data-ui-state="empty"]');
    await empty.waitFor();
    assert.match(await empty.innerText(), /Nenhum plano de continuidade publicado/);
    assert.equal(await page.locator('[data-ui-state="error"], [data-ui-state="denied"]').count(), 0);
    await capture(page, 'gate-vazio-honesto');
    await context.close();
  });
});

test('browser: vínculo revogado produz NEGADO real, sem lista vazia ou repetição inútil', opt, async () => {
  await withBrowser(async browser => {
    const { context, page, continuityTraffic } = await openPortal(browser, clientA.cookie);
    await waitForPlan(page);
    await waitForContinuitySettled(continuityTraffic);
    try {
      await pool.query('UPDATE client_access_grants SET revoked_at=NOW(), revoked_by=$2, revoke_reason=$3 WHERE identity_id=$1 AND revoked_at IS NULL', [
        clientA.id, 'ti', 'Gate UX-11: revogação sintética para provar a recusa do portal',
      ]);
      await refreshList(page);
      const denied = page.locator('[data-ui-state="denied"]');
      await denied.waitFor();
      const text = await denied.innerText();
      assert.match(text, /Acesso negado/);
      assert.match(text, /Código técnico: forbidden/);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      assert.equal(await denied.getByRole('button').count(), 0, '403 não oferece repetir a mesma requisição recusada');
      assert.equal(await page.locator('[data-testid="client-continuity-plan"]').count(), 0, 'lista anterior não pode sobreviver como se ainda estivesse autorizada');
      await capture(page, 'gate-negado-403-vinculo-revogado');
    } finally {
      await pool.query('UPDATE client_access_grants SET revoked_at=NULL, revoked_by=NULL, revoke_reason=NULL WHERE identity_id=$1', [clientA.id]);
    }
    await context.close();
  });
});

test('browser: 503 real da auditoria é falha recuperável, não vazio', opt, async () => {
  await withBrowser(async browser => {
    const { context, page, continuityTraffic } = await openPortal(browser, clientA.cookie);
    await waitForPlan(page);
    await waitForContinuitySettled(continuityTraffic);
    await pool.query(`CREATE OR REPLACE FUNCTION qa_ux11_client_fail_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'qa_ux11_client_audit_unavailable'; END; $$ LANGUAGE plpgsql`);
    await pool.query('CREATE TRIGGER qa_ux11_client_fail_audit BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_ux11_client_fail_audit()');
    try {
      await refreshList(page);
      const failure = page.locator('[data-ui-state="error"]');
      await failure.waitFor();
      const text = await failure.innerText();
      assert.match(text, /Auditoria indisponível/);
      assert.match(text, /Código técnico: audit_unavailable/);
      assert.match(text, /HTTP 503/);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      assert.equal(await failure.getByRole('button', { name: 'Tentar novamente' }).count(), 1);
      await capture(page, 'gate-falha-auditoria-503');
    } finally {
      await pool.query('DROP TRIGGER IF EXISTS qa_ux11_client_fail_audit ON auth_access_audit');
      await pool.query('DROP FUNCTION IF EXISTS qa_ux11_client_fail_audit()');
    }
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await waitForPlan(page);
    await context.close();
  });
});

test('browser: queda real do servidor é status 0 recuperável e volta pela nova tentativa', opt, async () => {
  await withBrowser(async browser => {
    const { context, page, continuityTraffic } = await openPortal(browser, clientA.cookie);
    await waitForPlan(page);
    await waitForContinuitySettled(continuityTraffic);
    await stopServer();
    try {
      await refreshList(page);
      const failure = page.locator('[data-ui-state="error"]');
      await failure.waitFor();
      const text = await failure.innerText();
      assert.match(text, /Rede indisponível/);
      assert.match(text, /Sem resposta HTTP/);
      assert.equal(await failure.getByRole('button', { name: 'Tentar novamente' }).count(), 1);
      assert.equal(await page.locator('[data-ui-state="empty"]').count(), 0);
      await capture(page, 'gate-falha-rede-status-zero');
    } finally {
      // Mesmo se uma asserção falhar, não deixar a próxima prova medir uma
      // porta desligada em vez do comportamento que ela se propõe a verificar.
      if (!server) await spawnServer();
    }

    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await waitForPlan(page);
    await capture(page, 'gate-recuperacao-rede');
    await context.close();
  });
});

test('browser: em 390px o portal publicado não cria rolagem horizontal', opt, async () => {
  await withBrowser(async browser => {
    const { context, page, continuityTraffic } = await openPortal(browser, clientA.cookie, { width: 390, height: 844 });
    await waitForPlan(page);
    await waitForContinuitySettled(continuityTraffic);
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `portal de continuidade transbordou ${overflow}px em 390px`);
    await capture(page, 'gate-mobile-390px');
    await context.close();
  });
});

test('browser: detalhe recebe 404 real após retirada pela tela de equipe e preserva a lista já lida', opt, async () => {
  await withBrowser(async browser => {
    const { context: clientContext, page: clientPage, continuityTraffic } = await openPortal(browser, clientA.cookie);
    const listedCard = clientPage.locator(`[data-testid="client-continuity-plan"][data-plan="${planA.id}"]`);
    await listedCard.waitFor();
    assert.match(await listedCard.innerText(), /Plano fictício publicado no portal de continuidade/);
    // Em dev, o React pode concluir outra leitura inicial em paralelo. Esperar
    // todas as leituras já emitidas terminarem evita medir essa corrida como
    // se fosse a mudança de disponibilidade provocada logo abaixo pela equipe.
    await waitForContinuitySettled(continuityTraffic);
    await listedCard.waitFor();

    // O Chromium empacotado usa --single-process. A equipe recebe outro
    // processo para preservar a página de cliente já listada, sem trocar actor,
    // resposta nem controle real de nenhum dos dois lados.
    const staffBrowser = await launchBrowser();
    try {
      const { context: staffContext, page: staffPage } = await openStaffWorkspace(staffBrowser);
      await staffPage.getByRole('tab', { name: 'Planos', exact: true }).click();
      const teamCard = staffPlanCard(staffPage, planA.id);
      await teamCard.waitFor();
      await teamCard.getByRole('button', { name: 'Retirar publicação' }).click();
      await teamCard.getByText('Portal do cliente: não publicado por padrão').waitFor();
      await staffContext.close();
    } finally {
      await staffBrowser.close().catch(() => {});
    }

    // A lista previamente lida deve permanecer no DOM até que o cliente
    // escolha atualizá-la. Se um efeito inicial do React ainda estiver em voo
    // no servidor de desenvolvimento e vencer a retirada, recompomos todo o
    // cenário numa nova tentativa (publicação real + nova listagem), em vez de
    // clicar numa lista que já não representa a leitura exigida por este caso.
    if (await listedCard.count() !== 1) throw new Error('stale_client_list_race');

    // O observador só lê a resposta originalmente devolvida ao Chromium: não
    // a intercepta nem a altera. Assim, além do estado visual, a prova registra
    // que o clique do cliente recebeu o 404 canônico após a retirada por UI.
    let browserDetailResponse;
    const observeDetailResponse = response => {
      if (response.url().includes(`/api/client/continuity/plans/${planA.id}`)) browserDetailResponse = response;
    };
    clientPage.on('response', observeDetailResponse);
    const detail = clientPage.locator('[data-testid="client-continuity-detail"]');
    const unavailable = detail.locator('[data-ui-state="error"]');
    try {
      await listedCard.getByRole('button', { name: 'Abrir detalhes' }).evaluate(element => element.click());
      await unavailable.waitFor();
    } finally {
      clientPage.off('response', observeDetailResponse);
    }
    assert.ok(browserDetailResponse, 'o clique do detalhe precisa chegar ao endpoint canônico');
    assert.equal(browserDetailResponse.status(), 404, 'o navegador recebeu o 404 canônico real');
    assert.equal((await browserDetailResponse.json()).error, 'plan_not_found');
    const text = await unavailable.innerText();
    assert.match(text, /Plano indisponível neste escopo/);
    assert.match(text, /indisponível para esta consulta e este escopo/);
    assert.match(text, /Código técnico: plan_not_found/);
    assert.doesNotMatch(text, /removid|exclu[ií]d|apagado|retirad/i, 'a indisponibilidade não afirma remoção, exclusão ou retirada');
    assert.doesNotMatch(text, /Plano fictício publicado no portal de continuidade|Equipe fictícia de continuidade|Simulado fictício documentado/, 'o erro do detalhe não vaza conteúdo do plano');
    assert.equal(await unavailable.getByRole('button', { name: 'Tentar novamente' }).count(), 0, '404 plan_not_found não oferece repetição inútil');
    assert.equal(await clientPage.locator(`[data-testid="client-continuity-plan"][data-plan="${planA.id}"]`).count(), 1, 'a lista previamente lida permanece disponível');
    assert.equal(await clientPage.locator('[data-ui-state="empty"]').count(), 0, '404 do detalhe não transforma a lista em vazio');

    await capture(clientPage, 'gate-404-detalhe-indisponivel-real');
    await clientContext.close();
  }, ensurePlanPublishedByTeam);
});

test('anti-deriva: o portal mantém wrapper, estados e botão de atualização canônicos', async () => {
  const source = await readFile(new URL('../src/app/cliente/app/continuidade/page.tsx', import.meta.url), 'utf8');
  assert.match(source, /continuityRequest/);
  assert.doesNotMatch(source, /\bfetch\(/);
  assert.match(source, /honestTestDate/);
  assert.match(source, /honestNextTest/);
  assert.match(source, /data-ui-state/);
  assert.match(source, /Atualizar lista/);
  assert.match(source, /Abrir detalhes/);
  assert.match(source, /`\/api\/client\/continuity\/plans\/\$\{planId\}`/);
  assert.match(source, /client-continuity-detail/);
});
