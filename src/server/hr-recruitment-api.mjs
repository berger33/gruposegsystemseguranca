const VACANCY_STATUS=['rascunho','aberta','em_triagem','entrevista','em_decisao','fechada','cancelada','arquivada'];
const CANDIDATE_STATUS=['inscrito','em_triagem','entrevista','aprovado','rejeitado','contratado','descartado','talent_pool'];
const INTERVIEW_STATUS=['agendada','realizada','cancelada','reagendada','nao_compareceu'];
const CONSENT_BASE=['consentimento','legitimo_interesse','execucao_contrato','cumprimento_legal','outro'];
const DOSSIER_TYPE=['rg','cpf','cnh','cnv','ctps','comprovante_residencia','certidao','curso','aso','treinamento','comprovante_escolaridade','reservista','titulo_eleitor','pis','foto','outro'];
const DOSSIER_STATUS=['pendente','em_analise','aprovado','rejeitado','vencido','cancelado','arquivado'];

function sanitize(v,max=2000){ if(typeof v!=='string') return ''; return v.trim().slice(0,max); }
function uuidRe(){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; }

export function createHrRecruitmentApi({ pool, auditLog, sameOrigin, requireSession, requireRole }){
  async function handleVacancies(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh','marcelo'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const status=url.searchParams.get('status'); const cargo=url.searchParams.get('cargo'); const search=url.searchParams.get('search');
      const cond=[]; const params=[]; let i=1;
      if(status && VACANCY_STATUS.includes(status)){ cond.push(`status=$${i++}`); params.push(status); }
      if(cargo){ cond.push(`cargo ILIKE $${i++}`); params.push(`%${cargo}%`); }
      if(search){ cond.push(`(title ILIKE $${i} OR cargo ILIKE $${i} OR description ILIKE $${i})`); params.push(`%${search}%`); i++; }
      let sql='SELECT * FROM hr_vacancies';
      if(cond.length) sql+=' WHERE '+cond.join(' AND ');
      sql+=' ORDER BY created_at DESC LIMIT 200';
      const r=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({vacancies:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const title=sanitize(data.title,200); const cargo=sanitize(data.cargo,100); const description=sanitize(data.description||'',5000);
      const requisitos=sanitize(data.requisitos||'',2000); const department=sanitize(data.department||'',100);
      const location=sanitize(data.location||'',200); const employment_type=String(data.employment_type||'clt').toLowerCase();
      const quantity=parseInt(data.quantity)||1; const salary_note=sanitize(data.salary_range_note||'',200);
      const responsible_name=sanitize(data.responsible_name||'',200);
      if(title.length<5){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'title_min_5'})); return; }
      if(cargo.length<2){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'cargo_required'})); return; }
      if(quantity<1||quantity>100){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_quantity'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO hr_vacancies (title, cargo, description, requisitos, department, location, employment_type, quantity, salary_range_note, responsible_name, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [title,cargo,description||null,requisitos||null,department||null,location||null,employment_type,quantity,salary_note||null,responsible_name||null,by,byId]);
      await auditLog({ action:'hr_vacancy_create', actor: by, target: r.rows[0].id, meta:{ cargo, title } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({vacancy:r.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const status=String(data.status||'').toLowerCase();
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(!VACANCY_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      const cur=await pool.query('SELECT * FROM hr_vacancies WHERE id=$1',[id]);
      if(!cur.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      const by=sess.username||sess.user||'unknown';
      let sql=`UPDATE hr_vacancies SET status=$1, updated_at=now()`; const params=[status]; let idx=2;
      if(status==='aberta'){ sql+=`, published_at=now()`; }
      if(status==='fechada'){ sql+=`, closed_at=now()`; }
      sql+=` WHERE id=$${idx} RETURNING *`; params.push(id);
      const r=await pool.query(sql, params);
      await auditLog({ action:'hr_vacancy_create', actor: by, target: id, meta:{ previous:cur.rows[0].status, next:status } });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({vacancy:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleCandidates(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh','marcelo'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const vacancy_id=url.searchParams.get('vacancy_id'); const status=url.searchParams.get('status'); const search=url.searchParams.get('search');
      const cond=[]; const params=[]; let i=1;
      if(vacancy_id && uuidRe().test(vacancy_id)){ cond.push(`vacancy_id=$${i++}`); params.push(vacancy_id); }
      if(status && CANDIDATE_STATUS.includes(status)){ cond.push(`status=$${i++}`); params.push(status); }
      if(search){ cond.push(`(name ILIKE $${i} OR email ILIKE $${i} OR phone ILIKE $${i})`); params.push(`%${search}%`); i++; }
      let sql='SELECT * FROM hr_candidates';
      if(cond.length) sql+=' WHERE '+cond.join(' AND ');
      sql+=' ORDER BY created_at DESC LIMIT 200';
      const r=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({candidates:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const vacancy_id=data.vacancy_id && uuidRe().test(String(data.vacancy_id))? String(data.vacancy_id): null;
      const name=sanitize(data.name,200); const email=sanitize(data.email||'',320); const phone=sanitize(data.phone||'',30);
      const resume_url=data.resume_file_url? sanitize(data.resume_file_url,1000): null;
      const resume_text=sanitize(data.resume_text_excerpt||'',2000);
      const source=sanitize(data.source||'',100); const consent_base=String(data.consent_base||'consentimento').toLowerCase();
      const retention_days=parseInt(data.retention_days)||365; const notes=sanitize(data.notes||'',2000);
      if(name.length<3){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'name_min_3'})); return; }
      if(!CONSENT_BASE.includes(consent_base)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_consent_base'})); return; }
      if(retention_days<30||retention_days>1825){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_retention_days'})); return; }
      if(vacancy_id){ const v=await pool.query('SELECT id FROM hr_vacancies WHERE id=$1',[vacancy_id]); if(!v.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'vacancy_not_found'})); return; } }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const retention_until=new Date(); retention_until.setDate(retention_until.getDate()+retention_days);
      const r=await pool.query(`INSERT INTO hr_candidates (vacancy_id, name, email, phone, resume_file_url, resume_text_excerpt, source, consent_base, retention_days, retention_until, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [vacancy_id, name, email||null, phone||null, resume_url, resume_text||null, source||null, consent_base, retention_days, retention_until.toISOString().slice(0,10), notes||null, by, byId]);
      await pool.query(`INSERT INTO hr_candidate_history (candidate_id, vacancy_id, next_status, reason, changed_by, changed_by_id) VALUES ($1,$2,$3,$4,$5,$6)`, [r.rows[0].id, vacancy_id, 'inscrito', 'Inscrição inicial', by, byId]);
      await auditLog({ action:'hr_candidate_create', actor: by, target: r.rows[0].id, meta:{ vacancy_id, consent_base, retention_days } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({candidate:r.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const status=String(data.status||'').toLowerCase(); const reason=sanitize(data.reason||'',1000);
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(!CANDIDATE_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      if(status==='rejeitado' && reason.length<5){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'rejection_reason_required'})); return; }
      const cur=await pool.query('SELECT * FROM hr_candidates WHERE id=$1',[id]);
      if(!cur.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`UPDATE hr_candidates SET status=$1, rejection_reason=$2, updated_at=now() WHERE id=$3 RETURNING *`, [status, status==='rejeitado'? reason: null, id]);
      await pool.query(`INSERT INTO hr_candidate_history (candidate_id, vacancy_id, previous_status, next_status, reason, changed_by, changed_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, cur.rows[0].vacancy_id, cur.rows[0].status, status, reason||null, by, byId]);
      await auditLog({ action:'hr_candidate_status_change', actor: by, target: id, meta:{ previous:cur.rows[0].status, next:status } });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({candidate:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleInterviews(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh','marcelo'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost'); const candidate_id=url.searchParams.get('candidate_id');
      let sql='SELECT * FROM hr_interviews'; const params=[]; let i=1;
      if(candidate_id && uuidRe().test(candidate_id)){ sql+=` WHERE candidate_id=$${i++}`; params.push(candidate_id); }
      sql+=' ORDER BY scheduled_at DESC LIMIT 200';
      const r=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({interviews:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const candidate_id=String(data.candidate_id||''); const vacancy_id=data.vacancy_id && uuidRe().test(String(data.vacancy_id))? String(data.vacancy_id): null;
      const scheduled_at=String(data.scheduled_at||''); const interviewer_name=sanitize(data.interviewer_name||'',200);
      const interview_type=String(data.interview_type||'presencial').toLowerCase(); const location=sanitize(data.location||'',200); const notes=sanitize(data.notes||'',2000);
      if(!uuidRe().test(candidate_id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_candidate_id'})); return; }
      if(!scheduled_at){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'scheduled_at_required'})); return; }
      if(!['presencial','video','telefone','outro'].includes(interview_type)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_interview_type'})); return; }
      const cand=await pool.query('SELECT * FROM hr_candidates WHERE id=$1',[candidate_id]);
      if(!cand.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'candidate_not_found'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO hr_interviews (candidate_id, vacancy_id, scheduled_at, interviewer_name, interview_type, location, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [candidate_id, vacancy_id, new Date(scheduled_at), interviewer_name||null, interview_type, location||null, notes||null, by, byId]);
      // Update candidate status to entrevista
      await pool.query(`UPDATE hr_candidates SET status='entrevista', updated_at=now() WHERE id=$1 AND status IN ('inscrito','em_triagem')`, [candidate_id]);
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({interview:r.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const status=String(data.status||'').toLowerCase(); const decision=sanitize(data.decision||'',1000); const rating=data.rating? parseInt(data.rating): null;
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(status && !INTERVIEW_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      if(rating!==null && (rating<1||rating>5)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_rating'})); return; }
      const cur=await pool.query('SELECT * FROM hr_interviews WHERE id=$1',[id]);
      if(!cur.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      const r=await pool.query(`UPDATE hr_interviews SET status=COALESCE($1,status), decision=COALESCE($2,decision), rating=COALESCE($3,rating), updated_at=now() WHERE id=$4 RETURNING *`, [status||null, decision||null, rating, id]);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({interview:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleTalentPool(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh','marcelo'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const cargo=url.searchParams.get('cargo'); const active=url.searchParams.get('active'); const search=url.searchParams.get('search');
      const cond=[]; const params=[]; let i=1;
      if(cargo){ cond.push(`cargo_interesse ILIKE $${i++}`); params.push(`%${cargo}%`); }
      if(active==='true'){ cond.push(`is_active=true AND (retention_until >= CURRENT_DATE)`); }
      if(search){ cond.push(`(name ILIKE $${i} OR email ILIKE $${i} OR cargo_interesse ILIKE $${i})`); params.push(`%${search}%`); i++; }
      let sql='SELECT * FROM hr_talent_pool';
      if(cond.length) sql+=' WHERE '+cond.join(' AND ');
      sql+=' ORDER BY created_at DESC LIMIT 200';
      const r=await pool.query(sql, params);
      // Check expired
      const expired=await pool.query(`SELECT COUNT(*)::int as c FROM hr_talent_pool WHERE retention_until < CURRENT_DATE AND is_active=true`);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({talent_pool:r.rows, expired_count: expired.rows[0]?.c||0})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const candidate_id=data.candidate_id && uuidRe().test(String(data.candidate_id))? String(data.candidate_id): null;
      const name=sanitize(data.name,200); const email=sanitize(data.email||'',320); const phone=sanitize(data.phone||'',30);
      const cargo_interesse=sanitize(data.cargo_interesse,100); const areas=Array.isArray(data.areas)? data.areas.map((s)=>sanitize(String(s),50)).slice(0,20): [];
      const skills=Array.isArray(data.skills)? data.skills.map((s)=>sanitize(String(s),50)).slice(0,30): [];
      const consent_base=String(data.consent_base||'consentimento').toLowerCase(); const retention_days=parseInt(data.retention_days)||365;
      const resume_url=data.resume_file_url? sanitize(data.resume_file_url,1000): null; const source=sanitize(data.source||'',100);
      if(name.length<3){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'name_min_3'})); return; }
      if(cargo_interesse.length<2){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'cargo_interesse_required'})); return; }
      if(!CONSENT_BASE.includes(consent_base)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_consent_base'})); return; }
      if(retention_days<30||retention_days>1825){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_retention_days'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const retention_until=new Date(); retention_until.setDate(retention_until.getDate()+retention_days);
      try{
        const r=await pool.query(`INSERT INTO hr_talent_pool (candidate_id, name, email, phone, cargo_interesse, areas, skills, resume_file_url, consent_base, retention_days, retention_until, source, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, [candidate_id, name, email||null, phone||null, cargo_interesse, areas, skills, resume_url, consent_base, retention_days, retention_until.toISOString().slice(0,10), source||null, by, byId]);
        if(candidate_id){ await pool.query(`UPDATE hr_candidates SET is_talent_pool=true, status='talent_pool' WHERE id=$1`, [candidate_id]); }
        await auditLog({ action:'hr_talent_pool_add', actor: by, target: r.rows[0].id, meta:{ cargo_interesse, consent_base, retention_days } });
        res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({talent:r.rows[0]})); return;
      }catch(e){
        if(String(e).includes('duplicate')||String(e).includes('unique')){ res.writeHead(409,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate_candidate'})); return; }
        throw e;
      }
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const action=String(data.action||'').toLowerCase(); const discard_reason=sanitize(data.discard_reason||'',1000);
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      const cur=await pool.query('SELECT * FROM hr_talent_pool WHERE id=$1',[id]);
      if(!cur.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      const by=sess.username||sess.user||'unknown';
      if(action==='descartar' || action==='anonymize'){
        if(discard_reason.length<5){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'discard_reason_required'})); return; }
        const r=await pool.query(`UPDATE hr_talent_pool SET is_active=false, is_anonymized=true, anonymized_at=now(), discard_reason=$1, updated_at=now() WHERE id=$2 RETURNING *`, [discard_reason, id]);
        await auditLog({ action:'hr_talent_pool_discard', actor: by, target: id, meta:{ discard_reason } });
        res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({talent:r.rows[0]})); return;
      }
      if(action==='reativar'){
        const r=await pool.query(`UPDATE hr_talent_pool SET is_active=true, updated_at=now() WHERE id=$1 RETURNING *`, [id]);
        res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({talent:r.rows[0]})); return;
      }
      res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_action'})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleDossiers(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh','marcelo'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const employee_id=url.searchParams.get('employee_id'); const status=url.searchParams.get('status'); const doc_type=url.searchParams.get('doc_type');
      const cond=[]; const params=[]; let i=1;
      if(employee_id && uuidRe().test(employee_id)){ cond.push(`employee_id=$${i++}`); params.push(employee_id); }
      if(status && DOSSIER_STATUS.includes(status)){ cond.push(`status=$${i++}`); params.push(status); }
      if(doc_type && DOSSIER_TYPE.includes(doc_type)){ cond.push(`doc_type=$${i++}`); params.push(doc_type); }
      let sql='SELECT * FROM hr_employee_dossiers';
      if(cond.length) sql+=' WHERE '+cond.join(' AND ');
      sql+=' ORDER BY created_at DESC LIMIT 200';
      const r=await pool.query(sql, params);
      const reqs=await pool.query('SELECT * FROM hr_dossier_requirements ORDER BY cargo, doc_type');
      const pendencias=await pool.query(`SELECT employee_id, COUNT(*)::int as pendentes FROM hr_employee_dossiers WHERE status IN ('pendente','vencido') GROUP BY employee_id`);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({dossiers:r.rows, requirements:reqs.rows, pendencias:pendencias.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const employee_id=String(data.employee_id||''); const doc_type=String(data.doc_type||'').toLowerCase();
      const title=sanitize(data.title,200); const description=sanitize(data.description||'',1000);
      const file_url=data.file_url? sanitize(data.file_url,1000): null; const storage_key=data.storage_key? sanitize(data.storage_key,500): null;
      const validity_start=data.validity_start? String(data.validity_start): null; const validity_end=data.validity_end? String(data.validity_end): null;
      const is_cnv=Boolean(data.is_cnv); const requires_confirmation=Boolean(data.requires_confirmation);
      const applicable_roles=Array.isArray(data.applicable_roles)? data.applicable_roles.map((s)=>sanitize(String(s),50)).slice(0,20): [];
      if(!uuidRe().test(employee_id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_employee_id'})); return; }
      if(!DOSSIER_TYPE.includes(doc_type)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_doc_type'})); return; }
      if(title.length<3){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'title_min_3'})); return; }
      const emp=await pool.query('SELECT * FROM hr_employees WHERE id=$1',[employee_id]);
      if(!emp.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'employee_not_found'})); return; }
      // CNV apenas para funções aplicáveis após confirmação
      if(doc_type==='cnv' || is_cnv){
        const reqCheck=await pool.query('SELECT * FROM hr_dossier_requirements WHERE cargo=$1 AND doc_type=$2',[emp.rows[0].cargo, 'cnv']);
        if(!reqCheck.rows.length || !reqCheck.rows[0].is_cnv_applicable){
          // Check if applicable_roles contains cargo or is_cnv applicable via requirements
          if(!applicable_roles.includes(emp.rows[0].cargo) && !requires_confirmation){
            res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'cnv_only_for_applicable_roles_after_confirmation','note':'CNV e demais documentos apenas para funções/atividades aplicáveis, após confirmação'})); return;
          }
        }
      }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      // version
      const maxV=await pool.query('SELECT COALESCE(MAX(version),0)::int as max FROM hr_employee_dossiers WHERE employee_id=$1 AND doc_type=$2',[employee_id, doc_type]);
      const nextVersion=(maxV.rows[0]?.max||0)+1;
      const is_required_req=await pool.query('SELECT is_required FROM hr_dossier_requirements WHERE cargo=$1 AND doc_type=$2',[emp.rows[0].cargo, doc_type]);
      const is_required_for_role=is_required_req.rows.length? is_required_req.rows[0].is_required : false;
      const r=await pool.query(`INSERT INTO hr_employee_dossiers (employee_id, doc_type, title, description, version, file_url, storage_key, validity_start, validity_end, is_required_for_role, applicable_roles, is_cnv, requires_confirmation, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`, [employee_id, doc_type, title, description||null, nextVersion, file_url, storage_key, validity_start? new Date(validity_start).toISOString().slice(0,10): null, validity_end? new Date(validity_end).toISOString().slice(0,10): null, is_required_for_role, applicable_roles, is_cnv||doc_type==='cnv', requires_confirmation|| (doc_type==='cnv'), by, byId]);
      await auditLog({ action:'hr_dossier_create', actor: by, target: r.rows[0].id, meta:{ employee_id, doc_type, version:nextVersion, is_cnv } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({dossier:r.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const status=String(data.status||'').toLowerCase(); const rejection_reason=data.rejection_reason? sanitize(data.rejection_reason,1000): null;
      const confirmed=Boolean(data.confirmed);
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(status && !DOSSIER_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      if(status==='rejeitado' && (!rejection_reason||rejection_reason.length<5)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'rejection_reason_required'})); return; }
      const cur=await pool.query('SELECT * FROM hr_employee_dossiers WHERE id=$1',[id]);
      if(!cur.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      let sql='UPDATE hr_employee_dossiers SET updated_at=now()'; const params=[]; let idx=1;
      if(status){ sql+=`, status=$${idx++}`; params.push(status); if(status==='aprovado'){ sql+=`, approved_by=$${idx++}, approved_by_id=$${idx++}, approved_at=now()`; params.push(by, byId); } if(status==='rejeitado'){ sql+=`, rejection_reason=$${idx++}`; params.push(rejection_reason); } }
      if(confirmed){ sql+=`, confirmed_at=now(), confirmed_by=$${idx++}, confirmed_by_id=$${idx++}`; params.push(by, byId); }
      sql+=` WHERE id=$${idx} RETURNING *`; params.push(id);
      const r=await pool.query(sql, params);
      if(status==='aprovado') await auditLog({ action:'hr_dossier_approve', actor: by, target: id, meta:{ employee_id:cur.rows[0].employee_id, doc_type:cur.rows[0].doc_type } });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({dossier:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  return { handleVacancies, handleCandidates, handleInterviews, handleTalentPool, handleDossiers };
}
