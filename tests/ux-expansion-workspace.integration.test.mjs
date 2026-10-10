// UX-10 / EXT-09 — gate da tela /admin/expansao, por HTTP real contra
// PostgreSQL real (executado por scripts/qa-ux-expansion-postgres.mjs, que
// sobe um cluster descartável) e por Chromium real.
//
// O que este gate prova:
//  - a rota canônica continua respondendo 401 sem sessão, sem vazar plano
//    algum na negativa, e continua exigindo Idempotency-Key e mesma origem;
//  - os aliases legados continuam somente-leitura (410 na escrita);
//  - "menu não é autorização": `financeiro` está em `allowedRoles` do
//    AdminGate de /admin/expansao, abre a tela, lê normalmente e é recusado
//    pelo próprio servidor na escrita (403 `forbidden_role`); `comercial`
//    escreve, mas é recusado na decisão (403 `approve_permission_required`);
//    só `admin`/`marcelo` decidem. A tela não esconde o botão para adivinhar
//    permissão nem inventa a que não existe;
//  - idempotência real: repetir com a mesma chave devolve replay, e a mesma
//    chave com outro conteúdo é recusada com 409;
//  - o defeito central desta fatia: ausência de custo, receita, margem ou
//    capacidade virava `R$ 0,00` e `0 colaboradores`. Agora ausência é dita;
//  - falha de leitura não vira lista vazia nem métrica zero;
//  - recusa é estado NEGADO, distinto de falha;
//  - as quatro abas são um tablist de verdade, com roving tabindex e teclado;
//  - o vocabulário em português aparece no lugar do valor cru do banco
//    (`em_analise`, `status_aprovado`, `cenario_adicionado`);
//  - 390px não produz transbordo horizontal.
//
// O que este gate NÃO prova: aceite humano, homologação de Marcelo/Andreia,
// nem confirmação de que a expansão vai acontecer. Ver pendências em
// docs/UX-10-EXPANSAO-2026-10-06.md.
//
// Nenhuma asserção é enfraquecida: quando há falha de leitura, ela é injetada
// apenas em `window.fetch`, dentro da própria página (`page.addInitScript`).
// O servidor nunca é alterado para o teste passar, e `ERR_ASSERTION` nunca é
// repetido. A massa é fictícia e criada pelas próprias APIs canônicas; nenhum
// registro traz data fornecida pelo teste — todo carimbo temporal vem do
// `NOW()` do PostgreSQL, no próprio servidor.

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
let adminCookie, comercialCookie, financeiroCookie;
let adminStaff, comercialStaff, financeiroStaff;
let planoCompletoId, protocoloCompleto;
let planoAusenteId, protocoloAusente;

const key = label => `ext09-ux-${label}-${randomUUID()}`;

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
      console.log(`UX_EXPANSION_BROWSER_RETRY tentativa=${tentativa}: ${String(erro.message).split('\n')[0]}`);
    } finally {
      await browser.close().catch(() => {});
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw ultimo;
}

const evidenceDir = process.env.UX_EXPANSION_EVIDENCE_DIR || '';
async function capture(page, nome) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage: true });
}

/**
 * Abre /admin/expansao já autenticada. `failRoutes` derruba, dentro da própria
 * página, as respostas indicadas: `page.route()` é instável com este Chromium
 * empacotado, então a substituição é feita em `window.fetch`, como nos demais
 * gates da série. O servidor NUNCA é enfraquecido.
 */
