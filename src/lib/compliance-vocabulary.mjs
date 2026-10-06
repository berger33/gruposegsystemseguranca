// UX-07 / EXT-07 — vocabulário da família COMPLIANCE.
//
// Levantamento dos códigos (método registrado em
// docs/UX-07-COMPLIANCE-2026-10-06.md, seção 3):
//
//   grep -ohE "\b[a-zA-Z_]{2,16}\(\s*res\s*,\s*['\"`][a-z0-9_]+" src/server/ext-compliance-api.mjs \
//     | sed -E "s/\(.*//" | sort | uniq -c
//
// O comando acima não devolve NADA: a família não define wrapper local algum
// (`bad(res,'codigo')`, `unavailable(res,'codigo')`, `new HttpError()`,
// `new E()`). Todas as respostas saem por `json(res, status, { error: '...' })`,
// inclusive os `deny` montados dentro de `work()` e devolvidos por `mutate()`.
// Mesmo assim o extrator anti-deriva de tests/ux-compliance-vocabulary.test.mjs
// continua casando os três formatos, para que a introdução futura de um
// wrapper não passe despercebida.
//
// DUAS origens reais, ambas lidas pelo teste:
//
//  1. `src/server/ext-compliance-api.mjs` — servidor canônico, religado em
//     server.mjs (~linha 4399) por dispatch único de `/api/ext/compliance/*`.
//     33 códigos por `error:` literal.
//  2. o recorte `// EXT-07 compliance` … `// EXT-08 base conhecimento` de
//     `src/server/ext-advanced-api.mjs` (`handleComplianceDocuments`) — rota
//     LEGADA de leitura que continua RELIGADA em server.mjs (~linha 4407),
//     diferente do caso de analytics. É origem viva, não preventiva:
//     acrescenta `legacy_writer_retired` (`forbidden` e `unauthorized` já
//     existem no canônico).
//
// Três códigos a mais saem por exceção (`throw Object.assign(new Error('…'),
// { status })`) e chegam a quem opera por `json(res, error.status,
// { error: error.message })` em `mutate()`: `body_too_large`, `invalid_json`
// e `object_required`. Eles são códigos REAIS do contrato (o gate herdado
// tests/ext07-compliance.integration.test.mjs exercita 400 e 413), então o
// extrator ganhou uma quarta regra para eles. Medir apenas `error:` literal
// teria deixado os três sem tradução.
//
// Total real: 37 códigos, zero duplicado, zero inventado.
//
// O scheduler (`src/server/ext-compliance-scheduler.mjs`) é processo de fundo:
// não tem código HTTP próprio (zero `error:` literal) e NÃO foi alterado.
//
// Regras desta camada:
//  - código desconhecido PASSA CRU: nada é inventado;
//  - o código canônico é informação técnica (rodapé/parênteses), nunca o
//    título principal lido por quem opera;
//  - ausência nunca vira zero, 0%, 01/01/1970 ou equivalente;
//  - a fronteira documental é dita como é: REFERÊNCIA DECLARADA, nunca upload,
//    arquivo verificado, checksum, malware scan, armazenamento confirmado ou
//    download (o servidor fixa `file_boundary` como
//    `referencia_declarada_nao_arquivo_verificado`).

