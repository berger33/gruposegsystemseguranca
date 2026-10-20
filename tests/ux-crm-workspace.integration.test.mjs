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
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { provisionStaff, STAFF_TEST_PASSWORD } from './helpers/staff-login.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');

// O Next aponta estes arquivos gerados para o distDir isolado do navegador.
// Mantemos o checkout limpo restaurando o conteúdo original ao encerrar a suíte.
const GENERATED_FILES = ['next-env.d.ts', 'tsconfig.json'];
async function snapshotGeneratedFiles() {
  const snapshot = new Map();
  for (const name of GENERATED_FILES) {
    snapshot.set(name, await readFile(path.join(root, name), 'utf8').catch(() => null));
  }
  return snapshot;
}
async function restoreGeneratedFiles(snapshot) {
  if (!snapshot) return;
  for (const [name, content] of snapshot) {
    if (content !== null) await writeFile(path.join(root, name), content);
  }
}

let server, baseUrl, pool, browser, generatedFiles;

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
  generatedFiles = await snapshotGeneratedFiles();
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
  if (server?.exitCode === null) {
    await new Promise(resolve => {
      const timer = setTimeout(() => {
        if (server.exitCode === null) server.kill('SIGKILL');
      }, 1_000);
      server.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      server.kill('SIGTERM');
    });
  }
  await restoreGeneratedFiles(generatedFiles);
});

// Evidência opcional e sanitizada (massa fictícia, sem dado pessoal nem
// credencial). Cada fatia registra apenas as próprias capturas: UX_CRM_* para
// o funil pré-existente e UX_LEADS_* para a fila, evitando artefato fora de
// escopo quando a suíte inteira é executada.
const evidenceDir = process.env.UX_CRM_EVIDENCE_DIR || '';
const leadsEvidenceDir = process.env.UX_LEADS_EVIDENCE_DIR || '';
const carteiraEvidenceDir = process.env.UX_CARTEIRA_EVIDENCE_DIR || '';
async function capture(page, nome, directory = evidenceDir) {
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `${nome}.png`), fullPage: true });
}
async function captureLeads(page, nome) {
  await capture(page, nome, leadsEvidenceDir);
}
async function captureCarteira(page, nome) {
  await capture(page, nome, carteiraEvidenceDir);
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
async function forceFunnelStatus(context, status, code, { inicial = true } = {}) {
  await context.addInitScript(({ status, code, inicial }) => {
    // `inicial: false` arma a interceptação DESLIGADA: a leitura inicial
    // conclui com normalidade e o teste liga a falha só na atualização.
    window.__uxForcarFalhaFunil = inicial ? true : false;
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
  }, { status, code, inicial });
}

/**
 * Força, SÓ dentro da aba do navegador, uma resposta de erro para a leitura da
 * carteira (`GET /api/crm/portfolio`). Mesma técnica usada no funil: a
 * interceptação de rede do Playwright não funciona com o Chromium empacotado
 * deste repositório, então a falha é induzida no próprio `window.fetch` da
 * página. Nada disso entra no sistema: o servidor continua intacto e, ao
 * desligar a variável, a leitura real volta a valer.
 */
async function forcePortfolioStatus(context, status, code, { inicial = true } = {}) {
  await context.addInitScript(({ status, code, inicial }) => {
    window.__uxForcarFalhaCarteira = inicial;
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (window.__uxForcarFalhaCarteira && url.includes('/api/crm/portfolio?')) {
        return Promise.resolve(new Response(JSON.stringify({ error: code }), {
          status, headers: { 'content-type': 'application/json' },
        }));
      }
      return original(input, init);
    };
  }, { status, code, inicial });
}

/** Atrasa a leitura da carteira para observar o estado de atualização em curso. */
async function delayPortfolioFetch(context, ms = 4000) {
  await context.addInitScript(({ ms }) => {
    window.__uxAtrasarCarteira = false;
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (window.__uxAtrasarCarteira && url.includes('/api/crm/portfolio?')) {
        await new Promise(resolve => setTimeout(resolve, ms));
      }
      return original(input, init);
    };
  }, { ms });
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
// UX-PRO-E3-CRM — datetime-local em America/Sao_Paulo com rótulo de fuso
//
// O que este teste prova: o campo "Data da próxima ação" (datetime-local)
// converte corretamente UTC → America/Sao_Paulo no valor do input,
// o rótulo (America/Sao_Paulo) é visível e a conversão atravessa a virada do dia.
//
// Usa seedFunnel (padrão dos testes que passam) + PATCH para definir
// next_action_date. Data futura (novembro/2026) evita filtro de ações passadas.
// 02:30Z em novembro = 23:30 do dia anterior em SP (UTC-3 fixo, sem horário de verão).
//
// Seletores robustos: evita :has() (suporte variável), usa localização por proximidade.

test('browser E3-CRM: next_action_date 02:30Z vira 23:30 dia anterior em SP, rótulo visível', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);

  // Cria oportunidade base via seedFunnel (mesmo padrão dos testes que passam)
  const { opportunityId } = await seedFunnel(cookie, 'E3-CRM-Madrugada-Futura');

  // Atualiza a oportunidade com next_action_date = 02:30Z de novembro (futuro)
  // Em SP (UTC-3 fixo, sem horário de verão) isso é 23:30 do dia anterior — virada de dia civil.
  const patch = await api(`/api/crm/opportunities/${opportunityId}`, {
    method: 'PATCH', cookie,
    body: {
      next_action: 'Verificar virada',
      next_action_date: '2026-11-05T02:30:00Z', // 02:30Z = 23:30 dia 4 em SP (UTC-3 fixo)
    },
  });
  assert.equal(patch.status, 200, `PATCH next_action_date: ${JSON.stringify(patch.body)}`);

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/crm', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('#crm-funil', { timeout: 90_000 });
    await page.waitForSelector('text=Portaria 24h E3-CRM-Madrugada-Futura', { timeout: 60_000 });

    // Abre a oportunidade (mesmo padrão dos testes existentes)
    await page.locator('button', { hasText: 'Abrir oportunidade' }).first().click();
    await page.waitForSelector('#crm-detalhe', { timeout: 30_000 });
    await page.waitForSelector('#crm-tab-resumo', { timeout: 20_000 });
    await page.click('#crm-tab-resumo');
    await page.waitForSelector('#crm-painel-resumo', { timeout: 20_000 });

    // Verifica o campo datetime-local mostra hora de São Paulo (23:30 do dia 4)
    const input = page.locator('input[type="datetime-local"]').first();
    await input.waitFor({ state: 'visible', timeout: 20_000 });
    const valor = await input.inputValue();
    assert.equal(valor, '2026-11-04T23:30',
      `02:30Z deve virar 2026-11-04T23:30 em SP (virada de dia), veio ${valor}`);

    // Verifica rótulo de fuso visível — evita :has(), usa label adjacente ao input
    const label = page.locator('label').filter({ hasText: 'Próxima ação' }).first();
    await label.waitFor({ state: 'visible', timeout: 10_000 });
    const labelText = await label.textContent();
    assert.match(labelText || '', /\(America\/Sao_Paulo\)/,
      'rótulo de fuso (America/Sao_Paulo) precisa estar visível ao lado do campo');

    await capture(page, 'desktop-e3-crm-datetime-local');
    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});

// ---------------------------------------------------------------------------
// UX-PRO-06 — funil de oportunidades (/admin/crm): estados de leitura
//
// O que estes testes provam: uma atualização que falha NÃO apaga o funil já
// lido — a tela mantém os dados, diz que podem estar desatualizados e oferece
// repetição; durante uma atualização em curso a lista permanece visível com
// indicador em role="status"; e as superfícies do funil não transbordam em
// 320/768 px e escurecem no tema noturno pelo controle real do envelope.

