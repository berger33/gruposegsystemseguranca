// Token de preview é credencial de acesso: precisa de aleatoriedade criptográfica,
// não de Math.random.
import { randomBytes } from 'node:crypto';
export function createThemeApi({ pool, auditLog, sameOrigin, requireSession, requireRole }) {
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const readJson = async (req) => { const chunks=[]; for await (const c of req) chunks.push(c); const raw=Buffer.concat(chunks).toString('utf8'); if(!raw) return {}; try{ return JSON.parse(raw);} catch{ return {}; } };
  const genToken = () => randomBytes(24).toString('base64url').slice(0, 32);

  const handleThemes = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const status=url.searchParams.get('status');
      const active=url.searchParams.get('active');
      let q=`SELECT * FROM pub_themes WHERE 1=1`;
      const params=[];
      if(status){ params.push(status); q+=` AND status=$${params.length}`; }
      if(active==='true'){ q+=` AND is_active=true`; }
      q+=` ORDER BY theme_key ASC, version DESC LIMIT 200`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows, note:'temas com preview publicação autorizada configuração persistida rollback; preferência dia/noite separada identidade global'});
    }
    if(req.method==='POST'){
      const b=await readJson(req);
      const theme_key=String(b.theme_key||'').trim().toLowerCase();
      const name=String(b.name||'').trim();
      const description=String(b.description||'').trim();
      const config=b.config||{};
      const tokens=b.tokens||{};
      const layout=b.layout||{};
      const preview_url=b.preview_url?String(b.preview_url).trim():null;
      if(theme_key.length<3||theme_key.length>100) return json(res,400,{error:'invalid_theme_key'});
      if(name.length<3||name.length>200) return json(res,400,{error:'invalid_name'});
      if(description.length<10||description.length>2000) return json(res,400,{error:'invalid_description'});
      if(preview_url && (preview_url.length<5||preview_url.length>1000)) return json(res,400,{error:'invalid_preview_url'});
      const { rows: maxRows } = await pool.query(`SELECT COALESCE(MAX(version),0) as max_version FROM pub_themes WHERE theme_key=$1`, [theme_key]);
      const nextVersion=Number(maxRows[0].max_version)+1;
      const { rows } = await pool.query(`INSERT INTO pub_themes (theme_key, name, description, config, tokens, layout, version, preview_url, created_by_identity, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [theme_key, name, description, JSON.stringify(config), JSON.stringify(tokens), JSON.stringify(layout), nextVersion, preview_url, sess.identityId||null, sess.role||null]);
      await pool.query(`INSERT INTO pub_theme_versions (theme_id, version, snapshot, change_summary, created_by_identity, created_by_name) VALUES ($1,$2,$3,$4,$5,$6)`, [rows[0].id, nextVersion, JSON.stringify(rows[0]), 'Criação inicial tema', sess.identityId||null, sess.role||null]);
      await pool.query(`INSERT INTO pub_theme_history (theme_id, previous_version, next_version, previous_status, next_status, reason, changed_by_identity, changed_by_name) VALUES ($1,NULL,$2,NULL,$3,$4,$5,$6)`, [rows[0].id, nextVersion, 'rascunho', 'Criação inicial tema rascunho/revisão/publicação rollback', sess.identityId||null, sess.role||null]);
      await auditLog({ action:'theme_create', actor:sess.identityId||'system', target:rows[0].id, meta:{ theme_key, version: nextVersion } });
      return json(res,201,rows[0]);
    }
    if(req.method==='PATCH'){
      const b=await readJson(req);
      const id=b.id;
      const status=b.status?String(b.status).trim():null;
      const config=b.config;
      const tokens=b.tokens;
      const layout=b.layout;
      const reason=String(b.reason||'Atualização tema').trim();
      if(!id) return json(res,400,{error:'missing_id'});
      const { rows: existing } = await pool.query(`SELECT * FROM pub_themes WHERE id=$1`, [id]);
      if(!existing.length) return json(res,404,{error:'not_found'});
      const cur=existing[0];
      const nextStatus=status||cur.status;
      const valid=['rascunho','em_revisao','aprovado','publicado','arquivado','rejeitado','revertido'];
      if(!valid.includes(nextStatus)) return json(res,400,{error:'invalid_status'});
      let rows;
      const needsNewVersion = (config && JSON.stringify(config)!==JSON.stringify(cur.config)) || (tokens && JSON.stringify(tokens)!==JSON.stringify(cur.tokens)) || (layout && JSON.stringify(layout)!==JSON.stringify(cur.layout));
      if(needsNewVersion){
        const { rows: maxRows } = await pool.query(`SELECT COALESCE(MAX(version),0) as max_version FROM pub_themes WHERE theme_key=$1`, [cur.theme_key]);
        const nextVersion=Number(maxRows[0].max_version)+1;
        const newConfig = config||cur.config;
        const newTokens = tokens||cur.tokens;
        const newLayout = layout||cur.layout;
        const newRows = await pool.query(`INSERT INTO pub_themes (theme_key, name, description, config, tokens, layout, version, status, is_published, is_active, preview_url, published_at, approved_by_identity, approved_by_name, approved_at, created_by_identity, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
          [cur.theme_key, cur.name, cur.description, JSON.stringify(newConfig), JSON.stringify(newTokens), JSON.stringify(newLayout), nextVersion, nextStatus, nextStatus==='publicado', nextStatus==='publicado'?cur.is_active:false, b.preview_url||cur.preview_url, nextStatus==='publicado'?new Date():null, nextStatus==='aprovado'||nextStatus==='publicado'?sess.identityId||null:null, nextStatus==='aprovado'||nextStatus==='publicado'?sess.role||null:null, nextStatus==='aprovado'||nextStatus==='publicado'?new Date():null, sess.identityId||null, sess.role||null]);
        rows=newRows.rows;
        await pool.query(`INSERT INTO pub_theme_versions (theme_id, version, snapshot, change_summary, created_by_identity, created_by_name) VALUES ($1,$2,$3,$4,$5,$6)`, [rows[0].id, nextVersion, JSON.stringify(rows[0]), reason, sess.identityId||null, sess.role||null]);
        await pool.query(`INSERT INTO pub_theme_history (theme_id, previous_version, next_version, previous_status, next_status, reason, changed_by_identity, changed_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [rows[0].id, cur.version, nextVersion, cur.status, nextStatus, reason, sess.identityId||null, sess.role||null]);
        if(nextStatus==='publicado' && b.make_active){
          await pool.query(`UPDATE pub_themes SET is_active=false WHERE theme_key=$1 AND id!=$2`, [cur.theme_key, rows[0].id]);
          await pool.query(`UPDATE pub_themes SET is_active=true WHERE id=$1`, [rows[0].id]);
          await pool.query(`UPDATE site_visual_config SET active_visual=$1, updated_at=NOW() WHERE singleton_id=1`, [cur.theme_key.substring(0,2)||'06']);
        }
      } else {
        const upd = await pool.query(`UPDATE pub_themes SET status=$2, is_published=$3, published_at=$4, approved_by_identity=$5, approved_by_name=$6, approved_at=$7, preview_url=COALESCE($8,preview_url), updated_at=NOW() WHERE id=$1 RETURNING *`,
          [id, nextStatus, nextStatus==='publicado', nextStatus==='publicado'?new Date():null, nextStatus==='aprovado'||nextStatus==='publicado'?sess.identityId||null:null, nextStatus==='aprovado'||nextStatus==='publicado'?sess.role||null:null, nextStatus==='aprovado'||nextStatus==='publicado'?new Date():null, b.preview_url||null]);
        rows=upd.rows;
        await pool.query(`INSERT INTO pub_theme_history (theme_id, previous_version, next_version, previous_status, next_status, reason, changed_by_identity, changed_by_name) VALUES ($1,$2,$2,$3,$4,$5,$6,$7)`, [id, cur.version, cur.status, nextStatus, reason, sess.identityId||null, sess.role||null]);
        if(nextStatus==='publicado' && b.make_active){
          await pool.query(`UPDATE pub_themes SET is_active=false WHERE theme_key=$1 AND id!=$2`, [cur.theme_key, id]);
          await pool.query(`UPDATE pub_themes SET is_active=true WHERE id=$1`, [id]);
        }
      }
      const actionMap={ rascunho:'theme_update', em_revisao:'theme_update', aprovado:'theme_update', publicado:'theme_publish', arquivado:'theme_update', rejeitado:'theme_update', revertido:'theme_rollback' };
      await auditLog({ action:actionMap[nextStatus]||'theme_update', actor:sess.identityId||'system', target:id, meta:{ status: nextStatus, version: rows[0].version } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleThemeById = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    const url=new URL(req.url,'http://localhost');
    const parts=url.pathname.split('/');
    const id=parts[parts.length-1];
    if(!id) return json(res,400,{error:'missing_id'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM pub_themes WHERE id=$1`, [id]);
      if(!rows.length) return json(res,404,{error:'not_found'});
      const { rows: versions } = await pool.query(`SELECT * FROM pub_theme_versions WHERE theme_id=$1 ORDER BY version DESC`, [id]);
      const { rows: history } = await pool.query(`SELECT * FROM pub_theme_history WHERE theme_id=$1 ORDER BY created_at DESC`, [id]);
      const { rows: previews } = await pool.query(`SELECT * FROM pub_theme_previews WHERE theme_id=$1 ORDER BY created_at DESC LIMIT 20`, [id]);
      return json(res,200,{ theme: rows[0], versions, history, previews });
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handlePreview = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method==='POST'){
      const b=await readJson(req);
      const theme_id=b.theme_id;
      const preview_url=String(b.preview_url||'').trim();
      if(!theme_id) return json(res,400,{error:'missing_theme_id'});
      if(preview_url.length<5||preview_url.length>1000) return json(res,400,{error:'invalid_preview_url'});
      const token=genToken();
      const expires_at=new Date(Date.now()+24*60*60*1000);
      const { rows } = await pool.query(`INSERT INTO pub_theme_previews (theme_id, preview_token, preview_url, expires_at, created_by_identity) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [theme_id, token, preview_url, expires_at, sess.identityId||null]);
      await auditLog({ action:'theme_preview_create', actor:sess.identityId||'system', target:theme_id, meta:{ preview_token: token.substring(0,8) } });
      return json(res,201,rows[0]);
    }
    if(req.method==='GET'){
      const url=new URL(req.url,'http://localhost');
      const theme_id=url.searchParams.get('theme_id');
      let q=`SELECT * FROM pub_theme_previews`;
      const params=[];
      if(theme_id){ params.push(theme_id); q+=` WHERE theme_id=$${params.length}`; }
      q+=` ORDER BY created_at DESC LIMIT 100`;
      const { rows } = await pool.query(q, params);
      return json(res,200,{items:rows});
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handlePreferences = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess) return json(res,401,{error:'unauthorized'});
    if(req.method==='GET'){
      const { rows } = await pool.query(`SELECT * FROM pub_theme_preferences WHERE user_identity=$1`, [sess.identityId]);
      return json(res,200,{ preference: rows[0]||null, note:'preferência dia/noite separada da identidade global' });
    }
    if(req.method==='POST' || req.method==='PUT'){
      const b=await readJson(req);
      const theme_mode=String(b.theme_mode||'sistema').trim();
      const theme_key=b.theme_key?String(b.theme_key).trim():null;
      const valid=['claro','escuro','sistema'];
      if(!valid.includes(theme_mode)) return json(res,400,{error:'invalid_theme_mode'});
      if(theme_key && (theme_key.length<3||theme_key.length>100)) return json(res,400,{error:'invalid_theme_key'});
      const { rows } = await pool.query(`INSERT INTO pub_theme_preferences (user_identity, theme_mode, theme_key, is_global, is_separate_from_global) VALUES ($1,$2,$3,false,true) ON CONFLICT (user_identity) DO UPDATE SET theme_mode=$2, theme_key=$3, updated_at=NOW() RETURNING *`, [sess.identityId, theme_mode, theme_key]);
      await auditLog({ action:'theme_preference_update', actor:sess.identityId||'system', target:rows[0].id, meta:{ theme_mode, theme_key } });
      return json(res,200,rows[0]);
    }
    return json(res,405,{error:'method_not_allowed'});
  };

  const handleRollback = async (req,res) => {
    if(!sameOrigin(req)) return json(res,403,{error:'forbidden'});
    const sess=await requireSession(req);
    if(!sess || !requireRole(sess,['admin','ti'])) return json(res,401,{error:'unauthorized'});
    if(req.method!=='POST') return json(res,405,{error:'method_not_allowed'});
    const b=await readJson(req);
    const theme_id=b.theme_id;
    const version=b.version;
    const reason=String(b.reason||'Rollback tema').trim();
    if(!theme_id||!version) return json(res,400,{error:'missing_theme_id_or_version'});
    if(reason.length<10||reason.length>1000) return json(res,400,{error:'invalid_reason'});
    const { rows: versionRows } = await pool.query(`SELECT * FROM pub_theme_versions WHERE theme_id=$1 AND version=$2`, [theme_id, version]);
    if(!versionRows.length) return json(res,404,{error:'version_not_found'});
    const snapshot=versionRows[0].snapshot;
    const { rows: curRows } = await pool.query(`SELECT * FROM pub_themes WHERE id=$1`, [theme_id]);
    if(!curRows.length) return json(res,404,{error:'theme_not_found'});
    const cur=curRows[0];
    const { rows: maxRows } = await pool.query(`SELECT COALESCE(MAX(version),0) as max_version FROM pub_themes WHERE theme_key=$1`, [cur.theme_key]);
    const nextVersion=Number(maxRows[0].max_version)+1;
    const newRows = await pool.query(`INSERT INTO pub_themes (theme_key, name, description, config, tokens, layout, version, status, is_published, is_active, preview_url, created_by_identity, created_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,'revertido',false,false,$8,$9,$10) RETURNING *`,
      [snapshot.theme_key||cur.theme_key, snapshot.name||cur.name, snapshot.description||cur.description, JSON.stringify(snapshot.config||cur.config), JSON.stringify(snapshot.tokens||cur.tokens), JSON.stringify(snapshot.layout||cur.layout), nextVersion, snapshot.preview_url||cur.preview_url, sess.identityId||null, sess.role||null]);
    await pool.query(`INSERT INTO pub_theme_versions (theme_id, version, snapshot, change_summary, created_by_identity, created_by_name) VALUES ($1,$2,$3,$4,$5,$6)`, [newRows.rows[0].id, nextVersion, JSON.stringify(newRows.rows[0]), `Rollback para v${version}: ${reason}`, sess.identityId||null, sess.role||null]);
    await pool.query(`INSERT INTO pub_theme_history (theme_id, previous_version, next_version, previous_status, next_status, reason, changed_by_identity, changed_by_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [newRows.rows[0].id, cur.version, nextVersion, cur.status, 'revertido', `Rollback v${cur.version}→v${nextVersion} a partir de v${version}: ${reason}`, sess.identityId||null, sess.role||null]);
    await auditLog({ action:'theme_rollback', actor:sess.identityId||'system', target:theme_id, meta:{ from_version: version, to_version: nextVersion, reason } });
    return json(res,201,newRows.rows[0]);
  };

  return { handleThemes, handleThemeById, handlePreview, handlePreferences, handleRollback };
}
