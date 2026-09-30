import { createHash } from "node:crypto";
/**
 * OPS-01/02/03/04 — Operação: estrutura, dimensionamento, escala, validação
 * OPS-01: cliente → unidade → posto físico → necessidade por turno → alocação; cargo/função em entidade própria
 * OPS-02: dimensionamento contratado vs planejado vs realizado, cobertura por faixa tempo e profissional habilitado
 * OPS-03: escala rascunho/publicada/revisada, validade e histórico; calendário por posto/equipe/pessoa e ciência
 * Delivery gates: OPS-02/03 validation remains fail-closed and idempotent.
 * OPS-04: validar sobreposição, indisponibilidade, habilitação, documentação e regras jornada/descanso configuradas e aprovadas
 */

function validateUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function createOpsApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
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
  function ipHash(req) {
    const fwd = req.headers['x-forwarded-for'];
    const ip = fwd ? String(fwd).split(',')[0].trim() : req.socket?.remoteAddress || 'unknown';
    return createHash('sha256').update(ip).digest('hex').slice(0,32);
  }

  // ---- OPS-01 Job Roles (cargo/função) ----
  async function handleJobRoles(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const type = url.searchParams.get('role_type');
      const active = url.searchParams.get('is_active');
      const where = [];
      const vals = [];
      let i = 1;
      if (type) { where.push(`role_type=$${i++}`); vals.push(type); }
      if (active !== null && active !== '') { where.push(`is_active=$${i++}`); vals.push(active === 'true'); }
      const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_job_roles ${ws} ORDER BY role_type, name LIMIT 200`, vals);
        return send(res, 200, { roles: rows });
      } catch (e) { console.error('jobRoles GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const name = String(b.name || '').trim();
      if (name.length < 3 || name.length > 100) return send(res, 400, { error: 'invalid_name', detail: '3-100' });
      const role_type = b.role_type || b.roleType || 'funcao';
      if (!['cargo','funcao'].includes(role_type)) return send(res, 400, { error: 'invalid_role_type' });
      const description = b.description ? String(b.description).trim().slice(0,2000) : null;
      const requirements = b.requirements || {};
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_job_roles (name, role_type, description, requirements, is_active, created_by)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [name, role_type, description, JSON.stringify(requirements), b.is_active !== undefined ? !!b.is_active : true, sess.role]
        );
        try { await auditLog({ action: 'ops_job_role_create', actor: sess.role, target: rows[0].id, meta: { name, role_type } }); } catch {}
        return send(res, 201, { role: rows[0] });
      } catch (e) {
        if (e.code === '23505') return send(res, 409, { error: 'duplicate_role' });
        console.error('jobRoles POST', e.message); return send(res, 500, { error: 'internal_error' });
      }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const fields = [];
      const vals = [];
      let idx = 1;
      if (b.name !== undefined) { fields.push(`name=$${idx++}`); vals.push(String(b.name).trim()); }
      if (b.description !== undefined) { fields.push(`description=$${idx++}`); vals.push(String(b.description).trim()); }
      if (b.is_active !== undefined) { fields.push(`is_active=$${idx++}`); vals.push(!!b.is_active); }
      if (b.requirements !== undefined) { fields.push(`requirements=$${idx++}`); vals.push(JSON.stringify(b.requirements)); }
      if (!fields.length) return send(res, 400, { error: 'no_fields' });
      vals.push(id);
      try {
        const { rows } = await pool.query(`UPDATE ops_job_roles SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${idx} RETURNING *`, vals);
        if (!rows[0]) return send(res, 404, { error: 'not_found' });
        return send(res, 200, { role: rows[0] });
      } catch (e) { console.error('jobRoles PATCH', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ---- OPS-01 Posts ----
  async function handlePosts(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const company_id = url.searchParams.get('company_id');
      const unit_id = url.searchParams.get('unit_id');
      const post_type = url.searchParams.get('post_type');
      const is_active = url.searchParams.get('is_active');
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50)));
      const where = [];
      const vals = [];
      let i = 1;
      if (company_id) { if (!validateUuid(company_id)) return send(res, 400, { error: 'invalid_company_id' }); where.push(`company_id=$${i++}`); vals.push(company_id); }
      if (unit_id) { if (!validateUuid(unit_id)) return send(res, 400, { error: 'invalid_unit_id' }); where.push(`unit_id=$${i++}`); vals.push(unit_id); }
      if (post_type) { where.push(`post_type=$${i++}`); vals.push(post_type); }
      if (is_active !== null && is_active !== '') { where.push(`is_active=$${i++}`); vals.push(is_active === 'true'); }
      const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_posts ${ws} ORDER BY name LIMIT $${i}`, [...vals, limit]);
        return send(res, 200, { posts: rows });
      } catch (e) { console.error('posts GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const name = String(b.name || '').trim();
      if (name.length < 3 || name.length > 200) return send(res, 400, { error: 'invalid_name' });
      const company_id = b.company_id || b.companyId;
      if (company_id && !validateUuid(company_id)) return send(res, 400, { error: 'invalid_company_id' });
      const unit_id = b.unit_id || b.unitId;
      if (unit_id && !validateUuid(unit_id)) return send(res, 400, { error: 'invalid_unit_id' });
      const post_type = b.post_type || b.postType || 'portaria';
      if (!['portaria','vigilancia','limpeza','zeladoria','recepcao','monitoramento','manutencao','outro'].includes(post_type)) return send(res, 400, { error: 'invalid_post_type' });
      const location = b.location ? String(b.location).trim().slice(0,500) : null;
      const description = b.description ? String(b.description).trim().slice(0,2000) : null;
      const contract_id = b.contract_id || b.contractId;
      if (contract_id && !validateUuid(contract_id)) return send(res, 400, { error: 'invalid_contract_id' });
      // OPS-01: vínculo explícito posto → contrato canônico L05. O contrato deve
      // existir e, quando a empresa também é informada, pertencer à mesma empresa
      // (evita ligar posto ao contrato de outro cliente por ID trocado).
      let resolvedCompanyId = company_id || null;
      if (contract_id) {
        try {
          const c = await pool.query('SELECT id, company_id FROM crm_contracts WHERE id=$1', [contract_id]);
          if (!c.rows[0]) return send(res, 404, { error: 'contract_not_found' });
          if (company_id && c.rows[0].company_id && c.rows[0].company_id !== company_id) return send(res, 409, { error: 'contract_company_mismatch' });
          if (!resolvedCompanyId && c.rows[0].company_id) resolvedCompanyId = c.rows[0].company_id;
        } catch (e) { console.error('post contract lookup', e.message); return send(res, 503, { error: 'validation_unavailable' }); }
      }
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_posts (company_id, unit_id, contract_id, name, location, post_type, description, is_active, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [resolvedCompanyId, unit_id || null, contract_id || null, name, location, post_type, description, b.is_active !== undefined ? !!b.is_active : true, sess.role]
        );
        try { await auditLog({ action: 'ops_post_create', actor: sess.role, target: rows[0].id, meta: { name, company_id: resolvedCompanyId, contract_id: contract_id || null } }); } catch {}
        return send(res, 201, { post: rows[0] });
      } catch (e) { console.error('posts POST', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const fields = [];
      const vals = [];
      let idx = 1;
      if (b.name !== undefined) { fields.push(`name=$${idx++}`); vals.push(String(b.name).trim()); }
      if (b.location !== undefined) { fields.push(`location=$${idx++}`); vals.push(String(b.location).trim()); }
      if (b.post_type !== undefined || b.postType !== undefined) { fields.push(`post_type=$${idx++}`); vals.push(b.post_type || b.postType); }
      if (b.is_active !== undefined) { fields.push(`is_active=$${idx++}`); vals.push(!!b.is_active); }
      if (b.description !== undefined) { fields.push(`description=$${idx++}`); vals.push(String(b.description).trim()); }
      if (!fields.length) return send(res, 400, { error: 'no_fields' });
      vals.push(id);
      try {
        const { rows } = await pool.query(`UPDATE ops_posts SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${idx} RETURNING *`, vals);
        if (!rows[0]) return send(res, 404, { error: 'not_found' });
        return send(res, 200, { post: rows[0] });
      } catch (e) { console.error('posts PATCH', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ---- OPS-01 Shift Templates ----
  async function handleShiftTemplates(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_shift_templates ORDER BY shift_type, name LIMIT 100`);
        return send(res, 200, { templates: rows });
      } catch (e) { console.error('shiftTemplates GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const name = String(b.name || '').trim();
      if (name.length < 3 || name.length > 100) return send(res, 400, { error: 'invalid_name' });
      const shift_type = b.shift_type || b.shiftType || 'diurno';
      if (!['diurno','noturno','12x36_dia','12x36_noite','24x48','comercial','madrugada','flexivel','outro'].includes(shift_type)) return send(res, 400, { error: 'invalid_shift_type' });
      const start_time = b.start_time || b.startTime;
      const end_time = b.end_time || b.endTime;
      if (!start_time || !end_time) return send(res, 400, { error: 'start_end_required' });
      const duration = Number(b.duration_hours || b.durationHours || 8);
      if (!Number.isFinite(duration) || duration <= 0 || duration > 24) return send(res, 400, { error: 'invalid_duration' });
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_shift_templates (name, shift_type, start_time, end_time, duration_hours, description, is_active, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [name, shift_type, start_time, end_time, duration, b.description ? String(b.description).trim().slice(0,1000) : null, b.is_active !== undefined ? !!b.is_active : true, sess.role]
        );
        return send(res, 201, { template: rows[0] });
      } catch (e) {
        if (e.code === '23505') return send(res, 409, { error: 'duplicate_template' });
        console.error('shiftTemplates POST', e.message); return send(res, 500, { error: 'internal_error' });
      }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ---- OPS-01 Post Shift Needs ----
  async function handlePostShiftNeeds(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const post_id = url.searchParams.get('post_id');
      const where = [];
      const vals = [];
      let i = 1;
      if (post_id) { if (!validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' }); where.push(`post_id=$${i++}`); vals.push(post_id); }
      const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_post_shift_needs ${ws} ORDER BY post_id, day_of_week LIMIT 200`, vals);
        return send(res, 200, { needs: rows });
      } catch (e) { console.error('needs GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const post_id = b.post_id || b.postId;
      const shift_template_id = b.shift_template_id || b.shiftTemplateId;
      if (!validateUuid(post_id) || !validateUuid(shift_template_id)) return send(res, 400, { error: 'invalid_post_or_shift' });
      const role_id = b.role_id || b.roleId;
      if (role_id && !validateUuid(role_id)) return send(res, 400, { error: 'invalid_role_id' });
      const day_of_week = b.day_of_week !== undefined ? Number(b.day_of_week) : (b.dayOfWeek !== undefined ? Number(b.dayOfWeek) : null);
      if (day_of_week !== null && (!Number.isInteger(day_of_week) || day_of_week < 0 || day_of_week > 6)) return send(res, 400, { error: 'invalid_day_of_week' });
      const required_headcount = Number(b.required_headcount || b.requiredHeadcount || 1);
      if (!Number.isInteger(required_headcount) || required_headcount < 1 || required_headcount > 100) return send(res, 400, { error: 'invalid_headcount' });
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_post_shift_needs (post_id, shift_template_id, role_id, day_of_week, required_headcount, is_active, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [post_id, shift_template_id, role_id || null, day_of_week, required_headcount, b.is_active !== undefined ? !!b.is_active : true, sess.role]
        );
        return send(res, 201, { need: rows[0] });
      } catch (e) {
        if (e.code === '23505') return send(res, 409, { error: 'duplicate_need' });
        console.error('needs POST', e.message); return send(res, 500, { error: 'internal_error' });
      }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ---- OPS-01 Allocations ----
  async function handleAllocations(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const post_id = url.searchParams.get('post_id');
      const employee_id = url.searchParams.get('employee_id');
      const date = url.searchParams.get('allocation_date');
      const where = [];
      const vals = [];
      let i = 1;
      if (post_id) { if (!validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' }); where.push(`post_id=$${i++}`); vals.push(post_id); }
      if (employee_id) { if (!validateUuid(employee_id)) return send(res, 400, { error: 'invalid_employee_id' }); where.push(`employee_id=$${i++}`); vals.push(employee_id); }
      if (date) { where.push(`allocation_date=$${i++}`); vals.push(date); }
      const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_allocations ${ws} ORDER BY allocation_date DESC, post_id LIMIT 200`, vals);
        return send(res, 200, { allocations: rows });
      } catch (e) { console.error('alloc GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const post_id = b.post_id || b.postId;
      const employee_id = b.employee_id || b.employeeId;
      const shift_template_id = b.shift_template_id || b.shiftTemplateId;
      if (!validateUuid(post_id) || !validateUuid(employee_id) || !validateUuid(shift_template_id)) return send(res, 400, { error: 'invalid_ids' });
      const role_id = b.role_id || b.roleId;
      if (role_id && !validateUuid(role_id)) return send(res, 400, { error: 'invalid_role_id' });
      const allocation_date = b.allocation_date || b.allocationDate;
      if (!allocation_date) return send(res, 400, { error: 'allocation_date_required' });
      // OPS-01/07: o posto precisa existir e estar ativo. Um post_id inexistente
      // (troca de ID) é negado com 404, não colide em erro de FK.
      let postRow;
      try {
        const pr = await pool.query(
          `SELECT p.id, p.is_active, p.contract_id, c.status AS contract_status
             FROM ops_posts p
             LEFT JOIN crm_contracts c ON c.id = p.contract_id
            WHERE p.id=$1`,
          [post_id]
        );
        postRow = pr.rows[0];
      } catch (e) { console.error('alloc post lookup', e.message); return send(res, 503, { error: 'validation_unavailable' }); }
      if (!postRow) return send(res, 404, { error: 'post_not_found' });
      if (postRow.is_active === false) return send(res, 409, { error: 'post_inactive' });
      // OPS-07/CON-09: contrato encerrado/cancelado/suspenso não recebe nova
      // alocação; o histórico existente é preservado (não apagamos nada).
      const NON_OPERATIONAL_CONTRACT = ['encerrado', 'cancelado', 'suspenso'];
      if (postRow.contract_id && NON_OPERATIONAL_CONTRACT.includes(postRow.contract_status)) {
        return send(res, 409, { error: 'contract_not_operational', contract_status: postRow.contract_status });
      }
      // OPS-04: o funcionário precisa existir e estar ativo (não desligado/afastado).
      let empRow;
      try {
        const er = await pool.query('SELECT id, status FROM hr_employees WHERE id=$1', [employee_id]);
        empRow = er.rows[0];
      } catch (e) { console.error('alloc employee lookup', e.message); return send(res, 503, { error: 'validation_unavailable' }); }
      if (!empRow) return send(res, 404, { error: 'employee_not_found' });
      if (empRow.status !== 'ativo') return send(res, 409, { error: 'employee_not_operational', status: empRow.status });
      // Idempotência: uma repetição exata (mesmo posto/funcionário/data/turno) não
      // é uma sobreposição, é a mesma alocação. Reconhecemos antes para não criar
      // segunda linha nem confundir com conflito de escala.
      try {
        const dup = await pool.query(
          `SELECT id FROM ops_allocations WHERE post_id=$1 AND employee_id=$2 AND allocation_date=$3 AND shift_template_id=$4`,
          [post_id, employee_id, allocation_date, shift_template_id]
        );
        if (dup.rows[0]) return send(res, 409, { error: 'duplicate_allocation', existing: dup.rows[0].id });
      } catch (e) { console.error('duplicate check', e.message); return send(res, 503, { error: 'validation_unavailable' }); }
      // Validar sobreposição (OPS-04) - verifica se employee já tem alocação no mesmo dia e turno sobreposto
      try {
        // OPS-04: sobreposição de turno é uma validação de bloqueio, não um aviso.
        // Se a checagem não puder ser feita, negamos (fail-closed) em vez de
        // permitir uma escala potencialmente conflitante. Parâmetros: $1 employee,
        // $2 data, $3 turno alvo, $4 id em edição (para não colidir consigo mesmo).
        const overlap = await pool.query(
          `SELECT a.id FROM ops_allocations a
           JOIN ops_shift_templates st ON st.id = a.shift_template_id
           JOIN ops_shift_templates st2 ON st2.id = $3
           WHERE a.employee_id=$1 AND a.allocation_date=$2 AND a.id != COALESCE($4::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           AND (
             a.shift_template_id = $3
             OR (st.start_time < st.end_time AND st2.start_time < st2.end_time AND st.start_time < st2.end_time AND st.end_time > st2.start_time)
             OR (st.start_time >= st.end_time OR st2.start_time >= st2.end_time)
           )`,
          [employee_id, allocation_date, shift_template_id, b.id || null]
        );
        if (overlap.rows[0]) {
          return send(res, 409, { error: 'overlap_detected', existing: overlap.rows[0].id, detail: 'Funcionário já alocado em turno sobreposto no mesmo dia' });
        }
      } catch (e) { console.error('overlap check', e.message); return send(res, 503, { error: 'validation_unavailable' }); }
      // Validar habilitação/documentação
      if (role_id) {
        try {
          const qual = await pool.query(`SELECT * FROM ops_employee_qualifications WHERE employee_id=$1 AND role_id=$2 AND is_valid=true AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)`, [employee_id, role_id]);
          if (!qual.rows[0]) {
            await pool.query(
              `INSERT INTO ops_schedule_validations (employee_id, validation_type, is_valid, conflict_details, validated_by)
               VALUES ($1,'habilitacao',false,$2,$3)`,
              [employee_id, JSON.stringify({ message: 'Funcionário sem habilitação válida para cargo/função', role_id, employee_id }), sess.role]
            );
            return send(res, 400, { error: 'qualification_required', role_id, detail: 'Funcionário sem habilitação válida para cargo/função' });
          }
        } catch (e) { console.error('qual check', e.message); }
      }
      // Escrita + auditoria na MESMA transação (fail-closed): se a trilha em
      // audit_log não puder ser gravada, a alocação inteira é revertida — não
      // deixamos efeito parcial sem auditoria (padrão consolidado no L05).
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO ops_allocations (post_id, employee_id, shift_template_id, role_id, allocation_date, status, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [post_id, employee_id, shift_template_id, role_id || null, allocation_date, b.status || 'planejado', b.notes ? String(b.notes).trim().slice(0,2000) : null, sess.role]
        );
        await client.query(
          `INSERT INTO audit_log (action, actor, target, meta) VALUES ($1,$2,$3,$4)`,
          ['ops_allocation_create', sess.role, rows[0].id, JSON.stringify({ post_id, employee_id, allocation_date })]
        );
        await client.query('COMMIT');
        return send(res, 201, { allocation: rows[0] });
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch {}
        if (e.code === '23505') return send(res, 409, { error: 'duplicate_allocation' });
        console.error('alloc POST', e.message);
        return send(res, 503, { error: 'allocation_unavailable' });
      } finally {
        client.release();
      }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const status = b.status;
      if (status && !['planejado','confirmado','em_andamento','concluido','cancelado','substituido'].includes(status)) return send(res, 400, { error: 'invalid_status' });
      try {
        const { rows } = await pool.query(`UPDATE ops_allocations SET status=COALESCE($1,status), notes=COALESCE($2,notes), updated_at=NOW() WHERE id=$3 RETURNING *`, [status || null, b.notes ? String(b.notes).trim().slice(0,2000) : null, id]);
        if (!rows[0]) return send(res, 404, { error: 'not_found' });
        return send(res, 200, { allocation: rows[0] });
      } catch (e) { console.error('alloc PATCH', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ---- OPS-02 Dimensioning ----
  async function handleDimensioning(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const post_id = url.searchParams.get('post_id');
      const company_id = url.searchParams.get('company_id');
      const status = url.searchParams.get('status');
      const where = [];
      const vals = [];
      let i = 1;
      if (post_id) { if (!validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' }); where.push(`post_id=$${i++}`); vals.push(post_id); }
      if (company_id) { if (!validateUuid(company_id)) return send(res, 400, { error: 'invalid_company_id' }); where.push(`company_id=$${i++}`); vals.push(company_id); }
      if (status) { where.push(`status=$${i++}`); vals.push(status); }
      const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_dimensioning ${ws} ORDER BY period_start DESC LIMIT 100`, vals);
        return send(res, 200, { dimensionings: rows });
      } catch (e) { console.error('dim GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const post_id = b.post_id || b.postId;
      if (!validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' });
      const period_start = b.period_start || b.periodStart;
      const period_end = b.period_end || b.periodEnd;
      if (!period_start || !period_end) return send(res, 400, { error: 'period_required' });
      const parsedStart = new Date(period_start);
      const parsedEnd = new Date(period_end);
      if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime()) || parsedEnd < parsedStart) {
        return send(res, 400, { error: 'invalid_period', detail: 'period_end >= period_start and both dates must be valid' });
      }
      const company_id = b.company_id || b.companyId;
      const unit_id = b.unit_id || b.unitId;
      const contract_id = b.contract_id || b.contractId;
      if (company_id && !validateUuid(company_id)) return send(res, 400, { error: 'invalid_company_id' });
      if (unit_id && !validateUuid(unit_id)) return send(res, 400, { error: 'invalid_unit_id' });
      if (contract_id && !validateUuid(contract_id)) return send(res, 400, { error: 'invalid_contract_id' });
      const contracted = Number(b.contracted_headcount ?? b.contractedHeadcount ?? 0);
      const planned = Number(b.planned_headcount ?? b.plannedHeadcount ?? 0);
      const realized = Number(b.realized_headcount ?? b.realizedHeadcount ?? 0);
      const cov_req = Number(b.coverage_hours_required ?? b.coverageHoursRequired ?? 0);
      const cov_real = Number(b.coverage_hours_realized ?? b.coverageHoursRealized ?? 0);
      if (![contracted, planned, realized, cov_req, cov_real].every(Number.isFinite) ||
          ![contracted, planned, realized].every(Number.isInteger) ||
          [contracted, planned, realized, cov_req, cov_real].some((value) => value < 0)) {
        return send(res, 400, { error: 'invalid_dimensioning_values' });
      }
      const status = b.status || 'rascunho';
      if (!['rascunho','aprovado','em_execucao','concluido','arquivado'].includes(status)) {
        return send(res, 400, { error: 'invalid_status' });
      }
      try {
        const scope = await pool.query(
          `SELECT p.company_id AS post_company_id, p.unit_id AS post_unit_id,
                  p.contract_id AS post_contract_id, p.is_active AS post_active,
                  c.company_id AS contract_company_id, c.status AS contract_status
             FROM ops_posts p
             LEFT JOIN crm_contracts c ON c.id = COALESCE($2::uuid, p.contract_id)
            WHERE p.id=$1`, [post_id, contract_id || null]);
        const post = scope.rows[0];
        if (!post) return send(res, 404, { error: 'post_not_found' });
        if (post.post_active === false) return send(res, 409, { error: 'post_not_operational' });
        if (company_id && post.post_company_id && company_id !== post.post_company_id) return send(res, 409, { error: 'company_scope_mismatch' });
        if (unit_id && post.post_unit_id && unit_id !== post.post_unit_id) return send(res, 409, { error: 'unit_scope_mismatch' });
        if (contract_id && !post.contract_company_id) return send(res, 404, { error: 'contract_not_found' });
        if (contract_id && post.post_contract_id && post.post_contract_id !== contract_id) return send(res, 409, { error: 'post_contract_mismatch' });
        if (contract_id && post.contract_company_id !== (company_id || post.post_company_id)) return send(res, 409, { error: 'contract_company_mismatch' });
        if (contract_id && ['encerrado','cancelado','suspenso'].includes(post.contract_status)) return send(res, 409, { error: 'contract_not_operational' });
        const { rows } = await pool.query(
          `INSERT INTO ops_dimensioning (company_id, unit_id, post_id, contract_id, period_start, period_end, contracted_headcount, planned_headcount, realized_headcount, coverage_hours_required, coverage_hours_realized, status, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [company_id || null, unit_id || null, post_id, contract_id || null, period_start, period_end, contracted, planned, realized, cov_req, cov_real, status, b.notes ? String(b.notes).trim().slice(0,2000) : null, sess.role]
        );
        return send(res, 201, { dimensioning: rows[0] });
      } catch (e) { console.error('dim POST', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const fields = [];
      const vals = [];
      let idx = 1;
      const patchValues = {
        contracted_headcount: b.contracted_headcount ?? b.contractedHeadcount,
        planned_headcount: b.planned_headcount ?? b.plannedHeadcount,
        realized_headcount: b.realized_headcount ?? b.realizedHeadcount,
        coverage_hours_required: b.coverage_hours_required ?? b.coverageHoursRequired,
        coverage_hours_realized: b.coverage_hours_realized ?? b.coverageHoursRealized,
      };
      for (const [column, raw] of Object.entries(patchValues)) {
        if (raw === undefined) continue;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0 ||
            (['contracted_headcount','planned_headcount','realized_headcount'].includes(column) && !Number.isInteger(value))) {
          return send(res, 400, { error: 'invalid_dimensioning_values' });
        }
        fields.push(`${column}=$${idx++}`); vals.push(value);
      }
      if (b.status !== undefined) {
        if (!['rascunho','aprovado','em_execucao','concluido','arquivado'].includes(b.status)) return send(res, 400, { error: 'invalid_status' });
        fields.push(`status=$${idx++}`); vals.push(b.status);
      }
      if (b.notes !== undefined) { fields.push(`notes=$${idx++}`); vals.push(String(b.notes).trim().slice(0,2000)); }
      if (!fields.length) return send(res, 400, { error: 'no_fields' });
      vals.push(id);
      try {
        const { rows } = await pool.query(`UPDATE ops_dimensioning SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${idx} RETURNING *`, vals);
        if (!rows[0]) return send(res, 404, { error: 'not_found' });
        return send(res, 200, { dimensioning: rows[0] });
      } catch (e) { console.error('dim PATCH', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ---- OPS-02 Coverage Gaps ----
  async function handleCoverageGaps(req, res) {
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
        const { rows } = await pool.query(`SELECT * FROM ops_coverage_gaps ${ws} ORDER BY gap_date DESC LIMIT 100`, vals);
        return send(res, 200, { gaps: rows });
      } catch (e) { console.error('gaps GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const post_id = b.post_id || b.postId;
      if (!validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' });
      const gap_date = b.gap_date || b.gapDate;
      const gap_start = b.gap_start || b.gapStart;
      const gap_end = b.gap_end || b.gapEnd;
      if (!gap_date || !gap_start || !gap_end) return send(res, 400, { error: 'gap_fields_required' });
      if (new Date(gap_end) <= new Date(gap_start)) return send(res, 400, { error: 'invalid_gap_period' });
      const uncovered = Number(b.uncovered_minutes ?? b.uncoveredMinutes ?? 0);
      if (!Number.isInteger(uncovered) || uncovered < 0) return send(res, 400, { error: 'invalid_uncovered_minutes' });
      const dimensioning_id = b.dimensioning_id || b.dimensioningId || null;
      if (dimensioning_id && !validateUuid(dimensioning_id)) return send(res, 400, { error: 'invalid_dimensioning_id' });
      const responsible_id = b.responsible_id || b.responsibleId || null;
      if (responsible_id && !validateUuid(responsible_id)) return send(res, 400, { error: 'invalid_responsible_id' });
      try {
        if (responsible_id) {
          const employee = await pool.query(`SELECT id FROM hr_employees WHERE id=$1 AND status='ativo'`, [responsible_id]);
          if (!employee.rows[0]) return send(res, 409, { error: 'responsible_employee_not_operational' });
        }
        if (dimensioning_id) {
          const scope = await pool.query(
            `SELECT d.post_id, d.contract_id, p.is_active AS post_active,
                    c.status AS contract_status
               FROM ops_dimensioning d
               JOIN ops_posts p ON p.id=d.post_id
               LEFT JOIN crm_contracts c ON c.id=d.contract_id
              WHERE d.id=$1`, [dimensioning_id]);
          const dimensioning = scope.rows[0];
          if (!dimensioning) return send(res, 404, { error: 'dimensioning_not_found' });
          if (dimensioning.post_id !== post_id) return send(res, 409, { error: 'dimensioning_post_mismatch' });
          if (dimensioning.post_active === false) return send(res, 409, { error: 'post_not_operational' });
          if (['encerrado','cancelado','suspenso'].includes(dimensioning.contract_status)) return send(res, 409, { error: 'contract_not_operational' });
        }
        const { rows } = await pool.query(
          `INSERT INTO ops_coverage_gaps (dimensioning_id, post_id, gap_date, gap_start, gap_end, uncovered_minutes, reason, status, responsible_id, responsible_name, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [dimensioning_id, post_id, gap_date, gap_start, gap_end, uncovered, b.reason ? String(b.reason).trim().slice(0,1000) : null, b.status || 'aberto', responsible_id, b.responsible_name || b.responsibleName || null, sess.role]
        );
        return send(res, 201, { gap: rows[0] });
      } catch (e) { console.error('gaps POST', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const status = b.status;
      if (status && !['aberto','em_tratamento','resolvido','cancelado'].includes(status)) return send(res, 400, { error: 'invalid_status' });
      try {
        const { rows } = await pool.query(`UPDATE ops_coverage_gaps SET status=COALESCE($1,status), reason=COALESCE($2,reason), responsible_name=COALESCE($3,responsible_name), updated_at=NOW() WHERE id=$4 RETURNING *`, [status || null, b.reason ? String(b.reason).trim().slice(0,1000) : null, b.responsible_name || b.responsibleName || null, id]);
        if (!rows[0]) return send(res, 404, { error: 'not_found' });
        return send(res, 200, { gap: rows[0] });
      } catch (e) { console.error('gaps PATCH', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ---- OPS-03 Schedule Versions ----
  async function handleScheduleVersions(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const company_id = url.searchParams.get('company_id');
      const status = url.searchParams.get('status');
      const where = [];
      const vals = [];
      let i = 1;
      if (company_id) { if (!validateUuid(company_id)) return send(res, 400, { error: 'invalid_company_id' }); where.push(`company_id=$${i++}`); vals.push(company_id); }
      if (status) { where.push(`status=$${i++}`); vals.push(status); }
      const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_schedule_versions ${ws} ORDER BY valid_from DESC LIMIT 100`, vals);
        return send(res, 200, { versions: rows });
      } catch (e) { console.error('schedVer GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const company_id = b.company_id || b.companyId;
      const unit_id = b.unit_id || b.unitId;
      if (company_id && !validateUuid(company_id)) return send(res, 400, { error: 'invalid_company_id' });
      if (unit_id && !validateUuid(unit_id)) return send(res, 400, { error: 'invalid_unit_id' });
      const valid_from = b.valid_from || b.validFrom;
      const valid_to = b.valid_to || b.validTo;
      if (!valid_from || !valid_to) return send(res, 400, { error: 'valid_period_required' });
      const parsedFrom = new Date(valid_from);
      const parsedTo = new Date(valid_to);
      if (Number.isNaN(parsedFrom.getTime()) || Number.isNaN(parsedTo.getTime()) || parsedTo < parsedFrom) return send(res, 400, { error: 'invalid_valid_period' });
      const scheduleStatus = b.status || 'rascunho';
      if (!['rascunho','publicada','revisada','arquivada'].includes(scheduleStatus)) return send(res, 400, { error: 'invalid_status' });
      try {
        // version auto increment
        const vRes = await pool.query(`SELECT COALESCE(MAX(version),0)+1 AS v FROM ops_schedule_versions WHERE company_id IS NOT DISTINCT FROM $1 AND unit_id IS NOT DISTINCT FROM $2`, [company_id || null, unit_id || null]);
        const version = vRes.rows[0].v;
        const { rows } = await pool.query(
          `INSERT INTO ops_schedule_versions (company_id, unit_id, version, status, valid_from, valid_to, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [company_id || null, unit_id || null, version, scheduleStatus, valid_from, valid_to, b.notes ? String(b.notes).trim().slice(0,2000) : null, sess.role]
        );
        await pool.query(`INSERT INTO ops_schedule_history (version_id, previous_status, next_status, changed_by, reason) VALUES ($1,NULL,$2,$3,$4)`, [rows[0].id, rows[0].status, sess.role, 'Criação inicial']);
        return send(res, 201, { version: rows[0] });
      } catch (e) { console.error('schedVer POST', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const status = b.status;
      if (status && !['rascunho','em_revisao','publicada','revisada','arquivada','cancelada'].includes(status)) return send(res, 400, { error: 'invalid_status' });
      const patchFrom = b.valid_from || b.validFrom;
      const patchTo = b.valid_to || b.validTo;
      if (patchFrom || patchTo) {
        if (!patchFrom || !patchTo) return send(res, 400, { error: 'valid_period_required' });
        const parsedFrom = new Date(patchFrom);
        const parsedTo = new Date(patchTo);
        if (Number.isNaN(parsedFrom.getTime()) || Number.isNaN(parsedTo.getTime()) || parsedTo < parsedFrom) return send(res, 400, { error: 'invalid_valid_period' });
      }
      try {
        const cur = await pool.query(`SELECT status FROM ops_schedule_versions WHERE id=$1`, [id]);
        if (!cur.rows[0]) return send(res, 404, { error: 'not_found' });
        const prev = cur.rows[0].status;
        const { rows } = await pool.query(
          `UPDATE ops_schedule_versions SET status=COALESCE($1,status), valid_from=COALESCE($2,valid_from), valid_to=COALESCE($3,valid_to), notes=COALESCE($4,notes), published_at=CASE WHEN $1 IN ('publicada','revisada') THEN NOW() ELSE published_at END, published_by=CASE WHEN $1 IN ('publicada','revisada') THEN $5 ELSE published_by END, updated_at=NOW() WHERE id=$6 RETURNING *`,
          [status || null, patchFrom || null, patchTo || null, b.notes ? String(b.notes).trim().slice(0,2000) : null, sess.role, id]
        );
        if (status && prev !== status) {
          await pool.query(`INSERT INTO ops_schedule_history (version_id, previous_status, next_status, changed_by, reason) VALUES ($1,$2,$3,$4,$5)`, [id, prev, status, sess.role, b.reason || null]);
        }
        try { await auditLog({ action: 'ops_schedule_version_update', actor: sess.role, target: id, meta: { prev, next: status } }); } catch {}
        return send(res, 200, { version: rows[0] });
      } catch (e) { console.error('schedVer PATCH', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ---- OPS-03 Schedule Entries ----
  async function handleScheduleEntries(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const version_id = url.searchParams.get('version_id');
      const post_id = url.searchParams.get('post_id');
      const employee_id = url.searchParams.get('employee_id');
      const entry_date = url.searchParams.get('entry_date');
      const where = [];
      const vals = [];
      let i = 1;
      if (version_id) { if (!validateUuid(version_id)) return send(res, 400, { error: 'invalid_version_id' }); where.push(`version_id=$${i++}`); vals.push(version_id); }
      if (post_id) { if (!validateUuid(post_id)) return send(res, 400, { error: 'invalid_post_id' }); where.push(`post_id=$${i++}`); vals.push(post_id); }
      if (employee_id) { if (!validateUuid(employee_id)) return send(res, 400, { error: 'invalid_employee_id' }); where.push(`employee_id=$${i++}`); vals.push(employee_id); }
      if (entry_date) { where.push(`entry_date=$${i++}`); vals.push(entry_date); }
      const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_schedule_entries ${ws} ORDER BY entry_date, post_id LIMIT 200`, vals);
        return send(res, 200, { entries: rows });
      } catch (e) { console.error('schedEntries GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const version_id = b.version_id || b.versionId;
      const post_id = b.post_id || b.postId;
      const employee_id = b.employee_id || b.employeeId;
      const shift_template_id = b.shift_template_id || b.shiftTemplateId;
      if (!validateUuid(version_id) || !validateUuid(post_id) || !validateUuid(employee_id) || !validateUuid(shift_template_id)) return send(res, 400, { error: 'invalid_ids' });
      const entry_date = b.entry_date || b.entryDate;
      if (!entry_date) return send(res, 400, { error: 'entry_date_required' });
      const role_id = b.role_id || b.roleId;
      if (role_id && !validateUuid(role_id)) return send(res, 400, { error: 'invalid_role_id' });
      // Validar versão status (só rascunho/em_revisao pode adicionar)
      try {
        const ver = await pool.query(`SELECT status, valid_from, valid_to FROM ops_schedule_versions WHERE id=$1`, [version_id]);
        if (!ver.rows[0]) return send(res, 404, { error: 'version_not_found' });
        if (!['rascunho','em_revisao','revisada'].includes(ver.rows[0].status)) return send(res, 400, { error: 'version_not_editable', status: ver.rows[0].status });
        if (new Date(entry_date) < new Date(ver.rows[0].valid_from) || new Date(entry_date) > new Date(ver.rows[0].valid_to)) return send(res, 400, { error: 'entry_date_out_of_validity', valid_from: ver.rows[0].valid_from, valid_to: ver.rows[0].valid_to });
      } catch {}
      // Retry idempotente: a mesma chave natural deve ser reportada como duplicata,
      // antes da validação genérica de sobreposição.
      try {
        const duplicate = await pool.query(
          `SELECT id FROM ops_schedule_entries WHERE version_id=$1 AND post_id=$2 AND employee_id=$3 AND entry_date=$4 AND shift_template_id=$5`,
          [version_id, post_id, employee_id, entry_date, shift_template_id]
        );
        if (duplicate.rows[0]) return send(res, 409, { error: 'duplicate_entry', existing: duplicate.rows[0].id });
      } catch (e) { console.error('duplicate schedule check', e.message); return send(res, 503, { error: 'schedule_validation_unavailable' }); }
      // OPS-04 validações sobreposição, indisponibilidade, habilitação
      try {
        const overlap = await pool.query(
          `SELECT id FROM ops_schedule_entries WHERE employee_id=$1 AND entry_date=$2 AND shift_template_id=$3 AND id != COALESCE($4::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
          [employee_id, entry_date, shift_template_id, b.id || null]
        );
        if (overlap.rows[0]) {
          await pool.query(`INSERT INTO ops_schedule_validations (version_id, employee_id, validation_type, is_valid, conflict_details, validated_by) VALUES ($1,$2,'sobreposicao',false,$3,$4)`, [version_id, employee_id, JSON.stringify({ existing_entry: overlap.rows[0].id, entry_date, shift_template_id }), sess.role]);
          return send(res, 409, { error: 'overlap_detected', existing: overlap.rows[0].id });
        }
        // Verifica indisponibilidade via hr_absences ou hr_time_entries? simplificado: verifica se employee tem ausência na data
        const absence = await pool.query(`SELECT id FROM hr_absences WHERE employee_id=$1 AND $2 BETWEEN start_date AND COALESCE(end_date, $2) LIMIT 1`, [employee_id, entry_date]).catch(() => ({ rows: [] }));
        if (absence.rows[0]) {
          await pool.query(`INSERT INTO ops_schedule_validations (version_id, employee_id, validation_type, is_valid, conflict_details, validated_by) VALUES ($1,$2,'indisponibilidade',false,$3,$4)`, [version_id, employee_id, JSON.stringify({ absence_id: absence.rows[0].id, entry_date }), sess.role]);
          return send(res, 400, { error: 'employee_unavailable', absence_id: absence.rows[0].id });
        }
      } catch (e) { console.error('validation check', e.message); }
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_schedule_entries (version_id, post_id, employee_id, shift_template_id, role_id, entry_date, status, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [version_id, post_id, employee_id, shift_template_id, role_id || null, entry_date, b.status || 'planejado', b.notes ? String(b.notes).trim().slice(0,1000) : null, sess.role]
        );
        // Validação positiva
        await pool.query(`INSERT INTO ops_schedule_validations (version_id, entry_id, employee_id, validation_type, is_valid, validated_by) VALUES ($1,$2,$3,'sobreposicao',true,$4)`, [version_id, rows[0].id, employee_id, sess.role]).catch(() => {});
        return send(res, 201, { entry: rows[0] });
      } catch (e) {
        if (e.code === '23505') return send(res, 409, { error: 'duplicate_entry' });
        console.error('schedEntries POST', e.message); return send(res, 500, { error: 'internal_error' });
      }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const status = b.status;
      if (status && !['planejado','confirmado','em_andamento','realizado','falta','substituido','cancelado'].includes(status)) return send(res, 400, { error: 'invalid_status' });
      try {
        const { rows } = await pool.query(`UPDATE ops_schedule_entries SET status=COALESCE($1,status), notes=COALESCE($2,notes), updated_at=NOW() WHERE id=$3 RETURNING *`, [status || null, b.notes ? String(b.notes).trim().slice(0,1000) : null, id]);
        if (!rows[0]) return send(res, 404, { error: 'not_found' });
        return send(res, 200, { entry: rows[0] });
      } catch (e) { console.error('schedEntries PATCH', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ---- OPS-03 Acknowledgments ----
  async function handleScheduleAcks(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const version_id = url.searchParams.get('version_id');
      const employee_id = url.searchParams.get('employee_id');
      const where = [];
      const vals = [];
      let i = 1;
      if (version_id) { if (!validateUuid(version_id)) return send(res, 400, { error: 'invalid_version_id' }); where.push(`version_id=$${i++}`); vals.push(version_id); }
      if (employee_id) { if (!validateUuid(employee_id)) return send(res, 400, { error: 'invalid_employee_id' }); where.push(`employee_id=$${i++}`); vals.push(employee_id); }
      const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_schedule_acknowledgments ${ws} ORDER BY acknowledged_at DESC LIMIT 100`, vals);
        return send(res, 200, { acknowledgments: rows });
      } catch (e) { console.error('acks GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const version_id = b.version_id || b.versionId;
      const employee_id = b.employee_id || b.employeeId;
      if (!validateUuid(version_id) || !validateUuid(employee_id)) return send(res, 400, { error: 'invalid_ids' });
      // Verifica versão publicada
      try {
        const ver = await pool.query(`SELECT status FROM ops_schedule_versions WHERE id=$1`, [version_id]);
        if (!ver.rows[0]) return send(res, 404, { error: 'version_not_found' });
        if (!['publicada','revisada'].includes(ver.rows[0].status)) return send(res, 400, { error: 'version_not_published', status: ver.rows[0].status });
      } catch {}
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_schedule_acknowledgments (version_id, employee_id, ip_hash, notes)
           VALUES ($1,$2,$3,$4) RETURNING *`,
          [version_id, employee_id, ipHash(req), b.notes ? String(b.notes).trim().slice(0,500) : null]
        );
        try { await auditLog({ action: 'ops_schedule_ack', actor: sess.role, target: version_id, meta: { employee_id } }); } catch {}
        return send(res, 201, { acknowledgment: rows[0] });
      } catch (e) {
        if (e.code === '23505') return send(res, 409, { error: 'duplicate_ack' });
        console.error('acks POST', e.message); return send(res, 500, { error: 'internal_error' });
      }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ---- OPS-03 History ----
  async function handleScheduleHistory(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const version_id = url.searchParams.get('version_id');
      if (!version_id || !validateUuid(version_id)) return send(res, 400, { error: 'invalid_version_id' });
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_schedule_history WHERE version_id=$1 ORDER BY created_at DESC LIMIT 100`, [version_id]);
        return send(res, 200, { history: rows });
      } catch (e) { console.error('schedHist GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ---- OPS-04 Work Rules ----
  async function handleWorkRules(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_work_rules ORDER BY is_approved DESC, name LIMIT 100`);
        return send(res, 200, { rules: rows });
      } catch (e) { console.error('workRules GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const name = String(b.name || '').trim();
      if (name.length < 3 || name.length > 200) return send(res, 400, { error: 'invalid_name' });
      const max_daily = Number(b.max_daily_hours || b.maxDailyHours || 8);
      const min_rest = Number(b.min_rest_hours || b.minRestHours || 11);
      const max_consec = Number(b.max_consecutive_days || b.maxConsecutiveDays || 6);
      const max_weekly = Number(b.max_weekly_hours || b.maxWeeklyHours || 44);
      if (!Number.isFinite(max_daily) || max_daily <= 0 || max_daily > 24) return send(res, 400, { error: 'invalid_max_daily' });
      if (!Number.isFinite(min_rest) || min_rest < 0 || min_rest > 24) return send(res, 400, { error: 'invalid_min_rest' });
      if (!Number.isInteger(max_consec) || max_consec < 1 || max_consec > 30) return send(res, 400, { error: 'invalid_max_consecutive' });
      if (!Number.isFinite(max_weekly) || max_weekly <= 0 || max_weekly > 80) return send(res, 400, { error: 'invalid_max_weekly' });
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_work_rules (name, description, max_daily_hours, min_rest_hours, max_consecutive_days, max_weekly_hours, requires_certification, is_approved, approved_by, is_active, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [name, b.description ? String(b.description).trim().slice(0,2000) : null, max_daily, min_rest, max_consec, max_weekly, !!b.requires_certification, !!b.is_approved, b.is_approved ? sess.role : null, b.is_active !== undefined ? !!b.is_active : true, sess.role]
        );
        return send(res, 201, { rule: rows[0] });
      } catch (e) {
        if (e.code === '23505') return send(res, 409, { error: 'duplicate_rule' });
        console.error('workRules POST', e.message); return send(res, 500, { error: 'internal_error' });
      }
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const id = b.id;
      if (!validateUuid(id)) return send(res, 400, { error: 'invalid_id' });
      const fields = [];
      const vals = [];
      let idx = 1;
      if (b.name !== undefined) { fields.push(`name=$${idx++}`); vals.push(String(b.name).trim()); }
      if (b.description !== undefined) { fields.push(`description=$${idx++}`); vals.push(String(b.description).trim()); }
      if (b.max_daily_hours !== undefined || b.maxDailyHours !== undefined) { fields.push(`max_daily_hours=$${idx++}`); vals.push(Number(b.max_daily_hours || b.maxDailyHours)); }
      if (b.min_rest_hours !== undefined || b.minRestHours !== undefined) { fields.push(`min_rest_hours=$${idx++}`); vals.push(Number(b.min_rest_hours || b.minRestHours)); }
      if (b.max_consecutive_days !== undefined || b.maxConsecutiveDays !== undefined) { fields.push(`max_consecutive_days=$${idx++}`); vals.push(Number(b.max_consecutive_days || b.maxConsecutiveDays)); }
      if (b.max_weekly_hours !== undefined || b.maxWeeklyHours !== undefined) { fields.push(`max_weekly_hours=$${idx++}`); vals.push(Number(b.max_weekly_hours || b.maxWeeklyHours)); }
      if (b.is_approved !== undefined || b.isApproved !== undefined) {
        const appr = !!(b.is_approved || b.isApproved);
        fields.push(`is_approved=$${idx++}`); vals.push(appr);
        if (appr) { fields.push(`approved_by=$${idx++}`); vals.push(sess.role); fields.push(`approved_at=NOW()`); }
      }
      if (b.is_active !== undefined) { fields.push(`is_active=$${idx++}`); vals.push(!!b.is_active); }
      if (!fields.length) return send(res, 400, { error: 'no_fields' });
      vals.push(id);
      try {
        const { rows } = await pool.query(`UPDATE ops_work_rules SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${idx} RETURNING *`, vals);
        if (!rows[0]) return send(res, 404, { error: 'not_found' });
        return send(res, 200, { rule: rows[0] });
      } catch (e) { console.error('workRules PATCH', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ---- OPS-04 Employee Qualifications ----
  async function handleQualifications(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const employee_id = url.searchParams.get('employee_id');
      const role_id = url.searchParams.get('role_id');
      const is_valid = url.searchParams.get('is_valid');
      const where = [];
      const vals = [];
      let i = 1;
      if (employee_id) { if (!validateUuid(employee_id)) return send(res, 400, { error: 'invalid_employee_id' }); where.push(`employee_id=$${i++}`); vals.push(employee_id); }
      if (role_id) { if (!validateUuid(role_id)) return send(res, 400, { error: 'invalid_role_id' }); where.push(`role_id=$${i++}`); vals.push(role_id); }
      if (is_valid !== null && is_valid !== '') { where.push(`is_valid=$${i++}`); vals.push(is_valid === 'true'); }
      const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_employee_qualifications ${ws} ORDER BY valid_until DESC NULLS LAST LIMIT 200`, vals);
        return send(res, 200, { qualifications: rows });
      } catch (e) { console.error('qual GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return send(res, 403, { error: 'same_origin_required' });
      if (!requireRole(sess, ['admin','ti','rh'])) return send(res, 403, { error: 'forbidden' });
      const b = await body(req);
      if (!b) return send(res, 400, { error: 'invalid_json' });
      const employee_id = b.employee_id || b.employeeId;
      if (!validateUuid(employee_id)) return send(res, 400, { error: 'invalid_employee_id' });
      const certification_type = String(b.certification_type || b.certificationType || '').trim();
      if (certification_type.length < 3 || certification_type.length > 100) return send(res, 400, { error: 'invalid_certification_type' });
      const role_id = b.role_id || b.roleId;
      if (role_id && !validateUuid(role_id)) return send(res, 400, { error: 'invalid_role_id' });
      const valid_until = b.valid_until || b.validUntil || null;
      try {
        const { rows } = await pool.query(
          `INSERT INTO ops_employee_qualifications (employee_id, role_id, certification_type, valid_until, is_valid, document_url, issued_by, notes, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (employee_id, role_id, certification_type) DO UPDATE SET valid_until=$4, is_valid=$5, document_url=$6, issued_by=$7, notes=$8, updated_at=NOW()
           RETURNING *`,
          [employee_id, role_id || null, certification_type, valid_until, b.is_valid !== undefined ? !!b.is_valid : true, b.document_url || b.documentUrl || null, b.issued_by || b.issuedBy || null, b.notes ? String(b.notes).trim().slice(0,1000) : null, sess.role]
        );
        return send(res, 201, { qualification: rows[0] });
      } catch (e) { console.error('qual POST', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  // ---- OPS-04 Validations ----
  async function handleValidations(req, res) {
    const sess = await requireSession(req);
    if (!sess) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const version_id = url.searchParams.get('version_id');
      const employee_id = url.searchParams.get('employee_id');
      const is_valid = url.searchParams.get('is_valid');
      const validation_type = url.searchParams.get('validation_type');
      const where = [];
      const vals = [];
      let i = 1;
      if (version_id) { if (!validateUuid(version_id)) return send(res, 400, { error: 'invalid_version_id' }); where.push(`version_id=$${i++}`); vals.push(version_id); }
      if (employee_id) { if (!validateUuid(employee_id)) return send(res, 400, { error: 'invalid_employee_id' }); where.push(`employee_id=$${i++}`); vals.push(employee_id); }
      if (is_valid !== null && is_valid !== '') { where.push(`is_valid=$${i++}`); vals.push(is_valid === 'true'); }
      if (validation_type) { where.push(`validation_type=$${i++}`); vals.push(validation_type); }
      const ws = where.length ? `WHERE ${where.join(' AND ')}` : '';
      try {
        const { rows } = await pool.query(`SELECT * FROM ops_schedule_validations ${ws} ORDER BY validated_at DESC LIMIT 200`, vals);
        return send(res, 200, { validations: rows });
      } catch (e) { console.error('validations GET', e.message); return send(res, 500, { error: 'internal_error' }); }
    }
    return send(res, 405, { error: 'method_not_allowed' });
  }

  return {
    handleJobRoles,
    handlePosts,
    handleShiftTemplates,
    handlePostShiftNeeds,
    handleAllocations,
    handleDimensioning,
    handleCoverageGaps,
    handleScheduleVersions,
    handleScheduleEntries,
    handleScheduleAcks,
    handleScheduleHistory,
    handleWorkRules,
    handleQualifications,
    handleValidations,
  };
}