test('browser: falha ao atualizar mantém o funil carregado e marca os dados como desatualizados', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  await seedFunnel(cookie, 'Desatualizado');

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    // Interceptação armada DESLIGADA: a leitura inicial conclui de verdade.
    await forceFunnelStatus(context, 503, 'crm_unavailable', { inicial: false });
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/crm', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('text=Portaria 24h Desatualizado', { timeout: 90_000 });

    // A partir daqui a atualização falha; o funil já lido precisa permanecer.
    await page.evaluate(() => { window.__uxForcarFalhaFunil = true; });
    await page.click('button:has-text("Atualizar listas")');
    await page.waitForSelector('[data-testid="crm-funil-stale"]', { timeout: 30_000 });

    const aviso = await page.textContent('[data-testid="crm-funil-stale"]');
    assert.match(aviso || '', /desatualizados/, 'a faixa precisa dizer que os dados podem estar desatualizados');
    assert.match(aviso || '', /não significa que o funil esteja vazio/i, 'falha não pode ser lida como funil vazio');
    assert.match(aviso || '', /Não foi possível consultar agora/, 'a faixa cita o motivo real da falha');
    assert.ok(await page.isVisible('text=Portaria 24h Desatualizado'), 'o funil carregado não pode sumir com a falha');
    assert.equal(await page.isVisible('#crm-funil [data-ui-state="error"]'), false, 'com dados preservados não deve haver estado de erro cheio');
    await capture(page, 'desktop-crm-funil-desatualizado');

    // A repetição dentro da faixa volta a falar com o servidor de verdade.
    await page.evaluate(() => { window.__uxForcarFalhaFunil = false; });
    await page.click('[data-testid="crm-funil-stale"] button:has-text("Tentar novamente")');
    await page.waitForSelector('[data-testid="crm-funil-stale"]', { state: 'detached', timeout: 30_000 });
    assert.ok(await page.isVisible('text=Portaria 24h Desatualizado'), 'o funil continua na tela após a repetição');

    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});

test('browser: atualizar com o funil carregado mantém a lista visível durante a consulta', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  await seedFunnel(cookie, 'Atendimento');

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    await context.addInitScript(() => {
      window.__uxAtrasarFunil = false;
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input?.url || '';
        if (window.__uxAtrasarFunil && url.includes('/api/crm/opportunities?')) {
          await new Promise(resolve => setTimeout(resolve, 4000));
        }
        return original(input, init);
      };
    });
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/crm', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('text=Portaria 24h Atendimento', { timeout: 90_000 });

    await page.evaluate(() => { window.__uxAtrasarFunil = true; });
    await page.click('button:has-text("Atualizar listas")');
    await page.waitForSelector('[data-testid="crm-funil-updating"]', { timeout: 30_000 });
    // Com a consulta ainda em voo, o funil segue na tela — não é substituído
    // por um bloco de carregamento que apaga o que a pessoa já estava lendo.
    assert.ok(await page.isVisible('text=Portaria 24h Atendimento'), 'a lista não pode desaparecer durante a atualização');
    await page.waitForSelector('[data-testid="crm-funil-updating"]', { state: 'detached', timeout: 30_000 });
    assert.equal(await page.isVisible('[data-testid="crm-funil-stale"]'), false, 'atualização concluída não é desatualização');
    assert.ok(await page.isVisible('text=Portaria 24h Atendimento'));

    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});

test('browser: o funil não transborda em 320/768 px e as superfícies seguem o tema noturno', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  await seedFunnel(cookie, 'Larguras');

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/crm', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('text=Portaria 24h Larguras', { timeout: 90_000 });
    await capture(page, 'desktop-crm-funil');

    for (const [largura, altura] of [[320, 844], [768, 1024]]) {
      await page.setViewportSize({ width: largura, height: altura });
      await page.waitForTimeout(300);
      // Reflow pós-resize ainda em curso não é overflow real: mede, espera e
      // reconfirma antes de reprovar.
      const medir = () => page.evaluate(() => {
        const raiz = document.documentElement;
        const sobra = raiz.scrollWidth - raiz.clientWidth;
        if (sobra <= 1) return { sobra, culpados: [] };
        const dentroDeRolagem = node => {
          for (let atual = node.parentElement; atual && atual !== document.body; atual = atual.parentElement) {
            const overflowX = getComputedStyle(atual).overflowX;
            if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden' || overflowX === 'clip') return true;
          }
          return false;
        };
        const culpados = [...document.querySelectorAll('body *')]
          .filter(node => !dentroDeRolagem(node))
          .map(node => ({ node, excesso: Math.round(node.getBoundingClientRect().right - raiz.clientWidth) }))
          .filter(item => item.excesso > 1)
          .sort((a, b) => b.excesso - a.excesso)
          .slice(0, 8)
          .map(({ node, excesso }) =>
            `${node.tagName}#${node.id}.${String(node.className).slice(0, 60)}+${excesso}px{${(node.textContent || '').trim().slice(0, 30)}}`);
        return { sobra, culpados };
      });
      let overflow = await medir();
      if (overflow.sobra > 1) {
        await page.waitForTimeout(400);
        overflow = await medir();
      }
      assert.ok(overflow.sobra <= 1, `o funil não pode transbordar em ${largura}px (sobra ${overflow.sobra}px): ${overflow.culpados.join(' | ')}`);
      await capture(page, `funil-${largura}`);
    }

    // Tema noturno pelo controle real do envelope administrativo.
    await page.click('[data-admin-theme-toggle="true"]');
    await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night', null, { timeout: 20_000 });
    const cores = await page.evaluate(() => {
      const coluna = document.querySelector('[data-testid="crm-funil-board"] > div');
      const titulo = document.querySelector('[data-testid="crm-funil-board"] > div h4');
      const ler = (elemento) => {
        if (!elemento) return null;
        const estilo = getComputedStyle(elemento);
        return { fundo: estilo.backgroundColor, texto: estilo.color };
      };
      return { coluna: ler(coluna), titulo: ler(titulo) };
    });
    const canais = (cor) => (cor.match(/\d+/g) || []).slice(0, 3).map(Number);
    assert.ok(cores.coluna && canais(cores.coluna.fundo).reduce((a, b) => a + b, 0) < 240, `a coluna do quadro precisa escurecer no tema noturno: ${cores.coluna?.fundo}`);
    assert.ok(cores.titulo && canais(cores.titulo.texto).reduce((a, b) => a + b, 0) > 480, `o título da coluna precisa clarear no tema noturno: ${cores.titulo?.texto}`);
    await capture(page, 'funil-768-noturno');

    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});

// ---------------------------------------------------------------------------
// UX-PRO-06 — carteira comercial (/admin/carteira): estados de leitura
//
// O que estes testes provam: uma releitura que falha NÃO apaga a carteira já
// lida — a tela mantém os itens, diz que podem estar desatualizados, cita o
// motivo real e a hora da última leitura concluída, e oferece repetição;
// durante uma releitura em curso a lista permanece visível com indicador em
// role="status"; dúvida de autorização continua falhando fechada (o estado
// negado substitui tudo, sem convite a repetir); a primeira leitura que falha
// não é apresentada como carteira vazia nem como zero de resultados; a tela
// não transborda em 320/390/768 px, escurece no tema noturno pelo controle
// real do envelope e é operável pelo teclado.
//
// O que NÃO provam: aceite humano, homologação de Marcelo/Andreia, execução em
// Windows ou na máquina do operador.
// ---------------------------------------------------------------------------

test('a carteira continua exigindo sessão e papel, com recorte pessoal e filtros canônicos', { skip: !RUN }, async () => {
  const anonimo = await api('/api/crm/portfolio');
  assert.equal(anonimo.status, 401, 'anônimo deve continuar recebendo 401');
  assert.equal(anonimo.body?.error, 'session_required');

  const rh = await provisionStaff(pool, { role: 'rh' });
  const cookieRh = await loginHttp(rh.email);
  const negado = await api('/api/crm/portfolio', { cookie: cookieRh });
  assert.equal(negado.status, 403, 'papel fora da lista continua sem acesso');
  assert.equal(negado.body?.error, 'role_required');

  const dono = await provisionStaff(pool, { role: 'comercial' });
  const cookieDono = await loginHttp(dono.email);
  await seedFunnel(cookieDono, 'Contrato Carteira');
  const meu = await api('/api/crm/portfolio?filter=all', { cookie: cookieDono });
  assert.equal(meu.status, 200, JSON.stringify(meu.body));
  assert.ok(meu.body.items.some(item => item.title === 'Portaria 24h Contrato Carteira'), 'o responsável vê o próprio item');
  assert.equal(meu.body.limit, 50, 'o limite de página continua 50');

  const colega = await provisionStaff(pool, { role: 'comercial' });
  const cookieColega = await loginHttp(colega.email);
  const alheio = await api('/api/crm/portfolio?filter=all', { cookie: cookieColega });
  assert.equal(alheio.status, 200);
  assert.equal(alheio.body.items.some(item => item.title === 'Portaria 24h Contrato Carteira'), false, 'a carteira continua pessoal');

  const filtroInvalido = await api('/api/crm/portfolio?filter=qualquer&offset=0', { cookie: cookieDono });
  assert.equal(filtroInvalido.status, 400, 'recorte fora da lista canônica continua recusado');
  assert.equal(filtroInvalido.body?.error, 'invalid_filter');
});

