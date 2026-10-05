// UX-03B — gate da jornada "lista → detalhe → ação" do CRM, por HTTP real
// contra PostgreSQL real (executado por scripts/qa-ux-crm-postgres.mjs, que
// sobe um cluster descartável) e por Chromium real.
//
// O que este gate prova: a massa fictícia é criada pelas MESMAS APIs que a
// pessoa usa, a sessão é a sessão real de staff, e a interface nova abre o
// registro, troca de aba por teclado, devolve o foco ao fechar, traduz os
// estágios sem alterar o valor canônico e distingue carregando / vazio /
// falha / sem permissão.
//
// O que este gate NÃO prova: aceite humano, homologação de Marcelo/Andreia,
// comportamento em Windows ou na máquina do operador.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { mkdir } from 'node:fs/promises';
import { provisionStaff, STAFF_TEST_PASSWORD } from './helpers/staff-login.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');

let server, baseUrl, pool, browser;

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
      NEXT_DIST_DIR: '.next/integration-ux-crm',
      SITE_ADMIN_SESSION_SECRET: randomUUID().repeat(2),
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
  browser = await launchBrowser();
  for (const route of ['/admin/entrar', '/admin/crm']) {
    const deadline = Date.now() + 180_000;
    for (;;) {
      try {
        const res = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
        if (res.status !== 404) break;
      } catch { /* ainda subindo */ }
      if (Date.now() > deadline) throw new Error(`page_compile_timeout_${route}`);
      await new Promise(r => setTimeout(r, 500));
    }
  }
});

after(async () => {
  await browser?.close().catch(() => {});
  await pool?.end().catch(() => {});
  if (server && !server.killed) { server.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); server.kill('SIGKILL'); }
});

// Evidência opcional: com UX_CRM_EVIDENCE_DIR, o gate grava capturas
// sanitizadas (massa fictícia, sem dado pessoal e sem credencial).
const evidenceDir = process.env.UX_CRM_EVIDENCE_DIR || '';
async function capture(page, nome) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage: true });
}

function api(pathname, { method = 'GET', body, cookie } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { origin: baseUrl } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  }).then(async res => ({ status: res.status, body: await res.json().catch(() => null), setCookie: res.headers.getSetCookie?.() || [] }));
}

async function loginHttp(email) {
  const res = await api('/api/admin/session', { method: 'POST', body: { email, password: STAFF_TEST_PASSWORD } });
  assert.equal(res.status, 200, `login deveria retornar 200, veio ${res.status}: ${JSON.stringify(res.body)}`);
  const raw = res.setCookie.find(c => c.startsWith('seg_admin_session='));
  assert.ok(raw, 'login precisa emitir o cookie de sessão staff');
  return raw.split(';')[0];
}

/** Massa fictícia criada pelas mesmas APIs usadas pela pessoa. */
async function seedFunnel(cookie, label) {
  const company = await api('/api/crm/companies', {
    method: 'POST', cookie,
    body: { displayName: `Condomínio Fictício ${label}`, city: 'Barueri', type: 'prospect', segment: 'Condomínio' },
  });
  assert.equal(company.status, 201, `criação de empresa: ${JSON.stringify(company.body)}`);
  const companyId = company.body?.company?.id || company.body?.id;
  assert.ok(companyId, `a API precisa devolver o id da empresa: ${JSON.stringify(company.body)}`);

  const opportunity = await api('/api/crm/opportunities', {
    method: 'POST', cookie,
    body: {
      company_id: companyId,
      title: `Portaria 24h ${label}`,
      service_name: 'Segurança desarmada',
      need_description: 'Cobertura noturna de portaria',
      priority: 'alta',
      next_action: 'Agendar vistoria',
    },
  });
  assert.equal(opportunity.status, 201, `criação de oportunidade: ${JSON.stringify(opportunity.body)}`);
  const opportunityId = opportunity.body?.opportunity?.id || opportunity.body?.id;
  assert.ok(opportunityId, `a API precisa devolver o id da oportunidade: ${JSON.stringify(opportunity.body)}`);
  return { companyId, opportunityId };
}

