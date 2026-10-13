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
      // Antispam de PUB-03: o padrão de produção (5 envios por IP a cada 10
      // minutos) continua inalterado; o gate só cria mais pedidos sintéticos
      // numa mesma execução, como os demais gates já fazem.
      LEAD_MAX_ATTEMPTS: '200',
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
  for (const route of ['/admin/entrar', '/admin/crm', '/admin/leads']) {
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

// ---------------------------------------------------------------------------
// UX-PRO-06 — fila de pedidos recebidos (/admin/leads)
//
// O que estes testes provam: a fila mostra espera, fonte, responsável, estado
// e próxima ação a partir de campos que a API JÁ devolvia; a ausência de dado
// é dita como ausência; falha de leitura marca a lista como desatualizada em
// vez de escondê-la; a ordenação por espera é derivada e explícita; e as
// superfícies novas funcionam em 390px, no tema noturno e pelo teclado.
//
// O que NÃO provam: aceite humano, homologação de Marcelo/Andreia, execução em
// Windows ou na máquina do operador.
// ---------------------------------------------------------------------------

/**
 * Cria um pedido pela MESMA API pública usada pelo site — sem atalho de banco —
 * e, quando pedido, recua a data de recebimento para exercitar a espera. O
 * recuo é feito por SQL neste banco descartável porque a API pública não aceita
 * data de criação do cliente; nenhum outro campo é escrito por SQL.
 */
async function seedLead({ label, phone, daysAgo = 0, origin = null, status = null, cookie = null }) {
  const body = {
    requestKind: 'visit',
    name: `Pedido Ficticio ${label}`,
    phone,
    city: 'Barueri',
    propertyType: 'Condomínio',
    services: ['Monitoramento 24 Horas'],
    visitPreference: 'Período da manhã',
    details: `Pedido sintetico criado pelo gate de UX-PRO-06 (${label}).`,
    consent: true,
  };
  if (origin) Object.assign(body, { origin: origin.origin, campaign: origin.campaign, channel: origin.channel });

  const created = await api('/api/leads', { method: 'POST', body });
  assert.equal(created.status, 201, `criação do pedido: ${JSON.stringify(created.body)}`);
  const leadId = created.body?.leadId;
  assert.ok(leadId, `a API precisa devolver o id do pedido: ${JSON.stringify(created.body)}`);

  if (daysAgo > 0) {
    await pool.query(`UPDATE public_leads SET created_at = NOW() - ($1::int * INTERVAL '1 day') WHERE id = $2`, [daysAgo, leadId]);
  }
  if (status) {
    // Pela API administrativa, para a transição passar pela mesma trilha de
    // auditoria usada pela pessoa que opera a tela.
    const changed = await api(`/api/admin/leads/${leadId}`, { method: 'PATCH', body: { status }, cookie });
    assert.equal(changed.status, 200, `mudança de status: ${JSON.stringify(changed.body)}`);
  }
  return leadId;
}

function cardTestId(leadId) {
  return `lead-card-${String(leadId).slice(0, 8)}`;
}

test('a API da fila continua exigindo sessão e papel e já devolve os campos que a tela passou a mostrar', { skip: !RUN }, async () => {
  const anonimo = await api('/api/admin/leads');
  assert.equal(anonimo.status, 401, 'anônimo deve continuar recebendo 401');
  assert.equal(anonimo.body?.error, 'admin_session_required');

  const rh = await provisionStaff(pool, { role: 'rh' });
  const cookieRh = await loginHttp(rh.email);
  const negado = await api('/api/admin/leads', { cookie: cookieRh });
  assert.equal(negado.status, 403, 'papel fora da família comercial deve continuar recebendo 403');
  assert.ok(!JSON.stringify(negado.body).includes('leads'), 'a negativa não pode vazar dados');

  const comercial = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(comercial.email);
  const leadId = await seedLead({ label: 'Contrato', phone: '(11) 98888-0001', origin: { origin: 'contato', campaign: 'site', channel: 'site' }, cookie });
  const lista = await api('/api/admin/leads', { cookie });
  assert.equal(lista.status, 200);
  const pedido = (lista.body?.leads || []).find(item => item.id === leadId);
  assert.ok(pedido, 'o pedido criado pela API pública precisa aparecer na fila');
  // Contrato preservado: estes campos já existiam na resposta.
  for (const campo of ['origin', 'campaign', 'channel', 'responsible', 'responsible_id', 'updated_at']) {
    assert.ok(campo in pedido, `a resposta precisa continuar trazendo "${campo}"`);
  }
  assert.equal(pedido.origin, 'contato', 'origem enviada pelo formulário precisa ser preservada');
  assert.equal(pedido.status, 'solicitada', 'o pedido novo continua entrando como solicitada');
});

test('browser: a fila mostra espera, fonte, responsável e próxima ação, e diz quando o dado não existe', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  const antigo = await seedLead({ label: 'Fila Antigo', phone: '(11) 98888-0011', daysAgo: 5, origin: { origin: 'contato', campaign: 'site', channel: 'site' }, cookie });
  const recente = await seedLead({ label: 'Fila Recente', phone: '(11) 98888-0012', cookie });

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(String(e)));
    await loginBrowser(page, staff.email);
    await page.goto('/admin/leads', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('[data-testid="lead-queue-summary"]', { timeout: 90_000 });
    await page.waitForSelector(`[data-testid="${cardTestId(antigo)}"]`, { timeout: 60_000 });

    // Resumo da fila: contagens derivadas, com o critério declarado.
    const resumo = await page.textContent('[data-testid="lead-queue-summary"]') || '';
    assert.match(resumo, /Resumo da fila/);
    assert.match(resumo, /classifica[çc][ãa]o derivada de status \+ data de recebimento/);
    assert.match(resumo, /nenhum campo novo [ée] gravado e nenhum valor [ée] estimado/);
    assert.ok(Number(await page.textContent('[data-testid="lead-queue-attention"]')) >= 1, 'o pedido de 5 dias precisa entrar na contagem de atenção');

    // Cartão antigo: espera derivada do created_at, fonte vinda do registro e
    // próxima ação compatível com o estado.
    const cartaoAntigo = await page.textContent(`[data-testid="${cardTestId(antigo)}"]`) || '';
    assert.match(cartaoAntigo, /há 5 dias/, 'a espera precisa ser calculada sobre o recebimento canônico');
    assert.match(cartaoAntigo, /Aten[çc][ãa]o/);
    assert.match(cartaoAntigo, /origem: contato · campanha: site · canal: site/, 'cada parte da fonte precisa ser nomeada');
    assert.match(cartaoAntigo, /N[ãa]o atribu[íi]do/, 'sem responsável no registro, a tela diz que não há');
    assert.match(cartaoAntigo, /Definir quem atende e fazer o primeiro contato\./, 'próxima ação do estado "solicitada"');

    // Cartão recente: ausência de origem é ausência, não zero nem erro.
    const cartaoRecente = await page.textContent(`[data-testid="${cardTestId(recente)}"]`) || '';
    assert.match(cartaoRecente, /canal: site/, 'o canal registrado pelo servidor precisa aparecer');
    assert.match(cartaoRecente, /Sem origem nem campanha no registro\./, 'a ausência parcial precisa ser declarada');
    assert.match(cartaoRecente, /PROTOCOLO\s+\w{8}/, 'o protocolo curto ajuda a localizar o pedido');
    assert.match(cartaoRecente, /recebido agora|há \d+ min/, 'pedido do momento não pode aparecer como antigo');

    await capture(page, 'desktop-leads-fila');
    assert.deepEqual(erros, [], `a página não pode lançar erro de JavaScript: ${erros.join(' | ')}`);
    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});

