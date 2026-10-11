// UX-07 / EXT-07 — gate da tela /admin/compliance, por HTTP real contra
// PostgreSQL real (executado por scripts/qa-ux-compliance-postgres.mjs, que
// sobe um cluster descartável) e por Chromium real.
//
// O que este gate prova:
//  - a rota canônica continua respondendo 401 sem sessão, sem vazar
//    registro algum na negativa, e 400 sem `idempotency-key`, e 403 de
//    origem cruzada;
//  - "menu não é autorização": o papel `marcelo` está em `allowedRoles` do
//    AdminGate de /admin/compliance e abre a tela, mas o servidor canônico
//    aceita somente `admin` e `ti` — ele recusa sozinho com 403 `forbidden`,
//    na leitura e na escrita, enquanto `admin` e `ti` seguem autorizados.
//    EXT-07 não usa permissão granular por grant; nenhum papel foi alargado;
//  - o defeito central desta fatia: a leitura que falhava virava
//    "Nenhuma obrigação" com indicadores zerados. Agora falha é estado
//    próprio, diz que NÃO significa ausência de registros, mostra o código
//    canônico e oferece repetir — e nenhum indicador zero é renderizado;
//  - vazio legítimo não é apresentado como falha;
//  - as cinco abas são um tablist de verdade, com roving tabindex e teclado;
//  - o vocabulário em português aparece no lugar do valor cru do banco
//    (`a_vencer`, `ext07_canonica`, `concluido`, `corretivo`);
//  - ausência honesta: plano aberto sem conclusão mostra "Conclusão pendente"
//    e "Dado ausente", nunca 01/01/1970;
//  - a jornada canônica real (obrigação → referência declarada → avaliação
//    temporal → tarefa de vencimento → plano de ação → renovação) criada
//    pelas PRÓPRIAS APIs canônicas;
//  - 390px não produz transbordo horizontal.
//
// O que este gate NÃO prova: aceite humano, homologação de Marcelo/Andreia,
// nem o caminho legado somente-leitura. Ver pendências em
// docs/UX-07-COMPLIANCE-2026-10-06.md.
//
// Nenhuma asserção é enfraquecida: a falha de leitura é injetada apenas em
// `window.fetch`, dentro da própria página (`page.addInitScript`). O servidor
// nunca é alterado para o teste passar, e `ERR_ASSERTION` nunca é repetido.
// O scheduler de fundo não é tocado nem ligado por este gate.

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
let adminCookie, tiCookie, marceloCookie;
let adminStaff, tiStaff, marceloStaff;
let obligationVencidaId, obligationVigenteId;
let protocoloVencido, protocoloVigente;
let planoAbertoId;

const key = label => `ext07-ux-${label}-${randomUUID()}`;

// As datas da massa são ancoradas no relógio do SERVIDOR, não no do processo
// de teste: o servidor decide validade por CURRENT_DATE, e uma diferença de
// fuso entre runner e banco tornaria a massa incoerente com a regra real.
// Ler a data do banco é leitura de relógio, não criação de massa por SQL.
let hoje = new Date();
const iso = date => date.toISOString().slice(0, 10);
const diasAtras = dias => iso(new Date(hoje.getTime() - dias * 86_400_000));
const diasAFrente = dias => iso(new Date(hoje.getTime() + dias * 86_400_000));

// Marca de progresso do preparo: quando o gate falha em CI, ela diz em qual
// etapa parou. Não altera asserção alguma.
const etapa = nome => console.log(`UX_COMPLIANCE_SETUP: ${nome}`);

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
      console.log(`UX_COMPLIANCE_BROWSER_RETRY tentativa=${tentativa}: ${String(erro.message).split('\n')[0]}`);
    } finally {
      await browser.close().catch(() => {});
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw ultimo;
}

const evidenceDir = process.env.UX_COMPLIANCE_EVIDENCE_DIR || '';
async function capture(page, nome) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage: true });
}

/**
 * Abre /admin/compliance já autenticada. `failRoutes` derruba, dentro da
 * própria página, as respostas indicadas: `page.route()` é instável com este
 * Chromium empacotado, então a substituição é feita em `window.fetch`, como
 * nos demais gates. O servidor NUNCA é enfraquecido.
 */
