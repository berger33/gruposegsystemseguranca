const CATEGORIES=['configuracao','migracao','diagnostico','recuperacao','arquitetura','operacao','seguranca','outro'];
const STATUSES=['rascunho','em_revisao','aprovado','publicado','arquivado'];

function sanitize(v,max=20000){ if(typeof v!=='string') return ''; return v.trim().slice(0,max); }
function uuidRe(){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; }
function slugify(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,200); }

export function createMaintenanceDocApi({ pool, auditLog, sameOrigin, requireSession, requireRole }){
  async function handleDocs(req,res){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    const url=new URL(req.url,'http://localhost');
    const isPublic = url.pathname==='/api/docs' || url.pathname==='/api/maintenance/docs/public';
    if(!isPublic && !requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(req.method==='GET'){
      const category=url.searchParams.get('category'); const status=url.searchParams.get('status'); const published=url.searchParams.get('is_published');
      const cond=[]; const params=[]; let i=1;
      if(isPublic){ cond.push(`is_published=true`); }
      if(category && CATEGORIES.includes(category)){ cond.push(`category=$${i++}`); params.push(category); }
      if(status && STATUSES.includes(status)){ cond.push(`status=$${i++}`); params.push(status); }
      if(published==='true'){ cond.push(`is_published=true`); } else if(published==='false'){ cond.push(`is_published=false`); }
      let sql='SELECT * FROM maintenance_docs';
      if(cond.length) sql+=' WHERE '+cond.join(' AND ');
      sql+=' ORDER BY category, slug, version DESC LIMIT 200';
      const r=await pool.query(sql, params);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({docs:r.rows})); return;
    }
    if(req.method==='POST'){
      if(isPublic){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const category=String(data.category||'outro').toLowerCase(); const title=sanitize(data.title,200);
      const slugRaw=data.slug? sanitize(data.slug,200): slugify(title); const slug=slugify(slugRaw);
      const content=sanitize(data.content,20000); const tags=Array.isArray(data.tags)? data.tags.map((t)=>sanitize(String(t),50)).filter(Boolean).slice(0,20): [];
      if(!CATEGORIES.includes(category)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_category'})); return; }
      if(title.length<10){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'title_min_10'})); return; }
      if(content.length<50){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'content_min_50'})); return; }
      if(slug.length<3){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'slug_min_3'})); return; }
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      // Determine next version
      const verRes=await pool.query('SELECT COALESCE(MAX(version),0)+1 as next FROM maintenance_docs WHERE slug=$1',[slug]);
      const nextVer=verRes.rows[0].next;
      const r=await pool.query(`INSERT INTO maintenance_docs (category, title, slug, content, version, tags, created_by, created_by_id, updated_by, updated_by_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$7,$8) RETURNING *`, [category, title, slug, content, nextVer, tags, by, byId]);
      await pool.query(`INSERT INTO maintenance_doc_history (doc_id, previous_version, next_version, change_summary, changed_by, changed_by_id) VALUES ($1,$2,$3,$4,$5,$6)`, [r.rows[0].id, null, nextVer, 'Criação inicial', by, byId]);
      await auditLog({ action:'maintenance_doc_create', actor: by, target: r.rows[0].id, meta:{ slug, category } });
      res.writeHead(201,{'Content-Type':'application/json'}); res.end(JSON.stringify({doc:r.rows[0]})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  async function handleDocById(req,res,id){
    if(!sameOrigin(req)){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    const sess=await requireSession(req); if(!sess){ res.writeHead(401,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'unauthorized'})); return; }
    if(!requireRole(sess,['admin','ti'])){ res.writeHead(403,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'forbidden'})); return; }
    if(!uuidRe().test(id)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_id'})); return; }
    const cur=await pool.query('SELECT * FROM maintenance_docs WHERE id=$1',[id]);
    if(!cur.rows.length){ res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'not_found'})); return; }
    if(req.method==='GET'){
      const hist=await pool.query('SELECT * FROM maintenance_doc_history WHERE doc_id=$1 ORDER BY created_at DESC LIMIT 100',[id]);
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({doc:cur.rows[0], history:hist.rows})); return;
    }
    if(req.method==='PATCH'){
      let body=''; for await(const c of req) body+=c; let data; try{ data=JSON.parse(body||'{}'); }catch{ data={}; }
      const next_status=String(data.status||'').toLowerCase(); const content=data.content!=null? sanitize(data.content,20000): undefined;
      const title=data.title!=null? sanitize(data.title,200): undefined; const tags=Array.isArray(data.tags)? data.tags.map((t)=>sanitize(String(t),50)).filter(Boolean).slice(0,20): undefined;
      const change_summary=sanitize(data.change_summary||'',1000); const publish=Boolean(data.publish);
      const by=sess.username||sess.user||'unknown'; const byId=sess.userId||sess.id||null;
      if(next_status && !STATUSES.includes(next_status)){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'invalid_status'})); return; }
      if(title!=null && title.length<10){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'title_min_10'})); return; }
      if(content!=null && content.length<50){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'content_min_50'})); return; }
      // If content changed, create new version
      let newDoc=cur.rows[0];
      if(content!=null && content!==cur.rows[0].content){
        const nextVer=cur.rows[0].version+1;
        const r=await pool.query(`INSERT INTO maintenance_docs (category, status, title, slug, content, version, is_published, tags, created_by, created_by_id, updated_by, updated_by_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$9,$10) RETURNING *`,
          [cur.rows[0].category, next_status||cur.rows[0].status, title||cur.rows[0].title, cur.rows[0].slug, content, nextVer, publish||cur.rows[0].is_published, tags||cur.rows[0].tags, by, byId]);
        await pool.query(`INSERT INTO maintenance_doc_history (doc_id, previous_version, next_version, change_summary, changed_by, changed_by_id) VALUES ($1,$2,$3,$4,$5,$6)`, [r.rows[0].id, cur.rows[0].version, nextVer, change_summary||'Atualização conteúdo', by, byId]);
        newDoc=r.rows[0];
      } else {
        const fields=[]; const vals=[]; let idx=1;
        if(title!=null){ fields.push(`title=$${idx++}`); vals.push(title); }
        if(next_status){ fields.push(`status=$${idx++}`); vals.push(next_status); if(next_status==='publicado'){ fields.push(`is_published=true`); fields.push(`published_at=now()`); fields.push(`approved_by=$${idx++}`); vals.push(by); fields.push(`approved_by_id=$${idx++}`); vals.push(byId); fields.push(`approved_at=now()`); } }
        if(tags){ fields.push(`tags=$${idx++}`); vals.push(tags); }
        if(publish){ fields.push(`is_published=true`); fields.push(`published_at=now()`); }
        fields.push(`updated_by=$${idx++}`); vals.push(by);
        fields.push(`updated_by_id=$${idx++}`); vals.push(byId);
        fields.push(`updated_at=now()`); vals.push(id);
        if(fields.length<=2){ res.writeHead(400,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'no_changes'})); return; }
        const r=await pool.query(`UPDATE maintenance_docs SET ${fields.join(', ')} WHERE id=$${idx} RETURNING *`, vals);
        newDoc=r.rows[0];
      }
      const action = (next_status==='publicado' || publish) ? 'maintenance_doc_publish' : 'maintenance_doc_create';
      await auditLog({ action, actor: by, target: newDoc.id, meta:{ slug: newDoc.slug, status: newDoc.status } });
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify({doc:newDoc})); return;
    }
    res.writeHead(405,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:'method_not_allowed'}));
  }

  return { handleDocs, handleDocById };
}
