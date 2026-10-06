// UX-10 / EXT-09 — vocabulário da família EXPANSÃO.
//
// Origem única e real: `src/server/ext-expansion-api.mjs`, o único servidor da
// família religado em `server.mjs` (`/api/ext/expansion/*` mais os oito
// caminhos legados exatos que caem em `handleLegacyPlans` e
// `handleLegacyScenarios`). Este arquivo NÃO decide autorização, NÃO inventa
// endpoint e NÃO altera contrato: ele apenas traduz, para quem opera, o que o
// servidor já devolve.
//
// Levantamento dos códigos (reproduzível):
//
//   grep -o 'error: "[a-z_]*"' src/server/ext-expansion-api.mjs \
//     | sed 's/error: //' | tr -d '"' | sort -u
//
// Total real medido em 2026-10-06: 28 códigos, zero duplicado, zero inventado.
// O gate anti-deriva `tests/ux-expansion-vocabulary.test.mjs` relê o arquivo de
// servidor a cada execução e reprova código real sem tradução, tradução sem
// código real, máquina de estados divergente e lista de papéis divergente.
//
// Regras desta camada:
//  - código desconhecido PASSA CRU: nada é inventado para preencher lacuna;
//  - o código canônico é informação técnica (rodapé), nunca o título lido;
//  - recusa de papel é NEGADO, estado próprio, nunca "falha genérica";
//  - falha de leitura nunca vira lista vazia;
//  - ausência nunca vira zero, `R$ 0,00`, `0%` ou `01/01/1970`;
//  - toda cifra desta família é ESTIMATIVA declarada pelo próprio banco
//    (`is_estimate`/`estimate_note`), e a tela diz isso em vez de sugerir
//    projeção confirmada.

