// UX-07 / EXT-11 / F07 — gate da tela /admin/analytics, por HTTP real contra
// PostgreSQL real (executado por scripts/qa-ux-analytics-postgres.mjs, que
// sobe um cluster descartável) e por Chromium real.
//
// O que este gate prova:
//  - a rota canônica continua respondendo 401 sem sessão, sem vazar
//    experimento algum na negativa;
//  - "menu não é autorização": o papel `ti` está em `allowedRoles` do
//    AdminGate de /admin/analytics e, com a permissão granular revogada, o
//    servidor recusa sozinho — 403 `forbidden` na leitura e na aprovação —
//    enquanto `admin` segue autorizado. A tela não inventa permissão nem
//    remove a que existe;
//  - o defeito central desta fatia: a leitura que falha virava
//    "Nenhum experimento canônico registrado". Agora falha é estado próprio,
//    diz que NÃO significa ausência de experimentos, mostra o código canônico
//    e oferece repetir — e nenhuma métrica zero é renderizada;
//  - vazio legítimo não é apresentado como falha;
//  - as quatro abas são um tablist de verdade, com roving tabindex e teclado;
//  - o vocabulário em português aparece no lugar do valor cru do banco
//    (`em_execucao`, `internal_operational_record`, `ext11_canonica`);
//  - a tela declara que não inventa tráfego, conversão, vencedor ou
//    significância, e não mostra 0% no lugar de "não calculado";
//  - 390px não produz transbordo horizontal.
//
// O que este gate NÃO prova: aceite humano, homologação de Marcelo/Andreia,
// nem a superfície administrativa antiga. Ver pendências em
// docs/UX-07-ANALYTICS-2026-10-06.md.
//
// Nenhuma asserção é enfraquecida: a falha de leitura é injetada apenas em
// `window.fetch`, dentro da própria página (`page.addInitScript`). O servidor
// nunca é alterado para o teste passar, e `ERR_ASSERTION` nunca é repetido.

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
let adminCookie, tiCookie;
let adminStaff, tiStaff;
let runningId, draftId, protocolEmExecucao;

const key = label => `ext11-ux-${label}-${randomUUID()}`;

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

function api(pathname, { method = 'GET', body, cookie, headers = {}, idempotencyKey } = {}) {
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
  }).then(async res => ({ status: res.status, body: await res.json().catch(() => null) }));
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

/**
 * Revogação real e auditável da permissão granular — o mesmo caminho que a
 * migração 163 declara possível ("Revogação manual continua possível").
 * Nada aqui enfraquece o servidor: só retira um grant de uma conta de teste.
 */
async function revokeGrantIfActive(identityId, permission, revokedBy) {
  const { rowCount } = await pool.query(
    `UPDATE auth_permissions
        SET revoked_at = NOW(), revoked_by = $3, revoke_reason = 'Gate UX-07 analytics: prova de que menu não é autorização'
      WHERE identity_id = $1 AND permission = $2 AND revoked_at IS NULL`,
    [identityId, permission, revokedBy],
  );
  return rowCount;
}

async function revokeGrant(identityId, permission, revokedBy) {
  const revogadas = await revokeGrantIfActive(identityId, permission, revokedBy);
  assert.ok(revogadas >= 1, `o papel precisava ter ${permission} provisionada antes da revogação`);
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
// sessão inteira quando o Chromium morre (SIGSEGV, alvo fechado) e repassa na
// hora qualquer falha de asserção — nenhuma asserção fica tolerante.
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
      console.log(`UX_ANALYTICS_BROWSER_RETRY tentativa=${tentativa}: ${String(erro.message).split('\n')[0]}`);
    } finally {
      await browser.close().catch(() => {});
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw ultimo;
}

const evidenceDir = process.env.UX_ANALYTICS_EVIDENCE_DIR || '';
async function capture(page, nome) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage: true });
}