async function abrir(browser, cookie, {
  width = 1440, height = 900, failRoutes = [], status = 503, code = 'database_error',
} = {}) {
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
  await page.goto(`${baseUrl}/admin/expansao`, { waitUntil: 'domcontentloaded' });
  // O h1 real é a marca de que a página de produto montou. Esperar só o
  // tablist mede a tela antes de a leitura terminar.
  await page.getByRole('heading', { level: 1, name: /Expansão, capacidade e cenários financeiros/ }).waitFor();
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
      NEXT_DIST_DIR: '.next/integration-ux-expansion',
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

  // EXT-09 decide por SESSÃO e PAPEL (STAFF_ROLES / EDIT_ROLES /
  // APPROVE_ROLES no servidor canônico); não há grant granular a provisionar.
  // Os três papéis abaixo estão todos em `allowedRoles` do AdminGate da
  // página — é exatamente isso que permite provar "menu não é autorização".
  adminStaff = await provisionStaff(pool, { role: 'admin' });
  comercialStaff = await provisionStaff(pool, { role: 'comercial' });
  financeiroStaff = await provisionStaff(pool, { role: 'financeiro' });
  adminCookie = await loginStaffHttp(adminStaff.email);
  comercialCookie = await loginStaffHttp(comercialStaff.email);
  financeiroCookie = await loginStaffHttp(financeiroStaff.email);

  // Massa fictícia criada pelas PRÓPRIAS APIs canônicas, por HTTP. Nenhuma
  // data é enviada pelo teste: protocolo e carimbos vêm do servidor.
  const completo = await api('/api/ext/expansion/plans', {
    method: 'POST', cookie: adminCookie,
    body: {
      title: 'Unidade operacional fictícia na Zona Leste de Guarulhos',
      description: 'Massa fictícia do gate UX-10 expansão: estudo interno de nova base operacional, sem dado pessoal real.',
      premises: 'Premissa declarada: contrato âncora fictício de 18 meses, equipe própria e imóvel locado; nenhum valor é contratado.',
      target_location: 'Guarulhos / SP — Zona Leste',
      capacity: 12,
      estimated_cost_cents: 5_000_000,
      estimated_revenue_cents: 7_500_000,
    },
  });
  assert.equal(completo.status, 201, `criação deveria ser 201, veio ${completo.status} ${JSON.stringify(completo.body)}`);
  planoCompletoId = completo.body.plan.id;
  protocoloCompleto = completo.body.plan.protocol;
  assert.match(protocoloCompleto, /^EXP-EXT-\d{8}-[A-Z0-9]{4}$/);
  assert.equal(completo.body.plan.status, 'rascunho');

  // Cenário com as duas cifras: a margem projetada é coluna gerada no banco.
  const cenarioComValor = await api(`/api/ext/expansion/plans/${planoCompletoId}/scenarios`, {
    method: 'POST', cookie: adminCookie,
    body: {
      scenario_name: 'Cenário base fictício',
      premises: 'Premissa do cenário: ocupação de 80% dos postos a partir do terceiro mês, com custo fixo declarado.',
      projected_cost_cents: 4_500_000,
      projected_revenue_cents: 8_000_000,
    },
  });
  assert.equal(cenarioComValor.status, 201, `cenário deveria ser 201, veio ${cenarioComValor.status}`);

  // Cenário SEM cifra: o banco devolve margem nula e a tela precisa dizer que
  // a margem não foi calculada, em vez de mostrar zero.
  const cenarioSemValor = await api(`/api/ext/expansion/plans/${planoCompletoId}/scenarios`, {
    method: 'POST', cookie: adminCookie,
    body: {
      scenario_name: 'Cenário sem cifra declarada',
      premises: 'Premissa do cenário: custo e receita ainda não estudados; registrado para não fingir número que não existe.',
    },
  });
  assert.equal(cenarioSemValor.status, 201, `cenário sem cifra deveria ser 201, veio ${cenarioSemValor.status}`);
  assert.equal(cenarioSemValor.body.scenario.projected_margin_cents, null, 'sem custo e receita a margem é nula no banco');

  const analise = await api(`/api/ext/expansion/plans/${planoCompletoId}/transition`, {
    method: 'POST', cookie: adminCookie,
    body: { status: 'em_analise', notes: 'Submetido pelo gate para reproduzir a jornada real.' },
  });
  assert.equal(analise.status, 200, `transição em_analise deveria ser 200, veio ${analise.status}`);

  const aprovado = await api(`/api/ext/expansion/plans/${planoCompletoId}/transition`, {
    method: 'POST', cookie: adminCookie,
    body: { status: 'aprovado', notes: 'Aprovado pelo gate com papel de decisão.' },
  });
  assert.equal(aprovado.status, 200, `aprovação deveria ser 200, veio ${aprovado.status}`);
  assert.equal(aprovado.body.plan.status, 'aprovado');
  assert.ok(aprovado.body.plan.approved_at, 'a aprovação carimba a data no servidor');

  // Segundo plano: nasce e permanece SEM capacidade, custo e receita, para
  // provar ausência honesta — o defeito central desta fatia.
  const ausente = await api('/api/ext/expansion/plans', {
    method: 'POST', cookie: adminCookie,
    body: {
      title: 'Estudo preliminar fictício de unidade em Arujá',
      description: 'Massa fictícia do gate: estudo aberto sem nenhuma cifra levantada, para provar que ausência não vira zero.',
      premises: 'Premissa declarada: nenhuma cotação de imóvel ou folha foi levantada até aqui; não há número a apresentar.',
      target_location: 'Arujá / SP',
    },
  });
  assert.equal(ausente.status, 201);
  planoAusenteId = ausente.body.plan.id;
  protocoloAusente = ausente.body.plan.protocol;
  assert.equal(ausente.body.plan.capacity, null);
  assert.equal(ausente.body.plan.estimated_cost_cents, null);
  assert.equal(ausente.body.plan.estimated_revenue_cents, null);

  // A página precisa estar compilada antes de qualquer medição no navegador.
  for (const route of ['/admin/entrar', '/admin/expansao']) {
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

test('a rota canônica de expansão continua exigindo sessão, chave e origem', { skip: !RUN }, async () => {
  const anonimo = await api('/api/ext/expansion/plans');
  assert.equal(anonimo.status, 401);
  assert.equal(anonimo.body.error, 'unauthorized');
  assert.ok(!('items' in (anonimo.body || {})), 'a negativa não pode vazar plano algum');

  const semChave = await api('/api/ext/expansion/plans', {
    method: 'POST', cookie: adminCookie, idempotencyKey: null, body: {},
  });
  assert.equal(semChave.status, 400);
  assert.equal(semChave.body.error, 'idempotency_key_required');

  const origemEstranha = await api('/api/ext/expansion/plans', {
    method: 'POST', cookie: adminCookie, headers: { origin: 'https://attacker.invalid' }, body: {},
  });
  assert.equal(origemEstranha.status, 403);
  assert.equal(origemEstranha.body.error, 'origin_forbidden');

  // Caminho inexistente dentro do prefixo canônico continua 404 declarado.
  const inexistente = await api('/api/ext/expansion/nao-existe', { cookie: adminCookie });
  assert.equal(inexistente.status, 404);
  assert.equal(inexistente.body.error, 'not_found');
});

test('os aliases legados de expansão continuam somente-leitura', { skip: !RUN }, async () => {
  for (const alias of ['/api/ext/expansion-plans', '/api/ext/expansion-scenarios']) {
    const leitura = await api(alias, { cookie: adminCookie });
    assert.equal(leitura.status, 200, `${alias} continua lendo`);
    assert.ok(Array.isArray(leitura.body.items), `${alias} devolve a mesma projeção de lista`);
    const escrita = await api(alias, { method: 'POST', cookie: adminCookie, body: { title: 'x' } });
    assert.equal(escrita.status, 410, `${alias} recusa escrita`);
    assert.equal(escrita.body.error, 'legacy_expansion_writer_retired');
  }
  const escritaPlano = await api('/api/ext/expansion-plans', { method: 'POST', cookie: adminCookie, body: {} });
  assert.equal(escritaPlano.body.canonical, '/api/ext/expansion/plans', 'a recusa aponta a rota canônica');

  // Os aliases publicados sob o prefixo histórico de RH passam ANTES pela
  // borda legada de RH do server.mjs (`authorizeLegacyHrRequest`), que exige
  // permissão granular de funcionário. Esta fatia não altera essa borda: a
  // tela usa apenas a rota canônica, e o alias de RH continua fechado por
  // padrão para quem não tem a permissão de RH. Registrado como é, sem
  // enfeitar e sem alargar.
  for (const alias of ['/api/hr/ext-expansion-plans', '/api/admin/hr/ext-expansion-plans', '/api/crm/hr/ext-expansion-scenarios']) {
    const leitura = await api(alias, { cookie: adminCookie });
    assert.equal(leitura.status, 403, `${alias} é barrado pela borda legada de RH`);
    assert.equal(leitura.body.error, 'employee_permission_required');
    assert.ok(!('items' in (leitura.body || {})), `${alias} não vaza plano algum na negativa`);
  }
});

test('menu não é autorização: quem recusa escrita e decisão é o servidor', { skip: !RUN }, async () => {
  // `financeiro` está em allowedRoles do AdminGate e LÊ normalmente…
  const leituraFinanceiro = await api('/api/ext/expansion/plans', { cookie: financeiroCookie });
  assert.equal(leituraFinanceiro.status, 200, 'financeiro lê a jornada');
  assert.ok(Array.isArray(leituraFinanceiro.body.items));

  // …mas o servidor recusa a escrita, porque EDIT_ROLES não inclui financeiro.
  const escritaFinanceiro = await api('/api/ext/expansion/plans', {
    method: 'POST', cookie: financeiroCookie,
    body: {
      title: 'Tentativa fictícia sem papel de escrita',
      description: 'O servidor precisa recusar esta criação para o papel financeiro, sem criar nada.',
      premises: 'Premissa declarada apenas para completar a validação do corpo nesta tentativa recusada.',
      target_location: 'Guarulhos / SP',
    },
  });
  assert.equal(escritaFinanceiro.status, 403, 'sem papel de edição o servidor recusa a escrita');
  assert.equal(escritaFinanceiro.body.error, 'forbidden_role');
  assert.ok(!('plan' in (escritaFinanceiro.body || {})), 'a negativa não pode devolver plano criado');

  // `comercial` escreve, mas não decide.
  const criacaoComercial = await api('/api/ext/expansion/plans', {
    method: 'POST', cookie: comercialCookie,
    body: {
      title: 'Sondagem comercial fictícia de nova praça',
      description: 'Plano fictício criado pelo papel comercial para provar que escrita e decisão são papéis diferentes.',
      premises: 'Premissa declarada: prospecção inicial sem proposta formal; nenhum valor é compromisso.',
      target_location: 'Mairiporã / SP',
    },
  });
  assert.equal(criacaoComercial.status, 201, 'comercial pode criar');
  const planoComercialId = criacaoComercial.body.plan.id;

  const analiseComercial = await api(`/api/ext/expansion/plans/${planoComercialId}/transition`, {
    method: 'POST', cookie: comercialCookie,
    body: { status: 'em_analise', notes: 'Submissão feita pelo próprio comercial.' },
  });
  assert.equal(analiseComercial.status, 200, 'submeter para análise não é decisão restrita');

  const decisaoComercial = await api(`/api/ext/expansion/plans/${planoComercialId}/transition`, {
    method: 'POST', cookie: comercialCookie,
    body: { status: 'aprovado', notes: 'Tentativa de aprovação sem papel de decisão.' },
  });
  assert.equal(decisaoComercial.status, 403, 'aprovar é decisão restrita');
  assert.equal(decisaoComercial.body.error, 'approve_permission_required');

  // Rejeitar e cancelar continuam exigindo justificativa formal, mesmo para
  // quem tem papel de decisão.
  const semJustificativa = await api(`/api/ext/expansion/plans/${planoComercialId}/transition`, {
    method: 'POST', cookie: adminCookie, body: { status: 'rejeitado' },
  });
  assert.equal(semJustificativa.status, 400);
  assert.equal(semJustificativa.body.error, 'justification_required');

  // Transição fora da máquina de estados é recusada com a lista real.
  const transicaoInvalida = await api(`/api/ext/expansion/plans/${planoCompletoId}/transition`, {
    method: 'POST', cookie: adminCookie, body: { status: 'em_analise' },
  });
  assert.equal(transicaoInvalida.status, 409);
  assert.equal(transicaoInvalida.body.error, 'invalid_transition');
  assert.match(String(transicaoInvalida.body.message || ''), /em_execucao/);
});

test('idempotência real: replay com a mesma chave, 409 com conteúdo divergente', { skip: !RUN }, async () => {
  const chave = key('replay');
  const corpo = {
    title: 'Plano fictício para prova de idempotência',
    description: 'Criado duas vezes com a mesma chave para provar que o servidor não duplica efeito.',
    premises: 'Premissa declarada apenas para a prova de idempotência deste gate; nenhum número é real.',
    target_location: 'Santa Isabel / SP',
  };
  const primeira = await api('/api/ext/expansion/plans', { method: 'POST', cookie: adminCookie, idempotencyKey: chave, body: corpo });
  assert.equal(primeira.status, 201);
  const repetida = await api('/api/ext/expansion/plans', { method: 'POST', cookie: adminCookie, idempotencyKey: chave, body: corpo });
  assert.equal(repetida.status, 200, 'repetir com a mesma chave devolve replay, não cria outro plano');
  assert.equal(repetida.body.replayed, true);
  assert.equal(repetida.body.plan.id, primeira.body.plan.id);

  const divergente = await api('/api/ext/expansion/plans', {
    method: 'POST', cookie: adminCookie, idempotencyKey: chave,
    body: { ...corpo, title: 'Mesmo identificador de operação, outro conteúdo' },
  });
  assert.equal(divergente.status, 409);
  assert.equal(divergente.body.error, 'idempotency_conflict_payload_mismatch');
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
    assert.equal(await page.locator('[role="tablist"] [aria-pressed]').count(), 0, 'aria-pressed não substitui tab');
    // O seletor de tema do chrome administrativo é um toggle legítimo e carrega
    // aria-pressed em todo /admin/*; a regra vale para a faixa de abas e para
    // qualquer outro controle da tela, não para o chrome compartilhado.
    assert.equal(await page.locator('[aria-pressed]:not([data-admin-theme-toggle="true"])').count(), 0,
      'fora do seletor de tema, nenhum controle desta tela usa aria-pressed');
    assert.equal(await abas.first().getAttribute('aria-controls'), 'expansion-panel-planos');

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

    await capture(page, 'desktop-expansao-abas');
    await context.close();
  });
});

