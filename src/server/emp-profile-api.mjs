const ALLOWED_EMP_FIELDS=['contact_email','contact_phone','address_city','address_state'];

function sanitize(v,max=2000){ if(typeof v!=='string') return ''; return v.trim().slice(0,max); }
function uuidRe(){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; }

function maskEmployeeData(emp, fieldConfigs){
  const masked={...emp};
  for(const cfg of fieldConfigs){
    if(cfg.is_masked_for_employee && masked.hasOwnProperty(cfg.field_name)){
      const pattern=cfg.mask_pattern||'***';
      if(cfg.field_name==='remuneracao_atual') masked[cfg.field_name]=null;
      else if(cfg.field_name==='cpf_hash') masked[cfg.field_name]=masked[cfg.field_name]? pattern : null;
      else if(cfg.sensitivity==='sigiloso' || cfg.sensitivity==='restrito'){
        if(typeof masked[cfg.field_name]==='string' && masked[cfg.field_name].length>0) masked[cfg.field_name]=pattern;
      }
    }
  }
  return masked;
}

export function createEmpProfileApi({ pool, auditLog, sameOrigin, requireSession, requireRole }){
  async function handleMyProfile(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    // Employee self or admin/rh/ti can view via identity link
    const identityId=sess.identityId||null;
    let employee=null;
    if(identityId){
      const r=await pool.query('SELECT * FROM hr_employees WHERE identity_id=$1 LIMIT 1',[identityId]);
      if(r.rows.length) employee=r.rows[0];
    }
    // If not linked, but admin/ti/rh querying own? allow lookup by employee_id param for admin
    if(!employee && requireRole(sess,['admin','ti','rh','marcelo'])){
      // allow query param employee_id for admin view masked as employee would see
      try{ const url=new URL(req.url,'http://localhost'); const eid=url.searchParams.get('employee_id'); if(eid && uuidRe().test(eid)){ const rr=await pool.query('SELECT * FROM hr_employees WHERE id=$1',[eid]); if(rr.rows.length) employee=rr.rows[0]; } }catch{}
    }
    if(!employee){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'employee_not_linked','note':'Profissional não vinculado à identidade de login. Vincule identity_id em hr_employees'})); return; }
    const fieldCfg=await pool.query('SELECT * FROM hr_profile_field_config ORDER BY field_name');
    if(req.method==='GET'){
      const masked=maskEmployeeData(employee, fieldCfg.rows);
      // Hide remuneracao unless admin/ti
      if(!requireRole(sess,['admin','ti'])) masked.remuneracao_atual=null;
      const reqs=await pool.query('SELECT * FROM hr_profile_update_requests WHERE employee_id=$1 ORDER BY created_at DESC LIMIT 50',[employee.id]);
      // Marcelo gets the RH workspace view, but the unmasked internal record
      // remains restricted to HR/TI/admin. Remuneration is always hidden here.
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({employee: masked, raw: requireRole(sess,['admin','ti','rh'])? employee: undefined, field_config: fieldCfg.rows, update_requests: reqs.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const changes=data.changes||{}; const justification=sanitize(data.justification||'',1000);
      if(typeof changes!=='object' || Array.isArray(changes)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_changes'})); return; }
      const keys=Object.keys(changes);
      if(keys.length===0){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'no_changes'})); return; }
      for(const k of keys){ if(!ALLOWED_EMP_FIELDS.includes(k)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'field_not_editable', field:k, allowed:ALLOWED_EMP_FIELDS})); return; } }
      // Validate values
      for(const k of keys){
        const v=sanitize(String(changes[k]||''),200);
        if(k==='contact_email' && v && !v.includes('@')){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_email'})); return; }
        changes[k]=v;
      }
      const snapshot={ matricula:employee.matricula, display_name:employee.display_name, cargo:employee.cargo, lotacao:employee.lotacao, empregador:employee.empregador, filial:employee.filial, contact_email:employee.contact_email, contact_phone:employee.contact_phone, address_city:employee.address_city, address_state:employee.address_state };
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||sess.identityId||null;
      const r=await pool.query(`INSERT INTO hr_profile_update_requests (employee_id, identity_id, requested_changes, current_snapshot, justification, created_by, created_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [employee.id, identityId, JSON.stringify(changes), JSON.stringify(snapshot), justification||null, by, byId]);
      await auditLog({ action:'profile_update_request', actor: by, target: r.rows[0].id, meta:{ employee_id:employee.id, fields:keys } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({request:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleUpdateRequests(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh','marcelo'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const status=url.searchParams.get('status'); const employee_id=url.searchParams.get('employee_id');
      const cond=[]; const params=[]; let i=1;
      if(status){ cond.push(`status=$${i++}`); params.push(status); }
      if(employee_id && uuidRe().test(employee_id)){ cond.push(`employee_id=$${i++}`); params.push(employee_id); }
      let sql='SELECT r.*, e.display_name as employee_name, e.matricula FROM hr_profile_update_requests r LEFT JOIN hr_employees e ON e.id=r.employee_id';
      if(cond.length) sql+=' WHERE '+cond.join(' AND ');
      sql+=' ORDER BY r.created_at DESC LIMIT 200';
      const rr=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({requests:rr.rows})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const action=String(data.action||'').toLowerCase(); const rejection_reason=data.rejection_reason? sanitize(data.rejection_reason,1000): null;
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(!['aprovar','rejeitar','em_analise','cancelar'].includes(action)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_action'})); return; }
      if(action==='rejeitar' && (!rejection_reason||rejection_reason.length<5)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'rejection_reason_required'})); return; }
      const cur=await pool.query('SELECT * FROM hr_profile_update_requests WHERE id=$1',[id]);
      if(!cur.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      const prev=cur.rows[0];
      if(prev.status!=='pendente' && prev.status!=='em_analise' && action!=='cancelar'){ res.writeHead(409,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'already_processed'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      let newStatus=prev.status;
      if(action==='aprovar') newStatus='aprovado';
      else if(action==='rejeitar') newStatus='rejeitado';
      else if(action==='em_analise') newStatus='em_analise';
      else if(action==='cancelar') newStatus='cancelado';

      if(newStatus==='aprovado'){
        // Apply changes to hr_employees
        const changes=typeof prev.requested_changes==='string'? JSON.parse(prev.requested_changes): prev.requested_changes;
        const fields=[]; const vals=[]; let idx=1;
        for(const k of Object.keys(changes)){
          if(ALLOWED_EMP_FIELDS.includes(k)){ fields.push(`${k}=$${idx++}`); vals.push(changes[k]||null); }
        }
        if(fields.length){
          fields.push(`updated_by=$${idx++}`); vals.push(by);
          fields.push(`updated_by_id=$${idx++}`); vals.push(byId);
          fields.push(`updated_at=now()`);
          vals.push(prev.employee_id);
          await pool.query(`UPDATE hr_employees SET ${fields.join(', ')} WHERE id=$${idx}`, vals);
          // History
          await pool.query(`INSERT INTO hr_employee_history (employee_id, next_cargo, next_lotacao, effective_date, reason, changed_by, changed_by_id) SELECT $1, cargo, lotacao, CURRENT_DATE, $2, $3, $4 FROM hr_employees WHERE id=$1`, [prev.employee_id, `Atualização cadastral aprovada via solicitação ${prev.id}`, by, byId]);
        }
      }
      const r=await pool.query(`UPDATE hr_profile_update_requests SET status=$1, reviewed_by=$2, reviewed_by_id=$3, reviewed_at=now(), rejection_reason=$4, updated_at=now() WHERE id=$5 RETURNING *`, [newStatus, by, byId, rejection_reason, id]);
      const auditAction=newStatus==='aprovado'? 'profile_update_approve' : newStatus==='rejeitado'? 'profile_update_reject' : 'profile_update_request';
      await auditLog({ action: auditAction, actor: by, target: id, meta:{ employee_id:prev.employee_id, newStatus, rejection_reason } });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({request:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  return { handleMyProfile, handleUpdateRequests };
}
