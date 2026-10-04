// F03 — cliente -> chamado -> atendimento -> aceite.
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
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 } );
});

after(async () => { await pool?.end().catch(() => {}); });

test('F03: cliente abre, staff atende com escopo, cliente aceita — idempotente e auditado', {
  skip: !RUN,
  timeout: 240_000,
}, async () => {
  const clientA = await login('cliente_a', '/api/auth/login');
  const clientB = await login('cliente_b', '/api/auth/login');
  const tiAccount = credentials.find(item => item.role === 'ti');
  const { rows: [tiIdentity] } = await pool.query('SELECT id FROM auth_identities WHERE email = $1', [tiAccount.email]);
  const accountA = (await pool.query(`SELECT g.client_account_id AS id FROM client_access_grants g JOIN auth_identities i ON i.id = g.identity_id WHERE i.email = $1 AND g.revoked_at IS NULL`, [credentials.find(item => item.role === 'cliente_a').email])).rows[0].id;
  const accountB = (await pool.query(`SELECT g.client_account_id AS id FROM client_access_grants g JOIN auth_identities i ON i.id = g.identity_id WHERE i.email = $1 AND g.revoked_at IS NULL`, [credentials.find(item => item.role === 'cliente_b').email])).rows[0].id;

  async function loginTi() {
    return login('ti', '/api/admin/session');
  }

  // O atendimento canônico exige concessão RBAC granular nascida via HTTP real.
  // O papel ti detém admin.permissions.grant global (gatilho da migração 102)
  // e se concede client.tickets.* apenas no escopo da conta A — a conta B deve
  // permanecer fora do alcance desta identidade durante todo o gate.
  let ti = await loginTi();
  for (const [permission, suffix] of [['client.tickets.read', 'read'], ['client.tickets.write', 'write']]) {
    const granted = await api('/api/admin/permissions', {
      method: 'POST',
      cookie: ti,
      body: {
        identityId: tiIdentity.id,
        permission,
        scopeType: 'account',
        scopeId: accountA,
        reason: `Concessão ${suffix} de atendimento F03 restrita à conta sintética A.`,
      },
    });
    assert.ok([201, 409].includes(granted.status), JSON.stringify(granted.body));
    // Conceder revoga a própria sessão; reautentica pelo fluxo real.
    ti = await loginTi();
  }

  // Autorização é decidida no servidor antes de qualquer estado.
  const comercial = await login('comercial', '/api/admin/session');
  const comercialQueue = await api('/api/admin/client/l08/tickets', { cookie: comercial });
  assert.equal(comercialQueue.status, 403, 'staff sem client.tickets.read não lê a fila');
  const anonymousQueue = await api('/api/admin/client/l08/tickets');
  assert.equal(anonymousQueue.status, 401);
  const clientOnStaffQueue = await api('/api/admin/client/l08/tickets', { cookie: clientA });
  assert.equal(clientOnStaffQueue.status, 401, 'cookie de cliente nunca vira sessão de staff');

  // O cliente abre o chamado; retry concorrente da mesma intenção converge.
  const ticketBody = {
    accountId: accountA,
    category: 'Outro assunto',
    title: 'Chamado sintético F03 — ronda',
    details: 'Dúvida inteiramente fictícia sobre a ronda da empresa de demonstração. Nenhum dado real.',
  };
  const creationKey = `f03-ticket-create-${randomUUID()}`;
  const missingKey = await api('/api/client/tickets', { method: 'POST', cookie: clientA, body: ticketBody });
  assert.equal(missingKey.status, 400);
  const creates = await Promise.all(Array.from({ length: 5 }, () => api('/api/client/tickets', {
    method: 'POST', cookie: clientA, body: ticketBody, headers: { 'Idempotency-Key': creationKey },
  })));
  assert.ok(creates.every(result => [200, 201].includes(result.status)), JSON.stringify(creates));
  const ticketId = creates[0].body.ticketId;
  assert.ok(creates.every(result => result.body.ticketId === ticketId));
  assert.equal(creates.filter(result => result.status === 201).length, 1, 'só uma abertura material é permitida');
  const createConflict = await api('/api/client/tickets', {
    method: 'POST', cookie: clientA, body: { ...ticketBody, details: 'Detalhe divergente sob a mesma chave.' }, headers: { 'Idempotency-Key': creationKey },
  });
  assert.equal(createConflict.status, 409);
  assert.equal(createConflict.body.error, 'idempotency_conflict');

  // A escrita legada (transição arbitrária sem escopo nem devolutiva) está aposentada.
  const retired = await api(`/api/admin/tickets/${ticketId}`, {
    method: 'PATCH', cookie: ti, body: { status: 'in_progress', adminResponse: 'atalho legado' },
  });
  assert.equal(retired.status, 410);
  assert.deepEqual(retired.body, { error: 'legacy_cli_ticket_write_retired', canonical_endpoint: '/api/admin/client/l08/tickets' });
  const afterRetired = await pool.query('SELECT status FROM client_tickets WHERE id = $1', [ticketId]);
  assert.equal(afterRetired.rows[0].status, 'open', 'a rota aposentada não tocou o estado');

  // A fila canônica respeita escopo de leitura por conta.
  const queue = await api(`/api/admin/client/l08/tickets?status=open`, { cookie: ti });
  assert.equal(queue.status, 200, JSON.stringify(queue.body));
  assert.ok(queue.body.tickets.some(item => item.id === ticketId), 'fila canônica contém o chamado da conta A');

  // Um chamado da conta B não aparece na fila da identidade escopada em A.
  const ticketBKey = `f03-ticket-B-${randomUUID()}`;
  const createdB = await api('/api/client/tickets', {
    method: 'POST',
    cookie: clientB,
    body: { accountId: accountB, category: 'Outro assunto', title: 'Chamado sintético F03 — fora de escopo', details: 'Deve ficar invisível para a identidade ti.' },
    headers: { 'Idempotency-Key': ticketBKey },
  });
  assert.equal(createdB.status, 201);
  const ticketBId = createdB.body.ticketId;
  const queueAfterB = await api('/api/admin/client/l08/tickets', { cookie: ti });
  assert.ok(!queueAfterB.body.tickets.some(item => item.id === ticketBId), 'chamado da conta B fica fora da fila escopada em A');
  const attendOutOfScope = await api('/api/admin/client/l08/tickets', {
    method: 'PATCH', cookie: ti,
    body: { id: ticketBId, action: 'assumir', message: 'Tentativa fora do escopo concedido.' },
    headers: { 'Idempotency-Key': `f03-ticket-B-attend-${randomUUID()}` },
  });
  assert.equal(attendOutOfScope.status, 403);
  assert.deepEqual(attendOutOfScope.body, { error: 'permission_scope_denied' });

  // Assume com retry concorrente: uma única transição material.
  const attendKey = `f03-ticket-attend-${randomUUID()}`;
  const attendBody = { id: ticketId, action: 'assumir', message: 'Sim, cenário de teste. Estamos em atendimento agora.' };
  const wrongOrigin = await api('/api/admin/client/l08/tickets', {
    method: 'PATCH', cookie: ti, body: attendBody, headers: { 'Idempotency-Key': attendKey }, sendOrigin: false,
  });
  assert.equal(wrongOrigin.status, 403);
  const attends = await Promise.all(Array.from({ length: 4 }, () => api('/api/admin/client/l08/tickets', {
    method: 'PATCH', cookie: ti, body: attendBody, headers: { 'Idempotency-Key': attendKey },
  })));
  assert.ok(attends.every(result => result.status === 200), JSON.stringify(attends));
  assert.equal(attends.filter(result => result.body.replayed === false).length, 1, 'só uma assunção material é permitida');
  const attendConflict = await api('/api/admin/client/l08/tickets', {
    method: 'PATCH', cookie: ti,
    body: { ...attendBody, message: 'Mensagem divergente na mesma chave.' }, headers: { 'Idempotency-Key': attendKey },
  });
  assert.equal(attendConflict.status, 409);
  assert.equal(attendConflict.body.error, 'idempotency_conflict');

  const afterAttend = await pool.query(`SELECT t.status, t.admin_response,
    (SELECT count(*)::int FROM client_ticket_status_audit h WHERE h.ticket_id = t.id) AS history_count,
    (SELECT count(*)::int FROM client_ticket_messages m WHERE m.ticket_id = t.id) AS message_count,
    (SELECT count(*)::int FROM auth_access_audit a WHERE a.target = t.id::text AND a.action = 'ticket_attend') AS audit_count
    FROM client_tickets t WHERE t.id = $1`, [ticketId]);
  assert.equal(afterAttend.rows[0].status, 'in_progress');
  assert.equal(afterAttend.rows[0].admin_response, 'Sim, cenário de teste. Estamos em atendimento agora.');
  assert.equal(afterAttend.rows[0].history_count, 2, 'abertura + assumir');
  assert.equal(afterAttend.rows[0].message_count, 1, 'uma mensagem de atendimento na trilha');
  assert.equal(afterAttend.rows[0].audit_count, 1);

  // Resolver exige falha fechada também: rollback completo e retry idempotente.
  await pool.query(`CREATE OR REPLACE FUNCTION qa_f03_ticket_audit_failure() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action = 'ticket_resolve' THEN RAISE EXCEPTION 'f03 ticket audit failure'; END IF;
      RETURN NEW;
    END $$`);
  await pool.query('CREATE TRIGGER qa_f03_ticket_audit_failure BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_f03_ticket_audit_failure()');
  const resolveKey = `f03-ticket-resolve-${randomUUID()}`;
  const resolveBody = { id: ticketId, action: 'resolver', message: 'Ronda conferida; resposta registrada no cenário de teste.' };
  try {
    const failedResolve = await api('/api/admin/client/l08/tickets', {
      method: 'PATCH', cookie: ti, body: resolveBody, headers: { 'Idempotency-Key': resolveKey },
    });
    assert.equal(failedResolve.status, 503, JSON.stringify(failedResolve.body));
    assert.deepEqual(failedResolve.body, { error: 'audit_unavailable' });
  } finally {
    await pool.query('DROP TRIGGER qa_f03_ticket_audit_failure ON auth_access_audit');
    await pool.query('DROP FUNCTION qa_f03_ticket_audit_failure()');
  }
  const rollbackResolve = await pool.query(`SELECT t.status, t.resolved_at,
    (SELECT count(*)::int FROM client_ticket_messages m WHERE m.ticket_id = t.id) AS message_count
    FROM client_tickets t WHERE t.id = $1`, [ticketId]);
  assert.equal(rollbackResolve.rows[0].status, 'in_progress', 'falha de auditoria desfaz a resolução por completo');
  assert.equal(rollbackResolve.rows[0].resolved_at, null);
  assert.equal(rollbackResolve.rows[0].message_count, 1);

  const resolved = await api('/api/admin/client/l08/tickets', {
    method: 'PATCH', cookie: ti, body: resolveBody, headers: { 'Idempotency-Key': resolveKey },
  });
  assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
  assert.deepEqual(resolved.body, { ok: true, ticketId, previousStatus: 'in_progress', status: 'resolved', replayed: false });
  const resolvedReplay = await api('/api/admin/client/l08/tickets', {
    method: 'PATCH', cookie: ti, body: resolveBody, headers: { 'Idempotency-Key': resolveKey },
  });
  assert.equal(resolvedReplay.status, 200);
  assert.equal(resolvedReplay.body.replayed, true);

  // Nenhum staff fecha o chamado: o aceite é do cliente autenticado e escopado.
  const staffAccepts = await api(`/api/client/tickets/${ticketId}/accept`, {
    method: 'PATCH', cookie: ti, body: {}, headers: { 'Idempotency-Key': `f03-accept-staff-${randomUUID()}` },
  });
  assert.equal(staffAccepts.status, 401, 'sessão staff nunca aceita como cliente');
  const crossAccept = await api(`/api/client/tickets/${ticketId}/accept`, {
    method: 'PATCH', cookie: clientB, body: {}, headers: { 'Idempotency-Key': `f03-accept-cross-${randomUUID()}` },
  });
  assert.equal(crossAccept.status, 403, 'cliente B não aceita o chamado da conta A');
  const acceptWrongOrigin = await api(`/api/client/tickets/${ticketId}/accept`, {
    method: 'PATCH', cookie: clientA, body: {}, headers: { 'Idempotency-Key': `f03-accept-origin-${randomUUID()}` }, sendOrigin: false,
  });
  assert.equal(acceptWrongOrigin.status, 403);

  // Falha de auditoria no aceite também desfaz estado + trilha juntos.
  await pool.query(`CREATE OR REPLACE FUNCTION qa_f03_accept_audit_failure() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action = 'ticket_accept' THEN RAISE EXCEPTION 'f03 accept audit failure'; END IF;
      RETURN NEW;
    END $$`);
  await pool.query('CREATE TRIGGER qa_f03_accept_audit_failure BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_f03_accept_audit_failure()');
  const acceptKey = `f03-accept-${randomUUID()}`;
  const acceptBody = { message: 'Aceite F03 de demonstração: atendimento validado pelo cliente sintético.' };
  try {
    const failedAccept = await api(`/api/client/tickets/${ticketId}/accept`, {
      method: 'PATCH', cookie: clientA, body: acceptBody, headers: { 'Idempotency-Key': acceptKey },
    });
    assert.equal(failedAccept.status, 503, JSON.stringify(failedAccept.body));
    assert.deepEqual(failedAccept.body, { error: 'audit_unavailable' });
  } finally {
    await pool.query('DROP TRIGGER qa_f03_accept_audit_failure ON auth_access_audit');
    await pool.query('DROP FUNCTION qa_f03_accept_audit_failure()');
  }
  const rollbackAccept = await pool.query(`SELECT t.status, t.closed_at,
    (SELECT count(*)::int FROM client_ticket_messages m WHERE m.ticket_id = t.id) AS message_count
    FROM client_tickets t WHERE t.id = $1`, [ticketId]);
  assert.equal(rollbackAccept.rows[0].status, 'resolved', 'falha de auditoria desfaz o aceite por completo');
  assert.equal(rollbackAccept.rows[0].closed_at, null);
  assert.equal(rollbackAccept.rows[0].message_count, 2, 'atendimento + resolução apenas');

  const accepted = await api(`/api/client/tickets/${ticketId}/accept`, {
    method: 'PATCH', cookie: clientA, body: acceptBody, headers: { 'Idempotency-Key': acceptKey },
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.deepEqual(accepted.body, { ok: true, ticketId, previousStatus: 'resolved', status: 'closed', replayed: false });
  const acceptReplay = await api(`/api/client/tickets/${ticketId}/accept`, {
    method: 'PATCH', cookie: clientA, body: acceptBody, headers: { 'Idempotency-Key': acceptKey },
  });
  assert.equal(acceptReplay.status, 200);
  assert.equal(acceptReplay.body.replayed, true);
  const closedAgain = await api(`/api/client/tickets/${ticketId}/accept`, {
    method: 'PATCH', cookie: clientA, body: {}, headers: { 'Idempotency-Key': `f03-accept-again-${randomUUID()}` },
  });
  assert.equal(closedAgain.status, 409);
  assert.deepEqual(closedAgain.body, { error: 'ticket_accept_requires_resolved', status: 'closed' });

  // Trilha final: 4 transições auditadas internas e 3 mensagens canônicas.
  const trail = await pool.query(`SELECT previous_status, next_status, changed_by FROM client_ticket_status_audit WHERE ticket_id = $1 ORDER BY id`, [ticketId]);
  assert.deepEqual(trail.rows.map(row => [row.previous_status, row.next_status, row.changed_by]), [
    [null, 'open', 'client'],
    ['open', 'in_progress', 'ti'],
    ['in_progress', 'resolved', 'ti'],
    ['resolved', 'closed', 'client'],
  ]);
  const messages = await pool.query(`SELECT message_kind, author_kind FROM client_ticket_messages WHERE ticket_id = $1 ORDER BY created_at, id`, [ticketId]);
  assert.deepEqual(messages.rows.map(row => [row.message_kind, row.author_kind]), [
    ['attendance', 'staff'],
    ['resolution', 'staff'],
    ['acceptance', 'client'],
  ]);
  const accessEvents = await pool.query(
    `SELECT action, count(*)::int AS total FROM auth_access_audit WHERE target = $1 AND action IN ('ticket_attend','ticket_resolve','ticket_accept') GROUP BY action ORDER BY action`,
    [ticketId],
  );
  assert.deepEqual(accessEvents.rows.map(row => [row.action, row.total]), [
    ['ticket_accept', 1],
    ['ticket_attend', 1],
    ['ticket_resolve', 1],
  ]);

  // O portal do cliente mostra a trilha completa e o encerramento.
  const portalList = await api(`/api/client/tickets?account=${accountA}`, { cookie: clientA });
  const portalTicket = portalList.body.tickets.find(item => item.id === ticketId);
  assert.equal(portalTicket.status, 'closed');
  assert.deepEqual(portalTicket.messages.map(item => item.kind), ['attendance', 'resolution', 'acceptance']);

  // Chromium percorre o caminho visível: cliente abre, staff assume/resolve na
  // fila canônica e o cliente aceita no portal — sem erros silenciosos.
  // O Chromium empacotado usa --single-process no ambiente de gate: cada papel
  // recebe seu próprio processo para manter sessões isoladas de verdade.
  const failures = [];
  const uiTitle = `Chamado interface F03 ${randomUUID().slice(0, 8)}`;

  const clientBrowser = await launchBrowser();
  try {
    const clientContext = await clientBrowser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    const clientPage = await clientContext.newPage();
    trackFailures(clientPage, failures);
    await addCookie(clientContext, clientA);
    await clientPage.goto(`${baseUrl}/cliente/app/chamados`, { waitUntil: 'networkidle' });
    await clientPage.getByRole('heading', { name: 'Abrir novo chamado' }).waitFor();
    await clientPage.locator('#ticket-title').fill(uiTitle);
    await clientPage.locator('#ticket-details').fill('Chamado sintético aberto no Chromium para exercitar a fila de atendimento e o aceite na interface.');
    const createdUi = clientPage.waitForResponse(response => new URL(response.url()).pathname === '/api/client/tickets' && response.status() === 201);
    await clientPage.getByRole('button', { name: /Registrar chamado/ }).click();
    await createdUi;
    await clientPage.getByText(uiTitle).waitFor();
    assert.equal(await clientPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'portal mobile não cria rolagem horizontal');
    await clientContext.close();
  } finally {
    await clientBrowser.close();
  }

  const staffBrowser = await launchBrowser();
  try {
    const staffContext = await staffBrowser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
    const staffPage = await staffContext.newPage();
    trackFailures(staffPage, failures);
    await addCookie(staffContext, ti);
    await staffPage.goto(`${baseUrl}/admin/clientes`, { waitUntil: 'networkidle' });
    await staffPage.getByRole('heading', { name: '5 · Chamados dos clientes' }).waitFor();
    const card = staffPage.locator('li').filter({ hasText: uiTitle });
    await card.waitFor();
    const attendanceBox = card.getByRole('textbox', { name: /Devolutiva do chamado/ });
    await attendanceBox.fill('Atendimento iniciado na interface Chromium do gate F03.');
    const assumeUi = staffPage.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/client/l08/tickets' && response.request().method() === 'PATCH' && response.status() === 200);
    await card.getByRole('button', { name: 'Assumir chamado' }).click();
    await assumeUi;
    await staffPage.getByText(/assumido e devolutiva registrada/).waitFor();
    const resolvedCard = staffPage.locator('li').filter({ hasText: uiTitle });
    await resolvedCard.getByRole('button', { name: 'Resolver chamado' }).waitFor();
    await resolvedCard.getByRole('textbox', { name: /Devolutiva do chamado/ }).fill('Resolução registrada na interface Chromium do gate F03.');
    const resolveUi = staffPage.waitForResponse(response => new URL(response.url()).pathname === '/api/admin/client/l08/tickets' && response.request().method() === 'PATCH' && response.status() === 200);
    await resolvedCard.getByRole('button', { name: 'Resolver chamado' }).click();
    await resolveUi;
    await staffPage.getByText('Aguardando o aceite do cliente no portal.').waitFor();
    assert.equal(await staffPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'fila staff não cria rolagem horizontal');
    await staffContext.close();
  } finally {
    await staffBrowser.close();
  }

  const acceptBrowser = await launchBrowser();
  try {
    const clientContext = await acceptBrowser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    const clientPage = await clientContext.newPage();
    trackFailures(clientPage, failures);
    await addCookie(clientContext, clientA);
    await clientPage.goto(`${baseUrl}/cliente/app/chamados`, { waitUntil: 'networkidle' });
    const resolvedItem = clientPage.locator('li').filter({ hasText: uiTitle });
    await resolvedItem.waitFor();
    await resolvedItem.getByText('Resolução da equipe').waitFor();
    const acceptUi = clientPage.waitForResponse(response => new URL(response.url()).pathname.endsWith('/accept') && response.request().method() === 'PATCH' && response.status() === 200);
    await resolvedItem.getByRole('button', { name: 'Aceitar atendimento e encerrar' }).click();
    await acceptUi;
    await clientPage.getByText(/Aceite registrado/).waitFor();
    const closedItem = clientPage.locator('li').filter({ hasText: uiTitle });
    await closedItem.getByText('Seu aceite').waitFor();
    await closedItem.getByText('Encerrado').waitFor();
    assert.equal(await closedItem.getByRole('button', { name: 'Aceitar atendimento e encerrar' }).count(), 0, 'botão de aceite some após o encerramento');
    assert.equal(await clientPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'aceite mobile não cria rolagem horizontal');
    await clientContext.close();
  } finally {
    await acceptBrowser.close();
  }

  const uiTicket = await pool.query(`SELECT t.status, t.closed_at,
    (SELECT count(*)::int FROM client_ticket_messages m WHERE m.ticket_id = t.id) AS message_count
    FROM client_tickets t WHERE t.title = $1`, [uiTitle]);
  assert.equal(uiTicket.rows[0].status, 'closed');
  assert.ok(uiTicket.rows[0].closed_at, 'aceite na interface registra closed_at');
  assert.equal(uiTicket.rows[0].message_count, 3, 'trilha completa também na jornada da interface');
  assert.deepEqual(failures, [], `UI F03 chamados sem console ou HTTP 5xx: ${failures.join(', ')}`);
});

if (!RUN) {
  test('F03 client ticket acceptance gate opt-in guard', { skip: 'execute via npm run test:f03-client-ticket-acceptance:pg' }, () => {});
}