const ERROR_MESSAGES = Object.freeze({
  action_plan_not_found: { kind: 'not_found', title: 'Plano de ação não encontrado', detail: 'O plano não existe na jornada canônica de compliance.', canRetry: false },
  audit_unavailable: { kind: 'unavailable', title: 'Auditoria indisponível', detail: 'A operação foi desfeita por inteiro porque a trilha de auditoria não pôde ser gravada. Nada ficou registrado pela metade.', canRetry: true },
  body_too_large: { kind: 'invalid', title: 'Dados muito extensos', detail: 'O conteúdo enviado passou do limite aceito pelo servidor. Reduza o texto e tente de novo.', canRetry: false },
  cancellation_justification_required: { kind: 'invalid', title: 'Justificativa de cancelamento obrigatória', detail: 'Cancelar tarefa ou plano exige a justificativa escrita, com o tamanho exigido pelo servidor.', canRetry: false },
  completion_requires_responsible_and_result: { kind: 'conflict', title: 'Conclusão exige responsável staff ativo', detail: 'O servidor só conclui com resultado escrito e um responsável de equipe ativo. A tela não substitui responsável ausente.', canRetry: false },
  completion_result_required: { kind: 'invalid', title: 'Resultado da conclusão obrigatório', detail: 'Descreva o resultado da conclusão com o tamanho exigido pelo servidor; a tela não inventa conclusão.', canRetry: false },
  compliance_journey_unavailable: { kind: 'unavailable', title: 'Jornada de compliance indisponível', detail: 'O servidor não concluiu a operação. Nenhum efeito parcial foi mantido.', canRetry: true },
  conflict: { kind: 'conflict', title: 'Registro em conflito', detail: 'O banco recusou a gravação por já existir um registro equivalente. Nada foi duplicado.', canRetry: false },
  current_document_exists: { kind: 'conflict', title: 'Já existe referência corrente', detail: 'Cada obrigação tem uma única referência corrente. Renove a atual em vez de criar outra.', canRetry: false },
  document_not_found: { kind: 'not_found', title: 'Referência documental não encontrada', detail: 'O registro não existe na jornada canônica de compliance.', canRetry: false },
  forbidden: { kind: 'denied', title: 'Papel sem acesso ao compliance', detail: 'A jornada de compliance é interna e o servidor a restringe aos papéis de equipe que ele autoriza. Abrir a tela pelo menu não concede acesso.', canRetry: false },
  idempotency_key_required: { kind: 'invalid', title: 'Identificador da operação ausente', detail: 'A operação precisa de uma chave de idempotência válida para não duplicar efeito.', canRetry: false },
  idempotency_key_reused: { kind: 'conflict', title: 'Chave já usada com dados diferentes', detail: 'A operação foi recusada para preservar a idempotência. Repita com uma operação nova.', canRetry: false },
  invalid_action_plan: { kind: 'invalid', title: 'Plano de ação inválido', detail: 'Título e descrição são obrigatórios, com os tamanhos exigidos pelo servidor; o identificador precisa ser válido.', canRetry: false },
  invalid_document: { kind: 'invalid', title: 'Referência documental inválida', detail: 'Título e descrição são obrigatórios, com os tamanhos exigidos pelo servidor; o identificador precisa ser válido.', canRetry: false },
  invalid_due_date: { kind: 'invalid', title: 'Prazo inválido', detail: 'O prazo do plano precisa ser uma data no formato AAAA-MM-DD. A tela não inventa prazo.', canRetry: false },
  invalid_json: { kind: 'invalid', title: 'Conteúdo enviado ilegível', detail: 'O servidor não conseguiu interpretar o conteúdo da requisição.', canRetry: false },
  invalid_obligation: { kind: 'invalid', title: 'Obrigação inválida', detail: 'Tipo, título, descrição, fonte declarada, escopo, justificativa de aplicabilidade e regra de validade são obrigatórios, com os tamanhos exigidos.', canRetry: false },
  invalid_plan_type: { kind: 'invalid', title: 'Tipo de plano inválido', detail: 'O plano é corretivo ou preventivo; nenhum outro tipo é aceito pelo servidor.', canRetry: false },
  invalid_root_cause: { kind: 'invalid', title: 'Causa raiz inválida', detail: 'A causa raiz é opcional, mas quando escrita precisa ter o tamanho exigido pelo servidor.', canRetry: false },
  invalid_task: { kind: 'invalid', title: 'Tarefa de vencimento inválida', detail: 'O identificador da tarefa não é válido.', canRetry: false },
  invalid_transition: { kind: 'conflict', title: 'Transição não permitida', detail: 'O estado atual não permite essa mudança; tarefa ou plano concluído e cancelado são terminais e imutáveis.', canRetry: false },
  invalid_validity: { kind: 'invalid', title: 'Período de validade inválido', detail: 'Emissão e vencimento são obrigatórios, o vencimento não pode ser anterior à emissão e o início de vigência precisa cair dentro do período.', canRetry: false },
  issue_date_in_future: { kind: 'invalid', title: 'Emissão no futuro', detail: 'A data de emissão não pode ser posterior à data do servidor. O relógio de quem opera não decide validade.', canRetry: false },
  legacy_document_not_renewable: { kind: 'conflict', title: 'Registro legado não é renovável', detail: 'Registros de origem legada não entram no ciclo canônico de renovação.', canRetry: false },
  legacy_writer_retired: { kind: 'conflict', title: 'Escrita pela rota antiga aposentada', detail: 'A escrita legada de documentos foi desligada. Use a jornada canônica de compliance.', canRetry: false },
  method_not_allowed: { kind: 'invalid', title: 'Operação não permitida', detail: 'Este método não está disponível para o recurso solicitado.', canRetry: false },
  obligation_not_found: { kind: 'not_found', title: 'Obrigação não encontrada', detail: 'A obrigação vinculada não existe na jornada canônica de compliance.', canRetry: false },
  object_required: { kind: 'invalid', title: 'Formato do conteúdo inesperado', detail: 'O servidor espera um objeto JSON no corpo da requisição.', canRetry: false },
  private_reference_required: { kind: 'invalid', title: 'Referência declarada obrigatória', detail: 'Toda referência é privada e declarada: tipo e texto da referência são obrigatórios. Isto não é upload nem arquivo verificado.', canRetry: false },
  renewal_justification_required: { kind: 'invalid', title: 'Justificativa de renovação obrigatória', detail: 'A renovação exige justificativa escrita, com o tamanho exigido pelo servidor; a versão anterior vira histórico imutável.', canRetry: false },
  renewal_requires_current_validity: { kind: 'conflict', title: 'Renovação exige validade corrente', detail: 'O novo período precisa estar vigente na data do servidor; renovar para um período já vencido não é aceito.', canRetry: false },
  responsible_staff_missing: { kind: 'conflict', title: 'Responsável de equipe ausente', detail: 'A obrigação não tem responsável de equipe ativo. O servidor falha fechado em vez de registrar sem responsável.', canRetry: false },
  responsible_staff_required: { kind: 'invalid', title: 'Responsável precisa ser equipe ativa', detail: 'O responsável tem que ser uma identidade de equipe ativa e autorizada; a tela não inventa responsável.', canRetry: false },
  task_not_found: { kind: 'not_found', title: 'Tarefa de vencimento não encontrada', detail: 'A tarefa não existe na jornada canônica de compliance.', canRetry: false },
  terminal_document_not_renewable: { kind: 'conflict', title: 'Referência terminal não é renovável', detail: 'Referências canceladas ou já substituídas são históricas e imutáveis; renove a versão corrente.', canRetry: false },
  unauthorized: { kind: 'denied', title: 'Sessão necessária', detail: 'Entre novamente com uma sessão de equipe para consultar esta área.', canRetry: true },
});

