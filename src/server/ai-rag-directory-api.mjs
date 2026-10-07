import { realpath, readdir, readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const keys=role=>role==='admin'?['publico','cliente','rh','marcelo']:role==='ti'?['publico','cliente']:[];
function relative(value){
 if(typeof value!=='string'||value.length>500||path.isAbsolute(value)||value.includes(':')||value.includes('\0')||value.split(/[\\/]/).some(s=>s==='..'))throw Error('invalid_relative_path');
 return path.normalize(value||'.').replace(/[\\/]+$/,'')||'.';
}
function inside(root,target){const rel=path.relative(root,target);return !rel.startsWith('..')&&!path.isAbsolute(rel);}
async function roots(){
 let config;try{config=JSON.parse(process.env.RAG_DOCUMENT_ROOTS_JSON||'{}');}catch{throw Error('roots_configuration_invalid');}
 const result=Object.create(null);
 for(const [key,value] of Object.entries(config)){
  if(!/^[a-zA-Z0-9_-]{1,40}$/.test(key)||!value||typeof value!=='object'||!path.isAbsolute(value.path||'')||!['publico','cliente','rh','marcelo'].includes(value.rag_key))throw Error('roots_configuration_invalid');
  if(value.rag_key==='cliente'&&!UUID.test(value.client_account_id||''))throw Error('roots_configuration_invalid');
  result[key]={path:await realpath(value.path),rag_key:value.rag_key,client_account_id:value.client_account_id||null};
 }
 for(const [key,a] of Object.entries(result))for(const [other,b] of Object.entries(result))if(key!==other&&(inside(a.path,b.path)||inside(b.path,a.path))&&(a.rag_key!==b.rag_key||a.client_account_id!==b.client_account_id))throw Error('roots_configuration_invalid');
 return result;
}
async function folder(allowed,key,rel,ragKey,account){
 if(!allowed[key])throw Error('root_not_allowed');
 const binding=allowed[key];if(binding.rag_key!==ragKey||String(binding.client_account_id||'').toLowerCase()!==String(account||'').toLowerCase())throw Error('root_scope_mismatch');
 const root=binding.path;const candidate=path.resolve(root,relative(rel));
 if(!inside(root,candidate))throw Error('path_outside_root');
 let current=root;
 for(const segment of path.relative(root,candidate).split(path.sep).filter(Boolean)){
  current=path.join(current,segment);if((await lstat(current)).isSymbolicLink())throw Error('symlink_not_allowed');
 }
 const resolved=await realpath(candidate);
 if(!inside(root,resolved)||!(await lstat(resolved)).isDirectory())throw Error('invalid_directory');
 return resolved;
}
export function createAiRagDirectoryApi({pool,sameOrigin,readSession}){
 async function body(req){let text='';for await(const chunk of req){text+=chunk.toString('utf8');if(text.length>4096)throw Error('body_too_large');}return JSON.parse(text||'{}');}
 async function transaction(actor,action,target,work){
  const client=await pool.connect();
  try{await client.query('BEGIN');const value=await work(client);await client.query('INSERT INTO audit_log(action,actor,target,meta) VALUES($1,$2,$3,$4)',[action,actor,target,JSON.stringify({directory_source:true})]);await client.query('COMMIT');return value;}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 return async function handle(req,res){
  if(!sameOrigin(req))return send(res,403,{error:'same_origin_required'});
  const actor=await readSession(req);if(!actor?.identityId)return send(res,401,{error:'staff_session_required'});
  const scopes=keys(actor.role);if(!scopes.length)return send(res,403,{error:'scope_forbidden'});
  try{
   const allowed=await roots();
   if(req.method==='GET'){
    const {rows}=await pool.query('SELECT * FROM ai_rag_directory_sources WHERE rag_key=ANY($1::text[]) ORDER BY name',[scopes]);
    const accounts=(await pool.query("SELECT id,display_name FROM client_accounts WHERE status='active' ORDER BY display_name LIMIT 200")).rows;
    return send(res,200,{items:rows,accounts,scopes,roots:Object.keys(allowed).filter(key=>scopes.includes(allowed[key].rag_key)),runtime:{enabled:process.env.OLLAMA_ENABLED==='true',model:process.env.OLLAMA_MODEL||'qwen3:1.7b',retrieval:'lexical',concurrency:1}});
   }
   if(!['POST','PATCH'].includes(req.method))return send(res,405,{error:'method_not_allowed'});
   const b=await body(req);
   if(!b||typeof b!=='object'||Array.isArray(b))return send(res,400,{error:'invalid_body'});
   if(b.action==='create'){
    if(!scopes.includes(b.rag_key))return send(res,403,{error:'scope_forbidden'});
    const name=String(b.name||'').trim();if(name.length<3||name.length>120)return send(res,400,{error:'invalid_name'});
    const rel=relative(b.relative_path);
    const account=b.rag_key==='cliente'?b.client_account_id:null;
    if(b.rag_key==='cliente'&&!UUID.test(account||''))return send(res,400,{error:'client_account_required'});
    await folder(allowed,b.root_key,rel,b.rag_key,account);
    const value=await transaction(actor.identityId,'rag_source_create',b.root_key,async c=>{
     if(account&&!(await c.query("SELECT id FROM client_accounts WHERE id=$1 AND status='active'",[account])).rows.length)throw Error('client_account_invalid');
     const created=(await c.query('INSERT INTO ai_rag_directory_sources(name,rag_key,client_account_id,root_key,relative_path,created_by_identity) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING *',[name,b.rag_key,account,b.root_key,rel,actor.identityId])).rows[0];
     if(created)return created;
     const existing=(await c.query('SELECT * FROM ai_rag_directory_sources WHERE rag_key=$1 AND client_account_id IS NOT DISTINCT FROM $2::uuid AND root_key=$3 AND relative_path=$4',[b.rag_key,account,b.root_key,rel])).rows[0];
     if(!existing||existing.name!==name)throw Error('source_already_registered');return existing;
    });return send(res,201,value);
   }
   if(!UUID.test(b.id||''))return send(res,400,{error:'invalid_id'});
   const report=await transaction(actor.identityId,'rag_source_change',b.id,async c=>{
    const source=(await c.query('SELECT * FROM ai_rag_directory_sources WHERE id=$1 AND rag_key=ANY($2::text[]) FOR UPDATE',[b.id,scopes])).rows[0];
    if(!source)throw Error('source_not_found');
    if(b.action==='toggle'){await c.query('UPDATE ai_rag_directory_sources SET is_active=$2 WHERE id=$1',[b.id,b.is_active===true]);return {updated:true};}
    if(b.action!=='sync'||!source.is_active)throw Error('source_inactive_or_invalid_action');
    const base=await folder(allowed,source.root_key,source.relative_path,source.rag_key,source.client_account_id);
    const index=(await c.query('SELECT id FROM ai_rag_indexes WHERE rag_key=$1 LIMIT 1',[source.rag_key])).rows[0];
    if(!index)throw Error('rag_index_not_found');
    const result={created:0,unchanged:0,failed:[],missing:[],note:'Importação em rascunho; revisão e publicação obrigatórias.'};
    const seen=new Set();let count=0,bytes=0,directories=0;
    async function walk(dir){
     if(++directories>100)throw Error('directory_limit_exceeded');
     const entries=await readdir(dir,{withFileTypes:true});
     if(entries.length>500)throw Error('directory_limit_exceeded');
     for(const entry of entries){
      const file=path.join(dir,entry.name);const rel=path.relative(base,file);
      if(entry.isSymbolicLink()){result.failed.push({file:rel,error:'symlink_not_allowed'});continue;}
      if(entry.isDirectory()){if(rel.split(path.sep).length>5){result.failed.push({file:rel,error:'depth_limit'});continue;}await walk(file);continue;}
      if(!entry.isFile()||!['.txt','.md'].includes(path.extname(file).toLowerCase()))continue;
      seen.add(rel);if(++count>100)throw Error('file_limit_exceeded');
      try{
       const actual=await realpath(file);if(!inside(base,actual))throw Error('path_outside_root');
       const stat=await lstat(file);if(stat.isSymbolicLink()||stat.size>80000)throw Error('file_too_large_or_link');
       bytes+=stat.size;if(bytes>2000000)throw Error('total_size_exceeded');
       const data=await readFile(file);const text=new TextDecoder('utf-8',{fatal:true}).decode(data).trim();
       if(text.length<20||text.length>20000)throw Error('invalid_content_length');
       const hash=createHash('sha256').update(data).digest('hex');
       const old=(await c.query('SELECT * FROM ai_rag_directory_files WHERE source_id=$1 AND relative_file=$2',[b.id,rel])).rows[0];
       if(old?.content_hash===hash){result.unchanged++;continue;}
       const title=(`${source.name} — ${entry.name}`).slice(0,500);
       const doc=(await c.query("INSERT INTO ai_rag_documents(rag_index_id,rag_key,title,content,source,source_type,keywords,created_by_identity,client_account_id,status,is_approved,is_published) VALUES($1,$2,$3,$4,$5,'manual',$6,$7,$8,'rascunho',false,false) RETURNING id",[index.id,source.rag_key,title,text,`${source.name}/${rel}`.slice(0,500),[],actor.identityId,source.client_account_id])).rows[0];
       if(old?.document_id)await c.query('UPDATE ai_rag_documents SET supersedes_document_id=$2,version=(SELECT version+1 FROM ai_rag_documents WHERE id=$2) WHERE id=$1',[doc.id,old.document_id]);
       for(let offset=0,n=0;offset<text.length;offset+=800,n++)await c.query('INSERT INTO ai_rag_chunks(document_id,rag_index_id,rag_key,chunk_index,content,token_count,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)',[doc.id,index.id,source.rag_key,n,text.slice(offset,offset+800),Math.ceil(text.slice(offset,offset+800).length/4),JSON.stringify({directory_source_id:b.id,content_hash:hash,previous_document_id:old?.document_id||null})]);
       await c.query('INSERT INTO ai_rag_directory_files(source_id,relative_file,content_hash,document_id) VALUES($1,$2,$3,$4) ON CONFLICT(source_id,relative_file) DO UPDATE SET content_hash=excluded.content_hash,document_id=excluded.document_id',[b.id,rel,hash,doc.id]);result.created++;
      }catch(error){if(error.code)throw error;result.failed.push({file:rel,error:error.message});}
     }
    }
    await walk(base);
    if(count===0)result.note='Nenhum arquivo .txt ou .md encontrado nesta pasta. Nenhuma publicação foi alterada.';
    for(const row of (await c.query('SELECT relative_file FROM ai_rag_directory_files WHERE source_id=$1',[b.id])).rows)if(!seen.has(row.relative_file))result.missing.push(row.relative_file);
    await c.query('UPDATE ai_rag_directory_sources SET last_synced_at=now(),last_report=$2 WHERE id=$1',[b.id,JSON.stringify(result)]);return result;
   });return send(res,200,report);
  }catch(error){
   if(error instanceof SyntaxError)return send(res,400,{error:'invalid_json'});
   const known=['invalid_relative_path','root_not_allowed','root_scope_mismatch','path_outside_root','symlink_not_allowed','invalid_directory','body_too_large','client_account_invalid','rag_index_not_found','source_inactive_or_invalid_action','file_limit_exceeded','directory_limit_exceeded','source_already_registered'];
   return send(res,error.message==='source_not_found'?404:known.includes(error.message)?400:503,{error:known.includes(error.message)||error.message==='source_not_found'?error.message:'directory_source_unavailable'});
  }
 };
}
