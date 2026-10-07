"use client";
import UiEmployeePicker from "@/components/ui/UiEmployeePicker";
import UiTaskWorkspace from "@/components/ui/UiTaskWorkspace";
import {workspaceResponse} from "@/lib/workspace-response";
import { useEffect, useRef, useState } from "react";

type TrainingCatalog={ id:string; name:string; type:string; cargo_aplicavel?:string; atividade?:string; carga_horaria?:number; validity_days?:number; is_required:boolean; provider_name?:string; version:number; approval_status:string; };
type TrainingReq={ id:string; cargo:string; training_id:string; training_name?:string; is_required:boolean; validity_days?:number; };
type TrainingSession={ id:string; training_id:string; training_name?:string; title:string; scheduled_date:string; scheduled_time?:string; location?:string; instructor_name?:string; vagas?:number; status:string; };
type TrainingEnroll={ id:string; employee_id:string; employee_name?:string; training_id:string; training_name?:string; session_id?:string; session_title?:string; status:string; presence_percent?:string; score?:string; certificate_url?:string; completion_date?:string; };
type CompetencyCatalog={ id:string; name:string; type:string; level:string; validity_days?:number; version:number; approval_status:string; };
type CompetencyReq={ id:string; cargo:string; competency_id:string; competency_name?:string; required_level:string; is_required:boolean; };
type EmployeeComp={ id:string; employee_id:string; employee_name?:string; competency_id:string; competency_name?:string; level:string; acquired_date:string; expiry_date?:string; status:string; proof_url?:string; evaluated_by_name?:string; };
type CompetencyEval={ id:string; employee_id:string; employee_name?:string; competency_id:string; competency_name?:string; evaluated_level:string; evaluator_name:string; evaluation_date:string; criteria:string; score?:string; status:string; };
type UniformCatalog={ id:string; name:string; type:string; size?:string; is_epi:boolean; ca_number?:string; validity_days?:number; provider_name?:string; cost?:string; version:number; approval_status:string; };
type UniformDelivery={ id:string; employee_id:string; employee_name?:string; uniform_id:string; uniform_name?:string; delivery_date:string; quantity:number; size?:string; status:string; receipt_signed:boolean; validity_end?:string; };
type UniformReturn={ id:string; delivery_id:string; employee_id:string; employee_name?:string; uniform_id:string; return_date:string; reason:string; status:string; };
type UniformRequest={ id:string; employee_id:string; employee_name?:string; uniform_id:string; uniform_name?:string; request_type:string; reason:string; status:string; quantity:number; };
type DpClosure={ competence:string; id:string; status:string; total_employees:number; total_faltas:string; total_ferias:number; total_variables:number; documents_conferidos:number; divergences_count:number; closed_at?:string; reopened_at?:string; reopen_reason?:string; };
type DpVariable={ id:string; closure_id:string; employee_id:string; employee_name?:string; variable_type:string; quantity:string; amount:string; competence:string; description?:string; status:string; };
type DpDocument={ id:string; closure_id:string; employee_id:string; employee_name?:string; doc_type:string; title:string; file_url?:string; status:string; };
type DpExport={ id:string; closure_id:string; competence:string; export_type:string; version:number; status:string; protocol_number?:string; is_protocol_valid:boolean; provider_name?:string; access_role:string; is_counter_access_limited:boolean; allowed_counter_ids?:string[]; created_at:string; };

