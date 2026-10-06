// UX-07 / EXT-08 — gate da tela /admin/conhecimento, por HTTP real contra
// PostgreSQL real (executado por scripts/qa-ux-knowledge-postgres.mjs, que
// sobe um cluster descartável) e por Chromium real.
//
// O que este gate prova:
//  - a rota canônica continua respondendo 401 sem sessão, sem vazar registro
//    algum na negativa, 400 sem `idempotency-key` e 403 de origem cruzada; a
//    leitura legada segue 200 e a escrita legada segue 410;
//  - "menu não é autorização": quem recusa é o servidor, papel a papel —
//    `supervisor` não lê a lista de ciências (403 `forbidden_role`), não lê
//    versão não publicada (403 `draft_not_accessible`) nem procedimento
//    publicado fora do escopo (403 `forbidden_by_role_scope`); `rh`, que
//    edita, não publica (403 `publish_permission_required`). Nenhum papel foi
//    alargado;
//  - o defeito central desta fatia: a leitura que falhava virava "nenhum
//    registro" com um único loading/error para três leituras. Agora cada
//    leitura (lista, detalhe com histórico/versões, ciências) tem estado
//    próprio, a falha diz que NÃO significa ausência de registros, mostra o
//    código canônico e oferece repetir — e nenhum indicador zero é
//    renderizado;
//  - vazio legítimo não é apresentado como falha;
//  - as quatro abas são um tablist de verdade, com roving tabindex e teclado;
//  - o vocabulário em português aparece no lugar do valor cru do banco
//    (`em_revisao`, `ext08_canonica`, `jornada_canonica`);
//  - ausência honesta: rascunho mostra "Publicação pendente", "Revisão
//    pendente", "Aprovação pendente" e "Dado ausente", nunca 01/01/1970;
//  - a jornada canônica real (criação → revisão → aprovação → publicação →
//    ciência → nova versão imutável) criada pelas PRÓPRIAS APIs canônicas;
//  - 390px não produz transbordo horizontal.
//
// O que este gate NÃO prova: aceite humano, homologação de Marcelo/Andreia,
// nem as rotas legadas somente-leitura como jornada de tela. Ver pendências
// em docs/UX-07-CONHECIMENTO-2026-10-06.md.
//
// Nenhuma asserção é enfraquecida: a falha de leitura é injetada apenas em
// `window.fetch`, dentro da própria página (`page.addInitScript`). O servidor
// nunca é alterado para o teste passar, e `ERR_ASSERTION` nunca é repetido.
//
// O histórico de revisões exibe `change_summary` COMO O SERVIDOR GRAVOU
// (trilha imutável): frases como "Transição de rascunho para em_revisao" são
// texto do servidor e não entram nas asserções de valor cru — a fronteira
// está declarada no documento da entrega.

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
let adminCookie, tiCookie, rhCookie, supervisorCookie;
let adminStaff, tiStaff, rhStaff, supervisorStaff;
let articleV1Id, articleV2Id, scopedId, approvedOnlyId;

const key = label => `ext08-ux-${label}-${randomUUID()}`;

const TITULO_V1 = 'Controle de acesso na portaria principal';
const TITULO_V2 = 'Controle de acesso na portaria principal (revisão do gate)';
const TITULO_ESCOPO = 'Ronda noturna da equipe de operação';
const TITULO_APROVADO = 'Procedimento com publicação restrita do gate';

async function waitForServer(url, timeoutMs = 180_000) {
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

function api(pathname, { method = 'GET', body, cookie, headers = {}, idempotencyKey } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { origin: baseUrl } : {}),
      ...(method !== 'GET' && idempotencyKey !== null ? { 'idempotency-key': idempotencyKey || key('api') } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  }).then(async res => ({ status: res.status, body: await res.json().catch(() => null) }));
}

async function loginStaffHttp(email) {
  const res = await fetch(`${baseUrl}/api/admin/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', origin: baseUrl },
    body: JSON.stringify({ email, password: STAFF_TEST_PASSWORD }),
  });
  assert.equal(res.status, 200, `login deveria retornar 200, veio ${res.status}`);
  const raw = (res.headers.getSetCookie?.() || []).find(c => c.startsWith('seg_admin_session='));
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
// sessão inteira quando o Chromium morre (SIGSEGV, alvo fechado) e repassa na
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
      console.log(`UX_KNOWLEDGE_BROWSER_RETRY tentativa=${tentativa}: ${String(erro.message).split('\n')[0]}`);
    } finally {
      await browser.close().catch(() => {});
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw ultimo;
}

const evidenceDir = process.env.UX_KNOWLEDGE_EVIDENCE_DIR || '';
async function capture(page, nome) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${nome}.png`), fullPage: true });
}

