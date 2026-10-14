// UX-PRO-07A — gate aditivo da leitura de /admin/patrimonio.
//
// Prova com HTTP, PostgreSQL e Chromium reais: autorizacao do servidor,
// carregamento/vazio/falha inicial, repeticao real, preservacao marcada em
// falha transitoria de releitura, negativa pos-sucesso fail-closed, tablist por
// teclado, responsividade e tema. Falhas sao injetadas apenas em window.fetch.
// Nao substitui nem altera as assercoes herdadas de L06.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
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
const evidenceDir = process.env.UX_ASSET_EVIDENCE_DIR || '';
const stage = 'ux-pro-07-patrimonio';

let server;
let baseUrl;
let pool;
let adminCookie;
let commercialCookie;
let productId;
let productName;
let secondProductName;
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

async function createProduct(name, suffix) {
  const response = await api('/api/ast/products', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      sku: `UX07A-${suffix}`,
      name,
      description: `Produto sintetico ${suffix} criado pelo gate focal de patrimonio.`,
      category: 'comunicacao',
      unit_measure: 'UN',
      cost_cents: 10000,
      sale_price_cents: 15000,
      stock_min: 2,
      location: 'Almoxarifado sintetico do gate',
    },
  });
  assert.equal(response.status, 201, `produto sintetico deveria ser criado: ${JSON.stringify(response.body)}`);
  return response.body.id;
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
      console.log(`UX_ASSET_BROWSER_RETRY tentativa=${attempt}: ${String(error.message).split('\n')[0]}`);
    } finally {
      await browser.close().catch(() => {});
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw lastError;
}

async function openAsset(browser, {
  width = 1440,
  height = 900,
  delay = 0,
  fail = false,
  failCount = 0,
  status = 503,
  code = 'ast_unavailable',
} = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  const separator = adminCookie.indexOf('=');
  await context.addCookies([{
    name: adminCookie.slice(0, separator),
    value: adminCookie.slice(separator + 1),
    url: baseUrl,
  }]);
  const page = await context.newPage();
  page.setDefaultTimeout(Number(process.env.UX_ASSET_UI_TIMEOUT || 45_000));
  page.setDefaultNavigationTimeout(90_000);
  await page.addInitScript(control => {
    const original = window.fetch.bind(window);
    window.__uxAssetControl = { ...control, calls: 0 };
    window.fetch = async (input, init) => {
      const raw = typeof input === 'string' ? input : (input?.url || '');
      const pathname = new URL(raw, window.location.origin).pathname;
      const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
      if (pathname === '/api/ast/products' && method === 'GET') {
        window.__uxAssetControl.calls += 1;
        if (window.__uxAssetControl.delay > 0) {
          await new Promise(resolve => setTimeout(resolve, window.__uxAssetControl.delay));
        }
        const shouldFail = window.__uxAssetControl.fail || window.__uxAssetControl.failCount > 0;
        if (window.__uxAssetControl.failCount > 0) window.__uxAssetControl.failCount -= 1;
        if (shouldFail) {
          return new Response(JSON.stringify({ error: window.__uxAssetControl.code }), {
            status: window.__uxAssetControl.status,
            headers: { 'content-type': 'application/json' },
          });
        }
      }
      return original(input, init);
    };
  }, { delay, fail, failCount, status, code });
  await page.goto(`${baseUrl}/admin/patrimonio`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { level: 1, name: /Patrimônio, almoxarifado e ativos/i }).waitFor();
  return { context, page };
}

