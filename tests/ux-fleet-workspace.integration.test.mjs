// UX-07 / EXT-01 — gate da tela /admin/frota, por HTTP real contra PostgreSQL
// real (executado por scripts/qa-ux-fleet-postgres.mjs, que sobe um cluster
// descartável) e por Chromium real.
//
// O que este gate prova:
//  - a rota canônica continua exigindo sessão de equipe (401 `unauthorized`),
//    recusando papel fora da lista do servidor (403 `forbidden_role`),
//    exigindo `Idempotency-Key` (400) e recusando origem cruzada (403), sem
//    vazar veículo algum na negativa;
//  - a rota LEGADA continua viva em leitura (200) e aposentada em escrita
//    (410 `legacy_route_retired`, com `use` apontando a canônica) — e a tela
//    NÃO a consome;
//  - a LACUNA corrigida nesta fatia: o ramo GET de `maintenance-rules` existe,
//    está dispatchado e agora é lido pela tela, mostrando inclusive a regra
//    que o servidor desativou ao registrar a nova;
//  - a chave de idempotência é PRESERVADA após a recusa e fica visível para
//    repetição segura — a mesma chave é reaproveitada no acerto;
//  - falha de leitura não vira lista vazia nem indicador zero: a tabela e os
//    contadores ficam AUSENTES do DOM, e a falha diz que não significa
//    ausência de veículos;
//  - recusa de papel é estado NEGADO, distinto de falha e de vazio;
//  - uma leitura que falha não contamina a outra (dossiê × regras);
//  - as sete abas são um tablist de verdade, com roving tabindex e teclado;
//  - português no lugar do valor cru do banco (`em_manutencao`,
//    `jornada_frota`, `flex`, `manutencao_registrada`, `sem_regra`);
//  - ausência honesta: veículo sem responsável, sem documento, sem
//    abastecimento e sem regra — nunca 0, 0 km, R$ 0,00 ou 01/01/1970;
//  - zero REAL do servidor continua aparecendo: odômetro 0 km é 0 km;
//  - 390px não produz transbordo horizontal.
//
// O que este gate NÃO prova: aceite humano. Marcelo e Andreia não
// participaram; nada aqui é homologação.
//
// MASSA: tudo que é de EXT-01 (veículo, responsável, abastecimento,
// manutenção, documento, regra de manutenção) nasce nas PRÓPRIAS APIs
// canônicas de frota, por HTTP. Nenhuma linha de `ext_fleet_*` é escrita por
// SQL. O único acesso direto ao banco é LEITURA — conferência do que o
// servidor persistiu — e a leitura do relógio do servidor.
//
// As datas da massa são ancoradas no CURRENT_DATE do SERVIDOR (via pool),
// nunca no relógio do processo de teste: esta família valida
// `fuel_date_in_future`/`performed_at_in_future` contra a data do servidor e
// deriva alerta por data E por quilometragem. Uma diferença de fuso entre
// runner e banco tornaria a massa incoerente com o que o servidor aceita.
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
let veiculoCompleto, veiculoVazio;
let documentoAtivo, regraVigenteId;
let dataDoServidor = '';
let dataDeOntem = '';

const key = label => `ext01-ux-${label}-${randomUUID()}`;

// Marca de progresso do preparo: quando o gate falha em CI, ela diz em qual
// etapa parou. Não altera asserção alguma.
const etapa = nome => console.log(`UX_FLEET_SETUP: ${nome}`);

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
      console.log(`UX_FLEET_BROWSER_RETRY tentativa=${tentativa}: ${String(erro.message).split('\n')[0]}`);
    } finally {
      await browser.close().catch(() => {});
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw ultimo;
}

const evidenceDir = process.env.UX_FLEET_EVIDENCE_DIR || '';
async function capture(page, nome) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage: true });
}

/**
 * Abre /admin/frota já autenticada.
 *
 * `failRoutes` derruba, dentro da própria página, as respostas indicadas:
 * `page.route()` é instável com este Chromium empacotado, então a substituição
 * é feita em `window.fetch`, como nos demais gates da série.
 *
 * `presentAdminSession` responde apenas ao `GET /api/admin/session` do
 * AdminGate, para a tela montar com um papel que o menu deixaria entrar. A
 * chamada de EXT-01 continua com o cookie real, e o 403 vem do servidor
 * canônico: a simulação é só da apresentação do menu, nunca da autorização.
 */