test('browser: ausência não vira zero, R$ 0,00 nem data de época', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie);
    const tabela = page.locator('[data-testid="expansion-list-table"]');
    await tabela.waitFor();

    // textContent, e não innerText: o prefixo de leitor de tela do UiBadge é
    // recortado por CSS e não entra no texto renderizado.
    const textoTabela = await tabela.textContent();
    assert.match(textoTabela, /Aprovado/, 'a situação `aprovado` é exibida em português');
    assert.match(textoTabela, /Rascunho/, 'a situação `rascunho` é exibida em português');
    assert.doesNotMatch(textoTabela, /em_analise|em_execucao|rascunho\b/, 'nenhum valor cru do banco na lista');
    assert.doesNotMatch(textoTabela, /01\/01\/1970/, 'ausência nunca vira data inicial');

    // Linha do plano COM cifras: o número real aparece como número real.
    const linhaCompleta = await page.getByRole('row', { name: new RegExp(protocoloCompleto) }).textContent();
    assert.match(linhaCompleta, /R\$ 50\.000,00/, 'custo declarado aparece como custo');
    assert.match(linhaCompleta, /R\$ 75\.000,00/, 'receita declarada aparece como receita');
    assert.match(linhaCompleta, /R\$ 25\.000,00/, 'a margem é a diferença calculada pelo servidor');
    assert.match(linhaCompleta, /12 vagas declaradas/);

    // Linha do plano SEM cifras: o defeito central desta fatia.
    const linhaAusente = await page.getByRole('row', { name: new RegExp(protocoloAusente) }).textContent();
    assert.match(linhaAusente, /Valor não informado/, 'custo e receita ausentes são ditos');
    assert.match(linhaAusente, /Margem não calculada/, 'sem custo e receita a margem não é calculada');
    assert.match(linhaAusente, /Capacidade não informada/, 'capacidade ausente é dita');
    assert.doesNotMatch(linhaAusente, /R\$ 0,00/, 'ausência de cifra nunca vira zero');
    assert.doesNotMatch(linhaAusente, /0 vagas declaradas/, 'ausência de capacidade nunca vira zero vaga');

    await capture(page, 'desktop-expansao-lista');
    await context.close();
  });
});

