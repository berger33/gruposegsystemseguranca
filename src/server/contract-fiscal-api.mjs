export function createContractFiscalApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
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

  const DOSSIER_STATUSES = ['rascunho','em_analise','aprovado','arquivado','cancelado'];
  const MEASUREMENT_STATUSES = ['pendente','aprovado','rejeitado','em_ajuste'];
  const EVIDENCE_TYPES = ['foto','relatorio','indicador','checklist','outro'];

  async function handleDossiers(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const cRes = await pool.query('SELECT id, company_id FROM crm_contracts WHERE id = $1', [contractId]);
        if (!cRes.rows[0]) return json(res, 404, { error: 'contract_not_found' });
        const list = await pool.query('SELECT * FROM crm_contract_fiscal_dossiers WHERE contract_id = $1 ORDER BY period_start DESC NULLS LAST, created_at DESC', [contractId]);
        return json(res, 200, { dossiers: list.rows, note: 'Dossiê de fiscalização contratual com período, responsável e status' });
      } catch (e) {
        console.error('dossiers list failed', e);
        return json(res, 503, { error: 'dossiers_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body;
      try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const title = sanitizeText(body?.title, 200);
      const description = sanitizeText(body?.description, 2000);
      const period_start = body?.period_start ? String(body.period_start).trim() : null;
      const period_end = body?.period_end ? String(body.period_end).trim() : null;
      const responsible_id = body?.responsible_id ? String(body.responsible_id).trim() : null;
      const responsible_name = sanitizeText(body?.responsible_name, 120);

      if (!title) return bad(res, 'invalid_title');
      if (period_start && isNaN(Date.parse(period_start))) return bad(res, 'invalid_period_start');
      if (period_end && isNaN(Date.parse(period_end))) return bad(res, 'invalid_period_end');
      if (period_start && period_end && new Date(period_end) < new Date(period_start)) return bad(res, 'invalid_period_range');
      if (responsible_id && !isUuid(responsible_id)) return bad(res, 'invalid_responsible_id');

      try {
        const pool = getPool();
        const cRes = await pool.query('SELECT id, company_id FROM crm_contracts WHERE id = $1', [contractId]);
        if (!cRes.rows[0]) return json(res, 404, { error: 'contract_not_found' });

        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_contract_fiscal_dossiers (id, contract_id, company_id, title, description, period_start, period_end, status, responsible_id, responsible_name, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'rascunho',$8,$9,$10,$11) RETURNING *`,
          [id, contractId, cRes.rows[0].company_id, title, description, period_start ? new Date(period_start).toISOString().slice(0,10) : null, period_end ? new Date(period_end).toISOString().slice(0,10) : null, responsible_id, responsible_name, session.role, session.identityId || null]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_fiscal_dossier_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 201, { dossier: ins.rows[0], note: 'Dossiê de fiscalização contratual criado' });
      } catch (e) {
        console.error('dossier create failed', e);
        return json(res, 503, { error: 'dossier_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleDossierById(req, res, contractId, dossierId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!isUuid(dossierId)) return bad(res, 'invalid_dossier_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const dRes = await pool.query('SELECT * FROM crm_contract_fiscal_dossiers WHERE id = $1 AND contract_id = $2', [dossierId, contractId]);
        if (!dRes.rows[0]) return json(res, 404, { error: 'not_found' });
        const measurements = await pool.query('SELECT * FROM crm_contract_service_measurements WHERE dossier_id = $1 ORDER BY measurement_date DESC', [dossierId]);
        const evidences = await pool.query('SELECT * FROM crm_contract_quality_evidences WHERE dossier_id = $1 ORDER BY captured_at DESC NULLS LAST', [dossierId]);
        return json(res, 200, { dossier: dRes.rows[0], measurements: measurements.rows, evidences: evidences.rows });
      } catch {
        return json(res, 503, { error: 'dossier_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body;
      try { body = await readJson(req, 20 * 1024); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;
      if (body?.title !== undefined) { const t = sanitizeText(body.title, 200); if (!t) return bad(res, 'invalid_title'); fields.push(`title = $${idx++}`); vals.push(t); }
      if (body?.description !== undefined) { const d = sanitizeText(body.description, 2000); fields.push(`description = $${idx++}`); vals.push(d); }
      if (body?.period_start !== undefined) { const ps = body.period_start ? String(body.period_start).trim() : null; if (ps && isNaN(Date.parse(ps))) return bad(res, 'invalid_period_start'); fields.push(`period_start = $${idx++}`); vals.push(ps ? new Date(ps).toISOString().slice(0,10) : null); }
      if (body?.period_end !== undefined) { const pe = body.period_end ? String(body.period_end).trim() : null; if (pe && isNaN(Date.parse(pe))) return bad(res, 'invalid_period_end'); fields.push(`period_end = $${idx++}`); vals.push(pe ? new Date(pe).toISOString().slice(0,10) : null); }
      if (body?.status !== undefined) { const st = String(body.status).trim().toLowerCase(); if (!DOSSIER_STATUSES.includes(st)) return bad(res, 'invalid_status'); fields.push(`status = $${idx++}`); vals.push(st); }
      if (body?.responsible_id !== undefined) { const rid = body.responsible_id ? String(body.responsible_id).trim() : null; if (rid && !isUuid(rid)) return bad(res, 'invalid_responsible_id'); fields.push(`responsible_id = $${idx++}`); vals.push(rid); }
      if (body?.responsible_name !== undefined) { const rn = sanitizeText(body.responsible_name, 120); fields.push(`responsible_name = $${idx++}`); vals.push(rn); }
      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`updated_at = NOW()`);
      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_contract_fiscal_dossiers SET ${fields.join(', ')} WHERE id = $${idx} AND contract_id = $${idx+1} RETURNING *`, [...vals, dossierId, contractId]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_fiscal_dossier_update',$3,'allowed','none')", [session.role, session.identityId || session.role, dossierId]); } catch {}
        return json(res, 200, { dossier: upd.rows[0] });
      } catch (e) {
        console.error('dossier update failed', e);
        return json(res, 503, { error: 'dossier_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  async function handleMeasurements(req, res, contractId, dossierId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!isUuid(dossierId)) return bad(res, 'invalid_dossier_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const list = await pool.query('SELECT * FROM crm_contract_service_measurements WHERE dossier_id = $1 AND contract_id = $2 ORDER BY measurement_date DESC', [dossierId, contractId]);
        return json(res, 200, { measurements: list.rows, note: 'Medição/aceite de serviços com quantidade, qualidade e evidências' });
      } catch {
        return json(res, 503, { error: 'measurements_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body;
      try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const service_type = sanitizeText(body?.service_type, 100);
      const measurement_date = body?.measurement_date ? String(body.measurement_date).trim() : null;
      const quantity = body?.quantity != null ? Number(body.quantity) : null;
      const quality_score = body?.quality_score != null ? Number(body.quality_score) : null;
      const responsible_id = body?.responsible_id ? String(body.responsible_id).trim() : null;
      const responsible_name = sanitizeText(body?.responsible_name, 120);
      const evidence_file_url = sanitizeText(body?.evidence_file_url, 1000);
      const notes = sanitizeText(body?.notes, 1000);

      if (!service_type) return bad(res, 'invalid_service_type');
      if (!measurement_date || isNaN(Date.parse(measurement_date))) return bad(res, 'invalid_measurement_date_required');
      if (quantity != null && (isNaN(quantity) || quantity < 0)) return bad(res, 'invalid_quantity');
      if (quality_score != null && (isNaN(quality_score) || quality_score < 0 || quality_score > 100)) return bad(res, 'invalid_quality_score_0_100');
      if (responsible_id && !isUuid(responsible_id)) return bad(res, 'invalid_responsible_id');

      try {
        const pool = getPool();
        const dRes = await pool.query('SELECT id FROM crm_contract_fiscal_dossiers WHERE id = $1 AND contract_id = $2', [dossierId, contractId]);
        if (!dRes.rows[0]) return json(res, 404, { error: 'dossier_not_found' });

        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_contract_service_measurements (id, dossier_id, contract_id, service_type, measurement_date, quantity, quality_score, acceptance_status, responsible_id, responsible_name, evidence_file_url, notes, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'pendente',$8,$9,$10,$11,$12,$13) RETURNING *`,
          [id, dossierId, contractId, service_type, new Date(measurement_date).toISOString().slice(0,10), quantity, quality_score, responsible_id, responsible_name, evidence_file_url, notes, session.role, session.identityId || null]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_service_measurement_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 201, { measurement: ins.rows[0], note: 'Medição de serviço criada com aceite pendente e evidência' });
      } catch (e) {
        console.error('measurement create failed', e);
        return json(res, 503, { error: 'measurement_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleMeasurementById(req, res, contractId, measurementId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!isUuid(measurementId)) return bad(res, 'invalid_measurement_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'PATCH') {
      let body;
      try { body = await readJson(req, 20 * 1024); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;
      if (body?.acceptance_status !== undefined) { const st = String(body.acceptance_status).trim().toLowerCase(); if (!MEASUREMENT_STATUSES.includes(st)) return bad(res, 'invalid_acceptance_status'); fields.push(`acceptance_status = $${idx++}`); vals.push(st); }
      if (body?.quality_score !== undefined) { const qs = body.quality_score != null ? Number(body.quality_score) : null; if (qs != null && (isNaN(qs) || qs < 0 || qs > 100)) return bad(res, 'invalid_quality_score'); fields.push(`quality_score = $${idx++}`); vals.push(qs); }
      if (body?.quantity !== undefined) { const q = body.quantity != null ? Number(body.quantity) : null; if (q != null && (isNaN(q) || q < 0)) return bad(res, 'invalid_quantity'); fields.push(`quantity = $${idx++}`); vals.push(q); }
      if (body?.evidence_file_url !== undefined) { const ef = sanitizeText(body.evidence_file_url, 1000); fields.push(`evidence_file_url = $${idx++}`); vals.push(ef); }
      if (body?.notes !== undefined) { const n = sanitizeText(body.notes, 1000); fields.push(`notes = $${idx++}`); vals.push(n); }
      if (body?.responsible_name !== undefined) { const rn = sanitizeText(body.responsible_name, 120); fields.push(`responsible_name = $${idx++}`); vals.push(rn); }
      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`updated_at = NOW()`);
      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_contract_service_measurements SET ${fields.join(', ')} WHERE id = $${idx} AND contract_id = $${idx+1} RETURNING *`, [...vals, measurementId, contractId]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        const act = vals.includes('aprovado') ? 'crm_service_measurement_approve' : 'crm_service_measurement_create';
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,'allowed','none')", [session.role, session.identityId || session.role, act]); } catch {}
        return json(res, 200, { measurement: upd.rows[0], note: 'Medição/aceite atualizado com evidência de qualidade' });
      } catch (e) {
        console.error('measurement update failed', e);
        return json(res, 503, { error: 'measurement_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'PATCH' });
  }

  async function handleEvidences(req, res, contractId, dossierId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!isUuid(dossierId)) return bad(res, 'invalid_dossier_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const list = await pool.query('SELECT * FROM crm_contract_quality_evidences WHERE dossier_id = $1 AND contract_id = $2 ORDER BY captured_at DESC NULLS LAST', [dossierId, contractId]);
        return json(res, 200, { evidences: list.rows, note: 'Evidências de qualidade do dossiê fiscal' });
      } catch {
        return json(res, 503, { error: 'evidences_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body;
      try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const measurement_id = body?.measurement_id ? String(body.measurement_id).trim() : null;
      const evidence_type = body?.evidence_type ? String(body.evidence_type).trim().toLowerCase() : 'outro';
      const title = sanitizeText(body?.title, 200);
      const file_url = sanitizeText(body?.file_url, 1000);
      const storage_key = sanitizeText(body?.storage_key, 200);
      const description = sanitizeText(body?.description, 1000);
      const captured_at = body?.captured_at ? String(body.captured_at).trim() : null;

      if (!title) return bad(res, 'invalid_title');
      if (!EVIDENCE_TYPES.includes(evidence_type)) return bad(res, 'invalid_evidence_type');
      if (measurement_id && !isUuid(measurement_id)) return bad(res, 'invalid_measurement_id');
      if (captured_at && isNaN(Date.parse(captured_at))) return bad(res, 'invalid_captured_at');

      try {
        const pool = getPool();
        const dRes = await pool.query('SELECT id FROM crm_contract_fiscal_dossiers WHERE id = $1 AND contract_id = $2', [dossierId, contractId]);
        if (!dRes.rows[0]) return json(res, 404, { error: 'dossier_not_found' });

        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_contract_quality_evidences (id, dossier_id, measurement_id, contract_id, evidence_type, title, file_url, storage_key, description, captured_at, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [id, dossierId, measurement_id, contractId, evidence_type, title, file_url, storage_key, description, captured_at ? new Date(captured_at).toISOString().slice(0,10) : null, session.role, session.identityId || null]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_quality_evidence_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 201, { evidence: ins.rows[0], note: 'Evidência de qualidade criada para dossiê fiscal' });
      } catch (e) {
        console.error('evidence create failed', e);
        return json(res, 503, { error: 'evidence_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  return { handleDossiers, handleDossierById, handleMeasurements, handleMeasurementById, handleEvidences };
}