test('browser: falha ao atualizar mantém a carteira já lida e marca os dados como desatualizados', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  await seedFunnel(cookie, 'Carteira Desatualizada');

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    // Interceptação armada DESLIGADA: a leitura inicial conclui de verdade.
    await forcePortfolioStatus(context, 503, 'crm_unavailable', { inicial: false });
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/carteira', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('text=Portaria 24h Carteira Desatualizada', { timeout: 90_000 });

    // A partir daqui a releitura falha; a carteira já lida precisa permanecer.
    // O caminho da pessoa é o mesmo: trocar o recorte dispara nova consulta.
    await page.evaluate(() => { window.__uxForcarFalhaCarteira = true; });
    await page.selectOption('#carteira-filtro', 'no_next');
    await page.waitForSelector('[data-testid="carteira-desatualizada"]', { timeout: 30_000 });

    const aviso = await page.textContent('[data-testid="carteira-desatualizada"]') || '';
    assert.match(aviso, /desatualizados/i, 'a faixa precisa dizer que os dados podem estar desatualizados');
    assert.match(aviso, /não significa que a carteira esteja vazia/i, 'falha não pode ser lida como carteira vazia');
    assert.match(aviso, /Não foi possível consultar agora/, 'a faixa cita o motivo real da falha');
    assert.match(aviso, /última leitura concluída/i, 'a faixa diz de quando é o dado preservado');
    assert.ok(await page.isVisible('text=Portaria 24h Carteira Desatualizada'), 'a carteira lida não pode sumir com a falha');
    assert.equal(await page.isVisible('[data-ui-state="error"]'), false, 'com dados preservados não deve haver estado de erro cheio');
    await captureCarteira(page, 'desktop-carteira-desatualizada');

    // A repetição dentro da faixa volta a falar com o servidor de verdade.
    await page.evaluate(() => { window.__uxForcarFalhaCarteira = false; });
    await page.click('[data-testid="carteira-desatualizada"] button:has-text("Tentar novamente")');
    await page.waitForSelector('[data-testid="carteira-desatualizada"]', { state: 'detached', timeout: 30_000 });
    assert.ok(await page.isVisible('text=Portaria 24h Carteira Desatualizada'), 'a carteira continua na tela após a repetição');

    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});

test('browser: releitura em curso mantém a carteira visível com indicador de atualização', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  await seedFunnel(cookie, 'Carteira Atendimento');

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    await delayPortfolioFetch(context, 4000);
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/carteira', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('text=Portaria 24h Carteira Atendimento', { timeout: 90_000 });

    await page.evaluate(() => { window.__uxAtrasarCarteira = true; });
    await page.selectOption('#carteira-filtro', 'no_next');
    await page.waitForSelector('[data-testid="carteira-atualizando"]', { timeout: 30_000 });
    // Com a consulta ainda em voo, a carteira segue na tela — não é substituída
    // por um bloco de carregamento que apaga o que a pessoa já estava lendo.
    assert.ok(await page.isVisible('text=Portaria 24h Carteira Atendimento'), 'a lista não pode desaparecer durante a atualização');

    await page.waitForSelector('[data-testid="carteira-atualizando"]', { state: 'detached', timeout: 30_000 });
    assert.equal(await page.isVisible('[data-testid="carteira-desatualizada"]'), false, 'releitura concluída não é desatualização');
    assert.ok(await page.isVisible('text=Portaria 24h Carteira Atendimento'));

    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});

test('browser: falha de autorização na releitura da carteira falha fechada, sem dados preservados', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  await seedFunnel(cookie, 'Carteira Negada');

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    await forcePortfolioStatus(context, 403, 'role_required', { inicial: false });
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/carteira', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('text=Portaria 24h Carteira Negada', { timeout: 90_000 });

    await page.evaluate(() => { window.__uxForcarFalhaCarteira = true; });
    await page.selectOption('#carteira-filtro', 'no_next');
    await page.waitForSelector('[data-ui-state="denied"]', { timeout: 30_000 });

    assert.equal(await page.isVisible('text=Portaria 24h Carteira Negada'), false, 'dúvida de autorização não mantém dado na tela');
    assert.equal(await page.isVisible('[data-testid="carteira-desatualizada"]'), false, 'negativa não vira "dados desatualizados"');
    assert.equal(await page.isVisible('[data-ui-state="denied"] button'), false, 'negativa não convida a repetir a mesma chamada');
    const texto = await page.textContent('[data-ui-state="denied"]') || '';
    assert.match(texto, /Acesso negado/);

    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});

test('browser: a primeira leitura que falha não é apresentada como carteira vazia nem como zero', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  await seedFunnel(cookie, 'Carteira Falha Inicial');

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    await forcePortfolioStatus(context, 503, 'crm_unavailable');
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/carteira', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('[data-ui-state="error"]', { timeout: 90_000 });

    const texto = await page.textContent('[data-ui-state="error"]') || '';
    assert.match(texto, /Não foi possível consultar agora/);
    assert.match(texto, /não significa zero registros/i, 'a tela precisa negar a leitura de "zero"');
    assert.equal(await page.isVisible('[data-ui-state="empty"]'), false, 'falha não pode ser mostrada como ausência de itens');
    assert.equal(await page.isVisible('text=Portaria 24h Carteira Falha Inicial'), false, 'nada é exibido sem leitura concluída');

    const titulo = await page.textContent('#carteira-lista-titulo') || '';
    assert.doesNotMatch(titulo, /\d/, `a contagem não pode aparecer sem leitura concluída: ${titulo}`);
    const resultados = await page.textContent('#carteira-resultados-titulo + *') || '';
    assert.match(resultados, /não puderam ser lidos|leitura/i, `os resultados precisam declarar a falha, não a ausência: ${resultados.slice(0, 160)}`);
    await captureCarteira(page, 'desktop-carteira-falha');

    // Repetir é oferecido e funciona quando a origem volta.
    await page.evaluate(() => { window.__uxForcarFalhaCarteira = false; });
    await page.click('[data-ui-state="error"] button:has-text("Tentar novamente")');
    await page.waitForSelector('[data-ui-state="error"]', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('text=Portaria 24h Carteira Falha Inicial', { timeout: 30_000 });

    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});

