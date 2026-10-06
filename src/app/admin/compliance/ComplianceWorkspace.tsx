"use client";

// UX-07 / EXT-07 — apresentação da jornada interna canônica de compliance.
//
// Esta reescrita é de APRESENTAÇÃO. Nenhum método, corpo, cabeçalho, chave de
// idempotência ou regra de servidor foi alterada. As sub-rotas abaixo foram
// lidas em `handle()` de src/server/ext-compliance-api.mjs (dispatch interno
// por pathname) e conferidas contra server.mjs (~linha 4399):
//
//   GET  /api/ext/compliance/obligations
//   GET  /api/ext/compliance/documents
//   GET  /api/ext/compliance/documents/{id}
//   GET  /api/ext/compliance/tasks
//   GET  /api/ext/compliance/action-plans
//   GET  /api/ext/compliance/action-plans/{id}
//   GET  /api/ext/compliance/schedule
//   POST /api/ext/compliance/obligations                       (idempotency-key)
//   POST /api/ext/compliance/documents                         (idempotency-key)
//   POST /api/ext/compliance/documents/{id}/renew              (idempotency-key)
//   POST /api/ext/compliance/evaluate                          (idempotency-key)
//   POST /api/ext/compliance/tasks/{id}/{start|complete|cancel}       (idempotency-key)
//   POST /api/ext/compliance/action-plans                      (idempotency-key)
//   POST /api/ext/compliance/action-plans/{id}/{start|complete|cancel} (idempotency-key)
//
// Diferente da fatia de Qualidade, o protótipo de compliance NÃO chamava
// caminho inexistente: todas as URLs que ele usava existem no dispatch real.
// Nenhuma correção de rota foi necessária e nenhum endpoint foi inventado.
// As leituras de detalhe e de execução agendada já existiam no servidor e
// passaram a ser consumidas por esta tela.
//
// Quem autoriza continua sendo o servidor: `staff()` exige sessão de equipe
// (401 `unauthorized`) e papel admin/ti (403 `forbidden`); EXT-07 não usa
// permissão granular por grant. O AdminGate da página não foi alargado.
//
// A chave de idempotência de cada operação é preservada após falha e só é
// descartada no sucesso — contrato herdado do protótipo.
//
// Fronteira documental fixada pelo servidor (`file_boundary`:
// `referencia_declarada_nao_arquivo_verificado`): a tela declara REFERÊNCIA,
// nunca upload, arquivo verificado ou armazenamento confirmado.

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import UiState from "../../../components/ui/UiState";
import UiBadge from "../../../components/ui/UiBadge";
import styles from "../../../components/ui/UiWorkspace.module.css";
import {
  complianceErrorFootnote,
  complianceErrorVariant,
  failedClosedList,
  documentStatusLabel,
  documentStatusTone,
  complianceTypeLabel,
  obligationStatusLabel,
  obligationStatusTone,
  criticalityLabel,
  criticalityTone,
  taskStatusLabel,
  taskStatusTone,
  planStatusLabel,
  planStatusTone,
  planTypeLabel,
  planTypeTone,
  referenceTypeLabel,
  complianceOriginLabel,
  complianceOriginTone,
  runStatusLabel,
  runStatusTone,
  runOriginLabel,
  complianceEventLabel,
  honestDate,
  honestDateTime,
  honestText,
  count,
  ABSENT,
  type ComplianceErrorDescriptor,
} from "../../../lib/compliance-vocabulary.mjs";
import { complianceRequest } from "../../../lib/compliance-request";

type Obligation = {
  id: string;
  obligation_type: string;
  title: string;
  description: string;
  declared_source: string;
  applicability_scope: string;
  applicability_justification?: string | null;
  validity_rule: string;
  renewal_lead_days?: number | null;
  criticality: string;
  status: string;
  responsible_identity?: string | null;
  responsible_name?: string | null;
  created_at?: string | null;
};

type DocumentRow = {
  id: string;
  protocol: string;
  title: string;
  description?: string | null;
  compliance_type: string;
  status: string;
  obligation_id?: string | null;
  origin?: string | null;
  is_private?: boolean | null;
  version_no?: number | null;
  replacement_of?: string | null;
  effective_start_date?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  reference_type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  document_number?: string | null;
  declared_reference?: string | null;
  reference_source?: string | null;
  responsible_identity?: string | null;
  cancellation_justification?: string | null;
  validity_rule?: string | null;
  evaluation_date?: string | null;
};

type TaskRow = {
  id: string;
  obligation_id?: string | null;
  document_id?: string | null;
  validity_period: string;
  rule: string;
  evaluation_date?: string | null;
  due_date?: string | null;
  status: string;
  responsible_identity?: string | null;
  completion_result?: string | null;
  cancellation_justification?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
};

type PlanRow = {
  id: string;
  obligation_id: string;
  document_id?: string | null;
  task_id?: string | null;
  plan_type: string;
  title: string;
  description: string;
  root_cause?: string | null;
  status: string;
  due_date?: string | null;
  responsible_identity?: string | null;
  responsible_name?: string | null;
  completion_result?: string | null;
  cancellation_justification?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  obligation_title?: string | null;
};

type EventRow = {
  id: string;
  event_type: string;
  payload?: unknown;
  created_at?: string | null;
  created_by_identity?: string | null;
  created_by_name?: string | null;
};

type PlanDetail = { action_plan: PlanRow; events: EventRow[] };

type RunRow = {
  id: string;
  origem: string;
  status: string;
  evaluation_date?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  interval_seconds?: number | null;
  idempotency_key?: string | null;
  facts?: unknown;
  error?: string | null;
  actor_identity?: string | null;
  actor_display_name?: string | null;
};

type Schedule = {
  enabled: boolean;
  interval_seconds: number | null;
  actor: { id: string; display_name: string | null } | null;
  activation: string;
  runs: RunRow[];
  note?: string;
};

type Evaluation = {
  source: string;
  evaluation_date: string;
  rule: string;
  facts: {
    documents_expired?: number | null;
    documents_marked_vencida?: number | null;
    documents_marked_a_vencer?: number | null;
    tasks_created?: number | null;
    tasks_already_existing?: number | null;
    failed_closed?: Array<{ document_id: string; reason: string }>;
  };
  replayed?: boolean;
};

/** Estado honesto de uma leitura independente: nunca confunde os quatro casos. */
type Load<T> =
  | { phase: "loading" }
  | { phase: "ready"; data: T }
  | { phase: "failed"; error: ComplianceErrorDescriptor };

