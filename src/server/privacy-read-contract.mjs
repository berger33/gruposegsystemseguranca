// PLT-09 — contrato PURO de privacidade: inventário de dados/finalidades,
// bases legais, política (versão, revisão, aprovação, publicação), pedidos
// LGPD do titular e retenção/descarte declarativos.
//
// Sem banco, sessão, relógio, ambiente ou rede: espelha os vocabulários que as
// três superfícies já montadas (`abas privacidade/retencao/lgpd` +
// `src/server/privacy-api.mjs`, `retention-api.mjs`, `lgpd-request-api.mjs`)
// aceitam hoje, e fixa a fronteira do que esta fatia prova.
//
// Nada aqui publica política de privacidade de verdade, aprova texto jurídico,
// apaga dado pessoal real, envia e-mail/WhatsApp/SMS ou promove tela: as
// migrações 047–049 continuam sendo a única fonte de schema (001–181
// imutáveis) e os enums abaixo são os `CREATE TYPE` dessas migrações.

export const PRIVACY_DATA_CATEGORIES = Object.freeze([
  'identificacao', 'contato', 'localizacao', 'profissional', 'financeiro',
  'tecnico', 'comportamental', 'sensivel', 'outro',
]);

export const PRIVACY_LEGAL_BASES = Object.freeze([
  'consentimento', 'execucao_contrato', 'cumprimento_legal', 'legitimo_interesse',
  'protecao_vida', 'tutela_saude', 'exercicio_direitos', 'protecao_credito', 'outro',
]);

export const PRIVACY_POLICY_STATUSES = Object.freeze([
  'rascunho', 'em_revisao', 'aprovado', 'publicado', 'arquivado', 'rejeitado',
]);

// A publicação é derivada do estado: `is_published` NÃO é uma bandeira
// independente. Só a política `publicado` pode aparecer como publicada; ao sair
// para `arquivado`/`rejeitado`/qualquer outro estado ela precisa deixar de ser
// publicada (regressão medida: arquivar/rejeitar mantinha `is_published=true`).
export const PRIVACY_POLICY_PUBLIC_STATUS = 'publicado';
export const PRIVACY_POLICY_APPROVED_STATUS = 'aprovado';

export const LGPD_REQUEST_TYPES = Object.freeze([
  'acesso', 'correcao', 'eliminacao', 'portabilidade', 'oposicao',
  'revogacao_consentimento', 'informacao', 'outro',
]);

export const LGPD_REQUEST_STATUSES = Object.freeze([
  'recebido', 'em_verificacao', 'em_analise', 'aguardando_titular',
  'aprovado', 'atendido', 'rejeitado', 'cancelado', 'expirado',
]);

export const LGPD_VERIFICATION_METHODS = Object.freeze([
  'email', 'documento', 'presencial', 'video', 'outro',
]);

export const LGPD_ALLOWED_TRANSITIONS = Object.freeze({
  recebido: Object.freeze(['em_verificacao', 'cancelado']),
  em_verificacao: Object.freeze(['em_analise', 'aguardando_titular', 'rejeitado', 'cancelado']),
  em_analise: Object.freeze(['aprovado', 'rejeitado', 'aguardando_titular', 'cancelado']),
  aguardando_titular: Object.freeze(['em_analise', 'rejeitado', 'expirado', 'cancelado']),
  aprovado: Object.freeze(['atendido', 'rejeitado', 'cancelado']),
  atendido: Object.freeze([]),
  rejeitado: Object.freeze([]),
  cancelado: Object.freeze([]),
  expirado: Object.freeze([]),
});

export const RETENTION_EXCEPTION_STATUSES = Object.freeze([
  'solicitado', 'em_analise', 'aprovado', 'rejeitado', 'expirado', 'revogado',
]);

export const RETENTION_DISPOSAL_METHODS = Object.freeze([
  'exclusao_logica', 'exclusao_fisica', 'anonimizacao', 'arquivamento',
]);

export const RETENTION_JOB_STATUSES = Object.freeze([
  'pendente', 'em_execucao', 'concluido', 'falha', 'parcial',
]);

export const RETENTION_ALLOWED_TRANSITIONS = Object.freeze({
  solicitado: Object.freeze(['em_analise', 'rejeitado', 'aprovado']),
  em_analise: Object.freeze(['aprovado', 'rejeitado']),
  aprovado: Object.freeze(['expirado', 'revogado']),
  rejeitado: Object.freeze([]),
  expirado: Object.freeze([]),
  revogado: Object.freeze([]),
});

// Prazo do pedido do titular: valor DECLARADO pela superfície (15 dias), não
// parecer jurídico. Fica nomeado para que o gate prove que ninguém transformou
// "prazo declarado" em "prazo validado".
export const LGPD_DECLARED_DUE_DAYS = 15;
export const LGPD_DUE_DAYS_LEGALLY_VALIDATED = false;

// Faixas que o próprio schema CHECK já impõe (migrações 047–049). O handler
// precisa recusar com 400 antes de o banco derrubar a requisição em 503.
export const CONTACT_EMAIL_MIN = 5;
export const CONTACT_EMAIL_MAX = 320;
export const REQUESTER_EMAIL_MIN = 5;
export const REQUESTER_EMAIL_MAX = 320;
export const RETENTION_MAX_DAYS = 36500;
export const INVENTORY_RETENTION_MAX_DAYS = 3650;

