"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import UiState from "../../../components/ui/UiState";
import styles from "../../../components/ui/UiWorkspace.module.css";
import {
  analyticsErrorFootnote,
  analyticsErrorVariant,
  count,
  decimal,
  experimentStatusLabel,
  experimentStatusTone,
  honestDateTime,
  honestText,
  sourceTypeLabel,
  variantLabel,
  type AnalyticsErrorDescriptor,
} from "../../../lib/analytics-vocabulary.mjs";
import { analyticsRequest } from "../../../lib/analytics-request";

// Apresentação apenas. URL, método, corpo, cabeçalho Idempotency-Key, regras de
// transição, aprovação humana e permissões granulares continuam sendo decididos
// em src/server/ext-analytics-api.mjs — a interface nunca autoriza nada.

type Experiment = {
  id: string;
  protocol: string;
  hypothesis: string;
  description: string;
  variant_a: string;
  variant_b: string;
  metric_name: string;
  status: string;
  approved_at?: string | null;
  observations_count?: number | null;
  events_count?: number | null;
  created_at?: string | null;
};

type VariantRow = { variant: string; observation_count: number; sample_size: number; metric_total: number };
type Observation = { id: string; variant: string; metric_name: string; metric_value: number; sample_size: number; source_type: string; source_reference: string; source_recorded_at?: string | null; created_at?: string | null };
type EventRow = { id: string; event_type: string; summary: string; created_at?: string | null };
type Detail = {
  experiment: Experiment;
  observations: Observation[];
  events: EventRow[];
  result: { sufficient_for_descriptive_view: boolean; conclusion: string; by_variant: VariantRow[] };
};

type Load<T> = { phase: "loading" | "ready" | "failed"; data: T | null; error: AnalyticsErrorDescriptor | null };

const TABS = [
  ["novo", "Novo rascunho"],
  ["experimentos", "Experimentos canônicos"],
  ["trilha", "Trilha do experimento"],
] as const;

type TabId = (typeof TABS)[number][0];

const idle = <T,>(): Load<T> => ({ phase: "loading", data: null, error: null });
const requestKey = () => `ext11-${crypto.randomUUID()}`;

