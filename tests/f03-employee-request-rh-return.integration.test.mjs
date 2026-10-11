// F03 — funcionário -> solicitação -> análise RH -> retorno.
// Estado de negócio nasce exclusivamente por HTTP. SQL é reservado a asserções
// e à falha temporária de auditoria que prova o rollback transacional.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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

async function api(pathname, { method = 'GET', body, cookie, headers = {}, sendOrigin = true } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(sendOrigin ? { origin: baseUrl } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
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

async function login(role, endpoint) {
  const account = credentials.find(item => item.role === role);
  assert.ok(account, `credencial sintética ${role} ausente`);
  const response = await api(endpoint, {
    method: 'POST', body: { email: account.email, password: account.password },
  });
  assert.equal(response.status, 200, `login ${role}: ${JSON.stringify(response.body)}`);
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

async function addCookie(context, cookie) {
  const pair = cookie.split(';')[0];
  const separator = pair.indexOf('=');
  await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl }]);
}

before(async () => {
  if (!RUN) return;
  credentials = JSON.parse(await readFile(process.env.F03_CREDENTIALS_FILE, 'utf8'));
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
});

after(async () => { await pool?.end().catch(() => {}); });

test('F03: funcionário solicita, RH analisa e devolve retorno idempotente e auditado', {
  skip: !RUN,
  timeout: 180_000,
}, async () => {
  const employee = await login('funcionario', '/api/employee/session');
  const rh = await login('rh', '/api/admin/session');
  const commercial = await login('comercial', '/api/admin/session');
  const clientA = await login('cliente_a', '/api/auth/login');
  const clientB = await login('cliente_b', '/api/auth/login');

  const requestBody = {
    // O campo forjado não deve definir o titular: somente a sessão employee o faz.
    employeeId: randomUUID(),
    requestType: 'beneficio',
    title: 'Auxílio transporte sintético F03',
    description: 'Solicitação inteiramente fictícia para validar análise e retorno do RH.',
  };
  const creationKey = `f03-employee-create-${randomUUID()}`;

  // Autorização é decidida no servidor antes de mutar qualquer estado.
  const anonymous = await api('/api/employee/actions/request', { method: 'POST', body: requestBody, headers: { 'Idempotency-Key': creationKey } });
  assert.equal(anonymous.status, 401);
  const wrongOrigin = await api('/api/employee/actions/request', { method: 'POST', cookie: employee, body: requestBody, headers: { 'Idempotency-Key': creationKey }, sendOrigin: false });
  assert.equal(wrongOrigin.status, 403);
  const missingKey = await api('/api/employee/actions/request', { method: 'POST', cookie: employee, body: requestBody });
  assert.equal(missingKey.status, 400);
  assert.equal(missingKey.body.error, 'idempotency_key_required');
  const employeeOnRhApi = await api('/api/admin/hr/l03/self-requests', { cookie: employee });
  assert.equal(employeeOnRhApi.status, 401, 'cookie employee nunca vira sessão de RH');
  const commercialDenied = await api('/api/admin/hr/l03/self-requests', { cookie: commercial });
  assert.equal(commercialDenied.status, 403, 'staff sem employees.read não lê a fila RH');

  // Retry concorrente da mesma intenção converge para uma única solicitação.
  const creates = await Promise.all(Array.from({ length: 5 }, () => api('/api/employee/actions/request', {
    method: 'POST', cookie: employee, body: requestBody, headers: { 'Idempotency-Key': creationKey },
  })));
  assert.ok(creates.every(result => [200, 201].includes(result.status)), JSON.stringify(creates));
  const requestId = creates[0].body.request.id;
  assert.ok(creates.every(result => result.body.request.id === requestId));
  assert.equal(creates.filter(result => result.status === 201).length, 1, 'só uma criação material é permitida');
  const replay = await api('/api/employee/actions/request', {
    method: 'POST', cookie: employee, body: requestBody, headers: { 'Idempotency-Key': creationKey },
  });
  assert.equal(replay.status, 200); assert.equal(replay.body.replayed, true);
  const conflictingRetry = await api('/api/employee/actions/request', {
    method: 'POST', cookie: employee, body: { ...requestBody, title: 'Conteúdo divergente na mesma chave' }, headers: { 'Idempotency-Key': creationKey },
  });
  assert.equal(conflictingRetry.status, 409);
  assert.equal(conflictingRetry.body.error, 'idempotency_key_reused');

  const createdState = await pool.query(`SELECT r.employee_id,r.status,r.idempotency_key,
    (SELECT count(*)::int FROM emp_self_requests WHERE employee_id=r.employee_id AND idempotency_key=$2) AS duplicates
    FROM emp_self_requests r WHERE r.id=$1`, [requestId, creationKey]);
  assert.match(createdState.rows[0].employee_id, /^[0-9a-f-]{36}$/i);
  assert.equal(createdState.rows[0].status, 'solicitado');
  assert.equal(createdState.rows[0].idempotency_key, creationKey);
  assert.equal(createdState.rows[0].duplicates, 1);
  const employeeIdentity = credentials.find(item => item.role === 'funcionario').email;
  const owner = await pool.query(`SELECT i.email FROM emp_self_requests r JOIN hr_employees e ON e.id=r.employee_id JOIN auth_identities i ON i.id=e.identity_id WHERE r.id=$1`, [requestId]);
  assert.equal(owner.rows[0].email, employeeIdentity, 'employee_id do corpo foi ignorado em favor da sessão');

  const rhQueue = await api('/api/admin/hr/l03/self-requests?status=solicitado', { cookie: rh });
  assert.equal(rhQueue.status, 200, JSON.stringify(rhQueue.body));
  assert.ok(rhQueue.body.requests.some(item => item.id === requestId));
  const directApproval = await api('/api/admin/hr/l03/self-requests', {
    method: 'PATCH', cookie: rh,
    body: { id: requestId, action: 'aprovar', message: 'Não pode pular a análise.' },
    headers: { 'Idempotency-Key': `f03-direct-approval-${randomUUID()}` },
  });
  assert.equal(directApproval.status, 409);
  // A rota EMP-12 antiga não pode contornar transição, auditoria ou idempotência.
  const legacyApproval = await api('/api/admin/hr/self-requests', {
    method: 'PATCH', cookie: rh, body: { id: requestId, status: 'aprovado' },
  });
  assert.equal(legacyApproval.status, 410);
  assert.equal(legacyApproval.body.error, 'legacy_emp12_write_retired');
  const legacyFollowup = await api('/api/admin/hr/self-request-followups', {
    method: 'POST', cookie: rh, body: { request_id: requestId, status: 'aprovado', message: 'Atalho legado não pode publicar retorno.' },
  });
  assert.equal(legacyFollowup.status, 410);
  const afterLegacyBlock = await pool.query(`SELECT r.status,
    (SELECT count(*)::int FROM emp_self_request_followups WHERE request_id=r.id) AS followups
    FROM emp_self_requests r WHERE r.id=$1`, [requestId]);
  assert.deepEqual(afterLegacyBlock.rows[0], { status: 'solicitado', followups: 0 });
  const reviewWrongOrigin = await api('/api/admin/hr/l03/self-requests', {
    method: 'PATCH', cookie: rh,
    body: { id: requestId, action: 'em_analise', message: 'Análise deve exigir origem válida.' },
    headers: { 'Idempotency-Key': `f03-wrong-origin-${randomUUID()}` }, sendOrigin: false,
  });
  assert.equal(reviewWrongOrigin.status, 403);

  // A análise também é idempotente sob concorrência e cria uma única devolutiva.
  const analysisKey = `f03-analysis-${randomUUID()}`;
  const analysisBody = { id: requestId, action: 'em_analise', message: 'RH iniciou a conferência do pedido sintético.' };
  const analyses = await Promise.all(Array.from({ length: 4 }, () => api('/api/admin/hr/l03/self-requests', {
    method: 'PATCH', cookie: rh, body: analysisBody, headers: { 'Idempotency-Key': analysisKey },
  })));
  assert.ok(analyses.every(result => result.status === 200), JSON.stringify(analyses));
  assert.equal(analyses.filter(result => result.body.replayed === false).length, 1);

  // A falha no audit_log deve desfazer decisão e mensagem juntas, sem reduzir a asserção.
  await pool.query(`CREATE OR REPLACE FUNCTION qa_f03_employee_audit_failure() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='emp_self_request_review' AND NEW.meta->>'status'='aprovado' THEN RAISE EXCEPTION 'f03 employee audit failure'; END IF;
      RETURN NEW;
    END $$`);
  await pool.query('CREATE TRIGGER qa_f03_employee_audit_failure BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION qa_f03_employee_audit_failure()');
  const approvalKey = `f03-approval-${randomUUID()}`;
  const approvalBody = { id: requestId, action: 'aprovar', message: 'Benefício sintético conferido e aprovado pelo RH.' };
  try {
    const failedApproval = await api('/api/admin/hr/l03/self-requests', {
      method: 'PATCH', cookie: rh, body: approvalBody, headers: { 'Idempotency-Key': approvalKey },
    });
    assert.equal(failedApproval.status, 503, JSON.stringify(failedApproval.body));
  } finally {
    await pool.query('DROP TRIGGER qa_f03_employee_audit_failure ON audit_log');
    await pool.query('DROP FUNCTION qa_f03_employee_audit_failure()');
  }
  const rollbackState = await pool.query(`SELECT r.status,
    (SELECT count(*)::int FROM emp_self_request_followups WHERE request_id=r.id) AS followups
    FROM emp_self_requests r WHERE r.id=$1`, [requestId]);
  assert.deepEqual(rollbackState.rows[0], { status: 'em_analise', followups: 1 });

  // O retry pós-falha reutiliza a chave sem duplicar o retorno final.
  const approved = await api('/api/admin/hr/l03/self-requests', {
    method: 'PATCH', cookie: rh, body: approvalBody, headers: { 'Idempotency-Key': approvalKey },
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.request.status, 'aprovado');
  const approvalReplay = await api('/api/admin/hr/l03/self-requests', {
    method: 'PATCH', cookie: rh, body: approvalBody, headers: { 'Idempotency-Key': approvalKey },
  });
  assert.equal(approvalReplay.status, 200); assert.equal(approvalReplay.body.replayed, true);
  const approvalConflict = await api('/api/admin/hr/l03/self-requests', {
    method: 'PATCH', cookie: rh, body: { ...approvalBody, message: 'Mensagem divergente.' }, headers: { 'Idempotency-Key': approvalKey },
  });
  assert.equal(approvalConflict.status, 409);

  const ownHome = await api('/api/employee/home', { cookie: employee });
  assert.equal(ownHome.status, 200, JSON.stringify(ownHome.body));
  const ownRequest = ownHome.body.requests.find(item => item.id === requestId);
  assert.ok(ownRequest, 'o portal retorna somente a solicitação do titular');
  assert.equal(ownRequest.status, 'aprovado');
  assert.deepEqual(ownRequest.followups.map(item => item.status), ['em_analise', 'aprovado']);
  assert.match(ownRequest.followups[1].message, /aprovado pelo RH/);
  const auditAndFollowups = await pool.query(`SELECT
    (SELECT count(*)::int FROM emp_self_request_followups WHERE request_id=$1) AS followups,
    (SELECT count(*)::int FROM audit_log WHERE target=$1::text AND action='emp_self_request_create') AS creates,
    (SELECT count(*)::int FROM audit_log WHERE target=$1::text AND action='emp_self_request_review') AS reviews`, [requestId]);
  assert.deepEqual(auditAndFollowups.rows[0], { followups: 2, creates: 1, reviews: 2 });

  // O isolamento A/B da massa F03 permanece efetivo nesta fatia independente.
  const visibleA = await api('/api/client/accounts', { cookie: clientA });
  const visibleB = await api('/api/client/accounts', { cookie: clientB });
  assert.equal(visibleA.status, 200); assert.equal(visibleB.status, 200);
  assert.equal(visibleA.body.accounts.length, 1); assert.equal(visibleB.body.accounts.length, 1);
  assert.notEqual(visibleA.body.accounts[0].id, visibleB.body.accounts[0].id);

  // Chromium percorre o caminho visível: empregado abre, RH analisa/decide,
  // e o retorno é exibido no portal próprio sem erros silenciosos.
  // O Chromium empacotado usa --single-process no ambiente de gate: cada
  // papel recebe seu próprio processo para manter sessões isoladas de verdade.
  const failures = [];
  const uiTitle = `Benefício interface F03 ${randomUUID().slice(0, 8)}`;

  const createBrowser = await launchBrowser();
  try {
    const employeeContext = await createBrowser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    const employeePage = await employeeContext.newPage();
    trackFailures(employeePage, failures);
    await addCookie(employeeContext, employee);
    await employeePage.goto(`${baseUrl}/funcionario`, { waitUntil: 'networkidle' });
    await employeePage.getByText(/Olá, Funcionário/).waitFor();
    await employeePage.getByRole('tab', { name: /Pedidos$/ }).click();
    await employeePage.getByRole('button', { name: 'Solicitação' }).click();
    await employeePage.locator('[name="requestType"]').selectOption('beneficio');
    await employeePage.locator('[name="title"]').fill(uiTitle);
    await employeePage.locator('textarea[name="description"]').fill('Pedido sintético aberto no Chromium para revisão da interface de RH.');
    const createdUi = employeePage.waitForResponse(response => new URL(response.url()).pathname === '/api/employee/actions/request' && response.status() === 201);
    await employeePage.getByRole('button', { name: 'Enviar' }).click();
    await createdUi;
    await employeePage.getByText(uiTitle).waitFor();
    assert.equal(await employeePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'portal mobile não cria rolagem horizontal');
    await employeeContext.close();
  } finally {
    await createBrowser.close();
  }

  const rhBrowser = await launchBrowser();
  try {
    const rhContext = await rhBrowser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
    const rhPage = await rhContext.newPage();
    trackFailures(rhPage, failures);
    await addCookie(rhContext, rh);
    await rhPage.goto(`${baseUrl}/admin/funcionarios`, { waitUntil: 'networkidle' });
    await rhPage.getByRole('heading', { name: 'Pessoas e jornada do funcionário' }).waitFor();
    await rhPage.getByRole('tab', { name: 'Solicitações' }).click();
    const requestCard = rhPage.locator('article').filter({ hasText: uiTitle });
    await requestCard.waitFor();
    const responseBox = requestCard.getByRole('textbox', { name: /Retorno para/ });
    await responseBox.fill('RH iniciou a análise pela interface Chromium.');
    const analysisUi = rhPage.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/hr/l03/self-requests' && response.request().method() === 'PATCH' && response.status() === 200);
    await requestCard.getByRole('button', { name: 'Iniciar análise' }).click();
    await analysisUi;
    // Aguarda o refresh assíncrono e a limpeza intencional do campo anterior:
    // o segundo comando deve carregar uma nova mensagem, não reaproveitar a antiga.
    await rhPage.getByText('Análise iniciada. A pessoa já vê que a solicitação está sendo tratada.').waitFor();
    await requestCard.getByRole('button', { name: 'Aprovar solicitação' }).waitFor();
    await responseBox.fill('RH aprovou a solicitação pela interface Chromium.');
    const approvalUi = rhPage.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/hr/l03/self-requests' && response.request().method() === 'PATCH' && response.status() === 200);
    await requestCard.getByRole('button', { name: 'Aprovar solicitação' }).click();
    await approvalUi;
    assert.equal(await rhPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'fila RH não cria rolagem horizontal');
    await rhContext.close();
  } finally {
    await rhBrowser.close();
  }

  const returnBrowser = await launchBrowser();
  try {
    const employeeContext = await returnBrowser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    const employeePage = await employeeContext.newPage();
    trackFailures(employeePage, failures);
    await addCookie(employeeContext, employee);
    await employeePage.goto(`${baseUrl}/funcionario`, { waitUntil: 'networkidle' });
    await employeePage.getByRole('tab', { name: /Pedidos$/ }).click();
    const employeeCard = employeePage.locator('article').filter({ hasText: uiTitle });
    await employeeCard.waitFor();
    assert.equal(await employeeCard.getByText('Retorno do RH:', { exact: false }).count(), 2, 'portal mostra os dois retornos canônicos do RH');
    await employeeCard.getByText(/RH aprovou a solicitação pela interface Chromium/).waitFor();
    assert.equal(await employeePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'retorno mobile não cria rolagem horizontal');
    await employeeContext.close();
  } finally {
    await returnBrowser.close();
  }
  assert.deepEqual(failures, [], `UI F03 funcionário/RH sem console ou HTTP 5xx: ${failures.join(', ')}`);
});

if (!RUN) {
  test('F03 employee/RH gate opt-in guard', { skip: 'execute via npm run test:f03-employee-request-rh-return:pg' }, () => {});
}