// Um único Chromium para toda a suíte: o binário empacotado é instável quando
// relançado muitas vezes em sequência neste ambiente.
async function launchBrowser() {
  let ultimo;
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    try { return await launchOnce(); } catch (erro) { ultimo = erro; await new Promise(r => setTimeout(r, 1500)); }
  }
  throw ultimo;
}

async function launchOnce() {
  return playwrightChromium.launch({
    executablePath: await packagedChromium.executablePath(),
    // O pacote serverless inclui --disable-web-security, que removeria Origin
    // dos POSTs e mascararia a proteção CSRF; removido como nos demais gates.
    // --single-process/--no-zygote desligam a interceptação de rede do
    // Playwright, necessária para provar os estados de falha e de 403.
    args: packagedChromium.args.filter(arg =>
      !['--disable-web-security', '--single-process', '--no-zygote'].includes(arg)),
    headless: true,
  });
}

/**
 * Força, SÓ dentro da aba do navegador, uma resposta de erro para a leitura do
 * funil. A interceptação de rede do Playwright não funciona com o Chromium
 * empacotado deste repositório, então o estado de falha é induzido no próprio
 * `window.fetch` da página. Nada disso entra no sistema: o servidor continua
 * intacto e, ao limpar a variável, a leitura real volta a valer.
 */
async function forceFunnelStatus(context, status, code) {
  await context.addInitScript(({ status, code }) => {
    window.__uxForcarFalhaFunil = true;
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (window.__uxForcarFalhaFunil && url.includes('/api/crm/opportunities?')) {
        return Promise.resolve(new Response(JSON.stringify({ error: code }), {
          status, headers: { 'content-type': 'application/json' },
        }));
      }
      return original(input, init);
    };
  }, { status, code });
}

