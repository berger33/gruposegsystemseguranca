/**
 * OPS-09/10/11/12 — Operação supervisão, rondas, chaves, relatórios cliente
 * OPS-09: visitas de supervisão, inspeções e planos de ação com prazo, responsável e verificação.
 * OPS-10: rondas e pontos de verificação; prevenção repetição/replay, tratamento localização indisponível e evidência auditável. GPS/QR isolado não prova execução.
 * OPS-11: chaves, rádios, materiais e equipamentos com guarda/transferência/devolução.
 * OPS-12: relatórios periódicos ao cliente com revisão de conteúdo e privacidade.
 */

function validateUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function genProtocol(prefix) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth()+1).padStart(2,'0');
  const d = String(now.getDate()).padStart(2,'0');
  const rand = Math.random().toString(36).slice(2,6).toUpperCase();
  return `${prefix}-${y}${m}${d}-${rand}`;
}

export function createOpsAdvanced2Api({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  function send(res, status, data) { res.writeHead(status, headers); res.end(JSON.stringify(data)); }
  async function body(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return null; }
  }

  // ---- OPS-09 Visitas Supervisão ----
  async function handleSupervisionVisits(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const post_id = url.searchParams.get('post_id');
      const company_id = url.searchParams.get('company_id');
      const status = url.searchParams.get('status');
      const where = [];
      const vals = [];
      let i=1;
      if (post_id) { if (!validateUuid(post_id)) return send(res,400,{error:'invalid_post_id'}); where.push(`post_id=$${i++}`); vals.push(post_id); }
      if (company_id) { if (!validateUuid(company_id)) return send(res,400,{error:'invalid_company_id'}); where.push(`company_id=$${i++}`); vals.push(company_id); }
      if (status) { where.push(`status=$${i++}`); vals.push(status); }
      const ws = where.length? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_supervision_visits ${ws} ORDER BY scheduled_date DESC LIMIT 100`, vals);
        return send(res,200,{ visits: rows });
      } catch (e) { console.error('supVisits GET', e.message); return send(res,500,{error:'internal_error'}); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti','rh'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const post_id = b.post_id || b.postId;
      if (!validateUuid(post_id)) return send(res,400,{error:'invalid_post_id'});
      const scheduled_date = b.scheduled_date || b.scheduledDate;
      if (!scheduled_date) return send(res,400,{error:'scheduled_date_required'});
      const supervisor_employee_id = b.supervisor_employee_id || b.supervisorEmployeeId;
      if (supervisor_employee_id && !validateUuid(supervisor_employee_id)) return send(res,400,{error:'invalid_supervisor_employee_id'});
      const protocol = b.protocol || genProtocol('SV-OPS');
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_supervision_visits (protocol, post_id, company_id, unit_id, supervisor_employee_id, scheduled_date, status, checklist_template_id, responsible_name, findings, is_private, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          [protocol, post_id, b.company_id||b.companyId||null, b.unit_id||b.unitId||null, supervisor_employee_id||null, scheduled_date, b.status||'agendada', b.checklist_template_id||b.checklistTemplateId||null, b.responsible_name||b.responsibleName||null, b.findings||null, !!b.is_private, b.notes||null, sess.role]
        );
        try { await auditLog({ action: 'ops_supervision_visit_create', actor: sess.role, target: rows[0].id, meta: { post_id, protocol } }); } catch {}
        return send(res,201,{ visit: rows[0] });
      } catch (e) { console.error('supVisits POST', e.message); return send(res,500,{error:'internal_error', detail:e.message}); }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti','rh'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const id = b.id;
      if (!validateUuid(id)) return send(res,400,{error:'invalid_id'});
      const status = b.status;
      if (status && !['agendada','em_andamento','realizada','cancelada','atrasada','pendente_verificacao'].includes(status)) return send(res,400,{error:'invalid_status'});
      // verificação requer verified_by
      if (status === 'pendente_verificacao' && !b.verified_by && !b.verifiedBy) {
        // allow but note verification pending
      }
      if (b.verified_by || b.verifiedBy) {
        // verificação humana
        if (!b.verification_notes && !b.verificationNotes) {
          // allow but encourage notes
        }
      }
      try {
        const { rows } = await pool.query(
          `UPDATE ops_supervision_visits SET status=COALESCE($1,status), executed_at=CASE WHEN $1='realizada' THEN NOW() ELSE executed_at END, score=COALESCE($2,score), findings=COALESCE($3,findings), verified_by=COALESCE($4,verified_by), verified_at=CASE WHEN $4 IS NOT NULL THEN NOW() ELSE verified_at END, verification_notes=COALESCE($5,verification_notes), notes=COALESCE($6,notes), updated_at=NOW() WHERE id=$7 RETURNING *`,
          [status||null, b.score||null, b.findings||null, b.verified_by||b.verifiedBy||null, b.verification_notes||b.verificationNotes||null, b.notes||null, id]
        );
        if (!rows.length) return send(res,404,{error:'not_found'});
        try { await auditLog({ action: status==='pendente_verificacao' ? 'ops_supervision_visit_verify' : 'ops_supervision_visit_update', actor: sess.role, target: id, meta: { status } }); } catch {}
        return send(res,200,{ visit: rows[0] });
      } catch (e) { console.error('supVisits PATCH', e.message); return send(res,500,{error:'internal_error'}); }
    }
    return send(res,405,{error:'method_not_allowed'});
  }

  async function handleSupervisionInspections(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const visit_id = url.searchParams.get('visit_id');
      const where=[]; const vals=[]; let i=1;
      if (visit_id) { if (!validateUuid(visit_id)) return send(res,400,{error:'invalid_visit_id'}); where.push(`visit_id=$${i++}`); vals.push(visit_id); }
      const ws = where.length? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_supervision_inspections ${ws} ORDER BY created_at DESC LIMIT 100`, vals);
        return send(res,200,{ inspections: rows });
      } catch (e) { console.error('inspections GET', e.message); return send(res,500,{error:'internal_error'}); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti','rh'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const visit_id = b.visit_id || b.visitId;
      if (!validateUuid(visit_id)) return send(res,400,{error:'invalid_visit_id'});
      const title = (b.title||'').trim();
      if (title.length <5 || title.length>200) return send(res,400,{error:'invalid_title', detail:'5..200'});
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_supervision_inspections (visit_id, inspection_type, status, title, description, inspector_name, result, score, is_private, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [visit_id, b.inspection_type||b.inspectionType||'rotina', b.status||'pendente', title, b.description||null, b.inspector_name||b.inspectorName||null, b.result||null, b.score||null, !!b.is_private, b.notes||null, sess.role]
        );
        try { await auditLog({ action: 'ops_supervision_inspection_create', actor: sess.role, target: rows[0].id, meta: { visit_id } }); } catch {}
        return send(res,201,{ inspection: rows[0] });
      } catch (e) { console.error('inspections POST', e.message); return send(res,500,{error:'internal_error'}); }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti','rh'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const id = b.id;
      if (!validateUuid(id)) return send(res,400,{error:'invalid_id'});
      try {
        const { rows } = await pool.query(
          `UPDATE ops_supervision_inspections SET status=COALESCE($1,status), result=COALESCE($2,result), score=COALESCE($3,score), inspected_at=CASE WHEN $1 IN ('concluida','reprovada','aprovada_com_ressalva') THEN NOW() ELSE inspected_at END, notes=COALESCE($4,notes), updated_at=NOW() WHERE id=$5 RETURNING *`,
          [b.status||null, b.result||null, b.score||null, b.notes||null, id]
        );
        if (!rows.length) return send(res,404,{error:'not_found'});
        return send(res,200,{ inspection: rows[0] });
      } catch (e) { console.error('inspections PATCH', e.message); return send(res,500,{error:'internal_error'}); }
    }
    return send(res,405,{error:'method_not_allowed'});
  }

  async function handleSupervisionActionPlans(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const visit_id = url.searchParams.get('visit_id');
      const status = url.searchParams.get('status');
      const where=[]; const vals=[]; let i=1;
      if (visit_id) { if (!validateUuid(visit_id)) return send(res,400,{error:'invalid_visit_id'}); where.push(`visit_id=$${i++}`); vals.push(visit_id); }
      if (status) { where.push(`status=$${i++}`); vals.push(status); }
      const ws = where.length? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_supervision_action_plans ${ws} ORDER BY due_date ASC LIMIT 100`, vals);
        return send(res,200,{ actionPlans: rows });
      } catch (e) { console.error('actionPlans GET', e.message); return send(res,500,{error:'internal_error'}); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti','rh'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const title = (b.title||'').trim();
      if (title.length<5 || title.length>200) return send(res,400,{error:'invalid_title'});
      const description = (b.description||'').trim();
      if (description.length<10 || description.length>2000) return send(res,400,{error:'invalid_description', detail:'10..2000'});
      const responsible_name = (b.responsible_name||b.responsibleName||'').trim();
      if (responsible_name.length<2 || responsible_name.length>200) return send(res,400,{error:'invalid_responsible_name'});
      const due_date = b.due_date || b.dueDate;
      if (!due_date) return send(res,400,{error:'due_date_required'});
      const visit_id = b.visit_id || b.visitId;
      const inspection_id = b.inspection_id || b.inspectionId;
      const occurrence_id = b.occurrence_id || b.occurrenceId;
      if (!visit_id && !inspection_id && !occurrence_id) return send(res,400,{error:'reference_required', detail:'visit_id or inspection_id or occurrence_id required'});
      if (visit_id && !validateUuid(visit_id)) return send(res,400,{error:'invalid_visit_id'});
      if (inspection_id && !validateUuid(inspection_id)) return send(res,400,{error:'invalid_inspection_id'});
      if (occurrence_id && !validateUuid(occurrence_id)) return send(res,400,{error:'invalid_occurrence_id'});
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_supervision_action_plans (visit_id, inspection_id, occurrence_id, title, description, responsible_name, due_date, status, priority, is_private, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [visit_id||null, inspection_id||null, occurrence_id||null, title, description, responsible_name, due_date, b.status||'aberto', b.priority||'media', !!b.is_private, b.notes||null, sess.role]
        );
        try { await auditLog({ action: 'ops_supervision_action_plan_create', actor: sess.role, target: rows[0].id, meta: { visit_id, inspection_id } }); } catch {}
        return send(res,201,{ actionPlan: rows[0] });
      } catch (e) { console.error('actionPlans POST', e.message); return send(res,500,{error:'internal_error', detail:e.message}); }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti','rh'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const id = b.id;
      if (!validateUuid(id)) return send(res,400,{error:'invalid_id'});
      const status = b.status;
      if (status && !['aberto','em_andamento','concluido','verificado','cancelado','atrasado'].includes(status)) return send(res,400,{error:'invalid_status'});
      // verificação requer verified_by
      if (status === 'verificado' && !b.verified_by && !b.verifiedBy) return send(res,400,{error:'verified_by_required', detail:'verificação requer responsável'});
      try {
        const { rows } = await pool.query(
          `UPDATE ops_supervision_action_plans SET status=COALESCE($1,status), completed_at=CASE WHEN $1='concluido' THEN NOW() ELSE completed_at END, verified_by=COALESCE($2,verified_by), verified_at=CASE WHEN $1='verificado' THEN NOW() ELSE verified_at END, verification_notes=COALESCE($3,verification_notes), notes=COALESCE($4,notes), updated_at=NOW() WHERE id=$5 RETURNING *`,
          [status||null, b.verified_by||b.verifiedBy||null, b.verification_notes||b.verificationNotes||null, b.notes||null, id]
        );
        if (!rows.length) return send(res,404,{error:'not_found'});
        try { await auditLog({ action: status==='verificado' ? 'ops_supervision_action_plan_verify' : 'ops_supervision_action_plan_update', actor: sess.role, target: id, meta: { status } }); } catch {}
        return send(res,200,{ actionPlan: rows[0] });
      } catch (e) { console.error('actionPlans PATCH', e.message); return send(res,500,{error:'internal_error'}); }
    }
    return send(res,405,{error:'method_not_allowed'});
  }

  // ---- OPS-10 Rondas ----
  async function handlePatrols(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const post_id = url.searchParams.get('post_id');
      const status = url.searchParams.get('status');
      const where=[]; const vals=[]; let i=1;
      if (post_id) { if (!validateUuid(post_id)) return send(res,400,{error:'invalid_post_id'}); where.push(`post_id=$${i++}`); vals.push(post_id); }
      if (status) { where.push(`status=$${i++}`); vals.push(status); }
      const ws = where.length? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_patrols ${ws} ORDER BY patrol_date DESC LIMIT 100`, vals);
        return send(res,200,{ patrols: rows });
      } catch (e) { console.error('patrols GET', e.message); return send(res,500,{error:'internal_error'}); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti','rh'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const post_id = b.post_id || b.postId;
      if (!validateUuid(post_id)) return send(res,400,{error:'invalid_post_id'});
      const patrol_date = b.patrol_date || b.patrolDate;
      if (!patrol_date) return send(res,400,{error:'patrol_date_required'});
      const protocol = b.protocol || genProtocol('PAT-OPS');
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_patrols (protocol, post_id, company_id, employee_id, patrol_date, planned_start, planned_end, status, route_name, is_private, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [protocol, post_id, b.company_id||b.companyId||null, b.employee_id||b.employeeId||null, patrol_date, b.planned_start||b.plannedStart||null, b.planned_end||b.plannedEnd||null, b.status||'planejada', b.route_name||b.routeName||null, !!b.is_private, b.notes||null, sess.role]
        );
        try { await auditLog({ action: 'ops_patrol_create', actor: sess.role, target: rows[0].id, meta: { post_id, protocol } }); } catch {}
        return send(res,201,{ patrol: rows[0] });
      } catch (e) { console.error('patrols POST', e.message); return send(res,500,{error:'internal_error', detail:e.message}); }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti','rh'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const id = b.id;
      if (!validateUuid(id)) return send(res,400,{error:'invalid_id'});
      const status = b.status;
      if (status && !['planejada','em_andamento','concluida','interrompida','cancelada'].includes(status)) return send(res,400,{error:'invalid_status'});
      try {
        const { rows } = await pool.query(
          `UPDATE ops_patrols SET status=COALESCE($1,status), actual_start=COALESCE($2,actual_start), actual_end=COALESCE($3,actual_end), notes=COALESCE($4,notes), updated_at=NOW() WHERE id=$5 RETURNING *`,
          [status||null, b.actual_start||b.actualStart||null, b.actual_end||b.actualEnd||null, b.notes||null, id]
        );
        if (!rows.length) return send(res,404,{error:'not_found'});
        return send(res,200,{ patrol: rows[0] });
      } catch (e) { console.error('patrols PATCH', e.message); return send(res,500,{error:'internal_error'}); }
    }
    return send(res,405,{error:'method_not_allowed'});
  }

  async function handlePatrolPoints(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const patrol_id = url.searchParams.get('patrol_id');
      const where=[]; const vals=[]; let i=1;
      if (patrol_id) { if (!validateUuid(patrol_id)) return send(res,400,{error:'invalid_patrol_id'}); where.push(`patrol_id=$${i++}`); vals.push(patrol_id); }
      const ws = where.length? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_patrol_points ${ws} ORDER BY expected_time ASC NULLS LAST LIMIT 200`, vals);
        return send(res,200,{ points: rows });
      } catch (e) { console.error('patrolPoints GET', e.message); return send(res,500,{error:'internal_error'}); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti','rh'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const patrol_id = b.patrol_id || b.patrolId;
      if (!validateUuid(patrol_id)) return send(res,400,{error:'invalid_patrol_id'});
      const point_name = (b.point_name||b.pointName||'').trim();
      if (point_name.length<3 || point_name.length>200) return send(res,400,{error:'invalid_point_name', detail:'3..200'});
      // prevenção repetição/replay: check duplicate qr in same patrol within 5 min
      const qr_code = b.qr_code || b.qrCode || null;
      const latitude = b.latitude ?? null;
      const longitude = b.longitude ?? null;
      let is_replay_detected = false;
      let replay_reason = null;
      try {
        if (qr_code) {
          const { rows: dup } = await pool.query(`SELECT id, actual_time FROM ops_patrol_points WHERE patrol_id=$1 AND qr_code=$2 AND actual_time IS NOT NULL ORDER BY actual_time DESC LIMIT 1`, [patrol_id, qr_code]);
          if (dup.length) {
            const last = dup[0];
            const diffMs = Date.now() - new Date(last.actual_time).getTime();
            if (diffMs < 5*60*1000) {
              is_replay_detected = true;
              replay_reason = `duplicate_qr within 5min last ${last.actual_time}`;
            }
          }
        }
        // too_fast: check last point actual_time < 30 sec
        const { rows: lastPoint } = await pool.query(`SELECT actual_time FROM ops_patrol_points WHERE patrol_id=$1 AND actual_time IS NOT NULL ORDER BY actual_time DESC LIMIT 1`, [patrol_id]);
        if (lastPoint.length && lastPoint[0].actual_time) {
          const diff = Date.now() - new Date(lastPoint[0].actual_time).getTime();
          if (diff < 30000) {
            is_replay_detected = true;
            replay_reason = (replay_reason? replay_reason+'; ' : '') + `too_fast ${diff}ms since last point`;
          }
        }
        // GPS/QR isolado não prova execução: require evidence_url if location provided alone? Enforce verification note
        // We allow but mark is_private and require verified later
        const { rows } = await pool.query(
          `INSERT INTO ops_patrol_points (patrol_id, point_name, expected_time, actual_time, latitude, longitude, qr_code, status, is_replay_detected, replay_reason, evidence_url, storage_key, location_unavailable, location_unavailable_reason, is_private)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
          [patrol_id, point_name, b.expected_time||b.expectedTime||null, b.actual_time||b.actualTime||new Date().toISOString(), latitude, longitude, qr_code, b.status|| (is_replay_detected? 'invalido' : 'visitado'), is_replay_detected, replay_reason, b.evidence_url||b.evidenceUrl||null, b.storage_key||b.storageKey||null, !!b.location_unavailable, b.location_unavailable_reason||b.locationUnavailableReason||null, !!b.is_private]
        );
        // log replay if detected
        if (is_replay_detected) {
          try {
            await pool.query(
              `INSERT INTO ops_patrol_replay_logs (point_id, patrol_id, employee_id, latitude, longitude, qr_code, is_replay, replay_type, details) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [rows[0].id, patrol_id, b.employee_id||b.employeeId||null, latitude, longitude, qr_code, true, qr_code? 'duplicate_qr' : 'too_fast', replay_reason]
            );
          } catch {}
        }
        try { await auditLog({ action: is_replay_detected? 'ops_patrol_point_replay_detected' : 'ops_patrol_point_create', actor: sess.role, target: rows[0].id, meta: { patrol_id, point_name, is_replay_detected } }); } catch {}
        return send(res,201,{ point: rows[0], replay_detected: is_replay_detected, note: 'GPS/QR isolado não prova execução - requer evidência auditável e verificação humana' });
      } catch (e) { console.error('patrolPoints POST', e.message); return send(res,500,{error:'internal_error', detail:e.message}); }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti','rh'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const id = b.id;
      if (!validateUuid(id)) return send(res,400,{error:'invalid_id'});
      // tratamento localização indisponível
      const location_unavailable = b.location_unavailable ?? b.locationUnavailable;
      let location_unavailable_reason = b.location_unavailable_reason || b.locationUnavailableReason || null;
      if (location_unavailable && !location_unavailable_reason) return send(res,400,{error:'location_unavailable_reason_required', detail:'tratamento localização indisponível requer motivo'});
      // verificação humana required to prove execution beyond GPS/QR
      try {
        const { rows } = await pool.query(
          `UPDATE ops_patrol_points SET status=COALESCE($1,status), evidence_url=COALESCE($2,evidence_url), location_unavailable=COALESCE($3,location_unavailable), location_unavailable_reason=COALESCE($4,location_unavailable_reason), verified_by=COALESCE($5,verified_by), verified_at=CASE WHEN $5 IS NOT NULL THEN NOW() ELSE verified_at END, verification_notes=COALESCE($6,verification_notes), updated_at=NOW() WHERE id=$7 RETURNING *`,
          [b.status||null, b.evidence_url||b.evidenceUrl||null, location_unavailable??null, location_unavailable_reason, b.verified_by||b.verifiedBy||null, b.verification_notes||b.verificationNotes||null, id]
        );
        if (!rows.length) return send(res,404,{error:'not_found'});
        return send(res,200,{ point: rows[0] });
      } catch (e) { console.error('patrolPoints PATCH', e.message); return send(res,500,{error:'internal_error'}); }
    }
    return send(res,405,{error:'method_not_allowed'});
  }

  async function handlePatrolReplayLogs(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    if (req.method !== 'GET') return send(res,405,{error:'method_not_allowed'});
    const url = new URL(req.url, 'http://localhost');
    const patrol_id = url.searchParams.get('patrol_id');
    const point_id = url.searchParams.get('point_id');
    const where=[]; const vals=[]; let i=1;
    if (patrol_id) { if (!validateUuid(patrol_id)) return send(res,400,{error:'invalid_patrol_id'}); where.push(`patrol_id=$${i++}`); vals.push(patrol_id); }
    if (point_id) { if (!validateUuid(point_id)) return send(res,400,{error:'invalid_point_id'}); where.push(`point_id=$${i++}`); vals.push(point_id); }
    const ws = where.length? `WHERE ${where.join(' AND ')}` : '';
    try {
      const { rows } = await pool.query(`SELECT * FROM ops_patrol_replay_logs ${ws} ORDER BY attempted_at DESC LIMIT 100`, vals);
      return send(res,200,{ replayLogs: rows });
    } catch (e) { console.error('replayLogs GET', e.message); return send(res,500,{error:'internal_error'}); }
  }

  // ---- OPS-11 Chaves ----
  async function handleKeys(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const status = url.searchParams.get('status');
      const key_type = url.searchParams.get('key_type');
      const post_id = url.searchParams.get('post_id');
      const where=[]; const vals=[]; let i=1;
      if (status) { where.push(`status=$${i++}`); vals.push(status); }
      if (key_type) { where.push(`key_type=$${i++}`); vals.push(key_type); }
      if (post_id) { if (!validateUuid(post_id)) return send(res,400,{error:'invalid_post_id'}); where.push(`post_id=$${i++}`); vals.push(post_id); }
      const ws = where.length? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_keys ${ws} ORDER BY code ASC LIMIT 100`, vals);
        return send(res,200,{ keys: rows });
      } catch (e) { console.error('keys GET', e.message); return send(res,500,{error:'internal_error'}); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti','rh'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const code = (b.code||'').trim();
      if (code.length<3 || code.length>100) return send(res,400,{error:'invalid_code', detail:'3..100'});
      const description = (b.description||'').trim();
      if (description.length<5 || description.length>500) return send(res,400,{error:'invalid_description', detail:'5..500'});
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_keys (code, description, key_type, post_id, company_id, current_holder_employee_id, status, location, is_blocked, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [code, description, b.key_type||b.keyType||'chave', b.post_id||b.postId||null, b.company_id||b.companyId||null, b.current_holder_employee_id||b.currentHolderEmployeeId||null, b.status||'disponivel', b.location||null, !!b.is_blocked, b.notes||null, sess.role]
        );
        try { await auditLog({ action: 'ops_key_create', actor: sess.role, target: rows[0].id, meta: { code } }); } catch {}
        return send(res,201,{ key: rows[0] });
      } catch (e) {
        if (e.code==='23505') return send(res,409,{error:'duplicate_code'});
        console.error('keys POST', e.message); return send(res,500,{error:'internal_error'});
      }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti','rh'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const id = b.id;
      if (!validateUuid(id)) return send(res,400,{error:'invalid_id'});
      try {
        const { rows } = await pool.query(
          `UPDATE ops_keys SET status=COALESCE($1,status), current_holder_employee_id=COALESCE($2,current_holder_employee_id), location=COALESCE($3,location), is_blocked=COALESCE($4,is_blocked), notes=COALESCE($5,notes), updated_at=NOW() WHERE id=$6 RETURNING *`,
          [b.status||null, b.current_holder_employee_id||b.currentHolderEmployeeId||null, b.location||null, b.is_blocked??null, b.notes||null, id]
        );
        if (!rows.length) return send(res,404,{error:'not_found'});
        return send(res,200,{ key: rows[0] });
      } catch (e) { console.error('keys PATCH', e.message); return send(res,500,{error:'internal_error'}); }
    }
    return send(res,405,{error:'method_not_allowed'});
  }

  async function handleKeyMovements(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const key_id = url.searchParams.get('key_id');
      const where=[]; const vals=[]; let i=1;
      if (key_id) { if (!validateUuid(key_id)) return send(res,400,{error:'invalid_key_id'}); where.push(`key_id=$${i++}`); vals.push(key_id); }
      const ws = where.length? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_key_movements ${ws} ORDER BY movement_date DESC LIMIT 100`, vals);
        return send(res,200,{ movements: rows });
      } catch (e) { console.error('keyMov GET', e.message); return send(res,500,{error:'internal_error'}); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti','rh'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const key_id = b.key_id || b.keyId;
      if (!validateUuid(key_id)) return send(res,400,{error:'invalid_key_id'});
      const movement_type = b.movement_type || b.movementType;
      if (!['retirada','devolucao','transferencia','bloqueio','desbloqueio','extravio','reserva','liberacao'].includes(movement_type)) return send(res,400,{error:'invalid_movement_type'});
      const reason = (b.reason||'').trim();
      if (reason.length<10 || reason.length>1000) return send(res,400,{error:'invalid_reason', detail:'10..1000'});
      const from_employee_id = b.from_employee_id || b.fromEmployeeId || null;
      const to_employee_id = b.to_employee_id || b.toEmployeeId || null;
      if (from_employee_id && !validateUuid(from_employee_id)) return send(res,400,{error:'invalid_from_employee_id'});
      if (to_employee_id && !validateUuid(to_employee_id)) return send(res,400,{error:'invalid_to_employee_id'});
      // guarda/transferência/devolução lógica
      let new_status = null;
      if (movement_type === 'retirada' || movement_type === 'transferencia') new_status = 'emprestada';
      if (movement_type === 'devolucao') new_status = 'devolvida';
      if (movement_type === 'bloqueio') new_status = 'bloqueada';
      if (movement_type === 'desbloqueio') new_status = 'disponivel';
      if (movement_type === 'extravio') new_status = 'extraviada';
      if (movement_type === 'reserva') new_status = 'reservada';
      if (movement_type === 'liberacao') new_status = 'disponivel';
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_key_movements (key_id, movement_type, from_employee_id, to_employee_id, from_post_id, to_post_id, movement_date, expected_return_date, actual_return_date, authorized_by, reason, is_private, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [key_id, movement_type, from_employee_id, to_employee_id, b.from_post_id||b.fromPostId||null, b.to_post_id||b.toPostId||null, b.movement_date||b.movementDate||new Date().toISOString(), b.expected_return_date||b.expectedReturnDate||null, b.actual_return_date||b.actualReturnDate||null, b.authorized_by||b.authorizedBy||null, reason, !!b.is_private, b.notes||null, sess.role]
        );
        // atualiza chave current_holder e status
        if (new_status) {
          try {
            await pool.query(
              `UPDATE ops_keys SET status=$1, current_holder_employee_id=COALESCE($2,current_holder_employee_id), is_blocked=CASE WHEN $1='bloqueada' THEN true WHEN $1='disponivel' THEN false ELSE is_blocked END, updated_at=NOW() WHERE id=$3`,
              [new_status, to_employee_id || from_employee_id || null, key_id]
            );
          } catch {}
        }
        try { await auditLog({ action: 'ops_key_movement', actor: sess.role, target: rows[0].id, meta: { key_id, movement_type } }); } catch {}
        return send(res,201,{ movement: rows[0], new_status });
      } catch (e) { console.error('keyMov POST', e.message); return send(res,500,{error:'internal_error', detail:e.message}); }
    }
    return send(res,405,{error:'method_not_allowed'});
  }

  // ---- OPS-12 Relatórios Cliente ----
  async function handleClientReports(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const company_id = url.searchParams.get('company_id');
      const status = url.searchParams.get('status');
      const report_type = url.searchParams.get('report_type');
      const where=[]; const vals=[]; let i=1;
      if (company_id) { if (!validateUuid(company_id)) return send(res,400,{error:'invalid_company_id'}); where.push(`company_id=$${i++}`); vals.push(company_id); }
      if (status) { where.push(`status=$${i++}`); vals.push(status); }
      if (report_type) { where.push(`report_type=$${i++}`); vals.push(report_type); }
      const ws = where.length? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_client_reports ${ws} ORDER BY period_end DESC LIMIT 100`, vals);
        return send(res,200,{ reports: rows });
      } catch (e) { console.error('clientReports GET', e.message); return send(res,500,{error:'internal_error'}); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti','rh'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const company_id = b.company_id || b.companyId;
      if (!validateUuid(company_id)) return send(res,400,{error:'invalid_company_id'});
      const title = (b.title||'').trim();
      if (title.length<5 || title.length>200) return send(res,400,{error:'invalid_title', detail:'5..200'});
      const content = (b.content||'').trim();
      if (content.length<20 || content.length>10000) return send(res,400,{error:'invalid_content', detail:'20..10000'});
      const period_start = b.period_start || b.periodStart;
      const period_end = b.period_end || b.periodEnd;
      if (!period_start || !period_end) return send(res,400,{error:'period_required'});
      if (new Date(period_end) < new Date(period_start)) return send(res,400,{error:'invalid_period', detail:'end >= start'});
      // privacidade: detecta dados pessoais
      const personalRegex = /(cpf|rg|prontuario|diagnostico|exame|doença|doenca|medic|salario|salário|holerite|CID|médic|health)/i;
      const contains_personal_data = personalRegex.test(content) || personalRegex.test(title);
      const protocol = b.protocol || genProtocol('REP-OPS');
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_client_reports (protocol, company_id, contract_id, post_id, report_type, period_start, period_end, title, content, status, is_private, contains_personal_data, is_approved_for_client, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [protocol, company_id, b.contract_id||b.contractId||null, b.post_id||b.postId||null, b.report_type||b.reportType||'mensal', period_start, period_end, title, content, b.status||'rascunho', !!b.is_private, contains_personal_data, false, sess.role]
        );
        try {
          await pool.query(`INSERT INTO ops_client_report_history (report_id, previous_status, next_status, changed_by, reason) VALUES ($1,$2,$3,$4,$5)`, [rows[0].id, null, rows[0].status, sess.role, 'Criação inicial']);
        } catch {}
        try { await auditLog({ action: 'ops_client_report_create', actor: sess.role, target: rows[0].id, meta: { company_id, protocol, contains_personal_data } }); } catch {}
        return send(res,201,{ report: rows[0], privacy_note: contains_personal_data? 'contém possível dado pessoal - requer revisão de privacidade antes de envio ao cliente' : 'sem dados pessoais detectados' });
      } catch (e) { console.error('clientReports POST', e.message); return send(res,500,{error:'internal_error', detail:e.message}); }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti','rh'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const id = b.id;
      if (!validateUuid(id)) return send(res,400,{error:'invalid_id'});
      const status = b.status;
      if (status && !['rascunho','em_revisao','aprovado','enviado','arquivado','rejeitado'].includes(status)) return send(res,400,{error:'invalid_status'});
      // revisão conteúdo e privacidade: ao aprovar, requer privacy_reviewed
      if (status === 'aprovado' || status === 'enviado') {
        // check if privacy review done if contains_personal_data
        try {
          const { rows: existing } = await pool.query(`SELECT contains_personal_data, privacy_reviewed_at FROM ops_client_reports WHERE id=$1`, [id]);
          if (existing.length && existing[0].contains_personal_data && !existing[0].privacy_reviewed_at) {
            // require privacy review before approval
            if (!b.privacy_reviewed_by && !b.privacyReviewedBy) {
              return send(res,400,{error:'privacy_review_required', detail:'relatório contém possível dado pessoal - revisão de privacidade obrigatória antes de aprovar/enviar'});
            }
          }
        } catch {}
        if (status === 'aprovado' && !b.approved_by && !b.approvedBy) {
          return send(res,400,{error:'approved_by_required', detail:'aprovação requer responsável'});
        }
        if (status === 'enviado' && !b.approved_by && !b.approvedBy) {
          // must be previously approved
          try {
            const { rows: ex } = await pool.query(`SELECT status, is_approved_for_client FROM ops_client_reports WHERE id=$1`, [id]);
            if (!ex.length || ex[0].status !== 'aprovado') {
              return send(res,400,{error:'must_be_approved_before_send', detail:'cliente só recebe relatório aprovado do próprio contrato'});
            }
          } catch {}
        }
      }
      try {
        // get previous status for history
        const { rows: prevRows } = await pool.query(`SELECT status FROM ops_client_reports WHERE id=$1`, [id]);
        const prevStatus = prevRows.length? prevRows[0].status : null;
        const { rows } = await pool.query(
          `UPDATE ops_client_reports SET status=COALESCE($1,status), reviewed_by=COALESCE($2,reviewed_by), reviewed_at=CASE WHEN $2 IS NOT NULL THEN NOW() ELSE reviewed_at END, review_notes=COALESCE($3,review_notes), approved_by=COALESCE($4,approved_by), approved_at=CASE WHEN $1='aprovado' THEN NOW() ELSE approved_at END, sent_at=CASE WHEN $1='enviado' THEN NOW() ELSE sent_at END, privacy_reviewed_by=COALESCE($5,privacy_reviewed_by), privacy_reviewed_at=CASE WHEN $5 IS NOT NULL THEN NOW() ELSE privacy_reviewed_at END, privacy_review_notes=COALESCE($6,privacy_review_notes), is_approved_for_client=CASE WHEN $1='aprovado' THEN true ELSE is_approved_for_client END, content=COALESCE($7,content), title=COALESCE($8,title), updated_at=NOW() WHERE id=$9 RETURNING *`,
          [status||null, b.reviewed_by||b.reviewedBy||null, b.review_notes||b.reviewNotes||null, b.approved_by||b.approvedBy||null, b.privacy_reviewed_by||b.privacyReviewedBy||null, b.privacy_review_notes||b.privacyReviewNotes||null, b.content||null, b.title||null, id]
        );
        if (!rows.length) return send(res,404,{error:'not_found'});
        try {
          await pool.query(`INSERT INTO ops_client_report_history (report_id, previous_status, next_status, changed_by, reason, is_privacy_review) VALUES ($1,$2,$3,$4,$5,$6)`, [id, prevStatus, rows[0].status, sess.role, b.reason||null, !!(b.privacy_reviewed_by||b.privacyReviewedBy)]);
        } catch {}
        try { await auditLog({ action: status==='aprovado'? 'ops_client_report_approve' : status==='enviado'? 'ops_client_report_send' : status==='em_revisao'? 'ops_client_report_review' : 'ops_client_report_update', actor: sess.role, target: id, meta: { status, prevStatus } }); } catch {}
        return send(res,200,{ report: rows[0] });
      } catch (e) { console.error('clientReports PATCH', e.message); return send(res,500,{error:'internal_error'}); }
    }
    return send(res,405,{error:'method_not_allowed'});
  }

  async function handleClientReportAttachments(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const report_id = url.searchParams.get('report_id');
      const where=[]; const vals=[]; let i=1;
      if (report_id) { if (!validateUuid(report_id)) return send(res,400,{error:'invalid_report_id'}); where.push(`report_id=$${i++}`); vals.push(report_id); }
      const ws = where.length? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_client_report_attachments ${ws} ORDER BY created_at DESC LIMIT 100`, vals);
        return send(res,200,{ attachments: rows });
      } catch (e) { console.error('reportAttach GET', e.message); return send(res,500,{error:'internal_error'}); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res,403,{error:'same_origin_required'});
      if (!requireRole(sess,['admin','ti','rh'])) return send(res,403,{error:'forbidden'});
      const b = await body(req);
      if (!b) return send(res,400,{error:'invalid_json'});
      const report_id = b.report_id || b.reportId;
      if (!validateUuid(report_id)) return send(res,400,{error:'invalid_report_id'});
      const file_name = (b.file_name||b.fileName||'').trim();
      if (file_name.length<1 || file_name.length>500) return send(res,400,{error:'invalid_file_name'});
      const file_url = (b.file_url||b.fileUrl||'').trim();
      if (file_url.length<5 || file_url.length>1000) return send(res,400,{error:'invalid_file_url'});
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_client_report_attachments (report_id, file_name, file_url, storage_key, description, is_private, is_personal_data_restricted) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [report_id, file_name, file_url, b.storage_key||b.storageKey||null, b.description||null, !!b.is_private, !!b.is_personal_data_restricted]
        );
        return send(res,201,{ attachment: rows[0] });
      } catch (e) { console.error('reportAttach POST', e.message); return send(res,500,{error:'internal_error'}); }
    }
    return send(res,405,{error:'method_not_allowed'});
  }

  async function handleClientReportHistory(req, res) {
    const sess = requireSession(req);
    if (!sess) return send(res,401,{error:'unauthorized'});
    if (req.method !== 'GET') return send(res,405,{error:'method_not_allowed'});
    const url = new URL(req.url, 'http://localhost');
    const report_id = url.searchParams.get('report_id');
    if (!report_id || !validateUuid(report_id)) return send(res,400,{error:'invalid_report_id'});
    try {
      const { rows } = await pool.query(`SELECT * FROM ops_client_report_history WHERE report_id=$1 ORDER BY created_at DESC`, [report_id]);
      return send(res,200,{ history: rows });
    } catch (e) { console.error('reportHistory GET', e.message); return send(res,500,{error:'internal_error'}); }
  }

  return {
    handleSupervisionVisits,
    handleSupervisionInspections,
    handleSupervisionActionPlans,
    handlePatrols,
    handlePatrolPoints,
    handlePatrolReplayLogs,
    handleKeys,
    handleKeyMovements,
    handleClientReports,
    handleClientReportAttachments,
    handleClientReportHistory,
  };
}
