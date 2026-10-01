"use client";

import { FormEvent, useEffect, useState } from "react";

type Budget = { id:string; protocol:string; title:string; description:string; premises:string; period_start:string; period_end:string; total_revenue_cents:string|number|null; total_cost_cents:string|number|null; total_margin_cents:string|number|null; status:string; is_estimate:boolean; estimate_note:string; premises_version:number; approved_by_identity:string|null; approved_at:string|null };
type Scenario = { id:string; budget_id:string; scenario_type:string; title:string; premises:string; premise_source:string|null; premise_base_date:string|null; projected_revenue_cents:string|number|null; projected_cost_cents:string|number|null; projected_margin_cents:string|number|null; projected_margin_percent:string|number|null; is_estimate:boolean; is_complete:boolean; incomplete_reason:string|null; is_approved:boolean; premises_version:number };

const money = (value:string|number|null|undefined) => value == null ? "Dado ausente" : `R$ ${(Number(value)/100).toFixed(2).replace(".",",")}`;
async function api(path:string, init?:RequestInit) {
  const response = await fetch(path, { ...init, headers:{ "Content-Type":"application/json", ...(init?.headers||{}) } });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return data;
}

export default function BudgetWorkspace() {
  const [budgets,setBudgets] = useState<Budget[]>([]);
  const [scenarios,setScenarios] = useState<Scenario[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [reason,setReason] = useState("");
  const [newPremises,setNewPremises] = useState("");
  const [budget,setBudget] = useState({ title:"", description:"", premises:"", period_start:"", period_end:"", total_revenue_cents:"", total_cost_cents:"", idempotency_key:"" });
  const [scenario,setScenario] = useState({ budget_id:"", scenario_type:"base", title:"", premises:"", premise_source:"", premise_base_date:"", incomplete_reason:"", projected_revenue_cents:"", projected_cost_cents:"", idempotency_key:"" });
  const [completion,setCompletion] = useState({ projected_revenue_cents:"", projected_cost_cents:"" });

  const run = async (fn:()=>Promise<void>) => { setBusy(true); setError(""); setNotice(""); try { await fn(); } catch(e) { setError(e instanceof Error?e.message:"Falha inesperada"); } finally { setBusy(false); } };
  // load() não usa run(): recarregar a lista não pode apagar o aviso da ação.
  const load = async () => {
    const [b,s] = await Promise.all([api("/api/fin/budgets"), api("/api/fin/budget-scenarios")]);
    setBudgets(b.budgets||[]); setScenarios(s.scenarios||[]);
  };
  useEffect(()=>{ load().catch(e=>setError(e instanceof Error?e.message:"Falha ao carregar")); }, []);

  const createBudget = async (event:FormEvent) => { event.preventDefault(); await run(async()=>{
    await api("/api/fin/budgets",{method:"POST",body:JSON.stringify({
      ...budget,
      total_revenue_cents: budget.total_revenue_cents===""?null:Number(budget.total_revenue_cents),
      total_cost_cents: budget.total_cost_cents===""?null:Number(budget.total_cost_cents),
    })});
    setNotice("Orçamento criado em rascunho: estimativa com premissas explícitas, sem promessa de resultado.");
    setBudget({ title:"", description:"", premises:"", period_start:"", period_end:"", total_revenue_cents:"", total_cost_cents:"", idempotency_key:"" });
    await load();
  }); };

  const transitionBudget = (item:Budget, status:string) => run(async()=>{
    await api("/api/fin/budgets",{method:"PATCH",body:JSON.stringify({ id:item.id, status, reason })});
    setNotice(status==="aprovado"?"Orçamento aprovado com aprovador e data auditados; a projeção continua estimativa e não cria compromisso.":`Orçamento em ${status}.`);
    setReason(""); await load();
  });

  const reviseBudget = (item:Budget) => run(async()=>{
    if (newPremises.trim().length < 10) throw new Error("premises_required_10_2000");
    const data = await api("/api/fin/budgets",{method:"PATCH",body:JSON.stringify({ id:item.id, premises:newPremises.trim(), reason })});
    setNotice(data.approval_revoked?"Premissas revisadas: a aprovação anterior foi revogada e o orçamento voltou ao rascunho.":"Premissas do rascunho atualizadas com nova versão.");
    setReason(""); setNewPremises(""); await load();
  });

  const createScenario = async (event:FormEvent) => { event.preventDefault(); await run(async()=>{
    const complete = scenario.projected_revenue_cents !== "" && scenario.projected_cost_cents !== "";
    await api("/api/fin/budget-scenarios",{method:"POST",body:JSON.stringify({
      budget_id: scenario.budget_id, scenario_type: scenario.scenario_type, title: scenario.title,
      premises: scenario.premises, premise_source: scenario.premise_source, premise_base_date: scenario.premise_base_date,
      idempotency_key: scenario.idempotency_key,
      ...(complete
        ? { is_complete:true, projected_revenue_cents:Number(scenario.projected_revenue_cents), projected_cost_cents:Number(scenario.projected_cost_cents) }
        : { is_complete:false, incomplete_reason:scenario.incomplete_reason }),
    })});
    setNotice(complete?"Cenário criado com margem projetada calculada pelo servidor; valores são estimativas.":"Cenário criado incompleto: a base ausente ficou registrada como lacuna visível, sem margem calculada.");
    setScenario({ budget_id:"", scenario_type:"base", title:"", premises:"", premise_source:"", premise_base_date:"", incomplete_reason:"", projected_revenue_cents:"", projected_cost_cents:"", idempotency_key:"" });
    await load();
  }); };

  const completeScenario = (item:Scenario) => run(async()=>{
    await api("/api/fin/budget-scenarios",{method:"PATCH",body:JSON.stringify({ id:item.id, action:"completar", projected_revenue_cents:Number(completion.projected_revenue_cents), projected_cost_cents:Number(completion.projected_cost_cents), reason })});
    setNotice("Cenário completado: margem projetada calculada pelo servidor, rotulada como estimativa.");
    setReason(""); setCompletion({ projected_revenue_cents:"", projected_cost_cents:"" }); await load();
  });

  const approveScenario = (item:Scenario) => run(async()=>{
    const data = await api("/api/fin/budget-scenarios",{method:"PATCH",body:JSON.stringify({ id:item.id, action:"aprovar", reason })});
    setNotice(data.commitment_created===false?"Cenário aprovado; nenhum recebível, despesa ou meta foi criado — aprovação não é compromisso.":"Cenário aprovado.");
    setReason(""); await load();
  });

  const reviseScenario = (item:Scenario) => run(async()=>{
    if (newPremises.trim().length < 10) throw new Error("premises_required_10_2000");
    const data = await api("/api/fin/budget-scenarios",{method:"PATCH",body:JSON.stringify({ id:item.id, action:"revisar_premissas", premises:newPremises.trim(), reason })});
    setNotice(data.approval_revoked?"Premissas do cenário revisadas: a aprovação foi revogada.":"Premissas do cenário revisadas em nova versão.");
    setReason(""); setNewPremises(""); await load();
  });

  return <section data-testid="fin13-budget">
    <h2>Orçamento gerencial e cenários de expansão</h2>
    <p role="note" data-testid="fin13-estimate-warning">Todos os valores desta aba são <strong>estimativas</strong> apoiadas em premissas explícitas (texto, origem do número e data-base). Projeção não é realizado e <strong>não constitui promessa de resultado</strong>; aprovar um orçamento ou cenário não cria recebível, despesa, meta nem orçamento executado. Dado ausente aparece como lacuna, nunca como zero.</p>
    {error&&<p role="alert" data-testid="fin13-error">{error}</p>}
    {notice&&<p role="status" data-testid="fin13-notice">{notice}</p>}

    <h3>Novo orçamento (nasce em rascunho)</h3>
    <form onSubmit={createBudget} data-testid="fin13-budget-form">
      <input required minLength={5} maxLength={200} data-testid="fin13-budget-title" placeholder="Título do orçamento" value={budget.title} onChange={e=>setBudget({...budget,title:e.target.value})}/>
      <input required minLength={10} maxLength={2000} data-testid="fin13-budget-description" placeholder="Descrição (10 a 2000 caracteres)" value={budget.description} onChange={e=>setBudget({...budget,description:e.target.value})}/>
      <input required minLength={10} maxLength={2000} data-testid="fin13-budget-premises" placeholder="Premissas explícitas (obrigatórias)" value={budget.premises} onChange={e=>setBudget({...budget,premises:e.target.value})}/>
      <input required type="date" aria-label="Início do período" data-testid="fin13-budget-start" value={budget.period_start} onChange={e=>setBudget({...budget,period_start:e.target.value})}/>
      <input required type="date" aria-label="Fim do período" data-testid="fin13-budget-end" value={budget.period_end} onChange={e=>setBudget({...budget,period_end:e.target.value})}/>
      <input type="number" min="0" data-testid="fin13-budget-revenue" placeholder="Receita prevista em centavos (opcional)" value={budget.total_revenue_cents} onChange={e=>setBudget({...budget,total_revenue_cents:e.target.value})}/>
      <input type="number" min="0" data-testid="fin13-budget-cost" placeholder="Custo previsto em centavos (opcional)" value={budget.total_cost_cents} onChange={e=>setBudget({...budget,total_cost_cents:e.target.value})}/>
      <input required minLength={8} maxLength={200} data-testid="fin13-budget-idempotency" placeholder="Chave de idempotência" value={budget.idempotency_key} onChange={e=>setBudget({...budget,idempotency_key:e.target.value})}/>
      <button data-testid="fin13-budget-create" disabled={busy}>Criar orçamento</button>
    </form>
    <label>Motivo da ação <input minLength={10} maxLength={1000} data-testid="fin13-reason" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Motivo (10 a 1000 caracteres)"/></label>
    <label>Novas premissas (revisão) <input minLength={10} maxLength={2000} data-testid="fin13-new-premises" value={newPremises} onChange={e=>setNewPremises(e.target.value)} placeholder="Premissas revisadas — derruba a aprovação"/></label>
    <table data-testid="fin13-budgets-table"><thead><tr><th>Protocolo</th><th>Título</th><th>Período</th><th>Receita prevista (estimativa)</th><th>Custo previsto (estimativa)</th><th>Margem prevista (estimativa)</th><th>Versão premissas</th><th>Status</th><th>Ações</th></tr></thead><tbody>
      {budgets.length===0?<tr><td colSpan={9}>Nenhum orçamento.</td></tr>:budgets.map(item=>
        <tr key={item.id} data-testid={`fin13-budget-${item.id}`}>
          <td>{item.protocol}</td><td>{item.title}</td><td>{String(item.period_start).slice(0,10)} → {String(item.period_end).slice(0,10)}</td>
          <td>{money(item.total_revenue_cents)}</td><td>{money(item.total_cost_cents)}</td>
          <td data-testid={`fin13-budget-margin-${item.id}`}>{item.total_margin_cents==null?"Dado ausente":`${money(item.total_margin_cents)} (estimativa)`}</td>
          <td data-testid={`fin13-budget-version-${item.id}`}>{item.premises_version}</td>
          <td data-testid={`fin13-budget-status-${item.id}`}>{item.status}</td>
          <td>
            {item.status==="rascunho"&&<button disabled={busy||reason.length<10} data-testid={`fin13-budget-submit-${item.id}`} onClick={()=>transitionBudget(item,"em_revisao")}>Enviar para revisão</button>}
            {item.status==="em_revisao"&&<button disabled={busy||reason.length<10} data-testid={`fin13-budget-approve-${item.id}`} onClick={()=>transitionBudget(item,"aprovado")}>Aprovar</button>}
            {item.status==="em_revisao"&&<button disabled={busy||reason.length<10} data-testid={`fin13-budget-reject-${item.id}`} onClick={()=>transitionBudget(item,"rejeitado")}>Rejeitar</button>}
            {item.status==="aprovado"&&<button disabled={busy||reason.length<10||newPremises.length<10} data-testid={`fin13-budget-revise-${item.id}`} onClick={()=>reviseBudget(item)}>Revisar premissas</button>}
            {["rascunho","aprovado","rejeitado"].includes(item.status)&&<button disabled={busy||reason.length<10} data-testid={`fin13-budget-archive-${item.id}`} onClick={()=>transitionBudget(item,"arquivado")}>Arquivar</button>}
          </td>
        </tr>)}
    </tbody></table>

    <h3>Novo cenário (premissa explícita obrigatória)</h3>
    <form onSubmit={createScenario} data-testid="fin13-scenario-form">
      <select required data-testid="fin13-scenario-budget" value={scenario.budget_id} onChange={e=>setScenario({...scenario,budget_id:e.target.value})}>
        <option value="">Orçamento vinculado</option>
        {budgets.map(item=><option key={item.id} value={item.id}>{item.protocol} · {item.title}</option>)}
      </select>
      <select required data-testid="fin13-scenario-type" value={scenario.scenario_type} onChange={e=>setScenario({...scenario,scenario_type:e.target.value})}>
        {["conservador","base","otimista","expansao","pessimista"].map(type=><option key={type} value={type}>{type}</option>)}
      </select>
      <input required minLength={5} maxLength={200} data-testid="fin13-scenario-title" placeholder="Título do cenário" value={scenario.title} onChange={e=>setScenario({...scenario,title:e.target.value})}/>
      <input required minLength={10} maxLength={2000} data-testid="fin13-scenario-premises" placeholder="Premissas explícitas do cenário" value={scenario.premises} onChange={e=>setScenario({...scenario,premises:e.target.value})}/>
      <input required minLength={5} maxLength={200} data-testid="fin13-scenario-source" placeholder="Origem do número (ex.: contratos vigentes)" value={scenario.premise_source} onChange={e=>setScenario({...scenario,premise_source:e.target.value})}/>
      <input required type="date" aria-label="Data-base da premissa" data-testid="fin13-scenario-base-date" value={scenario.premise_base_date} onChange={e=>setScenario({...scenario,premise_base_date:e.target.value})}/>
      <input type="number" min="1" data-testid="fin13-scenario-revenue" placeholder="Receita projetada em centavos (opcional)" value={scenario.projected_revenue_cents} onChange={e=>setScenario({...scenario,projected_revenue_cents:e.target.value})}/>
      <input type="number" min="0" data-testid="fin13-scenario-cost" placeholder="Custo projetado em centavos (opcional)" value={scenario.projected_cost_cents} onChange={e=>setScenario({...scenario,projected_cost_cents:e.target.value})}/>
      <input data-testid="fin13-scenario-incomplete-reason" minLength={10} maxLength={1000} placeholder="Sem base completa? Motivo da lacuna (obrigatório)" value={scenario.incomplete_reason} onChange={e=>setScenario({...scenario,incomplete_reason:e.target.value})}/>
      <input required minLength={8} maxLength={200} data-testid="fin13-scenario-idempotency" placeholder="Chave de idempotência" value={scenario.idempotency_key} onChange={e=>setScenario({...scenario,idempotency_key:e.target.value})}/>
      <button data-testid="fin13-scenario-create" disabled={busy}>Criar cenário</button>
    </form>
    <label>Receita projetada para completar <input type="number" min="1" data-testid="fin13-complete-revenue" value={completion.projected_revenue_cents} onChange={e=>setCompletion({...completion,projected_revenue_cents:e.target.value})}/></label>
    <label>Custo projetado para completar <input type="number" min="0" data-testid="fin13-complete-cost" value={completion.projected_cost_cents} onChange={e=>setCompletion({...completion,projected_cost_cents:e.target.value})}/></label>
    <table data-testid="fin13-scenarios-table"><thead><tr><th>Tipo</th><th>Título</th><th>Origem / data-base</th><th>Receita projetada (estimativa)</th><th>Custo projetado (estimativa)</th><th>Margem projetada (estimativa)</th><th>Base</th><th>Versão</th><th>Aprovado</th><th>Ações</th></tr></thead><tbody>
      {scenarios.length===0?<tr><td colSpan={10}>Nenhum cenário.</td></tr>:scenarios.map(item=>
        <tr key={item.id} data-testid={`fin13-scenario-${item.id}`}>
          <td>{item.scenario_type}</td><td>{item.title}</td>
          <td>{item.premise_source||"Dado ausente"} · {item.premise_base_date?String(item.premise_base_date).slice(0,10):"Dado ausente"}</td>
          <td>{item.projected_revenue_cents==null?"Dado ausente":money(item.projected_revenue_cents)}</td>
          <td>{item.projected_cost_cents==null?"Dado ausente":money(item.projected_cost_cents)}</td>
          <td data-testid={`fin13-scenario-margin-${item.id}`}>{item.is_complete&&item.projected_margin_cents!=null?`${money(item.projected_margin_cents)} · ${Number(item.projected_margin_percent).toFixed(2)}% (estimativa)`:"Dado ausente"}</td>
          <td data-testid={`fin13-scenario-completeness-${item.id}`}>{item.is_complete?"completa":`incompleta: ${item.incomplete_reason||"motivo não informado"}`}</td>
          <td data-testid={`fin13-scenario-version-${item.id}`}>{item.premises_version}</td>
          <td data-testid={`fin13-scenario-approved-${item.id}`}>{item.is_approved?"sim":"não"}</td>
          <td>
            {!item.is_complete&&<button disabled={busy||reason.length<10} data-testid={`fin13-scenario-complete-${item.id}`} onClick={()=>completeScenario(item)}>Completar base</button>}
            {item.is_complete&&!item.is_approved&&<button disabled={busy||reason.length<10} data-testid={`fin13-scenario-approve-${item.id}`} onClick={()=>approveScenario(item)}>Aprovar (não cria compromisso)</button>}
            <button disabled={busy||reason.length<10||newPremises.length<10} data-testid={`fin13-scenario-revise-${item.id}`} onClick={()=>reviseScenario(item)}>Revisar premissas</button>
          </td>
        </tr>)}
    </tbody></table>
  </section>;
}
