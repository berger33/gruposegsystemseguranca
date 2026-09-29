import { createHash } from 'node:crypto';

export function createEmpAdvanced2Api({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  function json(res, status, body) { res.statusCode = status; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(body)); }
  async function readJson(req) { const chunks=[]; for await(const c of req) chunks.push(c); if(!chunks.length) return {}; try{ return JSON.parse(Buffer.concat(chunks).toString('utf8')); }catch{ return {}; } }
  async function checkAuth(req,res){ if(sameOrigin && !sameOrigin(req)){ json(res,403,{error:'forbidden_origin'}); return null; } const sess=await requireSession(req); if(!sess){ json(res,401,{error:'unauthorized'}); return null; } if(!requireRole(sess,['admin','ti','rh'])){ json(res,403,{error:'forbidden_role'}); return null; } return sess; }
  function isUuid(v){ return typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); }
  function genProtocol(prefix='EMP'){ const d=new Date(); const rnd=Math.random().toString(36).slice(2,6).toUpperCase(); return `${prefix}${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${rnd}`; }
  function hashValue(v){ return createHash('sha256').update(String(v)).digest('hex').slice(0,32); }

  // EMP-14 cursos reciclagens comprovantes alertas vencimento
  async function handleCourseEnrollments(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const status=url.searchParams.get('status');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`ce.employee_id=$${i++}`); params.push(employee_id); }
      if(status){ where.push(`ce.status=$${i++}`); params.push(status); }
      const sql=`SELECT ce.*, e.display_name as employee_name, tc.name as training_name FROM emp_course_enrollments ce LEFT JOIN hr_employees e ON e.id=ce.employee_id LEFT JOIN hr_training_catalog tc ON tc.id=ce.training_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY ce.enrollment_date DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ enrollments:r.rows, note:'EMP-14 cursos reciclagens comprovantes alertas vencimento' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(b.training_id && !isUuid(b.training_id)) return json(res,400,{error:'invalid_training_id'});
      const emp=await pool.query(`SELECT id FROM hr_employees WHERE id=$1`,[b.employee_id]);
      if(!emp.rows.length) return json(res,404,{error:'employee_not_found'});
      try{
        const r=await pool.query(`INSERT INTO emp_course_enrollments (employee_id, training_id, session_id, enrollment_date, completion_date, status, presence_percent, score, certificate_url, is_certificate_valid, expiry_date, alert_days_before, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,[b.employee_id,b.training_id||null,b.session_id||null,b.enrollment_date||new Date().toISOString().slice(0,10),b.completion_date||null,b.status||'inscrito',b.presence_percent||null,b.score||null,b.certificate_url||null,b.is_certificate_valid===true,b.expiry_date||null,b.alert_days_before||30,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
        await auditLog({ action:'emp_course_enroll', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ employee_id:b.employee_id, training_id:b.training_id } });
        // criar alerta vencimento se expiry_date
        if(r.rows[0].expiry_date){
          const expiry=new Date(r.rows[0].expiry_date);
          const alertDate=new Date(expiry); alertDate.setDate(expiry.getDate() - (r.rows[0].alert_days_before||30));
          await pool.query(`INSERT INTO emp_course_expiry_alerts (enrollment_id, employee_id, training_id, expiry_date, alert_date, status, message, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,'pendente',$6,$7,$8)`,[r.rows[0].id,b.employee_id,b.training_id||null,r.rows[0].expiry_date,alertDate.toISOString().slice(0,10),`Alerta vencimento curso ${b.training_id} expira ${r.rows[0].expiry_date}`,sess.identityId||sess.id,sess.identityId||sess.id]);
        }
        return json(res,201,{ enrollment:r.rows[0] });
      }catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_enrollment'}); throw e; }
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['inscrito','em_andamento','concluido','reprovado','pendente','vencido','cancelado','aprovado','rejeitado'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      const upd=await pool.query(`UPDATE emp_course_enrollments SET status=COALESCE($2,status), presence_percent=COALESCE($3,presence_percent), score=COALESCE($4,score), certificate_url=COALESCE($5,certificate_url), is_certificate_valid=COALESCE($6,is_certificate_valid), expiry_date=COALESCE($7,expiry_date), completion_date=COALESCE($8,completion_date), notes=COALESCE($9,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.presence_percent,b.score,b.certificate_url||null,b.is_certificate_valid,b.expiry_date||null,b.completion_date||null,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ enrollment:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleCourseProofs(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const enrollment_id=url.searchParams.get('enrollment_id');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`cp.employee_id=$${i++}`); params.push(employee_id); }
      if(enrollment_id){ where.push(`cp.enrollment_id=$${i++}`); params.push(enrollment_id); }
      const sql=`SELECT cp.*, e.display_name as employee_name FROM emp_course_proofs cp LEFT JOIN hr_employees e ON e.id=cp.employee_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY cp.created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ proofs:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.enrollment_id)) return json(res,400,{error:'invalid_enrollment_id'});
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(!b.file_url) return json(res,400,{error:'file_url_required'});
      const en=await pool.query(`SELECT id, employee_id FROM emp_course_enrollments WHERE id=$1`,[b.enrollment_id]);
      if(!en.rows.length) return json(res,404,{error:'enrollment_not_found'});
      if(en.rows[0].employee_id!==b.employee_id) return json(res,400,{error:'enrollment_not_owned'});
      const r=await pool.query(`INSERT INTO emp_course_proofs (enrollment_id, employee_id, file_name, file_url, storage_key, proof_type, status, expiry_date, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,'pendente',$7,$8,$9,$10) RETURNING *`,[b.enrollment_id,b.employee_id,b.file_name||null,b.file_url,b.storage_key||null,b.proof_type||'certificado',b.expiry_date||null,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'emp_course_proof_upload', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ enrollment_id:b.enrollment_id } });
      return json(res,201,{ proof:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['pendente','em_analise','aprovado','rejeitado','arquivado','cancelado'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      const upd=await pool.query(`UPDATE emp_course_proofs SET status=COALESCE($2,status), reviewed_by=CASE WHEN $2 IN ('aprovado','rejeitado','em_analise') THEN $3 ELSE reviewed_by END, reviewed_by_id=CASE WHEN $2 IN ('aprovado','rejeitado','em_analise') THEN $3 ELSE reviewed_by_id END, reviewed_at=CASE WHEN $2 IN ('aprovado','rejeitado','em_analise') THEN NOW() ELSE reviewed_at END, rejection_reason=COALESCE($4,rejection_reason), expiry_date=COALESCE($5,expiry_date), notes=COALESCE($6,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,sess.identityId||sess.id,b.rejection_reason||null,b.expiry_date||null,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ proof:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleCourseAlerts(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const status=url.searchParams.get('status');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`employee_id=$${i++}`); params.push(employee_id); }
      if(status){ where.push(`status=$${i++}`); params.push(status); }
      const sql=`SELECT ca.*, e.display_name as employee_name, tc.name as training_name FROM emp_course_expiry_alerts ca LEFT JOIN hr_employees e ON e.id=ca.employee_id LEFT JOIN hr_training_catalog tc ON tc.id=ca.training_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY ca.alert_date ASC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ alerts:r.rows, note:'EMP-14 alertas vencimento' });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['pendente','enviado','confirmado','cancelado'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      const upd=await pool.query(`UPDATE emp_course_expiry_alerts SET status=COALESCE($2,status), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ alert:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  // EMP-15 comunicados
  async function handleCommunications(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const category=url.searchParams.get('category'); const status=url.searchParams.get('status'); const target_type=url.searchParams.get('target_type');
      const where=[]; const params=[]; let i=1;
      if(category){ where.push(`category=$${i++}`); params.push(category); }
      if(status){ where.push(`status=$${i++}`); params.push(status); }
      if(target_type){ where.push(`target_type=$${i++}`); params.push(target_type); }
      const sql=`SELECT * FROM emp_communications ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ communications:r.rows, note:'EMP-15 comunicados direcionados confirmação leitura central notificações' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!b.title || b.title.length<5) return json(res,400,{error:'invalid_title'});
      if(!b.content || b.content.length<20) return json(res,400,{error:'content_required_min20'});
      const r=await pool.query(`INSERT INTO emp_communications (title, content, category, status, target_type, target_employee_id, target_group, is_directed, is_active, created_by, created_by_id) VALUES ($1,$2,$3,'rascunho',$4,$5,$6,$7,true,$8,$9) RETURNING *`,[b.title,b.content,b.category||'geral',b.target_type||'todos',b.target_employee_id||null,b.target_group||null,b.is_directed===true||b.target_type!=='todos',sess.identityId||sess.id,sess.identityId||sess.id]);
      return json(res,201,{ communication:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['rascunho','publicado','arquivado','cancelado','em_revisao'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      const upd=await pool.query(`UPDATE emp_communications SET status=COALESCE($2,status), content=COALESCE($3,content), is_active=COALESCE($4,is_active), published_at=CASE WHEN $2='publicado' THEN NOW() ELSE published_at END, published_by=CASE WHEN $2='publicado' THEN $5 ELSE published_by END, published_by_id=CASE WHEN $2='publicado' THEN $5 ELSE published_by_id END, updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.content||null,b.is_active,sess.identityId||sess.id]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      if(b.status==='publicado'){
        await auditLog({ action:'emp_communication_publish', actor:sess.identityId||sess.id, target:b.id, meta:{ title:upd.rows[0].title, target_type:upd.rows[0].target_type } });
        // criar notificações para alvos
        if(upd.rows[0].target_type==='todos'){
          const emps=await pool.query(`SELECT id FROM hr_employees WHERE status='ativo' LIMIT 200`);
          for(const emp of emps.rows){
            await pool.query(`INSERT INTO emp_notifications_center (employee_id, communication_id, type, title, message, is_read, is_directed) VALUES ($1,$2,'comunicado',$3,$4,false,$5)`,[emp.id,upd.rows[0].id,upd.rows[0].title,upd.rows[0].content.slice(0,500),upd.rows[0].is_directed]);
          }
        } else if(upd.rows[0].target_employee_id){
          await pool.query(`INSERT INTO emp_notifications_center (employee_id, communication_id, type, title, message, is_read, is_directed) VALUES ($1,$2,'comunicado',$3,$4,false,true)`,[upd.rows[0].target_employee_id,upd.rows[0].id,upd.rows[0].title,upd.rows[0].content.slice(0,500)]);
        }
      }
      return json(res,200,{ communication:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleCommunicationReads(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const communication_id=url.searchParams.get('communication_id'); const employee_id=url.searchParams.get('employee_id');
      const where=[]; const params=[]; let i=1;
      if(communication_id){ where.push(`communication_id=$${i++}`); params.push(communication_id); }
      if(employee_id){ where.push(`employee_id=$${i++}`); params.push(employee_id); }
      const sql=`SELECT cr.*, e.display_name as employee_name, c.title as comm_title FROM emp_communication_reads cr LEFT JOIN hr_employees e ON e.id=cr.employee_id LEFT JOIN emp_communications c ON c.id=cr.communication_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY cr.read_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ reads:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.communication_id)) return json(res,400,{error:'invalid_communication_id'});
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      try{
        const r=await pool.query(`INSERT INTO emp_communication_reads (communication_id, employee_id, confirmed, confirmed_at, ip_hash, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,[b.communication_id,b.employee_id,b.confirmed===true,b.confirmed?new Date().toISOString():null,hashValue(b.ip||''),b.notes||null]);
        await auditLog({ action:'emp_communication_read', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ communication_id:b.communication_id, employee_id:b.employee_id, confirmed:b.confirmed } });
        // marcar notificação como lida
        await pool.query(`UPDATE emp_notifications_center SET is_read=true, read_at=NOW(), updated_at=NOW() WHERE communication_id=$1 AND employee_id=$2`,[b.communication_id,b.employee_id]);
        return json(res,201,{ read:r.rows[0] });
      }catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_read'}); throw e; }
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleNotificationsCenter(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const is_read=url.searchParams.get('is_read');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`employee_id=$${i++}`); params.push(employee_id); }
      if(is_read!==null && is_read!==undefined){ where.push(`is_read=$${i++}`); params.push(is_read==='true'); }
      const sql=`SELECT nc.*, e.display_name as employee_name FROM emp_notifications_center nc LEFT JOIN hr_employees e ON e.id=nc.employee_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY nc.created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ notifications:r.rows, note:'EMP-15 central notificações' });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const upd=await pool.query(`UPDATE emp_notifications_center SET is_read=COALESCE($2,is_read), read_at=CASE WHEN $2=true THEN NOW() ELSE read_at END, updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.is_read]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ notification:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  // EMP-16 atendimento RH
  async function handleHrTickets(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const status=url.searchParams.get('status'); const category=url.searchParams.get('category');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`employee_id=$${i++}`); params.push(employee_id); }
      if(status){ where.push(`status=$${i++}`); params.push(status); }
      if(category){ where.push(`category=$${i++}`); params.push(category); }
      const sql=`SELECT t.*, e.display_name as employee_name FROM emp_hr_tickets t LEFT JOIN hr_employees e ON e.id=t.employee_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY t.created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ tickets:r.rows, note:'EMP-16 atendimento RH protocolo categoria mensagens privadas acompanhamento is_private true' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(!b.title || b.title.length<5) return json(res,400,{error:'invalid_title'});
      if(!b.description || b.description.length<10) return json(res,400,{error:'invalid_description'});
      const protocol=genProtocol('RH');
      const r=await pool.query(`INSERT INTO emp_hr_tickets (protocol, employee_id, category, priority, title, description, status, responsible_id, responsible_name, due_date, is_private, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,'aberto',$7,$8,$9,true,$10,$11) RETURNING *`,[protocol,b.employee_id,b.category||'rh',b.priority||'media',b.title,b.description,b.responsible_id||null,b.responsible_name||null,b.due_date||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'emp_hr_ticket_create', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ protocol, category:b.category } });
      return json(res,201,{ ticket:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['aberto','em_atendimento','aguardando_colaborador','aguardando_rh','resolvido','encerrado','cancelado','pendente'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      const upd=await pool.query(`UPDATE emp_hr_tickets SET status=COALESCE($2,status), responsible_id=COALESCE($3,responsible_id), responsible_name=COALESCE($4,responsible_name), due_date=COALESCE($5,due_date), closed_at=CASE WHEN $2 IN ('resolvido','encerrado') THEN NOW() ELSE closed_at END, closed_by=CASE WHEN $2 IN ('resolvido','encerrado') THEN $6 ELSE closed_by END, updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.responsible_id||null,b.responsible_name||null,b.due_date||null,sess.identityId||sess.id]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ ticket:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleHrMessages(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const ticket_id=url.searchParams.get('ticket_id');
      if(!ticket_id) return json(res,400,{error:'ticket_id_required'});
      const r=await pool.query(`SELECT * FROM emp_hr_messages WHERE ticket_id=$1 ORDER BY created_at ASC LIMIT 300`,[ticket_id]);
      return json(res,200,{ messages:r.rows, note:'mensagens privadas is_private true' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.ticket_id)) return json(res,400,{error:'invalid_ticket_id'});
      if(!b.message || b.message.length<1) return json(res,400,{error:'invalid_message'});
      const r=await pool.query(`INSERT INTO emp_hr_messages (ticket_id, sender_id, sender_name, message, is_private, is_internal) VALUES ($1,$2,$3,$4,true,$5) RETURNING *`,[b.ticket_id,sess.identityId||sess.id,b.sender_name||'RH',b.message,b.is_internal===true]);
      return json(res,201,{ message:r.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleHrAttachments(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const ticket_id=url.searchParams.get('ticket_id');
      if(!ticket_id) return json(res,400,{error:'ticket_id_required'});
      const r=await pool.query(`SELECT * FROM emp_hr_attachments WHERE ticket_id=$1 ORDER BY created_at DESC LIMIT 100`,[ticket_id]);
      return json(res,200,{ attachments:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.ticket_id)) return json(res,400,{error:'invalid_ticket_id'});
      if(!b.file_name || !b.file_url) return json(res,400,{error:'file_required'});
      const r=await pool.query(`INSERT INTO emp_hr_attachments (ticket_id, message_id, file_name, file_url, storage_key, is_restricted, uploaded_by, uploaded_by_id) VALUES ($1,$2,$3,$4,$5,true,$6,$7) RETURNING *`,[b.ticket_id,b.message_id||null,b.file_name,b.file_url,b.storage_key||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      return json(res,201,{ attachment:r.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  // EMP-17 canal confidencial
  async function handleConfidentialPolicies(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const r=await pool.query(`SELECT * FROM emp_confidential_access_policies ORDER BY role LIMIT 100`);
      return json(res,200,{ policies:r.rows, note:'EMP-17 política acesso canal confidencial' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!b.role) return json(res,400,{error:'role_required'});
      const r=await pool.query(`INSERT INTO emp_confidential_access_policies (role, access_level, allowed_employee_ids, description, is_active, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[b.role,b.access_level||'leitura',b.allowed_employee_ids||null,b.description||null,b.is_active!==false,sess.identityId||sess.id,sess.identityId||sess.id]);
      return json(res,201,{ policy:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const upd=await pool.query(`UPDATE emp_confidential_access_policies SET is_active=COALESCE($2,is_active), access_level=COALESCE($3,access_level), description=COALESCE($4,description), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.is_active,b.access_level||null,b.description||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ policy:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleConfidentialReports(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const status=url.searchParams.get('status'); const category=url.searchParams.get('category'); const is_anonymous=url.searchParams.get('is_anonymous');
      const where=[]; const params=[]; let i=1;
      if(status){ where.push(`status=$${i++}`); params.push(status); }
      if(category){ where.push(`category=$${i++}`); params.push(category); }
      if(is_anonymous==='true'){ where.push(`is_anonymous=true`); }
      const sql=`SELECT cr.*, e.display_name as reporter_name FROM emp_confidential_reports cr LEFT JOIN hr_employees e ON e.id=cr.reporter_employee_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY cr.created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ reports:r.rows, note:'EMP-17 canal confidencial separado responsáveis política acesso anonimato somente se efetivamente suportado is_anonymous_supported' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!b.category) return json(res,400,{error:'category_required'});
      if(!b.title || b.title.length<5) return json(res,400,{error:'invalid_title'});
      if(!b.description || b.description.length<20) return json(res,400,{error:'description_required_min20'});
      if(b.is_anonymous===true && !b.is_anonymous_supported){
        // anonimato somente se efetivamente suportado
        return json(res,400,{error:'anonymous_only_if_supported'});
      }
      if(b.is_anonymous===true && b.reporter_employee_id){
        return json(res,400,{error:'anonymous_cannot_have_reporter_id'});
      }
      if(b.is_anonymous!==true && b.reporter_employee_id && !isUuid(b.reporter_employee_id)){
        return json(res,400,{error:'invalid_reporter_id'});
      }
      const protocol=genProtocol('CONF');
      const tokenHash=b.is_anonymous?hashValue(b.anonymous_token||protocol):null;
      const r=await pool.query(`INSERT INTO emp_confidential_reports (protocol, reporter_employee_id, is_anonymous, anonymous_token_hash, category, title, description, status, responsible_id, responsible_name, is_anonymous_supported, anonymous_supported_note, is_private, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,'recebido',$8,$9,$10,$11,true,$12,$13) RETURNING *`,[protocol,b.reporter_employee_id||null,b.is_anonymous===true,tokenHash,b.category,b.title,b.description,b.responsible_id||null,b.responsible_name||null,b.is_anonymous_supported===true,b.anonymous_supported_note||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'emp_confidential_report', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ protocol, category:b.category, is_anonymous:b.is_anonymous } });
      return json(res,201,{ report:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['recebido','em_analise','em_investigacao','resolvido','arquivado','cancelado','pendente','encerrado'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      const upd=await pool.query(`UPDATE emp_confidential_reports SET status=COALESCE($2,status), responsible_id=COALESCE($3,responsible_id), responsible_name=COALESCE($4,responsible_name), closed_at=CASE WHEN $2 IN ('resolvido','arquivado','encerrado') THEN NOW() ELSE closed_at END, closed_by=CASE WHEN $2 IN ('resolvido','arquivado','encerrado') THEN $5 ELSE closed_by END, updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.responsible_id||null,b.responsible_name||null,sess.identityId||sess.id]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ report:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleConfidentialMessages(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const report_id=url.searchParams.get('report_id');
      if(!report_id) return json(res,400,{error:'report_id_required'});
      const r=await pool.query(`SELECT * FROM emp_confidential_messages WHERE report_id=$1 ORDER BY created_at ASC LIMIT 200`,[report_id]);
      return json(res,200,{ messages:r.rows, note:'mensagens privadas canal confidencial is_private true' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.report_id)) return json(res,400,{error:'invalid_report_id'});
      if(!b.message || b.message.length<5) return json(res,400,{error:'invalid_message'});
      const rep=await pool.query(`SELECT id, is_anonymous_supported FROM emp_confidential_reports WHERE id=$1`,[b.report_id]);
      if(!rep.rows.length) return json(res,404,{error:'report_not_found'});
      if(b.is_anonymous===true && !rep.rows[0].is_anonymous_supported) return json(res,400,{error:'anonymous_only_if_supported'});
      const r=await pool.query(`INSERT INTO emp_confidential_messages (report_id, sender_id, sender_name, message, is_private, is_anonymous) VALUES ($1,$2,$3,$4,true,$5) RETURNING *`,[b.report_id,sess.identityId||sess.id,b.sender_name||'Compliance',b.message,b.is_anonymous===true]);
      return json(res,201,{ message:r.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  return {
    handleCourseEnrollments,
    handleCourseProofs,
    handleCourseAlerts,
    handleCommunications,
    handleCommunicationReads,
    handleNotificationsCenter,
    handleHrTickets,
    handleHrMessages,
    handleHrAttachments,
    handleConfidentialPolicies,
    handleConfidentialReports,
    handleConfidentialMessages,
  };
}
