export function createNotificationPreferencesApi({ json, readJson, sameOrigin, getPool, readAdminSession }) {
  const CHANNELS = ['email','whatsapp','sms','push','webhook','internal','sistema'];
  const RECIPIENT_KINDS = ['client','staff','lead','system','marcelo','ti','admin','rh'];
  const TEMPLATE_STATUSES = ['rascunho','em_revisao','aprovado','arquivado','rejeitado'];

  function sanitizeText(s, max) {
    if (s == null) return null;
    if (typeof s !== 'string') return null;
    const t = s.trim();
    if (t.length === 0) return null;
    if (t.length > max) return null;
    return t;
  }

  function containsMedicalInfo(text) {
    if (!text) return false;
    const lower = text.toLowerCase();
    const medicalTerms = ['prontuario','prontuário','diagnostico','diagnóstico','cid ','doença','sintoma','exame médico','atestado médico','receita médica','medicação','medicamento','tratamento médico','laudo','histórico médico','histórico clínico'];
    for (const term of medicalTerms) {
      if (lower.includes(term)) return true;
    }
    // Check for CPF-like patterns in subject (should not have medical)
    if (lower.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/)) return true;
    return false;
  }

  async function handlePreferences(req, res) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const recipientKind = url.searchParams.get('recipientKind') || url.searchParams.get('recipient_kind');
        const recipientId = url.searchParams.get('recipientId') || url.searchParams.get('recipient_id');
        let q = 'SELECT * FROM crm_notification_preferences ORDER BY recipient_kind, channel';
        let vals = [];
        if (recipientKind) {
          if (!RECIPIENT_KINDS.includes(recipientKind)) return json(res, 400, { error: 'invalid_recipient_kind' });
          q = 'SELECT * FROM crm_notification_preferences WHERE recipient_kind = $1 ORDER BY channel';
          vals = [recipientKind];
          if (recipientId) {
            q = 'SELECT * FROM crm_notification_preferences WHERE recipient_kind = $1 AND recipient_id = $2 ORDER BY channel';
            vals = [recipientKind, recipientId];
          }
        }
        const r = await pool.query(q, vals);
        return json(res, 200, { preferences: r.rows, note: 'Preferências por canal: painel, e-mail, externos, com quiet hours, sem info médica em assunto/push' });
      } catch (e) {
        console.error('prefs list failed', e);
        return json(res, 503, { error: 'preferences_unavailable' });
      }
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      let body;
      try { body = await readJson(req, 10 * 1024); } catch { return json(res, 400, { error: 'invalid_json' }); }
      const recipient_kind = String(body?.recipient_kind || body?.recipientKind || '').toLowerCase();
      const recipient_id = body?.recipient_id || body?.recipientId || null;
      const recipient_email = sanitizeText(body?.recipient_email || body?.recipientEmail, 320);
      const channel = String(body?.channel || '').toLowerCase();
      const is_enabled = body?.is_enabled ?? body?.isEnabled ?? true;
      const is_email_enabled = body?.is_email_enabled ?? body?.isEmailEnabled ?? true;
      const is_push_enabled = body?.is_push_enabled ?? body?.isPushEnabled ?? true;
      const is_whatsapp_enabled = body?.is_whatsapp_enabled ?? body?.isWhatsappEnabled ?? false;
      const is_sms_enabled = body?.is_sms_enabled ?? body?.isSmsEnabled ?? false;
      const is_internal_enabled = body?.is_internal_enabled ?? body?.isInternalEnabled ?? true;
      const quiet_start = body?.quiet_hours_start || body?.quietHoursStart || null;
      const quiet_end = body?.quiet_hours_end || body?.quietHoursEnd || null;

      if (!RECIPIENT_KINDS.includes(recipient_kind)) return json(res, 400, { error: 'invalid_recipient_kind' });
      if (!CHANNELS.includes(channel)) return json(res, 400, { error: 'invalid_channel' });
      if (recipient_id && typeof recipient_id !== 'string') return json(res, 400, { error: 'invalid_recipient_id' });

      try {
        const pool = getPool();
        const id = crypto.randomUUID();
        const up = await pool.query(
          `INSERT INTO crm_notification_preferences
            (id, recipient_kind, recipient_id, recipient_email, channel, is_enabled, is_email_enabled, is_push_enabled, is_whatsapp_enabled, is_sms_enabled, is_internal_enabled, quiet_hours_start, quiet_hours_end, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (recipient_kind, recipient_id, channel) DO UPDATE SET
             recipient_email = COALESCE(EXCLUDED.recipient_email, crm_notification_preferences.recipient_email),
             is_enabled = EXCLUDED.is_enabled,
             is_email_enabled = EXCLUDED.is_email_enabled,
             is_push_enabled = EXCLUDED.is_push_enabled,
             is_whatsapp_enabled = EXCLUDED.is_whatsapp_enabled,
             is_sms_enabled = EXCLUDED.is_sms_enabled,
             is_internal_enabled = EXCLUDED.is_internal_enabled,
             quiet_hours_start = EXCLUDED.quiet_hours_start,
             quiet_hours_end = EXCLUDED.quiet_hours_end,
             updated_at = NOW()
           RETURNING *`,
          [id, recipient_kind, recipient_id, recipient_email, channel, !!is_enabled, !!is_email_enabled, !!is_push_enabled, !!is_whatsapp_enabled, !!is_sms_enabled, !!is_internal_enabled, quiet_start, quiet_end, session.role, session.identityId || null]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_notification_preference_update',$3,'allowed','none')", [session.role, session.identityId || session.role, up.rows[0].id]); } catch {}
        return json(res, 200, { preference: up.rows[0], note: 'Preferência atualizada por canal sem info médica' });
      } catch (e) {
        console.error('prefs upsert failed', e);
        return json(res, 503, { error: 'preference_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST, PUT' });
  }

  async function handleTemplates(req, res) {
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const channel = url.searchParams.get('channel');
        const status = url.searchParams.get('status');
        const search = url.searchParams.get('search') || url.searchParams.get('q');
        let conds = [];
        let vals = [];
        let idx = 1;
        if (channel) {
          if (!CHANNELS.includes(channel)) return json(res, 400, { error: 'invalid_channel' });
          conds.push(`channel = $${idx++}`);
          vals.push(channel);
        }
        if (status) {
          if (!TEMPLATE_STATUSES.includes(status)) return json(res, 400, { error: 'invalid_status' });
          conds.push(`status = $${idx++}`);
          vals.push(status);
        }
        if (search) {
          const s = sanitizeText(search, 100);
          if (!s) return json(res, 400, { error: 'invalid_search' });
          conds.push(`(template_key ILIKE $${idx} OR subject ILIKE $${idx} OR body ILIKE $${idx})`);
          vals.push(`%${s}%`);
          idx++;
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const r = await pool.query(`SELECT * FROM crm_notification_templates ${where} ORDER BY template_key, channel, version DESC LIMIT 200`, vals);
        return json(res, 200, { templates: r.rows, note: 'Templates revisados sem informação médica em assunto/push, is_medical_safe true' });
      } catch (e) {
        console.error('templates list failed', e);
        return json(res, 503, { error: 'templates_unavailable' });
      }
    }

    if (req.method === 'POST') {
      let body;
      try { body = await readJson(req, 15 * 1024); } catch { return json(res, 400, { error: 'invalid_json' }); }
      const template_key = sanitizeText(body?.template_key || body?.templateKey, 100);
      const channel = String(body?.channel || '').toLowerCase();
      const subject = sanitizeText(body?.subject, 200);
      const bodyText = sanitizeText(body?.body, 5000);
      const status = body?.status ? String(body.status).toLowerCase() : 'rascunho';
      const medical_review_note = sanitizeText(body?.medical_review_note || body?.medicalReviewNote, 1000);

      if (!template_key) return json(res, 400, { error: 'invalid_template_key' });
      if (!CHANNELS.includes(channel)) return json(res, 400, { error: 'invalid_channel' });
      if (!bodyText) return json(res, 400, { error: 'invalid_body' });
      if (!TEMPLATE_STATUSES.includes(status)) return json(res, 400, { error: 'invalid_status' });

      // Validação crítica PLT-05: nenhuma informação médica em assunto/push
      const isMedicalSafe = !containsMedicalInfo(subject) && !containsMedicalInfo(bodyText);
      if (!isMedicalSafe) {
        // Se canal push ou email subject contém médica, bloquear
        if (channel === 'push' || (subject && containsMedicalInfo(subject))) {
          return json(res, 400, { error: 'medical_info_not_allowed_in_subject_push', detail: 'Nenhuma informação médica em assunto/push (PLT-05). Remova prontuário, diagnóstico, CID, etc.' });
        }
      }

      try {
        const pool = getPool();
        // version increment
        const verRes = await pool.query('SELECT COALESCE(MAX(version),0)::int AS maxv FROM crm_notification_templates WHERE template_key = $1 AND channel = $2', [template_key, channel]);
        const nextVersion = (verRes.rows[0]?.maxv || 0) + 1;
        const id = crypto.randomUUID();
        const ins = await pool.query(
          `INSERT INTO crm_notification_templates
            (id, template_key, channel, subject, body, is_medical_safe, status, version, medical_review_note, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [id, template_key, channel, subject, bodyText, isMedicalSafe, status, nextVersion, medical_review_note, session.role, session.identityId || null]
        );
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,'crm_notification_template_create',$3,'allowed','none')", [session.role, session.identityId || session.role, id]); } catch {}
        return json(res, 201, { template: ins.rows[0], note: 'Template criado com verificação médica segura, sem info médica em assunto/push' });
      } catch (e) {
        console.error('template create failed', e);
        return json(res, 503, { error: 'template_create_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
  }

  async function handleTemplateById(req, res, templateId) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(templateId)) return json(res, 400, { error: 'invalid_template_id' });
    if (!sameOrigin(req)) return json(res, 403, { error: 'same_origin_required' });
    const session = await readAdminSession(req);
    if (!session) return json(res, 401, { error: 'admin_session_required' });

    if (req.method === 'GET') {
      try {
        const pool = getPool();
        const r = await pool.query('SELECT * FROM crm_notification_templates WHERE id = $1', [templateId]);
        if (!r.rows[0]) return json(res, 404, { error: 'not_found' });
        return json(res, 200, { template: r.rows[0] });
      } catch {
        return json(res, 503, { error: 'template_unavailable' });
      }
    }

    if (req.method === 'PATCH') {
      let body;
      try { body = await readJson(req, 10 * 1024); } catch { return json(res, 400, { error: 'invalid_json' }); }
      const fields = []; const vals = []; let idx = 1;
      if (body?.subject !== undefined) {
        const s = sanitizeText(body.subject, 200);
        if (s !== null && containsMedicalInfo(s)) return json(res, 400, { error: 'medical_info_not_allowed_in_subject' });
        fields.push(`subject = $${idx++}`); vals.push(s);
      }
      if (body?.body !== undefined) {
        const b = sanitizeText(body.body, 5000);
        if (!b) return json(res, 400, { error: 'invalid_body' });
        if (containsMedicalInfo(b) && (await getPool().then(async p => { const r = await p.query('SELECT channel FROM crm_notification_templates WHERE id = $1', [templateId]); return r.rows[0]?.channel === 'push'; }).catch(()=>false))) {
          return json(res, 400, { error: 'medical_info_not_allowed_in_push' });
        }
        const safe = !containsMedicalInfo(b);
        fields.push(`body = $${idx++}`); vals.push(b);
        fields.push(`is_medical_safe = $${idx++}`); vals.push(safe);
      }
      if (body?.status !== undefined) {
        const st = String(body.status).toLowerCase();
        if (!TEMPLATE_STATUSES.includes(st)) return json(res, 400, { error: 'invalid_status' });
        // Aprovação exige admin/ti
        if ((st === 'aprovado' || st === 'rejeitado') && !['admin','ti'].includes(session.role)) {
          return json(res, 403, { error: 'approval_requires_admin_ti' });
        }
        fields.push(`status = $${idx++}`); vals.push(st);
        if (st === 'aprovado') {
          fields.push(`approved_by = $${idx++}`); vals.push(session.role);
          fields.push(`approved_by_id = $${idx++}`); vals.push(session.identityId || null);
          fields.push(`approved_at = NOW()`);
        }
        if (st === 'rejeitado') {
          const reason = sanitizeText(body?.rejection_reason || body?.rejectionReason, 1000);
          if (!reason) return json(res, 400, { error: 'rejection_reason_required' });
          fields.push(`rejection_reason = $${idx++}`); vals.push(reason);
        }
      }
      if (body?.medical_review_note !== undefined || body?.medicalReviewNote !== undefined) {
        const note = sanitizeText(body.medical_review_note || body.medicalReviewNote, 1000);
        fields.push(`medical_review_note = $${idx++}`); vals.push(note);
      }
      if (fields.length === 0) return json(res, 400, { error: 'no_fields' });
      fields.push(`updated_at = NOW()`);
      try {
        const pool = getPool();
        const upd = await pool.query(`UPDATE crm_notification_templates SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, [...vals, templateId]);
        if (!upd.rows[0]) return json(res, 404, { error: 'not_found' });
        const action = upd.rows[0].status === 'aprovado' ? 'crm_notification_template_approve' : upd.rows[0].status === 'rejeitado' ? 'crm_notification_template_reject' : 'crm_notification_template_update';
        try { await pool.query("INSERT INTO auth_access_audit (actor_kind, actor_id, action, target, result, detail_category) VALUES ($1,$2,$3,$4,'allowed','none')", [session.role, session.identityId || session.role, action, templateId]); } catch {}
        return json(res, 200, { template: upd.rows[0] });
      } catch (e) {
        console.error('template update failed', e);
        return json(res, 503, { error: 'template_update_failed' });
      }
    }

    return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, PATCH' });
  }

  return { handlePreferences, handleTemplates, handleTemplateById, CHANNELS, RECIPIENT_KINDS };
}