test('browser: a carteira não transborda em 320/390/768 px e o tema noturno alcança as superfícies', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  await seedFunnel(cookie, 'Carteira Larguras');

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/carteira', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('text=Portaria 24h Carteira Larguras', { timeout: 90_000 });
    await captureCarteira(page, 'desktop-carteira');

    // Medição compartilhada com o funil: reflow pós-resize não é overflow real,
    // então mede, espera e reconfirma antes de reprovar; nós dentro de um
    // contêiner com rolagem própria não contam (a rolagem contida é permitida).
    const medir = () => page.evaluate(() => {
      const raiz = document.documentElement;
      const sobra = raiz.scrollWidth - raiz.clientWidth;
      if (sobra <= 1) return { sobra, culpados: [] };
      const dentroDeRolagem = node => {
        for (let atual = node.parentElement; atual && atual !== document.body; atual = atual.parentElement) {
          const overflowX = getComputedStyle(atual).overflowX;
          if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden' || overflowX === 'clip') return true;
        }
        return false;
      };
      const culpados = [...document.querySelectorAll('body *')]
        .filter(node => !dentroDeRolagem(node))
        .map(node => ({ node, excesso: Math.round(node.getBoundingClientRect().right - raiz.clientWidth) }))
        .filter(item => item.excesso > 1)
        .sort((a, b) => b.excesso - a.excesso)
        .slice(0, 8)
        .map(({ node, excesso }) =>
          `${node.tagName}#${node.id}.${String(node.className).slice(0, 60)}+${excesso}px{${(node.textContent || '').trim().slice(0, 30)}}`);
      return { sobra, culpados };
    });

    for (const [largura, altura, nome] of [[320, 844, 'carteira-320'], [390, 844, 'carteira-390'], [768, 1024, 'carteira-768']]) {
      await page.setViewportSize({ width: largura, height: altura });
      await page.waitForTimeout(300);
      let overflow = await medir();
      if (overflow.sobra > 1) {
        await page.waitForTimeout(400);
        overflow = await medir();
      }
      assert.ok(overflow.sobra <= 1, `a carteira não pode transbordar em ${largura}px (sobra ${overflow.sobra}px): ${overflow.culpados.join(' | ')}`);
      await captureCarteira(page, nome);
    }

    // O caminho mais largo da tela: o formulário aberto no tipo "Indicação",
    // cujo seletor de empresa carrega nomes longos de cadastro. É aí que a
    // coluna de campo poderia empurrar rótulo e nota além do contêiner em 320 px.
    await page.setViewportSize({ width: 320, height: 844 });
    await page.locator('button', { hasText: 'Criar ação de carteira' }).first().click();
    await page.waitForSelector('#carteira-acao-titulo', { timeout: 30_000 });
    await page.selectOption('#acao-tipo', 'indicacao');
    await page.waitForFunction(() => {
      const select = document.querySelector('#acao-empresa');
      return !!select && select.options.length > 1;
    }, null, { timeout: 30_000 });
    await page.waitForTimeout(300);
    let overflowFormulario = await medir();
    if (overflowFormulario.sobra > 1) {
      await page.waitForTimeout(400);
      overflowFormulario = await medir();
    }
    assert.ok(overflowFormulario.sobra <= 1, `o formulário de ação não pode transbordar em 320px (sobra ${overflowFormulario.sobra}px): ${overflowFormulario.culpados.join(' | ')}`);
    await captureCarteira(page, 'carteira-320-formulario-indicacao');

    // Tema noturno pelo controle real do envelope administrativo.
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(200);
    await page.click('[data-admin-theme-toggle="true"]');
    await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night', null, { timeout: 20_000 });
    const cores = await page.evaluate(() => {
      const cartao = document.querySelector('[data-testid="carteira-cartao"]');
      const titulo = document.querySelector('[data-testid="carteira-cartao"] h3');
      const ler = (elemento) => {
        if (!elemento) return null;
        const estilo = getComputedStyle(elemento);
        return { fundo: estilo.backgroundColor, texto: estilo.color };
      };
      return { cartao: ler(cartao), titulo: ler(titulo) };
    });
    const canais = (cor) => (cor.match(/\d+/g) || []).slice(0, 3).map(Number);
    assert.ok(cores.cartao && canais(cores.cartao.fundo).reduce((a, b) => a + b, 0) < 240, `o cartão precisa escurecer no tema noturno: ${cores.cartao?.fundo}`);
    assert.ok(cores.titulo && canais(cores.titulo.texto).reduce((a, b) => a + b, 0) > 480, `o título do cartão precisa clarear no tema noturno: ${cores.titulo?.texto}`);
    await captureCarteira(page, 'carteira-768-noturno');

    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});

test('browser: o teclado percorre filtro, cartão e paginação, e criar ação devolve o foco ao formulário', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  await seedFunnel(cookie, 'Carteira Teclado');

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/carteira', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('text=Portaria 24h Carteira Teclado', { timeout: 90_000 });

    const ativo = () => page.evaluate(() => ({
      id: document.activeElement?.id || '',
      texto: (document.activeElement?.textContent || '').trim(),
      tag: document.activeElement?.tagName || '',
      contorno: getComputedStyle(document.activeElement).outlineStyle,
      espessura: getComputedStyle(document.activeElement).outlineWidth,
    }));

    // Percurso real de Tab a partir do recorte: a próxima parada é a ação do
    // cartão — nenhum controle fica apenas "parecendo" disponível.
    await page.focus('#carteira-filtro');
    await page.keyboard.press('Tab');
    let foco = await ativo();
    assert.match(foco.texto, /Criar ação de carteira/, `o Tab do filtro precisa alcançar a ação do cartão: ${foco.texto}`);
    assert.notEqual(foco.contorno, 'none', 'o controle focado precisa ter contorno visível');
    assert.ok(Number.parseFloat(foco.espessura) > 0, `o contorno de foco precisa ter espessura: ${foco.espessura}`);

    // A segunda ação do cartão continua alcançável pelo teclado.
    await page.keyboard.press('Tab');
    foco = await ativo();
    assert.equal(foco.tag, 'A', `o link do cartão precisa continuar alcançável: ${foco.tag}/${foco.texto}`);

    // Abrir o formulário pelo teclado move o foco para o título da seção.
    await page.focus('#carteira-filtro');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.id === 'carteira-acao-titulo', null, { timeout: 30_000 });
    foco = await ativo();
    assert.equal(foco.id, 'carteira-acao-titulo', 'o formulário precisa receber o foco ao abrir');

    // Do título, o Tab entra nos campos do formulário.
    await page.keyboard.press('Tab');
    assert.equal((await ativo()).id, 'acao-tipo', 'o primeiro campo do formulário precisa ser alcançável pelo Tab');
    await page.keyboard.press('Tab');
    assert.equal((await ativo()).id, 'acao-titulo', 'o campo de título precisa seguir na ordem do teclado');
    await page.keyboard.press('Tab');
    assert.equal((await ativo()).id, 'acao-proxima', 'a próxima ação precisa seguir na ordem do teclado');
    await page.keyboard.press('Tab');
    assert.equal((await ativo()).id, 'acao-data', 'a data combinada precisa seguir na ordem do teclado');

    // O select de tipo continua operável pelo teclado: as setas mudam a opção
    // canônica que é enviada ao servidor, sem depender do mouse.
    await page.focus('#acao-tipo');
    for (const [tecla, esperado] of [['ArrowDown', 'upsell'], ['ArrowDown', 'cross_sell'], ['ArrowUp', 'upsell'], ['ArrowUp', 'renovacao']]) {
      await page.keyboard.press(tecla);
      await page.waitForFunction(valor => document.getElementById('acao-tipo')?.value === valor, esperado, { timeout: 10_000 });
    }

    await context.close();
  } finally { /* o navegador é compartilhado e fechado no after() */ }
});

// ---------------------------------------------------------------------------
// UX-PRO-06 — fila de pedidos recebidos (/admin/leads)
//
// O que estes testes provam: a fila mostra espera, fonte, responsável, estado
// e próxima ação a partir de campos que a API JÁ devolvia; a ausência de dado
// é dita como ausência; falha de leitura marca a lista como desatualizada em
// vez de escondê-la; a ordenação por espera é derivada e explícita; ações
// concorrentes preservam a trava por pedido; e as superfícies novas funcionam
// em 320/390/768px, no tema noturno e pelo teclado.
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

// Sem este teste, a suíte inteira poderia ser ignorada quando o ambiente não
// estivesse configurado e o gate continuaria verde sem provar nada. Ele roda
// sempre: se o ambiente faltar, ele falha em vez de desaparecer.
test('o ambiente do gate está configurado, portanto nenhum teste da suíte pode ser ignorado', async () => {
  // RUN é a própria DATABASE_URL quando o ambiente está pronto (e falso quando
  // não está); por isso a checagem é de veracidade, não de igualdade.
  assert.ok(RUN, 'RUN_DATABASE_INTEGRATION=1 e DATABASE_URL precisam estar definidos; sem isso a suíte é ignorada sem falhar');
});

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

    await captureLeads(page, 'desktop-leads-fila');
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
    await captureLeads(page, 'desktop-leads-desatualizado');

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

