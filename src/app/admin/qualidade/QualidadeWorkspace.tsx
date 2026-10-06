"use client";

// UX-07 / EXT-05 — apresentação da jornada interna canônica de qualidade.
//
// Esta reescrita é de APRESENTAÇÃO. Nenhum método, corpo, cabeçalho, chave de
// idempotência ou regra de servidor foi alterada:
//
//   GET  /api/ext/quality/nonconformities
//   GET  /api/ext/quality/references
//   GET  /api/ext/quality/nonconformities/{id}
//   POST /api/ext/quality/nonconformities                                (idempotency-key)
//   POST /api/ext/quality/nonconformities/{id}/causes                    (idempotency-key)
//   POST /api/ext/quality/nonconformities/{id}/responsibles/{resp}/actions (idempotency-key)
//   POST /api/ext/quality/nonconformities/{id}/verifications             (idempotency-key)
//   POST /api/ext/quality/nonconformities/{id}/transition                (idempotency-key)
//   POST /api/ext/quality/nonconformities/{id}/close                     (idempotency-key)
//   POST /api/ext/quality/nonconformities/{id}/reopen                    (idempotency-key)
//   POST /api/ext/quality/nonconformities/{id}/recurrences               (idempotency-key)
//   POST /api/ext/quality/actions/{actionId}/complete                    (idempotency-key)
//   POST /api/ext/quality/actions/{actionId}/cancel                      (idempotency-key)
//
// ÚNICA correção de chamada, documentada em docs/UX-07-QUALIDADE-2026-10-06.md:
// o protótipo enviava a criação de ação para
// `/api/ext/quality/nonconformities/{id}/actions` — um caminho que NÃO existe
// em server.mjs (a rota religada real é
// `/nonconformities/{id}/responsibles/{responsavel}/actions`) — e sem o campo
// `action_type` que o servidor exige. O botão antigo nunca funcionou. Esta
// tela chama a rota real, com o payload real; o servidor não mudou.
//
// Quem autoriza continua sendo o servidor (`quality.read`/`quality.write`
// conferidos por grant em auth_permissions com escopo global/organização/conta
// em src/server/ext-quality-api.mjs). O AdminGate da página não foi alargado.
//
// A chave de idempotência preservada após falha é contrato herdado
// (tests/ext05-quality.test.mjs): keys.current[op]=k antes do envio e
// delete keys.current[op] somente após sucesso.

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import UiState from "../../../components/ui/UiState";
import UiBadge from "../../../components/ui/UiBadge";
import styles from "../../../components/ui/UiWorkspace.module.css";
import {
  qualityErrorFootnote,
  qualityErrorVariant,
  closureMissingList,
  ncStatusLabel,
  ncStatusTone,
  severityLabel,
  severityTone,
  actionStatusLabel,
  actionStatusTone,
  verificationOutcomeLabel,
  verificationOutcomeTone,
  qualityOriginLabel,
  qualityOriginTone,
  qualityEventLabel,
  honestDate,
  honestDateTime,
  honestText,
  count,
  ABSENT,
  type QualityErrorDescriptor,
} from "../../../lib/quality-vocabulary.mjs";
import { qualityRequest } from "../../../lib/quality-request";

type NC = {
  id: string;
  protocol: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  origin?: string | null;
  responsible_identity?: string | null;
  client_account_id?: string | null;
  client_name?: string | null;
  recurrence_count_derived?: number | null;
  created_at?: string | null;
  closed_at?: string | null;
  reopened_at?: string | null;
  reopen_justification?: string | null;
};

type StaffRef = { id: string; display_name: string; role: string };

type CauseRow = { id: string; description: string; declared_source: string; registered_at?: string | null };

type ActionRow = {
  id: string;
  action_type?: string | null;
  description: string;
  status: string;
  responsible_identity?: string | null;
  due_date?: string | null;
  due_date_source?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  cancellation_justification?: string | null;
};

type VerificationRow = {
  id: string;
  outcome: string;
  description: string;
  evidence_type: string;
  evidence_reference: string;
  evidence_source: string;
  verified_at?: string | null;
};

type ClosureRow = { id: string; closure_note: string; closed_at?: string | null };
type ReopeningRow = { id: string; justification: string; reopened_at?: string | null };
type RecurrenceRow = {
  id: string;
  predecessor_nonconformity_id: string;
  new_nonconformity_id: string;
  justification: string;
  declared_criterion: string;
  declared_source: string;
  registered_at?: string | null;
};
type EventRow = { id: string; event_type: string; summary: string; created_at?: string | null };

type Detail = {
  nonconformity: NC;
  causes: CauseRow[];
  actions: ActionRow[];
  verifications: VerificationRow[];
  closures: ClosureRow[];
  reopenings: ReopeningRow[];
  recurrences: RecurrenceRow[];
  events: EventRow[];
};

/** Estado honesto de uma leitura independente: nunca confunde os quatro casos. */
type Load<T> =
  | { phase: "loading" }
  | { phase: "ready"; data: T }
  | { phase: "failed"; error: QualityErrorDescriptor };

