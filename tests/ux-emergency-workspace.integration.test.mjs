// UX-PRO-07B-2 — gate aditivo de /admin/emergencial.
//
// Prova com HTTP, PostgreSQL descartável e Chromium reais: autorização e estados
// das leituras, estados de escrita, replay com a mesma chave idempotente, resumo
// legível da trilha, ajuda e obrigatoriedade dos campos, teclado, responsividade
// e tema. A perda de resposta é injetada depois do commit real no servidor; as
// demais falhas de UI são isoladas em window.fetch, sem afrouxar as APIs.
//
// Não substitui nem enfraquece os contratos herdados de tests/ext15-emergency*.test.mjs.
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
let writeDraft;
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
 * Abre a tela com controles de falha por leitura e escrita. `list` afeta
 * `GET /api/ext/emergency/channels`; `detail` afeta o GET do canal. As mutações
 * ficam registradas em `window.__uxEmergencyControl.mutations`; quando não há
 * regra de falha elas chegam ao servidor real, e `dropResponseCount` só descarta
 * a resposta depois de o servidor concluir o commit.
 */
async function openEmergency(browser, {
  width = 1440,
  height = 900,
  list = {},
  detail = {},
  mutation = {},
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
      mutation: { failCount: 0, malformedCount: 0, dropResponseCount: 0, ...control.mutation },
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
      const shouldMalformed = rule.malformed || rule.malformedCount > 0;
      if (rule.malformedCount > 0) rule.malformedCount -= 1;
      if (shouldMalformed) {
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
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        window.__uxEmergencyControl.mutations.push({
          url: pathname,
          method,
          body: typeof init?.body === 'string' ? init.body : null,
          idempotencyKey: headers.get('Idempotency-Key'),
        });
        const rule = window.__uxEmergencyControl.mutation;
        if (rule.delay > 0) await new Promise(resolve => setTimeout(resolve, rule.delay));
        const shouldFail = rule.fail || rule.failCount > 0;
        if (rule.failCount > 0) rule.failCount -= 1;
        if (shouldFail) {
          return new Response(JSON.stringify({ error: rule.code || 'emergency_write_unavailable' }), {
            status: rule.status || 503,
            headers: { 'content-type': 'application/json' },
          });
        }
        const shouldMalformed = rule.malformed || rule.malformedCount > 0;
        if (rule.malformedCount > 0) rule.malformedCount -= 1;
        if (shouldMalformed) {
          return new Response(JSON.stringify({ note: 'resposta incompleta' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        const response = await original(input, init);
        if (response.ok && rule.dropResponseCount > 0) {
          rule.dropResponseCount -= 1;
          throw new TypeError('mutation_response_lost_after_commit');
        }
        return response;
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
  }, { list, detail, mutation });
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
    await page.waitForFunction(() => {
      const trail = document.querySelector('[data-testid="emergencial-detalhe-trilha"]');
      const text = trail?.textContent || '';
      return text.includes('Em teste') && text.includes('Ciclo de testes iniciado');
    });

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
    await page.waitForFunction(channelId => document.querySelector('[data-testid="emergencial-detalhe-trilha"]')?.getAttribute('data-channel-id') === channelId, selectedValue);
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
test('browser: envio pendente bloqueia as cinco escritas e duplo clique não envia segunda criação', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser, { mutation: { delay: 2200 } });
    const cards = page.locator('[data-testid="emergencial-lista-canais"]');
    await cards.waitFor();
    await page.locator('[data-testid="emergencial-detalhe-trilha"]').waitFor();

    const nome = `Canal de envio ${randomUUID().slice(0, 8)}`;
    await page.locator('[data-testid="emergencial-field-name"]').fill(nome);
    const submit = page.getByRole('button', { name: 'Registrar rascunho' });
    await submit.click({ clickCount: 2, delay: 50 });

    const sending = page.locator('[data-testid="emergencial-escrita-enviando"]');
    await sending.waitFor();
    const sendingText = await sending.innerText();
    assert.match(sendingText, /configuração do canal/i);
    assert.match(sendingText, /não foi reconciliado|resultado ainda não foi confirmado/i);
    const during = await actionStates(page);
    for (const label of ACTION_LABELS) {
      assert.equal(during[label].enabled, false, `${label} precisa ficar bloqueada durante o envio`);
    }
    assert.equal(await submit.isEnabled(), false, 'o formulário precisa ficar bloqueado durante o envio');
    assert.equal(await submit.getAttribute('aria-busy'), 'true', 'o botão em curso precisa declarar aria-busy');
    await capture(page, 'emergencial-1440-enviando', {
      estado: 'escrita_em_envio',
      acaoEmEnvio: 'create',
      ...await measureSurface(page, '1440px no envio pendente'),
    });

    await page.locator('[data-testid="emergencial-escrita-mensagem"]').waitFor();
    assert.match(await page.locator('[data-testid="emergencial-escrita-mensagem"]').innerText(), /configurado internamente/i);
    const sent = await page.evaluate(() => window.__uxEmergencyControl.mutations);
    const creates = sent.filter(item => item.url === '/api/ext/emergency/channels' && item.method === 'POST');
    assert.equal(creates.length, 1, 'duplo clique não pode enviar segunda criação');
    const createBody = JSON.parse(creates[0].body);
    assert.equal(createBody.name, nome, 'o corpo da criação não pode mudar');
    assert.equal(createBody.channel_type, 'telefone');
    assert.deepEqual(createBody.escalation_steps, [{ responsible: 'Gestor de plantão', contact: 'contato-interno-escalacao', wait_minutes: 5 }]);
    assert.match(String(creates[0].idempotencyKey), /^ext15-ui-create-\d+-[0-9a-f]+$/);

    // Reconciliação real: a releitura mostra o canal novo, a seleção muda e a trilha é lida.
    await cards.getByRole('heading', { name: nome, exact: true }).waitFor();
    const newId = await page.locator('[data-testid="emergencial-canal-select"] option', { hasText: nome }).getAttribute('value');
    assert.equal(await page.locator('[data-testid="emergencial-canal-select"]').inputValue(), newId, 'a seleção precisa seguir o canal criado');
    await page.waitForFunction(channelId => document.querySelector('[data-testid="emergencial-detalhe-trilha"]')?.getAttribute('data-channel-id') === channelId, newId);
    await context.close();
  });
});

test('browser: transição com envio pendente mantém payload canônico e bloqueia as demais escritas', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser, { mutation: { delay: 1800 } });
    await page.locator('[data-testid="emergencial-lista-canais"]').waitFor();
    await page.locator('[data-testid="emergencial-detalhe-trilha"]').waitFor();
    const select = page.locator('[data-testid="emergencial-canal-select"]');
    const selectedId = await select.inputValue();
    assert.ok(selectedId, 'a seleção automática precisa seguir o primeiro canal lido');

    const btn = page.getByRole('button', { name: 'Iniciar ciclo de testes', exact: true });
    await btn.click({ clickCount: 2, delay: 50 });
    const sending = page.locator('[data-testid="emergencial-escrita-enviando"]');
    await sending.waitFor();
    assert.match(await sending.innerText(), /transição para o ciclo de testes/i);
    const during = await actionStates(page);
    for (const label of ACTION_LABELS) {
      assert.equal(during[label].enabled, false, `${label} precisa ficar bloqueada durante a transição`);
    }
    assert.equal(await page.getByRole('button', { name: 'Registrar rascunho' }).isEnabled(), false, 'o formulário precisa ficar bloqueado durante a transição');
    assert.equal(await btn.getAttribute('aria-busy'), 'true');

    await page.locator('[data-testid="emergencial-escrita-mensagem"]').waitFor();
    const sent = await page.evaluate(() => window.__uxEmergencyControl.mutations);
    const transitions = sent.filter(item => item.url === `/api/ext/emergency/channels/${selectedId}/transition`);
    assert.equal(transitions.length, 1, 'duplo clique não pode enviar segunda transição');
    assert.deepEqual(JSON.parse(transitions[0].body), { status: 'em_teste' }, 'o corpo da transição não pode mudar');
    assert.match(String(transitions[0].idempotencyKey), /^ext15-ui-testing-\d+-[0-9a-f]+$/, 'a Idempotency-Key continua vindo do mesmo gerador');
    await page.waitForFunction(() => {
      const text = document.querySelector('[data-testid="emergencial-detalhe-trilha"]')?.textContent || '';
      return text.includes('Em teste') && text.includes('Ciclo de testes iniciado');
    });
    await context.close();
  });
});

