// UX-PRO-07C — gate focal de /admin/fornecedores (leitura 07C-1 + escrita 07C-2).
//
// Os dois primeiros casos são herdados e permanecem intactos: declaram a
// superfície canônica e o contrato de injeção de falha. Os casos seguintes são
// aditivos e exigem PostgreSQL descartável, servidor HTTP real e Chromium; sem
// RUN_DATABASE_INTEGRATION=1 e DATABASE_URL eles ficam explicitamente skipados.
// As falhas são injetadas somente em window.fetch da página: nenhuma API,
// permissão, transição canônica ou auditoria é alterada pelo gate. Os casos de
// escrita (07C-2) injetam atraso, 5xx, 403 e 2xx sem a chave canônica somente
// nos POSTs da página; os POSTs de sucesso saem para o servidor real.

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

// UX-PRO-07C-2 — regras de injeção das nove mutações canônicas. O padrão de URL
// é o mesmo classificado pelo servidor; nenhum POST é inventado aqui.
const WRITE_KEYS = ['create-quotation', 'quotation-status', 'quotation-decision', 'validity', 'alert-rule', 'document', 'create-order', 'order-status', 'order-deadline'];
function defaultWriteRules(overrides = {}) {
  const base = {};
  for (const key of WRITE_KEYS) {
    base[key] = { delay: 0, fail: false, malformed: false, failCount: 0, status: 503, code: 'supplier_journey_unavailable', ...(overrides[key] || {}) };
  }
  return base;
}

