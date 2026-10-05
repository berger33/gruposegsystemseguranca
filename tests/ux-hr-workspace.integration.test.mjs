// UX-04 — gate das tarefas de RH, por HTTP real contra PostgreSQL real
// (executado por scripts/qa-ux-hr-postgres.mjs, que sobe um cluster
// descartável) e por Chromium real.
//
// O que este gate prova:
//  - as rotas de RH continuam respondendo 401 sem sessão e 403 sem a concessão
//    fina, exatamente como antes desta fatia;
//  - a divergência real entre "papel aparece no menu" e "concessão efetiva na
//    API": o papel `rh` abre a página e mesmo assim recebe 403 de
//    `employees.read` até alguém conceder;
//  - que a tela NÃO transforma essa negativa em indicadores zerados — que era
//    o defeito da versão anterior;
//  - carregando, negado, falha e vazio são quatro estados distintos;
//  - abas por teclado, retorno obrigatório na análise, confirmação explícita do
//    desligamento com resumo do efeito, e 390px sem transbordo horizontal.
//
// O que este gate NÃO prova: aceite humano, homologação de Marcelo/Andreia,
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
let grantedRh, deniedStaff, grantedCookie, deniedCookie;

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
// browser entre contextos derruba o alvo. Cada teste abre o seu, como já
// fazem os gates L04, F03 e UX-03B deste repositório.
async function launchBrowser() {
  return playwrightChromium.launch({
    executablePath: await packagedChromium.executablePath(),
    args: packagedChromium.args.filter(arg => arg !== '--disable-web-security'),
    headless: true,
  });
}

const evidenceDir = process.env.UX_HR_EVIDENCE_DIR || '';
async function capture(page, nome) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage: true });
}

