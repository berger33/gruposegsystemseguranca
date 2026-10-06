// UX-07 / EXT-11 / F07 — vocabulário da família ANALYTICS.
//
// Levantamento dos códigos (método registrado em
// docs/UX-07-ANALYTICS-2026-10-06.md, seção 3):
//
//   grep -ohE "\b[a-zA-Z_]{2,16}\(\s*res\s*,\s*['\"`][a-z0-9_]+" src/server/*analytics*.mjs \
//     | sed -E "s/\(.*//" | sort | uniq -c
//
// A família NÃO define wrappers locais do tipo `bad(res, 'codigo')` /
// `unavailable(res, 'codigo')`: todas as respostas saem por `json(res, status,
// { error: '...' })`, inclusive as montadas dentro de `work()` e devolvidas
// por `mutation()`. Mesmo assim o extrator anti-deriva de
// tests/ux-analytics-vocabulary.test.mjs continua casando os três formatos
// (literal, `new HttpError()/new E()` e wrapper), para que a introdução de um
// wrapper amanhã não passe despercebida.
//
// Duas origens reais, ambas lidas pelo teste:
//
//  1. `src/server/ext-analytics-api.mjs` — servidor canônico, o único religado
//     em server.mjs (`/api/ext/analytics/*` e as quatro rotas legadas que caem
//     em `handleLegacy`). 37 códigos.
//  2. O trecho `handleAnalyticsExperiments` de `src/server/ext-advanced-api.mjs`
//     — handler legado EXT-11 que **não tem rota HTTP** hoje (server.mjs só
//     religa `handleComplianceDocuments` e `handleContinuityPlans` desse
//     arquivo). Ele é coberto de propósito: se alguém religar a rota, a pessoa
//     lê português em vez do código cru. Só o trecho da família é lido — o
//     restante do arquivo pertence a EXT-07/08/09/10/12 e está fora deste
//     recorte. 4 códigos exclusivos.
//
// Total real: 41 códigos, zero duplicado, zero inventado.
//
// Regras desta camada:
//  - código desconhecido PASSA CRU: nada é inventado;
//  - o código canônico é informação técnica (rodapé/parênteses), nunca o
//    título principal lido por quem opera;
//  - ausência nunca vira zero, 0%, 01/01/1970 ou equivalente;
//  - nenhum vocabulário para `winner`/`result_*`: a jornada canônica remove
//    esses campos da resposta (`publicExperiment`) e traduzi-los daria
//    aparência de verdade a um valor que o produto recusa calcular.