/**
 * Abre /admin/conhecimento já autenticada. `failRoutes` derruba, dentro da
 * própria página, as respostas indicadas: `page.route()` é instável com este
 * Chromium empacotado, então a substituição é feita em `window.fetch`, como
 * nos demais gates. O servidor NUNCA é enfraquecido.
 */
async function abrir(browser, cookie, { width = 1440, height = 900, failRoutes = [], status = 503, code = 'database_error' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
  const separador = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, separador), value: cookie.slice(separador + 1), url: baseUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(90_000);
  if (failRoutes.length) {
    await page.addInitScript(({ routes, failStatus, failCode }) => {
      const original = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : (input?.url || '');
        if (routes.some(route => url.includes(route))) {
          return new Response(JSON.stringify({ error: failCode }), {
            status: failStatus, headers: { 'content-type': 'application/json' },
          });
        }
        return original(input, init);
      };
    }, { routes: failRoutes, failStatus: status, failCode: code });
  }
  await page.goto(`${baseUrl}/admin/conhecimento`, { waitUntil: 'domcontentloaded' });
  // O h1 real é a marca de que a página de produto montou. Esperar só o
  // tablist mede a tela antes de a leitura terminar.
  await page.getByRole('heading', { level: 1, name: /Base de conhecimento e procedimentos operacionais/ }).waitFor();
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
      NEXT_DIST_DIR: '.next/integration-ux-knowledge',
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

  // `admin` está em allowedRoles do AdminGate; `ti` registra ciência; `rh`
  // edita mas NÃO publica; `supervisor` só lê o publicado dentro do escopo.
  // EXT-08 decide por sessão e papel no próprio servidor; nenhum grant é
  // necessário e nada foi alargado.
  adminStaff = await provisionStaff(pool, { role: 'admin' });
  tiStaff = await provisionStaff(pool, { role: 'ti' });
  rhStaff = await provisionStaff(pool, { role: 'rh' });
  supervisorStaff = await provisionStaff(pool, { role: 'supervisor' });
  adminCookie = await loginStaffHttp(adminStaff.email);
  tiCookie = await loginStaffHttp(tiStaff.email);
  rhCookie = await loginStaffHttp(rhStaff.email);
  supervisorCookie = await loginStaffHttp(supervisorStaff.email);

  // Massa fictícia criada pelas PRÓPRIAS APIs canônicas, por HTTP: nada é
  // inserido por SQL de negócio.
  const criado = await api('/api/ext/knowledge/articles', {
    method: 'POST', cookie: adminCookie,
    body: {
      slug: 'pop-controle-de-acesso-portaria',
      title: TITULO_V1,
      summary: 'Procedimento fictício do gate UX-07 conhecimento para a portaria principal.',
      content: 'Massa fictícia do gate UX-07 conhecimento: identificar o visitante, registrar a entrada no livro digital e acompanhar até o destino autorizado.',
      category: 'operacional',
      tags: ['portaria', 'controle-de-acesso'],
      access_roles: [],
    },
  });
  assert.equal(criado.status, 201, `criação deveria ser 201, veio ${criado.status} ${JSON.stringify(criado.body)}`);
  assert.equal(criado.body.article.status, 'rascunho', 'todo procedimento nasce rascunho no servidor');
  articleV1Id = criado.body.article.id;

  // Ciclo de vida real pela própria API: revisão → aprovação → publicação.
  for (const [status, extra] of [
    ['em_revisao', {}],
    ['aprovado', { notes: 'Conferido tecnicamente pelo gate de interface.' }],
    ['publicado', {}],
  ]) {
    const transicao = await api(`/api/ext/knowledge/articles/${articleV1Id}/transition`, {
      method: 'POST', cookie: adminCookie, body: { status, ...extra },
    });
    assert.equal(transicao.status, 200, `transição para ${status} deveria ser 200, veio ${transicao.status} ${JSON.stringify(transicao.body)}`);
  }

  // Ciência real registrada por `ti` na versão publicada.
  const ciencia = await api(`/api/ext/knowledge/articles/${articleV1Id}/acknowledge`, {
    method: 'POST', cookie: tiCookie,
    body: { notes: 'Procedimento lido e compreendido pelo gate.' },
  });
  assert.equal(ciencia.status, 200, `ciência deveria ser 200, veio ${ciencia.status} ${JSON.stringify(ciencia.body)}`);
  assert.equal(ciencia.body.version, 1);

  // Editar a versão PUBLICADA cria v2 como rascunho e preserva v1 imutável.
  const novaVersao = await api(`/api/ext/knowledge/articles/${articleV1Id}`, {
    method: 'PATCH', cookie: adminCookie,
    body: {
      title: TITULO_V2,
      content: 'Massa fictícia do gate UX-07 conhecimento, revisão dois: identificar o visitante, conferir o agendamento no sistema e registrar a saída.',
      change_summary: 'Ajuste da rotina de conferência de agendamento pelo gate.',
    },
  });
  assert.equal(novaVersao.status, 201, `nova versão deveria ser 201, veio ${novaVersao.status} ${JSON.stringify(novaVersao.body)}`);
  assert.equal(novaVersao.body.isNewVersion, true);
  assert.equal(novaVersao.body.article.version, 2);
  assert.equal(novaVersao.body.article.status, 'rascunho');
  articleV2Id = novaVersao.body.article.id;

  // Procedimento publicado com ESCOPO por papel (`operacao`): supervisor não
  // o vê na lista e recebe 403 no detalhe.
  const escopo = await api('/api/ext/knowledge/articles', {
    method: 'POST', cookie: adminCookie,
    body: {
      slug: 'pop-ronda-noturna-da-operacao',
      title: TITULO_ESCOPO,
      content: 'Massa fictícia do gate UX-07 conhecimento: percorrer os pontos de ronda declarados e registrar cada passagem no controle noturno.',
      category: 'operacional',
      tags: ['ronda'],
      access_roles: ['operacao'],
    },
  });
  assert.equal(escopo.status, 201);
  scopedId = escopo.body.article.id;
  for (const status of ['em_revisao', 'aprovado', 'publicado']) {
    const transicao = await api(`/api/ext/knowledge/articles/${scopedId}/transition`, {
      method: 'POST', cookie: adminCookie, body: { status },
    });
    assert.equal(transicao.status, 200, `transição do escopo para ${status} deveria ser 200, veio ${transicao.status}`);
  }

  // Procedimento levado só até APROVADO: é nele que `rh` tenta publicar.
  const aprovado = await api('/api/ext/knowledge/articles', {
    method: 'POST', cookie: adminCookie,
    body: {
      slug: 'pop-publicacao-restrita-do-gate',
      title: TITULO_APROVADO,
      content: 'Massa fictícia do gate UX-07 conhecimento para provar que editar não é publicar: o servidor recusa a publicação sem papel de publicação.',
      category: 'seguranca',
    },
  });
  assert.equal(aprovado.status, 201);
  approvedOnlyId = aprovado.body.article.id;
  for (const [status, extra] of [['em_revisao', {}], ['aprovado', { notes: 'Aprovação técnica do gate para o caso de publicação restrita.' }]]) {
    const transicao = await api(`/api/ext/knowledge/articles/${approvedOnlyId}/transition`, {
      method: 'POST', cookie: adminCookie, body: { status, ...extra },
    });
    assert.equal(transicao.status, 200);
  }

  // A página precisa estar compilada antes de qualquer medição no navegador.
  for (const route of ['/admin/entrar', '/admin/conhecimento']) {
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

test('a rota canônica de conhecimento continua exigindo sessão, sem mudança de contrato', { skip: !RUN }, async () => {
  const anonimo = await api('/api/ext/knowledge/articles');
  assert.equal(anonimo.status, 401);
  assert.equal(anonimo.body.error, 'unauthorized');
  assert.ok(!('items' in (anonimo.body || {})), 'a negativa não pode vazar registro algum');

  // Idempotência e proteção de origem seguem intactas nesta fatia.
  assert.equal((await api('/api/ext/knowledge/articles', {
    method: 'POST', cookie: adminCookie, idempotencyKey: null, body: {},
  })).status, 400);
  const origem = await api('/api/ext/knowledge/articles', {
    method: 'POST', cookie: adminCookie, headers: { origin: 'https://attacker.invalid' }, body: {},
  });
  assert.equal(origem.status, 403);
  assert.equal(origem.body.error, 'origin_forbidden');

  // A escrita legada continua aposentada; a leitura legada segue religada e
  // NÃO é consumida por esta tela.
  const legadaEscrita = await api('/api/ext/knowledge-base', { method: 'POST', cookie: adminCookie, body: {} });
  assert.equal(legadaEscrita.status, 410);
  assert.equal(legadaEscrita.body.error, 'legacy_knowledge_writer_retired');
  assert.equal((await api('/api/ext/knowledge-base', { cookie: adminCookie })).status, 200);
});

test('menu não é autorização: quem recusa é o servidor, papel a papel', { skip: !RUN }, async () => {
  // `admin` e `ti` leem a lista de ciências (papéis de edição).
  assert.equal((await api(`/api/ext/knowledge/articles/${articleV1Id}/acknowledgments`, { cookie: adminCookie })).status, 200);
  assert.equal((await api(`/api/ext/knowledge/articles/${articleV1Id}/acknowledgments`, { cookie: tiCookie })).status, 200);

  // `supervisor` lê a lista, mas o servidor só devolve o publicado dentro do
  // escopo — sem denunciar o que escondeu.
  const listaSupervisor = await api('/api/ext/knowledge/articles', { cookie: supervisorCookie });
  assert.equal(listaSupervisor.status, 200);
  assert.ok(listaSupervisor.body.items.every(item => item.status === 'publicado'),
    'fora dos papéis de edição só a versão publicada aparece');
  assert.ok(listaSupervisor.body.items.some(item => item.id === articleV1Id), 'o publicado sem escopo aparece');
  assert.ok(!listaSupervisor.body.items.some(item => item.id === scopedId), 'o publicado fora do escopo não vaza na lista');
  assert.ok(!listaSupervisor.body.items.some(item => item.id === approvedOnlyId), 'o aprovado não publicado não vaza na lista');
  assert.ok(!listaSupervisor.body.items.some(item => item.id === articleV2Id), 'o rascunho não vaza na lista');

  // As três recusas reais do servidor, sem vazar registro:
  const cienciasNegadas = await api(`/api/ext/knowledge/articles/${articleV1Id}/acknowledgments`, { cookie: supervisorCookie });
  assert.equal(cienciasNegadas.status, 403);
  assert.equal(cienciasNegadas.body.error, 'forbidden_role');
  assert.ok(!('items' in (cienciasNegadas.body || {})), 'a negativa não pode vazar registro algum');

  const rascunhoNegado = await api(`/api/ext/knowledge/articles/${articleV2Id}`, { cookie: supervisorCookie });
  assert.equal(rascunhoNegado.status, 403);
  assert.equal(rascunhoNegado.body.error, 'draft_not_accessible');
  assert.ok(!('article' in (rascunhoNegado.body || {})), 'a negativa não pode vazar o registro');

  const escopoNegado = await api(`/api/ext/knowledge/articles/${scopedId}`, { cookie: supervisorCookie });
  assert.equal(escopoNegado.status, 403);
  assert.equal(escopoNegado.body.error, 'forbidden_by_role_scope');
  assert.ok(!('article' in (escopoNegado.body || {})), 'a negativa não pode vazar o registro');

  // `rh` edita, mas EDITAR NÃO É PUBLICAR: o servidor recusa sozinho.
  const publicacaoNegada = await api(`/api/ext/knowledge/articles/${approvedOnlyId}/transition`, {
    method: 'POST', cookie: rhCookie, body: { status: 'publicado' },
  });
  assert.equal(publicacaoNegada.status, 403);
  assert.equal(publicacaoNegada.body.error, 'publish_permission_required');
  assert.ok(!('article' in (publicacaoNegada.body || {})), 'a negativa não pode vazar o registro');
});

test('browser: recusa do servidor vira estado NEGADO, nunca lista vazia', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    // A recusa 403 `forbidden_role` é injetada dentro da própria página: o
    // estado NEGADO precisa aparecer sem tabela, sem vazio e sem indicador.
    const { context, page } = await abrir(browser, adminCookie, {
      failRoutes: ['/api/ext/knowledge/articles'], status: 403, code: 'forbidden_role',
    });
    const painel = page.locator('[data-testid="knowledge-articles"]');
    await painel.waitFor();
    const negado = painel.locator('[data-ui-state="denied"]').first();
    await negado.waitFor();
    const texto = await negado.textContent();
    assert.match(texto, /Papel sem acesso à base de conhecimento/i, 'a recusa explica o papel, não diz que não há dado');
    assert.match(texto, /menu não concede acesso/i, 'menu não é autorização está dito na própria recusa');
    assert.match(texto, /\(forbidden_role\)/, 'o código canônico fica disponível para diagnóstico');

    assert.equal(await painel.locator('[data-ui-state="empty"]').count(), 0, 'recusa não pode ser confundida com vazio');
    assert.equal(await page.locator('[data-testid="knowledge-articles-table"]').count(), 0, 'nenhuma tabela vazia é renderizada');
    assert.equal(await page.locator('[data-testid="knowledge-article-metrics"]').count(), 0, 'nenhum indicador zero é renderizado');

    await capture(page, 'desktop-conhecimento-negado');
    await context.close();
  });
});

