"use client";
import { useEffect, useState } from "react";

type Incident={ id:string; incident_type:string; severity:string; status:string; title:string; description:string; detected_at:string; affected_data_categories:string[]; affected_records_estimate:number|null; responsible_name:string|null; containment_lead_name:string|null; dpo_notified:boolean; authority_notified:boolean; data_subjects_notified:boolean; root_cause:string|null; impact_assessment:string|null; remediation_plan:string|null; lessons_learned:string|null; };
type Evidence={ id:string; evidence_type:string; title:string; description:string|null; checksum:string|null; collected_by:string|null; collected_at:string; };
type Action={ id:string; action_type:string; title:string; description:string; status:string; assigned_to_name:string|null; due_at:string|null; completed_at:string|null; };
type Comm={ id:string; recipient_type:string; recipient_contact:string|null; subject:string; content:string; sent_at:string|null; sent_by:string|null; };
type Hist={ id:string; previous_status:string|null; next_status:string; reason:string|null; changed_by:string|null; created_at:string; };

const TYPES=['vazamento_dados','acesso_nao_autorizado','perda_dados','indisponibilidade','malware','phishing','violacao_privacidade','outro'];
const SEVS=['baixa','media','alta','critica'];
const STATUSES=['aberto','em_contencao','em_analise','em_remediacao','aguardando_comunicacao','comunicado','encerrado','reaberto'];
const EVID_TYPES=['log','print','relatorio','depoimento','arquivo','outro'];
const ACT_TYPES=['contencao','erradicacao','recuperacao','comunicacao','analise','prevencao','outro'];
const RECIP=['dpo','autoridade','titular','interno','cliente','outro'];

