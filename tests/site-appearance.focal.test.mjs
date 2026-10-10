import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createSiteAppearanceApi} from '../src/server/site-appearance-api.mjs';
test('o manifesto oficial declara exatamente as migrações presentes em db/migrations',async()=>{
 const source=await readFile(new URL('../scripts/migrate-site-visual.mjs',import.meta.url),'utf8');
 const declared=[...source.split('const files = [')[1].split('];')[0].matchAll(/'([0-9]{3}-[^']+\.sql)'/g)].map(m=>m[1]);
 const actual=(await readdir(new URL('../db/migrations/',import.meta.url))).filter(f=>/^\d{3}-.*\.sql$/.test(f)).sort();
 // O disco é a fonte de verdade: o deepEqual abaixo pega manifesto incompleto,
 // com sobra ou fora de ordem. Um contador fixo aqui não acrescenta verificação
 // e envelhece a cada migração nova — foi o que o deixou reprovando em 178-180.
 assert.ok(actual.length>=1,'db/migrations precisa ter ao menos uma migração');
 assert.deepEqual(declared,actual);
});
test('seleção real, papel/concessão, conflito, auditoria e rollback',async()=>{
 const pg=new PGlite(),id=randomUUID(),revoked=randomUUID();let failAudit=false;
 try{
  await pg.exec('CREATE TABLE auth_identities(id uuid PRIMARY KEY,status text); CREATE TABLE auth_staff_profiles(identity_id uuid,role text); CREATE TABLE auth_access_audit(action text); CREATE TABLE audit_log(action text,actor text,target text,meta jsonb);');
  for(const file of ['001-site-visual.sql','010-rbac-permissions.sql','174-auth-permissions-id-default.sql'])await pg.exec(await readFile(new URL('../db/migrations/'+file,import.meta.url),'utf8'));
  await pg.query("INSERT INTO auth_identities VALUES($1,'active'),($2,'active')",[id,revoked]);await pg.query("INSERT INTO auth_staff_profiles VALUES($1,'admin'),($2,'ti')",[id,revoked]);
  await pg.query("INSERT INTO auth_permissions(identity_id,permission,scope_type,reason,revoked_at) VALUES($1,'site.visual.write','organization','Revogação explícita',now())",[revoked]);
  await pg.exec(await readFile(new URL('../db/migrations/177-site-appearance-administration.sql',import.meta.url),'utf8'));
  assert.equal((await pg.query("SELECT count(*)::int AS n FROM auth_permissions WHERE identity_id=$1 AND permission='site.visual.write' AND revoked_at IS NULL",[revoked])).rows[0].n,0);
  const pool={query:(s,p)=>pg.query(s,p),connect:async()=>({query:(s,p)=>pg.query(failAudit&&s.startsWith('INSERT INTO audit_log')?'INSERT INTO missing_audit VALUES(1)':s,p),release(){}})};
  const api=createSiteAppearanceApi({getPool:()=>pool,readSession:async req=>req.session,sameOrigin:req=>req.origin!==false});
  async function call(method='GET',payload={},session={identityId:id,role:'admin'},path='/api/site-visual',origin=true){const res={writeHead(status){this.status=status;},end(data){this.data=JSON.parse(data);}};const req={method,url:path,session,origin,async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(payload));}};await api(req,res);return res;}
  assert.equal((await call()).data.visual,'06');
  assert.equal((await call('GET',{},undefined,'/api/admin/site-visual')).data.canManage,true);
  const body={visual:'03',expectedVisual:'06',reason:'Comparação revisada pelo administrador'};
  assert.equal((await call('PUT',body,{identityId:id,role:'rh'})).status,403);
  assert.equal((await call('PUT',body,{identityId:revoked,role:'ti'})).status,403);
  assert.equal((await call('PUT',body,{identityId:id,role:'admin'},'/api/site-visual',false)).status,403);
  failAudit=true;assert.equal((await call('PUT',body)).status,503);failAudit=false;
  assert.equal((await call()).data.visual,'06');assert.equal((await pg.query('SELECT count(*)::int AS n FROM site_visual_audit')).rows[0].n,0);
  assert.equal((await call('PUT',body)).data.visual,'03');assert.equal((await call('PUT',body)).data.error,'visual_changed_refresh');
  const saved=(await pg.query('SELECT * FROM site_visual_audit')).rows[0];assert.equal(saved.actor_identity_id,id);assert.equal(saved.reason,body.reason);
 }finally{await pg.close();}
});