test('browser: falha transitória de escrita declara causa real, preserva a leitura e não repete o POST', { skip: !RUN }, async () => {
  writeDraft = await createChannel(`Canal de falha de escrita ${randomUUID().slice(0, 8)}`);
  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser, { mutation: { fail: true, status: 503, code: 'emergency_write_unavailable' } });
    await page.locator('[data-testid="emergencial-lista-canais"]').waitFor();
    await page.locator('[data-testid="emergencial-detalhe-trilha"]').waitFor();
    await page.locator('[data-testid="emergencial-canal-select"]').selectOption(writeDraft.id);
    await page.getByRole('button', { name: 'Iniciar ciclo de testes', exact: true }).click();

    const uncertain = page.locator('[data-testid="emergencial-escrita-incerta"]');
    await uncertain.waitFor();
    const text = await uncertain.innerText();
    assert.match(text, /emergency_write_unavailable/, 'a causa real precisa aparecer com o código do servidor');
    assert.match(text, /não é possível afirmar/i, 'a falha transitória precisa declarar que o resultado da escrita é incerto');
    assert.match(text, /mesma URL|mesma chave idempotente/i, 'a tela deve oferecer reconciliação segura da solicitação original');
    assert.match(await page.locator('[data-testid="emergencial-lista"]').innerText(), /última leitura concluída/i, 'a hora da última leitura precisa continuar declarada');
    assert.ok(await page.locator('[data-testid="emergencial-lista-canais"]').count(), 'a lista lida continua visível e não é invalidada por falha de escrita');
    assert.equal(await page.getByRole('button', { name: 'Reconciliar solicitação', exact: true }).count(), 1, 'a repetição só ocorre por ação explícita do usuário');

    const posts1 = await page.evaluate(() => window.__uxEmergencyControl.mutations.filter(item => item.url.includes('/transition')).length);
    await page.waitForTimeout(1500);
    const posts2 = await page.evaluate(() => window.__uxEmergencyControl.mutations.filter(item => item.url.includes('/transition')).length);
    assert.equal(posts2, posts1, 'nenhum POST de escrita é reenviado sozinho após a falha');

    const after = await actionStates(page);
    for (const label of ACTION_LABELS) {
      assert.equal(after[label].enabled, false, `${label} fica bloqueada até a escrita incerta ser reconciliada`);
    }
    assert.match(await blockedReason(page), /reconcilie/i);
    await capture(page, 'emergencial-1440-escrita-falha-transitoria', {
      estado: 'escrita_falha_transitoria',
      ...await measureSurface(page, '1440px na falha transitória de escrita'),
    });
    await context.close();
  });
  const detail = await api(`/api/ext/emergency/channels/${writeDraft.id}`, { cookie: adminCookie });
  assert.equal(detail.body.channel.status, 'rascunho', 'a escrita com falha não pode ter sido aplicada no servidor');
});

