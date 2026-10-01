export function createFinBudgetApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const generateProtocol = (prefix) => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const rnd = Math.random().toString(36).substring(2,6).toUpperCase();
    return `${prefix}-${y}${m}${day}-${rnd}`;
  };
  const getSession = async (req) => { try { return await requireSession(req); } catch { return null; } };
  const checkAuth = async (req, res) => {
    const sess = await getSession(req);
    if (!sess) { res.writeHead(401, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return null; }
    const r = (sess.role||'').toLowerCase();
    if (!['admin','ti','financeiro','finance'].includes(r)) {
      res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return null;
    }
    return sess;
  };
  const readJson = async (req) => new Promise((resolve, reject) => {
    let data=''; req.on('data', c=> data+=c); req.on('end', ()=> { try { resolve(data?JSON.parse(data):{}); } catch(e){ reject(e); } });
  });

  // FIN-13: os handlers de orçamento e cenários deixaram de viver aqui. O
  // rascunho desta borda escrevia fora de transação, com COALESCE em status,
  // auditoria silenciosa e `details` do PostgreSQL na resposta. A borda
  // canônica endurecida está em src/server/fin-management-api.mjs
  // (handleBudgets, handleBudgetScenarios, handleBudgetHistory) e é ela que
  // responde em /api/fin/budgets, /api/fin/budget-scenarios e
  // /api/fin/budget-history. FIN-14/15/16 continuam neste arquivo, ainda como
  // rascunho, até as fatias correspondentes.

  const handleExports = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const status = url.searchParams.get('status');
      let q = `SELECT * FROM fin_exports WHERE 1=1`; const params=[]; let idx=1;
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ exports: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const period_start = body.period_start;
      const period_end = body.period_end;
      const filters = body.filters || {};
      const totals = body.totals || {};
      const file_name = body.file_name || null;
      const file_url = body.file_url || null;
      const storage_key = body.storage_key || null;
      if (!period_start || !period_end) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'period_required'})); return; }
      if (new Date(period_end) < new Date(period_start)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'period_end_gte_start'})); return; }
      if (file_url && (file_url.length<5 || file_url.length>1000)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'file_url_5_1000'})); return; }
      if (storage_key && (storage_key.length<5 || storage_key.length>500)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'storage_key_5_500'})); return; }
      const protocol = generateProtocol('EXP-FIN');
      try {
        if (storage_key) {
          const dup = await pool.query(`SELECT id FROM fin_exports WHERE storage_key=$1`, [storage_key]);
          if (dup.rows.length) { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate_storage_key'})); return; }
        }
        const { rows } = await pool.query(
          `INSERT INTO fin_exports (protocol, period_start, period_end, filters, totals, total_records, total_amount_cents, file_name, file_url, storage_key, is_accountant_limited, access_role, requested_by_identity, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,'contador',$11,'pendente') RETURNING *`,
          [protocol, period_start, period_end, filters, totals, body.total_records||0, body.total_amount_cents||0, file_name, file_url, storage_key, sess.identityId||null]
        );
        await pool.query(
          `INSERT INTO fin_export_logs (export_id, action, actor_identity, meta) VALUES ($1,$2,$3,$4)`,
          [rows[0].id, 'export_create', sess.identityId||null, JSON.stringify({ period_start, period_end, filters, totals, is_accountant_limited:true })]
        );
        try { await auditLog({ action:'fin_export_create', actor: sess.identityId, target: rows[0].id, meta:{ protocol, period_start, period_end, is_accountant_limited:true, access_role:'contador' } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ export: rows[0], note:'exportacao_periodo_trilha_filtros_totais_conciliaveis_acesso_limitado_contador' }));
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
          `UPDATE fin_exports SET status=COALESCE($1,status), file_name=COALESCE($2,file_name), file_url=COALESCE($3,file_url), storage_key=COALESCE($4,storage_key), totals=COALESCE($5,totals), generated_at=CASE WHEN $1='gerado' THEN NOW() ELSE generated_at END, expires_at=CASE WHEN $1='gerado' THEN NOW()+INTERVAL '30 days' ELSE expires_at END, updated_at=NOW() WHERE id=$6 RETURNING *`,
          [body.status||null, body.file_name||null, body.file_url||null, body.storage_key||null, body.totals||null, id]
        );
        if (!rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
        await pool.query(`INSERT INTO fin_export_logs (export_id, action, actor_identity, meta) VALUES ($1,$2,$3,$4)`, [id, 'export_update', sess.identityId||null, JSON.stringify({ status: body.status })]);
        try { await auditLog({ action:'fin_export_update', actor: sess.identityId, target: id, meta:{ status: body.status } }); } catch {}
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ export: rows[0] }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  const handleExportLogs = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') { res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'})); return; }
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const export_id = url.searchParams.get('export_id');
    let q = `SELECT * FROM fin_export_logs WHERE 1=1`; const params=[]; let idx=1;
    if (export_id) { q+=` AND export_id=$${idx++}`; params.push(export_id); }
    q+=` ORDER BY created_at DESC LIMIT 200`;
    try {
      const { rows } = await pool.query(q, params);
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ logs: rows }));
    } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
  };

  const handleClosures = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const status = url.searchParams.get('status');
      let q = `SELECT * FROM fin_competence_closures WHERE 1=1`; const params=[]; let idx=1;
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY competence_date DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ closures: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const competence_date = body.competence_date;
      const notes = (body.notes||'').trim() || null;
      if (!competence_date) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'competence_date_required'})); return; }
      if (notes && (notes.length<10 || notes.length>2000)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'notes_10_2000'})); return; }
      try {
        const dup = await pool.query(`SELECT id FROM fin_competence_closures WHERE competence_date=$1`, [competence_date]);
        if (dup.rows.length) { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate_competence', existing_id: dup.rows[0].id})); return; }
        const { rows } = await pool.query(
          `INSERT INTO fin_competence_closures (competence_date, status, closed_by_identity, closed_at, notes)
           VALUES ($1,'fechada',$2,NOW(),$3) RETURNING *`,
          [competence_date, sess.identityId||null, notes]
        );
        // create initial report version preserving current snapshot
        await pool.query(
          `INSERT INTO fin_report_versions (closure_id, version, report_type, data, totals, is_preserved, created_by_identity)
           VALUES ($1,1,'fechamento_competencia',$2,$3,true,$4)`,
          [rows[0].id, JSON.stringify({ competence_date, status:'fechada', closed_at: new Date() }), JSON.stringify({}), sess.identityId||null]
        );
        try { await auditLog({ action:'fin_closure_create', actor: sess.identityId, target: rows[0].id, meta:{ competence_date, status:'fechada' } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ closure: rows[0], note:'fechamento_competencia_preservar_versoes_relatorio' }));
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
      const action = body.action; // reopen
      if (!id) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'id_required'})); return; }
      try {
        const existing = await pool.query(`SELECT * FROM fin_competence_closures WHERE id=$1`, [id]);
        if (!existing.rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
        if (action === 'reopen') {
          const reopen_reason = (body.reopen_reason||'').trim();
          if (!reopen_reason || reopen_reason.length<10 || reopen_reason.length>1000) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'reopen_reason_10_1000_required_reabertura_autorizada'})); return; }
          if (!body.authorized_by_identity && !sess.identityId) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'authorized_by_required'})); return; }
          const { rows } = await pool.query(
            `UPDATE fin_competence_closures SET status='reaberta', reopened_by_identity=$1, reopened_at=NOW(), reopen_reason=$2, authorized_by_identity=$3, authorized_at=NOW(), updated_at=NOW() WHERE id=$4 RETURNING *`,
            [sess.identityId||null, reopen_reason, body.authorized_by_identity||sess.identityId||null, id]
          );
          // preserve new version
          const maxVer = await pool.query(`SELECT COALESCE(MAX(version),0)+1 as next FROM fin_report_versions WHERE closure_id=$1`, [id]);
          const nextVer = maxVer.rows[0].next;
          await pool.query(
            `INSERT INTO fin_report_versions (closure_id, version, report_type, data, totals, is_preserved, created_by_identity)
             VALUES ($1,$2,'reabertura_competencia',$3,$4,true,$5)`,
            [id, nextVer, JSON.stringify({ reopened_at: new Date(), reopen_reason, authorized_by: body.authorized_by_identity||sess.identityId }), JSON.stringify({}), sess.identityId||null]
          );
          try { await auditLog({ action:'fin_closure_reopen', actor: sess.identityId, target: id, meta:{ reopen_reason, authorized_by: body.authorized_by_identity||sess.identityId } }); } catch {}
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({ closure: rows[0], note:'reabertura_autorizada_preservar_versoes_relatorio' }));
        } else {
          res.writeHead(400, {'Content-Type':'application/json'});
          res.end(JSON.stringify({error:'action_required_reopen'}));
        }
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  const handleReportVersions = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') { res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'})); return; }
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const closure_id = url.searchParams.get('closure_id');
    let q = `SELECT * FROM fin_report_versions WHERE 1=1`; const params=[]; let idx=1;
    if (closure_id) { q+=` AND closure_id=$${idx++}`; params.push(closure_id); }
    q+=` ORDER BY version DESC LIMIT 200`;
    try {
      const { rows } = await pool.query(q, params);
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ versions: rows }));
    } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
  };

  const handleCommissionProvisions = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const rule_id = url.searchParams.get('rule_id');
      const status = url.searchParams.get('status');
      let q = `SELECT * FROM fin_commission_provisions WHERE 1=1`; const params=[]; let idx=1;
      if (rule_id) { q+=` AND rule_id=$${idx++}`; params.push(rule_id); }
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY provision_date DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ provisions: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const rule_id = body.rule_id || null;
      const commission_id = body.commission_id || null;
      const contract_id = body.contract_id || null;
      const provision_date = body.provision_date || new Date().toISOString().slice(0,10);
      const amount_cents = body.amount_cents;
      const notes = (body.notes||'').trim() || null;
      if (!amount_cents || amount_cents<0) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'amount_cents_gte_0'})); return; }
      if (body.is_auto_paid===true) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'auto_paid_forbidden_nao_pagar_automaticamente'})); return; }
      try {
        const { rows } = await pool.query(
          `INSERT INTO fin_commission_provisions (rule_id, commission_id, contract_id, provision_date, amount_cents, provisioned_by_identity, notes, is_auto_paid)
           VALUES ($1,$2,$3,$4,$5,$6,$7,false) RETURNING *`,
          [rule_id, commission_id, contract_id, provision_date, amount_cents, sess.identityId||null, notes]
        );
        await pool.query(
          `INSERT INTO fin_commission_provision_history (provision_id, previous_status, next_status, previous_amount, next_amount, changed_by_identity, reason, is_auto_paid_attempt)
           VALUES ($1,NULL,$2,NULL,$3,$4,$5,false)`,
          [rows[0].id, 'provisionada', amount_cents, sess.identityId||null, 'Provisão comissão ligada à regra CRM-25 provisão e revisão não pagar automaticamente']
        );
        try { await auditLog({ action:'fin_commission_provision_create', actor: sess.identityId, target: rows[0].id, meta:{ rule_id, commission_id, amount_cents, is_auto_paid:false } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ provision: rows[0], note:'comissoes_ligadas_regra_CRM25_provisao_revisao_nao_pagar_automaticamente' }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const id = body.id;
      const status = body.status;
      const reason = (body.reason||'').trim();
      if (!id) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'id_required'})); return; }
      if (!reason || reason.length<10 || reason.length>1000) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'reason_10_1000_required'})); return; }
      if (body.is_auto_paid===true) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'auto_paid_forbidden'})); return; }
      try {
        const existing = await pool.query(`SELECT * FROM fin_commission_provisions WHERE id=$1`, [id]);
        if (!existing.rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
        const prev = existing.rows[0];
        if (status==='paga') {
          // prevent auto pay, require manual but still allow paga status after review
          if (prev.status !== 'revisada' && prev.status !== 'provisionada') {
            // allow but log
          }
        }
        if ((status==='em_revisao' || status==='revisada') && (!body.revision_reason || body.revision_reason.length<10)) {
          res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'revision_reason_10_1000_required'})); return;
        }
        const { rows } = await pool.query(
          `UPDATE fin_commission_provisions SET status=COALESCE($1,status), amount_cents=COALESCE($2,amount_cents), revision_reason=COALESCE($3,revision_reason), reviewed_by_identity=CASE WHEN $1 IN ('em_revisao','revisada') THEN $4 ELSE reviewed_by_identity END, reviewed_at=CASE WHEN $1 IN ('em_revisao','revisada') THEN NOW() ELSE reviewed_at END, paid_at=CASE WHEN $1='paga' THEN NOW() ELSE paid_at END, paid_by_identity=CASE WHEN $1='paga' THEN $4 ELSE paid_by_identity END, notes=COALESCE($5,notes), updated_at=NOW() WHERE id=$6 RETURNING *`,
          [status||null, body.amount_cents??null, body.revision_reason||null, sess.identityId||null, body.notes||null, id]
        );
        await pool.query(
          `INSERT INTO fin_commission_provision_history (provision_id, previous_status, next_status, previous_amount, next_amount, changed_by_identity, reason, is_auto_paid_attempt)
           VALUES ($1,$2,$3,$4,$5,$6,$7,false)`,
          [id, prev.status, rows[0].status, prev.amount_cents, rows[0].amount_cents, sess.identityId||null, reason]
        );
        try { await auditLog({ action: status==='paga'?'fin_commission_provision_pay':'fin_commission_provision_review', actor: sess.identityId, target: id, meta:{ status, reason, is_auto_paid:false } }); } catch {}
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ provision: rows[0] }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  const handleCommissionProvisionHistory = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') { res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'})); return; }
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const provision_id = url.searchParams.get('provision_id');
    let q = `SELECT * FROM fin_commission_provision_history WHERE 1=1`; const params=[]; let idx=1;
    if (provision_id) { q+=` AND provision_id=$${idx++}`; params.push(provision_id); }
    q+=` ORDER BY created_at DESC LIMIT 200`;
    try {
      const { rows } = await pool.query(q, params);
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ history: rows }));
    } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
  };

  return {
    handleExports,
    handleExportLogs,
    handleClosures,
    handleReportVersions,
    handleCommissionProvisions,
    handleCommissionProvisionHistory,
  };
}
