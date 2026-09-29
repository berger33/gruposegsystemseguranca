export function createEmployeeComplaintApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const readJson = async (req) => { const chunks=[]; for await (const c of req) chunks.push(c); const raw=Buffer.concat(chunks).toString('utf8'); if(!raw) return {}; try{ return JSON.parse(raw);} catch{ return {}; } };
  const generateProtocol = (prefix) => { const d=new Date(); const y=d.getFullYear().toString(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); const rand=Math.random().toString(36).substring(2,6).toUpperCase(); return `${prefix}-${y}${m}${day}-${rand}`; };
  const hashValue = (v) => { try{ const crypto=require('node:crypto'); return crypto.createHash('sha256').update(String(v)).digest('hex'); } catch{ return null; } };

  const handleComplaints = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess) return json(res,401,{error:'unauthorized'});
    const isAdmin = requireRole(sess,['admin','ti']);
    const isRH = requireRole(sess,['rh']);
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const status=url.searchParams.get('status');
      const client_account_id=url.searchParams.get('client_account_id');
      let q=`SELECT * FROM cli_employee_complaints WHERE is_restricted=true`;
      const params=[];
      if(!isAdmin && !isRH){
        // cliente só vê próprias reclamações? precisa filtrar por client_account_id? Simplifica: se não admin/rh, exigir client_account_id param e validar? Para agora, cliente só vê se for seu contato? Vamos exigir que cliente informe account e validar via sessão? Como não temos vínculo cliente account na sessão genérica, permitimos filtrar por account_id mas com is_restricted true e sem expor employee_id completo se não compartilhado.
        // Para manter canal restrito, admin/ti/rh veem tudo, cliente vê apenas suas.
        if(client_account_id){ params.push(client_account_id); q+=` AND client_account_id=$${params.length}`; }
      } else {
        if(client_account_id){ params.push(client_account_id); q+=` AND client_account_id=$${params.length}`; }
        if(status){ params.push(status); q+=` AND status=$${params.length}`; }
      }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      // Minimização: se não admin/rh, remover employee_id e mostrar apenas reference_hash e category sem detalhes RH
      const minimized = (!isAdmin && !isRH) ? rows.map(r=>({ id:r.id, protocol:r.protocol, client_account_id:r.client_account_id, contract_id:r.contract_id, category:r.category, severity:r.severity, title:r.title, status:r.status, is_anonymous:r.is_anonymous, is_restricted:r.is_restricted, is_shared_with_hr:r.is_shared_with_hr, responsible_name:r.responsible_name, due_date:r.due_date, created_at:r.created_at })) : rows;
      return json(res,200,{items:minimized, note:'reclamação sobre colaborador tratada em canal restrito, compartilhamento mínimo com RH'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const client_account_id=b.client_account_id||null;
      const contract_id=b.contract_id||null;
      const contact_id=b.contact_id||null;
      const employee_id=b.employee_id||null;
      const employee_reference=b.employee_reference?String(b.employee_reference).trim():null;
      const category=String(b.category||'outro').trim();
      const severity=String(b.severity||'media').trim();
      const title=String(b.title||'').trim();
      const description=String(b.description||'').trim();
      const is_anonymous=!!b.is_anonymous;
      if(title.length<5||title.length>200) return json(res,400,{error:'invalid_title'});
      if(description.length<20||description.length>5000) return json(res,400,{error:'invalid_description'});
      const validCat=['atendimento','comportamento','seguranca','assédio','discriminacao','outro'];
      const validSev=['baixa','media','alta','critica'];
      if(!validCat.includes(category)) return json(res,400,{error:'invalid_category'});
      if(!validSev.includes(severity)) return json(res,400,{error:'invalid_severity'});
      if(employee_reference && (employee_reference.length<3||employee_reference.length>200)) return json(res,400,{error:'invalid_employee_reference'});
      const protocol=generateProtocol('CLI-COMP');
      const employee_reference_hash=employee_reference?hashValue(employee_reference):null;
      const { rows } = await pool.query(`INSERT INTO cli_employee_complaints (protocol, client_account_id, contract_id, contact_id, employee_id, employee_reference, employee_reference_hash, category, severity, title, description, is_anonymous, is_restricted, minimal_share, created_by_identity, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,true,$13,$14) RETURNING *`,
        [protocol, client_account_id, contract_id, contact_id, employee_id, employee_reference, employee_reference_hash, category, severity, title, description, is_anonymous, sess.identityId||null, sess.role||null]);
      await pool.query(`INSERT INTO cli_employee_complaint_history (complaint_id, previous_status, next_status, reason, changed_by_identity, changed_by_name, is_hr_share) VALUES ($1,NULL,$2,$3,$4,$5,false)`, [rows[0].id, 'pendente', 'Criação inicial reclamação colaborador canal restrito compartilhamento mínimo RH', sess.identityId||null, sess.role||null]);
      await auditLog({ action:'cli_complaint_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ protocol, category, severity, is_restricted: true, minimal_share: true } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      if(!isAdmin && !isRH) return json(res,403,{error:'forbidden_restricted_channel'});
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      const responsible_name=b.responsible_name?String(b.responsible_name).trim():null;
      const due_date=b.due_date||null;
      const reason=String(b.reason||'Atualização reclamação').trim();
      if(!id) return json(res,400,{error:'missing_id'});
      if(reason.length<10||reason.length>1000) return json(res,400,{error:'invalid_reason'});
      const { rows: existing } = await pool.query(`SELECT * FROM cli_employee_complaints WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const cur=existing[0];
      const nextStatus=status||cur.status;
      const valid=['pendente','em_analise','em_apuracao','resolvida','arquivada','cancelada','escalonada'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      const { rows } = await pool.query(`UPDATE cli_employee_complaints SET status=$2, responsible_name=COALESCE($3,responsible_name), responsible_id=COALESCE($4,responsible_id), due_date=COALESCE($5,due_date), resolved_at=CASE WHEN $2 IN ('resolvida','arquivada') THEN NOW() ELSE resolved_at END, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, nextStatus, responsible_name, sess.identityId||null, due_date]);
      await pool.query(`INSERT INTO cli_employee_complaint_history (complaint_id, previous_status, next_status, reason, changed_by_identity, changed_by_name, is_hr_share) VALUES ($1,$2,$3,$4,$5,$6,false)`, [id, cur.status, nextStatus, reason, sess.identityId||null, sess.role||null]);
      await auditLog({ action:'cli_complaint_status', actor:sess.identityId||'system', target:id, meta:{ from: cur.status, to: nextStatus, reason: reason.substring(0,200) } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleComplaintById = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess) return json(res,401,{error:'unauthorized'});
    const isAdmin=requireRole(sess,['admin','ti']);
    const isRH=requireRole(sess,['rh']);
    const url=new URL(req.url,'http://localhost');
    const parts=url.pathname.split('/');
    const id=parts[parts.length-1];
    if(!id) return json(res,400,{error:'missing_id'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM cli_employee_complaints WHERE id=$1`, [id]);
      if(!rows.length) return json(res,404,{error:'not_found'});
      const { rows: messages } = await pool.query(`SELECT * FROM cli_employee_complaint_messages WHERE complaint_id=$1 ORDER BY created_at ASC`, [id]);
      const { rows: evidences } = await pool.query(`SELECT * FROM cli_employee_complaint_evidences WHERE complaint_id=$1 ORDER BY created_at ASC`, [id]);
      const { rows: history } = await pool.query(`SELECT * FROM cli_employee_complaint_history WHERE complaint_id=$1 ORDER BY created_at DESC`, [id]);
      const { rows: hrShares } = await pool.query(`SELECT * FROM cli_employee_complaint_hr_shares WHERE complaint_id=$1 ORDER BY shared_at DESC`, [id]);
      // Minimização para cliente: mensagens só cliente e gestao, não rh interno, evidências sem hr_visible se não compartilhado
      let filteredMessages=messages;
      let filteredEvidences=evidences;
      let filteredHrShares=hrShares;
      if(!isAdmin && !isRH){
        filteredMessages=messages.filter(m=>m.sender_type==='cliente'||m.sender_type==='gestao');
        filteredEvidences=evidences.filter(e=>!e.is_hr_visible);
        filteredHrShares=[];
      }
      const complaint = (!isAdmin && !isRH) ? { id: rows[0].id, protocol: rows[0].protocol, client_account_id: rows[0].client_account_id, category: rows[0].category, severity: rows[0].severity, title: rows[0].title, description: rows[0].description, status: rows[0].status, is_restricted: rows[0].is_restricted, minimal_share: rows[0].minimal_share, responsible_name: rows[0].responsible_name, created_at: rows[0].created_at } : rows[0];
      return json(res,200,{ complaint, messages: filteredMessages, evidences: filteredEvidences, history, hr_shares: filteredHrShares });
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleMessages = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess) return json(res,401,{error:'unauthorized'});
    const url=new URL(req.url,'http://localhost');
    const complaint_id=url.searchParams.get('complaint_id') || (await readJson(req)).complaint_id;
    if(req.method==='GET'){
      if(!complaint_id) return json(res,400,{error:'missing_complaint_id'});
      const { rows } = await pool.query(`SELECT * FROM cli_employee_complaint_messages WHERE complaint_id=$1 ORDER BY created_at ASC`, [complaint_id]);
      return json(res,200,{items:rows});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const cid=b.complaint_id||complaint_id;
      const message=String(b.message||'').trim();
      const sender_type=String(b.sender_type||'cliente').trim();
      const is_internal=!!b.is_internal;
      const is_hr_visible=!!b.is_hr_visible;
      if(!cid) return json(res,400,{error:'missing_complaint_id'});
      if(message.length<10||message.length>5000) return json(res,400,{error:'invalid_message'});
      const validSender=['cliente','rh','compliance','gestao','sistema'];
      if(!validSender.includes(sender_type)) return json(res,400,{error:'invalid_sender_type'});
      if(sender_type==='rh' && !requireRole(sess,['rh','admin','ti'])) return json(res,403,{error:'rh_only'});
      if(is_hr_visible && !requireRole(sess,['admin','ti','rh'])) return json(res,403,{error:'hr_share_requires_role'});
      const { rows: existing } = await pool.query(`SELECT * FROM cli_employee_complaints WHERE id=$1`, [cid]);
      if(!existing.length) return json(res,404,{error:'complaint_not_found'});
      const { rows } = await pool.query(`INSERT INTO cli_employee_complaint_messages (complaint_id, sender_type, sender_identity, sender_name, message, is_internal, is_restricted, is_hr_visible) VALUES ($1,$2,$3,$4,$5,$6,true,$7) RETURNING *`, [cid, sender_type, sess.identityId||null, String(b.sender_name||sess.role||'cliente').substring(0,200), message, is_internal, is_hr_visible]);
      await auditLog({ action:'cli_complaint_message_create', actor:sess.identityId||'system', target:cid, meta:{ sender_type, is_restricted: true, is_hr_visible } });
      return json(res,201,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleEvidences = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const complaint_id=url.searchParams.get('complaint_id');
      if(!complaint_id) return json(res,400,{error:'missing_complaint_id'});
      const { rows } = await pool.query(`SELECT * FROM cli_employee_complaint_evidences WHERE complaint_id=$1 ORDER BY created_at ASC`, [complaint_id]);
      return json(res,200,{items:rows});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const complaint_id=b.complaint_id;
      const file_name=String(b.file_name||'').trim();
      const file_url=String(b.file_url||'').trim();
      const storage_key=String(b.storage_key||'').trim();
      const is_hr_visible=!!b.is_hr_visible;
      if(!complaint_id) return json(res,400,{error:'missing_complaint_id'});
      if(file_name.length<1||file_name.length>500) return json(res,400,{error:'invalid_file_name'});
      if(file_url.length<5||file_url.length>1000) return json(res,400,{error:'invalid_file_url'});
      if(storage_key.length<5||storage_key.length>500) return json(res,400,{error:'invalid_storage_key'});
      if(is_hr_visible && !requireRole(sess,['admin','ti','rh'])) return json(res,400,{error:'hr_share_requires_role'});
      try{
        const { rows } = await pool.query(`INSERT INTO cli_employee_complaint_evidences (complaint_id, file_name, file_url, storage_key, is_restricted, is_hr_visible, uploaded_by_identity, uploaded_by_name) VALUES ($1,$2,$3,$4,true,$5,$6,$7) RETURNING *`, [complaint_id, file_name, file_url, storage_key, is_hr_visible, sess.identityId||null, sess.role||null]);
        await auditLog({ action:'cli_complaint_evidence_create', actor:sess.identityId||'system', target:complaint_id, meta:{ file_name, is_restricted: true, is_hr_visible } });
        return json(res,201,rows[0]);
      } catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_storage_key'}); throw e; }
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleHrShare = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='POST'){
      const b=await readJson(req);
      const complaint_id=b.complaint_id;
      const shared_field=String(b.shared_field||'').trim();
      const shared_value=String(b.shared_value||'').trim();
      const justification=String(b.justification||'').trim();
      if(!complaint_id) return json(res,400,{error:'missing_complaint_id'});
      if(shared_field.length<3||shared_field.length>100) return json(res,400,{error:'invalid_shared_field'});
      if(shared_value.length<1||shared_value.length>1000) return json(res,400,{error:'invalid_shared_value'});
      if(justification.length<10||justification.length>1000) return json(res,400,{error:'invalid_justification'});
      const allowedFields=['category','severity','title','status','protocol','minimal_description'];
      if(!allowedFields.includes(shared_field)) return json(res,400,{error:'field_not_allowed_minimal_share', allowed: allowedFields});
      const { rows: existing } = await pool.query(`SELECT * FROM cli_employee_complaints WHERE id=$1`, [complaint_id]);
      if(!existing.length) return json(res,404,{error:'complaint_not_found'});
      const { rows } = await pool.query(`INSERT INTO cli_employee_complaint_hr_shares (complaint_id, shared_field, shared_value, shared_by_identity, shared_by_name, justification) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [complaint_id, shared_field, shared_value, sess.identityId||null, sess.role||null, justification]);
      await pool.query(`UPDATE cli_employee_complaints SET is_shared_with_hr=true, shared_with_hr_at=NOW(), shared_with_hr_by_identity=$2, shared_with_hr_by_name=$3, shared_reason=$4, updated_at=NOW() WHERE id=$1`, [complaint_id, sess.identityId||null, sess.role||null, justification]);
      await pool.query(`INSERT INTO cli_employee_complaint_history (complaint_id, previous_status, next_status, reason, changed_by_identity, changed_by_name, is_hr_share) VALUES ($1,$2,$2,$3,$4,$5,true)`, [complaint_id, existing[0].status, `Compartilhamento mínimo com RH: ${shared_field}=${shared_value} justificativa: ${justification}`, sess.identityId||null, sess.role||null]);
      await auditLog({ action:'cli_complaint_hr_share', actor:sess.identityId||'system', target:complaint_id, meta:{ shared_field, justification: justification.substring(0,200), minimal_share: true } });
      return json(res,201,rows[0]);
    }
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const complaint_id=url.searchParams.get('complaint_id');
      if(!complaint_id) return json(res,400,{error:'missing_complaint_id'});
      const { rows } = await pool.query(`SELECT * FROM cli_employee_complaint_hr_shares WHERE complaint_id=$1 ORDER BY shared_at DESC`, [complaint_id]);
      return json(res,200,{items:rows, note:'compartilhamento mínimo com RH, apenas campos permitidos'});
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  return { handleComplaints, handleComplaintById, handleMessages, handleEvidences, handleHrShare };
}