test('browser: 403 na escrita com perda de leitura falha fechada e remove o dado protegido', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser);
    await page.locator('[data-testid="emergencial-lista-canais"]').waitFor();
    await page.locator('[data-testid="emergencial-detalhe-trilha"]').waitFor();
    await page.locator('[data-testid="emergencial-canal-select"]').selectOption(writeDraft.id);

    await page.evaluate(() => {
      window.__uxEmergencyControl.mutation.fail = true;
      window.__uxEmergencyControl.mutation.status = 403;
      window.__uxEmergencyControl.mutation.code = 'forbidden';
      window.__uxEmergencyControl.list.fail = true;
      window.__uxEmergencyControl.list.status = 403;
      window.__uxEmergencyControl.list.code = 'forbidden';
    });
    await page.getByRole('button', { name: 'Iniciar ciclo de testes', exact: true }).click();

    const error = page.locator('[data-testid="emergencial-escrita-erro"]');
    await error.waitFor();
    assert.match(await error.innerText(), /não tem acesso/i);
    const denied = page.locator('[data-testid="emergencial-lista-negado"]');
    await denied.waitFor();
    assert.equal(await denied.locator('[data-ui-state="denied"]').count(), 1);
    assert.equal(await page.locator('[data-testid="emergencial-lista-canais"]').count(), 0, 'perda de autorização não mantém a lista protegida visível');
    assert.equal(await page.locator('[data-testid="emergencial-detalhe-trilha"]').count(), 0, 'perda de autorização não mantém a trilha protegida visível');
    assert.equal(await denied.getByRole('button').count(), 0, 'negativa não oferece repetição da mesma chamada');
    const states = await actionStates(page);
    for (const label of ACTION_LABELS) {
      assert.equal(states[label].enabled, false, `${label} precisa ficar bloqueada quando a sessão perde autorização`);
    }
    await capture(page, 'emergencial-1440-escrita-negada', {
      estado: 'escrita_negada_fail_closed',
      ...await measureSurface(page, '1440px na negativa de escrita'),
    });
    await context.close();
  });
});

