"use client";
import { useEffect, useState } from "react";

type Visit = { id:string; protocol:string; post_id:string; company_id:string|null; supervisor_employee_id:string|null; scheduled_date:string; executed_at:string|null; status:string; score:number|null; findings:string|null; responsible_name:string|null; verified_by:string|null; is_private:boolean; };
type Inspection = { id:string; visit_id:string; inspection_type:string; status:string; title:string; description:string|null; result:string|null; score:number|null; };
type ActionPlan = { id:string; visit_id:string|null; inspection_id:string|null; occurrence_id:string|null; title:string; description:string; responsible_name:string; due_date:string; status:string; priority:string; verified_by:string|null; };
type Patrol = { id:string; protocol:string; post_id:string; patrol_date:string; status:string; route_name:string|null; };
type Point = { id:string; patrol_id:string; point_name:string; expected_time:string|null; actual_time:string|null; latitude:number|null; longitude:number|null; qr_code:string|null; status:string; is_replay_detected:boolean; replay_reason:string|null; evidence_url:string|null; location_unavailable:boolean; location_unavailable_reason:string|null; verified_by:string|null; };
type Key = { id:string; code:string; description:string; key_type:string; status:string; location:string|null; is_blocked:boolean; current_holder_employee_id:string|null; };
type Movement = { id:string; key_id:string; movement_type:string; from_employee_id:string|null; to_employee_id:string|null; reason:string; movement_date:string; };
type Report = { id:string; protocol:string; company_id:string; contract_id:string|null; report_type:string; period_start:string; period_end:string; title:string; content:string; status:string; contains_personal_data:boolean; is_approved_for_client:boolean; privacy_reviewed_at:string|null; };

