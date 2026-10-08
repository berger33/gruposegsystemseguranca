"use client";

// ADM-01..12 — painel funcional do Marcelo.
//
// Nenhum número desta tela é digitado ou presumido: todos vêm de
// /api/adm/panel/*, calculados no servidor a partir de registros canônicos.
// Falha de leitura aparece como falha (com "Tentar novamente"), nunca como
// zero ou lista vazia. Todo cartão abre o detalhamento e o registro real.

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import UiState from "../../../components/ui/UiState";
import UiBadge from "../../../components/ui/UiBadge";
import {
  admErrorFootnote,
  admErrorVariant,
  admPriorityLabel,
  admPriorityTone,
  describeAdmError,
} from "../../../lib/adm-vocabulary.mjs";
import styles from "../../../components/ui/UiWorkspace.module.css";
import executive from "./MarceloPanel.module.css";

// UX-05: a falha continua sendo lançada com o MESMO `message` canônico de
// antes (nada que dependia disso quebra), mas agora carrega um `descriptor`
// com a explicação em português. Nenhuma URL, método ou corpo mudou.
type AdmFailure = ReturnType<typeof describeAdmError>;
function failureOf(error: unknown): AdmFailure {
  const attached = (error as { descriptor?: AdmFailure })?.descriptor;
  if (attached) return attached;
  return describeAdmError(error instanceof Error ? error.message : null, 0);
}

type IndicatorValue = { record_count: number; amount_cents: number | null };
type Indicator = {
  code: string;
  requirement: string;
  label: string;
  unit: "count" | "cents";
  source: { tables: string[]; period_field: string; kind: string };
  note: string | null;
  period: { start: string; end: string };
  as_of: string;
  status: "ok" | "indisponivel";
  value: IndicatorValue | null;
  empty_reason: string | null;
  unavailable_reason: string | null;
};
type DrilldownRecord = {
  record_kind: string;
  record_id: string;
  record_label: string;
  record_detail: string;
  priority: string;
  responsible: string;
  reference_at: string | null;
  amount_cents: number | null;
  canonical: { api: string; table: string | null; path: string | null };
};
type RecordResponse = { record_kind: string; source_table: string; canonical_path: string | null; projected_columns: string[]; record: Record<string, unknown> };
type Decision = { id: string; source_kind: string; source_id: string; decision: string; amount_cents: string | number; authority_limit_cents: string | number | null; created_at: string };
type Report = { id: string; protocol: string; title: string; status: string; totals: Record<string, unknown>; created_at: string };
type BusinessConfig = { id: string; config_key: string; version: number; is_active: boolean; category: string; config_value: Record<string, unknown>; created_at: string };
type Goal = {
  goal_id: string; title: string; period: { start: string; end: string };
  target: { value: number; kind: string; is_estimate: boolean; source: string };
  realized: { value: number | null; record_count: number; source: string; as_of: string; empty_reason: string | null } | null;
  realized_status: string; unavailable_reason: string | null; comparison_note: string;
};
type DiaryEntry = { id: string; title: string; decision: string; category: string; visibility: string; decision_date: string };
type ExpansionBlock = { key: string; label: string; kind: string; source: { tables: string[] }; status: string; value: { record_count: number; total_value: number | null } | null; empty_reason: string | null; unavailable_reason: string | null };
type WorkspaceItem = { id: string; module?: string; query?: string; filter_name?: string; shortcut_name?: string; url?: string };

const brl = (cents: number | null | undefined) =>
  cents == null ? "Sem valor monetário no período" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
