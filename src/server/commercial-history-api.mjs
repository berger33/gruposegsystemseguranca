import {authorize,endpoint,fail,send,uuid} from './publication-core.mjs';
export function createCommercialHistoryApi(ctx){
 return endpoint(async(req,res)=>{
  await authorize(req,ctx);if(req.method!=='GET')fail(405,'method_not_allowed');
  const u=new URL(req.url,'http://localhost'),id=u.searchParams.get('id'),type=u.searchParams.get('type');
  if(!uuid(id)||!['crm_goals','crm_commission_rules','crm_commissions','crm_commercial_library'].includes(type))fail(400,'invalid_entity');
  send(res,200,{items:(await ctx.pool.query('SELECT version,snapshot,created_at FROM crm_commercial_versions WHERE entity_type=$1 AND entity_id=$2 ORDER BY version DESC',[type,id])).rows});
 });
}
