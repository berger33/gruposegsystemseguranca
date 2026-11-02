// PLT-06 — contrato PURO da leitura de observabilidade.
//
// Invariante: consultar `summary|requests|jobs|db|alerts` é leitura de estado.
// Ela não cria evento em `auth_access_audit`, não altera `observability_alerts`,
// não concede permissão, não abre a borda legada de RH e não substitui a aba
// `observacao` já montada. Toda validação abaixo é determinística: não lê
// relógio, ambiente, banco, sessão nem rede. A escrita continua restrita ao
// ciclo explícito acknowledge/resolve do handler de alertas.

export const OBSERVABILITY_READ_TYPES = Object.freeze([
  'summary', 'requests', 'jobs', 'db', 'alerts',
]);
export const OBSERVABILITY_ALERT_STATUSES = Object.freeze([
  'firing', 'acknowledged', 'resolved', 'suppressed',
]);
export const OBSERVABILITY_ALERT_ACTIONS = Object.freeze([
  'acknowledge', 'resolve',
]);
export const OBSERVABILITY_READ_BOUNDARY = Object.freeze({
  leitura_grava_auditoria: false,
  leitura_altera_alertas: false,
  leitura_altera_permissoes: false,
  abre_borda_rh_legada: false,
  substitui_superficie_existente: false,
  promocao_de_tela: false,
  ciclo_de_alerta_e_explicito: true,
});

/** O contrato HTTP de leitura é GET; escrita pertence só à rota de alertas. */
export function isObservabilityReadMethod(method) {
  return method === 'GET';
}

/** `null`/vazio preservam o padrão histórico; valores desconhecidos não viram resumo. */
export function parseObservabilityReadType(raw) {
  const value = raw === null || raw === undefined || raw === '' ? 'summary' : String(raw);
  return OBSERVABILITY_READ_TYPES.includes(value) ? value : null;
}

/** O filtro precisa ser um dos quatro estados do enum da migração 044. */
export function parseObservabilityAlertStatus(raw) {
  const value = raw === null || raw === undefined || raw === '' ? 'firing' : String(raw);
  return OBSERVABILITY_ALERT_STATUSES.includes(value) ? value : null;
}

/** Corpo vazio preserva `acknowledge`; nenhuma outra ação é inferida. */
export function parseObservabilityAlertAction(raw) {
  const value = raw === null || raw === undefined || raw === '' ? 'acknowledge' : String(raw);
  return OBSERVABILITY_ALERT_ACTIONS.includes(value) ? value : null;
}

/**
 * Sanitização única para erros de dependência/telemetria: mesmo formato do
 * readiness (PLT-07), sem credenciais de URI, query, chave-valor ou Bearer.
 * Sempre limitada ao CHECK de 1..1000 caracteres das tabelas de observabilidade.
 */
export function sanitizeDependencyError(err) {
  if (err === null || err === undefined || err === '') return null;
  let message = err instanceof Error ? err.message : String(err);
  message = message.replace(
    /([a-z][a-z\d+.-]*:\/\/[^\s:/?#]+):[^\s/@?#]*@/gi,
    '$1:[REDACTED]@',
  );
  message = message.replace(
    /([?&](?:password|token|secret|api[-_]?key)=)[^&#\s]*/gi,
    '$1[REDACTED]',
  );
  message = message.replace(
    /\b((?:[\w.-]*(?:password|token|secret|api[-_]?key)))[=:]\s*[^,\s;&]+/gi,
    '$1=[REDACTED]',
  );
  message = message.replace(/\b(bearer)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [REDACTED]');
  message = message.slice(0, 1000);
  return message.length > 0 ? message : null;
}
