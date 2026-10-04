// EXT-07: PostgreSQL real + servidor HTTP real; somente fixtures .invalid.
// Executado pelo gate dedicado (npm run test:ext07-compliance:pg) com cluster
// descartável. Nenhum skip/fail/todo é aceito pelo autoaudit do gate.
import test,{before,after} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createHash,randomBytes,randomUUID} from "node:crypto";
import {access} from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import {hashPassword} from "../src/lib/client-auth-core.mjs";
const RUN=process.env.RUN_DATABASE_INTEGRATION==="1"&&process.env.DATABASE_URL,REQUIRE=process.env.QA_EXT07_REQUIRE_DB==="1",root=path.resolve(import.meta.dirname,"..");
test("EXT-07 gate exige PostgreSQL real",()=>{if(REQUIRE)assert.ok(RUN)});
let server,base,pool,ti,ti2,rh,cookieTi,cookieTi2,cookieRh,serverLogs="";const idem=t=>`ext07-${t}-${randomUUID()}`;const fetchWithTimeout=(url,init={})=>fetch(url,{...init,signal:AbortSignal.timeout(init.method==="POST"?120000:90000)});
async function wait(){for(let i=0;i<240;i++){try{if([200,401].includes((await fetchWithTimeout(`${base}/api/admin/session`,{signal:undefined})).status))return}catch{}await new Promise(r=>setTimeout(r,400))}throw Error("server_did_not_start")}
async function staff(role,tag){const id=randomUUID(),email=`ext07-${tag||role}-${id.slice(0,8)}@example.invalid`,password="Senha-Sintetica-9!";await pool.query(`INSERT INTO auth_identities(id,kind,email,display_name,status) VALUES($1,'staff',$2,$3,'active')`,[id,email,`QA EXT07 ${role}`]);await pool.query(`INSERT INTO auth_credentials(identity_id,password_hash) VALUES($1,$2)`,[id,await hashPassword(password)]);await pool.query(`INSERT INTO auth_staff_profiles(identity_id,role,assigned_by) VALUES($1,$2,'admin_system')`,[id,role]);return{id,email,password}}
async function login(s){const r=await fetchWithTimeout(`${base}/api/admin/session`,{method:"POST",headers:{"content-type":"application/json",origin:base},body:JSON.stringify({email:s.email,password:s.password})});assert.equal(r.status,200);return r.headers.getSetCookie().find(x=>x.startsWith("seg_admin_session=")).split(";")[0]}
async function api(url,{method="GET",cookie=cookieTi,body,key,origin=base,raw}={}){const headers={accept:"application/json",origin,...(cookie?{cookie}:{}),...(method!=="GET"?{"idempotency-key":key===null?"":key||idem("request")}:{})};if(raw===undefined&&body!==undefined)headers["content-type"]="application/json";const r=await fetchWithTimeout(base+url,{method,headers,body:raw===undefined?(body===undefined?undefined:JSON.stringify(body)):raw});const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={raw:text.slice(0,120)}}return{status:r.status,body:data,text}}
const today=new Date();const iso=d=>d.toISOString().slice(0,10);
const daysAgo=n=>iso(new Date(today.getTime()-n*86400000)),daysAhead=n=>iso(new Date(today.getTime()+n*86400000));
const obBody=over=>({obligation_type:"licenca",title:"Licença sintética de operação",description:"Descrição sintética suficientemente longa para a jornada EXT-07.",declared_source:"Política interna sintética versão 1",applicability_scope:"Unidade sintética",applicability_justification:"Aplicabilidade declarada sinteticamente para a jornada.",validity_rule:"validade_anual_renovavel",criticality:"alta",responsible_identity:ti.id,...over});
async function createObligation(over={},options={}){const r=await api("/api/ext/compliance/obligations",{method:"POST",body:obBody(over),...options});assert.equal(r.status,201,r.text);return r.body.obligation}
const docBody=over=>({title:"Referência sintética",description:"Descrição sintética da referência documental privada.",compliance_type:"licenca",issue_date:daysAgo(5),expiry_date:daysAhead(30),declared_reference:"REF-SINTETICA-0001",reference_source:"Órgão declarado sintético",...over});
async function createDocument(obligationId,over={},options={}){const r=await api("/api/ext/compliance/documents",{method:"POST",body:{...docBody({obligation_id:obligationId,reference_type:"referencia_declarada"}),...over},...options});return r}
before(async()=>{if(!RUN)return;pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:10});const port=3600+Math.floor(Math.random()*900);base=`http://127.0.0.1:${port}`;server=spawn(process.execPath,["server.mjs","--dev"],{cwd:root,env:{...process.env,PORT:String(port),BIND_HOST:"127.0.0.1",NODE_ENV:"development",NEXT_DIST_DIR:".next/integration-ext07",SITE_ADMIN_SESSION_SECRET:randomUUID().repeat(2),CLIENT_MFA_ENCRYPTION_KEY:randomBytes(32).toString("base64url"),SITE_ADMIN_LEGACY_TOKENS:"",OLLAMA_ENABLED:"false",MAIL_HOST:"",NEXT_TELEMETRY_DISABLED:"1"},stdio:["ignore","pipe","pipe"]});server.stdout.on("data",x=>serverLogs+=x);server.stderr.on("data",x=>serverLogs+=x);try{await wait()}catch(e){throw Error(`${e.message}\n${serverLogs.slice(-3000)}`)}ti=await staff("ti");ti2=await staff("ti","ti2");rh=await staff("rh");cookieTi=await login(ti);cookieTi2=await login(ti2);cookieRh=await login(rh)});
after(async()=>{await pool?.end().catch(()=>{});if(server&&!server.killed){server.kill("SIGTERM");await new Promise(r=>setTimeout(r,300));server.kill("SIGKILL")}if(serverLogs.trim())console.error(`SERVER_LOGS_TAIL_BEGIN\n${serverLogs.slice(-5000)}\nSERVER_LOGS_TAIL_END`)});
const opt={skip:!RUN};

