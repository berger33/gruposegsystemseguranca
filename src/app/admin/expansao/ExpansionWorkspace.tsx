"use client";

// UX-10 / EXT-09 — apresentação da jornada interna canônica de expansão.
//
// Esta reescrita é de APRESENTAÇÃO. Nenhuma URL, método, corpo, cabeçalho,
// prefixo de chave de idempotência ou regra de servidor foi alterado. O
// servidor canônico `src/server/ext-expansion-api.mjs`, o `server.mjs` e as
// migrações permanecem intocados. As rotas usadas são exatamente as que
// `server.mjs` despacha:
//
//   GET    /api/ext/expansion/plans?status&q&location
//   POST   /api/ext/expansion/plans                      (idempotency-key)
//   GET    /api/ext/expansion/plans/{id}
//   PATCH  /api/ext/expansion/plans/{id}                 (idempotency-key)
//   POST   /api/ext/expansion/plans/{id}/transition      (idempotency-key)
//   POST   /api/ext/expansion/plans/{id}/scenarios       (idempotency-key)
//   DELETE /api/ext/expansion/scenarios/{id}             (idempotency-key)
//
// Correções de apresentação documentadas em docs/UX-10-EXPANSAO-2026-10-06.md:
//  1. `formatBrl(null)` devolvia cifra zerada: ausência de custo, receita ou
//     margem virava zero na tela. Agora ausência é dita, e a cifra zerada fica
//     reservada ao zero REAL devolvido pelo servidor.
//  2. falha de leitura virava `setPlans([])` e a frase "Nenhum plano de
//     expansão encontrado". Falha agora é estado próprio e nega explicitamente
//     a ausência.
//  3. recusa de papel (`forbidden_role`, `approve_permission_required`,
//     `unauthorized`) era exibida como erro genérico; agora é NEGADO.
//  4. o formulário nascia preenchido com capacidade 10, custo R$ 50.000 e
//     receita R$ 75.000 — números inventados que entravam no banco como
//     estimativa declarada. Os campos nascem vazios e ausência continua
//     ausência.
//  5. a chave de idempotência era recriada a cada tentativa (`Date.now()`),
//     então repetir depois de uma falha podia duplicar efeito. A chave passa a
//     ser PRESERVADA enquanto a operação falha e só é descartada no sucesso —
//     os prefixos do protótipo (`plan-`, `trans-`, `scen-`, `del-scen-`)
//     continuam idênticos.
//  6. `PATCH /plans/{id}` já era despachado e nenhuma tela o chamava; o
//     endpoint não é novo, apenas deixou de ficar inalcançável.
//
// Quem autoriza continua sendo o servidor: papel de leitura, de edição e de
// aprovação são conferidos lá (`STAFF_ROLES`, `EDIT_ROLES`, `APPROVE_ROLES`).
// A tela não esconde ação por palpite de papel — ela envia a operação e
// apresenta a recusa do servidor como NEGADO quando ela vem. O `AdminGate` da
// página não foi alargado.

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import UiState from "../../../components/ui/UiState";
import UiBadge from "../../../components/ui/UiBadge";
import styles from "../../../components/ui/UiWorkspace.module.css";
import { expansionRequest, expansionServerMessage } from "../../../lib/expansion-request";
import {
  describeExpansionError,
  expansionErrorFootnote,
  expansionErrorVariant,
  planStatusLabel,
  planStatusTone,
  transitionActionLabel,
  planEventLabel,
  planEventTone,
  allowedTransitions,
  isTerminalStatus,
  requiresJustification,
  requiresApprovalRole,
  honestMoney,
  honestMargin,
  honestCapacity,
  honestDate,
  honestDateTime,
  honestMilestone,
  honestText,
  count,
  ABSENT,
  ESTIMATE_BOUNDARY,
  EXTERNAL_BOUNDARY,
  READ_ROLES,
  EDIT_ROLES,
  APPROVE_ROLES,
  type ExpansionErrorDescriptor,
} from "../../../lib/expansion-vocabulary.mjs";

/** BIGINT do PostgreSQL chega como string pelo driver `pg`. */
type Cents = number | string | null;

type Plan = {
  id: string;
  protocol: string;
  title: string;
  description: string;
  premises: string;
  target_location: string;
  capacity: number | string | null;
  estimated_cost_cents: Cents;
  estimated_revenue_cents: Cents;
  estimated_margin_cents?: Cents;
  status: string;
  is_estimate?: boolean;
  estimate_note?: string | null;
  justification?: string | null;
  created_by_identity?: string | null;
  approved_by_identity?: string | null;
  approved_at?: string | null;
  executed_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  scenarios_count?: number | string | null;
};

type Scenario = {
  id: string;
  plan_id: string;
  scenario_name: string;
  premises: string;
  projected_cost_cents: Cents;
  projected_revenue_cents: Cents;
  projected_margin_cents: Cents;
  is_estimate?: boolean;
  estimate_note?: string | null;
  created_at?: string | null;
};

type PlanEvent = {
  id: string;
  event_type: string;
  summary: string;
  created_by_identity?: string | null;
  created_at?: string | null;
};

type PlanDetail = Plan & { scenarios: Scenario[]; events: PlanEvent[] };

/** Estado honesto de uma leitura independente: nunca confunde os quatro casos. */
type Load<T> =
  | { phase: "loading" }
  | { phase: "ready"; data: T }
  | { phase: "failed"; error: ExpansionErrorDescriptor };

