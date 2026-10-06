"use client";

// UX-07 / EXT-11 / F07 — apresentação da jornada canônica de analytics.
//
// Esta reescrita é de APRESENTAÇÃO. Nenhuma URL, método, corpo, cabeçalho,
// chave de idempotência ou regra de servidor foi alterada:
//
//   GET    /api/ext/analytics/experiments
//   POST   /api/ext/analytics/experiments                      (Idempotency-Key)
//   GET    /api/ext/analytics/experiments/{id}
//   POST   /api/ext/analytics/experiments/{id}/approve         (Idempotency-Key)
//   POST   /api/ext/analytics/experiments/{id}/transition      (Idempotency-Key)
//
// Quem autoriza continua sendo o servidor (`analytics.read`,
// `analytics.write`, `analytics.approve` conferidos por `hasPermission` em
// src/server/ext-analytics-api.mjs). O AdminGate da página não foi alargado.
//
// Pendências declaradas (ver docs/UX-07-ANALYTICS-2026-10-06.md):
//  - a tela continua SEM formulário de observação real: `POST .../observations`
//    existe no servidor e é exercitado por HTTP no gate, mas acrescentá-lo
//    seria capacidade nova, não apresentação;
//  - a leitura legada (`/api/ext/analytics-experiments`) continua não
//    consumida por esta tela, de propósito.

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import UiState from "../../../components/ui/UiState";
import UiBadge from "../../../components/ui/UiBadge";
import styles from "../../../components/ui/UiWorkspace.module.css";
import {
  analyticsErrorFootnote,
  analyticsErrorVariant,
  experimentStatusLabel,
  experimentStatusTone,
  experimentOriginLabel,
  experimentOriginTone,
  observationVariantLabel,
  observationSourceLabel,
  experimentEventLabel,
  honestDate,
  honestDateTime,
  honestText,
  count,
  honestNumber,
  honestPercent,
  ABSENT,
  type AnalyticsErrorDescriptor,
} from "../../../lib/analytics-vocabulary.mjs";
import { analyticsRequest } from "../../../lib/analytics-request";

type Experiment = {
  id: string;
  protocol: string;
  hypothesis: string;
  description: string;
  variant_a: string;
  variant_b: string;
  metric_name: string;
  status: string;
  origin?: string | null;
  approved_at?: string | null;
  execution_started_at?: string | null;
  completed_at?: string | null;
  conclusion_note?: string | null;
  created_at?: string | null;
  observations_count?: number | null;
  events_count?: number | null;
};

type Observation = {
  id: string;
  variant: string;
  metric_name: string;
  metric_value: number | string | null;
  sample_size: number | null;
  source_type: string;
  source_reference: string;
  source_recorded_at: string | null;
  created_at: string | null;
};

type TrailEvent = {
  id: string;
  event_type: string;
  summary: string;
  created_at: string | null;
};

type VariantSummary = {
  variant: string;
  observation_count: number | null;
  sample_size: number | null;
  metric_total: number | null;
};

type Detail = {
  experiment: Experiment;
  observations: Observation[];
  events: TrailEvent[];
  result: {
    sufficient_for_descriptive_view: boolean;
    conclusion: string;
    by_variant: VariantSummary[];
  };
};

/** Estado honesto de uma leitura independente: nunca confunde os quatro casos. */
type Load<T> =
  | { phase: "loading" }
  | { phase: "ready"; data: T }
  | { phase: "failed"; error: AnalyticsErrorDescriptor };

