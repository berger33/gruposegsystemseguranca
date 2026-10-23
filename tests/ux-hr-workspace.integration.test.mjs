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
  const executablePath = process.env.UX_HR_BROWSER_EXECUTABLE_PATH;
  if (executablePath) return await playwrightChromium.launch({ executablePath, headless: true });
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

    // O painel exposto corresponde à aba selecionada. A aba "Demais processos"
    // traz um tablist aninhado (os sete componentes legados), que tem o seu
    // próprio tabpanel — por isso a contagem é feita por nível, e não no
    // documento inteiro.
    assert.equal(await page.locator('[id^="rh-painel-"][role="tabpanel"]').count(), 1,
      'só o painel da aba externa ativa fica montado');
    assert.equal(await page.locator('[id^="rh-legado-painel-"][role="tabpanel"]').count(), 1,
      'o tablist aninhado dos processos legados expõe exatamente um painel');
    assert.equal(await page.locator('[role="tabpanel"]').count(), 2,
      'nenhum outro tabpanel órfão pode existir na página');
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

// ---------------------------------------------------------------------------
// Pendências herdadas da UX-04, agora percorridas ponta a ponta na interface.
// O relatório final de 05/10 registrava que Escala, Documentos e Fechamento
// tinham recebido linguagem e estados, mas NÃO haviam sido percorridas na tela
// com massa criada pelas próprias APIs. Os testes abaixo fecham isso.
// ---------------------------------------------------------------------------

/** Cria uma pessoa fictícia pela mesma API da interface e devolve o registro. */
async function pessoaFicticia(sufixo) {
  const criado = await api('/api/hr/employees', {
    method: 'POST', cookie: grantedCookie,
    body: {
      matricula: `QA-${sufixo}-${randomUUID().slice(0, 6)}`,
      display_name: `Pessoa ${sufixo}`,
      cargo: 'vigilante',
      status: 'ativo',
      employment_type: 'clt',
    },
  });
  assert.equal(criado.status, 201, `criação deveria retornar 201, veio ${criado.status}`);
  return criado.body.employee || criado.body;
}

test('browser: a aba Escala publica a versão ponta a ponta e o plantão fica no banco', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const pessoa = await pessoaFicticia('Escala');
    const { page } = await openRh(browser, grantedCookie);
    await page.getByRole('tab', { name: 'Escala' }).click();
    await page.locator('form').first().waitFor();

    const titulo = `Escala sintética ${randomUUID().slice(0, 8)}`;
    await page.locator('input[name="title"]').fill(titulo);
    await page.locator('input[name="periodStart"]').fill('2026-11-01');
    await page.locator('input[name="periodEnd"]').fill('2026-11-30');
    await page.locator('select[name="employeeId"]').selectOption(pessoa.id);
    await page.locator('input[name="location"]').fill('Posto sintético 1');
    await page.locator('input[name="entryDate"]').fill('2026-11-10');
    await page.locator('input[name="startTime"]').fill('07:00');
    await page.locator('input[name="endTime"]').fill('19:00');
    await page.getByRole('button', { name: /Criar versão, incluir turno e publicar/i }).click();

    // A confirmação é dita na tela, e diz o que NÃO aconteceu.
    const aviso = page.locator('[role="status"]', { hasText: /Escala versionada e publicada/i });
    await aviso.waitFor({ timeout: 30_000 });
    assert.match(await aviso.innerText(), /ciência da pessoa continua pendente/i,
      'publicar escala não pode dar a ciência da pessoa como feita');

    // E o efeito existe no PostgreSQL real, não apenas na tela.
    const { rows } = await pool.query(
      'SELECT status FROM emp_schedule_versions WHERE title = $1', [titulo]);
    assert.equal(rows.length, 1, 'a versão de escala precisa ter sido gravada');
    assert.equal(rows[0].status, 'publicado', 'a versão precisa terminar publicada');

    const plantao = await pool.query(
      'SELECT count(*)::int AS total FROM emp_shift_assignments WHERE employee_id = $1 AND shift_date = $2',
      [pessoa.id, '2026-11-10']);
    assert.equal(plantao.rows[0].total, 1, 'o plantão publicado precisa existir para a pessoa');
    await capture(page, 'desktop-rh-escala-publicada');
  } finally {
    await browser.close();
  }
});

