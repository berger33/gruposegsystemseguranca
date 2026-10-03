import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { createCliFinanceApi } from '../src/server/cli-finance-api.mjs';

const ACCOUNT='11111111-1111-4111-8111-111111111111';
const REQUEST='22222222-2222-4222-8222-222222222222';
const STAFF='33333333-3333-4333-8333-333333333333';

function request(url, method='POST', body={}, headers={}) {
  const req=Readable.from([Buffer.from(JSON.stringify(body))]);
  Object.assign(req,{url,method,headers:{host:'localhost','idempotency-key':'cli13-key-0001',...headers},socket:{remoteAddress:'192.0.2.10'}});
  return req;
}
function response() {
  const out={};
  return { out, writeHead(code,headers){out.code=code;out.headers=headers;}, end(raw){out.body=JSON.parse(raw);} };
}
function fixture(query, {staff=false, auditLog=async()=>{}}={}) {
  const sql=[];
  const client={
    async query(text,params=[]){sql.push({text,params}); return query(text,params,sql);},
    release(){sql.push({text:'RELEASE',params:[]});},
  };
  const api=createCliFinanceApi({
    pool:{connect:async()=>client,query:client.query.bind(client)}, auditLog, sameOrigin:()=>true,
    requireSession:async()=>staff?{role:'ti',identityId:STAFF}:null,
    requireClientSession:async()=>null, requireRole:(session,roles)=>roles.includes(session.role),
  });
  return {api,sql};
}
const publicBody={mode:'autocadastro',client_account_id:ACCOUNT,requested_email:'qa@example.invalid',requested_name:'Pessoa QA',document_ref:'12.345/0001',verified_link:true,identity_id:'forged'};

function successfulPublicQuery(text) {
  if (text==='BEGIN'||text==='COMMIT'||text==='ROLLBACK'||text.includes('pg_advisory')) return {rows:[]};
  if (text.includes('requester_fingerprint=$1')) return {rows:[]};
  if (text.includes('FROM cli_portal_mode_configs')) return {rows:[{is_active:true}]};
  if (text.includes('FROM client_accounts')) return {rows:[{id:ACCOUNT}]};
  if (text.includes('INSERT INTO cli_portal_access_requests')) return {rows:[{id:REQUEST,protocol:'ACC-CLI-20261003-TEST',mode:'autocadastro',status:'pendente'}]};
  return {rows:[]};
}

test('CLI-13: alias público/cliente não usa guard administrativo e cria somente pedido pendente', async()=>{
  const {api,sql}=fixture(successfulPublicQuery);
  const res=response(); await api.handlePortalAccessRequests(request('/api/client/portal-access-requests','POST',publicBody),res);
  assert.equal(res.out.code,201); assert.equal(res.out.body.request.status,'pendente');
  const joined=sql.map(x=>x.text).join('\n');
  assert.match(joined,/verified_link,/); assert.doesNotMatch(joined,/INSERT INTO (auth_identities|auth_sessions|client_access_grants|client_contracts)/);
  assert.doesNotMatch(joined,/forged/); assert.match(joined,/COMMIT/);
});

test('CLI-13: modo inativo recusa declaradamente e audita na mesma transação', async()=>{
  const {api,sql}=fixture(text=>{
    if (text.includes('FROM cli_portal_mode_configs')) return {rows:[{is_active:false}]};
    return {rows:[]};
  });
  const res=response(); await api.handlePortalAccessRequests(request('/api/public/portal-access-requests','POST',publicBody),res);
  assert.deepEqual(res.out.body,{error:'mode_inactive'}); assert.equal(res.out.code,409);
  assert.ok(sql.some(x=>x.text.includes("'denied','policy_violation'"))); assert.ok(sql.some(x=>x.text==='COMMIT'));
});

test('CLI-13: vínculo conta/documento é verificado no servidor; recusa é auditada sem pedido', async()=>{
  const {api,sql}=fixture(text=>{
    if (text.includes('FROM cli_portal_mode_configs')) return {rows:[{is_active:true}]};
    if (text.includes('FROM client_accounts')) return {rows:[]};
    return {rows:[]};
  });
  const res=response(); await api.handlePortalAccessRequests(request('/api/cli/portal-access-requests','POST',publicBody),res);
  assert.equal(res.out.code,403); assert.equal(res.out.body.error,'link_not_verified');
  assert.ok(sql.some(x=>x.text.includes("'denied','authorization_denied'")));
  assert.ok(!sql.some(x=>x.text.includes('INSERT INTO cli_portal_access_requests')));
});

