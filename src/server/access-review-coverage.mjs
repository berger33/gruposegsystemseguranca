// PLT-01 — cobertura da revisão periódica de acesso (somente leitura).
//
// Regra do produto: uma revisão só vira "vencida" quando existe uma regra de
// periodicidade declarada explicitamente pelo operador. Sem regra declarada, o
// relatório mostra apenas fatos (quem tem revisão registrada e quando) e não
// emite veredito. Essa é a mesma postura adotada em EXT-02/EXT-03 (alerta e
// prazo só existem com regra/fonte declaradas). Nada aqui altera permissões,
// revoga acesso ou substitui a decisão humana de revisão.

export const REVIEW_INTERVAL_ENV = "ACCESS_REVIEW_INTERVAL_DAYS";
export const REVIEW_INTERVAL_MAX_DAYS = 730;
export const COVERAGE_LIMIT_DEFAULT = 200;
export const COVERAGE_LIMIT_MAX = 500;
export const DAY_MS = 86400000;

export const COVERAGE_RULE_SOURCES = Object.freeze({
  ENV: `env:${REVIEW_INTERVAL_ENV}`,
  NONE: "nao_declarada",
});

export const COVERAGE_RULE_PROBLEMS = Object.freeze({
  MISSING: "nao_informada",
  NOT_INTEGER: "nao_inteira",
  OUT_OF_RANGE: "fora_do_limite",
});

export const COVERAGE_SITUATIONS = Object.freeze([
  "em_dia",
  "vencida",
  "nunca_revisada",
  "revisado_sem_regra",
]);

// Regras de leitura: qualquer valor ambíguo é tratado como NÃO declarado, e o
// motivo fica explícito na resposta. Nunca inferimos um prazo "razoável".
export function resolveReviewRule(env = {}) {
  const raw = env?.[REVIEW_INTERVAL_ENV];
  const base = {
    variavel: REVIEW_INTERVAL_ENV,
    limite_maximo_dias: REVIEW_INTERVAL_MAX_DAYS,
    fonte: COVERAGE_RULE_SOURCES.NONE,
    declarada: false,
    intervalo_dias: null,
    motivo: null,
  };
  const text = raw === undefined || raw === null ? "" : String(raw).trim();
  if (!text) return { ...base, motivo: COVERAGE_RULE_PROBLEMS.MISSING };
  if (!/^\d+$/.test(text)) return { ...base, motivo: COVERAGE_RULE_PROBLEMS.NOT_INTEGER };
  const days = Number(text);
  if (!Number.isSafeInteger(days) || days < 1 || days > REVIEW_INTERVAL_MAX_DAYS) {
    return { ...base, motivo: COVERAGE_RULE_PROBLEMS.OUT_OF_RANGE };
  }
  return {
    ...base,
    fonte: COVERAGE_RULE_SOURCES.ENV,
    declarada: true,
    intervalo_dias: days,
    motivo: null,
  };
}

export function parseCoverageLimit(raw) {
  const text = raw === undefined || raw === null ? "" : String(raw).trim();
  if (!/^\d+$/.test(text)) return COVERAGE_LIMIT_DEFAULT;
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 1) return COVERAGE_LIMIT_DEFAULT;
  return Math.min(COVERAGE_LIMIT_MAX, value);
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

// Pura e determinística: mesma entrada, mesma saída, sem relógio implícito
// (o "agora" é sempre recebido por parâmetro).
export function classifyCoverage({ rule, identities = [], reviews = [], asOf = new Date(), limit = COVERAGE_LIMIT_DEFAULT } = {}) {
  const resolvedRule = rule && typeof rule === "object" && "declarada" in rule ? rule : resolveReviewRule({});
  const now = toDate(asOf) || new Date();
  const intervalo = resolvedRule.declarada ? resolvedRule.intervalo_dias : null;

  const lastReview = new Map();
  for (const review of Array.isArray(reviews) ? reviews : []) {
    const target = review?.target_identity_id;
    if (!target) continue;
    const created = toDate(review?.created_at ?? review?.last_reviewed_at);
    if (!created) continue;
    const current = lastReview.get(target);
    if (!current || created > current.at) {
      lastReview.set(target, { at: created, total: Number(review?.total ?? 1) || 1 });
    }
  }

  const rows = (Array.isArray(identities) ? identities : []).map(identity => {
    const last = lastReview.get(identity.id) || null;
    const dias = last ? Math.floor((now.getTime() - last.at.getTime()) / DAY_MS) : null;
    let situacao;
    if (!last) situacao = "nunca_revisada";
    else if (!resolvedRule.declarada) situacao = "revisado_sem_regra";
    else situacao = dias !== null && dias > intervalo ? "vencida" : "em_dia";
    return {
      identity_id: identity.id,
      email: identity.email ?? null,
      status: identity.status ?? null,
      papel: identity.role ?? null,
      ultima_revisao_em: last ? last.at.toISOString() : null,
      dias_desde_ultima_revisao: dias,
      revisoes_registradas: last ? last.total : 0,
      situacao,
      // Pendência só existe com regra declarada: sem regra não há prazo.
      pendente: resolvedRule.declarada && (situacao === "vencida" || situacao === "nunca_revisada"),
    };
  });

  rows.sort((a, b) => {
    if (a.pendente !== b.pendente) return a.pendente ? -1 : 1;
    const left = a.dias_desde_ultima_revisao;
    const right = b.dias_desde_ultima_revisao;
    if (left === null && right === null) return String(a.email || a.identity_id).localeCompare(String(b.email || b.identity_id), "pt-BR");
    if (left === null) return -1;
    if (right === null) return 1;
    return right - left;
  });

  const resumo = rows.reduce((acc, row) => {
    acc.total += 1;
    acc[row.situacao] += 1;
    if (row.pendente) acc.pendentes += 1;
    return acc;
  }, { total: 0, em_dia: 0, vencida: 0, nunca_revisada: 0, revisado_sem_regra: 0, pendentes: 0 });

  const max = parseCoverageLimit(limit);
  return {
    escopo: "staff_ativo",
    regra: resolvedRule,
    as_of: now.toISOString(),
    limite: max,
    truncado: rows.length > max,
    resumo,
    identidades: rows.slice(0, max),
    fonte: "auth_access_reviews",
    fronteira: {
      altera_permissoes: false,
      revoga_acesso: false,
      substitui_decisao_humana: false,
      veredito_sem_regra_declarada: false,
    },
  };
}
