"use client";

import { FormEvent, useEffect, useState } from "react";

type Budget = { id:string; protocol:string; title:string; premises:string; premise_source:string; premise_base_date:string; period_start:string; period_end:string; total_revenue_cents:string|number|null; total_cost_cents:string|number|null; total_margin_cents:string|number|null; status:string; is_estimate:boolean; premises_version:number; approved_at:string|null };
type Scenario = { id:string; budget_id:string; scenario_type:string; title:string; premises:string; premise_source:string; premise_base_date:string; projected_revenue_cents:string|number|null; projected_cost_cents:string|number|null; projected_margin_cents:string|number|null; realized_revenue_cents:string|number|null; realized_cost_cents:string|number|null; realized_margin_cents:string|number|null; is_complete:boolean; incomplete_reason:string|null; status:string; is_estimate:boolean; premises_version:number };

const money = (value:string|number|undefined|null) => value == null ? "Dado ausente" : `R$ ${(Number(value)/100).toFixed(2).replace(".",",")}`;
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
  const [budget,setBudget] = useState({ title:"", description:"", premises:"", premise_source:"", premise_base_date:"", period_start:"", period_end:"", total_revenue_cents:"", total_cost_cents:"", idempotency_key:"" });
  const [scenario,setScenario] = useState({ budget_id:"", scenario_type:"expansao", title:"", premises:"", premise_source:"", premise_base_date:"", projected_revenue_cents:"", projected_cost_cents:"", realized_revenue_cents:"", realized_cost_cents:"", incomplete_reason:"", idempotency_key:"" });

  const run = async (fn:()=>Promise<void>) => { setBusy(true); setError(""); setNotice(""); try { await fn(); } catch(e) { setError(e instanceof Error?e.message:"Falha inesperada"); } finally { setBusy(false); } };
  // load() não usa run(): recarregar a lista não pode apagar o aviso da ação.
  const load = async () => {
    const [b,s] = await Promise.all([api("/api/fin/budgets"), api("/api/fin/budget-scenarios")]);
    setBudgets(b.budgets||[]); setScenarios(s.scenarios||[]);
  };
  useEffect(()=>{ load().catch(e=>setError(e instanceof Error?e.message:"Falha ao carregar")); }, []);

  const createBudget = async (event:FormEvent) => { event.preventDefault(); await run(async()=>{
    const data = await api("/api/fin/budgets",{method:"POST",body:JSON.stringify({
      ...budget,
      total_revenue_cents: budget.total_revenue_cents?Number(budget.total_revenue_cents):null,
      total_cost_cents: budget.total_cost_cents?Number(budget.total_cost_cents):null
    })});
    setNotice(`Orçamento ${data.budget.protocol} registrado em ${data.budget.status} com premissas explícitas: projeção, nunca resultado.`);
    setBudget({ title:"", description:"", premises:"", premise_source:"", premise_base_date:"", period_start:"", period_end:"", total_revenue_cents:"", total_cost_cents:"", idempotency_key:"" });
    await load();
  }); };

  const transitionBudget = (item:Budget, status:string) => run(async()=>{
    await api("/api/fin/budgets",{method:"PATCH",body:JSON.stringify({ id:item.id, status, reason })});
    setNotice(status==="aprovado"
      ? `Orçamento aprovado com auditoria; a aprovação não cria recebível, despesa, meta nem compromisso.`
      : `Orçamento em ${status}.`);
    setReason(""); await load();
  });

  const createScenario = async (event:FormEvent) => { event.preventDefault(); await run(async()=>{
    const data = await api("/api/fin/budget-scenarios",{method:"POST",body:JSON.stringify({
      ...scenario,
      projected_revenue_cents: scenario.projected_revenue_cents?Number(scenario.projected_revenue_cents):null,
      projected_cost_cents: scenario.projected_cost_cents?Number(scenario.projected_cost_cents):null,
      realized_revenue_cents: scenario.realized_revenue_cents?Number(scenario.realized_revenue_cents):null,
      realized_cost_cents: scenario.realized_cost_cents?Number(scenario.realized_cost_cents):null
    })});
    setNotice(data.scenario.is_complete
      ? "Cenário registrado: projeção e realizado são exibidos separadamente; a margem realizada só existe com dados completos."
      : "Cenário registrado como estimativa incompleta com motivo explícito: dado ausente é lacuna visível, não zero.");
    setScenario({ budget_id:"", scenario_type:"expansao", title:"", premises:"", premise_source:"", premise_base_date:"", projected_revenue_cents:"", projected_cost_cents:"", realized_revenue_cents:"", realized_cost_cents:"", incomplete_reason:"", idempotency_key:"" });
    await load();
  }); };

  const transitionScenario = (item:Scenario, status:string) => run(async()=>{
    await api("/api/fin/budget-scenarios",{method:"PATCH",body:JSON.stringify({ id:item.id, status, reason })});
    setNotice(status==="aprovado"
      ? `Cenário aprovado: nenhum compromisso foi criado — aprovação é decisão, não lançamento.`
      : `Cenário em ${status}.`);
    setReason(""); await load();
  });

  // Alterar a premissa de um cenário aprovado retira a aprovação e versiona as
  // premissas: a decisão anterior foi tomada sobre outras premissas.
  const reviseScenarioPremise = (item:Scenario) => run(async()=>{
    const premises = window.prompt("Novas premissas do cenário (10 a 2000 caracteres):", `${item.premises} [revisado]`);
    if (!premises || premises.trim().length < 10) throw new Error("premises_10_2000_required");
    const data = await api("/api/fin/budget-scenarios",{method:"PATCH",body:JSON.stringify({ id:item.id, premises:premises.trim(), reason })});
    setNotice(`Premissas revisadas (versão ${data.scenario.premises_version}); status voltou para ${data.scenario.status}.`);
    setReason(""); await load();
  });

  return <section data-testid="fin13-budget">
    <h2>Orçamento gerencial e cenários de expansão</h2>
    <p>Toda projeção nasce com premissas explícitas (texto, origem do número e data-base) e é sempre identificada como estimativa: projetado e realizado são campos e rótulos distintos, dado ausente é lacuna visível com motivo — nunca zero — e alterar premissas de um item aprovado retira a aprovação e incrementa a versão. Aprovar orçamento ou cenário não cria compromisso: nenhum recebível, despesa, meta ou provisão nasce daqui. Nada aqui promete resultado.</p>
    {error&&<p role="alert" data-testid="fin13-error">{error}</p>}
    {notice&&<p role="status" data-testid="fin13-notice">{notice}</p>}

    <h3>Orçamento gerencial</h3>
    <form onSubmit={createBudget} data-testid="fin13-budget-form">
      <input required minLength={5} maxLength={200} data-testid="fin13-budget-title" placeholder="Título do orçamento" value={budget.title} onChange={e=>setBudget({...budget,title:e.target.value})}/>
      <input required minLength={10} maxLength={2000} data-testid="fin13-budget-description" placeholder="Descrição (10 a 2000)" value={budget.description} onChange={e=>setBudget({...budget,description:e.target.value})}/>
      <input required minLength={10} maxLength={2000} data-testid="fin13-budget-premises" placeholder="Premissas explícitas (10 a 2000)" value={budget.premises} onChange={e=>setBudget({...budget,premises:e.target.value})}/>
      <input required minLength={5} maxLength={200} data-testid="fin13-budget-premise-source" placeholder="Origem dos números (5 a 200)" value={budget.premise_source} onChange={e=>setBudget({...budget,premise_source:e.target.value})}/>
      <input required type="date" data-testid="fin13-budget-premise-base-date" aria-label="Data-base das premissas" value={budget.premise_base_date} onChange={e=>setBudget({...budget,premise_base_date:e.target.value})}/>
      <input required type="date" data-testid="fin13-budget-period-start" aria-label="Início do período" value={budget.period_start} onChange={e=>setBudget({...budget,period_start:e.target.value})}/>
      <input required type="date" data-testid="fin13-budget-period-end" aria-label="Fim do período" value={budget.period_end} onChange={e=>setBudget({...budget,period_end:e.target.value})}/>
      <input type="number" min="0" data-testid="fin13-budget-revenue" placeholder="Receita planejada (centavos, projeção)" value={budget.total_revenue_cents} onChange={e=>setBudget({...budget,total_revenue_cents:e.target.value})}/>
      <input type="number" min="0" data-testid="fin13-budget-cost" placeholder="Custo planejado (centavos, projeção)" value={budget.total_cost_cents} onChange={e=>setBudget({...budget,total_cost_cents:e.target.value})}/>
      <input required minLength={8} maxLength={200} data-testid="fin13-budget-idempotency" placeholder="Chave de idempotência" value={budget.idempotency_key} onChange={e=>setBudget({...budget,idempotency_key:e.target.value})}/>
      <button data-testid="fin13-budget-create" disabled={busy}>Registrar orçamento</button>
    </form>
    <label>Motivo da transição/revisão <input minLength={10} maxLength={1000} data-testid="fin13-reason" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Motivo (10 a 1000 caracteres)"/></label>
    <table data-testid="fin13-budgets-table"><thead><tr><th>Protocolo</th><th>Título</th><th>Período</th><th>Status</th><th>Versão premissas</th><th>Rótulo</th><th>Transição</th></tr></thead><tbody>
      {budgets.length===0?<tr><td colSpan={7}>Nenhum orçamento registrado.</td></tr>:budgets.map(item=>
        <tr key={item.id} data-testid={`fin13-budget-${item.id}`}>
          <td>{item.protocol}</td><td>{item.title}</td><td>{item.period_start} → {item.period_end}</td>
          <td data-testid={`fin13-budget-status-${item.id}`}>{item.status}</td>
          <td data-testid={`fin13-budget-version-${item.id}`}>{item.premises_version}</td>
          <td>{item.is_estimate?"projeção/estimativa":"NÃO ESTIMATIVA"}</td>
          <td>
            {item.status==="rascunho"&&<button disabled={busy||reason.length<10} data-testid={`fin13-budget-revise-${item.id}`} onClick={()=>transitionBudget(item,"em_revisao")}>Enviar p/ revisão</button>}
            {item.status==="em_revisao"&&<button disabled={busy||reason.length<10} data-testid={`fin13-budget-approve-${item.id}`} onClick={()=>transitionBudget(item,"aprovado")}>Aprovar</button>}
            {item.status==="em_revisao"&&<button disabled={busy||reason.length<10} data-testid={`fin13-budget-reject-${item.id}`} onClick={()=>transitionBudget(item,"rejeitado")}>Rejeitar</button>}
            {item.status!=="arquivado"&&<button disabled={busy||reason.length<10} data-testid={`fin13-budget-archive-${item.id}`} onClick={()=>transitionBudget(item,"arquivado")}>Arquivar</button>}
          </td>
        </tr>)}
    </tbody></table>

    <h3>Cenários de expansão</h3>
    <form onSubmit={createScenario} data-testid="fin13-scenario-form">
      <select required data-testid="fin13-scenario-budget" value={scenario.budget_id} onChange={e=>setScenario({...scenario,budget_id:e.target.value})}>
        <option value="">Orçamento de origem</option>
        {budgets.filter(item=>item.status!=="arquivado").map(item=><option key={item.id} value={item.id}>{item.protocol} · {item.title}</option>)}
      </select>
      <select required data-testid="fin13-scenario-type" value={scenario.scenario_type} onChange={e=>setScenario({...scenario,scenario_type:e.target.value})}>
        {["conservador","base","otimista","expansao","pessimista"].map(type=><option key={type} value={type}>{type}</option>)}
      </select>
      <input required minLength={5} maxLength={200} data-testid="fin13-scenario-title" placeholder="Título do cenário" value={scenario.title} onChange={e=>setScenario({...scenario,title:e.target.value})}/>
      <input required minLength={10} maxLength={2000} data-testid="fin13-scenario-premises" placeholder="Premissas explícitas (10 a 2000)" value={scenario.premises} onChange={e=>setScenario({...scenario,premises:e.target.value})}/>
      <input required minLength={5} maxLength={200} data-testid="fin13-scenario-premise-source" placeholder="Origem dos números (5 a 200)" value={scenario.premise_source} onChange={e=>setScenario({...scenario,premise_source:e.target.value})}/>
      <input required type="date" data-testid="fin13-scenario-premise-base-date" aria-label="Data-base das premissas" value={scenario.premise_base_date} onChange={e=>setScenario({...scenario,premise_base_date:e.target.value})}/>
      <input type="number" min="0" data-testid="fin13-scenario-projected-revenue" placeholder="Receita projetada (centavos, projeção)" value={scenario.projected_revenue_cents} onChange={e=>setScenario({...scenario,projected_revenue_cents:e.target.value})}/>
      <input type="number" min="0" data-testid="fin13-scenario-projected-cost" placeholder="Custo projetado (centavos, projeção)" value={scenario.projected_cost_cents} onChange={e=>setScenario({...scenario,projected_cost_cents:e.target.value})}/>
      <input type="number" min="0" data-testid="fin13-scenario-realized-revenue" placeholder="Receita realizada (centavos, opcional)" value={scenario.realized_revenue_cents} onChange={e=>setScenario({...scenario,realized_revenue_cents:e.target.value})}/>
      <input type="number" min="0" data-testid="fin13-scenario-realized-cost" placeholder="Custo realizado (centavos, opcional)" value={scenario.realized_cost_cents} onChange={e=>setScenario({...scenario,realized_cost_cents:e.target.value})}/>
      <input minLength={10} maxLength={1000} data-testid="fin13-scenario-incomplete-reason" placeholder="Motivo da lacuna quando não há realizado (10 a 1000)" value={scenario.incomplete_reason} onChange={e=>setScenario({...scenario,incomplete_reason:e.target.value})}/>
      <input required minLength={8} maxLength={200} data-testid="fin13-scenario-idempotency" placeholder="Chave de idempotência" value={scenario.idempotency_key} onChange={e=>setScenario({...scenario,idempotency_key:e.target.value})}/>
      <button data-testid="fin13-scenario-create" disabled={busy}>Registrar cenário</button>
    </form>
    <table data-testid="fin13-scenarios-table"><thead><tr><th>Orçamento</th><th>Tipo</th><th>Título</th><th>Status</th><th>Projeção (estimativa)</th><th>Realizado</th><th>Completo</th><th>Versão premissas</th><th>Ações</th></tr></thead><tbody>
      {scenarios.length===0?<tr><td colSpan={9}>Nenhum cenário registrado.</td></tr>:scenarios.map(item=>
        <tr key={item.id} data-testid={`fin13-scenario-${item.id}`}>
          <td>{item.budget_id.slice(0,8)}</td><td>{item.scenario_type}</td><td>{item.title}</td>
          <td data-testid={`fin13-scenario-status-${item.id}`}>{item.status}</td>
          <td>{money(item.projected_revenue_cents)} − {money(item.projected_cost_cents)} = {money(item.projected_margin_cents)}</td>
          <td data-testid={`fin13-scenario-realized-${item.id}`}>{money(item.realized_revenue_cents)} − {money(item.realized_cost_cents)} = {money(item.realized_margin_cents)}</td>
          <td data-testid={`fin13-scenario-complete-${item.id}`}>{item.is_complete?"sim":`não — ${item.incomplete_reason?.slice(0,50)}`}</td>
          <td data-testid={`fin13-scenario-version-${item.id}`}>{item.premises_version}</td>
          <td>
            {item.status==="rascunho"&&<button disabled={busy||reason.length<10} data-testid={`fin13-scenario-revise-${item.id}`} onClick={()=>transitionScenario(item,"em_revisao")}>Enviar p/ revisão</button>}
            {item.status==="em_revisao"&&<button disabled={busy||reason.length<10} data-testid={`fin13-scenario-approve-${item.id}`} onClick={()=>transitionScenario(item,"aprovado")}>Aprovar</button>}
            {item.status==="em_revisao"&&<button disabled={busy||reason.length<10} data-testid={`fin13-scenario-reject-${item.id}`} onClick={()=>transitionScenario(item,"rejeitado")}>Rejeitar</button>}
            {item.status!=="arquivado"&&<button disabled={busy||reason.length<10} data-testid={`fin13-scenario-archive-${item.id}`} onClick={()=>transitionScenario(item,"arquivado")}>Arquivar</button>}
            {item.status==="aprovado"&&<button disabled={busy||reason.length<10} data-testid={`fin13-scenario-revise-premise-${item.id}`} onClick={()=>reviseScenarioPremise(item)}>Revisar premissas (derruba aprovação)</button>}
          </td>
        </tr>)}
    </tbody></table>
  </section>;
}