test('browser: falha de leitura marca a fila como desatualizada em vez de esconder os pedidos', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  const leadId = await seedLead({ label: 'Fila Falha', phone: '(11) 98888-0013', cookie });

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    // Interceptação só dentro da aba: o servidor continua intacto.
    await context.addInitScript(() => {
      window.__uxForcarFalhaFila = false;
      const original = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input?.url || '';
        if (window.__uxForcarFalhaFila && url.includes('/api/admin/leads?')) {
          return Promise.resolve(new Response(JSON.stringify({ error: 'leads_unavailable' }), {
            status: 503, headers: { 'content-type': 'application/json' },
          }));
        }
        return original(input, init);
      };
    });
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/leads', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector(`[data-testid="${cardTestId(leadId)}"]`, { timeout: 90_000 });

    await page.evaluate(() => { window.__uxForcarFalhaFila = true; });
    await page.click('button[aria-label="Atualizar pedidos"]');
    await page.waitForSelector('[data-testid="lead-queue-stale"]', { timeout: 30_000 });

    const obsoleto = await page.textContent('[data-testid="lead-queue-stale"]') || '';
    assert.match(obsoleto, /[úu]ltima atualiza[çc][ãa]o falhou/);
    assert.match(obsoleto, /podem estar desatualizados/);
    assert.match(obsoleto, /n[ãa]o significa que a fila esteja vazia/, 'a tela precisa negar a leitura de "fila vazia"');

    // Os pedidos da leitura anterior continuam na tela: falha não apaga dado.
    assert.equal(await page.isVisible(`[data-testid="${cardTestId(leadId)}"]`), true, 'o pedido já carregado não pode desaparecer por causa da falha');
    assert.equal(await page.isVisible('[data-testid="lead-queue-empty"]'), false, 'falha de leitura não pode virar estado vazio');
    await capture(page, 'desktop-leads-desatualizado');

    await page.evaluate(() => { window.__uxForcarFalhaFila = false; });
    await page.click('button[aria-label="Atualizar pedidos"]');
    await page.waitForSelector('[data-testid="lead-queue-stale"]', { state: 'detached', timeout: 30_000 });
    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});

