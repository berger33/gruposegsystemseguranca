// UX-07 / EXT-06 — vocabulário da família SATISFAÇÃO.
//
// Levantamento dos códigos (método registrado em
// docs/UX-07-SATISFACAO-2026-10-06.md, seção 3):
//
//   grep -ohE "\b[a-zA-Z_]{2,16}\(\s*res\s*,\s*['\"`][a-z0-9_]+" src/server/ext-satisfaction-api.mjs \
//     | sed -E "s/\(.*//" | sort | uniq -c
//
// O comando acima não devolve NADA: a família não define wrapper local algum
// (`bad(res,'codigo')`, `unavailable(res,'codigo')`, `new HttpError()`,
// `new E()`). Também não há exceção convertida em resposta: `readBody()`
// responde direto com `json(res,400,{error:"invalid_request"})` e
// `json(res,413,{error:"body_too_large"})` em vez de lançar. Mesmo assim o
// extrator anti-deriva de tests/ux-satisfaction-vocabulary.test.mjs continua
// casando os quatro formatos conhecidos, para que a introdução futura de um
// wrapper ou de uma exceção convertida não passe despercebida.
//
// UMA origem real, e a decisão sobre o recorte legado:
//
//  1. `src/server/ext-satisfaction-api.mjs` — servidor canônico, religado em
//     server.mjs (~linhas 4385–4393) por dispatch de `/api/ext/satisfaction/*`.
//     28 códigos por `error:` literal (três deles dentro do ternário de
//     `handlePlan`: `result_required`, `justification_required`,
//     `note_required`).
//  2. O recorte LEGADO somente-leitura (`handleLegacy`) vive DENTRO do mesmo
//     arquivo canônico e continua religado em server.mjs (~linha 3887, aliases
//     CLI-11, e ~linha 4395, aliases EXT-06). Ele devolve 410
//     `legacy_mutation_retired` em mutação e 200 com `items` em leitura.
//     DECISÃO REGISTRADA: por ser rota VIVA, `legacy_mutation_retired` ENTRA
//     no vocabulário — e, por morar no arquivo canônico, já é medido pela
//     mesma leitura, sem recorte por marcador.
//  3. `src/server/cli-finance-api.mjs` ainda exporta
//     `handleSatisfactionSurveys`/`handleSatisfactionActionPlans` com três
//     códigos próprios (`satisfaction_surveys_unavailable`,
//     `satisfaction_facts_unavailable`, `satisfaction_survey_unavailable`).
//     DECISÃO REGISTRADA: eles NÃO entram, porque server.mjs não despacha
//     mais nenhuma rota para esses dois handlers — EXT-06 assumiu
//     `/api/client/satisfaction-surveys` e os aliases `cli-satisfaction-*`.
//     É origem MORTA, como no caso de analytics. O teste anti-deriva fixa
//     essa decisão: se algum deles voltar ao dispatch, o gate falha.
//
// Total real: 28 códigos, zero duplicado, zero inventado.
//
// Regras desta camada:
//  - código desconhecido PASSA CRU: nada é inventado;
//  - o código canônico é informação técnica (rodapé/parênteses), nunca o
//    título principal lido por quem opera;
//  - ausência nunca vira zero, 0%, 01/01/1970 ou equivalente — e o servidor
//    desta família nomeia a ausência (`aggregate.absence = "sem_respostas"`,
//    `aggregate.value = null`, `empty_state`), que é usada como veio;
//  - contador REAL do servidor (inclusive zero) continua aparecendo como é;
//  - a fronteira de privacidade é dita como é: o portal do cliente recebe
//    apenas projeção mínima; responsável, fatos, notas internas e trilha
//    ficam na fronteira staff.

