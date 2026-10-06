"use client";

// UX-07 / EXT-06 — apresentação da jornada interna canônica de satisfação.
//
// Esta reescrita é de APRESENTAÇÃO. Nenhum método, corpo, cabeçalho, chave de
// idempotência ou regra de servidor foi alterada. As sub-rotas abaixo foram
// conferidas URL a URL contra o dispatch real de server.mjs (~linhas
// 4385–4393) e contra `src/server/ext-satisfaction-api.mjs`:
//
//   GET  /api/ext/satisfaction/references
//   GET  /api/ext/satisfaction/surveys
//   POST /api/ext/satisfaction/surveys                          (idempotency-key)
//   GET  /api/ext/satisfaction/surveys/{id}
//   POST /api/ext/satisfaction/plans/{id}/{start|complete|cancel} (idempotency-key)
//
// Nenhum endpoint foi inventado e nenhuma rota legada é consumida por esta
// tela: os aliases somente-leitura (`/api/ext/satisfaction-surveys` e os
// `cli-satisfaction-*`) continuam religados no servidor, respondendo 200 na
// leitura e 410 `legacy_mutation_retired` na mutação, sem participar daqui.
//
// CORREÇÃO DE CHAMADA COM EVIDÊNCIA NO SERVIDOR: `handlePlan()` exige
// `note` (3 a 1000) em `start`, `result` (10 a 2000) em `complete` e
// `justification` (10 a 1000) em `cancel`. O protótipo anterior enviava
// `{justification}` também em `start`, o que o servidor recusava com 400
// `note_required` — o botão "Iniciar" nunca funcionou. A tela passou a enviar
// o campo que o servidor realmente lê, preenchido por quem opera.
//
// Quem autoriza continua sendo o servidor: `staffGuard()` exige sessão de
// equipe (401 `unauthorized`), papel aceito (403 `forbidden_role`), origem
// própria na escrita (403 `origin_forbidden`) e identidade em UUID. EXT-06
// não usa permissão granular por grant. O AdminGate da página não foi
// alargado.
//
// A chave de idempotência de cada operação é criada por operação, PRESERVADA
// após falha (e mostrada a quem opera, para repetição segura) e descartada
// apenas no sucesso — contrato herdado do protótipo.

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import UiState from "../../../components/ui/UiState";
import UiBadge from "../../../components/ui/UiBadge";
import styles from "../../../components/ui/UiWorkspace.module.css";
import {
  satisfactionErrorFootnote,
  satisfactionErrorVariant,
  surveyTypeLabel,
  surveyStatusLabel,
  surveyStatusTone,
  methodologyLabel,
  methodologyTone,
  planStatusLabel,
  planStatusTone,
  planOriginLabel,
  planOriginTone,
  surveyOriginLabel,
  surveyOriginTone,
  satisfactionEventLabel,
  satisfactionEventTone,
  actorKindLabel,
  followUpOperatorLabel,
  absenceLabel,
  honestDate,
  honestDateTime,
  honestText,
  honestAverage,
  count,
  scaleLabel,
  triggerRuleSummary,
  factsSummary,
  ABSENT,
  PERIOD_NOT_MEASURED,
  type SatisfactionErrorDescriptor,
} from "../../../lib/satisfaction-vocabulary.mjs";
import { satisfactionRequest } from "../../../lib/satisfaction-request";

type Survey = {
  id: string;
  protocol: string;
  account_name?: string | null;
  client_account_id?: string | null;
  survey_type: string;
  status: string;
  purpose?: string | null;
  methodology?: string | null;
  methodology_source?: string | null;
  scale_min?: number | null;
  scale_max?: number | null;
  reference_start?: string | null;
  reference_end?: string | null;
  response_count?: number | null;
  follow_up_count?: number | null;
  created_at?: string | null;
  responded_at?: string | null;
  origin?: string | null;
};

type SurveyDetailRow = Survey & {
  target_name?: string | null;
  score?: number | null;
  feedback?: string | null;
  follow_up_operator?: string | null;
  follow_up_threshold?: number | null;
  action_plan_pending_reason?: string | null;
  cancellation_justification?: string | null;
};

type Aggregate = {
  source?: string | null;
  period?: { start?: string | null; end?: string | null } | null;
  denominator?: number | null;
  value?: number | string | null;
  absence?: string | null;
};

type SurveyList = {
  surveys?: Survey[];
  aggregate?: Aggregate | null;
  criterion?: string | null;
  empty_state?: string | null;
};

type References = {
  accounts?: Array<{ id: string; display_name?: string | null }>;
  targets?: Array<{ id: string; display_name?: string | null; email?: string | null; client_account_id: string }>;
  staff?: Array<{ id: string; display_name?: string | null; role?: string | null }>;
  sources?: string[];
};

