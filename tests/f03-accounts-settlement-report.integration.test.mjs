// F03 — conta → baixa → relatório (financeiro da massa sintética seg_demo_local).
// Estado de negócio nasce exclusivamente por HTTP real. SQL é reservado a
// asserções e à falha temporária de auditoria que prova o rollback transacional.
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
const QUEUE = '/api/admin/finance/l07/settlements';
const REPORT = '/api/admin/finance/l07/settlement-report';
const COMPETENCE = '2027-03';
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
  const response = await api(endpoint, { method: 'POST', body: { email: account.email, password: account.password } });
  assert.equal(response.status, 200, `login ${role}: ${JSON.stringify(response.body)}`);
  return cookieOf(response);
}

async function identityOf(role) {
  const account = credentials.find(item => item.role === role);
  const { rows } = await pool.query('SELECT id FROM auth_identities WHERE email = $1', [account.email]);
  return rows[0].id;
}

async function accountOf(role) {
  const account = credentials.find(item => item.role === role);
  const { rows } = await pool.query(
    `SELECT g.client_account_id AS id FROM client_access_grants g
       JOIN auth_identities i ON i.id = g.identity_id
      WHERE i.email = $1 AND g.revoked_at IS NULL`,
    [account.email],
  );
  return rows[0].id;
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

test('F03: conta canônica, baixa idempotente e relatório escopado — fail-closed e auditados', {
  skip: !RUN,
  timeout: 300_000,
}, async () => {
  const accountA = await accountOf('cliente_a');
  const accountB = await accountOf('cliente_b');
  const financeiroIdentity = await identityOf('financeiro');
  const adminIdentity = await identityOf('admin');

  // As concessões granulares nascem por HTTP real: o papel ti detém
  // admin.permissions.grant global e concede financeiro.settlements apenas no
  // escopo da conta sintética A (financeiro) e da conta B (admin).
  let ti = await login('ti', '/api/admin/session');
  for (const [identityId, scopeId, permission] of [
    [financeiroIdentity, accountA, 'finance.settlements.read'],
    [financeiroIdentity, accountA, 'finance.settlements.write'],
    [adminIdentity, accountB, 'finance.settlements.read'],
    [adminIdentity, accountB, 'finance.settlements.write'],
  ]) {
    const granted = await api('/api/admin/permissions', {
      method: 'POST',
      cookie: ti,
      body: {
        identityId,
        permission,
        scopeType: 'account',
        scopeId,
        reason: `Concessão F03 de ${permission} restrita a uma conta sintética.`,
      },
    });
    assert.ok([201, 409].includes(granted.status), JSON.stringify(granted.body));
    ti = await login('ti', '/api/admin/session');
  }

  const financeiro = await login('financeiro', '/api/admin/session');
  const admin = await login('admin', '/api/admin/session');
  const comercial = await login('comercial', '/api/admin/session');
  const clientA = await login('cliente_a', '/api/auth/login');

  // Fronteiras de autorização decididas no servidor, antes de qualquer estado.
  assert.equal((await api(QUEUE)).status, 401, 'anônimo não lê a fila financeira');
  assert.equal((await api(QUEUE, { cookie: clientA })).status, 401, 'cookie de cliente nunca vira sessão de staff');
  const comercialQueue = await api(QUEUE, { cookie: comercial });
  assert.equal(comercialQueue.status, 403, 'staff sem concessão não lê a fila');
  assert.deepEqual(comercialQueue.body, { error: 'permission_scope_denied' });

  // 1) Conta: abertura canônica, idempotente e com escopo verificado.
  const openBody = {
    kind: 'receber',
    accountId: accountA,
    competenceDate: `${COMPETENCE}-01`,
    dueDate: `${COMPETENCE}-10`,
    amountCents: 100000,
    description: 'Mensalidade fictícia da empresa de demonstração A — competência sintética F03.',
  };
  assert.equal((await api(QUEUE, { method: 'POST', cookie: financeiro, body: openBody })).status, 400, 'abertura exige Idempotency-Key');
  const openKey = `f03-fin-open-${randomUUID()}`;
  const wrongOrigin = await api(QUEUE, {
    method: 'POST', cookie: financeiro, body: openBody, headers: { 'Idempotency-Key': openKey }, sendOrigin: false,
  });
  assert.equal(wrongOrigin.status, 403);
  const opens = await Promise.all(Array.from({ length: 5 }, () => api(QUEUE, {
    method: 'POST', cookie: financeiro, body: openBody, headers: { 'Idempotency-Key': openKey },
  })));
  assert.ok(opens.every(result => [200, 201].includes(result.status)), JSON.stringify(opens.map(o => o.body)));
  assert.equal(opens.filter(result => result.status === 201).length, 1, 'só uma abertura material é permitida');
  const receivableId = opens.find(result => result.status === 201).body.id;
  assert.ok(opens.every(result => result.body.id === receivableId));
  assert.match(opens[0].body.protocol || opens.find(r => r.status === 201).body.protocol, /^REC-FIN-\d{8}-[A-Z0-9]{4}$/);
  const openConflict = await api(QUEUE, {
    method: 'POST', cookie: financeiro, body: { ...openBody, amountCents: 999 }, headers: { 'Idempotency-Key': openKey },
  });
  assert.equal(openConflict.status, 409);
  assert.deepEqual(openConflict.body, { error: 'idempotency_conflict' });

  const openedRow = await pool.query(
    `SELECT r.status::text AS status, r.amount_cents, r.amount_paid_cents,
            (SELECT count(*)::int FROM fin_canonical_accounts c WHERE c.receivable_id = r.id) AS governance,
            (SELECT count(*)::int FROM fin_payment_history h WHERE h.receivable_id = r.id) AS history,
            (SELECT count(*)::int FROM fin_settlement_requests s WHERE s.receivable_id = r.id) AS requests,
            (SELECT count(*)::int FROM auth_access_audit a WHERE a.target = r.id::text AND a.action = 'fin_account_open') AS audits
       FROM fin_accounts_receivable r WHERE r.id = $1`,
    [receivableId],
  );
  assert.equal(openedRow.rows[0].status, 'pendente');
  assert.equal(Number(openedRow.rows[0].amount_cents), 100000);
  assert.equal(openedRow.rows[0].governance, 1, 'a conta nasce sob governança canônica');
  assert.equal(openedRow.rows[0].history, 1, 'abertura registrada no histórico imutável');
  assert.equal(openedRow.rows[0].requests, 1, 'uma única intenção no ledger de idempotência');
  assert.equal(openedRow.rows[0].audits, 1);

  // Escopo: a mesma identidade não abre conta de outro cliente.
  const outOfScopeOpen = await api(QUEUE, {
    method: 'POST', cookie: financeiro,
    body: { ...openBody, accountId: accountB }, headers: { 'Idempotency-Key': `f03-fin-open-b-${randomUUID()}` },
  });
  assert.equal(outOfScopeOpen.status, 403);
  assert.deepEqual(outOfScopeOpen.body, { error: 'permission_scope_denied' });

  // Isolamento A/B: a conta da empresa B existe, mas fica fora da fila de A.
  const openB = await api(QUEUE, {
    method: 'POST', cookie: admin,
    body: {
      ...openBody,
      accountId: accountB,
      amountCents: 70000,
      description: 'Mensalidade fictícia da empresa de demonstração B — deve ficar fora do escopo de A.',
    },
    headers: { 'Idempotency-Key': `f03-fin-open-admin-${randomUUID()}` },
  });
  assert.equal(openB.status, 201, JSON.stringify(openB.body));
  const receivableB = openB.body.id;

  const queue = await api(QUEUE, { cookie: financeiro });
  assert.equal(queue.status, 200, JSON.stringify(queue.body));
  assert.ok(queue.body.accounts.some(item => item.id === receivableId), 'a fila traz a conta do escopo concedido');
  assert.ok(!queue.body.accounts.some(item => item.id === receivableB), 'conta da empresa B fica fora da fila escopada em A');
  const crossSettle = await api(QUEUE, {
    method: 'PATCH', cookie: financeiro,
    body: { kind: 'receber', id: receivableB, amountCents: 1000, reason: 'Tentativa fora do escopo concedido nesta jornada.' },
    headers: { 'Idempotency-Key': `f03-fin-cross-${randomUUID()}` },
  });
  assert.equal(crossSettle.status, 403);
  assert.deepEqual(crossSettle.body, { error: 'permission_scope_denied' });

  // A escrita legada que contornaria a máquina canônica está aposentada.
  const legacyPayment = await api('/api/fin/payments', {
    method: 'POST', cookie: financeiro,
    body: { account_type: 'receber', receivable_id: receivableId, amount_cents: 100000, reason: 'Atalho legado sobre conta canônica' },
  });
  assert.equal(legacyPayment.status, 410, JSON.stringify(legacyPayment.body));
  assert.deepEqual(legacyPayment.body, { error: 'legacy_fin04_settlement_write_retired', canonical_endpoint: QUEUE });
  const legacyStatus = await api('/api/fin/receivables', {
    method: 'PATCH', cookie: financeiro,
    body: { id: receivableId, status: 'recebido', reason: 'Edição silenciosa de situação pelo caminho legado' },
  });
  assert.equal(legacyStatus.status, 410);
  assert.deepEqual(legacyStatus.body, { error: 'legacy_fin01_status_write_retired', canonical_endpoint: QUEUE });
  const untouched = await pool.query(
    `SELECT status::text AS status, amount_paid_cents,
            (SELECT count(*)::int FROM fin_payments p WHERE p.receivable_id = $1) AS payments
       FROM fin_accounts_receivable WHERE id = $1`,
    [receivableId],
  );
  assert.equal(untouched.rows[0].status, 'pendente', 'as rotas aposentadas não tocaram o estado');
  assert.equal(untouched.rows[0].payments, 0);

  // 2) Baixa: entradas inválidas, concorrência, replay e divergência.
  const settleBase = { kind: 'receber', id: receivableId, reason: 'Recebimento parcial sintético da jornada F03.' };
  assert.equal((await api(QUEUE, { method: 'PATCH', cookie: financeiro, body: { ...settleBase, amountCents: 40000 } })).status, 400, 'baixa exige Idempotency-Key');
  for (const invalid of [
    { ...settleBase, amountCents: 0 },
    { ...settleBase, amountCents: -40000 },
    { ...settleBase, amountCents: 40000, reason: 'curta' },
    { ...settleBase, amountCents: 40000, method: 'cripto' },
  ]) {
    const rejected = await api(QUEUE, {
      method: 'PATCH', cookie: financeiro, body: invalid, headers: { 'Idempotency-Key': `f03-fin-invalid-${randomUUID()}` },
    });
    assert.equal(rejected.status, 400, JSON.stringify(rejected.body));
  }
  const overpay = await api(QUEUE, {
    method: 'PATCH', cookie: financeiro, body: { ...settleBase, amountCents: 100001 },
    headers: { 'Idempotency-Key': `f03-fin-over-${randomUUID()}` },
  });
  assert.equal(overpay.status, 409);
  assert.deepEqual(overpay.body, { error: 'settlement_exceeds_balance', remainingCents: 100000 });

  // Falha de auditoria desfaz a baixa inteira: nada de pagamento órfão.
  await pool.query(`CREATE OR REPLACE FUNCTION qa_f03_fin_audit_failure() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action = 'fin_account_settle' THEN RAISE EXCEPTION 'f03 settlement audit failure'; END IF;
      RETURN NEW;
    END $$`);
  await pool.query('CREATE TRIGGER qa_f03_fin_audit_failure BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_f03_fin_audit_failure()');
  const partialKey = `f03-fin-partial-${randomUUID()}`;
  const partialBody = { ...settleBase, amountCents: 40000 };
  try {
    const failed = await api(QUEUE, { method: 'PATCH', cookie: financeiro, body: partialBody, headers: { 'Idempotency-Key': partialKey } });
    assert.equal(failed.status, 503, JSON.stringify(failed.body));
    assert.deepEqual(failed.body, { error: 'audit_unavailable' });
  } finally {
    await pool.query('DROP TRIGGER qa_f03_fin_audit_failure ON auth_access_audit');
    await pool.query('DROP FUNCTION qa_f03_fin_audit_failure()');
  }
  const afterRollback = await pool.query(
    `SELECT status::text AS status, amount_paid_cents,
            (SELECT count(*)::int FROM fin_payments p WHERE p.receivable_id = $1) AS payments,
            (SELECT count(*)::int FROM fin_settlement_requests s WHERE s.receivable_id = $1 AND s.request_kind = 'settlement') AS requests
       FROM fin_accounts_receivable WHERE id = $1`,
    [receivableId],
  );
  assert.equal(afterRollback.rows[0].status, 'pendente', 'falha de auditoria desfaz a baixa por completo');
  assert.equal(Number(afterRollback.rows[0].amount_paid_cents), 0);
  assert.equal(afterRollback.rows[0].payments, 0);
  assert.equal(afterRollback.rows[0].requests, 0);

  const partials = await Promise.all(Array.from({ length: 4 }, () => api(QUEUE, {
    method: 'PATCH', cookie: financeiro, body: partialBody, headers: { 'Idempotency-Key': partialKey },
  })));
  assert.ok(partials.every(result => result.status === 200), JSON.stringify(partials.map(item => item.body)));
  assert.equal(partials.filter(result => result.body.replayed === false).length, 1, 'só uma baixa material por chave');
  const material = partials.find(result => result.body.replayed === false);
  assert.equal(material.body.status, 'parcial');
  assert.equal(material.body.paidCents, 40000);
  assert.equal(material.body.remainingCents, 60000);
  const partialConflict = await api(QUEUE, {
    method: 'PATCH', cookie: financeiro, body: { ...partialBody, amountCents: 50000 }, headers: { 'Idempotency-Key': partialKey },
  });
  assert.equal(partialConflict.status, 409);
  assert.deepEqual(partialConflict.body, { error: 'idempotency_conflict' });

  // Conclusão da baixa e recusa de qualquer baixa posterior.
  const finalKey = `f03-fin-final-${randomUUID()}`;
  const finalSettle = await api(QUEUE, {
    method: 'PATCH', cookie: financeiro,
    body: { kind: 'receber', id: receivableId, amountCents: 60000, reason: 'Recebimento complementar sintético que liquida a conta.' },
    headers: { 'Idempotency-Key': finalKey },
  });
  assert.equal(finalSettle.status, 200, JSON.stringify(finalSettle.body));
  assert.equal(finalSettle.body.status, 'recebido');
  assert.equal(finalSettle.body.remainingCents, 0);
  const settled = await pool.query(
    `SELECT status::text AS status, amount_paid_cents, paid_at,
            (SELECT count(*)::int FROM fin_payments p WHERE p.receivable_id = $1) AS payments,
            (SELECT count(*)::int FROM fin_payment_history h WHERE h.receivable_id = $1) AS history,
            (SELECT count(*)::int FROM auth_access_audit a WHERE a.target = $1::text AND a.action = 'fin_account_settle') AS audits
       FROM fin_accounts_receivable WHERE id = $1`,
    [receivableId],
  );
  assert.equal(settled.rows[0].status, 'recebido');
  assert.equal(Number(settled.rows[0].amount_paid_cents), 100000);
  assert.ok(settled.rows[0].paid_at, 'liquidação registra paid_at');
  assert.equal(settled.rows[0].payments, 2, 'exatamente dois pagamentos materiais');
  assert.equal(settled.rows[0].history, 3, 'abertura + duas baixas no histórico');
  assert.equal(settled.rows[0].audits, 2);
  const afterSettled = await api(QUEUE, {
    method: 'PATCH', cookie: financeiro,
    body: { kind: 'receber', id: receivableId, amountCents: 1000, reason: 'Baixa indevida sobre conta já liquidada.' },
    headers: { 'Idempotency-Key': `f03-fin-again-${randomUUID()}` },
  });
  assert.equal(afterSettled.status, 409);
  assert.deepEqual(afterSettled.body, { error: 'settlement_transition_not_allowed', status: 'recebido' });
  const ghost = await api(QUEUE, {
    method: 'PATCH', cookie: financeiro,
    body: { kind: 'receber', id: randomUUID(), amountCents: 1000, reason: 'Conta inexistente não pode gerar efeito.' },
    headers: { 'Idempotency-Key': `f03-fin-ghost-${randomUUID()}` },
  });
  assert.equal(ghost.status, 404);

  // 3) Relatório: escopo, fronteiras e auditoria da leitura.
  assert.equal((await api(`${REPORT}?competence=${COMPETENCE}`)).status, 401);
  assert.equal((await api(`${REPORT}?competence=${COMPETENCE}`, { cookie: comercial })).status, 403);
  assert.equal((await api(`${REPORT}?competence=2027-13`, { cookie: financeiro })).status, 400);
  const report = await api(`${REPORT}?competence=${COMPETENCE}`, { cookie: financeiro });
  assert.equal(report.status, 200, JSON.stringify(report.body));
  assert.equal(report.body.competence, COMPETENCE);
  assert.equal(report.body.totals.receber.accounts, 1, 'relatório vê apenas a conta do escopo concedido');
  assert.equal(report.body.totals.receber.totalCents, 100000);
  assert.equal(report.body.totals.receber.settledCents, 100000);
  assert.equal(report.body.totals.receber.openCents, 0);
  assert.equal(report.body.totals.pagar.accounts, 0);
  assert.ok(!report.body.accounts.some(line => line.id === receivableB), 'a conta da empresa B não entra no relatório de A');
  const reportB = await api(`${REPORT}?competence=${COMPETENCE}`, { cookie: admin });
  assert.equal(reportB.body.totals.receber.accounts, 1);
  assert.equal(reportB.body.totals.receber.settledCents, 0, 'o escopo de B enxerga apenas a própria conta em aberto');
  const reportAudit = await pool.query(
    `SELECT count(*)::int AS total FROM auth_access_audit WHERE action = 'fin_settlement_report_read' AND target = $1`,
    [COMPETENCE],
  );
  assert.ok(reportAudit.rows[0].total >= 2, 'cada leitura do relatório deixa rastro');

  // 4) Interface honesta: a jornada inteira pelo Chromium, sem erro silencioso.
  const failures = [];
  const uiDescription = `Conta sintética aberta pelo Chromium ${randomUUID().slice(0, 8)} na jornada F03.`;
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
    const page = await context.newPage();
    trackFailures(page, failures);
    await addCookie(context, financeiro);
    await page.goto(`${baseUrl}/admin/financeiro`, { waitUntil: 'networkidle' });
    await page.getByTestId('finance-tab-settlements').click();
    await page.getByTestId('fin-f03-settlements').waitFor();
    await page.locator('#fin-f03-account').fill(accountA);
    await page.locator('#fin-f03-competence-date').fill(`${COMPETENCE}-05`);
    await page.locator('#fin-f03-due-date').fill(`${COMPETENCE}-20`);
    await page.locator('#fin-f03-amount').fill('25000');
    await page.locator('#fin-f03-description').fill(uiDescription);
    const created = page.waitForResponse(response => new URL(response.url()).pathname === QUEUE
      && response.request().method() === 'POST' && response.status() === 201);
    await page.getByRole('button', { name: 'Abrir conta' }).click();
    await created;
    await page.getByTestId('fin-f03-notice').waitFor();

    const uiRow = await pool.query(
      'SELECT id, protocol FROM fin_accounts_receivable WHERE description = $1',
      [uiDescription],
    );
    assert.equal(uiRow.rows.length, 1, 'a interface criou exatamente uma conta');
    const uiId = uiRow.rows[0].id;
    const card = page.getByTestId(`fin-f03-account-${uiId}`);
    await card.waitFor();
    await page.locator(`#fin-f03-settle-amount-${uiId}`).fill('25000');
    await page.locator(`#fin-f03-settle-reason-${uiId}`).fill('Baixa integral registrada pela interface no gate F03.');
    const settledUi = page.waitForResponse(response => new URL(response.url()).pathname === QUEUE
      && response.request().method() === 'PATCH' && response.status() === 200);
    await card.getByRole('button', { name: 'Registrar baixa' }).click();
    await settledUi;
    await page.getByText('Baixa integral registrada; a conta foi liquidada com trilha auditada.').waitFor();
    await page.getByTestId(`fin-f03-settled-${uiId}`).waitFor();

    await page.locator('#fin-f03-report-competence').fill(COMPETENCE);
    const reported = page.waitForResponse(response => new URL(response.url()).pathname === REPORT && response.status() === 200);
    await page.getByRole('button', { name: 'Gerar relatório' }).click();
    await reported;
    await page.getByTestId('fin-f03-report').waitFor();
    const receberLine = await page.getByTestId('fin-f03-report-receber').textContent();
    assert.match(receberLine || '', /2 conta\(s\)/, `relatório na interface: ${receberLine}`);
    assert.match(receberLine || '', /em aberto R\$ 0,00/);
    const overflow = await page.getByTestId('fin-f03-settlements').evaluate(node => node.scrollWidth <= node.clientWidth + 1);
    assert.equal(overflow, true, 'a área da jornada não cria rolagem horizontal própria');
    await context.close();
  } finally {
    await browser.close();
  }

  const uiFinal = await pool.query(
    `SELECT r.status::text AS status,
            (SELECT count(*)::int FROM fin_canonical_accounts c WHERE c.receivable_id = r.id) AS governance,
            (SELECT count(*)::int FROM fin_payments p WHERE p.receivable_id = r.id) AS payments
       FROM fin_accounts_receivable r WHERE r.description = $1`,
    [uiDescription],
  );
  assert.equal(uiFinal.rows[0].status, 'recebido');
  assert.equal(uiFinal.rows[0].governance, 1);
  assert.equal(uiFinal.rows[0].payments, 1);
  assert.deepEqual(failures, [], `UI F03 financeiro sem console ou HTTP 5xx: ${failures.join(', ')}`);
});

if (!RUN) {
  test('F03 accounts settlement report gate opt-in guard', { skip: 'execute via npm run test:f03-contas-baixa-relatorio:pg' }, () => {});
}
