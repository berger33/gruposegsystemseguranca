export function createContractAmendmentApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
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

  const AMENDMENT_TYPES = ['aditivo','reajuste','repactuacao','prorrogacao','supressao','outro'];
  const BASE_TYPES = ['indice_igpm','indice_ipca','indice_inpc','dissidio_coletivo','convencao_coletiva','alteracao_escopo','prorrogacao_prazo','reajuste_contratual','acordo_comercial','outro'];
  const STATUSES = ['rascunho','em_revisao','aprovado','rejeitado','cancelado'];
  const ALLOWED_TRANSITIONS = {
    rascunho: ['em_revisao','cancelado'],
    em_revisao: ['rascunho','aprovado','rejeitado','cancelado'],
    aprovado: ['cancelado'], // após aprovado, só cancelamento (não sobrescrever histórico)
    rejeitado: ['rascunho','em_revisao','cancelado'],
    cancelado: [],
  };

  async function handleAmendments(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const cRes = await pool.query('SELECT id, status, total_cost, total_price FROM crm_contracts WHERE id = $1', [contractId]);
        if (!cRes.rows[0]) return json(res, 404, { error: 'contract_not_found' });
        const list = await pool.query('SELECT * FROM crm_contract_amendments WHERE contract_id = $1 ORDER BY effective_date DESC, created_at DESC', [contractId]);
        return json(res, 200, { contract: cRes.rows[0], amendments: list.rows, note: 'Aditivos e reajustes com base, vigência, justificativa, aprovação e histórico. Não sobrescreve valores históricos, não gera cobrança duplicada (idempotency_key). Mudar aditivo não altera faturas anteriores.' });
      } catch (e) {
        console.error('amendments list failed', e);
        return json(res, 503, { error: 'amendments_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body;
      try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const type = body?.type ? String(body.type).trim().toLowerCase() : 'aditivo';
      const title = sanitizeText(body?.title, 200);
      const description = sanitizeText(body?.description, 2000);
      const base_type = body?.base_type ? String(body.base_type).trim().toLowerCase() : 'outro';
      const base_description = sanitizeText(body?.base_description, 1000);
      const base_value = body?.base_value != null ? Number(body.base_value) : null;
      const justification = sanitizeText(body?.justification, 2000);
      const vigencia_start = body?.vigencia_start ? String(body.vigencia_start).trim() : null;
      const vigencia_end = body?.vigencia_end ? String(body.vigencia_end).trim() : null;
      const effective_date = body?.effective_date ? String(body.effective_date).trim() : null;
      const previous_total_cost = body?.previous_total_cost != null ? Number(body.previous_total_cost) : null;
      const previous_total_price = body?.previous_total_price != null ? Number(body.previous_total_price) : null;
      const new_total_cost = body?.new_total_cost != null ? Number(body.new_total_cost) : null;
      const new_total_price = body?.new_total_price != null ? Number(body.new_total_price) : null;

      if (!AMENDMENT_TYPES.includes(type)) return bad(res, 'invalid_type');
      if (!title) return bad(res, 'invalid_title');
      if (!BASE_TYPES.includes(base_type)) return bad(res, 'invalid_base_type');
      if (!justification || justification.length < 10) return bad(res, 'justification_required_min_10');
      if (!vigencia_start || isNaN(Date.parse(vigencia_start))) return bad(res, 'invalid_vigencia_start_required');
      if (vigencia_end && isNaN(Date.parse(vigencia_end))) return bad(res, 'invalid_vigencia_end');
      if (vigencia_end && new Date(vigencia_end) < new Date(vigencia_start)) return bad(res, 'invalid_vigencia_range');
      if (!effective_date || isNaN(Date.parse(effective_date))) return bad(res, 'invalid_effective_date_required');
      if (base_value != null && (isNaN(base_value) || base_value < -100 || base_value > 10000)) return bad(res, 'invalid_base_value');
      if (previous_total_cost != null && (isNaN(previous_total_cost) || previous_total_cost < 0)) return bad(res, 'invalid_previous_total_cost');
      if (previous_total_price != null && (isNaN(previous_total_price) || previous_total_price < 0)) return bad(res, 'invalid_previous_total_price');
      if (new_total_cost != null && (isNaN(new_total_cost) || new_total_cost < 0)) return bad(res, 'invalid_new_total_cost');
      if (new_total_price != null && (isNaN(new_total_price) || new_total_price < 0)) return bad(res, 'invalid_new_total_price');

      // Não sobrescrever valores históricos: previous_* deve refletir valor atual do contrato no momento da criação, não pode ser alterado retroativamente
      // Não gerar cobrança duplicada: idempotency_key por contract+title+effective_date+type

      try {
        const pool = getPool();
        const cRes = await pool.query('SELECT id, total_cost, total_price FROM crm_contracts WHERE id = $1', [contractId]);
        if (!cRes.rows[0]) return json(res, 404, { error: 'contract_not_found' });
        const contract = cRes.rows[0];

        // Se previous não informado, usa atual do contrato (preserva histórico)
        const prevCost = previous_total_cost != null ? previous_total_cost : Number(contract.total_cost || 0);
        const prevPrice = previous_total_price != null ? previous_total_price : Number(contract.total_price || 0);

        const idempotencyKey = `amend:${contractId}:${type}:${title}:${effective_date}`;
        // Verifica duplicidade
        const existing = await pool.query('SELECT id FROM crm_contract_amendments WHERE idempotency_key = $1', [idempotencyKey]);
        if (existing.rows[0]) {
          return json(res, 200, { amendment: null, note: 'Aditivo já existe com mesma base (idempotente), não gera cobrança duplicada', existing_id: existing.rows[0].id });
        }

        const id = crypto.randomUUID();
        const effDateStr = new Date(effective_date).toISOString().slice(0,10);
        const vigStartStr = new Date(vigencia_start).toISOString().slice(0,10);
        const vigEndStr = vigencia_end ? new Date(vigencia_end).toISOString().slice(0,10) : null;

        const ins = await pool.query(
          `INSERT INTO crm_contract_amendments
            (id, contract_id, type, title, description, base_type, base_description, base_value, justification, vigencia_start, vigencia_end, effective_date, previous_total_cost, previous_total_price, new_total_cost, new_total_price, status, version, idempotency_key, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'rascunho',1,$17,$18,$19) RETURNING *`,
          [id, contractId, type, title, description, base_type, base_description, base_value, justification, vigStartStr, vigEndStr, effDateStr, prevCost, prevPrice, new_total_cost, new_total_price, idempotencyKey, session.role, session.identityId || null]
        );

        // Histórico inicial
        const histId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO crm_contract_amendment_history (id, amendment_id, contract_id, previous_status, next_status, effective_date, reason, changed_by, changed_by_id)
           VALUES ($1,$2,$3,NULL,'rascunho',$4,$5,$6,$7)`,
          [histId, id, contractId, effDateStr, justification.slice(0,1000), session.role, session.identityId || null]
        );

        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_amendment_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}

        return json(res, 201, { amendment: ins.rows[0], history_id: histId, note: 'Aditivo criado com base, vigência, justificativa, aprovação pendente e histórico. Não sobrescreve valores históricos (previous_* preservado), não gera cobrança duplicada (idempotency_key). Mudar aditivo não altera faturas anteriores.' });
      } catch (e) {
        console.error('amendment create failed', e);
        return json(res, 503, { error: 'amendment_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleAmendmentById(req, res, contractId, amendmentId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!isUuid(amendmentId)) return bad(res, 'invalid_amendment_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const am = await pool.query('SELECT * FROM crm_contract_amendments WHERE id = $1 AND contract_id = $2', [amendmentId, contractId]);
        if (!am.rows[0]) return json(res, 404, { error: 'not_found' });
        const hist = await pool.query('SELECT * FROM crm_contract_amendment_history WHERE amendment_id = $1 ORDER BY effective_date DESC, created_at DESC', [amendmentId]);
        return json(res, 200, { amendment: am.rows[0], history: hist.rows, allowed_transitions: ALLOWED_TRANSITIONS[am.rows[0].status] || [] });
      } catch {
        return json(res, 503, { error: 'amendment_unavailable' });
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
        if (!STATUSES.includes(st)) return bad(res, 'invalid_status');
        statusChange = st;
        reason = sanitizeText(body?.reason || body?.rejection_reason || body?.justification, 1000);
      }

      if (body?.title !== undefined) { const t = sanitizeText(body.title, 200); if (!t) return bad(res, 'invalid_title'); fields.push(`title = $${idx++}`); vals.push(t); }
      if (body?.description !== undefined) { const d = sanitizeText(body.description, 2000); fields.push(`description = $${idx++}`); vals.push(d); }
      if (body?.base_type !== undefined) { const bt = String(body.base_type).trim().toLowerCase(); if (!BASE_TYPES.includes(bt)) return bad(res, 'invalid_base_type'); fields.push(`base_type = $${idx++}`); vals.push(bt); }
      if (body?.base_description !== undefined) { const bd = sanitizeText(body.base_description, 1000); fields.push(`base_description = $${idx++}`); vals.push(bd); }
      if (body?.base_value !== undefined) { const bv = body.base_value != null ? Number(body.base_value) : null; if (bv != null && (isNaN(bv) || bv < -100 || bv > 10000)) return bad(res, 'invalid_base_value'); fields.push(`base_value = $${idx++}`); vals.push(bv); }
      if (body?.justification !== undefined) { const j = sanitizeText(body.justification, 2000); if (!j || j.length < 10) return bad(res, 'invalid_justification'); fields.push(`justification = $${idx++}`); vals.push(j); }
      if (body?.vigencia_start !== undefined) { const vs = body.vigencia_start ? String(body.vigencia_start).trim() : null; if (vs && isNaN(Date.parse(vs))) return bad(res, 'invalid_vigencia_start'); fields.push(`vigencia_start = $${idx++}`); vals.push(vs ? new Date(vs).toISOString().slice(0,10) : null); }
      if (body?.vigencia_end !== undefined) { const ve = body.vigencia_end ? String(body.vigencia_end).trim() : null; if (ve && isNaN(Date.parse(ve))) return bad(res, 'invalid_vigencia_end'); fields.push(`vigencia_end = $${idx++}`); vals.push(ve ? new Date(ve).toISOString().slice(0,10) : null); }
      if (body?.effective_date !== undefined) { const ed = body.effective_date ? String(body.effective_date).trim() : null; if (ed && isNaN(Date.parse(ed))) return bad(res, 'invalid_effective_date'); fields.push(`effective_date = $${idx++}`); vals.push(ed ? new Date(ed).toISOString().slice(0,10) : null); }
      if (body?.new_total_cost !== undefined) { const ntc = body.new_total_cost != null ? Number(body.new_total_cost) : null; if (ntc != null && (isNaN(ntc) || ntc < 0)) return bad(res, 'invalid_new_total_cost'); fields.push(`new_total_cost = $${idx++}`); vals.push(ntc); }
      if (body?.new_total_price !== undefined) { const ntp = body.new_total_price != null ? Number(body.new_total_price) : null; if (ntp != null && (isNaN(ntp) || ntp < 0)) return bad(res, 'invalid_new_total_price'); fields.push(`new_total_price = $${idx++}`); vals.push(ntp); }

      // Status change with approval and history, não sobrescrever valores históricos
      if (statusChange) {
        try {
          const pool = getPool();
          const amRes = await pool.query('SELECT * FROM crm_contract_amendments WHERE id = $1 AND contract_id = $2', [amendmentId, contractId]);
          if (!amRes.rows[0]) return json(res, 404, { error: 'not_found' });
          const current = amRes.rows[0].status;
          if (current === statusChange) return json(res, 409, { error: 'already_in_status', current_status: current });
          const allowed = ALLOWED_TRANSITIONS[current] || [];
          if (!allowed.includes(statusChange)) {
            return json(res, 409, { error: 'invalid_transition', current_status: current, next_status: statusChange, allowed });
          }
          if (statusChange === 'rejeitado' && !sanitizeText(body?.rejection_reason || body?.reason, 1000)) {
            return bad(res, 'rejection_reason_required');
          }

          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            const histId = crypto.randomUUID();
            const effDate = amRes.rows[0].effective_date;
            await client.query(
              `INSERT INTO crm_contract_amendment_history (id, amendment_id, contract_id, previous_status, next_status, effective_date, reason, changed_by, changed_by_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [histId, amendmentId, contractId, current, statusChange, effDate, reason, session.role, session.identityId || null]
            );

            const updFields = [...fields];
            const updVals = [...vals];
            let uIdx = idx;
            updFields.push(`status = $${uIdx++}`); updVals.push(statusChange);
            updFields.push(`version = version + 1`);
            if (statusChange === 'aprovado') {
              updFields.push(`approved_by = $${uIdx++}`); updVals.push(session.role);
              updFields.push(`approved_by_id = $${uIdx++}`); updVals.push(session.identityId || null);
              updFields.push(`approved_at = NOW()`);
              // Não sobrescrever valores históricos do contrato aqui automaticamente; apenas registra aprovação
              // Para não gerar cobrança duplicada, contrato só atualiza total se aditivo aprovado e effective_date futura, e apenas se explicitamente solicitado
              // Aqui não atualizamos crm_contracts automaticamente para preservar histórico; atualização deve ser explícita via outro fluxo ou manual
            }
            if (statusChange === 'rejeitado') {
              const rejReason = sanitizeText(body?.rejection_reason || body?.reason, 1000);
              updFields.push(`rejection_reason = $${uIdx++}`); updVals.push(rejReason);
            }
            updFields.push(`updated_at = NOW()`);

            const upd = await client.query(
              `UPDATE crm_contract_amendments SET ${updFields.join(', ')} WHERE id = $${uIdx} AND contract_id = $${uIdx+1} RETURNING *`,
              [...updVals, amendmentId, contractId]
            );
            await client.query('COMMIT');
            if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });

            try {
              const auditAction = statusChange === 'aprovado' ? 'crm_contract_amendment_approve' : statusChange === 'rejeitado' ? 'crm_contract_amendment_reject' : 'crm_contract_amendment_update';
              await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,'allowed','none')", [session.role, session.identityId || session.role, auditAction]);
            } catch {}

            // Se aprovado e tem new_total_price, não sobrescreve histórico, mas pode atualizar contrato current se effective_date <= hoje? Decisão: não atualizar automaticamente para não gerar cobrança duplicada; apenas registrar
            // Nota: mudar aditivo não altera faturas anteriores (aceite CON)

            return json(res, 200, { amendment: upd.rows[0], history_id: histId, note: 'Aditivo/reajuste com aprovação e histórico. Não sobrescreve valores históricos (previous_* preservado). Não gera cobrança duplicada. Mudar aditivo não altera faturas anteriores.' });
          } catch (e) {
            await client.query('ROLLBACK');
            console.error('amendment status change failed', e);
            return json(res, 503, { error: 'amendment_status_change_failed' });
          } finally {
            client.release();
          }
        } catch (e) {
          console.error('amendment outer failed', e);
          return json(res, 503, { error: 'amendment_unavailable' });
        }
      }

      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`version = version + 1`);
      fields.push(`updated_at = NOW()`);
      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_contract_amendments SET ${fields.join(', ')} WHERE id = $${idx} AND contract_id = $${idx+1} RETURNING *`, [...vals, amendmentId, contractId]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_amendment_update',$3,'allowed','none')", [session.role, session.identityId || session.role, amendmentId]); } catch {}
        return json(res, 200, { amendment: upd.rows[0], note: 'Aditivo atualizado, histórico preservado, sem sobrescrever valores anteriores.' });
      } catch (e) {
        console.error('amendment update failed', e);
        return json(res, 503, { error: 'amendment_update_failed' });
      }
    }

    if (req.method === 'DELETE') {
      try {
        const pool = getPool();
        const del = await pool.query('DELETE FROM crm_contract_amendments WHERE id = $1 AND contract_id = $2 AND status IN (\'rascunho\',\'rejeitado\') RETURNING id', [amendmentId, contractId]);
        if (!del.rows[0]) return json(res, 409, { error: 'only_rascunho_rejeitado_can_delete_or_not_found' });
        return json(res, 200, { deleted: true });
      } catch {
        return json(res, 503, { error: 'amendment_delete_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH, DELETE' });
  }

  return { handleAmendments, handleAmendmentById, AMENDMENT_TYPES, BASE_TYPES, STATUSES, ALLOWED_TRANSITIONS };
}
