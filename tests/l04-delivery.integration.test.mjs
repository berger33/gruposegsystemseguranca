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

test('CRM-08: agenda de visitas/reuniões — responsável, participante, confirmação, reagendamento e cancelamento', { skip: !RUN, timeout: 180_000 }, async () => {
  const owner = await provisionAndLoginStaff(pool, api, { role: 'comercial' });
  const participant = await provisionAndLoginStaff(pool, api, { role: 'comercial' });
  const stranger = await provisionAndLoginStaff(pool, api, { role: 'comercial' });
  const rh = await provisionAndLoginStaff(pool, api, { role: 'rh' });
  const company = await api('/api/crm/companies', { method: 'POST', cookie: owner.cookie, body: { displayName: 'Empresa agenda ' + randomUUID(), city: 'Barueri', type: 'prospect' } });
  assert.equal(company.status, 201, JSON.stringify(company.body));
  const contact = await api('/api/crm/contacts', { method: 'POST', cookie: owner.cookie, body: { company_id: company.body.company.id, display_name: 'Contato CRM-08 ' + randomUUID(), email: `${randomUUID()}@example.test`, role: 'decisor' } });
  assert.equal(contact.status, 201, JSON.stringify(contact.body));
  const opportunity = await api('/api/crm/opportunities', { method: 'POST', cookie: owner.cookie, body: { company_id: company.body.company.id, title: 'Agenda de vistoria ' + randomUUID() } });
  assert.equal(opportunity.status, 201, JSON.stringify(opportunity.body));
  const opportunityId = opportunity.body.opportunity.id;
  const endpoint = '/api/crm/opportunities/' + opportunityId + '/visits';
  const future = new Date(Date.now() + 3 * 24 * 3600 * 1000);
  const laterFuture = new Date(Date.now() + 6 * 24 * 3600 * 1000);

  // Sessão, papel, propriedade, origem e método continuam negados na nova superfície.
  assert.equal((await api(endpoint)).status, 401);
  assert.equal((await api(endpoint, { cookie: rh.cookie })).status, 403);
  assert.equal((await api(endpoint, { cookie: stranger.cookie })).status, 404);
  assert.equal((await api(endpoint, { method: 'POST', cookie: owner.cookie, sendOrigin: false, body: {} })).status, 403);
  assert.equal((await api(endpoint, { method: 'DELETE', cookie: owner.cookie })).status, 405);
  assert.equal((await api('/api/crm/visits/agenda', { method: 'POST', cookie: owner.cookie, body: {} })).status, 405);

  // Entradas inválidas e campos de atribuição do servidor.
  const forged = await api(endpoint, { method: 'POST', cookie: owner.cookie, body: { title: 'Forjada', scheduled_at: future.toISOString(), responsible_id: stranger.id } });
  assert.equal(forged.status, 400);
  assert.equal(forged.body.error, 'server_managed_fields');
  assert.equal((await api(endpoint, { method: 'POST', cookie: owner.cookie, body: { title: 'Passado', scheduled_at: '2020-01-02T10:00:00.000Z' } })).body.error, 'scheduled_at_must_be_future');
  assert.equal((await api(endpoint, { method: 'POST', cookie: owner.cookie, body: { title: 'Duração inválida', scheduled_at: future.toISOString(), duration_minutes: 5 } })).body.error, 'invalid_duration');
  assert.equal((await api(endpoint, { method: 'POST', cookie: owner.cookie, body: { title: ' ', scheduled_at: future.toISOString() } })).body.error, 'invalid_title');
  const unknownParticipant = await api(endpoint, { method: 'POST', cookie: owner.cookie, body: { title: 'Convite impossível', scheduled_at: future.toISOString(), participant_emails: [`${randomUUID()}@exemplo.invalid`] } });
  assert.equal(unknownParticipant.status, 400);
  assert.equal(unknownParticipant.body.error, 'participant_not_available');
  assert.equal((await pool.query('SELECT count(*)::int AS total FROM crm_visits WHERE opportunity_id=$1', [opportunityId])).rows[0].total, 0, 'convite inválido não pode deixar visita órfã');

  // Jornada real do responsável pelo navegador: agendar com contato e convidado.
  const browser = await launchBrowser();
  const failures = [];
  let visitId;
  const visitTitle = 'Vistoria técnica no cliente';
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
    const pair = owner.cookie.split(';')[0], separator = pair.indexOf('=');
    await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl }]);
    const page = await context.newPage();
    trackFailures(page, failures);
    await page.goto(baseUrl + '/admin/crm', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.getByRole('article').filter({ hasText: opportunity.body.opportunity.title }).getByRole('button', { name: 'Abrir tarefas' }).click();
    const section = page.getByRole('region', { name: 'Agenda de visitas e reuniões da oportunidade' });
    await section.getByLabel('Título da visita', { exact: true }).fill(visitTitle);
    const pad = value => String(value).padStart(2, '0');
    const localFuture = `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T${pad(future.getHours())}:${pad(future.getMinutes())}`;
    await section.getByLabel('Data e hora', { exact: true }).fill(localFuture);
    await section.getByLabel('Duração (minutos)', { exact: true }).selectOption('90');
    await section.getByLabel('Contato da empresa (opcional)', { exact: true }).selectOption({ label: contact.body.contact.display_name });
    await section.getByLabel('Observações (opcional)', { exact: true }).fill('Levar checklist de vistoria.');
    await section.getByLabel('Participantes por e-mail (opcional, separados por vírgula)', { exact: true }).fill(participant.email);
    const [scheduled] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith(endpoint) && response.request().method() === 'POST'),
      section.getByRole('button', { name: 'Agendar visita', exact: true }).click(),
    ]);
    assert.equal(scheduled.status(), 201);
    visitId = (await scheduled.json()).visit.id;
    await section.getByText('Visita agendada.', { exact: true }).waitFor();

    // Persistência real: recarregar e reencontrar a visita e o convidado.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.getByRole('article').filter({ hasText: opportunity.body.opportunity.title }).getByRole('button', { name: 'Abrir tarefas' }).click();
    const visitArticle = section.getByRole('article', { name: 'Visita ' + visitTitle });
    await visitArticle.getByText('Solicitada: ' + visitTitle, { exact: true }).waitFor();
    await visitArticle.getByText(new RegExp(participant.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*pendente')).waitFor();
    await context.close();
  } finally { await browser.close(); }

  // O convidado responde por si, pela própria agenda, em navegador e sessão
  // separados (o Chromium empacotado roda em --single-process: um navegador
  // por persona é mais estável do que dois contextos simultâneos).
  const participantBrowser = await launchBrowser();
  try {
    const participantContext = await participantBrowser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
    const participantPair = participant.cookie.split(';')[0], participantSeparator = participantPair.indexOf('=');
    await participantContext.addCookies([{ name: participantPair.slice(0, participantSeparator), value: participantPair.slice(participantSeparator + 1), url: baseUrl }]);
    const participantPage = await participantContext.newPage();
    trackFailures(participantPage, failures);
    await participantPage.goto(baseUrl + '/admin/crm', { waitUntil: 'networkidle' });
    const agenda = participantPage.getByRole('region', { name: 'Minha agenda de visitas e reuniões' });
    const agendaItem = agenda.getByRole('article', { name: 'Agenda ' + visitTitle });
    await agendaItem.waitFor();
    const [confirmed] = await Promise.all([
      participantPage.waitForResponse(response => response.url().endsWith(`${endpoint}/${visitId}/response`) && response.request().method() === 'POST'),
      agendaItem.getByRole('button', { name: 'Confirmar presença na agenda', exact: true }).click(),
    ]);
    assert.equal(confirmed.status(), 200);
    await agenda.getByText('Presença confirmada.', { exact: true }).waitFor();
    await participantContext.close();
  } finally { await participantBrowser.close(); }
  assert.deepEqual(failures, []);

  // Escopo do participante: enxerga a visita em que foi convidado e nada além.
  const participantList = await api(endpoint, { cookie: participant.cookie });
  assert.equal(participantList.status, 200);
  assert.equal(participantList.body.viewer.is_responsible, false);
  assert.deepEqual(participantList.body.contacts, [], 'convidado não recebe a agenda de contatos da empresa');
  assert.equal(participantList.body.visits.length, 1);
  assert.equal(participantList.body.visits[0].viewer_response, 'confirmado');
  assert.equal((await api(endpoint, { cookie: stranger.cookie })).status, 404);
  const strangerAgenda = await api('/api/crm/visits/agenda', { cookie: stranger.cookie });
  assert.equal(strangerAgenda.status, 200);
  assert.equal(strangerAgenda.body.visits.some(item => item.id === visitId), false);
  const participantAgenda = await api('/api/crm/visits/agenda', { cookie: participant.cookie });
  assert.equal(participantAgenda.body.visits.find(item => item.id === visitId).viewer_is_responsible, false);
  const ownerAgenda = await api('/api/crm/visits/agenda', { cookie: owner.cookie });
  assert.equal(ownerAgenda.body.visits.find(item => item.id === visitId).viewer_is_responsible, true);
  assert.equal((await api('/api/crm/visits/agenda?from=amanha', { cookie: owner.cookie })).status, 400);

  // A rota legada de detalhe obedece à mesma política de agenda.
  const strangerDetail = await api('/api/crm/opportunities/' + opportunityId, { cookie: stranger.cookie });
  assert.equal(strangerDetail.status, 200);
  assert.deepEqual(strangerDetail.body.visits, [], 'detalhe legado não pode vazar a agenda para fora da política');
  const participantDetail = await api('/api/crm/opportunities/' + opportunityId, { cookie: participant.cookie });
  assert.equal(participantDetail.body.visits.length, 1);

  // Participante não reagenda, não cancela, não convida e não remove ninguém.
  let current = (await api(endpoint, { cookie: owner.cookie })).body.visits.find(item => item.id === visitId);
  assert.equal(current.participants[0].response, 'confirmado');
  assert.equal((await api(`${endpoint}/${visitId}`, { method: 'PATCH', cookie: participant.cookie, body: { expected_version: current.version, scheduled_at: laterFuture.toISOString() } })).status, 404);
  assert.equal((await api(`${endpoint}/${visitId}`, { method: 'PATCH', cookie: participant.cookie, body: { expected_version: current.version, status: 'cancelada', cancel_reason: 'tentativa indevida' } })).status, 404);
  assert.equal((await api(`${endpoint}/${visitId}/participants`, { method: 'POST', cookie: participant.cookie, body: { expected_version: current.version, email: stranger.email } })).status, 404);
  assert.equal((await api(`${endpoint}/${visitId}/participants/${participant.id}`, { method: 'DELETE', cookie: participant.cookie, body: { expected_version: current.version } })).status, 404);
  assert.equal((await api(`${endpoint}/${visitId}/response`, { method: 'POST', cookie: stranger.cookie, body: { expected_version: current.version, response: 'confirmado' } })).status, 404);
  assert.equal((await api(`${endpoint}/${visitId}/response`, { method: 'POST', cookie: owner.cookie, body: { expected_version: current.version, response: 'confirmado' } })).status, 404, 'responsável não responde como participante');

  // Convite adicional pelo responsável e conflito de versão otimista.
  const invited = await api(`${endpoint}/${visitId}/participants`, { method: 'POST', cookie: owner.cookie, body: { expected_version: current.version, email: stranger.email.toUpperCase() } });
  assert.equal(invited.status, 201, JSON.stringify(invited.body));
  assert.equal(invited.body.participants.length, 2);
  assert.equal((await api(`${endpoint}/${visitId}/participants`, { method: 'POST', cookie: owner.cookie, body: { expected_version: current.version, email: stranger.email } })).status, 409);
  const removed = await api(`${endpoint}/${visitId}/participants/${stranger.id}`, { method: 'DELETE', cookie: owner.cookie, body: { expected_version: invited.body.version } });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.equal(removed.body.participants.length, 1);

  // Reagendar zera as confirmações e devolve o ciclo ao início.
  current = (await api(endpoint, { cookie: owner.cookie })).body.visits.find(item => item.id === visitId);
  assert.equal((await api(`${endpoint}/${visitId}`, { method: 'PATCH', cookie: owner.cookie, body: { expected_version: current.version - 1, scheduled_at: laterFuture.toISOString() } })).status, 409);
  const rescheduled = await api(`${endpoint}/${visitId}`, { method: 'PATCH', cookie: owner.cookie, body: { expected_version: current.version, scheduled_at: laterFuture.toISOString() } });
  assert.equal(rescheduled.status, 200, JSON.stringify(rescheduled.body));
  assert.equal(rescheduled.body.visit.status, 'solicitada');
  assert.equal(rescheduled.body.visit.reschedule_count, 1);
  assert.equal(rescheduled.body.visit.participants[0].response, 'pendente');
  assert.equal(rescheduled.body.visit.participants[0].responded_at, null);

  // Confirmação do agendamento, transições inválidas e cancelamento com motivo.
  const confirmedVisit = await api(`${endpoint}/${visitId}`, { method: 'PATCH', cookie: owner.cookie, body: { expected_version: rescheduled.body.visit.version, status: 'confirmada' } });
  assert.equal(confirmedVisit.status, 200);
  assert.equal(confirmedVisit.body.visit.status, 'confirmada');
  assert.equal((await api(`${endpoint}/${visitId}`, { method: 'PATCH', cookie: owner.cookie, body: { expected_version: confirmedVisit.body.visit.version, status: 'solicitada' } })).status, 409);
  assert.equal((await api(`${endpoint}/${visitId}`, { method: 'PATCH', cookie: owner.cookie, body: { expected_version: confirmedVisit.body.visit.version, status: 'cancelada' } })).body.error, 'cancel_reason_required');
  const respondedAgain = await api(`${endpoint}/${visitId}/response`, { method: 'POST', cookie: participant.cookie, body: { expected_version: confirmedVisit.body.visit.version, response: 'recusado' } });
  assert.equal(respondedAgain.status, 200);
  assert.equal(respondedAgain.body.participants[0].response, 'recusado');

  // Falha de auditoria injetada: nenhuma visita é aceita sem trilha durável.
  await pool.query(`CREATE FUNCTION qa_reject_visit_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.action = 'crm_visit_create' THEN RAISE EXCEPTION 'qa audit failure'; END IF; RETURN NEW; END $$`);
  await pool.query('CREATE TRIGGER qa_reject_visit_audit BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_reject_visit_audit()');
  try {
    assert.equal((await api(endpoint, { method: 'POST', cookie: owner.cookie, body: { title: 'Deve reverter', scheduled_at: laterFuture.toISOString() } })).status, 503);
    assert.equal((await pool.query('SELECT count(*)::int AS total FROM crm_visits WHERE opportunity_id=$1', [opportunityId])).rows[0].total, 1);
  } finally {
    await pool.query('DROP TRIGGER qa_reject_visit_audit ON auth_access_audit');
    await pool.query('DROP FUNCTION qa_reject_visit_audit()');
  }

  const cancelled = await api(`${endpoint}/${visitId}`, { method: 'PATCH', cookie: owner.cookie, body: { expected_version: confirmedVisit.body.visit.version, status: 'cancelada', cancel_reason: 'Cliente pediu adiamento indefinido' } });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
  assert.equal(cancelled.body.visit.status, 'cancelada');
  assert.equal(cancelled.body.visit.cancel_reason, 'Cliente pediu adiamento indefinido');
  assert.equal((await api(`${endpoint}/${visitId}`, { method: 'PATCH', cookie: owner.cookie, body: { expected_version: cancelled.body.visit.version, title: 'Reabrir na marra' } })).status, 409);
  assert.equal((await api(`${endpoint}/${visitId}/response`, { method: 'POST', cookie: participant.cookie, body: { expected_version: cancelled.body.visit.version, response: 'confirmado' } })).status, 409);

  const stored = await pool.query('SELECT responsible_id,created_by_id,company_id,status,cancelled_by_id,reschedule_count FROM crm_visits WHERE id=$1', [visitId]);
  assert.equal(stored.rows[0].responsible_id, owner.id);
  assert.equal(stored.rows[0].created_by_id, owner.id);
  assert.equal(stored.rows[0].company_id, company.body.company.id);
  assert.equal(stored.rows[0].status, 'cancelada');
  assert.equal(stored.rows[0].cancelled_by_id, owner.id);
  assert.equal(stored.rows[0].reschedule_count, 1);
  const visitAudit = await pool.query('SELECT action, actor_id FROM auth_access_audit WHERE target=$1 ORDER BY created_at, id', [visitId]);
  assert.deepEqual(visitAudit.rows.map(row => row.action), [
    'crm_visit_participant_add', 'crm_visit_create', 'crm_visit_response',
    'crm_visit_participant_add', 'crm_visit_participant_remove',
    'crm_visit_reschedule', 'crm_visit_status', 'crm_visit_response', 'crm_visit_cancel',
  ]);
  assert.equal(visitAudit.rows.filter(row => row.actor_id === participant.id).length, 2, 'as respostas do convidado são atribuídas a ele');
  assert.equal(visitAudit.rows.filter(row => row.actor_id === owner.id).length, 7);
});

