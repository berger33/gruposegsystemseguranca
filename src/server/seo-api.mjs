export function createSeoApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const readJson = async (req) => { const chunks=[]; for await (const c of req) chunks.push(c); const raw=Buffer.concat(chunks).toString('utf8'); if(!raw) return {}; try{ return JSON.parse(raw);} catch{ return {}; } };

  const handleConfigs = async (req,res) => {
    const url=new URL(req.url,'http://localhost');
    // PUB-08: antes, QUALQUER caminho sem `/admin` era tratado como público e
    // devolvia todas as linhas, inclusive `is_published=false` — rascunho
    // interno exposto a anônimo. Não há consumidor público destas rotas.
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess) return json(res,401,{error:'admin_session_required'});
    if(!requireRole(sess,['admin','ti','marcelo'])) return json(res,403,{error:'forbidden'});
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

  // PUB-08: `handleRedirects` e `handleSitemap` foram REMOVIDOS daqui.
  // O sitemap digitado à mão (`seo_sitemap_entries`) deixou de ser fonte de
  // verdade — `/sitemap.xml` passa a ser derivado das rotas públicas reais em
  // `src/server/seo-technical-api.mjs`, com XML escapado —, e os redirects
  // passaram a ser aplicados de fato na requisição, com regra de sombra,
  // destino, cadeia e trilha na mesma transação. Ver
  // `docs/PROMPT-CONTINUACAO-PUB08-SEO-TECNICO.md`.

  const handleDomainVerification = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess) return json(res,401,{error:'admin_session_required'});
    if(!requireRole(sess,['admin','ti','marcelo'])) return json(res,403,{error:'forbidden'});
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
      // PUB-08: declarar um domínio "verificado" à mão é fabricar o fato que o
      // portão deveria provar — verificação real exige consultar DNS ou buscar
      // um arquivo no domínio, fronteira externa fora desta entrega local.
      // Registrar "pendente" continua valendo; declarar verificado, não.
      if(status==='verificado'){
        return json(res,400,{
          error:'domain_verification_not_supported',
          note:'A verificação real (DNS/HTTP no domínio) não é executável nesta entrega local; nenhum controle desta fatia depende deste registro.',
        });
      }
      const { rows: existing } = await pool.query(`SELECT * FROM domain_verifications WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const nextStatus=status||existing[0].status;
      const { rows } = await pool.query(`UPDATE domain_verifications SET status=$2, verified_at=$3, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, nextStatus, nextStatus==='verificado'?new Date():null]);
      await auditLog({ action:'domain_verification_verify', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus, domain: existing[0].domain } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  return { handleConfigs, handleDomainVerification };
}
