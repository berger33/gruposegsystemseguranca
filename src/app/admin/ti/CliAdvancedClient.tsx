"use client";
import { useEffect, useState } from "react";

type Ticket = { id:string; protocol:string; client_account_id:string; category:string; priority:string; title:string; description:string; status:string; responsible_name:string|null; sla_due_at:string|null; sla_paused_at:string|null; sla_total_paused_seconds:number; reopen_count:number; last_reopen_reason:string|null; };
type Visit = { id:string; protocol:string; client_account_id:string; title:string; visit_type:string; status:string; scheduled_at:string; confirmed_at:string|null; rescheduled_to:string|null; location:string|null; };
type Report = { id:string; protocol:string; client_account_id:string; title:string; report_type:string; status:string; content:string; period_start:string|null; period_end:string|null; };

export default function CliAdvancedClient() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [msg, setMsg] = useState("");

  async function loadAll() {
    try {
      const [tRes, vRes, rRes] = await Promise.all([
        fetch("/api/hr/cli-tickets-v2").then(r=>r.json()).catch(()=>({tickets:[]})),
        fetch("/api/hr/cli-visits").then(r=>r.json()).catch(()=>({visits:[]})),
        fetch("/api/hr/cli-reports-v2").then(r=>r.json()).catch(()=>({reports:[]})),
      ]);
      if (tRes.tickets) setTickets(tRes.tickets);
      if (vRes.visits) setVisits(vRes.visits);
      if (rRes.reports) setReports(rRes.reports);
    } catch {}
  }
  useEffect(()=>{ loadAll(); }, []);

  async function api(path:string, method:string, body?:any) {
    const res = await fetch(path, { method, headers: { "Content-Type":"application/json" }, body: body? JSON.stringify(body): undefined });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error || data.detail || "erro");
    return data;
  }

  // CLI-05/06
  const [ticketForm, setTicketForm] = useState({ client_account_id:"", contact_id:"", contract_id:"", category:"atendimento_servico", priority:"media", title:"", description:"", sla_due_at:"" });
  async function createTicket() {
    try { const d=await api("/api/hr/cli-tickets-v2","POST",{ client_account_id:ticketForm.client_account_id, contact_id:ticketForm.contact_id||null, contract_id:ticketForm.contract_id||null, category:ticketForm.category, priority:ticketForm.priority, title:ticketForm.title, description:ticketForm.description, sla_due_at:ticketForm.sla_due_at||null }); setMsg("Chamado protocolo "+d.ticket.protocol+" categoria prioridade responsável SLA"); loadAll(); } catch(e:any){ setMsg("Erro ticket: "+e.message); }
  }
  const [statusForm, setStatusForm] = useState({ id:"", status:"em_atendimento", reason:"", reopen_reason:"", responsible_name:"" });
  async function updateTicketStatus() {
    try { const d=await api("/api/hr/cli-tickets-v2","PATCH",{ id:statusForm.id, status:statusForm.status, reason:statusForm.reason, reopen_reason:statusForm.reopen_reason, responsible_name:statusForm.responsible_name }); setMsg("Status ticket "+d.ticket.status+" reabertura motivo pausas SLA explícitas"); loadAll(); } catch(e:any){ setMsg("Erro status: "+e.message); }
  }
  const [msgForm, setMsgForm] = useState({ ticket_id:"", content:"", is_internal:"false", contact_id:"" });
  async function createMessage() {
    try { await api("/api/hr/cli-ticket-messages","POST",{ ticket_id:msgForm.ticket_id, content:msgForm.content, is_internal:msgForm.is_internal==="true", contact_id:msgForm.contact_id||null }); setMsg("Mensagem chamado criada"); } catch(e:any){ setMsg("Erro msg: "+e.message); }
  }
  const [attachForm, setAttachForm] = useState({ ticket_id:"", message_id:"", file_name:"", file_url:"", storage_key:"" });
  async function createAttachment() {
    try { await api("/api/hr/cli-ticket-attachments","POST",{ ticket_id:attachForm.ticket_id, message_id:attachForm.message_id||null, file_name:attachForm.file_name, file_url:attachForm.file_url, storage_key:attachForm.storage_key }); setMsg("Anexo chamado criado"); } catch(e:any){ setMsg("Erro anexo: "+e.message); }
  }
  const [slaForm, setSlaForm] = useState({ ticket_id:"", reason:"aguardando_cliente", notes:"", action:"pause" });
  async function slaAction() {
    try { const d=await api("/api/hr/cli-ticket-sla-pauses","POST",{ ticket_id:slaForm.ticket_id, reason:slaForm.reason, notes:slaForm.notes, action:slaForm.action }); setMsg("SLA "+slaForm.action+" pausa explicitamente definida "+(d.pause?.pause_duration_seconds||"")+"s total"); loadAll(); } catch(e:any){ setMsg("Erro SLA: "+e.message); }
  }

  // CLI-07
  const [visitForm, setVisitForm] = useState({ client_account_id:"", contract_id:"", ticket_id:"", visit_type:"visita_tecnica", title:"", description:"", scheduled_at:"", responsible_name:"", location:"" });
  async function createVisit() {
    try { const d=await api("/api/hr/cli-visits","POST",{ client_account_id:visitForm.client_account_id, contract_id:visitForm.contract_id||null, ticket_id:visitForm.ticket_id||null, visit_type:visitForm.visit_type, title:visitForm.title, description:visitForm.description, scheduled_at:visitForm.scheduled_at, responsible_name:visitForm.responsible_name, location:visitForm.location }); setMsg("Visita agenda protocolo "+d.visit.protocol); loadAll(); } catch(e:any){ setMsg("Erro visita: "+e.message); }
  }
  const [visitStatusForm, setVisitStatusForm] = useState({ id:"", status:"confirmada", rescheduled_to:"", reschedule_reason:"", responsible_name:"" });
  async function updateVisitStatus() {
    try { const d=await api("/api/hr/cli-visits","PATCH",{ id:visitStatusForm.id, status:visitStatusForm.status, rescheduled_to:visitStatusForm.rescheduled_to||null, reschedule_reason:visitStatusForm.reschedule_reason, responsible_name:visitStatusForm.responsible_name }); setMsg("Visita status "+d.visit.status+" confirmação reagendamento histórico"); loadAll(); } catch(e:any){ setMsg("Erro visita status: "+e.message); }
  }

  // CLI-08
  const [reportForm, setReportForm] = useState({ client_account_id:"", contract_id:"", visit_id:"", report_type:"execucao", title:"", content:"", period_start:"", period_end:"" });
  async function createReport() {
    try { const d=await api("/api/hr/cli-reports-v2","POST",{ client_account_id:reportForm.client_account_id, contract_id:reportForm.contract_id||null, visit_id:reportForm.visit_id||null, report_type:reportForm.report_type, title:reportForm.title, content:reportForm.content, period_start:reportForm.period_start||null, period_end:reportForm.period_end||null }); setMsg("Relatório protocolo "+d.report.protocol+" execução medição/aceite revisão"); loadAll(); } catch(e:any){ setMsg("Erro relatório: "+e.message); }
  }
  const [reportStatusForm, setReportStatusForm] = useState({ id:"", status:"em_revisao", review_notes:"", reason:"" });
  async function updateReportStatus() {
    try { const d=await api("/api/hr/cli-reports-v2","PATCH",{ id:reportStatusForm.id, status:reportStatusForm.status, review_notes:reportStatusForm.review_notes, reason:reportStatusForm.reason }); setMsg("Relatório status "+d.report.status+" revisão obrigatória"); loadAll(); } catch(e:any){ setMsg("Erro relatório status: "+e.message); }
  }

  return (
    <section style={{ marginTop:24, padding:16, border:"1px solid #a66", borderRadius:8 }}>
      <h2 style={{ color:"var(--theme-accent)" }}>CLI-05/06/07/08 — Chamados SLA Visitas Agenda Relatórios Execução Medição Aceite</h2>
      {msg && <p style={{ background:"#fee", padding:8 }}>{msg}</p>}

      <h3>CLI-05 Chamados protocolo categoria prioridade responsável mensagens anexos SLA histórico</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="account_id" value={ticketForm.client_account_id} onChange={e=>setTicketForm({...ticketForm, client_account_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="contact_id" value={ticketForm.contact_id} onChange={e=>setTicketForm({...ticketForm, contact_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="contract_id" value={ticketForm.contract_id} onChange={e=>setTicketForm({...ticketForm, contract_id:e.target.value})} style={{ width:180 }} />
        <select value={ticketForm.category} onChange={e=>setTicketForm({...ticketForm, category:e.target.value})}><option value="acesso_portal">acesso portal</option><option value="contratos_documentos">contratos/docs</option><option value="atendimento_servico">atendimento serviço</option><option value="financeiro">financeiro</option><option value="reclamacao">reclamação</option></select>
        <select value={ticketForm.priority} onChange={e=>setTicketForm({...ticketForm, priority:e.target.value})}><option value="baixa">baixa</option><option value="media">média</option><option value="alta">alta</option><option value="critica">crítica</option></select>
        <input placeholder="título 3..200" value={ticketForm.title} onChange={e=>setTicketForm({...ticketForm, title:e.target.value})} style={{ width:200 }} />
        <input placeholder="descrição 10..5000" value={ticketForm.description} onChange={e=>setTicketForm({...ticketForm, description:e.target.value})} style={{ width:250 }} />
        <input type="datetime-local" value={ticketForm.sla_due_at} onChange={e=>setTicketForm({...ticketForm, sla_due_at:e.target.value})} />
        <button onClick={createTicket}>Criar Chamado Protocolo</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:100, overflow:"auto" }}>{tickets.map(t=>(<li key={t.id}>{t.protocol} {t.title} {t.category} {t.priority} {t.status} resp {t.responsible_name||"-"} SLA {t.sla_due_at? new Date(t.sla_due_at).toLocaleDateString():"-"} pausado {t.sla_paused_at?"sim":"não"} total pausado {t.sla_total_paused_seconds}s reaberturas {t.reopen_count} <button onClick={()=>{ setStatusForm({...statusForm, id:t.id}); setMsgForm({...msgForm, ticket_id:t.id}); setAttachForm({...attachForm, ticket_id:t.id}); setSlaForm({...slaForm, ticket_id:t.id}); }}>Mensagens/Anexos/SLA/Status</button></li>))}</ul>

      <h3>CLI-06 Estados aberto/em atendimento/aguardando cliente/resolvido/encerrado reabertura motivo pausas SLA explicitamente definidas</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="ticket id" value={statusForm.id} onChange={e=>setStatusForm({...statusForm, id:e.target.value})} style={{ width:200 }} />
        <select value={statusForm.status} onChange={e=>setStatusForm({...statusForm, status:e.target.value})}><option value="aberto">aberto</option><option value="em_atendimento">em atendimento</option><option value="aguardando_cliente">aguardando cliente</option><option value="resolvido">resolvido</option><option value="encerrado">encerrado</option></select>
        <input placeholder="motivo status 10..1000" value={statusForm.reason} onChange={e=>setStatusForm({...statusForm, reason:e.target.value})} />
        <input placeholder="motivo reabertura 10..1000 se reabertura" value={statusForm.reopen_reason} onChange={e=>setStatusForm({...statusForm, reopen_reason:e.target.value})} style={{ width:200 }} />
        <input placeholder="responsável" value={statusForm.responsible_name} onChange={e=>setStatusForm({...statusForm, responsible_name:e.target.value})} />
        <button onClick={updateTicketStatus}>Atualizar Status com Reabertura Motivo SLA pausa explícita</button>
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="ticket_id msg" value={msgForm.ticket_id} onChange={e=>setMsgForm({...msgForm, ticket_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="mensagem 1..5000" value={msgForm.content} onChange={e=>setMsgForm({...msgForm, content:e.target.value})} style={{ width:250 }} />
        <select value={msgForm.is_internal} onChange={e=>setMsgForm({...msgForm, is_internal:e.target.value})}><option value="false">público</option><option value="true">nota interna</option></select>
        <button onClick={createMessage}>Criar Mensagem</button>
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="ticket_id anexo" value={attachForm.ticket_id} onChange={e=>setAttachForm({...attachForm, ticket_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="file_name" value={attachForm.file_name} onChange={e=>setAttachForm({...attachForm, file_name:e.target.value})} />
        <input placeholder="file_url" value={attachForm.file_url} onChange={e=>setAttachForm({...attachForm, file_url:e.target.value})} style={{ width:200 }} />
        <input placeholder="storage_key" value={attachForm.storage_key} onChange={e=>setAttachForm({...attachForm, storage_key:e.target.value})} />
        <button onClick={createAttachment}>Criar Anexo</button>
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="ticket_id SLA" value={slaForm.ticket_id} onChange={e=>setSlaForm({...slaForm, ticket_id:e.target.value})} style={{ width:180 }} />
        <select value={slaForm.reason} onChange={e=>setSlaForm({...slaForm, reason:e.target.value})}><option value="aguardando_cliente">aguardando cliente</option><option value="aguardando_terceiro">aguardando terceiro</option><option value="feriado">feriado</option><option value="manutencao">manutenção</option></select>
        <input placeholder="notes 10..1000" value={slaForm.notes} onChange={e=>setSlaForm({...slaForm, notes:e.target.value})} />
        <select value={slaForm.action} onChange={e=>setSlaForm({...slaForm, action:e.target.value})}><option value="pause">pausar SLA</option><option value="resume">retomar SLA</option></select>
        <button onClick={slaAction}>SLA Pausa/Retoma Explicitamente Definida</button>
      </div>

      <h3>CLI-07 Agenda visita/manutenção confirmação reagendamento histórico</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="account_id" value={visitForm.client_account_id} onChange={e=>setVisitForm({...visitForm, client_account_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="contract_id" value={visitForm.contract_id} onChange={e=>setVisitForm({...visitForm, contract_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="ticket_id" value={visitForm.ticket_id} onChange={e=>setVisitForm({...visitForm, ticket_id:e.target.value})} style={{ width:180 }} />
        <select value={visitForm.visit_type} onChange={e=>setVisitForm({...visitForm, visit_type:e.target.value})}><option value="visita_tecnica">visita técnica</option><option value="manutencao_preventiva">manutenção preventiva</option><option value="manutencao_corretiva">manutenção corretiva</option><option value="vistoria">vistoria</option></select>
        <input placeholder="título 5..200" value={visitForm.title} onChange={e=>setVisitForm({...visitForm, title:e.target.value})} />
        <input type="datetime-local" value={visitForm.scheduled_at} onChange={e=>setVisitForm({...visitForm, scheduled_at:e.target.value})} />
        <input placeholder="responsável" value={visitForm.responsible_name} onChange={e=>setVisitForm({...visitForm, responsible_name:e.target.value})} />
        <input placeholder="local 3..500" value={visitForm.location} onChange={e=>setVisitForm({...visitForm, location:e.target.value})} />
        <button onClick={createVisit}>Agendar Visita Protocolo</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:80, overflow:"auto" }}>{visits.map(v=>(<li key={v.id}>{v.protocol} {v.title} {v.visit_type} {v.status} agendada {new Date(v.scheduled_at).toLocaleString()} confirmada {v.confirmed_at? new Date(v.confirmed_at).toLocaleString():"-"} reagendada para {v.rescheduled_to? new Date(v.rescheduled_to).toLocaleString():"-"} local {v.location||"-"} <button onClick={()=>setVisitStatusForm({...visitStatusForm, id:v.id})}>Confirmar/Reagendar</button></li>))}</ul>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="visit id" value={visitStatusForm.id} onChange={e=>setVisitStatusForm({...visitStatusForm, id:e.target.value})} style={{ width:180 }} />
        <select value={visitStatusForm.status} onChange={e=>setVisitStatusForm({...visitStatusForm, status:e.target.value})}><option value="confirmada">confirmada</option><option value="reagendada">reagendada</option><option value="realizada">realizada</option><option value="cancelada">cancelada</option><option value="nao_compareceu">não compareceu</option></select>
        <input type="datetime-local" value={visitStatusForm.rescheduled_to} onChange={e=>setVisitStatusForm({...visitStatusForm, rescheduled_to:e.target.value})} />
        <input placeholder="motivo reagendamento 10..1000" value={visitStatusForm.reschedule_reason} onChange={e=>setVisitStatusForm({...visitStatusForm, reschedule_reason:e.target.value})} style={{ width:250 }} />
        <button onClick={updateVisitStatus}>Confirmar/Reagendar Histórico</button>
      </div>

      <h3>CLI-08 Relatórios execução medição/aceite serviço com revisão</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="account_id" value={reportForm.client_account_id} onChange={e=>setReportForm({...reportForm, client_account_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="contract_id" value={reportForm.contract_id} onChange={e=>setReportForm({...reportForm, contract_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="visit_id" value={reportForm.visit_id} onChange={e=>setReportForm({...reportForm, visit_id:e.target.value})} style={{ width:180 }} />
        <select value={reportForm.report_type} onChange={e=>setReportForm({...reportForm, report_type:e.target.value})}><option value="execucao">execução</option><option value="medicao">medição</option><option value="aceite">aceite</option></select>
        <input placeholder="título 5..200" value={reportForm.title} onChange={e=>setReportForm({...reportForm, title:e.target.value})} />
        <input placeholder="conteúdo 20..10000" value={reportForm.content} onChange={e=>setReportForm({...reportForm, content:e.target.value})} style={{ width:250 }} />
        <input type="date" value={reportForm.period_start} onChange={e=>setReportForm({...reportForm, period_start:e.target.value})} />
        <input type="date" value={reportForm.period_end} onChange={e=>setReportForm({...reportForm, period_end:e.target.value})} />
        <button onClick={createReport}>Criar Relatório Protocolo</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:80, overflow:"auto" }}>{reports.map(r=>(<li key={r.id}>{r.protocol} {r.title} {r.report_type} {r.status} período {r.period_start||"-"}→{r.period_end||"-"} <button onClick={()=>setReportStatusForm({...reportStatusForm, id:r.id})}>Revisão/Aprovação</button></li>))}</ul>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="report id" value={reportStatusForm.id} onChange={e=>setReportStatusForm({...reportStatusForm, id:e.target.value})} style={{ width:180 }} />
        <select value={reportStatusForm.status} onChange={e=>setReportStatusForm({...reportStatusForm, status:e.target.value})}><option value="em_revisao">em revisão</option><option value="aprovado">aprovado</option><option value="rejeitado">rejeitado</option><option value="enviado">enviado</option></select>
        <input placeholder="review_notes 10..2000" value={reportStatusForm.review_notes} onChange={e=>setReportStatusForm({...reportStatusForm, review_notes:e.target.value})} style={{ width:250 }} />
        <button onClick={updateReportStatus}>Atualizar Status Revisão Obrigatória</button>
      </div>
    </section>
  );
}
