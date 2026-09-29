// PLT-10 pedidos acesso/correção/eliminação verificação identidade responsável prazo impedimentos legais documentados
import { createHash } from 'node:crypto';

export function createLgpdRequestApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
  const REQUEST_TYPES = ['acesso','correcao','eliminacao','portabilidade','oposicao','revogacao_consentimento','informacao','outro'];
  const STATUSES = ['recebido','em_verificacao','em_analise','aguardando_titular','aprovado','atendido','rejeitado','cancelado','expirado'];
  const VERIFICATION_METHODS = ['email','documento','presencial','video','outro'];

  function sanitizeText(s, max) {
    if (s == null) return null;
    if (typeof s !== 'string') return null;
    const t = s.trim();
    if (t.length === 0) return null;
    if (t.length > max) return null;
    return t;
  }

  function hashDocument(doc) {
    if (!doc) return null;
    try {
      return createHash('sha256').update(String(doc).replace(/\D/g,'')).digest('hex').slice(0, 64);
    } catch { return null; }
  }

  const ALLOWED_TRANSITIONS = {
    recebido: ['em_verificacao','cancelado'],
    em_verificacao: ['em_analise','aguardando_titular','rejeitado','cancelado'],
    em_analise: ['aprovado','rejeitado','aguardando_titular','cancelado'],
    aguardando_titular: ['em_analise','rejeitado','expirado','cancelado'],
    aprovado: ['atendido','rejeitado','cancelado'],
    atendido: [],
    rejeitado: [],
    cancelado: [],
    expirado: [],
  };

  async function handleRequests(req, res) {
    // Public endpoint for creating request does NOT require admin session, but requires sameOrigin and rate limit
    if (req.method === 'POST' && (req.url.includes('/api/lgpd/requests') || req.url.includes('/api/privacy/requests') || req.url.includes('/api/public/lgpd'))) {
      // Public creation
      if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
      let body;
      try { body = await readJson(req, 10 * 1024); } catch { return json(res, 400, { error: 'invalid_json' }); }
      const request_type = String(body?.request_type || body?.requestType || '').toLowerCase();
      const requester_name = sanitizeText(body?.requester_name || body?.requesterName, 200);
      const requester_email = sanitizeText(body?.requester_email || body?.requesterEmail, 320);
      const requester_document = body?.requester_document || body?.requesterDocument || null;
      const description = sanitizeText(body?.description, 5000);

      if (!REQUEST_TYPES.includes(request_type)) return json(res, 400, { error: 'invalid_request_type' });
      if (!requester_name) return json(res, 400, { error: 'invalid_requester_name' });
      if (!requester_email || !requester_email.includes('@')) return json(res, 400, { error: 'invalid_requester_email' });
      if (!description || description.length < 10) return json(res, 400, { error: 'description_min_10' });

      try {
        const pool = getPool();
        const id = crypto.randomUUID();
        const dueDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0,10); // 15 dias LGPD
        const docHash = requester_document ? hashDocument(requester_document) : null;
        const ins = await pool.query(
          `INSERT INTO lgpd_requests (id, request_type, status, requester_name, requester_email, requester_document_hash, description, due_date)
           VALUES ($1,$2,'recebido',$3,$4,$5,$6,$7) RETURNING *`,
          [id, request_type, requester_name, requester_email, docHash, description, dueDate]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ('public',$1,'lgpd_request_create',$2,'allowed','none')", [requester_email, id]); } catch {}
        return json(res, 201, { request: ins.rows[0], note: 'Pedido LGPD recebido, verificação identidade necessária, prazo 15 dias, responsável será atribuído, impedimentos legais documentados se houver' });
      } catch (e) {
        console.error('lgpd create failed', e);
        return json(res, 503, { error: 'lgpd_create_failed' });
      }
    }

    // Admin list
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (!['admin','ti','rh'].includes(session.role)) return json(res, 403, { error: 'lgpd_restricted_admin_ti_rh' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const type = url.searchParams.get('type');
        const status = url.searchParams.get('status');
        const email = url.searchParams.get('email');
        const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
        let conds = []; let vals = []; let idx = 1;
        if (type) {
          if (!REQUEST_TYPES.includes(type)) return json(res, 400, { error: 'invalid_type' });
          conds.push(`request_type = $${idx++}`); vals.push(type);
        }
        if (status) {
          if (!STATUSES.includes(status)) return json(res, 400, { error: 'invalid_status' });
          conds.push(`status = $${idx++}`); vals.push(status);
        }
        if (email) {
          const e = sanitizeText(email, 320);
          conds.push(`requester_email ILIKE $${idx++}`); vals.push(`%${e}%`);
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const r = await pool.query(`SELECT * FROM lgpd_requests ${where} ORDER BY created_at DESC LIMIT $${idx}`, [...vals, limit]);
        return json(res, 200, { requests: r.rows, note: 'Pedidos LGPD com verificação identidade, responsável, prazo 15 dias, impedimentos documentados' });
      } catch (e) {
        console.error('lgpd list failed', e);
        return json(res, 503, { error: 'lgpd_unavailable' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleRequestById(req, res, requestId) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(requestId)) return json(res, 400, { error: 'invalid_request_id' });
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (!['admin','ti','rh'].includes(session.role)) return json(res, 403, { error: 'lgpd_restricted' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM lgpd_requests WHERE id = $1', [requestId]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        const hist = await pool.query('SELECT * FROM lgpd_request_history WHERE request_id = $1 ORDER BY created_at DESC LIMIT 50', [requestId]);
        return json(res, 200, { request: r.rows[0], history: hist.rows });
      } catch {
        return json(res, 503, { error: 'lgpd_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body;
      try { body = await readJson(req, 10 * 1024); } catch { return json(res, 400, { error: 'invalid_json' }); }
      const next_status = body?.next_status || body?.nextStatus ? String(body.next_status || body.nextStatus).toLowerCase() : null;
      const reason = sanitizeText(body?.reason, 2000);
      const responsible_name = sanitizeText(body?.responsible_name || body?.responsibleName, 200);
      const responsible_id = body?.responsible_id || body?.responsibleId || null;
      const verification_method = body?.verification_method || body?.verificationMethod ? String(body.verification_method || body.verificationMethod).toLowerCase() : null;
      const is_identity_verified = body?.is_identity_verified ?? body?.isIdentityVerified;
      const legal_impediment = sanitizeText(body?.legal_impediment || body?.legalImpediment, 2000);
      const impediment_documented = body?.impediment_documented ?? body?.impedimentDocumented;
      const response = sanitizeText(body?.response, 5000);

      try {
        const pool = getPool();
        const curRes = await pool.query('SELECT * FROM lgpd_requests WHERE id = $1', [requestId]);
        const cur = curRes.rows[0];
        if (!cur) return json(res, 404, { error: 'not_found' });

        const fields = []; const vals = []; let idx = 1;

        if (next_status) {
          if (!STATUSES.includes(next_status)) return json(res, 400, { error: 'invalid_next_status' });
          const allowed = ALLOWED_TRANSITIONS[cur.status] || [];
          if (!allowed.includes(next_status)) return json(res, 400, { error: 'invalid_transition', detail: `Transição ${cur.status} -> ${next_status} não permitida. Permitidas: ${allowed.join(', ')}` });
          // Regras: para aprovar/atender, identidade deve estar verificada
          if ((next_status === 'aprovado' || next_status === 'atendido') && !cur.is_identity_verified && is_identity_verified !== true) {
            return json(res, 400, { error: 'identity_verification_required', detail: 'Verificação identidade obrigatória antes de aprovar/atender' });
          }
          // Para rejeitar por impedimento legal, exigir impediment_documented
          if (next_status === 'rejeitado' && legal_impediment && !impediment_documented && !cur.impediment_documented) {
            return json(res, 400, { error: 'legal_impediment_must_be_documented', detail: 'Impedimentos legais devem ser documentados' });
          }
          fields.push(`status = $${idx++}`); vals.push(next_status);
          if (next_status === 'atendido') {
            fields.push(`response_sent_at = NOW()`);
          }
        }

        if (responsible_name !== null || responsible_id !== null) {
          if (responsible_name) { fields.push(`responsible_name = $${idx++}`); vals.push(responsible_name); }
          if (responsible_id) {
            const UUID_RE2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!UUID_RE2.test(responsible_id)) return json(res, 400, { error: 'invalid_responsible_id' });
            fields.push(`responsible_id = $${idx++}`); vals.push(responsible_id);
          }
        }

        if (verification_method) {
          if (!VERIFICATION_METHODS.includes(verification_method)) return json(res, 400, { error: 'invalid_verification_method' });
          fields.push(`verification_method = $${idx++}`); vals.push(verification_method);
        }

        if (is_identity_verified !== undefined) {
          fields.push(`is_identity_verified = $${idx++}`); vals.push(!!is_identity_verified);
          if (is_identity_verified) {
            fields.push(`verified_at = NOW()`);
            fields.push(`verified_by = $${idx++}`); vals.push(session.role);
            fields.push(`verified_by_id = $${idx++}`); vals.push(session.identityId || null);
          }
        }

        if (legal_impediment !== undefined) {
          fields.push(`legal_impediment = $${idx++}`); vals.push(legal_impediment);
        }
        if (impediment_documented !== undefined) {
          fields.push(`impediment_documented = $${idx++}`); vals.push(!!impediment_documented);
        }
        if (response !== undefined) {
          fields.push(`response = $${idx++}`); vals.push(response);
        }

        if (fields.length === 0) return json(res, 400, { error: 'no_fields' });
        fields.push(`updated_at = NOW()`);

        const upd = await pool.query(`UPDATE lgpd_requests SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, [...vals, requestId]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });

        // History
        if (next_status) {
          await pool.query(
            `INSERT INTO lgpd_request_history (id, request_id, previous_status, next_status, reason, changed_by, changed_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [crypto.randomUUID(), requestId, cur.status, next_status, reason, session.role, session.identityId || null]
          );
        }

        const auditAction = next_status === 'atendido' ? 'lgpd_request_respond' : next_status === 'rejeitado' ? 'lgpd_request_reject' : is_identity_verified ? 'lgpd_request_verify' : 'lgpd_request_update';
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,'allowed','none')", [session.role, session.identityId || session.role, auditAction, requestId]); } catch {}

        return json(res, 200, { request: upd.rows[0], note: 'Pedido LGPD atualizado com verificação identidade, responsável, prazo e impedimentos documentados' });
      } catch (e) {
        console.error('lgpd update failed', e);
        return json(res, 503, { error: 'lgpd_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  return { handleRequests, handleRequestById, REQUEST_TYPES, STATUSES };
}
