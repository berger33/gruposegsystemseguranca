export function createCmsApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const readJson = async (req) => { const chunks=[]; for await (const c of req) chunks.push(c); const raw=Buffer.concat(chunks).toString('utf8'); if(!raw) return {}; try{ return JSON.parse(raw);} catch{ return {}; } };

  const handleContents = async (req,res) => {
    const url = new URL(req.url,'http://localhost');
    const isPublic = url.pathname.startsWith('/api/cms') || url.pathname.startsWith('/api/public/cms');
    if(!isPublic && !sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess = !isPublic ? requireSession(req) : null;
    if(!isPublic && (!sess || !requireRole(sess,['admin','ti']))) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const content_type = url.searchParams.get('type');
      const status = url.searchParams.get('status');
      const search = url.searchParams.get('search');
      const publishedOnly = url.searchParams.get('published')==='true' || isPublic;
      let q = `SELECT * FROM cms_contents WHERE 1=1`;
      const params=[];
      if(publishedOnly){ q+=` AND is_published=true AND status='publicado'`; }
      if(content_type){ params.push(content_type); q+=` AND content_type=$${params.length}`; }
      if(status && !publishedOnly){ params.push(status); q+=` AND status=$${params.length}`; }
      if(search){ params.push(`%${search}%`); q+=` AND (title ILIKE $${params.length} OR slug ILIKE $${params.length} OR content ILIKE $${params.length})`; }
      q+=` ORDER BY content_type ASC, slug ASC, version DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows, note:'CMS páginas FAQ cases blog vagas rascunho/revisão/publicação histórico e reversão'});
    }
    if(req.method==='POST'){
      const b = await readJson(req);
      const slug = String(b.slug||'').trim().toLowerCase();
      const title = String(b.title||'').trim();
      const excerpt = b.excerpt?String(b.excerpt).trim():null;
      const content = String(b.content||'').trim();
      const content_type = String(b.content_type||'pagina').trim();
      const tags = b.tags||[];
      const metadata = b.metadata||{};
      const file_url = b.file_url?String(b.file_url).trim():null;
      const storage_key = b.storage_key?String(b.storage_key).trim():null;
      const seo_title = b.seo_title?String(b.seo_title).trim():null;
      const seo_description = b.seo_description?String(b.seo_description).trim():null;
      const is_authorized = !!b.is_authorized;
      if(slug.length<3||slug.length>200) return json(res,400,{error:'invalid_slug'});
      if(title.length<5||title.length>200) return json(res,400,{error:'invalid_title'});
      if(excerpt && (excerpt.length<10||excerpt.length>1000)) return json(res,400,{error:'invalid_excerpt'});
      if(content.length<50||content.length>20000) return json(res,400,{error:'invalid_content'});
      const validTypes=['pagina','faq','case','blog','vaga','outro'];
      if(!validTypes.includes(content_type)) return json(res,400,{error:'invalid_content_type'});
      if(file_url && (file_url.length<5||file_url.length>1000)) return json(res,400,{error:'invalid_file_url'});
      if(storage_key && (storage_key.length<5||storage_key.length>500)) return json(res,400,{error:'invalid_storage_key'});
      if(seo_title && (seo_title.length<5||seo_title.length>200)) return json(res,400,{error:'invalid_seo_title'});
      if(seo_description && (seo_description.length<10||seo_description.length>500)) return json(res,400,{error:'invalid_seo_description'});
      const { rows: maxRows } = await pool.query(`SELECT COALESCE(MAX(version),0) as max_version FROM cms_contents WHERE slug=$1`, [slug]);
      const nextVersion = Number(maxRows[0].max_version)+1;
      try{
        const { rows } = await pool.query(`INSERT INTO cms_contents (slug, title, excerpt, content, content_type, version, tags, metadata, file_url, storage_key, seo_title, seo_description, is_authorized, author_id, author_name, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
          [slug, title, excerpt, content, content_type, nextVersion, tags, JSON.stringify(metadata), file_url, storage_key, seo_title, seo_description, is_authorized, sess?.identityId||null, sess?.role||null, sess?.identityId||null]);
        await pool.query(`INSERT INTO cms_content_versions (content_id, version, snapshot, change_summary, created_by_identity, created_by_name) VALUES ($1,$2,$3,$4,$5,$6)`, [rows[0].id, nextVersion, JSON.stringify(rows[0]), 'Criação inicial CMS', sess?.identityId||null, sess?.role||null]);
        await pool.query(`INSERT INTO cms_content_history (content_id, previous_version, next_version, previous_status, next_status, reason, changed_by_identity, changed_by_name) VALUES ($1,NULL,$2,NULL,$3,$4,$5,$6)`, [rows[0].id, nextVersion, 'rascunho', 'Criação inicial CMS rascunho/revisão/publicação histórico reversão', sess?.identityId||null, sess?.role||null]);
        await auditLog({ action:'cms_content_create', actor:sess?.identityId||'system', target:rows[0].id, meta:{ slug, content_type, version: nextVersion } });
        return json(res,201,rows[0]);
      } catch(e){ if(e.code==='23505'){ if(e.constraint && e.constraint.includes('storage_key')) return json(res,409,{error:'duplicate_storage_key'}); return json(res,409,{error:'duplicate_slug_version'}); } throw e; }
    }
    if(req.method==='PATCH'){
      const b = await readJson(req);
      const id = b.id;
      const status = b.status?String(b.status).trim():null;
      const content = b.content?String(b.content).trim():null;
      const title = b.title?String(b.title).trim():null;
      const excerpt = b.excerpt?String(b.excerpt).trim():null;
      const reason = b.reason?String(b.reason).trim():null;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM cms_contents WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const cur = existing[0];
      const nextStatus = status||cur.status;
      const valid=['rascunho','em_revisao','aprovado','publicado','arquivado','rejeitado'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      if(content && (content.length<50||content.length>20000)) return json(res,400,{error:'invalid_content'});
      if(title && (title.length<5||title.length>200)) return json(res,400,{error:'invalid_title'});
      if(excerpt && (excerpt.length<10||excerpt.length>1000)) return json(res,400,{error:'invalid_excerpt'});
      let rows;
      const needsNewVersion = content && content!==cur.content;
      if(needsNewVersion){
        const { rows: maxRows } = await pool.query(`SELECT COALESCE(MAX(version),0) as max_version FROM cms_contents WHERE slug=$1`, [cur.slug]);
        const nextVersion = Number(maxRows[0].max_version)+1;
        const newTitle = title||cur.title;
        const newExcerpt = excerpt!==undefined?excerpt:cur.excerpt;
        const newContent = content;
        const newRows = await pool.query(`INSERT INTO cms_contents (slug, title, excerpt, content, content_type, version, status, is_published, published_at, published_by_identity, published_by_name, tags, metadata, file_url, storage_key, seo_title, seo_description, is_authorized, author_id, author_name, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
          [cur.slug, newTitle, newExcerpt, newContent, cur.content_type, nextVersion, nextStatus, nextStatus==='publicado', nextStatus==='publicado'?new Date():null, nextStatus==='publicado'?sess?.identityId||null:null, nextStatus==='publicado'?sess?.role||null:null, cur.tags, cur.metadata, cur.file_url, cur.storage_key, cur.seo_title, cur.seo_description, cur.is_authorized, cur.author_id, cur.author_name, sess?.identityId||null]);
        rows = newRows.rows;
        await pool.query(`INSERT INTO cms_content_versions (content_id, version, snapshot, change_summary, created_by_identity, created_by_name) VALUES ($1,$2,$3,$4,$5,$6)`, [rows[0].id, nextVersion, JSON.stringify(rows[0]), reason||'Atualização conteúdo CMS nova versão', sess?.identityId||null, sess?.role||null]);
        await pool.query(`INSERT INTO cms_content_history (content_id, previous_version, next_version, previous_status, next_status, reason, changed_by_identity, changed_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [rows[0].id, cur.version, nextVersion, cur.status, nextStatus, reason||'Nova versão CMS', sess?.identityId||null, sess?.role||null]);
        if(nextStatus==='publicado'){
          await pool.query(`UPDATE cms_contents SET is_published=false WHERE slug=$1 AND id!=$2 AND content_type=$3`, [cur.slug, rows[0].id, cur.content_type]);
        }
      } else {
        const upd = await pool.query(`UPDATE cms_contents SET status=$2, title=COALESCE($3,title), excerpt=COALESCE($4,excerpt), is_published=$5, published_at=$6, published_by_identity=$7, published_by_name=$8, updated_at=NOW() WHERE id=$1 RETURNING *`,
          [id, nextStatus, title||null, excerpt!==undefined?excerpt:null, nextStatus==='publicado', nextStatus==='publicado'?new Date():null, nextStatus==='publicado'?sess?.identityId||null:null, nextStatus==='publicado'?sess?.role||null:null]);
        rows = upd.rows;
        await pool.query(`INSERT INTO cms_content_history (content_id, previous_version, next_version, previous_status, next_status, reason, changed_by_identity, changed_by_name) VALUES ($1,$2,$2,$3,$4,$5,$6,$7)`, [id, cur.version, cur.status, nextStatus, reason||`Transição ${cur.status}→${nextStatus}`, sess?.identityId||null, sess?.role||null]);
        if(nextStatus==='publicado'){
          await pool.query(`UPDATE cms_contents SET is_published=false WHERE slug=$1 AND id!=$2 AND content_type=$3`, [cur.slug, id, cur.content_type]);
        }
      }
      const actionMap={ rascunho:'cms_content_update', em_revisao:'cms_content_update', aprovado:'cms_content_approve', publicado:'cms_content_publish', arquivado:'cms_content_archive', rejeitado:'cms_content_reject' };
      await auditLog({ action:actionMap[nextStatus]||'cms_content_update', actor:sess?.identityId||'system', target:id, meta:{ status: nextStatus, version: rows[0].version } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleContentById = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    const url=new URL(req.url,'http://localhost');
    const parts=url.pathname.split('/');
    const id=parts[parts.length-1];
    if(!id) return json(res,400,{error:'missing_id'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM cms_contents WHERE id=$1`, [id]);
      if(!rows.length) return json(res,404,{error:'not_found'});
      const { rows: versions } = await pool.query(`SELECT * FROM cms_content_versions WHERE content_id=$1 ORDER BY version DESC`, [id]);
      const { rows: history } = await pool.query(`SELECT * FROM cms_content_history WHERE content_id=$1 ORDER BY created_at DESC`, [id]);
      return json(res,200,{ content: rows[0], versions, history });
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleRevert = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method!=='POST') return json(res,405,{error:'method_not_allowed'});
    const b=await readJson(req);
    const content_id=b.content_id;
    const version=b.version;
    const reason=String(b.reason||'Reversão CMS').trim();
    if(!content_id||!version) return json(res,400,{error:'missing_content_id_or_version'});
    if(reason.length<10||reason.length>1000) return json(res,400,{error:'invalid_reason'});
    const { rows: versionRows } = await pool.query(`SELECT * FROM cms_content_versions WHERE content_id=$1 AND version=$2`, [content_id, version]);
    if(!versionRows.length) return json(res,404,{error:'version_not_found'});
    const snapshot = versionRows[0].snapshot;
    const { rows: curRows } = await pool.query(`SELECT * FROM cms_contents WHERE id=$1`, [content_id]);
    if(!curRows.length) return json(res,404,{error:'content_not_found'});
    const cur=curRows[0];
    const { rows: maxRows } = await pool.query(`SELECT COALESCE(MAX(version),0) as max_version FROM cms_contents WHERE slug=$1`, [cur.slug]);
    const nextVersion=Number(maxRows[0].max_version)+1;
    const newRows = await pool.query(`INSERT INTO cms_contents (slug, title, excerpt, content, content_type, version, status, is_published, tags, metadata, file_url, storage_key, seo_title, seo_description, is_authorized, author_id, author_name, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,'rascunho',false,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [snapshot.slug||cur.slug, snapshot.title||cur.title, snapshot.excerpt||cur.excerpt, snapshot.content||cur.content, snapshot.content_type||cur.content_type, nextVersion, snapshot.tags||cur.tags, JSON.stringify(snapshot.metadata||cur.metadata), snapshot.file_url||cur.file_url, null, snapshot.seo_title||cur.seo_title, snapshot.seo_description||cur.seo_description, snapshot.is_authorized||false, snapshot.author_id||cur.author_id, snapshot.author_name||cur.author_name, sess.identityId||null]);
    await pool.query(`INSERT INTO cms_content_versions (content_id, version, snapshot, change_summary, created_by_identity, created_by_name) VALUES ($1,$2,$3,$4,$5,$6)`, [newRows.rows[0].id, nextVersion, JSON.stringify(newRows.rows[0]), `Reversão para v${version}: ${reason}`, sess.identityId||null, sess.role||null]);
    await pool.query(`INSERT INTO cms_content_history (content_id, previous_version, next_version, previous_status, next_status, reason, changed_by_identity, changed_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [newRows.rows[0].id, cur.version, nextVersion, cur.status, 'rascunho', `Reversão v${cur.version}→v${nextVersion} a partir de v${version}: ${reason}`, sess.identityId||null, sess.role||null]);
    await auditLog({ action:'cms_content_revert', actor:sess.identityId||'system', target:content_id, meta:{ from_version: version, to_version: nextVersion, reason } });
    return json(res,201,newRows.rows[0]);
  };

  return { handleContents, handleContentById, handleRevert };
}