test('browser: detalhe, cenários e trilha saem em português, sem valor cru', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie);
    await page.locator('[data-testid="expansion-list-table"]').waitFor();
    await page.getByRole('row', { name: new RegExp(protocoloCompleto) })
      .getByRole('button', { name: 'Abrir plano' }).click();

    const detalhe = page.locator('[data-testid="expansion-plan-detail"]');
    await detalhe.waitFor();
    const textoDetalhe = await detalhe.textContent();
    assert.match(textoDetalhe, new RegExp(protocoloCompleto));
    assert.match(textoDetalhe, /Aprovado/);
    assert.match(textoDetalhe, /Estimativa declarada/, 'a natureza do número é dita na própria tela');
    assert.match(textoDetalhe, /estimativa identificada sem projeção vendida como certeza/,
      'a nota de estimativa vem do banco, não da tela');
    assert.match(textoDetalhe, /Execução não iniciada/, 'marco ausente é dito, não datado');
    assert.match(textoDetalhe, /Conclusão pendente/);
    assert.match(textoDetalhe, /Plano não cancelado/);
    assert.doesNotMatch(textoDetalhe, /01\/01\/1970/, 'ausência nunca vira 01/01/1970');
    assert.doesNotMatch(textoDetalhe, /Dado ausente/, 'este plano tem descrição, premissa e datas reais');

    // Cenários: um com margem calculada, outro sem cifra alguma.
    const cenarios = page.locator('[data-testid="expansion-scenarios-table"]');
    await cenarios.waitFor();
    const textoCenarios = await cenarios.textContent();
    assert.match(textoCenarios, /Cenário base fictício/);
    assert.match(textoCenarios, /R\$ 35\.000,00/, 'a margem projetada é coluna gerada pelo banco');
    assert.match(textoCenarios, /Margem não calculada/, 'cenário sem cifra não ganha margem zero');
    assert.match(textoCenarios, /Valor não informado/);

    // Transições oferecidas são exatamente as da máquina de estados.
    const transicoes = await page.locator('[data-testid="expansion-transitions"]').textContent();
    assert.match(transicoes, /Iniciar execução/);
    assert.match(transicoes, /Cancelar com justificativa/);
    assert.doesNotMatch(transicoes, /Aprovar plano/, 'plano já aprovado não oferece aprovar de novo');

    // Trilha imutável, em português.
    await page.getByRole('tab', { name: 'Trilha do plano', exact: true }).click();
    const trilha = page.locator('[data-testid="expansion-events"]');
    await trilha.waitFor();
    const textoTrilha = await trilha.textContent();
    assert.match(textoTrilha, /Plano criado como rascunho/);
    assert.match(textoTrilha, /Cenário financeiro adicionado/);
    assert.match(textoTrilha, /Submetido para análise/);
    assert.match(textoTrilha, /Aprovado pela diretoria/);
    assert.doesNotMatch(textoTrilha, /plano_criado|cenario_adicionado|status_aprovado/, 'nenhum event_type cru');

    await capture(page, 'desktop-expansao-plano');
    await context.close();
  });
});