const TABS = [
  { id: "obrigacoes", label: "Obrigações e referências" },
  { id: "registrar", label: "Registrar e renovar" },
  { id: "tarefas", label: "Tarefas de vencimento" },
  { id: "planos", label: "Planos de ação" },
  { id: "agenda", label: "Execução agendada" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const CRITICALITIES = ["baixa", "media", "alta", "critica"] as const;
const COMPLIANCE_TYPES = ["licenca", "certidao", "seguro", "alvara", "outro"] as const;
const REFERENCE_TYPES = ["referencia_declarada", "numero_declarado", "registro_publico_declarado", "outro_declarado"] as const;

const EMPTY_OBLIGATION = {
  obligation_type: "",
  title: "",
  description: "",
  declared_source: "",
  applicability_scope: "",
  applicability_justification: "",
  validity_rule: "",
  criticality: "media",
  responsible_identity: "",
};

const EMPTY_DOCUMENT = {
  obligation_id: "",
  title: "",
  description: "",
  compliance_type: "licenca",
  document_number: "",
  issuer: "",
  issue_date: "",
  effective_start_date: "",
  expiry_date: "",
  reference_type: "referencia_declarada",
  declared_reference: "",
  reference_source: "",
};

const EMPTY_RENEWAL = {
  document_id: "",
  issue_date: "",
  effective_start_date: "",
  expiry_date: "",
  reference_type: "referencia_declarada",
  declared_reference: "",
  reference_source: "",
  justification: "",
};

const EMPTY_PLAN = {
  obligation_id: "",
  document_id: "",
  task_id: "",
  plan_type: "corretivo",
  title: "",
  description: "",
  root_cause: "",
  due_date: "",
  responsible_identity: "",
};

export default function ComplianceWorkspace() {
  const [active, setActive] = useState<TabId>("obrigacoes");
  const [obligations, setObligations] = useState<Load<Obligation[]>>({ phase: "loading" });
  const [documents, setDocuments] = useState<Load<DocumentRow[]>>({ phase: "loading" });
  const [tasks, setTasks] = useState<Load<TaskRow[]>>({ phase: "loading" });
  const [plans, setPlans] = useState<Load<PlanRow[]>>({ phase: "loading" });
  const [schedule, setSchedule] = useState<Load<Schedule> | null>(null);
  const [documentDetail, setDocumentDetail] = useState<Load<DocumentRow> | null>(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [planDetail, setPlanDetail] = useState<Load<PlanDetail> | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [actionError, setActionError] = useState<ComplianceErrorDescriptor | null>(null);
  const [preservedKey, setPreservedKey] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [obligation, setObligation] = useState(EMPTY_OBLIGATION);
  const [documentForm, setDocumentForm] = useState(EMPTY_DOCUMENT);
  const [renewal, setRenewal] = useState(EMPTY_RENEWAL);
  const [planForm, setPlanForm] = useState(EMPTY_PLAN);
  const [transitionText, setTransitionText] = useState<Record<string, string>>({});
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Contrato herdado: a chave de idempotência de cada operação é preservada
  // após falha, para a repetição ser segura, e só é descartada após sucesso.
  const keys = useRef<Record<string, string>>({});

  const loadObligations = useCallback(async () => {
    setObligations({ phase: "loading" });
    const result = await complianceRequest<{ items: Obligation[] }>("/api/ext/compliance/obligations");
    if (!result.ok) {
      // Falha de leitura é estado próprio. A lista anterior NÃO é mantida nem
      // substituída por uma lista vazia.
      setObligations({ phase: "failed", error: result.error });
      return;
    }
    setObligations({ phase: "ready", data: Array.isArray(result.data?.items) ? result.data.items : [] });
  }, []);

  const loadDocuments = useCallback(async () => {
    setDocuments({ phase: "loading" });
    const result = await complianceRequest<{ items: DocumentRow[] }>("/api/ext/compliance/documents");
    if (!result.ok) {
      setDocuments({ phase: "failed", error: result.error });
      return;
    }
    setDocuments({ phase: "ready", data: Array.isArray(result.data?.items) ? result.data.items : [] });
  }, []);

  const loadTasks = useCallback(async () => {
    setTasks({ phase: "loading" });
    const result = await complianceRequest<{ items: TaskRow[] }>("/api/ext/compliance/tasks");
    if (!result.ok) {
      setTasks({ phase: "failed", error: result.error });
      return;
    }
    setTasks({ phase: "ready", data: Array.isArray(result.data?.items) ? result.data.items : [] });
  }, []);

  const loadPlans = useCallback(async () => {
    setPlans({ phase: "loading" });
    const result = await complianceRequest<{ items: PlanRow[] }>("/api/ext/compliance/action-plans");
    if (!result.ok) {
      setPlans({ phase: "failed", error: result.error });
      return;
    }
    setPlans({ phase: "ready", data: Array.isArray(result.data?.items) ? result.data.items : [] });
  }, []);

  const loadSchedule = useCallback(async () => {
    setSchedule({ phase: "loading" });
    const result = await complianceRequest<Schedule>("/api/ext/compliance/schedule");
    if (!result.ok) {
      setSchedule({ phase: "failed", error: result.error });
      return;
    }
    setSchedule({ phase: "ready", data: result.data });
  }, []);

  const loadDocumentDetail = useCallback(async (id: string) => {
    setSelectedDocumentId(id);
    setDocumentDetail({ phase: "loading" });
    const result = await complianceRequest<{ document: DocumentRow }>(`/api/ext/compliance/documents/${id}`);
    if (!result.ok) {
      setDocumentDetail({ phase: "failed", error: result.error });
      return;
    }
    setDocumentDetail({ phase: "ready", data: result.data.document });
  }, []);

  const loadPlanDetail = useCallback(async (id: string) => {
    setPlanDetail({ phase: "loading" });
    const result = await complianceRequest<PlanDetail>(`/api/ext/compliance/action-plans/${id}`);
    if (!result.ok) {
      setPlanDetail({ phase: "failed", error: result.error });
      return;
    }
    setPlanDetail({ phase: "ready", data: result.data });
  }, []);

  useEffect(() => {
    void loadObligations();
    void loadDocuments();
    void loadTasks();
    void loadPlans();
  }, [loadObligations, loadDocuments, loadTasks, loadPlans]);

  useEffect(() => {
    if (active === "agenda" && schedule === null) void loadSchedule();
  }, [active, schedule, loadSchedule]);

  /**
   * Toda escrita passa aqui. A URL, o método, o corpo e o cabeçalho de
   * idempotência são exatamente os do servidor; em falha, a chave é
   * preservada (keys.current[op]=k permanece) e a repetição reaproveita a
   * mesma chave — o servidor devolve replay em vez de duplicar efeito.
   */
  const mutate = async <T,>(op: string, url: string, body: unknown): Promise<T | null> => {
    const k = keys.current[op] || `ext07-${op}-${crypto.randomUUID()}`;
    keys.current[op]=k;
    setBusy(true);
    setActionError(null);
    setPreservedKey("");
    setNotice("");
    const result = await complianceRequest<T>(url, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": k },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!result.ok) {
      // O servidor devolve detalhe estruturado junto do código em alguns
      // casos (`hint` de current_document_exists/invalid_plan_type, `detail`
      // de invalid_transition). O código canônico NÃO é alterado.
      const extra =
        result.payload && typeof result.payload === "object"
          ? (result.payload as { hint?: unknown; detail?: unknown })
          : {};
      const complement = [extra.hint, extra.detail].filter(value => typeof value === "string").join(" ");
      setActionError(
        complement ? { ...result.error, detail: `${result.error.detail} ${complement}` } : result.error,
      );
      setPreservedKey(k);
      return null;
    }
    delete keys.current[op];
    return result.data;
  };

  const refreshAll = async (message: string) => {
    await Promise.all([loadObligations(), loadDocuments(), loadTasks(), loadPlans()]);
    setNotice(message);
  };

  const createObligation = async (event: FormEvent) => {
    event.preventDefault();
    const data = await mutate<{ obligation: Obligation }>("obligation", "/api/ext/compliance/obligations", obligation);
    if (!data) return;
    setObligation(EMPTY_OBLIGATION);
    await refreshAll("Obrigação declarada pelo servidor. Declaração interna: não é validação jurídica nem confirmação por órgão público.");
  };

  const createDocument = async (event: FormEvent) => {
    event.preventDefault();
    const data = await mutate<{ document: DocumentRow }>("document", "/api/ext/compliance/documents", {
      ...documentForm,
      effective_start_date: documentForm.effective_start_date || undefined,
      document_number: documentForm.document_number || undefined,
      issuer: documentForm.issuer || undefined,
      reference_source: documentForm.reference_source || undefined,
    });
    if (!data) return;
    setDocumentForm(EMPTY_DOCUMENT);
    await refreshAll("Referência declarada registrada pelo servidor. Ela não é arquivo, bytes, checksum nem armazenamento confirmado.");
  };

  const renewDocument = async (event: FormEvent) => {
    event.preventDefault();
    if (!renewal.document_id) return;
    const { document_id, ...payload } = renewal;
    const data = await mutate<{ document: DocumentRow }>("renew", `/api/ext/compliance/documents/${document_id}/renew`, {
      ...payload,
      effective_start_date: payload.effective_start_date || undefined,
      reference_source: payload.reference_source || undefined,
    });
    if (!data) return;
    setRenewal(EMPTY_RENEWAL);
    await refreshAll("Renovação registrada como novo registro versionado; a versão anterior virou histórico imutável e não foi sobrescrita.");
  };

  const evaluate = async () => {
    const data = await mutate<Evaluation>("evaluate", "/api/ext/compliance/evaluate", {});
    if (!data) return;
    setEvaluation(data);
    await refreshAll("Avaliação temporal executada na data do servidor.");
  };

  const taskTransition = async (id: string, op: "start" | "complete" | "cancel") => {
    const typed = transitionText[`task-${id}`] || "";
    const body =
      op === "complete" ? { result: typed }
      : op === "cancel" ? { justification: typed }
      : {};
    const data = await mutate(`task-${op}-${id}`, `/api/ext/compliance/tasks/${id}/${op}`, body);
    if (!data) return;
    setTransitionText(current => ({ ...current, [`task-${id}`]: "" }));
    await refreshAll(`Tarefa de vencimento ${taskStatusLabel(op === "start" ? "em_andamento" : op === "complete" ? "concluida" : "cancelada").toLowerCase()} pelo servidor.`);
  };

  const createPlan = async (event: FormEvent) => {
    event.preventDefault();
    const data = await mutate<{ action_plan: PlanRow }>("action-plan", "/api/ext/compliance/action-plans", {
      ...planForm,
      document_id: planForm.document_id || null,
      task_id: planForm.task_id || null,
      root_cause: planForm.root_cause || null,
      responsible_identity: planForm.responsible_identity || undefined,
    });
    if (!data) return;
    setPlanForm(EMPTY_PLAN);
    await refreshAll("Plano de ação registrado: controle interno auditado, não parecer jurídico.");
  };

  const planTransition = async (id: string, op: "start" | "complete" | "cancel") => {
    const typed = transitionText[`plan-${id}`] || "";
    const body =
      op === "complete" ? { result: typed }
      : op === "cancel" ? { justification: typed }
      : {};
    const data = await mutate(`plan-${op}-${id}`, `/api/ext/compliance/action-plans/${id}/${op}`, body);
    if (!data) return;
    setTransitionText(current => ({ ...current, [`plan-${id}`]: "" }));
    await refreshAll(`Plano de ação ${planStatusLabel(op === "start" ? "em_andamento" : op === "complete" ? "concluido" : "cancelado").toLowerCase()} pelo servidor.`);
    if (planDetail?.phase === "ready" && planDetail.data.action_plan.id === id) await loadPlanDetail(id);
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
    error: ComplianceErrorDescriptor,
    retry: () => void,
    testId: string,
    negacao: string,
  ) => (
    <div data-testid={testId}>
      <UiState
        variant={complianceErrorVariant(error)}
        title={error.title}
        detail={`${error.detail} ${negacao} ${complianceErrorFootnote(error)}`}
        onRetry={error.canRetry ? retry : undefined}
        retryLabel="Tentar a leitura de novo"
      />
    </div>
  );

  const obligationItems = obligations.phase === "ready" ? obligations.data : [];
  const documentItems = documents.phase === "ready" ? documents.data : [];
  const taskItems = tasks.phase === "ready" ? tasks.data : [];
  const planItems = plans.phase === "ready" ? plans.data : [];
  const renewableDocuments = documentItems.filter(item =>
    ["vigente", "a_vencer", "em_renovacao", "vencida"].includes(String(item.status)),
  );

  return (
    <main className={styles.workspace} data-testid="compliance-workspace">
      <nav aria-label="Trilha" className={styles.breadcrumbNav}>
        <a href="/admin">Início</a> · <span aria-current="page">Compliance</span>
      </nav>
      <p className={styles.kicker}>EXT-07</p>
      <h1>Compliance corporativo e obrigações internas</h1>
      <p className={styles.lede} data-testid="compliance-honesty">
        Jornada exclusivamente interna de equipe, regida pelo critério do servidor:{" "}
        <strong>o vencimento é avaliado na data do servidor e gera tarefa</strong>. As referências documentais são declarações privadas e rastreáveis: elas <strong>não representam upload</strong>, arquivo verificado, bytes, checksum, malware scan, armazenamento confirmado ou download. A tela não inventa prazo, avaliação nem conformidade: tudo o que aparece veio do servidor, e onde não existe dado real a tela diz que não existe — nunca mostra zero no lugar.
      </p>
      <p className={styles.hint}>
        Quem pode ler e escrever é decidido pelo servidor: sessão de equipe válida e papel autorizado, conferidos em <code>src/server/ext-compliance-api.mjs</code> antes de qualquer resposta. Abrir esta tela pelo menu não concede acesso nenhum. A obrigação declarada é controle interno — não é validação jurídica nem confirmação por órgão público — e o plano de ação é controle auditado, não parecer jurídico.
      </p>

      {notice ? <UiState variant="success" title={notice} /> : null}
      {actionError ? (
        <div data-testid="compliance-action-error">
          <UiState
            variant={complianceErrorVariant(actionError)}
            title={actionError.title}
            detail={`${actionError.detail} ${complianceErrorFootnote(actionError)}`}
          >
            {preservedKey ? (
              <p className={styles.footnote}>
                Chave preservada para repetição segura: <code>{preservedKey}</code>. Repetir a mesma
                operação reaproveita a chave e não duplica efeito.
              </p>
            ) : null}
          </UiState>
        </div>
      ) : null}

      <div className={styles.tabs} role="tablist" aria-label="Jornada canônica de compliance">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            id={`compliance-tab-${tab.id}`}
            ref={node => { tabRefs.current[index] = node; }}
            type="button"
            role="tab"
            className={active === tab.id ? styles.tabActive : styles.tab}
            aria-selected={active === tab.id}
            aria-controls={`compliance-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={event => onTabKey(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.tabPanel}>
        {active === "obrigacoes" ? (
          <section
            id="compliance-panel-obrigacoes"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="compliance-tab-obrigacoes"
            className={styles.panel}
            data-testid="compliance-obligations"
          >
            <h2 className={styles.panelTitle}>Obrigações declaradas</h2>
            {obligations.phase === "loading" ? (
              <UiState variant="loading" title="Lendo as obrigações declaradas…" detail="Nada é exibido antes de a leitura terminar." />
            ) : null}
            {obligations.phase === "failed"
              ? renderReadFailure(
                  obligations.error,
                  () => void loadObligations(),
                  "compliance-obligations-error",
                  "Isto não significa que não existam obrigações declaradas.",
                )
              : null}
            {obligations.phase === "ready" && obligationItems.length === 0 ? (
              <UiState
                variant="empty"
                title="A leitura funcionou e nenhuma obrigação está declarada."
                detail="O sistema não cria registro de exemplo. Ausência de obrigação declarada não é prova de conformidade."
              />
            ) : null}
            {obligations.phase === "ready" && obligationItems.length > 0 ? (
              <>
                {/* Indicadores só existem depois da leitura concluída: nunca
                    aparecem como zero durante carregamento ou falha. */}
                <ul className={styles.metrics} data-testid="compliance-obligation-metrics">
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>{count(obligationItems.length)}</span>
                    <span className={styles.metricLabel}>Obrigações lidas</span>
                  </li>
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>
                      {count(obligationItems.filter(item => item.status === "vencida").length)}
                    </span>
                    <span className={styles.metricLabel}>Com situação vencida no servidor</span>
                  </li>
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>
                      {count(obligationItems.filter(item => item.criticality === "critica").length)}
                    </span>
                    <span className={styles.metricLabel}>Declaradas críticas</span>
                  </li>
                </ul>
                <div className={styles.tableWrap}>
                  <table className={styles.table} data-testid="compliance-obligations-table">
                    <caption>
                      Obrigações declaradas pela equipe, da mais recente à mais antiga. A situação é
                      derivada pelo servidor a partir da referência corrente, nunca digitada aqui.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Obrigação</th>
                        <th scope="col">Tipo declarado</th>
                        <th scope="col">Situação</th>
                        <th scope="col">Criticidade</th>
                        <th scope="col">Antecedência de renovação</th>
                        <th scope="col">Responsável canônico</th>
                      </tr>
                    </thead>
                    <tbody>
                      {obligationItems.map(item => (
                        <tr key={item.id}>
                          <th scope="row">{honestText(item.title)}</th>
                          <td>{honestText(item.obligation_type)}</td>
                          <td>
                            <UiBadge tone={obligationStatusTone(item.status)} srPrefix="Situação da obrigação">
                              {obligationStatusLabel(item.status)}
                            </UiBadge>
                          </td>
                          <td>
                            <UiBadge tone={criticalityTone(item.criticality)} srPrefix="Criticidade declarada">
                              {criticalityLabel(item.criticality)}
                            </UiBadge>
                          </td>
                          <td>
                            {item.renewal_lead_days == null
                              ? ABSENT
                              : `${count(item.renewal_lead_days)} dia(s)`}
                          </td>
                          <td>{honestText(item.responsible_name || item.responsible_identity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            <h2 className={styles.panelTitle}>Referências documentais declaradas</h2>
            <p className={styles.hint}>
              Cada linha abaixo é uma <strong>referência declarada</strong> pela equipe, não um arquivo
              verificado. O servidor marca essa fronteira em toda resposta desta família.
            </p>
            {documents.phase === "loading" ? (
              <UiState variant="loading" title="Lendo as referências documentais…" detail="Nada é exibido antes de a leitura terminar." />
            ) : null}
            {documents.phase === "failed"
              ? renderReadFailure(
                  documents.error,
                  () => void loadDocuments(),
                  "compliance-documents-error",
                  "Isto não significa que não existam referências registradas.",
                )
              : null}
            {documents.phase === "ready" && documentItems.length === 0 ? (
              <UiState
                variant="empty"
                title="A leitura funcionou e nenhuma referência canônica está registrada."
                detail="Nenhuma referência declarada é criada automaticamente; o que não foi declarado não aparece."
              />
            ) : null}
            {documents.phase === "ready" && documentItems.length > 0 ? (
              <div className={styles.tableWrap}>
                <table className={styles.table} data-testid="compliance-documents-table">
                  <caption>
                    Referências canônicas devolvidas pelo servidor, ordenadas pelo vencimento. Versão
                    anterior substituída permanece como histórico imutável.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Protocolo</th>
                      <th scope="col">Título</th>
                      <th scope="col">Tipo</th>
                      <th scope="col">Situação</th>
                      <th scope="col">Vencimento declarado</th>
                      <th scope="col">Versão</th>
                      <th scope="col">Origem</th>
                      <th scope="col">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentItems.map(item => (
                      <tr key={item.id}>
                        <th scope="row">{honestText(item.protocol)}</th>
                        <td>{honestText(item.title)}</td>
                        <td>{complianceTypeLabel(item.compliance_type)}</td>
                        <td>
                          <UiBadge tone={documentStatusTone(item.status)} srPrefix="Situação da referência">
                            {documentStatusLabel(item.status)}
                          </UiBadge>
                        </td>
                        <td>{item.expiry_date ? honestDate(item.expiry_date) : "Sem vencimento declarado"}</td>
                        <td>{count(item.version_no)}</td>
                        <td>
                          <UiBadge tone={complianceOriginTone(item.origin)} srPrefix="Origem do registro">
                            {complianceOriginLabel(item.origin)}
                          </UiBadge>
                        </td>
                        <td>
                          <button type="button" onClick={() => void loadDocumentDetail(item.id)}>
                            Ver referência declarada
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {documentDetail ? (
              <div className={styles.sectionCard} data-testid="compliance-document-detail">
                <h3>Detalhe da referência declarada</h3>
                {documentDetail.phase === "loading" ? (
                  <UiState variant="loading" title="Lendo o detalhe da referência…" />
                ) : null}
                {documentDetail.phase === "failed"
                  ? renderReadFailure(
                      documentDetail.error,
                      () => void loadDocumentDetail(selectedDocumentId),
                      "compliance-document-detail-error",
                      "Isto não significa que a referência não exista.",
                    )
                  : null}
                {documentDetail.phase === "ready" ? (
                  <dl className={styles.facts}>
                    <div className={styles.metaLine}>
                      <dt>Protocolo</dt>
                      <dd>{honestText(documentDetail.data.protocol)}</dd>
                    </div>
                    <div className={styles.metaLine}>
                      <dt>Tipo de referência</dt>
                      <dd>{referenceTypeLabel(documentDetail.data.reference_type)}</dd>
                    </div>
                    <div className={styles.metaLine}>
                      <dt>Referência declarada</dt>
                      <dd>{honestText(documentDetail.data.declared_reference)}</dd>
                    </div>
                    <div className={styles.metaLine}>
                      <dt>Fonte declarada da referência</dt>
                      <dd>{honestText(documentDetail.data.reference_source)}</dd>
                    </div>
                    <div className={styles.metaLine}>
                      <dt>Número declarado</dt>
                      <dd>{honestText(documentDetail.data.document_number)}</dd>
                    </div>
                    <div className={styles.metaLine}>
                      <dt>Emissão declarada</dt>
                      <dd>{honestDate(documentDetail.data.issue_date)}</dd>
                    </div>
                    <div className={styles.metaLine}>
                      <dt>Início de vigência</dt>
                      <dd>{honestDate(documentDetail.data.effective_start_date)}</dd>
                    </div>
                    <div className={styles.metaLine}>
                      <dt>Vencimento declarado</dt>
                      <dd>{documentDetail.data.expiry_date ? honestDate(documentDetail.data.expiry_date) : "Sem vencimento declarado"}</dd>
                    </div>
                    <div className={styles.metaLine}>
                      <dt>Última avaliação pelo servidor</dt>
                      <dd>{documentDetail.data.evaluation_date ? honestDate(documentDetail.data.evaluation_date) : "Avaliação ainda não executada"}</dd>
                    </div>
                    <div className={styles.metaLine}>
                      <dt>Regra de validade</dt>
                      <dd>{honestText(documentDetail.data.validity_rule)}</dd>
                    </div>
                    <div className={styles.metaLine}>
                      <dt>Justificativa de cancelamento</dt>
                      <dd>{honestText(documentDetail.data.cancellation_justification)}</dd>
                    </div>
                  </dl>
                ) : null}
                <p className={styles.footnote}>
                  Nada aqui é arquivo: o servidor devolve <code>referencia_declarada_nao_arquivo_verificado</code> como
                  fronteira documental desta família.
                </p>
              </div>
            ) : null}
          </section>
        ) : null}

        {active === "registrar" ? (
          <section
            id="compliance-panel-registrar"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="compliance-tab-registrar"
            className={styles.panel}
            data-testid="compliance-forms"
          >
            <h2 className={styles.panelTitle}>Declarar obrigação aplicável</h2>
            <p className={styles.hint}>
              Estado, autoria e datas de registro vêm do servidor. O que você escreve aqui é a
              declaração interna de aplicabilidade — nunca uma validação externa.
            </p>
            <form className={styles.stack} onSubmit={createObligation}>
              <div className={styles.fieldRow}>
                <label className={styles.field} htmlFor="obligation-type">
                  Tipo da obrigação (3 a 100 caracteres)
                  <input id="obligation-type" required value={obligation.obligation_type}
                    onChange={event => setObligation({ ...obligation, obligation_type: event.target.value })} />
                </label>
                <label className={styles.field} htmlFor="obligation-title">
                  Título (5 a 200 caracteres)
                  <input id="obligation-title" required value={obligation.title}
                    onChange={event => setObligation({ ...obligation, title: event.target.value })} />
                </label>
              </div>
              <label className={styles.field} htmlFor="obligation-description">
                Descrição (10 a 2000 caracteres)
                <textarea id="obligation-description" required value={obligation.description}
                  onChange={event => setObligation({ ...obligation, description: event.target.value })} />
              </label>
              <label className={styles.field} htmlFor="obligation-source">
                Fonte declarada (5 a 1000 caracteres)
                <input id="obligation-source" required value={obligation.declared_source}
                  onChange={event => setObligation({ ...obligation, declared_source: event.target.value })} />
              </label>
              <label className={styles.field} htmlFor="obligation-scope">
                Escopo de aplicabilidade (3 a 500 caracteres)
                <input id="obligation-scope" required value={obligation.applicability_scope}
                  onChange={event => setObligation({ ...obligation, applicability_scope: event.target.value })} />
              </label>
              <label className={styles.field} htmlFor="obligation-justification">
                Justificativa da aplicabilidade (10 a 2000 caracteres)
                <textarea id="obligation-justification" required value={obligation.applicability_justification}
                  onChange={event => setObligation({ ...obligation, applicability_justification: event.target.value })} />
              </label>
              <div className={styles.fieldRow}>
                <label className={styles.field} htmlFor="obligation-rule">
                  Regra de validade declarada (5 a 500 caracteres)
                  <input id="obligation-rule" required value={obligation.validity_rule}
                    onChange={event => setObligation({ ...obligation, validity_rule: event.target.value })} />
                </label>
                <label className={styles.field} htmlFor="obligation-criticality">
                  Criticidade declarada
                  <select id="obligation-criticality" value={obligation.criticality}
                    onChange={event => setObligation({ ...obligation, criticality: event.target.value })}>
                    {CRITICALITIES.map(value => (
                      <option key={value} value={value}>{criticalityLabel(value)}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.field} htmlFor="obligation-responsible">
                  Identidade do responsável de equipe
                  <input id="obligation-responsible" required value={obligation.responsible_identity}
                    onChange={event => setObligation({ ...obligation, responsible_identity: event.target.value })} />
                </label>
              </div>
              <p className={styles.footnote}>
                O responsável precisa ser uma identidade de equipe ativa; o servidor recusa qualquer
                outra. A tela não escolhe responsável por você.
              </p>
              <div className={styles.actions}>
                <button type="submit" disabled={busy}>Declarar obrigação</button>
              </div>
            </form>

            <h2 className={styles.panelTitle}>Registrar referência documental</h2>
            <form className={styles.stack} onSubmit={createDocument}>
              <label className={styles.field} htmlFor="document-obligation">
                Obrigação vinculada
                <select id="document-obligation" required value={documentForm.obligation_id}
                  onChange={event => setDocumentForm({ ...documentForm, obligation_id: event.target.value })}>
                  <option value="">Escolha a obrigação declarada</option>
                  {obligationItems.map(item => (
                    <option key={item.id} value={item.id}>{item.title}</option>
                  ))}
                </select>
              </label>
              <div className={styles.fieldRow}>
                <label className={styles.field} htmlFor="document-title">
                  Título (5 a 200 caracteres)
                  <input id="document-title" required value={documentForm.title}
                    onChange={event => setDocumentForm({ ...documentForm, title: event.target.value })} />
                </label>
                <label className={styles.field} htmlFor="document-type">
                  Tipo de compliance
                  <select id="document-type" value={documentForm.compliance_type}
                    onChange={event => setDocumentForm({ ...documentForm, compliance_type: event.target.value })}>
                    {COMPLIANCE_TYPES.map(value => (
                      <option key={value} value={value}>{complianceTypeLabel(value)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className={styles.field} htmlFor="document-description">
                Descrição (10 a 2000 caracteres)
                <textarea id="document-description" required value={documentForm.description}
                  onChange={event => setDocumentForm({ ...documentForm, description: event.target.value })} />
              </label>
              <div className={styles.fieldRow}>
                <label className={styles.field} htmlFor="document-issue">
                  Data de emissão declarada
                  <input id="document-issue" type="date" required value={documentForm.issue_date}
                    onChange={event => setDocumentForm({ ...documentForm, issue_date: event.target.value })} />
                </label>
                <label className={styles.field} htmlFor="document-start">
                  Início de vigência (opcional)
                  <input id="document-start" type="date" value={documentForm.effective_start_date}
                    onChange={event => setDocumentForm({ ...documentForm, effective_start_date: event.target.value })} />
                </label>
                <label className={styles.field} htmlFor="document-expiry">
                  Vencimento declarado
                  <input id="document-expiry" type="date" required value={documentForm.expiry_date}
                    onChange={event => setDocumentForm({ ...documentForm, expiry_date: event.target.value })} />
                </label>
              </div>
              <div className={styles.fieldRow}>
                <label className={styles.field} htmlFor="document-reference-type">
                  Tipo da referência declarada
                  <select id="document-reference-type" value={documentForm.reference_type}
                    onChange={event => setDocumentForm({ ...documentForm, reference_type: event.target.value })}>
                    {REFERENCE_TYPES.map(value => (
                      <option key={value} value={value}>{referenceTypeLabel(value)}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.field} htmlFor="document-reference">
                  Referência declarada (3 a 1000 caracteres)
                  <input id="document-reference" required value={documentForm.declared_reference}
                    onChange={event => setDocumentForm({ ...documentForm, declared_reference: event.target.value })} />
                </label>
                <label className={styles.field} htmlFor="document-reference-source">
                  Fonte da referência (opcional)
                  <input id="document-reference-source" value={documentForm.reference_source}
                    onChange={event => setDocumentForm({ ...documentForm, reference_source: event.target.value })} />
                </label>
              </div>
              <div className={styles.fieldRow}>
                <label className={styles.field} htmlFor="document-number">
                  Número declarado (opcional)
                  <input id="document-number" value={documentForm.document_number}
                    onChange={event => setDocumentForm({ ...documentForm, document_number: event.target.value })} />
                </label>
                <label className={styles.field} htmlFor="document-issuer">
                  Emissor declarado (opcional)
                  <input id="document-issuer" value={documentForm.issuer}
                    onChange={event => setDocumentForm({ ...documentForm, issuer: event.target.value })} />
                </label>
              </div>
              <p className={styles.footnote}>
                Você está declarando uma referência, não enviando um arquivo. Nenhum byte é recebido,
                nenhum checksum é calculado e nenhum armazenamento é confirmado por esta tela.
              </p>
              <div className={styles.actions}>
                <button type="submit" disabled={busy}>Registrar referência declarada</button>
              </div>
            </form>

            <h2 className={styles.panelTitle}>Renovar referência corrente</h2>
            <form className={styles.stack} onSubmit={renewDocument}>
              <label className={styles.field} htmlFor="renewal-document">
                Referência a renovar
                <select id="renewal-document" required value={renewal.document_id}
                  onChange={event => setRenewal({ ...renewal, document_id: event.target.value })}>
                  <option value="">Escolha a referência corrente</option>
                  {renewableDocuments.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.protocol} — versão {item.version_no} — {documentStatusLabel(item.status)}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.fieldRow}>
                <label className={styles.field} htmlFor="renewal-issue">
                  Nova emissão declarada
                  <input id="renewal-issue" type="date" required value={renewal.issue_date}
                    onChange={event => setRenewal({ ...renewal, issue_date: event.target.value })} />
                </label>
                <label className={styles.field} htmlFor="renewal-start">
                  Novo início de vigência (opcional)
                  <input id="renewal-start" type="date" value={renewal.effective_start_date}
                    onChange={event => setRenewal({ ...renewal, effective_start_date: event.target.value })} />
                </label>
                <label className={styles.field} htmlFor="renewal-expiry">
                  Novo vencimento declarado
                  <input id="renewal-expiry" type="date" required value={renewal.expiry_date}
                    onChange={event => setRenewal({ ...renewal, expiry_date: event.target.value })} />
                </label>
              </div>
              <div className={styles.fieldRow}>
                <label className={styles.field} htmlFor="renewal-reference-type">
                  Tipo da referência declarada
                  <select id="renewal-reference-type" value={renewal.reference_type}
                    onChange={event => setRenewal({ ...renewal, reference_type: event.target.value })}>
                    {REFERENCE_TYPES.map(value => (
                      <option key={value} value={value}>{referenceTypeLabel(value)}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.field} htmlFor="renewal-reference">
                  Nova referência declarada (3 a 1000 caracteres)
                  <input id="renewal-reference" required value={renewal.declared_reference}
                    onChange={event => setRenewal({ ...renewal, declared_reference: event.target.value })} />
                </label>
                <label className={styles.field} htmlFor="renewal-reference-source">
                  Fonte da referência (opcional)
                  <input id="renewal-reference-source" value={renewal.reference_source}
                    onChange={event => setRenewal({ ...renewal, reference_source: event.target.value })} />
                </label>
              </div>
              <label className={styles.field} htmlFor="renewal-justification">
                Justificativa da renovação (10 a 2000 caracteres)
                <textarea id="renewal-justification" required value={renewal.justification}
                  onChange={event => setRenewal({ ...renewal, justification: event.target.value })} />
              </label>
              <p className={styles.footnote}>
                A renovação cria um registro novo e marca o anterior como substituído. A versão
                anterior nunca é sobrescrita nem apagada.
              </p>
              <div className={styles.actions}>
                <button type="submit" disabled={busy}>Renovar como novo registro versionado</button>
              </div>
            </form>
          </section>
        ) : null}

        {active === "tarefas" ? (
          <section
            id="compliance-panel-tarefas"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="compliance-tab-tarefas"
            className={styles.panel}
            data-testid="compliance-tasks"
          >
            <h2 className={styles.panelTitle}>Avaliação temporal explícita</h2>
            <p className={styles.hint}>
              A data-base é sempre a data do servidor; o relógio de quem opera nunca é aceito. A
              avaliação só gera tarefa para obrigação com responsável de equipe ativo — sem
              responsável, o servidor falha fechado e informa o que deixou de fazer.
            </p>
            <div className={styles.actions}>
              <button type="button" disabled={busy} onClick={() => void evaluate()}>
                Avaliar vencimentos na data do servidor
              </button>
            </div>
            {evaluation ? (
              <div className={styles.sectionCard} data-testid="compliance-evaluation">
                <h3>Resultado da última avaliação nesta sessão</h3>
                <dl className={styles.facts}>
                  <div className={styles.metaLine}>
                    <dt>Data de avaliação (servidor)</dt>
                    <dd>{honestDate(evaluation.evaluation_date)}</dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Referências vencidas encontradas</dt>
                    <dd>{count(evaluation.facts?.documents_expired)}</dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Marcadas como vencidas agora</dt>
                    <dd>{count(evaluation.facts?.documents_marked_vencida)}</dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Marcadas como a vencer</dt>
                    <dd>{count(evaluation.facts?.documents_marked_a_vencer)}</dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Tarefas criadas</dt>
                    <dd>{count(evaluation.facts?.tasks_created)}</dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Tarefas que já existiam</dt>
                    <dd>{count(evaluation.facts?.tasks_already_existing)}</dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Recusado por falha fechada</dt>
                    <dd>
                      {evaluation.facts?.failed_closed?.length
                        ? failedClosedList(evaluation.facts.failed_closed)
                        : "Nenhuma recusa nesta execução"}
                    </dd>
                  </div>
                </dl>
                <p className={styles.footnote}>
                  Estes contadores são do servidor. Um zero aqui é um zero verdadeiro da avaliação, não
                  um preenchimento da tela.
                </p>
              </div>
            ) : null}

            <h2 className={styles.panelTitle}>Tarefas geradas por vencimento</h2>
            {tasks.phase === "loading" ? (
              <UiState variant="loading" title="Lendo as tarefas de vencimento…" detail="Nada é exibido antes de a leitura terminar." />
            ) : null}
            {tasks.phase === "failed"
              ? renderReadFailure(
                  tasks.error,
                  () => void loadTasks(),
                  "compliance-tasks-error",
                  "Isto não significa que não existam tarefas de vencimento.",
                )
              : null}
            {tasks.phase === "ready" && taskItems.length === 0 ? (
              <UiState
                variant="empty"
                title="A leitura funcionou e nenhuma tarefa de vencimento está registrada."
                detail="Ausência de tarefa não é zero risco: pode significar que a avaliação temporal ainda não foi executada."
              />
            ) : null}
            {tasks.phase === "ready" && taskItems.length > 0 ? (
              <div className={styles.tableWrap}>
                <table className={styles.table} data-testid="compliance-tasks-table">
                  <caption>
                    Tarefas criadas pela avaliação temporal do servidor, uma por referência, período de
                    validade e regra. Nenhuma tarefa é criada por esta tela.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Período de validade</th>
                      <th scope="col">Regra aplicada</th>
                      <th scope="col">Avaliada em</th>
                      <th scope="col">Prazo</th>
                      <th scope="col">Situação</th>
                      <th scope="col">Conclusão ou justificativa</th>
                      <th scope="col">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taskItems.map(item => (
                      <tr key={item.id}>
                        <th scope="row">{honestText(item.validity_period)}</th>
                        <td>{honestText(item.rule)}</td>
                        <td>{honestDate(item.evaluation_date)}</td>
                        <td>{honestDate(item.due_date)}</td>
                        <td>
                          <UiBadge tone={taskStatusTone(item.status)} srPrefix="Situação da tarefa">
                            {taskStatusLabel(item.status)}
                          </UiBadge>
                        </td>
                        <td>{honestText(item.completion_result || item.cancellation_justification)}</td>
                        <td>
                          {["concluida", "cancelada"].includes(String(item.status)) ? (
                            <span>Finalizada e imutável</span>
                          ) : (
                            <div className={styles.stackTight}>
                              <label className={styles.field} htmlFor={`task-text-${item.id}`}>
                                Resultado da conclusão ou justificativa do cancelamento
                                <input
                                  id={`task-text-${item.id}`}
                                  value={transitionText[`task-${item.id}`] || ""}
                                  onChange={event =>
                                    setTransitionText({ ...transitionText, [`task-${item.id}`]: event.target.value })
                                  }
                                />
                              </label>
                              <div className={styles.rowWrap}>
                                {item.status === "aberta" ? (
                                  <button type="button" disabled={busy} onClick={() => void taskTransition(item.id, "start")}>
                                    Iniciar
                                  </button>
                                ) : null}
                                <button type="button" disabled={busy} onClick={() => void taskTransition(item.id, "complete")}>
                                  Concluir
                                </button>
                                <button type="button" disabled={busy} onClick={() => void taskTransition(item.id, "cancel")}>
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ) : null}

        {active === "planos" ? (
          <section
            id="compliance-panel-planos"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="compliance-tab-planos"
            className={styles.panel}
            data-testid="compliance-plans"
          >
            <h2 className={styles.panelTitle}>Planos de ação corretivos e preventivos</h2>
            <p className={styles.hint}>
              Tratamento formal de obrigação vencida ou risco identificado. É controle interno
              auditado: a tela não declara conformidade nem produz parecer jurídico.
            </p>
            {plans.phase === "loading" ? (
              <UiState variant="loading" title="Lendo os planos de ação…" detail="Nada é exibido antes de a leitura terminar." />
            ) : null}
            {plans.phase === "failed"
              ? renderReadFailure(
                  plans.error,
                  () => void loadPlans(),
                  "compliance-plans-error",
                  "Isto não significa que não existam planos de ação registrados.",
                )
              : null}
            {plans.phase === "ready" && planItems.length === 0 ? (
              <UiState
                variant="empty"
                title="A leitura funcionou e nenhum plano de ação está registrado."
                detail="Nenhum plano é criado automaticamente; ausência de plano não é ausência de risco."
              />
            ) : null}
            {plans.phase === "ready" && planItems.length > 0 ? (
              <div className={styles.tableWrap}>
                <table className={styles.table} data-testid="compliance-plans-table">
                  <caption>
                    Planos de ação devolvidos pelo servidor, do prazo mais próximo ao mais distante. O
                    prazo é o que foi declarado no registro, nunca calculado por esta tela.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Plano</th>
                      <th scope="col">Tipo</th>
                      <th scope="col">Obrigação</th>
                      <th scope="col">Situação</th>
                      <th scope="col">Prazo declarado</th>
                      <th scope="col">Responsável canônico</th>
                      <th scope="col">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planItems.map(item => (
                      <tr key={item.id}>
                        <th scope="row">{honestText(item.title)}</th>
                        <td>
                          <UiBadge tone={planTypeTone(item.plan_type)} srPrefix="Tipo do plano">
                            {planTypeLabel(item.plan_type)}
                          </UiBadge>
                        </td>
                        <td>{honestText(item.obligation_title)}</td>
                        <td>
                          <UiBadge tone={planStatusTone(item.status)} srPrefix="Situação do plano">
                            {planStatusLabel(item.status)}
                          </UiBadge>
                        </td>
                        <td>{honestDate(item.due_date)}</td>
                        <td>{honestText(item.responsible_name || item.responsible_identity)}</td>
                        <td>
                          <div className={styles.stackTight}>
                            <button type="button" onClick={() => void loadPlanDetail(item.id)}>
                              Ver trilha do plano
                            </button>
                            {["concluido", "cancelado"].includes(String(item.status)) ? (
                              <span>Finalizado e imutável</span>
                            ) : (
                              <>
                                <label className={styles.field} htmlFor={`plan-text-${item.id}`}>
                                  Resultado da conclusão ou justificativa do cancelamento
                                  <input
                                    id={`plan-text-${item.id}`}
                                    value={transitionText[`plan-${item.id}`] || ""}
                                    onChange={event =>
                                      setTransitionText({ ...transitionText, [`plan-${item.id}`]: event.target.value })
                                    }
                                  />
                                </label>
                                <div className={styles.rowWrap}>
                                  {item.status === "aberto" ? (
                                    <button type="button" disabled={busy} onClick={() => void planTransition(item.id, "start")}>
                                      Iniciar
                                    </button>
                                  ) : null}
                                  <button type="button" disabled={busy} onClick={() => void planTransition(item.id, "complete")}>
                                    Concluir
                                  </button>
                                  <button type="button" disabled={busy} onClick={() => void planTransition(item.id, "cancel")}>
                                    Cancelar
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {planDetail ? (
              <div className={styles.sectionCard} data-testid="compliance-plan-detail">
                <h3>Trilha imutável do plano</h3>
                {planDetail.phase === "loading" ? (
                  <UiState variant="loading" title="Lendo a trilha do plano…" />
                ) : null}
                {planDetail.phase === "failed" ? (
                  <div data-testid="compliance-plan-detail-error">
                    <UiState
                      variant={complianceErrorVariant(planDetail.error)}
                      title={planDetail.error.title}
                      detail={`${planDetail.error.detail} Isto não significa que o plano não tenha histórico. ${complianceErrorFootnote(planDetail.error)}`}
                    />
                  </div>
                ) : null}
                {planDetail.phase === "ready" ? (
                  <>
                    <dl className={styles.facts}>
                      <div className={styles.metaLine}>
                        <dt>Causa raiz declarada</dt>
                        <dd>{honestText(planDetail.data.action_plan.root_cause)}</dd>
                      </div>
                      <div className={styles.metaLine}>
                        <dt>Resultado da conclusão</dt>
                        <dd>{honestText(planDetail.data.action_plan.completion_result)}</dd>
                      </div>
                      <div className={styles.metaLine}>
                        <dt>Justificativa do cancelamento</dt>
                        <dd>{honestText(planDetail.data.action_plan.cancellation_justification)}</dd>
                      </div>
                      <div className={styles.metaLine}>
                        <dt>Iniciado em</dt>
                        <dd>{planDetail.data.action_plan.started_at ? honestDateTime(planDetail.data.action_plan.started_at) : "Início pendente"}</dd>
                      </div>
                      <div className={styles.metaLine}>
                        <dt>Concluído em</dt>
                        <dd>{planDetail.data.action_plan.completed_at ? honestDateTime(planDetail.data.action_plan.completed_at) : "Conclusão pendente"}</dd>
                      </div>
                    </dl>
                    {planDetail.data.events.length === 0 ? (
                      <UiState
                        variant="empty"
                        title="A leitura funcionou e a trilha deste plano ainda não tem evento."
                        detail="Eventos são gravados pelo servidor no momento de cada operação."
                      />
                    ) : (
                      <ul className={styles.scrollList} data-testid="compliance-plan-events">
                        {planDetail.data.events.map(item => (
                          <li key={item.id} className={styles.dividedItem}>
                            <strong>{complianceEventLabel(item.event_type)}</strong>
                            <span className={styles.metaLine}>
                              {honestDateTime(item.created_at)} · {honestText(item.created_by_name || item.created_by_identity)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className={styles.footnote}>
                      A tela traduz o <strong>tipo</strong> do evento. O conteúdo gravado pelo servidor em
                      cada evento é trilha imutável e permanece como foi escrito — área legada declarada,
                      nunca reescrita por apresentação.
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}

            <h2 className={styles.panelTitle}>Registrar plano de ação</h2>
            <form className={styles.stack} onSubmit={createPlan}>
              <div className={styles.fieldRow}>
                <label className={styles.field} htmlFor="plan-obligation">
                  Obrigação vinculada
                  <select id="plan-obligation" required value={planForm.obligation_id}
                    onChange={event => setPlanForm({ ...planForm, obligation_id: event.target.value })}>
                    <option value="">Escolha a obrigação declarada</option>
                    {obligationItems.map(item => (
                      <option key={item.id} value={item.id}>{item.title}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.field} htmlFor="plan-type">
                  Tipo do plano
                  <select id="plan-type" value={planForm.plan_type}
                    onChange={event => setPlanForm({ ...planForm, plan_type: event.target.value })}>
                    <option value="corretivo">{planTypeLabel("corretivo")}</option>
                    <option value="preventivo">{planTypeLabel("preventivo")}</option>
                  </select>
                </label>
              </div>
              <div className={styles.fieldRow}>
                <label className={styles.field} htmlFor="plan-document">
                  Referência vinculada (opcional)
                  <select id="plan-document" value={planForm.document_id}
                    onChange={event => setPlanForm({ ...planForm, document_id: event.target.value })}>
                    <option value="">Sem referência vinculada</option>
                    {documentItems
                      .filter(item => !planForm.obligation_id || item.obligation_id === planForm.obligation_id)
                      .map(item => (
                        <option key={item.id} value={item.id}>
                          {item.protocol} — versão {item.version_no}
                        </option>
                      ))}
                  </select>
                </label>
                <label className={styles.field} htmlFor="plan-task">
                  Tarefa vinculada (opcional)
                  <select id="plan-task" value={planForm.task_id}
                    onChange={event => setPlanForm({ ...planForm, task_id: event.target.value })}>
                    <option value="">Sem tarefa vinculada</option>
                    {taskItems
                      .filter(item => !planForm.obligation_id || item.obligation_id === planForm.obligation_id)
                      .map(item => (
                        <option key={item.id} value={item.id}>{item.validity_period}</option>
                      ))}
                  </select>
                </label>
              </div>
              <label className={styles.field} htmlFor="plan-title">
                Título do plano (5 a 200 caracteres)
                <input id="plan-title" required value={planForm.title}
                  onChange={event => setPlanForm({ ...planForm, title: event.target.value })} />
              </label>
              <label className={styles.field} htmlFor="plan-description">
                Descrição das ações (10 a 2000 caracteres)
                <textarea id="plan-description" required value={planForm.description}
                  onChange={event => setPlanForm({ ...planForm, description: event.target.value })} />
              </label>
              <label className={styles.field} htmlFor="plan-root-cause">
                Causa raiz ou fator de risco (opcional, 5 a 2000 caracteres)
                <textarea id="plan-root-cause" value={planForm.root_cause}
                  onChange={event => setPlanForm({ ...planForm, root_cause: event.target.value })} />
              </label>
              <div className={styles.fieldRow}>
                <label className={styles.field} htmlFor="plan-due-date">
                  Prazo declarado
                  <input id="plan-due-date" type="date" required value={planForm.due_date}
                    onChange={event => setPlanForm({ ...planForm, due_date: event.target.value })} />
                </label>
                <label className={styles.field} htmlFor="plan-responsible">
                  Responsável de equipe (opcional; herda o da obrigação)
                  <input id="plan-responsible" value={planForm.responsible_identity}
                    onChange={event => setPlanForm({ ...planForm, responsible_identity: event.target.value })} />
                </label>
              </div>
              <p className={styles.footnote}>
                O prazo é declarado por quem registra; a tela não calcula prazo e não presume data de
                conclusão.
              </p>
              <div className={styles.actions}>
                <button type="submit" disabled={busy}>Registrar plano de ação</button>
              </div>
            </form>
          </section>
        ) : null}

        {active === "agenda" ? (
          <section
            id="compliance-panel-agenda"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="compliance-tab-agenda"
            className={styles.panel}
            data-testid="compliance-schedule"
          >
            <h2 className={styles.panelTitle}>Execução agendada da avaliação temporal</h2>
            <p className={styles.hint}>
              A execução agendada é do processo do servidor e opcional por ambiente. Ligar ou desligar
              não é decisão desta tela nem da API: a leitura aqui apenas observa o estado real e o
              histórico de execuções.
            </p>
            {schedule === null || schedule.phase === "loading" ? (
              <UiState variant="loading" title="Lendo o estado da execução agendada…" detail="Nada é exibido antes de a leitura terminar." />
            ) : null}
            {schedule?.phase === "failed"
              ? renderReadFailure(
                  schedule.error,
                  () => void loadSchedule(),
                  "compliance-schedule-error",
                  "Isto não significa que a execução agendada esteja desligada nem que não existam execuções.",
                )
              : null}
            {schedule?.phase === "ready" ? (
              <>
                <dl className={styles.facts} data-testid="compliance-schedule-state">
                  <div className={styles.metaLine}>
                    <dt>Situação neste processo do servidor</dt>
                    <dd>{schedule.data.enabled ? "Ativada por ambiente" : "Não ativada neste processo"}</dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Intervalo declarado</dt>
                    <dd>
                      {schedule.data.interval_seconds == null
                        ? "Sem intervalo declarado"
                        : `${count(schedule.data.interval_seconds)} segundo(s)`}
                    </dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Identidade executora declarada</dt>
                    <dd>{honestText(schedule.data.actor?.display_name || schedule.data.actor?.id)}</dd>
                  </div>
                </dl>
                {schedule.data.runs.length === 0 ? (
                  <UiState
                    variant="empty"
                    title="A leitura funcionou e nenhuma execução agendada está registrada."
                    detail="Cada execução agendada grava uma linha própria; a ausência de linha significa que nenhuma rodou neste banco."
                  />
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table} data-testid="compliance-runs-table">
                      <caption>Execuções agendadas registradas pelo servidor, da mais recente à mais antiga.</caption>
                      <thead>
                        <tr>
                          <th scope="col">Início</th>
                          <th scope="col">Origem</th>
                          <th scope="col">Resultado</th>
                          <th scope="col">Data avaliada</th>
                          <th scope="col">Término</th>
                          <th scope="col">Identidade executora</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schedule.data.runs.map(item => (
                          <tr key={item.id}>
                            <th scope="row">{honestDateTime(item.started_at)}</th>
                            <td>{runOriginLabel(item.origem)}</td>
                            <td>
                              <UiBadge tone={runStatusTone(item.status)} srPrefix="Resultado da execução">
                                {runStatusLabel(item.status)}
                              </UiBadge>
                            </td>
                            <td>{honestDate(item.evaluation_date)}</td>
                            <td>{item.finished_at ? honestDateTime(item.finished_at) : "Término não registrado"}</td>
                            <td>{honestText(item.actor_display_name || item.actor_identity)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className={styles.footnote}>
                  O campo de erro de cada execução é texto gravado pelo servidor e permanece como área
                  legada declarada: não é reescrito por esta tela.
                </p>
              </>
            ) : null}
          </section>
        ) : null}
      </div>

      <p className={styles.footnote}>
        Áreas legadas declaradas: a leitura legada de documentos
        (<code>/api/ext/compliance-documents</code> e os caminhos equivalentes de RH) continua religada
        no servidor e <strong>não</strong> é consumida por esta tela; a escrita legada responde 410. O
        conteúdo gravado nos eventos e no campo de erro das execuções é histórico imutável e nunca é
        reescrito. Responsável e identidade executora aparecem como o servidor devolve.
      </p>
    </main>
  );
}