async function openFornecedores(browser, { width = 1440, height = 900, rules = {}, writeRules = {}, cookie = adminCookie } = {}) {
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
    const classifyWrite = value => {
      if (/^\/api\/ext\/supplier\/suppliers\/[0-9a-f-]{36}\/products\/[0-9a-f-]{36}\/quotations$/i.test(value)) return 'create-quotation';
      if (/^\/api\/ext\/supplier\/quotations\/[0-9a-f-]{36}\/status$/i.test(value)) return 'quotation-status';
      if (/^\/api\/ext\/supplier\/quotations\/[0-9a-f-]{36}\/decision$/i.test(value)) return 'quotation-decision';
      if (/^\/api\/ext\/supplier\/quotations\/[0-9a-f-]{36}\/validities$/i.test(value)) return 'validity';
      if (/^\/api\/ext\/supplier\/quotations\/[0-9a-f-]{36}\/alert-rules$/i.test(value)) return 'alert-rule';
      if (/^\/api\/ext\/supplier\/quotations\/[0-9a-f-]{36}\/documents$/i.test(value)) return 'document';
      if (/^\/api\/ext\/supplier\/quotations\/[0-9a-f-]{36}\/orders$/i.test(value)) return 'create-order';
      if (/^\/api\/ext\/supplier\/orders\/[0-9a-f-]{36}\/status$/i.test(value)) return 'order-status';
      if (/^\/api\/ext\/supplier\/orders\/[0-9a-f-]{36}\/deadlines$/i.test(value)) return 'order-deadline';
      return null;
    };
    window.__uxSupplierControl = {
      rules: control.rules,
      writeRules: control.writeRules,
      calls: { references: 0, quotations: 0, orders: 0, detail: 0 },
      writeCalls: {},
      mutations: [],
    };
    window.fetch = async (input, init) => {
      const raw = typeof input === 'string' ? input : (input?.url || '');
      const pathname = new URL(raw, window.location.origin).pathname;
      const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
      if (method === 'GET') {
        const key = classify(pathname);
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
      }
      if (method === 'POST') {
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        const writeKey = classifyWrite(pathname);
        window.__uxSupplierControl.mutations.push({
          url: pathname,
          writeKey,
          body: typeof init?.body === 'string' ? init.body : null,
          idempotencyKey: headers.get('Idempotency-Key'),
        });
        if (writeKey) {
          window.__uxSupplierControl.writeCalls[writeKey] = (window.__uxSupplierControl.writeCalls[writeKey] || 0) + 1;
          const rule = window.__uxSupplierControl.writeRules[writeKey];
          if (rule) {
            if (rule.delay > 0) await new Promise(resolve => setTimeout(resolve, rule.delay));
            if (rule.malformed) {
              return new Response(JSON.stringify({ note: 'corpo 2xx sem a chave canônica da escrita' }), {
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
        }
        return original(input, init);
      }
      return original(input, init);
    };
  }, { rules: defaultRules(rules), writeRules: defaultWriteRules(writeRules) });
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

/** UX-PRO-07C-2 — medição de superfície por captura: transbordo e menor alvo. */
async function measureSurface(page, label = 'superfície') {
  const overflowDocumentoPx = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflowDocumentoPx <= 1, `transbordo de ${overflowDocumentoPx}px em ${label}`);
  const targets = await page.locator('[data-task-workspace] :is(button, select, input, a[href])')
    .evaluateAll(elements => elements
      .map(element => ({ height: Math.round(element.getBoundingClientRect().height), visible: element.getBoundingClientRect().height > 0 }))
      .filter(item => item.visible)
      .map(item => item.height));
  const menorAlvoPx = Math.min(...targets);
  assert.ok(menorAlvoPx >= 44, `alvos precisam ter pelo menos 44px; medido ${menorAlvoPx}px em ${label}`);
  return { overflowDocumentoPx, menorAlvoPx };
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

// ============================================================================
// UX-PRO-07C-2 — casos aditivos de escrita. Nenhum caso herdado acima é
// editado; as falhas de escrita são injetadas somente em window.fetch.
// ============================================================================

test('as nove mutações continuam exigindo sessão e papel autorizado no servidor', { skip: !RUN }, async () => {
  const { supplierId, productId } = await seedCatalog('autorizacao-escrita');
  const writes = [
    { name: 'criar cotação', path: `/api/ext/supplier/suppliers/${supplierId}/products/${productId}/quotations`, body: { quantity: 1, unit_price_cents: 100, notes: 'Verificação de autorização de escrita pelo gate focal.' } },
    { name: 'transição de cotação', path: `/api/ext/supplier/quotations/${quotationId}/status`, body: { status: 'enviado', reason: 'Verificação de autorização de escrita.' } },
    { name: 'decisão', path: `/api/ext/supplier/quotations/${quotationId}/decision`, body: { decision: 'rejeitada', justification: 'Verificação de autorização de escrita.' } },
    { name: 'validade', path: `/api/ext/supplier/quotations/${quotationId}/validities`, body: { valid_until: '2027-01-15', source: 'registro_interno', justification: 'Verificação de autorização.' } },
    { name: 'regra de alerta', path: `/api/ext/supplier/quotations/${quotationId}/alert-rules`, body: { days_before: 5, justification: 'Verificação de autorização.' } },
    { name: 'referência documental', path: `/api/ext/supplier/quotations/${quotationId}/documents`, body: { document_type: 'contrato', file_name: 'verificacao.pdf', file_url: 'https://exemplo.invalid/verificacao.pdf', storage_key: 'verificacao-autorizacao' } },
    { name: 'pedido derivado', path: `/api/ext/supplier/quotations/${quotationId}/orders`, body: { notes: 'Verificação de autorização de escrita.' } },
    { name: 'transição de pedido', path: `/api/ext/supplier/orders/00000000-0000-4000-8000-000000000000/status`, body: { status: 'emitido', reason: 'Verificação de autorização de escrita.' } },
    { name: 'prazo do pedido', path: `/api/ext/supplier/orders/00000000-0000-4000-8000-000000000000/deadlines`, body: { due_date: '2027-01-15', source: 'cotacao_aprovada', justification: 'Verificação de autorização.' } },
  ];
  for (const write of writes) {
    const key = `ext04-gate-auth-${randomUUID()}`;
    const anonymous = await api(write.path, { method: 'POST', body: write.body, headers: { 'idempotency-key': key } });
    assert.equal(anonymous.status, 401, `${write.name}: anônimo recusado`);
    const denied = await api(write.path, { method: 'POST', body: write.body, cookie: deniedCookie, headers: { 'idempotency-key': key } });
    assert.equal(denied.status, 403, `${write.name}: papel sem permissão recusado pelo servidor`);
    assert.equal(denied.body?.error, 'forbidden_role', `${write.name}: código canônico preservado`);
  }
  // O papel autorizado executa a criação de verdade; recusas canônicas de
  // negócio não são autorização e seguem provadas no gate herdado EXT-04.
  const allowed = await api(`/api/ext/supplier/suppliers/${supplierId}/products/${productId}/quotations`, {
    method: 'POST',
    cookie: adminCookie,
    headers: { 'idempotency-key': `ext04-gate-auth-${randomUUID()}` },
    body: { quantity: 1, unit_price_cents: 100, notes: 'Cotação sintética de verificação de autorização.' },
  });
  assert.equal(allowed.status, 201, `papel autorizado precisa criar: ${JSON.stringify(allowed.body)}`);
  assert.equal(typeof allowed.body?.quotation?.id, 'string');
});

test('browser: escrita da cotação declara envio, bloqueia duplo clique e reconcilia de verdade', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const catalog = await seedCatalog('envio-criacao');
    const { context, page } = await openFornecedores(browser, { writeRules: { 'create-quotation': { delay: 1600 } } });
    const list = page.locator('[data-testid="fornecedores-quotations-lista"]');
    await list.waitFor();
    // Seleciona a cotação da preparação para expor controles de escrita concorrentes.
    await list.getByRole('button').filter({ hasText: quotationProtocol }).first().click();
    const detail = page.locator('[data-testid="fornecedores-detalhe-painel"]');
    await detail.waitFor();

    await page.selectOption('#fornecedores-supplier', catalog.supplierId);
    await page.selectOption('#fornecedores-product', catalog.productId);
    await page.fill('#fornecedores-quantity', '3');
    await page.fill('#fornecedores-price', '12,50');
    await page.fill('#fornecedores-notes', 'Notas sintéticas do caso de envio pendente do gate focal.');

    const submit = page.getByRole('button', { name: 'Confirmar no servidor' });
    await submit.click({ clickCount: 2, delay: 60 });

    const sending = page.locator('[data-testid="fornecedores-escrita-enviando"]');
    await sending.waitFor();
    assert.equal(await sending.getAttribute('role'), 'status', 'o envio precisa ser anunciado em role=status');
    const sendingText = await sending.innerText();
    assert.match(sendingText, /criação da cotação/i);
    assert.match(sendingText, /resultado ainda não foi confirmado/i);
    assert.equal(await submit.getAttribute('aria-busy'), 'true', 'o botão em curso precisa declarar aria-busy');
    // Demais escritas bloqueadas durante o envio; leitura segue disponível.
    for (const name of [/Mover para/, 'Registrar validade', 'Registrar regra explícita', 'Registrar referência']) {
      const control = page.getByRole('button', { name });
      assert.equal(await control.first().isDisabled(), true, `escrita concorrente precisa ficar bloqueada: ${String(name)}`);
    }
    assert.equal(await page.locator('[data-testid="fornecedores-atualizar-listas"]').isDisabled(), false,
      'a leitura continua disponível durante o envio');
    assert.equal(await page.locator('[data-testid="fornecedores-atualizar-detalhe"]').isDisabled(), false,
      'a leitura do detalhe continua disponível durante o envio');
    await capture(page, 'fornecedores-1440-enviando', { estado: 'escrita_em_envio', acaoEmEnvio: 'create-quotation', ...await measureSurface(page, '1440px no envio pendente') });

    // Sucesso reconciliado: a seleção segue a cotação nova e as listas são relidas.
    await page.locator('p[role="status"]').filter({ hasText: /Cotação confirmada pelo servidor/ }).waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="fornecedores-detalhe-painel"]') !== null);
    const mutations = await page.evaluate(() => window.__uxSupplierControl.mutations.filter(m => m.writeKey === 'create-quotation'));
    assert.equal(mutations.length, 1, 'duplo clique não pode enviar segunda criação');
    const body = JSON.parse(mutations[0].body);
    assert.equal(body.quantity, 3, 'o corpo canônico da criação não pode mudar');
    assert.equal(body.unit_price_cents, 1250);
    assert.equal(body.notes, 'Notas sintéticas do caso de envio pendente do gate focal.');
    assert.match(String(mutations[0].idempotencyKey), /^ext04-create-quotation-[0-9a-f-]{36}$/, 'o gerador de chave permanece canônico');
    assert.match(await detail.innerText(), /Fornecedor sintético envio-criacao/, 'o detalhe precisa seguir a cotação criada');
    assert.equal(await page.locator('[data-testid="fornecedores-escrita-enviando"]').count(), 0);
    assert.equal(await page.locator('#fornecedores-supplier').inputValue(), '', 'o formulário é limpo somente depois do sucesso');
    await context.close();
  });
});