async function abrir(browser, cookie, {
  width = 1440, height = 900, failRoutes = [], status = 503,
  code = 'fleet_unavailable', presentAdminSession = false,
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
  await page.goto(`${baseUrl}/admin/frota`, { waitUntil: 'domcontentloaded' });
  // O h1 real é a marca de que a página de produto montou. Esperar o contêiner
  // da aba mediria a tela antes de a leitura terminar.
  await page.getByRole('heading', { level: 1, name: 'Frota própria, custo por veículo e alerta de manutenção' }).waitFor();
  return { context, page };
}

async function criarVeiculo(body) {
  const criado = await api('/api/ext/fleet/vehicles', { method: 'POST', cookie: tiCookie, body });
  assert.equal(criado.status, 201, `criação de veículo deveria ser 201, veio ${criado.status} ${criado.text}`);
  return criado.body.vehicle;
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
      NEXT_DIST_DIR: '.next/integration-ux-fleet',
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
  // Relógio do SERVIDOR: o servidor canônico recusa data futura comparando
  // com o próprio `todayIso()`. Ancorar a massa aqui evita incoerência de fuso.
  const relogio = await pool.query(`SELECT CURRENT_DATE::text AS hoje, (CURRENT_DATE - INTERVAL '1 day')::date::text AS ontem`);
  dataDoServidor = relogio.rows[0].hoje;
  dataDeOntem = relogio.rows[0].ontem;
  etapa(`data-base do servidor ${dataDoServidor} (ontem ${dataDeOntem})`);

  // `ti` está na lista do servidor canônico (admin|marcelo|ti). `rh` não está:
  // é o papel que prova a recusa real.
  tiStaff = await provisionStaff(pool, { role: 'ti' });
  rhStaff = await provisionStaff(pool, { role: 'rh' });
  tiCookie = await loginStaffHttp(tiStaff.email);
  rhCookie = await loginStaffHttp(rhStaff.email);
  etapa('identidades de equipe provisionadas');

  // Veículo 1: completo. Responsável, abastecimento, manutenção, documento e
  // regra de manutenção — tudo pelas APIs canônicas, por HTTP.
  veiculoCompleto = await criarVeiculo({
    plate: `UXA${String(Math.floor(Math.random() * 9000) + 1000)}`,
    model: 'Furgão sintético do gate UX-07',
    manufacturer: 'Fabricante sintético',
    year: 2022,
    fuel_type: 'flex',
    mileage: 10000,
    cost_center: 'Centro sintético UX-07',
    notes: 'Veículo fictício criado pelo gate UX-07; nenhum dado real.',
  });
  etapa(`veículo completo ${veiculoCompleto.plate}`);

  // Veículo 2: fica sem responsável, sem abastecimento, sem manutenção, sem
  // documento e sem regra — e com odômetro ZERO REAL, para separar ausência
  // honesta de zero verdadeiro.
  veiculoVazio = await criarVeiculo({
    plate: `UXB${String(Math.floor(Math.random() * 9000) + 1000)}`,
    model: 'Reboque sintético sem histórico',
    fuel_type: 'diesel',
    mileage: 0,
  });
  assert.equal(veiculoVazio.mileage, 0, 'o servidor precisa aceitar odômetro zero real');
  assert.equal(veiculoVazio.responsible_name, null, 'o veículo vazio não pode nascer com responsável');
  etapa(`veículo vazio ${veiculoVazio.plate} com odômetro zero real`);

  const responsavel = await api(`/api/ext/fleet/vehicles/${veiculoCompleto.id}/responsible`, {
    method: 'POST', cookie: tiCookie,
    body: { responsible_name: 'Responsável sintético UX-07', reason: 'Atribuição sintética registrada pelo gate UX-07.' },
  });
  assert.equal(responsavel.status, 201, `atribuição deveria ser 201, veio ${responsavel.status} ${responsavel.text}`);

  const abastecimento = await api(`/api/ext/fleet/vehicles/${veiculoCompleto.id}/fuel-logs`, {
    method: 'POST', cookie: tiCookie,
    body: { fuel_date: dataDeOntem, liters: 42.5, cost_cents: 31875, mileage: 10500, station: 'Posto sintético do gate' },
  });
  assert.equal(abastecimento.status, 201, `abastecimento deveria ser 201, veio ${abastecimento.status} ${abastecimento.text}`);

  const manutencao = await api(`/api/ext/fleet/vehicles/${veiculoCompleto.id}/maintenance-logs`, {
    method: 'POST', cookie: tiCookie,
    body: {
      maintenance_type: 'Revisão sintética',
      description: 'Revisão fictícia registrada pelo gate UX-07 para servir de base canônica do alerta.',
      cost_cents: 125000, mileage: 10600, performed_at: dataDeOntem,
    },
  });
  assert.equal(manutencao.status, 201, `manutenção deveria ser 201, veio ${manutencao.status} ${manutencao.text}`);

  const documento = await api(`/api/ext/fleet/vehicles/${veiculoCompleto.id}/documents`, {
    method: 'POST', cookie: tiCookie,
    body: { document_type: 'CRLV sintético', document_number: 'DOC-UX07-0001', expiry_date: dataDoServidor, file_name: 'crlv-sintetico.pdf' },
  });
  assert.equal(documento.status, 201, `documento deveria ser 201, veio ${documento.status} ${documento.text}`);
  documentoAtivo = documento.body.document.id;

  // Primeira regra: será DESATIVADA pelo servidor ao registrar a segunda.
  // É exatamente o histórico que o protótipo nunca lia.
  const regraAntiga = await api(`/api/ext/fleet/vehicles/${veiculoCompleto.id}/maintenance-rules`, {
    method: 'POST', cookie: tiCookie,
    body: { interval_days: 365, alert_before_days: 30, justification: 'Regra sintética antiga do gate UX-07, que será desativada.' },
  });
  assert.equal(regraAntiga.status, 201, `regra deveria ser 201, veio ${regraAntiga.status} ${regraAntiga.text}`);

  // Segunda regra: por quilometragem apertada, para o alerta derivar
  // DENTRO DA ANTECEDÊNCIA a partir da base canônica (10.600 km) e do
  // odômetro atual (10.600 km) — nada estimado, tudo do servidor.
  const regraNova = await api(`/api/ext/fleet/vehicles/${veiculoCompleto.id}/maintenance-rules`, {
    method: 'POST', cookie: tiCookie,
    body: { interval_km: 1000, alert_before_km: 1000, justification: 'Regra sintética vigente do gate UX-07, derivada por quilometragem.' },
  });
  assert.equal(regraNova.status, 201, `regra deveria ser 201, veio ${regraNova.status} ${regraNova.text}`);
  regraVigenteId = regraNova.body.rule.id;

  // Conferência de LEITURA: o servidor realmente desativou a regra anterior.
  const regras = await pool.query(
    'SELECT id, is_active FROM ext_fleet_maintenance_rules WHERE vehicle_id=$1 ORDER BY created_at ASC', [veiculoCompleto.id],
  );
  assert.equal(regras.rowCount, 2, 'as duas regras precisam existir no banco');
  assert.equal(regras.rows[0].is_active, false, 'a regra anterior precisa ter sido desativada pelo servidor');
  assert.equal(regras.rows[1].is_active, true, 'a regra nova precisa estar vigente');
  etapa('massa canônica do veículo completo');

  // A página precisa estar compilada antes de qualquer medição no navegador.
  for (const route of ['/admin/entrar', '/admin/frota']) {
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

test('a rota canônica de frota continua exigindo sessão, papel, origem e chave', { skip: !RUN }, async () => {
  const anonimo = await api('/api/ext/fleet/vehicles');
  assert.equal(anonimo.status, 401);
  assert.equal(anonimo.body.error, 'unauthorized');
  assert.ok(!('vehicles' in (anonimo.body || {})), 'a negativa não pode vazar veículo algum');

  const papelRecusado = await api('/api/ext/fleet/vehicles', { cookie: rhCookie });
  assert.equal(papelRecusado.status, 403, 'o servidor recusa o papel fora da lista canônica');
  assert.equal(papelRecusado.body.error, 'forbidden_role');
  assert.ok(!('vehicles' in (papelRecusado.body || {})), 'a negativa não pode vazar veículo algum');

  assert.equal((await api('/api/ext/fleet/vehicles', {
    method: 'POST', cookie: tiCookie, idempotencyKey: null, body: { plate: 'UXZ0001', model: 'Sem chave de idempotência' },
  })).status, 400, 'escrita sem chave de idempotência é recusada');
  assert.equal((await api('/api/ext/fleet/vehicles', {
    method: 'POST', cookie: tiCookie, origin: 'https://attacker.invalid', body: { plate: 'UXZ0002', model: 'Origem cruzada recusada' },
  })).status, 403, 'origem cruzada é recusada antes de qualquer efeito');

  // O recorte legado continua religado em leitura e aposentado em escrita, e
  // NÃO é consumido pela tela.
  assert.equal((await api('/api/ext/fleet-vehicles', { cookie: tiCookie })).status, 200);
  const legadaEscrita = await api('/api/ext/fleet-fuel-logs', { method: 'POST', cookie: tiCookie, body: {} });
  assert.equal(legadaEscrita.status, 410);
  assert.equal(legadaEscrita.body.error, 'legacy_route_retired');
  assert.equal(legadaEscrita.body.use, '/api/ext/fleet/vehicles/<id>/fuel-logs');
});

test('o corpo de cada escrita é o que o servidor realmente lê', { skip: !RUN }, async () => {
  // Regras de conteúdo conferidas contra o servidor real, antes de qualquer
  // efeito — o estado do veículo não muda em nenhuma destas recusas.
  const semMotivo = await api(`/api/ext/fleet/vehicles/${veiculoCompleto.id}/responsible`, {
    method: 'POST', cookie: tiCookie, body: { responsible_name: 'Outro responsável sintético', reason: '' },
  });
  assert.equal(semMotivo.status, 400);
  assert.equal(semMotivo.body.error, 'invalid_reason');

  const semJustificativa = await api(`/api/ext/fleet/vehicles/${veiculoCompleto.id}/maintenance-rules`, {
    method: 'POST', cookie: tiCookie, body: { interval_km: 5000, justification: '' },
  });
  assert.equal(semJustificativa.status, 400);
  assert.equal(semJustificativa.body.error, 'invalid_justification');

  const semIntervalo = await api(`/api/ext/fleet/vehicles/${veiculoCompleto.id}/maintenance-rules`, {
    method: 'POST', cookie: tiCookie, body: { justification: 'Justificativa sintética sem intervalo nenhum.' },
  });
  assert.equal(semIntervalo.status, 400);
  assert.equal(semIntervalo.body.error, 'interval_required');

  // Data futura é recusada pelo relógio do SERVIDOR, não pelo do teste.
  const amanha = (await pool.query(`SELECT (CURRENT_DATE + INTERVAL '1 day')::date::text AS d`)).rows[0].d;
  const futuro = await api(`/api/ext/fleet/vehicles/${veiculoCompleto.id}/fuel-logs`, {
    method: 'POST', cookie: tiCookie, body: { fuel_date: amanha, liters: 10, cost_cents: 1000 },
  });
  assert.equal(futuro.status, 400);
  assert.equal(futuro.body.error, 'fuel_date_in_future');

  // Quilometragem canônica não anda para trás.
  const regressao = await api(`/api/ext/fleet/vehicles/${veiculoCompleto.id}`, {
    method: 'PATCH', cookie: tiCookie, body: { mileage: 1 },
  });
  assert.equal(regressao.status, 400);
  assert.equal(regressao.body.error, 'mileage_regression');

  const atual = await pool.query('SELECT mileage, responsible_name FROM ext_fleet_vehicles WHERE id=$1', [veiculoCompleto.id]);
  assert.equal(atual.rows[0].mileage, 10600, 'nenhuma recusa pode ter alterado a quilometragem');
  assert.equal(atual.rows[0].responsible_name, 'Responsável sintético UX-07', 'nenhuma recusa pode ter trocado o responsável');
});

test('o ramo GET de maintenance-rules devolve o histórico que a tela passou a ler', { skip: !RUN }, async () => {
  // Lacuna corrigida nesta fatia, provada contra o servidor real: a rota
  // existe, está dispatchada e devolve a regra desativada junto da vigente.
  const resposta = await api(`/api/ext/fleet/vehicles/${veiculoCompleto.id}/maintenance-rules`, { cookie: tiCookie });
  assert.equal(resposta.status, 200);
  assert.equal(resposta.body.rules.length, 2, 'o histórico precisa trazer a regra desativada e a vigente');
  assert.equal(resposta.body.rules[0].id, regraVigenteId, 'a regra vigente vem primeiro, como o servidor ordena');
  assert.equal(resposta.body.rules[0].is_active, true);
  assert.equal(resposta.body.rules[1].is_active, false);
  assert.ok(resposta.body.source, 'o servidor declara a fonte');
  assert.ok(resposta.body.base_date, 'o servidor declara a data-base');
  // A mesma rota, sem sessão, continua recusando.
  assert.equal((await api(`/api/ext/fleet/vehicles/${veiculoCompleto.id}/maintenance-rules`)).status, 401);
});

test('browser: recusa de papel vira estado NEGADO, nunca lista vazia', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    // O papel `rh` não está em allowedRoles do AdminGate: a sessão sintética
    // existe só para a tela montar. A chamada canônica segue com o cookie real
    // de `rh` e o 403 abaixo vem do servidor de verdade.
    const { context, page } = await abrir(browser, rhCookie, { presentAdminSession: true });
    const painel = page.locator('[data-testid="frota-lista"]');
    await painel.waitFor();
    const negado = page.locator('[data-testid="frota-lista-erro"] [data-ui-state="denied"]');
    await negado.waitFor();
    const texto = await negado.textContent();
    assert.match(texto, /Papel sem acesso à jornada de frota/);
    assert.match(texto, /\(forbidden_role\)/, 'o código canônico fica no rodapé técnico');
    assert.match(texto, /Menu não é autorização/);
    // Negado não é vazio e não é zero: nenhum contador, nenhuma tabela.
    assert.equal(await page.locator('[data-testid="frota-tabela"]').count(), 0, 'a tabela não pode existir no DOM em recusa');
    assert.equal(await page.locator('[data-testid="frota-metricas"]').count(), 0, 'nenhum indicador pode aparecer em recusa');
    assert.equal(await page.locator('[data-testid="frota-lista"] [data-ui-state="empty"]').count(), 0, 'recusa não é vazio');
    await capture(page, 'desktop-frota-negado');
    await context.close();
  });
});