test('browser: falha de leitura NÃO vira "nenhum procedimento" nem indicador zero', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie, {
      failRoutes: ['/api/ext/knowledge/articles'], status: 503, code: 'database_error',
    });
    const painel = page.locator('[data-testid="knowledge-articles"]');
    await painel.waitFor();
    const erro = page.locator('[data-testid="knowledge-articles-error"] [data-ui-state="error"]');
    await erro.waitFor();
    const texto = await erro.textContent();
    assert.match(texto, /não significa que não existam procedimentos registrados/i, 'a falha nega explicitamente a lista vazia');
    assert.match(texto, /\(database_error\)/, 'o código canônico fica disponível');
    assert.ok(await erro.locator('button').count() >= 1, 'falha transitória precisa oferecer nova tentativa');

    assert.equal(await painel.locator('[data-ui-state="empty"]').count(), 0, 'falha não pode ser confundida com vazio');
    assert.equal(await page.locator('[data-testid="knowledge-articles-table"]').count(), 0, 'nenhuma tabela vazia é renderizada');
    assert.equal(await page.locator('[data-testid="knowledge-article-metrics"]').count(), 0, 'nenhum indicador zero é renderizado');

    await capture(page, 'desktop-conhecimento-falha-leitura');
    await context.close();
  });
});

