// UX-PRO-06 (cadastros centrais de clientes) — gate da tela `/admin/clientes`,
// por HTTP real contra PostgreSQL real (executado por
// scripts/qa-ux-client-admin-postgres.mjs, que sobe um cluster descartável) e
// por Chromium real.
//
// O que este gate prova:
//  - o contrato de acesso da área continua decidido no SERVIDOR: 401 sem
//    sessão e 403 para papel sem acesso (`rh`), sem que a tela invente uma
//    permissão que a sessão não tem;
//  - o defeito central desta fatia: a leitura dos cadastros centrais
//    (`GET /api/admin/client-accounts`) falhava em silêncio. Sem leitura
//    concluída, a seção exibia "Carregando cadastros…" PARA SEMPRE — falha
//    apresentada como carregamento; depois de uma leitura concluída, uma falha
//    transitória deixava a lista antiga na tela sem avisar ninguém; e uma
//    NEGATIVA (401/403) na releitura mantinha os cadastros — nomes de clientes
//    — visíveis, falhando ABERTO na tela;
//  - os três estados que estavam confundidos agora são distintos: nunca lido,
//    releitura em curso com dado preservado e falha transitória com faixa
//    `role="alert"`, hora da última leitura concluída e repetição;
//  - negativa de autorização descarta o dado (falha fechada) e não oferece
//    repetir a mesma chamada;
//  - 320/390/768/1440 px em dia e noite não produzem transbordo horizontal, e
//    a seção 1 é alcançável por teclado com foco visível.
//
// O que este gate NÃO prova: aceite humano, homologação de Marcelo/Andreia/TI,
// comportamento em Windows ou no banco do operador. As três suítes de
// backup/CLI que criam symlinks não fazem parte deste recorte.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { recordKeyboardCapture } from '../scripts/ux-pro-00-keyboard-evidence.mjs';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { provisionStaff, STAFF_TEST_PASSWORD } from './helpers/staff-login.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');

let server, baseUrl, pool;
let tiCookie, rhCookie;
let accountName;

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

async function loginStaffHttp(email) {
  const res = await api('/api/admin/session', { method: 'POST', body: { email, password: STAFF_TEST_PASSWORD } });
  assert.equal(res.status, 200, `login deveria retornar 200, veio ${res.status}`);
  const raw = res.setCookie.find(c => c.startsWith('seg_admin_session='));
  assert.ok(raw, 'login precisa emitir o cookie de sessão de equipe');
  return raw.split(';')[0];
}

// O Chromium empacotado roda com --single-process e, nesta máquina, às vezes
// sai com SIGSEGV no próprio lançamento. A segunda tentativa não enfraquece
// asserção alguma: só repete o `launch`.
async function launchBrowser() {
  let ultimo;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      return await playwrightChromium.launch({
        executablePath: await packagedChromium.executablePath(),
        args: packagedChromium.args.filter(arg => arg !== '--disable-web-security'),
        headless: true,
      });
    } catch (erro) {
      ultimo = erro;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw ultimo;
}

// Um crash do navegador NÃO é resultado de teste. `comNavegador` repete a
// sessão inteira quando o Chromium morre (SIGSEGV, alvo fechado), e repassa na
// hora qualquer falha de asserção — nenhuma asserção fica tolerante.
const CRASH = /Target (page|closed)|has been closed|Target crashed|browser has disconnected|crashed|SIGSEGV|Protocol error/i;

async function comNavegador(corpo) {
  let ultimo;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const browser = await launchBrowser();
    try {
      return await corpo(browser);
    } catch (erro) {
      if (erro?.code === 'ERR_ASSERTION' || !CRASH.test(String(erro?.message || ''))) throw erro;
      ultimo = erro;
      console.log(`UX_CLIENT_ADMIN_BROWSER_RETRY tentativa=${tentativa}: ${String(erro.message).split('\n')[0]}`);
    } finally {
      await browser.close().catch(() => {});
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw ultimo;
}

const evidenceDir = process.env.UX_CLIENT_ADMIN_EVIDENCE_DIR || '';
async function capture(page, nome) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage: true });
}

