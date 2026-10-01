"use client";

import { FormEvent, useEffect, useState } from "react";

type Budget = {
  id:string; protocol:string; title:string; description:string; premises:string;
  assumptions:{ premissa:string; fonte:string }[]|null;
  period_start:string; period_end:string;
  total_revenue_cents:string|number|null; total_cost_cents:string|number|null; total_margin_cents:string|number|null;
  status:string; is_estimate:boolean; estimate_note:string;
  created_by_identity:string|null; submitted_by_identity:string|null;
  approved_by_identity:string|null; approved_at:string|null;
  rejected_by_identity:string|null; rejected_at:string|null;
  archived_at:string|null; decision_reason:string|null;
};
type Scenario = {
  id:string; budget_id:string; scenario_type:string; title:string; premises:string;
  assumptions:{ premissa:string; fonte:string }[]|null;
  projected_revenue_cents:string|number|null; projected_cost_cents:string|number|null;
  projected_margin_cents:string|number|null; projected_margin_percent:string|number|null;
  expansion_investment_cents:string|number|null; margin_formula:string|null;
  is_estimate:boolean; estimate_note:string;
};

const money = (value:string|number|null|undefined) => value == null ? "Dado ausente" : `R$ ${(Number(value)/100).toFixed(2).replace(".",",")}`;
const percent = (value:string|number|null|undefined) => value == null ? "Dado ausente" : `${Number(value).toFixed(2).replace(".",",")}%`;

const FRIENDLY_ERRORS:Record<string,string> = {
  approver_must_differ_from_author: "Aprovação recusada: o aprovador precisa ser diferente do autor do orçamento.",
  fin13_budget_approver_must_differ_from_author: "Aprovação recusada: o aprovador precisa ser diferente do autor do orçamento.",
  scenarios_required_base_and_alternative: "Revisão exige cenários explícitos: um cenário base e ao menos uma alternativa.",
  fin13_budget_review_requires_scenarios: "Revisão exige cenários explícitos: um cenário base e ao menos uma alternativa.",
  result_promise_refused: "Texto recusado: o orçamento é estimativa e não pode prometer resultado.",
  fin13_budget_result_promise_refused: "Texto recusado: o orçamento é estimativa e não pode prometer resultado.",
  fin13_scenario_result_promise_refused: "Texto recusado: o cenário é estimativa e não pode prometer resultado.",
  assumptions_required_premissa_fonte_min_2: "Premissas obrigatórias: informe ao menos duas, cada uma com premissa e fonte.",
  budget_not_in_rascunho: "Cenário só pode ser adicionado enquanto o orçamento é rascunho.",
  budget_invalid_transition: "Transição recusada: o orçamento percorre rascunho, em revisão e então aprovado ou rejeitado.",
  projected_margin_is_server_side: "A margem projetada é calculada pelo servidor; não é informada pelo cliente.",
};

async function api(path:string, init?:RequestInit) {
  const response = await fetch(path, { ...init, headers:{ "Content-Type":"application/json", ...(init?.headers||{}) } });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return data;
}

const emptyBudget = {
  title:"", description:"", premises:"",
  premissa1:"", fonte1:"", premissa2:"", fonte2:"",
  period_start:"", period_end:"", total_revenue_cents:"", total_cost_cents:"", idempotency_key:"",
};
const emptyScenario = {
  budget_id:"", scenario_type:"base", title:"", premises:"",
  premissa1:"", fonte1:"", premissa2:"", fonte2:"",
  projected_revenue_cents:"", projected_cost_cents:"", expansion_investment_cents:"", idempotency_key:"",
};

