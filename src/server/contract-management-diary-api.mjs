export function createContractManagementDiaryApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
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

  function containsSecret(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    const forbidden = ['senha', 'password', 'cpf', 'rg ', 'prontuario', 'cartao', 'credit card', 'chave pix', 'token secreto'];
    for (const f of forbidden) {
      if (lower.includes(f)) {
        // Allow if it's just mentioning not storing? We block explicit secrets
        // Simple heuristic: if contains 'senha' and length < 100 and looks like credential, block
        if (lower.match(/(senha|password)\s*[:=]\s*\S+/) || lower.match(/cpf\s*[:=]?\s*\d{3}/) || lower.match(/prontuario\s*[:=]/)) {
          return true;
        }
        // Also block if contains 'prontuario' at all (medical record)
        if (lower.includes('prontuario')) return true;
      }
    }
    return false;
  }

  const CATEGORIES = ['decisao','risco','negociacao','comercial','operacional','financeiro','juridico','outro'];
  const VISIBILITIES = ['restrito','equipe_gestao','diretoria','outro'];

  async function handleDiary(req, res, contractId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    // Acesso restrito: apenas admin, ti, rh? Verifica role
    if (!['admin','ti','rh'].includes(session.role)) {
      return json(res, 403, { error: 'restricted_access', detail: 'Diário de decisões de gestão com acesso restrito' });
    }

    if (req.method === 'GET') {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const search = url.searchParams.get('search') || url.searchParams.get('q');
      const category = url.searchParams.get('category');
      const visibility = url.searchParams.get('visibility');
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);

      try {
        const pool = getPool();
        const conds = ['contract_id = $1'];
        const vals = [contractId];
        let idx = 2;

        if (category) {
          if (!CATEGORIES.includes(category)) return bad(res, 'invalid_category');
          conds.push(`category = $${idx++}`);
          vals.push(category);
        }
        if (visibility) {
          if (!VISIBILITIES.includes(visibility)) return bad(res, 'invalid_visibility');
          conds.push(`visibility = $${idx++}`);
          vals.push(visibility);
        }
        if (search) {
          const s = sanitizeText(search, 200);
          if (!s) return bad(res, 'invalid_search');
          // Busca por título, decisão, tags, processo
          conds.push(`(to_tsvector('portuguese', title || ' ' || decision) @@ plainto_tsquery('portuguese', $${idx}) OR title ILIKE $${idx+1} OR decision ILIKE $${idx+1} OR process_ref ILIKE $${idx+1})`);
          vals.push(s);
          vals.push(`%${s}%`);
          idx += 2;
        }

        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM crm_management_diary ${where}`, vals);
        const listRes = await pool.query(`SELECT * FROM crm_management_diary ${where} ORDER BY decision_date DESC, created_at DESC LIMIT $${idx} OFFSET $${idx+1}`, [...vals, limit, offset]);

        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_management_diary_search',$3,'allowed','none')", [session.role, session.identityId || session.role, contractId]); } catch {}

        return json(res, 200, { total: countRes.rows[0]?.total || 0, diary: listRes.rows, limit, offset, note: 'Diário de decisões de gestão com acesso restrito, vínculo a contrato/processo e busca; não armazenar segredos ou prontuários em notas livres' });
      } catch (e) {
        console.error('diary list failed', e);
        return json(res, 503, { error: 'diary_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body;
      try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const title = sanitizeText(body?.title, 200);
      const decision = sanitizeText(body?.decision, 5000);
      const category = body?.category ? String(body.category).trim().toLowerCase() : 'decisao';
      const visibility = body?.visibility ? String(body.visibility).trim().toLowerCase() : 'restrito';
      const responsible_id = body?.responsible_id ? String(body.responsible_id).trim() : null;
      const responsible_name = sanitizeText(body?.responsible_name, 120);
      const decision_date = body?.decision_date ? String(body.decision_date).trim() : null;
      const process_ref = sanitizeText(body?.process_ref, 100);
      const related_opportunity_id = body?.related_opportunity_id ? String(body.related_opportunity_id).trim() : null;
      const company_id = body?.company_id ? String(body.company_id).trim() : null;
      const tags = Array.isArray(body?.tags) ? body.tags.slice(0,20).map(t => String(t).trim().slice(0,50)).filter(Boolean) : [];

      if (!title) return bad(res, 'invalid_title');
      if (!decision || decision.length < 10) return bad(res, 'decision_min_10_required');
      if (!CATEGORIES.includes(category)) return bad(res, 'invalid_category');
      if (!VISIBILITIES.includes(visibility)) return bad(res, 'invalid_visibility');
      if (!decision_date || isNaN(Date.parse(decision_date))) return bad(res, 'invalid_decision_date_required');
      if (responsible_id && !isUuid(responsible_id)) return bad(res, 'invalid_responsible_id');
      if (related_opportunity_id && !isUuid(related_opportunity_id)) return bad(res, 'invalid_related_opportunity_id');
      if (company_id && !isUuid(company_id)) return bad(res, 'invalid_company_id');
      if (process_ref && process_ref.length > 100) return bad(res, 'invalid_process_ref');

      if (containsSecret(decision) || containsSecret(title)) {
        return json(res, 400, { error: 'secret_or_medical_record_not_allowed_in_free_notes', detail: 'Não armazenar segredos ou prontuários em notas livres (CON-11). Remova senhas, CPF, prontuário.' });
      }

      try {
        const pool = getPool();
        const cRes = await pool.query('SELECT id, company_id FROM crm_contracts WHERE id = $1', [contractId]);
        if (!cRes.rows[0]) return json(res, 404, { error: 'contract_not_found' });

        const finalCompanyId = company_id || cRes.rows[0].company_id;

        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_management_diary
            (id, contract_id, company_id, process_ref, title, decision, category, visibility, responsible_id, responsible_name, decision_date, related_opportunity_id, tags, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
          [id, contractId, finalCompanyId, process_ref, title, decision, category, visibility, responsible_id, responsible_name, new Date(decision_date).toISOString().slice(0,10), related_opportunity_id, tags, session.role, session.identityId || null]
        );

        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_management_diary_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}

        return json(res, 201, { entry: ins.rows[0], note: 'Decisão de gestão registrada com acesso restrito, vínculo contrato/processo, busca por título/decisão/tags. Segredos e prontuários bloqueados.' });
      } catch (e) {
        console.error('diary create failed', e);
        return json(res, 503, { error: 'diary_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleDiaryById(req, res, contractId, entryId) {
    if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
    if (!isUuid(entryId)) return bad(res, 'invalid_entry_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (!['admin','ti','rh'].includes(session.role)) {
      return json(res, 403, { error: 'restricted_access' });
    }

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_management_diary WHERE id = $1 AND contract_id = $2', [entryId, contractId]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        return json(res, 200, { entry: r.rows[0] });
      } catch {
        return json(res, 503, { error: 'diary_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body;
      try { body = await readJson(req, 20 * 1024); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;
      if (body?.title !== undefined) { const t = sanitizeText(body.title, 200); if (!t) return bad(res, 'invalid_title'); if (containsSecret(t)) return bad(res, 'secret_not_allowed'); fields.push(`title = $${idx++}`); vals.push(t); }
      if (body?.decision !== undefined) { const d = sanitizeText(body.decision, 5000); if (!d || d.length < 10) return bad(res, 'invalid_decision'); if (containsSecret(d)) return json(res, 400, { error: 'secret_or_medical_record_not_allowed' }); fields.push(`decision = $${idx++}`); vals.push(d); }
      if (body?.category !== undefined) { const c = String(body.category).trim().toLowerCase(); if (!CATEGORIES.includes(c)) return bad(res, 'invalid_category'); fields.push(`category = $${idx++}`); vals.push(c); }
      if (body?.visibility !== undefined) { const v = String(body.visibility).trim().toLowerCase(); if (!VISIBILITIES.includes(v)) return bad(res, 'invalid_visibility'); fields.push(`visibility = $${idx++}`); vals.push(v); }
      if (body?.responsible_name !== undefined) { const rn = sanitizeText(body.responsible_name, 120); fields.push(`responsible_name = $${idx++}`); vals.push(rn); }
      if (body?.decision_date !== undefined) { const dd = body.decision_date ? String(body.decision_date).trim() : null; if (dd && isNaN(Date.parse(dd))) return bad(res, 'invalid_decision_date'); fields.push(`decision_date = $${idx++}`); vals.push(dd ? new Date(dd).toISOString().slice(0,10) : null); }
      if (body?.process_ref !== undefined) { const pr = sanitizeText(body.process_ref, 100); fields.push(`process_ref = $${idx++}`); vals.push(pr); }
      if (body?.tags !== undefined) { const tags = Array.isArray(body.tags) ? body.tags.slice(0,20).map(t => String(t).trim().slice(0,50)).filter(Boolean) : []; fields.push(`tags = $${idx++}`); vals.push(tags); }
      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`updated_at = NOW()`);
      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_management_diary SET ${fields.join(', ')} WHERE id = $${idx} AND contract_id = $${idx+1} RETURNING *`, [...vals, entryId, contractId]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_management_diary_update',$3,'allowed','none')", [session.role, session.identityId || session.role, entryId]); } catch {}
        return json(res, 200, { entry: upd.rows[0] });
      } catch (e) {
        console.error('diary update failed', e);
        return json(res, 503, { error: 'diary_update_failed' });
      }
    }

    if (req.method === 'DELETE') {
      try {
        const pool = getPool();
        await pool.query('DELETE FROM crm_management_diary WHERE id = $1 AND contract_id = $2', [entryId, contractId]);
        return json(res, 200, { deleted: true });
      } catch {
        return json(res, 503, { error: 'diary_delete_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH, DELETE' });
  }

  async function handleSearch(req, res) {
    // Busca global com acesso restrito
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });
    if (!['admin','ti','rh'].includes(session.role)) {
      return json(res, 403, { error: 'restricted_access' });
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const q = url.searchParams.get('q') || url.searchParams.get('search');
    const contractId = url.searchParams.get('contract_id') || url.searchParams.get('contractId');
    const companyId = url.searchParams.get('company_id') || url.searchParams.get('companyId');
    const category = url.searchParams.get('category');
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);

    if (!q || !sanitizeText(q, 200)) return bad(res, 'search_required');

    try {
      const pool = getPool();
      const conds = [];
      const vals = [];
      let idx = 1;

      conds.push(`(to_tsvector('portuguese', title || ' ' || decision) @@ plainto_tsquery('portuguese', $${idx}) OR title ILIKE $${idx+1} OR decision ILIKE $${idx+1})`);
      vals.push(q);
      vals.push(`%${q}%`);
      idx += 2;

      if (contractId) {
        if (!isUuid(contractId)) return bad(res, 'invalid_contract_id');
        conds.push(`contract_id = $${idx++}`);
        vals.push(contractId);
      }
      if (companyId) {
        if (!isUuid(companyId)) return bad(res, 'invalid_company_id');
        conds.push(`company_id = $${idx++}`);
        vals.push(companyId);
      }
      if (category) {
        if (!CATEGORIES.includes(category)) return bad(res, 'invalid_category');
        conds.push(`category = $${idx++}`);
        vals.push(category);
      }

      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM crm_management_diary ${where}`, vals);
      const listRes = await pool.query(`SELECT * FROM crm_management_diary ${where} ORDER BY decision_date DESC, created_at DESC LIMIT $${idx} OFFSET $${idx+1}`, [...vals, limit, offset]);

      try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_management_diary_search',$3,'allowed','none')", [session.role, session.identityId || session.role, 'global_search']); } catch {}

      return json(res, 200, { total: countRes.rows[0]?.total || 0, results: listRes.rows, limit, offset, note: 'Busca no diário de decisões com vínculo contrato/processo, acesso restrito, sem segredos' });
    } catch (e) {
      console.error('diary search failed', e);
      return json(res, 503, { error: 'diary_search_unavailable' });
    }
  }

  return { handleDiary, handleDiaryById, handleSearch, CATEGORIES, VISIBILITIES };
}