const ERROR_MESSAGES = Object.freeze({
  // --- guardas de sessão, papel e origem (guard) ---
  unauthorized: {
    kind: 'denied',
    title: 'Sessão de equipe necessária',
    detail: 'O servidor não reconheceu uma sessão de equipe válida. Abrir a rota pelo menu não concede acesso.',
    canRetry: true,
  },
  forbidden_role: {
    kind: 'denied',
    title: 'Papel sem acesso ao planejamento de expansão',
    detail: 'O servidor restringe esta jornada aos papéis que ele mesmo lista; o seu papel atual não está entre eles.',
    canRetry: false,
  },
  origin_forbidden: {
    kind: 'denied',
    title: 'Origem recusada',
    detail: 'Escritas só são aceitas a partir da mesma origem da aplicação.',
    canRetry: false,
  },
  approve_permission_required: {
    kind: 'denied',
    title: 'Decisão restrita à diretoria',
    detail: 'Aprovar, rejeitar, executar, concluir ou cancelar é decisão de papel restrito; o servidor recusou este papel para a transição pedida.',
    canRetry: false,
  },

  // --- leitura e corpo da requisição ---
  payload_too_large: {
    kind: 'invalid',
    title: 'Conteúdo muito extenso',
    detail: 'O corpo enviado ultrapassou o limite aceito pelo servidor. Reduza o texto das premissas ou da descrição.',
    canRetry: false,
  },
  invalid_json: {
    kind: 'invalid',
    title: 'Conteúdo ilegível',
    detail: 'O servidor não conseguiu interpretar o corpo enviado como JSON válido.',
    canRetry: false,
  },
  idempotency_key_required: {
    kind: 'invalid',
    title: 'Identificador da operação ausente',
    detail: 'Toda escrita desta família exige uma chave de idempotência válida para não duplicar efeito.',
    canRetry: false,
  },
  idempotency_conflict_payload_mismatch: {
    kind: 'conflict',
    title: 'Chave já usada com outro conteúdo',
    detail: 'A mesma chave de idempotência foi registrada antes com impressão digital diferente. O servidor recusou para não sobrescrever o efeito anterior.',
    canRetry: false,
  },

  // --- identificadores e existência ---
  invalid_plan_id: {
    kind: 'invalid',
    title: 'Identificador de plano inválido',
    detail: 'O identificador no endereço não tem formato de UUID.',
    canRetry: false,
  },
  invalid_scenario_id: {
    kind: 'invalid',
    title: 'Identificador de cenário inválido',
    detail: 'O identificador no endereço não tem formato de UUID.',
    canRetry: false,
  },
  plan_not_found: {
    kind: 'not_found',
    title: 'Plano não encontrado',
    detail: 'O identificador não aponta para nenhum plano de expansão canônico.',
    canRetry: false,
  },
  scenario_not_found: {
    kind: 'not_found',
    title: 'Cenário não encontrado',
    detail: 'O identificador não aponta para nenhum cenário financeiro canônico.',
    canRetry: false,
  },
  not_found: {
    kind: 'not_found',
    title: 'Rota de expansão inexistente',
    detail: 'O servidor canônico não reconhece este caminho ou este método. Nenhuma rota é inventada pela tela.',
    canRetry: false,
  },

  // --- validação de plano ---
  invalid_title: {
    kind: 'invalid',
    title: 'Título inválido',
    detail: 'O título precisa ter entre 5 e 200 caracteres, conforme o servidor.',
    canRetry: false,
  },
  invalid_description: {
    kind: 'invalid',
    title: 'Descrição inválida',
    detail: 'A descrição precisa ter entre 10 e 2000 caracteres, conforme o servidor.',
    canRetry: false,
  },
  invalid_premises: {
    kind: 'invalid',
    title: 'Premissas inválidas',
    detail: 'As premissas declaradas precisam ter entre 10 e 2000 caracteres. Sem premissa escrita não existe cenário honesto.',
    canRetry: false,
  },
  invalid_target_location: {
    kind: 'invalid',
    title: 'Localidade alvo inválida',
    detail: 'A localidade alvo precisa ter entre 3 e 200 caracteres, conforme o servidor.',
    canRetry: false,
  },

  // --- máquina de estados ---
  invalid_status: {
    kind: 'invalid',
    title: 'Situação inexistente',
    detail: 'A situação pedida não pertence à máquina de estados do servidor.',
    canRetry: false,
  },
  invalid_transition: {
    kind: 'conflict',
    title: 'Transição recusada pela máquina de estados',
    detail: 'A situação atual do plano não permite essa passagem. O servidor não salta etapa e não reabre estado terminal.',
    canRetry: false,
  },
  justification_required: {
    kind: 'invalid',
    title: 'Justificativa formal obrigatória',
    detail: 'Rejeitar ou cancelar exige justificativa escrita com pelo menos 5 caracteres; ela fica registrada no plano e no evento.',
    canRetry: false,
  },
  cannot_update_in_current_status: {
    kind: 'conflict',
    title: 'Plano fechado para edição',
    detail: 'Somente plano em rascunho ou em análise pode ser editado. Depois da decisão, o conteúdo é histórico.',
    canRetry: false,
  },

  // --- cenários financeiros ---
  invalid_scenario_name: {
    kind: 'invalid',
    title: 'Nome do cenário inválido',
    detail: 'O nome do cenário precisa ter entre 3 e 200 caracteres, conforme o servidor.',
    canRetry: false,
  },
  scenario_name_duplicate: {
    kind: 'conflict',
    title: 'Cenário com nome repetido',
    detail: 'Já existe um cenário com esse nome neste plano. O banco garante nome único por plano.',
    canRetry: false,
  },
  cannot_delete_scenario_in_current_status: {
    kind: 'conflict',
    title: 'Cenário preservado como histórico',
    detail: 'Cenários só podem ser removidos enquanto o plano está em rascunho ou em análise.',
    canRetry: false,
  },

  // --- indisponibilidade real do servidor ---
  audit_unavailable: {
    kind: 'unavailable',
    title: 'Auditoria indisponível',
    detail: 'A operação foi desfeita por inteiro porque negócio, evento e trilha de auditoria são gravados na mesma transação. Nada ficou pela metade.',
    canRetry: true,
  },
  database_error: {
    kind: 'unavailable',
    title: 'Leitura de expansão indisponível',
    detail: 'O servidor não concluiu a consulta ao banco. Isto não é ausência de planos.',
    canRetry: true,
  },
  internal_error: {
    kind: 'unavailable',
    title: 'Falha interna na operação',
    detail: 'O servidor desfez a transação e devolveu erro interno. Nenhum efeito parcial foi mantido.',
    canRetry: true,
  },

  // --- compatibilidade legada ---
  legacy_expansion_writer_retired: {
    kind: 'conflict',
    title: 'Escrita pela rota antiga aposentada',
    detail: 'Os caminhos legados permanecem somente para leitura. A escrita acontece apenas na rota canônica de expansão.',
    canRetry: false,
  },
});

