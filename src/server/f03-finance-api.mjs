import { createHash } from 'node:crypto';
import { hasPermission } from './rbac.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const keyOf = req => {
  const value = String(req.headers['idempotency-key'] || '').trim();
  return value.length >= 8 && value.length <= 200 ? value : null;
};
const protocol = () => {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `REL-F03-${date}-${Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0')}`;
};

export function createF03FinanceApi(ctx) {
  const db = () => ctx.getPool();
  async function staff(req, res) {
    const session = await ctx.readAdminSession(req);
    if (!session) { ctx.json(res, 401, { error: 'admin_session_required' }); return null; }
    if (!session.identityId) { ctx.json(res, 403, { error: 'individual_staff_required' }); return null; }
    return session;
  }
  async function parse(req, res) {
    try { return await ctx.readJson(req); }
    catch { ctx.json(res, 400, { error: 'invalid_request' }); return undefined; }
  }
  function writeGuard(req, res) {
    if (ctx.sameOrigin(req)) return true;
    ctx.json(res, 403, { error: 'same_origin_required' }); return false;
  }
  async function permission(identityId, name, accountId = null) {
    return hasPermission(db(), { identityId, permission: name, accountId });
  }
  function failure(res, error) {
    if (error?.code === '42P01' || error?.code === '42703') return ctx.json(res, 503, { error: 'migration_required' });
    console.error('F03 finance API failed.', error?.message);
    return ctx.json(res, 503, { error: 'finance_flow_unavailable' });
  }

  async function listReceivables(req, res, url) {
    if (req.method !== 'GET') return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
    const session = await staff(req, res); if (!session) return;
    const account = url.searchParams.get('account');
    if (account && !UUID.test(account)) return ctx.json(res, 400, { error: 'invalid_account_id' });
    try {
      const grants = await db().query(`SELECT scope_type,scope_id FROM auth_permissions WHERE identity_id=$1 AND permission='financeiro.receivables.read' AND revoked_at IS NULL`, [session.identityId]);
      if (!grants.rows.length) return ctx.json(res, 403, { error: 'permission_scope_denied' });
      const { rows } = await db().query(
        `SELECT r.id,r.protocol,r.client_account_id,r.contract_id,r.competence_date,r.due_date,
                r.amount_cents,r.amount_paid_cents,r.amount_remaining_cents,r.status,r.currency,r.description,
                a.display_name AS account_name
           FROM fin_accounts_receivable r JOIN client_accounts a ON a.id=r.client_account_id
          WHERE ($2::uuid IS NULL OR r.client_account_id=$2)
            AND EXISTS (SELECT 1 FROM auth_permissions p WHERE p.identity_id=$1
              AND p.permission='financeiro.receivables.read' AND p.revoked_at IS NULL
              AND (p.scope_type IN ('global','organization') OR (p.scope_type='account' AND p.scope_id=r.client_account_id)))
          ORDER BY r.competence_date DESC,r.created_at DESC LIMIT 200`,
        [session.identityId, account || null],
      );
      return ctx.json(res, 200, { receivables: rows, scope: 'permissões ativas de financeiro.receivables.read' }, { 'Cache-Control': 'private, no-store' });
    } catch (error) { return failure(res, error); }
  }

  async function settle(req, res, receivableId) {
    if (req.method !== 'POST') return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
    const session = await staff(req, res); if (!session || !writeGuard(req, res)) return;
    const body = await parse(req, res); if (body === undefined) return;
    const amount = Number(body?.amount_cents);
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    const requestKey = keyOf(req);
    if (!Number.isSafeInteger(amount) || amount <= 0) return ctx.json(res, 400, { error: 'invalid_amount_cents' });
    if (reason.length < 10 || reason.length > 1000) return ctx.json(res, 400, { error: 'reason_10_1000_required' });
    if (!requestKey) return ctx.json(res, 400, { error: 'idempotency_key_required_or_invalid' });
    let target;
    try { target = (await db().query('SELECT id,client_account_id FROM fin_accounts_receivable WHERE id=$1', [receivableId])).rows[0]; }
    catch (error) { return failure(res, error); }
    if (!target) return ctx.json(res, 404, { error: 'receivable_not_found' });
    if (!(await permission(session.identityId, 'financeiro.receivables.write', target.client_account_id))) return ctx.json(res, 403, { error: 'permission_scope_denied' });
    const fingerprint = sha({ receivableId, amount, reason });
    const client = await db().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`f03-settlement:${receivableId}:${requestKey}`]);
      const replay = await client.query('SELECT id,request_fingerprint FROM fin_payments WHERE receivable_id=$1 AND idempotency_key=$2 FOR UPDATE', [receivableId, requestKey]);
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint) { await client.query('ROLLBACK'); return ctx.json(res, 409, { error: 'idempotency_conflict' }); }
        const current = (await client.query('SELECT status,amount_paid_cents,amount_remaining_cents FROM fin_accounts_receivable WHERE id=$1', [receivableId])).rows[0];
        await client.query('COMMIT');
        return ctx.json(res, 200, { paymentId: replay.rows[0].id, receivable: current, replayed: true });
      }
      const locked = (await client.query('SELECT * FROM fin_accounts_receivable WHERE id=$1 FOR UPDATE', [receivableId])).rows[0];
      if (!locked) { await client.query('ROLLBACK'); return ctx.json(res, 404, { error: 'receivable_not_found' }); }
      if (!['pendente','vencido','parcial'].includes(locked.status)) { await client.query('ROLLBACK'); return ctx.json(res, 409, { error: 'settlement_transition_not_allowed', status: locked.status }); }
      const remaining = Number(locked.amount_cents) - Number(locked.amount_paid_cents);
      if (amount > remaining) { await client.query('ROLLBACK'); return ctx.json(res, 409, { error: 'overpayment', remaining_cents: remaining }); }
      const paid = Number(locked.amount_paid_cents) + amount;
      const next = paid === Number(locked.amount_cents) ? 'recebido' : 'parcial';
      const payment = (await client.query(
        `INSERT INTO fin_payments(account_type,receivable_id,amount_cents,payment_method,is_partial,notes,created_by_identity,idempotency_key,request_fingerprint)
         VALUES('receber',$1,$2,'outro',$3,$4,$5,$6,$7) RETURNING id,amount_cents,created_at`,
        [receivableId, amount, next === 'parcial', reason, session.identityId, requestKey, fingerprint],
      )).rows[0];
      await client.query(`UPDATE fin_accounts_receivable SET amount_paid_cents=$2,status=$3::text::fin_status,paid_at=CASE WHEN $3::text='recebido' THEN NOW() ELSE NULL END WHERE id=$1`, [receivableId, paid, next]);
      await client.query(
        `INSERT INTO fin_payment_history(account_type,receivable_id,previous_status,next_status,previous_paid_cents,next_paid_cents,payment_id,changed_by_identity,reason)
         VALUES('receber',$1,$2,$3,$4,$5,$6,$7,$8)`,
        [receivableId, locked.status, next, locked.amount_paid_cents, paid, payment.id, session.identityId, reason],
      );
      await client.query(`INSERT INTO audit_log(action,actor,target,meta) VALUES('f03_receivable_settle',$1,$2,$3)`, [session.identityId, receivableId, JSON.stringify({ payment_id: payment.id, amount_cents: amount, previous_status: locked.status, next_status: next })]);
      await client.query('COMMIT');
      return ctx.json(res, 201, { payment, receivable: { status: next, amount_paid_cents: paid, amount_remaining_cents: remaining - amount }, replayed: false, note: 'Baixa manual; sem banco, gateway ou conciliação automática.' });
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); return failure(res, error); }
    finally { client.release(); }
  }

  async function reports(req, res, url) {
    const session = await staff(req, res); if (!session) return;
    if (req.method === 'GET') {
      try {
        const grants = await db().query(`SELECT 1 FROM auth_permissions WHERE identity_id=$1 AND permission='financeiro.reports.read' AND revoked_at IS NULL LIMIT 1`, [session.identityId]);
        if (!grants.rows.length) return ctx.json(res, 403, { error: 'permission_scope_denied' });
        const { rows } = await db().query(
          `SELECT id,protocol,account_id,period_start,period_end,record_count,amount_cents,settled_cents,remaining_cents,snapshot,created_at
             FROM fin_f03_reports r WHERE EXISTS (SELECT 1 FROM auth_permissions p WHERE p.identity_id=$1
              AND p.permission='financeiro.reports.read' AND p.revoked_at IS NULL
              AND (p.scope_type IN ('global','organization') OR (p.scope_type='account' AND p.scope_id=r.account_id)))
            ORDER BY created_at DESC LIMIT 100`, [session.identityId]);
        return ctx.json(res, 200, { reports: rows }, { 'Cache-Control': 'private, no-store' });
      } catch (error) { return failure(res, error); }
    }
    if (req.method !== 'POST') return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
    if (!writeGuard(req, res)) return;
    const body = await parse(req, res); if (body === undefined) return;
    const accountId = String(body?.account_id || '');
    const start = String(body?.period_start || ''), end = String(body?.period_end || '');
    const requestKey = keyOf(req);
    if (!UUID.test(accountId)) return ctx.json(res, 400, { error: 'invalid_account_id' });
    if (!DATE.test(start) || !DATE.test(end) || end < start) return ctx.json(res, 400, { error: 'invalid_period' });
    if (!requestKey) return ctx.json(res, 400, { error: 'idempotency_key_required_or_invalid' });
    if (!(await permission(session.identityId, 'financeiro.reports.generate', accountId))) return ctx.json(res, 403, { error: 'permission_scope_denied' });
    const fingerprint = sha({ accountId, start, end });
    const client = await db().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`f03-report:${session.identityId}:${requestKey}`]);
      const replay = await client.query('SELECT * FROM fin_f03_reports WHERE generated_by_identity=$1 AND idempotency_key=$2', [session.identityId, requestKey]);
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint) { await client.query('ROLLBACK'); return ctx.json(res, 409, { error: 'idempotency_conflict' }); }
        await client.query('COMMIT'); return ctx.json(res, 200, { report: replay.rows[0], replayed: true });
      }
      const totals = (await client.query(
        `SELECT count(*)::int record_count,COALESCE(sum(amount_cents),0)::bigint amount_cents,
                COALESCE(sum(amount_paid_cents),0)::bigint settled_cents,COALESCE(sum(amount_remaining_cents),0)::bigint remaining_cents
           FROM fin_accounts_receivable WHERE client_account_id=$1 AND competence_date BETWEEN $2 AND $3`, [accountId, start, end])).rows[0];
      const snapshot = { source: 'fin_accounts_receivable/fin_payments', account_id: accountId, period_start: start, period_end: end, formula: 'somas em centavos dos recebíveis por competência; baixa = amount_paid_cents; saldo = amount_remaining_cents', external_delivery: false };
      const report = (await client.query(
        `INSERT INTO fin_f03_reports(protocol,account_id,period_start,period_end,record_count,amount_cents,settled_cents,remaining_cents,snapshot,generated_by_identity,idempotency_key,request_fingerprint)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [protocol(), accountId, start, end, totals.record_count, totals.amount_cents, totals.settled_cents, totals.remaining_cents, snapshot, session.identityId, requestKey, fingerprint])).rows[0];
      await client.query(`INSERT INTO audit_log(action,actor,target,meta) VALUES('f03_finance_report_generate',$1,$2,$3)`, [session.identityId, report.id, JSON.stringify({ account_id: accountId, period_start: start, period_end: end, record_count: totals.record_count })]);
      await client.query('COMMIT');
      return ctx.json(res, 201, { report, replayed: false, note: 'Snapshot interno; não enviado por e-mail e sem integração bancária.' });
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); return failure(res, error); }
    finally { client.release(); }
  }

  async function handle(req, res, url) {
    if (url.pathname === '/api/admin/finance/f03/receivables') return listReceivables(req, res, url);
    const settlement = url.pathname.match(/^\/api\/admin\/finance\/f03\/receivables\/([0-9a-f-]{36})\/settlements$/i);
    if (settlement) return settle(req, res, settlement[1]);
    if (url.pathname === '/api/admin/finance/f03/reports') return reports(req, res, url);
    return false;
  }
  return { handle };
}