const ERROR_MESSAGES = Object.freeze({
  // --- servidor canônico: src/server/ext-analytics-api.mjs -----------------
  approval_note_required: { kind: 'invalid', title: 'Nota de aprovação obrigatória', detail: 'Escreva o que foi revisado (hipótese, variantes, métrica e minimização) antes de registrar a aprovação humana.', canRetry: false },
  approval_only_in_draft: { kind: 'conflict', title: 'Aprovação só vale em rascunho', detail: 'O experimento já saiu do rascunho; a aprovação humana acontece antes de qualquer execução.', canRetry: false },
  approval_required: { kind: 'conflict', title: 'Aprovação humana necessária', detail: 'A execução só começa depois de uma aprovação humana registrada; o sistema não aprova sozinho.', canRetry: false },
  audit_unavailable: { kind: 'unavailable', title: 'Auditoria indisponível', detail: 'A operação foi desfeita por inteiro porque a trilha de auditoria não pôde ser gravada. Nada ficou registrado pela metade.', canRetry: true },
  conclusion_note_required: { kind: 'invalid', title: 'Nota de conclusão obrigatória', detail: 'Conclua descrevendo o que as observações reais mostraram. O sistema não escreve conclusão por você.', canRetry: false },
  database_error: { kind: 'unavailable', title: 'Leitura indisponível', detail: 'Não foi possível consultar os experimentos agora. Isto não significa que não existam experimentos.', canRetry: true },
  experiment_not_found: { kind: 'not_found', title: 'Experimento não encontrado', detail: 'O experimento não existe na jornada canônica ou não está disponível neste escopo.', canRetry: false },
  experiment_not_running: { kind: 'conflict', title: 'Experimento fora de execução', detail: 'Observações reais só entram enquanto o experimento está em execução.', canRetry: false },
  forbidden: { kind: 'denied', title: 'Permissão granular ausente', detail: 'Sua conta abriu a tela, mas não tem a permissão granular que o servidor exige para esta ação.', canRetry: false },
  idempotency_conflict_payload_mismatch: { kind: 'conflict', title: 'Chave já usada com dados diferentes', detail: 'A operação foi recusada para preservar a idempotência. Repita com uma operação nova.', canRetry: false },
  idempotency_key_required: { kind: 'invalid', title: 'Identificador da operação ausente', detail: 'A operação precisa de uma chave de idempotência válida para não duplicar efeito.', canRetry: false },
  insufficient_real_observations: { kind: 'conflict', title: 'Dados reais insuficientes', detail: 'A conclusão exige pelo menos uma observação real de A e uma de B. Nada é completado por estimativa.', canRetry: false },
  internal_error: { kind: 'unavailable', title: 'Erro interno do servidor', detail: 'O servidor não concluiu a operação. Nenhum efeito parcial foi mantido.', canRetry: true },
  invalid_description: { kind: 'invalid', title: 'Descrição inválida', detail: 'Descreva o escopo com o tamanho exigido pelo servidor.', canRetry: false },
  invalid_experiment_id: { kind: 'invalid', title: 'Identificador inválido', detail: 'O experimento selecionado não tem um identificador válido.', canRetry: false },
  invalid_hypothesis: { kind: 'invalid', title: 'Hipótese inválida', detail: 'Escreva uma hipótese explícita com o tamanho exigido pelo servidor.', canRetry: false },
  invalid_json: { kind: 'invalid', title: 'Dados inválidos', detail: 'O servidor não reconheceu o conteúdo enviado.', canRetry: false },
  invalid_justification: { kind: 'invalid', title: 'Justificativa inválida', detail: 'A justificativa enviada não tem o tamanho exigido pelo servidor.', canRetry: false },
  invalid_metric_name: { kind: 'invalid', title: 'Métrica declarada inválida', detail: 'Informe o nome da métrica com o tamanho exigido pelo servidor.', canRetry: false },
  invalid_metric_value: { kind: 'invalid', title: 'Valor observado inválido', detail: 'O valor da métrica precisa ser um número não negativo dentro do limite aceito.', canRetry: false },
  invalid_sample_size: { kind: 'invalid', title: 'Tamanho de amostra inválido', detail: 'A amostra precisa ser um número inteiro de pelo menos 1.', canRetry: false },
  invalid_source_record_id: { kind: 'invalid', title: 'Registro de origem inválido', detail: 'A referência ao registro operacional de origem não é um identificador válido.', canRetry: false },
  invalid_source_recorded_at: { kind: 'invalid', title: 'Data da origem inválida', detail: 'Informe quando o registro operacional aconteceu de verdade; data futura não é aceita.', canRetry: false },
  invalid_status: { kind: 'invalid', title: 'Estado inválido', detail: 'O estado solicitado não existe na jornada canônica.', canRetry: false },
  invalid_transition: { kind: 'conflict', title: 'Transição não permitida', detail: 'O estado atual do experimento não permite essa mudança.', canRetry: false },
  invalid_variant: { kind: 'invalid', title: 'Variante inválida', detail: 'A observação precisa indicar a variante A ou a variante B.', canRetry: false },
  invalid_variants: { kind: 'invalid', title: 'Variantes inválidas', detail: 'Informe duas variantes diferentes, cada uma com o tamanho exigido pelo servidor.', canRetry: false },
  legacy_writer_retired: { kind: 'conflict', title: 'Tela antiga somente para leitura', detail: 'A escrita pela rota legada foi aposentada. Use a jornada canônica de analytics.', canRetry: false },
  method_not_allowed: { kind: 'invalid', title: 'Operação não permitida', detail: 'Este método não está disponível para o recurso solicitado.', canRetry: false },
  metric_mismatch: { kind: 'invalid', title: 'Métrica diferente da declarada', detail: 'A observação precisa usar exatamente a métrica declarada no experimento.', canRetry: false },
  not_found: { kind: 'not_found', title: 'Recurso não encontrado', detail: 'O endereço solicitado não corresponde a uma operação disponível.', canRetry: false },
  observation_must_be_real_source: { kind: 'invalid', title: 'Observação precisa ser real', detail: 'O servidor recusa observação marcada como sintética e recusa resultado, vencedor ou significância digitados.', canRetry: false },
  origin_forbidden: { kind: 'denied', title: 'Origem não autorizada', detail: 'A operação foi recusada por proteção de origem.', canRetry: false },
  payload_too_large: { kind: 'invalid', title: 'Dados muito extensos', detail: 'Reduza o conteúdo enviado e tente de novo.', canRetry: false },
  privacy_minimization_required: { kind: 'invalid', title: 'Minimização de dados obrigatória', detail: 'O experimento não pode coletar identificadores diretos nem declarar descumprimento de privacidade.', canRetry: false },
  real_source_required: { kind: 'invalid', title: 'Origem operacional real obrigatória', detail: 'Informe uma origem interna real. Referência sintética, fictícia ou de fixture é recusada pelo servidor.', canRetry: false },
  unauthorized: { kind: 'denied', title: 'Sessão necessária', detail: 'Entre novamente com uma sessão de equipe para consultar esta área.', canRetry: true },

  // --- trecho legado EXT-11 de src/server/ext-advanced-api.mjs -------------
  // Sem rota HTTP hoje. Traduzido para que religar a rota não devolva código
  // cru à tela. Ver cabeçalho e docs/UX-07-ANALYTICS-2026-10-06.md.
  missing_id: { kind: 'invalid', title: 'Identificador ausente', detail: 'A operação legada exige o identificador do experimento.', canRetry: false },
  invalid_variant_a: { kind: 'invalid', title: 'Variante A inválida', detail: 'Informe a variante A com o tamanho exigido pelo servidor.', canRetry: false },
  invalid_variant_b: { kind: 'invalid', title: 'Variante B inválida', detail: 'Informe a variante B com o tamanho exigido pelo servidor.', canRetry: false },
  invalid_winner: { kind: 'conflict', title: 'Vencedor recusado pelo servidor', detail: 'Campo legado da tabela 086. A jornada canônica não lê, não devolve e não aceita vencedor como verdade.', canRetry: false },
});

