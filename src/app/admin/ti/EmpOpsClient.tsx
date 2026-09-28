"use client";
import { useEffect, useState } from "react";

type Swap = { id:string; protocol:string; requester_employee_id:string; target_employee_id?:string; swap_date:string; reason:string; status:string; target_ack:boolean; is_overlapping_validated:boolean; is_qualification_validated:boolean; validation_notes?:string; requester_name?:string; target_name?:string };
type Handover = { id:string; protocol:string; from_employee_id:string; to_employee_id:string; handover_date:string; pending_tasks?:string; status:string; is_private:boolean; from_name?:string; to_name?:string };
type Occurrence = { id:string; protocol:string; employee_id:string; category:string; severity:string; title:string; description:string; occurred_at:string; location?:string; status:string; is_personal_data_restricted:boolean; employee_name?:string };
type OccAttach = { id:string; occurrence_id:string; file_name:string; file_url:string; is_personal_data_restricted:boolean };
type OccAction = { id:string; occurrence_id:string; action_type:string; description:string; responsible_name?:string; due_date?:string; status:string };
type Procedure = { id:string; post_location:string; title:string; version:number; content:string; category?:string; status:string; is_active:boolean };
type Ack = { id:string; procedure_id:string; employee_id:string; acknowledged_at:string; employee_name?:string; procedure_title?:string; version?:number };
type Contact = { id:string; name:string; role?:string; phone?:string; post_location?:string; is_emergency:boolean; is_active:boolean };

