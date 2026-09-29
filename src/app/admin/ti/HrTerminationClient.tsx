"use client";
import { useEffect, useState } from "react";

type Termination={ id:string; employee_id:string; checklist_id?:string; type:string; status:string; termination_date:string; last_work_date?:string; reason?:string; responsible_name?:string; completed_at?:string; created_at:string; };
type Progress={ id:string; item_id:string; title:string; category:string; is_required:boolean; status:string; completed_at?:string; notes?:string; };
type Policy={ status:string; suspend_login:boolean; suspend_allocation:boolean; requires_approval:boolean; approval_role:string; description:string; is_legal_sanction:boolean; };
type VacationPeriod={ id:string; employee_id:string; aquisitivo_start:string; aquisitivo_end:string; concessivo_start:string; concessivo_end:string; saldo_total_dias:number; saldo_usado_dias:number; saldo_restante_dias:number; status:string; is_imported:boolean; is_validated:boolean; validated_at?:string; notes?:string; created_at:string; };
type VacationRequest={ id:string; employee_id:string; period_id?:string; start_date:string; end_date:string; dias:number; status:string; has_coverage_conflict:boolean; conflict_details?:string; approved_at?:string; rejection_reason?:string; created_at:string; };

export default function HrTerminationClient(){
  const [terminations,setTerminations]=useState<Termination[]>([]);
  const [selected,setSelected]=useState<{termination:Termination; progress:Progress[]}|null>(null);
  const [policies,setPolicies]=useState<Policy[]>([]);
  const [periods,setPeriods]=useState<VacationPeriod[]>([]);
  const [requests,setRequests]=useState<VacationRequest[]>([]);
  const [termForm,setTermForm]=useState({ employee_id:"", type:"pedido_demissao", termination_date:"", last_work_date:"", reason:"", responsible_name:"", notes:"", cargo:"" });
  const [periodForm,setPeriodForm]=useState({ employee_id:"", aquisitivo_start:"", aquisitivo_end:"", concessivo_start:"", concessivo_end:"", saldo_total_dias:"30", saldo_usado_dias:"0", is_imported:"false", is_validated:"false", notes:"" });
  const [vacReqForm,setVacReqForm]=useState({ employee_id:"", period_id:"", start_date:"", end_date:"", notes:"" });
  const [msg,setMsg]=useState("");

  async function loadAll(){
    const t=await fetch('/api/admin/hr/terminations').then(r=>r.json()); if(t.terminations) setTerminations(t.terminations);
    const pol=await fetch('/api/admin/hr/status-policies').then(r=>r.json()); if(pol.policies) setPolicies(pol.policies);
    const vp=await fetch('/api/admin/hr/vacation-periods').then(r=>r.json()); if(vp.periods) setPeriods(vp.periods);
    const vr=await fetch('/api/admin/hr/vacation-requests').then(r=>r.json()); if(vr.requests) setRequests(vr.requests);
  }
  useEffect(()=>{ loadAll(); },[]);

  async function createTermination(){
    if(!termForm.employee_id || termForm.reason.length<10 || !termForm.termination_date){ setMsg('employee_id reason min10 termination_date obrigatório'); return; }
    const r=await fetch('/api/admin/hr/terminations',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(termForm)}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Desligamento criado'); setTermForm({ employee_id:"", type:"pedido_demissao", termination_date:"", last_work_date:"", reason:"", responsible_name:"", notes:"", cargo:"" }); loadAll();
  }
  async function patchTermination(id:string, status:string){
    const r=await fetch('/api/admin/hr/terminations',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error+' '+(j.required_incomplete? `req incomplete ${j.required_incomplete}`:'')); return; } setMsg('Desligamento '+status); loadAll();
  }
  async function openTermination(id:string){
    const r=await fetch(`/api/admin/hr/terminations/${id}`); const j=await r.json(); if(r.ok) setSelected(j);
  }
  async function patchProgress(pid:string, status:string){
    const r=await fetch('/api/admin/hr/termination-progress',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id:pid, status })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } if(selected) openTermination(selected.termination.id);
  }
  async function createPeriod(){
    if(!periodForm.employee_id || !periodForm.aquisitivo_start || !periodForm.aquisitivo_end || !periodForm.concessivo_start || !periodForm.concessivo_end){ setMsg('employee_id e datas aquisitivo/concessivo obrigatórias'); return; }
    const payload={ ...periodForm, saldo_total_dias: parseInt(periodForm.saldo_total_dias)||30, saldo_usado_dias: parseInt(periodForm.saldo_usado_dias)||0, is_imported: periodForm.is_imported==='true', is_validated: periodForm.is_validated==='true' };
    const r=await fetch('/api/admin/hr/vacation-periods',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Período férias criado'); setPeriodForm({ employee_id:"", aquisitivo_start:"", aquisitivo_end:"", concessivo_start:"", concessivo_end:"", saldo_total_dias:"30", saldo_usado_dias:"0", is_imported:"false", is_validated:"false", notes:"" }); loadAll();
  }
  async function patchPeriod(id:string, status:string, validate?:boolean){
    const r=await fetch('/api/admin/hr/vacation-periods',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status: status||undefined, is_validated: validate })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  }
  async function createVacRequest(){
    if(!vacReqForm.employee_id || !vacReqForm.start_date || !vacReqForm.end_date){ setMsg('employee_id start end obrigatório'); return; }
    const r=await fetch('/api/admin/hr/vacation-requests',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(vacReqForm)}); const j=await r.json();
    if(!r.ok){ setMsg(j.error+' '+(j.restante? `restante ${j.restante}`:'')); return; } setMsg('Solicitação férias criada conflito='+j.request.has_coverage_conflict); setVacReqForm({ employee_id:"", period_id:"", start_date:"", end_date:"", notes:"" }); loadAll();
  }
  async function patchVacRequest(id:string, status:string){
    const reason= status==='rejeitado'? prompt('Motivo rejeição min5')||'': undefined;
    if(status==='rejeitado' && (!reason||reason.length<5)){ setMsg('motivo obrigatório'); return; }
    const r=await fetch('/api/admin/hr/vacation-requests',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status, rejection_reason: reason })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  }

  return (
    <div className="border rounded p-4 space-y-6 bg-white mt-6">
      <h3 className="font-semibold">HR-07 Desligamento checklist + HR-08 Políticas status + HR-09 Férias aquisitivo/concessivo saldo conflito cobertura</h3>
      <p className="text-xs text-gray-600">Desligamento com checklist por função devolução equipamentos chaves uniforme revogação acessos documentos finais exame demissional comunicação cliente, histórico laboral preservado, políticas status afastado/suspenso/desligado efeito permissões alocação sem automatizar sanção trabalhista, férias períodos aquisitivo/concessivo saldo importado/validado programação conflito cobertura aprovação.</p>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Desligamentos ({terminations.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <input value={termForm.employee_id} onChange={e=>setTermForm({...termForm,employee_id:e.target.value})} placeholder="employee_id UUID" className="border p-1" />
              <select value={termForm.type} onChange={e=>setTermForm({...termForm,type:e.target.value})} className="border p-1"><option value="pedido_demissao">pedido_demissao</option><option value="dispensa_sem_justa">dispensa_sem_justa</option><option value="dispensa_com_justa">dispensa_com_justa</option><option value="termino_contrato">termino_contrato</option><option value="acordo">acordo</option><option value="outro">outro</option></select>
              <input value={termForm.termination_date} onChange={e=>setTermForm({...termForm,termination_date:e.target.value})} type="date" className="border p-1" />
              <input value={termForm.last_work_date} onChange={e=>setTermForm({...termForm,last_work_date:e.target.value})} type="date" className="border p-1" />
              <input value={termForm.cargo} onChange={e=>setTermForm({...termForm,cargo:e.target.value})} placeholder="cargo para checklist" className="border p-1" />
              <input value={termForm.responsible_name} onChange={e=>setTermForm({...termForm,responsible_name:e.target.value})} placeholder="responsável" className="border p-1" />
              <textarea value={termForm.reason} onChange={e=>setTermForm({...termForm,reason:e.target.value})} placeholder="motivo min10 max2000" className="border p-1 col-span-2" rows={2}></textarea>
              <textarea value={termForm.notes} onChange={e=>setTermForm({...termForm,notes:e.target.value})} placeholder="notas max2000" className="border p-1 col-span-2" rows={1}></textarea>
            </div>
            <button onClick={createTermination} className="bg-red-600 text-white px-2 py-1">criar desligamento + checklist</button>
          </div>
          <div className="max-h-64 overflow-auto border divide-y text-xs">
            {terminations.map(t=>(
              <div key={t.id} className="p-1 flex justify-between gap-2"><div><b>{t.employee_id.slice(0,8)}</b> {t.type} {t.status} term {t.termination_date?.slice(0,10)} last {t.last_work_date?.slice(0,10)||'-'} {t.responsible_name||''}<br/><span className="text-gray-500">{t.reason?.slice(0,80)||''}</span></div><div className="flex flex-col gap-1"><button onClick={()=>openTermination(t.id)} className="border px-1">progresso</button><button onClick={()=>patchTermination(t.id,'em_andamento')} className="border px-1">em andamento</button><button onClick={()=>patchTermination(t.id,'concluido')} className="border px-1 bg-green-100">concluir + histórico preservado</button></div></div>
            ))}
          </div>
          {selected && (
            <div className="border p-2">
              <h5 className="font-medium text-xs">Desligamento {selected.termination.id.slice(0,8)} progresso {selected.progress.filter(p=>p.status==='concluido').length}/{selected.progress.length}</h5>
              <div className="space-y-1 mt-1 max-h-40 overflow-auto">
                {selected.progress.map(p=>(
                  <div key={p.id} className="flex justify-between text-xs border p-1"><span>{p.title} [{p.category}] {p.is_required?'*obrig':''} status {p.status}</span><span className="flex gap-1"><button onClick={()=>patchProgress(p.id,'concluido')} className="border px-1 bg-green-100">concluir</button><button onClick={()=>patchProgress(p.id,'nao_aplicavel')} className="border px-1">n/a</button></span></div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Políticas status HR-08 (afastado/suspenso/desligado efeito permissões alocação sem sanção automática)</h4>
          <div className="border divide-y text-xs">
            {policies.map(p=>(
              <div key={p.status} className="p-1"><b>{p.status}</b> login_susp={String(p.suspend_login)} alloc_susp={String(p.suspend_allocation)} approval={String(p.requires_approval)} role={p.approval_role} legal_sanction={String(p.is_legal_sanction)}<br/><span className="text-gray-500">{p.description}</span></div>
            ))}
          </div>
          <p className="text-[10px] text-gray-600">Nota: mudança status via PATCH /api/admin/hr/employees/:id já registra histórico, política acima orienta suspensão login/alocação mas não automatiza sanção trabalhista, decisão humana RH.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Períodos férias aquisitivo/concessivo ({periods.length}) saldo importado/validado</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <input value={periodForm.employee_id} onChange={e=>setPeriodForm({...periodForm,employee_id:e.target.value})} placeholder="employee_id" className="border p-1" />
              <input value={periodForm.aquisitivo_start} onChange={e=>setPeriodForm({...periodForm,aquisitivo_start:e.target.value})} type="date" className="border p-1" />
              <input value={periodForm.aquisitivo_end} onChange={e=>setPeriodForm({...periodForm,aquisitivo_end:e.target.value})} type="date" className="border p-1" />
              <input value={periodForm.concessivo_start} onChange={e=>setPeriodForm({...periodForm,concessivo_start:e.target.value})} type="date" className="border p-1" />
              <input value={periodForm.concessivo_end} onChange={e=>setPeriodForm({...periodForm,concessivo_end:e.target.value})} type="date" className="border p-1" />
              <input value={periodForm.saldo_total_dias} onChange={e=>setPeriodForm({...periodForm,saldo_total_dias:e.target.value})} type="number" placeholder="saldo total" className="border p-1" />
              <input value={periodForm.saldo_usado_dias} onChange={e=>setPeriodForm({...periodForm,saldo_usado_dias:e.target.value})} type="number" placeholder="saldo usado" className="border p-1" />
              <select value={periodForm.is_imported} onChange={e=>setPeriodForm({...periodForm,is_imported:e.target.value})} className="border p-1"><option value="false">importado false</option><option value="true">importado true</option></select>
              <select value={periodForm.is_validated} onChange={e=>setPeriodForm({...periodForm,is_validated:e.target.value})} className="border p-1"><option value="false">validado false</option><option value="true">validado true</option></select>
              <textarea value={periodForm.notes} onChange={e=>setPeriodForm({...periodForm,notes:e.target.value})} placeholder="notas max1000" className="border p-1 col-span-2" rows={1}></textarea>
            </div>
            <button onClick={createPeriod} className="bg-blue-600 text-white px-2 py-1">criar período aquisitivo/concessivo</button>
          </div>
          <div className="max-h-40 overflow-auto border divide-y text-xs">
            {periods.map(p=>(
              <div key={p.id} className="p-1 flex justify-between"><span>{p.employee_id.slice(0,8)} aquis {p.aquisitivo_start?.slice(0,10)}{"->"}{p.aquisitivo_end?.slice(0,10)} concess {p.concessivo_start?.slice(0,10)}{"->"}{p.concessivo_end?.slice(0,10)} saldo {p.saldo_usado_dias}/{p.saldo_total_dias} rest {p.saldo_restante_dias} status {p.status} imp={String(p.is_imported)} val={String(p.is_validated)}</span><span className="flex flex-col gap-1"><button onClick={()=>patchPeriod(p.id,'em_concessivo')} className="border px-1">em concessivo</button><button onClick={()=>patchPeriod(p.id,'',true)} className="border px-1 bg-green-100">validar</button></span></div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Solicitações férias ({requests.length}) conflito cobertura aprovação</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <input value={vacReqForm.employee_id} onChange={e=>setVacReqForm({...vacReqForm,employee_id:e.target.value})} placeholder="employee_id" className="border p-1" />
              <input value={vacReqForm.period_id} onChange={e=>setVacReqForm({...vacReqForm,period_id:e.target.value})} placeholder="period_id opcional" className="border p-1" />
              <input value={vacReqForm.start_date} onChange={e=>setVacReqForm({...vacReqForm,start_date:e.target.value})} type="date" className="border p-1" />
              <input value={vacReqForm.end_date} onChange={e=>setVacReqForm({...vacReqForm,end_date:e.target.value})} type="date" className="border p-1" />
              <textarea value={vacReqForm.notes} onChange={e=>setVacReqForm({...vacReqForm,notes:e.target.value})} placeholder="notas max1000" className="border p-1 col-span-2" rows={1}></textarea>
            </div>
            <button onClick={createVacRequest} className="bg-black text-white px-2 py-1">solicitar férias + conflito cobertura</button>
          </div>
          <div className="max-h-64 overflow-auto border divide-y text-xs">
            {requests.map(r=>(
              <div key={r.id} className="p-1 flex justify-between gap-2"><div><b>{r.employee_id.slice(0,8)}</b> {r.start_date?.slice(0,10)}{"->"}{r.end_date?.slice(0,10)} {r.dias}d status {r.status} conflito={String(r.has_coverage_conflict)}<br/><span className="text-gray-500">{r.conflict_details||''} {r.rejection_reason? `rejeitado: ${r.rejection_reason}`:''}</span></div><div className="flex flex-col gap-1"><button onClick={()=>patchVacRequest(r.id,'em_analise')} className="border px-1">em análise</button><button onClick={()=>patchVacRequest(r.id,'aprovado')} className="border px-1 bg-green-100">aprovar - saldo</button><button onClick={()=>patchVacRequest(r.id,'rejeitado')} className="border px-1 bg-red-100">rejeitar</button></div></div>
            ))}
          </div>
        </div>
      </div>
      {msg && <div className="text-xs text-blue-700">{msg}</div>}
    </div>
  );
}
