import {createHash} from 'node:crypto';
import {hasPermission} from './rbac.mjs';
import {isUuid} from './employee-session.mjs';
import {TimeClockError,nextPunchKinds,validatePosition,normalizeTimeChanges,workedHours,timeSnapshot} from './time-clock-core.mjs';
import {reverseGeocodeHere} from './here-reverse-geocode.mjs';

const HERE_TERMS_VERSION='here-end-user-terms-2026-10-07';
const HERE_TERMS_URL='https://legal.here.com/terms/here-end-user-terms';
const HERE_PRIVACY_URL='https://legal.here.com/privacy';

export function createEmployeeTimeClockApi(ctx){
 const db=()=>ctx.getPool();
 const send=(res,status,data)=>ctx.json(res,status,data,{'Cache-Control':'private, no-store'});
 const fail=(code,status=400)=>{throw new TimeClockError(code,status);};
 async function read(req){try{return await ctx.readJson(req,8192);}catch{fail('invalid_request');}}
 async function tx(work){
  const c=await db().connect();
  try{await c.query('BEGIN');const result=await work(c);await c.query('COMMIT');return result;}
  catch(error){try{await c.query('ROLLBACK');}catch{}throw error;}finally{c.release();}
 }
 async function audit(c,action,actor,target){await c.query('INSERT INTO audit_log(action,actor,target,meta) VALUES($1,$2,$3,$4)',[action,actor,target,JSON.stringify({module:'employee_time_clock'})]);}
 async function openCompetence(c,competence){
  await c.query("SELECT pg_advisory_xact_lock(hashtextextended('employee-time:' || $1::text,0))",[competence]);
  if((await c.query("SELECT 1 FROM hr_time_competence_closures WHERE competence=$1 AND status='fechado'",[competence])).rows.length)fail('competence_closed',409);
 }
 async function staff(req,employeeId,permission,c=db()){
  const s=await ctx.readStaffSession(req);
  if(!s?.identityId)fail('admin_session_required',401);
  if(!['admin','rh'].includes(s.role))fail('permission_scope_denied',403);
  const e=employeeId?(await c.query('SELECT identity_id,unit_id,contract_id FROM hr_employees WHERE id=$1',[employeeId])).rows[0]:null;
  if(employeeId&&!e)fail('employee_not_found',404);
  if(!await hasPermission(c,{identityId:s.identityId,permission,resourceOwnerIdentityId:e?.identity_id,unitId:e?.unit_id,contractId:e?.contract_id}))fail('permission_scope_denied',403);
  return s;
 }
 async function state(c,employeeId){
  const session=(await c.query('SELECT * FROM emp_time_sessions WHERE employee_id=$1 AND ended_at IS NULL',[employeeId])).rows[0];
  const punches=session?(await c.query('SELECT * FROM emp_time_punches WHERE session_id=$1 ORDER BY ordinal',[session.id])).rows:[];
  return {session,punches,allowedKinds:nextPunchKinds(punches.at(-1)?.kind)};
 }
 function hereAddressEnabled(){return ctx.hereAddressEnabled??Boolean(process.env.HERE_API_KEY?.trim());}
 async function hereConsentAccepted(c,employeeId){
  const latest=(await c.query("SELECT accepted FROM emp_time_external_consent_events WHERE employee_id=$1 AND provider='HERE' ORDER BY recorded_at DESC,id DESC LIMIT 1",[employeeId])).rows[0];
  return latest?.accepted===true;
 }
 async function hereConsent(req,res){
  const employee=await ctx.readEmployeeSession(req);if(!employee)fail('employee_session_required',401);
  if(req.method==='GET')return send(res,200,{enabled:hereAddressEnabled(),accepted:hereAddressEnabled()?await hereConsentAccepted(db(),employee.employeeId):false,termsUrl:HERE_TERMS_URL,privacyUrl:HERE_PRIVACY_URL});
  if(req.method!=='POST')fail('method_not_allowed',405);
  if(!hereAddressEnabled())fail('here_not_configured',503);
  const b=await read(req);if(typeof b?.accepted!=='boolean')fail('invalid_consent');
  const identity=(await db().query('SELECT status,identity_id FROM hr_employees WHERE id=$1',[employee.employeeId])).rows[0];
  if(identity?.status!=='ativo'||identity.identity_id!==employee.identityId)fail('employee_status_blocks_access',403);
  const event=await tx(async c=>{
   const row=(await c.query('INSERT INTO emp_time_external_consent_events(employee_id,identity_id,provider,terms_version,accepted) VALUES($1,$2,\'HERE\',$3,$4) RETURNING id,accepted,recorded_at',[employee.employeeId,employee.identityId,HERE_TERMS_VERSION,b.accepted])).rows[0];
   await audit(c,b.accepted?'employee_here_terms_accepted':'employee_here_terms_revoked',employee.identityId,row.id);
   return row;
  });
  return send(res,201,{consent:event});
 }
 async function clock(req,res){
  const employee=await ctx.readEmployeeSession(req);if(!employee)fail('employee_session_required',401);
  if(req.method==='GET'){
   const current=await state(db(),employee.employeeId);
   const punches=(await db().query('SELECT p.*,s.time_entry_id FROM emp_time_punches p JOIN emp_time_sessions s ON s.id=p.session_id WHERE p.employee_id=$1 ORDER BY p.recorded_at DESC LIMIT 100',[employee.employeeId])).rows;
   const corrections=(await db().query('SELECT id,time_entry_id,reason,requested_changes,status,rejection_reason,reviewed_at,created_at FROM emp_journey_corrections WHERE employee_id=$1 ORDER BY created_at DESC LIMIT 60',[employee.employeeId])).rows;
   const addressEnabled=hereAddressEnabled();
   const consentAccepted=addressEnabled?await hereConsentAccepted(db(),employee.employeeId):false;
   return send(res,200,{allowedKinds:current.allowedKinds,openEntryId:current.session?.time_entry_id||null,punches,corrections,timezone:'America/Sao_Paulo',hereAddressEnabled:addressEnabled,hereConsentAccepted:consentAccepted});
  }
  if(req.method!=='POST')fail('method_not_allowed',405);
  const b=await read(req);if(!isUuid(b?.requestId))fail('idempotency_key_required');
  const hash=createHash('sha256').update(JSON.stringify([b.kind,b.position])).digest('hex');
  const previous=(await db().query('SELECT * FROM emp_time_punches WHERE employee_id=$1 AND request_id=$2',[employee.employeeId,b.requestId])).rows[0];
  if(previous){if(previous.request_hash!==hash)fail('idempotency_conflict',409);return send(res,200,{punch:previous,replayed:true});}
  const preflight=(await db().query('SELECT status,identity_id FROM hr_employees WHERE id=$1',[employee.employeeId])).rows[0];
  if(preflight?.status!=='ativo'||preflight.identity_id!==employee.identityId)fail('employee_status_blocks_access',403);
  const candidatePosition=validatePosition(b.position,new Date());
  const preflightState=await state(db(),employee.employeeId);
  if(!preflightState.allowedKinds.includes(b.kind))fail('invalid_punch_transition',409);
  const addressEnabled=hereAddressEnabled();
  const consentAccepted=addressEnabled&&await hereConsentAccepted(db(),employee.employeeId);
  const address=consentAccepted
    ? await (ctx.reverseGeocode||reverseGeocodeHere)(candidatePosition)
    : {address:null,provider:null,status:addressEnabled?'not_requested':'not_configured',resolvedAt:null};
  const result=await tx(async c=>{
   const e=(await c.query('SELECT id,status,identity_id FROM hr_employees WHERE id=$1 FOR UPDATE',[employee.employeeId])).rows[0];
   if(e?.status!=='ativo'||e.identity_id!==employee.identityId)fail('employee_status_blocks_access',403);
   const replay=(await c.query('SELECT * FROM emp_time_punches WHERE employee_id=$1 AND request_id=$2',[employee.employeeId,b.requestId])).rows[0];
   if(replay){if(replay.request_hash!==hash)fail('idempotency_conflict',409);return {punch:replay,replayed:true};}
   const {rows:[time]}=await c.query("WITH stamp AS MATERIALIZED (SELECT clock_timestamp() AS now) SELECT now,to_char(now AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS day,to_char(now AT TIME ZONE 'America/Sao_Paulo','HH24:MI:SS') AS local_time FROM stamp");
   const now=new Date(time.now),position=validatePosition(b.position,now),current=await state(c,employee.employeeId);
   if(!current.allowedKinds.includes(b.kind))fail('invalid_punch_transition',409);
   let session=current.session;
   if(!session){
    const competence=time.day.slice(0,7);await openCompetence(c,competence);
    const entry=(await c.query("INSERT INTO hr_time_entries(employee_id,entry_date,clock_in,hours_worked,source,competence,created_by,created_by_id) VALUES($1,$2,$3,0,'manual',$4,$5,$5) RETURNING id",[employee.employeeId,time.day,time.local_time,competence,employee.identityId])).rows[0];
    session=(await c.query('INSERT INTO emp_time_sessions(employee_id,time_entry_id,started_at) VALUES($1,$2,$3) RETURNING *',[employee.employeeId,entry.id,now])).rows[0];
   }else{
    const entry=(await c.query('SELECT competence FROM hr_time_entries WHERE id=$1 FOR UPDATE',[session.time_entry_id])).rows[0];await openCompetence(c,entry.competence);
   }
   const punch=(await c.query('INSERT INTO emp_time_punches(session_id,employee_id,kind,recorded_at,position_at,latitude,longitude,accuracy_m,request_id,request_hash,actor_id,address_label,address_provider,address_status,address_resolved_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',[session.id,employee.employeeId,b.kind,now,position.positionAt,position.latitude,position.longitude,position.accuracy,b.requestId,hash,employee.identityId,address.address,address.provider,address.status,address.resolvedAt])).rows[0];
   if(b.kind==='saida'){
    const hours=workedHours([...current.punches,punch]);
    await c.query('UPDATE emp_time_sessions SET ended_at=$2 WHERE id=$1',[session.id,now]);
    await c.query("UPDATE hr_time_entries SET clock_out=$2,hours_worked=$3,status=$4,divergence_reason=$5 WHERE id=$1",[session.time_entry_id,time.local_time,hours<=24?hours:null,hours<=24?'pendente':'divergente',hours<=24?null:'Jornada excede 24 horas; revisão do RH necessária.']);
   }
   await audit(c,'employee_time_punch',employee.identityId,punch.id);
   return {punch,timeEntryId:session.time_entry_id,replayed:false};
  });return send(res,result.replayed?200:201,result);
 }
 async function requestCorrection(req,res){
  if(req.method!=='POST')fail('method_not_allowed',405);
  const s=await ctx.readEmployeeSession(req);if(!s)fail('employee_session_required',401);
  const b=await read(req),reason=typeof b?.reason==='string'?b.reason.trim():'';
  if(!isUuid(b?.timeEntryId)||reason.length<10||reason.length>1000)fail('invalid_time_correction');
  const changes=normalizeTimeChanges(b.requestedChanges);
  const correction=await tx(async c=>{
   const entry=(await c.query('SELECT * FROM hr_time_entries WHERE id=$1 AND employee_id=$2 FOR UPDATE',[b.timeEntryId,s.employeeId])).rows[0];
   if(!entry)fail('time_entry_not_found',404);await openCompetence(c,entry.competence);
   if((await c.query("SELECT 1 FROM emp_journey_corrections WHERE time_entry_id=$1 AND status IN ('solicitado','em_analise')",[entry.id])).rows.length)fail('correction_already_pending',409);
   const created=(await c.query("INSERT INTO emp_journey_corrections(employee_id,time_entry_id,original_snapshot,requested_changes,reason,created_by,created_by_id) VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING id,status,time_entry_id,reason",[s.employeeId,entry.id,JSON.stringify(entry),JSON.stringify(changes),reason,s.identityId])).rows[0];
   await audit(c,'emp_journey_correction_request',s.identityId,created.id);return created;
  });return send(res,201,{correction});
 }
 async function reviews(req,res,url){
  if(req.method==='GET'){
   const s=await ctx.readStaffSession(req);if(!s?.identityId)fail('admin_session_required',401);
   if(!['admin','rh'].includes(s.role))fail('permission_scope_denied',403);
   const grants=(await db().query("SELECT scope_type,scope_id FROM auth_permissions WHERE identity_id=$1 AND permission='employees.read' AND revoked_at IS NULL",[s.identityId])).rows;
   if(!grants.length)fail('permission_scope_denied',403);
   const filter=url.searchParams.get('employee_id'),entryFilter=url.searchParams.get('time_entry_id');if(filter&&!isUuid(filter)||entryFilter&&!isUuid(entryFilter))fail('invalid_employee_id');
   const corrections=(await db().query(`SELECT jc.*,e.display_name AS employee_name,e.matricula,t.entry_date,t.clock_in,t.clock_out,t.hours_worked,t.competence
    FROM emp_journey_corrections jc JOIN hr_employees e ON e.id=jc.employee_id JOIN hr_time_entries t ON t.id=jc.time_entry_id
    WHERE ($2::uuid IS NULL OR e.id=$2) AND ($3::uuid IS NULL OR t.id=$3) AND EXISTS (SELECT 1 FROM auth_permissions p WHERE p.identity_id=$1 AND p.permission='employees.read' AND p.revoked_at IS NULL AND (p.scope_type IN ('global','organization') OR (p.scope_type='unit' AND p.scope_id=e.unit_id) OR (p.scope_type='contract' AND p.scope_id=e.contract_id) OR (p.scope_type='own' AND e.identity_id=$1)))
    ORDER BY CASE WHEN jc.status IN ('solicitado','em_analise') THEN 0 ELSE 1 END,jc.created_at DESC LIMIT 200`,[s.identityId,filter||null,entryFilter||null])).rows;
   return send(res,200,{corrections});
  }
  if(req.method!=='PATCH')fail('method_not_allowed',405);
  const b=await read(req);if(!isUuid(b?.id)||!['em_analise','aprovado','rejeitado'].includes(b.status))fail('invalid_correction_decision');
  const reason=typeof b.rejection_reason==='string'?b.rejection_reason.trim():'';
  if(b.status==='rejeitado'&&(reason.length<5||reason.length>1000))fail('rejection_reason_required');
  const correction=await tx(async c=>{
   const target=(await c.query('SELECT employee_id,time_entry_id FROM emp_journey_corrections WHERE id=$1',[b.id])).rows[0];if(!target)fail('correction_not_found',404);
   const s=await staff(req,target.employee_id,'employees.write',c);
   // Same lock order as employee requests: entry, then correction.
   const entry=(await c.query('SELECT * FROM hr_time_entries WHERE id=$1 AND employee_id=$2 FOR UPDATE',[target.time_entry_id,target.employee_id])).rows[0];
   const corr=(await c.query('SELECT * FROM emp_journey_corrections WHERE id=$1 FOR UPDATE',[b.id])).rows[0];
   if(!entry)fail('time_entry_not_found',404);
   if(!['solicitado','em_analise'].includes(corr.status))fail('correction_already_decided',409);
   if(s.identityId===corr.created_by_id)fail('self_approval_forbidden',403);
   await openCompetence(c,entry.competence);
   let changes=null;
   if(b.status==='aprovado'){
    const openSession=(await c.query('SELECT * FROM emp_time_sessions WHERE time_entry_id=$1 AND ended_at IS NULL',[entry.id])).rows[0];
    if(timeSnapshot(entry)!==timeSnapshot(corr.original_snapshot||{}))fail('time_entry_changed',409);
    changes=normalizeTimeChanges(b.approved_changes||corr.requested_changes);
    // Horas precisam ser revisadas explicitamente quando os horários mudam: não presumir intervalos/virada de dia.
    if(('clock_in' in changes||'clock_out' in changes)&&!('hours_worked' in changes))fail('corrected_hours_required');
    if(openSession){
     if(!changes.clock_out||!('hours_worked' in changes))fail('missing_exit_correction_required');
     const start=changes.clock_in||entry.clock_in;
     const {rows:[proposal]}=await c.query("SELECT (($1::date + CASE WHEN $2::time <= $3::time THEN 1 ELSE 0 END) + $2::time) AT TIME ZONE 'America/Sao_Paulo' AS ended_at,clock_timestamp() AS now",[entry.entry_date,changes.clock_out,start]);
     if(new Date(proposal.ended_at)<new Date(openSession.started_at)||new Date(proposal.ended_at)>new Date(proposal.now))fail('invalid_corrected_exit');
     await c.query('UPDATE emp_time_sessions SET ended_at=$2,closed_by_correction_id=$3 WHERE id=$1',[openSession.id,proposal.ended_at,corr.id]);
    }
    await c.query("UPDATE hr_time_entries SET clock_in=COALESCE($2,clock_in),clock_out=COALESCE($3,clock_out),hours_worked=COALESCE($4,hours_worked),justification=COALESCE($5,justification),original_snapshot=COALESCE(original_snapshot,$6),status='corrigido',corrected_by=$7,corrected_by_id=$7,corrected_at=now() WHERE id=$1",[entry.id,changes.clock_in??null,changes.clock_out??null,changes.hours_worked??null,changes.justification??null,JSON.stringify(entry),s.identityId]);
   }
   const updated=(await c.query('UPDATE emp_journey_corrections SET status=$2,reviewed_by=$3,reviewed_by_id=$3,reviewed_at=now(),rejection_reason=$4,approved_changes=$5 WHERE id=$1 RETURNING *',[b.id,b.status,s.identityId,b.status==='rejeitado'?reason:null,changes?JSON.stringify(changes):null])).rows[0];
   await audit(c,`emp_journey_correction_${b.status}`,s.identityId,b.id);return updated;
  });return send(res,200,{correction});
 }
 async function handle(req,res,url){
  try{
   if(!['GET','POST','PATCH'].includes(req.method))fail('method_not_allowed',405);
   if(req.method!=='GET'&&!ctx.sameOrigin(req))fail('same_origin_required',403);
   if(url.pathname==='/api/employee/here-consent')return await hereConsent(req,res);
   if(url.pathname==='/api/employee/time-clock')return await clock(req,res);
   if(url.pathname==='/api/employee/actions/time-correction')return await requestCorrection(req,res);
   if(url.pathname==='/api/admin/hr/l03/time-clock'){
    if(req.method!=='GET')fail('method_not_allowed',405);
    const employeeId=url.searchParams.get('employee_id');if(!isUuid(employeeId))fail('invalid_employee_id');
    await staff(req,employeeId,'employees.read');
    const entries=(await db().query('SELECT id,entry_date,clock_in,clock_out,hours_worked,status,competence FROM hr_time_entries WHERE employee_id=$1 ORDER BY entry_date DESC,created_at DESC LIMIT 120',[employeeId])).rows;
    return send(res,200,{entries});
   }
   if(url.pathname==='/api/admin/hr/l03/time-punches'){
    if(req.method!=='GET')fail('method_not_allowed',405);
    const employeeId=url.searchParams.get('employee_id'),entryId=url.searchParams.get('entry_id');
    if(!isUuid(employeeId)||!isUuid(entryId))fail('invalid_employee_id');
    await staff(req,employeeId,'employees.read');
    const punches=(await db().query('SELECT p.id,p.kind,p.recorded_at,p.latitude,p.longitude,p.accuracy_m,p.request_hash,p.address_label,p.address_provider,p.address_status,p.address_resolved_at FROM emp_time_punches p JOIN emp_time_sessions s ON s.id=p.session_id WHERE p.employee_id=$1 AND s.time_entry_id=$2 ORDER BY p.ordinal',[employeeId,entryId])).rows;
    return send(res,200,{punches});
   }
   return await reviews(req,res,url);
  }catch(error){return send(res,error instanceof TimeClockError?error.status:503,{error:error instanceof TimeClockError?error.message:'time_clock_unavailable'});}
 }
 return {handle};
}