test('browser: falha de leitura NÃO vira lista vazia nem indicador zero', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie, {
      failRoutes: ['/api/ext/expansion/plans'], status: 503, code: 'database_error',
    });
    const lista = page.locator('[data-testid="expansion-list"]');
    await lista.waitFor();
    const erro = lista.locator('[data-ui-state="error"]');
    await erro.waitFor();
    const texto = await erro.textContent();
    assert.match(texto, /não significa que não existam planos de expansão registrados/i,
      'a falha nega explicitamente a lista vazia');
    assert.match(texto, /database_error \(HTTP 503\)/, 'o código canônico fica disponível para diagnóstico');
    assert.ok(await erro.locator('button').count() >= 1, 'falha transitória precisa oferecer nova tentativa');

    assert.equal(await lista.locator('[data-ui-state="empty"]').count(), 0, 'falha não pode virar vazio');
    assert.equal(await page.locator('[data-testid="expansion-list-table"]').count(), 0, 'nenhuma tabela vazia é renderizada');
    assert.equal(await page.locator('[data-testid="expansion-metrics"]').count(), 0, 'nenhum indicador zero é renderizado');

    await capture(page, 'desktop-expansao-falha-leitura');
    await context.close();
  });
});

test('browser: recusa de leitura vira estado NEGADO, distinto de falha', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie, {
      failRoutes: ['/api/ext/expansion/plans'], status: 403, code: 'forbidden_role',
    });
    const lista = page.locator('[data-testid="expansion-list"]');
    await lista.waitFor();
    const negado = lista.locator('[data-ui-state="denied"]');
    await negado.waitFor();
    const texto = await negado.textContent();
    assert.match(texto, /Papel sem acesso ao planejamento de expansão/i, 'a recusa explica o papel, não a ausência de dado');
    assert.match(texto, /forbidden_role \(HTTP 403\)/);
    assert.equal(await lista.locator('[data-ui-state="empty"]').count(), 0, 'recusa não pode ser confundida com vazio');
    assert.equal(await lista.locator('[data-ui-state="error"]').count(), 0, 'recusa não pode ser confundida com falha');
    assert.equal(await page.locator('[data-testid="expansion-metrics"]').count(), 0);

    await capture(page, 'desktop-expansao-negado');
    await context.close();
  });
});

