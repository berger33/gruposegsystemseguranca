// EXT-06 — metodologia e regra de acompanhamento compartilhadas entre a
// jornada staff (/api/ext/satisfaction/*) e a jornada cliente (CLI-11,
// /api/client/satisfaction-surveys). Única fonte de verdade: nenhuma das
// duas pontas reimplementa classificação NPS/CSAT ou o limiar de
// acompanhamento. Nada aqui inventa benchmark, meta, média ou tendência.
export const SATISFACTION_METHODOLOGIES = Object.freeze(["none", "csat", "nps"]);
export const SATISFACTION_STATES = Object.freeze(["pendente", "respondida", "em_acao", "concluida", "cancelada"]);
export const ACTION_PLAN_STATES = Object.freeze(["aberta", "em_andamento", "concluida", "cancelada"]);
export const RECOVERY_TRIGGERS = Object.freeze(["none", "never", "score_at_or_below", "nps_detractor", "csat_below_positive"]);

function isInt(value) {
  return Number.isInteger(value);
}

// Valida a configuração declarada de uma pesquisa (metodologia, escala,
// regra de classificação e regra de acompanhamento). Retorna uma lista de
// erros; vazia significa configuração aceita. Nunca infere nada do título.
export function validateMethodologyConfig({ methodology, scale_min, scale_max, methodology_source, classification_rule, recovery_rule }) {
  const errors = [];
  if (!SATISFACTION_METHODOLOGIES.includes(methodology)) errors.push("invalid_methodology");
  if (!isInt(scale_min) || !isInt(scale_max) || scale_min < 0 || scale_max > 10 || scale_min >= scale_max) {
    errors.push("invalid_scale");
  }
  if (methodology !== "none") {
    const source = typeof methodology_source === "string" ? methodology_source.trim() : "";
    if (source.length < 10 || source.length > 300) errors.push("methodology_source_required");
    if (!classification_rule || typeof classification_rule !== "object" || Array.isArray(classification_rule)) {
      errors.push("classification_rule_required");
    }
  } else if (classification_rule) {
    errors.push("classification_rule_not_allowed_for_generic_survey");
  }
  if (methodology === "nps" && errors.length === 0) {
    if (scale_min !== 0 || scale_max !== 10) errors.push("nps_requires_0_10_scale");
    const dmax = classification_rule?.detractor_max;
    const pmax = classification_rule?.passive_max;
    if (!isInt(dmax) || !isInt(pmax) || !(dmax >= 0 && dmax < pmax && pmax < scale_max)) {
      errors.push("invalid_nps_classification_rule");
    }
  }
  if (methodology === "csat" && errors.length === 0) {
    const positiveMin = classification_rule?.positive_min;
    if (!isInt(positiveMin) || positiveMin <= scale_min || positiveMin > scale_max) {
      errors.push("invalid_csat_classification_rule");
    }
  }
  if (!recovery_rule || typeof recovery_rule !== "object" || Array.isArray(recovery_rule) || typeof recovery_rule.trigger !== "string") {
    errors.push("invalid_recovery_rule");
  } else {
    const trigger = recovery_rule.trigger;
    if (!RECOVERY_TRIGGERS.includes(trigger)) errors.push("invalid_recovery_trigger");
    if (trigger === "nps_detractor" && methodology !== "nps") errors.push("recovery_trigger_requires_nps");
    if (trigger === "csat_below_positive" && methodology !== "csat") errors.push("recovery_trigger_requires_csat");
    if (trigger === "score_at_or_below") {
      const threshold = recovery_rule.threshold;
      if (!isInt(threshold) || threshold < scale_min || threshold > scale_max) errors.push("invalid_recovery_threshold");
    }
  }
  return errors;
}

// Classificação derivada SOMENTE da configuração registrada na pesquisa,
// nunca do título nem de heurística textual. Pesquisa genérica não produz
// classificação.
export function classifyScore({ methodology, classification_rule, score }) {
  if (methodology === "none" || score === null || score === undefined) return null;
  if (methodology === "nps") {
    const { detractor_max, passive_max } = classification_rule || {};
    if (score <= detractor_max) return "detrator";
    if (score <= passive_max) return "neutro";
    return "promotor";
  }
  if (methodology === "csat") {
    const { positive_min } = classification_rule || {};
    return score >= positive_min ? "satisfeito" : "insatisfeito";
  }
  return null;
}

// Decide se a resposta exige acompanhamento, usando exclusivamente a regra
// declarada na própria pesquisa. Não existe limiar global embutido no código.
export function evaluateRecovery({ recovery_rule, methodology, classification, score }) {
  const trigger = recovery_rule?.trigger || "none";
  if (trigger === "none" || trigger === "never") {
    return { required: false, rule: trigger, facts: { trigger } };
  }
  if (trigger === "score_at_or_below") {
    const threshold = recovery_rule.threshold;
    const required = typeof score === "number" && score <= threshold;
    return { required, rule: trigger, facts: { trigger, threshold, score } };
  }
  if (trigger === "nps_detractor") {
    const required = methodology === "nps" && classification === "detrator";
    return { required, rule: trigger, facts: { trigger, methodology, classification } };
  }
  if (trigger === "csat_below_positive") {
    const required = methodology === "csat" && classification === "insatisfeito";
    return { required, rule: trigger, facts: { trigger, methodology, classification } };
  }
  return { required: false, rule: trigger, facts: { trigger } };
}
