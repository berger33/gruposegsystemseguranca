export function createContractAlertApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUuid = v => typeof v === 'string' && UUID_RE.test(v);
  const bad = (res, msg) => json(res, 400, { error: msg });

  function sanitizeText(s, max) {
    if (s == null) return null;
    if (typeof s !== 'string') return null;
    const t = s.trim();
    if (t.length === 0) return null;
    if (t.length > max) return null;
    return t;
  }

  const ALERT_TYPES = ['vencimento','renovacao','reajuste','vigencia_fim','faturamento','outro'];
  const CHANNELS = ['email','whatsapp','sistema','outro'];
  const ALERT_STATUSES = ['pendente','enviado','confirmado','cancelado','concluido'];

  async function handleAlertRules(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const cRes = await pool.query('SELECT id, company_id, ends_on, title FROM crm_contracts WHERE id = $1', [contractId]);
        if (!cRes.rows[0]) return json(res, 404, { error: 'contract_not_found' });
        const rules = await pool.query('SELECT * FROM crm_contract_alert_rules WHERE contract_id = $1 ORDER BY days_before DESC, created_at', [contractId]);
        return json(res, 200, { contract: cRes.rows[0], rules: rules.rows, note: 'Alertas configuráveis de vencimento/renovação com days_before, responsável e negociação vinculada' });
      } catch (e) {
        console.error('alert rules list failed', e);
        return json(res, 503, { error: 'alert_rules_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body;
      try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const alert_type = body?.alert_type ? String(body.alert_type).trim().toLowerCase() : 'vencimento';
      const title = sanitizeText(body?.title, 200);
      const description = sanitizeText(body?.description, 1000);
      const days_before = body?.days_before != null ? parseInt(body.days_before, 10) : null;
      const is_enabled = body?.is_enabled != null ? Boolean(body.is_enabled) : true;
      const channel = body?.channel ? String(body.channel).trim().toLowerCase() : 'sistema';
      const responsible_id = body?.responsible_id ? String(body.responsible_id).trim() : null;
      const responsible_name = sanitizeText(body?.responsible_name, 120);
      const opportunity_id = body?.opportunity_id ? String(body.opportunity_id).trim() : null;

      if (!ALERT_TYPES.includes(alert_type)) return bad(res, 'invalid_alert_type');
      if (!title) return bad(res, 'invalid_title');
      if (days_before == null || isNaN(days_before) || days_before < 1 || days_before > 365) return bad(res, 'invalid_days_before_1_365');
      if (!CHANNELS.includes(channel)) return bad(res, 'invalid_channel');
      if (responsible_id && !isUuid(responsible_id)) return bad(res, 'invalid_responsible_id');
      if (opportunity_id && !isUuid(opportunity_id)) return bad(res, 'invalid_opportunity_id');
      if (!responsible_name && !responsible_id) return bad(res, 'responsible_required');

      try {
        const pool = getPool();
        const cRes = await pool.query('SELECT id, company_id FROM crm_contracts WHERE id = $1', [contractId]);
        if (!cRes.rows[0]) return json(res, 404, { error: 'contract_not_found' });

        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_contract_alert_rules
            (id, contract_id, company_id, alert_type, title, description, days_before, is_enabled, channel, responsible_id, responsible_name, opportunity_id, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [id, contractId, cRes.rows[0].company_id, alert_type, title, description, days_before, is_enabled, channel, responsible_id, responsible_name, opportunity_id, session.role, session.identityId || null]
        );

        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_alert_rule_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}

        return json(res, 201, { rule: ins.rows[0], note: 'Regra de alerta configurável criada com responsável e negociação vinculada' });
      } catch (e) {
        console.error('alert rule create failed', e);
        return json(res, 503, { error: 'alert_rule_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleAlertRuleById(req, res, contractId, ruleId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!isUuid(ruleId)) return bad(res, 'invalid_rule_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_contract_alert_rules WHERE id = $1 AND contract_id = $2', [ruleId, contractId]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        return json(res, 200, { rule: r.rows[0] });
      } catch {
        return json(res, 503, { error: 'alert_rule_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body;
      try { body = await readJson(req, 20 * 1024); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;
      if (body?.title !== undefined) { const t = sanitizeText(body.title, 200); if (!t) return bad(res, 'invalid_title'); fields.push(`title = $${idx++}`); vals.push(t); }
      if (body?.description !== undefined) { const d = sanitizeText(body.description, 1000); fields.push(`description = $${idx++}`); vals.push(d); }
      if (body?.days_before !== undefined) { const db = parseInt(body.days_before, 10); if (isNaN(db) || db < 1 || db > 365) return bad(res, 'invalid_days_before'); fields.push(`days_before = $${idx++}`); vals.push(db); }
      if (body?.is_enabled !== undefined) { fields.push(`is_enabled = $${idx++}`); vals.push(Boolean(body.is_enabled)); }
      if (body?.channel !== undefined) { const ch = String(body.channel).trim().toLowerCase(); if (!CHANNELS.includes(ch)) return bad(res, 'invalid_channel'); fields.push(`channel = $${idx++}`); vals.push(ch); }
      if (body?.responsible_id !== undefined) { const rid = body.responsible_id ? String(body.responsible_id).trim() : null; if (rid && !isUuid(rid)) return bad(res, 'invalid_responsible_id'); fields.push(`responsible_id = $${idx++}`); vals.push(rid); }
      if (body?.responsible_name !== undefined) { const rn = sanitizeText(body.responsible_name, 120); fields.push(`responsible_name = $${idx++}`); vals.push(rn); }
      if (body?.opportunity_id !== undefined) { const oid = body.opportunity_id ? String(body.opportunity_id).trim() : null; if (oid && !isUuid(oid)) return bad(res, 'invalid_opportunity_id'); fields.push(`opportunity_id = $${idx++}`); vals.push(oid); }
      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`updated_at = NOW()`);
      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_contract_alert_rules SET ${fields.join(', ')} WHERE id = $${idx} AND contract_id = $${idx+1} RETURNING *`, [...vals, ruleId, contractId]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_alert_rule_update',$3,'allowed','none')", [session.role, session.identityId || session.role, ruleId]); } catch {}
        return json(res, 200, { rule: upd.rows[0] });
      } catch (e) {
        console.error('alert rule update failed', e);
        return json(res, 503, { error: 'alert_rule_update_failed' });
      }
    }

    if (req.method === 'DELETE') {
      try {
        const pool = getPool();
        await pool.query('DELETE FROM crm_contract_alert_rules WHERE id = $1 AND contract_id = $2', [ruleId, contractId]);
        return json(res, 200, { deleted: true });
      } catch {
        return json(res, 503, { error: 'alert_rule_delete_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH, DELETE' });
  }

  async function handleAlerts(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const list = await pool.query('SELECT * FROM crm_contract_alerts WHERE contract_id = $1 ORDER BY scheduled_date ASC', [contractId]);
        return json(res, 200, { alerts: list.rows });
      } catch {
        return json(res, 503, { error: 'alerts_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body;
      try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const rule_id = body?.rule_id ? String(body.rule_id).trim() : null;
      const due_date = body?.due_date ? String(body.due_date).trim() : null;
      const scheduled_date = body?.scheduled_date ? String(body.scheduled_date).trim() : null;
      const title = sanitizeText(body?.title, 200);
      const notes = sanitizeText(body?.notes, 1000);
      const responsible_id = body?.responsible_id ? String(body.responsible_id).trim() : null;
      const responsible_name = sanitizeText(body?.responsible_name, 120);
      const opportunity_id = body?.opportunity_id ? String(body.opportunity_id).trim() : null;
      const create_task = body?.create_task != null ? Boolean(body.create_task) : true;

      if (due_date && isNaN(Date.parse(due_date))) return bad(res, 'invalid_due_date');
      if (scheduled_date && isNaN(Date.parse(scheduled_date))) return bad(res, 'invalid_scheduled_date');
      if (responsible_id && !isUuid(responsible_id)) return bad(res, 'invalid_responsible_id');
      if (opportunity_id && !isUuid(opportunity_id)) return bad(res, 'invalid_opportunity_id');
      if (rule_id && !isUuid(rule_id)) return bad(res, 'invalid_rule_id');

      try {
        const pool = getPool();
        const cRes = await pool.query('SELECT id, company_id, ends_on FROM crm_contracts WHERE id = $1', [contractId]);
        if (!cRes.rows[0]) return json(res, 404, { error: 'contract_not_found' });
        const contract = cRes.rows[0];

        let rule = null;
        let finalDueDate = due_date ? new Date(due_date).toISOString().slice(0,10) : null;
        let finalScheduledDate = scheduled_date ? new Date(scheduled_date).toISOString().slice(0,10) : null;
        let finalTitle = title;
        let finalAlertType = 'vencimento';
        let finalResponsibleId = responsible_id;
        let finalResponsibleName = responsible_name;
        let finalOpportunityId = opportunity_id;

        if (rule_id) {
          const rRes = await pool.query('SELECT * FROM crm_contract_alert_rules WHERE id = $1 AND contract_id = $2', [rule_id, contractId]);
          if (!rRes.rows[0]) return json(res, 404, { error: 'rule_not_found' });
          rule = rRes.rows[0];
          if (!rule.is_enabled) return json(res, 409, { error: 'rule_disabled' });
          finalAlertType = rule.alert_type;
          finalTitle = finalTitle || rule.title;
          finalResponsibleId = finalResponsibleId || rule.responsible_id;
          finalResponsibleName = finalResponsibleName || rule.responsible_name;
          finalOpportunityId = finalOpportunityId || rule.opportunity_id;
          // Se due_date não informado, usa ends_on do contrato
          if (!finalDueDate) {
            if (contract.ends_on) finalDueDate = new Date(contract.ends_on).toISOString().slice(0,10);
            else return bad(res, 'due_date_required_when_contract_has_no_ends_on');
          }
          // Calcula scheduled = due - days_before
          if (!finalScheduledDate) {
            const due = new Date(finalDueDate);
            due.setDate(due.getDate() - rule.days_before);
            finalScheduledDate = due.toISOString().slice(0,10);
          }
        } else {
          // Sem regra, exige due_date e scheduled_date e title e responsible
          if (!finalDueDate) return bad(res, 'due_date_required');
          if (!finalScheduledDate) return bad(res, 'scheduled_date_required');
          if (!finalTitle) return bad(res, 'title_required');
          if (!finalResponsibleName && !finalResponsibleId) return bad(res, 'responsible_required');
        }

        if (new Date(finalScheduledDate) > new Date(finalDueDate)) return bad(res, 'scheduled_must_be_before_due');

        // Cria tarefa vinculada com responsável e negociação CRM se solicitado
        let taskId = null;
        if (create_task) {
          const taskIdNew = crypto.randomUUID();
          const taskDue = new Date(finalScheduledDate);
          // Task due_date as TIMESTAMPTZ
          await pool.query(
            `INSERT INTO crm_tasks (id, contract_id, company_id, opportunity_id, title, description, responsible_id, due_date, status, priority, created_by_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'aberta','alta',$9)`,
            [
              taskIdNew,
              contractId,
              contract.company_id,
              finalOpportunityId,
              finalTitle,
              `Alerta ${finalAlertType} contrato ${contractId} vencimento ${finalDueDate} agendado ${finalScheduledDate}. ${notes || ''}`.slice(0,2000),
              finalResponsibleId,
              taskDue.toISOString(),
              session.identityId || null,
            ]
          );
          taskId = taskIdNew;
        }

        const alertId = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_contract_alerts
            (id, rule_id, contract_id, company_id, alert_type, title, scheduled_date, due_date, status, task_id, opportunity_id, responsible_id, responsible_name, notes, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pendente',$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
          [alertId, rule_id, contractId, contract.company_id, finalAlertType, finalTitle, finalScheduledDate, finalDueDate, taskId, finalOpportunityId, finalResponsibleId, finalResponsibleName, notes, session.role, session.identityId || null]
        );

        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_alert_create',$3,'allowed','none')", [session.role, session.identityId || session.role, alertId]); } catch {}

        return json(res, 201, { alert: ins.rows[0], task_id: taskId, note: 'Alerta de vencimento/renovação criado com tarefa responsável e negociação vinculada CRM' });
      } catch (e) {
        console.error('alert create failed', e);
        return json(res, 503, { error: 'alert_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleAlertById(req, res, contractId, alertId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!isUuid(alertId)) return bad(res, 'invalid_alert_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_contract_alerts WHERE id = $1 AND contract_id = $2', [alertId, contractId]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        return json(res, 200, { alert: r.rows[0] });
      } catch {
        return json(res, 503, { error: 'alert_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body;
      try { body = await readJson(req, 20 * 1024); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;
      if (body?.status !== undefined) {
        const st = String(body.status).trim().toLowerCase();
        if (!ALERT_STATUSES.includes(st)) return bad(res, 'invalid_status');
        fields.push(`status = $${idx++}`); vals.push(st);
      }
      if (body?.notes !== undefined) { const n = sanitizeText(body.notes, 1000); fields.push(`notes = $${idx++}`); vals.push(n); }
      if (body?.responsible_id !== undefined) { const rid = body.responsible_id ? String(body.responsible_id).trim() : null; if (rid && !isUuid(rid)) return bad(res, 'invalid_responsible_id'); fields.push(`responsible_id = $${idx++}`); vals.push(rid); }
      if (body?.responsible_name !== undefined) { const rn = sanitizeText(body.responsible_name, 120); fields.push(`responsible_name = $${idx++}`); vals.push(rn); }
      if (body?.opportunity_id !== undefined) { const oid = body.opportunity_id ? String(body.opportunity_id).trim() : null; if (oid && !isUuid(oid)) return bad(res, 'invalid_opportunity_id'); fields.push(`opportunity_id = $${idx++}`); vals.push(oid); }
      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`updated_at = NOW()`);
      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_contract_alerts SET ${fields.join(', ')} WHERE id = $${idx} AND contract_id = $${idx+1} RETURNING *`, [...vals, alertId, contractId]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_alert_status',$3,'allowed','none')", [session.role, session.identityId || session.role, alertId]); } catch {}
        return json(res, 200, { alert: upd.rows[0] });
      } catch (e) {
        console.error('alert update failed', e);
        return json(res, 503, { error: 'alert_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  return { handleAlertRules, handleAlertRuleById, handleAlerts, handleAlertById };
}
