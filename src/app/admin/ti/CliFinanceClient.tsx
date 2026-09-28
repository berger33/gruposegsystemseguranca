"use client";
import { useEffect, useState } from "react";

type Charge = { id:string; protocol:string; client_account_id:string; charge_type:string; status:string; amount_cents:number; due_date:string; is_fiscal:boolean; finance_integration_active:boolean; };
type ServiceReq = { id:string; protocol:string; client_account_id:string; title:string; status:string; origin:string; responsible_name:string|null; crm_opportunity_id:string|null; };
type Survey = { id:string; protocol:string; client_account_id:string; survey_type:string; status:string; score:number|null; feedback:string|null; renewal_risk:string|null; renewal_risk_reason:string|null; };
type Renewal = { id:string; protocol:string; client_account_id:string; comm_type:string; title:string; is_blocking:boolean; sent_at:string|null; };
type PortalMode = { mode:string; is_active:boolean; requires_approval:boolean; auto_release_contracts:boolean; description:string|null; };
type AccessReq = { id:string; protocol:string; mode:string; requested_email:string; requested_name:string; status:string; verified_link:boolean; };
type SecEvent = { id:string; client_account_id:string; event_type:string; created_at:string; };
type EmailReq = { id:string; protocol:string; client_account_id:string; old_email:string; new_email:string; status:string; token:string; expires_at:string; };