test('browser: a falha de UMA leitura não contamina as demais', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    // Só a leitura de ciências é derrubada; lista e detalhe continuam reais.
    const { context, page } = await abrir(browser, adminCookie, {
      failRoutes: ['/acknowledgments'], status: 503, code: 'database_error',
    });
    const tabela = page.locator('[data-testid="knowledge-articles-table"]');
    await tabela.waitFor();
    await page.getByRole('row', { name: new RegExp(TITULO_V1) })
      .filter({ hasNotText: 'revisão do gate' })
      .first()
      .getByRole('button', { name: 'Ver procedimento' }).click();
    const detalhe = page.locator('[data-testid="knowledge-article-detail"]');
    await detalhe.locator('dl').waitFor();

    await page.getByRole('tab', { name: 'Ciência da equipe', exact: true }).click();
    const erro = page.locator('[data-testid="knowledge-acks-error"] [data-ui-state="error"]');
    await erro.waitFor();
    const texto = await erro.textContent();
    assert.match(texto, /não significa que não exista ciência registrada/i);
    assert.match(texto, /\(database_error\)/);
    assert.equal(await page.locator('[data-testid="knowledge-acks-table"]').count(), 0, 'nenhuma tabela de ciências vazia é renderizada');

    // A leitura vizinha permanece montada: a falha não apagou a lista nem o
    // detalhe (estados independentes).
    await page.getByRole('tab', { name: 'Procedimentos e versões', exact: true }).click();
    await page.locator('[data-testid="knowledge-articles-table"]').waitFor();
    await page.locator('[data-testid="knowledge-article-detail"] dl').waitFor();

    await capture(page, 'desktop-conhecimento-falha-isolada');
    await context.close();
  });
});

