export function createContractDetailsApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

  // Posts / turnos contratados
  async function handlePosts(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_contract_posts WHERE contract_id = $1 ORDER BY created_at', [contractId]);
        return json(res, 200, { posts: r.rows });
      } catch {
        return json(res, 503, { error: 'posts_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const title = sanitizeText(body?.title, 200);
      const description = sanitizeText(body?.description, 1000);
      const shift = body?.shift ? String(body.shift).trim().toLowerCase() : 'comercial';
      const quantity = body?.quantity != null ? parseInt(body.quantity, 10) : 1;
      const location = sanitizeText(body?.location, 200);
      const unit_id = body?.unit_id ? String(body.unit_id).trim() : null;
      const is_24h = Boolean(body?.is_24h);
      const recurrence_type = body?.recurrence_type ? String(body.recurrence_type).trim().toLowerCase() : 'recorrente';
      const schedule = body?.schedule && typeof body.schedule === 'object' ? body.schedule : { dias: ["seg","ter","qua","qui","sex"], inicio: "08:00", fim: "18:00" };

      if (!title) return bad(res, 'invalid_title');
      if (!['diurno','noturno','12x36_dia','12x36_noite','24x48','comercial','madrugada','outro'].includes(shift)) return bad(res, 'invalid_shift');
      if (isNaN(quantity) || quantity < 1 || quantity > 100) return bad(res, 'invalid_quantity');
      if (unit_id && !isUuid(unit_id)) return bad(res, 'invalid_unit_id');
      if (!['recorrente','avulso','implantacao','outro'].includes(recurrence_type)) return bad(res, 'invalid_recurrence_type');

      try {
        const pool = getPool();
        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_contract_posts (id, contract_id, title, description, shift, quantity, schedule, location, unit_id, is_24h, recurrence_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11) RETURNING *`,
          [id, contractId, title, description, shift, quantity, JSON.stringify(schedule), location, unit_id, is_24h, recurrence_type]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_post_create',$3,'allowed','none')", [session.role, session.identityId || session.role, contractId]); } catch {}
        return json(res, 201, { post: ins.rows[0] });
      } catch (e) {
        console.error('post create failed', e);
        return json(res, 503, { error: 'post_create_failed' });
      }
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const id = url.searchParams.get('id') || url.searchParams.get('post_id');
      if (!id || !isUuid(id)) return bad(res, 'invalid_id');
      try {
        const pool = getPool();
        await pool.query('DELETE FROM crm_contract_posts WHERE id = $1 AND contract_id = $2', [id, contractId]);
        return json(res, 200, { removed: true });
      } catch {
        return json(res, 503, { error: 'post_remove_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST, DELETE' });
  }

  // SLA
  async function handleSla(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_contract_sla WHERE contract_id = $1 ORDER BY created_at', [contractId]);
        return json(res, 200, { sla: r.rows });
      } catch {
        return json(res, 503, { error: 'sla_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const service_type = body?.service_type ? String(body.service_type).trim().toLowerCase() : 'vigilancia';
      const description = sanitizeText(body?.description, 1000);
      const response_time_minutes = body?.response_time_minutes != null ? parseInt(body.response_time_minutes, 10) : null;
      const resolution_time_minutes = body?.resolution_time_minutes != null ? parseInt(body.resolution_time_minutes, 10) : null;
      const availability_percent = body?.availability_percent != null ? Number(body.availability_percent) : null;
      const penalty_description = sanitizeText(body?.penalty_description, 1000);

      if (!description) return bad(res, 'invalid_description');
      if (!['vigilancia','portaria','limpeza','monitoramento','manutencao','atendimento','outro'].includes(service_type)) return bad(res, 'invalid_service_type');

      try {
        const pool = getPool();
        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_contract_sla (id, contract_id, service_type, description, response_time_minutes, resolution_time_minutes, availability_percent, penalty_description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [id, contractId, service_type, description, response_time_minutes, resolution_time_minutes, availability_percent, penalty_description]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_sla_create',$3,'allowed','none')", [session.role, session.identityId || session.role, contractId]); } catch {}
        return json(res, 201, { sla: ins.rows[0] });
      } catch (e) {
        console.error('sla create failed', e);
        return json(res, 503, { error: 'sla_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  // Obrigações
  async function handleObligations(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_contract_obligations WHERE contract_id = $1 ORDER BY party, created_at', [contractId]);
        return json(res, 200, { obligations: r.rows });
      } catch {
        return json(res, 503, { error: 'obligations_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const party = body?.party ? String(body.party).trim().toLowerCase() : 'contratada';
      const title = sanitizeText(body?.title, 200);
      const description = sanitizeText(body?.description, 2000);
      const due_date = body?.due_date ? String(body.due_date).trim() : null;

      if (!title) return bad(res, 'invalid_title');
      if (!description) return bad(res, 'invalid_description');
      if (!['contratante','contratada','ambas'].includes(party)) return bad(res, 'invalid_party');
      if (due_date && isNaN(Date.parse(due_date))) return bad(res, 'invalid_due_date');

      try {
        const pool = getPool();
        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_contract_obligations (id, contract_id, party, title, description, due_date, status)
           VALUES ($1,$2,$3,$4,$5,$6,'pendente') RETURNING *`,
          [id, contractId, party, title, description, due_date]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_obligation_create',$3,'allowed','none')", [session.role, session.identityId || session.role, contractId]); } catch {}
        return json(res, 201, { obligation: ins.rows[0] });
      } catch (e) {
        console.error('obligation create failed', e);
        return json(res, 503, { error: 'obligation_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  // Exclusões
  async function handleExclusions(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_contract_exclusions WHERE contract_id = $1 ORDER BY created_at', [contractId]);
        return json(res, 200, { exclusions: r.rows });
      } catch {
        return json(res, 503, { error: 'exclusions_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 20 * 1024); } catch { return bad(res, 'invalid_json'); }
      const description = sanitizeText(body?.description, 2000);
      const category = sanitizeText(body?.category, 100);
      if (!description) return bad(res, 'invalid_description');
      try {
        const pool = getPool();
        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_contract_exclusions (id, contract_id, description, category) VALUES ($1,$2,$3,$4) RETURNING *`,
          [id, contractId, description, category]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_exclusion_create',$3,'allowed','none')", [session.role, session.identityId || session.role, contractId]); } catch {}
        return json(res, 201, { exclusion: ins.rows[0] });
      } catch {
        return json(res, 503, { error: 'exclusion_create_failed' });
      }
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const id = url.searchParams.get('id');
      if (!id || !isUuid(id)) return bad(res, 'invalid_id');
      try {
        const pool = getPool();
        await pool.query('DELETE FROM crm_contract_exclusions WHERE id = $1 AND contract_id = $2', [id, contractId]);
        return json(res, 200, { removed: true });
      } catch {
        return json(res, 503, { error: 'exclusion_remove_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST, DELETE' });
  }

  // Cronograma
  async function handleSchedule(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_contract_schedule WHERE contract_id = $1 ORDER BY planned_date', [contractId]);
        return json(res, 200, { schedule: r.rows });
      } catch {
        return json(res, 503, { error: 'schedule_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const milestone = sanitizeText(body?.milestone, 200);
      const description = sanitizeText(body?.description, 1000);
      const planned_date = body?.planned_date ? String(body.planned_date).trim() : null;
      const responsible_name = sanitizeText(body?.responsible_name, 120);

      if (!milestone) return bad(res, 'invalid_milestone');
      if (!planned_date || isNaN(Date.parse(planned_date))) return bad(res, 'invalid_planned_date');

      try {
        const pool = getPool();
        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_contract_schedule (id, contract_id, milestone, description, planned_date, status, responsible_name)
           VALUES ($1,$2,$3,$4,$5,'planejado',$6) RETURNING *`,
          [id, contractId, milestone, description, planned_date, responsible_name]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_schedule_create',$3,'allowed','none')", [session.role, session.identityId || session.role, contractId]); } catch {}
        return json(res, 201, { item: ins.rows[0] });
      } catch (e) {
        console.error('schedule create failed', e);
        return json(res, 503, { error: 'schedule_create_failed' });
      }
    }

    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const id = body?.id ? String(body.id).trim() : url.searchParams.get('id');
      if (!id || !isUuid(id)) return bad(res, 'invalid_id');
      const fields = []; const vals = []; let idx = 1;
      if (body?.milestone !== undefined) { const ms = sanitizeText(body.milestone, 200); if (!ms) return bad(res, 'invalid_milestone'); fields.push(`milestone = $${idx++}`); vals.push(ms); }
      if (body?.description !== undefined) { const d = sanitizeText(body.description, 1000); fields.push(`description = $${idx++}`); vals.push(d); }
      if (body?.planned_date !== undefined) { const pd = body.planned_date ? String(body.planned_date).trim() : null; if (pd && isNaN(Date.parse(pd))) return bad(res, 'invalid_planned_date'); fields.push(`planned_date = $${idx++}`); vals.push(pd); }
      if (body?.completed_date !== undefined) { const cd = body.completed_date ? String(body.completed_date).trim() : null; if (cd && isNaN(Date.parse(cd))) return bad(res, 'invalid_completed_date'); fields.push(`completed_date = $${idx++}`); vals.push(cd); }
      if (body?.status !== undefined) { const st = String(body.status).trim().toLowerCase(); if (!['planejado','em_andamento','concluido','atrasado','cancelado'].includes(st)) return bad(res, 'invalid_status'); fields.push(`status = $${idx++}`); vals.push(st); }
      if (body?.responsible_name !== undefined) { const rn = sanitizeText(body.responsible_name, 120); fields.push(`responsible_name = $${idx++}`); vals.push(rn); }
      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`updated_at = NOW()`);
      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_contract_schedule SET ${fields.join(', ')} WHERE id = $${idx} AND contract_id = $${idx+1} RETURNING *`, [...vals, id, contractId]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        return json(res, 200, { item: upd.rows[0] });
      } catch {
        return json(res, 503, { error: 'schedule_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST, PATCH' });
  }

  return { handlePosts, handleSla, handleObligations, handleExclusions, handleSchedule };
}