test('browser: a aba Documentos aprova um envio real e a situação muda na tabela', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const pessoa = await pessoaFicticia('Documento');
    const conteudo = Buffer.from('documento sintetico de teste', 'utf8').toString('base64');
    const enviado = await api('/api/admin/hr/l03/documents', {
      method: 'POST', cookie: grantedCookie,
      body: {
        employeeId: pessoa.id,
        filename: 'comprovante.txt',
        contentType: 'text/plain',
        contentBase64: conteudo,
        documentKind: 'submission',
        category: 'admissao',
        title: 'Comprovante sintético UX-06',
      },
    });
    assert.equal(enviado.status, 201, `envio deveria retornar 201, veio ${enviado.status}`);

    const { page } = await openRh(browser, grantedCookie);
    await page.getByRole('tab', { name: 'Documentos' }).click();
    const linha = page.locator('tr', { hasText: 'Comprovante sintético UX-06' });
    await linha.waitFor();

    // Antes: a tabela mostra a situação canônica traduzida, não o token cru.
    assert.doesNotMatch(await linha.innerText(), /\bsubmitted\b|\bapproved\b/,
      'a tabela não pode exibir o valor canônico cru na coluna de situação');

    await linha.getByRole('button', { name: /Aprovar/i }).click();
    const aviso = page.locator('[role="status"]', { hasText: /aprovado após revisão/i });
    await aviso.waitFor({ timeout: 30_000 });

    const { rows } = await pool.query(
      'SELECT status FROM employee_private_documents WHERE id = $1', [enviado.body.document.id]);
    assert.equal(rows[0].status, 'approved', 'a aprovação precisa ter sido gravada');
    await capture(page, 'desktop-rh-documento-aprovado');
  } finally {
    await browser.close();
  }
});

test('browser: RH rejeita um documento com motivo obrigatório e registra o motivo no banco', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const pessoa = await pessoaFicticia('DocumentoRejeitado');
    const enviado = await api('/api/admin/hr/l03/documents', {
      method: 'POST', cookie: grantedCookie,
      body: {
        employeeId: pessoa.id,
        filename: 'documento-rejeitado.txt',
        contentType: 'text/plain',
        contentBase64: Buffer.from('documento sintetico para rejeicao', 'utf8').toString('base64'),
        documentKind: 'submission',
        category: 'admissao',
        title: 'Documento sintético para devolução',
      },
    });
    assert.equal(enviado.status, 201, `envio deveria retornar 201, veio ${enviado.status}`);

    const { page } = await openRh(browser, grantedCookie);
    await page.getByRole('tab', { name: 'Documentos' }).click();
    const linha = page.locator('tr', { hasText: 'Documento sintético para devolução' });
    await linha.waitFor();
    const motivo = 'Envie novamente com assinatura legível.';
    await linha.getByLabel('Motivo da rejeição').focus();
    await page.keyboard.type(motivo);
    await linha.getByRole('button', { name: /Rejeitar/i }).click();
    await page.locator('[role="status"]', { hasText: /rejeitado/i }).waitFor({ timeout: 30_000 });

    const { rows } = await pool.query(
      'SELECT status,rejection_reason FROM employee_private_documents WHERE id = $1', [enviado.body.document.id]);
    assert.equal(rows[0].status, 'rejected');
    assert.equal(rows[0].rejection_reason, motivo);
    await capture(page, 'desktop-rh-documento-rejeitado');
  } finally {
    await browser.close();
  }
});

test('browser: a aba Fechamento fecha a competência e diz que não houve pagamento', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { page } = await openRh(browser, grantedCookie);
    await page.getByRole('tab', { name: 'Fechamento e holerite' }).click();
    // Há dois campos de competência na aba (fechar período e publicar
    // holerite); o alvo é o do formulário de fechamento, identificado pelo
    // próprio rótulo.
    const campo = page.getByRole('textbox', { name: 'Competência' }).first();
    await campo.waitFor();

    const competencia = `2026-${String(1 + Math.floor(Math.random() * 9)).padStart(2, '0')}`;
    await campo.fill(competencia);
    await page.getByRole('button', { name: /Validar divergências e fechar/i }).click();

    const aviso = page.locator('[role="status"]', { hasText: /Competência demonstrativa fechada/i });
    await aviso.waitFor({ timeout: 30_000 });
    // A frase que impede a leitura errada: fechar não é pagar.
    assert.match(await aviso.innerText(), /não um pagamento/i,
      'o fechamento precisa declarar que nenhum pagamento foi executado');

    const { rows } = await pool.query(
      'SELECT count(*)::int AS total FROM hr_dp_closures WHERE competence = $1', [competencia]);
    assert.ok(rows[0].total >= 1, 'o fechamento precisa ter sido gravado');
    await capture(page, 'desktop-rh-fechamento');
  } finally {
    await browser.close();
  }
});