async function writeEvidenceSummary() {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  const entries = [...new Map(evidenceEntries.map(entry => [path.basename(entry.screenshot), entry])).values()];
  await writeFile(path.join(evidenceDir, 'resumo.json'), `${JSON.stringify({
    stage,
    generatedBy: 'npm run test:ux-asset:pg (PostgreSQL descartavel + HTTP real + Chromium)',
    notes: 'Massa inteiramente sintetica criada pela API AST. problems resulta das medicoes automatizadas; nao representa validacao manual nem aceite humano.',
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
    route: '/admin/patrimonio',
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
      NEXT_DIST_DIR: '.next/integration-ux-asset',
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
  const commercial = await provisionStaff(pool, { role: 'comercial' });
  adminCookie = await loginStaffHttp(admin.email);
  commercialCookie = await loginStaffHttp(commercial.email);
  productName = `Radio sintetico UX-PRO-07A ${randomUUID().slice(0, 8)}`;
  productId = await createProduct(productName, randomUUID().slice(0, 8).toUpperCase());

  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/admin/patrimonio`, { redirect: 'manual' }).catch(() => null);
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

test('AST continua exigindo sessao e papel autorizado nas seis leituras da tela', { skip: !RUN }, async () => {
  const endpoints = ['products', 'reservations', 'serialized-assets', 'service-orders', 'inventories', 'requisitions'];
  for (const endpoint of endpoints) {
    const anonymous = await api(`/api/ast/${endpoint}`);
    assert.equal(anonymous.status, 401, `${endpoint}: anonimo recusado`);
    assert.ok(!('items' in (anonymous.body || {})), `${endpoint}: negativa nao pode vazar items`);
    const commercial = await api(`/api/ast/${endpoint}`, { cookie: commercialCookie });
    assert.equal(commercial.status, 403, `${endpoint}: comercial recusado pelo servidor`);
    const admin = await api(`/api/ast/${endpoint}`, { cookie: adminCookie });
    assert.equal(admin.status, 200, `${endpoint}: admin autorizado`);
  }
});

test('browser: carregamento contextual e vazio concluido nunca se confundem', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openAsset(browser, { delay: 1200 });
    const loading = page.locator('[data-testid="patrimonio-produtos-carregando"]');
    await loading.waitFor();
    assert.equal(await loading.locator('[data-ui-state="loading"]').count(), 1);
    assert.equal(await page.locator('[data-testid="patrimonio-produtos-vazio"]').count(), 0,
      'vazio nao aparece antes da resposta');
    await page.locator('[data-testid="patrimonio-produtos-tabela"]').waitFor();
    await page.getByRole('tab', { name: 'Reservas Operacionais', exact: true }).click();
    const empty = page.locator('[data-testid="patrimonio-reservas-vazio"]');
    await empty.waitFor();
    assert.match(await empty.innerText(), /consulta foi concluída/i);
    assert.match(await empty.innerText(), /atualiz/i);
    await context.close();
  });
});

test('browser: falha inicial declara causa e Tentar novamente faz nova leitura', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openAsset(browser, { fail: true, code: 'ast_temporarily_unavailable' });
    const failure = page.locator('[data-testid="patrimonio-produtos-falha"]');
    await failure.waitFor();
    assert.equal(await failure.locator('[data-ui-state="error"]').count(), 1);
    assert.match(await failure.innerText(), /não significa que o catálogo esteja vazio/i);
    assert.match(await failure.innerText(), /ast_temporarily_unavailable/);
    await capture(page, 'patrimonio-1440-falha-inicial', { state: 'falha_inicial' });
    await page.evaluate(() => { window.__uxAssetControl.fail = false; });
    await failure.getByRole('button', { name: 'Tentar novamente' }).click();
    const table = page.locator('[data-testid="patrimonio-produtos-tabela"]');
    await table.waitFor();
    assert.match(await table.innerText(), new RegExp(productName));
    assert.ok(await page.evaluate(() => window.__uxAssetControl.calls >= 2), 'repeticao precisa reler de verdade');
    await context.close();
  });
});

