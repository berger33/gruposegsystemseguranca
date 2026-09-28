const CATEGORIES=['negocio','infra','seguranca','operacao','comercial','financeiro','rh','outro'];
const FLAG_STATUS=['ativo','inativo','em_teste','depreciado'];
const MAINT_STATUS=['agendado','em_execucao','concluido','cancelado','falha'];
const ROLLOUT_STATUS=['rascunho','aprovado','em_rollout','concluido','revertido','falha'];
const ENVS=['all','development','homologation','production'];

const ALLOWED_MAINT_TRANS={
  agendado:['em_execucao','cancelado'],
  em_execucao:['concluido','falha'],
  concluido:[],
  cancelado:[],
  falha:['agendado'],
};
const ALLOWED_ROLLOUT_TRANS={
  rascunho:['aprovado','falha'],
  aprovado:['em_rollout','revertido','falha'],
  em_rollout:['concluido','revertido','falha'],
  concluido:['revertido'],
  revertido:['rascunho'],
  falha:['rascunho'],
};

function sanitize(v,max=2000){ if(typeof v!=='string') return ''; return v.trim().slice(0,max); }
function uuidRe(){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; }

export function createConfigApi({ pool, auditLog, sameOrigin, requireSession, requireRole }){
  async function handleFlags(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const category=url.searchParams.get('category'); const status=url.searchParams.get('status'); const env=url.searchParams.get('environment'); const business=url.searchParams.get('is_business');
      const cond=[]; const params=[]; let i=1;
      if(category && CATEGORIES.includes(category)){ cond.push(`category=$${i++}`); params.push(category); }
      if(status && FLAG_STATUS.includes(status)){ cond.push(`status=$${i++}`); params.push(status); }
      if(env && ENVS.includes(env)){ cond.push(`environment=$${i++}`); params.push(env); }
      if(business==='true'){ cond.push(`is_business=true`); } else if(business==='false'){ cond.push(`is_business=false`); }
      let sql='SELECT id, key, category, status, value, default_value, description, is_secret, is_business, environment, rollout_percentage, allowed_roles, created_by, created_at, updated_at FROM config_flags';
      if(cond.length) sql+=' WHERE '+cond.join(' AND ');
      sql+=' ORDER BY category, key LIMIT 200';
      const r=await pool.query(sql, params);
      // mask secrets
      const masked=r.rows.map(row=> row.is_secret? {...row, value: { masked: true }}: row);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({flags:masked})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const key=sanitize(data.key,200).toLowerCase().replace(/\s+/g,'_');
      const category=String(data.category||'negocio').toLowerCase();
      const status=String(data.status||'ativo').toLowerCase();
      const description=sanitize(data.description,2000);
      const environment=String(data.environment||'all').toLowerCase();
      const is_secret=Boolean(data.is_secret);
      const is_business=data.is_business!=null? Boolean(data.is_business): true;
      const rollout_percentage=data.rollout_percentage!=null? parseInt(data.rollout_percentage,10): 100;
      let value=data.value; if(value==null) value={};
      if(typeof value!=='object'){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'value_must_be_object'})); return; }
      if(!key || key.length<3){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'key_min_3'})); return; }
      if(!CATEGORIES.includes(category)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_category'})); return; }
      if(!FLAG_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      if(description.length<10){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'description_min_10'})); return; }
      if(!ENVS.includes(environment)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_env'})); return; }
      if(!Number.isFinite(rollout_percentage)||rollout_percentage<0||rollout_percentage>100){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_rollout_percentage'})); return; }
      if(is_secret && is_business){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'secret_cannot_be_business'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO config_flags (key, category, status, value, default_value, description, is_secret, is_business, environment, rollout_percentage, created_by, created_by_id, updated_by, updated_by_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$11,$12)
        ON CONFLICT (key, environment) DO UPDATE SET category=EXCLUDED.category, status=EXCLUDED.status, value=EXCLUDED.value, description=EXCLUDED.description, is_secret=EXCLUDED.is_secret, is_business=EXCLUDED.is_business, rollout_percentage=EXCLUDED.rollout_percentage, updated_by=EXCLUDED.updated_by, updated_by_id=EXCLUDED.updated_by_id, updated_at=now()
        RETURNING id, key, category, status, value, description, is_secret, is_business, environment, rollout_percentage`, [key, category, status, JSON.stringify(value), JSON.stringify(value), description, is_secret, is_business, environment, rollout_percentage, by, byId]);
      await pool.query(`INSERT INTO config_history (flag_id, previous_value, next_value, previous_status, next_status, reason, changed_by, changed_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [r.rows[0].id, null, JSON.stringify(value), null, status, 'Criação/atualização flag', by, byId]);
      await auditLog({ action:'config_flag_create', actor: by, target: r.rows[0].id, meta:{ key } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({flag:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleFlagById(req,res,id){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
    const cur=await pool.query('SELECT * FROM config_flags WHERE id=$1',[id]);
    if(!cur.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
    if(req.method==='GET'){
      const hist=await pool.query('SELECT * FROM config_history WHERE flag_id=$1 ORDER BY created_at DESC LIMIT 100',[id]);
      const row=cur.rows[0];
      const out=row.is_secret? {...row, value:{masked:true}}: row;
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({flag:out, history:hist.rows})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const next_status=data.status? String(data.status).toLowerCase(): null;
      const next_value=data.value;
      const reason=sanitize(data.reason||'',1000);
      const rollout_percentage=data.rollout_percentage!=null? parseInt(data.rollout_percentage,10): undefined;
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      if(next_status && !FLAG_STATUS.includes(next_status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      if(next_value!=null && typeof next_value!=='object'){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'value_must_be_object'})); return; }
      if(rollout_percentage!=null && (!Number.isFinite(rollout_percentage)||rollout_percentage<0||rollout_percentage>100)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_rollout_percentage'})); return; }
      const prev=cur.rows[0];
      const fields=[]; const vals=[]; let idx=1;
      if(next_value!=null){ fields.push(`value=$${idx++}`); vals.push(JSON.stringify(next_value)); }
      if(next_status){ fields.push(`status=$${idx++}`); vals.push(next_status); }
      if(rollout_percentage!=null){ fields.push(`rollout_percentage=$${idx++}`); vals.push(rollout_percentage); }
      fields.push(`updated_by=$${idx++}`); vals.push(by);
      fields.push(`updated_by_id=$${idx++}`); vals.push(byId);
      fields.push(`updated_at=now()`);
      if(fields.length<=2){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'no_changes'})); return; }
      vals.push(id);
      const r=await pool.query(`UPDATE config_flags SET ${fields.join(', ')} WHERE id=$${idx} RETURNING *`, vals);
      await pool.query(`INSERT INTO config_history (flag_id, previous_value, next_value, previous_status, next_status, reason, changed_by, changed_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, JSON.stringify(prev.value), JSON.stringify(next_value!=null? next_value: prev.value), prev.status, next_status||prev.status, reason||null, by, byId]);
      await auditLog({ action:'config_flag_update', actor: by, target: id, meta:{ key: prev.key } });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({flag:r.rows[0]})); return;
    }
    if(req.method==='POST'){ // rollback
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const history_id=String(data.history_id||'');
      const reason=sanitize(data.reason||'',1000);
      if(!uuidRe().test(history_id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_history_id'})); return; }
      const hist=await pool.query('SELECT * FROM config_history WHERE id=$1 AND flag_id=$2',[history_id, id]);
      if(!hist.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'history_not_found'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const targetValue=hist.rows[0].previous_value || hist.rows[0].next_value;
      const targetStatus=hist.rows[0].previous_status || hist.rows[0].next_status;
      const r=await pool.query(`UPDATE config_flags SET value=$1, status=$2, updated_by=$3, updated_by_id=$4, updated_at=now() WHERE id=$5 RETURNING *`, [JSON.stringify(targetValue), targetStatus, by, byId, id]);
      await pool.query(`INSERT INTO config_history (flag_id, previous_value, next_value, previous_status, next_status, reason, changed_by, changed_by_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, JSON.stringify(cur.rows[0].value), JSON.stringify(targetValue), cur.rows[0].status, targetStatus, reason||'Rollback', by, byId]);
      await auditLog({ action:'config_flag_rollback', actor: by, target: id, meta:{ history_id } });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({flag:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleMaintenance(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='GET'){
      const r=await pool.query('SELECT * FROM maintenance_windows ORDER BY scheduled_start DESC LIMIT 100');
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({maintenances:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const title=sanitize(data.title,200); const description=sanitize(data.description,2000);
      const scheduled_start=data.scheduled_start? String(data.scheduled_start): null;
      const scheduled_end=data.scheduled_end? String(data.scheduled_end): null;
      const affected_services=Array.isArray(data.affected_services)? data.affected_services.map((s)=>sanitize(String(s),100)).filter(Boolean).slice(0,20): [];
      const is_business_impact=Boolean(data.is_business_impact);
      const rollback_plan=sanitize(data.rollback_plan||'',2000);
      if(title.length<10){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'title_min_10'})); return; }
      if(description.length<20){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'description_min_20'})); return; }
      if(!scheduled_start||!scheduled_end){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'schedule_required'})); return; }
      const start=new Date(scheduled_start); const end=new Date(scheduled_end);
      if(isNaN(start.getTime())||isNaN(end.getTime())||end<=start){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_schedule'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO maintenance_windows (title, description, scheduled_start, scheduled_end, affected_services, is_business_impact, rollback_plan, created_by, created_by_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [title, description, start.toISOString(), end.toISOString(), affected_services, is_business_impact, rollback_plan||null, by, byId]);
      await auditLog({ action:'maintenance_create', actor: by, target: r.rows[0].id });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({maintenance:r.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const next_status=String(data.next_status||data.status||'').toLowerCase();
      const reason=sanitize(data.reason||'',1000);
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(!MAINT_STATUS.includes(next_status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      const cur=await pool.query('SELECT * FROM maintenance_windows WHERE id=$1',[id]);
      if(!cur.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      const prev=cur.rows[0].status;
      if(prev!==next_status){
        const allowed=ALLOWED_MAINT_TRANS[prev]||[];
        if(!allowed.includes(next_status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_transition', allowed})); return; }
      }
      const by=sess.username||sess.user||'unknown';
      let sql=`UPDATE maintenance_windows SET status=$1, updated_at=now()`;
      const params=[next_status]; let idx=2;
      if(next_status==='em_execucao'){ sql+=`, actual_start=COALESCE(actual_start, now())`; }
      if(next_status==='concluido'||next_status==='falha'){ sql+=`, actual_end=now()`; }
      sql+=` WHERE id=$${idx} RETURNING *`; params.push(id);
      const r=await pool.query(sql, params);
      await auditLog({ action:'maintenance_update', actor: by, target: id, meta:{ previous: prev, next: next_status, reason } });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({maintenance:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleRollouts(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='GET'){
      const r=await pool.query('SELECT * FROM rollout_plans ORDER BY created_at DESC LIMIT 100');
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({rollouts:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const flag_id=data.flag_id? String(data.flag_id): null;
      const title=sanitize(data.title,200); const description=sanitize(data.description,2000);
      const target_percentage=data.target_percentage!=null? parseInt(data.target_percentage,10): 100;
      const steps=Array.isArray(data.steps)? data.steps: [];
      if(flag_id && !uuidRe().test(flag_id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_flag_id'})); return; }
      if(title.length<10){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'title_min_10'})); return; }
      if(description.length<20){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'description_min_20'})); return; }
      if(!Number.isFinite(target_percentage)||target_percentage<0||target_percentage>100){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_target_percentage'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO rollout_plans (flag_id, title, description, target_percentage, steps, created_by, created_by_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [flag_id, title, description, target_percentage, JSON.stringify(steps), by, byId]);
      await auditLog({ action:'rollout_create', actor: by, target: r.rows[0].id });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({rollout:r.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const next_status=String(data.next_status||data.status||'').toLowerCase();
      const current_percentage=data.current_percentage!=null? parseInt(data.current_percentage,10): undefined;
      const reason=sanitize(data.reason||'',1000);
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(!ROLLOUT_STATUS.includes(next_status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      const cur=await pool.query('SELECT * FROM rollout_plans WHERE id=$1',[id]);
      if(!cur.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      const prev=cur.rows[0].status;
      if(prev!==next_status){
        const allowed=ALLOWED_ROLLOUT_TRANS[prev]||[];
        if(!allowed.includes(next_status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_transition', allowed})); return; }
      }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      let sql=`UPDATE rollout_plans SET status=$1, updated_at=now()`; const params=[next_status]; let idx=2;
      if(current_percentage!=null){ if(!Number.isFinite(current_percentage)||current_percentage<0||current_percentage>100){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_current_percentage'})); return; } sql+=`, current_percentage=$${idx++}`; params.push(current_percentage); }
      if(next_status==='aprovado'){ sql+=`, approved_by=$${idx++}, approved_by_id=$${idx++}, approved_at=now()`; params.push(by, byId); }
      if(next_status==='em_rollout'){ sql+=`, started_at=COALESCE(started_at, now())`; }
      if(next_status==='concluido'||next_status==='revertido'||next_status==='falha'){ sql+=`, finished_at=now()`; }
      if(next_status==='revertido' && cur.rows[0].flag_id){
        // rollback flag to previous history if available
        const hist=await pool.query('SELECT * FROM config_history WHERE flag_id=$1 ORDER BY created_at DESC LIMIT 1', [cur.rows[0].flag_id]);
        if(hist.rows.length){
          const prevVal=hist.rows[0].previous_value;
          if(prevVal) await pool.query('UPDATE config_flags SET value=$1, updated_at=now() WHERE id=$2', [JSON.stringify(prevVal), cur.rows[0].flag_id]);
        }
      }
      sql+=` WHERE id=$${idx} RETURNING *`; params.push(id);
      const r=await pool.query(sql, params);
      const actionMap={ aprovado:'rollout_approve', em_rollout:'rollout_execute', revertido:'rollout_rollback' };
      await auditLog({ action: actionMap[next_status]||'rollout_execute', actor: by, target: id, meta:{ previous: prev, next: next_status, reason } });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({rollout:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  return { handleFlags, handleFlagById, handleMaintenance, handleRollouts };
}
