"use client";
import { useEffect, useState } from "react";

export default function ReportClient() {
  const [summary, setSummary] = useState<any>(null);
  const [conversion, setConversion] = useState<any>(null);
  const [salesCycle, setSalesCycle] = useState<any>(null);
  const [overdue, setOverdue] = useState<any>(null);
  const [loss, setLoss] = useState<any>(null);
  const [pipeline, setPipeline] = useState<any>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [msg, setMsg] = useState("");

  async function loadAll() {
    setMsg("Carregando relatórios...");
    try {
      const [sumR, convR, cycleR, overR, lossR, pipeR, foreR] = await Promise.all([
        fetch("/api/crm/reports").then(r => r.json()),
        fetch("/api/crm/reports/conversion").then(r => r.json()),
        fetch("/api/crm/reports/sales-cycle").then(r => r.json()),
        fetch("/api/crm/reports/overdue-tasks").then(r => r.json()),
        fetch("/api/crm/reports/loss-reasons").then(r => r.json()),
        fetch("/api/crm/reports/pipeline").then(r => r.json()),
        fetch("/api/crm/reports/weighted-forecast").then(r => r.json()),
      ]);
      setSummary(sumR);
      setConversion(convR);
      setSalesCycle(cycleR);
      setOverdue(overR);
      setLoss(lossR);
      setPipeline(pipeR);
      setForecast(foreR);
      setMsg("Relatórios carregados");
    } catch (e: any) {
      setMsg(`Erro: ${e.message}`);
    }
  }

  useEffect(() => { loadAll(); }, []);

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
      <h2>CRM-24 — Relatórios conversão, ciclo, atrasadas, perda, pipeline, previsão ponderada</h2>
      <p style={{ fontSize: 12, color: "#555" }}>Conversão por etapa/origem, ciclo de vendas, tarefas atrasadas, motivos de perda, pipeline por período e cenário, previsão ponderada é estimativa identificada (probabilidade por etapa).</p>
      <button onClick={loadAll}>Recarregar relatórios</button>
      {msg && <div style={{ fontSize: 12, marginTop: 8 }}>{msg}</div>}

      {summary && (
        <div style={{ marginTop: 12, padding: 12, background: "#f0f0f0", borderRadius: 6, fontSize: 12 }}>
          <h4>Resumo</h4>
          <p>Total oportunidades: {summary.summary?.total} | Ganho: {summary.summary?.won} | Perdido: {summary.summary?.lost} | Valor total: R$ {summary.summary?.total_value} | Tarefas atrasadas: {summary.summary?.overdue_tasks} | Pipeline: R$ {summary.summary?.pipeline_value}</p>
          <p>{summary.note}</p>
        </div>
      )}

      {conversion && (
        <div style={{ marginTop: 12, fontSize: 11 }}>
          <h4>Conversão por etapa/origem</h4>
          <p>Total: {conversion.total} Ganho: {conversion.won} Taxa: {(conversion.conversionRate * 100).toFixed(1)}%</p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th>Etapa</th><th>Count</th><th>Valor</th></tr></thead>
            <tbody>{(conversion.byStage || []).map((s: any) => <tr key={s.stage}><td>{s.stage}</td><td>{s.count}</td><td>R$ {s.total_value}</td></tr>)}</tbody>
          </table>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <thead><tr><th>Origem</th><th>Count</th><th>Ganho</th><th>Perdido</th><th>Valor</th></tr></thead>
            <tbody>{(conversion.byOrigin || []).map((o: any) => <tr key={o.origin || "null"}><td>{o.origin || "-"}</td><td>{o.count}</td><td>{o.won}</td><td>{o.lost}</td><td>R$ {o.total_value}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {salesCycle && (
        <div style={{ marginTop: 12, fontSize: 11 }}>
          <h4>Ciclo de vendas</h4>
          <p>Média dias para etapa atual: {Number(salesCycle.overall?.avg_days_to_current_stage || 0).toFixed(1)} | Para ganho: {Number(salesCycle.overall?.avg_days_to_won || 0).toFixed(1)} | Para perdido: {Number(salesCycle.overall?.avg_days_to_lost || 0).toFixed(1)}</p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th>Etapa</th><th>Count</th><th>Média dias</th></tr></thead>
            <tbody>{(salesCycle.byStage || []).map((s: any) => <tr key={s.stage}><td>{s.stage}</td><td>{s.count}</td><td>{Number(s.avg_days || 0).toFixed(1)}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {overdue && (
        <div style={{ marginTop: 12, fontSize: 11 }}>
          <h4>Tarefas atrasadas ({overdue.total})</h4>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th>Título</th><th>Vencimento</th><th>Status</th><th>Oportunidade</th><th>Empresa</th></tr></thead>
            <tbody>{(overdue.tasks || []).slice(0,20).map((t: any) => <tr key={t.id}><td>{t.title}</td><td>{new Date(t.due_date).toLocaleString()}</td><td>{t.status}</td><td>{t.opportunity_title || t.opportunity_id?.slice(0,8)}</td><td>{t.company_name || t.company_id?.slice(0,8)}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {loss && (
        <div style={{ marginTop: 12, fontSize: 11 }}>
          <h4>Motivos de perda (total perdido {loss.totalLost})</h4>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th>Motivo</th><th>Count</th><th>Valor</th></tr></thead>
            <tbody>{(loss.byReason || []).map((r: any, i: number) => <tr key={i}><td>{r.loss_reason}</td><td>{r.count}</td><td>R$ {r.total_value}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {pipeline && (
        <div style={{ marginTop: 12, fontSize: 11 }}>
          <h4>Pipeline por período e cenário</h4>
          <p>Total pipeline: {pipeline.total?.count} oportunidades, R$ {pipeline.total?.total_value} — {pipeline.note} {pipeline.isEstimate ? "(estimativa)" : ""}</p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th>Etapa</th><th>Count</th><th>Valor total</th><th>Média</th></tr></thead>
            <tbody>{(pipeline.byStage || []).map((s: any) => <tr key={s.stage}><td>{s.stage}</td><td>{s.count}</td><td>R$ {s.total_value}</td><td>R$ {s.avg_value}</td></tr>)}</tbody>
          </table>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <thead><tr><th>Mês (forecast)</th><th>Count</th><th>Valor</th></tr></thead>
            <tbody>{(pipeline.byPeriod || []).map((p: any) => <tr key={p.month}><td>{p.month}</td><td>{p.count}</td><td>R$ {p.total_value}</td></tr>)}</tbody>
          </table>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <thead><tr><th>Cenário de preço (alternativas, não somar)</th><th>Count</th><th>Valor</th></tr></thead>
            <tbody>{(pipeline.byScenario || []).map((s: any, i: number) => <tr key={i}><td>{s.title} · v{s.version} · {s.approval_status}</td><td>{s.count}</td><td>R$ {s.total_value}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      {forecast && (
        <div style={{ marginTop: 12, fontSize: 11, background: "#fffbe6", padding: 12, borderRadius: 6 }}>
          <h4>Previsão ponderada (ESTIMATIVA identificada)</h4>
          <p>Total estimado: R$ {forecast.totalEstimated} | Total ponderado: R$ {forecast.totalWeighted.toFixed(2)} — {forecast.note}</p>
          <p style={{ fontWeight: "bold", color: "#b58900" }}>ESTIMATIVA: não é garantia de faturamento. Probabilidades por etapa: {JSON.stringify(forecast.probabilities)}</p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th>Etapa</th><th>Count</th><th>Estimado</th><th>Prob</th><th>Ponderado</th></tr></thead>
            <tbody>{(forecast.byStage || []).map((s: any) => <tr key={s.stage}><td>{s.stage}</td><td>{s.count}</td><td>R$ {s.total_estimated}</td><td>{(s.probability * 100).toFixed(0)}%</td><td>R$ {s.weighted.toFixed(2)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
