import crypto from 'node:crypto';

const CATEGORIES = ['identificacao','contato','localizacao','profissional','financeiro','tecnico','comportamental','sensivel','outro'];
const LEGAL_BASIS = ['consentimento','execucao_contrato','cumprimento_legal','legitimo_interesse','protecao_vida','tutela_saude','exercicio_direitos','protecao_credito','outro'];
const EXCEPTION_STATUSES = ['solicitado','em_analise','aprovado','rejeitado','expirado','revogado'];
const DISPOSAL_METHODS = ['exclusao_logica','exclusao_fisica','anonimizacao','arquivamento'];
const JOB_STATUSES = ['pendente','em_execucao','concluido','falha','parcial'];

const ALLOWED_EXCEPTION_TRANSITIONS = {
  solicitado: ['em_analise','rejeitado','aprovado'],
  em_analise: ['aprovado','rejeitado'],
  aprovado: ['expirado','revogado'],
  rejeitado: [],
  expirado: [],
  revogado: [],
};

function sanitizeText(v, max=2000){ if(typeof v!=='string') return ''; return v.trim().slice(0,max); }
function hashRef(v){ return crypto.createHash('sha256').update(String(v)).digest('hex').slice(0,32); }
function uuidRe(){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; }

export function createRetentionApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  async function handlePolicies(req, res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess = await requireSession(req);
    if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url = new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const category = url.searchParams.get('category');
      const active = url.searchParams.get('is_active');
      const q = ['SELECT * FROM data_retention_policies'];
      const cond=[]; const params=[]; let i=1;
      if(category && CATEGORIES.includes(category)){ cond.push(`category=$${i++}`); params.push(category); }
      if(active==='true'){ cond.push(`is_active=true`); } else if(active==='false'){ cond.push(`is_active=false`); }
      if(cond.length) q.push('WHERE '+cond.join(' AND '));
      q.push('ORDER BY category, field_pattern LIMIT 200');
      const r = await pool.query(q.join(' '), params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({policies:r.rows})); return;
    }
    if(req.method==='POST' || req.method==='PUT'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const category = String(data.category||'').toLowerCase();
      const field_pattern = sanitizeText(data.field_pattern||data.field||'*',200) || '*';
      const retention_days = parseInt(data.retention_days,10);
      const description = sanitizeText(data.description,2000);
      const legal_basis = String(data.legal_basis||'').toLowerCase();
      const legal_basis_detail = sanitizeText(data.legal_basis_detail||'',1000);
      const exceptional_allowed = Boolean(data.exceptional_retention_allowed);
      const max_exc = data.max_exception_days!=null? parseInt(data.max_exception_days,10): null;
      const disposal_method = String(data.disposal_method||'exclusao_logica').toLowerCase();
      if(!CATEGORIES.includes(category)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_category'})); return; }
      if(!Number.isFinite(retention_days)||retention_days<1||retention_days>36500){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_retention_days'})); return; }
      if(description.length<10){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'description_min_10'})); return; }
      if(!LEGAL_BASIS.includes(legal_basis)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_legal_basis'})); return; }
      if(!DISPOSAL_METHODS.includes(disposal_method)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_disposal_method'})); return; }
      if(max_exc!=null && (!Number.isFinite(max_exc)||max_exc<1||max_exc>36500)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_max_exception'})); return; }
      const by = sess.username || sess.user || 'unknown';
      const byId = sess.userId || sess.id || null;
      const r = await pool.query(`INSERT INTO data_retention_policies (category, field_pattern, retention_days, description, legal_basis, legal_basis_detail, exceptional_retention_allowed, max_exception_days, disposal_method, created_by, created_by_id, updated_by, updated_by_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$10,$11)
        ON CONFLICT (category, field_pattern) DO UPDATE SET retention_days=EXCLUDED.retention_days, description=EXCLUDED.description, legal_basis=EXCLUDED.legal_basis, legal_basis_detail=EXCLUDED.legal_basis_detail, exceptional_retention_allowed=EXCLUDED.exceptional_retention_allowed, max_exception_days=EXCLUDED.max_exception_days, disposal_method=EXCLUDED.disposal_method, updated_by=EXCLUDED.updated_by, updated_by_id=EXCLUDED.updated_by_id, updated_at=now()
        RETURNING *`, [category, field_pattern, retention_days, description, legal_basis, legal_basis_detail||null, exceptional_allowed, max_exc, disposal_method, by, byId]);
      await auditLog({ action: req.method==='POST'?'retention_policy_create':'retention_policy_update', actor: by, target: r.rows[0].id, meta: { category, field_pattern } });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({policy:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleExceptions(req, res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess = await requireSession(req);
    if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url = new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const status = url.searchParams.get('status');
      const category = url.searchParams.get('category');
      const cond=[]; const params=[]; let i=1;
      if(status && EXCEPTION_STATUSES.includes(status)){ cond.push(`status=$${i++}`); params.push(status); }
      if(category && CATEGORIES.includes(category)){ cond.push(`category=$${i++}`); params.push(category); }
      let sql='SELECT * FROM retention_exceptions';
      if(cond.length) sql+=' WHERE '+cond.join(' AND ');
      sql+=' ORDER BY created_at DESC LIMIT 200';
      const r = await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({exceptions:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const category = String(data.category||'').toLowerCase();
      const field_reference = sanitizeText(data.field_reference||data.field||'',200);
      const reason = sanitizeText(data.reason,1000);
      const justification = sanitizeText(data.justification,2000);
      const requested_days = parseInt(data.requested_retention_days,10);
      const policy_id = data.policy_id ? String(data.policy_id) : null;
      const expires_at = data.expires_at ? String(data.expires_at) : null;
      if(!CATEGORIES.includes(category)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_category'})); return; }
      if(field_reference.length<1){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'field_required'})); return; }
      if(reason.length<10){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'reason_min_10'})); return; }
      if(justification.length<10){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'justification_min_10'})); return; }
      if(!Number.isFinite(requested_days)||requested_days<1||requested_days>36500){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_requested_days'})); return; }
      if(policy_id && !uuidRe().test(policy_id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_policy_id'})); return; }
      let expDate=null;
      if(expires_at){ const d=new Date(expires_at); if(isNaN(d.getTime())){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_expires_at'})); return; } expDate=d.toISOString().slice(0,10); }
      else { const d=new Date(); d.setDate(d.getDate()+requested_days); expDate=d.toISOString().slice(0,10); }
      const by = sess.username || sess.user || 'unknown';
      const byId = sess.userId || sess.id || null;
      // check policy allows exceptional
      if(policy_id){
        const pr = await pool.query('SELECT exceptional_retention_allowed, max_exception_days FROM data_retention_policies WHERE id=$1', [policy_id]);
        if(pr.rows.length && !pr.rows[0].exceptional_retention_allowed){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'exceptional_not_allowed'})); return; }
        if(pr.rows.length && pr.rows[0].max_exception_days && requested_days>pr.rows[0].max_exception_days){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'exceeds_max_exception'})); return; }
      }
      const r = await pool.query(`INSERT INTO retention_exceptions (policy_id, category, field_reference, reason, justification, requested_retention_days, expires_at, requested_by, requested_by_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [policy_id, category, field_reference, reason, justification, requested_days, expDate, by, byId]);
      await auditLog({ action:'retention_exception_create', actor: by, target: r.rows[0].id, meta: { category, field_reference } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({exception:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleExceptionById(req, res, id){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess = await requireSession(req);
    if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
    const cur = await pool.query('SELECT * FROM retention_exceptions WHERE id=$1', [id]);
    if(!cur.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
    if(req.method==='GET'){
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({exception:cur.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const next_status = String(data.next_status||data.status||'').toLowerCase();
      const approved_days = data.approved_retention_days!=null? parseInt(data.approved_retention_days,10): null;
      const rejection_reason = sanitizeText(data.rejection_reason||'',1000);
      const by = sess.username || sess.user || 'unknown';
      const byId = sess.userId || sess.id || null;
      const prev = cur.rows[0].status;
      if(!EXCEPTION_STATUSES.includes(next_status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      if(prev!==next_status){
        const allowed = ALLOWED_EXCEPTION_TRANSITIONS[prev]||[];
        if(!allowed.includes(next_status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_transition', allowed})); return; }
      }
      if(next_status==='aprovado'){
        if(approved_days!=null && (!Number.isFinite(approved_days)||approved_days<1||approved_days>36500)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_approved_days'})); return; }
      }
      if(next_status==='rejeitado' && rejection_reason.length<10){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'rejection_reason_min_10'})); return; }
      const finalApproved = next_status==='aprovado' ? (approved_days || cur.rows[0].requested_retention_days) : cur.rows[0].approved_retention_days;
      const reviewedAt = (next_status==='aprovado'||next_status==='rejeitado') ? new Date().toISOString() : cur.rows[0].reviewed_at;
      const approvedBy = (next_status==='aprovado'||next_status==='rejeitado') ? by : cur.rows[0].approved_by;
      const approvedById = (next_status==='aprovado'||next_status==='rejeitado') ? byId : cur.rows[0].approved_by_id;
      const r = await pool.query(`UPDATE retention_exceptions SET status=$1, approved_retention_days=$2, rejection_reason=$3, reviewed_at=$4, approved_by=$5, approved_by_id=$6, updated_at=now() WHERE id=$7 RETURNING *`,
        [next_status, finalApproved, next_status==='rejeitado'?rejection_reason:null, reviewedAt, approvedBy, approvedById, id]);
      const actionMap = { aprovado:'retention_exception_approve', rejeitado:'retention_exception_reject', revogado:'retention_exception_revoke' };
      await auditLog({ action: actionMap[next_status]||'retention_exception_approve', actor: by, target: id, meta: { previous: prev, next: next_status } });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({exception:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleJobs(req, res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess = await requireSession(req);
    if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='GET'){
      const r = await pool.query('SELECT * FROM disposal_jobs ORDER BY created_at DESC LIMIT 100');
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({jobs:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const notes = sanitizeText(data.notes||'',2000);
      const by = sess.username || sess.user || 'unknown';
      const byId = sess.userId || sess.id || null;
      // Create job pendente then simulate execution scanning retention policies
      const jobIns = await pool.query(`INSERT INTO disposal_jobs (status, initiated_by, initiated_by_id, notes) VALUES ('pendente',$1,$2,$3) RETURNING *`, [by, byId, notes||null]);
      const jobId = jobIns.rows[0].id;
      await auditLog({ action:'disposal_job_create', actor: by, target: jobId });
      // Execute: count expired exceptions, count policies, and log disposal simulation
      try {
        await pool.query(`UPDATE disposal_jobs SET status='em_execucao', started_at=now(), updated_at=now() WHERE id=$1`, [jobId]);
        // Expire old exceptions
        await pool.query(`UPDATE retention_exceptions SET status='expirado', updated_at=now() WHERE status='aprovado' AND expires_at < CURRENT_DATE`);
        // Count policies active
        const pol = await pool.query(`SELECT COUNT(*)::int as c FROM data_retention_policies WHERE is_active=true`);
        const exc = await pool.query(`SELECT COUNT(*)::int as c FROM retention_exceptions WHERE status='aprovado' AND expires_at < CURRENT_DATE`);
        // Simulate scanning: for demo, we scan inventory + policies
        const scanned = pol.rows[0].c * 10; // synthetic
        const expired = exc.rows[0].c;
        // Create disposal_logs for expired exceptions as example of minimized history
        const expiredExcs = await pool.query(`SELECT * FROM retention_exceptions WHERE status='expirado' ORDER BY expires_at DESC LIMIT 20`);
        let disposed=0;
        for(const e of expiredExcs.rows){
          const refHash = hashRef(e.id+e.field_reference+Date.now());
          await pool.query(`INSERT INTO disposal_logs (job_id, category, field_reference, record_reference_hash, record_table, record_id, disposal_method, retention_days_applied, exception_id, details, verified_by, verified_by_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [jobId, e.category, e.field_reference, refHash, 'retention_exceptions', e.id, 'exclusao_logica', e.approved_retention_days||e.requested_retention_days, e.id, 'Exceção expirada descartada conforme política', by, byId]);
          disposed++;
        }
        // Also simulate disposal of old privacy inventory logs? For minimization, we keep only hash
        await pool.query(`UPDATE disposal_jobs SET status=$1, finished_at=now(), total_scanned=$2, total_expired=$3, total_disposed=$4, updated_at=now() WHERE id=$5`,
          [disposed>0?'concluido':'concluido', scanned, expired, disposed, jobId]);
        await auditLog({ action:'disposal_job_execute', actor: by, target: jobId, meta: { scanned, expired, disposed } });
        const finalJob = await pool.query('SELECT * FROM disposal_jobs WHERE id=$1', [jobId]);
        res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({job:finalJob.rows[0]})); return;
      } catch(e){
        await pool.query(`UPDATE disposal_jobs SET status='falha', finished_at=now(), error_details=$1, updated_at=now() WHERE id=$2`, [String(e).slice(0,5000), jobId]);
        res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'job_failed', jobId})); return;
      }
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleJobById(req, res, id){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess = await requireSession(req);
    if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
    const job = await pool.query('SELECT * FROM disposal_jobs WHERE id=$1', [id]);
    if(!job.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
    const logs = await pool.query('SELECT * FROM disposal_logs WHERE job_id=$1 ORDER BY disposed_at DESC LIMIT 100', [id]);
    res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({job:job.rows[0], logs:logs.rows}));
  }

  async function handleLogs(req, res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess = await requireSession(req);
    if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti','rh'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url = new URL(req.url,'http://localhost');
    const category = url.searchParams.get('category');
    const cond=[]; const params=[]; let i=1;
    if(category && CATEGORIES.includes(category)){ cond.push(`category=$${i++}`); params.push(category); }
    let sql='SELECT * FROM disposal_logs';
    if(cond.length) sql+=' WHERE '+cond.join(' AND ');
    sql+=' ORDER BY disposed_at DESC LIMIT 200';
    const r = await pool.query(sql, params);
    res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({logs:r.rows}));
  }

  return { handlePolicies, handleExceptions, handleExceptionById, handleJobs, handleJobById, handleLogs };
}
