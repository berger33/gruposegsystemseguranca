"use client";
import { useEffect, useState } from "react";

type Req = { id:string; employee_id:string; employee_name?:string; matricula?:string; status:string; requested_changes:any; current_snapshot:any; justification?:string; created_at:string; reviewed_at?:string; rejection_reason?:string; };

export default function EmpProfileClient(){
  const [myProfile,setMyProfile]=useState<any>(null);
  const [fieldCfg,setFieldCfg]=useState<any[]>([]);
  const [myRequests,setMyRequests]=useState<Req[]>([]);
  const [allRequests,setAllRequests]=useState<Req[]>([]);
  const [edit,setEdit]=useState({ contact_email:"", contact_phone:"", address_city:"", address_state:"", justification:"" });
  const [filterStatus,setFilterStatus]=useState("");
  const [msg,setMsg]=useState("");

  async function loadMy(){
    const r=await fetch('/api/admin/employee/profile'); const j=await r.json();
    if(r.ok){ setMyProfile(j.employee); setFieldCfg(j.field_config||[]); setMyRequests(j.update_requests||[]); setEdit({ contact_email:j.employee?.contact_email||'', contact_phone:j.employee?.contact_phone||'', address_city:j.employee?.address_city||'', address_state:j.employee?.address_state||'', justification:'' }); }
    else setMsg(j.error||'não vinculado');
  }
  async function loadAll(){
    const params=new URLSearchParams(); if(filterStatus) params.set('status',filterStatus);
    const r=await fetch(`/api/admin/hr/profile-updates?${params}`); const j=await r.json(); if(r.ok) setAllRequests(j.requests||[]);
  }
  useEffect(()=>{ loadMy(); loadAll(); },[]);

  async function requestUpdate(){
    const changes:any={};
    if(edit.contact_email) changes.contact_email=edit.contact_email;
    if(edit.contact_phone) changes.contact_phone=edit.contact_phone;
    if(edit.address_city) changes.address_city=edit.address_city;
    if(edit.address_state) changes.address_state=edit.address_state;
    if(Object.keys(changes).length===0){ setMsg('nenhuma alteração'); return; }
    const r=await fetch('/api/admin/employee/profile',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ changes, justification: edit.justification })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error||'erro'); return; } setMsg('Solicitação criada protocolo '+j.request.id.slice(0,8)); loadMy(); loadAll();
  }
  async function review(id:string, action:string){
    const reason= action==='rejeitar'? prompt('Motivo rejeição min 5')||'': undefined;
    if(action==='rejeitar' && (!reason||reason.length<5)){ setMsg('motivo obrigatório'); return; }
    const r=await fetch('/api/admin/hr/profile-updates',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, action, rejection_reason: reason })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error||'erro review'); return; } setMsg('Solicitação '+action); loadAll(); loadMy();
  }

  return (
    <div className="border rounded p-4 space-y-4 bg-white mt-6">
      <h3 className="font-semibold">EMP-01 Perfil próprio e solicitação atualização cadastral (dados restritos mascarados)</h3>
      <p className="text-xs text-gray-600">Funcionário vinculado via identity_id em hr_employees visualiza perfil com máscara sigiloso/restrito (remuneração null, cpf ***). Edita apenas contact_email/phone/address_city/state via solicitação pendente revisada por RH. Mudança revisada registra histórico, sem automatizar sanção.</p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Meu perfil (mascarado conforme sensibilidade)</h4>
          {myProfile? (
            <div className="border p-2 text-xs space-y-1">
              <div>Matrícula: {myProfile.matricula} | Nome: {myProfile.display_name} | Cargo: {myProfile.cargo}</div>
              <div>Lotação: {myProfile.lotacao||'-'} Empregador: {myProfile.empregador||'-'} Filial: {myProfile.filial||'-'}</div>
              <div>Remuneração: {myProfile.remuneracao_atual===null? '*** mascarado sigiloso': myProfile.remuneracao_atual}</div>
              <div>CPF hash: {myProfile.cpf_hash? '***': '-' } Birth: {myProfile.birth_date? '**/**/****': '-'}</div>
              <div className="grid grid-cols-2 gap-1 mt-2">
                <input value={edit.contact_email} onChange={e=>setEdit({...edit,contact_email:e.target.value})} placeholder="novo email contato" className="border p-1" />
                <input value={edit.contact_phone} onChange={e=>setEdit({...edit,contact_phone:e.target.value})} placeholder="novo telefone" className="border p-1" />
                <input value={edit.address_city} onChange={e=>setEdit({...edit,address_city:e.target.value})} placeholder="cidade" className="border p-1" />
                <input value={edit.address_state} onChange={e=>setEdit({...edit,address_state:e.target.value})} placeholder="UF" className="border p-1" />
                <input value={edit.justification} onChange={e=>setEdit({...edit,justification:e.target.value})} placeholder="justificativa max 1000" className="border p-1 col-span-2" />
              </div>
              <button onClick={requestUpdate} className="bg-blue-600 text-white px-2 py-1 mt-1">solicitar atualização cadastral</button>
              <div className="mt-2">
                <h5 className="font-medium">Minhas solicitações ({myRequests.length})</h5>
                <div className="max-h-32 overflow-auto divide-y border">
                  {myRequests.map(rq=>(
                    <div key={rq.id} className="p-1"><span className="font-mono">{rq.id.slice(0,8)}</span> {rq.status} {new Date(rq.created_at).toLocaleDateString("pt-BR")} changes {JSON.stringify(rq.requested_changes)} {rq.rejection_reason? `rejeitado: ${rq.rejection_reason}`:''}</div>
                  ))}
                </div>
              </div>
              <div className="mt-2">
                <h5 className="font-medium">Config sensibilidade</h5>
                <div className="max-h-24 overflow-auto border text-[10px] p-1">{fieldCfg.map(f=><div key={f.field_name}>{f.field_name} {f.sensitivity} masked={String(f.is_masked_for_employee)} editable={String(f.is_editable_by_employee)}</div>)}</div>
              </div>
            </div>
          ): <div className="text-xs text-gray-500">Perfil não vinculado - crie profissional em HR-01 e vincule identity_id via SQL UPDATE hr_employees SET identity_id='uuid' WHERE matricula='...' ou faça login staff vinculado. Mensagem: {msg}</div>}
        </div>
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Fila RH aprovação ({allRequests.length})</h4>
          <div className="flex gap-1">
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="border p-1 text-xs"><option value="">todos</option><option value="pendente">pendente</option><option value="em_analise">em_analise</option><option value="aprovado">aprovado</option><option value="rejeitado">rejeitado</option></select>
            <button onClick={loadAll} className="border px-2 text-xs">filtrar</button>
          </div>
          <div className="max-h-96 overflow-auto border divide-y text-xs">
            {allRequests.map(rq=>(
              <div key={rq.id} className="p-1 flex justify-between gap-2">
                <div><b>{rq.employee_name||rq.employee_id.slice(0,8)}</b> [{rq.matricula||''}] {rq.status} <span className="text-gray-500">{new Date(rq.created_at).toLocaleString("pt-BR")}</span><br/>mudanças: {JSON.stringify(rq.requested_changes)} <br/>atual: {JSON.stringify(rq.current_snapshot)}<br/>just: {rq.justification||'-'}</div>
                <div className="flex flex-col gap-1">
                  <button onClick={()=>review(rq.id,'em_analise')} className="border px-1">em análise</button>
                  <button onClick={()=>review(rq.id,'aprovar')} className="border px-1 bg-green-100">aprovar + histórico</button>
                  <button onClick={()=>review(rq.id,'rejeitar')} className="border px-1 bg-red-100">rejeitar</button>
                </div>
              </div>
            ))}
          </div>
          {msg && <div className="text-xs text-blue-700">{msg}</div>}
        </div>
      </div>
    </div>
  );
}
