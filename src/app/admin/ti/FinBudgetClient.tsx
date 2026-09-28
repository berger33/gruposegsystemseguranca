"use client";
import { useEffect, useState } from "react";

type Budget = { id:string; protocol:string; title:string; description:string; premises:string; period_start:string; period_end:string; total_revenue_cents:number|null; total_cost_cents:number|null; total_margin_cents:number|null; status:string; is_estimate:boolean; estimate_note:string; };
type Scenario = { id:string; budget_id:string; scenario_type:string; title:string; premises:string; projected_revenue_cents:number|null; projected_cost_cents:number|null; projected_margin_cents:number|null; projected_margin_percent:number|null; is_estimate:boolean; estimate_note:string; };
type Export = { id:string; protocol:string; period_start:string; period_end:string; filters:any; totals:any; total_records:number; total_amount_cents:number; status:string; file_name:string|null; file_url:string|null; storage_key:string|null; is_accountant_limited:boolean; access_role:string; };
type Closure = { id:string; competence_date:string; status:string; closed_at:string|null; reopened_at:string|null; reopen_reason:string|null; authorized_by_identity:string|null; notes:string|null; };
type ReportVersion = { id:string; closure_id:string; version:number; report_type:string; data:any; totals:any; is_preserved:boolean; };
type Provision = { id:string; rule_id:string|null; commission_id:string|null; contract_id:string|null; provision_date:string; amount_cents:number; status:string; is_auto_paid:boolean; revision_reason:string|null; notes:string|null; };

