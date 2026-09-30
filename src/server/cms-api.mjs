import {authorize,audit,body,endpoint,fail,send,textField,transaction,uuid} from './publication-core.mjs';
const TYPES=['pagina','faq','case','blog','vaga','outro'];
const NEXT={rascunho:['em_revisao'],em_revisao:['aprovado','rejeitado'],aprovado:['publicado','arquivado'],publicado:['arquivado'],rejeitado:['arquivado'],arquivado:[]};
const publicRow=r=>({id:r.id,slug:r.slug,title:r.title,excerpt:r.excerpt,content:r.content,content_type:r.content_type,version:r.version,seo_title:r.seo_title,seo_description:r.seo_description});
export function createCmsApi(ctx) {
  const {pool}=ctx;
  const history=async(c,s,r,previous,reason)=>c.query(
    'INSERT INTO cms_content_history(content_id,previous_version,next_version,previous_status,next_status,reason,changed_by_identity,changed_by_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [r.id,previous?.version||null,r.version,previous?.status||null,r.status,reason,s.identityId,s.role]);
  async function draft(c,s,b,reason) {
    const slug=textField(b.slug,3,200,'slug').toLowerCase();
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail(400,'invalid_slug');
    const title=textField(b.title,5,200,'title'),content=textField(b.content,50,20000,'content');
    const type=b.content_type||'pagina'; if(!TYPES.includes(type))fail(400,'invalid_type');
    const excerpt=b.excerpt?textField(b.excerpt,10,1000,'excerpt'):null;
    const seoTitle=b.seo_title?textField(b.seo_title,5,200,'seo_title'):null;
    const seoDescription=b.seo_description?textField(b.seo_description,10,500,'seo_description'):null;
    // No arbitrary HTML, URLs or uploads are rendered. Case consent is explicit.
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['cms:'+slug]);
    const old=(await c.query('SELECT * FROM cms_contents WHERE slug=$1 ORDER BY version DESC LIMIT 1',[slug])).rows[0];
    if(old && old.content_type!==type)fail(409,'slug_type_conflict');
    const r=(await c.query(
      'INSERT INTO cms_contents(slug,title,excerpt,content,content_type,version,is_authorized,seo_title,seo_description,created_by_identity,author_id,author_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11) RETURNING *',
      [slug,title,excerpt,content,type,(old?.version||0)+1,b.is_authorized===true,seoTitle,seoDescription,s.identityId,s.role])).rows[0];
    await c.query('INSERT INTO cms_content_versions(content_id,version,snapshot,change_summary,created_by_identity,created_by_name) VALUES($1,$2,$3,$4,$5,$6)',[r.id,r.version,JSON.stringify(r),reason,s.identityId,s.role]);
    await history(c,s,r,old,reason);await audit(c,s,'cms_content_create',r.id);return r;
  }
  const handleContents=endpoint(async(req,res)=>{
    const u=new URL(req.url,'http://localhost'),isPublic=!u.pathname.startsWith('/api/admin/');
    if(isPublic && req.method!=='GET')fail(405,'public_read_only');
    const s=isPublic?null:await authorize(req,ctx);
    if(req.method==='GET'){
      const type=u.searchParams.get('type');if(type&&!TYPES.includes(type))fail(400,'invalid_type');
      const items=(await pool.query("SELECT * FROM cms_contents WHERE ($1::boolean=false OR (is_published AND status='publicado')) AND ($2::text IS NULL OR content_type::text=$2) ORDER BY slug,version DESC LIMIT 200",[isPublic,type])).rows;
      return send(res,200,{items:isPublic?items.map(publicRow):items});
    }
    if(req.method==='POST'){const b=await body(req);return send(res,201,await transaction(pool,c=>draft(c,s,b,'Criação de nova versão editorial')));}
    fail(405,'method_not_allowed');
  });
  const handleContentById=endpoint(async(req,res,id)=>{
    const s=await authorize(req,ctx);id=id||new URL(req.url,'http://localhost').pathname.split('/').pop();
    if(!uuid(id))fail(400,'invalid_id');
    if(req.method==='GET'){
      const r=(await pool.query('SELECT * FROM cms_contents WHERE id=$1',[id])).rows[0];if(!r)fail(404,'not_found');
      const versions=(await pool.query('SELECT * FROM cms_contents WHERE slug=$1 ORDER BY version DESC',[r.slug])).rows;
      const historyRows=(await pool.query('SELECT h.* FROM cms_content_history h JOIN cms_contents c ON c.id=h.content_id WHERE c.slug=$1 ORDER BY h.created_at DESC',[r.slug])).rows;
      return send(res,200,{...r,versions,history:historyRows});
    }
    if(req.method!=='PATCH')fail(405,'method_not_allowed');
    const b=await body(req),reason=textField(b.reason,10,1000,'reason');
    const r=await transaction(pool,async c=>{
      // One order for locks for create, publish and revert.
      const found=(await c.query('SELECT slug FROM cms_contents WHERE id=$1',[id])).rows[0];if(!found)fail(404,'not_found');
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['cms:'+found.slug]);
      const old=(await c.query('SELECT * FROM cms_contents WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(Object.keys(b).some(k=>!['status','reason'].includes(k)))fail(400,'create_revision_to_edit');
      if(!NEXT[old.status]?.includes(b.status))fail(409,'invalid_transition');
      if(b.status==='publicado' && old.content_type==='case' && !old.is_authorized)fail(409,'case_authorization_required');
      if(b.status==='publicado'){
        const active=(await c.query("UPDATE cms_contents SET is_published=false,status='arquivado' WHERE slug=$1 AND is_published RETURNING *",[old.slug])).rows;
        for(const a of active)await history(c,s,a,{...a,status:'publicado'},'Substituição por nova versão publicada');
      }
      const updated=(await c.query("UPDATE cms_contents SET status=$2,is_published=($2='publicado'),published_at=CASE WHEN $2='publicado' THEN NOW() ELSE published_at END,published_by_identity=CASE WHEN $2='publicado' THEN $3 ELSE published_by_identity END,published_by_name=CASE WHEN $2='publicado' THEN $4 ELSE published_by_name END WHERE id=$1 RETURNING *",[id,b.status,s.identityId,s.role])).rows[0];
      await history(c,s,updated,old,reason);await audit(c,s,b.status==='publicado'?'cms_content_publish':'cms_content_update',id);return updated;
    });send(res,200,r);
  });
  const handleRevert=endpoint(async(req,res)=>{
    const s=await authorize(req,ctx);if(req.method!=='POST')fail(405,'method_not_allowed');
    const b=await body(req);if(!uuid(b.id||b.content_id))fail(400,'invalid_id');
    const reason=textField(b.reason,10,1000,'reason');
    const r=await transaction(pool,async c=>{
      const old=(await c.query('SELECT * FROM cms_contents WHERE id=$1',[b.id||b.content_id])).rows[0];if(!old)fail(404,'not_found');
      const revision=await draft(c,s,old,reason);await audit(c,s,'cms_content_revert',revision.id);return revision;
    });send(res,201,r);
  });
  return {handleContents,handleContentById,handleRevert};
}