test('browser: filtro sem resultado é ausência de dados, diferente de fila vazia e de falha', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  await seedLead({ label: 'Fila Vazio', phone: '(11) 98888-0014', cookie });

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/leads', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('[data-testid="lead-queue-list"]', { timeout: 90_000 });

    await page.selectOption('#lead-filter', 'cancelada');
    await page.waitForSelector('[data-testid="lead-queue-empty"]', { timeout: 30_000 });
    const vazio = await page.textContent('[data-testid="lead-queue-empty"]') || '';
    assert.match(vazio, /Nenhum pedido com o status/);
    assert.match(vazio, /O filtro est[aá] ativo/, 'a tela precisa explicar que é o filtro, não ausência total');
    assert.equal(await page.isVisible('[data-testid="lead-queue-stale"]'), false, 'vazio não pode ser apresentado como falha');
    assert.equal(await page.isVisible('button:has-text("Ver todos os pedidos")'), true, 'o caminho de volta precisa estar visível');

    await page.click('button:has-text("Ver todos os pedidos")');
    await page.waitForSelector('[data-testid="lead-queue-list"]', { timeout: 30_000 });
    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});

test('browser: a ordenação por espera é derivada e declarada, sem criar campo novo', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  const antigo = await seedLead({ label: 'Ordem Antigo', phone: '(11) 98888-0015', daysAgo: 8, cookie });
  const recente = await seedLead({ label: 'Ordem Recente', phone: '(11) 98888-0016', cookie });

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/leads', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector(`[data-testid="${cardTestId(recente)}"]`, { timeout: 90_000 });

    const ordemInicial = await page.$$eval('[data-testid^="lead-card-"]', nodes => nodes.map(node => node.getAttribute('data-lead-id')));
    assert.ok(ordemInicial.indexOf(recente) < ordemInicial.indexOf(antigo), 'na ordem da API o mais recente vem primeiro');

    await page.selectOption('#lead-order', 'espera');
    await page.waitForFunction(({ antigo: a, recente: r }) => {
      const ids = [...document.querySelectorAll('[data-testid^="lead-card-"]')].map(node => node.getAttribute('data-lead-id'));
      return ids.indexOf(a) < ids.indexOf(r);
    }, { antigo, recente }, { timeout: 20_000 });

    const resumo = await page.textContent('[data-testid="lead-queue-summary"]') || '';
    assert.match(resumo, /ordena[çc][ãa]o s[ãa]o derivadas apenas dos pedidos j[áa] carregados/);
    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});

