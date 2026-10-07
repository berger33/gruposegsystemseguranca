import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createEmployeeTimeClockApi} from '../src/server/employee-time-clock-api.mjs';
import {nextPunchKinds,normalizeTimeChanges,validatePosition,workedHours} from '../src/server/time-clock-core.mjs';

test('intervalos e jornada noturna; localização e alterações inválidas',()=>{
 assert.deepEqual(nextPunchKinds('saida_intervalo'),['retorno_intervalo','saida']);
 assert.equal(workedHours([{kind:'entrada',recorded_at:'2026-10-07T23:00:00Z'},{kind:'saida_intervalo',recorded_at:'2026-10-08T02:00:00Z'},{kind:'retorno_intervalo',recorded_at:'2026-10-08T03:00:00Z'},{kind:'saida',recorded_at:'2026-10-08T08:00:00Z'}]),8);
 assert.throws(()=>validatePosition({latitude:91,longitude:0,accuracy:10,positionAt:new Date().toISOString()},new Date()),/invalid_location/);
 assert.throws(()=>validatePosition({latitude:0,longitude:0,accuracy:10,positionAt:'2000-01-01'},new Date()),/location_expired/);
 assert.throws(()=>normalizeTimeChanges({clock_in:'25:00'}),/invalid_time_changes/);
 assert.throws(()=>normalizeTimeChanges({employee_id:randomUUID()}),/invalid_time_changes/);
 assert.deepEqual(normalizeTimeChanges({hours_worked:0,clock_in:'08:00',clock_out:''}),{hours_worked:0,clock_in:'08:00:00'});
});

