// UX-07 / EXT-05 — vocabulário da família QUALIDADE.
//
// Levantamento dos códigos (método registrado em
// docs/UX-07-QUALIDADE-2026-10-06.md, seção 3):
//
//   grep -ohE "\b[a-zA-Z_]{2,16}\(\s*res\s*,\s*['\"`][a-z0-9_]+" src/server/ext-quality-api.mjs \
//     | sed -E "s/\(.*//" | sort | uniq -c
//
// A família NÃO define wrappers locais do tipo `bad(res, 'codigo')` /
// `unavailable(res, 'codigo')` e não usa `new HttpError()`/`new E()`: todas as
// respostas saem por `json(res, status, { error: '...' })`, inclusive as
// montadas dentro de `work()` e devolvidas por `mutation()` como `deny`.
// Mesmo assim o extrator anti-deriva de tests/ux-quality-vocabulary.test.mjs
// continua casando os três formatos (literal, `new HttpError()/new E()` e
// wrapper), para que a introdução de um wrapper amanhã não passe despercebida.
//
// Origem única e real, lida pelo teste: `src/server/ext-quality-api.mjs` — o
// único servidor da família religado em server.mjs (`/api/ext/quality/*` e os
// oito caminhos legados exatos que caem em `handleList`/`handleLegacyActions`).
// Os handlers antigos de qualidade foram REMOVIDOS de `src/server/ext-api.mjs`
// (tests/ext05-quality.test.mjs prova isso), então não há segunda origem.
//
// Total real: 34 códigos, zero duplicado, zero inventado.
//
// Regras desta camada:
//  - código desconhecido PASSA CRU: nada é inventado;
//  - o código canônico é informação técnica (rodapé/parênteses), nunca o
//    título principal lido por quem opera;
//  - ausência nunca vira zero, 0%, 01/01/1970 ou equivalente;
//  - a fronteira documental é dita como é: referência declarada e rastreável,
//    nunca upload, arquivo verificado ou armazenamento confirmado.