async function abrir(browser, cookie, { width = 1440, height = 900, failRoutes = [], status = 503, code = 'compliance_journey_unavailable' } = {}) {
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
  await page.goto(`${baseUrl}/admin/compliance`, { waitUntil: 'domcontentloaded' });
  // O h1 real é a marca de que a página de produto montou. Esperar só o
  // tablist mede a tela antes de a leitura terminar.
  await page.getByRole('heading', { level: 1, name: /Compliance corporativo e obrigações internas/ }).waitFor();
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
      NEXT_DIST_DIR: '.next/integration-ux-compliance',
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      EMPLOYEE_SESSION_SECRET: randomUUID().repeat(2),
      CLIENT_MFA_ENCRYPTION_KEY: Buffer.from(randomUUID()).toString('base64url').slice(0, 43),
      ADMIN_LOGIN_MAX_ATTEMPTS: '200',
      SITE_ADMIN_LEGACY_TOKENS: '',
      OLLAMA_ENABLED: 'false',
      MAIL_HOST: '',
      NEXT_TELEMETRY_DISABLED: '1',
      // O agendador de fundo permanece desligado: este gate exercita a
      // avaliação temporal EXPLÍCITA, não a execução agendada.
      EXT07_EVALUATE_INTERVAL_SECONDS: '',
      EXT07_EVALUATE_IDENTITY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', () => {});
  await waitForServer(baseUrl);
  etapa('servidor no ar');
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  hoje = new Date(`${(await pool.query('SELECT CURRENT_DATE::text AS hoje')).rows[0].hoje}T12:00:00.000Z`);
  etapa(`data-base do servidor ${iso(hoje)}`);

  // `admin`, `ti` e `marcelo` estão em allowedRoles do AdminGate; o servidor
  // canônico aceita somente `admin` e `ti`. Nenhum grant é necessário nesta
  // família (EXT-07 decide por sessão e papel), e nada foi alargado.
  adminStaff = await provisionStaff(pool, { role: 'admin' });
  tiStaff = await provisionStaff(pool, { role: 'ti' });
  marceloStaff = await provisionStaff(pool, { role: 'marcelo' });
  adminCookie = await loginStaffHttp(adminStaff.email);
  tiCookie = await loginStaffHttp(tiStaff.email);
  marceloCookie = await loginStaffHttp(marceloStaff.email);
  etapa('identidades provisionadas');

  // Massa fictícia criada pelas PRÓPRIAS APIs canônicas, por HTTP: nada é
  // inserido por SQL de negócio.
  const obrigacaoVencida = await api('/api/ext/compliance/obligations', {
    method: 'POST', cookie: adminCookie,
    body: {
      obligation_type: 'alvara',
      title: 'Alvará de funcionamento da base operacional',
      description: 'Massa fictícia do gate UX-07 compliance; declaração interna de aplicabilidade, sem dado pessoal real.',
      declared_source: 'Checklist interno de obrigações da operação',
      applicability_scope: 'Base operacional própria',
      applicability_justification: 'A base recebe equipe e viaturas, então a obrigação é declarada aplicável pela equipe interna.',
      validity_rule: 'Vencimento declarado no próprio registro, avaliado na data do servidor.',
      criticality: 'critica',
      renewal_lead_days: 30,
      responsible_identity: adminStaff.id,
    },
  });
  assert.equal(obrigacaoVencida.status, 201, `obrigação deveria ser 201, veio ${obrigacaoVencida.status} ${JSON.stringify(obrigacaoVencida.body)}`);
  obligationVencidaId = obrigacaoVencida.body.obligation.id;

  const refVencida = await api('/api/ext/compliance/documents', {
    method: 'POST', cookie: adminCookie,
    body: {
      obligation_id: obligationVencidaId,
      title: 'Referência declarada do alvará da base',
      description: 'Referência declarada pela equipe para o alvará da base operacional; não é arquivo nem upload.',
      compliance_type: 'alvara',
      issue_date: diasAtras(400),
      expiry_date: diasAtras(5),
      reference_type: 'registro_publico_declarado',
      declared_reference: 'ALV-UX07-0001',
      reference_source: 'Pasta física da administração',
      document_number: 'ALV-0001',
      issuer: 'Prefeitura declarada',
    },
  });
  assert.equal(refVencida.status, 201, `referência deveria ser 201, veio ${refVencida.status} ${JSON.stringify(refVencida.body)}`);
  protocoloVencido = refVencida.body.document.protocol;
  etapa('obrigação e referência vencida');

  // Segunda obrigação, com referência corrente a vencer: prova "A vencer".
  const obrigacaoVigente = await api('/api/ext/compliance/obligations', {
    method: 'POST', cookie: adminCookie,
    body: {
      obligation_type: 'seguro',
      title: 'Seguro de responsabilidade civil da operação',
      description: 'Massa fictícia do gate UX-07 compliance para o caso de referência ainda dentro da antecedência de renovação.',
      declared_source: 'Checklist interno de obrigações da operação',
      applicability_scope: 'Contratos de vigilância patrimonial',
      applicability_justification: 'A equipe declara a cobertura aplicável aos contratos vigentes de vigilância patrimonial.',
      validity_rule: 'Vencimento declarado no próprio registro, avaliado na data do servidor.',
      criticality: 'alta',
      renewal_lead_days: 60,
      responsible_identity: adminStaff.id,
    },
  });
  assert.equal(obrigacaoVigente.status, 201);
  obligationVigenteId = obrigacaoVigente.body.obligation.id;

  const refVigente = await api('/api/ext/compliance/documents', {
    method: 'POST', cookie: adminCookie,
    body: {
      obligation_id: obligationVigenteId,
      title: 'Referência declarada da apólice de responsabilidade civil',
      description: 'Referência declarada pela equipe para a apólice vigente; declaração rastreável, nunca arquivo verificado.',
      compliance_type: 'seguro',
      issue_date: diasAtras(300),
      expiry_date: diasAFrente(20),
      reference_type: 'numero_declarado',
      declared_reference: 'APOLICE-UX07-0002',
      reference_source: 'Corretora declarada pela administração',
    },
  });
  assert.equal(refVigente.status, 201, `referência vigente deveria ser 201, veio ${refVigente.status} ${JSON.stringify(refVigente.body)}`);
  protocoloVigente = refVigente.body.document.protocol;
  etapa('obrigação e referência a vencer');

  // Avaliação temporal EXPLÍCITA na data do servidor: é ela que gera a tarefa
  // de vencimento e marca a referência a vencer.
  const avaliacao = await api('/api/ext/compliance/evaluate', { method: 'POST', cookie: adminCookie, body: {} });
  assert.equal(avaliacao.status, 200, `avaliação deveria ser 200, veio ${avaliacao.status} ${JSON.stringify(avaliacao.body)}`);
  assert.equal(avaliacao.body.source, 'server_date', 'a data-base é sempre a do servidor');
  assert.ok(avaliacao.body.facts.tasks_created >= 1, 'o vencimento precisa gerar ao menos uma tarefa');
  assert.ok(avaliacao.body.facts.documents_marked_a_vencer >= 1, 'a referência dentro da antecedência precisa virar a_vencer');
  etapa('avaliação temporal explícita');

  // Plano de ação corretivo para a obrigação vencida; fica ABERTO para provar
  // ausência honesta de conclusão.
  const plano = await api('/api/ext/compliance/action-plans', {
    method: 'POST', cookie: adminCookie,
    body: {
      obligation_id: obligationVencidaId,
      plan_type: 'corretivo',
      title: 'Protocolar renovação do alvará da base',
      description: 'Plano corretivo do gate: protocolar a renovação e acompanhar até a nova referência declarada.',
      root_cause: 'Pedido de renovação não foi protocolado dentro da antecedência declarada.',
      due_date: diasAFrente(15),
      responsible_identity: adminStaff.id,
    },
  });
  assert.equal(plano.status, 201, `plano deveria ser 201, veio ${plano.status} ${JSON.stringify(plano.body)}`);
  planoAbertoId = plano.body.action_plan.id;

  // Segundo plano, preventivo, levado até a conclusão real pela própria API.
  const planoPreventivo = await api('/api/ext/compliance/action-plans', {
    method: 'POST', cookie: adminCookie,
    body: {
      obligation_id: obligationVigenteId,
      plan_type: 'preventivo',
      title: 'Antecipar cotação da apólice antes do vencimento',
      description: 'Plano preventivo do gate: cotar a renovação da apólice antes do vencimento declarado.',
      due_date: diasAFrente(10),
      responsible_identity: adminStaff.id,
    },
  });
  assert.equal(planoPreventivo.status, 201);
  const iniciado = await api(`/api/ext/compliance/action-plans/${planoPreventivo.body.action_plan.id}/start`, {
    method: 'POST', cookie: adminCookie, body: {},
  });
  assert.equal(iniciado.status, 200, `início do plano deveria ser 200, veio ${iniciado.status}`);
  const concluido = await api(`/api/ext/compliance/action-plans/${planoPreventivo.body.action_plan.id}/complete`, {
    method: 'POST', cookie: adminCookie,
    body: { result: 'Cotação concluída e renovação encaminhada pela administração, registrada pelo gate.' },
  });
  assert.equal(concluido.status, 200, `conclusão do plano deveria ser 200, veio ${concluido.status} ${JSON.stringify(concluido.body)}`);
  assert.equal(concluido.body.action_plan.status, 'concluido');
  etapa('planos de ação');

  // Renovação real da referência vencida: cria versão 2 e torna a anterior
  // histórico imutável (`substituida`).
  const renovada = await api(`/api/ext/compliance/documents/${refVencida.body.document.id}/renew`, {
    method: 'POST', cookie: adminCookie,
    body: {
      issue_date: diasAtras(1),
      expiry_date: diasAFrente(365),
      reference_type: 'registro_publico_declarado',
      declared_reference: 'ALV-UX07-0001-R2',
      reference_source: 'Pasta física da administração',
      justification: 'Renovação protocolada e declarada pela administração; registro anterior preservado como histórico.',
    },
  });
  assert.equal(renovada.status, 201, `renovação deveria ser 201, veio ${renovada.status} ${JSON.stringify(renovada.body)}`);
  assert.equal(renovada.body.document.version_no, 2);
  assert.equal(renovada.body.previous.status, 'substituida');
  etapa('renovação versionada');

  // A página precisa estar compilada antes de qualquer medição no navegador.
  for (const route of ['/admin/entrar', '/admin/compliance']) {
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
  if (server && !server.killed) { server.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); server.kill('SIGKILL'); }
});