/**
 * Máquina de estados — espelho literal de `VALID_TRANSITIONS` em
 * `src/server/ext-expansion-api.mjs`. O teste anti-deriva compara os dois.
 * A tela NUNCA decide transição: ela apenas oferece o que o servidor aceita e
 * continua aceitando a recusa como resposta legítima.
 */
const PLAN_TRANSITIONS = Object.freeze({
  rascunho: Object.freeze(['em_analise', 'cancelado']),
  em_analise: Object.freeze(['aprovado', 'rejeitado', 'rascunho', 'cancelado']),
  aprovado: Object.freeze(['em_execucao', 'cancelado']),
  rejeitado: Object.freeze(['rascunho']),
  em_execucao: Object.freeze(['concluido', 'cancelado']),
  concluido: Object.freeze([]),
  cancelado: Object.freeze([]),
});

/** Situações sem saída na máquina de estados do servidor. */
const TERMINAL_STATUSES = Object.freeze(['concluido', 'cancelado']);

/**
 * Papéis — espelho literal de STAFF_ROLES, EDIT_ROLES e APPROVE_ROLES do
 * servidor. Servem para EXPLICAR a regra a quem opera, nunca para decidir
 * acesso na tela: quem autoriza é o servidor, e a tela continua enviando a
 * operação e apresentando a recusa quando ela vem.
 */
const READ_ROLES = Object.freeze(['marcelo', 'admin', 'ti', 'comercial', 'financeiro']);
const EDIT_ROLES = Object.freeze(['marcelo', 'admin', 'ti', 'comercial']);
const APPROVE_ROLES = Object.freeze(['marcelo', 'admin']);

/** Transições que o servidor só aceita de um papel aprovador. */
const APPROVAL_ONLY_TRANSITIONS = Object.freeze([
  'aprovado', 'rejeitado', 'em_execucao', 'concluido', 'cancelado',
]);

/** Transições que o servidor recusa sem justificativa de 5 caracteres. */
const JUSTIFICATION_REQUIRED_TRANSITIONS = Object.freeze(['rejeitado', 'cancelado']);

