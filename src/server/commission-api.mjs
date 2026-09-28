export function createCommissionApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUuid = v => typeof v === 'string' && UUID_RE.test(v);
  const bad = (res, msg) => json(res, 400, { error: msg });
  const sanitizeText = (s, max) => {
    if (s == null) return null;
    if (typeof s !== 'string') return null;
    const t = s.trim();
    if (t.length === 0) return null;
    if (t.length > max) return null;
    return t;
  };

  // Goals
  async function handleGoals(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      const responsibleId = url.searchParams.get('responsibleId') || url.searchParams.get('responsible_id');
      const status = url.searchParams.get('status');
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      if (responsibleId && !isUuid(responsibleId)) return bad(res, 'invalid_responsible_id');
      const conds = []; const vals = []; let idx = 1;
      if (responsibleId) { conds.push(`responsible_id = $${idx++}`); vals.push(responsibleId); }
      if (status) { conds.push(`status = $${idx++}`); vals.push(status); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      try {
        const pool = getPool();
        const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM crm_goals ${where}`, vals);
        const listRes = await pool.query(`SELECT * FROM crm_goals ${where} ORDER BY period_start DESC LIMIT $${idx} OFFSET $${idx+1}`, [...vals, limit, offset]);
        return json(res, 200, { total: countRes.rows[0]?.total || 0, goals: listRes.rows, limit, offset });
      } catch (e) {
        return json(res, 503, { error: 'goals_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const title = sanitizeText(body?.title, 200);
      const description = sanitizeText(body?.description, 1000);
      const responsible_id = body?.responsible_id ? String(body.responsible_id).trim() : null;
      const responsible_name = sanitizeText(body?.responsible_name, 120);
      const period_start = body?.period_start ? String(body.period_start).trim() : null;
      const period_end = body?.period_end ? String(body.period_end).trim() : null;
      const target_value = body?.target_value != null ? Number(body.target_value) : null;
      const target_type = body?.target_type ? String(body.target_type).trim().toLowerCase() : 'contratado';

      if (!title) return bad(res, 'invalid_title');
      if (!period_start || isNaN(Date.parse(period_start))) return bad(res, 'invalid_period_start');
      if (!period_end || isNaN(Date.parse(period_end))) return bad(res, 'invalid_period_end');
      if (new Date(period_end) < new Date(period_start)) return bad(res, 'invalid_period_range');
      if (target_value == null || isNaN(target_value) || target_value < 0) return bad(res, 'invalid_target_value');
      if (!['contratado','faturado','recebido'].includes(target_type)) return bad(res, 'invalid_target_type');
      if (responsible_id && !isUuid(responsible_id)) return bad(res, 'invalid_responsible_id');

      try {
        const pool = getPool();
        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_goals (id, responsible_id, responsible_name, title, description, period_start, period_end, target_value, target_type, status, version, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'rascunho',1,$10,$11) RETURNING *`,
          [id, responsible_id, responsible_name, title, description, period_start, period_end, target_value, target_type, session.role, session.identityId || null]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_goal_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 201, { goal: ins.rows[0] });
      } catch (e) {
        console.error('goal create failed', e);
        return json(res, 503, { error: 'goal_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleGoalById(req, res, id) {
    if (!isUuid(id)) return bad(res, 'invalid_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_goals WHERE id = $1', [id]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        return json(res, 200, { goal: r.rows[0] });
      } catch {
        return json(res, 503, { error: 'goal_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req, 20 * 1024); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;
      if (body?.title !== undefined) { const t = sanitizeText(body.title, 200); if (!t) return bad(res, 'invalid_title'); fields.push(`title = $${idx++}`); vals.push(t); }
      if (body?.description !== undefined) { const d = sanitizeText(body.description, 1000); fields.push(`description = $${idx++}`); vals.push(d); }
      if (body?.target_value !== undefined) { const tv = Number(body.target_value); if (isNaN(tv) || tv < 0) return bad(res, 'invalid_target_value'); fields.push(`target_value = $${idx++}`); vals.push(tv); }
      if (body?.status !== undefined) {
        const st = String(body.status).trim().toLowerCase();
        if (!['rascunho','ativo','atingida','nao_atingida','cancelada'].includes(st)) return bad(res, 'invalid_status');
        fields.push(`status = $${idx++}`); vals.push(st);
        if (st === 'ativo' || st === 'atingida' || st === 'nao_atingida') {
          fields.push(`approved_by = $${idx++}`); vals.push(session.identityId || null);
          fields.push(`approved_at = NOW()`);
        }
      }
      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`version = version + 1`);
      fields.push(`updated_at = NOW()`);
      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_goals SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, [...vals, id]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_goal_status',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 200, { goal: upd.rows[0] });
      } catch (e) {
        return json(res, 503, { error: 'goal_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  // Commission Rules
  async function handleRules(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      const status = url.searchParams.get('status');
      const baseType = url.searchParams.get('baseType') || url.searchParams.get('base_type');
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const conds = []; const vals = []; let idx = 1;
      if (status) { conds.push(`status = $${idx++}`); vals.push(status); }
      if (baseType) { conds.push(`base_type = $${idx++}`); vals.push(baseType); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      try {
        const pool = getPool();
        const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM crm_commission_rules ${where}`, vals);
        const listRes = await pool.query(`SELECT * FROM crm_commission_rules ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx+1}`, [...vals, limit, offset]);
        return json(res, 200, { total: countRes.rows[0]?.total || 0, rules: listRes.rows, limit, offset });
      } catch {
        return json(res, 503, { error: 'rules_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const name = sanitizeText(body?.name, 200);
      const description = sanitizeText(body?.description, 1000);
      const base_type = body?.base_type ? String(body.base_type).trim().toLowerCase() : 'contratado';
      const period_type = body?.period_type ? String(body.period_type).trim().toLowerCase() : 'mensal';
      const percent = body?.percent != null ? Number(body.percent) : null;
      const cancel_rule = body?.cancel_rule ? String(body.cancel_rule).trim().toLowerCase() : 'estorna_proporcional';
      const requires_approval = body?.requires_approval != null ? Boolean(body.requires_approval) : true;
      const approver_role = sanitizeText(body?.approver_role, 80);
      const min_value = body?.min_value != null ? Number(body.min_value) : null;
      const max_value = body?.max_value != null ? Number(body.max_value) : null;

      if (!name) return bad(res, 'invalid_name');
      if (!['contratado','faturado','recebido'].includes(base_type)) return bad(res, 'invalid_base_type');
      if (!['mensal','trimestral','semestral','anual','por_contrato'].includes(period_type)) return bad(res, 'invalid_period_type');
      if (percent == null || isNaN(percent) || percent < 0 || percent > 100) return bad(res, 'invalid_percent');
      if (!['mantem','estorna_proporcional','estorna_total','recalcula'].includes(cancel_rule)) return bad(res, 'invalid_cancel_rule');

      try {
        const pool = getPool();
        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_commission_rules (id, name, description, base_type, period_type, percent, cancel_rule, requires_approval, approver_role, min_value, max_value, status, version, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'rascunho',1,$12,$13) RETURNING *`,
          [id, name, description, base_type, period_type, percent, cancel_rule, requires_approval, approver_role, min_value, max_value, session.role, session.identityId || null]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_commission_rule_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 201, { rule: ins.rows[0] });
      } catch (e) {
        console.error('rule create failed', e);
        return json(res, 503, { error: 'rule_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleRuleById(req, res, id) {
    if (!isUuid(id)) return bad(res, 'invalid_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_commission_rules WHERE id = $1', [id]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        return json(res, 200, { rule: r.rows[0] });
      } catch {
        return json(res, 503, { error: 'rule_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req, 20 * 1024); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;
      if (body?.name !== undefined) { const n = sanitizeText(body.name, 200); if (!n) return bad(res, 'invalid_name'); fields.push(`name = $${idx++}`); vals.push(n); }
      if (body?.description !== undefined) { const d = sanitizeText(body.description, 1000); fields.push(`description = $${idx++}`); vals.push(d); }
      if (body?.percent !== undefined) { const p = Number(body.percent); if (isNaN(p) || p < 0 || p > 100) return bad(res, 'invalid_percent'); fields.push(`percent = $${idx++}`); vals.push(p); }
      if (body?.status !== undefined) {
        const st = String(body.status).trim().toLowerCase();
        if (!['rascunho','ativa','inativa'].includes(st)) return bad(res, 'invalid_status');
        fields.push(`status = $${idx++}`); vals.push(st);
        if (st === 'ativa') {
          fields.push(`approved_by = $${idx++}`); vals.push(session.identityId || null);
          fields.push(`approved_at = NOW()`);
        }
      }
      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`version = version + 1`);
      fields.push(`updated_at = NOW()`);
      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_commission_rules SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, [...vals, id]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_commission_rule_status',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 200, { rule: upd.rows[0] });
      } catch {
        return json(res, 503, { error: 'rule_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  // Commissions
  async function handleCommissions(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      const ruleId = url.searchParams.get('ruleId') || url.searchParams.get('rule_id');
      const goalId = url.searchParams.get('goalId') || url.searchParams.get('goal_id');
      const responsibleId = url.searchParams.get('responsibleId') || url.searchParams.get('responsible_id');
      const status = url.searchParams.get('status');
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const conds = []; const vals = []; let idx = 1;
      if (ruleId) { if (!isUuid(ruleId)) return bad(res, 'invalid_rule_id'); conds.push(`rule_id = $${idx++}`); vals.push(ruleId); }
      if (goalId) { if (!isUuid(goalId)) return bad(res, 'invalid_goal_id'); conds.push(`goal_id = $${idx++}`); vals.push(goalId); }
      if (responsibleId) { if (!isUuid(responsibleId)) return bad(res, 'invalid_responsible_id'); conds.push(`responsible_id = $${idx++}`); vals.push(responsibleId); }
      if (status) { conds.push(`status = $${idx++}`); vals.push(status); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      try {
        const pool = getPool();
        const countRes = await pool.query(`SELECT COUNT(*)::int AS total, COALESCE(SUM(calculated_value),0)::numeric AS total_value FROM crm_commissions ${where}`, vals);
        const listRes = await pool.query(`SELECT * FROM crm_commissions ${where} ORDER BY period_start DESC LIMIT $${idx} OFFSET $${idx+1}`, [...vals, limit, offset]);
        return json(res, 200, { total: countRes.rows[0]?.total || 0, total_value: countRes.rows[0]?.total_value || 0, commissions: listRes.rows, limit, offset, note: 'Comissões sem pagamento automático. is_paid false por padrão, pagamento manual registrado.' });
      } catch {
        return json(res, 503, { error: 'commissions_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const rule_id = body?.rule_id ? String(body.rule_id).trim() : null;
      const goal_id = body?.goal_id ? String(body.goal_id).trim() : null;
      const opportunity_id = body?.opportunity_id ? String(body.opportunity_id).trim() : null;
      const contract_id = body?.contract_id ? String(body.contract_id).trim() : null;
      const company_id = body?.company_id ? String(body.company_id).trim() : null;
      const responsible_id = body?.responsible_id ? String(body.responsible_id).trim() : null;
      const responsible_name = sanitizeText(body?.responsible_name, 120);
      const base_value = body?.base_value != null ? Number(body.base_value) : null;
      const period_start = body?.period_start ? String(body.period_start).trim() : null;
      const period_end = body?.period_end ? String(body.period_end).trim() : null;

      if (!rule_id || !isUuid(rule_id)) return bad(res, 'invalid_rule_id');
      if (goal_id && !isUuid(goal_id)) return bad(res, 'invalid_goal_id');
      if (opportunity_id && !isUuid(opportunity_id)) return bad(res, 'invalid_opportunity_id');
      if (contract_id && !isUuid(contract_id)) return bad(res, 'invalid_contract_id');
      if (company_id && !isUuid(company_id)) return bad(res, 'invalid_company_id');
      if (responsible_id && !isUuid(responsible_id)) return bad(res, 'invalid_responsible_id');
      if (base_value == null || isNaN(base_value) || base_value < 0) return bad(res, 'invalid_base_value');
      if (!period_start || isNaN(Date.parse(period_start))) return bad(res, 'invalid_period_start');
      if (!period_end || isNaN(Date.parse(period_end))) return bad(res, 'invalid_period_end');
      if (new Date(period_end) < new Date(period_start)) return bad(res, 'invalid_period_range');

      try {
        const pool = getPool();
        const ruleRes = await pool.query('SELECT * FROM crm_commission_rules WHERE id = $1', [rule_id]);
        if (!ruleRes.rows[0]) return json(res, 404, { error: 'rule_not_found' });
        const rule = ruleRes.rows[0];
        if (rule.status !== 'ativa') return json(res, 409, { error: 'rule_not_active' });

        const calculated_value = Number((base_value * Number(rule.percent) / 100).toFixed(2));

        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_commissions (id, rule_id, goal_id, opportunity_id, contract_id, company_id, responsible_id, responsible_name, base_type, base_value, percent, calculated_value, period_start, period_end, status, version, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,1,$16,$17) RETURNING *`,
          [id, rule_id, goal_id, opportunity_id, contract_id, company_id, responsible_id, responsible_name, rule.base_type, base_value, rule.percent, calculated_value, period_start, period_end, rule.requires_approval ? 'pendente_aprovacao' : 'aprovada', session.role, session.identityId || null]
        );

        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_commission_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}

        return json(res, 201, { commission: ins.rows[0], note: 'Comissão criada sem pagamento automático. is_paid false, pagamento manual via PATCH.' });
      } catch (e) {
        console.error('commission create failed', e);
        return json(res, 503, { error: 'commission_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleCommissionById(req, res, id) {
    if (!isUuid(id)) return bad(res, 'invalid_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_commissions WHERE id = $1', [id]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        return json(res, 200, { commission: r.rows[0] });
      } catch {
        return json(res, 503, { error: 'commission_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;

      if (body?.status !== undefined) {
        const st = String(body.status).trim().toLowerCase();
        if (!['rascunho','pendente_aprovacao','aprovada','rejeitada','cancelada','estornada'].includes(st)) return bad(res, 'invalid_status');
        fields.push(`status = $${idx++}`); vals.push(st);
        if (st === 'aprovada' || st === 'rejeitada') {
          fields.push(`approved_by = $${idx++}`); vals.push(session.identityId || null);
          fields.push(`approved_at = NOW()`);
          if (body?.approval_notes !== undefined) {
            const an = sanitizeText(body.approval_notes, 1000);
            fields.push(`approval_notes = $${idx++}`); vals.push(an);
          }
        }
        if (st === 'cancelada' || st === 'estornada') {
          if (body?.cancel_reason !== undefined) {
            const cr = sanitizeText(body.cancel_reason, 500);
            if (!cr) return bad(res, 'cancel_reason_required');
            fields.push(`cancel_reason = $${idx++}`); vals.push(cr);
          }
        }
      }

      if (body?.is_paid !== undefined) {
        // Pagamento manual, não automático: is_paid true requer aprovação prévia
        const isPaid = Boolean(body.is_paid);
        if (isPaid) {
          // Verificar se comissão está aprovada
          try {
            const pool = getPool();
            const cur = await pool.query('SELECT status FROM crm_commissions WHERE id = $1', [id]);
            if (!cur.rows[0]) return json(res, 404, { error: 'not_found' });
            if (cur.rows[0].status !== 'aprovada') return json(res, 409, { error: 'commission_not_approved_cannot_pay', current_status: cur.rows[0].status });
          } catch {}
          fields.push(`is_paid = true`);
          fields.push(`paid_at = NOW()`);
          if (body?.paid_note !== undefined) {
            const pn = sanitizeText(body.paid_note, 500);
            fields.push(`paid_note = $${idx++}`); vals.push(pn);
          }
        } else {
          fields.push(`is_paid = false`);
          fields.push(`paid_at = NULL`);
        }
      }

      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`version = version + 1`);
      fields.push(`updated_at = NOW()`);

      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_commissions SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, [...vals, id]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_commission_status',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 200, { commission: upd.rows[0], note: 'Sem pagamento automático: is_paid manual, requer aprovação prévia.' });
      } catch (e) {
        console.error('commission update failed', e);
        return json(res, 503, { error: 'commission_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  return { handleGoals, handleGoalById, handleRules, handleRuleById, handleCommissions, handleCommissionById };
}
