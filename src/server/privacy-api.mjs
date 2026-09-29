// PLT-09 política privacidade completa inventário dados finalidades bases destinatários prazos contatos direitos revisão competente
export function createPrivacyApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
  const DATA_CATEGORIES = ['identificacao','contato','localizacao','profissional','financeiro','tecnico','comportamental','sensivel','outro'];
  const LEGAL_BASES = ['consentimento','execucao_contrato','cumprimento_legal','legitimo_interesse','protecao_vida','tutela_saude','exercicio_direitos','protecao_credito','outro'];
  const POLICY_STATUSES = ['rascunho','em_revisao','aprovado','publicado','arquivado','rejeitado'];

  function sanitizeText(s, max) {
    if (s == null) return null;
    if (typeof s !== 'string') return null;
    const t = s.trim();
    if (t.length === 0) return null;
    if (t.length > max) return null;
    return t;
  }

  async function handleInventory(req, res) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const category = url.searchParams.get('category');
        const basis = url.searchParams.get('basis') || url.searchParams.get('legal_basis');
        const sensitive = url.searchParams.get('sensitive');
        let conds = []; let vals = []; let idx = 1;
        if (category) {
          if (!DATA_CATEGORIES.includes(category)) return json(res, 400, { error: 'invalid_category' });
          conds.push(`data_category = $${idx++}`); vals.push(category);
        }
        if (basis) {
          if (!LEGAL_BASES.includes(basis)) return json(res, 400, { error: 'invalid_legal_basis' });
          conds.push(`legal_basis = $${idx++}`); vals.push(basis);
        }
        if (sensitive === 'true') { conds.push(`is_sensitive = true`); }
        if (sensitive === 'false') { conds.push(`is_sensitive = false`); }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const r = await pool.query(`SELECT * FROM privacy_data_inventory ${where} ORDER BY data_category, data_field`, vals);
        return json(res, 200, { inventory: r.rows, note: 'Inventário dados/finalidades/bases/destinatários/prazos, sem segredos, minimização' });
      } catch (e) {
        console.error('privacy inventory list failed', e);
        return json(res, 503, { error: 'inventory_unavailable' });
      }
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      if (!['admin','ti'].includes(await readAdminSession(req)?.role)) return json(res, 403, { error: 'privacy_inventory_restricted_admin_ti' });
      let body;
      try { body = await readJson(req, 10 * 1024); } catch { return json(res, 400, { error: 'invalid_json' }); }
      const data_category = String(body?.data_category || body?.dataCategory || '').toLowerCase();
      const data_field = sanitizeText(body?.data_field || body?.dataField, 100);
      const description = sanitizeText(body?.description, 1000);
      const purpose = sanitizeText(body?.purpose, 1000);
      const legal_basis = String(body?.legal_basis || body?.legalBasis || '').toLowerCase();
      const legal_basis_detail = sanitizeText(body?.legal_basis_detail || body?.legalBasisDetail, 1000);
      const retention_days = body?.retention_days || body?.retentionDays;
      const retention_description = sanitizeText(body?.retention_description || body?.retentionDescription, 1000);
      const recipients = Array.isArray(body?.recipients) ? body.recipients.slice(0,20).map(r => String(r).slice(0,100)) : null;
      const is_sensitive = !!body?.is_sensitive || !!body?.isSensitive;
      const is_required = !!body?.is_required || !!body?.isRequired;
      const source = sanitizeText(body?.source, 200);

      if (!DATA_CATEGORIES.includes(data_category)) return json(res, 400, { error: 'invalid_data_category' });
      if (!data_field) return json(res, 400, { error: 'invalid_data_field' });
      if (!description) return json(res, 400, { error: 'invalid_description' });
      if (!purpose) return json(res, 400, { error: 'invalid_purpose' });
      if (!LEGAL_BASES.includes(legal_basis)) return json(res, 400, { error: 'invalid_legal_basis' });
      const ret = retention_days ? parseInt(retention_days, 10) : null;
      if (ret !== null && (isNaN(ret) || ret < 1 || ret > 3650)) return json(res, 400, { error: 'invalid_retention_days' });

      try {
        const pool = getPool();
        const session = await readAdminSession(req);
        const up = await pool.query(
          `INSERT INTO privacy_data_inventory (id, data_category, data_field, description, purpose, legal_basis, legal_basis_detail, retention_days, retention_description, recipients, is_sensitive, is_required, source, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (data_category, data_field) DO UPDATE SET
             description = EXCLUDED.description,
             purpose = EXCLUDED.purpose,
             legal_basis = EXCLUDED.legal_basis,
             legal_basis_detail = EXCLUDED.legal_basis_detail,
             retention_days = EXCLUDED.retention_days,
             retention_description = EXCLUDED.retention_description,
             recipients = EXCLUDED.recipients,
             is_sensitive = EXCLUDED.is_sensitive,
             is_required = EXCLUDED.is_required,
             source = EXCLUDED.source,
             updated_at = NOW()
           RETURNING *`,
          [crypto.randomUUID(), data_category, data_field, description, purpose, legal_basis, legal_basis_detail, ret, retention_description, recipients, is_sensitive, is_required, source, session.role, session.identityId || null]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'privacy_inventory_create',$3,'allowed','none')", [session.role, session.identityId || session.role, up.rows[0].id]); } catch {}
        return json(res, 200, { item: up.rows[0], note: 'Inventário atualizado com finalidade e base legal' });
      } catch (e) {
        console.error('privacy inventory upsert failed', e);
        return json(res, 503, { error: 'inventory_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST, PUT' });
  }

  async function handlePolicies(req, res) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const status = url.searchParams.get('status');
        const published = url.searchParams.get('published');
        let conds = []; let vals = []; let idx = 1;
        if (status) {
          if (!POLICY_STATUSES.includes(status)) return json(res, 400, { error: 'invalid_status' });
          conds.push(`status = $${idx++}`); vals.push(status);
        }
        if (published === 'true') conds.push(`is_published = true`);
        if (published === 'false') conds.push(`is_published = false`);
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const r = await pool.query(`SELECT * FROM privacy_policies ${where} ORDER BY version DESC LIMIT 50`, vals);
        // Include inventory snapshot for latest
        let inventory = [];
        try { const inv = await pool.query('SELECT * FROM privacy_data_inventory ORDER BY data_category, data_field'); inventory = inv.rows; } catch {}
        return json(res, 200, { policies: r.rows, inventory, note: 'Políticas privacidade com inventário dados/finalidades/bases/destinatários/prazos, revisão competente antes publicar, noindex até publicado' });
      } catch (e) {
        console.error('privacy policies list failed', e);
        return json(res, 503, { error: 'policies_unavailable' });
      }
    }

    if (req.method === 'POST') {
      if (!['admin','ti'].includes(session.role)) return json(res, 403, { error: 'privacy_policy_restricted_admin_ti' });
      let body;
      try { body = await readJson(req, 30 * 1024); } catch { return json(res, 400, { error: 'invalid_json' }); }
      const title = sanitizeText(body?.title, 200);
      const content = sanitizeText(body?.content, 20000);
      const contact_email = sanitizeText(body?.contact_email || body?.contactEmail, 320);
      const dpo_name = sanitizeText(body?.dpo_name || body?.dpoName, 200);
      const dpo_contact = sanitizeText(body?.dpo_contact || body?.dpoContact, 500);
      const retention_summary = sanitizeText(body?.retention_summary || body?.retentionSummary, 2000);
      const rights_description = sanitizeText(body?.rights_description || body?.rightsDescription, 2000);
      const recipients_description = sanitizeText(body?.recipients_description || body?.recipientsDescription, 2000);

      if (!title) return json(res, 400, { error: 'invalid_title' });
      if (!content) return json(res, 400, { error: 'invalid_content' });

      try {
        const pool = getPool();
        const verRes = await pool.query('SELECT COALESCE(MAX(version),0)::int AS maxv FROM privacy_policies');
        const nextVersion = (verRes.rows[0]?.maxv || 0) + 1;
        let inventorySnap = null;
        try { const inv = await pool.query('SELECT * FROM privacy_data_inventory ORDER BY data_category, data_field'); inventorySnap = inv.rows; } catch {}
        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO privacy_policies (id, version, status, title, content, inventory_snapshot, contact_email, dpo_name, dpo_contact, retention_summary, rights_description, recipients_description, created_by, created_by_id)
           VALUES ($1,$2,'rascunho',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          [id, nextVersion, title, content, inventorySnap ? JSON.stringify(inventorySnap) : null, contact_email, dpo_name, dpo_contact, retention_summary, rights_description, recipients_description, session.role, session.identityId || null]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'privacy_policy_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 201, { policy: ins.rows[0], note: 'Política criada rascunho, revisão competente necessária antes de publicar, noindex mantido' });
      } catch (e) {
        console.error('privacy policy create failed', e);
        return json(res, 503, { error: 'policy_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handlePolicyById(req, res, policyId) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(policyId)) return json(res, 400, { error: 'invalid_policy_id' });
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM privacy_policies WHERE id = $1', [policyId]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        return json(res, 200, { policy: r.rows[0] });
      } catch {
        return json(res, 503, { error: 'policy_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      if (!['admin','ti'].includes(session.role)) return json(res, 403, { error: 'privacy_policy_restricted' });
      let body;
      try { body = await readJson(req, 15 * 1024); } catch { return json(res, 400, { error: 'invalid_json' }); }
      const fields = []; const vals = []; let idx = 1;
      if (body?.title !== undefined) { const t = sanitizeText(body.title, 200); if (!t) return json(res, 400, { error: 'invalid_title' }); fields.push(`title = $${idx++}`); vals.push(t); }
      if (body?.content !== undefined) { const c = sanitizeText(body.content, 20000); if (!c) return json(res, 400, { error: 'invalid_content' }); fields.push(`content = $${idx++}`); vals.push(c); }
      if (body?.contact_email !== undefined) { const ce = sanitizeText(body.contact_email, 320); fields.push(`contact_email = $${idx++}`); vals.push(ce); }
      if (body?.dpo_name !== undefined) { const dn = sanitizeText(body.dpo_name, 200); fields.push(`dpo_name = $${idx++}`); vals.push(dn); }
      if (body?.dpo_contact !== undefined) { const dc = sanitizeText(body.dpo_contact, 500); fields.push(`dpo_contact = $${idx++}`); vals.push(dc); }
      if (body?.retention_summary !== undefined) { const rs = sanitizeText(body.retention_summary, 2000); fields.push(`retention_summary = $${idx++}`); vals.push(rs); }
      if (body?.rights_description !== undefined) { const rd = sanitizeText(body.rights_description, 2000); fields.push(`rights_description = $${idx++}`); vals.push(rd); }
      if (body?.recipients_description !== undefined) { const rec = sanitizeText(body.recipients_description, 2000); fields.push(`recipients_description = $${idx++}`); vals.push(rec); }
      if (body?.status !== undefined) {
        const st = String(body.status).toLowerCase();
        if (!POLICY_STATUSES.includes(st)) return json(res, 400, { error: 'invalid_status' });
        // Approval requires admin
        if ((st === 'aprovado' || st === 'publicado') && session.role !== 'admin') {
          return json(res, 403, { error: 'approval_requires_admin', detail: 'Revisão competente antes de publicar (PLT-09) exige admin' });
        }
        fields.push(`status = $${idx++}`); vals.push(st);
        if (st === 'aprovado') {
          fields.push(`approved_by = $${idx++}`); vals.push(session.role);
          fields.push(`approved_by_id = $${idx++}`); vals.push(session.identityId || null);
          fields.push(`approved_at = NOW()`);
        }
        if (st === 'publicado') {
          // Must have been approved before
          try {
            const pool = getPool();
            const cur = await pool.query('SELECT status FROM privacy_policies WHERE id = $1', [policyId]);
            if (cur.rows[0]?.status !== 'aprovado') {
              return json(res, 400, { error: 'must_be_approved_before_publish', detail: 'Política deve ser aprovada por admin antes de publicar' });
            }
          } catch {}
          fields.push(`is_published = true`);
          fields.push(`published_at = NOW()`);
        }
        if (st === 'rejeitado') {
          const reason = sanitizeText(body?.rejection_reason || body?.rejectionReason, 1000);
          if (!reason) return json(res, 400, { error: 'rejection_reason_required' });
          fields.push(`rejection_reason = $${idx++}`); vals.push(reason);
        }
      }
      if (fields.length === 0) return json(res, 400, { error: 'no_fields' });
      fields.push(`updated_at = NOW()`);
      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE privacy_policies SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, [...vals, policyId]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        const action = upd.rows[0].status === 'aprovado' ? 'privacy_policy_approve' : upd.rows[0].status === 'publicado' ? 'privacy_policy_publish' : upd.rows[0].status === 'rejeitado' ? 'privacy_policy_reject' : 'privacy_policy_update';
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,'allowed','none')", [session.role, session.identityId || session.role, action, policyId]); } catch {}
        return json(res, 200, { policy: upd.rows[0], note: upd.rows[0].is_published ? 'Política publicada, noindex pode ser removido em produção após revisão' : 'Política atualizada, revisão competente necessária antes de publicar' });
      } catch (e) {
        console.error('policy update failed', e);
        return json(res, 503, { error: 'policy_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  return { handleInventory, handlePolicies, handlePolicyById, DATA_CATEGORIES, LEGAL_BASES };
}