const TABS = [
  { id: "planos", label: "Planos de expansão" },
  { id: "novo", label: "Novo plano" },
  { id: "plano", label: "Decisão e cenários" },
  { id: "trilha", label: "Trilha do plano" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Domínio do ENUM `ext_expansion_status`, na ordem da máquina de estados. */
const STATUS_OPTIONS = [
  "rascunho",
  "em_analise",
  "aprovado",
  "rejeitado",
  "em_execucao",
  "concluido",
  "cancelado",
] as const;

const EMPTY_PLAN_FORM = {
  title: "",
  target_location: "",
  description: "",
  premises: "",
  capacity: "",
  cost_reais: "",
  revenue_reais: "",
};

const EMPTY_SCENARIO_FORM = {
  scenario_name: "",
  premises: "",
  cost_reais: "",
  revenue_reais: "",
};

const EMPTY_FILTERS = { status: "", q: "", location: "" };

/**
 * Reais digitados → centavos inteiros, exatamente como o protótipo enviava
 * (`Math.round(Number(valor) * 100)`). Campo vazio continua VAZIO: vira `null`
 * e o servidor grava ausência, em vez de um zero que ninguém declarou.
 */
function centsFromReais(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * 100);
}

function integerOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) return null;
  return Math.floor(numeric);
}

/** Centavos do servidor → reais para reedição, sem inventar zero. */
function reaisFromCents(value: Cents): string {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return String(numeric / 100);
}