// Critério WCAG 2.1 AA para texto normal: a faixa usa .8125rem.
const CONTRASTE_MINIMO_FAIXA = 4.5;

// Mede o contraste do texto da faixa contra o fundo efetivo, no navegador.
// Mesmo algoritmo WCAG do gate CRM (tests/ux-crm-workspace.integration.test.mjs,
// medição de contraste noturno de /admin/comercial).
async function medirContrasteFaixa(page, seletor) {
  return page.evaluate((sel) => {
    const alvo = document.querySelector(sel);
    if (!alvo) return null;
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
    const cor = (getComputedStyle(alvo).color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    return Math.round(contraste(cor, fundoEfetivo(alvo)) * 100) / 100;
  }, seletor);
}

/**
 * Registra a medição de contraste da faixa na entrada da captura correspondente
 * do resumo.json e devolve a lista de problemas da medição. `problems: []` no
 * resumo é RESULTADO medido — abaixo do critério, o problema entra na lista e o
 * teste reprova; nunca é preenchido como decoração. Preserva as demais
 * entradas/metadados do resumo (mesmo contrato de
 * scripts/ux-pro-00-keyboard-evidence.mjs). Sem diretório de evidência, apenas
 * calcula os problemas, sem escrever arquivo.
 */
async function recordFaixaContraste(directory, measurement) {
  const problems = measurement.contrasteFaixa >= CONTRASTE_MINIMO_FAIXA
    ? []
    : [`contraste da faixa ${measurement.contrasteFaixa}:1 abaixo de ${CONTRASTE_MINIMO_FAIXA}:1 em ${measurement.viewport}`];
  if (!directory) return problems;
  const file = path.join(directory, 'resumo.json');
  let summary;
  try {
    summary = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    summary = {
      stage: measurement.stage,
      generatedBy: 'gate npm run test:ux-client-admin:pg (UX_CLIENT_ADMIN_EVIDENCE_DIR=docs/ux-pro-06-clientes-evidencias)',
      notes: '',
      entries: [],
    };
  }
  if (!Array.isArray(summary.entries)) throw new Error('faixa_evidence_entries_invalid');
  const nomeBase = path.basename(measurement.screenshot);
  let entry = summary.entries.find(item => path.basename(item.screenshot || item.file || '') === nomeBase);
  if (entry) {
    if (entry.viewport !== measurement.viewport) throw new Error('faixa_evidence_viewport_mismatch');
    entry.contrasteFaixa = measurement.contrasteFaixa;
    entry.problems = [...(entry.problems || []), ...problems];
  } else {
    entry = {
      stage: measurement.stage,
      route: measurement.route,
      role: measurement.role,
      viewport: measurement.viewport,
      theme: measurement.theme,
      screenshot: measurement.screenshot,
      problems: [...problems],
      contrasteFaixa: measurement.contrasteFaixa,
    };
    summary.entries.push(entry);
  }
  await mkdir(directory, { recursive: true });
  await writeFile(file, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return entry.problems;
}

/**
 * Abre `/admin/clientes` autenticado. As falhas da leitura dos cadastros são
 * injetadas DENTRO da página, em `window.fetch` (como nos gates irmãos:
 * `page.route()` é instável com este Chromium empacotado). O servidor NUNCA é
 * enfraquecido: a sessão, a autorização e os dados continuam reais.
 *
 * `window.__qaCadastros` é mutável em tempo de execução para o próprio teste
 * ligar/desligar falha, negativa e atraso entre as releituras.
 */
async function abrir(browser, { width = 1440, height = 900, cookie = tiCookie, falhar = false, negar = false, atrasarMs = 0 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  if (cookie) {
    const separador = cookie.indexOf('=');
    await context.addCookies([{ name: cookie.slice(0, separador), value: cookie.slice(separador + 1), url: baseUrl }]);
  }
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(90_000);
  await page.addInitScript(({ falharInicial, negarInicial, atrasoInicial }) => {
    window.__qaCadastros = { falhar: falharInicial, negar: negarInicial, atrasarMs: atrasoInicial, chamadas: 0 };
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input?.url || '');
      const metodo = String(init?.method || 'GET').toUpperCase();
      const listaDeCadastros = url.includes('/api/admin/client-accounts')
        && !/client-accounts\/[0-9a-f-]{36}/i.test(url);
      if (listaDeCadastros && metodo === 'GET') {
        const cfg = window.__qaCadastros;
        cfg.chamadas += 1;
        if (cfg.atrasarMs > 0) await new Promise(r => setTimeout(r, cfg.atrasarMs));
        if (cfg.negar) {
          return new Response(JSON.stringify({ error: 'forbidden' }), {
            status: 403, headers: { 'content-type': 'application/json' },
          });
        }
        if (cfg.falhar) {
          return new Response(JSON.stringify({ error: 'database_not_configured' }), {
            status: 503, headers: { 'content-type': 'application/json' },
          });
        }
      }
      return original(input, init);
    };
  }, { falharInicial: falhar, negarInicial: negar, atrasoInicial: atrasarMs });
  await page.goto(`${baseUrl}/admin/clientes`, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

const secaoCadastros = '[data-testid="clientes-cadastros"]';

// Pré-requisito dos casos: o cadastro criado pela API precisa aparecer na
// lista. A espera é feita na PÁGINA, e não dentro da seção, de propósito: o
// `data-testid` da seção é novo desta fatia e não pode virar a causa da falha
// na medição "antes" (o defeito precisa ser o único motivo de reprovação).
async function aguardarCadastroNaTela(page) {
  await page.getByText(accountName).first().waitFor({ timeout: 45_000 });
}

async function aguardarCadastroVisivel(page) {
  await page.locator(`${secaoCadastros} >> text=${accountName}`).first().waitFor({ timeout: 45_000 });
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
      NEXT_DIST_DIR: '.next/integration-ux-client-admin',
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

  const ti = await provisionStaff(pool, { role: 'ti' });
  const rh = await provisionStaff(pool, { role: 'rh' });
  tiCookie = await loginStaffHttp(ti.email);
  rhCookie = await loginStaffHttp(rh.email);

  // Nome DETERMINÍSTICO de propósito: as capturas de repouso (antes/depois)
  // podem ser comparadas byte a byte entre execuções/versões da tela, como nas
  // fatias irmãs. O banco é novo a cada execução do gate.
  accountName = 'QA UX-PRO-06 Cadastro Central';
  const criado = await api('/api/admin/client-accounts', {
    method: 'POST', cookie: tiCookie,
    body: { displayName: accountName, documentRef: '00.000.000/0001-00', notes: 'Massa sintética do gate UX-PRO-06.' },
  });
  assert.equal(criado.status, 201, `criação sintética deveria retornar 201, veio ${criado.status}`);
});

after(async () => {
  if (!RUN) return;
  await pool?.end().catch(() => {});
  if (server) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
});

test('UX-PRO-06 clientes: 401 sem sessão e 403 para papel sem acesso, decididos no servidor', { skip: !RUN }, async () => {
  const anon = await api('/api/admin/client-accounts');
  assert.equal(anon.status, 401);
  assert.equal(anon.body?.error, 'admin_session_required');
  const rh = await api('/api/admin/client-accounts', { cookie: rhCookie });
  assert.equal(rh.status, 403, 'papel rh não lê cadastros de clientes');
  assert.equal(rh.body?.error, 'forbidden');
  const ti = await api('/api/admin/client-accounts', { cookie: tiCookie });
  assert.equal(ti.status, 200);
  assert.ok(ti.body.accounts.some(account => account.display_name === accountName));
});

test('UX-PRO-06 clientes: falha da leitura inicial não vira "carregando" eterno', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, { falhar: true });
    // 1) A falha precisa ser DECLARADA (na main a seção fica girando para
    //    sempre: este seletor nunca aparece e o teste falha por timeout).
    const falha = page.locator('[data-testid="clientes-cadastros-falha"]');
    await falha.waitFor({ timeout: 45_000 });
    assert.equal(await falha.locator('[data-ui-state="error"]').getAttribute('role'), 'alert');
    assert.match(await falha.innerText(), /Falha na consulta/);
    // 2) Falha não se apresenta como carregamento.
    assert.equal(await page.locator(`${secaoCadastros} >> text=/Carregando cadastros/`).count(), 0,
      'a seção não pode seguir anunciando carregamento depois de falhar');
    // 3) As seções 2–7 dependem desta lista: a tela declara o impacto.
    const aviso = page.locator('[data-testid="clientes-cadastros-indisponivel"]');
    await aviso.waitFor({ timeout: 10_000 });
    assert.equal(await aviso.getAttribute('role'), 'alert');
    assert.match(await aviso.innerText(), /seções 2–7|seletores/i);
    await capture(page, 'clientes-desktop-falha-inicial');
    // 4) Repetir a leitura é de verdade: com o servidor de volta, a lista vem.
    await page.evaluate(() => { window.__qaCadastros.falhar = false; });
    await falha.getByRole('button', { name: /Tentar novamente/ }).click();
    await aguardarCadastroVisivel(page);
    assert.equal(await page.locator('[data-testid="clientes-cadastros-falha"]').count(), 0,
      'a faixa de falha sai quando a leitura conclui');
    await context.close();
  });
});

