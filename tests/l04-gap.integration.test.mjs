// L04 GAP — fechamento das lacunas: CRM-01..10 revalidados campo a campo e
// PUB-02/05..10 exercitados no domínio próprio (/admin/site), com HTTP real,
// PostgreSQL descartável e Chromium real.
//
// SQL direto aparece SOMENTE como fixture sintética (corromper o hash de um
// anexa para exercitar a verificação de integridade, apontar um anexo para
// bytes inexistentes, rebaixar o tráfego exigido de um teste A/B abaixo do
// mínimo aceito pela criação) ou para conferir efeito interno. Nenhum efeito
// de negócio é produzido por SQL: todos passam pelo servidor.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { provisionAndLoginStaff } from './helpers/staff-login.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');
let server, baseUrl, pool, workDir;

// Fixtures criadas em GAP-A e reaproveitadas pela navegação de GAP-B.
const fixtures = { ready: false };

async function waitForServer(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/admin/session`);
      if ([200, 401].includes(response.status)) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error('server_did_not_start');
}

// Uma requisição que nunca responde derrubaria a suíte inteira por tempo
// esgotado, sem dizer qual rota travou. O limite por requisição transforma
// isso em falha imediata e nomeada.
async function api(pathname, { method = 'GET', body, cookie, raw = false, sendOrigin = true } = {}) {
  let response;
  try {
    response = await fetch(`${baseUrl}${pathname}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(sendOrigin ? { origin: baseUrl } : {}),
        ...(cookie ? { cookie } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      redirect: 'manual',
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    throw new Error(`request_failed ${method} ${pathname}: ${error?.name || ''} ${error?.message || error}`);
  }
  const setCookie = response.headers.getSetCookie?.()
    || (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
  if (raw) return { status: response.status, buffer: Buffer.from(await response.arrayBuffer()), headers: response.headers, setCookie };
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: response.status, body: parsed, headers: response.headers, setCookie };
}

before(async () => {
  if (!RUN) return;
  workDir = await mkdtemp(path.join(tmpdir(), 'seg-l04gap-'));
  const port = 3400 + Math.floor(Math.random() * 1500);
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.mjs', '--dev'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: '127.0.0.1',
      NODE_ENV: 'development',
      NEXT_DIST_DIR: '.next/integration-l04gap',
      SITE_ADMIN_SESSION_SECRET: `${randomUUID()}${randomUUID()}`,
      EMPLOYEE_SESSION_SECRET: `${randomUUID()}${randomUUID()}`,
      ADMIN_LOGIN_MAX_ATTEMPTS: '200',
      OLLAMA_ENABLED: 'false',
      MAIL_HOST: '',
      SITE_ADMIN_LEGACY_TOKENS: '',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', chunk => {
    if (process.env.QA_VERBOSE === '1') process.stderr.write(chunk);
  });
  await waitForServer(baseUrl);
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
});

after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) {
    server.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 300));
    server.kill('SIGKILL');
  }
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

async function launchBrowser() {
  return playwrightChromium.launch({
    executablePath: await packagedChromium.executablePath(),
    // O pacote serverless inclui --disable-web-security, que removeria Origin
    // dos POSTs e mascararia a proteção CSRF exercitada aqui.
    args: packagedChromium.args.filter(arg => arg !== '--disable-web-security'),
    headless: true,
  });
}

// "Failed to load resource" sem detalhe é o aviso genérico do Chromium para
// qualquer requisição de rede que falhe, inclusive de terceiros. Este sandbox
// não tem internet, então a fonte do Google Fonts (@import preexistente em
// globals.css) sempre falha; os eventos com URL distinguem isso de falha real.
const GENERIC_RESOURCE_ERROR = /^Failed to load resource/;

function trackFailures(page, failures) {
  page.on('console', msg => {
    if (msg.type() === 'error' && !GENERIC_RESOURCE_ERROR.test(msg.text())) {
      failures.push(`console:${msg.text().slice(0, 200)}`);
    }
  });
  page.on('pageerror', err => failures.push(`pageerror:${String(err?.message || err).slice(0, 200)}`));
  page.on('requestfailed', request => {
    if (request.url().startsWith(baseUrl)) {
      failures.push(`requestfailed:${request.url()} ${request.failure()?.errorText || ''}`);
    }
  });
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === baseUrl && url.pathname.startsWith('/api/') && response.status() >= 500) {
      failures.push(`http:${response.status()} ${url.pathname}`);
    }
  });
}

// Um texto pode existir no DOM dentro de um <option> de <select> fechado sem
// jamais ser mostrado ao operador. Para provar que o dado REALMENTE aparece,
// procuramos o texto em nós renderizados fora de controles de formulário.
async function waitForRenderedText(page, expected, label, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let found = false;
  while (Date.now() < deadline) {
    found = await page.evaluate(text => {
      const insideControl = node => {
        for (let el = node; el; el = el.parentElement) {
          if (['SELECT', 'OPTION', 'OPTGROUP', 'DATALIST', 'TEXTAREA', 'INPUT'].includes(el.tagName)) return true;
        }
        return false;
      };
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!node.nodeValue || !node.nodeValue.includes(text)) continue;
        if (insideControl(node.parentElement)) continue;
        const element = node.parentElement;
        if (element && element.getClientRects().length > 0) return true;
      }
      return false;
    }, expected);
    if (found) return;
    await page.waitForTimeout(400);
  }
  assert.fail(`${label}: o texto "${expected}" não apareceu renderizado na página`);
}

async function assertNoHorizontalScroll(page, label) {
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert.equal(ok, true, `${label} não deve criar rolagem horizontal`);
}

const isoIn = days => new Date(Date.now() + days * 86_400_000).toISOString();