const ENUMS = Object.freeze({
  // ENUM ext_expansion_status (migração 086) — também é o domínio das chaves
  // de VALID_TRANSITIONS no servidor.
  planStatus: {
    rascunho: ['Rascunho', 'neutral'],
    em_analise: ['Em análise', 'info'],
    aprovado: ['Aprovado', 'success'],
    rejeitado: ['Rejeitado', 'danger'],
    em_execucao: ['Em execução', 'info'],
    concluido: ['Concluído', 'success'],
    cancelado: ['Cancelado', 'neutral'],
  },
  // Verbo da ação, do ponto de vista de quem decide. É rótulo de botão, não
  // tradução de ENUM: o valor enviado ao servidor continua sendo o ENUM cru.
  transitionAction: {
    rascunho: ['Devolver para rascunho', 'neutral'],
    em_analise: ['Submeter para análise', 'info'],
    aprovado: ['Aprovar plano', 'success'],
    rejeitado: ['Rejeitar com justificativa', 'danger'],
    em_execucao: ['Iniciar execução', 'info'],
    concluido: ['Concluir plano', 'success'],
    cancelado: ['Cancelar com justificativa', 'danger'],
  },
  // `event_type` gravado por `recordEvent` em ext_expansion_events: dois
  // literais de plano, os sete `status_${nextStatus}` e dois de cenário.
  planEvent: {
    plano_criado: ['Plano criado como rascunho', 'neutral'],
    plano_atualizado: ['Plano atualizado', 'info'],
    status_rascunho: ['Devolvido para rascunho', 'neutral'],
    status_em_analise: ['Submetido para análise', 'info'],
    status_aprovado: ['Aprovado pela diretoria', 'success'],
    status_rejeitado: ['Rejeitado com justificativa', 'danger'],
    status_em_execucao: ['Execução iniciada', 'info'],
    status_concluido: ['Concluído', 'success'],
    status_cancelado: ['Cancelado com justificativa', 'neutral'],
    cenario_adicionado: ['Cenário financeiro adicionado', 'info'],
    cenario_removido: ['Cenário financeiro removido', 'neutral'],
  },
});

/** Texto único de ausência de dado. Nunca zero, nunca data inicial. */
export const ABSENT = 'Dado ausente';
/** Ausência de cifra. `R$ 0,00` fica reservado ao zero REAL do servidor. */
export const MONEY_ABSENT = 'Valor não informado';
/** O servidor devolve margem nula quando falta custo ou receita. */
export const MARGIN_NOT_CALCULATED = 'Margem não calculada';
/** Esta família não devolve percentual algum; a tela não inventa um. */
export const PERCENT_NOT_CALCULATED = 'Percentual não calculado';
/** Ausência de capacidade declarada. Zero vaga real continua sendo `0`. */
export const CAPACITY_ABSENT = 'Capacidade não informada';

/**
 * Fronteira declarada da família, repetida na tela. O banco marca cada plano e
 * cada cenário com `is_estimate = true` e um `estimate_note` fixo; nenhuma
 * cifra aqui é realizado, contratado ou comprometido.
 */
export const ESTIMATE_BOUNDARY =
  'Todo valor desta tela é estimativa declarada pela equipe, com premissa escrita ao lado. O banco marca cada plano e cada cenário como estimativa; nada aqui é receita contratada, custo realizado nem projeção confirmada.';

/**
 * Fronteira externa: não existe ator externo, integração de mercado, fonte de
 * preço ou estudo de viabilidade conectado. Tudo é declaração interna.
 */
export const EXTERNAL_BOUNDARY =
  'Não há integração com fonte externa de mercado, imobiliária, índice econômico ou estudo de viabilidade: localidade, capacidade, custo e receita são declarações internas da equipe, registradas com autoria e data pelo servidor.';

/**
 * `Intl.NumberFormat('pt-BR')` separa grupos com U+00A0/U+202F. Os espaços
 * rígidos quebram asserção literal e colagem de texto sem acrescentar
 * informação: são normalizados para espaço comum.
 */
const normalizeSpaces = value => String(value).replace(/[\u00a0\u202f]/g, ' ');