const testId = (code: string) => code.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function fail(code: string | null, status: number): never {
  const error = new Error(String(code || `erro_${status}`)) as Error & { descriptor?: AdmFailure };
  error.descriptor = describeAdmError(code, status);
  throw error;
}
async function panelGet<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { headers: { accept: "application/json" }, cache: "no-store" });
  } catch {
    return fail(null, 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return fail((data as { error?: string }).error || null, response.status);
  return data as T;
}
async function panelPost<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return fail(null, 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return fail((data as { error?: string }).error || null, response.status);
  return data as T;
}

type Tab = "indicadores" | "aprovacoes" | "espaco" | "relatorios" | "configuracoes" | "metas" | "diario" | "expansao";

// UX-05: as abas viram um tablist de verdade. Antes eram `<button aria-selected>`
// soltos dentro de um `<nav>`, o que é ARIA inválido: `aria-selected` só tem
// significado em `role="tab"`. Os data-testid são exatamente os mesmos.
/** Data-base em português; o valor canônico fica no atributo `dateTime`. */
function formatarDataHora(valor: string): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function indicatorHeading(label: string): { area: string; title: string } {
  const separator = label.indexOf(" — ");
  if (separator < 0) return { area: "Indicador", title: label };
  return { area: label.slice(0, separator), title: label.slice(separator + 3) };
}

function formatarContagem(valor: number | null | undefined): string {
  return valor == null ? "—" : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(valor);
}

const TABS: [Tab, string][] = [
  ["indicadores", "Indicadores"], ["aprovacoes", "Aprovações"], ["espaco", "Espaço de trabalho"],
  ["relatorios", "Relatórios"], ["configuracoes", "Configurações"], ["metas", "Metas x realizado"],
  ["diario", "Diário de decisões"], ["expansao", "Expansão"],
];

export default function MarceloPanel() {
  const [tab, setTab] = useState<Tab>("indicadores");
  const [period, setPeriod] = useState({ start: "2026-01-01", end: "2026-12-31" });

  const [indicators, setIndicators] = useState<Indicator[] | null>(null);
  const [asOf, setAsOf] = useState<string>("");
  const [scope, setScope] = useState<{ role: string; can_decide: boolean } | null>(null);
  // UX-05: "ainda não li" deixa de ser indistinguível de "li e não há nada".
  const [indicatorsState, setIndicatorsState] = useState<"loading" | "ready" | "failed">("loading");
  const [indicatorsError, setIndicatorsError] = useState<AdmFailure | null>(null);

  const [drilldown, setDrilldown] = useState<{ code: string; records: DrilldownRecord[] } | null>(null);
  const [drilldownError, setDrilldownError] = useState<AdmFailure | null>(null);
  const [record, setRecord] = useState<RecordResponse | null>(null);
  const [recordError, setRecordError] = useState<AdmFailure | null>(null);

  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState<AdmFailure | null>(null);

  const loadIndicators = useCallback(async () => {
    setIndicatorsError(null);
    setIndicatorsState("loading");
    try {
      const data = await panelGet<{ indicators: Indicator[]; as_of: string; scope: { role: string; can_decide: boolean } }>(
        `/api/adm/panel/indicators?period_start=${period.start}&period_end=${period.end}`,
      );
      setIndicators(data.indicators);
      setAsOf(data.as_of);
      setScope(data.scope);
      setIndicatorsState("ready");
    } catch (error) {
      // Falha NUNCA vira zero: os cartões somem por inteiro.
      setIndicators(null);
      setIndicatorsError(failureOf(error));
      setIndicatorsState("failed");
    }
  }, [period.start, period.end]);

  useEffect(() => { loadIndicators(); }, [loadIndicators]);

  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  function onTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex(([id]) => id === tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    const target = TABS[next][0];
    setTab(target);
    tabRefs.current[target]?.focus();
  }

  const openDrilldown = async (code: string) => {
    setDrilldownError(null); setRecord(null); setRecordError(null);
    try {
      const data = await panelGet<{ records: DrilldownRecord[] }>(
        `/api/adm/panel/drilldown?indicator=${encodeURIComponent(code)}&period_start=${period.start}&period_end=${period.end}`,
      );
      setDrilldown({ code, records: data.records });
    } catch (error) {
      setDrilldown(null);
      setDrilldownError(failureOf(error));
    }
  };

  const openRecord = async (item: DrilldownRecord) => {
    setRecordError(null);
    try { setRecord(await panelGet<RecordResponse>(item.canonical.api)); }
    catch (error) { setRecord(null); setRecordError(failureOf(error)); }
  };

  return (
    <main data-testid="marcelo-panel" className={`${styles.workspace} ${executive.workspace}`}>
      <nav className={styles.breadcrumbNav} aria-label="Trilha de navegação">
        <a href="/admin">Início</a> · <span aria-current="page">Painel de decisões</span>
      </nav>

      <header className={executive.pageIntro}>
        <div>
          <p className={executive.eyebrow}>Visão executiva</p>
          <h1>Painel do Marcelo</h1>
          <p className={styles.lede}>
            Indicadores, decisões e acompanhamento dos módulos em um só lugar. Os números vêm dos registros reais;
            falhas de leitura aparecem como falhas, nunca como zero.
          </p>
        </div>
        <p className={executive.readOnlyNote}>Ações externas e pagamentos não são executados por este painel.</p>
      </header>

      <section className={`${styles.panel} ${executive.periodPanel}`} aria-labelledby="adm-periodo-titulo">
        <div className={executive.periodHeading}>
          <div>
            <p className={executive.eyebrow}>Filtro de análise</p>
            <h2 id="adm-periodo-titulo" className={styles.panelTitle}>Período dos indicadores</h2>
          </div>
          <p className={styles.hint}>Escolha as datas e aplique para atualizar os dados.</p>
        </div>
        <form
          data-testid="adm-period-form"
          onSubmit={(event: FormEvent) => { event.preventDefault(); loadIndicators(); }}
        >
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label htmlFor="adm-periodo-inicio">Início do período</label>
              <input id="adm-periodo-inicio" data-testid="adm-period-start" type="date" value={period.start} onChange={event => setPeriod({ ...period, start: event.target.value })} />
            </div>
            <div className={styles.field}>
              <label htmlFor="adm-periodo-fim">Fim do período</label>
              <input id="adm-periodo-fim" data-testid="adm-period-end" type="date" value={period.end} onChange={event => setPeriod({ ...period, end: event.target.value })} />
            </div>
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.primary} data-testid="adm-period-apply">Aplicar período</button>
            {scope ? (
              <span data-testid="adm-scope">
                <UiBadge tone={scope.can_decide ? "success" : "neutral"} srPrefix="Sua sessão">
                  Papel: {scope.role} · {scope.can_decide ? "pode decidir" : "somente leitura"}
                </UiBadge>
              </span>
            ) : null}
          </div>
        </form>
      </section>

      <div className={styles.tabs} role="tablist" aria-label="Frentes do painel de decisões">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`adm-aba-${id}`}
            data-testid={`adm-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`adm-painel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            ref={element => { tabRefs.current[id] = element; }}
            className={tab === id ? styles.tabActive : styles.tab}
            onClick={() => setTab(id)}
            onKeyDown={onTabKeyDown}
          >
            {label}
          </button>
        ))}
      </div>

      {notice ? <p role="status" data-testid="adm-notice">{notice}</p> : null}
      {actionError ? (
        <div className={`${styles.notice} ${styles.noticeError}`} data-testid="adm-action-error-box">
          <strong>{actionError.title}</strong>
          <p role="alert" data-testid="adm-action-error">Não foi possível concluir: {actionError.code || `HTTP ${actionError.status}`}</p>
          <p className={styles.hint}>{actionError.detail} {admErrorFootnote(actionError)}</p>
        </div>
      ) : null}

      {tab === "indicadores" ? (
        <section data-testid="adm-indicators" className={`${styles.panel} ${executive.indicatorsPanel}`} role="tabpanel" id="adm-painel-indicadores" aria-labelledby="adm-aba-indicadores" tabIndex={-1}>
          <div className={executive.sectionHeading}>
            <div>
              <p className={executive.eyebrow}>Resumo por área</p>
              <h2 className={styles.panelTitle}>O que exige a sua decisão neste período</h2>
            </div>
            {indicators ? <span className={executive.updateStamp} data-testid="adm-as-of">Apurado <time dateTime={asOf}>{formatarDataHora(asOf)}</time></span> : null}
          </div>

          {/* UX-05: carregando deixou de ser indistinguível de "não há nada". */}
          {indicatorsState === "loading" ? (
            <UiState
              variant="loading"
              title="Apurando os indicadores a partir dos registros canônicos…"
              detail="Ainda não sabemos quantos registros existem no período. Nenhum número é exibido antes da resposta."
            />
          ) : null}

          {indicatorsError ? (
            <UiState
              variant={admErrorVariant(indicatorsError)}
              title={indicatorsError.title}
              detail={`${indicatorsError.detail} ${admErrorFootnote(indicatorsError)}`}
            >
              {/* Mantém a frase e os identificadores que o gate L07 observa. */}
              <p role="alert" data-testid="adm-read-error">
                Não foi possível carregar os indicadores ({indicatorsError.code || `HTTP ${indicatorsError.status}`}). Nenhum número é exibido no lugar.
              </p>
              <div className={styles.actions}>
                <button type="button" className={styles.primary} data-testid="adm-retry" onClick={loadIndicators}>
                  {indicatorsError.canRetry ? "Tentar novamente" : "Tentar novamente mesmo assim"}
                </button>
              </div>
            </UiState>
          ) : null}

          {indicators ? (
            <>
              <div className={executive.indicatorGrid}>
                {indicators.map(indicator => {
                  const heading = indicatorHeading(indicator.label);
                  return (
                  <article key={indicator.code} className={`${styles.card} ${executive.indicatorCard}`} data-testid={`adm-card-${testId(indicator.code)}`}>
                    <header className={executive.indicatorHeader}>
                      <div>
                        <span className={executive.areaTag}>{heading.area}</span>
                        <h3 className={styles.cardTitle}>{heading.title}</h3>
                      </div>
                      <span className={executive.requirementTag} title={`Referência interna ${indicator.requirement}`}>{indicator.requirement}</span>
                    </header>
                    {indicator.status === "indisponivel" ? (
                      <div className={executive.unavailable} data-testid={`adm-card-unavailable-${testId(indicator.code)}`}>
                        <UiBadge tone="warning" srPrefix="Situação">Indisponível</UiBadge>
                        <p>{indicator.unavailable_reason}. Não há número estimado nem zero no lugar.</p>
                      </div>
                    ) : (
                      <div className={executive.metricBlock}>
                        <div className={executive.metricPrimary}>
                          <p className={executive.metricValue} data-testid={`adm-card-amount-${testId(indicator.code)}`}>
                            {indicator.unit === "cents"
                              ? indicator.value?.amount_cents == null ? "—" : brl(indicator.value.amount_cents)
                              : formatarContagem(indicator.value?.record_count)}
                          </p>
                          <span className={executive.metricLabel}>{indicator.unit === "cents" ? "valor total" : "registros canônicos"}</span>
                        </div>
                        <p className={indicator.unit === "cents" ? executive.recordCount : styles.visuallyHidden} data-testid={`adm-card-count-${testId(indicator.code)}`}>
                          {formatarContagem(indicator.value?.record_count)} {indicator.value?.record_count === 1 ? "registro canônico" : "registros canônicos"}
                        </p>
                        {indicator.empty_reason ? <p className={executive.emptyNote} data-testid={`adm-card-empty-${testId(indicator.code)}`}>Sem registros canônicos no período.</p> : null}
                      </div>
                    )}
                    {indicator.note ? <p className={styles.hint}>{indicator.note}</p> : null}
                    <details className={executive.metadata}>
                      <summary>Fonte e período</summary>
                      <dl className={styles.facts}>
                        <div>
                          <dt>Fonte</dt>
                          <dd data-testid={`adm-card-source-${testId(indicator.code)}`}>{indicator.source.tables.join(", ")} · {indicator.source.period_field}</dd>
                        </div>
                        <div>
                          <dt>Período</dt>
                          <dd data-testid={`adm-card-period-${testId(indicator.code)}`}>Período: {indicator.period.start} a {indicator.period.end}</dd>
                        </div>
                      </dl>
                    </details>
                    <div className={`${styles.actions} ${executive.cardActions}`}>
                      <button data-testid={`adm-card-drill-${testId(indicator.code)}`} onClick={() => openDrilldown(indicator.code)}>
                        Ver registros
                        <span className={styles.visuallyHidden}> de {indicator.label}</span>
                      </button>
                    </div>
                  </article>
                  );
                })}
              </div>
            </>
          ) : null}

          {drilldownError ? (
            <div className={`${styles.notice} ${styles.noticeError}`}>
              <strong>{drilldownError.title}</strong>
              <p role="alert" data-testid="adm-drilldown-error">Não foi possível abrir o detalhamento ({drilldownError.code || `HTTP ${drilldownError.status}`}). A lista não é apresentada vazia.</p>
              <p className={styles.hint}>{drilldownError.detail} {admErrorFootnote(drilldownError)}</p>
              <div className={styles.actions}>
                <button data-testid="adm-drilldown-retry" onClick={() => drilldown && openDrilldown(drilldown.code)}>Tentar novamente</button>
              </div>
            </div>
          ) : null}

          {drilldown ? (
            <section data-testid="adm-drilldown">
              <h3>Registros de {drilldown.code}</h3>
              {drilldown.records.length === 0 ? (
                <p data-testid="adm-drilldown-empty">Nenhum registro canônico no período (leitura concluída com sucesso).</p>
              ) : (
                <table>
                  <thead><tr><th>Registro</th><th>Detalhe</th><th>Prioridade</th><th>Responsável</th><th>Valor</th><th>Ação</th></tr></thead>
                  <tbody>
                    {drilldown.records.map(item => (
                      <tr key={`${item.record_kind}-${item.record_id}`} data-testid={`adm-drill-row-${item.record_id}`}>
                        <td>{item.record_label}</td>
                        <td>{item.record_detail}</td>
                        <td>{item.priority}</td>
                        <td>{item.responsible}</td>
                        <td>{item.amount_cents == null ? "Sem valor" : brl(item.amount_cents)}</td>
                        <td><button data-testid={`adm-open-record-${item.record_id}`} onClick={() => openRecord(item)}>Abrir registro</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ) : null}

          {recordError ? (
            <div className={`${styles.notice} ${styles.noticeError}`}>
              <strong>{recordError.title}</strong>
              <p role="alert" data-testid="adm-record-error">Não foi possível abrir o registro ({recordError.code || `HTTP ${recordError.status}`}).</p>
              <p className={styles.hint}>{recordError.detail} {admErrorFootnote(recordError)}</p>
            </div>
          ) : null}
          {record ? (
            <section data-testid="adm-record">
              <h3>Registro canônico</h3>
              <p data-testid="adm-record-table">Tabela: {record.source_table} · Área: {record.canonical_path}</p>
              <p data-testid="adm-record-id">Identificador: {String(record.record.id)}</p>
              <dl>
                {record.projected_columns.map(column => (
                  <div key={column}><dt>{column}</dt><dd data-testid={`adm-record-field-${column}`}>{String(record.record[column] ?? "sem valor")}</dd></div>
                ))}
              </dl>
            </section>
          ) : null}
        </section>
      ) : null}

      {tab === "aprovacoes" ? <ApprovalsTab period={period} canDecide={scope?.can_decide === true} onNotice={setNotice} onError={setActionError} /> : null}
      {tab === "espaco" ? <WorkspaceTab canWrite={scope?.can_decide === true} onNotice={setNotice} onError={setActionError} /> : null}
      {tab === "relatorios" ? <ReportsTab period={period} indicators={indicators} canWrite={scope?.can_decide === true} onNotice={setNotice} onError={setActionError} /> : null}
      {tab === "configuracoes" ? <ConfigsTab canWrite={scope?.can_decide === true} onNotice={setNotice} onError={setActionError} /> : null}
      {tab === "metas" ? <GoalsTab period={period} /> : null}
      {tab === "diario" ? <DiaryTab /> : null}
      {tab === "expansao" ? <ExpansionTab period={period} /> : null}
    </main>
  );
}

function ApprovalsTab({ period, canDecide, onNotice, onError }: { period: { start: string; end: string }; canDecide: boolean; onNotice: (value: string) => void; onError: (value: AdmFailure | null) => void }) {
  const [pending, setPending] = useState<DrilldownRecord[] | null>(null);
  const [error, setError] = useState<AdmFailure | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [selected, setSelected] = useState<DrilldownRecord | null>(null);
  const [reason, setReason] = useState("");
  const [key, setKey] = useState("");
  const [deciding, setDeciding] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await panelGet<{ records: DrilldownRecord[] }>(`/api/adm/panel/drilldown?indicator=ADM-06.aprovacoes_pendentes&period_start=${period.start}&period_end=${period.end}`);
      setPending(data.records);
      const list = await panelGet<{ decisions: Decision[] }>("/api/adm/panel/decisions");
      setDecisions(list.decisions);
    } catch (e) { setPending(null); setError(failureOf(e)); }
  }, [period.start, period.end]);
  useEffect(() => { load(); }, [load]);

  const decide = async (decision: "aprovada" | "rejeitada") => {
    if (!selected || deciding) return;
    setDeciding(true);
    onError(null); onNotice("");
    try {
      await panelPost("/api/adm/panel/decisions", { source_kind: selected.record_kind, source_id: selected.record_id, decision, reason, idempotency_key: key });
      onNotice(`Decisão ${decision} registrada no registro canônico com autoria da sessão.`);
      setSelected(null); setReason(""); setKey("");
      await load();
    } catch (e) { onError(failureOf(e)); }
    finally { setDeciding(false); }
  };

  return (
    <section data-testid="adm-approvals" className={styles.panel} role="tabpanel" id="adm-painel-aprovacoes" aria-labelledby="adm-aba-aprovacoes" tabIndex={-1}>
      <h2 className={styles.panelTitle}>Aprovação unificada</h2>
      <p className={styles.requiredNote}>Requisito ADM-06 · aprovação unificada</p>
      <p>A alçada é política configurável do financeiro: sem alçada ativa ninguém aprova, e o solicitante não decide a própria pendência.</p>
      {!canDecide ? <p data-testid="adm-approvals-readonly"><UiBadge tone="warning" srPrefix="Permissão">Somente leitura</UiBadge> Seu papel tem acesso somente leitura: a decisão é recusada no servidor.</p> : null}
      {!error && pending === null ? (
        <UiState variant="loading" title="Carregando as pendências de aprovação…" detail="Enquanto a consulta não responde, nenhuma lista vazia é mostrada." />
      ) : null}
      {error ? (
        <div className={`${styles.notice} ${styles.noticeError}`}>
          <strong>{error.title}</strong>
          <p role="alert" data-testid="adm-approvals-error">Não foi possível carregar as pendências ({error.code || `HTTP ${error.status}`}).</p>
          <p className={styles.hint}>{error.detail} {admErrorFootnote(error)}</p>
          <div className={styles.actions}><button data-testid="adm-approvals-retry" onClick={load}>Tentar novamente</button></div>
        </div>
      ) : null}
      {pending ? (
        <ul>
          {pending.length === 0 ? <li data-testid="adm-approvals-empty">Nenhuma pendência canônica no período.</li> : pending.map(item => (
            <li key={item.record_id} data-testid={`adm-approval-${item.record_id}`}>
              {item.record_label} · {item.record_detail} · {brl(item.amount_cents)} ·{" "}
              <button data-testid={`adm-approval-select-${item.record_id}`} onClick={() => setSelected(item)}>Selecionar</button>
            </li>
          ))}
        </ul>
      ) : null}
      {selected ? (
        <form className={styles.sectionCard} data-testid="adm-decision-form" onSubmit={event => { event.preventDefault(); }} aria-labelledby="adm-decisao-titulo">
          <h3 id="adm-decisao-titulo" className={styles.cardTitle}>Decidir: {selected.record_label}</h3>
          {/* Qual registro está aberto nunca fica implícito. */}
          <p data-testid="adm-decision-selected">{selected.record_kind} · {selected.record_id}</p>
          <p className={styles.hint}>Valor envolvido: {brl(selected.amount_cents)}. A alçada é verificada no servidor e o solicitante não decide a própria pendência.</p>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label htmlFor="adm-decisao-motivo">Motivo da decisão <span className={styles.required}>obrigatório</span></label>
              <input id="adm-decisao-motivo" data-testid="adm-decision-reason" value={reason} onChange={event => setReason(event.target.value)} aria-describedby="adm-decisao-motivo-ajuda" />
              <p id="adm-decisao-motivo-ajuda" className={styles.hint}>Entre 10 e 1000 caracteres. Fica registrado no diário de decisões com a sua autoria.</p>
            </div>
            <div className={styles.field}>
              <label htmlFor="adm-decisao-chave">Chave de idempotência <span className={styles.required}>obrigatório</span></label>
              <input id="adm-decisao-chave" data-testid="adm-decision-key" value={key} onChange={event => setKey(event.target.value)} aria-describedby="adm-decisao-chave-ajuda" />
              <p id="adm-decisao-chave-ajuda" className={styles.hint}>Identifica esta tentativa. Repetir a mesma chave não grava a decisão duas vezes.</p>
            </div>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.primary} data-testid="adm-decision-approve" disabled={deciding} onClick={() => decide("aprovada")}>
              {deciding ? "Registrando…" : "Aprovar"}
            </button>
            <button type="button" data-testid="adm-decision-reject" disabled={deciding} onClick={() => decide("rejeitada")}>
              {deciding ? "Registrando…" : "Rejeitar"}
            </button>
            <button type="button" data-testid="adm-decision-cancel" onClick={() => setSelected(null)}>Fechar sem decidir</button>
          </div>
        </form>
      ) : null}
      <h3>Decisões registradas</h3>
      <ul data-testid="adm-decision-list">
        {decisions.map(item => (
          <li key={item.id} data-testid={`adm-decision-${item.source_id}`}>
            {item.source_kind} · {item.decision} · {brl(Number(item.amount_cents))} · alçada aplicada {item.authority_limit_cents == null ? "não aplicável" : brl(Number(item.authority_limit_cents))}
          </li>
        ))}
      </ul>
    </section>
  );
}