test('a rota canônica de compliance continua exigindo sessão, sem mudança de contrato', { skip: !RUN }, async () => {
  const anonimo = await api('/api/ext/compliance/obligations');
  assert.equal(anonimo.status, 401);
  assert.equal(anonimo.body.error, 'unauthorized');
  assert.ok(!('items' in (anonimo.body || {})), 'a negativa não pode vazar registro algum');

  // Idempotência e proteção de origem seguem intactas nesta fatia.
  assert.equal((await api('/api/ext/compliance/obligations', {
    method: 'POST', cookie: adminCookie, idempotencyKey: null, body: {},
  })).status, 400);
  assert.equal((await api('/api/ext/compliance/obligations', {
    method: 'POST', cookie: adminCookie, headers: { origin: 'https://attacker.invalid' }, body: {},
  })).status, 403);

  // A escrita legada continua aposentada; a leitura legada segue religada e
  // NÃO é consumida por esta tela.
  const legadaEscrita = await api('/api/ext/compliance-documents', { method: 'POST', cookie: adminCookie, body: {} });
  assert.equal(legadaEscrita.status, 410);
  assert.equal(legadaEscrita.body.error, 'legacy_writer_retired');
  assert.equal((await api('/api/ext/compliance-documents', { cookie: adminCookie })).status, 200);
});