test('browser: envios simultâneos mantêm cada pedido travado até a própria resposta', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  const cookie = await loginHttp(staff.email);
  const primeiro = await seedLead({ label: 'Fila Trava Primeiro', phone: '(11) 98888-0019', cookie });
  const segundo = await seedLead({ label: 'Fila Trava Segundo', phone: '(11) 98888-0020', cookie });

  try {
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
    // Segura apenas o PATCH do primeiro pedido dentro desta aba. Assim a segunda
    // ação pode terminar e provar que ela não reabilita o primeiro cartão.
    await context.addInitScript(leadId => {
      const original = window.fetch.bind(window);
      window.__uxLiberarAtualizacaoLead = null;
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input?.url || '';
        const method = String(init?.method || input?.method || 'GET').toUpperCase();
        if (url.includes(`/api/admin/leads/${leadId}`) && method === 'PATCH') {
          return new Promise((resolve, reject) => {
            window.__uxLiberarAtualizacaoLead = () => original(input, init).then(resolve, reject);
          });
        }
        return original(input, init);
      };
    }, primeiro);
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/leads', { waitUntil: 'domcontentloaded', timeout: 90_000 });

    const seletorPrimeiro = page.locator(`[data-testid="${cardTestId(primeiro)}"] select[aria-label^="Alterar status"]`);
    const seletorSegundo = page.locator(`[data-testid="${cardTestId(segundo)}"] select[aria-label^="Alterar status"]`);
    await seletorPrimeiro.waitFor({ state: 'visible', timeout: 90_000 });
    await seletorSegundo.waitFor({ state: 'visible', timeout: 90_000 });

    await seletorPrimeiro.selectOption('em_agendamento');
    await page.waitForFunction(testId => {
      const select = document.querySelector(`[data-testid="${testId}"] select`);
      return Boolean(select?.disabled) && typeof window.__uxLiberarAtualizacaoLead === 'function';
    }, cardTestId(primeiro), { timeout: 30_000 });

    await seletorSegundo.selectOption('em_agendamento');
    await page.waitForFunction(testId => {
      const select = document.querySelector(`[data-testid="${testId}"] select`);
      return select?.value === 'em_agendamento' && !select.disabled;
    }, cardTestId(segundo), { timeout: 30_000 });

    assert.equal(await seletorPrimeiro.isDisabled(), true, 'a conclusão do segundo envio não pode reabilitar o primeiro ainda pendente');
    const liberou = await page.evaluate(() => {
      if (typeof window.__uxLiberarAtualizacaoLead !== 'function') return false;
      window.__uxLiberarAtualizacaoLead();
      return true;
    });
    assert.equal(liberou, true, 'o teste precisa liberar o PATCH adiado para não deixar atividade pendente');
    await page.waitForFunction(testId => {
      const select = document.querySelector(`[data-testid="${testId}"] select`);
      return select?.value === 'em_agendamento' && !select.disabled;
    }, cardTestId(primeiro), { timeout: 30_000 });
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
    await captureLeads(page, 'mobile-leads-fila');

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
    await captureLeads(page, 'mobile-leads-noturno');
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

// ---------------------------------------------------------------------------
// UX-PRO-06 — /admin/comercial: casca em etapas e histórico de versões
// (fatia própria; provas HTTP e de navegador contra PostgreSQL descartável)
// ---------------------------------------------------------------------------

const comercialEvidenceDir = process.env.UX_COMERCIAL_EVIDENCE_DIR || '';
async function captureComercial(page, nome) {
  await capture(page, nome, comercialEvidenceDir);
}
async function writeComercialEvidence(nome, dados) {
  if (!comercialEvidenceDir) return;
  await mkdir(comercialEvidenceDir, { recursive: true });
  await writeFile(path.join(comercialEvidenceDir, nome), JSON.stringify(dados, null, 2) + '\n');
}

const COMERCIAL_ETAPAS = [
  'Vistoria',
  'Orçamentos (MO/técnico/custos)',
  'Preço & descontos',
  'Propostas & envio',
  'Contrato (idempotência)',
  'Catálogo & equipamentos',
  'Relatórios & comissões',
  'Biblioteca & parcerias',
];

// Leituras GET que as etapas da casca disparam (sem identificador de registro).
const COMERCIAL_LEITURAS = [
  '/api/catalog',
  '/api/crm/campaigns?limit=5',
  '/api/crm/commercial-library?limit=5',
  '/api/crm/commission-rules',
  '/api/crm/commissions',
  '/api/crm/contracts',
  '/api/crm/cost-parameters',
  '/api/crm/discount-policies',
  '/api/crm/discount-requests',
  '/api/crm/equipment',
  '/api/crm/goals',
  '/api/crm/inspection-templates',
  '/api/crm/inspections',
  '/api/crm/labor-budgets',
  '/api/crm/partners',
  '/api/crm/partnership-metrics',
  '/api/crm/price-scenarios',
  '/api/crm/proposal-comparisons',
  '/api/crm/proposal-deliveries',
  '/api/crm/proposals',
  '/api/crm/referrals',
  '/api/crm/renewals',
  '/api/crm/reports',
  '/api/crm/technical-budgets',
];

/** Mesma medição das telas irmãs: reconfirma após reflow e ignora rolagem contida. */
async function medirTransbordoComercial(page) {
  return page.evaluate(() => {
    const raiz = document.documentElement;
    const sobra = raiz.scrollWidth - raiz.clientWidth;
    if (sobra <= 1) return { sobra, culpados: [] };
    const dentroDeRolagem = node => {
      for (let atual = node.parentElement; atual && atual !== document.body; atual = atual.parentElement) {
        const overflowX = getComputedStyle(atual).overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden' || overflowX === 'clip') return true;
      }
      return false;
    };
    const culpados = [...document.querySelectorAll('body *')]
      .filter(node => !dentroDeRolagem(node))
      .map(node => ({ node, excesso: Math.round(node.getBoundingClientRect().right - raiz.clientWidth) }))
      .filter(item => item.excesso > 1)
      .sort((a, b) => b.excesso - a.excesso)
      .slice(0, 6)
      .map(({ node, excesso }) =>
        `${node.tagName}#${node.id}.${String(node.className).slice(0, 50)}+${excesso}px{${(node.textContent || '').trim().slice(0, 30)}}`);
    return { sobra, culpados };
  });
}

/**
 * Força, SÓ dentro da aba, a resposta da consulta de versões. Ligada por
 * `window.__uxForcarFalhaHistorico`; desligada, a leitura real volta a valer.
 */
async function forceCommercialHistoryStatus(context, status, code) {
  await context.addInitScript(({ status, code }) => {
    window.__uxForcarFalhaHistorico = false;
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (window.__uxForcarFalhaHistorico && url.includes('/api/crm/commercial-versions?')) {
        return Promise.resolve(new Response(JSON.stringify({ error: code }), {
          status, headers: { 'content-type': 'application/json' },
        }));
      }
      return original(input, init);
    };
  }, { status, code });
}

/** Atrasa a consulta de versões para observar o estado de consulta em curso. */
async function delayCommercialHistoryFetch(context, ms = 3000) {
  await context.addInitScript(({ ms }) => {
    window.__uxAtrasarHistorico = false;
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (window.__uxAtrasarHistorico && url.includes('/api/crm/commercial-versions?')) {
        await new Promise(resolve => setTimeout(resolve, ms));
      }
      return original(input, init);
    };
  }, { ms });
}

function secaoHistoricoComercial(page) {
  // Seção que tem o título como FILHO DIRETO: o cartão externo de "Relatórios
  // & comissões" também é <section> e contém esta, por isso não usar :has().
  return page.locator('xpath=//section[h2[normalize-space(.)="Histórico de versões comerciais"]]');
}