test('browser: transição de cotação com envio pendente mantém payload canônico e chave idempotente', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const created = await createQuotation('transicao-envio');
    const { context, page } = await openFornecedores(browser, { writeRules: { 'quotation-status': { delay: 1600 } } });
    const list = page.locator('[data-testid="fornecedores-quotations-lista"]');
    await list.waitFor();
    await list.getByRole('button').filter({ hasText: created.quotation.protocol }).first().click();
    const detail = page.locator('[data-testid="fornecedores-detalhe-painel"]');
    await detail.waitFor();

    const btn = page.getByRole('button', { name: 'Mover para Enviada' });
    await btn.click({ clickCount: 2, delay: 60 });
    const sending = page.locator('[data-testid="fornecedores-escrita-enviando"]');
    await sending.waitFor();
    assert.match(await sending.innerText(), /transição de estado da cotação/i);
    assert.equal(await btn.getAttribute('aria-busy'), 'true');
    assert.equal(await page.getByRole('button', { name: 'Confirmar no servidor' }).isDisabled(), true,
      'a criação precisa ficar bloqueada durante a transição');

    await page.locator('p[role="status"]').filter({ hasText: /Estado enviado confirmado pelo servidor/ }).waitFor();
    const mutations = await page.evaluate(() => window.__uxSupplierControl.mutations.filter(m => m.writeKey === 'quotation-status'));
    assert.equal(mutations.length, 1, 'duplo clique não pode enviar segunda transição');
    const body = JSON.parse(mutations[0].body);
    assert.equal(body.status, 'enviado', 'o corpo canônico da transição não pode mudar');
    assert.match(body.reason, /^Transição enviado confirmada pela equipe interna\.$/);
    assert.equal(mutations[0].url, `/api/ext/supplier/quotations/${created.quotation.id}/status`);
    assert.ok(String(mutations[0].idempotencyKey).startsWith(`ext04-quote-${created.quotation.id}-enviado-`),
      'o rótulo da chave idempotente permanece o original');
    // A releitura confirma o estado novo no servidor.
    assert.match(await detail.innerText(), /Enviada/);
    const serverDetail = await api(`/api/ext/supplier/quotations/${created.quotation.id}`, { cookie: adminCookie });
    assert.equal(serverDetail.body?.quotation?.status, 'enviado', 'o servidor é a autoridade do estado');
    await context.close();
  });
});

