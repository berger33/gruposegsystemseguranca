// UX-PRO-07C-1 — gate focal de leitura de /admin/fornecedores.
//
// Os dois primeiros casos são herdados e permanecem intactos: declaram a
// superfície canônica e o contrato de injeção de falha. Os casos seguintes são
// aditivos e exigem PostgreSQL descartável, servidor HTTP real e Chromium; sem
// RUN_DATABASE_INTEGRATION=1 e DATABASE_URL eles ficam explicitamente skipados.
// As falhas são injetadas somente em window.fetch da página: nenhuma API,
// permissão, transição canônica ou auditoria é alterada pelo gate.

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// This focal contract is run by the PostgreSQL/HTTP/Chromium gate. These checks
// keep the browser proof honest without replacing that gate with a unit stub.
test('EXT-04 workspace declares the canonical surface and distinct states',()=>{
 const ui=fs.readFileSync('src/app/admin/fornecedores/FornecedoresWorkspace.tsx','utf8');
 assert.match(ui,/<h1>EXT-04 — Fornecedores<\/h1>/); assert.match(ui,/role="tablist"/); assert.match(ui,/data-ui-state="denied"/); assert.match(ui,/supplierRequest/); assert.match(ui,/Sem upload real/);
});
test('EXT-04 browser failure injection contract is explicit',()=>{const gate=fs.readFileSync('scripts/qa-ux-supplier-postgres.mjs','utf8');assert.match(gate,/page\.addInitScript/);assert.match(gate,/Chromium|chromium|playwright/i);assert.match(gate,/finally/);});

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { recordKeyboardCapture } from '../scripts/ux-pro-00-keyboard-evidence.mjs';
import { provisionStaff, STAFF_TEST_PASSWORD } from './helpers/staff-login.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');
const evidenceDir = process.env.UX_SUPPLIER_EVIDENCE_DIR || '';
const stage = 'ux-pro-07-fornecedores';

const READ_PATHS = {
  references: '/api/ext/supplier/references',
  quotations: '/api/ext/supplier/quotations',
  orders: '/api/ext/supplier/orders',
};

let server;
let baseUrl;
let pool;
let adminCookie;
let adminIdentityId;
let deniedCookie;
let quotationId;
let quotationProtocol;
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
  const response = await api('/api/admin/session', {
    method: 'POST',
    body: { email, password: STAFF_TEST_PASSWORD },
  });
  assert.equal(response.status, 200, `login deveria retornar 200, veio ${response.status}`);
  const raw = response.setCookie.find(cookie => cookie.startsWith('seg_admin_session='));
  assert.ok(raw, 'login precisa emitir cookie de equipe');
  return raw.split(';')[0];
}

/** Catálogo sintético mínimo: um fornecedor ativo e um produto a ele vinculado. */
async function seedCatalog(tag) {
  const supplierId = randomUUID();
  const productId = randomUUID();
  const suffix = `${tag}-${supplierId.slice(0, 8)}`;
  await pool.query(
    `INSERT INTO ast_suppliers(id,name,document,category,created_by_identity)
     VALUES($1,$2,$3,'equipamento',$4)`,
    [supplierId, `Fornecedor sintético ${suffix}`, `SYN-${supplierId.slice(0, 8)}`, adminIdentityId],
  );
  await pool.query(
    `INSERT INTO ast_products(id,sku,name,description,category,unit_measure,supplier_id,created_by_identity)
     VALUES($1,$2,$3,$4,'equipamento','unidade',$5,$6)`,
    [productId, `SKU-${productId.slice(0, 8)}`, `Produto sintético ${suffix}`,
      'Produto sintético exclusivo do gate focal de fornecedores; nenhum dado real.', supplierId, adminIdentityId],
  );
  return { supplierId, productId };
}

/** Cria a cotação pela API real: verbo, corpo e Idempotency-Key canônicos. */
async function createQuotation(tag) {
  const catalog = await seedCatalog(tag);
  const response = await api(
    `/api/ext/supplier/suppliers/${catalog.supplierId}/products/${catalog.productId}/quotations`,
    {
      method: 'POST',
      cookie: adminCookie,
      headers: { 'idempotency-key': `ext04-ui-${tag}-${randomUUID()}` },
      body: {
        quantity: 2,
        unit_price_cents: 2500,
        notes: `Cotação sintética criada somente pelo gate focal de fornecedores (${tag}).`,
      },
    },
  );
  assert.equal(response.status, 201, `cotação sintética deveria nascer: ${JSON.stringify(response.body)}`);
  return { ...catalog, quotation: response.body.quotation };
}

