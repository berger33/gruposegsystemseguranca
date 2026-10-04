// F03 — cliente -> chamado -> atendimento -> aceite.
// Todo estado de negócio nasce por HTTP real contra o servidor do repositório.
// SQL só aparece em asserções e na falha temporária de auditoria que prova o
// rollback transacional.
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

async function serviceStep(cookie, ticketId, payload, key) {
  return api(`/api/admin/tickets/${ticketId}`, { method: 'PATCH', cookie, body: payload, headers: { 'Idempotency-Key': key } });
}

before(async () => {
  if (!RUN) return;
  credentials = JSON.parse(await readFile(process.env.F03_CREDENTIALS_FILE, 'utf8'));
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
});

after(async () => { await pool?.end().catch(() => {}); });

test('F03: cliente abre chamado, equipe atende e só o aceite do cliente encerra', {
  skip: !RUN,
  timeout: 240_000,
}, async () => {
  const clientA = await login('cliente_a', '/api/auth/login');
  const clientB = await login('cliente_b', '/api/auth/login');
  const ti = await login('ti', '/api/admin/session');
  const rh = await login('rh', '/api/admin/session');

  const accountsA = await api('/api/client/accounts', { cookie: clientA });
  const accountsB = await api('/api/client/accounts', { cookie: clientB });
  assert.equal(accountsA.status, 200, JSON.stringify(accountsA.body));
  assert.equal(accountsB.status, 200);
  const accountA = accountsA.body.accounts[0].id;
  const accountB = accountsB.body.accounts[0].id;
  assert.notEqual(accountA, accountB, 'a massa sintética precisa manter dois cadastros distintos');

  // ---------------------------------------------------------------- abertura
  const openBody = {
    accountId: accountA,
    category: 'Outro assunto',
    title: `Ronda noturna sintética F03 ${randomUUID().slice(0, 8)}`,
    details: 'Chamado inteiramente fictício para validar atendimento e aceite do cliente.',
  };
  const openKey = `f03-ticket-open-${randomUUID()}`;

  const anonymousOpen = await api('/api/client/tickets', { method: 'POST', body: openBody, headers: { 'Idempotency-Key': openKey } });
  assert.equal(anonymousOpen.status, 401, 'anônimo não abre chamado');
  const crossOriginOpen = await api('/api/client/tickets', { method: 'POST', cookie: clientA, body: openBody, headers: { 'Idempotency-Key': openKey }, sendOrigin: false });
  assert.equal(crossOriginOpen.status, 403, 'origem estranha não abre chamado');
  const foreignOpen = await api('/api/client/tickets', { method: 'POST', cookie: clientB, body: openBody, headers: { 'Idempotency-Key': `f03-foreign-${randomUUID()}` } });
  assert.equal(foreignOpen.status, 403, 'cliente B não abre chamado no cadastro de A');

  const opens = await Promise.all(Array.from({ length: 5 }, () => api('/api/client/tickets', {
    method: 'POST', cookie: clientA, body: openBody, headers: { 'Idempotency-Key': openKey },
  })));
  assert.ok(opens.every(result => [200, 201].includes(result.status)), JSON.stringify(opens.map(r => [r.status, r.body])));
  const ticketId = opens[0].body.ticketId;
  assert.ok(opens.every(result => result.body.ticketId === ticketId), 'a mesma chave converge para um único chamado');
  assert.equal(opens.filter(result => result.status === 201).length, 1, 'só uma criação material é permitida');
  const materialOpens = await pool.query('SELECT count(*)::int AS total FROM client_tickets WHERE client_account_id=$1 AND title=$2', [accountA, openBody.title]);
  assert.equal(materialOpens.rows[0].total, 1, 'cinco envios concorrentes criaram um único chamado');

  // --------------------------------------------------- autorização do staff
  const clientOnAdmin = await api(`/api/admin/tickets/${ticketId}`, {
    method: 'PATCH', cookie: clientA,
    body: { status: 'in_progress', adminResponse: 'Cliente não comanda o atendimento.' },
    headers: { 'Idempotency-Key': `f03-client-as-staff-${randomUUID()}` },
  });
  assert.ok([401, 403].includes(clientOnAdmin.status), 'sessão de cliente nunca vira sessão de atendimento');
  const rhOnTickets = await api(`/api/admin/tickets/${ticketId}`, {
    method: 'PATCH', cookie: rh,
    body: { status: 'in_progress', adminResponse: 'RH não atende chamados de cliente.' },
    headers: { 'Idempotency-Key': `f03-rh-as-staff-${randomUUID()}` },
  });
  assert.equal(rhOnTickets.status, 403, 'papel sem escopo de clientes é recusado');
  const noKey = await api(`/api/admin/tickets/${ticketId}`, {
    method: 'PATCH', cookie: ti, body: { status: 'in_progress', adminResponse: 'Sem chave de idempotência.' },
  });
  assert.equal(noKey.status, 400);
  assert.equal(noKey.body.error, 'idempotency_key_required_or_invalid');
  const shortNote = await serviceStep(ti, ticketId, { status: 'in_progress', adminResponse: 'ok' }, `f03-short-${randomUUID()}`);
  assert.equal(shortNote.status, 400);
  assert.equal(shortNote.body.error, 'ticket_service_note_required');
  const skipAhead = await serviceStep(ti, ticketId, { status: 'resolved', adminResponse: 'Tentativa de resolver sem atender.' }, `f03-skip-${randomUUID()}`);
  assert.equal(skipAhead.status, 409);
  assert.equal(skipAhead.body.error, 'ticket_transition_not_allowed');
  const untouched = await pool.query('SELECT status, admin_response FROM client_tickets WHERE id=$1', [ticketId]);
  assert.deepEqual(untouched.rows[0], { status: 'open', admin_response: null }, 'nenhuma recusa pôde alterar o chamado');

  // ------------------------------------------------------------- atendimento
  const startKey = `f03-service-start-${randomUUID()}`;
  const startBody = { status: 'in_progress', adminResponse: 'Equipe assumiu o chamado e está em campo.' };
  const starts = await Promise.all(Array.from({ length: 4 }, () => serviceStep(ti, ticketId, startBody, startKey)));
  assert.ok(starts.every(result => result.status === 200), JSON.stringify(starts.map(r => [r.status, r.body])));
  assert.equal(starts.filter(result => result.body.replayed === true).length, 3, 'só um comando material entre quatro tentativas');
  const startConflict = await serviceStep(ti, ticketId, { ...startBody, adminResponse: 'Mensagem divergente na mesma chave.' }, startKey);
  assert.equal(startConflict.status, 409);
  assert.equal(startConflict.body.error, 'idempotency_conflict');

  const waiting = await serviceStep(ti, ticketId, {
    status: 'waiting_client', adminResponse: 'Precisamos do acesso ao pátio para concluir a ronda.',
  }, `f03-service-waiting-${randomUUID()}`);
  assert.equal(waiting.status, 200, JSON.stringify(waiting.body));
  const paused = await pool.query('SELECT status, sla_paused_at IS NOT NULL AS paused, sla_pause_reason FROM client_tickets WHERE id=$1', [ticketId]);
  assert.deepEqual(paused.rows[0], { status: 'waiting_client', paused: true, sla_pause_reason: 'waiting_client' });
  const backToWork = await serviceStep(ti, ticketId, { status: 'in_progress', adminResponse: 'Acesso liberado pelo cliente; retomamos o atendimento.' }, `f03-service-resume-${randomUUID()}`);
  assert.equal(backToWork.status, 200, JSON.stringify(backToWork.body));
  const resumed = await pool.query(`SELECT t.sla_paused_at IS NULL AS running,
      (SELECT count(*)::int FROM client_ticket_sla_pauses WHERE ticket_id=t.id AND resumed_at IS NOT NULL) AS closed_pauses
    FROM client_tickets t WHERE t.id=$1`, [ticketId]);
  assert.deepEqual(resumed.rows[0], { running: true, closed_pauses: 1 }, 'a pausa de SLA foi aberta e encerrada pelo fluxo real');

  // A falha de auditoria precisa desfazer transição, SLA e trilha juntos.
  assert.match(ticketId, /^[0-9a-f-]{36}$/i);
  await pool.query(`CREATE OR REPLACE FUNCTION qa_f03_ticket_audit_failure() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='ticket_status' AND NEW.target='${ticketId}' THEN RAISE EXCEPTION 'f03 ticket audit failure'; END IF;
      RETURN NEW;
    END $$`);
  await pool.query('CREATE TRIGGER qa_f03_ticket_audit_failure BEFORE INSERT ON auth_access_audit FOR EACH ROW EXECUTE FUNCTION qa_f03_ticket_audit_failure()');
  const resolveKey = `f03-service-resolve-${randomUUID()}`;
  const resolveBody = { status: 'resolved', adminResponse: 'Ronda concluída e ocorrência sintética normalizada.' };
  try {
    const failedResolve = await serviceStep(ti, ticketId, resolveBody, resolveKey);
    assert.equal(failedResolve.status, 503, JSON.stringify(failedResolve.body));
  } finally {
    await pool.query('DROP TRIGGER qa_f03_ticket_audit_failure ON auth_access_audit');
    await pool.query('DROP FUNCTION qa_f03_ticket_audit_failure()');
  }
  const afterRollback = await pool.query(`SELECT t.status,
      (SELECT count(*)::int FROM client_ticket_status_audit WHERE ticket_id=t.id AND next_status='resolved') AS resolved_rows
    FROM client_tickets t WHERE t.id=$1`, [ticketId]);
  assert.deepEqual(afterRollback.rows[0], { status: 'in_progress', resolved_rows: 0 }, 'falha de auditoria desfez a transição inteira');

  const resolved = await serviceStep(ti, ticketId, resolveBody, resolveKey);
  assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
  assert.equal(resolved.body.status, 'resolved');
  assert.equal(resolved.body.replayed, false);
  const resolveReplay = await serviceStep(ti, ticketId, resolveBody, resolveKey);
  assert.equal(resolveReplay.status, 200);
  assert.equal(resolveReplay.body.replayed, true);

  // ------------------------------------------- encerrar é ato exclusivo do cliente
  const staffClose = await serviceStep(ti, ticketId, { status: 'closed', adminResponse: 'Encerrando por conta própria, sem o cliente.' }, `f03-staff-close-${randomUUID()}`);
  assert.equal(staffClose.status, 409);
  assert.equal(staffClose.body.error, 'ticket_close_requires_client_acceptance');
  const stillResolved = await pool.query('SELECT status, closed_at FROM client_tickets WHERE id=$1', [ticketId]);
  assert.equal(stillResolved.rows[0].status, 'resolved');
  assert.equal(stillResolved.rows[0].closed_at, null);

  // ------------------------------------------------------- relatório de aceite
  const reportKey = `f03-report-${randomUUID()}`;
  const reportBody = {
    accountId: accountA,
    ticketId,
    reportType: 'acceptance',
    title: 'Aceite do atendimento sintético F03',
    summary: 'Relatório sintético de aceite do atendimento, sem qualquer dado real de cliente.',
  };
  const wrongType = await api('/api/admin/client-reports', {
    method: 'POST', cookie: ti, body: { ...reportBody, reportType: 'execution' }, headers: { 'Idempotency-Key': `f03-wrong-type-${randomUUID()}` },
  });
  assert.equal(wrongType.status, 400);
  assert.equal(wrongType.body.error, 'ticket_requires_acceptance_report');
  const reports = await Promise.all(Array.from({ length: 3 }, () => api('/api/admin/client-reports', {
    method: 'POST', cookie: ti, body: reportBody, headers: { 'Idempotency-Key': reportKey },
  })));
  assert.ok(reports.every(result => [200, 201].includes(result.status)), JSON.stringify(reports.map(r => [r.status, r.body])));
  const reportId = reports[0].body.report.id;
  assert.ok(reports.every(result => result.body.report.id === reportId));
  const duplicatePending = await api('/api/admin/client-reports', {
    method: 'POST', cookie: ti, body: reportBody, headers: { 'Idempotency-Key': `f03-report-dup-${randomUUID()}` },
  });
  assert.equal(duplicatePending.status, 409);
  assert.equal(duplicatePending.body.error, 'ticket_acceptance_already_pending');

  // O cliente só pode aceitar o que foi publicado; rascunho não é visível.
  const draftList = await api(`/api/client/reports?account=${accountA}`, { cookie: clientA });
  assert.equal(draftList.status, 200);
  assert.equal(draftList.body.reports.some(item => item.id === reportId), false, 'rascunho não aparece no portal');
  const earlyAck = await api(`/api/client/reports/${reportId}/acknowledge`, {
    method: 'PATCH', cookie: clientA, body: { note: 'Tentando aceitar antes da publicação.' },
  });
  assert.equal(earlyAck.status, 403, JSON.stringify(earlyAck.body));
  assert.equal(earlyAck.body.error, 'report_not_published');

  for (const [status, reviewNotes] of [['in_review', 'Revisão interna do relatório sintético concluída.'], ['approved', 'Aprovado para publicação ao cliente.'], ['sent', 'Publicado no portal do cliente.']]) {
    const moved = await api(`/api/admin/client-reports/${reportId}`, {
      method: 'PATCH', cookie: ti, body: { status, reviewNotes },
    });
    assert.equal(moved.status, 200, `${status}: ${JSON.stringify(moved.body)}`);
  }
  const staffAck = await api(`/api/admin/client-reports/${reportId}`, {
    method: 'PATCH', cookie: ti, body: { status: 'acknowledged', reviewNotes: 'A equipe não pode dar ciência pelo cliente.' },
  });
  assert.equal(staffAck.status, 400);
  assert.equal(staffAck.body.error, 'client_acknowledgement_required');

  // ------------------------------------------------------------------ aceite
  const foreignAck = await api(`/api/client/reports/${reportId}/acknowledge`, {
    method: 'PATCH', cookie: clientB, body: { note: 'Cliente B não aceita relatório do cadastro A.' },
  });
  assert.equal(foreignAck.status, 403, 'isolamento A/B também vale para o aceite');
  const crossOriginAck = await api(`/api/client/reports/${reportId}/acknowledge`, {
    method: 'PATCH', cookie: clientA, body: { note: 'Origem estranha.' }, sendOrigin: false,
  });
  assert.equal(crossOriginAck.status, 403);
  const beforeAck = await pool.query('SELECT status FROM client_tickets WHERE id=$1', [ticketId]);
  assert.equal(beforeAck.rows[0].status, 'resolved', 'nenhuma recusa encerrou o chamado');

  const accepted = await api(`/api/client/reports/${reportId}/acknowledge`, {
    method: 'PATCH', cookie: clientA, body: { note: 'Serviço conferido e aceito pelo cliente sintético.' },
  });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.status, 'acknowledged');
  assert.equal(accepted.body.replayed, false);
  assert.deepEqual(accepted.body.ticket, { ticketId, previousStatus: 'resolved', status: 'closed' }, 'o aceite encerra o chamado na mesma resposta');

  // PostgreSQL deduz um único tipo por placeholder: os parâmetros entram como
  // texto (comparação com auth_access_audit.target) e são convertidos onde a
  // coluna é UUID, em vez de reusar o mesmo $n com dois tipos.
  const finalState = await pool.query(`SELECT t.status, t.closed_at IS NOT NULL AS closed,
      (SELECT count(*)::int FROM client_ticket_status_audit WHERE ticket_id=t.id AND next_status='closed' AND changed_by='client') AS client_closures,
      (SELECT count(*)::int FROM client_ticket_status_audit WHERE ticket_id=t.id) AS transitions,
      (SELECT count(*)::int FROM auth_access_audit WHERE action='report_acknowledge' AND target=$2) AS ack_audit,
      (SELECT count(*)::int FROM auth_access_audit WHERE action='ticket_status' AND target=$1 AND actor_kind='client') AS client_ticket_audit,
      (SELECT r.ticket_id FROM client_reports r WHERE r.id=$2::uuid) AS linked_ticket
    FROM client_tickets t WHERE t.id=$1::uuid`, [ticketId, reportId]);
  assert.equal(finalState.rows[0].status, 'closed');
  assert.equal(finalState.rows[0].closed, true);
  assert.equal(finalState.rows[0].client_closures, 1, 'o encerramento é atribuído ao cliente na trilha');
  assert.equal(finalState.rows[0].transitions, 6, 'abertura, in_progress, waiting_client, in_progress, resolved e closed');
  assert.equal(finalState.rows[0].ack_audit, 1);
  assert.equal(finalState.rows[0].client_ticket_audit, 1);
  assert.equal(finalState.rows[0].linked_ticket, ticketId);

  const ackReplay = await api(`/api/client/reports/${reportId}/acknowledge`, {
    method: 'PATCH', cookie: clientA, body: { note: 'Segunda tentativa de aceite.' },
  });
  assert.equal(ackReplay.status, 200, JSON.stringify(ackReplay.body));
  assert.equal(ackReplay.body.replayed, true, 'o aceite não se repete nem encerra o chamado duas vezes');
  const afterReplay = await pool.query('SELECT count(*)::int AS closures FROM client_ticket_status_audit WHERE ticket_id=$1 AND next_status=$2', [ticketId, 'closed']);
  assert.equal(afterReplay.rows[0].closures, 1);

  // O cliente continua podendo reabrir o que ele mesmo encerrou.
  const reopen = await api(`/api/client/tickets/${ticketId}/reopen`, {
    method: 'PATCH', cookie: clientA, body: { reason: 'A ocorrência sintética voltou a acontecer nesta madrugada.' },
    headers: { 'Idempotency-Key': `f03-reopen-${randomUUID()}` },
  });
  assert.equal(reopen.status, 200, JSON.stringify(reopen.body));
  assert.equal(reopen.body.status, 'open');
  assert.equal(reopen.body.reopened, true);
  const reopened = await pool.query('SELECT status, reopen_count, closed_at FROM client_tickets WHERE id=$1', [ticketId]);
  assert.equal(reopened.rows[0].status, 'open');
  assert.equal(Number(reopened.rows[0].reopen_count), 1);
  assert.equal(reopened.rows[0].closed_at, null);

  // ----------------------------------------------------------------- Chromium
  // Um navegador por papel: o Chromium empacotado roda com --single-process no
  // gate e contextos simultâneos não mantêm sessões realmente isoladas.
  const failures = [];
  const uiTitle = `Chamado interface F03 ${randomUUID().slice(0, 8)}`;
  let uiTicketId = null;

  const clientBrowser = await launchBrowser();
  try {
    const context = await clientBrowser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    const page = await context.newPage();
    trackFailures(page, failures);
    await addCookie(context, clientA);
    await page.goto(`${baseUrl}/cliente/app/chamados`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Abrir novo chamado' }).waitFor();
    await page.locator('#ticket-title').fill(uiTitle);
    await page.locator('#ticket-details').fill('Chamado sintético aberto pelo Chromium para validar o atendimento e o aceite.');
    const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/client/tickets' && response.request().method() === 'POST' && response.status() === 201);
    await page.getByRole('button', { name: 'Registrar chamado' }).click();
    const createdResponse = await created;
    uiTicketId = (await createdResponse.json()).ticketId;
    await page.getByText(uiTitle).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'portal mobile não cria rolagem horizontal');
    await context.close();
  } finally {
    await clientBrowser.close();
  }
  assert.ok(uiTicketId, 'o chamado da interface precisa existir para o atendimento');

  const staffBrowser = await launchBrowser();
  try {
    const context = await staffBrowser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
    const page = await context.newPage();
    trackFailures(page, failures);
    await addCookie(context, ti);
    await page.goto(`${baseUrl}/admin/clientes`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: '5 · Chamados dos clientes' }).waitFor();
    const card = page.locator('li').filter({ hasText: uiTitle }).first();
    await card.waitFor();
    // A tela só oferece passos possíveis: encerrar nunca aparece para a equipe.
    const offered = await card.locator('select').first().locator('option').allInnerTexts();
    assert.deepEqual(offered, ['Em atendimento'], 'chamado aberto só pode avançar para atendimento');
    await card.getByRole('textbox', { name: /Resposta do chamado/ }).fill('Equipe assumiu o chamado pela interface Chromium.');
    const started = page.waitForResponse(response => new URL(response.url()).pathname === `/api/admin/tickets/${uiTicketId}` && response.request().method() === 'PATCH' && response.status() === 200);
    await card.getByRole('button', { name: 'Salvar' }).click();
    await started;
    await card.getByText('Em atendimento').first().waitFor();
    const nextOffered = await card.locator('select').first().locator('option').allInnerTexts();
    assert.deepEqual(nextOffered, ['Aguardando cliente', 'Resolvido']);
    await card.getByRole('textbox', { name: /Resposta do chamado/ }).fill('Atendimento concluído pela interface Chromium.');
    await card.locator('select').first().selectOption('resolved');
    const finished = page.waitForResponse(response => new URL(response.url()).pathname === `/api/admin/tickets/${uiTicketId}` && response.request().method() === 'PATCH' && response.status() === 200);
    await card.getByRole('button', { name: 'Salvar' }).click();
    await finished;
    await card.getByText(/relatório de/).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'painel de chamados não cria rolagem horizontal');
    await context.close();
  } finally {
    await staffBrowser.close();
  }

  // O relatório de aceite da jornada de interface é publicado por HTTP real.
  const uiReport = await api('/api/admin/client-reports', {
    method: 'POST', cookie: ti,
    body: {
      accountId: accountA, ticketId: uiTicketId, reportType: 'acceptance',
      title: `Aceite do ${uiTitle}`,
      summary: 'Relatório sintético de aceite para a jornada percorrida no Chromium.',
    },
    headers: { 'Idempotency-Key': `f03-ui-report-${randomUUID()}` },
  });
  assert.equal(uiReport.status, 201, JSON.stringify(uiReport.body));
  for (const status of ['in_review', 'approved', 'sent']) {
    const moved = await api(`/api/admin/client-reports/${uiReport.body.report.id}`, {
      method: 'PATCH', cookie: ti, body: { status, reviewNotes: 'Publicação do aceite da jornada de interface.' },
    });
    assert.equal(moved.status, 200, `${status}: ${JSON.stringify(moved.body)}`);
  }

  const acceptBrowser = await launchBrowser();
  try {
    const context = await acceptBrowser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
    const page = await context.newPage();
    trackFailures(page, failures);
    await addCookie(context, clientA);
    await page.goto(`${baseUrl}/cliente/app/relatorios`, { waitUntil: 'networkidle' });
    const reportCard = page.locator('li').filter({ hasText: `Aceite do ${uiTitle}` }).first();
    await reportCard.waitFor();
    await reportCard.getByText(/será encerrado quando você aceitar/).waitFor();
    await reportCard.getByRole('textbox').fill('Aceite registrado pelo cliente na interface Chromium.');
    const acknowledged = page.waitForResponse(response => new URL(response.url()).pathname === `/api/client/reports/${uiReport.body.report.id}/acknowledge` && response.status() === 200);
    await reportCard.getByRole('button', { name: 'Registrar aceite/ciência' }).click();
    await acknowledged;
    await page.getByText(/chamado vinculado foi encerrado/).waitFor();
    await page.goto(`${baseUrl}/cliente/app/chamados`, { waitUntil: 'networkidle' });
    const ticketCard = page.locator('li').filter({ hasText: uiTitle }).first();
    await ticketCard.waitFor();
    await ticketCard.getByText('Encerrado pelo seu aceite').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'aceite mobile não cria rolagem horizontal');
    await context.close();
  } finally {
    await acceptBrowser.close();
  }

  const uiFinal = await pool.query(`SELECT t.status,
      (SELECT count(*)::int FROM client_ticket_status_audit WHERE ticket_id=t.id AND next_status='closed' AND changed_by='client') AS client_closures
    FROM client_tickets t WHERE t.id=$1`, [uiTicketId]);
  assert.deepEqual(uiFinal.rows[0], { status: 'closed', client_closures: 1 }, 'a jornada de interface encerrou pelo aceite do cliente');

  // Isolamento A/B permanece efetivo depois de toda a jornada.
  const visibleB = await api(`/api/client/tickets?account=${accountA}`, { cookie: clientB });
  assert.ok([403, 404].includes(visibleB.status), 'cliente B nunca enxerga chamados do cadastro A');

  assert.deepEqual(failures, [], `UI F03 cliente/atendimento sem console ou HTTP 5xx: ${failures.join(', ')}`);
});

if (!RUN) {
  test('F03 client ticket/acceptance gate opt-in guard', { skip: 'execute via npm run test:f03-client-ticket-service-acceptance:pg' }, () => {});
}
