const ENV_TYPES=['development','homologation','production','preview'];
const ISOLATION_STATUS=['isolado','compartilhado','em_verificacao','falha'];
const CHECK_TYPES=['real_data_scan','preview_data_check','isolation_verify','account_separation'];
const CHECK_STATUS=['pendente','passou','falhou','aviso'];

function sanitize(v,max=2000){ if(typeof v!=='string') return ''; return v.trim().slice(0,max); }
function uuidRe(){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; }

export function createEnvApi({ pool, auditLog, sameOrigin, requireSession, requireRole }){
  async function handleEnvs(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='GET'){
      const r=await pool.query('SELECT * FROM environments ORDER BY CASE env_type WHEN \'production\' THEN 1 WHEN \'homologation\' THEN 2 WHEN \'development\' THEN 3 ELSE 4 END, name LIMIT 100');
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({environments:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const name=sanitize(data.name,100); const env_type=String(data.env_type||'development').toLowerCase();
      const db_name=sanitize(data.db_name,100); const db_user=sanitize(data.db_user,100);
      const storage_bucket=sanitize(data.storage_bucket,200); const domain=sanitize(data.domain||'',200);
      const is_production=Boolean(data.is_production); const has_real_data=Boolean(data.has_real_data);
      const notes=sanitize(data.notes||'',2000);
      if(name.length<3){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'name_min_3'})); return; }
      if(!ENV_TYPES.includes(env_type)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_env_type'})); return; }
      if(db_name.length<3||db_user.length<3||storage_bucket.length<3){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'db_storage_required'})); return; }
      if(is_production && !has_real_data){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'production_must_have_real_data_flag'})); return; }
      if(!is_production && has_real_data){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'non_production_cannot_have_real_data'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      try{
        const r=await pool.query(`INSERT INTO environments (name, env_type, db_name, db_user, storage_bucket, domain, is_production, has_real_data, notes, created_by, created_by_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [name, env_type, db_name, db_user, storage_bucket, domain||null, is_production, has_real_data, notes||null, by, byId]);
        await auditLog({ action:'env_create', actor: by, target: r.rows[0].id, meta:{ env_type, is_production, has_real_data } });
        res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({environment:r.rows[0]})); return;
      }catch(e){
        if(String(e).includes('duplicate')||String(e).includes('unique')){ res.writeHead(409,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'duplicate_name_or_db'})); return; }
        throw e;
      }
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const status=String(data.status||'').toLowerCase();
      const notes=data.notes!=null? sanitize(data.notes,2000): undefined;
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(status && !ISOLATION_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const fields=[]; const vals=[]; let idx=1;
      if(status){ fields.push(`status=$${idx++}`); vals.push(status); if(status==='isolado'){ fields.push(`isolation_verified_at=now()`); fields.push(`isolation_verified_by=$${idx++}`); vals.push(by); } }
      if(notes!==undefined){ fields.push(`notes=$${idx++}`); vals.push(notes||null); }
      fields.push(`updated_at=now()`); vals.push(id);
      if(fields.length===1){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'no_changes'})); return; }
      const r=await pool.query(`UPDATE environments SET ${fields.join(', ')} WHERE id=$${idx} RETURNING *`, vals);
      if(!r.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      await auditLog({ action:'env_verify', actor: by, target: id, meta:{ status } });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({environment:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleChecks(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const env_id=url.searchParams.get('env_id');
      let sql='SELECT * FROM env_data_checks'; const params=[]; let i=1;
      if(env_id && uuidRe().test(env_id)){ sql+=` WHERE env_id=$${i++}`; params.push(env_id); }
      sql+=' ORDER BY checked_at DESC LIMIT 200';
      const r=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({checks:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const env_id=String(data.env_id||''); const check_type=String(data.check_type||'isolation_verify').toLowerCase();
      const status=String(data.status||'passou').toLowerCase(); const details=data.details||null;
      if(!uuidRe().test(env_id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_env_id'})); return; }
      if(!CHECK_TYPES.includes(check_type)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_check_type'})); return; }
      if(!CHECK_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      const env=await pool.query('SELECT * FROM environments WHERE id=$1',[env_id]);
      if(!env.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'env_not_found'})); return; }
      // Validation: preview must not have real data
      if(env.rows[0].env_type==='preview' && check_type==='preview_data_check'){
        if(env.rows[0].has_real_data){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'preview_has_real_data'})); return; }
      }
      if(env.rows[0].env_type!=='production' && check_type==='real_data_scan' && env.rows[0].has_real_data){
        res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'non_production_has_real_data'})); return;
      }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO env_data_checks (env_id, check_type, status, details, checked_by, checked_by_id)
        VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [env_id, check_type, status, details? JSON.stringify(details): null, by, byId]);
      // If isolation_verify passed, update env status
      if(check_type==='isolation_verify' && status==='passou'){
        await pool.query(`UPDATE environments SET status='isolado', isolation_verified_at=now(), isolation_verified_by=$1, updated_at=now() WHERE id=$2`, [by, env_id]);
      }
      await auditLog({ action:'env_check', actor: by, target: env_id, meta:{ check_type, status } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({check:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  return { handleEnvs, handleChecks };
}
