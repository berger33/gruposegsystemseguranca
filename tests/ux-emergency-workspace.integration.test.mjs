// UX-PRO-07B — gate aditivo da leitura de /admin/emergencial.
//
// Prova com HTTP, PostgreSQL descartável e Chromium reais: autorização das duas
// leituras, leitura inicial, vazio honesto, falha inicial com repetição real,
// preservação marcada em falha transitória de releitura, negativa pós-sucesso
// fail-closed, resposta 2xx malformada que não vira vazio, habilitação honesta
// das ações de ativação, transição canônica intacta, teclado, responsividade e
// tema. As falhas de leitura são injetadas apenas em window.fetch da página —
// nenhuma API é afrouxada e nenhuma mutação é simulada.
//
// Não substitui nem altera as asserções herdadas de tests/ext15-emergency*.test.mjs.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { recordKeyboardCapture } from '../scripts/ux-pro-00-keyboard-evidence.mjs';
import { provisionStaff, STAFF_TEST_PASSWORD } from './helpers/staff-login.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');
const evidenceDir = process.env.UX_EMERGENCY_EVIDENCE_DIR || '';
const uiTimeout = Number(process.env.UX_EMERGENCY_UI_TIMEOUT || 45_000);
const stage = 'ux-pro-07-emergencial';

let server;
let baseUrl;
let pool;
let adminCookie;
let rhCookie;
let firstChannel;
let secondChannel;
const evidenceEntries = [];

async function waitForServer(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/admin/session`, { headers: { accept: 'application/json' } });
      if (response.status === 401 || response.status === 200) return;
    } catch { /* servidor ainda iniciando */ }
    await new Promise(resolve => setTimeout(resolve, 400));
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
      ...(headers['idempotency-key'] === undefined && method !== 'GET' ? { 'idempotency-key': `ux-07b-${randomUUID()}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  }).then(async response => ({
    status: response.status,
    body: await response.json().catch(() => null),
    setCookie: response.headers.getSetCookie?.() || [],
  }));
}

async function loginStaffHttp(email) {
  const response = await api('/api/admin/session', { method: 'POST', body: { email, password: STAFF_TEST_PASSWORD } });
  assert.equal(response.status, 200, `login deveria retornar 200, veio ${response.status}`);
  const raw = response.setCookie.find(cookie => cookie.startsWith('seg_admin_session='));
  assert.ok(raw, 'login precisa emitir cookie de equipe');
  return raw.split(';')[0];
}

function channelPayload(name) {
  return {
    name,
    channel_type: 'telefone',
    recipient_name: 'Supervisor de plantão sintético',
    recipient_contact: 'contato-interno-do-gate',
    availability: 'Disponibilidade declarada 24 horas por dia, sujeita a conferência humana.',
    purpose: 'Apoio interno em ocorrências operacionais que exijam escalonamento humano.',
    escalation_steps: [{ responsible: 'Gestor de plantão', contact: 'contato-interno-escalacao', wait_minutes: 5 }],
  };
}

async function createChannel(name) {
  const response = await api('/api/ext/emergency/channels', { method: 'POST', cookie: adminCookie, body: channelPayload(name) });
  assert.equal(response.status, 201, `canal sintético deveria ser criado: ${JSON.stringify(response.body)}`);
  return response.body.channel;
}

/**
 * @sparticuz/chromium caches /tmp/chromium. Sem as bibliotecas de compatibilidade
 * AL2023 no caminho do carregador, o binário não inicia. Aqui o cache
 * descartável é inspecionado antes de cada lançamento, como faz o gate EXT-10.
 */
