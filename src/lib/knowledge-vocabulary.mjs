// UX-07 / EXT-08 — vocabulário da família CONHECIMENTO (base de conhecimento
// e procedimentos operacionais canônicos).
//
// Levantamento dos códigos (método registrado em
// docs/UX-07-CONHECIMENTO-2026-10-06.md, seção 3):
//
//   grep -ohE "\b[a-zA-Z_]{2,16}\(\s*res\s*,\s*['\"`][a-z0-9_]+" src/server/ext-knowledge-api.mjs \
//     | sed -E "s/\(.*//" | sort | uniq -c
//
// O comando acima não devolve NADA: a família não define wrapper local algum
// (`bad(res,'codigo')`, `unavailable(res,'codigo')`, `new HttpError()`,
// `new E()`). Todas as respostas saem por `json(res, status, { error: '...' })`,
// inclusive os `deny` montados dentro de `work()` e devolvidos por
// `executeMutation()`. Mesmo assim o extrator anti-deriva de
// tests/ux-knowledge-vocabulary.test.mjs continua casando os formatos
// conhecidos, para que a introdução futura de um wrapper não passe
// despercebida.
//
// UMA origem real, lida pelo teste: `src/server/ext-knowledge-api.mjs`.
// Diferente da família de compliance, as rotas LEGADAS desta família
// (`/api/admin/hr/ext-knowledge-base`, `/api/crm/hr/ext-knowledge-base`,
// `/api/hr/ext-knowledge-base`, `/api/ext/knowledge-base`, religadas em
// server.mjs ~linha 4411) despacham para `handleLegacy()` DENTRO do próprio
// servidor canônico: a leitura legada reaproveita `handleListArticles` e a
// escrita legada responde 410 `legacy_knowledge_writer_retired` — código que
// portanto já entra no levantamento da origem única.
//
// Dois códigos NÃO saem por `error: "..."` literal simples: `body_too_large`
// e `invalid_body` saem por ternário
// (`error: bodyResult.large ? "body_too_large" : "invalid_body"`). O extrator
// do teste casa TODOS os literais dentro da expressão de `error:`, então
// ambos são medidos — medir apenas o literal simples os deixaria sem
// tradução.
//
// Total real: 27 códigos, zero duplicado, zero inventado.
//
// Regras desta camada:
//  - código desconhecido PASSA CRU: nada é inventado;
//  - o código canônico é informação técnica (rodapé/parênteses), nunca o
//    título principal lido por quem opera;
//  - ausência nunca vira zero, 0%, 01/01/1970 ou equivalente;
//  - categoria, etiqueta (tag) e slug são TEXTO DECLARADO pela equipe (o
//    servidor valida apenas tamanho/formato, sem taxonomia fixa): a tela os
//    apresenta como vieram, sem inventar tradução;
//  - "menu não é autorização": a recusa 401/403 do servidor é estado próprio
//    (negado), nunca lista vazia.