test('menu não é autorização: marcelo abre a tela e quem recusa é o servidor', { skip: !RUN }, async () => {
  // `admin` e `ti` são os papéis aceitos pelo servidor canônico.
  assert.equal((await api('/api/ext/compliance/obligations', { cookie: adminCookie })).status, 200);
  assert.equal((await api('/api/ext/compliance/obligations', { cookie: tiCookie })).status, 200);

  // `marcelo` está no AdminGate da página, mas o servidor recusa sozinho.
  const leituraNegada = await api('/api/ext/compliance/obligations', { cookie: marceloCookie });
  assert.equal(leituraNegada.status, 403, 'o servidor recusa o papel que o menu deixaria entrar');
  assert.equal(leituraNegada.body.error, 'forbidden');
  assert.ok(!('items' in (leituraNegada.body || {})), 'a negativa não pode vazar registro algum');

  const escritaNegada = await api('/api/ext/compliance/obligations', {
    method: 'POST', cookie: marceloCookie,
    body: { obligation_type: 'licenca', title: 'Tentativa sem papel autorizado', description: 'O servidor precisa recusar esta criação.' },
  });
  assert.equal(escritaNegada.status, 403);
  assert.equal(escritaNegada.body.error, 'forbidden');
  assert.ok(!('obligation' in (escritaNegada.body || {})), 'a negativa não pode vazar o registro');
});

