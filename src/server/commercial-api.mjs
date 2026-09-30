export function createCommercialApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {

  // Management owns rules, approvals and financial records. Sales staff read
  // only assigned records; operational follow-up is handled by /crm/portfolio.
  function scopedPool(session){
    const db=getPool(),relations={"crm_commercial_library":"status='aprovado'","crm_campaigns":"created_by_id=$N","crm_campaign_targets":"campaign_id IN (SELECT id FROM public.crm_campaigns WHERE created_by_id=$N)","crm_proposal_comparisons":"created_by_id=$N"};
    return {query(sql,values=[]){
      if(session.role!=='comercial'||!/^\s*SELECT/i.test(sql))return db.query(sql,values);
      const n=values.length+1;
      const ctes=Object.entries(relations).map(([table,condition])=>table+' AS (SELECT * FROM public.'+table+' WHERE '+condition.replaceAll('$N','$'+n)+')');
      // Bind the identity even when only the approved-library CTE is used.
      ctes.push('viewer AS (SELECT $'+n+'::uuid AS id)');
      return db.query('WITH '+ctes.join(',')+' '+sql,[...values,session.identityId]);
    }};
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isUuid = v => typeof v === 'string' && UUID_RE.test(v);
  const bad = (res, msg) => json(res, 400, { error: msg });
  const sanitizeText = (s, max) => {
    if (s == null) return null;
    if (typeof s !== 'string') return null;
    const t = s.trim();
    if (t.length === 0) return null;
    if (t.length > max) return null;
    return t;
  };

  // Library
  async function handleLibrary(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session?.identityId) return json(res,401,{error:'admin_session_required'});
    if(!['admin','marcelo','ti','comercial'].includes(session.role))return json(res,403,{error:'role_required'});
    if(req.method!=='GET'&&session.role==='comercial')return json(res,403,{error:'management_role_required'});

    if (req.method === 'GET') {
      const type = url.searchParams.get('type');
      const status = url.searchParams.get('status');
      const category = url.searchParams.get('category');
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const conds = []; const vals = []; let idx = 1;
      if (type) { conds.push(`type = $${idx++}`); vals.push(type); }
      if (status) { conds.push(`status = $${idx++}`); vals.push(status); }
      if (category) { conds.push(`category = $${idx++}`); vals.push(category); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      try {
        const pool = scopedPool(session);
        const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM crm_commercial_library ${where}`, vals);
        const listRes = await pool.query(`SELECT * FROM crm_commercial_library ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx+1}`, [...vals, limit, offset]);
        return json(res, 200, { total: countRes.rows[0]?.total || 0, library: listRes.rows, limit, offset });
      } catch (e) {
        return json(res, 503, { error: 'library_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const title = sanitizeText(body?.title, 200);
      const type = body?.type ? String(body.type).trim().toLowerCase() : 'documento';
      const description = sanitizeText(body?.description, 2000);
      const category = sanitizeText(body?.category, 100);
      const tags = Array.isArray(body?.tags) ? body.tags.slice(0, 20).map(t => String(t).slice(0, 50)) : [];
      const file_url = sanitizeText(body?.file_url, 1000);

      if (!title) return bad(res, 'invalid_title');
      if(file_url && !/^(https:\/\/|\/(?!\/))/.test(file_url))return bad(res,'invalid_file_url');
      if (!['apresentacao','case','documento','video','planilha','imagem','outro'].includes(type)) return bad(res, 'invalid_type');

      try {
        const pool = scopedPool(session);
        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_commercial_library (id, title, type, description, category, tags, file_url, status, version, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,'rascunho',1,$8,$9) RETURNING *`,
          [id, title, type, description, category, JSON.stringify(tags), file_url, session.role, session.identityId || null]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_library_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 201, { item: ins.rows[0] });
      } catch (e) {
        console.error('library create failed', e);
        return json(res, 503, { error: 'library_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleLibraryById(req, res, id) {
    if (!isUuid(id)) return bad(res, 'invalid_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session?.identityId) return json(res,401,{error:'admin_session_required'});
    if(!['admin','marcelo','ti','comercial'].includes(session.role))return json(res,403,{error:'role_required'});
    if(req.method!=='GET'&&session.role==='comercial')return json(res,403,{error:'management_role_required'});

    if (req.method === 'GET') {
      try {
        const pool = scopedPool(session);
        const r = await pool.query('SELECT * FROM crm_commercial_library WHERE id = $1', [id]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        return json(res, 200, { item: r.rows[0] });
      } catch {
        return json(res, 503, { error: 'library_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;

      if (body?.title !== undefined) { const t = sanitizeText(body.title, 200); if (!t) return bad(res, 'invalid_title'); fields.push(`title = $${idx++}`); vals.push(t); }
      if (body?.description !== undefined) { const d = sanitizeText(body.description, 2000); fields.push(`description = $${idx++}`); vals.push(d); }
      if (body?.category !== undefined) { const c = sanitizeText(body.category, 100); fields.push(`category = $${idx++}`); vals.push(c); }
      if (body?.tags !== undefined) {
        if (!Array.isArray(body.tags)) return bad(res, 'invalid_tags');
        const tags = body.tags.slice(0, 20).map(t => String(t).slice(0, 50));
        fields.push(`tags = $${idx++}::jsonb`); vals.push(JSON.stringify(tags));
      }
      if (body?.file_url !== undefined) { const fu = sanitizeText(body.file_url, 1000); if(fu&&!/^(https:\/\/|\/(?!\/))/.test(fu))return bad(res,'invalid_file_url'); fields.push(`file_url = $${idx++}`); vals.push(fu); }
      if (body?.status !== undefined) {
        const st = String(body.status).trim().toLowerCase();
        if (!['rascunho','em_revisao','aprovado','rejeitado','arquivado'].includes(st)) return bad(res, 'invalid_status');
        fields.push(`status = $${idx++}`); vals.push(st);
        if (st === 'aprovado') {
          fields.push(`approved_by = $${idx++}`); vals.push(session.identityId || null);
          fields.push(`approved_by_role = $${idx++}`); vals.push(session.role);
          fields.push(`approved_at = NOW()`);
          fields.push(`rejection_reason = NULL`);
        }
        if (st === 'rejeitado') {
          const rr = sanitizeText(body.rejection_reason, 500);
          if (!rr) return bad(res, 'rejection_reason_required');
          fields.push(`rejection_reason = $${idx++}`); vals.push(rr);
          fields.push(`approved_by = NULL`);
          fields.push(`approved_at = NULL`);
        }
      }

      if(body?.status==='aprovado'&&Object.keys(body).some(k=>k!=='status'))return bad(res,'approve_in_separate_request');
      if(body?.status===undefined&&fields.length){fields.push("status = 'rascunho'");fields.push("approved_by = NULL");fields.push("approved_at = NULL");}
      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`version = version + 1`);
      fields.push(`updated_at = NOW()`);

      try {
        const pool = scopedPool(session);
        const upd = await pool.query(`UPDATE crm_commercial_library SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, [...vals, id]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        const action = body?.status === 'aprovado' ? 'crm_library_approve' : body?.status === 'rejeitado' ? 'crm_library_reject' : 'crm_library_update';
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,'allowed','none')", [session.role, session.identityId || session.role, action, id]); } catch {}
        return json(res, 200, { item: upd.rows[0] });
      } catch (e) {
        return json(res, 503, { error: 'library_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  // Campaigns
  async function handleCampaigns(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session?.identityId) return json(res,401,{error:'admin_session_required'});
    if(!['admin','marcelo','ti','comercial'].includes(session.role))return json(res,403,{error:'role_required'});
    if(req.method!=='GET'&&session.role==='comercial')return json(res,403,{error:'management_role_required'});

    if (req.method === 'GET') {
      const status = url.searchParams.get('status');
      const segment_type = url.searchParams.get('segment_type') || url.searchParams.get('segmentType');
      const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const conds = []; const vals = []; let idx = 1;
      if (status) { conds.push(`status = $${idx++}`); vals.push(status); }
      if (segment_type) { conds.push(`segment_type = $${idx++}`); vals.push(segment_type); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      try {
        const pool = scopedPool(session);
        const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM crm_campaigns ${where}`, vals);
        const listRes = await pool.query(`SELECT * FROM crm_campaigns ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx+1}`, [...vals, limit, offset]);
        return json(res, 200, { total: countRes.rows[0]?.total || 0, campaigns: listRes.rows, limit, offset });
      } catch {
        return json(res, 503, { error: 'campaigns_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const name = sanitizeText(body?.name, 200);
      const description = sanitizeText(body?.description, 2000);
      const segment_type = body?.segment_type ? String(body.segment_type).trim().toLowerCase() : 'outro';
      const segment_filter = body?.segment_filter && typeof body.segment_filter === 'object' ? body.segment_filter : {};
      const start_date = body?.start_date ? String(body.start_date).trim() : null;
      const end_date = body?.end_date ? String(body.end_date).trim() : null;
      const library_ids = Array.isArray(body?.library_ids) ? body.library_ids.filter(isUuid).slice(0, 20) : [];

      if (!name) return bad(res, 'invalid_name');
      if(library_ids.length && (await getPool().query("SELECT id FROM crm_commercial_library WHERE id=ANY($1::uuid[]) AND status='aprovado'",[library_ids])).rows.length!==library_ids.length)return bad(res,'library_must_be_approved');
      if (!['setor','cidade','tipo_empresa','campanha','origem','responsavel','outro'].includes(segment_type)) return bad(res, 'invalid_segment_type');
      if (start_date && isNaN(Date.parse(start_date))) return bad(res, 'invalid_start_date');
      if (end_date && isNaN(Date.parse(end_date))) return bad(res, 'invalid_end_date');
      if (start_date && end_date && new Date(end_date) < new Date(start_date)) return bad(res, 'invalid_date_range');

      try {
        const pool = scopedPool(session);
        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_campaigns (id, name, description, segment_type, segment_filter, status, start_date, end_date, library_ids, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5::jsonb,'rascunho',$6,$7,$8::jsonb,$9,$10) RETURNING *`,
          [id, name, description, segment_type, JSON.stringify(segment_filter), start_date, end_date, JSON.stringify(library_ids), session.role, session.identityId || null]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_campaign_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 201, { campaign: ins.rows[0] });
      } catch (e) {
        console.error('campaign create failed', e);
        return json(res, 503, { error: 'campaign_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleCampaignById(req, res, id) {
    if (!isUuid(id)) return bad(res, 'invalid_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session?.identityId) return json(res,401,{error:'admin_session_required'});
    if(!['admin','marcelo','ti','comercial'].includes(session.role))return json(res,403,{error:'role_required'});
    if(req.method!=='GET'&&session.role==='comercial')return json(res,403,{error:'management_role_required'});

    if (req.method === 'GET') {
      try {
        const pool = scopedPool(session);
        const r = await pool.query('SELECT * FROM crm_campaigns WHERE id = $1', [id]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        const targetsRes = await pool.query('SELECT * FROM crm_campaign_targets WHERE campaign_id = $1 ORDER BY created_at DESC LIMIT 100', [id]);
        return json(res, 200, { campaign: r.rows[0], targets: targetsRes.rows });
      } catch {
        return json(res, 503, { error: 'campaign_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body; try { body = await readJson(req, 30 * 1024); } catch { return bad(res, 'invalid_json'); }
      const fields = []; const vals = []; let idx = 1;
      if (body?.name !== undefined) { const n = sanitizeText(body.name, 200); if (!n) return bad(res, 'invalid_name'); fields.push(`name = $${idx++}`); vals.push(n); }
      if (body?.description !== undefined) { const d = sanitizeText(body.description, 2000); fields.push(`description = $${idx++}`); vals.push(d); }
      if (body?.segment_filter !== undefined) {
        if (typeof body.segment_filter !== 'object') return bad(res, 'invalid_segment_filter');
        fields.push(`segment_filter = $${idx++}::jsonb`); vals.push(JSON.stringify(body.segment_filter));
      }
      if (body?.library_ids !== undefined) {
        if (!Array.isArray(body.library_ids)) return bad(res, 'invalid_library_ids');
        const libs = body.library_ids.filter(isUuid).slice(0, 20);
        if(libs.length && (await getPool().query("SELECT id FROM crm_commercial_library WHERE id=ANY($1::uuid[]) AND status='aprovado'",[libs])).rows.length!==libs.length)return bad(res,'library_must_be_approved');
        fields.push(`library_ids = $${idx++}::jsonb`); vals.push(JSON.stringify(libs));
      }
      if (body?.status !== undefined) {
        const st = String(body.status).trim().toLowerCase();
        if (!['rascunho','ativa','pausada','encerrada','cancelada'].includes(st)) return bad(res, 'invalid_status');
        if(st==='ativa'){
          const current=(await getPool().query('SELECT library_ids FROM crm_campaigns WHERE id=$1',[id])).rows[0];
          if(!current)return json(res,404,{error:'not_found'});
          const libs=body.library_ids||current.library_ids||[];
          if(libs.length&&(await getPool().query("SELECT id FROM crm_commercial_library WHERE id=ANY($1::uuid[]) AND status='aprovado'",[libs])).rows.length!==libs.length)return bad(res,'library_must_be_approved');
        }
        fields.push(`status = $${idx++}`); vals.push(st);
      }
      if (body?.start_date !== undefined) { const sd = body.start_date ? String(body.start_date).trim() : null; if (sd && isNaN(Date.parse(sd))) return bad(res, 'invalid_start_date'); fields.push(`start_date = $${idx++}`); vals.push(sd); }
      if (body?.end_date !== undefined) { const ed = body.end_date ? String(body.end_date).trim() : null; if (ed && isNaN(Date.parse(ed))) return bad(res, 'invalid_end_date'); fields.push(`end_date = $${idx++}`); vals.push(ed); }

      if (fields.length === 0) return bad(res, 'no_fields');
      fields.push(`updated_at = NOW()`);

      try {
        const pool = scopedPool(session);
        const upd = await pool.query(`UPDATE crm_campaigns SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, [...vals, id]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_campaign_status',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 200, { campaign: upd.rows[0] });
      } catch {
        return json(res, 503, { error: 'campaign_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  async function handleCampaignTargets(req, res, campaignId) {
    if (!isUuid(campaignId)) return bad(res, 'invalid_campaign_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session?.identityId) return json(res,401,{error:'admin_session_required'});
    if(!['admin','marcelo','ti','comercial'].includes(session.role))return json(res,403,{error:'role_required'});
    if(req.method!=='GET'&&session.role==='comercial')return json(res,403,{error:'management_role_required'});

    if (req.method === 'GET') {
      try {
        const pool = scopedPool(session);
        const r = await pool.query('SELECT * FROM crm_campaign_targets WHERE campaign_id = $1 ORDER BY created_at DESC LIMIT 200', [campaignId]);
        return json(res, 200, { targets: r.rows });
      } catch {
        return json(res, 503, { error: 'targets_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 20 * 1024); } catch { return bad(res, 'invalid_json'); }
      const company_id = body?.company_id ? String(body.company_id).trim() : null;
      const contact_id = body?.contact_id ? String(body.contact_id).trim() : null;
      if (company_id && !isUuid(company_id)) return bad(res, 'invalid_company_id');
      if (contact_id && !isUuid(contact_id)) return bad(res, 'invalid_contact_id');
      if (!company_id && !contact_id) return bad(res, 'company_or_contact_required');

      try {
        const pool = scopedPool(session);
        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_campaign_targets (id, campaign_id, company_id, contact_id, status) VALUES ($1,$2,$3,$4,'pendente') ON CONFLICT (campaign_id, company_id, contact_id) DO NOTHING RETURNING *`,
          [id, campaignId, company_id, contact_id]
        );
        if (!ins.rows[0]) return json(res, 200, { target: null, note: 'Já existe alvo para campanha+empresa+contato (idempotente)' });
        return json(res, 201, { target: ins.rows[0] });
      } catch (e) {
        return json(res, 503, { error: 'target_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  // Proposal Comparisons
  async function handleComparisons(req, res, url) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session?.identityId) return json(res,401,{error:'admin_session_required'});
    if(!['admin','marcelo','ti','comercial'].includes(session.role))return json(res,403,{error:'role_required'});
    if(req.method!=='GET'&&session.role==='comercial')return json(res,403,{error:'management_role_required'});

    if (req.method === 'GET') {
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
      try {
        const pool = scopedPool(session);
        const listRes = await pool.query('SELECT * FROM crm_proposal_comparisons ORDER BY created_at DESC LIMIT $1', [limit]);
        return json(res, 200, { comparisons: listRes.rows });
      } catch {
        return json(res, 503, { error: 'comparisons_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body; try { body = await readJson(req, 50 * 1024); } catch { return bad(res, 'invalid_json'); }
      const title = sanitizeText(body?.title, 200);
      const proposal_ids = Array.isArray(body?.proposal_ids) ? body.proposal_ids.filter(isUuid) : [];
      const notes = sanitizeText(body?.notes, 2000);

      if (!title) return bad(res, 'invalid_title');
      if (proposal_ids.length < 2 || proposal_ids.length > 5) return bad(res, 'proposal_ids_must_be_2_to_5');

      try {
        const pool = scopedPool(session);
        // Buscar propostas
        const placeholders = proposal_ids.map((_, i) => `$${i+1}`).join(',');
        const propsRes = await pool.query(`SELECT id, title, status, version, total_cost, total_price, margin_percent, scope_description, validity_days FROM crm_proposals WHERE id IN (${placeholders})`, proposal_ids);
        if (propsRes.rows.length !== proposal_ids.length) return json(res, 404, { error: 'some_proposals_not_found', found: propsRes.rows.length, requested: proposal_ids.length });

        // Buscar itens de cada proposta na versão atual
        const comparisonData = { proposals: [] };
        for (const prop of propsRes.rows) {
          const itemsRes = await pool.query('SELECT type, description, quantity, unit, unit_cost, total_cost, unit_price, total_price, recurrence_type FROM crm_proposal_items WHERE proposal_id = $1 AND proposal_version = $2 ORDER BY created_at', [prop.id, prop.version]);
          comparisonData.proposals.push({
            id: prop.id,
            title: prop.title,
            status: prop.status,
            version: prop.version,
            total_cost: prop.total_cost,
            total_price: prop.total_price,
            margin_percent: prop.margin_percent,
            validity_days: prop.validity_days,
            scope_description: prop.scope_description ? prop.scope_description.slice(0, 500) : null,
            items: itemsRes.rows,
            items_count: itemsRes.rows.length,
          });
        }

        // Calcular diferenças
        const prices = comparisonData.proposals.map((p) => Number(p.total_price || 0));
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        comparisonData.summary = {
          min_price: minPrice,
          max_price: maxPrice,
          price_range: maxPrice - minPrice,
          count: comparisonData.proposals.length,
        };

        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_proposal_comparisons (id, title, proposal_ids, comparison_data, notes, created_by, created_by_id)
           VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6,$7) RETURNING *`,
          [id, title, JSON.stringify(proposal_ids), JSON.stringify(comparisonData), notes, session.role, session.identityId || null]
        );

        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_proposal_comparison_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}

        return json(res, 201, { comparison: ins.rows[0], note: 'Comparação de propostas lado a lado com custos, preços, margem, escopo e itens.' });
      } catch (e) {
        console.error('comparison create failed', e);
        return json(res, 503, { error: 'comparison_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleComparisonById(req, res, id) {
    if (!isUuid(id)) return bad(res, 'invalid_id');
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session?.identityId) return json(res,401,{error:'admin_session_required'});
    if(!['admin','marcelo','ti','comercial'].includes(session.role))return json(res,403,{error:'role_required'});
    if(req.method!=='GET'&&session.role==='comercial')return json(res,403,{error:'management_role_required'});

    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });

    try {
      const pool = scopedPool(session);
      const r = await pool.query('SELECT * FROM crm_proposal_comparisons WHERE id = $1', [id]);
      if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
      return json(res, 200, { comparison: r.rows[0] });
    } catch {
      return json(res, 503, { error: 'comparison_unavailable' });
    }
  }

  return {
    handleLibrary,
    handleLibraryById,
    handleCampaigns,
    handleCampaignById,
    handleCampaignTargets,
    handleComparisons,
    handleComparisonById,
  };
}