export default function BudgetWorkspace() {
  const [budgets,setBudgets] = useState<Budget[]>([]);
  const [scenarios,setScenarios] = useState<Scenario[]>([]);
  const [history,setHistory] = useState<Record<string,unknown>[]>([]);
  const [budget,setBudget] = useState(emptyBudget);
  const [scenario,setScenario] = useState(emptyScenario);
  const [reason,setReason] = useState("");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");

  // load() não usa run(): recarregar as listas não pode apagar o aviso da ação.
  const load = async () => {
    const [b,s,h] = await Promise.all([api("/api/fin/budgets"), api("/api/fin/budget-scenarios"), api("/api/fin/budget-history")]);
    setBudgets(b.budgets||[]); setScenarios(s.scenarios||[]); setHistory(h.history||[]);
  };
  useEffect(()=>{ load().catch(e=>setError(e instanceof Error?(FRIENDLY_ERRORS[e.message]||e.message):"Falha ao carregar")); }, []);
  const run = async (fn:()=>Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); }
    catch(e) { const code = e instanceof Error ? e.message : "falha_inesperada"; setError(FRIENDLY_ERRORS[code] || code); }
    finally { setBusy(false); }
  };

  const createBudget = (event:FormEvent) => { event.preventDefault(); run(async()=>{
    await api("/api/fin/budgets",{method:"POST",body:JSON.stringify({
      title:budget.title, description:budget.description, premises:budget.premises,
      assumptions:[{ premissa:budget.premissa1, fonte:budget.fonte1 },{ premissa:budget.premissa2, fonte:budget.fonte2 }],
      period_start:budget.period_start, period_end:budget.period_end,
      total_revenue_cents:Number(budget.total_revenue_cents), total_cost_cents:Number(budget.total_cost_cents),
      idempotency_key:budget.idempotency_key,
    })});
    setBudget(emptyBudget);
    setNotice("Orçamento criado em rascunho como estimativa com premissas explícitas; nenhum resultado é prometido.");
    await load();
  }); };

  const createScenario = (event:FormEvent) => { event.preventDefault(); run(async()=>{
    const data = await api("/api/fin/budget-scenarios",{method:"POST",body:JSON.stringify({
      budget_id:scenario.budget_id, scenario_type:scenario.scenario_type, title:scenario.title, premises:scenario.premises,
      assumptions:[{ premissa:scenario.premissa1, fonte:scenario.fonte1 },{ premissa:scenario.premissa2, fonte:scenario.fonte2 }],
      projected_revenue_cents:Number(scenario.projected_revenue_cents), projected_cost_cents:Number(scenario.projected_cost_cents),
      ...(scenario.scenario_type==="expansao"?{ expansion_investment_cents:Number(scenario.expansion_investment_cents) }:{}),
      idempotency_key:scenario.idempotency_key,
    })});
    setScenario({ ...emptyScenario, budget_id:scenario.budget_id });
    setNotice(`Cenário ${data.scenario.scenario_type} vinculado; margem projetada calculada pelo servidor: ${percent(data.scenario.projected_margin_percent)}.`);
    await load();
  }); };

  const transition = (item:Budget, status:string) => run(async()=>{
    await api("/api/fin/budgets",{method:"PATCH",body:JSON.stringify({ id:item.id, status, reason })});
    setNotice(
      status==="em_revisao" ? "Orçamento enviado para revisão com os cenários registrados."
      : status==="aprovado" ? "Orçamento aprovado com aprovador e data auditados; segue sendo estimativa, sem promessa de resultado."
      : status==="rejeitado" ? "Orçamento rejeitado com motivo registrado no histórico imutável."
      : "Orçamento arquivado; o histórico permanece imutável.");
    setReason(""); await load();
  });

  const scenariosOf = (id:string) => scenarios.filter(item=>item.budget_id===id);

  return <section data-testid="fin13-budget">
    <h2>Orçamento gerencial e cenários de expansão</h2>
    <p data-testid="fin13-estimate-warning">
      Todo orçamento aqui é uma <strong>estimativa</strong> derivada de premissas explícitas, registradas com a respectiva fonte.
      O sistema <strong>não promete resultado</strong>: números projetados não são compromisso de receita, margem ou retorno.
      O orçamento percorre rascunho, em revisão e então aprovado ou rejeitado; a aprovação exige aprovador diferente do autor e fica auditada com data.
    </p>
    {error&&<p role="alert" data-testid="fin13-error">{error}</p>}
    {notice&&<p role="status" data-testid="fin13-notice">{notice}</p>}

    <h3>Novo orçamento (rascunho)</h3>
    <form onSubmit={createBudget} data-testid="fin13-budget-form">
      <input required minLength={5} maxLength={200} data-testid="fin13-budget-title" placeholder="Título do orçamento" value={budget.title} onChange={e=>setBudget({...budget,title:e.target.value})}/>
      <input required minLength={10} maxLength={2000} data-testid="fin13-budget-description" placeholder="Descrição" value={budget.description} onChange={e=>setBudget({...budget,description:e.target.value})}/>
      <textarea required minLength={30} maxLength={2000} data-testid="fin13-budget-premises" placeholder="Premissas explícitas (mínimo 30 caracteres)" value={budget.premises} onChange={e=>setBudget({...budget,premises:e.target.value})}/>
      <fieldset data-testid="fin13-budget-assumptions"><legend>Premissas estruturadas (obrigatórias: premissa + fonte)</legend>
        <input required minLength={10} maxLength={500} data-testid="fin13-budget-assumption-1-premissa" placeholder="Premissa 1" value={budget.premissa1} onChange={e=>setBudget({...budget,premissa1:e.target.value})}/>
        <input required minLength={3} maxLength={200} data-testid="fin13-budget-assumption-1-fonte" placeholder="Fonte 1" value={budget.fonte1} onChange={e=>setBudget({...budget,fonte1:e.target.value})}/>
        <input required minLength={10} maxLength={500} data-testid="fin13-budget-assumption-2-premissa" placeholder="Premissa 2" value={budget.premissa2} onChange={e=>setBudget({...budget,premissa2:e.target.value})}/>
        <input required minLength={3} maxLength={200} data-testid="fin13-budget-assumption-2-fonte" placeholder="Fonte 2" value={budget.fonte2} onChange={e=>setBudget({...budget,fonte2:e.target.value})}/>
      </fieldset>
      <input required type="date" aria-label="Início do período" data-testid="fin13-budget-start" value={budget.period_start} onChange={e=>setBudget({...budget,period_start:e.target.value})}/>
      <input required type="date" aria-label="Fim do período" data-testid="fin13-budget-end" value={budget.period_end} onChange={e=>setBudget({...budget,period_end:e.target.value})}/>
      <input required type="number" min="1" data-testid="fin13-budget-revenue" placeholder="Receita estimada em centavos" value={budget.total_revenue_cents} onChange={e=>setBudget({...budget,total_revenue_cents:e.target.value})}/>
      <input required type="number" min="0" data-testid="fin13-budget-cost" placeholder="Custo estimado em centavos" value={budget.total_cost_cents} onChange={e=>setBudget({...budget,total_cost_cents:e.target.value})}/>
      <input required minLength={10} maxLength={200} data-testid="fin13-budget-idempotency" placeholder="Chave de idempotência" value={budget.idempotency_key} onChange={e=>setBudget({...budget,idempotency_key:e.target.value})}/>
      <button data-testid="fin13-budget-create" disabled={busy}>Criar orçamento</button>
    </form>

    <label>Motivo da transição <input minLength={10} maxLength={1000} data-testid="fin13-reason" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Motivo (10 a 1000 caracteres)"/></label>

    <table data-testid="fin13-budgets-table"><thead><tr><th>Protocolo</th><th>Período</th><th>Receita</th><th>Custo</th><th>Margem</th><th>Cenários</th><th>Estimativa</th><th>Status</th><th>Transição</th></tr></thead><tbody>
      {budgets.length===0?<tr><td colSpan={9} data-testid="fin13-budgets-empty">Nenhum orçamento registrado.</td></tr>:budgets.map(item=>
        <tr key={item.id} data-testid={`fin13-budget-${item.id}`}>
          <td>{item.protocol}</td>
          <td>{String(item.period_start).slice(0,10)} a {String(item.period_end).slice(0,10)}</td>
          <td>{money(item.total_revenue_cents)}</td>
          <td>{money(item.total_cost_cents)}</td>
          <td data-testid={`fin13-budget-margin-${item.id}`}>{money(item.total_margin_cents)}</td>
          <td data-testid={`fin13-budget-scenarios-${item.id}`}>{scenariosOf(item.id).length}</td>
          <td data-testid={`fin13-budget-estimate-${item.id}`}>{item.is_estimate?"estimativa":"NÃO DECLARADA"}</td>
          <td data-testid={`fin13-budget-status-${item.id}`}>{item.status}</td>
          <td>
            {item.status==="rascunho"&&<button disabled={busy||reason.length<10} data-testid={`fin13-budget-review-${item.id}`} onClick={()=>transition(item,"em_revisao")}>Enviar para revisão</button>}
            {item.status==="em_revisao"&&<button disabled={busy||reason.length<10} data-testid={`fin13-budget-approve-${item.id}`} onClick={()=>transition(item,"aprovado")}>Aprovar</button>}
            {item.status==="em_revisao"&&<button disabled={busy||reason.length<10} data-testid={`fin13-budget-reject-${item.id}`} onClick={()=>transition(item,"rejeitado")}>Rejeitar</button>}
            {item.status!=="arquivado"&&item.status!=="em_revisao"&&<button disabled={busy||reason.length<10} data-testid={`fin13-budget-archive-${item.id}`} onClick={()=>transition(item,"arquivado")}>Arquivar</button>}
          </td>
        </tr>)}
    </tbody></table>

    <h3>Cenário vinculado (premissas explícitas e margem calculada)</h3>
    <form onSubmit={createScenario} data-testid="fin13-scenario-form">
      <select required data-testid="fin13-scenario-budget" value={scenario.budget_id} onChange={e=>setScenario({...scenario,budget_id:e.target.value})}>
        <option value="">Orçamento em rascunho</option>
        {budgets.filter(item=>item.status==="rascunho").map(item=><option key={item.id} value={item.id}>{item.protocol} · {item.title}</option>)}
      </select>
      <select required data-testid="fin13-scenario-type" value={scenario.scenario_type} onChange={e=>setScenario({...scenario,scenario_type:e.target.value})}>
        {["conservador","base","otimista","expansao","pessimista"].map(type=><option key={type} value={type}>{type}</option>)}
      </select>
      <input required minLength={5} maxLength={200} data-testid="fin13-scenario-title" placeholder="Título do cenário" value={scenario.title} onChange={e=>setScenario({...scenario,title:e.target.value})}/>
      <textarea required minLength={30} maxLength={2000} data-testid="fin13-scenario-premises" placeholder="Premissas explícitas do cenário" value={scenario.premises} onChange={e=>setScenario({...scenario,premises:e.target.value})}/>
      <fieldset data-testid="fin13-scenario-assumptions"><legend>Premissas estruturadas do cenário</legend>
        <input required minLength={10} maxLength={500} data-testid="fin13-scenario-assumption-1-premissa" placeholder="Premissa 1" value={scenario.premissa1} onChange={e=>setScenario({...scenario,premissa1:e.target.value})}/>
        <input required minLength={3} maxLength={200} data-testid="fin13-scenario-assumption-1-fonte" placeholder="Fonte 1" value={scenario.fonte1} onChange={e=>setScenario({...scenario,fonte1:e.target.value})}/>
        <input required minLength={10} maxLength={500} data-testid="fin13-scenario-assumption-2-premissa" placeholder="Premissa 2" value={scenario.premissa2} onChange={e=>setScenario({...scenario,premissa2:e.target.value})}/>
        <input required minLength={3} maxLength={200} data-testid="fin13-scenario-assumption-2-fonte" placeholder="Fonte 2" value={scenario.fonte2} onChange={e=>setScenario({...scenario,fonte2:e.target.value})}/>
      </fieldset>
      <input required type="number" min="1" data-testid="fin13-scenario-revenue" placeholder="Receita projetada em centavos" value={scenario.projected_revenue_cents} onChange={e=>setScenario({...scenario,projected_revenue_cents:e.target.value})}/>
      <input required type="number" min="0" data-testid="fin13-scenario-cost" placeholder="Custo projetado em centavos" value={scenario.projected_cost_cents} onChange={e=>setScenario({...scenario,projected_cost_cents:e.target.value})}/>
      {scenario.scenario_type==="expansao"&&<input required type="number" min="1" data-testid="fin13-scenario-investment" placeholder="Investimento da expansão em centavos" value={scenario.expansion_investment_cents} onChange={e=>setScenario({...scenario,expansion_investment_cents:e.target.value})}/>}
      <input required minLength={10} maxLength={200} data-testid="fin13-scenario-idempotency" placeholder="Chave de idempotência" value={scenario.idempotency_key} onChange={e=>setScenario({...scenario,idempotency_key:e.target.value})}/>
      <button data-testid="fin13-scenario-create" disabled={busy}>Criar cenário</button>
    </form>
    <table data-testid="fin13-scenarios-table"><thead><tr><th>Orçamento</th><th>Tipo</th><th>Receita</th><th>Custo</th><th>Margem</th><th>Margem %</th><th>Investimento</th><th>Estimativa</th></tr></thead><tbody>
      {scenarios.length===0?<tr><td colSpan={8} data-testid="fin13-scenarios-empty">Nenhum cenário registrado.</td></tr>:scenarios.map(item=>
        <tr key={item.id} data-testid={`fin13-scenario-${item.id}`}>
          <td>{budgets.find(b=>b.id===item.budget_id)?.protocol||item.budget_id.slice(0,8)}</td>
          <td data-testid={`fin13-scenario-type-${item.id}`}>{item.scenario_type}</td>
          <td>{money(item.projected_revenue_cents)}</td>
          <td>{money(item.projected_cost_cents)}</td>
          <td>{money(item.projected_margin_cents)}</td>
          <td data-testid={`fin13-scenario-margin-${item.id}`}>{percent(item.projected_margin_percent)}</td>
          <td>{item.expansion_investment_cents==null?"não se aplica":money(item.expansion_investment_cents)}</td>
          <td data-testid={`fin13-scenario-estimate-${item.id}`}>{item.is_estimate?"estimativa":"NÃO DECLARADA"}</td>
        </tr>)}
    </tbody></table>

    <h3>Histórico imutável de revisões e aprovações</h3>
    <table data-testid="fin13-history-table"><thead><tr><th>Entidade</th><th>De</th><th>Para</th><th>Motivo</th></tr></thead><tbody>
      {history.length===0?<tr><td colSpan={4} data-testid="fin13-history-empty">Nenhum movimento registrado.</td></tr>:history.slice(0,50).map((item,index)=>
        <tr key={String(item.id||index)}>
          <td>{String(item.entity_type||"")}</td>
          <td>{String(item.previous_status||"—")}</td>
          <td>{String(item.next_status||"")}</td>
          <td>{String(item.reason||"")}</td>
        </tr>)}
    </tbody></table>
  </section>;
}