test('browser: falha de leitura não vira frota vazia nem custo zero', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, tiCookie, {
      failRoutes: ['/api/ext/fleet/vehicles'], status: 503, code: 'fleet_unavailable',
    });
    const erro = page.locator('[data-testid="frota-lista-erro"] [data-ui-state="error"]');
    await erro.waitFor();
    const texto = await erro.textContent();
    assert.match(texto, /Jornada de frota indisponível/);
    assert.match(texto, /\(fleet_unavailable\)/);
    assert.match(texto, /Isto não significa que não existam veículos registrados/);
    assert.equal(await page.locator('[data-testid="frota-tabela"]').count(), 0, 'falha não pode render tabela vazia');
    assert.equal(await page.locator('[data-testid="frota-metricas"]').count(), 0, 'falha não pode render indicador zero');
    assert.doesNotMatch(texto, /R\$\s?0,00/, 'falha nunca vira custo zero');
    assert.doesNotMatch(texto, /\b0 km\b/, 'falha nunca vira odômetro zero');
    await capture(page, 'desktop-frota-falha');
    await context.close();
  });
});

test('browser: a falha do histórico de regras não contamina o dossiê', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    // Só a leitura de regras é derrubada. O dossiê usa a mesma origem e
    // continua íntegro: são leituras independentes.
    const { context, page } = await abrir(browser, tiCookie, {
      failRoutes: ['/maintenance-rules'], status: 503, code: 'fleet_unavailable',
    });
    await page.getByText(veiculoCompleto.plate, { exact: false }).first().waitFor();
    await page.getByRole('row', { name: new RegExp(veiculoCompleto.plate) })
      .getByRole('button', { name: 'Ver dossiê canônico' }).click();
    await page.locator('[data-testid="frota-dossie-fatos"]').waitFor();

    const fatos = await page.locator('[data-testid="frota-dossie-fatos"]').textContent();
    assert.match(fatos, /Responsável sintético UX-07/, 'o dossiê continua lido apesar da falha vizinha');
    assert.equal(await page.locator('[data-testid="frota-dossie-erro"]').count(), 0, 'o dossiê não pode herdar a falha das regras');

    await page.getByRole('tab', { name: 'Regra de manutenção', exact: true }).click();
    const erroRegras = page.locator('[data-testid="frota-regras-erro"] [data-ui-state="error"]');
    await erroRegras.waitFor();
    const texto = await erroRegras.textContent();
    assert.match(texto, /Isto não significa que o veículo esteja sem regra de manutenção registrada/);
    assert.equal(await page.locator('[data-testid="frota-regras-lista"]').count(), 0, 'falha não pode listar regra vazia');
    assert.equal(await page.locator('[data-testid="frota-regras-vazio"]').count(), 0, 'falha não é vazio honesto');
    await context.close();
  });
});

