import { randomUUID } from 'node:crypto';

// CRM-07 next slice: interaction history (call/meeting/note) per opportunity.
// Same ownership rule as crm-task-api.mjs: only the identity that owns the
// opportunity (its responsible, or its creator when unassigned) may read or
// write this history. There is no team/delegation scope yet, so extending
// visibility beyond this rule would be a silent, undocumented widening of
// access — not implemented here on purpose.
const ALLOWED_TYPES = ['ligacao', 'reuniao', 'nota'];

export function createCrmInteractionApi(ctx) {
  return async function handleInteractions(req, res, opportunityId) {
    const allowed = ['GET', 'POST'];
    if (!allowed.includes(req.method)) return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: allowed.join(', ') });
    const session = await ctx.readAdminSession(req);
    if (!session) return ctx.json(res, 401, { error: 'admin_session_required' });
    if (!['comercial', 'admin', 'marcelo', 'ti'].includes(session.role)) return ctx.json(res, 403, { error: 'commercial_role_required' });
    if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(opportunityId)) return ctx.json(res, 400, { error: 'invalid_id' });
    let body = {};
    if (req.method === 'POST') {
      try { body = await ctx.readJson(req, 8 * 1024); } catch { return ctx.json(res, 400, { error: 'invalid_request' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return ctx.json(res, 400, { error: 'invalid_request' });
    }
    // Attribution and entity links can never be chosen by the browser.
    if (['created_by_id', 'company_id', 'opportunity_id', 'contact_id'].some(k => Object.hasOwn(body, k))) {
      return ctx.json(res, 400, { error: 'server_managed_fields' });
    }
    let type, title, details, occurredAt;
    if (req.method === 'POST') {
      type = typeof body.type === 'string' ? body.type.trim().toLowerCase() : '';
      if (!ALLOWED_TYPES.includes(type)) return ctx.json(res, 400, { error: 'invalid_type' });
      title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title || title.length > 200) return ctx.json(res, 400, { error: 'invalid_title' });
      if (body.details !== undefined && body.details !== null) {
        details = typeof body.details === 'string' ? body.details.trim() : null;
        if (details === null || details.length > 5000) return ctx.json(res, 400, { error: 'invalid_details' });
        if (!details) details = null;
      } else {
        details = null;
      }
      if (body.occurred_at !== undefined) {
        if (typeof body.occurred_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.occurred_at)) {
          return ctx.json(res, 400, { error: 'invalid_occurred_at' });
        }
        occurredAt = new Date(body.occurred_at);
        if (!Number.isFinite(occurredAt.getTime())) return ctx.json(res, 400, { error: 'invalid_occurred_at' });
        // A record can happen in the past (late logging), but never claim a
        // future occurrence — that would misrepresent the history.
        if (occurredAt.getTime() > Date.now() + 5 * 60 * 1000) return ctx.json(res, 400, { error: 'invalid_occurred_at' });
      } else {
        occurredAt = new Date();
      }
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
          'SELECT id, type, title, details, occurred_at, created_at FROM crm_interactions WHERE opportunity_id=$1 ORDER BY occurred_at DESC, created_at DESC LIMIT 200',
          [opportunityId],
        );
        await client.query('COMMIT'); transaction = false;
        return ctx.json(res, 200, { interactions: result.rows, limit: 200 }, { 'Cache-Control': 'no-store' });
      }
      const result = await client.query(
        'INSERT INTO crm_interactions (id,opportunity_id,company_id,type,title,details,occurred_at,created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,type,title,details,occurred_at,created_at',
        [randomUUID(), opportunityId, owner.rows[0].company_id, type, title, details, occurredAt, session.identityId],
      );
      const interaction = result.rows[0];
      // Audit failure rolls back the mutation; never acknowledge unaudited success.
      await client.query(
        "INSERT INTO auth_access_audit (actor_kind,actor_id,action,target,result,detail_category) VALUES ('staff',$1,'crm_interaction_create',$2,'allowed','none')",
        [session.identityId, interaction.id],
      );
      await client.query('COMMIT'); transaction = false;
      return ctx.json(res, 201, { interaction }, { 'Cache-Control': 'no-store' });
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_interactions_unavailable' });
    } finally { client?.release(); }
  };
}
