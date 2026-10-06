// UX-07 / EXT-05 — gate da tela /admin/qualidade, por HTTP real contra
// PostgreSQL real (executado por scripts/qa-ux-quality-postgres.mjs, que
// sobe um cluster descartável) e por Chromium real.
//
// O que este gate prova:
//  - a rota canônica continua respondendo 401 sem sessão, sem vazar
//    não conformidade alguma na negativa;
//  - "menu não é autorização": o papel `ti` está em `allowedRoles` do
//    AdminGate de /admin/qualidade e, com a permissão granular revogada, o
//    servidor recusa sozinho — 403 `forbidden` na leitura e na escrita —
//    enquanto `admin` segue autorizado. A tela não inventa permissão nem
//    remove a que existe;
//  - o defeito central desta fatia: a leitura que falhava virava
//    "Nenhuma não conformidade" com métricas zeradas. Agora falha é estado
//    próprio, diz que NÃO significa ausência de registros, mostra o código
//    canônico e oferece repetir — e nenhuma métrica zero é renderizada;
//  - vazio legítimo não é apresentado como falha;
//  - as quatro abas são um tablist de verdade, com roving tabindex e teclado;
//  - o vocabulário em português aparece no lugar do valor cru do banco
//    (`em_acao_corretiva`, `jornada_canonica`, `concluida`, `eficaz`);
//  - ausência honesta: NC aberta sem encerramento mostra
//    "Encerramento pendente" e "Dado ausente", nunca 01/01/1970;
//  - 390px não produz transbordo horizontal.
//
// O que este gate NÃO prova: aceite humano, homologação de Marcelo/Andreia,
// nem os caminhos legados somente-leitura. Ver pendências em
// docs/UX-07-QUALIDADE-2026-10-06.md.
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
let closedId, openId, protocolEncerrada, protocolAberta;

const key = label => `ext05-ux-${label}-${randomUUID()}`;

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
 * EXT-05 não tem gatilho de provisionamento automático por papel: a migração
 * 172 só preservou os operadores existentes na época. O grant abaixo é o
 * provisionamento administrativo real (mesmo caminho da suíte herdada
 * tests/ext05-quality.integration.test.mjs) — nada aqui enfraquece o servidor.
 */
async function grantQuality(identityId, grantedByRole) {
  for (const permission of ['quality.read', 'quality.write']) {
    await pool.query(
      `INSERT INTO auth_permissions(id,identity_id,permission,scope_type,granted_by,granted_by_role,reason)
       VALUES($1,$2,$3,'global',$2,$4,'Gate UX-07 qualidade: provisionamento administrativo de teste')`,
      [randomUUID(), identityId, permission, grantedByRole],
    );
  }
}

