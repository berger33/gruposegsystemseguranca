export function createEmpPortalApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  function json(res, status, body) { res.statusCode = status; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(body)); }
  async function readJson(req) { const chunks=[]; for await(const c of req) chunks.push(c); if(!chunks.length) return {}; try{ return JSON.parse(Buffer.concat(chunks).toString('utf8')); }catch{ return {}; } }
  async function checkAuth(req,res){ if(sameOrigin && !sameOrigin(req)){ json(res,403,{error:'forbidden_origin'}); return null; } const sess=await requireSession(req); if(!sess){ json(res,401,{error:'unauthorized'}); return null; } if(!requireRole(sess,['admin','ti','rh'])){ json(res,403,{error:'forbidden_role'}); return null; } return sess; }
  function isUuid(v){ return typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); }
  function genProtocol(prefix='EMP'){ const d=new Date(); const rnd=Math.random().toString(36).slice(2,6).toUpperCase(); return `${prefix}${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${rnd}`; }

  // EMP-02 próximo plantão
  async function handleShiftAssignments(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const is_next=url.searchParams.get('is_next_shift');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`sa.employee_id=$${i++}`); params.push(employee_id); }
      if(is_next==='true'){ where.push(`sa.is_next_shift=true`); }
      const sql=`SELECT sa.*, e.display_name as employee_name FROM emp_shift_assignments sa LEFT JOIN hr_employees e ON e.id=sa.employee_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY sa.shift_date ASC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ shifts:r.rows, note:'EMP-02 próximo plantão local horário função contato supervisor orientações itens necessários' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(!b.shift_date) return json(res,400,{error:'shift_date_required'});
      const emp=await pool.query(`SELECT id FROM hr_employees WHERE id=$1`,[b.employee_id]);
      if(!emp.rows.length) return json(res,404,{error:'employee_not_found'});
      // if is_next_shift true, unset previous next flags for same employee
      if(b.is_next_shift===true){
        await pool.query(`UPDATE emp_shift_assignments SET is_next_shift=false, updated_at=NOW() WHERE employee_id=$1 AND is_next_shift=true`,[b.employee_id]);
      }
      const r=await pool.query(`INSERT INTO emp_shift_assignments (employee_id, shift_date, start_time, end_time, location, function_name, supervisor_id, supervisor_name, supervisor_contact, orientations, required_items, status, is_next_shift, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,[b.employee_id,b.shift_date,b.start_time||null,b.end_time||null,b.location||null,b.function_name||null,b.supervisor_id||null,b.supervisor_name||null,b.supervisor_contact||null,b.orientations||null,b.required_items?JSON.stringify(b.required_items):null,b.status||'publicado',b.is_next_shift===true,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'emp_shift_create', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ employee_id:b.employee_id, shift_date:b.shift_date, is_next:b.is_next_shift } });
      return json(res,201,{ shift:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['rascunho','publicado','confirmado','cancelado','realizado','pendente'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      if(b.is_next_shift===true){
        const cur=await pool.query(`SELECT employee_id FROM emp_shift_assignments WHERE id=$1`,[b.id]);
        if(cur.rows.length) await pool.query(`UPDATE emp_shift_assignments SET is_next_shift=false WHERE employee_id=$1 AND id<>$2`,[cur.rows[0].employee_id,b.id]);
      }
      const upd=await pool.query(`UPDATE emp_shift_assignments SET status=COALESCE($2,status), is_next_shift=COALESCE($3,is_next_shift), location=COALESCE($4,location), supervisor_name=COALESCE($5,supervisor_name), supervisor_contact=COALESCE($6,supervisor_contact), orientations=COALESCE($7,orientations), required_items=COALESCE($8,required_items), notes=COALESCE($9,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.is_next_shift,b.location||null,b.supervisor_name||null,b.supervisor_contact||null,b.orientations||null,b.required_items?JSON.stringify(b.required_items):null,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ shift:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  // EMP-03 escala
  async function handleScheduleVersions(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const r=await pool.query(`SELECT * FROM emp_schedule_versions ORDER BY version DESC LIMIT 100`);
      return json(res,200,{ versions:r.rows, note:'EMP-03 calendário escala folgas alterações ciência versão publicada usuário não modifica unilateralmente' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!b.title || b.title.length<3) return json(res,400,{error:'invalid_title'});
      if(!b.period_start || !b.period_end) return json(res,400,{error:'period_required'});
      const maxV=await pool.query(`SELECT COALESCE(MAX(version),0) as max FROM emp_schedule_versions`);
      const version=(maxV.rows[0].max||0)+1;
      const r=await pool.query(`INSERT INTO emp_schedule_versions (version, title, period_start, period_end, status, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,'rascunho',$5,$6,$7) RETURNING *`,[version,b.title,b.period_start,b.period_end,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      return json(res,201,{ version:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['rascunho','publicado','arquivado','cancelado'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      // usuário não modifica unilateralmente escala: só admin/ti/rh pode publicar, employee só pode dar ciência via ack separado
      // aqui bloqueamos se status publicado e não for admin/ti/rh? Mas checkAuth já garante admin/ti/rh, então ok. Employee portal usaria endpoint diferente, mas aqui admin publica.
      const upd=await pool.query(`UPDATE emp_schedule_versions SET status=COALESCE($2,status), published_at=CASE WHEN $2='publicado' THEN NOW() ELSE published_at END, published_by=CASE WHEN $2='publicado' THEN $3 ELSE published_by END, published_by_id=CASE WHEN $2='publicado' THEN $3 ELSE published_by_id END, notes=COALESCE($4,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,sess.identityId||sess.id,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      if(b.status==='publicado') await auditLog({ action:'emp_schedule_publish', actor:sess.identityId||sess.id, target:b.id, meta:{ version:upd.rows[0].version } });
      return json(res,200,{ version:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleScheduleEntries(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const version_id=url.searchParams.get('version_id'); const employee_id=url.searchParams.get('employee_id');
      const where=[]; const params=[]; let i=1;
      if(version_id){ where.push(`version_id=$${i++}`); params.push(version_id); }
      if(employee_id){ where.push(`employee_id=$${i++}`); params.push(employee_id); }
      const sql=`SELECT se.*, e.display_name as employee_name, sv.version as schedule_version FROM emp_schedule_entries se LEFT JOIN hr_employees e ON e.id=se.employee_id LEFT JOIN emp_schedule_versions sv ON sv.id=se.version_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY se.entry_date ASC LIMIT 300`;
      const r=await pool.query(sql,params);
      return json(res,200,{ entries:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.version_id)) return json(res,400,{error:'invalid_version_id'});
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(!b.entry_date) return json(res,400,{error:'entry_date_required'});
      // verifica versão existe e não arquivada/cancelada
      const ver=await pool.query(`SELECT id, status FROM emp_schedule_versions WHERE id=$1`,[b.version_id]);
      if(!ver.rows.length) return json(res,404,{error:'version_not_found'});
      if(['arquivado','cancelado'].includes(ver.rows[0].status)) return json(res,409,{error:'version_closed'});
      // usuário não modifica unilateralmente: employee_id não pode ser o próprio sess se role employee? Mas aqui admin cria.
      try{
        const r=await pool.query(`INSERT INTO emp_schedule_entries (version_id, employee_id, entry_date, entry_type, shift_assignment_id, is_day_off, start_time, end_time, location, acknowledged, change_reason, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11,$12) RETURNING *`,[b.version_id,b.employee_id,b.entry_date,b.entry_type||'trabalho',b.shift_assignment_id||null,b.is_day_off===true,b.start_time||null,b.end_time||null,b.location||null,b.change_reason||null,sess.identityId||sess.id,sess.identityId||sess.id]);
        return json(res,201,{ entry:r.rows[0] });
      }catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_entry'}); throw e; }
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      // ciência da versão publicada: acknowledged
      if(b.acknowledged===true){
        const upd=await pool.query(`UPDATE emp_schedule_entries SET acknowledged=true, acknowledged_at=NOW(), acknowledged_by=$2, updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,sess.identityId||sess.id]);
        if(!upd.rows.length) return json(res,404,{error:'not_found'});
        await auditLog({ action:'emp_schedule_ack', actor:sess.identityId||sess.id, target:b.id, meta:{ employee_id:upd.rows[0].employee_id, entry_date:upd.rows[0].entry_date } });
        return json(res,200,{ entry:upd.rows[0] });
      }
      // alteração de escala: só admin pode, e deve informar change_reason
      if(b.entry_type || b.is_day_off!==undefined || b.start_time || b.end_time || b.location){
        if(!b.change_reason || b.change_reason.length<10) return json(res,400,{error:'change_reason_required'});
      }
      const upd=await pool.query(`UPDATE emp_schedule_entries SET entry_type=COALESCE($2,entry_type), is_day_off=COALESCE($3,is_day_off), start_time=COALESCE($4,start_time), end_time=COALESCE($5,end_time), location=COALESCE($6,location), change_reason=COALESCE($7,change_reason), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.entry_type||null,b.is_day_off,b.start_time||null,b.end_time||null,b.location||null,b.change_reason||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ entry:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  // EMP-04 jornada individual comprovantes e correção
  async function handleJourneyProofs(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const entry_date=url.searchParams.get('entry_date');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`jp.employee_id=$${i++}`); params.push(employee_id); }
      if(entry_date){ where.push(`jp.entry_date=$${i++}`); params.push(entry_date); }
      const sql=`SELECT jp.*, e.display_name as employee_name FROM emp_journey_proofs jp LEFT JOIN hr_employees e ON e.id=jp.employee_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY jp.entry_date DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ proofs:r.rows, note:'EMP-04 jornada individual comprovantes/importação provedor divergências pedido correção preservar registro original' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(!b.entry_date) return json(res,400,{error:'entry_date_required'});
      if(!b.file_url) return json(res,400,{error:'file_url_required'});
      const r=await pool.query(`INSERT INTO emp_journey_proofs (employee_id, entry_date, file_name, file_url, storage_key, proof_type, status, time_entry_id, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,'pendente',$7,$8,$9,$10) RETURNING *`,[b.employee_id,b.entry_date,b.file_name||null,b.file_url,b.storage_key||null,b.proof_type||'comprovante',b.time_entry_id||null,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'emp_journey_proof_upload', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ employee_id:b.employee_id, entry_date:b.entry_date } });
      return json(res,201,{ proof:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['pendente','em_analise','aprovado','rejeitado','arquivado','cancelado'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      if(b.status==='rejeitado' && (!b.rejection_reason||b.rejection_reason.length<5)) return json(res,400,{error:'rejection_reason_required'});
      const upd=await pool.query(`UPDATE emp_journey_proofs SET status=COALESCE($2,status), reviewed_by=CASE WHEN $2 IN ('aprovado','rejeitado','em_analise') THEN $3 ELSE reviewed_by END, reviewed_by_id=CASE WHEN $2 IN ('aprovado','rejeitado','em_analise') THEN $3 ELSE reviewed_by_id END, reviewed_at=CASE WHEN $2 IN ('aprovado','rejeitado','em_analise') THEN NOW() ELSE reviewed_at END, rejection_reason=COALESCE($4,rejection_reason), notes=COALESCE($5,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,sess.identityId||sess.id,b.rejection_reason||null,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      return json(res,200,{ proof:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleJourneyCorrections(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const time_entry_id=url.searchParams.get('time_entry_id');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`jc.employee_id=$${i++}`); params.push(employee_id); }
      if(time_entry_id){ where.push(`jc.time_entry_id=$${i++}`); params.push(time_entry_id); }
      const sql=`SELECT jc.*, e.display_name as employee_name FROM emp_journey_corrections jc LEFT JOIN hr_employees e ON e.id=jc.employee_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY jc.created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ corrections:r.rows, note:'EMP-04 preservar registro original original_snapshot' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(!isUuid(b.time_entry_id)) return json(res,400,{error:'invalid_time_entry_id'});
      if(!b.reason || b.reason.length<10) return json(res,400,{error:'reason_required'});
      if(!b.requested_changes || typeof b.requested_changes!=='object') return json(res,400,{error:'requested_changes_required'});
      const te=await pool.query(`SELECT * FROM hr_time_entries WHERE id=$1`,[b.time_entry_id]);
      if(!te.rows.length) return json(res,404,{error:'time_entry_not_found'});
      // preservar registro original
      const original=te.rows[0];
      const r=await pool.query(`INSERT INTO emp_journey_corrections (employee_id, time_entry_id, original_snapshot, requested_changes, reason, status, notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,'solicitado',$6,$7,$8) RETURNING *`,[b.employee_id,b.time_entry_id,JSON.stringify(original),JSON.stringify(b.requested_changes),b.reason,b.notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'emp_journey_correction_request', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ employee_id:b.employee_id, time_entry_id:b.time_entry_id } });
      return json(res,201,{ correction:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['solicitado','em_analise','aprovado','rejeitado','cancelado','concluido'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      if(b.status==='rejeitado' && (!b.rejection_reason||b.rejection_reason.length<5)) return json(res,400,{error:'rejection_reason_required'});
      const upd=await pool.query(`UPDATE emp_journey_corrections SET status=COALESCE($2,status), reviewed_by=CASE WHEN $2 IN ('aprovado','rejeitado','em_analise','concluido') THEN $3 ELSE reviewed_by END, reviewed_by_id=CASE WHEN $2 IN ('aprovado','rejeitado','em_analise','concluido') THEN $3 ELSE reviewed_by_id END, reviewed_at=CASE WHEN $2 IN ('aprovado','rejeitado','em_analise','concluido') THEN NOW() ELSE reviewed_at END, rejection_reason=COALESCE($4,rejection_reason), approved_changes=COALESCE($5,approved_changes), notes=COALESCE($6,notes), updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,sess.identityId||sess.id,b.rejection_reason||null,b.approved_changes?JSON.stringify(b.approved_changes):null,b.notes||null]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      // se aprovado, aplicar correção no hr_time_entries mas preservando original_snapshot já existente
      if(b.status==='aprovado' || b.status==='concluido'){
        const corr=upd.rows[0];
        // atualizar hr_time_entries com approved_changes, mas preservar original_snapshot se ainda null
        const changes=corr.approved_changes || corr.requested_changes;
        // changes pode conter clock_in, clock_out, hours_worked, justification
        if(changes){
          const ch=typeof changes==='string'?JSON.parse(changes):changes;
          await pool.query(`UPDATE hr_time_entries SET clock_in=COALESCE($2,clock_in), clock_out=COALESCE($3,clock_out), hours_worked=COALESCE($4,hours_worked), justification=COALESCE($5,justification), original_snapshot=COALESCE(original_snapshot,$6), corrected_by=$7, corrected_at=NOW(), status='corrigido', updated_at=NOW() WHERE id=$8`,[corr.id,ch.clock_in||null,ch.clock_out||null,ch.hours_worked||null,ch.justification||null,JSON.stringify(corr.original_snapshot),sess.identityId||sess.id,corr.time_entry_id]);
        }
      }
      return json(res,200,{ correction:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  // EMP-05 aviso ausência/atraso
  async function handleAbsenceNotices(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const employee_id=url.searchParams.get('employee_id'); const status=url.searchParams.get('status');
      const where=[]; const params=[]; let i=1;
      if(employee_id){ where.push(`an.employee_id=$${i++}`); params.push(employee_id); }
      if(status){ where.push(`an.status=$${i++}`); params.push(status); }
      const sql=`SELECT an.*, e.display_name as employee_name FROM emp_absence_notices an LEFT JOIN hr_employees e ON e.id=an.employee_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY an.created_at DESC LIMIT 200`;
      const r=await pool.query(sql,params);
      return json(res,200,{ notices:r.rows, note:'EMP-05 aviso ausência/atraso protocolo motivo limitado responsável acompanhamento aciona fluxo cobertura' });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.employee_id)) return json(res,400,{error:'invalid_employee_id'});
      if(!b.notice_type || !['ausencia','atraso'].includes(b.notice_type)) return json(res,400,{error:'invalid_notice_type'});
      if(!b.reason_code) return json(res,400,{error:'reason_code_required'});
      const allowedReasons=['doenca','transporte','familiar','pessoal','acidente','condicoes_climaticas','outro'];
      if(!allowedReasons.includes(b.reason_code)) return json(res,400,{error:'invalid_reason_code'});
      if(b.reason_code==='outro' && (!b.reason_details||b.reason_details.length<10)) return json(res,400,{error:'reason_details_required_for_outro'});
      if(b.notice_type==='atraso' && (!b.expected_delay_minutes || b.expected_delay_minutes<1)) return json(res,400,{error:'expected_delay_required_for_atraso'});
      const emp=await pool.query(`SELECT id FROM hr_employees WHERE id=$1`,[b.employee_id]);
      if(!emp.rows.length) return json(res,404,{error:'employee_not_found'});
      const protocol=genProtocol('ABS');
      const r=await pool.query(`INSERT INTO emp_absence_notices (protocol, employee_id, notice_type, shift_date, notice_date, expected_delay_minutes, reason_code, reason_details, responsible_id, responsible_name, status, coverage_triggered, coverage_notes, created_by, created_by_id) VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8,$9,'aberto',false,$10,$11,$12) RETURNING *`,[protocol,b.employee_id,b.notice_type,b.shift_date||null,b.expected_delay_minutes||null,b.reason_code,b.reason_details||null,b.responsible_id||null,b.responsible_name||null,b.coverage_notes||null,sess.identityId||sess.id,sess.identityId||sess.id]);
      await auditLog({ action:'emp_absence_notice_create', actor:sess.identityId||sess.id, target:r.rows[0].id, meta:{ protocol, employee_id:b.employee_id, notice_type:b.notice_type, reason_code:b.reason_code } });
      return json(res,201,{ notice:r.rows[0] });
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      if(!isUuid(b.id)) return json(res,400,{error:'invalid_id'});
      const allowed=['aberto','em_analise','aprovado','rejeitado','em_acompanhamento','encerrado','cancelado','pendente'];
      if(b.status && !allowed.includes(b.status)) return json(res,400,{error:'invalid_status'});
      // aciona fluxo de cobertura quando aprovado ou em_acompanhamento
      let coverageTriggered=false;
      if(b.status==='aprovado' || b.status==='em_acompanhamento') coverageTriggered=true;
      const upd=await pool.query(`UPDATE emp_absence_notices SET status=COALESCE($2,status), responsible_id=COALESCE($3,responsible_id), responsible_name=COALESCE($4,responsible_name), coverage_triggered=CASE WHEN $5=true THEN true ELSE coverage_triggered END, coverage_request_id=COALESCE($6,coverage_request_id), coverage_notes=COALESCE($7,coverage_notes), closed_at=CASE WHEN $2 IN ('encerrado','cancelado') THEN NOW() ELSE closed_at END, closed_by=CASE WHEN $2 IN ('encerrado','cancelado') THEN $8 ELSE closed_by END, updated_at=NOW() WHERE id=$1 RETURNING *`,[b.id,b.status||null,b.responsible_id||null,b.responsible_name||null,coverageTriggered,b.coverage_request_id||null,b.coverage_notes||null,sess.identityId||sess.id]);
      if(!upd.rows.length) return json(res,404,{error:'not_found'});
      if(coverageTriggered) await auditLog({ action:'emp_absence_coverage_trigger', actor:sess.identityId||sess.id, target:b.id, meta:{ protocol:upd.rows[0].protocol, coverage_request_id:b.coverage_request_id } });
      return json(res,200,{ notice:upd.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  async function handleAbsenceFollowups(req,res){
    const sess=await checkAuth(req,res); if(!sess) return;
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const notice_id=url.searchParams.get('notice_id');
      if(!notice_id) return json(res,400,{error:'notice_id_required'});
      const r=await pool.query(`SELECT * FROM emp_absence_followups WHERE notice_id=$1 ORDER BY created_at ASC LIMIT 200`,[notice_id]);
      return json(res,200,{ followups:r.rows });
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      if(!isUuid(b.notice_id)) return json(res,400,{error:'invalid_notice_id'});
      if(!b.message || b.message.length<5) return json(res,400,{error:'invalid_message'});
      const n=await pool.query(`SELECT id FROM emp_absence_notices WHERE id=$1`,[b.notice_id]);
      if(!n.rows.length) return json(res,404,{error:'notice_not_found'});
      const r=await pool.query(`INSERT INTO emp_absence_followups (notice_id, message, status, created_by, created_by_id, created_by_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,[b.notice_id,b.message,b.status||null,sess.identityId||sess.id,sess.identityId||sess.id,b.created_by_name||'RH']);
      // atualiza status do aviso se informado
      if(b.status){
        await pool.query(`UPDATE emp_absence_notices SET status=$2, updated_at=NOW() WHERE id=$1`,[b.notice_id,b.status]);
      }
      return json(res,201,{ followup:r.rows[0] });
    }
    return json(res,405,{error:'method_not_allowed'});
  }

  return {
    handleShiftAssignments,
    handleScheduleVersions,
    handleScheduleEntries,
    handleJourneyProofs,
    handleJourneyCorrections,
    handleAbsenceNotices,
    handleAbsenceFollowups,
  };
}
