import { randomUUID } from 'node:crypto';

// First CRM-07 slice: personal follow-up tasks on opportunities owned by the
// authenticated commercial identity. Delegation/team-wide access is not implied.
export function createCrmTaskApi(ctx) {
  return async function handleTasks(req, res, opportunityId, taskId = null) {
    const allowed = taskId ? ['PATCH'] : ['GET', 'POST'];
    if (!allowed.includes(req.method)) return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: allowed.join(', ') });
    const session = await ctx.readAdminSession(req);
    if (!session) return ctx.json(res, 401, { error: 'admin_session_required' });
    if (!['comercial', 'admin', 'marcelo', 'ti'].includes(session.role)) return ctx.json(res, 403, { error: 'commercial_role_required' });
    if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(opportunityId) || (taskId && !uuid.test(taskId))) return ctx.json(res, 400, { error: 'invalid_id' });
    let body = {};
    if (req.method !== 'GET') {
      try { body = await ctx.readJson(req, 8 * 1024); } catch { return ctx.json(res, 400, { error: 'invalid_request' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return ctx.json(res, 400, { error: 'invalid_request' });
    }
    // Attribution and entity links can never be chosen by the browser.
    if (['responsible_id', 'created_by_id', 'company_id', 'opportunity_id'].some(k => Object.hasOwn(body, k))) {
      return ctx.json(res, 400, { error: 'server_managed_fields' });
    }
    let title, dueDate;
    if (req.method === 'POST') {
      title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title || title.length > 200) return ctx.json(res, 400, { error: 'invalid_title' });
      if (typeof body.due_date !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.due_date)) {
        return ctx.json(res, 400, { error: 'invalid_due_date' });
      }
      dueDate = new Date(body.due_date);
      if (!Number.isFinite(dueDate.getTime())) return ctx.json(res, 400, { error: 'invalid_due_date' });
    }
    const transitions = { aberta: ['em_andamento', 'concluida', 'cancelada'], em_andamento: ['concluida', 'cancelada'], concluida: [], cancelada: [] };
    if (req.method === 'PATCH' && (!Object.hasOwn(transitions, body.expected_status) || !Object.hasOwn(transitions, body.status))) {
      return ctx.json(res, 400, { error: 'invalid_status' });
    }
    let client;
    let transaction = false;
    try {
      client = await ctx.getPool().connect();
      await client.query('BEGIN');
      transaction = true;
      // All roles obey the same ownership rule; no administrative bypass.
      const owner = await client.query(
        'SELECT company_id FROM crm_opportunities WHERE id=$1 AND (responsible_id=$2 OR (responsible_id IS NULL AND created_by_id=$2)) FOR SHARE',
        [opportunityId, session.identityId],
      );
      if (!owner.rows[0]) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'opportunity_not_found' });
      }
      if (req.method === 'GET') {
        const result = await client.query(
          'SELECT id, title, due_date, status, priority, created_at FROM crm_tasks WHERE opportunity_id=$1 AND responsible_id=$2 ORDER BY due_date NULLS LAST, created_at DESC LIMIT 200',
          [opportunityId, session.identityId],
        );
        await client.query('COMMIT'); transaction = false;
        return ctx.json(res, 200, { tasks: result.rows, limit: 200 }, { 'Cache-Control': 'no-store' });
      }
      let task, action;
      if (req.method === 'POST') {
        const result = await client.query(
          "INSERT INTO crm_tasks (id,opportunity_id,company_id,title,responsible_id,due_date,created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$5) RETURNING id,title,due_date,status,priority,created_at",
          [randomUUID(), opportunityId, owner.rows[0].company_id, title, session.identityId, dueDate],
        );
        task = result.rows[0]; action = 'crm_task_create';
      } else {
        const current = await client.query('SELECT status FROM crm_tasks WHERE id=$1 AND opportunity_id=$2 AND responsible_id=$3 FOR UPDATE', [taskId, opportunityId, session.identityId]);
        if (!current.rows[0]) {
          await client.query('ROLLBACK'); transaction = false;
          return ctx.json(res, 404, { error: 'task_not_found' });
        }
        const previous = current.rows[0].status;
        if (previous !== body.expected_status || !transitions[previous].includes(body.status)) {
          await client.query('ROLLBACK'); transaction = false;
          return ctx.json(res, 409, { error: 'task_status_conflict' });
        }
        const result = await client.query('UPDATE crm_tasks SET status=$2 WHERE id=$1 RETURNING id,title,due_date,status,priority,created_at', [taskId, body.status]);
        task = result.rows[0]; action = 'crm_task_status';
      }
      // Audit failure rolls back the mutation; never acknowledge unaudited success.
      await client.query(
        "INSERT INTO auth_access_audit (actor_kind,actor_id,action,target,result,detail_category) VALUES ('staff',$1,$2,$3,'allowed','none')",
        [session.identityId, action, task.id],
      );
      await client.query('COMMIT'); transaction = false;
      return ctx.json(res, req.method === 'POST' ? 201 : 200, { task }, { 'Cache-Control': 'no-store' });
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_tasks_unavailable' });
    } finally { client?.release(); }
  };
}