test('UX-PRO-06 clientes: falha na releitura preserva o que já foi lido, com hora e repetição', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser);
    await aguardarCadastroNaTela(page);
    // Falha transitória DEPOIS de uma leitura concluída.
    await page.evaluate(() => { window.__qaCadastros.falhar = true; });
    await page.getByRole('button', { name: /Recarregar lista/ }).click();
    const faixa = page.locator('[data-testid="clientes-cadastros-desatualizada"]');
    await faixa.waitFor({ timeout: 45_000 });
    assert.equal(await faixa.getAttribute('role'), 'alert');
    const texto = await faixa.innerText();
    assert.match(texto, /última leitura concluída/i);
    assert.match(texto, /\d{1,2}:\d{2}/, 'a faixa precisa dizer a HORA da última leitura concluída');
    // O que já foi lido continua legível — falha não apaga dado.
    await aguardarCadastroVisivel(page);
    await capture(page, 'clientes-desktop-desatualizada');
    // Repetir com o servidor de volta resolve e a faixa sai.
    await page.evaluate(() => { window.__qaCadastros.falhar = false; });
    await faixa.getByRole('button', { name: /Tentar novamente/ }).click();
    await page.locator('[data-testid="clientes-cadastros-desatualizada"]').waitFor({ state: 'detached', timeout: 45_000 });
    await aguardarCadastroVisivel(page);
    await context.close();
  });
});