/** BIGINT do PostgreSQL chega como string pelo driver; `0` real é mantido. */
function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function describeExpansionError(code, status = 0) {
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
  // Desconhecido passa cru: o código aparece como informação técnica e nenhuma
  // frase é inventada para ele.
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
export function expansionErrorMessage(code, status = 0) {
  const descriptor = describeExpansionError(code, status);
  return `${descriptor.title}: ${descriptor.detail}${descriptor.code ? ` (${descriptor.code})` : ''}`;
}

/** Recusa de papel/sessão é estado próprio, distinto de falha de leitura. */
export function expansionErrorVariant(descriptor) {
  return descriptor?.kind === 'denied' ? 'denied' : 'error';
}

export function expansionErrorFootnote(descriptor) {
  if (!descriptor?.code) return 'Código técnico: indisponível';
  const http = Number(descriptor.status) > 0 ? `HTTP ${descriptor.status}` : 'sem resposta HTTP';
  return `Código técnico: ${descriptor.code} (${http})`;
}

export function enumLabel(group, value) {
  if (value == null || value === '') return ABSENT;
  return ENUMS[group]?.[String(value)]?.[0] ?? String(value);
}

export function enumTone(group, value) {
  return ENUMS[group]?.[String(value)]?.[1] ?? 'neutral';
}

export const planStatusLabel = value => enumLabel('planStatus', value);
export const planStatusTone = value => enumTone('planStatus', value);
export const transitionActionLabel = value => enumLabel('transitionAction', value);
export const transitionActionTone = value => enumTone('transitionAction', value);
export const planEventLabel = value => enumLabel('planEvent', value);
export const planEventTone = value => enumTone('planEvent', value);

/** Transições que o servidor aceita a partir da situação informada. */
export function allowedTransitions(status) {
  return PLAN_TRANSITIONS[String(status)] ?? [];
}

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(String(status));
}

export function requiresJustification(status) {
  return JUSTIFICATION_REQUIRED_TRANSITIONS.includes(String(status));
}

export function requiresApprovalRole(status) {
  return APPROVAL_ONLY_TRANSITIONS.includes(String(status));
}

/** Cifra em centavos. Ausência é dita; zero real continua `R$ 0,00`. */
export function honestMoney(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return MONEY_ABSENT;
  return normalizeSpaces(
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numeric / 100),
  );
}

/**
 * Margem. O servidor devolve `NULL` sempre que custo ou receita faltar, e a
 * tela diz exatamente isso — nunca `R$ 0,00` e nunca `0%`.
 */
export function honestMargin(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return MARGIN_NOT_CALCULATED;
  return honestMoney(numeric);
}

/** Capacidade declarada em vagas. Ausência é dita; zero real aparece como 0. */
export function honestCapacity(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return CAPACITY_ABSENT;
  return `${normalizeSpaces(new Intl.NumberFormat('pt-BR').format(numeric))} ${numeric === 1 ? 'vaga declarada' : 'vagas declaradas'}`;
}

/** Contagem. `0` vindo do servidor é zero real; ausência continua ausência. */
export function count(value) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return ABSENT;
  return normalizeSpaces(new Intl.NumberFormat('pt-BR').format(numeric));
}

/** Percentual honesto. Esta família não calcula nenhum; a frase é explícita. */
export function honestPercent(value, maximumFractionDigits = 1) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return PERCENT_NOT_CALCULATED;
  return normalizeSpaces(
    new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits }).format(numeric),
  );
}

/** Data sem hora. Ausência nunca vira 01/01/1970. */
export function honestDate(value) {
  if (value == null || value === '') return ABSENT;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return normalizeSpaces(new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date));
}

/** Data com hora, para a trilha imutável. Ausência continua ausência. */
export function honestDateTime(value) {
  if (value == null || value === '') return ABSENT;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return normalizeSpaces(
    new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' }).format(date),
  );
}

/** Texto ausente é dito, nunca preenchido com conteúdo inventado. */
export function honestText(value) {
  if (value == null) return ABSENT;
  const text = String(value).trim();
  return text.length ? text : ABSENT;
}

/**
 * Marco temporal de decisão. Ausência recebe a frase própria do marco
 * (“Aprovação pendente”, por exemplo) em vez de data ou traço mudo.
 */
export function honestMilestone(value, pendingLabel) {
  if (value == null || value === '') return pendingLabel;
  return honestDateTime(value);
}

export {
  ERROR_MESSAGES,
  ENUMS,
  PLAN_TRANSITIONS,
  TERMINAL_STATUSES,
  READ_ROLES,
  EDIT_ROLES,
  APPROVE_ROLES,
  APPROVAL_ONLY_TRANSITIONS,
  JUSTIFICATION_REQUIRED_TRANSITIONS,
};
