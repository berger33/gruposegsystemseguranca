import { randomUUID } from 'node:crypto';

// CRM-07 tasks: personal follow-up tasks on opportunities owned by the
// authenticated commercial identity, now with real pagination, server-side
// filters, optimistic due-date editing and explicit delegation with acceptance.
// There is still no team-wide queue or staff directory: the only bridge
// between two comerciais is an explicit, audited, per-task delegation.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRANSITIONS = {
  aberta: ['em_andamento', 'concluida', 'cancelada'],
  em_andamento: ['concluida', 'cancelada'],
  concluida: [],
  cancelada: [],
};
const OWNER_ROLES = ['comercial', 'admin', 'marcelo', 'ti'];

function parsePage(url) {
  const rawLimit = Number(url?.searchParams?.get('limit') ?? 25);
  const rawOffset = Number(url?.searchParams?.get('offset') ?? 0);
  if (!Number.isSafeInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) return null;
  if (!Number.isSafeInteger(rawOffset) || rawOffset < 0 || rawOffset > 10_000) return null;
  return { limit: rawLimit, offset: rawOffset };
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, match => `\\${match}`);
}

function parseDueDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function createCrmTaskApi(ctx) {
  async function readBody(req, res) {
    let body;
    try { body = await ctx.readJson(req, 8 * 1024); } catch { ctx.json(res, 400, { error: 'invalid_request' }); return undefined; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) { ctx.json(res, 400, { error: 'invalid_request' }); return undefined; }
    // Attribution and entity links can never be chosen by the browser.
    const managed = ['responsible_id', 'created_by_id', 'company_id', 'opportunity_id', 'delegated_to_id', 'delegated_by_id', 'delegation_status', 'version', 'cadence_enrollment_id', 'cadence_step_id'];
    if (managed.some(key => Object.hasOwn(body, key))) { ctx.json(res, 400, { error: 'server_managed_fields' }); return undefined; }
    return body;
  }

  async function guard(req, res, { methods, roles, mutating = req.method !== 'GET' }) {
    if (!methods.includes(req.method)) { ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: methods.join(', ') }); return null; }
    const session = await ctx.readAdminSession(req);
    if (!session) { ctx.json(res, 401, { error: 'admin_session_required' }); return null; }
    if (!roles.includes(session.role)) { ctx.json(res, 403, { error: 'commercial_role_required' }); return null; }
    if (mutating && !ctx.sameOrigin(req)) { ctx.json(res, 403, { error: 'same_origin_required' }); return null; }
    return session;
  }

  async function withTransaction(res, work) {
    let client;
    let transaction = false;
    try {
      client = await ctx.getPool().connect();
      await client.query('BEGIN');
      transaction = true;
      const done = await work(client, async (status, payload, headers) => {
        await client.query('ROLLBACK');
        transaction = false;
        return ctx.json(res, status, payload, headers);
      }, async (status, payload) => {
        await client.query('COMMIT');
        transaction = false;
        return ctx.json(res, status, payload, { 'Cache-Control': 'no-store' });
      });
      return done;
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_tasks_unavailable' });
    } finally { client?.release(); }
  }

  function audit(client, actorId, action, target) {
    // Audit failure rolls back the mutation; never acknowledge unaudited success.
    return client.query(
      "INSERT INTO auth_access_audit (actor_kind,actor_id,action,target,result,detail_category) VALUES ('staff',$1,$2,$3,'allowed','none')",
      [actorId, action, target],
    );
  }

  const TASK_COLUMNS = `t.id, t.title, t.due_date, t.status, t.priority, t.created_at, t.version,
    t.delegation_status, t.delegated_at, t.suggested_channel,
    (SELECT email FROM auth_identities WHERE id = t.delegated_to_id) AS delegated_to_email`;

  // GET (paginated + filtered) / POST on the owner's opportunity.
  async function handleTasks(req, res, opportunityId, taskId, url) {
    const methods = taskId ? ['PATCH'] : ['GET', 'POST'];
    const session = await guard(req, res, { methods, roles: OWNER_ROLES });
    if (!session) return;
    if (!UUID.test(opportunityId) || (taskId && !UUID.test(taskId))) return ctx.json(res, 400, { error: 'invalid_id' });
    let body = {};
    if (req.method !== 'GET') {
      body = await readBody(req, res);
      if (body === undefined) return;
    }
    let page = null, filters = null;
    if (req.method === 'GET') {
      page = parsePage(url);
      if (!page) return ctx.json(res, 400, { error: 'invalid_pagination' });
      const status = url.searchParams.get('status');
      if (status !== null && !Object.hasOwn(TRANSITIONS, status)) return ctx.json(res, 400, { error: 'invalid_filter' });
      const q = url.searchParams.get('q');
      if (q !== null && (typeof q !== 'string' || !q.trim() || q.length > 200)) return ctx.json(res, 400, { error: 'invalid_filter' });
      const overdueRaw = url.searchParams.get('overdue');
      if (overdueRaw !== null && !['1', 'true'].includes(overdueRaw)) return ctx.json(res, 400, { error: 'invalid_filter' });
      filters = { status, q: q === null ? null : q.trim(), overdue: overdueRaw !== null };
    }
    let title, dueDate;
    if (req.method === 'POST') {
      title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title || title.length > 200) return ctx.json(res, 400, { error: 'invalid_title' });
      dueDate = parseDueDate(body.due_date);
      if (!dueDate) return ctx.json(res, 400, { error: 'invalid_due_date' });
    }
    if (req.method === 'PATCH') {
      const statusOp = Object.hasOwn(body, 'status') || Object.hasOwn(body, 'expected_status');
      const dueOp = Object.hasOwn(body, 'due_date') || Object.hasOwn(body, 'expected_version');
      // Exactly one operation per request: a state transition OR a due-date edit.
      if (statusOp === dueOp) return ctx.json(res, 400, { error: 'invalid_operation' });
      if (statusOp && (!Object.hasOwn(TRANSITIONS, body.expected_status) || !Object.hasOwn(TRANSITIONS, body.status))) {
        return ctx.json(res, 400, { error: 'invalid_status' });
      }
      if (dueOp) {
        if (!Number.isSafeInteger(body.expected_version) || body.expected_version < 1) return ctx.json(res, 400, { error: 'invalid_version' });
        dueDate = parseDueDate(body.due_date);
        if (!dueDate) return ctx.json(res, 400, { error: 'invalid_due_date' });
      }
    }
    return withTransaction(res, async (client, fail, ok) => {
      // All roles obey the same ownership rule; no administrative bypass.
      const owner = await client.query(
        'SELECT company_id FROM crm_opportunities WHERE id=$1 AND (responsible_id=$2 OR (responsible_id IS NULL AND created_by_id=$2)) FOR SHARE',
        [opportunityId, session.identityId],
      );
      if (!owner.rows[0]) return fail(404, { error: 'opportunity_not_found' });
      if (req.method === 'GET') {
        const where = ['t.opportunity_id=$1', '(t.responsible_id=$2 OR t.delegated_by_id=$2)'];
        const values = [opportunityId, session.identityId];
        if (filters.status) { values.push(filters.status); where.push(`t.status=$${values.length}`); }
        if (filters.q) { values.push(`%${escapeLike(filters.q)}%`); where.push(`t.title ILIKE $${values.length} ESCAPE '\\'`); }
        if (filters.overdue) where.push("t.due_date < NOW() AND t.status IN ('aberta','em_andamento')");
        const total = await client.query(`SELECT count(*)::int AS total FROM crm_tasks t WHERE ${where.join(' AND ')}`, values);
        values.push(page.limit, page.offset);
        const result = await client.query(
          `SELECT ${TASK_COLUMNS} FROM crm_tasks t WHERE ${where.join(' AND ')}
           ORDER BY t.due_date NULLS LAST, t.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
          values,
        );
        return ok(200, { tasks: result.rows, total: total.rows[0].total, limit: page.limit, offset: page.offset });
      }
      let task, action;
      if (req.method === 'POST') {
        const result = await client.query(
          `INSERT INTO crm_tasks (id,opportunity_id,company_id,title,responsible_id,due_date,created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$5)
           RETURNING id,title,due_date,status,priority,created_at,version,delegation_status,delegated_at,suggested_channel,NULL::text AS delegated_to_email`,
          [randomUUID(), opportunityId, owner.rows[0].company_id, title, session.identityId, dueDate],
        );
        task = result.rows[0]; action = 'crm_task_create';
      } else {
        const current = await client.query(
          'SELECT status, version, delegation_status, responsible_id FROM crm_tasks WHERE id=$1 AND opportunity_id=$2 FOR UPDATE',
          [taskId, opportunityId],
        );
        const row = current.rows[0];
        if (!row) return fail(404, { error: 'task_not_found' });
        // While a delegation is pending or accepted, the owner no longer edits
        // the task; the pending one must be revoked first, the accepted one
        // belongs to the delegate.
        if (['pendente', 'aceita'].includes(row.delegation_status)) return fail(409, { error: 'task_delegated' });
        if (row.responsible_id !== session.identityId) return fail(404, { error: 'task_not_found' });
        if (Object.hasOwn(body, 'due_date')) {
          if (!['aberta', 'em_andamento'].includes(row.status)) return fail(409, { error: 'task_not_open' });
          if (row.version !== body.expected_version) return fail(409, { error: 'task_version_conflict' });
          const result = await client.query(
            `UPDATE crm_tasks SET due_date=$2 WHERE id=$1
             RETURNING id,title,due_date,status,priority,created_at,version,delegation_status,delegated_at,suggested_channel,NULL::text AS delegated_to_email`,
            [taskId, dueDate],
          );
          task = result.rows[0]; action = 'crm_task_update';
        } else {
          if (row.status !== body.expected_status || !TRANSITIONS[row.status].includes(body.status)) {
            return fail(409, { error: 'task_status_conflict' });
          }
          const result = await client.query(
            `UPDATE crm_tasks SET status=$2 WHERE id=$1
             RETURNING id,title,due_date,status,priority,created_at,version,delegation_status,delegated_at,suggested_channel,NULL::text AS delegated_to_email`,
            [taskId, body.status],
          );
          task = result.rows[0]; action = 'crm_task_status';
        }
      }
      await audit(client, session.identityId, action, task.id);
      return ok(req.method === 'POST' ? 201 : 200, { task });
    });
  }

  // POST/DELETE the delegation of one task. Delegation exists only between
  // active `comercial` identities; administrative roles neither send nor
  // receive one. The target is addressed by exact e-mail and every target
  // problem (unknown, non-comercial, inactive, self) returns the same generic
  // error so the route cannot be used to probe the staff directory.
  async function handleDelegation(req, res, opportunityId, taskId) {
    const session = await guard(req, res, { methods: ['POST', 'DELETE'], roles: ['comercial'], mutating: true });
    if (!session) return;
    if (!UUID.test(opportunityId) || !UUID.test(taskId)) return ctx.json(res, 400, { error: 'invalid_id' });
    let email = null;
    if (req.method === 'POST') {
      const body = await readBody(req, res);
      if (body === undefined) return;
      email = typeof body.email === 'string' ? body.email.trim() : '';
      if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ctx.json(res, 400, { error: 'invalid_email' });
    }
    return withTransaction(res, async (client, fail, ok) => {
      const owner = await client.query(
        'SELECT company_id FROM crm_opportunities WHERE id=$1 AND (responsible_id=$2 OR (responsible_id IS NULL AND created_by_id=$2)) FOR SHARE',
        [opportunityId, session.identityId],
      );
      if (!owner.rows[0]) return fail(404, { error: 'opportunity_not_found' });
      const current = await client.query(
        'SELECT status, delegation_status, responsible_id, cadence_enrollment_id FROM crm_tasks WHERE id=$1 AND opportunity_id=$2 FOR UPDATE',
        [taskId, opportunityId],
      );
      const row = current.rows[0];
      if (!row) return fail(404, { error: 'task_not_found' });
      if (req.method === 'DELETE') {
        if (row.delegation_status === 'aceita') return fail(409, { error: 'delegation_already_accepted' });
        if (row.delegation_status !== 'pendente') return fail(409, { error: 'no_pending_delegation' });
        const result = await client.query(
          `UPDATE crm_tasks SET delegated_to_id=NULL, delegated_by_id=NULL, delegation_status=NULL, delegated_at=NULL, delegation_responded_at=NULL WHERE id=$1
           RETURNING id,title,due_date,status,priority,created_at,version,delegation_status,delegated_at,suggested_channel,NULL::text AS delegated_to_email`,
          [taskId],
        );
        await audit(client, session.identityId, 'crm_task_delegation_revoke', taskId);
        return ok(200, { task: result.rows[0] });
      }
      // CRM-09 cadence steps are private to the comercial who applied the
      // cadence; delegating the materialized task would bypass that policy.
      if (row.cadence_enrollment_id) return fail(409, { error: 'cadence_task_not_delegable' });
      if (!['aberta', 'em_andamento'].includes(row.status)) return fail(409, { error: 'task_not_open' });
      if (['pendente', 'aceita'].includes(row.delegation_status)) return fail(409, { error: 'task_delegated' });
      if (row.responsible_id !== session.identityId) return fail(404, { error: 'task_not_found' });
      const target = await client.query(
        `SELECT i.id FROM auth_identities i JOIN auth_staff_profiles p ON p.identity_id = i.id
         WHERE lower(i.email) = lower($1) AND i.kind = 'staff' AND i.status = 'active' AND p.role = 'comercial'`,
        [email],
      );
      const targetId = target.rows[0]?.id;
      if (!targetId || targetId === session.identityId) return fail(404, { error: 'delegate_not_available' });
      const result = await client.query(
        `UPDATE crm_tasks SET delegated_to_id=$2, delegated_by_id=$3, delegation_status='pendente', delegated_at=NOW(), delegation_responded_at=NULL WHERE id=$1
         RETURNING id,title,due_date,status,priority,created_at,version,delegation_status,delegated_at,suggested_channel,
           (SELECT email FROM auth_identities WHERE id=$2) AS delegated_to_email`,
        [taskId, targetId, session.identityId],
      );
      await audit(client, session.identityId, 'crm_task_delegate', taskId);
      return ok(200, { task: result.rows[0] });
    });
  }

  // Personal view of the delegate: only tasks delegated to the session, with
  // the minimum context needed to act (no values, notes, interactions or
  // contacts of someone else's opportunity).
  async function handleDelegatedList(req, res, url) {
    const session = await guard(req, res, { methods: ['GET'], roles: ['comercial'] });
    if (!session) return;
    const page = parsePage(url);
    if (!page) return ctx.json(res, 400, { error: 'invalid_pagination' });
    return withTransaction(res, async (client, fail, ok) => {
      const total = await client.query(
        "SELECT count(*)::int AS total FROM crm_tasks WHERE delegated_to_id=$1 AND delegation_status IN ('pendente','aceita')",
        [session.identityId],
      );
      const result = await client.query(
        `SELECT t.id, t.title, t.due_date, t.status, t.priority, t.delegation_status, t.delegated_at,
                o.title AS opportunity_title, c.display_name AS company_name, bi.display_name AS delegated_by_name
         FROM crm_tasks t
         JOIN crm_opportunities o ON o.id = t.opportunity_id
         JOIN crm_companies c ON c.id = t.company_id
         JOIN auth_identities bi ON bi.id = t.delegated_by_id
         WHERE t.delegated_to_id=$1 AND t.delegation_status IN ('pendente','aceita')
         ORDER BY (t.delegation_status='pendente') DESC, t.due_date NULLS LAST, t.delegated_at DESC
         LIMIT $2 OFFSET $3`,
        [session.identityId, page.limit, page.offset],
      );
      return ok(200, { tasks: result.rows, total: total.rows[0].total, limit: page.limit, offset: page.offset });
    });
  }

  // POST accept/decline; only acceptance transfers task responsibility.
  async function handleDelegatedResponse(req, res, taskId) {
    const session = await guard(req, res, { methods: ['POST'], roles: ['comercial'], mutating: true });
    if (!session) return;
    if (!UUID.test(taskId)) return ctx.json(res, 400, { error: 'invalid_id' });
    const body = await readBody(req, res);
    if (body === undefined) return;
    if (typeof body.accept !== 'boolean') return ctx.json(res, 400, { error: 'invalid_response' });
    return withTransaction(res, async (client, fail, ok) => {
      const current = await client.query(
        "SELECT id FROM crm_tasks WHERE id=$1 AND delegated_to_id=$2 AND delegation_status='pendente' FOR UPDATE",
        [taskId, session.identityId],
      );
      if (!current.rows[0]) return fail(404, { error: 'delegation_not_found' });
      const result = body.accept
        ? await client.query(
            `UPDATE crm_tasks SET responsible_id=$2, delegation_status='aceita', delegation_responded_at=NOW() WHERE id=$1
             RETURNING id,title,due_date,status,priority,delegation_status,delegated_at`,
            [taskId, session.identityId],
          )
        : await client.query(
            `UPDATE crm_tasks SET delegation_status='recusada', delegation_responded_at=NOW() WHERE id=$1
             RETURNING id,title,due_date,status,priority,delegation_status,delegated_at`,
            [taskId],
          );
      await audit(client, session.identityId, body.accept ? 'crm_task_delegation_accept' : 'crm_task_delegation_decline', taskId);
      return ok(200, { task: result.rows[0] });
    });
  }

  // PATCH state transitions by the delegate after acceptance.
  async function handleDelegatedItem(req, res, taskId) {
    const session = await guard(req, res, { methods: ['PATCH'], roles: ['comercial'], mutating: true });
    if (!session) return;
    if (!UUID.test(taskId)) return ctx.json(res, 400, { error: 'invalid_id' });
    const body = await readBody(req, res);
    if (body === undefined) return;
    if (!Object.hasOwn(TRANSITIONS, body.expected_status) || !Object.hasOwn(TRANSITIONS, body.status)) {
      return ctx.json(res, 400, { error: 'invalid_status' });
    }
    return withTransaction(res, async (client, fail, ok) => {
      const current = await client.query(
        "SELECT status FROM crm_tasks WHERE id=$1 AND delegated_to_id=$2 AND responsible_id=$2 AND delegation_status='aceita' FOR UPDATE",
        [taskId, session.identityId],
      );
      const row = current.rows[0];
      if (!row) return fail(404, { error: 'task_not_found' });
      if (row.status !== body.expected_status || !TRANSITIONS[row.status].includes(body.status)) {
        return fail(409, { error: 'task_status_conflict' });
      }
      const result = await client.query(
        `UPDATE crm_tasks SET status=$2 WHERE id=$1
         RETURNING id,title,due_date,status,priority,delegation_status,delegated_at`,
        [taskId, body.status],
      );
      await audit(client, session.identityId, 'crm_task_delegated_status', taskId);
      return ok(200, { task: result.rows[0] });
    });
  }

  return { handleTasks, handleDelegation, handleDelegatedList, handleDelegatedResponse, handleDelegatedItem };
}