async function loginBrowser(page, email) {
  await page.goto('/admin/entrar', { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForSelector('#login-email', { timeout: 90_000 });
  await page.fill('#login-email', email);
  await page.fill('#login-password', STAFF_TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(\/|\?|#|$)/, { timeout: 60_000 });
  // Espera o envelope administrativo assentar antes de navegar de novo: sem
  // isso, a navegação seguinte pode ser abortada pela hidratação em curso.
  await page.waitForSelector('[data-admin-chrome="true"]', { timeout: 60_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
}

// ---------------------------------------------------------------------------
// HTTP real — contratos preservados
// ---------------------------------------------------------------------------

test('a API do funil continua exigindo sessão e papel, sem mudança de contrato', { skip: !RUN }, async () => {
  const anonimo = await api('/api/crm/opportunities');
  assert.equal(anonimo.status, 401, 'anônimo deve continuar recebendo 401');
  assert.equal(anonimo.body?.error, 'admin_session_required');

  const rh = await provisionStaff(pool, { role: 'rh' });
  const cookieRh = await loginHttp(rh.email);
  const negado = await api('/api/crm/opportunities', { cookie: cookieRh });
  assert.equal(negado.status, 403, 'papel fora da família comercial deve continuar recebendo 403');
  assert.equal(negado.body?.error, 'commercial_role_required');
  assert.ok(!JSON.stringify(negado.body).includes('opportunities'), 'a negativa não pode vazar dados');
});

test('o funil continua pessoal: outra pessoa comercial não vê a oportunidade alheia', { skip: !RUN }, async () => {
  const dona = await provisionStaff(pool, { role: 'comercial' });
  const outra = await provisionStaff(pool, { role: 'comercial' });
  const cookieDona = await loginHttp(dona.email);
  const cookieOutra = await loginHttp(outra.email);
  const { opportunityId } = await seedFunnel(cookieDona, 'Isolamento');

  const minha = await api(`/api/crm/opportunities/${opportunityId}`, { cookie: cookieDona });
  assert.equal(minha.status, 200);

  const alheia = await api(`/api/crm/opportunities/${opportunityId}`, { cookie: cookieOutra });
  assert.ok([403, 404].includes(alheia.status), `escopo por responsável deve negar, veio ${alheia.status}`);
});

// ---------------------------------------------------------------------------
// Navegador real — jornada lista → detalhe → ação
// ---------------------------------------------------------------------------

test('browser: abrir a oportunidade move o foco, trocar de aba pelo teclado funciona e fechar devolve o foco', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  await seedFunnel(cookie, 'Detalhe');

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(String(e)));
    await loginBrowser(page, staff.email);

    await page.goto('/admin/crm', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('#crm-funil', { timeout: 90_000 });
    await page.waitForSelector('text=Portaria 24h Detalhe', { timeout: 60_000 });

    // Lista: o estágio aparece traduzido, nunca como token canônico.
    const quadro = await page.textContent('#crm-funil');
    assert.match(quadro || '', /Proposta em elaboração/, 'o quadro precisa mostrar o estágio em português');
    assert.ok(!(quadro || '').includes('proposta_elaboracao'), 'o token canônico não pode aparecer como rótulo');
    assert.match(quadro || '', /Portaria 24h Detalhe/, 'a oportunidade fictícia precisa estar na lista');

    // Antes de abrir, a tela diz explicitamente que não há registro aberto.
    assert.equal(await page.isVisible('#crm-detalhe'), false, 'nenhum registro deve estar aberto na entrada');
    assert.match(await page.textContent('body') || '', /Nenhuma oportunidade aberta/);

    const abrir = page.locator('button', { hasText: 'Abrir oportunidade' }).first();
    await abrir.click();

    await page.waitForSelector('#crm-detalhe', { timeout: 30_000 });
    const foco = await page.evaluate(() => document.activeElement?.id || '');
    assert.equal(foco, 'crm-detalhe-titulo', 'o foco deve ir para o título do registro aberto');
    assert.match(await page.textContent('#crm-detalhe-titulo') || '', /Portaria 24h Detalhe/);
    assert.match(await page.textContent('#crm-detalhe') || '', /Registro aberto/);

    // Teclado: seta direita percorre as abas sem mouse.
    await page.focus('#crm-tab-resumo');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getAttribute('#crm-tab-notas', 'aria-selected'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.id || ''), 'crm-tab-notas');
    await page.waitForSelector('#crm-painel-notas', { timeout: 20_000 });
    assert.match(await page.textContent('#crm-painel-notas') || '', /Notas internas/);

    // Só uma aba por vez: o painel de visitas não fica montado junto.
    assert.equal(await page.isVisible('#crm-painel-visitas'), false);

    // Fechar devolve o foco ao botão que abriu — sem foco perdido no topo.
    await page.click('button:has-text("Fechar oportunidade")');
    await page.waitForSelector('#crm-detalhe', { state: 'detached', timeout: 20_000 });
    const focoDepois = await page.evaluate(() => document.activeElement?.textContent || '');
    assert.match(focoDepois, /Abrir oportunidade/, 'o foco deve voltar ao gatilho de abertura');

    assert.deepEqual(erros, [], `a página não pode lançar erro de JavaScript: ${erros.join(' | ')}`);
    await page.locator('button', { hasText: 'Abrir oportunidade' }).first().click();
    await page.waitForSelector('#crm-detalhe', { timeout: 30_000 });
    await capture(page, 'desktop-crm-detalhe');
    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});

test('browser: falha de leitura vira erro explícito com repetição, nunca "zero registros"', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  await seedFunnel(cookie, 'Falha');

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    await forceFunnelStatus(context, 503, 'crm_unavailable');
    const page = await context.newPage();
    await loginBrowser(page, staff.email);

    await page.goto('/admin/crm', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('[data-ui-state="error"]', { timeout: 60_000 });
    const texto = await page.textContent('[data-ui-state="error"]');
    assert.match(texto || '', /Não foi possível consultar agora/);
    assert.match(texto || '', /não significa zero registros/i, 'a tela precisa negar a leitura de "zero"');
    await capture(page, 'desktop-crm-falha');

    // Repetir é oferecido e funciona quando a origem volta.
    await page.evaluate(() => { window.__uxForcarFalhaFunil = false; });
    await page.click('[data-ui-state="error"] button:has-text("Tentar novamente")');
    await page.waitForSelector('[data-ui-state="error"]', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('text=Portaria 24h Falha', { timeout: 30_000 });

    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});

test('browser: sem permissão o CRM explica a negativa e não oferece repetir a mesma chamada', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    await forceFunnelStatus(context, 403, 'commercial_role_required');
    const page = await context.newPage();
    await loginBrowser(page, staff.email);

    await page.goto('/admin/crm', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('#crm-funil', { timeout: 90_000 });
    try {
      await page.waitForSelector('[data-ui-state="denied"]', { timeout: 30_000 });
    } catch {
      assert.fail(`estado negado não apareceu. Conteúdo: ${(await page.textContent('#crm-funil') || '').slice(0, 300)}`);
    }
    const texto = await page.textContent('[data-ui-state="denied"]');
    assert.match(texto || '', /Acesso negado/);
    assert.match(texto || '', /Sem permissão para o funil comercial/);
    assert.equal(await page.isVisible('[data-ui-state="denied"] button'), false, 'negativa não deve convidar a repetir');
    await capture(page, 'desktop-crm-negado');

    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});

test('browser: no celular o CRM não rola na horizontal e abre o registro pelo mesmo caminho', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  await seedFunnel(cookie, 'Celular');

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 390, height: 844 }, isMobile: false });
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/crm', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('#crm-funil', { timeout: 90_000 });
    await page.waitForSelector('text=Portaria 24h Celular', { timeout: 60_000 });

    const overflow = await page.evaluate(() => {
      const raiz = document.documentElement;
      const sobra = raiz.scrollWidth - raiz.clientWidth;
      if (sobra <= 1) return { sobra, culpados: [] };
      const culpados = [...document.querySelectorAll('body *')]
        .filter(node => node.getBoundingClientRect().right > raiz.clientWidth + 1)
        .slice(0, 6)
        .map(node => `${node.tagName}#${node.id}[${node.getAttribute('aria-label') || ''}]{${(node.textContent || '').trim().slice(0, 40)}}`);
      return { sobra, culpados };
    });
    assert.ok(overflow.sobra <= 1, `a página não pode transbordar na horizontal em 390px (sobra ${overflow.sobra}px): ${overflow.culpados.join(' | ')}`);

    await page.locator('button', { hasText: 'Abrir oportunidade' }).first().click();
    await page.waitForSelector('#crm-detalhe', { timeout: 30_000 });
    const overflowDetalhe = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflowDetalhe <= 1, `o detalhe não pode transbordar em 390px (sobra ${overflowDetalhe}px)`);

    // Alvo de toque: os controles principais mantêm pelo menos 44px de altura.
    const alturas = await page.$$eval('#crm-detalhe [role="tab"], #crm-detalhe button', nodes =>
      nodes.slice(0, 12).map(node => Math.round(node.getBoundingClientRect().height)));
    for (const altura of alturas) assert.ok(altura >= 40, `alvo de toque pequeno demais: ${altura}px`);
    await capture(page, 'mobile-crm-detalhe');

    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});

test('browser: filtro sem resultado mostra estado vazio, diferente de falha', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  await seedFunnel(cookie, 'Vazio');

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/crm', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('#crm-funil', { timeout: 90_000 });

    // O valor enviado ao servidor continua canônico, mesmo com rótulo em português.
    await page.selectOption('#filtro-estagio', 'ganho');
    await page.waitForSelector('[data-ui-state="empty"]', { timeout: 30_000 });
    const vazio = await page.textContent('[data-ui-state="empty"]');
    assert.match(vazio || '', /Nenhum registro/);
    assert.equal(await page.isVisible('[data-ui-state="error"]'), false, 'vazio não pode ser apresentado como falha');

    await page.selectOption('#filtro-estagio', '');
    await page.waitForSelector('text=Portaria 24h Vazio', { timeout: 30_000 });

    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});