/**
 * Abre /admin/analytics já autenticada. `failRoutes` derruba, dentro da
 * própria página, as respostas indicadas: `page.route()` é instável com este
 * Chromium empacotado, então a substituição é feita em `window.fetch`, como
 * nos demais gates. O servidor NUNCA é enfraquecido.
 */
async function abrir(browser, cookie, { width = 1440, height = 900, failRoutes = [], status = 503, code = 'database_error' } = {}) {
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
  await page.goto(`${baseUrl}/admin/analytics`, { waitUntil: 'domcontentloaded' });
  // O h1 real é a marca de que a página de produto montou. Esperar só o
  // tablist mede a tela antes de a leitura terminar.
  await page.getByRole('heading', { level: 1, name: /Analytics e experimentos A\/B controlados/ }).waitFor();
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
      NEXT_DIST_DIR: '.next/integration-ux-analytics',
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

  // `admin` e `ti` estão em allowedRoles do AdminGate de /admin/analytics e
  // recebem as permissões granulares EXT-11 pelo gatilho da migração 163.
  adminStaff = await provisionStaff(pool, { role: 'admin' });
  tiStaff = await provisionStaff(pool, { role: 'ti' });
  adminCookie = await loginStaffHttp(adminStaff.email);
  tiCookie = await loginStaffHttp(tiStaff.email);

  // Massa fictícia criada pelas PRÓPRIAS APIs canônicas, por HTTP: nada é
  // inserido por SQL de negócio.
  const criado = await api('/api/ext/analytics/experiments', {
    method: 'POST', cookie: adminCookie,
    body: {
      hypothesis: 'Hipótese sintética do gate UX-07 analytics sobre um ajuste observável',
      description: 'Massa fictícia do gate UX-07; nenhum tráfego externo é coletado.',
      variant_a: 'Fluxo atual de atendimento',
      variant_b: 'Fluxo com aviso antecipado',
      metric_name: 'registros concluidos',
      privacy_note: 'Somente métrica agregada; sem nome, contato, IP ou identificador direto.',
    },
  });
  assert.equal(criado.status, 201, `criação deveria ser 201, veio ${criado.status} ${JSON.stringify(criado.body)}`);
  runningId = criado.body.experiment.id;
  protocolEmExecucao = criado.body.experiment.protocol;

  const aprovado = await api(`/api/ext/analytics/experiments/${runningId}/approve`, {
    method: 'POST', cookie: adminCookie,
    body: { approval_note: 'Aprovação humana registrada pelo gate após revisão de hipótese e minimização.' },
  });
  assert.equal(aprovado.status, 200, `aprovação deveria ser 200, veio ${aprovado.status}`);

  const executando = await api(`/api/ext/analytics/experiments/${runningId}/transition`, {
    method: 'POST', cookie: adminCookie, body: { status: 'em_execucao' },
  });
  assert.equal(executando.status, 200, `transição deveria ser 200, veio ${executando.status}`);

  for (const [variant, metricValue, sampleSize, reference] of [
    ['A', 4, 10, 'ops-ledger-ux07-a'],
    ['B', 5, 11, 'ops-ledger-ux07-b'],
  ]) {
    const observado = await api(`/api/ext/analytics/experiments/${runningId}/observations`, {
      method: 'POST', cookie: adminCookie,
      body: {
        variant, metric_name: 'registros concluidos', metric_value: metricValue, sample_size: sampleSize,
        source_type: 'internal_operational_record', source_reference: reference,
        source_recorded_at: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    assert.equal(observado.status, 201, `observação ${variant} deveria ser 201, veio ${observado.status} ${JSON.stringify(observado.body)}`);
  }

  // Segundo experimento: rascunho sem aprovação, para provar ausência honesta.
  const rascunho = await api('/api/ext/analytics/experiments', {
    method: 'POST', cookie: adminCookie,
    body: {
      hypothesis: 'Segunda hipótese sintética ainda sem aprovação humana registrada',
      description: 'Rascunho do gate para provar que ausência não vira data nem zero.',
      variant_a: 'Roteiro A',
      variant_b: 'Roteiro B',
      metric_name: 'contatos internos',
    },
  });
  assert.equal(rascunho.status, 201);
  draftId = rascunho.body.experiment.id;

  // A página precisa estar compilada antes de qualquer medição no navegador.
  for (const route of ['/admin/entrar', '/admin/analytics']) {
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

test('a rota canônica de analytics continua exigindo sessão, sem mudança de contrato', { skip: !RUN }, async () => {
  const anonimo = await api('/api/ext/analytics/experiments');
  assert.equal(anonimo.status, 401);
  assert.equal(anonimo.body.error, 'unauthorized');
  assert.ok(!('items' in (anonimo.body || {})), 'a negativa não pode vazar experimento algum');

  // Idempotência e proteção de origem seguem intactas nesta fatia.
  assert.equal((await api('/api/ext/analytics/experiments', {
    method: 'POST', cookie: adminCookie, idempotencyKey: null, body: {},
  })).status, 400);
  assert.equal((await api('/api/ext/analytics/experiments', {
    method: 'POST', cookie: adminCookie, headers: { origin: 'https://attacker.invalid' }, body: {},
  })).status, 403);
});

test('menu não é autorização: ti abre a tela e quem recusa é o servidor', { skip: !RUN }, async () => {
  // Antes da revogação o papel `ti` lê normalmente: o gatilho da migração 163
  // provisionou as permissões granulares por papel.
  assert.equal((await api('/api/ext/analytics/experiments', { cookie: tiCookie })).status, 200);

  await revokeGrant(tiStaff.id, 'analytics.approve', adminStaff.id);
  const aprovacaoNegada = await api(`/api/ext/analytics/experiments/${draftId}/approve`, {
    method: 'POST', cookie: tiCookie,
    body: { approval_note: 'Tentativa de aprovação sem a permissão granular correspondente.' },
  });
  assert.equal(aprovacaoNegada.status, 403, 'sem analytics.approve o servidor recusa a aprovação');
  assert.equal(aprovacaoNegada.body.error, 'forbidden');
  assert.ok(!('experiment' in (aprovacaoNegada.body || {})), 'a negativa não pode vazar o experimento');

  await revokeGrant(tiStaff.id, 'analytics.read', adminStaff.id);
  const leituraNegada = await api('/api/ext/analytics/experiments', { cookie: tiCookie });
  assert.equal(leituraNegada.status, 403, 'sem analytics.read o servidor recusa a leitura');
  assert.equal(leituraNegada.body.error, 'forbidden');
  assert.ok(!('items' in (leituraNegada.body || {})), 'a negativa não pode vazar a lista');

  // `admin` segue com tudo: esta fatia não mexeu em permissão nenhuma.
  assert.equal((await api('/api/ext/analytics/experiments', { cookie: adminCookie })).status, 200);
  assert.equal((await api(`/api/ext/analytics/experiments/${runningId}`, { cookie: adminCookie })).status, 200);
});

test('browser: recusa do servidor vira estado NEGADO, não lista vazia nem zero', { skip: !RUN }, async () => {
  // Pré-condição explícita, para o teste não depender da ordem de execução:
  // garante a revogação e confirma com o próprio servidor que ele recusa.
  await revokeGrantIfActive(tiStaff.id, 'analytics.read', adminStaff.id);
  const negadaHttp = await api('/api/ext/analytics/experiments', { cookie: tiCookie });
  assert.equal(negadaHttp.status, 403, 'pré-condição: o servidor precisa estar recusando a leitura do papel ti');

  await comNavegador(async browser => {
    // O papel `ti` continua em allowedRoles do AdminGate e abre a tela; só a
    // permissão granular foi revogada.
    const { context, page } = await abrir(browser, tiCookie);
    const lista = page.locator('[data-testid="analytics-list"]');
    await lista.waitFor();
    const negado = lista.locator('[data-ui-state="denied"]');
    await negado.waitFor();
    const texto = await negado.textContent();
    assert.match(texto, /permissão granular/i, 'a recusa explica que falta permissão, não que não há dado');
    assert.match(texto, /\(forbidden\)/, 'o código canônico fica disponível para diagnóstico');

    assert.equal(await lista.locator('[data-ui-state="empty"]').count(), 0, 'recusa não pode ser confundida com vazio');
    assert.equal(await page.locator('[data-testid="analytics-list-table"]').count(), 0, 'nenhuma tabela vazia é renderizada');
    assert.equal(await page.locator('[data-testid="analytics-metrics"]').count(), 0, 'nenhuma métrica zero é renderizada');

    await capture(page, 'desktop-analytics-negado');
    await context.close();
  });
});

test('browser: falha de leitura NÃO vira "nenhum experimento" nem métrica zero', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie, {
      failRoutes: ['/api/ext/analytics/experiments'], status: 503, code: 'audit_unavailable',
    });
    const lista = page.locator('[data-testid="analytics-list"]');
    await lista.waitFor();
    const erro = lista.locator('[data-ui-state="error"]');
    await erro.waitFor();
    const texto = await erro.textContent();
    assert.match(texto, /não significa que não existam experimentos/i, 'a falha nega explicitamente a lista vazia');
    assert.match(texto, /\(audit_unavailable\)/, 'o código canônico fica disponível');
    assert.ok(await erro.locator('button').count() >= 1, 'falha transitória precisa oferecer nova tentativa');

    assert.equal(await lista.locator('[data-ui-state="empty"]').count(), 0, 'falha não pode virar vazio');
    assert.equal(await page.locator('[data-testid="analytics-list-table"]').count(), 0, 'nenhuma tabela vazia é renderizada');
    assert.equal(await page.locator('[data-testid="analytics-metrics"]').count(), 0, 'nenhuma métrica zero é renderizada');

    await capture(page, 'desktop-analytics-falha-leitura');
    await context.close();
  });
});

test('browser: as quatro abas são um tablist de verdade, com teclado', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie);
    await page.locator('[role="tablist"]').waitFor();

    const abas = page.getByRole('tab');
    assert.equal(await abas.count(), 4, 'a jornada tem quatro frentes de trabalho');
    assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1, 'roving tabindex: só uma aba tabulável');
    assert.equal(await page.locator('[role="tab"][tabindex="-1"]').count(), 3);
    assert.equal(await page.locator('[role="tabpanel"]').count(), 1, 'só o painel ativo fica montado');
    assert.equal(await page.locator('[aria-pressed]').count(), 0, 'aria-pressed não substitui tab');
    assert.equal(await abas.first().getAttribute('aria-controls'), 'analytics-panel-lista');

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
    assert.equal(await abas.nth(3).getAttribute('aria-selected'), 'true', '←  na primeira aba volta para a última');

    await capture(page, 'desktop-analytics-abas');
    await context.close();
  });
});

