"use client";

import { useEffect, useState } from "react";

type Budget = {
  id: string;
  protocol: string;
  title: string;
  premises: string;
  period_start: string;
  period_end: string;
  total_margin_cents: string | number | null;
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
  projected_margin_cents: string | number | null;
  projected_margin_percent: string | number | null;
  is_estimate: boolean;
};

const money = (value: string | number | null) => value == null ? "Dado ausente" : `R$ ${(Number(value) / 100).toFixed(2).replace(".", ",")}`;

// FIN-13 no espaço de TI é somente consulta. Criação, revisão, aprovação e
// arquivamento acontecem exclusivamente em /admin/financeiro.
export default function FinBudgetClient() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/fin/budgets").then((response) => response.json()),
      fetch("/api/fin/budget-scenarios").then((response) => response.json()),
    ]).then(([budgetData, scenarioData]) => {
      if (!active) return;
      if (budgetData?.error || scenarioData?.error) {
        setMessage("A consulta de FIN-13 exige sessão financeira, admin ou TI.");
        return;
      }
      setBudgets(budgetData.budgets || []);
      setScenarios(scenarioData.scenarios || []);
    }).catch(() => { if (active) setMessage("Consulta de FIN-13 indisponível."); });
    return () => { active = false; };
  }, []);

  return (
    <section data-testid="ti-fin13-readonly" style={{ marginTop: 24, padding: 16, border: "1px solid #cbd5e1", borderRadius: 8 }}>
      <h2>FIN-13 · Orçamentos (somente leitura em TI)</h2>
      <p role="note">TI pode consultar o protocolo, status, premissas e cenários. Nenhuma ação de criação, revisão ou aprovação é disponibilizada aqui; use o workspace financeiro.</p>
      {message && <p role="alert">{message}</p>}
      {budgets.length === 0 && !message && <p>Nenhum orçamento disponível para consulta.</p>}
      <ul>
        {budgets.map((budget) => (
          <li key={budget.id}>
            <strong>{budget.protocol}</strong> · {budget.title} · status: {budget.status} · margem: {money(budget.total_margin_cents)} · estimativa: {String(budget.is_estimate)}
            <br /><small>Premissas: {budget.premises} · aviso: {budget.estimate_note}</small>
            <ul>{scenarios.filter((scenario) => scenario.budget_id === budget.id).map((scenario) => <li key={scenario.id}>{scenario.scenario_type}: {scenario.title} · margem {money(scenario.projected_margin_cents)} ({scenario.projected_margin_percent ?? "Dado ausente"}%) · estimativa: {String(scenario.is_estimate)}</li>)}</ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
