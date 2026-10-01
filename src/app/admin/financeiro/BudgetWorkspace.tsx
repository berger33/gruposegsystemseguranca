"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Budget = {
  id: string;
  protocol: string;
  title: string;
  description: string;
  premises: string;
  period_start: string;
  period_end: string;
  total_revenue_cents: string | number | null;
  total_cost_cents: string | number | null;
  total_margin_cents: string | number | null;
  status: "rascunho" | "em_revisao" | "aprovado" | "rejeitado" | "arquivado";
  is_estimate: boolean;
  estimate_note: string;
  approved_by_identity: string | null;
  approved_at: string | null;
};

type Scenario = {
  id: string;
  budget_id: string;
  scenario_type: "conservador" | "base" | "otimista" | "expansao" | "pessimista";
  title: string;
  premises: string;
  projected_revenue_cents: string | number | null;
  projected_cost_cents: string | number | null;
  projected_margin_cents: string | number | null;
  projected_margin_percent: string | number | null;
  projected_margin_percent_calculated: string | number | null;
  is_estimate: boolean;
  estimate_note: string;
};

type BudgetHistory = {
  id: string;
  budget_id: string;
  revision_no: number;
  event_type: string;
  previous_status: string | null;
  next_status: string;
  reason: string;
  changed_by_identity: string | null;
  created_at: string;
};

type ListResponse<T> = { budgets?: T[]; scenarios?: T[]; history?: T[] };

const money = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return "Dado ausente";
  return `R$ ${(Number(value) / 100).toFixed(2).replace(".", ",")}`;
};
const dateLabel = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("pt-BR") : "—";
const warning = "Premissas explícitas e estimativas identificadas; não prometer resultado.";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Não foi possível concluir a operação.");
  return body as T;
}

const statusLabel: Record<Budget["status"], string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  arquivado: "Arquivado",
};