async function launchBrowser() {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await playwrightChromium.launch({
        executablePath: await packagedChromium.executablePath(),
        args: packagedChromium.args.filter(argument => argument !== '--disable-web-security'),
        headless: true,
      });
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  throw lastError;
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
      console.log(`UX_SUPPLIER_BROWSER_RETRY tentativa=${attempt}: ${String(error.message).split('\n')[0]}`);
    } finally {
      await browser.close().catch(() => {});
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw lastError;
}

function defaultRules(overrides = {}) {
  const base = {};
  for (const key of ['references', 'quotations', 'orders', 'detail']) {
    base[key] = { delay: 0, fail: false, malformed: false, failCount: 0, status: 503, code: 'supplier_journey_unavailable', ...(overrides[key] || {}) };
  }
  return base;
}

async function openFornecedores(browser, { width = 1440, height = 900, rules = {}, cookie = adminCookie } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  const separator = cookie.indexOf('=');
  await context.addCookies([{
    name: cookie.slice(0, separator),
    value: cookie.slice(separator + 1),
    url: baseUrl,
  }]);
  const page = await context.newPage();
  page.setDefaultTimeout(Number(process.env.UX_SUPPLIER_UI_TIMEOUT || 45_000));
  page.setDefaultNavigationTimeout(90_000);
  await page.addInitScript(control => {
    const original = window.fetch.bind(window);
    const classify = value => {
      if (value === '/api/ext/supplier/references') return 'references';
      if (value === '/api/ext/supplier/quotations') return 'quotations';
      if (value === '/api/ext/supplier/orders') return 'orders';
      if (/^\/api\/ext\/supplier\/quotations\/[0-9a-f-]{36}$/i.test(value)) return 'detail';
      return null;
    };
    window.__uxSupplierControl = { rules: control.rules, calls: { references: 0, quotations: 0, orders: 0, detail: 0 } };
    window.fetch = async (input, init) => {
      const raw = typeof input === 'string' ? input : (input?.url || '');
      const pathname = new URL(raw, window.location.origin).pathname;
      const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
      const key = method === 'GET' ? classify(pathname) : null;
      const rule = key ? window.__uxSupplierControl.rules[key] : null;
      if (rule) {
        window.__uxSupplierControl.calls[key] += 1;
        if (rule.delay > 0) await new Promise(resolve => setTimeout(resolve, rule.delay));
        if (rule.malformed) {
          return new Response(JSON.stringify({ note: 'corpo 2xx sem a chave canônica' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        const shouldFail = rule.fail || rule.failCount > 0;
        if (rule.failCount > 0) rule.failCount -= 1;
        if (shouldFail) {
          return new Response(JSON.stringify({ error: rule.code }), {
            status: rule.status,
            headers: { 'content-type': 'application/json' },
          });
        }
      }
      return original(input, init);
    };
  }, { rules: defaultRules(rules) });
  await page.goto(`${baseUrl}/admin/fornecedores`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1, name: /EXT-04 — Fornecedores/ }).waitFor();
  return { context, page };
}

async function writeEvidenceSummary() {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  const entries = [...new Map(evidenceEntries.map(entry => [path.basename(entry.screenshot), entry])).values()];
  await writeFile(path.join(evidenceDir, 'resumo.json'), `${JSON.stringify({
    stage,
    generatedBy: 'npm run test:ux-supplier:pg (PostgreSQL descartável + HTTP real + Chromium)',
    notes: 'Massa inteiramente sintética criada pela API EXT-04. problems resulta das medições automatizadas; não representa validação manual nem aceite humano.',
    entries,
  }, null, 2)}\n`, 'utf8');
}

async function capture(page, name, extra = {}) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  const file = path.join(evidenceDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const viewport = page.viewportSize();
  evidenceEntries.push({
    stage,
    route: '/admin/fornecedores',
    role: 'admin',
    viewport: `${viewport.width}x${viewport.height}`,
    theme: await page.evaluate(() => document.documentElement.dataset.adminTheme || 'day'),
    screenshot: path.relative(root, file).replaceAll('\\', '/'),
    problems: [],
    ...extra,
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
      NEXT_DIST_DIR: '.next/integration-ux-supplier',
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
  const admin = await provisionStaff(pool, { role: 'admin' });
  const denied = await provisionStaff(pool, { role: 'rh' });
  adminIdentityId = admin.id;
  adminCookie = await loginStaffHttp(admin.email);
  deniedCookie = await loginStaffHttp(denied.email);
  const created = await createQuotation('inicial');
  quotationId = created.quotation.id;
  quotationProtocol = created.quotation.protocol;

  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/admin/fornecedores`, { redirect: 'manual' }).catch(() => null);
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

test('as quatro leituras continuam exigindo sessão e papel autorizado', { skip: !RUN }, async () => {
  const reads = [
    { name: 'references', path: READ_PATHS.references, key: 'suppliers' },
    { name: 'quotations', path: READ_PATHS.quotations, key: 'quotations' },
    { name: 'orders', path: READ_PATHS.orders, key: 'orders' },
    { name: 'detail', path: `/api/ext/supplier/quotations/${quotationId}`, key: 'quotation' },
  ];
  for (const read of reads) {
    const anonymous = await api(read.path);
    assert.equal(anonymous.status, 401, `${read.name}: anônimo recusado`);
    assert.ok(!(read.key in (anonymous.body || {})), `${read.name}: negativa não pode vazar ${read.key}`);
    const denied = await api(read.path, { cookie: deniedCookie });
    assert.equal(denied.status, 403, `${read.name}: papel sem permissão recusado pelo servidor`);
    assert.equal(denied.body?.error, 'forbidden_role', `${read.name}: código canônico preservado`);
    const allowed = await api(read.path, { cookie: adminCookie });
    assert.equal(allowed.status, 200, `${read.name}: papel autorizado`);
  }
});

test('browser: carregamento contextual e vazio concluído nunca se confundem', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openFornecedores(browser, { rules: { orders: { delay: 1500 } } });
    const loading = page.locator('[data-testid="fornecedores-orders-carregando"]');
    await loading.waitFor();
    assert.equal(await loading.locator('[data-ui-state="loading"]').count(), 1);
    assert.equal(await page.locator('[data-testid="fornecedores-orders-vazio"]').count(), 0,
      'vazio não aparece antes da resposta');
    const empty = page.locator('[data-testid="fornecedores-orders-vazio"]');
    await empty.waitFor();
    assert.match(await empty.innerText(), /consulta foi concluída/i);
    assert.match(await empty.innerText(), /atualiz/i);
    await context.close();
  });
});

test('browser: falha inicial declara causa e Tentar novamente faz nova leitura', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openFornecedores(browser, {
      rules: { quotations: { fail: true, status: 503, code: 'supplier_journey_unavailable' } },
    });
    const failure = page.locator('[data-testid="fornecedores-quotations-falha"]');
    await failure.waitFor();
    assert.equal(await failure.locator('[data-ui-state="error"]').count(), 1);
    const text = await failure.innerText();
    assert.match(text, /não significa que .* esteja vazio/i);
    assert.match(text, /supplier_journey_unavailable/);
    await capture(page, 'fornecedores-1440-falha-inicial', { state: 'falha_inicial' });
    await page.evaluate(() => { window.__uxSupplierControl.rules.quotations.fail = false; });
    await failure.getByRole('button', { name: 'Tentar novamente' }).click();
    const list = page.locator('[data-testid="fornecedores-quotations-lista"]');
    await list.waitFor();
    assert.match(await list.innerText(), new RegExp(quotationProtocol));
    assert.ok(await page.evaluate(() => window.__uxSupplierControl.calls.quotations >= 2),
      'repetição precisa reler de verdade');
    await context.close();
  });
});

test('browser: falha de releitura preserva dado, informa hora e repetição atualiza de verdade', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openFornecedores(browser);
    const list = page.locator('[data-testid="fornecedores-quotations-lista"]');
    await list.waitFor();
    assert.match(await list.innerText(), new RegExp(quotationProtocol));

    await page.evaluate(() => {
      Object.assign(window.__uxSupplierControl.rules.quotations, {
        fail: true, status: 503, code: 'supplier_refresh_unavailable',
      });
    });
    await page.locator('[data-testid="fornecedores-atualizar-listas"]').click();
    const stale = page.locator('[data-testid="fornecedores-quotations-desatualizado"]');
    await stale.waitFor();
    const staleText = await stale.innerText();
    assert.match(staleText, /última leitura concluída/i);
    assert.match(staleText, /\d{2}:\d{2}:\d{2}/);
    assert.match(staleText, /supplier_refresh_unavailable/);
    assert.match(await list.innerText(), new RegExp(quotationProtocol), 'dado lido continua visível e marcado');

    const created = await createQuotation('durante-falha');
    assert.doesNotMatch(await list.innerText(), new RegExp(created.quotation.protocol),
      'dado novo ainda não pertence ao recorte preservado');

    const ratio = await contrast(page, '[data-testid="fornecedores-quotations-desatualizado"]');
    assert.ok(ratio >= 4.5, `contraste da faixa precisa ser >= 4.5:1, medido ${ratio}:1`);
    await capture(page, 'fornecedores-1440-desatualizado', {
      state: 'releitura_falhou_dado_preservado',
      contrasteFaixa: ratio,
    });

    await page.evaluate(() => { window.__uxSupplierControl.rules.quotations.fail = false; });
    await stale.getByRole('button', { name: 'Tentar novamente' }).click();
    await stale.waitFor({ state: 'detached' });
    await page.getByText(created.quotation.protocol, { exact: true }).waitFor();
    assert.match(await list.innerText(), new RegExp(created.quotation.protocol),
      'repetição bem-sucedida mostra leitura nova');
    await context.close();
  });
});

test('browser: negativa depois do sucesso falha fechada e não preserva dado protegido', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openFornecedores(browser);
    await page.locator('[data-testid="fornecedores-quotations-lista"]').waitFor();
    await page.evaluate(() => {
      Object.assign(window.__uxSupplierControl.rules.quotations, {
        fail: true, status: 403, code: 'forbidden_role',
      });
    });
    await page.locator('[data-testid="fornecedores-atualizar-listas"]').click();
    const denied = page.locator('[data-testid="fornecedores-negado"]');
    await denied.waitFor();
    assert.equal(await denied.locator('[data-ui-state="denied"]').count(), 1);
    assert.equal(await page.locator('[data-testid="fornecedores-quotations-lista"]').count(), 0,
      'negativa remove a lista lida anteriormente');
    assert.equal(await page.locator('[data-testid="fornecedores-orders-lista"]').count(), 0,
      'negativa remove os pedidos lidos anteriormente');
    assert.equal(await page.locator('[data-testid="fornecedores-detalhe-painel"]').count(), 0,
      'negativa remove o detalhe protegido');
    assert.equal(await denied.getByRole('button').count(), 0,
      'negativa não oferece repetição da mesma chamada');
    assert.equal(await page.locator('[data-testid="fornecedores-quotations-desatualizado"]').count(), 0,
      'negativa não é apresentada como dado desatualizado');
    await context.close();
  });
});

test('browser: resposta 2xx malformada nunca é apresentada como ausência', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openFornecedores(browser, { rules: { quotations: { malformed: true } } });
    const failure = page.locator('[data-testid="fornecedores-quotations-falha"]');
    await failure.waitFor();
    assert.equal(await page.locator('[data-testid="fornecedores-quotations-vazio"]').count(), 0,
      'corpo 2xx sem a chave canônica não pode virar vazio');
    assert.match(await failure.innerText(), /invalid_supplier_response/);
    await capture(page, 'fornecedores-1440-resposta-invalida', { state: 'resposta_2xx_invalida' });
    await context.close();
  });
});

test('browser: selecionar cotação relê o detalhe sem relançar as três listas', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openFornecedores(browser);
    const list = page.locator('[data-testid="fornecedores-quotations-lista"]');
    await list.waitFor();
    const before = await page.evaluate(() => ({ ...window.__uxSupplierControl.calls }));
    assert.ok(before.quotations >= 1 && before.references >= 1 && before.orders >= 1);
    // O clique incide sobre a cotação criada na preparação do gate: a lista é
    // ordenada por criação decrescente e outros casos criam cotações depois.
    await list.getByRole('button').filter({ hasText: quotationProtocol }).first().click();
    const detail = page.locator('[data-testid="fornecedores-detalhe-painel"]');
    await detail.waitFor();
    assert.match(await detail.innerText(), new RegExp(quotationProtocol));
    const after = await page.evaluate(() => ({ ...window.__uxSupplierControl.calls }));
    assert.equal(after.references, before.references, 'seleção não relança a leitura de referências');
    assert.equal(after.quotations, before.quotations, 'seleção não relança a leitura de cotações');
    assert.equal(after.orders, before.orders, 'seleção não relança a leitura de pedidos');
    assert.ok(after.detail > before.detail, 'seleção relê o detalhe da cotação escolhida');
    await context.close();
  });
});

test('browser: 320 390 768 1440, tema noturno e percurso de teclado medidos sem problemas', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openFornecedores(browser);
    await page.locator('[data-testid="fornecedores-quotations-lista"]').waitFor();
    for (const [width, height] of [[1440, 900], [768, 1024], [390, 844], [320, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `transbordo de ${overflow}px em ${width}px no tema dia`);
      const minTarget = await page.locator('[data-task-workspace] :is(button, select, input, a[href])')
        .evaluateAll(elements => Math.min(...elements.map(element => element.getBoundingClientRect().height)));
      assert.ok(minTarget >= 44, `alvos precisam ter pelo menos 44px; medido ${minTarget}px em ${width}px`);
      await capture(page, `fornecedores-${width}-dia`, { overflowDocumentoPx: overflow, menorAlvoPx: minTarget });

      if (width === 768) {
        await page.click('[data-admin-theme-toggle="true"]');
        await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
        await page.waitForTimeout(400);
        const nightOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const headingContrast = await contrast(page, 'h1');
        const listContrast = await contrast(page, '[data-testid="fornecedores-quotations-lista"]');
        assert.ok(nightOverflow <= 1, `transbordo de ${nightOverflow}px no tema noite`);
        assert.ok(headingContrast >= 4.5, `contraste do título no tema noite: ${headingContrast}:1`);
        assert.ok(listContrast >= 4.5, `contraste da lista no tema noite: ${listContrast}:1`);
        await capture(page, 'fornecedores-768-noite', {
          overflowDocumentoPx: nightOverflow,
          contrasteTitulo: headingContrast,
          contrasteLista: listContrast,
        });
        await page.click('[data-admin-theme-toggle="true"]');
        await page.waitForFunction(() => document.documentElement.dataset.adminTheme !== 'night');
      }

      if (width === 390) {
        await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
        const target = page.locator('[data-testid="fornecedores-quotations-lista"]').getByRole('button').first();
        let reached = false;
        let firstFocus = false;
        const traversal = [];
        for (let step = 0; step < 80 && !reached; step++) {
          await page.keyboard.press('Tab');
          const label = await page.evaluate(() => {
            const element = document.activeElement;
            return element?.id || element?.getAttribute?.('aria-label') || element?.textContent?.trim().slice(0, 80) || element?.tagName?.toLowerCase() || 'desconhecido';
          });
          traversal.push(label);
          if (step === 0) {
            firstFocus = await page.evaluate(() => {
              const element = document.activeElement;
              if (!(element instanceof HTMLElement)) return false;
              const style = getComputedStyle(element);
              return style.outlineStyle !== 'none' && (parseFloat(style.outlineWidth) || 0) >= 1;
            });
          }
          reached = await target.evaluate(element => element === document.activeElement);
        }
        assert.ok(firstFocus, 'o primeiro foco por Tab precisa ser visível');
        assert.ok(reached, 'a primeira cotação da lista precisa ser alcançável por Tab');
        const outline = await target.evaluate(element => ({
          style: getComputedStyle(element).outlineStyle,
          width: parseFloat(getComputedStyle(element).outlineWidth) || 0,
        }));
        assert.ok(outline.style !== 'none' && outline.width >= 1,
          `foco da cotação precisa ser visível: ${outline.style}/${outline.width}px`);
        await capture(page, 'fornecedores-390-teclado', {
          state: 'percurso_teclado',
          firstFocus: true,
          percursoTeclado: traversal,
        });
        await recordKeyboardCapture(evidenceDir, {
          stage,
          route: '/admin/fornecedores',
          role: 'admin',
          viewport: '390x844',
          theme: 'day',
          file: 'fornecedores-390-teclado.png',
          firstFocus: true,
          percursoTeclado: traversal,
        });
        if (evidenceDir) {
          const summary = JSON.parse(await readFile(path.join(evidenceDir, 'resumo.json'), 'utf8'));
          const entry = summary.entries.find(item => path.basename(item.screenshot || item.file || '') === 'fornecedores-390-teclado.png');
          assert.ok(entry?.firstFocus);
          assert.ok(entry?.percursoTeclado?.length > 0);
          assert.deepEqual(entry.problems, []);
        }
      }
    }
    await context.close();
  });
});