test('browser: 2xx malformada na escrita é incerta, não vira sucesso e não derruba a tela', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser, { mutation: { malformedCount: 1 } });
    await page.locator('[data-testid="emergencial-lista-canais"]').waitFor();
    await page.locator('[data-testid="emergencial-detalhe-trilha"]').waitFor();
    const callsBefore = await page.evaluate(() => window.__uxEmergencyControl.calls.list);
    await page.locator('[data-testid="emergencial-canal-select"]').selectOption(writeDraft.id);
    await page.getByRole('button', { name: 'Iniciar ciclo de testes', exact: true }).click();

    const uncertain = page.locator('[data-testid="emergencial-escrita-incerta"]');
    await uncertain.waitFor();
    assert.match(await uncertain.innerText(), /invalid_emergency_write_response/);
    assert.equal(await page.locator('[data-testid="emergencial-escrita-mensagem"]').count(), 0, '2xx malformada não pode ser apresentada como sucesso');
    assert.ok(await page.locator('[data-testid="emergencial-lista-canais"]').count(), 'a lista lida continua visível');
    assert.equal(await page.getByRole('button', { name: 'Reconciliar solicitação', exact: true }).count(), 1, 'a mesma chave fica disponível para reconciliação manual');
    const callsAfter = await page.evaluate(() => window.__uxEmergencyControl.calls.list);
    assert.equal(callsAfter, callsBefore, 'escrita não confirmada não dispara releitura automática');
    assert.equal(await page.getByRole('button', { name: 'Registrar rascunho' }).isEnabled(), false, 'a criação concorrente fica bloqueada enquanto a resposta for incerta');
    await context.close();
  });

  // A criação com resposta malformada (sem channel.id) também não vira sucesso nem derruba a tela.
  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser, { mutation: { malformedCount: 1 } });
    await page.locator('[data-testid="emergencial-lista-canais"]').waitFor();
    await page.locator('[data-testid="emergencial-detalhe-trilha"]').waitFor();
    await page.getByRole('button', { name: 'Registrar rascunho' }).click();
    const uncertain = page.locator('[data-testid="emergencial-escrita-incerta"]');
    await uncertain.waitFor();
    assert.equal(await page.getByRole('heading', { level: 1, name: /Apoio emergencial/i }).count(), 1, 'resposta malformada da criação não pode derrubar a tela');
    assert.equal(await page.locator('[data-testid="emergencial-escrita-mensagem"]').count(), 0, 'criação sem channel.id não pode ser apresentada como sucesso');
    assert.match(await uncertain.innerText(), /invalid_emergency_write_response/);
    const creates = await page.evaluate(() => window.__uxEmergencyControl.mutations.filter(item => item.url === '/api/ext/emergency/channels'));
    assert.equal(creates.length, 1);
    await capture(page, 'emergencial-1440-escrita-resposta-invalida', {
      estado: 'escrita_resposta_invalida',
      ...await measureSurface(page, '1440px na resposta inválida de escrita'),
    });
    await context.close();
  });
});