test('browser: as abas dos processos legados são um tablist de verdade e dizem que são legado', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const { page } = await openRh(browser, grantedCookie);
    await page.getByRole('tab', { name: 'Demais processos de RH' }).click();

    const interno = page.locator('[role="tablist"][aria-label="Grupos de processos de RH"]');
    await interno.waitFor();
    const abas = interno.getByRole('tab');
    assert.equal(await abas.count(), 7, 'são sete grupos de processos legados');

    // Pendência herdada: este tablist não tinha roving tabindex nem teclado.
    assert.equal(await interno.locator('[role="tab"][tabindex="0"]').count(), 1);
    assert.equal(await interno.locator('[role="tab"][tabindex="-1"]').count(), 6);

    const primeira = abas.first();
    await primeira.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await abas.nth(1).getAttribute('aria-selected'), 'true');
    assert.equal(await abas.nth(1).evaluate(el => el === document.activeElement), true,
      'a seta precisa mover o foco junto com a seleção');
    await page.keyboard.press('End');
    assert.equal(await abas.nth(6).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await abas.nth(0).getAttribute('aria-selected'), 'true');

    // O conteúdo legado agora tem dono acessível e está rotulado como legado.
    const painel = page.locator('[id^="rh-legado-painel-"]');
    assert.equal(await painel.count(), 1, 'o conteúdo legado precisa de um tabpanel');
    assert.equal(await painel.getAttribute('role'), 'tabpanel');
    assert.match(await painel.innerText(), /Tela legada, exibida como está/i,
      'a tela precisa dizer que aquilo é legado, em vez de disfarçar');
    await capture(page, 'desktop-rh-legado');
  } finally {
    await browser.close();
  }
});

test('browser: falha ao ler solicitações do RH não vira vazio e permite repetir', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    const separator = grantedCookie.indexOf('=');
    await context.addCookies([{ name: grantedCookie.slice(0, separator), value: grantedCookie.slice(separator + 1), url: baseUrl }]);
    const page = await context.newPage();
    let retryRequested = false;
    let interceptedRequestUrl = null;
    await context.route('**/api/admin/hr/l03/self-requests**', async route => {
      interceptedRequestUrl = route.request().url();
      if (!retryRequested) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'employee_request_list_unavailable' }),
        });
        return;
      }
      await route.continue();
    });
    await page.goto(`${baseUrl}/admin/funcionarios`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Solicitações' }).click();

    assert.ok(interceptedRequestUrl, 'o navegador precisa consultar a rota canônica da fila do RH');
    const falha = page.getByRole('alert').filter({ hasText: 'não é possível confirmar se houve novas solicitações' });
    await falha.waitFor();
    assert.equal(await page.getByText('Nenhuma solicitação no seu escopo', { exact: true }).count(), 0,
      'falha de consulta não pode ser apresentada como fila vazia');
    assert.equal(await falha.getByRole('button', { name: /Tentar carregar novamente/i }).count(), 1,
      'falha transitória precisa permitir nova leitura');
    await capture(page, 'desktop-rh-solicitacoes-falha');

    retryRequested = true;
    await falha.getByRole('button', { name: /Tentar carregar novamente/i }).click();
    await page.locator('[data-ui-state="empty"]').waitFor();
    assert.equal(await page.locator('[data-ui-state="error"]').count(), 0,
      'após uma resposta 200 vazia, só então a interface pode mostrar fila vazia');
    await capture(page, 'mobile-rh-solicitacoes-vazio');
    await context.close();
  } finally {
    await browser.close();
  }
});

