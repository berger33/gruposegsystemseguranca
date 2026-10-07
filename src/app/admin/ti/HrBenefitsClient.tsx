"use client";
import UiEmployeePicker from "@/components/ui/UiEmployeePicker";
import UiTaskWorkspace from "@/components/ui/UiTaskWorkspace";
import {workspaceResponse} from "@/lib/workspace-response";
import { useEffect, useRef, useState } from "react";

type BenefitCatalog={ id:string; name:string; type:string; provider_name?:string; cost?:string; eligibility_rules?:any; version:number; approval_status:string; validity_start?:string; validity_end?:string; };
type Enrollment={ id:string; employee_id:string; employee_name?:string; benefit_id:string; benefit_name?:string; competence:string; enrollment_date:string; termination_date?:string; status:string; is_eligible:boolean; created_at:string; };
type BenefitRequest={ id:string; employee_id:string; benefit_id:string; request_type:string; competence?:string; reason:string; status:string; created_at:string; };
type Conference={ id:string; competence:string; benefit_id?:string; status:string; total_enrollments:number; total_requests:number; divergences_count:number; notes?:string; };
type BenefitExport={ id:string; conference_id?:string; benefit_id?:string; competence:string; provider_name?:string; export_type:string; status:string; protocol_number?:string; created_at:string; };
type AdvancePolicy={ id:string; name:string; type:string; min_amount:string; max_amount:string; requires_approval:boolean; approver_role:string; max_installments:number; version:number; approval_status:string; };
type AdvanceRequest={ id:string; employee_id:string; employee_name?:string; type:string; competence:string; amount:string; installments:number; reason:string; receipt_url?:string; status:string; financial_status:string; financial_protocol?:string; paid_amount?:string; created_at:string; };
type OccRequirement={ id:string; cargo:string; exam_type:string; validity_days:number; is_required:boolean; description?:string; };
type OccAgenda={ id:string; employee_id:string; employee_name?:string; exam_type:string; scheduled_date:string; due_date:string; status:string; is_fit_for_duty?:boolean; aptidao_operacional?:string; next_due_date?:string; result_summary?:string; };
type OccDocument={ id:string; employee_id:string; agenda_id?:string; doc_type:string; title:string; file_url?:string; validity_start?:string; validity_end?:string; status:string; is_restricted:boolean; created_at:string; };
type IntegrationExport={ id:string; employee_id?:string; integration_type:string; export_type:string; competence?:string; status:string; protocol_number?:string; is_protocol_valid:boolean; provider_name?:string; error_message?:string; created_at:string; };
type IntegrationReceipt={ id:string; export_id:string; receipt_type:string; protocol_number:string; status:string; is_valid:boolean; received_at:string; };
type IntegrationError={ id:string; export_id:string; error_code?:string; error_message:string; correction_required:boolean; corrected_at?:string; };

