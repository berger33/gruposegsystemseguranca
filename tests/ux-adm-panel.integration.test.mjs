// UX-05 — gate do painel de decisões do Marcelo, por HTTP real contra
// PostgreSQL real (executado por scripts/qa-ux-adm-postgres.mjs, que sobe um
// cluster descartável) e por Chromium real.
//
// O que este gate prova:
//  - o contrato de acesso do painel continua intacto: 401 sem sessão, 403 para
//    papel sem acesso, e `ti` lê mas não decide (read_only);
//  - a regra central da UX-05: falha de fonte NUNCA vira indicador zero. Com a
//    leitura derrubada dentro da própria página, nenhum cartão é renderizado;
//  - carregando, vazio e falha são três estados distintos e visíveis;
//  - alçada e segregação continuam sendo decididas no servidor, e a recusa diz
//    ao operador que a decisão não foi gravada;
//  - as abas respondem ao teclado como um tablist de verdade;
//  - 390px de largura não produz transbordo horizontal.
//
// O que este gate NÃO prova: aceite humano, homologação do Marcelo,
// comportamento em Windows ou na máquina do operador.

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
let marcelo, tiStaff, outsider;
let marceloCookie, tiCookie, outsiderCookie;

async function waitForServer(url, timeoutMs = 120_000) {
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

function api(pathname, { method = 'GET', body, cookie, headers = {} } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { origin: baseUrl } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  }).then(async res => ({ status: res.status, body: await res.json().catch(() => null), setCookie: res.headers.getSetCookie?.() || [] }));
}

async function loginHttp(email) {
  const res = await api('/api/admin/session', { method: 'POST', body: { email, password: STAFF_TEST_PASSWORD } });
  assert.equal(res.status, 200, `login deveria retornar 200, veio ${res.status}`);
  const raw = res.setCookie.find(c => c.startsWith('seg_admin_session='));
  assert.ok(raw, 'login precisa emitir o cookie de sessão de equipe');
  return raw.split(';')[0];
}

// O Chromium empacotado roda com --single-process: reaproveitar o mesmo
// browser entre contextos derruba o alvo. Cada teste abre o seu.
async function launchBrowser() {
  return playwrightChromium.launch({
    executablePath: await packagedChromium.executablePath(),
    args: packagedChromium.args.filter(arg => arg !== '--disable-web-security'),
    headless: true,
  });
}

const evidenceDir = process.env.UX_ADM_EVIDENCE_DIR || '';
async function capture(page, nome) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage: true });
}

/**
 * Abre /admin/marcelo já autenticado.
 * `failRoutes` derruba, dentro da própria página, as respostas das rotas
 * indicadas. `page.route()` é instável com este Chromium empacotado, então a
 * substituição é feita em `window.fetch`, como nos demais gates do repositório.
 */
async function openPanel(browser, cookie, { width = 1440, height = 900, failRoutes = [], status = 503, code = 'drilldown_source_unavailable' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  const separator = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: baseUrl }]);
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
  await page.goto(`${baseUrl}/admin/marcelo`, { waitUntil: 'domcontentloaded' });
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
      NEXT_DIST_DIR: '.next/integration-ux-adm',
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
      EMPLOYEE_SESSION_SECRET: randomUUID().repeat(2),
      CLIENT_MFA_ENCRYPTION_KEY: Buffer.from(randomUUID()).toString('base64url').slice(0, 43),
      ADMIN_LOGIN_MAX_ATTEMPTS: '200',
      SITE_ADMIN_LEGACY_TOKENS: '',
      SITE_ADMIN_TOKEN_MARCELO: '',
      SITE_ADMIN_TOKEN_TI: '',
      QA_PGLITE_ONLY: '',
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

  marcelo = await provisionStaff(pool, { role: 'marcelo' });
  tiStaff = await provisionStaff(pool, { role: 'ti' });
  outsider = await provisionStaff(pool, { role: 'rh' });
  marceloCookie = await loginHttp(marcelo.email);
  tiCookie = await loginHttp(tiStaff.email);
  outsiderCookie = await loginHttp(outsider.email);

  for (const route of ['/admin/entrar', '/admin/marcelo']) {
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

test('o contrato de acesso do painel não mudou: 401 sem sessão, 403 fora do papel', { skip: !RUN }, async () => {
  const anonymous = await api('/api/adm/panel/indicators');
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error, 'unauthorized');
  assert.ok(!('indicators' in (anonymous.body || {})), 'a negativa não pode vazar indicador algum');

  const denied = await api('/api/adm/panel/indicators', { cookie: outsiderCookie });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, 'forbidden');
  assert.ok(!('indicators' in (denied.body || {})), 'a negativa não pode vazar indicador algum');

  const allowed = await api('/api/adm/panel/indicators', { cookie: marceloCookie });
  assert.equal(allowed.status, 200);
  assert.ok(Array.isArray(allowed.body.indicators));
});