// ENUMs efetivamente usados pela família. Valor desconhecido é preservado cru.
const ENUMS = Object.freeze({
  // ext_analytics_status (migração 086, jornada canônica 163).
  experimentStatus: {
    rascunho: ['Rascunho', 'neutral'],
    em_execucao: ['Em execução', 'info'],
    concluido: ['Concluído', 'success'],
    cancelado: ['Cancelado', 'danger'],
    arquivado: ['Arquivado', 'neutral'],
  },
  // coluna `origin` (migração 163).
  experimentOrigin: {
    ext11_canonica: ['Jornada canônica EXT-11', 'success'],
    registro_legado: ['Registro legado', 'warning'],
  },
  // coluna `variant` de ext_analytics_observations.
  observationVariant: {
    A: ['Variante A', 'info'],
    B: ['Variante B', 'info'],
  },
  // coluna `source_type` de ext_analytics_observations.
  observationSource: {
    internal_operational_record: ['Registro operacional interno', 'success'],
    internal_event: ['Evento interno', 'success'],
  },
  // `event_type` de ext_analytics_experiment_events, montado no servidor.
  experimentEvent: {
    experiment_created: ['Experimento criado como rascunho', 'neutral'],
    experiment_approved: ['Aprovação humana registrada', 'success'],
    experiment_status_rascunho: ['Devolvido para rascunho', 'neutral'],
    experiment_status_em_execucao: ['Execução iniciada', 'info'],
    experiment_status_concluido: ['Concluído por decisão humana', 'success'],
    experiment_status_cancelado: ['Cancelado', 'danger'],
    experiment_status_arquivado: ['Arquivado', 'neutral'],
    observation_recorded: ['Observação real registrada', 'success'],
  },
});

/** Texto único para toda ausência de dado. Nunca zero, nunca data inicial. */
export const ABSENT = 'Dado ausente';

/**
 * `Intl.NumberFormat('pt-BR')` separa grupos e moeda com U+00A0/U+202F. Os
 * espaços rígidos quebram asserção literal em teste e colagem de texto, sem
 * acrescentar informação: são normalizados para espaço comum.
 */
const normalizeSpaces = (value) => String(value).replace(/[\u00a0\u202f]/g, ' ');

export function describeAnalyticsError(code, status = 0) {
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
export function analyticsErrorMessage(code, status = 0) {
  const descriptor = describeAnalyticsError(code, status);
  return `${descriptor.title}: ${descriptor.detail}${descriptor.code ? ` (${descriptor.code})` : ''}`;
}

/** Recusa de permissão é um estado próprio, distinto de falha de leitura. */
export function analyticsErrorVariant(descriptor) {
  return descriptor.kind === 'denied' ? 'denied' : 'error';
}

export function analyticsErrorFootnote(descriptor) {
  return descriptor.code ? `Código técnico: (${descriptor.code})` : 'Código técnico: indisponível';
}

export function enumLabel(group, value) {
  if (value == null || value === '') return ABSENT;
  return ENUMS[group]?.[String(value)]?.[0] ?? String(value);
}

export function enumTone(group, value) {
  return ENUMS[group]?.[String(value)]?.[1] ?? 'neutral';
}

export const experimentStatusLabel = (value) => enumLabel('experimentStatus', value);
export const experimentStatusTone = (value) => enumTone('experimentStatus', value);
export const experimentOriginLabel = (value) => enumLabel('experimentOrigin', value);
export const experimentOriginTone = (value) => enumTone('experimentOrigin', value);
export const observationVariantLabel = (value) => enumLabel('observationVariant', value);
export const observationVariantTone = (value) => enumTone('observationVariant', value);
export const observationSourceLabel = (value) => enumLabel('observationSource', value);
export const observationSourceTone = (value) => enumTone('observationSource', value);
export const experimentEventLabel = (value) => enumLabel('experimentEvent', value);
export const experimentEventTone = (value) => enumTone('experimentEvent', value);

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

/** Número observado (soma de métrica, amostra agregada). Mesma regra de `count`. */
export function honestNumber(value, maximumFractionDigits = 2) {
  if (value == null || value === '') return ABSENT;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return ABSENT;
  return normalizeSpaces(new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(numeric));
}

/**
 * Percentual honesto. O servidor de analytics **não** devolve taxa, conversão,
 * significância ou vencedor: toda chamada sem número real devolve a frase de
 * não cálculo, nunca `0%`.
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
