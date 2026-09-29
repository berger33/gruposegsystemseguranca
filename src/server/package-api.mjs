export function createPackageApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const readJson = async (req) => { const chunks=[]; for await (const c of req) chunks.push(c); const raw=Buffer.concat(chunks).toString('utf8'); if(!raw) return {}; try{ return JSON.parse(raw);} catch{ return {}; } };
  const generateProtocol = (prefix) => { const d=new Date(); const y=d.getFullYear().toString(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); const rand=Math.random().toString(36).substring(2,6).toUpperCase(); return `${prefix}-${y}${m}${day}-${rand}`; };

  const handleRules = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM pub_package_rules ORDER BY rule_key ASC LIMIT 200`);
      return json(res,200,{items:rows, note:'regras aprovadas a partir de catálogo validado'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const rule_key=String(b.rule_key||'').trim().toLowerCase();
      const name=String(b.name||'').trim();
      const description=String(b.description||'').trim();
      const rule_type=String(b.rule_type||'outro').trim();
      const rule_data=b.rule_data||{};
      if(rule_key.length<3||rule_key.length>100) return json(res,400,{error:'invalid_rule_key'});
      if(name.length<3||name.length>200) return json(res,400,{error:'invalid_name'});
      if(description.length<10||description.length>2000) return json(res,400,{error:'invalid_description'});
      const valid=['inclusao_obrigatoria','exclusao','compatibilidade','preco_minimo','desconto_maximo','outro'];
      if(!valid.includes(rule_type)) return json(res,400,{error:'invalid_rule_type'});
      try{
        const { rows } = await pool.query(`INSERT INTO pub_package_rules (rule_key, name, description, rule_type, rule_data, created_by_identity) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [rule_key, name, description, rule_type, JSON.stringify(rule_data), sess.identityId||null]);
        await auditLog({ action:'package_rule_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ rule_key } });
        return json(res,201,rows[0]);
      } catch(e){ if(e.code==='23505') return json(res,409,{error:'duplicate_rule_key'}); throw e; }
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const is_approved=b.is_approved!==undefined?!!b.is_approved:null;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM pub_package_rules WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      let rows;
      if(is_approved!==null){
        rows=(await pool.query(`UPDATE pub_package_rules SET is_approved=$2, approved_by_identity=$3, approved_by_name=$4, approved_at=$5, version=version+1, updated_at=NOW() WHERE id=$1 RETURNING *`, [id, is_approved, is_approved?sess.identityId||null:null, is_approved?sess.role||null:null, is_approved?new Date():null])).rows;
        await auditLog({ action:'package_rule_approve', actor:sess.identityId||'system', target:id, meta:{ is_approved } });
      } else {
        rows=(await pool.query(`UPDATE pub_package_rules SET name=COALESCE($2,name), description=COALESCE($3,description), rule_data=COALESCE($4,rule_data), updated_at=NOW() WHERE id=$1 RETURNING *`, [id, b.name||null, b.description||null, b.rule_data?JSON.stringify(b.rule_data):null])).rows;
      }
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handlePackages = async (req,res) => {
    const url=new URL(req.url,'http://localhost');
    const isPublic=url.pathname.startsWith('/api/packages') || url.pathname.startsWith('/api/public/packages');
    if(!isPublic && !sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=!isPublic ? await requireSession(req) : null;
    if(!isPublic && (!sess || !requireRole(sess,['admin','ti']))) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const status=url.searchParams.get('status');
      const published=url.searchParams.get('published');
      let q=`SELECT * FROM pub_service_packages WHERE 1=1`;
      const params=[];
      if(isPublic || published==='true'){ q+=` AND is_published=true AND status='publicado' AND is_demo=false`; }
      else if(status){ params.push(status); q+=` AND status=$${params.length}`; }
      q+=` ORDER BY created_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows, note:'montador pacote comparador serviços e planos somente catálogo e regras aprovadas; nenhuma promessa/preço demonstração produção'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const name=String(b.name||'').trim();
      const description=String(b.description||'').trim();
      const service_ids=b.service_ids||[];
      const total_cost_cents=b.total_cost_cents!=null?Number(b.total_cost_cents):null;
      const total_price_cents=b.total_price_cents!=null?Number(b.total_price_cents):null;
      const margin_percent=b.margin_percent!=null?Number(b.margin_percent):null;
      const is_demo=!!b.is_demo;
      if(name.length<3||name.length>200) return json(res,400,{error:'invalid_name'});
      if(description.length<10||description.length>2000) return json(res,400,{error:'invalid_description'});
      if(!Array.isArray(service_ids)||service_ids.length===0) return json(res,400,{error:'invalid_service_ids'});
      if(total_cost_cents!=null && (!Number.isFinite(total_cost_cents)||total_cost_cents<0)) return json(res,400,{error:'invalid_cost'});
      if(total_price_cents!=null && (!Number.isFinite(total_price_cents)||total_price_cents<0)) return json(res,400,{error:'invalid_price'});
      if(margin_percent!=null && (!Number.isFinite(margin_percent)||margin_percent<-100||margin_percent>100)) return json(res,400,{error:'invalid_margin'});
      if(is_demo && b.is_published) return json(res,400,{error:'demo_cannot_be_published', note:'nenhuma promessa/preço de demonstração em produção'});
      // validar serviços existem e são publicados validados
      const placeholders=service_ids.map((_,i)=>`$${i+1}`).join(',');
      const { rows: services } = await pool.query(`SELECT id, is_published, is_validated FROM service_catalog WHERE id IN (${placeholders})`, service_ids);
      if(services.length!==service_ids.length) return json(res,400,{error:'some_services_not_found', note:'somente a partir de catálogo aprovado'});
      const notValidated=services.filter(s=>!s.is_published||!s.is_validated);
      if(notValidated.length>0) return json(res,400,{error:'services_not_approved', note:'somente catálogo e regras aprovadas'});
      // validar regras aprovadas
      const { rows: approvedRules } = await pool.query(`SELECT rule_key FROM pub_package_rules WHERE is_approved=true`);
      if(approvedRules.length===0) return json(res,400,{error:'no_approved_rules', note:'regras aprovadas necessárias'});
      const protocol=generateProtocol('PKG-PUB');
      const { rows } = await pool.query(`INSERT INTO pub_service_packages (protocol, name, description, service_ids, service_details, rules_applied, total_cost_cents, total_price_cents, margin_percent, is_demo, is_price_from_approved_catalog, created_by_identity, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12) RETURNING *`,
        [protocol, name, description, service_ids, JSON.stringify(services), JSON.stringify(approvedRules.map(r=>r.rule_key)), total_cost_cents, total_price_cents, margin_percent, is_demo, sess.identityId||null, sess.role||null]);
      await pool.query(`INSERT INTO pub_package_history (package_id, previous_version, next_version, previous_status, next_status, reason, changed_by_identity, changed_by_name) VALUES ($1,NULL,$2,NULL,$3,$4,$5,$6)`, [rows[0].id, 1, 'rascunho', 'Criação inicial pacote a partir de catálogo e regras aprovadas', sess.identityId||null, sess.role||null]);
      await auditLog({ action:'package_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ protocol, service_count: service_ids.length } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM pub_service_packages WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const cur=existing[0];
      const nextStatus=status||cur.status;
      const valid=['rascunho','em_revisao','aprovado','rejeitado','arquivado','publicado'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      if(nextStatus==='publicado' && cur.is_demo) return json(res,400,{error:'demo_cannot_be_published'});
      const { rows } = await pool.query(`UPDATE pub_service_packages SET status=$2, is_approved=$3, is_published=$4, approved_by_identity=$5, approved_by_name=$6, approved_at=$7, version=version+1, updated_at=NOW() WHERE id=$1 RETURNING *`,
        [id, nextStatus, nextStatus==='aprovado'||nextStatus==='publicado', nextStatus==='publicado', nextStatus==='aprovado'||nextStatus==='publicado'?sess.identityId||null:null, nextStatus==='aprovado'||nextStatus==='publicado'?sess.role||null:null, nextStatus==='aprovado'||nextStatus==='publicado'?new Date():null]);
      await pool.query(`INSERT INTO pub_package_history (package_id, previous_version, next_version, previous_status, next_status, reason, changed_by_identity, changed_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, cur.version, rows[0].version, cur.status, nextStatus, b.reason||`Transição ${cur.status}→${nextStatus}`, sess.identityId||null, sess.role||null]);
      await auditLog({ action: nextStatus==='publicado'?'package_publish':'package_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleComparisons = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM pub_package_comparisons ORDER BY created_at DESC LIMIT 100`);
      return json(res,200,{items:rows});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const title=String(b.title||'').trim();
      const package_ids=b.package_ids||[];
      const notes=b.notes?String(b.notes).trim():null;
      if(title.length<3||title.length>200) return json(res,400,{error:'invalid_title'});
      if(!Array.isArray(package_ids)||package_ids.length<2||package_ids.length>5) return json(res,400,{error:'invalid_package_ids_2_to_5'});
      if(notes && (notes.length<10||notes.length>2000)) return json(res,400,{error:'invalid_notes'});
      const placeholders=package_ids.map((_,i)=>`$${i+1}`).join(',');
      const { rows: packages } = await pool.query(`SELECT * FROM pub_service_packages WHERE id IN (${placeholders})`, package_ids);
      if(packages.length!==package_ids.length) return json(res,400,{error:'some_packages_not_found'});
      const notApproved=packages.filter(p=>!p.is_approved);
      if(notApproved.length>0) return json(res,400,{error:'packages_not_approved', note:'somente a partir de catálogo e regras aprovadas'});
      const comparison_data={
        packages: packages.map(p=>({ id:p.id, protocol:p.protocol, name:p.name, description:p.description, service_ids:p.service_ids, total_cost_cents:p.total_cost_cents, total_price_cents:p.total_price_cents, margin_percent:p.margin_percent, status:p.status })),
        summary: {
          min_price: Math.min(...packages.map(p=>Number(p.total_price_cents||0))),
          max_price: Math.max(...packages.map(p=>Number(p.total_price_cents||0))),
          price_range: Math.max(...packages.map(p=>Number(p.total_price_cents||0))) - Math.min(...packages.map(p=>Number(p.total_price_cents||0))),
          count: packages.length
        }
      };
      const { rows } = await pool.query(`INSERT INTO pub_package_comparisons (title, package_ids, comparison_data, notes, created_by_identity, created_by_name) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [title, package_ids, JSON.stringify(comparison_data), notes, sess.identityId||null, sess.role||null]);
      await auditLog({ action:'package_comparison_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ title, count: package_ids.length } });
      return json(res,201,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  return { handleRules, handlePackages, handleComparisons };
}