test('browser: falha transitória de escrita declara incerteza, não repete sozinha e a repetição usa a mesma chave', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const created = await createQuotation('falha-transitoria');
    const { context, page } = await openFornecedores(browser, {
      writeRules: { 'quotation-status': { failCount: 1, status: 503, code: 'supplier_journey_unavailable' } },
    });
    const list = page.locator('[data-testid="fornecedores-quotations-lista"]');
    await list.waitFor();
    await list.getByRole('button').filter({ hasText: created.quotation.protocol }).first().click();
    const detail = page.locator('[data-testid="fornecedores-detalhe-painel"]');
    await detail.waitFor();

    await page.getByRole('button', { name: 'Mover para Enviada' }).click();
    const uncertain = page.locator('[data-testid="fornecedores-escrita-incerta"]');
    await uncertain.waitFor();
    assert.equal(await uncertain.getAttribute('role'), 'alert');
    const uncertainText = await uncertain.innerText();
    assert.match(uncertainText, /não é possível afirmar/i, 'a incerteza do resultado precisa ser declarada');
    assert.match(uncertainText, /supplier_journey_unavailable/, 'o código real do servidor precisa aparecer');
    assert.match(uncertainText, /não repete a escrita automaticamente/i);
    assert.match(uncertainText, new RegExp(`ext04-quote-${created.quotation.id}-enviado-[0-9a-f-]{36}`),
      'a chave idempotente preservada precisa aparecer na faixa');
    // As listas permanecem com a hora da última leitura; o estado anterior segue visível.
    assert.match(await list.innerText(), /última leitura concluída às \d{2}:\d{2}:\d{2}/);
    assert.match(await detail.innerText(), /Rascunho/);
    // Escritas bloqueadas enquanto o resultado é incerto; leituras disponíveis.
    assert.equal(await page.getByRole('button', { name: 'Confirmar no servidor' }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Mover para Enviada' }).isDisabled(), true);
    assert.equal(await page.locator('[data-testid="fornecedores-atualizar-listas"]').isDisabled(), false);
    await page.waitForTimeout(1500);
    assert.equal(await page.evaluate(() => window.__uxSupplierControl.mutations.filter(m => m.writeKey === 'quotation-status').length), 1,
      'nenhum POST pode ser reenviado automaticamente');
    await capture(page, 'fornecedores-1440-escrita-falha-transitoria', { estado: 'escrita_falha_transitoria_incerta', ...await measureSurface(page, '1440px na falha transitória de escrita') });

    // Repetição explícita: mesma URL, mesmo corpo e a MESMA chave idempotente.
    await page.getByRole('button', { name: 'Repetir com a mesma chave' }).click();
    await page.locator('p[role="status"]').filter({ hasText: /Estado enviado confirmado pelo servidor/ }).waitFor();
    await uncertain.waitFor({ state: 'detached' });
    const mutations = await page.evaluate(() => window.__uxSupplierControl.mutations.filter(m => m.writeKey === 'quotation-status'));
    assert.equal(mutations.length, 2, 'a repetição precisa reenviar a escrita exatamente uma vez');
    assert.equal(mutations[1].idempotencyKey, mutations[0].idempotencyKey, 'a chave idempotente precisa ser a mesma');
    assert.equal(mutations[1].url, mutations[0].url, 'a URL precisa ser a mesma');
    assert.equal(mutations[1].body, mutations[0].body, 'o corpo precisa ser o mesmo');
    assert.match(await detail.innerText(), /Enviada/);
    const serverDetail = await api(`/api/ext/supplier/quotations/${created.quotation.id}`, { cookie: adminCookie });
    assert.equal(serverDetail.body?.quotation?.status, 'enviado', 'a repetição reconciliou de verdade no servidor');
    await context.close();
  });
});