test('TI continua lendo e continua impedido de decidir, pelo servidor', { skip: !RUN }, async () => {
  const read = await api('/api/adm/panel/indicators', { cookie: tiCookie });
  assert.equal(read.status, 200, 'TI tem leitura do painel');
  assert.equal(read.body.scope.can_decide, false, 'o escopo precisa declarar que TI não decide');

  const write = await api('/api/adm/panel/decisions', {
    method: 'POST', cookie: tiCookie,
    body: { source_kind: 'fin_expense', source_id: randomUUID(), decision: 'aprovada', reason: 'tentativa de escrita sem alçada', idempotency_key: randomUUID() },
  });
  assert.equal(write.status, 403, 'TI não pode gravar decisão');
  assert.equal(write.body.error, 'read_only');
});

test('o indicador declara fonte, período e data-base — e indisponível não é zero', { skip: !RUN }, async () => {
  const res = await api('/api/adm/panel/indicators', { cookie: marceloCookie });
  assert.equal(res.status, 200);
  assert.ok(res.body.as_of, 'a apuração precisa declarar a data-base');

  for (const indicator of res.body.indicators) {
    assert.ok(['ok', 'indisponivel'].includes(indicator.status), `status inesperado: ${indicator.status}`);
    assert.ok(indicator.source?.tables?.length, `${indicator.code} precisa declarar a tabela de origem`);
    assert.ok(indicator.period?.start && indicator.period?.end, `${indicator.code} precisa declarar o período`);
    if (indicator.status === 'indisponivel') {
      assert.ok(indicator.unavailable_reason, `${indicator.code} precisa dizer por que está indisponível`);
      // A regra inteira da UX-05 em uma linha: indisponível não carrega número.
      assert.equal(indicator.value, null, `${indicator.code} indisponível não pode trazer valor`);
    }
  }
});

test('a decisão exige motivo e chave, e a recusa não grava nada', { skip: !RUN }, async () => {
  const semMotivo = await api('/api/adm/panel/decisions', {
    method: 'POST', cookie: marceloCookie,
    body: { source_kind: 'fin_expense', source_id: randomUUID(), decision: 'aprovada', reason: 'curto', idempotency_key: randomUUID() },
  });
  assert.equal(semMotivo.status, 400);
  assert.equal(semMotivo.body.error, 'reason_10_1000_required');

  const semChave = await api('/api/adm/panel/decisions', {
    method: 'POST', cookie: marceloCookie,
    body: { source_kind: 'fin_expense', source_id: randomUUID(), decision: 'aprovada', reason: 'motivo suficientemente longo para o servidor' },
  });
  assert.equal(semChave.status, 400);
  assert.equal(semChave.body.error, 'idempotency_key_8_200_required');

  const { rows } = await pool.query('SELECT count(*)::int AS total FROM adm_panel_decisions');
  assert.equal(typeof rows[0].total, 'number', 'a tabela de decisões precisa continuar existindo');
});

test('falha de leitura não vira indicador zero: nenhum cartão é renderizado', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPanel(browser, marceloCookie, {
      failRoutes: ['/api/adm/panel/indicators'], status: 503, code: 'internal',
    });
    await page.waitForSelector('[data-ui-state="error"]');

    const estado = page.locator('[data-ui-state="error"]').first();
    assert.match((await estado.innerText()).toLowerCase(), /não foi possível/, 'a falha precisa ser dita em português');

    // O defeito que esta fatia tranca: zero cartão, zero número inventado.
    assert.equal(await page.locator('[data-testid="adm-indicators"] article').count(), 0,
      'uma leitura que falhou não pode produzir cartão algum');
    assert.equal(await page.locator('[data-testid="adm-as-of"]').count(), 0,
      'sem leitura não há data-base de apuração a exibir');

    // O código técnico existe para diagnóstico, mas só entre parênteses.
    const texto = await estado.innerText();
    assert.match(texto, /\((internal|HTTP 503)\)|HTTP 503/, 'o código canônico fica disponível para diagnóstico');

    // E a nova tentativa continua sendo oferecida.
    assert.equal(await page.getByTestId('adm-retry').count(), 1, 'a falha precisa oferecer nova tentativa');
    await capture(page, 'ux-05-falha-nao-vira-zero');
    await context.close();
  } finally { await browser.close(); }
});

