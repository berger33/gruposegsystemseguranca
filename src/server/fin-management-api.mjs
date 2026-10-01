export function createFinManagementApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const generateProtocol = (prefix) => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const rnd = Math.random().toString(36).substring(2,6).toUpperCase();
    return `${prefix}-${y}${m}${day}-${rnd}`;
  };

  const getSession = async (req) => {
    try { return await requireSession(req); } catch { return null; }
  };
  const checkAuth = async (req, res) => {
    const sess = await getSession(req);
    if (!sess) { res.writeHead(401, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return null; }
    if (!requireRole(sess, ['admin','ti','financeiro','finance','rh'])) {
      // allow admin only fallback
      const r = (sess.role||'').toLowerCase();
      if (r!=='admin' && r!=='ti' && r!=='financeiro' && r!=='finance') {
        res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return null;
      }
    }
    return sess;
  };

  const readJson = async (req) => {
    return new Promise((resolve, reject) => {
      let data='';
      req.on('data', c=> data+=c);
      req.on('end', ()=> {
        try { resolve(data?JSON.parse(data):{}); } catch(e){ reject(e); }
      });
    });
  };

  // FIN-09 resultado gerencial: snapshot sintético, transacional e sem detalhe SQL.
  const RESULT_STATUSES = new Set(['rascunho','em_revisao','aprovado','incompleto','arquivado']);
  const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const isoDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
  const cents = v => v == null ? null : (Number.isSafeInteger(Number(v)) && Number(v) >= 0 ? Number(v) : null);
  const send = (res, code, body) => { res.writeHead(code, {'Content-Type':'application/json'}); res.end(JSON.stringify(body)); };
  const dbError = e => e?.code === '23505' ? 'duplicate' : e?.code === '23514' || e?.code === '22P02' || e?.code === '22007' ? 'invalid' : null;
  const isAuditUnavailable = e => e?.code === '42P01' || /audit_log/i.test(String(e?.message || ''));

  const handleManagementResults = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (!sameOrigin(req) && req.method !== 'GET') return send(res, 403, {error:'forbidden_origin'});
    if (req.method === 'GET') {
      const u = new URL(req.url, `http://${req.headers.host||'localhost'}`), params=[]; let q='SELECT * FROM fin_management_results WHERE 1=1';
      const filters=[['contract_id','contract_id'],['client_account_id','client_account_id'],['competence_date','competence_date'],['status','status']];
      for (const [key,col] of filters) { const v=u.searchParams.get(key); if (v) { if ((key.endsWith('_id')&&!uuid(v)) || (key==='competence_date'&&!isoDate(v)) || (key==='status'&&!RESULT_STATUSES.has(v))) return send(res,400,{error:`invalid_${key}`}); params.push(v); q+=` AND ${col}=$${params.length}`; } }
      const complete=u.searchParams.get('is_complete'); if (complete) { if (!['true','false'].includes(complete)) return send(res,400,{error:'invalid_is_complete'}); params.push(complete==='true'); q+=` AND is_complete=$${params.length}`; }
      q+=' ORDER BY competence_date DESC, created_at DESC LIMIT 200';
      try { return send(res,200,{results:(await pool.query(q,params)).rows}); } catch { return send(res,500,{error:'internal'}); }
    }
    if (req.method !== 'POST') return send(res,405,{error:'method_not_allowed'});
    let body; try { body=await readJson(req); } catch { return send(res,400,{error:'invalid_json'}); }
    const contract_id=body.contract_id||null, client_account_id=body.client_account_id||null;
    if ((contract_id&&!uuid(contract_id))||(client_account_id&&!uuid(client_account_id))) return send(res,400,{error:'invalid_reference'});
    if (!isoDate(body.competence_date)) return send(res,400,{error:'invalid_competence_date'});
    const values={revenue_contracted_cents:cents(body.revenue_contracted_cents),revenue_billed_cents:cents(body.revenue_billed_cents),revenue_received_cents:cents(body.revenue_received_cents),costs_cents:cents(body.costs_cents),cash_cents:cents(body.cash_cents)};
    if (Object.entries(values).some(([,v])=>v===null && body[Object.keys(values).find(k=>values[k]===v)]!=null)) return send(res,400,{error:'invalid_amount'});
    const complete=body.is_complete===true, reason=typeof body.incomplete_reason==='string'?body.incomplete_reason.trim():'';
    if (!complete && (reason.length<10||reason.length>1000)) return send(res,400,{error:'incomplete_reason_required_10_1000_when_incomplete'});
    if (complete && (values.revenue_received_cents===null||values.costs_cents===null||reason)) return send(res,400,{error:'complete_requires_received_costs_and_no_incomplete_reason'});
    const status=body.status || (complete?'aprovado':'incompleto');
    if (!RESULT_STATUSES.has(status)) return send(res,400,{error:'invalid_status'});
    const notes=body.notes == null ? null : String(body.notes).trim();
    if (notes && (notes.length<10||notes.length>2000)) return send(res,400,{error:'notes_10_2000'});
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      if (contract_id) { const c=await client.query('SELECT id FROM crm_contracts WHERE id=$1',[contract_id]); if (!c.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'contract_not_found'}); } }
      if (client_account_id) { const c=await client.query('SELECT id FROM client_accounts WHERE id=$1',[client_account_id]); if (!c.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'client_account_not_found'}); } }
      const duplicate=await client.query('SELECT id FROM fin_management_results WHERE client_account_id IS NOT DISTINCT FROM $1 AND contract_id IS NOT DISTINCT FROM $2 AND competence_date=$3',[client_account_id,contract_id,body.competence_date]);
      if (duplicate.rows.length) { await client.query('ROLLBACK'); return send(res,409,{error:'duplicate_competence_account'}); }
      const protocol=generateProtocol('RES-FIN');
      const r=await client.query(`INSERT INTO fin_management_results (protocol,contract_id,client_account_id,competence_date,revenue_contracted_cents,revenue_billed_cents,revenue_received_cents,costs_cents,cash_cents,is_complete,incomplete_reason,status,notes,created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,[protocol,contract_id,client_account_id,body.competence_date,values.revenue_contracted_cents,values.revenue_billed_cents,values.revenue_received_cents,values.costs_cents,values.cash_cents,complete,complete?null:reason,status,notes,sess.identityId||null]);
      await client.query(`INSERT INTO fin_result_history (result_id,contract_id,next_status,next_contracted,next_billed,next_received,next_costs,next_cash,next_complete,changed_by_identity,reason,is_incomplete) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[r.rows[0].id,contract_id,status,values.revenue_contracted_cents,values.revenue_billed_cents,values.revenue_received_cents,values.costs_cents,values.cash_cents,complete,sess.identityId||null,complete?'Resultado completo':reason,!complete]);
      await auditLog({action:'fin_management_result_create',actor:sess.identityId||'unknown',target:r.rows[0].id,meta:{protocol,contract_id,competence_date:body.competence_date,is_complete:complete},client});
      await client.query('COMMIT'); return send(res,201,{result:r.rows[0]});
    } catch(e) { try { await client.query('ROLLBACK'); } catch {} const kind=dbError(e); return send(res,kind==='duplicate'?409:kind==='invalid'?400:isAuditUnavailable(e)?503:500,{error:kind==='duplicate'?'duplicate':kind==='invalid'?'invalid':isAuditUnavailable(e)?'audit_unavailable':'internal'}); }
    finally { client.release(); }
  };

  const handleResultHistory = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') { res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'})); return; }
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const result_id = url.searchParams.get('result_id');
    const contract_id = url.searchParams.get('contract_id');
    let q = `SELECT * FROM fin_result_history WHERE 1=1`; const params=[]; let idx=1;
    if (result_id) { q+=` AND result_id=$${idx++}`; params.push(result_id); }
    if (contract_id) { q+=` AND contract_id=$${idx++}`; params.push(contract_id); }
    q+=` ORDER BY created_at DESC LIMIT 200`;
    try {
      const { rows } = await pool.query(q, params);
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ history: rows }));
    } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
  };

  // FIN-10 despesas
  const handleExpenses = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const status = url.searchParams.get('status');
      const expense_type = url.searchParams.get('expense_type');
      const contract_id = url.searchParams.get('contract_id');
      let q = `SELECT * FROM fin_expenses WHERE 1=1`; const params=[]; let idx=1;
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      if (expense_type) { q+=` AND expense_type=$${idx++}`; params.push(expense_type); }
      if (contract_id) { q+=` AND contract_id=$${idx++}`; params.push(contract_id); }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ expenses: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const expense_type = body.expense_type || 'despesa';
      const category = (body.category||'').trim();
      const description = (body.description||'').trim();
      const amount_cents = body.amount_cents;
      const threshold_cents = body.threshold_cents ?? null;
      const requester_name = (body.requester_name||'').trim();
      const requester_identity = body.requester_identity || sess.identityId || null;
      const approver_name = (body.approver_name||'').trim() || null;
      const approver_identity = body.approver_identity || null;
      const evidence_file_name = body.evidence_file_name || null;
      const evidence_file_url = body.evidence_file_url || null;
      const evidence_storage_key = body.evidence_storage_key || null;
      const contract_id = body.contract_id || null;
      const cost_center_id = body.cost_center_id || null;
      const supplier_id = body.supplier_id || null;

      if (!category || category.length<3 || category.length>200) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'category_3_200'})); return; }
      if (!description || description.length<10 || description.length>1000) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'description_10_1000'})); return; }
      if (!amount_cents || amount_cents<=0) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'amount_positive'})); return; }
      if (!requester_name || requester_name.length<2 || requester_name.length>200) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'requester_name_2_200'})); return; }
      if (requester_identity && approver_identity && requester_identity===approver_identity) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'segregation_requester_approver_must_differ'})); return; }
      if (evidence_file_url && (evidence_file_url.length<5 || evidence_file_url.length>1000)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'evidence_file_url_5_1000'})); return; }
      if (evidence_storage_key && (evidence_storage_key.length<5 || evidence_storage_key.length>500)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'evidence_storage_key_5_500'})); return; }

      const protocol = generateProtocol('DES-FIN');
      try {
        if (evidence_storage_key) {
          const dup = await pool.query(`SELECT id FROM fin_expenses WHERE evidence_storage_key=$1`, [evidence_storage_key]);
          if (dup.rows.length) { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate_storage_key'})); return; }
        }
        const { rows } = await pool.query(
          `INSERT INTO fin_expenses (protocol, expense_type, category, description, amount_cents, threshold_cents, requester_name, requester_identity, approver_name, approver_identity, evidence_file_name, evidence_file_url, evidence_storage_key, contract_id, cost_center_id, supplier_id, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
          [protocol, expense_type, category, description, amount_cents, threshold_cents, requester_name, requester_identity, approver_name, approver_identity, evidence_file_name, evidence_file_url, evidence_storage_key, contract_id, cost_center_id, supplier_id, sess.identityId||null]
        );
        await pool.query(
          `INSERT INTO fin_expense_history (expense_id, previous_status, next_status, previous_amount, next_amount, changed_by_identity, reason, is_segregation_verified)
           VALUES ($1,NULL,$2,NULL,$3,$4,$5,$6)`,
          [rows[0].id, 'pendente', amount_cents, sess.identityId||null, 'Criação despesa com segregação solicitar/aprovar', false]
        );
        try { await auditLog({ action:'fin_expense_create', actor: sess.identityId, target: rows[0].id, meta:{ protocol, amount_cents, expense_type } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ expense: rows[0] }));
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
      const status = body.status;
      const reason = (body.reason||'').trim();
      if (!id) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'id_required'})); return; }
      if (!reason || reason.length<10 || reason.length>1000) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'reason_10_1000_required'})); return; }
      if (!status) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'status_required'})); return; }
      try {
        const existing = await pool.query(`SELECT * FROM fin_expenses WHERE id=$1`, [id]);
        if (!existing.rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
        const prev = existing.rows[0];
        // segregation check: approver cannot be same as requester
        const approver_identity = body.approver_identity || prev.approver_identity;
        if (prev.requester_identity && approver_identity && prev.requester_identity===approver_identity) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'segregation_requester_approver_must_differ'})); return; }
        // alçada check: if amount > threshold and status approve, require approver
        if (status==='aprovado' && prev.threshold_cents && prev.amount_cents > prev.threshold_cents && !approver_identity) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'approver_required_above_threshold'})); return; }

        const { rows } = await pool.query(
          `UPDATE fin_expenses SET status=$1, approver_name=COALESCE($2,approver_name), approver_identity=COALESCE($3,approver_identity), approved_at=CASE WHEN $1='aprovado' THEN NOW() ELSE approved_at END, approved_by_identity=CASE WHEN $1='aprovado' THEN $4 ELSE approved_by_identity END, rejection_reason=CASE WHEN $1='rejeitado' THEN $5 ELSE rejection_reason END, is_segregated=true, segregation_checked=true, updated_at=NOW() WHERE id=$6 RETURNING *`,
          [status, body.approver_name||null, approver_identity, sess.identityId||null, status==='rejeitado'?reason:null, id]
        );
        await pool.query(
          `INSERT INTO fin_expense_history (expense_id, previous_status, next_status, previous_amount, next_amount, changed_by_identity, reason, is_segregation_verified)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, prev.status, status, prev.amount_cents, rows[0].amount_cents, sess.identityId||null, reason, true]
        );
        try { await auditLog({ action: status==='aprovado'?'fin_expense_approve':'fin_expense_status', actor: sess.identityId, target: id, meta:{ status, reason } }); } catch {}
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ expense: rows[0] }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  const handleExpenseHistory = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') { res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'})); return; }
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    const expense_id = url.searchParams.get('expense_id');
    let q = `SELECT * FROM fin_expense_history WHERE 1=1`; const params=[]; let idx=1;
    if (expense_id) { q+=` AND expense_id=$${idx++}`; params.push(expense_id); }
    q+=` ORDER BY created_at DESC LIMIT 200`;
    try {
      const { rows } = await pool.query(q, params);
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ history: rows }));
    } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
  };

  // FIN-11 fiscal
  const handleFiscalProviders = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      try {
        const { rows } = await pool.query(`SELECT * FROM fin_fiscal_providers ORDER BY created_at DESC LIMIT 200`);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ providers: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const name = (body.name||'').trim();
      const provider_type = body.provider_type || 'nfse';
      if (!name || name.length<3 || name.length>200) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'name_3_200'})); return; }
      try {
        const dup = await pool.query(`SELECT id FROM fin_fiscal_providers WHERE name=$1`, [name]);
        if (dup.rows.length) { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate_name'})); return; }
        const { rows } = await pool.query(
          `INSERT INTO fin_fiscal_providers (name, provider_type, status, config, created_by_identity) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [name, provider_type, body.status||'nao_configurado', body.config||{}, sess.identityId||null]
        );
        try { await auditLog({ action:'fin_fiscal_provider_create', actor: sess.identityId, target: rows[0].id, meta:{ name, provider_type } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ provider: rows[0] }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const id = body.id;
      if (!id) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'id_required'})); return; }
      try {
        const { rows } = await pool.query(
          `UPDATE fin_fiscal_providers SET status=COALESCE($1,status), config=COALESCE($2,config), last_processed_at=CASE WHEN $1='configurado' THEN NOW() ELSE last_processed_at END, error_sanitized=$3, updated_at=NOW() WHERE id=$4 RETURNING *`,
          [body.status||null, body.config||null, body.error_sanitized||null, id]
        );
        if (!rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
        try { await auditLog({ action:'fin_fiscal_provider_update', actor: sess.identityId, target: id, meta:{ status: body.status } }); } catch {}
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ provider: rows[0] }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  const handleFiscalObligations = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const contract_id = url.searchParams.get('contract_id');
      const obligation_type = url.searchParams.get('obligation_type');
      let q = `SELECT * FROM fin_fiscal_obligations WHERE 1=1`; const params=[]; let idx=1;
      if (contract_id) { q+=` AND contract_id=$${idx++}`; params.push(contract_id); }
      if (obligation_type) { q+=` AND obligation_type=$${idx++}`; params.push(obligation_type); }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ obligations: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const contract_id = body.contract_id || null;
      const client_account_id = body.client_account_id || null;
      const obligation_type = body.obligation_type || 'nfse';
      const activity_type = (body.activity_type||'').trim();
      const description = (body.description||'').trim();
      const rule = (body.rule||'').trim();
      const notes = (body.notes||'').trim() || null;
      if (!activity_type || activity_type.length<3 || activity_type.length>200) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'activity_type_3_200'})); return; }
      if (!description || description.length<10 || description.length>1000) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'description_10_1000'})); return; }
      if (!rule || rule.length<10 || rule.length>1000) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'rule_10_1000_required_determinar_nfse_nfe_outra_obrigacao_conforme_atividade'})); return; }
      try {
        const { rows } = await pool.query(
          `INSERT INTO fin_fiscal_obligations (contract_id, client_account_id, obligation_type, activity_type, description, rule, notes, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [contract_id, client_account_id, obligation_type, activity_type, description, rule, notes, sess.identityId||null]
        );
        try { await auditLog({ action:'fin_fiscal_obligation_create', actor: sess.identityId, target: rows[0].id, meta:{ obligation_type, activity_type, rule } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ obligation: rows[0] }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const id = body.id;
      if (!id) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'id_required'})); return; }
      const is_determined = body.is_determined === true;
      try {
        if (is_determined) {
          if (!body.rule || body.rule.length<10) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'rule_10_1000_required_when_determined'})); return; }
          const { rows } = await pool.query(
            `UPDATE fin_fiscal_obligations SET is_determined=true, determined_by_identity=$1, determined_at=NOW(), status='determinada', rule=COALESCE($2,rule), updated_at=NOW() WHERE id=$3 RETURNING *`,
            [sess.identityId||null, body.rule||null, id]
          );
          if (!rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
          try { await auditLog({ action:'fin_fiscal_obligation_determine', actor: sess.identityId, target: id, meta:{ rule: body.rule } }); } catch {}
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({ obligation: rows[0] }));
        } else {
          const { rows } = await pool.query(
            `UPDATE fin_fiscal_obligations SET status=COALESCE($1,status), notes=COALESCE($2,notes), updated_at=NOW() WHERE id=$3 RETURNING *`,
            [body.status||null, body.notes||null, id]
          );
          if (!rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
          res.writeHead(200, {'Content-Type':'application/json'});
          res.end(JSON.stringify({ obligation: rows[0] }));
        }
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  const handleFiscalDocuments = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const obligation_id = url.searchParams.get('obligation_id');
      const provider_id = url.searchParams.get('provider_id');
      let q = `SELECT * FROM fin_fiscal_documents WHERE 1=1`; const params=[]; let idx=1;
      if (obligation_id) { q+=` AND obligation_id=$${idx++}`; params.push(obligation_id); }
      if (provider_id) { q+=` AND provider_id=$${idx++}`; params.push(provider_id); }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ documents: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const obligation_id = body.obligation_id || null;
      const provider_id = body.provider_id || null;
      const document_type = body.document_type || 'nfse';
      const amount_cents = body.amount_cents ?? 0;
      const file_name = body.file_name || null;
      const file_url = body.file_url || null;
      const storage_key = body.storage_key || null;
      if (file_url && (file_url.length<5 || file_url.length>1000)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'file_url_5_1000'})); return; }
      if (storage_key && (storage_key.length<5 || storage_key.length>500)) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'storage_key_5_500'})); return; }
      const protocol = generateProtocol('NF-FIN');
      try {
        if (storage_key) {
          const dup = await pool.query(`SELECT id FROM fin_fiscal_documents WHERE storage_key=$1`, [storage_key]);
          if (dup.rows.length) { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate_storage_key'})); return; }
        }
        const { rows } = await pool.query(
          `INSERT INTO fin_fiscal_documents (protocol, obligation_id, provider_id, document_type, amount_cents, file_name, file_url, storage_key, is_sandbox, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9) RETURNING *`,
          [protocol, obligation_id, provider_id, document_type, amount_cents, file_name, file_url, storage_key, sess.identityId||null]
        );
        try { await auditLog({ action:'fin_fiscal_document_create', actor: sess.identityId, target: rows[0].id, meta:{ protocol, document_type } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ document: rows[0] }));
      } catch(e){
        if (e.code==='23505') { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate', details:e.detail})); return; }
        res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message}));
      }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  // FIN-12 gateway
  const handleGateways = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      try {
        const { rows } = await pool.query(`SELECT * FROM fin_payment_gateways ORDER BY created_at DESC LIMIT 200`);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ gateways: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const name = (body.name||'').trim();
      const gateway_type = body.gateway_type || 'pix';
      if (!name || name.length<3 || name.length>200) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'name_3_200'})); return; }
      try {
        const dup = await pool.query(`SELECT id FROM fin_payment_gateways WHERE name=$1`, [name]);
        if (dup.rows.length) { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate_name'})); return; }
        const { rows } = await pool.query(
          `INSERT INTO fin_payment_gateways (name, gateway_type, status, is_selected, is_sandbox, config, created_by_identity)
           VALUES ($1,$2,$3,$4,true,$5,$6) RETURNING *`,
          [name, gateway_type, body.status||'sandbox', body.is_selected===true, body.config||{}, sess.identityId||null]
        );
        try { await auditLog({ action:'fin_gateway_create', actor: sess.identityId, target: rows[0].id, meta:{ name, gateway_type, is_sandbox:true } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ gateway: rows[0] }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const id = body.id;
      if (!id) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'id_required'})); return; }
      try {
        // sandbox enforcement: is_selected true requires is_sandbox true
        if (body.is_selected===true && body.is_sandbox===false) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'sandbox_required_when_selected_sem_cobranca_real'})); return; }
        const { rows } = await pool.query(
          `UPDATE fin_payment_gateways SET status=COALESCE($1,status), is_selected=COALESCE($2,is_selected), is_sandbox=COALESCE($3,is_sandbox), config=COALESCE($4,config), error_sanitized=$5, last_test_at=CASE WHEN $1='sandbox' THEN NOW() ELSE last_test_at END, updated_at=NOW() WHERE id=$6 RETURNING *`,
          [body.status||null, body.is_selected!=null?body.is_selected:null, body.is_sandbox!=null?body.is_sandbox:null, body.config||null, body.error_sanitized||null, id]
        );
        if (!rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
        try { await auditLog({ action:'fin_gateway_update', actor: sess.identityId, target: id, meta:{ status: body.status, is_selected: body.is_selected, is_sandbox: rows[0].is_sandbox } }); } catch {}
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ gateway: rows[0] }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  const handleWebhooks = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const gateway_id = url.searchParams.get('gateway_id');
      const status = url.searchParams.get('status');
      let q = `SELECT * FROM fin_gateway_webhooks WHERE 1=1`; const params=[]; let idx=1;
      if (gateway_id) { q+=` AND gateway_id=$${idx++}`; params.push(gateway_id); }
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ webhooks: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const gateway_id = body.gateway_id;
      const event_type = (body.event_type||'').trim();
      const signature = (body.signature||'').trim();
      const payload = body.payload || {};
      const idempotency_key = (body.idempotency_key||'').trim();
      const is_valid_signature = body.is_valid_signature === true;
      const is_replay = body.is_replay === true;
      if (!gateway_id) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'gateway_id_required'})); return; }
      if (!event_type || event_type.length<3 || event_type.length>200) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'event_type_3_200'})); return; }
      if (!signature || signature.length<10 || signature.length>1000) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'signature_10_1000_required_validar_assinatura_webhook'})); return; }
      if (!idempotency_key || idempotency_key.length<10 || idempotency_key.length>200) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'idempotency_key_10_200_required_validar_replay_idempotencia'})); return; }
      try {
        const dup = await pool.query(`SELECT id, is_replay FROM fin_gateway_webhooks WHERE idempotency_key=$1`, [idempotency_key]);
        if (dup.rows.length) {
          // replay detection
          await pool.query(`UPDATE fin_gateway_webhooks SET is_replay=true, status='replay', error_sanitized='replay_detected_idempotency_key_duplicate' WHERE id=$1`, [dup.rows[0].id]);
          res.writeHead(409, {'Content-Type':'application/json'});
          res.end(JSON.stringify({error:'duplicate_idempotency_key_replay_detected', existing_id: dup.rows[0].id}));
          return;
        }
        // validate signature: if not valid, reject but store
        const status = !is_valid_signature ? 'rejeitado' : (is_replay ? 'replay' : 'validado');
        const { rows } = await pool.query(
          `INSERT INTO fin_gateway_webhooks (gateway_id, event_type, signature, payload, is_valid_signature, is_replay, idempotency_key, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [gateway_id, event_type, signature, payload, is_valid_signature, is_replay, idempotency_key, status]
        );
        try { await auditLog({ action:'fin_webhook_receive', actor: sess.identityId, target: rows[0].id, meta:{ gateway_id, event_type, is_valid_signature, is_replay, idempotency_key, status } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ webhook: rows[0], note:'validar_assinatura_webhook_replay_idempotencia_conciliacao_sem_cobranca_real' }));
      } catch(e){
        if (e.code==='23505') { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate_idempotency', details:e.detail})); return; }
        res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message}));
      }
      return;
    }
    if (req.method === 'PATCH') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const id = body.id;
      const status = body.status;
      if (!id) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'id_required'})); return; }
      try {
        const { rows } = await pool.query(
          `UPDATE fin_gateway_webhooks SET status=COALESCE($1,status), processed_at=CASE WHEN $1='conciliado' THEN NOW() ELSE processed_at END, conciliated_at=CASE WHEN $1='conciliado' THEN NOW() ELSE conciliated_at END WHERE id=$2 RETURNING *`,
          [status||null, id]
        );
        if (!rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
        try { await auditLog({ action:'fin_webhook_conciliate', actor: sess.identityId, target: id, meta:{ status } }); } catch {}
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ webhook: rows[0] }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  const handleCharges = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
      const gateway_id = url.searchParams.get('gateway_id');
      const receivable_id = url.searchParams.get('receivable_id');
      const status = url.searchParams.get('status');
      let q = `SELECT * FROM fin_gateway_charges WHERE 1=1`; const params=[]; let idx=1;
      if (gateway_id) { q+=` AND gateway_id=$${idx++}`; params.push(gateway_id); }
      if (receivable_id) { q+=` AND receivable_id=$${idx++}`; params.push(receivable_id); }
      if (status) { q+=` AND status=$${idx++}`; params.push(status); }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      try {
        const { rows } = await pool.query(q, params);
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ charges: rows }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) { res.writeHead(403, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden_origin'})); return; }
      let body; try { body = await readJson(req); } catch { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_json'})); return; }
      const gateway_id = body.gateway_id;
      const receivable_id = body.receivable_id || null;
      const amount_cents = body.amount_cents;
      const idempotency_key = (body.idempotency_key||'').trim();
      if (!gateway_id) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'gateway_id_required'})); return; }
      if (!amount_cents || amount_cents<=0) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'amount_positive'})); return; }
      if (!idempotency_key || idempotency_key.length<10 || idempotency_key.length>200) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'idempotency_key_10_200_required'})); return; }
      try {
        // check gateway is selected and sandbox
        const gw = await pool.query(`SELECT is_selected, is_sandbox FROM fin_payment_gateways WHERE id=$1`, [gateway_id]);
        if (!gw.rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'gateway_not_found'})); return; }
        if (!gw.rows[0].is_selected) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'gateway_not_selected_sandbox_required'})); return; }
        if (!gw.rows[0].is_sandbox) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'gateway_must_be_sandbox_sem_cobranca_real'})); return; }
        const dup = await pool.query(`SELECT id FROM fin_gateway_charges WHERE idempotency_key=$1`, [idempotency_key]);
        if (dup.rows.length) { res.writeHead(409, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate_idempotency_key', existing_id: dup.rows[0].id})); return; }
        const protocol = generateProtocol('CHG-FIN');
        const { rows } = await pool.query(
          `INSERT INTO fin_gateway_charges (protocol, gateway_id, receivable_id, amount_cents, idempotency_key, is_sandbox, created_by_identity)
           VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING *`,
          [protocol, gateway_id, receivable_id, amount_cents, idempotency_key, sess.identityId||null]
        );
        try { await auditLog({ action:'fin_gateway_charge_create', actor: sess.identityId, target: rows[0].id, meta:{ protocol, gateway_id, amount_cents, is_sandbox:true, idempotency_key } }); } catch {}
        res.writeHead(201, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ charge: rows[0], note:'sem_cobranca_real_em_testes_sandbox_only' }));
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
      const status = body.status;
      if (!id) { res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'id_required'})); return; }
      try {
        const { rows } = await pool.query(
          `UPDATE fin_gateway_charges SET status=COALESCE($1,status), is_conciliated=CASE WHEN $1='pago' THEN true ELSE is_conciliated END, conciliated_at=CASE WHEN $1='pago' THEN NOW() ELSE conciliated_at END, error_sanitized=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
          [status||null, body.error_sanitized||null, id]
        );
        if (!rows.length) { res.writeHead(404, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
        try { await auditLog({ action:'fin_gateway_charge_update', actor: sess.identityId, target: id, meta:{ status } }); } catch {}
        res.writeHead(200, {'Content-Type':'application/json'});
        res.end(JSON.stringify({ charge: rows[0] }));
      } catch(e){ res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'internal', details:e.message})); }
      return;
    }
    res.writeHead(405, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  };

  return {
    handleManagementResults,
    handleResultHistory,
    handleExpenses,
    handleExpenseHistory,
    handleFiscalProviders,
    handleFiscalObligations,
    handleFiscalDocuments,
    handleGateways,
    handleWebhooks,
    handleCharges,
  };
}