const ERROR_MESSAGES = Object.freeze({
  archive_reason_required: { kind: 'invalid', title: 'Motivo de arquivamento obrigatório', detail: 'Arquivar um procedimento exige o motivo escrito, com o tamanho exigido pelo servidor. A tela não inventa motivo.', canRetry: false },
  article_not_found: { kind: 'not_found', title: 'Procedimento não encontrado', detail: 'O registro não existe na base de conhecimento canônica.', canRetry: false },
  article_not_published_for_acknowledgment: { kind: 'conflict', title: 'Ciência só vale para versão publicada', detail: 'O servidor só registra ciência sobre a versão publicada vigente. Rascunho, revisão, aprovação e arquivo não recebem ciência.', canRetry: false },
  audit_unavailable: { kind: 'unavailable', title: 'Auditoria indisponível', detail: 'A operação foi desfeita por inteiro porque a trilha de auditoria não pôde ser gravada. Nada ficou registrado pela metade.', canRetry: true },
  body_too_large: { kind: 'invalid', title: 'Dados muito extensos', detail: 'O conteúdo enviado passou do limite aceito pelo servidor. Reduza o texto e tente de novo.', canRetry: false },
  change_summary_required: { kind: 'invalid', title: 'Resumo da alteração obrigatório', detail: 'Toda atualização entra no histórico imutável com um resumo escrito, no tamanho exigido pelo servidor.', canRetry: false },
  database_error: { kind: 'unavailable', title: 'Leitura não concluída no banco', detail: 'O servidor não conseguiu concluir a consulta. Isto não é uma lista vazia nem um resultado zero.', canRetry: true },
  draft_not_accessible: { kind: 'denied', title: 'Versão não publicada é restrita', detail: 'Só os papéis de edição e quem criou o registro leem versões não publicadas. O servidor recusa sozinho; abrir a tela pelo menu não concede acesso.', canRetry: false },
  forbidden_by_role_scope: { kind: 'denied', title: 'Papel fora do escopo de acesso do procedimento', detail: 'Este procedimento publicado declara papéis de acesso e o seu papel não está entre eles. A recusa é do servidor, não da tela.', canRetry: false },
  forbidden_role: { kind: 'denied', title: 'Papel sem acesso à base de conhecimento', detail: 'Esta consulta é restrita aos papéis de equipe que o servidor autoriza. Abrir a tela pelo menu não concede acesso.', canRetry: false },
  idempotency_key_required: { kind: 'invalid', title: 'Identificador da operação ausente', detail: 'A operação precisa de uma chave de idempotência válida para não duplicar efeito.', canRetry: false },
  idempotency_key_reused: { kind: 'conflict', title: 'Chave já usada com dados diferentes', detail: 'A operação foi recusada para preservar a idempotência. Repita com uma operação nova.', canRetry: false },
  invalid_body: { kind: 'invalid', title: 'Conteúdo enviado ilegível', detail: 'O servidor não conseguiu interpretar o conteúdo da requisição como um objeto JSON.', canRetry: false },
  invalid_category: { kind: 'invalid', title: 'Categoria inválida', detail: 'A categoria é texto declarado pela equipe, com o tamanho exigido pelo servidor (3 a 100 caracteres).', canRetry: false },
  invalid_content: { kind: 'invalid', title: 'Conteúdo do procedimento inválido', detail: 'O conteúdo completo é obrigatório, com o tamanho exigido pelo servidor (50 a 20000 caracteres).', canRetry: false },
  invalid_id: { kind: 'invalid', title: 'Identificador inválido', detail: 'O identificador informado não é um identificador válido de procedimento.', canRetry: false },
  invalid_slug: { kind: 'invalid', title: 'Identificador permanente (slug) inválido', detail: 'O slug é minúsculo, com hífens, no tamanho exigido pelo servidor. Ele agrupa todas as versões do mesmo procedimento.', canRetry: false },
  invalid_status_transition: { kind: 'conflict', title: 'Transição de ciclo de vida não permitida', detail: 'O estado atual do procedimento não permite essa mudança. O ciclo canônico do servidor decide as transições, não a tela.', canRetry: false },
  invalid_summary: { kind: 'invalid', title: 'Resumo executivo inválido', detail: 'O resumo é opcional, mas quando escrito precisa ter o tamanho exigido pelo servidor (10 a 500 caracteres).', canRetry: false },
  invalid_target_status: { kind: 'invalid', title: 'Estado alvo desconhecido', detail: 'O servidor só aceita os cinco estados do ciclo de vida canônico como alvo de transição.', canRetry: false },
  invalid_title: { kind: 'invalid', title: 'Título inválido', detail: 'O título é obrigatório, com o tamanho exigido pelo servidor (5 a 200 caracteres).', canRetry: false },
  knowledge_mutation_failed: { kind: 'unavailable', title: 'Operação não concluída', detail: 'O servidor não concluiu a operação e a desfez por inteiro. Nenhum efeito parcial foi mantido.', canRetry: true },
  knowledge_route_not_found: { kind: 'not_found', title: 'Rota inexistente na base de conhecimento', detail: 'O caminho pedido não existe na jornada canônica desta família.', canRetry: false },
  legacy_knowledge_writer_retired: { kind: 'conflict', title: 'Escrita pela rota antiga aposentada', detail: 'A escrita legada da base de conhecimento foi desligada. Use a jornada canônica de procedimentos.', canRetry: false },
  origin_forbidden: { kind: 'denied', title: 'Origem da requisição recusada', detail: 'A escrita só é aceita a partir da própria aplicação. O servidor recusou a origem desta requisição.', canRetry: false },
  publish_permission_required: { kind: 'denied', title: 'Publicar exige papel de publicação', detail: 'Só os papéis de publicação autorizados pelo servidor publicam procedimento para a equipe. Editar não é publicar, e a tela não contorna isso.', canRetry: false },
  unauthorized: { kind: 'denied', title: 'Sessão necessária', detail: 'Entre novamente com uma sessão de equipe para consultar esta área.', canRetry: true },
});