test('browser: recusa do servidor vira estado NEGADO, nunca lista vazia', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    // `marcelo` continua em allowedRoles do AdminGate e abre a tela; quem
    // recusa é o servidor canônico.
    const { context, page } = await abrir(browser, marceloCookie);
    const painel = page.locator('[data-testid="compliance-obligations"]');
    await painel.waitFor();
    const negado = painel.locator('[data-ui-state="denied"]').first();
    await negado.waitFor();
    const texto = await negado.textContent();
    assert.match(texto, /Papel sem acesso ao compliance/i, 'a recusa explica o papel, não diz que não há dado');
    assert.match(texto, /\(forbidden\)/, 'o código canônico fica disponível para diagnóstico');

    assert.equal(await painel.locator('[data-ui-state="empty"]').count(), 0, 'recusa não pode ser confundida com vazio');
    assert.equal(await page.locator('[data-testid="compliance-obligations-table"]').count(), 0, 'nenhuma tabela vazia é renderizada');
    assert.equal(await page.locator('[data-testid="compliance-obligation-metrics"]').count(), 0, 'nenhum indicador zero é renderizado');

    await capture(page, 'desktop-compliance-negado');
    await context.close();
  });
});

test('browser: falha de leitura NÃO vira "nenhuma obrigação" nem indicador zero', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie, {
      failRoutes: ['/api/ext/compliance/obligations'], status: 503, code: 'compliance_journey_unavailable',
    });
    const painel = page.locator('[data-testid="compliance-obligations"]');
    await painel.waitFor();
    const erro = page.locator('[data-testid="compliance-obligations-error"] [data-ui-state="error"]');
    await erro.waitFor();
    const texto = await erro.textContent();
    assert.match(texto, /não significa que não existam obrigações declaradas/i, 'a falha nega explicitamente a lista vazia');
    assert.match(texto, /\(compliance_journey_unavailable\)/, 'o código canônico fica disponível');
    assert.ok(await erro.locator('button').count() >= 1, 'falha transitória precisa oferecer nova tentativa');

    assert.equal(await page.locator('[data-testid="compliance-obligations-table"]').count(), 0, 'nenhuma tabela vazia é renderizada');
    assert.equal(await page.locator('[data-testid="compliance-obligation-metrics"]').count(), 0, 'nenhum indicador zero é renderizado');

    // A falha de UMA leitura não contamina a outra: a tabela de referências,
    // que tem estado próprio, continua montada.
    await page.locator('[data-testid="compliance-documents-table"]').waitFor();

    await capture(page, 'desktop-compliance-falha-leitura');
    await context.close();
  });
});

