import crypto from 'node:crypto';

const EMP_STATUS=['em_admissao','ativo','afastado','suspenso','desligado','arquivado'];
const EMPLOYMENT_TYPES=['clt','terceirizado','temporario','estagio','pj','outro'];
const ADMISSION_STATUS=['pendente','em_andamento','concluida','cancelada','rejeitada'];

function sanitize(v,max=2000){ if(typeof v!=='string') return ''; return v.trim().slice(0,max); }
function uuidRe(){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; }
function hashCpf(cpf){ if(!cpf) return null; const digits=String(cpf).replace(/\D/g,''); if(digits.length!==11) return null; return crypto.createHash('sha256').update(digits).digest('hex'); }

export function createHrApi({ pool, auditLog, sameOrigin, requireSession, requireRole, employeeSessionStore }){
  async function handleEmployees(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const status=url.searchParams.get('status'); const cargo=url.searchParams.get('cargo'); const search=url.searchParams.get('search');
      const cond=[]; const params=[]; let i=1;
      if(status && EMP_STATUS.includes(status)){ cond.push(`status=$${i++}`); params.push(status); }
      if(cargo){ cond.push(`cargo ILIKE $${i++}`); params.push(`%${cargo}%`); }
      if(search){ cond.push(`(display_name ILIKE $${i} OR matricula ILIKE $${i} OR cargo ILIKE $${i})`); params.push(`%${search}%`); i++; }
      let sql='SELECT id, matricula, identity_id, display_name, status, employment_type, cargo, empregador, filial, lotacao, gestor_name, contact_email, admission_date, is_remuneracao_sensitive, created_at FROM hr_employees';
      if(cond.length) sql+=' WHERE '+cond.join(' AND ');
      sql+=' ORDER BY display_name LIMIT 200';
      const r=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({employees:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const matricula=sanitize(data.matricula,50); const display_name=sanitize(data.display_name,200);
      const cargo=sanitize(data.cargo,100); const employment_type=String(data.employment_type||'clt').toLowerCase();
      const status=String(data.status||'em_admissao').toLowerCase(); const empregador=sanitize(data.empregador||'',200);
      const filial=sanitize(data.filial||'',200); const lotacao=sanitize(data.lotacao||'',200);
      const gestor_id=data.gestor_id && uuidRe().test(String(data.gestor_id))? String(data.gestor_id): null;
      const gestor_name=sanitize(data.gestor_name||'',200); const contact_email=sanitize(data.contact_email||'',320);
      const contact_phone=sanitize(data.contact_phone||'',30); const city=sanitize(data.address_city||'',100);
      const state=sanitize(data.address_state||'',2); const notes=sanitize(data.notes||'',2000);
      const admission_date=data.admission_date? String(data.admission_date): null; const birth_date=data.birth_date? String(data.birth_date): null;
      const cpf_hash=data.cpf? hashCpf(data.cpf): null;
      const identity_id=data.identity_id && uuidRe().test(String(data.identity_id))? String(data.identity_id): null;
      if(matricula.length<1){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'matricula_required'})); return; }
      if(display_name.length<3){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'display_name_min_3'})); return; }
      if(cargo.length<2){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'cargo_required'})); return; }
      if(!EMPLOYMENT_TYPES.includes(employment_type)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_employment_type'})); return; }
      if(!EMP_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      try{
        const r=await pool.query(`INSERT INTO hr_employees (matricula, identity_id, display_name, cpf_hash, birth_date, admission_date, status, employment_type, cargo, empregador, filial, lotacao, gestor_id, gestor_name, contact_email, contact_phone, address_city, address_state, notes, created_by, created_by_id, updated_by, updated_by_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$20,$21) RETURNING id, matricula, display_name, cargo, status`, [matricula, identity_id, display_name, cpf_hash, birth_date? new Date(birth_date).toISOString().slice(0,10): null, admission_date? new Date(admission_date).toISOString().slice(0,10): null, status, employment_type, cargo, empregador||null, filial||null, lotacao||null, gestor_id, gestor_name||null, contact_email||null, contact_phone||null, city||null, state||null, notes||null, by, byId]);
        await pool.query(`INSERT INTO hr_employee_history (employee_id, next_cargo, next_lotacao, next_empregador, next_filial, next_status, effective_date, reason, changed_by, changed_by_id)
          VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE,$7,$8,$9)`, [r.rows[0].id, cargo, lotacao||null, empregador||null, filial||null, status, 'Admissão inicial', by, byId]);
        await auditLog({ action:'hr_employee_create', actor: by, target: r.rows[0].id, meta:{ matricula, cargo } });
        res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({employee:r.rows[0]})); return;
      }catch(e){
        if(String(e).includes('duplicate')||String(e).includes('unique')){ res.writeHead(409,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate_matricula'})); return; }
        throw e;
      }
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleEmployeeById(req,res,id){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
    const cur=await pool.query('SELECT * FROM hr_employees WHERE id=$1',[id]);
    if(!cur.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
    if(req.method==='GET'){
      const hist=await pool.query('SELECT * FROM hr_employee_history WHERE employee_id=$1 ORDER BY effective_date DESC LIMIT 100',[id]);
      const admissions=await pool.query('SELECT * FROM hr_admissions WHERE employee_id=$1 ORDER BY created_at DESC LIMIT 50',[id]);
      // Mask remuneracao if sensitive and not admin/ti
      const emp=cur.rows[0];
      const canSeeRemun = requireRole(sess,['admin','ti']);
      const out = canSeeRemun? emp : {...emp, remuneracao_atual: emp.is_remuneracao_sensitive? null : emp.remuneracao_atual };
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({employee:out, history:hist.rows, admissions:admissions.rows})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const next_cargo=data.cargo!=null? sanitize(data.cargo,100): undefined;
      const next_lotacao=data.lotacao!=null? sanitize(data.lotacao,200): undefined;
      const next_empregador=data.empregador!=null? sanitize(data.empregador,200): undefined;
      const next_filial=data.filial!=null? sanitize(data.filial,200): undefined;
      const next_status=data.status? String(data.status).toLowerCase(): undefined;
      const next_remuneracao=data.remuneracao_atual!=null? parseFloat(data.remuneracao_atual): undefined;
      if(next_remuneracao!==undefined && !requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'compensation_permission_required'})); return; }
      const effective_date=data.effective_date? String(data.effective_date): new Date().toISOString().slice(0,10);
      const reason=sanitize(data.reason||'',1000);
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      if(next_status && !EMP_STATUS.includes(next_status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      const prev=cur.rows[0];
      const fields=[]; const vals=[]; let idx=1;
      if(next_cargo!==undefined){ fields.push(`cargo=$${idx++}`); vals.push(next_cargo||prev.cargo); }
      if(next_lotacao!==undefined){ fields.push(`lotacao=$${idx++}`); vals.push(next_lotacao||null); }
      if(next_empregador!==undefined){ fields.push(`empregador=$${idx++}`); vals.push(next_empregador||null); }
      if(next_filial!==undefined){ fields.push(`filial=$${idx++}`); vals.push(next_filial||null); }
      if(next_status){ fields.push(`status=$${idx++}`); vals.push(next_status); }
      if(next_remuneracao!==undefined){ if(!Number.isFinite(next_remuneracao)||next_remuneracao<0){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_remuneracao'})); return; } fields.push(`remuneracao_atual=$${idx++}`); vals.push(next_remuneracao); }
      fields.push(`updated_by=$${idx++}`); vals.push(by);
      fields.push(`updated_by_id=$${idx++}`); vals.push(byId);
      fields.push(`updated_at=now()`); vals.push(id);
      if(fields.length<=2){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'no_changes'})); return; }
      const r=await pool.query(`UPDATE hr_employees SET ${fields.join(', ')} WHERE id=$${idx} RETURNING *`, vals);
      await pool.query(`INSERT INTO hr_employee_history (employee_id, previous_cargo, next_cargo, previous_lotacao, next_lotacao, previous_remuneracao, next_remuneracao, previous_empregador, next_empregador, previous_filial, next_filial, previous_status, next_status, effective_date, reason, changed_by, changed_by_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [id, prev.cargo, next_cargo||prev.cargo, prev.lotacao, next_lotacao!==undefined? next_lotacao: prev.lotacao, prev.remuneracao_atual, next_remuneracao!==undefined? next_remuneracao: prev.remuneracao_atual, prev.empregador, next_empregador!==undefined? next_empregador: prev.empregador, prev.filial, next_filial!==undefined? next_filial: prev.filial, prev.status, next_status||prev.status, effective_date, reason||null, by, byId]);
      const action = next_status && prev.status!==next_status? 'hr_employee_status_change' : 'hr_employee_update';
      // O trigger L03 revoga e avança o epoch em toda mudança para status bloqueado,
      // inclusive se a alteração vier de outro caminho administrativo.
      await auditLog({ action, actor: by, target: id, meta:{ previous_status: prev.status, next_status: next_status||prev.status } });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({employee:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleAdmissions(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='GET'){
      const status=new URL(req.url,'http://localhost').searchParams.get('status');
      let sql='SELECT * FROM hr_admissions'; const params=[]; let i=1;
      if(status && ADMISSION_STATUS.includes(status)){ sql+=` WHERE status=$${i++}`; params.push(status); }
      sql+=' ORDER BY created_at DESC LIMIT 200';
      const r=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({admissions:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const employee_id=String(data.employee_id||''); const cargo=String(data.cargo||'').toLowerCase();
      const responsible_name=sanitize(data.responsible_name||'',200); const notes=sanitize(data.notes||'',2000);
      if(!uuidRe().test(employee_id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_employee_id'})); return; }
      const emp=await pool.query('SELECT * FROM hr_employees WHERE id=$1',[employee_id]);
      if(!emp.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'employee_not_found'})); return; }
      // Find checklist for cargo
      let checklist_id=null;
      if(cargo){ const cl=await pool.query('SELECT id FROM hr_admission_checklists WHERE cargo=$1 AND is_active=true ORDER BY version DESC LIMIT 1',[cargo]); if(cl.rows.length) checklist_id=cl.rows[0].id; }
      else { const cl=await pool.query('SELECT id FROM hr_admission_checklists WHERE cargo=$1 AND is_active=true ORDER BY version DESC LIMIT 1',[emp.rows[0].cargo]); if(cl.rows.length) checklist_id=cl.rows[0].id; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO hr_admissions (employee_id, checklist_id, responsible_name, notes, created_by, created_by_id, started_at) VALUES ($1,$2,$3,$4,$5,$6, now()) RETURNING *`, [employee_id, checklist_id, responsible_name||null, notes||null, by, byId]);
      if(checklist_id){
        const items=await pool.query('SELECT id FROM hr_admission_items WHERE checklist_id=$1 ORDER BY order_index',[checklist_id]);
        for(const it of items.rows){
          await pool.query(`INSERT INTO hr_admission_progress (admission_id, item_id) VALUES ($1,$2) ON CONFLICT (admission_id, item_id) DO NOTHING`, [r.rows[0].id, it.id]);
        }
      }
      await auditLog({ action:'hr_admission_create', actor: by, target: r.rows[0].id, meta:{ employee_id, cargo: cargo||emp.rows[0].cargo } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({admission:r.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const status=String(data.status||'').toLowerCase();
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(!ADMISSION_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      const by=sess.username||sess.user||'unknown';
      let sql=`UPDATE hr_admissions SET status=$1, updated_at=now()`; const params=[status]; let idx=2;
      if(status==='concluida'){ sql+=`, completed_at=now()`; }
      sql+=` WHERE id=$${idx} RETURNING *`; params.push(id);
      const r=await pool.query(sql, params);
      if(!r.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      if(status==='concluida') await auditLog({ action:'hr_admission_complete', actor: by, target: id });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({admission:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleAdmissionById(req,res,id){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
    const adm=await pool.query('SELECT * FROM hr_admissions WHERE id=$1',[id]);
    if(!adm.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
    const progress=await pool.query(`SELECT p.*, i.title, i.category, i.is_required FROM hr_admission_progress p JOIN hr_admission_items i ON i.id=p.item_id WHERE p.admission_id=$1 ORDER BY i.order_index`, [id]);
    res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({admission:adm.rows[0], progress:progress.rows}));
  }

  async function handleAdmissionProgress(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const status=String(data.status||'').toLowerCase();
      const file_url=data.file_url? sanitize(data.file_url,1000): null; const rejection_reason=data.rejection_reason? sanitize(data.rejection_reason,1000): null;
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(!['pendente','em_analise','aprovado','rejeitado','nao_aplicavel'].includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      if(status==='rejeitado' && (!rejection_reason||rejection_reason.length<5)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'rejection_reason_required'})); return; }
      const by=sess.username||sess.user||'unknown';
      const r=await pool.query(`UPDATE hr_admission_progress SET status=$1, file_url=COALESCE($2, file_url), rejection_reason=$3, completed_at=CASE WHEN $1='aprovado' THEN now() ELSE completed_at END, completed_by=$4, updated_at=now() WHERE id=$5 RETURNING *`, [status, file_url, rejection_reason, by, id]);
      if(!r.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({progress:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  return { handleEmployees, handleEmployeeById, handleAdmissions, handleAdmissionById, handleAdmissionProgress };
}