const TABS = [
  { id: "lista", label: "Não conformidades" },
  { id: "nova", label: "Nova não conformidade" },
  { id: "ciclo", label: "Ciclo de vida e registros" },
  { id: "trilha", label: "Trilha e reincidência" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const SEVERITIES = ["baixa", "media", "alta", "critica"] as const;

const EMPTY_FORM = { title: "", description: "", category: "", severity: "media", client_account_id: "" };
const EMPTY_CAUSE = { description: "", declared_source: "" };
const EMPTY_ACTION = {
  description: "",
  action_type: "corretiva",
  responsible_identity: "",
  due_date: "",
  due_date_source: "",
  due_date_base_date: "",
};
const EMPTY_VERIFICATION = {
  outcome: "eficaz",
  description: "",
  evidence_type: "referencia_documental",
  evidence_reference: "",
  evidence_source: "",
};
const EMPTY_RECURRENCE = {
  title: "",
  description: "",
  category: "",
  severity: "media",
  justification: "",
  declared_criterion: "",
  declared_source: "",
};

export default function QualidadeWorkspace() {
  const [active, setActive] = useState<TabId>("lista");
  const [list, setList] = useState<Load<NC[]>>({ phase: "loading" });
  const [refs, setRefs] = useState<Load<StaffRef[]>>({ phase: "loading" });
  const [detail, setDetail] = useState<Load<Detail> | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [actionError, setActionError] = useState<QualityErrorDescriptor | null>(null);
  const [preservedKey, setPreservedKey] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [cause, setCause] = useState(EMPTY_CAUSE);
  const [action, setAction] = useState(EMPTY_ACTION);
  const [verification, setVerification] = useState(EMPTY_VERIFICATION);
  const [reason, setReason] = useState("");
  const [closureNote, setClosureNote] = useState("");
  const [recurrence, setRecurrence] = useState(EMPTY_RECURRENCE);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Contrato herdado: a chave de idempotência de cada operação é preservada
  // após falha, para a repetição ser segura, e só é descartada após sucesso.
  const keys = useRef<Record<string, string>>({});

  const loadList = useCallback(async () => {
    setList({ phase: "loading" });
    const result = await qualityRequest<{ nonconformities: NC[] }>("/api/ext/quality/nonconformities");
    if (!result.ok) {
      // Falha de leitura é estado próprio. A lista anterior NÃO é mantida nem
      // substituída por uma lista vazia.
      setList({ phase: "failed", error: result.error });
      return;
    }
    setList({ phase: "ready", data: Array.isArray(result.data?.nonconformities) ? result.data.nonconformities : [] });
  }, []);

  const loadRefs = useCallback(async () => {
    setRefs({ phase: "loading" });
    const result = await qualityRequest<{ staff: StaffRef[] }>("/api/ext/quality/references");
    if (!result.ok) {
      setRefs({ phase: "failed", error: result.error });
      return;
    }
    setRefs({ phase: "ready", data: Array.isArray(result.data?.staff) ? result.data.staff : [] });
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetail({ phase: "loading" });
    const result = await qualityRequest<Detail>(`/api/ext/quality/nonconformities/${id}`);
    if (!result.ok) {
      setDetail({ phase: "failed", error: result.error });
      return;
    }
    setDetail({ phase: "ready", data: result.data });
  }, []);

  useEffect(() => {
    void loadList();
    void loadRefs();
  }, [loadList, loadRefs]);

  const openCycle = (id: string) => {
    setActive("ciclo");
    void loadDetail(id);
  };

  /**
   * Toda escrita passa aqui. A URL, o método, o corpo e o cabeçalho de
   * idempotência são exatamente os do servidor; em falha, a chave é
   * preservada (keys.current[op]=k permanece) e a repetição reaproveita a
   * mesma chave — o servidor devolve replay em vez de duplicar efeito.
   */
  const mutate = async <T,>(op: string, url: string, body: unknown): Promise<T | null> => {
    const k = keys.current[op] || `ext05-${op}-${crypto.randomUUID()}`;
    keys.current[op]=k;
    setBusy(true);
    setActionError(null);
    setPreservedKey("");
    setNotice("");
    const result = await qualityRequest<T>(url, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": k },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!result.ok) {
      // `closure_prerequisites_missing` chega com a lista real do servidor;
      // a apresentação traduz os itens sem alterar o código canônico.
      const missing =
        result.payload && typeof result.payload === "object"
          ? (result.payload as { missing?: unknown }).missing
          : undefined;
      const translated = closureMissingList(missing);
      setActionError(
        translated
          ? { ...result.error, detail: `${result.error.detail} Faltou: ${translated}.` }
          : result.error,
      );
      setPreservedKey(k);
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

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const data = await mutate<{ nonconformity: NC }>("create", "/api/ext/quality/nonconformities", form);
    if (!data) return;
    setForm(EMPTY_FORM);
    setActive("ciclo");
    await refresh("Não conformidade confirmada pelo servidor.", data.nonconformity.id);
  };

  const addCause = async () => {
    if (!selectedId) return;
    const data = await mutate("cause-" + selectedId, `/api/ext/quality/nonconformities/${selectedId}/causes`, cause);
    if (!data) return;
    setCause(EMPTY_CAUSE);
    await refresh("Causa histórica confirmada pelo servidor.");
  };

  const addAction = async () => {
    if (!selectedId || !action.responsible_identity) return;
    const { responsible_identity, ...payload } = action;
    const data = await mutate(
      "action-" + selectedId,
      `/api/ext/quality/nonconformities/${selectedId}/responsibles/${responsible_identity}/actions`,
      payload,
    );
    if (!data) return;
    setAction(EMPTY_ACTION);
    await refresh("Ação corretiva confirmada com responsável canônico.");
  };

  const addVerification = async () => {
    if (!selectedId) return;
    const data = await mutate(
      "verification-" + selectedId,
      `/api/ext/quality/nonconformities/${selectedId}/verifications`,
      verification,
    );
    if (!data) return;
    setVerification(EMPTY_VERIFICATION);
    await refresh("Verificação estruturada confirmada; a referência declarada não é upload.");
  };

  const actionTerminal = async (id: string, op: "complete" | "cancel") => {
    const data = await mutate(
      `action-${op}-${id}`,
      `/api/ext/quality/actions/${id}/${op}`,
      op === "complete"
        ? { note: reason || "Conclusão confirmada pela equipe interna." }
        : { justification: reason },
    );
    if (!data) return;
    await refresh(op === "complete" ? "Ação concluída pelo servidor." : "Ação cancelada pelo servidor.");
  };

  const transition = async (status: string) => {
    if (!selectedId) return;
    const data = await mutate(
      `status-${status}-${selectedId}`,
      `/api/ext/quality/nonconformities/${selectedId}/transition`,
      { status, reason },
    );
    if (!data) return;
    setReason("");
    await refresh(`Estado ${ncStatusLabel(status)} confirmado pelo servidor.`);
  };

  const reopen = async () => {
    if (!selectedId) return;
    const data = await mutate(
      `reopen-${selectedId}`,
      `/api/ext/quality/nonconformities/${selectedId}/reopen`,
      { justification: reason },
    );
    if (!data) return;
    setReason("");
    await refresh("Reabertura formal confirmada; o encerramento histórico foi preservado.");
  };

  const close = async (effectiveVerificationId: string) => {
    if (!selectedId) return;
    const data = await mutate(
      `close-${selectedId}`,
      `/api/ext/quality/nonconformities/${selectedId}/close`,
      { verification_id: effectiveVerificationId, closure_note: closureNote },
    );
    if (!data) return;
    setClosureNote("");
    await refresh("Encerramento confirmado com evidência e responsável.");
  };

  const recur = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    const data = await mutate<{ nonconformity: NC }>(
      `recurrence-${selectedId}`,
      `/api/ext/quality/nonconformities/${selectedId}/recurrences`,
      recurrence,
    );
    if (!data) return;
    setRecurrence(EMPTY_RECURRENCE);
    await refresh("Reincidência explícita confirmada; o contador é derivado pelo servidor.", data.nonconformity.id);
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

  const renderReadFailure = (error: QualityErrorDescriptor, retry: () => void, testId: string) => (
    <div data-testid={testId}>
      <UiState
        variant={qualityErrorVariant(error)}
        title={error.title}
        detail={`${error.detail} ${qualityErrorFootnote(error)}`}
        onRetry={error.canRetry ? retry : undefined}
        retryLabel="Tentar a leitura de novo"
      />
    </div>
  );

  const items = list.phase === "ready" ? list.data : [];
  const staff = refs.phase === "ready" ? refs.data : [];
  const selected = detail?.phase === "ready" ? detail.data : null;
  const nc = selected?.nonconformity ?? null;
  const lastEffective = selected
    ? [...selected.verifications].filter(item => item.outcome === "eficaz").at(-1) ?? null
    : null;

  return (
    <main className={styles.workspace} data-testid="quality-workspace">
      <nav aria-label="Trilha" className={styles.breadcrumbNav}>
        <a href="/admin">Início</a> · <span aria-current="page">Qualidade</span>
      </nav>
      <p className={styles.kicker}>EXT-05</p>
      <h1>Qualidade e não conformidades internas</h1>
      {/* As duas frases a seguir são contrato herdado (tests/ext05-quality.test.mjs)
          e precisam permanecer literais: o critério do servidor e a fronteira
          documental. Não quebrar em linhas. */}
      <p className={styles.lede} data-testid="quality-honesty">
        Jornada exclusivamente interna de staff, regida pelo critério do servidor:{" "}
        <strong>Encerrar apenas com evidência e responsável</strong>. As referências documentais são
        declarações rastreáveis e <strong>não representam upload</strong>, arquivo verificado ou
        armazenamento confirmado. A tela não inventa causa, prazo, conclusão nem reincidência: tudo o que
        aparece veio do servidor, e onde não existe dado real a tela diz que não existe — nunca mostra
        zero no lugar.
      </p>
      <p className={styles.hint}>
        Quem pode ler e escrever é decidido pelo servidor, por permissão granular
        (<code>quality.read</code>, <code>quality.write</code>) com escopo global, organizacional ou por
        conta. Abrir esta tela pelo menu não concede nenhuma dessas permissões. O vínculo opcional de conta
        é imutável: grants de conta veem somente a própria conta; registros sem conta exigem escopo global
        ou organizacional.
      </p>

      {notice ? <UiState variant="success" title={notice} /> : null}
      {actionError ? (
        <div data-testid="quality-action-error">
          <UiState
            variant={qualityErrorVariant(actionError)}
            title={actionError.title}
            detail={`${actionError.detail} ${qualityErrorFootnote(actionError)}`}
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

      <div className={styles.tabs} role="tablist" aria-label="Jornada canônica de qualidade">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            id={`quality-tab-${tab.id}`}
            ref={node => { tabRefs.current[index] = node; }}
            type="button"
            role="tab"
            className={active === tab.id ? styles.tabActive : styles.tab}
            aria-selected={active === tab.id}
            aria-controls={`quality-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={event => onTabKey(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.tabPanel}>
        {active === "lista" ? (
          <section
            id="quality-panel-lista"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="quality-tab-lista"
            className={styles.panel}
            data-testid="quality-list"
          >
            <h2 className={styles.panelTitle}>Não conformidades</h2>
            {list.phase === "loading" ? (
              <UiState variant="loading" title="Lendo as não conformidades…" detail="Nada é exibido antes de a leitura terminar." />
            ) : null}
            {list.phase === "failed"
              ? renderReadFailure(
                  {
                    ...list.error,
                    detail: `${list.error.detail} Isto não significa que não existam não conformidades registradas.`,
                  },
                  () => void loadList(),
                  "quality-list-error",
                )
              : null}
            {list.phase === "ready" && items.length === 0 ? (
              <UiState
                variant="empty"
                title="A leitura funcionou e nenhuma não conformidade está registrada."
                detail="O sistema não cria registro de exemplo; o que não foi registrado não aparece."
              />
            ) : null}
            {list.phase === "ready" && items.length > 0 ? (
              <>
                {/* Indicadores só existem depois da leitura concluída: nunca
                    aparecem como zero durante carregamento ou falha. */}
                <ul className={styles.metrics} data-testid="quality-metrics">
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>{count(items.length)}</span>
                    <span className={styles.metricLabel}>Não conformidades lidas</span>
                  </li>
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>
                      {count(items.filter(item => item.status === "em_acao_corretiva").length)}
                    </span>
                    <span className={styles.metricLabel}>Em ação corretiva agora</span>
                  </li>
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>
                      {count(items.filter(item => item.status === "encerrada").length)}
                    </span>
                    <span className={styles.metricLabel}>Encerradas com evidência e responsável</span>
                  </li>
                </ul>
                <div className={styles.tableWrap}>
                  <table className={styles.table} data-testid="quality-list-table">
                    <caption>
                      Não conformidades devolvidas pelo servidor para o seu escopo, da mais recente à mais
                      antiga. O contador de reincidência é derivado pelo servidor, nunca digitado.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Protocolo</th>
                        <th scope="col">Situação</th>
                        <th scope="col">Gravidade</th>
                        <th scope="col">Categoria</th>
                        <th scope="col">Conta</th>
                        <th scope="col">Reincidências derivadas</th>
                        <th scope="col">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(item => (
                        <tr key={item.id}>
                          <th scope="row">{honestText(item.protocol)}</th>
                          <td>
                            <UiBadge tone={ncStatusTone(item.status)} srPrefix="Situação da não conformidade">
                              {ncStatusLabel(item.status)}
                            </UiBadge>
                          </td>
                          <td>
                            <UiBadge tone={severityTone(item.severity)} srPrefix="Gravidade">
                              {severityLabel(item.severity)}
                            </UiBadge>
                          </td>
                          <td>{honestText(item.category)}</td>
                          <td>
                            {item.client_account_id
                              ? honestText(item.client_name || item.client_account_id)
                              : "Sem conta (escopo global)"}
                          </td>
                          <td>{count(item.recurrence_count_derived)}</td>
                          <td>
                            <button type="button" onClick={() => openCycle(item.id)}>
                              Abrir ciclo de vida
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

        {active === "nova" ? (
          <section
            id="quality-panel-nova"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="quality-tab-nova"
            className={styles.panel}
            data-testid="quality-new"
          >
            <h2 className={styles.panelTitle}>Nova não conformidade</h2>
            <p className={styles.hint}>
              O registro nasce aberto, com você como responsável inicial (identidade da sessão de equipe).
              A recusa de uma escrita é sempre decisão do servidor.
            </p>
            <form className={styles.stackWide} onSubmit={create}>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="quality-title">Título</label>
                  <input
                    id="quality-title"
                    required
                    minLength={5}
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="quality-category">Categoria</label>
                  <input
                    id="quality-category"
                    required
                    minLength={3}
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                  />
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor="quality-description">Descrição</label>
                <textarea
                  id="quality-description"
                  required
                  minLength={10}
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="quality-severity">Gravidade</label>
                  <select
                    id="quality-severity"
                    value={form.severity}
                    onChange={e => setForm({ ...form, severity: e.target.value })}
                  >
                    {SEVERITIES.map(value => (
                      <option key={value} value={value}>
                        {severityLabel(value)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="quality-account">Conta de cliente (opcional, imutável)</label>
                  <input
                    id="quality-account"
                    placeholder="UUID da conta, se houver"
                    value={form.client_account_id}
                    onChange={e => setForm({ ...form, client_account_id: e.target.value })}
                  />
                </div>
              </div>
              <div className={styles.actions}>
                <button className="primary" type="submit" disabled={busy}>
                  {busy ? "Registrando…" : "Registrar não conformidade"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {active === "ciclo" ? (
          <section
            id="quality-panel-ciclo"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="quality-tab-ciclo"
            className={styles.panel}
            data-testid="quality-cycle"
          >
            <h2 className={styles.panelTitle}>Ciclo de vida e registros</h2>
            <div className={styles.field}>
              <label htmlFor="quality-selected">Não conformidade selecionada</label>
              <select
                id="quality-selected"
                value={selectedId}
                onChange={e => { if (e.target.value) void loadDetail(e.target.value); }}
                disabled={list.phase !== "ready" || items.length === 0}
              >
                <option value="">Selecione uma não conformidade</option>
                {items.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.protocol} · {ncStatusLabel(item.status)}
                  </option>
                ))}
              </select>
            </div>
            {list.phase === "failed" ? (
              <p className={styles.hint}>
                A lista não pôde ser lida, então não há o que selecionar aqui. Isto não significa que não
                existam não conformidades.
              </p>
            ) : null}

            {detail === null ? (
              <UiState
                variant="empty"
                title="Nenhuma não conformidade aberta."
                detail="Escolha um registro na lista para ver estado, causas, ações e verificações."
              />
            ) : null}
            {detail?.phase === "loading" ? <UiState variant="loading" title="Lendo a não conformidade…" /> : null}
            {detail?.phase === "failed"
              ? renderReadFailure(detail.error, () => void loadDetail(selectedId), "quality-detail-error")
              : null}

            {selected && nc ? (
              <div className={styles.sectionCard} data-testid="quality-detail">
                <div className={styles.padded}>
                  <h3 className={styles.cardTitle}>
                    {honestText(nc.protocol)}: {honestText(nc.title)}
                  </h3>
                  <p className={styles.metaLine}>
                    <UiBadge tone={ncStatusTone(nc.status)} srPrefix="Situação">
                      {ncStatusLabel(nc.status)}
                    </UiBadge>{" "}
                    <UiBadge tone={severityTone(nc.severity)} srPrefix="Gravidade">
                      {severityLabel(nc.severity)}
                    </UiBadge>{" "}
                    <UiBadge tone={qualityOriginTone(nc.origin)} srPrefix="Origem do registro">
                      {qualityOriginLabel(nc.origin)}
                    </UiBadge>
                  </p>
                  <dl className={styles.facts}>
                    <div>
                      <dt>Descrição</dt>
                      <dd>{honestText(nc.description)}</dd>
                    </div>
                    <div>
                      <dt>Categoria</dt>
                      <dd>{honestText(nc.category)}</dd>
                    </div>
                    <div>
                      <dt>Conta vinculada</dt>
                      <dd>
                        {nc.client_account_id
                          ? honestText(nc.client_name || nc.client_account_id)
                          : "Sem conta (escopo global)"}
                      </dd>
                    </div>
                    <div>
                      <dt>Responsável canônico</dt>
                      <dd>{honestText(nc.responsible_identity)}</dd>
                    </div>
                    <div>
                      <dt>Criada em</dt>
                      <dd>{honestDateTime(nc.created_at)}</dd>
                    </div>
                    <div>
                      <dt>Encerrada em</dt>
                      <dd>{nc.closed_at ? honestDateTime(nc.closed_at) : "Encerramento pendente"}</dd>
                    </div>
                    <div>
                      <dt>Reaberta em</dt>
                      <dd>{honestDateTime(nc.reopened_at)}</dd>
                    </div>
                  </dl>

                  <div className={styles.field}>
                    <label htmlFor="quality-reason">Justificativa da transição, conclusão ou reabertura</label>
                    <input
                      id="quality-reason"
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="Motivo exigido pelo servidor (10 a 1000 caracteres)"
                    />
                  </div>
                  <div className={styles.actions} data-testid="quality-cycle-actions">
                    {nc.status === "aberta" ? (
                      <button type="button" disabled={busy} onClick={() => void transition("em_analise")}>
                        Iniciar análise
                      </button>
                    ) : null}
                    {nc.status === "em_analise" ? (
                      <button type="button" disabled={busy} onClick={() => void transition("em_acao_corretiva")}>
                        Ir para ação corretiva
                      </button>
                    ) : null}
                    {nc.status === "em_acao_corretiva" ? (
                      <button type="button" disabled={busy} onClick={() => void transition("verificacao")}>
                        Ir para verificação
                      </button>
                    ) : null}
                    {nc.status === "reaberta" ? (
                      <button type="button" disabled={busy} onClick={() => void transition("em_analise")}>
                        Retomar análise
                      </button>
                    ) : null}
                    {nc.status === "encerrada" ? (
                      <button type="button" disabled={busy} onClick={() => void reopen()}>
                        Reabrir formalmente
                      </button>
                    ) : null}
                  </div>
                  <p className={styles.footnote}>
                    A máquina de estados é do servidor e não salta etapa: aberta → em análise → em ação
                    corretiva → em verificação → encerrada, com reabertura formal voltando para a análise.
                    Encerrar e reabrir têm operação própria e nunca passam pela transição comum.
                  </p>
                </div>
              </div>
            ) : null}

            {selected && nc ? (
              <>
                <div className={styles.sectionCard} data-testid="quality-causes">
                  <div className={styles.padded}>
                    <h3 className={styles.cardTitle}>Causas e análise histórica</h3>
                    {selected.causes.length ? (
                      <ul className={styles.scrollList}>
                        {selected.causes.map(item => (
                          <li key={item.id} className={styles.dividedItem}>
                            <strong>{honestText(item.description)}</strong>
                            <span className={styles.metaLine}>
                              {honestDateTime(item.registered_at)} · Fonte declarada: {honestText(item.declared_source)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <UiState
                        variant="empty"
                        title="A leitura funcionou e nenhuma causa foi registrada."
                        detail="Sem causa registrada o servidor não aceita encerrar; zero não é a resposta, é ausência."
                      />
                    )}
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="quality-cause-description">Descrição da causa</label>
                        <input
                          id="quality-cause-description"
                          minLength={10}
                          value={cause.description}
                          onChange={e => setCause({ ...cause, description: e.target.value })}
                        />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="quality-cause-source">Fonte ou fundamento declarado</label>
                        <input
                          id="quality-cause-source"
                          minLength={3}
                          value={cause.declared_source}
                          onChange={e => setCause({ ...cause, declared_source: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <button type="button" disabled={busy} onClick={() => void addCause()}>
                        Registrar causa
                      </button>
                    </div>
                  </div>
                </div>

                <div className={styles.sectionCard} data-testid="quality-actions-card">
                  <div className={styles.padded}>
                    <h3 className={styles.cardTitle}>Ações corretivas</h3>
                    {selected.actions.length ? (
                      <div className={styles.tableWrap}>
                        <table className={styles.table} data-testid="quality-actions-table">
                          <caption>
                            Ações da não conformidade. Ação concluída ou cancelada é imutável no banco.
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">Descrição</th>
                              <th scope="col">Situação</th>
                              <th scope="col">Prazo</th>
                              <th scope="col">Fonte do prazo</th>
                              <th scope="col">Operação explícita</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selected.actions.map(item => (
                              <tr key={item.id}>
                                <th scope="row">{honestText(item.description)}</th>
                                <td>
                                  <UiBadge tone={actionStatusTone(item.status)} srPrefix="Situação da ação">
                                    {actionStatusLabel(item.status)}
                                  </UiBadge>
                                </td>
                                <td>{item.due_date ? honestDate(item.due_date) : "Sem prazo declarado"}</td>
                                <td>{honestText(item.due_date_source)}</td>
                                <td>
                                  {item.status === "pendente" ? (
                                    <>
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => void actionTerminal(item.id, "complete")}
                                      >
                                        Concluir
                                      </button>{" "}
                                      <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => void actionTerminal(item.id, "cancel")}
                                      >
                                        Cancelar
                                      </button>
                                    </>
                                  ) : (
                                    "Finalizada e imutável"
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <UiState
                        variant="empty"
                        title="A leitura funcionou e nenhuma ação corretiva foi registrada."
                        detail="O encerramento exige pelo menos uma ação concluída e nenhuma pendente."
                      />
                    )}
                    <p className={styles.hint}>
                      Concluir usa a justificativa acima como nota (ou uma nota padrão); cancelar exige a
                      justificativa escrita. Ambas são regras do servidor.
                    </p>
                    <div data-testid="quality-references">
                      {refs.phase === "loading" ? (
                        <UiState variant="loading" title="Lendo as pessoas de equipe disponíveis…" />
                      ) : null}
                      {refs.phase === "failed"
                        ? renderReadFailure(
                            {
                              ...refs.error,
                              detail: `${refs.error.detail} Sem a lista de equipe não dá para criar ação; isto não significa que não exista equipe.`,
                            },
                            () => void loadRefs(),
                            "quality-references-error",
                          )
                        : null}
                      {refs.phase === "ready" ? (
                        <>
                          <div className={styles.fieldRow}>
                            <div className={styles.field}>
                              <label htmlFor="quality-action-description">Descrição da ação</label>
                              <input
                                id="quality-action-description"
                                minLength={10}
                                value={action.description}
                                onChange={e => setAction({ ...action, description: e.target.value })}
                              />
                            </div>
                            <div className={styles.field}>
                              <label htmlFor="quality-action-type">Tipo da ação</label>
                              <input
                                id="quality-action-type"
                                minLength={3}
                                value={action.action_type}
                                onChange={e => setAction({ ...action, action_type: e.target.value })}
                              />
                            </div>
                            <div className={styles.field}>
                              <label htmlFor="quality-action-responsible">Responsável canônico</label>
                              <select
                                id="quality-action-responsible"
                                value={action.responsible_identity}
                                onChange={e => setAction({ ...action, responsible_identity: e.target.value })}
                              >
                                <option value="">Selecione a pessoa responsável</option>
                                {staff.map(person => (
                                  <option key={person.id} value={person.id}>
                                    {person.display_name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className={styles.fieldRow}>
                            <div className={styles.field}>
                              <label htmlFor="quality-action-due">Prazo (opcional)</label>
                              <input
                                id="quality-action-due"
                                type="date"
                                value={action.due_date}
                                onChange={e => setAction({ ...action, due_date: e.target.value })}
                              />
                            </div>
                            <div className={styles.field}>
                              <label htmlFor="quality-action-due-source">Fonte do prazo</label>
                              <input
                                id="quality-action-due-source"
                                value={action.due_date_source}
                                onChange={e => setAction({ ...action, due_date_source: e.target.value })}
                              />
                            </div>
                            <div className={styles.field}>
                              <label htmlFor="quality-action-due-base">Data-base do prazo</label>
                              <input
                                id="quality-action-due-base"
                                type="date"
                                value={action.due_date_base_date}
                                onChange={e => setAction({ ...action, due_date_base_date: e.target.value })}
                              />
                            </div>
                          </div>
                          <div className={styles.actions}>
                            <button
                              type="button"
                              disabled={busy || !action.responsible_identity}
                              onClick={() => void addAction()}
                            >
                              Criar ação com responsável canônico
                            </button>
                          </div>
                          <p className={styles.footnote}>
                            Prazo nunca é inventado: se você informar uma data, o servidor exige a fonte e a
                            data-base que a justificam.
                          </p>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className={styles.sectionCard} data-testid="quality-verifications">
                  <div className={styles.padded}>
                    <h3 className={styles.cardTitle}>Verificações e evidência declarada</h3>
                    {selected.verifications.length ? (
                      <ul className={styles.scrollList}>
                        {selected.verifications.map(item => (
                          <li key={item.id} className={styles.dividedItem}>
                            <strong>
                              <UiBadge tone={verificationOutcomeTone(item.outcome)} srPrefix="Resultado da verificação">
                                {verificationOutcomeLabel(item.outcome)}
                              </UiBadge>{" "}
                              {honestText(item.description)}
                            </strong>
                            <span className={styles.metaLine}>
                              {honestDateTime(item.verified_at)} · {honestText(item.evidence_type)} ·{" "}
                              {honestText(item.evidence_reference)} · Fonte: {honestText(item.evidence_source)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <UiState
                        variant="empty"
                        title="A leitura funcionou e nenhuma verificação foi registrada."
                        detail="Sem verificação eficaz com evidência declarada o servidor não aceita encerrar."
                      />
                    )}
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="quality-verification-outcome">Resultado</label>
                        <select
                          id="quality-verification-outcome"
                          value={verification.outcome}
                          onChange={e => setVerification({ ...verification, outcome: e.target.value })}
                        >
                          <option value="eficaz">{verificationOutcomeLabel("eficaz")}</option>
                          <option value="ineficaz">{verificationOutcomeLabel("ineficaz")}</option>
                        </select>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="quality-verification-description">Descrição da verificação</label>
                        <input
                          id="quality-verification-description"
                          minLength={10}
                          value={verification.description}
                          onChange={e => setVerification({ ...verification, description: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="quality-verification-type">Tipo da evidência</label>
                        <input
                          id="quality-verification-type"
                          minLength={3}
                          value={verification.evidence_type}
                          onChange={e => setVerification({ ...verification, evidence_type: e.target.value })}
                        />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="quality-verification-reference">Referência declarada</label>
                        <input
                          id="quality-verification-reference"
                          minLength={5}
                          value={verification.evidence_reference}
                          onChange={e => setVerification({ ...verification, evidence_reference: e.target.value })}
                        />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="quality-verification-source">Fonte da evidência</label>
                        <input
                          id="quality-verification-source"
                          minLength={3}
                          value={verification.evidence_source}
                          onChange={e => setVerification({ ...verification, evidence_source: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <button type="button" disabled={busy} onClick={() => void addVerification()}>
                        Registrar verificação
                      </button>
                    </div>

                    {nc.status === "verificacao" ? (
                      <div data-testid="quality-close">
                        <div className={styles.field}>
                          <label htmlFor="quality-closure-note">Nota de encerramento</label>
                          <input
                            id="quality-closure-note"
                            minLength={10}
                            value={closureNote}
                            onChange={e => setClosureNote(e.target.value)}
                          />
                        </div>
                        <div className={styles.actions}>
                          <button
                            type="button"
                            disabled={busy || !lastEffective}
                            onClick={() => lastEffective && void close(lastEffective.id)}
                          >
                            Encerrar com evidência e responsável
                          </button>
                        </div>
                        {!lastEffective ? (
                          <p className={styles.footnote}>
                            Registre uma verificação eficaz antes de encerrar: o servidor exige a evidência
                            declarada e recusa encerramento sem ela.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {active === "trilha" ? (
          <section
            id="quality-panel-trilha"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="quality-tab-trilha"
            className={styles.panel}
            data-testid="quality-trail"
          >
            <h2 className={styles.panelTitle}>Trilha e reincidência</h2>
            {detail === null ? (
              <UiState
                variant="empty"
                title="Nenhuma não conformidade aberta."
                detail="Escolha um registro em “Não conformidades” para ver a trilha imutável e as reincidências."
              />
            ) : null}
            {detail?.phase === "loading" ? <UiState variant="loading" title="Lendo trilha e reincidências…" /> : null}
            {detail?.phase === "failed"
              ? renderReadFailure(detail.error, () => void loadDetail(selectedId), "quality-trail-error")
              : null}

            {selected && nc ? (
              <>
                <div className={styles.sectionCard} data-testid="quality-events">
                  <div className={styles.padded}>
                    <h3 className={styles.cardTitle}>Trilha imutável</h3>
                    {selected.events.length ? (
                      <ul className={styles.scrollList}>
                        {selected.events.map(item => (
                          <li key={item.id} className={styles.dividedItem}>
                            <strong>{qualityEventLabel(item.event_type)}</strong>
                            <span className={styles.metaLine}>
                              {honestDateTime(item.created_at)} · {honestText(item.summary)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <UiState
                        variant="empty"
                        title="A leitura funcionou e a trilha ainda não tem evento."
                        detail="Eventos são gravados pelo servidor a cada operação aceita; nenhum é escrito pela tela."
                      />
                    )}
                    <p className={styles.footnote}>
                      Eventos, encerramentos e reaberturas são append-only no banco (migração 151). A tela
                      apenas lê. Valor sem dado aparece como “{ABSENT}”. O resumo de cada evento é o texto
                      gravado pelo servidor no momento da operação e às vezes traz o valor técnico do
                      estado; reescrevê-lo aqui seria alterar trilha imutável — é área legada declarada,
                      não descuido.
                    </p>
                  </div>
                </div>

                <div className={styles.sectionCard} data-testid="quality-history">
                  <div className={styles.padded}>
                    <h3 className={styles.cardTitle}>Encerramentos e reaberturas</h3>
                    {selected.closures.length === 0 && selected.reopenings.length === 0 ? (
                      <UiState
                        variant="empty"
                        title="A leitura funcionou e não há encerramento nem reabertura."
                        detail="O histórico aparece aqui quando existir; a reabertura nunca apaga o encerramento."
                      />
                    ) : (
                      <ul className={styles.scrollList}>
                        {selected.closures.map(item => (
                          <li key={item.id} className={styles.dividedItem}>
                            <strong>Encerramento com evidência e responsável</strong>
                            <span className={styles.metaLine}>
                              {honestDateTime(item.closed_at)} · {honestText(item.closure_note)}
                            </span>
                          </li>
                        ))}
                        {selected.reopenings.map(item => (
                          <li key={item.id} className={styles.dividedItem}>
                            <strong>Reabertura formal</strong>
                            <span className={styles.metaLine}>
                              {honestDateTime(item.reopened_at)} · {honestText(item.justification)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className={styles.sectionCard} data-testid="quality-recurrences">
                  <div className={styles.padded}>
                    <h3 className={styles.cardTitle}>Reincidência explícita</h3>
                    {selected.recurrences.length ? (
                      <ul className={styles.scrollList}>
                        {selected.recurrences.map(item => (
                          <li key={item.id} className={styles.dividedItem}>
                            <strong>{honestText(item.justification)}</strong>
                            <span className={styles.metaLine}>
                              {honestDateTime(item.registered_at)} · Critério declarado: {honestText(item.declared_criterion)} ·
                              Fonte: {honestText(item.declared_source)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <UiState
                        variant="empty"
                        title="A leitura funcionou e não há reincidência registrada."
                        detail="Reincidência só existe por decisão explícita, com justificativa, critério e fonte; o contador da lista é derivado pelo servidor."
                      />
                    )}
                    <form className={styles.stackWide} onSubmit={recur}>
                      <div className={styles.fieldRow}>
                        <div className={styles.field}>
                          <label htmlFor="quality-recurrence-title">Título da nova não conformidade</label>
                          <input
                            id="quality-recurrence-title"
                            required
                            minLength={5}
                            value={recurrence.title}
                            onChange={e => setRecurrence({ ...recurrence, title: e.target.value })}
                          />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="quality-recurrence-category">Categoria</label>
                          <input
                            id="quality-recurrence-category"
                            required
                            minLength={3}
                            value={recurrence.category}
                            onChange={e => setRecurrence({ ...recurrence, category: e.target.value })}
                          />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="quality-recurrence-severity">Gravidade</label>
                          <select
                            id="quality-recurrence-severity"
                            value={recurrence.severity}
                            onChange={e => setRecurrence({ ...recurrence, severity: e.target.value })}
                          >
                            {SEVERITIES.map(value => (
                              <option key={value} value={value}>
                                {severityLabel(value)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="quality-recurrence-description">Descrição</label>
                        <textarea
                          id="quality-recurrence-description"
                          required
                          minLength={10}
                          value={recurrence.description}
                          onChange={e => setRecurrence({ ...recurrence, description: e.target.value })}
                        />
                      </div>
                      <div className={styles.fieldRow}>
                        <div className={styles.field}>
                          <label htmlFor="quality-recurrence-justification">Justificativa da reincidência</label>
                          <input
                            id="quality-recurrence-justification"
                            required
                            minLength={10}
                            value={recurrence.justification}
                            onChange={e => setRecurrence({ ...recurrence, justification: e.target.value })}
                          />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="quality-recurrence-criterion">Critério declarado</label>
                          <input
                            id="quality-recurrence-criterion"
                            required
                            minLength={5}
                            value={recurrence.declared_criterion}
                            onChange={e => setRecurrence({ ...recurrence, declared_criterion: e.target.value })}
                          />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="quality-recurrence-source">Fonte declarada</label>
                          <input
                            id="quality-recurrence-source"
                            required
                            minLength={3}
                            value={recurrence.declared_source}
                            onChange={e => setRecurrence({ ...recurrence, declared_source: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className={styles.actions}>
                        <button type="submit" disabled={busy}>
                          Registrar nova não conformidade reincidente
                        </button>
                      </div>
                      <p className={styles.footnote}>
                        A reincidência cria uma NOVA não conformidade vinculada à predecessora, herdando a
                        conta. Responsável da reincidência: identidade da sessão staff. O contador exibido
                        na lista é derivado pelo servidor a partir desses vínculos.
                      </p>
                    </form>
                  </div>
                </div>
              </>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