test('browser: Ponto e ajustes distingue negativa 403 e falha 503 de fila vazia, preserva fila carregada e rotula controles', { skip: !RUN }, async () => {
  const browserNegado = await launchBrowser();
  let browserFalha;
  try {
    const pessoa = await pessoaFicticia('PontoAjuste');
    const email = `ponto-${randomUUID().slice(0, 8)}@exemplo.invalid`;
    const acesso = await api(`/api/admin/hr/employees/${pessoa.id}/access`, {
      method: 'POST', cookie: grantedCookie, body: { email },
    });
    assert.equal(acesso.status, 201);
    const loginTemp = await api('/api/employee/session', {
      method: 'POST', body: { email, password: acesso.body.temporaryPassword },
    });
    assert.equal(loginTemp.status, 200);
    const tempCookie = loginTemp.setCookie.find(c => c.startsWith('seg_employee_session='))?.split(';')[0];
    const senhaDefinitiva = `Ponto-${randomUUID()}!`;
    const troca = await api('/api/employee/session/password', {
      method: 'PUT', cookie: tempCookie,
      body: { currentPassword: acesso.body.temporaryPassword, newPassword: senhaDefinitiva },
    });
    assert.equal(troca.status, 200);
    const loginEmp = await api('/api/employee/session', {
      method: 'POST', body: { email, password: senhaDefinitiva },
    });
    assert.equal(loginEmp.status, 200);
    const empCookie = loginEmp.setCookie.find(c => c.startsWith('seg_employee_session='))?.split(';')[0];

    const posicao = () => ({ latitude: -23.55052, longitude: -46.63331, accuracy: 12, positionAt: new Date().toISOString() });
    const entrada = await api('/api/employee/time-clock', {
      method: 'POST', cookie: empCookie,
      body: { requestId: randomUUID(), kind: 'entrada', position: posicao() },
    });
    assert.equal(entrada.status, 201);
    const saida = await api('/api/employee/time-clock', {
      method: 'POST', cookie: empCookie,
      body: { requestId: randomUUID(), kind: 'saida', position: posicao() },
    });
    assert.equal(saida.status, 201);

    const motivoPedido = `Ajuste sintético ${randomUUID().slice(0, 8)} para validar estado de erro`;
    const pedido = await api('/api/employee/actions/time-correction', {
      method: 'POST', cookie: empCookie,
      body: {
        timeEntryId: entrada.body.timeEntryId,
        reason: motivoPedido,
        requestedChanges: { clock_in: '08:00', clock_out: '17:00' },
      },
    });
    assert.equal(pedido.status, 201);

    // 1. Concessão fina real no PostgreSQL: equipe apenas com employees.read abre a aba, vê o pedido,
    //    recebe 403 real ao tentar decidir (sem employees.write) e, se employees.read é revogada, vê estado negado.
    const leitorRh = await provisionStaff(pool, { role: 'marcelo' });
    await pool.query(
      `DELETE FROM auth_permissions WHERE identity_id = $1 AND permission = 'employees.write'`,
      [leitorRh.id],
    );
    await pool.query(
      `INSERT INTO auth_permissions (identity_id, permission, scope_type, reason)
       SELECT $1, 'employees.read', 'organization', 'Leitura sintética de auditoria'
       WHERE NOT EXISTS (
         SELECT 1 FROM auth_permissions WHERE identity_id = $1 AND permission = 'employees.read' AND revoked_at IS NULL
       )`,
      [leitorRh.id],
    );
    const leitorCookie = await loginHttp(leitorRh.email);
    const negado = await openRh(browserNegado, leitorCookie, { width: 390, height: 844 });
    await negado.page.getByRole('tab', { name: 'Ponto e ajustes' }).click();
    const cardLeitor = negado.page.locator('[role="tabpanel"] article').filter({ hasText: motivoPedido });
    await cardLeitor.waitFor();
    await cardLeitor.getByRole('button', { name: 'Colocar em análise' }).click();
    const erroEscrita = cardLeitor.getByRole('alert');
    await erroEscrita.waitFor();
    assert.match(await erroEscrita.innerText(), /HTTP 403 \(permission_scope_denied\)/);
    assert.match(await erroEscrita.innerText(), /Nada foi gravado por esta tentativa/i);

    await pool.query(
      `UPDATE auth_permissions SET revoked_at = now() WHERE identity_id = $1 AND permission = 'employees.read'`,
      [leitorRh.id],
    );
    await negado.page.getByRole('button', { name: 'Atualizar pedidos' }).click();
    const alertaNegado = negado.page.locator('[role="tabpanel"] [data-ui-state="denied"]');
    await alertaNegado.waitFor();
    assert.match(await alertaNegado.innerText(), /permission_scope_denied/);
    assert.equal(await negado.page.getByText('Nenhum pedido no seu escopo de acesso', { exact: true }).count(), 0);
    assert.equal(await alertaNegado.getByRole('button', { name: /Tentar carregar novamente/i }).count(), 0);
    await browserNegado.close();

    // 2. Falha 503 inicial não vira fila vazia, oferece repetir, e falha posterior preserva a fila carregada.
    browserFalha = await launchBrowser();
    const context = await browserFalha.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    const separator = grantedCookie.indexOf('=');
    await context.addCookies([{ name: grantedCookie.slice(0, separator), value: grantedCookie.slice(separator + 1), url: baseUrl }]);
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);
    await page.addInitScript(() => {
      window.__uxFailTimeCorrections = true;
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        const method = (init?.method || 'GET').toUpperCase();
        if (window.__uxFailTimeCorrections && method === 'GET' && url.includes('/api/admin/hr/l03/time-corrections')) {
          return new Response(JSON.stringify({ error: 'time_clock_unavailable' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          });
        }
        return original(input, init);
      };
    });

    await page.goto(`${baseUrl}/admin/funcionarios`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Ponto e ajustes' }).click();

    const alertaFalha = page.locator('[role="tabpanel"] [data-ui-state="error"]');
    await alertaFalha.waitFor();
    assert.match(await alertaFalha.innerText(), /Serviço de ponto indisponível/i);
    assert.match(await alertaFalha.innerText(), /HTTP 503 \(time_clock_unavailable\)/);
    assert.equal(await page.getByText('Nenhum pedido no seu escopo de acesso', { exact: true }).count(), 0,
      'falha 503 inicial jamais pode ser exibida como fila vazia');
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    await capture(page, 'ux-pro-05-ponto-rh-390-error');

    await page.evaluate(() => { window.__uxFailTimeCorrections = false; });
    await alertaFalha.getByRole('button', { name: /Tentar carregar novamente/i }).click();

    const card = page.locator('[role="tabpanel"] article').filter({ hasText: motivoPedido });
    await card.waitFor();
    assert.match(await card.innerText(), /Aguardando análise/i);
    assert.doesNotMatch(await card.innerText(), /\bsolicitado\b/,
      'o cartão não deve exibir o token cru solicitado fora dos detalhes técnicos recolhidos');

    const semRotulo = await page.evaluate(() => {
      const faltando = [];
      for (const field of document.querySelectorAll('[role="tabpanel"] input, [role="tabpanel"] select, [role="tabpanel"] textarea')) {
        if (field.type === 'hidden') continue;
        const id = field.getAttribute('id');
        const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
        const visible = label && label.textContent.trim().length > 0;
        if (!visible) faltando.push(field.getAttribute('id') || field.outerHTML.slice(0, 80));
      }
      return faltando;
    });
    assert.deepEqual(semRotulo, [], 'todo controle em Ponto e ajustes precisa de <label for> visível');

    // Simula queda posterior ao recarregar: o cartão já carregado permanece visível junto ao alerta.
    await page.evaluate(() => { window.__uxFailTimeCorrections = true; });
    await page.getByRole('button', { name: 'Atualizar pedidos' }).click();
    await page.locator('[role="tabpanel"] [data-ui-state="error"]').waitFor();
    assert.match(await page.locator('[role="tabpanel"] [data-ui-state="error"]').innerText(), /lista anterior foi preservada/i);
    assert.equal(await card.count(), 1, 'falha posterior não pode apagar os pedidos já carregados');
    await capture(page, 'ux-pro-05-ponto-rh-390-preserved-after-error');
  } finally {
    await browserNegado.close().catch(() => {});
    await browserFalha?.close().catch(() => {});
  }
});