const ERROR_MESSAGES = Object.freeze({
  action_not_found: { kind: 'not_found', title: 'Ação corretiva não encontrada', detail: 'A ação não existe na jornada canônica ou não está disponível neste escopo.', canRetry: false },
  action_terminal: { kind: 'conflict', title: 'Ação já finalizada', detail: 'Uma ação concluída ou cancelada é imutável; registre uma nova ação se o trabalho continuar.', canRetry: false },
  audit_unavailable: { kind: 'unavailable', title: 'Auditoria indisponível', detail: 'A operação foi desfeita por inteiro porque a trilha de auditoria não pôde ser gravada. Nada ficou registrado pela metade.', canRetry: true },
  body_too_large: { kind: 'invalid', title: 'Dados muito extensos', detail: 'Reduza o conteúdo enviado e tente de novo.', canRetry: false },
  client_account_not_found: { kind: 'conflict', title: 'Conta de cliente inexistente', detail: 'A conta informada não existe. O vínculo de conta é imutável, então confira antes de criar.', canRetry: false },
  closed_nonconformity_required: { kind: 'conflict', title: 'Reabertura exige não conformidade encerrada', detail: 'Só uma não conformidade encerrada pode ser reaberta formalmente; o encerramento histórico é preservado.', canRetry: false },
  closure_prerequisites_missing: { kind: 'conflict', title: 'Pré-requisitos de encerramento ausentes', detail: 'O servidor só encerra com responsável, causa registrada, ação concluída, nenhuma ação pendente e verificação eficaz com evidência declarada.', canRetry: false },
  explicit_operation_required: { kind: 'conflict', title: 'Encerrar e reabrir têm operação própria', detail: 'A transição comum não encerra nem reabre: use o encerramento com evidência ou a reabertura formal.', canRetry: false },
  forbidden: { kind: 'denied', title: 'Permissão granular ausente', detail: 'Sua conta abriu a tela, mas não tem a permissão granular que o servidor exige para esta ação.', canRetry: false },
  forbidden_account_scope: { kind: 'denied', title: 'Fora do escopo da sua conta', detail: 'Seu acesso é limitado a contas específicas; registro sem conta ou de outra conta exige escopo global ou organizacional.', canRetry: false },
  forbidden_role: { kind: 'denied', title: 'Papel sem acesso à qualidade', detail: 'A jornada de qualidade é interna e restrita aos papéis autorizados pelo servidor.', canRetry: false },
  idempotency_key_required: { kind: 'invalid', title: 'Identificador da operação ausente', detail: 'A operação precisa de uma chave de idempotência válida para não duplicar efeito.', canRetry: false },
  idempotency_key_reused: { kind: 'conflict', title: 'Chave já usada com dados diferentes', detail: 'A operação foi recusada para preservar a idempotência. Repita com uma operação nova.', canRetry: false },
  invalid_action: { kind: 'invalid', title: 'Ação corretiva inválida', detail: 'Descrição, tipo e responsável são obrigatórios; prazo, quando informado, exige fonte e data-base.', canRetry: false },
  invalid_cause: { kind: 'invalid', title: 'Causa inválida', detail: 'Descreva a causa e a fonte declarada com o tamanho exigido pelo servidor.', canRetry: false },
  invalid_client_account_id: { kind: 'invalid', title: 'Conta de cliente inválida', detail: 'O vínculo opcional de conta precisa ser um identificador válido.', canRetry: false },
  invalid_closure: { kind: 'invalid', title: 'Encerramento inválido', detail: 'O encerramento exige a verificação eficaz escolhida e uma nota com o tamanho exigido pelo servidor.', canRetry: false },
  invalid_nonconformity: { kind: 'invalid', title: 'Não conformidade inválida', detail: 'Título, descrição e categoria são obrigatórios, com os tamanhos exigidos pelo servidor.', canRetry: false },
  invalid_recurrence: { kind: 'invalid', title: 'Reincidência inválida', detail: 'A reincidência explícita exige título, descrição, categoria, justificativa, critério declarado e fonte.', canRetry: false },
  invalid_reference: { kind: 'invalid', title: 'Referência inválida', detail: 'O identificador informado no endereço não é válido.', canRetry: false },
  invalid_request: { kind: 'invalid', title: 'Dados inválidos', detail: 'O servidor não reconheceu o conteúdo enviado.', canRetry: false },
  invalid_responsible_identity: { kind: 'invalid', title: 'Responsável inválido', detail: 'O responsável precisa ser uma pessoa de equipe ativa; a tela não inventa responsável.', canRetry: false },
  invalid_status_transition: { kind: 'conflict', title: 'Transição não permitida', detail: 'O estado atual da não conformidade não permite essa mudança; a máquina de estados não salta etapa.', canRetry: false },
  invalid_verification: { kind: 'invalid', title: 'Verificação inválida', detail: 'Resultado, descrição e os três campos da evidência declarada são obrigatórios, com os tamanhos exigidos.', canRetry: false },
  justification_required: { kind: 'invalid', title: 'Justificativa obrigatória', detail: 'Escreva a justificativa (ou nota de conclusão) com o tamanho exigido pelo servidor.', canRetry: false },
  legacy_mutation_retired: { kind: 'conflict', title: 'Escrita pela rota antiga aposentada', detail: 'A escrita legada foi desligada. Use a jornada canônica de qualidade.', canRetry: false },
  method_not_allowed: { kind: 'invalid', title: 'Operação não permitida', detail: 'Este método não está disponível para o recurso solicitado.', canRetry: false },
  nonconformity_closed: { kind: 'conflict', title: 'Não conformidade encerrada', detail: 'Registro novo não entra em não conformidade encerrada; reabra formalmente antes.', canRetry: false },
  not_found: { kind: 'not_found', title: 'Não conformidade não encontrada', detail: 'O registro não existe na jornada canônica ou não está disponível neste escopo.', canRetry: false },
  origin_forbidden: { kind: 'denied', title: 'Origem não autorizada', detail: 'A operação foi recusada por proteção de origem.', canRetry: false },
  predecessor_not_found: { kind: 'not_found', title: 'Predecessora não encontrada', detail: 'A não conformidade predecessora da reincidência não existe ou não está disponível neste escopo.', canRetry: false },
  quality_journey_unavailable: { kind: 'unavailable', title: 'Jornada de qualidade indisponível', detail: 'O servidor não concluiu a operação. Nenhum efeito parcial foi mantido.', canRetry: true },
  reason_required: { kind: 'invalid', title: 'Justificativa da transição obrigatória', detail: 'Toda mudança de estado exige o motivo escrito, com o tamanho exigido pelo servidor.', canRetry: false },
  unauthorized: { kind: 'denied', title: 'Sessão necessária', detail: 'Entre novamente com uma sessão de equipe para consultar esta área.', canRetry: true },
});

