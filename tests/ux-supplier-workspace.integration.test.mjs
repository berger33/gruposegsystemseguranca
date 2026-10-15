// UX-PRO-07C-1 + UX-PRO-07C-2 — gate focal de /admin/fornecedores.
//
// Os dois casos estáticos herdados e os oito casos de leitura da 07C-1 seguem
// intactos. Cinco casos aditivos de escrita exigem PostgreSQL descartável,
// servidor HTTP real e Chromium; sem RUN_DATABASE_INTEGRATION=1 e DATABASE_URL
// eles ficam explicitamente skipados.
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
const stage = 'ux-pro-07-fornecedores-07c-2';

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

async function postAsAdmin(pathname, body, tag, expectedStatus = 200) {
  const response = await api(pathname, {
    method: 'POST',
    cookie: adminCookie,
    headers: { 'idempotency-key': `ext04-ui-setup-${tag}-${randomUUID()}` },
    body,
  });
  assert.equal(response.status, expectedStatus, `${pathname}: esperado HTTP ${expectedStatus}; recebido ${JSON.stringify(response.body)}`);
  return response.body;
}

async function transitionQuotationHttp(quotation, status, tag) {
  const result = await postAsAdmin(
    `/api/ext/supplier/quotations/${quotation.id}/status`,
    { status, reason: `Preparação sintética ${status} do gate UX-PRO-07C-2.` },
    tag,
  );
  return result.quotation;
}

async function approveQuotationHttp(tag) {
  const created = await createQuotation(tag);
  await transitionQuotationHttp(created.quotation, 'enviado', `${tag}-enviado`);
  const inAnalysis = await transitionQuotationHttp(created.quotation, 'em_analise', `${tag}-analise`);
  const decision = await postAsAdmin(
    `/api/ext/supplier/quotations/${created.quotation.id}/decision`,
    { decision: 'aprovada', justification: `Aprovação sintética exclusiva do gate UX-PRO-07C-2 (${tag}).` },
    `${tag}-aprovada`,
  );
  return { ...created, quotation: decision.quotation || inAnalysis };
}

async function createOrderHttp(quotation, tag) {
  const result = await postAsAdmin(
    `/api/ext/supplier/quotations/${quotation.id}/orders`,
    { notes: '' },
    `${tag}-pedido`,
    201,
  );
  return result.order;
}