export default function HrTrainingClient(){
 const [workspaceLoading,setWorkspaceLoading]=useState(false);
 const operation=useRef(false);const [operationBusy,setOperationBusy]=useState(false);
  const [trainings,setTrainings]=useState<TrainingCatalog[]>([]);
  const [trainingReqs,setTrainingReqs]=useState<TrainingReq[]>([]);
  const [sessions,setSessions]=useState<TrainingSession[]>([]);
  const [enrollments,setEnrollments]=useState<TrainingEnroll[]>([]);
  const [compCatalog,setCompCatalog]=useState<CompetencyCatalog[]>([]);
  const [compReqs,setCompReqs]=useState<CompetencyReq[]>([]);
  const [empComps,setEmpComps]=useState<EmployeeComp[]>([]);
  const [compEvals,setCompEvals]=useState<CompetencyEval[]>([]);
  const [uniformCatalog,setUniformCatalog]=useState<UniformCatalog[]>([]);
  const [uniformDeliveries,setUniformDeliveries]=useState<UniformDelivery[]>([]);
  const [uniformReturns,setUniformReturns]=useState<UniformReturn[]>([]);
  const [uniformRequests,setUniformRequests]=useState<UniformRequest[]>([]);
  const [dpClosures,setDpClosures]=useState<DpClosure[]>([]);
  const [dpVariables,setDpVariables]=useState<DpVariable[]>([]);
  const [dpDocuments,setDpDocuments]=useState<DpDocument[]>([]);
  const [dpExports,setDpExports]=useState<DpExport[]>([]);

  const [trainingForm,setTrainingForm]=useState({ name:"", type:"reciclagem", cargo_aplicavel:"vigilante", atividade:"", carga_horaria:"50", validity_days:"730", is_required:"true", provider_name:"" });
  const [trainingReqForm,setTrainingReqForm]=useState({ cargo:"vigilante", training_id:"", validity_days:"730", description:"" });
  const [sessionForm,setSessionForm]=useState({ training_id:"", title:"", scheduled_date:"", scheduled_time:"08:00", location:"", instructor_name:"", vagas:"20", notes:"" });
  const [enrollForm,setEnrollForm]=useState({ employee_id:"", training_id:"", session_id:"", enrollment_date:"", presence_percent:"", score:"", certificate_url:"", notes:"" });
  const [compCatalogForm,setCompCatalogForm]=useState({ name:"", type:"tecnica", level:"intermediario", validity_days:"730", description:"" });
  const [compReqForm,setCompReqForm]=useState({ cargo:"vigilante", competency_id:"", required_level:"intermediario", description:"" });
  const [empCompForm,setEmpCompForm]=useState({ employee_id:"", competency_id:"", level:"intermediario", acquired_date:"", expiry_date:"", proof_url:"", evaluated_by_name:"", evaluation_notes:"" });
  const [compEvalForm,setCompEvalForm]=useState({ employee_id:"", competency_id:"", evaluated_level:"intermediario", evaluator_name:"", evaluation_date:"", criteria:"Critérios definidos participação humana sem decisão automática punição", score:"", notes:"" });
  const [uniformCatalogForm,setUniformCatalogForm]=useState({ name:"", type:"uniforme", size:"M", is_epi:"false", ca_number:"", validity_days:"365", provider_name:"", cost:"100" });
  const [uniformDeliveryForm,setUniformDeliveryForm]=useState({ employee_id:"", uniform_id:"", delivery_date:"", quantity:"1", size:"M", receipt_url:"", receipt_signed:"false", delivered_by_name:"", notes:"" });
  const [uniformReturnForm,setUniformReturnForm]=useState({ delivery_id:"", employee_id:"", uniform_id:"", return_date:"", reason:"Devolução por troca tamanho desgaste", condition_description:"", received_by_name:"" });
  const [uniformRequestForm,setUniformRequestForm]=useState({ employee_id:"", uniform_id:"", request_type:"entrega", reason:"Solicitação uniforme/EPI conforme necessidade posto", size:"M", quantity:"1", notes:"" });
  const [dpClosureForm,setDpClosureForm]=useState({ competence:"2026-09", action:"abrir", total_employees:"50", total_faltas:"10", total_ferias:"5", total_variables:"20", documents_conferidos:"45", notes:"Fechamento DP conferido", reopen_reason:"" });
  const [dpVariableForm,setDpVariableForm]=useState({ employee_id:"", variable_type:"falta", quantity:"1", amount:"0", competence:"2026-09", description:"Falta justificada" });
  const [dpDocumentForm,setDpDocumentForm]=useState({ employee_id:"", doc_type:"folha_ponto", title:"Folha ponto", file_url:"", competence:"2026-09", notes:"" });
  const [dpExportForm,setDpExportForm]=useState({ competence:"2026-09", export_type:"folha", file_url:"", provider_name:"Contabilidade XPTO", access_role:"contador", allowed_counter_ids:"" });
  const [msg,setMsg]=useState("");

  async function loadAll(){
setWorkspaceLoading(true);
try {
    const t=await fetch('/api/admin/hr/training-catalog').then(workspaceResponse); if(t.trainings) setTrainings(t.trainings);
    const tr=await fetch('/api/admin/hr/training-requirements').then(workspaceResponse); if(tr.requirements) setTrainingReqs(tr.requirements);
    const ts=await fetch('/api/admin/hr/training-sessions').then(workspaceResponse); if(ts.sessions) setSessions(ts.sessions);
    const te=await fetch('/api/admin/hr/training-enrollments').then(workspaceResponse); if(te.enrollments) setEnrollments(te.enrollments);
    const cc=await fetch('/api/admin/hr/competency-catalog').then(workspaceResponse); if(cc.competencies) setCompCatalog(cc.competencies);
    const cr=await fetch('/api/admin/hr/competency-requirements').then(workspaceResponse); if(cr.requirements) setCompReqs(cr.requirements);
    const ec=await fetch('/api/admin/hr/employee-competencies').then(workspaceResponse); if(ec.employee_competencies) setEmpComps(ec.employee_competencies);
    const ce=await fetch('/api/admin/hr/competency-evaluations').then(workspaceResponse); if(ce.evaluations) setCompEvals(ce.evaluations);
    const uc=await fetch('/api/admin/hr/uniform-catalog').then(workspaceResponse); if(uc.uniforms) setUniformCatalog(uc.uniforms);
    const ud=await fetch('/api/admin/hr/uniform-deliveries').then(workspaceResponse); if(ud.deliveries) setUniformDeliveries(ud.deliveries);
    const ur=await fetch('/api/admin/hr/uniform-returns').then(workspaceResponse); if(ur.returns) setUniformReturns(ur.returns);
    const urq=await fetch('/api/admin/hr/uniform-requests').then(workspaceResponse); if(urq.requests) setUniformRequests(urq.requests);
    const dc=await fetch('/api/admin/hr/dp-closures').then(workspaceResponse); if(dc.closures) setDpClosures(dc.closures);
    const dv=await fetch('/api/admin/hr/dp-variables').then(workspaceResponse); if(dv.variables) setDpVariables(dv.variables);
    const dd=await fetch('/api/admin/hr/dp-documents').then(workspaceResponse); if(dd.documents) setDpDocuments(dd.documents);
    const de=await fetch('/api/admin/hr/dp-exports').then(workspaceResponse); if(de.exports) setDpExports(de.exports);
  } catch(error) {setMsg(error instanceof Error ? error.message : 'Não foi possível carregar esta área. Atualize para tentar novamente.');} finally {setWorkspaceLoading(false);}
}
  useEffect(()=>{ loadAll(); },[]);

  async function createTraining(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(trainingForm.name.length<3){ setMsg('nome min3'); return; }
    const r=await fetch('/api/admin/hr/training-catalog',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...trainingForm, carga_horaria: parseInt(trainingForm.carga_horaria)||null, validity_days: parseInt(trainingForm.validity_days)||null, is_required: trainingForm.is_required==='true' })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Treinamento criado v'+j.training.version); setTrainingForm({ name:"", type:"reciclagem", cargo_aplicavel:"vigilante", atividade:"", carga_horaria:"50", validity_days:"730", is_required:"true", provider_name:"" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchTraining(id:string, status:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    const reason= status==='rejeitado'? prompt('Motivo rejeição min5')||'': undefined;
    if(status==='rejeitado' && (!reason||reason.length<5)){ setMsg('motivo obrigatório'); return; }
    const r=await fetch('/api/admin/hr/training-catalog',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status, rejection_reason: reason })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createTrainingReq(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!trainingReqForm.cargo || !trainingReqForm.training_id){ setMsg('cargo training_id obrigatório'); return; }
    const r=await fetch('/api/admin/hr/training-requirements',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...trainingReqForm, validity_days: parseInt(trainingReqForm.validity_days)||null })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Requisito treinamento criado'); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createSession(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!sessionForm.training_id || !sessionForm.title || !sessionForm.scheduled_date){ setMsg('training_id title scheduled_date obrigatório'); return; }
    const r=await fetch('/api/admin/hr/training-sessions',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...sessionForm, vagas: parseInt(sessionForm.vagas)||null })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Sessão treinamento criada'); setSessionForm({ training_id:"", title:"", scheduled_date:"", scheduled_time:"08:00", location:"", instructor_name:"", vagas:"20", notes:"" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createEnrollment(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!enrollForm.employee_id || !enrollForm.training_id){ setMsg('employee_id training_id obrigatório'); return; }
    const r=await fetch('/api/admin/hr/training-enrollments',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...enrollForm, presence_percent: enrollForm.presence_percent? parseFloat(enrollForm.presence_percent): null, score: enrollForm.score? parseFloat(enrollForm.score): null })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Inscrição treinamento criada presença comprovante'); setEnrollForm({ employee_id:"", training_id:"", session_id:"", enrollment_date:"", presence_percent:"", score:"", certificate_url:"", notes:"" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchEnrollment(id:string, status:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    const reason= status==='rejeitado'? prompt('Motivo rejeição min5')||'': undefined;
    if(status==='rejeitado' && (!reason||reason.length<5)){ setMsg('motivo obrigatório'); return; }
    const r=await fetch('/api/admin/hr/training-enrollments',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status, rejection_reason: reason })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createCompCatalog(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(compCatalogForm.name.length<3){ setMsg('nome min3'); return; }
    const r=await fetch('/api/admin/hr/competency-catalog',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...compCatalogForm, validity_days: parseInt(compCatalogForm.validity_days)||null })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Competência catálogo criada v'+j.competency.version); setCompCatalogForm({ name:"", type:"tecnica", level:"intermediario", validity_days:"730", description:"" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchCompCatalog(id:string, status:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    const reason= status==='rejeitado'? prompt('Motivo rejeição min5')||'': undefined;
    if(status==='rejeitado' && (!reason||reason.length<5)){ setMsg('motivo obrigatório'); return; }
    const r=await fetch('/api/admin/hr/competency-catalog',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status, rejection_reason: reason })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createCompReq(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!compReqForm.cargo || !compReqForm.competency_id){ setMsg('cargo competency_id obrigatório'); return; }
    const r=await fetch('/api/admin/hr/competency-requirements',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(compReqForm)}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Requisito competência criado'); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createEmpComp(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!empCompForm.employee_id || !empCompForm.competency_id){ setMsg('employee_id competency_id obrigatório'); return; }
    const r=await fetch('/api/admin/hr/employee-competencies',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(empCompForm)}); const j=await r.json();
    if(!r.ok){ setMsg(j.error+' '+(j.detail||'')); return; } setMsg('Competência funcionário criada sem decisão automática'); setEmpCompForm({ employee_id:"", competency_id:"", level:"intermediario", acquired_date:"", expiry_date:"", proof_url:"", evaluated_by_name:"", evaluation_notes:"" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createCompEval(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!compEvalForm.employee_id || !compEvalForm.competency_id || compEvalForm.criteria.length<10){ setMsg('employee_id competency_id criteria min10 obrigatório'); return; }
    const r=await fetch('/api/admin/hr/competency-evaluations',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...compEvalForm, score: compEvalForm.score? parseFloat(compEvalForm.score): null })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error+' '+(j.detail||'')); return; } setMsg('Avaliação competência criada participação humana'); setCompEvalForm({ employee_id:"", competency_id:"", evaluated_level:"intermediario", evaluator_name:"", evaluation_date:"", criteria:"Critérios definidos participação humana sem decisão automática punição", score:"", notes:"" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchCompEval(id:string, status:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    const r=await fetch('/api/admin/hr/competency-evaluations',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createUniformCatalog(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(uniformCatalogForm.name.length<3){ setMsg('nome min3'); return; }
    const r=await fetch('/api/admin/hr/uniform-catalog',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...uniformCatalogForm, is_epi: uniformCatalogForm.is_epi==='true', validity_days: parseInt(uniformCatalogForm.validity_days)||null, cost: parseFloat(uniformCatalogForm.cost)||0 })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Uniforme catálogo criado v'+j.uniform.version); setUniformCatalogForm({ name:"", type:"uniforme", size:"M", is_epi:"false", ca_number:"", validity_days:"365", provider_name:"", cost:"100" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchUniformCatalog(id:string, status:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    const reason= status==='rejeitado'? prompt('Motivo rejeição min5')||'': undefined;
    if(status==='rejeitado' && (!reason||reason.length<5)){ setMsg('motivo obrigatório'); return; }
    const r=await fetch('/api/admin/hr/uniform-catalog',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status, rejection_reason: reason })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createUniformDelivery(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!uniformDeliveryForm.employee_id || !uniformDeliveryForm.uniform_id || !uniformDeliveryForm.delivery_date){ setMsg('employee_id uniform_id delivery_date obrigatório'); return; }
    const r=await fetch('/api/admin/hr/uniform-deliveries',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...uniformDeliveryForm, quantity: parseInt(uniformDeliveryForm.quantity)||1, receipt_signed: uniformDeliveryForm.receipt_signed==='true' })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Entrega uniforme/EPI criada recibo validade'); setUniformDeliveryForm({ employee_id:"", uniform_id:"", delivery_date:"", quantity:"1", size:"M", receipt_url:"", receipt_signed:"false", delivered_by_name:"", notes:"" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createUniformReturn(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!uniformReturnForm.delivery_id || !uniformReturnForm.employee_id || uniformReturnForm.reason.length<10){ setMsg('delivery_id employee_id reason min10 obrigatório'); return; }
    const r=await fetch('/api/admin/hr/uniform-returns',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(uniformReturnForm)}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Devolução uniforme criada'); setUniformReturnForm({ delivery_id:"", employee_id:"", uniform_id:"", return_date:"", reason:"Devolução por troca tamanho desgaste", condition_description:"", received_by_name:"" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createUniformRequest(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!uniformRequestForm.employee_id || !uniformRequestForm.uniform_id || uniformRequestForm.reason.length<10){ setMsg('employee_id uniform_id reason min10 obrigatório'); return; }
    const r=await fetch('/api/admin/hr/uniform-requests',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...uniformRequestForm, quantity: parseInt(uniformRequestForm.quantity)||1 })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Solicitação uniforme criada'); setUniformRequestForm({ employee_id:"", uniform_id:"", request_type:"entrega", reason:"Solicitação uniforme/EPI conforme necessidade posto", size:"M", quantity:"1", notes:"" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchUniformRequest(id:string, status:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    const reason= status==='rejeitado'? prompt('Motivo rejeição min5')||'': undefined;
    if(status==='rejeitado' && (!reason||reason.length<5)){ setMsg('motivo obrigatório'); return; }
    const r=await fetch('/api/admin/hr/uniform-requests',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status, rejection_reason: reason })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function handleDpClosure(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!dpClosureForm.competence){ setMsg('competence obrigatório'); return; }
    const r=await fetch('/api/admin/hr/dp-closures',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...dpClosureForm, total_employees: parseInt(dpClosureForm.total_employees)||0, total_faltas: parseFloat(dpClosureForm.total_faltas)||0, total_ferias: parseInt(dpClosureForm.total_ferias)||0, total_variables: parseInt(dpClosureForm.total_variables)||0, documents_conferidos: parseInt(dpClosureForm.documents_conferidos)||0 })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error+' '+(j.divergences? `diverg ${j.divergences}`:'')); return; } setMsg('Fechamento DP '+j.closure.status); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createDpVariable(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!dpVariableForm.employee_id || !dpVariableForm.competence){ setMsg('employee_id competence obrigatório'); return; }
    const r=await fetch('/api/admin/hr/dp-variables',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...dpVariableForm, quantity: parseFloat(dpVariableForm.quantity)||0, amount: parseFloat(dpVariableForm.amount)||0 })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Variável DP criada'); setDpVariableForm({ employee_id:"", variable_type:"falta", quantity:"1", amount:"0", competence:"2026-09", description:"Falta justificada" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createDpDocument(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!dpDocumentForm.employee_id || !dpDocumentForm.title){ setMsg('employee_id title obrigatório'); return; }
    const r=await fetch('/api/admin/hr/dp-documents',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(dpDocumentForm)}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Documento DP conferido criado'); setDpDocumentForm({ employee_id:"", doc_type:"folha_ponto", title:"Folha ponto", file_url:"", competence:"2026-09", notes:"" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createDpExport(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!dpExportForm.competence){ setMsg('competence obrigatório'); return; }
    const allowed= dpExportForm.allowed_counter_ids? dpExportForm.allowed_counter_ids.split(',').map((s:string)=>s.trim()).filter(Boolean): [];
    const r=await fetch('/api/admin/hr/dp-exports',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...dpExportForm, allowed_counter_ids: allowed })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Exportação DP versionada contador limitado criada v'+j.export.version); setDpExportForm({ competence:"2026-09", export_type:"folha", file_url:"", provider_name:"Contabilidade XPTO", access_role:"contador", allowed_counter_ids:"" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchDpExport(id:string, status:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    const r=await fetch('/api/admin/hr/dp-exports',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}

  return (
    <UiTaskWorkspace className="border rounded p-4 space-y-6 bg-white mt-6">
<fieldset disabled={operationBusy} aria-label="Processos desta área" style={{border:0,padding:0,margin:0,minWidth:0}}>
{operationBusy&&<p role="status">Salvando alteração…</p>}
{workspaceLoading && <p role="status">Carregando informações desta área…</p>}
      <h3 className="font-semibold">HR-17 Treinamento cargo atividade obrigatoriedade validade inscrição presença comprovante + HR-18 Matriz competências alocação sem decisão automática + HR-19 Uniformes/EPI entrega recibo validade devolução + HR-20 Fechamento DP faltas férias variáveis documentos exportação versionada contador limitado</h3>
      <p className="text-xs text-gray-600">Treinamento por cargo/atividade obrigatoriedade validade inscrição presença comprovante, competências matriz integrada alocação sem decisão automática contratação/punição participação humana feedback cliente não vira punição automática, uniformes/EPI entrega recibo substituição validade controle devolução, fechamento DP faltas férias variáveis documentos conferidos exportação versionada acesso contador limitado is_counter_access_limited.</p>
      <button onClick={loadAll} className="border px-2 text-xs">recarregar tudo</button>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Treinamento catálogo versionado ({trainings.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>nome <input value={trainingForm.name} onChange={e=>setTrainingForm({...trainingForm,name:e.target.value})} placeholder="nome min3" className="border p-1" /></label>
              <label>Tipo<select value={trainingForm.type} onChange={e=>setTrainingForm({...trainingForm,type:e.target.value})} className="border p-1"><option value="nr">nr</option><option value="reciclagem">reciclagem</option><option value="capacitacao">capacitacao</option><option value="obrigatorio">obrigatorio</option><option value="opcional">opcional</option><option value="integracao">integracao</option><option value="outro">outro</option></select></label>
              <label>cargo vigilante/porteiro/geral <input value={trainingForm.cargo_aplicavel} onChange={e=>setTrainingForm({...trainingForm,cargo_aplicavel:e.target.value})} placeholder="cargo vigilante/porteiro/geral" className="border p-1" /></label>
              <label>atividade <input value={trainingForm.atividade} onChange={e=>setTrainingForm({...trainingForm,atividade:e.target.value})} placeholder="atividade" className="border p-1" /></label>
              <label>carga_horaria <input value={trainingForm.carga_horaria} onChange={e=>setTrainingForm({...trainingForm,carga_horaria:e.target.value})} type="number" placeholder="carga_horaria" className="border p-1" /></label>
              <label>validity_days <input value={trainingForm.validity_days} onChange={e=>setTrainingForm({...trainingForm,validity_days:e.target.value})} type="number" placeholder="validity_days" className="border p-1" /></label>
              <label>Is required<select value={trainingForm.is_required} onChange={e=>setTrainingForm({...trainingForm,is_required:e.target.value})} className="border p-1"><option value="true">obrigatório</option><option value="false">opcional</option></select></label>
              <label>fornecedor <input value={trainingForm.provider_name} onChange={e=>setTrainingForm({...trainingForm,provider_name:e.target.value})} placeholder="fornecedor" className="border p-1" /></label>
            </div>
            <button onClick={createTraining} className="bg-blue-600 text-white px-2 py-1">criar treinamento versionado</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {trainings.map(t=>(
                <div key={t.id} className="p-1 flex justify-between"><span><b>{t.name}</b> v{t.version} {t.type} cargo {t.cargo_aplicavel||'-'} {t.carga_horaria||'-'}h valid {t.validity_days||'-'}d req {String(t.is_required)} status {t.approval_status}</span><span className="flex gap-1"><button onClick={()=>patchTraining(t.id,'aprovado')} className="border px-1 bg-green-100">aprovar</button><button onClick={()=>patchTraining(t.id,'rejeitado')} className="border px-1 bg-red-100">rejeitar</button></span></div>
              ))}
            </div>
          </div>

          <h4 className="font-medium text-sm">Requisitos treinamento cargo ({trainingReqs.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>cargo <input value={trainingReqForm.cargo} onChange={e=>setTrainingReqForm({...trainingReqForm,cargo:e.target.value})} placeholder="cargo" className="border p-1" /></label>
              <label>training_id aprovado <input value={trainingReqForm.training_id} onChange={e=>setTrainingReqForm({...trainingReqForm,training_id:e.target.value})} placeholder="training_id aprovado" className="border p-1" /></label>
              <label>validity_days <input value={trainingReqForm.validity_days} onChange={e=>setTrainingReqForm({...trainingReqForm,validity_days:e.target.value})} type="number" placeholder="validity_days" className="border p-1" /></label>
              <label>descrição <input value={trainingReqForm.description} onChange={e=>setTrainingReqForm({...trainingReqForm,description:e.target.value})} placeholder="descrição" className="border p-1" /></label>
            </div>
            <button onClick={createTrainingReq} className="bg-black text-white px-2 py-1">criar requisito treinamento cargo</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {trainingReqs.map(r=>(
                <div key={r.id} className="p-1">{r.cargo} - {r.training_name||r.training_id.slice(0,8)} req {String(r.is_required)} valid {r.validity_days||'-'}d</div>
              ))}
            </div>
          </div>

          <h4 className="font-medium text-sm">Sessões treinamento ({sessions.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>training_id <input value={sessionForm.training_id} onChange={e=>setSessionForm({...sessionForm,training_id:e.target.value})} placeholder="training_id" className="border p-1" /></label>
              <label>título sessão <input value={sessionForm.title} onChange={e=>setSessionForm({...sessionForm,title:e.target.value})} placeholder="título sessão" className="border p-1" /></label>
              <input value={sessionForm.scheduled_date} onChange={e=>setSessionForm({...sessionForm,scheduled_date:e.target.value})} type="date" className="border p-1" />
              <input value={sessionForm.scheduled_time} onChange={e=>setSessionForm({...sessionForm,scheduled_time:e.target.value})} type="time" className="border p-1" />
              <label>local <input value={sessionForm.location} onChange={e=>setSessionForm({...sessionForm,location:e.target.value})} placeholder="local" className="border p-1" /></label>
              <label>instrutor <input value={sessionForm.instructor_name} onChange={e=>setSessionForm({...sessionForm,instructor_name:e.target.value})} placeholder="instrutor" className="border p-1" /></label>
              <label>vagas <input value={sessionForm.vagas} onChange={e=>setSessionForm({...sessionForm,vagas:e.target.value})} type="number" placeholder="vagas" className="border p-1" /></label>
              <label>notas <input value={sessionForm.notes} onChange={e=>setSessionForm({...sessionForm,notes:e.target.value})} placeholder="notas" className="border p-1" /></label>
            </div>
            <button onClick={createSession} className="bg-blue-600 text-white px-2 py-1">criar sessão treinamento</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {sessions.map(s=>(
                <div key={s.id} className="p-1">{s.training_name||s.training_id.slice(0,8)} {s.title} {s.scheduled_date?.slice(0,10)} {s.scheduled_time||''} {s.location||''} vagas {s.vagas||'-'} status {s.status}</div>
              ))}
            </div>
          </div>

          <h4 className="font-medium text-sm">Inscrições presença comprovante ({enrollments.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>employee_id <UiEmployeePicker value={enrollForm.employee_id} onChange={e=>setEnrollForm({...enrollForm,employee_id:e.target.value})} placeholder="employee_id" className="border p-1" /></label>
              <label>training_id aprovado <input value={enrollForm.training_id} onChange={e=>setEnrollForm({...enrollForm,training_id:e.target.value})} placeholder="training_id aprovado" className="border p-1" /></label>
              <label>session_id <input value={enrollForm.session_id} onChange={e=>setEnrollForm({...enrollForm,session_id:e.target.value})} placeholder="session_id" className="border p-1" /></label>
              <input value={enrollForm.enrollment_date} onChange={e=>setEnrollForm({...enrollForm,enrollment_date:e.target.value})} type="date" className="border p-1" />
              <label>presença % <input value={enrollForm.presence_percent} onChange={e=>setEnrollForm({...enrollForm,presence_percent:e.target.value})} type="number" step="0.1" placeholder="presença %" className="border p-1" /></label>
              <label>nota <input value={enrollForm.score} onChange={e=>setEnrollForm({...enrollForm,score:e.target.value})} type="number" step="0.1" placeholder="nota" className="border p-1" /></label>
              <label>certificado url comprovante <input value={enrollForm.certificate_url} onChange={e=>setEnrollForm({...enrollForm,certificate_url:e.target.value})} placeholder="certificado url comprovante" className="border p-1" /></label>
              <label>notas <input value={enrollForm.notes} onChange={e=>setEnrollForm({...enrollForm,notes:e.target.value})} placeholder="notas" className="border p-1" /></label>
            </div>
            <button onClick={createEnrollment} className="bg-black text-white px-2 py-1">inscrever presença comprovante</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {enrollments.map(en=>(
                <div key={en.id} className="p-1 flex justify-between"><span>{en.employee_id.slice(0,8)} {en.employee_name||''} {en.training_name||en.training_id.slice(0,8)} sessão {en.session_title||en.session_id?.slice(0,8)||'-'} status {en.status} presença {en.presence_percent||'-'}% nota {en.score||'-'} cert {en.certificate_url? 'sim':''}</span><span className="flex gap-1"><button onClick={()=>patchEnrollment(en.id,'concluido')} className="border px-1 bg-green-100">concluido</button><button onClick={()=>patchEnrollment(en.id,'reprovado')} className="border px-1 bg-red-100">reprovado</button></span></div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium text-sm">Competência catálogo versionado ({compCatalog.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>nome <input value={compCatalogForm.name} onChange={e=>setCompCatalogForm({...compCatalogForm,name:e.target.value})} placeholder="nome min3" className="border p-1" /></label>
              <label>Tipo<select value={compCatalogForm.type} onChange={e=>setCompCatalogForm({...compCatalogForm,type:e.target.value})} className="border p-1"><option value="tecnica">tecnica</option><option value="comportamental">comportamental</option><option value="certificacao">certificacao</option><option value="habilitacao">habilitacao</option><option value="idioma">idioma</option><option value="outro">outro</option></select></label>
              <label>Level<select value={compCatalogForm.level} onChange={e=>setCompCatalogForm({...compCatalogForm,level:e.target.value})} className="border p-1"><option value="basico">basico</option><option value="intermediario">intermediario</option><option value="avancado">avancado</option><option value="especialista">especialista</option></select></label>
              <label>validity_days <input value={compCatalogForm.validity_days} onChange={e=>setCompCatalogForm({...compCatalogForm,validity_days:e.target.value})} type="number" placeholder="validity_days" className="border p-1" /></label>
              <label>descrição <input value={compCatalogForm.description} onChange={e=>setCompCatalogForm({...compCatalogForm,description:e.target.value})} placeholder="descrição" className="border p-1 col-span-2" /></label>
            </div>
            <button onClick={createCompCatalog} className="bg-green-600 text-white px-2 py-1">criar competência versionada</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {compCatalog.map(c=>(
                <div key={c.id} className="p-1 flex justify-between"><span><b>{c.name}</b> v{c.version} {c.type} nível {c.level} valid {c.validity_days||'-'}d status {c.approval_status}</span><span className="flex gap-1"><button onClick={()=>patchCompCatalog(c.id,'aprovado')} className="border px-1 bg-green-100">aprovar</button><button onClick={()=>patchCompCatalog(c.id,'rejeitado')} className="border px-1 bg-red-100">rejeitar</button></span></div>
              ))}
            </div>
          </div>

          <h4 className="font-medium text-sm">Requisitos competência cargo ({compReqs.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>cargo <input value={compReqForm.cargo} onChange={e=>setCompReqForm({...compReqForm,cargo:e.target.value})} placeholder="cargo" className="border p-1" /></label>
              <label>competency_id aprovado <input value={compReqForm.competency_id} onChange={e=>setCompReqForm({...compReqForm,competency_id:e.target.value})} placeholder="competency_id aprovado" className="border p-1" /></label>
              <label>Required level<select value={compReqForm.required_level} onChange={e=>setCompReqForm({...compReqForm,required_level:e.target.value})} className="border p-1"><option value="basico">basico</option><option value="intermediario">intermediario</option><option value="avancado">avancado</option><option value="especialista">especialista</option></select></label>
              <label>descrição <input value={compReqForm.description} onChange={e=>setCompReqForm({...compReqForm,description:e.target.value})} placeholder="descrição" className="border p-1" /></label>
            </div>
            <button onClick={createCompReq} className="bg-black text-white px-2 py-1">criar requisito competência cargo</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {compReqs.map(r=>(
                <div key={r.id} className="p-1">{r.cargo} - {r.competency_name||r.competency_id.slice(0,8)} nível req {r.required_level} obrig {String(r.is_required)}</div>
              ))}
            </div>
          </div>

          <h4 className="font-medium text-sm">Competências funcionário ({empComps.length}) sem decisão automática</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>employee_id <UiEmployeePicker value={empCompForm.employee_id} onChange={e=>setEmpCompForm({...empCompForm,employee_id:e.target.value})} placeholder="employee_id" className="border p-1" /></label>
              <label>competency_id aprovado <input value={empCompForm.competency_id} onChange={e=>setEmpCompForm({...empCompForm,competency_id:e.target.value})} placeholder="competency_id aprovado" className="border p-1" /></label>
              <label>Level<select value={empCompForm.level} onChange={e=>setEmpCompForm({...empCompForm,level:e.target.value})} className="border p-1"><option value="basico">basico</option><option value="intermediario">intermediario</option><option value="avancado">avancado</option><option value="especialista">especialista</option></select></label>
              <input value={empCompForm.acquired_date} onChange={e=>setEmpCompForm({...empCompForm,acquired_date:e.target.value})} type="date" className="border p-1" />
              <input value={empCompForm.expiry_date} onChange={e=>setEmpCompForm({...empCompForm,expiry_date:e.target.value})} type="date" className="border p-1" />
              <label>comprovante url <input value={empCompForm.proof_url} onChange={e=>setEmpCompForm({...empCompForm,proof_url:e.target.value})} placeholder="comprovante url" className="border p-1" /></label>
              <label>avaliador nome <input value={empCompForm.evaluated_by_name} onChange={e=>setEmpCompForm({...empCompForm,evaluated_by_name:e.target.value})} placeholder="avaliador nome" className="border p-1" /></label>
              <label>notas avaliação <input value={empCompForm.evaluation_notes} onChange={e=>setEmpCompForm({...empCompForm,evaluation_notes:e.target.value})} placeholder="notas avaliação" className="border p-1 col-span-2" /></label>
            </div>
            <button onClick={createEmpComp} className="bg-blue-600 text-white px-2 py-1">atribuir competência funcionário sem decisão automática</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {empComps.map(ec=>(
                <div key={ec.id} className="p-1">{ec.employee_id.slice(0,8)} {ec.employee_name||''} {ec.competency_name||ec.competency_id.slice(0,8)} nível {ec.level} aq {ec.acquired_date?.slice(0,10)} exp {ec.expiry_date?.slice(0,10)||'∞'} status {ec.status} avaliador {ec.evaluated_by_name||''}</div>
              ))}
            </div>
          </div>

          <h4 className="font-medium text-sm">Avaliações competências ({compEvals.length}) participação humana feedback cliente não punição automática</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>employee_id <UiEmployeePicker value={compEvalForm.employee_id} onChange={e=>setCompEvalForm({...compEvalForm,employee_id:e.target.value})} placeholder="employee_id" className="border p-1" /></label>
              <label>competency_id <input value={compEvalForm.competency_id} onChange={e=>setCompEvalForm({...compEvalForm,competency_id:e.target.value})} placeholder="competency_id" className="border p-1" /></label>
              <label>Evaluated level<select value={compEvalForm.evaluated_level} onChange={e=>setCompEvalForm({...compEvalForm,evaluated_level:e.target.value})} className="border p-1"><option value="basico">basico</option><option value="intermediario">intermediario</option><option value="avancado">avancado</option><option value="especialista">especialista</option></select></label>
              <label>avaliador nome <input value={compEvalForm.evaluator_name} onChange={e=>setCompEvalForm({...compEvalForm,evaluator_name:e.target.value})} placeholder="avaliador nome min3" className="border p-1" /></label>
              <input value={compEvalForm.evaluation_date} onChange={e=>setCompEvalForm({...compEvalForm,evaluation_date:e.target.value})} type="date" className="border p-1" />
              <label>nota <input value={compEvalForm.score} onChange={e=>setCompEvalForm({...compEvalForm,score:e.target.value})} type="number" step="0.1" placeholder="nota" className="border p-1" /></label>
              <textarea value={compEvalForm.criteria} onChange={e=>setCompEvalForm({...compEvalForm,criteria:e.target.value})} placeholder="critérios min10 participação humana" className="border p-1 col-span-2" rows={2}></textarea>
              <textarea value={compEvalForm.notes} onChange={e=>setCompEvalForm({...compEvalForm,notes:e.target.value})} placeholder="notas sem punição automática" className="border p-1 col-span-2" rows={1}></textarea>
            </div>
            <button onClick={createCompEval} className="bg-black text-white px-2 py-1">avaliar competência participação humana</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {compEvals.map(ev=>(
                <div key={ev.id} className="p-1 flex justify-between"><span>{ev.employee_id.slice(0,8)} {ev.employee_name||''} {ev.competency_name||ev.competency_id.slice(0,8)} nível {ev.evaluated_level} avaliador {ev.evaluator_name} {ev.evaluation_date?.slice(0,10)} nota {ev.score||'-'} status {ev.status}<br/><span className="text-gray-500">{ev.criteria.slice(0,60)}</span></span><span className="flex gap-1"><button onClick={()=>patchCompEval(ev.id,'aprovado')} className="border px-1 bg-green-100">aprovar</button></span></div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Uniforme/EPI catálogo versionado ({uniformCatalog.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>nome <input value={uniformCatalogForm.name} onChange={e=>setUniformCatalogForm({...uniformCatalogForm,name:e.target.value})} placeholder="nome min3" className="border p-1" /></label>
              <label>Tipo<select value={uniformCatalogForm.type} onChange={e=>setUniformCatalogForm({...uniformCatalogForm,type:e.target.value})} className="border p-1"><option value="uniforme">uniforme</option><option value="epi">epi</option><option value="equipamento">equipamento</option><option value="acessorio">acessorio</option><option value="outro">outro</option></select></label>
              <label>tamanho <input value={uniformCatalogForm.size} onChange={e=>setUniformCatalogForm({...uniformCatalogForm,size:e.target.value})} placeholder="tamanho" className="border p-1" /></label>
              <label>Is epi<select value={uniformCatalogForm.is_epi} onChange={e=>setUniformCatalogForm({...uniformCatalogForm,is_epi:e.target.value})} className="border p-1"><option value="false">não EPI</option><option value="true">EPI</option></select></label>
              <label>CA número <input value={uniformCatalogForm.ca_number} onChange={e=>setUniformCatalogForm({...uniformCatalogForm,ca_number:e.target.value})} placeholder="CA número" className="border p-1" /></label>
              <label>validity_days <input value={uniformCatalogForm.validity_days} onChange={e=>setUniformCatalogForm({...uniformCatalogForm,validity_days:e.target.value})} type="number" placeholder="validity_days" className="border p-1" /></label>
              <label>fornecedor <input value={uniformCatalogForm.provider_name} onChange={e=>setUniformCatalogForm({...uniformCatalogForm,provider_name:e.target.value})} placeholder="fornecedor" className="border p-1" /></label>
              <label>custo <input value={uniformCatalogForm.cost} onChange={e=>setUniformCatalogForm({...uniformCatalogForm,cost:e.target.value})} type="number" step="0.01" placeholder="custo" className="border p-1" /></label>
            </div>
            <button onClick={createUniformCatalog} className="bg-green-600 text-white px-2 py-1">criar uniforme/EPI versionado</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {uniformCatalog.map(u=>(
                <div key={u.id} className="p-1 flex justify-between"><span><b>{u.name}</b> v{u.version} {u.type} tam {u.size||'-'} EPI {String(u.is_epi)} CA {u.ca_number||'-'} valid {u.validity_days||'-'}d status {u.approval_status}</span><span className="flex gap-1"><button onClick={()=>patchUniformCatalog(u.id,'aprovado')} className="border px-1 bg-green-100">aprovar</button></span></div>
              ))}
            </div>
          </div>

          <h4 className="font-medium text-sm">Entregas uniforme/EPI ({uniformDeliveries.length}) recibo validade</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>employee_id <UiEmployeePicker value={uniformDeliveryForm.employee_id} onChange={e=>setUniformDeliveryForm({...uniformDeliveryForm,employee_id:e.target.value})} placeholder="employee_id" className="border p-1" /></label>
              <label>uniform_id aprovado <input value={uniformDeliveryForm.uniform_id} onChange={e=>setUniformDeliveryForm({...uniformDeliveryForm,uniform_id:e.target.value})} placeholder="uniform_id aprovado" className="border p-1" /></label>
              <input value={uniformDeliveryForm.delivery_date} onChange={e=>setUniformDeliveryForm({...uniformDeliveryForm,delivery_date:e.target.value})} type="date" className="border p-1" />
              <label>quantidade <input value={uniformDeliveryForm.quantity} onChange={e=>setUniformDeliveryForm({...uniformDeliveryForm,quantity:e.target.value})} type="number" placeholder="quantidade" className="border p-1" /></label>
              <label>tamanho <input value={uniformDeliveryForm.size} onChange={e=>setUniformDeliveryForm({...uniformDeliveryForm,size:e.target.value})} placeholder="tamanho" className="border p-1" /></label>
              <label>recibo url <input value={uniformDeliveryForm.receipt_url} onChange={e=>setUniformDeliveryForm({...uniformDeliveryForm,receipt_url:e.target.value})} placeholder="recibo url" className="border p-1" /></label>
              <label>Receipt signed<select value={uniformDeliveryForm.receipt_signed} onChange={e=>setUniformDeliveryForm({...uniformDeliveryForm,receipt_signed:e.target.value})} className="border p-1"><option value="false">recibo não assinado</option><option value="true">recibo assinado</option></select></label>
              <label>entregue por nome <input value={uniformDeliveryForm.delivered_by_name} onChange={e=>setUniformDeliveryForm({...uniformDeliveryForm,delivered_by_name:e.target.value})} placeholder="entregue por nome" className="border p-1" /></label>
              <label>notas <input value={uniformDeliveryForm.notes} onChange={e=>setUniformDeliveryForm({...uniformDeliveryForm,notes:e.target.value})} placeholder="notas" className="border p-1 col-span-2" /></label>
            </div>
            <button onClick={createUniformDelivery} className="bg-black text-white px-2 py-1">entregar uniforme/EPI recibo validade</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {uniformDeliveries.map(d=>(
                <div key={d.id} className="p-1">{d.employee_id.slice(0,8)} {d.employee_name||''} {d.uniform_name||d.uniform_id.slice(0,8)} qtd {d.quantity} tam {d.size||'-'} {d.delivery_date?.slice(0,10)} status {d.status} recibo ass {String(d.receipt_signed)} valid {d.validity_end?.slice(0,10)||'∞'}</div>
              ))}
            </div>
          </div>

          <h4 className="font-medium text-sm">Devoluções ({uniformReturns.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>delivery_id <input value={uniformReturnForm.delivery_id} onChange={e=>setUniformReturnForm({...uniformReturnForm,delivery_id:e.target.value})} placeholder="delivery_id" className="border p-1" /></label>
              <label>employee_id <UiEmployeePicker value={uniformReturnForm.employee_id} onChange={e=>setUniformReturnForm({...uniformReturnForm,employee_id:e.target.value})} placeholder="employee_id" className="border p-1" /></label>
              <label>uniform_id <input value={uniformReturnForm.uniform_id} onChange={e=>setUniformReturnForm({...uniformReturnForm,uniform_id:e.target.value})} placeholder="uniform_id" className="border p-1" /></label>
              <input value={uniformReturnForm.return_date} onChange={e=>setUniformReturnForm({...uniformReturnForm,return_date:e.target.value})} type="date" className="border p-1" />
              <label>recebido por <input value={uniformReturnForm.received_by_name} onChange={e=>setUniformReturnForm({...uniformReturnForm,received_by_name:e.target.value})} placeholder="recebido por" className="border p-1" /></label>
              <textarea value={uniformReturnForm.reason} onChange={e=>setUniformReturnForm({...uniformReturnForm,reason:e.target.value})} placeholder="motivo devolução min10" className="border p-1 col-span-2" rows={1}></textarea>
              <label>condição <input value={uniformReturnForm.condition_description} onChange={e=>setUniformReturnForm({...uniformReturnForm,condition_description:e.target.value})} placeholder="condição" className="border p-1 col-span-2" /></label>
            </div>
            <button onClick={createUniformReturn} className="bg-blue-600 text-white px-2 py-1">devolver uniforme/EPI</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {uniformReturns.map(r=>(
                <div key={r.id} className="p-1">{r.employee_id.slice(0,8)} {r.employee_name||''} delivery {r.delivery_id.slice(0,8)} {r.return_date?.slice(0,10)} motivo {r.reason.slice(0,30)} status {r.status}</div>
              ))}
            </div>
          </div>

          <h4 className="font-medium text-sm">Solicitações uniforme ({uniformRequests.length}) entrega substituição devolução</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>employee_id <UiEmployeePicker value={uniformRequestForm.employee_id} onChange={e=>setUniformRequestForm({...uniformRequestForm,employee_id:e.target.value})} placeholder="employee_id" className="border p-1" /></label>
              <label>uniform_id <input value={uniformRequestForm.uniform_id} onChange={e=>setUniformRequestForm({...uniformRequestForm,uniform_id:e.target.value})} placeholder="uniform_id" className="border p-1" /></label>
              <label>Request type<select value={uniformRequestForm.request_type} onChange={e=>setUniformRequestForm({...uniformRequestForm,request_type:e.target.value})} className="border p-1"><option value="entrega">entrega</option><option value="substituicao">substituicao</option><option value="devolucao">devolucao</option><option value="outro">outro</option></select></label>
              <label>tamanho <input value={uniformRequestForm.size} onChange={e=>setUniformRequestForm({...uniformRequestForm,size:e.target.value})} placeholder="tamanho" className="border p-1" /></label>
              <label>quantidade <input value={uniformRequestForm.quantity} onChange={e=>setUniformRequestForm({...uniformRequestForm,quantity:e.target.value})} type="number" placeholder="quantidade" className="border p-1" /></label>
              <textarea value={uniformRequestForm.reason} onChange={e=>setUniformRequestForm({...uniformRequestForm,reason:e.target.value})} placeholder="motivo min10" className="border p-1 col-span-2" rows={1}></textarea>
              <label>notas <input value={uniformRequestForm.notes} onChange={e=>setUniformRequestForm({...uniformRequestForm,notes:e.target.value})} placeholder="notas" className="border p-1 col-span-2" /></label>
            </div>
            <button onClick={createUniformRequest} className="bg-blue-600 text-white px-2 py-1">solicitar uniforme/EPI</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {uniformRequests.map(r=>(
                <div key={r.id} className="p-1 flex justify-between"><span>{r.employee_id.slice(0,8)} {r.employee_name||''} {r.uniform_name||r.uniform_id.slice(0,8)} {r.request_type} qtd {r.quantity} status {r.status} {r.reason.slice(0,30)}</span><span className="flex gap-1"><button onClick={()=>patchUniformRequest(r.id,'aprovado')} className="border px-1 bg-green-100">aprovar</button><button onClick={()=>patchUniformRequest(r.id,'rejeitado')} className="border px-1 bg-red-100">rejeitar</button></span></div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium text-sm">Fechamento DP ({dpClosures.length}) faltas férias variáveis documentos</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>competence YYYY-MM <input value={dpClosureForm.competence} onChange={e=>setDpClosureForm({...dpClosureForm,competence:e.target.value})} placeholder="competence YYYY-MM" className="border p-1" /></label>
              <label>Action<select value={dpClosureForm.action} onChange={e=>setDpClosureForm({...dpClosureForm,action:e.target.value})} className="border p-1"><option value="abrir">abrir</option><option value="fechar">fechar</option><option value="reabrir">reabrir</option></select></label>
              <label>total_employees <input value={dpClosureForm.total_employees} onChange={e=>setDpClosureForm({...dpClosureForm,total_employees:e.target.value})} type="number" placeholder="total_employees" className="border p-1" /></label>
              <label>total_faltas <input value={dpClosureForm.total_faltas} onChange={e=>setDpClosureForm({...dpClosureForm,total_faltas:e.target.value})} type="number" step="0.1" placeholder="total_faltas" className="border p-1" /></label>
              <label>total_ferias <input value={dpClosureForm.total_ferias} onChange={e=>setDpClosureForm({...dpClosureForm,total_ferias:e.target.value})} type="number" placeholder="total_ferias" className="border p-1" /></label>
              <label>total_variables <input value={dpClosureForm.total_variables} onChange={e=>setDpClosureForm({...dpClosureForm,total_variables:e.target.value})} type="number" placeholder="total_variables" className="border p-1" /></label>
              <label>documents_conferidos <input value={dpClosureForm.documents_conferidos} onChange={e=>setDpClosureForm({...dpClosureForm,documents_conferidos:e.target.value})} type="number" placeholder="documents_conferidos" className="border p-1" /></label>
              <label>motivo reabertura <input value={dpClosureForm.reopen_reason} onChange={e=>setDpClosureForm({...dpClosureForm,reopen_reason:e.target.value})} placeholder="motivo reabertura min10" className="border p-1" /></label>
              <label>notas <input value={dpClosureForm.notes} onChange={e=>setDpClosureForm({...dpClosureForm,notes:e.target.value})} placeholder="notas" className="border p-1 col-span-2" /></label>
            </div>
            <button onClick={handleDpClosure} className="bg-black text-white px-2 py-1">abrir/fechar/reabrir DP competência</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {dpClosures.map(c=>(
                <div key={c.id} className="p-1">{c.competence} status {c.status} emp {c.total_employees} faltas {c.total_faltas} férias {c.total_ferias} var {c.total_variables} docs {c.documents_conferidos} diverg {c.divergences_count} fechado {c.closed_at?.slice(0,10)||'-'} reaberto {c.reopened_at?.slice(0,10)||'-'} {c.reopen_reason||''}</div>
              ))}
            </div>
          </div>

          <h4 className="font-medium text-sm">Variáveis DP ({dpVariables.length}) faltas férias variáveis</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>employee_id <UiEmployeePicker value={dpVariableForm.employee_id} onChange={e=>setDpVariableForm({...dpVariableForm,employee_id:e.target.value})} placeholder="employee_id" className="border p-1" /></label>
              <label>Variable type<select value={dpVariableForm.variable_type} onChange={e=>setDpVariableForm({...dpVariableForm,variable_type:e.target.value})} className="border p-1"><option value="falta">falta</option><option value="ferias">ferias</option><option value="hora_extra">hora_extra</option><option value="adicional">adicional</option><option value="desconto">desconto</option><option value="bonus">bonus</option><option value="adiantamento">adiantamento</option><option value="reembolso">reembolso</option><option value="outro">outro</option></select></label>
              <label>quantity <input value={dpVariableForm.quantity} onChange={e=>setDpVariableForm({...dpVariableForm,quantity:e.target.value})} type="number" step="0.1" placeholder="quantity" className="border p-1" /></label>
              <label>amount <input value={dpVariableForm.amount} onChange={e=>setDpVariableForm({...dpVariableForm,amount:e.target.value})} type="number" step="0.01" placeholder="amount" className="border p-1" /></label>
              <label>competence YYYY-MM <input value={dpVariableForm.competence} onChange={e=>setDpVariableForm({...dpVariableForm,competence:e.target.value})} placeholder="competence YYYY-MM" className="border p-1" /></label>
              <label>descrição <input value={dpVariableForm.description} onChange={e=>setDpVariableForm({...dpVariableForm,description:e.target.value})} placeholder="descrição" className="border p-1" /></label>
            </div>
            <button onClick={createDpVariable} className="bg-blue-600 text-white px-2 py-1">criar variável DP faltas férias</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {dpVariables.map(v=>(
                <div key={v.id} className="p-1">{v.employee_id.slice(0,8)} {v.employee_name||''} {v.variable_type} qtd {v.quantity} R${v.amount} comp {v.competence} status {v.status} {v.description||''}</div>
              ))}
            </div>
          </div>

          <h4 className="font-medium text-sm">Documentos DP conferidos ({dpDocuments.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>employee_id <UiEmployeePicker value={dpDocumentForm.employee_id} onChange={e=>setDpDocumentForm({...dpDocumentForm,employee_id:e.target.value})} placeholder="employee_id" className="border p-1" /></label>
              <label>doc_type folha_ponto/atestado/outro <input value={dpDocumentForm.doc_type} onChange={e=>setDpDocumentForm({...dpDocumentForm,doc_type:e.target.value})} placeholder="doc_type folha_ponto/atestado/outro" className="border p-1" /></label>
              <label>título <input value={dpDocumentForm.title} onChange={e=>setDpDocumentForm({...dpDocumentForm,title:e.target.value})} placeholder="título" className="border p-1" /></label>
              <label>file_url <input value={dpDocumentForm.file_url} onChange={e=>setDpDocumentForm({...dpDocumentForm,file_url:e.target.value})} placeholder="file_url" className="border p-1" /></label>
              <label>competence YYYY-MM <input value={dpDocumentForm.competence} onChange={e=>setDpDocumentForm({...dpDocumentForm,competence:e.target.value})} placeholder="competence YYYY-MM" className="border p-1" /></label>
              <label>notas <input value={dpDocumentForm.notes} onChange={e=>setDpDocumentForm({...dpDocumentForm,notes:e.target.value})} placeholder="notas" className="border p-1" /></label>
            </div>
            <button onClick={createDpDocument} className="bg-blue-600 text-white px-2 py-1">conferir documento DP</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {dpDocuments.map(d=>(
                <div key={d.id} className="p-1">{d.employee_id.slice(0,8)} {d.employee_name||''} {d.doc_type} {d.title} comp {(d as any).competence||''} status {d.status}</div>
              ))}
            </div>
          </div>

          <h4 className="font-medium text-sm">Exportação DP versionada contador limitado ({dpExports.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>competence YYYY-MM <input value={dpExportForm.competence} onChange={e=>setDpExportForm({...dpExportForm,competence:e.target.value})} placeholder="competence YYYY-MM" className="border p-1" /></label>
              <label>Export type<select value={dpExportForm.export_type} onChange={e=>setDpExportForm({...dpExportForm,export_type:e.target.value})} className="border p-1"><option value="folha">folha</option><option value="contabilidade">contabilidade</option><option value="fiscal">fiscal</option><option value="contador">contador</option><option value="outro">outro</option></select></label>
              <label>file_url <input value={dpExportForm.file_url} onChange={e=>setDpExportForm({...dpExportForm,file_url:e.target.value})} placeholder="file_url" className="border p-1" /></label>
              <label>provedor <input value={dpExportForm.provider_name} onChange={e=>setDpExportForm({...dpExportForm,provider_name:e.target.value})} placeholder="provedor" className="border p-1" /></label>
              <label>Access role<select value={dpExportForm.access_role} onChange={e=>setDpExportForm({...dpExportForm,access_role:e.target.value})} className="border p-1"><option value="contador">contador</option><option value="rh">rh</option><option value="financeiro">financeiro</option><option value="admin">admin</option></select></label>
              <label>allowed_counter_ids csv <input value={dpExportForm.allowed_counter_ids} onChange={e=>setDpExportForm({...dpExportForm,allowed_counter_ids:e.target.value})} placeholder="allowed_counter_ids csv" className="border p-1" /></label>
            </div>
            <button onClick={createDpExport} className="bg-black text-white px-2 py-1">exportar DP versionado contador limitado</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {dpExports.map(ex=>(
                <div key={ex.id} className="p-1 flex justify-between"><span>comp {ex.competence} tipo {ex.export_type} v{ex.version} status {ex.status} proto {ex.protocol_number||'-'} valid {String(ex.is_protocol_valid)} role {ex.access_role} limitado {String(ex.is_counter_access_limited)} contadores {(ex.allowed_counter_ids||[]).join(',')}<br/><span className="text-gray-500">{ex.provider_name||''}</span></span><span className="flex gap-1"><button onClick={()=>patchDpExport(ex.id,'gerado')} className="border px-1">gerado</button><button onClick={()=>patchDpExport(ex.id,'enviado')} className="border px-1 bg-blue-100">enviado</button><button onClick={()=>patchDpExport(ex.id,'confirmado')} className="border px-1 bg-green-100">confirmado</button></span></div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {msg && <div className="text-xs text-blue-700">{msg}</div>}
    </fieldset></UiTaskWorkspace>
  );
}
