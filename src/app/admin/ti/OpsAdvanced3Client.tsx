"use client";
import { useEffect, useState } from "react";

type MetricDef = { id:string; name:string; metric_type:string; source:string; window_type:string; description:string|null; is_active:boolean; };
type Snapshot = { id:string; metric_type:string; source:string; window_type:string; period_start:string; period_end:string; value:number; unit:string|null; status:string; };
type Reinc = { id:string; post_id:string|null; metric_type:string; occurrence_count:number; first_date:string; last_date:string; days_between:number; is_reincidence:boolean; };
type Proposal = { id:string; protocol:string; company_id:string|null; period_start:string; period_end:string; status:string; is_human_reviewed:boolean; motives:string|null; conflicts:any; };
type Entry = { id:string; proposal_id:string; post_id:string; employee_id:string|null; entry_date:string; status:string; conflict_type:string|null; is_valid:boolean; };
type Conflict = { id:string; proposal_id:string; entry_id:string|null; conflict_type:string; description:string; severity:string|null; resolved:boolean; };
type CleanEnv = { id:string; post_id:string; name:string; environment_type:string; area_m2:number|null; is_active:boolean; };
type Routine = { id:string; environment_id:string; routine_type:string; frequency:string; title:string; description:string|null; is_active:boolean; };
type Execution = { id:string; routine_id:string; environment_id:string; employee_id:string|null; executed_at:string; status:string; score:number|null; consumption_quantity:number|null; nonconformity_count:number; };
type Nonconf = { id:string; execution_id:string|null; environment_id:string|null; type:string; description:string; severity:string; status:string; is_reincidence:boolean; };
type Connector = { id:string; name:string; connector_type:string; status:string; is_active:boolean; last_event_at:string|null; };
type MonEvent = { id:string; protocol:string; connector_id:string|null; event_type:string; severity:string; status:string; occurred_at:string; received_at:string; is_escalated:boolean; escalation_level:number; };