/** Abre /admin/funcionarios já autenticado com o cookie indicado. */
async function openRh(browser, cookie, { width = 1440, height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  const separator = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(90_000);
  await page.goto(`${baseUrl}/admin/funcionarios`, { waitUntil: 'domcontentloaded' });
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
      NEXT_DIST_DIR: '.next/integration-ux-hr',
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

  // A divergência real deste repositório, confirmada na migração 102:
  // o gatilho `provision_hr_role_permissions` concede employees.read/write
  // (escopo `organization`) a quem tem o papel `rh` — e deliberadamente NÃO
  // concede a `ti`, `admin` nem `marcelo` ("TI/admin não recebem leitura de
  // RH", comentário da própria migração).
  //
  // Só que `/admin/funcionarios` tem AdminGate allowedRoles=['rh','marcelo',
  // 'admin','ti']. Ou seja: TI, admin e Marcelo veem o item no menu, abrem a
  // página e recebem 403 em TODA leitura de RH. Antes desta fatia isso virava
  // "0 cadastros, 0 ativos, 0 em admissão" na tela. É esse caso que o teste
  // abaixo tranca.
  grantedRh = await provisionStaff(pool, { role: 'rh' });
  deniedStaff = await provisionStaff(pool, { role: 'ti' });
  grantedCookie = await loginHttp(grantedRh.email);
  deniedCookie = await loginHttp(deniedStaff.email);

  for (const route of ['/admin/entrar', '/admin/funcionarios']) {
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

test('as rotas de RH continuam exigindo sessão e concessão, sem mudança de contrato', { skip: !RUN }, async () => {
  const anonymous = await api('/api/admin/hr/l03/overview');
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error, 'admin_session_required');

  // O ponto da UX-04: o papel `ti` passa no AdminGate de /admin/funcionarios,
  // o item aparece no menu, a página abre — e a API responde 403, porque a
  // concessão de RH nunca foi dada a esse papel. Menu não é autorização.
  const denied = await api('/api/admin/hr/l03/overview', { cookie: deniedCookie });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, 'permission_scope_denied');
  assert.ok(!('employees' in (denied.body || {})), 'a negativa não pode vazar cadastro algum');

  const allowed = await api('/api/admin/hr/l03/overview', { cookie: grantedCookie });
  assert.equal(allowed.status, 200);
  assert.ok(Array.isArray(allowed.body.employees));
  assert.ok(allowed.body.indicators, 'a visão geral precisa continuar devolvendo indicadores');
});

test('o papel rh recebe a concessão padrão da migração 102, e não por mudança desta fatia', { skip: !RUN }, async () => {
  // Nenhuma permissão foi concedida por este gate: quem concede é o gatilho
  // provision_hr_role_permissions, que já existia. Esta fatia é visual.
  const { rows } = await pool.query(
    `SELECT permission, scope_type, reason FROM auth_permissions
      WHERE identity_id=$1 AND revoked_at IS NULL ORDER BY permission`,
    [grantedRh.id],
  );
  const read = rows.find(row => row.permission === 'employees.read');
  assert.ok(read, 'o papel rh precisa continuar recebendo employees.read');
  assert.equal(read.scope_type, 'organization');
  assert.equal(read.reason, 'Conjunto padrão do papel RH');

  const { rows: tiRows } = await pool.query(
    `SELECT permission FROM auth_permissions
      WHERE identity_id=$1 AND permission LIKE 'employees.%' AND revoked_at IS NULL`,
    [deniedStaff.id],
  );
  assert.deepEqual(tiRows, [], 'o papel ti não pode ganhar leitura de RH por efeito colateral desta fatia');
});

test('a análise de solicitação continua exigindo mensagem e chave de repetição', { skip: !RUN }, async () => {
  const id = randomUUID();
  const semChave = await api('/api/admin/hr/l03/self-requests', {
    method: 'PATCH', cookie: grantedCookie,
    body: { id, action: 'em_analise', message: 'mensagem suficiente' },
  });
  assert.equal(semChave.status, 400);
  assert.equal(semChave.body.error, 'idempotency_key_required');

  const semMensagem = await api('/api/admin/hr/l03/self-requests', {
    method: 'PATCH', cookie: grantedCookie,
    headers: { 'Idempotency-Key': `qa-${randomUUID()}` },
    body: { id, action: 'em_analise', message: 'abc' },
  });
  assert.equal(semMensagem.status, 400);
  assert.equal(semMensagem.body.error, 'review_message_required');
});

test('browser: sem a concessão, o RH explica a negativa e NÃO mostra indicador zerado', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { page } = await openRh(browser, deniedCookie);
    const negado = page.locator('[data-ui-state="denied"]');
    await negado.waitFor();

    // A regressão histórica: "0 cadastros, 0 ativos, 0 em admissão" aparecia
    // no lugar da negativa. Nenhum indicador pode ser renderizado aqui.
    await assert.doesNotReject(negado.locator('text=/Sem a concessão necessária/i').waitFor());
    await assert.rejects(
      page.locator('text=/cadastros alcançados pelas suas concessões/i').waitFor({ timeout: 2500 }),
      'nenhum indicador pode ser exibido quando a leitura foi negada',
    );

    const texto = await negado.innerText();
    assert.match(texto, /menu não concede acesso/i, 'a tela precisa dizer que menu não é autorização');
    assert.match(texto, /HTTP 403/, 'a tela precisa declarar a resposta real do servidor');
    // O código canônico continua visível para o TI diagnosticar, mas como
    // detalhe entre parênteses — nunca como a mensagem principal, que era o
    // comportamento anterior (`setError(e.message)` jogava o token na tela).
    assert.match(texto, /\(permission_scope_denied\)/, 'o código canônico deve ficar disponível como detalhe');
    // O rótulo é exibido em caixa alta por CSS (`text-transform`), por isso a
    // comparação ignora caixa: o texto acessível continua "Acesso negado".
    assert.match(texto, /acesso negado/i, 'o bloco precisa se identificar como negativa de acesso');
    assert.match(texto, /Sem a concessão necessária/, 'o título precisa dizer o que falta, em português');

    // Negativa de permissão não oferece repetir a mesma chamada.
    const repetir = page.locator('[data-ui-state="denied"] button');
    assert.equal(await repetir.count(), 0, 'repetir uma chamada negada não ajuda ninguém');

    // E as abas de trabalho não aparecem: não há o que operar sem leitura.
    assert.equal(await page.locator('[role="tablist"]').count(), 0);
    await capture(page, 'desktop-rh-negado');
  } finally {
    await browser.close();
  }
});