test('UX-PRO-06 clientes: releitura em curso mantém o conteúdo e anuncia com role="status"', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser);
    await aguardarCadastroNaTela(page);
    await page.evaluate(() => { window.__qaCadastros.atrasarMs = 1500; });
    await page.getByRole('button', { name: /Recarregar lista/ }).click();
    const indicador = page.locator('[data-testid="clientes-cadastros-atualizando"]');
    await indicador.waitFor({ timeout: 20_000 });
    assert.equal(await indicador.getAttribute('role'), 'status');
    // O conteúdo permanece visível durante a releitura (não vira tela de
    // carregamento nem apaga a lista).
    await aguardarCadastroVisivel(page);
    assert.equal(await page.locator(`${secaoCadastros} >> text=/Carregando cadastros/`).count(), 0,
      'releitura com dado preservado não usa o bloco de carregamento em tela cheia');
    await indicador.waitFor({ state: 'detached', timeout: 30_000 });
    await context.close();
  });
});

test('UX-PRO-06 clientes: negativa na releitura descarta o dado e não oferece repetir', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser);
    await aguardarCadastroNaTela(page);
    // A sessão continua válida para o Chromium; quem nega é o servidor, na
    // releitura — exatamente o caso em que a tela não pode seguir mostrando o
    // nome do cliente como se ainda tivesse acesso.
    await page.evaluate(() => { window.__qaCadastros.negar = true; });
    await page.getByRole('button', { name: /Recarregar lista/ }).click();
    const negado = page.locator('[data-testid="clientes-cadastros-negado"]');
    await negado.waitFor({ timeout: 45_000 });
    assert.equal(await negado.locator('[data-ui-state="denied"]').count(), 1, 'estado negado declarado');
    assert.match(await negado.innerText(), /acesso negado/i);
    assert.equal(await page.locator(`text=${accountName}`).count(), 0,
      'o dado lido antes da negativa não pode continuar visível (falha fechada)');
    assert.equal(await negado.getByRole('button').count(), 0,
      'negativa de autorização não oferece repetir a mesma chamada');
    await capture(page, 'clientes-desktop-negado');
    await context.close();
  });
});

