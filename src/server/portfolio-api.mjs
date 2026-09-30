import {randomUUID} from 'node:crypto';
import {authorize,audit,body,endpoint,fail,send,textField,transaction,uuid} from './publication-core.mjs';
const own="(o.responsible_id=$1 OR (o.responsible_id IS NULL AND o.created_by_id=$1))";
export function createPortfolioApi(ctx){
 const {pool}=ctx;
 return endpoint(async(req,res)=>{
  const s=await authorize(req,ctx,['admin','marcelo','ti','comercial']);
  if(req.method==='GET'){
   const u=new URL(req.url,'http://localhost'),filter=u.searchParams.get('filter')||'all',offset=Number(u.searchParams.get('offset')||0);
   if(!['all','no_next','won','lost','overdue'].includes(filter)||!Number.isInteger(offset)||offset<0)fail(400,'invalid_filter');
   const filters={all:'TRUE',no_next:"o.stage NOT IN ('ganho','perdido') AND (o.next_action IS NULL OR o.next_action_date IS NULL)",won:"o.stage='ganho'",lost:"o.stage='perdido'",overdue:"o.stage NOT IN ('ganho','perdido') AND o.next_action_date<NOW()"};
   const where=own+' AND ('+filters[filter]+')';
   const rows=(await pool.query('SELECT o.id,o.title,o.stage,o.company_id,o.unit_id,o.next_action,o.next_action_date,c.display_name AS company_name,g.display_name AS group_name,u.display_name AS unit_name FROM crm_opportunities o JOIN crm_companies c ON c.id=o.company_id LEFT JOIN crm_companies g ON g.id=c.parent_company_id LEFT JOIN crm_company_units u ON u.id=o.unit_id WHERE '+where+' ORDER BY o.next_action_date NULLS FIRST,o.id LIMIT 50 OFFSET $2',[s.identityId,offset])).rows;
   const total=(await pool.query('SELECT COUNT(*)::int AS n FROM crm_opportunities o WHERE '+where,[s.identityId])).rows[0].n;
   const actions=(await pool.query('SELECT a.*,o.title,o.stage FROM crm_portfolio_actions a JOIN crm_opportunities o ON o.id=a.opportunity_id WHERE a.owner_id=$1 ORDER BY a.created_at DESC LIMIT 100',[s.identityId])).rows;
   const metrics=(await pool.query("SELECT a.kind,COUNT(*)::int AS total,COUNT(*) FILTER(WHERE o.stage='ganho')::int AS won,COUNT(*) FILTER(WHERE o.stage='perdido')::int AS lost FROM crm_portfolio_actions a JOIN crm_opportunities o ON o.id=a.opportunity_id WHERE a.owner_id=$1 GROUP BY a.kind",[s.identityId])).rows;
   return send(res,200,{items:rows,total,offset,limit:50,actions,metrics,note:'Carteira pessoal. Ganho comercial não representa faturamento ou recebimento.'});
  }
  if(req.method!=='POST')fail(405,'method_not_allowed');
  const b=await body(req);
  if(!uuid(b.source_id)||!uuid(b.request_key)||!['renovacao','upsell','cross_sell','recuperacao','indicacao'].includes(b.kind))fail(400,'invalid_action');
  const title=textField(b.title,3,200,'title'),next=textField(b.next_action,3,200,'next_action');
  const date=new Date(b.next_action_date);if(!Number.isFinite(date.getTime())||date<=new Date())fail(400,'future_date_required');
  const r=await transaction(pool,async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[s.identityId+':'+b.request_key]);
   const existing=(await c.query('SELECT * FROM crm_portfolio_actions WHERE owner_id=$1 AND request_key=$2',[s.identityId,b.request_key])).rows[0];
   if(existing){if(existing.source_id!==b.source_id||existing.kind!==b.kind)fail(409,'idempotency_conflict');return {...existing,replayed:true};}
   const source=(await c.query('SELECT o.* FROM crm_opportunities o WHERE '+own+' AND o.id=$2 FOR UPDATE',[s.identityId,b.source_id])).rows[0];if(!source)fail(404,'source_not_found');
   if(b.kind==='recuperacao'&&source.stage!=='perdido')fail(409,'lost_source_required');
   const company=b.kind==='indicacao'?b.target_company_id:source.company_id;
   if(!uuid(company))fail(400,'target_company_required');
   if(!(await c.query("SELECT id FROM crm_companies WHERE id=$1 AND status='active'",[company])).rows.length)fail(404,'company_not_found');
   const id=randomUUID();
   await c.query("INSERT INTO crm_opportunities(id,company_id,unit_id,title,responsible_id,responsible_name,next_action,next_action_date,origin,created_by_id,stage) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'carteira',$5,'novo')",[id,company,b.kind==='indicacao'?null:source.unit_id,title,s.identityId,s.role,next,date.toISOString()]);
   await c.query("INSERT INTO crm_opportunity_stages(id,opportunity_id,next_stage,changed_by_id,changed_by_role,reason) VALUES($1,$2,'novo',$3,$4,$5)",[randomUUID(),id,s.identityId,s.role,'Ação de carteira: '+b.kind]);
   if(b.kind==='indicacao'){
    await c.query("INSERT INTO crm_referrals(referrer_company_id,referred_company_id,opportunity_id,title,responsible_id,responsible_name,created_by,created_by_id) VALUES($1,$2,$3,$4,$5,$6,$6,$5)",[source.company_id,company,id,title,s.identityId,s.role]);
   }else{
    await c.query('INSERT INTO crm_renewals(company_id,opportunity_id,type,title,responsible_id,responsible_name,created_by,created_by_id) VALUES($1,$2,$3,$4,$5,$6,$6,$5)',[company,id,b.kind,title,s.identityId,s.role]);
   }
   const result=(await c.query('INSERT INTO crm_portfolio_actions(owner_id,request_key,source_id,opportunity_id,kind) VALUES($1,$2,$3,$4,$5) RETURNING *',[s.identityId,b.request_key,source.id,id,b.kind])).rows[0];
   await audit(c,s,'crm_portfolio_action',id);await audit(c,s,'crm_opportunity_create',id);return result;
  });send(res,r.replayed?200:201,r);
 });
}