test('browser: a jornada real aparece em português, sem valor cru do banco', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie);
    const tabela = page.locator('[data-testid="analytics-list-table"]');
    await tabela.waitFor();

    // textContent, e não innerText: o prefixo de leitor de tela do UiBadge é
    // recortado por CSS e não entra no texto renderizado.
    const textoTabela = await tabela.textContent();
    assert.match(textoTabela, /Em execução/, 'a situação `em_execucao` é exibida em português');
    assert.match(textoTabela, /Rascunho/, 'a situação `rascunho` é exibida em português');
    assert.doesNotMatch(textoTabela, /em_execucao|ext11_canonica/, 'nenhum valor cru do banco na lista');
    assert.match(textoTabela, /Aprovação pendente/, 'ausência de aprovação é dita, não datada');
    assert.doesNotMatch(textoTabela, /01\/01\/1970/, 'ausência nunca vira data inicial');

    // A métrica honesta: o percentual não calculado nunca aparece como 0%.
    const semTaxa = await page.locator('[data-testid="analytics-no-rate"]').textContent();
    assert.match(semTaxa, /Percentual não calculado/);
    assert.doesNotMatch(semTaxa, /\b0%/);

    const declaracao = await page.locator('[data-testid="analytics-honesty"]').textContent();
    assert.match(declaracao, /não coleta tráfego/i);
    assert.match(declaracao, /não inventa tráfego nem conversões/i);
    assert.match(declaracao, /não declara vencedor nem significância/i);

    // Abrir o ciclo de vida do experimento em execução e conferir a trilha.
    await page.getByRole('row', { name: new RegExp(protocolEmExecucao) })
      .getByRole('button', { name: 'Abrir ciclo de vida' }).click();
    const detalhe = page.locator('[data-testid="analytics-detail"]');
    await detalhe.waitFor();
    const textoDetalhe = await detalhe.textContent();
    assert.match(textoDetalhe, /Jornada canônica EXT-11/, 'a origem sai em português');
    assert.match(textoDetalhe, /Em execução/);
    assert.doesNotMatch(textoDetalhe, /Aprovação pendente/, 'este experimento foi aprovado e a data real aparece');

    await page.getByRole('tab', { name: 'Observações e trilha', exact: true }).click();
    const observacoes = page.locator('[data-testid="analytics-observations"]');
    await observacoes.waitFor();
    const textoObs = await observacoes.textContent();
    assert.match(textoObs, /Registro operacional interno/, 'a origem da observação sai em português');
    assert.doesNotMatch(textoObs, /internal_operational_record/, 'nenhum valor cru do banco nas observações');
    assert.match(textoObs, /Variante A/);
    assert.match(textoObs, /Variante B/);

    const semVencedor = await page.locator('[data-testid="analytics-no-winner"]').textContent();
    assert.match(semVencedor, /Sem vencedor e sem significância/i);
    assert.match(semVencedor, /Percentual não calculado/);

    const trilha = await page.locator('[data-testid="analytics-events"]').textContent();
    assert.match(trilha, /Observação real registrada/, 'o evento sai em português');
    assert.doesNotMatch(trilha, /observation_recorded/, 'nenhum valor cru do banco na trilha');

    await capture(page, 'desktop-analytics-jornada');
    await context.close();
  });
});

