/**
 * OPS-05/06/07/08 — Operação avançada: cobertura, passagem, ocorrências, checklists
 * Hardened for Fatia B:
 * - Contratos canônicos L05 crm_contracts (bloqueio de contrato encerrado/cancelado/suspenso)
 * - Funcionários ativos hr_employees (bloqueio de desligado/afastado)
 * - Validação de postos, escopo e anti troca de ID
 * - Conflito de turno/sobreposição e qualificação para substitutos
 * - Histórico imutável de retificação em ocorrências
 * - Evidências privadas vinculadas a documentos L02 com validação de escopo
 * - Validação de itens obrigatórios para finalização de checklist
 * - Idempotência em retry de ciência e execução
 * - Transações atômicas com audit_log fail-closed (503 sem efeito parcial)
 */

function validateUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

const NON_OPERATIONAL_CONTRACT_STATUSES = ['encerrado', 'cancelado', 'suspenso'];

export function createOpsAdvancedApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  function send(res, status, data) {
    res.writeHead(status, headers);
    res.end(JSON.stringify(data));
  }
  async function body(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) return {};
    try { return JSON.parse(raw); } catch { return null; }
  }

  async function getOperationalPost(clientOrPool, postId) {
    const pr = await clientOrPool.query(
      `SELECT p.id, p.is_active, p.contract_id, p.unit_id, p.company_id, c.status AS contract_status
         FROM ops_posts p
         LEFT JOIN crm_contracts c ON c.id = p.contract_id
        WHERE p.id = $1`,
      [postId]
    );
    const post = pr.rows[0];
    if (!post) return { error: 'post_not_found', status: 404 };
    if (post.is_active === false) return { error: 'post_inactive', status: 409 };
    if (post.contract_id && NON_OPERATIONAL_CONTRACT_STATUSES.includes(post.contract_status)) {
      return { error: 'contract_not_operational', status: 409, contract_status: post.contract_status };
    }
    return { post };
  }

  async function getOperationalEmployee(clientOrPool, employeeId) {
    const er = await clientOrPool.query(
      `SELECT id, status, display_name FROM hr_employees WHERE id = $1`,
      [employeeId]
    );
    const emp = er.rows[0];
    if (!emp) return { error: 'employee_not_found', status: 404 };
    if (emp.status !== 'ativo') return { error: 'employee_not_operational', status: 409, employee_status: emp.status };
    return { employee: emp };
  }

  async function checkCandidateConflict(clientOrPool, employeeId, coverageDate, shiftTemplateId) {
    if (!shiftTemplateId || !coverageDate) return false;
    const overlap = await clientOrPool.query(
      `SELECT a.id FROM ops_allocations a
       JOIN ops_shift_templates st ON st.id = a.shift_template_id
       JOIN ops_shift_templates st2 ON st2.id = $3
       WHERE a.employee_id = $1 AND a.allocation_date = $2
       AND (
         a.shift_template_id = $3
         OR (st.start_time < st.end_time AND st2.start_time < st2.end_time AND st.start_time < st2.end_time AND st.end_time > st2.start_time)
         OR (st.start_time >= st.end_time OR st2.start_time >= st2.end_time)
       )`,
      [employeeId, coverageDate, shiftTemplateId]
    );
    return overlap.rows.length > 0;
  }

  async function checkCandidateQualification(clientOrPool, postId, employeeId) {
    const needs = await clientOrPool.query(
      `SELECT role_id FROM ops_post_shift_needs WHERE post_id = $1 AND role_id IS NOT NULL LIMIT 1`,
      [postId]
    );
    const roleId = needs.rows[0]?.role_id;
    if (!roleId) return { qualified: true };
    const qual = await clientOrPool.query(
      `SELECT id FROM ops_employee_qualifications
        WHERE employee_id = $1 AND role_id = $2 AND is_valid = true AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)`,
      [employeeId, roleId]
    );
    if (qual.rows[0]) return { qualified: true, roleId };
    return { qualified: false, roleId, reason: 'unqualified_for_post_role' };
  }

  async function validateDocumentScope(clientOrPool, clientDocumentId, contractId) {
    if (!clientDocumentId) return { ok: true };
    if (!validateUuid(clientDocumentId)) return { error: 'invalid_document_id', status: 400 };
    const doc = await clientOrPool.query(
      `SELECT id, contract_id, client_account_id FROM client_documents WHERE id = $1`,
      [clientDocumentId]
    );
    if (!doc.rows[0]) return { error: 'document_not_found', status: 404 };
    if (contractId) {
      const portal = await clientOrPool.query(
        `SELECT client_contract_id FROM crm_contract_portal_links WHERE contract_id = $1`,
        [contractId]
      );
      const portalContractId = portal.rows[0]?.client_contract_id;
      if (doc.rows[0].contract_id && portalContractId && doc.rows[0].contract_id !== portalContractId) {
        return { error: 'document_outside_contract_scope', status: 403 };
      }
    }
    return { ok: true, document: doc.rows[0] };
  }

  // ==========================================
  // ---- OPS-05 Coverage Requests ----
  // ==========================================
  async function handleCoverageRequests(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    const userRole = (sess.role || sess.userRole || '').toLowerCase();
    if (userRole === 'cliente') return send(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const post_id = url.searchParams.get('post_id');
      const contract_id = url.searchParams.get('contract_id');
      const unit_id = url.searchParams.get('unit_id');
      const status = url.searchParams.get('status');
      const coverage_date = url.searchParams.get('coverage_date');
      const where = [];
      const vals = [];
      let i = 1;
      if (post_id) { if (!validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' }); where.push(`post_id=$${i++}`); vals.push(post_id); }
      if (contract_id) { if (!validateUuid(contract_id)) return send(res, 400, { error: 'invalid_contract_id' }); where.push(`contract_id=$${i++}`); vals.push(contract_id); }
      if (unit_id) { if (!validateUuid(unit_id)) return send(res, 400, { error: 'invalid_unit_id' }); where.push(`unit_id=$${i++}`); vals.push(unit_id); }
      if (status) { where.push(`status=$${i++}`); vals.push(status); }
      if (coverage_date) { where.push(`coverage_date=$${i++}`); vals.push(coverage_date); }
      const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_coverage_requests ${ws} ORDER BY requested_at DESC LIMIT 100`, vals);
        return send(res, 200, { requests: rows });
      } catch (e) { console.error('covReq GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }

    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh','supervisor'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const post_id = b.post_id || b.postId;
      if (!post_id || !validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' });
      const gap_id = b.gap_id || b.gapId;
      if (gap_id && !validateUuid(gap_id)) return send(res, 400, { error: 'invalid_gap_id' });
      const absence_id = b.absence_id || b.absenceId;
      if (absence_id && !validateUuid(absence_id)) return send(res, 400, { error: 'invalid_absence_id' });
      const shift_template_id = b.shift_template_id || b.shiftTemplateId;
      if (shift_template_id && !validateUuid(shift_template_id)) return send(res, 400, { error: 'invalid_shift_template_id' });
      const coverage_date = b.coverage_date || b.coverageDate || new Date().toISOString().slice(0, 10);
      const reason = b.reason ? String(b.reason).trim().slice(0, 1000) : null;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const postCheck = await getOperationalPost(client, post_id);
        if (postCheck.error) {
          await client.query('ROLLBACK');
          return send(res, postCheck.status, { error: postCheck.error, contract_status: postCheck.contract_status });
        }
        const post = postCheck.post;
        const contract_id = b.contract_id || b.contractId || post.contract_id;
        const unit_id = b.unit_id || b.unitId || post.unit_id;

        if (b.contract_id && post.contract_id && b.contract_id !== post.contract_id) {
          await client.query('ROLLBACK');
          return send(res, 409, { error: 'contract_company_mismatch' });
        }

        if (absence_id) {
          const abs = await client.query(`SELECT id FROM hr_absences WHERE id=$1`, [absence_id]);
          if (!abs.rows[0]) {
            await client.query('ROLLBACK');
            return send(res, 404, { error: 'absence_not_found' });
          }
        }

        // Idempotência: verificar duplicidade em aberto para mesmo posto, data e turno
        if (shift_template_id && coverage_date) {
          const dup = await client.query(
            `SELECT id FROM ops_coverage_requests WHERE post_id=$1 AND coverage_date=$2 AND shift_template_id=$3 AND status NOT IN ('resolvido','cancelado')`,
            [post_id, coverage_date, shift_template_id]
          );
          if (dup.rows[0]) {
            await client.query('ROLLBACK');
            return send(res, 409, { error: 'duplicate_coverage_request', existing: dup.rows[0].id });
          }
        }

        const { rows } = await client.query(
          `INSERT INTO ops_coverage_requests (
            gap_id, post_id, absence_id, absence_notice_id, contract_id, unit_id, shift_template_id, coverage_date, reason,
            status, responsible_id, responsible_name, is_human_decision, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [
            gap_id || null, post_id, absence_id || null, b.absence_notice_id || b.absenceNoticeId || null,
            contract_id || null, unit_id || null, shift_template_id || null, coverage_date, reason,
            b.status || 'aberto', b.responsible_id || b.responsibleId || null, b.responsible_name || b.responsibleName || null,
            true, sess.role
          ]
        );
        const created = rows[0];

        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          ['ops_coverage_request_create', sess.role, created.id, JSON.stringify({ post_id, gap_id, contract_id, coverage_date })]
        );

        await client.query('COMMIT');
        return send(res, 201, { request: created, note: 'ausência abre pendência cobertura auditável' });
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('covReq POST fail-closed', e.message);
        return send(res, 503, { error: 'service_unavailable' });
      } finally {
        client.release();
      }
    }

    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh','supervisor'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!id || !validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const status = b.status;
      if (status && !['aberto','em_busca','candidato_encontrado','aprovado','resolvido','cancelado'].includes(status)) return send(res, 400, { error: 'invalid_status' });

      if (status === 'aprovado' || status === 'resolvido') {
        if (!b.decision_by && !b.decisionBy && !b.decision_reason && !b.decisionReason) {
          return send(res, 400, { error: 'decision_by_required', detail: 'decisão humana obrigatória' });
        }
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const cur = await client.query(`SELECT * FROM ops_coverage_requests WHERE id=$1 FOR UPDATE`, [id]);
        if (!cur.rows[0]) {
          await client.query('ROLLBACK');
          return send(res, 404, { error: 'not_found' });
        }
        const existing = cur.rows[0];

        // Idempotência: se já resolvido/cancelado e a requisição pede o mesmo status, retornar sem duplicar efeito
        if (existing.status === status && ['resolvido', 'cancelado', 'aprovado'].includes(status)) {
          await client.query('ROLLBACK');
          return send(res, 200, { request: existing, note: 'idempotent_no_change' });
        }

        const { rows } = await client.query(
          `UPDATE ops_coverage_requests SET
             status=COALESCE($1,status),
             responsible_name=COALESCE($2,responsible_name),
             decision_by=COALESCE($3,decision_by),
             decision_at=CASE WHEN $1 IN ('aprovado','resolvido') THEN NOW() ELSE decision_at END,
             decision_reason=COALESCE($4,decision_reason),
             resolved_at=CASE WHEN $1='resolvido' THEN NOW() ELSE resolved_at END,
             updated_at=NOW()
           WHERE id=$5 RETURNING *`,
          [status || null, b.responsible_name || b.responsibleName || null, b.decision_by || b.decisionBy || sess.role, b.decision_reason || b.decisionReason || null, id]
        );

        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          ['ops_coverage_request_update', sess.role, id, JSON.stringify({ previous_status: existing.status, next_status: status })]
        );

        await client.query('COMMIT');
        return send(res, 200, { request: rows[0] });
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('covReq PATCH fail-closed', e.message);
        return send(res, 503, { error: 'service_unavailable' });
      } finally {
        client.release();
      }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ==========================================
  // ---- OPS-05 Substitution Candidates ----
  // ==========================================
  async function handleSubstitutionCandidates(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    const userRole = (sess.role || sess.userRole || '').toLowerCase();
    if (userRole === 'cliente') return send(res, 403, { error: 'forbidden' });

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
      if (!requireRole(sess, ['admin','ti','rh','supervisor'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const coverage_request_id = b.coverage_request_id || b.coverageRequestId;
      const employee_id = b.employee_id || b.employeeId;
      if (!coverage_request_id || !validateUuid(coverage_request_id) || !employee_id || !validateUuid(employee_id)) {
        return send(res, 400, { error: 'invalid_ids' });
      }
      const availability_status = b.availability_status || b.availabilityStatus || 'em_validacao';
      if (!['disponivel','indisponivel','em_validacao','em_descanso','em_outro_posto'].includes(availability_status)) {
        return send(res, 400, { error: 'invalid_availability_status' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const reqRow = await client.query(`SELECT * FROM ops_coverage_requests WHERE id=$1`, [coverage_request_id]);
        if (!reqRow.rows[0]) {
          await client.query('ROLLBACK');
          return send(res, 404, { error: 'coverage_request_not_found' });
        }
        const covReq = reqRow.rows[0];

        // Valida se o contrato da cobertura é operacional
        const postCheck = await getOperationalPost(client, covReq.post_id);
        if (postCheck.error) {
          await client.query('ROLLBACK');
          return send(res, postCheck.status, { error: postCheck.error, contract_status: postCheck.contract_status });
        }

        // Valida se o funcionário candidato existe e está ativo
        const empCheck = await getOperationalEmployee(client, employee_id);
        if (empCheck.error) {
          await client.query('ROLLBACK');
          return send(res, empCheck.status, { error: empCheck.error, status: empCheck.employee_status });
        }

        // Valida conflito de turno/sobreposição
        if (covReq.coverage_date && covReq.shift_template_id) {
          const hasConflict = await checkCandidateConflict(client, employee_id, covReq.coverage_date, covReq.shift_template_id);
          if (hasConflict) {
            await client.query('ROLLBACK');
            return send(res, 409, { error: 'candidate_conflict', detail: 'overlap_detected' });
          }
        }

        // Valida qualificação
        const qualCheck = await checkCandidateQualification(client, covReq.post_id, employee_id);
        if (!qualCheck.qualified) {
          await client.query('ROLLBACK');
          return send(res, 409, { error: 'candidate_unqualified', detail: qualCheck.reason });
        }

        const distance_km = b.distance_km !== undefined ? Number(b.distance_km) : (b.distanceKm !== undefined ? Number(b.distanceKm) : null);
        const score = b.score !== undefined ? Number(b.score) : null;

        const { rows } = await client.query(
          `INSERT INTO ops_substitution_candidates (coverage_request_id, employee_id, availability_status, qualification_match, distance_km, score, is_selected, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (coverage_request_id, employee_id) DO UPDATE SET availability_status=$3, qualification_match=$4, distance_km=$5, score=$6, notes=$8, updated_at=NOW()
           RETURNING *`,
          [coverage_request_id, employee_id, availability_status, true, distance_km, score, b.is_selected ? true : false, b.notes ? String(b.notes).trim().slice(0,1000) : null]
        );

        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          ['ops_substitution_candidate_add', sess.role, rows[0].id, JSON.stringify({ coverage_request_id, employee_id })]
        );

        await client.query('COMMIT');
        return send(res, 201, { candidate: rows[0], note: 'candidato validado por disponibilidade e qualificação' });
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('subCand POST fail-closed', e.message);
        return send(res, 503, { error: 'service_unavailable' });
      } finally {
        client.release();
      }
    }

    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh','supervisor'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!id || !validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const is_selected = b.is_selected !== undefined ? !!b.is_selected : (b.isSelected !== undefined ? !!b.isSelected : undefined);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const cur = await client.query(`SELECT * FROM ops_substitution_candidates WHERE id=$1 FOR UPDATE`, [id]);
        if (!cur.rows[0]) {
          await client.query('ROLLBACK');
          return send(res, 404, { error: 'not_found' });
        }
        const candidate = cur.rows[0];

        if (is_selected) {
          // Revalida se o funcionário ainda está ativo
          const empCheck = await getOperationalEmployee(client, candidate.employee_id);
          if (empCheck.error) {
            await client.query('ROLLBACK');
            return send(res, empCheck.status, { error: empCheck.error });
          }

          // Desmarca outros
          await client.query(`UPDATE ops_substitution_candidates SET is_selected=false, updated_at=NOW() WHERE coverage_request_id=$1`, [candidate.coverage_request_id]);
          const { rows } = await client.query(`UPDATE ops_substitution_candidates SET is_selected=true, selected_at=NOW(), selected_by=$1, updated_at=NOW() WHERE id=$2 RETURNING *`, [sess.role, id]);
          await client.query(`UPDATE ops_coverage_requests SET status='candidato_encontrado', updated_at=NOW() WHERE id=$1`, [candidate.coverage_request_id]);

          await client.query(
            `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
            ['ops_substitution_candidate_select', sess.role, id, JSON.stringify({ coverage_request_id: candidate.coverage_request_id, employee_id: candidate.employee_id })]
          );

          await client.query('COMMIT');
          return send(res, 200, { candidate: rows[0], note: 'decisão humana: candidato substituto selecionado' });
        } else {
          const { rows } = await client.query(
            `UPDATE ops_substitution_candidates SET availability_status=COALESCE($1,availability_status), score=COALESCE($2,score), notes=COALESCE($3,notes), updated_at=NOW() WHERE id=$4 RETURNING *`,
            [b.availability_status || b.availabilityStatus || null, b.score !== undefined ? Number(b.score) : null, b.notes ? String(b.notes).trim().slice(0,1000) : null, id]
          );

          await client.query(
            `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
            ['ops_substitution_candidate_update', sess.role, id, JSON.stringify({ availability_status: b.availability_status })]
          );

          await client.query('COMMIT');
          return send(res, 200, { candidate: rows[0] });
        }
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('subCand PATCH fail-closed', e.message);
        return send(res, 503, { error: 'service_unavailable' });
      } finally {
        client.release();
      }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ==========================================
  // ---- OPS-05 Coverage Communications ----
  // ==========================================
  async function handleCoverageCommunications(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    const userRole = (sess.role || sess.userRole || '').toLowerCase();
    if (userRole === 'cliente') return send(res, 403, { error: 'forbidden' });

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
      if (!requireRole(sess, ['admin','ti','rh','supervisor'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const coverage_request_id = b.coverage_request_id || b.coverageRequestId;
      if (!coverage_request_id || !validateUuid(coverage_request_id)) return send(res, 400, { error: 'invalid_coverage_request_id' });
      const recipient_type = b.recipient_type || b.recipientType;
      if (!['employee','supervisor','rh','outro'].includes(recipient_type)) return send(res, 400, { error: 'invalid_recipient_type' });
      const channel = b.channel || 'sistema';
      if (!['email','whatsapp','sistema','outro'].includes(channel)) return send(res, 400, { error: 'invalid_channel' });
      const message = String(b.message || '').trim();
      if (message.length < 10 || message.length > 2000) return send(res, 400, { error: 'invalid_message', detail: '10-2000' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const reqCheck = await client.query(`SELECT id FROM ops_coverage_requests WHERE id=$1`, [coverage_request_id]);
        if (!reqCheck.rows[0]) {
          await client.query('ROLLBACK');
          return send(res, 404, { error: 'coverage_request_not_found' });
        }

        const { rows } = await client.query(
          `INSERT INTO ops_coverage_communications (coverage_request_id, recipient_type, recipient_id, recipient_name, channel, message, is_confirmed)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [coverage_request_id, recipient_type, b.recipient_id || b.recipientId || null, b.recipient_name || b.recipientName || null, channel, message, b.is_confirmed ? true : false]
        );

        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          ['ops_coverage_communication_create', sess.role, rows[0].id, JSON.stringify({ coverage_request_id, recipient_type, channel })]
        );

        await client.query('COMMIT');
        return send(res, 201, { communication: rows[0], note: 'comunicação cobertura interna' });
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('covComm POST fail-closed', e.message);
        return send(res, 503, { error: 'service_unavailable' });
      } finally {
        client.release();
      }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ==========================================
  // ---- OPS-06 Handovers (Passagem de plantão) ----
  // ==========================================
  async function handleHandovers(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    const userRole = (sess.role || sess.userRole || '').toLowerCase();
    if (userRole === 'cliente') return send(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const post_id = url.searchParams.get('post_id');
      const contract_id = url.searchParams.get('contract_id');
      const unit_id = url.searchParams.get('unit_id');
      const status = url.searchParams.get('status');
      const from_employee_id = url.searchParams.get('from_employee_id');
      const to_employee_id = url.searchParams.get('to_employee_id');
      const where = [];
      const vals = [];
      let i = 1;
      if (post_id) { if (!validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' }); where.push(`from_post_id=$${i++}`); vals.push(post_id); }
      if (contract_id) { if (!validateUuid(contract_id)) return send(res, 400, { error: 'invalid_contract_id' }); where.push(`contract_id=$${i++}`); vals.push(contract_id); }
      if (unit_id) { if (!validateUuid(unit_id)) return send(res, 400, { error: 'invalid_unit_id' }); where.push(`unit_id=$${i++}`); vals.push(unit_id); }
      if (status) { where.push(`status=$${i++}`); vals.push(status); }
      if (from_employee_id) { if (!validateUuid(from_employee_id)) return send(res, 400, { error: 'invalid_from_employee_id' }); where.push(`from_employee_id=$${i++}`); vals.push(from_employee_id); }
      if (to_employee_id) { if (!validateUuid(to_employee_id)) return send(res, 400, { error: 'invalid_to_employee_id' }); where.push(`to_employee_id=$${i++}`); vals.push(to_employee_id); }
      const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_handovers ${ws} ORDER BY handover_date DESC LIMIT 100`, vals);
        return send(res, 200, { handovers: rows });
      } catch (e) { console.error('handovers GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }

    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh','supervisor','operacional'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const from_employee_id = b.from_employee_id || b.fromEmployeeId;
      if (!from_employee_id || !validateUuid(from_employee_id)) return send(res, 400, { error: 'invalid_from_employee_id' });
      const from_post_id = b.from_post_id || b.fromPostId;
      if (from_post_id && !validateUuid(from_post_id)) return send(res, 400, { error: 'invalid_from_post_id' });
      const to_employee_id = b.to_employee_id || b.toEmployeeId;
      if (to_employee_id && !validateUuid(to_employee_id)) return send(res, 400, { error: 'invalid_to_employee_id' });
      if (from_employee_id === to_employee_id) return send(res, 400, { error: 'same_employee' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let contract_id = b.contract_id || b.contractId || null;
        let unit_id = b.unit_id || b.unitId || null;

        if (from_post_id) {
          const postCheck = await getOperationalPost(client, from_post_id);
          if (postCheck.error) {
            await client.query('ROLLBACK');
            return send(res, postCheck.status, { error: postCheck.error, contract_status: postCheck.contract_status });
          }
          contract_id = contract_id || postCheck.post.contract_id;
          unit_id = unit_id || postCheck.post.unit_id;
        }

        const fromEmpCheck = await getOperationalEmployee(client, from_employee_id);
        if (fromEmpCheck.error) {
          await client.query('ROLLBACK');
          return send(res, fromEmpCheck.status, { error: fromEmpCheck.error, status: fromEmpCheck.employee_status });
        }

        if (to_employee_id) {
          const toEmpCheck = await getOperationalEmployee(client, to_employee_id);
          if (toEmpCheck.error) {
            await client.query('ROLLBACK');
            return send(res, toEmpCheck.status, { error: toEmpCheck.error, status: toEmpCheck.employee_status });
          }
        }

        const protocol = `HND-OPS-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
        const { rows } = await client.query(
          `INSERT INTO ops_handovers (
             protocol, from_post_id, from_employee_id, to_employee_id, shift_template_id, contract_id, unit_id,
             handover_date, pending_tasks, keys_handover, equipment_handover, occurrences_summary, status, is_private, notes, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
          [
            protocol, from_post_id || null, from_employee_id, to_employee_id || null,
            b.shift_template_id || b.shiftTemplateId || null, contract_id, unit_id,
            b.handover_date || b.handoverDate || new Date().toISOString(),
            b.pending_tasks || b.pendingTasks || null,
            JSON.stringify(b.keys_handover || b.keysHandover || []),
            JSON.stringify(b.equipment_handover || b.equipmentHandover || []),
            b.occurrences_summary || b.occurrencesSummary || null,
            'pendente',
            b.is_private !== undefined ? !!b.is_private : true,
            b.notes ? String(b.notes).trim().slice(0,2000) : null,
            sess.role
          ]
        );

        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          ['ops_handover_create', sess.role, rows[0].id, JSON.stringify({ protocol, from_post_id, contract_id })]
        );

        await client.query('COMMIT');
        return send(res, 201, { handover: rows[0] });
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handovers POST fail-closed', e.message);
        return send(res, 503, { error: 'service_unavailable' });
      } finally {
        client.release();
      }
    }

    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh','supervisor','operacional'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!id || !validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const status = b.status;
      if (status && !['pendente','em_andamento','aceito','recusado','encerrado','cancelado','escalonado'].includes(status)) {
        return send(res, 400, { error: 'invalid_status' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const cur = await client.query(`SELECT * FROM ops_handovers WHERE id=$1 FOR UPDATE`, [id]);
        if (!cur.rows[0]) {
          await client.query('ROLLBACK');
          return send(res, 404, { error: 'not_found' });
        }
        const existing = cur.rows[0];

        // Idempotência de ciência/aceite: se já aceito, não duplicar efeito
        if (status === 'aceito' && existing.status === 'aceito') {
          await client.query('ROLLBACK');
          return send(res, 200, { handover: existing, note: 'idempotent_already_accepted' });
        }

        let updatedRow;
        if (status === 'aceito') {
          const { rows } = await client.query(
            `UPDATE ops_handovers SET status='aceito', accepted_at=NOW(), accepted_by=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
            [sess.role, id]
          );
          updatedRow = rows[0];
        } else if (status === 'recusado') {
          const reason = b.rejection_reason || b.rejectionReason;
          if (!reason) {
            await client.query('ROLLBACK');
            return send(res, 400, { error: 'rejection_reason_required' });
          }
          const { rows } = await client.query(
            `UPDATE ops_handovers SET status='recusado', rejection_reason=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
            [reason, id]
          );
          updatedRow = rows[0];
        } else if (status === 'escalonado') {
          const reason = b.reason || b.escalation_reason || b.escalationReason;
          if (!reason) {
            await client.query('ROLLBACK');
            return send(res, 400, { error: 'escalation_reason_required' });
          }
          const newLevel = (existing.escalation_level || 0) + 1;
          const { rows } = await client.query(
            `UPDATE ops_handovers SET status='escalonado', escalation_level=$1, escalated_at=NOW(), escalated_to=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
            [newLevel, b.escalated_to || b.escalatedTo || null, id]
          );
          updatedRow = rows[0];
          await client.query(
            `INSERT INTO ops_handover_escalations (handover_id, from_level, to_level, reason, escalated_by, notified_to) VALUES ($1,$2,$3,$4,$5,$6)`,
            [id, existing.escalation_level || 0, newLevel, reason, sess.role, b.escalated_to || b.escalatedTo || null]
          );
        } else {
          const { rows } = await client.query(
            `UPDATE ops_handovers SET status=COALESCE($1,status), notes=COALESCE($2,notes), updated_at=NOW() WHERE id=$3 RETURNING *`,
            [status || null, b.notes ? String(b.notes).trim().slice(0,2000) : null, id]
          );
          updatedRow = rows[0];
        }

        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          ['ops_handover_update', sess.role, id, JSON.stringify({ previous_status: existing.status, next_status: status })]
        );

        await client.query('COMMIT');
        return send(res, 200, { handover: updatedRow });
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('handovers PATCH fail-closed', e.message);
        return send(res, 503, { error: 'service_unavailable' });
      } finally {
        client.release();
      }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  async function handleHandoverEscalations(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    const userRole = (sess.role || sess.userRole || '').toLowerCase();
    if (userRole === 'cliente') return send(res, 403, { error: 'forbidden' });

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

  // ==========================================
  // ---- OPS-07 Occurrence Book ----
  // ==========================================
  async function handleOccurrenceBook(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    const userRole = (sess.role || sess.userRole || '').toLowerCase();
    if (userRole === 'cliente') return send(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const post_id = url.searchParams.get('post_id');
      const contract_id = url.searchParams.get('contract_id');
      const unit_id = url.searchParams.get('unit_id');
      const category = url.searchParams.get('category');
      const severity = url.searchParams.get('severity');
      const status = url.searchParams.get('status');
      const where = [];
      const vals = [];
      let i = 1;
      if (post_id) { if (!validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' }); where.push(`post_id=$${i++}`); vals.push(post_id); }
      if (contract_id) { if (!validateUuid(contract_id)) return send(res, 400, { error: 'invalid_contract_id' }); where.push(`contract_id=$${i++}`); vals.push(contract_id); }
      if (unit_id) { if (!validateUuid(unit_id)) return send(res, 400, { error: 'invalid_unit_id' }); where.push(`unit_id=$${i++}`); vals.push(unit_id); }
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
      if (!requireRole(sess, ['admin','ti','rh','supervisor','operacional'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const title = String(b.title || '').trim();
      const description = String(b.description || '').trim();
      if (title.length < 5 || title.length > 200) return send(res, 400, { error: 'invalid_title', detail: '5-200' });
      if (description.length < 10 || description.length > 5000) return send(res, 400, { error: 'invalid_description', detail: '10-5000' });
      const category = b.category || 'operacional';
      if (!['seguranca','operacional','manutencao','limpeza','comportamental','cliente','equipamento','acesso','outro'].includes(category)) return send(res, 400, { error: 'invalid_category' });
      const severity = b.severity || 'media';
      if (!['baixa','media','alta','critica'].includes(severity)) return send(res, 400, { error: 'invalid_severity' });

      const post_id = b.post_id || b.postId;
      if (post_id && !validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' });
      const employee_id = b.employee_id || b.employeeId;
      if (employee_id && !validateUuid(employee_id)) return send(res, 400, { error: 'invalid_employee_id' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let contract_id = b.contract_id || b.contractId || null;
        let unit_id = b.unit_id || b.unitId || null;
        let company_id = b.company_id || b.companyId || null;

        if (post_id) {
          const postCheck = await getOperationalPost(client, post_id);
          if (postCheck.error) {
            await client.query('ROLLBACK');
            return send(res, postCheck.status, { error: postCheck.error, contract_status: postCheck.contract_status });
          }
          contract_id = contract_id || postCheck.post.contract_id;
          unit_id = unit_id || postCheck.post.unit_id;
          company_id = company_id || postCheck.post.company_id;
        }

        if (employee_id) {
          const emp = await client.query(`SELECT id FROM hr_employees WHERE id=$1`, [employee_id]);
          if (!emp.rows[0]) {
            await client.query('ROLLBACK');
            return send(res, 404, { error: 'employee_not_found' });
          }
        }

        const lowerDesc = description.toLowerCase();
        const hasPersonal = /(cpf|rg|prontuario|diagnostico|exame|doen[cç]a)/i.test(lowerDesc);
        const protocol = `OCC-OPS-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;

        const { rows } = await client.query(
          `INSERT INTO ops_occurrence_book (
             protocol, post_id, employee_id, contract_id, unit_id, company_id, category, severity,
             title, description, occurred_at, location, status, responsible_id, responsible_name,
             is_private, is_personal_data_restricted, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
          [
            protocol, post_id || null, employee_id || null, contract_id, unit_id, company_id, category, severity,
            title, description, b.occurred_at || b.occurredAt || new Date().toISOString(), b.location || null, 'aberto',
            b.responsible_id || b.responsibleId || null, b.responsible_name || b.responsibleName || null,
            b.is_private !== undefined ? !!b.is_private : true, hasPersonal || !!b.is_personal_data_restricted, sess.role
          ]
        );
        const created = rows[0];

        await client.query(
          `INSERT INTO ops_occurrence_history (occurrence_id, previous_status, next_status, next_description, changed_by, reason, is_retification) VALUES ($1,NULL,$2,$3,$4,$5,false)`,
          [created.id, 'aberto', description, sess.role, 'Criação inicial']
        );

        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          ['ops_occurrence_create', sess.role, created.id, JSON.stringify({ protocol, category, severity, contract_id })]
        );

        await client.query('COMMIT');
        return send(res, 201, { occurrence: created, note: hasPersonal ? 'informações pessoais restritas detectadas' : undefined });
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('occBook POST fail-closed', e.message);
        return send(res, 503, { error: 'service_unavailable' });
      } finally {
        client.release();
      }
    }

    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh','supervisor'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!id || !validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const status = b.status;
      if (status && !['aberto','em_analise','em_tratamento','resolvido','encerrado','cancelado','retificado'].includes(status)) {
        return send(res, 400, { error: 'invalid_status' });
      }
      const is_retification = !!b.is_retification || !!b.isRetification;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const cur = await client.query(`SELECT * FROM ops_occurrence_book WHERE id=$1 FOR UPDATE`, [id]);
        if (!cur.rows[0]) {
          await client.query('ROLLBACK');
          return send(res, 404, { error: 'not_found' });
        }
        const prev = cur.rows[0];
        const prevStatus = prev.status;
        const prevDesc = prev.description;
        const nextDesc = b.description ? String(b.description).trim() : prevDesc;

        if (is_retification && !b.reason) {
          await client.query('ROLLBACK');
          return send(res, 400, { error: 'reason_required_for_retification' });
        }

        const { rows } = await client.query(
          `UPDATE ops_occurrence_book SET
             status=COALESCE($1,status),
             description=COALESCE($2,description),
             resolution_notes=COALESCE($3,resolution_notes),
             responsible_name=COALESCE($4,responsible_name),
             resolved_at=CASE WHEN $1 IN ('resolvido','encerrado') THEN NOW() ELSE resolved_at END,
             resolved_by=CASE WHEN $1 IN ('resolvido','encerrado') THEN $5 ELSE resolved_by END,
             retification_count=CASE WHEN $6 THEN retification_count+1 ELSE retification_count END,
             updated_at=NOW()
           WHERE id=$7 RETURNING *`,
          [status || null, b.description ? String(b.description).trim() : null, b.resolution_notes || b.resolutionNotes || null, b.responsible_name || b.responsibleName || null, sess.role, is_retification, id]
        );

        // Histórico imutável de retificação / transição de estado
        await client.query(
          `INSERT INTO ops_occurrence_history (occurrence_id, previous_status, next_status, previous_description, next_description, changed_by, reason, is_retification)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, prevStatus, status || prevStatus, prevDesc, nextDesc, sess.role, b.reason || null, is_retification]
        );

        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          ['ops_occurrence_update', sess.role, id, JSON.stringify({ is_retification, status })]
        );

        await client.query('COMMIT');
        return send(res, 200, { occurrence: rows[0], retification: is_retification });
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('occBook PATCH fail-closed', e.message);
        return send(res, 503, { error: 'service_unavailable' });
      } finally {
        client.release();
      }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ==========================================
  // ---- OPS-07 Occurrence Evidences ----
  // ==========================================
  async function handleOccurrenceEvidences(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    const userRole = (sess.role || sess.userRole || '').toLowerCase();
    if (userRole === 'cliente') return send(res, 403, { error: 'forbidden' });

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
      if (!requireRole(sess, ['admin','ti','rh','supervisor','operacional'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const occurrence_id = b.occurrence_id || b.occurrenceId;
      if (!occurrence_id || !validateUuid(occurrence_id)) return send(res, 400, { error: 'invalid_occurrence_id' });
      const file_name = String(b.file_name || b.fileName || 'evidencia.pdf').trim();
      const file_url = String(b.file_url || b.fileUrl || '/api/client/documents/').trim();
      const client_document_id = b.client_document_id || b.clientDocumentId || null;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const occ = await client.query(`SELECT id, contract_id FROM ops_occurrence_book WHERE id=$1`, [occurrence_id]);
        if (!occ.rows[0]) {
          await client.query('ROLLBACK');
          return send(res, 404, { error: 'occurrence_not_found' });
        }

        // Validação de documento L02 caso fornecido
        if (client_document_id) {
          const docScope = await validateDocumentScope(client, client_document_id, occ.rows[0].contract_id);
          if (docScope.error) {
            await client.query('ROLLBACK');
            return send(res, docScope.status, { error: docScope.error });
          }
        }

        const { rows } = await client.query(
          `INSERT INTO ops_occurrence_evidences (
             occurrence_id, client_document_id, file_name, file_url, storage_key, is_private, is_personal_data_restricted, uploaded_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [occurrence_id, client_document_id, file_name, file_url, b.storage_key || b.storageKey || null, b.is_private !== undefined ? !!b.is_private : true, !!b.is_personal_data_restricted, sess.role]
        );

        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          ['ops_occurrence_evidence_create', sess.role, rows[0].id, JSON.stringify({ occurrence_id, client_document_id })]
        );

        await client.query('COMMIT');
        return send(res, 201, { evidence: rows[0], note: 'evidência privada integrada' });
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('occEvid POST fail-closed', e.message);
        return send(res, 503, { error: 'service_unavailable' });
      } finally {
        client.release();
      }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ==========================================
  // ---- OPS-07 Occurrence Actions & History ----
  // ==========================================
  async function handleOccurrenceActions(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    const userRole = (sess.role || sess.userRole || '').toLowerCase();
    if (userRole === 'cliente') return send(res, 403, { error: 'forbidden' });

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
      if (!requireRole(sess, ['admin','ti','rh','supervisor'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const occurrence_id = b.occurrence_id || b.occurrenceId;
      if (!occurrence_id || !validateUuid(occurrence_id)) return send(res, 400, { error: 'invalid_occurrence_id' });
      const action_type = String(b.action_type || b.actionType || '').trim();
      const description = String(b.description || '').trim();
      if (action_type.length < 3 || action_type.length > 100) return send(res, 400, { error: 'invalid_action_type' });
      if (description.length < 10 || description.length > 2000) return send(res, 400, { error: 'invalid_description' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const occ = await client.query(`SELECT id FROM ops_occurrence_book WHERE id=$1`, [occurrence_id]);
        if (!occ.rows[0]) {
          await client.query('ROLLBACK');
          return send(res, 404, { error: 'occurrence_not_found' });
        }

        const { rows } = await client.query(
          `INSERT INTO ops_occurrence_actions (occurrence_id, action_type, description, responsible_name, due_date, status, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [occurrence_id, action_type, description, b.responsible_name || b.responsibleName || null, b.due_date || b.dueDate || null, b.status || 'pendente', b.notes ? String(b.notes).trim().slice(0,1000) : null, sess.role]
        );

        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          ['ops_occurrence_action_create', sess.role, rows[0].id, JSON.stringify({ occurrence_id, action_type })]
        );

        await client.query('COMMIT');
        return send(res, 201, { action: rows[0] });
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('occAction POST fail-closed', e.message);
        return send(res, 503, { error: 'service_unavailable' });
      } finally {
        client.release();
      }
    }

    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh','supervisor'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!id || !validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const status = b.status;
      if (status && !['pendente','em_andamento','concluida','cancelada'].includes(status)) return send(res, 400, { error: 'invalid_status' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `UPDATE ops_occurrence_actions SET
             status=COALESCE($1,status), notes=COALESCE($2,notes),
             completed_at=CASE WHEN $1='concluida' THEN NOW() ELSE completed_at END,
             updated_at=NOW()
           WHERE id=$3 RETURNING *`,
          [status || null, b.notes ? String(b.notes).trim().slice(0,1000) : null, id]
        );
        if (!rows[0]) {
          await client.query('ROLLBACK');
          return send(res, 404, { error: 'not_found' });
        }

        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          ['ops_occurrence_action_update', sess.role, id, JSON.stringify({ status })]
        );

        await client.query('COMMIT');
        return send(res, 200, { action: rows[0] });
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('occAction PATCH fail-closed', e.message);
        return send(res, 503, { error: 'service_unavailable' });
      } finally {
        client.release();
      }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  async function handleOccurrenceHistory(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    const userRole = (sess.role || sess.userRole || '').toLowerCase();
    if (userRole === 'cliente') return send(res, 403, { error: 'forbidden' });

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

  // ==========================================
  // ---- OPS-08 Checklist Templates ----
  // ==========================================
  async function handleChecklistTemplates(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    const userRole = (sess.role || sess.userRole || '').toLowerCase();
    if (userRole === 'cliente') return send(res, 403, { error: 'forbidden' });

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
      if (!requireRole(sess, ['admin','ti','rh','supervisor'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const title = String(b.title || '').trim();
      if (title.length < 5 || title.length > 200) return send(res, 400, { error: 'invalid_title' });
      const service_type = b.service_type || b.serviceType || null;
      const frequency = b.frequency || 'diaria';
      if (!['diaria','semanal','quinzenal','mensal','trimestral','sob_demanda','por_visita','outro'].includes(frequency)) {
        return send(res, 400, { error: 'invalid_frequency' });
      }
      const required_items = b.required_items || b.requiredItems || [];
      if (!Array.isArray(required_items)) return send(res, 400, { error: 'invalid_required_items' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const vRes = await client.query(`SELECT COALESCE(MAX(version),0)+1 AS v FROM ops_checklist_templates WHERE title=$1`, [title]);
        const version = vRes.rows[0].v;

        const { rows } = await client.query(
          `INSERT INTO ops_checklist_templates (company_id, service_type, title, version, description, frequency, is_mandatory, required_items, status, is_active, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [b.company_id || b.companyId || null, service_type, title, version, b.description ? String(b.description).trim().slice(0,2000) : null, frequency, !!b.is_mandatory, JSON.stringify(required_items), b.status || 'ativo', b.is_active !== undefined ? !!b.is_active : true, sess.role]
        );

        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          ['ops_checklist_template_create', sess.role, rows[0].id, JSON.stringify({ title, version, service_type })]
        );

        await client.query('COMMIT');
        return send(res, 201, { template: rows[0] });
      } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') return send(res, 409, { error: 'duplicate_template_version' });
        console.error('checkTpl POST fail-closed', e.message);
        return send(res, 503, { error: 'service_unavailable' });
      } finally {
        client.release();
      }
    }

    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh','supervisor'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!id || !validateUuid(id)) return send(res, 400, { error: 'invalid_id' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `UPDATE ops_checklist_templates SET description=COALESCE($1,description), frequency=COALESCE($2,frequency), is_mandatory=COALESCE($3,is_mandatory), status=COALESCE($4,status), is_active=COALESCE($5,is_active), updated_at=NOW() WHERE id=$6 RETURNING *`,
          [b.description ? String(b.description).trim().slice(0,2000) : null, b.frequency || null, b.is_mandatory !== undefined ? !!b.is_mandatory : null, b.status || null, b.is_active !== undefined ? !!b.is_active : null, id]
        );
        if (!rows[0]) {
          await client.query('ROLLBACK');
          return send(res, 404, { error: 'not_found' });
        }

        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          ['ops_checklist_template_update', sess.role, id, JSON.stringify({ status: b.status })]
        );

        await client.query('COMMIT');
        return send(res, 200, { template: rows[0] });
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('checkTpl PATCH fail-closed', e.message);
        return send(res, 503, { error: 'service_unavailable' });
      } finally {
        client.release();
      }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ==========================================
  // ---- OPS-08 Checklist Instances ----
  // ==========================================
  async function handleChecklistInstances(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    const userRole = (sess.role || sess.userRole || '').toLowerCase();
    if (userRole === 'cliente') return send(res, 403, { error: 'forbidden' });

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const template_id = url.searchParams.get('template_id');
      const post_id = url.searchParams.get('post_id');
      const contract_id = url.searchParams.get('contract_id');
      const unit_id = url.searchParams.get('unit_id');
      const scheduled_date = url.searchParams.get('scheduled_date');
      const status = url.searchParams.get('status');
      const where = [];
      const vals = [];
      let i = 1;
      if (template_id) { if (!validateUuid(template_id)) return send(res, 400, { error: 'invalid_template_id' }); where.push(`template_id=$${i++}`); vals.push(template_id); }
      if (post_id) { if (!validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' }); where.push(`post_id=$${i++}`); vals.push(post_id); }
      if (contract_id) { if (!validateUuid(contract_id)) return send(res, 400, { error: 'invalid_contract_id' }); where.push(`contract_id=$${i++}`); vals.push(contract_id); }
      if (unit_id) { if (!validateUuid(unit_id)) return send(res, 400, { error: 'invalid_unit_id' }); where.push(`unit_id=$${i++}`); vals.push(unit_id); }
      if (scheduled_date) { where.push(`scheduled_date=$${i++}`); vals.push(scheduled_date); }
      if (status) { where.push(`status=$${i++}`); vals.push(status); }
      const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_checklist_instances ${ws} ORDER BY scheduled_date DESC LIMIT 100`, vals);
        return send(res, 200, { instances: rows });
      } catch (e) { console.error('checkInst GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }

    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh','supervisor','operacional'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const template_id = b.template_id || b.templateId;
      if (!template_id || !validateUuid(template_id)) return send(res, 400, { error: 'invalid_template_id' });
      const scheduled_date = b.scheduled_date || b.scheduledDate;
      if (!scheduled_date) return send(res, 400, { error: 'scheduled_date_required' });
      const post_id = b.post_id || b.postId;
      if (post_id && !validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' });
      const employee_id = b.employee_id || b.employeeId;
      if (employee_id && !validateUuid(employee_id)) return send(res, 400, { error: 'invalid_employee_id' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tpl = await client.query(`SELECT * FROM ops_checklist_templates WHERE id=$1`, [template_id]);
        if (!tpl.rows[0]) {
          await client.query('ROLLBACK');
          return send(res, 404, { error: 'template_not_found' });
        }
        if (tpl.rows[0].is_active === false) {
          await client.query('ROLLBACK');
          return send(res, 409, { error: 'template_inactive' });
        }

        let contract_id = b.contract_id || b.contractId || null;
        let unit_id = b.unit_id || b.unitId || null;

        if (post_id) {
          const postCheck = await getOperationalPost(client, post_id);
          if (postCheck.error) {
            await client.query('ROLLBACK');
            return send(res, postCheck.status, { error: postCheck.error, contract_status: postCheck.contract_status });
          }
          contract_id = contract_id || postCheck.post.contract_id;
          unit_id = unit_id || postCheck.post.unit_id;
        }

        if (employee_id) {
          const empCheck = await getOperationalEmployee(client, employee_id);
          if (empCheck.error) {
            await client.query('ROLLBACK');
            return send(res, empCheck.status, { error: empCheck.error, status: empCheck.employee_status });
          }
        }

        // Idempotência: verificar duplicidade de instância para mesmo template, posto e data
        if (post_id) {
          const dup = await client.query(
            `SELECT id FROM ops_checklist_instances WHERE template_id=$1 AND post_id=$2 AND scheduled_date=$3`,
            [template_id, post_id, scheduled_date]
          );
          if (dup.rows[0]) {
            await client.query('ROLLBACK');
            return send(res, 409, { error: 'duplicate_checklist_instance', existing: dup.rows[0].id });
          }
        }

        const { rows } = await client.query(
          `INSERT INTO ops_checklist_instances (template_id, post_id, employee_id, contract_id, unit_id, scheduled_date, status, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [template_id, post_id || null, employee_id || null, contract_id, unit_id, scheduled_date, b.status || 'pendente', b.notes ? String(b.notes).trim().slice(0,2000) : null, sess.role]
        );
        const created = rows[0];

        // Gera itens a partir do template required_items
        const items = tpl.rows[0].required_items;
        if (Array.isArray(items)) {
          for (const it of items) {
            const desc = typeof it === 'string' ? it : (it.desc || it.description || '');
            const reqd = typeof it === 'object' ? !!it.required : false;
            if (desc) {
              await client.query(
                `INSERT INTO ops_checklist_items (instance_id, item_description, is_required, is_checked) VALUES ($1,$2,$3,false)`,
                [created.id, String(desc).slice(0,500), reqd]
              );
            }
          }
        }

        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          ['ops_checklist_instance_create', sess.role, created.id, JSON.stringify({ template_id, post_id, contract_id, scheduled_date })]
        );

        await client.query('COMMIT');
        return send(res, 201, { instance: created, note: 'itens obrigatórios gerados a partir do template' });
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('checkInst POST fail-closed', e.message);
        return send(res, 503, { error: 'service_unavailable' });
      } finally {
        client.release();
      }
    }

    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh','supervisor','operacional'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!id || !validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const status = b.status;
      if (status && !['pendente','em_andamento','concluido','cancelado','nao_aplicavel'].includes(status)) {
        return send(res, 400, { error: 'invalid_status' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const cur = await client.query(`SELECT * FROM ops_checklist_instances WHERE id=$1 FOR UPDATE`, [id]);
        if (!cur.rows[0]) {
          await client.query('ROLLBACK');
          return send(res, 404, { error: 'not_found' });
        }
        const existing = cur.rows[0];

        // Idempotência na finalização: se já concluído e solicitado concluído, retornar sem duplicar
        if (status === 'concluido' && existing.status === 'concluido') {
          await client.query('ROLLBACK');
          return send(res, 200, { instance: existing, note: 'idempotent_already_completed' });
        }

        // Validação de finalização: todos os itens com is_required=true devem estar marcados (is_checked=true)
        if (status === 'concluido') {
          const pending = await client.query(
            `SELECT count(*)::int AS cnt FROM ops_checklist_items WHERE instance_id=$1 AND is_required=true AND is_checked=false`,
            [id]
          );
          if (pending.rows[0].cnt > 0) {
            await client.query('ROLLBACK');
            return send(res, 409, { error: 'mandatory_items_pending', pending_count: pending.rows[0].cnt });
          }
        }

        const { rows } = await client.query(
          `UPDATE ops_checklist_instances SET
             status=COALESCE($1,status),
             executed_at=CASE WHEN $1='concluido' THEN NOW() ELSE executed_at END,
             score=$2,
             notes=COALESCE($3,notes),
             updated_at=NOW()
           WHERE id=$4 RETURNING *`,
          [status || null, b.score !== undefined ? Number(b.score) : null, b.notes ? String(b.notes).trim().slice(0,2000) : null, id]
        );

        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          ['ops_checklist_instance_update', sess.role, id, JSON.stringify({ status })]
        );

        await client.query('COMMIT');
        return send(res, 200, { instance: rows[0] });
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('checkInst PATCH fail-closed', e.message);
        return send(res, 503, { error: 'service_unavailable' });
      } finally {
        client.release();
      }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ==========================================
  // ---- OPS-08 Checklist Items ----
  // ==========================================
  async function handleChecklistItems(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    const userRole = (sess.role || sess.userRole || '').toLowerCase();
    if (userRole === 'cliente') return send(res, 403, { error: 'forbidden' });

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
      if (!requireRole(sess, ['admin','ti','rh','supervisor','operacional'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const instance_id = b.instance_id || b.instanceId;
      if (!instance_id || !validateUuid(instance_id)) return send(res, 400, { error: 'invalid_instance_id' });
      const item_description = String(b.item_description || b.itemDescription || '').trim();
      if (item_description.length < 3 || item_description.length > 500) return send(res, 400, { error: 'invalid_item_description' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const inst = await client.query(`SELECT id FROM ops_checklist_instances WHERE id=$1`, [instance_id]);
        if (!inst.rows[0]) {
          await client.query('ROLLBACK');
          return send(res, 404, { error: 'instance_not_found' });
        }

        const { rows } = await client.query(
          `INSERT INTO ops_checklist_items (instance_id, item_description, is_required, is_checked, evidence_url, notes)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [instance_id, item_description, !!b.is_required, !!b.is_checked, b.evidence_url || b.evidenceUrl || null, b.notes ? String(b.notes).trim().slice(0,1000) : null]
        );

        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          ['ops_checklist_item_create', sess.role, rows[0].id, JSON.stringify({ instance_id })]
        );

        await client.query('COMMIT');
        return send(res, 201, { item: rows[0] });
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('checkItems POST fail-closed', e.message);
        return send(res, 503, { error: 'service_unavailable' });
      } finally {
        client.release();
      }
    }

    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh','supervisor','operacional'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!id || !validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const client_document_id = b.client_document_id || b.clientDocumentId || null;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const cur = await client.query(`SELECT * FROM ops_checklist_items WHERE id=$1 FOR UPDATE`, [id]);
        if (!cur.rows[0]) {
          await client.query('ROLLBACK');
          return send(res, 404, { error: 'not_found' });
        }

        if (client_document_id) {
          const inst = await client.query(`SELECT contract_id FROM ops_checklist_instances WHERE id=$1`, [cur.rows[0].instance_id]);
          const docScope = await validateDocumentScope(client, client_document_id, inst.rows[0]?.contract_id);
          if (docScope.error) {
            await client.query('ROLLBACK');
            return send(res, docScope.status, { error: docScope.error });
          }
        }

        const is_checked = b.is_checked !== undefined ? !!b.is_checked : (b.isChecked !== undefined ? !!b.isChecked : null);

        const { rows } = await client.query(
          `UPDATE ops_checklist_items SET
             is_checked=COALESCE($1,is_checked),
             evidence_url=COALESCE($2,evidence_url),
             client_document_id=COALESCE($3,client_document_id),
             notes=COALESCE($4,notes),
             checked_at=CASE WHEN $1=true THEN NOW() ELSE checked_at END,
             checked_by=CASE WHEN $1=true THEN $5 ELSE checked_by END
           WHERE id=$6 RETURNING *`,
          [is_checked, b.evidence_url || b.evidenceUrl || null, client_document_id, b.notes ? String(b.notes).trim().slice(0,1000) : null, sess.role, id]
        );

        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          ['ops_checklist_item_update', sess.role, id, JSON.stringify({ is_checked })]
        );

        await client.query('COMMIT');
        return send(res, 200, { item: rows[0] });
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('checkItems PATCH fail-closed', e.message);
        return send(res, 503, { error: 'service_unavailable' });
      } finally {
        client.release();
      }
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