async function eventCountForKey(key) {
  const result = await pool.query(
    'SELECT count(*)::int AS count FROM ext_supplier_portal_events WHERE created_by_identity = $1 AND idempotency_key = $2',
    [adminIdentityId, key],
  );
  return result.rows[0].count;
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
  base.writes = {
    path: '', mode: 'pass', remaining: 0, delay: 0, status: 503, code: 'supplier_journey_unavailable',
    ...(overrides.writes || {}),
  };
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
    window.__uxSupplierControl = {
      rules: control.rules,
      calls: { references: 0, quotations: 0, orders: 0, detail: 0, writes: [] },
    };
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

      // Falhas de escrita são interceptadas somente na cópia de window.fetch
      // instalada nesta página Chromium. As repetições são chamadas explícitas
      // da UI; nenhum servidor, rota ou cliente HTTP é substituído pelo gate.
      const writeRule = window.__uxSupplierControl.rules.writes;
      if (method === 'POST' && writeRule.path && pathname === writeRule.path) {
        const bodyText = typeof init?.body === 'string' ? init.body : '';
        const headers = new Headers(init?.headers || (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined));
        let body = null;
        try { body = JSON.parse(bodyText); } catch { /* corpo fica visível como texto vazio */ }
        const call = {
          method,
          path: pathname,
          bodyText,
          body,
          idempotencyKey: headers.get('idempotency-key'),
        };
        window.__uxSupplierControl.calls.writes.push(call);
        const shouldInject = writeRule.remaining > 0;
        if (shouldInject) writeRule.remaining -= 1;
        if (shouldInject && writeRule.delay > 0) await new Promise(resolve => setTimeout(resolve, writeRule.delay));

        if (shouldInject && writeRule.mode === 'network') throw new TypeError('Failed to fetch');
        if (shouldInject && writeRule.mode === 'response') {
          return new Response(JSON.stringify({ error: writeRule.code }), {
            status: writeRule.status,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (shouldInject && writeRule.mode === 'after-commit-malformed') {
          const response = await original(input, init);
          call.serverStatus = response.status;
          if (!response.ok) return response;
          await response.text();
          return new Response(JSON.stringify({ note: 'resposta 2xx deliberadamente sem o recurso canônico' }), {
            status: response.status,
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

async function selectQuotation(page, quotation) {
  const list = page.locator('[data-testid="fornecedores-quotations-lista"]');
  await list.waitFor();
  await list.getByRole('button').filter({ hasText: quotation.protocol }).first().click();
  await page.locator('[data-testid="fornecedores-detalhe-painel"]').waitFor();
  await page.getByText(quotation.protocol, { exact: true }).first().waitFor();
}

async function prepareMutationCase(browser, kind, writeRule = {}) {
  const tag = `07c2-${kind}-${randomUUID().slice(0, 8)}`;
  let quotation = null;
  let order = null;
  let catalog = null;
  let pathname = '';
  let keyOperation = '';
  let actionId = '';
  let actionLabel = '';
  let expectedBody = {};
  let submit;

  if (kind === 'create-quotation') {
    catalog = await seedCatalog(tag);
    pathname = `/api/ext/supplier/suppliers/${catalog.supplierId}/products/${catalog.productId}/quotations`;
    keyOperation = actionId = 'create-quotation';
    actionLabel = 'Criar cotação';
    expectedBody = { quantity: 1, unit_price_cents: 2500, notes: '' };
    submit = async page => {
      await page.locator('#fornecedores-supplier').selectOption(catalog.supplierId);
      await page.locator('#fornecedores-product').selectOption(catalog.productId);
      await page.locator('#fornecedores-price').fill('25.00');
      await page.getByRole('button', { name: 'Confirmar no servidor' }).click();
    };
  } else if (kind === 'quotation-status') {
    ({ quotation } = await createQuotation(tag));
    pathname = `/api/ext/supplier/quotations/${quotation.id}/status`;
    keyOperation = actionId = `quote-${quotation.id}-enviado`;
    actionLabel = 'Mover cotação para Enviada';
    expectedBody = { status: 'enviado', reason: 'Transição enviado confirmada pela equipe interna.' };
    submit = async page => page.getByRole('button', { name: 'Mover para Enviada', exact: true }).click();
  } else if (kind === 'decision') {
    ({ quotation } = await createQuotation(tag));
    await transitionQuotationHttp(quotation, 'enviado', `${tag}-enviado`);
    await transitionQuotationHttp(quotation, 'em_analise', `${tag}-analise`);
    pathname = `/api/ext/supplier/quotations/${quotation.id}/decision`;
    keyOperation = `decision-${quotation.id}`;
    actionId = `${keyOperation}-aprovada`;
    actionLabel = 'Aprovar cotação';
    expectedBody = { decision: 'aprovada', justification: `Aprovação sintética UX-PRO-07C-2 (${tag}).` };
    submit = async page => {
      await page.locator('#fornecedores-decisao').fill(expectedBody.justification);
      await page.getByRole('button', { name: 'Aprovar definitivamente', exact: true }).click();
    };
  } else if (kind === 'validity') {
    ({ quotation } = await createQuotation(tag));
    pathname = `/api/ext/supplier/quotations/${quotation.id}/validities`;
    keyOperation = actionId = `validity-${quotation.id}`;
    actionLabel = 'Registrar validade';
    expectedBody = { valid_until: '2030-01-10', source: 'registro_interno', source_reference: '', justification: `Validade sintética UX-PRO-07C-2 (${tag}).` };
    submit = async page => {
      await page.locator('#fornecedores-valida-ate').fill(expectedBody.valid_until);
      await page.locator('#fornecedores-justificativa').fill(expectedBody.justification);
      await page.getByRole('button', { name: 'Registrar validade', exact: true }).click();
    };
  } else if (kind === 'alert-rule') {
    ({ quotation } = await createQuotation(tag));
    pathname = `/api/ext/supplier/quotations/${quotation.id}/alert-rules`;
    keyOperation = actionId = `alert-${quotation.id}`;
    actionLabel = 'Registrar regra de alerta';
    expectedBody = { days_before: 15, justification: `Regra sintética UX-PRO-07C-2 (${tag}).` };
    submit = async page => {
      await page.locator('#fornecedores-dias').fill(String(expectedBody.days_before));
      await page.locator('#fornecedores-regra').fill(expectedBody.justification);
      await page.getByRole('button', { name: 'Registrar regra explícita', exact: true }).click();
    };
  } else if (kind === 'document') {
    ({ quotation } = await createQuotation(tag));
    pathname = `/api/ext/supplier/quotations/${quotation.id}/documents`;
    keyOperation = actionId = `document-${quotation.id}`;
    actionLabel = 'Registrar referência documental';
    expectedBody = {
      document_type: 'proposta',
      file_name: `Proposta sintética ${tag}.pdf`,
      file_url: `https://evidence.invalid/${randomUUID()}.pdf`,
      storage_key: `synthetic/ux-pro-07c-2/${randomUUID()}`,
    };
    submit = async page => {
      await page.locator('#fornecedores-tipo').fill(expectedBody.document_type);
      await page.locator('#fornecedores-nome').fill(expectedBody.file_name);
      await page.locator('#fornecedores-url').fill(expectedBody.file_url);
      await page.locator('#fornecedores-chave').fill(expectedBody.storage_key);
      await page.getByRole('button', { name: 'Registrar referência', exact: true }).click();
    };
  } else if (kind === 'order-create') {
    ({ quotation } = await approveQuotationHttp(tag));
    pathname = `/api/ext/supplier/quotations/${quotation.id}/orders`;
    keyOperation = actionId = `order-${quotation.id}`;
    actionLabel = 'Criar pedido derivado';
    expectedBody = { notes: '' };
    submit = async page => page.getByRole('button', { name: 'Criar pedido derivado', exact: true }).click();
  } else if (kind === 'order-status') {
    ({ quotation } = await approveQuotationHttp(tag));
    order = await createOrderHttp(quotation, tag);
    pathname = `/api/ext/supplier/orders/${order.id}/status`;
    keyOperation = actionId = `order-${order.id}-emitido`;
    actionLabel = 'Mover pedido para Emitido';
    expectedBody = { status: 'emitido', reason: 'Transição emitido confirmada pela equipe interna.' };
    submit = async page => page.locator(`[data-write-operation="order-${order.id}-emitido"]`).click();
  } else if (kind === 'deadline') {
    ({ quotation } = await approveQuotationHttp(tag));
    order = await createOrderHttp(quotation, tag);
    pathname = `/api/ext/supplier/orders/${order.id}/deadlines`;
    keyOperation = actionId = `deadline-${order.id}`;
    actionLabel = 'Registrar prazo do pedido';
    expectedBody = {
      order_id: order.id,
      due_date: '2030-08-20',
      source: 'registro_interno',
      source_reference: '',
      justification: `Prazo sintético UX-PRO-07C-2 (${tag}).`,
    };
    submit = async page => {
      await page.locator('#fornecedores-pedido-prazo').selectOption(order.id);
      await page.locator('#fornecedores-prazo-data').fill(expectedBody.due_date);
      await page.locator('#fornecedores-prazo-justificativa').fill(expectedBody.justification);
      await page.getByRole('button', { name: 'Registrar prazo', exact: true }).click();
    };
  } else {
    throw new Error(`unknown_supplier_write_case:${kind}`);
  }

  const opened = await openFornecedores(browser, {
    width: writeRule.width || 1440,
    height: writeRule.height || 900,
    rules: { writes: { path: pathname, ...writeRule } },
  });
  if (quotation) await selectQuotation(opened.page, quotation);
  return {
    ...opened,
    quotation,
    order,
    catalog,
    path: pathname,
    keyOperation,
    actionId,
    actionLabel,
    expectedBody,
    submit: () => submit(opened.page),
  };
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
  const measured = await measureEvidence(page);
  assert.deepEqual(measured.problems, [], `${name}: medições automatizadas apontaram ${measured.problems.join(', ') || 'problemas'}`);
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
    ...extra,
    ...measured,
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

async function measureEvidence(page) {
  const overflowDocumentoPx = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const targets = await page.locator('[data-task-workspace] :is(button, select, input, a[href])')
    .evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height).filter(height => height > 0));
  const failClosedSemAcoes = (await page.locator('[data-testid="fornecedores-negado"]').count()) > 0;
  const fallbackTargets = targets.length
    ? targets
    : failClosedSemAcoes
      ? []
      : await page.locator('body :is(button, select, input, a[href])')
        .evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height).filter(height => height > 0));
  const alvosInterativosMedidos = fallbackTargets.length;
  const menorAlvoPx = fallbackTargets.length ? Math.round(Math.min(...fallbackTargets) * 100) / 100 : null;
  const probes = {
    titulo: 'h1',
    listaCotacoes: '[data-testid="fornecedores-quotations-lista"]',
    faixaDesatualizada: '[data-testid$="-desatualizado"]',
    escritaEnviando: '[data-testid="fornecedores-escrita-enviando"]',
    escritaFalha: '[data-testid="fornecedores-escrita-falha"] [data-ui-state="error"]',
    acessoNegado: '[data-testid="fornecedores-negado"] [data-ui-state="denied"]',
  };
  const contrastesInstrumentados = {};
  for (const [name, selector] of Object.entries(probes)) {
    if (await page.locator(selector).count()) contrastesInstrumentados[name] = await contrast(page, selector);
  }
  const problems = [];
  if (!Number.isFinite(overflowDocumentoPx) || overflowDocumentoPx > 1) problems.push('transbordo_documento');
  if (alvosInterativosMedidos === 0 && !failClosedSemAcoes) problems.push('alvo_interativo_ausente');
  if (alvosInterativosMedidos > 0 && menorAlvoPx < 44) problems.push('alvo_interativo_menor_que_44px');
  for (const [name, ratio] of Object.entries(contrastesInstrumentados)) {
    if (!Number.isFinite(ratio) || ratio < 4.5) problems.push(`contraste_${name}_menor_que_4_5`);
  }
  return { overflowDocumentoPx, alvosInterativosMedidos, menorAlvoPx, failClosedSemAcoes, contrastesInstrumentados, problems };
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

const SUPPLIER_WRITE_CASES = [
  'create-quotation',
  'quotation-status',
  'decision',
  'validity',
  'alert-rule',
  'document',
  'order-create',
  'order-status',
  'deadline',
];

function assertMutationCall(call, scenario) {
  assert.equal(call.method, 'POST', 'verbo canônico preservado');
  assert.equal(call.path, scenario.path, 'URL canônica preservada');
  assert.deepEqual(call.body, scenario.expectedBody, 'payload canônico preservado');
  assert.ok(call.idempotencyKey?.startsWith(`ext04-${scenario.keyOperation}-`), 'Idempotency-Key mantém a operação canônica');
}

function assertSameSafeRetry(first, second, scenario) {
  assertMutationCall(first, scenario);
  assertMutationCall(second, scenario);
  assert.equal(second.idempotencyKey, first.idempotencyKey, 'a repetição manual reutiliza exatamente a mesma chave');
  assert.equal(second.bodyText, first.bodyText, 'a repetição manual reutiliza exatamente o mesmo corpo serializado');
}

test('browser: nove escritas anunciam pendência e rejeitam 2xx sem recurso canônico', { skip: !RUN }, async () => {
  for (const [index, kind] of SUPPLIER_WRITE_CASES.entries()) {
    await withBrowser(async browser => {
      const scenario = await prepareMutationCase(browser, kind, {
        mode: 'after-commit-malformed',
        remaining: 1,
        delay: index === 0 ? 2500 : 120,
      });
      try {
        await scenario.submit();
        const sending = scenario.page.locator('[data-testid="fornecedores-escrita-enviando"]');
        await sending.waitFor();
        assert.match(await sending.innerText(), new RegExp(scenario.actionLabel));
        assert.equal(await scenario.page.locator(`[data-write-operation="${scenario.actionId}"]`).getAttribute('aria-busy'), 'true',
          `${kind}: só a ação enviada anuncia aria-busy`);
        assert.equal(await scenario.page.locator('[data-write-operation]:not(:disabled)').count(), 0,
          `${kind}: outra escrita não pode sobrepor a ação pendente`);
        assert.equal(await scenario.page.locator('form input:not(:disabled), form select:not(:disabled), form textarea:not(:disabled)').count(), 0,
          `${kind}: campos de escrita ficam bloqueados durante o envio`);

        if (index === 0) await capture(scenario.page, 'fornecedores-1440-escrita-enviando', { state: 'escrita_pendente' });
        const failure = scenario.page.locator('[data-testid="fornecedores-escrita-falha"]');
        await failure.waitFor();
        assert.equal(await failure.getAttribute('data-write-error-kind'), 'invalid_response', `${kind}: resposta 2xx sem contrato não é sucesso`);
        const failureText = await failure.innerText();
        assert.match(failureText, /HTTP 2/);
        assert.match(failureText, /invalid_supplier_write_response/);
        assert.match(failureText, /incerto/i, `${kind}: uma escrita aplicada não pode ser presumida como desfeita`);
        assert.equal(await scenario.page.locator('[data-testid="fornecedores-escrita-repetir"]').count(), 1,
          `${kind}: repetição exige ação manual explícita`);
        assert.equal(await scenario.page.locator('form input:not(:disabled), form select:not(:disabled), form textarea:not(:disabled)').count(), 0,
          `${kind}: campos permanecem bloqueados enquanto o resultado é incerto`);
        if (index === 0) await capture(scenario.page, 'fornecedores-1440-escrita-resposta-invalida', { state: 'resposta_2xx_escrita_invalida' });

        await scenario.page.waitForTimeout(180);
        const beforeRetry = await scenario.page.evaluate(() => window.__uxSupplierControl.calls.writes.map(call => ({ ...call })));
        assert.equal(beforeRetry.length, 1, `${kind}: nenhuma repetição automática após a falha`);
        assertMutationCall(beforeRetry[0], scenario);
        assert.ok([200, 201].includes(beforeRetry[0].serverStatus), `${kind}: a primeira escrita chegou ao servidor HTTP real`);

        await scenario.page.getByRole('button', { name: 'Repetir operação com a mesma chave', exact: true }).click();
        await failure.waitFor({ state: 'detached' });
        await scenario.page.waitForFunction(() => window.__uxSupplierControl.calls.writes.length === 2);
        const calls = await scenario.page.evaluate(() => window.__uxSupplierControl.calls.writes.map(call => ({ ...call })));
        assertSameSafeRetry(calls[0], calls[1], scenario);
        assert.equal(await eventCountForKey(calls[0].idempotencyKey), 1,
          `${kind}: replay HTTP real não duplica evento nem efeito canônico`);
      } finally {
        await scenario.context.close();
      }
    });
  }
});

test('browser: guarda síncrona bloqueia dois submits no mesmo tick', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const scenario = await prepareMutationCase(browser, 'create-quotation', {
      mode: 'delay', remaining: 1, delay: 1800,
    });
    try {
      await scenario.page.locator('#fornecedores-supplier').selectOption(scenario.catalog.supplierId);
      await scenario.page.locator('#fornecedores-product').selectOption(scenario.catalog.productId);
      await scenario.page.locator('#fornecedores-price').fill('25.00');
      await scenario.page.locator('#fornecedores-price').evaluate(element => {
        const form = element.closest('form');
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      const sending = scenario.page.locator('[data-testid="fornecedores-escrita-enviando"]');
      await sending.waitFor();
      assert.match(await sending.innerText(), /Criar cotação/);
      assert.equal(await scenario.page.locator('[data-write-operation="create-quotation"]').getAttribute('aria-busy'), 'true');
      await scenario.page.waitForFunction(() => window.__uxSupplierControl.calls.writes.length === 1);
      assert.equal(await scenario.page.evaluate(() => window.__uxSupplierControl.calls.writes.length), 1,
        'dois submits síncronos geram um único fetch POST');
      await capture(scenario.page, 'fornecedores-1440-escrita-duplo-submit', { state: 'duplo_submit_bloqueado' });

      const call = await scenario.page.evaluate(() => ({ ...window.__uxSupplierControl.calls.writes[0] }));
      assertMutationCall(call, scenario);
      await scenario.page.getByText(/Cotação confirmada pelo servidor/).waitFor();
      assert.equal(await scenario.page.evaluate(() => window.__uxSupplierControl.calls.writes.length), 1);
      assert.equal(await eventCountForKey(call.idempotencyKey), 1);
      const stored = await pool.query(
        'SELECT count(*)::int AS count FROM ext_supplier_portal_quotations WHERE supplier_id = $1 AND product_id = $2',
        [scenario.catalog.supplierId, scenario.catalog.productId],
      );
      assert.equal(stored.rows[0].count, 1, 'não há cotação duplicada no PostgreSQL');
    } finally {
      await scenario.context.close();
    }
  });
});

test('browser: 5xx e rede são incertos, sem repetição automática, com replay manual de mesma chave', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const scenario = await prepareMutationCase(browser, 'quotation-status', {
      mode: 'response', remaining: 1, status: 503, code: 'supplier_journey_unavailable', width: 390, height: 844,
    });
    try {
      await scenario.submit();
      const failure = scenario.page.locator('[data-testid="fornecedores-escrita-falha"]');
      await failure.waitFor();
      assert.equal(await failure.getAttribute('data-write-error-kind'), 'transient');
      assert.equal(await failure.getAttribute('data-write-http-status'), '503');
      const firstText = await failure.innerText();
      assert.match(firstText, /supplier_journey_unavailable/);
      assert.match(firstText, /incerto/i);
      assert.match(firstText, /sem repetição automática/i);
      await capture(scenario.page, 'fornecedores-390-escrita-falha-transitoria', { state: 'falha_503_incerta' });
      await scenario.page.waitForTimeout(180);
      assert.equal(await scenario.page.evaluate(() => window.__uxSupplierControl.calls.writes.length), 1,
        'a UI não repete o POST 503 por conta própria');
      const first = await scenario.page.evaluate(() => ({ ...window.__uxSupplierControl.calls.writes[0] }));
      assertMutationCall(first, scenario);

      await scenario.page.getByRole('button', { name: 'Repetir operação com a mesma chave', exact: true }).click();
      await failure.waitFor({ state: 'detached' });
      await scenario.page.getByText(/Estado enviado confirmado pelo servidor/).waitFor();
      const afterFiveHundred = await scenario.page.evaluate(() => window.__uxSupplierControl.calls.writes.map(call => ({ ...call })));
      assert.equal(afterFiveHundred.length, 2);
      assertSameSafeRetry(afterFiveHundred[0], afterFiveHundred[1], scenario);
      assert.equal(await eventCountForKey(first.idempotencyKey), 1);

      await scenario.page.evaluate(() => Object.assign(window.__uxSupplierControl.rules.writes, {
        mode: 'network', remaining: 1, status: 0, code: '', delay: 0,
      }));
      await scenario.page.getByRole('button', { name: 'Mover para Em análise', exact: true }).click();
      const networkFailure = scenario.page.locator('[data-testid="fornecedores-escrita-falha"]');
      await networkFailure.waitFor();
      assert.equal(await networkFailure.getAttribute('data-write-error-kind'), 'transient');
      assert.equal(await networkFailure.getAttribute('data-write-http-status'), '0');
      assert.match(await networkFailure.innerText(), /sem resposta HTTP/i);
      assert.match(await networkFailure.innerText(), /incerto/i);
      await capture(scenario.page, 'fornecedores-390-escrita-rede-incerta', { state: 'falha_rede_incerta' });
      await scenario.page.waitForTimeout(180);
      const beforeNetworkRetry = await scenario.page.evaluate(() => window.__uxSupplierControl.calls.writes.map(call => ({ ...call })));
      assert.equal(beforeNetworkRetry.length, 3, 'a falha de rede não dispara outro POST automaticamente');
      const networkCall = beforeNetworkRetry[2];

      await scenario.page.getByRole('button', { name: 'Repetir operação com a mesma chave', exact: true }).click();
      await networkFailure.waitFor({ state: 'detached' });
      await scenario.page.getByText(/Estado em_analise confirmado pelo servidor/).waitFor();
      const afterNetworkRetry = await scenario.page.evaluate(() => window.__uxSupplierControl.calls.writes.map(call => ({ ...call })));
      assert.equal(afterNetworkRetry.length, 4);
      assert.equal(afterNetworkRetry[3].idempotencyKey, networkCall.idempotencyKey);
      assert.equal(afterNetworkRetry[3].bodyText, networkCall.bodyText);
      assert.equal(afterNetworkRetry[3].path, scenario.path);
      assert.equal(await eventCountForKey(networkCall.idempotencyKey), 1);
    } finally {
      await scenario.context.close();
    }
  });
});

test('browser: HTTP 400 validação e HTTP 409 conflito são classificados separadamente', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const invalid = await prepareMutationCase(browser, 'create-quotation');
    await invalid.page.locator('#fornecedores-supplier').selectOption(invalid.catalog.supplierId);
    await invalid.page.locator('#fornecedores-product').selectOption(invalid.catalog.productId);
    await invalid.page.locator('#fornecedores-price').fill('x');
    await invalid.page.getByRole('button', { name: 'Confirmar no servidor' }).click();
    const validationFailure = invalid.page.locator('[data-testid="fornecedores-escrita-falha"]');
    await validationFailure.waitFor();
    assert.equal(await validationFailure.getAttribute('data-write-error-kind'), 'validation');
    assert.equal(await validationFailure.getAttribute('data-write-http-status'), '400');
    assert.match(await validationFailure.innerText(), /invalid_unit_price_cents/);
    assert.doesNotMatch(await validationFailure.innerText(), /resultado .* incerto/i);
    assert.equal(await invalid.page.locator('[data-testid="fornecedores-escrita-repetir"]').count(), 0,
      'uma negativa de validação não apresenta replay de resultado incerto');
    assert.equal(await invalid.page.evaluate(() => window.__uxSupplierControl.calls.writes.length), 1);
  });

  const { quotation } = await createQuotation(`07c2-conflict-${randomUUID().slice(0, 8)}`);
  await withBrowser(async browser => {
    const conflict = await openFornecedores(browser, {
      rules: { writes: { path: `/api/ext/supplier/quotations/${quotation.id}/status` } },
    });
    await selectQuotation(conflict.page, quotation);
    await transitionQuotationHttp(quotation, 'enviado', `07c2-conflict-${quotation.id}-enviado`);
    await transitionQuotationHttp(quotation, 'em_analise', `07c2-conflict-${quotation.id}-analise`);
    await conflict.page.getByRole('button', { name: 'Mover para Enviada', exact: true }).click();
    const conflictFailure = conflict.page.locator('[data-testid="fornecedores-escrita-falha"]');
    await conflictFailure.waitFor();
    assert.equal(await conflictFailure.getAttribute('data-write-error-kind'), 'conflict');
    assert.equal(await conflictFailure.getAttribute('data-write-http-status'), '409');
    assert.match(await conflictFailure.innerText(), /invalid_status_transition/);
    assert.doesNotMatch(await conflictFailure.innerText(), /resultado .* incerto/i);
    assert.equal(await conflict.page.locator('[data-testid="fornecedores-escrita-repetir"]').count(), 0,
      'conflito real do estado não oferece repetição cega');
    const calls = await conflict.page.evaluate(() => window.__uxSupplierControl.calls.writes.map(call => ({ ...call })));
    assert.equal(calls.length, 1);
    assert.equal(await eventCountForKey(calls[0].idempotencyKey), 0, '409 é recusado antes de gravar evento');
    await capture(conflict.page, 'fornecedores-1440-escrita-conflito', { state: 'conflito_409_real' });
  });
});