export default function BudgetWorkspace() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [history, setHistory] = useState<BudgetHistory[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [premises, setPremises] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [revenue, setRevenue] = useState("");
  const [cost, setCost] = useState("");
  const [scenarioType, setScenarioType] = useState<Scenario["scenario_type"]>("base");
  const [scenarioTitle, setScenarioTitle] = useState("");
  const [scenarioPremises, setScenarioPremises] = useState("");
  const [scenarioRevenue, setScenarioRevenue] = useState("");
  const [scenarioCost, setScenarioCost] = useState("");
  const [reason, setReason] = useState("");

  const selectedBudget = useMemo(
    () => budgets.find((budget) => budget.id === selectedBudgetId) || null,
    [budgets, selectedBudgetId],
  );
  const selectedScenarios = useMemo(
    () => scenarios.filter((scenario) => scenario.budget_id === selectedBudgetId),
    [scenarios, selectedBudgetId],
  );

  const load = async (budgetId = selectedBudgetId) => {
    setBusy(true);
    setError("");
    try {
      const [budgetData, scenarioData] = await Promise.all([
        api<ListResponse<Budget>>("/api/fin/budgets"),
        api<ListResponse<Scenario>>(budgetId ? `/api/fin/budget-scenarios?budget_id=${encodeURIComponent(budgetId)}` : "/api/fin/budget-scenarios"),
      ]);
      const nextBudgets = budgetData.budgets || [];
      setBudgets(nextBudgets);
      setScenarios(scenarioData.scenarios || []);
      const nextId = budgetId && nextBudgets.some((budget) => budget.id === budgetId)
        ? budgetId
        : nextBudgets[0]?.id || "";
      setSelectedBudgetId(nextId);
      if (nextId) {
        const historyData = await api<ListResponse<BudgetHistory>>(`/api/fin/budget-history?budget_id=${encodeURIComponent(nextId)}`);
        setHistory(historyData.history || []);
      } else setHistory([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os orçamentos.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void load(""); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try { await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível concluir a operação."); }
    finally { setBusy(false); }
  };

  const createBudget = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const data = await api<{ budget: Budget }>("/api/fin/budgets", {
        method: "POST",
        body: JSON.stringify({
          title, description, premises, period_start: periodStart, period_end: periodEnd,
          total_revenue_cents: revenue ? Number(revenue) : null,
          total_cost_cents: cost ? Number(cost) : null,
        }),
      });
      setTitle(""); setDescription(""); setPremises(""); setRevenue(""); setCost("");
      setNotice(`${data.budget.protocol} criado como estimativa. ${warning}`);
      await load(data.budget.id);
    });
  };

  const changeStatus = async (status: Budget["status"]) => {
    if (!selectedBudget) return;
    await run(async () => {
      const data = await api<{ budget: Budget }>("/api/fin/budgets", {
        method: "PATCH",
        body: JSON.stringify({ id: selectedBudget.id, status, reason }),
      });
      setReason("");
      setNotice(`${data.budget.protocol}: ${statusLabel[status]}. A alteração foi registrada no histórico imutável.`);
      await load(data.budget.id);
    });
  };

  const createScenario = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedBudget) return;
    await run(async () => {
      const data = await api<{ scenario: Scenario }>("/api/fin/budget-scenarios", {
        method: "POST",
        body: JSON.stringify({
          budget_id: selectedBudget.id, scenario_type: scenarioType, title: scenarioTitle,
          premises: scenarioPremises,
          projected_revenue_cents: scenarioRevenue ? Number(scenarioRevenue) : null,
          projected_cost_cents: scenarioCost ? Number(scenarioCost) : null,
        }),
      });
      setScenarioTitle(""); setScenarioPremises(""); setScenarioRevenue(""); setScenarioCost("");
      setNotice(`Cenário ${data.scenario.scenario_type} criado com margem projetada calculada. ${warning}`);
      await load(selectedBudget.id);
    });
  };

  const selectBudget = async (id: string) => {
    setSelectedBudgetId(id);
    try {
      const data = await api<ListResponse<BudgetHistory>>(`/api/fin/budget-history?budget_id=${encodeURIComponent(id)}`);
      setHistory(data.history || []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o histórico.");
    }
  };

  return (
    <section data-testid="fin13-budget-workspace" style={{ display: "grid", gap: 20 }}>
      <header style={{ borderBottom: "1px solid #d7dee8", paddingBottom: 16 }}>
        <p style={{ margin: 0, color: "#476581", fontWeight: 700, letterSpacing: ".04em" }}>FIN-13 · PLANEJAMENTO GERENCIAL</p>
        <h2 style={{ margin: "6px 0" }}>Orçamento e cenários de expansão</h2>
        <p style={{ margin: 0, maxWidth: 800, color: "#526273" }}>
          Registre premissas, compare cenários e acompanhe margem projetada. Todos os valores abaixo são estimativas; não constituem promessa de resultado.
        </p>
      </header>

      {error && <p role="alert" data-testid="fin13-error" style={{ background: "#fff1f2", color: "#9f1239", padding: 12, borderRadius: 6 }}>{error}</p>}
      {notice && <p role="status" data-testid="fin13-notice" style={{ background: "#ecfdf5", color: "#166534", padding: 12, borderRadius: 6 }}>{notice}</p>}
      {busy && <p data-testid="fin13-loading" style={{ color: "#526273" }}>Atualizando orçamento…</p>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.1fr) minmax(320px, .9fr)", gap: 20, alignItems: "start" }}>
        <form onSubmit={createBudget} data-testid="fin13-budget-form" style={{ display: "grid", gap: 10, padding: 18, border: "1px solid #d7dee8", borderRadius: 10, background: "#f8fafc" }}>
          <h3 style={{ margin: 0 }}>Novo orçamento</h3>
          <label>Título<input required minLength={5} maxLength={200} data-testid="fin13-budget-title" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>Descrição<textarea required minLength={10} maxLength={2000} data-testid="fin13-budget-description" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label>Premissas explícitas<textarea required minLength={10} maxLength={2000} data-testid="fin13-budget-premises" placeholder="Ex.: volume, preço, equipe, prazo e custos assumidos…" value={premises} onChange={(event) => setPremises(event.target.value)} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label>Início<input required type="date" data-testid="fin13-budget-period-start" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
            <label>Fim<input required type="date" data-testid="fin13-budget-period-end" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
            <label>Receita (centavos)<input type="number" min="0" data-testid="fin13-budget-revenue" value={revenue} onChange={(event) => setRevenue(event.target.value)} /></label>
            <label>Custo (centavos)<input type="number" min="0" data-testid="fin13-budget-cost" value={cost} onChange={(event) => setCost(event.target.value)} /></label>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "#526273" }}><strong>Aviso obrigatório:</strong> {warning}</p>
          <button type="submit" data-testid="fin13-budget-create" disabled={busy}>Criar orçamento estimado</button>
        </form>

        <section aria-labelledby="fin13-list-heading" style={{ display: "grid", gap: 10 }}>
          <h3 id="fin13-list-heading" style={{ margin: 0 }}>Orçamentos registrados</h3>
          {budgets.length === 0 && <p data-testid="fin13-budget-empty" style={{ color: "#526273" }}>Nenhum orçamento registrado.</p>}
          {budgets.map((budget) => (
            <button type="button" key={budget.id} data-testid={`fin13-budget-${budget.id}`} onClick={() => void selectBudget(budget.id)} style={{ textAlign: "left", padding: 14, border: budget.id === selectedBudgetId ? "2px solid #245c8d" : "1px solid #d7dee8", borderRadius: 8, background: "white", cursor: "pointer" }}>
              <strong>{budget.protocol}</strong> · {statusLabel[budget.status]}
              <br /><span>{budget.title}</span>
              <br /><small>{dateLabel(budget.period_start)} a {dateLabel(budget.period_end)} · margem {money(budget.total_margin_cents)} · estimativa: {String(budget.is_estimate)}</small>
            </button>
          ))}
        </section>
      </div>

      {selectedBudget && <section style={{ display: "grid", gap: 16, padding: 18, border: "1px solid #d7dee8", borderRadius: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div><h3 style={{ margin: 0 }}>{selectedBudget.protocol} · {selectedBudget.title}</h3><p style={{ margin: "5px 0", color: "#526273" }}>Status: <strong>{statusLabel[selectedBudget.status]}</strong> · {warning}</p></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {selectedBudget.status === "rascunho" && <button type="button" data-testid={`fin13-budget-review-${selectedBudget.id}`} onClick={() => void changeStatus("em_revisao")}>Enviar para revisão</button>}
            {selectedBudget.status === "em_revisao" && <><button type="button" data-testid={`fin13-budget-approve-${selectedBudget.id}`} onClick={() => void changeStatus("aprovado")}>Aprovar com auditoria</button><button type="button" data-testid={`fin13-budget-reject-${selectedBudget.id}`} onClick={() => void changeStatus("rejeitado")}>Rejeitar</button><button type="button" data-testid={`fin13-budget-archive-${selectedBudget.id}`} onClick={() => void changeStatus("arquivado")}>Arquivar</button></>}
            {(["aprovado", "rejeitado"] as Budget["status"][]).includes(selectedBudget.status) && <button type="button" data-testid={`fin13-budget-archive-${selectedBudget.id}`} onClick={() => void changeStatus("arquivado")}>Arquivar</button>}
          </div>
        </div>
        {(selectedBudget.status === "rascunho" || selectedBudget.status === "em_revisao") && <label>Motivo da transição (mínimo 10 caracteres)<input data-testid="fin13-budget-reason" minLength={10} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: revisão das premissas do período" /></label>}

        <form onSubmit={createScenario} style={{ display: "grid", gap: 10, paddingTop: 12, borderTop: "1px solid #e5e7eb" }}>
          <h4 style={{ margin: 0 }}>Cenários vinculados e margem projetada</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
            <select data-testid="fin13-scenario-type" value={scenarioType} onChange={(event) => setScenarioType(event.target.value as Scenario["scenario_type"])} disabled={selectedBudget.status !== "rascunho" && selectedBudget.status !== "em_revisao"}><option value="conservador">Conservador</option><option value="base">Base</option><option value="otimista">Otimista</option><option value="expansao">Expansão</option><option value="pessimista">Pessimista</option></select>
            <input required minLength={5} maxLength={200} data-testid="fin13-scenario-title" placeholder="Título do cenário" value={scenarioTitle} onChange={(event) => setScenarioTitle(event.target.value)} disabled={selectedBudget.status !== "rascunho" && selectedBudget.status !== "em_revisao"} />
            <input type="number" min="0" data-testid="fin13-scenario-revenue" placeholder="Receita projetada (centavos)" value={scenarioRevenue} onChange={(event) => setScenarioRevenue(event.target.value)} disabled={selectedBudget.status !== "rascunho" && selectedBudget.status !== "em_revisao"} />
            <input type="number" min="0" data-testid="fin13-scenario-cost" placeholder="Custo projetado (centavos)" value={scenarioCost} onChange={(event) => setScenarioCost(event.target.value)} disabled={selectedBudget.status !== "rascunho" && selectedBudget.status !== "em_revisao"} />
          </div>
          <textarea required minLength={10} maxLength={2000} data-testid="fin13-scenario-premises" placeholder="Premissas explícitas deste cenário" value={scenarioPremises} onChange={(event) => setScenarioPremises(event.target.value)} disabled={selectedBudget.status !== "rascunho" && selectedBudget.status !== "em_revisao"} />
          <button type="submit" data-testid="fin13-scenario-create" disabled={busy || (selectedBudget.status !== "rascunho" && selectedBudget.status !== "em_revisao")}>Adicionar cenário estimado</button>
        </form>

        <div style={{ overflowX: "auto" }}><table data-testid="fin13-scenarios-table"><thead><tr><th>Tipo</th><th>Receita</th><th>Custo</th><th>Margem</th><th>Margem % calculada</th><th>Premissas</th></tr></thead><tbody>{selectedScenarios.length === 0 ? <tr><td colSpan={6}>Nenhum cenário vinculado.</td></tr> : selectedScenarios.map((scenario) => <tr key={scenario.id}><td>{scenario.scenario_type}</td><td>{money(scenario.projected_revenue_cents)}</td><td>{money(scenario.projected_cost_cents)}</td><td>{money(scenario.projected_margin_cents)}</td><td>{scenario.projected_margin_percent == null ? "Dado ausente" : `${scenario.projected_margin_percent}%`}</td><td>{scenario.premises}</td></tr>)}</tbody></table></div>

        <details open><summary>Histórico imutável de revisões e aprovações ({history.length})</summary><ul data-testid="fin13-budget-history">{history.length === 0 ? <li>Nenhuma revisão registrada.</li> : history.map((item) => <li key={item.id}>#{item.revision_no} · {item.event_type} · {item.previous_status || "—"} → {item.next_status} · {item.reason} · {dateLabel(item.created_at)}</li>)}</ul></details>
      </section>}
    </section>
  );
}