test('browser: as sete abas são um tablist real, navegável por teclado', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, tiCookie);
    const abas = page.getByRole('tab');
    assert.equal(await abas.count(), 7, 'a tela declara sete abas reais');
    const primeira = page.getByRole('tab', { name: 'Frota registrada', exact: true });
    assert.equal(await primeira.getAttribute('aria-selected'), 'true');
    assert.equal(await primeira.getAttribute('tabindex'), '0', 'roving tabindex: só a ativa é focável');
    assert.equal(await page.getByRole('tab', { name: 'Registrar veículo', exact: true }).getAttribute('tabindex'), '-1');

    await primeira.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: 'Registrar veículo', exact: true }).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('End');
    const ultima = page.getByRole('tab', { name: 'Regra de manutenção', exact: true });
    assert.equal(await ultima.getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await primeira.getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await ultima.getAttribute('aria-selected'), 'true', '←  na primeira aba volta para a última');

    // Cada aba controla o painel que diz controlar.
    for (const [nome, painel] of [
      ['Frota registrada', 'frota-panel-frota'],
      ['Dossiê e alerta', 'frota-panel-dossie'],
      ['Documentos', 'frota-panel-documentos'],
    ]) {
      const aba = page.getByRole('tab', { name: nome, exact: true });
      assert.equal(await aba.getAttribute('aria-controls'), painel);
      await aba.click();
      await page.locator(`#${painel}[role="tabpanel"]`).waitFor();
    }
    await context.close();
  });
});

