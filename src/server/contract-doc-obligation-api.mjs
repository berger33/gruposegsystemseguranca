export function createContractDocObligationApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
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

  const CATEGORIES = ['certidao','alvara','licenca','comprovante','contrato','atestado','seguro','treinamento','outro'];
  const PERIODICITIES = ['unica','mensal','trimestral','semestral','anual','sob_demanda','outro'];
  const STATUSES = ['pendente','em_analise','aprovado','rejeitado','vencido','cancelado'];
  const ALLOWED_TRANSITIONS = {
    pendente: ['em_analise','cancelado'],
    em_analise: ['aprovado','rejeitado','pendente','cancelado'],
    aprovado: ['vencido','cancelado'], // após aprovado, pode vencer por periodicidade
    rejeitado: ['pendente','em_analise','cancelado'],
    vencido: ['pendente','em_analise','cancelado'],
    cancelado: [],
  };

  function calcNextDue(currentDue, periodicity) {
    if (!currentDue) return null;
    const d = new Date(currentDue);
    switch (periodicity) {
      case 'mensal': d.setMonth(d.getMonth()+1); break;
      case 'trimestral': d.setMonth(d.getMonth()+3); break;
      case 'semestral': d.setMonth(d.getMonth()+6); break;
      case 'anual': d.setFullYear(d.getFullYear()+1); break;
      default: return null;
    }
    return d.toISOString().slice(0,10);
  }

  async function handleObligations(req, res, contractId) {
    // contractId pode ser company_id? Para CON-06 por cliente/contrato, suportamos ambos via query? Mas rota é por contrato
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const cRes = await pool.query('SELECT id, company_id FROM crm_contracts WHERE id = $1', [contractId]);
        if (!cRes.rows[0]) return json(res, 404, { error: 'contract_not_found' });
        const list = await pool.query('SELECT * FROM crm_document_obligations WHERE contract_id = $1 ORDER BY due_date ASC NULLS LAST, created_at DESC', [contractId]);
        return json(res, 200, { contract: cRes.rows[0], obligations: list.rows, note: 'Obrigações documentais por cliente/contrato com categoria, periodicidade, responsável, aprovação e comprovante' });
      } catch (e) {
        console.error('doc obligations list failed', e);
        return json(res, 503, { error: 'doc_obligations_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body;
      try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const title = sanitizeText(body?.title, 200);
      const category = body?.category ? String(body.category).trim().toLowerCase() : 'outro';
      const description = sanitizeText(body?.description, 1000);
      const periodicity = body?.periodicity ? String(body.periodicity).trim().toLowerCase() : 'unica';
      const responsible_id = body?.responsible_id ? String(body.responsible_id).trim() : null;
      const responsible_name = sanitizeText(body?.responsible_name, 120);
      const due_date = body?.due_date ? String(body.due_date).trim() : null;
      const file_url = sanitizeText(body?.file_url, 1000);
      const storage_key = sanitizeText(body?.storage_key, 200);
      const company_id = body?.company_id ? String(body.company_id).trim() : null;

      if (!title) return bad(res, 'invalid_title');
      if (!CATEGORIES.includes(category)) return bad(res, 'invalid_category');
      if (!PERIODICITIES.includes(periodicity)) return bad(res, 'invalid_periodicity');
      if (responsible_id && !isUuid(responsible_id)) return bad(res, 'invalid_responsible_id');
      if (!responsible_name && !responsible_id) return bad(res, 'responsible_required');
      if (due_date && isNaN(Date.parse(due_date))) return bad(res, 'invalid_due_date');
      if (company_id && !isUuid(company_id)) return bad(res, 'invalid_company_id');

      try {
        const pool = getPool();
        const cRes = await pool.query('SELECT id, company_id FROM crm_contracts WHERE id = $1', [contractId]);
        if (!cRes.rows[0]) return json(res, 404, { error: 'contract_not_found' });
        const finalCompanyId = company_id || cRes.rows[0].company_id;

        const id = crypto.randomUUID();
        const dueStr = due_date ? new Date(due_date).toISOString().slice(0,10) : null;
        const nextDue = dueStr ? calcNextDue(dueStr, periodicity) : null;

        const ins = await pool.query(
          `INSERT INTO crm_document_obligations
            (id, contract_id, company_id, title, category, description, periodicity, responsible_id, responsible_name, status, due_date, next_due_date, file_url, storage_key, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pendente',$10,$11,$12,$13,$14,$15) RETURNING *`,
          [id, contractId, finalCompanyId, title, category, description, periodicity, responsible_id, responsible_name, dueStr, nextDue, file_url, storage_key, session.role, session.identityId || null]
        );

        const histId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO crm_document_obligation_history (id, obligation_id, contract_id, company_id, previous_status, next_status, file_url, reason, changed_by, changed_by_id)
           VALUES ($1,$2,$3,$4,NULL,'pendente',$5,$6,$7,$8)`,
          [histId, id, contractId, finalCompanyId, file_url, 'Criação obrigação documental', session.role, session.identityId || null]
        );

        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_doc_obligation_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}

        return json(res, 201, { obligation: ins.rows[0], history_id: histId, note: 'Obrigação documental criada por cliente/contrato com categoria, periodicidade, responsável, aprovação pendente e comprovante opcional' });
      } catch (e) {
        console.error('doc obligation create failed', e);
        return json(res, 503, { error: 'doc_obligation_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleObligationById(req, res, contractId, obligationId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!isUuid(obligationId)) return bad(res, 'invalid_obligation_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_document_obligations WHERE id = $1 AND contract_id = $2', [obligationId, contractId]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        const hist = await pool.query('SELECT * FROM crm_document_obligation_history WHERE obligation_id = $1 ORDER BY created_at DESC', [obligationId]);
        return json(res, 200, { obligation: r.rows[0], history: hist.rows, allowed_transitions: ALLOWED_TRANSITIONS[r.rows[0].status] || [] });
      } catch {
        return json(res, 503, { error: 'doc_obligation_unavailable' });
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
        reason = sanitizeText(body?.reason || body?.rejection_reason, 1000);
      }

      if (body?.title !== undefined) { const t = sanitizeText(body.title, 200); if (!t) return bad(res, 'invalid_title'); fields.push(`title = $${idx++}`); vals.push(t); }
      if (body?.category !== undefined) { const c = String(body.category).trim().toLowerCase(); if (!CATEGORIES.includes(c)) return bad(res, 'invalid_category'); fields.push(`category = $${idx++}`); vals.push(c); }
      if (body?.description !== undefined) { const d = sanitizeText(body.description, 1000); fields.push(`description = $${idx++}`); vals.push(d); }
      if (body?.periodicity !== undefined) { const p = String(body.periodicity).trim().toLowerCase(); if (!PERIODICITIES.includes(p)) return bad(res, 'invalid_periodicity'); fields.push(`periodicity = $${idx++}`); vals.push(p); }
      if (body?.responsible_id !== undefined) { const rid = body.responsible_id ? String(body.responsible_id).trim() : null; if (rid && !isUuid(rid)) return bad(res, 'invalid_responsible_id'); fields.push(`responsible_id = $${idx++}`); vals.push(rid); }
      if (body?.responsible_name !== undefined) { const rn = sanitizeText(body.responsible_name, 120); fields.push(`responsible_name = $${idx++}`); vals.push(rn); }
      if (body?.due_date !== undefined) { const dd = body.due_date ? String(body.due_date).trim() : null; if (dd && isNaN(Date.parse(dd))) return bad(res, 'invalid_due_date'); fields.push(`due_date = $${idx++}`); vals.push(dd ? new Date(dd).toISOString().slice(0,10) : null); }
      if (body?.file_url !== undefined) { const fu = sanitizeText(body.file_url, 1000); fields.push(`file_url = $${idx++}`); vals.push(fu); if (fu) { fields.push(`last_submitted_at = NOW()`); } }
      if (body?.storage_key !== undefined) { const sk = sanitizeText(body.storage_key, 200); fields.push(`storage_key = $${idx++}`); vals.push(sk); }

      if (statusChange) {
        try {
          const pool = getPool();
          const obRes = await pool.query('SELECT * FROM crm_document_obligations WHERE id = $1 AND contract_id = $2', [obligationId, contractId]);
          if (!obRes.rows[0]) return json(res, 404, { error: 'not_found' });
          const current = obRes.rows[0].status;
          if (current === statusChange) return json(res, 409, { error: 'already_in_status', current_status: current });
          const allowed = ALLOWED_TRANSITIONS[current] || [];
          if (!allowed.includes(statusChange)) {
            return json(res, 409, { error: 'invalid_transition', current_status: current, next_status: statusChange, allowed });
          }
          if (statusChange === 'rejeitado' && !sanitizeText(body?.rejection_reason || body?.reason, 1000)) {
            return bad(res, 'rejection_reason_required');
          }
          if (statusChange === 'em_analise' && !obRes.rows[0].file_url && !body?.file_url) {
            return json(res, 409, { error: 'comprovante_required_for_analysis', detail: 'Obrigação documental precisa comprovante para ir para em_analise' });
          }

          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            const histId = crypto.randomUUID();
            const fileUrlForHist = body?.file_url ? sanitizeText(body.file_url, 1000) : obRes.rows[0].file_url;
            await client.query(
              `INSERT INTO crm_document_obligation_history (id, obligation_id, contract_id, company_id, previous_status, next_status, file_url, reason, changed_by, changed_by_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
              [histId, obligationId, contractId, obRes.rows[0].company_id, current, statusChange, fileUrlForHist, reason, session.role, session.identityId || null]
            );

            const updFields = [...fields];
            const updVals = [...vals];
            let uIdx = idx;
            updFields.push(`status = $${uIdx++}`); updVals.push(statusChange);
            if (statusChange === 'aprovado') {
              updFields.push(`approved_by = $${uIdx++}`); updVals.push(session.role);
              updFields.push(`approved_by_id = $${uIdx++}`); updVals.push(session.identityId || null);
              updFields.push(`approved_at = NOW()`);
              // Calcula next_due_date baseado na periodicidade
              const nextDue = calcNextDue(obRes.rows[0].due_date || new Date().toISOString().slice(0,10), obRes.rows[0].periodicity);
              if (nextDue) {
                updFields.push(`next_due_date = $${uIdx++}`); updVals.push(nextDue);
              }
            }
            if (statusChange === 'rejeitado') {
              const rej = sanitizeText(body?.rejection_reason || body?.reason, 1000);
              updFields.push(`rejection_reason = $${uIdx++}`); updVals.push(rej);
            }
            updFields.push(`updated_at = NOW()`);

            const upd = await client.query(
              `UPDATE crm_document_obligations SET ${updFields.join(', ')} WHERE id = $${uIdx} AND contract_id = $${uIdx+1} RETURNING *`,
              [...updVals, obligationId, contractId]
            );
            await client.query('COMMIT');
            if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });

            try {
              const act = statusChange === 'aprovado' ? 'crm_doc_obligation_approve' : statusChange === 'rejeitado' ? 'crm_doc_obligation_reject' : statusChange === 'em_analise' ? 'crm_doc_obligation_submit' : 'crm_doc_obligation_update';
              await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,'allowed','none')", [session.role, session.identityId || session.role, act]);
            } catch {}

            return json(res, 200, { obligation: upd.rows[0], history_id: histId, note: 'Obrigação documental com aprovação e comprovante, periodicidade calculada' });
          } catch (e) {
            await client.query('ROLLBACK');
            console.error('doc obligation status change failed', e);
            return json(res, 503, { error: 'doc_obligation_status_change_failed' });
          } finally {
            client.release();
          }
        } catch (e) {
          console.error('doc obligation outer failed', e);
          return json(res, 503, { error: 'doc_obligation_unavailable' });
        }
      }

      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`updated_at = NOW()`);
      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_document_obligations SET ${fields.join(', ')} WHERE id = $${idx} AND contract_id = $${idx+1} RETURNING *`, [...vals, obligationId, contractId]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_doc_obligation_update',$3,'allowed','none')", [session.role, session.identityId || session.role, obligationId]); } catch {}
        return json(res, 200, { obligation: upd.rows[0] });
      } catch (e) {
        console.error('doc obligation update failed', e);
        return json(res, 503, { error: 'doc_obligation_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  async function handleByCompany(req, res, companyId) {
    if (!isUuid(companyId)) return bad(res, 'invalid_company_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const list = await pool.query('SELECT * FROM crm_document_obligations WHERE company_id = $1 ORDER BY due_date ASC NULLS LAST', [companyId]);
        return json(res, 200, { company_id: companyId, obligations: list.rows, note: 'Obrigações documentais por cliente (company) com categoria, periodicidade, responsável, aprovação e comprovante' });
      } catch {
        return json(res, 503, { error: 'doc_obligations_unavailable' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
  }

  return { handleObligations, handleObligationById, handleByCompany, CATEGORIES, PERIODICITIES, STATUSES, ALLOWED_TRANSITIONS };
}
