// UX-PRO-06 — estado de LEITURA da mensuração de origem (PUB-10).
//
// Este módulo não mede nada e não inventa número: ele VALIDA o agregado que o
// servidor já devolve (`GET /api/admin/leads/metrics`), TRADUZ os motivos de
// falha e REDUZ o ciclo de leitura a um estado explícito. As regras que a tela
// passou a respeitar:
//
//   1. resposta fora de ordem nunca publica dados nem encerra o carregamento;
//   2. falha transitória PRESERVA a última leitura concluída (com hora e
//      período) em vez de apagar os números;
//   3. negativa (401/403) e payload inválido são falha fechada: descartam a
//      leitura anterior e nunca viram "nenhum pedido no período";
//   4. os números publicados são sempre do período PEDIDO — se o servidor
//      devolver outra janela, isso é resposta inválida, não rótulo trocado.
//
// O painel continua SOMENTE LEITURA: nenhuma métrica é digitada, enviada ou
// gravada por aqui.

export type OriginMetricsRow = {
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

export type OriginMetricsTotals = {
  leads: number;
  visitsConfirmed: number;
  converted: number;
  won: number;
  conversionRate: number | null;
  winRate: number | null;
};

export type OriginMetrics = {
  from: string;
  to: string;
  windowDays: number;
  rows: OriginMetricsRow[];
  totals: OriginMetricsTotals;
};

export type OriginMetricsErrorKind = "auth" | "denied" | "retry" | "invalid" | "error";

export type OriginMetricsError = {
  kind: OriginMetricsErrorKind;
  title: string;
  detail: string;
  canRetry: boolean;
};

export type OriginMetricsView = {
  data: OriginMetrics | null;
  /** Instante da última leitura concluída com sucesso. */
  readAt: number | null;
  /** Janela a que os dados publicados pertencem (não a janela dos campos). */
  readWindow: { from: string; to: string } | null;
  loading: boolean;
  failure: OriginMetricsError | null;
  /** Verdadeiro quando uma releitura falhou mas a leitura anterior continua publicada. */
  stale: boolean;
};

export type OriginMetricsEvent =
  | { type: "begin" }
  | { type: "success"; sequence: number; current: number; data: OriginMetrics; at: number }
  | { type: "failure"; sequence: number; current: number; failure: OriginMetricsError };

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function inteiroNaoNegativo(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function taxa(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100);
}

function diaIso(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function contagens(value: Record<string, unknown>) {
  return inteiroNaoNegativo(value.leads)
    && inteiroNaoNegativo(value.visitsConfirmed)
    && inteiroNaoNegativo(value.converted)
    && inteiroNaoNegativo(value.won)
    && taxa(value.conversionRate)
    && taxa(value.winRate);
}

function linhaValida(value: unknown): value is OriginMetricsRow {
  if (!object(value)) return false;
  if (![value.origin, value.campaign, value.channel].every(campo => typeof campo === "string")) return false;
  return contagens(value);
}

/**
 * Valida o agregado canônico. `expected` prende os números ao período pedido:
 * publicar outra janela sob o rótulo atual seria atribuição falsa.
 */
export function parseOriginMetrics(value: unknown, expected?: { from: string; to: string }): OriginMetrics {
  if (!object(value) || !Array.isArray(value.rows) || !value.rows.every(linhaValida)) {
    throw new Error("invalid_response");
  }
  if (!object(value.totals) || !contagens(value.totals)) throw new Error("invalid_response");
  if (!diaIso(value.from) || !diaIso(value.to)) throw new Error("invalid_response");
  if (Date.parse(value.from) > Date.parse(value.to)) throw new Error("invalid_response");
  if (!inteiroNaoNegativo(value.windowDays) || value.windowDays < 1 || value.windowDays > 366) {
    throw new Error("invalid_response");
  }
  if (expected && (value.from !== expected.from || value.to !== expected.to)) {
    throw new Error("invalid_response");
  }
  // Preserva campos que a tela não renderiza (minimized, role) e o restante do
  // contrato; nada é renomeado, removido ou inferido.
  return {
    ...value,
    from: value.from,
    to: value.to,
    windowDays: value.windowDays,
    rows: value.rows,
    totals: value.totals,
  } as OriginMetrics;
}

/** Tradução de motivo. Nenhuma falha é apresentada como ausência de pedidos. */
export function describeOriginMetricsError(status: number, code?: unknown): OriginMetricsError {
  if (status === 401 || code === "admin_session_required") {
    return {
      kind: "auth",
      title: "Sua sessão precisa ser renovada",
      detail: "A sessão expirou ou não foi reconhecida. Entre novamente para consultar a mensuração de origem. Nenhuma ausência de pedidos foi inferida.",
      canRetry: false,
    };
  }
  if (status === 403 || code === "forbidden") {
    return {
      kind: "denied",
      title: "Acesso negado a esta leitura",
      detail: "Sua conta não tem acesso à mensuração de origem. Os números anteriores foram descartados; nenhum número foi inferido por esta leitura.",
      canRetry: false,
    };
  }
  if (code === "invalid_response") {
    return {
      kind: "invalid",
      title: "O servidor devolveu uma resposta inválida",
      detail: "Os números recebidos não têm o formato esperado. Isso não significa que não haja pedidos no período. Tente uma nova leitura.",
      canRetry: true,
    };
  }
  if (code === "invalid_period") {
    return {
      kind: "error",
      title: "Período inválido",
      detail: "Período inválido. Verifique as datas (a inicial não pode ser posterior à final).",
      canRetry: false,
    };
  }
  if (code === "period_too_long") {
    return {
      kind: "error",
      title: "Período longo demais",
      detail: "Período longo demais. O limite é de 366 dias por consulta.",
      canRetry: false,
    };
  }
  if (status === 0 || status === 408 || status === 429 || status >= 500
    || code === "database_not_configured" || code === "migration_required" || code === "lead_metrics_unavailable") {
    const detail = code === "database_not_configured"
      ? "O PostgreSQL ainda não está configurado no servidor."
      : code === "migration_required"
        ? "A estrutura do banco ainda não foi migrada no servidor."
        : "Não foi possível concluir a leitura da mensuração. A última leitura concluída continua na tela, com a hora e o período a que pertence — isto não significa que não haja pedidos no período.";
    return { kind: "retry", title: "A mensuração está temporariamente indisponível", detail, canRetry: true };
  }
  return {
    kind: "error",
    title: "A leitura não foi concluída",
    detail: "Não foi possível calcular a mensuração de origem.",
    canRetry: false,
  };
}

export const ORIGIN_METRICS_INITIAL: OriginMetricsView = Object.freeze({
  data: null,
  readAt: null,
  readWindow: null,
  loading: true,
  failure: null,
  stale: false,
});

/**
 * Redutor do ciclo de leitura. Eventos cuja sequência não é a corrente são
 * IGNORADOS (devolvem o mesmo objeto): resposta antiga não publica número,
 * não apaga número e não encerra o carregamento de uma leitura mais nova.
 */
export function reduceOriginMetrics(view: OriginMetricsView, event: OriginMetricsEvent): OriginMetricsView {
  if (event.type === "begin") return { ...view, loading: true, failure: null };
  if (event.sequence !== event.current) return view;
  if (event.type === "success") {
    return {
      data: event.data,
      readAt: event.at,
      readWindow: { from: event.data.from, to: event.data.to },
      loading: false,
      failure: null,
      stale: false,
    };
  }
  const descarta = event.failure.kind === "auth" || event.failure.kind === "denied" || event.failure.kind === "invalid";
  if (descarta) {
    return { data: null, readAt: null, readWindow: null, loading: false, failure: event.failure, stale: false };
  }
  return { ...view, loading: false, failure: event.failure, stale: view.data !== null };
}