test('browser: envio pendente em 390 dia e 768 noite, falha de escrita em 320, alvos e contrastes medidos', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser, { width: 390, height: 844, mutation: { delay: 2500 } });
    await page.locator('[data-testid="emergencial-lista-canais"]').waitFor();
    await page.locator('[data-testid="emergencial-detalhe-trilha"]').waitFor();

    await page.getByRole('button', { name: 'Iniciar ciclo de testes', exact: true }).click();
    const sending = page.locator('[data-testid="emergencial-escrita-enviando"]');
    await sending.waitFor();
    const s390 = await measureSurface(page, '390px no envio pendente');
    await capture(page, 'emergencial-390-enviando', {
      estado: 'escrita_em_envio',
      overflowDocumentoPx: s390.overflowDocumentoPx,
      menorAlvoPx: s390.menorAlvoPx,
    });
    await page.locator('[data-testid="emergencial-escrita-mensagem"]').waitFor();

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(400);
    await page.click('[data-admin-theme-toggle="true"]');
    await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Registrar teste de recebimento bem-sucedido', exact: true }).click();
    await sending.waitFor();
    const nightContrast = await contrast(page, '[data-testid="emergencial-escrita-enviando"]');
    assert.ok(nightContrast >= 4.5, `contraste noturno da faixa de envio precisa ser >= 4.5:1, medido ${nightContrast}:1`);
    const s768 = await measureSurface(page, '768px no envio pendente no tema noite');
    await capture(page, 'emergencial-768-noite-enviando', {
      estado: 'escrita_em_envio',
      contrasteFaixaEnvio: nightContrast,
      overflowDocumentoPx: s768.overflowDocumentoPx,
      menorAlvoPx: s768.menorAlvoPx,
    });
    await page.locator('[data-testid="emergencial-escrita-mensagem"]').waitFor();

    await page.setViewportSize({ width: 320, height: 844 });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      window.__uxEmergencyControl.mutation.fail = true;
      window.__uxEmergencyControl.mutation.status = 503;
      window.__uxEmergencyControl.mutation.code = 'emergency_write_unavailable';
    });
    await page.getByRole('button', { name: 'Iniciar ciclo de testes', exact: true }).click();
    await page.locator('[data-testid="emergencial-escrita-incerta"]').waitFor();
    const s320 = await measureSurface(page, '320px na falha de escrita');
    await capture(page, 'emergencial-320-escrita-falha', {
      estado: 'escrita_falha_transitoria',
      overflowDocumentoPx: s320.overflowDocumentoPx,
      menorAlvoPx: s320.menorAlvoPx,
    });
    await context.close();
  });
});