export const PRIVACY_READ_BOUNDARY = Object.freeze({
  leitura_grava_auditoria: false,
  leitura_altera_politica: false,
  leitura_altera_inventario: false,
  leitura_altera_pedido: false,
  abre_borda_rh_legada: false,
  substitui_superficie_existente: false,
  promocao_de_tela: false,
  // Esta fatia não publica política de privacidade real: o gate prova o
  // contrato e a máquina de estados, não um texto aprovado pelo jurídico.
  publica_politica_de_verdade: false,
  exige_aprovacao_admin_antes_de_publicar: true,
  // Nenhum provedor de e-mail/WhatsApp/SMS/push é chamado por estas rotas.
  envio_externo: false,
  // O documento do titular vira hash; não há upload nem armazenamento do arquivo.
  documento_do_titular_vira_hash: true,
  upload_de_arquivo: false,
  // O job de descarte registra log e expira exceções: não apaga dado pessoal real.
  retencao_executa_descarte_real: false,
  // Nenhum prazo, cobertura ou base legal é inferido além do declarado.
  prazo_legal_inferido: false,
  aceite_humano: false,
  reauditoria_integral: false,
});

/** O contrato HTTP de leitura é GET; escrita pertence às rotas de escrita já existentes. */
export function isPrivacyReadMethod(method) {
  return method === 'GET';
}

export function uuidRe() {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
}

/** Mesma semântica dos handlers atuais: trim, vazio vira ausente, excesso recusa. */
export function sanitizePrivacyText(value, max = 2000) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) return null;
  return trimmed;
}

const parser = vocabulary => raw => {
  const value = typeof raw === 'string' ? raw.toLowerCase() : null;
  return vocabulary.includes(value) ? value : null;
};

export const parseDataCategory = parser(PRIVACY_DATA_CATEGORIES);
export const parseLegalBasis = parser(PRIVACY_LEGAL_BASES);
export const parsePolicyStatus = parser(PRIVACY_POLICY_STATUSES);
export const parseLgpdRequestType = parser(LGPD_REQUEST_TYPES);
export const parseLgpdRequestStatus = parser(LGPD_REQUEST_STATUSES);
export const parseLgpdVerificationMethod = parser(LGPD_VERIFICATION_METHODS);
export const parseRetentionExceptionStatus = parser(RETENTION_EXCEPTION_STATUSES);
export const parseRetentionDisposalMethod = parser(RETENTION_DISPOSAL_METHODS);

export function canTransitionLgpd(prev, next) {
  return (LGPD_ALLOWED_TRANSITIONS[prev] || []).includes(next);
}

export function canTransitionRetentionException(prev, next) {
  return (RETENTION_ALLOWED_TRANSITIONS[prev] || []).includes(next);
}

/**
 * `is_published` é derivado do estado — nunca uma bandeira paralela.
 * Qualquer estado diferente de `publicado` significa "não publicada".
 */
export function isPublishedStatus(status) {
  return status === PRIVACY_POLICY_PUBLIC_STATUS;
}

/** Publicar exige a aprovação registrada (`aprovado`); `publicado` não se auto-aprova. */
export function policyPublishProblem(currentStatus, nextStatus) {
  if (nextStatus !== PRIVACY_POLICY_PUBLIC_STATUS) return null;
  if (currentStatus === PRIVACY_POLICY_APPROVED_STATUS) return null;
  return 'must_be_approved_before_publish';
}

/**
 * Recusa, em 400, contato que o `CHECK` da migração 047 recusaria em 503.
 * Ausente/limpo continua ausente (a coluna é opcional).
 */
export function contactEmailProblem(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return 'invalid_contact_email';
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length < CONTACT_EMAIL_MIN || trimmed.length > CONTACT_EMAIL_MAX) return 'invalid_contact_email';
  if (!trimmed.includes('@')) return 'invalid_contact_email';
  return null;
}

/**
 * Mesma regra para o e-mail do titular (migração 048 exige 5..320). A sonda
 * mediu `a@b` passando pelo handler e derrubando o INSERT em 503.
 */
export function requesterEmailProblem(value) {
  if (typeof value !== 'string') return 'invalid_requester_email';
  const trimmed = value.trim();
  if (trimmed.length < REQUESTER_EMAIL_MIN || trimmed.length > REQUESTER_EMAIL_MAX) return 'invalid_requester_email';
  if (!trimmed.includes('@')) return 'invalid_requester_email';
  const [local, domain, ...rest] = trimmed.split('@');
  if (rest.length > 0 || !local || !domain) return 'invalid_requester_email';
  return null;
}

/**
 * Contadores do job de descarte. A sonda mediu `total_scanned = políticas × 10`
 * — cobertura fabricada — e `total_expired` sempre 0 porque a contagem era
 * feita depois do próprio UPDATE. Aqui os números são só o que foi lido.
 */
export function disposalCounters({ policiesEvaluated = 0, exceptionsEvaluated = 0, exceptionsExpired = 0, disposed = 0 } = {}) {
  const policies = Number.isFinite(policiesEvaluated) && policiesEvaluated > 0 ? policiesEvaluated : 0;
  const exceptions = Number.isFinite(exceptionsEvaluated) && exceptionsEvaluated > 0 ? exceptionsEvaluated : 0;
  const expired = Number.isFinite(exceptionsExpired) && exceptionsExpired > 0 ? exceptionsExpired : 0;
  const discarded = Number.isFinite(disposed) && disposed > 0 ? disposed : 0;
  return {
    total_scanned: policies + exceptions,
    total_expired: expired,
    total_disposed: discarded,
  };
}