export function ExpansionWorkspace() {
  const [active, setActive] = useState<TabId>("planos");
  const [list, setList] = useState<Load<Plan[]>>({ phase: "loading" });
  const [detail, setDetail] = useState<Load<PlanDetail> | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const [planForm, setPlanForm] = useState(EMPTY_PLAN_FORM);
  const [editForm, setEditForm] = useState(EMPTY_PLAN_FORM);
  const [editOpen, setEditOpen] = useState(false);
  const [scenarioForm, setScenarioForm] = useState(EMPTY_SCENARIO_FORM);
  const [transitionNotes, setTransitionNotes] = useState("");
  const [transitionJustification, setTransitionJustification] = useState("");
  const [actionError, setActionError] = useState<ExpansionErrorDescriptor | null>(null);
  const [actionDetail, setActionDetail] = useState("");
  const [preservedKey, setPreservedKey] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // A chave de idempotência de cada operação é preservada enquanto a operação
  // falha — repetir reaproveita a mesma chave e o servidor devolve replay em
  // vez de duplicar efeito. Só o sucesso descarta a chave.
  const keys = useRef<Record<string, string>>({});

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (appliedFilters.status) params.set("status", appliedFilters.status);
    if (appliedFilters.q.trim()) params.set("q", appliedFilters.q.trim());
    if (appliedFilters.location.trim()) params.set("location", appliedFilters.location.trim());
    const search = params.toString();
    return search ? `?${search}` : "";
  }, [appliedFilters]);

  const loadList = useCallback(async () => {
    setList({ phase: "loading" });
    const result = await expansionRequest<{ items: Plan[] }>(`/api/ext/expansion/plans${query}`);
    if (!result.ok) {
      // Falha de leitura é estado próprio. Nenhuma lista anterior é mantida e
      // nenhuma lista vazia é fabricada para o lugar dela.
      setList({ phase: "failed", error: result.error });
      return;
    }
    setList({ phase: "ready", data: Array.isArray(result.data?.items) ? result.data.items : [] });
  }, [query]);

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetail({ phase: "loading" });
    const result = await expansionRequest<{ plan: PlanDetail }>(`/api/ext/expansion/plans/${id}`);
    if (!result.ok) {
      setDetail({ phase: "failed", error: result.error });
      return;
    }
    const plan = result.data?.plan;
    if (!plan) {
      // Corpo 200 sem plano não é "plano vazio": é resposta fora do contrato.
      setDetail({ phase: "failed", error: describeExpansionError(null, result.status) });
      return;
    }
    setDetail({
      phase: "ready",
      data: {
        ...plan,
        scenarios: Array.isArray(plan.scenarios) ? plan.scenarios : [],
        events: Array.isArray(plan.events) ? plan.events : [],
      },
    });
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openPlan = (id: string) => {
    setEditOpen(false);
    setActive("plano");
    void loadDetail(id);
  };

  /**
   * Toda escrita passa aqui. URL, método, corpo e cabeçalho de idempotência
   * são exatamente os do servidor. Em falha a chave é preservada; no sucesso
   * ela é descartada.
   */
  const mutate = async <T,>(
    op: string,
    prefix: string,
    url: string,
    { method = "POST", body }: { method?: "POST" | "PATCH" | "DELETE"; body?: unknown } = {},
  ): Promise<T | null> => {
    const key = keys.current[op] || `${prefix}${crypto.randomUUID()}`;
    keys.current[op] = key;
    setBusy(op);
    setActionError(null);
    setActionDetail("");
    setPreservedKey("");
    setNotice("");
    const result = await expansionRequest<T>(url, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        "idempotency-key": key,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    setBusy("");
    if (!result.ok) {
      setActionError(result.error);
      // O servidor manda, junto do código, a lista real de transições
      // permitidas e os limites de validação. Ela é mostrada como veio.
      setActionDetail(expansionServerMessage(result.payload));
      setPreservedKey(key);
      return null;
    }
    delete keys.current[op];
    return result.data;
  };

  const refresh = async (message: string, id = selectedId) => {
    await loadList();
    if (id) await loadDetail(id);
    setNotice(message);
  };

  const createPlan = async (event: FormEvent) => {
    event.preventDefault();
    const data = await mutate<{ plan: Plan }>("create", "plan-", "/api/ext/expansion/plans", {
      body: {
        title: planForm.title.trim(),
        description: planForm.description.trim(),
        premises: planForm.premises.trim(),
        target_location: planForm.target_location.trim(),
        capacity: integerOrNull(planForm.capacity),
        estimated_cost_cents: centsFromReais(planForm.cost_reais),
        estimated_revenue_cents: centsFromReais(planForm.revenue_reais),
      },
    });
    if (!data?.plan) return;
    setPlanForm(EMPTY_PLAN_FORM);
    setActive("plano");
    await refresh(
      `Plano ${honestText(data.plan.protocol)} criado como rascunho pelo servidor, com protocolo e autoria da sessão de equipe.`,
      data.plan.id,
    );
  };

  const startEdit = (plan: PlanDetail) => {
    setEditForm({
      title: plan.title ?? "",
      target_location: plan.target_location ?? "",
      description: plan.description ?? "",
      premises: plan.premises ?? "",
      capacity: plan.capacity === null || plan.capacity === undefined ? "" : String(plan.capacity),
      cost_reais: reaisFromCents(plan.estimated_cost_cents),
      revenue_reais: reaisFromCents(plan.estimated_revenue_cents),
    });
    setEditOpen(true);
  };

  const savePlan = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    const data = await mutate<{ plan: Plan }>(
      `edit-${selectedId}`,
      "edit-plan-",
      `/api/ext/expansion/plans/${selectedId}`,
      {
        method: "PATCH",
        body: {
          title: editForm.title.trim(),
          description: editForm.description.trim(),
          premises: editForm.premises.trim(),
          target_location: editForm.target_location.trim(),
          capacity: integerOrNull(editForm.capacity),
          estimated_cost_cents: centsFromReais(editForm.cost_reais),
          estimated_revenue_cents: centsFromReais(editForm.revenue_reais),
        },
      },
    );
    if (!data?.plan) return;
    setEditOpen(false);
    await refresh("Plano atualizado pelo servidor; a alteração entrou na trilha imutável.");
  };

  const transition = async (status: string) => {
    if (!selectedId) return;
    const justification = transitionJustification.trim();
    const data = await mutate<{ plan: Plan }>(
      `transition-${selectedId}-${status}`,
      "trans-",
      `/api/ext/expansion/plans/${selectedId}/transition`,
      {
        body: {
          status,
          notes: transitionNotes.trim(),
          // O protótipo já omitia a justificativa vazia; o servidor é quem
          // exige o campo em rejeição e cancelamento.
          justification: justification || undefined,
        },
      },
    );
    if (!data?.plan) return;
    setTransitionNotes("");
    setTransitionJustification("");
    await refresh(`Situação ${planStatusLabel(status)} confirmada pelo servidor.`);
  };

  const addScenario = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    const data = await mutate<{ scenario: Scenario }>(
      `scenario-${selectedId}`,
      "scen-",
      `/api/ext/expansion/plans/${selectedId}/scenarios`,
      {
        body: {
          scenario_name: scenarioForm.scenario_name.trim(),
          premises: scenarioForm.premises.trim(),
          projected_cost_cents: centsFromReais(scenarioForm.cost_reais),
          projected_revenue_cents: centsFromReais(scenarioForm.revenue_reais),
        },
      },
    );
    if (!data?.scenario) return;
    setScenarioForm(EMPTY_SCENARIO_FORM);
    await refresh("Cenário financeiro registrado como estimativa declarada, com premissa própria.");
  };

  const removeScenario = async (scenarioId: string) => {
    const data = await mutate<{ deleted: boolean }>(
      `scenario-delete-${scenarioId}`,
      "del-scen-",
      `/api/ext/expansion/scenarios/${scenarioId}`,
      { method: "DELETE" },
    );
    if (!data) return;
    await refresh("Cenário removido pelo servidor; a remoção ficou registrada na trilha.");
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TABS.length - 1;
    const next =
      event.key === "ArrowRight" ? (index + 1) % TABS.length
      : event.key === "ArrowLeft" ? (index + last) % TABS.length
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : -1;
    if (next < 0) return;
    event.preventDefault();
    setActive(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  const renderReadFailure = (
    error: ExpansionErrorDescriptor,
    extraDetail: string,
    retry: () => void,
    testId: string,
  ) => (
    <div data-testid={testId}>
      <UiState
        variant={expansionErrorVariant(error)}
        title={error.title}
        detail={`${error.detail} ${extraDetail} ${expansionErrorFootnote(error)}`}
        onRetry={error.canRetry ? retry : undefined}
        retryLabel="Tentar a leitura de novo"
      />
    </div>
  );

  const items = list.phase === "ready" ? list.data : [];
  const plan = detail?.phase === "ready" ? detail.data : null;
  const scenarios = plan?.scenarios ?? [];
  const events = plan?.events ?? [];
  const transitions = plan ? allowedTransitions(plan.status) : [];
  const filtersActive = Boolean(appliedFilters.status || appliedFilters.q.trim() || appliedFilters.location.trim());

  return (
    <main className={styles.workspace} data-testid="expansion-workspace">
      <nav aria-label="Trilha" className={styles.breadcrumbNav}>
        <a href="/admin">Início</a> · <span aria-current="page">Expansão</span>
      </nav>
      <p className={styles.kicker}>EXT-09</p>
      <h1>Expansão, capacidade e cenários financeiros</h1>
      <p className={styles.lede} data-testid="expansion-honesty">
        Planejamento interno de filial e contrato, com <strong>premissa escrita ao lado de cada número</strong>{" "}
        e decisão registrada com autor, data e justificativa. {ESTIMATE_BOUNDARY}
      </p>
      <p className={styles.hint} data-testid="expansion-boundary">
        {EXTERNAL_BOUNDARY}
      </p>
      <p className={styles.hint}>
        Quem pode ler, escrever e decidir é definido pelo servidor: leitura para{" "}
        {READ_ROLES.join(", ")}; criação e edição para {EDIT_ROLES.join(", ")}; aprovação, execução,
        conclusão, rejeição e cancelamento apenas para {APPROVE_ROLES.join(" e ")}. Abrir esta tela pelo menu
        não concede nenhum desses papéis, e a tela não esconde o botão para adivinhar permissão: a recusa,
        quando vem, é a do servidor.
      </p>

      {notice ? <UiState variant="success" title={notice} /> : null}
      {actionError ? (
        <div data-testid="expansion-action-error">
          <UiState
            variant={expansionErrorVariant(actionError)}
            title={actionError.title}
            detail={`${actionError.detail}${actionDetail ? ` Resposta do servidor: ${actionDetail}` : ""} ${expansionErrorFootnote(actionError)}`}
          >
            {preservedKey ? (
              <p className={styles.footnote}>
                Chave preservada para repetição segura: <code>{preservedKey}</code>. Repetir a mesma operação
                reaproveita a chave e o servidor devolve o efeito já gravado, sem duplicar.
              </p>
            ) : null}
          </UiState>
        </div>
      ) : null}

      <div className={styles.tabs} role="tablist" aria-label="Jornada canônica de expansão">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            id={`expansion-tab-${tab.id}`}
            ref={node => { tabRefs.current[index] = node; }}
            type="button"
            role="tab"
            className={active === tab.id ? styles.tabActive : styles.tab}
            aria-selected={active === tab.id}
            aria-controls={`expansion-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={event => onTabKey(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.tabPanel}>
        {active === "planos" ? (
          <section
            id="expansion-panel-planos"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="expansion-tab-planos"
            className={styles.panel}
            data-testid="expansion-list"
          >
            <h2 className={styles.panelTitle}>Planos de expansão</h2>

            <form
              className={styles.stack}
              data-testid="expansion-filters"
              onSubmit={event => { event.preventDefault(); setAppliedFilters(filters); }}
            >
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="expansion-filter-status">Situação</label>
                  <select
                    id="expansion-filter-status"
                    value={filters.status}
                    onChange={event => setFilters({ ...filters, status: event.target.value })}
                  >
                    <option value="">Todas as situações</option>
                    {STATUS_OPTIONS.map(status => (
                      <option key={status} value={status}>{planStatusLabel(status)}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="expansion-filter-location">Localidade alvo</label>
                  <input
                    id="expansion-filter-location"
                    value={filters.location}
                    onChange={event => setFilters({ ...filters, location: event.target.value })}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="expansion-filter-q">Busca livre</label>
                  <input
                    id="expansion-filter-q"
                    value={filters.q}
                    onChange={event => setFilters({ ...filters, q: event.target.value })}
                  />
                  <p className={styles.hint}>
                    O servidor procura em título, descrição, premissas, localidade e protocolo.
                  </p>
                </div>
              </div>
              <div className={styles.actions}>
                <button className="primary" type="submit">Aplicar filtros</button>
                <button
                  type="button"
                  onClick={() => { setFilters(EMPTY_FILTERS); setAppliedFilters(EMPTY_FILTERS); }}
                >
                  Limpar filtros
                </button>
              </div>
            </form>

            {list.phase === "loading" ? (
              <UiState
                variant="loading"
                title="Lendo os planos de expansão…"
                detail="Nada é exibido antes de a leitura terminar: nem tabela, nem indicador."
              />
            ) : null}

            {list.phase === "failed"
              ? renderReadFailure(
                  list.error,
                  "Isto não significa que não existam planos de expansão registrados: a leitura não foi concluída.",
                  () => void loadList(),
                  "expansion-list-error",
                )
              : null}

            {list.phase === "ready" && items.length === 0 ? (
              <UiState
                variant="empty"
                title={
                  filtersActive
                    ? "A leitura funcionou e nenhum plano atende aos filtros aplicados."
                    : "A leitura funcionou e nenhum plano de expansão está registrado."
                }
                detail="O sistema não cria plano de exemplo; o que não foi registrado pela equipe não aparece aqui."
              />
            ) : null}

            {list.phase === "ready" && items.length > 0 ? (
              <>
                {/* Indicadores só existem depois da leitura concluída: nunca
                    aparecem como zero durante carregamento ou falha. */}
                <ul className={styles.metrics} data-testid="expansion-metrics">
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>{count(items.length)}</span>
                    <span className={styles.metricLabel}>Planos lidos nesta consulta</span>
                  </li>
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>
                      {count(items.filter(item => item.status === "em_analise").length)}
                    </span>
                    <span className={styles.metricLabel}>Aguardando decisão da diretoria</span>
                  </li>
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>
                      {count(items.filter(item => item.status === "em_execucao").length)}
                    </span>
                    <span className={styles.metricLabel}>Em execução agora</span>
                  </li>
                </ul>
                <p className={styles.footnote}>
                  Os três indicadores contam apenas os planos devolvidos por esta consulta, com os filtros
                  acima. Não são total da empresa, meta nem histórico, e nenhum deles é percentual.
                </p>

                <div className={styles.tableWrap}>
                  <table className={styles.table} data-testid="expansion-list-table">
                    <caption>
                      Planos devolvidos pelo servidor, do mais recente para o mais antigo (limite de 200 por
                      consulta). Custo, receita e margem são estimativas declaradas; a margem só existe
                      quando custo e receita foram informados.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Protocolo</th>
                        <th scope="col">Plano</th>
                        <th scope="col">Localidade alvo</th>
                        <th scope="col">Situação</th>
                        <th scope="col">Capacidade declarada</th>
                        <th scope="col">Custo estimado</th>
                        <th scope="col">Receita estimada</th>
                        <th scope="col">Margem estimada</th>
                        <th scope="col">Cenários</th>
                        <th scope="col">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => (
                        <tr key={item.id}>
                          <th scope="row">{honestText(item.protocol)}</th>
                          <td>{honestText(item.title)}</td>
                          <td>{honestText(item.target_location)}</td>
                          <td>
                            <UiBadge tone={planStatusTone(item.status)} srPrefix="Situação do plano">
                              {planStatusLabel(item.status)}
                            </UiBadge>
                          </td>
                          <td>{honestCapacity(item.capacity)}</td>
                          <td>{honestMoney(item.estimated_cost_cents)}</td>
                          <td>{honestMoney(item.estimated_revenue_cents)}</td>
                          <td>{honestMargin(item.estimated_margin_cents)}</td>
                          <td>{count(item.scenarios_count)}</td>
                          <td>
                            <button type="button" onClick={() => openPlan(item.id)}>
                              Abrir plano
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {active === "novo" ? (
          <section
            id="expansion-panel-novo"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="expansion-tab-novo"
            className={styles.panel}
            data-testid="expansion-new"
          >
            <h2 className={styles.panelTitle}>Novo plano de expansão</h2>
            <p className={styles.hint}>
              O plano nasce em rascunho, com protocolo gerado pelo servidor e autoria da sessão de equipe.
              Capacidade, custo e receita são opcionais: <strong>deixe em branco o que ainda não foi
              estudado</strong> — a tela registra ausência, não zero.
            </p>
            <form className={styles.stackWide} onSubmit={createPlan}>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="expansion-title">Título do plano</label>
                  <input
                    id="expansion-title"
                    required
                    minLength={5}
                    maxLength={200}
                    value={planForm.title}
                    onChange={event => setPlanForm({ ...planForm, title: event.target.value })}
                  />
                  <p className={styles.hint}>Entre 5 e 200 caracteres, conforme o servidor.</p>
                </div>
                <div className={styles.field}>
                  <label htmlFor="expansion-location">Localidade alvo</label>
                  <input
                    id="expansion-location"
                    required
                    minLength={3}
                    maxLength={200}
                    value={planForm.target_location}
                    onChange={event => setPlanForm({ ...planForm, target_location: event.target.value })}
                  />
                  <p className={styles.hint}>Entre 3 e 200 caracteres.</p>
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor="expansion-description">Descrição do plano</label>
                <textarea
                  id="expansion-description"
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={3}
                  value={planForm.description}
                  onChange={event => setPlanForm({ ...planForm, description: event.target.value })}
                />
                <p className={styles.hint}>Oportunidade, objetivo e escopo. Entre 10 e 2000 caracteres.</p>
              </div>
              <div className={styles.field}>
                <label htmlFor="expansion-premises">Premissas declaradas</label>
                <textarea
                  id="expansion-premises"
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={3}
                  value={planForm.premises}
                  onChange={event => setPlanForm({ ...planForm, premises: event.target.value })}
                />
                <p className={styles.hint}>
                  De onde vieram os números: base de custo, prazo, infraestrutura, volume esperado. Sem
                  premissa escrita, nenhum valor desta tela se sustenta.
                </p>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="expansion-capacity">Capacidade declarada (vagas, opcional)</label>
                  <input
                    id="expansion-capacity"
                    type="number"
                    min={0}
                    max={1000000}
                    step={1}
                    value={planForm.capacity}
                    onChange={event => setPlanForm({ ...planForm, capacity: event.target.value })}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="expansion-cost">Custo estimado em reais (opcional)</label>
                  <input
                    id="expansion-cost"
                    type="number"
                    min={0}
                    step="0.01"
                    value={planForm.cost_reais}
                    onChange={event => setPlanForm({ ...planForm, cost_reais: event.target.value })}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="expansion-revenue">Receita estimada em reais (opcional)</label>
                  <input
                    id="expansion-revenue"
                    type="number"
                    min={0}
                    step="0.01"
                    value={planForm.revenue_reais}
                    onChange={event => setPlanForm({ ...planForm, revenue_reais: event.target.value })}
                  />
                </div>
              </div>
              <div className={styles.actions}>
                <button className="primary" type="submit" disabled={busy === "create"}>
                  {busy === "create" ? "Registrando…" : "Registrar plano em rascunho"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {active === "plano" ? (
          <section
            id="expansion-panel-plano"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="expansion-tab-plano"
            className={styles.panel}
            data-testid="expansion-plan"
          >
            <h2 className={styles.panelTitle}>Decisão e cenários</h2>

            <div className={styles.field}>
              <label htmlFor="expansion-selected">Plano selecionado</label>
              <select
                id="expansion-selected"
                value={selectedId}
                onChange={event => { if (event.target.value) openPlan(event.target.value); }}
                disabled={list.phase !== "ready" || items.length === 0}
              >
                <option value="">Selecione um plano</option>
                {items.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.protocol} · {planStatusLabel(item.status)} · {item.title}
                  </option>
                ))}
              </select>
            </div>

            {!detail ? (
              <UiState
                variant="empty"
                title="Nenhum plano aberto ainda."
                detail="Escolha um plano na lista para ver premissas, decisão, cenários e trilha. Nada é presumido antes disso."
              />
            ) : null}
            {detail?.phase === "loading" ? (
              <UiState variant="loading" title="Lendo o plano selecionado…" detail="Premissas, cenários e trilha chegam juntos do servidor." />
            ) : null}
            {detail?.phase === "failed"
              ? renderReadFailure(
                  detail.error,
                  "A leitura deste plano não foi concluída; isto não significa que ele esteja vazio ou tenha sido removido.",
                  () => { if (selectedId) void loadDetail(selectedId); },
                  "expansion-detail-error",
                )
              : null}

            {plan ? (
              <>
                <div className={styles.sectionCard} data-testid="expansion-plan-detail">
                  <div className={styles.padded}>
                    <p className={styles.kicker}>{honestText(plan.protocol)}</p>
                    <h3 className={styles.cardTitle}>{honestText(plan.title)}</h3>
                    <div className={styles.badgeRow}>
                      <UiBadge tone={planStatusTone(plan.status)} srPrefix="Situação do plano">
                        {planStatusLabel(plan.status)}
                      </UiBadge>
                      {isTerminalStatus(plan.status) ? (
                        <UiBadge tone="neutral" srPrefix="Máquina de estados">
                          Situação terminal: o servidor não reabre
                        </UiBadge>
                      ) : null}
                      {plan.is_estimate ? (
                        <UiBadge tone="warning" srPrefix="Natureza do número">
                          Estimativa declarada
                        </UiBadge>
                      ) : null}
                    </div>

                    <ul className={styles.metrics} data-testid="expansion-plan-metrics">
                      <li className={styles.metric}>
                        <span className={styles.metricValue}>{honestMoney(plan.estimated_cost_cents)}</span>
                        <span className={styles.metricLabel}>Custo estimado</span>
                      </li>
                      <li className={styles.metric}>
                        <span className={styles.metricValue}>{honestMoney(plan.estimated_revenue_cents)}</span>
                        <span className={styles.metricLabel}>Receita estimada</span>
                      </li>
                      <li className={styles.metric}>
                        <span className={styles.metricValue}>{honestMargin(plan.estimated_margin_cents)}</span>
                        <span className={styles.metricLabel}>Margem estimada (receita menos custo)</span>
                      </li>
                      <li className={styles.metric}>
                        <span className={styles.metricValue}>{honestCapacity(plan.capacity)}</span>
                        <span className={styles.metricLabel}>Capacidade declarada</span>
                      </li>
                    </ul>
                    <p className={styles.footnote}>
                      {honestText(plan.estimate_note)} A margem é calculada pelo servidor apenas quando custo
                      e receita existem; faltando qualquer um dos dois, ela não é calculada — e a tela diz
                      isso, em vez de mostrar uma cifra zerada que ninguém declarou. Nenhum percentual é
                      calculado nesta família.
                    </p>

                    <dl className={styles.facts}>
                      <div>
                        <dt>Localidade alvo</dt>
                        <dd>{honestText(plan.target_location)}</dd>
                      </div>
                      <div>
                        <dt>Criado em</dt>
                        <dd>{honestDateTime(plan.created_at)}</dd>
                      </div>
                      <div>
                        <dt>Última atualização</dt>
                        <dd>{honestDateTime(plan.updated_at)}</dd>
                      </div>
                      <div>
                        <dt>Aprovação</dt>
                        <dd>{honestMilestone(plan.approved_at, "Aprovação pendente")}</dd>
                      </div>
                      <div>
                        <dt>Início de execução</dt>
                        <dd>{honestMilestone(plan.executed_at, "Execução não iniciada")}</dd>
                      </div>
                      <div>
                        <dt>Conclusão</dt>
                        <dd>{honestMilestone(plan.completed_at, "Conclusão pendente")}</dd>
                      </div>
                      <div>
                        <dt>Cancelamento</dt>
                        <dd>{honestMilestone(plan.cancelled_at, "Plano não cancelado")}</dd>
                      </div>
                    </dl>

                    <h4 className={styles.knowledgeSubheading}>Descrição</h4>
                    <p>{honestText(plan.description)}</p>
                    <h4 className={styles.knowledgeSubheading}>Premissas declaradas</h4>
                    <p data-testid="expansion-plan-premises">{honestText(plan.premises)}</p>

                    {plan.justification ? (
                      <div className={`${styles.notice} ${styles.noticeWarning}`} data-testid="expansion-plan-justification">
                        <strong>Justificativa formal registrada:</strong> {honestText(plan.justification)}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className={styles.sectionCard} data-testid="expansion-transitions">
                  <div className={styles.padded}>
                    <h3 className={styles.cardTitle}>Decisão e fluxo</h3>
                    {transitions.length === 0 ? (
                      <UiState
                        variant="empty"
                        title={`Situação terminal: ${planStatusLabel(plan.status)}.`}
                        detail="A máquina de estados do servidor não oferece nenhuma passagem a partir daqui, e a tela não inventa uma."
                      />
                    ) : (
                      <>
                        <p className={styles.hint}>
                          A máquina de estados do servidor permite, a partir de{" "}
                          <strong>{planStatusLabel(plan.status)}</strong>:{" "}
                          {transitions.map(status => planStatusLabel(status)).join(", ")}. Rejeição e
                          cancelamento exigem justificativa de pelo menos 5 caracteres, e o servidor recusa
                          papel sem permissão de decisão.
                        </p>
                        <div className={styles.fieldRow}>
                          <div className={styles.field}>
                            <label htmlFor="expansion-notes">Observação da transição (opcional)</label>
                            <input
                              id="expansion-notes"
                              maxLength={1000}
                              value={transitionNotes}
                              onChange={event => setTransitionNotes(event.target.value)}
                            />
                          </div>
                          <div className={styles.field}>
                            <label htmlFor="expansion-justification">
                              Justificativa formal (obrigatória para rejeitar ou cancelar)
                            </label>
                            <input
                              id="expansion-justification"
                              minLength={5}
                              maxLength={2000}
                              value={transitionJustification}
                              onChange={event => setTransitionJustification(event.target.value)}
                            />
                          </div>
                        </div>
                        <div className={styles.actions}>
                          {transitions.map(status => (
                            <button
                              key={status}
                              type="button"
                              className={status === "aprovado" ? "primary" : undefined}
                              disabled={busy === `transition-${plan.id}-${status}`}
                              onClick={() => void transition(status)}
                            >
                              {transitionActionLabel(status)}
                              {requiresApprovalRole(status) ? " (decisão restrita)" : ""}
                              {requiresJustification(status) ? " — exige justificativa" : ""}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className={styles.sectionCard} data-testid="expansion-edit">
                  <div className={styles.padded}>
                    <h3 className={styles.cardTitle}>Conteúdo do plano</h3>
                    {editOpen ? (
                      <form className={styles.stackWide} onSubmit={savePlan}>
                        <p className={styles.hint}>
                          O servidor só aceita edição em rascunho ou em análise, e mantém o valor anterior de
                          qualquer campo enviado vazio: a edição não apaga número já declarado.
                        </p>
                        <div className={styles.fieldRow}>
                          <div className={styles.field}>
                            <label htmlFor="expansion-edit-title">Título do plano</label>
                            <input
                              id="expansion-edit-title"
                              minLength={5}
                              maxLength={200}
                              value={editForm.title}
                              onChange={event => setEditForm({ ...editForm, title: event.target.value })}
                            />
                          </div>
                          <div className={styles.field}>
                            <label htmlFor="expansion-edit-location">Localidade alvo</label>
                            <input
                              id="expansion-edit-location"
                              minLength={3}
                              maxLength={200}
                              value={editForm.target_location}
                              onChange={event => setEditForm({ ...editForm, target_location: event.target.value })}
                            />
                          </div>
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="expansion-edit-description">Descrição</label>
                          <textarea
                            id="expansion-edit-description"
                            rows={3}
                            minLength={10}
                            maxLength={2000}
                            value={editForm.description}
                            onChange={event => setEditForm({ ...editForm, description: event.target.value })}
                          />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="expansion-edit-premises">Premissas declaradas</label>
                          <textarea
                            id="expansion-edit-premises"
                            rows={3}
                            minLength={10}
                            maxLength={2000}
                            value={editForm.premises}
                            onChange={event => setEditForm({ ...editForm, premises: event.target.value })}
                          />
                        </div>
                        <div className={styles.fieldRow}>
                          <div className={styles.field}>
                            <label htmlFor="expansion-edit-capacity">Capacidade declarada (vagas)</label>
                            <input
                              id="expansion-edit-capacity"
                              type="number"
                              min={0}
                              max={1000000}
                              step={1}
                              value={editForm.capacity}
                              onChange={event => setEditForm({ ...editForm, capacity: event.target.value })}
                            />
                          </div>
                          <div className={styles.field}>
                            <label htmlFor="expansion-edit-cost">Custo estimado em reais</label>
                            <input
                              id="expansion-edit-cost"
                              type="number"
                              min={0}
                              step="0.01"
                              value={editForm.cost_reais}
                              onChange={event => setEditForm({ ...editForm, cost_reais: event.target.value })}
                            />
                          </div>
                          <div className={styles.field}>
                            <label htmlFor="expansion-edit-revenue">Receita estimada em reais</label>
                            <input
                              id="expansion-edit-revenue"
                              type="number"
                              min={0}
                              step="0.01"
                              value={editForm.revenue_reais}
                              onChange={event => setEditForm({ ...editForm, revenue_reais: event.target.value })}
                            />
                          </div>
                        </div>
                        <div className={styles.actions}>
                          <button className="primary" type="submit" disabled={busy === `edit-${plan.id}`}>
                            {busy === `edit-${plan.id}` ? "Salvando…" : "Salvar alterações"}
                          </button>
                          <button type="button" onClick={() => setEditOpen(false)}>Cancelar edição</button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p className={styles.hint}>
                          Editar título, localidade, descrição, premissas, capacidade, custo e receita. O
                          servidor aceita apenas enquanto o plano está em rascunho ou em análise; depois da
                          decisão, o conteúdo é histórico.
                        </p>
                        <div className={styles.actions}>
                          <button type="button" onClick={() => startEdit(plan)}>Editar conteúdo do plano</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className={styles.sectionCard} data-testid="expansion-scenarios">
                  <div className={styles.padded}>
                    <h3 className={styles.cardTitle}>Cenários financeiros declarados</h3>
                    {scenarios.length === 0 ? (
                      <UiState
                        variant="empty"
                        title="A leitura funcionou e este plano não tem cenário financeiro registrado."
                        detail="Cenário nenhum é gerado automaticamente: cada um é escrito pela equipe, com premissa própria."
                      />
                    ) : (
                      <div className={styles.tableWrap}>
                        <table className={styles.table} data-testid="expansion-scenarios-table">
                          <caption>
                            Cenários do plano, do mais antigo para o mais novo. A margem projetada é coluna
                            calculada pelo banco e só existe quando custo e receita do cenário existem.
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">Cenário</th>
                              <th scope="col">Premissas do cenário</th>
                              <th scope="col">Custo projetado</th>
                              <th scope="col">Receita projetada</th>
                              <th scope="col">Margem projetada</th>
                              <th scope="col">Registrado em</th>
                              <th scope="col">Ação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {scenarios.map(scenario => (
                              <tr key={scenario.id}>
                                <th scope="row">{honestText(scenario.scenario_name)}</th>
                                <td>{honestText(scenario.premises)}</td>
                                <td>{honestMoney(scenario.projected_cost_cents)}</td>
                                <td>{honestMoney(scenario.projected_revenue_cents)}</td>
                                <td>{honestMargin(scenario.projected_margin_cents)}</td>
                                <td>{honestDate(scenario.created_at)}</td>
                                <td>
                                  <button
                                    type="button"
                                    disabled={busy === `scenario-delete-${scenario.id}`}
                                    onClick={() => void removeScenario(scenario.id)}
                                  >
                                    Remover cenário
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <form className={styles.stackWide} onSubmit={addScenario}>
                      <h4 className={styles.knowledgeSubheading}>Novo cenário financeiro</h4>
                      <p className={styles.hint}>
                        O nome é único por plano. Custo e receita são opcionais: em branco, o cenário fica
                        registrado sem a cifra e a margem não é calculada.
                      </p>
                      <div className={styles.fieldRow}>
                        <div className={styles.field}>
                          <label htmlFor="expansion-scenario-name">Nome do cenário</label>
                          <input
                            id="expansion-scenario-name"
                            required
                            minLength={3}
                            maxLength={200}
                            value={scenarioForm.scenario_name}
                            onChange={event => setScenarioForm({ ...scenarioForm, scenario_name: event.target.value })}
                          />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="expansion-scenario-cost">Custo projetado em reais (opcional)</label>
                          <input
                            id="expansion-scenario-cost"
                            type="number"
                            min={0}
                            step="0.01"
                            value={scenarioForm.cost_reais}
                            onChange={event => setScenarioForm({ ...scenarioForm, cost_reais: event.target.value })}
                          />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="expansion-scenario-revenue">Receita projetada em reais (opcional)</label>
                          <input
                            id="expansion-scenario-revenue"
                            type="number"
                            min={0}
                            step="0.01"
                            value={scenarioForm.revenue_reais}
                            onChange={event => setScenarioForm({ ...scenarioForm, revenue_reais: event.target.value })}
                          />
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="expansion-scenario-premises">Premissas do cenário</label>
                        <textarea
                          id="expansion-scenario-premises"
                          required
                          minLength={10}
                          maxLength={2000}
                          rows={3}
                          value={scenarioForm.premises}
                          onChange={event => setScenarioForm({ ...scenarioForm, premises: event.target.value })}
                        />
                      </div>
                      <div className={styles.actions}>
                        <button className="primary" type="submit" disabled={busy === `scenario-${plan.id}`}>
                          {busy === `scenario-${plan.id}` ? "Registrando…" : "Registrar cenário"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {active === "trilha" ? (
          <section
            id="expansion-panel-trilha"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="expansion-tab-trilha"
            className={styles.panel}
            data-testid="expansion-trail"
          >
            <h2 className={styles.panelTitle}>Trilha do plano</h2>
            <p className={styles.hint}>
              Eventos do plano selecionado, na ordem em que o servidor gravou. A tabela de eventos é
              imutável no banco: nenhum registro desta trilha pode ser alterado ou apagado depois de criado.
            </p>

            {!detail ? (
              <UiState
                variant="empty"
                title="Nenhum plano aberto ainda."
                detail="Abra um plano na primeira aba para ver a trilha dele."
              />
            ) : null}
            {detail?.phase === "loading" ? (
              <UiState variant="loading" title="Lendo a trilha do plano…" />
            ) : null}
            {detail?.phase === "failed"
              ? renderReadFailure(
                  detail.error,
                  "A trilha não foi lida; isto não significa que o plano não tenha histórico.",
                  () => { if (selectedId) void loadDetail(selectedId); },
                  "expansion-trail-error",
                )
              : null}

            {plan && events.length === 0 ? (
              <UiState
                variant="empty"
                title="A leitura funcionou e este plano ainda não tem evento registrado."
                detail="Nenhum evento é fabricado pela tela."
              />
            ) : null}

            {plan && events.length > 0 ? (
              <ul className={styles.scrollList} data-testid="expansion-events">
                {events.map(item => (
                  <li key={item.id} className={styles.dividedItem}>
                    <div className={styles.badgeRow}>
                      <UiBadge tone={planEventTone(item.event_type)} srPrefix="Evento">
                        {planEventLabel(item.event_type)}
                      </UiBadge>
                    </div>
                    <span className={styles.metaBlock}>{honestText(item.summary)}</span>
                    <span className={styles.metaLine}>
                      Registrado em {honestDateTime(item.created_at)} · autoria{" "}
                      {item.created_by_identity ? "da sessão de equipe que executou a operação" : ABSENT}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}

export default ExpansionWorkspace;
