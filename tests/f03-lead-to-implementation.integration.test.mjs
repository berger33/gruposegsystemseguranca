// F03 — lead -> oportunidade -> proposta revisada -> contrato -> implantação.
// The database is prepared only by the canonical isolated demo seed. Every
// business state in this file is born through real HTTP; SQL is read-only
// assertions or temporary failure injection for the rollback proof.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { chromium as playwrightChromium } from 'playwright';
import packagedChromium from '@sparticuz/chromium';

const RUN = process.env.RUN_DATABASE_INTEGRATION === '1'
  && process.env.DATABASE_URL
  && process.env.F03_BASE_URL
  && process.env.F03_CREDENTIALS_FILE;
const baseUrl = process.env.F03_BASE_URL;
let pool;
let credentials;

async function api(pathname, { method = 'GET', body, cookie, sendOrigin = true, origin = baseUrl } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(sendOrigin ? { origin } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const setCookie = response.headers.getSetCookie?.()
    || (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: response.status, body: parsed, setCookie };
}

function cookieOf(response) {
  return response.setCookie.map(item => item.split(';')[0]).join('; ');
}

async function loginStaff(role) {
  const account = credentials.find(item => item.role === role);
  assert.ok(account, `credencial sintética ${role} ausente`);
  const response = await api('/api/admin/session', {
    method: 'POST', body: { email: account.email, password: account.password },
  });
  assert.equal(response.status, 200, `login ${role}: ${JSON.stringify(response.body)}`);
  return cookieOf(response);
}

async function loginClient(label) {
  const account = credentials.find(item => item.role === label);
  assert.ok(account, `credencial sintética ${label} ausente`);
  const response = await api('/api/auth/login', {
    method: 'POST', body: { email: account.email, password: account.password },
  });
  assert.equal(response.status, 200, `login ${label}: ${JSON.stringify(response.body)}`);
  return cookieOf(response);
}

async function launchBrowser() {
  return playwrightChromium.launch({
    executablePath: await packagedChromium.executablePath(),
    args: packagedChromium.args.filter(arg => arg !== '--disable-web-security'),
    headless: true,
  });
}

function trackFailures(page, failures) {
  page.on('console', message => {
    if (message.type() === 'error' && !/^Failed to load resource/.test(message.text())) {
      failures.push(`console:${message.text().slice(0, 200)}`);
    }
  });
  page.on('pageerror', error => failures.push(`pageerror:${String(error?.message || error).slice(0, 200)}`));
  page.on('requestfailed', request => {
    if (request.url().startsWith(baseUrl)) failures.push(`requestfailed:${request.url()} ${request.failure()?.errorText || ''}`);
  });
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === baseUrl && url.pathname.startsWith('/api/') && response.status() >= 500) {
      failures.push(`http:${response.status()} ${url.pathname}`);
    }
  });
}

async function assertNoHorizontalScroll(page, label) {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    true,
    `${label} não deve criar rolagem horizontal`,
  );
}

before(async () => {
  if (!RUN) return;
  credentials = JSON.parse(await readFile(process.env.F03_CREDENTIALS_FILE, 'utf8'));
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
});

after(async () => { await pool?.end().catch(() => {}); });

