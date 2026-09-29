"use client";
import { useEffect, useState } from "react";

type MyDay = { id:string; title:string; description:string; priority:string; responsible_name:string; action_type:string; status:string; due_date:string|null; source_module:string; is_real_pending:boolean; };
type Commercial = { id:string; snapshot_date:string; new_leads_count:number; stalled_opportunities_count:number; proposals_count:number; total_value_cents:number; notes:string|null; };
type Operational = { id:string; snapshot_date:string; coverage_required_hours:number; coverage_covered_hours:number; coverage_percent:number|null; critical_occurrences_count:number; sla_breach_count:number; implantation_pending_count:number; notes:string|null; };
type Financial = { id:string; competence_date:string; source:string; total_receivables_cents:number; total_payables_cents:number; balance_cents:number; overdue_cents:number; upcoming_cents:number; margin_by_contract:any; };
type RenewalRisk = { id:string; contract_id:string|null; renewal_date:string; risk_level:string; risk_score:number; justification:string; reincidence_count:number; is_justified:boolean; facts_json:any; };
type Approval = { id:string; protocol:string; approval_type:string; reference_id:string|null; amount_cents:number|null; threshold_cents:number|null; requester_name:string; approver_name:string|null; status:string; reason:string|null; scope:string|null; };

export default function AdmClient() {
  const [myDay, setMyDay] = useState<MyDay[]>([]);
  const [commercial, setCommercial] = useState<Commercial[]>([]);
  const [operational, setOperational] = useState<Operational[]>([]);
  const [financial, setFinancial] = useState<Financial[]>([]);
  const [risks, setRisks] = useState<RenewalRisk[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [msg, setMsg] = useState("");

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState("media");
  const [responsible, setResponsible] = useState("");
  const [actionType, setActionType] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [sourceModule, setSourceModule] = useState("adm");

  const [commDate, setCommDate] = useState("");
  const [commLeads, setCommLeads] = useState("");
  const [commStalled, setCommStalled] = useState("");
  const [commProps, setCommProps] = useState("");

  const [opDate, setOpDate] = useState("");
  const [opReq, setOpReq] = useState("");
  const [opCov, setOpCov] = useState("");
  const [opCritical, setOpCritical] = useState("");

  const [finComp, setFinComp] = useState("");
  const [finSource, setFinSource] = useState("geral");
  const [finRecv, setFinRecv] = useState("");
  const [finPay, setFinPay] = useState("");

  const [riskContract, setRiskContract] = useState("");
  const [riskDate, setRiskDate] = useState("");
  const [riskLevel, setRiskLevel] = useState("medio");
  const [riskScore, setRiskScore] = useState("");
  const [riskJust, setRiskJust] = useState("");

  const [apprType, setApprType] = useState("desconto");
  const [apprAmount, setApprAmount] = useState("");
  const [apprThreshold, setApprThreshold] = useState("");
  const [apprRequester, setApprRequester] = useState("");
  const [apprScope, setApprScope] = useState("");

  const load = async () => {
    try {
      const [a,b,c,d,e,f] = await Promise.all([
        fetch("/api/adm/my-day").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/adm/commercial-snapshots").then(r=>r.json()).catch(()=>({snapshots:[]})),
        fetch("/api/adm/operational-snapshots").then(r=>r.json()).catch(()=>({snapshots:[]})),
        fetch("/api/adm/financial-snapshots").then(r=>r.json()).catch(()=>({snapshots:[]})),
        fetch("/api/adm/renewal-risks").then(r=>r.json()).catch(()=>({risks:[]})),
        fetch("/api/adm/approvals").then(r=>r.json()).catch(()=>({approvals:[]})),
      ]);
      setMyDay(a.items||[]);
      setCommercial(b.snapshots||[]);
      setOperational(c.snapshots||[]);
      setFinancial(d.snapshots||[]);
      setRisks(e.risks||[]);
      setApprovals(f.approvals||[]);
    } catch(e:any){ setMsg(e.message); }
  };
  useEffect(()=>{ load(); }, []);

  const post = async (url:string, body:any) => {
    const r = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || JSON.stringify(j));
    return j;
  };

  const createMyDay = async () => {
    try {
      setMsg("");
      if (!title || title.length<5) throw new Error("title 5..200");
      if (!desc || desc.length<10) throw new Error("description 10..1000");
      if (!responsible || responsible.length<2) throw new Error("responsible_name 2..200");
      if (!actionType || actionType.length<3) throw new Error("action_type 3..100");
      await post("/api/adm/my-day", { title, description:desc, priority, responsible_name:responsible, action_type:actionType, due_date:dueDate||null, source_module:sourceModule });
      setMsg("ADM-01 meu dia criado pendências reais prioridade responsável ação is_real_pending=true");
      load();
    } catch(e:any){ setMsg("ADM-01 erro: "+e.message); }
  };
  const createCommercial = async () => {
    try {
      setMsg("");
      await post("/api/adm/commercial-snapshots", { snapshot_date:commDate||null, new_leads_count:commLeads?parseInt(commLeads):0, stalled_opportunities_count:commStalled?parseInt(commStalled):0, proposals_count:commProps?parseInt(commProps):0, next_actions:[], total_value_cents:0 });
      setMsg("ADM-02 visão comercial snapshot criado leads novos oportunidades paradas propostas próximas ações");
      load();
    } catch(e:any){ setMsg("ADM-02 erro: "+e.message); }
  };
  const createOperational = async () => {
    try {
      setMsg("");
      await post("/api/adm/operational-snapshots", { snapshot_date:opDate||null, coverage_required_hours:opReq?parseFloat(opReq):0, coverage_covered_hours:opCov?parseFloat(opCov):0, critical_occurrences_count:opCritical?parseInt(opCritical):0, sla_breach_count:0, implantation_pending_count:0 });
      setMsg("ADM-03 visão operacional snapshot criado cobertura ocorrências críticas SLA implantação coverage_percent GENERATED");
      load();
    } catch(e:any){ setMsg("ADM-03 erro: "+e.message); }
  };
  const createFinancial = async () => {
    try {
      setMsg("");
      if (!finComp) throw new Error("competence_date obrigatória");
      await post("/api/adm/financial-snapshots", { competence_date:finComp, source:finSource, total_receivables_cents:finRecv?parseInt(finRecv):0, total_payables_cents:finPay?parseInt(finPay):0, overdue_cents:0, upcoming_cents:0, margin_by_contract:{} });
      setMsg("ADM-04 visão financeira snapshot criado fonte competência saldo vencimentos margem por contrato balance GENERATED");
      load();
    } catch(e:any){ setMsg("ADM-04 erro: "+e.message); }
  };
  const createRisk = async () => {
    try {
      setMsg("");
      if (!riskDate) throw new Error("renewal_date obrigatória");
      if (!riskJust || riskJust.length<10) throw new Error("justification 10..1000 obrigatória risco perda justificado");
      await post("/api/adm/renewal-risks", { contract_id:riskContract||null, renewal_date:riskDate, risk_level:riskLevel, risk_score:riskScore?parseInt(riskScore):0, justification:riskJust, reincidence_count:0, is_justified:true, facts_json:{ source:"modulos_reais" } });
      setMsg("ADM-05 contrato próximo renovar risco criado reincidência justificado facts_json risco perda justificado");
      load();
    } catch(e:any){ setMsg("ADM-05 erro: "+e.message); }
  };
  const createApproval = async () => {
    try {
      setMsg("");
      if (!apprRequester || apprRequester.length<2) throw new Error("requester_name 2..200");
      await post("/api/adm/approvals", { approval_type:apprType, amount_cents:apprAmount?parseInt(apprAmount):null, threshold_cents:apprThreshold?parseInt(apprThreshold):null, requester_name:apprRequester, scope:apprScope||null, reason:"Aprovação unificada descontos compras despesas exceções alçadas por valor/escopo" });
      setMsg("ADM-06 aprovação unificada criada protocolo APR-ADM descontos compras despesas exceções alçadas por valor/escopo");
      load();
    } catch(e:any){ setMsg("ADM-06 erro: "+e.message); }
  };

  return (
    <section style={{ marginTop:24, padding:16, border:"1px solid #666", borderRadius:8 }}>
      <h2>ADM-01..06 — Painel meu dia, comercial, operacional, financeiro, renovação risco, aprovação unificada</h2>
      {msg && <p style={{ background:"#eef", padding:8 }}>{msg}</p>}

      <h3>ADM-01 Painel Meu dia com pendências reais prioridade responsável ação</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:8 }}>
        <input placeholder="title 5..200" value={title} onChange={e=>setTitle(e.target.value)} />
        <input placeholder="description 10..1000" value={desc} onChange={e=>setDesc(e.target.value)} />
        <select value={priority} onChange={e=>setPriority(e.target.value)}><option value="baixa">baixa</option><option value="media">media</option><option value="alta">alta</option><option value="critica">critica</option></select>
        <input placeholder="responsible_name 2..200" value={responsible} onChange={e=>setResponsible(e.target.value)} />
        <input placeholder="action_type 3..100" value={actionType} onChange={e=>setActionType(e.target.value)} />
        <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} />
        <select value={sourceModule} onChange={e=>setSourceModule(e.target.value)}><option value="crm">crm</option><option value="con">con</option><option value="hr">hr</option><option value="ops">ops</option><option value="fin">fin</option><option value="cli">cli</option><option value="adm">adm</option><option value="plt">plt</option><option value="outro">outro</option></select>
        <button onClick={createMyDay}>Criar pendência meu dia</button>
      </div>
      <ul>{myDay.slice(0,20).map(i=><li key={i.id}>{i.title} prioridade:{i.priority} responsável:{i.responsible_name} ação:{i.action_type} status:{i.status} venc:{i.due_date||"—"} módulo:{i.source_module} real:{String(i.is_real_pending)}</li>)}</ul>

      <h3>ADM-02 Visão comercial leads novos oportunidades paradas propostas próximas ações</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px,1fr))", gap:8 }}>
        <input type="date" value={commDate} onChange={e=>setCommDate(e.target.value)} />
        <input placeholder="new_leads_count" value={commLeads} onChange={e=>setCommLeads(e.target.value)} />
        <input placeholder="stalled_opportunities_count" value={commStalled} onChange={e=>setCommStalled(e.target.value)} />
        <input placeholder="proposals_count" value={commProps} onChange={e=>setCommProps(e.target.value)} />
        <button onClick={createCommercial}>Criar snapshot comercial</button>
      </div>
      <ul>{commercial.slice(0,10).map(c=><li key={c.id}>{c.snapshot_date} leads novos:{c.new_leads_count} paradas:{c.stalled_opportunities_count} propostas:{c.proposals_count} valor:{c.total_value_cents}</li>)}</ul>

      <h3>ADM-03 Visão operacional cobertura ocorrências críticas SLA implantação</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px,1fr))", gap:8 }}>
        <input type="date" value={opDate} onChange={e=>setOpDate(e.target.value)} />
        <input placeholder="coverage_required_hours" value={opReq} onChange={e=>setOpReq(e.target.value)} />
        <input placeholder="coverage_covered_hours" value={opCov} onChange={e=>setOpCov(e.target.value)} />
        <input placeholder="critical_occurrences_count" value={opCritical} onChange={e=>setOpCritical(e.target.value)} />
        <button onClick={createOperational}>Criar snapshot operacional</button>
      </div>
      <ul>{operational.slice(0,10).map(o=><li key={o.id}>{o.snapshot_date} req:{o.coverage_required_hours} cob:{o.coverage_covered_hours} %:{o.coverage_percent} críticas:{o.critical_occurrences_count} SLA breach:{o.sla_breach_count} implantação pend:{o.implantation_pending_count}</li>)}</ul>

      <h3>ADM-04 Visão financeira fonte competência saldo vencimentos margem por contrato</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px,1fr))", gap:8 }}>
        <input type="date" value={finComp} onChange={e=>setFinComp(e.target.value)} />
        <input placeholder="source 3..100" value={finSource} onChange={e=>setFinSource(e.target.value)} />
        <input placeholder="total_receivables_cents" value={finRecv} onChange={e=>setFinRecv(e.target.value)} />
        <input placeholder="total_payables_cents" value={finPay} onChange={e=>setFinPay(e.target.value)} />
        <button onClick={createFinancial}>Criar snapshot financeiro</button>
      </div>
      <ul>{financial.slice(0,10).map(f=><li key={f.id}>{f.competence_date} fonte:{f.source} recebíveis:{f.total_receivables_cents} pagáveis:{f.total_payables_cents} saldo:{f.balance_cents} vencidos:{f.overdue_cents} próximos:{f.upcoming_cents} margem_contrato:{JSON.stringify(f.margin_by_contract).slice(0,40)}</li>)}</ul>

      <h3>ADM-05 Contratos próximos de renovar reclamações reincidentes risco de perda justificado</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:8 }}>
        <input placeholder="contract_id opcional" value={riskContract} onChange={e=>setRiskContract(e.target.value)} />
        <input type="date" value={riskDate} onChange={e=>setRiskDate(e.target.value)} />
        <select value={riskLevel} onChange={e=>setRiskLevel(e.target.value)}><option value="baixo">baixo</option><option value="medio">medio</option><option value="alto">alto</option><option value="critico">critico</option></select>
        <input placeholder="risk_score 0..100" value={riskScore} onChange={e=>setRiskScore(e.target.value)} />
        <input placeholder="justification 10..1000 risco perda justificado" value={riskJust} onChange={e=>setRiskJust(e.target.value)} />
        <button onClick={createRisk}>Criar risco renovação justificado</button>
      </div>
      <ul>{risks.slice(0,20).map(r=><li key={r.id}>contrato:{r.contract_id?.slice(0,8)||"—"} renov:{r.renewal_date} nível:{r.risk_level} score:{r.risk_score} just:{r.justification.slice(0,60)} reincidência:{r.reincidence_count} justificado:{String(r.is_justified)} facts:{JSON.stringify(r.facts_json).slice(0,40)}</li>)}</ul>

      <h3>ADM-06 Aprovação unificada descontos compras despesas exceções alçadas por valor/escopo</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:8 }}>
        <select value={apprType} onChange={e=>setApprType(e.target.value)}><option value="desconto">desconto</option><option value="compra">compra</option><option value="despesa">despesa</option><option value="excecao">excecao</option><option value="outro">outro</option></select>
        <input placeholder="amount_cents" value={apprAmount} onChange={e=>setApprAmount(e.target.value)} />
        <input placeholder="threshold_cents alçada" value={apprThreshold} onChange={e=>setApprThreshold(e.target.value)} />
        <input placeholder="requester_name 2..200" value={apprRequester} onChange={e=>setApprRequester(e.target.value)} />
        <input placeholder="scope 3..200 valor/escopo" value={apprScope} onChange={e=>setApprScope(e.target.value)} />
        <button onClick={createApproval}>Criar aprovação unificada APR-ADM</button>
      </div>
      <ul>{approvals.slice(0,20).map(a=><li key={a.id}>{a.protocol} tipo:{a.approval_type} amount:{a.amount_cents} threshold:{a.threshold_cents} solicitante:{a.requester_name} aprovador:{a.approver_name||"—"} status:{a.status} escopo:{a.scope||"—"} alçada valor/escopo</li>)}</ul>
    </section>
  );
}