test('browser: as quatro abas são um tablist de verdade, com teclado', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie);
    await page.locator('[role="tablist"]').waitFor();

    const abas = page.getByRole('tab');
    assert.equal(await abas.count(), 4, 'a jornada tem quatro frentes de trabalho');
    assert.equal(await page.locator('[role="tab"][tabindex="0"]').count(), 1, 'roving tabindex: só uma aba tabulável');
    assert.equal(await page.locator('[role="tab"][tabindex="-1"]').count(), 3);
    assert.equal(await page.locator('[role="tabpanel"]').count(), 1, 'só o painel ativo fica montado');
    assert.equal(await page.locator('[aria-pressed]').count(), 0, 'aria-pressed não substitui tab');
    assert.equal(await abas.first().getAttribute('aria-controls'), 'knowledge-panel-procedimentos');

    await abas.first().focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await abas.nth(1).getAttribute('aria-selected'), 'true');
    assert.equal(await abas.nth(1).evaluate(el => el === document.activeElement), true,
      'a seta precisa mover o foco junto com a seleção');
    await page.keyboard.press('End');
    assert.equal(await abas.nth(3).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.equal(await abas.nth(0).getAttribute('aria-selected'), 'true');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await abas.nth(3).getAttribute('aria-selected'), 'true', '← na primeira aba volta para a última');

    await capture(page, 'desktop-conhecimento-abas');
    await context.close();
  });
});

