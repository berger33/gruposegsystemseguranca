export function createHrTrainingApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  function json(res, status, body) { res.statusCode = status; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(body)); }
  async function readJson(req) { const chunks=[]; for await(const c of req) chunks.push(c); if(!chunks.length) return {}; try{ return JSON.parse(Buffer.concat(chunks).toString('utf8')); }catch{ return {}; } }
  async function checkAuth(req,res){ if(sameOrigin && !sameOrigin(req)){ json(res,403,{error:'forbidden_origin'}); return null; } const sess=await requireSession(req); if(!sess){ json(res,401,{error:'unauthorized'}); return null; } if(!requireRole(sess,['admin','ti','rh'])){ json(res,403,{error:'forbidden_role'}); return null; } return sess; }
  function isUuid(v){ return typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); }
  function validComp(c){ return typeof c==='string' && /^\d{4}-\d{2}$/.test(c); }

  async function handleTrainingCatalog(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const cargo=url.searchParams.get('cargo'); const type=url.searchParams.get('type'); const status=url.searchParams.get('status');
      const where=[]; const params=[]; let i=1;
      if(cargo){ where.push(`cargo_aplicavel=$${i++}`); params.push(cargo); }
      if(type){ where.push(`type=$${i++}`); params.push(type); }
      if(status){ where.push(`approval_status=$${i++}`); params.push(status); }
      const sql=`SELECT * FROM hr_training_catalog ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY name, version DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ trainings:r.rows, note:'HR-17 treinamento por cargo/atividade obrigatoriedade validade' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!b.name || b.name.length<3) return json(res,400,{error:'invalid_name'});
      if(!b.type) return json(res,400,{error:'type_required'});
      const maxV=await pool.query(`SELECT COALESCE(MAX(version),0) as max FROM hr_training_catalog WHERE name=$1`,[b.name]);
      const version=(maxV.rows[0].max||0)+1;
      const r=await pool.query(
        `INSERT INTO hr_training_catalog (name, type, description, cargo_aplicavel, atividade, carga_horaria, validity_days, is_required, provider_name, provider_contact, version, approval_status, created_by, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'rascunho',$12,$13) RETURNING *`,
        [b.name,b.type,b.description||null,b.cargo_aplicavel||b.cargo||null,b.atividade||null,b.carga_horaria||null,b.validity_days||null,b.is_required===true,b.provider_name||null,b.provider_contact||null,version,sess.identityId||sess.id,sess.identityId||sess.id]
      );
      await auditLog({ action:'hr_training_create', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ name:b.name, version } });
      return json(res,201,{ training:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['rascunho','em_revisao','aprovado','arquivado','rejeitado'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      if(b.status==='rejeitado' && (!b.rejection_reason||b.rejection_reason.length<5)) return json(res,400,{error:'rejection_reason_required'});
      const upd=await pool.query(`UPDATE hr_training_catalog SET approval_status=COALESCE($2,approval_status), approved_by=CASE WHEN $2='aprovado' THEN $3 ELSE approved_by END, approved_at=CASE WHEN $2='aprovado' THEN NOW() ELSE approved_at END, rejection_reason=COALESCE($4,rejection_reason), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,sess.identityId||sess.id,b.rejection_reason||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ training:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleTrainingRequirements(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const cargo=url.searchParams.get('cargo');
      const where=cargo?`WHERE cargo=$1`:''; const params=cargo?[cargo]:[];
      const r=await pool.query(`SELECT tr.*, tc.name as training_name, tc.type as training_type FROM hr_training_requirements tr LEFT JOIN hr_training_catalog tc ON tc.id=tr.training_id ${where} ORDER BY tr.cargo LIMIT 200`,params);
      return json(res,200,{ requirements:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!b.cargo || !isUuid(b.training_id)) return json(res,400,{error:'cargo_and_training_id_required'});
      try{
        const r=await pool.query(`INSERT INTO hr_training_requirements (cargo, training_id, is_required, validity_days, description) VALUES ($1,$2,$3,$4,$5) RETURNING *`,[b.cargo,b.training_id,b.is_required!==false,b.validity_days||null,b.description||null]);
        return json(res,201,{ requirement:r.rows[0] });
      }catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_requirement'}); throw e; }
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleTrainingSessions(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const training_id=url.searchParams.get('training_id');
      const where=training_id?`WHERE training_id=$1`:''; const params=training_id?[training_id]:[];
      const r=await pool.query(`SELECT ts.*, tc.name as training_name FROM hr_training_sessions ts LEFT JOIN hr_training_catalog tc ON tc.id=ts.training_id ${where} ORDER BY ts.scheduled_date DESC LIMIT 200`,params);
      return json(res,200,{ sessions:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.training_id)) return json(res,400,{error:'invalid_training_id'});
      if(!b.title || b.title.length<3) return json(res,400,{error:'invalid_title'});
      if(!b.scheduled_date) return json(res,400,{error:'scheduled_date_required'});
      const r=await pool.query(`INSERT INTO hr_training_sessions (training_id, title, scheduled_date, scheduled_time, location, instructor_name, vagas, status, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[b.training_id,b.title,b.scheduled_date,b.scheduled_time||null,b.location||null,b.instructor_name||null,b.vagas||null,b.status||'rascunho',b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      return json(res,201,{ session:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const upd=await pool.query(`UPDATE hr_training_sessions SET status=COALESCE($2,status), location=COALESCE($3,location), instructor_name=COALESCE($4,instructor_name), notes=COALESCE($5,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.location||null,b.instructor_name||null,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ session:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleTrainingEnrollments(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const training_id=url.searchParams.get('training_id'); const status=url.searchParams.get('status');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`te.employee_id=$${i++}`); params.push(employee_id); }
      if(training_id){ where.push(`te.training_id=$${i++}`); params.push(training_id); }
      if(status){ where.push(`te.status=$${i++}`); params.push(status); }
      const sql=`SELECT te.*, e.display_name as employee_name, tc.name as training_name, ts.title as session_title FROM hr_training_enrollments te LEFT JOIN hr_employees e ON e.id=te.employee_id LEFT JOIN hr_training_catalog tc ON tc.id=te.training_id LEFT JOIN hr_training_sessions ts ON ts.id=te.session_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY te.created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ enrollments:r.rows, note:'HR-17 inscrição presença comprovante' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id) || !isUuid(b.training_id)) return json(res,400,{error:'invalid_employee_or_training'});
      const emp=await pool.query(`SELECT id FROM hr_employees WHERE id=$1`,[b.employee_id]);
      if(!emp.rows.length) return json(res,404,{error:'employee_not_found'});
      const tr=await pool.query(`SELECT id, approval_status FROM hr_training_catalog WHERE id=$1`,[b.training_id]);
      if(!tr.rows.length) return json(res,404,{error:'training_not_found'});
      if(tr.rows[0].approval_status!=='aprovado') return json(res,409,{error:'training_not_approved'});
      if(b.session_id && !isUuid(b.session_id)) return json(res,400,{error:'invalid_session_id'});
      const r=await pool.query(
        `INSERT INTO hr_training_enrollments (employee_id, training_id, session_id, enrollment_date, status, presence_percent, score, certificate_url, storage_key, is_certificate_valid, notes, created_by, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [b.employee_id,b.training_id,b.session_id||null,b.enrollment_date||new Date().toISOString().slice(0,10),b.status||'inscrito',b.presence_percent||null,b.score||null,b.certificate_url||null,b.storage_key||null,b.is_certificate_valid===true,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]
      );
      await auditLog({ action:'hr_training_enroll', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ employee_id:b.employee_id, training_id:b.training_id } });
      return json(res,201,{ enrollment:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['inscrito','em_andamento','concluido','reprovado','cancelado','pendente','em_analise','aprovado','rejeitado'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      if(b.status==='rejeitado' && (!b.rejection_reason||b.rejection_reason.length<5)) return json(res,400,{error:'rejection_reason_required'});
      const upd=await pool.query(
        `UPDATE hr_training_enrollments SET status=COALESCE($2,status), completion_date=COALESCE($3,completion_date), presence_percent=COALESCE($4,presence_percent), score=COALESCE($5,score), certificate_url=COALESCE($6,certificate_url), is_certificate_valid=COALESCE($7,is_certificate_valid), approved_by=CASE WHEN $2 IN ('concluido','aprovado') THEN $8 ELSE approved_by END, approved_at=CASE WHEN $2 IN ('concluido','aprovado') THEN NOW() ELSE approved_at END, rejection_reason=COALESCE($9,rejection_reason), notes=COALESCE($10,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,
        [b.id,b.status||null,b.completion_date||null,b.presence_percent||null,b.score||null,b.certificate_url||null,b.is_certificate_valid??null,sess.identityId||sess.id,b.rejection_reason||null,b.notes||null]
      );
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ enrollment:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  // HR-18
  async function handleCompetencyCatalog(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const type=url.searchParams.get('type'); const status=url.searchParams.get('status');
      const where=[]; const params=[]; let i=1;
      if(type){ where.push(`type=$${i++}`); params.push(type); }
      if(status){ where.push(`approval_status=$${i++}`); params.push(status); }
      const r=await pool.query(`SELECT * FROM hr_competency_catalog ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY name, version DESC LIMIT 200`,params);
      return json(res,200,{ competencies:r.rows, note:'HR-18 matriz competências integrada alocação sem decisão automática' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!b.name || b.name.length<3) return json(res,400,{error:'invalid_name'});
      if(!b.type) return json(res,400,{error:'type_required'});
      const maxV=await pool.query(`SELECT COALESCE(MAX(version),0) as max FROM hr_competency_catalog WHERE name=$1`,[b.name]);
      const version=(maxV.rows[0].max||0)+1;
      const r=await pool.query(`INSERT INTO hr_competency_catalog (name, type, description, level, validity_days, version, approval_status, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,'rascunho',$7,$8) RETURNING *`,[b.name,b.type,b.description||null,b.level||'basico',b.validity_days||null,version,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'hr_competency_create', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ name:b.name, version } });
      return json(res,201,{ competency:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['rascunho','em_revisao','aprovado','arquivado','rejeitado'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      if(b.status==='rejeitado' && (!b.rejection_reason||b.rejection_reason.length<5)) return json(res,400,{error:'rejection_reason_required'});
      const upd=await pool.query(`UPDATE hr_competency_catalog SET approval_status=COALESCE($2,approval_status), approved_by=CASE WHEN $2='aprovado' THEN $3 ELSE approved_by END, approved_at=CASE WHEN $2='aprovado' THEN NOW() ELSE approved_at END, rejection_reason=COALESCE($4,rejection_reason), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,sess.identityId||sess.id,b.rejection_reason||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ competency:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleCompetencyRequirements(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const cargo=url.searchParams.get('cargo');
      const where=cargo?`WHERE cr.cargo=$1`:''; const params=cargo?[cargo]:[];
      const r=await pool.query(`SELECT cr.*, cc.name as competency_name, cc.type as competency_type FROM hr_competency_requirements cr LEFT JOIN hr_competency_catalog cc ON cc.id=cr.competency_id ${where} ORDER BY cr.cargo LIMIT 200`,params);
      return json(res,200,{ requirements:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!b.cargo || !isUuid(b.competency_id)) return json(res,400,{error:'cargo_and_competency_required'});
      try{
        const r=await pool.query(`INSERT INTO hr_competency_requirements (cargo, competency_id, required_level, is_required, description) VALUES ($1,$2,$3,$4,$5) RETURNING *`,[b.cargo,b.competency_id,b.required_level||'basico',b.is_required!==false,b.description||null]);
        return json(res,201,{ requirement:r.rows[0] });
      }catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_requirement'}); throw e; }
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleEmployeeCompetencies(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const competency_id=url.searchParams.get('competency_id'); const status=url.searchParams.get('status');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`ec.employee_id=$${i++}`); params.push(employee_id); }
      if(competency_id){ where.push(`ec.competency_id=$${i++}`); params.push(competency_id); }
      if(status){ where.push(`ec.status=$${i++}`); params.push(status); }
      const sql=`SELECT ec.*, e.display_name as employee_name, cc.name as competency_name FROM hr_employee_competencies ec LEFT JOIN hr_employees e ON e.id=ec.employee_id LEFT JOIN hr_competency_catalog cc ON cc.id=ec.competency_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY ec.created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ employee_competencies:r.rows, note:'sem decisão automática contratação/punição' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id) || !isUuid(b.competency_id)) return json(res,400,{error:'invalid_employee_or_competency'});
      if(b.is_auto_decision===true) return json(res,400,{error:'auto_decision_not_allowed', detail:'HR-18 sem decisão automática contratação/punição'});
      const emp=await pool.query(`SELECT id FROM hr_employees WHERE id=$1`,[b.employee_id]);
      if(!emp.rows.length) return json(res,404,{error:'employee_not_found'});
      const comp=await pool.query(`SELECT id, approval_status FROM hr_competency_catalog WHERE id=$1`,[b.competency_id]);
      if(!comp.rows.length) return json(res,404,{error:'competency_not_found'});
      if(comp.rows[0].approval_status!=='aprovado') return json(res,409,{error:'competency_not_approved'});
      try{
        const r=await pool.query(
          `INSERT INTO hr_employee_competencies (employee_id, competency_id, level, acquired_date, expiry_date, status, proof_url, storage_key, evaluated_by, evaluated_by_name, evaluation_date, evaluation_notes, is_human_evaluation, is_auto_decision, created_by, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,false,$13,$14) RETURNING *`,
          [b.employee_id,b.competency_id,b.level||'basico',b.acquired_date||new Date().toISOString().slice(0,10),b.expiry_date||null,b.status||'ativo',b.proof_url||null,b.storage_key||null,sess.identityId||sess.id,b.evaluated_by_name||null,b.evaluation_date||null,b.evaluation_notes||null,sess.identityId||sess.id,sess.identityId||sess.id]
        );
        return json(res,201,{ employee_competency:r.rows[0] });
      }catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_active_competency'}); throw e; }
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      if(b.is_auto_decision===true) return json(res,400,{error:'auto_decision_not_allowed'});
      const upd=await pool.query(`UPDATE hr_employee_competencies SET level=COALESCE($2,level), status=COALESCE($3,status), expiry_date=COALESCE($4,expiry_date), proof_url=COALESCE($5,proof_url), evaluation_notes=COALESCE($6,evaluation_notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.level||null,b.status||null,b.expiry_date||null,b.proof_url||null,b.evaluation_notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ employee_competency:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleCompetencyEvaluations(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id');
      const where=employee_id?`WHERE employee_id=$1`:''; const params=employee_id?[employee_id]:[];
      const r=await pool.query(`SELECT ce.*, e.display_name as employee_name, cc.name as competency_name FROM hr_competency_evaluations ce LEFT JOIN hr_employees e ON e.id=ce.employee_id LEFT JOIN hr_competency_catalog cc ON cc.id=ce.competency_id ${where} ORDER BY ce.evaluation_date DESC LIMIT 200`,params);
      return json(res,200,{ evaluations:r.rows, note:'avaliação com participação humana feedback cliente não vira punição automática' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id) || !isUuid(b.competency_id)) return json(res,400,{error:'invalid_employee_or_competency'});
      if(!b.evaluator_name || b.evaluator_name.length<3) return json(res,400,{error:'evaluator_name_required'});
      if(!b.criteria || b.criteria.length<10) return json(res,400,{error:'criteria_min10'});
      if(b.is_human_participation===false) return json(res,400,{error:'human_participation_required'});
      if(b.is_auto_punishment===true) return json(res,400,{error:'auto_punishment_not_allowed', detail:'Feedback cliente não vira punição automática'});
      const r=await pool.query(
        `INSERT INTO hr_competency_evaluations (employee_id, competency_id, evaluated_level, evaluator_id, evaluator_name, evaluation_date, criteria, score, notes, is_human_participation, is_auto_punishment, status, created_by, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,false,$10,$11,$12) RETURNING *`,
        [b.employee_id,b.competency_id,b.evaluated_level||'basico',sess.identityId||sess.id,b.evaluator_name,b.evaluation_date||new Date().toISOString().slice(0,10),b.criteria,b.score||null,b.notes||null,b.status||'em_avaliacao',sess.identityId||sess.id,sess.identityId||sess.id]
      );
      await auditLog({ action:'hr_competency_evaluate', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ employee_id:b.employee_id, competency_id:b.competency_id, level:b.evaluated_level } });
      return json(res,201,{ evaluation:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const upd=await pool.query(`UPDATE hr_competency_evaluations SET status=COALESCE($2,status), score=COALESCE($3,score), notes=COALESCE($4,notes), approved_by=CASE WHEN $2='aprovado' THEN $5 ELSE approved_by END, approved_at=CASE WHEN $2='aprovado' THEN NOW() ELSE approved_at END, updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.score||null,b.notes||null,sess.identityId||sess.id]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ evaluation:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  // HR-19
  async function handleUniformCatalog(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const type=url.searchParams.get('type'); const status=url.searchParams.get('status');
      const where=[]; const params=[]; let i=1;
      if(type){ where.push(`type=$${i++}`); params.push(type); }
      if(status){ where.push(`approval_status=$${i++}`); params.push(status); }
      const r=await pool.query(`SELECT * FROM hr_uniform_catalog ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY name, version DESC LIMIT 200`,params);
      return json(res,200,{ uniforms:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!b.name || b.name.length<3) return json(res,400,{error:'invalid_name'});
      if(!b.type) return json(res,400,{error:'type_required'});
      const maxV=await pool.query(`SELECT COALESCE(MAX(version),0) as max FROM hr_uniform_catalog WHERE name=$1`,[b.name]);
      const version=(maxV.rows[0].max||0)+1;
      const r=await pool.query(`INSERT INTO hr_uniform_catalog (name, type, description, size, is_epi, ca_number, validity_days, provider_name, cost, version, approval_status, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'rascunho',$11,$12) RETURNING *`,[b.name,b.type,b.description||null,b.size||null,b.is_epi===true,b.ca_number||null,b.validity_days||null,b.provider_name||null,b.cost||0,version,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'hr_uniform_delivery', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ name:b.name, version } });
      return json(res,201,{ uniform:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['rascunho','em_revisao','aprovado','arquivado','rejeitado'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      if(b.status==='rejeitado' && (!b.rejection_reason||b.rejection_reason.length<5)) return json(res,400,{error:'rejection_reason_required'});
      const upd=await pool.query(`UPDATE hr_uniform_catalog SET approval_status=COALESCE($2,approval_status), approved_by=CASE WHEN $2='aprovado' THEN $3 ELSE approved_by END, approved_at=CASE WHEN $2='aprovado' THEN NOW() ELSE approved_at END, rejection_reason=COALESCE($4,rejection_reason), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,sess.identityId||sess.id,b.rejection_reason||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ uniform:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleUniformDeliveries(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const uniform_id=url.searchParams.get('uniform_id'); const status=url.searchParams.get('status');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`ud.employee_id=$${i++}`); params.push(employee_id); }
      if(uniform_id){ where.push(`ud.uniform_id=$${i++}`); params.push(uniform_id); }
      if(status){ where.push(`ud.status=$${i++}`); params.push(status); }
      const sql=`SELECT ud.*, e.display_name as employee_name, uc.name as uniform_name, uc.type as uniform_type FROM hr_uniform_deliveries ud LEFT JOIN hr_employees e ON e.id=ud.employee_id LEFT JOIN hr_uniform_catalog uc ON uc.id=ud.uniform_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY ud.delivery_date DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ deliveries:r.rows, note:'HR-19 uniformes/EPI entrega recibo validade controle devolução' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id) || !isUuid(b.uniform_id)) return json(res,400,{error:'invalid_employee_or_uniform'});
      if(!b.delivery_date) return json(res,400,{error:'delivery_date_required'});
      const emp=await pool.query(`SELECT id FROM hr_employees WHERE id=$1`,[b.employee_id]);
      if(!emp.rows.length) return json(res,404,{error:'employee_not_found'});
      const uni=await pool.query(`SELECT id, approval_status, version, validity_days FROM hr_uniform_catalog WHERE id=$1`,[b.uniform_id]);
      if(!uni.rows.length) return json(res,404,{error:'uniform_not_found'});
      if(uni.rows[0].approval_status!=='aprovado') return json(res,409,{error:'uniform_not_approved'});
      let validityEnd=b.validity_end||null;
      if(!validityEnd && uni.rows[0].validity_days){
        const d=new Date(b.delivery_date); d.setDate(d.getDate()+uni.rows[0].validity_days); validityEnd=d.toISOString().slice(0,10);
      }
      const r=await pool.query(
        `INSERT INTO hr_uniform_deliveries (employee_id, uniform_id, delivery_date, quantity, size, status, receipt_url, storage_key, receipt_signed, validity_start, validity_end, uniform_version, delivered_by, delivered_by_name, notes, created_by, created_by_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
        [b.employee_id,b.uniform_id,b.delivery_date,b.quantity||1,b.size||null,b.status||'entregue',b.receipt_url||null,b.storage_key||null,b.receipt_signed===true,b.validity_start||b.delivery_date,validityEnd,uni.rows[0].version,sess.identityId||sess.id,b.delivered_by_name||null,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]
      );
      await auditLog({ action:'hr_uniform_delivery', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ employee_id:b.employee_id, uniform_id:b.uniform_id } });
      return json(res,201,{ delivery:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const upd=await pool.query(`UPDATE hr_uniform_deliveries SET status=COALESCE($2,status), receipt_signed=COALESCE($3,receipt_signed), receipt_url=COALESCE($4,receipt_url), validity_end=COALESCE($5,validity_end), notes=COALESCE($6,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.receipt_signed??null,b.receipt_url||null,b.validity_end||null,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ delivery:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleUniformReturns(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id');
      const where=employee_id?`WHERE employee_id=$1`:''; const params=employee_id?[employee_id]:[];
      const r=await pool.query(`SELECT ur.*, e.display_name as employee_name FROM hr_uniform_returns ur LEFT JOIN hr_employees e ON e.id=ur.employee_id ${where} ORDER BY ur.return_date DESC LIMIT 200`,params);
      return json(res,200,{ returns:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.delivery_id) || !isUuid(b.employee_id) || !isUuid(b.uniform_id)) return json(res,400,{error:'delivery_employee_uniform_required'});
      if(!b.reason || b.reason.length<10) return json(res,400,{error:'reason_min10'});
      const del=await pool.query(`SELECT id FROM hr_uniform_deliveries WHERE id=$1`,[b.delivery_id]);
      if(!del.rows.length) return json(res,404,{error:'delivery_not_found'});
      const r=await pool.query(`INSERT INTO hr_uniform_returns (delivery_id, employee_id, uniform_id, return_date, reason, condition_description, status, received_by, received_by_name, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[b.delivery_id,b.employee_id,b.uniform_id,b.return_date||new Date().toISOString().slice(0,10),b.reason,b.condition_description||null,b.status||'devolvido',sess.identityId||sess.id,b.received_by_name||null,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      await pool.query(`UPDATE hr_uniform_deliveries SET status='devolvido', updated_at=NOW() WHERE id=$1`,[b.delivery_id]);
      await auditLog({ action:'hr_uniform_return', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ delivery_id:b.delivery_id, employee_id:b.employee_id } });
      return json(res,201,{ return: r.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleUniformRequests(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const status=url.searchParams.get('status');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`employee_id=$${i++}`); params.push(employee_id); }
      if(status){ where.push(`status=$${i++}`); params.push(status); }
      const sql=`SELECT ur.*, e.display_name as employee_name, uc.name as uniform_name FROM hr_uniform_requests ur LEFT JOIN hr_employees e ON e.id=ur.employee_id LEFT JOIN hr_uniform_catalog uc ON uc.id=ur.uniform_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY ur.created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ requests:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id) || !isUuid(b.uniform_id)) return json(res,400,{error:'invalid_employee_or_uniform'});
      if(!b.request_type) return json(res,400,{error:'request_type_required'});
      if(!b.reason || b.reason.length<10) return json(res,400,{error:'reason_min10'});
      const r=await pool.query(`INSERT INTO hr_uniform_requests (employee_id, uniform_id, request_type, reason, size, quantity, status, requested_date, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[b.employee_id,b.uniform_id,b.request_type,b.reason,b.size||null,b.quantity||1,b.status||'solicitado',b.requested_date||new Date().toISOString().slice(0,10),b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'hr_uniform_request', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ employee_id:b.employee_id, uniform_id:b.uniform_id, type:b.request_type } });
      return json(res,201,{ request:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      if(b.status==='rejeitado' && (!b.rejection_reason||b.rejection_reason.length<5)) return json(res,400,{error:'rejection_reason_required'});
      const upd=await pool.query(`UPDATE hr_uniform_requests SET status=COALESCE($2,status), approved_by=CASE WHEN $2 IN ('aprovado','entregue') THEN $3 ELSE approved_by END, approved_at=CASE WHEN $2 IN ('aprovado','entregue') THEN NOW() ELSE approved_at END, rejection_reason=COALESCE($4,rejection_reason), delivery_id=COALESCE($5,delivery_id), notes=COALESCE($6,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,sess.identityId||sess.id,b.rejection_reason||null,b.delivery_id&&isUuid(b.delivery_id)?b.delivery_id:null,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ request:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  // HR-20
  async function handleDpClosures(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const r=await pool.query(`SELECT * FROM hr_dp_closures ORDER BY competence DESC LIMIT 100`);
      return json(res,200,{ closures:r.rows, note:'HR-20 fechamento DP faltas férias variáveis documentos conferidos' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!validComp(b.competence)) return json(res,400,{error:'invalid_competence'});
      const action=b.action||'fechar';
      if(action==='fechar'){
        // verifica divergências: variáveis pendentes ou documentos pendentes
        const vars=await pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN status IN ('pendente','com_divergencia') THEN 1 ELSE 0 END) as diverg FROM hr_dp_variables WHERE competence=$1`,[b.competence]);
        const docs=await pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN status IN ('pendente','com_divergencia') THEN 1 ELSE 0 END) as diverg FROM hr_dp_documents WHERE closure_id IN (SELECT id FROM hr_dp_closures WHERE competence=$1)`,[b.competence]);
        const varDiv=parseInt(vars.rows[0].diverg||0,10); const docDiv=parseInt(docs.rows[0].diverg||0,10); const totalDiv=varDiv+docDiv;
        if(totalDiv>0) return json(res,409,{ error:'dp_has_divergences', divergences: totalDiv, detail: 'Fechamento DP com divergências, conferir variáveis e documentos' });
        const r=await pool.query(
          `INSERT INTO hr_dp_closures (competence, status, total_employees, total_faltas, total_ferias, total_variables, documents_conferidos, divergences_count, notes, created_by, created_by_id)
           VALUES ($1,'fechado',$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (competence) DO UPDATE SET status='fechado', total_employees=$2, total_faltas=$3, total_ferias=$4, total_variables=$5, documents_conferidos=$6, divergences_count=$7, notes=COALESCE($8, hr_dp_closures.notes), closed_by=$9, closed_at=NOW(), updated_at=NOW()
           RETURNING *`,
          [b.competence, b.total_employees||0, b.total_faltas||0, b.total_ferias||0, b.total_variables||0, b.documents_conferidos||0, totalDiv, b.notes||null, sess.identityId||sess.id, sess.identityId||sess.id]
        );
        await auditLog({ action:'hr_dp_closure', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ competence:b.competence, action:'fechar' } });
        return json(res,201,{ closure:r.rows[0] });
      } else if(action==='reabrir'){
        if(!b.reopen_reason || b.reopen_reason.length<10) return json(res,400,{error:'reopen_reason_min10'});
        const r=await pool.query(`UPDATE hr_dp_closures SET status='reaberto', reopened_by=$2, reopened_at=NOW(), reopen_reason=$3, updated_at=NOW() WHERE competence=$1 RETURNING *`,[b.competence, sess.identityId||sess.id, b.reopen_reason]);
        if(!r.rows.length) return json(res,404,{error:'closure_not_found'});
        await auditLog({ action:'hr_dp_closure', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ competence:b.competence, action:'reabrir', reason:b.reopen_reason } });
        return json(res,200,{ closure:r.rows[0] });
      } else if(action==='abrir'){
        const r=await pool.query(
          `INSERT INTO hr_dp_closures (competence, status, notes, created_by, created_by_id)
           VALUES ($1,'aberto',$2,$3,$4)
           ON CONFLICT (competence) DO UPDATE SET status='aberto', notes=COALESCE($2, hr_dp_closures.notes), updated_at=NOW()
           RETURNING *`,
          [b.competence, b.notes||null, sess.identityId||sess.id, sess.identityId||sess.id]
        );
        return json(res,201,{ closure:r.rows[0] });
      }
      return json(res,400,{error:'invalid_action'});
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleDpVariables(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const competence=url.searchParams.get('competence'); const employee_id=url.searchParams.get('employee_id');
      const where=[]; const params=[]; let i=1;
      if(competence){ where.push(`competence=$${i++}`); params.push(competence); }
      if(employee_id){ where.push(`employee_id=$${i++}`); params.push(employee_id); }
      const sql=`SELECT dv.*, e.display_name as employee_name FROM hr_dp_variables dv LEFT JOIN hr_employees e ON e.id=dv.employee_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY dv.competence DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ variables:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!validComp(b.competence)) return json(res,400,{error:'invalid_competence'});
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(!b.variable_type) return json(res,400,{error:'variable_type_required'});
      // verifica closure fechado
      const closure=await pool.query(`SELECT id, status FROM hr_dp_closures WHERE competence=$1`,[b.competence]);
      if(closure.rows.length && closure.rows[0].status==='fechado') return json(res,409,{error:'dp_closure_closed', detail:'Competência fechada, reabrir para alterar'});
      let closureId=closure.rows.length?closure.rows[0].id:null;
      if(!closureId){
        const nc=await pool.query(`INSERT INTO hr_dp_closures (competence, status, created_by, created_by_id) VALUES ($1,'aberto',$2,$3) ON CONFLICT (competence) DO UPDATE SET updated_at=NOW() RETURNING id`,[b.competence, sess.identityId||sess.id, sess.identityId||sess.id]);
        closureId=nc.rows[0].id;
      }
      const r=await pool.query(`INSERT INTO hr_dp_variables (closure_id, employee_id, variable_type, quantity, amount, competence, description, status, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[closureId,b.employee_id,b.variable_type,b.quantity||0,b.amount||0,b.competence,b.description||null,b.status||'pendente',sess.identityId||sess.id,sess.identityId||sess.id]);
      return json(res,201,{ variable:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const upd=await pool.query(`UPDATE hr_dp_variables SET status=COALESCE($2,status), quantity=COALESCE($3,quantity), amount=COALESCE($4,amount), description=COALESCE($5,description), approved_by=CASE WHEN $2 IN ('conferido','aprovado') THEN $6 ELSE approved_by END, approved_at=CASE WHEN $2 IN ('conferido','aprovado') THEN NOW() ELSE approved_at END, rejection_reason=COALESCE($7,rejection_reason), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.quantity??null,b.amount??null,b.description||null,sess.identityId||sess.id,b.rejection_reason||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ variable:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleDpDocuments(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const competence=url.searchParams.get('competence');
      const where=competence?`WHERE dv.competence=$1`:''; const params=competence?[competence]:[];
      const sql=`SELECT dd.*, e.display_name as employee_name, dc.competence FROM hr_dp_documents dd LEFT JOIN hr_employees e ON e.id=dd.employee_id LEFT JOIN hr_dp_closures dc ON dc.id=dd.closure_id ${where} ORDER BY dd.created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ documents:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(!b.doc_type || !b.title) return json(res,400,{error:'doc_type_and_title_required'});
      if(b.competence && !validComp(b.competence)) return json(res,400,{error:'invalid_competence'});
      let closureId=b.closure_id&&isUuid(b.closure_id)?b.closure_id:null;
      if(!closureId && b.competence){
        const closure=await pool.query(`SELECT id FROM hr_dp_closures WHERE competence=$1`,[b.competence]);
        if(closure.rows.length) closureId=closure.rows[0].id;
        else {
          const nc=await pool.query(`INSERT INTO hr_dp_closures (competence, status, created_by, created_by_id) VALUES ($1,'aberto',$2,$3) RETURNING id`,[b.competence, sess.identityId||sess.id, sess.identityId||sess.id]);
          closureId=nc.rows[0].id;
        }
      }
      if(!closureId) return json(res,400,{error:'closure_id_or_competence_required'});
      const r=await pool.query(`INSERT INTO hr_dp_documents (closure_id, employee_id, doc_type, title, file_url, storage_key, status, is_restricted, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[closureId,b.employee_id,b.doc_type,b.title,b.file_url||null,b.storage_key||null,b.status||'pendente',b.is_restricted===true,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      return json(res,201,{ document:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const upd=await pool.query(`UPDATE hr_dp_documents SET status=COALESCE($2,status), file_url=COALESCE($3,file_url), checked_by=CASE WHEN $2 IN ('conferido','aprovado') THEN $4 ELSE checked_by END, checked_at=CASE WHEN $2 IN ('conferido','aprovado') THEN NOW() ELSE checked_at END, rejection_reason=COALESCE($5,rejection_reason), notes=COALESCE($6,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.file_url||null,sess.identityId||sess.id,b.rejection_reason||null,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ document:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleDpExports(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const competence=url.searchParams.get('competence');
      const where=competence?`WHERE competence=$1`:''; const params=competence?[competence]:[];
      const r=await pool.query(`SELECT de.*, dc.competence as closure_competence FROM hr_dp_exports de LEFT JOIN hr_dp_closures dc ON dc.id=de.closure_id ${where} ORDER BY de.competence DESC, de.version DESC LIMIT 200`,params);
      return json(res,200,{ exports:r.rows, note:'exportação versionada acesso contador limitado' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!validComp(b.competence)) return json(res,400,{error:'invalid_competence'});
      let closureId=b.closure_id&&isUuid(b.closure_id)?b.closure_id:null;
      if(!closureId){
        const closure=await pool.query(`SELECT id FROM hr_dp_closures WHERE competence=$1`,[b.competence]);
        if(!closure.rows.length) return json(res,404,{error:'closure_not_found'});
        closureId=closure.rows[0].id;
      }
      const maxV=await pool.query(`SELECT COALESCE(MAX(version),0) as max FROM hr_dp_exports WHERE closure_id=$1`,[closureId]);
      const version=(maxV.rows[0].max||0)+1;
      const r=await pool.query(
        `INSERT INTO hr_dp_exports (closure_id, competence, export_type, file_url, storage_key, version, status, protocol_number, is_protocol_valid, provider_name, requested_by, requested_by_id, access_role, is_counter_access_limited, allowed_counter_ids)
         VALUES ($1,$2,$3,$4,$5,$6,'pendente',$7,false,$8,$9,$10,$11,true,$12) RETURNING *`,
        [closureId,b.competence,b.export_type||'folha',b.file_url||null,b.storage_key||null,version,b.protocol_number||null,b.provider_name||null,sess.identityId||sess.id,sess.identityId||sess.id,b.access_role||'contador',b.allowed_counter_ids||[]]
      );
      await auditLog({ action:'hr_dp_export', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ competence:b.competence, version, access_role:b.access_role||'contador', is_counter_access_limited:true } });
      return json(res,201,{ export:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['pendente','gerado','enviado','confirmado','falhou','cancelado','processado'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      const upd=await pool.query(`UPDATE hr_dp_exports SET status=COALESCE($2,status), file_url=COALESCE($3,file_url), protocol_number=COALESCE($4,protocol_number), is_protocol_valid=COALESCE($5,is_protocol_valid), provider_name=COALESCE($6,provider_name), access_role=COALESCE($7,access_role), allowed_counter_ids=COALESCE($8,allowed_counter_ids), processed_at=CASE WHEN $2 IN ('enviado','confirmado','processado','falhou') THEN NOW() ELSE processed_at END, error_message=COALESCE($9,error_message), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.file_url||null,b.protocol_number||null,b.is_protocol_valid??null,b.provider_name||null,b.access_role||null,b.allowed_counter_ids||null,b.error_message||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ export:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  return {
    handleTrainingCatalog,
    handleTrainingRequirements,
    handleTrainingSessions,
    handleTrainingEnrollments,
    handleCompetencyCatalog,
    handleCompetencyRequirements,
    handleEmployeeCompetencies,
    handleCompetencyEvaluations,
    handleUniformCatalog,
    handleUniformDeliveries,
    handleUniformReturns,
    handleUniformRequests,
    handleDpClosures,
    handleDpVariables,
    handleDpDocuments,
    handleDpExports,
  };
}