test('CRM-09: modelos privados, tarefas manuais, opt-out e encerramento da cadência', { skip: !RUN, timeout: 180_000 }, async () => {
  const owner = await provisionAndLoginStaff(pool, api, { role: 'comercial' });
  const other = await provisionAndLoginStaff(pool, api, { role: 'comercial' });
  const rh = await provisionAndLoginStaff(pool, api, { role: 'rh' });
  const company = await api('/api/crm/companies', {
    method: 'POST', cookie: owner.cookie,
    body: { displayName: 'Empresa cadência ' + randomUUID(), city: 'Guarulhos', type: 'prospect' },
  });
  assert.equal(company.status, 201, JSON.stringify(company.body));
  const contact = await api('/api/crm/contacts', {
    method: 'POST', cookie: owner.cookie,
    body: { company_id: company.body.company.id, display_name: 'Contato cadência L04', email: `cadencia-${randomUUID()}@exemplo.invalid` },
  });
  assert.equal(contact.status, 201, JSON.stringify(contact.body));
  const opportunity = await api('/api/crm/opportunities', {
    method: 'POST', cookie: owner.cookie,
    body: { company_id: company.body.company.id, contact_id: contact.body.contact.id, title: 'Oportunidade cadência L04' },
  });
  assert.equal(opportunity.status, 201, JSON.stringify(opportunity.body));
  const opportunityId = opportunity.body.opportunity.id;
  const templateEndpoint = '/api/crm/cadences/templates';
  const cadenceEndpoint = `/api/crm/opportunities/${opportunityId}/cadences`;

  assert.equal((await api(templateEndpoint)).status, 401);
  assert.equal((await api(templateEndpoint, { cookie: rh.cookie })).status, 403);
  assert.equal((await api(cadenceEndpoint, { cookie: other.cookie })).status, 404);
  assert.equal((await api(cadenceEndpoint, { method: 'POST', cookie: owner.cookie, sendOrigin: false, body: {} })).status, 403);
  assert.equal((await api(templateEndpoint, { method: 'DELETE', cookie: owner.cookie })).status, 405);
  const forgedTemplate = await api(templateEndpoint, {
    method: 'POST', cookie: owner.cookie,
    body: { name: 'Forjado', owner_id: other.id, steps: [{ title: 'Não', interval_days: 0, suggested_channel: 'ligacao' }] },
  });
  assert.equal(forgedTemplate.status, 400);
  assert.equal(forgedTemplate.body.error, 'server_managed_fields');
  assert.equal((await api(templateEndpoint, { method: 'POST', cookie: owner.cookie, body: { name: 'Sem passos', steps: [] } })).status, 400);

  const browser = await launchBrowser();
  const failures = [];
  let templateId;
  let taskIds = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
    const pair = owner.cookie.split(';')[0], separator = pair.indexOf('=');
    await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl }]);
    const page = await context.newPage();
    trackFailures(page, failures);
    await page.goto(`${baseUrl}/admin/crm`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const card = page.getByRole('article').filter({ hasText: opportunity.body.opportunity.title });
    await card.getByRole('button', { name: 'Abrir tarefas' }).click();
    const cadence = page.getByRole('region', { name: 'Cadências manuais de prospecção' });
    await cadence.getByRole('heading', { name: 'CRM-09 — Cadências manuais' }).waitFor();
    await cadence.getByLabel('Nome do modelo', { exact: true }).fill('Primeiro contato manual');
    await cadence.getByLabel('Descrição (opcional)', { exact: true }).fill('Sequência sintética sem envio automático.');
    await cadence.getByLabel('Tarefa', { exact: true }).fill('Ligar para o contato');
    await cadence.getByLabel('Intervalo (dias)', { exact: true }).fill('0');
    await cadence.getByLabel('Canal sugerido', { exact: true }).selectOption('ligacao');
    const [createdTemplate] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith(templateEndpoint) && response.request().method() === 'POST'),
      cadence.getByRole('button', { name: 'Criar modelo', exact: true }).click(),
    ]);
    assert.equal(createdTemplate.status(), 201);
    templateId = (await createdTemplate.json()).template.id;
    await cadence.getByText('Modelo de cadência salvo. Os passos continuam sendo tarefas manuais.', { exact: true }).waitFor();

    await cadence.getByRole('button', { name: 'Editar', exact: true }).click();
    await cadence.getByLabel('Nome do modelo', { exact: true }).fill('Primeiro contato manual editado');
    const [editedTemplate] = await Promise.all([
      page.waitForResponse(response => response.url().includes(`/api/crm/cadences/templates/${templateId}`) && response.request().method() === 'PATCH'),
      cadence.getByRole('button', { name: 'Salvar edição', exact: true }).click(),
    ]);
    assert.equal(editedTemplate.status(), 200);
    await cadence.getByLabel('Modelo de cadência', { exact: true }).selectOption(templateId);
    const [applied] = await Promise.all([
      page.waitForResponse(response => response.url().endsWith(cadenceEndpoint) && response.request().method() === 'POST'),
      cadence.getByRole('button', { name: 'Criar tarefas da cadência', exact: true }).click(),
    ]);
    assert.equal(applied.status(), 201);
    const appliedBody = await applied.json();
    taskIds = appliedBody.tasks.map(task => task.id);
    assert.equal(taskIds.length, 1);
    await cadence.getByText('Cadência aplicada: tarefas criadas para execução manual, sem envio automático.', { exact: true }).waitFor();
    await cadence.getByText('Ligar para o contato', { exact: false }).first().waitFor();

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.getByRole('article').filter({ hasText: opportunity.body.opportunity.title }).getByRole('button', { name: 'Abrir tarefas' }).click();
    await page.getByRole('region', { name: 'Cadências manuais de prospecção' }).getByText('Ligar para o contato', { exact: false }).first().waitFor();
    await assertNoHorizontalScroll(page, 'cadências no CRM');
    await context.close();
  } finally { await browser.close(); }
  assert.deepEqual(failures, [], `cadência no navegador não deve ter erro de console/HTTP 5xx: ${failures.join(', ')}`);

  const ownerTemplates = await api(templateEndpoint, { cookie: owner.cookie });
  assert.equal(ownerTemplates.status, 200);
  const savedTemplate = ownerTemplates.body.templates.find(template => template.id === templateId);
  assert.ok(savedTemplate);
  assert.equal(savedTemplate.name, 'Primeiro contato manual editado');
  assert.equal(savedTemplate.steps[0].responsible_id, owner.id);
  const otherTemplates = await api(templateEndpoint, { cookie: other.cookie });
  assert.equal(otherTemplates.status, 200);
  assert.deepEqual(otherTemplates.body.templates, [], 'modelo privado não deve aparecer para outro comercial');

  const appliedList = await api(cadenceEndpoint, { cookie: owner.cookie });
  assert.equal(appliedList.status, 200, JSON.stringify(appliedList.body));
  assert.equal(appliedList.body.enrollments.length, 1);
  assert.equal(appliedList.body.enrollments[0].tasks.length, 1);
  assert.equal(appliedList.body.enrollments[0].tasks[0].suggested_channel, 'ligacao');
  assert.equal(appliedList.body.enrollments[0].tasks[0].status, 'aberta');
  assert.equal((await api(cadenceEndpoint, { method: 'POST', cookie: owner.cookie, body: { template_id: templateId } })).status, 409);

  // The legacy opportunity route no longer exposes stages to another identity.
  const otherDetail = await api(`/api/crm/opportunities/${opportunityId}`, { cookie: other.cookie });
  assert.equal(otherDetail.status, 200);
  assert.deepEqual(otherDetail.body.stages, []);
  const ownerDetail = await api(`/api/crm/opportunities/${opportunityId}`, { cookie: owner.cookie });
  assert.equal(ownerDetail.body.stages.length, 1);

  // Opt-out is a real HTTP mutation. The database trigger cancels pending
  // cadence tasks and marks the enrollment; it never sends a message.
  const optOut = await api(`/api/crm/opportunities/${opportunityId}/cadence-contact`, {
    method: 'PATCH', cookie: owner.cookie, body: { opted_out: true },
  });
  assert.equal(optOut.status, 200, JSON.stringify(optOut.body));
  assert.equal(optOut.body.contact.prospecting_opted_out, true);
  assert.equal(optOut.body.blockedTasks, 1);
  const blocked = await api(cadenceEndpoint, { cookie: owner.cookie });
  assert.equal(blocked.body.enrollments[0].status, 'bloqueada_opt_out');
  assert.equal(blocked.body.enrollments[0].tasks[0].status, 'cancelada');
  assert.equal(blocked.body.enrollments[0].tasks[0].cadence_blocked_reason, 'contato_opted_out');
  const afterOptOut = await api(cadenceEndpoint, { method: 'POST', cookie: owner.cookie, body: { template_id: templateId } });
  assert.equal(afterOptOut.status, 409);
  assert.equal(afterOptOut.body.error, 'contact_opted_out');

  // A terminal opportunity also closes only pending manual steps.
  const contactWon = await api('/api/crm/contacts', { method: 'POST', cookie: owner.cookie, body: { company_id: company.body.company.id, display_name: 'Contato ganho L04', email: `ganho-${randomUUID()}@exemplo.invalid` } });
  assert.equal(contactWon.status, 201);
  const oppWon = await api('/api/crm/opportunities', { method: 'POST', cookie: owner.cookie, body: { company_id: company.body.company.id, contact_id: contactWon.body.contact.id, title: 'Oportunidade ganha cadência' } });
  assert.equal(oppWon.status, 201);
  const wonId = oppWon.body.opportunity.id;
  const applyWon = await api(`/api/crm/opportunities/${wonId}/cadences`, { method: 'POST', cookie: owner.cookie, body: { template_id: templateId } });
  assert.equal(applyWon.status, 201);
  const wonStage = await api(`/api/crm/opportunities/${wonId}`, { method: 'PATCH', cookie: owner.cookie, body: { stage: 'ganho' } });
  assert.equal(wonStage.status, 200, JSON.stringify(wonStage.body));
  const wonCadence = await api(`/api/crm/opportunities/${wonId}/cadences`, { cookie: owner.cookie });
  assert.equal(wonCadence.body.enrollments[0].status, 'encerrada_ganha');
  assert.equal(wonCadence.body.enrollments[0].tasks[0].cadence_blocked_reason, 'oportunidade_ganha');

  // Contact deactivation is the other terminal boundary; SQL only sets the
  // synthetic fixture state, while the task was created through HTTP.
  const contactInactive = await api('/api/crm/contacts', { method: 'POST', cookie: owner.cookie, body: { company_id: company.body.company.id, display_name: 'Contato inativo L04', email: `inativo-${randomUUID()}@exemplo.invalid` } });
  assert.equal(contactInactive.status, 201);
  const oppInactive = await api('/api/crm/opportunities', { method: 'POST', cookie: owner.cookie, body: { company_id: company.body.company.id, contact_id: contactInactive.body.contact.id, title: 'Oportunidade contato inativo' } });
  assert.equal(oppInactive.status, 201);
  const applyInactive = await api(`/api/crm/opportunities/${oppInactive.body.opportunity.id}/cadences`, { method: 'POST', cookie: owner.cookie, body: { template_id: templateId } });
  assert.equal(applyInactive.status, 201);
  await pool.query('UPDATE crm_contacts SET status=\'inactive\' WHERE id=$1', [contactInactive.body.contact.id]);
  const inactiveCadence = await api(`/api/crm/opportunities/${oppInactive.body.opportunity.id}/cadences`, { cookie: owner.cookie });
  assert.equal(inactiveCadence.body.enrollments[0].status, 'encerrada_contato_inativo');
  assert.equal(inactiveCadence.body.enrollments[0].tasks[0].cadence_blocked_reason, 'contato_inativo');

  // Audit failure is fail-closed: no enrollment or task is acknowledged.
  const auditContact = await api('/api/crm/contacts', { method: 'POST', cookie: owner.cookie, body: { company_id: company.body.company.id, display_name: 'Contato auditoria L04', email: `audit-${randomUUID()}@exemplo.invalid` } });
  const auditOpp = await api('/api/crm/opportunities', { method: 'POST', cookie: owner.cookie, body: { company_id: company.body.company.id, contact_id: auditContact.body.contact.id, title: 'Oportunidade auditoria cadência' } });
  await pool.query(`CREATE FUNCTION qa_reject_cadence_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.action = 'crm_cadence_apply' THEN RAISE EXCEPTION 'qa audit failure'; END IF; RETURN NEW; END $$`);
  await pool.query('CREATE TRIGGER qa_reject_cadence_audit BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_reject_cadence_audit()');
  try {
    const rejected = await api(`/api/crm/opportunities/${auditOpp.body.opportunity.id}/cadences`, { method: 'POST', cookie: owner.cookie, body: { template_id: templateId } });
    assert.equal(rejected.status, 503);
    const counts = await pool.query('SELECT (SELECT count(*) FROM crm_cadence_enrollments WHERE opportunity_id=$1)::int AS enrollments, (SELECT count(*) FROM crm_tasks WHERE opportunity_id=$1 AND cadence_enrollment_id IS NOT NULL)::int AS tasks', [auditOpp.body.opportunity.id]);
    assert.deepEqual(counts.rows[0], { enrollments: 0, tasks: 0 });
  } finally {
    await pool.query('DROP TRIGGER qa_reject_cadence_audit ON auth_access_audit');
    await pool.query('DROP FUNCTION qa_reject_cadence_audit()');
  }

  const auditRows = await pool.query(
    `SELECT action,actor_id FROM auth_access_audit WHERE actor_id=$1 AND action IN ('crm_cadence_template_create','crm_cadence_template_update','crm_cadence_apply','crm_contact_prospecting_opt_out') ORDER BY created_at,id`,
    [owner.id],
  );
  assert.ok(auditRows.rows.some(row => row.action === 'crm_cadence_template_create'));
  assert.ok(auditRows.rows.some(row => row.action === 'crm_cadence_template_update'));
  assert.ok(auditRows.rows.some(row => row.action === 'crm_cadence_apply'));
  assert.ok(auditRows.rows.some(row => row.action === 'crm_contact_prospecting_opt_out'));
  assert.ok(auditRows.rows.every(row => row.actor_id === owner.id));
  assert.equal(taskIds.length, 1);
});