export default function OpsAdvanced3Client() {
  const [defs, setDefs] = useState<MetricDef[]>([]);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [reincs, setReincs] = useState<Reinc[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [envs, setEnvs] = useState<CleanEnv[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [execs, setExecs] = useState<Execution[]>([]);
  const [ncs, setNcs] = useState<Nonconf[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [events, setEvents] = useState<MonEvent[]>([]);
  const [msg, setMsg] = useState("");

  async function loadAll() {
    try {
      const [dRes, sRes, rRes, pRes, eRes, cRes, evRes] = await Promise.all([
        fetch("/api/hr/ops-metrics-definitions").then(r=>r.json()).catch(()=>({definitions:[]})),
        fetch("/api/hr/ops-metrics-snapshots").then(r=>r.json()).catch(()=>({snapshots:[]})),
        fetch("/api/hr/ops-metrics-reincidence").then(r=>r.json()).catch(()=>({reincidences:[]})),
        fetch("/api/hr/ops-assisted-proposals").then(r=>r.json()).catch(()=>({proposals:[]})),
        fetch("/api/hr/ops-cleaning-environments").then(r=>r.json()).catch(()=>({environments:[]})),
        fetch("/api/hr/ops-monitoring-connectors").then(r=>r.json()).catch(()=>({connectors:[]})),
        fetch("/api/hr/ops-monitoring-events").then(r=>r.json()).catch(()=>({events:[]})),
      ]);
      if (dRes.definitions) setDefs(dRes.definitions);
      if (sRes.snapshots) setSnaps(sRes.snapshots);
      if (rRes.reincidences) setReincs(rRes.reincidences);
      if (pRes.proposals) setProposals(pRes.proposals);
      if (eRes.environments) setEnvs(eRes.environments);
      if (cRes.connectors) setConnectors(cRes.connectors);
      if (evRes.events) setEvents(evRes.events);
    } catch {}
  }
  useEffect(()=>{ loadAll(); }, []);

  async function api(path:string, method:string, body?:any) {
    const res = await fetch(path, { method, headers: { "Content-Type":"application/json" }, body: body? JSON.stringify(body): undefined });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error || data.detail || "erro");
    return data;
  }

  // OPS-13
  const [defForm, setDefForm] = useState({ name:"", metric_type:"cobertura", source:"escala", window_type:"mensal", description:"" });
  async function createDef() {
    try { await api("/api/hr/ops-metrics-definitions","POST",{ name:defForm.name, metric_type:defForm.metric_type, source:defForm.source, window_type:defForm.window_type, description:defForm.description }); setMsg("Definição métrica criada fonte+janela"); loadAll(); } catch(e:any){ setMsg("Erro def: "+e.message); }
  }
  const [snapForm, setSnapForm] = useState({ definition_id:"", metric_type:"cobertura", source:"escala", window_type:"mensal", period_start:"", period_end:"", value:"", unit:"%", post_id:"", company_id:"" });
  async function createSnap() {
    try { await api("/api/hr/ops-metrics-snapshots","POST",{ definition_id:snapForm.definition_id||null, metric_type:snapForm.metric_type, source:snapForm.source, window_type:snapForm.window_type, period_start:snapForm.period_start, period_end:snapForm.period_end, value:parseFloat(snapForm.value), unit:snapForm.unit, post_id:snapForm.post_id||null, company_id:snapForm.company_id||null }); setMsg("Snapshot métrica criado"); loadAll(); } catch(e:any){ setMsg("Erro snap: "+e.message); }
  }
  const [reincForm, setReincForm] = useState({ post_id:"", first_date:"", last_date:"", occurrence_count:"2", company_id:"" });
  async function createReinc() {
    try { await api("/api/hr/ops-metrics-reincidence","POST",{ post_id:reincForm.post_id, first_date:reincForm.first_date, last_date:reincForm.last_date, occurrence_count:parseInt(reincForm.occurrence_count), company_id:reincForm.company_id||null }); setMsg("Reincidência registrada"); loadAll(); } catch(e:any){ setMsg("Erro reinc: "+e.message); }
  }

  // OPS-14
  const [propForm, setPropForm] = useState({ company_id:"", unit_id:"", period_start:"", period_end:"", motives:"" });
  async function createProposal() {
    try { await api("/api/hr/ops-assisted-proposals","POST",{ company_id:propForm.company_id||null, unit_id:propForm.unit_id||null, period_start:propForm.period_start, period_end:propForm.period_end, motives:propForm.motives }); setMsg("Proposta escala assistida criada - regras validadas verificadas"); loadAll(); } catch(e:any){ setMsg("Erro proposta: "+e.message); }
  }
  async function reviewProposal(id:string) {
    const reviewed_by = prompt("Revisor humano (obrigatório antes publicar):"); if(!reviewed_by) return;
    try { await api("/api/hr/ops-assisted-proposals","PATCH",{ id, status:"em_analise", reviewed_by }); setMsg("Proposta em análise humana"); loadAll(); } catch(e:any){ setMsg(e.message); }
  }
  async function publishProposal(id:string) {
    const reviewed_by = prompt("Responsável publicação (revisão humana obrigatória, conflitos apresentados):"); if(!reviewed_by) return;
    try { await api("/api/hr/ops-assisted-proposals","PATCH",{ id, status:"publicado", reviewed_by }); setMsg("Escala assistida publicada"); loadAll(); } catch(e:any){ setMsg("Erro publicar: "+e.message); }
  }
  async function loadConflicts(proposal_id:string) {
    try { const d=await api("/api/hr/ops-assisted-conflicts?proposal_id="+proposal_id,"GET"); if(d.conflicts) setConflicts(d.conflicts); const eD=await api("/api/hr/ops-assisted-entries?proposal_id="+proposal_id,"GET"); if(eD.entries) setEntries(eD.entries); } catch {}
  }
  const [entryForm, setEntryForm] = useState({ proposal_id:"", post_id:"", employee_id:"", entry_date:"", shift_template_id:"" });
  async function createEntry() {
    try { const d=await api("/api/hr/ops-assisted-entries","POST",{ proposal_id:entryForm.proposal_id, post_id:entryForm.post_id, employee_id:entryForm.employee_id||null, entry_date:entryForm.entry_date, shift_template_id:entryForm.shift_template_id||null }); setMsg(d.conflict? "Conflito detectado: "+d.entry.conflict_type : "Entrada proposta sem conflito"); loadConflicts(entryForm.proposal_id); } catch(e:any){ setMsg("Erro entrada: "+e.message); }
  }

  // OPS-15
  const [envForm, setEnvForm] = useState({ post_id:"", name:"", environment_type:"escritorio", area_m2:"", description:"" });
  async function createEnv() {
    try { await api("/api/hr/ops-cleaning-environments","POST",{ post_id:envForm.post_id, name:envForm.name, environment_type:envForm.environment_type, area_m2:envForm.area_m2?parseFloat(envForm.area_m2):null, description:envForm.description }); setMsg("Ambiente limpeza criado"); loadAll(); } catch(e:any){ setMsg("Erro env: "+e.message); }
  }
  const [routForm, setRoutForm] = useState({ environment_id:"", title:"", routine_type:"limpeza", frequency:"diaria", description:"" });
  async function createRoutine() {
    try { await api("/api/hr/ops-cleaning-routines","POST",{ environment_id:routForm.environment_id, title:routForm.title, routine_type:routForm.routine_type, frequency:routForm.frequency, description:routForm.description }); setMsg("Rotina limpeza criada"); const d=await api("/api/hr/ops-cleaning-routines?environment_id="+routForm.environment_id,"GET"); if(d.routines) setRoutines(d.routines); } catch(e:any){ setMsg("Erro rotina: "+e.message); }
  }
  async function loadRoutines(envId:string) {
    try { const d=await api("/api/hr/ops-cleaning-routines?environment_id="+envId,"GET"); if(d.routines) setRoutines(d.routines); } catch {}
  }
  const [execForm, setExecForm] = useState({ routine_id:"", environment_id:"", employee_id:"", score:"", consumption_quantity:"", consumption_description:"" });
  async function createExec() {
    try { await api("/api/hr/ops-cleaning-executions","POST",{ routine_id:execForm.routine_id, environment_id:execForm.environment_id, employee_id:execForm.employee_id||null, score:execForm.score?parseFloat(execForm.score):null, consumption_quantity:execForm.consumption_quantity?parseFloat(execForm.consumption_quantity):null, consumption_description:execForm.consumption_description }); setMsg("Execução limpeza registrada consumo"); const d=await api("/api/hr/ops-cleaning-executions?routine_id="+execForm.routine_id,"GET"); if(d.executions) setExecs(d.executions); } catch(e:any){ setMsg("Erro exec: "+e.message); }
  }
  const [ncForm, setNcForm] = useState({ execution_id:"", environment_id:"", type:"", description:"", severity:"media", responsible_name:"", due_date:"" });
  async function createNc() {
    try { const d=await api("/api/hr/ops-cleaning-nonconformities","POST",{ execution_id:ncForm.execution_id||null, environment_id:ncForm.environment_id||null, type:ncForm.type, description:ncForm.description, severity:ncForm.severity, responsible_name:ncForm.responsible_name, due_date:ncForm.due_date||null }); setMsg(d.reincidence? "Não conformidade reincidente!" : "Não conformidade registrada"); const nd=await api("/api/hr/ops-cleaning-nonconformities?execution_id="+ncForm.execution_id,"GET"); if(nd.nonconformities) setNcs(nd.nonconformities); } catch(e:any){ setMsg("Erro nc: "+e.message); }
  }

  // OPS-16
  const [connForm, setConnForm] = useState({ name:"", connector_type:"manual", status:"ativo" });
  async function createConn() {
    try { await api("/api/hr/ops-monitoring-connectors","POST",{ name:connForm.name, connector_type:connForm.connector_type, status:connForm.status, config:{ modo:"manual", video:"video_sem_projeto_nao_armazenado - não armazena vídeo" } }); setMsg("Conector monitoramento criado - vídeo não armazenado"); loadAll(); } catch(e:any){ setMsg("Erro conector: "+e.message); }
  }
  const [evForm, setEvForm] = useState({ connector_id:"", event_type:"outro", severity:"media", post_id:"", company_id:"", occurred_at:"", notes:"" });
  async function createEvent() {
    try { await api("/api/hr/ops-monitoring-events","POST",{ connector_id:evForm.connector_id||null, event_type:evForm.event_type, severity:evForm.severity, post_id:evForm.post_id||null, company_id:evForm.company_id||null, occurred_at:evForm.occurred_at||new Date().toISOString(), notes:evForm.notes, payload:{ info:"evento via conector fila reconhecimento escalonamento - não é substituto central 24h", video:"video_sem_projeto_nao_armazenado" } }); setMsg("Evento monitoramento via conector fila criado - não é central 24h"); loadAll(); } catch(e:any){ setMsg("Erro evento: "+e.message); }
  }
  async function ackEvent(id:string) {
    const acknowledged_by = prompt("Responsável reconhecimento:"); if(!acknowledged_by) return;
    try { await api("/api/hr/ops-monitoring-events","PATCH",{ id, status:"reconhecido", acknowledged_by }); setMsg("Evento reconhecido"); loadAll(); } catch(e:any){ setMsg(e.message); }
  }
  async function escalateEvent(id:string) {
    const reason = prompt("Motivo escalonamento 10..1000:"); if(!reason) return;
    try { await api("/api/hr/ops-monitoring-events","PATCH",{ id, status:"escalonado", reason }); setMsg("Evento escalonado nível+1"); loadAll(); } catch(e:any){ setMsg(e.message); }
  }

  return (
    <section style={{ marginTop:24, padding:16, border:"1px solid #999", borderRadius:8 }}>
      <h2 style={{ color:"var(--theme-accent)" }}>OPS-13/14/15/16 — Métricas, Escalas Assistidas, Limpeza, Monitoramento</h2>
      {msg && <p style={{ background:"#eef", padding:8 }}>{msg}</p>}

      <h3>OPS-13 Métricas cobertura, tempo descoberto, incidentes, visitas, reincidência fonte janela</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="nome métrica 3..200" value={defForm.name} onChange={e=>setDefForm({...defForm, name:e.target.value})} style={{ width:200 }} />
        <select value={defForm.metric_type} onChange={e=>setDefForm({...defForm, metric_type:e.target.value})}><option value="cobertura">cobertura</option><option value="tempo_descoberto">tempo_descoberto</option><option value="incidentes">incidentes</option><option value="visitas">visitas</option><option value="reincidencia">reincidência</option><option value="sla">sla</option></select>
        <select value={defForm.source} onChange={e=>setDefForm({...defForm, source:e.target.value})}><option value="escala">escala</option><option value="cobertura">cobertura</option><option value="ocorrencia">ocorrência</option><option value="supervisao">supervisão</option><option value="ronda">ronda</option><option value="checklist">checklist</option><option value="manual">manual</option><option value="sistema">sistema</option></select>
        <select value={defForm.window_type} onChange={e=>setDefForm({...defForm, window_type:e.target.value})}><option value="diario">diário</option><option value="semanal">semanal</option><option value="mensal">mensal</option><option value="trimestral">trimestral</option><option value="anual">anual</option><option value="personalizado">personalizado</option></select>
        <input placeholder="descrição fórmula" value={defForm.description} onChange={e=>setDefForm({...defForm, description:e.target.value})} style={{ width:200 }} />
        <button onClick={createDef}>Criar Definição (fonte+janela)</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto" }}>{defs.map(d=>(<li key={d.id}>{d.name} {d.metric_type} fonte {d.source} janela {d.window_type} {d.is_active?"ativo":""}</li>))}</ul>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="definition_id" value={snapForm.definition_id} onChange={e=>setSnapForm({...snapForm, definition_id:e.target.value})} style={{ width:180 }} />
        <select value={snapForm.metric_type} onChange={e=>setSnapForm({...snapForm, metric_type:e.target.value})}><option value="cobertura">cobertura</option><option value="tempo_descoberto">tempo_descoberto</option><option value="incidentes">incidentes</option><option value="visitas">visitas</option><option value="reincidencia">reincidência</option></select>
        <select value={snapForm.source} onChange={e=>setSnapForm({...snapForm, source:e.target.value})}><option value="escala">escala</option><option value="cobertura">cobertura</option><option value="ocorrencia">ocorrência</option><option value="supervisao">supervisão</option><option value="ronda">ronda</option></select>
        <select value={snapForm.window_type} onChange={e=>setSnapForm({...snapForm, window_type:e.target.value})}><option value="diario">diário</option><option value="semanal">semanal</option><option value="mensal">mensal</option></select>
        <input type="date" value={snapForm.period_start} onChange={e=>setSnapForm({...snapForm, period_start:e.target.value})} />
        <input type="date" value={snapForm.period_end} onChange={e=>setSnapForm({...snapForm, period_end:e.target.value})} />
        <input placeholder="valor" type="number" value={snapForm.value} onChange={e=>setSnapForm({...snapForm, value:e.target.value})} style={{ width:80 }} />
        <input placeholder="unit %" value={snapForm.unit} onChange={e=>setSnapForm({...snapForm, unit:e.target.value})} style={{ width:60 }} />
        <input placeholder="post_id" value={snapForm.post_id} onChange={e=>setSnapForm({...snapForm, post_id:e.target.value})} style={{ width:150 }} />
        <button onClick={createSnap}>Criar Snapshot (fonte+janela+valor)</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto" }}>{snaps.map(s=>(<li key={s.id}>{s.metric_type} {s.source} {s.window_type} {s.period_start}→{s.period_end} {s.value}{s.unit} {s.status}</li>))}</ul>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="post_id reincidência" value={reincForm.post_id} onChange={e=>setReincForm({...reincForm, post_id:e.target.value})} style={{ width:180 }} />
        <input type="date" value={reincForm.first_date} onChange={e=>setReincForm({...reincForm, first_date:e.target.value})} />
        <input type="date" value={reincForm.last_date} onChange={e=>setReincForm({...reincForm, last_date:e.target.value})} />
        <input placeholder="count" type="number" value={reincForm.occurrence_count} onChange={e=>setReincForm({...reincForm, occurrence_count:e.target.value})} style={{ width:60 }} />
        <button onClick={createReinc}>Registrar Reincidência</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto" }}>{reincs.map(r=>(<li key={r.id}>post {r.post_id?.slice(0,8)} {r.occurrence_count}x {r.first_date}→{r.last_date} {r.days_between}d {r.is_reincidence?"REINCIDÊNCIA":""}</li>))}</ul>

      <h3>OPS-14 Escalas assistidas/automáticas depois regras validadas conflitos motivos revisão humana antes publicar</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="company_id" value={propForm.company_id} onChange={e=>setPropForm({...propForm, company_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="unit_id" value={propForm.unit_id} onChange={e=>setPropForm({...propForm, unit_id:e.target.value})} style={{ width:180 }} />
        <input type="date" value={propForm.period_start} onChange={e=>setPropForm({...propForm, period_start:e.target.value})} />
        <input type="date" value={propForm.period_end} onChange={e=>setPropForm({...propForm, period_end:e.target.value})} />
        <input placeholder="motivos" value={propForm.motives} onChange={e=>setPropForm({...propForm, motives:e.target.value})} style={{ width:200 }} />
        <button onClick={createProposal}>Gerar Proposta Assistida (valida regras aprovadas)</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:100, overflow:"auto" }}>
        {proposals.map(p=>(
          <li key={p.id}>{p.protocol} {p.period_start}→{p.period_end} {p.status} {p.is_human_reviewed?"REV HUM":""} {p.motives?.slice(0,30)} <button onClick={()=>loadConflicts(p.id)}>Conflitos/Entradas</button> <button onClick={()=>reviewProposal(p.id)}>Revisar Humano</button> <button onClick={()=>publishProposal(p.id)}>Publicar (revisão humana)</button></li>
        ))}
      </ul>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="proposal_id" value={entryForm.proposal_id} onChange={e=>setEntryForm({...entryForm, proposal_id:e.target.value})} style={{ width:200 }} />
        <input placeholder="post_id" value={entryForm.post_id} onChange={e=>setEntryForm({...entryForm, post_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="employee_id" value={entryForm.employee_id} onChange={e=>setEntryForm({...entryForm, employee_id:e.target.value})} style={{ width:180 }} />
        <input type="date" value={entryForm.entry_date} onChange={e=>setEntryForm({...entryForm, entry_date:e.target.value})} />
        <input placeholder="shift_template_id" value={entryForm.shift_template_id} onChange={e=>setEntryForm({...entryForm, shift_template_id:e.target.value})} style={{ width:180 }} />
        <button onClick={createEntry}>Adicionar Entrada (valida sobreposição/indisp/habilitação)</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto" }}>{entries.map(en=>(<li key={en.id}>{en.entry_date} post {en.post_id.slice(0,6)} emp {en.employee_id?.slice(0,6)||"-"} {en.status} {en.conflict_type?`CONFLITO ${en.conflict_type}`:""} {en.is_valid?"":"INVÁLIDO"}</li>))}</ul>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto", color:"#a00" }}>{conflicts.map(c=>(<li key={c.id}>{c.conflict_type} {c.description.slice(0,60)} {c.resolved?"resolvido":"PENDENTE"}</li>))}</ul>

      <h3>OPS-15 Supervisão limpeza rotinas por ambiente consumo não conformidades</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="post_id" value={envForm.post_id} onChange={e=>setEnvForm({...envForm, post_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="nome ambiente 3..200" value={envForm.name} onChange={e=>setEnvForm({...envForm, name:e.target.value})} />
        <select value={envForm.environment_type} onChange={e=>setEnvForm({...envForm, environment_type:e.target.value})}><option value="banheiro">banheiro</option><option value="escritorio">escritório</option><option value="corredor">corredor</option><option value="copa">copa</option><option value="recepcao">recepção</option><option value="area_externa">área externa</option></select>
        <input placeholder="área m2" value={envForm.area_m2} onChange={e=>setEnvForm({...envForm, area_m2:e.target.value})} style={{ width:80 }} />
        <button onClick={createEnv}>Criar Ambiente</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto" }}>{envs.map(ev=>(<li key={ev.id}>{ev.name} {ev.environment_type} {ev.area_m2}m² <button onClick={()=>{ loadRoutines(ev.id); setRoutForm({...routForm, environment_id:ev.id}); setExecForm({...execForm, environment_id:ev.id}); }}>Rotinas</button></li>))}</ul>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="environment_id" value={routForm.environment_id} onChange={e=>setRoutForm({...routForm, environment_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="título rotina 5..200" value={routForm.title} onChange={e=>setRoutForm({...routForm, title:e.target.value})} style={{ width:200 }} />
        <select value={routForm.routine_type} onChange={e=>setRoutForm({...routForm, routine_type:e.target.value})}><option value="limpeza">limpeza</option><option value="desinfeccao">desinfecção</option><option value="reposicao">reposição</option><option value="inspecao">inspeção</option></select>
        <select value={routForm.frequency} onChange={e=>setRoutForm({...routForm, frequency:e.target.value})}><option value="diaria">diária</option><option value="semanal">semanal</option><option value="por_turno">por turno</option><option value="sob_demanda">sob demanda</option></select>
        <button onClick={createRoutine}>Criar Rotina</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto" }}>{routines.map(r=>(<li key={r.id}>{r.title} {r.routine_type} {r.frequency} <button onClick={()=>setExecForm({...execForm, routine_id:r.id})}>+Exec</button></li>))}</ul>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="routine_id" value={execForm.routine_id} onChange={e=>setExecForm({...execForm, routine_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="environment_id" value={execForm.environment_id} onChange={e=>setExecForm({...execForm, environment_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="employee_id" value={execForm.employee_id} onChange={e=>setExecForm({...execForm, employee_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="score 0..100" value={execForm.score} onChange={e=>setExecForm({...execForm, score:e.target.value})} style={{ width:80 }} />
        <input placeholder="consumo qtd" value={execForm.consumption_quantity} onChange={e=>setExecForm({...execForm, consumption_quantity:e.target.value})} style={{ width:80 }} />
        <input placeholder="consumo desc" value={execForm.consumption_description} onChange={e=>setExecForm({...execForm, consumption_description:e.target.value})} />
        <button onClick={createExec}>Registrar Execução (consumo)</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto" }}>{execs.map(ex=>(<li key={ex.id}>{ex.executed_at.slice(0,10)} score {ex.score} consumo {ex.consumption_quantity} nc {ex.nonconformity_count} <button onClick={()=>setNcForm({...ncForm, execution_id:ex.id, environment_id:ex.environment_id})}>+NC</button></li>))}</ul>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="execution_id" value={ncForm.execution_id} onChange={e=>setNcForm({...ncForm, execution_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="environment_id" value={ncForm.environment_id} onChange={e=>setNcForm({...ncForm, environment_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="tipo 3..100" value={ncForm.type} onChange={e=>setNcForm({...ncForm, type:e.target.value})} />
        <input placeholder="descrição 10..2000" value={ncForm.description} onChange={e=>setNcForm({...ncForm, description:e.target.value})} style={{ width:200 }} />
        <select value={ncForm.severity} onChange={e=>setNcForm({...ncForm, severity:e.target.value})}><option value="baixa">baixa</option><option value="media">média</option><option value="alta">alta</option><option value="critica">crítica</option></select>
        <input placeholder="responsável" value={ncForm.responsible_name} onChange={e=>setNcForm({...ncForm, responsible_name:e.target.value})} />
        <input type="date" value={ncForm.due_date} onChange={e=>setNcForm({...ncForm, due_date:e.target.value})} />
        <button onClick={createNc}>Registrar Não Conformidade (reincidência)</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto" }}>{ncs.map(n=>(<li key={n.id}>{n.type} {n.severity} {n.status} {n.is_reincidence?"REINCIDÊNCIA":""} {n.description.slice(0,40)}</li>))}</ul>

      <h3>OPS-16 Eventos monitoramento via conector fila reconhecimento escalonamento não é central 24h não armazena vídeo</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="nome conector 3..200" value={connForm.name} onChange={e=>setConnForm({...connForm, name:e.target.value})} />
        <select value={connForm.connector_type} onChange={e=>setConnForm({...connForm, connector_type:e.target.value})}><option value="cftv">cftv</option><option value="alarme">alarme</option><option value="controle_acesso">controle acesso</option><option value="sensor">sensor</option><option value="botao_panico">botão pânico</option><option value="api_externa">api externa</option><option value="manual">manual</option></select>
        <button onClick={createConn}>Criar Conector (vídeo não armazenado)</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto" }}>{connectors.map(c=>(<li key={c.id}>{c.name} {c.connector_type} {c.status} {c.last_event_at?.slice(0,10)||"sem eventos"}</li>))}</ul>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="connector_id" value={evForm.connector_id} onChange={e=>setEvForm({...evForm, connector_id:e.target.value})} style={{ width:180 }} />
        <select value={evForm.event_type} onChange={e=>setEvForm({...evForm, event_type:e.target.value})}><option value="intrusao">intrusão</option><option value="falha_equipamento">falha equip</option><option value="porta_aberta">porta aberta</option><option value="movimento">movimento</option><option value="panico">pânico</option><option value="ronda_nao_realizada">ronda não realizada</option><option value="ocorrencia_critica">ocorrência crítica</option></select>
        <select value={evForm.severity} onChange={e=>setEvForm({...evForm, severity:e.target.value})}><option value="info">info</option><option value="baixa">baixa</option><option value="media">média</option><option value="alta">alta</option><option value="critica">crítica</option></select>
        <input placeholder="post_id" value={evForm.post_id} onChange={e=>setEvForm({...evForm, post_id:e.target.value})} style={{ width:150 }} />
        <input type="datetime-local" value={evForm.occurred_at} onChange={e=>setEvForm({...evForm, occurred_at:e.target.value})} />
        <input placeholder="notas" value={evForm.notes} onChange={e=>setEvForm({...evForm, notes:e.target.value})} />
        <button onClick={createEvent}>Criar Evento via Conector Fila</button>
      </div>
      <p style={{ fontSize:11, color:"#666" }}>Não construir substituto de central 24h ou armazenar vídeo sem projeto específico. Conector apenas fila reconhecimento escalonamento.</p>
      <ul style={{ fontSize:12, maxHeight:120, overflow:"auto" }}>
        {events.map(ev=>(
          <li key={ev.id}>{ev.protocol} {ev.event_type} {ev.severity} {ev.status} {ev.occurred_at.slice(0,16)} esc {ev.escalation_level} {ev.is_escalated?"ESCALONADO":""} <button onClick={()=>ackEvent(ev.id)}>Reconhecer</button> <button onClick={()=>escalateEvent(ev.id)}>Escalonar</button></li>
        ))}
      </ul>
    </section>
  );
}