async function launchBrowser() {
  const alLib = path.join(tmpdir(), 'al2023', 'lib');
  process.env.AWS_EXECUTION_ENV = process.env.AWS_EXECUTION_ENV || 'AWS_Lambda_nodejs22.x';
  process.env.LD_LIBRARY_PATH = [alLib, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  if (!existsSync(path.join(alLib, 'libnspr4.so'))) {
    await rm(path.join(tmpdir(), 'chromium'), { force: true });
    await rm(path.join(tmpdir(), 'al2023'), { recursive: true, force: true });
  }
  return playwrightChromium.launch({
    executablePath: await packagedChromium.executablePath(),
    args: packagedChromium.args.filter(argument => argument !== '--disable-web-security'),
    headless: true,
  });
}

const CRASH = /Target (page|closed)|has been closed|Target crashed|browser has disconnected|crashed|SIGSEGV|Protocol error/i;
async function withBrowser(body) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const browser = await launchBrowser();
    try {
      return await body(browser);
    } catch (error) {
      if (error?.code === 'ERR_ASSERTION' || !CRASH.test(String(error?.message || ''))) throw error;
      lastError = error;
      console.log(`UX_EMERGENCY_BROWSER_RETRY tentativa=${attempt}: ${String(error.message).split('\n')[0]}`);
    } finally {
      await browser.close().catch(() => {});
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw lastError;
}

/**
 * Abre a tela com controles de falha por leitura. `list` afeta
 * `GET /api/ext/emergency/channels`; `detail` afeta o GET do canal; as mutações
 * (POST) nunca são interceptadas — elas saem para o servidor de verdade e ficam
 * registradas em `window.__uxEmergencyControl.mutations` para inspeção.
 */
async function openEmergency(browser, {
  width = 1440,
  height = 900,
  list = {},
  detail = {},
} = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  const separator = adminCookie.indexOf('=');
  await context.addCookies([{
    name: adminCookie.slice(0, separator),
    value: adminCookie.slice(separator + 1),
    url: baseUrl,
  }]);
  const page = await context.newPage();
  page.setDefaultTimeout(uiTimeout);
  page.setDefaultNavigationTimeout(90_000);
  await page.addInitScript(control => {
    const original = window.fetch.bind(window);
    window.__uxEmergencyControl = {
      list: { ...control.list },
      detail: { ...control.detail },
      calls: { list: 0, detail: 0 },
      mutations: [],
    };
    const fire = async (rule, body) => {
      if (rule.delay > 0) await new Promise(resolve => setTimeout(resolve, rule.delay));
      const shouldFail = rule.fail || rule.failCount > 0;
      if (rule.failCount > 0) rule.failCount -= 1;
      if (shouldFail) {
        return new Response(JSON.stringify({ error: rule.code || 'emergency_unavailable' }), {
          status: rule.status || 503,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (rule.malformed) {
        return new Response(JSON.stringify({ note: 'resposta sem items' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return original(body.input, body.init);
    };
    window.fetch = async (input, init) => {
      const raw = typeof input === 'string' ? input : (input?.url || '');
      const pathname = new URL(raw, window.location.origin).pathname;
      const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
      if (method === 'POST') {
        window.__uxEmergencyControl.mutations.push({
          url: pathname,
          method,
          body: typeof init?.body === 'string' ? init.body : null,
          idempotencyKey: init?.headers ? (init.headers['Idempotency-Key'] || init.headers['idempotency-key'] || null) : null,
        });
        return original(input, init);
      }
      if (method === 'GET' && pathname === '/api/ext/emergency/channels') {
        window.__uxEmergencyControl.calls.list += 1;
        return fire(window.__uxEmergencyControl.list, { input, init });
      }
      if (method === 'GET' && /^\/api\/ext\/emergency\/channels\/[0-9a-f-]{36}$/i.test(pathname)) {
        window.__uxEmergencyControl.calls.detail += 1;
        return fire(window.__uxEmergencyControl.detail, { input, init });
      }
      return original(input, init);
    };
  }, { list, detail });
  await page.goto(`${baseUrl}/admin/emergencial`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1, name: /Apoio emergencial/i }).waitFor();
  return { context, page };
}

const ACTION_LABELS = [
  'Iniciar ciclo de testes',
  'Registrar teste de recebimento bem-sucedido',
  'Registrar teste de atendimento bem-sucedido',
  'Marcar ativo (decisão humana)',
];

async function actionStates(page) {
  const states = {};
  for (const label of ACTION_LABELS) {
    const button = page.getByRole('button', { name: label, exact: true });
    states[label] = {
      count: await button.count(),
      enabled: await button.count() ? await button.isEnabled() : null,
    };
  }
  return states;
}

async function blockedReason(page) {
  const blocked = page.locator('[data-testid="emergencial-acoes-bloqueio"]');
  if (await blocked.count()) return `bloqueio: ${(await blocked.innerText()).trim()}`;
  const free = page.locator('[data-testid="emergencial-acoes-liberadas"]');
  if (await free.count()) return `liberadas: ${(await free.innerText()).trim()}`;
  return 'motivo não declarado';
}

async function writeEvidenceSummary() {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  const entries = [...new Map(evidenceEntries.map(entry => [path.basename(entry.screenshot), entry])).values()];
  await writeFile(path.join(evidenceDir, 'resumo.json'), `${JSON.stringify({
    stage,
    generatedBy: 'npm run test:ux-emergency:pg (PostgreSQL descartavel + HTTP real + Chromium)',
    notes: 'Massa inteiramente sintetica criada pela API EXT-15. problems resulta das medicoes automatizadas; nao representa validacao manual, homologacao nem aceite humano.',
    entries,
  }, null, 2)}\n`, 'utf8');
}

/**
 * Mede a superfície viva da tela antes de capturar: transbordo do documento e
 * menor alvo clicável dentro de `[data-task-workspace]` (o envelope do
 * AdminGate pertence a outra fatia). As mesmas medições alimentam `problems`.
 */
async function measureSurface(page, label = 'superfície') {
  const overflowDocumentoPx = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflowDocumentoPx <= 1, `transbordo de ${overflowDocumentoPx}px em ${label}`);
  const targets = await page.locator('[data-task-workspace] button, [data-task-workspace] select, [data-task-workspace] input').evaluateAll(elements => elements
    .map(element => ({ height: Math.round(element.getBoundingClientRect().height), visible: element.getBoundingClientRect().height > 0 }))
    .filter(item => item.visible)
    .map(item => item.height));
  const menorAlvoPx = Math.min(...targets);
  assert.ok(menorAlvoPx >= 44, `alvos precisam ter pelo menos 44px; medido ${menorAlvoPx}px em ${label}`);
  return { overflowDocumentoPx, menorAlvoPx };
}

/**
 * `problems` é derivado das medições registradas na entrada (nunca um literal):
 * transbordo acima de 1 px, alvo abaixo de 44 px ou contraste abaixo de 4,5:1
 * viram problema declarado.
 */
function measuredProblems(extra) {
  const problems = [];
  if (Number.isFinite(extra.overflowDocumentoPx) && extra.overflowDocumentoPx > 1) {
    problems.push(`overflowDocumentoPx=${extra.overflowDocumentoPx}px acima de 1px`);
  }
  if (Number.isFinite(extra.menorAlvoPx) && extra.menorAlvoPx < 44) {
    problems.push(`menorAlvoPx=${extra.menorAlvoPx}px abaixo de 44px`);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (key.startsWith('contraste') && typeof value === 'number' && value < 4.5) {
      problems.push(`${key}=${value}:1 abaixo de 4.5:1`);
    }
  }
  return problems;
}

async function capture(page, name, extra = {}) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  const file = path.join(evidenceDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const viewport = page.viewportSize();
  evidenceEntries.push({
    stage,
    route: '/admin/emergencial',
    role: 'admin',
    viewport: `${viewport.width}x${viewport.height}`,
    theme: await page.evaluate(() => document.documentElement.dataset.adminTheme || 'day'),
    screenshot: path.relative(root, file).replaceAll('\\', '/'),
    motivoAcao: await blockedReason(page),
    ...extra,
    problems: measuredProblems(extra),
  });
  await writeEvidenceSummary();
}

async function contrast(page, selector) {
  return page.locator(selector).first().evaluate(element => {
    const parse = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = rgb => {
      const values = rgb.map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
    };
    const background = node => {
      let current = node;
      while (current) {
        const value = getComputedStyle(current).backgroundColor;
        if (value && !/rgba\([^)]*,\s*0\s*\)$/.test(value) && value !== 'transparent') return parse(value);
        current = current.parentElement;
      }
      return [255, 255, 255];
    };
    const foreground = parse(getComputedStyle(element).color);
    const back = background(element);
    const [lighter, darker] = [luminance(foreground), luminance(back)].sort((a, b) => b - a);
    return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
  });
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
      DATABASE_URL: process.env.DATABASE_URL,
      NEXT_DIST_DIR: '.next/integration-ux-emergency',
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
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const admin = await provisionStaff(pool, { role: 'admin' });
  const rh = await provisionStaff(pool, { role: 'rh' });
  for (const permission of ['emergency.read', 'emergency.write', 'emergency.test', 'emergency.activate']) {
    await pool.query(
      `INSERT INTO auth_permissions (id,identity_id,permission,scope_type,granted_by,granted_by_role,reason)
       VALUES ($1,$2,$3,'global',$2,'admin','gate focal UX-PRO-07B') ON CONFLICT DO NOTHING`,
      [randomUUID(), admin.id, permission],
    );
  }
  adminCookie = await loginStaffHttp(admin.email);
  rhCookie = await loginStaffHttp(rh.email);

  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/admin/emergencial`, { redirect: 'manual' }).catch(() => null);
    if (response && response.status !== 404) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
});

after(async () => {
  await writeEvidenceSummary().catch(() => {});
  await pool?.end().catch(() => {});
  if (server && !server.killed) {
    server.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 300));
    server.kill('SIGKILL');
  }
});

test('EXT-15 continua recusando anônimo e papel sem permissão nas duas leituras', { skip: !RUN }, async () => {
  const anonymousList = await api('/api/ext/emergency/channels');
  assert.equal(anonymousList.status, 401);
  assert.ok(!('items' in (anonymousList.body || {})), 'negativa anônima não pode vazar canais');
  const anonymousDetail = await api(`/api/ext/emergency/channels/${randomUUID()}`);
  assert.equal(anonymousDetail.status, 401);

  const deniedList = await api('/api/ext/emergency/channels', { cookie: rhCookie });
  assert.equal(deniedList.status, 403);
  assert.ok(!('items' in (deniedList.body || {})), 'negativa por papel não pode vazar canais');
  const deniedDetail = await api(`/api/ext/emergency/channels/${randomUUID()}`, { cookie: rhCookie });
  assert.equal(deniedDetail.status, 403);

  const allowed = await api('/api/ext/emergency/channels', { cookie: adminCookie });
  assert.equal(allowed.status, 200);
  assert.ok(Array.isArray(allowed.body.items));
});

test('browser: leitura ainda não concluída não é vazio, e o vazio só aparece depois da resposta', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser, { list: { delay: 1500 } });
    const loading = page.locator('[data-testid="emergencial-lista-carregando"]');
    await loading.waitFor();
    assert.equal(await loading.locator('[data-ui-state="loading"]').count(), 1);
    assert.equal(await page.locator('[data-testid="emergencial-lista-vazio"]').count(), 0,
      'vazio não pode aparecer antes de a leitura terminar');
    assert.match(await loading.innerText(), /não é zero|não significa|aguarde/i);

    const empty = page.locator('[data-testid="emergencial-lista-vazio"]');
    await empty.waitFor();
    assert.equal(await empty.locator('[data-ui-state="empty"]').count(), 1);
    const text = await empty.innerText();
    assert.match(text, /consulta foi concluída/i);
    assert.match(text, /nenhum canal/i);
    await capture(page, 'emergencial-1440-vazio', {
      estado: 'vazio_concluido',
      ...await measureSurface(page, '1440px no vazio concluído'),
    });
    await context.close();
  });
});

test('EXT-15 cria o canal sintético pela API real e ele nasce em rascunho', { skip: !RUN }, async () => {
  firstChannel = await createChannel(`Plantão sintético UX-PRO-07B ${randomUUID().slice(0, 8)}`);
  assert.equal(firstChannel.status, 'rascunho');
  assert.equal(firstChannel.origin, 'ext15_canonica');
  const detail = await api(`/api/ext/emergency/channels/${firstChannel.id}`, { cookie: adminCookie });
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.readiness, { receiving_ok: false, attendance_ok: false, ready: false });
});

test('browser: falha inicial declara causa real e Tentar novamente faz nova leitura', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser, { list: { fail: true, status: 503, code: 'emergency_unavailable' } });
    const failure = page.locator('[data-testid="emergencial-lista-falha"]');
    await failure.waitFor();
    assert.equal(await failure.locator('[data-ui-state="error"]').count(), 1);
    const text = await failure.innerText();
    assert.match(text, /emergency_unavailable/);
    assert.match(text, /não significa/i);
    assert.equal(await page.locator('[data-testid="emergencial-lista-vazio"]').count(), 0,
      'falha nunca pode ser apresentada como ausência de canais');
    await capture(page, 'emergencial-1440-falha-inicial', {
      estado: 'falha_inicial',
      ...await measureSurface(page, '1440px na falha inicial'),
    });

    await page.evaluate(() => { window.__uxEmergencyControl.list.fail = false; });
    await failure.getByRole('button', { name: 'Tentar novamente' }).click();
    const cards = page.locator('[data-testid="emergencial-lista-canais"]');
    await cards.waitFor();
    assert.match(await cards.innerText(), new RegExp(firstChannel.name));
    assert.ok(await page.evaluate(() => window.__uxEmergencyControl.calls.list >= 2), 'repetição precisa reler de verdade');
    await context.close();
  });
});

test('browser: falha de releitura preserva a lista, informa a hora e a repetição atualiza de verdade', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser);
    const cards = page.locator('[data-testid="emergencial-lista-canais"]');
    await cards.waitFor();
    assert.match(await cards.innerText(), new RegExp(firstChannel.name));

    await page.evaluate(() => {
      window.__uxEmergencyControl.list.fail = true;
      window.__uxEmergencyControl.list.status = 503;
      window.__uxEmergencyControl.list.code = 'emergency_refresh_unavailable';
    });
    await page.locator('[data-testid="emergencial-lista-atualizar"]').click();
    const stale = page.locator('[data-testid="emergencial-lista-desatualizado"]');
    await stale.waitFor();
    const staleText = await stale.innerText();
    assert.match(staleText, /última leitura concluída/i);
    assert.match(staleText, /\d{2}:\d{2}:\d{2}/);
    assert.match(staleText, /emergency_refresh_unavailable/);
    assert.match(await cards.innerText(), new RegExp(firstChannel.name), 'dado lido continua visível e marcado');

    secondChannel = await createChannel(`Canal criado durante a falha ${randomUUID().slice(0, 8)}`);
    assert.doesNotMatch(await cards.innerText(), new RegExp(secondChannel.name), 'o canal novo ainda não pertence ao recorte preservado');

    const staleContrast = await contrast(page, '[data-testid="emergencial-lista-desatualizado"]');
    assert.ok(staleContrast >= 4.5, `contraste da faixa desatualizada precisa ser >= 4.5:1, medido ${staleContrast}:1`);
    await capture(page, 'emergencial-1440-desatualizado', {
      estado: 'releitura_falhou_lista_preservada',
      contrasteFaixa: staleContrast,
      ...await measureSurface(page, '1440px com dado preservado'),
    });

    await page.evaluate(() => { window.__uxEmergencyControl.list.fail = false; });
    await stale.getByRole('button', { name: 'Tentar novamente' }).click();
    await stale.waitFor({ state: 'detached' });
    await page.locator('[data-testid="emergencial-lista-canais"]')
      .getByRole('heading', { name: secondChannel.name, exact: true }).waitFor();
    assert.match(await cards.innerText(), new RegExp(secondChannel.name), 'repetição bem-sucedida mostra leitura nova');
    await context.close();
  });
});

test('browser: negativa depois do sucesso falha fechada e não mantém canal nem trilha protegidos', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser);
    await page.locator('[data-testid="emergencial-lista-canais"]').waitFor();
    await page.locator('[data-testid="emergencial-detalhe-trilha"]').waitFor();

    await page.evaluate(() => {
      window.__uxEmergencyControl.list.fail = true;
      window.__uxEmergencyControl.list.status = 403;
      window.__uxEmergencyControl.list.code = 'forbidden';
      window.__uxEmergencyControl.detail.fail = true;
      window.__uxEmergencyControl.detail.status = 401;
      window.__uxEmergencyControl.detail.code = 'unauthorized';
    });
    await page.locator('[data-testid="emergencial-lista-atualizar"]').click();
    const denied = page.locator('[data-testid="emergencial-lista-negado"]');
    await denied.waitFor();
    assert.equal(await denied.locator('[data-ui-state="denied"]').count(), 1);
    assert.equal(await page.locator('[data-testid="emergencial-lista-canais"]').count(), 0,
      'negativa remove a lista lida anteriormente');
    assert.equal(await denied.getByRole('button').count(), 0, 'negativa não oferece repetição da mesma chamada');
    assert.equal(await page.locator('[data-testid="emergencial-lista-desatualizado"]').count(), 0,
      'negativa não é apresentada como dado desatualizado');
    assert.equal(await page.locator('[data-testid="emergencial-detalhe-trilha"]').count(), 0,
      'perda de autorização não mantém a trilha protegida visível');
    const states = await actionStates(page);
    for (const label of ACTION_LABELS) {
      assert.equal(states[label].enabled, false, `${label} precisa ficar bloqueada quando a sessão perde autorização`);
    }
    assert.match(await blockedReason(page), /bloqueio/i);
    await context.close();
  });
});

test('browser: resposta 2xx malformada não vira vazio', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser, { list: { malformed: true } });
    const failure = page.locator('[data-testid="emergencial-lista-falha"]');
    await failure.waitFor();
    const text = await failure.innerText();
    assert.match(text, /invalid_emergency_response/);
    assert.equal(await page.locator('[data-testid="emergencial-lista-vazio"]').count(), 0,
      'resposta sem items não pode ser apresentada como vazio');
    assert.equal(await page.locator('[data-testid="emergencial-lista-canais"]').count(), 0);
    await context.close();
  });
});

test('browser: ações bloqueadas com motivo durante a leitura e liberadas só depois de ler e selecionar', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser, { list: { delay: 1800 } });
    await page.locator('[data-testid="emergencial-lista-carregando"]').waitFor();
    const duringLoad = await actionStates(page);
    for (const label of ACTION_LABELS) {
      assert.equal(duringLoad[label].enabled, false, `${label} não pode ficar habilitada durante a leitura`);
    }
    const loadingReason = await blockedReason(page);
    assert.match(loadingReason, /bloqueio/i);
    assert.match(loadingReason, /lida com sucesso/i);
    await capture(page, 'emergencial-1440-acoes-bloqueadas', {
      estado: 'leitura_em_andamento',
      motivoBloqueio: loadingReason,
      ...await measureSurface(page, '1440px com ações bloqueadas'),
    });

    await page.locator('[data-testid="emergencial-lista-canais"]').waitFor();
    await page.locator('[data-testid="emergencial-acoes-liberadas"]').waitFor();
    const afterLoad = await actionStates(page);
    for (const label of ACTION_LABELS) {
      assert.equal(afterLoad[label].enabled, true, `${label} precisa ser liberada depois da leitura com canal válido`);
    }
    const freeReason = await blockedReason(page);
    assert.match(freeReason, /liberadas/i);
    await capture(page, 'emergencial-1440-acoes-liberadas', {
      estado: 'pronto_acoes_liberadas',
      motivoHabilitacao: freeReason,
      ...await measureSurface(page, '1440px com ações liberadas'),
    });

    // Dado desatualizado volta a bloquear as ações que mudam estado canônico.
    await page.evaluate(() => {
      window.__uxEmergencyControl.list.fail = true;
      window.__uxEmergencyControl.list.status = 503;
      window.__uxEmergencyControl.list.code = 'emergency_refresh_unavailable';
    });
    await page.locator('[data-testid="emergencial-lista-atualizar"]').click();
    await page.locator('[data-testid="emergencial-lista-desatualizado"]').waitFor();
    const stale = await actionStates(page);
    for (const label of ACTION_LABELS) {
      assert.equal(stale[label].enabled, false, `${label} não pode mudar estado canônico com dado desatualizado`);
    }
    const staleReason = await blockedReason(page);
    assert.match(staleReason, /bloqueio/i);
    assert.match(staleReason, /desatualizad/i);

    await page.evaluate(() => { window.__uxEmergencyControl.list.fail = false; });
    await page.locator('[data-testid="emergencial-lista-desatualizado"]').getByRole('button', { name: 'Tentar novamente' }).click();
    await page.locator('[data-testid="emergencial-acoes-liberadas"]').waitFor();
    for (const label of ACTION_LABELS) {
      assert.equal((await actionStates(page))[label].enabled, true, `${label} volta a ser liberada após a releitura`);
    }
    await context.close();
  });
});

test('browser: transição canônica rascunho → em_teste continua idêntica quando a ação é liberada', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser);
    await page.locator('[data-testid="emergencial-lista-canais"]').waitFor();
    await page.getByRole('heading', { level: 1, name: /Apoio emergencial/i }).waitFor();
    await page.locator('[data-testid="emergencial-canal-select"]').selectOption(firstChannel.id);
    await page.locator('[data-testid="emergencial-detalhe-trilha"]').waitFor();

    await page.getByRole('button', { name: 'Iniciar ciclo de testes', exact: true }).click();
    await page.locator('[data-testid="emergencial-escrita-mensagem"]').waitFor();
    await page.waitForFunction(channelId => {
      const text = document.querySelector('[data-testid="emergencial-detalhe-trilha"]')?.textContent || '';
      return text.includes(channelId) && text.includes('"status": "em_teste"');
    }, firstChannel.id);

    const sent = await page.evaluate(() => window.__uxEmergencyControl.mutations.map(item => ({ ...item })));
    assert.equal(sent.length, 1, 'a ação liberada precisa enviar exatamente uma mutação');
    assert.equal(sent[0].method, 'POST');
    assert.equal(sent[0].url, `/api/ext/emergency/channels/${firstChannel.id}/transition`);
    assert.deepEqual(JSON.parse(sent[0].body), { status: 'em_teste' }, 'o corpo da transição não pode mudar');
    assert.match(String(sent[0].idempotencyKey), /^ext15-ui-testing-\d+-[0-9a-f]+$/, 'a Idempotency-Key continua vindo do mesmo gerador');

    const detail = await api(`/api/ext/emergency/channels/${firstChannel.id}`, { cookie: adminCookie });
    assert.equal(detail.body.channel.status, 'em_teste');
    assert.equal(detail.body.events.at(-1).event_type, 'emergency_em_teste');
    const audit = await pool.query(
      "SELECT count(*)::int AS total FROM auth_access_audit WHERE actor_id=$1 AND action='emergency_channel_transition' AND result='allowed'",
      [detail.body.events.at(-1).created_by_identity],
    );
    assert.ok(audit.rows[0].total >= 1, 'a transição precisa continuar auditada');
    await context.close();
  });
});

test('browser: teclado alcança seleção e ações com foco visível, e trocar de canal relê a trilha', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser, { width: 390, height: 844 });
    await page.locator('[data-testid="emergencial-lista-canais"]').waitFor();
    await page.locator('[data-testid="emergencial-detalhe-trilha"]').waitFor();
    assert.ok(await page.evaluate(() => window.__uxEmergencyControl.calls.detail >= 1),
      'o canal selecionado precisa ser lido sem clique');

    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    const select = page.locator('[data-testid="emergencial-canal-select"]');
    let reachedSelect = false;
    let firstFocusVisible = false;
    const traversal = [];
    for (let step = 0; step < 70 && !reachedSelect; step++) {
      await page.keyboard.press('Tab');
      const target = await page.evaluate(() => {
        const element = document.activeElement;
        return element?.getAttribute?.('data-testid')
          || element?.getAttribute?.('aria-label')
          || element?.textContent?.trim().slice(0, 60)
          || element?.tagName?.toLowerCase()
          || 'desconhecido';
      });
      traversal.push(target);
      if (step === 0) {
        firstFocusVisible = await page.evaluate(() => {
          const element = document.activeElement;
          if (!(element instanceof HTMLElement)) return false;
          const style = getComputedStyle(element);
          return style.outlineStyle !== 'none' && (parseFloat(style.outlineWidth) || 0) >= 1;
        });
      }
      reachedSelect = await select.evaluate(element => element === document.activeElement);
    }
    assert.ok(firstFocusVisible, 'o primeiro foco por Tab precisa ser visível');
    assert.ok(reachedSelect, 'a seleção do canal precisa ser alcançável por Tab');

    const selectedBeforeArrow = await select.inputValue();
    const before = await page.evaluate(() => window.__uxEmergencyControl.calls.detail);
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(previous => window.__uxEmergencyControl.calls.detail > previous, before);
    const selectedValue = await select.inputValue();
    assert.notEqual(selectedValue, selectedBeforeArrow, 'a seta precisa trocar o canal selecionado');
    await page.waitForFunction(channelId => (document.querySelector('[data-testid="emergencial-detalhe-trilha"]')?.textContent || '').includes(channelId), selectedValue);
    assert.ok(await page.evaluate(() => window.__uxEmergencyControl.calls.detail >= 2), 'trocar de canal precisa reler a trilha de verdade');

    for (const label of ACTION_LABELS) {
      const button = page.getByRole('button', { name: label, exact: true });
      await button.scrollIntoViewIfNeeded();
      await button.focus();
      const outline = await button.evaluate(element => ({
        style: getComputedStyle(element).outlineStyle,
        width: parseFloat(getComputedStyle(element).outlineWidth) || 0,
      }));
      assert.ok(outline.style !== 'none' || outline.width >= 1, `foco visível ausente em ${label}`);
    }

    await capture(page, 'emergencial-390-teclado', {
      estado: 'pronto_leitura_com_dados',
      firstFocus: true,
      percursoTeclado: traversal,
      ...await measureSurface(page, '390px no percurso de teclado'),
    });
    await recordKeyboardCapture(evidenceDir, {
      stage,
      route: '/admin/emergencial',
      role: 'admin',
      viewport: '390x844',
      theme: 'day',
      file: 'emergencial-390-teclado.png',
      firstFocus: true,
      percursoTeclado: traversal,
    });
    if (evidenceDir) {
      const summary = JSON.parse(await readFile(path.join(evidenceDir, 'resumo.json'), 'utf8'));
      const entry = summary.entries.find(item => path.basename(item.screenshot || item.file || '') === 'emergencial-390-teclado.png');
      assert.ok(entry?.firstFocus);
      assert.ok(entry?.percursoTeclado?.length > 0);
      assert.deepEqual(entry.problems, []);
    }
    await context.close();
  });
});

test('browser: 320 390 768 1440, tema noturno, alvos e contrastes medidos sem problemas', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser);
    await page.locator('[data-testid="emergencial-lista-canais"]').waitFor();
    for (const [width, height] of [[1440, 900], [768, 1024], [390, 844], [320, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(500);
      const surface = await measureSurface(page, `${width}px no tema dia`);
      await capture(page, `emergencial-${width}-dia`, {
        estado: 'pronto_leitura_com_dados',
        overflowDocumentoPx: surface.overflowDocumentoPx,
        menorAlvoPx: surface.menorAlvoPx,
      });

      if (width === 768) {
        await page.click('[data-admin-theme-toggle="true"]');
        await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
        await page.waitForTimeout(400);
        const nightSurface = await measureSurface(page, '768px no tema noite');
        const nightContrast = {
          titulo: await contrast(page, 'h1'),
          kicker: await contrast(page, '[data-testid="emergencial-kicker"]'),
          lede: await contrast(page, '[data-testid="emergencial-lede"]'),
          avisoFundoCreme: await contrast(page, '[data-testid="emergencial-limite-prova"]'),
          cartaoCanal: await contrast(page, '[data-testid="emergencial-lista-canais"] article'),
          faixaAcoes: await contrast(page, '[data-testid="emergencial-acoes-liberadas"]'),
        };
        for (const [name, ratio] of Object.entries(nightContrast)) {
          assert.ok(ratio >= 4.5, `contraste noturno de ${name} precisa ser >= 4.5:1, medido ${ratio}:1`);
        }
        await capture(page, 'emergencial-768-noite', {
          overflowDocumentoPx: nightSurface.overflowDocumentoPx,
          menorAlvoPx: nightSurface.menorAlvoPx,
          contrasteTitulo: nightContrast.titulo,
          contrasteKicker: nightContrast.kicker,
          contrasteAvisoFundoCreme: nightContrast.avisoFundoCreme,
          contrasteFaixaAcoes: nightContrast.faixaAcoes,
          estado: 'pronto_leitura_com_dados',
        });
        await page.click('[data-admin-theme-toggle="true"]');
        await page.waitForFunction(() => document.documentElement.dataset.adminTheme !== 'night');
      }
    }
    await context.close();
  });
});

test('browser: contraste no tema claro e noturno da falha inicial, com rótulo real e sem vazio falso', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser, { list: { fail: true, status: 503, code: 'emergency_unavailable' } });
    await page.locator('[data-testid="emergencial-lista-falha"]').waitFor();
    const dayContrast = await contrast(page, '[data-testid="emergencial-lista-falha"] p:last-of-type');
    assert.ok(dayContrast >= 4.5, `contraste claro da falha precisa ser >= 4.5:1, medido ${dayContrast}:1`);
    await page.click('[data-admin-theme-toggle="true"]');
    await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
    await page.waitForTimeout(400);
    const nightContrast = await contrast(page, '[data-testid="emergencial-lista-falha"] p:last-of-type');
    assert.ok(nightContrast >= 4.5, `contraste noturno da falha precisa ser >= 4.5:1, medido ${nightContrast}:1`);
    assert.equal(await page.locator('[data-testid="emergencial-lista-vazio"]').count(), 0);
    await capture(page, 'emergencial-1440-falha-inicial-noite', {
      estado: 'falha_inicial',
      contrasteFalhaDia: dayContrast,
      contrasteFalhaNoite: nightContrast,
      ...await measureSurface(page, '1440px na falha inicial no tema noite'),
    });
    await context.close();
  });
});