test('browser: conflito real de escrita é distinto de transitório, com código canônico e sem repetição', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const created = await createQuotation('conflito-validade');
    const { context, page } = await openFornecedores(browser);
    const list = page.locator('[data-testid="fornecedores-quotations-lista"]');
    await list.waitFor();
    await list.getByRole('button').filter({ hasText: created.quotation.protocol }).first().click();
    await page.locator('[data-testid="fornecedores-detalhe-painel"]').waitFor();

    // Primeira validade: sucesso real do servidor.
    await page.fill('#fornecedores-valida-ate', '2027-03-15');
    await page.fill('#fornecedores-referencia', 'Contrato declarado nº 1');
    await page.fill('#fornecedores-justificativa', 'Validade sintética do gate focal.');
    await page.getByRole('button', { name: 'Registrar validade' }).click();
    await page.locator('p[role="status"]').filter({ hasText: /Validade registrada com fonte/ }).waitFor();

    // Segunda validade: o servidor recusa com 409 canônico — recusa definitiva, não incerteza.
    await page.fill('#fornecedores-valida-ate', '2027-04-15');
    await page.fill('#fornecedores-referencia', 'Contrato declarado nº 2');
    await page.fill('#fornecedores-justificativa', 'Segunda validade sintética do gate.');
    await page.getByRole('button', { name: 'Registrar validade' }).click();
    const failure = page.locator('[data-testid="fornecedores-escrita-falha"]');
    await failure.waitFor();
    assert.equal(await failure.getAttribute('role'), 'alert');
    const failureText = await failure.innerText();
    assert.match(failureText, /validity_already_registered/, 'o código canônico do servidor precisa aparecer');
    assert.match(failureText, /recusou a operação sem aplicá-la/i, 'a recusa definitiva precisa ser distinta do transitório');
    assert.doesNotMatch(failureText, /não é possível afirmar/i, 'conflito não pode ser apresentado como incerteza');
    assert.equal(await failure.getByRole('button').count(), 0, 'recusa definitiva não oferece repetição');
    assert.equal(await page.locator('[data-testid="fornecedores-escrita-incerta"]').count(), 0);
    // A tela segue de pé, sem fail-closed e sem sucesso falso; escritas liberadas de volta.
    assert.match(await list.innerText(), new RegExp(created.quotation.protocol));
    assert.equal(await page.locator('[data-testid="fornecedores-negado"]').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Registrar validade' }).isDisabled(), false,
      'recusa definitiva libera as escritas de volta');
    await capture(page, 'fornecedores-1440-escrita-conflito', { estado: 'escrita_recusada_conflito', ...await measureSurface(page, '1440px na recusa definitiva de escrita') });
    await context.close();
  });
});

