import {randomBytes} from 'node:crypto';
import {authorize,audit,body,endpoint,fail,send,textField,transaction,uuid} from './publication-core.mjs';
const seeds=new Set(['catalogo_apenas_validado','sem_preco_demo_producao','compatibilidade_servicos']);
export function createPackageApi(ctx){
  const {pool}=ctx;
  async function evaluate(c,ids){
    if(!Array.isArray(ids)||!ids.length||ids.length>6||new Set(ids).size!==ids.length||ids.some(x=>typeof x!=='string'))fail(400,'invalid_services');
    const services=(await c.query('SELECT id,name,short_description FROM service_catalog WHERE id=ANY($1::text[]) AND is_published AND is_validated ORDER BY name',[ids])).rows;
    if(services.length!==ids.length)fail(409,'service_not_approved');
    const rules=(await c.query('SELECT * FROM pub_package_rules WHERE is_approved ORDER BY rule_key')).rows;
    if(!rules.some(r=>r.rule_key==='catalogo_apenas_validado')||!rules.some(r=>r.rule_key==='sem_preco_demo_producao'))fail(409,'required_rule_not_approved');
    for(const r of rules){
      if(seeds.has(r.rule_key))continue;
      const members=r.rule_data?.service_ids;
      if(!['inclusao_obrigatoria','exclusao'].includes(r.rule_type)||!Array.isArray(members)||!members.length)fail(409,'unsupported_approved_rule');
      if(r.rule_type==='inclusao_obrigatoria'&&!members.every(x=>ids.includes(x)))fail(409,'required_service_missing');
      if(r.rule_type==='exclusao'&&members.some(x=>ids.includes(x)))fail(409,'excluded_service');
    }
    return {services,rules:rules.map(r=>({id:r.id,version:r.version,rule_key:r.rule_key}))};
  }
  const safe=r=>({id:r.id,name:r.name,description:r.description,service_ids:r.service_ids,service_details:r.service_details,estimate_note:r.estimate_note,total_price_cents:null});
  const handleRules=endpoint(async(req,res)=>{
    const s=await authorize(req,ctx);
    if(req.method==='GET')return send(res,200,{items:(await pool.query('SELECT * FROM pub_package_rules ORDER BY rule_key')).rows,services:(await pool.query('SELECT id,name FROM service_catalog WHERE is_published AND is_validated ORDER BY name')).rows});
    const b=await body(req);
    if(req.method==='PATCH'){
      if(!uuid(b.id)||typeof b.is_approved!=='boolean'||Object.keys(b).some(k=>!['id','is_approved'].includes(k)))fail(400,'invalid_rule_update');
      return send(res,200,await transaction(pool,async c=>{
        await c.query("SELECT pg_advisory_xact_lock(hashtext('service-packages'))");
        const r=(await c.query('UPDATE pub_package_rules SET is_approved=$2,version=version+1,approved_by_identity=$3,approved_at=NOW() WHERE id=$1 RETURNING *',[b.id,b.is_approved,s.identityId])).rows[0];if(!r)fail(404,'not_found');
        // Every rule change revokes publication; existing approval cannot outlive its inputs.
        await c.query("UPDATE pub_service_packages SET is_published=false,is_approved=false,status='em_revisao' WHERE is_published OR is_approved");
        await audit(c,s,'package_rule_update',b.id);return r;
      }));
    }
    if(req.method!=='POST')fail(405,'method_not_allowed');
    const key=textField(b.rule_key,3,100,'rule_key'),name=textField(b.name,3,200,'name'),description=textField(b.description,10,2000,'description');
    if(seeds.has(key)||!['inclusao_obrigatoria','exclusao'].includes(b.rule_type)||!Array.isArray(b.service_ids)||!b.service_ids.length||b.service_ids.length>6)fail(400,'invalid_rule');
    const valid=(await pool.query('SELECT id FROM service_catalog WHERE id=ANY($1::text[])',[b.service_ids])).rows;
    if(valid.length!==new Set(b.service_ids).size)fail(400,'unknown_service');
    const r=await transaction(pool,async c=>{
      const r=(await c.query('INSERT INTO pub_package_rules(rule_key,name,description,rule_type,rule_data,created_by_identity) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[key,name,description,b.rule_type,JSON.stringify({service_ids:b.service_ids}),s.identityId])).rows[0];
      await audit(c,s,'package_rule_create',r.id);return r;
    });send(res,201,r);
  });
  const handlePackages=endpoint(async(req,res)=>{
    const u=new URL(req.url,'http://localhost'),pub=['/api/packages','/api/public/packages'].includes(u.pathname);
    if(pub&&req.method!=='GET')fail(405,'public_read_only');
    const s=pub?null:await authorize(req,ctx);
    if(req.method==='GET'){
      const rows=(await pool.query("SELECT * FROM pub_service_packages WHERE ($1=false OR (is_published AND is_approved AND status='publicado' AND NOT is_demo AND total_price_cents IS NULL)) ORDER BY created_at DESC LIMIT 100",[pub])).rows;
      if(!pub)return send(res,200,{items:rows});
      const items=[];for(const r of rows){try{await evaluate(pool,r.service_ids);items.push(safe(r));}catch(e){if(!e.status)throw e;}}
      return send(res,200,{items});
    }
    const b=await body(req);
    if(req.method==='POST'){
      if(['total_price_cents','total_cost_cents','margin_percent'].some(k=>b[k]!=null))fail(400,'price_requires_costing_workflow');
      const name=textField(b.name,3,200,'name'),description=textField(b.description,10,2000,'description');
      const r=await transaction(pool,async c=>{
        await c.query("SELECT pg_advisory_xact_lock(hashtext('service-packages'))");
        const {services,rules}=await evaluate(c,b.service_ids);
        const protocol='PKG-PUB-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+randomBytes(2).toString('hex').toUpperCase();
        const r=(await c.query("INSERT INTO pub_service_packages(protocol,name,description,service_ids,service_details,rules_applied,estimate_note,created_by_identity,created_by_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",[protocol,name,description,b.service_ids,JSON.stringify(services),JSON.stringify(rules),'Preço sob consulta. Escopo, compatibilidade de equipamentos, cobertura e prazo dependem de avaliação e proposta.',s.identityId,s.role])).rows[0];
        await audit(c,s,'package_create',r.id);return r;
      });return send(res,201,r);
    }
    if(req.method!=='PATCH'||!uuid(b.id))fail(400,'invalid_request');
    const reason=textField(b.reason,10,1000,'reason');
    const r=await transaction(pool,async c=>{
      await c.query("SELECT pg_advisory_xact_lock(hashtext('service-packages'))");
      const old=(await c.query('SELECT * FROM pub_service_packages WHERE id=$1 FOR UPDATE',[b.id])).rows[0];if(!old)fail(404,'not_found');
      const next={rascunho:['em_revisao'],em_revisao:['aprovado','rejeitado'],aprovado:['publicado','arquivado'],publicado:['arquivado'],rejeitado:['em_revisao'],arquivado:['em_revisao']};
      if(!next[old.status]?.includes(b.status))fail(409,'invalid_transition');
      const {services,rules}=await evaluate(c,old.service_ids);
      const r=(await c.query("UPDATE pub_service_packages SET status=$2,is_published=($2='publicado'),is_approved=($2 IN ('aprovado','publicado')),service_details=$3,rules_applied=$4,version=version+1,approved_by_identity=$5,approved_at=NOW(),total_price_cents=NULL,total_cost_cents=NULL,margin_percent=NULL WHERE id=$1 RETURNING *",[b.id,b.status,JSON.stringify(services),JSON.stringify(rules),s.identityId])).rows[0];
      await c.query('INSERT INTO pub_package_history(package_id,previous_version,next_version,previous_status,next_status,reason,changed_by_identity,changed_by_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[r.id,old.version,r.version,old.status,r.status,reason,s.identityId,s.role]);
      await audit(c,s,'package_update',r.id);return r;
    });send(res,200,r);
  });
  const handleComparisons=endpoint(async(req,res)=>{
    const s=await authorize(req,ctx);
    if(req.method==='GET')return send(res,200,{items:(await pool.query('SELECT * FROM pub_package_comparisons ORDER BY created_at DESC LIMIT 100')).rows});
    if(req.method!=='POST')fail(405,'method_not_allowed');
    const b=await body(req),ids=b.package_ids;if(!Array.isArray(ids)||ids.length<2||ids.length>5||new Set(ids).size!==ids.length||ids.some(x=>!uuid(x)))fail(400,'invalid_packages');
    const title=textField(b.title,3,200,'title');
    const r=await transaction(pool,async c=>{
      await c.query("SELECT pg_advisory_xact_lock(hashtext('service-packages'))");
      const rows=(await c.query("SELECT * FROM pub_service_packages WHERE id::text=ANY($1::text[]) AND is_approved AND NOT is_demo AND status IN ('aprovado','publicado')",[ids])).rows;
      if(rows.length!==ids.length)fail(409,'package_not_approved');
      for(const p of rows)await evaluate(c,p.service_ids);
      const r=(await c.query('INSERT INTO pub_package_comparisons(title,package_ids,comparison_data,created_by_identity,created_by_name) VALUES($1,$2,$3,$4,$5) RETURNING *',[title,ids,JSON.stringify({packages:rows.map(safe),price_note:'Sob consulta; ausência de preço não representa zero.'}),s.identityId,s.role])).rows[0];
      await audit(c,s,'package_comparison_create',r.id);return r;
    });send(res,201,r);
  });
  return {handleRules,handlePackages,handleComparisons};
}