async function irParaEtapaComercial(page, nome) {
  await page.locator('nav[aria-label="Etapas comerciais"] button', { hasText: nome }).first().click();
  await page.waitForSelector(`h2#comercial-contexto:has-text("${nome}")`, { timeout: 30_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
}

test('UX-PRO-06 comercial: a API do histórico exige sessão, papel e identificador válido, sem mudança de contrato', { skip: !RUN }, async () => {
  const id = randomUUID();
  const anonimo = await api(`/api/crm/commercial-versions?type=crm_goals&id=${id}`);
  assert.equal(anonimo.status, 401, 'anônimo deve continuar recebendo 401');
  assert.equal(anonimo.body?.error, 'session_required');

  const rh = await provisionStaff(pool, { role: 'rh' });
  const cookieRh = await loginHttp(rh.email);
  const negadoRh = await api(`/api/crm/commercial-versions?type=crm_goals&id=${id}`, { cookie: cookieRh });
  assert.equal(negadoRh.status, 403, 'papel fora da lista continua sem acesso');
  assert.equal(negadoRh.body?.error, 'role_required');

  // Divergência registrada, não corrigida aqui: a tela /admin/comercial libera
  // o papel comercial, mas esta API decide por admin/marcelo/ti. Mudar esse
  // papel é decisão de permissão do proprietário, fora desta fatia.
  const comercial = await provisionStaff(pool, { role: 'comercial' });
  const cookieComercial = await loginHttp(comercial.email);
  const negadoComercial = await api(`/api/crm/commercial-versions?type=crm_goals&id=${id}`, { cookie: cookieComercial });
  assert.equal(negadoComercial.status, 403, 'comercial continua recebendo 403 desta API (permissão preservada)');
  assert.equal(negadoComercial.body?.error, 'role_required');

  const marcelo = await provisionStaff(pool, { role: 'marcelo' });
  const cookieMarcelo = await loginHttp(marcelo.email);
  const vazio = await api(`/api/crm/commercial-versions?type=crm_goals&id=${id}`, { cookie: cookieMarcelo });
  assert.equal(vazio.status, 200, JSON.stringify(vazio.body));
  assert.deepEqual(vazio.body?.items, [], 'identificador sem versões responde lista vazia');

  const invalido = await api('/api/crm/commercial-versions?type=crm_goals&id=nao-e-uuid', { cookie: cookieMarcelo });
  assert.equal(invalido.status, 400);
  assert.equal(invalido.body?.error, 'invalid_entity');

  const tipoInvalido = await api(`/api/crm/commercial-versions?type=outra&id=${id}`, { cookie: cookieMarcelo });
  assert.equal(tipoInvalido.status, 400);
  assert.equal(tipoInvalido.body?.error, 'invalid_entity');
});

test('UX-PRO-06 comercial: matriz de papéis das leituras das etapas (evidência; leituras internas exigem sessão)', { skip: !RUN }, async () => {
  const comercial = await provisionStaff(pool, { role: 'comercial' });
  const cookieComercial = await loginHttp(comercial.email);
  const marcelo = await provisionStaff(pool, { role: 'marcelo' });
  const cookieMarcelo = await loginHttp(marcelo.email);
  const linhas = [];
  for (const caminho of COMERCIAL_LEITURAS) {
    const anonimo = await api(caminho);
    // O catálogo de serviços é público por desenho (também lido pelo simulador);
    // as leituras internas do comercial precisam recusar anônimo.
    if (caminho.startsWith('/api/crm/')) assert.equal(anonimo.status, 401, `${caminho}: anônimo deve receber 401`);
    const comercialRes = await api(caminho, { cookie: cookieComercial });
    const marceloRes = await api(caminho, { cookie: cookieMarcelo });
    linhas.push({ caminho, anonimo: anonimo.status, comercial: comercialRes.status, marcelo: marceloRes.status });
  }
  await writeComercialEvidence('matriz-papeis-leituras.json', { base: 'api', linhas });
  assert.equal(linhas.length, COMERCIAL_LEITURAS.length);
});

test('browser: as oito etapas trocam pelo teclado, anunciam a etapa atual e mostram foco visível', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  await loginHttp(staff.email);
  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/comercial', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('nav[aria-label="Etapas comerciais"]', { timeout: 90_000 });

    const botoes = page.locator('nav[aria-label="Etapas comerciais"] button');
    assert.equal(await botoes.count(), COMERCIAL_ETAPAS.length, 'as oito etapas continuam presentes');
    for (const [indice, nome] of COMERCIAL_ETAPAS.entries()) {
      assert.ok((await botoes.nth(indice).innerText()).includes(nome.split(' (')[0].split(' &')[0]), `etapa ${indice + 1} mantém o rótulo`);
    }
    assert.equal(await botoes.nth(0).getAttribute('aria-pressed'), 'true', 'a primeira etapa começa ativa');

    await botoes.nth(0).focus();
    await page.keyboard.press('Tab');
    const focado = await page.evaluate(() => document.activeElement?.textContent?.trim() || '');
    assert.ok(focado.includes('Orçamentos'), `Tab leva à etapa seguinte; focado: "${focado}"`);
    const contorno = await page.evaluate(() => {
      const estilo = getComputedStyle(document.activeElement);
      return { outline: estilo.outlineStyle, largura: estilo.outlineWidth, sombra: estilo.boxShadow };
    });
    assert.ok((contorno.outline !== 'none' && contorno.largura !== '0px') || contorno.sombra !== 'none',
      `a etapa focada precisa de contorno visível: ${JSON.stringify(contorno)}`);

    await page.keyboard.press('Enter');
    await page.waitForSelector('h2#comercial-contexto:has-text("Orçamentos (MO/técnico/custos)")', { timeout: 30_000 });
    assert.equal(await botoes.nth(1).getAttribute('aria-pressed'), 'true', 'a etapa escolhida fica anunciada como ativa');
    assert.equal(await botoes.nth(0).getAttribute('aria-pressed'), 'false', 'a etapa anterior deixa de estar ativa');
    const pergunta = await page.locator('p', { hasText: 'Pergunta desta etapa' }).first().innerText();
    assert.ok(pergunta.includes('Quanto custa entregar esse serviço?'), 'a pergunta da etapa acompanha a troca');
    await captureComercial(page, 'desktop-comercial-etapas');
  } finally {
    await context.close();
  }
});

test('browser: a casca e as etapas não transbordam em 320/390/768/1440 px', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  await loginHttp(staff.email);
  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
  const resultados = [];
  try {
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/comercial', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('nav[aria-label="Etapas comerciais"]', { timeout: 90_000 });
    for (const [largura, altura] of [[320, 844], [390, 844], [768, 1024], [1440, 900]]) {
      await page.setViewportSize({ width: largura, height: altura });
      await page.waitForTimeout(300);
      for (const nome of COMERCIAL_ETAPAS) {
        await irParaEtapaComercial(page, nome);
        let medida = await medirTransbordoComercial(page);
        if (medida.sobra > 1) {
          await page.waitForTimeout(400);
          medida = await medirTransbordoComercial(page);
        }
        resultados.push({ largura, etapa: nome, sobra: medida.sobra, culpados: medida.culpados });
        if (largura === 320 && nome === 'Vistoria') await captureComercial(page, 'comercial-320');
        if (largura === 768 && nome === 'Relatórios & comissões') await captureComercial(page, 'comercial-768-relatorios');
      }
    }
  } finally {
    await context.close();
  }
  await writeComercialEvidence('transbordo-por-etapa.json', resultados);
  const falhas = resultados.filter(item => item.sobra > 1);
  assert.equal(falhas.length, 0, `nenhuma etapa pode transbordar: ${falhas.map(f => `${f.largura}px ${f.etapa} (+${f.sobra}px ${f.culpados.join(' | ')})`).join(' ;; ')}`);
});