test('browser: a trilha mostra resumo legível e mantém o JSON técnico disponível', { skip: !RUN }, async () => {
  const channel = await createChannel(`Trilha legível UX-PRO-07B-2 ${randomUUID().slice(0, 8)}`);
  const transition = await api(`/api/ext/emergency/channels/${channel.id}/transition`, {
    method: 'POST', cookie: adminCookie, body: { status: 'em_teste' },
  });
  assert.equal(transition.status, 200);
  const testResult = await api(`/api/ext/emergency/channels/${channel.id}/tests`, {
    method: 'POST',
    cookie: adminCookie,
    body: {
      test_kind: 'recebimento',
      result: 'Recebimento declarado como conferido no ensaio automatizado.',
      evidence_note: 'Registro sintético do gate; nenhum contato externo foi realizado.',
      tested_by_name: 'Operador QA interno',
      is_success: true,
    },
  });
  assert.equal(testResult.status, 201);

  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser);
    await page.locator('[data-testid="emergencial-lista-canais"]').waitFor();
    await page.locator('[data-testid="emergencial-canal-select"]').selectOption(channel.id);
    const trail = page.locator('[data-testid="emergencial-detalhe-trilha"]');
    await trail.waitFor();
    await trail.getByRole('heading', { name: channel.name, exact: true }).waitFor();
    const text = await trail.innerText();
    assert.match(text, /Em teste/);
    assert.match(text, /Resumo da prontidão interna/);
    assert.match(text, /Pendente/);
    assert.match(text, /Teste de recebimento/);
    assert.match(text, /Sucesso declarado/);
    assert.match(text, /Ciclo de testes iniciado/);
    assert.match(text, /Teste interno registrado/);
    assert.match(text, /nenhum contato externo/i);

    const technical = page.locator('[data-testid="emergencial-detalhe-tecnico"]');
    assert.equal(await technical.getAttribute('open'), null, 'JSON técnico começa recolhido, mas continua disponível');
    await technical.locator('summary').click();
    const raw = page.locator('[data-testid="emergencial-detalhe-json"]');
    const rawText = await raw.innerText();
    assert.match(rawText, /"events"/);
    assert.match(rawText, /"tests"/);
    assert.match(rawText, new RegExp(channel.id));
    assert.match(rawText, /emergency_test_registered/);

    const successContrastDay = await contrast(page, '[data-testid="emergencial-teste-sucesso"]');
    assert.ok(successContrastDay >= 4.5, `contraste claro do resultado declarado precisa ser >= 4.5:1, medido ${successContrastDay}:1`);
    await capture(page, 'emergencial-1440-trilha-legivel', {
      estado: 'trilha_resumida_json_disponivel',
      contrasteSucessoDia: successContrastDay,
      ...await measureSurface(page, '1440px com trilha legível'),
    });
    await page.click('[data-admin-theme-toggle="true"]');
    await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
    await page.waitForTimeout(400);
    const successContrastNight = await contrast(page, '[data-testid="emergencial-teste-sucesso"]');
    assert.ok(successContrastNight >= 4.5, `contraste noturno do resultado declarado precisa ser >= 4.5:1, medido ${successContrastNight}:1`);
    await capture(page, 'emergencial-1440-trilha-legivel-noite', {
      estado: 'trilha_resumida_json_disponivel',
      contrasteSucessoDia: successContrastDay,
      contrasteSucessoNoite: successContrastNight,
      ...await measureSurface(page, '1440px com trilha legível no tema noite'),
    });
    await context.close();
  });
});