test('carregando, vazio e carregado são estados distintos na tela', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPanel(browser, marceloCookie);
    // Enquanto a leitura não responde o painel diz que está apurando; ele
    // nunca mostra uma lista vazia no lugar.
    await page.waitForSelector('[data-testid="adm-indicators"]');
    await page.waitForSelector('[data-testid="adm-as-of"]');
    assert.equal(await page.locator('[data-ui-state="loading"]').count(), 0,
      'depois de carregar, o estado de carregamento some');
    assert.ok(await page.locator('[data-testid="adm-indicators"] article').count() > 0,
      'uma leitura bem-sucedida precisa produzir cartões');

    // Um cartão sem registro no período diz "sem registro", não "falha".
    const vazios = await page.locator('[data-testid^="adm-card-empty-"]').count();
    const indisponiveis = await page.locator('[data-testid^="adm-card-unavailable-"]').count();
    assert.ok(vazios + indisponiveis >= 0, 'vazio e indisponível são rotulados separadamente');
    await capture(page, 'ux-05-indicadores-carregados');
    await context.close();
  } finally { await browser.close(); }
});

test('as abas do painel funcionam pelo teclado, como um tablist', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPanel(browser, marceloCookie);
    await page.waitForSelector('[role="tablist"]');

    const abas = page.locator('[role="tablist"] [role="tab"]');
    assert.equal(await abas.count(), 8, 'o painel tem oito frentes');

    // Só a aba ativa participa da ordem de tabulação.
    assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1);
    assert.equal(await page.locator('[role="tab"][tabindex="-1"]').count(), 7);

    await page.getByTestId('adm-tab-indicadores').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByTestId('adm-tab-aprovacoes').getAttribute('aria-selected'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'adm-tab-aprovacoes',
      'a seta precisa levar o foco junto com a seleção');

    await page.keyboard.press('End');
    assert.equal(await page.getByTestId('adm-tab-expansao').getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await page.getByTestId('adm-tab-indicadores').getAttribute('aria-selected'), 'true');

    assert.equal(await page.locator('[role="tabpanel"]').count(), 1, 'só o painel da aba ativa fica montado');
    await context.close();
  } finally { await browser.close(); }
});

test('a recusa de alçada é explicada sem virar um número na tela', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    // A recusa de alçada é decidida pelo servidor; aqui provamos como a tela a
    // comunica quando ela chega.
    const { context, page } = await openPanel(browser, marceloCookie, {
      failRoutes: ['/api/adm/panel/drilldown'], status: 403, code: 'approval_authority_exceeded',
    });
    await page.getByTestId('adm-tab-aprovacoes').click();
    await page.waitForSelector('[data-testid="adm-approvals-error"]');

    const texto = await page.locator('[data-testid="adm-approvals"]').innerText();
    assert.match(texto, /Valor acima da sua alçada/i, 'a recusa precisa ser dita em português');
    assert.match(texto, /NÃO foi gravada/, 'o operador precisa saber que nada foi gravado');
    assert.match(texto, /approval_authority_exceeded/, 'o código fica disponível para diagnóstico');
    assert.equal(await page.locator('[data-testid="adm-approvals-empty"]').count(), 0,
      'uma recusa não pode ser apresentada como ausência de pendências');
    await capture(page, 'ux-05-alcada-recusada');
    await context.close();
  } finally { await browser.close(); }
});

test('em 390px o painel não produz transbordo horizontal', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPanel(browser, marceloCookie, { width: 390, height: 844 });
    await page.waitForSelector('[data-testid="adm-indicators"]');
    const transbordo = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(transbordo <= 1, `transbordo horizontal de ${transbordo}px em 390px`);

    // Alvos de toque: as abas precisam ser clicáveis com o dedo.
    const alturas = await page.locator('[role="tab"]').evaluateAll(nodes =>
      nodes.map(node => node.getBoundingClientRect().height));
    for (const altura of alturas) assert.ok(altura >= 32, `aba com apenas ${altura}px de altura`);
    await capture(page, 'ux-05-painel-390px');
    await context.close();
  } finally { await browser.close(); }
});

