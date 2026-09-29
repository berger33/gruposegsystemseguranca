export function createCostParameterApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
  const VALID_CATEGORIES = new Set(['tributo','custo','jornada','beneficio','provisao','outro']);
  const VALID_VALUE_TYPES = new Set(['percentual','valor','json']);
  const VALID_STATUS = new Set(['rascunho','em_revisao','aprovado','arquivado']);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function isUuid(v) { return typeof v === 'string' && UUID_RE.test(v); }
  function bad(res, msg) { return json(res, 400, { error: msg }); }

  async function handleParams(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      const category = url.searchParams.get('category');
      const status = url.searchParams.get('status');
      const key = url.searchParams.get('key');
      const essential = url.searchParams.get('essential');
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      if (category && !VALID_CATEGORIES.has(category)) return bad(res, 'invalid_category');
      if (status && !VALID_STATUS.has(status)) return bad(res, 'invalid_status');

      const conds = [];
      const vals = [];
      let idx = 1;
      if (category) { conds.push(`category = $${idx++}`); vals.push(category); }
      if (status) { conds.push(`approval_status = $${idx++}`); vals.push(status); }
      if (key) { conds.push(`param_key ILIKE $${idx++}`); vals.push(`%${key}%`); }
      if (essential === 'true') { conds.push(`is_essential = true`); }
      if (essential === 'false') { conds.push(`is_essential = false`); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

      try {
        const pool = getPool();
        const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM crm_cost_parameters ${where}`, vals);
        const listRes = await pool.query(
          `SELECT id, company_id, category, param_key, param_value, value_type, value_json, unit, validity_start, validity_end, source, source_url, is_essential, approval_status, version, approved_by, approved_at, approved_by_role, notes, created_by, created_by_id, created_at, updated_at
           FROM crm_cost_parameters ${where} ORDER BY category, param_key, validity_start DESC NULLS LAST LIMIT $${idx} OFFSET $${idx+1}`,
          [...vals, limit, offset]
        );
        return json(res, 200, { total: countRes.rows[0]?.total || 0, params: listRes.rows, limit, offset });
      } catch (e) {
        const unconfigured = e.message === 'DATABASE_NOT_CONFIGURED';
        if (!unconfigured) console.error('cost params list failed', e);
        return json(res, 503, { error: unconfigured ? 'database_not_configured' : 'cost_params_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body;
      try { body = await readJson(req); } catch { return bad(res, 'invalid_json'); }
      const company_id = body?.company_id ? String(body.company_id).trim() : null;
      const category = String(body?.category || 'outro').trim().toLowerCase();
      const param_key = String(body?.param_key || body?.key || '').trim();
      const param_value = body?.param_value ?? body?.value;
      const value_type = String(body?.value_type || 'percentual').trim().toLowerCase();
      const unit = body?.unit ? String(body.unit).trim().slice(0,50) : null;
      const validity_start = body?.validity_start ? String(body.validity_start).trim() : null;
      const validity_end = body?.validity_end ? String(body.validity_end).trim() : null;
      const source = body?.source ? String(body.source).trim().slice(0,500) : null;
      const source_url = body?.source_url ? String(body.source_url).trim().slice(0,500) : null;
      const is_essential = !!body?.is_essential;
      const notes = body?.notes ? String(body.notes).trim().slice(0,2000) : null;
      const value_json = body?.value_json || null;

      if (!VALID_CATEGORIES.has(category)) return bad(res, 'invalid_category');
      if (!VALID_VALUE_TYPES.has(value_type)) return bad(res, 'invalid_value_type');
      if (param_key.length < 1 || param_key.length > 100) return bad(res, 'invalid_param_key');
      const numVal = Number(param_value);
      if (!Number.isFinite(numVal)) return bad(res, 'invalid_param_value');
      if (company_id && !isUuid(company_id)) return bad(res, 'invalid_company_id');
      if (validity_start && isNaN(Date.parse(validity_start))) return bad(res, 'invalid_validity_start');
      if (validity_end && isNaN(Date.parse(validity_end))) return bad(res, 'invalid_validity_end');
      if (validity_start && validity_end && new Date(validity_end) < new Date(validity_start)) return bad(res, 'validity_end_before_start');

      // Nenhuma alíquota inventada: exigir source quando aprovado
      // Mas permitir rascunho sem source; ao aprovar exigiremos source em PATCH

      try {
        const pool = getPool();
        const ins = await pool.query(
          `INSERT INTO crm_cost_parameters (company_id, category, param_key, param_value, value_type, value_json, unit, validity_start, validity_end, source, source_url, is_essential, approval_status, version, notes, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'rascunho',1,$13,$14,$15) RETURNING *`,
          [company_id, category, param_key, numVal, value_type, value_json ? JSON.stringify(value_json) : null, unit, validity_start, validity_end, source, source_url, is_essential, notes, session.role, session.identityId || null]
        );
        const row = ins.rows[0];
        try {
          await pool.query(
            "INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_cost_param_create',$3,'allowed','none')",
            [session.role, session.identityId || session.role, row.id]
          );
        } catch {}
        return json(res, 201, { param: row });
      } catch (e) {
        if (e.code === '23505') return json(res, 409, { error: 'param_exists' });
        const unconfigured = e.message === 'DATABASE_NOT_CONFIGURED';
        if (!unconfigured) console.error('cost param create failed', e);
        return json(res, 503, { error: unconfigured ? 'database_not_configured' : 'cost_param_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleParamById(req, res, id) {
    if (!isUuid(id)) return bad(res, 'invalid_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_cost_parameters WHERE id = $1', [id]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        return json(res, 200, { param: r.rows[0] });
      } catch (e) {
        return json(res, 503, { error: 'cost_param_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body;
      try { body = await readJson(req); } catch { return bad(res, 'invalid_json'); }
      const fields = [];
      const vals = [];
      let idx = 1;

      if (body?.category !== undefined) {
        const cat = String(body.category).trim().toLowerCase();
        if (!VALID_CATEGORIES.has(cat)) return bad(res, 'invalid_category');
        fields.push(`category = $${idx++}`); vals.push(cat);
      }
      if (body?.param_key !== undefined) {
        const k = String(body.param_key).trim();
        if (k.length < 1 || k.length > 100) return bad(res, 'invalid_param_key');
        fields.push(`param_key = $${idx++}`); vals.push(k);
      }
      if (body?.param_value !== undefined || body?.value !== undefined) {
        const v = Number(body.param_value ?? body.value);
        if (!Number.isFinite(v)) return bad(res, 'invalid_param_value');
        fields.push(`param_value = $${idx++}`); vals.push(v);
      }
      if (body?.value_type !== undefined) {
        const vt = String(body.value_type).trim().toLowerCase();
        if (!VALID_VALUE_TYPES.has(vt)) return bad(res, 'invalid_value_type');
        fields.push(`value_type = $${idx++}`); vals.push(vt);
      }
      if (body?.value_json !== undefined) {
        fields.push(`value_json = $${idx++}`); vals.push(body.value_json ? JSON.stringify(body.value_json) : null);
      }
      if (body?.unit !== undefined) {
        const u = body.unit ? String(body.unit).trim().slice(0,50) : null;
        fields.push(`unit = $${idx++}`); vals.push(u);
      }
      if (body?.validity_start !== undefined) {
        const vs = body.validity_start ? String(body.validity_start).trim() : null;
        if (vs && isNaN(Date.parse(vs))) return bad(res, 'invalid_validity_start');
        fields.push(`validity_start = $${idx++}`); vals.push(vs);
      }
      if (body?.validity_end !== undefined) {
        const ve = body.validity_end ? String(body.validity_end).trim() : null;
        if (ve && isNaN(Date.parse(ve))) return bad(res, 'invalid_validity_end');
        fields.push(`validity_end = $${idx++}`); vals.push(ve);
      }
      if (body?.source !== undefined) {
        const s = body.source ? String(body.source).trim().slice(0,500) : null;
        fields.push(`source = $${idx++}`); vals.push(s);
      }
      if (body?.source_url !== undefined) {
        const su = body.source_url ? String(body.source_url).trim().slice(0,500) : null;
        fields.push(`source_url = $${idx++}`); vals.push(su);
      }
      if (body?.is_essential !== undefined) {
        fields.push(`is_essential = $${idx++}`); vals.push(!!body.is_essential);
      }
      if (body?.notes !== undefined) {
        const n = body.notes ? String(body.notes).trim().slice(0,2000) : null;
        fields.push(`notes = $${idx++}`); vals.push(n);
      }
      if (body?.approval_status !== undefined || body?.status !== undefined) {
        const st = String(body.approval_status || body.status).trim().toLowerCase();
        if (!VALID_STATUS.has(st)) return bad(res, 'invalid_status');
        fields.push(`approval_status = $${idx++}`); vals.push(st);
        if (st === 'aprovado') {
          fields.push(`approved_by = $${idx++}`); vals.push(session.identityId || null);
          fields.push(`approved_at = NOW()`);
          fields.push(`approved_by_role = $${idx++}`); vals.push(session.role);
          // Impedir aprovação sem fonte e sem valor essencial definido: exigir source
          // Validação será feita após fetch, mas aqui adicionamos check posterior
        }
      }

      if (fields.length === 0) return bad(res, 'no_fields');

      try {
        const pool = getPool();
        // Buscar atual para validar fonte ao aprovar
        const cur = await pool.query('SELECT source, param_value FROM crm_cost_parameters WHERE id = $1', [id]);
        if (!cur.rows[0]) return json(res, 404, { error: 'not_found' });

        const isApproving = (body?.approval_status === 'aprovado' || body?.status === 'aprovado');
        if (isApproving) {
          const newSource = body?.source !== undefined ? body.source : cur.rows[0].source;
          if (!newSource || String(newSource).trim().length < 3) {
            return bad(res, 'source_required_for_approval');
          }
        }

        fields.push(`version = version + 1`);
        fields.push(`updated_at = NOW()`);

        const upd = await pool.query(
          `UPDATE crm_cost_parameters SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
          [...vals, id]
        );
        const row = upd.rows[0];
        try {
          await pool.query(
            "INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,'allowed','none')",
            [session.role, session.identityId || session.role, row.approval_status === 'aprovado' ? 'crm_cost_param_status_aprovado' : 'crm_cost_param_update', row.id]
          );
        } catch {}
        return json(res, 200, { param: row });
      } catch (e) {
        console.error('cost param update failed', e);
        return json(res, 503, { error: 'cost_param_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  async function handleEssentialCheck(req, res) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
    try {
      const pool = getPool();
      const missing = await pool.query(
        `SELECT category, param_key, approval_status FROM crm_cost_parameters WHERE is_essential = true AND approval_status != 'aprovado' ORDER BY category, param_key`
      );
      const canPrice = missing.rows.length === 0;
      return json(res, 200, { can_price_official: canPrice, missing_essential: missing.rows, count_missing: missing.rows.length });
    } catch (e) {
      return json(res, 503, { error: 'essential_check_failed' });
    }
  }

  return { handleParams, handleParamById, handleEssentialCheck };
}
