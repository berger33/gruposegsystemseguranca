export function createContractStatusApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
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

  // Transições autorizadas CON-03
  const ALLOWED_TRANSITIONS = {
    rascunho: ['em_revisao', 'cancelado'],
    em_revisao: ['rascunho', 'aguardando_assinatura', 'cancelado'],
    aguardando_assinatura: ['em_revisao', 'ativo', 'cancelado'],
    ativo: ['suspenso', 'encerrado', 'cancelado'],
    suspenso: ['ativo', 'encerrado', 'cancelado'],
    encerrado: [],
    cancelado: [],
  };

  const ALL_STATUSES = ['rascunho','em_revisao','aguardando_assinatura','ativo','suspenso','encerrado','cancelado'];

  function isTransitionAllowed(from, to) {
    if (!from) return true; // criação inicial
    const allowed = ALLOWED_TRANSITIONS[from] || [];
    return allowed.includes(to);
  }

  async function handleStatusHistory(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });

    try {
      const pool = getPool();
      const cRes = await pool.query('SELECT id, status, signed_at, signed_by, operational_activated_at, current_status_effective_date, status_changed_at, suspension_reason, closure_reason FROM crm_contracts WHERE id = $1', [contractId]);
      if (!cRes.rows[0]) return json(res, 404, { error: 'not_found' });
      const hist = await pool.query('SELECT * FROM crm_contract_status_history WHERE contract_id = $1 ORDER BY effective_date DESC, created_at DESC', [contractId]);
      return json(res, 200, { contract: cRes.rows[0], history: hist.rows, allowed_transitions: ALLOWED_TRANSITIONS[cRes.rows[0].status] || [], all_statuses: ALL_STATUSES, note: 'Assinatura (signed_at) não confunde com ativação operacional (operational_activated_at). Data de efeito registra quando mudança vale.' });
    } catch (e) {
      console.error('status history failed', e);
      return json(res, 503, { error: 'status_history_unavailable' });
    }
  }

  async function handleStatusTransition(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });

    let body;
    try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }

    const next_status = body?.next_status ? String(body.next_status).trim().toLowerCase() : null;
    const effective_date = body?.effective_date ? String(body.effective_date).trim() : null;
    const reason = sanitizeText(body?.reason, 1000);
    const is_signature_event = Boolean(body?.is_signature_event);
    const is_operational_activation = Boolean(body?.is_operational_activation);
    const signed_by = sanitizeText(body?.signed_by, 120);
    const suspension_reason = sanitizeText(body?.suspension_reason, 1000);
    const closure_reason = sanitizeText(body?.closure_reason, 1000);

    if (!next_status || !ALL_STATUSES.includes(next_status)) return bad(res, 'invalid_next_status');
    if (!effective_date || isNaN(Date.parse(effective_date))) return bad(res, 'invalid_effective_date_required');
    const effDate = new Date(effective_date);
    // effective_date must be DATE only, store as DATE
    const effDateStr = effDate.toISOString().slice(0,10);
    // Not allow far past? Allow but warn. Forbid future > 1 year?
    const now = new Date();
    const oneYearFuture = new Date(); oneYearFuture.setFullYear(now.getFullYear()+1);
    if (effDate > oneYearFuture) return bad(res, 'effective_date_too_far_future');
    if (next_status === 'suspenso' && !suspension_reason && !reason) return bad(res, 'suspension_reason_required');
    if (next_status === 'encerrado' && !closure_reason && !reason) return bad(res, 'closure_reason_required');

    try {
      const pool = getPool();
      const cRes = await pool.query('SELECT * FROM crm_contracts WHERE id = $1', [contractId]);
      if (!cRes.rows[0]) return json(res, 404, { error: 'not_found' });
      const contract = cRes.rows[0];
      const current = contract.status;

      if (current === next_status) return json(res, 409, { error: 'already_in_status', current_status: current });
      if (!isTransitionAllowed(current, next_status)) {
        return json(res, 409, { error: 'invalid_transition', current_status: current, next_status, allowed: ALLOWED_TRANSITIONS[current] || [] });
      }

      // Regras de assinatura vs ativação operacional
      // Não confundir assinatura com ativação operacional: são eventos distintos com datas próprias
      // Se transita para ativo vindo de aguardando_assinatura, precisa ter assinatura (signed_at) ou marcar is_signature_event
      let newSignedAt = contract.signed_at;
      let newSignedBy = contract.signed_by;
      let newSignedById = contract.signed_by_id;
      let newOperationalAt = contract.operational_activated_at;

      if (next_status === 'ativo' && current === 'aguardando_assinatura') {
        // Assinatura deve ter ocorrido antes ou no momento da ativação
        if (!contract.signed_at && !is_signature_event && !body?.signed_at) {
          return json(res, 409, { error: 'signature_required_before_activation', detail: 'Contrato em aguardando_assinatura precisa assinatura (signed_at) antes de ativação operacional. Marque is_signature_event ou informe signed_at.' });
        }
        if (is_signature_event || body?.signed_at) {
          newSignedAt = body?.signed_at ? new Date(body.signed_at) : new Date(effective_date);
          newSignedBy = signed_by || session.role;
          newSignedById = session.identityId || null;
        }
        // Ativação operacional ocorre na transição para ativo
        newOperationalAt = new Date(effective_date);
      }

      if (is_signature_event) {
        // Evento de assinatura pode ocorrer em aguardando_assinatura sem mudar status, mas aqui já muda status
        // Se is_signature_event true e next_status != ativo, mantém status aguardando_assinatura mas registra assinatura
        // Para simplificar, se is_signature_event true e next_status == aguardando_assinatura, registra assinatura mas não ativa
        if (next_status === 'aguardando_assinatura') {
          newSignedAt = body?.signed_at ? new Date(body.signed_at) : new Date(effective_date);
          newSignedBy = signed_by || session.role;
          newSignedById = session.identityId || null;
          // operational não seta
        }
      }

      if (is_operational_activation) {
        if (next_status !== 'ativo') {
          return bad(res, 'operational_activation_only_for_ativo');
        }
        newOperationalAt = new Date(effective_date);
      }

      // Se next_status == suspenso, set suspension_reason
      // Se encerrado, set closure_reason
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Insert history
        const histId = crypto.randomUUID();
        await client.query(
          `INSERT INTO crm_contract_status_history
            (id, contract_id, previous_status, next_status, effective_date, reason, is_signature_event, is_operational_activation, signed_at, operational_activated_at, changed_by, changed_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            histId,
            contractId,
            current,
            next_status,
            effDateStr,
            reason || suspension_reason || closure_reason,
            is_signature_event,
            is_operational_activation || (next_status === 'ativo' && current === 'aguardando_assinatura'),
            newSignedAt,
            newOperationalAt,
            session.role,
            session.identityId || null,
          ]
        );

        // Update contract
        const updateFields = [];
        const vals = [];
        let idx = 1;
        updateFields.push(`status = $${idx++}`); vals.push(next_status);
        updateFields.push(`current_status_effective_date = $${idx++}`); vals.push(effDateStr);
        updateFields.push(`status_changed_at = NOW()`);
        updateFields.push(`status_changed_by = $${idx++}`); vals.push(session.role);
        updateFields.push(`status_changed_by_id = $${idx++}`); vals.push(session.identityId || null);
        if (newSignedAt) { updateFields.push(`signed_at = $${idx++}`); vals.push(newSignedAt); }
        if (newSignedBy) { updateFields.push(`signed_by = $${idx++}`); vals.push(newSignedBy); }
        if (newSignedById) { updateFields.push(`signed_by_id = $${idx++}`); vals.push(newSignedById); }
        if (newOperationalAt) { updateFields.push(`operational_activated_at = $${idx++}`); vals.push(newOperationalAt); }
        if (next_status === 'suspenso') {
          updateFields.push(`suspension_reason = $${idx++}`); vals.push(suspension_reason || reason);
          updateFields.push(`closure_reason = NULL`);
        } else if (next_status === 'encerrado') {
          updateFields.push(`closure_reason = $${idx++}`); vals.push(closure_reason || reason);
          updateFields.push(`suspension_reason = NULL`);
        } else if (next_status === 'ativo') {
          // limpa suspensão/encerramento ao reativar
          updateFields.push(`suspension_reason = NULL`);
          updateFields.push(`closure_reason = NULL`);
        }
        updateFields.push(`updated_at = NOW()`);

        const updRes = await client.query(
          `UPDATE crm_contracts SET ${updateFields.join(', ')} WHERE id = $${idx} RETURNING *`,
          [...vals, contractId]
        );

        await client.query('COMMIT');

        // Auditoria
        try {
          await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_status_change',$3,'allowed','none')", [session.role, session.identityId || session.role, contractId]);
          if (is_signature_event || newSignedAt) {
            await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_signed',$3,'allowed','none')", [session.role, session.identityId || session.role, contractId]);
          }
          if (is_operational_activation || next_status === 'ativo') {
            await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_activated',$3,'allowed','none')", [session.role, session.identityId || session.role, contractId]);
          }
          if (next_status === 'suspenso') {
            await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_suspended',$3,'allowed','none')", [session.role, session.identityId || session.role, contractId]);
          }
          if (next_status === 'encerrado') {
            await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_closed',$3,'allowed','none')", [session.role, session.identityId || session.role, contractId]);
          }
        } catch {}

        return json(res, 200, { contract: updRes.rows[0], history_id: histId, note: 'Transição autorizada registrada com data de efeito. Assinatura (signed_at) distinta de ativação operacional (operational_activated_at).' });
      } catch (e) {
        await client.query('ROLLBACK');
        console.error('status transition failed', e);
        return json(res, 503, { error: 'status_transition_failed' });
      } finally {
        client.release();
      }
    } catch (e) {
      console.error('status transition outer failed', e);
      return json(res, 503, { error: 'status_transition_unavailable' });
    }
  }

  async function handleSignatureEvent(req, res, contractId) {
    // Evento separado para registrar assinatura sem mudar status (útil para distinguir)
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });

    let body;
    try { body = await readJson(req, 20 * 1024); } catch { return bad(res, 'invalid_json'); }
    const signed_at = body?.signed_at ? String(body.signed_at).trim() : new Date().toISOString();
    const signed_by = sanitizeText(body?.signed_by, 120) || session.role;
    if (isNaN(Date.parse(signed_at))) return bad(res, 'invalid_signed_at');

    try {
      const pool = getPool();
      const cRes = await pool.query('SELECT * FROM crm_contracts WHERE id = $1', [contractId]);
      if (!cRes.rows[0]) return json(res, 404, { error: 'not_found' });
      const contract = cRes.rows[0];
      if (contract.status !== 'aguardando_assinatura' && contract.status !== 'ativo') {
        return json(res, 409, { error: 'signature_only_in_aguardando_or_ativo', current_status: contract.status });
      }

      const histId = crypto.randomUUID();
      const effDateStr = new Date(signed_at).toISOString().slice(0,10);
      await pool.query(
        `INSERT INTO crm_contract_status_history
          (id, contract_id, previous_status, next_status, effective_date, reason, is_signature_event, is_operational_activation, signed_at, changed_by, changed_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,true,false,$7,$8,$9)`,
        [histId, contractId, contract.status, contract.status, effDateStr, body?.reason ? String(body.reason).slice(0,1000) : 'Assinatura registrada', new Date(signed_at), session.role, session.identityId || null]
      );
      const upd = await pool.query(
        `UPDATE crm_contracts SET signed_at = $1, signed_by = $2, signed_by_id = $3, updated_at = NOW() WHERE id = $4 RETURNING *`,
        [new Date(signed_at), signed_by, session.identityId || null, contractId]
      );
      try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_contract_signed',$3,'allowed','none')", [session.role, session.identityId || session.role, contractId]); } catch {}
      return json(res, 200, { contract: upd.rows[0], history_id: histId, note: 'Assinatura registrada distinta de ativação operacional.' });
    } catch (e) {
      console.error('signature event failed', e);
      return json(res, 503, { error: 'signature_failed' });
    }
  }

  return { handleStatusHistory, handleStatusTransition, handleSignatureEvent, ALLOWED_TRANSITIONS, ALL_STATUSES };
}
