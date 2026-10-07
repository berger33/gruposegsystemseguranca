"use client";
import UiEmployeePicker from "@/components/ui/UiEmployeePicker";
import UiRecordPicker from "@/components/ui/UiRecordPicker";
import UiTaskWorkspace from "@/components/ui/UiTaskWorkspace";
import {workspaceResponse} from "@/lib/workspace-response";
import { useEffect, useRef, useState } from "react";

type PayrollSource = { id:string; name:string; type:string; is_authorized:boolean; contact_name?:string; description?:string };
type PayrollImport = { id:string; source_id:string; competence:string; file_name?:string; status:string; total_records:number; source_name?:string };
type PayrollDoc = { id:string; employee_id:string; competence:string; doc_type:string; title:string; file_url:string; status:string; version:number; is_published:boolean; is_correction:boolean; employee_name?:string; source_name?:string };
type EvalCriterion = { id:string; name:string; weight:number; is_active:boolean };
type Evaluation = { id:string; employee_id:string; evaluator_name:string; evaluation_type:string; score?:number; status:string; is_private:boolean; employee_name?:string; client_feedback_original?:string };
type DevPlan = { id:string; employee_id:string; title:string; status:string; employee_name?:string };
type DevAction = { id:string; plan_id:string; title:string; status:string; due_date?:string };
type SupportTicket = { id:string; protocol:string; employee_id:string; category:string; priority:string; title:string; status:string; responsible_name?:string; due_date?:string; is_health_related:boolean; employee_name?:string };
type SupportMessage = { id:string; ticket_id:string; sender_name:string; message:string; is_internal:boolean; is_health_restricted:boolean; created_at:string };
type SupportAttachment = { id:string; ticket_id:string; file_name:string; file_url:string; is_health_restricted:boolean; is_medical:boolean };
type IndicatorDef = { id:string; type:string; name:string; formula:string; source?:string; unit?:string; is_active:boolean };
type IndicatorSnap = { id:string; definition_id:string; period_start:string; period_end:string; competence?:string; value:number; formula_used:string; is_estimate:boolean; definition_name?:string; definition_type?:string; unit?:string };