export default function HrBenefitsClient(){
 const [workspaceLoading,setWorkspaceLoading]=useState(false);
 const operation=useRef(false);const [operationBusy,setOperationBusy]=useState(false);
  const [catalog,setCatalog]=useState<BenefitCatalog[]>([]);
  const [enrollments,setEnrollments]=useState<Enrollment[]>([]);
  const [requests,setRequests]=useState<BenefitRequest[]>([]);
  const [conferences,setConferences]=useState<Conference[]>([]);
  const [exports,setExports]=useState<BenefitExport[]>([]);
  const [advPolicies,setAdvPolicies]=useState<AdvancePolicy[]>([]);
  const [advRequests,setAdvRequests]=useState<AdvanceRequest[]>([]);
  const [occReqs,setOccReqs]=useState<OccRequirement[]>([]);
  const [occAgendas,setOccAgendas]=useState<OccAgenda[]>([]);
  const [occDocs,setOccDocs]=useState<OccDocument[]>([]);
  const [intExports,setIntExports]=useState<IntegrationExport[]>([]);
  const [intReceipts,setIntReceipts]=useState<IntegrationReceipt[]>([]);
  const [intErrors,setIntErrors]=useState<IntegrationError[]>([]);

  const [catalogForm,setCatalogForm]=useState({ name:"", type:"vale_transporte", provider_name:"", cost:"200", validity_start:"2026-01-01", validity_end:"2026-12-31", eligibility_rules:'{"employment_types":["clt"]}' });
  const [enrollForm,setEnrollForm]=useState({ employee_id:"", benefit_id:"", competence:"2026-09", enrollment_date:"2026-09-01", termination_date:"", notes:"" });
  const [reqForm,setReqForm]=useState({ employee_id:"", benefit_id:"", request_type:"inscricao", competence:"2026-09", reason:"Solicitação benefício conforme elegibilidade cargo", requested_data:'{"obs":"primeira via"}' });
  const [confForm,setConfForm]=useState({ competence:"2026-09", benefit_id:"", notes:"Conferência mensal" });
  const [exportForm,setExportForm]=useState({ conference_id:"", benefit_id:"", competence:"2026-09", provider_name:"Fornecedor VT", export_type:"adesao", file_url:"" });
  const [advPolForm,setAdvPolForm]=useState({ name:"", type:"adiantamento_salarial", min_amount:"100", max_amount:"3000", approver_role:"rh", max_installments:"1", description:"" });
  const [advReqForm,setAdvReqForm]=useState({ employee_id:"", type:"adiantamento_salarial", competence:"2026-09", amount:"500", installments:"1", reason:"Adiantamento salarial conforme política até 40%", receipt_url:"", policy_id:"", notes:"" });
  const [occReqForm,setOccReqForm]=useState({ cargo:"vigilante", exam_type:"periodico", validity_days:"365", description:"ASO periódico" });
  const [occAgendaForm,setOccAgendaForm]=useState({ employee_id:"", exam_type:"periodico", scheduled_date:"2026-09-10", due_date:"2026-09-20", responsible_name:"RH", is_fit_for_duty:"", aptidao_operacional:"Apto para função operacional", result_summary:"Resumo operacional aptidão, sem diagnóstico detalhado", notes:"Notas operacionais" });
  const [occDocForm,setOccDocForm]=useState({ employee_id:"", agenda_id:"", doc_type:"aso", title:"ASO Periódico", file_url:"", validity_start:"2026-09-10", validity_end:"2027-09-10", notes:"Documento restrito" });
  const [intExportForm,setIntExportForm]=useState({ employee_id:"", integration_type:"esocial", export_type:"admissao", competence:"2026-09", period_start:"2026-09-01", period_end:"2026-09-30", provider_name:"Contabilidade XPTO", payload:'{"evento":"S-2200","sem_prontuario_completo":true}' });
  const [intReceiptForm,setIntReceiptForm]=useState({ export_id:"", receipt_type:"protocolo", protocol_number:"", payload:'{"protocolo_valido":true,"responsavel":"contador"}', is_valid:"true", notes:"" });
  const [intErrorForm,setIntErrorForm]=useState({ export_id:"", error_code:"E001", error_message:"Erro processamento eSocial campo X", correction_required:"true" });
  const [msg,setMsg]=useState("");

  async function loadAll(){
setWorkspaceLoading(true);
try {
    const c=await fetch('/api/admin/hr/benefit-catalog').then(workspaceResponse); if(c.benefits) setCatalog(c.benefits);
    const en=await fetch('/api/admin/hr/benefit-enrollments').then(workspaceResponse); if(en.enrollments) setEnrollments(en.enrollments);
    const rq=await fetch('/api/admin/hr/benefit-requests').then(workspaceResponse); if(rq.requests) setRequests(rq.requests);
    const cf=await fetch('/api/admin/hr/benefit-conferences').then(workspaceResponse); if(cf.conferences) setConferences(cf.conferences);
    const ex=await fetch('/api/admin/hr/benefit-exports').then(workspaceResponse); if(ex.exports) setExports(ex.exports);
    const ap=await fetch('/api/admin/hr/advance-policies').then(workspaceResponse); if(ap.policies) setAdvPolicies(ap.policies);
    const ar=await fetch('/api/admin/hr/advance-requests').then(workspaceResponse); if(ar.requests) setAdvRequests(ar.requests);
    const or=await fetch('/api/admin/hr/occupational-requirements').then(workspaceResponse); if(or.requirements) setOccReqs(or.requirements);
    const oa=await fetch('/api/admin/hr/occupational-agenda').then(workspaceResponse); if(oa.agendas) setOccAgendas(oa.agendas);
    const od=await fetch('/api/admin/hr/occupational-documents').then(workspaceResponse); if(od.documents) setOccDocs(od.documents);
    const ie=await fetch('/api/admin/hr/integration-exports').then(workspaceResponse); if(ie.exports) setIntExports(ie.exports);
    const ir=await fetch('/api/admin/hr/integration-receipts').then(workspaceResponse); if(ir.receipts) setIntReceipts(ir.receipts);
    const ierr=await fetch('/api/admin/hr/integration-errors').then(workspaceResponse); if(ierr.errors) setIntErrors(ierr.errors);
  } catch(error) {setMsg(error instanceof Error ? error.message : 'Não foi possível carregar esta área. Atualize para tentar novamente.');} finally {setWorkspaceLoading(false);}
}
  useEffect(()=>{ loadAll(); },[]);

  async function createCatalog(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(catalogForm.name.length<3){ setMsg('nome min3'); return; }
    let rules:any={}; try{ rules=JSON.parse(catalogForm.eligibility_rules); }catch{ setMsg('eligibility_rules JSON inválido'); return; }
    const r=await fetch('/api/admin/hr/benefit-catalog',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...catalogForm, cost: parseFloat(catalogForm.cost)||0, eligibility_rules: rules })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Benefício catálogo criado v'+j.benefit.version); setCatalogForm({ name:"", type:"vale_transporte", provider_name:"", cost:"200", validity_start:"2026-01-01", validity_end:"2026-12-31", eligibility_rules:'{"employment_types":["clt"]}' }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchCatalog(id:string, status:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    const reason= status==='rejeitado'? prompt('Motivo rejeição min5')||'': undefined;
    if(status==='rejeitado' && (!reason||reason.length<5)){ setMsg('motivo obrigatório'); return; }
    const r=await fetch('/api/admin/hr/benefit-catalog',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status, rejection_reason: reason })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createEnrollment(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!enrollForm.employee_id || !enrollForm.benefit_id || !enrollForm.competence){ setMsg('employee benefit competence obrigatório'); return; }
    const r=await fetch('/api/admin/hr/benefit-enrollments',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(enrollForm)}); const j=await r.json();
    if(!r.ok){ setMsg(j.error+' '+(j.detail||'')); return; } setMsg('Matrícula benefício criada'); setEnrollForm({ employee_id:"", benefit_id:"", competence:"2026-09", enrollment_date:"2026-09-01", termination_date:"", notes:"" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createBenefitRequest(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!reqForm.employee_id || !reqForm.benefit_id || reqForm.reason.length<10){ setMsg('employee benefit reason min10 obrigatório'); return; }
    let reqData:any={}; try{ reqData=JSON.parse(reqForm.requested_data); }catch{ setMsg('requested_data JSON inválido'); return; }
    const r=await fetch('/api/admin/hr/benefit-requests',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...reqForm, requested_data: reqData })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Solicitação benefício criada'); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchBenefitRequest(id:string, status:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    const reason= status==='rejeitado'? prompt('Motivo rejeição min5')||'': undefined;
    if(status==='rejeitado' && (!reason||reason.length<5)){ setMsg('motivo obrigatório'); return; }
    const r=await fetch('/api/admin/hr/benefit-requests',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status, rejection_reason: reason })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createConference(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!confForm.competence){ setMsg('competence obrigatório'); return; }
    const r=await fetch('/api/admin/hr/benefit-conferences',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(confForm)}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Conferência criada totalEnroll '+j.conference.total_enrollments+' diverg '+j.conference.divergences_count); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchConference(id:string, status:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    const r=await fetch('/api/admin/hr/benefit-conferences',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createExport(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!exportForm.competence){ setMsg('competence obrigatório'); return; }
    const r=await fetch('/api/admin/hr/benefit-exports',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(exportForm)}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Exportação fornecedor criada'); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchExport(id:string, status:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    const r=await fetch('/api/admin/hr/benefit-exports',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createAdvPolicy(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(advPolForm.name.length<3){ setMsg('nome min3'); return; }
    const r=await fetch('/api/admin/hr/advance-policies',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...advPolForm, min_amount: parseFloat(advPolForm.min_amount)||0, max_amount: parseFloat(advPolForm.max_amount)||0, max_installments: parseInt(advPolForm.max_installments)||1 })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Política adiantamento criada v'+j.policy.version); setAdvPolForm({ name:"", type:"adiantamento_salarial", min_amount:"100", max_amount:"3000", approver_role:"rh", max_installments:"1", description:"" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchAdvPolicy(id:string, status:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    const reason= status==='rejeitado'? prompt('Motivo rejeição min5')||'': undefined;
    if(status==='rejeitado' && (!reason||reason.length<5)){ setMsg('motivo obrigatório'); return; }
    const r=await fetch('/api/admin/hr/advance-policies',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status, rejection_reason: reason })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createAdvRequest(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!advReqForm.employee_id || advReqForm.reason.length<10){ setMsg('employee_id reason min10 obrigatório'); return; }
    const r=await fetch('/api/admin/hr/advance-requests',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...advReqForm, amount: parseFloat(advReqForm.amount)||0, installments: parseInt(advReqForm.installments)||1 })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error+' '+(j.detail||'')); return; } setMsg('Adiantamento/reembolso solicitado prevenção duplicidade'); setAdvReqForm({ employee_id:"", type:"adiantamento_salarial", competence:"2026-09", amount:"500", installments:"1", reason:"Adiantamento salarial conforme política até 40%", receipt_url:"", policy_id:"", notes:"" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchAdvRequest(id:string, status:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    const reason= status==='rejeitado'? prompt('Motivo rejeição min5')||'': undefined;
    const paid= status==='pago'? prompt('Valor pago')||'': undefined;
    if(status==='rejeitado' && (!reason||reason.length<5)){ setMsg('motivo obrigatório'); return; }
    const r=await fetch('/api/admin/hr/advance-requests',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status, rejection_reason: reason, paid_amount: paid? parseFloat(paid): undefined, financial_status: status==='aprovado'? 'enviado': status==='pago'? 'confirmado': undefined })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createOccReq(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!occReqForm.cargo || !occReqForm.exam_type){ setMsg('cargo exam_type obrigatório'); return; }
    const r=await fetch('/api/admin/hr/occupational-requirements',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...occReqForm, validity_days: parseInt(occReqForm.validity_days)||365 })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Requisito saúde ocupacional criado'); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createOccAgenda(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!occAgendaForm.employee_id || !occAgendaForm.exam_type){ setMsg('employee_id exam_type obrigatório'); return; }
    const payload={ ...occAgendaForm, is_fit_for_duty: occAgendaForm.is_fit_for_duty===''? undefined : occAgendaForm.is_fit_for_duty==='true' };
    const r=await fetch('/api/admin/hr/occupational-agenda',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Agenda saúde ocupacional criada vencimento '+j.agenda.next_due_date); setOccAgendaForm({ employee_id:"", exam_type:"periodico", scheduled_date:"2026-09-10", due_date:"2026-09-20", responsible_name:"RH", is_fit_for_duty:"", aptidao_operacional:"Apto para função operacional", result_summary:"Resumo operacional aptidão, sem diagnóstico detalhado", notes:"Notas operacionais" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchOccAgenda(id:string, status:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    const r=await fetch('/api/admin/hr/occupational-agenda',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createOccDoc(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!occDocForm.employee_id || !occDocForm.title){ setMsg('employee_id title obrigatório'); return; }
    const r=await fetch('/api/admin/hr/occupational-documents',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(occDocForm)}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Documento saúde restrito criado'); setOccDocForm({ employee_id:"", agenda_id:"", doc_type:"aso", title:"ASO Periódico", file_url:"", validity_start:"2026-09-10", validity_end:"2027-09-10", notes:"Documento restrito" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createIntExport(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!intExportForm.integration_type || !intExportForm.export_type){ setMsg('integration_type export_type obrigatório'); return; }
    let payload:any={}; try{ payload=JSON.parse(intExportForm.payload); }catch{ setMsg('payload JSON inválido'); return; }
    const r=await fetch('/api/admin/hr/integration-exports',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...intExportForm, payload })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error+' '+(j.detail||'')); return; } setMsg('Exportação contabilidade/SST criada'); setIntExportForm({ employee_id:"", integration_type:"esocial", export_type:"admissao", competence:"2026-09", period_start:"2026-09-01", period_end:"2026-09-30", provider_name:"Contabilidade XPTO", payload:'{"evento":"S-2200","sem_prontuario_completo":true}' }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchIntExport(id:string, status:string, protocol?:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    const proto= protocol || (status==='enviado_com_protocolo'? prompt('Protocolo válido min5 do responsável/provedor')||'' : '');
    if((status==='enviado_com_protocolo'||status==='processado') && (!proto||proto.length<5)){ setMsg('protocolo obrigatório para eSocial'); return; }
    const r=await fetch('/api/admin/hr/integration-exports',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status, protocol_number: proto||undefined, is_protocol_valid: proto? true: undefined, provider_response: proto? { protocolo_valido:true, responsavel:'contador', protocolo: proto }: undefined })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error+' '+(j.detail||'')); return; } loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createIntReceipt(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!intReceiptForm.export_id || !intReceiptForm.protocol_number){ setMsg('export_id protocol_number obrigatório'); return; }
    let payload:any={}; try{ payload=JSON.parse(intReceiptForm.payload); }catch{ setMsg('payload JSON inválido'); return; }
    const r=await fetch('/api/admin/hr/integration-receipts',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...intReceiptForm, payload, is_valid: intReceiptForm.is_valid==='true' })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Recibo protocolo válido registrado'); setIntReceiptForm({ export_id:"", receipt_type:"protocolo", protocol_number:"", payload:'{"protocolo_valido":true,"responsavel":"contador"}', is_valid:"true", notes:"" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function createIntError(){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    if(!intErrorForm.export_id || intErrorForm.error_message.length<5){ setMsg('export_id error_message min5 obrigatório'); return; }
    const r=await fetch('/api/admin/hr/integration-errors',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...intErrorForm, correction_required: intErrorForm.correction_required==='true' })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Erro integração registrado'); setIntErrorForm({ export_id:"", error_code:"E001", error_message:"Erro processamento eSocial campo X", correction_required:"true" }); loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}
  async function patchIntError(id:string){
if(operation.current)return;operation.current=true;setOperationBusy(true);
try {
    const notes=prompt('Notas correção')||'Corrigido campo X';
    const r=await fetch('/api/admin/hr/integration-errors',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, correction_notes: notes })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  } catch(error){setMsg(error instanceof Error ? error.message : 'Operação não concluída.');} finally{operation.current=false;setOperationBusy(false);}
}

  return (
    <UiTaskWorkspace className="border rounded p-4 space-y-6 bg-white mt-6">
<fieldset disabled={operationBusy} aria-label="Processos desta área" style={{border:0,padding:0,margin:0,minWidth:0}}>
{operationBusy&&<p role="status">Salvando alteração…</p>}
{workspaceLoading && <p role="status">Carregando informações desta área…</p>}
      <h3 className="font-semibold">HR-13 Benefícios elegibilidade conferência exportação fornecedor + HR-14 Adiantamentos/reembolsos alçada comprovantes financeiro duplicidade + HR-15 Saúde ocupacional agenda vencimentos documentos restritos + HR-16 Integração contabilidade/SST recibos erros correção protocolo válido</h3>
      <p className="text-xs text-gray-600">Benefícios elegibilidade solicitações conferência alterações período exportação fornecedor, adiantamentos/reembolsos alçada comprovantes integração financeiro prevenção duplicidade UNIQUE(employee,competence,type,amount) 30d, saúde ocupacional agenda vencimentos documentos necessários acesso restrito is_restricted true não replicar prontuário completo no cadastro comum apenas aptidão operacional, integração contabilidade/SST recibos processamento erros correção não declarar eSocial sem protocolo válido responsável/provedor.</p>
      <button onClick={loadAll} className="border px-2 text-xs">recarregar tudo</button>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Benefício catálogo versionado ({catalog.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>nome <input value={catalogForm.name} onChange={e=>setCatalogForm({...catalogForm,name:e.target.value})} placeholder="nome min3" className="border p-1" /></label>
              <label>Tipo<select value={catalogForm.type} onChange={e=>setCatalogForm({...catalogForm,type:e.target.value})} className="border p-1"><option value="vale_transporte">vale_transporte</option><option value="vale_refeicao">vale_refeicao</option><option value="vale_alimentacao">vale_alimentacao</option><option value="plano_saude">plano_saude</option><option value="plano_odontologico">plano_odontologico</option><option value="seguro_vida">seguro_vida</option><option value="auxilio_creche">auxilio_creche</option><option value="auxilio_educacao">auxilio_educacao</option><option value="outro">outro</option></select></label>
              <label>fornecedor <input value={catalogForm.provider_name} onChange={e=>setCatalogForm({...catalogForm,provider_name:e.target.value})} placeholder="fornecedor" className="border p-1" /></label>
              <label>custo <input value={catalogForm.cost} onChange={e=>setCatalogForm({...catalogForm,cost:e.target.value})} type="number" step="0.01" placeholder="custo" className="border p-1" /></label>
              <input value={catalogForm.validity_start} onChange={e=>setCatalogForm({...catalogForm,validity_start:e.target.value})} type="date" className="border p-1" />
              <input value={catalogForm.validity_end} onChange={e=>setCatalogForm({...catalogForm,validity_end:e.target.value})} type="date" className="border p-1" />
              <textarea value={catalogForm.eligibility_rules} onChange={e=>setCatalogForm({...catalogForm,eligibility_rules:e.target.value})} placeholder='elegibilidade JSON {"employment_types":["clt"],"cargos":["vigilante"]}' className="border p-1 col-span-2" rows={2}></textarea>
            </div>
            <button onClick={createCatalog} className="bg-blue-600 text-white px-2 py-1">criar benefício catálogo versionado</button>
          </div>
          <div className="max-h-32 overflow-auto border divide-y text-xs">
            {catalog.map(b=>(
              <div key={b.id} className="p-1 flex justify-between"><span><b>{b.name}</b> v{b.version} {b.type} {b.provider_name||''} R${b.cost||0} status {b.approval_status} valid {b.validity_start?.slice(0,10)}-{`>`} {b.validity_end?.slice(0,10)||'∞'}<br/><span className="text-gray-500">{JSON.stringify(b.eligibility_rules||{}).slice(0,80)}</span></span><span className="flex flex-col gap-1"><button onClick={()=>patchCatalog(b.id,'aprovado')} className="border px-1 bg-green-100">aprovar</button><button onClick={()=>patchCatalog(b.id,'rejeitado')} className="border px-1 bg-red-100">rejeitar</button></span></div>
            ))}
          </div>

          <h4 className="font-medium text-sm">Matrículas benefício competência ({enrollments.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>employee_id <UiEmployeePicker value={enrollForm.employee_id} onChange={e=>setEnrollForm({...enrollForm,employee_id:e.target.value})} placeholder="employee_id" className="border p-1" /></label>
              <label>benefit_id aprovado <input value={enrollForm.benefit_id} onChange={e=>setEnrollForm({...enrollForm,benefit_id:e.target.value})} placeholder="benefit_id aprovado" className="border p-1" /></label>
              <label>competence YYYY-MM <input value={enrollForm.competence} onChange={e=>setEnrollForm({...enrollForm,competence:e.target.value})} placeholder="competence YYYY-MM" className="border p-1" /></label>
              <input value={enrollForm.enrollment_date} onChange={e=>setEnrollForm({...enrollForm,enrollment_date:e.target.value})} type="date" className="border p-1" />
              <input value={enrollForm.termination_date} onChange={e=>setEnrollForm({...enrollForm,termination_date:e.target.value})} type="date" className="border p-1" />
              <label>notas <input value={enrollForm.notes} onChange={e=>setEnrollForm({...enrollForm,notes:e.target.value})} placeholder="notas" className="border p-1" /></label>
            </div>
            <button onClick={createEnrollment} className="bg-black text-white px-2 py-1">criar matrícula benefício competência elegibilidade</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {enrollments.map(en=>(
                <div key={en.id} className="p-1">{en.employee_id.slice(0,8)} {en.employee_name||''} ben {en.benefit_id.slice(0,8)} {en.benefit_name||''} comp {en.competence} {en.enrollment_date?.slice(0,10)} status {en.status} eleg {String(en.is_eligible)}</div>
              ))}
            </div>
          </div>

          <h4 className="font-medium text-sm">Solicitações benefício ({requests.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>employee_id <UiEmployeePicker value={reqForm.employee_id} onChange={e=>setReqForm({...reqForm,employee_id:e.target.value})} placeholder="employee_id" className="border p-1" /></label>
              <label>benefit_id <input value={reqForm.benefit_id} onChange={e=>setReqForm({...reqForm,benefit_id:e.target.value})} placeholder="benefit_id" className="border p-1" /></label>
              <label>Request type<select value={reqForm.request_type} onChange={e=>setReqForm({...reqForm,request_type:e.target.value})} className="border p-1"><option value="inscricao">inscricao</option><option value="alteracao">alteracao</option><option value="cancelamento">cancelamento</option><option value="outro">outro</option></select></label>
              <label>competence YYYY-MM <input value={reqForm.competence} onChange={e=>setReqForm({...reqForm,competence:e.target.value})} placeholder="competence YYYY-MM" className="border p-1" /></label>
              <textarea value={reqForm.reason} onChange={e=>setReqForm({...reqForm,reason:e.target.value})} placeholder="motivo min10" className="border p-1 col-span-2" rows={1}></textarea>
              <textarea value={reqForm.requested_data} onChange={e=>setReqForm({...reqForm,requested_data:e.target.value})} placeholder='requested_data JSON {"obs":"..."}' className="border p-1 col-span-2" rows={1}></textarea>
            </div>
            <button onClick={createBenefitRequest} className="bg-blue-600 text-white px-2 py-1">solicitar benefício</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {requests.map(rq=>(
                <div key={rq.id} className="p-1 flex justify-between"><span>{rq.employee_id.slice(0,8)} ben {rq.benefit_id.slice(0,8)} {rq.request_type} comp {rq.competence||'-'} status {rq.status} {rq.reason.slice(0,30)}</span><span className="flex gap-1"><button onClick={()=>patchBenefitRequest(rq.id,'aprovado')} className="border px-1 bg-green-100">aprovar</button><button onClick={()=>patchBenefitRequest(rq.id,'rejeitado')} className="border px-1 bg-red-100">rejeitar</button></span></div>
              ))}
            </div>
          </div>

          <h4 className="font-medium text-sm">Conferência período ({conferences.length}) alterações por período</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>competence YYYY-MM <input value={confForm.competence} onChange={e=>setConfForm({...confForm,competence:e.target.value})} placeholder="competence YYYY-MM" className="border p-1" /></label>
              <label>benefit_id opcional <input value={confForm.benefit_id} onChange={e=>setConfForm({...confForm,benefit_id:e.target.value})} placeholder="benefit_id opcional" className="border p-1" /></label>
              <label>notas <input value={confForm.notes} onChange={e=>setConfForm({...confForm,notes:e.target.value})} placeholder="notas" className="border p-1 col-span-2" /></label>
            </div>
            <button onClick={createConference} className="bg-black text-white px-2 py-1">conferir benefícios período</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {conferences.map(cf=>(
                <div key={cf.id} className="p-1 flex justify-between"><span>comp {cf.competence} ben {cf.benefit_id?.slice(0,8)||'todos'} status {cf.status} enroll {cf.total_enrollments} req {cf.total_requests} diverg {cf.divergences_count}</span><span className="flex gap-1"><button onClick={()=>patchConference(cf.id,'conferido')} className="border px-1 bg-green-100">conferido</button><button onClick={()=>patchConference(cf.id,'fechado')} className="border px-1">fechar</button></span></div>
              ))}
            </div>
          </div>

          <h4 className="font-medium text-sm">Exportação fornecedor ({exports.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>conference_id <input value={exportForm.conference_id} onChange={e=>setExportForm({...exportForm,conference_id:e.target.value})} placeholder="conference_id" className="border p-1" /></label>
              <label>benefit_id <input value={exportForm.benefit_id} onChange={e=>setExportForm({...exportForm,benefit_id:e.target.value})} placeholder="benefit_id" className="border p-1" /></label>
              <label>competence YYYY-MM <input value={exportForm.competence} onChange={e=>setExportForm({...exportForm,competence:e.target.value})} placeholder="competence YYYY-MM" className="border p-1" /></label>
              <label>fornecedor <input value={exportForm.provider_name} onChange={e=>setExportForm({...exportForm,provider_name:e.target.value})} placeholder="fornecedor" className="border p-1" /></label>
              <label>export_type adesao/cancelamento/alteracao <input value={exportForm.export_type} onChange={e=>setExportForm({...exportForm,export_type:e.target.value})} placeholder="export_type adesao/cancelamento/alteracao" className="border p-1" /></label>
              <label>file_url <input value={exportForm.file_url} onChange={e=>setExportForm({...exportForm,file_url:e.target.value})} placeholder="file_url" className="border p-1" /></label>
            </div>
            <button onClick={createExport} className="bg-blue-600 text-white px-2 py-1">exportar ao fornecedor</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {exports.map(ex=>(
                <div key={ex.id} className="p-1 flex justify-between"><span>comp {ex.competence} ben {ex.benefit_id?.slice(0,8)||'-'} conf {ex.conference_id?.slice(0,8)||'-'} tipo {ex.export_type} status {ex.status} forn {ex.provider_name||''} proto {ex.protocol_number||'-'}</span><span className="flex gap-1"><button onClick={()=>patchExport(ex.id,'gerado')} className="border px-1">gerado</button><button onClick={()=>patchExport(ex.id,'enviado')} className="border px-1 bg-blue-100">enviado</button><button onClick={()=>patchExport(ex.id,'confirmado')} className="border px-1 bg-green-100">confirmado</button></span></div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium text-sm">Adiantamentos políticas alçada ({advPolicies.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>nome <input value={advPolForm.name} onChange={e=>setAdvPolForm({...advPolForm,name:e.target.value})} placeholder="nome min3" className="border p-1" /></label>
              <label>Tipo<select value={advPolForm.type} onChange={e=>setAdvPolForm({...advPolForm,type:e.target.value})} className="border p-1"><option value="adiantamento_salarial">adiantamento_salarial</option><option value="adiantamento_13">adiantamento_13</option><option value="reembolso_despesa">reembolso_despesa</option><option value="reembolso_km">reembolso_km</option><option value="auxilio">auxilio</option><option value="outro">outro</option></select></label>
              <label>min_amount <input value={advPolForm.min_amount} onChange={e=>setAdvPolForm({...advPolForm,min_amount:e.target.value})} type="number" step="0.01" placeholder="min_amount" className="border p-1" /></label>
              <label>max_amount <input value={advPolForm.max_amount} onChange={e=>setAdvPolForm({...advPolForm,max_amount:e.target.value})} type="number" step="0.01" placeholder="max_amount" className="border p-1" /></label>
              <label>approver_role rh/financeiro <input value={advPolForm.approver_role} onChange={e=>setAdvPolForm({...advPolForm,approver_role:e.target.value})} placeholder="approver_role rh/financeiro" className="border p-1" /></label>
              <label>max_installments <input value={advPolForm.max_installments} onChange={e=>setAdvPolForm({...advPolForm,max_installments:e.target.value})} type="number" placeholder="max_installments" className="border p-1" /></label>
              <label>descrição <input value={advPolForm.description} onChange={e=>setAdvPolForm({...advPolForm,description:e.target.value})} placeholder="descrição" className="border p-1 col-span-2" /></label>
            </div>
            <button onClick={createAdvPolicy} className="bg-green-600 text-white px-2 py-1">criar política alçada</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {advPolicies.map(p=>(
                <div key={p.id} className="p-1 flex justify-between"><span><b>{p.name}</b> v{p.version} {p.type} {p.min_amount}-{`>`}{p.max_amount} aprova {String(p.requires_approval)} role {p.approver_role} parc {p.max_installments} status {p.approval_status}</span><span className="flex gap-1"><button onClick={()=>patchAdvPolicy(p.id,'aprovado')} className="border px-1 bg-green-100">aprovar</button><button onClick={()=>patchAdvPolicy(p.id,'rejeitado')} className="border px-1 bg-red-100">rejeitar</button></span></div>
              ))}
            </div>
          </div>

          <h4 className="font-medium text-sm">Adiantamentos/reembolsos ({advRequests.length}) comprovantes financeiro duplicidade</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>employee_id <UiEmployeePicker value={advReqForm.employee_id} onChange={e=>setAdvReqForm({...advReqForm,employee_id:e.target.value})} placeholder="employee_id" className="border p-1" /></label>
              <label>Tipo<select value={advReqForm.type} onChange={e=>setAdvReqForm({...advReqForm,type:e.target.value})} className="border p-1"><option value="adiantamento_salarial">adiantamento_salarial</option><option value="adiantamento_13">adiantamento_13</option><option value="reembolso_despesa">reembolso_despesa</option><option value="reembolso_km">reembolso_km</option><option value="auxilio">auxilio</option><option value="outro">outro</option></select></label>
              <label>competence YYYY-MM <input value={advReqForm.competence} onChange={e=>setAdvReqForm({...advReqForm,competence:e.target.value})} placeholder="competence YYYY-MM" className="border p-1" /></label>
              <label>amount <input value={advReqForm.amount} onChange={e=>setAdvReqForm({...advReqForm,amount:e.target.value})} type="number" step="0.01" placeholder="amount" className="border p-1" /></label>
              <label>installments <input value={advReqForm.installments} onChange={e=>setAdvReqForm({...advReqForm,installments:e.target.value})} type="number" placeholder="installments" className="border p-1" /></label>
              <label>receipt_url comprovante obrigatório reembolso <input value={advReqForm.receipt_url} onChange={e=>setAdvReqForm({...advReqForm,receipt_url:e.target.value})} placeholder="receipt_url comprovante obrigatório reembolso" className="border p-1" /></label>
              <label>policy_id aprovado <input value={advReqForm.policy_id} onChange={e=>setAdvReqForm({...advReqForm,policy_id:e.target.value})} placeholder="policy_id aprovado" className="border p-1" /></label>
              <textarea value={advReqForm.reason} onChange={e=>setAdvReqForm({...advReqForm,reason:e.target.value})} placeholder="motivo min10" className="border p-1 col-span-2" rows={1}></textarea>
              <label>notas <input value={advReqForm.notes} onChange={e=>setAdvReqForm({...advReqForm,notes:e.target.value})} placeholder="notas" className="border p-1 col-span-2" /></label>
            </div>
            <button onClick={createAdvRequest} className="bg-black text-white px-2 py-1">solicitar adiantamento/reembolso prevenção duplicidade</button>
            <div className="max-h-32 overflow-auto border divide-y mt-1">
              {advRequests.map(ar=>(
                <div key={ar.id} className="p-1 flex justify-between"><span>{ar.employee_id.slice(0,8)} {ar.employee_name||''} {ar.type} comp {ar.competence} R${ar.amount} parc {ar.installments} status {ar.status} fin {ar.financial_status} pago R${ar.paid_amount||'-'} proto {ar.financial_protocol||'-'}<br/><span className="text-gray-500">{ar.reason.slice(0,60)} {ar.receipt_url? 'comprovante sim':''}</span></span><span className="flex flex-col gap-1"><button onClick={()=>patchAdvRequest(ar.id,'aprovado')} className="border px-1 bg-green-100">aprovar alçada</button><button onClick={()=>patchAdvRequest(ar.id,'pago')} className="border px-1 bg-blue-100">pago financeiro</button><button onClick={()=>patchAdvRequest(ar.id,'rejeitado')} className="border px-1 bg-red-100">rejeitar</button></span></div>
              ))}
            </div>
          </div>

          <h4 className="font-medium text-sm">Saúde ocupacional requisitos ({occReqs.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>cargo vigilante/porteiro/geral <input value={occReqForm.cargo} onChange={e=>setOccReqForm({...occReqForm,cargo:e.target.value})} placeholder="cargo vigilante/porteiro/geral" className="border p-1" /></label>
              <label>Exam type<select value={occReqForm.exam_type} onChange={e=>setOccReqForm({...occReqForm,exam_type:e.target.value})} className="border p-1"><option value="admissional">admissional</option><option value="periodico">periodico</option><option value="retorno">retorno</option><option value="mudanca_funcao">mudanca_funcao</option><option value="demissional">demissional</option><option value="complementar">complementar</option><option value="pcd">pcd</option><option value="outro">outro</option></select></label>
              <label>validity_days <input value={occReqForm.validity_days} onChange={e=>setOccReqForm({...occReqForm,validity_days:e.target.value})} type="number" placeholder="validity_days" className="border p-1" /></label>
              <label>descrição <input value={occReqForm.description} onChange={e=>setOccReqForm({...occReqForm,description:e.target.value})} placeholder="descrição" className="border p-1" /></label>
            </div>
            <button onClick={createOccReq} className="bg-blue-600 text-white px-2 py-1">criar requisito cargo exame validade</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {occReqs.map(r=>(
                <div key={r.id} className="p-1">{r.cargo} {r.exam_type} valid {r.validity_days}d req {String(r.is_required)} {r.description||''}</div>
              ))}
            </div>
          </div>

          <h4 className="font-medium text-sm">Agenda saúde vencimentos ({occAgendas.length}) acesso restrito aptidão operacional</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>employee_id <UiEmployeePicker value={occAgendaForm.employee_id} onChange={e=>setOccAgendaForm({...occAgendaForm,employee_id:e.target.value})} placeholder="employee_id" className="border p-1" /></label>
              <label>Exam type<select value={occAgendaForm.exam_type} onChange={e=>setOccAgendaForm({...occAgendaForm,exam_type:e.target.value})} className="border p-1"><option value="admissional">admissional</option><option value="periodico">periodico</option><option value="retorno">retorno</option><option value="mudanca_funcao">mudanca_funcao</option><option value="demissional">demissional</option><option value="complementar">complementar</option><option value="outro">outro</option></select></label>
              <input value={occAgendaForm.scheduled_date} onChange={e=>setOccAgendaForm({...occAgendaForm,scheduled_date:e.target.value})} type="date" className="border p-1" />
              <input value={occAgendaForm.due_date} onChange={e=>setOccAgendaForm({...occAgendaForm,due_date:e.target.value})} type="date" className="border p-1" />
              <label>responsável <input value={occAgendaForm.responsible_name} onChange={e=>setOccAgendaForm({...occAgendaForm,responsible_name:e.target.value})} placeholder="responsável" className="border p-1" /></label>
              <label>Is fit for duty<select value={occAgendaForm.is_fit_for_duty} onChange={e=>setOccAgendaForm({...occAgendaForm,is_fit_for_duty:e.target.value})} className="border p-1"><option value="">apto?</option><option value="true">apto</option><option value="false">inapto</option></select></label>
              <label>aptidão operacional não diagnóstico <input value={occAgendaForm.aptidao_operacional} onChange={e=>setOccAgendaForm({...occAgendaForm,aptidao_operacional:e.target.value})} placeholder="aptidão operacional não diagnóstico" className="border p-1" /></label>
              <label>resumo operacional sem prontuário completo <input value={occAgendaForm.result_summary} onChange={e=>setOccAgendaForm({...occAgendaForm,result_summary:e.target.value})} placeholder="resumo operacional sem prontuário completo" className="border p-1" /></label>
              <label>notas operacionais <input value={occAgendaForm.notes} onChange={e=>setOccAgendaForm({...occAgendaForm,notes:e.target.value})} placeholder="notas operacionais" className="border p-1 col-span-2" /></label>
            </div>
            <button onClick={createOccAgenda} className="bg-black text-white px-2 py-1">agendar exame saúde vencimento aptidão operacional</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {occAgendas.map(a=>(
                <div key={a.id} className="p-1 flex justify-between"><span>{a.employee_id.slice(0,8)} {a.employee_name||''} {a.exam_type} ag {a.scheduled_date?.slice(0,10)} venc {a.due_date?.slice(0,10)} status {a.status} apto {String(a.is_fit_for_duty)} aptidão {a.aptidao_operacional||''} prox {a.next_due_date?.slice(0,10)||'-'}<br/><span className="text-gray-500">{a.result_summary||''}</span></span><span className="flex flex-col gap-1"><button onClick={()=>patchOccAgenda(a.id,'realizado')} className="border px-1 bg-green-100">realizado</button><button onClick={()=>patchOccAgenda(a.id,'vencido')} className="border px-1 bg-red-100">vencido</button></span></div>
              ))}
            </div>
          </div>

          <h4 className="font-medium text-sm">Documentos saúde restritos ({occDocs.length}) não replicar prontuário completo</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <label>employee_id <UiEmployeePicker value={occDocForm.employee_id} onChange={e=>setOccDocForm({...occDocForm,employee_id:e.target.value})} placeholder="employee_id" className="border p-1" /></label>
              <label>agenda_id <input value={occDocForm.agenda_id} onChange={e=>setOccDocForm({...occDocForm,agenda_id:e.target.value})} placeholder="agenda_id" className="border p-1" /></label>
              <label>Doc type<select value={occDocForm.doc_type} onChange={e=>setOccDocForm({...occDocForm,doc_type:e.target.value})} className="border p-1"><option value="aso">aso</option><option value="atestado">atestado</option><option value="exame">exame</option><option value="laudo">laudo</option><option value="comprovante">comprovante</option><option value="carteira_vacinacao">carteira_vacinacao</option><option value="outro">outro</option></select></label>
              <label>título <input value={occDocForm.title} onChange={e=>setOccDocForm({...occDocForm,title:e.target.value})} placeholder="título min3" className="border p-1" /></label>
              <label>file_url restrito <input value={occDocForm.file_url} onChange={e=>setOccDocForm({...occDocForm,file_url:e.target.value})} placeholder="file_url restrito" className="border p-1" /></label>
              <input value={occDocForm.validity_start} onChange={e=>setOccDocForm({...occDocForm,validity_start:e.target.value})} type="date" className="border p-1" />
              <input value={occDocForm.validity_end} onChange={e=>setOccDocForm({...occDocForm,validity_end:e.target.value})} type="date" className="border p-1" />
              <label>notas sem prontuário completo <input value={occDocForm.notes} onChange={e=>setOccDocForm({...occDocForm,notes:e.target.value})} placeholder="notas sem prontuário completo" className="border p-1 col-span-2" /></label>
            </div>
            <button onClick={createOccDoc} className="bg-blue-600 text-white px-2 py-1">enviar documento saúde restrito</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {occDocs.map(d=>(
                <div key={d.id} className="p-1">{d.employee_id.slice(0,8)} agenda {d.agenda_id?.slice(0,8)||'-'} {d.doc_type} {d.title} valid {d.validity_start?.slice(0,10)||'-'}{`->`}{d.validity_end?.slice(0,10)||'∞'} status {d.status} restrito {String(d.is_restricted)}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Integração contabilidade/SST exportação ({intExports.length}) recibos ({intReceipts.length}) erros ({intErrors.length}) protocolo válido obrigatório eSocial</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-3 gap-1">
              <label>employee_id opcional <UiEmployeePicker value={intExportForm.employee_id} onChange={e=>setIntExportForm({...intExportForm,employee_id:e.target.value})} placeholder="employee_id opcional" className="border p-1" /></label>
              <label>Integration type<select value={intExportForm.integration_type} onChange={e=>setIntExportForm({...intExportForm,integration_type:e.target.value})} className="border p-1"><option value="contabilidade">contabilidade</option><option value="esocial">esocial</option><option value="sst">sst</option><option value="folha">folha</option><option value="ponto">ponto</option><option value="financeiro">financeiro</option><option value="outro">outro</option></select></label>
              <label>Export type<select value={intExportForm.export_type} onChange={e=>setIntExportForm({...intExportForm,export_type:e.target.value})} className="border p-1"><option value="admissao">admissao</option><option value="desligamento">desligamento</option><option value="afastamento">afastamento</option><option value="ferias">ferias</option><option value="folha">folha</option><option value="cat">cat</option><option value="aso">aso</option><option value="exame">exame</option><option value="beneficio">beneficio</option><option value="outro">outro</option></select></label>
              <label>competence YYYY-MM <input value={intExportForm.competence} onChange={e=>setIntExportForm({...intExportForm,competence:e.target.value})} placeholder="competence YYYY-MM" className="border p-1" /></label>
              <input value={intExportForm.period_start} onChange={e=>setIntExportForm({...intExportForm,period_start:e.target.value})} type="date" className="border p-1" />
              <input value={intExportForm.period_end} onChange={e=>setIntExportForm({...intExportForm,period_end:e.target.value})} type="date" className="border p-1" />
              <label>provedor/responsável contabilidade/SST <input value={intExportForm.provider_name} onChange={e=>setIntExportForm({...intExportForm,provider_name:e.target.value})} placeholder="provedor/responsável contabilidade/SST" className="border p-1" /></label>
              <textarea value={intExportForm.payload} onChange={e=>setIntExportForm({...intExportForm,payload:e.target.value})} placeholder='payload JSON {"evento":"S-2200","sem_prontuario_completo":true}' className="border p-1 col-span-3" rows={2}></textarea>
            </div>
            <button onClick={createIntExport} className="bg-blue-600 text-white px-2 py-1">criar exportação contabilidade/SST pendente</button>
            <div className="max-h-32 overflow-auto border divide-y mt-1">
              {intExports.map(ie=>(
                <div key={ie.id} className="p-1 flex justify-between"><span>{ie.employee_id?.slice(0,8)||'geral'} {ie.integration_type}/{ie.export_type} comp {ie.competence||'-'} status {ie.status} proto {ie.protocol_number||'-'} valid {String(ie.is_protocol_valid)} prov {ie.provider_name||''} err {ie.error_message?.slice(0,40)||''}</span><span className="flex flex-col gap-1"><button onClick={()=>patchIntExport(ie.id,'em_processamento')} className="border px-1">processando</button><button onClick={()=>patchIntExport(ie.id,'enviado_com_protocolo')} className="border px-1 bg-green-100">enviar com protocolo válido</button><button onClick={()=>patchIntExport(ie.id,'falhou')} className="border px-1 bg-red-100">falhou</button><button onClick={()=>patchIntExport(ie.id,'processado')} className="border px-1">processado</button></span></div>
              ))}
            </div>

            <div className="border-t pt-1 mt-2">
              <h5 className="font-medium">Recibos protocolo válido responsável/provedor</h5>
              <div className="grid grid-cols-3 gap-1">
                <label>export_id UUID <input value={intReceiptForm.export_id} onChange={e=>setIntReceiptForm({...intReceiptForm,export_id:e.target.value})} placeholder="export_id UUID" className="border p-1" /></label>
                <label>Receipt type<select value={intReceiptForm.receipt_type} onChange={e=>setIntReceiptForm({...intReceiptForm,receipt_type:e.target.value})} className="border p-1"><option value="protocolo">protocolo</option><option value="recibo">recibo</option><option value="erro">erro</option><option value="comprovante">comprovante</option></select></label>
                <label>protocol_number <input value={intReceiptForm.protocol_number} onChange={e=>setIntReceiptForm({...intReceiptForm,protocol_number:e.target.value})} placeholder="protocol_number min5" className="border p-1" /></label>
                <textarea value={intReceiptForm.payload} onChange={e=>setIntReceiptForm({...intReceiptForm,payload:e.target.value})} placeholder='payload JSON {"protocolo_valido":true,"responsavel":"contador"}' className="border p-1 col-span-2" rows={1}></textarea>
                <label>Is valid<select value={intReceiptForm.is_valid} onChange={e=>setIntReceiptForm({...intReceiptForm,is_valid:e.target.value})} className="border p-1"><option value="true">protocolo válido</option><option value="false">inválido</option></select></label>
                <label>notas <input value={intReceiptForm.notes} onChange={e=>setIntReceiptForm({...intReceiptForm,notes:e.target.value})} placeholder="notas" className="border p-1" /></label>
              </div>
              <button onClick={createIntReceipt} className="bg-green-600 text-white px-2 py-1">registrar recibo protocolo válido</button>
              <div className="max-h-20 overflow-auto border divide-y mt-1">
                {intReceipts.map(ir=>(
                  <div key={ir.id} className="p-1">exp {ir.export_id.slice(0,8)} tipo {ir.receipt_type} proto {ir.protocol_number} status {ir.status} valid {String(ir.is_valid)} {ir.received_at?.slice(0,10)}</div>
                ))}
              </div>
            </div>

            <div className="border-t pt-1 mt-2">
              <h5 className="font-medium">Erros processamento correção</h5>
              <div className="grid grid-cols-3 gap-1">
                <label>export_id UUID <input value={intErrorForm.export_id} onChange={e=>setIntErrorForm({...intErrorForm,export_id:e.target.value})} placeholder="export_id UUID" className="border p-1" /></label>
                <label>error_code <input value={intErrorForm.error_code} onChange={e=>setIntErrorForm({...intErrorForm,error_code:e.target.value})} placeholder="error_code" className="border p-1" /></label>
                <label>error_message <input value={intErrorForm.error_message} onChange={e=>setIntErrorForm({...intErrorForm,error_message:e.target.value})} placeholder="error_message min5" className="border p-1" /></label>
                <label>Correction required<select value={intErrorForm.correction_required} onChange={e=>setIntErrorForm({...intErrorForm,correction_required:e.target.value})} className="border p-1"><option value="true">correção necessária</option><option value="false">sem correção</option></select></label>
              </div>
              <button onClick={createIntError} className="bg-red-600 text-white px-2 py-1">registrar erro processamento</button>
              <div className="max-h-20 overflow-auto border divide-y mt-1">
                {intErrors.map(ie=>(
                  <div key={ie.id} className="p-1 flex justify-between"><span>exp {ie.export_id.slice(0,8)} code {ie.error_code||'-'} {ie.error_message.slice(0,50)} corr req {String(ie.correction_required)} corrigido {ie.corrected_at?.slice(0,10)||'-'}</span><button onClick={()=>patchIntError(ie.id)} className="border px-1 bg-yellow-100">corrigido</button></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {msg && <div className="text-xs text-blue-700">{msg}</div>}
    </fieldset></UiTaskWorkspace>
  );
}
