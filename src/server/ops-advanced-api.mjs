/**
 * OPS-05/06/07/08 — Operação avançada: cobertura, passagem, ocorrências, checklists
 * OPS-05: ausência abre pendência cobertura, candidatos substituição disponibilidade/qualificação, decisão humana e comunicação
 * OPS-06: passagem plantão origem/destino pendências aceite escalonamento não aceite
 * OPS-07: livro ocorrências categoria/severidade responsável ações encerramento evidências privadas histórico imutável retificação
 * OPS-08: checklists por serviço/cliente versão frequência itens obrigatórios evidências proporcionais
 */

function validateUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function createOpsAdvancedApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  function send(res, status, data) { res.writeHead(status, headers); res.end(JSON.stringify(data)); }
  async function body(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return null; }
  }

  // ---- OPS-05 Coverage Requests ----
  async function handleCoverageRequests(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const post_id = url.searchParams.get('post_id');
      const status = url.searchParams.get('status');
      const where = [];
      const vals = [];
      let i = 1;
      if (post_id) { if (!validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' }); where.push(`post_id=$${i++}`); vals.push(post_id); }
      if (status) { where.push(`status=$${i++}`); vals.push(status); }
      const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_coverage_requests ${ws} ORDER BY requested_at DESC LIMIT 100`, vals);
        return send(res, 200, { requests: rows });
      } catch (e) { console.error('covReq GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const post_id = b.post_id || b.postId;
      if (!validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' });
      const gap_id = b.gap_id || b.gapId;
      if (gap_id && !validateUuid(gap_id)) return send(res, 400, { error: 'invalid_gap_id' });
      const absence_id = b.absence_id || b.absenceId;
      if (absence_id && !validateUuid(absence_id)) return send(res, 400, { error: 'invalid_absence_id' });
      // ausência abre pendência cobertura - se absence_id informado, cria automaticamente
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_coverage_requests (gap_id, post_id, absence_id, absence_notice_id, status, responsible_id, responsible_name, is_human_decision, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [gap_id || null, post_id, absence_id || null, b.absence_notice_id || b.absenceNoticeId || null, b.status || 'aberto', b.responsible_id || b.responsibleId || null, b.responsible_name || b.responsibleName || null, true, sess.role]
        );
        try { await auditLog({ action: 'ops_coverage_request_create', actor: sess.role, target: rows[0].id, meta: { post_id, gap_id } }); } catch {}
        return send(res, 201, { request: rows[0], note: 'ausência abre pendência cobertura' });
      } catch (e) { console.error('covReq POST', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const status = b.status;
      if (status && !['aberto','em_busca','candidato_encontrado','aprovado','resolvido','cancelado'].includes(status)) return send(res, 400, { error: 'invalid_status' });
      // decisão humana obrigatória
      if (status === 'aprovado' || status === 'resolvido') {
        if (!b.decision_by && !b.decisionBy) return send(res, 400, { error: 'decision_by_required', detail: 'decisão humana obrigatória' });
      }
      try {
        const { rows } = await pool.query(
          `UPDATE ops_coverage_requests SET status=COALESCE($1,status), responsible_name=COALESCE($2,responsible_name), decision_by=COALESCE($3,decision_by), decision_at=CASE WHEN $1 IN ('aprovado','resolvido') THEN NOW() ELSE decision_at END, decision_reason=COALESCE($4,decision_reason), resolved_at=CASE WHEN $1='resolvido' THEN NOW() ELSE resolved_at END, updated_at=NOW() WHERE id=$5 RETURNING *`,
          [status || null, b.responsible_name || b.responsibleName || null, b.decision_by || b.decisionBy || sess.role, b.decision_reason || b.decisionReason || null, id]
        );
        if (!rows[0]) return send(res, 404, { error: 'not_found' });
        return send(res, 200, { request: rows[0] });
      } catch (e) { console.error('covReq PATCH', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ---- OPS-05 Substitution Candidates ----
  async function handleSubstitutionCandidates(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const coverage_request_id = url.searchParams.get('coverage_request_id');
      const where = [];
      const vals = [];
      let i = 1;
      if (coverage_request_id) { if (!validateUuid(coverage_request_id)) return send(res, 400, { error: 'invalid_coverage_request_id' }); where.push(`coverage_request_id=$${i++}`); vals.push(coverage_request_id); }
      const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_substitution_candidates ${ws} ORDER BY score DESC NULLS LAST, availability_status LIMIT 100`, vals);
        return send(res, 200, { candidates: rows });
      } catch (e) { console.error('subCand GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const coverage_request_id = b.coverage_request_id || b.coverageRequestId;
      const employee_id = b.employee_id || b.employeeId;
      if (!validateUuid(coverage_request_id) || !validateUuid(employee_id)) return send(res, 400, { error: 'invalid_ids' });
      const availability_status = b.availability_status || b.availabilityStatus || 'em_validacao';
      if (!['disponivel','indisponivel','em_validacao','em_descanso','em_outro_posto'].includes(availability_status)) return send(res, 400, { error: 'invalid_availability_status' });
      // Verificar disponibilidade/qualificação
      let qualification_match = false;
      try {
        // Busca role do post need e qualificação employee
        const reqRow = await pool.query(`SELECT post_id FROM ops_coverage_requests WHERE id=$1`, [coverage_request_id]);
        if (reqRow.rows[0]) {
          const post_id = reqRow.rows[0].post_id;
          const needs = await pool.query(`SELECT role_id FROM ops_post_shift_needs WHERE post_id=$1 LIMIT 1`, [post_id]);
          const role_id = needs.rows[0]?.role_id;
          if (role_id) {
            const qual = await pool.query(`SELECT id FROM ops_employee_qualifications WHERE employee_id=$1 AND role_id=$2 AND is_valid=true AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)`, [employee_id, role_id]);
            qualification_match = !!qual.rows[0];
          } else {
            qualification_match = true; // sem role exigido
          }
        }
      } catch {}
      const distance_km = b.distance_km !== undefined ? Number(b.distance_km) : (b.distanceKm !== undefined ? Number(b.distanceKm) : null);
      const score = b.score !== undefined ? Number(b.score) : null;
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_substitution_candidates (coverage_request_id, employee_id, availability_status, qualification_match, distance_km, score, is_selected, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (coverage_request_id, employee_id) DO UPDATE SET availability_status=$3, qualification_match=$4, distance_km=$5, score=$6, notes=$8, updated_at=NOW()
           RETURNING *`,
          [coverage_request_id, employee_id, availability_status, qualification_match, distance_km, score, b.is_selected ? true : false, b.notes ? String(b.notes).trim().slice(0,1000) : null]
        );
        return send(res, 201, { candidate: rows[0], note: 'candidato por disponibilidade/qualificação' });
      } catch (e) { console.error('subCand POST', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const is_selected = b.is_selected !== undefined ? !!b.is_selected : (b.isSelected !== undefined ? !!b.isSelected : undefined);
      try {
        if (is_selected) {
          // Decisão humana: selecionar candidato
          const cur = await pool.query(`SELECT coverage_request_id FROM ops_substitution_candidates WHERE id=$1`, [id]);
          if (!cur.rows[0]) return send(res, 404, { error: 'not_found' });
          // Desmarca outros
          await pool.query(`UPDATE ops_substitution_candidates SET is_selected=false, updated_at=NOW() WHERE coverage_request_id=$1`, [cur.rows[0].coverage_request_id]);
          const { rows } = await pool.query(`UPDATE ops_substitution_candidates SET is_selected=true, selected_at=NOW(), selected_by=$1, updated_at=NOW() WHERE id=$2 RETURNING *`, [sess.role, id]);
          // Atualiza request para candidato_encontrado
          await pool.query(`UPDATE ops_coverage_requests SET status='candidato_encontrado', updated_at=NOW() WHERE id=$1`, [cur.rows[0].coverage_request_id]);
          return send(res, 200, { candidate: rows[0], note: 'decisão humana selecionar candidato' });
        } else {
          const { rows } = await pool.query(`UPDATE ops_substitution_candidates SET availability_status=COALESCE($1,availability_status), score=COALESCE($2,score), notes=COALESCE($3,notes), updated_at=NOW() WHERE id=$4 RETURNING *`, [b.availability_status || b.availabilityStatus || null, b.score !== undefined ? Number(b.score) : null, b.notes ? String(b.notes).trim().slice(0,1000) : null, id]);
          if (!rows[0]) return send(res, 404, { error: 'not_found' });
          return send(res, 200, { candidate: rows[0] });
        }
      } catch (e) { console.error('subCand PATCH', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ---- OPS-05 Coverage Communications ----
  async function handleCoverageCommunications(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const coverage_request_id = url.searchParams.get('coverage_request_id');
      if (!coverage_request_id || !validateUuid(coverage_request_id)) return send(res, 400, { error: 'invalid_coverage_request_id' });
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_coverage_communications WHERE coverage_request_id=$1 ORDER BY sent_at DESC LIMIT 100`, [coverage_request_id]);
        return send(res, 200, { communications: rows });
      } catch (e) { console.error('covComm GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const coverage_request_id = b.coverage_request_id || b.coverageRequestId;
      if (!validateUuid(coverage_request_id)) return send(res, 400, { error: 'invalid_coverage_request_id' });
      const recipient_type = b.recipient_type || b.recipientType;
      if (!['employee','supervisor','rh','outro'].includes(recipient_type)) return send(res, 400, { error: 'invalid_recipient_type' });
      const channel = b.channel || 'sistema';
      if (!['email','whatsapp','sistema','outro'].includes(channel)) return send(res, 400, { error: 'invalid_channel' });
      const message = String(b.message || '').trim();
      if (message.length < 10 || message.length > 2000) return send(res, 400, { error: 'invalid_message', detail: '10-2000' });
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_coverage_communications (coverage_request_id, recipient_type, recipient_id, recipient_name, channel, message, is_confirmed)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [coverage_request_id, recipient_type, b.recipient_id || b.recipientId || null, b.recipient_name || b.recipientName || null, channel, message, b.is_confirmed ? true : false]
        );
        return send(res, 201, { communication: rows[0], note: 'comunicação cobertura decisão humana' });
      } catch (e) { console.error('covComm POST', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ---- OPS-06 Handovers ----
  async function handleHandovers(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const post_id = url.searchParams.get('post_id');
      const status = url.searchParams.get('status');
      const from_employee_id = url.searchParams.get('from_employee_id');
      const where = [];
      const vals = [];
      let i = 1;
      if (post_id) { if (!validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' }); where.push(`from_post_id=$${i++}`); vals.push(post_id); }
      if (status) { where.push(`status=$${i++}`); vals.push(status); }
      if (from_employee_id) { if (!validateUuid(from_employee_id)) return send(res, 400, { error: 'invalid_from_employee_id' }); where.push(`from_employee_id=$${i++}`); vals.push(from_employee_id); }
      const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_handovers ${ws} ORDER BY handover_date DESC LIMIT 100`, vals);
        return send(res, 200, { handovers: rows });
      } catch (e) { console.error('handovers GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const from_employee_id = b.from_employee_id || b.fromEmployeeId;
      if (!validateUuid(from_employee_id)) return send(res, 400, { error: 'invalid_from_employee_id' });
      const from_post_id = b.from_post_id || b.fromPostId;
      if (from_post_id && !validateUuid(from_post_id)) return send(res, 400, { error: 'invalid_from_post_id' });
      const to_employee_id = b.to_employee_id || b.toEmployeeId;
      if (to_employee_id && !validateUuid(to_employee_id)) return send(res, 400, { error: 'invalid_to_employee_id' });
      if (from_employee_id === to_employee_id) return send(res, 400, { error: 'same_employee' });
      const protocol = `HND-OPS-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_handovers (protocol, from_post_id, from_employee_id, to_employee_id, shift_template_id, handover_date, pending_tasks, keys_handover, equipment_handover, occurrences_summary, status, is_private, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [protocol, from_post_id || null, from_employee_id, to_employee_id || null, b.shift_template_id || b.shiftTemplateId || null, b.handover_date || b.handoverDate || new Date().toISOString(), b.pending_tasks || b.pendingTasks || null, JSON.stringify(b.keys_handover || b.keysHandover || []), JSON.stringify(b.equipment_handover || b.equipmentHandover || []), b.occurrences_summary || b.occurrencesSummary || null, 'pendente', b.is_private !== undefined ? !!b.is_private : true, b.notes ? String(b.notes).trim().slice(0,2000) : null, sess.role]
        );
        try { await auditLog({ action: 'ops_handover_create', actor: sess.role, target: rows[0].id, meta: { protocol } }); } catch {}
        return send(res, 201, { handover: rows[0] });
      } catch (e) { console.error('handovers POST', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const status = b.status;
      if (status && !['pendente','em_andamento','aceito','recusado','encerrado','cancelado','escalonado'].includes(status)) return send(res, 400, { error: 'invalid_status' });
      // Aceite e escalonamento
      try {
        const cur = await pool.query(`SELECT status, escalation_level FROM ops_handovers WHERE id=$1`, [id]);
        if (!cur.rows[0]) return send(res, 404, { error: 'not_found' });
        if (status === 'aceito') {
          const { rows } = await pool.query(`UPDATE ops_handovers SET status='aceito', accepted_at=NOW(), accepted_by=$1, updated_at=NOW() WHERE id=$2 RETURNING *`, [sess.role, id]);
          return send(res, 200, { handover: rows[0] });
        }
        if (status === 'recusado') {
          if (!b.rejection_reason && !b.rejectionReason) return send(res, 400, { error: 'rejection_reason_required' });
          const { rows } = await pool.query(`UPDATE ops_handovers SET status='recusado', rejection_reason=$1, updated_at=NOW() WHERE id=$2 RETURNING *`, [b.rejection_reason || b.rejectionReason, id]);
          return send(res, 200, { handover: rows[0] });
        }
        if (status === 'escalonado') {
          if (!b.reason && !b.escalation_reason) return send(res, 400, { error: 'escalation_reason_required' });
          const newLevel = (cur.rows[0].escalation_level || 0) + 1;
          const { rows } = await pool.query(`UPDATE ops_handovers SET status='escalonado', escalation_level=$1, escalated_at=NOW(), escalated_to=$2, updated_at=NOW() WHERE id=$3 RETURNING *`, [newLevel, b.escalated_to || b.escalatedTo || null, id]);
          await pool.query(`INSERT INTO ops_handover_escalations (handover_id, from_level, to_level, reason, escalated_by, notified_to) VALUES ($1,$2,$3,$4,$5,$6)`, [id, cur.rows[0].escalation_level || 0, newLevel, b.reason || b.escalation_reason || b.escalationReason, sess.role, b.escalated_to || b.escalatedTo || null]);
          return send(res, 200, { handover: rows[0], note: 'escalonamento não aceite' });
        }
        const { rows } = await pool.query(`UPDATE ops_handovers SET status=COALESCE($1,status), notes=COALESCE($2,notes), updated_at=NOW() WHERE id=$3 RETURNING *`, [status || null, b.notes ? String(b.notes).trim().slice(0,2000) : null, id]);
        return send(res, 200, { handover: rows[0] });
      } catch (e) { console.error('handovers PATCH', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  async function handleHandoverEscalations(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const handover_id = url.searchParams.get('handover_id');
      if (!handover_id || !validateUuid(handover_id)) return send(res, 400, { error: 'invalid_handover_id' });
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_handover_escalations WHERE handover_id=$1 ORDER BY escalated_at DESC LIMIT 50`, [handover_id]);
        return send(res, 200, { escalations: rows });
      } catch (e) { console.error('handoverEsc GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ---- OPS-07 Occurrence Book ----
  async function handleOccurrenceBook(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const post_id = url.searchParams.get('post_id');
      const category = url.searchParams.get('category');
      const severity = url.searchParams.get('severity');
      const status = url.searchParams.get('status');
      const where = [];
      const vals = [];
      let i = 1;
      if (post_id) { if (!validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' }); where.push(`post_id=$${i++}`); vals.push(post_id); }
      if (category) { where.push(`category=$${i++}`); vals.push(category); }
      if (severity) { where.push(`severity=$${i++}`); vals.push(severity); }
      if (status) { where.push(`status=$${i++}`); vals.push(status); }
      const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_occurrence_book ${ws} ORDER BY occurred_at DESC LIMIT 100`, vals);
        return send(res, 200, { occurrences: rows });
      } catch (e) { console.error('occBook GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const post_id = b.post_id || b.postId;
      if (post_id && !validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' });
      const employee_id = b.employee_id || b.employeeId;
      if (employee_id && !validateUuid(employee_id)) return send(res, 400, { error: 'invalid_employee_id' });
      const title = String(b.title || '').trim();
      const description = String(b.description || '').trim();
      if (title.length < 5 || title.length > 200) return send(res, 400, { error: 'invalid_title', detail: '5-200' });
      if (description.length < 10 || description.length > 5000) return send(res, 400, { error: 'invalid_description', detail: '10-5000' });
      const category = b.category || 'operacional';
      if (!['seguranca','operacional','manutencao','limpeza','comportamental','cliente','equipamento','acesso','outro'].includes(category)) return send(res, 400, { error: 'invalid_category' });
      const severity = b.severity || 'media';
      if (!['baixa','media','alta','critica'].includes(severity)) return send(res, 400, { error: 'invalid_severity' });
      // Restrição informações pessoais
      const lowerDesc = description.toLowerCase();
      const hasPersonal = /(cpf|rg|prontuario|diagnostico|exame|doen[cç]a)/i.test(lowerDesc);
      const protocol = `OCC-OPS-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_occurrence_book (protocol, post_id, employee_id, category, severity, title, description, occurred_at, location, status, responsible_id, responsible_name, is_private, is_personal_data_restricted, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
          [protocol, post_id || null, employee_id || null, category, severity, title, description, b.occurred_at || b.occurredAt || new Date().toISOString(), b.location || null, 'aberto', b.responsible_id || b.responsibleId || null, b.responsible_name || b.responsibleName || null, b.is_private !== undefined ? !!b.is_private : true, hasPersonal || !!b.is_personal_data_restricted, sess.role]
        );
        await pool.query(`INSERT INTO ops_occurrence_history (occurrence_id, previous_status, next_status, next_description, changed_by, reason, is_retification) VALUES ($1,NULL,$2,$3,$4,$5,false)`, [rows[0].id, 'aberto', description, sess.role, 'Criação inicial']);
        try { await auditLog({ action: 'ops_occurrence_create', actor: sess.role, target: rows[0].id, meta: { protocol, category, severity } }); } catch {}
        return send(res, 201, { occurrence: rows[0], note: hasPersonal ? 'informações pessoais restritas detectadas' : undefined });
      } catch (e) { console.error('occBook POST', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const status = b.status;
      if (status && !['aberto','em_analise','em_tratamento','resolvido','encerrado','cancelado','retificado'].includes(status)) return send(res, 400, { error: 'invalid_status' });
      const is_retification = !!b.is_retification || !!b.isRetification;
      try {
        const cur = await pool.query(`SELECT status, description FROM ops_occurrence_book WHERE id=$1`, [id]);
        if (!cur.rows[0]) return send(res, 404, { error: 'not_found' });
        const prevStatus = cur.rows[0].status;
        const prevDesc = cur.rows[0].description;
        const nextDesc = b.description ? String(b.description).trim() : prevDesc;
        if (is_retification && !b.reason) return send(res, 400, { error: 'reason_required_for_retification' });
        const { rows } = await pool.query(
          `UPDATE ops_occurrence_book SET status=COALESCE($1,status), description=COALESCE($2,description), resolution_notes=COALESCE($3,resolution_notes), responsible_name=COALESCE($4,responsible_name), resolved_at=CASE WHEN $1 IN ('resolvido','encerrado') THEN NOW() ELSE resolved_at END, resolved_by=CASE WHEN $1 IN ('resolvido','encerrado') THEN $5 ELSE resolved_by END, retification_count=CASE WHEN $6 THEN retification_count+1 ELSE retification_count END, updated_at=NOW() WHERE id=$7 RETURNING *`,
          [status || null, b.description ? String(b.description).trim() : null, b.resolution_notes || b.resolutionNotes || null, b.responsible_name || b.responsibleName || null, sess.role, is_retification, id]
        );
        // Histórico imutável
        await pool.query(`INSERT INTO ops_occurrence_history (occurrence_id, previous_status, next_status, previous_description, next_description, changed_by, reason, is_retification) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, prevStatus, status || prevStatus, prevDesc, nextDesc, sess.role, b.reason || null, is_retification]);
        return send(res, 200, { occurrence: rows[0], retification: is_retification });
      } catch (e) { console.error('occBook PATCH', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  async function handleOccurrenceEvidences(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const occurrence_id = url.searchParams.get('occurrence_id');
      if (!occurrence_id || !validateUuid(occurrence_id)) return send(res, 400, { error: 'invalid_occurrence_id' });
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_occurrence_evidences WHERE occurrence_id=$1 ORDER BY created_at DESC LIMIT 50`, [occurrence_id]);
        return send(res, 200, { evidences: rows });
      } catch (e) { console.error('occEvid GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const occurrence_id = b.occurrence_id || b.occurrenceId;
      if (!validateUuid(occurrence_id)) return send(res, 400, { error: 'invalid_occurrence_id' });
      const file_name = String(b.file_name || b.fileName || '').trim();
      const file_url = String(b.file_url || b.fileUrl || '').trim();
      if (file_name.length < 1 || file_name.length > 500) return send(res, 400, { error: 'invalid_file_name' });
      if (file_url.length < 5 || file_url.length > 1000) return send(res, 400, { error: 'invalid_file_url' });
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_occurrence_evidences (occurrence_id, file_name, file_url, storage_key, is_private, is_personal_data_restricted, uploaded_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [occurrence_id, file_name, file_url, b.storage_key || b.storageKey || null, b.is_private !== undefined ? !!b.is_private : true, !!b.is_personal_data_restricted, sess.role]
        );
        return send(res, 201, { evidence: rows[0], note: 'evidência privada' });
      } catch (e) { console.error('occEvid POST', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  async function handleOccurrenceActions(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const occurrence_id = url.searchParams.get('occurrence_id');
      if (!occurrence_id || !validateUuid(occurrence_id)) return send(res, 400, { error: 'invalid_occurrence_id' });
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_occurrence_actions WHERE occurrence_id=$1 ORDER BY due_date NULLS LAST LIMIT 100`, [occurrence_id]);
        return send(res, 200, { actions: rows });
      } catch (e) { console.error('occAction GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const occurrence_id = b.occurrence_id || b.occurrenceId;
      if (!validateUuid(occurrence_id)) return send(res, 400, { error: 'invalid_occurrence_id' });
      const action_type = String(b.action_type || b.actionType || '').trim();
      const description = String(b.description || '').trim();
      if (action_type.length < 3 || action_type.length > 100) return send(res, 400, { error: 'invalid_action_type' });
      if (description.length < 10 || description.length > 2000) return send(res, 400, { error: 'invalid_description' });
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_occurrence_actions (occurrence_id, action_type, description, responsible_name, due_date, status, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [occurrence_id, action_type, description, b.responsible_name || b.responsibleName || null, b.due_date || b.dueDate || null, b.status || 'pendente', b.notes ? String(b.notes).trim().slice(0,1000) : null, sess.role]
        );
        return send(res, 201, { action: rows[0] });
      } catch (e) { console.error('occAction POST', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const status = b.status;
      if (status && !['pendente','em_andamento','concluida','cancelada'].includes(status)) return send(res, 400, { error: 'invalid_status' });
      try {
        const { rows } = await pool.query(`UPDATE ops_occurrence_actions SET status=COALESCE($1,status), notes=COALESCE($2,notes), completed_at=CASE WHEN $1='concluida' THEN NOW() ELSE completed_at END, updated_at=NOW() WHERE id=$3 RETURNING *`, [status || null, b.notes ? String(b.notes).trim().slice(0,1000) : null, id]);
        if (!rows[0]) return send(res, 404, { error: 'not_found' });
        return send(res, 200, { action: rows[0] });
      } catch (e) { console.error('occAction PATCH', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  async function handleOccurrenceHistory(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const occurrence_id = url.searchParams.get('occurrence_id');
      if (!occurrence_id || !validateUuid(occurrence_id)) return send(res, 400, { error: 'invalid_occurrence_id' });
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_occurrence_history WHERE occurrence_id=$1 ORDER BY created_at DESC LIMIT 100`, [occurrence_id]);
        return send(res, 200, { history: rows, note: 'histórico imutável de retificação' });
      } catch (e) { console.error('occHist GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ---- OPS-08 Checklist Templates ----
  async function handleChecklistTemplates(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const service_type = url.searchParams.get('service_type');
      const where = [];
      const vals = [];
      let i = 1;
      if (service_type) { where.push(`service_type=$${i++}`); vals.push(service_type); }
      const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_checklist_templates ${ws} ORDER BY title, version DESC LIMIT 100`, vals);
        return send(res, 200, { templates: rows });
      } catch (e) { console.error('checkTpl GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const title = String(b.title || '').trim();
      if (title.length < 5 || title.length > 200) return send(res, 400, { error: 'invalid_title' });
      const service_type = b.service_type || b.serviceType || null;
      const frequency = b.frequency || 'diaria';
      if (!['diaria','semanal','quinzenal','mensal','trimestral','sob_demanda','por_visita','outro'].includes(frequency)) return send(res, 400, { error: 'invalid_frequency' });
      const required_items = b.required_items || b.requiredItems || [];
      if (!Array.isArray(required_items)) return send(res, 400, { error: 'invalid_required_items' });
      try {
        const vRes = await pool.query(`SELECT COALESCE(MAX(version),0)+1 AS v FROM ops_checklist_templates WHERE title=$1`, [title]);
        const version = vRes.rows[0].v;
        const { rows } = await pool.query(
          `INSERT INTO ops_checklist_templates (company_id, service_type, title, version, description, frequency, is_mandatory, required_items, status, is_active, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [b.company_id || b.companyId || null, service_type, title, version, b.description ? String(b.description).trim().slice(0,2000) : null, frequency, !!b.is_mandatory, JSON.stringify(required_items), b.status || 'ativo', b.is_active !== undefined ? !!b.is_active : true, sess.role]
        );
        return send(res, 201, { template: rows[0] });
      } catch (e) {
        if (e.code === '23505') return send(res, 409, { error: 'duplicate_template_version' });
        console.error('checkTpl POST', e.message); return send(res, 500, { error: 'internal_error' });
      }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      try {
        const { rows } = await pool.query(`UPDATE ops_checklist_templates SET description=COALESCE($1,description), frequency=COALESCE($2,frequency), is_mandatory=COALESCE($3,is_mandatory), status=COALESCE($4,status), is_active=COALESCE($5,is_active), updated_at=NOW() WHERE id=$6 RETURNING *`, [b.description ? String(b.description).trim().slice(0,2000) : null, b.frequency || null, b.is_mandatory !== undefined ? !!b.is_mandatory : null, b.status || null, b.is_active !== undefined ? !!b.is_active : null, id]);
        if (!rows[0]) return send(res, 404, { error: 'not_found' });
        return send(res, 200, { template: rows[0] });
      } catch (e) { console.error('checkTpl PATCH', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ---- OPS-08 Checklist Instances ----
  async function handleChecklistInstances(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const template_id = url.searchParams.get('template_id');
      const post_id = url.searchParams.get('post_id');
      const where = [];
      const vals = [];
      let i = 1;
      if (template_id) { if (!validateUuid(template_id)) return send(res, 400, { error: 'invalid_template_id' }); where.push(`template_id=$${i++}`); vals.push(template_id); }
      if (post_id) { if (!validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' }); where.push(`post_id=$${i++}`); vals.push(post_id); }
      const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_checklist_instances ${ws} ORDER BY scheduled_date DESC LIMIT 100`, vals);
        return send(res, 200, { instances: rows });
      } catch (e) { console.error('checkInst GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const template_id = b.template_id || b.templateId;
      if (!validateUuid(template_id)) return send(res, 400, { error: 'invalid_template_id' });
      const scheduled_date = b.scheduled_date || b.scheduledDate;
      if (!scheduled_date) return send(res, 400, { error: 'scheduled_date_required' });
      const post_id = b.post_id || b.postId;
      if (post_id && !validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' });
      const employee_id = b.employee_id || b.employeeId;
      if (employee_id && !validateUuid(employee_id)) return send(res, 400, { error: 'invalid_employee_id' });
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_checklist_instances (template_id, post_id, employee_id, scheduled_date, status, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [template_id, post_id || null, employee_id || null, scheduled_date, b.status || 'pendente', b.notes ? String(b.notes).trim().slice(0,2000) : null, sess.role]
        );
        // Cria itens a partir do template required_items
        try {
          const tpl = await pool.query(`SELECT required_items FROM ops_checklist_templates WHERE id=$1`, [template_id]);
          const items = tpl.rows[0]?.required_items;
          if (Array.isArray(items)) {
            for (const it of items) {
              const desc = typeof it === 'string' ? it : (it.desc || it.description || '');
              const reqd = typeof it === 'object' ? !!it.required : false;
              if (desc) {
                await pool.query(`INSERT INTO ops_checklist_items (instance_id, item_description, is_required, is_checked) VALUES ($1,$2,$3,false)`, [rows[0].id, String(desc).slice(0,500), reqd]);
              }
            }
          }
        } catch {}
        return send(res, 201, { instance: rows[0], note: 'itens obrigatórios gerados a partir do template' });
      } catch (e) { console.error('checkInst POST', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const status = b.status;
      if (status && !['pendente','em_andamento','concluido','cancelado','nao_aplicavel'].includes(status)) return send(res, 400, { error: 'invalid_status' });
      try {
        const { rows } = await pool.query(
          `UPDATE ops_checklist_instances SET status=COALESCE($1,status), executed_at=CASE WHEN $1='concluido' THEN NOW() ELSE executed_at END, score=$2, notes=COALESCE($3,notes), updated_at=NOW() WHERE id=$4 RETURNING *`,
          [status || null, b.score !== undefined ? Number(b.score) : null, b.notes ? String(b.notes).trim().slice(0,2000) : null, id]
        );
        if (!rows[0]) return send(res, 404, { error: 'not_found' });
        return send(res, 200, { instance: rows[0] });
      } catch (e) { console.error('checkInst PATCH', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  async function handleChecklistItems(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const instance_id = url.searchParams.get('instance_id');
      if (!instance_id || !validateUuid(instance_id)) return send(res, 400, { error: 'invalid_instance_id' });
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_checklist_items WHERE instance_id=$1 ORDER BY is_required DESC, item_description LIMIT 200`, [instance_id]);
        return send(res, 200, { items: rows });
      } catch (e) { console.error('checkItems GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const instance_id = b.instance_id || b.instanceId;
      if (!validateUuid(instance_id)) return send(res, 400, { error: 'invalid_instance_id' });
      const item_description = String(b.item_description || b.itemDescription || '').trim();
      if (item_description.length < 3 || item_description.length > 500) return send(res, 400, { error: 'invalid_item_description' });
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_checklist_items (instance_id, item_description, is_required, is_checked, evidence_url, notes)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [instance_id, item_description, !!b.is_required, !!b.is_checked, b.evidence_url || b.evidenceUrl || null, b.notes ? String(b.notes).trim().slice(0,1000) : null]
        );
        return send(res, 201, { item: rows[0] });
      } catch (e) { console.error('checkItems POST', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      try {
        const { rows } = await pool.query(
          `UPDATE ops_checklist_items SET is_checked=COALESCE($1,is_checked), evidence_url=COALESCE($2,evidence_url), notes=COALESCE($3,notes), checked_at=CASE WHEN $1=true THEN NOW() ELSE checked_at END, checked_by=CASE WHEN $1=true THEN $4 ELSE checked_by END WHERE id=$5 RETURNING *`,
          [b.is_checked !== undefined ? !!b.is_checked : (b.isChecked !== undefined ? !!b.isChecked : null), b.evidence_url || b.evidenceUrl || null, b.notes ? String(b.notes).trim().slice(0,1000) : null, sess.role, id]
        );
        if (!rows[0]) return send(res, 404, { error: 'not_found' });
        // Se todos obrigatórios checked, marca instance como concluido com evidências proporcionais
        try {
          const inst = await pool.query(`SELECT instance_id FROM ops_checklist_items WHERE id=$1`, [id]);
          if (inst.rows[0]) {
            const pending = await pool.query(`SELECT COUNT(*)::int AS c FROM ops_checklist_items WHERE instance_id=$1 AND is_required=true AND is_checked=false`, [inst.rows[0].instance_id]);
            if (pending.rows[0].c === 0) {
              await pool.query(`UPDATE ops_checklist_instances SET status='concluido', executed_at=NOW(), updated_at=NOW() WHERE id=$1 AND status != 'concluido'`, [inst.rows[0].instance_id]);
            }
          }
        } catch {}
        return send(res, 200, { item: rows[0], note: 'evidências proporcionais, itens obrigatórios verificados' });
      } catch (e) { console.error('checkItems PATCH', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  return {
    handleCoverageRequests,
    handleSubstitutionCandidates,
    handleCoverageCommunications,
    handleHandovers,
    handleHandoverEscalations,
    handleOccurrenceBook,
    handleOccurrenceEvidences,
    handleOccurrenceActions,
    handleOccurrenceHistory,
    handleChecklistTemplates,
    handleChecklistInstances,
    handleChecklistItems,
  };
}
