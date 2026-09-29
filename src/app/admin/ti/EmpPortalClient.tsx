"use client";
import { useEffect, useState } from "react";

type Shift = { id:string; employee_id:string; shift_date:string; start_time?:string; end_time?:string; location?:string; function_name?:string; supervisor_name?:string; supervisor_contact?:string; orientations?:string; required_items?:any; status:string; is_next_shift:boolean; employee_name?:string };
type SchedVersion = { id:string; version:number; title:string; period_start:string; period_end:string; status:string; published_at?:string };
type SchedEntry = { id:string; version_id:string; employee_id:string; entry_date:string; entry_type:string; is_day_off:boolean; start_time?:string; end_time?:string; location?:string; acknowledged:boolean; acknowledged_at?:string; change_reason?:string; employee_name?:string; schedule_version?:number };
type JourneyProof = { id:string; employee_id:string; entry_date:string; file_name?:string; file_url:string; proof_type:string; status:string; time_entry_id?:string; employee_name?:string };
type JourneyCorrection = { id:string; employee_id:string; time_entry_id:string; original_snapshot?:any; requested_changes:any; reason:string; status:string; employee_name?:string };
type AbsenceNotice = { id:string; protocol:string; employee_id:string; notice_type:string; shift_date?:string; expected_delay_minutes?:number; reason_code:string; reason_details?:string; responsible_name?:string; status:string; coverage_triggered:boolean; coverage_request_id?:string; employee_name?:string };
type AbsenceFollow = { id:string; notice_id:string; message:string; status?:string; created_by_name?:string; created_at:string };