export default function HrAdvancedClient(){
 const [workspaceLoading,setWorkspaceLoading]=useState(false);
 const operation=useRef(false);const [operationBusy,setOperationBusy]=useState(false);
 const [msg,setMsg]=useState("");
  const [sources,setSources]=useState<PayrollSource[]>([]);
  const [imports,setImports]=useState<PayrollImport[]>([]);
  const [docs,setDocs]=useState<PayrollDoc[]>([]);
  const [criteria,setCriteria]=useState<EvalCriterion[]>([]);
  const [evals,setEvals]=useState<Evaluation[]>([]);
  const [plans,setPlans]=useState<DevPlan[]>([]);
  const [actions,setActions]=useState<DevAction[]>([]);
  const [tickets,setTickets]=useState<SupportTicket[]>([]);
  const [messages,setMessages]=useState<SupportMessage[]>([]);
  const [attachments,setAttachments]=useState<SupportAttachment[]>([]);
  const [indicators,setIndicators]=useState<IndicatorDef[]>([]);
  const [snapshots,setSnapshots]=useState<IndicatorSnap[]>([]);

  const [sourceForm,setSourceForm]=useState({ name:'', type:'folha', contact_name:'', description:'' });
  const [importForm,setImportForm]=useState({ source_id:'', competence:'', file_name:'', total_records:0 });
  const [docForm,setDocForm]=useState({ employee_id:'', source_id:'', competence:'', doc_type:'holerite', title:'', file_url:'', is_correction:false, correction_of_id:'', correction_reason:'' });
  const [criterionForm,setCriterionForm]=useState({ name:'', weight:10, description:'' });
  const [evalForm,setEvalForm]=useState({ employee_id:'', evaluator_name:'', evaluation_type:'desempenho', score:70, feedback:'', client_feedback_original:'', client_feedback_treated:'', criteria_details:'' });
  const [planForm,setPlanForm]=useState({ employee_id:'', evaluation_id:'', title:'', goal:'', start_date:'', end_date:'', responsible_name:'' });
  const [actionForm,setActionForm]=useState({ plan_id:'', title:'', due_date:'', responsible_name:'', description:'' });
  const [ticketForm,setTicketForm]=useState({ employee_id:'', category:'rh', priority:'media', title:'', description:'', responsible_name:'', due_date:'', is_health_related:false });
  const [messageForm,setMessageForm]=useState({ ticket_id:'', sender_name:'RH', message:'', is_internal:false, is_health_restricted:false });
  const [attachForm,setAttachForm]=useState({ ticket_id:'', message_id:'', file_name:'', file_url:'', is_health_restricted:false, is_medical:false });
  const [indicatorForm,setIndicatorForm]=useState({ type:'quadro', name:'', formula:'', description:'', source:'', unit:'' });
  const [snapshotForm,setSnapshotForm]=useState({ definition_id:'', period_start:'', period_end:'', competence:'', value:0, formula_used:'', source:'', is_estimate:false, notes:'' });

  const [selectedTicket,setSelectedTicket]=useState<string>('');

  async function api(path:string, opts?:any){
    const res=await fetch(path, { ...opts, headers:{ 'Content-Type':'application/json', ...(opts?.headers||{}) } });
    const j=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(j.error||`HTTP ${res.status}`);
    return j;
  }

  async function loadAll(){
setWorkspaceLoading(true);
try {
    try{
      const [s,imp,d,c,ev,pl,ac,t,ind,snap]=await Promise.all([
        api('/api/admin/hr/payroll-sources'),
        api('/api/admin/hr/payroll-imports'),
        api('/api/admin/hr/payroll-documents'),
        api('/api/admin/hr/evaluation-criteria'),
        api('/api/admin/hr/evaluations'),
        api('/api/admin/hr/development-plans'),
        api('/api/admin/hr/development-actions'),
        api('/api/admin/hr/support-tickets'),
        api('/api/admin/hr/indicator-definitions'),
        api('/api/admin/hr/indicator-snapshots'),
      ]);
      setSources(s.sources||[]); setImports(imp.imports||[]); setDocs(d.documents||[]); setCriteria(c.criteria||[]); setEvals(ev.evaluations||[]); setPlans(pl.plans||[]); setActions(ac.actions||[]); setTickets(t.tickets||[]); setIndicators(ind.definitions||[]); setSnapshots(snap.snapshots||[]);
    }catch(e){ setMsg(e instanceof Error ? e.message : 'Não foi possível carregar os processos.'); }
  } catch(error) {setMsg(error instanceof Error ? error.message : 'Não foi possível carregar esta área. Atualize para tentar novamente.');} finally {setWorkspaceLoading(false);}
}
  useEffect(()=>{ loadAll(); },[]);

  async function loadMessages(ticket_id:string){
setWorkspaceLoading(true);
try {
    if(!ticket_id) return;
    try{
      const [m,a]=await Promise.all([
        api(`/api/admin/hr/support-messages?ticket_id=${ticket_id}`),
        api(`/api/admin/hr/support-attachments?ticket_id=${ticket_id}`),
      ]);
      setMessages(m.messages||[]); setAttachments(a.attachments||[]);
      setSelectedTicket(ticket_id);
    }catch(e){ console.error(e); }
  } catch(error) {setMsg(error instanceof Error ? error.message : 'Não foi possível carregar esta área. Atualize para tentar novamente.');} finally {setWorkspaceLoading(false);}
}

  // HR-21
  async function createSource(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    try{ await api('/api/admin/hr/payroll-sources',{ method:'POST', body:JSON.stringify(sourceForm) }); setSourceForm({ name:'', type:'folha', contact_name:'', description:'' }); loadAll(); }catch(e:any){ setMsg(e.message); }
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createImport(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    try{ await api('/api/admin/hr/payroll-imports',{ method:'POST', body:JSON.stringify(importForm) }); setImportForm({ source_id:'', competence:'', file_name:'', total_records:0 }); loadAll(); }catch(e:any){ setMsg(e.message); }
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createDoc(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    try{ await api('/api/admin/hr/payroll-documents',{ method:'POST', body:JSON.stringify({ ...docForm, is_correction:docForm.is_correction===true }) }); setDocForm({ employee_id:'', source_id:'', competence:'', doc_type:'holerite', title:'', file_url:'', is_correction:false, correction_of_id:'', correction_reason:'' }); loadAll(); }catch(e:any){ setMsg(e.message); }
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchDoc(id:string, patch:any){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    try{ await api('/api/admin/hr/payroll-documents',{ method:'PATCH', body:JSON.stringify({ id, ...patch }) }); loadAll(); }catch(e:any){ setMsg(e.message); }
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}

  // HR-22
  async function createCriterion(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    try{ await api('/api/admin/hr/evaluation-criteria',{ method:'POST', body:JSON.stringify(criterionForm) }); setCriterionForm({ name:'', weight:10, description:'' }); loadAll(); }catch(e:any){ setMsg(e.message); }
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createEval(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    try{ await api('/api/admin/hr/evaluations',{ method:'POST', body:JSON.stringify(evalForm) }); setEvalForm({ employee_id:'', evaluator_name:'', evaluation_type:'desempenho', score:70, feedback:'', client_feedback_original:'', client_feedback_treated:'', criteria_details:'' }); loadAll(); }catch(e:any){ setMsg(e.message); }
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchEval(id:string, patch:any){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    try{ await api('/api/admin/hr/evaluations',{ method:'PATCH', body:JSON.stringify({ id, ...patch }) }); loadAll(); }catch(e:any){ setMsg(e.message); }
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createPlan(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    try{ await api('/api/admin/hr/development-plans',{ method:'POST', body:JSON.stringify(planForm) }); setPlanForm({ employee_id:'', evaluation_id:'', title:'', goal:'', start_date:'', end_date:'', responsible_name:'' }); loadAll(); }catch(e:any){ setMsg(e.message); }
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchPlan(id:string, status:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    try{ await api('/api/admin/hr/development-plans',{ method:'PATCH', body:JSON.stringify({ id, status }) }); loadAll(); }catch(e:any){ setMsg(e.message); }
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createAction(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    try{ await api('/api/admin/hr/development-actions',{ method:'POST', body:JSON.stringify(actionForm) }); setActionForm({ plan_id:'', title:'', due_date:'', responsible_name:'', description:'' }); loadAll(); }catch(e:any){ setMsg(e.message); }
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchAction(id:string, status:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    try{ await api('/api/admin/hr/development-actions',{ method:'PATCH', body:JSON.stringify({ id, status }) }); loadAll(); }catch(e:any){ setMsg(e.message); }
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}

  // HR-23
  async function createTicket(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    try{ await api('/api/admin/hr/support-tickets',{ method:'POST', body:JSON.stringify(ticketForm) }); setTicketForm({ employee_id:'', category:'rh', priority:'media', title:'', description:'', responsible_name:'', due_date:'', is_health_related:false }); loadAll(); }catch(e:any){ setMsg(e.message); }
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchTicket(id:string, status:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    try{ await api('/api/admin/hr/support-tickets',{ method:'PATCH', body:JSON.stringify({ id, status }) }); loadAll(); }catch(e:any){ setMsg(e.message); }
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createMessage(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    try{ await api('/api/admin/hr/support-messages',{ method:'POST', body:JSON.stringify(messageForm) }); setMessageForm({ ticket_id:messageForm.ticket_id, sender_name:'RH', message:'', is_internal:false, is_health_restricted:false }); if(messageForm.ticket_id) loadMessages(messageForm.ticket_id); }catch(e:any){ setMsg(e.message); }
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createAttachment(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    try{ await api('/api/admin/hr/support-attachments',{ method:'POST', body:JSON.stringify(attachForm) }); setAttachForm({ ticket_id:attachForm.ticket_id, message_id:'', file_name:'', file_url:'', is_health_restricted:false, is_medical:false }); if(attachForm.ticket_id) loadMessages(attachForm.ticket_id); }catch(e:any){ setMsg(e.message); }
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}

  // HR-24
  async function createIndicator(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    try{ await api('/api/admin/hr/indicator-definitions',{ method:'POST', body:JSON.stringify(indicatorForm) }); setIndicatorForm({ type:'quadro', name:'', formula:'', description:'', source:'', unit:'' }); loadAll(); }catch(e:any){ setMsg(e.message); }
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createSnapshot(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    try{ await api('/api/admin/hr/indicator-snapshots',{ method:'POST', body:JSON.stringify(snapshotForm) }); setSnapshotForm({ definition_id:'', period_start:'', period_end:'', competence:'', value:0, formula_used:'', source:'', is_estimate:false, notes:'' }); loadAll(); }catch(e:any){ setMsg(e.message); }
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}

  return (
    <UiTaskWorkspace className="space-y-8 border-t pt-8 mt-8">
<fieldset disabled={operationBusy} aria-label="Processos desta área" style={{border:0,padding:0,margin:0,minWidth:0}}>
{operationBusy&&<p role="status">Salvando alteração…</p>}
{workspaceLoading && <p role="status">Carregando informações desta área…</p>}
{msg && <p role="alert">{msg}</p>}
      <h2 className="text-xl font-bold">HR-21..24 holerites avaliações atendimento indicadores (lote 29)</h2>

      {/* HR-21 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">HR-21 holerites/informes fonte autorizada vinculação inequívoca revisão correção rastreada</h3>
        <div className="grid grid-cols-4 gap-2">
          <label>Fonte nome <input className="border p-1" placeholder="Fonte nome" value={sourceForm.name} onChange={e=>setSourceForm({...sourceForm,name:e.target.value})} /></label>
          <label>Tipo<select className="border p-1" value={sourceForm.type} onChange={e=>setSourceForm({...sourceForm,type:e.target.value})}><option value="folha">folha</option><option value="contabilidade">contabilidade</option><option value="fiscal">fiscal</option><option value="banco">banco</option><option value="rh">rh</option><option value="outro">outro</option></select></label>
          <label>Contato <input className="border p-1" placeholder="Contato" value={sourceForm.contact_name} onChange={e=>setSourceForm({...sourceForm,contact_name:e.target.value})} /></label>
          <label>Descrição <input className="border p-1" placeholder="Descrição" value={sourceForm.description} onChange={e=>setSourceForm({...sourceForm,description:e.target.value})} /></label>
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createSource}>Criar fonte autorizada</button>
        <div className="text-sm">Fontes: {sources.map(s=>`${s.name}(${s.type})${s.is_authorized?'✔':''}`).join(', ')}</div>

        <div className="grid grid-cols-4 gap-2 pt-2 border-t">
          <label>source_id <UiRecordPicker items={sources} className="border p-1" placeholder="source_id" value={importForm.source_id} onChange={e=>setImportForm({...importForm,source_id:e.target.value})} /></label>
          <label>competência YYYY-MM <input className="border p-1" placeholder="competência YYYY-MM" value={importForm.competence} onChange={e=>setImportForm({...importForm,competence:e.target.value})} /></label>
          <label>file_name <input className="border p-1" placeholder="file_name" value={importForm.file_name} onChange={e=>setImportForm({...importForm,file_name:e.target.value})} /></label>
          <label>total <input className="border p-1" type="number" placeholder="total" value={importForm.total_records} onChange={e=>setImportForm({...importForm,total_records:Number(e.target.value)})} /></label>
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createImport}>Criar importação</button>
        <div className="text-sm">Imports: {imports.slice(0,5).map(i=>`${i.competence} ${i.source_name} ${i.status}`).join(' | ')}</div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <label>employee_id <UiEmployeePicker className="border p-1" placeholder="employee_id" value={docForm.employee_id} onChange={e=>setDocForm({...docForm,employee_id:e.target.value})} /></label>
          <label>source_id <UiRecordPicker items={sources} className="border p-1" placeholder="source_id" value={docForm.source_id} onChange={e=>setDocForm({...docForm,source_id:e.target.value})} /></label>
          <label>competência YYYY-MM <input className="border p-1" placeholder="competência YYYY-MM" value={docForm.competence} onChange={e=>setDocForm({...docForm,competence:e.target.value})} /></label>
          <label>Doc type<select className="border p-1" value={docForm.doc_type} onChange={e=>setDocForm({...docForm,doc_type:e.target.value})}><option value="holerite">holerite</option><option value="informe_rendimentos">informe_rendimentos</option><option value="informe_contribuicao">informe_contribuicao</option><option value="comprovante_pagamento">comprovante_pagamento</option><option value="recibo_ferias">recibo_ferias</option><option value="informe_13">informe_13</option><option value="outro">outro</option></select></label>
          <label>título <input className="border p-1" placeholder="título" value={docForm.title} onChange={e=>setDocForm({...docForm,title:e.target.value})} /></label>
          <label>file_url <input className="border p-1" placeholder="file_url" value={docForm.file_url} onChange={e=>setDocForm({...docForm,file_url:e.target.value})} /></label>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={docForm.is_correction} onChange={e=>setDocForm({...docForm,is_correction:e.target.checked})} /> correção?</label>
          <label>correction_of_id <input className="border p-1" placeholder="correction_of_id" value={docForm.correction_of_id} onChange={e=>setDocForm({...docForm,correction_of_id:e.target.value})} /></label>
          <label>correction_reason <input className="border p-1" placeholder="correction_reason min10" value={docForm.correction_reason} onChange={e=>setDocForm({...docForm,correction_reason:e.target.value})} /></label>
        </div>
        <button className="bg-green-600 text-white px-3 py-1 rounded" onClick={createDoc}>Criar holerite (vinculação inequívoca colaborador)</button>
        <div className="space-y-1 text-sm max-h-60 overflow-auto">
          {docs.slice(0,20).map(d=>(
            <div key={d.id} className="border p-1 flex justify-between">
              <span>{d.competence} {d.doc_type} {d.title} v{d.version} {d.employee_name||d.employee_id.slice(0,8)} {d.status} {d.is_published?'publicado':''} {d.is_correction?'correção':''}</span>
              <span className="space-x-1">
                <button className="bg-yellow-500 text-white px-1 rounded" onClick={()=>patchDoc(d.id,{ status:'em_revisao' })}>em revisão</button>
                <button className="bg-blue-500 text-white px-1 rounded" onClick={()=>patchDoc(d.id,{ status:'aprovado' })}>aprovar</button>
                <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchDoc(d.id,{ status:'publicado' })}>publicar (revisão antes)</button>
                <button className="bg-red-600 text-white px-1 rounded" onClick={()=>patchDoc(d.id,{ status:'rejeitado', rejection_reason:'Documento ilegível ou divergente' })}>rejeitar</button>
              </span>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-600">Fonte autorizada is_authorized true, employee_id obrigatório, revisão antes publicar (rascunho não pode publicar direto), correção rastreada correction_of_id + correction_reason min10 + is_correction flag + UNIQUE(employee,doc_type,competence,version) version auto, is_restricted true privado, audit doc_publish/doc_correct</div>
      </div>

      {/* HR-22 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">HR-22 avaliações planos desenvolvimento critérios definidos acesso privado participação humana feedback cliente não punição automática</h3>
        <div className="grid grid-cols-4 gap-2">
          <label>Critério nome <input className="border p-1" placeholder="Critério nome" value={criterionForm.name} onChange={e=>setCriterionForm({...criterionForm,name:e.target.value})} /></label>
          <label>peso <input className="border p-1" type="number" placeholder="peso" value={criterionForm.weight} onChange={e=>setCriterionForm({...criterionForm,weight:Number(e.target.value)})} /></label>
          <label>descrição <input className="border p-1" placeholder="descrição" value={criterionForm.description} onChange={e=>setCriterionForm({...criterionForm,description:e.target.value})} /></label>
          <button className="bg-blue-600 text-white px-2 rounded" onClick={createCriterion}>Criar critério</button>
        </div>
        <div className="text-sm">Critérios: {criteria.map(c=>`${c.name}(${c.weight})`).join(', ')}</div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <label>employee_id <UiEmployeePicker className="border p-1" placeholder="employee_id" value={evalForm.employee_id} onChange={e=>setEvalForm({...evalForm,employee_id:e.target.value})} /></label>
          <label>avaliador nome <input className="border p-1" placeholder="avaliador nome" value={evalForm.evaluator_name} onChange={e=>setEvalForm({...evalForm,evaluator_name:e.target.value})} /></label>
          <label>Evaluation type<select className="border p-1" value={evalForm.evaluation_type} onChange={e=>setEvalForm({...evalForm,evaluation_type:e.target.value})}><option value="desempenho">desempenho</option><option value="experiencia">experiencia</option><option value="comportamental">comportamental</option><option value="tecnica">tecnica</option><option value="cliente_feedback">cliente_feedback</option><option value="periodica">periodica</option><option value="outro">outro</option></select></label>
          <label>score 0..100 <input className="border p-1" type="number" placeholder="score 0..100" value={evalForm.score} onChange={e=>setEvalForm({...evalForm,score:Number(e.target.value)})} /></label>
          <label>feedback <input className="border p-1" placeholder="feedback min10" value={evalForm.feedback} onChange={e=>setEvalForm({...evalForm,feedback:e.target.value})} /></label>
          <label>feedback cliente original <input className="border p-1" placeholder="feedback cliente original" value={evalForm.client_feedback_original} onChange={e=>setEvalForm({...evalForm,client_feedback_original:e.target.value})} /></label>
          <label>feedback cliente tratado <input className="border p-1" placeholder="feedback cliente tratado" value={evalForm.client_feedback_treated} onChange={e=>setEvalForm({...evalForm,client_feedback_treated:e.target.value})} /></label>
          <label>criteria_details <input className="border p-1" placeholder="criteria_details" value={evalForm.criteria_details} onChange={e=>setEvalForm({...evalForm,criteria_details:e.target.value})} /></label>
        </div>
        <button className="bg-green-600 text-white px-3 py-1 rounded" onClick={createEval}>Criar avaliação (participação humana obrigatória)</button>
        <div className="space-y-1 text-sm max-h-40 overflow-auto">
          {evals.slice(0,20).map(ev=>(
            <div key={ev.id} className="border p-1 flex justify-between">
              <span>{ev.employee_name||ev.employee_id.slice(0,8)} {ev.evaluation_type} score {ev.score} {ev.status} {ev.is_private?'privado':''}</span>
              <span className="space-x-1">
                <button className="bg-blue-500 text-white px-1 rounded" onClick={()=>patchEval(ev.id,{ status:'em_avaliacao' })}>em avaliação</button>
                <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchEval(ev.id,{ status:'concluida' })}>concluir</button>
                <button className="bg-purple-600 text-white px-1 rounded" onClick={()=>patchEval(ev.id,{ status:'aprovada' })}>aprovar</button>
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <label>employee_id plano <UiEmployeePicker className="border p-1" placeholder="employee_id plano" value={planForm.employee_id} onChange={e=>setPlanForm({...planForm,employee_id:e.target.value})} /></label>
          <label>evaluation_id opcional <UiRecordPicker items={evals} className="border p-1" placeholder="evaluation_id opcional" value={planForm.evaluation_id} onChange={e=>setPlanForm({...planForm,evaluation_id:e.target.value})} /></label>
          <label>título plano <input className="border p-1" placeholder="título plano" value={planForm.title} onChange={e=>setPlanForm({...planForm,title:e.target.value})} /></label>
          <label>goal <input className="border p-1" placeholder="goal" value={planForm.goal} onChange={e=>setPlanForm({...planForm,goal:e.target.value})} /></label>
          <label>start_date <input className="border p-1" placeholder="start_date" type="date" value={planForm.start_date} onChange={e=>setPlanForm({...planForm,start_date:e.target.value})} /></label>
          <label>end_date <input className="border p-1" placeholder="end_date" type="date" value={planForm.end_date} onChange={e=>setPlanForm({...planForm,end_date:e.target.value})} /></label>
          <label>responsável <input className="border p-1" placeholder="responsável" value={planForm.responsible_name} onChange={e=>setPlanForm({...planForm,responsible_name:e.target.value})} /></label>
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createPlan}>Criar plano desenvolvimento</button>
        <div className="text-sm">Planos: {plans.slice(0,5).map(p=>`${p.title} ${p.status}`).join(' | ')}</div>
        <div className="flex gap-1">
          {plans.slice(0,5).map(p=>(
            <span key={p.id} className="space-x-1 border p-1 text-xs">
              {p.title} <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchPlan(p.id,'em_andamento')}>em andamento</button><button className="bg-purple-600 text-white px-1 rounded" onClick={()=>patchPlan(p.id,'concluido')}>concluir</button>
            </span>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <label>plan_id <UiRecordPicker items={plans} className="border p-1" placeholder="plan_id" value={actionForm.plan_id} onChange={e=>setActionForm({...actionForm,plan_id:e.target.value})} /></label>
          <label>título ação <input className="border p-1" placeholder="título ação" value={actionForm.title} onChange={e=>setActionForm({...actionForm,title:e.target.value})} /></label>
          <label>due_date <input className="border p-1" placeholder="due_date" type="date" value={actionForm.due_date} onChange={e=>setActionForm({...actionForm,due_date:e.target.value})} /></label>
          <label>responsável <input className="border p-1" placeholder="responsável" value={actionForm.responsible_name} onChange={e=>setActionForm({...actionForm,responsible_name:e.target.value})} /></label>
          <label>descrição <input className="border p-1" placeholder="descrição" value={actionForm.description} onChange={e=>setActionForm({...actionForm,description:e.target.value})} /></label>
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createAction}>Criar ação plano</button>
        <div className="space-y-1 text-sm max-h-40 overflow-auto">
          {actions.slice(0,20).map(a=>(
            <div key={a.id} className="border p-1 flex justify-between">
              <span>{a.title} venc {a.due_date} {a.status}</span>
              <span className="space-x-1"><button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchAction(a.id,'concluido')}>concluir</button></span>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-600">is_human_participation true CHECK, is_auto_punishment false CHECK bloqueia feedback cliente virar punição automática, is_private true acesso privado, critérios definidos weight, avaliação concluída audit, plano desenvolvimento vinculado avaliação opcional, ações com prazo responsável</div>
      </div>

      {/* HR-23 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">HR-23 atendimento interno fila responsável categoria prazo mensagens anexos saúde fora tickets genéricos</h3>
        <div className="grid grid-cols-3 gap-2">
          <label>employee_id <UiEmployeePicker className="border p-1" placeholder="employee_id" value={ticketForm.employee_id} onChange={e=>setTicketForm({...ticketForm,employee_id:e.target.value})} /></label>
          <label>Category<select className="border p-1" value={ticketForm.category} onChange={e=>setTicketForm({...ticketForm,category:e.target.value})}><option value="folha">folha</option><option value="ponto">ponto</option><option value="beneficios">beneficios</option><option value="ferias">ferias</option><option value="afastamento">afastamento</option><option value="documentos">documentos</option><option value="uniforme">uniforme</option><option value="treinamento">treinamento</option><option value="saude">saude</option><option value="ti">ti</option><option value="operacional">operacional</option><option value="rh">rh</option><option value="outro">outro</option></select></label>
          <label>Prioridade<select className="border p-1" value={ticketForm.priority} onChange={e=>setTicketForm({...ticketForm,priority:e.target.value})}><option value="baixa">baixa</option><option value="media">media</option><option value="alta">alta</option><option value="critica">critica</option></select></label>
          <label>título <input className="border p-1" placeholder="título min5" value={ticketForm.title} onChange={e=>setTicketForm({...ticketForm,title:e.target.value})} /></label>
          <label>descrição <input className="border p-1" placeholder="descrição min10" value={ticketForm.description} onChange={e=>setTicketForm({...ticketForm,description:e.target.value})} /></label>
          <label>responsável nome <input className="border p-1" placeholder="responsável nome" value={ticketForm.responsible_name} onChange={e=>setTicketForm({...ticketForm,responsible_name:e.target.value})} /></label>
          <label>due_date <input className="border p-1" placeholder="due_date" type="date" value={ticketForm.due_date} onChange={e=>setTicketForm({...ticketForm,due_date:e.target.value})} /></label>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={ticketForm.is_health_related} onChange={e=>setTicketForm({...ticketForm,is_health_related:e.target.checked})} /> saúde relacionado?</label>
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createTicket}>Criar ticket fila</button>
        <div className="space-y-1 text-sm max-h-60 overflow-auto">
          {tickets.slice(0,20).map(t=>(
            <div key={t.id} className="border p-1 flex justify-between">
              <span>{t.protocol} {t.category} {t.priority} {t.title} {t.status} resp {t.responsible_name} {t.is_health_related?'saúde':''}</span>
              <span className="space-x-1">
                <button className="bg-blue-500 text-white px-1 rounded" onClick={()=>{ setMessageForm({...messageForm,ticket_id:t.id}); setAttachForm({...attachForm,ticket_id:t.id}); loadMessages(t.id); }}>ver msgs</button>
                <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchTicket(t.id,'em_atendimento')}>em atendimento</button>
                <button className="bg-purple-600 text-white px-1 rounded" onClick={()=>patchTicket(t.id,'resolvido')}>resolver</button>
                <button className="bg-gray-600 text-white px-1 rounded" onClick={()=>patchTicket(t.id,'encerrado')}>encerrar</button>
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <label>ticket_id msg <UiRecordPicker items={tickets} className="border p-1" placeholder="ticket_id msg" value={messageForm.ticket_id} onChange={e=>setMessageForm({...messageForm,ticket_id:e.target.value})} /></label>
          <label>sender_name <input className="border p-1" placeholder="sender_name" value={messageForm.sender_name} onChange={e=>setMessageForm({...messageForm,sender_name:e.target.value})} /></label>
          <label>mensagem <input className="border p-1" placeholder="mensagem" value={messageForm.message} onChange={e=>setMessageForm({...messageForm,message:e.target.value})} /></label>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={messageForm.is_internal} onChange={e=>setMessageForm({...messageForm,is_internal:e.target.checked})} /> interna?</label>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={messageForm.is_health_restricted} onChange={e=>setMessageForm({...messageForm,is_health_restricted:e.target.checked})} /> saúde restrito?</label>
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createMessage}>Enviar mensagem</button>
        <div className="text-sm">Mensagens ticket {selectedTicket}: {messages.slice(0,10).map(m=>`${m.sender_name}:${m.message.slice(0,30)}${m.is_health_restricted?'[saúde]':''}`).join(' | ')}</div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <label>ticket_id anexo <UiRecordPicker items={tickets} className="border p-1" placeholder="ticket_id anexo" value={attachForm.ticket_id} onChange={e=>setAttachForm({...attachForm,ticket_id:e.target.value})} /></label>
          <label>file_name <input className="border p-1" placeholder="file_name" value={attachForm.file_name} onChange={e=>setAttachForm({...attachForm,file_name:e.target.value})} /></label>
          <label>file_url <input className="border p-1" placeholder="file_url" value={attachForm.file_url} onChange={e=>setAttachForm({...attachForm,file_url:e.target.value})} /></label>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={attachForm.is_health_restricted} onChange={e=>setAttachForm({...attachForm,is_health_restricted:e.target.checked})} /> saúde restrito?</label>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={attachForm.is_medical} onChange={e=>setAttachForm({...attachForm,is_medical:e.target.checked})} /> médico?</label>
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createAttachment}>Anexar arquivo (saúde fora genérico)</button>
        <div className="text-sm">Anexos: {attachments.slice(0,10).map(a=>`${a.file_name}${a.is_health_restricted?'[saúde restrito]':''}${a.is_medical?'[médico]':''}`).join(' | ')}</div>
        <div className="text-xs text-gray-600">Fila protocolo único, responsável categoria prazo due_date, mensagens privadas is_internal, anexos saúde só em ticket saúde is_health_related true, is_medical true exige is_health_restricted true, saúde fora tickets genéricos bloqueado 400 health_attachment_only_in_health_tickets e medical_attachment_must_be_health_restricted</div>
      </div>

      {/* HR-24 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">HR-24 indicadores quadro admissão faltas rotatividade férias documentos atendimento fórmula período explícitos</h3>
        <div className="grid grid-cols-3 gap-2">
          <label>Tipo<select className="border p-1" value={indicatorForm.type} onChange={e=>setIndicatorForm({...indicatorForm,type:e.target.value})}><option value="quadro">quadro</option><option value="admissao">admissao</option><option value="faltas">faltas</option><option value="rotatividade">rotatividade</option><option value="ferias">ferias</option><option value="documentos">documentos</option><option value="atendimento">atendimento</option><option value="cobertura">cobertura</option><option value="horas_extras">horas_extras</option><option value="absenteismo">absenteismo</option><option value="outro">outro</option></select></label>
          <label>nome indicador <input className="border p-1" placeholder="nome indicador" value={indicatorForm.name} onChange={e=>setIndicatorForm({...indicatorForm,name:e.target.value})} /></label>
          <label>fórmula <input className="border p-1" placeholder="fórmula min10" value={indicatorForm.formula} onChange={e=>setIndicatorForm({...indicatorForm,formula:e.target.value})} /></label>
          <label>descrição <input className="border p-1" placeholder="descrição" value={indicatorForm.description} onChange={e=>setIndicatorForm({...indicatorForm,description:e.target.value})} /></label>
          <label>fonte <input className="border p-1" placeholder="fonte" value={indicatorForm.source} onChange={e=>setIndicatorForm({...indicatorForm,source:e.target.value})} /></label>
          <label>unidade % <input className="border p-1" placeholder="unidade %" value={indicatorForm.unit} onChange={e=>setIndicatorForm({...indicatorForm,unit:e.target.value})} /></label>
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createIndicator}>Criar definição indicador fórmula explícita</button>
        <div className="text-sm">Definições: {indicators.map(i=>`${i.type}:${i.name} fórmula:${i.formula.slice(0,30)}`).join(' | ')}</div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <label>definition_id <UiRecordPicker items={indicators} className="border p-1" placeholder="definition_id" value={snapshotForm.definition_id} onChange={e=>setSnapshotForm({...snapshotForm,definition_id:e.target.value})} /></label>
          <label>period_start <input className="border p-1" placeholder="period_start" type="date" value={snapshotForm.period_start} onChange={e=>setSnapshotForm({...snapshotForm,period_start:e.target.value})} /></label>
          <label>period_end <input className="border p-1" placeholder="period_end" type="date" value={snapshotForm.period_end} onChange={e=>setSnapshotForm({...snapshotForm,period_end:e.target.value})} /></label>
          <label>competência YYYY-MM <input className="border p-1" placeholder="competência YYYY-MM" value={snapshotForm.competence} onChange={e=>setSnapshotForm({...snapshotForm,competence:e.target.value})} /></label>
          <label>valor <input className="border p-1" type="number" placeholder="valor" value={snapshotForm.value} onChange={e=>setSnapshotForm({...snapshotForm,value:Number(e.target.value)})} /></label>
          <label>formula_used <input className="border p-1" placeholder="formula_used min10" value={snapshotForm.formula_used} onChange={e=>setSnapshotForm({...snapshotForm,formula_used:e.target.value})} /></label>
          <label>fonte <input className="border p-1" placeholder="fonte" value={snapshotForm.source} onChange={e=>setSnapshotForm({...snapshotForm,source:e.target.value})} /></label>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={snapshotForm.is_estimate} onChange={e=>setSnapshotForm({...snapshotForm,is_estimate:e.target.checked})} /> estimativa?</label>
          <label>notes <input className="border p-1" placeholder="notes" value={snapshotForm.notes} onChange={e=>setSnapshotForm({...snapshotForm,notes:e.target.value})} /></label>
        </div>
        <button className="bg-green-600 text-white px-3 py-1 rounded" onClick={createSnapshot}>Criar snapshot período explícito</button>
        <div className="space-y-1 text-sm max-h-60 overflow-auto">
          {snapshots.slice(0,20).map(s=>(
            <div key={s.id} className="border p-1">{s.competence||`${s.period_start}→${s.period_end}`} {s.definition_name||s.definition_id.slice(0,8)} valor {s.value}{s.unit} fórmula {s.formula_used.slice(0,40)} {s.is_estimate?'ESTIMATIVA':''}</div>
          ))}
        </div>
        <div className="text-xs text-gray-600">Definição tipo quadro/admissão/faltas/rotatividade/férias/documentos/atendimento fórmula 10..2000 explícita fonte unidade, snapshot period_start/end CHECK end≥start competence YYYY-MM UNIQUE(definition_id,competence) value formula_used min10 source is_estimate bool notes período explícito audit snapshot_create</div>
      </div>
    </fieldset></UiTaskWorkspace>
  );
}