test('browser: a jornada sai em português, com ausência honesta e zero real', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, tiCookie);
    // Espera pelo CONTEÚDO carregado (a placa na tabela), nunca pelo contêiner.
    await page.getByText(veiculoCompleto.plate, { exact: false }).first().waitFor();
    const lista = await page.locator('[data-testid="frota-lista"]').textContent();
    assert.match(lista, /Flex/, 'o combustível sai em português');
    assert.match(lista, /Jornada canônica EXT-01/, 'a origem sai em português');
    assert.match(lista, /Sem responsável canônico registrado/, 'a ausência de responsável é nomeada');
    assert.doesNotMatch(lista, /jornada_frota|registro_legado|em_manutencao|\bflex\b/, 'nenhum valor cru do banco');
    // Zero REAL do servidor: o veículo sem histórico tem odômetro 0 e continua
    // aparecendo como `0 km`. A asserção é por LINHA, para não confundir com
    // o `0 km` que existe dentro de `10.600 km` na outra linha.
    const linhaVazia = await page.getByRole('row', { name: new RegExp(veiculoVazio.plate) }).textContent();
    assert.match(linhaVazia, /0 km/, 'o odômetro ZERO REAL do servidor continua aparecendo como 0 km');
    assert.doesNotMatch(linhaVazia, /Dado ausente/, 'zero real não pode ser confundido com ausência');

    // Dossiê: alerta derivado da regra vigente, custo canônico e trilha.
    await page.getByRole('row', { name: new RegExp(veiculoCompleto.plate) })
      .getByRole('button', { name: 'Ver dossiê canônico' }).click();
    await page.locator('[data-testid="frota-dossie-fatos"]').waitFor();
    const fatos = await page.locator('[data-testid="frota-dossie-fatos"]').textContent();
    assert.match(fatos, /Disponível/, 'a situação sai em português');
    assert.match(fatos, /10\.600 km/, 'a quilometragem canônica aparece como o servidor guardou');
    assert.match(fatos, /Dentro da antecedência da regra/, 'o alerta derivado sai em português');
    assert.match(fatos, /Critério por quilometragem/, 'o critério do alerta sai em português');
    assert.match(fatos, /Regra registrada: a cada 1\.000 km, avisando 1\.000 km antes/);
    assert.match(fatos, /Regra sintética vigente do gate UX-07/, 'a justificativa registrada aparece como veio');
    assert.doesNotMatch(fatos, /sem_regra|em_dia|vencida|\bkm\b:/, 'nenhum status cru de alerta');
    assert.doesNotMatch(fatos, /01\/01\/1970/, 'ausência nunca vira 01/01/1970');

    const custo = await page.locator('[data-testid="frota-custo"]').textContent();
    assert.match(custo, /318,75/, 'o custo de abastecimento vem dos centavos do servidor');
    assert.match(custo, /1\.250,00/, 'o custo de manutenção vem dos centavos do servidor');
    assert.match(custo, /1\.568,75/, 'o total é o que o servidor somou');

    const trilha = await page.locator('[data-testid="frota-eventos"]').textContent();
    assert.match(trilha, /Veículo registrado/, 'o evento de criação sai em português');
    assert.match(trilha, /Responsável atribuído/);
    assert.match(trilha, /Abastecimento registrado/);
    assert.match(trilha, /Manutenção registrada/);
    assert.match(trilha, /Regra de manutenção registrada/);
    assert.doesNotMatch(trilha, /veiculo_criado|manutencao_registrada/, 'nenhum event_type cru');

    // Regras: o histórico que o protótipo nunca lia, com a regra desativada.
    await page.getByRole('tab', { name: 'Regra de manutenção', exact: true }).click();
    await page.locator('[data-testid="frota-regras-lista"]').waitFor();
    const regras = await page.locator('[data-testid="frota-regras-lista"]').textContent();
    assert.match(regras, /Regra vigente/);
    assert.match(regras, /Regra desativada pelo servidor/, 'a regra desativada pelo servidor aparece no histórico');
    assert.match(regras, /a cada 365 dia\(s\), avisando 30 dia\(s\) antes/);

    // Veículo vazio: ausência honesta em todas as leituras derivadas.
    await page.getByRole('tab', { name: 'Frota registrada', exact: true }).click();
    await page.getByRole('row', { name: new RegExp(veiculoVazio.plate) })
      .getByRole('button', { name: 'Ver dossiê canônico' }).click();
    await page.locator('[data-testid="frota-dossie-fatos"]').waitFor();
    const vazioFatos = await page.locator('[data-testid="frota-dossie-fatos"]').textContent();
    assert.match(vazioFatos, /Nenhuma regra registrada/, 'sem regra, o alerta declara a ausência');
    assert.match(vazioFatos, /Sem responsável canônico registrado/);
    assert.match(vazioFatos, /Dado ausente/, 'campo realmente ausente é dito como ausente');
    assert.match(vazioFatos, /Quilometragem canônica\s*0 km/, 'odômetro zero real continua zero');
    assert.doesNotMatch(vazioFatos, /01\/01\/1970/);

    await page.getByRole('tab', { name: 'Abastecimentos', exact: true }).click();
    const semAbastecimento = page.locator('[data-testid="frota-abastecimentos-vazio"] [data-ui-state="empty"]');
    await semAbastecimento.waitFor();
    const textoAbastecimento = await semAbastecimento.textContent();
    assert.match(textoAbastecimento, /A leitura funcionou/i, 'vazio legítimo diz que a leitura funcionou');
    assert.match(textoAbastecimento, /Ausência de abastecimento não é custo zero/i);
    assert.equal(await page.locator('[data-testid="frota-abastecimentos-tabela"]').count(), 0);
    assert.equal(await page.locator('[data-testid="frota-abastecimentos-erro"]').count(), 0, 'vazio legítimo não é falha');

    await page.getByRole('tab', { name: 'Manutenções', exact: true }).click();
    const semManutencao = page.locator('[data-testid="frota-manutencoes-vazio"] [data-ui-state="empty"]');
    await semManutencao.waitFor();
    assert.match(await semManutencao.textContent(), /Ausência de manutenção registrada não é prova de veículo em dia/i);

    await page.getByRole('tab', { name: 'Documentos', exact: true }).click();
    const semDocumento = page.locator('[data-testid="frota-documentos-vazio"] [data-ui-state="empty"]');
    await semDocumento.waitFor();
    assert.match(await semDocumento.textContent(), /Ausência de documento registrado não é prova de documentação em dia/i);

    await page.getByRole('tab', { name: 'Regra de manutenção', exact: true }).click();
    const semRegra = page.locator('[data-testid="frota-regras-vazio"] [data-ui-state="empty"]');
    await semRegra.waitFor();
    assert.match(await semRegra.textContent(), /Sem regra explícita o servidor não infere alerta algum/i);

    await capture(page, 'desktop-frota-jornada');
    await context.close();
  });
});