async function abrirHistoricoComoMarcelo(context, staffEmail) {
  const page = await context.newPage();
  await loginBrowser(page, staffEmail);
  await page.goto('/admin/comercial', { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForSelector('nav[aria-label="Etapas comerciais"]', { timeout: 90_000 });
  await irParaEtapaComercial(page, 'Relatórios & comissões');
  const secao = secaoHistoricoComercial(page);
  await secao.waitFor({ timeout: 30_000 });
  return { page, secao };
}

async function criarItemBibliotecaSintetico(pool, cookie) {
  const lib = await api('/api/crm/commercial-library', {
    method: 'POST', cookie,
    body: { title: 'Apresentação Sintética Histórico', type: 'apresentacao', description: 'Material fictício', category: 'vendas', file_url: '', tags: [] },
  });
  assert.ok(lib.status === 201, `criação de item da biblioteca: ${lib.status} ${JSON.stringify(lib.body)}`);
  const libId = lib.body?.item?.id;
  assert.ok(libId, 'a API devolve o id do item criado');
  return libId;
}

test('browser: o histórico lê a versão e distingue "sem versões" de identificador inválido', { skip: !RUN }, async () => {
  const marcelo = await provisionStaff(pool, { role: 'marcelo' });
  const cookie = await loginHttp(marcelo.email);
  const libId = await criarItemBibliotecaSintetico(pool, cookie);

  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
  try {
    const { page, secao } = await abrirHistoricoComoMarcelo(context, marcelo.email);
    await secao.locator('select').selectOption('crm_commercial_library');
    await secao.getByLabel('Identificador do registro').fill(libId);
    await secao.getByRole('button', { name: 'Consultar versões' }).click();
    await page.waitForSelector('text=Versão 1', { timeout: 30_000 });
    assert.ok(await secao.locator('article h3', { hasText: 'Versão 1' }).isVisible(), 'a versão lida aparece');

    // Vazio explícito: identificador válido sem versões não pode parecer tela em branco.
    await secao.getByLabel('Identificador do registro').fill(randomUUID());
    await secao.getByRole('button', { name: 'Consultar versões' }).click();
    await page.waitForSelector('text=/nenhuma versão/i', { timeout: 30_000 });

    // Identificador inválido: mensagem compreensível, sem o código técnico cru.
    await secao.getByLabel('Identificador do registro').fill('nao-e-uuid');
    await secao.getByRole('button', { name: 'Consultar versões' }).click();
    await page.waitForSelector('[role="alert"]', { timeout: 30_000 });
    const textoInvalido = await secao.locator('[role="alert"]').innerText();
    assert.ok(!textoInvalido.includes('invalid_entity'), `não expor o código técnico: "${textoInvalido}"`);
    assert.ok(/identificador/i.test(textoInvalido), `a mensagem diz o que corrigir: "${textoInvalido}"`);
    await captureComercial(page, 'desktop-comercial-historico-identificador');
  } finally {
    await context.close();
  }
});

test('browser: falha após leitura concluída mantém a versão lida, declara desatualização com hora e repete', { skip: !RUN }, async () => {
  const marcelo = await provisionStaff(pool, { role: 'marcelo' });
  const cookie = await loginHttp(marcelo.email);
  const libId = await criarItemBibliotecaSintetico(pool, cookie);

  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
  try {
    await forceCommercialHistoryStatus(context, 503, 'service_unavailable');
    const { page, secao } = await abrirHistoricoComoMarcelo(context, marcelo.email);
    await secao.locator('select').selectOption('crm_commercial_library');
    await secao.getByLabel('Identificador do registro').fill(libId);
    await secao.getByRole('button', { name: 'Consultar versões' }).click();
    await page.waitForSelector('text=Versão 1', { timeout: 30_000 });

    // Falha após leitura concluída: mantém a última versão lida, declara o estado e repete.
    await page.evaluate(() => { window.__uxForcarFalhaHistorico = true; });
    await secao.getByRole('button', { name: 'Consultar versões' }).click();
    await page.waitForSelector('[data-testid="historico-desatualizado"]', { timeout: 30_000 });
    assert.ok(await secao.locator('article h3', { hasText: 'Versão 1' }).isVisible(), 'a falha não apaga a versão já lida');
    const aviso = await secao.locator('[data-testid="historico-desatualizado"]').innerText();
    assert.ok(/desatualizad/i.test(aviso), `o aviso diz que os dados podem estar desatualizados: "${aviso}"`);
    assert.ok(/\d{1,2}:\d{2}/.test(aviso), `o aviso traz a hora da última leitura concluída: "${aviso}"`);
    assert.ok(!aviso.includes('service_unavailable'), `não expor o código técnico: "${aviso}"`);
    assert.ok(await secao.getByRole('button', { name: 'Tentar novamente' }).isVisible(), 'a falha recuperável oferece repetir');
    await captureComercial(page, 'desktop-comercial-historico-desatualizado');

    await page.evaluate(() => { window.__uxForcarFalhaHistorico = false; });
    await secao.getByRole('button', { name: 'Tentar novamente' }).click();
    await page.waitForSelector('[data-testid="historico-desatualizado"]', { state: 'detached', timeout: 30_000 });
    assert.ok(await secao.locator('article h3', { hasText: 'Versão 1' }).isVisible(), 'a repetição bem-sucedida mantém o histórico atualizado');
  } finally {
    await context.close();
  }
});

test('browser: consulta de versões em curso mostra estado de espera e bloqueia nova chamada', { skip: !RUN }, async () => {
  const marcelo = await provisionStaff(pool, { role: 'marcelo' });
  const cookie = await loginHttp(marcelo.email);
  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
  try {
    await delayCommercialHistoryFetch(context, 3000);
    const page = await context.newPage();
    await loginBrowser(page, marcelo.email);
    await page.goto('/admin/comercial', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('nav[aria-label="Etapas comerciais"]', { timeout: 90_000 });
    await irParaEtapaComercial(page, 'Relatórios & comissões');
    const secao = secaoHistoricoComercial(page);
    await secao.waitFor({ timeout: 30_000 });
    await secao.getByLabel('Identificador do registro').fill(randomUUID());
    await page.evaluate(() => { window.__uxAtrasarHistorico = true; });
    await secao.getByRole('button', { name: 'Consultar versões' }).click();
    const enquanto = secao.locator('[role="status"]', { hasText: /consultando/i });
    await enquanto.waitFor({ timeout: 2_000 });
    assert.ok(await enquanto.isVisible(), 'a consulta em curso precisa ser anunciada');
    assert.ok(await secao.getByRole('button', { name: /consultar/i }).isDisabled(), 'o botão não aceita nova chamada durante a consulta');
    await page.waitForSelector('text=/nenhuma versão/i', { timeout: 30_000 });
    await captureComercial(page, 'desktop-comercial-historico-consultando');
  } finally {
    await context.close();
  }
});

test('browser: o papel comercial vê a negativa do histórico em linguagem clara, sem o código cru nem repetição', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'comercial' });
  await loginHttp(staff.email);
  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/comercial', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('nav[aria-label="Etapas comerciais"]', { timeout: 90_000 });
    await irParaEtapaComercial(page, 'Relatórios & comissões');
    const secao = secaoHistoricoComercial(page);
    await secao.waitFor({ timeout: 30_000 });
    await secao.getByLabel('Identificador do registro').fill(randomUUID());
    await secao.getByRole('button', { name: 'Consultar versões' }).click();
    await page.waitForSelector('[role="alert"]', { timeout: 30_000 });
    const texto = await secao.locator('[role="alert"]').innerText();
    assert.ok(!texto.includes('role_required'), `não expor o código técnico: "${texto}"`);
    assert.ok(/permiss|acesso/i.test(texto), `a negativa diz que o papel não tem acesso: "${texto}"`);
    assert.equal(await secao.getByRole('button', { name: 'Tentar novamente' }).count(), 0, 'negativa não oferece repetição');
    await captureComercial(page, 'desktop-comercial-historico-negado');
  } finally {
    await context.close();
  }
});

test('browser: no tema noturno a casca e o histórico mantêm contraste de texto legível', { skip: !RUN }, async () => {
  const marcelo = await provisionStaff(pool, { role: 'marcelo' });
  await loginHttp(marcelo.email);
  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 768, height: 1024 } });
  try {
    const page = await context.newPage();
    await loginBrowser(page, marcelo.email);
    await page.goto('/admin/comercial', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('nav[aria-label="Etapas comerciais"]', { timeout: 90_000 });
    await page.click('[data-admin-theme-toggle="true"]');
    await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night', null, { timeout: 20_000 });
    await irParaEtapaComercial(page, 'Relatórios & comissões');
    await secaoHistoricoComercial(page).waitFor({ timeout: 30_000 });

    const medicoes = await page.evaluate(() => {
      const fundoEfetivo = elemento => {
        for (let atual = elemento; atual; atual = atual.parentElement) {
          const cor = getComputedStyle(atual).backgroundColor;
          const canais = (cor.match(/[\d.]+/g) || []).map(Number);
          if (canais.length >= 3 && (canais.length < 4 || canais[3] > 0.5)) return canais.slice(0, 3);
        }
        return [255, 255, 255];
      };
      const luminancia = ([r, g, b]) => {
        const lin = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      };
      const contraste = (a, b) => {
        const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
        return (l1 + 0.05) / (l2 + 0.05);
      };
      const alvos = {
        'titulo-etapa': document.querySelector('h2#comercial-contexto'),
        'dica': document.querySelector('p[class*="hint"]'),
        'botao-etapa-ativa': document.querySelector('nav[aria-label="Etapas comerciais"] button[aria-pressed="true"]'),
        'titulo-historico': [...document.querySelectorAll('h2')].find(h => h.textContent?.includes('Histórico de versões')) || null,
        'dica-historico': [...document.querySelectorAll('section p')].find(p => p.textContent?.includes('nenhuma comissão é paga')) || null,
      };
      const saida = {};
      for (const [nome, el] of Object.entries(alvos)) {
        if (!el) { saida[nome] = null; continue; }
        const cor = (getComputedStyle(el).color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        saida[nome] = Math.round(contraste(cor, fundoEfetivo(el)) * 100) / 100;
      }
      return { tema: document.documentElement.dataset.adminTheme, contraste: saida };
    });
    await writeComercialEvidence('contraste-noturno.json', medicoes);
    for (const [nome, valor] of Object.entries(medicoes.contraste)) {
      assert.ok(valor !== null, `elemento "${nome}" precisa existir no tema noturno`);
      assert.ok(valor >= 4.5, `contraste de "${nome}" no tema noturno precisa ser ≥ 4.5:1 (medido ${valor}:1)`);
    }
    await captureComercial(page, 'comercial-768-noturno');
  } finally {
    await context.close();
  }
});

