import {hasPermission} from './rbac.mjs';
import {endpoint,fail,send,body,transaction,textField,uuid} from './publication-core.mjs';
const visuals=new Set(['01','02','03','04','05','06','07','08','09','10']);
export function createSiteAppearanceApi({getPool,readSession,sameOrigin}){
 return endpoint(async(req,res)=>{
  const pool=getPool(),adminRead=new URL(req.url,'http://localhost').pathname==='/api/admin/site-visual';
  if(req.method==='GET'){
   let canManage=false;
   if(adminRead){
    const s=await readSession(req);if(!uuid(s?.identityId))fail(401,'individual_staff_required');
    if(!['admin','marcelo','ti'].includes(s.role))fail(403,'role_required');
    canManage=await hasPermission(pool,{identityId:s.identityId,permission:'site.visual.write'});
   }
   const row=(await pool.query('SELECT active_visual,updated_at FROM site_visual_config WHERE singleton_id=1')).rows[0];
   if(!row)fail(503,'migration_required');
   return send(res,200,{visual:row.active_visual,updatedAt:row.updated_at,selectionEnabled:true,...(adminRead?{canManage}:{}),source:'postgres'});
  }
  if(req.method!=='PUT')fail(405,'method_not_allowed');
  if(!sameOrigin(req))fail(403,'same_origin_required');
  const s=await readSession(req);if(!uuid(s?.identityId))fail(401,'individual_staff_required');
  if(!['admin','marcelo','ti'].includes(s.role))fail(403,'role_required');
  if(!await hasPermission(pool,{identityId:s.identityId,permission:'site.visual.write'}))fail(403,'visual_permission_required');
  const b=await body(req);if(!visuals.has(b.visual)||!visuals.has(b.expectedVisual))fail(400,'invalid_visual_id');
  const reason=textField(b.reason,10,1000,'reason');
  const result=await transaction(pool,async c=>{
   const old=(await c.query('SELECT active_visual FROM site_visual_config WHERE singleton_id=1 FOR UPDATE')).rows[0];
   if(!old)fail(503,'migration_required');if(old.active_visual!==b.expectedVisual)fail(409,'visual_changed_refresh');
   if(!await hasPermission(c,{identityId:s.identityId,permission:'site.visual.write'}))fail(403,'visual_permission_required');
   if(old.active_visual===b.visual)return {visual:old.active_visual,unchanged:true};
   const updated=(await c.query('UPDATE site_visual_config SET active_visual=$1,updated_by=$2,updated_at=now() WHERE singleton_id=1 RETURNING active_visual,updated_at',[b.visual,s.role])).rows[0];
   await c.query('INSERT INTO site_visual_audit(previous_visual,next_visual,changed_by,actor_identity_id,reason) VALUES($1,$2,$3,$4,$5)',[old.active_visual,b.visual,s.role,s.identityId,reason]);
   await c.query('INSERT INTO audit_log(action,actor,target,meta) VALUES($1,$2,$3,$4)',['site_visual_change',s.identityId,b.visual,JSON.stringify({previous:old.active_visual,next:b.visual,reason})]);
   return {visual:updated.active_visual,updatedAt:updated.updated_at,selectionEnabled:true};
  });send(res,200,result);
 });
}