type ResponseRow = {
  id: string;
  score?: number | null;
  feedback?: string | null;
  responded_at?: string | null;
};

type PlanRow = {
  id: string;
  status: string;
  action?: string | null;
  origin?: string | null;
  due_date?: string | null;
  responsible_display_name?: string | null;
  responsible_name?: string | null;
  trigger_rule?: unknown;
  facts_json?: unknown;
  completion_result?: string | null;
  cancellation_justification?: string | null;
  created_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
};

type EventRow = {
  id: string;
  event_type: string;
  actor_kind?: string | null;
  payload?: unknown;
  created_at?: string | null;
};

type Detail = {
  survey: SurveyDetailRow;
  responses: ResponseRow[];
  action_plans: PlanRow[];
  events: EventRow[];
};

/** Estado honesto de uma leitura independente: nunca confunde os quatro casos. */
type Load<T> =
  | { phase: "loading" }
  | { phase: "ready"; data: T }
  | { phase: "failed"; error: SatisfactionErrorDescriptor };

const TABS = [
  { id: "pesquisas", label: "Pesquisas e indicador" },
  { id: "configurar", label: "Configurar pesquisa" },
  { id: "respostas", label: "Respostas da pesquisa" },
  { id: "acompanhamento", label: "Acompanhamento e trilha" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const SURVEY_TYPES = ["pos_atendimento", "periodica", "outro"] as const;
const METHODOLOGIES = ["generica", "nps", "csat"] as const;

const EMPTY_FORM = {
  client_account_id: "",
  target_identity_id: "",
  survey_type: "pos_atendimento",
  purpose: "",
  methodology: "generica",
  methodology_source: "",
  scale_min: "0",
  scale_max: "10",
  follow_up_threshold: "6",
  reference_start: "",
  reference_end: "",
};

export default function SatisfacaoWorkspace() {
  const [active, setActive] = useState<TabId>("pesquisas");
  const [list, setList] = useState<Load<SurveyList>>({ phase: "loading" });
  const [references, setReferences] = useState<Load<References>>({ phase: "loading" });
  const [detail, setDetail] = useState<Load<Detail> | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [transitionText, setTransitionText] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<SatisfactionErrorDescriptor | null>(null);
  const [preservedKey, setPreservedKey] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Contrato herdado: a chave de idempotência de cada operação é preservada
  // após falha, para a repetição ser segura, e só é descartada após sucesso.
  const keys = useRef<Record<string, string>>({});

  const loadList = useCallback(async () => {
    setList({ phase: "loading" });
    const result = await satisfactionRequest<SurveyList>("/api/ext/satisfaction/surveys");
    if (!result.ok) {
      // Falha de leitura é estado próprio. A lista anterior NÃO é mantida nem
      // substituída por uma lista vazia, e nenhum indicador é renderizado.
      setList({ phase: "failed", error: result.error });
      return;
    }
    setList({ phase: "ready", data: result.data || {} });
  }, []);

  const loadReferences = useCallback(async () => {
    setReferences({ phase: "loading" });
    const result = await satisfactionRequest<References>("/api/ext/satisfaction/references");
    if (!result.ok) {
      setReferences({ phase: "failed", error: result.error });
      return;
    }
    setReferences({ phase: "ready", data: result.data || {} });
  }, []);

  const inspect = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetail({ phase: "loading" });
    const result = await satisfactionRequest<Detail>(`/api/ext/satisfaction/surveys/${id}`);
    if (!result.ok) {
      setDetail({ phase: "failed", error: result.error });
      return;
    }
    setDetail({ phase: "ready", data: result.data });
  }, []);

  useEffect(() => {
    void loadList();
    void loadReferences();
  }, [loadList, loadReferences]);

  /**
   * Toda escrita passa aqui. A URL, o método, o corpo e o cabeçalho de
   * idempotência são exatamente os do servidor; em falha a chave é preservada
   * (`keys.current[op]=key` permanece) e mostrada a quem opera, e a repetição
   * reaproveita a mesma chave — o servidor devolve replay em vez de duplicar
   * efeito.
   */
  const mutate = async <T,>(op: string, url: string, payload: unknown): Promise<T | null> => {
    const key = keys.current[op] || `ext06-${op}-${crypto.randomUUID()}`;
    keys.current[op]=key;
    setBusy(true);
    setActionError(null);
    setPreservedKey("");
    setNotice("");
    const result = await satisfactionRequest<T>(url, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!result.ok) {
      // O servidor acrescenta informação estruturada junto do código em
      // alguns casos (`canonical` em `legacy_mutation_retired`). O código
      // canônico NÃO é alterado.
      const extra =
        result.payload && typeof result.payload === "object"
          ? (result.payload as { canonical?: unknown; hint?: unknown; detail?: unknown })
          : {};
      const complement = [extra.hint, extra.detail, extra.canonical]
        .filter(value => typeof value === "string")
        .join(" ");
      setActionError(
        complement ? { ...result.error, detail: `${result.error.detail} ${complement}` } : result.error,
      );
      setPreservedKey(key);
      return null;
    }
    delete keys.current[op];
    return result.data;
  };

  const createSurvey = async (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      ...form,
      scale_min: Number(form.scale_min),
      scale_max: Number(form.scale_max),
      follow_up_threshold: Number(form.follow_up_threshold),
      reference_start: form.reference_start || null,
      reference_end: form.reference_end || null,
    };
    const data = await mutate<{ survey: Survey }>("create", "/api/ext/satisfaction/surveys", payload);
    if (!data?.survey) return;
    setForm(EMPTY_FORM);
    setNotice(`Pesquisa ${honestText(data.survey.protocol)} confirmada pelo servidor. Nada aparece aqui antes da confirmação canônica.`);
    await loadList();
    await inspect(data.survey.id);
    setActive("respostas");
  };

  const planTransition = async (id: string, op: "start" | "complete" | "cancel") => {
    // O texto vem de campo rotulado preenchido por quem opera. A tela não
    // escreve resultado nem justificativa no lugar de ninguém: sem texto, o
    // servidor recusa com `note_required`/`result_required`/
    // `justification_required`, e a recusa é mostrada como veio.
    const typed = transitionText[`plan-${id}`] || "";
    const body =
      op === "complete" ? { result: typed }
      : op === "cancel" ? { justification: typed }
      : { note: typed };
    const data = await mutate(`${id}-${op}`, `/api/ext/satisfaction/plans/${id}/${op}`, body);
    if (!data) return;
    setTransitionText(current => ({ ...current, [`plan-${id}`]: "" }));
    setNotice("Acompanhamento alterado somente após confirmação do servidor.");
    await loadList();
    if (selectedId) await inspect(selectedId);
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
    error: SatisfactionErrorDescriptor,
    retry: () => void,
    testId: string,
    negacao: string,
  ) => (
    <div data-testid={testId}>
      <UiState
        variant={satisfactionErrorVariant(error)}
        title={error.title}
        detail={`${error.detail} ${negacao} Menu não é autorização: abrir esta tela não substitui a decisão do servidor. ${satisfactionErrorFootnote(error)}`}
        onRetry={error.canRetry ? retry : undefined}
        retryLabel="Tentar a leitura de novo"
      />
    </div>
  );

  const surveys = list.phase === "ready" && Array.isArray(list.data.surveys) ? list.data.surveys : [];
  const aggregate = list.phase === "ready" ? list.data.aggregate || null : null;
  const accounts = references.phase === "ready" && Array.isArray(references.data.accounts) ? references.data.accounts : [];
  const targets = references.phase === "ready" && Array.isArray(references.data.targets) ? references.data.targets : [];
  const scopedTargets = targets.filter(target => target.client_account_id === form.client_account_id);

  return (
    <main className={styles.workspace} data-testid="satisfacao-workspace">
      <nav aria-label="Trilha" className={styles.breadcrumbNav}>
        <a href="/admin">Início</a> · <span aria-current="page">Satisfação</span>
      </nav>
      <p className={styles.kicker}>EXT-06</p>
      <h1>Satisfação do cliente e acompanhamento interno</h1>
      <p className={styles.lede} data-testid="satisfacao-honesty">
        Jornada interna de equipe regida pelo critério do servidor:{" "}
        <strong>resposta gera acompanhamento sem expor funcionário</strong>. O portal do cliente
        recebe apenas uma projeção mínima; responsável canônico, fatos, risco de renovação, notas
        internas, tarefa e auditoria permanecem nesta fronteira staff. A tela não inventa nota,
        média, período nem conclusão: o que aparece veio do servidor, e onde não existe dado real
        a tela diz que não existe — nunca mostra zero no lugar.
      </p>
      <p className={styles.hint}>
        Quem pode ler e escrever é decidido pelo servidor: sessão de equipe válida, papel
        autorizado e origem própria, conferidos em <code>src/server/ext-satisfaction-api.mjs</code>{" "}
        antes de qualquer resposta. Abrir esta tela pelo menu não concede acesso nenhum. A
        metodologia é <strong>declarada pela equipe</strong> — chamar algo de NPS ou CSAT aqui é
        uma declaração registrada, não uma certificação de método.
      </p>

      {notice ? <UiState variant="success" title={notice} /> : null}
      {actionError ? (
        <div data-testid="satisfacao-action-error">
          <UiState
            variant={satisfactionErrorVariant(actionError)}
            title={actionError.title}
            detail={`${actionError.detail} ${satisfactionErrorFootnote(actionError)}`}
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

      <div className={styles.tabs} role="tablist" aria-label="Jornada canônica de satisfação">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            id={`satisfacao-tab-${tab.id}`}
            ref={node => { tabRefs.current[index] = node; }}
            type="button"
            role="tab"
            className={active === tab.id ? styles.tabActive : styles.tab}
            aria-selected={active === tab.id}
            aria-controls={`satisfacao-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={event => onTabKey(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.tabPanel}>
        {active === "pesquisas" ? (
          <section
            id="satisfacao-panel-pesquisas"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="satisfacao-tab-pesquisas"
            className={styles.panel}
            data-testid="satisfacao-surveys"
          >
            <h2 className={styles.panelTitle}>Pesquisas canônicas registradas</h2>
            {list.phase === "loading" ? (
              <UiState variant="loading" title="Lendo as pesquisas canônicas…" detail="Nada é exibido antes de a leitura terminar." />
            ) : null}
            {list.phase === "failed"
              ? renderReadFailure(
                  list.error,
                  () => void loadList(),
                  "satisfacao-surveys-error",
                  "Isto não significa que não existam pesquisas registradas.",
                )
              : null}
            {list.phase === "ready" && surveys.length === 0 ? (
              <UiState
                variant="empty"
                title="A leitura funcionou e nenhuma pesquisa canônica está registrada."
                detail={honestText(list.data.empty_state)}
              />
            ) : null}
            {list.phase === "ready" && surveys.length > 0 ? (
              <>
                {/* Indicadores só existem depois da leitura concluída: nunca
                    aparecem como zero durante carregamento ou falha. */}
                <ul className={styles.metrics} data-testid="satisfacao-survey-metrics">
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>{count(surveys.length)}</span>
                    <span className={styles.metricLabel}>Pesquisas lidas nesta consulta</span>
                  </li>
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>
                      {count(surveys.filter(item => item.status === "em_acao").length)}
                    </span>
                    <span className={styles.metricLabel}>Com acompanhamento em curso no servidor</span>
                  </li>
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>
                      {count(surveys.filter(item => item.status === "pendente").length)}
                    </span>
                    <span className={styles.metricLabel}>Ainda aguardando resposta do cliente</span>
                  </li>
                </ul>
                <div className={styles.tableWrap}>
                  <table className={styles.table} data-testid="satisfacao-surveys-table">
                    <caption>
                      Pesquisas da jornada canônica, da mais recente à mais antiga. Situação,
                      contagem de respostas e de acompanhamentos vêm do servidor; nada é contado
                      nesta tela.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Protocolo</th>
                        <th scope="col">Conta do cliente</th>
                        <th scope="col">Tipo</th>
                        <th scope="col">Metodologia declarada</th>
                        <th scope="col">Escala</th>
                        <th scope="col">Situação</th>
                        <th scope="col">Respostas</th>
                        <th scope="col">Acompanhamentos</th>
                        <th scope="col">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {surveys.map(item => (
                        <tr key={item.id}>
                          <th scope="row">{honestText(item.protocol)}</th>
                          <td>{honestText(item.account_name)}</td>
                          <td>{surveyTypeLabel(item.survey_type)}</td>
                          <td>
                            <UiBadge tone={methodologyTone(item.methodology)} srPrefix="Metodologia declarada">
                              {methodologyLabel(item.methodology)}
                            </UiBadge>
                          </td>
                          <td>{scaleLabel(item.scale_min, item.scale_max)}</td>
                          <td>
                            <UiBadge tone={surveyStatusTone(item.status)} srPrefix="Situação da pesquisa">
                              {surveyStatusLabel(item.status)}
                            </UiBadge>
                          </td>
                          <td>{count(item.response_count)}</td>
                          <td>{count(item.follow_up_count)}</td>
                          <td>
                            <button type="button" onClick={() => { void inspect(item.id); setActive("respostas"); }}>
                              Ver respostas e acompanhamento
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {list.phase === "ready" ? (
              <div className={styles.sectionCard} data-testid="satisfacao-aggregate">
                <div className={styles.padded}>
                  <h3 className={styles.panelTitle}>Indicador agregado, como o servidor o calcula</h3>
                  <dl className={styles.facts}>
                    <div className={styles.metaLine}>
                      <dt>Fonte declarada do indicador</dt>
                      <dd>{honestText(aggregate?.source)}</dd>
                    </div>
                    <div className={styles.metaLine}>
                      <dt>Respostas no denominador</dt>
                      <dd>{count(aggregate?.denominator)}</dd>
                    </div>
                    <div className={styles.metaLine}>
                      <dt>Média das notas</dt>
                      <dd>
                        {aggregate?.absence
                          ? absenceLabel(aggregate.absence)
                          : honestAverage(aggregate?.value)}
                      </dd>
                    </div>
                    <div className={styles.metaLine}>
                      <dt>Período apurado</dt>
                      <dd>
                        {aggregate?.period?.start || aggregate?.period?.end
                          ? `${honestDateTime(aggregate?.period?.start)} até ${honestDateTime(aggregate?.period?.end)}`
                          : PERIOD_NOT_MEASURED}
                      </dd>
                    </div>
                    <div className={styles.metaLine}>
                      <dt>Critério declarado pelo servidor</dt>
                      <dd>{honestText(list.data.criterion)}</dd>
                    </div>
                  </dl>
                  <p className={styles.footnote}>
                    Um denominador zero aqui é um zero verdadeiro do servidor, não preenchimento
                    desta tela. Sem resposta registrada não existe média: o servidor nomeia a
                    ausência e ela é exibida como veio, nunca como <code>0</code> ou <code>0%</code>.
                  </p>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {active === "configurar" ? (
          <section
            id="satisfacao-panel-configurar"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="satisfacao-tab-configurar"
            className={styles.panel}
            data-testid="satisfacao-references"
          >
            <h2 className={styles.panelTitle}>Configurar pesquisa</h2>
            <p className={styles.hint}>
              Conta e destinatário saem das referências canônicas do servidor: só aparece quem tem
              concessão de acesso ativa na conta. A tela não digita identidade nem inventa
              destinatário.
            </p>
            {references.phase === "loading" ? (
              <UiState variant="loading" title="Lendo as referências canônicas…" detail="Nada é exibido antes de a leitura terminar." />
            ) : null}
            {references.phase === "failed"
              ? renderReadFailure(
                  references.error,
                  () => void loadReferences(),
                  "satisfacao-references-error",
                  "Isto não significa que não existam contas ou destinatários autorizados.",
                )
              : null}
            {references.phase === "ready" && accounts.length === 0 ? (
              <UiState
                variant="empty"
                title="A leitura funcionou e nenhuma conta ativa de cliente está disponível."
                detail="Sem conta ativa com concessão de acesso não existe destinatário possível, e o servidor recusaria a criação. Nenhuma conta é criada por esta tela."
              />
            ) : null}
            {references.phase === "ready" && accounts.length > 0 ? (
              <form className={styles.stack} onSubmit={createSurvey} data-testid="satisfacao-create-form">
                <p className={styles.requiredNote}>Todos os campos marcados são exigidos pelo servidor.</p>
                <div className={styles.fieldRow}>
                  <label className={styles.field} htmlFor="survey-account">
                    Conta do cliente (obrigatório)
                    <select
                      id="survey-account"
                      required
                      value={form.client_account_id}
                      onChange={event => setForm({ ...form, client_account_id: event.target.value, target_identity_id: "" })}
                    >
                      <option value="">Escolha a conta</option>
                      {accounts.map(account => (
                        <option key={account.id} value={account.id}>{honestText(account.display_name)}</option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field} htmlFor="survey-target">
                    Destinatário com concessão ativa (obrigatório)
                    <select
                      id="survey-target"
                      required
                      value={form.target_identity_id}
                      onChange={event => setForm({ ...form, target_identity_id: event.target.value })}
                    >
                      <option value="">Escolha o destinatário</option>
                      {scopedTargets.map(target => (
                        <option key={target.id} value={target.id}>{honestText(target.display_name || target.email)}</option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field} htmlFor="survey-type">
                    Tipo da pesquisa
                    <select
                      id="survey-type"
                      value={form.survey_type}
                      onChange={event => setForm({ ...form, survey_type: event.target.value })}
                    >
                      {SURVEY_TYPES.map(value => (
                        <option key={value} value={value}>{surveyTypeLabel(value)}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className={styles.field} htmlFor="survey-purpose">
                  Finalidade declarada (5 a 500 caracteres, obrigatório)
                  <textarea
                    id="survey-purpose"
                    required
                    value={form.purpose}
                    onChange={event => setForm({ ...form, purpose: event.target.value })}
                  />
                </label>
                <div className={styles.fieldRow}>
                  <label className={styles.field} htmlFor="survey-methodology">
                    Metodologia declarada
                    <select
                      id="survey-methodology"
                      value={form.methodology}
                      onChange={event => {
                        const methodology = event.target.value;
                        setForm({
                          ...form,
                          methodology,
                          scale_min: methodology === "csat" ? "1" : "0",
                          scale_max: methodology === "csat" ? "5" : "10",
                        });
                      }}
                    >
                      {METHODOLOGIES.map(value => (
                        <option key={value} value={value}>{methodologyLabel(value)}</option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field} htmlFor="survey-methodology-source">
                    Fonte da metodologia declarada (5 a 500 caracteres, obrigatório)
                    <input
                      id="survey-methodology-source"
                      required
                      value={form.methodology_source}
                      onChange={event => setForm({ ...form, methodology_source: event.target.value })}
                    />
                  </label>
                </div>
                <div className={styles.fieldRow}>
                  <label className={styles.field} htmlFor="survey-scale-min">
                    Nota mínima da escala
                    <input
                      id="survey-scale-min"
                      type="number"
                      value={form.scale_min}
                      onChange={event => setForm({ ...form, scale_min: event.target.value })}
                    />
                  </label>
                  <label className={styles.field} htmlFor="survey-scale-max">
                    Nota máxima da escala
                    <input
                      id="survey-scale-max"
                      type="number"
                      value={form.scale_max}
                      onChange={event => setForm({ ...form, scale_max: event.target.value })}
                    />
                  </label>
                  <label className={styles.field} htmlFor="survey-threshold">
                    Limiar declarado do acompanhamento (nota menor ou igual)
                    <input
                      id="survey-threshold"
                      type="number"
                      value={form.follow_up_threshold}
                      onChange={event => setForm({ ...form, follow_up_threshold: event.target.value })}
                    />
                  </label>
                </div>
                <div className={styles.fieldRow}>
                  <label className={styles.field} htmlFor="survey-reference-start">
                    Início da janela de referência (opcional)
                    <input
                      id="survey-reference-start"
                      type="date"
                      value={form.reference_start}
                      onChange={event => setForm({ ...form, reference_start: event.target.value })}
                    />
                  </label>
                  <label className={styles.field} htmlFor="survey-reference-end">
                    Fim da janela de referência (opcional)
                    <input
                      id="survey-reference-end"
                      type="date"
                      value={form.reference_end}
                      onChange={event => setForm({ ...form, reference_end: event.target.value })}
                    />
                  </label>
                </div>
                <p className={styles.footnote}>
                  A janela de referência é opcional, mas é tudo ou nada: com início é preciso fim, e
                  o fim não pode ser anterior ao início. NPS exige escala de 0 a 10 e CSAT exige
                  escala de 1 a 5 — quem valida é o servidor, e a recusa aparece aqui com o código
                  canônico.
                </p>
                <div className={styles.actions}>
                  <button type="submit" className={styles.primary} disabled={busy}>Criar pesquisa canônica</button>
                </div>
              </form>
            ) : null}
          </section>
        ) : null}

        {active === "respostas" ? (
          <section
            id="satisfacao-panel-respostas"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="satisfacao-tab-respostas"
            className={styles.panel}
            data-testid="satisfacao-detail"
          >
            <h2 className={styles.panelTitle}>Respostas da pesquisa selecionada</h2>
            {detail === null ? (
              <UiState
                variant="empty"
                title="Nenhuma pesquisa selecionada ainda."
                detail="Escolha uma pesquisa em “Pesquisas e indicador” para ler o detalhe canônico. Nada é carregado por antecipação."
              />
            ) : null}
            {detail?.phase === "loading" ? (
              <UiState variant="loading" title="Lendo o detalhe canônico da pesquisa…" detail="Nada é exibido antes de a leitura terminar." />
            ) : null}
            {detail?.phase === "failed"
              ? renderReadFailure(
                  detail.error,
                  () => void inspect(selectedId),
                  "satisfacao-detail-error",
                  "Isto não significa que a pesquisa não exista nem que ela esteja sem respostas.",
                )
              : null}
            {detail?.phase === "ready" ? (
              <>
                <dl className={styles.facts} data-testid="satisfacao-detail-facts">
                  <div className={styles.metaLine}>
                    <dt>Protocolo</dt>
                    <dd>{honestText(detail.data.survey.protocol)}</dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Conta do cliente</dt>
                    <dd>{honestText(detail.data.survey.account_name)}</dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Destinatário registrado</dt>
                    <dd>{honestText(detail.data.survey.target_name)}</dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Situação</dt>
                    <dd>
                      <UiBadge tone={surveyStatusTone(detail.data.survey.status)} srPrefix="Situação da pesquisa">
                        {surveyStatusLabel(detail.data.survey.status)}
                      </UiBadge>
                    </dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Origem do registro</dt>
                    <dd>
                      <UiBadge tone={surveyOriginTone(detail.data.survey.origin)} srPrefix="Origem do registro">
                        {surveyOriginLabel(detail.data.survey.origin)}
                      </UiBadge>
                    </dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Finalidade declarada</dt>
                    <dd>{honestText(detail.data.survey.purpose)}</dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Metodologia declarada</dt>
                    <dd>{methodologyLabel(detail.data.survey.methodology)}</dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Fonte da metodologia</dt>
                    <dd>{honestText(detail.data.survey.methodology_source)}</dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Escala declarada</dt>
                    <dd>{scaleLabel(detail.data.survey.scale_min, detail.data.survey.scale_max)}</dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Regra do acompanhamento</dt>
                    <dd>
                      {detail.data.survey.follow_up_threshold == null
                        ? ABSENT
                        : `${followUpOperatorLabel(detail.data.survey.follow_up_operator)} (limiar ${count(detail.data.survey.follow_up_threshold)})`}
                    </dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Janela de referência</dt>
                    <dd>
                      {detail.data.survey.reference_start || detail.data.survey.reference_end
                        ? `${honestDate(detail.data.survey.reference_start)} até ${honestDate(detail.data.survey.reference_end)}`
                        : "Sem janela de referência declarada"}
                    </dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Resposta registrada em</dt>
                    <dd>
                      {detail.data.survey.responded_at
                        ? honestDateTime(detail.data.survey.responded_at)
                        : "Resposta ainda não registrada"}
                    </dd>
                  </div>
                  <div className={styles.metaLine}>
                    <dt>Motivo de acompanhamento pendente</dt>
                    <dd>
                      {honestText(detail.data.survey.action_plan_pending_reason) === ABSENT
                        ? "Nenhum impedimento registrado pelo servidor"
                        : honestText(detail.data.survey.action_plan_pending_reason)}
                    </dd>
                  </div>
                </dl>

                <h3 className={styles.knowledgeSubheading}>Respostas recebidas (detalhe interno de equipe)</h3>
                {detail.data.responses.length === 0 ? (
                  <UiState
                    variant="empty"
                    title="A leitura funcionou e nenhuma resposta foi registrada nesta pesquisa."
                    detail="A resposta só existe quando o cliente responde pelo portal; a equipe não responde no lugar dele e a tela não simula nota."
                  />
                ) : (
                  <ul className={styles.knowledgeList} data-testid="satisfacao-responses">
                    {detail.data.responses.map(response => (
                      <li key={response.id} className={styles.knowledgeListItem}>
                        <strong>Nota {count(response.score)} na escala declarada {scaleLabel(detail.data.survey.scale_min, detail.data.survey.scale_max)}</strong>
                        <span>{honestText(response.feedback)}</span>
                        <span>Registrada em {honestDateTime(response.responded_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className={styles.footnote}>
                  A resposta é imutável no banco: nem a equipe nem esta tela reescrevem nota ou
                  comentário depois de registrados.
                </p>
              </>
            ) : null}
          </section>
        ) : null}

        {active === "acompanhamento" ? (
          <section
            id="satisfacao-panel-acompanhamento"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="satisfacao-tab-acompanhamento"
            className={styles.panel}
            data-testid="satisfacao-followup"
          >
            <h2 className={styles.panelTitle}>Acompanhamento e recuperação</h2>
            <p className={styles.hint}>
              O acompanhamento nasce da regra declarada na própria pesquisa quando a nota recebida
              atinge o limiar. Responsável canônico, fatos e trilha ficam nesta fronteira staff e
              não são projetados para o portal do cliente.
            </p>
            {detail === null ? (
              <UiState
                variant="empty"
                title="Nenhuma pesquisa selecionada ainda."
                detail="Escolha uma pesquisa em “Pesquisas e indicador” para ler o acompanhamento canônico."
              />
            ) : null}
            {detail?.phase === "loading" ? (
              <UiState variant="loading" title="Lendo o acompanhamento canônico…" detail="Nada é exibido antes de a leitura terminar." />
            ) : null}
            {detail?.phase === "failed"
              ? renderReadFailure(
                  detail.error,
                  () => void inspect(selectedId),
                  "satisfacao-followup-error",
                  "Isto não significa que não existam acompanhamentos abertos.",
                )
              : null}
            {detail?.phase === "ready" ? (
              <>
                {detail.data.action_plans.length === 0 ? (
                  <UiState
                    variant="empty"
                    title="A leitura funcionou e nenhum acompanhamento foi aberto para esta pesquisa."
                    detail="O acompanhamento só é criado quando a regra declarada é atingida e a conta tem responsável canônico ativo. Ausência de acompanhamento não é prova de satisfação."
                  />
                ) : (
                  <div className={styles.cards} data-testid="satisfacao-plans">
                    {detail.data.action_plans.map(plan => {
                      const terminal = plan.status === "concluida" || plan.status === "cancelada";
                      const field = `plan-${plan.id}`;
                      return (
                        <article key={plan.id} className={styles.card}>
                          <h3 className={styles.cardTitle}>{honestText(plan.action)}</h3>
                          <div className={styles.badgeRow}>
                            <UiBadge tone={planStatusTone(plan.status)} srPrefix="Situação do acompanhamento">
                              {planStatusLabel(plan.status)}
                            </UiBadge>
                            <UiBadge tone={planOriginTone(plan.origin)} srPrefix="Origem do acompanhamento">
                              {planOriginLabel(plan.origin)}
                            </UiBadge>
                          </div>
                          <dl className={styles.facts}>
                            <div className={styles.metaLine}>
                              <dt>Responsável canônico</dt>
                              <dd>
                                {honestText(plan.responsible_display_name) === ABSENT
                                  ? "Sem responsável canônico ativo (o servidor falha fechado)"
                                  : honestText(plan.responsible_display_name)}
                              </dd>
                            </div>
                            <div className={styles.metaLine}>
                              <dt>Prazo registrado</dt>
                              <dd>{honestDate(plan.due_date)}</dd>
                            </div>
                            <div className={styles.metaLine}>
                              <dt>Regra que disparou</dt>
                              <dd>{triggerRuleSummary(plan.trigger_rule)}</dd>
                            </div>
                            <div className={styles.metaLine}>
                              <dt>Fatos registrados</dt>
                              <dd>{factsSummary(plan.facts_json)}</dd>
                            </div>
                            <div className={styles.metaLine}>
                              <dt>Início</dt>
                              <dd>{plan.started_at ? honestDateTime(plan.started_at) : "Início pendente"}</dd>
                            </div>
                            <div className={styles.metaLine}>
                              <dt>Conclusão</dt>
                              <dd>{plan.completed_at ? honestDateTime(plan.completed_at) : "Conclusão pendente"}</dd>
                            </div>
                            <div className={styles.metaLine}>
                              <dt>Resultado registrado</dt>
                              <dd>{honestText(plan.completion_result)}</dd>
                            </div>
                            <div className={styles.metaLine}>
                              <dt>Justificativa de cancelamento</dt>
                              <dd>{honestText(plan.cancellation_justification)}</dd>
                            </div>
                          </dl>
                          {terminal ? (
                            <p className={styles.metaBlock}>
                              Finalizado e imutável: o servidor e o banco recusam reabrir
                              acompanhamento concluído ou cancelado.
                            </p>
                          ) : (
                            <>
                              <label className={styles.field} htmlFor={`${field}-text`}>
                                Registro desta operação, escrito por quem opera
                                <textarea
                                  id={`${field}-text`}
                                  value={transitionText[field] || ""}
                                  onChange={event => setTransitionText(current => ({ ...current, [field]: event.target.value }))}
                                />
                              </label>
                              <p className={styles.hint}>
                                O servidor valida o tamanho: nota de início de 3 a 1000 caracteres,
                                resultado da conclusão de 10 a 2000 e justificativa do cancelamento
                                de 10 a 1000. A tela não escreve este texto no seu lugar.
                              </p>
                              <div className={styles.actions}>
                                {plan.status === "aberta" ? (
                                  <button type="button" disabled={busy} onClick={() => void planTransition(plan.id, "start")}>
                                    Iniciar com nota registrada
                                  </button>
                                ) : null}
                                <button type="button" disabled={busy} onClick={() => void planTransition(plan.id, "complete")}>
                                  Concluir com resultado registrado
                                </button>
                                <button type="button" disabled={busy} onClick={() => void planTransition(plan.id, "cancel")}>
                                  Cancelar com justificativa registrada
                                </button>
                              </div>
                            </>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}

                <h3 className={styles.knowledgeSubheading}>Trilha imutável da pesquisa</h3>
                {detail.data.events.length === 0 ? (
                  <UiState
                    variant="empty"
                    title="A leitura funcionou e nenhum evento foi gravado para esta pesquisa."
                    detail="A trilha é append-only: ela só cresce quando o servidor confirma um ato."
                  />
                ) : (
                  <ul className={styles.knowledgeList} data-testid="satisfacao-events">
                    {detail.data.events.map(item => (
                      <li key={item.id} className={styles.knowledgeListItem}>
                        <UiBadge tone={satisfactionEventTone(item.event_type)} srPrefix="Evento registrado">
                          {satisfactionEventLabel(item.event_type)}
                        </UiBadge>
                        <span>Autoria: {actorKindLabel(item.actor_kind)} · {honestDateTime(item.created_at)}</span>
                        <span className={styles.metaLine}>
                          Conteúdo técnico do evento, preservado como o servidor gravou (área
                          legada declarada):
                        </span>
                        <pre className={styles.codeBlock}>{JSON.stringify(item.payload ?? null, null, 2)}</pre>
                      </li>
                    ))}
                  </ul>
                )}
                <p className={styles.footnote}>
                  A trilha não é reescrita por esta tela: apenas o tipo do evento é traduzido. O
                  conteúdo gravado permanece como está, declarado como área legada.
                </p>
              </>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
