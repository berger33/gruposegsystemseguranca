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
  total_revenue_cents: number | string | null;
  total_cost_cents: number | string | null;
  total_margin_cents: number | string | null;
  status: string;
  budget_version: number;
  idempotency_key: string | null;
  is_estimate: boolean;
  estimate_note: string;
  approved_by_identity: string | null;
  approved_at: string | null;
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
  projected_margin_status: string | null;
  projected_margin_reason: string | null;
  is_estimate: boolean;
  estimate_note: string;
};

type HistoryRow = {
  id: string;
  event_type: string | null;
  previous_status: string | null;
  next_status: string;
  changed_by_identity: string | null;
  changed_at: string;
  reason: string;
  version_before: number | null;
  version_after: number | null;
  previous_snapshot: Record<string, unknown> | null;
  next_snapshot: Record<string, unknown> | null;
};

const SCENARIOS = ["conservador", "base", "otimista", "expansao", "pessimista"];
const money = (value: number | string | null | undefined) =>
  value == null ? "Dado ausente" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) / 100);

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return data;
}

const newKey = () => `fin13-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

export default function BudgetWorkspace() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState("");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [revision, setRevision] = useState({ premises: "", revenue: "", cost: "" });
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
  });

  const selectedBudget = useMemo(
    () => budgets.find(item => item.id === selectedBudgetId) || null,
    [budgets, selectedBudgetId],
  );

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [budgetData, scenarioData] = await Promise.all([
        api("/api/fin/budgets"),
        api("/api/fin/budget-scenarios"),
      ]);
      setBudgets(budgetData.budgets || []);
      setScenarios(scenarioData.scenarios || []);
      setSelectedBudgetId(current => current || budgetData.budgets?.[0]?.id || "");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(cause => setError(cause instanceof Error ? cause.message : "Falha ao carregar orçamentos"));
  }, []);

  const runMutation = async (operation: () => Promise<string>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const notice = await operation();
      await load();
      setMessage(notice);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha na operação financeira");
    } finally {
      setBusy(false);
    }
  };

  const submitBudget = async (event: FormEvent) => {
    event.preventDefault();
    await runMutation(async () => {
      const data = await api("/api/fin/budgets", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          idempotency_key: newKey(),
          total_revenue_cents: form.total_revenue_cents === "" ? null : Number(form.total_revenue_cents),
          total_cost_cents: form.total_cost_cents === "" ? null : Number(form.total_cost_cents),
        }),
      });
      setForm({ title: "", description: "", premises: "", period_start: "", period_end: "", total_revenue_cents: "", total_cost_cents: "" });
      setSelectedBudgetId(data.budget.id);
      setScenario(current => ({ ...current, budget_id: data.budget.id }));
      return data.replayed ? "Retry idempotente: o orçamento já existia." : `Orçamento ${data.budget.protocol} persistido como estimativa.`;
    });
  };

  const submitScenario = async (event: FormEvent) => {
    event.preventDefault();
    await runMutation(async () => {
      const data = await api("/api/fin/budget-scenarios", {
        method: "POST",
        body: JSON.stringify({
          ...scenario,
          projected_revenue_cents: scenario.projected_revenue_cents === "" ? null : Number(scenario.projected_revenue_cents),
          projected_cost_cents: scenario.projected_cost_cents === "" ? null : Number(scenario.projected_cost_cents),
        }),
      });
      setScenario(current => ({ ...current, scenario_type: "base", title: "", premises: "", projected_revenue_cents: "", projected_cost_cents: "" }));
      return `Cenário ${data.scenario.scenario_type} persistido; margem calculada no servidor.`;
    });
  };

  const changeStatus = (status: string) => runMutation(async () => {
    if (!selectedBudget) throw new Error("Selecione um orçamento por nome ou protocolo");
    const data = await api("/api/fin/budgets", { method: "PATCH", body: JSON.stringify({ id: selectedBudget.id, status, reason }) });
    setReason("");
    return `Orçamento ${data.budget.protocol} agora está em ${data.budget.status}.`;
  });

  const reviseBudget = () => runMutation(async () => {
    if (!selectedBudget) throw new Error("Selecione um orçamento aprovado por nome ou protocolo");
    if (!reason.trim()) throw new Error("Informe o motivo da revisão");
    const data = await api("/api/fin/budgets", {
      method: "PATCH",
      body: JSON.stringify({
        id: selectedBudget.id,
        revision: true,
        reason,
        premises: revision.premises || selectedBudget.premises,
        total_revenue_cents: revision.revenue === "" ? selectedBudget.total_revenue_cents : Number(revision.revenue),
        total_cost_cents: revision.cost === "" ? selectedBudget.total_cost_cents : Number(revision.cost),
      }),
    });
    setReason("");
    setRevision({ premises: "", revenue: "", cost: "" });
    return `Revisão ${data.budget.protocol} persistida na versão ${data.budget.budget_version}; nova aprovação necessária.`;
  });

  const loadHistory = async () => {
    if (!selectedBudgetId) return;
    setHistoryError("");
    try {
      const data = await api(`/api/fin/budget-history?budget_id=${encodeURIComponent(selectedBudgetId)}`);
      setHistory(data.history || []);
    } catch (cause) {
      setHistoryError(cause instanceof Error ? cause.message : "Falha ao carregar histórico");
      setHistory([]);
    }
  };

  return (
    <section data-testid="finance-budget-workspace">
      <h2>Orçamento gerencial e cenários</h2>
      <p data-testid="fin13-disclaimer">
        <strong>Premissas explícitas obrigatórias:</strong> estimativas gerenciais em reais, com margem calculada no servidor; não prometemos resultado financeiro.
      </p>
      {loading && <p data-testid="fin13-loading">Carregando orçamentos...</p>}
      {error && <p role="alert" data-testid="fin13-error">Não foi possível carregar ou salvar os dados: {error}</p>}
      {message && <p role="status" data-testid="fin13-notice">{message}</p>}

      <form data-testid="fin13-budget-form" onSubmit={submitBudget} style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <h3>Criar orçamento ORC-FIN</h3>
        <input data-testid="fin13-budget-title" required minLength={5} maxLength={200} placeholder="Título" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        <input data-testid="fin13-budget-description" required minLength={10} maxLength={2000} placeholder="Descrição" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        <textarea data-testid="fin13-budget-premises" required minLength={10} maxLength={2000} placeholder="Premissas e riscos" value={form.premises} onChange={e => setForm({ ...form, premises: e.target.value })} />
        <label>Início <input data-testid="fin13-budget-start" required type="date" value={form.period_start} onChange={e => setForm({ ...form, period_start: e.target.value })} /></label>
        <label>Fim <input data-testid="fin13-budget-end" required type="date" value={form.period_end} onChange={e => setForm({ ...form, period_end: e.target.value })} /></label>
        <label>Receita estimada (centavos de BRL) <input data-testid="fin13-budget-revenue" type="number" min="0" placeholder="Ex.: 410000 = R$ 4.100,00" value={form.total_revenue_cents} onChange={e => setForm({ ...form, total_revenue_cents: e.target.value })} /></label>
        <label>Custo estimado (centavos de BRL) <input data-testid="fin13-budget-cost" type="number" min="0" placeholder="Ex.: 270000 = R$ 2.700,00" value={form.total_cost_cents} onChange={e => setForm({ ...form, total_cost_cents: e.target.value })} /></label>
        <button data-testid="fin13-budget-create" disabled={busy}>Criar estimativa</button>
      </form>

      <section aria-labelledby="fin13-actions-title" style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <h3 id="fin13-actions-title">Revisar, aprovar e consultar histórico</h3>
        <label>Orçamento por nome/protocolo
          <select data-testid="fin13-budget-select" value={selectedBudgetId} onChange={e => { setSelectedBudgetId(e.target.value); setScenario(current => ({ ...current, budget_id: e.target.value })); setHistory([]); }}>
            <option value="">Selecione um orçamento</option>
            {budgets.map(item => <option key={item.id} value={item.id}>{item.title} · {item.protocol} · {item.status}</option>)}
          </select>
        </label>
        {selectedBudget && <p data-testid="fin13-selected-budget">{selectedBudget.protocol} · versão {selectedBudget.budget_version} · {money(selectedBudget.total_revenue_cents)} de receita · {money(selectedBudget.total_cost_cents)} de custo · status {selectedBudget.status}</p>}
        <label>Motivo da ação <textarea data-testid="fin13-action-reason" minLength={10} value={reason} onChange={e => setReason(e.target.value)} placeholder="Motivo (mínimo de 10 caracteres)" /></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {selectedBudget?.status === "rascunho" && <button type="button" data-testid="fin13-send-review" disabled={busy} onClick={() => changeStatus("em_revisao")}>Enviar para revisão</button>}
          {selectedBudget?.status === "em_revisao" && <button type="button" data-testid="fin13-approve" disabled={busy || reason.trim().length < 10} onClick={() => changeStatus("aprovado")}>Aprovar nova versão</button>}
          {selectedBudget?.status === "aprovado" && <button type="button" data-testid="fin13-archive" disabled={busy || reason.trim().length < 10} onClick={() => changeStatus("arquivado")}>Arquivar</button>}
          {selectedBudget?.status === "aprovado" && <button type="button" data-testid="fin13-revise" disabled={busy || reason.trim().length < 10} onClick={reviseBudget}>Criar revisão explícita</button>}
          <button type="button" data-testid="fin13-history-load" disabled={!selectedBudgetId} onClick={loadHistory}>Ver histórico imutável</button>
        </div>
        {selectedBudget?.status === "aprovado" && <div style={{ display: "grid", gap: 8 }}>
          <label>Premissa revisada <textarea data-testid="fin13-revision-premises" value={revision.premises} onChange={e => setRevision({ ...revision, premises: e.target.value })} placeholder="Deixe vazio para manter a premissa" /></label>
          <label>Nova receita (centavos BRL) <input data-testid="fin13-revision-revenue" type="number" min="0" value={revision.revenue} onChange={e => setRevision({ ...revision, revenue: e.target.value })} /></label>
          <label>Novo custo (centavos BRL) <input data-testid="fin13-revision-cost" type="number" min="0" value={revision.cost} onChange={e => setRevision({ ...revision, cost: e.target.value })} /></label>
        </div>}
        {historyError && <p role="alert" data-testid="fin13-history-error">Falha ao ler o histórico: {historyError}</p>}
        {history.length > 0 && <ol data-testid="fin13-history-list">{history.map(item => <li key={item.id}>{item.event_type || "histórico anterior"} · versão {item.version_after || "-"} · {item.changed_at} · {item.reason} · ator {item.changed_by_identity || "não informado no legado"}</li>)}</ol>}
      </section>

      <form data-testid="fin13-scenario-form" onSubmit={submitScenario} style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <h3>Criar cenário permitido</h3>
        <select data-testid="fin13-scenario-budget" required value={scenario.budget_id} onChange={e => setScenario({ ...scenario, budget_id: e.target.value })}>
          <option value="">Selecione um orçamento</option>
          {budgets.map(item => <option key={item.id} value={item.id}>{item.title} · {item.protocol}</option>)}
        </select>
        <select data-testid="fin13-scenario-type" value={scenario.scenario_type} onChange={e => setScenario({ ...scenario, scenario_type: e.target.value })}>
          {SCENARIOS.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <input data-testid="fin13-scenario-title" required minLength={5} maxLength={200} placeholder="Título do cenário" value={scenario.title} onChange={e => setScenario({ ...scenario, title: e.target.value })} />
        <textarea data-testid="fin13-scenario-premises" required minLength={10} maxLength={2000} placeholder="Premissas do cenário" value={scenario.premises} onChange={e => setScenario({ ...scenario, premises: e.target.value })} />
        <label>Receita projetada (centavos de BRL) <input data-testid="fin13-scenario-revenue" type="number" min="0" placeholder="Pode ficar vazio se incompleta" value={scenario.projected_revenue_cents} onChange={e => setScenario({ ...scenario, projected_revenue_cents: e.target.value })} /></label>
        <label>Custo projetado (centavos de BRL) <input data-testid="fin13-scenario-cost" type="number" min="0" placeholder="Pode ficar vazio se incompleta" value={scenario.projected_cost_cents} onChange={e => setScenario({ ...scenario, projected_cost_cents: e.target.value })} /></label>
        <p>O percentual não é digitado: o servidor calcula receita menos custo dividido pela receita. Receita zero ou base incompleta aparece sem percentual.</p>
        <button data-testid="fin13-scenario-create" disabled={busy}>Criar cenário</button>
      </form>

      <h3>Orçamentos recentes</h3>
      <div style={{ overflowX: "auto" }}><table data-testid="fin13-budget-list"><thead><tr><th>Nome / protocolo</th><th>Período</th><th>Receita</th><th>Custo</th><th>Margem</th><th>Status</th><th>Versão</th></tr></thead><tbody>
        {error ? <tr><td colSpan={7}>Dados de orçamento indisponíveis; corrija o erro acima.</td></tr> : budgets.length === 0 ? <tr><td colSpan={7}>Nenhum orçamento encontrado.</td></tr> : budgets.map(item => <tr data-testid={`fin13-budget-row-${item.id}`} key={item.id}>
          <td>{item.title}<br /><small>{item.protocol}</small></td><td>{item.period_start} a {item.period_end}</td><td>{money(item.total_revenue_cents)}</td><td>{money(item.total_cost_cents)}</td><td>{item.total_margin_cents == null ? "Incompleta" : money(item.total_margin_cents)}</td><td>{item.status}</td><td>{item.budget_version}</td>
        </tr>)}
      </tbody></table></div>

      <h3>Cenários recentes</h3>
      <div style={{ overflowX: "auto" }}><table data-testid="fin13-scenario-list"><thead><tr><th>Tipo / nome</th><th>Receita</th><th>Custo</th><th>Margem do servidor</th><th>Estado</th></tr></thead><tbody>
        {error ? <tr><td colSpan={5}>Dados de cenário indisponíveis; corrija o erro acima.</td></tr> : scenarios.length === 0 ? <tr><td colSpan={5}>Nenhum cenário encontrado.</td></tr> : scenarios.map(item => <tr data-testid={`fin13-scenario-row-${item.id}`} key={item.id}>
          <td>{item.scenario_type} · {item.title}</td><td>{money(item.projected_revenue_cents)}</td><td>{money(item.projected_cost_cents)}</td><td>{item.projected_margin_status === "calculada" ? `${item.projected_margin_percent}%` : `${item.projected_margin_status || "não verificada"} · ${item.projected_margin_reason || "sem percentual"}`}</td><td>{item.is_estimate ? "estimativa" : "não classificado"}</td>
        </tr>)}
      </tbody></table></div>
    </section>
  );
}