test('browser: Documentos: falha de leitura preserva lista, loading e vazio só após 200', { skip: !RUN }, async () => {
  const browser = await launchBrowser();
  let context;
  let releaseDocuments = null;
  try {
    const pessoa = await pessoaFicticia('DocumentoLeitura');
    const title = `Documento sintético leitura ${randomUUID().slice(0, 8)}`;
    const uploaded = await api('/api/admin/hr/l03/documents', {
      method: 'POST', cookie: grantedCookie,
      body: {
        employeeId: pessoa.id,
        filename: 'documento-leitura.txt',
        contentType: 'text/plain',
        contentBase64: Buffer.from('documento sintetico para estados de leitura', 'utf8').toString('base64'),
        documentKind: 'submission',
        category: 'admissao',
        title,
      },
    });
    assert.equal(uploaded.status, 201);

    context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    const separator = grantedCookie.indexOf('=');
    await context.addCookies([{ name: grantedCookie.slice(0, separator), value: grantedCookie.slice(separator + 1), url: baseUrl }]);
    let mode = 'error';
    await context.route('**/api/admin/hr/l03/documents', async route => {
      if (route.request().method() !== 'GET') return route.continue();
      if (mode === 'hold') {
        await new Promise(resolve => { releaseDocuments = resolve; });
      }
      if (mode === 'error') {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'document_list_unavailable' }),
        });
      }
      if (mode === 'empty') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ documents: [] }),
        });
      }
      return route.continue();
    });

    const page = await context.newPage();
    page.setDefaultTimeout(45_000);
    const prefix = process.env.UX_HR_EVIDENCE_PREFIX || 'ux-pro-05-documentos-leitura';
    await page.goto(`${baseUrl}/admin/funcionarios`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Documentos' }).click();
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const panel = page.locator('#rh-painel-documentos');

    // A captura antecede a asserção para preservar também a evidência do RED.
    await capture(page, `${prefix}-erro-inicial-390-day`);
    const initialError = panel.locator('[data-ui-state="error"]');
    assert.equal(await initialError.count(), 1, '503 inicial precisa aparecer como erro, não como lista vazia');
    assert.match(await initialError.innerText(), /HTTP 503 \(document_list_unavailable\)/);
    assert.equal(await panel.getByText('Nenhum documento no seu escopo', { exact: true }).count(), 0);

    mode = 'success';
    const firstRetry = initialError.getByRole('button', { name: /Tentar carregar novamente/i });
    await firstRetry.focus();
    assert.equal(await firstRetry.evaluate(element => element === document.activeElement), true,
      'a nova tentativa precisa ser alcançável e acionável pelo teclado');
    await page.keyboard.press('Enter');
    const row = panel.locator('tr', { hasText: title });
    await row.waitFor();
    assert.equal(await panel.locator('[data-ui-state="error"]').count(), 0);
    await capture(page, `${prefix}-carregado-390-day`);

    // O PATCH segue real até o PostgreSQL; somente a releitura GET seguinte falha.
    mode = 'error';
    await row.getByRole('button', { name: /Aprovar/i }).click();
    const preservedError = panel.locator('[data-ui-state="error"]');
    await preservedError.waitFor();
    assert.match(await preservedError.innerText(), /lista anterior foi preservada/i);
    assert.match(await preservedError.innerText(), /HTTP 503 \(document_list_unavailable\)/);
    assert.equal(await row.count(), 1, 'a releitura 503 não pode apagar o documento já carregado');
    const persisted = await pool.query(
      'SELECT status FROM employee_private_documents WHERE id=$1',
      [uploaded.body.document.id],
    );
    assert.equal(persisted.rows[0].status, 'approved', 'a injeção afeta somente o GET; o PATCH real permanece íntegro');
    assert.doesNotMatch(
      await preservedError.innerText(),
      /nada foi carregado nem gravado/i,
      'a falha da releitura não pode negar uma gravação que já foi confirmada',
    );

    const viewportEvidence = [];
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.waitForTimeout(120);
      viewportEvidence.push(await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      })));
      await capture(page, `${prefix}-preservado-${width}-day`);
    }
    assert.deepEqual(viewportEvidence.map(value => value.width), [320, 390, 768, 1440]);
    assert.ok(viewportEvidence.every(value => value.overflow <= 1), JSON.stringify(viewportEvidence));

    await page.getByRole('button', { name: 'Ativar modo noite' }).click();
    await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(450);
    const nightOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(nightOverflow <= 1, `tema noturno/390px: overflow ${nightOverflow}px`);
    await capture(page, `${prefix}-preservado-390-night`);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'Ativar modo dia' }).click();
    await page.waitForFunction(() => !document.documentElement.dataset.adminTheme);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(450);

    // Nova tentativa permanece com os dados anteriores visíveis enquanto o GET está pendente.
    mode = 'hold';
    const secondRetry = preservedError.getByRole('button', { name: /Tentar carregar novamente/i });
    await secondRetry.focus();
    await page.keyboard.press('Enter');
    const loading = panel.locator('[data-ui-state="loading"]');
    await loading.waitFor();
    assert.match(await loading.innerText(), /Atualizando os documentos/i);
    assert.equal(await row.count(), 1, 'loading de releitura não pode esconder a última lista conhecida');
    await capture(page, `${prefix}-loading-390-day`);

    mode = 'empty';
    for (let attempt = 0; attempt < 100 && !releaseDocuments; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(releaseDocuments, 'a releitura controlada precisa ter chegado à rota de documentos');
    releaseDocuments();
    const empty = panel.locator('[data-ui-state="empty"]');
    await empty.waitFor();
    assert.match(await empty.innerText(), /consulta foi respondida pelo servidor/i);
    assert.equal(await row.count(), 0, 'somente um 200 vazio pode substituir a lista anterior por vazio');
    assert.equal(await panel.locator('[data-ui-state="error"]').count(), 0);
    assert.equal(await panel.locator('[data-ui-state="loading"]').count(), 0);
    await capture(page, `${prefix}-vazio-390-day`);
  } finally {
    releaseDocuments?.();
    await context?.close().catch(() => {});
    await browser.close().catch(() => {});
  }
});

