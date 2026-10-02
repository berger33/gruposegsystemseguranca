import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

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
    if (!requireRole(sess, ['admin','ti','financeiro','finance'])) {
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
    if (body.margin_percent != null || body.computed_margin_percent != null || body.margin_cents != null || body.margin_basis != null) {
      return send(res,400,{error:'margin_not_accepted_calculated_server_side'});
    }
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

  // FIN-10 despesas: solicitação e decisão transacionais, com alçada no
  // servidor/banco, referências canônicas e evidência somente como metadado sintético.
  const EXPENSE_TYPES = new Set(['despesa','reembolso','compra','outro']);
  const EXPENSE_STATUSES = new Set(['pendente','aprovado','rejeitado','cancelado']);
  const syntheticEvidenceUrl = v => typeof v === 'string' && /^synthetic:\/\/[A-Za-z0-9][A-Za-z0-9._/-]{4,990}$/.test(v);
  const syntheticStorageKey = v => typeof v === 'string' && /^synthetic\/[A-Za-z0-9][A-Za-z0-9._/-]{3,490}$/.test(v);
  const positiveCents = v => Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : null;
  const expenseFailure = (res, e) => {
    if (isAuditUnavailable(e)) return send(res,503,{error:'audit_unavailable'});
    if (e?.code === '23505') {
      const key=String(e.constraint||'');
      return send(res,409,{error:key.includes('idempotency')?'duplicate_idempotency_key':key.includes('evidence_storage')?'duplicate_evidence':'duplicate'});
    }
    if (e?.code === '23503') return send(res,400,{error:'invalid_reference'});
    if (e?.code === '23514') return send(res,400,{error:'invalid_expense_transition'});
    return send(res,500,{error:'internal'});
  };

  const handleExpenses = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url=new URL(req.url,`http://${req.headers.host||'localhost'}`), params=[];
      let q=`SELECT e.*, center.name AS cost_center_name, supplier.name AS supplier_name, contract.title AS contract_title
               FROM fin_expenses e
               LEFT JOIN fin_cost_centers center ON center.id=e.cost_center_id
               LEFT JOIN fin_suppliers supplier ON supplier.id=e.supplier_id
               LEFT JOIN crm_contracts contract ON contract.id=e.contract_id
              WHERE 1=1`;
      const status=url.searchParams.get('status'), type=url.searchParams.get('expense_type'), contract=url.searchParams.get('contract_id'), search=url.searchParams.get('search');
      if (status) { if(!EXPENSE_STATUSES.has(status)) return send(res,400,{error:'invalid_status'}); params.push(status); q+=` AND e.status=$${params.length}`; }
      if (type) { if(!EXPENSE_TYPES.has(type)) return send(res,400,{error:'invalid_expense_type'}); params.push(type); q+=` AND e.expense_type=$${params.length}`; }
      if (contract) { if(!uuid(contract)) return send(res,400,{error:'invalid_contract_id'}); params.push(contract); q+=` AND e.contract_id=$${params.length}`; }
      if (search != null) {
        const term=search.trim();
        if(term.length<2||term.length>200) return send(res,400,{error:'invalid_search'});
        // Curingas são literais: o padrão é escapado antes do ILIKE.
        const escaped=term.replace(/[\\%_]/g,m=>`\\${m}`);
        params.push(`%${escaped}%`);
        const idx=params.length;
        q+=` AND (e.protocol ILIKE $${idx} ESCAPE '\\' OR e.requester_name ILIKE $${idx} ESCAPE '\\' OR e.description ILIKE $${idx} ESCAPE '\\')`;
      }
      q+=' ORDER BY e.created_at DESC LIMIT 200';
      try { return send(res,200,{expenses:(await pool.query(q,params)).rows}); } catch { return send(res,500,{error:'internal'}); }
    }
    if (!['POST','PATCH'].includes(req.method)) return send(res,405,{error:'method_not_allowed'});
    if (!sameOrigin(req)) return send(res,403,{error:'forbidden_origin'});
    // TI é somente leitura no domínio FIN-10, como já ocorre em FIN-13..16.
    if (String(sess.role||sess.userRole||'').toLowerCase()==='ti') return send(res,403,{error:'read_only'});
    let body; try { body=await readJson(req); } catch { return send(res,400,{error:'invalid_json'}); }
    const actor=sess.identityId;
    if (!uuid(actor)) return send(res,401,{error:'unauthorized'});

    if (req.method === 'POST') {
      const expense_type=body.expense_type||'despesa';
      const category=typeof body.category==='string'?body.category.trim():'';
      const description=typeof body.description==='string'?body.description.trim():'';
      const amount_cents=positiveCents(body.amount_cents), threshold_cents=positiveCents(body.threshold_cents);
      const evidence_file_name=typeof body.evidence_file_name==='string'?body.evidence_file_name.trim():'';
      const evidence_file_url=typeof body.evidence_file_url==='string'?body.evidence_file_url.trim():'';
      const evidence_storage_key=typeof body.evidence_storage_key==='string'?body.evidence_storage_key.trim():'';
      const idempotency_key=typeof body.idempotency_key==='string'?body.idempotency_key.trim():'';
      const contract_id=body.contract_id, cost_center_id=body.cost_center_id, supplier_id=body.supplier_id;
      if(!EXPENSE_TYPES.has(expense_type)) return send(res,400,{error:'invalid_expense_type'});
      if(category.length<3||category.length>200) return send(res,400,{error:'category_3_200'});
      if(description.length<10||description.length>1000) return send(res,400,{error:'description_10_1000'});
      if(!amount_cents) return send(res,400,{error:'amount_positive_integer'});
      if(!threshold_cents) return send(res,400,{error:'threshold_positive_integer'});
      if(!uuid(contract_id)||!uuid(cost_center_id)||!uuid(supplier_id)) return send(res,400,{error:'canonical_references_required'});
      if(evidence_file_name.length<1||evidence_file_name.length>500||!syntheticEvidenceUrl(evidence_file_url)||!syntheticStorageKey(evidence_storage_key)) return send(res,400,{error:'synthetic_evidence_metadata_required'});
      if(idempotency_key.length<8||idempotency_key.length>200) return send(res,400,{error:'idempotency_key_8_200'});
      // O nome do solicitante deriva da identidade autenticada (auth_identities);
      // um nome digitado no corpo nunca substitui a autoria real da sessão.
      const sameExpenseContent = row => row
        && row.expense_type===expense_type
        && row.category===category
        && row.description===description
        && Number(row.amount_cents)===amount_cents
        && Number(row.threshold_cents)===threshold_cents
        && row.requester_identity===actor
        && row.evidence_file_name===evidence_file_name
        && row.evidence_file_url===evidence_file_url
        && row.evidence_storage_key===evidence_storage_key
        && row.contract_id===contract_id
        && row.cost_center_id===cost_center_id
        && row.supplier_id===supplier_id;
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        const contract=await client.query("SELECT id FROM crm_contracts WHERE id=$1 AND status NOT IN ('encerrado','cancelado')",[contract_id]);
        const center=await client.query('SELECT id FROM fin_cost_centers WHERE id=$1 AND is_active=true',[cost_center_id]);
        const supplier=await client.query('SELECT id FROM fin_suppliers WHERE id=$1 AND is_active=true',[supplier_id]);
        if(!contract.rows.length||!center.rows.length||!supplier.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'canonical_reference_not_found_or_inactive'}); }
        // Idempotência explícita por chave de negócio: retry igual devolve a
        // mesma solicitação; mesma chave com conteúdo diferente conflita.
        const existing=await client.query('SELECT * FROM fin_expenses WHERE idempotency_key=$1',[idempotency_key]);
        if(existing.rows.length) {
          const row=existing.rows[0];
          const replay=sameExpenseContent(row);
          await client.query('ROLLBACK');
          if(!replay) return send(res,409,{error:'idempotency_key_conflict'});
          return send(res,200,{expense:row,idempotent_replay:true,synthetic:true});
        }
        const identity=await client.query('SELECT display_name FROM auth_identities WHERE id=$1',[actor]);
        const displayName=typeof identity.rows[0]?.display_name==='string'?identity.rows[0].display_name.trim():'';
        const requester_name=displayName.length>=2&&displayName.length<=200?displayName:`Identidade ${actor.slice(0,8)}`;
        const protocol=generateProtocol('DES-FIN');
        const created=await client.query(`INSERT INTO fin_expenses (protocol,expense_type,category,description,amount_cents,threshold_cents,requester_name,requester_identity,evidence_file_name,evidence_file_url,evidence_storage_key,contract_id,cost_center_id,supplier_id,created_by_identity,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$8,$15) RETURNING *`,[protocol,expense_type,category,description,amount_cents,threshold_cents,requester_name,actor,evidence_file_name,evidence_file_url,evidence_storage_key,contract_id,cost_center_id,supplier_id,idempotency_key]);
        const expense=created.rows[0];
        await client.query(`INSERT INTO fin_expense_history (expense_id,previous_status,next_status,previous_amount,next_amount,changed_by_identity,reason,is_segregation_verified,snapshot_after) VALUES ($1,NULL,'pendente',NULL,$2,$3,$4,false,$5)`,[expense.id,amount_cents,actor,'Solicitação financeira criada com evidência sintética e referências canônicas',JSON.stringify(expense)]);
        await auditLog({action:'fin_expense_create',actor,target:expense.id,meta:{protocol,expense_type,amount_cents,contract_id,idempotency_key},client});
        await client.query('COMMIT');
        return send(res,201,{expense,synthetic:true});
      } catch(e) {
        try { await client.query('ROLLBACK'); } catch {}
        // Retry concorrente: a chave única decide; o perdedor reconsulta e
        // devolve replay quando o conteúdo é o mesmo.
        if(e?.code==='23505'&&String(e.constraint||'').includes('idempotency')) {
          try {
            const row=(await pool.query('SELECT * FROM fin_expenses WHERE idempotency_key=$1',[idempotency_key])).rows[0];
            if(sameExpenseContent(row)) return send(res,200,{expense:row,idempotent_replay:true,synthetic:true});
          } catch {}
          return send(res,409,{error:'idempotency_key_conflict'});
        }
        return expenseFailure(res,e);
      }
      finally { client.release(); }
    }

    const id=body.id, status=body.status, reason=typeof body.reason==='string'?body.reason.trim():'';
    if(!uuid(id)) return send(res,400,{error:'invalid_id'});
    if(!['aprovado','rejeitado','cancelado'].includes(status)) return send(res,400,{error:'invalid_transition'});
    if(reason.length<10||reason.length>1000) return send(res,400,{error:'reason_10_1000_required'});
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const found=await client.query('SELECT * FROM fin_expenses WHERE id=$1 FOR UPDATE',[id]);
      if(!found.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'not_found'}); }
      const previous=found.rows[0];
      if(previous.status!=='pendente') { await client.query('ROLLBACK'); return send(res,409,{error:'expense_not_pending'}); }
      if(status==='cancelado' && previous.requester_identity!==actor) { await client.query('ROLLBACK'); return send(res,403,{error:'only_requester_can_cancel'}); }
      if(status!=='cancelado' && previous.requester_identity===actor) { await client.query('ROLLBACK'); return send(res,403,{error:'requester_cannot_decide'}); }
      // Ausência de política configurada nunca vira aprovação automática: as
      // duas negativas são distintas para que a interface declare a pendência.
      let authority_limit=null;
      if(status==='aprovado') {
        const authority=await client.query('SELECT max_amount_cents FROM fin_expense_approval_authorities WHERE identity_id=$1 AND is_active=true',[actor]);
        if(!authority.rows.length) { await client.query('ROLLBACK'); return send(res,403,{error:'approval_authority_missing'}); }
        authority_limit=Number(authority.rows[0].max_amount_cents);
        if(Number(previous.amount_cents)>authority_limit) { await client.query('ROLLBACK'); return send(res,403,{error:'approval_authority_exceeded'}); }
      }
      // O nome do decididor deriva da identidade autenticada; o corpo não
      // escolhe quem aparece como autor da decisão.
      const identity=await client.query('SELECT display_name FROM auth_identities WHERE id=$1',[actor]);
      const displayName=typeof identity.rows[0]?.display_name==='string'?identity.rows[0].display_name.trim():'';
      const approver_name=displayName.length>=2&&displayName.length<=200?displayName:'Aprovador autenticado';
      const approver=status==='cancelado'?null:actor;
      const updated=await client.query(`UPDATE fin_expenses SET status=$1::fin_expense_status,approver_name=CASE WHEN $1::text='cancelado' THEN approver_name ELSE $2 END,approver_identity=CASE WHEN $1::text='cancelado' THEN approver_identity ELSE $3 END,approved_at=CASE WHEN $1::text='aprovado' THEN NOW() ELSE NULL END,approved_by_identity=CASE WHEN $1::text='aprovado' THEN $3 ELSE NULL END,rejection_reason=CASE WHEN $1::text='rejeitado' THEN $4 ELSE NULL END,is_segregated=CASE WHEN $1::text='cancelado' THEN is_segregated ELSE true END,segregation_checked=CASE WHEN $1::text='cancelado' THEN segregation_checked ELSE true END WHERE id=$5 RETURNING *`,[status,approver_name,approver,status==='rejeitado'?reason:null,id]);
      const expense=updated.rows[0];
      // Histórico imutável com snapshot anterior/posterior e o limite de alçada
      // efetivamente aplicado (o gatilho da 136 grava o mesmo valor na despesa).
      await client.query(`INSERT INTO fin_expense_history (expense_id,previous_status,next_status,previous_amount,next_amount,changed_by_identity,reason,is_segregation_verified,authority_limit_cents,is_authority_verified,snapshot_before,snapshot_after) VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,previous.status,status,previous.amount_cents,actor,reason,status!=='cancelado',status==='aprovado'?authority_limit:null,status==='aprovado',JSON.stringify(previous),JSON.stringify(expense)]);
      const action=status==='aprovado'?'fin_expense_approve':status==='rejeitado'?'fin_expense_reject':'fin_expense_cancel';
      await auditLog({action,actor,target:id,meta:{protocol:previous.protocol,status,reason,authority_limit_cents:status==='aprovado'?authority_limit:null,synthetic:true},client});
      await client.query('COMMIT');
      return send(res,200,{expense});
    } catch(e) { try { await client.query('ROLLBACK'); } catch {} return expenseFailure(res,e); }
    finally { client.release(); }
  };

  const handleExpenseHistory = async (req, res) => {
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method!=='GET') return send(res,405,{error:'method_not_allowed'});
    const url=new URL(req.url,`http://${req.headers.host||'localhost'}`), expense_id=url.searchParams.get('expense_id');
    if(expense_id&&!uuid(expense_id)) return send(res,400,{error:'invalid_expense_id'});
    try {
      const params=expense_id?[expense_id]:[];
      const q=`SELECT * FROM fin_expense_history${expense_id?' WHERE expense_id=$1':''} ORDER BY created_at DESC LIMIT 200`;
      return send(res,200,{history:(await pool.query(q,params)).rows});
    } catch { return send(res,500,{error:'internal'}); }
  };

  // Catálogo de alçadas, somente leitura: a interface precisa declarar quando a
  // política está ausente/inativa. Conceder alçada (quem, quanto, com qual
  // aprovação) é decisão de negócio pendente do proprietário e não é exposta
  // como mutação nesta fatia — a configuração segue por backoffice explícito.
  const handleExpenseAuthorities = async (req, res) => {
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method!=='GET') return send(res,405,{error:'method_not_allowed'});
    try {
      const { rows }=await pool.query(`SELECT a.identity_id, i.display_name, a.max_amount_cents, a.is_active, a.granted_by_identity, a.granted_at, a.updated_at FROM fin_expense_approval_authorities a LEFT JOIN auth_identities i ON i.id=a.identity_id ORDER BY a.granted_at DESC LIMIT 200`);
      return send(res,200,{authorities:rows});
    } catch { return send(res,500,{error:'internal'}); }
  };

  // FIN-11 integração contábil/fiscal mediante provedor.
  //
  // Provedor e obrigação são entidades separadas. A obrigação NUNCA é
  // assumida: ela é determinada pela atividade do contrato através de uma
  // regra canônica e explícita (fin_fiscal_activity_rules), que cobre NFS-e,
  // NF-e, NFC-e, CT-e e "outra obrigação". Nenhuma emissão fiscal real
  // acontece: o provedor é sempre sandbox, o documento é sempre simulado e
  // as respostas do provedor são sintéticas e geradas localmente.
  const FISCAL_DOC_TYPES = new Set(['nfse','nfe','nfce','cte','outro']);
  const PROVIDER_STATUSES = new Set(['nao_configurado','configurado','falha']);
  const OBLIGATION_STATUSES = new Set(['pendente','determinada','cancelada']);
  const DOCUMENT_STATUSES = new Set(['rascunho','emitido','cancelado','erro']);
  const FISCAL_ENTITIES = new Set(['provider','obligation','document']);
  const activityCode = v => typeof v === 'string' && /^[a-z][a-z0-9_]{2,99}$/.test(v);
  const providerCode = v => typeof v === 'string' && /^[a-z][a-z0-9_-]{2,59}$/.test(v);
  const syntheticFiscalUrl = v => typeof v === 'string' && /^synthetic:\/\/[A-Za-z0-9][A-Za-z0-9._/-]{4,990}$/.test(v);
  const syntheticFiscalKey = v => typeof v === 'string' && /^synthetic\/[A-Za-z0-9][A-Za-z0-9._/-]{3,490}$/.test(v);
  const CREDENTIAL_KEYS = new Set(['token','secret','password','senha','certificate','certificado','private_key']);
  // Allowlist: somente códigos de domínio conhecidos chegam ao cliente. Nenhuma
  // mensagem, constraint ou posição vinda do PostgreSQL é repassada.
  const FISCAL_GUARD_CODES = new Set([
    'fin_fiscal_activity_rule_immutable',
    'fin_fiscal_activity_rule_inactive',
    'fin_fiscal_provider_initial_status_must_be_nao_configurado',
    'fin_fiscal_provider_initial_fields_invalid',
    'fin_fiscal_provider_identity_fields_immutable',
    'fin_fiscal_provider_status_transition_required',
    'fin_fiscal_provider_invalid_status_transition',
    'fin_fiscal_provider_error_sanitized_required',
    'fin_fiscal_provider_error_only_on_failure',
    'fin_fiscal_provider_configured_requires_timestamp',
    'fin_fiscal_provider_credentials_refused',
    'fin_fiscal_obligation_activity_rule_required',
    'fin_fiscal_obligation_activity_rule_inactive',
    'fin_fiscal_obligation_initial_status_must_be_pendente',
    'fin_fiscal_obligation_determination_fields_immutable',
    'fin_fiscal_obligation_status_transition_required',
    'fin_fiscal_obligation_invalid_status_transition',
    'fin_fiscal_obligation_activity_must_match_rule',
    'fin_fiscal_obligation_type_must_follow_activity_rule',
    'fin_fiscal_obligation_determination_reference_mismatch',
    'fin_fiscal_document_obligation_required',
    'fin_fiscal_document_provider_required',
    'fin_fiscal_document_initial_status_must_be_rascunho',
    'fin_fiscal_document_requires_determined_obligation',
    'fin_fiscal_document_requires_configured_provider',
    'fin_fiscal_document_request_fields_immutable',
    'fin_fiscal_document_status_transition_required',
    'fin_fiscal_document_invalid_status_transition',
    'fin_fiscal_document_type_must_match_obligation',
    'fin_fiscal_document_provider_does_not_support_obligation',
    'fin_fiscal_document_real_emission_refused',
    'fin_fiscal_document_synthetic_response_required',
  ]);
  const fiscalFailure = (res, e) => {
    if (isAuditUnavailable(e)) return send(res,503,{error:'audit_unavailable'});
    if (e?.code === '23505') {
      const key = String(e.constraint||'');
      return send(res,409,{error:key.includes('idempotency')?'duplicate_idempotency_key':key.includes('contract_activity')?'duplicate_obligation_for_activity':key.includes('provider_code')?'duplicate_provider_code':'duplicate'});
    }
    if (e?.code === '23503') return send(res,400,{error:'invalid_reference'});
    if (e?.code === '23514') {
      const message = String(e.message||'');
      const known = [...FISCAL_GUARD_CODES].find(code => message === code);
      return send(res,400,{error:known||'invalid_fiscal_transition'});
    }
    if (e?.code === '22P02' || e?.code === '22007') return send(res,400,{error:'invalid'});
    return send(res,500,{error:'internal'});
  };
  // node-pg não possui parser para array de enum: normalizamos para texto.
  const parseObligationArray = value => Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string' && value.startsWith('{')
      ? value.slice(1,-1).split(',').map(item => item.replaceAll('"','').trim()).filter(Boolean)
      : [];
  const normalizeProvider = row => row ? { ...row, supported_obligations: parseObligationArray(row.supported_obligations) } : row;
  const insertFiscalHistory = (client, entity_type, entity_id, previous_status, next_status, actor, reason, metadata) =>
    client.query(
      'INSERT INTO fin_fiscal_history (entity_type,entity_id,previous_status,next_status,changed_by_identity,reason,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [entity_type, entity_id, previous_status, next_status, actor, reason, JSON.stringify(metadata||{})]
    );

  const handleFiscalActivityRules = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res,405,{error:'method_not_allowed'});
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`), params = [];
    let q = 'SELECT * FROM fin_fiscal_activity_rules WHERE 1=1';
    const code = url.searchParams.get('activity_code');
    if (code) { if (!activityCode(code)) return send(res,400,{error:'invalid_activity_code'}); params.push(code); q += ` AND activity_code=$${params.length}`; }
    const type = url.searchParams.get('obligation_type');
    if (type) { if (!FISCAL_DOC_TYPES.has(type)) return send(res,400,{error:'invalid_obligation_type'}); params.push(type); q += ` AND obligation_type=$${params.length}`; }
    const active = url.searchParams.get('is_active');
    if (active) { if (!['true','false'].includes(active)) return send(res,400,{error:'invalid_is_active'}); params.push(active==='true'); q += ` AND is_active=$${params.length}`; }
    q += ' ORDER BY activity_code ASC LIMIT 200';
    try { return send(res,200,{rules:(await pool.query(q,params)).rows}); } catch { return send(res,500,{error:'internal'}); }
  };

  const handleFiscalProviders = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`), params = [];
      let q = 'SELECT * FROM fin_fiscal_providers WHERE 1=1';
      const status = url.searchParams.get('status');
      if (status) { if (!PROVIDER_STATUSES.has(status)) return send(res,400,{error:'invalid_status'}); params.push(status); q += ` AND status=$${params.length}`; }
      q += ' ORDER BY created_at DESC LIMIT 200';
      try { return send(res,200,{providers:(await pool.query(q,params)).rows.map(normalizeProvider)}); } catch { return send(res,500,{error:'internal'}); }
    }
    if (!['POST','PATCH'].includes(req.method)) return send(res,405,{error:'method_not_allowed'});
    if (!sameOrigin(req)) return send(res,403,{error:'forbidden_origin'});
    let body; try { body = await readJson(req); } catch { return send(res,400,{error:'invalid_json'}); }
    const actor = sess.identityId;
    if (!uuid(actor)) return send(res,401,{error:'unauthorized'});

    if (req.method === 'POST') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const provider_code = typeof body.provider_code === 'string' ? body.provider_code.trim() : '';
      const idempotency_key = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
      const supported = Array.isArray(body.supported_obligations) ? body.supported_obligations : [];
      const config = body.config && typeof body.config === 'object' && !Array.isArray(body.config) ? body.config : {};
      if (name.length < 3 || name.length > 200) return send(res,400,{error:'name_3_200'});
      if (!providerCode(provider_code)) return send(res,400,{error:'provider_code_required'});
      if (idempotency_key.length < 8 || idempotency_key.length > 200) return send(res,400,{error:'idempotency_key_8_200'});
      if (!supported.length || supported.length > 5 || supported.some(item => !FISCAL_DOC_TYPES.has(item)) || new Set(supported).size !== supported.length) {
        return send(res,400,{error:'supported_obligations_required_nfse_nfe_nfce_cte_outro'});
      }
      if (Object.keys(config).some(key => CREDENTIAL_KEYS.has(String(key).toLowerCase()))) return send(res,400,{error:'credentials_refused_sandbox_only'});
      if (body.environment != null && body.environment !== 'sandbox') return send(res,400,{error:'environment_must_be_sandbox'});
      if (body.status != null && body.status !== 'nao_configurado') return send(res,400,{error:'provider_starts_nao_configurado'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const created = await client.query(
          `INSERT INTO fin_fiscal_providers (name,provider_code,provider_type,status,environment,supported_obligations,config,idempotency_key,created_by_identity)
           VALUES ($1,$2,$3::fin_fiscal_doc_type,'nao_configurado','sandbox',$4::fin_fiscal_doc_type[],$5,$6,$7) RETURNING *`,
          [name, provider_code, supported[0], supported, JSON.stringify(config), idempotency_key, actor]
        );
        const provider = normalizeProvider(created.rows[0]);
        await insertFiscalHistory(client,'provider',provider.id,null,'nao_configurado',actor,'Provedor fiscal sandbox cadastrado sem credenciais reais',{provider_code,supported_obligations:supported});
        await auditLog({action:'fin_fiscal_provider_create',actor,target:provider.id,meta:{provider_code,supported_obligations:supported,environment:'sandbox'},client});
        await client.query('COMMIT');
        return send(res,201,{provider,synthetic:true});
      } catch(e) { try { await client.query('ROLLBACK'); } catch {} return fiscalFailure(res,e); }
      finally { client.release(); }
    }

    const id = body.id, status = body.status;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const error_sanitized = typeof body.error_sanitized === 'string' ? body.error_sanitized.trim() : '';
    if (!uuid(id)) return send(res,400,{error:'invalid_id'});
    if (!['configurado','falha','nao_configurado'].includes(status)) return send(res,400,{error:'invalid_transition'});
    if (reason.length < 10 || reason.length > 1000) return send(res,400,{error:'reason_10_1000_required'});
    if (status === 'falha' && (error_sanitized.length < 10 || error_sanitized.length > 1000)) return send(res,400,{error:'error_sanitized_10_1000_required'});
    const config = body.config && typeof body.config === 'object' && !Array.isArray(body.config) ? body.config : null;
    if (config && Object.keys(config).some(key => CREDENTIAL_KEYS.has(String(key).toLowerCase()))) return send(res,400,{error:'credentials_refused_sandbox_only'});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM fin_fiscal_providers WHERE id=$1 FOR UPDATE',[id]);
      if (!found.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'not_found'}); }
      const previous = found.rows[0];
      if (previous.status === status) { await client.query('ROLLBACK'); return send(res,409,{error:'provider_already_in_status'}); }
      const updated = await client.query(
        `UPDATE fin_fiscal_providers
            SET status=$1::fin_fiscal_provider_status,
                config=COALESCE($2::jsonb,config),
                last_processed_at=CASE WHEN $1::text='configurado' THEN NOW() WHEN $1::text='nao_configurado' THEN NULL ELSE last_processed_at END,
                error_sanitized=CASE WHEN $1::text='falha' THEN $3 ELSE NULL END
          WHERE id=$4 RETURNING *`,
        [status, config ? JSON.stringify(config) : null, status === 'falha' ? error_sanitized : null, id]
      );
      await insertFiscalHistory(client,'provider',id,previous.status,status,actor,reason,{provider_code:previous.provider_code});
      await auditLog({action:'fin_fiscal_provider_transition',actor,target:id,meta:{previous_status:previous.status,next_status:status,reason},client});
      await client.query('COMMIT');
      return send(res,200,{provider:normalizeProvider(updated.rows[0])});
    } catch(e) { try { await client.query('ROLLBACK'); } catch {} return fiscalFailure(res,e); }
    finally { client.release(); }
  };

  const handleFiscalObligations = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`), params = [];
      let q = 'SELECT * FROM fin_fiscal_obligations WHERE 1=1';
      const contract = url.searchParams.get('contract_id');
      if (contract) { if (!uuid(contract)) return send(res,400,{error:'invalid_contract_id'}); params.push(contract); q += ` AND contract_id=$${params.length}`; }
      const type = url.searchParams.get('obligation_type');
      if (type) { if (!FISCAL_DOC_TYPES.has(type)) return send(res,400,{error:'invalid_obligation_type'}); params.push(type); q += ` AND obligation_type=$${params.length}`; }
      const status = url.searchParams.get('status');
      if (status) { if (!OBLIGATION_STATUSES.has(status)) return send(res,400,{error:'invalid_status'}); params.push(status); q += ` AND status=$${params.length}`; }
      const code = url.searchParams.get('activity_type');
      if (code) { if (!activityCode(code)) return send(res,400,{error:'invalid_activity_type'}); params.push(code); q += ` AND activity_type=$${params.length}`; }
      q += ' ORDER BY created_at DESC LIMIT 200';
      try { return send(res,200,{obligations:(await pool.query(q,params)).rows}); } catch { return send(res,500,{error:'internal'}); }
    }
    if (!['POST','PATCH'].includes(req.method)) return send(res,405,{error:'method_not_allowed'});
    if (!sameOrigin(req)) return send(res,403,{error:'forbidden_origin'});
    let body; try { body = await readJson(req); } catch { return send(res,400,{error:'invalid_json'}); }
    const actor = sess.identityId;
    if (!uuid(actor)) return send(res,401,{error:'unauthorized'});

    if (req.method === 'POST') {
      const contract_id = body.contract_id, client_account_id = body.client_account_id;
      const activity_type = typeof body.activity_type === 'string' ? body.activity_type.trim() : '';
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      const idempotency_key = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
      const notes = body.notes == null ? null : String(body.notes).trim();
      if (!uuid(contract_id) || !uuid(client_account_id)) return send(res,400,{error:'canonical_references_required'});
      if (!activityCode(activity_type)) return send(res,400,{error:'activity_type_required_canonical_code'});
      if (description.length < 10 || description.length > 1000) return send(res,400,{error:'description_10_1000'});
      if (idempotency_key.length < 8 || idempotency_key.length > 200) return send(res,400,{error:'idempotency_key_8_200'});
      if (notes && (notes.length < 10 || notes.length > 2000)) return send(res,400,{error:'notes_10_2000'});
      if (body.rule != null) return send(res,400,{error:'rule_is_derived_from_activity_rule'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const rule = await client.query('SELECT * FROM fin_fiscal_activity_rules WHERE activity_code=$1',[activity_type]);
        if (!rule.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'activity_rule_not_found'}); }
        if (!rule.rows[0].is_active) { await client.query('ROLLBACK'); return send(res,409,{error:'activity_rule_inactive'}); }
        // A obrigação é determinada pela regra; o cliente não escolhe o tipo.
        if (body.obligation_type != null && body.obligation_type !== rule.rows[0].obligation_type) {
          await client.query('ROLLBACK');
          return send(res,409,{error:'obligation_type_determined_by_activity_rule',determined_obligation_type:rule.rows[0].obligation_type,rule_reference:rule.rows[0].rule_reference});
        }
        const contract = await client.query("SELECT id FROM crm_contracts WHERE id=$1 AND status NOT IN ('encerrado','cancelado')",[contract_id]);
        const account = await client.query('SELECT id FROM client_accounts WHERE id=$1',[client_account_id]);
        if (!contract.rows.length || !account.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'canonical_reference_not_found_or_inactive'}); }
        const ruleText = `${rule.rows[0].rule_reference} — ${rule.rows[0].rule_description}`.slice(0,1000);
        const availableProviders = await client.query(
          `SELECT id FROM fin_fiscal_providers
            WHERE status='configurado' AND is_active=true
              AND supported_obligations @> ARRAY[$1::fin_fiscal_doc_type]`,
          [rule.rows[0].obligation_type]
        );
        const created = await client.query(
          `INSERT INTO fin_fiscal_obligations (contract_id,client_account_id,obligation_type,activity_type,activity_rule_id,description,rule,notes,status,is_determined,idempotency_key,created_by_identity)
           VALUES ($1,$2,$3::fin_fiscal_doc_type,$4,$5,$6,$7,$8,'pendente',false,$9,$10) RETURNING *`,
          [contract_id, client_account_id, rule.rows[0].obligation_type, activity_type, rule.rows[0].id, description, ruleText, notes, idempotency_key, actor]
        );
        const obligation = created.rows[0];
        await insertFiscalHistory(client,'obligation',obligation.id,null,'pendente',actor,'Obrigação fiscal criada a partir da regra canônica da atividade',{activity_type,obligation_type:obligation.obligation_type,rule_reference:rule.rows[0].rule_reference});
        await auditLog({action:'fin_fiscal_obligation_create',actor,target:obligation.id,meta:{activity_type,obligation_type:obligation.obligation_type,rule_reference:rule.rows[0].rule_reference,idempotency_key},client});
        await client.query('COMMIT');
        return send(res,201,{
          obligation,
          activity_rule:rule.rows[0],
          provider_pending: availableProviders.rows.length === 0,
          provider_pending_reason: availableProviders.rows.length === 0
            ? 'no_configured_sandbox_provider_for_determined_obligation'
            : null,
          synthetic:true,
        });
      } catch(e) { try { await client.query('ROLLBACK'); } catch {} return fiscalFailure(res,e); }
      finally { client.release(); }
    }

    const id = body.id, status = body.status;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!uuid(id)) return send(res,400,{error:'invalid_id'});
    if (!['determinada','cancelada'].includes(status)) return send(res,400,{error:'invalid_transition'});
    if (reason.length < 10 || reason.length > 1000) return send(res,400,{error:'reason_10_1000_required'});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM fin_fiscal_obligations WHERE id=$1 FOR UPDATE',[id]);
      if (!found.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'not_found'}); }
      const previous = found.rows[0];
      if (previous.status === 'cancelada') { await client.query('ROLLBACK'); return send(res,409,{error:'obligation_already_cancelled'}); }
      if (status === 'determinada' && previous.status !== 'pendente') { await client.query('ROLLBACK'); return send(res,409,{error:'obligation_not_pending'}); }
      const rule = await client.query('SELECT * FROM fin_fiscal_activity_rules WHERE id=$1',[previous.activity_rule_id]);
      if (!rule.rows.length) { await client.query('ROLLBACK'); return send(res,409,{error:'activity_rule_missing'}); }
      if (status === 'determinada' && !rule.rows[0].is_active) { await client.query('ROLLBACK'); return send(res,409,{error:'activity_rule_inactive'}); }
      const updated = status === 'determinada'
        ? await client.query(
            `UPDATE fin_fiscal_obligations SET status='determinada',is_determined=true,determined_by_identity=$1,determined_at=NOW(),determination_rule_reference=$2 WHERE id=$3 RETURNING *`,
            [actor, rule.rows[0].rule_reference, id])
        : await client.query(
            `UPDATE fin_fiscal_obligations SET status='cancelada',cancelled_at=NOW(),cancel_reason=$1 WHERE id=$2 RETURNING *`,
            [reason, id]);
      await insertFiscalHistory(client,'obligation',id,previous.status,status,actor,reason,{obligation_type:previous.obligation_type,activity_type:previous.activity_type,rule_reference:rule.rows[0].rule_reference});
      await auditLog({action:status==='determinada'?'fin_fiscal_obligation_determine':'fin_fiscal_obligation_cancel',actor,target:id,meta:{previous_status:previous.status,next_status:status,reason,rule_reference:rule.rows[0].rule_reference},client});
      await client.query('COMMIT');
      return send(res,200,{obligation:updated.rows[0]});
    } catch(e) { try { await client.query('ROLLBACK'); } catch {} return fiscalFailure(res,e); }
    finally { client.release(); }
  };

  const handleFiscalDocuments = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`), params = [];
      let q = 'SELECT * FROM fin_fiscal_documents WHERE 1=1';
      const obligation = url.searchParams.get('obligation_id');
      if (obligation) { if (!uuid(obligation)) return send(res,400,{error:'invalid_obligation_id'}); params.push(obligation); q += ` AND obligation_id=$${params.length}`; }
      const provider = url.searchParams.get('provider_id');
      if (provider) { if (!uuid(provider)) return send(res,400,{error:'invalid_provider_id'}); params.push(provider); q += ` AND provider_id=$${params.length}`; }
      const status = url.searchParams.get('status');
      if (status) { if (!DOCUMENT_STATUSES.has(status)) return send(res,400,{error:'invalid_status'}); params.push(status); q += ` AND status=$${params.length}`; }
      const type = url.searchParams.get('document_type');
      if (type) { if (!FISCAL_DOC_TYPES.has(type)) return send(res,400,{error:'invalid_document_type'}); params.push(type); q += ` AND document_type=$${params.length}`; }
      q += ' ORDER BY created_at DESC LIMIT 200';
      try { return send(res,200,{documents:(await pool.query(q,params)).rows}); } catch { return send(res,500,{error:'internal'}); }
    }
    if (!['POST','PATCH'].includes(req.method)) return send(res,405,{error:'method_not_allowed'});
    if (!sameOrigin(req)) return send(res,403,{error:'forbidden_origin'});
    let body; try { body = await readJson(req); } catch { return send(res,400,{error:'invalid_json'}); }
    const actor = sess.identityId;
    if (!uuid(actor)) return send(res,401,{error:'unauthorized'});

    if (req.method === 'POST') {
      const obligation_id = body.obligation_id, provider_id = body.provider_id;
      const amount_cents = positiveCents(body.amount_cents);
      const file_name = typeof body.file_name === 'string' ? body.file_name.trim() : '';
      const file_url = typeof body.file_url === 'string' ? body.file_url.trim() : '';
      const storage_key = typeof body.storage_key === 'string' ? body.storage_key.trim() : '';
      const idempotency_key = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
      if (!uuid(obligation_id)) return send(res,400,{error:'obligation_reference_required'});
      if (!uuid(provider_id)) {
        return send(res,409,{error:'provider_not_selected_obligation_pending',note:'A obrigação permanece pendente até haver provedor sandbox configurado; nenhuma emissão foi simulada.'});
      }
      if (!amount_cents) return send(res,400,{error:'amount_positive_integer'});
      if (file_name.length < 1 || file_name.length > 500 || !syntheticFiscalUrl(file_url) || !syntheticFiscalKey(storage_key)) return send(res,400,{error:'synthetic_document_metadata_required'});
      if (idempotency_key.length < 8 || idempotency_key.length > 200) return send(res,400,{error:'idempotency_key_8_200'});
      if (body.is_sandbox === false || body.simulated === false) return send(res,400,{error:'real_emission_refused_sandbox_only'});
      if (body.issue_date != null && !isoDate(body.issue_date)) return send(res,400,{error:'invalid_issue_date'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const obligation = await client.query('SELECT * FROM fin_fiscal_obligations WHERE id=$1 FOR SHARE',[obligation_id]);
        if (!obligation.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'obligation_not_found'}); }
        if (obligation.rows[0].status !== 'determinada') { await client.query('ROLLBACK'); return send(res,409,{error:'obligation_not_determined'}); }
        const provider = await client.query('SELECT * FROM fin_fiscal_providers WHERE id=$1 FOR SHARE',[provider_id]);
        if (!provider.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'provider_not_found'}); }
        if (provider.rows[0].status !== 'configurado' || !provider.rows[0].is_active) { await client.query('ROLLBACK'); return send(res,409,{error:'provider_not_configured'}); }
        const determined = obligation.rows[0].obligation_type;
        // O tipo do documento é o da obrigação determinada; nunca um padrão fixo.
        if (body.document_type != null && body.document_type !== determined) {
          await client.query('ROLLBACK');
          return send(res,409,{error:'document_type_determined_by_obligation',determined_obligation_type:determined});
        }
        if (!parseObligationArray(provider.rows[0].supported_obligations).includes(determined)) { await client.query('ROLLBACK'); return send(res,409,{error:'provider_does_not_support_obligation',determined_obligation_type:determined}); }
        const protocol = generateProtocol('NF-FIN');
        const created = await client.query(
          `INSERT INTO fin_fiscal_documents (protocol,obligation_id,provider_id,document_type,status,issue_date,amount_cents,file_name,file_url,storage_key,is_sandbox,simulated,idempotency_key,created_by_identity)
           VALUES ($1,$2,$3,$4::fin_fiscal_doc_type,'rascunho',COALESCE($5::date,CURRENT_DATE),$6,$7,$8,$9,true,true,$10,$11) RETURNING *`,
          [protocol, obligation_id, provider_id, determined, body.issue_date||null, amount_cents, file_name, file_url, storage_key, idempotency_key, actor]
        );
        const document = created.rows[0];
        await insertFiscalHistory(client,'document',document.id,null,'rascunho',actor,'Documento fiscal sintético preparado em sandbox sem emissão real',{protocol,document_type:determined,obligation_id});
        await auditLog({action:'fin_fiscal_document_create',actor,target:document.id,meta:{protocol,document_type:determined,obligation_id,provider_id,idempotency_key,simulated:true},client});
        await client.query('COMMIT');
        return send(res,201,{document,synthetic:true,emitted:false});
      } catch(e) { try { await client.query('ROLLBACK'); } catch {} return fiscalFailure(res,e); }
      finally { client.release(); }
    }

    const id = body.id, status = body.status;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const error_sanitized = typeof body.error_sanitized === 'string' ? body.error_sanitized.trim() : '';
    if (!uuid(id)) return send(res,400,{error:'invalid_id'});
    if (!['emitido','erro','cancelado'].includes(status)) return send(res,400,{error:'invalid_transition'});
    if (reason.length < 10 || reason.length > 1000) return send(res,400,{error:'reason_10_1000_required'});
    if (status === 'erro' && (error_sanitized.length < 10 || error_sanitized.length > 1000)) return send(res,400,{error:'error_sanitized_10_1000_required'});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM fin_fiscal_documents WHERE id=$1 FOR UPDATE',[id]);
      if (!found.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'not_found'}); }
      const previous = found.rows[0];
      if (previous.status === 'cancelado') { await client.query('ROLLBACK'); return send(res,409,{error:'document_already_cancelled'}); }
      if (previous.status === status) { await client.query('ROLLBACK'); return send(res,409,{error:'document_already_in_status'}); }
      if (previous.status === 'emitido' && status !== 'cancelado') { await client.query('ROLLBACK'); return send(res,409,{error:'document_already_registered'}); }
      // Resposta do provedor é gerada localmente: simulada, nunca do fisco.
      const syntheticResponse = {
        mode: 'synthetic',
        simulated: true,
        emission: 'none',
        synthetic_reference: `SYN-${previous.protocol}`,
        registered_at: new Date().toISOString(),
      };
      const updated = status === 'emitido'
        ? await client.query(
            `UPDATE fin_fiscal_documents SET status='emitido',provider_response=$1,error_sanitized=NULL,cancel_reason=NULL WHERE id=$2 RETURNING *`,
            [JSON.stringify(syntheticResponse), id])
        : status === 'erro'
          ? await client.query(
              `UPDATE fin_fiscal_documents SET status='erro',error_sanitized=$1,cancel_reason=NULL WHERE id=$2 RETURNING *`,
              [error_sanitized, id])
          : await client.query(
              `UPDATE fin_fiscal_documents SET status='cancelado',cancel_reason=$1,error_sanitized=NULL WHERE id=$2 RETURNING *`,
              [reason, id]);
      await insertFiscalHistory(client,'document',id,previous.status,status,actor,reason,{protocol:previous.protocol,document_type:previous.document_type,simulated:true});
      await auditLog({action:`fin_fiscal_document_${status}`,actor,target:id,meta:{previous_status:previous.status,next_status:status,reason,simulated:true},client});
      await client.query('COMMIT');
      return send(res,200,{document:updated.rows[0],synthetic:true,emitted:false});
    } catch(e) { try { await client.query('ROLLBACK'); } catch {} return fiscalFailure(res,e); }
    finally { client.release(); }
  };

  const handleFiscalHistory = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res,405,{error:'method_not_allowed'});
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`), params = [];
    let q = 'SELECT * FROM fin_fiscal_history WHERE 1=1';
    const entity_type = url.searchParams.get('entity_type');
    if (entity_type) { if (!FISCAL_ENTITIES.has(entity_type)) return send(res,400,{error:'invalid_entity_type'}); params.push(entity_type); q += ` AND entity_type=$${params.length}`; }
    const entity_id = url.searchParams.get('entity_id');
    if (entity_id) { if (!uuid(entity_id)) return send(res,400,{error:'invalid_entity_id'}); params.push(entity_id); q += ` AND entity_id=$${params.length}`; }
    q += ' ORDER BY created_at DESC LIMIT 200';
    try { return send(res,200,{history:(await pool.query(q,params)).rows}); } catch { return send(res,500,{error:'internal'}); }
  };

  // FIN-12 boletos/Pix/gateway: seleção explícita + homologação sandbox antes
  // de qualquer cobrança, assinatura de webhook verificada de verdade
  // (HMAC-SHA256 sobre mensagem canônica), replay contabilizado por chave de
  // idempotência, conciliação explícita e nenhuma cobrança real em nenhum
  // caminho. O "provedor" é um simulador local e rotulado.
  const GATEWAY_TYPES = new Set(['boleto','pix','cartao','gateway','outro']);
  const GATEWAY_STATUSES = new Set(['nao_selecionado','selecionado','sandbox','desativado']);
  const GATEWAY_TRANSITIONS = new Set(['selecionado','sandbox','nao_selecionado','desativado']);
  const WEBHOOK_STATUSES = new Set(['validado','rejeitado','conciliado']);
  const CHARGE_STATUSES = new Set(['pendente','pago','falhou','cancelado','estornado']);
  const CHARGE_TRANSITIONS = new Set(['falhou','cancelado','estornado']);
  const GATEWAY_ENTITIES = new Set(['gateway','webhook','charge']);
  const GATEWAY_CREDENTIAL_KEYS = new Set(['token','secret','password','senha','api_key','apikey','certificate','certificado','private_key','client_secret']);
  const gatewayCode = v => typeof v === 'string' && /^[a-z][a-z0-9_-]{2,59}$/.test(v);
  const hex64 = v => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
  const plainObject = v => v != null && typeof v === 'object' && !Array.isArray(v);
  // JSON canônico (chaves ordenadas) para que a assinatura não dependa da
  // ordem de serialização do cliente.
  const canonicalJson = value => {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (plainObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    return JSON.stringify(value === undefined ? null : value);
  };
  const payloadDigest = payload => createHash('sha256').update(canonicalJson(payload)).digest('hex');
  const canonicalMessage = (code, event_type, idempotency_key, digest) => `${code}.${event_type}.${idempotency_key}.${digest}`;
  const signMessage = (secret, message) => createHmac('sha256', secret).update(message).digest('hex');
  const signatureMatches = (expected, provided) => {
    if (typeof provided !== 'string' || provided.length !== expected.length) return false;
    try { return timingSafeEqual(Buffer.from(expected,'utf8'), Buffer.from(provided,'utf8')); } catch { return false; }
  };
  const FIN12_GUARD_CODES = new Set([
    'fin_gateway_production_refused_sem_cobranca_real',
    'fin_gateway_credentials_refused',
    'fin_gateway_initial_status_must_be_nao_selecionado',
    'fin_gateway_initial_fields_invalid',
    'fin_gateway_identity_fields_immutable',
    'fin_gateway_status_transition_required',
    'fin_gateway_invalid_status_transition',
    'fin_gateway_sandbox_validation_required',
    'fin_gateway_charge_gateway_required',
    'fin_gateway_charge_real_payment_refused',
    'fin_gateway_charge_initial_status_must_be_pendente',
    'fin_gateway_charge_requires_selected_sandbox_gateway',
    'fin_gateway_charge_request_fields_immutable',
    'fin_gateway_charge_status_transition_required',
    'fin_gateway_charge_invalid_status_transition',
    'fin_gateway_charge_paid_requires_conciliated_webhook',
    'fin_gateway_webhook_gateway_required',
    'fin_gateway_webhook_initial_status_must_be_validado_or_rejeitado',
    'fin_gateway_webhook_initial_fields_invalid',
    'fin_gateway_webhook_requires_selected_gateway',
    'fin_gateway_webhook_receipt_fields_immutable',
    'fin_gateway_webhook_only_replay_counter_may_change',
    'fin_gateway_webhook_invalid_status_transition',
    'fin_gateway_webhook_conciliation_requires_charge',
    'fin_gateway_webhook_charge_gateway_mismatch',
    'fin_gateway_webhook_charge_not_pending',
    'fin_gateway_webhook_charge_already_conciliated',
    'fin_gateway_webhook_payload_does_not_match_charge',
    'fin_gateway_payment_charge_required',
    'fin_gateway_payment_must_match_receivable_and_charge_amount',
    'fin_gateway_payment_invalid_settlement_state',
    'fin_gateway_payment_estorno_requires_original_settlement',
    'fin_gateway_charge_paid_requires_receivable_payment',
  ]);
  const gatewayFailure = (res, e) => {
    if (isAuditUnavailable(e)) return send(res,503,{error:'audit_unavailable'});
    if (e?.code === '23505') {
      const key = String(e.constraint||'');
      return send(res,409,{error:key.includes('idempotency')?'duplicate_idempotency_key':key.includes('code')?'duplicate_gateway_code':key.includes('receivable_open')?'duplicate_open_charge_for_receivable':key.includes('name')?'duplicate_name':'duplicate'});
    }
    if (e?.code === '23503') return send(res,400,{error:'invalid_reference'});
    if (e?.code === '23514') {
      const message = String(e.message||'');
      const known = [...FIN12_GUARD_CODES].find(code => message === code);
      return send(res,400,{error:known||'invalid_gateway_transition'});
    }
    if (e?.code === '22P02' || e?.code === '22007') return send(res,400,{error:'invalid'});
    return send(res,500,{error:'internal'});
  };
  const insertGatewayHistory = (client, entity_type, entity_id, previous_status, next_status, actor, reason, metadata) =>
    client.query(
      'INSERT INTO fin_gateway_history (entity_type,entity_id,previous_status,next_status,changed_by_identity,reason,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [entity_type, entity_id, previous_status, next_status, actor, reason, JSON.stringify(metadata||{})]
    );
  // O segredo sintético do simulador nunca sai da borda do servidor.
  const publicGateway = row => {
    if (!row) return row;
    const { webhook_secret_sandbox, webhook_secret_hash, ...rest } = row;
    return { ...rest, has_sandbox_secret: Boolean(webhook_secret_sandbox), charge_enabled: row.status === 'sandbox' && row.is_selected === true && row.is_active === true };
  };

  const handleGateways = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`), params = [];
      let q = 'SELECT * FROM fin_payment_gateways WHERE 1=1';
      const status = url.searchParams.get('status');
      if (status) { if (!GATEWAY_STATUSES.has(status)) return send(res,400,{error:'invalid_status'}); params.push(status); q += ` AND status=$${params.length}`; }
      const type = url.searchParams.get('gateway_type');
      if (type) { if (!GATEWAY_TYPES.has(type)) return send(res,400,{error:'invalid_gateway_type'}); params.push(type); q += ` AND gateway_type=$${params.length}`; }
      q += ' ORDER BY created_at DESC LIMIT 200';
      try { return send(res,200,{gateways:(await pool.query(q,params)).rows.map(publicGateway)}); } catch { return send(res,500,{error:'internal'}); }
    }
    if (!['POST','PATCH'].includes(req.method)) return send(res,405,{error:'method_not_allowed'});
    if (!sameOrigin(req)) return send(res,403,{error:'forbidden_origin'});
    let body; try { body = await readJson(req); } catch { return send(res,400,{error:'invalid_json'}); }
    const actor = sess.identityId;
    if (!uuid(actor)) return send(res,401,{error:'unauthorized'});

    if (req.method === 'POST') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const code = typeof body.gateway_code === 'string' ? body.gateway_code.trim() : '';
      const gateway_type = typeof body.gateway_type === 'string' ? body.gateway_type.trim() : '';
      const idempotency_key = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
      const config = plainObject(body.config) ? body.config : {};
      if (name.length < 3 || name.length > 200) return send(res,400,{error:'name_3_200'});
      if (!gatewayCode(code)) return send(res,400,{error:'gateway_code_required'});
      if (!GATEWAY_TYPES.has(gateway_type)) return send(res,400,{error:'gateway_type_required_boleto_pix_cartao_gateway_outro'});
      if (idempotency_key.length < 8 || idempotency_key.length > 200) return send(res,400,{error:'idempotency_key_8_200'});
      if (Object.keys(config).some(key => GATEWAY_CREDENTIAL_KEYS.has(String(key).toLowerCase()))) return send(res,400,{error:'credentials_refused_sandbox_only'});
      if (body.environment != null && body.environment !== 'sandbox') return send(res,400,{error:'environment_must_be_sandbox'});
      if (body.is_sandbox === false) return send(res,400,{error:'real_charge_refused_sandbox_only'});
      if (body.status != null && body.status !== 'nao_selecionado') return send(res,400,{error:'gateway_starts_nao_selecionado'});
      if (body.is_selected === true) return send(res,400,{error:'selection_is_an_explicit_transition'});
      // Segredo de webhook gerado localmente: simulador, nunca credencial real.
      const secret = `sandbox-whsec-${randomBytes(16).toString('hex')}`;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const created = await client.query(
          `INSERT INTO fin_payment_gateways (name,gateway_code,gateway_type,status,environment,is_selected,is_sandbox,config,webhook_secret_sandbox,webhook_secret_hash,idempotency_key,created_by_identity)
           VALUES ($1,$2,$3::fin_gateway_type,'nao_selecionado','sandbox',false,true,$4,$5,$6,$7,$8) RETURNING *`,
          [name, code, gateway_type, JSON.stringify(config), secret, createHash('sha256').update(secret).digest('hex'), idempotency_key, actor]
        );
        const gateway = created.rows[0];
        await insertGatewayHistory(client,'gateway',gateway.id,null,'nao_selecionado',actor,'Gateway sintético cadastrado sem seleção e sem credenciais reais',{gateway_code:code,gateway_type});
        await auditLog({action:'fin_gateway_create',actor,target:gateway.id,meta:{gateway_code:code,gateway_type,environment:'sandbox',is_selected:false},client});
        await client.query('COMMIT');
        return send(res,201,{gateway:publicGateway(gateway),synthetic:true,real_charge:false});
      } catch(e) { try { await client.query('ROLLBACK'); } catch {} return gatewayFailure(res,e); }
      finally { client.release(); }
    }

    const id = body.id, status = body.status;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const error_sanitized = typeof body.error_sanitized === 'string' ? body.error_sanitized.trim() : '';
    if (!uuid(id)) return send(res,400,{error:'invalid_id'});
    if (status === 'producao') return send(res,400,{error:'production_refused_sem_cobranca_real'});
    if (!GATEWAY_TRANSITIONS.has(status)) return send(res,400,{error:'invalid_transition'});
    if (reason.length < 10 || reason.length > 1000) return send(res,400,{error:'reason_10_1000_required'});
    if (status === 'desativado' && (error_sanitized.length < 10 || error_sanitized.length > 1000)) return send(res,400,{error:'error_sanitized_10_1000_required'});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM fin_payment_gateways WHERE id=$1 FOR UPDATE',[id]);
      if (!found.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'not_found'}); }
      const previous = found.rows[0];
      if (previous.status === status) { await client.query('ROLLBACK'); return send(res,409,{error:'gateway_already_in_status'}); }
      const updated = await client.query(
        `UPDATE fin_payment_gateways
            SET status=$1::fin_gateway_status,
                is_selected=CASE WHEN $1::text IN ('selecionado','sandbox') THEN true WHEN $1::text='nao_selecionado' THEN false ELSE is_selected END,
                selected_at=CASE WHEN $1::text='selecionado' THEN NOW() WHEN $1::text='sandbox' THEN COALESCE(selected_at,NOW()) WHEN $1::text='nao_selecionado' THEN NULL ELSE selected_at END,
                sandbox_validated_at=CASE WHEN $1::text='sandbox' THEN NOW() WHEN $1::text IN ('selecionado','nao_selecionado') THEN NULL ELSE sandbox_validated_at END,
                last_test_at=CASE WHEN $1::text='sandbox' THEN NOW() ELSE last_test_at END,
                error_sanitized=CASE WHEN $1::text='desativado' THEN $2 ELSE NULL END
          WHERE id=$3 RETURNING *`,
        [status, status === 'desativado' ? error_sanitized : null, id]
      );
      await insertGatewayHistory(client,'gateway',id,previous.status,status,actor,reason,{gateway_code:previous.gateway_code});
      await auditLog({action:'fin_gateway_transition',actor,target:id,meta:{previous_status:previous.status,next_status:status,reason},client});
      await client.query('COMMIT');
      return send(res,200,{gateway:publicGateway(updated.rows[0])});
    } catch(e) { try { await client.query('ROLLBACK'); } catch {} return gatewayFailure(res,e); }
    finally { client.release(); }
  };

  // Simulador local do provedor: devolve a assinatura canônica do payload para
  // que a jornada de sandbox seja reproduzível sem provedor externo.
  const handleWebhookSign = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'POST') return send(res,405,{error:'method_not_allowed'});
    if (!sameOrigin(req)) return send(res,403,{error:'forbidden_origin'});
    let body; try { body = await readJson(req); } catch { return send(res,400,{error:'invalid_json'}); }
    const gateway_id = body.gateway_id;
    const event_type = typeof body.event_type === 'string' ? body.event_type.trim() : '';
    const idempotency_key = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
    const payload = plainObject(body.payload) ? body.payload : null;
    if (!uuid(gateway_id)) return send(res,400,{error:'invalid_gateway_id'});
    if (event_type.length < 3 || event_type.length > 200) return send(res,400,{error:'event_type_3_200'});
    if (idempotency_key.length < 10 || idempotency_key.length > 200) return send(res,400,{error:'idempotency_key_10_200'});
    if (!payload) return send(res,400,{error:'payload_object_required'});
    try {
      const found = await pool.query('SELECT * FROM fin_payment_gateways WHERE id=$1',[gateway_id]);
      if (!found.rows.length) return send(res,404,{error:'gateway_not_found'});
      const gateway = found.rows[0];
      if (!['selecionado','sandbox'].includes(gateway.status) || !gateway.is_active) return send(res,409,{error:'gateway_not_selected'});
      const digest = payloadDigest(payload);
      const message = canonicalMessage(gateway.gateway_code, event_type, idempotency_key, digest);
      return send(res,200,{
        signature: signMessage(gateway.webhook_secret_sandbox, message),
        payload_digest: digest,
        signature_algorithm: 'hmac-sha256',
        canonical_message: message,
        simulator: 'local_sandbox',
        real_provider: false,
      });
    } catch { return send(res,500,{error:'internal'}); }
  };

  const handleWebhooks = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`), params = [];
      let q = 'SELECT * FROM fin_gateway_webhooks WHERE 1=1';
      const gateway_id = url.searchParams.get('gateway_id');
      if (gateway_id) { if (!uuid(gateway_id)) return send(res,400,{error:'invalid_gateway_id'}); params.push(gateway_id); q += ` AND gateway_id=$${params.length}`; }
      const status = url.searchParams.get('status');
      if (status) { if (!WEBHOOK_STATUSES.has(status)) return send(res,400,{error:'invalid_status'}); params.push(status); q += ` AND status=$${params.length}`; }
      q += ' ORDER BY created_at DESC LIMIT 200';
      try { return send(res,200,{webhooks:(await pool.query(q,params)).rows}); } catch { return send(res,500,{error:'internal'}); }
    }
    if (!['POST','PATCH'].includes(req.method)) return send(res,405,{error:'method_not_allowed'});
    if (!sameOrigin(req)) return send(res,403,{error:'forbidden_origin'});
    let body; try { body = await readJson(req); } catch { return send(res,400,{error:'invalid_json'}); }
    const actor = sess.identityId;
    if (!uuid(actor)) return send(res,401,{error:'unauthorized'});

    if (req.method === 'POST') {
      const gateway_id = body.gateway_id;
      const event_type = typeof body.event_type === 'string' ? body.event_type.trim() : '';
      const signature = typeof body.signature === 'string' ? body.signature.trim().toLowerCase() : '';
      const idempotency_key = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
      const payload = plainObject(body.payload) ? body.payload : null;
      if (!uuid(gateway_id)) return send(res,400,{error:'invalid_gateway_id'});
      if (event_type.length < 3 || event_type.length > 200) return send(res,400,{error:'event_type_3_200'});
      if (!hex64(signature)) return send(res,400,{error:'signature_hmac_sha256_hex_required'});
      if (idempotency_key.length < 10 || idempotency_key.length > 200) return send(res,400,{error:'idempotency_key_10_200_required'});
      if (!payload) return send(res,400,{error:'payload_object_required'});
      if (body.is_valid_signature != null || body.status != null) return send(res,400,{error:'signature_verdict_is_server_side'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const gatewayRow = await client.query('SELECT * FROM fin_payment_gateways WHERE id=$1 FOR SHARE',[gateway_id]);
        if (!gatewayRow.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'gateway_not_found'}); }
        const gateway = gatewayRow.rows[0];
        if (!['selecionado','sandbox'].includes(gateway.status) || !gateway.is_active) { await client.query('ROLLBACK'); return send(res,409,{error:'gateway_not_selected'}); }
        // Serializa a mesma chave antes de procurar/inserir. Sem este lock, duas
        // entregas simultâneas poderiam ambas não encontrar a linha e uma delas
        // cair só no índice único, sem registrar o replay de forma auditável.
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[idempotency_key]);
        // Replay: a chave de idempotência já foi usada. O recebimento original
        // não é alterado; só o contador de tentativas e o histórico crescem.
        const existing = await client.query('SELECT * FROM fin_gateway_webhooks WHERE idempotency_key=$1 FOR UPDATE',[idempotency_key]);
        if (existing.rows.length) {
          const original = existing.rows[0];
          const replayed = await client.query('UPDATE fin_gateway_webhooks SET is_replay=true, replay_attempts=replay_attempts+1 WHERE id=$1 RETURNING *',[original.id]);
          await insertGatewayHistory(client,'webhook',original.id,original.status,'replay',actor,'Replay recusado por chave de idempotência já recebida',{idempotency_key,replay_attempts:replayed.rows[0].replay_attempts});
          await auditLog({action:'fin_gateway_webhook_replay',actor,target:original.id,meta:{gateway_id,idempotency_key,replay_attempts:replayed.rows[0].replay_attempts},client});
          await client.query('COMMIT');
          return send(res,409,{error:'replay_detected',webhook_id:original.id,replay_attempts:replayed.rows[0].replay_attempts,applied:false});
        }
        const digest = payloadDigest(payload);
        const expected = signMessage(gateway.webhook_secret_sandbox, canonicalMessage(gateway.gateway_code, event_type, idempotency_key, digest));
        const valid = signatureMatches(expected, signature);
        const status = valid ? 'validado' : 'rejeitado';
        const created = await client.query(
          `INSERT INTO fin_gateway_webhooks (gateway_id,event_type,signature,signature_algorithm,payload,payload_digest,is_valid_signature,is_replay,replay_attempts,idempotency_key,status,processed_at,error_sanitized)
           VALUES ($1,$2,$3,'hmac-sha256',$4,$5,$6,false,0,$7,$8::fin_webhook_status,NOW(),$9) RETURNING *`,
          [gateway_id, event_type, signature, JSON.stringify(payload), digest, valid, idempotency_key, status, valid ? null : 'assinatura hmac-sha256 divergente da mensagem canonica do gateway sandbox']
        );
        const webhook = created.rows[0];
        await insertGatewayHistory(client,'webhook',webhook.id,null,status,actor,valid?'Webhook sintético recebido com assinatura verificada':'Webhook sintético recusado por assinatura inválida',{gateway_id,event_type,idempotency_key});
        await auditLog({action:valid?'fin_gateway_webhook_accepted':'fin_gateway_webhook_rejected',actor,target:webhook.id,meta:{gateway_id,event_type,idempotency_key,is_valid_signature:valid},client});
        await client.query('COMMIT');
        if (!valid) return send(res,400,{error:'webhook_signature_invalid',webhook_id:webhook.id,status:'rejeitado'});
        return send(res,201,{webhook,accepted:true,real_charge:false});
      } catch(e) { try { await client.query('ROLLBACK'); } catch {} return gatewayFailure(res,e); }
      finally { client.release(); }
    }

    const id = body.id, charge_id = body.charge_id;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!uuid(id)) return send(res,400,{error:'invalid_id'});
    if (body.status != null && body.status !== 'conciliado') return send(res,400,{error:'only_conciliation_is_allowed'});
    if (!uuid(charge_id)) return send(res,400,{error:'invalid_charge_id'});
    if (reason.length < 10 || reason.length > 1000) return send(res,400,{error:'reason_10_1000_required'});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM fin_gateway_webhooks WHERE id=$1 FOR UPDATE',[id]);
      if (!found.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'not_found'}); }
      const webhook = found.rows[0];
      if (webhook.status === 'conciliado') { await client.query('ROLLBACK'); return send(res,409,{error:'webhook_already_conciliated'}); }
      if (webhook.status !== 'validado' || !webhook.is_valid_signature) { await client.query('ROLLBACK'); return send(res,409,{error:'webhook_not_validated'}); }
      const chargeRow = await client.query('SELECT * FROM fin_gateway_charges WHERE id=$1 FOR UPDATE',[charge_id]);
      if (!chargeRow.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'charge_not_found'}); }
      const charge = chargeRow.rows[0];
      if (charge.gateway_id !== webhook.gateway_id) { await client.query('ROLLBACK'); return send(res,409,{error:'charge_gateway_mismatch'}); }
      if (charge.status !== 'pendente') { await client.query('ROLLBACK'); return send(res,409,{error:'charge_not_pending'}); }

      // A assinatura prova que o payload chegou íntegro; a baixa só é autorizada
      // se esse payload também nomear ESTA cobrança e o seu valor exato.
      const payload = webhook.payload || {};
      if (webhook.event_type !== 'charge.paid'
        || payload.protocol !== charge.protocol
        || !Number.isSafeInteger(Number(payload.amount_cents))
        || Number(payload.amount_cents) !== Number(charge.amount_cents)
        || payload.settlement !== 'synthetic') {
        await client.query('ROLLBACK');
        return send(res,409,{error:'webhook_payload_does_not_match_charge'});
      }

      // FIN-04 é a fonte canônica do saldo. O bloqueio da conta impede que uma
      // baixa manual concorrente ou outro webhook ultrapasse o saldo disponível.
      const receivableRow = await client.query('SELECT * FROM fin_accounts_receivable WHERE id=$1 FOR UPDATE',[charge.receivable_id]);
      if (!receivableRow.rows.length) { await client.query('ROLLBACK'); return send(res,409,{error:'charge_receivable_not_found'}); }
      const receivable = receivableRow.rows[0];
      const previousPaid = Number(receivable.amount_paid_cents);
      const totalAmount = Number(receivable.amount_cents);
      const chargeAmount = Number(charge.amount_cents);
      const outstanding = totalAmount - previousPaid;
      if (chargeAmount <= 0 || chargeAmount > outstanding) {
        await client.query('ROLLBACK');
        return send(res,409,{error:'charge_amount_exceeds_receivable_balance',outstanding_cents:outstanding});
      }
      const gatewayRow = await client.query('SELECT gateway_type FROM fin_payment_gateways WHERE id=$1 FOR SHARE',[charge.gateway_id]);
      if (!gatewayRow.rows.length) { await client.query('ROLLBACK'); return send(res,409,{error:'charge_gateway_not_found'}); }
      const method = ['pix','boleto','cartao'].includes(gatewayRow.rows[0].gateway_type) ? gatewayRow.rows[0].gateway_type : 'outro';
      const nextPaid = previousPaid + chargeAmount;
      const nextStatus = nextPaid >= totalAmount ? 'recebido' : 'parcial';
      const paymentReason = `Baixa sintética do webhook conciliado ${charge.protocol}; nenhum provedor real foi acionado.`;
      const payment = await client.query(
        `INSERT INTO fin_payments (account_type,receivable_id,amount_cents,payment_method,is_partial,is_estorno,is_renegotiation,notes,created_by_identity,gateway_charge_id)
         VALUES ('receber',$1,$2,$3::fin_payment_method,$4,false,false,$5,$6,$7) RETURNING *`,
        [charge.receivable_id,chargeAmount,method,nextStatus === 'parcial',paymentReason,actor,charge.id]
      );
      await client.query(
        `UPDATE fin_accounts_receivable
            SET amount_paid_cents=$2,
                status=$3::fin_status,
                paid_at=CASE WHEN $3::text='recebido' THEN NOW() ELSE NULL END
          WHERE id=$1`,
        [charge.receivable_id,nextPaid,nextStatus]
      );
      await client.query(
        `INSERT INTO fin_payment_history (account_type,receivable_id,previous_status,next_status,previous_paid_cents,next_paid_cents,payment_id,changed_by_identity,reason,is_estorno,is_renegociacao)
         VALUES ('receber',$1,$2::fin_status,$3::fin_status,$4,$5,$6,$7,$8,false,false)`,
        [charge.receivable_id,receivable.status,nextStatus,previousPaid,nextPaid,payment.rows[0].id,actor,paymentReason]
      );
      // Ordem deliberada: webhook conciliado -> baixa FIN-04 -> cobrança paga.
      // Os triggers da migração 135 recusam a cobrança paga sem essa baixa.
      const conciliated = await client.query(
        `UPDATE fin_gateway_webhooks SET status='conciliado',charge_id=$1,conciliated_at=NOW(),processed_at=NOW() WHERE id=$2 RETURNING *`,
        [charge_id, id]
      );
      const settled = await client.query(
        `UPDATE fin_gateway_charges SET status='pago',is_conciliated=true,conciliated_at=NOW(),settled_at=NOW(),conciliated_webhook_id=$1 WHERE id=$2 RETURNING *`,
        [id, charge_id]
      );
      await insertGatewayHistory(client,'webhook',id,webhook.status,'conciliado',actor,reason,{charge_id,protocol:charge.protocol,payment_id:payment.rows[0].id});
      await insertGatewayHistory(client,'charge',charge_id,charge.status,'pago',actor,reason,{webhook_id:id,protocol:charge.protocol,payment_id:payment.rows[0].id,simulated:true});
      await auditLog({action:'fin_gateway_conciliate',actor,target:charge_id,meta:{webhook_id:id,payment_id:payment.rows[0].id,protocol:charge.protocol,reason,simulated:true},client});
      await client.query('COMMIT');
      return send(res,200,{webhook:conciliated.rows[0],charge:settled.rows[0],payment:payment.rows[0],conciliated:true,real_charge:false});
    } catch(e) { try { await client.query('ROLLBACK'); } catch {} return gatewayFailure(res,e); }
    finally { client.release(); }
  };

  const handleCharges = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`), params = [];
      let q = 'SELECT * FROM fin_gateway_charges WHERE 1=1';
      const gateway_id = url.searchParams.get('gateway_id');
      if (gateway_id) { if (!uuid(gateway_id)) return send(res,400,{error:'invalid_gateway_id'}); params.push(gateway_id); q += ` AND gateway_id=$${params.length}`; }
      const receivable_id = url.searchParams.get('receivable_id');
      if (receivable_id) { if (!uuid(receivable_id)) return send(res,400,{error:'invalid_receivable_id'}); params.push(receivable_id); q += ` AND receivable_id=$${params.length}`; }
      const status = url.searchParams.get('status');
      if (status) { if (!CHARGE_STATUSES.has(status)) return send(res,400,{error:'invalid_status'}); params.push(status); q += ` AND status=$${params.length}`; }
      q += ' ORDER BY created_at DESC LIMIT 200';
      try { return send(res,200,{charges:(await pool.query(q,params)).rows}); } catch { return send(res,500,{error:'internal'}); }
    }
    if (!['POST','PATCH'].includes(req.method)) return send(res,405,{error:'method_not_allowed'});
    if (!sameOrigin(req)) return send(res,403,{error:'forbidden_origin'});
    let body; try { body = await readJson(req); } catch { return send(res,400,{error:'invalid_json'}); }
    const actor = sess.identityId;
    if (!uuid(actor)) return send(res,401,{error:'unauthorized'});

    if (req.method === 'POST') {
      const gateway_id = body.gateway_id, receivable_id = body.receivable_id;
      const amount_cents = positiveCents(body.amount_cents);
      const idempotency_key = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
      if (!uuid(gateway_id)) return send(res,400,{error:'invalid_gateway_id'});
      if (!uuid(receivable_id)) return send(res,400,{error:'receivable_reference_required'});
      if (!amount_cents) return send(res,400,{error:'amount_positive_integer'});
      if (idempotency_key.length < 10 || idempotency_key.length > 200) return send(res,400,{error:'idempotency_key_10_200_required'});
      if (body.is_sandbox === false || body.simulated === false) return send(res,400,{error:'real_charge_refused_sandbox_only'});
      if (body.status != null && body.status !== 'pendente') return send(res,400,{error:'charge_starts_pendente'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const gatewayRow = await client.query('SELECT * FROM fin_payment_gateways WHERE id=$1 FOR SHARE',[gateway_id]);
        if (!gatewayRow.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'gateway_not_found'}); }
        const gateway = gatewayRow.rows[0];
        // Boleto/Pix/gateway somente após seleção e homologação em sandbox.
        if (gateway.status !== 'sandbox' || !gateway.is_selected || !gateway.is_active) {
          await client.query('ROLLBACK');
          return send(res,409,{error:'gateway_not_selected_sandbox_required',gateway_status:gateway.status});
        }
        const receivable = await client.query('SELECT id,amount_cents,amount_paid_cents,status FROM fin_accounts_receivable WHERE id=$1 FOR SHARE',[receivable_id]);
        if (!receivable.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'receivable_not_found'}); }
        const outstanding = Number(receivable.rows[0].amount_cents) - Number(receivable.rows[0].amount_paid_cents);
        if (amount_cents > outstanding) { await client.query('ROLLBACK'); return send(res,400,{error:'amount_exceeds_receivable_balance',outstanding_cents:outstanding}); }
        const protocol = generateProtocol('CHG-FIN');
        const created = await client.query(
          `INSERT INTO fin_gateway_charges (protocol,gateway_id,receivable_id,amount_cents,status,idempotency_key,is_sandbox,simulated,provider_charge_id,provider_response,created_by_identity)
           VALUES ($1,$2,$3,$4,'pendente',$5,true,true,$6,$7,$8) RETURNING *`,
          [protocol, gateway_id, receivable_id, amount_cents, idempotency_key, `synthetic-chg-${randomBytes(6).toString('hex')}`, JSON.stringify({mode:'synthetic',simulated:true,settlement:'none'}), actor]
        );
        const charge = created.rows[0];
        await insertGatewayHistory(client,'charge',charge.id,null,'pendente',actor,'Cobrança sintética criada em gateway selecionado e homologado em sandbox',{protocol,gateway_id,receivable_id,amount_cents});
        await auditLog({action:'fin_gateway_charge_create',actor,target:charge.id,meta:{protocol,gateway_id,receivable_id,amount_cents,simulated:true},client});
        await client.query('COMMIT');
        return send(res,201,{charge,synthetic:true,real_charge:false});
      } catch(e) { try { await client.query('ROLLBACK'); } catch {} return gatewayFailure(res,e); }
      finally { client.release(); }
    }

    const id = body.id, status = body.status;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const error_sanitized = typeof body.error_sanitized === 'string' ? body.error_sanitized.trim() : '';
    if (!uuid(id)) return send(res,400,{error:'invalid_id'});
    // 'pago' nunca é decidido por edição: depende de webhook conciliado.
    if (status === 'pago') return send(res,409,{error:'charge_paid_only_via_conciliated_webhook'});
    if (!CHARGE_TRANSITIONS.has(status)) return send(res,400,{error:'invalid_transition'});
    if (reason.length < 10 || reason.length > 1000) return send(res,400,{error:'reason_10_1000_required'});
    if (status === 'falhou' && (error_sanitized.length < 10 || error_sanitized.length > 1000)) return send(res,400,{error:'error_sanitized_10_1000_required'});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM fin_gateway_charges WHERE id=$1 FOR UPDATE',[id]);
      if (!found.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'not_found'}); }
      const previous = found.rows[0];
      if (previous.status === status) { await client.query('ROLLBACK'); return send(res,409,{error:'charge_already_in_status'}); }
      const allowed = previous.status === 'pendente' ? ['falhou','cancelado'] : previous.status === 'falhou' ? ['cancelado'] : previous.status === 'pago' ? ['estornado'] : [];
      if (!allowed.includes(status)) { await client.query('ROLLBACK'); return send(res,409,{error:'charge_invalid_transition',previous_status:previous.status}); }
      let reversalPayment = null;
      if (status === 'estornado') {
        // O estorno de uma cobrança conciliada também reverte a baixa FIN-04;
        // mudar só o status da cobrança deixaria o recebível falsamente quitado.
        const receivableRow = await client.query('SELECT * FROM fin_accounts_receivable WHERE id=$1 FOR UPDATE',[previous.receivable_id]);
        if (!receivableRow.rows.length) { await client.query('ROLLBACK'); return send(res,409,{error:'charge_receivable_not_found'}); }
        const originalPayment = await client.query('SELECT * FROM fin_payments WHERE gateway_charge_id=$1 AND is_estorno=false FOR UPDATE',[id]);
        if (!originalPayment.rows.length) { await client.query('ROLLBACK'); return send(res,409,{error:'gateway_settlement_payment_not_found'}); }
        const alreadyReversed = await client.query('SELECT id FROM fin_payments WHERE gateway_charge_id=$1 AND is_estorno=true',[id]);
        if (alreadyReversed.rows.length) { await client.query('ROLLBACK'); return send(res,409,{error:'gateway_settlement_already_reversed'}); }
        const receivable = receivableRow.rows[0];
        const amount = Number(previous.amount_cents);
        const previousPaid = Number(receivable.amount_paid_cents);
        if (previousPaid < amount) { await client.query('ROLLBACK'); return send(res,409,{error:'gateway_settlement_balance_inconsistent'}); }
        const nextPaid = previousPaid - amount;
        const nextStatus = nextPaid === 0 ? 'pendente' : 'parcial';
        reversalPayment = await client.query(
          `INSERT INTO fin_payments (account_type,receivable_id,amount_cents,payment_method,is_partial,is_estorno,is_renegotiation,previous_payment_id,notes,created_by_identity,gateway_charge_id)
           VALUES ('receber',$1,$2,$3::fin_payment_method,$4,true,false,$5,$6,$7,$8) RETURNING *`,
          [previous.receivable_id,amount,originalPayment.rows[0].payment_method,nextStatus === 'parcial',originalPayment.rows[0].id,reason,actor,id]
        );
        await client.query(
          `UPDATE fin_accounts_receivable SET amount_paid_cents=$2,status=$3::fin_status,paid_at=NULL WHERE id=$1`,
          [previous.receivable_id,nextPaid,nextStatus]
        );
        await client.query(
          `INSERT INTO fin_payment_history (account_type,receivable_id,previous_status,next_status,previous_paid_cents,next_paid_cents,payment_id,changed_by_identity,reason,is_estorno,is_renegociacao)
           VALUES ('receber',$1,$2::fin_status,$3::fin_status,$4,$5,$6,$7,$8,true,false)`,
          [previous.receivable_id,receivable.status,nextStatus,previousPaid,nextPaid,reversalPayment.rows[0].id,actor,reason]
        );
      }
      const updated = status === 'falhou'
        ? await client.query(`UPDATE fin_gateway_charges SET status='falhou',error_sanitized=$1 WHERE id=$2 RETURNING *`,[error_sanitized,id])
        : await client.query(`UPDATE fin_gateway_charges SET status=$1::fin_charge_status,cancel_reason=$2,error_sanitized=NULL WHERE id=$3 RETURNING *`,[status,reason,id]);
      await insertGatewayHistory(client,'charge',id,previous.status,status,actor,reason,{protocol:previous.protocol,simulated:true,reversal_payment_id:reversalPayment?.rows[0]?.id||null});
      await auditLog({action:`fin_gateway_charge_${status}`,actor,target:id,meta:{previous_status:previous.status,next_status:status,reason,simulated:true,reversal_payment_id:reversalPayment?.rows[0]?.id||null},client});
      await client.query('COMMIT');
      return send(res,200,{charge:updated.rows[0],real_charge:false});
    } catch(e) { try { await client.query('ROLLBACK'); } catch {} return gatewayFailure(res,e); }
    finally { client.release(); }
  };

  const handleGatewayHistory = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'GET') return send(res,405,{error:'method_not_allowed'});
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`), params = [];
    let q = 'SELECT * FROM fin_gateway_history WHERE 1=1';
    const entity_type = url.searchParams.get('entity_type');
    if (entity_type) { if (!GATEWAY_ENTITIES.has(entity_type)) return send(res,400,{error:'invalid_entity_type'}); params.push(entity_type); q += ` AND entity_type=$${params.length}`; }
    const entity_id = url.searchParams.get('entity_id');
    if (entity_id) { if (!uuid(entity_id)) return send(res,400,{error:'invalid_entity_id'}); params.push(entity_id); q += ` AND entity_id=$${params.length}`; }
    q += ' ORDER BY created_at DESC LIMIT 200';
    try { return send(res,200,{history:(await pool.query(q,params)).rows}); } catch { return send(res,500,{error:'internal'}); }
  };

  return {
    handleManagementResults,
    handleResultHistory,
    handleExpenses,
    handleExpenseHistory,
    handleExpenseAuthorities,
    handleFiscalActivityRules,
    handleFiscalProviders,
    handleFiscalObligations,
    handleFiscalDocuments,
    handleFiscalHistory,
    handleGateways,
    handleWebhooks,
    handleCharges,
    handleWebhookSign,
    handleGatewayHistory,
  };
}