export default function OpsAdvanced2Client() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [actionPlans, setActionPlans] = useState<ActionPlan[]>([]);
  const [patrols, setPatrols] = useState<Patrol[]>([]);
  const [points, setPoints] = useState<Point[]>([]);
  const [keys, setKeys] = useState<Key[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [msg, setMsg] = useState("");

  async function loadAll() {
    try {
      const [vRes, pRes, kRes, rRes] = await Promise.all([
        fetch("/api/hr/ops-supervision-visits").then(r=>r.json()).catch(()=>({visits:[]})),
        fetch("/api/hr/ops-patrols").then(r=>r.json()).catch(()=>({patrols:[]})),
        fetch("/api/hr/ops-keys").then(r=>r.json()).catch(()=>({keys:[]})),
        fetch("/api/hr/ops-client-reports").then(r=>r.json()).catch(()=>({reports:[]})),
      ]);
      if (vRes.visits) setVisits(vRes.visits);
      if (pRes.patrols) setPatrols(pRes.patrols);
      if (kRes.keys) setKeys(kRes.keys);
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

  // OPS-09
  const [visitForm, setVisitForm] = useState({ post_id:"", company_id:"", supervisor_employee_id:"", scheduled_date:"", responsible_name:"", findings:"" });
  async function createVisit() {
    try {
      await api("/api/hr/ops-supervision-visits","POST",{ post_id:visitForm.post_id, company_id:visitForm.company_id||null, supervisor_employee_id:visitForm.supervisor_employee_id||null, scheduled_date:visitForm.scheduled_date, responsible_name:visitForm.responsible_name, findings:visitForm.findings });
      setMsg("Visita supervisão criada"); loadAll();
    } catch(e:any){ setMsg("Erro visita: "+e.message); }
  }
  async function verifyVisit(id:string) {
    const verified_by = prompt("Responsável verificação (decisão humana):");
    if (!verified_by) return;
    const verification_notes = prompt("Notas verificação:")||"";
    try { await api("/api/hr/ops-supervision-visits","PATCH",{ id, status:"pendente_verificacao", verified_by, verification_notes }); setMsg("Visita em verificação"); loadAll(); } catch(e:any){ setMsg(e.message); }
  }
  async function realizeVisit(id:string) {
    try { await api("/api/hr/ops-supervision-visits","PATCH",{ id, status:"realizada" }); setMsg("Visita realizada"); loadAll(); } catch(e:any){ setMsg(e.message); }
  }

  const [inspForm, setInspForm] = useState({ visit_id:"", title:"", description:"", inspection_type:"rotina" });
  async function createInspection() {
    try { await api("/api/hr/ops-supervision-inspections","POST",{ visit_id:inspForm.visit_id, title:inspForm.title, description:inspForm.description, inspection_type:inspForm.inspection_type }); setMsg("Inspeção criada"); const d=await api("/api/hr/ops-supervision-inspections?visit_id="+inspForm.visit_id,"GET"); if(d.inspections) setInspections(d.inspections); } catch(e:any){ setMsg("Erro inspeção: "+e.message); }
  }
  async function loadInspections(visit_id:string) {
    try { const d=await api("/api/hr/ops-supervision-inspections?visit_id="+visit_id,"GET"); if(d.inspections) setInspections(d.inspections); } catch {}
  }

  const [apForm, setApForm] = useState({ visit_id:"", inspection_id:"", title:"", description:"", responsible_name:"", due_date:"", priority:"media" });
  async function createActionPlan() {
    try { await api("/api/hr/ops-supervision-action-plans","POST",{ visit_id:apForm.visit_id||null, inspection_id:apForm.inspection_id||null, title:apForm.title, description:apForm.description, responsible_name:apForm.responsible_name, due_date:apForm.due_date, priority:apForm.priority }); setMsg("Plano ação criado prazo responsável"); loadActionPlans(); } catch(e:any){ setMsg("Erro plano: "+e.message); }
  }
  async function loadActionPlans() {
    try { const d=await api("/api/hr/ops-supervision-action-plans","GET"); if(d.actionPlans) setActionPlans(d.actionPlans); } catch {}
  }
  async function verifyActionPlan(id:string) {
    const verified_by = prompt("Responsável verificação plano (humano):");
    if (!verified_by) return;
    try { await api("/api/hr/ops-supervision-action-plans","PATCH",{ id, status:"verificado", verified_by }); setMsg("Plano verificado"); loadActionPlans(); } catch(e:any){ setMsg(e.message); }
  }

  // OPS-10
  const [patrolForm, setPatrolForm] = useState({ post_id:"", patrol_date:"", route_name:"" });
  async function createPatrol() {
    try { await api("/api/hr/ops-patrols","POST",{ post_id:patrolForm.post_id, patrol_date:patrolForm.patrol_date, route_name:patrolForm.route_name }); setMsg("Ronda criada"); loadAll(); } catch(e:any){ setMsg("Erro ronda: "+e.message); }
  }
  const [pointForm, setPointForm] = useState({ patrol_id:"", point_name:"", qr_code:"", latitude:"", longitude:"", evidence_url:"", location_unavailable:"false", location_unavailable_reason:"" });
  async function createPoint() {
    try {
      const body:any = { patrol_id:pointForm.patrol_id, point_name:pointForm.point_name, qr_code:pointForm.qr_code||null, evidence_url:pointForm.evidence_url||null, location_unavailable: pointForm.location_unavailable==="true" };
      if (pointForm.latitude) body.latitude = parseFloat(pointForm.latitude);
      if (pointForm.longitude) body.longitude = parseFloat(pointForm.longitude);
      if (body.location_unavailable) body.location_unavailable_reason = pointForm.location_unavailable_reason;
      const d = await api("/api/hr/ops-patrol-points","POST",body);
      setMsg(d.replay_detected? "Replay detectado: "+d.point.replay_reason : "Ponto ronda criado evidência auditável");
      const pts = await api("/api/hr/ops-patrol-points?patrol_id="+pointForm.patrol_id,"GET");
      if (pts.points) setPoints(pts.points);
    } catch(e:any){ setMsg("Erro ponto: "+e.message); }
  }
  async function loadPoints(patrol_id:string) {
    try { const d=await api("/api/hr/ops-patrol-points?patrol_id="+patrol_id,"GET"); if(d.points) setPoints(d.points); } catch {}
  }
  async function verifyPoint(id:string) {
    const verified_by = prompt("Responsável verificação ponto (GPS/QR isolado não prova execução):");
    if (!verified_by) return;
    try { await api("/api/hr/ops-patrol-points","PATCH",{ id, verified_by, status:"visitado" }); setMsg("Ponto verificado humano"); loadAll(); } catch(e:any){ setMsg(e.message); }
  }

  // OPS-11
  const [keyForm, setKeyForm] = useState({ code:"", description:"", key_type:"chave", location:"" });
  async function createKey() {
    try { await api("/api/hr/ops-keys","POST",{ code:keyForm.code, description:keyForm.description, key_type:keyForm.key_type, location:keyForm.location }); setMsg("Chave/rádio/equip criado"); loadAll(); } catch(e:any){ setMsg("Erro chave: "+e.message); }
  }
  const [movForm, setMovForm] = useState({ key_id:"", movement_type:"retirada", from_employee_id:"", to_employee_id:"", reason:"", purpose:"", authorized_by:"" });
  async function createMovement() {
    try { await api("/api/hr/ops-key-movements","POST",{ key_id:movForm.key_id, movement_type:movForm.movement_type, from_employee_id:movForm.from_employee_id||null, to_employee_id:movForm.to_employee_id||null, reason:movForm.reason, purpose:movForm.purpose, authorized_by:movForm.authorized_by }); setMsg("Movimentação guarda/transferência/devolução registrada"); const d=await api("/api/hr/ops-key-movements?key_id="+movForm.key_id,"GET"); if(d.movements) setMovements(d.movements); loadAll(); } catch(e:any){ setMsg("Erro mov: "+e.message); }
  }
  async function loadMovements(key_id:string) {
    try { const d=await api("/api/hr/ops-key-movements?key_id="+key_id,"GET"); if(d.movements) setMovements(d.movements); } catch {}
  }

  // OPS-12
  const [reportForm, setReportForm] = useState({ company_id:"", contract_id:"", post_id:"", report_type:"mensal", period_start:"", period_end:"", title:"", content:"" });
  async function createReport() {
    try {
      const d = await api("/api/hr/ops-client-reports","POST",{ company_id:reportForm.company_id, contract_id:reportForm.contract_id||null, post_id:reportForm.post_id||null, report_type:reportForm.report_type, period_start:reportForm.period_start, period_end:reportForm.period_end, title:reportForm.title, content:reportForm.content });
      setMsg(d.privacy_note || "Relatório criado rascunho");
      loadAll();
    } catch(e:any){ setMsg("Erro relatório: "+e.message); }
  }
  async function reviewReport(id:string) {
    const reviewed_by = prompt("Revisor conteúdo:"); if(!reviewed_by) return;
    try { await api("/api/hr/ops-client-reports","PATCH",{ id, status:"em_revisao", reviewed_by }); setMsg("Relatório em revisão"); loadAll(); } catch(e:any){ setMsg(e.message); }
  }
  async function privacyReviewReport(id:string) {
    const privacy_reviewed_by = prompt("Responsável revisão privacidade:"); if(!privacy_reviewed_by) return;
    const privacy_review_notes = prompt("Notas privacidade:")||"";
    try { await api("/api/hr/ops-client-reports","PATCH",{ id, privacy_reviewed_by, privacy_review_notes }); setMsg("Revisão privacidade registrada"); loadAll(); } catch(e:any){ setMsg(e.message); }
  }
  async function approveReport(id:string) {
    const approved_by = prompt("Aprovador (cliente só recebe aprovado próprio contrato):"); if(!approved_by) return;
    try { await api("/api/hr/ops-client-reports","PATCH",{ id, status:"aprovado", approved_by }); setMsg("Relatório aprovado para cliente"); loadAll(); } catch(e:any){ setMsg(e.message); }
  }
  async function sendReport(id:string) {
    try { await api("/api/hr/ops-client-reports","PATCH",{ id, status:"enviado" }); setMsg("Relatório enviado ao cliente (aprovado)"); loadAll(); } catch(e:any){ setMsg(e.message); }
  }

  return (
    <section style={{ marginTop:24, padding:16, border:"1px solid #ccc", borderRadius:8 }}>
      <h2 style={{ color:"var(--theme-accent)" }}>OPS-09/10/11/12 — Supervisão, Rondas, Chaves, Relatórios Cliente</h2>
      {msg && <p style={{ background:"#eef", padding:8 }}>{msg}</p>}

      <h3>OPS-09 Visitas Supervisão</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="post_id UUID" value={visitForm.post_id} onChange={e=>setVisitForm({...visitForm, post_id:e.target.value})} style={{ width:220 }} />
        <input placeholder="company_id" value={visitForm.company_id} onChange={e=>setVisitForm({...visitForm, company_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="supervisor_employee_id" value={visitForm.supervisor_employee_id} onChange={e=>setVisitForm({...visitForm, supervisor_employee_id:e.target.value})} style={{ width:200 }} />
        <input type="date" value={visitForm.scheduled_date} onChange={e=>setVisitForm({...visitForm, scheduled_date:e.target.value})} />
        <input placeholder="responsável" value={visitForm.responsible_name} onChange={e=>setVisitForm({...visitForm, responsible_name:e.target.value})} />
        <input placeholder="findings" value={visitForm.findings} onChange={e=>setVisitForm({...visitForm, findings:e.target.value})} style={{ width:200 }} />
        <button onClick={createVisit}>Criar Visita</button>
        <button onClick={loadAll}>Recarregar</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:120, overflow:"auto" }}>
        {visits.map(v=>(
          <li key={v.id}>{v.protocol} post {v.post_id.slice(0,8)} {v.scheduled_date} {v.status} {v.verified_by?`verif ${v.verified_by}`:""} <button onClick={()=>{ loadInspections(v.id); setInspForm({...inspForm, visit_id:v.id}); setApForm({...apForm, visit_id:v.id}); }}>Inspeções/Planos</button> <button onClick={()=>verifyVisit(v.id)}>Verificar</button> <button onClick={()=>realizeVisit(v.id)}>Realizar</button></li>
        ))}
      </ul>

      <h4>Inspeções da visita</h4>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="visit_id" value={inspForm.visit_id} onChange={e=>setInspForm({...inspForm, visit_id:e.target.value})} style={{ width:220 }} />
        <input placeholder="título 5..200" value={inspForm.title} onChange={e=>setInspForm({...inspForm, title:e.target.value})} style={{ width:200 }} />
        <input placeholder="descrição 10..5000" value={inspForm.description} onChange={e=>setInspForm({...inspForm, description:e.target.value})} style={{ width:200 }} />
        <select value={inspForm.inspection_type} onChange={e=>setInspForm({...inspForm, inspection_type:e.target.value})}><option value="rotina">rotina</option><option value="extraordinaria">extraordinária</option><option value="cliente">cliente</option><option value="interna">interna</option><option value="qualidade">qualidade</option><option value="seguranca">segurança</option></select>
        <button onClick={createInspection}>Criar Inspeção</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:100, overflow:"auto" }}>
        {inspections.map(i=>(
          <li key={i.id}>{i.title} {i.inspection_type} {i.status} score {i.score ?? "-"} <button onClick={()=>setApForm({...apForm, inspection_id:i.id})}>+Plano</button></li>
        ))}
      </ul>

      <h4>Planos Ação prazo responsável verificação</h4>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="visit_id" value={apForm.visit_id} onChange={e=>setApForm({...apForm, visit_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="inspection_id" value={apForm.inspection_id} onChange={e=>setApForm({...apForm, inspection_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="título 5..200" value={apForm.title} onChange={e=>setApForm({...apForm, title:e.target.value})} />
        <input placeholder="descrição 10..2000" value={apForm.description} onChange={e=>setApForm({...apForm, description:e.target.value})} style={{ width:200 }} />
        <input placeholder="responsável" value={apForm.responsible_name} onChange={e=>setApForm({...apForm, responsible_name:e.target.value})} />
        <input type="date" value={apForm.due_date} onChange={e=>setApForm({...apForm, due_date:e.target.value})} />
        <select value={apForm.priority} onChange={e=>setApForm({...apForm, priority:e.target.value})}><option value="baixa">baixa</option><option value="media">média</option><option value="alta">alta</option><option value="critica">crítica</option></select>
        <button onClick={createActionPlan}>Criar Plano</button>
        <button onClick={loadActionPlans}>Listar Todos</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:100, overflow:"auto" }}>
        {actionPlans.map(a=>(
          <li key={a.id}>{a.title} resp {a.responsible_name} due {a.due_date} {a.status} prio {a.priority} {a.verified_by?`verif ${a.verified_by}`:""} <button onClick={()=>verifyActionPlan(a.id)}>Verificar</button></li>
        ))}
      </ul>

      <h3>OPS-10 Rondas e Pontos verificação prevenção replay</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="post_id" value={patrolForm.post_id} onChange={e=>setPatrolForm({...patrolForm, post_id:e.target.value})} style={{ width:220 }} />
        <input type="date" value={patrolForm.patrol_date} onChange={e=>setPatrolForm({...patrolForm, patrol_date:e.target.value})} />
        <input placeholder="rota nome" value={patrolForm.route_name} onChange={e=>setPatrolForm({...patrolForm, route_name:e.target.value})} />
        <button onClick={createPatrol}>Criar Ronda</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:100, overflow:"auto" }}>
        {patrols.map(p=>(
          <li key={p.id}>{p.protocol} post {p.post_id.slice(0,8)} {p.patrol_date} {p.status} {p.route_name} <button onClick={()=>{ loadPoints(p.id); setPointForm({...pointForm, patrol_id:p.id}); }}>Pontos</button></li>
        ))}
      </ul>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="patrol_id" value={pointForm.patrol_id} onChange={e=>setPointForm({...pointForm, patrol_id:e.target.value})} style={{ width:200 }} />
        <input placeholder="ponto nome 3..200" value={pointForm.point_name} onChange={e=>setPointForm({...pointForm, point_name:e.target.value})} />
        <input placeholder="qr_code" value={pointForm.qr_code} onChange={e=>setPointForm({...pointForm, qr_code:e.target.value})} style={{ width:120 }} />
        <input placeholder="lat" value={pointForm.latitude} onChange={e=>setPointForm({...pointForm, latitude:e.target.value})} style={{ width:80 }} />
        <input placeholder="lng" value={pointForm.longitude} onChange={e=>setPointForm({...pointForm, longitude:e.target.value})} style={{ width:80 }} />
        <input placeholder="evidence_url" value={pointForm.evidence_url} onChange={e=>setPointForm({...pointForm, evidence_url:e.target.value})} style={{ width:180 }} />
        <select value={pointForm.location_unavailable} onChange={e=>setPointForm({...pointForm, location_unavailable:e.target.value})}><option value="false">local ok</option><option value="true">local indisponível</option></select>
        <input placeholder="motivo indisponível" value={pointForm.location_unavailable_reason} onChange={e=>setPointForm({...pointForm, location_unavailable_reason:e.target.value})} style={{ width:180 }} />
        <button onClick={createPoint}>Registrar Ponto (anti-replay + evidência)</button>
      </div>
      <p style={{ fontSize:11, color:"#666" }}>GPS/QR isolado não prova execução - requer evidência auditável e verificação humana. Sistema detecta duplicate_qr &lt;5min e too_fast &lt;30s.</p>
      <ul style={{ fontSize:12, maxHeight:120, overflow:"auto" }}>
        {points.map(pt=>(
          <li key={pt.id}>{pt.point_name} {pt.status} {pt.is_replay_detected?`REPLAY ${pt.replay_reason}`:""} {pt.location_unavailable?`LOCAL INDISPONÍVEL ${pt.location_unavailable_reason}`:""} {pt.evidence_url?`evid ${pt.evidence_url.slice(0,20)}`:""} {pt.verified_by?`verif ${pt.verified_by}`:""} <button onClick={()=>verifyPoint(pt.id)}>Verificar Humano</button></li>
        ))}
      </ul>

      <h3>OPS-11 Chaves, Rádios, Materiais, Equipamentos guarda/transferência/devolução</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="código 3..100 CHV-xxx" value={keyForm.code} onChange={e=>setKeyForm({...keyForm, code:e.target.value})} />
        <input placeholder="descrição 5..500" value={keyForm.description} onChange={e=>setKeyForm({...keyForm, description:e.target.value})} style={{ width:200 }} />
        <select value={keyForm.key_type} onChange={e=>setKeyForm({...keyForm, key_type:e.target.value})}><option value="chave">chave</option><option value="radio">rádio</option><option value="equipamento">equipamento</option><option value="material">material</option><option value="ferramenta">ferramenta</option></select>
        <input placeholder="local" value={keyForm.location} onChange={e=>setKeyForm({...keyForm, location:e.target.value})} />
        <button onClick={createKey}>Criar Item</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:100, overflow:"auto" }}>
        {keys.map(k=>(
          <li key={k.id}>{k.code} {k.description} {k.key_type} {k.status} {k.is_blocked?"BLOQ":""} holder {k.current_holder_employee_id?.slice(0,8)||"-"} <button onClick={()=>{ loadMovements(k.id); setMovForm({...movForm, key_id:k.id}); }}>Movs</button></li>
        ))}
      </ul>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="key_id" value={movForm.key_id} onChange={e=>setMovForm({...movForm, key_id:e.target.value})} style={{ width:200 }} />
        <select value={movForm.movement_type} onChange={e=>setMovForm({...movForm, movement_type:e.target.value})}><option value="retirada">retirada</option><option value="devolucao">devolução</option><option value="transferencia">transferência</option><option value="bloqueio">bloqueio</option><option value="desbloqueio">desbloqueio</option><option value="extravio">extravio</option><option value="reserva">reserva</option><option value="liberacao">liberação</option></select>
        <input placeholder="from_employee_id" value={movForm.from_employee_id} onChange={e=>setMovForm({...movForm, from_employee_id:e.target.value})} style={{ width:150 }} />
        <input placeholder="to_employee_id" value={movForm.to_employee_id} onChange={e=>setMovForm({...movForm, to_employee_id:e.target.value})} style={{ width:150 }} />
        <input placeholder="motivo 10..1000" value={movForm.reason} onChange={e=>setMovForm({...movForm, reason:e.target.value})} style={{ width:200 }} />
        <input placeholder="finalidade da custódia" value={movForm.purpose} onChange={e=>setMovForm({...movForm, purpose:e.target.value})} style={{ width:200 }} />
        <input placeholder="autorizado por" value={movForm.authorized_by} onChange={e=>setMovForm({...movForm, authorized_by:e.target.value})} />
        <button onClick={createMovement}>Registrar Movimento</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:100, overflow:"auto" }}>
        {movements.map(m=>(
          <li key={m.id}>{m.movement_type} {m.reason.slice(0,40)} {new Date(m.movement_date).toLocaleString()} from {m.from_employee_id?.slice(0,6)||"-"} → to {m.to_employee_id?.slice(0,6)||"-"}</li>
        ))}
      </ul>

      <h3>OPS-12 Relatórios Periódicos Cliente revisão conteúdo e privacidade</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="company_id" value={reportForm.company_id} onChange={e=>setReportForm({...reportForm, company_id:e.target.value})} style={{ width:200 }} />
        <input placeholder="contract_id" value={reportForm.contract_id} onChange={e=>setReportForm({...reportForm, contract_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="post_id" value={reportForm.post_id} onChange={e=>setReportForm({...reportForm, post_id:e.target.value})} style={{ width:180 }} />
        <select value={reportForm.report_type} onChange={e=>setReportForm({...reportForm, report_type:e.target.value})}><option value="diario">diário</option><option value="semanal">semanal</option><option value="mensal">mensal</option><option value="extraordinario">extraordinário</option><option value="ocorrencias">ocorrências</option><option value="cobertura">cobertura</option><option value="supervisao">supervisão</option></select>
        <input type="date" value={reportForm.period_start} onChange={e=>setReportForm({...reportForm, period_start:e.target.value})} />
        <input type="date" value={reportForm.period_end} onChange={e=>setReportForm({...reportForm, period_end:e.target.value})} />
        <input placeholder="título 5..200" value={reportForm.title} onChange={e=>setReportForm({...reportForm, title:e.target.value})} style={{ width:200 }} />
      </div>
      <div style={{ marginBottom:8 }}>
        <textarea placeholder="conteúdo 20..10000 - sistema detecta dados pessoais e exige revisão privacidade antes de aprovar/enviar" value={reportForm.content} onChange={e=>setReportForm({...reportForm, content:e.target.value})} style={{ width:"100%", minHeight:60 }} />
        <button onClick={createReport}>Criar Relatório Rascunho</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:150, overflow:"auto" }}>
        {reports.map(r=>(
          <li key={r.id}>{r.protocol} {r.title.slice(0,30)} {r.report_type} {r.period_start}→{r.period_end} {r.status} {r.contains_personal_data?"DADO PESSOAL":""} {r.is_approved_for_client?"APROVADO CLIENTE":""} {r.privacy_reviewed_at?`privRev ${r.privacy_reviewed_at.slice(0,10)}`:""}
            <button onClick={()=>reviewReport(r.id)}>Revisar Conteúdo</button>
            <button onClick={()=>privacyReviewReport(r.id)}>Revisar Privacidade</button>
            <button onClick={()=>approveReport(r.id)}>Aprovar</button>
            <button onClick={()=>sendReport(r.id)}>Enviar Cliente (só aprovado)</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
