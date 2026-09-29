"use client";

// PUB-10 — painel DERIVADO de origem e conversão.
// Todos os números vêm de GET /api/admin/leads/metrics, que só faz contagem
// sobre os registros reais (public_leads + crm_opportunities). Não existe
// aqui nenhum campo para digitar métrica: um número de conversão escrito à
// mão não é mensuração. Política em
// docs/PROMPT-CONTINUACAO-PUB10-METRICAS-ORIGEM.md.

import { useCallback, useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import styles from "./LeadAdmin.module.css";

type MetricsRow = {
  origin: string;
  campaign: string;
  channel: string;
  leads: number;
  visitsConfirmed: number;
  converted: number;
  won: number;
  conversionRate: number | null;
  winRate: number | null;
};

type MetricsResponse = {
  from: string;
  to: string;
  windowDays: number;
  rows: MetricsRow[];
  totals: { leads: number; visitsConfirmed: number; converted: number; won: number; conversionRate: number | null; winRate: number | null };
};

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function formatRate(rate: number | null) {
  // null = sem base para calcular. Mostrar "0%" nesse caso seria mentira.
  return rate === null ? "—" : `${rate.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function explainMetricsError(code: string) {
  if (code === "invalid_period") return "Período inválido. Verifique as datas (a inicial não pode ser posterior à final).";
  if (code === "period_too_long") return "Período longo demais. O limite é de 366 dias por consulta.";
  if (code === "database_not_configured") return "O PostgreSQL ainda não está configurado no servidor.";
  if (code === "migration_required") return "A estrutura do banco ainda não foi migrada.";
  if (code === "admin_session_required") return "Sua sessão expirou. Entre novamente.";
  if (code === "forbidden") return "Sua conta não tem acesso à mensuração de origem.";
  return "Não foi possível calcular a mensuração de origem.";
}

export default function OriginMetricsPanel() {
  const [from, setFrom] = useState(() => isoDaysAgo(89));
  const [to, setTo] = useState(() => isoDaysAgo(0));
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/leads/metrics?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(explainMetricsError(payload.error));
      setData(payload as MetricsResponse);
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : "Não foi possível calcular a mensuração de origem.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(from, to); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className={styles.metricsPanel} aria-labelledby="origin-metrics-title" data-testid="origin-metrics-panel">
      <div className={styles.metricsHead}>
        <div>
          <span className={styles.eyebrow}><BarChart3 size={14} /> PUB-10 · ORIGEM E CONVERSÃO</span>
          <h2 id="origin-metrics-title">Mensuração por origem</h2>
          <p>
            Contagens derivadas dos pedidos recebidos e do vínculo real com o funil (CRM-04/06).
            Nenhum número é digitado à mão, e o painel não expõe dado pessoal de quem enviou o pedido.
          </p>
        </div>
        <div className={styles.metricsControls}>
          <label htmlFor="metrics-from">De</label>
          <input id="metrics-from" type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} />
          <label htmlFor="metrics-to">Até</label>
          <input id="metrics-to" type="date" value={to} min={from} onChange={event => setTo(event.target.value)} />
          <button className={styles.refresh} type="button" onClick={() => void load(from, to)} disabled={loading} aria-label="Recalcular mensuração de origem" data-testid="origin-metrics-refresh">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {error && <p className={styles.error} role="alert" data-testid="origin-metrics-error">{error}</p>}

      {loading ? (
        <div className={styles.empty}>Calculando mensuração…</div>
      ) : !data ? null : data.rows.length === 0 ? (
        <div className={styles.empty} data-testid="origin-metrics-empty">
          <strong>Nenhum pedido neste período</strong>
          <span>Sem base para calcular taxa de conversão — o painel não inventa zero.</span>
        </div>
      ) : (
        <>
          <div className={styles.metricsTotals} data-testid="origin-metrics-totals">
            <div><small>PEDIDOS</small><strong data-testid="metrics-total-leads">{data.totals.leads}</strong></div>
            <div><small>VISITAS CONFIRMADAS</small><strong data-testid="metrics-total-visits">{data.totals.visitsConfirmed}</strong></div>
            <div><small>CONVERTIDOS EM OPORTUNIDADE</small><strong data-testid="metrics-total-converted">{data.totals.converted}</strong></div>
            <div><small>GANHOS NO FUNIL</small><strong data-testid="metrics-total-won">{data.totals.won}</strong></div>
            <div><small>TAXA DE CONVERSÃO</small><strong data-testid="metrics-total-rate">{formatRate(data.totals.conversionRate)}</strong></div>
          </div>
          <div className={styles.metricsTableWrap}>
            <table className={styles.metricsTable} data-testid="origin-metrics-table">
              <caption>
                Período de {data.from} a {data.to} ({data.windowDays} dias), pela data do pedido.
                “Ganho no funil” é decisão comercial registrada — não significa dinheiro recebido.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Origem</th>
                  <th scope="col">Campanha</th>
                  <th scope="col">Canal</th>
                  <th scope="col">Pedidos</th>
                  <th scope="col">Visitas confirmadas</th>
                  <th scope="col">Convertidos</th>
                  <th scope="col">Ganhos</th>
                  <th scope="col">Conversão</th>
                  <th scope="col">Ganho</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(row => (
                  <tr key={`${row.origin}|${row.campaign}|${row.channel}`} data-testid={`origin-metrics-row-${row.origin}`}>
                    <th scope="row">{row.origin}</th>
                    <td>{row.campaign}</td>
                    <td>{row.channel}</td>
                    <td data-testid={`metrics-leads-${row.origin}`}>{row.leads}</td>
                    <td>{row.visitsConfirmed}</td>
                    <td data-testid={`metrics-converted-${row.origin}`}>{row.converted}</td>
                    <td data-testid={`metrics-won-${row.origin}`}>{row.won}</td>
                    <td>{formatRate(row.conversionRate)}</td>
                    <td>{formatRate(row.winRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.metricsFootnote}>
            Testes A/B continuam fora do sistema: o requisito os condiciona a tráfego, hipótese e
            tratamento de dados definidos, e nenhuma dessas três coisas existe hoje.
          </p>
        </>
      )}
    </section>
  );
}