test('UX-PRO-06 clientes: 320/390/768/1440 dia e noite sem transbordo, com percurso de teclado', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser);
    await aguardarCadastroNaTela(page);
    for (const [largura, altura] of [[1440, 900], [768, 1024], [390, 844], [320, 844]]) {
      await page.setViewportSize({ width: largura, height: altura });
      await page.waitForTimeout(700);
      const transbordo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(transbordo <= 1, `transbordo de ${transbordo}px em ${largura}px (dia)`);
      await capture(page, `clientes-${largura}-dia`);
      if (largura === 768) {
        await page.click('[data-admin-theme-toggle="true"]');
        await page.waitForFunction(() => document.documentElement.dataset.adminTheme === 'night', null, { timeout: 20_000 });
        await page.waitForTimeout(400);
        const transbordoNoite = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(transbordoNoite <= 1, `transbordo de ${transbordoNoite}px em 768px (noite)`);
        await capture(page, 'clientes-768-noite');
        await page.click('[data-admin-theme-toggle="true"]');
        await page.waitForFunction(() => document.documentElement.dataset.adminTheme !== 'night', null, { timeout: 20_000 });
      }
      if (largura === 390) {
        // Percurso de teclado até o campo da seção 1, com foco visível medido.
        const campo = page.locator('#new-account-name');
        await campo.waitFor();
        let focou = false;
        const percursoTeclado = [];
        for (let i = 0; i < 60 && !focou; i++) {
          await page.keyboard.press('Tab');
          percursoTeclado.push(await page.evaluate(() => {
            const el = document.activeElement;
            return el.id || el.getAttribute('aria-label') || el.textContent.trim().slice(0, 80) || el.tagName.toLowerCase();
          }));
          focou = await campo.evaluate(el => el === document.activeElement);
        }
        assert.ok(focou, 'o campo do cadastro precisa ser alcançável por Tab');
        const contorno = await campo.evaluate(el => ({
          estilo: getComputedStyle(el).outlineStyle,
          espessura: parseFloat(getComputedStyle(el).outlineWidth) || 0,
        }));
        assert.ok(contorno.estilo !== 'none' && contorno.espessura >= 1,
          `foco visível no campo (estilo=${contorno.estilo}, espessura=${contorno.espessura})`);
        await capture(page, 'clientes-390-teclado');
        // Emissão após as asserções existentes de Tab + contorno; não inferir
        // percurso/primeiro foco a partir do nome da captura ou de role=alert.
        const viewport = page.viewportSize();
        await recordKeyboardCapture(evidenceDir, {
          stage: 'ux-pro-06-clientes', route: '/admin/clientes', role: 'ti',
          viewport: `${viewport.width}x${viewport.height}`,
          theme: await page.evaluate(() => document.documentElement.dataset.adminTheme || 'day'),
          file: 'clientes-390-teclado.png', firstFocus: true, percursoTeclado,
        });
      }
    }
    await context.close();
  });
});

