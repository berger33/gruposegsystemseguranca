// L04 (fechamento de lacunas) — CRM-01..10 e PUB-02/05..10.
//
// Tudo que é afirmado aqui passa pelo servidor real por HTTP, contra
// PostgreSQL descartável, e as telas novas (/admin/crm e /admin/site) são
// navegadas por Chromium real. SQL direto é usado apenas para (a) provisionar
// identidade de staff, (b) conferir efeito interno (auditoria) e (c) adulterar
// bytes de um anexo em disco para provar a detecção de integridade — nunca
// como substituto de uma chamada de API.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';
import { provisionAndLoginStaff } from './helpers/staff-login.mjs';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1' && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, '..');
let server, baseUrl, pool, workDir, docsDir;

// Estado compartilhado entre a etapa HTTP (GAP-A) e a etapa de navegador (GAP-B).
const S = {};

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

async function api(pathname, { method = 'GET', body, cookie, raw = false, sendOrigin = true, foreignOrigin = false } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    signal: AbortSignal.timeout(45_000),
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(foreignOrigin ? { origin: 'http://atacante.invalid' } : sendOrigin ? { origin: baseUrl } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
  });
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
  docsDir = path.join(workDir, 'docs');
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
      CLIENT_DOCS_DIR: docsDir,
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
    args: packagedChromium.args.filter(arg => arg !== '--disable-web-security'),
    headless: true,
  });
}

// Mesmo critério do gate L04: "Failed to load resource" genérico vem da fonte
// externa (@import do Google Fonts) que não resolve neste sandbox sem rede.
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

async function assertNoHorizontalScroll(page, label) {
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert.equal(ok, true, `${label} não deve criar rolagem horizontal`);
}

function cookiePairs(cookieHeader) {
  return cookieHeader.split(';').map(part => part.trim()).filter(Boolean).map(pair => {
    const eq = pair.indexOf('=');
    return { name: pair.slice(0, eq), value: pair.slice(eq + 1), url: baseUrl };
  });
}

function mark(step, label) {
  console.log(`# GAP-A passo ${step}: ${label}`);
}

const isoIn = (days, hours = 0) => new Date(Date.now() + days * 86400000 + hours * 3600000).toISOString();