const ERROR_MESSAGES = Object.freeze({
  audit_unavailable: { kind: 'unavailable', title: 'Auditoria indisponível', detail: 'A operação foi desfeita por inteiro porque a trilha de auditoria não pôde ser gravada. Nada ficou registrado pela metade.', canRetry: true },
  body_too_large: { kind: 'invalid', title: 'Dados muito extensos', detail: 'O conteúdo enviado passou do limite aceito pelo servidor. Reduza o texto e tente de novo.', canRetry: false },
  client_session_required: { kind: 'denied', title: 'Sessão do portal do cliente necessária', detail: 'Esta leitura pertence ao portal do cliente e exige a sessão dele. A fronteira staff não responde por essa projeção.', canRetry: true },
  forbidden: { kind: 'denied', title: 'Vínculo do cliente não autoriza esta pesquisa', detail: 'O servidor confere a concessão de acesso da conta antes de responder e recusou este vínculo. Nada da pesquisa é devolvido na negativa.', canRetry: false },
  forbidden_role: { kind: 'denied', title: 'Papel sem acesso à jornada de satisfação', detail: 'A jornada é interna e o servidor a restringe aos papéis de equipe que ele autoriza. Abrir a tela pelo menu não concede acesso.', canRetry: false },
  idempotency_key_required: { kind: 'invalid', title: 'Identificador da operação ausente', detail: 'A operação precisa de uma chave de idempotência válida para não duplicar efeito.', canRetry: false },
  idempotency_key_reused: { kind: 'conflict', title: 'Chave já usada com dados diferentes', detail: 'A operação foi recusada para preservar a idempotência. Repita com uma operação nova.', canRetry: false },
  invalid_account_id: { kind: 'invalid', title: 'Conta do cliente inválida', detail: 'O identificador da conta não é válido. A tela não escolhe conta por conta própria.', canRetry: false },
  invalid_account_target: { kind: 'invalid', title: 'Conta e destinatário não combinam', detail: 'O destinatário precisa ter concessão ativa de acesso na conta escolhida, e a conta precisa estar ativa. O servidor confere o vínculo antes de criar a pesquisa.', canRetry: false },
  invalid_reference: { kind: 'invalid', title: 'Identificador inválido', detail: 'O identificador informado na URL não tem o formato aceito pelo servidor.', canRetry: false },
  invalid_request: { kind: 'invalid', title: 'Conteúdo enviado ilegível', detail: 'O servidor espera um objeto JSON no corpo da requisição e não conseguiu interpretar o que recebeu.', canRetry: false },
  invalid_response: { kind: 'invalid', title: 'Resposta do cliente inválida', detail: 'A resposta do portal exige nota inteira e comentário com o tamanho exigido pelo servidor.', canRetry: false },
  invalid_scoped_link: { kind: 'invalid', title: 'Vínculo fora do escopo da conta', detail: 'Contrato, chamado ou visita precisam pertencer à mesma conta da pesquisa. O servidor recusa vínculo de outra conta.', canRetry: false },
  invalid_survey_configuration: { kind: 'invalid', title: 'Configuração da pesquisa inválida', detail: 'Conta, destinatário, tipo, finalidade, metodologia, fonte declarada, escala e limiar são obrigatórios e precisam ser coerentes entre si. NPS exige escala 0–10 e CSAT exige escala 1–5; o limiar fica dentro da escala e a janela de referência, quando existir, precisa de início e fim.', canRetry: false },
  justification_required: { kind: 'invalid', title: 'Justificativa do cancelamento obrigatória', detail: 'Cancelar o acompanhamento exige a justificativa escrita por quem opera, com o tamanho exigido pelo servidor (10 a 1000 caracteres). A tela não escreve justificativa no lugar de ninguém.', canRetry: false },
  legacy_mutation_retired: { kind: 'conflict', title: 'Escrita pela rota antiga aposentada', detail: 'A escrita pelas rotas legadas de satisfação foi desligada; a leitura legada continua autorizada. Use a jornada canônica.', canRetry: false },
  method_not_allowed: { kind: 'invalid', title: 'Operação não permitida', detail: 'Este método não está disponível para o recurso solicitado.', canRetry: false },
  not_found: { kind: 'not_found', title: 'Pesquisa não encontrada', detail: 'A pesquisa não existe na jornada canônica de satisfação.', canRetry: false },
  note_required: { kind: 'invalid', title: 'Nota de início obrigatória', detail: 'Iniciar o acompanhamento exige um registro escrito por quem opera, com o tamanho exigido pelo servidor (3 a 1000 caracteres).', canRetry: false },
  origin_forbidden: { kind: 'denied', title: 'Origem da requisição recusada', detail: 'A escrita só é aceita a partir da própria aplicação. O servidor recusou a origem antes de qualquer efeito.', canRetry: false },
  plan_not_found: { kind: 'not_found', title: 'Acompanhamento não encontrado', detail: 'O plano de acompanhamento não existe na jornada canônica de satisfação.', canRetry: false },
  plan_terminal_or_invalid_transition: { kind: 'conflict', title: 'Transição não permitida', detail: 'O estado atual não permite essa mudança; acompanhamento concluído ou cancelado é terminal e imutável, no servidor e no banco.', canRetry: false },
  responsible_required: { kind: 'conflict', title: 'Responsável canônico ausente', detail: 'A conclusão exige responsável canônico registrado no acompanhamento. O servidor falha fechado em vez de concluir sem responsável, e a tela não inventa um.', canRetry: false },
  result_required: { kind: 'invalid', title: 'Resultado da conclusão obrigatório', detail: 'Concluir o acompanhamento exige o resultado escrito por quem opera, com o tamanho exigido pelo servidor (10 a 2000 caracteres). A tela não inventa conclusão.', canRetry: false },
  satisfaction_journey_unavailable: { kind: 'unavailable', title: 'Jornada de satisfação indisponível', detail: 'O servidor não concluiu a operação. Nenhum efeito parcial foi mantido.', canRetry: true },
  score_outside_declared_scale: { kind: 'invalid', title: 'Nota fora da escala declarada', detail: 'A nota precisa estar dentro da escala que a própria pesquisa declarou. O servidor não reescala resposta.', canRetry: false },
  survey_already_answered: { kind: 'conflict', title: 'Pesquisa já respondida', detail: 'Cada pesquisa aceita uma única resposta; a resposta registrada é imutável no banco.', canRetry: false },
  unauthorized: { kind: 'denied', title: 'Sessão de equipe necessária', detail: 'Entre novamente com uma sessão de equipe para consultar esta área.', canRetry: true },
});