/** Revogação real e auditável da permissão granular. */
async function revokeGrantIfActive(identityId, permission, revokedBy) {
  const { rowCount } = await pool.query(
    `UPDATE auth_permissions
        SET revoked_at = NOW(), revoked_by = $3, revoke_reason = 'Gate UX-07 qualidade: prova de que menu não é autorização'
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
      console.log(`UX_QUALITY_BROWSER_RETRY tentativa=${tentativa}: ${String(erro.message).split('\n')[0]}`);
    } finally {
      await browser.close().catch(() => {});
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw ultimo;
}

const evidenceDir = process.env.UX_QUALITY_EVIDENCE_DIR || '';
async function capture(page, nome) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage: true });
}

/**
 * Abre /admin/qualidade já autenticada. `failRoutes` derruba, dentro da
 * própria página, as respostas indicadas: `page.route()` é instável com este
 * Chromium empacotado, então a substituição é feita em `window.fetch`, como
 * nos demais gates. O servidor NUNCA é enfraquecido.
 */
async function abrir(browser, cookie, { width = 1440, height = 900, failRoutes = [], status = 503, code = 'quality_journey_unavailable' } = {}) {
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
  await page.goto(`${baseUrl}/admin/qualidade`, { waitUntil: 'domcontentloaded' });
  // O h1 real é a marca de que a página de produto montou. Esperar só o
  // tablist mede a tela antes de a leitura terminar.
  await page.getByRole('heading', { level: 1, name: /Qualidade e não conformidades internas/ }).waitFor();
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
      NEXT_DIST_DIR: '.next/integration-ux-quality',
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

  // `admin` e `ti` estão em allowedRoles do AdminGate de /admin/qualidade; a
  // permissão granular é provisionada explicitamente (não há gatilho EXT-05).
  adminStaff = await provisionStaff(pool, { role: 'admin' });
  tiStaff = await provisionStaff(pool, { role: 'ti' });
  await grantQuality(adminStaff.id, 'admin');
  await grantQuality(tiStaff.id, 'ti');
  adminCookie = await loginStaffHttp(adminStaff.email);
  tiCookie = await loginStaffHttp(tiStaff.email);

  // Massa fictícia criada pelas PRÓPRIAS APIs canônicas, por HTTP: nada é
  // inserido por SQL de negócio. Jornada completa até o encerramento real.
  const criada = await api('/api/ext/quality/nonconformities', {
    method: 'POST', cookie: adminCookie,
    body: {
      title: 'Ronda noturna sem registro de ponto de verificação',
      description: 'Massa fictícia do gate UX-07 qualidade; registro interno de staff, sem dado pessoal real.',
      category: 'processo operacional',
      severity: 'alta',
      client_account_id: '',
    },
  });
  assert.equal(criada.status, 201, `criação deveria ser 201, veio ${criada.status} ${JSON.stringify(criada.body)}`);
  closedId = criada.body.nonconformity.id;
  protocolEncerrada = criada.body.nonconformity.protocol;

  const analise = await api(`/api/ext/quality/nonconformities/${closedId}/transition`, {
    method: 'POST', cookie: adminCookie,
    body: { status: 'em_analise', reason: 'Análise iniciada pelo gate para reproduzir a jornada real.' },
  });
  assert.equal(analise.status, 200, `transição em_analise deveria ser 200, veio ${analise.status}`);

  const causa = await api(`/api/ext/quality/nonconformities/${closedId}/causes`, {
    method: 'POST', cookie: adminCookie,
    body: {
      description: 'Roteiro de ronda desatualizado após mudança de layout do posto.',
      declared_source: 'Ata interna de análise',
    },
  });
  assert.equal(causa.status, 201, `causa deveria ser 201, veio ${causa.status}`);

  const corretiva = await api(`/api/ext/quality/nonconformities/${closedId}/transition`, {
    method: 'POST', cookie: adminCookie,
    body: { status: 'em_acao_corretiva', reason: 'Causa registrada; ação corretiva definida pela equipe.' },
  });
  assert.equal(corretiva.status, 200);

  // A rota REAL de criação de ação leva o responsável no caminho.
  const acao = await api(`/api/ext/quality/nonconformities/${closedId}/responsibles/${adminStaff.id}/actions`, {
    method: 'POST', cookie: adminCookie,
    body: {
      description: 'Atualizar o roteiro de ronda e treinar a equipe do posto.',
      action_type: 'corretiva',
      due_date: '2026-10-20',
      due_date_source: 'Plano de ação interno',
      due_date_base_date: '2026-10-06',
    },
  });
  assert.equal(acao.status, 201, `ação deveria ser 201, veio ${acao.status} ${JSON.stringify(acao.body)}`);

  const concluida = await api(`/api/ext/quality/actions/${acao.body.action.id}/complete`, {
    method: 'POST', cookie: adminCookie,
    body: { note: 'Roteiro atualizado e equipe treinada; conclusão registrada pelo gate.' },
  });
  assert.equal(concluida.status, 200, `conclusão da ação deveria ser 200, veio ${concluida.status}`);

  const verificacao = await api(`/api/ext/quality/nonconformities/${closedId}/transition`, {
    method: 'POST', cookie: adminCookie,
    body: { status: 'verificacao', reason: 'Ação concluída; verificação de eficácia agendada e executada.' },
  });
  assert.equal(verificacao.status, 200);

  const verificada = await api(`/api/ext/quality/nonconformities/${closedId}/verifications`, {
    method: 'POST', cookie: adminCookie,
    body: {
      outcome: 'eficaz',
      description: 'Três rondas seguidas com todos os pontos de verificação registrados.',
      evidence_type: 'referencia_documental',
      evidence_reference: 'ATA-QA-UX07-001',
      evidence_source: 'Reunião interna de qualidade',
    },
  });
  assert.equal(verificada.status, 201, `verificação deveria ser 201, veio ${verificada.status} ${JSON.stringify(verificada.body)}`);

  const encerrada = await api(`/api/ext/quality/nonconformities/${closedId}/close`, {
    method: 'POST', cookie: adminCookie,
    body: {
      verification_id: verificada.body.verification.id,
      closure_note: 'Encerrada com evidência declarada e responsável canônico pelo gate.',
    },
  });
  assert.equal(encerrada.status, 200, `encerramento deveria ser 200, veio ${encerrada.status} ${JSON.stringify(encerrada.body)}`);
  assert.equal(encerrada.body.nonconformity.status, 'encerrada');

  // Segunda NC: permanece aberta e vazia, para provar ausência honesta.
  const aberta = await api('/api/ext/quality/nonconformities', {
    method: 'POST', cookie: adminCookie,
    body: {
      title: 'Checklist de viatura entregue fora do prazo',
      description: 'Registro aberto do gate para provar que ausência não vira data nem zero.',
      category: 'documentação',
      severity: 'media',
      client_account_id: '',
    },
  });
  assert.equal(aberta.status, 201);
  openId = aberta.body.nonconformity.id;
  protocolAberta = aberta.body.nonconformity.protocol;

  // A página precisa estar compilada antes de qualquer medição no navegador.
  for (const route of ['/admin/entrar', '/admin/qualidade']) {
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

test('a rota canônica de qualidade continua exigindo sessão, sem mudança de contrato', { skip: !RUN }, async () => {
  const anonimo = await api('/api/ext/quality/nonconformities');
  assert.equal(anonimo.status, 401);
  assert.equal(anonimo.body.error, 'unauthorized');
  assert.ok(!('nonconformities' in (anonimo.body || {})), 'a negativa não pode vazar registro algum');

  // Idempotência e proteção de origem seguem intactas nesta fatia.
  assert.equal((await api('/api/ext/quality/nonconformities', {
    method: 'POST', cookie: adminCookie, idempotencyKey: null, body: {},
  })).status, 400);
  assert.equal((await api('/api/ext/quality/nonconformities', {
    method: 'POST', cookie: adminCookie, headers: { origin: 'https://attacker.invalid' }, body: {},
  })).status, 403);
});

test('menu não é autorização: ti abre a tela e quem recusa é o servidor', { skip: !RUN }, async () => {
  // Antes da revogação o papel `ti` lê normalmente, com o grant provisionado.
  assert.equal((await api('/api/ext/quality/nonconformities', { cookie: tiCookie })).status, 200);

  await revokeGrant(tiStaff.id, 'quality.write', adminStaff.id);
  const escritaNegada = await api('/api/ext/quality/nonconformities', {
    method: 'POST', cookie: tiCookie,
    body: {
      title: 'Tentativa sem permissão de escrita',
      description: 'O servidor precisa recusar esta criação sem o grant quality.write.',
      category: 'processo',
      severity: 'baixa',
      client_account_id: '',
    },
  });
  assert.equal(escritaNegada.status, 403, 'sem quality.write o servidor recusa a escrita');
  assert.equal(escritaNegada.body.error, 'forbidden');
  assert.ok(!('nonconformity' in (escritaNegada.body || {})), 'a negativa não pode vazar o registro');

  await revokeGrant(tiStaff.id, 'quality.read', adminStaff.id);
  const leituraNegada = await api('/api/ext/quality/nonconformities', { cookie: tiCookie });
  assert.equal(leituraNegada.status, 403, 'sem quality.read o servidor recusa a leitura');
  assert.equal(leituraNegada.body.error, 'forbidden');
  assert.ok(!('nonconformities' in (leituraNegada.body || {})), 'a negativa não pode vazar a lista');

  // `admin` segue com tudo: esta fatia não mexeu em permissão nenhuma.
  assert.equal((await api('/api/ext/quality/nonconformities', { cookie: adminCookie })).status, 200);
  assert.equal((await api(`/api/ext/quality/nonconformities/${closedId}`, { cookie: adminCookie })).status, 200);
});

test('browser: recusa do servidor vira estado NEGADO, não lista vazia nem zero', { skip: !RUN }, async () => {
  // Pré-condição explícita, para o teste não depender da ordem de execução:
  // garante a revogação e confirma com o próprio servidor que ele recusa.
  await revokeGrantIfActive(tiStaff.id, 'quality.read', adminStaff.id);
  const negadaHttp = await api('/api/ext/quality/nonconformities', { cookie: tiCookie });
  assert.equal(negadaHttp.status, 403, 'pré-condição: o servidor precisa estar recusando a leitura do papel ti');

  await comNavegador(async browser => {
    // O papel `ti` continua em allowedRoles do AdminGate e abre a tela; só a
    // permissão granular foi revogada.
    const { context, page } = await abrir(browser, tiCookie);
    const lista = page.locator('[data-testid="quality-list"]');
    await lista.waitFor();
    const negado = lista.locator('[data-ui-state="denied"]');
    await negado.waitFor();
    const texto = await negado.textContent();
    assert.match(texto, /permissão granular/i, 'a recusa explica que falta permissão, não que não há dado');
    assert.match(texto, /\(forbidden\)/, 'o código canônico fica disponível para diagnóstico');

    assert.equal(await lista.locator('[data-ui-state="empty"]').count(), 0, 'recusa não pode ser confundida com vazio');
    assert.equal(await page.locator('[data-testid="quality-list-table"]').count(), 0, 'nenhuma tabela vazia é renderizada');
    assert.equal(await page.locator('[data-testid="quality-metrics"]').count(), 0, 'nenhuma métrica zero é renderizada');

    await capture(page, 'desktop-qualidade-negado');
    await context.close();
  });
});

test('browser: falha de leitura NÃO vira "nenhuma não conformidade" nem métrica zero', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie, {
      failRoutes: ['/api/ext/quality/nonconformities'], status: 503, code: 'quality_journey_unavailable',
    });
    const lista = page.locator('[data-testid="quality-list"]');
    await lista.waitFor();
    const erro = lista.locator('[data-ui-state="error"]');
    await erro.waitFor();
    const texto = await erro.textContent();
    assert.match(texto, /não significa que não existam não conformidades/i, 'a falha nega explicitamente a lista vazia');
    assert.match(texto, /\(quality_journey_unavailable\)/, 'o código canônico fica disponível');
    assert.ok(await erro.locator('button').count() >= 1, 'falha transitória precisa oferecer nova tentativa');

    assert.equal(await lista.locator('[data-ui-state="empty"]').count(), 0, 'falha não pode virar vazio');
    assert.equal(await page.locator('[data-testid="quality-list-table"]').count(), 0, 'nenhuma tabela vazia é renderizada');
    assert.equal(await page.locator('[data-testid="quality-metrics"]').count(), 0, 'nenhuma métrica zero é renderizada');

    await capture(page, 'desktop-qualidade-falha-leitura');
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
    assert.equal(await abas.first().getAttribute('aria-controls'), 'quality-panel-lista');

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

    await capture(page, 'desktop-qualidade-abas');
    await context.close();
  });
});

test('browser: a jornada real aparece em português, sem valor cru do banco', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie);
    const tabela = page.locator('[data-testid="quality-list-table"]');
    await tabela.waitFor();

    // textContent, e não innerText: o prefixo de leitor de tela do UiBadge é
    // recortado por CSS e não entra no texto renderizado.
    const textoTabela = await tabela.textContent();
    assert.match(textoTabela, /Encerrada/, 'a situação `encerrada` é exibida em português');
    assert.match(textoTabela, /Aberta/, 'a situação `aberta` é exibida em português');
    assert.match(textoTabela, /Alta/, 'a gravidade `alta` é exibida em português');
    assert.match(textoTabela, /Sem conta \(escopo global\)/, 'registro sem conta diz o escopo, não inventa cliente');
    assert.doesNotMatch(textoTabela, /em_analise|em_acao_corretiva|jornada_canonica|registro_legado/,
      'nenhum valor cru do banco na lista');
    assert.doesNotMatch(textoTabela, /01\/01\/1970/, 'ausência nunca vira data inicial');

    // Abrir o ciclo de vida da NC encerrada e conferir o detalhe.
    await page.getByRole('row', { name: new RegExp(protocolEncerrada) })
      .getByRole('button', { name: 'Abrir ciclo de vida' }).click();
    const detalhe = page.locator('[data-testid="quality-detail"]');
    await detalhe.waitFor();
    const textoDetalhe = await detalhe.textContent();
    assert.match(textoDetalhe, /Jornada canônica EXT-05/, 'a origem sai em português');
    assert.match(textoDetalhe, /Encerrada/);
    assert.doesNotMatch(textoDetalhe, /jornada_canonica/, 'nenhum valor cru de origem no detalhe');
    assert.doesNotMatch(textoDetalhe, /Encerramento pendente/, 'esta NC foi encerrada e a data real aparece');

    // Ações e verificações da jornada real, em português.
    const acoes = await page.locator('[data-testid="quality-actions-table"]').textContent();
    assert.match(acoes, /Concluída/, 'a situação `concluida` da ação sai em português');
    assert.match(acoes, /Finalizada e imutável/, 'ação terminal não oferece botão de mutação');
    assert.doesNotMatch(acoes, /concluida|pendente/, 'nenhum valor cru de situação de ação');

    const verificacoes = await page.locator('[data-testid="quality-verifications"]').textContent();
    assert.match(verificacoes, /Eficaz/, 'o resultado `eficaz` sai em português');
    assert.match(verificacoes, /ATA-QA-UX07-001/, 'a referência declarada aparece como veio');

    // Trilha imutável em português nos rótulos; o resumo é texto do servidor.
    await page.getByRole('tab', { name: 'Trilha e reincidência', exact: true }).click();
    const trilha = page.locator('[data-testid="quality-events"]');
    await trilha.waitFor();
    const textoTrilha = await trilha.textContent();
    assert.match(textoTrilha, /Não conformidade criada/, 'o evento de criação sai em português');
    assert.match(textoTrilha, /Encerrada com evidência e responsável/, 'o evento de encerramento sai em português');
    assert.match(textoTrilha, /Causa registrada/, 'o evento de causa sai em português');
    assert.doesNotMatch(textoTrilha, /nao_conformidade_criada|acao_corretiva_criada|cause_registrada/,
      'nenhum event_type cru na trilha');

    const historico = await page.locator('[data-testid="quality-history"]').textContent();
    assert.match(historico, /Encerramento com evidência e responsável/);
    assert.match(historico, /Encerrada com evidência declarada e responsável canônico pelo gate\./);

    await capture(page, 'desktop-qualidade-jornada');
    await context.close();
  });
});

test('browser: ausência honesta na NC aberta, sem causa, ação ou verificação', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie);
    await page.locator('[data-testid="quality-list-table"]').waitFor();
    await page.getByRole('tab', { name: 'Ciclo de vida e registros', exact: true }).click();
    await page.locator('#quality-selected').selectOption(openId);
    const detalhe = page.locator('[data-testid="quality-detail"]');
    await detalhe.waitFor();
    const texto = await detalhe.textContent();
    assert.match(texto, new RegExp(protocolAberta));
    assert.match(texto, /Encerramento pendente/, 'encerramento ausente é dito, não datado');
    assert.match(texto, /Dado ausente/, 'reabertura ausente aparece como ausência');
    assert.doesNotMatch(texto, /01\/01\/1970/, 'ausência nunca vira 01/01/1970');

    const causas = page.locator('[data-testid="quality-causes"]');
    const vazioCausas = causas.locator('[data-ui-state="empty"]');
    await vazioCausas.waitFor();
    assert.match(await vazioCausas.textContent(), /A leitura funcionou/i, 'vazio honesto diz que a leitura funcionou');
    assert.equal(await causas.locator('[data-ui-state="error"]').count(), 0,
      'lista vazia não pode ser confundida com falha');
    await page.locator('[data-testid="quality-actions-card"] [data-ui-state="empty"]').waitFor();
    await page.locator('[data-testid="quality-verifications"] [data-ui-state="empty"]').waitFor();

    await capture(page, 'desktop-qualidade-ausencia-honesta');
    await context.close();
  });
});

test('browser: em 390px a tela de qualidade não produz transbordo horizontal', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie, { width: 390, height: 844 });
    await page.locator('[data-testid="quality-list-table"]').waitFor();
    await page.waitForTimeout(600);
    const transbordo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(transbordo <= 1, `transbordo de ${transbordo}px em /admin/qualidade`);
    await capture(page, 'mobile-qualidade-390px');
    await context.close();
  });
});