test('browser: 401 e 403 em escrita falham fechados e removem todos os dados protegidos', { skip: !RUN }, async () => {
  for (const [status, code] of [[401, 'unauthorized'], [403, 'forbidden_role']]) {
    await withBrowser(async browser => {
      const scenario = await openFornecedores(browser, {
        width: 768,
        height: 1024,
        rules: {
          writes: {
            path: `/api/ext/supplier/quotations/${quotationId}/status`,
            mode: 'response', remaining: 1, status, code,
          },
        },
      });
      await selectQuotation(scenario.page, { id: quotationId, protocol: quotationProtocol });
      await scenario.page.click('[data-admin-theme-toggle="true"]');
      await scenario.page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
      await scenario.page.getByRole('button', { name: 'Mover para Enviada', exact: true }).click();
      const denied = scenario.page.locator('[data-testid="fornecedores-negado"]');
      await denied.waitFor();
      assert.equal(await denied.getAttribute('data-write-http-status'), String(status));
      assert.equal(await denied.locator('[data-ui-state="denied"]').count(), 1);
      assert.match(await denied.innerText(), new RegExp(`HTTP ${status}`));
      assert.match(await denied.innerText(), new RegExp(code));
      assert.equal(await scenario.page.locator('[data-testid="fornecedores-quotations-lista"]').count(), 0);
      assert.equal(await scenario.page.locator('[data-testid="fornecedores-orders-lista"]').count(), 0);
      assert.equal(await scenario.page.locator('[data-testid="fornecedores-detalhe-painel"]').count(), 0);
      assert.equal(await scenario.page.locator('[data-write-operation]').count(), 0);
      assert.equal(await scenario.page.locator('[data-testid="fornecedores-escrita-repetir"]').count(), 0,
        'sessão/papel negado não oferece repetição da mutação');
      assert.equal(await scenario.page.locator('[data-testid="fornecedores-escrita-enviando"]').count(), 0);
      assert.equal(await scenario.page.evaluate(() => window.__uxSupplierControl.calls.writes.length), 1);
      if (status === 403) {
        await capture(scenario.page, 'fornecedores-768-noite-escrita-negada', { state: 'negada_403_fail_closed' });
      }
    });
  }
});