export function AnalyticsWorkspace() {
  const [active, setActive] = useState<TabId>("experimentos");
  const [list, setList] = useState<Load<Experiment[]>>(idle<Experiment[]>());
  const [detail, setDetail] = useState<Load<Detail> | null>(null);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState<AnalyticsErrorDescriptor | null>(null);
  const [busy, setBusy] = useState(false);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [form, setForm] = useState({
    hypothesis: "",
    description: "",
    variant_a: "",
    variant_b: "",
    metric_name: "",
    privacy_note: "Experimento interno, sem identificadores diretos e com minimização de dados.",
  });

  const load = async () => {
    setList(current => ({ phase: "loading", data: current.data, error: null }));
    const result = await analyticsRequest<{ items?: Experiment[] }>("/api/ext/analytics/experiments");
    if (!result.ok) return setList({ phase: "failed", data: null, error: result.error });
    setList({ phase: "ready", data: result.data.items || [], error: null });
  };

  useEffect(() => { void load(); /* leitura inicial independente */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const open = async (id: string) => {
    setActive("trilha");
    setDetail({ phase: "loading", data: null, error: null });
    const result = await analyticsRequest<Detail>(`/api/ext/analytics/experiments/${id}`);
    if (!result.ok) return setDetail({ phase: "failed", data: null, error: result.error });
    setDetail({ phase: "ready", data: result.data, error: null });
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
    if (!result.ok) return setActionError(result.error);
    setNotice("Rascunho criado. Uma pessoa autorizada precisa aprovar antes da execução.");
    setForm({ ...form, hypothesis: "", description: "", variant_a: "", variant_b: "", metric_name: "" });
    await load();
  };

  const approve = async (id: string) => {
    setActionError(null);
    setNotice("");
    const result = await analyticsRequest<unknown>(`/api/ext/analytics/experiments/${id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": requestKey() },
      body: JSON.stringify({ approval_note: "Aprovação humana registrada após revisão da hipótese, variantes, métrica e minimização." }),
    });
    if (!result.ok) return setActionError(result.error);
    setNotice("Aprovação humana registrada; a execução continua sendo uma transição separada.");
    await load();
    await open(id);
  };

  const change = async (id: string, status: string, extra: Record<string, string> = {}) => {
    setActionError(null);
    setNotice("");
    const result = await analyticsRequest<unknown>(`/api/ext/analytics/experiments/${id}/transition`, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": requestKey() },
      body: JSON.stringify({ status, ...extra }),
    });
    if (!result.ok) return setActionError(result.error);
    setNotice(`Estado alterado para ${experimentStatusLabel(status)}.`);
    await load();
    await open(id);
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === "ArrowRight" ? (index + 1) % TABS.length
      : event.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length
      : event.key === "Home" ? 0
      : event.key === "End" ? TABS.length - 1
      : -1;
    if (next >= 0) {
      event.preventDefault();
      setActive(TABS[next][0]);
      tabRefs.current[next]?.focus();
    }
  };

  const items = list.data || [];
  const current = detail?.data || null;

  return (
    <main className={styles.workspace}>
      <nav aria-label="Trilha" className={styles.breadcrumbNav}>
        <a href="/admin">Início</a> · <span aria-current="page">Analytics e experimentos</span>
      </nav>
      <p className={styles.kicker}>EXT-11 · F07</p>
      <h1>Analytics e experimentos A/B controlados</h1>
      <p className={styles.lede}>
        Registre uma hipótese explícita, duas variantes e uma métrica declarada. Esta tela não executa teste externo,
        não inventa tráfego, conversões, vencedor ou significância estatística. Observações só entram com origem
        operacional interna declarada e são agregadas para minimizar dados. Quem autoriza cada leitura e cada escrita
        é o servidor, pelas permissões granulares de analytics — o menu não autoriza nada.
      </p>
      {notice && <UiState variant="success" title={notice} />}
      {actionError && (
        <UiState
          variant={analyticsErrorVariant(actionError)}
          title={actionError.title}
          detail={`${actionError.detail} ${analyticsErrorFootnote(actionError)}`}
        />
      )}

      <div className={styles.tabs} role="tablist" aria-label="Jornada de analytics">
        {TABS.map(([id, label], index) => (
          <button
            key={id}
            id={`analytics-tab-${id}`}
            ref={node => { tabRefs.current[index] = node; }}
            className={active === id ? styles.tabActive : styles.tab}
            role="tab"
            type="button"
            aria-selected={active === id}
            aria-controls={`analytics-panel-${id}`}
            tabIndex={active === id ? 0 : -1}
            onClick={() => setActive(id)}
            onKeyDown={event => onTabKey(event, index)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.tabPanel}>
        {active === "novo" && (
          <section id="analytics-panel-novo" role="tabpanel" tabIndex={0} aria-labelledby="analytics-tab-novo" className={styles.panel}>
            <h2 className={styles.panelTitle}>Novo rascunho</h2>
            <form className={styles.stackWide} onSubmit={create}>
              <div className={styles.field}>
                <label htmlFor="analytics-hypothesis">Hipótese explícita</label>
                <textarea id="analytics-hypothesis" required minLength={20} value={form.hypothesis} onChange={event => setForm({ ...form, hypothesis: event.target.value })} />
              </div>
              <div className={styles.field}>
                <label htmlFor="analytics-description">Descrição e escopo</label>
                <textarea id="analytics-description" required minLength={10} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} />
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="analytics-variant-a">Variante A</label>
                  <input id="analytics-variant-a" required minLength={3} value={form.variant_a} onChange={event => setForm({ ...form, variant_a: event.target.value })} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="analytics-variant-b">Variante B</label>
                  <input id="analytics-variant-b" required minLength={3} value={form.variant_b} onChange={event => setForm({ ...form, variant_b: event.target.value })} />
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor="analytics-metric">Métrica declarada</label>
                <input id="analytics-metric" required minLength={3} value={form.metric_name} onChange={event => setForm({ ...form, metric_name: event.target.value })} />
              </div>
              <div className={styles.field}>
                <label htmlFor="analytics-privacy">Nota de privacidade e minimização</label>
                <textarea id="analytics-privacy" required minLength={10} value={form.privacy_note} onChange={event => setForm({ ...form, privacy_note: event.target.value })} />
              </div>
              <div className={styles.actions}>
                <button className="primary" type="submit" disabled={busy}>{busy ? "Registrando…" : "Registrar rascunho"}</button>
              </div>
              <p className={styles.hint}>O rascunho não executa nada. A aprovação humana é uma ação separada e também não inicia a execução.</p>
            </form>
          </section>
        )}

        {active === "experimentos" && (
          <section id="analytics-panel-experimentos" role="tabpanel" tabIndex={0} aria-labelledby="analytics-tab-experimentos" className={styles.panel}>
            <h2 className={styles.panelTitle}>Experimentos canônicos</h2>
            {list.phase === "loading" && <UiState variant="loading" title="Carregando experimentos canônicos…" detail="Nada é exibido como zero enquanto a leitura não termina." />}
            {list.phase === "failed" && list.error && (
              <UiState
                variant={analyticsErrorVariant(list.error)}
                title={list.error.title}
                detail={`${list.error.detail} Esta falha não significa que a lista esteja vazia e nenhuma métrica foi assumida como zero. ${analyticsErrorFootnote(list.error)}`}
                onRetry={list.error.canRetry ? () => { void load(); } : undefined}
              />
            )}
            {list.phase === "ready" && items.length === 0 && (
              <UiState variant="empty" title="A leitura funcionou e nenhum experimento canônico está registrado." detail="Sem hipótese registrada não há experimento; nada é inventado aqui." />
            )}
            {list.phase === "ready" && items.length > 0 && (
              <div className={styles.cards}>
                {items.map(item => (
                  <article className={styles.card} key={item.id}>
                    <h3 className={styles.cardTitle}>{item.protocol}</h3>
                    <p className={styles.hint}>
                      <span className={styles.tone} data-tone={experimentStatusTone(item.status)}>{experimentStatusLabel(item.status)}</span>
                      {" · métrica declarada: "}{honestText(item.metric_name)}
                    </p>
                    <p className={styles.hint}>{variantLabel("A")}: {honestText(item.variant_a)} · {variantLabel("B")}: {honestText(item.variant_b)}</p>
                    <p className={styles.hint}>
                      Observações registradas: {count(item.observations_count)} · aprovação humana: {item.approved_at ? `registrada em ${honestDateTime(item.approved_at)}` : "pendente"}
                    </p>
                    <div className={styles.actions}>
                      <button type="button" onClick={() => void open(item.id)}>Abrir trilha</button>
                      {item.status === "rascunho" && !item.approved_at && <button type="button" onClick={() => void approve(item.id)}>Registrar aprovação humana</button>}
                      {item.status === "rascunho" && item.approved_at && <button type="button" onClick={() => void change(item.id, "em_execucao")}>Iniciar após aprovação</button>}
                      {item.status === "em_execucao" && <button type="button" onClick={() => void change(item.id, "rascunho", { justification: "Execução revertida para revisão humana." })}>Reverter para rascunho</button>}
                      {item.status !== "arquivado" && item.status !== "concluido" && <button type="button" onClick={() => void change(item.id, "cancelado", { justification: "Execução cancelada por decisão operacional." })}>Cancelar</button>}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {active === "trilha" && (
          <section id="analytics-panel-trilha" role="tabpanel" tabIndex={0} aria-labelledby="analytics-tab-trilha" className={styles.panel}>
            <h2 className={styles.panelTitle}>Trilha do experimento</h2>
            {!detail && <UiState variant="empty" title="Nenhum experimento aberto." detail="Escolha um experimento na aba de experimentos canônicos para ver a trilha real." />}
            {detail?.phase === "loading" && <UiState variant="loading" title="Carregando a trilha do experimento…" />}
            {detail?.phase === "failed" && detail.error && (
              <UiState
                variant={analyticsErrorVariant(detail.error)}
                title={detail.error.title}
                detail={`${detail.error.detail} A trilha não foi exibida como vazia por causa desta falha. ${analyticsErrorFootnote(detail.error)}`}
                onRetry={detail.error.canRetry && current?.experiment.id ? () => { void open(current.experiment.id); } : undefined}
              />
            )}
            {detail?.phase === "ready" && current && (
              <div className={styles.stackWide}>
                <h3 className={styles.cardTitle}>{current.experiment.protocol}</h3>
                <p className={styles.hint}>
                  <span className={styles.tone} data-tone={experimentStatusTone(current.experiment.status)}>{experimentStatusLabel(current.experiment.status)}</span>
                  {" · hipótese: "}{honestText(current.experiment.hypothesis)}
                </p>
                <p className={styles.hint}>{current.result.conclusion}</p>
                {!current.result.sufficient_for_descriptive_view && (
                  <UiState
                    variant="empty"
                    title="Não há dados suficientes para uma leitura descritiva."
                    detail="Falta pelo menos uma observação real de cada variante. O sistema não completa a lacuna com estimativa, vencedor ou significância."
                  />
                )}
                <div className={styles.metrics}>
                  {current.result.by_variant.map(row => (
                    <div className={styles.metric} key={row.variant}>
                      <span className={styles.metricLabel}>{variantLabel(row.variant)}</span>
                      <span className={styles.metricValue}>{count(row.observation_count)}</span>
                      <span className={styles.hint}>observações · amostra agregada {count(row.sample_size)} · total da métrica {decimal(row.metric_total)}</span>
                    </div>
                  ))}
                </div>
                <p className={styles.hint}>
                  Eventos imutáveis: {count(current.events?.length)} · observações de origem interna: {count(current.observations?.length)}
                </p>
                {current.observations.length === 0 ? (
                  <UiState variant="empty" title="Nenhuma observação registrada para este experimento." detail="A leitura funcionou; a ausência de observação não é zero de métrica." />
                ) : (
                  <ul className={styles.scrollList}>
                    {current.observations.map(row => (
                      <li key={row.id}>
                        {variantLabel(row.variant)} · {honestText(row.metric_name)} = {decimal(row.metric_value)} · amostra {count(row.sample_size)} · {sourceTypeLabel(row.source_type)} · origem registrada em {honestDateTime(row.source_recorded_at)}
                      </li>
                    ))}
                  </ul>
                )}
                {current.events.length === 0 ? (
                  <UiState variant="empty" title="Nenhum evento registrado." detail="A trilha append-only ainda não tem evento para este experimento." />
                ) : (
                  <ul className={styles.scrollList}>
                    {current.events.map(row => (
                      <li key={row.id}>{honestDateTime(row.created_at)} · {honestText(row.event_type)} · {honestText(row.summary)}</li>
                    ))}
                  </ul>
                )}
                <p className={styles.footnote}>
                  O sistema não exibe nem aceita vencedor ou significância estatística sem metodologia e dados reais registrados.
                  Esta tela é apresentação da jornada canônica EXT-11; o protótipo não passa a ser produto homologado por causa do acabamento visual.
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