test('browser: formulário explica e marca campos obrigatórios sem alterar o contrato de criação', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser);
    const form = page.locator('form[aria-labelledby="emergencial-form-titulo"]');
    await form.waitFor();
    const fieldData = await form.locator('[data-testid^="emergencial-field-"]').evaluateAll(elements => elements.map(element => {
      const id = element.id;
      const label = [...document.querySelectorAll('label')].find(candidate => candidate.htmlFor === id);
      const helpId = element.getAttribute('aria-describedby');
      return {
        id,
        required: element.required,
        label: label?.innerText || '',
        help: helpId ? document.getElementById(helpId)?.textContent || '' : '',
        marker: label?.querySelector('[data-testid="emergencial-obrigatorio"]')?.textContent || '',
      };
    }));
    assert.equal(fieldData.length, 8, 'todos os oito campos existentes devem continuar presentes');
    for (const field of fieldData) {
      assert.ok(field.id, 'cada campo precisa de id estável');
      assert.ok(field.required, `${field.id} precisa continuar obrigatório`);
      assert.match(field.label, /Obrigatório/);
      assert.match(field.marker, /Obrigatório/);
      assert.ok(field.help.trim().length >= 12, `${field.id} precisa ter ajuda associada`);
    }
    assert.match(await form.innerText(), /não envia|não aciona/i);
    await capture(page, 'emergencial-1440-formulario-orientado', {
      estado: 'formulario_rotulado_com_ajuda',
      ...await measureSurface(page, '1440px com formulário orientado'),
    });

    await form.getByRole('button', { name: 'Registrar rascunho' }).click();
    await page.locator('[data-testid="emergencial-escrita-mensagem"]').waitFor();
    const sent = await page.evaluate(() => window.__uxEmergencyControl.mutations.map(item => ({ ...item })));
    assert.equal(sent.length, 1, `criação deve emitir exatamente um POST: ${JSON.stringify(sent)}`);
    assert.equal(sent[0].method, 'POST');
    assert.equal(sent[0].url, '/api/ext/emergency/channels');
    assert.match(String(sent[0].idempotencyKey), /^ext15-ui-create-\d+-[0-9a-f]+$/);
    assert.deepEqual(JSON.parse(sent[0].body), {
      name: 'Plantão interno de apoio',
      channel_type: 'telefone',
      recipient_name: 'Supervisor de plantão',
      recipient_contact: 'contato-interno-declarado',
      availability: 'Disponibilidade declarada 24 horas por dia, sujeita a conferência humana.',
      purpose: 'Apoio interno em ocorrências operacionais que exijam escalonamento humano.',
      escalation_responsible: 'Gestor de plantão',
      escalation_contact: 'contato-interno-escalacao',
      escalation_steps: [{ responsible: 'Gestor de plantão', contact: 'contato-interno-escalacao', wait_minutes: 5 }],
    }, 'a ajuda visual não pode mudar os campos ou o corpo canônico da criação');
    await context.close();
  });
});