// ——— Resíduo aditivo sobre o gate entregue: só acréscimos de asserção e de
// evidência. Nenhuma asserção existente foi alterada e nenhuma tela mudou. ———

test('UX-PRO-06 clientes: faixa de desatualização mantém contraste medido em 320 e 1440 px, com problems: []', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser);
    await aguardarCadastroNaTela(page);
    const medicoes = {};
    for (const [largura, altura] of [[1440, 900], [320, 844]]) {
      await page.setViewportSize({ width: largura, height: altura });
      await page.waitForTimeout(700);
      await page.evaluate(() => { window.__qaCadastros.falhar = true; });
      await page.getByRole('button', { name: /Recarregar lista/ }).click();
      const faixa = page.locator('[data-testid="clientes-cadastros-desatualizada"]');
      await faixa.waitFor({ timeout: 45_000 });
      const razao = await medirContrasteFaixa(page, '[data-testid="clientes-cadastros-desatualizada"]');
      assert.ok(razao !== null, `a faixa precisa existir para ser medida em ${largura}px`);
      assert.ok(razao >= CONTRASTE_MINIMO_FAIXA,
        `contraste da faixa em ${largura}px precisa ser ≥ ${CONTRASTE_MINIMO_FAIXA}:1 (medido ${razao}:1)`);
      medicoes[`${largura}x${altura}`] = razao;
      // A captura em 1440 px (clientes-desktop-desatualizada) já é emitida pelo
      // teste da faixa; aqui só a captura nova em 320 px, no mesmo estado.
      if (largura === 320) await capture(page, 'clientes-320-desatualizada');
      await page.evaluate(() => { window.__qaCadastros.falhar = false; });
      await faixa.getByRole('button', { name: /Tentar novamente/ }).click();
      await page.locator('[data-testid="clientes-cadastros-desatualizada"]').waitFor({ state: 'detached', timeout: 45_000 });
    }
    // Evidência explícita no resumo: a razão medida por largura e `problems: []`
    // como resultado dessa medição (não como rótulo fixo).
    for (const [viewport, contrasteFaixa] of Object.entries(medicoes)) {
      const screenshot = viewport === '1440x900'
        ? 'docs/ux-pro-06-clientes-evidencias/clientes-desktop-desatualizada.png'
        : 'docs/ux-pro-06-clientes-evidencias/clientes-320-desatualizada.png';
      const problems = await recordFaixaContraste(evidenceDir, {
        stage: 'ux-pro-06-clientes', route: '/admin/clientes', role: 'ti',
        viewport, theme: 'day', screenshot, contrasteFaixa,
      });
      assert.deepEqual(problems, [], `a medição em ${viewport} não pode registrar problemas`);
    }
    if (evidenceDir) {
      const resumo = JSON.parse(await readFile(path.join(evidenceDir, 'resumo.json'), 'utf8'));
      for (const viewport of Object.keys(medicoes)) {
        const nomeBase = viewport === '1440x900'
          ? 'clientes-desktop-desatualizada.png'
          : 'clientes-320-desatualizada.png';
        const entry = resumo.entries.find(item => path.basename(item.screenshot || item.file || '') === nomeBase);
        assert.ok(entry, `a entrada de ${nomeBase} precisa existir no resumo.json`);
        assert.deepEqual(entry.problems, [], `o resumo.json precisa registrar problems: [] para ${nomeBase}`);
        assert.equal(entry.contrasteFaixa, medicoes[viewport],
          `o resumo.json precisa registrar o contraste medido de ${nomeBase}`);
      }
    }
    await context.close();
  });
});

