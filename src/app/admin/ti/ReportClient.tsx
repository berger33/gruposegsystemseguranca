"use client";

import { useEffect, useState } from "react";
import UiState from "@/components/ui/UiState";
import UiTableScroll from "@/components/ui/UiTableScroll";
import styles from "@/components/ui/CommercialEstimate.module.css";

type Data = Record<string, any>;
const money = (value: unknown) => value == null || value === "" || !Number.isFinite(Number(value)) ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
const number = (value: unknown, digits = 0) => value == null || value === "" || !Number.isFinite(Number(value)) ? "—" : Number(value).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const valueLabel = (value: unknown) => value == null || value === "" ? "—" : String(value);
const dateLabel = (value: unknown) => { if (!value) return "—"; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("pt-BR"); };

async function readJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Falha ao consultar ${url.split("/").pop()}.`);
  return data;
}
const ERRORS: Record<string,string> = { admin_session_required: "Sua sessão expirou. Entre novamente para consultar os relatórios.", same_origin_required: "A solicitação foi recusada pela proteção de origem.", database_not_configured: "O banco de dados não está configurado neste ambiente." };
const reportError = (error: unknown) => { const code = error instanceof Error ? error.message : ""; return ERRORS[code] || (code && !code.includes("/") ? code : "Não foi possível carregar os relatórios. Tente novamente."); };

export default function ReportClient() {
  const [reports, setReports] = useState<Data[] | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [summary, conversion, salesCycle, overdue, loss, pipeline, forecast] = reports || [];
  async function loadAll() {
    setLoading(true); setError("");
    try {
      const paths = ["/api/crm/reports", "/api/crm/reports/conversion", "/api/crm/reports/sales-cycle", "/api/crm/reports/overdue-tasks", "/api/crm/reports/loss-reasons", "/api/crm/reports/pipeline", "/api/crm/reports/weighted-forecast"];
      const result = await Promise.all(paths.map(readJson)); setReports(result);
    } catch (e) { setReports(null); setError(reportError(e)); } finally { setLoading(false); }
  }
  useEffect(() => { void loadAll(); }, []);
  return <section className={styles.workspace} aria-labelledby="crm-report-title">
    <header className={styles.header}><div><p className={styles.eyebrow}>Comercial · CRM-24</p><h2 id="crm-report-title">Relatórios comerciais</h2><p>Indicadores de conversão, ritmo de vendas, tarefas, perdas e pipeline. A previsão ponderada é uma estimativa baseada nas probabilidades configuradas.</p></div><button className={styles.primary} type="button" onClick={()=>void loadAll()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar relatórios"}</button></header>
    {error ? <UiState variant="error" title="Relatórios indisponíveis" detail={error} onRetry={()=>void loadAll()} /> : loading && !reports ? <UiState variant="loading" title="Consultando relatórios comerciais" detail="As fontes do CRM estão sendo consultadas." /> : !reports ? <UiState variant="empty" title="Sem dados para exibir" detail="Os relatórios serão apresentados quando a consulta estiver disponível." onRetry={()=>void loadAll()} /> : <div className={styles.reports}>
      {summary && <section className={styles.reportCard} aria-labelledby="report-summary-title"><h3 id="report-summary-title">Resumo do período disponível</h3><div className={styles.metrics}>
        {[ ["Oportunidades",summary.summary?.total], ["Ganhos",summary.summary?.won], ["Perdidos",summary.summary?.lost], ["Valor total",money(summary.summary?.total_value)], ["Tarefas atrasadas",summary.summary?.overdue_tasks], ["Valor em pipeline",money(summary.summary?.pipeline_value)] ].map(([label,value])=><div className={styles.metric} key={String(label)}><span>{label}</span><strong>{valueLabel(value)}</strong></div>)}
      </div>{summary.note && <p>{summary.note}</p>}</section>}
      <div className={styles.reportGrid}>
        {conversion && <section className={styles.reportCard}><h3>Conversão por etapa e origem</h3><p>{valueLabel(conversion.total)} oportunidades · {valueLabel(conversion.won)} ganhos · taxa {number(conversion.conversionRate == null ? null : Number(conversion.conversionRate)*100,1)}{conversion.conversionRate == null ? "" : "%"}</p>
          <UiTableScroll><table className={styles.table}><caption>Resultados por etapa</caption><thead><tr><th>Etapa</th><th>Quantidade</th><th>Valor</th></tr></thead><tbody>{(conversion.byStage || []).map((s:Data)=><tr key={s.stage}><th scope="row">{valueLabel(s.stage)}</th><td>{valueLabel(s.count)}</td><td>{money(s.total_value)}</td></tr>)}</tbody></table></UiTableScroll>
          <UiTableScroll><table className={styles.table}><caption>Resultados por origem</caption><thead><tr><th>Origem</th><th>Quantidade</th><th>Ganhos</th><th>Perdidos</th><th>Valor</th></tr></thead><tbody>{(conversion.byOrigin || []).map((o:Data,i:number)=><tr key={`${o.origin ?? "sem-origem"}-${i}`}><th scope="row">{valueLabel(o.origin || "Não informada")}</th><td>{valueLabel(o.count)}</td><td>{valueLabel(o.won)}</td><td>{valueLabel(o.lost)}</td><td>{money(o.total_value)}</td></tr>)}</tbody></table></UiTableScroll>
        </section>}
        {salesCycle && <section className={styles.reportCard}><h3>Ritmo do ciclo de vendas</h3><div className={styles.metrics}>{[["Até a etapa atual (dias)",salesCycle.overall?.avg_days_to_current_stage],["Até ganho (dias)",salesCycle.overall?.avg_days_to_won],["Até perda (dias)",salesCycle.overall?.avg_days_to_lost]].map(([label,value])=><div className={styles.metric} key={String(label)}><span>{label}</span><strong>{number(value,1)}</strong></div>)}</div><UiTableScroll><table className={styles.table}><caption>Média por etapa</caption><thead><tr><th>Etapa</th><th>Quantidade</th><th>Média (dias)</th></tr></thead><tbody>{(salesCycle.byStage || []).map((s:Data)=><tr key={s.stage}><th scope="row">{valueLabel(s.stage)}</th><td>{valueLabel(s.count)}</td><td>{number(s.avg_days,1)}</td></tr>)}</tbody></table></UiTableScroll></section>}
        {overdue && <section className={styles.reportCard}><h3>Tarefas atrasadas <span className={styles.badge}>{valueLabel(overdue.total)}</span></h3>{overdue.tasks?.length ? <UiTableScroll><table className={styles.table}><caption>Até 20 tarefas retornadas pelo relatório</caption><thead><tr><th>Tarefa</th><th>Vencimento</th><th>Situação</th><th>Oportunidade</th><th>Empresa</th></tr></thead><tbody>{(overdue.tasks || []).slice(0,20).map((t:Data)=><tr key={t.id}><th scope="row">{valueLabel(t.title)}</th><td>{dateLabel(t.due_date)}</td><td>{valueLabel(t.status)}</td><td>{valueLabel(t.opportunity_title || t.opportunity_id?.slice(0,8))}</td><td>{valueLabel(t.company_name || t.company_id?.slice(0,8))}</td></tr>)}</tbody></table></UiTableScroll> : <p>Nenhuma tarefa atrasada foi retornada.</p>}</section>}
        {loss && <section className={styles.reportCard}><h3>Motivos de perda</h3><p>{valueLabel(loss.totalLost)} oportunidade(s) perdida(s)</p>{loss.byReason?.length ? <UiTableScroll><table className={styles.table}><caption>Distribuição registrada no CRM</caption><thead><tr><th>Motivo</th><th>Quantidade</th><th>Valor</th></tr></thead><tbody>{loss.byReason.map((r:Data,i:number)=><tr key={`${r.loss_reason}-${i}`}><th scope="row">{valueLabel(r.loss_reason)}</th><td>{valueLabel(r.count)}</td><td>{money(r.total_value)}</td></tr>)}</tbody></table></UiTableScroll> : <p>Nenhum motivo de perda foi retornado.</p>}</section>}
        {pipeline && <section className={styles.reportCard}><h3>Pipeline por etapa, período e cenário</h3><p>{valueLabel(pipeline.total?.count)} oportunidades · {money(pipeline.total?.total_value)}{pipeline.isEstimate ? " · estimativa" : ""}</p>{pipeline.note && <p>{pipeline.note}</p>}
          <UiTableScroll><table className={styles.table}><caption>Pipeline por etapa</caption><thead><tr><th>Etapa</th><th>Quantidade</th><th>Valor total</th><th>Valor médio</th></tr></thead><tbody>{(pipeline.byStage || []).map((s:Data)=><tr key={s.stage}><th scope="row">{valueLabel(s.stage)}</th><td>{valueLabel(s.count)}</td><td>{money(s.total_value)}</td><td>{money(s.avg_value)}</td></tr>)}</tbody></table></UiTableScroll>
          <UiTableScroll><table className={styles.table}><caption>Valores por mês</caption><thead><tr><th>Mês</th><th>Quantidade</th><th>Valor</th></tr></thead><tbody>{(pipeline.byPeriod || []).map((p:Data)=><tr key={p.month}><th scope="row">{valueLabel(p.month)}</th><td>{valueLabel(p.count)}</td><td>{money(p.total_value)}</td></tr>)}</tbody></table></UiTableScroll>
          <UiTableScroll><table className={styles.table}><caption>Cenários alternativos (não somar entre si)</caption><thead><tr><th>Cenário</th><th>Quantidade</th><th>Valor</th></tr></thead><tbody>{(pipeline.byScenario || []).map((s:Data,i:number)=><tr key={`${s.title}-${s.version}-${i}`}><th scope="row">{valueLabel(s.title)} · v{valueLabel(s.version)}<span className={styles.secondary}>Aprovação: {valueLabel(s.approval_status)}</span></th><td>{valueLabel(s.count)}</td><td>{money(s.total_value)}</td></tr>)}</tbody></table></UiTableScroll>
        </section>}
        {forecast && <section className={`${styles.reportCard} ${styles.estimate}`}><h3>Previsão ponderada · estimativa</h3><p>Valor estimado: {money(forecast.totalEstimated)} · valor ponderado: {money(forecast.totalWeighted)}</p>{forecast.note && <p>{forecast.note}</p>}<p>Estimativa baseada nas probabilidades por etapa; não representa garantia de faturamento.</p>
          <UiTableScroll><table className={styles.table}><caption>Estimativa por etapa</caption><thead><tr><th>Etapa</th><th>Quantidade</th><th>Valor estimado</th><th>Probabilidade</th><th>Valor ponderado</th></tr></thead><tbody>{(forecast.byStage || []).map((s:Data)=><tr key={s.stage}><th scope="row">{valueLabel(s.stage)}</th><td>{valueLabel(s.count)}</td><td>{money(s.total_estimated)}</td><td>{s.probability == null ? "—" : `${number(Number(s.probability)*100)}%`}</td><td>{money(s.weighted)}</td></tr>)}</tbody></table></UiTableScroll>
          <details><summary>Ver probabilidades técnicas usadas no cálculo</summary><pre className={styles.json}>{JSON.stringify(forecast.probabilities ?? {},null,2)}</pre></details>
        </section>}
      </div>
    </div>}
  </section>;
}
