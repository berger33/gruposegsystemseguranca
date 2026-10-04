// F03 — conta a receber → baixa → relatório.
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
const COMPETENCE = '2036-07';
const COMPETENCE_DATE = `${COMPETENCE}-01`;
const DUE_DATE = `${COMPETENCE}-10`;
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

async function accountOf(role) {
  const { rows } = await pool.query(
    `SELECT g.client_account_id AS id FROM client_access_grants g
       JOIN auth_identities i ON i.id = g.identity_id
      WHERE i.email = $1 AND g.revoked_at IS NULL`,
    [credentials.find(item => item.role === role).email],
  );
  return rows[0].id;
}

before(async () => {
  if (!RUN) return;
  credentials = JSON.parse(await readFile(process.env.F03_CREDENTIALS_FILE, 'utf8'));
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
});

after(async () => { await pool?.end().catch(() => {}); });

test('F03: conta a receber escopada, baixa idempotente e relatório verificável', {
  skip: !RUN,
  timeout: 300_000,
}, async () => {
  const tiAccount = credentials.find(item => item.role === 'ti');
  const { rows: [tiIdentity] } = await pool.query('SELECT id FROM auth_identities WHERE email = $1', [tiAccount.email]);
  const accountA = await accountOf('cliente_a');
  const accountB = await accountOf('cliente_b');
  const { rows: [contractA] } = await pool.query(
    'SELECT id FROM client_contracts WHERE client_account_id = $1 ORDER BY created_at ASC LIMIT 1', [accountA],
  );

  const loginTi = () => login('ti', '/api/admin/session');
  let ti = await loginTi();

  // A autoridade financeira é granular e nasce via HTTP real: o papel ti
  // possui admin.permissions.grant global e se concede as quatro permissões
  // SOMENTE no escopo da conta sintética A. A conta B deve permanecer fora do
  // alcance desta identidade durante todo o gate.
  for (const permission of [
    'finance.receivables.read',
    'finance.receivables.write',
    'finance.receivables.settle',
    'finance.reports.read',
  ]) {
    const granted = await api('/api/admin/permissions', {
      method: 'POST',
      cookie: ti,
      body: {
        identityId: tiIdentity.id,
        permission,
        scopeType: 'account',
        scopeId: accountA,
        reason: `Concessão ${permission} da jornada financeira F03 restrita à conta sintética A.`,
      },
    });
    assert.ok([201, 409].includes(granted.status), JSON.stringify(granted.body));
    ti = await loginTi();
  }

  // ---------- fronteiras de autorização ----------
  assert.equal((await api('/api/admin/finance/l07/receivables')).status, 401, 'anônimo não lê a fila financeira');
  const clientA = await login('cliente_a', '/api/auth/login');
  assert.equal(
    (await api('/api/admin/finance/l07/receivables', { cookie: clientA })).status, 401,
    'cookie de cliente nunca vira sessão de staff',
  );
  const comercial = await login('comercial', '/api/admin/session');
  const comercialQueue = await api('/api/admin/finance/l07/receivables', { cookie: comercial });
  assert.equal(comercialQueue.status, 403, 'staff sem concessão não lê a fila');
  assert.deepEqual(comercialQueue.body, { error: 'permission_scope_denied' });
  // O papel financeiro é o rótulo clássico do L07 e, ainda assim, não basta:
  // a autoridade da jornada canônica vive em auth_permissions.
  const financeiro = await login('financeiro', '/api/admin/session');
  assert.equal(
    (await api('/api/admin/finance/l07/receivables', { cookie: financeiro })).status, 403,
    'rótulo de papel não substitui concessão fail-closed',
  );
  const crossOrigin = await api('/api/admin/finance/l07/receivables', {
    method: 'POST', cookie: ti, sendOrigin: false,
    headers: { origin: 'https://externo.example', 'Idempotency-Key': `f03fin-origin-${randomUUID()}` },
    body: { accountId: accountA, competenceDate: COMPETENCE_DATE, dueDate: DUE_DATE, amountCents: 1000, description: 'Origem estranha não abre conta.' },
  });
  assert.equal(crossOrigin.status, 403);
  assert.deepEqual(crossOrigin.body, { error: 'same_origin_required' });

  // ---------- abertura da conta ----------
  const emptyQueue = await api(`/api/admin/finance/l07/receivables?competence=${COMPETENCE}`, { cookie: ti });
  assert.equal(emptyQueue.status, 200, JSON.stringify(emptyQueue.body));
  assert.deepEqual(emptyQueue.body.receivables, [], 'a competência começa sem contas');

  const openBody = {
    accountId: accountA,
    contractId: contractA.id,
    competenceDate: COMPETENCE_DATE,
    dueDate: DUE_DATE,
    amountCents: 250000,
    description: 'Mensalidade sintética F03 da empresa fictícia A; nenhum valor real.',
  };
  const missingKey = await api('/api/admin/finance/l07/receivables', { method: 'POST', cookie: ti, body: openBody });
  assert.equal(missingKey.status, 400);
  assert.deepEqual(missingKey.body, { error: 'idempotency_key_required_or_invalid' });
  for (const [invalid, expected] of [
    [{ ...openBody, amountCents: 0 }, 'receivable_amount_invalid'],
    [{ ...openBody, amountCents: '12,5' }, 'receivable_amount_invalid'],
    [{ ...openBody, dueDate: '2036-06-30' }, 'due_before_competence'],
    [{ ...openBody, description: 'curta' }, 'receivable_description_invalid'],
    [{ ...openBody, competenceDate: '2036-02-31' }, 'invalid_receivable_dates'],
  ]) {
    const refused = await api('/api/admin/finance/l07/receivables', {
      method: 'POST', cookie: ti, body: invalid, headers: { 'Idempotency-Key': `f03fin-invalid-${randomUUID()}` },
    });
    assert.equal(refused.status, 400, JSON.stringify(refused.body));
    assert.equal(refused.body.error, expected);
  }
  const outOfScopeOpen = await api('/api/admin/finance/l07/receivables', {
    method: 'POST', cookie: ti, body: { ...openBody, accountId: accountB, contractId: null },
    headers: { 'Idempotency-Key': `f03fin-scope-${randomUUID()}` },
  });
  assert.equal(outOfScopeOpen.status, 403);
  assert.deepEqual(outOfScopeOpen.body, { error: 'permission_scope_denied' });

  const openKey = `f03fin-open-${randomUUID()}`;
  const opens = await Promise.all(Array.from({ length: 5 }, () => api('/api/admin/finance/l07/receivables', {
    method: 'POST', cookie: ti, body: openBody, headers: { 'Idempotency-Key': openKey },
  })));
  assert.ok(opens.every(item => [200, 201].includes(item.status)), JSON.stringify(opens.map(item => item.body)));
  assert.equal(opens.filter(item => item.status === 201).length, 1, 'só uma abertura material é permitida');
  const receivableId = opens.find(item => item.status === 201).body.receivableId;
  assert.ok(opens.every(item => item.body.receivableId === receivableId));
  assert.match(opens.find(item => item.status === 201).body.protocol, /^REC-FIN-\d{8}-[A-Z0-9]{4}$/);
  const openConflict = await api('/api/admin/finance/l07/receivables', {
    method: 'POST', cookie: ti, body: { ...openBody, amountCents: 999999 }, headers: { 'Idempotency-Key': openKey },
  });
  assert.equal(openConflict.status, 409);
  assert.deepEqual(openConflict.body, { error: 'idempotency_conflict' });
  const materialised = await pool.query(
    `SELECT count(*)::int AS total FROM fin_accounts_receivable WHERE canonical_idempotency_key = $1`, [openKey],
  );
  assert.equal(materialised.rows[0].total, 1, 'cinco tentativas convergem para uma conta');

  // Uma conta da empresa B existe (criada pelo fluxo legado L07, por HTTP real)
  // e precisa ficar invisível para a identidade escopada em A.
  const legacyB = await api('/api/fin/receivables', {
    method: 'POST', cookie: financeiro,
    body: {
      client_account_id: accountB, competence_date: COMPETENCE_DATE, due_date: DUE_DATE,
      amount_cents: 77000, description: 'Conta sintética da empresa fictícia B para provar isolamento A/B.',
    },
  });
  assert.equal(legacyB.status, 201, JSON.stringify(legacyB.body));
  const receivableB = legacyB.body.receivable.id;
  const queue = await api(`/api/admin/finance/l07/receivables?competence=${COMPETENCE}`, { cookie: ti });
  assert.equal(queue.status, 200);
  assert.deepEqual(queue.body.receivables.map(item => item.id), [receivableId], 'a fila só traz a conta autorizada');

  // ---------- escrita legada aposentada ----------
  const retired = await api('/api/fin/receivables', {
    method: 'PATCH', cookie: financeiro,
    body: { id: receivableB, status: 'recebido', reason: 'Atalho legado de situação sem baixa correspondente.' },
  });
  assert.equal(retired.status, 410);
  assert.deepEqual(retired.body, {
    error: 'legacy_fin_receivable_status_write_retired',
    canonical_endpoint: '/api/admin/finance/l07/receivables',
  });
  assert.equal(
    (await api('/api/fin/receivables', { method: 'PATCH', body: { id: receivableB, status: 'recebido', reason: 'anônimo' } })).status,
    401, 'a guarda de sessão continua antes do 410',
  );
  const untouched = await pool.query('SELECT status, amount_paid_cents FROM fin_accounts_receivable WHERE id = $1', [receivableB]);
  assert.equal(untouched.rows[0].status, 'pendente', 'a rota aposentada não tocou o estado');
  assert.equal(Number(untouched.rows[0].amount_paid_cents), 0);

  // ---------- baixa ----------
  const settleBase = { id: receivableId, action: 'baixar', amountCents: 100000, reason: 'Recebimento sintético conferido no extrato fictício da demo.' };
  assert.equal(
    (await api('/api/admin/finance/l07/receivables', { method: 'PATCH', cookie: ti, body: settleBase })).body.error,
    'idempotency_key_required_or_invalid',
  );
  for (const [invalid, expected] of [
    [{ ...settleBase, action: 'quitar' }, 'invalid_settlement_action'],
    [{ ...settleBase, amountCents: -1 }, 'settlement_amount_invalid'],
    [{ ...settleBase, reason: 'curto' }, 'settlement_reason_invalid'],
    [{ ...settleBase, paymentMethod: 'cripto' }, 'invalid_payment_method'],
  ]) {
    const refused = await api('/api/admin/finance/l07/receivables', {
      method: 'PATCH', cookie: ti, body: invalid, headers: { 'Idempotency-Key': `f03fin-bad-${randomUUID()}` },
    });
    assert.equal(refused.status, 400, JSON.stringify(refused.body));
    assert.equal(refused.body.error, expected);
  }
  const exceeding = await api('/api/admin/finance/l07/receivables', {
    method: 'PATCH', cookie: ti, body: { ...settleBase, amountCents: 250001 },
    headers: { 'Idempotency-Key': `f03fin-exceed-${randomUUID()}` },
  });
  assert.equal(exceeding.status, 409);
  assert.deepEqual(exceeding.body, { error: 'settlement_exceeds_remaining', remainingCents: 250000 });
  const settleOutOfScope = await api('/api/admin/finance/l07/receivables', {
    method: 'PATCH', cookie: ti, body: { ...settleBase, id: receivableB },
    headers: { 'Idempotency-Key': `f03fin-scope-settle-${randomUUID()}` },
  });
  assert.equal(settleOutOfScope.status, 403);
  assert.deepEqual(settleOutOfScope.body, { error: 'permission_scope_denied' });

  // Falha injetada de auditoria desfaz a baixa inteira.
  await pool.query(`CREATE OR REPLACE FUNCTION qa_f03_fin_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.action = 'receivable_settle' THEN RAISE EXCEPTION 'qa_f03_fin_audit_unavailable'; END IF;
      RETURN NEW;
    END $$`);
  await pool.query('CREATE TRIGGER qa_f03_fin_audit_failure BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_f03_fin_audit_failure()');
  try {
    const failed = await api('/api/admin/finance/l07/receivables', {
      method: 'PATCH', cookie: ti, body: settleBase, headers: { 'Idempotency-Key': `f03fin-rollback-${randomUUID()}` },
    });
    assert.equal(failed.status, 503, JSON.stringify(failed.body));
    assert.deepEqual(failed.body, { error: 'audit_unavailable' });
  } finally {
    await pool.query('DROP TRIGGER qa_f03_fin_audit_failure ON auth_access_audit');
    await pool.query('DROP FUNCTION qa_f03_fin_audit_failure()');
  }
  const afterRollback = await pool.query(
    `SELECT r.status, r.amount_paid_cents,
            (SELECT count(*)::int FROM fin_payments p WHERE p.receivable_id = r.id) AS payments,
            (SELECT count(*)::int FROM fin_receivable_settlements s WHERE s.receivable_id = r.id) AS settlements
       FROM fin_accounts_receivable r WHERE r.id = $1`, [receivableId],
  );
  assert.deepEqual(
    [afterRollback.rows[0].status, Number(afterRollback.rows[0].amount_paid_cents), afterRollback.rows[0].payments, afterRollback.rows[0].settlements],
    ['pendente', 0, 0, 0],
    'falha de auditoria desfaz saldo, pagamento e trilha juntos',
  );

  // Baixa parcial com quatro tentativas concorrentes da mesma intenção.
  const partialKey = `f03fin-partial-${randomUUID()}`;
  const partials = await Promise.all(Array.from({ length: 4 }, () => api('/api/admin/finance/l07/receivables', {
    method: 'PATCH', cookie: ti, body: settleBase, headers: { 'Idempotency-Key': partialKey },
  })));
  assert.ok(partials.every(item => item.status === 200), JSON.stringify(partials.map(item => item.body)));
  assert.equal(partials.filter(item => item.body.replayed === false).length, 1, 'uma única baixa material');
  assert.ok(partials.every(item => item.body.status === 'parcial'));
  const partialConflict = await api('/api/admin/finance/l07/receivables', {
    method: 'PATCH', cookie: ti, body: { ...settleBase, amountCents: 50000 }, headers: { 'Idempotency-Key': partialKey },
  });
  assert.equal(partialConflict.status, 409);
  assert.deepEqual(partialConflict.body, { error: 'idempotency_conflict' });

  const afterPartial = await pool.query(
    `SELECT r.status, r.amount_paid_cents, r.paid_at,
            (SELECT count(*)::int FROM fin_payments p WHERE p.receivable_id = r.id) AS payments,
            (SELECT count(*)::int FROM fin_receivable_settlements s WHERE s.receivable_id = r.id) AS settlements,
            (SELECT count(*)::int FROM fin_payment_history h WHERE h.receivable_id = r.id) AS history
       FROM fin_accounts_receivable r WHERE r.id = $1`, [receivableId],
  );
  assert.equal(afterPartial.rows[0].status, 'parcial');
  assert.equal(Number(afterPartial.rows[0].amount_paid_cents), 100000);
  assert.equal(afterPartial.rows[0].paid_at, null, 'baixa parcial não declara quitação');
  assert.equal(afterPartial.rows[0].payments, 1);
  assert.equal(afterPartial.rows[0].settlements, 1);
  assert.equal(afterPartial.rows[0].history, 2, 'abertura + baixa parcial no histórico canônico');

  // Quitação final e recusa de nova baixa.
  const finalSettle = await api('/api/admin/finance/l07/receivables', {
    method: 'PATCH', cookie: ti,
    body: { ...settleBase, amountCents: 150000, reason: 'Segunda parcela sintética recebida e conferida na demo isolada.' },
    headers: { 'Idempotency-Key': `f03fin-final-${randomUUID()}` },
  });
  assert.equal(finalSettle.status, 200, JSON.stringify(finalSettle.body));
  assert.equal(finalSettle.body.status, 'recebido');
  assert.equal(finalSettle.body.remainingCents, 0);
  const closedAgain = await api('/api/admin/finance/l07/receivables', {
    method: 'PATCH', cookie: ti, body: { ...settleBase, amountCents: 100 },
    headers: { 'Idempotency-Key': `f03fin-again-${randomUUID()}` },
  });
  assert.equal(closedAgain.status, 409);
  assert.deepEqual(closedAgain.body, { error: 'receivable_settlement_not_allowed', status: 'recebido' });

  // A trilha de baixa é append-only mesmo para o superusuário do banco.
  await assert.rejects(
    () => pool.query('UPDATE fin_receivable_settlements SET amount_cents = 1 WHERE receivable_id = $1', [receivableId]),
    /fin_f03_append_only_table/,
  );

  // ---------- relatório ----------
  assert.equal(
    (await api(`/api/admin/finance/l07/receivables/report?competence=${COMPETENCE}`, { cookie: comercial })).status, 403,
    'relatório exige finance.reports.read',
  );
  const badCompetence = await api('/api/admin/finance/l07/receivables/report?competence=2036-13', { cookie: ti });
  assert.equal(badCompetence.status, 400);
  assert.deepEqual(badCompetence.body, { error: 'invalid_competence' });
  const foreignReport = await api(`/api/admin/finance/l07/receivables/report?competence=${COMPETENCE}&account=${accountB}`, { cookie: ti });
  assert.equal(foreignReport.status, 403);
  assert.deepEqual(foreignReport.body, { error: 'permission_scope_denied' });

  const report = await api(`/api/admin/finance/l07/receivables/report?competence=${COMPETENCE}`, { cookie: ti });
  assert.equal(report.status, 200, JSON.stringify(report.body));
  assert.deepEqual(report.body.totals, {
    accountCount: 1,
    receivableCount: 1,
    settlementCount: 2,
    totalReceivableCents: 250000,
    totalSettledCents: 250000,
    totalOpenCents: 0,
  });
  assert.deepEqual(report.body.accounts.map(item => item.accountId), [accountA], 'a conta B nunca entra no relatório escopado');
  const canonicalTotals = await pool.query(
    `SELECT coalesce(sum(amount_cents),0)::bigint AS total, coalesce(sum(amount_paid_cents),0)::bigint AS paid
       FROM fin_accounts_receivable
      WHERE client_account_id = $1 AND date_trunc('month', competence_date) = date_trunc('month', $2::date) AND status <> 'cancelado'`,
    [accountA, COMPETENCE_DATE],
  );
  assert.equal(Number(canonicalTotals.rows[0].total), report.body.totals.totalReceivableCents, 'o total do relatório vem do banco');
  assert.equal(Number(canonicalTotals.rows[0].paid), report.body.totals.totalSettledCents);
  assert.deepEqual(report.body.emissions, [], 'nenhuma emissão antes de emitir');

  const emitKey = `f03fin-emit-${randomUUID()}`;
  const emitBody = { competence: COMPETENCE, note: 'Relatório sintético da competência de demonstração isolada.' };
  assert.equal(
    (await api('/api/admin/finance/l07/receivables/report', { method: 'POST', cookie: ti, body: emitBody })).body.error,
    'idempotency_key_required_or_invalid',
  );
  const emitted = await api('/api/admin/finance/l07/receivables/report', {
    method: 'POST', cookie: ti, body: emitBody, headers: { 'Idempotency-Key': emitKey },
  });
  assert.equal(emitted.status, 201, JSON.stringify(emitted.body));
  assert.match(emitted.body.protocol, /^REL-FIN-\d{8}-[A-Z0-9]{4}$/);
  assert.equal(emitted.body.matchesCurrent, true);
  assert.equal(emitted.body.payloadSha256, report.body.payloadSha256, 'a emissão imprime exatamente o cálculo lido');
  const emitReplay = await api('/api/admin/finance/l07/receivables/report', {
    method: 'POST', cookie: ti, body: emitBody, headers: { 'Idempotency-Key': emitKey },
  });
  assert.equal(emitReplay.status, 200);
  assert.equal(emitReplay.body.replayed, true);
  assert.equal(emitReplay.body.protocol, emitted.body.protocol);
  const emitConflict = await api('/api/admin/finance/l07/receivables/report', {
    method: 'POST', cookie: ti, body: { ...emitBody, note: 'Observação divergente sob a mesma chave de emissão.' },
    headers: { 'Idempotency-Key': emitKey },
  });
  assert.equal(emitConflict.status, 409);
  assert.deepEqual(emitConflict.body, { error: 'idempotency_conflict' });
  const emissionRows = await pool.query(
    `SELECT count(*)::int AS total FROM fin_receivable_report_emissions WHERE idempotency_key = $1`, [emitKey],
  );
  assert.equal(emissionRows.rows[0].total, 1, 'uma emissão material por chave');

  // O relatório emitido é um recibo, não uma fonte: abrir outra conta na mesma
  // competência deixa a emissão anterior honestamente marcada como desatualizada.
  const secondOpen = await api('/api/admin/finance/l07/receivables', {
    method: 'POST', cookie: ti,
    body: { ...openBody, contractId: null, amountCents: 40000, description: 'Serviço adicional sintético na mesma competência de demonstração.' },
    headers: { 'Idempotency-Key': `f03fin-open2-${randomUUID()}` },
  });
  assert.equal(secondOpen.status, 201, JSON.stringify(secondOpen.body));
  const reportAfter = await api(`/api/admin/finance/l07/receivables/report?competence=${COMPETENCE}`, { cookie: ti });
  assert.equal(reportAfter.body.totals.receivableCount, 2);
  assert.equal(reportAfter.body.totals.totalReceivableCents, 290000);
  assert.equal(reportAfter.body.totals.totalOpenCents, 40000);
  assert.equal(reportAfter.body.emissions.length, 1);
  assert.equal(reportAfter.body.emissions[0].protocol, emitted.body.protocol);
  assert.equal(reportAfter.body.emissions[0].matchesCurrent, false, 'a emissão antiga não finge estar em dia');

  // ---------- auditoria ----------
  const auditEvents = await pool.query(
    `SELECT action, count(*)::int AS total FROM auth_access_audit
      WHERE actor_id = $1 AND action IN ('receivable_open','receivable_settle','receivable_report_emit')
      GROUP BY action ORDER BY action`,
    [tiIdentity.id],
  );
  assert.deepEqual(auditEvents.rows.map(row => [row.action, row.total]), [
    ['receivable_open', 2],
    ['receivable_report_emit', 1],
    ['receivable_settle', 2],
  ]);

  // ---------- interface real ----------
  const failures = [];
  const uiDescription = `Conta de interface F03 ${randomUUID().slice(0, 8)}`;
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
    const page = await context.newPage();
    trackFailures(page, failures);
    await page.setExtraHTTPHeaders({ origin: baseUrl });
    await addCookie(context, ti);
    await page.goto(`${baseUrl}/admin/financeiro`, { waitUntil: 'networkidle' });
    await page.getByTestId('finance-tab-f03-journey').click();
    await page.waitForSelector('[data-testid="f03fin-workspace"]');
    // A espera honesta é pela resposta real da fila na competência escolhida:
    // um <ul> vazio não tem altura e nunca ficaria "visível".
    const listedUi = page.waitForResponse(response => {
      const target = new URL(response.url());
      return target.pathname === '/api/admin/finance/l07/receivables'
        && response.request().method() === 'GET'
        && target.searchParams.get('competence') === COMPETENCE;
    });
    await page.getByTestId('f03fin-competence').fill(COMPETENCE);
    assert.equal(
      await page.getByTestId('f03fin-competence').inputValue(), COMPETENCE,
      'a competência escolhida precisa chegar ao formulário real',
    );
    await listedUi;
    const listReadError = await page.getByTestId('f03fin-read-error').count();
    assert.equal(
      listReadError, 0,
      `fila financeira na interface: ${listReadError ? await page.getByTestId('f03fin-read-error').textContent() : ''}`,
    );
    await page.getByTestId(`f03fin-item-${receivableId}`).waitFor();

    await page.getByTestId('f03fin-account').fill(accountA);
    await page.getByTestId('f03fin-competence-date').fill(COMPETENCE_DATE);
    await page.getByTestId('f03fin-due-date').fill(DUE_DATE);
    await page.getByTestId('f03fin-amount').fill('60000');
    await page.getByTestId('f03fin-description').fill(uiDescription);
    const createdUi = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/admin/finance/l07/receivables'
      && response.request().method() === 'POST' && response.status() === 201);
    await page.getByTestId('f03fin-open-submit').click();
    await createdUi;
    await page.getByTestId('f03fin-notice').waitFor();
    const uiRow = await pool.query('SELECT id, protocol FROM fin_accounts_receivable WHERE description = $1', [uiDescription]);
    assert.equal(uiRow.rows.length, 1, 'a interface abriu exatamente uma conta');
    const uiReceivableId = uiRow.rows[0].id;

    await page.getByTestId(`f03fin-select-${uiReceivableId}`).click();
    await page.waitForSelector('[data-testid="f03fin-detail"]');
    await page.getByTestId('f03fin-settle-amount').fill('60000');
    await page.getByTestId('f03fin-settle-reason').fill('Baixa total registrada na interface Chromium do gate financeiro F03.');
    const settledUi = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/admin/finance/l07/receivables'
      && response.request().method() === 'PATCH' && response.status() === 200);
    await page.getByTestId('f03fin-settle-submit').click();
    await settledUi;
    await page.getByText(/quitada/).waitFor();

    const computedUi = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/admin/finance/l07/receivables/report'
      && response.request().method() === 'GET' && response.status() === 200);
    await page.getByTestId('f03fin-report-compute').click();
    await computedUi;
    await page.waitForSelector('[data-testid="f03fin-report-totals"]');
    const totalsText = await page.getByTestId('f03fin-report-totals').textContent();
    assert.match(totalsText || '', /3 conta\(s\)/, `totais visíveis na interface: ${totalsText}`);

    await page.getByTestId('f03fin-report-note').fill('Emissão feita pela interface real do gate F03 financeiro.');
    const emittedUi = page.waitForResponse(response =>
      new URL(response.url()).pathname === '/api/admin/finance/l07/receivables/report'
      && response.request().method() === 'POST' && response.status() === 201);
    await page.getByTestId('f03fin-report-emit').click();
    await emittedUi;
    await page.getByText(/Relatório REL-FIN-/).waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true,
      'a jornada financeira não cria rolagem horizontal',
    );
    await context.close();
  } finally {
    await browser.close();
  }

  const uiFinal = await pool.query(
    `SELECT r.status, (SELECT count(*)::int FROM fin_receivable_settlements s WHERE s.receivable_id = r.id) AS settlements
       FROM fin_accounts_receivable r WHERE r.description = $1`, [uiDescription],
  );
  assert.equal(uiFinal.rows[0].status, 'recebido');
  assert.equal(uiFinal.rows[0].settlements, 1);
  const uiEmissions = await pool.query(
    `SELECT count(*)::int AS total FROM fin_receivable_report_emissions WHERE note LIKE 'Emissão feita pela interface real%'`,
  );
  assert.equal(uiEmissions.rows[0].total, 1, 'a emissão da interface também é material e única');
  assert.deepEqual(failures, [], `UI F03 financeira sem console ou HTTP 5xx: ${failures.join(', ')}`);
});

if (!RUN) {
  test('F03 receivable settlement report gate opt-in guard', { skip: 'execute via npm run test:f03-contas-baixa-relatorio:pg' }, () => {});
}