test('CLI-13: retry idêntico retorna pedido; chave reutilizada com conteúdo divergente retorna 409', async()=>{
  let fingerprint;
  const first=fixture((text,params)=>{
    if (text.includes('requester_fingerprint=$1')) return {rows:[{id:REQUEST,protocol:'ACC-CLI-20261003-TEST',status:'pendente',request_fingerprint:fingerprint||'x'}]};
    return {rows:[]};
  });
  // Capture the canonical hash from a normal insertion, then replay it.
  const capture=fixture((text,params)=>{
    if (text.includes('INSERT INTO cli_portal_access_requests')) fingerprint=params[8];
    return successfulPublicQuery(text);
  });
  let res=response(); await capture.api.handlePortalAccessRequests(request('/api/client/portal-access-requests','POST',publicBody),res);
  res=response(); await first.api.handlePortalAccessRequests(request('/api/client/portal-access-requests','POST',publicBody),res);
  assert.equal(res.out.code,200); assert.equal(res.out.body.replay,true);
  res=response(); await first.api.handlePortalAccessRequests(request('/api/client/portal-access-requests','POST',{...publicBody,requested_name:'Outro conteúdo'}),res);
  assert.equal(res.out.code,409); assert.equal(res.out.body.error,'idempotency_key_reused');
});

test('CLI-13: autocadastro auto_release=true é 400 na API e recusado pelo CHECK preservado da 076', async()=>{
  const {api,sql}=fixture(()=>({rows:[]}),{staff:true}); const res=response();
  await api.handlePortalModeConfigs(request('/api/hr/cli-portal-mode-configs','PATCH',{mode:'autocadastro',is_active:true,requires_approval:true,auto_release_contracts:true,reason:'Tentativa inválida registrada'}),res);
  assert.equal(res.out.code,400); assert.equal(res.out.body.error,'autocadastro_never_releases_contracts'); assert.equal(sql.length,0);
  const migration076=await readFile(new URL('../db/migrations/076-cli09-10-11-12-13-14-cobrancas-oportunidade-satisfacao-renovacao-modos-seguranca.sql',import.meta.url),'utf8');
  assert.match(migration076,/chk_autocadastro_never_releases_contracts[\s\S]*mode != 'autocadastro'[\s\S]*auto_release_contracts = false/);
});

test('CLI-13: configuração grava autoria da sessão, histórico e auditoria em uma transação', async()=>{
  const {api,sql}=fixture(text=>{
    if (text.includes('SELECT * FROM cli_portal_mode_configs')) return {rows:[{is_active:false,requires_approval:true,auto_release_contracts:false}]};
    if (text.includes('UPDATE cli_portal_mode_configs')) return {rows:[{mode:'autocadastro',is_active:true,requires_approval:true,auto_release_contracts:false}]};
    return {rows:[]};
  },{staff:true});
  const res=response(); await api.handlePortalModeConfigs(request('/api/hr/cli-portal-mode-configs','PATCH',{mode:'autocadastro',is_active:true,requires_approval:true,auto_release_contracts:false,reason:'Habilitação após revisão interna'}),res);
  assert.equal(res.out.code,200); const all=sql.map(x=>x.text).join('\n');
  assert.match(all,/cli_portal_mode_config_history/); assert.match(all,/portal_mode_config_update/); assert.ok(sql.some(x=>x.params.includes(STAFF))); assert.match(all,/BEGIN[\s\S]*COMMIT/);
});

test('CLI-13: aprovação exige UUID, motivo e vínculo verificado', async()=>{
  const {api}=fixture(text=>text.includes('FROM cli_portal_access_requests')?{rows:[{id:REQUEST,status:'pendente',verified_link:false}]}:{rows:[]},{staff:true});
  let res=response(); await api.handlePortalAccessRequests(request('/api/hr/cli-portal-access-requests','PATCH',{id:REQUEST,status:'aprovada',reason:'curto'}),res);
  assert.equal(res.out.code,400);
  res=response(); await api.handlePortalAccessRequests(request('/api/hr/cli-portal-access-requests','PATCH',{id:REQUEST,status:'aprovada',reason:'Vínculo revisado pela equipe'}),res);
  assert.equal(res.out.code,409); assert.equal(res.out.body.error,'verified_link_required');
});

