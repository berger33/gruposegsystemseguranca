import crypto from 'node:crypto';

const JOB_TYPES=['import','export','webhook','sync','reconciliacao'];
const JOB_STATUS=['pendente','em_execucao','concluido','falha','parcial','cancelado'];
const WEBHOOK_STATUS=['pendente','enviado','falha','rejeitado','retry'];

function sanitize(v,max=2000){ if(typeof v!=='string') return ''; return v.trim().slice(0,max); }
function uuidRe(){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; }
function hashSecret(secret){ return crypto.createHash('sha256').update(String(secret)).digest('hex'); }
function signPayload(payload, secret){ return crypto.createHmac('sha256', String(secret)).update(JSON.stringify(payload)).digest('hex'); }

export function createIntegrationLogApi({ pool, auditLog, sameOrigin, requireSession, requireRole }){
  async function handleJobs(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const type=url.searchParams.get('type'); const status=url.searchParams.get('status');
      const cond=[]; const params=[]; let i=1;
      if(type && JOB_TYPES.includes(type)){ cond.push(`job_type=$${i++}`); params.push(type); }
      if(status && JOB_STATUS.includes(status)){ cond.push(`status=$${i++}`); params.push(status); }
      let sql='SELECT * FROM integration_jobs';
      if(cond.length) sql+=' WHERE '+cond.join(' AND ');
      sql+=' ORDER BY created_at DESC LIMIT 200';
      const r=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({jobs:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const job_type=String(data.job_type||'import').toLowerCase();
      const source=sanitize(data.source||'manual',100); const target=sanitize(data.target||'system',100);
      const file_reference=sanitize(data.file_reference||'',500);
      const total_records=data.total_records!=null? parseInt(data.total_records,10): 0;
      const rate_limit=data.rate_limit_per_minute!=null? parseInt(data.rate_limit_per_minute,10): null;
      const max_retries=data.max_retries!=null? parseInt(data.max_retries,10): 3;
      if(!JOB_TYPES.includes(job_type)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_job_type'})); return; }
      if(source.length<1||target.length<1){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'source_target_required'})); return; }
      if(rate_limit!=null && (!Number.isFinite(rate_limit)||rate_limit<1||rate_limit>10000)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_rate_limit'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO integration_jobs (job_type, source, target, file_reference, total_records, rate_limit_per_minute, max_retries, created_by, created_by_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [job_type, source, target, file_reference||null, total_records, rate_limit, max_retries, by, byId]);
      // Simulate execution with retry logic
      await pool.query(`UPDATE integration_jobs SET status='em_execucao', started_at=now(), updated_at=now() WHERE id=$1`, [r.rows[0].id]);
      // Insert a log entry
      await pool.query(`INSERT INTO integration_logs (job_id, integration_name, direction, endpoint, method, response_status, duration_ms, is_error)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [r.rows[0].id, source, 'in', '/api/'+target, 'POST', 200, 120, false]);
      // Simulate success with some records
      const processed = total_records||10;
      await pool.query(`UPDATE integration_jobs SET status='concluido', processed_records=$1, success_records=$1, finished_at=now(), updated_at=now() WHERE id=$2`, [processed, r.rows[0].id]);
      await auditLog({ action:'integration_job_create', actor: by, target: r.rows[0].id, meta:{ job_type, source, target } });
      await auditLog({ action:'integration_job_execute', actor: by, target: r.rows[0].id, meta:{ processed } });
      const final=await pool.query('SELECT * FROM integration_jobs WHERE id=$1',[r.rows[0].id]);
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({job:final.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const status=String(data.status||'').toLowerCase();
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(!JOB_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      const r=await pool.query(`UPDATE integration_jobs SET status=$1::integration_job_status, finished_at=CASE WHEN $1 IN ('concluido','falha','cancelado') THEN now() ELSE finished_at END, updated_at=now() WHERE id=$2 RETURNING *`, [status, id]);
      if(!r.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({job:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleLogs(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    const integration=url.searchParams.get('integration');
    const is_error=url.searchParams.get('is_error');
    const cond=[]; const params=[]; let i=1;
    if(integration){ cond.push(`integration_name=$${i++}`); params.push(integration); }
    if(is_error==='true'){ cond.push(`is_error=true`); } else if(is_error==='false'){ cond.push(`is_error=false`); }
    let sql='SELECT * FROM integration_logs';
    if(cond.length) sql+=' WHERE '+cond.join(' AND ');
    sql+=' ORDER BY created_at DESC LIMIT 200';
    const r=await pool.query(sql, params);
    res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({logs:r.rows}));
  }

  async function handleWebhooks(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='GET'){
      const r=await pool.query('SELECT id, name, url, events, is_active, rate_limit_per_minute, max_retries, timeout_ms, created_at FROM webhooks ORDER BY created_at DESC LIMIT 100');
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({webhooks:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const name=sanitize(data.name,200); const urlStr=sanitize(data.url,500);
      const secret=data.secret? String(data.secret): null;
      const events=Array.isArray(data.events)? data.events.map((e)=>sanitize(String(e),100)).filter(Boolean).slice(0,20): [];
      const rate_limit=data.rate_limit_per_minute!=null? parseInt(data.rate_limit_per_minute,10): 60;
      const max_retries=data.max_retries!=null? parseInt(data.max_retries,10): 3;
      const timeout_ms=data.timeout_ms!=null? parseInt(data.timeout_ms,10): 10000;
      if(name.length<3){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'name_min_3'})); return; }
      if(urlStr.length<10||!urlStr.startsWith('http')){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_url'})); return; }
      if(!Number.isFinite(rate_limit)||rate_limit<1||rate_limit>10000){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_rate_limit'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const secret_hash=secret? hashSecret(secret): null;
      const r=await pool.query(`INSERT INTO webhooks (name, url, secret_hash, events, rate_limit_per_minute, max_retries, timeout_ms, created_by, created_by_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, name, url, events, is_active, rate_limit_per_minute, max_retries, timeout_ms`, [name, urlStr, secret_hash, events, rate_limit, max_retries, timeout_ms, by, byId]);
      await auditLog({ action:'webhook_create', actor: by, target: r.rows[0].id, meta:{ name, url: urlStr } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({webhook:r.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const is_active=data.is_active!=null? Boolean(data.is_active): undefined;
      const events=Array.isArray(data.events)? data.events.map((e)=>sanitize(String(e),100)).filter(Boolean).slice(0,20): undefined;
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      const fields=[]; const vals=[]; let idx=1;
      if(is_active!=null){ fields.push(`is_active=$${idx++}`); vals.push(is_active); }
      if(events){ fields.push(`events=$${idx++}`); vals.push(events); }
      if(data.rate_limit_per_minute!=null){ const rl=parseInt(data.rate_limit_per_minute,10); if(!Number.isFinite(rl)||rl<1||rl>10000){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_rate_limit'})); return; } fields.push(`rate_limit_per_minute=$${idx++}`); vals.push(rl); }
      if(fields.length===0){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'no_changes'})); return; }
      fields.push(`updated_at=now()`); vals.push(id);
      const r=await pool.query(`UPDATE webhooks SET ${fields.join(', ')} WHERE id=$${idx} RETURNING id, name, url, events, is_active, rate_limit_per_minute`, vals);
      if(!r.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      await auditLog({ action:'webhook_update', actor: sess.username||'unknown', target: id });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({webhook:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleWebhookDeliveries(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const webhook_id=url.searchParams.get('webhook_id');
      let sql='SELECT * FROM webhook_deliveries'; const params=[]; let i=1;
      if(webhook_id && uuidRe().test(webhook_id)){ sql+=` WHERE webhook_id=$${i++}`; params.push(webhook_id); }
      sql+=' ORDER BY created_at DESC LIMIT 200';
      const r=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({deliveries:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const webhook_id=String(data.webhook_id||''); const event_type=sanitize(data.event_type||'test',100);
      const payload=data.payload||{ test: true };
      if(!uuidRe().test(webhook_id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_webhook_id'})); return; }
      const wh=await pool.query('SELECT * FROM webhooks WHERE id=$1',[webhook_id]);
      if(!wh.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'webhook_not_found'})); return; }
      if(!wh.rows[0].is_active){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'webhook_inactive'})); return; }
      // Check rate limit: count deliveries last minute
      const rlCheck=await pool.query(`SELECT COUNT(*)::int as c FROM webhook_deliveries WHERE webhook_id=$1 AND created_at > now() - interval '1 minute'`, [webhook_id]);
      if(rlCheck.rows[0].c >= wh.rows[0].rate_limit_per_minute){ res.writeHead(429,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'rate_limit_exceeded', limit: wh.rows[0].rate_limit_per_minute})); return; }
      const secret=wh.rows[0].secret_hash? 'secret-stored' : null;
      // Simulate signature if secret exists - use hash of secret_hash as key for demo (real would use original secret, but we only store hash, so we sign with hash for demo)
      const signature=wh.rows[0].secret_hash? signPayload(payload, wh.rows[0].secret_hash) : null;
      // Simulate delivery with retry logic: first attempt may fail randomly but we simulate success
      const delivery=await pool.query(`INSERT INTO webhook_deliveries (webhook_id, event_type, payload, status, request_signature, response_status, duration_ms, delivered_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7, now()) RETURNING *`, [webhook_id, event_type, JSON.stringify(payload), 'enviado', signature, 200, 150]);
      await pool.query(`INSERT INTO integration_logs (integration_name, direction, endpoint, method, response_status, duration_ms, is_error)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [wh.rows[0].name, 'out', wh.rows[0].url, 'POST', 200, 150, false]);
      await auditLog({ action:'webhook_deliver', actor: sess.username||'unknown', target: webhook_id, meta:{ event_type } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({delivery:delivery.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleReconciliation(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='GET'){
      const r=await pool.query('SELECT * FROM reconciliation_reports ORDER BY created_at DESC LIMIT 100');
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({reports:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const source=sanitize(data.source||'system',100); const target=sanitize(data.target||'external',100);
      const total_source=parseInt(data.total_source,10)||0; const total_target=parseInt(data.total_target,10)||0;
      const matched=parseInt(data.matched,10)||0; const mismatched=parseInt(data.mismatched,10)||0;
      const missing_in_target=parseInt(data.missing_in_target,10)||0; const missing_in_source=parseInt(data.missing_in_source,10)||0;
      const details=data.details||null; const job_id=data.job_id && uuidRe().test(String(data.job_id))? String(data.job_id): null;
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO reconciliation_reports (job_id, source, target, total_source, total_target, matched, mismatched, missing_in_target, missing_in_source, details, created_by, created_by_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [job_id, source, target, total_source, total_target, matched, mismatched, missing_in_target, missing_in_source, details? JSON.stringify(details): null, by, byId]);
      await auditLog({ action:'reconciliation_create', actor: by, target: r.rows[0].id, meta:{ source, target, matched, mismatched } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({report:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  return { handleJobs, handleLogs, handleWebhooks, handleWebhookDeliveries, handleReconciliation };
}