export default function FinBudgetClient() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [exports, setExports] = useState<Export[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [provisions, setProvisions] = useState<Provision[]>([]);
  const [msg, setMsg] = useState("");

  const [bTitle, setBTitle] = useState("");
  const [bDesc, setBDesc] = useState("");
  const [bPremises, setBPremises] = useState("");
  const [bStart, setBStart] = useState("");
  const [bEnd, setBEnd] = useState("");
  const [bRev, setBRev] = useState("");
  const [bCost, setBCost] = useState("");

  const [scBudgetId, setScBudgetId] = useState("");
  const [scType, setScType] = useState("base");
  const [scTitle, setScTitle] = useState("");
  const [scPremises, setScPremises] = useState("");
  const [scRev, setScRev] = useState("");
  const [scCost, setScCost] = useState("");
  const [scMarginPct, setScMarginPct] = useState("");

  const [expStart, setExpStart] = useState("");
  const [expEnd, setExpEnd] = useState("");
  const [expFileUrl, setExpFileUrl] = useState("");
  const [expStorageKey, setExpStorageKey] = useState("");

  const [closureDate, setClosureDate] = useState("");
  const [closureNotes, setClosureNotes] = useState("");
  const [reopenId, setReopenId] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  const [provRuleId, setProvRuleId] = useState("");
  const [provCommissionId, setProvCommissionId] = useState("");
  const [provAmount, setProvAmount] = useState("");
  const [provDate, setProvDate] = useState("");

  const load = async () => {
    try {
      const [b, s, e, c, v, p] = await Promise.all([
        fetch("/api/fin/budgets").then(r=>r.json()).catch(()=>({budgets:[]})),
        fetch("/api/fin/budget-scenarios").then(r=>r.json()).catch(()=>({scenarios:[]})),
        fetch("/api/fin/exports").then(r=>r.json()).catch(()=>({exports:[]})),
        fetch("/api/fin/competence-closures").then(r=>r.json()).catch(()=>({closures:[]})),
        fetch("/api/fin/report-versions").then(r=>r.json()).catch(()=>({versions:[]})),
        fetch("/api/fin/commission-provisions").then(r=>r.json()).catch(()=>({provisions:[]})),
      ]);
      setBudgets(b.budgets||[]);
      setScenarios(s.scenarios||[]);
      setExports(e.exports||[]);
      setClosures(c.closures||[]);
      setVersions(v.versions||[]);
      setProvisions(p.provisions||[]);
    } catch(e:any){ setMsg(e.message); }
  };
  useEffect(()=>{ load(); }, []);

  const post = async (url:string, body:any) => {
    const r = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || JSON.stringify(j));
    return j;
  };
  const patch = async (url:string, body:any) => {
    const r = await fetch(url, { method:"PATCH", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || JSON.stringify(j));
    return j;
  };

  const createBudget = async () => {
    try {
      setMsg("");
      if (!bTitle || bTitle.length<5) throw new Error("title 5..200");
      if (!bDesc || bDesc.length<10) throw new Error("description 10..2000");
      if (!bPremises || bPremises.length<10) throw new Error("premises 10..2000 obrigatória não prometer resultado");
      if (!bStart || !bEnd) throw new Error("period_start/end obrigatórios");
      await post("/api/fin/budgets", { title:bTitle, description:bDesc, premises:bPremises, period_start:bStart, period_end:bEnd, total_revenue_cents:bRev?parseInt(bRev):null, total_cost_cents:bCost?parseInt(bCost):null });
      setMsg("FIN-13 orçamento gerencial criado protocolo ORC-FIN premissas explícitas não prometer resultado is_estimate=true");
      load();
    } catch(e:any){ setMsg("FIN-13 orçamento erro: "+e.message); }
  };

  const createScenario = async () => {
    try {
      setMsg("");
      if (!scBudgetId) throw new Error("budget_id obrigatório");
      if (!scTitle || scTitle.length<5) throw new Error("title 5..200");
      if (!scPremises || scPremises.length<10) throw new Error("premises 10..2000 obrigatória cenários expansão premissas explícitas");
      await post("/api/fin/budget-scenarios", { budget_id:scBudgetId, scenario_type:scType, title:scTitle, premises:scPremises, projected_revenue_cents:scRev?parseInt(scRev):null, projected_cost_cents:scCost?parseInt(scCost):null, projected_margin_percent:scMarginPct?parseFloat(scMarginPct):null });
      setMsg("FIN-13 cenário expansão criado UNIQUE(budget,scenario_type) premissas explícitas cenário é estimativa identificada não prometer resultado");
      load();
    } catch(e:any){ setMsg("FIN-13 cenário erro: "+e.message); }
  };

  const createExport = async () => {
    try {
      setMsg("");
      if (!expStart || !expEnd) throw new Error("period_start/end obrigatórios");
      await post("/api/fin/exports", { period_start:expStart, period_end:expEnd, filters:{ type:"fin" }, totals:{ conciliavel:true }, file_url:expFileUrl||null, storage_key:expStorageKey||null, total_records:0, total_amount_cents:0 });
      setMsg("FIN-14 exportação período criada protocolo EXP-FIN trilha filtros totais conciliáveis acesso limitado contador is_accountant_limited=true access_role=contador");
      load();
    } catch(e:any){ setMsg("FIN-14 export erro: "+e.message); }
  };

  const createClosure = async () => {
    try {
      setMsg("");
      if (!closureDate) throw new Error("competence_date obrigatória");
      await post("/api/fin/competence-closures", { competence_date:closureDate, notes:closureNotes||null });
      setMsg("FIN-15 fechamento competência criado UNIQUE competence_date status fechada preservar versões relatório version 1");
      load();
    } catch(e:any){ setMsg("FIN-15 fechamento erro: "+e.message); }
  };

  const reopenClosure = async () => {
    try {
      setMsg("");
      if (!reopenId) throw new Error("closure id obrigatório");
      if (!reopenReason || reopenReason.length<10) throw new Error("reopen_reason 10..1000 obrigatória reabertura autorizada");
      await patch("/api/fin/competence-closures", { id:reopenId, action:"reopen", reopen_reason:reopenReason });
      setMsg("FIN-15 reabertura autorizada reason 10..1000 obrigatório authorized_by preservar versões relatório nova versão");
      load();
    } catch(e:any){ setMsg("FIN-15 reabertura erro: "+e.message); }
  };

  const createProvision = async () => {
    try {
      setMsg("");
      if (!provAmount) throw new Error("amount_cents >=0");
      await post("/api/fin/commission-provisions", { rule_id:provRuleId||null, commission_id:provCommissionId||null, provision_date:provDate||null, amount_cents:parseInt(provAmount) });
      setMsg("FIN-16 comissão provisão criada ligada à regra CRM-25 provisão e revisão não pagar automaticamente is_auto_paid=false CHECK");
      load();
    } catch(e:any){ setMsg("FIN-16 provisão erro: "+e.message); }
  };

  return (
    <section style={{ marginTop:24, padding:16, border:"1px solid #999", borderRadius:8 }}>
      <h2>FIN-13/14/15/16 — Orçamento cenários, exportação trilha, fechamento competência, comissões CRM-25</h2>
      {msg && <p style={{ background:"#eef", padding:8 }}>{msg}</p>}

      <h3>FIN-13 Orçamento gerencial e cenários de expansão com premissas explícitas não prometer resultado</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:8 }}>
        <input placeholder="title 5..200" value={bTitle} onChange={e=>setBTitle(e.target.value)} />
        <input placeholder="description 10..2000" value={bDesc} onChange={e=>setBDesc(e.target.value)} />
        <input placeholder="premises 10..2000 obrigatória não prometer resultado" value={bPremises} onChange={e=>setBPremises(e.target.value)} />
        <input type="date" value={bStart} onChange={e=>setBStart(e.target.value)} />
        <input type="date" value={bEnd} onChange={e=>setBEnd(e.target.value)} />
        <input placeholder="total_revenue_cents" value={bRev} onChange={e=>setBRev(e.target.value)} />
        <input placeholder="total_cost_cents" value={bCost} onChange={e=>setBCost(e.target.value)} />
        <button onClick={createBudget}>Criar orçamento ORC-FIN</button>
        <input placeholder="scenario budget_id" value={scBudgetId} onChange={e=>setScBudgetId(e.target.value)} />
        <select value={scType} onChange={e=>setScType(e.target.value)}><option value="conservador">conservador</option><option value="base">base</option><option value="otimista">otimista</option><option value="expansao">expansao</option><option value="pessimista">pessimista</option></select>
        <input placeholder="scenario title 5..200" value={scTitle} onChange={e=>setScTitle(e.target.value)} />
        <input placeholder="scenario premises 10..2000" value={scPremises} onChange={e=>setScPremises(e.target.value)} />
        <input placeholder="projected_revenue_cents" value={scRev} onChange={e=>setScRev(e.target.value)} />
        <input placeholder="projected_cost_cents" value={scCost} onChange={e=>setScCost(e.target.value)} />
        <input placeholder="projected_margin_percent -100..100" value={scMarginPct} onChange={e=>setScMarginPct(e.target.value)} />
        <button onClick={createScenario}>Criar cenário expansão</button>
      </div>
      <ul>{budgets.slice(0,10).map(b=><li key={b.id}>{b.protocol} {b.title} período:{b.period_start}→{b.period_end} receita:{b.total_revenue_cents} custo:{b.total_cost_cents} margem:{b.total_margin_cents} status:{b.status} estimate:{String(b.is_estimate)} note:{b.estimate_note.slice(0,40)}</li>)}</ul>
      <ul>{scenarios.slice(0,20).map(s=><li key={s.id}>budget:{s.budget_id.slice(0,8)} tipo:{s.scenario_type} {s.title} receita:{s.projected_revenue_cents} custo:{s.projected_cost_cents} margem:{s.projected_margin_cents} %:{s.projected_margin_percent} estimate:{String(s.is_estimate)} note:{s.estimate_note.slice(0,40)}</li>)}</ul>

      <h3>FIN-14 Exportação do período com trilha filtros totais conciliáveis e acesso limitado do contador</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:8 }}>
        <input type="date" value={expStart} onChange={e=>setExpStart(e.target.value)} />
        <input type="date" value={expEnd} onChange={e=>setExpEnd(e.target.value)} />
        <input placeholder="file_url 5..1000 opcional" value={expFileUrl} onChange={e=>setExpFileUrl(e.target.value)} />
        <input placeholder="storage_key UNIQUE 5..500" value={expStorageKey} onChange={e=>setExpStorageKey(e.target.value)} />
        <button onClick={createExport}>Criar exportação EXP-FIN trilha filtros totais conciliáveis contador</button>
      </div>
      <ul>{exports.slice(0,10).map(e=><li key={e.id}>{e.protocol} período:{e.period_start}→{e.period_end} status:{e.status} total:{e.total_amount_cents} records:{e.total_records} limitado_contador:{String(e.is_accountant_limited)} role:{e.access_role} storage:{e.storage_key?.slice(0,20)||"—"}</li>)}</ul>

      <h3>FIN-15 Fechamento de competência e reabertura autorizada preservar versões de relatório</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:8 }}>
        <input type="date" value={closureDate} onChange={e=>setClosureDate(e.target.value)} />
        <input placeholder="notes 10..2000 opcional" value={closureNotes} onChange={e=>setClosureNotes(e.target.value)} />
        <button onClick={createClosure}>Fechar competência UNIQUE</button>
        <input placeholder="closure_id para reabertura" value={reopenId} onChange={e=>setReopenId(e.target.value)} />
        <input placeholder="reopen_reason 10..1000 obrigatória reabertura autorizada" value={reopenReason} onChange={e=>setReopenReason(e.target.value)} />
        <button onClick={reopenClosure}>Reabrir competência autorizada preservar versões</button>
      </div>
      <ul>{closures.slice(0,10).map(c=><li key={c.id}>comp:{c.competence_date} status:{c.status} fechado:{c.closed_at?.slice(0,10)||"—"} reaberto:{c.reopened_at?.slice(0,10)||"—"} motivo:{c.reopen_reason?.slice(0,40)||"—"} autorizado:{c.authorized_by_identity?.slice(0,8)||"—"}</li>)}</ul>
      <ul>{versions.slice(0,10).map(v=><li key={v.id}>closure:{v.closure_id.slice(0,8)} v:{v.version} tipo:{v.report_type} preservado:{String(v.is_preserved)} data:{JSON.stringify(v.data).slice(0,60)}</li>)}</ul>

      <h3>FIN-16 Comissões ligadas à regra CRM-25 provisão e revisão não pagar automaticamente</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:8 }}>
        <input placeholder="rule_id CRM-25 opcional" value={provRuleId} onChange={e=>setProvRuleId(e.target.value)} />
        <input placeholder="commission_id opcional" value={provCommissionId} onChange={e=>setProvCommissionId(e.target.value)} />
        <input type="date" value={provDate} onChange={e=>setProvDate(e.target.value)} />
        <input placeholder="amount_cents >=0" value={provAmount} onChange={e=>setProvAmount(e.target.value)} />
        <button onClick={createProvision}>Criar provisão comissão CRM-25 is_auto_paid=false</button>
      </div>
      <ul>{provisions.slice(0,20).map(p=><li key={p.id}>regra:{p.rule_id?.slice(0,8)||"—"} comissão:{p.commission_id?.slice(0,8)||"—"} data:{p.provision_date} amount:{p.amount_cents} status:{p.status} auto_paid:{String(p.is_auto_paid)} CHECK false não pagar automático revision:{p.revision_reason?.slice(0,40)||"—"}</li>)}</ul>
    </section>
  );
}
