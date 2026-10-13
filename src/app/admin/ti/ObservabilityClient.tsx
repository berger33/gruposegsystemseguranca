"use client";

import { useState } from "react";
import UiState from "@/components/ui/UiState";
import UiTableScroll from "@/components/ui/UiTableScroll";
import styles from "./TechnicalOpsClient.module.css";

type ViewType = "summary" | "requests" | "jobs" | "db" | "alerts";
const VIEW_LABELS: Record<ViewType, string> = {
  summary: "Visão geral",
  requests: "Requisições HTTP",
  jobs: "Tarefas em segundo plano",
  db: "Consultas ao banco",
  alerts: "Alertas",
};
const ERROR_LABELS: Record<string, string> = {
  admin_session_required: "Entre novamente para consultar a observabilidade.",
  observability_restricted_admin_ti: "Seu perfil não tem acesso a esta área.",
  observability_unavailable: "Os dados de observabilidade estão temporariamente indisponíveis.",
  observability_restricted: "Seu perfil não pode atualizar alertas.",
  alert_action_failed: "Não foi possível atualizar o alerta. Tente novamente.",
  not_found: "Este alerta não está mais disponível.",
};

function errorLabel(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return ERROR_LABELS[code] ?? "Não foi possível concluir a operação. Tente novamente.";
}
function numberLabel(value: unknown, suffix = "") {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toLocaleString("pt-BR")}${suffix}` : "—";
}
function dateLabel(value: string | undefined) {
  if (!value) return "Data indisponível";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data indisponível" : date.toLocaleString("pt-BR");
}

export default function ObservabilityClient() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [type, setType] = useState<ViewType>("summary");
  const [limit, setLimit] = useState("50");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [workingAlert, setWorkingAlert] = useState("");

  async function load(selectedType = type) {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const safeLimit = String(Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 50)));
      const r = await fetch(`/api/admin/observability?type=${selectedType}&limit=${safeLimit}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "load_failed");
      setData(j);
      setLoaded(true);
    } catch (e) {
      setData(null);
      setError(errorLabel(e));
    } finally {
      setLoading(false);
    }
  }

  async function ackAlert(id: string, action: "acknowledge" | "resolve") {
    setWorkingAlert(id);
    setError("");
    setNotice("");
    try {
      const r = await fetch(`/api/admin/observability/alerts/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "alert_action_failed");
      await load();
      setNotice(action === "acknowledge" ? "Alerta reconhecido." : "Alerta resolvido.");
    } catch (e) {
      setError(errorLabel(e));
    } finally {
      setWorkingAlert("");
    }
  }

  const memory = data?.memory;
  const alerts = type === "summary" ? (memory?.alerts_firing ?? []) : (data?.alerts ?? data?.memory_firing ?? []);
  const records = type === "requests" ? (data?.requests ?? data?.memory_recent ?? []) : type === "jobs" ? (data?.jobs ?? data?.memory_recent ?? []) : (data?.db_metrics ?? data?.memory_recent ?? []);
  const countForView = type === "requests" ? (data?.requests ?? data?.memory_recent ?? []).length : type === "jobs" ? (data?.jobs ?? data?.memory_recent ?? []).length : (data?.db_metrics ?? data?.memory_recent ?? []).length;

  return (
    <section className={styles.workspace} aria-labelledby="observability-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Saúde e operação · PLT-06</p>
          <h2 id="observability-title">Observabilidade do sistema</h2>
          <p>Acompanhe volume, falhas, duração e alertas. Identificadores técnicos e eventos detalhados ficam em consultas específicas.</p>
        </div>
      </header>

      <form className={styles.toolbar} onSubmit={event => { event.preventDefault(); void load(); }} aria-label="Consulta de observabilidade">
        <label className={styles.field} htmlFor="observability-view"><span>O que deseja consultar?</span>
          <select id="observability-view" value={type} onChange={e => { setType(e.target.value as ViewType); setData(null); setLoaded(false); setError(""); }}>
            {(Object.keys(VIEW_LABELS) as ViewType[]).map(view => <option key={view} value={view}>{VIEW_LABELS[view]}</option>)}
          </select>
        </label>
        {type !== "summary" && <label className={styles.field} htmlFor="observability-limit"><span>Quantidade máxima</span>
          <input id="observability-limit" type="number" min="1" max="200" value={limit} onChange={e => setLimit(e.target.value)} aria-describedby="observability-limit-hint" />
          <span className={styles.hint} id="observability-limit-hint">De 1 a 200 registros.</span>
        </label>}
        <button type="submit" className={styles.primary} disabled={loading}>{loading ? "Consultando…" : `Consultar ${VIEW_LABELS[type].toLocaleLowerCase("pt-BR")}`}</button>
      </form>

      {error && <UiState variant="error" title="Consulta não concluída" detail={error} onRetry={() => void load()} />}
      {notice && <UiState variant="success" title="Ação registrada" detail={notice} />}
      {loading && !data && <UiState variant="loading" title={`Consultando ${VIEW_LABELS[type].toLocaleLowerCase("pt-BR")}`} detail="Aguarde a resposta do serviço de observabilidade." />}
      {!loading && loaded && !error && !data && <UiState variant="empty" title="Nenhum dado retornado" detail="A consulta foi concluída, mas não retornou conteúdo para esta visualização." />}

      {data && type === "summary" && memory && (
        <div className={styles.content}>
          <p className={styles.period}>Resumo em memória do processo e agregados do banco na última hora quando disponíveis.</p>
          <div className={styles.metrics}>
            <article className={styles.metric}><span>Requisições HTTP</span><strong>{numberLabel(memory.http_requests_total)}</strong><small>{numberLabel(memory.http_requests_5xx)} respostas 5xx · {numberLabel(memory.http_requests_4xx)} respostas 4xx</small><small>Duração média: {numberLabel(memory.http_avg_duration_ms, " ms")}</small></article>
            <article className={styles.metric}><span>Banco de dados</span><strong>{numberLabel(memory.db_queries_total)}</strong><small>{numberLabel(memory.db_queries_failed)} consultas com falha</small><small>Duração média: {numberLabel(memory.db_avg_duration_ms, " ms")}</small></article>
            <article className={styles.metric}><span>Tarefas em segundo plano</span><strong>{numberLabel(memory.jobs_total)}</strong><small>{numberLabel(memory.jobs_failed)} tarefas com falha</small><small>Tempo ativo: {numberLabel(memory.uptime_seconds, " s")}</small></article>
            <article className={styles.metric}><span>Alertas em aberto</span><strong>{numberLabel(memory.alerts_firing?.length ?? 0)}</strong><small>{numberLabel(data.db_aggregates?.alerts?.critical)} críticos no agregado disponível</small></article>
          </div>

          {data.db_aggregates && <section className={styles.subsection} aria-labelledby="aggregate-title">
            <h3 id="aggregate-title">Indicadores consolidados · última hora</h3>
            <UiTableScroll><table className={styles.table}><thead><tr><th scope="col">Área</th><th scope="col">Volume</th><th scope="col">Falhas</th><th scope="col">Duração média</th><th scope="col">Duração máxima</th></tr></thead><tbody>
              <tr><th scope="row">Requisições HTTP</th><td>{numberLabel(data.db_aggregates.http_1h?.total)}</td><td>{numberLabel(data.db_aggregates.http_1h?.cnt_5xx)} respostas 5xx</td><td>{numberLabel(data.db_aggregates.http_1h?.avg_duration, " ms")}</td><td>{numberLabel(data.db_aggregates.http_1h?.max_duration, " ms")}</td></tr>
              <tr><th scope="row">Tarefas</th><td>{numberLabel(data.db_aggregates.jobs_1h?.total)}</td><td>{numberLabel(data.db_aggregates.jobs_1h?.failed)}</td><td>{numberLabel(data.db_aggregates.jobs_1h?.avg_duration, " ms")}</td><td>—</td></tr>
              <tr><th scope="row">Consultas ao banco</th><td>{numberLabel(data.db_aggregates.db_1h?.total)}</td><td>{numberLabel(data.db_aggregates.db_1h?.failed)}</td><td>{numberLabel(data.db_aggregates.db_1h?.avg_duration, " ms")}</td><td>{numberLabel(data.db_aggregates.db_1h?.max_duration, " ms")}</td></tr>
            </tbody></table></UiTableScroll>
          </section>}

          <AlertList alerts={alerts} workingAlert={workingAlert} onAction={ackAlert} />
          <details className={styles.diagnostics}>
            <summary>Diagnóstico técnico: requisições recentes em memória</summary>
          {(memory.recent_requests ?? []).length === 0 ? <p className={styles.muted}>Nenhuma requisição recente disponível.</p> : <UiTableScroll><table className={styles.table}><thead><tr><th scope="col">Horário</th><th scope="col">Método e caminho</th><th scope="col">Status</th><th scope="col">Duração</th><th scope="col">Tipo de acesso</th><th scope="col">Falha sanitizada</th><th scope="col">IDs de correlação</th></tr></thead><tbody>{memory.recent_requests.map((r: any) => <tr key={r.request_id}><td>{dateLabel(r.created_at)}</td><td><span className={styles.code}>{r.method} {r.path}</span></td><td>{numberLabel(r.status_code)}</td><td>{numberLabel(r.duration_ms, " ms")}</td><td>{r.user_kind || "Anônimo"}</td><td>{r.error_sanitized || "—"}</td><td><span className={styles.code}>{r.request_id}</span><span className={styles.secondary}>{r.correlation_id || "—"}</span></td></tr>)}</tbody></table></UiTableScroll>}
          </details>
        </div>
      )}

      {data && type === "alerts" && <div className={styles.content}><AlertList alerts={alerts} workingAlert={workingAlert} onAction={ackAlert} emptyTitle="Não há alertas nesta consulta" /></div>}

      {data && ["requests", "jobs", "db"].includes(type) && <div className={styles.content}>
        <p className={styles.period}>{numberLabel(countForView)} registro(s) retornado(s), limitado(s) à quantidade solicitada.</p>
        {records.length === 0 ? <UiState variant="empty" title={`Nenhum registro de ${VIEW_LABELS[type].toLocaleLowerCase("pt-BR")}`} detail="O serviço respondeu sem eventos para exibir no período consultado." /> : <details className={styles.diagnostics} open>
          <summary>Eventos técnicos detalhados</summary>
          <p className={styles.muted}>Dados de diagnóstico retornados pelo servidor. Identificadores e mensagens são apresentados como contexto técnico.</p>
          <pre className={styles.json}>{JSON.stringify(records, null, 2)}</pre>
        </details>}
      </div>}

      {data && type === "summary" && !memory && <UiState variant="empty" title="Resumo indisponível" detail="A consulta não retornou os indicadores esperados. Tente novamente ou abra uma consulta específica." />}
    </section>
  );
}

function AlertList({ alerts, workingAlert, onAction, emptyTitle = "Nenhum alerta em aberto" }: { alerts: any[]; workingAlert: string; onAction: (id: string, action: "acknowledge" | "resolve") => void; emptyTitle?: string }) {
  return <section className={styles.subsection} aria-labelledby="alerts-title">
    <div className={styles.sectionHeading}><div><h3 id="alerts-title">Alertas</h3><p>Reconheça um alerta em análise ou registre sua resolução.</p></div><span className={styles.countSmall}>{alerts.length} em exibição</span></div>
    {alerts.length === 0 ? <UiState variant="empty" title={emptyTitle} detail="Alertas são exibidos quando o serviço registra uma condição acionável." /> : <div className={styles.alertList}>{alerts.map(a => <article key={a.id} className={`${styles.alert} ${a.severity === "critical" ? styles.critical : ""}`}>
      <div className={styles.sectionHeading}><div><span className={styles.badge}>{a.severity === "critical" ? "Crítico" : a.severity === "warning" ? "Atenção" : a.severity || "Alerta"}</span><h4>{a.alert_key || "Alerta do sistema"}</h4></div><span className={styles.badge}>{a.status === "firing" ? "Em aberto" : a.status === "acknowledged" ? "Reconhecido" : a.status === "resolved" ? "Resolvido" : a.status}</span></div>
      <p>{a.message || "Sem descrição fornecida."}</p>
      <p className={styles.muted}>Indicador: {a.metric_name || "—"} · valor {numberLabel(a.current_value)} · limite {numberLabel(a.threshold_value)} · {dateLabel(a.created_at)}</p>
      {a.correlation_id && <p className={styles.secondary}>Correlação: <span className={styles.code}>{a.correlation_id}</span></p>}
      {a.status === "firing" && <div className={styles.actions}><button type="button" onClick={() => onAction(a.id, "acknowledge")} disabled={workingAlert === a.id}>{workingAlert === a.id ? "Atualizando…" : "Reconhecer"}</button><button type="button" onClick={() => onAction(a.id, "resolve")} disabled={workingAlert === a.id}>Resolver alerta</button></div>}
    </article>)}</div>}
  </section>;
}
