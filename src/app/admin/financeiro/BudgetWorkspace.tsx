"use client";

// FIN-13 — orçamento gerencial e cenários de expansão.
//
// Regras da interface, alinhadas ao servidor:
//  * falha de leitura aparece como erro com nova tentativa; indisponibilidade
//    NUNCA é apresentada como "nenhum registro encontrado";
//  * a seleção é feita por nome ou protocolo, não por UUID digitado;
//  * valores são exibidos em moeda (R$), com entrada explícita em centavos;
//  * o percentual de margem não é editável: a tela só mostra o cálculo que o
//    servidor fará a partir de receita e custo;
//  * orçamento aprovado só muda por revisão explícita, com motivo, e volta a
//    exigir nova aprovação;
//  * a confirmação só aparece depois que o servidor persistiu a operação.

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import UiState from "../../../components/ui/UiState";
import { describeFinError, finErrorFootnote } from "../../../lib/fin-vocabulary.mjs";
import type { FinErrorDescriptor } from "../../../lib/fin-vocabulary.mjs";

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
  total_margin_percent: number | string | null;
  margin_basis: string | null;
  status: string;
  version: number | string;
  is_estimate: boolean;
  estimate_note: string;
  approved_at: string | null;
  revision_reason: string | null;
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
  computed_margin_percent: number | string | null;
  margin_basis: string | null;
  margin_source: string | null;
  is_estimate: boolean;
  estimate_note: string;
};

type HistoryEntry = {
  id: string;
  budget_id: string;
  event_type: string | null;
  previous_status: string | null;
  next_status: string;
  version_before: number | string | null;
  version_after: number | string | null;
  changed_by_identity: string | null;
  changed_at: string;
  reason: string;
};

const SCENARIOS = ["conservador", "base", "otimista", "expansao", "pessimista"];

const brl = (value: number | string | null | undefined) =>
  value === null || value === undefined || value === ""
    ? "valor não informado"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) / 100);

const percent = (value: number | string | null | undefined) =>
  value === null || value === undefined || value === "" ? null : `${Number(value).toFixed(2).replace(".", ",")} %`;

const MARGIN_BASIS_LABEL: Record<string, string> = {
  calculada: "calculada a partir de receita e custo",
  receita_zero_sem_percentual: "receita zero: percentual não é aplicável (valor ausente, não 0%)",
  dados_incompletos: "base insuficiente: falta receita ou custo (valores conhecidos preservados)",
};