test('fluxo SQL focal: ponto, isolamento, idempotência, pedido, aprovação e rollback',async()=>{
 const pg=new PGlite();let auditFailure=false;
 const a=randomUUID(),b=randomUUID(),ia=randomUUID(),ib=randomUUID(),rh=randomUUID(),unit=randomUUID();
 try{
  await pg.exec(`
   CREATE TABLE hr_employees(id uuid PRIMARY KEY,identity_id uuid,unit_id uuid,contract_id uuid,status text,display_name text,matricula text);
   CREATE TABLE auth_permissions(identity_id uuid,permission text,scope_type text,scope_id uuid,revoked_at timestamptz);
   CREATE TABLE audit_log(action text,actor text,target text,meta jsonb);
   CREATE TABLE hr_time_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),employee_id uuid,entry_date date,clock_in time,clock_out time,hours_worked numeric,source text,status text DEFAULT 'pendente',justification text,divergence_reason text,competence text,created_by text,created_by_id text,original_snapshot jsonb,corrected_by text,corrected_by_id text,corrected_at timestamptz,created_at timestamptz DEFAULT now());
   CREATE TABLE hr_time_competence_closures(competence text PRIMARY KEY,status text);
   CREATE TABLE emp_journey_corrections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),employee_id uuid,time_entry_id uuid,original_snapshot jsonb,requested_changes jsonb,reason text,status text DEFAULT 'solicitado',created_by uuid,created_by_id uuid,reviewed_by uuid,reviewed_by_id uuid,reviewed_at timestamptz,rejection_reason text,approved_changes jsonb,created_at timestamptz DEFAULT now());
  `);
  await pg.exec(await readFile(new URL('../db/migrations/176-employee-geolocation-time-clock.sql',import.meta.url),'utf8'));
  await pg.query("INSERT INTO hr_employees VALUES($1,$2,$3,NULL,'ativo','Pessoa A','A'),($4,$5,NULL,NULL,'ativo','Pessoa B','B')",[a,ia,unit,b,ib]);
  await pg.query("INSERT INTO auth_permissions VALUES($1,'employees.read','unit',$2,NULL),($1,'employees.write','unit',$2,NULL)",[rh,unit]);
  const pool={query:(sql,args)=>pg.query(sql,args),connect:async()=>({query:(sql,args)=>pg.query(auditFailure&&sql.startsWith('INSERT INTO audit_log')?'INSERT INTO absent_audit VALUES(1)':sql,args),release(){}})};
  const api=createEmployeeTimeClockApi({getPool:()=>pool,sameOrigin:req=>req.origin!==false,readEmployeeSession:async req=>req.employee||null,readStaffSession:async req=>req.staff||null,readJson:async req=>req.body,json:(res,status,data)=>Object.assign(res,{status,data})});
  const employee={employeeId:a,identityId:ia},staff={identityId:rh,role:'rh'};
  async function call(path,method='GET',body={},extras={}){const res={};await api.handle({method,body,employee,...extras},res,new URL(path,'http://localhost'));return res;}
  const geo=()=>({latitude:-23.5,longitude:-46.6,accuracy:12,positionAt:new Date().toISOString()});
  const denied=await call('/api/employee/time-clock','POST',{requestId:randomUUID(),kind:'entrada',position:geo()},{origin:false});assert.equal(denied.status,403);
  assert.equal((await call('/api/employee/time-clock','GET',{}, {employee:null})).status,401);
  const request={requestId:randomUUID(),kind:'entrada',position:geo()};
  const first=await call('/api/employee/time-clock','POST',request);assert.equal(first.status,201);
  assert.equal((await call('/api/employee/time-clock','POST',request)).data.replayed,true);
  assert.equal((await call('/api/employee/time-clock','POST',{...request,kind:'saida'})).status,409);
  assert.equal((await call('/api/employee/time-clock','POST',{requestId:randomUUID(),kind:'entrada',position:geo()})).status,409);
  const entry=first.data.timeEntryId;
  const competence=(await pg.query('SELECT competence FROM hr_time_entries WHERE id=$1',[entry])).rows[0].competence;
  await assert.rejects(pg.query("INSERT INTO hr_time_competence_closures VALUES($1,'fechado')",[competence]),/competence_has_open_journeys/);
  await assert.rejects(pg.query('DELETE FROM emp_time_punches WHERE id=$1',[first.data.punch.id]),/cannot be changed/);
  await call('/api/employee/time-clock','POST',{requestId:randomUUID(),kind:'saida_intervalo',position:geo()});
  await call('/api/employee/time-clock','POST',{requestId:randomUUID(),kind:'retorno_intervalo',position:geo()});
  const exit=await call('/api/employee/time-clock','POST',{requestId:randomUUID(),kind:'saida',position:geo()});assert.equal(exit.status,201);
  const correction={timeEntryId:entry,reason:'Horário lançado incorretamente',requestedChanges:{clock_in:'08:00',clock_out:'17:00'}};
  assert.equal((await call('/api/employee/actions/time-correction','POST',correction,{employee:{employeeId:b,identityId:ib}})).status,404);
  const requested=await call('/api/employee/actions/time-correction','POST',correction);assert.equal(requested.status,201);
  assert.equal((await call('/api/employee/actions/time-correction','POST',correction)).status,409);
  const id=requested.data.correction.id;
  await assert.rejects(pg.query("INSERT INTO hr_time_competence_closures VALUES($1,'fechado')",[competence]),/competence_has_pending_corrections/);
  const reviews='/api/admin/hr/l03/time-corrections';
  assert.equal((await call(reviews,'GET',{}, {staff})).data.corrections[0].id,id);
  assert.equal((await call(reviews,'PATCH',{id,status:'aprovado'},{staff:{...staff,role:'ti'}})).status,403);
  assert.equal((await call(reviews,'PATCH',{id,status:'aprovado'},{staff})).data.error,'corrected_hours_required');
  auditFailure=true;
  const approval={id,status:'aprovado',approved_changes:{clock_in:'08:00',clock_out:'17:00',hours_worked:8}};
  assert.equal((await call(reviews,'PATCH',approval,{staff})).status,503);
  assert.equal((await pg.query('SELECT status FROM emp_journey_corrections WHERE id=$1',[id])).rows[0].status,'solicitado');
  auditFailure=false;
  assert.equal((await call(reviews,'PATCH',approval,{staff})).status,200);
  assert.equal((await call(reviews,'PATCH',approval,{staff})).status,409);
  const final=(await pg.query('SELECT * FROM hr_time_entries WHERE id=$1',[entry])).rows[0];assert.equal(final.status,'corrigido');assert.equal(Number(final.hours_worked),8);assert.ok(final.original_snapshot);
  const proof=await call(`/api/admin/hr/l03/time-punches?employee_id=${a}&entry_id=${entry}`,'GET',{}, {staff});assert.equal(proof.data.punches.length,4);
  assert.equal((await call(`/api/admin/hr/l03/time-clock?employee_id=${a}`,'GET',{}, {staff})).data.entries[0].id,entry);
  assert.equal((await call(`/api/admin/hr/l03/time-punches?employee_id=${b}&entry_id=${entry}`,'GET',{}, {staff})).status,403);
  assert.equal((await call('/api/employee/time-clock','GET',{}, {employee:{employeeId:b,identityId:ib}})).data.punches.length,0);
  const next={requestId:randomUUID(),kind:'entrada',position:geo()};auditFailure=true;
  assert.equal((await call('/api/employee/time-clock','POST',next)).status,503);auditFailure=false;
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM emp_time_punches')).rows[0].n,4);
  // Esquecimento de saída: aprovação encerra a sessão, sem inventar uma marcação original.
  const day=(await pg.query("SELECT to_char((now()-interval '1 day') AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS day")).rows[0].day;
  const missing=(await pg.query("INSERT INTO hr_time_entries(employee_id,entry_date,clock_in,hours_worked,source,competence) VALUES($1,$2,'08:00',0,'manual',$3) RETURNING id",[a,day,day.slice(0,7)])).rows[0].id;
  const open=(await pg.query("INSERT INTO emp_time_sessions(employee_id,time_entry_id,started_at) VALUES($1,$2,($3::date + time '08:00') AT TIME ZONE 'America/Sao_Paulo') RETURNING *",[a,missing,day])).rows[0];
  await pg.query("INSERT INTO emp_time_punches(session_id,employee_id,kind,recorded_at,position_at,latitude,longitude,accuracy_m,request_id,request_hash,actor_id) VALUES($1,$2,'entrada',$3,$3,0,0,10,$4,'fixture',$5)",[open.id,a,open.started_at,randomUUID(),ia]);
  const forgotten=await call('/api/employee/actions/time-correction','POST',{timeEntryId:missing,reason:'Esqueci de registrar minha saída',requestedChanges:{clock_out:'17:00'}});assert.equal(forgotten.status,201);
  assert.equal((await call(reviews,'PATCH',{id:forgotten.data.correction.id,status:'rejeitado'},{staff})).data.error,'rejection_reason_required');
  assert.equal((await call(reviews,'PATCH',{id:forgotten.data.correction.id,status:'aprovado',approved_changes:{clock_out:'17:00',hours_worked:8}},{staff})).status,200);
  const finished=(await pg.query('SELECT * FROM emp_time_sessions WHERE id=$1',[open.id])).rows[0];assert.ok(finished.ended_at);assert.equal(finished.closed_by_correction_id,forgotten.data.correction.id);
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM emp_time_punches WHERE session_id=$1',[open.id])).rows[0].n,1);
  await pg.query("INSERT INTO hr_time_competence_closures VALUES($1,'fechado')",[competence]);
  assert.equal((await call('/api/employee/time-clock','POST',next)).data.error,'competence_closed');
 }finally{await pg.close();}
});
