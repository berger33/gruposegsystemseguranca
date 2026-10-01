"use client";

import { FormEvent, useEffect, useState } from "react";

type Budget = {
  id: string;
  protocol: string;
  title: string;
  description: string;
  premises: string;
  period_start: string;
  period_end: string;
  total_revenue_cents: number | string | null;
  total_cost_cents: number | string | null;
  total_margin_cents: number | string | null;
  status: string;
  is_estimate: boolean;
  estimate_note: string;
};

type Scenario = {
  id: string;
  budget_id: string;
  scenario_type: string;
  title: string;
  premises: string;
  projected_revenue_cents: number | string | null;
  projected_cost_cents: number | string | null;
  projected_margin_cents: number | string | null;
  projected_margin_percent: number | string | null;
  is_estimate: boolean;
  estimate_note: string;
};

const SCENARIOS = ["conservador", "base", "otimista", "expansao", "pessimista"];

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return data;
}

export default function BudgetWorkspace() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    title: "",
    description: "",
    premises: "",
    period_start: "",
    period_end: "",
    total_revenue_cents: "",
    total_cost_cents: "",
  });
  const [scenario, setScenario] = useState({
    budget_id: "",
    scenario_type: "base",
    title: "",
    premises: "",
    projected_revenue_cents: "",
    projected_cost_cents: "",
    projected_margin_percent: "",
  });

  const load = async () => {
    const [budgetData, scenarioData] = await Promise.all([
      api("/api/fin/budgets").catch(() => ({ budgets: [] })),
      api("/api/fin/budget-scenarios").catch(() => ({ scenarios: [] })),
    ]);
    setBudgets(budgetData.budgets || []);
    setScenarios(scenarioData.scenarios || []);
  };

  useEffect(() => { load(); }, []);

  const submitBudget = async (event: FormEvent) => {
    event.preventDefault();
    setMsg("");
    try {
      const data = await api("/api/fin/budgets", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          total_revenue_cents: form.total_revenue_cents ? Number(form.total_revenue_cents) : null,
          total_cost_cents: form.total_cost_cents ? Number(form.total_cost_cents) : null,
        }),
      });
      setMsg(`Orçamento ${data.budget.protocol} criado como estimativa; premissas explícitas registradas sem promessa de resultado.`);
      setForm({ title: "", description: "", premises: "", period_start: "", period_end: "", total_revenue_cents: "", total_cost_cents: "" });
      setScenario(current => ({ ...current, budget_id: data.budget.id }));
      await load();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Falha ao criar orçamento");
    }
  };

  const submitScenario = async (event: FormEvent) => {
    event.preventDefault();
    setMsg("");
    try {
      const data = await api("/api/fin/budget-scenarios", {
        method: "POST",
        body: JSON.stringify({
          ...scenario,
          projected_revenue_cents: scenario.projected_revenue_cents ? Number(scenario.projected_revenue_cents) : null,
          projected_cost_cents: scenario.projected_cost_cents ? Number(scenario.projected_cost_cents) : null,
          projected_margin_percent: scenario.projected_margin_percent ? Number(scenario.projected_margin_percent) : null,
        }),
      });
      setMsg(`Cenário ${data.scenario.scenario_type} criado como estimativa identificada; não há promessa de resultado.`);
      setScenario(current => ({ ...current, scenario_type: "base", title: "", premises: "", projected_revenue_cents: "", projected_cost_cents: "", projected_margin_percent: "" }));
      await load();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Falha ao criar cenário");
    }
  };

  return (
    <section data-testid="finance-budget-workspace">
      <h2>Orçamento gerencial e cenários</h2>
      <p data-testid="fin13-disclaimer">
        <strong>Premissas explícitas obrigatórias:</strong> todos os valores são estimativas gerenciais, identificados com <code>is_estimate=true</code>; não prometemos resultado financeiro.
      </p>

      <form data-testid="fin13-budget-form" onSubmit={submitBudget} style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <h3>Criar orçamento ORC-FIN</h3>
        <input data-testid="fin13-budget-title" required minLength={5} maxLength={200} placeholder="Título" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        <input data-testid="fin13-budget-description" required minLength={10} maxLength={2000} placeholder="Descrição" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        <textarea data-testid="fin13-budget-premises" required minLength={10} maxLength={2000} placeholder="Premissas e riscos" value={form.premises} onChange={e => setForm({ ...form, premises: e.target.value })} />
        <input data-testid="fin13-budget-start" required type="date" value={form.period_start} onChange={e => setForm({ ...form, period_start: e.target.value })} />
        <input data-testid="fin13-budget-end" required type="date" value={form.period_end} onChange={e => setForm({ ...form, period_end: e.target.value })} />
        <input data-testid="fin13-budget-revenue" type="number" min="0" placeholder="Receita estimada em centavos" value={form.total_revenue_cents} onChange={e => setForm({ ...form, total_revenue_cents: e.target.value })} />
        <input data-testid="fin13-budget-cost" type="number" min="0" placeholder="Custo estimado em centavos" value={form.total_cost_cents} onChange={e => setForm({ ...form, total_cost_cents: e.target.value })} />
        <button data-testid="fin13-budget-create">Criar estimativa</button>
      </form>

      <form data-testid="fin13-scenario-form" onSubmit={submitScenario} style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <h3>Criar cenário permitido</h3>
        <select data-testid="fin13-scenario-budget" required value={scenario.budget_id} onChange={e => setScenario({ ...scenario, budget_id: e.target.value })}>
          <option value="">Selecione um orçamento</option>
          {budgets.map(budget => <option key={budget.id} value={budget.id}>{budget.protocol} · {budget.title}</option>)}
        </select>
        <select data-testid="fin13-scenario-type" value={scenario.scenario_type} onChange={e => setScenario({ ...scenario, scenario_type: e.target.value })}>
          {SCENARIOS.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <input data-testid="fin13-scenario-title" required minLength={5} maxLength={200} placeholder="Título do cenário" value={scenario.title} onChange={e => setScenario({ ...scenario, title: e.target.value })} />
        <textarea data-testid="fin13-scenario-premises" required minLength={10} maxLength={2000} placeholder="Premissas do cenário" value={scenario.premises} onChange={e => setScenario({ ...scenario, premises: e.target.value })} />
        <input data-testid="fin13-scenario-revenue" type="number" min="0" placeholder="Receita projetada em centavos" value={scenario.projected_revenue_cents} onChange={e => setScenario({ ...scenario, projected_revenue_cents: e.target.value })} />
        <input data-testid="fin13-scenario-cost" type="number" min="0" placeholder="Custo projetado em centavos" value={scenario.projected_cost_cents} onChange={e => setScenario({ ...scenario, projected_cost_cents: e.target.value })} />
        <input data-testid="fin13-scenario-margin" type="number" min="-100" max="100" step="0.01" placeholder="Margem projetada % (-100 a 100)" value={scenario.projected_margin_percent} onChange={e => setScenario({ ...scenario, projected_margin_percent: e.target.value })} />
        <button data-testid="fin13-scenario-create">Criar cenário</button>
      </form>

      {msg && <p role="status" data-testid="fin13-notice">{msg}</p>}

      <h3>Orçamentos recentes</h3>
      <ul data-testid="fin13-budget-list">
        {budgets.length === 0 ? <li>Nenhum orçamento encontrado.</li> : budgets.map(budget => (
          <li data-testid={`fin13-budget-row-${budget.id}`} key={budget.id}>
            {budget.protocol} · {budget.title} · {budget.status} · estimativa:{String(budget.is_estimate)} · premissas registradas · {budget.estimate_note}
          </li>
        ))}
      </ul>

      <h3>Cenários recentes</h3>
      <ul data-testid="fin13-scenario-list">
        {scenarios.length === 0 ? <li>Nenhum cenário encontrado.</li> : scenarios.map(item => (
          <li data-testid={`fin13-scenario-row-${item.id}`} key={item.id}>
            {item.scenario_type} · {item.title} · estimativa:{String(item.is_estimate)} · {item.estimate_note}
          </li>
        ))}
      </ul>
    </section>
  );
}
