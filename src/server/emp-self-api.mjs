export function createEmpSelfApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  function json(res, status, body) { res.statusCode = status; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(body)); }
  async function readJson(req) { const chunks=[]; for await(const c of req) chunks.push(c); if(!chunks.length) return {}; try{ return JSON.parse(Buffer.concat(chunks).toString('utf8')); }catch{ return {}; } }
  async function checkAuth(req,res){ if(sameOrigin && !sameOrigin(req)){ json(res,403,{error:'forbidden_origin'}); return null; } const sess=await requireSession(req); if(!sess){ json(res,401,{error:'unauthorized'}); return null; } if(!requireRole(sess,['admin','ti','rh'])){ json(res,403,{error:'forbidden_role'}); return null; } return sess; }
  function isUuid(v){ return typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); }
  function validComp(c){ return typeof c==='string' && /^\d{4}-\d{2}$/.test(c); }
  function genProtocol(prefix='EMP'){ const d=new Date(); const rnd=Math.random().toString(36).slice(2,6).toUpperCase(); return `${prefix}${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${rnd}`; }
  function hashValue(v){ const crypto=require('node:crypto'); return crypto.createHash('sha256').update(String(v)).digest('hex').slice(0,32); }

  // EMP-10 documentos solicitados
  async function handleDocumentSubmissions(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const status=url.searchParams.get('status'); const doc_type=url.searchParams.get('doc_type');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`ds.employee_id=$${i++}`); params.push(employee_id); }
      if(status){ where.push(`ds.status=$${i++}`); params.push(status); }
      if(doc_type){ where.push(`ds.doc_type=$${i++}`); params.push(doc_type); }
      const sql=`SELECT ds.*, e.display_name as employee_name FROM emp_document_submissions ds LEFT JOIN hr_employees e ON e.id=ds.employee_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY ds.created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ submissions:r.rows, note:'EMP-10 envio documentos solicitados status pendente/em análise/aprovado/rejeitado motivo nova versão' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(!b.doc_type) return json(res,400,{error:'doc_type_required'});
      if(!b.title || b.title.length<3) return json(res,400,{error:'invalid_title'});
      if(!b.file_url) return json(res,400,{error:'file_url_required'});
      const emp=await pool.query(`SELECT id FROM hr_employees WHERE id=$1`,[b.employee_id]);
      if(!emp.rows.length) return json(res,404,{error:'employee_not_found'});
      const maxV=await pool.query(`SELECT COALESCE(MAX(version),0) as max FROM emp_document_submissions WHERE employee_id=$1 AND doc_type=$2`,[b.employee_id,b.doc_type]);
      const version=(maxV.rows[0].max||0)+1;
      const r=await pool.query(`INSERT INTO emp_document_submissions (employee_id, doc_type, title, file_url, storage_key, version, status, is_restricted, requested_by, requested_by_id, requested_at, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,'pendente',true,$7,$8,NOW(),$9,$10,$11) RETURNING *`,[b.employee_id,b.doc_type,b.title,b.file_url,b.storage_key||null,version,b.requested_by||null,b.requested_by_id||null,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'emp_document_submit', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ employee_id:b.employee_id, doc_type:b.doc_type, version } });
      return json(res,201,{ submission:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['pendente','em_analise','aprovado','rejeitado','arquivado','cancelado','solicitado'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      if(b.status==='rejeitado' && (!b.rejection_reason||b.rejection_reason.length<5)) return json(res,400,{error:'rejection_reason_required'});
      const upd=await pool.query(`UPDATE emp_document_submissions SET status=COALESCE($2,status), rejection_reason=COALESCE($3,rejection_reason), reviewed_by=CASE WHEN $2 IN ('aprovado','rejeitado','em_analise') THEN $4 ELSE reviewed_by END, reviewed_by_id=CASE WHEN $2 IN ('aprovado','rejeitado','em_analise') THEN $4 ELSE reviewed_by_id END, reviewed_at=CASE WHEN $2 IN ('aprovado','rejeitado','em_analise') THEN NOW() ELSE reviewed_at END, notes=COALESCE($5,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.rejection_reason||null,sess.identityId||sess.id,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      if(b.status) await auditLog({ action:'emp_document_review', actor:sess.identityId||sess.id, target:b.id, meta:{ status:b.status } });
      return json(res,200,{ submission:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  // EMP-11 holerites próprios acesso privado histórico disponibilização fonte autorizada
  async function handleOwnDocAccessLogs(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id');
      const where=employee_id?`WHERE l.employee_id=$1`:''; const params=employee_id?[employee_id]:[];
      const sql=`SELECT l.*, e.display_name as employee_name, pd.title as document_title, pd.competence FROM emp_own_document_access_logs l LEFT JOIN hr_employees e ON e.id=l.employee_id LEFT JOIN hr_payroll_documents pd ON pd.id=l.document_id ${where} ORDER BY l.accessed_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ logs:r.rows, note:'EMP-11 holerites/informes/documentos próprios acesso privado histórico disponibilização fonte autorizada is_private true' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(!b.doc_type) return json(res,400,{error:'doc_type_required'});
      // verifica documento existe e é do employee e fonte autorizada
      if(b.document_id){
        if(!isUuid(b.document_id)) return json(res,400,{error:'invalid_document_id'});
        const doc=await pool.query(`SELECT pd.id, pd.employee_id, pd.source_id, ps.is_authorized FROM hr_payroll_documents pd LEFT JOIN hr_payroll_sources ps ON ps.id=pd.source_id WHERE pd.id=$1`,[b.document_id]);
        if(!doc.rows.length) return json(res,404,{error:'document_not_found'});
        if(doc.rows[0].employee_id!==b.employee_id) return json(res,400,{error:'document_not_owned_by_employee'});
        if(!doc.rows[0].is_authorized) return json(res,409,{error:'source_not_authorized'});
      }
      const r=await pool.query(`INSERT INTO emp_own_document_access_logs (employee_id, document_id, submission_id, doc_type, competence, ip_hash, user_agent_hash, is_private) VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING *`,[b.employee_id,b.document_id||null,b.submission_id||null,b.doc_type,b.competence||null,hashValue(b.ip||''),hashValue(b.user_agent||'')]);
      await auditLog({ action:'emp_own_doc_access', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ employee_id:b.employee_id, doc_type:b.doc_type } });
      return json(res,201,{ log:r.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleDocAvailability(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id');
      const where=employee_id?`WHERE h.employee_id=$1`:''; const params=employee_id?[employee_id]:[];
      const sql=`SELECT h.*, e.display_name as employee_name, ps.name as source_name FROM emp_document_availability_history h LEFT JOIN hr_employees e ON e.id=h.employee_id LEFT JOIN hr_payroll_sources ps ON ps.id=h.source_id ${where} ORDER BY h.made_available_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ history:r.rows, note:'histórico disponibilização fonte autorizada' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(b.document_id && !isUuid(b.document_id)) return json(res,400,{error:'invalid_document_id'});
      if(b.source_id){
        const src=await pool.query(`SELECT id, is_authorized FROM hr_payroll_sources WHERE id=$1`,[b.source_id]);
        if(!src.rows.length) return json(res,404,{error:'source_not_found'});
        if(!src.rows[0].is_authorized) return json(res,409,{error:'source_not_authorized'});
      }
      const r=await pool.query(`INSERT INTO emp_document_availability_history (document_id, submission_id, employee_id, made_available_by, made_available_by_id, source_id, is_from_authorized_source, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[b.document_id||null,b.submission_id||null,b.employee_id,sess.identityId||sess.id,sess.identityId||sess.id,b.source_id||null,b.is_from_authorized_source!==false,b.notes||null]);
      return json(res,201,{ history:r.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  // EMP-12 férias/afastamentos/benefícios/reembolsos
  async function handleSelfRequests(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const request_type=url.searchParams.get('request_type'); const category=url.searchParams.get('category'); const status=url.searchParams.get('status');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`employee_id=$${i++}`); params.push(employee_id); }
      if(request_type){ where.push(`request_type=$${i++}`); params.push(request_type); }
      if(category){ where.push(`category=$${i++}`); params.push(category); }
      if(status){ where.push(`status=$${i++}`); params.push(status); }
      const sql=`SELECT sr.*, e.display_name as employee_name FROM emp_self_requests sr LEFT JOIN hr_employees e ON e.id=sr.employee_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY sr.created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ requests:r.rows, note:'EMP-12 férias afastamentos benefícios reembolsos solicitação anexos restritos aprovação prazo resposta' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(!b.request_type) return json(res,400,{error:'request_type_required'});
      if(!b.title || b.title.length<5) return json(res,400,{error:'invalid_title'});
      if(!b.description || b.description.length<10) return json(res,400,{error:'invalid_description'});
      const allowedTypes=['ferias','afastamento','beneficio','reembolso','outro'];
      if(!allowedTypes.includes(b.request_type)) return json(res,400,{error:'invalid_request_type'});
      const allowedCat=['ferias','afastamento','beneficio','reembolso','documento','uniforme','outro'];
      if(b.category && !allowedCat.includes(b.category)) return json(res,400,{error:'invalid_category'});
      // prazo resposta: due_date deve ser futuro se informado
      if(b.due_date){
        const due=new Date(b.due_date); if(isNaN(due.getTime())) return json(res,400,{error:'invalid_due_date'});
        if(due < new Date()) return json(res,400,{error:'due_date_must_be_future'});
      }
      // anexos restritos: se is_restricted true, attachment deve ser tratado como restrito
      const protocol=genProtocol('REQ');
      const responseDeadline=b.response_deadline||b.due_date||null;
      const r=await pool.query(`INSERT INTO emp_self_requests (protocol, employee_id, request_type, category, title, description, status, due_date, responsible_id, responsible_name, is_restricted, attachment_url, attachment_storage_key, response_deadline, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,'solicitado',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,[protocol,b.employee_id,b.request_type,b.category||b.request_type,b.title,b.description,b.due_date||null,b.responsible_id||null,b.responsible_name||null,b.is_restricted===true,b.attachment_url||null,b.attachment_storage_key||null,responseDeadline,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'emp_self_request_create', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ protocol, request_type:b.request_type, is_restricted:b.is_restricted } });
      return json(res,201,{ request:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['solicitado','em_analise','aprovado','rejeitado','cancelado','concluido','pendente','encerrado'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      if(b.status==='rejeitado' && (!b.rejection_reason||b.rejection_reason.length<5)) return json(res,400,{error:'rejection_reason_required'});
      const upd=await pool.query(`UPDATE emp_self_requests SET status=COALESCE($2,status), responsible_id=COALESCE($3,responsible_id), responsible_name=COALESCE($4,responsible_name), due_date=COALESCE($5,due_date), approved_by=CASE WHEN $2='aprovado' THEN $6 ELSE approved_by END, approved_by_id=CASE WHEN $2='aprovado' THEN $6 ELSE approved_by_id END, approved_at=CASE WHEN $2='aprovado' THEN NOW() ELSE approved_at END, rejection_reason=COALESCE($7,rejection_reason), responded_at=CASE WHEN $2 IN ('aprovado','rejeitado','concluido','encerrado') THEN NOW() ELSE responded_at END, notes=COALESCE($8,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.responsible_id||null,b.responsible_name||null,b.due_date||null,sess.identityId||sess.id,b.rejection_reason||null,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      if(b.status==='aprovado') await auditLog({ action:'emp_self_request_approve', actor:sess.identityId||sess.id, target:b.id, meta:{ status:b.status } });
      return json(res,200,{ request:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleSelfRequestFollowups(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const request_id=url.searchParams.get('request_id');
      if(!request_id) return json(res,400,{error:'request_id_required'});
      const r=await pool.query(`SELECT * FROM emp_self_request_followups WHERE request_id=$1 ORDER BY created_at ASC LIMIT 200`,[request_id]);
      return json(res,200,{ followups:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.request_id)) return json(res,400,{error:'invalid_request_id'});
      if(!b.message || b.message.length<5) return json(res,400,{error:'invalid_message'});
      const reqExist=await pool.query(`SELECT id FROM emp_self_requests WHERE id=$1`,[b.request_id]);
      if(!reqExist.rows.length) return json(res,404,{error:'request_not_found'});
      const r=await pool.query(`INSERT INTO emp_self_request_followups (request_id, message, status, created_by, created_by_id, created_by_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,[b.request_id,b.message,b.status||null,sess.identityId||sess.id,sess.identityId||sess.id,b.created_by_name||'RH']);
      if(b.status){
        await pool.query(`UPDATE emp_self_requests SET status=$2, updated_at=NOW() WHERE id=$1`,[b.request_id,b.status]);
      }
      return json(res,201,{ followup:r.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  // EMP-13 uniformes/EPI
  async function handleUniformSelfRequests(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const status=url.searchParams.get('status');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`ur.employee_id=$${i++}`); params.push(employee_id); }
      if(status){ where.push(`ur.status=$${i++}`); params.push(status); }
      const sql=`SELECT ur.*, e.display_name as employee_name, uc.name as uniform_name FROM emp_uniform_self_requests ur LEFT JOIN hr_employees e ON e.id=ur.employee_id LEFT JOIN hr_uniform_catalog uc ON uc.id=ur.uniform_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY ur.created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ requests:r.rows, note:'EMP-13 uniformes/EPI/equipamentos entrega recibo solicitação troca devolução' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(!b.request_type) return json(res,400,{error:'request_type_required'});
      if(!['entrega','substituicao','devolucao','outro'].includes(b.request_type)) return json(res,400,{error:'invalid_request_type'});
      if(!b.reason || b.reason.length<10) return json(res,400,{error:'reason_required'});
      const protocol=genProtocol('UNI');
      const r=await pool.query(`INSERT INTO emp_uniform_self_requests (protocol, employee_id, uniform_id, request_type, reason, size, quantity, status, due_date, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,'solicitado',$8,$9,$10,$11) RETURNING *`,[protocol,b.employee_id,b.uniform_id||null,b.request_type,b.reason,b.size||null,b.quantity||1,b.due_date||null,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'emp_uniform_self_request', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ protocol, request_type:b.request_type } });
      return json(res,201,{ request:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['solicitado','em_analise','aprovado','rejeitado','entregue','cancelado','pendente'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      if(b.status==='rejeitado' && (!b.rejection_reason||b.rejection_reason.length<5)) return json(res,400,{error:'rejection_reason_required'});
      const upd=await pool.query(`UPDATE emp_uniform_self_requests SET status=COALESCE($2,status), approved_by=CASE WHEN $2='aprovado' THEN $3 ELSE approved_by END, approved_by_id=CASE WHEN $2='aprovado' THEN $3 ELSE approved_by_id END, approved_at=CASE WHEN $2='aprovado' THEN NOW() ELSE approved_at END, rejection_reason=COALESCE($4,rejection_reason), delivery_id=COALESCE($5,delivery_id), notes=COALESCE($6,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,sess.identityId||sess.id,b.rejection_reason||null,b.delivery_id||null,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ request:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleUniformReceipts(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const delivery_id=url.searchParams.get('delivery_id');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`rc.employee_id=$${i++}`); params.push(employee_id); }
      if(delivery_id){ where.push(`rc.delivery_id=$${i++}`); params.push(delivery_id); }
      const sql=`SELECT rc.*, e.display_name as employee_name FROM emp_uniform_receipt_confirmations rc LEFT JOIN hr_employees e ON e.id=rc.employee_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY rc.created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ receipts:r.rows, note:'EMP-13 entrega recibo' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.delivery_id)) return json(res,400,{error:'invalid_delivery_id'});
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      const del=await pool.query(`SELECT id, employee_id FROM hr_uniform_deliveries WHERE id=$1`,[b.delivery_id]);
      if(!del.rows.length) return json(res,404,{error:'delivery_not_found'});
      if(del.rows[0].employee_id!==b.employee_id) return json(res,400,{error:'delivery_not_owned_by_employee'});
      try{
        const r=await pool.query(`INSERT INTO emp_uniform_receipt_confirmations (delivery_id, employee_id, receipt_signed, receipt_url, storage_key, signed_at, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[b.delivery_id,b.employee_id,b.receipt_signed===true,b.receipt_url||null,b.storage_key||null,b.receipt_signed?new Date().toISOString():null,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
        await auditLog({ action:'emp_uniform_receipt_confirm', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ delivery_id:b.delivery_id, receipt_signed:b.receipt_signed } });
        // atualiza entrega original
        await pool.query(`UPDATE hr_uniform_deliveries SET receipt_signed=$2, receipt_url=COALESCE($3,receipt_url), updated_at=NOW() WHERE id=$1`,[b.delivery_id,b.receipt_signed===true,b.receipt_url||null]);
        return json(res,201,{ receipt:r.rows[0] });
      }catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_receipt'}); throw e; }
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const upd=await pool.query(`UPDATE emp_uniform_receipt_confirmations SET receipt_signed=COALESCE($2,receipt_signed), receipt_url=COALESCE($3,receipt_url), signed_at=CASE WHEN $2=true THEN NOW() ELSE signed_at END, notes=COALESCE($4,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.receipt_signed,b.receipt_url||null,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ receipt:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  return {
    handleDocumentSubmissions,
    handleOwnDocAccessLogs,
    handleDocAvailability,
    handleSelfRequests,
    handleSelfRequestFollowups,
    handleUniformSelfRequests,
    handleUniformReceipts,
  };
}