test('browser: o gate administrativo continua barrando papel fora da lista em /admin/comercial', { skip: !RUN }, async () => {
  const rh = await provisionStaff(pool, { role: 'rh' });
  await loginHttp(rh.email);
  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
  try {
    const page = await context.newPage();
    await loginBrowser(page, rh.email);
    await page.goto('/admin/comercial', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('[data-admin-gate="forbidden"]', { timeout: 90_000 });
    assert.equal(await page.locator('nav[aria-label="Etapas comerciais"]').count(), 0, 'papel sem acesso não vê as etapas');
  } finally {
    await context.close();
  }
});

async function ajustarTemaAdmin(page, desejado) {
  const atual = await page.evaluate(() => document.documentElement.dataset.adminTheme || 'day');
  if (atual !== desejado) {
    await page.click('[data-admin-theme-toggle="true"]');
    await page.waitForFunction(v => (document.documentElement.dataset.adminTheme || 'day') === v, desejado, { timeout: 20_000 });
  }
}

// Evidência própria da fatia: mede sempre; grava capturas e resumo.json somente
// quando UX_COMERCIAL_EVIDENCE_DIR existe (sem variável, nenhum arquivo é escrito).
// Mede e captura /admin/comercial em 320/390/768/1440 px, dia e noite, e registra
// o percurso de teclado. Gera resumo.json legível por máquina (sem dado real).
test('browser: evidência própria de /admin/comercial em 320/390/768/1440 px, dia e noite, com teclado', { skip: !RUN }, async () => {
  const staff = await provisionStaff(pool, { role: 'marcelo' });
  await loginHttp(staff.email);
  const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 900 } });
  const capturas = [];
  let teclado = null;
  try {
    const page = await context.newPage();
    await loginBrowser(page, staff.email);
    await page.goto('/admin/comercial', { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('nav[aria-label="Etapas comerciais"]', { timeout: 90_000 });

    for (const tema of ['day', 'night']) {
      await ajustarTemaAdmin(page, tema);
      for (const [largura, altura] of [[320, 844], [390, 844], [768, 1024], [1440, 900]]) {
        await page.setViewportSize({ width: largura, height: altura });
        await page.waitForTimeout(250);
        for (const nome of ['Vistoria', 'Relatórios & comissões']) {
          await irParaEtapaComercial(page, nome);
          let medida = await medirTransbordoComercial(page);
          if (medida.sobra > 1) { await page.waitForTimeout(400); medida = await medirTransbordoComercial(page); }
          const contraste = await page.evaluate(() => {
            const el = document.querySelector('nav[aria-label="Etapas comerciais"] button[aria-pressed="true"]');
            if (!el) return null;
            const canal = cor => (cor.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
            const fundo = (() => {
              for (let a = el; a; a = a.parentElement) {
                const c = getComputedStyle(a).backgroundColor;
                const v = (c.match(/[\d.]+/g) || []).map(Number);
                if (v.length >= 3 && (v.length < 4 || v[3] > 0.5)) return v.slice(0, 3);
              }
              return [255, 255, 255];
            })();
            const lum = ([r, g, b]) => { const f = x => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
            const [l1, l2] = [lum(canal(getComputedStyle(el).color)), lum(fundo)].sort((x, y) => y - x);
            return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
          });
          const slug = nome.startsWith('Vistoria') ? 'vistoria' : 'relatorios';
          const arquivo = `${largura}-${tema === 'night' ? 'noite' : 'dia'}-${slug}.png`;
          await captureComercial(page, arquivo.replace(/\.png$/, ''));
          capturas.push({ arquivo, largura, altura, tema, etapa: nome, sobraPx: medida.sobra, contrasteEtapaAtiva: contraste });
        }
      }
    }

    // Teclado no celular (390 px, dia): foco visível, Tab entre etapas e Enter para ativar.
    await ajustarTemaAdmin(page, 'day');
    await page.setViewportSize({ width: 390, height: 844 });
    await irParaEtapaComercial(page, 'Vistoria');
    await page.locator('nav[aria-label="Etapas comerciais"] button').first().focus();
    const percurso = [];
    for (let passo = 0; passo < 3; passo += 1) {
      await page.keyboard.press('Tab');
      percurso.push(await page.evaluate(() => (document.activeElement?.textContent || '').trim().slice(0, 40)));
    }
    const contorno = await page.evaluate(() => {
      const e = getComputedStyle(document.activeElement);
      return { outlineStyle: e.outlineStyle, outlineWidth: e.outlineWidth, boxShadow: e.boxShadow };
    });
    await page.keyboard.press('Enter');
    await page.waitForSelector('h2#comercial-contexto', { timeout: 30_000 });
    teclado = {
      largura: 390,
      tema: 'day',
      percurso,
      contornoFocoNaUltimaEtapa: contorno,
      enterAtivaEtapa: await page.locator('h2#comercial-contexto').innerText(),
    };
    await captureComercial(page, '390-dia-teclado');
  } finally {
    await context.close();
  }

  const falhas = capturas.filter(c => c.sobraPx > 1);
  const entries = capturas.map(c => ({
    stage: 'ux-pro-06-comercial',
    route: '/admin/comercial',
    role: 'marcelo',
    viewport: `${c.largura}x${c.altura}`,
    theme: c.tema === 'night' ? 'noite' : 'dia',
    etapa: c.etapa,
    file: c.arquivo,
    sobraDocumentoPx: c.sobraPx,
    contrasteEtapaAtivaTema: c.contrasteEtapaAtiva,
  }));
  if (teclado) entries.push({
    stage: 'ux-pro-06-comercial',
    route: '/admin/comercial',
    role: 'marcelo',
    viewport: '390x844',
    theme: 'dia',
    etapa: 'teclado',
    file: '390-dia-teclado.png',
    firstFocus: true,
    percursoTeclado: teclado.percurso,
  });
  const resumo = {
    stage: 'ux-pro-06-comercial',
    generatedBy: 'gate npm run test:ux-crm:pg (UX_COMERCIAL_EVIDENCE_DIR=docs/ux-pro-06-comercial-evidencias/depois)',
    notes: 'Evidência da fatia UX-PRO-06 — /admin/comercial. Massa sintética criada pelas APIs; papel marcelo provisionado pelo gate; sem dado pessoal ou credencial. As medições do checkout de main (267fb55) ficam em antes/ e NÃO são evidência vigente.',
    fatia: 'UX-PRO-06 — /admin/comercial',
    rota: '/admin/comercial',
    papel_usado: 'marcelo (dados sintéticos; sem credencial registrada)',
    viewports: [320, 390, 768, 1440],
    temas: ['dia', 'noite'],
    entries,
    capturas,
    transbordoDocumentoPorCaptura: falhas.length === 0 ? 'nenhum' : falhas,
    teclado,
    limites: [
      'Medição automatizada por Chromium; não é validação manual nem aceite de Marcelo, Andreia ou comercial.',
      'Componentes de domínio das etapas (src/app/admin/ti/*) são medidos apenas pela casca; não foram alterados nesta fatia.',
    ],
  };
  await writeComercialEvidence('resumo.json', resumo);
  assert.equal(falhas.length, 0, `transbordo de documento: ${JSON.stringify(falhas)}`);
});
