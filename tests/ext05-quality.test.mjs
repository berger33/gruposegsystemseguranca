import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {QUALITY_TRANSITIONS,QUALITY_BOUNDARY,createExtQualityApi} from "../src/server/ext-quality-api.mjs";

test("EXT-05: máquina de estados não salta nem reabre silenciosamente",()=>{
 assert.deepEqual(QUALITY_TRANSITIONS.aberta,["em_analise"]);
 assert.deepEqual(QUALITY_TRANSITIONS.verificacao,["encerrada"]);
 assert.deepEqual(QUALITY_TRANSITIONS.encerrada,[]);
 assert.deepEqual(QUALITY_TRANSITIONS.reaberta,["em_analise"]);
});
test("EXT-05: fronteira não inventa ator, upload ou armazenamento",()=>{
 assert.equal(QUALITY_BOUNDARY.journey,"staff_interno");assert.equal(QUALITY_BOUNDARY.external_actor,false);assert.equal(QUALITY_BOUNDARY.upload,false);assert.equal(QUALITY_BOUNDARY.verified_storage,false);
});
test("EXT-05: migração impõe evidência, responsável, história e eventos",async()=>{
 const sql=await readFile(new URL("../db/migrations/151-ext05-quality-journey.sql",import.meta.url),"utf8");
 for(const token of ["ext_quality_causes","ext_quality_verifications","ext_quality_closures","ext_quality_reopenings","ext_quality_recurrences","ext_quality_events","closure prerequisites","historical record is immutable","::text"])assert.match(sql,new RegExp(token.replaceAll(" ","\\s+"),"i"));
 assert.doesNotMatch(sql,/INSERT INTO auth_identities/i);
});
test("EXT-05: servidor liga apenas namespace canônico e legados exatos",async()=>{
 const source=await readFile(new URL("../server.mjs",import.meta.url),"utf8");assert.match(source,/createExtQualityApi/);assert.match(source,/\/api\/ext\/quality\/nonconformities/);assert.match(source,/ext-quality-nonconformities/);
 const legacy=await readFile(new URL("../src/server/ext-api.mjs",import.meta.url),"utf8");assert.doesNotMatch(legacy,/const handleQualityNonconformities/);assert.doesNotMatch(legacy,/const handleQualityActions/);
});
test("EXT-05: UI real preserva chave após falha e declara referência",async()=>{
 const source=await readFile(new URL("../src/app/admin/qualidade/QualidadeWorkspace.tsx",import.meta.url),"utf8");assert.match(source,/keys\.current\[op\]=k/);assert.match(source,/delete keys\.current\[op\]/);assert.match(source,/não representam upload/);assert.match(source,/Encerrar apenas com evidência e responsável/);
});
test("EXT-05: guardas distinguem 401 e 403 e legado só apos autenticação",async()=>{
 function response(){return{status:0,body:null,writeHead(s){this.status=s},end(v){this.body=JSON.parse(v)}}}
 const pool={query:async()=>({rows:[]})};
 const anonymous=createExtQualityApi({pool,sameOrigin:()=>true,requireSession:async()=>null});let r=response();await anonymous.handleList({method:"GET",headers:{}},r);assert.equal(r.status,401);
 const denied=createExtQualityApi({pool,sameOrigin:()=>true,requireSession:async()=>({identityId:"00000000-0000-4000-8000-000000000001",role:"rh"})});r=response();await denied.handleList({method:"GET",headers:{}},r);assert.equal(r.status,403);
 r=response();await anonymous.handleList({method:"POST",headers:{}},r,{legacy:true});assert.equal(r.status,401);
});