// ENUMs efetivamente usados pela família. Valor desconhecido é preservado cru.
const ENUMS = Object.freeze({
  // ext_kb_status (migração 086): os cinco estados do ciclo de vida canônico.
  kbStatus: {
    rascunho: ['Rascunho', 'neutral'],
    em_revisao: ['Em revisão', 'warning'],
    aprovado: ['Aprovado tecnicamente', 'info'],
    publicado: ['Publicado', 'success'],
    arquivado: ['Arquivado', 'neutral'],
  },
  // constraint `ext_knowledge_origin_check` (migração 160).
  knowledgeOrigin: {
    ext08_canonica: ['Jornada canônica EXT-08', 'success'],
    registro_legado: ['Registro legado', 'warning'],
  },
  // `event_type` de ext_knowledge_events, montado no servidor canônico:
  // três literais (`artigo_criado`, `artigo_atualizado`, `nova_versao_criada`,
  // `ciencia_registrada`) e o dinâmico `transicao_${nextStatus}`, cujo alvo é
  // sempre um dos cinco estados de ext_kb_status.
  knowledgeEvent: {
    artigo_criado: ['Procedimento criado como rascunho', 'neutral'],
    artigo_atualizado: ['Conteúdo atualizado em edição', 'info'],
    nova_versao_criada: ['Nova versão criada a partir da versão imutável', 'info'],
    transicao_rascunho: ['Devolvido a rascunho', 'warning'],
    transicao_em_revisao: ['Enviado para revisão', 'info'],
    transicao_aprovado: ['Aprovado tecnicamente', 'info'],
    transicao_publicado: ['Publicado para a equipe', 'success'],
    transicao_arquivado: ['Arquivado', 'neutral'],
    ciencia_registrada: ['Ciência registrada por colaborador', 'success'],
  },
  // coluna `source` de ext_knowledge_acknowledgments: o servidor grava
  // literalmente 'jornada_canonica'; a migração 160 fixa o mesmo padrão.
  ackSource: {
    jornada_canonica: ['Jornada canônica de ciência', 'neutral'],
  },
  // STAFF_ROLES do servidor canônico: papéis aceitos em sessão e em
  // `access_roles`. O rótulo é de apresentação; o valor cru decide no servidor.
  accessRole: {
    admin: ['Administração', 'info'],
    ti: ['TI', 'info'],
    marcelo: ['Direção (Marcelo)', 'info'],
    rh: ['RH', 'info'],
    operacao: ['Operação', 'info'],
    supervisor: ['Supervisão', 'info'],
    comercial: ['Comercial', 'info'],
    financeiro: ['Financeiro', 'info'],
  },
});

/**
 * Ciclo de vida canônico, ESPELHO de KB_TRANSITIONS exportado por
 * src/server/ext-knowledge-api.mjs. O teste anti-deriva compara os dois por
 * igualdade profunda: se o servidor mudar, este espelho falha o gate em vez
 * de derivar em silêncio. A tela usa este mapa só para APRESENTAR as
 * transições possíveis; quem decide continua sendo o servidor (409
 * `invalid_status_transition`).
 */