test('CLI-13: aprovação cria convite canônico, decisão/histórico/auditoria, mas nenhum grant ou contrato', async()=>{
  const {api,sql}=fixture(text=>{
    if (text.includes('FROM cli_portal_access_requests')) return {rows:[{id:REQUEST,protocol:'ACC-CLI-20261003-TEST',mode:'autocadastro',status:'pendente',verified_link:true,requested_email:'qa@example.invalid',client_account_id:ACCOUNT}]};
    if (text.includes('FROM cli_portal_mode_configs')) return {rows:[{is_active:true,auto_release_contracts:false}]};
    if (text.includes('FROM auth_identities')) return {rows:[]};
    if (text.includes('UPDATE cli_portal_access_requests')) return {rows:[{id:REQUEST,status:'aprovada',mode:'autocadastro'}]};
    return {rows:[]};
  },{staff:true});
  const res=response(); await api.handlePortalAccessRequests(request('/api/hr/cli-portal-access-requests','PATCH',{id:REQUEST,status:'aprovada',reason:'Vínculo documental revisado manualmente'}),res);
  assert.equal(res.out.code,200); assert.match(res.out.body.inviteUrl,/^\/cliente\/convite\?token=/);
  const all=sql.map(x=>x.text).join('\n'); assert.match(all,/INSERT INTO auth_invites/); assert.match(all,/cli_portal_access_request_history/); assert.match(all,/portal_access_request_review/);
  assert.doesNotMatch(all,/INSERT INTO (client_access_grants|client_contracts|auth_identities|auth_sessions)/);
});

test('CLI-13: rejeição exige motivo e registra decisão sem convite', async()=>{
  const {api,sql}=fixture(text=>{
    if (text.includes('FROM cli_portal_access_requests')) return {rows:[{id:REQUEST,status:'pendente',verified_link:true,mode:'solicitacao_aprovacao'}]};
    if (text.includes('UPDATE cli_portal_access_requests')) return {rows:[{id:REQUEST,status:'rejeitada'}]};
    return {rows:[]};
  },{staff:true});
  const res=response(); await api.handlePortalAccessRequests(request('/api/hr/cli-portal-access-requests','PATCH',{id:REQUEST,status:'rejeitada',reason:'Documento não corresponde à conta informada'}),res);
  assert.equal(res.out.code,200); const all=sql.map(x=>x.text).join('\n'); assert.match(all,/cli_portal_access_request_history/); assert.doesNotMatch(all,/INSERT INTO auth_invites/);
});

test('CLI-13: falha da auditoria devolve 503 e reverte pedido e histórico', async()=>{
  const {api,sql}=fixture((text)=>{
    if (text.includes('FROM cli_portal_mode_configs')) return {rows:[{is_active:true}]};
    if (text.includes('FROM client_accounts')) return {rows:[{id:ACCOUNT}]};
    if (text.includes('INSERT INTO cli_portal_access_requests')) return {rows:[{id:REQUEST,status:'pendente'}]};
    if (text.includes('INSERT INTO auth_access_audit')) throw new Error('audit down');
    return {rows:[]};
  });
  const res=response(); await api.handlePortalAccessRequests(request('/api/client/portal-access-requests','POST',publicBody),res);
  assert.equal(res.out.code,503); assert.equal(res.out.body.error,'audit_unavailable'); assert.ok(sql.some(x=>x.text==='ROLLBACK')); assert.ok(!sql.some(x=>x.text==='COMMIT'));
});

test('CLI-13: migração 144 é aditiva, constraints novas NOT VALID e rota pública está despachada', async()=>{
  const migration=await readFile(new URL('../db/migrations/144-l08-cli13-portal-access-modes.sql',import.meta.url),'utf8');
  const server=await readFile(new URL('../server.mjs',import.meta.url),'utf8');
  const accessApi=await readFile(new URL('../src/server/client-access-api.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(migration,/DROP TABLE|TRUNCATE/); assert.match(migration,/NOT VALID/g); assert.match(migration,/cli_portal_access_request_history/);
  assert.match(server,/\/api\/public\/portal-access-requests/);
  assert.match(accessApi,/cli_portal_mode_configs WHERE mode='convite'/);
});