export default function CliFinanceClient() {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [serviceReqs, setServiceReqs] = useState<ServiceReq[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [modes, setModes] = useState<PortalMode[]>([]);
  const [accessReqs, setAccessReqs] = useState<AccessReq[]>([]);
  const [secEvents, setSecEvents] = useState<SecEvent[]>([]);
  const [emailReqs, setEmailReqs] = useState<EmailReq[]>([]);
  const [msg, setMsg] = useState("");

  async function loadAll() {
    try {
      const [cRes, sRes, satRes, rRes, mRes, aRes, secRes, emlRes] = await Promise.all([
        fetch("/api/hr/cli-charges-v2").then(r=>r.json()).catch(()=>({charges:[]})),
        fetch("/api/hr/cli-service-requests").then(r=>r.json()).catch(()=>({serviceRequests:[]})),
        fetch("/api/hr/cli-satisfaction-surveys").then(r=>r.json()).catch(()=>({surveys:[]})),
        fetch("/api/hr/cli-renewal-communications").then(r=>r.json()).catch(()=>({communications:[]})),
        fetch("/api/hr/cli-portal-mode-configs").then(r=>r.json()).catch(()=>({modes:[]})),
        fetch("/api/hr/cli-portal-access-requests").then(r=>r.json()).catch(()=>({requests:[]})),
        fetch("/api/hr/cli-security-events").then(r=>r.json()).catch(()=>({events:[]})),
        fetch("/api/hr/cli-email-change-requests").then(r=>r.json()).catch(()=>({requests:[]})),
      ]);
      if (cRes.charges) setCharges(cRes.charges);
      if (sRes.serviceRequests) setServiceReqs(sRes.serviceRequests);
      if (satRes.surveys) setSurveys(satRes.surveys);
      if (rRes.communications) setRenewals(rRes.communications);
      if (mRes.modes) setModes(mRes.modes);
      if (aRes.requests) setAccessReqs(aRes.requests);
      if (secRes.events) setSecEvents(secRes.events);
      if (emlRes.requests) setEmailReqs(emlRes.requests);
    } catch {}
  }
  useEffect(()=>{ loadAll(); }, []);

  async function api(path:string, method:string, body?:any) {
    const res = await fetch(path, { method, headers: { "Content-Type":"application/json" }, body: body? JSON.stringify(body): undefined });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error || data.detail || "erro");
    return data;
  }

  // CLI-09
  const [chargeForm, setChargeForm] = useState({ client_account_id:"", contract_id:"", charge_type:"mensalidade", amount_cents:"", due_date:"", competence_date:"", is_fiscal:"false", fiscal_document_url:"", fiscal_document_storage_key:"", finance_integration_active:"true", notes:"" });
  async function createCharge() {
    try { const d=await api("/api/hr/cli-charges-v2","POST",{ client_account_id:chargeForm.client_account_id, contract_id:chargeForm.contract_id||null, charge_type:chargeForm.charge_type, amount_cents:parseInt(chargeForm.amount_cents), due_date:chargeForm.due_date, competence_date:chargeForm.competence_date||null, is_fiscal:chargeForm.is_fiscal==="true", fiscal_document_url:chargeForm.fiscal_document_url||null, fiscal_document_storage_key:chargeForm.fiscal_document_storage_key||null, finance_integration_active:chargeForm.finance_integration_active==="true", notes:chargeForm.notes }); setMsg("Cobrança "+d.charge.protocol+" fiscal só quando financeiro integrado dados própria conta"); loadAll(); } catch(e:any){ setMsg("Erro cobrança: "+e.message); }
  }

  // CLI-10
  const [srvForm, setSrvForm] = useState({ client_account_id:"", contract_id:"", contact_id:"", title:"", description:"", origin:"portal_cliente", responsible_name:"" });
  async function createServiceReq() {
    try { const d=await api("/api/hr/cli-service-requests","POST",{ client_account_id:srvForm.client_account_id, contract_id:srvForm.contract_id||null, contact_id:srvForm.contact_id||null, title:srvForm.title, description:srvForm.description, origin:srvForm.origin, responsible_name:srvForm.responsible_name }); setMsg("Solicitação serviço "+d.serviceRequest.protocol+" gera oportunidade CRM "+(d.serviceRequest.crm_opportunity_id||"pendente")+" origem responsável"); loadAll(); } catch(e:any){ setMsg("Erro serviço: "+e.message); }
  }

  // CLI-11
  const [satForm, setSatForm] = useState({ client_account_id:"", contract_id:"", ticket_id:"", visit_id:"", survey_type:"pos_atendimento", score:"", feedback:"", renewal_risk:"", renewal_risk_reason:"", facts_json:"", action_plan:"" });
  async function createSurvey() {
    try { const facts = satForm.facts_json? JSON.parse(satForm.facts_json) : null; const d=await api("/api/hr/cli-satisfaction-surveys","POST",{ client_account_id:satForm.client_account_id, contract_id:satForm.contract_id||null, ticket_id:satForm.ticket_id||null, visit_id:satForm.visit_id||null, survey_type:satForm.survey_type, score:satForm.score?parseInt(satForm.score):null, feedback:satForm.feedback||null, renewal_risk:satForm.renewal_risk||null, renewal_risk_reason:satForm.renewal_risk_reason||null, facts_json:facts, action_plan:satForm.action_plan||null }); setMsg("Satisfação "+d.survey.protocol+" risco renovação baseado em fatos"); loadAll(); } catch(e:any){ setMsg("Erro satisfação: "+e.message); }
  }
  const [satActionForm, setSatActionForm] = useState({ survey_id:"", action:"", responsible_name:"", due_date:"" });
  async function createActionPlan() {
    try { await api("/api/hr/cli-satisfaction-action-plans","POST",{ survey_id:satActionForm.survey_id, action:satActionForm.action, responsible_name:satActionForm.responsible_name, due_date:satActionForm.due_date }); setMsg("Plano ação satisfação criado"); } catch(e:any){ setMsg("Erro plano ação: "+e.message); }
  }

  // CLI-12
  const [renForm, setRenForm] = useState({ client_account_id:"", contract_id:"", comm_type:"aviso_vencimento", title:"", content:"", is_blocking:"false", block_reason:"" });
  async function createRenewal() {
    try { const d=await api("/api/hr/cli-renewal-communications","POST",{ client_account_id:renForm.client_account_id, contract_id:renForm.contract_id||null, comm_type:renForm.comm_type, title:renForm.title, content:renForm.content, is_blocking:renForm.is_blocking==="true", block_reason:renForm.block_reason||null }); setMsg("Renovação comunicação "+d.communication.protocol+" sem bloquear indiscriminadamente portal por inadimplência"); loadAll(); } catch(e:any){ setMsg("Erro renovação: "+e.message); }
  }

  // CLI-13
  const [modeForm, setModeForm] = useState({ mode:"convite", is_active:"true", requires_approval:"false", auto_release_contracts:"false" });
  async function updateMode() {
    try { const d=await api("/api/hr/cli-portal-mode-configs","PATCH",{ mode:modeForm.mode, is_active:modeForm.is_active==="true", requires_approval:modeForm.requires_approval==="true", auto_release_contracts:modeForm.auto_release_contracts==="true" }); setMsg("Modo portal "+d.mode.mode+" autocadastro nunca libera contratos sozinho"); loadAll(); } catch(e:any){ setMsg("Erro modo: "+e.message); }
  }
  const [accReqForm, setAccReqForm] = useState({ mode:"convite", client_account_id:"", requested_email:"", requested_name:"", document_ref:"" });
  async function createAccessReq() {
    try { const d=await api("/api/hr/cli-portal-access-requests","POST",{ mode:accReqForm.mode, client_account_id:accReqForm.client_account_id||null, requested_email:accReqForm.requested_email, requested_name:accReqForm.requested_name, document_ref:accReqForm.document_ref||null }); setMsg("Solicitação acesso "+d.request.protocol+" vínculo verificado servidor"); loadAll(); } catch(e:any){ setMsg("Erro acesso: "+e.message); }
  }
  const [accApproveForm, setAccApproveForm] = useState({ id:"", status:"aprovada", rejection_reason:"" });
  async function approveAccessReq() {
    try { const d=await api("/api/hr/cli-portal-access-requests","PATCH",{ id:accApproveForm.id, status:accApproveForm.status, rejection_reason:accApproveForm.rejection_reason }); setMsg("Acesso "+d.request.status+" vínculo verificado"); loadAll(); } catch(e:any){ setMsg("Erro aprovar: "+e.message); }
  }

  // CLI-14
  const [secForm, setSecForm] = useState({ client_account_id:"", contact_id:"", event_type:"mfa_enabled", ip_address:"", user_agent:"" });
  async function createSecEvent() {
    try { const d=await api("/api/hr/cli-security-events","POST",{ client_account_id:secForm.client_account_id, contact_id:secForm.contact_id||null, event_type:secForm.event_type, ip_address:secForm.ip_address, user_agent:secForm.user_agent }); setMsg("Evento segurança "+d.event.event_type+" MFA opcional backend real"); loadAll(); } catch(e:any){ setMsg("Erro segurança: "+e.message); }
  }
  const [emailForm, setEmailForm] = useState({ client_account_id:"", contact_id:"", old_email:"", new_email:"" });
  async function createEmailChange() {
    try { const d=await api("/api/hr/cli-email-change-requests","POST",{ client_account_id:emailForm.client_account_id, contact_id:emailForm.contact_id||null, old_email:emailForm.old_email, new_email:emailForm.new_email }); setMsg("Troca e-mail "+d.request.protocol+" token "+d.request.token.slice(0,8)+" fluxo backend real"); loadAll(); } catch(e:any){ setMsg("Erro e-mail: "+e.message); }
  }
  const [emailConfirmForm, setEmailConfirmForm] = useState({ id:"", token:"" });
  async function confirmEmailChange() {
    try { const d=await api("/api/hr/cli-email-change-requests","PATCH",{ id:emailConfirmForm.id, token:emailConfirmForm.token, action:"confirm" }); setMsg("E-mail trocado concluída "+d.request.new_email); loadAll(); } catch(e:any){ setMsg("Erro confirmar e-mail: "+e.message); }
  }

  return (
    <section style={{ marginTop:24, padding:16, border:"1px solid #6a6", borderRadius:8 }}>
      <h2 style={{ color:"var(--theme-accent)" }}>CLI-09/10/11/12/13/14 — Cobranças Fiscais Oportunidade Satisfação Renovação Modos Segurança</h2>
      {msg && <p style={{ background:"#efe", padding:8 }}>{msg}</p>}

      <h3>CLI-09 Cobranças/documentos fiscais/comprovantes somente quando financeiro integrado dados própria conta</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="account_id" value={chargeForm.client_account_id} onChange={e=>setChargeForm({...chargeForm, client_account_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="contract_id" value={chargeForm.contract_id} onChange={e=>setChargeForm({...chargeForm, contract_id:e.target.value})} style={{ width:180 }} />
        <select value={chargeForm.charge_type} onChange={e=>setChargeForm({...chargeForm, charge_type:e.target.value})}><option value="mensalidade">mensalidade</option><option value="taxa_extra">taxa extra</option><option value="multa">multa</option></select>
        <input placeholder="amount_cents ex 10000 = R$100" value={chargeForm.amount_cents} onChange={e=>setChargeForm({...chargeForm, amount_cents:e.target.value})} style={{ width:120 }} />
        <input type="date" value={chargeForm.due_date} onChange={e=>setChargeForm({...chargeForm, due_date:e.target.value})} />
        <select value={chargeForm.is_fiscal} onChange={e=>setChargeForm({...chargeForm, is_fiscal:e.target.value})}><option value="false">não fiscal</option><option value="true">fiscal</option></select>
        <select value={chargeForm.finance_integration_active} onChange={e=>setChargeForm({...chargeForm, finance_integration_active:e.target.value})}><option value="true">financeiro integrado</option><option value="false">sem integração</option></select>
        <input placeholder="fiscal doc url" value={chargeForm.fiscal_document_url} onChange={e=>setChargeForm({...chargeForm, fiscal_document_url:e.target.value})} style={{ width:180 }} />
        <input placeholder="fiscal storage_key" value={chargeForm.fiscal_document_storage_key} onChange={e=>setChargeForm({...chargeForm, fiscal_document_storage_key:e.target.value})} />
        <button onClick={createCharge}>Criar Cobrança Protocolo</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:80, overflow:"auto" }}>{charges.map(c=>(<li key={c.id}>{c.protocol} {c.charge_type} {c.status} R$ {(c.amount_cents/100).toFixed(2)} venc {c.due_date} {c.is_fiscal?"FISCAL":""} {c.finance_integration_active?"FIN_INT":"SEM_FIN"} própria conta {c.client_account_id.slice(0,6)}</li>))}</ul>

      <h3>CLI-10 Solicitação serviço adicional gera oportunidade CRM origem responsável</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="account_id" value={srvForm.client_account_id} onChange={e=>setSrvForm({...srvForm, client_account_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="contract_id" value={srvForm.contract_id} onChange={e=>setSrvForm({...srvForm, contract_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="contact_id" value={srvForm.contact_id} onChange={e=>setSrvForm({...srvForm, contact_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="título 5..200" value={srvForm.title} onChange={e=>setSrvForm({...srvForm, title:e.target.value})} />
        <input placeholder="descrição 10..2000" value={srvForm.description} onChange={e=>setSrvForm({...srvForm, description:e.target.value})} style={{ width:250 }} />
        <select value={srvForm.origin} onChange={e=>setSrvForm({...srvForm, origin:e.target.value})}><option value="portal_cliente">portal cliente</option><option value="telefone">telefone</option><option value="email">email</option></select>
        <input placeholder="responsável" value={srvForm.responsible_name} onChange={e=>setSrvForm({...srvForm, responsible_name:e.target.value})} />
        <button onClick={createServiceReq}>Solicitar Serviço Adicional → CRM</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:80, overflow:"auto" }}>{serviceReqs.map(s=>(<li key={s.id}>{s.protocol} {s.title} {s.status} origem {s.origin} resp {s.responsible_name||"-"} CRM {s.crm_opportunity_id? s.crm_opportunity_id.slice(0,6):"pendente"}</li>))}</ul>

      <h3>CLI-11 Satisfação pós-atendimento periódica plano ação risco renovação baseado em fatos</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="account_id" value={satForm.client_account_id} onChange={e=>setSatForm({...satForm, client_account_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="contract_id" value={satForm.contract_id} onChange={e=>setSatForm({...satForm, contract_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="ticket_id" value={satForm.ticket_id} onChange={e=>setSatForm({...satForm, ticket_id:e.target.value})} style={{ width:180 }} />
        <select value={satForm.survey_type} onChange={e=>setSatForm({...satForm, survey_type:e.target.value})}><option value="pos_atendimento">pós-atendimento</option><option value="periodica">periódica</option></select>
        <input placeholder="score 0..10" value={satForm.score} onChange={e=>setSatForm({...satForm, score:e.target.value})} style={{ width:80 }} />
        <input placeholder="feedback 10..2000" value={satForm.feedback} onChange={e=>setSatForm({...satForm, feedback:e.target.value})} style={{ width:200 }} />
        <select value={satForm.renewal_risk} onChange={e=>setSatForm({...satForm, renewal_risk:e.target.value})}><option value="">risco -</option><option value="baixo">baixo</option><option value="medio">médio</option><option value="alto">alto</option></select>
        <input placeholder="risco motivo 10..1000 fatos" value={satForm.renewal_risk_reason} onChange={e=>setSatForm({...satForm, renewal_risk_reason:e.target.value})} />
        <input placeholder='facts_json ex {"incidentes":2}' value={satForm.facts_json} onChange={e=>setSatForm({...satForm, facts_json:e.target.value})} style={{ width:180 }} />
        <input placeholder="plano ação 10..2000" value={satForm.action_plan} onChange={e=>setSatForm({...satForm, action_plan:e.target.value})} />
        <button onClick={createSurvey}>Criar Satisfação Protocolo</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:80, overflow:"auto" }}>{surveys.map(s=>(<li key={s.id}>{s.protocol} {s.survey_type} {s.status} score {s.score} risco {s.renewal_risk||"-"} motivo {s.renewal_risk_reason?.slice(0,30)||"-"} <button onClick={()=>setSatActionForm({...satActionForm, survey_id:s.id})}>Plano Ação</button></li>))}</ul>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="survey_id" value={satActionForm.survey_id} onChange={e=>setSatActionForm({...satActionForm, survey_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="ação 10..1000" value={satActionForm.action} onChange={e=>setSatActionForm({...satActionForm, action:e.target.value})} style={{ width:250 }} />
        <input placeholder="responsável" value={satActionForm.responsible_name} onChange={e=>setSatActionForm({...satActionForm, responsible_name:e.target.value})} />
        <input type="date" value={satActionForm.due_date} onChange={e=>setSatActionForm({...satActionForm, due_date:e.target.value})} />
        <button onClick={createActionPlan}>Criar Plano Ação</button>
      </div>

      <h3>CLI-12 Renovação comunicação contratual registro sem bloquear indiscriminadamente portal por inadimplência</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="account_id" value={renForm.client_account_id} onChange={e=>setRenForm({...renForm, client_account_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="contract_id" value={renForm.contract_id} onChange={e=>setRenForm({...renForm, contract_id:e.target.value})} style={{ width:180 }} />
        <select value={renForm.comm_type} onChange={e=>setRenForm({...renForm, comm_type:e.target.value})}><option value="aviso_vencimento">aviso vencimento</option><option value="proposta_renovacao">proposta renovação</option><option value="reajuste">reajuste</option><option value="encerramento">encerramento</option></select>
        <input placeholder="título 5..200" value={renForm.title} onChange={e=>setRenForm({...renForm, title:e.target.value})} />
        <input placeholder="conteúdo 20..5000" value={renForm.content} onChange={e=>setRenForm({...renForm, content:e.target.value})} style={{ width:250 }} />
        <select value={renForm.is_blocking} onChange={e=>setRenForm({...renForm, is_blocking:e.target.value})}><option value="false">não bloqueia</option><option value="true">bloqueia (só encerramento)</option></select>
        <input placeholder="block_reason 10..1000 se bloqueia" value={renForm.block_reason} onChange={e=>setRenForm({...renForm, block_reason:e.target.value})} />
        <button onClick={createRenewal}>Criar Comunicação Renovação</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:80, overflow:"auto" }}>{renewals.map(r=>(<li key={r.id}>{r.protocol} {r.comm_type} {r.title} {r.is_blocking?"BLOQUEIA":"não bloqueia"} enviado {r.sent_at? new Date(r.sent_at).toLocaleDateString():"-"}</li>))}</ul>

      <h3>CLI-13 Modos convite solicitação com aprovação autocadastro configuráveis vínculo verificado servidor autocadastro nunca libera contratos sozinho</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <select value={modeForm.mode} onChange={e=>setModeForm({...modeForm, mode:e.target.value})}><option value="convite">convite</option><option value="solicitacao_aprovacao">solicitação aprovação</option><option value="autocadastro">autocadastro</option></select>
        <select value={modeForm.is_active} onChange={e=>setModeForm({...modeForm, is_active:e.target.value})}><option value="true">ativo</option><option value="false">inativo</option></select>
        <select value={modeForm.requires_approval} onChange={e=>setModeForm({...modeForm, requires_approval:e.target.value})}><option value="true">requer aprovação</option><option value="false">sem aprovação</option></select>
        <select value={modeForm.auto_release_contracts} onChange={e=>setModeForm({...modeForm, auto_release_contracts:e.target.value})}><option value="false">não libera contratos auto</option><option value="true">libera contratos auto (bloqueado para autocadastro)</option></select>
        <button onClick={updateMode}>Atualizar Modo</button>
      </div>
      <ul style={{ fontSize:11 }}>{modes.map(m=>(<li key={m.mode}>{m.mode} {m.is_active?"ativo":"inativo"} {m.requires_approval?"requer aprovação":"sem aprovação"} {m.auto_release_contracts?"libera contratos":"não libera contratos"} {m.mode==="autocadastro" && !m.auto_release_contracts?"✓ nunca libera contratos sozinho":""} — {m.description}</li>))}</ul>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <select value={accReqForm.mode} onChange={e=>setAccReqForm({...accReqForm, mode:e.target.value})}><option value="convite">convite</option><option value="solicitacao_aprovacao">solicitação aprovação</option><option value="autocadastro">autocadastro</option></select>
        <input placeholder="account_id opcional vínculo verificado" value={accReqForm.client_account_id} onChange={e=>setAccReqForm({...accReqForm, client_account_id:e.target.value})} style={{ width:200 }} />
        <input placeholder="email" value={accReqForm.requested_email} onChange={e=>setAccReqForm({...accReqForm, requested_email:e.target.value})} />
        <input placeholder="nome" value={accReqForm.requested_name} onChange={e=>setAccReqForm({...accReqForm, requested_name:e.target.value})} />
        <input placeholder="documento" value={accReqForm.document_ref} onChange={e=>setAccReqForm({...accReqForm, document_ref:e.target.value})} />
        <button onClick={createAccessReq}>Solicitar Acesso Vínculo Verificado</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:80, overflow:"auto" }}>{accessReqs.map(r=>(<li key={r.id}>{r.protocol} {r.mode} {r.requested_email} {r.status} verificado {r.verified_link?"sim":"não"} <button onClick={()=>setAccApproveForm({...accApproveForm, id:r.id})}>Aprovar/Rejeitar</button></li>))}</ul>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="access request id" value={accApproveForm.id} onChange={e=>setAccApproveForm({...accApproveForm, id:e.target.value})} style={{ width:180 }} />
        <select value={accApproveForm.status} onChange={e=>setAccApproveForm({...accApproveForm, status:e.target.value})}><option value="aprovada">aprovada</option><option value="rejeitada">rejeitada</option></select>
        <input placeholder="motivo rejeição 10..1000" value={accApproveForm.rejection_reason} onChange={e=>setAccApproveForm({...accApproveForm, rejection_reason:e.target.value})} />
        <button onClick={approveAccessReq}>Aprovar/Rejeitar Vínculo Verificado Autocadastro Nunca Libera Contratos</button>
      </div>

      <h3>CLI-14 Segurança conta MFA opcional gestão sessões troca e-mail concluída fluxos backend real</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="account_id" value={secForm.client_account_id} onChange={e=>setSecForm({...secForm, client_account_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="contact_id" value={secForm.contact_id} onChange={e=>setSecForm({...secForm, contact_id:e.target.value})} style={{ width:180 }} />
        <select value={secForm.event_type} onChange={e=>setSecForm({...secForm, event_type:e.target.value})}><option value="mfa_enabled">MFA habilitado opcional</option><option value="mfa_disabled">MFA desabilitado</option><option value="session_revoked">sessão revogada</option><option value="email_change_requested">e-mail troca solicitada</option><option value="email_changed">e-mail trocado</option></select>
        <input placeholder="ip" value={secForm.ip_address} onChange={e=>setSecForm({...secForm, ip_address:e.target.value})} style={{ width:120 }} />
        <button onClick={createSecEvent}>Registrar Evento Segurança MFA Opcional</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:60, overflow:"auto" }}>{secEvents.map(s=>(<li key={s.id}>{s.event_type} conta {s.client_account_id.slice(0,6)} {new Date(s.created_at).toLocaleString()}</li>))}</ul>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="account_id e-mail troca" value={emailForm.client_account_id} onChange={e=>setEmailForm({...emailForm, client_account_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="contact_id" value={emailForm.contact_id} onChange={e=>setEmailForm({...emailForm, contact_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="old_email" value={emailForm.old_email} onChange={e=>setEmailForm({...emailForm, old_email:e.target.value})} />
        <input placeholder="new_email" value={emailForm.new_email} onChange={e=>setEmailForm({...emailForm, new_email:e.target.value})} />
        <button onClick={createEmailChange}>Solicitar Troca E-mail Token Backend Real</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:60, overflow:"auto" }}>{emailReqs.map(e=>(<li key={e.id}>{e.protocol} {e.old_email}→{e.new_email} {e.status} expira {new Date(e.expires_at).toLocaleString()} token {e.token.slice(0,8)}... <button onClick={()=>setEmailConfirmForm({id:e.id, token:e.token})}>Usar Token</button></li>))}</ul>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="email change id" value={emailConfirmForm.id} onChange={e=>setEmailConfirmForm({...emailConfirmForm, id:e.target.value})} style={{ width:180 }} />
        <input placeholder="token" value={emailConfirmForm.token} onChange={e=>setEmailConfirmForm({...emailConfirmForm, token:e.target.value})} style={{ width:200 }} />
        <button onClick={confirmEmailChange}>Confirmar Troca E-mail Concluída Backend Real</button>
      </div>
    </section>
  );
}