test('browser: ausência honesta no rascunho sem aprovação e sem observação', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie);
    await page.locator('[data-testid="analytics-list-table"]').waitFor();
    await page.getByRole('tab', { name: 'Aprovação e ciclo de vida', exact: true }).click();
    await page.locator('#analytics-selected').selectOption(draftId);
    const detalhe = page.locator('[data-testid="analytics-detail"]');
    await detalhe.waitFor();
    const texto = await detalhe.textContent();
    assert.match(texto, /Aprovação pendente/, 'aprovação ausente é dita, não datada');
    assert.match(texto, /Dado ausente/, 'início de execução ausente aparece como ausência');
    assert.doesNotMatch(texto, /01\/01\/1970/, 'ausência nunca vira 01/01/1970');

    await page.getByRole('tab', { name: 'Observações e trilha', exact: true }).click();
    const observacoes = page.locator('[data-testid="analytics-observations"]');
    await observacoes.waitFor();
    const vazio = observacoes.locator('[data-ui-state="empty"]');
    await vazio.waitFor();
    const textoVazio = await vazio.textContent();
    assert.match(textoVazio, /A leitura funcionou/i, 'vazio honesto diz que a leitura funcionou');
    assert.match(textoVazio, /zero não é a resposta/i);
    assert.equal(await observacoes.locator('[data-ui-state="error"]').count(), 0,
      'lista vazia não pode ser confundida com falha');

    await capture(page, 'desktop-analytics-ausencia-honesta');
    await context.close();
  });
});

test('browser: em 390px a tela de analytics não produz transbordo horizontal', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie, { width: 390, height: 844 });
    await page.locator('[data-testid="analytics-list-table"]').waitFor();
    await page.waitForTimeout(600);
    const transbordo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(transbordo <= 1, `transbordo de ${transbordo}px em /admin/analytics`);
    await capture(page, 'mobile-analytics-390px');
    await context.close();
  });
});