// ENUMs efetivamente usados pela família. Valor desconhecido é preservado cru.
const ENUMS = Object.freeze({
  // ext_quality_status (migração 085; máquina de estados do servidor).
  ncStatus: {
    aberta: ['Aberta', 'warning'],
    em_analise: ['Em análise', 'info'],
    em_acao_corretiva: ['Em ação corretiva', 'info'],
    verificacao: ['Em verificação', 'info'],
    encerrada: ['Encerrada', 'success'],
    reaberta: ['Reaberta', 'danger'],
  },
  // ext_quality_severity (migração 085).
  severity: {
    baixa: ['Baixa', 'neutral'],
    media: ['Média', 'info'],
    alta: ['Alta', 'warning'],
    critica: ['Crítica', 'danger'],
  },
  // coluna `status` de ext_quality_actions (constraint da migração 151).
  actionStatus: {
    pendente: ['Pendente', 'warning'],
    concluida: ['Concluída', 'success'],
    cancelada: ['Cancelada', 'neutral'],
  },
  // coluna `outcome` de ext_quality_verifications (migração 151).
  verificationOutcome: {
    eficaz: ['Eficaz', 'success'],
    ineficaz: ['Ineficaz', 'danger'],
  },
  // coluna `origin` (migrações 085/151).
  qualityOrigin: {
    jornada_canonica: ['Jornada canônica EXT-05', 'success'],
    registro_legado: ['Registro legado', 'warning'],
  },
  // `event_type` de ext_quality_events, montado no servidor.
  qualityEvent: {
    nao_conformidade_criada: ['Não conformidade criada', 'neutral'],
    cause_registrada: ['Causa registrada', 'info'],
    verification_registrada: ['Verificação registrada', 'info'],
    acao_corretiva_criada: ['Ação corretiva criada', 'info'],
    acao_complete: ['Ação corretiva concluída', 'success'],
    acao_cancel: ['Ação corretiva cancelada', 'neutral'],
    estado_alterado: ['Estado alterado', 'info'],
    nao_conformidade_encerrada: ['Encerrada com evidência e responsável', 'success'],
    nao_conformidade_reaberta: ['Reaberta formalmente', 'warning'],
    reincidencia_registrada: ['Reincidência explícita registrada', 'warning'],
  },
  // itens do array `missing` devolvido com `closure_prerequisites_missing`.
  // Não são códigos de erro: são os pré-requisitos que faltaram.
  closureRequirement: {
    responsible: ['responsável canônico definido', 'warning'],
    cause: ['causa registrada', 'warning'],
    completed_action: ['pelo menos uma ação corretiva concluída', 'warning'],
    pending_action: ['nenhuma ação corretiva pendente', 'warning'],
    effective_verification_evidence: ['verificação eficaz com evidência declarada', 'warning'],
  },
});

/** Texto único para toda ausência de dado. Nunca zero, nunca data inicial. */
export const ABSENT = 'Dado ausente';

/**
 * `Intl.NumberFormat('pt-BR')` separa grupos com U+00A0/U+202F. Os espaços
 * rígidos quebram asserção literal em teste e colagem de texto, sem
 * acrescentar informação: são normalizados para espaço comum.
 */
const normalizeSpaces = (value) => String(value).replace(/[\u00a0\u202f]/g, ' ');

export function describeQualityError(code, status = 0) {
  const normalized = code == null || String(code).trim() === '' ? null : String(code).trim();
  // `status: 0` é a falha de rede — o servidor não chegou a responder.
  if (status === 0) {
    return {
      kind: 'network',
      title: 'Servidor não respondeu',
      detail: 'A leitura não foi concluída. Isto não é uma lista vazia nem um resultado zero.',
      status,
      canRetry: true,
      code: normalized,
    };
  }
  // Respondeu com erro, mas sem código legível: nenhum código é inventado
  // para preencher a lacuna.
  if (normalized === null) {
    return {
      kind: 'error',
      title: 'Falha sem código do servidor',
      detail: `O servidor respondeu ${status} e não devolveu um código. A leitura não foi concluída; isto não é lista vazia nem resultado zero.`,
      status,
      canRetry: status >= 500,
      code: null,
    };
  }
  const found = ERROR_MESSAGES[normalized];
  // Desconhecido passa cru: o código aparece como informação técnica e
  // nenhuma frase é inventada para ele.
  if (!found) {
    return {
      kind: 'error',
      title: 'Falha no servidor',
      detail: `O servidor devolveu o código ${normalized}, ainda sem tradução nesta tela.`,
      status,
      canRetry: status >= 500,
      code: normalized,
    };
  }
  return { ...found, status, code: normalized };
}