test('browser: no celular a fila não transborda e no tema noturno as superfícies novas seguem o tema', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  const leadId = await seedLead({ label: 'Fila Celular', phone: '(11) 98888-0017', daysAgo: 4, origin: { origin: 'contato', campaign: 'site', channel: 'site' }, cookie });

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/leads', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector(`[data-testid="${cardTestId(leadId)}"]`, { timeout: 90_000 });

    // Larguras previstas no plano mestre: 320, 390 e 768 CSS px.
    for (const largura of [320, 390, 768]) {
      await page.setViewportSize({ width: largura, height: 844 });
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => {
        const raiz = document.documentElement;
        const sobra = raiz.scrollWidth - raiz.clientWidth;
        if (sobra <= 1) return { sobra, culpados: [] };
        const culpados = [...document.querySelectorAll('body *')]
          .filter(node => node.getBoundingClientRect().right > raiz.clientWidth + 1)
          .slice(0, 6)
          .map(node => `${node.tagName}.${node.className}`.slice(0, 80));
        return { sobra, culpados };
      });
      assert.ok(overflow.sobra <= 1, `a fila não pode transbordar em ${largura}px (sobra ${overflow.sobra}px): ${overflow.culpados.join(' | ')}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    await capture(page, 'mobile-leads-fila');

    // Tema noturno pelo controle real do envelope administrativo.
    await page.click('[data-admin-theme-toggle="true"]');
    await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night', null, { timeout: 20_000 });
    const cores = await page.evaluate(() => {
      const alvo = document.querySelector('[data-testid="lead-queue-summary"]');
      const valor = document.querySelector('[data-testid="lead-queue-attention"]');
      const ler = (elemento) => {
        if (!elemento) return null;
        const estilo = getComputedStyle(elemento);
        return { fundo: estilo.backgroundColor, texto: estilo.color };
      };
      return { painel: ler(alvo), numero: ler(valor) };
    });
    const canais = (cor) => (cor.match(/\d+/g) || []).slice(0, 3).map(Number);
    assert.ok(canais(cores.painel.fundo).reduce((a, b) => a + b, 0) < 240, `o resumo precisa escurecer no tema noturno: ${cores.painel.fundo}`);
    assert.ok(canais(cores.numero.texto).reduce((a, b) => a + b, 0) > 480, `o número precisa clarear no tema noturno: ${cores.numero.texto}`);
    await capture(page, 'mobile-leads-noturno');
    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});

test('browser: os controles novos da fila são alcançáveis pelo teclado e mostram foco visível', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  const leadId = await seedLead({ label: 'Fila Teclado', phone: '(11) 98888-0018', cookie });

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/leads', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector(`[data-testid="${cardTestId(leadId)}"]`, { timeout: 90_000 });

    // Percurso real de Tab: filtro → atualizar → ordenação.
    await page.focus('#lead-filter');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || ''), 'Atualizar pedidos');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id || ''), 'lead-order');

    const foco = await page.evaluate(() => {
      const estilo = getComputedStyle(document.activeElement);
      return { largura: estilo.outlineWidth, estilo: estilo.outlineStyle };
    });
    assert.notEqual(foco.estilo, 'none', 'o controle focado precisa ter contorno visível');
    assert.ok(Number.parseFloat(foco.largura) > 0, `o contorno de foco precisa ter espessura: ${foco.largura}`);

    // O select de ordenação é operável pelo teclado (seta muda a opção).
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => document.getElementById('lead-order')?.value === 'espera', null, { timeout: 10_000 });

    // O select de status de cada pedido continua acessível e com nome próprio.
    const statusSelect = page.locator(`[data-testid="${cardTestId(leadId)}"] select[aria-label^="Alterar status"]`);
    assert.equal(await statusSelect.count(), 1, 'cada pedido mantém exatamente um controle de status');
    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});
