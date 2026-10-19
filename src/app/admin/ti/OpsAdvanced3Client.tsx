"use client";
import { useEffect, useState } from "react";
import UiState from "../../../components/ui/UiState";
import UiActionDialog, { type UiActionDialogRequest } from "../../../components/ui/UiActionDialog";
import styles from "./OpsAdvancedForms.module.css";
import { opsErrorFootnote, type OpsErrorDescriptor } from "../../../lib/ops-vocabulary.mjs";
import { opsRequest } from "../../../lib/ops-request";

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
  const [actionDialog, setActionDialog] = useState<UiActionDialogRequest | null>(null);
  // UX-07 (correção pontual, sem mudar URL/método/payload): antes, qualquer
  // falha de leitura (rede fora do ar, 500, 503 de auditoria) era engolida
  // pelo `.catch(()=>({definitions:[]}))` de cada fetch — a tela mostrava
  // "nenhum registro" quando na verdade a consulta nem chegou a responder.
  // Agora a falha real aparece como falha real, nunca como lista vazia.
  const [loadError, setLoadError] = useState<OpsErrorDescriptor | null>(null);

  async function loadAll() {
    setLoadError(null);
    const [dRes, sRes, rRes, pRes, eRes, cRes, evRes] = await Promise.all([
      opsRequest<{ definitions?: MetricDef[] }>("/api/hr/ops-metrics-definitions"),
      opsRequest<{ snapshots?: Snapshot[] }>("/api/hr/ops-metrics-snapshots"),
      opsRequest<{ reincidences?: Reinc[] }>("/api/hr/ops-metrics-reincidence"),
      opsRequest<{ proposals?: Proposal[] }>("/api/hr/ops-assisted-proposals"),
      opsRequest<{ environments?: CleanEnv[] }>("/api/hr/ops-cleaning-environments"),
      opsRequest<{ connectors?: Connector[] }>("/api/hr/ops-monitoring-connectors"),
      opsRequest<{ events?: MonEvent[] }>("/api/hr/ops-monitoring-events"),
    ]);
    const failed = [dRes, sRes, rRes, pRes, eRes, cRes, evRes].find(r => !r.ok);
    if (failed && !failed.ok) setLoadError(failed.error);
    if (dRes.ok) setDefs(dRes.data.definitions || []);
    if (sRes.ok) setSnaps(sRes.data.snapshots || []);
    if (rRes.ok) setReincs(rRes.data.reincidences || []);
    if (pRes.ok) setProposals(pRes.data.proposals || []);
    if (eRes.ok) setEnvs(eRes.data.environments || []);
    if (cRes.ok) setConnectors(cRes.data.connectors || []);
    if (evRes.ok) setEvents(evRes.data.events || []);
  }
  useEffect(()=>{ loadAll(); }, []);

  async function api(path:string, method:string, body?:any) {
    const res = await fetch(path, { method, headers: { "Content-Type":"application/json" }, body: body? JSON.stringify(body): undefined });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error || data.detail || "erro");
    return data;
  }

  // OPS-13
  const [defForm, setDefForm] = useState({ name:"", metric_type:"cobertura", source:"escala", window_type:"mensal", description:"", calculation_formula:"horas_cobertas / horas_previstas * 100" });
  async function createDef() {
    try { await api("/api/hr/ops-metrics-definitions","POST",{ name:defForm.name, metric_type:defForm.metric_type, source:defForm.source, window_type:defForm.window_type, description:defForm.description, calculation_formula:defForm.calculation_formula }); setMsg("Definição métrica criada fonte+janela"); loadAll(); } catch(e:any){ setMsg("Erro def: "+e.message); }
  }
  const [snapForm, setSnapForm] = useState({ definition_id:"", metric_type:"cobertura", source:"escala", window_type:"mensal", period_start:"", period_end:"", value:"", unit:"%", post_id:"", company_id:"", completeness_status:"parcial", incompleteness_reason:"Dados parciais informados manualmente" });
  async function createSnap() {
    try { await api("/api/hr/ops-metrics-snapshots","POST",{ definition_id:snapForm.definition_id||null, metric_type:snapForm.metric_type, source:snapForm.source, window_type:snapForm.window_type, period_start:snapForm.period_start, period_end:snapForm.period_end, value:parseFloat(snapForm.value), unit:snapForm.unit, post_id:snapForm.post_id||null, company_id:snapForm.company_id||null, completeness_status:snapForm.completeness_status, incompleteness_reason:snapForm.incompleteness_reason }); setMsg("Snapshot métrica criado"); loadAll(); } catch(e:any){ setMsg("Erro snap: "+e.message); }
  }
  const [reincForm, setReincForm] = useState({ post_id:"", first_date:"", last_date:"", occurrence_count:"2", company_id:"" });
  async function createReinc() {
    try { await api("/api/hr/ops-metrics-reincidence","POST",{ post_id:reincForm.post_id, first_date:reincForm.first_date, last_date:reincForm.last_date, occurrence_count:parseInt(reincForm.occurrence_count), company_id:reincForm.company_id||null }); setMsg("Reincidência registrada"); loadAll(); } catch(e:any){ setMsg("Erro reinc: "+e.message); }
  }

  // OPS-14
  const [propForm, setPropForm] = useState({ contract_id:"", company_id:"", unit_id:"", period_start:"", period_end:"", motives:"" });
  async function createProposal() {
    try { await api("/api/hr/ops-assisted-proposals","POST",{ contract_id:propForm.contract_id, company_id:propForm.company_id||null, unit_id:propForm.unit_id||null, period_start:propForm.period_start, period_end:propForm.period_end, motives:propForm.motives }); setMsg("Proposta escala assistida criada - regras validadas verificadas"); loadAll(); } catch(e:any){ setMsg("Erro proposta: "+e.message); }
  }
  function reviewProposal(id:string) {
    setActionDialog({
      key:`review-proposal-${id}`, title:"Revisar proposta de escala", submitLabel:"Iniciar análise humana",
      description:"A proposta precisa de revisão humana antes da publicação. Identifique a pessoa responsável.",
      fields:[{ name:"reviewed_by", label:"Responsável pela revisão", required:true, maxLength:200 }],
      onSubmit:async ({ reviewed_by }) => {
        await api("/api/hr/ops-assisted-proposals","PATCH",{ id, status:"em_analise", reviewed_by });
        setMsg("Proposta em análise humana"); setActionDialog(null); void loadAll();
      },
    });
  }
  function publishProposal(id:string) {
    setActionDialog({
      key:`publish-proposal-${id}`, title:"Publicar proposta de escala", submitLabel:"Confirmar publicação",
      description:"Confirme quem revisou as regras e os conflitos apresentados antes de publicar a escala assistida.",
      fields:[{ name:"reviewed_by", label:"Responsável pela publicação", required:true, maxLength:200 }],
      onSubmit:async ({ reviewed_by }) => {
        await api("/api/hr/ops-assisted-proposals","PATCH",{ id, status:"publicado", reviewed_by, motives:"Publicação confirmada após revisão humana dos conflitos" });
        setMsg("Escala assistida publicada"); setActionDialog(null); void loadAll();
      },
    });
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
    try { await api("/api/hr/ops-monitoring-connectors","POST",{ name:connForm.name, connector_type:connForm.connector_type, status:connForm.status, is_synthetic:true, config_sanitized:{ modo:"sintetico", armazenamento_video:false } }); setMsg("Conector monitoramento criado - vídeo não armazenado"); loadAll(); } catch(e:any){ setMsg("Erro conector: "+e.message); }
  }
  const [evForm, setEvForm] = useState({ connector_id:"", event_type:"intrusao", severity:"media", post_id:"", company_id:"", occurred_at:"", notes:"" });
  async function createEvent() {
    try { await api("/api/hr/ops-monitoring-events","POST",{ connector_id:evForm.connector_id||null, event_type:evForm.event_type, severity:evForm.severity, post_id:evForm.post_id||null, company_id:evForm.company_id||null, occurred_at:evForm.occurred_at||new Date().toISOString(), notes:evForm.notes, is_synthetic:true, payload:{ info:"evento sintético; não é central 24h nem produz despacho externo" } }); setMsg("Evento monitoramento via conector fila criado - não é central 24h"); loadAll(); } catch(e:any){ setMsg("Erro evento: "+e.message); }
  }
  function ackEvent(id:string) {
    setActionDialog({
      key:`ack-event-${id}`, title:"Reconhecer evento sintético", submitLabel:"Reconhecer evento",
      description:"Identifique a pessoa responsável pelo reconhecimento. Este fluxo não substitui uma central 24 horas.",
      fields:[{ name:"acknowledged_by", label:"Responsável pelo reconhecimento", required:true, maxLength:200 }],
      onSubmit:async ({ acknowledged_by }) => {
        await api("/api/hr/ops-monitoring-events","PATCH",{ id, status:"reconhecido", acknowledged_by });
        setMsg("Evento reconhecido"); setActionDialog(null); void loadAll();
      },
    });
  }
  function treatEvent(id:string) {
    setActionDialog({
      key:`treat-event-${id}`, title:"Registrar tratamento do evento", submitLabel:"Iniciar tratamento",
      description:"Descreva o tratamento interno deste evento sintético. Não registre segredos ou dados desnecessários.",
      fields:[{ name:"treatment_notes", label:"Tratamento interno", required:true, multiline:true, maxLength:2000 }],
      onSubmit:async ({ treatment_notes }) => {
        await api("/api/hr/ops-monitoring-events","PATCH",{ id, status:"em_tratamento", treatment_notes });
        setMsg("Evento sintético em tratamento"); setActionDialog(null); void loadAll();
      },
    });
  }
  function closeEvent(id:string) {
    setActionDialog({
      key:`close-event-${id}`, title:"Encerrar evento sintético", submitLabel:"Confirmar encerramento",
      description:"Identifique quem confirmou o encerramento. O registro indicará que não houve despacho externo.",
      fields:[{ name:"closed_by", label:"Responsável pelo encerramento", required:true, maxLength:200 }],
      onSubmit:async ({ closed_by }) => {
        await api("/api/hr/ops-monitoring-events","PATCH",{ id, status:"resolvido", closed_by, treatment_notes:"Tratamento sintético concluído sem despacho externo" });
        setMsg("Evento sintético encerrado"); setActionDialog(null); void loadAll();
      },
    });
  }

  return (
    <section style={{ marginTop:24, padding:16, border:"1px solid #999", borderRadius:8 }}>
      <UiActionDialog request={actionDialog} onCancel={() => setActionDialog(null)} />
      <h2 style={{ color:"var(--theme-accent)" }}>OPS-13/14/15/16 — Métricas, Escalas Assistidas, Limpeza, Monitoramento</h2>
      {loadError ? (
        <UiState
          variant="error"
          title={loadError.title}
          detail={`${loadError.detail} ${opsErrorFootnote(loadError)}`}
          retryLabel={loadError.canRetry ? "Tentar carregar novamente" : undefined}
          onRetry={loadError.canRetry ? () => { void loadAll(); } : undefined}
        />
      ) : null}
      {msg && <p style={{ background:"#eef", padding:8 }}>{msg}</p>}

      <h3>OPS-13 Métricas cobertura, tempo descoberto, incidentes, visitas, reincidência fonte janela</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <label className={styles.field} htmlFor="ops-a3-def-name">
          <span className={styles.caption}>Nome da métrica</span>
          <input id="ops-a3-def-name" placeholder="nome métrica 3..200" value={defForm.name} onChange={e=>setDefForm({...defForm, name:e.target.value})} style={{ width:200 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-def-metric-type">
          <span className={styles.caption}>Tipo de métrica</span>
          <select id="ops-a3-def-metric-type" value={defForm.metric_type} onChange={e=>setDefForm({...defForm, metric_type:e.target.value})}><option value="cobertura">cobertura</option><option value="tempo_descoberto">tempo_descoberto</option><option value="incidentes">incidentes</option><option value="visitas">visitas</option><option value="reincidencia">reincidência</option><option value="sla">sla</option></select>
        </label>
        <label className={styles.field} htmlFor="ops-a3-def-source">
          <span className={styles.caption}>Fonte do dado</span>
          <select id="ops-a3-def-source" value={defForm.source} onChange={e=>setDefForm({...defForm, source:e.target.value})}><option value="escala">escala</option><option value="cobertura">cobertura</option><option value="ocorrencia">ocorrência</option><option value="supervisao">supervisão</option><option value="ronda">ronda</option><option value="checklist">checklist</option><option value="manual">manual</option><option value="sistema">sistema</option></select>
        </label>
        <label className={styles.field} htmlFor="ops-a3-def-window-type">
          <span className={styles.caption}>Janela de apuração</span>
          <select id="ops-a3-def-window-type" value={defForm.window_type} onChange={e=>setDefForm({...defForm, window_type:e.target.value})}><option value="diario">diário</option><option value="semanal">semanal</option><option value="mensal">mensal</option><option value="trimestral">trimestral</option><option value="anual">anual</option><option value="personalizado">personalizado</option></select>
        </label>
        <label className={styles.field} htmlFor="ops-a3-def-description">
          <span className={styles.caption}>Descrição</span>
          <input id="ops-a3-def-description" placeholder="descrição" value={defForm.description} onChange={e=>setDefForm({...defForm, description:e.target.value})} style={{ width:180 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-def-calculation-formula">
          <span className={styles.caption}>Fórmula de cálculo</span>
          <input id="ops-a3-def-calculation-formula" placeholder="fórmula de cálculo" value={defForm.calculation_formula} onChange={e=>setDefForm({...defForm, calculation_formula:e.target.value})} style={{ width:260 }} />
        </label>
        <button onClick={createDef}>Criar Definição (fonte+janela+fórmula)</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto" }}>{defs.map(d=>(<li key={d.id}>{d.name} {d.metric_type} fonte {d.source} janela {d.window_type} {d.is_active?"ativo":""}</li>))}</ul>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <label className={styles.field} htmlFor="ops-a3-snap-definition-id">
          <span className={styles.caption}>Definição (ID)</span>
          <input id="ops-a3-snap-definition-id" placeholder="definition_id" value={snapForm.definition_id} onChange={e=>setSnapForm({...snapForm, definition_id:e.target.value})} style={{ width:180 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-snap-metric-type">
          <span className={styles.caption}>Tipo de métrica</span>
          <select id="ops-a3-snap-metric-type" value={snapForm.metric_type} onChange={e=>setSnapForm({...snapForm, metric_type:e.target.value})}><option value="cobertura">cobertura</option><option value="tempo_descoberto">tempo_descoberto</option><option value="incidentes">incidentes</option><option value="visitas">visitas</option><option value="reincidencia">reincidência</option></select>
        </label>
        <label className={styles.field} htmlFor="ops-a3-snap-source">
          <span className={styles.caption}>Fonte do dado</span>
          <select id="ops-a3-snap-source" value={snapForm.source} onChange={e=>setSnapForm({...snapForm, source:e.target.value})}><option value="escala">escala</option><option value="cobertura">cobertura</option><option value="ocorrencia">ocorrência</option><option value="supervisao">supervisão</option><option value="ronda">ronda</option></select>
        </label>
        <label className={styles.field} htmlFor="ops-a3-snap-window-type">
          <span className={styles.caption}>Janela de apuração</span>
          <select id="ops-a3-snap-window-type" value={snapForm.window_type} onChange={e=>setSnapForm({...snapForm, window_type:e.target.value})}><option value="diario">diário</option><option value="semanal">semanal</option><option value="mensal">mensal</option></select>
        </label>
        <label className={styles.field} htmlFor="ops-a3-snap-period-start">
          <span className={styles.caption}>Início do período</span>
          <input id="ops-a3-snap-period-start" type="date" value={snapForm.period_start} onChange={e=>setSnapForm({...snapForm, period_start:e.target.value})} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-snap-period-end">
          <span className={styles.caption}>Fim do período</span>
          <input id="ops-a3-snap-period-end" type="date" value={snapForm.period_end} onChange={e=>setSnapForm({...snapForm, period_end:e.target.value})} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-snap-value">
          <span className={styles.caption}>Valor</span>
          <input id="ops-a3-snap-value" placeholder="valor" type="number" value={snapForm.value} onChange={e=>setSnapForm({...snapForm, value:e.target.value})} style={{ width:80 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-snap-unit">
          <span className={styles.caption}>Unidade</span>
          <input id="ops-a3-snap-unit" placeholder="unit %" value={snapForm.unit} onChange={e=>setSnapForm({...snapForm, unit:e.target.value})} style={{ width:60 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-snap-post-id">
          <span className={styles.caption}>Posto (ID)</span>
          <input id="ops-a3-snap-post-id" placeholder="post_id" value={snapForm.post_id} onChange={e=>setSnapForm({...snapForm, post_id:e.target.value})} style={{ width:150 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-snap-completeness-status">
          <span className={styles.caption}>Status de completude</span>
          <select id="ops-a3-snap-completeness-status" value={snapForm.completeness_status} onChange={e=>setSnapForm({...snapForm, completeness_status:e.target.value})}><option value="completo">completo</option><option value="parcial">parcial</option><option value="incompleto">incompleto</option></select>
        </label>
        <label className={styles.field} htmlFor="ops-a3-snap-incompleteness-reason">
          <span className={styles.caption}>Motivo da incompletude</span>
          <input id="ops-a3-snap-incompleteness-reason" placeholder="motivo da incompletude" value={snapForm.incompleteness_reason} onChange={e=>setSnapForm({...snapForm, incompleteness_reason:e.target.value})} style={{ width:240 }} />
        </label>
        <button onClick={createSnap}>Criar Snapshot (fonte+janela+valor)</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto" }}>{snaps.map(s=>(<li key={s.id}>{s.metric_type} {s.source} {s.window_type} {s.period_start}→{s.period_end} {s.value}{s.unit} {s.status}</li>))}</ul>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <label className={styles.field} htmlFor="ops-a3-reinc-post-id">
          <span className={styles.caption}>Posto (ID)</span>
          <input id="ops-a3-reinc-post-id" placeholder="post_id reincidência" value={reincForm.post_id} onChange={e=>setReincForm({...reincForm, post_id:e.target.value})} style={{ width:180 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-reinc-first-date">
          <span className={styles.caption}>Data da primeira ocorrência</span>
          <input id="ops-a3-reinc-first-date" type="date" value={reincForm.first_date} onChange={e=>setReincForm({...reincForm, first_date:e.target.value})} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-reinc-last-date">
          <span className={styles.caption}>Data da última ocorrência</span>
          <input id="ops-a3-reinc-last-date" type="date" value={reincForm.last_date} onChange={e=>setReincForm({...reincForm, last_date:e.target.value})} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-reinc-occurrence-count">
          <span className={styles.caption}>Número de ocorrências</span>
          <input id="ops-a3-reinc-occurrence-count" placeholder="count" type="number" value={reincForm.occurrence_count} onChange={e=>setReincForm({...reincForm, occurrence_count:e.target.value})} style={{ width:60 }} />
        </label>
        <button onClick={createReinc}>Registrar Reincidência</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto" }}>{reincs.map(r=>(<li key={r.id}>post {r.post_id?.slice(0,8)} {r.occurrence_count}x {r.first_date}→{r.last_date} {r.days_between}d {r.is_reincidence?"REINCIDÊNCIA":""}</li>))}</ul>

      <h3>OPS-14 Escalas assistidas/automáticas depois regras validadas conflitos motivos revisão humana antes publicar</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <label className={styles.field} htmlFor="ops-a3-prop-contract-id">
          <span className={styles.caption}>Contrato ativo (ID)</span>
          <input id="ops-a3-prop-contract-id" placeholder="contract_id ativo" value={propForm.contract_id} onChange={e=>setPropForm({...propForm, contract_id:e.target.value})} style={{ width:180 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-prop-company-id">
          <span className={styles.caption}>Empresa (ID)</span>
          <input id="ops-a3-prop-company-id" placeholder="company_id" value={propForm.company_id} onChange={e=>setPropForm({...propForm, company_id:e.target.value})} style={{ width:180 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-prop-unit-id">
          <span className={styles.caption}>Unidade (ID)</span>
          <input id="ops-a3-prop-unit-id" placeholder="unit_id" value={propForm.unit_id} onChange={e=>setPropForm({...propForm, unit_id:e.target.value})} style={{ width:180 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-prop-period-start">
          <span className={styles.caption}>Início do período</span>
          <input id="ops-a3-prop-period-start" type="date" value={propForm.period_start} onChange={e=>setPropForm({...propForm, period_start:e.target.value})} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-prop-period-end">
          <span className={styles.caption}>Fim do período</span>
          <input id="ops-a3-prop-period-end" type="date" value={propForm.period_end} onChange={e=>setPropForm({...propForm, period_end:e.target.value})} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-prop-motives">
          <span className={styles.caption}>Motivos</span>
          <input id="ops-a3-prop-motives" placeholder="motivos" value={propForm.motives} onChange={e=>setPropForm({...propForm, motives:e.target.value})} style={{ width:200 }} />
        </label>
        <button onClick={createProposal}>Gerar Proposta Assistida (valida regras aprovadas)</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:100, overflow:"auto" }}>
        {proposals.map(p=>(
          <li key={p.id}>{p.protocol} {p.period_start}→{p.period_end} {p.status} {p.is_human_reviewed?"REV HUM":""} {p.motives?.slice(0,30)} <button onClick={()=>loadConflicts(p.id)}>Conflitos/Entradas</button> <button onClick={()=>reviewProposal(p.id)}>Revisar Humano</button> <button onClick={()=>publishProposal(p.id)}>Publicar (revisão humana)</button></li>
        ))}
      </ul>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <label className={styles.field} htmlFor="ops-a3-entry-proposal-id">
          <span className={styles.caption}>Proposta (ID)</span>
          <input id="ops-a3-entry-proposal-id" placeholder="proposal_id" value={entryForm.proposal_id} onChange={e=>setEntryForm({...entryForm, proposal_id:e.target.value})} style={{ width:200 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-entry-post-id">
          <span className={styles.caption}>Posto (ID)</span>
          <input id="ops-a3-entry-post-id" placeholder="post_id" value={entryForm.post_id} onChange={e=>setEntryForm({...entryForm, post_id:e.target.value})} style={{ width:180 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-entry-employee-id">
          <span className={styles.caption}>Profissional (ID)</span>
          <input id="ops-a3-entry-employee-id" placeholder="employee_id" value={entryForm.employee_id} onChange={e=>setEntryForm({...entryForm, employee_id:e.target.value})} style={{ width:180 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-entry-entry-date">
          <span className={styles.caption}>Data da entrada</span>
          <input id="ops-a3-entry-entry-date" type="date" value={entryForm.entry_date} onChange={e=>setEntryForm({...entryForm, entry_date:e.target.value})} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-entry-shift-template-id">
          <span className={styles.caption}>Modelo de turno (ID)</span>
          <input id="ops-a3-entry-shift-template-id" placeholder="shift_template_id" value={entryForm.shift_template_id} onChange={e=>setEntryForm({...entryForm, shift_template_id:e.target.value})} style={{ width:180 }} />
        </label>
        <button onClick={createEntry}>Adicionar Entrada (valida sobreposição/indisp/habilitação)</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto" }}>{entries.map(en=>(<li key={en.id}>{en.entry_date} post {en.post_id.slice(0,6)} emp {en.employee_id?.slice(0,6)||"-"} {en.status} {en.conflict_type?`CONFLITO ${en.conflict_type}`:""} {en.is_valid?"":"INVÁLIDO"}</li>))}</ul>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto", color:"#a00" }}>{conflicts.map(c=>(<li key={c.id}>{c.conflict_type} {c.description.slice(0,60)} {c.resolved?"resolvido":"PENDENTE"}</li>))}</ul>

      <h3>OPS-15 Supervisão limpeza rotinas por ambiente consumo não conformidades</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <label className={styles.field} htmlFor="ops-a3-env-post-id">
          <span className={styles.caption}>Posto (ID)</span>
          <input id="ops-a3-env-post-id" placeholder="post_id" value={envForm.post_id} onChange={e=>setEnvForm({...envForm, post_id:e.target.value})} style={{ width:180 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-env-name">
          <span className={styles.caption}>Nome do ambiente</span>
          <input id="ops-a3-env-name" placeholder="nome ambiente 3..200" value={envForm.name} onChange={e=>setEnvForm({...envForm, name:e.target.value})} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-env-environment-type">
          <span className={styles.caption}>Tipo de ambiente</span>
          <select id="ops-a3-env-environment-type" value={envForm.environment_type} onChange={e=>setEnvForm({...envForm, environment_type:e.target.value})}><option value="banheiro">banheiro</option><option value="escritorio">escritório</option><option value="corredor">corredor</option><option value="copa">copa</option><option value="recepcao">recepção</option><option value="area_externa">área externa</option></select>
        </label>
        <label className={styles.field} htmlFor="ops-a3-env-area-m2">
          <span className={styles.caption}>Área (m²)</span>
          <input id="ops-a3-env-area-m2" placeholder="área m2" value={envForm.area_m2} onChange={e=>setEnvForm({...envForm, area_m2:e.target.value})} style={{ width:80 }} />
        </label>
        <button onClick={createEnv}>Criar Ambiente</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto" }}>{envs.map(ev=>(<li key={ev.id}>{ev.name} {ev.environment_type} {ev.area_m2}m² <button onClick={()=>{ loadRoutines(ev.id); setRoutForm({...routForm, environment_id:ev.id}); setExecForm({...execForm, environment_id:ev.id}); }}>Rotinas</button></li>))}</ul>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <label className={styles.field} htmlFor="ops-a3-rout-environment-id">
          <span className={styles.caption}>Ambiente (ID)</span>
          <input id="ops-a3-rout-environment-id" placeholder="environment_id" value={routForm.environment_id} onChange={e=>setRoutForm({...routForm, environment_id:e.target.value})} style={{ width:180 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-rout-title">
          <span className={styles.caption}>Título da rotina</span>
          <input id="ops-a3-rout-title" placeholder="título rotina 5..200" value={routForm.title} onChange={e=>setRoutForm({...routForm, title:e.target.value})} style={{ width:200 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-rout-routine-type">
          <span className={styles.caption}>Tipo de rotina</span>
          <select id="ops-a3-rout-routine-type" value={routForm.routine_type} onChange={e=>setRoutForm({...routForm, routine_type:e.target.value})}><option value="limpeza">limpeza</option><option value="desinfeccao">desinfecção</option><option value="reposicao">reposição</option><option value="inspecao">inspeção</option></select>
        </label>
        <label className={styles.field} htmlFor="ops-a3-rout-frequency">
          <span className={styles.caption}>Frequência</span>
          <select id="ops-a3-rout-frequency" value={routForm.frequency} onChange={e=>setRoutForm({...routForm, frequency:e.target.value})}><option value="diaria">diária</option><option value="semanal">semanal</option><option value="por_turno">por turno</option><option value="sob_demanda">sob demanda</option></select>
        </label>
        <button onClick={createRoutine}>Criar Rotina</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto" }}>{routines.map(r=>(<li key={r.id}>{r.title} {r.routine_type} {r.frequency} <button onClick={()=>setExecForm({...execForm, routine_id:r.id})}>+Exec</button></li>))}</ul>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <label className={styles.field} htmlFor="ops-a3-exec-routine-id">
          <span className={styles.caption}>Rotina (ID)</span>
          <input id="ops-a3-exec-routine-id" placeholder="routine_id" value={execForm.routine_id} onChange={e=>setExecForm({...execForm, routine_id:e.target.value})} style={{ width:180 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-exec-environment-id">
          <span className={styles.caption}>Ambiente (ID)</span>
          <input id="ops-a3-exec-environment-id" placeholder="environment_id" value={execForm.environment_id} onChange={e=>setExecForm({...execForm, environment_id:e.target.value})} style={{ width:180 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-exec-employee-id">
          <span className={styles.caption}>Profissional (ID)</span>
          <input id="ops-a3-exec-employee-id" placeholder="employee_id" value={execForm.employee_id} onChange={e=>setExecForm({...execForm, employee_id:e.target.value})} style={{ width:180 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-exec-score">
          <span className={styles.caption}>Nota (0 a 100)</span>
          <input id="ops-a3-exec-score" placeholder="score 0..100" value={execForm.score} onChange={e=>setExecForm({...execForm, score:e.target.value})} style={{ width:80 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-exec-consumption-quantity">
          <span className={styles.caption}>Quantidade consumida</span>
          <input id="ops-a3-exec-consumption-quantity" placeholder="consumo qtd" value={execForm.consumption_quantity} onChange={e=>setExecForm({...execForm, consumption_quantity:e.target.value})} style={{ width:80 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-exec-consumption-description">
          <span className={styles.caption}>Descrição do consumo</span>
          <input id="ops-a3-exec-consumption-description" placeholder="consumo desc" value={execForm.consumption_description} onChange={e=>setExecForm({...execForm, consumption_description:e.target.value})} />
        </label>
        <button onClick={createExec}>Registrar Execução (consumo)</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto" }}>{execs.map(ex=>(<li key={ex.id}>{ex.executed_at.slice(0,10)} score {ex.score} consumo {ex.consumption_quantity} nc {ex.nonconformity_count} <button onClick={()=>setNcForm({...ncForm, execution_id:ex.id, environment_id:ex.environment_id})}>+NC</button></li>))}</ul>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <label className={styles.field} htmlFor="ops-a3-nc-execution-id">
          <span className={styles.caption}>Execução (ID)</span>
          <input id="ops-a3-nc-execution-id" placeholder="execution_id" value={ncForm.execution_id} onChange={e=>setNcForm({...ncForm, execution_id:e.target.value})} style={{ width:180 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-nc-environment-id">
          <span className={styles.caption}>Ambiente (ID)</span>
          <input id="ops-a3-nc-environment-id" placeholder="environment_id" value={ncForm.environment_id} onChange={e=>setNcForm({...ncForm, environment_id:e.target.value})} style={{ width:180 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-nc-type">
          <span className={styles.caption}>Tipo de não conformidade</span>
          <input id="ops-a3-nc-type" placeholder="tipo 3..100" value={ncForm.type} onChange={e=>setNcForm({...ncForm, type:e.target.value})} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-nc-description">
          <span className={styles.caption}>Descrição</span>
          <input id="ops-a3-nc-description" placeholder="descrição 10..2000" value={ncForm.description} onChange={e=>setNcForm({...ncForm, description:e.target.value})} style={{ width:200 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-nc-severity">
          <span className={styles.caption}>Severidade</span>
          <select id="ops-a3-nc-severity" value={ncForm.severity} onChange={e=>setNcForm({...ncForm, severity:e.target.value})}><option value="baixa">baixa</option><option value="media">média</option><option value="alta">alta</option><option value="critica">crítica</option></select>
        </label>
        <label className={styles.field} htmlFor="ops-a3-nc-responsible-name">
          <span className={styles.caption}>Responsável</span>
          <input id="ops-a3-nc-responsible-name" placeholder="responsável" value={ncForm.responsible_name} onChange={e=>setNcForm({...ncForm, responsible_name:e.target.value})} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-nc-due-date">
          <span className={styles.caption}>Prazo de correção</span>
          <input id="ops-a3-nc-due-date" type="date" value={ncForm.due_date} onChange={e=>setNcForm({...ncForm, due_date:e.target.value})} />
        </label>
        <button onClick={createNc}>Registrar Não Conformidade (reincidência)</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto" }}>{ncs.map(n=>(<li key={n.id}>{n.type} {n.severity} {n.status} {n.is_reincidence?"REINCIDÊNCIA":""} {n.description.slice(0,40)}</li>))}</ul>

      <h3>OPS-16 Eventos monitoramento via conector fila reconhecimento escalonamento não é central 24h não armazena vídeo</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <label className={styles.field} htmlFor="ops-a3-conn-name">
          <span className={styles.caption}>Nome do conector</span>
          <input id="ops-a3-conn-name" placeholder="nome conector 3..200" value={connForm.name} onChange={e=>setConnForm({...connForm, name:e.target.value})} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-conn-connector-type">
          <span className={styles.caption}>Tipo de conector</span>
          <select id="ops-a3-conn-connector-type" value={connForm.connector_type} onChange={e=>setConnForm({...connForm, connector_type:e.target.value})}><option value="cftv">cftv</option><option value="alarme">alarme</option><option value="controle_acesso">controle acesso</option><option value="sensor">sensor</option><option value="botao_panico">botão pânico</option><option value="api_externa">api externa</option><option value="manual">manual</option></select>
        </label>
        <button onClick={createConn}>Criar Conector (vídeo não armazenado)</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:80, overflow:"auto" }}>{connectors.map(c=>(<li key={c.id}>{c.name} {c.connector_type} {c.status} {c.last_event_at?.slice(0,10)||"sem eventos"}</li>))}</ul>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <label className={styles.field} htmlFor="ops-a3-ev-connector-id">
          <span className={styles.caption}>Conector (ID)</span>
          <input id="ops-a3-ev-connector-id" placeholder="connector_id" value={evForm.connector_id} onChange={e=>setEvForm({...evForm, connector_id:e.target.value})} style={{ width:180 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-ev-event-type">
          <span className={styles.caption}>Tipo de evento</span>
          <select id="ops-a3-ev-event-type" value={evForm.event_type} onChange={e=>setEvForm({...evForm, event_type:e.target.value})}><option value="intrusao">intrusão sintética</option><option value="falha_equipamento">falha de equipamento sintética</option><option value="panico_simulado">pânico simulado</option></select>
        </label>
        <label className={styles.field} htmlFor="ops-a3-ev-severity">
          <span className={styles.caption}>Severidade</span>
          <select id="ops-a3-ev-severity" value={evForm.severity} onChange={e=>setEvForm({...evForm, severity:e.target.value})}><option value="info">info</option><option value="baixa">baixa</option><option value="media">média</option><option value="alta">alta</option><option value="critica">crítica</option></select>
        </label>
        <label className={styles.field} htmlFor="ops-a3-ev-post-id">
          <span className={styles.caption}>Posto (ID)</span>
          <input id="ops-a3-ev-post-id" placeholder="post_id" value={evForm.post_id} onChange={e=>setEvForm({...evForm, post_id:e.target.value})} style={{ width:150 }} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-ev-occurred-at">
          <span className={styles.caption}>Data e hora da ocorrência</span>
          <input id="ops-a3-ev-occurred-at" type="datetime-local" value={evForm.occurred_at} onChange={e=>setEvForm({...evForm, occurred_at:e.target.value})} />
        </label>
        <label className={styles.field} htmlFor="ops-a3-ev-notes">
          <span className={styles.caption}>Notas</span>
          <input id="ops-a3-ev-notes" placeholder="notas" value={evForm.notes} onChange={e=>setEvForm({...evForm, notes:e.target.value})} />
        </label>
        <button onClick={createEvent}>Criar Evento via Conector Fila</button>
      </div>
      <p style={{ fontSize:11, color:"#666" }}>Não construir substituto de central 24h ou armazenar vídeo sem projeto específico. Conector apenas fila reconhecimento escalonamento.</p>
      <ul style={{ fontSize:12, maxHeight:120, overflow:"auto" }}>
        {events.map(ev=>(
          <li key={ev.id}>{ev.protocol} {ev.event_type} {ev.severity} {ev.status} {ev.occurred_at.slice(0,16)} — SINTÉTICO <button onClick={()=>ackEvent(ev.id)}>Reconhecer</button> <button onClick={()=>treatEvent(ev.id)}>Tratar</button> <button onClick={()=>closeEvent(ev.id)}>Encerrar</button></li>
        ))}
      </ul>
    </section>
  );
}