export const KB_NEXT_STATUS = Object.freeze({
  rascunho: ['em_revisao'],
  em_revisao: ['rascunho', 'aprovado'],
  aprovado: ['publicado', 'rascunho'],
  publicado: ['arquivado'],
  arquivado: ['rascunho'],
});

/** Texto único para toda ausência de dado. Nunca zero, nunca data inicial. */
export const ABSENT = 'Dado ausente';

/** Percentual nunca é inventado: sem base real, a tela diz que não calculou. */
export const PERCENT_NOT_CALCULATED = 'Percentual não calculado';

/**
 * `Intl.NumberFormat('pt-BR')` separa grupos com U+00A0/U+202F. Os espaços
 * rígidos quebram asserção literal em teste e colagem de texto, sem
 * acrescentar informação: são normalizados para espaço comum.
 */
const normalizeSpaces = (value) => String(value).replace(/[\u00a0\u202f]/g, ' ');

export function describeKnowledgeError(code, status = 0) {
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
export function knowledgeErrorMessage(code, status = 0) {
  const descriptor = describeKnowledgeError(code, status);
  return `${descriptor.title}: ${descriptor.detail}${descriptor.code ? ` (${descriptor.code})` : ''}`;
}

/** Recusa de permissão é um estado próprio, distinto de falha de leitura. */
export function knowledgeErrorVariant(descriptor) {
  return descriptor.kind === 'denied' ? 'denied' : 'error';
}

export function knowledgeErrorFootnote(descriptor) {
  return descriptor.code ? `Código técnico: (${descriptor.code})` : 'Código técnico: indisponível';
}

export function enumLabel(group, value) {
  if (value == null || value === '') return ABSENT;
  return ENUMS[group]?.[String(value)]?.[0] ?? String(value);
}

export function enumTone(group, value) {
  return ENUMS[group]?.[String(value)]?.[1] ?? 'neutral';
}

export const kbStatusLabel = (value) => enumLabel('kbStatus', value);
export const kbStatusTone = (value) => enumTone('kbStatus', value);
export const knowledgeOriginLabel = (value) => enumLabel('knowledgeOrigin', value);
export const knowledgeOriginTone = (value) => enumTone('knowledgeOrigin', value);
export const knowledgeEventLabel = (value) => enumLabel('knowledgeEvent', value);
export const knowledgeEventTone = (value) => enumTone('knowledgeEvent', value);
export const ackSourceLabel = (value) => enumLabel('ackSource', value);
export const accessRoleLabel = (value) => enumLabel('accessRole', value);
export const accessRoleTone = (value) => enumTone('accessRole', value);

/**
 * Escopo de acesso de um procedimento publicado. Lista vazia (ou ausente) é o
 * comportamento REAL do servidor: qualquer papel de equipe autenticado lê.
 * Papel desconhecido é preservado cru, exatamente como veio do banco.
 */
export function accessScopeLabel(roles) {
  if (!Array.isArray(roles) || roles.length === 0) return 'Todos os papéis de equipe autenticados';
  return roles.map((role) => accessRoleLabel(role)).join(', ');
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
 * Contagem. `0` vindo do servidor é um zero real e aparece como `0` (o
 * contador de ciências é verdadeiro, inclusive quando é zero); ausência
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
 * Percentual honesto. O servidor desta família **não** devolve taxa ou
 * índice algum hoje; a função existe para que nenhuma tela futura transforme
 * ausência em `0%`. `0` real continua `0%`.
 */
export function honestPercent(value, maximumFractionDigits = 1) {
  if (value == null || value === '') return PERCENT_NOT_CALCULATED;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return PERCENT_NOT_CALCULATED;
  return normalizeSpaces(new Intl.NumberFormat('pt-BR', {
    style: 'percent', maximumFractionDigits,
  }).format(numeric));
}

/** Texto declarado: passa como veio; ausência vira ausência explícita. */
export function honestText(value) {
  if (value == null || String(value).trim() === '') return ABSENT;
  return String(value);
}

export { ERROR_MESSAGES, ENUMS };
