import {THEMES,DEFAULT_THEME,getThemeTokens} from '../lib/themes.mjs';
import {authorize,audit,body,endpoint,fail,send,textField,transaction,uuid} from './publication-core.mjs';
export function createThemeApi(ctx) {
  const {pool}=ctx;
  const handleThemes=endpoint(async(req,res)=>{
    const publicRead=new URL(req.url,'http://localhost').pathname==='/api/public/themes';
    if(publicRead){
      if(req.method!=='GET')fail(405,'public_read_only');
      const r=(await pool.query("SELECT theme_key FROM pub_themes WHERE is_active AND is_published AND status='publicado' ORDER BY published_at DESC NULLS LAST LIMIT 1")).rows[0];
      return send(res,200,{theme_key:THEMES.some(t=>t.id===r?.theme_key)?r.theme_key:DEFAULT_THEME});
    }
    const s=await authorize(req,ctx);
    if(req.method==='GET')return send(res,200,{items:(await pool.query('SELECT * FROM pub_themes ORDER BY created_at DESC LIMIT 200')).rows,themes:THEMES});
    if(req.method!=='POST')fail(405,'method_not_allowed');
    const b=await body(req),theme=THEMES.find(t=>t.id===b.theme_key);if(!theme)fail(400,'invalid_theme');
    const reason=textField(b.reason,10,1000,'reason');
    const r=await transaction(pool,async c=>{
      await c.query("SELECT pg_advisory_xact_lock(hashtext('site-theme'))");
      const version=Number((await c.query('SELECT COALESCE(MAX(version),0)+1 AS v FROM pub_themes WHERE theme_key=$1',[theme.id])).rows[0].v);
      const r=(await c.query("INSERT INTO pub_themes(theme_key,name,description,tokens,version,created_by_identity,created_by_name) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",[theme.id,theme.name||theme.id,reason,JSON.stringify(getThemeTokens(theme.id)),version,s.identityId,s.role])).rows[0];
      await c.query('INSERT INTO pub_theme_versions(theme_id,version,snapshot,change_summary,created_by_identity) VALUES($1,$2,$3,$4,$5)',[r.id,version,JSON.stringify(r),reason,s.identityId]);
      await audit(c,s,'theme_create',r.id);return r;
    });send(res,201,r);
  });
  const publish=async(req,res,rollback=false)=>{
    const s=await authorize(req,ctx);if(req.method!==(rollback?'POST':'PATCH'))fail(405,'method_not_allowed');
    const b=await body(req),id=b.id||new URL(req.url,'http://localhost').pathname.split('/').pop();
    if(!uuid(id))fail(400,'invalid_id');const reason=textField(b.reason,10,1000,'reason');
    const r=await transaction(pool,async c=>{
      await c.query("SELECT pg_advisory_xact_lock(hashtext('site-theme'))");
      const old=(await c.query('SELECT * FROM pub_themes WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!old)fail(404,'not_found');
      if(!THEMES.some(t=>t.id===old.theme_key))fail(409,'unsupported_legacy_theme');
      if(rollback&&!old.published_at)fail(409,'never_published');
      await c.query("UPDATE pub_themes SET is_active=false,is_published=false,status='arquivado' WHERE is_active");
      const r=(await c.query("UPDATE pub_themes SET is_active=true,is_published=true,status='publicado',published_at=NOW(),approved_at=NOW(),approved_by_identity=$2,approved_by_name=$3 WHERE id=$1 RETURNING *",[id,s.identityId,s.role])).rows[0];
      await c.query("INSERT INTO pub_theme_history(theme_id,previous_version,next_version,previous_status,next_status,reason,changed_by_identity,changed_by_name) VALUES($1,$2,$2,$3,'publicado',$4,$5,$6)",[id,old.version,old.status,reason,s.identityId,s.role]);
      await audit(c,s,rollback?'theme_rollback':'theme_publish',id);return r;
    });send(res,200,r);
  };
  const handleThemeById=endpoint((req,res)=>publish(req,res));
  const handleRollback=endpoint((req,res)=>publish(req,res,true));
  // Preview is authenticated and never changes global state.
  const handlePreview=endpoint(async(req,res)=>{
    await authorize(req,ctx);if(req.method!=='GET')fail(405,'method_not_allowed');
    const key=new URL(req.url,'http://localhost').searchParams.get('theme');
    if(!THEMES.some(t=>t.id===key))fail(400,'invalid_theme');
    send(res,200,{theme_key:key,tokens:getThemeTokens(key)});
  });
  const handlePreferences=endpoint(async(req,res)=>{
    const s=await authorize(req,ctx,['admin','marcelo','ti','comercial','rh']);
    if(req.method==='GET')return send(res,200,(await pool.query('SELECT theme_mode FROM pub_theme_preferences WHERE user_identity=$1',[s.identityId])).rows[0]||{theme_mode:'sistema'});
    if(req.method!=='POST'&&req.method!=='PATCH')fail(405,'method_not_allowed');
    const b=await body(req);if(!['claro','escuro','sistema'].includes(b.theme_mode))fail(400,'invalid_mode');
    const r=await transaction(pool,async c=>{
      const r=(await c.query('INSERT INTO pub_theme_preferences(user_identity,theme_mode,is_global,is_separate_from_global) VALUES($1,$2,false,true) ON CONFLICT(user_identity) DO UPDATE SET theme_mode=EXCLUDED.theme_mode,is_global=false,is_separate_from_global=true RETURNING theme_mode',[s.identityId,b.theme_mode])).rows[0];
      await audit(c,s,'theme_preference_update',s.identityId);return r;
    });send(res,200,r);
  });
  return {handleThemes,handleThemeById,handleRollback,handlePreview,handlePreferences};
}