// ENUMs efetivamente usados pela família. Valor desconhecido é preservado cru.
const ENUMS = Object.freeze({
  // cli_satisfaction_type (migração 076) — também validado no servidor
  // canônico em `["pos_atendimento","periodica","outro"]`.
  surveyType: {
    pos_atendimento: ['Pós-atendimento', 'info'],
    periodica: ['Periódica', 'info'],
    outro: ['Outro tipo declarado', 'neutral'],
  },
  // coluna `methodology` (migração 152), validada no servidor canônico.
  // `generica` existe justamente para NÃO chamar de NPS/CSAT o que não é.
  methodology: {
    generica: ['Escala genérica declarada (não é NPS nem CSAT)', 'neutral'],
    nps: ['NPS declarado (escala 0–10)', 'info'],
    csat: ['CSAT declarado (escala 1–5)', 'info'],
  },
  // cli_satisfaction_status (migração 076; `cancelada` acrescentada na 152).
  surveyStatus: {
    pendente: ['Aguardando resposta', 'warning'],
    respondida: ['Respondida', 'success'],
    em_acao: ['Em acompanhamento', 'info'],
    concluida: ['Concluída', 'success'],
    cancelada: ['Cancelada', 'neutral'],
  },
  // coluna `status` de cli_satisfaction_action_plans (constraint da 076,
  // forma terminal imposta pela 152).
  planStatus: {
    aberta: ['Aberto', 'warning'],
    em_andamento: ['Em andamento', 'info'],
    concluida: ['Concluído', 'success'],
    cancelada: ['Cancelado', 'neutral'],
  },
  // constraint `cli_satisfaction_ext06_origin_check` (migração 152).
  surveyOrigin: {
    ext06_canonica: ['Jornada canônica EXT-06', 'success'],
    registro_legado: ['Registro legado', 'warning'],
  },
  // constraint `cli_satisfaction_action_plans_origin_check` (migração 142).
  planOrigin: {
    portal_cliente: ['Derivado da resposta do portal', 'info'],
    registro_interno: ['Registro interno', 'neutral'],
  },
  // `event_type` gravado por src/server/ext-satisfaction-api.mjs.
  satisfactionEvent: {
    pesquisa_criada: ['Pesquisa configurada', 'neutral'],
    resposta_registrada: ['Resposta do cliente registrada', 'info'],
    acompanhamento_start: ['Acompanhamento iniciado', 'info'],
    acompanhamento_complete: ['Acompanhamento concluído', 'success'],
    acompanhamento_cancel: ['Acompanhamento cancelado', 'neutral'],
  },
  // `follow_up_operator` é fixado em 'lte' pelo servidor e pela migração 152.
  followUpOperator: {
    lte: ['nota menor ou igual ao limiar', 'neutral'],
  },
  // constraint `actor_kind IN ('staff','client')` de cli_satisfaction_events
  // (migração 152). A trilha diz de que lado veio cada ato.
  actorKind: {
    staff: ['Equipe interna', 'neutral'],
    client: ['Cliente, pelo portal', 'info'],
  },
  // `aggregate.absence` devolvido por handleList: ausência NOMEADA pelo
  // servidor. Ela nunca é convertida em zero por esta camada.
  absence: {
    sem_respostas: ['Sem respostas registradas', 'neutral'],
  },
});

/** Texto único para toda ausência de dado. Nunca zero, nunca data inicial. */
export const ABSENT = 'Dado ausente';

/**
 * O servidor devolve `aggregate.value = null` quando o denominador é zero.
 * A média então NÃO existe — e dizer isso é diferente de mostrar `0`.
 */
export const AVERAGE_NOT_CALCULATED = 'Média não calculada';

/** Período derivado das respostas: sem resposta, não há período apurado. */
export const PERIOD_NOT_MEASURED = 'Sem período apurado';

/**
 * `Intl.NumberFormat('pt-BR')` separa grupos com U+00A0/U+202F. Os espaços
 * rígidos quebram asserção literal em teste e colagem de texto, sem
 * acrescentar informação: são normalizados para espaço comum.
 */
const normalizeSpaces = (value) => String(value).replace(/[\u00a0\u202f]/g, ' ');