test('browser: a escrita usa o texto de quem opera e preserva a chave na recusa', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, tiCookie);
    await page.getByText(veiculoCompleto.plate, { exact: false }).first().waitFor();
    await page.getByRole('row', { name: new RegExp(veiculoCompleto.plate) })
      .getByRole('button', { name: 'Ver dossiê canônico' }).click();
    await page.locator('[data-testid="frota-dossie-fatos"]').waitFor();
    await page.getByRole('tab', { name: 'Documentos', exact: true }).click();
    await page.locator('[data-testid="frota-documentos-lista"]').waitFor();

    // 1) Sem motivo escrito, o servidor recusa com o código real. A tela NÃO
    // escreve motivo no lugar de quem opera.
    await page.getByRole('button', { name: 'Desativar documento com motivo registrado' }).first().click();
    const erroAcao = page.locator('[data-testid="frota-action-error"]');
    await erroAcao.waitFor();
    const textoErro = await erroAcao.textContent();
    assert.match(textoErro, /Motivo obrigatório/i, 'a recusa real do servidor é mostrada como veio');
    assert.match(textoErro, /\(invalid_reason\)/, 'o código canônico fica no rodapé técnico');
    assert.match(textoErro, /Chave preservada para repetição segura/i);
    const chave = (textoErro.match(/ext01-docx-[0-9a-f-]{36}/) || [])[0];
    assert.ok(chave, `a chave de idempotência precisa aparecer na íntegra: ${textoErro}`);
    assert.equal(
      (await pool.query('SELECT is_active FROM ext_fleet_documents WHERE id=$1', [documentoAtivo])).rows[0].is_active,
      true,
      'a recusa não pode ter desativado o documento',
    );

    // 2) Com o motivo escrito por quem opera, a MESMA chave é reaproveitada e
    // o servidor confirma a desativação.
    await page.getByLabel(/Motivo da desativação deste documento/)
      .fill('Documento sintético substituído, conforme registro do gate UX-07.');
    await page.getByRole('button', { name: 'Desativar documento com motivo registrado' }).first().click();
    await page.locator('[data-testid="frota-documentos-lista"]').getByText('Desativado com autor e motivo').first().waitFor();
    assert.equal(await page.locator('[data-testid="frota-action-error"]').count(), 0,
      'confirmado pelo servidor, o erro anterior sai da tela');

    const persistido = await pool.query(
      'SELECT is_active, deactivate_reason, deactivated_by_identity FROM ext_fleet_documents WHERE id=$1', [documentoAtivo],
    );
    assert.equal(persistido.rows[0].is_active, false, 'o servidor realmente desativou o documento');
    assert.equal(persistido.rows[0].deactivate_reason, 'Documento sintético substituído, conforme registro do gate UX-07.',
      'o texto gravado é o de quem operou, não um texto inventado pela tela');
    assert.equal(persistido.rows[0].deactivated_by_identity, tiStaff.id, 'o autor é a identidade da sessão, não a tela');

    const evento = await pool.query(
      `SELECT idempotency_key FROM ext_fleet_vehicle_events
       WHERE vehicle_id=$1 AND event_type='documento_desativado'`, [veiculoCompleto.id],
    );
    assert.equal(evento.rowCount, 1, 'a trilha registra exatamente uma desativação');
    assert.equal(evento.rows[0].idempotency_key, chave, 'a chave preservada é a mesma usada na repetição');

    await capture(page, 'desktop-frota-escrita');
    await context.close();
  });
});

test('browser: em 390px a tela de frota não produz transbordo horizontal', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, tiCookie, { width: 390, height: 844 });
    await page.getByText(veiculoCompleto.plate, { exact: false }).first().waitFor();
    await page.locator('[data-testid="frota-tabela"]').waitFor();
    await page.waitForTimeout(600);
    const transbordo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(transbordo <= 1, `transbordo de ${transbordo}px em /admin/frota`);
    await capture(page, 'mobile-frota-390px');
    await context.close();
  });
});
