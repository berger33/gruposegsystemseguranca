import { createHmac, timingSafeEqual } from 'node:crypto';

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
      let q='SELECT * FROM fin_expenses WHERE 1=1';
      const status=url.searchParams.get('status'), type=url.searchParams.get('expense_type'), contract=url.searchParams.get('contract_id');
      if (status) { if(!EXPENSE_STATUSES.has(status)) return send(res,400,{error:'invalid_status'}); params.push(status); q+=` AND status=$${params.length}`; }
      if (type) { if(!EXPENSE_TYPES.has(type)) return send(res,400,{error:'invalid_expense_type'}); params.push(type); q+=` AND expense_type=$${params.length}`; }
      if (contract) { if(!uuid(contract)) return send(res,400,{error:'invalid_contract_id'}); params.push(contract); q+=` AND contract_id=$${params.length}`; }
      q+=' ORDER BY created_at DESC LIMIT 200';
      try { return send(res,200,{expenses:(await pool.query(q,params)).rows}); } catch { return send(res,500,{error:'internal'}); }
    }
    if (!['POST','PATCH'].includes(req.method)) return send(res,405,{error:'method_not_allowed'});
    if (!sameOrigin(req)) return send(res,403,{error:'forbidden_origin'});
    let body; try { body=await readJson(req); } catch { return send(res,400,{error:'invalid_json'}); }
    const actor=sess.identityId;
    if (!uuid(actor)) return send(res,401,{error:'unauthorized'});

    if (req.method === 'POST') {
      const expense_type=body.expense_type||'despesa';
      const category=typeof body.category==='string'?body.category.trim():'';
      const description=typeof body.description==='string'?body.description.trim():'';
      const requester_name=typeof body.requester_name==='string'?body.requester_name.trim():'';
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
      if(requester_name.length<2||requester_name.length>200) return send(res,400,{error:'requester_name_2_200'});
      if(!uuid(contract_id)||!uuid(cost_center_id)||!uuid(supplier_id)) return send(res,400,{error:'canonical_references_required'});
      if(evidence_file_name.length<1||evidence_file_name.length>500||!syntheticEvidenceUrl(evidence_file_url)||!syntheticStorageKey(evidence_storage_key)) return send(res,400,{error:'synthetic_evidence_metadata_required'});
      if(idempotency_key.length<8||idempotency_key.length>200) return send(res,400,{error:'idempotency_key_8_200'});
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        const contract=await client.query("SELECT id FROM crm_contracts WHERE id=$1 AND status NOT IN ('encerrado','cancelado')",[contract_id]);
        const center=await client.query('SELECT id FROM fin_cost_centers WHERE id=$1 AND is_active=true',[cost_center_id]);
        const supplier=await client.query('SELECT id FROM fin_suppliers WHERE id=$1 AND is_active=true',[supplier_id]);
        if(!contract.rows.length||!center.rows.length||!supplier.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'canonical_reference_not_found_or_inactive'}); }
        const protocol=generateProtocol('DES-FIN');
        const created=await client.query(`INSERT INTO fin_expenses (protocol,expense_type,category,description,amount_cents,threshold_cents,requester_name,requester_identity,evidence_file_name,evidence_file_url,evidence_storage_key,contract_id,cost_center_id,supplier_id,created_by_identity,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$8,$15) RETURNING *`,[protocol,expense_type,category,description,amount_cents,threshold_cents,requester_name,actor,evidence_file_name,evidence_file_url,evidence_storage_key,contract_id,cost_center_id,supplier_id,idempotency_key]);
        const expense=created.rows[0];
        await client.query(`INSERT INTO fin_expense_history (expense_id,previous_status,next_status,previous_amount,next_amount,changed_by_identity,reason,is_segregation_verified) VALUES ($1,NULL,'pendente',NULL,$2,$3,$4,false)`,[expense.id,amount_cents,actor,'Solicitação financeira criada com evidência sintética e referências canônicas']);
        await auditLog({action:'fin_expense_create',actor,target:expense.id,meta:{protocol,expense_type,amount_cents,contract_id,idempotency_key},client});
        await client.query('COMMIT');
        return send(res,201,{expense,synthetic:true});
      } catch(e) { try { await client.query('ROLLBACK'); } catch {} return expenseFailure(res,e); }
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
      if(status==='aprovado') {
        const authority=await client.query('SELECT max_amount_cents FROM fin_expense_approval_authorities WHERE identity_id=$1 AND is_active=true',[actor]);
        if(!authority.rows.length||Number(previous.amount_cents)>Number(authority.rows[0].max_amount_cents)) { await client.query('ROLLBACK'); return send(res,403,{error:'approval_authority_exceeded'}); }
      }
      const approver=status==='cancelado'?null:actor;
      const updated=await client.query(`UPDATE fin_expenses SET status=$1::fin_expense_status,approver_name=CASE WHEN $1::text='cancelado' THEN approver_name ELSE $2 END,approver_identity=CASE WHEN $1::text='cancelado' THEN approver_identity ELSE $3 END,approved_at=CASE WHEN $1::text='aprovado' THEN NOW() ELSE NULL END,approved_by_identity=CASE WHEN $1::text='aprovado' THEN $3 ELSE NULL END,rejection_reason=CASE WHEN $1::text='rejeitado' THEN $4 ELSE NULL END,is_segregated=CASE WHEN $1::text='cancelado' THEN is_segregated ELSE true END,segregation_checked=CASE WHEN $1::text='cancelado' THEN segregation_checked ELSE true END WHERE id=$5 RETURNING *`,[status,body.approver_name||'Aprovador autenticado',approver,status==='rejeitado'?reason:null,id]);
      const expense=updated.rows[0];
      await client.query(`INSERT INTO fin_expense_history (expense_id,previous_status,next_status,previous_amount,next_amount,changed_by_identity,reason,is_segregation_verified) VALUES ($1,$2,$3,$4,$4,$5,$6,$7)`,[id,previous.status,status,previous.amount_cents,actor,reason,status!=='cancelado']);
      const action=status==='aprovado'?'fin_expense_approve':status==='rejeitado'?'fin_expense_reject':'fin_expense_cancel';
      await auditLog({action,actor,target:id,meta:{status,reason},client});
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
        const created = await client.query(
          `INSERT INTO fin_fiscal_obligations (contract_id,client_account_id,obligation_type,activity_type,activity_rule_id,description,rule,notes,status,is_determined,idempotency_key,created_by_identity)
           VALUES ($1,$2,$3::fin_fiscal_doc_type,$4,$5,$6,$7,$8,'pendente',false,$9,$10) RETURNING *`,
          [contract_id, client_account_id, rule.rows[0].obligation_type, activity_type, rule.rows[0].id, description, ruleText, notes, idempotency_key, actor]
        );
        const obligation = created.rows[0];
        await insertFiscalHistory(client,'obligation',obligation.id,null,'pendente',actor,'Obrigação fiscal criada a partir da regra canônica da atividade',{activity_type,obligation_type:obligation.obligation_type,rule_reference:rule.rows[0].rule_reference});
        await auditLog({action:'fin_fiscal_obligation_create',actor,target:obligation.id,meta:{activity_type,obligation_type:obligation.obligation_type,rule_reference:rule.rows[0].rule_reference,idempotency_key},client});
        await client.query('COMMIT');
        return send(res,201,{obligation,activity_rule:rule.rows[0],synthetic:true});
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
      if (!uuid(obligation_id) || !uuid(provider_id)) return send(res,400,{error:'canonical_references_required'});
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

  // FIN-12: boletos/Pix/gateway somente após seleção e sandbox; a assinatura
  // de webhook é SEMPRE recomputada no servidor (nunca aceita por afirmação
  // do cliente); replay é detectado por idempotência; conciliação liga um
  // webhook validado a uma cobrança específica, nunca um PATCH livre de
  // status; nenhuma cobrança real é possível neste simulador.
  const GATEWAY_STATUSES = new Set(['nao_selecionado','selecionado','sandbox','desativado']);
  const GATEWAY_TYPES = new Set(['boleto','pix','cartao','gateway','outro']);
  const WEBHOOK_EVENT_TYPES = new Set(['gateway.ping','payment.confirmed','payment.failed','payment.refunded']);
  const WEBHOOK_STATUSES = new Set(['validado','rejeitado','replay','conciliado']);
  const CHARGE_STATUSES = new Set(['pendente','pago','falhou','cancelado','estornado']);
  const GATEWAY_ENTITIES = new Set(['gateway','webhook','charge']);
  const gatewayCode = v => typeof v === 'string' && /^[a-z][a-z0-9_-]{2,59}$/.test(v);
  const sandboxSecret = v => typeof v === 'string' && /^sandbox_[A-Za-z0-9]{16,64}$/.test(v);
  const hexDigest = v => typeof v === 'string' && /^[0-9a-f]{64}$/i.test(v);
  // Allowlist: somente códigos de domínio conhecidos chegam ao cliente.
  const GATEWAY_GUARD_CODES = new Set([
    'fin_gateway_production_refused',
    'fin_gateway_initial_status_must_be_nao_selecionado',
    'fin_gateway_initial_fields_invalid',
    'fin_gateway_identity_fields_immutable',
    'fin_gateway_status_transition_required',
    'fin_gateway_invalid_status_transition',
    'fin_gateway_sandbox_required_when_selected',
    'fin_gateway_sandbox_requires_timestamp',
    'fin_gateway_credentials_refused',
    'fin_gateway_webhook_gateway_required',
    'fin_gateway_webhook_charge_required_for_event',
    'fin_gateway_webhook_charge_gateway_mismatch',
    'fin_gateway_webhook_initial_status_invalid',
    'fin_gateway_webhook_fields_immutable',
    'fin_gateway_webhook_status_transition_required',
    'fin_gateway_webhook_invalid_status_transition',
    'fin_gateway_webhook_signature_verification_metadata_required',
    'fin_gateway_charge_gateway_required',
    'fin_gateway_charge_initial_status_must_be_pendente',
    'fin_gateway_charge_fields_immutable',
    'fin_gateway_charge_gateway_not_ready',
    'fin_gateway_charge_status_transition_required',
    'fin_gateway_charge_invalid_status_transition',
    'fin_gateway_charge_cancel_requires_no_outcome',
    'fin_gateway_charge_confirmation_requires_validated_webhook',
    'fin_gateway_charge_refund_requires_paid_status',
  ]);
  const gatewayFailure = (res, e) => {
    if (isAuditUnavailable(e)) return send(res,503,{error:'audit_unavailable'});
    if (e?.code === '23505') {
      const key = String(e.constraint||'');
      return send(res,409,{error:key.includes('idempotency')?'duplicate_idempotency_key':key.includes('gateway_code')?'duplicate_gateway_code':key.includes('confirmation_webhook')||key.includes('refund_webhook')?'webhook_already_linked_to_charge':'duplicate'});
    }
    if (e?.code === '23503') return send(res,400,{error:'invalid_reference'});
    if (e?.code === '23514') {
      const message = String(e.message||'');
      const known = [...GATEWAY_GUARD_CODES].find(code => message === code);
      return send(res,400,{error:known||'invalid_gateway_transition'});
    }
    if (e?.code === '22P02' || e?.code === '22007') return send(res,400,{error:'invalid'});
    return send(res,500,{error:'internal'});
  };
  const redactGateway = row => row ? { ...row, webhook_secret: undefined, config: row.config } : row;
  const insertGatewayHistory = (client, entity_type, entity_id, previous_status, next_status, actor, reason, metadata) =>
    client.query(
      'INSERT INTO fin_gateway_history (entity_type,entity_id,previous_status,next_status,changed_by_identity,reason,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [entity_type, entity_id, previous_status, next_status, actor, reason, JSON.stringify(metadata||{})]
    );
  // Assinatura NUNCA é aceita por afirmação do cliente: a API recalcula o
  // HMAC-SHA256 do payload canônico com o segredo sandbox do gateway.
  const canonicalStringify = value => {
    if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  };
  const verifySandboxSignature = (secret, payload, signature) => {
    if (!hexDigest(signature)) return false;
    const expected = createHmac('sha256', secret).update(canonicalStringify(payload||{})).digest('hex');
    const a = Buffer.from(signature.toLowerCase(),'hex'), b = Buffer.from(expected,'hex');
    return a.length === b.length && timingSafeEqual(a,b);
  };

  const handleGateways = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (!sameOrigin(req) && req.method !== 'GET') return send(res,403,{error:'forbidden_origin'});
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host||'localhost'}`), params = [];
      let q = 'SELECT * FROM fin_payment_gateways WHERE 1=1';
      const status = url.searchParams.get('status');
      if (status) { if (!GATEWAY_STATUSES.has(status)) return send(res,400,{error:'invalid_status'}); params.push(status); q += ` AND status=$${params.length}`; }
      q += ' ORDER BY created_at DESC LIMIT 200';
      try { return send(res,200,{gateways:(await pool.query(q,params)).rows.map(redactGateway)}); } catch { return send(res,500,{error:'internal'}); }
    }
    if (!['POST','PATCH'].includes(req.method)) return send(res,405,{error:'method_not_allowed'});
    let body; try { body = await readJson(req); } catch { return send(res,400,{error:'invalid_json'}); }
    const actor = sess.identityId;
    if (!uuid(actor)) return send(res,401,{error:'unauthorized'});

    if (req.method === 'POST') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const gateway_code = typeof body.gateway_code === 'string' ? body.gateway_code.trim() : '';
      const gateway_type = typeof body.gateway_type === 'string' ? body.gateway_type : 'pix';
      const webhook_secret = typeof body.webhook_secret === 'string' ? body.webhook_secret.trim() : '';
      const idempotency_key = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
      const config = body.config && typeof body.config === 'object' && !Array.isArray(body.config) ? body.config : {};
      if (name.length < 3 || name.length > 200) return send(res,400,{error:'name_3_200'});
      if (!gatewayCode(gateway_code)) return send(res,400,{error:'gateway_code_required'});
      if (!GATEWAY_TYPES.has(gateway_type)) return send(res,400,{error:'invalid_gateway_type'});
      if (!sandboxSecret(webhook_secret)) return send(res,400,{error:'webhook_secret_sandbox_format_required'});
      if (idempotency_key.length < 8 || idempotency_key.length > 200) return send(res,400,{error:'idempotency_key_8_200'});
      if (Object.keys(config).some(key => CREDENTIAL_KEYS.has(String(key).toLowerCase()))) return send(res,400,{error:'credentials_refused_sandbox_only'});
      if (body.environment != null && body.environment !== 'sandbox') return send(res,400,{error:'environment_must_be_sandbox'});
      if (body.status != null && body.status !== 'nao_selecionado') return send(res,400,{error:'gateway_starts_nao_selecionado'});
      if (body.is_selected === true || body.is_real_payment === true) return send(res,400,{error:'real_payment_refused_sandbox_only'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const created = await client.query(
          `INSERT INTO fin_payment_gateways (name,gateway_code,gateway_type,status,is_selected,is_sandbox,environment,webhook_secret,config,idempotency_key,created_by_identity)
           VALUES ($1,$2,$3::fin_gateway_type,'nao_selecionado',false,true,'sandbox',$4,$5,$6,$7) RETURNING *`,
          [name, gateway_code, gateway_type, webhook_secret, JSON.stringify(config), idempotency_key, actor]
        );
        const gateway = created.rows[0];
        await insertGatewayHistory(client,'gateway',gateway.id,null,'nao_selecionado',actor,'Gateway sandbox cadastrado sem credenciais reais',{gateway_code,gateway_type});
        await auditLog({action:'fin_gateway_create',actor,target:gateway.id,meta:{gateway_code,gateway_type,environment:'sandbox'},client});
        await client.query('COMMIT');
        // O segredo sandbox só aparece nesta resposta de criação (como um
        // provedor real mostraria uma vez); GET e demais respostas o ocultam.
        return send(res,201,{gateway, note:'copie_o_webhook_secret_agora_nao_sera_mostrado_novamente'});
      } catch(e) { try { await client.query('ROLLBACK'); } catch {} return gatewayFailure(res,e); }
      finally { client.release(); }
    }

    const id = body.id, status = body.status;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!uuid(id)) return send(res,400,{error:'invalid_id'});
    if (!['selecionado','sandbox','desativado'].includes(status)) return send(res,400,{error:'invalid_transition'});
    if (reason.length < 10 || reason.length > 1000) return send(res,400,{error:'reason_10_1000_required'});
    const config = body.config && typeof body.config === 'object' && !Array.isArray(body.config) ? body.config : null;
    if (config && Object.keys(config).some(key => CREDENTIAL_KEYS.has(String(key).toLowerCase()))) return send(res,400,{error:'credentials_refused_sandbox_only'});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM fin_payment_gateways WHERE id=$1 FOR UPDATE',[id]);
      if (!found.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'not_found'}); }
      const previous = found.rows[0];
      if (previous.status === status) { await client.query('ROLLBACK'); return send(res,409,{error:'gateway_already_in_status'}); }
      const isSelected = status !== 'desativado';
      const updated = await client.query(
        `UPDATE fin_payment_gateways
            SET status=$1::fin_gateway_status,
                is_selected=$2,
                config=COALESCE($3::jsonb,config),
                last_test_at=CASE WHEN $1::text='sandbox' THEN NOW() ELSE last_test_at END
          WHERE id=$4 RETURNING *`,
        [status, isSelected, config ? JSON.stringify(config) : null, id]
      );
      await insertGatewayHistory(client,'gateway',id,previous.status,status,actor,reason,{gateway_code:previous.gateway_code});
      await auditLog({action:'fin_gateway_transition',actor,target:id,meta:{previous_status:previous.status,next_status:status,reason},client});
      await client.query('COMMIT');
      return send(res,200,{gateway:redactGateway(updated.rows[0])});
    } catch(e) { try { await client.query('ROLLBACK'); } catch {} return gatewayFailure(res,e); }
    finally { client.release(); }
  };

  const handleWebhooks = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (!sameOrigin(req) && req.method !== 'GET') return send(res,403,{error:'forbidden_origin'});
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
    let body; try { body = await readJson(req); } catch { return send(res,400,{error:'invalid_json'}); }
    const actor = sess.identityId;
    if (!uuid(actor)) return send(res,401,{error:'unauthorized'});

    if (req.method === 'POST') {
      const gateway_id = body.gateway_id;
      const event_type = typeof body.event_type === 'string' ? body.event_type.trim() : '';
      const signature = typeof body.signature === 'string' ? body.signature.trim() : '';
      const payload = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : {};
      const idempotency_key = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
      const charge_id = body.charge_id || null;
      if (!uuid(gateway_id)) return send(res,400,{error:'invalid_gateway_id'});
      if (!WEBHOOK_EVENT_TYPES.has(event_type)) return send(res,400,{error:'invalid_event_type'});
      if (!signature || signature.length < 10 || signature.length > 1000) return send(res,400,{error:'signature_10_1000_required_validar_assinatura_webhook'});
      if (idempotency_key.length < 10 || idempotency_key.length > 200) return send(res,400,{error:'idempotency_key_10_200_required_validar_replay_idempotencia'});
      if (event_type === 'gateway.ping' ? charge_id != null : !uuid(charge_id)) return send(res,400,{error:'charge_id_required_for_event_type'});
      // Nenhuma afirmação do cliente é aceita: is_valid_signature e is_replay
      // vêm exclusivamente de código no servidor.
      if (body.is_valid_signature != null || body.is_replay != null || body.status != null) return send(res,400,{error:'server_computed_fields_cannot_be_set_by_client'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const gateway = await client.query('SELECT * FROM fin_payment_gateways WHERE id=$1 FOR SHARE',[gateway_id]);
        if (!gateway.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'gateway_not_found'}); }
        if (charge_id) {
          const charge = await client.query('SELECT gateway_id FROM fin_gateway_charges WHERE id=$1 FOR SHARE',[charge_id]);
          if (!charge.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'charge_not_found'}); }
          if (charge.rows[0].gateway_id !== gateway_id) { await client.query('ROLLBACK'); return send(res,409,{error:'charge_gateway_mismatch'}); }
        }
        const dup = await client.query('SELECT id,status FROM fin_gateway_webhooks WHERE idempotency_key=$1 FOR UPDATE',[idempotency_key]);
        if (dup.rows.length) {
          const existing = dup.rows[0];
          if (existing.status === 'validado' || existing.status === 'rejeitado') {
            await client.query(`UPDATE fin_gateway_webhooks SET status='replay',error_sanitized='replay_detected_idempotency_key_duplicate' WHERE id=$1`,[existing.id]);
            await insertGatewayHistory(client,'webhook',existing.id,existing.status,'replay',actor,'Replay detectado por reutilização da chave de idempotência',{idempotency_key});
            await auditLog({action:'fin_gateway_webhook_replay_detected',actor,target:existing.id,meta:{idempotency_key},client});
          }
          await client.query('COMMIT');
          return send(res,409,{error:'duplicate_idempotency_key_replay_detected', existing_id: existing.id});
        }
        const isValid = verifySandboxSignature(gateway.rows[0].webhook_secret, payload, signature);
        const status = isValid ? 'validado' : 'rejeitado';
        const created = await client.query(
          `INSERT INTO fin_gateway_webhooks (gateway_id,event_type,signature,payload,is_valid_signature,is_replay,idempotency_key,status,charge_id,verification_method)
           VALUES ($1,$2,$3,$4,$5,false,$6,$7,$8,'hmac_sha256_sandbox') RETURNING *`,
          [gateway_id, event_type, signature, JSON.stringify(payload), isValid, idempotency_key, status, charge_id]
        );
        const webhook = created.rows[0];
        await insertGatewayHistory(client,'webhook',webhook.id,null,status,actor,isValid?'Assinatura recomputada no servidor e validada':'Assinatura recomputada no servidor e rejeitada',{event_type,gateway_id,charge_id});
        await auditLog({action:'fin_gateway_webhook_receive',actor,target:webhook.id,meta:{gateway_id,event_type,is_valid_signature:isValid,idempotency_key,status},client});
        await client.query('COMMIT');
        return send(res,201,{webhook, note:'assinatura_recomputada_no_servidor_nunca_aceita_por_afirmacao_do_cliente'});
      } catch(e) { try { await client.query('ROLLBACK'); } catch {} return gatewayFailure(res,e); }
      finally { client.release(); }
    }

    // PATCH: única ação é conciliar um webhook validado com a cobrança que ele referencia.
    const id = body.id;
    const action = body.action;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!uuid(id)) return send(res,400,{error:'invalid_id'});
    if (action !== 'conciliate') return send(res,400,{error:'invalid_action_only_conciliate_supported'});
    if (reason.length < 10 || reason.length > 1000) return send(res,400,{error:'reason_10_1000_required'});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM fin_gateway_webhooks WHERE id=$1 FOR UPDATE',[id]);
      if (!found.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'not_found'}); }
      const webhook = found.rows[0];
      if (webhook.status !== 'validado') { await client.query('ROLLBACK'); return send(res,409,{error:'webhook_not_validado'}); }
      if (!webhook.charge_id) { await client.query('ROLLBACK'); return send(res,409,{error:'webhook_has_no_charge'}); }
      const chargeFound = await client.query('SELECT * FROM fin_gateway_charges WHERE id=$1 FOR UPDATE',[webhook.charge_id]);
      if (!chargeFound.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'charge_not_found'}); }
      const charge = chargeFound.rows[0];
      if (charge.gateway_id !== webhook.gateway_id) { await client.query('ROLLBACK'); return send(res,409,{error:'charge_gateway_mismatch'}); }
      let nextChargeStatus, updateSql;
      if (webhook.event_type === 'payment.confirmed') {
        if (charge.status !== 'pendente') { await client.query('ROLLBACK'); return send(res,409,{error:'charge_not_pendente'}); }
        nextChargeStatus = 'pago';
        updateSql = `UPDATE fin_gateway_charges SET status='pago',confirmation_webhook_id=$1,is_conciliated=true,conciliated_at=NOW() WHERE id=$2 RETURNING *`;
      } else if (webhook.event_type === 'payment.failed') {
        if (charge.status !== 'pendente') { await client.query('ROLLBACK'); return send(res,409,{error:'charge_not_pendente'}); }
        nextChargeStatus = 'falhou';
        updateSql = `UPDATE fin_gateway_charges SET status='falhou',confirmation_webhook_id=$1 WHERE id=$2 RETURNING *`;
      } else if (webhook.event_type === 'payment.refunded') {
        if (charge.status !== 'pago') { await client.query('ROLLBACK'); return send(res,409,{error:'charge_not_pago'}); }
        nextChargeStatus = 'estornado';
        updateSql = `UPDATE fin_gateway_charges SET status='estornado',refund_webhook_id=$1 WHERE id=$2 RETURNING *`;
      } else {
        await client.query('ROLLBACK'); return send(res,409,{error:'event_type_not_conciliable'});
      }
      // O webhook precisa virar 'conciliado' antes da cobrança: o gatilho da
      // cobrança exige que o webhook referenciado já esteja conciliado.
      const webhookUpdated = await client.query(`UPDATE fin_gateway_webhooks SET status='conciliado',processed_at=NOW(),conciliated_at=NOW() WHERE id=$1 RETURNING *`,[id]);
      const chargeUpdated = await client.query(updateSql,[id, charge.id]);
      await insertGatewayHistory(client,'webhook',id,'validado','conciliado',actor,reason,{charge_id:charge.id,event_type:webhook.event_type});
      await insertGatewayHistory(client,'charge',charge.id,charge.status,nextChargeStatus,actor,reason,{webhook_id:id,event_type:webhook.event_type});
      await auditLog({action:'fin_gateway_webhook_conciliate',actor,target:id,meta:{charge_id:charge.id,event_type:webhook.event_type,next_charge_status:nextChargeStatus,reason},client});
      await client.query('COMMIT');
      return send(res,200,{webhook:webhookUpdated.rows[0], charge:chargeUpdated.rows[0]});
    } catch(e) { try { await client.query('ROLLBACK'); } catch {} return gatewayFailure(res,e); }
    finally { client.release(); }
  };

  const handleCharges = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (!sameOrigin(req) && req.method !== 'GET') return send(res,403,{error:'forbidden_origin'});
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
    let body; try { body = await readJson(req); } catch { return send(res,400,{error:'invalid_json'}); }
    const actor = sess.identityId;
    if (!uuid(actor)) return send(res,401,{error:'unauthorized'});

    if (req.method === 'POST') {
      const gateway_id = body.gateway_id;
      const receivable_id = body.receivable_id || null;
      const amount_cents = positiveCents(body.amount_cents);
      const idempotency_key = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : '';
      if (!uuid(gateway_id)) return send(res,400,{error:'invalid_gateway_id'});
      if (receivable_id != null && !uuid(receivable_id)) return send(res,400,{error:'invalid_receivable_id'});
      if (!amount_cents) return send(res,400,{error:'amount_positive_integer'});
      if (idempotency_key.length < 10 || idempotency_key.length > 200) return send(res,400,{error:'idempotency_key_10_200_required'});
      if (body.is_real_payment === true || body.is_sandbox === false) return send(res,400,{error:'real_payment_refused_sandbox_only'});
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const gateway = await client.query('SELECT * FROM fin_payment_gateways WHERE id=$1 FOR SHARE',[gateway_id]);
        if (!gateway.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'gateway_not_found'}); }
        if (gateway.rows[0].status !== 'sandbox' || !gateway.rows[0].is_selected) { await client.query('ROLLBACK'); return send(res,409,{error:'gateway_not_selected_sandbox_tested'}); }
        const dup = await client.query('SELECT id FROM fin_gateway_charges WHERE idempotency_key=$1',[idempotency_key]);
        if (dup.rows.length) { await client.query('ROLLBACK'); return send(res,409,{error:'duplicate_idempotency_key', existing_id: dup.rows[0].id}); }
        const protocol = generateProtocol('CHG-FIN');
        const created = await client.query(
          `INSERT INTO fin_gateway_charges (protocol,gateway_id,receivable_id,amount_cents,idempotency_key,is_sandbox,created_by_identity)
           VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING *`,
          [protocol, gateway_id, receivable_id, amount_cents, idempotency_key, actor]
        );
        const charge = created.rows[0];
        await insertGatewayHistory(client,'charge',charge.id,null,'pendente',actor,'Cobrança sintética criada em gateway selecionado e testado em sandbox',{protocol,gateway_id});
        await auditLog({action:'fin_gateway_charge_create',actor,target:charge.id,meta:{protocol,gateway_id,amount_cents,idempotency_key,is_sandbox:true},client});
        await client.query('COMMIT');
        return send(res,201,{charge, note:'sem_cobranca_real_em_testes_sandbox_only'});
      } catch(e) { try { await client.query('ROLLBACK'); } catch {} return gatewayFailure(res,e); }
      finally { client.release(); }
    }

    // PATCH: único caminho manual é cancelar antes de qualquer desfecho de webhook.
    const id = body.id;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!uuid(id)) return send(res,400,{error:'invalid_id'});
    if (body.status !== 'cancelado') return send(res,400,{error:'only_cancelado_supported_outcomes_come_from_webhooks'});
    if (reason.length < 10 || reason.length > 1000) return send(res,400,{error:'reason_10_1000_required'});
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM fin_gateway_charges WHERE id=$1 FOR UPDATE',[id]);
      if (!found.rows.length) { await client.query('ROLLBACK'); return send(res,404,{error:'not_found'}); }
      const previous = found.rows[0];
      if (previous.status !== 'pendente') { await client.query('ROLLBACK'); return send(res,409,{error:'charge_cancel_requires_no_outcome'}); }
      const updated = await client.query(`UPDATE fin_gateway_charges SET status='cancelado',cancel_reason=$1 WHERE id=$2 RETURNING *`,[reason, id]);
      await insertGatewayHistory(client,'charge',id,previous.status,'cancelado',actor,reason,{protocol:previous.protocol});
      await auditLog({action:'fin_gateway_charge_cancel',actor,target:id,meta:{previous_status:previous.status,reason},client});
      await client.query('COMMIT');
      return send(res,200,{charge:updated.rows[0]});
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

  // Simulador de assinatura sandbox: reproduz o que o GATEWAY EXTERNO faria
  // com o segredo recebido fora de banda ao configurar o webhook. Isto NUNCA
  // é usado pela verificação (handleWebhooks recalcula de forma independente
  // e nunca aceita a afirmação de validade do chamador); serve somente para
  // a interface/teste simularem o lado emissor do webhook sandbox.
  const handleGatewaySandboxSign = async (req, res) => {
    const sess = await checkAuth(req, res); if (!sess) return;
    if (req.method !== 'POST') return send(res,405,{error:'method_not_allowed'});
    if (!sameOrigin(req)) return send(res,403,{error:'forbidden_origin'});
    let body; try { body = await readJson(req); } catch { return send(res,400,{error:'invalid_json'}); }
    const gateway_id = body.gateway_id;
    const payload = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : {};
    if (!uuid(gateway_id)) return send(res,400,{error:'invalid_gateway_id'});
    try {
      const { rows } = await pool.query('SELECT webhook_secret FROM fin_payment_gateways WHERE id=$1',[gateway_id]);
      if (!rows.length) return send(res,404,{error:'gateway_not_found'});
      const signature = createHmac('sha256', rows[0].webhook_secret).update(canonicalStringify(payload)).digest('hex');
      return send(res,200,{signature, note:'simulador_sandbox_nunca_usado_pela_verificacao_do_webhook'});
    } catch { return send(res,500,{error:'internal'}); }
  };

  return {
    handleManagementResults,
    handleResultHistory,
    handleExpenses,
    handleExpenseHistory,
    handleFiscalActivityRules,
    handleFiscalProviders,
    handleFiscalObligations,
    handleFiscalDocuments,
    handleFiscalHistory,
    handleGateways,
    handleWebhooks,
    handleCharges,
    handleGatewayHistory,
    handleGatewaySandboxSign,
  };
}