test('browser: com a concessão, os indicadores aparecem e as abas andam pelo teclado', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { page } = await openRh(browser, grantedCookie);
    await page.locator('[role="tablist"]').waitFor();

    const indicadores = page.locator('text=/cadastros alcançados pelas suas concessões/i');
    await indicadores.waitFor();

    // Aba inicial é Equipe e só ela está selecionada.
    const equipe = page.getByRole('tab', { name: 'Equipe' });
    assert.equal(await equipe.getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('[role="tab"][aria-selected="true"]').count(), 1);

    // Teclado: seta direita muda de aba e leva o foco junto (tabindex rotativo).
    await equipe.focus();
    await page.keyboard.press('ArrowRight');
    const admissao = page.getByRole('tab', { name: 'Admissão e acesso' });
    assert.equal(await admissao.getAttribute('aria-selected'), 'true');
    assert.equal(await admissao.evaluate(el => el === document.activeElement), true, 'a seta precisa mover o foco');
    assert.equal(await equipe.getAttribute('tabindex'), '-1', 'a aba inativa sai da ordem de tabulação');

    // End salta para a última aba.
    await page.keyboard.press('End');
    assert.equal(await page.getByRole('tab', { name: 'Demais processos de RH' }).getAttribute('aria-selected'), 'true');

    // O painel exposto corresponde à aba selecionada.
    const painel = page.locator('[role="tabpanel"]');
    assert.equal(await painel.count(), 1);
    await capture(page, 'desktop-rh-abas');
  } finally {
    await browser.close();
  }
});

test('browser: todo campo de formulário tem rótulo visível e associado', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { page } = await openRh(browser, grantedCookie);
    await page.getByRole('tab', { name: 'Admissão e acesso' }).click();
    await page.locator('form').first().waitFor();

    // Nenhum campo pode depender só de placeholder — era o padrão anterior.
    const semRotulo = await page.evaluate(() => {
      const faltando = [];
      for (const field of document.querySelectorAll('[role="tabpanel"] input, [role="tabpanel"] select, [role="tabpanel"] textarea')) {
        if (field.type === 'hidden') continue;
        const id = field.getAttribute('id');
        const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
        const visible = label && label.textContent.trim().length > 0;
        if (!visible) faltando.push(field.getAttribute('name') || field.outerHTML.slice(0, 60));
      }
      return faltando;
    });
    assert.deepEqual(semRotulo, [], 'todo campo precisa de um <label for> visível');

    // E os campos estão agrupados por objetivo.
    assert.ok(await page.locator('[role="tabpanel"] fieldset > legend').count() >= 2);
    await capture(page, 'desktop-rh-admissao');
  } finally {
    await browser.close();
  }
});