test('browser: recusa REAL de escrita do servidor aparece como NEGADO, com chave preservada', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    // Sem injeção nenhuma: o papel financeiro abre a tela pelo AdminGate, lê a
    // lista e é recusado pelo próprio servidor ao tentar criar.
    const { context, page } = await abrir(browser, financeiroCookie);
    await page.locator('[data-testid="expansion-list-table"]').waitFor();

    await page.getByRole('tab', { name: 'Novo plano', exact: true }).click();
    await page.locator('#expansion-title').fill('Tentativa fictícia pela tela sem papel de escrita');
    await page.locator('#expansion-location').fill('Guarulhos / SP');
    await page.locator('#expansion-description').fill('Criação disparada pela tela para provar que a recusa vem do servidor.');
    await page.locator('#expansion-premises').fill('Premissa declarada só para completar o corpo desta tentativa recusada.');
    await page.getByRole('button', { name: 'Registrar plano em rascunho' }).click();

    const recusa = page.locator('[data-testid="expansion-action-error"]');
    await recusa.waitFor();
    assert.equal(await recusa.locator('[data-ui-state="denied"]').count(), 1, 'recusa de papel é NEGADO, não falha genérica');
    const texto = await recusa.textContent();
    assert.match(texto, /Papel sem acesso ao planejamento de expansão/i);
    assert.match(texto, /forbidden_role \(HTTP 403\)/);
    assert.match(texto, /Chave preservada para repetição segura/, 'a chave de idempotência sobrevive à falha');
    assert.match(texto, /plan-[0-9a-f-]{36}/, 'o prefixo de idempotência do protótipo é preservado');

    await capture(page, 'desktop-expansao-negado-escrita');
    await context.close();
  });
});