test('browser: falha de releitura preserva dado, informa hora e repeticao atualiza de verdade', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openAsset(browser);
    const table = page.locator('[data-testid="patrimonio-produtos-tabela"]');
    await table.waitFor();
    assert.match(await table.innerText(), new RegExp(productName));

    await page.evaluate(() => {
      window.__uxAssetControl.fail = true;
      window.__uxAssetControl.status = 503;
      window.__uxAssetControl.code = 'ast_refresh_unavailable';
    });
    await page.getByRole('button', { name: 'Atualizar produtos e estoque' }).click();
    const stale = page.locator('[data-testid="patrimonio-produtos-desatualizado"]');
    await stale.waitFor();
    const staleText = await stale.innerText();
    assert.match(staleText, /última leitura concluída/i);
    assert.match(staleText, /\d{2}:\d{2}:\d{2}/);
    assert.match(staleText, /ast_refresh_unavailable/);
    assert.match(await table.innerText(), new RegExp(productName), 'dado lido continua visivel e marcado');

    secondProductName = `Produto novo durante falha ${randomUUID().slice(0, 8)}`;
    await createProduct(secondProductName, randomUUID().slice(0, 8).toUpperCase());
    assert.doesNotMatch(await table.innerText(), new RegExp(secondProductName), 'dado novo ainda nao pertence ao recorte preservado');

    const ratio = await contrast(page, '[data-testid="patrimonio-produtos-desatualizado"]');
    assert.ok(ratio >= 4.5, `contraste da faixa precisa ser >= 4.5:1, medido ${ratio}:1`);
    await capture(page, 'patrimonio-1440-desatualizado', {
      state: 'releitura_falhou_dado_preservado',
      contrasteFaixa: ratio,
    });

    await page.evaluate(() => { window.__uxAssetControl.fail = false; });
    await stale.getByRole('button', { name: 'Tentar novamente' }).click();
    await stale.waitFor({ state: 'detached' });
    await page.getByText(secondProductName, { exact: true }).waitFor();
    assert.match(await table.innerText(), new RegExp(secondProductName), 'repeticao bem-sucedida mostra leitura nova');
    await context.close();
  });
});

test('browser: negativa depois do sucesso falha fechada e nao preserva dado protegido', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openAsset(browser);
    await page.locator('[data-testid="patrimonio-produtos-tabela"]').waitFor();
    await page.evaluate(() => {
      window.__uxAssetControl.fail = true;
      window.__uxAssetControl.status = 403;
      window.__uxAssetControl.code = 'forbidden';
    });
    await page.getByRole('button', { name: 'Atualizar produtos e estoque' }).click();
    const denied = page.locator('[data-testid="patrimonio-produtos-negado"]');
    await denied.waitFor();
    assert.equal(await denied.locator('[data-ui-state="denied"]').count(), 1);
    assert.equal(await page.locator('[data-testid="patrimonio-produtos-tabela"]').count(), 0,
      'negativa remove dado lido anteriormente');
    assert.equal(await denied.getByRole('button').count(), 0, 'negativa nao oferece repeticao da mesma chamada');
    assert.equal(await page.locator('[data-testid="patrimonio-produtos-desatualizado"]').count(), 0,
      'negativa nao e apresentada como dado desatualizado');
    await context.close();
  });
});

test('browser: seis abas usam tablist, roving tabindex e setas Home End', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openAsset(browser);
    await page.locator('[data-testid="patrimonio-produtos-tabela"]').waitFor();
    const tabs = page.getByRole('tab');
    assert.equal(await tabs.count(), 6);
    assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1);
    assert.equal(await page.locator('[role="tab"][tabindex="-1"]').count(), 5);
    assert.equal(await page.getByRole('tabpanel').count(), 1);
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: 'Reservas Operacionais' }).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('End');
    assert.equal(await page.getByRole('tab', { name: 'Requisições Internas' }).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await page.getByRole('tab', { name: 'Produtos & Estoque' }).getAttribute('aria-selected'), 'true');
    await context.close();
  });
});