test('L04 GAP-A: CRM-01..10 e PUB-02/05..10 por HTTP real com PostgreSQL descartável', { skip: !RUN, timeout: 300_000 }, async () => {
  // =====================================================================
  // 0) NEGATIVOS ANTES DE QUALQUER SESSÃO: as dez rotas de engajamento
  //    recusam anônimo, e mutação sem mesma origem é recusada mesmo com
  //    sessão válida. A sessão nunca vem do corpo da requisição.
  // =====================================================================
  const anonRoutes = [
    ['/api/crm/tasks', 'GET'],
    ['/api/crm/tasks/00000000-0000-4000-8000-000000000000', 'GET'],
    ['/api/crm/interactions?company_id=00000000-0000-4000-8000-000000000000', 'GET'],
    ['/api/crm/interactions/00000000-0000-4000-8000-000000000000/attachments', 'GET'],
    ['/api/crm/interaction-attachments/00000000-0000-4000-8000-000000000000/download', 'GET'],
    ['/api/crm/visits', 'GET'],
    ['/api/crm/visits/00000000-0000-4000-8000-000000000000', 'GET'],
    ['/api/crm/cadences', 'GET'],
    ['/api/crm/portfolio', 'GET'],
  ];
  for (const [route, method] of anonRoutes) {
    const anon = await api(route, { method });
    assert.equal(anon.status, 401, `${route} sem sessão deveria ser 401, veio ${anon.status}`);
    assert.equal(anon.body.error, 'admin_session_required');
  }
  const anonEnroll = await api('/api/crm/cadences/enroll', { method: 'POST', body: { cadence_key: 'prospeccao-inicial' } });
  assert.equal(anonEnroll.status, 401);

  // =====================================================================
  // 1) Identidades reais e distintas, autenticadas pelo fluxo de login.
  // =====================================================================
  const comercial = await provisionAndLoginStaff(pool, api, { role: 'comercial' });
  const ti = await provisionAndLoginStaff(pool, api, { role: 'ti' });

  const crossOriginTask = await api('/api/crm/tasks', {
    method: 'POST', cookie: comercial.cookie, sendOrigin: false,
    body: { title: 'Tarefa de origem cruzada', company_id: '00000000-0000-4000-8000-000000000000' },
  });
  assert.equal(crossOriginTask.status, 403);
  assert.equal(crossOriginTask.body.error, 'same_origin_required');

  // =====================================================================
  // 2) CRM-01/CRM-02 — cadastro central com validação campo a campo e
  //    contatos com função de compra.
  // =====================================================================
  const badType = await api('/api/crm/companies', {
    method: 'POST', cookie: comercial.cookie,
    body: { display_name: 'Empresa Tipo Inválido', type: 'fornecedor' },
  });
  assert.equal(badType.status, 400);
  assert.equal(badType.body.error, 'invalid_type');

  const noName = await api('/api/crm/companies', { method: 'POST', cookie: comercial.cookie, body: { type: 'prospect' } });
  assert.equal(noName.status, 400);
  assert.equal(noName.body.error, 'invalid_display_name');

  const suffix = randomUUID().slice(0, 8);
  const matrizName = `Rede Sintética Matriz ${suffix}`;
  const matriz = await api('/api/crm/companies', {
    method: 'POST', cookie: comercial.cookie,
    body: {
      display_name: matrizName, type: 'prospect', city: 'Guarulhos', state: 'sp',
      segment: 'Condomínio', document_ref: `55${suffix}`, document_type: 'cnpj',
      responsible_name: 'Coordenação Sintética', origin: 'site',
    },
  });
  assert.equal(matriz.status, 201);
  assert.equal(matriz.body.company.state, 'SP', 'UF deve ser normalizada em maiúscula pelo servidor');
  assert.equal(matriz.body.company.created_by, 'comercial', 'o papel gravado vem da sessão, não do corpo');
  const matrizId = matriz.body.company.id;

  const filial = await api('/api/crm/companies', {
    method: 'POST', cookie: comercial.cookie,
    body: { display_name: `Rede Sintética Filial ${suffix}`, type: 'prospect', city: 'São Paulo', state: 'SP', parent_company_id: matrizId },
  });
  assert.equal(filial.status, 201);
  assert.equal(filial.body.company.parent_company_id, matrizId);

  const badBuyingRole = await api('/api/crm/contacts', {
    method: 'POST', cookie: comercial.cookie,
    body: { company_id: matrizId, display_name: 'Contato Inválido', buying_role: 'patrocinador' },
  });
  assert.equal(badBuyingRole.status, 400);
  assert.equal(badBuyingRole.body.error, 'invalid_buying_role');

  const badEmail = await api('/api/crm/contacts', {
    method: 'POST', cookie: comercial.cookie,
    body: { company_id: matrizId, display_name: 'Contato E-mail', email: 'sem-arroba' },
  });
  assert.equal(badEmail.status, 400);
  assert.equal(badEmail.body.error, 'invalid_email');

  const contato = await api('/api/crm/contacts', {
    method: 'POST', cookie: comercial.cookie,
    body: {
      company_id: matrizId, display_name: 'Síndica Sintética', email: `sindica.${suffix}@exemplo.invalid`,
      phone: '11 3437-2217', role: 'decisor', buying_role: 'decisor', is_primary: true,
      restrictions: 'Contato apenas em horário comercial',
    },
  });
  assert.equal(contato.status, 201);
  assert.equal(contato.body.contact.buying_role, 'decisor');
  const contatoId = contato.body.contact.id;

  const companyDetail = await api(`/api/crm/companies/${matrizId}`, { cookie: comercial.cookie });
  assert.equal(companyDetail.status, 200);
  assert.equal(companyDetail.body.company.id, matrizId);
  assert.equal(companyDetail.body.contacts.length, 1);
  assert.equal(companyDetail.body.contacts[0].id, contatoId);

  // =====================================================================
  // 3) CRM-03 — importação com prévia, deduplicação e commit; exportação.
  // =====================================================================
  const csv = [
    'nome,cnpj,cidade,uf,segmento,tipo',
    `Importada Sintética A ${suffix},77${suffix},Guarulhos,SP,Indústria,prospect`,
    `${matrizName},88${suffix},Guarulhos,SP,Condomínio,prospect`,
    `,99${suffix},Guarulhos,SP,Comércio,prospect`,
  ].join('\n');
  const preview = await api('/api/crm/imports/preview', {
    method: 'POST', cookie: comercial.cookie,
    body: { fileName: `carteira-${suffix}.csv`, csvContent: csv, type: 'companies' },
  });
  // A prévia cria um lote persistido para o commit posterior, então o servidor
  // responde 201 (recurso criado) e não 200; a expectativa foi corrigida
  // contra o comportamento real de handleImportPreview, e os contadores do
  // relatório são `valid`/`invalid`/`duplicate` no singular.
  assert.equal(preview.status, 201);
  assert.equal(preview.body.report.total, 3);
  assert.equal(preview.body.report.valid, 1, 'só a primeira linha é nova e válida');
  assert.equal(preview.body.report.duplicate, 1, 'a linha com nome idêntico precisa ser marcada como duplicada');
  assert.equal(preview.body.report.invalid, 1, 'a linha sem nome precisa ser marcada como inválida');
  const duplicateRow = preview.body.rows.find(r => r.status === 'duplicate');
  assert.equal(duplicateRow.dedup_match.id, matrizId, 'a duplicata precisa apontar a empresa existente');

  const commit = await api(`/api/crm/imports/${preview.body.batchId}/commit`, { method: 'POST', cookie: comercial.cookie, body: {} });
  assert.equal(commit.status, 200);
  assert.equal(commit.body.created, 1);
  assert.equal(commit.body.skipped + commit.body.failed, 2, 'duplicata e inválida não podem virar empresa');
  assert.equal(commit.body.batch.status, 'completed');

  const exported = await api('/api/crm/companies/export', { cookie: comercial.cookie, raw: true });
  assert.equal(exported.status, 200);
  const csvOut = exported.buffer.toString('utf8');
  assert.match(exported.headers.get('content-type') || '', /csv/);
  assert.ok(csvOut.includes(matrizName), 'a exportação precisa conter a empresa cadastrada');
  assert.ok(csvOut.includes(`Importada Sintética A ${suffix}`), 'a exportação precisa conter a empresa importada');

  // =====================================================================
  // 4) CRM-04 — pedido público real (sem credencial de admin) convertido em
  //    oportunidade, com deduplicação idempotente na segunda conversão.
  // =====================================================================
  const lead = await api('/api/leads', {
    method: 'POST',
    body: {
      requestKind: 'quote', name: `Visitante GAP ${suffix}`, phone: '11 98888-7777', city: 'Guarulhos',
      propertyType: 'Condomínio', services: ['Portaria e Controle de Acesso'], details: 'Pedido sintético do gate GAP.',
      consent: true, origin: 'site', campaign: 'gate-gap', channel: 'site',
    },
  });
  assert.ok([200, 201].includes(lead.status), `lead público deveria ser aceito, veio ${lead.status}`);
  const leadId = lead.body.leadId;
  assert.ok(leadId, 'o lead público precisa devolver um identificador');

  // A conversão exige um destino explícito: empresa existente ou criação com
  // nome. Converter "no escuro" seria adivinhar a carteira do lead.
  const convertNoTarget = await api(`/api/crm/leads/${leadId}/convert`, { method: 'POST', cookie: comercial.cookie, body: {} });
  assert.equal(convertNoTarget.status, 400);
  assert.equal(convertNoTarget.body.error, 'company_required');

  const convert = await api(`/api/crm/leads/${leadId}/convert`, { method: 'POST', cookie: comercial.cookie, body: { company_id: matrizId } });
  assert.equal(convert.status, 201);
  assert.ok(convert.body.opportunityId);
  const convertAgain = await api(`/api/crm/leads/${leadId}/convert`, { method: 'POST', cookie: comercial.cookie, body: { company_id: matrizId } });
  assert.equal(convertAgain.status, 200);
  assert.equal(convertAgain.body.dedup, true, 'reconversão do mesmo lead não pode duplicar a oportunidade');
  assert.equal(convertAgain.body.opportunityId, convert.body.opportunityId);

  // =====================================================================
  // 5) CRM-05/CRM-06 — funil com estágios, motivo obrigatório de perda e
  //    histórico de mudança de estágio.
  // =====================================================================
  const oppTitle = `Portaria 24h Rede Sintética ${suffix}`;
  const opp = await api('/api/crm/opportunities', {
    method: 'POST', cookie: comercial.cookie,
    body: {
      company_id: matrizId, contact_id: contatoId, title: oppTitle,
      service_name: 'Portaria e Controle de Acesso', need_description: 'Dois acessos com controle de visitantes.',
      estimated_value: 18500.5, forecast_date: isoIn(30).slice(0, 10),
      next_action: 'Agendar vistoria técnica', next_action_date: isoIn(3), priority: 'alta', origin: 'site',
    },
  });
  assert.equal(opp.status, 201);
  const oppId = opp.body.opportunity.id;
  assert.equal(opp.body.opportunity.stage, 'novo');

  const badStage = await api(`/api/crm/opportunities/${oppId}`, { method: 'PATCH', cookie: comercial.cookie, body: { stage: 'assinado' } });
  assert.equal(badStage.status, 400);
  assert.equal(badStage.body.error, 'invalid_stage');

  const noFields = await api(`/api/crm/opportunities/${oppId}`, { method: 'PATCH', cookie: comercial.cookie, body: {} });
  assert.equal(noFields.status, 400);
  assert.equal(noFields.body.error, 'no_fields');

  const lostWithoutReason = await api(`/api/crm/opportunities/${oppId}`, { method: 'PATCH', cookie: comercial.cookie, body: { stage: 'perdido' } });
  assert.equal(lostWithoutReason.status, 400);
  assert.equal(lostWithoutReason.body.error, 'loss_reason_required', 'perder oportunidade sem motivo precisa ser recusado');

  const advanced = await api(`/api/crm/opportunities/${oppId}`, {
    method: 'PATCH', cookie: comercial.cookie,
    body: { stage: 'qualificacao', reason: 'Necessidade confirmada com a síndica' },
  });
  assert.equal(advanced.status, 200);
  assert.equal(advanced.body.opportunity.stage, 'qualificacao');

  const withHistory = await api(`/api/crm/opportunities/${oppId}`, { cookie: comercial.cookie });
  assert.equal(withHistory.status, 200);
  assert.ok(withHistory.body.stages.length >= 1, 'a mudança de estágio precisa ficar registrada');
  const lastStage = withHistory.body.stages[0];
  assert.equal(lastStage.next_stage, 'qualificacao');
  assert.equal(lastStage.previous_stage, 'novo');
  assert.equal(lastStage.changed_by_role, 'comercial', 'o papel de quem moveu vem da sessão');

  const filtered = await api(`/api/crm/opportunities?stage=qualificacao&search=${encodeURIComponent(suffix)}`, { cookie: comercial.cookie });
  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.opportunities.length, 1);
  assert.equal(filtered.body.opportunities[0].id, oppId);

  // Oportunidade sem próxima ação: alimenta a carteira (CRM-10) mais adiante.
  const semAcao = await api('/api/crm/opportunities', {
    method: 'POST', cookie: comercial.cookie,
    body: { company_id: matrizId, title: `Sem próxima ação ${suffix}`, need_description: 'Oportunidade parada para o painel de carteira.' },
  });
  assert.equal(semAcao.status, 201);

  // =====================================================================
  // 6) CRM-07 (tarefas) — alvo obrigatório, coerência empresa/oportunidade
  //    e matriz de transição de status.
  // =====================================================================
  const taskNoTarget = await api('/api/crm/tasks', { method: 'POST', cookie: comercial.cookie, body: { title: 'Tarefa sem alvo' } });
  assert.equal(taskNoTarget.status, 400);
  assert.equal(taskNoTarget.body.error, 'target_required');

  const mismatch = await api('/api/crm/tasks', {
    method: 'POST', cookie: comercial.cookie,
    body: { title: 'Tarefa incoerente', company_id: filial.body.company.id, opportunity_id: oppId },
  });
  assert.equal(mismatch.status, 409);
  assert.equal(mismatch.body.error, 'opportunity_company_mismatch');

  const taskTitle = `Confirmar vistoria ${suffix}`;
  const task = await api('/api/crm/tasks', {
    method: 'POST', cookie: comercial.cookie,
    body: { title: taskTitle, opportunity_id: oppId, company_id: matrizId, due_date: isoIn(2), priority: 'alta', description: 'Ligar para a síndica e confirmar o horário.' },
  });
  assert.equal(task.status, 201);
  const taskId = task.body.task.id;
  assert.equal(task.body.task.status, 'aberta');
  assert.equal(task.body.task.responsible_id, comercial.id, 'sem responsável no corpo, assume-se a identidade da sessão');

  const skipAhead = await api(`/api/crm/tasks/${taskId}`, { method: 'PATCH', cookie: comercial.cookie, body: { status: 'concluida' } });
  assert.equal(skipAhead.status, 409);
  assert.equal(skipAhead.body.error, 'task_transition_invalid');
  assert.equal(skipAhead.body.current, 'aberta');
  assert.equal(skipAhead.body.target, 'concluida');

  const started = await api(`/api/crm/tasks/${taskId}`, { method: 'PATCH', cookie: comercial.cookie, body: { status: 'em_andamento' } });
  assert.equal(started.status, 200);
  assert.equal(started.body.task.status, 'em_andamento');

  const done = await api(`/api/crm/tasks/${taskId}`, { method: 'PATCH', cookie: comercial.cookie, body: { status: 'concluida' } });
  assert.equal(done.status, 200);
  assert.ok(done.body.task.completed_at, 'a conclusão precisa registrar o instante');

  const reopened = await api(`/api/crm/tasks/${taskId}`, { method: 'PATCH', cookie: comercial.cookie, body: { status: 'aberta' } });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.task.status, 'aberta');
  assert.equal(reopened.body.task.completed_at ?? null, null, 'reabrir precisa limpar a conclusão anterior');

  const emptyPatch = await api(`/api/crm/tasks/${taskId}`, { method: 'PATCH', cookie: comercial.cookie, body: {} });
  assert.equal(emptyPatch.status, 400);
  assert.equal(emptyPatch.body.error, 'no_fields');

  const cancelable = await api('/api/crm/tasks', { method: 'POST', cookie: comercial.cookie, body: { title: `Tarefa cancelada ${suffix}`, company_id: matrizId } });
  assert.equal(cancelable.status, 201);
  const cancelled = await api(`/api/crm/tasks/${cancelable.body.task.id}`, { method: 'PATCH', cookie: comercial.cookie, body: { status: 'cancelada' } });
  assert.equal(cancelled.status, 200);
  const afterCancel = await api(`/api/crm/tasks/${cancelable.body.task.id}`, { method: 'PATCH', cookie: comercial.cookie, body: { status: 'em_andamento' } });
  assert.equal(afterCancel.status, 409, 'tarefa cancelada é estado terminal');

  const overdue = await api('/api/crm/tasks', {
    method: 'POST', cookie: comercial.cookie,
    body: { title: `Tarefa vencida ${suffix}`, company_id: matrizId, due_date: isoIn(-4) },
  });
  assert.equal(overdue.status, 201);
  const overdueList = await api('/api/crm/tasks?overdue=true&responsible=me', { cookie: comercial.cookie });
  assert.equal(overdueList.status, 200);
  assert.ok(overdueList.body.tasks.length >= 1);
  assert.equal(overdueList.body.tasks.every(t => t.is_overdue === true), true, 'o filtro de vencidas só pode devolver vencidas');
  const otherPersonView = await api('/api/crm/tasks?responsible=me', { cookie: ti.cookie });
  assert.equal(otherPersonView.status, 200);
  assert.equal(otherPersonView.body.tasks.length, 0, '"minhas tarefas" é derivado da sessão, não de parâmetro do cliente');

  const notUuid = await api('/api/crm/tasks/nao-e-uuid', { cookie: comercial.cookie });
  assert.equal(notUuid.status, 404, 'caminho que não casa com UUID não é rota de tarefa');

  // =====================================================================
  // 7) CRM-07 (histórico e anexos) — escopo obrigatório, integridade do
  //    arquivo e recusa quando os bytes somem.
  // =====================================================================
  const noScope = await api('/api/crm/interactions', { cookie: comercial.cookie });
  assert.equal(noScope.status, 400);
  assert.equal(noScope.body.error, 'scope_required');

  const interactionTitle = `Reunião de alinhamento ${suffix}`;
  const interaction = await api('/api/crm/interactions', {
    method: 'POST', cookie: comercial.cookie,
    body: {
      company_id: matrizId, opportunity_id: oppId, contact_id: contatoId, type: 'reuniao',
      title: interactionTitle, details: 'Escopo revisado com a síndica; anexada a ata da reunião.',
      occurred_at: new Date().toISOString(),
    },
  });
  assert.equal(interaction.status, 201);
  const interactionId = interaction.body.interaction.id;
  // crm_interactions (migração 014) guarda apenas a identidade autora; o papel
  // fica na trilha de auditoria. Conferimos os dois na origem correta.
  assert.equal(interaction.body.interaction.created_by_id, comercial.id, 'a autoria vem da sessão, não do corpo');
  const interactionAudit = await pool.query(
    "SELECT actor_kind, actor_id FROM auth_access_audit WHERE action = 'crm_interaction_create' AND target LIKE $1",
    [`${interactionId}%`]
  );
  assert.equal(interactionAudit.rows.length, 1, 'criar interação precisa deixar uma linha de auditoria');
  assert.equal(interactionAudit.rows[0].actor_kind, 'comercial');
  assert.equal(interactionAudit.rows[0].actor_id, comercial.id);

  const oversized = await api(`/api/crm/interactions/${interactionId}/attachments`, {
    method: 'POST', cookie: comercial.cookie,
    body: { display_name: 'ata-gigante.txt', contentBase64: Buffer.alloc(5 * 1024 * 1024 + 2048, 0x41).toString('base64') },
  });
  assert.equal(oversized.status, 413);
  assert.equal(oversized.body.error, 'attachment_too_large');

  const attachmentBytes = Buffer.from(`Ata sintética da reunião ${suffix}\nAssinada em papel, registrada aqui apenas como arquivo.`, 'utf8');
  const expectedHash = createHash('sha256').update(attachmentBytes).digest('hex');
  const upload = await api(`/api/crm/interactions/${interactionId}/attachments`, {
    method: 'POST', cookie: comercial.cookie,
    body: { display_name: 'ata-reuniao.txt', content_type: 'text/plain', contentBase64: attachmentBytes.toString('base64') },
  });
  assert.equal(upload.status, 201);
  const attachmentId = upload.body.attachment.id;
  assert.equal(upload.body.attachment.content_sha256, expectedHash, 'o hash gravado precisa ser o do conteúdo recebido');
  assert.equal(Number(upload.body.attachment.size_bytes), attachmentBytes.length);
  assert.equal(upload.body.attachment.storage_key, undefined, 'a chave de armazenamento não pode vazar na resposta');

  const listAttachments = await api(`/api/crm/interactions/${interactionId}/attachments`, { cookie: comercial.cookie });
  assert.equal(listAttachments.status, 200);
  assert.equal(listAttachments.body.attachments.length, 1);

  const timeline = await api(`/api/crm/interactions?company_id=${matrizId}`, { cookie: comercial.cookie });
  assert.equal(timeline.status, 200);
  const timelineItem = timeline.body.interactions.find(i => i.id === interactionId);
  assert.equal(Number(timelineItem.attachment_count), 1, 'a linha do tempo precisa contar os anexos');

  const download = await api(`/api/crm/interaction-attachments/${attachmentId}/download`, { cookie: comercial.cookie, raw: true });
  assert.equal(download.status, 200);
  assert.equal(download.buffer.toString('utf8'), attachmentBytes.toString('utf8'), 'o arquivo baixado precisa ser idêntico ao enviado');
  assert.match(download.headers.get('content-disposition') || '', /^attachment;/);
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  assert.match(download.headers.get('cache-control') || '', /no-store/);

  // Fixture sintética: corrompe o hash registrado para provar que a
  // verificação de integridade recusa a entrega, e depois restaura.
  await pool.query('UPDATE crm_interaction_attachments SET content_sha256 = $2 WHERE id = $1', [attachmentId, 'b'.repeat(64)]);
  const tampered = await api(`/api/crm/interaction-attachments/${attachmentId}/download`, { cookie: comercial.cookie });
  assert.equal(tampered.status, 409);
  assert.equal(tampered.body.error, 'document_integrity_failed');
  await pool.query('UPDATE crm_interaction_attachments SET content_sha256 = $2 WHERE id = $1', [attachmentId, expectedHash]);
  const restored = await api(`/api/crm/interaction-attachments/${attachmentId}/download`, { cookie: comercial.cookie, raw: true });
  assert.equal(restored.status, 200);

  // Fixture sintética: aponta o registro para bytes que não existem.
  const ghost = await api(`/api/crm/interactions/${interactionId}/attachments`, {
    method: 'POST', cookie: comercial.cookie,
    body: { display_name: 'anexo-fantasma.txt', contentBase64: Buffer.from('bytes que serão removidos').toString('base64') },
  });
  assert.equal(ghost.status, 201);
  await pool.query('UPDATE crm_interaction_attachments SET storage_key = $2 WHERE id = $1', [ghost.body.attachment.id, 'f'.repeat(48)]);
  const missing = await api(`/api/crm/interaction-attachments/${ghost.body.attachment.id}/download`, { cookie: comercial.cookie });
  assert.equal(missing.status, 410);
  assert.equal(missing.body.error, 'attachment_bytes_missing');

  const auditedDownloads = await pool.query(
    "SELECT COUNT(*)::int AS total FROM auth_access_audit WHERE action = 'crm_interaction_attachment_download'"
  );
  assert.ok(auditedDownloads.rows[0].total >= 2, 'cada download precisa ser auditado');

  // =====================================================================
  // 8) CRM-08 — agenda de visitas com transições explícitas.
  // =====================================================================
  const visitNoDate = await api('/api/crm/visits', {
    method: 'POST', cookie: comercial.cookie,
    body: { company_id: matrizId, title: 'Visita sem data' },
  });
  assert.equal(visitNoDate.status, 400);
  assert.equal(visitNoDate.body.error, 'invalid_scheduled_at');

  const visitTitle = `Vistoria técnica ${suffix}`;
  const visit = await api('/api/crm/visits', {
    method: 'POST', cookie: comercial.cookie,
    body: {
      company_id: matrizId, opportunity_id: oppId, contact_id: contatoId, title: visitTitle,
      scheduled_at: isoIn(5), address: 'Av. Armando Bei, 305 - Guarulhos', duration_minutes: 60,
      participants: ['Síndica Sintética', 'Consultor Sintético'],
    },
  });
  assert.equal(visit.status, 201);
  const visitId = visit.body.visit.id;
  assert.equal(visit.body.visit.status, 'em_agendamento', 'visita nasce em agendamento, não confirmada');

  const noAction = await api(`/api/crm/visits/${visitId}`, { method: 'PATCH', cookie: comercial.cookie, body: {} });
  assert.equal(noAction.status, 400);
  assert.equal(noAction.body.error, 'invalid_action');

  const scheduleNoDate = await api(`/api/crm/visits/${visitId}`, { method: 'PATCH', cookie: comercial.cookie, body: { action: 'agendar' } });
  assert.equal(scheduleNoDate.status, 400);
  assert.equal(scheduleNoDate.body.error, 'scheduled_at_required');

  // O vocabulário de status é o do schema (migração 014): solicitada,
  // em_agendamento, confirmada, realizada, cancelada. Não existe "agendada".
  // Por isso "agendar" só se aplica a uma visita que chegou como solicitada;
  // uma visita criada pela equipe já nasce em agendamento e o próximo passo
  // legítimo é confirmar com o cliente.
  const scheduleFromAgendamento = await api(`/api/crm/visits/${visitId}`, { method: 'PATCH', cookie: comercial.cookie, body: { action: 'agendar', scheduled_at: isoIn(6) } });
  assert.equal(scheduleFromAgendamento.status, 409);
  assert.equal(scheduleFromAgendamento.body.error, 'visit_transition_invalid');
  assert.equal(scheduleFromAgendamento.body.current, 'em_agendamento');

  const confirmed = await api(`/api/crm/visits/${visitId}`, { method: 'PATCH', cookie: comercial.cookie, body: { action: 'confirmar' } });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.visit.status, 'confirmada');

  const rescheduled = await api(`/api/crm/visits/${visitId}`, {
    method: 'PATCH', cookie: comercial.cookie,
    body: { action: 'reagendar', scheduled_at: isoIn(9), reason: 'Síndica pediu outra data por assembleia' },
  });
  assert.equal(rescheduled.status, 200);
  assert.equal(rescheduled.body.visit.status, 'em_agendamento', 'reagendar volta para agendamento, não mantém confirmada');

  const badRealize = await api(`/api/crm/visits/${visitId}`, { method: 'PATCH', cookie: comercial.cookie, body: { action: 'realizar' } });
  assert.equal(badRealize.status, 409);
  assert.equal(badRealize.body.error, 'visit_transition_invalid');
  assert.equal(badRealize.body.current, 'em_agendamento');

  const reconfirmed = await api(`/api/crm/visits/${visitId}`, { method: 'PATCH', cookie: comercial.cookie, body: { action: 'confirmar' } });
  assert.equal(reconfirmed.status, 200);
  assert.equal(reconfirmed.body.visit.status, 'confirmada');
  const realized = await api(`/api/crm/visits/${visitId}`, { method: 'PATCH', cookie: comercial.cookie, body: { action: 'realizar', notes: 'Vistoria concluída com levantamento dos dois acessos.' } });
  assert.equal(realized.status, 200);
  assert.equal(realized.body.visit.status, 'realizada');
  const cancelRealized = await api(`/api/crm/visits/${visitId}`, { method: 'PATCH', cookie: comercial.cookie, body: { action: 'cancelar' } });
  assert.equal(cancelRealized.status, 409, 'visita realizada não pode ser cancelada depois');

  const agenda = await api(`/api/crm/visits?company_id=${matrizId}`, { cookie: comercial.cookie });
  assert.equal(agenda.status, 200);
  assert.ok(agenda.body.visits.some(v => v.id === visitId));

  // =====================================================================
  // 9) CRM-09 — cadências como fila de tarefas humanas, sem disparo.
  // =====================================================================
  const cadences = await api('/api/crm/cadences', { cookie: comercial.cookie });
  assert.equal(cadences.status, 200);
  assert.equal(cadences.body.cadences.length, 3);
  assert.match(cadences.body.note, /nenhuma mensagem|automação|humana/i, 'o catálogo precisa dizer que não há disparo automático');
  const prospeccao = cadences.body.cadences.find(c => c.key === 'prospeccao-inicial');
  assert.equal(prospeccao.steps.length, 5);
  assert.deepEqual(prospeccao.steps.map(s => s.offsetDays), [0, 2, 4, 7, 12]);

  const badCadence = await api('/api/crm/cadences/enroll', { method: 'POST', cookie: comercial.cookie, body: { cadence_key: 'inexistente', company_id: matrizId } });
  assert.equal(badCadence.status, 400);
  assert.equal(badCadence.body.error, 'invalid_cadence_key');

  const enrollStart = isoIn(1);
  const enroll = await api('/api/crm/cadences/enroll', {
    method: 'POST', cookie: comercial.cookie,
    body: { cadence_key: 'prospeccao-inicial', company_id: matrizId, opportunity_id: oppId, start_at: enrollStart },
  });
  assert.equal(enroll.status, 201);
  assert.equal(enroll.body.enrolled, 5);
  assert.equal(enroll.body.tasks.length, 5);
  assert.deepEqual(enroll.body.tasks.map(t => t.cadence_step), [1, 2, 3, 4, 5]);
  const firstDue = new Date(enroll.body.tasks[0].due_date).getTime();
  const lastDue = new Date(enroll.body.tasks[4].due_date).getTime();
  assert.equal(Math.round((lastDue - firstDue) / 86_400_000), 12, 'o último passo cai 12 dias depois do primeiro');
  assert.ok(enroll.body.tasks.every(t => /nenhuma mensagem é disparada automaticamente/i.test(t.description)), 'cada tarefa da cadência precisa deixar claro que a execução é humana');

  const enrollAgain = await api('/api/crm/cadences/enroll', {
    method: 'POST', cookie: comercial.cookie,
    body: { cadence_key: 'prospeccao-inicial', company_id: matrizId, opportunity_id: oppId },
  });
  assert.equal(enrollAgain.status, 409);
  assert.equal(enrollAgain.body.error, 'cadence_already_enrolled');

  const cadenceTasks = await api(`/api/crm/tasks?cadence=prospeccao-inicial&opportunity_id=${oppId}`, { cookie: comercial.cookie });
  assert.equal(cadenceTasks.status, 200);
  assert.equal(cadenceTasks.body.total, 5, 'o filtro por chave de cadência precisa excluir a tarefa avulsa da mesma oportunidade');
  const anyCadence = await api(`/api/crm/tasks?cadence=true&opportunity_id=${oppId}`, { cookie: comercial.cookie });
  assert.equal(anyCadence.body.total, 5);
  const unknownCadenceFilter = await api('/api/crm/tasks?cadence=cadencia-que-nao-existe', { cookie: comercial.cookie });
  assert.equal(unknownCadenceFilter.status, 400, 'filtro de cadência desconhecida não pode ser ignorado em silêncio');
  assert.equal(unknownCadenceFilter.body.error, 'invalid_cadence_key');

  // =====================================================================
  // 10) CRM-10 — carteira: renovação, sem próxima ação, reativação, grupo.
  // =====================================================================
  const renewalCompany = await api('/api/crm/companies', {
    method: 'POST', cookie: comercial.cookie,
    body: { display_name: `Cliente Renovação ${suffix}`, type: 'client', city: 'Guarulhos', state: 'SP' },
  });
  assert.equal(renewalCompany.status, 201);
  const renewal = await api('/api/crm/renewals', {
    method: 'POST', cookie: comercial.cookie,
    body: {
      company_id: renewalCompany.body.company.id, title: `Renovação anual ${suffix}`, type: 'renovacao',
      description: 'Renovação do contrato de portaria com revisão de escopo.',
      previous_value: 12000, new_value: 13200, renewal_date: isoIn(45).slice(0, 10),
    },
  });
  assert.equal(renewal.status, 201);

  const inactiveClient = await api('/api/crm/companies', {
    method: 'POST', cookie: comercial.cookie,
    body: { display_name: `Cliente Inativo ${suffix}`, type: 'client', city: 'Guarulhos', state: 'SP' },
  });
  assert.equal(inactiveClient.status, 201);
  const deactivated = await api(`/api/crm/companies/${inactiveClient.body.company.id}`, {
    method: 'PATCH', cookie: comercial.cookie, body: { status: 'inactive' },
  });
  assert.equal(deactivated.status, 200);
  assert.equal(deactivated.body.company.status, 'inactive');

  const portfolio = await api('/api/crm/portfolio', { cookie: comercial.cookie });
  assert.equal(portfolio.status, 200);
  assert.ok(portfolio.body.opportunities_without_next_action.some(o => o.title === `Sem próxima ação ${suffix}`), 'oportunidade sem próxima ação precisa aparecer na carteira');
  assert.ok(portfolio.body.renewals_due.some(r => r.title === `Renovação anual ${suffix}`), 'renovação dentro de 90 dias precisa aparecer');
  assert.ok(portfolio.body.reactivation_candidates.some(c => c.display_name === `Cliente Inativo ${suffix}`), 'cliente inativo sem oportunidade aberta é candidato a reativação');
  assert.ok(portfolio.body.company_groups.some(g => g.id === matrizId && Number(g.children_count) >= 1), 'matriz com filial precisa aparecer no relacionamento por grupo');
  assert.equal(portfolio.body.summary.without_next_action, portfolio.body.opportunities_without_next_action.length);

  // =====================================================================
  // 11) PUB — separação de alçada: comercial não administra o site.
  // =====================================================================
  const comercialNoCms = await api('/api/admin/cms-contents', { cookie: comercial.cookie });
  assert.equal(comercialNoCms.status, 401, 'papel comercial não pode administrar conteúdo do site');
  const comercialNoSeo = await api('/api/admin/seo-configs', { cookie: comercial.cookie });
  assert.equal(comercialNoSeo.status, 401);

  // PUB-06 — CMS com rascunho, publicação, histórico e reversão.
  const shortContent = await api('/api/admin/cms-contents', {
    method: 'POST', cookie: ti.cookie,
    body: { slug: `curto-${suffix}`, title: 'Conteúdo curto demais', content: 'texto pequeno', content_type: 'pagina' },
  });
  assert.equal(shortContent.status, 400);
  assert.equal(shortContent.body.error, 'invalid_content');

  const cmsSlug = `pagina-gate-${suffix}`;
  const cms = await api('/api/admin/cms-contents', {
    method: 'POST', cookie: ti.cookie,
    body: {
      slug: cmsSlug, title: 'Página de serviço revisada', content_type: 'pagina',
      content: 'Conteúdo sintético do gate GAP com texto suficientemente longo para passar pela validação mínima de cinquenta caracteres.',
      excerpt: 'Resumo sintético da página de serviço.',
    },
  });
  assert.equal(cms.status, 201);
  const cmsId = cms.body.id;
  assert.equal(cms.body.status, 'rascunho');
  assert.equal(cms.body.version, 1);

  const cmsRevert = await api('/api/admin/cms-contents/revert', {
    method: 'POST', cookie: ti.cookie,
    body: { content_id: cmsId, version: 1, reason: 'Reversão sintética exercitada pelo gate GAP' },
  });
  assert.equal(cmsRevert.status, 201);
  assert.notEqual(cmsRevert.body.id, cmsId, 'a reversão cria um novo registro em vez de sobrescrever o anterior');
  assert.equal(cmsRevert.body.status, 'rascunho');
  assert.equal(cmsRevert.body.version, 2);

  const cmsDetail = await api(`/api/admin/cms-contents/${cmsRevert.body.id}`, { cookie: ti.cookie });
  assert.equal(cmsDetail.status, 200);
  assert.ok(cmsDetail.body.history.length >= 1, 'a reversão precisa deixar histórico');

  // PUB-07 — tema com publicação autorizada e rollback versionado.
  const themeKey = `tema-gate-${suffix}`;
  const theme = await api('/api/admin/themes', {
    method: 'POST', cookie: ti.cookie,
    body: { theme_key: themeKey, name: 'Tema sintético do gate', description: 'Tema criado pelo gate GAP para exercitar prévia, publicação e rollback.', config: { a: 1 }, tokens: { brand: 'default' }, layout: { sections: 'default' } },
  });
  assert.equal(theme.status, 201);
  const themeId = theme.body.id;
  assert.equal(theme.body.status, 'rascunho');
  assert.equal(theme.body.is_published, false);

  const themePublished = await api('/api/admin/themes', {
    method: 'PATCH', cookie: ti.cookie,
    body: { id: themeId, status: 'publicado', reason: 'Publicação autorizada pelo gate GAP' },
  });
  assert.equal(themePublished.status, 200);
  assert.equal(themePublished.body.is_published, true);

  const themeRollback = await api('/api/admin/themes/rollback', {
    method: 'POST', cookie: ti.cookie,
    body: { theme_id: themeId, version: 1, reason: 'Rollback sintético exercitado pelo gate GAP' },
  });
  assert.equal(themeRollback.status, 201);
  assert.equal(themeRollback.body.status, 'revertido');
  assert.equal(themeRollback.body.is_published, false, 'rollback não pode nascer publicado');
  assert.ok(themeRollback.body.version > 1, 'rollback cria versão nova em vez de apagar histórico');

  // PUB-08 — SEO: noindex preservado e redirecionamento circular recusado.
  const seoPath = `/gate-gap-${suffix}`;
  const seo = await api('/api/admin/seo-configs', {
    method: 'POST', cookie: ti.cookie,
    body: { path: seoPath, title: 'Título sintético do gate', description: 'Descrição sintética suficientemente longa para o gate.' },
  });
  assert.equal(seo.status, 201);
  assert.equal(seo.body.is_noindex, true, 'a configuração nasce com noindex preservado');
  const seoId = seo.body.id;

  const publishNoindex = await api('/api/admin/seo-configs', { method: 'PATCH', cookie: ti.cookie, body: { id: seoId, is_published: true } });
  assert.equal(publishNoindex.status, 400);
  assert.equal(publishNoindex.body.error, 'cannot_publish_with_noindex');

  const publishOk = await api('/api/admin/seo-configs', { method: 'PATCH', cookie: ti.cookie, body: { id: seoId, is_published: true, is_noindex: false, robots: 'index, follow' } });
  assert.equal(publishOk.status, 200);
  assert.equal(publishOk.body.is_published, true);

  const selfRedirect = await api('/api/admin/seo-redirects', { method: 'POST', cookie: ti.cookie, body: { old_path: seoPath, new_path: seoPath } });
  assert.equal(selfRedirect.status, 400);
  assert.equal(selfRedirect.body.error, 'cannot_redirect_to_self');

  const redirect = await api('/api/admin/seo-redirects', {
    method: 'POST', cookie: ti.cookie,
    body: { old_path: `${seoPath}-antigo`, new_path: seoPath, redirect_type: '301', reason: 'Consolidação sintética de URL pelo gate' },
  });
  assert.equal(redirect.status, 201);

  // PUB-02/PUB-05 — FAQ assistida: sem invenção de preço e com handoff.
  const inventedPrice = await api('/api/admin/faq-assisted-rules', {
    method: 'POST', cookie: ti.cookie,
    body: {
      rule_key: `preco-${suffix}`, question_pattern: 'quanto custa a portaria',
      answer_template: 'A portaria custa R$ 4500 por mês em qualquer condomínio.', category: 'precificacao',
    },
  });
  assert.equal(inventedPrice.status, 400);
  assert.equal(inventedPrice.body.error, 'price_invention_detected');

  const sensitiveNoHandoff = await api('/api/admin/faq-assisted-rules', {
    method: 'POST', cookie: ti.cookie,
    body: {
      rule_key: `sensivel-${suffix}`, question_pattern: 'qual o prazo de instalacao',
      answer_template: 'O prazo depende do levantamento técnico feito na vistoria presencial.',
      category: 'prazos', is_deadline_sensitive: true,
    },
  });
  assert.equal(sensitiveNoHandoff.status, 400);
  assert.equal(sensitiveNoHandoff.body.error, 'sensitive_requires_handoff');

  const faqPattern = `preco da portaria ${suffix}`;
  const faqRule = await api('/api/admin/faq-assisted-rules', {
    method: 'POST', cookie: ti.cookie,
    body: {
      rule_key: `portaria-${suffix}`, question_pattern: faqPattern,
      answer_template: 'Valor de portaria depende do número de acessos e da escala; um consultor humano assume o atendimento para orçar.',
      category: 'precificacao', keywords: [`portaria ${suffix}`], is_price_sensitive: true,
      is_human_handoff_required: true, handoff_reason: 'Pergunta de preço exige atendimento humano com vistoria',
    },
  });
  assert.equal(faqRule.status, 201);
  const faqRuleId = faqRule.body.id;

  const publishUnapproved = await api('/api/admin/faq-assisted-rules', {
    method: 'PATCH', cookie: ti.cookie,
    body: { id: faqRuleId, status: 'publicado', reason: 'Tentativa de publicar sem revisão competente' },
  });
  assert.equal(publishUnapproved.status, 400);
  assert.equal(publishUnapproved.body.error, 'must_be_approved_before_publish');

  const approveRule = await api('/api/admin/faq-assisted-rules', {
    method: 'PATCH', cookie: ti.cookie,
    body: { id: faqRuleId, status: 'aprovado', is_approved: true, reason: 'Revisão competente concluída no gate GAP' },
  });
  assert.equal(approveRule.status, 200);
  const publishRule = await api('/api/admin/faq-assisted-rules', {
    method: 'PATCH', cookie: ti.cookie,
    body: { id: faqRuleId, status: 'publicado', is_published: true, reason: 'Publicação autorizada após aprovação no gate GAP' },
  });
  assert.equal(publishRule.status, 200);
  assert.equal(publishRule.body.is_published, true);

  // Visitante público real, sem nenhuma credencial administrativa.
  const faqSession = await api('/api/faq-assisted', {
    method: 'POST',
    body: { question: `Qual o ${faqPattern} para dois acessos?`, visitor_name: 'Visitante FAQ GAP', origin: 'site' },
  });
  assert.equal(faqSession.status, 201);
  assert.equal(faqSession.body.need_handoff, true, 'pergunta sensível precisa transferir para humano');
  assert.equal(faqSession.body.matched_rule.rule_key, `portaria-${suffix}`);
  assert.ok(!/R\$\s*\d/.test(faqSession.body.answer), 'a resposta automática não pode conter preço');
  assert.ok(faqSession.body.protocol, 'a sessão pública precisa devolver protocolo de atendimento');
  const handoffRow = await pool.query('SELECT status, is_human_handoff FROM pub_faq_sessions WHERE id = $1', [faqSession.body.session.id]);
  assert.equal(handoffRow.rows[0].is_human_handoff, true);
  assert.equal(handoffRow.rows[0].status, 'em_handoff');

  // PUB-09 — pacotes só a partir de catálogo e regras aprovadas.
  const catalog = await api('/api/services');
  assert.equal(catalog.status, 200);
  const catalogItems = Array.isArray(catalog.body) ? catalog.body : (catalog.body.items || catalog.body.services || []);
  assert.ok(catalogItems.length >= 2, 'o catálogo precisa ter serviços publicados para montar pacote');
  const serviceIds = catalogItems.slice(0, 2).map(s => s.id);

  const unknownService = await api('/api/admin/service-packages', {
    method: 'POST', cookie: ti.cookie,
    body: { name: 'Pacote inexistente', description: 'Pacote com serviço que não existe no catálogo.', service_ids: ['00000000-0000-4000-8000-000000000000'] },
  });
  assert.equal(unknownService.status, 400);
  assert.equal(unknownService.body.error, 'some_services_not_found');

  // A migração 091 já semeia três regras aprovadas, então a ausência total de
  // regra não ocorre num banco migrado. Fixture sintética: desaprova todas
  // temporariamente para provar que o guardrail existe, e restaura em seguida.
  const approvedBefore = await pool.query('UPDATE pub_package_rules SET is_approved = false WHERE is_approved = true RETURNING id');
  assert.ok(approvedBefore.rows.length >= 1, 'o banco migrado precisa trazer regras aprovadas de origem');
  const noRules = await api('/api/admin/service-packages', {
    method: 'POST', cookie: ti.cookie,
    body: { name: `Pacote sem regra ${suffix}`, description: 'Tentativa de montar pacote antes de existir regra aprovada.', service_ids: serviceIds },
  });
  assert.equal(noRules.status, 400);
  assert.equal(noRules.body.error, 'no_approved_rules');
  await pool.query('UPDATE pub_package_rules SET is_approved = true WHERE id = ANY($1)', [approvedBefore.rows.map(r => r.id)]);

  const packageRule = await api('/api/admin/package-rules', {
    method: 'POST', cookie: ti.cookie,
    body: { rule_key: `regra-${suffix}`, name: 'Regra sintética de composição', description: 'Regra aprovada usada pelo gate GAP para compor pacotes.', rule_type: 'inclusao_obrigatoria', rule_data: { minimo: 1 } },
  });
  assert.equal(packageRule.status, 201);
  const approvedRule = await api('/api/admin/package-rules', { method: 'PATCH', cookie: ti.cookie, body: { id: packageRule.body.id, is_approved: true } });
  assert.equal(approvedRule.status, 200);
  assert.equal(approvedRule.body.is_approved, true);

  const pkg = await api('/api/admin/service-packages', {
    method: 'POST', cookie: ti.cookie,
    body: { name: `Pacote sintético ${suffix}`, description: 'Pacote montado a partir do catálogo validado e de regra aprovada.', service_ids: serviceIds, total_cost_cents: 100000, total_price_cents: 150000, margin_percent: 33 },
  });
  assert.equal(pkg.status, 201);
  assert.equal(pkg.body.is_price_from_approved_catalog, true);

  const demo = await api('/api/admin/service-packages', {
    method: 'POST', cookie: ti.cookie,
    body: { name: `Pacote demonstração ${suffix}`, description: 'Pacote de demonstração que nunca pode ir para produção.', service_ids: serviceIds, is_demo: true },
  });
  assert.equal(demo.status, 201);
  const publishDemo = await api('/api/admin/service-packages', { method: 'PATCH', cookie: ti.cookie, body: { id: demo.body.id, status: 'publicado' } });
  assert.equal(publishDemo.status, 400);
  assert.equal(publishDemo.body.error, 'demo_cannot_be_published');

  const approvedPkg = await api('/api/admin/service-packages', { method: 'PATCH', cookie: ti.cookie, body: { id: pkg.body.id, status: 'aprovado', reason: 'Aprovação sintética do gate' } });
  assert.equal(approvedPkg.status, 200);
  const pkg2 = await api('/api/admin/service-packages', {
    method: 'POST', cookie: ti.cookie,
    body: { name: `Pacote sintético comparado ${suffix}`, description: 'Segundo pacote, usado apenas para exercitar o comparador.', service_ids: serviceIds, total_price_cents: 210000 },
  });
  assert.equal(pkg2.status, 201);
  await api('/api/admin/service-packages', { method: 'PATCH', cookie: ti.cookie, body: { id: pkg2.body.id, status: 'aprovado', reason: 'Aprovação sintética do segundo pacote' } });

  const comparison = await api('/api/admin/package-comparisons', {
    method: 'POST', cookie: ti.cookie,
    body: { title: `Comparativo ${suffix}`, package_ids: [pkg.body.id, pkg2.body.id], notes: 'Comparativo sintético gerado pelo gate GAP.' },
  });
  assert.equal(comparison.status, 201);
  assert.equal(typeof comparison.body.comparison_data, 'object');
  assert.equal(comparison.body.comparison_data.summary.count, 2);

  // PUB-10 — medição de origem com minimização e A/B com tráfego exigido.
  const badMetric = await api('/api/admin/origin-metrics', {
    method: 'POST', cookie: ti.cookie,
    body: { origin: 'site', period_start: isoIn(-30).slice(0, 10), period_end: isoIn(-1).slice(0, 10), total_leads: 5, converted_leads: 9 },
  });
  assert.equal(badMetric.status, 400);
  assert.equal(badMetric.body.error, 'converted_exceeds_total');

  // Canal fora do conjunto do schema precisa ser recusado com 400 nomeado, não
  // escapar para erro do banco.
  const badChannel = await api('/api/admin/origin-metrics', {
    method: 'POST', cookie: ti.cookie,
    body: { origin: `site-gate-${suffix}`, channel: 'organico', period_start: isoIn(-30).slice(0, 10), period_end: isoIn(-1).slice(0, 10), total_leads: 1, converted_leads: 0 },
  });
  assert.equal(badChannel.status, 400);
  assert.equal(badChannel.body.error, 'invalid_channel');

  const metric = await api('/api/admin/origin-metrics', {
    method: 'POST', cookie: ti.cookie,
    body: { origin: `site-gate-${suffix}`, campaign: 'gate-gap', channel: 'organic', period_start: isoIn(-30).slice(0, 10), period_end: isoIn(-1).slice(0, 10), total_leads: 20, converted_leads: 4, total_opportunities: 6, total_contracts: 2 },
  });
  assert.equal(metric.status, 201);
  assert.equal(metric.body.is_minimized, true);

  const event = await api('/api/admin/conversion-events', {
    method: 'POST', cookie: ti.cookie,
    body: { event_type: 'lead_received', origin: `site-gate-${suffix}`, campaign: 'gate-gap', channel: 'site', lead_id: leadId, ip: '203.0.113.9', user_agent: 'Mozilla/5.0 (sintético)' },
  });
  assert.ok([200, 201].includes(event.status), `evento de conversão deveria ser aceito, veio ${event.status}`);
  const eventsList = await api('/api/admin/conversion-events', { cookie: ti.cookie });
  assert.equal(eventsList.status, 200);
  const serializedEvents = JSON.stringify(eventsList.body);
  assert.ok(!serializedEvents.includes('203.0.113.9'), 'IP em claro não pode voltar na listagem de eventos');
  assert.ok(!serializedEvents.includes('Mozilla/5.0 (sintético)'), 'user-agent em claro não pode voltar na listagem de eventos');

  const lowTraffic = await api('/api/admin/ab-tests', {
    method: 'POST', cookie: ti.cookie,
    body: { test_key: `ab-baixo-${suffix}`, hypothesis: 'Hipótese sintética com tráfego insuficiente para decidir qualquer coisa.', description: 'Teste sintético.', metric_name: 'conversao', traffic_required: 5, treatment: 'Tratamento sintético de dados minimizados.' },
  });
  assert.equal(lowTraffic.status, 400);
  assert.equal(lowTraffic.body.error, 'invalid_traffic_required');

  const abTest = await api('/api/admin/ab-tests', {
    method: 'POST', cookie: ti.cookie,
    body: { test_key: `ab-gate-${suffix}`, hypothesis: 'Hipótese sintética do gate GAP sobre a chamada principal da página de serviço.', description: 'Teste A/B sintético do gate.', metric_name: 'taxa_de_contato', traffic_required: 500, treatment: 'Sem dado pessoal: apenas contagem agregada por variante.' },
  });
  assert.equal(abTest.status, 201);
  assert.equal(abTest.body.is_privacy_compliant, true);
  const abTestId = abTest.body.id;

  // A regra "só executa A/B com tráfego suficiente" está em duas camadas: a
  // API recusa a criação abaixo de 10 (acima) e o próprio banco recusa o
  // valor (CHECK traffic_required >= 10, migração 092). Tentar rebaixar o
  // valor por SQL direto prova que não há como contornar o guardrail nem
  // por fora da API — é por isso que o ramo traffic_required_not_met do
  // servidor é inalcançável com o schema em vigor.
  let dbRefusal = null;
  try {
    await pool.query('UPDATE pub_ab_tests SET traffic_required = 5 WHERE id = $1', [abTestId]);
  } catch (error) {
    dbRefusal = error;
  }
  assert.ok(dbRefusal, 'o banco precisa recusar tráfego exigido abaixo de 10');
  // 23514 é a violação do CHECK. O cluster descartável do gate é criado em
  // SQL_ASCII enquanto o cliente fala UTF8, então o DETAIL da violação (que
  // repete a linha, com texto acentuado) pode ser truncado na conversão e
  // chegar como 22021. Os dois códigos descrevem a mesma recusa; o que
  // importa é que a escrita não aconteceu, conferido logo abaixo.
  assert.ok(['23514', '22021'].includes(String(dbRefusal.code)), `código inesperado na recusa: ${dbRefusal?.code} ${dbRefusal?.message}`);
  const stillRequired = await pool.query('SELECT traffic_required FROM pub_ab_tests WHERE id = $1', [abTestId]);
  assert.equal(Number(stillRequired.rows[0].traffic_required), 500, 'o valor original precisa permanecer intacto após a recusa');

  const startOk = await api('/api/admin/ab-tests', { method: 'PATCH', cookie: ti.cookie, body: { id: abTestId, status: 'em_execucao', reason: 'Início autorizado após tráfego exigido restabelecido' } });
  assert.equal(startOk.status, 200);
  assert.equal(startOk.body.status, 'em_execucao');

  Object.assign(fixtures, {
    ready: true,
    suffix,
    tiCookie: ti.cookie,
    comercialCookie: comercial.cookie,
    matrizName,
    oppTitle,
    taskTitle,
    visitTitle,
    interactionTitle,
    cmsSlug,
    themeKey,
    seoPath,
  });
});

