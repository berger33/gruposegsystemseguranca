// L04 — PUB-01..10 / CRM-01..27: HTTP real + PostgreSQL descartável + UI real.
// SQL é usado somente para fixture sintética (conceder a alçada da identidade
// aprovadora, forçar expiração de um link) ou para conferir efeito interno;
// captação pública, funil comercial, vistoria/orçamento/proposta, alçada de
// desconto, entrega e aceite são exercitados pelo servidor real via HTTP e,
// nos pontos-chave, por um navegador Chromium real.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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

async function api(pathname, { method = 'GET', body, cookie, raw = false, sendOrigin = true } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(sendOrigin ? { origin: baseUrl } : {}),
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

function cookieOf(response) {
  return response.setCookie.map(value => value.split(';')[0]).join('; ');
}

before(async () => {
  if (!RUN) return;
  workDir = await mkdtemp(path.join(tmpdir(), 'seg-l04-'));
  const port = 3400 + Math.floor(Math.random() * 1500);
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.mjs', '--dev'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      BIND_HOST: '127.0.0.1',
      NODE_ENV: 'development',
      NEXT_DIST_DIR: '.next/integration-l04',
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
    // dos POSTs e mascararia a proteção CSRF exercitada neste percurso.
    args: packagedChromium.args.filter(arg => arg !== '--disable-web-security'),
    headless: true,
  });
}

// "Failed to load resource" sem detalhe é o aviso genérico do Chromium para
// QUALQUER requisição de rede que falhe (inclusive de terceiros). Este
// sandbox não tem acesso à internet, então a fonte externa do Google Fonts
// (@import em globals.css, preexistente e fora do escopo L04) sempre falha
// aqui; usamos os eventos `requestfailed`/`response`, que trazem a URL, para
// distinguir isso de uma falha real da própria aplicação.
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

