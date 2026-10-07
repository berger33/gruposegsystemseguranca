"use client";
import UiTaskWorkspace from "@/components/ui/UiTaskWorkspace";
import {workspaceResponse} from "@/lib/workspace-response";
import { useEffect, useRef, useState } from "react";

type Emp = { id:string; matricula:string; display_name:string; cargo:string; status:string; employment_type:string; empregador?:string; filial?:string; lotacao?:string; gestor_name?:string; contact_email?:string; admission_date?:string; created_at:string; };
type History = { id:string; previous_cargo?:string; next_cargo:string; previous_lotacao?:string; next_lotacao?:string; previous_remuneracao?:string; next_remuneracao?:string; previous_status?:string; next_status?:string; effective_date:string; reason?:string; changed_by?:string; };
type Admission = { id:string; employee_id:string; checklist_id?:string; status:string; started_at?:string; completed_at?:string; responsible_name?:string; notes?:string; created_at:string; };
type Progress = { id:string; item_id:string; status:string; title:string; category:string; is_required:boolean; completed_at?:string; rejection_reason?:string; file_url?:string; };

export default function HrClient(){
 const [workspaceLoading,setWorkspaceLoading]=useState(false);
 const operation=useRef(false);const [operationBusy,setOperationBusy]=useState(false);
  const [emps,setEmps]=useState<Emp[]>([]);
  const [filter,setFilter]=useState(""); const [status,setStatus]=useState("");
  const [selected,setSelected]=useState<Emp|null>(null);
  const [history,setHistory]=useState<History[]>([]);
  const [admissions,setAdmissions]=useState<Admission[]>([]);
  const [admissionDetail,setAdmissionDetail]=useState<{admission:Admission; progress:Progress[]}|null>(null);
  const [form,setForm]=useState({ matricula:"", display_name:"", cargo:"vigilante", employment_type:"clt", empregador:"", filial:"", lotacao:"", contact_email:"", admission_date:"", notes:"", cpf:"" });
  const [editForm,setEditForm]=useState({ cargo:"", lotacao:"", empregador:"", filial:"", status:"", remuneracao_atual:"", reason:"", effective_date:"" });
  const [msg,setMsg]=useState("");

  async function load(){
setWorkspaceLoading(true);
try {
    const params=new URLSearchParams(); if(filter) params.set('search',filter); if(status) params.set('status',status);
    const r=await fetch(`/api/admin/hr/employees?${params.toString()}`); const j=await r.json(); if(r.ok) setEmps(j.employees||[]);
  } catch(error) {setMsg(error instanceof Error ? error.message : 'Não foi possível carregar esta área. Atualize para tentar novamente.');} finally {setWorkspaceLoading(false);}
}
  useEffect(()=>{ load(); },[]);
  async function openEmp(id:string){
    const r=await fetch(`/api/admin/hr/employees/${id}`); const j=await r.json(); if(r.ok){ setSelected(j.employee); setHistory(j.history||[]); setAdmissions(j.admissions||[]); setEditForm({ cargo:j.employee.cargo, lotacao:j.employee.lotacao||'', empregador:j.employee.empregador||'', filial:j.employee.filial||'', status:j.employee.status, remuneracao_atual:'', reason:'', effective_date:new Date().toISOString().slice(0,10) }); }
  }
  async function createEmp(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(form.matricula.length<1 || form.display_name.length<3 || form.cargo.length<2){ setMsg('matricula/nome/cargo obrigatório'); return; }
    const r=await fetch('/api/admin/hr/employees',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) }); const j=await r.json();
    if(!r.ok){ setMsg(j.error||'erro'); return; } setMsg('Profissional criado'); setForm({ matricula:"", display_name:"", cargo:"vigilante", employment_type:"clt", empregador:"", filial:"", lotacao:"", contact_email:"", admission_date:"", notes:"", cpf:"" }); load();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchEmp(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!selected) return;
    const payload:any={}; if(editForm.cargo) payload.cargo=editForm.cargo; if(editForm.lotacao!==undefined) payload.lotacao=editForm.lotacao; if(editForm.empregador!==undefined) payload.empregador=editForm.empregador; if(editForm.filial!==undefined) payload.filial=editForm.filial; if(editForm.status) payload.status=editForm.status; if(editForm.remuneracao_atual) payload.remuneracao_atual=editForm.remuneracao_atual; if(editForm.reason) payload.reason=editForm.reason; if(editForm.effective_date) payload.effective_date=editForm.effective_date;
    const r=await fetch(`/api/admin/hr/employees/${selected.id}`,{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}); const j=await r.json();
    if(!r.ok){ setMsg(j.error||'erro patch'); return; } setMsg('Histórico registrado'); openEmp(selected.id); load();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createAdmission(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!selected) return;
    const r=await fetch('/api/admin/hr/admissions',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ employee_id:selected.id, cargo:selected.cargo, responsible_name:'RH' })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error||'erro admissão'); return; } setMsg('Admissão criada'); openEmp(selected.id);
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function openAdmission(id:string){
    const r=await fetch(`/api/admin/hr/admissions/${id}`); const j=await r.json(); if(r.ok) setAdmissionDetail(j);
  }
  async function patchProgress(pid:string, newStatus:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    const reason= newStatus==='rejeitado'? prompt('Motivo rejeição (min 5)')||'': undefined;
    if(newStatus==='rejeitado' && (!reason||reason.length<5)){ setMsg('motivo obrigatório'); return; }
    const r=await fetch('/api/admin/hr/admission-progress',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id:pid, status:newStatus, rejection_reason:reason })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error||'erro progresso'); return; } if(admissionDetail) openAdmission(admissionDetail.admission.id);
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}

  return (
    <UiTaskWorkspace className="border rounded p-4 space-y-4 bg-white mt-6">
<fieldset disabled={operationBusy} aria-label="Processos desta área" style={{border:0,padding:0,margin:0,minWidth:0}}>
{operationBusy&&<p role="status">Salvando alteração…</p>}
{workspaceLoading && <p role="status">Carregando informações desta área…</p>}
      <h3 className="font-semibold">HR-01 Cadastro profissional separado de login + HR-02 histórico + HR-05 admissão checklist</h3>
      <p className="text-xs text-gray-600">Profissional desvinculado de identidade de login: matricula UNIQUE, cpf hash, gestor hierárquico, cargo/lotação/empregador com histórico versionado, admissão por checklist por função (vigilante/porteiro/supervisor) com progresso aprovado/rejeitado. Remuneração sensível só admin/ti.</p>
      <div className="flex gap-2 flex-wrap">
        <label>buscar nome matrícula cargo <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="buscar nome matrícula cargo" className="border p-1 text-sm" /></label>
        <label>Situação<select value={status} onChange={e=>setStatus(e.target.value)} className="border p-1 text-sm"><option value="">todos status</option><option value="em_admissao">em_admissao</option><option value="ativo">ativo</option><option value="afastado">afastado</option><option value="suspenso">suspenso</option><option value="desligado">desligado</option></select></label>
        <button onClick={load} className="border px-2 py-1 text-sm">filtrar</button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Profissionais ({emps.length})</h4>
          <div className="max-h-96 overflow-auto border divide-y">
            {emps.map(e=>(
              <div key={e.id} className="p-2 text-xs flex justify-between">
                <div><b>{e.display_name}</b> [{e.matricula}] {e.cargo} <span className="text-gray-500">{e.status}</span> {e.lotacao? `| ${e.lotacao}`:''} {e.filial? `| ${e.filial}`:''}</div>
                <button onClick={()=>openEmp(e.id)} className="border px-1">abrir</button>
              </div>
            ))}
          </div>
          <div className="border p-2 space-y-1">
            <h5 className="font-medium text-xs">Criar profissional</h5>
            <div className="grid grid-cols-2 gap-1">
              <label>matricula <input value={form.matricula} onChange={e=>setForm({...form,matricula:e.target.value})} placeholder="matricula" className="border p-1 text-xs" /></label>
              <label>nome completo <input value={form.display_name} onChange={e=>setForm({...form,display_name:e.target.value})} placeholder="nome completo min 3" className="border p-1 text-xs" /></label>
              <label>cargo <input value={form.cargo} onChange={e=>setForm({...form,cargo:e.target.value})} placeholder="cargo" className="border p-1 text-xs" /></label>
              <label>Employment type<select value={form.employment_type} onChange={e=>setForm({...form,employment_type:e.target.value})} className="border p-1 text-xs"><option value="clt">clt</option><option value="terceirizado">terceirizado</option><option value="temporario">temporario</option><option value="estagio">estagio</option><option value="pj">pj</option><option value="outro">outro</option></select></label>
              <label>empregador <input value={form.empregador} onChange={e=>setForm({...form,empregador:e.target.value})} placeholder="empregador" className="border p-1 text-xs" /></label>
              <label>filial <input value={form.filial} onChange={e=>setForm({...form,filial:e.target.value})} placeholder="filial" className="border p-1 text-xs" /></label>
              <label>lotação <input value={form.lotacao} onChange={e=>setForm({...form,lotacao:e.target.value})} placeholder="lotação" className="border p-1 text-xs" /></label>
              <label>email contato <input value={form.contact_email} onChange={e=>setForm({...form,contact_email:e.target.value})} placeholder="email contato" className="border p-1 text-xs" /></label>
              <input value={form.admission_date} onChange={e=>setForm({...form,admission_date:e.target.value})} type="date" className="border p-1 text-xs" />
              <label>CPF (hash sha256) <input value={form.cpf} onChange={e=>setForm({...form,cpf:e.target.value})} placeholder="CPF (hash sha256)" className="border p-1 text-xs" /></label>
            </div>
            <textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="notas max 2000 NÃO incluir prontuário médico" className="border p-1 w-full text-xs" rows={2}></textarea>
            <button onClick={createEmp} className="bg-blue-600 text-white px-2 py-1 text-xs">criar</button>
          </div>
        </div>
        <div className="space-y-2">
          {selected? (
            <>
              <h4 className="font-medium text-sm">Detalhe {selected.display_name} [{selected.matricula}]</h4>
              <div className="border p-2 space-y-1 text-xs">
                <div>Status atual: {selected.status} | Cargo: {selected.cargo} | Lotação: {(selected as any).lotacao||'-'}</div>
                <div>Empregador: {(selected as any).empregador||'-'} Filial: {(selected as any).filial||'-'} Email: {selected.contact_email||'-'}</div>
                <div className="grid grid-cols-2 gap-1">
                  <label>novo cargo <input value={editForm.cargo} onChange={e=>setEditForm({...editForm,cargo:e.target.value})} placeholder="novo cargo" className="border p-1" /></label>
                  <label>nova lotação <input value={editForm.lotacao} onChange={e=>setEditForm({...editForm,lotacao:e.target.value})} placeholder="nova lotação" className="border p-1" /></label>
                  <label>novo empregador <input value={editForm.empregador} onChange={e=>setEditForm({...editForm,empregador:e.target.value})} placeholder="novo empregador" className="border p-1" /></label>
                  <label>nova filial <input value={editForm.filial} onChange={e=>setEditForm({...editForm,filial:e.target.value})} placeholder="nova filial" className="border p-1" /></label>
                  <label>Situação<select value={editForm.status} onChange={e=>setEditForm({...editForm,status:e.target.value})} className="border p-1"><option value="">status</option><option value="em_admissao">em_admissao</option><option value="ativo">ativo</option><option value="afastado">afastado</option><option value="suspenso">suspenso</option><option value="desligado">desligado</option><option value="arquivado">arquivado</option></select></label>
                  <label>remuneração sensível <input value={editForm.remuneracao_atual} onChange={e=>setEditForm({...editForm,remuneracao_atual:e.target.value})} placeholder="remuneração sensível" type="number" className="border p-1" /></label>
                  <input value={editForm.effective_date} onChange={e=>setEditForm({...editForm,effective_date:e.target.value})} type="date" className="border p-1" />
                  <label>motivo mudança <input value={editForm.reason} onChange={e=>setEditForm({...editForm,reason:e.target.value})} placeholder="motivo mudança max 1000" className="border p-1 col-span-2" /></label>
                </div>
                <button onClick={patchEmp} className="bg-black text-white px-2 py-1">registrar mudança + histórico</button>
              </div>
              <h5 className="font-medium text-xs mt-2">Histórico cargo/lotação/remuneração ({history.length})</h5>
              <div className="max-h-40 overflow-auto border divide-y text-xs">
                {history.map(h=>(
                  <div key={h.id} className="p-1"><b>{h.effective_date?.slice(0,10)}</b> {h.previous_cargo||'-'} → {h.next_cargo} | lot {h.previous_lotacao||'-'}→{h.next_lotacao||'-'} | status {h.previous_status||'-'}→{h.next_status||'-'} | remun {h.previous_remuneracao||'-'}→{h.next_remuneracao||'-'} <span className="text-gray-500">{h.reason||''} por {h.changed_by||''}</span></div>
                ))}
              </div>
              <h5 className="font-medium text-xs mt-2">Admissões ({admissions.length}) <button onClick={createAdmission} className="border px-1 ml-2">+ criar admissão checklist</button></h5>
              <div className="max-h-32 overflow-auto border divide-y text-xs">
                {admissions.map(a=>(
                  <div key={a.id} className="p-1 flex justify-between"><span>{a.status} criado {a.created_at?.slice(0,10)} {a.completed_at? `concluído ${a.completed_at.slice(0,10)}`:''}</span><button onClick={()=>openAdmission(a.id)} className="border px-1">progresso</button></div>
                ))}
              </div>
              {admissionDetail && (
                <div className="border p-2">
                  <h6 className="font-medium text-xs">Admissão {admissionDetail.admission.id.slice(0,8)} status {admissionDetail.admission.status} progresso {admissionDetail.progress.filter(p=>p.status==='aprovado').length}/{admissionDetail.progress.length}</h6>
                  <div className="space-y-1 mt-1">
                    {admissionDetail.progress.map(p=>(
                      <div key={p.id} className="flex justify-between text-xs border p-1"><span>{p.title} [{p.category}] {p.is_required?'*obrig':''} status {p.status} {p.rejection_reason? ` motivo ${p.rejection_reason}`:''}</span><span className="flex gap-1"><button onClick={()=>patchProgress(p.id,'aprovado')} className="border px-1 bg-green-100">aprovar</button><button onClick={()=>patchProgress(p.id,'rejeitado')} className="border px-1 bg-red-100">rejeitar</button></span></div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ): <div className="text-xs text-gray-500">Selecione profissional</div>}
          {msg && <div className="text-xs text-blue-700">{msg}</div>}
        </div>
      </div>
    </fieldset></UiTaskWorkspace>
  );
}