test('browser: transição real pela tela usa a rota canônica e atualiza a trilha', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie);
    await page.locator('[data-testid="expansion-list-table"]').waitFor();
    await page.getByRole('row', { name: new RegExp(protocoloAusente) })
      .getByRole('button', { name: 'Abrir plano' }).click();
    await page.locator('[data-testid="expansion-plan-detail"]').waitFor();

    await page.locator('#expansion-notes').fill('Submissão disparada pela tela no gate UX-10.');
    await page.getByRole('button', { name: /Submeter para análise/ }).click();
    await page.locator('[data-ui-state="success"]').first().waitFor();

    const detalhe = await page.locator('[data-testid="expansion-plan-detail"]').textContent();
    assert.match(detalhe, /Em análise/, 'a nova situação veio do servidor');

    // O efeito é real no banco canônico, não apenas na tela.
    const { rows } = await pool.query('SELECT status FROM ext_expansion_plans WHERE id = $1', [planoAusenteId]);
    assert.equal(rows[0].status, 'em_analise');
    const eventos = await pool.query(
      `SELECT event_type FROM ext_expansion_events WHERE plan_id = $1 ORDER BY created_at ASC`,
      [planoAusenteId],
    );
    assert.deepEqual(eventos.rows.map(row => row.event_type), ['plano_criado', 'status_em_analise']);

    await capture(page, 'desktop-expansao-transicao');
    await context.close();
  });
});

test('browser: em 390px a tela de expansão não produz transbordo horizontal', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie, { width: 390, height: 844 });
    await page.locator('[data-testid="expansion-list-table"]').waitFor();
    await page.waitForTimeout(600);
    const transbordo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(transbordo <= 1, `transbordo de ${transbordo}px em /admin/expansao`);
    await capture(page, 'mobile-expansao-390px');
    await context.close();
  });
});
