import { randomUUID } from 'node:crypto';

// CRM-09 — cadências são modelos privados de tarefas manuais. Não há worker,
// disparo de mensagem ou provedor nesta fatia. O canal fica como sugestão no
// registro da tarefa e qualquer contato deve ser abordado por uma ação humana
// autorizada.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANNELS = new Set(['ligacao', 'email', 'whatsapp', 'reuniao', 'visita', 'outro']);
const MAX_STEPS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max + 1) : '';
}
function isUuid(value) { return typeof value === 'string' && UUID.test(value); }
function expectedVersion(value) { return Number.isSafeInteger(value) && value >= 1 ? value : null; }

export function createCrmCadenceApi(ctx) {
  async function sessionForCommercial(req, res) {
    const session = await ctx.readAdminSession(req);
    if (!session) { ctx.json(res, 401, { error: 'admin_session_required' }); return null; }
    // CRM-09 policy: only an active commercial identity creates/edits private
    // models or applies them. Administrative roles do not bypass ownership.
    if (session.role !== 'comercial') {
      ctx.json(res, 403, { error: 'commercial_role_required' }); return null;
    }
    return session;
  }

  function readBody(req, res, max = 16 * 1024) {
    return ctx.readJson(req, max).then(body => {
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        ctx.json(res, 400, { error: 'invalid_request' }); return null;
      }
      return body;
    }).catch(() => {
      ctx.json(res, 400, { error: 'invalid_request' }); return null;
    });
  }

  function rejectManagedFields(body, fields) {
    return fields.some(field => Object.hasOwn(body, field));
  }

  function parseSteps(raw) {
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_STEPS) return { error: 'invalid_steps' };
    const steps = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)
        || ['id', 'template_id', 'step_order', 'responsible_id'].some(field => Object.hasOwn(item, field))) {
        return { error: 'server_managed_fields' };
      }
      const title = text(item.title, 200);
      const intervalDays = item.interval_days;
      const channel = typeof item.suggested_channel === 'string' ? item.suggested_channel.trim().toLowerCase() : '';
      if (!title || title.length > 200) return { error: 'invalid_step_title' };
      if (!Number.isSafeInteger(intervalDays) || intervalDays < 0 || intervalDays > 365) return { error: 'invalid_interval_days' };
      if (!CHANNELS.has(channel)) return { error: 'invalid_suggested_channel' };
      steps.push({ title, intervalDays, channel });
    }
    return { steps };
  }

  async function audit(client, session, action, target) {
    await client.query(
      "INSERT INTO auth_access_audit (actor_kind,actor_id,action,target,result,detail_category) VALUES ('staff',$1,$2,$3,'allowed','none')",
      [session.identityId, action, target],
    );
  }

  async function templatePayload(client, templateId, ownerId) {
    const templateResult = await client.query(
      `SELECT id,name,description,owner_id,status,version,created_at,updated_at
         FROM crm_cadence_templates WHERE id=$1 AND owner_id=$2`,
      [templateId, ownerId],
    );
    if (!templateResult.rows[0]) return null;
    const stepsResult = await client.query(
      `SELECT id,step_order,title,interval_days,suggested_channel,responsible_id,created_at
         FROM crm_cadence_steps WHERE template_id=$1 ORDER BY step_order`,
      [templateId],
    );
    return { ...templateResult.rows[0], steps: stepsResult.rows };
  }

  async function handleTemplates(req, res) {
    const session = await sessionForCommercial(req, res);
    if (!session) return;
    if (!['GET', 'POST'].includes(req.method)) {
      return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
    }
    if (req.method === 'GET') {
      if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
      let client;
      try {
        client = await ctx.getPool().connect();
        const result = await client.query(
          `SELECT id FROM crm_cadence_templates WHERE owner_id=$1 ORDER BY status ASC, updated_at DESC, id`,
          [session.identityId],
        );
        const templates = [];
        for (const row of result.rows) templates.push(await templatePayload(client, row.id, session.identityId));
        return ctx.json(res, 200, { templates: templates.filter(Boolean) }, { 'Cache-Control': 'private, no-store' });
      } catch {
        return ctx.json(res, 503, { error: 'crm_cadences_unavailable' });
      } finally { client?.release(); }
    }

    if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
    const body = await readBody(req, res);
    if (!body) return;
    if (rejectManagedFields(body, ['id', 'owner_id', 'created_by_id', 'version', 'status'])) {
      return ctx.json(res, 400, { error: 'server_managed_fields' });
    }
    const name = text(body.name, 120);
    const description = body.description === undefined || body.description === null ? null : text(body.description, 500);
    if (!name || name.length > 120) return ctx.json(res, 400, { error: 'invalid_name' });
    if (body.description !== undefined && body.description !== null && description.length > 500) return ctx.json(res, 400, { error: 'invalid_description' });
    const parsed = parseSteps(body.steps);
    if (parsed.error) return ctx.json(res, 400, { error: parsed.error });

    let client;
    let transaction = false;
    try {
      client = await ctx.getPool().connect();
      await client.query('BEGIN'); transaction = true;
      const templateId = randomUUID();
      await client.query(
        `INSERT INTO crm_cadence_templates (id,name,description,owner_id)
         VALUES ($1,$2,$3,$4)`,
        [templateId, name, description || null, session.identityId],
      );
      for (const [index, step] of parsed.steps.entries()) {
        await client.query(
          `INSERT INTO crm_cadence_steps (id,template_id,step_order,title,interval_days,suggested_channel,responsible_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [randomUUID(), templateId, index + 1, step.title, step.intervalDays, step.channel, session.identityId],
        );
      }
      await audit(client, session, 'crm_cadence_template_create', templateId);
      const template = await templatePayload(client, templateId, session.identityId);
      await client.query('COMMIT'); transaction = false;
      return ctx.json(res, 201, { template }, { 'Cache-Control': 'private, no-store' });
    } catch (error) {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_cadences_unavailable' });
    } finally { client?.release(); }
  }

  async function handleTemplate(req, res, templateId) {
    const session = await sessionForCommercial(req, res);
    if (!session) return;
    if (!isUuid(templateId)) return ctx.json(res, 400, { error: 'invalid_template_id' });
    if (req.method !== 'PATCH') return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'PATCH' });
    if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
    const body = await readBody(req, res);
    if (!body) return;
    if (rejectManagedFields(body, ['id', 'owner_id', 'created_by_id', 'created_at', 'updated_at'])) {
      return ctx.json(res, 400, { error: 'server_managed_fields' });
    }
    const version = expectedVersion(body.expected_version);
    if (!version) return ctx.json(res, 400, { error: 'expected_version_required' });
    const hasName = Object.hasOwn(body, 'name');
    const hasDescription = Object.hasOwn(body, 'description');
    const hasStatus = Object.hasOwn(body, 'status');
    const hasSteps = Object.hasOwn(body, 'steps');
    if (!hasName && !hasDescription && !hasStatus && !hasSteps) return ctx.json(res, 400, { error: 'no_fields' });
    const name = hasName ? text(body.name, 120) : null;
    if (hasName && (!name || name.length > 120)) return ctx.json(res, 400, { error: 'invalid_name' });
    const description = hasDescription && body.description !== null ? text(body.description, 500) : null;
    if (hasDescription && body.description !== null && description.length > 500) return ctx.json(res, 400, { error: 'invalid_description' });
    let parsed;
    if (hasSteps) {
      parsed = parseSteps(body.steps);
      if (parsed.error) return ctx.json(res, 400, { error: parsed.error });
    }
    const status = hasStatus ? String(body.status).toLowerCase() : null;
    if (hasStatus && !['ativa', 'arquivada'].includes(status)) return ctx.json(res, 400, { error: 'invalid_status' });

    let client;
    let transaction = false;
    try {
      client = await ctx.getPool().connect();
      await client.query('BEGIN'); transaction = true;
      const current = await client.query(
        `SELECT id,name,description,status,version FROM crm_cadence_templates
          WHERE id=$1 AND owner_id=$2 FOR UPDATE`,
        [templateId, session.identityId],
      );
      if (!current.rows[0]) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'template_not_found' });
      }
      if (current.rows[0].version !== version) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'template_version_conflict' });
      }
      if (hasSteps) {
        const used = await client.query('SELECT 1 FROM crm_cadence_enrollments WHERE template_id=$1 LIMIT 1', [templateId]);
        if (used.rows[0]) {
          await client.query('ROLLBACK'); transaction = false;
          return ctx.json(res, 409, { error: 'template_steps_locked_after_application' });
        }
        await client.query('DELETE FROM crm_cadence_steps WHERE template_id=$1', [templateId]);
        for (const [index, step] of parsed.steps.entries()) {
          await client.query(
            `INSERT INTO crm_cadence_steps (id,template_id,step_order,title,interval_days,suggested_channel,responsible_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [randomUUID(), templateId, index + 1, step.title, step.intervalDays, step.channel, session.identityId],
          );
        }
      }
      const updates = [];
      const values = [];
      let index = 1;
      if (hasName) { updates.push(`name=$${index++}`); values.push(name); }
      if (hasDescription) { updates.push(`description=$${index++}`); values.push(description); }
      if (hasStatus) { updates.push(`status=$${index++}`); values.push(status); }
      updates.push(`version=version+1`, 'updated_at=NOW()');
      values.push(templateId, session.identityId, version);
      const result = await client.query(
        `UPDATE crm_cadence_templates SET ${updates.join(', ')}
          WHERE id=$${index++} AND owner_id=$${index++} AND version=$${index} RETURNING id`,
        values,
      );
      if (!result.rows[0]) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'template_version_conflict' });
      }
      const action = status === 'arquivada' ? 'crm_cadence_template_archive' : 'crm_cadence_template_update';
      await audit(client, session, action, templateId);
      const template = await templatePayload(client, templateId, session.identityId);
      await client.query('COMMIT'); transaction = false;
      return ctx.json(res, 200, { template }, { 'Cache-Control': 'private, no-store' });
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_cadences_unavailable' });
    } finally { client?.release(); }
  }

  async function ownerOpportunity(client, opportunityId, identityId) {
    const result = await client.query(
      `SELECT id,company_id,contact_id,stage
         FROM crm_opportunities
        WHERE id=$1 AND (responsible_id=$2 OR (responsible_id IS NULL AND created_by_id=$2))
        FOR UPDATE`,
      [opportunityId, identityId],
    );
    return result.rows[0] || null;
  }

  async function handleOpportunity(req, res, opportunityId) {
    const session = await sessionForCommercial(req, res);
    if (!session) return;
    if (!isUuid(opportunityId)) return ctx.json(res, 400, { error: 'invalid_opportunity_id' });
    if (!['GET', 'POST'].includes(req.method)) return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
    if (req.method === 'POST' && !ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
    if (req.method === 'GET' && !ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });

    let client;
    let transaction = false;
    try {
      client = await ctx.getPool().connect();
      await client.query('BEGIN'); transaction = true;
      const opportunity = await ownerOpportunity(client, opportunityId, session.identityId);
      if (!opportunity) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'opportunity_not_found' });
      }
      const contactResult = await client.query(
        `SELECT id,display_name,email,status,prospecting_opted_out
           FROM crm_contacts WHERE id=$1 AND company_id=$2`,
        [opportunity.contact_id, opportunity.company_id],
      );
      const contact = contactResult.rows[0] || null;
      if (req.method === 'GET') {
        const enrollments = await client.query(
          `SELECT e.id,e.template_id,e.contact_id,e.status,e.applied_by_id,e.applied_at,e.ended_at,e.blocked_reason,
                  t.name AS template_name
             FROM crm_cadence_enrollments e
             JOIN crm_cadence_templates t ON t.id=e.template_id
            WHERE e.opportunity_id=$1 ORDER BY e.applied_at DESC, e.id DESC`,
          [opportunityId],
        );
        const ids = enrollments.rows.map(row => row.id);
        let tasks = [];
        if (ids.length) {
          const taskResult = await client.query(
            `SELECT id,cadence_enrollment_id,cadence_step_id,title,due_date,status,suggested_channel,cadence_blocked_reason,created_at
               FROM crm_tasks WHERE cadence_enrollment_id = ANY($1::uuid[])
              ORDER BY due_date ASC NULLS LAST, created_at ASC, id ASC`,
            [ids],
          );
          tasks = taskResult.rows;
        }
        await client.query('COMMIT'); transaction = false;
        return ctx.json(res, 200, {
          opportunity: { id: opportunity.id, stage: opportunity.stage },
          contact,
          enrollments: enrollments.rows.map(enrollment => ({
            ...enrollment,
            tasks: tasks.filter(task => task.cadence_enrollment_id === enrollment.id),
          })),
        }, { 'Cache-Control': 'private, no-store' });
      }

      const body = await readBody(req, res);
      if (!body) { await client.query('ROLLBACK'); transaction = false; return; }
      if (rejectManagedFields(body, ['id', 'opportunity_id', 'company_id', 'applied_by_id', 'responsible_id', 'status', 'created_by_id'])) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 400, { error: 'server_managed_fields' });
      }
      const templateId = body.template_id;
      if (!isUuid(templateId)) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 400, { error: 'invalid_template_id' });
      }
      const template = await client.query(
        `SELECT id,name,status FROM crm_cadence_templates WHERE id=$1 AND owner_id=$2 FOR SHARE`,
        [templateId, session.identityId],
      );
      if (!template.rows[0]) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'template_not_found' });
      }
      if (template.rows[0].status !== 'ativa') {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'template_archived' });
      }
      if (['ganho', 'perdido'].includes(opportunity.stage)) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'opportunity_final' });
      }
      const contactId = body.contact_id === undefined || body.contact_id === '' ? opportunity.contact_id : body.contact_id;
      if (!isUuid(contactId) || !contact || contact.id !== contactId) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 400, { error: 'contact_not_available' });
      }
      if (contact.status !== 'active') {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'contact_inactive' });
      }
      if (contact.prospecting_opted_out) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'contact_opted_out' });
      }
      const steps = await client.query(
        `SELECT id,step_order,title,interval_days,suggested_channel
           FROM crm_cadence_steps WHERE template_id=$1 ORDER BY step_order`,
        [templateId],
      );
      if (!steps.rows.length) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 409, { error: 'template_without_steps' });
      }
      const enrollment = await client.query(
        `INSERT INTO crm_cadence_enrollments (id,template_id,opportunity_id,contact_id,applied_by_id)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id,template_id,opportunity_id,contact_id,status,applied_at`,
        [randomUUID(), templateId, opportunityId, contactId, session.identityId],
      );
      const enrollmentRow = enrollment.rows[0];
      const appliedAt = new Date();
      const tasks = [];
      for (const step of steps.rows) {
        const dueDate = new Date(appliedAt.getTime() + step.interval_days * DAY_MS);
        const result = await client.query(
          `INSERT INTO crm_tasks (id,opportunity_id,company_id,title,description,responsible_id,due_date,status,priority,created_by_id,cadence_enrollment_id,cadence_step_id,suggested_channel)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'aberta','media',$6,$8,$9,$10)
           RETURNING id,title,due_date,status,suggested_channel,cadence_enrollment_id,cadence_step_id,created_at`,
          [randomUUID(), opportunityId, opportunity.company_id, step.title,
            `Cadência manual “${template.rows[0].name}”, passo ${step.step_order}. Canal sugerido: ${step.suggested_channel}. Nenhuma mensagem é enviada automaticamente.`,
            session.identityId, dueDate, enrollmentRow.id, step.id, step.suggested_channel],
        );
        tasks.push(result.rows[0]);
      }
      await audit(client, session, 'crm_cadence_apply', enrollmentRow.id);
      await client.query('COMMIT'); transaction = false;
      return ctx.json(res, 201, { enrollment: enrollmentRow, tasks }, { 'Cache-Control': 'private, no-store' });
    } catch (error) {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      if (error?.code === '23505') return ctx.json(res, 409, { error: 'cadence_already_applied' });
      return ctx.json(res, 503, { error: 'crm_cadences_unavailable' });
    } finally { client?.release(); }
  }

  async function handleOptOut(req, res, opportunityId) {
    const session = await sessionForCommercial(req, res);
    if (!session) return;
    if (req.method !== 'PATCH') return ctx.json(res, 405, { error: 'method_not_allowed' }, { Allow: 'PATCH' });
    if (!ctx.sameOrigin(req)) return ctx.json(res, 403, { error: 'same_origin_required' });
    if (!isUuid(opportunityId)) return ctx.json(res, 400, { error: 'invalid_opportunity_id' });
    const body = await readBody(req, res);
    if (!body) return;
    if (rejectManagedFields(body, ['contact_id', 'opportunity_id', 'status', 'updated_at']) || body.opted_out !== true) {
      return ctx.json(res, 400, { error: 'opt_out_confirmation_required' });
    }
    let client;
    let transaction = false;
    try {
      client = await ctx.getPool().connect();
      await client.query('BEGIN'); transaction = true;
      const opportunity = await ownerOpportunity(client, opportunityId, session.identityId);
      if (!opportunity) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'opportunity_not_found' });
      }
      if (!opportunity.contact_id) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 400, { error: 'contact_required' });
      }
      const updated = await client.query(
        `UPDATE crm_contacts SET prospecting_opted_out=true, updated_at=NOW()
          WHERE id=$1 AND company_id=$2
          RETURNING id,display_name,email,status,prospecting_opted_out`,
        [opportunity.contact_id, opportunity.company_id],
      );
      if (!updated.rows[0]) {
        await client.query('ROLLBACK'); transaction = false;
        return ctx.json(res, 404, { error: 'contact_not_available' });
      }
      await audit(client, session, 'crm_contact_prospecting_opt_out', updated.rows[0].id);
      const blocked = await client.query(
        `SELECT count(*)::int AS count FROM crm_tasks
          WHERE opportunity_id=$1 AND cadence_enrollment_id IS NOT NULL
            AND cadence_blocked_reason='contato_opted_out'`,
        [opportunityId],
      );
      await client.query('COMMIT'); transaction = false;
      return ctx.json(res, 200, { contact: updated.rows[0], blockedTasks: blocked.rows[0]?.count || 0 }, { 'Cache-Control': 'private, no-store' });
    } catch {
      if (transaction) await client?.query('ROLLBACK').catch(() => {});
      return ctx.json(res, 503, { error: 'crm_cadences_unavailable' });
    } finally { client?.release(); }
  }

  return { handleTemplates, handleTemplate, handleOpportunity, handleOptOut };
}
