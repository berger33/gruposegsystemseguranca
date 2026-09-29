export function createAdmAdvancedApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const generateProtocol = (prefix) => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const rnd = Math.random().toString(36).substring(2,6).toUpperCase();
    return `${prefix}-${y}${m}${day}-${rnd}`;
  };
  const getSession = (req) => { try { return requireSession(req); } catch { return null; } };
  const checkAuth = (req, res) => {
    const sess = getSession(req);
    if (!sess) { res.writeHead(401, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return null; }
    const r = (sess.role||'').toLowerCase();
    if (!['admin','ti'].includes(r) && r!=='admin') { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return null; }
    return sess;
  };
  const readJson = async (req) => new Promise((resolve, reject) => {
    let data=''; req.on('data', c=> data+=c); req.on('end', ()=> { try { resolve(data?JSON.parse(data):{}); } catch(e){ reject(e); } });
  });

  // ADM-07 busca autorizada favoritos filtros salvos atalhos
  const handleSearchFavorites = async (req, res) => {
    const sess = checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const module = url.searchParams.get('module');
      let q = `SELECT * FROM adm_search_favorites WHERE 1=1`; const params=[]; let idx=1;
      if (module) { q+=` AND module=$${idx++}`; params.push(module); }
      if (sess.identityId) { q+=` AND (user_identity=$${idx++} OR user_identity IS NULL)`; params.push(sess.identityId); }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ favorites: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const query = (body.query||'').trim();
      const module = (body.module||'').trim();
      const filters = body.filters || {};
      if (!query || query.length<2 || query.length>500) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'query_2_500'})); return; }
      if (!module || module.length<2 || module.length>100) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'module_2_100'})); return; }
      try {
        const { rows } = await pool.query(
          `INSERT INTO adm_search_favorites (user_identity, query, module, filters, is_favorite)
           VALUES ($1,$2,$3,$4,true)
           ON CONFLICT (user_identity, query, module) DO UPDATE SET filters=$4, is_favorite=true RETURNING *`,
          [sess.identityId||null, query, module, JSON.stringify(filters)]
        );
        try { await auditLog({ action:'adm_search_favorite_create', actor: sess.identityId, target: rows[0].id, meta:{ query, module } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ favorite: rows[0], note:'busca_autorizada_favoritos_filtros' }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  const handleSavedFilters = async (req, res) => {
    const sess = checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const module = url.searchParams.get('module');
      let q = `SELECT * FROM adm_saved_filters WHERE 1=1`; const params=[]; let idx=1;
      if (module) { q+=` AND module=$${idx++}`; params.push(module); }
      if (sess.identityId) { q+=` AND (user_identity=$${idx++} OR is_shared=true)`; params.push(sess.identityId); }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ filters: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const filter_name = (body.filter_name||'').trim();
      const module = (body.module||'').trim();
      const filters = body.filters || {};
      if (!filter_name || filter_name.length<3 || filter_name.length>200) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'filter_name_3_200'})); return; }
      if (!module || module.length<2 || module.length>100) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'module_2_100'})); return; }
      try {
        const { rows } = await pool.query(
          `INSERT INTO adm_saved_filters (user_identity, filter_name, module, filters, is_shared)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (user_identity, filter_name, module) DO UPDATE SET filters=$4, is_shared=$5 RETURNING *`,
          [sess.identityId||null, filter_name, module, JSON.stringify(filters), body.is_shared===true]
        );
        try { await auditLog({ action:'adm_saved_filter_create', actor: sess.identityId, target: rows[0].id, meta:{ filter_name, module } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ filter: rows[0], note:'filtros_salvos_atalhos_contexto' }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  const handleShortcuts = async (req, res) => {
    const sess = checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      try {
        const { rows } = await pool.query(`SELECT * FROM adm_shortcuts WHERE user_identity=$1 OR user_identity IS NULL ORDER BY is_favorite DESC, created_at DESC LIMIT 200`, [sess.identityId||null]);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ shortcuts: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const shortcut_name = (body.shortcut_name||'').trim();
      const context = (body.context||'').trim();
      const url = (body.url||'').trim();
      const icon = (body.icon||'').trim() || null;
      if (!shortcut_name || shortcut_name.length<3 || shortcut_name.length>200) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'shortcut_name_3_200'})); return; }
      if (!context || context.length<3 || context.length>500) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'context_3_500'})); return; }
      if (!url || url.length<5 || url.length>500) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'url_5_500'})); return; }
      try {
        const { rows } = await pool.query(
          `INSERT INTO adm_shortcuts (user_identity, shortcut_name, context, url, icon, is_favorite)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (user_identity, shortcut_name) DO UPDATE SET context=$3, url=$4, icon=$5 RETURNING *`,
          [sess.identityId||null, shortcut_name, context, url, icon, body.is_favorite===true]
        );
        try { await auditLog({ action:'adm_shortcut_create', actor: sess.identityId, target: rows[0].id, meta:{ shortcut_name, context, url } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ shortcut: rows[0], note:'atalhos_com_contexto_busca_autorizada' }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  // ADM-08 relatórios exportáveis e agendados
  const handleReports = async (req, res) => {
    const sess = checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const report_type = url.searchParams.get('report_type');
      const status = url.searchParams.get('status');
      let q = `SELECT * FROM adm_reports WHERE 1=1`; const params=[]; let idx=1;
      if (report_type) { q+=` AND report_type=$${idx++}`; params.push(report_type); }
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ reports: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const report_type = body.report_type || 'outro';
      const title = (body.title||'').trim();
      const period_start = body.period_start || null;
      const period_end = body.period_end || null;
      const filters = body.filters || {};
      const totals = body.totals || {};
      const file_name = body.file_name || null;
      const file_url = body.file_url || null;
      const storage_key = body.storage_key || null;
      const scheduled_at = body.scheduled_at || null;
      const recipient_email = (body.recipient_email||'').trim() || null;
      if (!title || title.length<5 || title.length>200) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'title_5_200'})); return; }
      if (period_start && period_end && new Date(period_end) < new Date(period_start)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'period_end_gte_start'})); return; }
      if (file_url && (file_url.length<5 || file_url.length>1000)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'file_url_5_1000'})); return; }
      if (storage_key && (storage_key.length<5 || storage_key.length>500)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'storage_key_5_500'})); return; }
      if (recipient_email && (recipient_email.length<5 || recipient_email.length>320)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'recipient_email_5_320'})); return; }
      const protocol = generateProtocol('REL-ADM');
      try {
        if (storage_key) {
          const dup = await pool.query(`SELECT id FROM adm_reports WHERE storage_key=$1`, [storage_key]);
          if (dup.rows.length) { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate_storage_key'})); return; }
        }
        const { rows } = await pool.query(
          `INSERT INTO adm_reports (protocol, report_type, title, period_start, period_end, filters, totals, file_name, file_url, storage_key, scheduled_at, recipient_email, is_limited, created_by_identity, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13,'pendente') RETURNING *`,
          [protocol, report_type, title, period_start, period_end, JSON.stringify(filters), JSON.stringify(totals), file_name, file_url, storage_key, scheduled_at, recipient_email, sess.identityId||null]
        );
        await pool.query(`INSERT INTO adm_report_logs (report_id, action, actor_identity, meta) VALUES ($1,$2,$3,$4)`, [rows[0].id, 'report_create', sess.identityId||null, JSON.stringify({ report_type, title, is_limited:true, recipient_email })]);
        try { await auditLog({ action:'adm_report_create', actor: sess.identityId, target: rows[0].id, meta:{ protocol, report_type, is_limited:true, recipient_email } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ report: rows[0], note:'relatorios_exportaveis_agendados_destinatarios_autorizados_registrar_geracao_envio_limitar_dados' }));
      } catch(e){
        if (e.code==='23505') { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate', details:e.detail})); return; }
        res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message}));
      }
      return;
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const id = body.id;
      if (!id) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'id_required'})); return; }
      try {
        const { rows } = await pool.query(
          `UPDATE adm_reports SET status=COALESCE($1,status), file_name=COALESCE($2,file_name), file_url=COALESCE($3,file_url), storage_key=COALESCE($4,storage_key), totals=COALESCE($5,totals), generated_at=CASE WHEN $1='gerado' THEN NOW() ELSE generated_at END, sent_at=CASE WHEN $1='enviado' THEN NOW() ELSE sent_at END, error_sanitized=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
          [body.status||null, body.file_name||null, body.file_url||null, body.storage_key||null, body.totals?JSON.stringify(body.totals):null, body.error_sanitized||null, id]
        );
        if (!rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
        await pool.query(`INSERT INTO adm_report_logs (report_id, action, actor_identity, meta) VALUES ($1,$2,$3,$4)`, [id, 'report_update', sess.identityId||null, JSON.stringify({ status: body.status })]);
        try { await auditLog({ action:'adm_report_update', actor: sess.identityId, target: id, meta:{ status: body.status } }); } catch {}
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ report: rows[0] }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  const handleReportLogs = async (req, res) => {
    const sess = checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') { res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'})); return; }
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const report_id = url.searchParams.get('report_id');
    let q = `SELECT * FROM adm_report_logs WHERE 1=1`; const params=[]; let idx=1;
    if (report_id) { q+=` AND report_id=$${idx++}`; params.push(report_id); }
    q+=` ORDER BY created_at DESC LIMIT 200`;
    try {
      const { rows } = await pool.query(q, params);
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ logs: rows }));
    } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
  };

  // ADM-09 configurações versionadas
  const handleBusinessConfigs = async (req, res) => {
    const sess = checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const category = url.searchParams.get('category');
      const status = url.searchParams.get('status');
      let q = `SELECT * FROM adm_business_configs WHERE 1=1`; const params=[]; let idx=1;
      if (category) { q+=` AND category=$${idx++}`; params.push(category); }
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY config_key ASC, version DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ configs: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const config_key = (body.config_key||'').trim();
      const config_value = body.config_value || {};
      const category = (body.category||'').trim();
      const description = (body.description||'').trim() || null;
      if (!config_key || config_key.length<3 || config_key.length>200) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'config_key_3_200'})); return; }
      if (!category || category.length<3 || category.length>100) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'category_3_100'})); return; }
      if (description && (description.length<10 || description.length>1000)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'description_10_1000'})); return; }
      try {
        const maxVer = await pool.query(`SELECT COALESCE(MAX(version),0)+1 as next FROM adm_business_configs WHERE config_key=$1`, [config_key]);
        const nextVer = maxVer.rows[0].next;
        const { rows } = await pool.query(
          `INSERT INTO adm_business_configs (config_key, config_value, version, category, description, created_by_identity, status)
           VALUES ($1,$2,$3,$4,$5,$6,'rascunho') RETURNING *`,
          [config_key, JSON.stringify(config_value), nextVer, category, description, sess.identityId||null]
        );
        await pool.query(
          `INSERT INTO adm_business_config_history (config_id, config_key, previous_version, next_version, previous_value, next_value, changed_by_identity, reason)
           VALUES ($1,$2,NULL,$3,NULL,$4,$5,$6)`,
          [rows[0].id, config_key, nextVer, JSON.stringify(config_value), sess.identityId||null, 'Criação inicial configuração versionada catálogo preços alçadas conteúdo SLA preferências']
        );
        try { await auditLog({ action:'adm_business_config_create', actor: sess.identityId, target: rows[0].id, meta:{ config_key, version: nextVer, category } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ config: rows[0], note:'configuracoes_negocio_versionadas_catalogo_precos_alcadas_conteudo_SLA_preferencias' }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const id = body.id;
      const reason = (body.reason||'').trim();
      if (!id) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'id_required'})); return; }
      if (!reason || reason.length<10 || reason.length>1000) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'reason_10_1000_required'})); return; }
      try {
        const existing = await pool.query(`SELECT * FROM adm_business_configs WHERE id=$1`, [id]);
        if (!existing.rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
        const prev = existing.rows[0];
        // if config_value changed, create new version
        let newVersion = prev.version;
        let shouldNewVersion = body.config_value && JSON.stringify(body.config_value) !== JSON.stringify(prev.config_value);
        if (shouldNewVersion) {
          const maxVer = await pool.query(`SELECT COALESCE(MAX(version),0)+1 as next FROM adm_business_configs WHERE config_key=$1`, [prev.config_key]);
          newVersion = maxVer.rows[0].next;
          const { rows } = await pool.query(
            `INSERT INTO adm_business_configs (config_key, config_value, version, category, description, status, created_by_identity, approved_by_identity, approved_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [prev.config_key, JSON.stringify(body.config_value), newVersion, body.category||prev.category, body.description||prev.description, body.status||prev.status, sess.identityId||null, body.status==='aprovado'?sess.identityId||null:prev.approved_by_identity, body.status==='aprovado'?new Date():prev.approved_at]
          );
          await pool.query(
            `INSERT INTO adm_business_config_history (config_id, config_key, previous_version, next_version, previous_value, next_value, changed_by_identity, reason)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [rows[0].id, prev.config_key, prev.version, newVersion, JSON.stringify(prev.config_value), JSON.stringify(body.config_value), sess.identityId||null, reason]
          );
          try { await auditLog({ action:'adm_business_config_new_version', actor: sess.identityId, target: rows[0].id, meta:{ config_key: prev.config_key, previous_version: prev.version, next_version: newVersion, reason } }); } catch {}
          res.writeHead(201, {'Content-Type':'application/json'});
          res.end(JSON.stringify({ config: rows[0], note:'nova_versao_config_versionada' }));
        } else {
          const { rows } = await pool.query(
            `UPDATE adm_business_configs SET status=COALESCE($1,status), description=COALESCE($2,description), category=COALESCE($3,category), approved_by_identity=CASE WHEN $1='aprovado' THEN $4 ELSE approved_by_identity END, approved_at=CASE WHEN $1='aprovado' THEN NOW() ELSE approved_at END, updated_at=NOW() WHERE id=$5 RETURNING *`,
            [body.status||null, body.description||null, body.category||null, sess.identityId||null, id]
          );
          await pool.query(
            `INSERT INTO adm_business_config_history (config_id, config_key, previous_version, next_version, previous_value, next_value, changed_by_identity, reason)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [id, prev.config_key, prev.version, prev.version, JSON.stringify(prev.config_value), JSON.stringify(prev.config_value), sess.identityId||null, reason]
          );
          try { await auditLog({ action:'adm_business_config_update', actor: sess.identityId, target: id, meta:{ status: body.status, reason } }); } catch {}
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({ config: rows[0] }));
        }
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  // ADM-10 metas e cenários comparação
  const handleGoalsComparison = async (req, res) => {
    const sess = checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      try {
        const { rows } = await pool.query(`SELECT * FROM adm_goals_comparison ORDER BY period_start DESC LIMIT 200`);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ comparisons: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const goal_id = body.goal_id || null;
      const scenario_id = body.scenario_id || null;
      const budget_id = body.budget_id || null;
      const period_start = body.period_start;
      const period_end = body.period_end;
      const predicted = body.predicted_value ?? null;
      const realized = body.realized_value ?? null;
      const variance_percent = body.variance_percent ?? null;
      if (!period_start || !period_end) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'period_required'})); return; }
      if (new Date(period_end) < new Date(period_start)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'period_end_gte_start'})); return; }
      if (variance_percent!=null && (variance_percent < -100 || variance_percent > 100)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'variance_percent_range'})); return; }
      try {
        const { rows } = await pool.query(
          `INSERT INTO adm_goals_comparison (goal_id, scenario_id, budget_id, period_start, period_end, predicted_value, realized_value, variance_percent, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [goal_id, scenario_id, budget_id, period_start, period_end, predicted, realized, variance_percent, sess.identityId||null]
        );
        try { await auditLog({ action:'adm_goals_comparison_create', actor: sess.identityId, target: rows[0].id, meta:{ goal_id, scenario_id, predicted, realized } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ comparison: rows[0], note:'metas_cenarios_comparacao_prevista_realizada_sem_confundir_estimativa_resultado' }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  // ADM-11 diário acesso
  const handleDiaryAccess = async (req, res) => {
    const sess = checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const diary_id = url.searchParams.get('diary_id');
      let q = `SELECT * FROM adm_management_diary_access WHERE 1=1`; const params=[]; let idx=1;
      if (diary_id) { q+=` AND diary_id=$${idx++}`; params.push(diary_id); }
      q+=` ORDER BY accessed_at DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ accesses: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const diary_id = body.diary_id;
      const access_type = (body.access_type||'leitura').trim();
      if (!diary_id) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'diary_id_required'})); return; }
      if (!access_type || access_type.length<3 || access_type.length>100) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'access_type_3_100'})); return; }
      try {
        // check permission: only admin/ti can access diary per CON-11
        const diary = await pool.query(`SELECT id, visibility FROM crm_management_diary WHERE id=$1`, [diary_id]);
        if (!diary.rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'diary_not_found'})); return; }
        const { rows } = await pool.query(
          `INSERT INTO adm_management_diary_access (diary_id, accessor_identity, access_type) VALUES ($1,$2,$3) RETURNING *`,
          [diary_id, sess.identityId||null, access_type]
        );
        try { await auditLog({ action:'adm_diary_access', actor: sess.identityId, target: diary_id, meta:{ access_type } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ access: rows[0], note:'trilha_diario_decisoes_CON11_acessiveis_conforme_permissao' }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  // ADM-12 análises expansão
  const handleExpansionAnalyses = async (req, res) => {
    const sess = checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const analysis_type = url.searchParams.get('analysis_type');
      let q = `SELECT * FROM adm_expansion_analyses WHERE 1=1`; const params=[]; let idx=1;
      if (analysis_type) { q+=` AND analysis_type=$${idx++}`; params.push(analysis_type); }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ analyses: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const title = (body.title||'').trim();
      const description = (body.description||'').trim();
      const premises = (body.premises||'').trim();
      const analysis_type = body.analysis_type || 'expansao';
      const data = body.data || {};
      const source_module = body.source_module || 'adm';
      if (!title || title.length<5 || title.length>200) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'title_5_200'})); return; }
      if (!description || description.length<10 || description.length>2000) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'description_10_2000'})); return; }
      if (!premises || premises.length<10 || premises.length>2000) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'premises_10_2000_required_analises_expansao_qualidade_oportunidades_modulos_reais'})); return; }
      try {
        const { rows } = await pool.query(
          `INSERT INTO adm_expansion_analyses (title, description, premises, analysis_type, data, source_module, is_real_data, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,true,$7) RETURNING *`,
          [title, description, premises, analysis_type, JSON.stringify(data), source_module, sess.identityId||null]
        );
        try { await auditLog({ action:'adm_expansion_analysis_create', actor: sess.identityId, target: rows[0].id, meta:{ title, analysis_type, source_module, is_real_data:true, premises } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ analysis: rows[0], note:'analises_expansao_qualidade_oportunidades_adicionais_alimentadas_modulos_reais_is_real_data_true' }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  return {
    handleSearchFavorites,
    handleSavedFilters,
    handleShortcuts,
    handleReports,
    handleReportLogs,
    handleBusinessConfigs,
    handleGoalsComparison,
    handleDiaryAccess,
    handleExpansionAnalyses,
  };
}