test('browser: resposta perdida é reconciliada com a mesma chave sem duplicar eventos', { skip: !RUN }, async () => {
  const channel = await createChannel(`Reconciliação segura UX-PRO-07B-2 ${randomUUID().slice(0, 8)}`);
  const enterTest = await api(`/api/ext/emergency/channels/${channel.id}/transition`, {
    method: 'POST', cookie: adminCookie, body: { status: 'em_teste' },
  });
  assert.equal(enterTest.status, 200);
  await withBrowser(async browser => {
    const { context, page } = await openEmergency(browser, {
      mutation: { delay: 900, dropResponseCount: 1 },
    });
    await page.locator('[data-testid="emergencial-lista-canais"]').waitFor();
    await page.locator('[data-testid="emergencial-canal-select"]').selectOption(channel.id);
    await page.locator('[data-testid="emergencial-detalhe-trilha"]').waitFor();

    await page.getByRole('button', { name: 'Marcar ativo (decisão humana)', exact: true }).click();
    const knownFailure = page.locator('[data-testid="emergencial-escrita-erro"]');
    await knownFailure.waitFor();
    assert.match(await knownFailure.innerText(), /successful_tests_required/);
    assert.equal(await page.locator('[data-testid="emergencial-escrita-incerta"]').count(), 0,
      'uma recusa HTTP explícita não deve ser apresentada como resultado incerto');
    assert.equal(await page.getByRole('button', { name: 'Reconciliar solicitação', exact: true }).count(), 0);

    const receiptTest = page.locator('[data-testid="emergencial-acao-recebimento"]');
    await page.evaluate(() => {
      const button = document.querySelector('[data-testid="emergencial-acao-recebimento"]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) throw new Error('action_not_ready');
      button.click();
      button.click();
    });
    const pending = page.locator('[data-testid="emergencial-escrita-enviando"]');
    await pending.waitFor();
    assert.match(await pending.innerText(), /enviando|reenviando/i);
    assert.equal(await receiptTest.isDisabled(), true, 'a ação em curso fica desabilitada');
    assert.equal(await page.getByRole('button', { name: 'Registrar rascunho' }).isDisabled(), true,
      'outras mutações também ficam bloqueadas durante o envio');
    for (const label of ACTION_LABELS) {
      assert.equal((await actionStates(page))[label].enabled, false, `${label} não pode concorrer com uma escrita pendente`);
    }
    const duringSend = await page.evaluate(() => window.__uxEmergencyControl.mutations.map(item => ({ ...item })));
    assert.equal(duringSend.length, 2, 'só a recusa conhecida e uma única ação nova devem ter sido enviadas');
    await capture(page, 'emergencial-1440-mutacao-pendente', {
      estado: 'mutacao_pendente',
      ...await measureSurface(page, '1440px durante envio pendente'),
    });

    const uncertain = page.locator('[data-testid="emergencial-escrita-incerta"]');
    await uncertain.waitFor();
    const uncertainText = await uncertain.innerText();
    assert.match(uncertainText, /resultado .*confirmado|não foi possível confirmar|não é possível afirmar/i);
    assert.match(uncertainText, /mesma chave/i);
    assert.equal(await page.locator('[data-testid="emergencial-escrita-mensagem"]').count(), 0,
      'resposta perdida não pode ser anunciada como sucesso');
    assert.equal(await page.getByRole('button', { name: 'Reconciliar solicitação', exact: true }).count(), 1);
    const beforeReplay = await api(`/api/ext/emergency/channels/${channel.id}`, { cookie: adminCookie });
    assert.equal(beforeReplay.body.channel.status, 'em_teste', 'a primeira POST real chegou ao servidor antes de a resposta ser descartada');
    assert.equal(beforeReplay.body.events.filter(event => event.event_type === 'emergency_test_registered').length, 1);
    await capture(page, 'emergencial-1440-mutacao-resultado-incerto', {
      estado: 'mutacao_com_resultado_nao_confirmado',
      ...await measureSurface(page, '1440px com resultado de escrita não confirmado'),
    });

    await page.getByRole('button', { name: 'Reconciliar solicitação', exact: true }).click();
    const success = page.locator('[data-testid="emergencial-escrita-mensagem"]');
    await success.waitFor();
    assert.match(await success.innerText(), /mesma chave/i);
    assert.equal(await uncertain.count(), 0);
    await page.waitForFunction(() => {
      const text = document.querySelector('[data-testid="emergencial-detalhe-trilha"]')?.textContent || '';
      return text.includes('Em teste') && text.includes('Teste de recebimento');
    });

    const sent = await page.evaluate(() => window.__uxEmergencyControl.mutations.map(item => ({ ...item })));
    assert.equal(sent.length, 3);
    const replayPair = sent.slice(1);
    assert.deepEqual(replayPair[1], replayPair[0], 'reconciliação reenvia URL, método, corpo e Idempotency-Key idênticos');
    assert.equal(replayPair[0].url, `/api/ext/emergency/channels/${channel.id}/tests`);
    assert.equal(JSON.parse(replayPair[0].body).test_kind, 'recebimento');
    assert.match(replayPair[0].idempotencyKey, /^ext15-ui-receipt-\d+-[0-9a-f]+$/);
    const afterReplay = await api(`/api/ext/emergency/channels/${channel.id}`, { cookie: adminCookie });
    assert.equal(afterReplay.body.channel.status, 'em_teste');
    assert.equal(afterReplay.body.events.filter(event => event.event_type === 'emergency_test_registered').length, 1,
      'replay idempotente confirma a primeira escrita sem criar evento duplicado');
    await capture(page, 'emergencial-1440-mutacao-reconciliada', {
      estado: 'mutacao_reconciliada_mesma_chave',
      ...await measureSurface(page, '1440px depois da reconciliação'),
    });
    await context.close();
  });
});