const TABS = [
  { id: "lista", label: "Experimentos canônicos" },
  { id: "novo", label: "Novo rascunho" },
  { id: "ciclo", label: "Aprovação e ciclo de vida" },
  { id: "trilha", label: "Observações e trilha" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// Mesma forma de chave do protótipo anterior; o contrato do servidor
// (`KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/`) continua satisfeito.
const requestKey = () => `ext11-${crypto.randomUUID()}`;

const EMPTY_FORM = {
  hypothesis: "",
  description: "",
  variant_a: "",
  variant_b: "",
  metric_name: "",
  privacy_note: "Experimento interno, sem identificadores diretos e com minimização de dados.",
};

export function AnalyticsWorkspace() {
  const [active, setActive] = useState<TabId>("lista");
  const [list, setList] = useState<Load<Experiment[]>>({ phase: "loading" });
  const [detail, setDetail] = useState<Load<Detail> | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [actionError, setActionError] = useState<AnalyticsErrorDescriptor | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const loadList = useCallback(async () => {
    setList({ phase: "loading" });
    const result = await analyticsRequest<{ items: Experiment[] }>("/api/ext/analytics/experiments");
    if (!result.ok) {
      // Falha de leitura é estado próprio. A lista anterior NÃO é mantida nem
      // substituída por uma lista vazia.
      setList({ phase: "failed", error: result.error });
      return;
    }
    setList({ phase: "ready", data: Array.isArray(result.data?.items) ? result.data.items : [] });
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetail({ phase: "loading" });
    const result = await analyticsRequest<Detail>(`/api/ext/analytics/experiments/${id}`);
    if (!result.ok) {
      setDetail({ phase: "failed", error: result.error });
      return;
    }
    setDetail({ phase: "ready", data: result.data });
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openCycle = (id: string) => {
    setActive("ciclo");
    void loadDetail(id);
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setActionError(null);
    setNotice("");
    const result = await analyticsRequest<{ experiment: Experiment }>("/api/ext/analytics/experiments", {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": requestKey() },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setNotice("Rascunho criado. Uma pessoa autorizada precisa aprovar antes da execução.");
    setForm({ ...form, hypothesis: "", description: "", variant_a: "", variant_b: "", metric_name: "" });
    await loadList();
    if (result.data?.experiment?.id) await loadDetail(result.data.experiment.id);
  };

  const approve = async (id: string) => {
    setBusy(true);
    setActionError(null);
    setNotice("");
    const result = await analyticsRequest(`/api/ext/analytics/experiments/${id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": requestKey() },
      body: JSON.stringify({
        approval_note:
          "Aprovação humana registrada após revisão da hipótese, variantes, métrica e minimização.",
      }),
    });
    setBusy(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setNotice("Aprovação humana registrada; a execução continua sendo uma transição separada.");
    await loadList();
    await loadDetail(id);
  };

  const change = async (id: string, status: string, extra: Record<string, string> = {}) => {
    setBusy(true);
    setActionError(null);
    setNotice("");
    const result = await analyticsRequest(`/api/ext/analytics/experiments/${id}/transition`, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": requestKey() },
      body: JSON.stringify({ status, ...extra }),
    });
    setBusy(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    // O rótulo em português vem do vocabulário; o valor cru do banco não é
    // exibido a quem opera.
    setNotice(`Estado alterado para ${experimentStatusLabel(status)}.`);
    await loadList();
    await loadDetail(id);
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

  const renderReadFailure = (error: AnalyticsErrorDescriptor, retry: () => void, testId: string) => (
    <div data-testid={testId}>
      <UiState
        variant={analyticsErrorVariant(error)}
        title={error.title}
        detail={`${error.detail} ${analyticsErrorFootnote(error)}`}
        onRetry={error.canRetry ? retry : undefined}
        retryLabel="Tentar a leitura de novo"
      />
    </div>
  );

  const experiments = list.phase === "ready" ? list.data : [];
  const selected =
    detail?.phase === "ready" ? detail.data
    : null;

  return (
    <main className={styles.workspace} data-testid="analytics-workspace">
      <nav aria-label="Trilha" className={styles.breadcrumbNav}>
        <a href="/admin">Início</a> · <span aria-current="page">Analytics e experimentos</span>
      </nav>
      <p className={styles.kicker}>EXT-11 · F07</p>
      <h1>Analytics e experimentos A/B controlados</h1>
      <p className={styles.lede} data-testid="analytics-honesty">
        Registre uma hipótese explícita, duas variantes e uma métrica declarada. Esta tela não executa teste
        externo: não coleta tráfego, não inventa tráfego nem conversões, e não declara vencedor nem
        significância estatística. Observações só entram com origem operacional interna declarada e são
        agregadas para minimizar dados. Onde não existe dado real, a tela diz que não existe — nunca mostra
        zero no lugar.
      </p>
      <p className={styles.hint}>
        Quem pode ler, escrever e aprovar é decidido pelo servidor, por permissão granular
        (<code>analytics.read</code>, <code>analytics.write</code>, <code>analytics.approve</code>). Abrir esta
        tela pelo menu não concede nenhuma dessas permissões.
      </p>

      {notice ? <UiState variant="success" title={notice} /> : null}
      {actionError ? (
        <div data-testid="analytics-action-error">
          <UiState
            variant={analyticsErrorVariant(actionError)}
            title={actionError.title}
            detail={`${actionError.detail} ${analyticsErrorFootnote(actionError)}`}
          />
        </div>
      ) : null}

      <div className={styles.tabs} role="tablist" aria-label="Jornada canônica de analytics">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            id={`analytics-tab-${tab.id}`}
            ref={node => { tabRefs.current[index] = node; }}
            type="button"
            role="tab"
            className={active === tab.id ? styles.tabActive : styles.tab}
            aria-selected={active === tab.id}
            aria-controls={`analytics-panel-${tab.id}`}
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
            id="analytics-panel-lista"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="analytics-tab-lista"
            className={styles.panel}
            data-testid="analytics-list"
          >
            <h2 className={styles.panelTitle}>Experimentos canônicos</h2>
            {list.phase === "loading" ? (
              <UiState variant="loading" title="Lendo os experimentos canônicos…" detail="Nada é exibido antes de a leitura terminar." />
            ) : null}
            {list.phase === "failed"
              ? renderReadFailure(
                  {
                    ...list.error,
                    detail: `${list.error.detail} Isto não significa que não existam experimentos registrados.`,
                  },
                  () => void loadList(),
                  "analytics-list-error",
                )
              : null}
            {list.phase === "ready" && experiments.length === 0 ? (
              <UiState
                variant="empty"
                title="A leitura funcionou e nenhum experimento canônico está registrado."
                detail="Sem experimento criado não há hipótese, variante ou observação; nada é inventado para preencher a tela."
              />
            ) : null}
            {list.phase === "ready" && experiments.length > 0 ? (
              <>
                {/* Indicadores só existem depois da leitura concluída: nunca
                    aparecem como zero durante carregamento ou falha. */}
                <ul className={styles.metrics} data-testid="analytics-metrics">
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>{count(experiments.length)}</span>
                    <span className={styles.metricLabel}>Experimentos canônicos lidos</span>
                  </li>
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>
                      {count(experiments.filter(item => item.status === "em_execucao").length)}
                    </span>
                    <span className={styles.metricLabel}>Em execução agora</span>
                  </li>
                  <li className={styles.metric} data-testid="analytics-no-rate">
                    <span className={styles.metricValue}>{honestPercent(null)}</span>
                    <span className={styles.metricLabel}>
                      Taxa de conversão e significância: o servidor não calcula, e a tela não inventa
                    </span>
                  </li>
                </ul>
                <div className={styles.tableWrap}>
                  <table className={styles.table} data-testid="analytics-list-table">
                    <caption>
                      Experimentos de origem canônica EXT-11 devolvidos pelo servidor, do mais recente ao mais
                      antigo.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Protocolo</th>
                        <th scope="col">Situação</th>
                        <th scope="col">Métrica declarada</th>
                        <th scope="col">Variantes</th>
                        <th scope="col">Observações reais</th>
                        <th scope="col">Aprovação humana</th>
                        <th scope="col">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {experiments.map(item => (
                        <tr key={item.id}>
                          <th scope="row">{honestText(item.protocol)}</th>
                          <td>
                            <UiBadge tone={experimentStatusTone(item.status)} srPrefix="Situação do experimento">
                              {experimentStatusLabel(item.status)}
                            </UiBadge>
                          </td>
                          <td>{honestText(item.metric_name)}</td>
                          <td>
                            A: {honestText(item.variant_a)} · B: {honestText(item.variant_b)}
                          </td>
                          <td>{count(item.observations_count)}</td>
                          <td>{item.approved_at ? honestDate(item.approved_at) : "Aprovação pendente"}</td>
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

        {active === "novo" ? (
          <section
            id="analytics-panel-novo"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="analytics-tab-novo"
            className={styles.panel}
            data-testid="analytics-new"
          >
            <h2 className={styles.panelTitle}>Novo rascunho</h2>
            <p className={styles.hint}>
              O rascunho não executa nada. A aprovação humana é uma ação separada e a execução é outra
              transição. A recusa de uma escrita é sempre decisão do servidor.
            </p>
            <form className={styles.stackWide} onSubmit={create}>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="analytics-hypothesis">Hipótese explícita</label>
                  <textarea
                    id="analytics-hypothesis"
                    required
                    minLength={20}
                    value={form.hypothesis}
                    onChange={e => setForm({ ...form, hypothesis: e.target.value })}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="analytics-description">Descrição e escopo</label>
                  <textarea
                    id="analytics-description"
                    required
                    minLength={10}
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                  />
                </div>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="analytics-variant-a">Variante A</label>
                  <input
                    id="analytics-variant-a"
                    required
                    minLength={3}
                    value={form.variant_a}
                    onChange={e => setForm({ ...form, variant_a: e.target.value })}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="analytics-variant-b">Variante B</label>
                  <input
                    id="analytics-variant-b"
                    required
                    minLength={3}
                    value={form.variant_b}
                    onChange={e => setForm({ ...form, variant_b: e.target.value })}
                  />
                </div>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="analytics-metric">Métrica declarada</label>
                  <input
                    id="analytics-metric"
                    required
                    minLength={3}
                    value={form.metric_name}
                    onChange={e => setForm({ ...form, metric_name: e.target.value })}
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="analytics-privacy">Nota de privacidade e minimização</label>
                  <textarea
                    id="analytics-privacy"
                    required
                    minLength={10}
                    value={form.privacy_note}
                    onChange={e => setForm({ ...form, privacy_note: e.target.value })}
                  />
                </div>
              </div>
              <div className={styles.actions}>
                <button className="primary" type="submit" disabled={busy}>
                  {busy ? "Registrando…" : "Registrar rascunho"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {active === "ciclo" ? (
          <section
            id="analytics-panel-ciclo"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="analytics-tab-ciclo"
            className={styles.panel}
            data-testid="analytics-cycle"
          >
            <h2 className={styles.panelTitle}>Aprovação e ciclo de vida</h2>
            <div className={styles.field}>
              <label htmlFor="analytics-selected">Experimento selecionado</label>
              <select
                id="analytics-selected"
                value={selectedId}
                onChange={e => { if (e.target.value) void loadDetail(e.target.value); }}
                disabled={list.phase !== "ready" || experiments.length === 0}
              >
                <option value="">Selecione um experimento</option>
                {experiments.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.protocol} · {experimentStatusLabel(item.status)}
                  </option>
                ))}
              </select>
            </div>
            {list.phase === "failed" ? (
              <p className={styles.hint}>
                A lista de experimentos não pôde ser lida, então não há o que selecionar aqui. Isto não
                significa que não existam experimentos.
              </p>
            ) : null}

            {detail === null ? (
              <UiState
                variant="empty"
                title="Nenhum experimento aberto."
                detail="Escolha um experimento na lista para ver aprovação, execução e trilha."
              />
            ) : null}
            {detail?.phase === "loading" ? <UiState variant="loading" title="Lendo o experimento…" /> : null}
            {detail?.phase === "failed"
              ? renderReadFailure(detail.error, () => void loadDetail(selectedId), "analytics-detail-error")
              : null}

            {selected ? (
              <div className={styles.sectionCard} data-testid="analytics-detail">
                <div className={styles.padded}>
                  <h3 className={styles.cardTitle}>{honestText(selected.experiment.protocol)}</h3>
                  <p className={styles.metaLine}>
                    <UiBadge tone={experimentStatusTone(selected.experiment.status)} srPrefix="Situação do experimento">
                      {experimentStatusLabel(selected.experiment.status)}
                    </UiBadge>{" "}
                    <UiBadge tone={experimentOriginTone(selected.experiment.origin)} srPrefix="Origem do registro">
                      {experimentOriginLabel(selected.experiment.origin)}
                    </UiBadge>
                  </p>
                  <dl className={styles.facts}>
                    <div>
                      <dt>Hipótese</dt>
                      <dd>{honestText(selected.experiment.hypothesis)}</dd>
                    </div>
                    <div>
                      <dt>Métrica declarada</dt>
                      <dd>{honestText(selected.experiment.metric_name)}</dd>
                    </div>
                    <div>
                      <dt>Variante A</dt>
                      <dd>{honestText(selected.experiment.variant_a)}</dd>
                    </div>
                    <div>
                      <dt>Variante B</dt>
                      <dd>{honestText(selected.experiment.variant_b)}</dd>
                    </div>
                    <div>
                      <dt>Aprovação humana</dt>
                      <dd>{selected.experiment.approved_at ? honestDateTime(selected.experiment.approved_at) : "Aprovação pendente"}</dd>
                    </div>
                    <div>
                      <dt>Início da execução</dt>
                      <dd>{honestDateTime(selected.experiment.execution_started_at)}</dd>
                    </div>
                    <div>
                      <dt>Conclusão</dt>
                      <dd>{honestDateTime(selected.experiment.completed_at)}</dd>
                    </div>
                  </dl>
                  <div className={styles.actions} data-testid="analytics-cycle-actions">
                    {selected.experiment.status === "rascunho" && !selected.experiment.approved_at ? (
                      <button type="button" disabled={busy} onClick={() => void approve(selected.experiment.id)}>
                        Registrar aprovação humana
                      </button>
                    ) : null}
                    {selected.experiment.status === "rascunho" && selected.experiment.approved_at ? (
                      <button type="button" disabled={busy} onClick={() => void change(selected.experiment.id, "em_execucao")}>
                        Iniciar após aprovação
                      </button>
                    ) : null}
                    {selected.experiment.status === "em_execucao" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void change(selected.experiment.id, "rascunho", {
                          justification: "Execução revertida para revisão humana.",
                        })}
                      >
                        Reverter para rascunho
                      </button>
                    ) : null}
                    {selected.experiment.status !== "arquivado" && selected.experiment.status !== "concluido" ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void change(selected.experiment.id, "cancelado", {
                          justification: "Execução cancelada por decisão operacional.",
                        })}
                      >
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                  <p className={styles.footnote}>
                    Concluir um experimento exige nota de conclusão escrita por uma pessoa e pelo menos uma
                    observação real de A e de B — regra do servidor, não da tela. Esta tela ainda não oferece
                    esse formulário: é pendência declarada, não capacidade escondida.
                  </p>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {active === "trilha" ? (
          <section
            id="analytics-panel-trilha"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="analytics-tab-trilha"
            className={styles.panel}
            data-testid="analytics-trail"
          >
            <h2 className={styles.panelTitle}>Observações e trilha</h2>
            {detail === null ? (
              <UiState
                variant="empty"
                title="Nenhum experimento aberto."
                detail="Escolha um experimento em “Experimentos canônicos” para ver as observações reais e a trilha imutável."
              />
            ) : null}
            {detail?.phase === "loading" ? <UiState variant="loading" title="Lendo observações e trilha…" /> : null}
            {detail?.phase === "failed"
              ? renderReadFailure(detail.error, () => void loadDetail(selectedId), "analytics-trail-error")
              : null}

            {selected ? (
              <>
                <div className={styles.notice} data-testid="analytics-summary">
                  <h3 className={styles.cardTitle}>Resumo descritivo devolvido pelo servidor</h3>
                  <p>{honestText(selected.result?.conclusion)}</p>
                  {selected.result?.sufficient_for_descriptive_view === false ? (
                    <UiState
                      variant="empty"
                      title="Não há dados suficientes para uma conclusão."
                      detail="Falta pelo menos uma observação real de cada variante. Nada é completado por estimativa, e o sistema não declara vencedor."
                    />
                  ) : null}
                  <p className={styles.hint} data-testid="analytics-no-winner">
                    Sem vencedor e sem significância: o servidor remove os campos legados de resultado e de
                    vencedor da resposta, e esta tela não calcula taxa alguma — {honestPercent(null)}.
                  </p>
                  <div className={styles.tableWrap}>
                    <table className={styles.table} data-testid="analytics-variants">
                      <caption>Agregado por variante, contado a partir das observações reais registradas.</caption>
                      <thead>
                        <tr>
                          <th scope="col">Variante</th>
                          <th scope="col">Observações</th>
                          <th scope="col">Amostra agregada</th>
                          <th scope="col">Soma da métrica</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selected.result?.by_variant || []).map(row => (
                          <tr key={row.variant}>
                            <th scope="row">{observationVariantLabel(row.variant)}</th>
                            <td>{count(row.observation_count)}</td>
                            <td>{count(row.sample_size)}</td>
                            <td>{honestNumber(row.metric_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className={styles.sectionCard} data-testid="analytics-observations">
                  <div className={styles.padded}>
                    <h3 className={styles.cardTitle}>Observações reais</h3>
                    {selected.observations?.length ? (
                      <div className={styles.tableWrap}>
                        <table className={styles.table}>
                          <caption>
                            Cada linha veio de um registro operacional interno declarado. O servidor recusa
                            observação sintética.
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">Variante</th>
                              <th scope="col">Valor da métrica</th>
                              <th scope="col">Amostra</th>
                              <th scope="col">Origem</th>
                              <th scope="col">Referência interna</th>
                              <th scope="col">Registrado em</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selected.observations.map(row => (
                              <tr key={row.id}>
                                <th scope="row">{observationVariantLabel(row.variant)}</th>
                                <td>{honestNumber(row.metric_value)}</td>
                                <td>{count(row.sample_size)}</td>
                                <td>{observationSourceLabel(row.source_type)}</td>
                                <td>{honestText(row.source_reference)}</td>
                                <td>{honestDateTime(row.source_recorded_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <UiState
                        variant="empty"
                        title="A leitura funcionou e nenhuma observação real foi registrada."
                        detail="Enquanto não houver registro operacional interno, não há número para mostrar — e zero não é a resposta."
                      />
                    )}
                  </div>
                </div>

                <div className={styles.sectionCard} data-testid="analytics-events">
                  <div className={styles.padded}>
                    <h3 className={styles.cardTitle}>Trilha imutável</h3>
                    {selected.events?.length ? (
                      <ul className={styles.scrollList}>
                        {selected.events.map(item => (
                          <li key={item.id} className={styles.dividedItem}>
                            <strong>{experimentEventLabel(item.event_type)}</strong>
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
                      Eventos e observações são append-only no banco (migração 163). A tela apenas lê:
                      alterar ou apagar histórico é recusado pelo PostgreSQL. Valor sem dado aparece como
                      “{ABSENT}”. O resumo de cada evento é o texto gravado pelo servidor no momento da
                      operação e às vezes traz o valor técnico do estado; reescrevê-lo aqui seria alterar
                      trilha imutável — é área legada declarada, não descuido.
                    </p>
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