test('browser: a jornada real aparece em português, sem valor cru do banco', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie);
    const tabela = page.locator('[data-testid="knowledge-articles-table"]');
    await tabela.waitFor();

    // textContent, e não innerText: o prefixo de leitor de tela do UiBadge é
    // recortado por CSS e não entra no texto renderizado.
    const textoTabela = await tabela.textContent();
    assert.match(textoTabela, /Publicado/, 'o estado publicado sai em português');
    assert.match(textoTabela, /Rascunho/, 'o estado rascunho sai em português');
    assert.match(textoTabela, /Aprovado tecnicamente/, 'o estado aprovado sai em português');
    assert.match(textoTabela, /Confirmada nesta versão|Pendente nesta versão/, 'a ciência própria sai em português');
    assert.doesNotMatch(textoTabela, /em_revisao|ext08_canonica|jornada_canonica|registro_legado/,
      'nenhum valor cru do banco na lista de procedimentos');
    assert.doesNotMatch(textoTabela, /\brascunho\b|\bpublicado\b|\barquivado\b/,
      'nenhum estado cru em minúsculas na lista');
    assert.doesNotMatch(textoTabela, /01\/01\/1970/, 'ausência nunca vira data inicial');

    // Os indicadores são contagens REAIS da leitura concluída.
    const metricas = await page.locator('[data-testid="knowledge-article-metrics"]').textContent();
    assert.match(metricas, /Procedimentos lidos/);
    assert.match(metricas, /Ciências registradas \(soma real do servidor\)/);

    // Detalhe da versão publicada v1: origem, escopo e ciclo em português.
    await page.getByRole('row', { name: new RegExp(TITULO_V1) })
      .filter({ hasNotText: 'revisão do gate' })
      .first()
      .getByRole('button', { name: 'Ver procedimento' }).click();
    const detalhe = page.locator('[data-testid="knowledge-article-detail"]');
    await detalhe.locator('dl').waitFor();
    const textoDetalhe = await detalhe.locator('dl').textContent();
    assert.match(textoDetalhe, /Jornada canônica EXT-08/, 'a origem sai em português');
    assert.match(textoDetalhe, /Todos os papéis de equipe autenticados/, 'o escopo vazio é dito como o servidor o aplica');
    assert.match(textoDetalhe, /pop-controle-de-acesso-portaria/, 'o slug declarado aparece como foi escrito');
    assert.doesNotMatch(textoDetalhe, /ext08_canonica/, 'nenhum valor cru de origem');

    // Histórico imutável e versões do mesmo slug: v1 publicada, v2 rascunho.
    const historico = await page.locator('[data-testid="knowledge-history"]').textContent();
    assert.match(historico, /Criação \(v1\)/, 'a criação aparece como criação, não como v0');
    assert.match(historico, /Transição de aprovado para publicado/, 'a trilha do servidor aparece como foi gravada');
    const versoes = await page.locator('[data-testid="knowledge-versions"]').textContent();
    assert.match(versoes, /v1/);
    assert.match(versoes, /v2/);
    assert.match(versoes, /Publicação pendente/, 'a versão não publicada diz pendente, nunca 01/01/1970');
    assert.doesNotMatch(versoes, /01\/01\/1970/);

    // Ciência registrada por `ti` na v1, com papel e origem em português.
    await page.getByRole('tab', { name: 'Ciência da equipe', exact: true }).click();
    const ciencias = page.locator('[data-testid="knowledge-acks-table"]');
    await ciencias.waitFor();
    const textoCiencias = await ciencias.textContent();
    assert.match(textoCiencias, /QA Staff ti/, 'quem registrou aparece pelo nome devolvido pelo servidor');
    assert.match(textoCiencias, /TI/, 'o papel sai em português');
    assert.match(textoCiencias, /Jornada canônica de ciência/, 'a origem da ciência sai em português');
    assert.match(textoCiencias, /Procedimento lido e compreendido pelo gate\./, 'a observação aparece como foi escrita');
    assert.doesNotMatch(textoCiencias, /jornada_canonica/, 'nenhum valor cru de origem de ciência');

    // Ciclo de vida: o espelho apresentado e a única transição do publicado.
    await page.getByRole('tab', { name: 'Ciclo de vida', exact: true }).click();
    const mapa = await page.locator('[data-testid="knowledge-lifecycle-map"]').textContent();
    assert.match(mapa, /Em revisão/);
    assert.match(mapa, /Aprovado tecnicamente/);
    const transicao = page.locator('[data-testid="knowledge-transition"]');
    await transicao.waitFor();
    assert.equal(await transicao.getByRole('button', { name: 'Arquivar', exact: true }).count(), 1,
      'publicado só transiciona para arquivado');
    assert.equal(await transicao.getByRole('button', { name: 'Publicar para a equipe', exact: true }).count(), 0,
      'nenhum botão de transição que o ciclo não permite');

    await capture(page, 'desktop-conhecimento-jornada');
    await context.close();
  });
});