test('L04 GAP-A: CRM-01..10 e PUB-02/05..10 por HTTP real', { skip: !RUN, timeout: 240_000 }, async () => {
  // -------------------------------------------------------------------
  // 0) A migração 104 precisa estar aplicada no banco descartável.
  mark('0', 'A migração 104 precisa estar aplicada no banco descartável.');
  // -------------------------------------------------------------------
  const { rows: migRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM __migrations WHERE filename = '104-l04-crm-engagement.sql'`);
  assert.equal(migRows[0].total, 1, 'migração 104 deve estar aplicada');

  // -------------------------------------------------------------------
  // 1) Controles negativos das rotas novas: sem sessão e com origem estranha.
  mark('1', 'Controles negativos das rotas novas: sem sessão e com origem estranha.');
  // -------------------------------------------------------------------
  for (const route of ['/api/crm/tasks', '/api/crm/visits', '/api/crm/cadences', '/api/crm/portfolio']) {
    const anon = await api(route);
    assert.equal(anon.status, 401, `${route} sem sessão deve ser 401 (obtido ${anon.status})`);
    assert.equal(anon.body.error, 'admin_session_required');
  }
  const anonInteractions = await api('/api/crm/interactions?company_id=' + randomUUID());
  assert.equal(anonInteractions.status, 401);
  const anonEnroll = await api('/api/crm/cadences/enroll', { method: 'POST', foreignOrigin: true, body: {} });
  assert.equal(anonEnroll.status, 401, 'sessão é verificada antes da origem, sem vazar detalhe');

  // -------------------------------------------------------------------
  // 2) Captação pública real (sem credencial de admin) — alimenta PUB-10.
  mark('2', 'Captação pública real (sem credencial de admin) — alimenta PUB-10.');
  // -------------------------------------------------------------------
  const leadPayload = {
    requestKind: 'quote', name: 'Visitante Sintético GAP', phone: '(11) 96655-4433', city: 'Guarulhos',
    propertyType: 'Condomínio', services: ['Câmeras e CFTV'], consent: true,
    origin: 'contato', campaign: 'l04-gap', channel: 'site',
  };
  const lead = await api('/api/leads', { method: 'POST', body: leadPayload });
  assert.ok([200, 201].includes(lead.status), JSON.stringify(lead.body));
  S.leadId = lead.body.leadId;
  assert.ok(S.leadId, 'captação pública deve devolver protocolo');

  // -------------------------------------------------------------------
  // 3) Identidades: comercial (CRM) e TI (site público).
  mark('3', 'Identidades: comercial (CRM) e TI (site público).');
  // -------------------------------------------------------------------
  S.comercial = await provisionAndLoginStaff(pool, api, { role: 'comercial' });
  S.ti = await provisionAndLoginStaff(pool, api, { role: 'ti' });
  const com = S.comercial.cookie;
  const tiCk = S.ti.cookie;

  const crossOrigin = await api('/api/crm/tasks', { method: 'POST', cookie: com, foreignOrigin: true, body: { title: 'x' } });
  assert.equal(crossOrigin.status, 403, 'POST cross-origin autenticado deve ser recusado (CSRF)');
  assert.equal(crossOrigin.body.error, 'same_origin_required');

  // -------------------------------------------------------------------
  // 4) CRM-01/CRM-02 — cadastro central e contatos, campo a campo.
  mark('4', 'CRM-01/CRM-02 — cadastro central e contatos, campo a campo.');
  // -------------------------------------------------------------------
  const matriz = await api('/api/crm/companies', {
    method: 'POST', cookie: com,
    body: {
      display_name: 'Grupo Matriz QA GAP', document_ref: '11444777000161', document_type: 'cnpj',
      segment: 'Condomínio residencial', city: 'Guarulhos', state: 'SP', type: 'prospect',
      responsible_name: 'QA Comercial', origin: 'indicacao', campaign: 'l04-gap', notes: 'Matriz sintética do gate.',
    },
  });
  assert.equal(matriz.status, 201, JSON.stringify(matriz.body));
  S.matrizId = matriz.body.company.id;
  assert.equal(matriz.body.company.document_type, 'cnpj');
  assert.equal(matriz.body.company.segment, 'Condomínio residencial');
  assert.equal(matriz.body.company.state, 'SP');
  assert.equal(matriz.body.company.origin, 'indicacao');
  assert.equal(matriz.body.company.campaign, 'l04-gap');

  const filha = await api('/api/crm/companies', {
    method: 'POST', cookie: com,
    body: { display_name: 'Unidade Filha QA GAP', city: 'São Paulo', state: 'SP', type: 'prospect', parent_company_id: S.matrizId },
  });
  assert.equal(filha.status, 201, JSON.stringify(filha.body));
  S.filhaId = filha.body.company.id;
  assert.equal(filha.body.company.parent_company_id, S.matrizId, 'relacionamento de grupo persistido (CRM-01)');

  const badType = await api('/api/crm/companies', { method: 'POST', cookie: com, body: { display_name: 'X', type: 'cliente' } });
  assert.equal(badType.status, 400);
  assert.equal(badType.body.error, 'invalid_type');

  const search = await api(`/api/crm/companies?search=Unidade Filha QA GAP`, { cookie: com });
  assert.equal(search.status, 200);
  assert.ok(search.body.companies.some(c => c.id === S.filhaId), 'busca por nome deve achar a unidade');

  const contact = await api('/api/crm/contacts', {
    method: 'POST', cookie: com,
    body: {
      company_id: S.matrizId, display_name: 'Síndica Decisora QA', email: 'sindica.qa@exemplo.invalid',
      phone: '11966554433', role: 'decisor', buying_role: 'decisor',
      restrictions: 'Não ligar antes das 9h', origin: 'indicação do zelador', is_primary: true,
    },
  });
  assert.equal(contact.status, 201, JSON.stringify(contact.body));
  assert.equal(contact.body.contact.buying_role, 'decisor', 'papel de compra registrado (CRM-02)');
  assert.equal(contact.body.contact.restrictions, 'Não ligar antes das 9h');
  assert.equal(contact.body.contact.origin, 'indicação do zelador');
  assert.equal(contact.body.contact.is_primary, true);

  const badRole = await api('/api/crm/contacts', {
    method: 'POST', cookie: com, body: { company_id: S.matrizId, display_name: 'Y', buying_role: 'chefe' },
  });
  assert.equal(badRole.status, 400);
  assert.equal(badRole.body.error, 'invalid_buying_role');

  const detail = await api(`/api/crm/companies/${S.matrizId}`, { cookie: com });
  assert.equal(detail.status, 200);
  assert.ok(detail.body.contacts.some(c => c.display_name === 'Síndica Decisora QA'));

  // -------------------------------------------------------------------
  // 5) CRM-03 — importação CSV com prévia, dedup e exportação neutralizada.
  mark('5', 'CRM-03 — importação CSV com prévia, dedup e exportação neutralizada.');
  // -------------------------------------------------------------------
  const csv = [
    'Empresa,CNPJ,Cidade,Tipo',
    'Importada Alfa QA GAP,11222333000181,Guarulhos,prospect',
    'grupo matriz qa gap,,São Paulo,prospect',
    ',   ,,',
  ].join('\n');
  const previewRes = await api('/api/crm/imports/preview', {
    method: 'POST', cookie: com,
    body: {
      fileName: 'empresas-gap.csv', csvContent: csv, type: 'companies',
      mapping: { Empresa: 'display_name', CNPJ: 'document_ref', Cidade: 'city', Tipo: 'type' },
    },
  });
  assert.ok([200, 201].includes(previewRes.status), JSON.stringify(previewRes.body));
  const report = previewRes.body.report;
  assert.equal(report.valid, 1, `prévia deve marcar 1 válido: ${JSON.stringify(report)}`);
  assert.equal(report.duplicate, 1, 'linha com nome já existente deve ser marcada como duplicada (CRM-03)');
  assert.equal(report.invalid, 1, 'linha sem nome deve ser marcada como inválida');

  const commit = await api(`/api/crm/imports/${previewRes.body.batchId}/commit`, { method: 'POST', cookie: com, body: {} });
  assert.equal(commit.status, 200, JSON.stringify(commit.body));
  assert.equal(commit.created, undefined);
  assert.equal(commit.body.created, 1, 'somente a linha válida deve ser criada');
  assert.ok(commit.body.skipped >= 1, 'duplicada/inválida não podem ser gravadas');

  const perigo = await api('/api/crm/companies', {
    method: 'POST', cookie: com, body: { display_name: '=SEG Perigo QA GAP', type: 'prospect' },
  });
  assert.equal(perigo.status, 201);
  const exported = await api('/api/crm/companies/export', { cookie: com, raw: true });
  assert.equal(exported.status, 200);
  const csvText = exported.buffer.toString('utf8');
  assert.ok(csvText.includes('Importada Alfa QA GAP'), 'export deve conter a empresa importada');
  assert.ok(csvText.includes("'=SEG Perigo QA GAP"), 'célula com fórmula deve sair neutralizada com aspas simples (CRM-03)');
  assert.ok(!/(^|,)"?=SEG Perigo/m.test(csvText), 'nenhuma célula pode começar com = sem neutralização');

  // -------------------------------------------------------------------
  // 6) CRM-04/05/06 — conversão deduplicada, oportunidade campo a campo,
  mark('6', 'CRM-04/05/06 — conversão deduplicada, oportunidade campo a campo,');
  //    funil com motivo de perda obrigatório e reabertura auditada.
  // -------------------------------------------------------------------
  const convert = await api(`/api/crm/leads/${S.leadId}/convert`, {
    method: 'POST', cookie: com, body: { create_company: true, company_name: 'Empresa Convertida QA GAP' },
  });
  assert.equal(convert.status, 201, JSON.stringify(convert.body));
  S.convertidaId = convert.body.companyId;
  S.oppId = convert.body.opportunityId;
  const reconvert = await api(`/api/crm/leads/${S.leadId}/convert`, {
    method: 'POST', cookie: com, body: { create_company: true, company_name: 'Empresa Convertida QA GAP' },
  });
  assert.equal(reconvert.status, 200);
  assert.equal(reconvert.body.dedup, true, 'reconversão não pode duplicar (CRM-04)');

  const opp = await api('/api/crm/opportunities', {
    method: 'POST', cookie: com,
    body: {
      company_id: S.matrizId, title: 'Portaria 24h para o Grupo Matriz QA GAP', service_name: 'Portaria',
      need_description: 'Substituir portaria terceirizada com custo alto.', responsible_name: 'QA Comercial',
      forecast_date: isoIn(30).slice(0, 10), estimated_value: 18500.5,
      next_action: 'Agendar vistoria técnica', next_action_date: isoIn(3), origin: 'indicacao', priority: 'alta',
    },
  });
  assert.equal(opp.status, 201, JSON.stringify(opp.body));
  S.matrizOppId = opp.body.opportunity.id;
  assert.equal(opp.body.opportunity.stage, 'novo');
  assert.equal(opp.body.opportunity.service_name, 'Portaria');
  assert.equal(opp.body.opportunity.priority, 'alta');
  assert.equal(Number(opp.body.opportunity.estimated_value), 18500.5);
  assert.equal(opp.body.opportunity.next_action, 'Agendar vistoria técnica');

  const semMotivo = await api(`/api/crm/opportunities/${S.matrizOppId}`, { method: 'PATCH', cookie: com, body: { stage: 'perdido' } });
  assert.equal(semMotivo.status, 400);
  assert.equal(semMotivo.body.error, 'loss_reason_required', 'perda exige motivo (CRM-06)');

  const comMotivo = await api(`/api/crm/opportunities/${S.matrizOppId}`, {
    method: 'PATCH', cookie: com, body: { stage: 'perdido', loss_reason: 'Preço acima do orçamento aprovado em assembleia' },
  });
  assert.equal(comMotivo.status, 200, JSON.stringify(comMotivo.body));
  assert.equal(comMotivo.body.opportunity.is_lost, true);

  const reabrir = await api(`/api/crm/opportunities/${S.matrizOppId}`, {
    method: 'PATCH', cookie: com, body: { stage: 'negociacao', reason: 'Síndico reabriu o processo após nova assembleia' },
  });
  assert.equal(reabrir.status, 200, JSON.stringify(reabrir.body));
  assert.equal(reabrir.body.opportunity.is_lost, false);

  const oppDetail = await api(`/api/crm/opportunities/${S.matrizOppId}`, { cookie: com });
  assert.equal(oppDetail.status, 200);
  const stageRows = oppDetail.body.stages || [];
  assert.ok(stageRows.length >= 2, 'transições devem ficar no histórico de estágios');
  assert.ok(stageRows.some(s => s.next_stage === 'perdido' && s.reason), 'perda registra motivo no histórico');
  assert.ok(stageRows.some(s => s.next_stage === 'negociacao' && s.reason), 'reabertura auditada com motivo (CRM-06)');

  const noFields = await api(`/api/crm/opportunities/${S.matrizOppId}`, { method: 'PATCH', cookie: com, body: {} });
  assert.equal(noFields.status, 400);
  assert.equal(noFields.body.error, 'no_fields');

  // -------------------------------------------------------------------
  // 7) CRM-07 — tarefas, vencidas, filtros, transições e auditoria.
  mark('7', 'CRM-07 — tarefas, vencidas, filtros, transições e auditoria.');
  // -------------------------------------------------------------------
  const t1 = await api('/api/crm/tasks', {
    method: 'POST', cookie: com,
    body: { company_id: S.matrizId, title: 'Ligar para a matriz QA GAP', due_date: isoIn(-2), priority: 'alta' },
  });
  assert.equal(t1.status, 201, JSON.stringify(t1.body));
  S.taskId = t1.body.task.id;
  assert.equal(t1.body.task.status, 'aberta');
  assert.equal(t1.body.task.responsible_id, S.comercial.id, 'responsável derivado da sessão, nunca do cliente');

  const t2 = await api('/api/crm/tasks', {
    method: 'POST', cookie: com,
    body: { opportunity_id: S.matrizOppId, title: 'Retornar e-mail da proposta QA GAP', due_date: isoIn(3) },
  });
  assert.equal(t2.status, 201, JSON.stringify(t2.body));
  assert.equal(t2.body.task.company_id, S.matrizId, 'empresa derivada da oportunidade no servidor');

  const scopeless = await api('/api/crm/tasks', { method: 'POST', cookie: com, body: { title: 'Solta' } });
  assert.equal(scopeless.status, 400);
  assert.equal(scopeless.body.error, 'scope_required');

  const overdue = await api('/api/crm/tasks?overdue=1&responsible=me&status=aberta', { cookie: com });
  assert.equal(overdue.status, 200);
  assert.ok(overdue.body.tasks.some(t => t.id === S.taskId), 'tarefa vencida aparece no filtro de vencidas');
  assert.ok(!overdue.body.tasks.some(t => t.id === t2.body.task.id), 'tarefa futura não é vencida');
  assert.equal(overdue.body.tasks.find(t => t.id === S.taskId).is_overdue, true);

  const searchTask = await api('/api/crm/tasks?search=Retornar', { cookie: com });
  assert.ok(searchTask.body.tasks.some(t => t.id === t2.body.task.id), 'busca por título (CRM-07)');

  const start = await api(`/api/crm/tasks/${S.taskId}`, { method: 'PATCH', cookie: com, body: { status: 'em_andamento' } });
  assert.equal(start.status, 200);
  const done = await api(`/api/crm/tasks/${S.taskId}`, { method: 'PATCH', cookie: com, body: { status: 'concluida' } });
  assert.equal(done.status, 200);
  const reopen = await api(`/api/crm/tasks/${S.taskId}`, { method: 'PATCH', cookie: com, body: { status: 'aberta' } });
  assert.equal(reopen.status, 200);
  const cancel = await api(`/api/crm/tasks/${t2.body.task.id}`, { method: 'PATCH', cookie: com, body: { status: 'cancelada' } });
  assert.equal(cancel.status, 200);
  const afterCancel = await api(`/api/crm/tasks/${t2.body.task.id}`, { method: 'PATCH', cookie: com, body: { status: 'em_andamento' } });
  assert.equal(afterCancel.status, 409, 'cancelada é estado final');
  assert.equal(afterCancel.body.error, 'task_transition_invalid');
  assert.equal(afterCancel.body.current, 'cancelada');

  const emptyPatch = await api(`/api/crm/tasks/${S.taskId}`, { method: 'PATCH', cookie: com, body: {} });
  assert.equal(emptyPatch.status, 400);
  assert.equal(emptyPatch.body.error, 'no_fields');

  const { rows: taskAudit } = await pool.query(
    `SELECT action FROM auth_access_audit WHERE action LIKE 'crm_task_%' AND actor_id = $1`, [S.comercial.id]);
  const auditActions = new Set(taskAudit.map(r => r.action));
  assert.ok(auditActions.has('crm_task_create'), 'criação de tarefa auditada (migração 104 liberou a ação)');
  assert.ok(auditActions.has('crm_task_status_concluida'), 'conclusão auditada');
  assert.ok(auditActions.has('crm_task_status_cancelada'), 'cancelamento auditado');

  // -------------------------------------------------------------------
  // 8) CRM-07 — histórico de ligações/reuniões, nota interna e anexos.
  mark('8', 'CRM-07 — histórico de ligações/reuniões, nota interna e anexos.');
  // -------------------------------------------------------------------
  const ligacao = await api('/api/crm/interactions', {
    method: 'POST', cookie: com,
    body: { company_id: S.matrizId, type: 'ligacao', title: 'Ligação de qualificação QA GAP', details: 'Síndica confirmou interesse.' },
  });
  assert.equal(ligacao.status, 201, JSON.stringify(ligacao.body));
  S.interactionId = ligacao.body.interaction.id;

  const nota = await api('/api/crm/interactions', {
    method: 'POST', cookie: com,
    body: { company_id: S.matrizId, type: 'nota', title: 'Nota interna QA GAP', details: 'Observação restrita à equipe.' },
  });
  assert.equal(nota.status, 201);

  const semEscopo = await api('/api/crm/interactions', { cookie: com });
  assert.equal(semEscopo.status, 400);
  assert.equal(semEscopo.body.error, 'scope_required');

  const soNotas = await api(`/api/crm/interactions?company_id=${S.matrizId}&type=nota`, { cookie: com });
  assert.equal(soNotas.status, 200);
  assert.equal(soNotas.body.interactions.length, 1, 'filtro por tipo isola a nota interna');

  const conteudo = Buffer.from('anexo sintetico do gate l04 gap');
  const upload = await api(`/api/crm/interactions/${S.interactionId}/attachments`, {
    method: 'POST', cookie: com,
    body: { display_name: 'ata-reuniao.txt', content_type: 'text/plain', contentBase64: conteudo.toString('base64') },
  });
  assert.equal(upload.status, 201, JSON.stringify(upload.body));
  S.attachmentId = upload.body.attachment.id;
  assert.equal(upload.body.attachment.size_bytes, conteudo.length);
  assert.equal(upload.body.attachment.storage_key, undefined, 'chave de armazenamento não é exposta ao cliente');

  const lista = await api(`/api/crm/interactions/${S.interactionId}/attachments`, { cookie: com });
  assert.equal(lista.status, 200);
  assert.equal(lista.body.attachments.length, 1);

  const download = await api(`/api/crm/interaction-attachments/${S.attachmentId}/download`, { cookie: com, raw: true });
  assert.equal(download.status, 200);
  assert.equal(download.buffer.toString('utf8'), conteudo.toString('utf8'), 'bytes íntegros no download');
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(download.headers.get('cache-control'), 'no-store');

  const anonDownload = await api(`/api/crm/interaction-attachments/${S.attachmentId}/download`);
  assert.equal(anonDownload.status, 401, 'anexo não é público');

  const grande = await api(`/api/crm/interactions/${S.interactionId}/attachments`, {
    method: 'POST', cookie: com,
    body: { display_name: 'grande.bin', content_type: 'application/octet-stream', contentBase64: Buffer.alloc(5_400_000, 7).toString('base64') },
  });
  assert.equal(grande.status, 413);
  assert.equal(grande.body.error, 'attachment_too_large');

  // adulteração dos bytes em disco (ataque simulado) -> integridade detectada
  const { rows: keyRows } = await pool.query('SELECT storage_key FROM crm_interaction_attachments WHERE id = $1', [S.attachmentId]);
  await writeFile(path.join(docsDir, 'crm-interactions', keyRows[0].storage_key), Buffer.from('conteudo adulterado'));
  const tampered = await api(`/api/crm/interaction-attachments/${S.attachmentId}/download`, { cookie: com });
  assert.equal(tampered.status, 409);
  assert.equal(tampered.body.error, 'document_integrity_failed', 'hash confere no download (padrão L02)');

  // -------------------------------------------------------------------
  // 9) CRM-08 — agenda de visitas: confirmar, reagendar, realizar, cancelar.
  mark('9', 'CRM-08 — agenda de visitas: confirmar, reagendar, realizar, cancelar.');
  // -------------------------------------------------------------------
  const semData = await api('/api/crm/visits', { method: 'POST', cookie: com, body: { company_id: S.matrizId, title: 'Sem data' } });
  assert.equal(semData.status, 400);
  assert.ok(['scheduled_at_required', 'invalid_scheduled_at'].includes(semData.body.error));

  const visita = await api('/api/crm/visits', {
    method: 'POST', cookie: com,
    body: {
      company_id: S.matrizId, opportunity_id: S.matrizOppId, title: 'Vistoria técnica QA GAP',
      scheduled_at: isoIn(5), duration_minutes: 60, participants: ['Síndica', 'Zelador'], notes: 'Levar checklist.',
    },
  });
  assert.equal(visita.status, 201, JSON.stringify(visita.body));
  S.visitId = visita.body.visit.id;
  assert.equal(visita.body.visit.status, 'em_agendamento', 'visita nasce pendente de confirmação');
  assert.deepEqual(visita.body.visit.participants, ['Síndica', 'Zelador']);

  const confirmada = await api(`/api/crm/visits/${S.visitId}`, { method: 'PATCH', cookie: com, body: { action: 'confirmar' } });
  assert.equal(confirmada.status, 200);
  assert.equal(confirmada.body.visit.status, 'confirmada');

  const novaData = isoIn(7, 2);
  const reagendada = await api(`/api/crm/visits/${S.visitId}`, {
    method: 'PATCH', cookie: com, body: { action: 'reagendar', scheduled_at: novaData, note: 'Síndica pediu outro dia' },
  });
  assert.equal(reagendada.status, 200, JSON.stringify(reagendada.body));
  assert.equal(reagendada.body.visit.status, 'em_agendamento', 'reagendamento exige nova confirmação (CRM-08)');
  assert.equal(new Date(reagendada.body.visit.scheduled_at).toISOString(), new Date(novaData).toISOString());
  assert.ok(String(reagendada.body.visit.notes).includes('reagendar'), 'reagendamento fica registrado nas observações');

  await api(`/api/crm/visits/${S.visitId}`, { method: 'PATCH', cookie: com, body: { action: 'confirmar' } });
  const realizada = await api(`/api/crm/visits/${S.visitId}`, { method: 'PATCH', cookie: com, body: { action: 'realizar' } });
  assert.equal(realizada.status, 200);
  assert.equal(realizada.body.visit.status, 'realizada');
  const depoisFinal = await api(`/api/crm/visits/${S.visitId}`, { method: 'PATCH', cookie: com, body: { action: 'cancelar' } });
  assert.equal(depoisFinal.status, 409, 'estado final não aceita nova transição');
  assert.equal(depoisFinal.body.error, 'visit_transition_invalid');

  const visita2 = await api('/api/crm/visits', {
    method: 'POST', cookie: com, body: { company_id: S.filhaId, title: 'Visita comercial QA GAP', scheduled_at: isoIn(9) },
  });
  assert.equal(visita2.status, 201);
  const cancelada = await api(`/api/crm/visits/${visita2.body.visit.id}`, {
    method: 'PATCH', cookie: com, body: { action: 'cancelar', note: 'Cliente pediu para adiar sem nova data' },
  });
  assert.equal(cancelada.status, 200);
  assert.equal(cancelada.body.visit.status, 'cancelada');

  const agenda = await api(`/api/crm/visits?from=${encodeURIComponent(isoIn(-1))}&limit=50`, { cookie: com });
  assert.equal(agenda.status, 200);
  assert.ok(agenda.body.visits.some(v => v.id === S.visitId), 'agenda por período lista a visita');

  const { rows: visitAudit } = await pool.query(
    `SELECT action FROM auth_access_audit WHERE action LIKE 'crm_visit_%' AND actor_id = $1`, [S.comercial.id]);
  const visitActions = new Set(visitAudit.map(r => r.action));
  assert.ok(visitActions.has('crm_visit_create'));
  assert.ok(visitActions.has('crm_visit_reschedule'), 'reagendamento auditado');
  assert.ok(visitActions.has('crm_visit_status_realizada'));

  // -------------------------------------------------------------------
  // 10) CRM-09 — cadências como tarefas, com adesão idempotente.
  mark('10', 'CRM-09 — cadências como tarefas, com adesão idempotente.');
  // -------------------------------------------------------------------
  const cadences = await api('/api/crm/cadences', { cookie: com });
  assert.equal(cadences.status, 200);
  assert.equal(cadences.body.cadences.length, 3);
  const prospec = cadences.body.cadences.find(c => c.key === 'prospeccao-inicial');
  assert.ok(prospec, 'catálogo traz a cadência de prospecção');
  assert.deepEqual(prospec.steps.map(s => s.offsetDays), [0, 2, 4, 7, 12]);

  const startAt = isoIn(1);
  const enroll = await api('/api/crm/cadences/enroll', {
    method: 'POST', cookie: com, body: { cadence_key: 'prospeccao-inicial', company_id: S.convertidaId, opportunity_id: S.oppId, start_at: startAt },
  });
  assert.equal(enroll.status, 201, JSON.stringify(enroll.body));
  assert.equal(enroll.body.enrolled, 5);
  assert.deepEqual(enroll.body.tasks.map(t => t.cadence_step), [1, 2, 3, 4, 5]);
  const firstDue = new Date(enroll.body.tasks[0].due_date).getTime();
  const lastDue = new Date(enroll.body.tasks[4].due_date).getTime();
  assert.equal(Math.round((lastDue - firstDue) / 86400000), 12, 'prazos seguem os offsets da cadência');

  const cadenceTasks = await api(`/api/crm/tasks?cadence=1&company_id=${S.convertidaId}`, { cookie: com });
  assert.equal(cadenceTasks.body.tasks.length, 5, 'tarefas da cadência são tarefas reais e filtráveis');
  assert.ok(String(cadenceTasks.body.tasks[0].description).includes('não há disparo automático'),
    'a tarefa deixa explícito que não há automação de mensagem');

  const reenroll = await api('/api/crm/cadences/enroll', {
    method: 'POST', cookie: com, body: { cadence_key: 'prospeccao-inicial', company_id: S.convertidaId, opportunity_id: S.oppId },
  });
  assert.equal(reenroll.status, 409);
  assert.equal(reenroll.body.error, 'cadence_already_enrolled', 'adesão é idempotente (índice único, não checagem frouxa)');

  const mismatch = await api('/api/crm/cadences/enroll', {
    method: 'POST', cookie: com, body: { cadence_key: 'pos-vistoria', company_id: S.matrizId, opportunity_id: S.oppId },
  });
  assert.equal(mismatch.status, 409);
  assert.equal(mismatch.body.error, 'opportunity_company_mismatch', 'servidor confere o vínculo, não confia no cliente');

  // -------------------------------------------------------------------
  // 11) CRM-10 — carteira: sem próxima ação, renovação, reativação e grupos.
  mark('11', 'CRM-10 — carteira: sem próxima ação, renovação, reativação e grupos.');
  // -------------------------------------------------------------------
  const semProxima = await api('/api/crm/opportunities', {
    method: 'POST', cookie: com, body: { company_id: S.matrizId, title: 'Retorno sobre parceria QA GAP', priority: 'media' },
  });
  assert.equal(semProxima.status, 201);
  S.semProximaId = semProxima.body.opportunity.id;

  const inativo = await api('/api/crm/companies', {
    method: 'POST', cookie: com, body: { display_name: 'Cliente Inato QA GAP', type: 'client', city: 'Osasco' },
  });
  assert.equal(inativo.status, 201);
  const inativado = await api(`/api/crm/companies/${inativo.body.company.id}`, { method: 'PATCH', cookie: com, body: { status: 'inactive' } });
  assert.equal(inativado.status, 200);
  assert.equal(inativado.body.company.status, 'inactive');

  const renewal = await api('/api/crm/renewals', {
    method: 'POST', cookie: com,
    body: {
      company_id: S.convertidaId, type: 'renovacao', title: 'Renovação contrato matriz QA GAP',
      description: 'Renovação sintética para a carteira do gate.', previous_value: 10000, new_value: 11500,
      renewal_date: isoIn(45).slice(0, 10), responsible_name: 'QA Comercial',
    },
  });
  assert.equal(renewal.status, 201, JSON.stringify(renewal.body));

  const portfolio = await api('/api/crm/portfolio', { cookie: com });
  assert.equal(portfolio.status, 200, JSON.stringify(portfolio.body));
  assert.ok(portfolio.body.opportunities_without_next_action.some(o => o.id === S.semProximaId),
    'oportunidade sem próxima ação aparece na carteira (CRM-10)');
  assert.ok(portfolio.body.renewals_due.some(r => r.title === 'Renovação contrato matriz QA GAP'),
    'renovação em 90 dias aparece na carteira');
  assert.ok(portfolio.body.reactivation_candidates.some(c => c.display_name === 'Cliente Inato QA GAP'),
    'cliente inativo sem oportunidade aberta é candidato a reativação');
  const grupo = portfolio.body.company_groups.find(g => g.id === S.matrizId);
  assert.ok(grupo, 'grupo com unidade aparece na carteira');
  assert.equal(grupo.children_count, 1);
  assert.ok(grupo.children.some(c => c.id === S.filhaId));

  // -------------------------------------------------------------------
  // 12) PUB — papel errado é recusado antes de qualquer efeito.
  mark('12', 'PUB — papel errado é recusado antes de qualquer efeito.');
  // -------------------------------------------------------------------
  const comercialNoCms = await api('/api/admin/cms-contents', {
    method: 'POST', cookie: com, body: { slug: 'nao-deve-existir-gap', title: 'Bloqueado', content: 'x'.repeat(60) },
  });
  assert.equal(comercialNoCms.status, 401, 'comercial não administra o site público');

  // -------------------------------------------------------------------
  // 13) PUB-06 — CMS: rascunho, aprovação, publicação, histórico e reversão.
  mark('13', 'PUB-06 — CMS: rascunho, aprovação, publicação, histórico e reversão.');
  // -------------------------------------------------------------------
  const cms = await api('/api/admin/cms-contents', {
    method: 'POST', cookie: tiCk,
    body: {
      slug: 'qa-gap-pagina', title: 'Página QA L04 GAP', content_type: 'pagina',
      content: 'Conteúdo sintético do gate L04 GAP com tamanho suficiente para passar na validação do CMS.',
      excerpt: 'Resumo sintético do gate.',
    },
  });
  assert.equal(cms.status, 201, JSON.stringify(cms.body));
  S.cmsId = cms.body.id;
  assert.equal(cms.body.status, 'rascunho');
  assert.equal(cms.body.is_published, false);

  const cmsRevisao = await api('/api/admin/cms-contents', { method: 'PATCH', cookie: tiCk, body: { id: S.cmsId, status: 'em_revisao', reason: 'Enviado para revisão no gate' } });
  assert.equal(cmsRevisao.status, 200);
  const cmsAprovado = await api('/api/admin/cms-contents', { method: 'PATCH', cookie: tiCk, body: { id: S.cmsId, status: 'aprovado', reason: 'Aprovado por revisão competente' } });
  assert.equal(cmsAprovado.status, 200);
  const cmsPublicado = await api('/api/admin/cms-contents', { method: 'PATCH', cookie: tiCk, body: { id: S.cmsId, status: 'publicado', reason: 'Publicação autorizada no gate' } });
  assert.equal(cmsPublicado.status, 200);
  assert.equal(cmsPublicado.body.is_published, true);

  const cmsPublico = await api('/api/cms-contents');
  assert.equal(cmsPublico.status, 200, 'leitura pública do CMS não exige sessão');
  assert.ok(cmsPublico.body.items.some(i => i.slug === 'qa-gap-pagina'), 'conteúdo publicado aparece na leitura pública');

  const cmsDetalhe = await api(`/api/admin/cms-contents/${S.cmsId}`, { cookie: tiCk });
  assert.equal(cmsDetalhe.status, 200);
  assert.ok((cmsDetalhe.body.history || []).length >= 1, 'histórico de publicação preservado (PUB-06)');
  assert.ok((cmsDetalhe.body.versions || []).length >= 1);

  const revert = await api('/api/admin/cms-contents/revert', {
    method: 'POST', cookie: tiCk, body: { content_id: S.cmsId, version: 1, reason: 'Reversão sintética do gate para provar a operação' },
  });
  assert.equal(revert.status, 201, JSON.stringify(revert.body));
  assert.equal(revert.body.status, 'rascunho', 'reversão cria nova versão em rascunho, sem republicar sozinha');
  assert.equal(revert.body.version, 2);

  // -------------------------------------------------------------------
  // 14) PUB-07 — tema: preview, aprovação, publicação, preferência e rollback.
  mark('14', 'PUB-07 — tema: preview, aprovação, publicação, preferência e rollback.');
  // -------------------------------------------------------------------
  const theme = await api('/api/admin/themes', {
    method: 'POST', cookie: tiCk,
    body: {
      theme_key: 'qa-gap-tema', name: 'Tema QA L04 GAP', description: 'Tema sintético do gate para provar preview e rollback.',
      config: { radius: 10 }, tokens: { brand: '#123456' }, layout: { header: 'compacto' },
    },
  });
  assert.equal(theme.status, 201, JSON.stringify(theme.body));
  S.themeId = theme.body.id;
  assert.equal(theme.body.version, 1);
  assert.equal(theme.body.status, 'rascunho');

  const preview = await api('/api/admin/theme-previews', { method: 'POST', cookie: tiCk, body: { theme_id: S.themeId, preview_url: '/preview/qa-gap' } });
  assert.equal(preview.status, 201, JSON.stringify(preview.body));
  assert.ok(preview.body.preview_token && String(preview.body.preview_token).length >= 16, 'preview gera token próprio');

  await api('/api/admin/themes', { method: 'PATCH', cookie: tiCk, body: { id: S.themeId, status: 'aprovado', reason: 'Aprovação do tema no gate' } });
  const published = await api('/api/admin/themes', {
    method: 'PATCH', cookie: tiCk, body: { id: S.themeId, status: 'publicado', make_active: true, reason: 'Publicação autorizada do tema no gate' },
  });
  assert.equal(published.status, 200, JSON.stringify(published.body));
  assert.equal(published.body.is_published, true);
  // O PATCH devolve a linha capturada antes do UPDATE de ativação, então
  // `is_active` no corpo é estado velho; a ativação de verdade é conferida
  // relendo a listagem de temas ativos (prova por HTTP, não pelo eco do POST).
  const active = await api('/api/admin/themes?active=true', { cookie: tiCk });
  assert.equal(active.status, 200);
  const activeItems = active.body.items || active.body.themes || active.body;
  assert.ok(Array.isArray(activeItems) ? activeItems.some(x => x.id === S.themeId) : false,
    `tema publicado com make_active deve ficar ativo: ${JSON.stringify(active.body).slice(0, 300)}`);

  const pref = await api('/api/admin/theme-preferences', { method: 'POST', cookie: tiCk, body: { theme_mode: 'escuro', theme_key: 'qa-gap-tema' } });
  assert.ok([200, 201].includes(pref.status), JSON.stringify(pref.body));
  const prefRead = await api('/api/admin/theme-preferences', { cookie: tiCk });
  assert.equal(prefRead.status, 200);
  assert.equal(prefRead.body.preference?.theme_mode || prefRead.body.theme_mode, 'escuro', 'preferência dia/noite é separada da publicação');

  const rollback = await api('/api/admin/themes/rollback', {
    method: 'POST', cookie: tiCk, body: { theme_id: S.themeId, version: 1, reason: 'Rollback sintético do gate após publicação' },
  });
  assert.equal(rollback.status, 201, JSON.stringify(rollback.body));
  assert.equal(rollback.body.status, 'revertido', 'rollback gera versão nova marcada como revertida (PUB-07)');

  // -------------------------------------------------------------------
  // 15) PUB-08 — SEO: noindex preservado, redirect, sitemap e domínio.
  mark('15', 'PUB-08 — SEO: noindex preservado, redirect, sitemap e domínio.');
  // -------------------------------------------------------------------
  const seo = await api('/api/admin/seo-configs', {
    method: 'POST', cookie: tiCk,
    body: {
      path: '/servicos/portaria-gap', title: 'Portaria dedicada — QA GAP',
      description: 'Descrição sintética suficiente para a validação de SEO do gate local.',
      canonical_url: 'https://www.exemplo.invalid/servicos/portaria-gap',
    },
  });
  assert.equal(seo.status, 201, JSON.stringify(seo.body));
  S.seoId = seo.body.id;
  assert.equal(seo.body.is_noindex, true, 'noindex nasce ligado e só sai por decisão explícita (PUB-08)');

  const publishNoindex = await api('/api/admin/seo-configs', { method: 'PATCH', cookie: tiCk, body: { id: S.seoId, is_published: true } });
  assert.equal(publishNoindex.status, 400);
  assert.equal(publishNoindex.body.error, 'cannot_publish_with_noindex');

  const publishOk = await api('/api/admin/seo-configs', { method: 'PATCH', cookie: tiCk, body: { id: S.seoId, is_noindex: false, is_published: true } });
  assert.equal(publishOk.status, 200, JSON.stringify(publishOk.body));

  const selfRedirect = await api('/api/admin/seo-redirects', {
    method: 'POST', cookie: tiCk,
    body: { old_path: '/portaria-gap', new_path: '/portaria-gap', redirect_type: '301', reason: 'Tentativa inválida de redirecionar para si' },
  });
  assert.equal(selfRedirect.status, 400);
  assert.equal(selfRedirect.body.error, 'cannot_redirect_to_self');

  const redirect = await api('/api/admin/seo-redirects', {
    method: 'POST', cookie: tiCk,
    body: { old_path: '/portaria-antiga-gap', new_path: '/servicos/portaria-gap', redirect_type: '301', reason: 'Consolidação de conteúdo antigo duplicado' },
  });
  assert.equal(redirect.status, 201, JSON.stringify(redirect.body));
  assert.equal(redirect.body.redirect_type, '301');

  const sitemap = await api('/api/admin/seo-sitemap', { method: 'POST', cookie: tiCk, body: { action: 'rebuild' } });
  assert.ok([200, 201].includes(sitemap.status), JSON.stringify(sitemap.body));
  const sitemapList = await api('/api/admin/seo-sitemap', { cookie: tiCk });
  assert.equal(sitemapList.status, 200);
  assert.ok(JSON.stringify(sitemapList.body).includes('/servicos/portaria-gap'), 'sitemap recebe a página publicada');

  const domain = await api('/api/admin/domain-verifications', {
    method: 'POST', cookie: tiCk,
    body: { domain: 'qa-gap.invalid', verification_method: 'dns_txt', verification_token: 'gate-token-0011223344' },
  });
  assert.equal(domain.status, 201, JSON.stringify(domain.body));
  assert.notEqual(domain.body.status, 'verificado', 'domínio não nasce verificado');

  // -------------------------------------------------------------------
  // 16) PUB-09 — montador de pacote sobre o catálogo validado e comparador.
  mark('16', 'PUB-09 — montador de pacote sobre o catálogo validado e comparador.');
  // -------------------------------------------------------------------
  const catalog = await api('/api/catalog');
  assert.equal(catalog.status, 200);
  const services = catalog.body.services || catalog.body.items || [];
  assert.ok(services.length >= 2, 'catálogo publicado precisa de ao menos dois serviços');
  const svcIds = services.slice(0, 2).map(s => s.id);

  // A guarda `no_approved_rules` é global (exige ao menos uma regra aprovada no
  // catálogo de regras), e a migração 091 já semeia regras aprovadas. Para
  // exercitar a guarda de verdade, a fixture suspende temporariamente as
  // aprovações existentes e depois as restaura — o julgamento continua sendo do
  // servidor, por HTTP.
  const { rows: suspended } = await pool.query(
    `UPDATE pub_package_rules SET is_approved=false WHERE is_approved=true RETURNING id`);
  const semRegra = await api('/api/admin/service-packages', {
    method: 'POST', cookie: tiCk,
    body: { name: 'Pacote sem regra QA GAP', description: 'Tentativa antes de qualquer regra aprovada.', service_ids: svcIds },
  });
  assert.equal(semRegra.status, 400, JSON.stringify(semRegra.body));
  assert.equal(semRegra.body.error, 'no_approved_rules', 'pacote exige regra aprovada antes (PUB-09)');
  if (suspended.length > 0) {
    await pool.query(`UPDATE pub_package_rules SET is_approved=true WHERE id = ANY($1::uuid[])`, [suspended.map(r => r.id)]);
  }

  const rule = await api('/api/admin/package-rules', {
    method: 'POST', cookie: tiCk,
    body: { rule_key: 'qa-gap-preco-minimo', name: 'Preço mínimo QA GAP', description: 'Regra sintética exigida pelo gate para montar pacote.', rule_type: 'preco_minimo', rule_data: { min: 100 } },
  });
  assert.equal(rule.status, 201, JSON.stringify(rule.body));
  const ruleApproved = await api('/api/admin/package-rules', { method: 'PATCH', cookie: tiCk, body: { id: rule.body.id, is_approved: true, reason: 'Aprovada para uso no gate' } });
  assert.equal(ruleApproved.status, 200, JSON.stringify(ruleApproved.body));

  const svcInvalido = await api('/api/admin/service-packages', {
    method: 'POST', cookie: tiCk,
    body: { name: 'Pacote inválido QA GAP', description: 'Serviço inexistente deve ser recusado.', service_ids: ['servico-que-nao-existe'] },
  });
  assert.equal(svcInvalido.status, 400);
  assert.equal(svcInvalido.body.error, 'some_services_not_found');

  const pkg1 = await api('/api/admin/service-packages', {
    method: 'POST', cookie: tiCk,
    body: { name: 'Pacote Essencial QA GAP', description: 'Pacote sintético A do comparador do gate.', service_ids: svcIds },
  });
  assert.equal(pkg1.status, 201, JSON.stringify(pkg1.body));
  const pkg2 = await api('/api/admin/service-packages', {
    method: 'POST', cookie: tiCk,
    body: { name: 'Pacote Completo QA GAP', description: 'Pacote sintético B do comparador do gate.', service_ids: svcIds },
  });
  assert.equal(pkg2.status, 201, JSON.stringify(pkg2.body));

  const demoPublicado = await api('/api/admin/service-packages', {
    method: 'POST', cookie: tiCk,
    body: { name: 'Pacote demo QA GAP', description: 'Demonstração nunca vai ao ar publicada.', service_ids: svcIds, is_demo: true, is_published: true },
  });
  assert.equal(demoPublicado.status, 400);
  assert.equal(demoPublicado.body.error, 'demo_cannot_be_published', 'demonstração não é publicada (PUB-09)');

  const comparativoCedo = await api('/api/admin/package-comparisons', {
    method: 'POST', cookie: tiCk,
    body: { title: 'Comparativo prematuro QA GAP', package_ids: [pkg1.body.id, pkg2.body.id], notes: 'Comparar antes da aprovação deve ser recusado.' },
  });
  assert.equal(comparativoCedo.status, 400);
  assert.equal(comparativoCedo.body.error, 'packages_not_approved', 'comparador só usa pacote aprovado (PUB-09)');

  for (const pkg of [pkg1, pkg2]) {
    const aprovado = await api('/api/admin/service-packages', {
      method: 'PATCH', cookie: tiCk, body: { id: pkg.body.id, status: 'aprovado', reason: 'Aprovação do pacote no gate' },
    });
    assert.equal(aprovado.status, 200, JSON.stringify(aprovado.body));
    assert.equal(aprovado.body.is_approved, true);
    assert.equal(aprovado.body.is_published, false, 'aprovar não publica sozinho');
  }

  const comparison = await api('/api/admin/package-comparisons', {
    method: 'POST', cookie: tiCk,
    body: { title: 'Comparativo QA GAP', package_ids: [pkg1.body.id, pkg2.body.id], notes: 'Comparativo sintético do gate L04.' },
  });
  assert.equal(comparison.status, 201, JSON.stringify(comparison.body));
  const comparisonData = typeof comparison.body.comparison_data === 'string'
    ? JSON.parse(comparison.body.comparison_data) : comparison.body.comparison_data;
  assert.ok(comparisonData, 'comparador devolve o conteúdo comparado');

  // -------------------------------------------------------------------
  // 17) PUB-10 — métricas de origem/conversão com minimização e A/B com guarda.
  mark('17', 'PUB-10 — métricas de origem/conversão com minimização e A/B com guarda.');
  // -------------------------------------------------------------------
  const excede = await api('/api/admin/origin-metrics', {
    method: 'POST', cookie: tiCk,
    body: { origin: 'contato', campaign: 'l04-gap', period_start: isoIn(-30).slice(0, 10), period_end: isoIn(0).slice(0, 10), total_leads: 10, converted_leads: 11 },
  });
  assert.equal(excede.status, 400);
  assert.equal(excede.body.error, 'converted_exceeds_total');

  const metric = await api('/api/admin/origin-metrics', {
    method: 'POST', cookie: tiCk,
    body: {
      origin: 'contato', campaign: 'l04-gap', channel: 'site',
      period_start: isoIn(-30).slice(0, 10), period_end: isoIn(0).slice(0, 10),
      total_leads: 10, converted_leads: 2, total_opportunities: 3, total_contracts: 1,
      notes: 'Entrada sintética agregada do gate L04 GAP, sem dado pessoal.',
    },
  });
  assert.equal(metric.status, 201, JSON.stringify(metric.body));
  assert.equal(metric.body.is_minimized, true, 'métrica marcada como minimizada (PUB-10)');
  assert.equal(metric.body.ip_hash ?? null, null, 'métrica agregada não guarda IP');

  const metricsList = await api('/api/admin/origin-metrics?origin=contato', { cookie: tiCk });
  assert.equal(metricsList.status, 200);
  assert.ok(metricsList.body.items.some(i => i.campaign === 'l04-gap'), 'painel lê a métrica gravada');

  const convEvent = await api('/api/admin/conversion-events', {
    method: 'POST', cookie: tiCk,
    body: { event_type: 'lead_received', origin: 'contato', campaign: 'l04-gap', lead_id: S.leadId, ip: '203.0.113.10', user_agent: 'GateBrowser/1.0 sintético' },
  });
  assert.equal(convEvent.status, 201, JSON.stringify(convEvent.body));
  assert.equal(convEvent.body.is_minimized, true);
  assert.match(String(convEvent.body.ip_hash), /^[0-9a-f]{64}$/, 'só o hash do IP é guardado');
  assert.match(String(convEvent.body.user_agent_hash), /^[0-9a-f]{64}$/);
  assert.ok(!('ip' in convEvent.body) && !('user_agent' in convEvent.body), 'IP/UA originais não voltam nem são persistidos em claro');

  const abFraco = await api('/api/admin/ab-tests', {
    method: 'POST', cookie: tiCk,
    body: { test_key: 'qa-gap-cta', hypothesis: 'curta', description: 'Teste sintético do gate.', metric_name: 'cta_clicks', traffic_required: 100, treatment: 'Sem dado pessoal.' },
  });
  assert.equal(abFraco.status, 400);
  assert.equal(abFraco.body.error, 'invalid_hypothesis', 'A/B exige hipótese declarada (PUB-10)');

  const ab = await api('/api/admin/ab-tests', {
    method: 'POST', cookie: tiCk,
    body: {
      test_key: 'qa-gap-cta', hypothesis: 'Trocar o texto do botão principal aumenta pedidos de orçamento qualificados.',
      description: 'Teste A/B sintético do gate L04 GAP.', metric_name: 'cta_clicks', traffic_required: 100,
      treatment: 'Sem coleta de dado pessoal; apenas contagem agregada.',
    },
  });
  assert.equal(ab.status, 201, JSON.stringify(ab.body));
  assert.equal(ab.body.is_privacy_compliant, true);

  // -------------------------------------------------------------------
  // 18) PUB-02/PUB-05 — FAQ assistida com guardas e transferência humana.
  mark('18', 'PUB-02/PUB-05 — FAQ assistida com guardas e transferência humana.');
  // -------------------------------------------------------------------
  const precoInventado = await api('/api/admin/faq-assisted-rules', {
    method: 'POST', cookie: tiCk,
    body: {
      rule_key: 'qa-gap-preco', question_pattern: 'qual o preço da portaria',
      answer_template: 'O preço da portaria é R$ 100 por mês, fechado para qualquer condomínio.', category: 'comercial',
    },
  });
  assert.equal(precoInventado.status, 400);
  assert.equal(precoInventado.body.error, 'price_invention_detected', 'assistente não pode inventar preço (PUB-05)');

  const faqRule = await api('/api/admin/faq-assisted-rules', {
    method: 'POST', cookie: tiCk,
    body: {
      rule_key: 'qa-gap-atendimento', question_pattern: 'horario de funcionamento comercial',
      answer_template: 'Nosso atendimento comercial funciona de segunda a sexta, das 8h às 18h, pelos canais oficiais.',
      category: 'atendimento', keywords: ['horario', 'funcionamento'],
      is_human_handoff_required: true, handoff_reason: 'Dúvidas comerciais são confirmadas por uma pessoa da equipe.',
    },
  });
  assert.equal(faqRule.status, 201, JSON.stringify(faqRule.body));
  const faqPublish = await api('/api/admin/faq-assisted-rules', {
    method: 'PATCH', cookie: tiCk,
    body: { id: faqRule.body.id, is_approved: true, is_published: true, status: 'publicado', reason: 'Regra revisada e aprovada para o gate' },
  });
  assert.equal(faqPublish.status, 200, JSON.stringify(faqPublish.body));

  const ask = await api('/api/faq-assisted', {
    method: 'POST', body: { question: 'Qual o horário de funcionamento comercial de vocês?', origin: 'site', campaign: 'l04-gap' },
  });
  assert.ok([200, 201].includes(ask.status), JSON.stringify(ask.body));
  assert.ok(String(JSON.stringify(ask.body)).includes('18h'), 'resposta vem da regra publicada');
  assert.equal(ask.body.need_handoff, true, 'regra sensível exige atendimento humano (PUB-05)');
  S.faqSessionId = ask.body.session?.id || ask.body.session_id;

  const handoffList = await api('/api/admin/faq-handoff', { cookie: tiCk });
  assert.equal(handoffList.status, 200, JSON.stringify(handoffList.body));
  const handoff = (handoffList.body.items || []).find(h => h.status === 'pendente');
  assert.ok(handoff, 'transferência aparece como pendente para a equipe');

  const handoffDone = await api('/api/admin/faq-handoff', {
    method: 'PATCH', cookie: tiCk,
    body: { id: handoff.id, status: 'concluido', response: 'Respondido pela equipe comercial no gate.', responsible_name: 'QA TI' },
  });
  assert.equal(handoffDone.status, 200, JSON.stringify(handoffDone.body));

  const segment = await api('/api/admin/pub-segments', {
    method: 'POST', cookie: tiCk,
    body: {
      segment_key: 'qa-gap-condominio', name: 'Condomínios QA GAP', segment_type: 'condominio',
      description: 'Página de segmento sintética do gate, sem promessa de resultado.',
      audience: 'Síndicos e conselheiros de condomínios residenciais.',
      benefits: 'Redução de custo administrativo e responsabilidade trabalhista.',
    },
  });
  assert.equal(segment.status, 201, JSON.stringify(segment.body));
  const segmentPub = await api('/api/admin/pub-segments', {
    method: 'PATCH', cookie: tiCk, body: { id: segment.body.id, is_published: true, is_validated: true, reason: 'Publicação validada no gate' },
  });
  assert.equal(segmentPub.status, 200, JSON.stringify(segmentPub.body));
  const segPublic = await api('/api/segments?published=true');
  assert.equal(segPublic.status, 200);
  assert.ok(JSON.stringify(segPublic.body).includes('Condomínios QA GAP'), 'segmento publicado é legível no site (PUB-02)');
});

test('L04 GAP-B: /admin/crm e /admin/site navegáveis em Chromium real', { skip: !RUN, timeout: 240_000 }, async (t) => {
  if (!S.comercial) return t.skip('GAP-A não concluiu — sem dados para navegar');

  // Um navegador por persona: este Chromium empacotado roda em processo único
  // e não sobrevive ao encerramento do primeiro contexto.
  const browser = await launchBrowser();
  try {
    // ----------------------------------------------------------------
    // /admin/crm com a identidade comercial: as seis abas com dado real.
    // ----------------------------------------------------------------
    const failures = [];
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
    await context.addCookies(cookiePairs(S.comercial.cookie));
    const page = await context.newPage();
    trackFailures(page, failures);

    await page.goto(`${baseUrl}/admin/crm`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200); // Fast Refresh pode trocar o DOM logo após o primeiro paint

    await page.getByRole('heading', { name: /Empresas, funil, tarefas e carteira/i }).waitFor({ timeout: 60_000 });
    for (const name of [/Empresas & contatos/, /Funil & oportunidades/, /Tarefas & cadências/, /Agenda de visitas/, /Histórico & anexos/, /Carteira & renovação/]) {
      await page.getByRole('button', { name }).waitFor({ timeout: 30_000 });
    }

    // Empresas: busca real filtra a lista
    await page.getByLabel('Buscar empresa').fill('Unidade Filha QA GAP');
    // A lista é a fonte da prova; o mesmo nome também existe como <option> no
    // seletor de matriz do formulário, então a busca é escopada à tabela.
    const empresasTable = page.getByRole('table').first();
    await empresasTable.getByText('Unidade Filha QA GAP').first().waitFor({ timeout: 20_000 });
    await empresasTable.getByText('unidade de grupo').first().waitFor({ timeout: 20_000 });
    await assertNoHorizontalScroll(page, '/admin/crm (empresas, 1440px)');

    // Funil: kanban mostra a oportunidade e o detalhe traz o histórico de estágios
    await page.getByRole('button', { name: /Funil & oportunidades/ }).click();
    await page.getByRole('button', { name: 'Portaria 24h para o Grupo Matriz QA GAP' }).waitFor({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Portaria 24h para o Grupo Matriz QA GAP' }).click();
    await page.getByText(/Histórico de estágios/).waitFor({ timeout: 20_000 });
    await page.getByText(/Preço acima do orçamento aprovado em assembleia/).first().waitFor({ timeout: 20_000 });

    // Tarefas: tarefa vencida sinalizada e cadência visível
    await page.getByRole('button', { name: /Tarefas & cadências/ }).click();
    await page.getByText('Ligar para a matriz QA GAP').first().waitFor({ timeout: 30_000 });
    await page.getByText('vencida', { exact: true }).first().waitFor({ timeout: 20_000 });
    await page.getByText(/cadência prospeccao-inicial/).first().waitFor({ timeout: 20_000 });
    await assertNoHorizontalScroll(page, '/admin/crm (tarefas, 1440px)');

    // Agenda: visita realizada aparece com estado
    await page.getByRole('button', { name: /Agenda de visitas/ }).click();
    await page.getByText('Vistoria técnica QA GAP').first().waitFor({ timeout: 30_000 });
    await page.getByText('realizada', { exact: true }).first().waitFor({ timeout: 20_000 });

    // Histórico: linha do tempo com ligação e anexo listado
    await page.getByRole('button', { name: /Histórico & anexos/ }).click();
    await page.getByLabel('Empresa').first().selectOption({ label: 'Grupo Matriz QA GAP' });
    await page.getByText(/Linha do tempo \(\d+\)/).waitFor({ timeout: 30_000 });
    let timelineText = '';
    const timelineDeadline = Date.now() + 30_000;
    while (Date.now() < timelineDeadline) {
      timelineText = await page.locator('body').innerText();
      if (timelineText.includes('Ligação de qualificação QA GAP') && timelineText.includes('Nota interna QA GAP')) break;
      await page.waitForTimeout(500);
    }
    assert.ok(timelineText.includes('Ligação de qualificação QA GAP'),
      `ligação deve aparecer na linha do tempo. Tela: ${timelineText.slice(0, 2000)}`);
    assert.ok(timelineText.includes('Nota interna QA GAP'),
      `nota interna deve aparecer na linha do tempo. Tela: ${timelineText.slice(0, 2000)}`);
    assert.ok(timelineText.includes('Anexos (1)'), 'o anexo da ligação é contado na linha do tempo');

    // Carteira: números e listas da CRM-10
    await page.getByRole('button', { name: /Carteira & renovação/ }).click();
    await page.getByText('Sem próxima ação').first().waitFor({ timeout: 30_000 });
    await page.getByText('Retorno sobre parceria QA GAP').first().waitFor({ timeout: 20_000 });
    await page.getByText('Renovação contrato matriz QA GAP').first().waitFor({ timeout: 20_000 });
    await page.getByText('Cliente Inato QA GAP').first().waitFor({ timeout: 20_000 });
    await page.getByText('Unidade Filha QA GAP').first().waitFor({ timeout: 20_000 });
    await assertNoHorizontalScroll(page, '/admin/crm (carteira, 1440px)');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);
    await assertNoHorizontalScroll(page, '/admin/crm (carteira, 390px)');

    assert.deepEqual(failures, [], 'nenhum erro de console/rede/5xx em /admin/crm');
  } finally {
    await browser.close();
  }

  // ----------------------------------------------------------------
  // /admin/site com a identidade de TI: os seis componentes conectados.
  // ----------------------------------------------------------------
  const tiBrowser = await launchBrowser();
  try {
    const siteFailures = [];
    const tiContext = await tiBrowser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
    await tiContext.addCookies(cookiePairs(S.ti.cookie));
    const sitePage = await tiContext.newPage();
    trackFailures(sitePage, siteFailures);

    await sitePage.goto(`${baseUrl}/admin/site`, { waitUntil: 'networkidle' });
    await sitePage.waitForTimeout(1200);
    await sitePage.getByRole('heading', { name: /Conteúdo, tema, SEO, pacotes e métricas/i }).waitFor({ timeout: 60_000 });

    for (const name of [/FAQ assistida & segmentos/, /Conteúdo \(CMS\)/, /Temas/, /SEO & domínio/, /Pacotes & comparador/, /Métricas de origem/]) {
      await sitePage.getByRole('button', { name }).waitFor({ timeout: 30_000 });
    }

    await sitePage.getByRole('button', { name: /Conteúdo \(CMS\)/ }).click();
    await sitePage.getByText(/qa-gap-pagina/).first().waitFor({ timeout: 30_000 });

    await sitePage.getByRole('button', { name: /^Temas$/ }).click();
    await sitePage.getByText(/Tema QA L04 GAP/).first().waitFor({ timeout: 30_000 });

    await sitePage.getByRole('button', { name: /SEO & domínio/ }).click();
    await sitePage.getByText(/portaria-antiga-gap|servicos\/portaria-gap/).first().waitFor({ timeout: 30_000 });

    await sitePage.getByRole('button', { name: /Pacotes & comparador/ }).click();
    await sitePage.getByText(/Pacote Essencial QA GAP/).first().waitFor({ timeout: 30_000 });

    await sitePage.getByRole('button', { name: /Métricas de origem/ }).click();
    await sitePage.getByText(/l04-gap/).first().waitFor({ timeout: 30_000 });

    await sitePage.getByRole('button', { name: /FAQ assistida & segmentos/ }).click();
    // As listas do componente PUB-02/05 vivem dentro de <details> fechados:
    // o gate abre como um operador abriria.
    await sitePage.getByText(/Regras FAQ assistida \(\d+\)/).click();
    await sitePage.getByText('qa-gap-atendimento').first().waitFor({ timeout: 30_000 });
    await sitePage.getByText(/Segmentos validados \(\d+\)/).click();
    await sitePage.getByText(/qa-gap-condominio/).first().waitFor({ timeout: 30_000 });

    await assertNoHorizontalScroll(sitePage, '/admin/site (1440px)');
    assert.deepEqual(siteFailures, [], 'nenhum erro de console/rede/5xx em /admin/site');
  } finally {
    await tiBrowser.close();
  }
});