// UX-07B: o erro carrega código e status, e é descrito pelo vocabulário da
// família. O código canônico continua visível — no rodapé, entre parênteses.
async function api(path: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
  } catch {
    throw describeFinError(null, 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw describeFinError(typeof data?.error === "string" ? data.error : null, response.status);
  return data;
}
function finFailure(cause: unknown): FinErrorDescriptor {
  return cause && typeof cause === "object" && typeof (cause as FinErrorDescriptor).kind === "string"
    ? (cause as FinErrorDescriptor)
    : describeFinError(null, 0);
}
/** Frase de leitura indisponível, sem transformar falha em ausência. */
function leituraFalhou(o_que: string, cause: unknown): string {
  const d = finFailure(cause);
  return `Não foi possível ler ${o_que}. ${d.title}: ${d.detail} ${finErrorFootnote(d)}`;
}

export default function BudgetWorkspace() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [budgetsError, setBudgetsError] = useState("");
  const [scenariosError, setScenariosError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [revision, setRevision] = useState({ revision_reason: "", total_revenue_cents: "", total_cost_cents: "", premises: "" });
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
    scenario_type: "base",
    title: "",
    premises: "",
    projected_revenue_cents: "",
    projected_cost_cents: "",
  });

  // Leitura: cada coleção guarda seu próprio erro. Um erro de rede/servidor
  // não zera a coleção já carregada nem vira lista vazia.
  const loadBudgets = useCallback(async () => {
    try {
      const data = await api("/api/fin/budgets");
      setBudgets(data.budgets || []);
      setBudgetsError("");
      return true;
    } catch (error) {
      setBudgetsError(`${leituraFalhou("os orçamentos", error)} A lista abaixo pode estar incompleta — isto NÃO significa que não existam orçamentos.`);
      return false;
    }
  }, []);

  const loadScenarios = useCallback(async () => {
    try {
      const data = await api("/api/fin/budget-scenarios");
      setScenarios(data.scenarios || []);
      setScenariosError("");
    } catch (error) {
      setScenariosError(leituraFalhou("os cenários", error));
    }
  }, []);

  const loadHistory = useCallback(async (budgetId: string) => {
    if (!budgetId) return;
    try {
      const data = await api(`/api/fin/budget-history?budget_id=${encodeURIComponent(budgetId)}`);
      setHistory(data.history || []);
      setHistoryError("");
    } catch (error) {
      setHistoryError(leituraFalhou("o histórico", error));
    }
  }, []);

  const load = useCallback(async () => {
    await Promise.all([loadBudgets(), loadScenarios()]);
  }, [loadBudgets, loadScenarios]);

  useEffect(() => { load(); }, [load]);

  const visibleBudgets = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return budgets;
    return budgets.filter(item => `${item.protocol} ${item.title}`.toLowerCase().includes(term));
  }, [budgets, search]);

  const selected = useMemo(() => budgets.find(item => item.id === selectedId) || null, [budgets, selectedId]);
  const selectedScenarios = useMemo(() => scenarios.filter(item => item.budget_id === selectedId), [scenarios, selectedId]);

  const scenarioMarginPreview = useMemo(() => {
    const revenue = scenario.projected_revenue_cents === "" ? null : Number(scenario.projected_revenue_cents);
    const cost = scenario.projected_cost_cents === "" ? null : Number(scenario.projected_cost_cents);
    if (revenue === null || cost === null || Number.isNaN(revenue) || Number.isNaN(cost)) {
      return "margem sem percentual: informe receita e custo (o servidor calcula)";
    }
    if (revenue === 0) return "receita zero: percentual não é aplicável (o servidor registra o motivo)";
    return `${(((revenue - cost) * 100) / revenue).toFixed(2).replace(".", ",")} % (calculado pelo servidor a partir de receita e custo)`;
  }, [scenario.projected_revenue_cents, scenario.projected_cost_cents]);

  const submitBudget = async (event: FormEvent) => {
    event.preventDefault();
    setMsg("");
    setBusy(true);
    try {
      // Chave de idempotência gerada no cliente: reenvio ou duplo clique não
      // cria dois orçamentos; o servidor confere o conteúdo da chave.
      const idempotency_key = `ui-orc-${(globalThis.crypto?.randomUUID?.() || String(Date.now()))}`;
      const data = await api("/api/fin/budgets", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          idempotency_key,
          total_revenue_cents: form.total_revenue_cents === "" ? null : Number(form.total_revenue_cents),
          total_cost_cents: form.total_cost_cents === "" ? null : Number(form.total_cost_cents),
        }),
      });
      setMsg(`Orçamento ${data.budget.protocol} ${data.idempotent_replay ? "já havia sido registrado para esta chave (nenhuma duplicata criada)" : "criado como estimativa"}; premissas explícitas registradas sem promessa de resultado.`);
      setForm({ title: "", description: "", premises: "", period_start: "", period_end: "", total_revenue_cents: "", total_cost_cents: "" });
      setSelectedId(data.budget.id);
      await load();
    } catch (error) {
      setMsg(`Falha ao criar orçamento. ${finFailure(error).title}: ${finFailure(error).detail} ${finErrorFootnote(finFailure(error))}`);
    } finally {
      setBusy(false);
    }
  };

  const transition = async (status: string, label: string) => {
    if (!selected) return;
    setMsg("");
    setBusy(true);
    try {
      const data = await api("/api/fin/budgets", {
        method: "PATCH",
        body: JSON.stringify({ id: selected.id, status, reason: actionReason }),
      });
      setMsg(`${label} registrada para ${data.budget.protocol}. ${status === "aprovado" ? "A aprovação é gerencial e não gera cobrança, pagamento ou obrigação automática." : ""}`);
      setActionReason("");
      await load();
      await loadHistory(selected.id);
    } catch (error) {
      setMsg(`Falha ao registrar ${label.toLowerCase()}. ${finFailure(error).title}: ${finFailure(error).detail} ${finErrorFootnote(finFailure(error))}`);
    } finally {
      setBusy(false);
    }
  };

  const submitRevision = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setMsg("");
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        id: selected.id,
        action: "revise",
        reason: `Revisão do orçamento ${selected.protocol} solicitada pela área financeira`,
        revision_reason: revision.revision_reason,
      };
      if (revision.premises.trim()) payload.premises = revision.premises;
      if (revision.total_revenue_cents !== "") payload.total_revenue_cents = Number(revision.total_revenue_cents);
      if (revision.total_cost_cents !== "") payload.total_cost_cents = Number(revision.total_cost_cents);
      const data = await api("/api/fin/budgets", { method: "PATCH", body: JSON.stringify(payload) });
      setMsg(`Revisão registrada: ${data.budget.protocol} está na versão ${data.budget.version}, a aprovação anterior foi retirada e o orçamento exige nova aprovação.`);
      setRevision({ revision_reason: "", total_revenue_cents: "", total_cost_cents: "", premises: "" });
      await load();
      await loadHistory(selected.id);
    } catch (error) {
      setMsg(`Falha ao revisar. ${finFailure(error).title}: ${finFailure(error).detail} ${finErrorFootnote(finFailure(error))}`);
    } finally {
      setBusy(false);
    }
  };

  const submitScenario = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) { setMsg("Selecione um orçamento pelo nome ou protocolo antes de criar o cenário."); return; }
    setMsg("");
    setBusy(true);
    try {
      const data = await api("/api/fin/budget-scenarios", {
        method: "POST",
        body: JSON.stringify({
          budget_id: selected.id,
          scenario_type: scenario.scenario_type,
          title: scenario.title,
          premises: scenario.premises,
          projected_revenue_cents: scenario.projected_revenue_cents === "" ? null : Number(scenario.projected_revenue_cents),
          projected_cost_cents: scenario.projected_cost_cents === "" ? null : Number(scenario.projected_cost_cents),
        }),
      });
      const basis = data.scenario.margin_basis as string;
      setMsg(`Cenário ${data.scenario.scenario_type} criado como estimativa identificada; margem ${MARGIN_BASIS_LABEL[basis] || basis}. Não há promessa de resultado.`);
      setScenario({ scenario_type: "base", title: "", premises: "", projected_revenue_cents: "", projected_cost_cents: "" });
      await loadScenarios();
    } catch (error) {
      setMsg(`Falha ao criar cenário. ${finFailure(error).title}: ${finFailure(error).detail} ${finErrorFootnote(finFailure(error))}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-testid="finance-budget-workspace">
      <h2>Orçamento gerencial e cenários</h2>
      <p data-testid="fin13-disclaimer">
        <strong>Premissas explícitas obrigatórias:</strong> todos os valores são estimativas gerenciais, identificados com <code>is_estimate=true</code>; não prometemos resultado financeiro. Aprovar um orçamento é decisão gerencial e <strong>não</strong> gera cobrança, pagamento ou obrigação financeira.
      </p>

      {budgetsError && (
        <div data-testid="fin13-budgets-error">
          <UiState variant="error" title="Não foi possível ler os orçamentos" detail={budgetsError}>
            <button type="button" data-testid="fin13-budgets-retry" onClick={() => load()}>Tentar novamente</button>
          </UiState>
        </div>
      )}
      {scenariosError && (
        <div data-testid="fin13-scenarios-error">
          <UiState variant="error" title="Não foi possível ler os cenários" detail={scenariosError} />
        </div>
      )}

      <form data-testid="fin13-budget-form" onSubmit={submitBudget} style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <h3>Criar orçamento ORC-FIN</h3>
        <input data-testid="fin13-budget-title" required minLength={5} maxLength={200} placeholder="Título" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        <input data-testid="fin13-budget-description" required minLength={10} maxLength={2000} placeholder="Descrição" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        <textarea data-testid="fin13-budget-premises" required minLength={10} maxLength={2000} placeholder="Premissas e riscos" value={form.premises} onChange={e => setForm({ ...form, premises: e.target.value })} />
        <input data-testid="fin13-budget-start" required type="date" aria-label="Início do período" value={form.period_start} onChange={e => setForm({ ...form, period_start: e.target.value })} />
        <input data-testid="fin13-budget-end" required type="date" aria-label="Fim do período" value={form.period_end} onChange={e => setForm({ ...form, period_end: e.target.value })} />
        <label>Receita estimada em centavos
          <input data-testid="fin13-budget-revenue" type="number" min="0" placeholder="Receita estimada em centavos" value={form.total_revenue_cents} onChange={e => setForm({ ...form, total_revenue_cents: e.target.value })} />
          <span data-testid="fin13-budget-revenue-preview">{form.total_revenue_cents === "" ? "valor não informado" : brl(form.total_revenue_cents)}</span>
        </label>
        <label>Custo estimado em centavos
          <input data-testid="fin13-budget-cost" type="number" min="0" placeholder="Custo estimado em centavos" value={form.total_cost_cents} onChange={e => setForm({ ...form, total_cost_cents: e.target.value })} />
          <span data-testid="fin13-budget-cost-preview">{form.total_cost_cents === "" ? "valor não informado" : brl(form.total_cost_cents)}</span>
        </label>
        <button data-testid="fin13-budget-create" disabled={busy}>Criar estimativa</button>
      </form>

      <h3>Selecionar orçamento por nome ou protocolo</h3>
      <input data-testid="fin13-budget-search" placeholder="Buscar por nome ou protocolo" value={search} onChange={e => setSearch(e.target.value)} />
      <select data-testid="fin13-budget-select" aria-label="Orçamento selecionado" value={selectedId} onChange={e => { setSelectedId(e.target.value); setHistory([]); setHistoryError(""); }}>
        <option value="">Selecione um orçamento</option>
        {visibleBudgets.map(budget => <option key={budget.id} value={budget.id}>{budget.protocol} · {budget.title} · {budget.status} · v{String(budget.version)}</option>)}
      </select>

      {selected && (
        <div data-testid="fin13-budget-detail" style={{ display: "grid", gap: 6, margin: "12px 0" }}>
          <p data-testid="fin13-detail-protocol">{selected.protocol} · {selected.title}</p>
          <p>Situação: <strong data-testid="fin13-detail-status">{selected.status}</strong> · versão <span data-testid="fin13-detail-version">{String(selected.version)}</span> · período {String(selected.period_start).slice(0, 10)} a {String(selected.period_end).slice(0, 10)}</p>
          <p data-testid="fin13-detail-revenue">Receita estimada: {brl(selected.total_revenue_cents)}</p>
          <p data-testid="fin13-detail-cost">Custo estimado: {brl(selected.total_cost_cents)}</p>
          <p data-testid="fin13-detail-margin">
            Margem: {brl(selected.total_margin_cents)} · {percent(selected.total_margin_percent) ?? "percentual ausente"} · {MARGIN_BASIS_LABEL[selected.margin_basis || ""] || "base não classificada"}
          </p>
          <p data-testid="fin13-detail-premises">Premissas: {selected.premises}</p>
          {selected.revision_reason && <p data-testid="fin13-detail-revision-reason">Motivo da última revisão: {selected.revision_reason}</p>}

          <label>Motivo da ação (10 a 1000 caracteres)
            <input data-testid="fin13-action-reason" minLength={10} maxLength={1000} placeholder="Motivo da ação" value={actionReason} onChange={e => setActionReason(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" data-testid="fin13-send-review" disabled={busy || selected.status !== "rascunho"} onClick={() => transition("em_revisao", "Envio para revisão")}>Enviar para revisão</button>
            <button type="button" data-testid="fin13-approve" disabled={busy || selected.status !== "em_revisao"} onClick={() => transition("aprovado", "Aprovação")}>Aprovar</button>
            <button type="button" data-testid="fin13-reject" disabled={busy || selected.status !== "em_revisao"} onClick={() => transition("rejeitado", "Rejeição")}>Rejeitar</button>
            <button type="button" data-testid="fin13-archive" disabled={busy || !["aprovado", "rejeitado"].includes(selected.status)} onClick={() => transition("arquivado", "Arquivamento")}>Arquivar</button>
            <button type="button" data-testid="fin13-load-history" disabled={busy} onClick={() => loadHistory(selected.id)}>Ver histórico</button>
          </div>

          <form data-testid="fin13-revision-form" onSubmit={submitRevision} style={{ display: "grid", gap: 6, borderTop: "1px solid #ccc", paddingTop: 8 }}>
            <h4>Revisar orçamento aprovado</h4>
            <p>
              Orçamento aprovado não aceita edição comum. A revisão preserva a versão anterior no histórico, retira a aprovação e exige nova aprovação.
            </p>
            <input data-testid="fin13-revision-reason" minLength={10} maxLength={1000} required placeholder="Motivo da revisão (10 a 1000 caracteres)" value={revision.revision_reason} onChange={e => setRevision({ ...revision, revision_reason: e.target.value })} />
            <textarea data-testid="fin13-revision-premises" maxLength={2000} placeholder="Novas premissas (opcional)" value={revision.premises} onChange={e => setRevision({ ...revision, premises: e.target.value })} />
            <input data-testid="fin13-revision-revenue" type="number" min="0" placeholder="Nova receita em centavos (opcional)" value={revision.total_revenue_cents} onChange={e => setRevision({ ...revision, total_revenue_cents: e.target.value })} />
            <input data-testid="fin13-revision-cost" type="number" min="0" placeholder="Novo custo em centavos (opcional)" value={revision.total_cost_cents} onChange={e => setRevision({ ...revision, total_cost_cents: e.target.value })} />
            <button data-testid="fin13-revise" disabled={busy || selected.status !== "aprovado"}>Registrar revisão</button>
          </form>
        </div>
      )}

      <form data-testid="fin13-scenario-form" onSubmit={submitScenario} style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <h3>Criar cenário do orçamento selecionado</h3>
        <p data-testid="fin13-scenario-budget-label">{selected ? `${selected.protocol} · ${selected.title}` : "Nenhum orçamento selecionado"}</p>
        <select data-testid="fin13-scenario-type" aria-label="Tipo de cenário" value={scenario.scenario_type} onChange={e => setScenario({ ...scenario, scenario_type: e.target.value })}>
          {SCENARIOS.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <input data-testid="fin13-scenario-title" required minLength={5} maxLength={200} placeholder="Título do cenário" value={scenario.title} onChange={e => setScenario({ ...scenario, title: e.target.value })} />
        <textarea data-testid="fin13-scenario-premises" required minLength={10} maxLength={2000} placeholder="Premissas do cenário" value={scenario.premises} onChange={e => setScenario({ ...scenario, premises: e.target.value })} />
        <input data-testid="fin13-scenario-revenue" type="number" min="0" placeholder="Receita projetada em centavos" value={scenario.projected_revenue_cents} onChange={e => setScenario({ ...scenario, projected_revenue_cents: e.target.value })} />
        <input data-testid="fin13-scenario-cost" type="number" min="0" placeholder="Custo projetado em centavos" value={scenario.projected_cost_cents} onChange={e => setScenario({ ...scenario, projected_cost_cents: e.target.value })} />
        <p data-testid="fin13-scenario-margin-preview">Margem projetada: {scenarioMarginPreview}</p>
        <button data-testid="fin13-scenario-create" disabled={busy}>Criar cenário</button>
      </form>

      {msg && <p role="status" data-testid="fin13-notice">{msg}</p>}

      <h3>Histórico do orçamento selecionado</h3>
      {historyError && (
        <div data-testid="fin13-history-error">
          <UiState variant="error" title="Não foi possível ler o histórico" detail={historyError} />
        </div>
      )}
      <ul data-testid="fin13-history-list">
        {!historyError && history.length === 0 && <li data-testid="fin13-history-empty">Nenhum evento carregado. Selecione um orçamento e use “Ver histórico”.</li>}
        {history.map(entry => (
          <li data-testid={`fin13-history-row-${entry.id}`} key={entry.id}>
            {entry.event_type || "evento legado sem classificação"} · {entry.previous_status || "início"} → {entry.next_status} · versão {entry.version_before === null || entry.version_before === undefined ? "inicial" : String(entry.version_before)} → {entry.version_after === null || entry.version_after === undefined ? "não registrada" : String(entry.version_after)} · autor {entry.changed_by_identity || "não informado pela origem"} · {new Date(entry.changed_at).toLocaleString("pt-BR")} · motivo: {entry.reason}
          </li>
        ))}
      </ul>

      <h3>Orçamentos recentes</h3>
      <ul data-testid="fin13-budget-list">
        {budgets.length === 0
          ? (budgetsError
            ? <li data-testid="fin13-budget-unavailable">Lista indisponível por falha de leitura — não confundir com ausência de orçamentos.</li>
            : <li data-testid="fin13-budget-empty">Nenhum orçamento encontrado. A leitura foi concluída com sucesso: não há orçamento registrado.</li>)
          : visibleBudgets.map(budget => (
            <li data-testid={`fin13-budget-row-${budget.id}`} key={budget.id}>
              {budget.protocol} · {budget.title} · {budget.status} · v{String(budget.version)} · receita {brl(budget.total_revenue_cents)} · margem {percent(budget.total_margin_percent) ?? "ausente"} · estimativa:{String(budget.is_estimate)} · {budget.estimate_note}
            </li>
          ))}
      </ul>

      <h3>Cenários do orçamento selecionado</h3>
      <ul data-testid="fin13-scenario-list">
        {selectedScenarios.length === 0
          ? (scenariosError
            ? <li data-testid="fin13-scenario-unavailable">Cenários indisponíveis por falha de leitura.</li>
            : <li data-testid="fin13-scenario-empty">Nenhum cenário para o orçamento selecionado. A leitura foi concluída com sucesso.</li>)
          : selectedScenarios.map(item => (
            <li data-testid={`fin13-scenario-row-${item.id}`} key={item.id}>
              {item.scenario_type} · {item.title} · receita {brl(item.projected_revenue_cents)} · custo {brl(item.projected_cost_cents)} · margem {brl(item.projected_margin_cents)} · {percent(item.computed_margin_percent) ?? "percentual ausente"} · {MARGIN_BASIS_LABEL[item.margin_basis || ""] || "base não classificada"} · origem do percentual: {item.margin_source || "não classificada"} · estimativa:{String(item.is_estimate)}
            </li>
          ))}
      </ul>
    </section>
  );
}