test('F03: jornada canônica real, bloqueios, retry, auditoria transacional e isolamento A/B', {
  skip: !RUN,
  timeout: 180_000,
}, async () => {
  const admin = await loginStaff('admin');
  const commercial = await loginStaff('comercial');

  // Auth server-side and same-origin are checked before any business write.
  const anonymousConvert = await api(`/api/crm/leads/00000000-0000-4000-8000-000000000001/convert`, {
    method: 'POST', body: { create_company: true, company_name: 'Não deve nascer F03' },
  });
  assert.equal(anonymousConvert.status, 401);
  const crossOrigin = await api('/api/crm/companies', {
    method: 'POST', cookie: admin, sendOrigin: false,
    body: { display_name: 'Origem inválida F03' },
  });
  assert.equal(crossOrigin.status, 403);
  const anonymousContractRead = await api('/api/crm/contracts');
  assert.equal(anonymousContractRead.status, 401);

  // 1) Public lead is recorded by the public API, never by SQL.
  const lead = await api('/api/leads', {
    method: 'POST',
    body: {
      requestKind: 'quote',
      name: 'Lead Sintético F03',
      phone: '(11) 97777-4401',
      city: 'Guarulhos',
      propertyType: 'Empresa ou comércio',
      services: ['Segurança Desarmada', 'Câmeras e CFTV'],
      details: 'Operação fictícia para validar o encadeamento F03.',
      origin: 'f03-gate',
      campaign: 'jornada-sintetica',
      channel: 'site',
      email: 'lead.f03@example.invalid',
      consent: true,
    },
  });
  assert.equal(lead.status, 201, JSON.stringify(lead.body));
  const leadId = lead.body.leadId;

  const converted = await api(`/api/crm/leads/${leadId}/convert`, {
    method: 'POST', cookie: admin,
    body: { create_company: true, company_name: 'Empresa Fictícia F03 A' },
  });
  assert.equal(converted.status, 201, JSON.stringify(converted.body));
  const opportunityId = converted.body.opportunityId;
  const convertedRetry = await api(`/api/crm/leads/${leadId}/convert`, {
    method: 'POST', cookie: admin,
    body: { create_company: true, company_name: 'Empresa Fictícia F03 A' },
  });
  assert.equal(convertedRetry.status, 200);
  assert.equal(convertedRetry.body.opportunityId, opportunityId);

  // A conversion failure at the audit boundary rolls back company/contact/
  // opportunity together. This trigger is temporary test infrastructure, not
  // a fixture row or a product state inserted by the gate.
  const rollbackLead = await api('/api/leads', {
    method: 'POST',
    body: {
      requestKind: 'quote', name: 'Lead Rollback F03', phone: '(11) 97777-4402',
      city: 'Guarulhos', propertyType: 'Empresa ou comércio', services: ['Segurança Desarmada'],
      details: 'Falha sintética de auditoria transacional.', email: 'rollback.f03@example.invalid', consent: true,
    },
  });
  assert.equal(rollbackLead.status, 201);
  await pool.query(`CREATE OR REPLACE FUNCTION qa_f03_conversion_audit_failure() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action IN ('crm_company_create','crm_lead_convert') THEN RAISE EXCEPTION 'f03 audit failure'; END IF;
      RETURN NEW;
    END $$`);
  await pool.query(`CREATE TRIGGER qa_f03_conversion_audit_failure
    BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_f03_conversion_audit_failure()`);
  try {
    const failedConversion = await api(`/api/crm/leads/${rollbackLead.body.leadId}/convert`, {
      method: 'POST', cookie: admin,
      body: { create_company: true, company_name: 'Empresa que deve sofrer rollback F03' },
    });
    assert.equal(failedConversion.status, 503, JSON.stringify(failedConversion.body));
  } finally {
    await pool.query('DROP TRIGGER qa_f03_conversion_audit_failure ON auth_access_audit');
    await pool.query('DROP FUNCTION qa_f03_conversion_audit_failure()');
  }
  const rollbackEffects = await pool.query(`SELECT
    (SELECT count(*) FROM crm_opportunities WHERE public_lead_id=$1)::int AS opportunities,
    (SELECT count(*) FROM crm_companies WHERE display_name='Empresa que deve sofrer rollback F03')::int AS companies`, [rollbackLead.body.leadId]);
  assert.deepEqual(rollbackEffects.rows[0], { opportunities: 0, companies: 0 });

  // 2) Proposal lifecycle: item + explicit review + revised scope + send.
  const proposal = await api('/api/crm/proposals', {
    method: 'POST', cookie: admin,
    body: {
      company_id: converted.body.companyId,
      opportunity_id: opportunityId,
      title: 'Proposta revisada F03',
      scope_description: 'Escopo inicial fictício para revisão comercial.',
      validity_days: 15,
    },
  });
  assert.equal(proposal.status, 201, JSON.stringify(proposal.body));
  const proposalId = proposal.body.proposal.id;
  const item = await api(`/api/crm/proposals/${proposalId}/items`, {
    method: 'POST', cookie: admin,
    body: { type: 'servico', description: 'Serviço fictício F03', quantity: 1, unit: 'mês', unit_cost: 100, unit_price: 150, recurrence_type: 'recorrente' },
  });
  assert.equal(item.status, 201, JSON.stringify(item.body));
  assert.equal((await api(`/api/crm/proposals/${proposalId}`, { method: 'PATCH', cookie: admin, body: { status: 'em_revisao' } })).status, 200);
  const revised = await api(`/api/crm/proposals/${proposalId}`, {
    method: 'PATCH', cookie: admin,
    body: { scope_description: 'Escopo revisado e aceito para envio — versão F03.' },
  });
  assert.equal(revised.status, 200, JSON.stringify(revised.body));
  const approved = await api(`/api/crm/proposals/${proposalId}`, { method: 'PATCH', cookie: admin, body: { status: 'aprovada_para_envio' } });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const sent = await api(`/api/crm/proposals/${proposalId}`, { method: 'PATCH', cookie: admin, body: { status: 'enviada' } });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const sentVersion = sent.body.proposal.version;
  assert.ok(sentVersion > 1, 'a proposta enviada precisa carregar uma versão revisada');
  assert.match(sent.body.proposal.scope_description, /revisado/);

  // A draft/sent proposal cannot create an L05 contract before acceptance.
  const preAcceptance = await api('/api/crm/contracts', {
    method: 'POST', cookie: admin,
    body: { source: 'proposal', proposal_id: proposalId, proposal_version: sentVersion },
  });
  assert.equal(preAcceptance.status, 409, JSON.stringify(preAcceptance.body));
  assert.equal(preAcceptance.body.error, 'accepted_current_proposal_version_required');
  const noContractYet = await pool.query('SELECT count(*)::int AS count FROM crm_contracts WHERE proposal_id=$1', [proposalId]);
  assert.equal(noContractYet.rows[0].count, 0);

  // Acceptance is a server-side mutation. The canonical contract boundary is
  // called afterward, and retries converge on one contract/implantation.
  const accepted = await api(`/api/crm/proposals/${proposalId}`, {
    method: 'PATCH', cookie: admin, body: { status: 'aceita' },
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.ok(accepted.body.contract?.id, 'aceite must expose the canonical contract reference');
  const acceptedVersion = accepted.body.proposal.version;
  assert.equal(acceptedVersion, sentVersion + 1);

  const commercialMutation = await api('/api/crm/contracts', {
    method: 'POST', cookie: commercial,
    body: { source: 'proposal', proposal_id: proposalId, proposal_version: acceptedVersion },
  });
  assert.equal(commercialMutation.status, 403);

  const retries = await Promise.all([
    api('/api/crm/contracts', { method: 'POST', cookie: admin, body: { source: 'proposal', proposal_id: proposalId, proposal_version: acceptedVersion } }),
    api('/api/crm/contracts', { method: 'POST', cookie: admin, body: { source: 'proposal', proposal_id: proposalId, proposal_version: acceptedVersion } }),
  ]);
  assert.ok(retries.every(result => [200, 201].includes(result.status)), JSON.stringify(retries));
  const contractId = accepted.body.contract.id;
  assert.ok(retries.every(result => result.body.contract?.id === contractId));

  const canonical = await pool.query(`SELECT
    (SELECT count(*) FROM crm_contracts WHERE proposal_id=$1 AND proposal_version=$2)::int AS contracts,
    (SELECT count(*) FROM crm_contract_items WHERE contract_id=$3)::int AS items,
    (SELECT count(*) FROM crm_contract_implantations WHERE contract_id=$3)::int AS implantations,
    (SELECT count(*) FROM crm_implantation_steps WHERE contract_id=$3)::int AS steps,
    (SELECT count(*) FROM auth_access_audit WHERE action='l05_contract_create' AND target=$3::text)::int AS contract_audits`,
    [proposalId, acceptedVersion, contractId]);
  assert.deepEqual(canonical.rows[0], { contracts: 1, items: 1, implantations: 1, steps: 10, contract_audits: 1 });

  // Client identities supplied by the F03 seed see only their own synthetic
  // account: this is the A/B isolation check, independent of UI hiding.
  const clientA = await loginClient('cliente_a');
  const clientB = await loginClient('cliente_b');
  const visibleA = await api('/api/client/accounts', { cookie: clientA });
  const visibleB = await api('/api/client/accounts', { cookie: clientB });
  assert.equal(visibleA.status, 200); assert.equal(visibleB.status, 200);
  assert.equal(visibleA.body.accounts.length, 1); assert.equal(visibleB.body.accounts.length, 1);
  assert.match(visibleA.body.accounts[0].display_name, /Empresa A/);
  assert.match(visibleB.body.accounts[0].display_name, /Empresa B/);
  assert.notEqual(visibleA.body.accounts[0].id, visibleB.body.accounts[0].id);

  // Chromium proves the authenticated workspace reports the real loaded state
  // (including implantation checklist) and has no silent network failures.
  const browser = await launchBrowser();
  const failures = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
    const page = await context.newPage();
    trackFailures(page, failures);
    const pair = admin.split(';')[0];
    const separator = pair.indexOf('=');
    await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl }]);
    await page.goto(`${baseUrl}/admin/comercial`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: /Vistoria, orçamento, proposta e contrato/ }).waitFor();
    await page.getByRole('button', { name: 'Contrato (idempotência)' }).click();
    await page.getByText('CRM-23 + CON-01', { exact: false }).waitFor();
    await page.getByText('Proposta revisada F03', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Ver' }).first().click();
    await page.getByText('Implantação').last().waitFor();
    await page.getByText('contrato e evidência de assinatura', { exact: false }).waitFor();
    await assertNoHorizontalScroll(page, 'workspace comercial F03');
    await context.close();
  } finally {
    await browser.close();
  }
  assert.deepEqual(failures, [], `UI F03 sem erros de console/HTTP 5xx: ${failures.join(', ')}`);
});

if (!RUN) {
  // Keep `node --test tests/f03...` useful outside the disposable gate without
  // touching any configured operator database.
  test('F03 gate opt-in guard', { skip: 'set RUN_DATABASE_INTEGRATION=1 through npm run test:f03-lead-to-implementation:pg' }, () => {});
}
