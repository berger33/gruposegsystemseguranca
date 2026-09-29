export function createContractImplantationApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
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

  const STEP_IDS = ['contrato','data_inicio','postos','dimensionamento','contratacao_alocacao','exames_treinamentos','equipamentos','instrucoes','faturamento','convite_cliente'];
  const STEP_TITLES = {
    contrato: 'Contrato assinado',
    data_inicio: 'Data de início definida',
    postos: 'Postos/turnos contratados dimensionados',
    dimensionamento: 'Dimensionamento validado',
    contratacao_alocacao: 'Contratação/alocação de equipe',
    exames_treinamentos: 'Exames/treinamentos',
    equipamentos: 'Equipamentos',
    instrucoes: 'Instruções operacionais',
    faturamento: 'Faturamento configurado',
    convite_cliente: 'Convite do cliente para portal',
  };
  const STEP_STATUSES = ['pendente','em_andamento','concluido','nao_aplicavel','bloqueado'];

  async function ensureImplantationSteps(pool, implantationId, contractId) {
    // Inicializa 10 itens padrão se não existirem
    const existing = await pool.query('SELECT step_id FROM crm_implantation_steps WHERE implantation_id = $1', [implantationId]);
    const existingIds = new Set(existing.rows.map(r => r.step_id));
    const missing = STEP_IDS.filter(id => !existingIds.has(id));
    for (const stepId of missing) {
      await pool.query(
        `INSERT INTO crm_implantation_steps (implantation_id, contract_id, step_id, title, status)
         VALUES ($1,$2,$3,$4,'pendente') ON CONFLICT (implantation_id, step_id) DO NOTHING`,
        [implantationId, contractId, stepId, STEP_TITLES[stepId]]
      );
    }
  }

  async function handleImplantation(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const cRes = await pool.query('SELECT id, company_id, title, status FROM crm_contracts WHERE id = $1', [contractId]);
        if (!cRes.rows[0]) return json(res, 404, { error: 'contract_not_found' });
        let implRes = await pool.query('SELECT * FROM crm_contract_implantations WHERE contract_id = $1', [contractId]);
        let implantation = implRes.rows[0];
        if (!implantation) {
          // Cria implantação planejada se não existir (idempotente)
          const implId = crypto.randomUUID();
          const proposalId = cRes.rows[0].id; // placeholder? precisa proposal_id existente; busca um proposal_id do contrato
          const contractFull = await pool.query('SELECT proposal_id, proposal_version FROM crm_contracts WHERE id = $1', [contractId]);
          const propId = contractFull.rows[0]?.proposal_id;
          const propVer = contractFull.rows[0]?.proposal_version || 1;
          if (!propId) return json(res, 404, { error: 'contract_proposal_missing' });
          await pool.query(
            `INSERT INTO crm_contract_implantations (id, contract_id, proposal_id, proposal_version, status, created_by, created_by_id)
             VALUES ($1,$2,$3,$4,'planejada',$5,$6) ON CONFLICT (contract_id) DO NOTHING`,
            [implId, contractId, propId, propVer, session.role, session.identityId || null]
          );
          implRes = await pool.query('SELECT * FROM crm_contract_implantations WHERE contract_id = $1', [contractId]);
          implantation = implRes.rows[0];
        }

        await ensureImplantationSteps(pool, implantation.id, contractId);
        const steps = await pool.query('SELECT * FROM crm_implantation_steps WHERE implantation_id = $1 ORDER BY CASE step_id WHEN \'contrato\' THEN 1 WHEN \'data_inicio\' THEN 2 WHEN \'postos\' THEN 3 WHEN \'dimensionamento\' THEN 4 WHEN \'contratacao_alocacao\' THEN 5 WHEN \'exames_treinamentos\' THEN 6 WHEN \'equipamentos\' THEN 7 WHEN \'instrucoes\' THEN 8 WHEN \'faturamento\' THEN 9 WHEN \'convite_cliente\' THEN 10 ELSE 99 END', [implantation.id]);

        const completed = steps.rows.filter(s => s.status === 'concluido').length;
        const total = steps.rows.length;
        const progress = total ? Math.round((completed / total) * 100) : 0;

        return json(res, 200, {
          contract: cRes.rows[0],
          implantation,
          steps: steps.rows,
          progress: { completed, total, percent: progress },
          checklist_required: STEP_IDS,
          note: 'Implantação com checklist: contrato, data_inicio, postos, dimensionamento, contratacao_alocacao, exames_treinamentos, equipamentos, instrucoes, faturamento, convite_cliente',
        });
      } catch (e) {
        console.error('implantation get failed', e);
        return json(res, 503, { error: 'implantation_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body;
      try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;
      if (body?.status !== undefined) {
        const st = String(body.status).trim().toLowerCase();
        if (!['planejada','em_andamento','concluida','cancelada'].includes(st)) return bad(res, 'invalid_status');
        fields.push(`status = $${idx++}`); vals.push(st);
      }
      if (body?.data_inicio !== undefined) {
        const di = body.data_inicio ? String(body.data_inicio).trim() : null;
        if (di && isNaN(Date.parse(di))) return bad(res, 'invalid_data_inicio');
        fields.push(`data_inicio = $${idx++}`); vals.push(di ? new Date(di).toISOString().slice(0,10) : null);
        fields.push(`started_at = $${idx++}`); vals.push(di ? new Date(di).toISOString().slice(0,10) : null);
      }
      if (body?.responsible_id !== undefined) { const rid = body.responsible_id ? String(body.responsible_id).trim() : null; if (rid && !isUuid(rid)) return bad(res, 'invalid_responsible_id'); fields.push(`responsible_id = $${idx++}`); vals.push(rid); }
      if (body?.responsible_name !== undefined) { const rn = sanitizeText(body.responsible_name, 120); fields.push(`responsible_name = $${idx++}`); vals.push(rn); }
      if (body?.completed_at !== undefined) { const ca = body.completed_at ? String(body.completed_at).trim() : null; if (ca && isNaN(Date.parse(ca))) return bad(res, 'invalid_completed_at'); fields.push(`completed_at = $${idx++}`); vals.push(ca ? new Date(ca).toISOString().slice(0,10) : null); }
      if (body?.notes !== undefined) { const n = sanitizeText(body.notes, 2000); fields.push(`notes = $${idx++}`); vals.push(n); }
      if (body?.checklist !== undefined) {
        if (typeof body.checklist !== 'object') return bad(res, 'invalid_checklist');
        fields.push(`checklist = $${idx++}::jsonb`); vals.push(JSON.stringify(body.checklist));
      }
      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`updated_at = NOW()`);
      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_contract_implantations SET ${fields.join(', ')} WHERE contract_id = $${idx} RETURNING *`, [...vals, contractId]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_implantation_update',$3,'allowed','none')", [session.role, session.identityId || session.role, upd.rows[0].id]); } catch {}
        return json(res, 200, { implantation: upd.rows[0] });
      } catch (e) {
        console.error('implantation update failed', e);
        return json(res, 503, { error: 'implantation_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  async function handleSteps(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const implRes = await pool.query('SELECT id FROM crm_contract_implantations WHERE contract_id = $1', [contractId]);
        if (!implRes.rows[0]) return json(res, 404, { error: 'implantation_not_found' });
        await ensureImplantationSteps(pool, implRes.rows[0].id, contractId);
        const steps = await pool.query('SELECT * FROM crm_implantation_steps WHERE contract_id = $1 ORDER BY CASE step_id WHEN \'contrato\' THEN 1 WHEN \'data_inicio\' THEN 2 WHEN \'postos\' THEN 3 WHEN \'dimensionamento\' THEN 4 WHEN \'contratacao_alocacao\' THEN 5 WHEN \'exames_treinamentos\' THEN 6 WHEN \'equipamentos\' THEN 7 WHEN \'instrucoes\' THEN 8 WHEN \'faturamento\' THEN 9 WHEN \'convite_cliente\' THEN 10 ELSE 99 END', [contractId]);
        return json(res, 200, { steps: steps.rows });
      } catch (e) {
        console.error('steps list failed', e);
        return json(res, 503, { error: 'steps_unavailable' });
      }
    }

    if (req.method === 'POST') {
      // Inicializa checklist padrão
      try {
        const pool = getPool();
        const implRes = await pool.query('SELECT id FROM crm_contract_implantations WHERE contract_id = $1', [contractId]);
        if (!implRes.rows[0]) return json(res, 404, { error: 'implantation_not_found' });
        await ensureImplantationSteps(pool, implRes.rows[0].id, contractId);
        const steps = await pool.query('SELECT * FROM crm_implantation_steps WHERE implantation_id = $1 ORDER BY CASE step_id WHEN \'contrato\' THEN 1 WHEN \'data_inicio\' THEN 2 WHEN \'postos\' THEN 3 WHEN \'dimensionamento\' THEN 4 WHEN \'contratacao_alocacao\' THEN 5 WHEN \'exames_treinamentos\' THEN 6 WHEN \'equipamentos\' THEN 7 WHEN \'instrucoes\' THEN 8 WHEN \'faturamento\' THEN 9 WHEN \'convite_cliente\' THEN 10 ELSE 99 END', [implRes.rows[0].id]);
        return json(res, 201, { steps: steps.rows, note: 'Checklist padrão 10 itens inicializado' });
      } catch (e) {
        console.error('steps init failed', e);
        return json(res, 503, { error: 'steps_init_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleStepById(req, res, contractId, stepId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!STEP_IDS.includes(stepId) && !isUuid(stepId)) return bad(res, 'invalid_step_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'PATCH') {
      let body;
      try { body = await readJson(req, 20 * 1024); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;
      if (body?.status !== undefined) {
        const st = String(body.status).trim().toLowerCase();
        if (!STEP_STATUSES.includes(st)) return bad(res, 'invalid_status');
        fields.push(`status = $${idx++}`); vals.push(st);
        if (st === 'concluido') {
          fields.push(`completed_at = $${idx++}`); vals.push(body?.completed_at ? new Date(String(body.completed_at).trim()).toISOString().slice(0,10) : new Date().toISOString().slice(0,10));
        }
      }
      if (body?.responsible_id !== undefined) { const rid = body.responsible_id ? String(body.responsible_id).trim() : null; if (rid && !isUuid(rid)) return bad(res, 'invalid_responsible_id'); fields.push(`responsible_id = $${idx++}`); vals.push(rid); }
      if (body?.responsible_name !== undefined) { const rn = sanitizeText(body.responsible_name, 120); fields.push(`responsible_name = $${idx++}`); vals.push(rn); }
      if (body?.completed_at !== undefined) { const ca = body.completed_at ? String(body.completed_at).trim() : null; if (ca && isNaN(Date.parse(ca))) return bad(res, 'invalid_completed_at'); fields.push(`completed_at = $${idx++}`); vals.push(ca ? new Date(ca).toISOString().slice(0,10) : null); }
      if (body?.notes !== undefined) { const n = sanitizeText(body.notes, 1000); fields.push(`notes = $${idx++}`); vals.push(n); }
      if (body?.description !== undefined) { const d = sanitizeText(body.description, 1000); fields.push(`description = $${idx++}`); vals.push(d); }
      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`updated_at = NOW()`);
      try {
        const pool = getPool();
        let whereClause = '';
        let whereVals = [];
        if (isUuid(stepId)) {
          whereClause = `id = $${idx} AND contract_id = $${idx+1}`;
          whereVals = [stepId, contractId];
        } else {
          whereClause = `step_id = $${idx}::crm_implantation_step_id AND contract_id = $${idx+1}`;
          whereVals = [stepId, contractId];
        }
        const upd = await pool.query(`UPDATE crm_implantation_steps SET ${fields.join(', ')} WHERE ${whereClause} RETURNING *`, [...vals, ...whereVals]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_implantation_step_update',$3,'allowed','none')", [session.role, session.identityId || session.role, upd.rows[0].id]); } catch {}

        // Verifica se todos concluídos para atualizar implantação para concluida?
        const allSteps = await pool.query('SELECT status FROM crm_implantation_steps WHERE contract_id = $1', [contractId]);
        const allConcluido = allSteps.rows.length > 0 && allSteps.rows.every(s => s.status === 'concluido' || s.status === 'nao_aplicavel');
        if (allConcluido) {
          try {
            await pool.query(`UPDATE crm_contract_implantations SET status = 'concluida', completed_at = CURRENT_DATE, updated_at = NOW() WHERE contract_id = $1 AND status != 'concluida'`, [contractId]);
          } catch {}
        }

        return json(res, 200, { step: upd.rows[0], all_completed: allSteps.rows.every(s => s.status === 'concluido' || s.status === 'nao_aplicavel') });
      } catch (e) {
        console.error('step update failed', e);
        return json(res, 503, { error: 'step_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'PATCH' });
  }

  async function handleBlocks(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const list = await pool.query('SELECT * FROM crm_implantation_blocks WHERE contract_id = $1 ORDER BY is_blocking DESC, created_at DESC', [contractId]);
        return json(res, 200, { blocks: list.rows, note: 'Bloqueios claros para implantação incompleta. is_blocking true impede conclusão. is_legal_requirement true não pode ser contornado com simples checkbox.' });
      } catch {
        return json(res, 503, { error: 'blocks_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body;
      try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const title = sanitizeText(body?.title, 200);
      const description = sanitizeText(body?.description, 2000);
      const block_type = body?.block_type ? String(body.block_type).trim().toLowerCase() : 'operacional';
      const step_id = body?.step_id ? String(body.step_id).trim().toLowerCase() : null;
      const is_legal_requirement = Boolean(body?.is_legal_requirement);
      const is_blocking = body?.is_blocking != null ? Boolean(body.is_blocking) : true;

      if (!title || !description) return bad(res, 'title_and_description_required');
      if (!['documentacao','treinamento','equipamento','legal','operacional','financeiro','outro'].includes(block_type)) return bad(res, 'invalid_block_type');
      if (step_id && !STEP_IDS.includes(step_id)) return bad(res, 'invalid_step_id');
      if (description.length < 20) return bad(res, 'description_min_20_required_for_clear_block');

      try {
        const pool = getPool();
        const implRes = await pool.query('SELECT id FROM crm_contract_implantations WHERE contract_id = $1', [contractId]);
        if (!implRes.rows[0]) return json(res, 404, { error: 'implantation_not_found' });

        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_implantation_blocks (id, contract_id, implantation_id, step_id, block_type, title, description, is_legal_requirement, is_blocking, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [id, contractId, implRes.rows[0].id, step_id, block_type, title, description, is_legal_requirement, is_blocking, session.role, session.identityId || null]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_implantation_block_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 201, { block: ins.rows[0], note: 'Bloqueio claro registrado. Se is_legal_requirement true, exceção não pode ser simples checkbox, precisa autorização, motivação e regra aplicável.' });
      } catch (e) {
        console.error('block create failed', e);
        return json(res, 503, { error: 'block_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleExceptions(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const list = await pool.query('SELECT * FROM crm_implantation_exceptions WHERE contract_id = $1 ORDER BY created_at DESC', [contractId]);
        return json(res, 200, { exceptions: list.rows, note: 'Exceções para implantação incompleta somente autorizada, motivada e permitida pelas regras aplicáveis. Não permitir contornar exigência legal com simples checkbox.' });
      } catch {
        return json(res, 503, { error: 'exceptions_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body;
      try { body = await readJson(req, 40 * 1024); } catch { return bad(res, 'invalid_json'); }
      const block_id = body?.block_id ? String(body.block_id).trim() : null;
      const step_id = body?.step_id ? String(body.step_id).trim().toLowerCase() : null;
      const title = sanitizeText(body?.title, 200);
      const motivation = sanitizeText(body?.motivation, 2000);
      const legal_basis = sanitizeText(body?.legal_basis, 1000);
      const is_legal_exception = Boolean(body?.is_legal_exception);
      const applicable_rule = sanitizeText(body?.applicable_rule, 500);

      if (!title) return bad(res, 'invalid_title');
      if (!motivation || motivation.length < 20) return bad(res, 'motivation_min_20_required');
      if (block_id && !isUuid(block_id)) return bad(res, 'invalid_block_id');
      if (step_id && !STEP_IDS.includes(step_id)) return bad(res, 'invalid_step_id');
      if (is_legal_exception && (!legal_basis || !applicable_rule)) return bad(res, 'legal_exception_requires_legal_basis_and_applicable_rule');
      if (is_legal_exception) {
        // Não permitir contornar exigência legal com simples checkbox: precisa base legal e regra aplicável e motivação detalhada
        if (motivation.length < 50) return bad(res, 'legal_exception_motivation_min_50');
      }

      try {
        const pool = getPool();
        const implRes = await pool.query('SELECT id FROM crm_contract_implantations WHERE contract_id = $1', [contractId]);
        if (!implRes.rows[0]) return json(res, 404, { error: 'implantation_not_found' });

        // Se block_id informado, verifica se é legal requirement e se exceção tenta contornar com checkbox
        if (block_id) {
          const blockRes = await pool.query('SELECT is_legal_requirement, is_blocking FROM crm_implantation_blocks WHERE id = $1 AND contract_id = $2', [block_id, contractId]);
          if (!blockRes.rows[0]) return json(res, 404, { error: 'block_not_found' });
          if (blockRes.rows[0].is_legal_requirement && !is_legal_exception) {
            return json(res, 409, { error: 'legal_requirement_cannot_be_bypassed_with_simple_checkbox', detail: 'Bloqueio com is_legal_requirement true exige exceção com is_legal_exception true, legal_basis, applicable_rule e motivação detalhada autorizada' });
          }
          if (blockRes.rows[0].is_legal_requirement && is_legal_exception && !legal_basis) {
            return bad(res, 'legal_basis_required_for_legal_requirement');
          }
        }

        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_implantation_exceptions
            (id, contract_id, implantation_id, block_id, step_id, title, motivation, legal_basis, is_legal_exception, applicable_rule, status, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'solicitada',$11,$12) RETURNING *`,
          [id, contractId, implRes.rows[0].id, block_id, step_id, title, motivation, legal_basis, is_legal_exception, applicable_rule, session.role, session.identityId || null]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_implantation_exception_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 201, { exception: ins.rows[0], note: 'Exceção solicitada com motivação. Para legal, precisa base legal, regra aplicável e autorização. Não é simples checkbox.' });
      } catch (e) {
        console.error('exception create failed', e);
        return json(res, 503, { error: 'exception_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleExceptionById(req, res, contractId, exceptionId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!isUuid(exceptionId)) return bad(res, 'invalid_exception_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_implantation_exceptions WHERE id = $1 AND contract_id = $2', [exceptionId, contractId]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        return json(res, 200, { exception: r.rows[0] });
      } catch {
        return json(res, 503, { error: 'exception_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body;
      try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const status = body?.status ? String(body.status).trim().toLowerCase() : null;
      const authorization_notes = sanitizeText(body?.authorization_notes, 1000);
      const rejection_reason = sanitizeText(body?.rejection_reason, 1000);

      if (!status || !['em_analise','autorizada','rejeitada','cancelada'].includes(status)) return bad(res, 'invalid_status');
      if (status === 'rejeitada' && !rejection_reason) return bad(res, 'rejection_reason_required');
      if (status === 'autorizada' && !authorization_notes) return bad(res, 'authorization_notes_required_for_authorized');

      try {
        const pool = getPool();
        const exRes = await pool.query('SELECT * FROM crm_implantation_exceptions WHERE id = $1 AND contract_id = $2', [exceptionId, contractId]);
        if (!exRes.rows[0]) return json(res, 404, { error: 'not_found' });
        const current = exRes.rows[0].status;
        if (current === 'autorizada' || current === 'rejeitada' || current === 'cancelada') {
          return json(res, 409, { error: 'already_finalized', current_status: current });
        }
        if (exRes.rows[0].is_legal_exception && status === 'autorizada' && !exRes.rows[0].legal_basis) {
          return json(res, 409, { error: 'legal_exception_requires_legal_basis' });
        }

        const fields = []; const vals = []; let idx = 1;
        fields.push(`status = $${idx++}`); vals.push(status);
        if (status === 'autorizada') {
          fields.push(`authorized_by = $${idx++}`); vals.push(session.role);
          fields.push(`authorized_by_id = $${idx++}`); vals.push(session.identityId || null);
          fields.push(`authorized_at = NOW()`);
          fields.push(`authorization_notes = $${idx++}`); vals.push(authorization_notes);
        }
        if (status === 'rejeitada') {
          fields.push(`rejection_reason = $${idx++}`); vals.push(rejection_reason);
        }
        fields.push(`updated_at = NOW()`);

        const upd = await pool.query(`UPDATE crm_implantation_exceptions SET ${fields.join(', ')} WHERE id = $${idx} AND contract_id = $${idx+1} RETURNING *`, [...vals, exceptionId, contractId]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });

        // Se autorizada, resolve bloqueio associado se houver
        if (status === 'autorizada' && exRes.rows[0].block_id) {
          try {
            await pool.query(`UPDATE crm_implantation_blocks SET resolved_at = NOW(), resolved_by = $1 WHERE id = $2`, [session.role, exRes.rows[0].block_id]);
          } catch {}
        }

        try {
          const act = status === 'autorizada' ? 'crm_implantation_exception_authorize' : status === 'rejeitada' ? 'crm_implantation_exception_reject' : 'crm_implantation_exception_create';
          await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,'allowed','none')", [session.role, session.identityId || session.role, act]);
        } catch {}

        return json(res, 200, { exception: upd.rows[0], note: status === 'autorizada' ? 'Exceção autorizada com motivação e regra aplicável. Bloqueio resolvido se houver. Legal não contornado com checkbox.' : 'Exceção atualizada' });
      } catch (e) {
        console.error('exception status change failed', e);
        return json(res, 503, { error: 'exception_status_change_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  async function handleBlockResolve(req, res, contractId, blockId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!isUuid(blockId)) return bad(res, 'invalid_block_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (req.method !== 'PATCH') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'PATCH' });

    try {
      const pool = getPool();
      const bRes = await pool.query('SELECT * FROM crm_implantation_blocks WHERE id = $1 AND contract_id = $2', [blockId, contractId]);
      if (!bRes.rows[0]) return json(res, 404, { error: 'not_found' });
      if (bRes.rows[0].is_legal_requirement) {
        return json(res, 409, { error: 'legal_requirement_block_cannot_be_resolved_without_exception', detail: 'Bloqueio com exigência legal precisa exceção autorizada, motivada e com regra aplicável, não simples resolução' });
      }
      const upd = await pool.query(`UPDATE crm_implantation_blocks SET resolved_at = NOW(), resolved_by = $1 WHERE id = $2 AND contract_id = $3 RETURNING *`, [session.role, blockId, contractId]);
      try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_implantation_block_resolve',$3,'allowed','none')", [session.role, session.identityId || session.role, blockId]); } catch {}
      return json(res, 200, { block: upd.rows[0] });
    } catch {
      return json(res, 503, { error: 'block_resolve_failed' });
    }
  }

  return { handleImplantation, handleSteps, handleStepById, handleBlocks, handleBlockResolve, handleExceptions, handleExceptionById, STEP_IDS, STEP_TITLES, STEP_STATUSES };
}