test('browser: 320 390 768 1440, tema noturno e percurso de teclado medidos sem problemas', { skip: !RUN }, async () => {
  await withBrowser(async browser => {
    const { context, page } = await openAsset(browser);
    await page.locator('[data-testid="patrimonio-produtos-tabela"]').waitFor();
    for (const [width, height] of [[1440, 900], [768, 1024], [390, 844], [320, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `transbordo de ${overflow}px em ${width}px no tema dia`);
      const minTarget = await page.getByRole('tab').evaluateAll(elements => Math.min(...elements.map(element => element.getBoundingClientRect().height)));
      assert.ok(minTarget >= 44, `abas precisam ter pelo menos 44px; medido ${minTarget}px em ${width}px`);
      await capture(page, `patrimonio-${width}-dia`, { overflowDocumentoPx: overflow, menorAlvoAbaPx: minTarget });

      if (width === 768) {
        await page.click('[data-admin-theme-toggle="true"]');
        await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
        await page.waitForTimeout(400);
        const nightOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        const headingContrast = await contrast(page, 'h1');
        const tableContrast = await contrast(page, '[data-testid="patrimonio-produtos-tabela"] tbody td:first-child');
        assert.ok(nightOverflow <= 1, `transbordo de ${nightOverflow}px no tema noite`);
        assert.ok(headingContrast >= 4.5, `contraste do titulo no tema noite: ${headingContrast}:1`);
        assert.ok(tableContrast >= 4.5, `contraste da tabela no tema noite: ${tableContrast}:1`);
        await capture(page, 'patrimonio-768-noite', {
          overflowDocumentoPx: nightOverflow,
          contrasteTitulo: headingContrast,
          contrasteTabela: tableContrast,
        });
        await page.click('[data-admin-theme-toggle="true"]');
        await page.waitForFunction(() => document.documentElement.dataset.adminTheme !== 'night');
      }

      if (width === 390) {
        await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
        const firstTab = page.getByRole('tab', { name: 'Produtos & Estoque' });
        let reached = false;
        let firstFocus = false;
        const traversal = [];
        for (let step = 0; step < 60 && !reached; step++) {
          await page.keyboard.press('Tab');
          const target = await page.evaluate(() => {
            const element = document.activeElement;
            return element?.id || element?.getAttribute?.('aria-label') || element?.textContent?.trim().slice(0, 80) || element?.tagName?.toLowerCase() || 'desconhecido';
          });
          traversal.push(target);
          if (step === 0) {
            firstFocus = await page.evaluate(() => {
              const element = document.activeElement;
              if (!(element instanceof HTMLElement)) return false;
              const style = getComputedStyle(element);
              return style.outlineStyle !== 'none' && (parseFloat(style.outlineWidth) || 0) >= 1;
            });
          }
          reached = await firstTab.evaluate(element => element === document.activeElement);
        }
        assert.ok(firstFocus, 'o primeiro foco por Tab precisa ser visivel');
        assert.ok(reached, 'a primeira aba precisa ser alcancavel por Tab');
        const outline = await firstTab.evaluate(element => ({
          style: getComputedStyle(element).outlineStyle,
          width: parseFloat(getComputedStyle(element).outlineWidth) || 0,
        }));
        assert.ok(outline.style !== 'none' && outline.width >= 1,
          `foco da aba precisa ser visivel: ${outline.style}/${outline.width}px`);
        await capture(page, 'patrimonio-390-teclado', {
          state: 'percurso_teclado',
          firstFocus: true,
          percursoTeclado: traversal,
        });
        await recordKeyboardCapture(evidenceDir, {
          stage,
          route: '/admin/patrimonio',
          role: 'admin',
          viewport: '390x844',
          theme: 'day',
          file: 'patrimonio-390-teclado.png',
          firstFocus: true,
          percursoTeclado: traversal,
        });
        if (evidenceDir) {
          const summary = JSON.parse(await readFile(path.join(evidenceDir, 'resumo.json'), 'utf8'));
          const entry = summary.entries.find(item => path.basename(item.screenshot || item.file || '') === 'patrimonio-390-teclado.png');
          assert.ok(entry?.firstFocus);
          assert.ok(entry?.percursoTeclado?.length > 0);
          assert.deepEqual(entry.problems, []);
        }
      }
    }
    await context.close();
  });
});