/** Frase completa com o código canônico apenas entre parênteses, no fim. */
export function qualityErrorMessage(code, status = 0) {
  const descriptor = describeQualityError(code, status);
  return `${descriptor.title}: ${descriptor.detail}${descriptor.code ? ` (${descriptor.code})` : ''}`;
}

/** Recusa de permissão é um estado próprio, distinto de falha de leitura. */
export function qualityErrorVariant(descriptor) {
  return descriptor.kind === 'denied' ? 'denied' : 'error';
}

export function qualityErrorFootnote(descriptor) {
  return descriptor.code ? `Código técnico: (${descriptor.code})` : 'Código técnico: indisponível';
}

export function enumLabel(group, value) {
  if (value == null || value === '') return ABSENT;
  return ENUMS[group]?.[String(value)]?.[0] ?? String(value);
}

export function enumTone(group, value) {
  return ENUMS[group]?.[String(value)]?.[1] ?? 'neutral';
}

export const ncStatusLabel = (value) => enumLabel('ncStatus', value);
export const ncStatusTone = (value) => enumTone('ncStatus', value);
export const severityLabel = (value) => enumLabel('severity', value);
export const severityTone = (value) => enumTone('severity', value);
export const actionStatusLabel = (value) => enumLabel('actionStatus', value);
export const actionStatusTone = (value) => enumTone('actionStatus', value);
export const verificationOutcomeLabel = (value) => enumLabel('verificationOutcome', value);
export const verificationOutcomeTone = (value) => enumTone('verificationOutcome', value);
export const qualityOriginLabel = (value) => enumLabel('qualityOrigin', value);
export const qualityOriginTone = (value) => enumTone('qualityOrigin', value);
export const qualityEventLabel = (value) => enumLabel('qualityEvent', value);
export const qualityEventTone = (value) => enumTone('qualityEvent', value);
export const closureRequirementLabel = (value) => enumLabel('closureRequirement', value);

/**
 * Lista de pré-requisitos ausentes (`missing`) em português. Item desconhecido
 * é preservado cru, exatamente como veio do servidor.
 */
export function closureMissingList(missing) {
  if (!Array.isArray(missing) || missing.length === 0) return '';
  return missing.map((item) => closureRequirementLabel(item)).join('; ');
}

/** Data sem hora. Ausência nunca vira 01/01/1970. */
export function honestDate(value) {
  if (value == null || value === '') return ABSENT;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return normalizeSpaces(new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date));
}

/** Data com hora, para a trilha append-only. Ausência continua ausência. */
export function honestDateTime(value) {
  if (value == null || value === '') return ABSENT;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return normalizeSpaces(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short',
  }).format(date));
}

/**
 * Contagem. `0` vindo do servidor é um zero real e aparece como `0`; ausência
 * (`null`/`undefined`/não numérico) aparece como ausência.
 */
export function count(value) {
  if (value == null || value === '') return ABSENT;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return ABSENT;
  return normalizeSpaces(new Intl.NumberFormat('pt-BR').format(numeric));
}

/** Número com casas limitadas. Mesma regra de `count` para ausência. */
export function honestNumber(value, maximumFractionDigits = 2) {
  if (value == null || value === '') return ABSENT;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return ABSENT;
  return normalizeSpaces(new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(numeric));
}

/**
 * Percentual honesto. O servidor de qualidade **não** devolve taxa, índice ou
 * percentual de eficácia: toda chamada sem número real devolve a frase de não
 * cálculo, nunca `0%`.
 */
export const PERCENT_NOT_CALCULATED = 'Percentual não calculado';

export function honestPercent(value, maximumFractionDigits = 1) {
  if (value == null || value === '') return PERCENT_NOT_CALCULATED;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return PERCENT_NOT_CALCULATED;
  return normalizeSpaces(new Intl.NumberFormat('pt-BR', {
    style: 'percent', maximumFractionDigits,
  }).format(numeric));
}

/** Texto curto para valor de texto ausente, sem inventar conteúdo. */
export function honestText(value) {
  if (value == null) return ABSENT;
  const text = String(value).trim();
  return text.length ? text : ABSENT;
}

export { ERROR_MESSAGES, ENUMS };