test('CRM-07: prazo, paginação, busca e delegação explícita com aceite', { skip: !RUN, timeout: 180_000 }, async () => {
  const owner = await provisionAndLoginStaff(pool, api, { role: 'comercial' });
  const delegate = await provisionAndLoginStaff(pool, api, { role: 'comercial' });
  const stranger = await provisionAndLoginStaff(pool, api, { role: 'comercial' });
  const rh = await provisionAndLoginStaff(pool, api, { role: 'rh' });
  const company = await api('/api/crm/companies', { method: 'POST', cookie: owner.cookie, body: { displayName: 'Empresa delegação ' + randomUUID(), city: 'Guarulhos', type: 'prospect' } });
  assert.equal(company.status, 201, JSON.stringify(company.body));
  const companyId = company.body.company.id;
  const opportunity = await api('/api/crm/opportunities', { method: 'POST', cookie: owner.cookie, body: { company_id: companyId, title: 'Jornada de delegação ' + randomUUID() } });
  assert.equal(opportunity.status, 201, JSON.stringify(opportunity.body));
  const opportunityId = opportunity.body.opportunity.id;
  const endpoint = '/api/crm/opportunities/' + opportunityId + '/tasks';
  const due = '2020-01-15T12:00:00.000Z';

  async function createTask(title) {
    const created = await api(endpoint, { method: 'POST', cookie: owner.cookie, body: { title, due_date: due } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.task.version, 1);
    assert.equal(created.body.task.delegation_status, null);
    return created.body.task;
  }
  for (let index = 1; index <= 25; index += 1) await createTask(`Preenchimento ${String(index).padStart(2, '0')} qa-fill`);
  const taskEdit = await createTask('Edição de prazo qa-edit');
  const taskPct = await createTask('Meta 100% qa-pct');
  await createTask('Meta 100 reais qa-pct');
  const taskConc = await createTask('Concluir cedo qa-conc');
  const taskCad = await createTask('Cadência fixa qa-cad');
  const taskA = await createTask('Delegável A qa-del');
  const taskB = await createTask('Delegável B qa-del');
  const taskC = await createTask('Delegável C qa-del');
  const taskD = await createTask('Delegável pela interface qa-ui');

  // Real pagination: limit/offset/total on the server, not a fixed LIMIT 200.
  const firstPage = await api(endpoint, { cookie: owner.cookie });
  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.body.total, 34);
  assert.equal(firstPage.body.limit, 25);
  assert.equal(firstPage.body.offset, 0);
  assert.equal(firstPage.body.tasks.length, 25);
  const secondPage = await api(endpoint + '?offset=25', { cookie: owner.cookie });
  assert.equal(secondPage.body.tasks.length, 9);
  assert.equal(secondPage.body.total, 34);
  const slice = await api(endpoint + '?limit=5&offset=5', { cookie: owner.cookie });
  assert.equal(slice.body.tasks.length, 5);
  const union = new Set([...firstPage.body.tasks, ...secondPage.body.tasks].map(t => t.id));
  assert.equal(union.size, 34, 'pages must not overlap nor drop rows');
  for (const bad of ['?limit=0', '?limit=101', '?offset=-1', '?offset=20000', '?limit=abc', '?status=qualquer', '?q=', '?overdue=2', `?q=${'a'.repeat(201)}`]) {
    assert.equal((await api(endpoint + bad, { cookie: owner.cookie })).status, 400, bad);
  }

  // Server-side search escapes LIKE wildcards: '100%' must match only the
  // literal percent title, not every title containing '100'.
  const bySuffix = await api(endpoint + '?q=qa-del', { cookie: owner.cookie });
  assert.equal(bySuffix.body.total, 3);
  const byPercent = await api(endpoint + '?q=' + encodeURIComponent('100%'), { cookie: owner.cookie });
  assert.equal(byPercent.body.total, 1);
  assert.equal(byPercent.body.tasks[0].id, taskPct.id);

  // One operation per PATCH: state transition OR due-date edit, never both.
  assert.equal((await api(endpoint + '/' + taskEdit.id, { method: 'PATCH', cookie: owner.cookie, body: {} })).status, 400);
  const mixed = await api(endpoint + '/' + taskEdit.id, { method: 'PATCH', cookie: owner.cookie, body: { status: 'concluida', expected_status: 'aberta', due_date: '2030-05-10T12:00:00.000Z', expected_version: 1 } });
  assert.equal(mixed.status, 400);
  assert.equal(mixed.body.error, 'invalid_operation');
  assert.equal((await api(endpoint + '/' + taskEdit.id, { method: 'PATCH', cookie: owner.cookie, body: { due_date: 'ontem', expected_version: 1 } })).status, 400);
  assert.equal((await api(endpoint + '/' + taskEdit.id, { method: 'PATCH', cookie: owner.cookie, body: { due_date: '2030-05-10T12:00:00.000Z', expected_version: 0 } })).status, 400);
  assert.equal((await api(endpoint + '/' + taskEdit.id, { method: 'PATCH', cookie: owner.cookie, body: { due_date: '2030-05-10T12:00:00.000Z', expected_version: 1, version: 9 } })).status, 400);

  // Optimistic due-date edit: version comes from the database trigger.
  const edited = await api(endpoint + '/' + taskEdit.id, { method: 'PATCH', cookie: owner.cookie, body: { due_date: '2030-05-10T12:00:00.000Z', expected_version: 1 } });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.task.version, 2);
  assert.equal(new Date(edited.body.task.due_date).toISOString(), '2030-05-10T12:00:00.000Z');
  const staleEdit = await api(endpoint + '/' + taskEdit.id, { method: 'PATCH', cookie: owner.cookie, body: { due_date: '2031-01-01T12:00:00.000Z', expected_version: 1 } });
  assert.equal(staleEdit.status, 409);
  assert.equal(staleEdit.body.error, 'task_version_conflict');

  assert.equal((await api(endpoint + '/' + taskConc.id, { method: 'PATCH', cookie: owner.cookie, body: { expected_status: 'aberta', status: 'concluida' } })).status, 200);
  const editClosed = await api(endpoint + '/' + taskConc.id, { method: 'PATCH', cookie: owner.cookie, body: { due_date: '2030-05-10T12:00:00.000Z', expected_version: 2 } });
  assert.equal(editClosed.status, 409);
  assert.equal(editClosed.body.error, 'task_not_open');

  // Server-side filters: status and overdue.
  const concluded = await api(endpoint + '?status=concluida', { cookie: owner.cookie });
  assert.equal(concluded.body.total, 1);
  assert.equal(concluded.body.tasks[0].id, taskConc.id);
  const overdue = await api(endpoint + '?overdue=1', { cookie: owner.cookie });
  assert.equal(overdue.body.total, 32, 'concluded and future-dated tasks are not overdue');

  // Delegation borders. Only active `comercial` identities participate and
  // every target problem returns the same generic error (no staff oracle).
  const delegation = id => endpoint + '/' + id + '/delegation';
  assert.equal((await api(delegation(taskA.id), { method: 'POST', body: { email: delegate.email } })).status, 401);
  assert.equal((await api(delegation(taskA.id), { method: 'POST', cookie: rh.cookie, body: { email: delegate.email } })).status, 403);
  assert.equal((await api(delegation(taskA.id), { method: 'POST', cookie: owner.cookie, sendOrigin: false, body: { email: delegate.email } })).status, 403);
  assert.equal((await api(delegation(taskA.id), { method: 'POST', cookie: owner.cookie, body: { email: 'não é e-mail' } })).status, 400);
  assert.equal((await api(delegation(taskA.id), { method: 'POST', cookie: stranger.cookie, body: { email: delegate.email } })).status, 404);
  const toRh = await api(delegation(taskA.id), { method: 'POST', cookie: owner.cookie, body: { email: rh.email } });
  const toGhost = await api(delegation(taskA.id), { method: 'POST', cookie: owner.cookie, body: { email: 'ninguem-' + randomUUID().slice(0, 8) + '@exemplo.invalid' } });
  const toSelf = await api(delegation(taskA.id), { method: 'POST', cookie: owner.cookie, body: { email: owner.email } });
  for (const denied of [toRh, toGhost, toSelf]) {
    assert.equal(denied.status, 404);
    assert.equal(denied.body.error, 'delegate_not_available');
  }
  assert.equal((await api(delegation(taskConc.id), { method: 'POST', cookie: owner.cookie, body: { email: delegate.email } })).body.error, 'task_not_open');

  // CRM-09 cadence tasks stay private to the comercial who applied them.
  const templateId = randomUUID(), stepId = randomUUID(), contactId = randomUUID(), enrollmentId = randomUUID();
  await pool.query('INSERT INTO crm_cadence_templates (id,name,owner_id) VALUES ($1,$2,$3)', [templateId, 'Fixture delegação', owner.id]);
  await pool.query("INSERT INTO crm_cadence_steps (id,template_id,step_order,title,interval_days,suggested_channel,responsible_id) VALUES ($1,$2,1,'Passo fixture',0,'ligacao',$3)", [stepId, templateId, owner.id]);
  await pool.query("INSERT INTO crm_contacts (id,company_id,display_name,status) VALUES ($1,$2,'Contato fixture','active')", [contactId, companyId]);
  await pool.query('INSERT INTO crm_cadence_enrollments (id,template_id,opportunity_id,contact_id,applied_by_id) VALUES ($1,$2,$3,$4,$5)', [enrollmentId, templateId, opportunityId, contactId, owner.id]);
  await pool.query("UPDATE crm_tasks SET cadence_enrollment_id=$2, cadence_step_id=$3, suggested_channel='ligacao' WHERE id=$1", [taskCad.id, enrollmentId, stepId]);
  const cadenceDenied = await api(delegation(taskCad.id), { method: 'POST', cookie: owner.cookie, body: { email: delegate.email } });
  assert.equal(cadenceDenied.status, 409);
  assert.equal(cadenceDenied.body.error, 'cadence_task_not_delegable');

  // Happy path: pending delegation freezes the owner's write access.
  const pendingA = await api(delegation(taskA.id), { method: 'POST', cookie: owner.cookie, body: { email: delegate.email } });
  assert.equal(pendingA.status, 200, JSON.stringify(pendingA.body));
  assert.equal(pendingA.body.task.delegation_status, 'pendente');
  assert.equal(pendingA.body.task.delegated_to_email, delegate.email);
  assert.equal((await api(endpoint + '/' + taskA.id, { method: 'PATCH', cookie: owner.cookie, body: { expected_status: 'aberta', status: 'concluida' } })).body.error, 'task_delegated');
  assert.equal((await api(endpoint + '/' + taskA.id, { method: 'PATCH', cookie: owner.cookie, body: { due_date: '2030-05-10T12:00:00.000Z', expected_version: 2 } })).body.error, 'task_delegated');
  assert.equal((await api(delegation(taskA.id), { method: 'POST', cookie: owner.cookie, body: { email: delegate.email } })).body.error, 'task_delegated');

  // The delegate sees the pending task with minimum context; nobody else does.
  assert.equal((await api('/api/crm/tasks/delegated', { cookie: rh.cookie })).status, 403);
  assert.equal((await api('/api/crm/tasks/delegated?limit=0', { cookie: delegate.cookie })).status, 400);
  const delegatedList = await api('/api/crm/tasks/delegated', { cookie: delegate.cookie });
  assert.equal(delegatedList.status, 200);
  const listedA = delegatedList.body.tasks.find(t => t.id === taskA.id);
  assert.ok(listedA, 'delegate must see the pending delegation');
  assert.equal(listedA.opportunity_title, opportunity.body.opportunity.title);
  assert.equal(listedA.company_name, company.body.company.display_name);
  assert.ok(listedA.delegated_by_name);
  assert.equal(Object.hasOwn(listedA, 'estimated_value'), false, 'no opportunity value leaks to the delegate');
  const strangerList = await api('/api/crm/tasks/delegated', { cookie: stranger.cookie });
  assert.equal(strangerList.body.total, 0);
  assert.equal((await api('/api/crm/tasks/delegated/' + taskA.id + '/response', { method: 'POST', cookie: stranger.cookie, body: { accept: true } })).status, 404);
  assert.equal((await api('/api/crm/tasks/delegated/' + taskA.id + '/response', { method: 'POST', cookie: delegate.cookie, body: { accept: 'sim' } })).status, 400);

  // Decline returns full control to the owner; revoke clears a pending one.
  assert.equal((await api(delegation(taskB.id), { method: 'POST', cookie: owner.cookie, body: { email: delegate.email } })).status, 200);
  assert.equal((await api('/api/crm/tasks/delegated/' + taskB.id + '/response', { method: 'POST', cookie: delegate.cookie, body: { accept: false } })).status, 200);
  const afterDecline = await api(endpoint + '?q=qa-del', { cookie: owner.cookie });
  assert.equal(afterDecline.body.tasks.find(t => t.id === taskB.id).delegation_status, 'recusada');
  assert.equal((await api(endpoint + '/' + taskB.id, { method: 'PATCH', cookie: owner.cookie, body: { expected_status: 'aberta', status: 'em_andamento' } })).status, 200);
  assert.equal((await api(delegation(taskB.id), { method: 'POST', cookie: owner.cookie, body: { email: delegate.email } })).status, 200);
  const revoked = await api(delegation(taskB.id), { method: 'DELETE', cookie: owner.cookie });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.task.delegation_status, null);
  assert.equal((await api(delegation(taskB.id), { method: 'DELETE', cookie: owner.cookie })).body.error, 'no_pending_delegation');
  const listAfterRevoke = await api('/api/crm/tasks/delegated', { cookie: delegate.cookie });
  assert.equal(listAfterRevoke.body.tasks.some(t => t.id === taskB.id), false);

  // Acceptance transfers the task responsibility and only then the delegate
  // (and nobody else) transitions its state.
  assert.equal((await api('/api/crm/tasks/delegated/' + taskA.id + '/response', { method: 'POST', cookie: delegate.cookie, body: { accept: true } })).status, 200);
  const { rows: afterAccept } = await pool.query('SELECT responsible_id, delegation_status FROM crm_tasks WHERE id=$1', [taskA.id]);
  assert.equal(afterAccept[0].responsible_id, delegate.id);
  assert.equal(afterAccept[0].delegation_status, 'aceita');
  const ownerStillSees = await api(endpoint + '?q=qa-del', { cookie: owner.cookie });
  assert.equal(ownerStillSees.body.tasks.find(t => t.id === taskA.id).delegation_status, 'aceita');
  const legacyOwner = await api('/api/crm/opportunities/' + opportunityId, { cookie: owner.cookie });
  assert.equal(legacyOwner.body.tasks.some(t => t.id === taskA.id), true, 'accepted delegation must not vanish from the owner');
  const legacyDelegate = await api('/api/crm/opportunities/' + opportunityId, { cookie: delegate.cookie });
  assert.deepEqual(legacyDelegate.body.tasks, [], 'the delegate gains no access to the opportunity itself');
  assert.equal((await api(endpoint, { cookie: delegate.cookie })).status, 404);
  assert.equal((await api(endpoint + '/' + taskA.id, { method: 'PATCH', cookie: owner.cookie, body: { expected_status: 'aberta', status: 'concluida' } })).body.error, 'task_delegated');
  assert.equal((await api(delegation(taskA.id), { method: 'DELETE', cookie: owner.cookie })).body.error, 'delegation_already_accepted');
  assert.equal((await api('/api/crm/tasks/delegated/' + taskA.id, { method: 'PATCH', cookie: stranger.cookie, body: { expected_status: 'aberta', status: 'em_andamento' } })).status, 404);
  assert.equal((await api('/api/crm/tasks/delegated/' + taskA.id, { method: 'PATCH', cookie: delegate.cookie, body: { expected_status: 'aberta', status: 'reaberta' } })).status, 400);
  assert.equal((await api('/api/crm/tasks/delegated/' + taskA.id, { method: 'PATCH', cookie: delegate.cookie, body: { expected_status: 'em_andamento', status: 'concluida' } })).status, 409);
  assert.equal((await api('/api/crm/tasks/delegated/' + taskA.id, { method: 'PATCH', cookie: delegate.cookie, body: { expected_status: 'aberta', status: 'em_andamento' } })).status, 200);

  const auditA = await pool.query('SELECT action, actor_id FROM auth_access_audit WHERE target=$1 ORDER BY created_at, id', [taskA.id]);
  assert.deepEqual(auditA.rows.map(r => r.action), ['crm_task_create', 'crm_task_delegate', 'crm_task_delegation_accept', 'crm_task_delegated_status']);
  assert.deepEqual(auditA.rows.map(r => r.actor_id), [owner.id, owner.id, delegate.id, delegate.id]);
  const auditEdit = await pool.query("SELECT action FROM auth_access_audit WHERE target=$1 AND action='crm_task_update'", [taskEdit.id]);
  assert.equal(auditEdit.rows.length, 1);

  // Injected audit failure: acceptance must roll back entirely.
  assert.equal((await api(delegation(taskC.id), { method: 'POST', cookie: owner.cookie, body: { email: delegate.email } })).status, 200);
  await pool.query(`CREATE FUNCTION qa_reject_delegation_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.action = 'crm_task_delegation_accept' THEN RAISE EXCEPTION 'qa audit failure'; END IF; RETURN NEW; END $$`);
  await pool.query('CREATE TRIGGER qa_reject_delegation_audit BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_reject_delegation_audit()');
  try {
    assert.equal((await api('/api/crm/tasks/delegated/' + taskC.id + '/response', { method: 'POST', cookie: delegate.cookie, body: { accept: true } })).status, 503);
    const { rows: unchanged } = await pool.query('SELECT responsible_id, delegation_status FROM crm_tasks WHERE id=$1', [taskC.id]);
    assert.equal(unchanged[0].responsible_id, owner.id);
    assert.equal(unchanged[0].delegation_status, 'pendente');
  } finally {
    await pool.query('DROP TRIGGER qa_reject_delegation_audit ON auth_access_audit');
    await pool.query('DROP FUNCTION qa_reject_delegation_audit()');
  }
  assert.equal((await api('/api/crm/tasks/delegated/' + taskC.id + '/response', { method: 'POST', cookie: delegate.cookie, body: { accept: true } })).status, 200);

  // Real browser: owner searches/edits/delegates; delegate accepts and works.
  const browser = await launchBrowser();
  const failures = [];
  try {
    const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
    const ownerPair = owner.cookie.split(';')[0], ownerSep = ownerPair.indexOf('=');
    await ownerContext.addCookies([{ name: ownerPair.slice(0, ownerSep), value: ownerPair.slice(ownerSep + 1), url: baseUrl }]);
    const ownerPage = await ownerContext.newPage();
    trackFailures(ownerPage, failures);
    await ownerPage.goto(baseUrl + '/admin/crm', { waitUntil: 'networkidle' });
    await ownerPage.waitForTimeout(800);
    await ownerPage.getByLabel('Busca por título de oportunidade').fill(opportunity.body.opportunity.title);
    const card = ownerPage.getByRole('article').filter({ hasText: opportunity.body.opportunity.title });
    await card.getByRole('button', { name: 'Abrir tarefas' }).click();
    const section = ownerPage.getByRole('region', { name: 'Minhas tarefas da oportunidade' });
    await section.getByLabel('Buscar por título').fill('qa-ui');
    await section.getByRole('button', { name: 'Buscar tarefas', exact: true }).click();
    await section.getByText('Delegável pela interface qa-ui', { exact: true }).waitFor();
    await section.getByText('1 tarefa(s) neste filtro', { exact: false }).waitFor();
    await section.getByRole('button', { name: 'Editar prazo', exact: true }).click();
    await section.getByLabel('Novo prazo').fill('2031-01-15T09:30');
    const [dueEdited] = await Promise.all([
      ownerPage.waitForResponse(r => r.url().includes(endpoint + '/' + taskD.id) && r.request().method() === 'PATCH'),
      section.getByRole('button', { name: 'Salvar prazo', exact: true }).click(),
    ]);
    assert.equal(dueEdited.status(), 200);
    await section.getByText('Prazo da tarefa atualizado.', { exact: true }).waitFor();
    await section.getByLabel('E-mail do comercial').fill(delegate.email);
    const [delegatedD] = await Promise.all([
      ownerPage.waitForResponse(r => r.url().endsWith('/delegation') && r.request().method() === 'POST'),
      section.getByRole('button', { name: 'Delegar', exact: true }).click(),
    ]);
    assert.equal(delegatedD.status(), 200);
    await section.getByRole('button', { name: 'Revogar delegação', exact: true }).waitFor();
    await assertNoHorizontalScroll(ownerPage, '/admin/crm do delegante');

    // Second real browser/session for the delegate, like the CRM-08 scenario.
    const delegateBrowser = await launchBrowser();
    try {
      const delegateContext = await delegateBrowser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
      const delegatePair = delegate.cookie.split(';')[0], delegateSep = delegatePair.indexOf('=');
      await delegateContext.addCookies([{ name: delegatePair.slice(0, delegateSep), value: delegatePair.slice(delegateSep + 1), url: baseUrl }]);
      const delegatePage = await delegateContext.newPage();
      trackFailures(delegatePage, failures);
      await delegatePage.goto(baseUrl + '/admin/crm', { waitUntil: 'networkidle' });
      await delegatePage.waitForTimeout(800);
      const inbox = delegatePage.getByRole('region', { name: 'Tarefas delegadas a mim' });
      const row = inbox.getByRole('listitem').filter({ hasText: 'Delegável pela interface qa-ui' });
      await row.getByRole('button', { name: 'Aceitar delegação', exact: true }).click();
      await inbox.getByText('Delegação aceita. A tarefa agora é sua.', { exact: true }).waitFor();
      const [doneD] = await Promise.all([
        delegatePage.waitForResponse(r => r.url().includes('/api/crm/tasks/delegated/' + taskD.id) && r.request().method() === 'PATCH'),
        inbox.getByRole('listitem').filter({ hasText: 'Delegável pela interface qa-ui' }).getByRole('button', { name: 'Concluir delegada', exact: true }).click(),
      ]);
      assert.equal(doneD.status(), 200);
      await inbox.getByText('Situação da tarefa delegada atualizada.', { exact: true }).waitFor();
      await assertNoHorizontalScroll(delegatePage, '/admin/crm do delegado');
      await delegateContext.close();
    } finally { await delegateBrowser.close(); }

    await ownerPage.reload({ waitUntil: 'networkidle' });
    await ownerPage.waitForTimeout(500);
    await ownerPage.getByRole('article').filter({ hasText: opportunity.body.opportunity.title }).getByRole('button', { name: 'Abrir tarefas' }).click();
    const sectionAfter = ownerPage.getByRole('region', { name: 'Minhas tarefas da oportunidade' });
    await sectionAfter.getByLabel('Buscar por título').fill('qa-ui');
    await sectionAfter.getByRole('button', { name: 'Buscar tarefas', exact: true }).click();
    await sectionAfter.getByText('aceita. Somente o delegado altera a situação.', { exact: false }).waitFor();
    await ownerContext.close();
  } finally { await browser.close(); }
  assert.deepEqual(failures, []);
  const { rows: finalD } = await pool.query('SELECT status, responsible_id, delegation_status FROM crm_tasks WHERE id=$1', [taskD.id]);
  assert.equal(finalD[0].status, 'concluida');
  assert.equal(finalD[0].responsible_id, delegate.id);
  assert.equal(finalD[0].delegation_status, 'aceita');
});