test('browser: as cinco abas são um tablist de verdade, com teclado', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie);
    await page.locator('[role="tablist"]').waitFor();

    const abas = page.getByRole('tab');
    assert.equal(await abas.count(), 5, 'a jornada tem cinco frentes de trabalho');
    assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1, 'roving tabindex: só uma aba tabulável');
    assert.equal(await page.locator('[role="tab"][tabindex="-1"]').count(), 4);
    assert.equal(await page.locator('[role="tabpanel"]').count(), 1, 'só o painel ativo fica montado');
    assert.equal(await page.locator('[role="tablist"] [aria-pressed]').count(), 0, 'aria-pressed não substitui tab');
    // O seletor de tema do chrome administrativo é um toggle legítimo e carrega
    // aria-pressed em todo /admin/*; a regra vale para a faixa de abas e para
    // qualquer outro controle da tela, não para o chrome compartilhado.
    assert.equal(await page.locator('[aria-pressed]:not([data-admin-theme-toggle="true"])').count(), 0,
      'fora do seletor de tema, nenhum controle desta tela usa aria-pressed');
    assert.equal(await abas.first().getAttribute('aria-controls'), 'compliance-panel-obrigacoes');

    await abas.first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await abas.nth(1).getAttribute('aria-selected'), 'true');
    assert.equal(await abas.nth(1).evaluate(el => el === document.activeElement), true,
      'a seta precisa mover o foco junto com a seleção');
    await page.keyboard.press('End');
    assert.equal(await abas.nth(4).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await abas.nth(0).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await abas.nth(4).getAttribute('aria-selected'), 'true', '← na primeira aba volta para a última');

    await capture(page, 'desktop-compliance-abas');
    await context.close();
  });
});

test('browser: a jornada real aparece em português, sem valor cru do banco', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie);
    const obrigacoes = page.locator('[data-testid="compliance-obligations-table"]');
    await obrigacoes.waitFor();

    // textContent, e não innerText: o prefixo de leitor de tela do UiBadge é
    // recortado por CSS e não entra no texto renderizado.
    const textoObrigacoes = await obrigacoes.textContent();
    assert.match(textoObrigacoes, /Crítica/, 'a criticidade sai em português');
    assert.match(textoObrigacoes, /Vigente|A vencer|Vencida/, 'a situação da obrigação sai em português');
    assert.doesNotMatch(textoObrigacoes, /a_vencer|em_renovacao|nao_aplicavel|critica/,
      'nenhum valor cru do banco na lista de obrigações');
    assert.doesNotMatch(textoObrigacoes, /01\/01\/1970/, 'ausência nunca vira data inicial');

    const documentos = await page.locator('[data-testid="compliance-documents-table"]').textContent();
    assert.match(documentos, new RegExp(protocoloVencido), 'a referência renovada mantém o protocolo anterior na lista');
    assert.match(documentos, new RegExp(protocoloVigente));
    assert.match(documentos, /Substituída por renovação/, 'a versão anterior aparece como substituída, em português');
    assert.match(documentos, /A vencer/, 'a referência dentro da antecedência aparece como a vencer');
    assert.match(documentos, /Jornada canônica EXT-07/, 'a origem sai em português');
    assert.doesNotMatch(documentos, /ext07_canonica|substituida|a_vencer/, 'nenhum valor cru de situação ou origem');

    // Detalhe da referência declarada: fronteira documental explícita.
    await page.getByRole('row', { name: new RegExp(protocoloVigente) })
      .getByRole('button', { name: 'Ver referência declarada' }).click();
    const detalhe = page.locator('[data-testid="compliance-document-detail"]');
    await detalhe.waitFor();
    // O cartão existe já no estado de carregando: esperar só por ele mediria a
    // tela antes de a leitura terminar. A espera é pelo conteúdo carregado.
    await detalhe.getByText('APOLICE-UX07-0002').waitFor();
    const textoDetalhe = await detalhe.textContent();
    assert.match(textoDetalhe, /Número declarado/, 'o tipo de referência sai em português');
    assert.match(textoDetalhe, /APOLICE-UX07-0002/, 'a referência declarada aparece como veio');
    assert.match(textoDetalhe, /referencia_declarada_nao_arquivo_verificado/, 'a fronteira documental do servidor é citada');
    assert.doesNotMatch(textoDetalhe, /numero_declarado/, 'nenhum valor cru de tipo de referência');

    // Tarefas de vencimento geradas pela avaliação temporal do servidor.
    await page.getByRole('tab', { name: 'Tarefas de vencimento', exact: true }).click();
    const tarefas = page.locator('[data-testid="compliance-tasks-table"]');
    await tarefas.waitFor();
    const textoTarefas = await tarefas.textContent();
    assert.match(textoTarefas, /Aberta/, 'a situação da tarefa sai em português');
    assert.match(textoTarefas, /expiry_at_or_before_evaluation_date/, 'a regra aplicada é a do servidor, mostrada como veio');
    assert.doesNotMatch(textoTarefas, /\baberta\b/, 'nenhum valor cru de situação de tarefa');

    // Planos de ação, incluindo o concluído pela própria API.
    await page.getByRole('tab', { name: 'Planos de ação', exact: true }).click();
    const planos = page.locator('[data-testid="compliance-plans-table"]');
    await planos.waitFor();
    const textoPlanos = await planos.textContent();
    assert.match(textoPlanos, /Corretivo/, 'o tipo corretivo sai em português');
    assert.match(textoPlanos, /Preventivo/, 'o tipo preventivo sai em português');
    assert.match(textoPlanos, /Concluído/, 'a situação concluida sai em português');
    assert.match(textoPlanos, /Finalizado e imutável/, 'plano terminal não oferece botão de mutação');
    assert.doesNotMatch(textoPlanos, /corretivo|preventivo|concluido|em_andamento/, 'nenhum valor cru de plano');

    // Trilha imutável em português nos rótulos.
    await page.getByRole('row', { name: /Antecipar cotação da apólice/ })
      .getByRole('button', { name: 'Ver trilha do plano' }).click();
    const trilha = page.locator('[data-testid="compliance-plan-events"]');
    await trilha.waitFor();
    const textoTrilha = await trilha.textContent();
    assert.match(textoTrilha, /Plano de ação registrado/, 'o evento de criação sai em português');
    assert.match(textoTrilha, /Plano de ação concluído/, 'o evento de conclusão sai em português');
    assert.doesNotMatch(textoTrilha, /action_plan_created|action_plan_complete/, 'nenhum event_type cru na trilha');

    await capture(page, 'desktop-compliance-jornada');
    await context.close();
  });
});