test('browser: 403 na escrita com perda de leitura falha fechada e remove o dado protegido', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const created = await createQuotation('escrita-negada');
    const { context, page } = await openFornecedores(browser, {
      writeRules: { 'quotation-status': { fail: true, status: 403, code: 'forbidden_role' } },
    });
    const list = page.locator('[data-testid="fornecedores-quotations-lista"]');
    await list.waitFor();
    await list.getByRole('button').filter({ hasText: created.quotation.protocol }).first().click();
    await page.locator('[data-testid="fornecedores-detalhe-painel"]').waitFor();

    // A perda de autorização atinge a escrita e a releitura que a confirma.
    await page.evaluate(() => {
      for (const key of ['references', 'quotations', 'orders', 'detail']) {
        Object.assign(window.__uxSupplierControl.rules[key], { fail: true, status: 403, code: 'forbidden_role', delay: 600 });
      }
    });
    await page.getByRole('button', { name: 'Mover para Enviada' }).click();
    const writeFailure = page.locator('[data-testid="fornecedores-escrita-falha"]');
    await writeFailure.waitFor();
    assert.match(await writeFailure.innerText(), /forbidden_role/);
    assert.match(await writeFailure.innerText(), /não tem acesso a esta escrita/i);

    const denied = page.locator('[data-testid="fornecedores-negado"]');
    await denied.waitFor();
    assert.equal(await denied.locator('[data-ui-state="denied"]').count(), 1);
    assert.equal(await page.locator('[data-testid="fornecedores-quotations-lista"]').count(), 0,
      'negativa de escrita não mantém a lista protegida visível');
    assert.equal(await page.locator('[data-testid="fornecedores-orders-lista"]').count(), 0,
      'negativa de escrita não mantém os pedidos protegidos visíveis');
    assert.equal(await page.locator('[data-testid="fornecedores-detalhe-painel"]').count(), 0,
      'negativa de escrita não mantém o detalhe protegido visível');
    assert.equal(await page.locator('[data-testid="fornecedores-escrita-enviando"]').count(), 0);
    assert.equal(await page.locator('[data-testid="fornecedores-escrita-incerta"]').count(), 0,
      'negativa não é apresentada como incerteza');
    assert.equal(await page.locator('[data-testid="fornecedores-quotations-desatualizado"]').count(), 0,
      'negativa não é apresentada como dado desatualizado');
    assert.equal(await denied.getByRole('button').count(), 0, 'negativa não oferece repetição da mesma chamada');
    const negadaOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(negadaOverflow <= 1, `transbordo de ${negadaOverflow}px na negativa de escrita`);
    const negadaTargets = await page.locator('[data-task-workspace] :is(button, select, input, a[href])').count();
    assert.equal(negadaTargets, 0, 'a negativa não deixa nenhum controle acionável na tela');
    await capture(page, 'fornecedores-1440-escrita-negada', { estado: 'escrita_negada_fail_closed', overflowDocumentoPx: negadaOverflow, alvosAcionaveis: negadaTargets });
    await context.close();
  });
});