function WorkspaceTab({ canWrite, onNotice, onError }: { canWrite: boolean; onNotice: (value: string) => void; onError: (value: AdmFailure | null) => void }) {
  const [data, setData] = useState<{ scope_identity: string; favorites: WorkspaceItem[]; filters: WorkspaceItem[]; shortcuts: WorkspaceItem[] } | null>(null);
  const [error, setError] = useState<AdmFailure | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try { setData(await panelGet("/api/adm/panel/workspace")); }
    catch (e) { setData(null); setError(failureOf(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    onError(null); onNotice("");
    try {
      await panelPost("/api/adm/panel/workspace", { kind: "favorite", query, module: "painel-marcelo" });
      onNotice("Favorito salvo no escopo da sua identidade.");
      setQuery(""); await load();
    } catch (e) { onError(failureOf(e)); }
  };

  return (
    <section data-testid="adm-workspace" className={styles.panel} role="tabpanel" id="adm-painel-espaco" aria-labelledby="adm-aba-espaco" tabIndex={-1}>
      <h2 className={styles.panelTitle}>Busca, favoritos, filtros e atalhos</h2>
      <p className={styles.requiredNote}>Requisito ADM-07 · busca, favoritos, filtros e atalhos</p>
      <p>O escopo é decidido no servidor pela sessão: ninguém lê o espaço de trabalho de outra identidade.</p>
      {!error && data === null ? (
        <UiState variant="loading" title="Carregando o seu espaço de trabalho…" detail="Favoritos, filtros e atalhos ainda estão sendo lidos." />
      ) : null}
      {error ? (
        <div className={`${styles.notice} ${styles.noticeError}`}>
          <strong>{error.title}</strong>
          <p role="alert" data-testid="adm-workspace-error">Não foi possível carregar o espaço de trabalho ({error.code || `HTTP ${error.status}`}).</p>
          <p className={styles.hint}>{error.detail} {admErrorFootnote(error)}</p>
          <div className={styles.actions}><button data-testid="adm-workspace-retry" onClick={load}>Tentar novamente</button></div>
        </div>
      ) : null}
      {data ? (
        <>
          <p data-testid="adm-workspace-scope">Escopo: {data.scope_identity}</p>
          <ul data-testid="adm-workspace-favorites">
            {data.favorites.length === 0 ? <li data-testid="adm-workspace-empty">Nenhum favorito salvo.</li> : data.favorites.map(item => <li key={item.id}>{item.query} · {item.module}</li>)}
          </ul>
        </>
      ) : null}
      {canWrite ? (
        <form onSubmit={event => { event.preventDefault(); save(); }}>
          <div className={styles.field}>
            <label htmlFor="adm-espaco-busca">Busca a salvar como favorito</label>
            <input id="adm-espaco-busca" data-testid="adm-workspace-query" value={query} onChange={event => setQuery(event.target.value)} />
          </div>
          <div className={styles.actions}><button className={styles.primary} data-testid="adm-workspace-save">Salvar favorito</button></div>
        </form>
      ) : <p data-testid="adm-workspace-readonly"><UiBadge tone="warning" srPrefix="Permissão">Somente leitura</UiBadge> Somente leitura para o seu papel.</p>}
    </section>
  );
}

function ReportsTab({ period, indicators, canWrite, onNotice, onError }: { period: { start: string; end: string }; indicators: Indicator[] | null; canWrite: boolean; onNotice: (value: string) => void; onError: (value: AdmFailure | null) => void }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<AdmFailure | null>(null);
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("ADM-04.recebiveis_vencidos");
  const [key, setKey] = useState("");
  const [downloaded, setDownloaded] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setReports((await panelGet<{ reports: Report[] }>("/api/adm/panel/reports")).reports); }
    catch (e) { setReports(null); setError(failureOf(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    onError(null); onNotice("");
    try {
      await panelPost("/api/adm/panel/reports", { indicator_code: code, title, period_start: period.start, period_end: period.end, idempotency_key: key });
      onNotice("Relatório gerado a partir do indicador canônico, com campos limitados e geração registrada.");
      setTitle(""); setKey(""); await load();
    } catch (e) { onError(failureOf(e)); }
  };
  const download = async (id: string) => {
    onError(null);
    try { setDownloaded(await panelGet<Record<string, unknown>>(`/api/adm/panel/report-download?id=${id}`)); }
    catch (e) { setDownloaded(null); onError(failureOf(e)); }
  };

  return (
    <section data-testid="adm-reports" className={styles.panel} role="tabpanel" id="adm-painel-relatorios" aria-labelledby="adm-aba-relatorios" tabIndex={-1}>
      <h2 className={styles.panelTitle}>Relatórios limitados e auditados</h2>
      <p className={styles.requiredNote}>Requisito ADM-08 · relatórios limitados e auditados</p>
      <p>O relatório não envia e-mail nem sai do sistema: ele é gerado do indicador canônico, limitado a campos agregados e tem geração e acesso registrados.</p>
      {!error && reports === null ? (
        <UiState variant="loading" title="Carregando os relatórios já emitidos…" detail="A lista aparece só depois da resposta do servidor." />
      ) : null}
      {error ? (
        <div className={`${styles.notice} ${styles.noticeError}`}>
          <strong>{error.title}</strong>
          <p role="alert" data-testid="adm-reports-error">Não foi possível carregar os relatórios ({error.code || `HTTP ${error.status}`}).</p>
          <p className={styles.hint}>{error.detail} {admErrorFootnote(error)}</p>
          <div className={styles.actions}><button data-testid="adm-reports-retry" onClick={load}>Tentar novamente</button></div>
        </div>
      ) : null}
      {canWrite ? (
        <form onSubmit={event => { event.preventDefault(); create(); }}>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label htmlFor="adm-relatorio-indicador">Indicador de origem</label>
              <select id="adm-relatorio-indicador" data-testid="adm-report-indicator" value={code} onChange={event => setCode(event.target.value)}>
                {(indicators || []).map(indicator => <option key={indicator.code} value={indicator.code}>{indicator.label} ({indicator.code})</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="adm-relatorio-titulo">Título do relatório</label>
              <input id="adm-relatorio-titulo" data-testid="adm-report-title" value={title} onChange={event => setTitle(event.target.value)} />
            </div>
            <div className={styles.field}>
              <label htmlFor="adm-relatorio-chave">Chave de idempotência</label>
              <input id="adm-relatorio-chave" data-testid="adm-report-key" value={key} onChange={event => setKey(event.target.value)} aria-describedby="adm-relatorio-chave-ajuda" />
              <p id="adm-relatorio-chave-ajuda" className={styles.hint}>Repetir a mesma chave não gera um segundo relatório.</p>
            </div>
          </div>
          <div className={styles.actions}><button className={styles.primary} data-testid="adm-report-create">Gerar relatório</button></div>
        </form>
      ) : <p data-testid="adm-reports-readonly"><UiBadge tone="warning" srPrefix="Permissão">Somente leitura</UiBadge> Somente leitura para o seu papel.</p>}
      <ul data-testid="adm-report-list">
        {(reports || []).map(report => (
          <li key={report.id} data-testid={`adm-report-${report.id}`}>
            {report.protocol} · {report.title} · {report.status}{" "}
            <button data-testid={`adm-report-download-${report.id}`} onClick={() => download(report.id)}>Abrir conteúdo</button>
          </li>
        ))}
      </ul>
      {downloaded ? <pre data-testid="adm-report-content">{JSON.stringify(downloaded, null, 2)}</pre> : null}
    </section>
  );
}

function ConfigsTab({ canWrite, onNotice, onError }: { canWrite: boolean; onNotice: (value: string) => void; onError: (value: AdmFailure | null) => void }) {
  const [configs, setConfigs] = useState<BusinessConfig[] | null>(null);
  const [error, setError] = useState<AdmFailure | null>(null);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("{\"sla_horas\":24}");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try { setConfigs((await panelGet<{ configs: BusinessConfig[] }>("/api/adm/panel/business-configs")).configs); }
    catch (e) { setConfigs(null); setError(failureOf(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    onError(null); onNotice("");
    try {
      await panelPost("/api/adm/panel/business-configs", { config_key: key, category: "painel", config_value: JSON.parse(value), reason });
      onNotice("Nova versão da configuração registrada; a versão anterior continua preservada.");
      setReason(""); await load();
    } catch (e) { onError(failureOf(e)); }
  };

  return (
    <section data-testid="adm-configs" className={styles.panel} role="tabpanel" id="adm-painel-configuracoes" aria-labelledby="adm-aba-configuracoes" tabIndex={-1}>
      <h2 className={styles.panelTitle}>Configurações de negócio versionadas</h2>
      <p className={styles.requiredNote}>Requisito ADM-09 · configurações de negócio versionadas</p>
      {!error && configs === null ? (
        <UiState variant="loading" title="Carregando as configurações versionadas…" detail="Nenhuma versão é exibida antes da leitura." />
      ) : null}
      {error ? (
        <div className={`${styles.notice} ${styles.noticeError}`}>
          <strong>{error.title}</strong>
          <p role="alert" data-testid="adm-configs-error">Não foi possível carregar as configurações ({error.code || `HTTP ${error.status}`}).</p>
          <p className={styles.hint}>{error.detail} {admErrorFootnote(error)}</p>
          <div className={styles.actions}><button data-testid="adm-configs-retry" onClick={load}>Tentar novamente</button></div>
        </div>
      ) : null}
      {canWrite ? (
        <form onSubmit={event => { event.preventDefault(); save(); }}>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label htmlFor="adm-config-chave">Chave da configuração</label>
              <input id="adm-config-chave" data-testid="adm-config-key" value={key} onChange={event => setKey(event.target.value)} />
            </div>
            <div className={styles.field}>
              <label htmlFor="adm-config-valor">Valor (JSON)</label>
              <input id="adm-config-valor" data-testid="adm-config-value" value={value} onChange={event => setValue(event.target.value)} aria-describedby="adm-config-valor-ajuda" />
              <p id="adm-config-valor-ajuda" className={styles.hint}>JSON válido. A versão anterior é preservada, nunca sobrescrita.</p>
            </div>
            <div className={styles.field}>
              <label htmlFor="adm-config-motivo">Motivo da alteração <span className={styles.required}>obrigatório</span></label>
              <input id="adm-config-motivo" data-testid="adm-config-reason" value={reason} onChange={event => setReason(event.target.value)} aria-describedby="adm-config-motivo-ajuda" />
              <p id="adm-config-motivo-ajuda" className={styles.hint}>Entre 10 e 1000 caracteres.</p>
            </div>
          </div>
          <div className={styles.actions}><button className={styles.primary} data-testid="adm-config-save">Salvar nova versão</button></div>
        </form>
      ) : <p data-testid="adm-configs-readonly"><UiBadge tone="warning" srPrefix="Permissão">Somente leitura</UiBadge> Somente leitura para o seu papel.</p>}
      <ul data-testid="adm-config-list">
        {(configs || []).map(config => (
          <li key={config.id} data-testid={`adm-config-${config.config_key}-v${config.version}`}>
            {config.config_key} · versão {config.version} · {config.is_active ? "ativa" : "preservada"}
          </li>
        ))}
      </ul>
    </section>
  );
}

function GoalsTab({ period }: { period: { start: string; end: string } }) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [error, setError] = useState<AdmFailure | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try { setGoals((await panelGet<{ goals: Goal[] }>(`/api/adm/panel/goals?period_start=${period.start}&period_end=${period.end}`)).goals); }
    catch (e) { setGoals(null); setError(failureOf(e)); }
  }, [period.start, period.end]);
  useEffect(() => { load(); }, [load]);
  return (
    <section data-testid="adm-goals" className={styles.panel} role="tabpanel" id="adm-painel-metas" aria-labelledby="adm-aba-metas" tabIndex={-1}>
      <h2 className={styles.panelTitle}>Meta estimada x realizado canônico</h2>
      <p className={styles.requiredNote}>Requisito ADM-10 · meta (estimativa) x realizado (registro canônico)</p>
      {!error && goals === null ? (
        <UiState variant="loading" title="Carregando metas e realizado…" detail="Meta é estimativa; realizado vem do registro canônico." />
      ) : null}
      {error ? (
        <div className={`${styles.notice} ${styles.noticeError}`}>
          <strong>{error.title}</strong>
          <p role="alert" data-testid="adm-goals-error">Não foi possível carregar as metas ({error.code || `HTTP ${error.status}`}).</p>
          <p className={styles.hint}>{error.detail} {admErrorFootnote(error)}</p>
          <div className={styles.actions}><button data-testid="adm-goals-retry" onClick={load}>Tentar novamente</button></div>
        </div>
      ) : null}
      <ul data-testid="adm-goal-list">
        {(goals || []).length === 0 && goals ? <li data-testid="adm-goals-empty">Nenhuma meta canônica no período.</li> : null}
        {(goals || []).map(goal => (
          <li key={goal.goal_id} data-testid={`adm-goal-${goal.goal_id}`}>
            <strong>{goal.title}</strong>
            <span data-testid={`adm-goal-target-${goal.goal_id}`}> · meta (estimativa): {goal.target.value}</span>
            <span data-testid={`adm-goal-realized-${goal.goal_id}`}>
              {" "}· realizado: {goal.realized_status === "indisponivel"
                ? `indisponível (${goal.unavailable_reason})`
                : goal.realized?.value == null ? "sem registro canônico no período" : `${goal.realized.value} (${goal.realized.source})`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DiaryTab() {
  const [entries, setEntries] = useState<DiaryEntry[] | null>(null);
  const [restricted, setRestricted] = useState(false);
  const [error, setError] = useState<AdmFailure | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await panelGet<{ entries: DiaryEntry[]; restricted_visible: boolean }>("/api/adm/panel/decision-diary");
      setEntries(data.entries); setRestricted(data.restricted_visible);
    } catch (e) { setEntries(null); setError(failureOf(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <section data-testid="adm-diary" className={styles.panel} role="tabpanel" id="adm-painel-diario" aria-labelledby="adm-aba-diario" tabIndex={-1}>
      <h2 className={styles.panelTitle}>Diário de decisões</h2>
      <p className={styles.requiredNote}>Requisito ADM-11 · diário de decisões CON-11</p>
      <p>Cada leitura registra o acesso na mesma transação da auditoria; sem auditoria, a leitura é recusada.</p>
      {!error && entries === null ? (
        <UiState variant="loading" title="Carregando o diário de decisões…" detail="Nenhuma entrada é exibida antes da leitura." />
      ) : null}
      {error ? (
        <div className={`${styles.notice} ${styles.noticeError}`}>
          <strong>{error.title}</strong>
          <p role="alert" data-testid="adm-diary-error">Não foi possível carregar o diário ({error.code || `HTTP ${error.status}`}).</p>
          <p className={styles.hint}>{error.detail} {admErrorFootnote(error)}</p>
          <div className={styles.actions}><button data-testid="adm-diary-retry" onClick={load}>Tentar novamente</button></div>
        </div>
      ) : null}
      {entries ? <p data-testid="adm-diary-scope">{restricted ? "Inclui decisões restritas e de diretoria." : "Decisões restritas e de diretoria estão ocultas para o seu papel."}</p> : null}
      <ul data-testid="adm-diary-list">
        {(entries || []).map(entry => <li key={entry.id} data-testid={`adm-diary-${entry.id}`}>{entry.title} · {entry.visibility} · {String(entry.decision_date).slice(0, 10)}</li>)}
      </ul>
    </section>
  );
}

function ExpansionTab({ period }: { period: { start: string; end: string } }) {
  const [blocks, setBlocks] = useState<ExpansionBlock[] | null>(null);
  const [error, setError] = useState<AdmFailure | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try { setBlocks((await panelGet<{ blocks: ExpansionBlock[] }>(`/api/adm/panel/expansion?period_start=${period.start}&period_end=${period.end}`)).blocks); }
    catch (e) { setBlocks(null); setError(failureOf(e)); }
  }, [period.start, period.end]);
  useEffect(() => { load(); }, [load]);
  return (
    <section data-testid="adm-expansion" className={styles.panel} role="tabpanel" id="adm-painel-expansao" aria-labelledby="adm-aba-expansao" tabIndex={-1}>
      <h2 className={styles.panelTitle}>Análises alimentadas pelos módulos reais</h2>
      <p className={styles.requiredNote}>Requisito ADM-12 · análises alimentadas pelos módulos reais</p>
      {!error && blocks === null ? (
        <UiState variant="loading" title="Carregando as análises de expansão…" detail="Os blocos aparecem só depois da resposta." />
      ) : null}
      {error ? (
        <div className={`${styles.notice} ${styles.noticeError}`}>
          <strong>{error.title}</strong>
          <p role="alert" data-testid="adm-expansion-error">Não foi possível carregar as análises ({error.code || `HTTP ${error.status}`}).</p>
          <p className={styles.hint}>{error.detail} {admErrorFootnote(error)}</p>
          <div className={styles.actions}><button data-testid="adm-expansion-retry" onClick={load}>Tentar novamente</button></div>
        </div>
      ) : null}
      <ul data-testid="adm-expansion-list">
        {(blocks || []).map(block => (
          <li key={block.key} data-testid={`adm-expansion-${block.key}`}>
            {block.label} · {block.kind} · fonte {block.source.tables.join(", ")} ·{" "}
            {block.status === "indisponivel" ? `indisponível (${block.unavailable_reason})` : `${block.value?.record_count} registro(s)`}
          </li>
        ))}
      </ul>
    </section>
  );
}
