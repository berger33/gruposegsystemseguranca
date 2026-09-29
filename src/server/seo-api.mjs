export function createSeoApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const readJson = async (req) => { const chunks=[]; for await (const c of req) chunks.push(c); const raw=Buffer.concat(chunks).toString('utf8'); if(!raw) return {}; try{ return JSON.parse(raw);} catch{ return {}; } };

  const handleConfigs = async (req,res) => {
    const url=new URL(req.url,'http://localhost');
    const isPublic=url.pathname.startsWith('/api/seo') && !url.pathname.includes('/admin');
    if(!isPublic && !sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=!isPublic ? requireSession(req) : null;
    if(!isPublic && (!sess || !requireRole(sess,['admin','ti']))) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const search=url.searchParams.get('search');
      const published=url.searchParams.get('published');
      let q=`SELECT * FROM seo_configs WHERE 1=1`;
      const params=[];
      if(published==='true'){ q+=` AND is_published=true`; }
      if(search){ params.push(`%${search}%`); q+=` AND (path ILIKE $${params.length} OR title ILIKE $${params.length})`; }
      q+=` ORDER BY path ASC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows, note:'SEO técnico títulos sitemap redirects verificação domínio noindex preservado não produtivo'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const path=String(b.path||'').trim();
      const title=String(b.title||'').trim();
      const description=String(b.description||'').trim();
      const keywords=b.keywords||[];
      const canonical_url=b.canonical_url?String(b.canonical_url).trim():null;
      const robots=String(b.robots||'noindex, nofollow').trim();
      const og_title=b.og_title?String(b.og_title).trim():null;
      const og_description=b.og_description?String(b.og_description).trim():null;
      const og_image_url=b.og_image_url?String(b.og_image_url).trim():null;
      const sitemap_priority=b.sitemap_priority!=null?Number(b.sitemap_priority):0.5;
      const changefreq=String(b.changefreq||'weekly').trim();
      const is_noindex=b.is_noindex!==undefined?!!b.is_noindex:true;
      if(path.length<1||path.length>500) return json(res,400,{error:'invalid_path'});
      if(title.length<5||title.length>200) return json(res,400,{error:'invalid_title'});
      if(description.length<10||description.length>500) return json(res,400,{error:'invalid_description'});
      if(canonical_url && (canonical_url.length<5||canonical_url.length>1000)) return json(res,400,{error:'invalid_canonical'});
      if(robots.length<5||robots.length>200) return json(res,400,{error:'invalid_robots'});
      if(og_title && (og_title.length<5||og_title.length>200)) return json(res,400,{error:'invalid_og_title'});
      if(og_description && (og_description.length<10||og_description.length>500)) return json(res,400,{error:'invalid_og_description'});
      if(og_image_url && (og_image_url.length<5||og_image_url.length>1000)) return json(res,400,{error:'invalid_og_image'});
      if(!Number.isFinite(sitemap_priority)||sitemap_priority<0||sitemap_priority>1) return json(res,400,{error:'invalid_priority'});
      const validFreq=['always','hourly','daily','weekly','monthly','yearly','never'];
      if(!validFreq.includes(changefreq)) return json(res,400,{error:'invalid_changefreq'});
      try{
        const { rows } = await pool.query(`INSERT INTO seo_configs (path, title, description, keywords, canonical_url, robots, og_title, og_description, og_image_url, sitemap_priority, changefreq, is_noindex, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
          [path, title, description, keywords, canonical_url, robots, og_title, og_description, og_image_url, sitemap_priority, changefreq, is_noindex, sess.identityId||null]);
        await auditLog({ action:'seo_config_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ path, is_noindex } });
        return json(res,201,rows[0]);
      } catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_path'}); throw e; }
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM seo_configs WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const cur=existing[0];
      const title=b.title?String(b.title).trim():cur.title;
      const description=b.description?String(b.description).trim():cur.description;
      const robots=b.robots?String(b.robots).trim():cur.robots;
      const is_noindex=b.is_noindex!==undefined?!!b.is_noindex:cur.is_noindex;
      const is_published=b.is_published!==undefined?!!b.is_published:cur.is_published;
      if(title.length<5||title.length>200) return json(res,400,{error:'invalid_title'});
      if(description.length<10||description.length>500) return json(res,400,{error:'invalid_description'});
      if(robots.length<5||robots.length>200) return json(res,400,{error:'invalid_robots'});
      if(is_published && is_noindex){
        return json(res,400,{error:'cannot_publish_with_noindex', note:'preservar noindex em ambientes não produtivos; liberação exige verificação domínio e aprovação'});
      }
      const { rows } = await pool.query(`UPDATE seo_configs SET title=$2, description=$3, robots=$4, is_noindex=$5, is_published=$6, version=version+1, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, title, description, robots, is_noindex, is_published]);
      await auditLog({ action:'seo_config_update', actor:sess.identityId||'system', target:id, meta:{ path: cur.path, is_noindex, is_published } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleRedirects = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM seo_redirects ORDER BY old_path ASC LIMIT 200`);
      return json(res,200,{items:rows});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const old_path=String(b.old_path||'').trim();
      const new_path=String(b.new_path||'').trim();
      const redirect_type=String(b.redirect_type||'301').trim();
      const reason=b.reason?String(b.reason).trim():null;
      const is_active=b.is_active!==undefined?!!b.is_active:true;
      if(old_path.length<1||old_path.length>500) return json(res,400,{error:'invalid_old_path'});
      if(new_path.length<1||new_path.length>500) return json(res,400,{error:'invalid_new_path'});
      if(old_path===new_path) return json(res,400,{error:'cannot_redirect_to_self'});
      const valid=['301','302','307','308'];
      if(!valid.includes(redirect_type)) return json(res,400,{error:'invalid_redirect_type'});
      if(reason && (reason.length<10||reason.length>1000)) return json(res,400,{error:'invalid_reason'});
      try{
        const { rows } = await pool.query(`INSERT INTO seo_redirects (old_path, new_path, redirect_type, is_active, reason, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [old_path, new_path, redirect_type, is_active, reason, sess.identityId||null]);
        await auditLog({ action:'seo_redirect_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ old_path, new_path, redirect_type } });
        return json(res,201,rows[0]);
      } catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_old_path'}); throw e; }
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM seo_redirects WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const is_active=b.is_active!==undefined?!!b.is_active:existing[0].is_active;
      const new_path=b.new_path?String(b.new_path).trim():existing[0].new_path;
      if(new_path.length<1||new_path.length>500) return json(res,400,{error:'invalid_new_path'});
      if(new_path===existing[0].old_path) return json(res,400,{error:'cannot_redirect_to_self'});
      const { rows } = await pool.query(`UPDATE seo_redirects SET new_path=$2, is_active=$3, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, new_path, is_active]);
      await auditLog({ action:'seo_redirect_update', actor:sess.identityId||'system', target:id, meta:{ new_path, is_active } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleSitemap = async (req,res) => {
    const url=new URL(req.url,'http://localhost');
    const isXml=url.pathname.endsWith('.xml') || url.searchParams.get('format')==='xml';
    if(req.method==='GET'){
      if(url.pathname.includes('/admin') || url.pathname.includes('/hr')){
        if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
        const sess=requireSession(req);
        if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
        const { rows } = await pool.query(`SELECT * FROM seo_sitemap_entries ORDER BY url ASC LIMIT 500`);
        if(isXml){
          let xml=`<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n`;
          for(const r of rows.filter(x=>x.is_included)){
            xml+=`  <url><loc>${r.url}</loc><lastmod>${r.lastmod.toISOString().split('T')[0]}</lastmod><changefreq>${r.changefreq}</changefreq><priority>${r.priority}</priority></url>\n`;
          }
          xml+=`</urlset>`;
          res.writeHead(200,{'Content-Type':'application/xml'}); res.end(xml); return;
        }
        return json(res,200,{items:rows, note:'sitemap preserva noindex até produção liberada; is_included false enquanto noindex true'});
      } else {
        // public sitemap - only included
        const { rows } = await pool.query(`SELECT * FROM seo_sitemap_entries WHERE is_included=true ORDER BY url ASC LIMIT 500`);
        if(isXml){
          let xml=`<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n`;
          for(const r of rows){
            xml+=`  <url><loc>${r.url}</loc><lastmod>${r.lastmod.toISOString().split('T')[0]}</lastmod><changefreq>${r.changefreq}</changefreq><priority>${r.priority}</priority></url>\n`;
          }
          xml+=`</urlset>`;
          res.writeHead(200,{'Content-Type':'application/xml'}); res.end(xml); return;
        }
        return json(res,200,{items:rows});
      }
    }
    if(req.method==='POST' || req.method==='PATCH'){
      if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
      const sess=requireSession(req);
      if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
      const b=await readJson(req);
      const action=b.action||'update';
      if(action==='rebuild'){
        // rebuild from seo_configs where is_published true and is_noindex false
        const { rows: configs } = await pool.query(`SELECT * FROM seo_configs WHERE is_published=true AND is_noindex=false`);
        for(const c of configs){
          await pool.query(`INSERT INTO seo_sitemap_entries (url, priority, changefreq, is_included, source) VALUES ($1,$2,$3,true,$4) ON CONFLICT (url) DO UPDATE SET priority=$2, changefreq=$3, is_included=true, updated_at=NOW()`, [c.canonical_url||c.path, c.sitemap_priority, c.changefreq, 'rebuild from seo_configs']);
        }
        await auditLog({ action:'seo_sitemap_update', actor:sess.identityId||'system', target:'rebuild', meta:{ count: configs.length } });
        return json(res,200,{rebuilt: configs.length});
      }
      const urlPath=b.url?String(b.url).trim():null;
      const priority=b.priority!=null?Number(b.priority):0.5;
      const changefreq=String(b.changefreq||'weekly').trim();
      const is_included=b.is_included!==undefined?!!b.is_included:true;
      if(!urlPath||urlPath.length<5||urlPath.length>1000) return json(res,400,{error:'invalid_url'});
      if(!Number.isFinite(priority)||priority<0||priority>1) return json(res,400,{error:'invalid_priority'});
      const validFreq=['always','hourly','daily','weekly','monthly','yearly','never'];
      if(!validFreq.includes(changefreq)) return json(res,400,{error:'invalid_changefreq'});
      const { rows } = await pool.query(`INSERT INTO seo_sitemap_entries (url, priority, changefreq, is_included, source) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (url) DO UPDATE SET priority=$2, changefreq=$3, is_included=$4, updated_at=NOW() RETURNING *`, [urlPath, priority, changefreq, is_included, b.source||'manual']);
      await auditLog({ action:'seo_sitemap_update', actor:sess.identityId||'system', target:rows[0].id, meta:{ url: urlPath, is_included } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleDomainVerification = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM domain_verifications ORDER BY domain ASC LIMIT 100`);
      return json(res,200,{items:rows, note:'verificação de domínio na liberação; preservar noindex até verificado'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const domain=String(b.domain||'').trim().toLowerCase();
      const verification_method=String(b.verification_method||'dns_txt').trim();
      const verification_token=String(b.verification_token||'').trim();
      if(domain.length<3||domain.length>200) return json(res,400,{error:'invalid_domain'});
      if(verification_token.length<10||verification_token.length>500) return json(res,400,{error:'invalid_token'});
      const validMethod=['dns_txt','file','meta_tag','outro'];
      if(!validMethod.includes(verification_method)) return json(res,400,{error:'invalid_method'});
      try{
        const { rows } = await pool.query(`INSERT INTO domain_verifications (domain, verification_method, verification_token, created_by_identity) VALUES ($1,$2,$3,$4) RETURNING *`, [domain, verification_method, verification_token, sess.identityId||null]);
        await auditLog({ action:'domain_verification_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ domain, verification_method } });
        return json(res,201,rows[0]);
      } catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_domain'}); throw e; }
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      if(!id) return json(res,400,{error:'missing_id'});
      const valid=['pendente','verificado','falha','expirado'];
      if(status && !valid.includes(status)) return json(res,400,{error:'invalid_status'});
      const { rows: existing } = await pool.query(`SELECT * FROM domain_verifications WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const nextStatus=status||existing[0].status;
      const { rows } = await pool.query(`UPDATE domain_verifications SET status=$2, verified_at=$3, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, nextStatus, nextStatus==='verificado'?new Date():null]);
      await auditLog({ action:'domain_verification_verify', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus, domain: existing[0].domain } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  return { handleConfigs, handleRedirects, handleSitemap, handleDomainVerification };
}