export default function EmpOpsClient(){
  const [swaps,setSwaps]=useState<Swap[]>([]);
  const [handovers,setHandovers]=useState<Handover[]>([]);
  const [occurrences,setOccurrences]=useState<Occurrence[]>([]);
  const [occAttaches,setOccAttaches]=useState<OccAttach[]>([]);
  const [occActions,setOccActions]=useState<OccAction[]>([]);
  const [procedures,setProcedures]=useState<Procedure[]>([]);
  const [acks,setAcks]=useState<Ack[]>([]);
  const [contacts,setContacts]=useState<Contact[]>([]);

  const [swapForm,setSwapForm]=useState({ requester_employee_id:'', target_employee_id:'', original_shift_id:'', swap_date:'', reason:'', notes:'' });
  const [handoverForm,setHandoverForm]=useState({ from_employee_id:'', to_employee_id:'', shift_assignment_id:'', pending_tasks:'', keys_handover:'', equipment_handover:'', occurrences_summary:'', notes:'' });
  const [occForm,setOccForm]=useState({ employee_id:'', category:'operacional', severity:'media', title:'', description:'', location:'', occurred_at:'', reported_by_name:'', notes:'' });
  const [occAttachForm,setOccAttachForm]=useState({ occurrence_id:'', file_name:'', file_url:'' });
  const [occActionForm,setOccActionForm]=useState({ occurrence_id:'', action_type:'correcao', description:'', responsible_name:'', due_date:'', notes:'' });
  const [procForm,setProcForm]=useState({ post_location:'', title:'', content:'', category:'' });
  const [ackForm,setAckForm]=useState({ procedure_id:'', employee_id:'', notes:'' });
  const [contactForm,setContactForm]=useState({ name:'', role:'', phone:'', post_location:'', is_emergency:false, notes:'' });

  const [selectedOcc,setSelectedOcc]=useState<string>('');

  async function api(path:string, opts?:any){
    const res=await fetch(path, { ...opts, headers:{ 'Content-Type':'application/json', ...(opts?.headers||{}) } });
    const j=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(j.error||`HTTP ${res.status}`);
    return j;
  }

  async function loadAll(){
    try{
      const [s,h,o,p,c]=await Promise.all([
        api('/api/admin/hr/shift-swaps'),
        api('/api/admin/hr/handover-records'),
        api('/api/admin/hr/occurrences'),
        api('/api/admin/hr/post-procedures'),
        api('/api/admin/hr/support-contacts-ops'),
      ]);
      setSwaps(s.swaps||[]); setHandovers(h.handovers||[]); setOccurrences(o.occurrences||[]); setProcedures(p.procedures||[]); setContacts(c.contacts||[]);
      const [ack]=await Promise.all([ api('/api/admin/hr/procedure-acks') ]);
      setAcks(ack.acknowledgments||[]);
    }catch(e){ console.error(e); }
  }
  useEffect(()=>{ loadAll(); },[]);

  async function loadOccDetails(occurrence_id:string){
    try{
      const [a,ac]=await Promise.all([
        api(`/api/admin/hr/occurrence-attachments?occurrence_id=${occurrence_id}`),
        api(`/api/admin/hr/occurrence-actions?occurrence_id=${occurrence_id}`),
      ]);
      setOccAttaches(a.attachments||[]); setOccActions(ac.actions||[]); setSelectedOcc(occurrence_id);
    }catch(e){ console.error(e); }
  }

  // EMP-06
  async function createSwap(){
    try{ await api('/api/admin/hr/shift-swaps',{ method:'POST', body:JSON.stringify(swapForm) }); setSwapForm({ requester_employee_id:'', target_employee_id:'', original_shift_id:'', swap_date:'', reason:'', notes:'' }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function patchSwap(id:string, patch:any){
    try{ await api('/api/admin/hr/shift-swaps',{ method:'PATCH', body:JSON.stringify({ id, ...patch }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }

  // EMP-07
  async function createHandover(){
    try{
      const body={ ...handoverForm, keys_handover: handoverForm.keys_handover? JSON.parse(handoverForm.keys_handover): null, equipment_handover: handoverForm.equipment_handover? JSON.parse(handoverForm.equipment_handover): null };
      await api('/api/admin/hr/handover-records',{ method:'POST', body:JSON.stringify(body) });
      setHandoverForm({ from_employee_id:'', to_employee_id:'', shift_assignment_id:'', pending_tasks:'', keys_handover:'', equipment_handover:'', occurrences_summary:'', notes:'' });
      loadAll();
    }catch(e:any){ alert(e.message); }
  }
  async function patchHandover(id:string, status:string, rejection_reason?:string){
    try{ await api('/api/admin/hr/handover-records',{ method:'PATCH', body:JSON.stringify({ id, status, rejection_reason }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }

  // EMP-08
  async function createOcc(){
    try{ await api('/api/admin/hr/occurrences',{ method:'POST', body:JSON.stringify(occForm) }); setOccForm({ employee_id:'', category:'operacional', severity:'media', title:'', description:'', location:'', occurred_at:'', reported_by_name:'', notes:'' }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function patchOcc(id:string, status:string){
    try{ await api('/api/admin/hr/occurrences',{ method:'PATCH', body:JSON.stringify({ id, status }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function createOccAttach(){
    try{ await api('/api/admin/hr/occurrence-attachments',{ method:'POST', body:JSON.stringify(occAttachForm) }); setOccAttachForm({ occurrence_id:occAttachForm.occurrence_id, file_name:'', file_url:'' }); if(occAttachForm.occurrence_id) loadOccDetails(occAttachForm.occurrence_id); }catch(e:any){ alert(e.message); }
  }
  async function createOccAction(){
    try{ await api('/api/admin/hr/occurrence-actions',{ method:'POST', body:JSON.stringify(occActionForm) }); setOccActionForm({ occurrence_id:occActionForm.occurrence_id, action_type:'correcao', description:'', responsible_name:'', due_date:'', notes:'' }); if(occActionForm.occurrence_id) loadOccDetails(occActionForm.occurrence_id); }catch(e:any){ alert(e.message); }
  }
  async function patchOccAction(id:string, status:string){
    try{ await api('/api/admin/hr/occurrence-actions',{ method:'PATCH', body:JSON.stringify({ id, status }) }); if(selectedOcc) loadOccDetails(selectedOcc); }catch(e:any){ alert(e.message); }
  }

  // EMP-09
  async function createProc(){
    try{ await api('/api/admin/hr/post-procedures',{ method:'POST', body:JSON.stringify(procForm) }); setProcForm({ post_location:'', title:'', content:'', category:'' }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function patchProc(id:string, status:string){
    try{ await api('/api/admin/hr/post-procedures',{ method:'PATCH', body:JSON.stringify({ id, status }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function createAck(){
    try{ await api('/api/admin/hr/procedure-acks',{ method:'POST', body:JSON.stringify(ackForm) }); setAckForm({ procedure_id:'', employee_id:'', notes:'' }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function createContact(){
    try{ await api('/api/admin/hr/support-contacts-ops',{ method:'POST', body:JSON.stringify(contactForm) }); setContactForm({ name:'', role:'', phone:'', post_location:'', is_emergency:false, notes:'' }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function patchContact(id:string, patch:any){
    try{ await api('/api/admin/hr/support-contacts-ops',{ method:'PATCH', body:JSON.stringify({ id, ...patch }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }

  return (
    <div className="space-y-8 border-t pt-8 mt-8">
      <h2 className="text-xl font-bold">EMP-06..09 troca passagem ocorrência procedimentos (lote 31)</h2>

      {/* EMP-06 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">EMP-06 troca plantão solicitação aceite outro profissional validações aprovação operacional</h3>
        <div className="grid grid-cols-3 gap-2">
          <input className="border p-1" placeholder="requester_employee_id" value={swapForm.requester_employee_id} onChange={e=>setSwapForm({...swapForm,requester_employee_id:e.target.value})} />
          <input className="border p-1" placeholder="target_employee_id outro profissional" value={swapForm.target_employee_id} onChange={e=>setSwapForm({...swapForm,target_employee_id:e.target.value})} />
          <input className="border p-1" placeholder="original_shift_id" value={swapForm.original_shift_id} onChange={e=>setSwapForm({...swapForm,original_shift_id:e.target.value})} />
          <input className="border p-1" type="date" value={swapForm.swap_date} onChange={e=>setSwapForm({...swapForm,swap_date:e.target.value})} />
          <input className="border p-1" placeholder="reason min10" value={swapForm.reason} onChange={e=>setSwapForm({...swapForm,reason:e.target.value})} />
          <input className="border p-1" placeholder="notes" value={swapForm.notes} onChange={e=>setSwapForm({...swapForm,notes:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createSwap}>Solicitar troca plantão</button>
        <div className="space-y-1 text-sm max-h-60 overflow-auto">
          {swaps.slice(0,20).map(s=>(
            <div key={s.id} className="border p-1 flex justify-between">
              <span>{s.protocol} {s.swap_date} req {s.requester_name||s.requester_employee_id.slice(0,8)} → {s.target_name||s.target_employee_id?.slice(0,8)||'aberto'} {s.status} overlap {s.is_overlapping_validated?'✔':'✘'} qual {s.is_qualification_validated?'✔':'✘'} {s.target_ack?'aceite outro ✔':''}</span>
              <span className="space-x-1">
                <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchSwap(s.id,{ status:'aceito' })}>aceite outro profissional</button>
                <button className="bg-blue-600 text-white px-1 rounded" onClick={()=>patchSwap(s.id,{ status:'aprovado', is_overlapping_validated:true, is_qualification_validated:true, validation_notes:'Validado sobreposição e qualificação - sem conflito' })}>aprovação operacional</button>
                <button className="bg-red-600 text-white px-1 rounded" onClick={()=>patchSwap(s.id,{ status:'rejeitado', target_rejection_reason:'Não posso cobrir neste dia' })}>rejeitar</button>
                <button className="bg-gray-600 text-white px-1 rounded" onClick={()=>patchSwap(s.id,{ status:'rejeitado_operacional', operational_rejection_reason:'Conflito escala operacional' })}>rejeitar operacional</button>
              </span>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-600">Solicitação aceite outro profissional validações sobreposição qualificação, status solicitado/pendente_aceite/aceito/rejeitado/em_analise/aprovado/rejeitado_operacional, target_ack bool, is_overlapping_validated is_qualification_validated bool, aprovação operacional exige validações, protocol SWPYYYYMMDD-XXXX, audit swap_request/accept/approve</div>
      </div>

      {/* EMP-07 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">EMP-07 passagem serviço pendências chaves equipamentos ocorrências aceite não expor dados desnecessários terceiros</h3>
        <div className="grid grid-cols-3 gap-2">
          <input className="border p-1" placeholder="from_employee_id origem" value={handoverForm.from_employee_id} onChange={e=>setHandoverForm({...handoverForm,from_employee_id:e.target.value})} />
          <input className="border p-1" placeholder="to_employee_id destino" value={handoverForm.to_employee_id} onChange={e=>setHandoverForm({...handoverForm,to_employee_id:e.target.value})} />
          <input className="border p-1" placeholder="shift_assignment_id opcional" value={handoverForm.shift_assignment_id} onChange={e=>setHandoverForm({...handoverForm,shift_assignment_id:e.target.value})} />
          <input className="border p-1" placeholder="pending_tasks" value={handoverForm.pending_tasks} onChange={e=>setHandoverForm({...handoverForm,pending_tasks:e.target.value})} />
          <input className="border p-1" placeholder='keys JSON {"portaria":2}' value={handoverForm.keys_handover} onChange={e=>setHandoverForm({...handoverForm,keys_handover:e.target.value})} />
          <input className="border p-1" placeholder='equip JSON {"radio":1}' value={handoverForm.equipment_handover} onChange={e=>setHandoverForm({...handoverForm,equipment_handover:e.target.value})} />
          <input className="border p-1" placeholder="occurrences_summary" value={handoverForm.occurrences_summary} onChange={e=>setHandoverForm({...handoverForm,occurrences_summary:e.target.value})} />
          <input className="border p-1" placeholder="notes" value={handoverForm.notes} onChange={e=>setHandoverForm({...handoverForm,notes:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createHandover}>Criar passagem serviço</button>
        <div className="space-y-1 text-sm max-h-60 overflow-auto">
          {handovers.slice(0,20).map(h=>(
            <div key={h.id} className="border p-1 flex justify-between">
              <span>{h.protocol} {h.from_name||h.from_employee_id.slice(0,8)} → {h.to_name||h.to_employee_id.slice(0,8)} {h.status} {h.is_private?'privado':''} pend {h.pending_tasks?.slice(0,20)}</span>
              <span className="space-x-1">
                <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchHandover(h.id,'aceito')}>aceite</button>
                <button className="bg-red-600 text-white px-1 rounded" onClick={()=>patchHandover(h.id,'recusado','Chaves não conferem')}>recusar</button>
                <button className="bg-gray-600 text-white px-1 rounded" onClick={()=>patchHandover(h.id,'encerrado')}>encerrar</button>
              </span>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-600">Origem destino pendências chaves equipamentos ocorrências aceite, protocol HND, is_private true não expor dados desnecessários terceiros, status pendente/em_andamento/aceito/recusado/encerrado, audit handover_create/accept</div>
      </div>

      {/* EMP-08 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">EMP-08 ocorrência categoria descrição horário local anexo pertinente restrição informações pessoais</h3>
        <div className="grid grid-cols-3 gap-2">
          <input className="border p-1" placeholder="employee_id" value={occForm.employee_id} onChange={e=>setOccForm({...occForm,employee_id:e.target.value})} />
          <select className="border p-1" value={occForm.category} onChange={e=>setOccForm({...occForm,category:e.target.value})}><option value="seguranca">seguranca</option><option value="operacional">operacional</option><option value="manutencao">manutencao</option><option value="limpeza">limpeza</option><option value="comportamental">comportamental</option><option value="cliente">cliente</option><option value="equipamento">equipamento</option><option value="outro">outro</option></select>
          <select className="border p-1" value={occForm.severity} onChange={e=>setOccForm({...occForm,severity:e.target.value})}><option value="baixa">baixa</option><option value="media">media</option><option value="alta">alta</option><option value="critica">critica</option></select>
          <input className="border p-1" placeholder="título min5" value={occForm.title} onChange={e=>setOccForm({...occForm,title:e.target.value})} />
          <input className="border p-1" placeholder="descrição min10" value={occForm.description} onChange={e=>setOccForm({...occForm,description:e.target.value})} />
          <input className="border p-1" placeholder="local" value={occForm.location} onChange={e=>setOccForm({...occForm,location:e.target.value})} />
          <input className="border p-1" type="datetime-local" value={occForm.occurred_at} onChange={e=>setOccForm({...occForm,occurred_at:e.target.value})} />
          <input className="border p-1" placeholder="reported_by_name" value={occForm.reported_by_name} onChange={e=>setOccForm({...occForm,reported_by_name:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createOcc}>Registrar ocorrência</button>
        <div className="space-y-1 text-sm max-h-60 overflow-auto">
          {occurrences.slice(0,20).map(o=>(
            <div key={o.id} className="border p-1 flex justify-between">
              <span>{o.protocol} {o.category}/{o.severity} {o.title} {o.status} {o.is_personal_data_restricted?'[restrito]':''} {o.location} {o.occurred_at.slice(0,16)}</span>
              <span className="space-x-1">
                <button className="bg-blue-500 text-white px-1 rounded" onClick={()=>{ setOccAttachForm({...occAttachForm,occurrence_id:o.id}); setOccActionForm({...occActionForm,occurrence_id:o.id}); loadOccDetails(o.id); }}>detalhes</button>
                <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchOcc(o.id,'resolvido')}>resolver</button>
                <button className="bg-gray-600 text-white px-1 rounded" onClick={()=>patchOcc(o.id,'encerrado')}>encerrar</button>
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <input className="border p-1" placeholder="occurrence_id anexo" value={occAttachForm.occurrence_id} onChange={e=>setOccAttachForm({...occAttachForm,occurrence_id:e.target.value})} />
          <input className="border p-1" placeholder="file_name" value={occAttachForm.file_name} onChange={e=>setOccAttachForm({...occAttachForm,file_name:e.target.value})} />
          <input className="border p-1" placeholder="file_url" value={occAttachForm.file_url} onChange={e=>setOccAttachForm({...occAttachForm,file_url:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createOccAttach}>Anexar pertinente (restrição pessoal)</button>
        <div className="text-sm">Anexos ocorrência {selectedOcc}: {occAttaches.map(a=>`${a.file_name}${a.is_personal_data_restricted?'[restrito]':''}`).join(' | ')}</div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <input className="border p-1" placeholder="occurrence_id ação" value={occActionForm.occurrence_id} onChange={e=>setOccActionForm({...occActionForm,occurrence_id:e.target.value})} />
          <input className="border p-1" placeholder="action_type" value={occActionForm.action_type} onChange={e=>setOccActionForm({...occActionForm,action_type:e.target.value})} />
          <input className="border p-1" placeholder="description min5" value={occActionForm.description} onChange={e=>setOccActionForm({...occActionForm,description:e.target.value})} />
          <input className="border p-1" placeholder="responsável" value={occActionForm.responsible_name} onChange={e=>setOccActionForm({...occActionForm,responsible_name:e.target.value})} />
          <input className="border p-1" type="date" value={occActionForm.due_date} onChange={e=>setOccActionForm({...occActionForm,due_date:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createOccAction}>Criar ação ocorrência</button>
        <div className="space-y-1 text-sm max-h-40 overflow-auto">
          {occActions.map(ac=>(
            <div key={ac.id} className="border p-1 flex justify-between">
              <span>{ac.action_type} {ac.description.slice(0,30)} resp {ac.responsible_name} {ac.status}</span>
              <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchOccAction(ac.id,'concluida')}>concluir</button>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-600">Categoria descrição horário local anexo pertinente, protocol OCC, is_personal_data_restricted true se descrição contém cpf/rg/prontuario/diagnostico ou flag, restrição informações pessoais, anexos is_personal_data_restricted herda ocorrência, ações com responsável prazo, status aberto/em_analise/em_tratamento/resolvido/encerrado, audit occurrence_create</div>
      </div>

      {/* EMP-09 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">EMP-09 procedimentos posto versionados ciência contatos apoio</h3>
        <div className="grid grid-cols-3 gap-2">
          <input className="border p-1" placeholder="post_location" value={procForm.post_location} onChange={e=>setProcForm({...procForm,post_location:e.target.value})} />
          <input className="border p-1" placeholder="título" value={procForm.title} onChange={e=>setProcForm({...procForm,title:e.target.value})} />
          <input className="border p-1" placeholder="category" value={procForm.category} onChange={e=>setProcForm({...procForm,category:e.target.value})} />
          <textarea className="border p-1 col-span-3" placeholder="conteúdo min20" value={procForm.content} onChange={e=>setProcForm({...procForm,content:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createProc}>Criar procedimento versionado</button>
        <div className="space-y-1 text-sm max-h-60 overflow-auto">
          {procedures.slice(0,20).map(p=>(
            <div key={p.id} className="border p-1 flex justify-between">
              <span>{p.post_location} {p.title} v{p.version} {p.status} {p.is_active?'ativo':''} {p.category}</span>
              <span className="space-x-1">
                <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchProc(p.id,'publicado')}>publicar</button>
                <button className="bg-gray-600 text-white px-1 rounded" onClick={()=>patchProc(p.id,'arquivado')}>arquivar</button>
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <input className="border p-1" placeholder="procedure_id" value={ackForm.procedure_id} onChange={e=>setAckForm({...ackForm,procedure_id:e.target.value})} />
          <input className="border p-1" placeholder="employee_id" value={ackForm.employee_id} onChange={e=>setAckForm({...ackForm,employee_id:e.target.value})} />
          <input className="border p-1" placeholder="notes" value={ackForm.notes} onChange={e=>setAckForm({...ackForm,notes:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createAck}>Registrar ciência procedimento</button>
        <div className="text-sm">Ciências: {acks.slice(0,10).map(a=>`${a.procedure_title} v${a.version} por ${a.employee_name||a.employee_id.slice(0,8)} ${a.acknowledged_at.slice(0,16)}`).join(' | ')}</div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <input className="border p-1" placeholder="nome contato apoio" value={contactForm.name} onChange={e=>setContactForm({...contactForm,name:e.target.value})} />
          <input className="border p-1" placeholder="role" value={contactForm.role} onChange={e=>setContactForm({...contactForm,role:e.target.value})} />
          <input className="border p-1" placeholder="phone" value={contactForm.phone} onChange={e=>setContactForm({...contactForm,phone:e.target.value})} />
          <input className="border p-1" placeholder="post_location" value={contactForm.post_location} onChange={e=>setContactForm({...contactForm,post_location:e.target.value})} />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={contactForm.is_emergency} onChange={e=>setContactForm({...contactForm,is_emergency:e.target.checked})} /> emergência?</label>
          <input className="border p-1" placeholder="notes" value={contactForm.notes} onChange={e=>setContactForm({...contactForm,notes:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createContact}>Criar contato apoio</button>
        <div className="space-y-1 text-sm max-h-40 overflow-auto">
          {contacts.map(c=>(
            <div key={c.id} className="border p-1 flex justify-between">
              <span>{c.name} {c.role} {c.phone} {c.post_location} {c.is_emergency?'[EMERGÊNCIA]':''} {c.is_active?'ativo':''}</span>
              <span className="space-x-1"><button className="bg-gray-600 text-white px-1 rounded" onClick={()=>patchContact(c.id,{ is_active:false })}>inativar</button></span>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-600">Procedimentos versionados UNIQUE(title,version) version auto MAX+1, content min20, status rascunho/em_revisao/publicado/arquivado/cancelado, is_active, ciência UNIQUE(procedure,employee) acknowledgments, contatos apoio post_location is_emergency is_active, audit procedure_publish/ack</div>
      </div>
    </div>
  );
}