test('browser: ausência honesta no plano aberto e vazio honesto na execução agendada', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie);
    await page.locator('[data-testid="compliance-obligations-table"]').waitFor();
    await page.getByRole('tab', { name: 'Planos de ação', exact: true }).click();
    await page.locator('[data-testid="compliance-plans-table"]').waitFor();
    await page.getByRole('row', { name: /Protocolar renovação do alvará/ })
      .getByRole('button', { name: 'Ver trilha do plano' }).click();
    const detalhe = page.locator('[data-testid="compliance-plan-detail"]');
    await detalhe.waitFor();
    // Mesma lição: o cartão monta já em "Carregando". A trilha do plano só
    // existe depois da leitura concluída, então é ela que marca o fim.
    await page.locator('[data-testid="compliance-plan-events"]').waitFor();
    const texto = await detalhe.textContent();
    assert.match(texto, /Conclusão pendente/, 'conclusão ausente é dita, não datada');
    assert.match(texto, /Início pendente/, 'início ausente é dito, não datado');
    assert.match(texto, /Dado ausente/, 'resultado ausente aparece como ausência');
    assert.doesNotMatch(texto, /01\/01\/1970/, 'ausência nunca vira 01/01/1970');

    // Vazio legítimo da execução agendada: o agendador está desligado neste
    // gate, e a tela diz isso sem fingir falha.
    await page.getByRole('tab', { name: 'Execução agendada', exact: true }).click();
    const agenda = page.locator('[data-testid="compliance-schedule"]');
    await agenda.waitFor();
    const vazio = agenda.locator('[data-ui-state="empty"]');
    await vazio.waitFor();
    assert.match(await vazio.textContent(), /A leitura funcionou/i, 'vazio honesto diz que a leitura funcionou');
    assert.equal(await agenda.locator('[data-ui-state="error"]').count(), 0,
      'lista vazia não pode ser confundida com falha');
    const estado = await page.locator('[data-testid="compliance-schedule-state"]').textContent();
    assert.match(estado, /Não ativada neste processo/, 'a execução agendada desligada é dita como é');

    await capture(page, 'desktop-compliance-ausencia-honesta');
    await context.close();
  });
});

test('browser: em 390px a tela de compliance não produz transbordo horizontal', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie, { width: 390, height: 844 });
    await page.locator('[data-testid="compliance-obligations-table"]').waitFor();
    await page.waitForTimeout(600);
    const transbordo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(transbordo <= 1, `transbordo de ${transbordo}px em /admin/compliance`);
    await capture(page, 'mobile-compliance-390px');
    await context.close();
  });
});
