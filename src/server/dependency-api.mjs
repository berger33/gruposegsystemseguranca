const SEVERITIES=['info','low','moderate','high','critical'];
const AUDIT_STATUS=['pendente','em_analise','aprovado','rejeitado','corrigido'];
const UPDATE_TYPES=['major','minor','patch','security'];

function sanitize(v,max=2000){ if(typeof v!=='string') return ''; return v.trim().slice(0,max); }
function uuidRe(){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; }

export function createDependencyApi({ pool, auditLog, sameOrigin, requireSession, requireRole }){
  async function handleAudits(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='GET'){
      const r=await pool.query('SELECT * FROM dependency_audits ORDER BY audit_date DESC LIMIT 100');
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({audits:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const total=parseInt(data.total_dependencies,10)||0;
      const prod=parseInt(data.prod_dependencies,10)||0;
      const dev=parseInt(data.dev_dependencies,10)||0;
      const vInfo=parseInt(data.vulnerabilities_info,10)||0;
      const vLow=parseInt(data.vulnerabilities_low,10)||0;
      const vMod=parseInt(data.vulnerabilities_moderate,10)||0;
      const vHigh=parseInt(data.vulnerabilities_high,10)||0;
      const vCrit=parseInt(data.vulnerabilities_critical,10)||0;
      const outdated=parseInt(data.outdated_count,10)||0;
      const audit_raw=data.audit_raw||null;
      const notes=sanitize(data.notes||'',2000);
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`INSERT INTO dependency_audits (total_dependencies, prod_dependencies, dev_dependencies, vulnerabilities_info, vulnerabilities_low, vulnerabilities_moderate, vulnerabilities_high, vulnerabilities_critical, outdated_count, audit_raw, notes, created_by, created_by_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [total, prod, dev, vInfo, vLow, vMod, vHigh, vCrit, outdated, audit_raw? JSON.stringify(audit_raw): null, notes||null, by, byId]);
      await auditLog({ action:'dependency_audit_create', actor: by, target: r.rows[0].id, meta:{ total, prod, dev, vHigh, vCrit } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({audit:r.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const status=String(data.status||'').toLowerCase(); const notes=sanitize(data.notes||'',2000);
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(!AUDIT_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      const r=await pool.query(`UPDATE dependency_audits SET status=$1, reviewed_by=$2, reviewed_by_id=$3, reviewed_at=now(), notes=COALESCE($4, notes) WHERE id=$5 RETURNING *`, [status, by, byId, notes||null, id]);
      if(!r.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      await auditLog({ action:'dependency_audit_review', actor: by, target: id, meta:{ status } });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({audit:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleVulns(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'){
      const audit_id=url.searchParams.get('audit_id');
      let sql='SELECT * FROM dependency_vulnerabilities'; const params=[]; let i=1;
      if(audit_id && uuidRe().test(audit_id)){ sql+=` WHERE audit_id=$${i++}`; params.push(audit_id); }
      sql+=' ORDER BY CASE severity WHEN \'critical\' THEN 1 WHEN \'high\' THEN 2 WHEN \'moderate\' THEN 3 WHEN \'low\' THEN 4 ELSE 5 END, package_name LIMIT 200';
      const r=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({vulnerabilities:r.rows})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleUpdates(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='GET'){
      const r=await pool.query('SELECT * FROM dependency_updates ORDER BY created_at DESC LIMIT 200');
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({updates:r.rows})); return;
    }
    if(req.method==='POST'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const package_name=sanitize(data.package_name,200);
      const current_version=sanitize(data.current_version,100);
      const latest_version=sanitize(data.latest_version,100);
      const update_type=String(data.update_type||'patch').toLowerCase();
      const is_breaking=Boolean(data.is_breaking);
      const changelog_url=sanitize(data.changelog_url||'',500);
      const notes=sanitize(data.notes||'',1000);
      if(package_name.length<1){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'package_required'})); return; }
      if(current_version.length<1||latest_version.length<1){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'version_required'})); return; }
      if(!UPDATE_TYPES.includes(update_type)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_update_type'})); return; }
      const r=await pool.query(`INSERT INTO dependency_updates (package_name, current_version, latest_version, update_type, is_breaking, changelog_url, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [package_name, current_version, latest_version, update_type, is_breaking, changelog_url||null, notes||null]);
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({update:r.rows[0]})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const id=String(data.id||''); const status=String(data.status||'').toLowerCase(); const notes=sanitize(data.notes||'',1000);
      if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
      if(!AUDIT_STATUS.includes(status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      let sql=`UPDATE dependency_updates SET status=$1, updated_at=now()`; const params=[status]; let idx=2;
      if(status==='aprovado'){ sql+=`, approved_by=$${idx++}, approved_by_id=$${idx++}, approved_at=now()`; params.push(by, byId); }
      if(status==='corrigido'){ sql+=`, applied_at=now()`; }
      if(notes){ sql+=`, notes=$${idx++}`; params.push(notes); }
      sql+=` WHERE id=$${idx} RETURNING *`; params.push(id);
      const r=await pool.query(sql, params);
      if(!r.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
      const action = status==='aprovado'? 'dependency_update_approve' : 'dependency_update_apply';
      await auditLog({ action, actor: by, target: id, meta:{ package_name: r.rows[0].package_name, status } });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({update:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleLockfile(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    // Return lockfile info from package-lock if exists, else package.json
    try{
      const fs=await import('node:fs');
      const path=await import('node:path');
      const lockPath=path.join(process.cwd(),'package-lock.json');
      const pkgPath=path.join(process.cwd(),'package.json');
      let lockInfo=null; let pkgInfo=null;
      if(fs.existsSync(lockPath)){
        const raw=fs.readFileSync(lockPath,'utf-8');
        const j=JSON.parse(raw);
        lockInfo={ lockfileVersion: j.lockfileVersion, packagesCount: j.packages? Object.keys(j.packages).length: 0 };
      }
      if(fs.existsSync(pkgPath)){
        const raw=fs.readFileSync(pkgPath,'utf-8');
        const j=JSON.parse(raw);
        pkgInfo={ dependencies: Object.keys(j.dependencies||{}), devDependencies: Object.keys(j.devDependencies||{}), scripts: Object.keys(j.scripts||{}) };
      }
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({lockfile: lockInfo, package: pkgInfo})); return;
    }catch(e){
      res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'lockfile_read_failed'})); return;
    }
  }

  return { handleAudits, handleVulns, handleUpdates, handleLockfile };
}
