export function createPartnershipApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
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

  // Partners
  async function handlePartners(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      const type = url.searchParams.get('type');
      const status = url.searchParams.get('status');
      const responsibleId = url.searchParams.get('responsibleId') || url.searchParams.get('responsible_id');
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const conds = []; const vals = []; let idx = 1;
      if (type) { conds.push(`type = $${idx++}`); vals.push(type); }
      if (status) { conds.push(`status = $${idx++}`); vals.push(status); }
      if (responsibleId) { if (!isUuid(responsibleId)) return bad(res, 'invalid_responsible_id'); conds.push(`responsible_id = $${idx++}`); vals.push(responsibleId); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      try {
        const pool = getPool();
        const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM crm_partners ${where}`, vals);
        const listRes = await pool.query(`SELECT * FROM crm_partners ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx+1}`, [...vals, limit, offset]);
        return json(res, 200, { total: countRes.rows[0]?.total || 0, partners: listRes.rows, limit, offset });
      } catch {
        return json(res, 503, { error: 'partners_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const display_name = sanitizeText(body?.display_name, 200);
      const type = body?.type ? String(body.type).trim().toLowerCase() : 'parceiro';
      const document_ref = sanitizeText(body?.document_ref, 32);
      const email = body?.email ? String(body.email).trim().toLowerCase().slice(0, 320) : null;
      const phone = sanitizeText(body?.phone, 30);
      const city = sanitizeText(body?.city, 100);
      const state = sanitizeText(body?.state, 2);
      const responsible_id = body?.responsible_id ? String(body.responsible_id).trim() : null;
      const responsible_name = sanitizeText(body?.responsible_name, 120);
      const commission_percent = body?.commission_percent != null ? Number(body.commission_percent) : null;
      const notes = sanitizeText(body?.notes, 2000);
      const origin = sanitizeText(body?.origin, 100);

      if (!display_name) return bad(res, 'invalid_display_name');
      if (!['parceiro','revenda','indicador','fornecedor','outro'].includes(type)) return bad(res, 'invalid_type');
      if (responsible_id && !isUuid(responsible_id)) return bad(res, 'invalid_responsible_id');
      if (commission_percent != null && (isNaN(commission_percent) || commission_percent < 0 || commission_percent > 100)) return bad(res, 'invalid_commission_percent');

      try {
        const pool = getPool();
        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_partners (id, display_name, type, document_ref, email, phone, city, state, status, responsible_id, responsible_name, commission_percent, notes, origin, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ativo',$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
          [id, display_name, type, document_ref, email, phone, city, state, responsible_id, responsible_name, commission_percent, notes, origin, session.role, session.identityId || null]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_partner_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 201, { partner: ins.rows[0] });
      } catch (e) {
        console.error('partner create failed', e);
        return json(res, 503, { error: 'partner_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handlePartnerById(req, res, id) {
    if (!isUuid(id)) return bad(res, 'invalid_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_partners WHERE id = $1', [id]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        // metrics
        const metricsRes = await pool.query('SELECT * FROM crm_partner_metrics WHERE partner_id = $1 ORDER BY period_start DESC LIMIT 12', [id]);
        const referralsRes = await pool.query('SELECT status, COUNT(*)::int AS count, COALESCE(SUM(reward_value),0)::numeric AS total_reward FROM crm_referrals WHERE partner_id = $1 GROUP BY status', [id]);
        return json(res, 200, { partner: r.rows[0], metrics: metricsRes.rows, referralsByStatus: referralsRes.rows });
      } catch {
        return json(res, 503, { error: 'partner_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req, 20 * 1024); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;
      if (body?.display_name !== undefined) { const dn = sanitizeText(body.display_name, 200); if (!dn) return bad(res, 'invalid_display_name'); fields.push(`display_name = $${idx++}`); vals.push(dn); }
      if (body?.type !== undefined) { const t = String(body.type).trim().toLowerCase(); if (!['parceiro','revenda','indicador','fornecedor','outro'].includes(t)) return bad(res, 'invalid_type'); fields.push(`type = $${idx++}`); vals.push(t); }
      if (body?.status !== undefined) { const st = String(body.status).trim().toLowerCase(); if (!['ativo','inativo','suspenso','arquivado'].includes(st)) return bad(res, 'invalid_status'); fields.push(`status = $${idx++}`); vals.push(st); }
      if (body?.responsible_id !== undefined) { const rid = body.responsible_id ? String(body.responsible_id).trim() : null; if (rid && !isUuid(rid)) return bad(res, 'invalid_responsible_id'); fields.push(`responsible_id = $${idx++}`); vals.push(rid); }
      if (body?.responsible_name !== undefined) { const rn = sanitizeText(body.responsible_name, 120); fields.push(`responsible_name = $${idx++}`); vals.push(rn); }
      if (body?.commission_percent !== undefined) { const cp = body.commission_percent != null ? Number(body.commission_percent) : null; if (cp != null && (isNaN(cp) || cp < 0 || cp > 100)) return bad(res, 'invalid_commission_percent'); fields.push(`commission_percent = $${idx++}`); vals.push(cp); }
      if (body?.notes !== undefined) { const n = sanitizeText(body.notes, 2000); fields.push(`notes = $${idx++}`); vals.push(n); }

      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`updated_at = NOW()`);

      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_partners SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, [...vals, id]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_partner_status',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 200, { partner: upd.rows[0] });
      } catch {
        return json(res, 503, { error: 'partner_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  // Referrals
  async function handleReferrals(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      const partnerId = url.searchParams.get('partnerId') || url.searchParams.get('partner_id');
      const status = url.searchParams.get('status');
      const responsibleId = url.searchParams.get('responsibleId') || url.searchParams.get('responsible_id');
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const conds = []; const vals = []; let idx = 1;
      if (partnerId) { if (!isUuid(partnerId)) return bad(res, 'invalid_partner_id'); conds.push(`partner_id = $${idx++}`); vals.push(partnerId); }
      if (status) { conds.push(`status = $${idx++}`); vals.push(status); }
      if (responsibleId) { if (!isUuid(responsibleId)) return bad(res, 'invalid_responsible_id'); conds.push(`responsible_id = $${idx++}`); vals.push(responsibleId); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      try {
        const pool = getPool();
        const countRes = await pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status='convertida')::int AS converted FROM crm_referrals ${where}`, vals);
        const listRes = await pool.query(`SELECT * FROM crm_referrals ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx+1}`, [...vals, limit, offset]);
        return json(res, 200, { total: countRes.rows[0]?.total || 0, converted: countRes.rows[0]?.converted || 0, referrals: listRes.rows, limit, offset });
      } catch {
        return json(res, 503, { error: 'referrals_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const partner_id = body?.partner_id ? String(body.partner_id).trim() : null;
      const referrer_contact_id = body?.referrer_contact_id ? String(body.referrer_contact_id).trim() : null;
      const referrer_company_id = body?.referrer_company_id ? String(body.referrer_company_id).trim() : null;
      const referred_company_id = body?.referred_company_id ? String(body.referred_company_id).trim() : null;
      const referred_contact_id = body?.referred_contact_id ? String(body.referred_contact_id).trim() : null;
      const opportunity_id = body?.opportunity_id ? String(body.opportunity_id).trim() : null;
      const title = sanitizeText(body?.title, 200);
      const description = sanitizeText(body?.description, 2000);
      const reward_type = sanitizeText(body?.reward_type, 100);
      const reward_value = body?.reward_value != null ? Number(body.reward_value) : null;
      const responsible_id = body?.responsible_id ? String(body.responsible_id).trim() : null;
      const responsible_name = sanitizeText(body?.responsible_name, 120);

      if (!title) return bad(res, 'invalid_title');
      if (!partner_id && !referrer_contact_id && !referrer_company_id) return bad(res, 'referrer_required');
      if (partner_id && !isUuid(partner_id)) return bad(res, 'invalid_partner_id');
      if (referrer_contact_id && !isUuid(referrer_contact_id)) return bad(res, 'invalid_referrer_contact_id');
      if (referrer_company_id && !isUuid(referrer_company_id)) return bad(res, 'invalid_referrer_company_id');
      if (referred_company_id && !isUuid(referred_company_id)) return bad(res, 'invalid_referred_company_id');
      if (referred_contact_id && !isUuid(referred_contact_id)) return bad(res, 'invalid_referred_contact_id');
      if (opportunity_id && !isUuid(opportunity_id)) return bad(res, 'invalid_opportunity_id');
      if (responsible_id && !isUuid(responsible_id)) return bad(res, 'invalid_responsible_id');
      if (reward_value != null && (isNaN(reward_value) || reward_value < 0)) return bad(res, 'invalid_reward_value');

      try {
        const pool = getPool();
        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_referrals (id, partner_id, referrer_contact_id, referrer_company_id, referred_company_id, referred_contact_id, opportunity_id, title, description, status, reward_type, reward_value, responsible_id, responsible_name, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendente',$10,$11,$12,$13,$14,$15) RETURNING *`,
          [id, partner_id, referrer_contact_id, referrer_company_id, referred_company_id, referred_contact_id, opportunity_id, title, description, reward_type, reward_value, responsible_id, responsible_name, session.role, session.identityId || null]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_referral_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 201, { referral: ins.rows[0] });
      } catch (e) {
        console.error('referral create failed', e);
        return json(res, 503, { error: 'referral_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleReferralById(req, res, id) {
    if (!isUuid(id)) return bad(res, 'invalid_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_referrals WHERE id = $1', [id]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        return json(res, 200, { referral: r.rows[0] });
      } catch {
        return json(res, 503, { error: 'referral_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req, 20 * 1024); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;
      if (body?.status !== undefined) {
        const st = String(body.status).trim().toLowerCase();
        if (!['pendente','em_contato','qualificada','convertida','rejeitada','expirada'].includes(st)) return bad(res, 'invalid_status');
        fields.push(`status = $${idx++}`); vals.push(st);
        if (st === 'convertida') fields.push(`converted_at = NOW()`);
        if (st === 'rejeitada' && body?.rejection_reason !== undefined) {
          const rr = sanitizeText(body.rejection_reason, 500);
          if (!rr) return bad(res, 'rejection_reason_required');
          fields.push(`rejection_reason = $${idx++}`); vals.push(rr);
        }
      }
      if (body?.opportunity_id !== undefined) { const oid = body.opportunity_id ? String(body.opportunity_id).trim() : null; if (oid && !isUuid(oid)) return bad(res, 'invalid_opportunity_id'); fields.push(`opportunity_id = $${idx++}`); vals.push(oid); }
      if (body?.responsible_id !== undefined) { const rid = body.responsible_id ? String(body.responsible_id).trim() : null; if (rid && !isUuid(rid)) return bad(res, 'invalid_responsible_id'); fields.push(`responsible_id = $${idx++}`); vals.push(rid); }
      if (body?.responsible_name !== undefined) { const rn = sanitizeText(body.responsible_name, 120); fields.push(`responsible_name = $${idx++}`); vals.push(rn); }

      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`updated_at = NOW()`);

      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_referrals SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, [...vals, id]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_referral_status',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 200, { referral: upd.rows[0] });
      } catch {
        return json(res, 503, { error: 'referral_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  // Renewals / Upsell / Recovery
  async function handleRenewals(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      const companyId = url.searchParams.get('companyId') || url.searchParams.get('company_id');
      const type = url.searchParams.get('type');
      const status = url.searchParams.get('status');
      const responsibleId = url.searchParams.get('responsibleId') || url.searchParams.get('responsible_id');
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const conds = []; const vals = []; let idx = 1;
      if (companyId) { if (!isUuid(companyId)) return bad(res, 'invalid_company_id'); conds.push(`company_id = $${idx++}`); vals.push(companyId); }
      if (type) { conds.push(`type = $${idx++}`); vals.push(type); }
      if (status) { conds.push(`status = $${idx++}`); vals.push(status); }
      if (responsibleId) { if (!isUuid(responsibleId)) return bad(res, 'invalid_responsible_id'); conds.push(`responsible_id = $${idx++}`); vals.push(responsibleId); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      try {
        const pool = getPool();
        const countRes = await pool.query(`SELECT COUNT(*)::int AS total, COALESCE(SUM(new_value),0)::numeric AS total_new_value FROM crm_renewals ${where}`, vals);
        const listRes = await pool.query(`SELECT * FROM crm_renewals ${where} ORDER BY renewal_date DESC NULLS LAST, created_at DESC LIMIT $${idx} OFFSET $${idx+1}`, [...vals, limit, offset]);
        return json(res, 200, { total: countRes.rows[0]?.total || 0, total_new_value: countRes.rows[0]?.total_new_value || 0, renewals: listRes.rows, limit, offset });
      } catch {
        return json(res, 503, { error: 'renewals_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const company_id = body?.company_id ? String(body.company_id).trim() : null;
      const contract_id = body?.contract_id ? String(body.contract_id).trim() : null;
      const previous_contract_id = body?.previous_contract_id ? String(body.previous_contract_id).trim() : null;
      const opportunity_id = body?.opportunity_id ? String(body.opportunity_id).trim() : null;
      const type = body?.type ? String(body.type).trim().toLowerCase() : 'renovacao';
      const title = sanitizeText(body?.title, 200);
      const description = sanitizeText(body?.description, 2000);
      const previous_value = body?.previous_value != null ? Number(body.previous_value) : null;
      const new_value = body?.new_value != null ? Number(body.new_value) : null;
      const renewal_date = body?.renewal_date ? String(body.renewal_date).trim() : null;
      const forecast_date = body?.forecast_date ? String(body.forecast_date).trim() : null;
      const responsible_id = body?.responsible_id ? String(body.responsible_id).trim() : null;
      const responsible_name = sanitizeText(body?.responsible_name, 120);
      const metrics = body?.metrics && typeof body.metrics === 'object' ? body.metrics : {};

      if (!company_id || !isUuid(company_id)) return bad(res, 'invalid_company_id');
      if (!title) return bad(res, 'invalid_title');
      if (!['renovacao','upsell','cross_sell','recuperacao'].includes(type)) return bad(res, 'invalid_type');
      if (contract_id && !isUuid(contract_id)) return bad(res, 'invalid_contract_id');
      if (previous_contract_id && !isUuid(previous_contract_id)) return bad(res, 'invalid_previous_contract_id');
      if (opportunity_id && !isUuid(opportunity_id)) return bad(res, 'invalid_opportunity_id');
      if (responsible_id && !isUuid(responsible_id)) return bad(res, 'invalid_responsible_id');
      if (previous_value != null && (isNaN(previous_value) || previous_value < 0)) return bad(res, 'invalid_previous_value');
      if (new_value != null && (isNaN(new_value) || new_value < 0)) return bad(res, 'invalid_new_value');
      if (renewal_date && isNaN(Date.parse(renewal_date))) return bad(res, 'invalid_renewal_date');
      if (forecast_date && isNaN(Date.parse(forecast_date))) return bad(res, 'invalid_forecast_date');

      const uplift = previous_value != null && new_value != null && previous_value > 0 ? Number(((new_value - previous_value) / previous_value * 100).toFixed(2)) : null;

      try {
        const pool = getPool();
        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_renewals (id, company_id, contract_id, previous_contract_id, opportunity_id, type, title, description, previous_value, new_value, uplift_percent, renewal_date, forecast_date, status, responsible_id, responsible_name, metrics, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'planejada',$14,$15,$16::jsonb,$17,$18) RETURNING *`,
          [id, company_id, contract_id, previous_contract_id, opportunity_id, type, title, description, previous_value, new_value, uplift, renewal_date, forecast_date, responsible_id, responsible_name, JSON.stringify(metrics), session.role, session.identityId || null]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_renewal_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 201, { renewal: ins.rows[0] });
      } catch (e) {
        console.error('renewal create failed', e);
        return json(res, 503, { error: 'renewal_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleRenewalById(req, res, id) {
    if (!isUuid(id)) return bad(res, 'invalid_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_renewals WHERE id = $1', [id]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        return json(res, 200, { renewal: r.rows[0] });
      } catch {
        return json(res, 503, { error: 'renewal_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;

      if (body?.title !== undefined) { const t = sanitizeText(body.title, 200); if (!t) return bad(res, 'invalid_title'); fields.push(`title = $${idx++}`); vals.push(t); }
      if (body?.description !== undefined) { const d = sanitizeText(body.description, 2000); fields.push(`description = $${idx++}`); vals.push(d); }
      if (body?.new_value !== undefined) { const nv = body.new_value != null ? Number(body.new_value) : null; if (nv != null && (isNaN(nv) || nv < 0)) return bad(res, 'invalid_new_value'); fields.push(`new_value = $${idx++}`); vals.push(nv); }
      if (body?.renewal_date !== undefined) { const rd = body.renewal_date ? String(body.renewal_date).trim() : null; if (rd && isNaN(Date.parse(rd))) return bad(res, 'invalid_renewal_date'); fields.push(`renewal_date = $${idx++}`); vals.push(rd); }
      if (body?.forecast_date !== undefined) { const fd = body.forecast_date ? String(body.forecast_date).trim() : null; if (fd && isNaN(Date.parse(fd))) return bad(res, 'invalid_forecast_date'); fields.push(`forecast_date = $${idx++}`); vals.push(fd); }
      if (body?.status !== undefined) {
        const st = String(body.status).trim().toLowerCase();
        if (!['planejada','em_negociacao','proposta_enviada','ganha','perdida','cancelada'].includes(st)) return bad(res, 'invalid_status');
        fields.push(`status = $${idx++}`); vals.push(st);
        if (st === 'perdida' && body?.loss_reason !== undefined) {
          const lr = sanitizeText(body.loss_reason, 500);
          if (!lr) return bad(res, 'loss_reason_required');
          fields.push(`loss_reason = $${idx++}`); vals.push(lr);
        }
      }
      if (body?.responsible_id !== undefined) { const rid = body.responsible_id ? String(body.responsible_id).trim() : null; if (rid && !isUuid(rid)) return bad(res, 'invalid_responsible_id'); fields.push(`responsible_id = $${idx++}`); vals.push(rid); }
      if (body?.responsible_name !== undefined) { const rn = sanitizeText(body.responsible_name, 120); fields.push(`responsible_name = $${idx++}`); vals.push(rn); }
      if (body?.metrics !== undefined) {
        if (typeof body.metrics !== 'object') return bad(res, 'invalid_metrics');
        fields.push(`metrics = $${idx++}::jsonb`); vals.push(JSON.stringify(body.metrics));
      }

      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`updated_at = NOW()`);

      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_renewals SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, [...vals, id]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_renewal_status',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 200, { renewal: upd.rows[0] });
      } catch {
        return json(res, 503, { error: 'renewal_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  async function handleMetrics(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });

    const responsibleId = url.searchParams.get('responsibleId') || url.searchParams.get('responsible_id');
    const periodStart = url.searchParams.get('periodStart') || url.searchParams.get('start');
    const periodEnd = url.searchParams.get('periodEnd') || url.searchParams.get('end');

    try {
      const pool = getPool();
      const conds = []; const vals = []; let idx = 1;
      if (responsibleId) { if (!isUuid(responsibleId)) return bad(res, 'invalid_responsible_id'); conds.push(`responsible_id = $${idx++}`); vals.push(responsibleId); }
      if (periodStart) { conds.push(`renewal_date >= $${idx++}::date`); vals.push(periodStart); }
      if (periodEnd) { conds.push(`renewal_date <= $${idx++}::date`); vals.push(periodEnd); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

      const renewalRes = await pool.query(`SELECT type, status, COUNT(*)::int AS count, COALESCE(SUM(new_value),0)::numeric AS total_value FROM crm_renewals ${where} GROUP BY type, status`, vals);
      const referralRes = await pool.query(`SELECT status, COUNT(*)::int AS count FROM crm_referrals ${where ? where.replace('renewal_date', 'created_at') : ''} GROUP BY status`, vals.slice(0, responsibleId ? 1 : 0));
      const partnerRes = await pool.query(`SELECT COUNT(*)::int AS total_partners, COUNT(*) FILTER (WHERE status='ativo')::int AS active_partners FROM crm_partners`);

      return json(res, 200, {
        renewalsByTypeStatus: renewalRes.rows,
        referralsByStatus: referralRes.rows,
        partners: partnerRes.rows[0],
        note: 'Métricas por responsável: renovação/upsell/recuperação carteira, parcerias e indicações com conversão.',
      });
    } catch (e) {
      console.error('metrics failed', e);
      return json(res, 503, { error: 'metrics_unavailable' });
    }
  }

  return {
    handlePartners,
    handlePartnerById,
    handleReferrals,
    handleReferralById,
    handleRenewals,
    handleRenewalById,
    handleMetrics,
  };
}
