// PLT-12 — contrato puro de resposta a incidente.
// Sem banco, sessão, relógio ou rede: espelha os vocabulários fechados, a
// máquina de transição de status, os parsores de entrada e a fronteira da
// superfície já montada (`aba incidentes` + `src/server/incident-api.mjs`).
// Não altera o handler existente; apenas declara o contrato que o gate provê.
export const INCIDENT_TYPES = [
  'vazamento_dados',
  'acesso_nao_autorizado',
  'perda_dados',
  'indisponibilidade',
  'malware',
  'phishing',
  'violacao_privacidade',
  'outro',
];
export const INCIDENT_SEVERITIES = ['baixa', 'media', 'alta', 'critica'];
export const INCIDENT_STATUSES = [
  'aberto',
  'em_contencao',
  'em_analise',
  'em_remediacao',
  'aguardando_comunicacao',
  'comunicado',
  'encerrado',
  'reaberto',
];
export const INCIDENT_EVIDENCE_TYPES = ['log', 'print', 'relatorio', 'depoimento', 'arquivo', 'outro'];
export const INCIDENT_ACTION_TYPES = ['contencao', 'erradicacao', 'recuperacao', 'comunicacao', 'analise', 'prevencao', 'outro'];
export const INCIDENT_ACTION_STATUSES = ['pendente', 'em_execucao', 'concluida', 'cancelada'];
export const INCIDENT_RECIPIENT_TYPES = ['dpo', 'autoridade', 'titular', 'interno', 'cliente', 'outro'];

export const INCIDENT_ALLOWED_TRANSITIONS = {
  aberto: ['em_contencao', 'em_analise', 'encerrado'],
  em_contencao: ['em_analise', 'em_remediacao', 'encerrado'],
  em_analise: ['em_remediacao', 'aguardando_comunicacao', 'encerrado'],
  em_remediacao: ['aguardando_comunicacao', 'comunicado', 'encerrado'],
  aguardando_comunicacao: ['comunicado', 'encerrado'],
  comunicado: ['encerrado', 'reaberto'],
  encerrado: ['reaberto'],
  reaberto: ['em_contencao', 'em_analise', 'em_remediacao'],
};

// Campos exigidos por transição quando ainda não preenchidos no incidente.
//
//   em_contencao => containment_lead_name (responsável pela contenção)
//   encerrado    => root_cause            (causa raiz para encerrar)
export function transitionRequiredFields(nextStatus, current = {}) {
  const required = [];
  if (nextStatus === 'em_contencao' && !current.containment_lead_name) required.push('containment_lead_name');
  if (nextStatus === 'encerrado' && !current.root_cause) required.push('root_cause');
  return required;
}

export function canTransition(prev, next) {
  return (INCIDENT_ALLOWED_TRANSITIONS[prev] || []).includes(next);
}

export function uuidRe() {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
}

export function sanitize(v, max = 5000) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

export function parseIncidentType(v) {
  const value = typeof v === 'string' ? v.toLowerCase() : null;
  return INCIDENT_TYPES.includes(value) ? value : null;
}
export function parseIncidentSeverity(v) {
  const value = typeof v === 'string' ? v.toLowerCase() : null;
  return INCIDENT_SEVERITIES.includes(value) ? value : null;
}
export function parseIncidentStatus(v) {
  const value = typeof v === 'string' ? v.toLowerCase() : null;
  return INCIDENT_STATUSES.includes(value) ? value : null;
}
export function parseEvidenceType(v) {
  const value = typeof v === 'string' ? v.toLowerCase() : null;
  return INCIDENT_EVIDENCE_TYPES.includes(value) ? value : null;
}
export function parseActionType(v) {
  const value = typeof v === 'string' ? v.toLowerCase() : null;
  return INCIDENT_ACTION_TYPES.includes(value) ? value : null;
}
export function parseActionStatus(v) {
  const value = typeof v === 'string' ? v.toLowerCase() : null;
  return INCIDENT_ACTION_STATUSES.includes(value) ? value : null;
}
export function parseRecipientType(v) {
  const value = typeof v === 'string' ? v.toLowerCase() : null;
  return INCIDENT_RECIPIENT_TYPES.includes(value) ? value : null;
}

export const INCIDENT_READ_BOUNDARY = {
  // Leitura de estado (listagem e detalhe): nenhum INSERT em auth_access_audit,
  // nenhuma alteração de incidente, nenhuma evidência gravada, nenhuma comunicação disparada.
  leitura_grava_auditoria: false,
  leitura_altera_incidente: false,
  leitura_altera_permissoes: false,
  abre_borda_rh_legada: false,
  substitui_superficie_existente: false,
  promocao_de_tela: false,
  // Evidência é referência declarada (título, tipo, checksum de referência); não há upload de arquivo nesta superfície.
  evidencia_nao_eh_upload: true,
  // Comunicação é registro interno (flags dpo/autoridade/titular); não envia e-mail, SMS ou notificação externa.
  comunicacao_so_registro_interno: true,
};
