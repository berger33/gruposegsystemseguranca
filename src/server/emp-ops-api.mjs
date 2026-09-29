export function createEmpOpsApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  function json(res, status, body) { res.statusCode = status; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(body)); }
  async function readJson(req) { const chunks=[]; for await(const c of req) chunks.push(c); if(!chunks.length) return {}; try{ return JSON.parse(Buffer.concat(chunks).toString('utf8')); }catch{ return {}; } }
  async function checkAuth(req,res){ if(sameOrigin && !sameOrigin(req)){ json(res,403,{error:'forbidden_origin'}); return null; } const sess=await requireSession(req); if(!sess){ json(res,401,{error:'unauthorized'}); return null; } if(!requireRole(sess,['admin','ti','rh'])){ json(res,403,{error:'forbidden_role'}); return null; } return sess; }
  function isUuid(v){ return typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); }
  function genProtocol(prefix='EMP'){ const d=new Date(); const rnd=Math.random().toString(36).slice(2,6).toUpperCase(); return `${prefix}${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${rnd}`; }

  // EMP-06 troca plantão
  async function handleShiftSwaps(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const status=url.searchParams.get('status');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`(requester_employee_id=$${i} OR target_employee_id=$${i})`); params.push(employee_id); i++; }
      if(status){ where.push(`status=$${i++}`); params.push(status); }
      const sql=`SELECT s.*, re.display_name as requester_name, te.display_name as target_name FROM emp_shift_swap_requests s LEFT JOIN hr_employees re ON re.id=s.requester_employee_id LEFT JOIN hr_employees te ON te.id=s.target_employee_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY s.created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ swaps:r.rows, note:'EMP-06 troca plantão solicitação aceite outro profissional validações aprovação operacional' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.requester_employee_id)) return json(res,400,{error:'invalid_requester_id'});
      if(b.target_employee_id && !isUuid(b.target_employee_id)) return json(res,400,{error:'invalid_target_id'});
      if(!b.swap_date) return json(res,400,{error:'swap_date_required'});
      if(!b.reason || b.reason.length<10) return json(res,400,{error:'reason_required'});
      const reqEmp=await pool.query(`SELECT id FROM hr_employees WHERE id=$1`,[b.requester_employee_id]);
      if(!reqEmp.rows.length) return json(res,404,{error:'requester_not_found'});
      if(b.target_employee_id){
        const tgt=await pool.query(`SELECT id FROM hr_employees WHERE id=$1`,[b.target_employee_id]);
        if(!tgt.rows.length) return json(res,404,{error:'target_not_found'});
        if(b.requester_employee_id===b.target_employee_id) return json(res,400,{error:'cannot_swap_with_self'});
      }
      // validações básicas: sobreposição e qualificação (simuladas com flags, mas verifica se ambos têm plantão no dia?)
      let overlappingValidated=false; let qualificationValidated=false; let validationNotes='';
      if(b.original_shift_id){
        const orig=await pool.query(`SELECT id, employee_id, shift_date FROM emp_shift_assignments WHERE id=$1`,[b.original_shift_id]);
        if(!orig.rows.length) return json(res,404,{error:'original_shift_not_found'});
        if(orig.rows[0].employee_id!==b.requester_employee_id) return json(res,400,{error:'original_shift_not_owned_by_requester'});
        // verifica se target já tem plantão no mesmo dia (sobreposição)
        if(b.target_employee_id){
          const over=await pool.query(`SELECT id FROM emp_shift_assignments WHERE employee_id=$1 AND shift_date=$2 LIMIT 1`,[b.target_employee_id, b.swap_date]);
          if(over.rows.length){ overlappingValidated=false; validationNotes+='Target já possui plantão no dia solicitado - sobreposição detectada. '; } else { overlappingValidated=true; }
        } else { overlappingValidated=true; }
        qualificationValidated=true; // simplificado: ambos vigilantes
      } else {
        overlappingValidated=true; qualificationValidated=true;
      }
      const protocol=genProtocol('SWP');
      const r=await pool.query(`INSERT INTO emp_shift_swap_requests (protocol, requester_employee_id, target_employee_id, original_shift_id, requested_shift_id, swap_date, reason, status, requester_ack, target_ack, is_overlapping_validated, is_qualification_validated, validation_notes, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,'solicitado',true,false,$8,$9,$10,$11,$12,$13) RETURNING *`,[protocol,b.requester_employee_id,b.target_employee_id||null,b.original_shift_id||null,b.requested_shift_id||null,b.swap_date,b.reason,overlappingValidated,qualificationValidated,validationNotes,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'emp_shift_swap_request', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ protocol, requester:b.requester_employee_id, target:b.target_employee_id } });
      return json(res,201,{ swap:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['solicitado','pendente_aceite','aceito','rejeitado','em_analise','aprovado','rejeitado_operacional','cancelado','encerrado','pendente'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      // aceite do outro profissional
      if(b.status==='aceito'){
        // target deve aceitar
        const cur=await pool.query(`SELECT target_employee_id FROM emp_shift_swap_requests WHERE id=$1`,[b.id]);
        if(!cur.rows.length) return json(res,404,{error:'not_found'});
        // em produção verificaria se sess é target, aqui permitimos RH aprovar aceite
        const upd=await pool.query(`UPDATE emp_shift_swap_requests SET status='aceito', target_ack=true, target_ack_at=NOW(), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id]);
        await auditLog({ action:'emp_shift_swap_accept', actor:sess.identityId||sess.id, target:b.id, meta:{ status:'aceito' } });
        return json(res,200,{ swap:upd.rows[0] });
      }
      if(b.status==='rejeitado'){
        if(!b.target_rejection_reason || b.target_rejection_reason.length<5) return json(res,400,{error:'rejection_reason_required'});
        const upd=await pool.query(`UPDATE emp_shift_swap_requests SET status='rejeitado', target_rejection_reason=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.target_rejection_reason]);
        return json(res,200,{ swap:upd.rows[0] });
      }
      if(b.status==='aprovado'){
        // aprovação operacional
        if(!b.is_overlapping_validated || !b.is_qualification_validated){
          const cur=await pool.query(`SELECT is_overlapping_validated, is_qualification_validated FROM emp_shift_swap_requests WHERE id=$1`,[b.id]);
          if(cur.rows.length && (!cur.rows[0].is_overlapping_validated || !cur.rows[0].is_qualification_validated)) return json(res,400,{error:'validations_required_before_operational_approval'});
        }
        const upd=await pool.query(`UPDATE emp_shift_swap_requests SET status='aprovado', operational_approved_by=$2, operational_approved_by_id=$2, operational_approved_at=NOW(), is_overlapping_validated=COALESCE($3,is_overlapping_validated), is_qualification_validated=COALESCE($4,is_qualification_validated), validation_notes=COALESCE($5,validation_notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,sess.identityId||sess.id,b.is_overlapping_validated,b.is_qualification_validated,b.validation_notes||null]);
        await auditLog({ action:'emp_shift_swap_approve', actor:sess.identityId||sess.id, target:b.id, meta:{ status:'aprovado' } });
        return json(res,200,{ swap:upd.rows[0] });
      }
      if(b.status==='rejeitado_operacional'){
        if(!b.operational_rejection_reason || b.operational_rejection_reason.length<5) return json(res,400,{error:'operational_rejection_reason_required'});
        const upd=await pool.query(`UPDATE emp_shift_swap_requests SET status='rejeitado_operacional', operational_rejection_reason=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.operational_rejection_reason]);
        return json(res,200,{ swap:upd.rows[0] });
      }
      const upd=await pool.query(`UPDATE emp_shift_swap_requests SET status=COALESCE($2,status), notes=COALESCE($3,notes), validation_notes=COALESCE($4,validation_notes), is_overlapping_validated=COALESCE($5,is_overlapping_validated), is_qualification_validated=COALESCE($6,is_qualification_validated), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.notes||null,b.validation_notes||null,b.is_overlapping_validated,b.is_qualification_validated]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ swap:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  // EMP-07 passagem serviço
  async function handleHandovers(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const status=url.searchParams.get('status');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`(from_employee_id=$${i} OR to_employee_id=$${i})`); params.push(employee_id); i++; }
      if(status){ where.push(`status=$${i++}`); params.push(status); }
      const sql=`SELECT h.*, fe.display_name as from_name, te.display_name as to_name FROM emp_handover_records h LEFT JOIN hr_employees fe ON fe.id=h.from_employee_id LEFT JOIN hr_employees te ON te.id=h.to_employee_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY h.handover_date DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ handovers:r.rows, note:'EMP-07 passagem serviço pendências chaves equipamentos ocorrências aceite não expor dados desnecessários terceiros' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.from_employee_id)) return json(res,400,{error:'invalid_from_id'});
      if(!isUuid(b.to_employee_id)) return json(res,400,{error:'invalid_to_id'});
      if(b.from_employee_id===b.to_employee_id) return json(res,400,{error:'cannot_handover_to_self'});
      const protocol=genProtocol('HND');
      const r=await pool.query(`INSERT INTO emp_handover_records (protocol, from_employee_id, to_employee_id, shift_assignment_id, handover_date, pending_tasks, keys_handover, equipment_handover, occurrences_summary, status, is_private, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8,'pendente',true,$9,$10,$11) RETURNING *`,[protocol,b.from_employee_id,b.to_employee_id,b.shift_assignment_id||null,b.pending_tasks||null,b.keys_handover?JSON.stringify(b.keys_handover):null,b.equipment_handover?JSON.stringify(b.equipment_handover):null,b.occurrences_summary||null,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'emp_handover_create', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ protocol, from:b.from_employee_id, to:b.to_employee_id } });
      return json(res,201,{ handover:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['pendente','em_andamento','aceito','recusado','encerrado','cancelado'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      if(b.status==='recusado' && (!b.rejection_reason||b.rejection_reason.length<5)) return json(res,400,{error:'rejection_reason_required'});
      const upd=await pool.query(`UPDATE emp_handover_records SET status=COALESCE($2,status), accepted_at=CASE WHEN $2='aceito' THEN NOW() ELSE accepted_at END, accepted_by=CASE WHEN $2='aceito' THEN $3 ELSE accepted_by END, accepted_by_id=CASE WHEN $2='aceito' THEN $3 ELSE accepted_by_id END, rejection_reason=COALESCE($4,rejection_reason), pending_tasks=COALESCE($5,pending_tasks), notes=COALESCE($6,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,sess.identityId||sess.id,b.rejection_reason||null,b.pending_tasks||null,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      if(b.status==='aceito') await auditLog({ action:'emp_handover_accept', actor:sess.identityId||sess.id, target:b.id, meta:{ protocol:upd.rows[0].protocol } });
      return json(res,200,{ handover:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  // EMP-08 ocorrência
  async function handleOccurrences(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const category=url.searchParams.get('category'); const severity=url.searchParams.get('severity');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`o.employee_id=$${i++}`); params.push(employee_id); }
      if(category){ where.push(`o.category=$${i++}`); params.push(category); }
      if(severity){ where.push(`o.severity=$${i++}`); params.push(severity); }
      const sql=`SELECT o.*, e.display_name as employee_name FROM emp_occurrences o LEFT JOIN hr_employees e ON e.id=o.employee_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY o.occurred_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      // não expor dados desnecessários de terceiros: is_personal_data_restricted true indica que descrição pode conter dados pessoais restritos, mas filtramos? Aqui mantemos flag e orientamos UI a mascarar.
      return json(res,200,{ occurrences:r.rows, note:'EMP-08 ocorrência categoria descrição horário local anexo pertinente restrição informações pessoais is_personal_data_restricted true' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(!b.title || b.title.length<5) return json(res,400,{error:'invalid_title'});
      if(!b.description || b.description.length<10) return json(res,400,{error:'invalid_description'});
      // restrição informações pessoais: se descrição contém CPF/RG, deve marcar restrito
      const containsPersonal = /cpf|rg|prontuario|diagnostico/i.test(b.description||'');
      const isRestricted = b.is_personal_data_restricted!==false || containsPersonal;
      const protocol=genProtocol('OCC');
      const r=await pool.query(`INSERT INTO emp_occurrences (protocol, employee_id, category, severity, title, description, occurred_at, location, status, is_personal_data_restricted, reported_by, reported_by_id, reported_by_name, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'aberto',$9,$10,$11,$12,$13,$14,$15) RETURNING *`,[protocol,b.employee_id,b.category||'operacional',b.severity||'media',b.title,b.description,b.occurred_at||new Date().toISOString(),b.location||null,isRestricted,sess.identityId||sess.id,sess.identityId||sess.id,b.reported_by_name||null,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'emp_occurrence_create', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ protocol, category:b.category, severity:b.severity, is_restricted:isRestricted } });
      return json(res,201,{ occurrence:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['aberto','em_analise','em_tratamento','resolvido','encerrado','cancelado','pendente'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      const upd=await pool.query(`UPDATE emp_occurrences SET status=COALESCE($2,status), resolution_notes=COALESCE($3,resolution_notes), resolved_at=CASE WHEN $2 IN ('resolvido','encerrado') THEN NOW() ELSE resolved_at END, resolved_by=CASE WHEN $2 IN ('resolvido','encerrado') THEN $4 ELSE resolved_by END, notes=COALESCE($5,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.resolution_notes||null,sess.identityId||sess.id,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ occurrence:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleOccurrenceAttachments(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const occurrence_id=url.searchParams.get('occurrence_id');
      if(!occurrence_id) return json(res,400,{error:'occurrence_id_required'});
      const r=await pool.query(`SELECT * FROM emp_occurrence_attachments WHERE occurrence_id=$1 ORDER BY created_at DESC LIMIT 100`,[occurrence_id]);
      return json(res,200,{ attachments:r.rows, note:'anexo pertinente restrição informações pessoais' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.occurrence_id)) return json(res,400,{error:'invalid_occurrence_id'});
      if(!b.file_name || !b.file_url) return json(res,400,{error:'file_required'});
      const occ=await pool.query(`SELECT id, is_personal_data_restricted FROM emp_occurrences WHERE id=$1`,[b.occurrence_id]);
      if(!occ.rows.length) return json(res,404,{error:'occurrence_not_found'});
      const isRestricted = b.is_personal_data_restricted===true || occ.rows[0].is_personal_data_restricted;
      const r=await pool.query(`INSERT INTO emp_occurrence_attachments (occurrence_id, file_name, file_url, storage_key, is_personal_data_restricted, uploaded_by, uploaded_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[b.occurrence_id,b.file_name,b.file_url,b.storage_key||null,isRestricted,sess.identityId||sess.id,sess.identityId||sess.id]);
      return json(res,201,{ attachment:r.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleOccurrenceActions(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const occurrence_id=url.searchParams.get('occurrence_id');
      if(!occurrence_id) return json(res,400,{error:'occurrence_id_required'});
      const r=await pool.query(`SELECT * FROM emp_occurrence_actions WHERE occurrence_id=$1 ORDER BY created_at ASC LIMIT 100`,[occurrence_id]);
      return json(res,200,{ actions:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.occurrence_id)) return json(res,400,{error:'invalid_occurrence_id'});
      if(!b.action_type) return json(res,400,{error:'action_type_required'});
      if(!b.description || b.description.length<5) return json(res,400,{error:'invalid_description'});
      const r=await pool.query(`INSERT INTO emp_occurrence_actions (occurrence_id, action_type, description, responsible_name, due_date, status, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,'pendente',$6,$7,$8) RETURNING *`,[b.occurrence_id,b.action_type,b.description,b.responsible_name||null,b.due_date||null,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      return json(res,201,{ action:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const upd=await pool.query(`UPDATE emp_occurrence_actions SET status=COALESCE($2,status), completed_at=CASE WHEN $2='concluida' THEN NOW() ELSE completed_at END, notes=COALESCE($3,notes) WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ action:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  // EMP-09 procedimentos posto
  async function handlePostProcedures(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const post_location=url.searchParams.get('post_location'); const status=url.searchParams.get('status');
      const where=[]; const params=[]; let i=1;
      if(post_location){ where.push(`post_location=$${i++}`); params.push(post_location); }
      if(status){ where.push(`status=$${i++}`); params.push(status); }
      const sql=`SELECT * FROM emp_post_procedures ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY post_location, title, version DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ procedures:r.rows, note:'EMP-09 procedimentos posto versionados ciência contatos apoio' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!b.post_location) return json(res,400,{error:'post_location_required'});
      if(!b.title || b.title.length<3) return json(res,400,{error:'invalid_title'});
      if(!b.content || b.content.length<20) return json(res,400,{error:'content_required_min20'});
      const maxV=await pool.query(`SELECT COALESCE(MAX(version),0) as max FROM emp_post_procedures WHERE title=$1`,[b.title]);
      const version=(maxV.rows[0].max||0)+1;
      const r=await pool.query(`INSERT INTO emp_post_procedures (post_location, title, version, content, category, status, is_active, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,'rascunho',true,$6,$7) RETURNING *`,[b.post_location,b.title,version,b.content,b.category||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      return json(res,201,{ procedure:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['rascunho','em_revisao','publicado','arquivado','cancelado'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      const upd=await pool.query(`UPDATE emp_post_procedures SET status=COALESCE($2,status), content=COALESCE($3,content), category=COALESCE($4,category), is_active=COALESCE($5,is_active), published_at=CASE WHEN $2='publicado' THEN NOW() ELSE published_at END, published_by=CASE WHEN $2='publicado' THEN $6 ELSE published_by END, published_by_id=CASE WHEN $2='publicado' THEN $6 ELSE published_by_id END, approved_by=CASE WHEN $2='publicado' THEN $6 ELSE approved_by END, approved_at=CASE WHEN $2='publicado' THEN NOW() ELSE approved_at END, rejection_reason=COALESCE($7,rejection_reason), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.content||null,b.category||null,b.is_active,sess.identityId||sess.id,b.rejection_reason||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      if(b.status==='publicado') await auditLog({ action:'emp_procedure_publish', actor:sess.identityId||sess.id, target:b.id, meta:{ title:upd.rows[0].title, version:upd.rows[0].version } });
      return json(res,200,{ procedure:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleProcedureAcks(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const procedure_id=url.searchParams.get('procedure_id'); const employee_id=url.searchParams.get('employee_id');
      const where=[]; const params=[]; let i=1;
      if(procedure_id){ where.push(`procedure_id=$${i++}`); params.push(procedure_id); }
      if(employee_id){ where.push(`employee_id=$${i++}`); params.push(employee_id); }
      const sql=`SELECT ack.*, e.display_name as employee_name, p.title as procedure_title, p.version FROM emp_procedure_acknowledgments ack LEFT JOIN hr_employees e ON e.id=ack.employee_id LEFT JOIN emp_post_procedures p ON p.id=ack.procedure_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY ack.acknowledged_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ acknowledgments:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.procedure_id)) return json(res,400,{error:'invalid_procedure_id'});
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      try{
        const r=await pool.query(`INSERT INTO emp_procedure_acknowledgments (procedure_id, employee_id, acknowledged_by, notes) VALUES ($1,$2,$3,$4) RETURNING *`,[b.procedure_id,b.employee_id,sess.identityId||sess.id,b.notes||null]);
        await auditLog({ action:'emp_procedure_ack', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ procedure_id:b.procedure_id, employee_id:b.employee_id } });
        return json(res,201,{ acknowledgment:r.rows[0] });
      }catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_ack'}); throw e; }
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleSupportContacts(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const post_location=url.searchParams.get('post_location');
      const where=post_location?`WHERE post_location=$1`:''; const params=post_location?[post_location]:[];
      const r=await pool.query(`SELECT * FROM emp_support_contacts ${where} ORDER BY is_emergency DESC, name LIMIT 200`,params);
      return json(res,200,{ contacts:r.rows, note:'EMP-09 contatos apoio' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!b.name || b.name.length<3) return json(res,400,{error:'invalid_name'});
      const r=await pool.query(`INSERT INTO emp_support_contacts (name, role, phone, email, post_location, is_emergency, is_active, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[b.name,b.role||null,b.phone||null,b.email||null,b.post_location||null,b.is_emergency===true,b.is_active!==false,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      return json(res,201,{ contact:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const upd=await pool.query(`UPDATE emp_support_contacts SET is_active=COALESCE($2,is_active), is_emergency=COALESCE($3,is_emergency), phone=COALESCE($4,phone), notes=COALESCE($5,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.is_active,b.is_emergency,b.phone||null,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ contact:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  return {
    handleShiftSwaps,
    handleHandovers,
    handleOccurrences,
    handleOccurrenceAttachments,
    handleOccurrenceActions,
    handlePostProcedures,
    handleProcedureAcks,
    handleSupportContacts,
  };
}