// ENUMs efetivamente usados pela família. Valor desconhecido é preservado cru.
const ENUMS = Object.freeze({
  // ext_compliance_status (migração 086; `substituida` acrescentada na 155).
  documentStatus: {
    vigente: ['Vigente', 'success'],
    a_vencer: ['A vencer', 'warning'],
    vencida: ['Vencida', 'danger'],
    em_renovacao: ['Em renovação', 'info'],
    cancelada: ['Cancelada', 'neutral'],
    substituida: ['Substituída por renovação', 'neutral'],
  },
  // ext_compliance_type (migração 086).
  complianceType: {
    licenca: ['Licença', 'info'],
    certidao: ['Certidão', 'info'],
    seguro: ['Seguro', 'info'],
    alvara: ['Alvará', 'info'],
    outro: ['Outro tipo declarado', 'neutral'],
  },
  // coluna `status` de ext_compliance_obligations (constraint da migração 153).
  obligationStatus: {
    pendente: ['Pendente', 'warning'],
    vigente: ['Vigente', 'success'],
    a_vencer: ['A vencer', 'warning'],
    vencida: ['Vencida', 'danger'],
    em_renovacao: ['Em renovação', 'info'],
    nao_aplicavel: ['Declarada não aplicável', 'neutral'],
    encerrada: ['Encerrada', 'neutral'],
  },
  // coluna `criticality` de ext_compliance_obligations (migração 153).
  criticality: {
    baixa: ['Baixa', 'neutral'],
    media: ['Média', 'info'],
    alta: ['Alta', 'warning'],
    critica: ['Crítica', 'danger'],
  },
  // coluna `status` de ext_compliance_tasks (constraint da migração 153).
  taskStatus: {
    aberta: ['Aberta', 'warning'],
    em_andamento: ['Em andamento', 'info'],
    concluida: ['Concluída', 'success'],
    cancelada: ['Cancelada', 'neutral'],
  },
  // coluna `status` de ext_compliance_action_plans (constraint da migração 168).
  planStatus: {
    aberto: ['Aberto', 'warning'],
    em_andamento: ['Em andamento', 'info'],
    concluido: ['Concluído', 'success'],
    cancelado: ['Cancelado', 'neutral'],
  },
  // coluna `plan_type` de ext_compliance_action_plans (migração 168).
  planType: {
    corretivo: ['Corretivo', 'warning'],
    preventivo: ['Preventivo', 'info'],
  },
  // REFERENCE_TYPES aceitos por src/server/ext-compliance-api.mjs. Nenhum
  // deles é arquivo: todos são declarações rastreáveis.
  referenceType: {
    referencia_declarada: ['Referência declarada', 'neutral'],
    numero_declarado: ['Número declarado', 'neutral'],
    registro_publico_declarado: ['Registro público declarado', 'neutral'],
    outro_declarado: ['Outra declaração', 'neutral'],
  },
  // constraint `ext_compliance_origin_check` (migração 153).
  complianceOrigin: {
    ext07_canonica: ['Jornada canônica EXT-07', 'success'],
    registro_legado: ['Registro legado', 'warning'],
  },
  // ext_compliance_evaluation_runs (migração 156): avaliação agendada.
  runStatus: {
    concluida: ['Concluída', 'success'],
    falha: ['Falha', 'danger'],
  },
  runOrigin: {
    agendada: ['Execução agendada', 'info'],
  },
  // `event_type` de ext_compliance_events, montado no servidor canônico.
  complianceEvent: {
    obligation_created: ['Obrigação declarada', 'neutral'],
    document_created: ['Referência documental registrada', 'info'],
    document_renewed: ['Renovação registrada como nova versão', 'info'],
    expiry_evaluated: ['Avaliação de vencimento executada', 'info'],
    task_start: ['Tarefa de vencimento iniciada', 'info'],
    task_complete: ['Tarefa de vencimento concluída', 'success'],
    task_cancel: ['Tarefa de vencimento cancelada', 'neutral'],
    action_plan_created: ['Plano de ação registrado', 'neutral'],
    action_plan_start: ['Plano de ação iniciado', 'info'],
    action_plan_complete: ['Plano de ação concluído', 'success'],
    action_plan_cancel: ['Plano de ação cancelado', 'neutral'],
  },
  // motivos do array `failed_closed` da avaliação temporal. Não são códigos de
  // erro HTTP: são o relato honesto do que o servidor recusou fazer.
  failedClosedReason: {
    responsible_staff_missing: ['obrigação sem responsável de equipe ativo', 'warning'],
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

export function describeComplianceError(code, status = 0) {
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
export function complianceErrorMessage(code, status = 0) {
  const descriptor = describeComplianceError(code, status);
  return `${descriptor.title}: ${descriptor.detail}${descriptor.code ? ` (${descriptor.code})` : ''}`;
}

/** Recusa de permissão é um estado próprio, distinto de falha de leitura. */
export function complianceErrorVariant(descriptor) {
  return descriptor.kind === 'denied' ? 'denied' : 'error';
}

export function complianceErrorFootnote(descriptor) {
  return descriptor.code ? `Código técnico: (${descriptor.code})` : 'Código técnico: indisponível';
}

export function enumLabel(group, value) {
  if (value == null || value === '') return ABSENT;
  return ENUMS[group]?.[String(value)]?.[0] ?? String(value);
}

export function enumTone(group, value) {
  return ENUMS[group]?.[String(value)]?.[1] ?? 'neutral';
}

export const documentStatusLabel = (value) => enumLabel('documentStatus', value);
export const documentStatusTone = (value) => enumTone('documentStatus', value);
export const complianceTypeLabel = (value) => enumLabel('complianceType', value);
export const complianceTypeTone = (value) => enumTone('complianceType', value);
export const obligationStatusLabel = (value) => enumLabel('obligationStatus', value);
export const obligationStatusTone = (value) => enumTone('obligationStatus', value);
export const criticalityLabel = (value) => enumLabel('criticality', value);
export const criticalityTone = (value) => enumTone('criticality', value);
export const taskStatusLabel = (value) => enumLabel('taskStatus', value);
export const taskStatusTone = (value) => enumTone('taskStatus', value);
export const planStatusLabel = (value) => enumLabel('planStatus', value);
export const planStatusTone = (value) => enumTone('planStatus', value);
export const planTypeLabel = (value) => enumLabel('planType', value);
export const planTypeTone = (value) => enumTone('planType', value);
export const referenceTypeLabel = (value) => enumLabel('referenceType', value);
export const referenceTypeTone = (value) => enumTone('referenceType', value);
export const complianceOriginLabel = (value) => enumLabel('complianceOrigin', value);
export const complianceOriginTone = (value) => enumTone('complianceOrigin', value);
export const runStatusLabel = (value) => enumLabel('runStatus', value);
export const runStatusTone = (value) => enumTone('runStatus', value);
export const runOriginLabel = (value) => enumLabel('runOrigin', value);
export const complianceEventLabel = (value) => enumLabel('complianceEvent', value);
export const complianceEventTone = (value) => enumTone('complianceEvent', value);
export const failedClosedReasonLabel = (value) => enumLabel('failedClosedReason', value);

/**
 * Lista em português dos motivos de `failed_closed` da avaliação temporal.
 * Motivo desconhecido é preservado cru, exatamente como veio do servidor.
 */
export function failedClosedList(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  return entries
    .map((entry) => (entry && typeof entry === 'object' ? entry.reason : entry))
    .map((reason) => failedClosedReasonLabel(reason))
    .join('; ');
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
 * Contagem. `0` vindo do servidor é um zero real e aparece como `0` (a
 * avaliação temporal devolve contadores verdadeiros, inclusive zero); ausência
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
 * Percentual honesto. O servidor de compliance **não** devolve taxa, índice
 * nem percentual de conformidade: toda chamada sem número real devolve a frase
 * de não cálculo, nunca `0%`. A tela não deriva percentual de conformidade.
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