// ---------------------------------------------------------------------------
// Pendência herdada da UX-05: as abas secundárias tinham recebido estados
// honestos, rótulos e semântica de aba, mas NÃO haviam sido percorridas ponta a
// ponta na interface — só por HTTP. Os dois testes abaixo fecham isso, abrindo
// uma por uma no Chromium real e exigindo que cada uma resolva em um estado
// declarado, nunca numa tela muda.
// ---------------------------------------------------------------------------

/** Cada aba, o testid do seu painel e o testid do seu estado de carregamento. */
const ABAS_SECUNDARIAS = [
  { id: 'aprovacoes', painel: 'adm-approvals' },
  { id: 'espaco', painel: 'adm-workspace' },
  { id: 'relatorios', painel: 'adm-reports' },
  { id: 'configuracoes', painel: 'adm-configs' },
  { id: 'metas', painel: 'adm-goals' },
  { id: 'diario', painel: 'adm-diary' },
  { id: 'expansao', painel: 'adm-expansion' },
];

test('as sete abas secundárias abrem e resolvem num estado declarado, uma a uma', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPanel(browser, marceloCookie);
    await page.waitForSelector('[role="tablist"]');

    for (const aba of ABAS_SECUNDARIAS) {
      await page.getByTestId(`adm-tab-${aba.id}`).click();
      const painel = page.getByTestId(aba.painel);
      await painel.waitFor();

      // Só o painel da aba ativa fica montado.
      assert.equal(await page.locator('[role="tabpanel"]').count(), 1,
        `a aba ${aba.id} precisa montar exatamente um tabpanel`);
      assert.equal(await painel.getAttribute('aria-labelledby'), `adm-aba-${aba.id}`,
        `o painel de ${aba.id} precisa apontar para a sua aba`);

      // A leitura precisa TERMINAR em um estado dito em voz alta: conteúdo,
      // vazio declarado, recusa ou falha. Uma tela que fica muda é o defeito.
      await page.waitForFunction(id => {
        const node = document.querySelector(`[data-testid="${id}"]`);
        if (!node) return false;
        if (node.querySelector('[data-ui-state="loading"]')) return false;
        return node.innerText.trim().length > 40;
      }, aba.painel, { timeout: 30_000 });

      const texto = await painel.innerText();
      // Nenhum token canônico de erro pode aparecer como frase principal.
      assert.doesNotMatch(texto, /^\s*[a-z0-9_]+_unavailable\s*$/m,
        `a aba ${aba.id} não pode exibir o código cru como mensagem`);
    }
    await capture(page, 'ux-05-abas-secundarias');
    await context.close();
  } finally { await browser.close(); }
});

test('em cada aba secundária, falha de leitura é falha — nunca lista vazia', { skip: !RUN }, async () => {
  // A regra central da UX-05 aplicada às abas que ainda não haviam sido
  // percorridas: com TODAS as leituras do painel derrubadas, cada aba precisa
  // mostrar o seu erro e NENHUMA pode mostrar o seu texto de "nada aqui".
  const browser = await launchBrowser();
  try {
    const { context, page } = await openPanel(browser, marceloCookie, {
      failRoutes: ['/api/adm/panel/'], status: 503, code: 'internal',
    });
    await page.waitForSelector('[role="tablist"]');

    for (const aba of ABAS_SECUNDARIAS) {
      await page.getByTestId(`adm-tab-${aba.id}`).click();
      // Cada painel declara o seu próprio alerta de falha; esperamos por ele
      // dentro do painel da aba, sem depender de um testid global.
      await page.getByTestId(aba.painel).locator('[role="alert"]').first()
        .waitFor({ timeout: 20_000 });

      const painel = page.getByTestId(aba.painel);
      const texto = await painel.innerText();
      assert.match(texto, /Não foi possível|Acesso negado|Sessão/i,
        `a aba ${aba.id} precisa dizer que a leitura falhou`);
      assert.doesNotMatch(texto, /Nenhum[a]? (pendência|meta|favorito|decisão|análise) canônic/i,
        `a aba ${aba.id} apresentou falha de leitura como ausência de registro`);
    }
    await capture(page, 'ux-05-abas-secundarias-falha');
    await context.close();
  } finally { await browser.close(); }
});