export default function IncidentClient(){
  const [incidents,setIncidents]=useState<Incident[]>([]);
  const [selected,setSelected]=useState<Incident|null>(null);
  const [evidences,setEvidences]=useState<Evidence[]>([]);
  const [actions,setActions]=useState<Action[]>([]);
  const [comms,setComms]=useState<Comm[]>([]);
  const [history,setHistory]=useState<Hist[]>([]);
  const [msg,setMsg]=useState('');
  const [form,setForm]=useState({incident_type:'vazamento_dados', severity:'alta', title:'', description:'', affected_data_categories:['contato'], affected_records_estimate:'', responsible_name:''});
  const [updateForm,setUpdateForm]=useState({next_status:'em_contencao', reason:'', root_cause:'', impact_assessment:'', remediation_plan:'', lessons_learned:'', containment_lead_name:'', responsible_name:'', severity:''});
  const [evForm,setEvForm]=useState({evidence_type:'log', title:'', description:'', file_reference:''});
  const [actForm,setActForm]=useState({action_type:'contencao', title:'', description:'', assigned_to_name:'', due_at:''});
  const [commForm,setCommForm]=useState({recipient_type:'dpo', recipient_contact:'', subject:'', content:''});

  async function load(){
    try{
      const r=await fetch('/api/admin/incidents',{credentials:'include'}).then(r=>r.json());
      if(r.incidents) setIncidents(r.incidents);
    }catch(e:any){ setMsg(String(e)); }
  }
  useEffect(()=>{ load(); },[]);

  async function loadDetail(id:string){
    const r=await fetch(`/api/admin/incidents/${id}`,{credentials:'include'}).then(r=>r.json());
    if(r.incident){ setSelected(r.incident); setEvidences(r.evidences||[]); setActions(r.actions||[]); setComms(r.communications||[]); setHistory(r.history||[]); }
  }

  async function createIncident(){
    setMsg('criando incidente...');
    const payload:any={...form, affected_records_estimate: form.affected_records_estimate? parseInt(form.affected_records_estimate,10): null, affected_systems:[]};
    const r=await fetch('/api/admin/incidents',{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const j=await r.json(); if(!r.ok){ setMsg('erro: '+(j.error||r.status)); return; } setMsg('incidente criado '+j.incident.id); load();
  }
  async function updateIncident(){
    if(!selected){ setMsg('selecione incidente'); return; }
    setMsg('atualizando...');
    const payload:any={...updateForm};
    if(!payload.next_status) delete payload.next_status;
    if(!payload.severity) delete payload.severity;
    const r=await fetch(`/api/admin/incidents/${selected.id}`,{method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const j=await r.json(); if(!r.ok){ setMsg('erro: '+(j.error||JSON.stringify(j))); return; } setMsg('atualizado '+j.incident.status); loadDetail(selected.id);
  }
  async function addEvidence(){
    if(!selected){ setMsg('selecione incidente'); return; }
    const r=await fetch('/api/admin/incidents/evidences',{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...evForm, incident_id:selected.id})});
    const j=await r.json(); if(!r.ok){ setMsg('erro evid: '+(j.error||r.status)); return; } setMsg('evidência adicionada'); loadDetail(selected.id);
  }
  async function addAction(){
    if(!selected){ setMsg('selecione incidente'); return; }
    const r=await fetch('/api/admin/incidents/actions',{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...actForm, incident_id:selected.id})});
    const j=await r.json(); if(!r.ok){ setMsg('erro ação: '+(j.error||r.status)); return; } setMsg('ação criada'); loadDetail(selected.id);
  }
  async function completeAction(id:string){
    const r=await fetch('/api/admin/incidents/actions',{method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, status:'concluida'})});
    const j=await r.json(); if(!r.ok){ setMsg('erro completar: '+(j.error||r.status)); return; } setMsg('ação concluída'); if(selected) loadDetail(selected.id);
  }
  async function addComm(){
    if(!selected){ setMsg('selecione incidente'); return; }
    const r=await fetch('/api/admin/incidents/communications',{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...commForm, incident_id:selected.id})});
    const j=await r.json(); if(!r.ok){ setMsg('erro comm: '+(j.error||r.status)); return; } setMsg('comunicação registrada '+j.communication.recipient_type); loadDetail(selected.id);
  }

  return (
    <section style={{margin:'24px 0', padding:16, border:'1px solid #333', borderRadius:8}}>
      <h2>PLT-12 Resposta a incidente — contenção, evidências, análise, comunicação</h2>
      {msg && <p style={{color:'#0af'}}>{msg}</p>}
      <button onClick={load}>Recarregar incidentes</button>

      <h3>Incidentes ({incidents.length})</h3>
      <ul style={{maxHeight:160, overflow:'auto'}}>
        {incidents.map(i=><li key={i.id}><button onClick={()=>loadDetail(i.id)} style={{marginRight:8}}>Abrir</button>{i.status} {i.severity} {i.incident_type} {i.title.slice(0,60)} resp={i.responsible_name||'-'} cont={i.containment_lead_name||'-'} dpo={i.dpo_notified?'SIM':'não'} aut={i.authority_notified?'SIM':'não'}</li>)}
      </ul>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:8}}>
        <select value={form.incident_type} onChange={e=>setForm({...form, incident_type:e.target.value})}>{TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select>
        <select value={form.severity} onChange={e=>setForm({...form, severity:e.target.value})}>{SEVS.map(s=><option key={s} value={s}>{s}</option>)}</select>
        <input placeholder="título min 10" value={form.title} onChange={e=>setForm({...form, title:e.target.value})} />
        <input placeholder="responsável nome" value={form.responsible_name} onChange={e=>setForm({...form, responsible_name:e.target.value})} />
        <input placeholder="estimativa registros afetados" value={form.affected_records_estimate} onChange={e=>setForm({...form, affected_records_estimate:e.target.value})} />
        <textarea placeholder="descrição min 20" value={form.description} onChange={e=>setForm({...form, description:e.target.value})} style={{gridColumn:'1 / span 2'}} />
      </div>
      <button onClick={createIncident}>Abrir incidente</button>

      {selected && (
        <div style={{marginTop:16, borderTop:'1px solid #555', paddingTop:12}}>
          <h3>Detalhe {selected.id} — {selected.status} {selected.severity}</h3>
          <p>{selected.title} — {selected.description.slice(0,200)}</p>
          <p>Responsável: {selected.responsible_name||'-'} | Contenção lead: {selected.containment_lead_name||'-'} | DPO {selected.dpo_notified?'notificado':'não'} | Autoridade {selected.authority_notified?'notificada':'não'} | Titulares {selected.data_subjects_notified?'notificados':'não'}</p>
          <p>Root cause: {selected.root_cause||'-'} | Impacto: {selected.impact_assessment||'-'} | Remediação: {selected.remediation_plan||'-'} | Lições: {selected.lessons_learned||'-'}</p>

          <h4>Atualizar status / análise</h4>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
            <select value={updateForm.next_status} onChange={e=>setUpdateForm({...updateForm, next_status:e.target.value})}>{STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select>
            <select value={updateForm.severity} onChange={e=>setUpdateForm({...updateForm, severity:e.target.value})}><option value="">manter severidade</option>{SEVS.map(s=><option key={s} value={s}>{s}</option>)}</select>
            <input placeholder="containment_lead_name (obrigatório para em_contencao)" value={updateForm.containment_lead_name} onChange={e=>setUpdateForm({...updateForm, containment_lead_name:e.target.value})} />
            <input placeholder="responsible_name" value={updateForm.responsible_name} onChange={e=>setUpdateForm({...updateForm, responsible_name:e.target.value})} />
            <textarea placeholder="reason transição" value={updateForm.reason} onChange={e=>setUpdateForm({...updateForm, reason:e.target.value})} />
            <textarea placeholder="root_cause (obrigatório para encerrado)" value={updateForm.root_cause} onChange={e=>setUpdateForm({...updateForm, root_cause:e.target.value})} />
            <textarea placeholder="impact_assessment" value={updateForm.impact_assessment} onChange={e=>setUpdateForm({...updateForm, impact_assessment:e.target.value})} />
            <textarea placeholder="remediation_plan" value={updateForm.remediation_plan} onChange={e=>setUpdateForm({...updateForm, remediation_plan:e.target.value})} />
            <textarea placeholder="lessons_learned" value={updateForm.lessons_learned} onChange={e=>setUpdateForm({...updateForm, lessons_learned:e.target.value})} />
          </div>
          <button onClick={updateIncident}>Atualizar incidente</button>

          <h4>Evidências ({evidences.length})</h4>
          <ul>{evidences.map(ev=><li key={ev.id}>{ev.evidence_type} {ev.title} {ev.checksum?.slice(0,12)||''} por {ev.collected_by||'-'} {ev.collected_at.slice(0,19)}</li>)}</ul>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            <select value={evForm.evidence_type} onChange={e=>setEvForm({...evForm, evidence_type:e.target.value})}>{EVID_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select>
            <input placeholder="título evidência" value={evForm.title} onChange={e=>setEvForm({...evForm, title:e.target.value})} />
            <input placeholder="file_reference (caminho/hash)" value={evForm.file_reference} onChange={e=>setEvForm({...evForm, file_reference:e.target.value})} />
            <textarea placeholder="descrição evidência" value={evForm.description} onChange={e=>setEvForm({...evForm, description:e.target.value})} />
          </div>
          <button onClick={addEvidence}>Adicionar evidência (checksum automático)</button>

          <h4>Ações contenção/erradicação/recuperação ({actions.length})</h4>
          <ul>{actions.map(a=><li key={a.id}>{a.status} {a.action_type} {a.title} resp={a.assigned_to_name||'-'} due={a.due_at?.slice(0,10)||'-'} <button onClick={()=>completeAction(a.id)}>Concluir</button></li>)}</ul>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            <select value={actForm.action_type} onChange={e=>setActForm({...actForm, action_type:e.target.value})}>{ACT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select>
            <input placeholder="título ação" value={actForm.title} onChange={e=>setActForm({...actForm, title:e.target.value})} />
            <input placeholder="assigned_to_name" value={actForm.assigned_to_name} onChange={e=>setActForm({...actForm, assigned_to_name:e.target.value})} />
            <input type="datetime-local" value={actForm.due_at} onChange={e=>setActForm({...actForm, due_at:e.target.value})} />
            <textarea placeholder="descrição ação min10" value={actForm.description} onChange={e=>setActForm({...actForm, description:e.target.value})} style={{gridColumn:'1 / span 2'}} />
          </div>
          <button onClick={addAction}>Criar ação</button>

          <h4>Comunicações DPO/autoridade/titulares ({comms.length})</h4>
          <ul>{comms.map(c=><li key={c.id}>{c.recipient_type} {c.subject} para={c.recipient_contact||'-'} por={c.sent_by||'-'} {c.sent_at?.slice(0,19)||''}</li>)}</ul>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
            <select value={commForm.recipient_type} onChange={e=>setCommForm({...commForm, recipient_type:e.target.value})}>{RECIP.map(r=><option key={r} value={r}>{r}</option>)}</select>
            <input placeholder="recipient_contact email/telefone" value={commForm.recipient_contact} onChange={e=>setCommForm({...commForm, recipient_contact:e.target.value})} />
            <input placeholder="assunto min5" value={commForm.subject} onChange={e=>setCommForm({...commForm, subject:e.target.value})} />
            <textarea placeholder="conteúdo comunicação min20" value={commForm.content} onChange={e=>setCommForm({...commForm, content:e.target.value})} style={{gridColumn:'1 / span 2'}} />
          </div>
          <button onClick={addComm}>Registrar comunicação (atualiza flags DPO/autoridade/titular)</button>

          <h4>Histórico transições ({history.length})</h4>
          <ul>{history.map(h=><li key={h.id}>{h.previous_status||'null'} → {h.next_status} por {h.changed_by||'-'} {h.reason||''} {h.created_at.slice(0,19)}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