export function describeSatisfactionError(code, status = 0) {
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
export function satisfactionErrorMessage(code, status = 0) {
  const descriptor = describeSatisfactionError(code, status);
  return `${descriptor.title}: ${descriptor.detail}${descriptor.code ? ` (${descriptor.code})` : ''}`;
}

/** Recusa de permissão é um estado próprio, distinto de falha de leitura. */
export function satisfactionErrorVariant(descriptor) {
  return descriptor.kind === 'denied' ? 'denied' : 'error';
}

export function satisfactionErrorFootnote(descriptor) {
  return descriptor.code ? `Código técnico: (${descriptor.code})` : 'Código técnico: indisponível';
}

export function enumLabel(group, value) {
  if (value == null || value === '') return ABSENT;
  return ENUMS[group]?.[String(value)]?.[0] ?? String(value);
}

export function enumTone(group, value) {
  return ENUMS[group]?.[String(value)]?.[1] ?? 'neutral';
}

export const surveyTypeLabel = (value) => enumLabel('surveyType', value);
export const surveyTypeTone = (value) => enumTone('surveyType', value);
export const methodologyLabel = (value) => enumLabel('methodology', value);
export const methodologyTone = (value) => enumTone('methodology', value);
export const surveyStatusLabel = (value) => enumLabel('surveyStatus', value);
export const surveyStatusTone = (value) => enumTone('surveyStatus', value);
export const planStatusLabel = (value) => enumLabel('planStatus', value);
export const planStatusTone = (value) => enumTone('planStatus', value);
export const surveyOriginLabel = (value) => enumLabel('surveyOrigin', value);
export const surveyOriginTone = (value) => enumTone('surveyOrigin', value);
export const planOriginLabel = (value) => enumLabel('planOrigin', value);
export const planOriginTone = (value) => enumTone('planOrigin', value);
export const satisfactionEventLabel = (value) => enumLabel('satisfactionEvent', value);
export const satisfactionEventTone = (value) => enumTone('satisfactionEvent', value);
export const followUpOperatorLabel = (value) => enumLabel('followUpOperator', value);
export const actorKindLabel = (value) => enumLabel('actorKind', value);
export const actorKindTone = (value) => enumTone('actorKind', value);
export const absenceLabel = (value) => enumLabel('absence', value);

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
 * Contagem. `0` vindo do servidor é um zero real e aparece como `0` (a lista
 * canônica devolve contadores verdadeiros de respostas e acompanhamentos);
 * ausência (`null`/`undefined`/não numérico) aparece como ausência.
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
 * Média do indicador. `aggregate.value` é `null` sempre que o denominador é
 * zero: nesse caso a resposta honesta é "não calculada", NUNCA `0`.
 */
export function honestAverage(value, maximumFractionDigits = 2) {
  if (value == null || value === '') return AVERAGE_NOT_CALCULATED;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return AVERAGE_NOT_CALCULATED;
  return normalizeSpaces(new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(numeric));
}

/** Texto curto para valor de texto ausente, sem inventar conteúdo. */
export function honestText(value) {
  if (value == null) return ABSENT;
  const text = String(value).trim();
  return text.length ? text : ABSENT;
}

/** Escala declarada na própria pesquisa. Sem os dois extremos, não há escala. */
export function scaleLabel(min, max) {
  if (min == null || max == null) return ABSENT;
  const low = Number(min);
  const high = Number(max);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return ABSENT;
  return `${count(low)} a ${count(high)}`;
}

/**
 * Regra declarada que dispara o acompanhamento. O servidor grava
 * `{ operator, threshold, observed }`; operador desconhecido passa cru e
 * ausência continua ausência — a tela não deduz regra nenhuma.
 */
export function triggerRuleSummary(rule) {
  if (!rule || typeof rule !== 'object') return ABSENT;
  const { operator, threshold, observed } = rule;
  if (operator == null && threshold == null && observed == null) return ABSENT;
  const operatorText = operator == null ? ABSENT : followUpOperatorLabel(operator);
  const thresholdText = threshold == null ? ABSENT : count(threshold);
  const observedText = observed == null ? ABSENT : count(observed);
  return `Regra declarada: ${operatorText} (limiar ${thresholdText}); nota observada ${observedText}`;
}

/**
 * Fatos canônicos gravados junto do acompanhamento. Nenhum número é estimado:
 * o que não veio do servidor aparece como ausência.
 */
export function factsSummary(facts) {
  if (!facts || typeof facts !== 'object') return ABSENT;
  const { score, methodology } = facts;
  if (score == null && methodology == null) return ABSENT;
  return `Nota registrada ${score == null ? ABSENT : count(score)}; ${methodology == null ? ABSENT : methodologyLabel(methodology)}`;
}

export { ERROR_MESSAGES, ENUMS };