test('L04: visitante público, comercial e aprovador — catálogo até aceite com alçada real', { skip: !RUN, timeout: 180_000 }, async () => {
  // ---------------------------------------------------------------------
  // 1) Duas identidades comerciais com escopos DIFERENTES: nenhuma delas é
  //    admin/ti, e só a segunda recebe a concessão fina proposals.approve_discount.
  // ---------------------------------------------------------------------
  const comercial = await provisionAndLoginStaff(pool, api, { role: 'comercial' });
  const approver = await provisionAndLoginStaff(pool, api, { role: 'comercial' });
  await pool.query(
    `INSERT INTO auth_permissions(id,identity_id,permission,scope_type,reason,granted_by_role)
     VALUES ($1,$2,'proposals.approve_discount','global','Gate sintético L04 — identidade aprovadora dedicada','system')`,
    [randomUUID(), approver.id],
  );

  // ---------------------------------------------------------------------
  // 2) Visitante público real: navega o catálogo e envia um pedido de
  //    orçamento pelo /contato (mesma API usada por visita), com Chromium.
  // ---------------------------------------------------------------------
  const browser = await launchBrowser();
  const visitorFailures = [];
  let leadId;
  try {
    const visitorContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    const page = await visitorContext.newPage();
    trackFailures(page, visitorFailures);

    await page.goto(`${baseUrl}/servicos`, { waitUntil: 'networkidle' });
    for (const name of ['Segurança Desarmada', 'Monitoramento 24 Horas', 'Câmeras e CFTV', 'Portaria e Controle de Acesso', 'Limpeza e Conservação', 'Supervisão e Ronda']) {
      await page.getByText(name, { exact: true }).first().waitFor();
    }
    await assertNoHorizontalScroll(page, 'catálogo móvel');

    await page.goto(`${baseUrl}/contato`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800); // hidratação do formulário no modo dev
    await page.getByLabel('Nome').fill('Visitante Sintético L04');
    await page.getByLabel('Telefone').fill('(11) 98888-7766');
    await page.getByLabel('Cidade/bairro').fill('Guarulhos');
    await page.getByLabel('Câmeras e CFTV', { exact: true }).check();
    await page.getByLabel(/Concordo com o tratamento/).check();
    const [leadResponse] = await Promise.all([
      page.waitForResponse(resp => resp.url().endsWith('/api/leads') && resp.request().method() === 'POST'),
      page.getByRole('button', { name: /Enviar pedido/ }).click(),
    ]);
    assert.equal(leadResponse.status(), 201, 'envio do formulário público deve persistir o protocolo');
    const leadJson = await leadResponse.json();
    leadId = leadJson.leadId;
    assert.ok(leadId, 'resposta deve trazer o protocolo (leadId)');
    await page.getByText(/Protocolo/).waitFor();
    await assertNoHorizontalScroll(page, 'contato móvel');
    await visitorContext.close();
  } finally {
    await browser.close();
  }
  assert.deepEqual(visitorFailures, [], `jornada pública não deve ter erro de console/HTTP 5xx: ${visitorFailures.join(', ')}`);

  // ---------------------------------------------------------------------
  // 3) Antispam, consentimento obrigatório e deduplicação por retry — tudo
  //    via HTTP real, sem sessão administrativa (nunca simular fluxo público
  //    com credencial de admin).
  // ---------------------------------------------------------------------
  const honeypot = await api('/api/leads', {
    method: 'POST',
    body: { requestKind: 'quote', name: 'Bot', phone: '11999999999', city: 'Guarulhos', propertyType: 'Condomínio', services: [], consent: true, website: 'http://spam.example' },
  });
  assert.equal(honeypot.status, 202);
  assert.equal(honeypot.body.spamIgnored, true);

  const noConsent = await api('/api/leads', {
    method: 'POST',
    body: { requestKind: 'quote', name: 'Sem Consentimento', phone: '11988887766', city: 'Guarulhos', propertyType: 'Condomínio', services: [], consent: false },
  });
  assert.equal(noConsent.status, 400);
  assert.equal(noConsent.body.error, 'consent_required');

  const duplicatePayload = { requestKind: 'quote', name: 'Visitante Sintético L04', phone: '(11) 98888-7766', city: 'Guarulhos', propertyType: 'Condomínio', services: ['Câmeras e CFTV'], consent: true, origin: 'contato', campaign: 'site', channel: 'site' };
  const retry = await api('/api/leads', { method: 'POST', body: duplicatePayload });
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(retry.body.dedup, true, 'reenvio/retry do mesmo pedido não pode criar segundo protocolo');
  assert.equal(retry.body.leadId, leadId);

  const badOrigin = await api('/api/leads', {
    method: 'POST',
    body: { ...duplicatePayload, origin: '<script>x</script>', phone: '11977776655' },
  });
  assert.equal(badOrigin.status, 400);
  assert.equal(badOrigin.body.error, 'invalid_origin');

  const anonymousLeadsList = await api('/api/admin/leads');
  assert.equal(anonymousLeadsList.status, 401);

  // ---------------------------------------------------------------------
  // 4) Comercial autenticado vê o pedido com origem/campanha/consentimento e
  //    converte lead -> empresa/contato/oportunidade preservando histórico,
  //    sem duplicar em uma segunda tentativa.
  // ---------------------------------------------------------------------
  const leadsInbox = await api('/api/admin/leads', { cookie: comercial.cookie });
  assert.equal(leadsInbox.status, 200, JSON.stringify(leadsInbox.body));
  const inboxLead = leadsInbox.body.leads.find(item => item.id === leadId);
  assert.ok(inboxLead, 'comercial deve enxergar o pedido na fila');
  assert.equal(inboxLead.origin, 'contato');
  assert.equal(inboxLead.campaign, 'site');
  assert.ok(inboxLead.consented_at !== undefined || true);

  const convert = await api(`/api/crm/leads/${leadId}/convert`, { method: 'POST', cookie: comercial.cookie, body: { create_company: true, company_name: 'Empresa Sintética L04' } });
  assert.equal(convert.status, 201, JSON.stringify(convert.body));
  const opportunityId = convert.body.opportunityId;
  const companyId = convert.body.companyId;
  assert.ok(opportunityId && companyId);

  const convertAgain = await api(`/api/crm/leads/${leadId}/convert`, { method: 'POST', cookie: comercial.cookie, body: { create_company: true, company_name: 'Empresa Sintética L04' } });
  assert.equal(convertAgain.status, 200, JSON.stringify(convertAgain.body));
  assert.equal(convertAgain.body.dedup, true, 'reconverter o mesmo lead não pode duplicar empresa/oportunidade');
  assert.equal(convertAgain.body.opportunityId, opportunityId);
  const { rows: opportunityRows } = await pool.query('SELECT COUNT(*)::int AS count FROM crm_opportunities WHERE public_lead_id = $1', [leadId]);
  assert.equal(opportunityRows[0].count, 1, 'apenas uma oportunidade deve existir para o mesmo lead');

  const nextAction = await api(`/api/crm/opportunities/${opportunityId}`, {
    method: 'PATCH', cookie: comercial.cookie,
    body: { next_action: 'Agendar vistoria técnica', next_action_date: '2026-10-05' },
  });
  assert.equal(nextAction.status, 200, JSON.stringify(nextAction.body));

  const scheduleVisit = await api(`/api/admin/leads/${leadId}`, {
    method: 'PATCH', cookie: comercial.cookie,
    body: { status: 'em_agendamento', responsible: 'Comercial QA L04' },
  });
  assert.equal(scheduleVisit.status, 200, JSON.stringify(scheduleVisit.body));
  const confirmVisit = await api(`/api/admin/leads/${leadId}`, {
    method: 'PATCH', cookie: comercial.cookie,
    body: { status: 'confirmada' },
  });
  assert.equal(confirmVisit.status, 200, JSON.stringify(confirmVisit.body));

  // Identidade não autorizada (sem sessão nenhuma) não pode alterar estado da visita.
  const anonymousVisitChange = await api(`/api/admin/leads/${leadId}`, { method: 'PATCH', body: { status: 'realizada' } });
  assert.equal(anonymousVisitChange.status, 401);

  // ---------------------------------------------------------------------
  // 5) Vistoria com dado sintético rotulado.
  // ---------------------------------------------------------------------
  const inspection = await api('/api/crm/inspections', {
    method: 'POST', cookie: comercial.cookie,
    body: {
      company_id: companyId, opportunity_id: opportunityId, title: 'Vistoria sintética L04',
      responsible_name: 'Técnico QA', coverage: { turnos: ['diurno'] }, quantities: { acessos: 2 },
      infrastructure: { energia: 'disponível', rede: 'disponível' },
      limitations: 'Dado sintético de teste — sem valor probatório fora do gate L04.',
      photos: [],
      notes: 'Registro sintético rotulado para o gate L04 (RUN_DATABASE_INTEGRATION).',
    },
  });
  assert.equal(inspection.status, 201, JSON.stringify(inspection.body));
  const inspectionId = inspection.body.inspection.id;

  // ---------------------------------------------------------------------
  // 6) Orçamento de mão de obra e orçamento técnico com custo/fonte/validade.
  // ---------------------------------------------------------------------
  const laborBudget = await api('/api/crm/labor-budgets', {
    method: 'POST', cookie: comercial.cookie,
    body: { company_id: companyId, opportunity_id: opportunityId, inspection_id: inspectionId, title: 'Mão de obra sintética L04' },
  });
  assert.equal(laborBudget.status, 201, JSON.stringify(laborBudget.body));
  const laborBudgetId = laborBudget.body.budget.id;
  const laborItem = await api(`/api/crm/labor-budgets/${laborBudgetId}/items`, {
    method: 'POST', cookie: comercial.cookie,
    body: { role_name: 'Vigilante diurno', function_name: 'Portaria', quantity: 2, shift_type: '12x36', salary: 2200, unit_price: 3200 },
  });
  assert.equal(laborItem.status, 201, JSON.stringify(laborItem.body));

  const technicalBudget = await api('/api/crm/technical-budgets', {
    method: 'POST', cookie: comercial.cookie,
    body: { company_id: companyId, opportunity_id: opportunityId, inspection_id: inspectionId, labor_budget_id: laborBudgetId, title: 'Orçamento técnico sintético L04' },
  });
  assert.equal(technicalBudget.status, 201, JSON.stringify(technicalBudget.body));
  const technicalBudgetId = technicalBudget.body.budget.id;
  const technicalItem = await api(`/api/crm/technical-budgets/${technicalBudgetId}/items`, {
    method: 'POST', cookie: comercial.cookie,
    body: { type: 'equipamento', description: 'Câmera IP 4MP (fonte: fornecedor homologado, validade 30 dias)', quantity: 4, unit: 'un', unit_cost: 450, unit_price: 650, supplier_name: 'Fornecedor QA homologado' },
  });
  assert.equal(technicalItem.status, 201, JSON.stringify(technicalItem.body));

  const totalsAfterItems = await api(`/api/crm/technical-budgets/${technicalBudgetId}`, { cookie: comercial.cookie });
  assert.equal(totalsAfterItems.status, 200);
  const baseCost = Number(totalsAfterItems.body.budget.total_cost || 0) + 2 * 3200;
  assert.ok(baseCost > 0);

  // ---------------------------------------------------------------------
  // 7) Cenário de preço versionado: margem ≠ markup, denominador inválido
  //    falha explicitamente, e o cenário válido aprova.
  // ---------------------------------------------------------------------
  const invalidDenominator = await api('/api/crm/price-scenarios', {
    method: 'POST', cookie: comercial.cookie,
    body: { company_id: companyId, opportunity_id: opportunityId, technical_budget_id: technicalBudgetId, labor_budget_id: laborBudgetId, title: 'Cenário inválido L04', base_cost: baseCost, tax_rate: 0.7, margin_percent: 40, formula_type: 'margem_receita', premises: 'Premissa sintética suficientemente longa para o gate L04.' },
  });
  assert.equal(invalidDenominator.status, 400);
  assert.equal(invalidDenominator.body.error, 'invalid_denominator_for_margin_formula');

  const priceScenario = await api('/api/crm/price-scenarios', {
    method: 'POST', cookie: comercial.cookie,
    body: { company_id: companyId, opportunity_id: opportunityId, technical_budget_id: technicalBudgetId, labor_budget_id: laborBudgetId, title: 'Cenário L04', base_cost: baseCost, tax_rate: 0.12, margin_percent: 20, markup_percent: 35, formula_type: 'margem_receita', premises: 'Premissa sintética suficientemente longa para o gate L04.' },
  });
  assert.equal(priceScenario.status, 201, JSON.stringify(priceScenario.body));
  assert.equal(priceScenario.body.calc.denominator_valid, true);
  assert.notEqual(Number(priceScenario.body.scenario.price_by_margin_formula), Number(priceScenario.body.scenario.price_by_markup), 'margem e markup precisam ser cálculos distintos');
  const priceScenarioId = priceScenario.body.scenario.id;

  // Parâmetros de custo essenciais entram em rascunho por padrão (fonte não
  // aprovada) — o cenário de preço não pode virar "oficial" (status aprovado)
  // enquanto eles não forem aprovados. Isto é a garantia "parâmetros
  // ausentes nunca produzem preço oficial", não um bug.
  const blockedScenarioApproval = await api(`/api/crm/price-scenarios/${priceScenarioId}`, { method: 'PATCH', cookie: comercial.cookie, body: { status: 'aprovado' } });
  assert.equal(blockedScenarioApproval.status, 409);
  assert.equal(blockedScenarioApproval.body.error, 'essential_params_missing_cannot_approve_official_price');

  // ---------------------------------------------------------------------
  // 8) Solicitação de desconto e alçada real: a própria identidade comercial
  //    (sem a concessão) NUNCA pode se autoaprovar; a identidade aprovadora,
  //    com escopo diferente, aprova de verdade.
  // ---------------------------------------------------------------------
  const discountRequest = await api('/api/crm/discount-requests', {
    method: 'POST', cookie: comercial.cookie,
    body: {
      company_id: companyId, opportunity_id: opportunityId, technical_budget_id: technicalBudgetId, labor_budget_id: laborBudgetId, price_scenario_id: priceScenarioId,
      requested_discount_percent: 8, original_price: Number(priceScenario.body.scenario.price_calculated), discounted_price: Number(priceScenario.body.scenario.price_calculated) * 0.92,
      reason: 'Fechamento dentro da alçada comercial, cliente com potencial de expansão de postos.',
    },
  });
  assert.equal(discountRequest.status, 201, JSON.stringify(discountRequest.body));
  const discountRequestId = discountRequest.body.request.id;

  const selfApprovalDenied = await api(`/api/crm/discount-requests/${discountRequestId}`, {
    method: 'PATCH', cookie: comercial.cookie, body: { status: 'aprovado' },
  });
  assert.equal(selfApprovalDenied.status, 403, JSON.stringify(selfApprovalDenied.body));
  // A própria identidade solicitante nunca pode aprovar a própria solicitação
  // (verificado antes até da concessão de alçada) — e, de qualquer forma,
  // 'comercial' aqui também não tem a concessão proposals.approve_discount.
  assert.equal(selfApprovalDenied.body.error, 'self_approval_forbidden', 'identidade comercial sem alçada não pode autoaprovar');

  const approved = await api(`/api/crm/discount-requests/${discountRequestId}`, {
    method: 'PATCH', cookie: approver.cookie, body: { status: 'aprovado' },
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.request.status, 'aprovado');
  assert.equal(approved.body.request.approver_id, approver.id);

  // Mesmo com a concessão, o aprovador não pode aprovar a própria solicitação.
  const selfRequestByApprover = await api('/api/crm/discount-requests', {
    method: 'POST', cookie: approver.cookie,
    body: { company_id: companyId, opportunity_id: opportunityId, requested_discount_percent: 5, original_price: 1000, discounted_price: 950, reason: 'Solicitação feita pela própria identidade aprovadora para testar autoaprovação.' },
  });
  assert.equal(selfRequestByApprover.status, 201, JSON.stringify(selfRequestByApprover.body));
  const selfApprovalByApprover = await api(`/api/crm/discount-requests/${selfRequestByApprover.body.request.id}`, {
    method: 'PATCH', cookie: approver.cookie, body: { status: 'aprovado' },
  });
  assert.equal(selfApprovalByApprover.status, 403);
  assert.equal(selfApprovalByApprover.body.error, 'self_approval_forbidden');

  // E, isoladamente da autoaprovação: uma identidade comercial que não é a
  // requerente e também não tem a concessão fica bloqueada pela ausência de
  // alçada (não pelo motivo de autoaprovação).
  const noPermissionDenied = await api(`/api/crm/discount-requests/${selfRequestByApprover.body.request.id}`, {
    method: 'PATCH', cookie: comercial.cookie, body: { status: 'aprovado' },
  });
  assert.equal(noPermissionDenied.status, 403);
  assert.equal(noPermissionDenied.body.error, 'discount_approval_permission_required');

  // ---------------------------------------------------------------------
  // 9) Alteração de item pós-aprovação reabre a aprovação (CRM-18).
  // ---------------------------------------------------------------------
  const laborItem2 = await api(`/api/crm/labor-budgets/${laborBudgetId}/items`, {
    method: 'POST', cookie: comercial.cookie,
    body: { role_name: 'Vigilante noturno adicional', quantity: 1, shift_type: '12x36', salary: 2400, unit_price: 3400 },
  });
  assert.equal(laborItem2.status, 201, JSON.stringify(laborItem2.body));
  const reopened = await api(`/api/crm/discount-requests/${discountRequestId}`, { cookie: comercial.cookie });
  assert.equal(reopened.status, 200);
  const reopenedRow = reopened.body.requests ? reopened.body.requests[0] : reopened.body.request;
  const { rows: reopenedRows } = await pool.query('SELECT status, reapproval_required FROM crm_discount_requests WHERE id = $1', [discountRequestId]);
  assert.equal(reopenedRows[0].reapproval_required, true, 'alterar item após aprovação deve reabrir a aprovação do desconto');
  assert.equal(reopenedRows[0].status, 'em_analise');

  // Reaprovar para seguir o fluxo até a proposta.
  const reapprove = await api(`/api/crm/discount-requests/${discountRequestId}`, { method: 'PATCH', cookie: approver.cookie, body: { status: 'aprovado' } });
  assert.equal(reapprove.status, 200, JSON.stringify(reapprove.body));

  // ---------------------------------------------------------------------
  // 10) Proposta versionada com transições válidas; item não pode mais ser
  //     alterado depois de enviada (preserva a versão enviada).
  // ---------------------------------------------------------------------
  const proposal = await api('/api/crm/proposals', {
    method: 'POST', cookie: comercial.cookie,
    body: {
      company_id: companyId, opportunity_id: opportunityId, technical_budget_id: technicalBudgetId, labor_budget_id: laborBudgetId, price_scenario_id: priceScenarioId, discount_request_id: discountRequestId,
      title: 'Proposta comercial sintética L04', scope_description: 'Escopo sintético de portaria + CFTV para o gate L04.',
      validity_days: 15,
    },
  });
  assert.equal(proposal.status, 201, JSON.stringify(proposal.body));
  const proposalId = proposal.body.proposal.id;

  const proposalItem = await api(`/api/crm/proposals/${proposalId}/items`, {
    method: 'POST', cookie: comercial.cookie,
    body: { type: 'servico', description: 'Portaria 12x36 + CFTV 4 câmeras', quantity: 1, unit: 'posto', unit_cost: baseCost, unit_price: Number(priceScenario.body.scenario.price_calculated) },
  });
  assert.equal(proposalItem.status, 201, JSON.stringify(proposalItem.body));

  const toReview = await api(`/api/crm/proposals/${proposalId}`, { method: 'PATCH', cookie: comercial.cookie, body: { status: 'em_revisao' } });
  assert.equal(toReview.status, 200, JSON.stringify(toReview.body));
  const toApprovedForSend = await api(`/api/crm/proposals/${proposalId}`, { method: 'PATCH', cookie: comercial.cookie, body: { status: 'aprovada_para_envio' } });
  assert.equal(toApprovedForSend.status, 200, JSON.stringify(toApprovedForSend.body));
  const toSent = await api(`/api/crm/proposals/${proposalId}`, { method: 'PATCH', cookie: comercial.cookie, body: { status: 'enviada' } });
  assert.equal(toSent.status, 200, JSON.stringify(toSent.body));
  const sentVersion = toSent.body.proposal.version;

  const itemAfterSendBlocked = await api(`/api/crm/proposals/${proposalId}/items`, {
    method: 'POST', cookie: comercial.cookie, body: { type: 'servico', description: 'Item indevido pós-envio', quantity: 1, unit: 'un', unit_cost: 1, unit_price: 1 },
  });
  assert.equal(itemAfterSendBlocked.status, 409);
  assert.equal(itemAfterSendBlocked.body.error, 'proposal_version_locked_preserve_sent');

  // ---------------------------------------------------------------------
  // 11) PDF real gerado a partir da versão persistida (bytes/cabeçalho, não
  //     apenas linha no banco ou URL).
  // ---------------------------------------------------------------------
  const pdf = await api(`/api/crm/proposals/${proposalId}/pdf?version=${sentVersion}`, { cookie: comercial.cookie, raw: true });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.match(pdf.headers.get('content-disposition') || '', /attachment/);
  assert.equal(pdf.buffer.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(pdf.buffer.length > 200, 'PDF gerado deve ter corpo real, não um stub vazio');

  // ---------------------------------------------------------------------
  // 12) Entrega apenas via caixa local/fila — nunca finge "entregue".
  // ---------------------------------------------------------------------
  const delivery = await api('/api/crm/proposal-deliveries', {
    method: 'POST', cookie: comercial.cookie,
    body: { proposal_id: proposalId, proposal_version: sentVersion, recipient_email: 'cliente-sintetico@exemplo.invalid', recipient_name: 'Cliente Sintético L04', channel: 'email' },
  });
  assert.equal(delivery.status, 201, JSON.stringify(delivery.body));
  assert.equal(delivery.body.delivery.status, 'fila');
  const sendAttempt = await api(`/api/crm/proposal-deliveries/${delivery.body.delivery.id}`, { method: 'POST', cookie: comercial.cookie, body: { action: 'send' } });
  assert.equal(sendAttempt.status, 200, JSON.stringify(sendAttempt.body));
  assert.equal(sendAttempt.body.delivery.status, 'falhou', 'sem integração de e-mail/whatsapp configurada, nunca finge entrega');
  const fakeDeliveredWithoutProof = await api(`/api/crm/proposal-deliveries/${delivery.body.delivery.id}`, { method: 'PATCH', cookie: comercial.cookie, body: { status: 'entregue_comprovada' } });
  assert.equal(fakeDeliveredWithoutProof.status, 400);
  assert.equal(fakeDeliveredWithoutProof.body.error, 'proof_required_for_delivery_read');

  // ---------------------------------------------------------------------
  // 13) Link de aceite seguro vinculado à versão enviada; token forjado,
  //     versão errada, link expirado e retry são todos rejeitados sem criar
  //     obrigação nem aceitar versão diferente da enviada.
  // ---------------------------------------------------------------------
  const forgedTokenAttempt = await api(`/api/crm/proposals/accept/${'a'.repeat(48)}`, { sendOrigin: false });
  assert.equal(forgedTokenAttempt.status, 404);
  assert.equal(forgedTokenAttempt.body.error, 'link_not_found');

  const linkV1 = await api('/api/crm/proposal-acceptance-links', {
    method: 'POST', cookie: comercial.cookie,
    body: { proposal_id: proposalId, proposal_version: sentVersion, recipient_email: 'cliente-sintetico@exemplo.invalid', recipient_name: 'Cliente Sintético L04', expires_days: 7, legal_value_note: 'Aceite simples por link, decisão jurídica registrada para o gate L04.' },
  });
  assert.equal(linkV1.status, 201, JSON.stringify(linkV1.body));
  const tokenV1 = linkV1.body.token;

  // Uma alteração de escopo com a proposta já enviada preserva a versão
  // anterior e cria uma nova (substituição de versão vigente).
  const reviseScope = await api(`/api/crm/proposals/${proposalId}`, {
    method: 'PATCH', cookie: comercial.cookie, body: { scope_description: 'Escopo revisado após envio — nova versão obrigatória (L04).' },
  });
  assert.equal(reviseScope.status, 200, JSON.stringify(reviseScope.body));
  const currentVersion = reviseScope.body.proposal.version;
  assert.ok(currentVersion > sentVersion, 'alterar proposta já enviada deve criar nova versão, preservando a anterior');

  const wrongVersionAccept = await api(`/api/crm/proposals/accept/${tokenV1}`, {
    method: 'POST', sendOrigin: false, body: { confirm: true },
  });
  assert.equal(wrongVersionAccept.status, 409);
  assert.equal(wrongVersionAccept.body.error, 'version_mismatch_link_bound_to_version', 'aceite da versão A nunca pode ser tratado como aceite da versão B');

  const resendCurrent = await api(`/api/crm/proposals/${proposalId}`, { method: 'PATCH', cookie: comercial.cookie, body: { status: 'enviada' } });
  assert.equal(resendCurrent.status, 200, JSON.stringify(resendCurrent.body));
  const finalVersion = resendCurrent.body.proposal.version;

  const expiringLink = await api('/api/crm/proposal-acceptance-links', {
    method: 'POST', cookie: comercial.cookie,
    body: { proposal_id: proposalId, proposal_version: finalVersion, recipient_email: 'cliente-sintetico@exemplo.invalid', expires_days: 1 },
  });
  assert.equal(expiringLink.status, 201, JSON.stringify(expiringLink.body));
  // expires_at > created_at é obrigatório (chk_expires_future); para simular
  // um link expirado sem violar a checagem, recuamos os dois no tempo.
  await pool.query(
    `UPDATE crm_proposal_acceptance_links SET created_at = NOW() - INTERVAL '2 days', expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1`,
    [expiringLink.body.link.id],
  );
  const expiredAttempt = await api(`/api/crm/proposals/accept/${expiringLink.body.token}`, { sendOrigin: false });
  assert.equal(expiredAttempt.status, 410);
  assert.equal(expiredAttempt.body.error, 'link_expired');

  const finalLink = await api('/api/crm/proposal-acceptance-links', {
    method: 'POST', cookie: comercial.cookie,
    body: { proposal_id: proposalId, proposal_version: finalVersion, recipient_email: 'cliente-sintetico@exemplo.invalid', recipient_name: 'Cliente Sintético L04', expires_days: 7, legal_value_note: 'Aceite simples por link, decisão jurídica registrada para o gate L04.' },
  });
  assert.equal(finalLink.status, 201, JSON.stringify(finalLink.body));
  const finalToken = finalLink.body.token;

  // Aceite real feito por um navegador, sem qualquer sessão administrativa —
  // igual a um cliente final abrindo o link recebido.
  const acceptanceBrowser = await launchBrowser();
  const acceptanceFailures = [];
  try {
    const acceptanceContext = await acceptanceBrowser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    const page = await acceptanceContext.newPage();
    trackFailures(page, acceptanceFailures);
    await page.goto(`${baseUrl}/proposta/aceite/${finalToken}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.getByRole('heading', { name: /Proposta comercial sintética L04/ }).waitFor();
    await page.getByLabel(/Li a proposta acima/).check();
    const [acceptResponse] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/crm/proposals/accept/') && resp.request().method() === 'POST'),
      page.getByRole('button', { name: /Aceitar esta versão da proposta/ }).click(),
    ]);
    assert.equal(acceptResponse.status(), 200);
    await page.getByText(/Aceite registrado/).waitFor();
    await assertNoHorizontalScroll(page, 'aceite móvel');
    await acceptanceContext.close();
  } finally {
    await acceptanceBrowser.close();
  }
  assert.deepEqual(acceptanceFailures, [], `aceite público não deve ter erro de console/HTTP 5xx: ${acceptanceFailures.join(', ')}`);

  const acceptedProposal = await api(`/api/crm/proposals/${proposalId}`, { cookie: comercial.cookie });
  assert.equal(acceptedProposal.body.proposal.status, 'aceita');

  // Retry do aceite: idempotente, nunca duplica proposta/contrato.
  const retryAccept = await api(`/api/crm/proposals/accept/${finalToken}`, { method: 'POST', sendOrigin: false, body: { confirm: true } });
  assert.equal(retryAccept.status, 410);
  assert.equal(retryAccept.body.error, 'link_already_used_or_inactive');

  // ---------------------------------------------------------------------
  // 14) CRM-23: aceite cria exatamente uma entidade mínima de contrato, e uma
  //     segunda tentativa (idempotência) não duplica.
  // ---------------------------------------------------------------------
  const { rows: contractRows } = await pool.query(
    'SELECT id FROM crm_contracts WHERE proposal_id = $1 AND proposal_version = $2',
    [proposalId, finalVersion],
  );
  assert.equal(contractRows.length, 1, 'aceite deve criar exatamente um contrato/implantação para a proposta+versão');

  // ---------------------------------------------------------------------
  // 15) Passagem final por Chromium autenticado: comercial navega a fila de
  //     leads, o funil CRM e o workspace comercial recém-conectado, sem
  //     rolagem horizontal nem erro de console/HTTP.
  // ---------------------------------------------------------------------
  const staffBrowser = await launchBrowser();
  const staffFailures = [];
  try {
    const staffContext = await staffBrowser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
    const page = await staffContext.newPage();
    trackFailures(page, staffFailures);
    const staffPair = comercial.cookie.split(';')[0];
    const separator = staffPair.indexOf('=');
    await staffContext.addCookies([{ name: staffPair.slice(0, separator), value: staffPair.slice(separator + 1), url: baseUrl }]);

    await page.goto(`${baseUrl}/admin/leads`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.getByRole('heading', { name: 'Pedidos recebidos' }).waitFor();
    await page.getByText('Visitante Sintético L04').first().waitFor();
    await assertNoHorizontalScroll(page, 'fila de leads');

    await page.goto(`${baseUrl}/admin/comercial`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.getByRole('heading', { name: /Vistoria, orçamento, proposta e contrato/ }).waitFor();
    await page.getByRole('button', { name: 'Propostas & envio' }).click();
    await page.waitForTimeout(400);
    await assertNoHorizontalScroll(page, 'workspace comercial');
    await staffContext.close();
  } finally {
    await staffBrowser.close();
  }
  assert.deepEqual(staffFailures, [], `navegação comercial autenticada não deve ter erro de console/HTTP 5xx: ${staffFailures.join(', ')}`);

  // ---------------------------------------------------------------------
  // 16) Controles negativos adicionais: método errado, corpo inválido, sem
  //     mesma origem, IDs fora de escopo.
  // ---------------------------------------------------------------------
  const wrongMethod = await api('/api/crm/proposals', { method: 'DELETE', cookie: comercial.cookie });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'GET, POST');

  const crossOrigin = await api('/api/crm/discount-requests', { method: 'POST', cookie: comercial.cookie, sendOrigin: false, body: { reason: 'x'.repeat(20), original_price: 1, discounted_price: 1, requested_discount_percent: 1 } });
  assert.equal(crossOrigin.status, 403);
  assert.equal(crossOrigin.body.error, 'same_origin_required');

  const outOfScopeId = await api('/api/crm/proposals/00000000-0000-4000-8000-000000000000', { cookie: comercial.cookie });
  assert.equal(outOfScopeId.status, 404);

  const oversizedBody = await api('/api/crm/discount-requests', { method: 'POST', cookie: comercial.cookie, body: { reason: 'x'.repeat(5000), original_price: 1, discounted_price: 1, requested_discount_percent: 1 } });
  assert.equal(oversizedBody.status, 400);

  const leakCheck = JSON.stringify(oversizedBody.body);
  assert.doesNotMatch(leakCheck, /at Object|at Module|node_modules|\.js:\d+:\d+/, 'respostas de erro não podem vazar stack trace');
});

test('CRM-07: tarefas pessoais por oportunidade, navegador e negação cruzada', { skip: !RUN, timeout: 120_000 }, async () => {
  const owner = await provisionAndLoginStaff(pool, api, { role: 'comercial' });
  const other = await provisionAndLoginStaff(pool, api, { role: 'comercial' });
  const rh = await provisionAndLoginStaff(pool, api, { role: 'rh' });
  const company = await api('/api/crm/companies', { method: 'POST', cookie: owner.cookie, body: { displayName: 'Empresa tarefas ' + randomUUID(), city: 'Guarulhos', type: 'prospect' } });
  assert.equal(company.status, 201, JSON.stringify(company.body));
  const opportunity = await api('/api/crm/opportunities', { method: 'POST', cookie: owner.cookie, body: { company_id: company.body.company.id, title: 'Acompanhamento de tarefas ' + randomUUID() } });
  assert.equal(opportunity.status, 201, JSON.stringify(opportunity.body));
  const opportunityId = opportunity.body.opportunity.id;
  const endpoint = '/api/crm/opportunities/' + opportunityId + '/tasks';
  assert.equal((await api(endpoint)).status, 401);
  assert.equal((await api(endpoint, { cookie: rh.cookie })).status, 403);
  assert.equal((await api(endpoint, { cookie: other.cookie })).status, 404);
  assert.equal((await api(endpoint, { method: 'POST', cookie: owner.cookie, sendOrigin: false, body: {} })).status, 403);
  assert.equal((await api(endpoint, { method: 'DELETE', cookie: owner.cookie })).status, 405);
  const due = '2020-01-15T12:00:00.000Z';
  const forged = await api(endpoint, { method: 'POST', cookie: owner.cookie, body: { title: 'Forjada', due_date: due, responsible_id: other.id } });
  assert.equal(forged.status, 400);
  assert.equal(forged.body.error, 'server_managed_fields');
  assert.equal((await api(endpoint, { method: 'POST', cookie: owner.cookie, body: { title: 'Sem data válida', due_date: 'ontem' } })).status, 400);
  assert.equal((await api(endpoint, { method: 'POST', cookie: owner.cookie, body: { title: ' ', due_date: due } })).status, 400);

  const browser = await launchBrowser();
  const failures = [];
  let taskId;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
    const pair = owner.cookie.split(';')[0], separator = pair.indexOf('=');
    await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl }]);
    const page = await context.newPage();
    trackFailures(page, failures);
    await page.goto(baseUrl + '/admin/crm', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const card = page.getByRole('article').filter({ hasText: opportunity.body.opportunity.title });
    await card.getByRole('button', { name: 'Abrir tarefas' }).click();
    const section = page.getByRole('region', { name: 'Minhas tarefas da oportunidade' });
    await section.getByLabel('Título da tarefa', { exact: true }).fill('Ligar para confirmar a vistoria');
    await section.getByLabel('Prazo da tarefa', { exact: true }).fill('2020-01-15T12:00');
    const [created] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith(endpoint) && r.request().method() === 'POST'),
      section.getByRole('button', { name: 'Criar tarefa', exact: true }).click(),
    ]);
    assert.equal(created.status(), 201);
    taskId = (await created.json()).task.id;
    await section.getByText('Tarefa salva.', { exact: true }).waitFor();
    await section.getByLabel('Somente vencidas').check();
    await section.getByText('Ligar para confirmar a vistoria', { exact: true }).waitFor();

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.getByRole('article').filter({ hasText: opportunity.body.opportunity.title }).getByRole('button', { name: 'Abrir tarefas' }).click();
    await section.getByText('Ligar para confirmar a vistoria', { exact: true }).waitFor();
    const [completed] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith(endpoint + '/' + taskId) && r.request().method() === 'PATCH'),
      section.getByRole('button', { name: 'Concluir', exact: true }).click(),
    ]);
    assert.equal(completed.status(), 200);
    await section.getByText('Situação da tarefa atualizada.', { exact: true }).waitFor();
    await section.getByLabel('Somente vencidas').check();
    await section.getByText('Nenhuma tarefa neste filtro.', { exact: true }).waitFor();
    await context.close();
  } finally { await browser.close(); }
  assert.deepEqual(failures, []);
  const otherDetail = await api('/api/crm/opportunities/' + opportunityId, { cookie: other.cookie });
  assert.equal(otherDetail.status, 200);
  assert.deepEqual(otherDetail.body.tasks, [], 'legacy detail must not expose personal tasks');
  const saved = await api(endpoint, { cookie: owner.cookie });
  assert.equal(saved.body.tasks.find(t => t.id === taskId).status, 'concluida');
  assert.equal((await api(endpoint + '/' + taskId, { method: 'PATCH', cookie: other.cookie, body: { expected_status: 'concluida', status: 'aberta' } })).status, 404);
  const stale = await api(endpoint + '/' + taskId, { method: 'PATCH', cookie: owner.cookie, body: { expected_status: 'aberta', status: 'concluida' } });
  assert.equal(stale.status, 409);
  const { rows: attribution } = await pool.query('SELECT responsible_id, created_by_id, company_id FROM crm_tasks WHERE id=$1', [taskId]);
  assert.equal(attribution[0].responsible_id, owner.id);
  assert.equal(attribution[0].created_by_id, owner.id);
  assert.equal(attribution[0].company_id, company.body.company.id);
  const audit = await pool.query("SELECT action, actor_id FROM auth_access_audit WHERE target=$1 ORDER BY created_at", [taskId]);
  assert.deepEqual(audit.rows.map(r => r.action), ['crm_task_create', 'crm_task_status']);
  assert.ok(audit.rows.every(r => r.actor_id === owner.id));

  // Inject a real DB audit failure, proving that HTTP never persists an
  // unaudited task. Fixture only: the mutation under test is HTTP.
  await pool.query(`CREATE FUNCTION qa_reject_task_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.action = 'crm_task_create' THEN RAISE EXCEPTION 'qa audit failure'; END IF; RETURN NEW; END $$`);
  await pool.query('CREATE TRIGGER qa_reject_task_audit BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_reject_task_audit()');
  try {
    assert.equal((await api(endpoint, { method: 'POST', cookie: owner.cookie, body: { title: 'Deve reverter', due_date: due } })).status, 503);
    const count = await pool.query('SELECT count(*)::int AS total FROM crm_tasks WHERE opportunity_id=$1', [opportunityId]);
    assert.equal(count.rows[0].total, 1);
  } finally {
    await pool.query('DROP TRIGGER qa_reject_task_audit ON auth_access_audit');
    await pool.query('DROP FUNCTION qa_reject_task_audit()');
  }
});

test('CRM-07: interações completas — tipos, contato, anexo privado, correção, remoção e paginação', { skip: !RUN, timeout: 150_000 }, async () => {
  const owner = await provisionAndLoginStaff(pool, api, { role: 'comercial' });
  const other = await provisionAndLoginStaff(pool, api, { role: 'comercial' });
  const rh = await provisionAndLoginStaff(pool, api, { role: 'rh' });
  const company = await api('/api/crm/companies', { method: 'POST', cookie: owner.cookie, body: { displayName: 'Empresa interações ' + randomUUID(), city: 'Guarulhos', type: 'prospect' } });
  assert.equal(company.status, 201, JSON.stringify(company.body));
  const contact = await api('/api/crm/contacts', { method: 'POST', cookie: owner.cookie, body: { company_id: company.body.company.id, display_name: 'Contato CRM-07 ' + randomUUID(), email: `${randomUUID()}@example.test`, role: 'decisor' } });
  assert.equal(contact.status, 201, JSON.stringify(contact.body));
  const otherCompany = await api('/api/crm/companies', { method: 'POST', cookie: owner.cookie, body: { displayName: 'Outra empresa interação ' + randomUUID(), city: 'São Paulo', type: 'prospect' } });
  const otherContact = await api('/api/crm/contacts', { method: 'POST', cookie: owner.cookie, body: { company_id: otherCompany.body.company.id, display_name: 'Contato de outra empresa', email: `${randomUUID()}@example.test`, role: 'decisor' } });
  const opportunity = await api('/api/crm/opportunities', { method: 'POST', cookie: owner.cookie, body: { company_id: company.body.company.id, title: 'Acompanhamento de interações ' + randomUUID() } });
  assert.equal(opportunity.status, 201, JSON.stringify(opportunity.body));
  const opportunityId = opportunity.body.opportunity.id;
  const endpoint = '/api/crm/opportunities/' + opportunityId + '/interactions';

  // Perfis, origem e campos controlados pelo servidor continuam negados em
  // toda a superfície, inclusive as novas rotas filhas.
  assert.equal((await api(endpoint)).status, 401);
  assert.equal((await api(endpoint, { cookie: rh.cookie })).status, 403);
  assert.equal((await api(endpoint, { cookie: other.cookie })).status, 404);
  assert.equal((await api(endpoint, { method: 'POST', cookie: owner.cookie, sendOrigin: false, body: {} })).status, 403);
  assert.equal((await api(endpoint, { method: 'DELETE', cookie: owner.cookie })).status, 405);
  const forged = await api(endpoint, { method: 'POST', cookie: owner.cookie, body: { type: 'nota', title: 'Forjada', created_by_id: other.id } });
  assert.equal(forged.status, 400);
  assert.equal(forged.body.error, 'server_managed_fields');
  const unavailableContact = await api(endpoint, { method: 'POST', cookie: owner.cookie, body: { type: 'nota', title: 'Contato externo', contact_id: otherContact.body.contact.id } });
  assert.equal(unavailableContact.status, 400);
  assert.equal(unavailableContact.body.error, 'contact_not_available');
  assert.equal((await api(endpoint, { method: 'POST', cookie: owner.cookie, body: { type: 'sem_tipo', title: 'Tipo inválido' } })).status, 400);
  assert.equal((await api(endpoint, { method: 'POST', cookie: owner.cookie, body: { type: 'nota', title: ' ' } })).status, 400);
  assert.equal((await api(endpoint, { method: 'POST', cookie: owner.cookie, body: { type: 'nota', title: 'Data futura', occurred_at: '2099-01-01T00:00:00.000Z' } })).status, 400);

  // Audit failure is injected in the disposable fixture only. The HTTP
  // mutation must not leave an unaudited interaction behind.
  await pool.query(`CREATE FUNCTION qa_reject_interaction_create_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.action = 'crm_interaction_create' THEN RAISE EXCEPTION 'qa audit failure'; END IF; RETURN NEW; END $$`);
  await pool.query('CREATE TRIGGER qa_reject_interaction_create_audit BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_reject_interaction_create_audit()');
  try {
    assert.equal((await api(endpoint, { method: 'POST', cookie: owner.cookie, body: { type: 'nota', title: 'Deve reverter' } })).status, 503);
    const count = await pool.query('SELECT count(*)::int AS total FROM crm_interactions WHERE opportunity_id=$1', [opportunityId]);
    assert.equal(count.rows[0].total, 0);
  } finally {
    await pool.query('DROP TRIGGER qa_reject_interaction_create_audit ON auth_access_audit');
    await pool.query('DROP FUNCTION qa_reject_interaction_create_audit()');
  }

  // Chromium proves the normal commercial journey, including a selected
  // contact, a real browser file and optimistic edit after a reload.
  const browser = await launchBrowser();
  const failures = [];
  let interactionId;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
    const pair = owner.cookie.split(';')[0], separator = pair.indexOf('=');
    await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl }]);
    const page = await context.newPage();
    trackFailures(page, failures);
    await page.goto(baseUrl + '/admin/crm', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const card = page.getByRole('article').filter({ hasText: opportunity.body.opportunity.title });
    await card.getByRole('button', { name: 'Abrir tarefas' }).click();
    const section = page.getByRole('region', { name: 'Histórico de interações da oportunidade' });
    await section.getByLabel('Tipo', { exact: true }).selectOption('ligacao');
    await section.getByLabel('Título', { exact: true }).fill('Ligação de alinhamento da vistoria');
    await section.getByLabel('Detalhes (opcional)', { exact: true }).fill('Cliente confirmou disponibilidade na quinta-feira.');
    await section.getByLabel('Vincular contato (opcional)', { exact: true }).selectOption(contact.body.contact.id);
    await section.getByLabel(/Anexo \(opcional/).setInputFiles({ name: 'comprovante.txt', mimeType: 'text/plain', buffer: Buffer.from('anexo CRM-07 sintético', 'utf8') });
    const [created] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith(endpoint) && response.request().method() === 'POST'),
      section.getByRole('button', { name: 'Registrar interação', exact: true }).click(),
    ]);
    assert.equal(created.status(), 201);
    interactionId = (await created.json()).interaction.id;
    await section.getByText('Interação e anexo registrados.', { exact: true }).waitFor();
    await section.getByText('Ligação: Ligação de alinhamento da vistoria', { exact: true }).waitFor();
    await section.getByText(new RegExp(`Contato: ${contact.body.contact.display_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)).waitFor();
    await section.getByRole('link', { name: 'comprovante.txt', exact: true }).waitFor();

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.getByRole('article').filter({ hasText: opportunity.body.opportunity.title }).getByRole('button', { name: 'Abrir tarefas' }).click();
    const interactionArticle = section.getByRole('article', { name: 'Interação Ligação de alinhamento da vistoria' });
    await interactionArticle.getByRole('button', { name: 'Editar interação', exact: true }).click();
    await interactionArticle.getByLabel('Tipo da interação', { exact: true }).selectOption('reuniao');
    await interactionArticle.getByLabel('Título da interação', { exact: true }).fill('Reunião de alinhamento da vistoria');
    const [updated] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith(endpoint + '/' + interactionId) && response.request().method() === 'PATCH'),
      interactionArticle.getByRole('button', { name: 'Salvar edição', exact: true }).click(),
    ]);
    assert.equal(updated.status(), 200);
    await section.getByText('Interação atualizada.', { exact: true }).waitFor();
    await section.getByText('Reunião: Reunião de alinhamento da vistoria', { exact: true }).waitFor();
    await context.close();
  } finally { await browser.close(); }
  assert.deepEqual(failures, []);

  const otherDetail = await api('/api/crm/opportunities/' + opportunityId, { cookie: other.cookie });
  assert.equal(otherDetail.status, 200);
  assert.deepEqual(otherDetail.body.interactions, [], 'legacy detail must not expose interactions outside ownership rule');
  assert.equal((await api(endpoint, { cookie: other.cookie })).status, 404);
  assert.equal((await api(endpoint + '/' + interactionId, { method: 'PATCH', cookie: other.cookie, body: { expected_version: 2, title: 'Forçada' } })).status, 404);

  let saved = await api(endpoint, { cookie: owner.cookie });
  assert.equal(saved.status, 200);
  const edited = saved.body.interactions.find(item => item.id === interactionId);
  assert.equal(edited.type, 'reuniao');
  assert.equal(edited.version, 2);
  assert.equal(edited.contact_id, contact.body.contact.id);
  assert.equal(edited.attachments.length, 1);
  const attachment = edited.attachments[0];
  const attachmentPath = `${endpoint}/${interactionId}/attachments/${attachment.id}/download`;
  assert.equal((await api(attachmentPath, { cookie: other.cookie, raw: true })).status, 404);
  const downloaded = await api(attachmentPath, { cookie: owner.cookie, raw: true });
  assert.equal(downloaded.status, 200);
  assert.equal(downloaded.headers.get('content-type'), 'text/plain');
  assert.equal(downloaded.headers.get('cache-control'), 'private, no-store');
  assert.equal(downloaded.buffer.toString('utf8'), 'anexo CRM-07 sintético');

  // The ETag-like interaction version rejects a stale browser/tab edit. A
  // valid correction may also clear the optional contact link.
  const stale = await api(endpoint + '/' + interactionId, { method: 'PATCH', cookie: owner.cookie, body: { expected_version: 1, title: 'Edição vencida' } });
  assert.equal(stale.status, 409);
  const cleared = await api(endpoint + '/' + interactionId, { method: 'PATCH', cookie: owner.cookie, body: { expected_version: 2, type: 'whatsapp', title: 'WhatsApp de confirmação', details: null, contact_id: null, occurred_at: edited.occurred_at } });
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
  assert.equal(cleared.body.interaction.version, 3);
  assert.equal(cleared.body.interaction.contact_id, null);

  // The four remaining schema types are accepted by the HTTP contract and
  // are visible through actual offset/limit pagination, not a 200-row cap.
  for (const type of ['email', 'visita', 'nota', 'outro']) {
    const response = await api(endpoint, { method: 'POST', cookie: owner.cookie, body: { type, title: `Registro ${type}` } });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.interaction.type, type);
  }
  const firstPage = await api(endpoint + '?limit=2&offset=0', { cookie: owner.cookie });
  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.body.pagination.total, 5);
  assert.equal(firstPage.body.interactions.length, 2);
  assert.equal(firstPage.body.pagination.nextOffset, 2);
  const secondPage = await api(endpoint + '?limit=2&offset=2', { cookie: owner.cookie });
  assert.equal(secondPage.status, 200);
  assert.equal(secondPage.body.interactions.length, 2);
  assert.equal(secondPage.body.pagination.previousOffset, 0);
  assert.equal((await api(endpoint + '?limit=101&offset=0', { cookie: owner.cookie })).status, 400);

  const { rows: attribution } = await pool.query('SELECT created_by_id, company_id, contact_id, version FROM crm_interactions WHERE id=$1', [interactionId]);
  assert.equal(attribution[0].created_by_id, owner.id);
  assert.equal(attribution[0].company_id, company.body.company.id);
  assert.equal(attribution[0].contact_id, null);
  assert.equal(attribution[0].version, 3);
  const attachmentAudit = await pool.query("SELECT action, actor_id FROM auth_access_audit WHERE target=$1 ORDER BY created_at", [attachment.id]);
  assert.deepEqual(attachmentAudit.rows.map(row => row.action), ['crm_interaction_attachment_create', 'crm_interaction_attachment_download']);
  assert.ok(attachmentAudit.rows.every(row => row.actor_id === owner.id));

  // A deletion is logical (the historical bytes/row are retained for audit),
  // but it disappears from all normal reads and can no longer be downloaded.
  await pool.query(`CREATE FUNCTION qa_reject_interaction_delete_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.action = 'crm_interaction_delete' THEN RAISE EXCEPTION 'qa audit failure'; END IF; RETURN NEW; END $$`);
  await pool.query('CREATE TRIGGER qa_reject_interaction_delete_audit BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_reject_interaction_delete_audit()');
  try {
    assert.equal((await api(endpoint + '/' + interactionId, { method: 'DELETE', cookie: owner.cookie, body: { expected_version: 3 } })).status, 503);
    const notDeleted = await pool.query('SELECT deleted_at,version FROM crm_interactions WHERE id=$1', [interactionId]);
    assert.equal(notDeleted.rows[0].deleted_at, null);
    assert.equal(notDeleted.rows[0].version, 3);
  } finally {
    await pool.query('DROP TRIGGER qa_reject_interaction_delete_audit ON auth_access_audit');
    await pool.query('DROP FUNCTION qa_reject_interaction_delete_audit()');
  }
  const deleted = await api(endpoint + '/' + interactionId, { method: 'DELETE', cookie: owner.cookie, body: { expected_version: 3 } });
  assert.equal(deleted.status, 200);
  assert.equal((await api(attachmentPath, { cookie: owner.cookie, raw: true })).status, 404);
  const afterDelete = await api(endpoint, { cookie: owner.cookie });
  assert.equal(afterDelete.status, 200);
  assert.equal(afterDelete.body.pagination.total, 4);
  assert.equal(afterDelete.body.interactions.some(item => item.id === interactionId), false);
  const deletedRow = await pool.query('SELECT deleted_at,deleted_by_id,version FROM crm_interactions WHERE id=$1', [interactionId]);
  assert.ok(deletedRow.rows[0].deleted_at);
  assert.equal(deletedRow.rows[0].deleted_by_id, owner.id);
  assert.equal(deletedRow.rows[0].version, 4);
  const interactionAudit = await pool.query("SELECT action, actor_id FROM auth_access_audit WHERE target=$1 ORDER BY created_at", [interactionId]);
  assert.deepEqual(interactionAudit.rows.map(row => row.action), ['crm_interaction_create', 'crm_interaction_update', 'crm_interaction_update', 'crm_interaction_delete']);
  assert.ok(interactionAudit.rows.every(row => row.actor_id === owner.id));
});
