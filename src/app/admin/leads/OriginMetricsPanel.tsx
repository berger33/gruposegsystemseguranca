"use client";

// PUB-10 — painel DERIVADO de origem e conversão.
// Todos os números vêm de GET /api/admin/leads/metrics, que só faz contagem
// sobre os registros reais (public_leads + crm_opportunities). Não existe
// aqui nenhum campo para digitar métrica: um número de conversão escrito à
// mão não é mensuração. Política em
// docs/PROMPT-CONTINUACAO-PUB10-METRICAS-ORIGEM.md.
//
// UX-PRO-06 — estado de leitura honesto: a leitura anterior é preservada
// quando a releitura falha (com hora e período declarados), a negativa e o
// payload inválido falham fechados, e há retry explícito. A validação do
// contrato e o redutor sequenciado vivem em `origin-metrics-state`.

import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import styles from "./LeadAdmin.module.css";
import {
  ORIGIN_METRICS_INITIAL,
  describeOriginMetricsError,
  parseOriginMetrics,
  reduceOriginMetrics,
  type OriginMetricsError,
} from "./origin-metrics-state";

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function formatRate(rate: number | null) {
  // null = sem base para calcular. Mostrar "0%" nesse caso seria mentira.
  return rate === null ? "—" : `${rate.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function formatReadAt(at: number | null) {
  return at === null ? "—" : new Date(at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function OriginMetricsPanel() {
  const [from, setFrom] = useState(() => isoDaysAgo(89));
  const [to, setTo] = useState(() => isoDaysAgo(0));
  const [view, setView] = useState(ORIGIN_METRICS_INITIAL);
  // Sequência de leitura: só a mais recente publica dados ou encerra o
  // carregamento. Hoje os controles ficam desabilitados durante a leitura,
  // então a sobreposição não é alcançável pela tela — a guarda é a defesa que
  // impede uma resposta antiga de mentir caso um gatilho novo apareça.
  const readSequence = useRef(0);
  // Foco no alerta só quando a falha vem de uma ação da pessoa: a carga inicial
  // nunca move o foco sozinha.
  const focusOnFailure = useRef(false);
  const failureRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (start: string, end: string, userInitiated = false) => {
    const sequence = ++readSequence.current;
    focusOnFailure.current = userInitiated;
    setView(current => reduceOriginMetrics(current, { type: "begin" }));
    try {
      const response = await fetch(`/api/admin/leads/metrics?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (sequence !== readSequence.current) return;
      if (!response.ok) {
        setView(current => reduceOriginMetrics(current, {
          type: "failure", sequence, current: readSequence.current,
          failure: describeOriginMetricsError(response.status, (payload as { error?: unknown } | null)?.error),
        }));
        return;
      }
      let data;
      try {
        data = parseOriginMetrics(payload, { from: start, to: end });
      } catch {
        setView(current => reduceOriginMetrics(current, {
          type: "failure", sequence, current: readSequence.current,
          failure: describeOriginMetricsError(200, "invalid_response"),
        }));
        return;
      }
      setView(current => reduceOriginMetrics(current, {
        type: "success", sequence, current: readSequence.current, data, at: Date.now(),
      }));
    } catch {
      if (sequence !== readSequence.current) return;
      setView(current => reduceOriginMetrics(current, {
        type: "failure", sequence, current: readSequence.current,
        failure: describeOriginMetricsError(0),
      }));
    }
  }, []);

  useEffect(() => { void load(from, to); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!view.failure || !focusOnFailure.current) return;
    focusOnFailure.current = false;
    failureRef.current?.focus();
  }, [view.failure]);

  const readAtLabel = formatReadAt(view.readAt);
  const failure: OriginMetricsError | null = view.failure;
  const failureTestId = failure === null
    ? undefined
    : failure.kind === "auth" || failure.kind === "denied" ? "origin-metrics-denied"
      : failure.kind === "invalid" ? "origin-metrics-invalid"
        : "origin-metrics-read-error";

  return (
    <section className={styles.metricsPanel} aria-labelledby="origin-metrics-title" aria-busy={view.loading || undefined} data-testid="origin-metrics-panel">
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
          <button className={styles.refresh} type="button" onClick={() => void load(from, to, true)} disabled={view.loading} aria-label="Recalcular mensuração de origem" data-testid="origin-metrics-refresh">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {view.loading && view.data !== null && (
        <p className={styles.metricsUpdated} role="status" data-testid="origin-metrics-updating">Atualizando a mensuração… Os números da leitura anterior continuam abaixo até a nova leitura concluir.</p>
      )}

      {view.stale && failure !== null && (
        <div className={styles.metricsStale} role="alert" data-testid="origin-metrics-stale">
          <p>
            A última atualização falhou. {failure.detail} Os números abaixo são os da última leitura concluída em {readAtLabel},
            período de {view.readWindow?.from} a {view.readWindow?.to} — isto não significa que não haja pedidos no período.
            O período nos campos pode ainda não ter sido consultado.
          </p>
          {failure.canRetry && (
            <button type="button" className={styles.retry} data-testid="origin-metrics-retry" disabled={view.loading} onClick={() => void load(from, to, true)}>
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {!view.stale && failure !== null && (
        <div className={styles.readFailure} role="alert" tabIndex={-1} ref={failureRef} data-testid={failureTestId}>
          <strong>{failure.title}</strong>
          <p data-testid="origin-metrics-error">{failure.detail}</p>
          {failure.canRetry && (
            <button type="button" className={styles.retry} data-testid="origin-metrics-retry" disabled={view.loading} onClick={() => void load(from, to, true)}>
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {view.data === null ? (
        view.loading ? (
          <div className={styles.empty} role="status" aria-busy="true" data-testid="origin-metrics-loading">
            <strong>Calculando mensuração…</strong>
            <span>Ainda não há números desta leitura.</span>
          </div>
        ) : null
      ) : view.data.rows.length === 0 ? (
        <div className={styles.empty} data-testid="origin-metrics-empty">
          <strong>Nenhum pedido neste período</strong>
          <span>Sem base para calcular taxa de conversão — o painel não inventa zero.</span>
        </div>
      ) : (
        <>
          <p className={styles.metricsUpdated} data-testid="origin-metrics-updated">
            Última leitura concluída em {readAtLabel}
          </p>
          <p className={styles.metricsUpdated} data-testid="origin-metrics-period">
            Período dos números: de {view.data.from} a {view.data.to} ({view.data.windowDays} dias).
          </p>
          <div className={styles.metricsTotals} data-testid="origin-metrics-totals">
            <div><small>PEDIDOS</small><strong data-testid="metrics-total-leads">{view.data.totals.leads}</strong></div>
            <div><small>VISITAS CONFIRMADAS</small><strong data-testid="metrics-total-visits">{view.data.totals.visitsConfirmed}</strong></div>
            <div><small>CONVERTIDOS EM OPORTUNIDADE</small><strong data-testid="metrics-total-converted">{view.data.totals.converted}</strong></div>
            <div><small>GANHOS NO FUNIL</small><strong data-testid="metrics-total-won">{view.data.totals.won}</strong></div>
            <div><small>TAXA DE CONVERSÃO</small><strong data-testid="metrics-total-rate">{formatRate(view.data.totals.conversionRate)}</strong></div>
          </div>
          <div className={styles.metricsTableWrap}>
            <table className={styles.metricsTable} data-testid="origin-metrics-table">
              <caption>
                Período de {view.data.from} a {view.data.to} ({view.data.windowDays} dias), pela data do pedido.
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
                {view.data.rows.map(row => (
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