test('browser: 2xx malformada na escrita não vira sucesso nem ausência e não derruba a tela', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const created = await createQuotation('resposta-invalida');
    const { context, page } = await openFornecedores(browser, { writeRules: { 'quotation-status': { malformed: true } } });
    const list = page.locator('[data-testid="fornecedores-quotations-lista"]');
    await list.waitFor();
    await list.getByRole('button').filter({ hasText: created.quotation.protocol }).first().click();
    await page.locator('[data-testid="fornecedores-detalhe-painel"]').waitFor();

    await page.getByRole('button', { name: 'Mover para Enviada' }).click();
    const uncertain = page.locator('[data-testid="fornecedores-escrita-incerta"]');
    await uncertain.waitFor();
    const text = await uncertain.innerText();
    assert.match(text, /invalid_supplier_write_response/, 'o código de resposta inválida precisa aparecer');
    assert.match(text, /não pode ser confirmada/i, 'a escrita não confirmada precisa ser declarada');
    assert.equal(await page.locator('p[role="status"]').filter({ hasText: /Estado enviado confirmado/ }).count(), 0,
      '2xx sem a chave canônica não pode virar sucesso');
    assert.match(await list.innerText(), new RegExp(created.quotation.protocol), 'a lista lida permanece');
    assert.equal(await page.locator('[data-testid="fornecedores-detalhe-painel"]').count(), 1, 'o detalhe permanece');
    await capture(page, 'fornecedores-1440-escrita-resposta-invalida', { estado: 'escrita_resposta_2xx_invalida', ...await measureSurface(page, '1440px na resposta 2xx inválida de escrita') });
    await context.close();
  });

  // A criação com corpo sem quotation.id também não vira sucesso e não derruba a
  // tela. Navegador próprio: o Chromium empacotado em --single-process não
  // sobrevive à reabertura de contexto no mesmo processo.
  await withBrowser(async browser => {
    const catalog = await seedCatalog('resposta-invalida-criacao');
    const { context, page } = await openFornecedores(browser, { writeRules: { 'create-quotation': { malformed: true } } });
    const list = page.locator('[data-testid="fornecedores-quotations-lista"]');
    await list.waitFor();
    await page.selectOption('#fornecedores-supplier', catalog.supplierId);
    await page.selectOption('#fornecedores-product', catalog.productId);
    await page.fill('#fornecedores-price', '10,00');
    await page.fill('#fornecedores-notes', 'Criação com resposta declarada inválida pelo gate.');
    await page.getByRole('button', { name: 'Confirmar no servidor' }).click();
    const uncertain = page.locator('[data-testid="fornecedores-escrita-incerta"]');
    await uncertain.waitFor();
    assert.match(await uncertain.innerText(), /invalid_supplier_write_response/);
    await page.getByRole('heading', { level: 1, name: /EXT-04 — Fornecedores/ }).waitFor();
    assert.equal(await page.locator('p[role="status"]').filter({ hasText: /Cotação confirmada pelo servidor/ }).count(), 0,
      'criação com corpo inválido não pode declarar sucesso');
    assert.equal(await page.locator('#fornecedores-supplier').inputValue(), catalog.supplierId,
      'o formulário não é limpo sem sucesso confirmado');
    await context.close();
  });
});

