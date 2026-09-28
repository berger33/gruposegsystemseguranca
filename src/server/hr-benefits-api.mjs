export function createHrBenefitsApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  function json(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  }
  async function readJson(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
  }
  async function checkAuth(req, res) {
    if (sameOrigin && !sameOrigin(req)) { json(res, 403, { error: 'forbidden_origin' }); return null; }
    const sess = await requireSession(req);
    if (!sess) { json(res, 401, { error: 'unauthorized' }); return null; }
    if (!requireRole(sess, ['admin','ti','rh'])) { json(res, 403, { error: 'forbidden_role' }); return null; }
    return sess;
  }
  function isUuid(v) { return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); }
  function validCompetence(c) { return typeof c === 'string' && /^\d{4}-\d{2}$/.test(c); }

  async function handleBenefitCatalog(req, res) {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const type = url.searchParams.get('type');
      const status = url.searchParams.get('status');
      const where = []; const params = []; let i = 1;
      if (type) { where.push(`type = $${i++}`); params.push(type); }
      if (status) { where.push(`approval_status = $${i++}`); params.push(status); }
      const sql = `SELECT * FROM hr_benefit_catalog ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name, version DESC LIMIT 200`;
      const r = await pool.query(sql, params);
      return json(res, 200, { benefits: r.rows, note: 'HR-13 benefícios elegibilidade versionado' });
    }
    if (req.method === 'POST') {
      const b = await readJson(req);
      if (!b.name || b.name.length < 3 || b.name.length > 200) return json(res, 400, { error: 'invalid_name' });
      if (!b.type) return json(res, 400, { error: 'type_required' });
      if (!b.validity_start) return json(res, 400, { error: 'validity_start_required' });
      if (b.validity_end && new Date(b.validity_end) <= new Date(b.validity_start)) return json(res, 400, { error: 'invalid_validity' });
      if (b.rules && typeof b.rules !== 'object') return json(res, 400, { error: 'eligibility_rules must be object' });
      // version auto increment by name
      const maxV = await pool.query(`SELECT COALESCE(MAX(version),0) as max FROM hr_benefit_catalog WHERE name=$1`, [b.name]);
      const version = (maxV.rows[0].max || 0) + 1;
      const r = await pool.query(
        `INSERT INTO hr_benefit_catalog (name, type, description, provider_name, provider_contact, cost, eligibility_rules, validity_start, validity_end, version, approval_status, created_by, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'rascunho',$11,$12) RETURNING *`,
        [b.name, b.type, b.description || null, b.provider_name || null, b.provider_contact || null, b.cost || 0, JSON.stringify(b.eligibility_rules || b.rules || {}), b.validity_start, b.validity_end || null, version, sess.identityId || sess.id, sess.identityId || sess.id]
      );
      await auditLog({ action: 'hr_benefit_create', actor: sess.identityId || sess.id, target: r.rows[0].id, meta: { name: b.name, version } });
      return json(res, 201, { benefit: r.rows[0] });
    }
    if (req.method === 'PATCH') {
      const b = await readJson(req);
      if (!isUuid(b.id)) return json(res, 400, { error: 'invalid_id' });
      const allowed = ['rascunho','em_revisao','aprovado','arquivado','rejeitado'];
      if (!allowed.includes(b.status)) return json(res, 400, { error: 'invalid_status' });
      if (b.status === 'rejeitado' && (!b.rejection_reason || b.rejection_reason.length < 5)) return json(res, 400, { error: 'rejection_reason_required' });
      const upd = await pool.query(
        `UPDATE hr_benefit_catalog SET approval_status=$2, approved_by=CASE WHEN $2='aprovado' THEN $3 ELSE approved_by END, approved_at=CASE WHEN $2='aprovado' THEN NOW() ELSE approved_at END, rejection_reason=$4, updated_at=NOW() WHERE id=$1 RETURNING *`,
        [b.id, b.status, sess.identityId || sess.id, b.rejection_reason || null]
      );
      if (!upd.rows.length) return json(res, 404, { error: 'not_found' });
      await auditLog({ action: 'hr_benefit_create', actor: sess.identityId || sess.id, target: b.id, meta: { status: b.status } });
      return json(res, 200, { benefit: upd.rows[0] });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }

  async function handleBenefitEnrollments(req, res) {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const employee_id = url.searchParams.get('employee_id');
      const benefit_id = url.searchParams.get('benefit_id');
      const competence = url.searchParams.get('competence');
      const where = []; const params = []; let i = 1;
      if (employee_id) { if (!isUuid(employee_id)) return json(res, 400, { error: 'invalid_employee_id' }); where.push(`employee_id=$${i++}`); params.push(employee_id); }
      if (benefit_id) { if (!isUuid(benefit_id)) return json(res, 400, { error: 'invalid_benefit_id' }); where.push(`benefit_id=$${i++}`); params.push(benefit_id); }
      if (competence) { if (!validCompetence(competence)) return json(res, 400, { error: 'invalid_competence' }); where.push(`competence=$${i++}`); params.push(competence); }
      const sql = `SELECT be.*, e.display_name as employee_name, bc.name as benefit_name FROM hr_benefit_enrollments be LEFT JOIN hr_employees e ON e.id=be.employee_id LEFT JOIN hr_benefit_catalog bc ON bc.id=be.benefit_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY be.competence DESC, be.created_at DESC LIMIT 200`;
      const r = await pool.query(sql, params);
      return json(res, 200, { enrollments: r.rows });
    }
    if (req.method === 'POST') {
      const b = await readJson(req);
      if (!isUuid(b.employee_id)) return json(res, 400, { error: 'invalid_employee_id' });
      if (!isUuid(b.benefit_id)) return json(res, 400, { error: 'invalid_benefit_id' });
      if (!validCompetence(b.competence)) return json(res, 400, { error: 'invalid_competence' });
      if (!b.enrollment_date) return json(res, 400, { error: 'enrollment_date_required' });
      const emp = await pool.query(`SELECT id FROM hr_employees WHERE id=$1`, [b.employee_id]);
      if (!emp.rows.length) return json(res, 404, { error: 'employee_not_found' });
      const ben = await pool.query(`SELECT id, approval_status, version FROM hr_benefit_catalog WHERE id=$1`, [b.benefit_id]);
      if (!ben.rows.length) return json(res, 404, { error: 'benefit_not_found' });
      if (ben.rows[0].approval_status !== 'aprovado') return json(res, 409, { error: 'benefit_not_approved', detail: 'Benefício deve estar aprovado' });
      try {
        const r = await pool.query(
          `INSERT INTO hr_benefit_enrollments (employee_id, benefit_id, competence, enrollment_date, termination_date, status, is_eligible, eligibility_details, benefit_version, notes, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [b.employee_id, b.benefit_id, b.competence, b.enrollment_date, b.termination_date || null, b.status || 'ativo', b.is_eligible !== false, JSON.stringify(b.eligibility_details || {}), ben.rows[0].version, b.notes || null, sess.identityId || sess.id, sess.identityId || sess.id]
        );
        await auditLog({ action: 'hr_benefit_create', actor: sess.identityId || sess.id, target: r.rows[0].id, meta: { employee_id: b.employee_id, benefit_id: b.benefit_id, competence: b.competence } });
        return json(res, 201, { enrollment: r.rows[0] });
      } catch (e) {
        if (e.code === '23505') return json(res, 409, { error: 'duplicate_enrollment', detail: 'Já existe matrícula para employee+benefit+competence' });
        throw e;
      }
    }
    if (req.method === 'PATCH') {
      const b = await readJson(req);
      if (!isUuid(b.id)) return json(res, 400, { error: 'invalid_id' });
      const allowed = ['solicitado','em_analise','aprovado','rejeitado','ativo','inativo','suspenso','cancelado','pendente'];
      if (b.status && !allowed.includes(b.status)) return json(res, 400, { error: 'invalid_status' });
      const upd = await pool.query(
        `UPDATE hr_benefit_enrollments SET status=COALESCE($2,status), termination_date=COALESCE($3,termination_date), notes=COALESCE($4,notes), approved_by=CASE WHEN $2 IN ('aprovado','ativo') THEN $5 ELSE approved_by END, approved_at=CASE WHEN $2 IN ('aprovado','ativo') THEN NOW() ELSE approved_at END, rejection_reason=COALESCE($6,rejection_reason), updated_at=NOW() WHERE id=$1 RETURNING *`,
        [b.id, b.status || null, b.termination_date || null, b.notes || null, sess.identityId || sess.id, b.rejection_reason || null]
      );
      if (!upd.rows.length) return json(res, 404, { error: 'not_found' });
      return json(res, 200, { enrollment: upd.rows[0] });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }

  async function handleBenefitRequests(req, res) {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const employee_id = url.searchParams.get('employee_id');
      const benefit_id = url.searchParams.get('benefit_id');
      const status = url.searchParams.get('status');
      const where = []; const params = []; let i = 1;
      if (employee_id) { where.push(`employee_id=$${i++}`); params.push(employee_id); }
      if (benefit_id) { where.push(`benefit_id=$${i++}`); params.push(benefit_id); }
      if (status) { where.push(`status=$${i++}`); params.push(status); }
      const sql = `SELECT * FROM hr_benefit_requests ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 200`;
      const r = await pool.query(sql, params);
      return json(res, 200, { requests: r.rows });
    }
    if (req.method === 'POST') {
      const b = await readJson(req);
      if (!isUuid(b.employee_id) || !isUuid(b.benefit_id)) return json(res, 400, { error: 'invalid_employee_or_benefit' });
      if (!b.request_type) return json(res, 400, { error: 'request_type_required' });
      if (!b.reason || b.reason.length < 10) return json(res, 400, { error: 'reason_min10' });
      if (b.competence && !validCompetence(b.competence)) return json(res, 400, { error: 'invalid_competence' });
      const emp = await pool.query(`SELECT id FROM hr_employees WHERE id=$1`, [b.employee_id]);
      if (!emp.rows.length) return json(res, 404, { error: 'employee_not_found' });
      const r = await pool.query(
        `INSERT INTO hr_benefit_requests (employee_id, benefit_id, request_type, competence, requested_data, reason, status, created_by, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,'solicitado',$7,$8) RETURNING *`,
        [b.employee_id, b.benefit_id, b.request_type, b.competence || null, JSON.stringify(b.requested_data || {}), b.reason, sess.identityId || sess.id, sess.identityId || sess.id]
      );
      await auditLog({ action: 'hr_benefit_request', actor: sess.identityId || sess.id, target: r.rows[0].id, meta: { employee_id: b.employee_id, benefit_id: b.benefit_id, type: b.request_type } });
      return json(res, 201, { request: r.rows[0] });
    }
    if (req.method === 'PATCH') {
      const b = await readJson(req);
      if (!isUuid(b.id)) return json(res, 400, { error: 'invalid_id' });
      if (b.status === 'rejeitado' && (!b.rejection_reason || b.rejection_reason.length < 5)) return json(res, 400, { error: 'rejection_reason_required' });
      const upd = await pool.query(
        `UPDATE hr_benefit_requests SET status=COALESCE($2,status), approved_by=CASE WHEN $2 IN ('aprovado','ativo') THEN $3 ELSE approved_by END, approved_at=CASE WHEN $2 IN ('aprovado','ativo') THEN NOW() ELSE approved_at END, rejection_reason=COALESCE($4,rejection_reason), updated_at=NOW() WHERE id=$1 RETURNING *`,
        [b.id, b.status || null, sess.identityId || sess.id, b.rejection_reason || null]
      );
      if (!upd.rows.length) return json(res, 404, { error: 'not_found' });
      return json(res, 200, { request: upd.rows[0] });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }

  async function handleBenefitConferences(req, res) {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const r = await pool.query(`SELECT * FROM hr_benefit_conferences ORDER BY competence DESC LIMIT 100`);
      return json(res, 200, { conferences: r.rows });
    }
    if (req.method === 'POST') {
      const b = await readJson(req);
      if (!validCompetence(b.competence)) return json(res, 400, { error: 'invalid_competence' });
      const benefitId = b.benefit_id && isUuid(b.benefit_id) ? b.benefit_id : null;
      // calcula totais
      const enrollQ = benefitId ? `SELECT COUNT(*) as total FROM hr_benefit_enrollments WHERE competence=$1 AND benefit_id=$2` : `SELECT COUNT(*) as total FROM hr_benefit_enrollments WHERE competence=$1`;
      const enrollP = benefitId ? [b.competence, benefitId] : [b.competence];
      const enrollR = await pool.query(enrollQ, enrollP);
      const reqQ = benefitId ? `SELECT COUNT(*) as total FROM hr_benefit_requests WHERE competence=$1 AND benefit_id=$2` : `SELECT COUNT(*) as total FROM hr_benefit_requests WHERE competence=$1`;
      const reqR = await pool.query(reqQ, enrollP);
      const totalEnroll = parseInt(enrollR.rows[0].total, 10) || 0;
      const totalReq = parseInt(reqR.rows[0].total, 10) || 0;
      const diverg = Math.abs(totalEnroll - totalReq);
      const r = await pool.query(
        `INSERT INTO hr_benefit_conferences (competence, benefit_id, status, total_enrollments, total_requests, divergences_count, conference_data, notes, created_by, created_by_id)
         VALUES ($1,$2,'aberto',$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (competence, benefit_id) DO UPDATE SET total_enrollments=$3, total_requests=$4, divergences_count=$5, conference_data=$6, notes=COALESCE($7, hr_benefit_conferences.notes), updated_at=NOW()
         RETURNING *`,
        [b.competence, benefitId, totalEnroll, totalReq, diverg, JSON.stringify(b.conference_data || {}), b.notes || null, sess.identityId || sess.id, sess.identityId || sess.id]
      );
      await auditLog({ action: 'hr_benefit_conference', actor: sess.identityId || sess.id, target: r.rows[0].id, meta: { competence: b.competence, totalEnroll, totalReq, diverg } });
      return json(res, 201, { conference: r.rows[0] });
    }
    if (req.method === 'PATCH') {
      const b = await readJson(req);
      if (!isUuid(b.id)) return json(res, 400, { error: 'invalid_id' });
      const allowed = ['aberto','em_conferencia','conferido','com_divergencia','fechado','cancelado'];
      if (b.status && !allowed.includes(b.status)) return json(res, 400, { error: 'invalid_status' });
      const upd = await pool.query(
        `UPDATE hr_benefit_conferences SET status=COALESCE($2,status), notes=COALESCE($3,notes), closed_by=CASE WHEN $2='fechado' THEN $4 ELSE closed_by END, closed_at=CASE WHEN $2='fechado' THEN NOW() ELSE closed_at END, updated_at=NOW() WHERE id=$1 RETURNING *`,
        [b.id, b.status || null, b.notes || null, sess.identityId || sess.id]
      );
      if (!upd.rows.length) return json(res, 404, { error: 'not_found' });
      return json(res, 200, { conference: upd.rows[0] });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }

  async function handleBenefitExports(req, res) {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const r = await pool.query(`SELECT * FROM hr_benefit_exports ORDER BY created_at DESC LIMIT 200`);
      return json(res, 200, { exports: r.rows, note: 'exportação ao fornecedor' });
    }
    if (req.method === 'POST') {
      const b = await readJson(req);
      if (!validCompetence(b.competence)) return json(res, 400, { error: 'invalid_competence' });
      if (b.conference_id && !isUuid(b.conference_id)) return json(res, 400, { error: 'invalid_conference_id' });
      if (b.benefit_id && !isUuid(b.benefit_id)) return json(res, 400, { error: 'invalid_benefit_id' });
      const r = await pool.query(
        `INSERT INTO hr_benefit_exports (conference_id, benefit_id, competence, provider_name, export_type, file_url, storage_key, status, created_by, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pendente',$8,$9) RETURNING *`,
        [b.conference_id || null, b.benefit_id || null, b.competence, b.provider_name || null, b.export_type || 'adesao', b.file_url || null, b.storage_key || null, sess.identityId || sess.id, sess.identityId || sess.id]
      );
      await auditLog({ action: 'hr_benefit_export', actor: sess.identityId || sess.id, target: r.rows[0].id, meta: { competence: b.competence, provider: b.provider_name } });
      return json(res, 201, { export: r.rows[0] });
    }
    if (req.method === 'PATCH') {
      const b = await readJson(req);
      if (!isUuid(b.id)) return json(res, 400, { error: 'invalid_id' });
      const allowed = ['pendente','gerado','enviado','confirmado','falhou','cancelado'];
      if (b.status && !allowed.includes(b.status)) return json(res, 400, { error: 'invalid_status' });
      const upd = await pool.query(
        `UPDATE hr_benefit_exports SET status=COALESCE($2,status), file_url=COALESCE($3,file_url), protocol_number=COALESCE($4,protocol_number), sent_at=CASE WHEN $2='enviado' THEN NOW() ELSE sent_at END, confirmed_at=CASE WHEN $2='confirmado' THEN NOW() ELSE confirmed_at END, error_details=COALESCE($5,error_details), updated_at=NOW() WHERE id=$1 RETURNING *`,
        [b.id, b.status || null, b.file_url || null, b.protocol_number || null, b.error_details || null]
      );
      if (!upd.rows.length) return json(res, 404, { error: 'not_found' });
      return json(res, 200, { export: upd.rows[0] });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }

  // HR-14
  async function handleAdvancePolicies(req, res) {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const r = await pool.query(`SELECT * FROM hr_advance_policies ORDER BY name, version DESC LIMIT 200`);
      return json(res, 200, { policies: r.rows });
    }
    if (req.method === 'POST') {
      const b = await readJson(req);
      if (!b.name || b.name.length < 3) return json(res, 400, { error: 'invalid_name' });
      if (!b.type) return json(res, 400, { error: 'type_required' });
      const maxV = await pool.query(`SELECT COALESCE(MAX(version),0) as max FROM hr_advance_policies WHERE name=$1`, [b.name]);
      const version = (maxV.rows[0].max || 0) + 1;
      const r = await pool.query(
        `INSERT INTO hr_advance_policies (name, type, description, min_amount, max_amount, requires_approval, approver_role, max_installments, version, approval_status, created_by, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'rascunho',$10,$11) RETURNING *`,
        [b.name, b.type, b.description || null, b.min_amount || 0, b.max_amount || 10000, b.requires_approval !== false, b.approver_role || 'rh', b.max_installments || 1, version, sess.identityId || sess.id, sess.identityId || sess.id]
      );
      await auditLog({ action: 'hr_advance_approve', actor: sess.identityId || sess.id, target: r.rows[0].id, meta: { name: b.name, version } });
      return json(res, 201, { policy: r.rows[0] });
    }
    if (req.method === 'PATCH') {
      const b = await readJson(req);
      if (!isUuid(b.id)) return json(res, 400, { error: 'invalid_id' });
      const allowed = ['rascunho','em_revisao','aprovado','arquivado','rejeitado'];
      if (b.status && !allowed.includes(b.status)) return json(res, 400, { error: 'invalid_status' });
      if (b.status === 'rejeitado' && (!b.rejection_reason || b.rejection_reason.length < 5)) return json(res, 400, { error: 'rejection_reason_required' });
      const upd = await pool.query(
        `UPDATE hr_advance_policies SET approval_status=COALESCE($2,approval_status), approved_by=CASE WHEN $2='aprovado' THEN $3 ELSE approved_by END, approved_at=CASE WHEN $2='aprovado' THEN NOW() ELSE approved_at END, rejection_reason=COALESCE($4,rejection_reason), updated_at=NOW() WHERE id=$1 RETURNING *`,
        [b.id, b.status || null, sess.identityId || sess.id, b.rejection_reason || null]
      );
      if (!upd.rows.length) return json(res, 404, { error: 'not_found' });
      return json(res, 200, { policy: upd.rows[0] });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }

  async function handleAdvanceRequests(req, res) {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const employee_id = url.searchParams.get('employee_id');
      const type = url.searchParams.get('type');
      const status = url.searchParams.get('status');
      const competence = url.searchParams.get('competence');
      const where = []; const params = []; let i = 1;
      if (employee_id) { where.push(`employee_id=$${i++}`); params.push(employee_id); }
      if (type) { where.push(`type=$${i++}`); params.push(type); }
      if (status) { where.push(`status=$${i++}`); params.push(status); }
      if (competence) { where.push(`competence=$${i++}`); params.push(competence); }
      const sql = `SELECT ar.*, e.display_name as employee_name FROM hr_advance_requests ar LEFT JOIN hr_employees e ON e.id=ar.employee_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ar.created_at DESC LIMIT 200`;
      const r = await pool.query(sql, params);
      return json(res, 200, { requests: r.rows, note: 'HR-14 adiantamentos/reembolsos alçada comprovantes integração financeiro prevenção duplicidade' });
    }
    if (req.method === 'POST') {
      const b = await readJson(req);
      if (!isUuid(b.employee_id)) return json(res, 400, { error: 'invalid_employee_id' });
      if (!b.type) return json(res, 400, { error: 'type_required' });
      if (!validCompetence(b.competence)) return json(res, 400, { error: 'invalid_competence' });
      if (!b.amount || isNaN(parseFloat(b.amount)) || parseFloat(b.amount) <= 0) return json(res, 400, { error: 'invalid_amount' });
      if (!b.reason || b.reason.length < 10) return json(res, 400, { error: 'reason_min10' });
      if (b.type.startsWith('reembolso') && !b.receipt_url) return json(res, 400, { error: 'receipt_required_for_reembolso', detail: 'Comprovante obrigatório para reembolso' });
      const emp = await pool.query(`SELECT id FROM hr_employees WHERE id=$1`, [b.employee_id]);
      if (!emp.rows.length) return json(res, 404, { error: 'employee_not_found' });
      // check policy approved
      let policy = null;
      if (b.policy_id) {
        if (!isUuid(b.policy_id)) return json(res, 400, { error: 'invalid_policy_id' });
        const p = await pool.query(`SELECT * FROM hr_advance_policies WHERE id=$1`, [b.policy_id]);
        if (!p.rows.length) return json(res, 404, { error: 'policy_not_found' });
        if (p.rows[0].approval_status !== 'aprovado') return json(res, 409, { error: 'policy_not_approved' });
        if (parseFloat(b.amount) < parseFloat(p.rows[0].min_amount) || parseFloat(b.amount) > parseFloat(p.rows[0].max_amount)) return json(res, 400, { error: 'amount_out_of_policy', detail: `Fora da alçada ${p.rows[0].min_amount}-${p.rows[0].max_amount}` });
        policy = p.rows[0];
      }
      // prevenção duplicidade: verifica se existe mesmo employee, competence, type, amount nos últimos 30 dias com status não cancelado/rejeitado/estornado
      const dup = await pool.query(
        `SELECT id FROM hr_advance_requests WHERE employee_id=$1 AND competence=$2 AND type=$3 AND amount=$4 AND status NOT IN ('cancelado','rejeitado','estornado') AND created_at > NOW() - INTERVAL '30 days' LIMIT 1`,
        [b.employee_id, b.competence, b.type, b.amount]
      );
      if (dup.rows.length) return json(res, 409, { error: 'duplicate_advance', detail: 'Adiantamento/reembolso duplicado mesma competência/tipo/valor nos últimos 30 dias', duplicate_id: dup.rows[0].id });
      try {
        const r = await pool.query(
          `INSERT INTO hr_advance_requests (employee_id, type, competence, amount, installments, reason, receipt_url, storage_key, status, financial_status, policy_id, policy_version, notes, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'solicitado','pendente',$9,$10,$11,$12,$13) RETURNING *`,
          [b.employee_id, b.type, b.competence, b.amount, b.installments || 1, b.reason, b.receipt_url || null, b.storage_key || null, policy ? policy.id : null, policy ? policy.version : null, b.notes || null, sess.identityId || sess.id, sess.identityId || sess.id]
        );
        await auditLog({ action: 'hr_advance_request', actor: sess.identityId || sess.id, target: r.rows[0].id, meta: { employee_id: b.employee_id, type: b.type, amount: b.amount, competence: b.competence } });
        return json(res, 201, { request: r.rows[0] });
      } catch (e) {
        if (e.code === '23505') return json(res, 409, { error: 'duplicate_advance_unique', detail: 'Duplicidade detectada unique constraint' });
        throw e;
      }
    }
    if (req.method === 'PATCH') {
      const b = await readJson(req);
      if (!isUuid(b.id)) return json(res, 400, { error: 'invalid_id' });
      const allowed = ['solicitado','em_analise','aprovado','rejeitado','pago','cancelado','estornado','pendente'];
      if (b.status && !allowed.includes(b.status)) return json(res, 400, { error: 'invalid_status' });
      if (b.status === 'rejeitado' && (!b.rejection_reason || b.rejection_reason.length < 5)) return json(res, 400, { error: 'rejection_reason_required' });
      if (b.status === 'pago' && !b.paid_amount) return json(res, 400, { error: 'paid_amount_required' });
      // financial integration
      let finStatus = null;
      if (b.financial_status) {
        const allowedFin = ['pendente','enviado','falha','confirmado','estornado','nao_aplicavel'];
        if (!allowedFin.includes(b.financial_status)) return json(res, 400, { error: 'invalid_financial_status' });
        finStatus = b.financial_status;
      }
      const upd = await pool.query(
        `UPDATE hr_advance_requests SET status=COALESCE($2,status), approved_by=CASE WHEN $2 IN ('aprovado','pago') THEN $3 ELSE approved_by END, approved_at=CASE WHEN $2 IN ('aprovado','pago') THEN NOW() ELSE approved_at END, rejection_reason=COALESCE($4,rejection_reason), financial_status=COALESCE($5,financial_status), financial_integration_id=COALESCE($6,financial_integration_id), financial_protocol=COALESCE($7,financial_protocol), paid_at=CASE WHEN $2='pago' THEN NOW() ELSE paid_at END, paid_amount=COALESCE($8,paid_amount), notes=COALESCE($9,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,
        [b.id, b.status || null, sess.identityId || sess.id, b.rejection_reason || null, finStatus, b.financial_integration_id || null, b.financial_protocol || null, b.paid_amount || null, b.notes || null]
      );
      if (!upd.rows.length) return json(res, 404, { error: 'not_found' });
      if (b.status === 'aprovado') await auditLog({ action: 'hr_advance_approve', actor: sess.identityId || sess.id, target: b.id, meta: { amount: upd.rows[0].amount } });
      if (b.status === 'pago') await auditLog({ action: 'hr_advance_pay', actor: sess.identityId || sess.id, target: b.id, meta: { paid_amount: b.paid_amount } });
      return json(res, 200, { request: upd.rows[0] });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }

  // HR-15
  async function handleOccupationalRequirements(req, res) {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const cargo = url.searchParams.get('cargo');
      const exam_type = url.searchParams.get('exam_type');
      const where = []; const params = []; let i = 1;
      if (cargo) { where.push(`cargo=$${i++}`); params.push(cargo); }
      if (exam_type) { where.push(`exam_type=$${i++}`); params.push(exam_type); }
      const sql = `SELECT * FROM hr_occupational_requirements ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY cargo, exam_type LIMIT 200`;
      const r = await pool.query(sql, params);
      return json(res, 200, { requirements: r.rows });
    }
    if (req.method === 'POST') {
      const b = await readJson(req);
      if (!b.cargo || b.cargo.length < 2) return json(res, 400, { error: 'cargo_required' });
      if (!b.exam_type) return json(res, 400, { error: 'exam_type_required' });
      if (!b.validity_days || b.validity_days < 1 || b.validity_days > 1825) return json(res, 400, { error: 'invalid_validity_days' });
      try {
        const r = await pool.query(
          `INSERT INTO hr_occupational_requirements (cargo, exam_type, description, validity_days, is_required, applicable_employment_types)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [b.cargo, b.exam_type, b.description || null, b.validity_days, b.is_required !== false, b.applicable_employment_types || ['clt']]
        );
        return json(res, 201, { requirement: r.rows[0] });
      } catch (e) {
        if (e.code === '23505') return json(res, 409, { error: 'duplicate_requirement', detail: 'Requisito já existe para cargo+exam_type' });
        throw e;
      }
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }

  async function handleOccupationalAgenda(req, res) {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const employee_id = url.searchParams.get('employee_id');
      const exam_type = url.searchParams.get('exam_type');
      const status = url.searchParams.get('status');
      const due_before = url.searchParams.get('due_before');
      const where = []; const params = []; let i = 1;
      if (employee_id) { where.push(`employee_id=$${i++}`); params.push(employee_id); }
      if (exam_type) { where.push(`exam_type=$${i++}`); params.push(exam_type); }
      if (status) { where.push(`status=$${i++}`); params.push(status); }
      if (due_before) { where.push(`due_date <= $${i++}`); params.push(due_before); }
      const sql = `SELECT oa.*, e.display_name as employee_name FROM hr_occupational_agenda oa LEFT JOIN hr_employees e ON e.id=oa.employee_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY oa.due_date ASC LIMIT 200`;
      const r = await pool.query(sql, params);
      return json(res, 200, { agendas: r.rows, note: 'HR-15 saúde ocupacional agenda vencimentos acesso restrito não replicar prontuário completo' });
    }
    if (req.method === 'POST') {
      const b = await readJson(req);
      if (!isUuid(b.employee_id)) return json(res, 400, { error: 'invalid_employee_id' });
      if (!b.exam_type) return json(res, 400, { error: 'exam_type_required' });
      if (!b.scheduled_date || !b.due_date) return json(res, 400, { error: 'scheduled_and_due_required' });
      if (new Date(b.due_date) < new Date(b.scheduled_date)) return json(res, 400, { error: 'due_before_scheduled' });
      const emp = await pool.query(`SELECT id FROM hr_employees WHERE id=$1`, [b.employee_id]);
      if (!emp.rows.length) return json(res, 404, { error: 'employee_not_found' });
      // busca requirement para calcular next_due_date
      let requirement = null;
      if (b.requirement_id && isUuid(b.requirement_id)) {
        const reqR = await pool.query(`SELECT * FROM hr_occupational_requirements WHERE id=$1`, [b.requirement_id]);
        if (reqR.rows.length) requirement = reqR.rows[0];
      } else {
        const reqR = await pool.query(`SELECT * FROM hr_occupational_requirements WHERE cargo=(SELECT cargo FROM hr_employees WHERE id=$1) AND exam_type=$2 LIMIT 1`, [b.employee_id, b.exam_type]);
        if (reqR.rows.length) requirement = reqR.rows[0];
      }
      let nextDue = b.next_due_date || null;
      if (!nextDue && requirement) {
        const d = new Date(b.scheduled_date);
        d.setDate(d.getDate() + requirement.validity_days);
        nextDue = d.toISOString().slice(0,10);
      }
      const r = await pool.query(
        `INSERT INTO hr_occupational_agenda (employee_id, requirement_id, exam_type, scheduled_date, due_date, status, responsible_id, responsible_name, result_summary, is_fit_for_duty, aptidao_operacional, next_due_date, notes, created_by, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [b.employee_id, requirement ? requirement.id : (b.requirement_id || null), b.exam_type, b.scheduled_date, b.due_date, b.status || 'agendado', sess.identityId || sess.id, b.responsible_name || null, b.result_summary || null, b.is_fit_for_duty ?? null, b.aptidao_operacional || null, nextDue, b.notes || null, sess.identityId || sess.id, sess.identityId || sess.id]
      );
      await auditLog({ action: 'hr_occupational_schedule', actor: sess.identityId || sess.id, target: r.rows[0].id, meta: { employee_id: b.employee_id, exam_type: b.exam_type, due_date: b.due_date } });
      return json(res, 201, { agenda: r.rows[0] });
    }
    if (req.method === 'PATCH') {
      const b = await readJson(req);
      if (!isUuid(b.id)) return json(res, 400, { error: 'invalid_id' });
      const allowed = ['agendado','realizado','vencido','cancelado','pendente','em_analise','aprovado','rejeitado','rascunho'];
      if (b.status && !allowed.includes(b.status)) return json(res, 400, { error: 'invalid_status' });
      const upd = await pool.query(
        `UPDATE hr_occupational_agenda SET status=COALESCE($2,status), responsible_name=COALESCE($3,responsible_name), result_summary=COALESCE($4,result_summary), is_fit_for_duty=COALESCE($5,is_fit_for_duty), aptidao_operacional=COALESCE($6,aptidao_operacional), next_due_date=COALESCE($7,next_due_date), notes=COALESCE($8,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,
        [b.id, b.status || null, b.responsible_name || null, b.result_summary || null, b.is_fit_for_duty ?? null, b.aptidao_operacional || null, b.next_due_date || null, b.notes || null]
      );
      if (!upd.rows.length) return json(res, 404, { error: 'not_found' });
      return json(res, 200, { agenda: upd.rows[0] });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }

  async function handleOccupationalDocuments(req, res) {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const employee_id = url.searchParams.get('employee_id');
      const agenda_id = url.searchParams.get('agenda_id');
      const doc_type = url.searchParams.get('doc_type');
      const where = ['is_restricted=true']; const params = []; let i = 1;
      if (employee_id) { where.push(`employee_id=$${i++}`); params.push(employee_id); }
      if (agenda_id) { where.push(`agenda_id=$${i++}`); params.push(agenda_id); }
      if (doc_type) { where.push(`doc_type=$${i++}`); params.push(doc_type); }
      const sql = `SELECT * FROM hr_occupational_documents WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 200`;
      const r = await pool.query(sql, params);
      return json(res, 200, { documents: r.rows, note: 'documentos restritos acesso restrito não replicar prontuário completo no cadastro comum' });
    }
    if (req.method === 'POST') {
      const b = await readJson(req);
      if (!isUuid(b.employee_id)) return json(res, 400, { error: 'invalid_employee_id' });
      if (!b.doc_type) return json(res, 400, { error: 'doc_type_required' });
      if (!b.title || b.title.length < 3) return json(res, 400, { error: 'title_min3' });
      if (b.validity_start && b.validity_end && new Date(b.validity_end) < new Date(b.validity_start)) return json(res, 400, { error: 'invalid_validity' });
      const emp = await pool.query(`SELECT id FROM hr_employees WHERE id=$1`, [b.employee_id]);
      if (!emp.rows.length) return json(res, 404, { error: 'employee_not_found' });
      const r = await pool.query(
        `INSERT INTO hr_occupational_documents (employee_id, agenda_id, doc_type, title, file_url, storage_key, validity_start, validity_end, status, is_restricted, is_medical_record, uploaded_by, uploaded_by_id, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,true,$10,$11,$12) RETURNING *`,
        [b.employee_id, b.agenda_id && isUuid(b.agenda_id) ? b.agenda_id : null, b.doc_type, b.title, b.file_url || null, b.storage_key || null, b.validity_start || null, b.validity_end || null, b.status || 'pendente', sess.identityId || sess.id, sess.identityId || sess.id, b.notes || null]
      );
      await auditLog({ action: 'hr_occupational_document', actor: sess.identityId || sess.id, target: r.rows[0].id, meta: { employee_id: b.employee_id, doc_type: b.doc_type, is_restricted: true } });
      return json(res, 201, { document: r.rows[0] });
    }
    if (req.method === 'PATCH') {
      const b = await readJson(req);
      if (!isUuid(b.id)) return json(res, 400, { error: 'invalid_id' });
      const upd = await pool.query(
        `UPDATE hr_occupational_documents SET status=COALESCE($2,status), file_url=COALESCE($3,file_url), validity_start=COALESCE($4,validity_start), validity_end=COALESCE($5,validity_end), notes=COALESCE($6,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,
        [b.id, b.status || null, b.file_url || null, b.validity_start || null, b.validity_end || null, b.notes || null]
      );
      if (!upd.rows.length) return json(res, 404, { error: 'not_found' });
      return json(res, 200, { document: upd.rows[0] });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }

  // HR-16
  async function handleIntegrationExports(req, res) {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const integration_type = url.searchParams.get('integration_type');
      const export_type = url.searchParams.get('export_type');
      const status = url.searchParams.get('status');
      const competence = url.searchParams.get('competence');
      const where = []; const params = []; let i = 1;
      if (integration_type) { where.push(`integration_type=$${i++}`); params.push(integration_type); }
      if (export_type) { where.push(`export_type=$${i++}`); params.push(export_type); }
      if (status) { where.push(`status=$${i++}`); params.push(status); }
      if (competence) { where.push(`competence=$${i++}`); params.push(competence); }
      const sql = `SELECT ie.*, e.display_name as employee_name FROM hr_integration_exports ie LEFT JOIN hr_employees e ON e.id=ie.employee_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ie.created_at DESC LIMIT 200`;
      const r = await pool.query(sql, params);
      return json(res, 200, { exports: r.rows, note: 'HR-16 integração contabilidade/SST recibos processamento não declarar eSocial sem protocolo válido' });
    }
    if (req.method === 'POST') {
      const b = await readJson(req);
      if (!b.integration_type) return json(res, 400, { error: 'integration_type_required' });
      if (!b.export_type) return json(res, 400, { error: 'export_type_required' });
      if (b.competence && !validCompetence(b.competence)) return json(res, 400, { error: 'invalid_competence' });
      if (b.employee_id && !isUuid(b.employee_id)) return json(res, 400, { error: 'invalid_employee_id' });
      if (b.employee_id) {
        const emp = await pool.query(`SELECT id FROM hr_employees WHERE id=$1`, [b.employee_id]);
        if (!emp.rows.length) return json(res, 404, { error: 'employee_not_found' });
      }
      // payload should not contain full medical record
      if (b.payload && typeof b.payload === 'object') {
        const payloadStr = JSON.stringify(b.payload).toLowerCase();
        if (payloadStr.includes('prontuario_completo') || payloadStr.includes('diagnostico_detalhado')) {
          return json(res, 400, { error: 'medical_full_record_not_allowed', detail: 'Não replicar prontuário médico completo no cadastro comum' });
        }
      }
      const r = await pool.query(
        `INSERT INTO hr_integration_exports (employee_id, integration_type, export_type, competence, period_start, period_end, payload, file_url, storage_key, status, provider_name, requested_by, requested_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendente',$10,$11,$12) RETURNING *`,
        [b.employee_id || null, b.integration_type, b.export_type, b.competence || null, b.period_start || null, b.period_end || null, JSON.stringify(b.payload || {}), b.file_url || null, b.storage_key || null, b.provider_name || null, sess.identityId || sess.id, sess.identityId || sess.id]
      );
      await auditLog({ action: 'hr_integration_export', actor: sess.identityId || sess.id, target: r.rows[0].id, meta: { integration_type: b.integration_type, export_type: b.export_type, competence: b.competence } });
      return json(res, 201, { export: r.rows[0] });
    }
    if (req.method === 'PATCH') {
      const b = await readJson(req);
      if (!isUuid(b.id)) return json(res, 400, { error: 'invalid_id' });
      // regra crítica: não declarar envio eSocial sem protocolo válido do responsável/provedor
      if (b.status === 'enviado_com_protocolo' || b.status === 'processado') {
        if (!b.protocol_number || b.protocol_number.length < 5) return json(res, 400, { error: 'protocol_required_for_esocial', detail: 'Não declarar envio eSocial sem protocolo válido do responsável/provedor' });
        if (b.is_protocol_valid === false) return json(res, 400, { error: 'protocol_must_be_valid', detail: 'Protocolo deve ser validado pelo responsável/provedor' });
        if (b.integration_type === 'esocial' && (!b.provider_response || Object.keys(b.provider_response).length === 0)) {
          return json(res, 400, { error: 'provider_response_required', detail: 'eSocial exige resposta do provedor com protocolo' });
        }
      }
      const allowed = ['pendente','em_processamento','enviado_com_protocolo','falhou','rejeitado','corrigido','cancelado','processado'];
      if (b.status && !allowed.includes(b.status)) return json(res, 400, { error: 'invalid_status' });
      const upd = await pool.query(
        `UPDATE hr_integration_exports SET status=COALESCE($2,status), protocol_number=COALESCE($3,protocol_number), provider_name=COALESCE($4,provider_name), provider_response=COALESCE($5,provider_response), error_code=COALESCE($6,error_code), error_message=COALESCE($7,error_message), is_protocol_valid=COALESCE($8,is_protocol_valid), correction_of_id=COALESCE($9,correction_of_id), correction_reason=COALESCE($10,correction_reason), file_url=COALESCE($11,file_url), processed_at=CASE WHEN $2 IN ('enviado_com_protocolo','processado','falhou','rejeitado') THEN NOW() ELSE processed_at END, updated_at=NOW() WHERE id=$1 RETURNING *`,
        [b.id, b.status || null, b.protocol_number || null, b.provider_name || null, b.provider_response ? JSON.stringify(b.provider_response) : null, b.error_code || null, b.error_message || null, b.is_protocol_valid ?? null, b.correction_of_id && isUuid(b.correction_of_id) ? b.correction_of_id : null, b.correction_reason || null, b.file_url || null]
      );
      if (!upd.rows.length) return json(res, 404, { error: 'not_found' });
      if (upd.rows[0].status === 'enviado_com_protocolo' && !upd.rows[0].is_protocol_valid) {
        // force invalid if protocol not valid
        await pool.query(`UPDATE hr_integration_exports SET is_protocol_valid=false, status='falhou', error_message='Protocolo inválido, não declarar envio eSocial sem protocolo válido' WHERE id=$1`, [b.id]);
        return json(res, 400, { error: 'invalid_protocol', detail: 'Não declarar envio eSocial sem protocolo válido do responsável/provedor' });
      }
      return json(res, 200, { export: upd.rows[0] });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }

  async function handleIntegrationReceipts(req, res) {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const export_id = url.searchParams.get('export_id');
      const where = []; const params = []; let i = 1;
      if (export_id) { if (!isUuid(export_id)) return json(res, 400, { error: 'invalid_export_id' }); where.push(`export_id=$${i++}`); params.push(export_id); }
      const sql = `SELECT * FROM hr_integration_receipts ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY received_at DESC LIMIT 200`;
      const r = await pool.query(sql, params);
      return json(res, 200, { receipts: r.rows });
    }
    if (req.method === 'POST') {
      const b = await readJson(req);
      if (!isUuid(b.export_id)) return json(res, 400, { error: 'invalid_export_id' });
      if (!b.protocol_number || b.protocol_number.length < 5) return json(res, 400, { error: 'protocol_number_required' });
      const exp = await pool.query(`SELECT id, integration_type FROM hr_integration_exports WHERE id=$1`, [b.export_id]);
      if (!exp.rows.length) return json(res, 404, { error: 'export_not_found' });
      const r = await pool.query(
        `INSERT INTO hr_integration_receipts (export_id, receipt_type, protocol_number, payload, status, is_valid, notes, created_by, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [b.export_id, b.receipt_type || 'protocolo', b.protocol_number, JSON.stringify(b.payload || {}), b.status || 'recebido', b.is_valid === true, b.notes || null, sess.identityId || sess.id, sess.identityId || sess.id]
      );
      // se recibo válido e tipo protocolo, atualiza export com protocolo válido
      if (b.is_valid === true && (b.receipt_type === 'protocolo' || b.receipt_type === 'recibo')) {
        await pool.query(
          `UPDATE hr_integration_exports SET protocol_number=$2, is_protocol_valid=true, status='enviado_com_protocolo', provider_response=$3, processed_at=NOW(), updated_at=NOW() WHERE id=$1`,
          [b.export_id, b.protocol_number, JSON.stringify(b.payload || {})]
        );
      }
      await auditLog({ action: 'hr_integration_receipt', actor: sess.identityId || sess.id, target: r.rows[0].id, meta: { export_id: b.export_id, protocol_number: b.protocol_number, is_valid: b.is_valid } });
      return json(res, 201, { receipt: r.rows[0] });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }

  async function handleIntegrationErrors(req, res) {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const export_id = url.searchParams.get('export_id');
      if (export_id && !isUuid(export_id)) return json(res, 400, { error: 'invalid_export_id' });
      const sql = export_id ? `SELECT * FROM hr_integration_errors WHERE export_id=$1 ORDER BY created_at DESC LIMIT 200` : `SELECT * FROM hr_integration_errors ORDER BY created_at DESC LIMIT 200`;
      const params = export_id ? [export_id] : [];
      const r = await pool.query(sql, params);
      return json(res, 200, { errors: r.rows });
    }
    if (req.method === 'POST') {
      const b = await readJson(req);
      if (!isUuid(b.export_id)) return json(res, 400, { error: 'invalid_export_id' });
      if (!b.error_message || b.error_message.length < 5) return json(res, 400, { error: 'error_message_required' });
      const exp = await pool.query(`SELECT id FROM hr_integration_exports WHERE id=$1`, [b.export_id]);
      if (!exp.rows.length) return json(res, 404, { error: 'export_not_found' });
      const r = await pool.query(
        `INSERT INTO hr_integration_errors (export_id, error_code, error_message, correction_required)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [b.export_id, b.error_code || null, b.error_message, b.correction_required !== false]
      );
      await pool.query(`UPDATE hr_integration_exports SET status='falhou', error_code=$2, error_message=$3, updated_at=NOW() WHERE id=$1`, [b.export_id, b.error_code || null, b.error_message]);
      await auditLog({ action: 'hr_integration_error', actor: sess.identityId || sess.id, target: r.rows[0].id, meta: { export_id: b.export_id, error_code: b.error_code } });
      return json(res, 201, { error: r.rows[0] });
    }
    if (req.method === 'PATCH') {
      const b = await readJson(req);
      if (!isUuid(b.id)) return json(res, 400, { error: 'invalid_id' });
      const upd = await pool.query(
        `UPDATE hr_integration_errors SET corrected_at=NOW(), correction_notes=COALESCE($2,correction_notes), correction_required=false WHERE id=$1 RETURNING *`,
        [b.id, b.correction_notes || null]
      );
      if (!upd.rows.length) return json(res, 404, { error: 'not_found' });
      // marca export como corrigido
      await pool.query(`UPDATE hr_integration_exports SET status='corrigido', updated_at=NOW() WHERE id=$1`, [upd.rows[0].export_id]);
      return json(res, 200, { error: upd.rows[0] });
    }
    return json(res, 405, { error: 'method_not_allowed' });
  }

  return {
    handleBenefitCatalog,
    handleBenefitEnrollments,
    handleBenefitRequests,
    handleBenefitConferences,
    handleBenefitExports,
    handleAdvancePolicies,
    handleAdvanceRequests,
    handleOccupationalRequirements,
    handleOccupationalAgenda,
    handleOccupationalDocuments,
    handleIntegrationExports,
    handleIntegrationReceipts,
    handleIntegrationErrors,
  };
}