test('UX-PRO-06 clientes: falha na releitura preserva as seções 2–3 e a repetição relê de verdade', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser);
    await aguardarCadastroNaTela(page);
    // Estado preservado de partida: os seletores das seções 2 (grants) e
    // 3 (contratos) já foram construídos a partir da leitura concluída.
    for (const seletor of ['#grant-account', '#contracts-account']) {
      await page.locator(seletor).waitFor();
      const opcoes = await page.locator(`${seletor} option`).allTextContents();
      assert.ok(opcoes.some(opcao => opcao.includes(accountName)),
        `o seletor ${seletor} precisa listar o cadastro lido`);
    }
    // Falha transitória DEPOIS de uma leitura concluída.
    await page.evaluate(() => { window.__qaCadastros.falhar = true; });
    await page.getByRole('button', { name: /Recarregar lista/ }).click();
    const faixa = page.locator('[data-testid="clientes-cadastros-desatualizada"]');
    await faixa.waitFor({ timeout: 45_000 });
    // (1) Preservação ENTRE seções: a falha na releitura não apaga as opções
    //     já construídas nos seletores das seções 2 e 3.
    for (const seletor of ['#grant-account', '#contracts-account']) {
      const opcoes = await page.locator(`${seletor} option`).allTextContents();
      assert.ok(opcoes.some(opcao => opcao.includes(accountName)),
        `a falha na releitura não pode apagar as opções preservadas de ${seletor}`);
    }
    // (2) A repetição relê de verdade: um cadastro criado por HTTP DURANTE a
    //     falha não entra no dado preservado e só aparece quando a releitura
    //     conclui — "Tentar novamente" consulta o servidor; não reexibe o
    //     estado antigo.
    const nomeDuranteFalha = 'QA UX-PRO-06 Criado Durante A Falha';
    const criado = await api('/api/admin/client-accounts', {
      method: 'POST', cookie: tiCookie,
      body: { displayName: nomeDuranteFalha, documentRef: '00.000.000/0001-99', notes: 'Massa sintética criada durante a falha de releitura.' },
    });
    assert.equal(criado.status, 201, `criação durante a falha deveria retornar 201, veio ${criado.status}`);
    for (const seletor of ['#grant-account', '#contracts-account']) {
      const opcoes = await page.locator(`${seletor} option`).allTextContents();
      assert.ok(!opcoes.some(opcao => opcao.includes(nomeDuranteFalha)),
        `o cadastro criado durante a falha não pode aparecer no dado preservado de ${seletor}`);
    }
    assert.equal(await page.getByText(nomeDuranteFalha).count(), 0,
      'o dado preservado é o da última leitura concluída, não o estado atual do servidor');
    // Repetição com o servidor de volta: a lista é relida e o cadastro criado
    // durante a falha passa a aparecer — inclusive nos seletores das seções 2–3.
    await page.evaluate(() => { window.__qaCadastros.falhar = false; });
    await faixa.getByRole('button', { name: /Tentar novamente/ }).click();
    await page.locator('[data-testid="clientes-cadastros-desatualizada"]').waitFor({ state: 'detached', timeout: 45_000 });
    await page.getByText(nomeDuranteFalha).first().waitFor({ timeout: 45_000 });
    for (const seletor of ['#grant-account', '#contracts-account']) {
      await page.waitForFunction(
        ({ sel, nome }) => [...document.querySelectorAll(`${sel} option`)].some(opcao => opcao.textContent.includes(nome)),
        { sel: seletor, nome: nomeDuranteFalha },
        { timeout: 45_000 },
      );
    }
    await context.close();
  });
});