test('browser: envio pendente e falha de escrita medidos em 320 390 768 e tema noturno', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const created = await createQuotation('medicoes-escrita');
    const { context, page } = await openFornecedores(browser, { writeRules: { 'quotation-status': { delay: 1200 } } });
    const list = page.locator('[data-testid="fornecedores-quotations-lista"]');
    await list.waitFor();
    await list.getByRole('button').filter({ hasText: created.quotation.protocol }).first().click();
    await page.locator('[data-testid="fornecedores-detalhe-painel"]').waitFor();

    // 390 px, tema dia: envio pendente medido.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Mover para Enviada' }).click();
    await page.locator('[data-testid="fornecedores-escrita-enviando"]').waitFor();
    await capture(page, 'fornecedores-390-enviando', { estado: 'escrita_em_envio', ...await measureSurface(page, '390px no envio pendente') });
    await page.locator('p[role="status"]').filter({ hasText: /Estado enviado confirmado pelo servidor/ }).waitFor();

    // 768 px, tema noturno pelo controle real do envelope: envio pendente com contraste medido.
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(400);
    await page.click('[data-admin-theme-toggle="true"]');
    await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Mover para Em análise' }).click();
    await page.locator('[data-testid="fornecedores-escrita-enviando"]').waitFor();
    const sendingContrast = await contrast(page, '[data-testid="fornecedores-escrita-enviando"]');
    assert.ok(sendingContrast >= 4.5, `contraste da faixa de envio no tema noite: ${sendingContrast}:1`);
    const nightOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(nightOverflow <= 1, `transbordo de ${nightOverflow}px no envio noturno em 768px`);
    await capture(page, 'fornecedores-768-noite-enviando', {
      estado: 'escrita_em_envio_noite',
      overflowDocumentoPx: nightOverflow,
      contrasteFaixa: sendingContrast,
    });
    await page.locator('p[role="status"]').filter({ hasText: /Estado em_analise confirmado pelo servidor/ }).waitFor();
    await page.click('[data-admin-theme-toggle="true"]');
    await page.waitForFunction(() => document.documentElement.dataset.adminTheme !== 'night');

    // 320 px: falha transitória de escrita (resultado incerto) medida.
    await page.setViewportSize({ width: 320, height: 844 });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      Object.assign(window.__uxSupplierControl.writeRules['quotation-status'], { fail: true, status: 503, code: 'supplier_journey_unavailable' });
    });
    await page.getByRole('button', { name: 'Mover para Cancelada' }).click();
    const uncertain = page.locator('[data-testid="fornecedores-escrita-incerta"]');
    await uncertain.waitFor();
    await capture(page, 'fornecedores-320-escrita-falha', {
      estado: 'escrita_falha_transitoria',
      ...await measureSurface(page, '320px na falha transitória de escrita'),
    });
    await context.close();
  });
});