export default function EmpPortalClient(){
  const [shifts,setShifts]=useState<Shift[]>([]);
  const [versions,setVersions]=useState<SchedVersion[]>([]);
  const [entries,setEntries]=useState<SchedEntry[]>([]);
  const [proofs,setProofs]=useState<JourneyProof[]>([]);
  const [corrections,setCorrections]=useState<JourneyCorrection[]>([]);
  const [notices,setNotices]=useState<AbsenceNotice[]>([]);
  const [followups,setFollowups]=useState<AbsenceFollow[]>([]);

  const [shiftForm,setShiftForm]=useState({ employee_id:'', shift_date:'', start_time:'', end_time:'', location:'', function_name:'', supervisor_name:'', supervisor_contact:'', orientations:'', required_items:'', is_next_shift:false });
  const [versionForm,setVersionForm]=useState({ title:'', period_start:'', period_end:'', notes:'' });
  const [entryForm,setEntryForm]=useState({ version_id:'', employee_id:'', entry_date:'', entry_type:'trabalho', is_day_off:false, start_time:'', end_time:'', location:'', change_reason:'' });
  const [proofForm,setProofForm]=useState({ employee_id:'', entry_date:'', file_name:'', file_url:'', proof_type:'comprovante', time_entry_id:'', notes:'' });
  const [correctionForm,setCorrectionForm]=useState({ employee_id:'', time_entry_id:'', reason:'', requested_changes:'{"clock_in":"08:00","justification":"Correção"}', notes:'' });
  const [noticeForm,setNoticeForm]=useState({ employee_id:'', notice_type:'ausencia', shift_date:'', expected_delay_minutes:0, reason_code:'doenca', reason_details:'', responsible_name:'', coverage_notes:'' });
  const [followForm,setFollowForm]=useState({ notice_id:'', message:'', status:'em_acompanhamento', created_by_name:'RH' });

  const [selectedNotice,setSelectedNotice]=useState<string>('');

  async function api(path:string, opts?:any){
    const res=await fetch(path, { ...opts, headers:{ 'Content-Type':'application/json', ...(opts?.headers||{}) } });
    const j=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(j.error||`HTTP ${res.status}`);
    return j;
  }

  async function loadAll(){
    try{
      const [s,v,e,p,c,n]=await Promise.all([
        api('/api/admin/hr/shift-assignments'),
        api('/api/admin/hr/schedule-versions'),
        api('/api/admin/hr/schedule-entries'),
        api('/api/admin/hr/journey-proofs'),
        api('/api/admin/hr/journey-corrections'),
        api('/api/admin/hr/absence-notices'),
      ]);
      setShifts(s.shifts||[]); setVersions(v.versions||[]); setEntries(e.entries||[]); setProofs(p.proofs||[]); setCorrections(c.corrections||[]); setNotices(n.notices||[]);
    }catch(e){ console.error(e); }
  }
  useEffect(()=>{ loadAll(); },[]);

  async function loadFollowups(notice_id:string){
    try{
      const f=await api(`/api/admin/hr/absence-followups?notice_id=${notice_id}`);
      setFollowups(f.followups||[]); setSelectedNotice(notice_id);
    }catch(e){ console.error(e); }
  }

  // EMP-02
  async function createShift(){
    try{
      const body={ ...shiftForm, required_items: shiftForm.required_items? JSON.parse(shiftForm.required_items): null };
      await api('/api/admin/hr/shift-assignments',{ method:'POST', body:JSON.stringify(body) });
      setShiftForm({ employee_id:'', shift_date:'', start_time:'', end_time:'', location:'', function_name:'', supervisor_name:'', supervisor_contact:'', orientations:'', required_items:'', is_next_shift:false });
      loadAll();
    }catch(e:any){ alert(e.message); }
  }
  async function patchShift(id:string, patch:any){
    try{ await api('/api/admin/hr/shift-assignments',{ method:'PATCH', body:JSON.stringify({ id, ...patch }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }

  // EMP-03
  async function createVersion(){
    try{ await api('/api/admin/hr/schedule-versions',{ method:'POST', body:JSON.stringify(versionForm) }); setVersionForm({ title:'', period_start:'', period_end:'', notes:'' }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function patchVersion(id:string, status:string){
    try{ await api('/api/admin/hr/schedule-versions',{ method:'PATCH', body:JSON.stringify({ id, status }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function createEntry(){
    try{ await api('/api/admin/hr/schedule-entries',{ method:'POST', body:JSON.stringify(entryForm) }); setEntryForm({ version_id:'', employee_id:'', entry_date:'', entry_type:'trabalho', is_day_off:false, start_time:'', end_time:'', location:'', change_reason:'' }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function patchEntry(id:string, patch:any){
    try{ await api('/api/admin/hr/schedule-entries',{ method:'PATCH', body:JSON.stringify({ id, ...patch }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }

  // EMP-04
  async function createProof(){
    try{ await api('/api/admin/hr/journey-proofs',{ method:'POST', body:JSON.stringify(proofForm) }); setProofForm({ employee_id:'', entry_date:'', file_name:'', file_url:'', proof_type:'comprovante', time_entry_id:'', notes:'' }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function patchProof(id:string, status:string){
    try{ await api('/api/admin/hr/journey-proofs',{ method:'PATCH', body:JSON.stringify({ id, status }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function createCorrection(){
    try{
      const body={ ...correctionForm, requested_changes: JSON.parse(correctionForm.requested_changes) };
      await api('/api/admin/hr/journey-corrections',{ method:'POST', body:JSON.stringify(body) });
      setCorrectionForm({ employee_id:'', time_entry_id:'', reason:'', requested_changes:'{"clock_in":"08:00","justification":"Correção"}', notes:'' });
      loadAll();
    }catch(e:any){ alert(e.message); }
  }
  async function patchCorrection(id:string, status:string, approved_changes?:any){
    try{ await api('/api/admin/hr/journey-corrections',{ method:'PATCH', body:JSON.stringify({ id, status, approved_changes }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }

  // EMP-05
  async function createNotice(){
    try{ await api('/api/admin/hr/absence-notices',{ method:'POST', body:JSON.stringify(noticeForm) }); setNoticeForm({ employee_id:'', notice_type:'ausencia', shift_date:'', expected_delay_minutes:0, reason_code:'doenca', reason_details:'', responsible_name:'', coverage_notes:'' }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function patchNotice(id:string, patch:any){
    try{ await api('/api/admin/hr/absence-notices',{ method:'PATCH', body:JSON.stringify({ id, ...patch }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function createFollow(){
    try{ await api('/api/admin/hr/absence-followups',{ method:'POST', body:JSON.stringify(followForm) }); setFollowForm({ notice_id:followForm.notice_id, message:'', status:'em_acompanhamento', created_by_name:'RH' }); if(followForm.notice_id) loadFollowups(followForm.notice_id); loadAll(); }catch(e:any){ alert(e.message); }
  }

  return (
    <div className="space-y-8 border-t pt-8 mt-8">
      <h2 className="text-xl font-bold">EMP-02..05 próximo plantão escala jornada ausência (lote 30)</h2>

      {/* EMP-02 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">EMP-02 próximo plantão local horário função contato supervisor orientações itens necessários</h3>
        <div className="grid grid-cols-3 gap-2">
          <input className="border p-1" placeholder="employee_id" value={shiftForm.employee_id} onChange={e=>setShiftForm({...shiftForm,employee_id:e.target.value})} />
          <input className="border p-1" placeholder="shift_date YYYY-MM-DD" type="date" value={shiftForm.shift_date} onChange={e=>setShiftForm({...shiftForm,shift_date:e.target.value})} />
          <input className="border p-1" placeholder="start_time HH:MM" value={shiftForm.start_time} onChange={e=>setShiftForm({...shiftForm,start_time:e.target.value})} />
          <input className="border p-1" placeholder="end_time HH:MM" value={shiftForm.end_time} onChange={e=>setShiftForm({...shiftForm,end_time:e.target.value})} />
          <input className="border p-1" placeholder="local" value={shiftForm.location} onChange={e=>setShiftForm({...shiftForm,location:e.target.value})} />
          <input className="border p-1" placeholder="função" value={shiftForm.function_name} onChange={e=>setShiftForm({...shiftForm,function_name:e.target.value})} />
          <input className="border p-1" placeholder="supervisor nome" value={shiftForm.supervisor_name} onChange={e=>setShiftForm({...shiftForm,supervisor_name:e.target.value})} />
          <input className="border p-1" placeholder="supervisor contato" value={shiftForm.supervisor_contact} onChange={e=>setShiftForm({...shiftForm,supervisor_contact:e.target.value})} />
          <input className="border p-1" placeholder="orientações" value={shiftForm.orientations} onChange={e=>setShiftForm({...shiftForm,orientations:e.target.value})} />
          <input className="border p-1" placeholder='itens JSON ["colete","rádio"]' value={shiftForm.required_items} onChange={e=>setShiftForm({...shiftForm,required_items:e.target.value})} />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={shiftForm.is_next_shift} onChange={e=>setShiftForm({...shiftForm,is_next_shift:e.target.checked})} /> próximo plantão?</label>
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createShift}>Criar plantão</button>
        <div className="space-y-1 text-sm max-h-60 overflow-auto">
          {shifts.slice(0,20).map(s=>(
            <div key={s.id} className="border p-1 flex justify-between">
              <span>{s.shift_date} {s.start_time}-{s.end_time} {s.location} {s.function_name} sup {s.supervisor_name} {s.supervisor_contact} {s.is_next_shift?'[PRÓXIMO]':''} {s.status}</span>
              <span className="space-x-1">
                <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchShift(s.id,{ is_next_shift:true })}>marcar próximo</button>
                <button className="bg-blue-500 text-white px-1 rounded" onClick={()=>patchShift(s.id,{ status:'confirmado' })}>confirmar</button>
                <button className="bg-gray-600 text-white px-1 rounded" onClick={()=>patchShift(s.id,{ status:'realizado' })}>realizado</button>
              </span>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-600">Local horário função contato supervisor orientações itens necessários JSONB, is_next_shift true unset anterior, status publicado/confirmado/realizado, employee_id FK, audit shift_create</div>
      </div>

      {/* EMP-03 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">EMP-03 calendário escala folgas alterações ciência versão publicada usuário não modifica unilateralmente</h3>
        <div className="grid grid-cols-4 gap-2">
          <input className="border p-1" placeholder="título escala" value={versionForm.title} onChange={e=>setVersionForm({...versionForm,title:e.target.value})} />
          <input className="border p-1" type="date" value={versionForm.period_start} onChange={e=>setVersionForm({...versionForm,period_start:e.target.value})} />
          <input className="border p-1" type="date" value={versionForm.period_end} onChange={e=>setVersionForm({...versionForm,period_end:e.target.value})} />
          <input className="border p-1" placeholder="notes" value={versionForm.notes} onChange={e=>setVersionForm({...versionForm,notes:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createVersion}>Criar versão escala</button>
        <div className="text-sm">Versões: {versions.slice(0,5).map(v=>`v${v.version} ${v.title} ${v.period_start}→${v.period_end} ${v.status}${v.published_at?' publicado':''}`).join(' | ')}</div>
        <div className="flex gap-1">
          {versions.slice(0,5).map(v=>(
            <span key={v.id} className="border p-1 text-xs space-x-1">
              v{v.version} <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchVersion(v.id,'publicado')}>publicar</button><button className="bg-gray-600 text-white px-1 rounded" onClick={()=>patchVersion(v.id,'arquivado')}>arquivar</button>
            </span>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-2 pt-2 border-t">
          <input className="border p-1" placeholder="version_id" value={entryForm.version_id} onChange={e=>setEntryForm({...entryForm,version_id:e.target.value})} />
          <input className="border p-1" placeholder="employee_id" value={entryForm.employee_id} onChange={e=>setEntryForm({...entryForm,employee_id:e.target.value})} />
          <input className="border p-1" type="date" value={entryForm.entry_date} onChange={e=>setEntryForm({...entryForm,entry_date:e.target.value})} />
          <select className="border p-1" value={entryForm.entry_type} onChange={e=>setEntryForm({...entryForm,entry_type:e.target.value})}><option value="trabalho">trabalho</option><option value="folga">folga</option><option value="ferias">ferias</option><option value="afastamento">afastamento</option><option value="reserva">reserva</option><option value="compensacao">compensacao</option><option value="outro">outro</option></select>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={entryForm.is_day_off} onChange={e=>setEntryForm({...entryForm,is_day_off:e.target.checked})} /> folga?</label>
          <input className="border p-1" placeholder="start_time" value={entryForm.start_time} onChange={e=>setEntryForm({...entryForm,start_time:e.target.value})} />
          <input className="border p-1" placeholder="end_time" value={entryForm.end_time} onChange={e=>setEntryForm({...entryForm,end_time:e.target.value})} />
          <input className="border p-1" placeholder="local" value={entryForm.location} onChange={e=>setEntryForm({...entryForm,location:e.target.value})} />
          <input className="border p-1" placeholder="change_reason min10 se alterar" value={entryForm.change_reason} onChange={e=>setEntryForm({...entryForm,change_reason:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createEntry}>Criar entrada escala (usuário não modifica unilateralmente)</button>
        <div className="space-y-1 text-sm max-h-60 overflow-auto">
          {entries.slice(0,20).map(en=>(
            <div key={en.id} className="border p-1 flex justify-between">
              <span>v{en.schedule_version} {en.entry_date} {en.employee_name||en.employee_id.slice(0,8)} {en.entry_type} {en.is_day_off?'FOLGA':''} {en.start_time}-{en.end_time} {en.location} {en.acknowledged?'✔ ciência':''}</span>
              <span className="space-x-1">
                <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchEntry(en.id,{ acknowledged:true })}>ciência versão publicada</button>
                <button className="bg-yellow-600 text-white px-1 rounded" onClick={()=>patchEntry(en.id,{ change_reason:'Ajuste cobertura cliente X - supervisor solicitou troca turno', entry_type:'trabalho' })}>alterar com motivo</button>
              </span>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-600">Versão publicada rascunho/publicado/arquivado, UNIQUE(version) version auto MAX+1, entries UNIQUE(version,employee,date) is_day_off folga, acknowledged ciência versão publicada, change_reason min10 obrigatório para alteração, usuário não modifica unilateralmente só RH publica, ciência via ack audit schedule_publish/schedule_ack</div>
      </div>

      {/* EMP-04 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">EMP-04 jornada individual comprovantes/importação provedor divergências pedido correção preservar registro original</h3>
        <div className="grid grid-cols-3 gap-2">
          <input className="border p-1" placeholder="employee_id" value={proofForm.employee_id} onChange={e=>setProofForm({...proofForm,employee_id:e.target.value})} />
          <input className="border p-1" type="date" value={proofForm.entry_date} onChange={e=>setProofForm({...proofForm,entry_date:e.target.value})} />
          <input className="border p-1" placeholder="file_name" value={proofForm.file_name} onChange={e=>setProofForm({...proofForm,file_name:e.target.value})} />
          <input className="border p-1" placeholder="file_url" value={proofForm.file_url} onChange={e=>setProofForm({...proofForm,file_url:e.target.value})} />
          <select className="border p-1" value={proofForm.proof_type} onChange={e=>setProofForm({...proofForm,proof_type:e.target.value})}><option value="comprovante">comprovante</option><option value="importacao_provedor">importacao_provedor</option><option value="atestado">atestado</option><option value="declaracao">declaracao</option><option value="outro">outro</option></select>
          <input className="border p-1" placeholder="time_entry_id opcional" value={proofForm.time_entry_id} onChange={e=>setProofForm({...proofForm,time_entry_id:e.target.value})} />
          <input className="border p-1" placeholder="notes" value={proofForm.notes} onChange={e=>setProofForm({...proofForm,notes:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createProof}>Enviar comprovante jornada</button>
        <div className="space-y-1 text-sm max-h-40 overflow-auto">
          {proofs.slice(0,20).map(p=>(
            <div key={p.id} className="border p-1 flex justify-between">
              <span>{p.entry_date} {p.employee_name||p.employee_id.slice(0,8)} {p.proof_type} {p.file_name} {p.status}</span>
              <span className="space-x-1"><button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchProof(p.id,'aprovado')}>aprovar</button><button className="bg-red-600 text-white px-1 rounded" onClick={()=>patchProof(p.id,'rejeitado')}>rejeitar</button></span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <input className="border p-1" placeholder="employee_id correção" value={correctionForm.employee_id} onChange={e=>setCorrectionForm({...correctionForm,employee_id:e.target.value})} />
          <input className="border p-1" placeholder="time_entry_id" value={correctionForm.time_entry_id} onChange={e=>setCorrectionForm({...correctionForm,time_entry_id:e.target.value})} />
          <input className="border p-1" placeholder="reason min10" value={correctionForm.reason} onChange={e=>setCorrectionForm({...correctionForm,reason:e.target.value})} />
          <input className="border p-1 col-span-2" placeholder='requested_changes JSON {"clock_in":"08:00","justification":"..."}' value={correctionForm.requested_changes} onChange={e=>setCorrectionForm({...correctionForm,requested_changes:e.target.value})} />
          <input className="border p-1" placeholder="notes" value={correctionForm.notes} onChange={e=>setCorrectionForm({...correctionForm,notes:e.target.value})} />
        </div>
        <button className="bg-yellow-600 text-white px-3 py-1 rounded" onClick={createCorrection}>Pedir correção jornada (preserva original)</button>
        <div className="space-y-1 text-sm max-h-40 overflow-auto">
          {corrections.slice(0,20).map(c=>(
            <div key={c.id} className="border p-1 flex justify-between">
              <span>{c.employee_name||c.employee_id.slice(0,8)} time_entry {c.time_entry_id.slice(0,8)} reason {c.reason.slice(0,30)} {c.status} original {c.original_snapshot? '✔':''}</span>
              <span className="space-x-1">
                <button className="bg-blue-500 text-white px-1 rounded" onClick={()=>patchCorrection(c.id,'em_analise')}>em análise</button>
                <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchCorrection(c.id,'aprovado', c.requested_changes)}>aprovar aplica correção preserva original</button>
                <button className="bg-red-600 text-white px-1 rounded" onClick={()=>patchCorrection(c.id,'rejeitado')}>rejeitar</button>
              </span>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-600">Comprovantes file_url obrigatório proof_type comprovante/importacao_provedor, status pendente/em_analise/aprovado/rejeitado, time_entry_id opcional link hr_time_entries, correção reason min10 requested_changes JSON original_snapshot preservado JSONB original não sobrescrito, hr_time_entries original_snapshot COALESCE preserva, audit proof_upload/correction_request, divergências detectadas em hr_time_entries status divergente</div>
      </div>

      {/* EMP-05 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">EMP-05 aviso ausência/atraso protocolo motivo limitado responsável acompanhamento aciona fluxo cobertura</h3>
        <div className="grid grid-cols-3 gap-2">
          <input className="border p-1" placeholder="employee_id" value={noticeForm.employee_id} onChange={e=>setNoticeForm({...noticeForm,employee_id:e.target.value})} />
          <select className="border p-1" value={noticeForm.notice_type} onChange={e=>setNoticeForm({...noticeForm,notice_type:e.target.value})}><option value="ausencia">ausencia</option><option value="atraso">atraso</option></select>
          <input className="border p-1" type="date" value={noticeForm.shift_date} onChange={e=>setNoticeForm({...noticeForm,shift_date:e.target.value})} />
          <input className="border p-1" type="number" placeholder="delay min se atraso" value={noticeForm.expected_delay_minutes} onChange={e=>setNoticeForm({...noticeForm,expected_delay_minutes:Number(e.target.value)})} />
          <select className="border p-1" value={noticeForm.reason_code} onChange={e=>setNoticeForm({...noticeForm,reason_code:e.target.value})}><option value="doenca">doenca</option><option value="transporte">transporte</option><option value="familiar">familiar</option><option value="pessoal">pessoal</option><option value="acidente">acidente</option><option value="condicoes_climaticas">condicoes_climaticas</option><option value="outro">outro</option></select>
          <input className="border p-1" placeholder="reason_details min10 se outro" value={noticeForm.reason_details} onChange={e=>setNoticeForm({...noticeForm,reason_details:e.target.value})} />
          <input className="border p-1" placeholder="responsável nome" value={noticeForm.responsible_name} onChange={e=>setNoticeForm({...noticeForm,responsible_name:e.target.value})} />
          <input className="border p-1" placeholder="coverage_notes" value={noticeForm.coverage_notes} onChange={e=>setNoticeForm({...noticeForm,coverage_notes:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createNotice}>Criar aviso ausência/atraso com protocolo</button>
        <div className="space-y-1 text-sm max-h-60 overflow-auto">
          {notices.slice(0,20).map(n=>(
            <div key={n.id} className="border p-1 flex justify-between">
              <span>{n.protocol} {n.notice_type} {n.shift_date} {n.reason_code} {n.expected_delay_minutes?`${n.expected_delay_minutes}min`:''} {n.status} resp {n.responsible_name} {n.coverage_triggered?'[cobertura acionada]':''}</span>
              <span className="space-x-1">
                <button className="bg-blue-500 text-white px-1 rounded" onClick={()=>{ setFollowForm({...followForm,notice_id:n.id}); loadFollowups(n.id); }}>acompanhar</button>
                <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchNotice(n.id,{ status:'aprovado', coverage_triggered:true, coverage_notes:'Acionado fluxo cobertura - buscar substituto' })}>aprovar aciona cobertura</button>
                <button className="bg-purple-600 text-white px-1 rounded" onClick={()=>patchNotice(n.id,{ status:'em_acompanhamento' })}>em acompanhamento</button>
                <button className="bg-gray-600 text-white px-1 rounded" onClick={()=>patchNotice(n.id,{ status:'encerrado' })}>encerrar</button>
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <input className="border p-1" placeholder="notice_id" value={followForm.notice_id} onChange={e=>setFollowForm({...followForm,notice_id:e.target.value})} />
          <input className="border p-1" placeholder="mensagem min5" value={followForm.message} onChange={e=>setFollowForm({...followForm,message:e.target.value})} />
          <select className="border p-1" value={followForm.status} onChange={e=>setFollowForm({...followForm,status:e.target.value})}><option value="em_acompanhamento">em_acompanhamento</option><option value="aprovado">aprovado</option><option value="encerrado">encerrado</option><option value="em_analise">em_analise</option></select>
          <input className="border p-1" placeholder="created_by_name" value={followForm.created_by_name} onChange={e=>setFollowForm({...followForm,created_by_name:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createFollow}>Adicionar acompanhamento</button>
        <div className="text-sm">Followups aviso {selectedNotice}: {followups.slice(0,10).map(f=>`${f.created_by_name}:${f.message.slice(0,30)}[${f.status}]`).join(' | ')}</div>
        <div className="text-xs text-gray-600">Protocolo único ABSYYYYMMDD-XXXX, motivo limitado enum doenca/transporte/familiar/pessoal/acidente/condicoes_climaticas/outro, reason_details min10 se outro, expected_delay_minutes obrigatório se atraso, responsável nome, status aberto/em_analise/aprovado/rejeitado/em_acompanhamento/encerrado, coverage_triggered bool aciona fluxo cobertura quando aprovado/em_acompanhamento, coverage_request_id link opcional, followups mensagem min5 status, audit notice_create/coverage_trigger</div>
      </div>
    </div>
  );
}