test("EXT-07 cluster limpo não teve seed e ausência não é zero",opt,async()=>{
  const counts=(await pool.query(`SELECT (SELECT count(*) FROM ext_compliance_obligations) o,(SELECT count(*) FROM ext_compliance_documents WHERE origin='ext07_canonica') d,(SELECT count(*) FROM ext_compliance_tasks) t,(SELECT count(*) FROM ext_compliance_events) e`)).rows[0];
  assert.deepEqual(counts,{o:"0",d:"0",t:"0",e:"0"});
  const list=await api("/api/ext/compliance/obligations");
  assert.equal(list.status,200);assert.equal(list.body.items.length,0);
  assert.equal(list.body.absence_is_not_zero,true);assert.equal(list.body.denominator,0);
  assert.equal(list.body.source,"ext_compliance_obligations");
});
test("EXT-07 HTTP anônimo 401 em todas as rotas canônicas",opt,async()=>{
  for(const url of ["/api/ext/compliance/obligations","/api/ext/compliance/documents","/api/ext/compliance/tasks"]){
    assert.equal((await api(url,{cookie:null})).status,401,url);
  }
  assert.equal((await api("/api/ext/compliance/evaluate",{method:"POST",body:{},cookie:null})).status,401);
  assert.equal((await api("/api/ext/compliance/obligations",{method:"POST",body:{},cookie:null})).status,401);
});
test("EXT-07 HTTP papel staff não autorizado 403 distinto de 401",opt,async()=>{
  for(const url of ["/api/ext/compliance/obligations","/api/ext/compliance/documents","/api/ext/compliance/tasks"]){
    assert.equal((await api(url,{cookie:cookieRh})).status,403,url);
  }
  assert.equal((await api("/api/ext/compliance/evaluate",{method:"POST",body:{},cookie:cookieRh})).status,403);
});
test("EXT-07 HTTP same-origin apenas em mutações",opt,async()=>{
  assert.equal((await api("/api/ext/compliance/obligations",{origin:"https://attacker.invalid"})).status,200);
  for(const call of [
    {url:"/api/ext/compliance/obligations",body:obBody()},
    {url:"/api/ext/compliance/documents",body:{}},
    {url:"/api/ext/compliance/evaluate",body:{}},
  ]) assert.equal((await api(call.url,{method:"POST",body:call.body,origin:"https://attacker.invalid"})).status,403);
});
test("EXT-07 HTTP Idempotency-Key obrigatória nas mutações",opt,async()=>{
  assert.equal((await api("/api/ext/compliance/obligations",{method:"POST",body:obBody(),key:null})).status,400);
});
test("EXT-07 HTTP JSON inválido 400 e corpo grande 413",opt,async()=>{
  assert.equal((await api("/api/ext/compliance/obligations",{method:"POST",raw:"{"})).status,400);
  assert.equal((await api("/api/ext/compliance/obligations",{method:"POST",raw:JSON.stringify({x:"y".repeat(140*1024)})})).status,413);
});
test("EXT-07 HTTP UUID inválido 400 (documento, detalhe, renovação, tarefa)",opt,async()=>{
  assert.equal((await createDocument("não-uuid")).status,400);
  assert.equal((await api("/api/ext/compliance/documents/não-uuid")).status,400);
  assert.equal((await api("/api/ext/compliance/documents/não-uuid/renew",{method:"POST",body:{}})).status,400);
  assert.equal((await api("/api/ext/compliance/tasks/não-uuid/start",{method:"POST",body:{}})).status,400);
});
test("EXT-07 UI /admin/compliance responde",opt,async()=>{
  const r=await fetch(`${base}/admin/compliance`,{signal:AbortSignal.timeout(240000)});const html=await r.text();
  assert.equal(r.status,200);assert.match(html,/Compliance|compliance/);
});
test("EXT-07 não existe rota pública de compliance",opt,async()=>{
  for(const url of ["/api/public/compliance-documents","/api/client/compliance-documents","/api/public/compliance","/api/client/compliance","/api/compliance-documents"]) {
    const r=await api(url,{cookie:null});
    assert.ok([401,403,404].includes(r.status),`${url} → ${r.status}`);
    if(r.status===404&&r.body?.error) assert.equal(r.body.error,"not_found");
  }
});
test("EXT-07 obrigação exige campos declarativos completos",opt,async()=>{
  for(const missing of ["obligation_type","title","description","declared_source","applicability_scope","applicability_justification","validity_rule"]) {
    const body={...obBody()};delete body[missing];
    assert.equal((await api("/api/ext/compliance/obligations",{method:"POST",body})).status,400,missing);
  }
  assert.equal((await api("/api/ext/compliance/obligations",{method:"POST",body:obBody({obligation_type:"x"})})).status,400);
});
test("EXT-07 obrigação exige responsável staff ativo canônico",opt,async()=>{
  assert.equal((await api("/api/ext/compliance/obligations",{method:"POST",body:obBody({responsible_identity:randomUUID()})})).status,400);
  const clientId=randomUUID();
  await pool.query(`INSERT INTO auth_identities(id,kind,email,display_name,status) VALUES($1,'client',$2,'Cliente sintético','active')`,[clientId,`cli-${clientId.slice(0,8)}@example.invalid`]);
  assert.equal((await api("/api/ext/compliance/obligations",{method:"POST",body:obBody({responsible_identity:clientId})})).status,400);
  const suspended=randomUUID();
  await pool.query(`INSERT INTO auth_identities(id,kind,email,display_name,status) VALUES($1,'staff',$2,'Staff suspenso','suspended')`,[suspended,`suspenso-${suspended.slice(0,8)}@example.invalid`]);
  await pool.query(`INSERT INTO auth_staff_profiles(identity_id,role,assigned_by) VALUES($1,'ti','admin_system')`,[suspended]);
  assert.equal((await api("/api/ext/compliance/obligations",{method:"POST",body:obBody({responsible_identity:suspended})})).status,400);
});
test("EXT-07 criação deriva autoria, estado e ignoram valores forjados",opt,async()=>{
  const obligation=await createObligation({status:"encerrada",created_by_identity:randomUUID(),criticality:"absurda"});
  assert.equal(obligation.status,"pendente");
  assert.equal(obligation.created_by_identity,ti.id);
  assert.equal(obligation.criticality,"media");
  assert.ok(obligation.created_at&&obligation.updated_at,"timestamps do servidor");
});
let obligationA,obligationB,obligationC,docFuture,docExpiring;
test("EXT-07 documento exige obrigação, referência privada e datas coerentes",opt,async()=>{
  obligationA=await createObligation({title:"Obrigação antecedência sintética",renewal_lead_days:30});
  obligationB=await createObligation({title:"Obrigação vencimento sintética",renewal_lead_days:30});
  obligationC=await createObligation({title:"Obrigação fail-closed sintética",responsible_identity:ti2.id});
  assert.equal((await createDocument(randomUUID())).status,404);
  assert.equal((await createDocument(obligationA.id,{declared_reference:null})).status,400);
  assert.equal((await createDocument(obligationA.id,{reference_type:"arquivo_binario"})).status,400);
  assert.equal((await createDocument(obligationA.id,{issue_date:daysAhead(2),expiry_date:daysAhead(30)})).status,400);
  assert.equal((await createDocument(obligationA.id,{issue_date:daysAgo(5),expiry_date:daysAgo(6),declared_reference:"REF-X"})).status,400);
  assert.equal((await createDocument(obligationA.id,{issue_date:"2026-13-45",expiry_date:daysAhead(30)})).status,400);
  assert.equal((await createDocument(obligationA.id,{issue_date:daysAgo(5),expiry_date:daysAhead(30),effective_start_date:daysAhead(40)})).status,400);
});
test("EXT-07 referência declarada é distinta de arquivo: campos de arquivo nunca persistem",opt,async()=>{
  const r=await createDocument(obligationA.id,{file_name:"arquivo.pdf",file_url:"https://files.invalid/x",storage_key:"2026/x.pdf",is_private:false,status:"cancelada",created_by_identity:randomUUID()});
  assert.equal(r.status,201,r.text);
  docFuture=r.body.document;
  assert.equal(docFuture.status,"vigente");
  assert.equal(docFuture.is_private,true);
  assert.match(r.body.message,/não representa arquivo/);
  const row=(await pool.query(`SELECT file_name,file_url,storage_key,is_private,created_by_identity FROM ext_compliance_documents WHERE id=$1`,[docFuture.id])).rows[0];
  assert.equal(row.file_name,null);assert.equal(row.file_url,null);assert.equal(row.storage_key,null);
  assert.equal(row.is_private,true);assert.equal(row.created_by_identity,ti.id);
});
test("EXT-07 no máximo um documento corrente por obrigação; segundo exige renovação",opt,async()=>{
  const r=await createDocument(obligationA.id,{declared_reference:"REF-SEGUNDA-0001"});
  assert.equal(r.status,409);assert.equal(r.body.error,"current_document_exists");
});
test("EXT-07 detalhe autorizado usa allowlist sem campos de arquivo",opt,async()=>{
  const r=await api(`/api/ext/compliance/documents/${docFuture.id}`);
  assert.equal(r.status,200);
  const raw=JSON.stringify(r.body);
  assert.match(raw,/declared_reference/);
  for(const forbidden of ["storage_key","file_url","file_name"]) assert.ok(!raw.includes(`"${forbidden}"`),forbidden);
  assert.equal((await api(`/api/ext/compliance/documents/${randomUUID()}`)).status,404);
});
test("EXT-07 listagem minimizada sem número completo, referência ou metadados privados",opt,async()=>{
  const r=await api("/api/ext/compliance/documents");
  assert.equal(r.status,200);assert.ok(Array.isArray(r.body.items));
  const raw=JSON.stringify(r.body);
  for(const forbidden of ["storage_key","file_url","file_name","declared_reference","document_number"]) assert.ok(!raw.includes(`"${forbidden}"`),forbidden);
  assert.equal(r.body.file_boundary,"referencia_declarada_nao_arquivo_verificado");
  assert.ok(r.body.items.some(d=>d.id===docFuture.id&&d.version_no===1));
});
test("EXT-07 avaliação usa data do servidor e marca antecedência sem tarefa",opt,async()=>{
  const past=await createDocument(obligationB.id,{issue_date:daysAgo(40),expiry_date:daysAgo(1),declared_reference:"REF-VENCIDA-0001"});
  assert.equal(past.status,201);assert.equal(past.body.document.status,"vencida","estado derivado do servidor");
  docExpiring=past.body.document;
  const evalResult=await api("/api/ext/compliance/evaluate",{method:"POST",body:{evaluation_date:"2030-01-01"}});
  assert.equal(evalResult.status,200);
  assert.equal(evalResult.body.source,"server_date");
  assert.equal(evalResult.body.evaluation_date,iso(today),"data-base é a do servidor, não do cliente");
  assert.equal(evalResult.body.rule,"expiry_at_or_before_evaluation_date");
  const future=(await pool.query(`SELECT status::text s FROM ext_compliance_documents WHERE id=$1`,[docFuture.id])).rows[0];
  assert.equal(future.s,"a_vencer","antecedência dentro do lead time");
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1`,[docFuture.id])).rows[0].n,0,"antecedência não gera tarefa");
});
test("EXT-07 vencimento gera tarefa única com regra, fatos e data-base",opt,async()=>{
  const task=(await pool.query(`SELECT *, to_char(due_date,'YYYY-MM-DD') AS due_date, to_char(evaluation_date,'YYYY-MM-DD') AS evaluation_date FROM ext_compliance_tasks WHERE document_id=$1`,[docExpiring.id])).rows[0];
  assert.ok(task,"vencimento gera tarefa");
  assert.equal(task.rule,"expiry_at_or_before_evaluation_date");
  assert.equal(task.due_date,daysAgo(1));
  assert.equal(task.evaluation_date,iso(today));
  assert.equal(task.validity_period,`${daysAgo(40)}:${daysAgo(1)}`,"período ISO estável");
  assert.equal(task.responsible_identity,ti.id);
  assert.equal(task.facts.source,"server_date");
  const doc=(await pool.query(`SELECT status::text s,is_private FROM ext_compliance_documents WHERE id=$1`,[docExpiring.id])).rows[0];
  assert.equal(doc.s,"vencida");assert.equal(doc.is_private,true);
  const obligation=(await pool.query(`SELECT status::text s FROM ext_compliance_obligations WHERE id=$1`,[obligationB.id])).rows[0];
  assert.equal(obligation.s,"vencida","estado da obrigação deriva do documento");
});
test("EXT-07 reavaliação não duplica tarefa e retry idêntico faz replay",opt,async()=>{
  const key=idem("evaluate");
  const first=await api("/api/ext/compliance/evaluate",{method:"POST",body:{},key});
  const second=await api("/api/ext/compliance/evaluate",{method:"POST",body:{},key});
  assert.equal(first.status,200);assert.equal(second.status,200);
  assert.equal(second.body.replayed,true);
  const again=await api("/api/ext/compliance/evaluate",{method:"POST",body:{}});
  assert.equal(again.body.facts.tasks_already_existing>=1,true);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1`,[docExpiring.id])).rows[0].n,1);
});
test("EXT-07 mesma chave com corpo divergente 409",opt,async()=>{
  const key=idem("divergent");
  await api("/api/ext/compliance/obligations",{method:"POST",body:obBody({title:"Obrigação divergência A"}),key});
  const r=await api("/api/ext/compliance/obligations",{method:"POST",body:obBody({title:"Obrigação divergência B sintética"}),key});
  assert.equal(r.status,409);assert.equal(r.body.error,"idempotency_key_reused");
});
test("EXT-07 concorrência real com mesma chave produz um registro",opt,async()=>{
  const key=idem("race");
  const results=await Promise.all([0,1].map(()=>api("/api/ext/compliance/obligations",{method:"POST",body:obBody({title:"Obrigação concorrente sintética"}),key})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_obligations WHERE title='Obrigação concorrente sintética'`)).rows[0].n,1);
});
test("EXT-07 conclusão exige responsável ativo e resultado; cancelamento exige justificativa",opt,async()=>{
  const task=(await pool.query(`SELECT id FROM ext_compliance_tasks WHERE document_id=$1`,[docExpiring.id])).rows[0];
  assert.equal((await api(`/api/ext/compliance/tasks/${task.id}/complete`,{method:"POST",body:{}})).status,400);
  assert.equal((await api(`/api/ext/compliance/tasks/${task.id}/complete`,{method:"POST",body:{result:"curto"}})).status,400);
  assert.equal((await api(`/api/ext/compliance/tasks/${task.id}/cancel`,{method:"POST",body:{}})).status,400);
  assert.equal((await api(`/api/ext/compliance/tasks/${task.id}/cancel`,{method:"POST",body:{justification:"curta"}})).status,400);
});
test("EXT-07 tarefa inicia e conclui com resultado; terminal não reabre",opt,async()=>{
  const task=(await pool.query(`SELECT id FROM ext_compliance_tasks WHERE document_id=$1`,[docExpiring.id])).rows[0];
  assert.equal((await api(`/api/ext/compliance/tasks/${task.id}/start`,{method:"POST",body:{}})).status,200);
  assert.equal((await api(`/api/ext/compliance/tasks/${task.id}/start`,{method:"POST",body:{}})).status,409);
  const done=await api(`/api/ext/compliance/tasks/${task.id}/complete`,{method:"POST",body:{result:"Resultado sintético suficientemente detalhado da conclusão."}});
  assert.equal(done.status,200);assert.equal(done.body.task.status,"concluida");
  assert.equal((await api(`/api/ext/compliance/tasks/${task.id}/start`,{method:"POST",body:{}})).status,409);
  assert.equal((await api(`/api/ext/compliance/tasks/${task.id}/complete`,{method:"POST",body:{result:"Tentativa terminal adicional sintética."}})).status,409);
  await assert.rejects(pool.query(`UPDATE ext_compliance_tasks SET status='aberta' WHERE id=$1`,[task.id]),/terminal compliance task is immutable/);
  const list=await api("/api/ext/compliance/tasks");
  assert.equal(list.status,200);assert.equal(list.body.source,"ext_compliance_tasks");
  assert.ok(list.body.items.some(t=>t.id===task.id&&t.status==="concluida"));
});
test("EXT-07 cancelamento com justificativa fica terminal",opt,async()=>{
  const doc=await createDocument(obligationA.id,{issue_date:daysAgo(40),expiry_date:daysAgo(2),declared_reference:"REF-CANCEL-TASK-0001"});
  assert.equal(doc.status,409,"obrigação A já tem documento corrente a_vencer"); // corrente existe: use obrigação nova
  const obligation=await createObligation({title:"Obrigação cancelamento sintética"});
  const doc2=await createDocument(obligation.id,{issue_date:daysAgo(40),expiry_date:daysAgo(2),declared_reference:"REF-CANCEL-TASK-0002"});
  assert.equal(doc2.status,201);
  await api("/api/ext/compliance/evaluate",{method:"POST",body:{}});
  const task=(await pool.query(`SELECT id FROM ext_compliance_tasks WHERE document_id=$1`,[doc2.body.document.id])).rows[0];
  assert.ok(task);
  const cancelled=await api(`/api/ext/compliance/tasks/${task.id}/cancel`,{method:"POST",body:{justification:"Cancelamento sintético devidamente justificado para QA."}});
  assert.equal(cancelled.status,200);assert.equal(cancelled.body.task.status,"cancelada");
  assert.equal((await api(`/api/ext/compliance/tasks/${task.id}/complete`,{method:"POST",body:{result:"Tentativa pós-cancelamento sintética."}})).status,409);
});
test("EXT-07 fail-closed: sem responsável staff ativo não há tarefa nem mudança de estado",opt,async()=>{
  const doc=await createDocument(obligationC.id,{issue_date:daysAgo(40),expiry_date:daysAgo(1),declared_reference:"REF-FAILCLOSED-0001"});
  assert.equal(doc.status,201);
  await pool.query(`UPDATE auth_identities SET status='suspended' WHERE id=$1`,[ti2.id]);
  try{
    const evaluation=await api("/api/ext/compliance/evaluate",{method:"POST",body:{}});
    assert.equal(evaluation.status,200);
    const failed=evaluation.body.facts.failed_closed.find(f=>f.document_id===doc.body.document.id);
    assert.ok(failed,"documento reportado como failed_closed");
    assert.equal(failed.reason,"responsible_staff_missing");
    assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_tasks WHERE document_id=$1`,[doc.body.document.id])).rows[0].n,0);
    const status=(await pool.query(`SELECT status::text s FROM ext_compliance_documents WHERE id=$1`,[doc.body.document.id])).rows[0];
    assert.equal(status.s,"vencida","já vencida por derivação; sem nova afirmação sem responsável");
  }finally{
    await pool.query(`UPDATE auth_identities SET status='active' WHERE id=$1`,[ti2.id]);
  }
  await assert.rejects(pool.query(`INSERT INTO ext_compliance_tasks(obligation_id,document_id,validity_period,rule,evaluation_date,due_date,facts,responsible_identity,created_by_identity) VALUES($1,$2,'p','r',CURRENT_DATE,CURRENT_DATE,'{}',NULL,$3)`,[obligationC.id,doc.body.document.id,ti.id]),/requires a staff responsible/);
});
let renewedDocId;
test("EXT-07 renovação cria novo registro versionado e preserva histórico",opt,async()=>{
  assert.equal((await api(`/api/ext/compliance/documents/${docFuture.id}/renew`,{method:"POST",body:{issue_date:iso(today),expiry_date:daysAhead(365),declared_reference:"REF-RENOVADA-0004",justification:"curta"}})).status,400,"justificativa curta");
  assert.equal((await api(`/api/ext/compliance/documents/${docFuture.id}/renew`,{method:"POST",body:{issue_date:iso(today),expiry_date:daysAgo(1),declared_reference:"REF-RENOVADA-0003",justification:"Renovação vencida sintética."}})).status,400,"renovação exige validade corrente");
  const renew=await api(`/api/ext/compliance/documents/${docFuture.id}/renew`,{method:"POST",body:{issue_date:iso(today),expiry_date:daysAhead(365),declared_reference:"REF-RENOVADA-0001",justification:"Renovação sintética devidamente justificada."}});
  assert.equal(renew.status,201,renew.text);
  const renewed=renew.body.document;
  renewedDocId=renewed.id;
  assert.equal(renewed.version_no,2);
  assert.equal(renewed.replacement_of,docFuture.id);
  assert.equal(renewed.status,"vigente");
  assert.equal(renew.body.previous.status,"substituida");
  const previous=(await pool.query(`SELECT status::text s,version_no,expiry_date::text e FROM ext_compliance_documents WHERE id=$1`,[docFuture.id])).rows[0];
  assert.equal(previous.s,"substituida");assert.equal(previous.version_no,1);
  assert.equal(previous.e,docFuture.expiry_date,"registro anterior intacto");
  assert.equal((await api(`/api/ext/compliance/documents/${docFuture.id}/renew`,{method:"POST",body:{issue_date:iso(today),expiry_date:daysAhead(365),declared_reference:"REF-RENOVADA-0002",justification:"Renovação sobre terminal sintética."}})).status,409,"terminal não renova");
  const currents=(await pool.query(`SELECT count(*)::int n FROM ext_compliance_documents WHERE obligation_id=$1 AND status::text IN ('vigente','a_vencer','em_renovacao')`,[obligationA.id])).rows[0];
  assert.equal(currents.n,1,"exatamente uma versão corrente");
  const fresh=await createDocument(obligationA.id,{issue_date:iso(today),expiry_date:daysAhead(60),declared_reference:"REF-NOVA-APOS-RENOVACAO"});
  assert.equal(fresh.status,409,"nova referência direta continua exigindo renovação enquanto há corrente");
});
test("EXT-07 renovação de documento vencido libera nova corrente encadeada",opt,async()=>{
  const renew=await api(`/api/ext/compliance/documents/${docExpiring.id}/renew`,{method:"POST",body:{issue_date:iso(today),expiry_date:daysAhead(365),declared_reference:"REF-VENCIDA-RENOVADA",justification:"Renovação pós-vencimento devidamente justificada."}});
  assert.equal(renew.status,201);
  assert.equal(renew.body.document.version_no,2);
  assert.equal((await pool.query(`SELECT status::text s FROM ext_compliance_documents WHERE id=$1`,[docExpiring.id])).rows[0].s,"substituida");
});
test("EXT-07 sobrescrita destrutiva é bloqueada por API e banco",opt,async()=>{
  assert.equal((await api("/api/ext/compliance/obligations",{method:"PATCH",body:{status:"encerrada"}})).status,405);
  assert.equal((await api(`/api/ext/compliance/documents/${docFuture.id}`,{method:"PATCH",body:{expiry_date:"2030-01-01"}})).status,405);
  assert.equal((await api("/api/ext/compliance/tasks",{method:"DELETE"})).status,405);
  await assert.rejects(pool.query(`UPDATE ext_compliance_documents SET expiry_date='2030-01-01' WHERE id=$1`,[renewedDocId]),/canonical compliance document is immutable/);
  await assert.rejects(pool.query(`UPDATE ext_compliance_documents SET is_private=false WHERE id=$1`,[docFuture.id]),/immutable|must be private|violates check constraint/);
  await assert.rejects(pool.query(`UPDATE ext_compliance_documents SET status='vigente',updated_at=NOW() WHERE id=$1`,[docFuture.id]),/terminal compliance document is immutable/);
});
test("EXT-07 banco recusa estado temporal incoerente no INSERT",opt,async()=>{
  const protocol=`COMP-EXT-${iso(today).replaceAll("-","")}-${randomBytes(2).toString("hex").toUpperCase()}`;
  await assert.rejects(pool.query(`INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,responsible_identity,issue_date,expiry_date,validity_rule,reference_type,declared_reference,is_private,created_by_identity,obligation_id,origin) VALUES($1,'Título sintético','Descrição sintética para o guard.','licenca','vigente',$2,$3,$4,'regra','referencia_declarada','REF-GUARD-0001',true,$5,$6,'ext07_canonica')`,[protocol,ti.id,iso(today),daysAgo(1),ti.id,obligationC.id]),/cannot have an expired validity/);
  const protocol2=`COMP-EXT-${iso(today).replaceAll("-","")}-${randomBytes(2).toString("hex").toUpperCase()}`;
  await assert.rejects(pool.query(`INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,responsible_identity,issue_date,expiry_date,validity_rule,reference_type,declared_reference,is_private,created_by_identity,obligation_id,origin) VALUES($1,'Título sintético','Descrição sintética para o guard.','licenca','vencida',$2,$3,$4,'regra','referencia_declarada','REF-GUARD-0002',true,$5,$6,'ext07_canonica')`,[protocol2,ti.id,iso(today),daysAhead(30),ti.id,obligationC.id]),/cannot have a future validity/);
});
test("EXT-07 eventos históricos são imutáveis",opt,async()=>{
  const event=(await pool.query(`SELECT id FROM ext_compliance_events ORDER BY created_at DESC LIMIT 1`)).rows[0];
  await assert.rejects(pool.query(`UPDATE ext_compliance_events SET payload='{}' WHERE id=$1`,[event.id]),/immutable/);
  await assert.rejects(pool.query(`DELETE FROM ext_compliance_events WHERE id=$1`,[event.id]),/immutable/);
});
test("EXT-07 falha de audit_log retorna 503 com rollback completo",opt,async()=>{
  await pool.query(`CREATE FUNCTION qa_ext07_audit_fail() RETURNS TRIGGER AS $$ BEGIN IF NEW.action LIKE 'ext07%' THEN RAISE EXCEPTION 'audit fail'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql`);
  await pool.query(`CREATE TRIGGER qa_ext07_audit_fail_trg BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION qa_ext07_audit_fail()`);
  const key=idem("rollback");
  try{
    const r=await api("/api/ext/compliance/obligations",{method:"POST",body:obBody({title:"Obrigação rollback sintética"}),key});
    assert.equal(r.status,503);assert.equal(r.body.error,"audit_unavailable");
    assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_obligations WHERE title='Obrigação rollback sintética'`)).rows[0].n,0);
    assert.equal((await pool.query(`SELECT count(*)::int n FROM ext_compliance_events WHERE idempotency_key=$1`,[key])).rows[0].n,0);
    const doc=await api("/api/ext/compliance/documents",{method:"POST",body:{...docBody({obligation_id:obligationC.id,reference_type:"referencia_declarada",declared_reference:"REF-ROLLBACK-0001"}),title:"Referência rollback sintética"},key});
    assert.equal(doc.status,503);
  }finally{
    await pool.query(`DROP TRIGGER qa_ext07_audit_fail_trg ON audit_log`);await pool.query(`DROP FUNCTION qa_ext07_audit_fail()`);
  }
  const recovered=await api("/api/ext/compliance/obligations",{method:"POST",body:obBody({title:"Obrigação pós-restauração sintética"})});
  assert.equal(recovered.status,201);
});
test("EXT-07 legado preserva items/401/403/410 na ordem correta",opt,async()=>{
  const path="/api/ext/compliance-documents";
  const reader=await api(path);
  assert.equal(reader.status,200);assert.ok(Array.isArray(reader.body.items));
  assert.equal(reader.body.canonical,"/api/ext/compliance/*");
  assert.equal((await api(path,{cookie:null})).status,401);
  assert.equal((await api(path,{cookie:cookieRh})).status,403);
  assert.equal((await api("/api/admin/hr/ext-compliance-documents",{cookie:null})).status,401);
  assert.equal((await api("/api/crm/hr/ext-compliance-documents",{cookie:null})).status,401);
  assert.equal((await api("/api/hr/ext-compliance-documents",{cookie:null})).status,401);
  assert.equal((await api(path,{method:"POST",body:{}})).status,410);
  assert.equal((await api(path,{method:"POST",body:{},origin:"https://attacker.invalid"})).status,403);
  assert.equal((await api(path,{method:"POST",body:{},cookie:null})).status,401);
  assert.equal((await api(path,{method:"PATCH",body:{id:docFuture.id,status:"vigente"}})).status,410);
  assert.equal((await api(path,{method:"DELETE"})).status,410);
});
test("EXT-07 legado expõe projeção minimizada sem metadados privados",opt,async()=>{
  const legacy=await pool.query(`INSERT INTO ext_compliance_documents(protocol,title,description,compliance_type,status,document_number,issuer,responsible_name,issue_date,expiry_date,file_name,file_url,storage_key,is_private,origin) VALUES($1,'Documento legado sintético','Descrição legada sintética suficientemente longa.','licenca','vigente','NUM-LEGADO-0001','Órgão legado','Responsável legado',$2,$3,'legado.pdf','https://files.invalid/legado','2026/legado.pdf',true,'registro_legado') RETURNING id`,[`COMP-EXT-${iso(today).replaceAll("-","")}-${randomBytes(2).toString("hex").toUpperCase()}`,daysAgo(10),daysAhead(10)]);
  const r=await api("/api/ext/compliance-documents");
  assert.equal(r.status,200);
  const raw=JSON.stringify(r.body);
  for(const forbidden of ["storage_key","file_url","file_name","NUM-LEGADO-0001","declared_reference"]) assert.ok(!raw.includes(`"${forbidden}"`)&&!raw.includes(forbidden==="NUM-LEGADO-0001"?forbidden:`"${forbidden}"`),forbidden);
  assert.ok(r.body.items.some(d=>d.id===legacy.rows[0].id&&d.origin==="registro_legado"));
  assert.equal((await api(`/api/ext/compliance/documents/${legacy.rows[0].id}`)).status,404,"detalhe canônico não serve registro legado");
});
test("EXT-07 agregados declaram fonte, denominador e ausência distinta de zero",opt,async()=>{
  const obligations=await api("/api/ext/compliance/obligations");
  assert.equal(obligations.body.source,"ext_compliance_obligations");
  assert.equal(obligations.body.denominator,obligations.body.items.length);
  assert.equal(obligations.body.absence_is_not_zero,false);
  const empty=await api("/api/ext/compliance/tasks");
  assert.equal(empty.body.items.length>0,true);
  const evaluation=await api("/api/ext/compliance/evaluate",{method:"POST",body:{}});
  assert.equal(typeof evaluation.body.denominator,"number");
  assert.equal(evaluation.body.absence_is_not_zero,evaluation.body.denominator===0);
});
test("EXT-08..12 sem regressão: handlers legados respondem e ExtAdvancedClient preservado",opt,async()=>{
  for(const url of ["/api/ext/knowledge-base","/api/ext/expansion-plans","/api/ext/expansion-scenarios","/api/ext/continuity-plans","/api/ext/analytics-experiments","/api/ext/visual-tokens","/api/ext/visual-layouts"]) {
    const r=await api(url);
    assert.equal(r.status,200,url);
    assert.ok(Array.isArray(r.body.items),url);
  }
  await access(path.join(root,"src/app/admin/ti/ExtAdvancedClient.tsx"));
  const tiPage=await fetch(`${base}/admin/ti`,{signal:AbortSignal.timeout(240000)});
  assert.equal(tiPage.status,200);
});