test('L04 GAP-B: /admin/crm e /admin/site navegáveis em Chromium real', { skip: !RUN, timeout: 900_000 }, async t => {
  if (!fixtures.ready) {
    t.skip('GAP-A não populou as fixtures; nada a navegar');
    return;
  }

  const crmTabs = [
    ['Empresas & contatos', fixtures.matrizName],
    ['Funil & oportunidades', fixtures.oppTitle],
    ['Tarefas & cadências', fixtures.taskTitle],
    ['Agenda de visitas', fixtures.visitTitle],
    ['Histórico & anexos', 'Linha do tempo'],
    ['Carteira & renovação', 'Renovações nos próximos 90 dias'],
  ];
  const siteTabs = [
    ['FAQ assistida & segmentos', 'PUB-02'],
    ['Conteúdo (CMS)', 'PUB-06'],
    ['Temas & publicação', 'PUB-07'],
    ['SEO técnico & domínio', 'PUB-08'],
    ['Pacotes & comparador', 'PUB-09'],
    ['Métricas de origem', 'PUB-10'],
  ];

  const failures = [];
  // O Chromium empacotado roda com --single-process/--no-zygote: reaproveitar
  // o mesmo processo para um segundo contexto depois de fechar o primeiro o
  // derruba. Cada viewport recebe um navegador próprio.
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const browser = await launchBrowser();
    try {
      const context = await browser.newContext({ viewport, locale: 'pt-BR' });
        const pair = fixtures.tiCookie.split(';')[0];
        const separator = pair.indexOf('=');
        await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl }]);
        const page = await context.newPage();
        trackFailures(page, failures);

        // ---- /admin/crm: as seis abas do CRM, com dados reais de GAP-A.
        await page.goto(`${baseUrl}/admin/crm`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);
        await page.getByRole('heading', { name: /Empresas, funil e relacionamento/ }).waitFor();
        for (const [tab, expected] of crmTabs) {
          console.log(`# CRM/${tab} @${viewport.width}px`);
          await page.getByRole('button', { name: tab }).click();
          await page.waitForTimeout(900);
          await waitForRenderedText(page, expected, `CRM/${tab} em ${viewport.width}px`);
          await assertNoHorizontalScroll(page, `CRM/${tab} em ${viewport.width}px`);
        }

        // ---- /admin/site: os seis painéis de PUB fora da página de TI.
        await page.goto(`${baseUrl}/admin/site`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);
        await page.getByRole('heading', { name: /Conteúdo, tema, SEO e medição do site/ }).waitFor();
        for (const [tab, expected] of siteTabs) {
          console.log(`# SITE/${tab} @${viewport.width}px`);
          await page.getByRole('button', { name: tab }).click();
          await page.waitForTimeout(900);
          await waitForRenderedText(page, expected, `SITE/${tab} em ${viewport.width}px`);
          await assertNoHorizontalScroll(page, `SITE/${tab} em ${viewport.width}px`);
        }

        // Conteúdo real criado em GAP-A precisa estar visível no painel certo.
        await page.getByRole('button', { name: 'Conteúdo (CMS)' }).click();
        await page.waitForTimeout(900);
        await waitForRenderedText(page, fixtures.cmsSlug, 'painel de conteúdo');
        await page.getByRole('button', { name: 'SEO técnico & domínio' }).click();
        await page.waitForTimeout(900);
        await waitForRenderedText(page, fixtures.seoPath, 'painel de SEO');

      await context.close();
    } finally {
      await browser.close();
    }
  }
  assert.deepEqual(failures, [], `navegação autenticada não pode ter erro de console, requisição same-origin falha ou HTTP 5xx: ${failures.join(', ')}`);
});
