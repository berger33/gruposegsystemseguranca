export function createContractClosureApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
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

  const CLOSURE_TYPES = ['encerramento','rescisao','distrato','termino_vigencia','outro'];
  const CLOSURE_STATUSES = ['planejado','em_andamento','concluido','cancelado'];
  const STEP_TYPES = ['desmobilizacao_equipe','devolucao_equipamentos','devolucao_chaves','cobrancas_pendencias','documentos_finais','revogacao_escopos','comunicacao_cliente','outro'];
  const STEP_STATUSES = ['pendente','em_andamento','concluido','nao_aplicavel'];

  const DEFAULT_CLOSURE_STEPS = [
    { step_type: 'desmobilizacao_equipe', title: 'Desmobilização de equipe' },
    { step_type: 'devolucao_equipamentos', title: 'Devolução de equipamentos' },
    { step_type: 'devolucao_chaves', title: 'Devolução de chaves e acessos' },
    { step_type: 'cobrancas_pendencias', title: 'Cobranças e pendências financeiras' },
    { step_type: 'documentos_finais', title: 'Documentos finais e dossiê' },
    { step_type: 'revogacao_escopos', title: 'Revogação de escopos e acessos' },
    { step_type: 'comunicacao_cliente', title: 'Comunicação de encerramento ao cliente' },
  ];

  async function ensureClosureSteps(pool, closureId, contractId) {
    const existing = await pool.query('SELECT step_type FROM crm_closure_steps WHERE closure_id = $1', [closureId]);
    const existingTypes = new Set(existing.rows.map(r => r.step_type));
    for (const def of DEFAULT_CLOSURE_STEPS) {
      if (!existingTypes.has(def.step_type)) {
        await pool.query(
          `INSERT INTO crm_closure_steps (closure_id, contract_id, step_type, title, status)
           VALUES ($1,$2,$3,$4,'pendente') ON CONFLICT DO NOTHING`,
          [closureId, contractId, def.step_type, def.title]
        );
      }
    }
  }

  async function handleClosure(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const cRes = await pool.query('SELECT id, status, title FROM crm_contracts WHERE id = $1', [contractId]);
        if (!cRes.rows[0]) return json(res, 404, { error: 'contract_not_found' });
        const closureRes = await pool.query('SELECT * FROM crm_contract_closures WHERE contract_id = $1', [contractId]);
        let closure = closureRes.rows[0] || null;
        let steps = [];
        let revocations = [];
        let history = [];
        if (closure) {
          await ensureClosureSteps(pool, closure.id, contractId);
          const stepsRes = await pool.query('SELECT * FROM crm_closure_steps WHERE closure_id = $1 ORDER BY CASE step_type WHEN \'desmobilizacao_equipe\' THEN 1 WHEN \'devolucao_equipamentos\' THEN 2 WHEN \'devolucao_chaves\' THEN 3 WHEN \'cobrancas_pendencias\' THEN 4 WHEN \'documentos_finais\' THEN 5 WHEN \'revogacao_escopos\' THEN 6 WHEN \'comunicacao_cliente\' THEN 7 ELSE 99 END', [closure.id]);
          steps = stepsRes.rows;
          const revRes = await pool.query('SELECT * FROM crm_contract_scope_revocations WHERE closure_id = $1 ORDER BY revoked_at DESC', [closure.id]);
          revocations = revRes.rows;
          const histRes = await pool.query('SELECT * FROM crm_closure_history WHERE closure_id = $1 ORDER BY effective_date DESC', [closure.id]);
          history = histRes.rows;
        }
        const progress = closure ? { total: steps.length, completed: steps.filter(s => s.status === 'concluido' || s.status === 'nao_aplicavel').length } : null;
        if (progress) progress.percent = progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;

        return json(res, 200, {
          contract: cRes.rows[0],
          closure,
          steps,
          revocations,
          history,
          progress,
          note: 'Encerramento com desmobilização, devolução, cobranças/pendências, documentos e revogação de escopos; preserva histórico. Encerramento deixa de gerar novas rotinas conforme data de efeito sem apagar lançamentos já existentes.',
        });
      } catch (e) {
        console.error('closure get failed', e);
        return json(res, 503, { error: 'closure_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body;
      try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const closure_type = body?.closure_type ? String(body.closure_type).trim().toLowerCase() : 'encerramento';
      const closure_date = body?.closure_date ? String(body.closure_date).trim() : null;
      const effective_date = body?.effective_date ? String(body.effective_date).trim() : null;
      const reason = sanitizeText(body?.reason, 2000);
      const responsible_id = body?.responsible_id ? String(body.responsible_id).trim() : null;
      const responsible_name = sanitizeText(body?.responsible_name, 120);
      const notes = sanitizeText(body?.notes, 2000);

      if (!CLOSURE_TYPES.includes(closure_type)) return bad(res, 'invalid_closure_type');
      if (!closure_date || isNaN(Date.parse(closure_date))) return bad(res, 'invalid_closure_date_required');
      if (!effective_date || isNaN(Date.parse(effective_date))) return bad(res, 'invalid_effective_date_required');
      if (!reason || reason.length < 10) return bad(res, 'reason_min_10_required');
      if (responsible_id && !isUuid(responsible_id)) return bad(res, 'invalid_responsible_id');
      if (new Date(effective_date) < new Date(closure_date)) return bad(res, 'effective_must_be_after_closure');

      try {
        const pool = getPool();
        const cRes = await pool.query('SELECT id, status FROM crm_contracts WHERE id = $1', [contractId]);
        if (!cRes.rows[0]) return json(res, 404, { error: 'contract_not_found' });
        if (cRes.rows[0].status === 'encerrado') return json(res, 409, { error: 'contract_already_encerrado', note: 'Histórico preservado, não apagar lançamentos' });

        const existing = await pool.query('SELECT id FROM crm_contract_closures WHERE contract_id = $1', [contractId]);
        if (existing.rows[0]) return json(res, 409, { error: 'closure_already_exists', closure_id: existing.rows[0].id });

        const id = crypto.randomUUID();
        const closureDateStr = new Date(closure_date).toISOString().slice(0,10);
        const effectiveDateStr = new Date(effective_date).toISOString().slice(0,10);

        const ins = await pool.query(
          `INSERT INTO crm_contract_closures (id, contract_id, closure_type, closure_date, effective_date, reason, status, responsible_id, responsible_name, notes, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,'planejado',$7,$8,$9,$10,$11) RETURNING *`,
          [id, contractId, closure_type, closureDateStr, effectiveDateStr, reason, responsible_id, responsible_name, notes, session.role, session.identityId || null]
        );

        await ensureClosureSteps(pool, id, contractId);

        const histId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO crm_closure_history (id, closure_id, contract_id, previous_status, next_status, effective_date, reason, changed_by, changed_by_id)
           VALUES ($1,$2,$3,NULL,'planejado',$4,$5,$6,$7)`,
          [histId, id, contractId, effectiveDateStr, reason.slice(0,1000), session.role, session.identityId || null]
        );

        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_closure_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}

        return json(res, 201, { closure: ins.rows[0], history_id: histId, note: 'Encerramento criado com desmobilização, devolução, cobranças, documentos e revogação escopos; preserva histórico. Data de efeito define quando deixa de gerar novas rotinas.' });
      } catch (e) {
        console.error('closure create failed', e);
        return json(res, 503, { error: 'closure_create_failed' });
      }
    }

    if (req.method === 'PATCH') {
      let body;
      try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;
      let statusChange = null;
      let reason = null;

      if (body?.status !== undefined) {
        const st = String(body.status).trim().toLowerCase();
        if (!CLOSURE_STATUSES.includes(st)) return bad(res, 'invalid_status');
        statusChange = st;
        reason = sanitizeText(body?.reason, 1000);
      }
      if (body?.closure_type !== undefined) { const ct = String(body.closure_type).trim().toLowerCase(); if (!CLOSURE_TYPES.includes(ct)) return bad(res, 'invalid_closure_type'); fields.push(`closure_type = $${idx++}`); vals.push(ct); }
      if (body?.closure_date !== undefined) { const cd = body.closure_date ? String(body.closure_date).trim() : null; if (cd && isNaN(Date.parse(cd))) return bad(res, 'invalid_closure_date'); fields.push(`closure_date = $${idx++}`); vals.push(cd ? new Date(cd).toISOString().slice(0,10) : null); }
      if (body?.effective_date !== undefined) { const ed = body.effective_date ? String(body.effective_date).trim() : null; if (ed && isNaN(Date.parse(ed))) return bad(res, 'invalid_effective_date'); fields.push(`effective_date = $${idx++}`); vals.push(ed ? new Date(ed).toISOString().slice(0,10) : null); }
      if (body?.reason !== undefined) { const r = sanitizeText(body.reason, 2000); if (!r || r.length < 10) return bad(res, 'invalid_reason'); fields.push(`reason = $${idx++}`); vals.push(r); }
      if (body?.responsible_id !== undefined) { const rid = body.responsible_id ? String(body.responsible_id).trim() : null; if (rid && !isUuid(rid)) return bad(res, 'invalid_responsible_id'); fields.push(`responsible_id = $${idx++}`); vals.push(rid); }
      if (body?.responsible_name !== undefined) { const rn = sanitizeText(body.responsible_name, 120); fields.push(`responsible_name = $${idx++}`); vals.push(rn); }
      if (body?.notes !== undefined) { const n = sanitizeText(body.notes, 2000); fields.push(`notes = $${idx++}`); vals.push(n); }

      if (statusChange) {
        try {
          const pool = getPool();
          const closureRes = await pool.query('SELECT * FROM crm_contract_closures WHERE contract_id = $1', [contractId]);
          if (!closureRes.rows[0]) return json(res, 404, { error: 'closure_not_found' });
          const current = closureRes.rows[0].status;
          if (current === statusChange) return json(res, 409, { error: 'already_in_status', current_status: current });
          if (current === 'concluido' || current === 'cancelado') return json(res, 409, { error: 'already_finalized', current_status: current });

          // Se concluindo, verifica se todos steps concluídos ou nao_aplicavel
          if (statusChange === 'concluido') {
            const stepsRes = await pool.query('SELECT status FROM crm_closure_steps WHERE closure_id = $1', [closureRes.rows[0].id]);
            const incomplete = stepsRes.rows.filter(s => s.status !== 'concluido' && s.status !== 'nao_aplicavel');
            if (incomplete.length > 0) {
              return json(res, 409, { error: 'closure_steps_incomplete', incomplete_count: incomplete.length, note: 'Encerramento requer desmobilização, devolução, cobranças, documentos e revogação concluídos. Bloqueios claros.' });
            }
          }

          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            const histId = crypto.randomUUID();
            const effDate = closureRes.rows[0].effective_date;
            await client.query(
              `INSERT INTO crm_closure_history (id, closure_id, contract_id, previous_status, next_status, effective_date, reason, changed_by, changed_by_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [histId, closureRes.rows[0].id, contractId, current, statusChange, effDate, reason || closureRes.rows[0].reason.slice(0,1000), session.role, session.identityId || null]
            );

            const updFields = [...fields];
            const updVals = [...vals];
            let uIdx = idx;
            updFields.push(`status = $${uIdx++}`); updVals.push(statusChange);
            updFields.push(`updated_at = NOW()`);

            const upd = await client.query(`UPDATE crm_contract_closures SET ${updFields.join(', ')} WHERE contract_id = $${uIdx} RETURNING *`, [...updVals, contractId]);

            // Se concluído, atualiza contrato para encerrado com data de efeito, preservando histórico
            if (statusChange === 'concluido') {
              await client.query(
                `UPDATE crm_contracts SET status = 'encerrado', current_status_effective_date = $1, closure_reason = $2, status_changed_at = NOW(), status_changed_by = $3, status_changed_by_id = $4, updated_at = NOW() WHERE id = $5`,
                [effDate, closureRes.rows[0].reason.slice(0,1000), session.role, session.identityId || null, contractId]
              );
              // Insere histórico de status do contrato
              const contractHistId = crypto.randomUUID();
              await client.query(
                `INSERT INTO crm_contract_status_history (id, contract_id, previous_status, next_status, effective_date, reason, changed_by, changed_by_id)
                 VALUES ($1,$2,$3,$4,'encerrado',$5,$6,$7,$8)`,
                [contractHistId, contractId, closureRes.rows[0].contract_id ? null : null, cRes => cRes, effDate, reason || 'Encerramento concluído', session.role, session.identityId || null].slice(0,8)
              );
              // Correção: buscar status anterior do contrato
              try {
                const cStatusRes = await client.query('SELECT status FROM crm_contracts WHERE id = $1', [contractId]);
                const prevStatus = cStatusRes.rows[0]?.status || 'ativo';
                await client.query(
                  `INSERT INTO crm_contract_status_history (id, contract_id, previous_status, next_status, effective_date, reason, changed_by, changed_by_id)
                   VALUES ($1,$2,$3,$4,'encerrado',$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
                  [crypto.randomUUID(), contractId, prevStatus, effDate, reason || 'Encerramento concluído', session.role, session.identityId || null]
                );
              } catch {}
            }

            await client.query('COMMIT');

            try {
              const act = statusChange === 'concluido' ? 'crm_closure_conclude' : 'crm_closure_update';
              await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,'allowed','none')", [session.role, session.identityId || session.role, act]);
            } catch {}

            return json(res, 200, { closure: upd.rows[0], history_id: histId, note: statusChange === 'concluido' ? 'Encerramento concluído, contrato marcado encerrado com data de efeito, preserva histórico, deixa de gerar novas rotinas sem apagar lançamentos existentes' : 'Encerramento atualizado' });
          } catch (e) {
            await client.query('ROLLBACK');
            console.error('closure status change failed', e);
            return json(res, 503, { error: 'closure_status_change_failed' });
          } finally {
            client.release();
          }
        } catch (e) {
          console.error('closure outer failed', e);
          return json(res, 503, { error: 'closure_unavailable' });
        }
      }

      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`updated_at = NOW()`);
      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_contract_closures SET ${fields.join(', ')} WHERE contract_id = $${idx} RETURNING *`, [...vals, contractId]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        return json(res, 200, { closure: upd.rows[0] });
      } catch (e) {
        console.error('closure update failed', e);
        return json(res, 503, { error: 'closure_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST, PATCH' });
  }

  async function handleSteps(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const closureRes = await pool.query('SELECT id FROM crm_contract_closures WHERE contract_id = $1', [contractId]);
        if (!closureRes.rows[0]) return json(res, 404, { error: 'closure_not_found' });
        await ensureClosureSteps(pool, closureRes.rows[0].id, contractId);
        const steps = await pool.query('SELECT * FROM crm_closure_steps WHERE closure_id = $1 ORDER BY CASE step_type WHEN \'desmobilizacao_equipe\' THEN 1 WHEN \'devolucao_equipamentos\' THEN 2 WHEN \'devolucao_chaves\' THEN 3 WHEN \'cobrancas_pendencias\' THEN 4 WHEN \'documentos_finais\' THEN 5 WHEN \'revogacao_escopos\' THEN 6 WHEN \'comunicacao_cliente\' THEN 7 ELSE 99 END', [closureRes.rows[0].id]);
        return json(res, 200, { steps: steps.rows });
      } catch {
        return json(res, 503, { error: 'steps_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      // Atualiza step por id ou tipo
      let body;
      try { body = await readJson(req, 20 * 1024); } catch { return bad(res, 'invalid_json'); }
      const step_id = body?.step_id ? String(body.step_id).trim() : body?.id ? String(body.id).trim() : null;
      const status = body?.status ? String(body.status).trim().toLowerCase() : null;
      const responsible_name = sanitizeText(body?.responsible_name, 120);
      const notes = sanitizeText(body?.notes, 1000);
      const completed_at = body?.completed_at ? String(body.completed_at).trim() : null;

      if (!step_id) return bad(res, 'step_id_required');
      if (status && !STEP_STATUSES.includes(status)) return bad(res, 'invalid_status');

      try {
        const pool = getPool();
        const closureRes = await pool.query('SELECT id FROM crm_contract_closures WHERE contract_id = $1', [contractId]);
        if (!closureRes.rows[0]) return json(res, 404, { error: 'closure_not_found' });

        let whereClause = '';
        let whereVals = [];
        if (isUuid(step_id)) {
          whereClause = 'id = $1 AND closure_id = $2';
          whereVals = [step_id, closureRes.rows[0].id];
        } else {
          if (!STEP_TYPES.includes(step_id)) return bad(res, 'invalid_step_type');
          whereClause = 'step_type = $1::crm_closure_step_type AND closure_id = $2';
          whereVals = [step_id, closureRes.rows[0].id];
        }

        const fields = []; const vals = []; let idx = 1;
        if (status) { fields.push(`status = $${idx++}`); vals.push(status); if (status === 'concluido') { fields.push(`completed_at = $${idx++}`); vals.push(completed_at ? new Date(completed_at).toISOString().slice(0,10) : new Date().toISOString().slice(0,10)); } }
        if (responsible_name) { fields.push(`responsible_name = $${idx++}`); vals.push(responsible_name); }
        if (notes) { fields.push(`notes = $${idx++}`); vals.push(notes); }
        if (completed_at && !status) { fields.push(`completed_at = $${idx++}`); vals.push(new Date(completed_at).toISOString().slice(0,10)); }
        if (fields.length === 0) return bad(res, 'no_fields');
        fields.push(`updated_at = NOW()`);

        const upd = await pool.query(`UPDATE crm_closure_steps SET ${fields.join(', ')} WHERE ${whereClause} RETURNING *`, [...vals, ...whereVals]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_closure_step_update',$3,'allowed','none')", [session.role, session.identityId || session.role, upd.rows[0].id]); } catch {}
        return json(res, 200, { step: upd.rows[0] });
      } catch (e) {
        console.error('closure step update failed', e);
        return json(res, 503, { error: 'step_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  async function handleRevocations(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const list = await pool.query('SELECT * FROM crm_contract_scope_revocations WHERE contract_id = $1 ORDER BY revoked_at DESC', [contractId]);
        return json(res, 200, { revocations: list.rows, note: 'Revogação de escopos no encerramento, preserva histórico' });
      } catch {
        return json(res, 503, { error: 'revocations_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body;
      try { body = await readJson(req, 20 * 1024); } catch { return bad(res, 'invalid_json'); }
      const scope_type = sanitizeText(body?.scope_type, 100);
      const scope_description = sanitizeText(body?.scope_description, 1000);
      const revoked_at = body?.revoked_at ? String(body.revoked_at).trim() : null;
      const reason = sanitizeText(body?.reason, 1000);

      if (!scope_type) return bad(res, 'invalid_scope_type');
      if (!revoked_at || isNaN(Date.parse(revoked_at))) return bad(res, 'invalid_revoked_at_required');

      try {
        const pool = getPool();
        const closureRes = await pool.query('SELECT id FROM crm_contract_closures WHERE contract_id = $1', [contractId]);
        const closureId = closureRes.rows[0]?.id || null;
        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_contract_scope_revocations (id, contract_id, closure_id, scope_type, scope_description, revoked_at, revoked_by, revoked_by_id, reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [id, contractId, closureId, scope_type, scope_description, new Date(revoked_at).toISOString().slice(0,10), session.role, session.identityId || null, reason]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_scope_revocation_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 201, { revocation: ins.rows[0], note: 'Escopo revogado no encerramento, histórico preservado' });
      } catch (e) {
        console.error('revocation create failed', e);
        return json(res, 503, { error: 'revocation_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  return { handleClosure, handleSteps, handleRevocations };
}