test('browser: Documentos: negativa HTTP preserva fail-closed e vira denied, nunca vazio', { skip: !RUN }, async () => {
  // Contrato real: quem não tem employees.read não recebe coleção alguma.
  const deniedResponse = await api('/api/admin/hr/l03/documents', { cookie: deniedCookie });
  assert.equal(deniedResponse.status, 403);
  assert.equal(deniedResponse.body.error, 'permission_scope_denied');
  assert.ok(!('documents' in (deniedResponse.body || {})));

  const browser = await launchBrowser();
  let context;
  try {
    const pessoa = await pessoaFicticia('DocumentoNegado');
    const title = `Documento sintético negativa ${randomUUID().slice(0, 8)}`;
    const uploaded = await api('/api/admin/hr/l03/documents', {
      method: 'POST', cookie: grantedCookie,
      body: {
        employeeId: pessoa.id,
        filename: 'documento-negado.txt',
        contentType: 'text/plain',
        contentBase64: Buffer.from('documento sintetico para negativa isolada', 'utf8').toString('base64'),
        documentKind: 'submission',
        category: 'admissao',
        title,
      },
    });
    assert.equal(uploaded.status, 201);

    context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    const separator = grantedCookie.indexOf('=');
    await context.addCookies([{ name: grantedCookie.slice(0, separator), value: grantedCookie.slice(separator + 1), url: baseUrl }]);
    let denyRead = false;
    await context.route('**/api/admin/hr/l03/documents', async route => {
      if (denyRead && route.request().method() === 'GET') {
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'permission_scope_denied' }),
        });
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);
    const prefix = process.env.UX_HR_EVIDENCE_PREFIX || 'ux-pro-05-documentos-leitura';
    await page.goto(`${baseUrl}/admin/funcionarios`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Documentos' }).click();
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
    const panel = page.locator('#rh-painel-documentos');
    const row = panel.locator('tr', { hasText: title });
    await row.waitFor();

    // A visão geral compartilha employees.read; por isso a resposta 403 isolada é injetada
    // somente no GET de documentos para exercitar o estado da aba sem derrubar o workspace.
    denyRead = true;
    const failedRead = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/admin/hr/l03/documents'
      && response.request().method() === 'GET'
      && response.status() === 403);
    await row.getByRole('button', { name: /Aprovar/i }).click();
    await failedRead;
    await page.waitForTimeout(200);
    await capture(page, `${prefix}-denied-390-day`);

    const denied = panel.locator('[data-ui-state="denied"]');
    assert.equal(await denied.count(), 1, '403 isolado precisa ser apresentado como acesso negado');
    assert.match(await denied.innerText(), /HTTP 403 \(permission_scope_denied\)/);
    assert.equal(await denied.getByRole('button', { name: /Tentar carregar novamente/i }).count(), 0);
    assert.equal(await row.count(), 0, 'perda de autorização não pode manter documentos sensíveis na tela');
    assert.equal(await panel.getByText('Nenhum documento no seu escopo', { exact: true }).count(), 0,
      'negativa não pode virar confirmação de vazio');
  } finally {
    await context?.close().catch(() => {});
    await browser.close().catch(() => {});
  }
});