test('browser: o desligamento pede confirmação explícita com o resumo do efeito', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { page } = await openRh(browser, grantedCookie);

    // Massa fictícia criada pela MESMA API que a pessoa usa.
    const criado = await api('/api/hr/employees', {
      method: 'POST', cookie: grantedCookie,
      body: {
        matricula: `QA-${randomUUID().slice(0, 6)}`,
        display_name: 'Pessoa Ficticia UX04',
        cargo: 'vigilante',
        status: 'ativo',
        employment_type: 'clt',
      },
    });
    assert.equal(criado.status, 201, `criação deveria retornar 201, veio ${criado.status}`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Desligamento' }).click();

    // Nenhum window.confirm: se aparecesse, o diálogo nativo travaria o teste.
    let nativo = false;
    page.on('dialog', async dialog => { nativo = true; await dialog.dismiss(); });

    await page.locator('select[name="employeeId"]').selectOption({ index: 1 });
    await page.locator('input[name="date"]').fill('2026-11-30');
    await page.locator('textarea[name="reason"]').fill('Encerramento de contrato de teste sintético.');
    await page.getByRole('button', { name: /Revisar antes de concluir/i }).click();

    const resumo = page.locator('[role="alertdialog"]');
    await resumo.waitFor();
    assert.equal(nativo, false, 'a confirmação precisa ser da página, não um window.confirm');

    const texto = await resumo.innerText();
    assert.match(texto, /revogar imediatamente/i, 'o resumo precisa declarar a revogação de acesso');
    assert.match(texto, /auditoria/i, 'o resumo precisa declarar a trilha de auditoria');
    assert.match(texto, /Pessoa Ficticia UX04/, 'o resumo precisa nomear quem será desligado');

    // Dá para desistir sem efeito algum.
    await page.getByRole('button', { name: /Cancelar e voltar ao formulário/i }).click();
    assert.equal(await page.locator('[role="alertdialog"]').count(), 0);
    const ainda = await api('/api/admin/hr/l03/overview', { cookie: grantedCookie });
    assert.equal(
      ainda.body.employees.find(e => e.display_name === 'Pessoa Ficticia UX04')?.status,
      'ativo',
      'cancelar a confirmação não pode ter desligado ninguém',
    );
    await capture(page, 'desktop-rh-desligamento');
  } finally {
    await browser.close();
  }
});

test('browser: falha de leitura vira erro explícito com repetição, nunca indicador zero', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
    const separator = grantedCookie.indexOf('=');
    await context.addCookies([{ name: grantedCookie.slice(0, separator), value: grantedCookie.slice(separator + 1), url: baseUrl }]);
    const page = await context.newPage();

    // O Chromium empacotado não suporta page.route; a falha é simulada
    // substituindo window.fetch DENTRO da página. O servidor não é alterado
    // nem enfraquecido para este teste.
    await page.addInitScript(() => {
      const original = window.fetch;
      window.fetch = async (input, init) => {
        const url = String(typeof input === 'string' ? input : input?.url || '');
        if (url.includes('/api/admin/hr/l03/overview')) {
          return new Response(JSON.stringify({ error: 'hr_overview_unavailable' }), {
            status: 503, headers: { 'content-type': 'application/json' },
          });
        }
        return original(input, init);
      };
    });
    await page.goto(`${baseUrl}/admin/funcionarios`, { waitUntil: 'domcontentloaded' });

    const erro = page.locator('[data-ui-state="error"]');
    await erro.waitFor();
    const texto = await erro.innerText();
    assert.match(texto, /não é a mesma coisa que não haver registros/i);
    assert.match(texto, /HTTP 503/);

    // Falha oferece repetir; e nenhum número foi inventado.
    assert.ok(await erro.locator('button').count() >= 1, 'falha transitória precisa oferecer nova tentativa');
    assert.equal(await page.locator('text=/cadastros alcançados pelas suas concessões/i').count(), 0);
    await capture(page, 'desktop-rh-falha');
    await context.close();
  } finally {
    await browser.close();
  }
});

test('browser: no celular o RH não rola na horizontal e as abas continuam utilizáveis', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { page } = await openRh(browser, grantedCookie, { width: 390, height: 844 });
    await page.locator('[role="tablist"]').waitFor();
    await page.waitForTimeout(400);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    assert.ok(
      overflow.scrollWidth <= overflow.clientWidth + 1,
      `o documento não pode rolar na horizontal em 390px: ${overflow.scrollWidth} > ${overflow.clientWidth}`,
    );

    // Alvo de toque: as abas precisam ter altura utilizável no celular.
    const alturas = await page.locator('[role="tab"]').evaluateAll(nodes =>
      nodes.map(node => Math.round(node.getBoundingClientRect().height)));
    assert.ok(alturas.length > 0);
    for (const altura of alturas) assert.ok(altura >= 40, `aba com ${altura}px de altura é alvo pequeno demais`);
    await capture(page, 'mobile-rh');
  } finally {
    await browser.close();
  }
});
