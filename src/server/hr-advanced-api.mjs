export function createHrAdvancedApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  function json(res, status, body) { res.statusCode = status; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(body)); }
  async function readJson(req) { const chunks=[]; for await(const c of req) chunks.push(c); if(!chunks.length) return {}; try{ return JSON.parse(Buffer.concat(chunks).toString('utf8')); }catch{ return {}; } }
  async function checkAuth(req,res){ if(sameOrigin && !sameOrigin(req)){ json(res,403,{error:'forbidden_origin'}); return null; } const sess=await requireSession(req); if(!sess){ json(res,401,{error:'unauthorized'}); return null; } if(!requireRole(sess,['admin','ti','rh'])){ json(res,403,{error:'forbidden_role'}); return null; } return sess; }
  function isUuid(v){ return typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); }
  function validComp(c){ return typeof c==='string' && /^\d{4}-\d{2}$/.test(c); }
  function genProtocol(){ const d=new Date(); const rnd=Math.random().toString(36).slice(2,6).toUpperCase(); return `HR${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${rnd}`; }

  // HR-21 sources
  async function handlePayrollSources(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const r=await pool.query(`SELECT * FROM hr_payroll_sources ORDER BY name LIMIT 200`);
      return json(res,200,{ sources:r.rows, note:'HR-21 fontes autorizadas' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!b.name || b.name.length<3) return json(res,400,{error:'invalid_name'});
      try{
        const r=await pool.query(`INSERT INTO hr_payroll_sources (name, type, contact_name, contact_email, is_authorized, description, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[b.name,b.type||'folha',b.contact_name||null,b.contact_email||null,b.is_authorized!==false,b.description||null,sess.identityId||sess.id,sess.identityId||sess.id]);
        await auditLog({ action:'hr_payroll_source_create', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ name:b.name } });
        return json(res,201,{ source:r.rows[0] });
      }catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_source'}); throw e; }
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const upd=await pool.query(`UPDATE hr_payroll_sources SET is_authorized=COALESCE($2,is_authorized), contact_name=COALESCE($3,contact_name), description=COALESCE($4,description), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.is_authorized,b.contact_name||null,b.description||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ source:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handlePayrollImports(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const source_id=url.searchParams.get('source_id'); const competence=url.searchParams.get('competence');
      const where=[]; const params=[]; let i=1;
      if(source_id){ where.push(`source_id=$${i++}`); params.push(source_id); }
      if(competence){ where.push(`competence=$${i++}`); params.push(competence); }
      const sql=`SELECT pi.*, ps.name as source_name FROM hr_payroll_imports pi LEFT JOIN hr_payroll_sources ps ON ps.id=pi.source_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY pi.created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ imports:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.source_id)) return json(res,400,{error:'invalid_source_id'});
      if(!validComp(b.competence)) return json(res,400,{error:'invalid_competence'});
      const src=await pool.query(`SELECT id, is_authorized FROM hr_payroll_sources WHERE id=$1`,[b.source_id]);
      if(!src.rows.length) return json(res,404,{error:'source_not_found'});
      if(!src.rows[0].is_authorized) return json(res,409,{error:'source_not_authorized'});
      const r=await pool.query(`INSERT INTO hr_payroll_imports (source_id, competence, file_name, file_url, storage_key, status, total_records, imported_by, imported_by_id, imported_at) VALUES ($1,$2,$3,$4,$5,'pendente',$6,$7,$8,NOW()) RETURNING *`,[b.source_id,b.competence,b.file_name||null,b.file_url||null,b.storage_key||null,b.total_records||0,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'hr_payroll_import_create', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ competence:b.competence, source_id:b.source_id } });
      return json(res,201,{ import:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const upd=await pool.query(`UPDATE hr_payroll_imports SET status=COALESCE($2,status), processed_records=COALESCE($3,processed_records), error_count=COALESCE($4,error_count), errors=COALESCE($5,errors), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.processed_records,b.error_count,b.errors?JSON.stringify(b.errors):null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ import:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handlePayrollDocuments(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const competence=url.searchParams.get('competence'); const doc_type=url.searchParams.get('doc_type');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`pd.employee_id=$${i++}`); params.push(employee_id); }
      if(competence){ where.push(`pd.competence=$${i++}`); params.push(competence); }
      if(doc_type){ where.push(`pd.doc_type=$${i++}`); params.push(doc_type); }
      const sql=`SELECT pd.*, e.display_name as employee_name, ps.name as source_name FROM hr_payroll_documents pd LEFT JOIN hr_employees e ON e.id=pd.employee_id LEFT JOIN hr_payroll_sources ps ON ps.id=pd.source_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY pd.competence DESC, pd.created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ documents:r.rows, note:'HR-21 vinculação inequívoca colaborador revisão antes publicar correção rastreada' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(!isUuid(b.source_id)) return json(res,400,{error:'invalid_source_id'});
      if(!validComp(b.competence)) return json(res,400,{error:'invalid_competence'});
      if(!b.doc_type) return json(res,400,{error:'doc_type_required'});
      if(!b.title || b.title.length<3) return json(res,400,{error:'invalid_title'});
      if(!b.file_url) return json(res,400,{error:'file_url_required'});
      const emp=await pool.query(`SELECT id FROM hr_employees WHERE id=$1`,[b.employee_id]);
      if(!emp.rows.length) return json(res,404,{error:'employee_not_found'});
      const src=await pool.query(`SELECT id, is_authorized FROM hr_payroll_sources WHERE id=$1`,[b.source_id]);
      if(!src.rows.length) return json(res,404,{error:'source_not_found'});
      if(!src.rows[0].is_authorized) return json(res,409,{error:'source_not_authorized'});
      const maxV=await pool.query(`SELECT COALESCE(MAX(version),0) as max FROM hr_payroll_documents WHERE employee_id=$1 AND doc_type=$2 AND competence=$3`,[b.employee_id,b.doc_type,b.competence]);
      const version=(maxV.rows[0].max||0)+1;
      const r=await pool.query(`INSERT INTO hr_payroll_documents (import_id, source_id, employee_id, competence, doc_type, title, file_url, storage_key, status, version, is_restricted, is_published, correction_of_id, is_correction, correction_reason, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'rascunho',$9,true,false,$10,$11,$12,$13,$14,$15) RETURNING *`,[b.import_id||null,b.source_id,b.employee_id,b.competence,b.doc_type,b.title,b.file_url,b.storage_key||null,version,b.correction_of_id||null,b.is_correction===true,b.correction_reason||null,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'hr_payroll_doc_publish', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ employee_id:b.employee_id, competence:b.competence, doc_type:b.doc_type, version } });
      return json(res,201,{ document:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['rascunho','em_revisao','aprovado','publicado','arquivado','rejeitado','corrigido','pendente'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      if(b.status==='rejeitado' && (!b.rejection_reason||b.rejection_reason.length<5)) return json(res,400,{error:'rejection_reason_required'});
      if(b.status==='publicado'){
        // revisão antes de publicar
        const cur=await pool.query(`SELECT status, reviewed_by_id FROM hr_payroll_documents WHERE id=$1`,[b.id]);
        if(!cur.rows.length) return json(res,404,{error:'not_found'});
        // deve ter sido revisado ou aprovado antes? Forçar que reviewed_by ou aprovado
        // aqui permitimos publicar apenas se status anterior aprovado ou em_revisao com reviewed_by
        // se ainda rascunho, exige aprovação
        if(cur.rows[0].status==='rascunho') return json(res,400,{error:'review_required_before_publish'});
      }
      if(b.is_correction===true && (!b.correction_reason||b.correction_reason.length<10)) return json(res,400,{error:'correction_reason_required'});
      const upd=await pool.query(`UPDATE hr_payroll_documents SET status=COALESCE($2,status), is_published=CASE WHEN $2='publicado' THEN true ELSE is_published END, published_at=CASE WHEN $2='publicado' THEN NOW() ELSE published_at END, reviewed_by=CASE WHEN $2='em_revisao' THEN $3 ELSE reviewed_by END, reviewed_by_id=CASE WHEN $2='em_revisao' THEN $3 ELSE reviewed_by_id END, reviewed_at=CASE WHEN $2='em_revisao' THEN NOW() ELSE reviewed_at END, approved_by=CASE WHEN $2='aprovado' THEN $3 ELSE approved_by END, approved_by_id=CASE WHEN $2='aprovado' THEN $3 ELSE approved_by_id END, approved_at=CASE WHEN $2='aprovado' THEN NOW() ELSE approved_at END, rejection_reason=COALESCE($4,rejection_reason), is_correction=COALESCE($5,is_correction), correction_reason=COALESCE($6,correction_reason), notes=COALESCE($7,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,sess.identityId||sess.id,b.rejection_reason||null,b.is_correction,b.correction_reason||null,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      if(b.is_correction) await auditLog({ action:'hr_payroll_doc_correct', actor:sess.identityId||sess.id, target:b.id, meta:{ correction_reason:b.correction_reason } });
      return json(res,200,{ document:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  // HR-22 evaluations
  async function handleEvaluationCriteria(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const r=await pool.query(`SELECT * FROM hr_evaluation_criteria_catalog ORDER BY name LIMIT 200`);
      return json(res,200,{ criteria:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!b.name || b.name.length<3) return json(res,400,{error:'invalid_name'});
      try{
        const r=await pool.query(`INSERT INTO hr_evaluation_criteria_catalog (name, description, weight, is_active) VALUES ($1,$2,$3,$4) RETURNING *`,[b.name,b.description||null,b.weight||1,b.is_active!==false]);
        return json(res,201,{ criterion:r.rows[0] });
      }catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_criterion'}); throw e; }
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleEvaluations(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const status=url.searchParams.get('status');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`employee_id=$${i++}`); params.push(employee_id); }
      if(status){ where.push(`status=$${i++}`); params.push(status); }
      const sql=`SELECT e.*, emp.display_name as employee_name FROM hr_evaluations e LEFT JOIN hr_employees emp ON emp.id=e.employee_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY e.created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ evaluations:r.rows, note:'HR-22 acesso privado participação humana feedback cliente não punição automática' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(!b.evaluator_name || b.evaluator_name.length<3) return json(res,400,{error:'invalid_evaluator_name'});
      if(b.is_human_participation===false) return json(res,400,{error:'human_participation_required'});
      if(b.is_auto_punishment===true) return json(res,400,{error:'auto_punishment_not_allowed'});
      const emp=await pool.query(`SELECT id FROM hr_employees WHERE id=$1`,[b.employee_id]);
      if(!emp.rows.length) return json(res,404,{error:'employee_not_found'});
      const r=await pool.query(`INSERT INTO hr_evaluations (employee_id, evaluator_id, evaluator_name, evaluation_type, period_start, period_end, criteria, criteria_details, score, feedback, client_feedback_original, client_feedback_treated, is_human_participation, is_auto_punishment, is_private, status, evaluated_at, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,false,true,'rascunho',NOW(),$13,$14,$15) RETURNING *`,[b.employee_id,b.evaluator_id||null,b.evaluator_name,b.evaluation_type||'desempenho',b.period_start||null,b.period_end||null,b.criteria?JSON.stringify(b.criteria):null,b.criteria_details||null,b.score||null,b.feedback||null,b.client_feedback_original||null,b.client_feedback_treated||null,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'hr_evaluation_create', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ employee_id:b.employee_id } });
      return json(res,201,{ evaluation:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      if(b.is_auto_punishment===true) return json(res,400,{error:'auto_punishment_not_allowed'});
      const allowed=['rascunho','em_avaliacao','concluida','arquivada','cancelada','em_revisao','aprovada','rejeitada'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      const upd=await pool.query(`UPDATE hr_evaluations SET status=COALESCE($2,status), score=COALESCE($3,score), feedback=COALESCE($4,feedback), client_feedback_treated=COALESCE($5,client_feedback_treated), notes=COALESCE($6,notes), approved_by= CASE WHEN $2='aprovada' THEN $7 ELSE approved_by END, approved_by_id=CASE WHEN $2='aprovada' THEN $7 ELSE approved_by_id END, approved_at=CASE WHEN $2='aprovada' THEN NOW() ELSE approved_at END, rejection_reason=COALESCE($8,rejection_reason), evaluated_at=CASE WHEN $2='concluida' THEN NOW() ELSE evaluated_at END, updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.score,b.feedback||null,b.client_feedback_treated||null,b.notes||null,sess.identityId||sess.id,b.rejection_reason||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      if(b.status==='concluida') await auditLog({ action:'hr_evaluation_complete', actor:sess.identityId||sess.id, target:b.id, meta:{ score:b.score } });
      return json(res,200,{ evaluation:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleDevPlans(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id');
      const where=employee_id?`WHERE dp.employee_id=$1`:''; const params=employee_id?[employee_id]:[];
      const r=await pool.query(`SELECT dp.*, e.display_name as employee_name, ev.evaluation_type FROM hr_development_plans dp LEFT JOIN hr_employees e ON e.id=dp.employee_id LEFT JOIN hr_evaluations ev ON ev.id=dp.evaluation_id ${where} ORDER BY dp.created_at DESC LIMIT 200`,params);
      return json(res,200,{ plans:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(!b.title || b.title.length<3) return json(res,400,{error:'invalid_title'});
      const r=await pool.query(`INSERT INTO hr_development_plans (employee_id, evaluation_id, title, description, goal, start_date, end_date, status, responsible_id, responsible_name, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,'rascunho',$8,$9,$10,$11) RETURNING *`,[b.employee_id,b.evaluation_id||null,b.title,b.description||null,b.goal||null,b.start_date||null,b.end_date||null,b.responsible_id||null,b.responsible_name||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'hr_dev_plan_create', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ employee_id:b.employee_id } });
      return json(res,201,{ plan:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const upd=await pool.query(`UPDATE hr_development_plans SET status=COALESCE($2,status), description=COALESCE($3,description), goal=COALESCE($4,goal), responsible_name=COALESCE($5,responsible_name), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.description||null,b.goal||null,b.responsible_name||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ plan:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleDevActions(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const plan_id=url.searchParams.get('plan_id');
      const where=plan_id?`WHERE plan_id=$1`:''; const params=plan_id?[plan_id]:[];
      const r=await pool.query(`SELECT * FROM hr_development_actions ${where} ORDER BY due_date ASC LIMIT 200`,params);
      return json(res,200,{ actions:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.plan_id)) return json(res,400,{error:'invalid_plan_id'});
      if(!b.title || b.title.length<3) return json(res,400,{error:'invalid_title'});
      const r=await pool.query(`INSERT INTO hr_development_actions (plan_id, title, description, due_date, status, evidence_url, responsible_name, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,'pendente',$5,$6,$7,$8,$9) RETURNING *`,[b.plan_id,b.title,b.description||null,b.due_date||null,b.evidence_url||null,b.responsible_name||null,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      return json(res,201,{ action:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const upd=await pool.query(`UPDATE hr_development_actions SET status=COALESCE($2,status), evidence_url=COALESCE($3,evidence_url), notes=COALESCE($4,notes), completed_at=CASE WHEN $2='concluido' THEN NOW() ELSE completed_at END, updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.evidence_url||null,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ action:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  // HR-23 support
  async function handleSupportTickets(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const status=url.searchParams.get('status'); const category=url.searchParams.get('category');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`employee_id=$${i++}`); params.push(employee_id); }
      if(status){ where.push(`status=$${i++}`); params.push(status); }
      if(category){ where.push(`category=$${i++}`); params.push(category); }
      const sql=`SELECT t.*, e.display_name as employee_name FROM hr_support_tickets t LEFT JOIN hr_employees e ON e.id=t.employee_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY t.created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ tickets:r.rows, note:'HR-23 fila responsável categoria prazo mensagens anexos saúde fora tickets genéricos' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(!b.title || b.title.length<5) return json(res,400,{error:'invalid_title'});
      if(!b.description || b.description.length<10) return json(res,400,{error:'invalid_description'});
      const protocol=genProtocol();
      const r=await pool.query(`INSERT INTO hr_support_tickets (protocol, employee_id, category, priority, title, description, status, responsible_id, responsible_name, due_date, is_health_related, is_health_attachment_blocked, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,'aberto',$7,$8,$9,$10,true,$11,$12) RETURNING *`,[protocol,b.employee_id,b.category||'rh',b.priority||'media',b.title,b.description,b.responsible_id||null,b.responsible_name||null,b.due_date||null,b.is_health_related===true,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'hr_support_ticket_create', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ protocol, category:b.category } });
      return json(res,201,{ ticket:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['aberto','em_atendimento','aguardando_colaborador','aguardando_rh','resolvido','encerrado','cancelado','pendente'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      const upd=await pool.query(`UPDATE hr_support_tickets SET status=COALESCE($2,status), responsible_id=COALESCE($3,responsible_id), responsible_name=COALESCE($4,responsible_name), due_date=COALESCE($5,due_date), closed_at=CASE WHEN $2 IN ('resolvido','encerrado') THEN NOW() ELSE closed_at END, closed_by=CASE WHEN $2 IN ('resolvido','encerrado') THEN $6 ELSE closed_by END, updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.responsible_id||null,b.responsible_name||null,b.due_date||null,sess.identityId||sess.id]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ ticket:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleSupportMessages(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const ticket_id=url.searchParams.get('ticket_id');
      if(!ticket_id) return json(res,400,{error:'ticket_id_required'});
      const r=await pool.query(`SELECT m.*, t.is_health_related FROM hr_support_messages m LEFT JOIN hr_support_tickets t ON t.id=m.ticket_id WHERE m.ticket_id=$1 ORDER BY m.created_at ASC LIMIT 500`,[ticket_id]);
      return json(res,200,{ messages:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.ticket_id)) return json(res,400,{error:'invalid_ticket_id'});
      if(!b.message || b.message.length<1) return json(res,400,{error:'invalid_message'});
      const t=await pool.query(`SELECT id, is_health_related FROM hr_support_tickets WHERE id=$1`,[b.ticket_id]);
      if(!t.rows.length) return json(res,404,{error:'ticket_not_found'});
      if(b.is_health_restricted===true && !t.rows[0].is_health_related) return json(res,400,{error:'health_attachment_only_in_health_tickets'});
      const r=await pool.query(`INSERT INTO hr_support_messages (ticket_id, sender_id, sender_name, message, is_internal, is_health_restricted) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,[b.ticket_id,sess.identityId||sess.id,b.sender_name||'RH',b.message,b.is_internal===true,b.is_health_restricted===true]);
      await auditLog({ action:'hr_support_message_create', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ ticket_id:b.ticket_id } });
      return json(res,201,{ message:r.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleSupportAttachments(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const ticket_id=url.searchParams.get('ticket_id');
      if(!ticket_id) return json(res,400,{error:'ticket_id_required'});
      const r=await pool.query(`SELECT * FROM hr_support_attachments WHERE ticket_id=$1 ORDER BY created_at DESC LIMIT 200`,[ticket_id]);
      return json(res,200,{ attachments:r.rows, note:'HR-23 anexos saúde fora tickets genéricos - is_health_restricted true indica canal restrito' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.ticket_id)) return json(res,400,{error:'invalid_ticket_id'});
      if(!b.file_name || !b.file_url) return json(res,400,{error:'file_required'});
      const t=await pool.query(`SELECT id, is_health_related FROM hr_support_tickets WHERE id=$1`,[b.ticket_id]);
      if(!t.rows.length) return json(res,404,{error:'ticket_not_found'});
      if(b.is_health_restricted===true && !t.rows[0].is_health_related) return json(res,400,{error:'health_attachment_only_in_health_tickets'});
      if(b.is_medical===true && !b.is_health_restricted) return json(res,400,{error:'medical_attachment_must_be_health_restricted'});
      const r=await pool.query(`INSERT INTO hr_support_attachments (ticket_id, message_id, file_name, file_url, storage_key, is_health_restricted, is_medical, uploaded_by, uploaded_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[b.ticket_id,b.message_id||null,b.file_name,b.file_url,b.storage_key||null,b.is_health_restricted===true,b.is_medical===true,sess.identityId||sess.id,sess.identityId||sess.id]);
      return json(res,201,{ attachment:r.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  // HR-24 indicators
  async function handleIndicatorDefinitions(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const r=await pool.query(`SELECT * FROM hr_indicator_definitions ORDER BY type, name LIMIT 200`);
      return json(res,200,{ definitions:r.rows, note:'HR-24 fórmula período explícitos' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!b.type) return json(res,400,{error:'type_required'});
      if(!b.name || b.name.length<3) return json(res,400,{error:'invalid_name'});
      if(!b.formula || b.formula.length<10) return json(res,400,{error:'invalid_formula'});
      try{
        const r=await pool.query(`INSERT INTO hr_indicator_definitions (type, name, formula, description, source, unit, is_active, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[b.type,b.name,b.formula,b.description||null,b.source||null,b.unit||null,b.is_active!==false,sess.identityId||sess.id,sess.identityId||sess.id]);
        return json(res,201,{ definition:r.rows[0] });
      }catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_definition'}); throw e; }
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const upd=await pool.query(`UPDATE hr_indicator_definitions SET formula=COALESCE($2,formula), description=COALESCE($3,description), source=COALESCE($4,source), is_active=COALESCE($5,is_active), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.formula||null,b.description||null,b.source||null,b.is_active]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ definition:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleIndicatorSnapshots(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const definition_id=url.searchParams.get('definition_id'); const competence=url.searchParams.get('competence');
      const where=[]; const params=[]; let i=1;
      if(definition_id){ where.push(`s.definition_id=$${i++}`); params.push(definition_id); }
      if(competence){ where.push(`s.competence=$${i++}`); params.push(competence); }
      const sql=`SELECT s.*, d.name as definition_name, d.type as definition_type, d.unit FROM hr_indicator_snapshots s LEFT JOIN hr_indicator_definitions d ON d.id=s.definition_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY s.period_start DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ snapshots:r.rows, note:'HR-24 período explícito fórmula explícita' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.definition_id)) return json(res,400,{error:'invalid_definition_id'});
      if(!b.period_start || !b.period_end) return json(res,400,{error:'period_required'});
      if(b.value===undefined || b.value===null) return json(res,400,{error:'value_required'});
      if(!b.formula_used || b.formula_used.length<10) return json(res,400,{error:'formula_used_required'});
      if(b.competence && !validComp(b.competence)) return json(res,400,{error:'invalid_competence'});
      try{
        const r=await pool.query(`INSERT INTO hr_indicator_snapshots (definition_id, period_start, period_end, competence, value, formula_used, source, is_estimate, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[b.definition_id,b.period_start,b.period_end,b.competence||null,b.value,b.formula_used,b.source||null,b.is_estimate===true,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
        await auditLog({ action:'hr_indicator_snapshot_create', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ definition_id:b.definition_id, competence:b.competence, value:b.value } });
        return json(res,201,{ snapshot:r.rows[0] });
      }catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_snapshot'}); throw e; }
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  return {
    handlePayrollSources,
    handlePayrollImports,
    handlePayrollDocuments,
    handleEvaluationCriteria,
    handleEvaluations,
    handleDevPlans,
    handleDevActions,
    handleSupportTickets,
    handleSupportMessages,
    handleSupportAttachments,
    handleIndicatorDefinitions,
    handleIndicatorSnapshots,
  };
}