test('browser: ausência honesta no rascunho e vazio honesto na ciência', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie);
    await page.locator('[data-testid="knowledge-articles-table"]').waitFor();
    await page.getByRole('row', { name: /revisão do gate/ })
      .getByRole('button', { name: 'Ver procedimento' }).click();
    const detalhe = page.locator('[data-testid="knowledge-article-detail"]');
    await detalhe.locator('dl').waitFor();
    const texto = await detalhe.locator('dl').textContent();
    assert.match(texto, /Publicação pendente/, 'publicação ausente é dita, não datada');
    assert.match(texto, /Revisão pendente/, 'revisão ausente é dita, não datada');
    assert.match(texto, /Aprovação pendente/, 'aprovação ausente é dita, não inventada');
    assert.match(texto, /Não arquivado/, 'arquivamento ausente é dito como é');
    assert.match(texto, /Dado ausente/, 'campo sem dado aparece como ausência');
    assert.doesNotMatch(texto, /01\/01\/1970/, 'ausência nunca vira 01/01/1970');

    // Vazio legítimo da ciência: a v2 é rascunho, ninguém registrou ciência,
    // e a tela diz isso sem fingir falha.
    await page.getByRole('tab', { name: 'Ciência da equipe', exact: true }).click();
    const painel = page.locator('[data-testid="knowledge-acks"]');
    await painel.waitFor();
    const vazio = painel.locator('[data-ui-state="empty"]');
    await vazio.waitFor();
    assert.match(await vazio.textContent(), /A leitura funcionou/i, 'vazio honesto diz que a leitura funcionou');
    assert.equal(await painel.locator('[data-ui-state="error"]').count(), 0,
      'lista vazia não pode ser confundida com falha');
    const aviso = await page.locator('[data-testid="knowledge-ack-unavailable"]').textContent();
    assert.match(aviso, /não está publicada/, 'a tela avisa que o servidor recusará ciência fora da publicação');

    await capture(page, 'desktop-conhecimento-ausencia-honesta');
    await context.close();
  });
});

test('browser: em 390px a tela de conhecimento não produz transbordo horizontal', { skip: !RUN }, async () => {
  await comNavegador(async browser => {
    const { context, page } = await abrir(browser, adminCookie, { width: 390, height: 844 });
    await page.locator('[data-testid="knowledge-articles-table"]').waitFor();
    await page.waitForTimeout(600);
    const transbordo = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(transbordo <= 1, `transbordo de ${transbordo}px em /admin/conhecimento`);
    await capture(page, 'mobile-conhecimento-390px');
    await context.close();
  });
});
