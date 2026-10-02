"use client";

// ADM-01..12 — painel funcional do Marcelo.
//
// Nenhum número desta tela é digitado ou presumido: todos vêm de
// /api/adm/panel/*, calculados no servidor a partir de registros canônicos.
// Falha de leitura aparece como falha (com "Tentar novamente"), nunca como
// zero ou lista vazia. Todo cartão abre o detalhamento e o registro real.

import { FormEvent, useCallback, useEffect, useState } from "react";

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

async function panelGet<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { accept: "application/json" }, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String((data as { error?: string }).error || `erro_${response.status}`));
  return data as T;
}
async function panelPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String((data as { error?: string }).error || `erro_${response.status}`));
  return data as T;
}

type Tab = "indicadores" | "aprovacoes" | "espaco" | "relatorios" | "configuracoes" | "metas" | "diario" | "expansao";

export default function MarceloPanel() {
  const [tab, setTab] = useState<Tab>("indicadores");
  const [period, setPeriod] = useState({ start: "2026-01-01", end: "2026-12-31" });

  const [indicators, setIndicators] = useState<Indicator[] | null>(null);
  const [asOf, setAsOf] = useState<string>("");
  const [scope, setScope] = useState<{ role: string; can_decide: boolean } | null>(null);
  const [indicatorsError, setIndicatorsError] = useState("");

  const [drilldown, setDrilldown] = useState<{ code: string; records: DrilldownRecord[] } | null>(null);
  const [drilldownError, setDrilldownError] = useState("");
  const [record, setRecord] = useState<RecordResponse | null>(null);
  const [recordError, setRecordError] = useState("");

  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");

  const loadIndicators = useCallback(async () => {
    setIndicatorsError("");
    try {
      const data = await panelGet<{ indicators: Indicator[]; as_of: string; scope: { role: string; can_decide: boolean } }>(
        `/api/adm/panel/indicators?period_start=${period.start}&period_end=${period.end}`,
      );
      setIndicators(data.indicators);
      setAsOf(data.as_of);
      setScope(data.scope);
    } catch (error) {
      setIndicators(null);
      setIndicatorsError(error instanceof Error ? error.message : "falha_desconhecida");
    }
  }, [period.start, period.end]);

  useEffect(() => { loadIndicators(); }, [loadIndicators]);

  const openDrilldown = async (code: string) => {
    setDrilldownError(""); setRecord(null); setRecordError("");
    try {
      const data = await panelGet<{ records: DrilldownRecord[] }>(
        `/api/adm/panel/drilldown?indicator=${encodeURIComponent(code)}&period_start=${period.start}&period_end=${period.end}`,
      );
      setDrilldown({ code, records: data.records });
    } catch (error) {
      setDrilldown(null);
      setDrilldownError(error instanceof Error ? error.message : "falha_desconhecida");
    }
  };

  const openRecord = async (item: DrilldownRecord) => {
    setRecordError("");
    try { setRecord(await panelGet<RecordResponse>(item.canonical.api)); }
    catch (error) { setRecord(null); setRecordError(error instanceof Error ? error.message : "falha_desconhecida"); }
  };

  return (
    <main data-testid="marcelo-panel" style={{ padding: "2rem", maxWidth: 1200, margin: "auto", fontFamily: "system-ui, sans-serif" }}>
      <header>
        <h1>Painel do Marcelo</h1>
        <p>
          Indicadores calculados dos registros canônicos. Período, fonte e data-base aparecem em cada cartão; falha de leitura é declarada
          como falha e nunca vira zero. Nenhum dado real de cliente, pagamento, emissão ou envio externo é produzido aqui.
        </p>
      </header>

      <form
        data-testid="adm-period-form"
        onSubmit={(event: FormEvent) => { event.preventDefault(); loadIndicators(); }}
        style={{ display: "flex", gap: 8, margin: "1rem 0", flexWrap: "wrap" }}
      >
        <label>Início <input data-testid="adm-period-start" type="date" value={period.start} onChange={event => setPeriod({ ...period, start: event.target.value })} /></label>
        <label>Fim <input data-testid="adm-period-end" type="date" value={period.end} onChange={event => setPeriod({ ...period, end: event.target.value })} /></label>
        <button data-testid="adm-period-apply">Aplicar período</button>
        {scope ? <span data-testid="adm-scope">Papel: {scope.role} · {scope.can_decide ? "pode decidir" : "somente leitura"}</span> : null}
      </form>

      <nav aria-label="Abas do painel" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "1rem 0" }}>
        {([
          ["indicadores", "Indicadores"], ["aprovacoes", "Aprovações"], ["espaco", "Espaço de trabalho"], ["relatorios", "Relatórios"],
          ["configuracoes", "Configurações"], ["metas", "Metas x realizado"], ["diario", "Diário de decisões"], ["expansao", "Expansão"],
        ] as [Tab, string][]).map(([id, label]) => (
          <button key={id} data-testid={`adm-tab-${id}`} aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {notice ? <p role="status" data-testid="adm-notice">{notice}</p> : null}
      {actionError ? <p role="alert" data-testid="adm-action-error">Não foi possível concluir: {actionError}</p> : null}

      {tab === "indicadores" ? (
        <section data-testid="adm-indicators">
          <h2>Indicadores (ADM-01 a ADM-06 e ADM-12)</h2>
          {indicatorsError ? (
            <div>
              <p role="alert" data-testid="adm-read-error">Não foi possível carregar os indicadores ({indicatorsError}). Nenhum número é exibido no lugar.</p>
              <button data-testid="adm-retry" onClick={loadIndicators}>Tentar novamente</button>
            </div>
          ) : null}
          {indicators ? (
            <>
              <p data-testid="adm-as-of">Data-base da apuração: {asOf}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                {indicators.map(indicator => (
                  <article key={indicator.code} data-testid={`adm-card-${testId(indicator.code)}`} style={{ border: "1px solid #94a3b8", borderRadius: 8, padding: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>{indicator.requirement} · {indicator.label}</h3>
                    {indicator.status === "indisponivel" ? (
                      <p data-testid={`adm-card-unavailable-${testId(indicator.code)}`}>
                        Indicador indisponível: {indicator.unavailable_reason}. Não há número estimado nem zero no lugar.
                      </p>
                    ) : (
                      <>
                        <p data-testid={`adm-card-count-${testId(indicator.code)}`}>{indicator.value?.record_count} registro(s) canônico(s)</p>
                        <p data-testid={`adm-card-amount-${testId(indicator.code)}`}>{indicator.unit === "cents" ? brl(indicator.value?.amount_cents ?? null) : "Indicador de contagem"}</p>
                        {indicator.empty_reason ? <p data-testid={`adm-card-empty-${testId(indicator.code)}`}>Sem registro canônico no período informado.</p> : null}
                      </>
                    )}
                    <p data-testid={`adm-card-source-${testId(indicator.code)}`}>Fonte: {indicator.source.tables.join(", ")} · {indicator.source.period_field}</p>
                    <p data-testid={`adm-card-period-${testId(indicator.code)}`}>Período: {indicator.period.start} a {indicator.period.end}</p>
                    {indicator.note ? <p>{indicator.note}</p> : null}
                    <button data-testid={`adm-card-drill-${testId(indicator.code)}`} onClick={() => openDrilldown(indicator.code)}>Abrir registros</button>
                  </article>
                ))}
              </div>
            </>
          ) : null}

          {drilldownError ? (
            <div>
              <p role="alert" data-testid="adm-drilldown-error">Não foi possível abrir o detalhamento ({drilldownError}). A lista não é apresentada vazia.</p>
              <button data-testid="adm-drilldown-retry" onClick={() => drilldown && openDrilldown(drilldown.code)}>Tentar novamente</button>
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

          {recordError ? <p role="alert" data-testid="adm-record-error">Não foi possível abrir o registro ({recordError}).</p> : null}
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

function ApprovalsTab({ period, canDecide, onNotice, onError }: { period: { start: string; end: string }; canDecide: boolean; onNotice: (value: string) => void; onError: (value: string) => void }) {
  const [pending, setPending] = useState<DrilldownRecord[] | null>(null);
  const [error, setError] = useState("");
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [selected, setSelected] = useState<DrilldownRecord | null>(null);
  const [reason, setReason] = useState("");
  const [key, setKey] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const data = await panelGet<{ records: DrilldownRecord[] }>(`/api/adm/panel/drilldown?indicator=ADM-06.aprovacoes_pendentes&period_start=${period.start}&period_end=${period.end}`);
      setPending(data.records);
      const list = await panelGet<{ decisions: Decision[] }>("/api/adm/panel/decisions");
      setDecisions(list.decisions);
    } catch (e) { setPending(null); setError(e instanceof Error ? e.message : "falha_desconhecida"); }
  }, [period.start, period.end]);
  useEffect(() => { load(); }, [load]);

  const decide = async (decision: "aprovada" | "rejeitada") => {
    if (!selected) return;
    onError(""); onNotice("");
    try {
      await panelPost("/api/adm/panel/decisions", { source_kind: selected.record_kind, source_id: selected.record_id, decision, reason, idempotency_key: key });
      onNotice(`Decisão ${decision} registrada no registro canônico com autoria da sessão.`);
      setSelected(null); setReason(""); setKey("");
      await load();
    } catch (e) { onError(e instanceof Error ? e.message : "falha_desconhecida"); }
  };

  return (
    <section data-testid="adm-approvals">
      <h2>ADM-06 — aprovação unificada</h2>
      <p>A alçada é política configurável do financeiro: sem alçada ativa ninguém aprova, e o solicitante não decide a própria pendência.</p>
      {!canDecide ? <p data-testid="adm-approvals-readonly">Seu papel tem acesso somente leitura: a decisão é recusada no servidor.</p> : null}
      {error ? (
        <div>
          <p role="alert" data-testid="adm-approvals-error">Não foi possível carregar as pendências ({error}).</p>
          <button data-testid="adm-approvals-retry" onClick={load}>Tentar novamente</button>
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
        <form data-testid="adm-decision-form" onSubmit={event => { event.preventDefault(); }}>
          <p data-testid="adm-decision-selected">{selected.record_kind} · {selected.record_id}</p>
          <input data-testid="adm-decision-reason" placeholder="Motivo (10 a 1000 caracteres)" value={reason} onChange={event => setReason(event.target.value)} />
          <input data-testid="adm-decision-key" placeholder="Chave de idempotência" value={key} onChange={event => setKey(event.target.value)} />
          <button type="button" data-testid="adm-decision-approve" onClick={() => decide("aprovada")}>Aprovar</button>
          <button type="button" data-testid="adm-decision-reject" onClick={() => decide("rejeitada")}>Rejeitar</button>
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

function WorkspaceTab({ canWrite, onNotice, onError }: { canWrite: boolean; onNotice: (value: string) => void; onError: (value: string) => void }) {
  const [data, setData] = useState<{ scope_identity: string; favorites: WorkspaceItem[]; filters: WorkspaceItem[]; shortcuts: WorkspaceItem[] } | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setError("");
    try { setData(await panelGet("/api/adm/panel/workspace")); }
    catch (e) { setData(null); setError(e instanceof Error ? e.message : "falha_desconhecida"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    onError(""); onNotice("");
    try {
      await panelPost("/api/adm/panel/workspace", { kind: "favorite", query, module: "painel-marcelo" });
      onNotice("Favorito salvo no escopo da sua identidade.");
      setQuery(""); await load();
    } catch (e) { onError(e instanceof Error ? e.message : "falha_desconhecida"); }
  };

  return (
    <section data-testid="adm-workspace">
      <h2>ADM-07 — busca, favoritos, filtros e atalhos</h2>
      <p>O escopo é decidido no servidor pela sessão: ninguém lê o espaço de trabalho de outra identidade.</p>
      {error ? (
        <div>
          <p role="alert" data-testid="adm-workspace-error">Não foi possível carregar o espaço de trabalho ({error}).</p>
          <button data-testid="adm-workspace-retry" onClick={load}>Tentar novamente</button>
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
          <input data-testid="adm-workspace-query" placeholder="Busca a salvar" value={query} onChange={event => setQuery(event.target.value)} />
          <button data-testid="adm-workspace-save">Salvar favorito</button>
        </form>
      ) : <p data-testid="adm-workspace-readonly">Somente leitura para o seu papel.</p>}
    </section>
  );
}

function ReportsTab({ period, indicators, canWrite, onNotice, onError }: { period: { start: string; end: string }; indicators: Indicator[] | null; canWrite: boolean; onNotice: (value: string) => void; onError: (value: string) => void }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("ADM-04.recebiveis_vencidos");
  const [key, setKey] = useState("");
  const [downloaded, setDownloaded] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    setError("");
    try { setReports((await panelGet<{ reports: Report[] }>("/api/adm/panel/reports")).reports); }
    catch (e) { setReports(null); setError(e instanceof Error ? e.message : "falha_desconhecida"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    onError(""); onNotice("");
    try {
      await panelPost("/api/adm/panel/reports", { indicator_code: code, title, period_start: period.start, period_end: period.end, idempotency_key: key });
      onNotice("Relatório gerado a partir do indicador canônico, com campos limitados e geração registrada.");
      setTitle(""); setKey(""); await load();
    } catch (e) { onError(e instanceof Error ? e.message : "falha_desconhecida"); }
  };
  const download = async (id: string) => {
    onError("");
    try { setDownloaded(await panelGet<Record<string, unknown>>(`/api/adm/panel/report-download?id=${id}`)); }
    catch (e) { setDownloaded(null); onError(e instanceof Error ? e.message : "falha_desconhecida"); }
  };

  return (
    <section data-testid="adm-reports">
      <h2>ADM-08 — relatórios limitados e auditados</h2>
      <p>O relatório não envia e-mail nem sai do sistema: ele é gerado do indicador canônico, limitado a campos agregados e tem geração e acesso registrados.</p>
      {error ? (
        <div>
          <p role="alert" data-testid="adm-reports-error">Não foi possível carregar os relatórios ({error}).</p>
          <button data-testid="adm-reports-retry" onClick={load}>Tentar novamente</button>
        </div>
      ) : null}
      {canWrite ? (
        <form onSubmit={event => { event.preventDefault(); create(); }}>
          <select data-testid="adm-report-indicator" value={code} onChange={event => setCode(event.target.value)}>
            {(indicators || []).map(indicator => <option key={indicator.code} value={indicator.code}>{indicator.code}</option>)}
          </select>
          <input data-testid="adm-report-title" placeholder="Título do relatório" value={title} onChange={event => setTitle(event.target.value)} />
          <input data-testid="adm-report-key" placeholder="Chave de idempotência" value={key} onChange={event => setKey(event.target.value)} />
          <button data-testid="adm-report-create">Gerar relatório</button>
        </form>
      ) : <p data-testid="adm-reports-readonly">Somente leitura para o seu papel.</p>}
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

function ConfigsTab({ canWrite, onNotice, onError }: { canWrite: boolean; onNotice: (value: string) => void; onError: (value: string) => void }) {
  const [configs, setConfigs] = useState<BusinessConfig[] | null>(null);
  const [error, setError] = useState("");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("{\"sla_horas\":24}");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setError("");
    try { setConfigs((await panelGet<{ configs: BusinessConfig[] }>("/api/adm/panel/business-configs")).configs); }
    catch (e) { setConfigs(null); setError(e instanceof Error ? e.message : "falha_desconhecida"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    onError(""); onNotice("");
    try {
      await panelPost("/api/adm/panel/business-configs", { config_key: key, category: "painel", config_value: JSON.parse(value), reason });
      onNotice("Nova versão da configuração registrada; a versão anterior continua preservada.");
      setReason(""); await load();
    } catch (e) { onError(e instanceof Error ? e.message : "falha_desconhecida"); }
  };

  return (
    <section data-testid="adm-configs">
      <h2>ADM-09 — configurações de negócio versionadas</h2>
      {error ? (
        <div>
          <p role="alert" data-testid="adm-configs-error">Não foi possível carregar as configurações ({error}).</p>
          <button data-testid="adm-configs-retry" onClick={load}>Tentar novamente</button>
        </div>
      ) : null}
      {canWrite ? (
        <form onSubmit={event => { event.preventDefault(); save(); }}>
          <input data-testid="adm-config-key" placeholder="Chave da configuração" value={key} onChange={event => setKey(event.target.value)} />
          <input data-testid="adm-config-value" placeholder="Valor JSON" value={value} onChange={event => setValue(event.target.value)} />
          <input data-testid="adm-config-reason" placeholder="Motivo (10 a 1000 caracteres)" value={reason} onChange={event => setReason(event.target.value)} />
          <button data-testid="adm-config-save">Salvar nova versão</button>
        </form>
      ) : <p data-testid="adm-configs-readonly">Somente leitura para o seu papel.</p>}
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
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try { setGoals((await panelGet<{ goals: Goal[] }>(`/api/adm/panel/goals?period_start=${period.start}&period_end=${period.end}`)).goals); }
    catch (e) { setGoals(null); setError(e instanceof Error ? e.message : "falha_desconhecida"); }
  }, [period.start, period.end]);
  useEffect(() => { load(); }, [load]);
  return (
    <section data-testid="adm-goals">
      <h2>ADM-10 — meta (estimativa) x realizado (registro canônico)</h2>
      {error ? (
        <div>
          <p role="alert" data-testid="adm-goals-error">Não foi possível carregar as metas ({error}).</p>
          <button data-testid="adm-goals-retry" onClick={load}>Tentar novamente</button>
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
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const data = await panelGet<{ entries: DiaryEntry[]; restricted_visible: boolean }>("/api/adm/panel/decision-diary");
      setEntries(data.entries); setRestricted(data.restricted_visible);
    } catch (e) { setEntries(null); setError(e instanceof Error ? e.message : "falha_desconhecida"); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <section data-testid="adm-diary">
      <h2>ADM-11 — diário de decisões CON-11</h2>
      <p>Cada leitura registra o acesso na mesma transação da auditoria; sem auditoria, a leitura é recusada.</p>
      {error ? (
        <div>
          <p role="alert" data-testid="adm-diary-error">Não foi possível carregar o diário ({error}).</p>
          <button data-testid="adm-diary-retry" onClick={load}>Tentar novamente</button>
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
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try { setBlocks((await panelGet<{ blocks: ExpansionBlock[] }>(`/api/adm/panel/expansion?period_start=${period.start}&period_end=${period.end}`)).blocks); }
    catch (e) { setBlocks(null); setError(e instanceof Error ? e.message : "falha_desconhecida"); }
  }, [period.start, period.end]);
  useEffect(() => { load(); }, [load]);
  return (
    <section data-testid="adm-expansion">
      <h2>ADM-12 — análises alimentadas pelos módulos reais</h2>
      {error ? (
        <div>
          <p role="alert" data-testid="adm-expansion-error">Não foi possível carregar as análises ({error}).</p>
          <button data-testid="adm-expansion-retry" onClick={load}>Tentar novamente</button>
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
