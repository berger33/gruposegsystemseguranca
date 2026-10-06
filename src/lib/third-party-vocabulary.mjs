// UX-07 / EXT-02 — vocabulário da família TERCEIROS.
//
// LEVANTAMENTO DOS CÓDIGOS (método registrado em
// docs/UX-07-TERCEIROS-2026-10-06.md, seção 3). Buscas independentes sobre o
// ARQUIVO REAL do servidor canônico `src/server/ext-third-party-api.mjs`:
//
//   1) literais:
//      grep -oE "error:\s*['\"][a-z_0-9]+['\"]" src/server/ext-third-party-api.mjs \
//        | grep -oE '[a-z_0-9]{4,}' | grep -v '^error$' | sort -u
//      => 49 códigos distintos.
//   2) ramo `deny`:
//      grep -nE 'deny' src/server/ext-third-party-api.mjs
//      => 21 ocorrências. Dezoito delas são `return { deny: { code, body:
//      { error: "…" } } }` dentro de `work()` — nunca passam por `json(res, …)`
//      direto. Todos os códigos ali (`third_party_not_found`,
//      `contract_not_found`, `contract_rebind_blocked_by_active_grant`,
//      `third_party_not_active`, `contract_not_bound_to_third_party`,
//      `contract_not_grantable`, `service_order_not_found`,
//      `service_order_not_grantable`, `service_order_outside_contract`,
//      `access_grant_not_found`, `access_grant_already_revoked`,
//      `document_not_found`, `document_already_inactive`) JÁ aparecem como
//      literais e estão contados no mesmo conjunto de 49.
//   3) wrappers/exceções:
//      grep -nE 'function (bad|fail|deny)\(|HttpError|throw new' src/server/ext-third-party-api.mjs
//      => NADA. A família não tem wrapper local, não constrói `new HttpError()`
//      e não converte exceção em código: `readBody()` devolve
//      `{tooLarge}`/`{invalid}` e quem chama responde com `json(res, …)`.
//   4) ternários:
//      grep -nE '\?.*error:' src/server/ext-third-party-api.mjs
//      => NADA. Diferente de EXT-01 (`duplicate_plate`) e de EXT-06, nenhum
//      código desta família mora dentro de um ternário.
//   5) template/variável:
//      grep -nE 'error:\s*(`|[A-Za-z_]+[,}])' src/server/ext-third-party-api.mjs
//      => NADA: nenhum código é montado por concatenação.
//
// ORIGENS, e a decisão registrada sobre cada uma:
//
//  1. `src/server/ext-third-party-api.mjs` — servidor canônico, religado em
//     server.mjs (dispatch de `/api/ext/third-party/*` a partir de ~4245). É a
//     origem viva desta família.
//  2. O recorte LEGADO (`handleLegacyThirdParties` e
//     `handleLegacyThirdPartyDocuments`) vive DENTRO do mesmo arquivo canônico
//     e continua RELIGADO em server.mjs (~4266–4274, aliases
//     `/api/admin/hr/ext-third-parties`, `/api/crm/hr/ext-third-parties`,
//     `/api/hr/ext-third-parties`, `/api/ext/third-parties` e os quatro
//     equivalentes de `*-third-party-documents`; a lista de rotas protegidas
//     repete os mesmos caminhos em ~5958–5962). Ele responde 200 na leitura e
//     410 `legacy_route_retired` com `use: <canônica>` em qualquer mutação.
//     DECISÃO REGISTRADA: por ser rota VIVA, `legacy_route_retired` ENTRA no
//     vocabulário — mesmo critério aplicado em EXT-01 (Frota) e EXT-06
//     (Satisfação). A tela, porém, NÃO consome rota legada alguma.
//  3. NÃO existe handler morto nesta família: os doze handlers exportados por
//     `createExtThirdPartyApi()` estão todos no dispatch de server.mjs. Não há
//     código a excluir por morte de rota.
//
// Total real: 49 códigos do servidor + 1 descritor de falha de rede
// (`status: 0`), que não é código do servidor e por isso é nomeado à parte.
//
// Regras desta camada:
//  - código desconhecido PASSA CRU: nada é inventado;
//  - o código canônico é informação técnica (rodapé/parênteses), nunca o
//    título principal lido por quem opera;
//  - recusa de papel (`forbidden_role`) e sessão ausente (`unauthorized`) são
//    estado NEGADO, distinto de falha de leitura;
//  - ausência nunca vira 0, 0%, R$ 0,00 ou 01/01/1970 — e o servidor desta
//    família NOMEIA a ausência (`third_parties_registered`,
//    `document_rule_absence`, `alert_rule_absence: 'sem_regra_de_antecedencia'`,
//    `access_situation.status: 'sem_janela_registrada'`, `note`, `source`,
//    `base_date`), que é o veio usado aqui;
//  - zero REAL do servidor (nota 0 numa avaliação, 0 janelas vigentes de 2
//    registradas) continua aparecendo como zero: o defeito é transformar
//    AUSÊNCIA em zero;
//  - a FRONTEIRA EXTERNA é declarada, nunca simulada: não existe ator externo
//    "terceiro" autenticado, e esta camada só repete o que o servidor devolve
//    em `external_actor_boundary`.

const ERROR_MESSAGES = Object.freeze({
  access_grant_already_revoked: { kind: 'conflict', title: 'Janela de acesso já revogada', detail: 'Esta janela já havia sido revogada, com autor e motivo registrados. O servidor não revoga duas vezes e não apaga o histórico.', canRetry: false },
  access_grant_not_found: { kind: 'not_found', title: 'Janela de acesso não encontrada', detail: 'A janela informada não existe na jornada canônica de terceiros.', canRetry: false },
  access_window_already_ended: { kind: 'conflict', title: 'Janela já encerrada', detail: 'A janela informada já terminou pela data registrada. O término é derivado de access_end, nunca marcado à mão.', canRetry: false },
  audit_unavailable: { kind: 'unavailable', title: 'Auditoria indisponível', detail: 'A operação foi desfeita por inteiro porque a trilha de auditoria não pôde ser gravada na mesma transação. Nada ficou registrado pela metade.', canRetry: true },
  body_too_large: { kind: 'invalid', title: 'Dados muito extensos', detail: 'O conteúdo enviado passou do limite aceito pelo servidor. Reduza o texto e envie de novo.', canRetry: false },
  contract_not_bound_to_third_party: { kind: 'conflict', title: 'Contrato não vinculado a este terceiro', detail: 'Só é possível conceder acesso a um contrato que já tenha vínculo canônico com este terceiro. Vincule o contrato pela rota própria antes de conceder.', canRetry: false },
  contract_not_found: { kind: 'not_found', title: 'Contrato não encontrado', detail: 'O contrato informado não existe em crm_contracts. O servidor valida o contrato antes de aceitar o vínculo; a tela não cria contrato nenhum.', canRetry: false },
  contract_not_grantable: { kind: 'conflict', title: 'Situação do contrato não permite conceder acesso', detail: 'O contrato está numa das situações que o próprio servidor declara como bloqueantes, e ele devolve a lista junto do código.', canRetry: false },
  contract_rebind_blocked_by_active_grant: { kind: 'conflict', title: 'Troca de contrato bloqueada por janela ativa', detail: 'Existe janela de acesso ainda ativa apoiada no contrato atual. O servidor devolve o identificador da janela; revogue-a antes de revincular.', canRetry: false },
  document_already_inactive: { kind: 'conflict', title: 'Documento já estava desativado', detail: 'O documento já havia sido desativado com autor e motivo registrados. O servidor não desativa duas vezes e não apaga o registro.', canRetry: false },
  document_not_found: { kind: 'not_found', title: 'Documento não encontrado', detail: 'O documento informado não existe na jornada canônica de terceiros.', canRetry: false },
  evaluated_on_in_future: { kind: 'invalid', title: 'Avaliação datada no futuro', detail: 'A avaliação precisa ter data até hoje, pela data do servidor. Registro futuro não é fato canônico.', canRetry: false },
  forbidden_role: { kind: 'denied', title: 'Papel sem acesso à jornada de terceiros', detail: 'A jornada é interna e o servidor a restringe aos papéis de equipe que ele mesmo autoriza. Abrir esta tela pelo menu não concede acesso.', canRetry: false },
  idempotency_key_required: { kind: 'invalid', title: 'Identificador da operação ausente', detail: 'A operação precisa de uma chave de idempotência válida para que a repetição não duplique efeito.', canRetry: false },
  idempotency_key_reused: { kind: 'conflict', title: 'Chave já usada com dados diferentes', detail: 'A mesma chave de idempotência foi reaproveitada com um conteúdo divergente. O servidor recusa para preservar a idempotência; comece uma operação nova.', canRetry: false },
  invalid_access_end: { kind: 'invalid', title: 'Término do acesso inválido', detail: 'O término da janela é obrigatório e precisa estar no formato de data aceito pelo servidor. A perda de acesso é derivada dele.', canRetry: false },
  invalid_access_start: { kind: 'invalid', title: 'Início do acesso inválido', detail: 'O início da janela é obrigatório e precisa estar no formato de data aceito pelo servidor.', canRetry: false },
  invalid_access_window: { kind: 'invalid', title: 'Janela de acesso incoerente', detail: 'O término precisa ser igual ou posterior ao início. O servidor recusa a janela antes de qualquer efeito.', canRetry: false },
  invalid_alert_before_days: { kind: 'invalid', title: 'Antecedência em dias inválida', detail: 'A antecedência da regra de documento precisa ser um inteiro dentro da faixa aceita pelo servidor. Sem regra explícita, nenhum "a vencer" é inferido.', canRetry: false },
  invalid_category: { kind: 'invalid', title: 'Categoria inválida', detail: 'A categoria, quando informada, precisa ter de 3 a 100 caracteres.', canRetry: false },
  invalid_contract_id: { kind: 'invalid', title: 'Identificador de contrato inválido', detail: 'O contrato precisa ser informado como identificador válido. O filtro por contrato segue a mesma regra.', canRetry: false },
  invalid_document: { kind: 'invalid', title: 'Documento do terceiro inválido', detail: 'O documento do terceiro, quando informado, precisa ter de 3 a 30 caracteres.', canRetry: false },
  invalid_document_number: { kind: 'invalid', title: 'Número do documento inválido', detail: 'O número do documento, quando informado, precisa estar dentro do tamanho aceito pelo servidor.', canRetry: false },
  invalid_document_type: { kind: 'invalid', title: 'Tipo de documento inválido', detail: 'O tipo do documento precisa ter de 3 a 100 caracteres. O servidor não escolhe tipo por conta própria.', canRetry: false },
  invalid_evaluated_on: { kind: 'invalid', title: 'Data da avaliação inválida', detail: 'A data da avaliação é obrigatória e precisa estar no formato de data aceito pelo servidor.', canRetry: false },
  invalid_expiry_date: { kind: 'invalid', title: 'Data de validade inválida', detail: 'A data de validade, quando informada, precisa estar no formato de data aceito pelo servidor. Sem data, a ausência é declarada e nada é estimado.', canRetry: false },
  invalid_file_name: { kind: 'invalid', title: 'Nome de arquivo inválido', detail: 'O nome do arquivo, quando informado, precisa estar dentro do tamanho aceito. Nesta fatia nenhum arquivo real é armazenado: só o metadado.', canRetry: false },
  invalid_justification: { kind: 'invalid', title: 'Justificativa obrigatória', detail: 'A justificativa precisa ser escrita por quem opera, dentro do tamanho exigido pelo servidor. A tela não escreve justificativa no lugar de ninguém.', canRetry: false },
  invalid_name: { kind: 'invalid', title: 'Nome do terceiro inválido', detail: 'O nome do terceiro precisa ter de 3 a 200 caracteres.', canRetry: false },
  invalid_notes: { kind: 'invalid', title: 'Observações inválidas', detail: 'As observações, quando informadas, precisam ter de 10 a 1000 caracteres.', canRetry: false },
  invalid_reason: { kind: 'invalid', title: 'Motivo obrigatório', detail: 'O motivo precisa ser escrito por quem opera, dentro do tamanho exigido pelo servidor. A tela não inventa motivo de revogação, de desativação nem de mudança de situação.', canRetry: false },
  invalid_reference: { kind: 'invalid', title: 'Identificador inválido', detail: 'O identificador informado na URL não tem o formato aceito pelo servidor.', canRetry: false },
  invalid_request: { kind: 'invalid', title: 'Conteúdo enviado ilegível', detail: 'O servidor espera um objeto JSON no corpo da requisição e não conseguiu interpretar o que recebeu.', canRetry: false },
  invalid_responsible_name: { kind: 'invalid', title: 'Nome do responsável inválido', detail: 'O nome do responsável, quando informado, precisa ter de 2 a 200 caracteres.', canRetry: false },
  invalid_scope_id: { kind: 'invalid', title: 'Identificador do escopo inválido', detail: 'O escopo do acesso precisa apontar um contrato ou uma ordem de serviço por identificador válido.', canRetry: false },
  invalid_scope_kind: { kind: 'invalid', title: 'Tipo de escopo fora da lista do servidor', detail: 'O escopo precisa ser um dos tipos que o próprio servidor aceita. A tela não acrescenta escopo nenhum.', canRetry: false },
  invalid_score: { kind: 'invalid', title: 'Nota da avaliação inválida', detail: 'A nota precisa ser um número dentro da faixa aceita pelo servidor. Nota zero é um valor real e aceito; nota ausente não.', canRetry: false },
  invalid_status: { kind: 'invalid', title: 'Situação fora da lista do servidor', detail: 'A situação do terceiro precisa ser um dos valores que o próprio servidor aceita. A tela não cria situação nova.', canRetry: false },
  invalid_third_party_id: { kind: 'invalid', title: 'Identificador de terceiro inválido', detail: 'O terceiro precisa ser informado como identificador válido.', canRetry: false },
  legacy_route_retired: { kind: 'conflict', title: 'Escrita pela rota antiga aposentada', detail: 'As rotas antigas de terceiros continuam respondendo em leitura, mas a escrita por elas foi desligada. O servidor devolve, junto do código, a rota canônica que deve ser usada.', canRetry: false },
  method_not_allowed: { kind: 'invalid', title: 'Operação não permitida', detail: 'Este método não está disponível para o recurso solicitado.', canRetry: false },
  origin_forbidden: { kind: 'denied', title: 'Origem da requisição recusada', detail: 'A escrita só é aceita a partir da própria aplicação. O servidor recusou a origem antes de qualquer efeito.', canRetry: false },
  service_order_not_found: { kind: 'not_found', title: 'Ordem de serviço não encontrada', detail: 'A ordem de serviço informada não existe nos registros canônicos consultados pelo servidor.', canRetry: false },
  service_order_not_grantable: { kind: 'conflict', title: 'Situação da ordem de serviço não permite conceder acesso', detail: 'A ordem de serviço está numa das situações que o próprio servidor declara como bloqueantes, e ele devolve a lista junto do código.', canRetry: false },
  service_order_outside_contract: { kind: 'conflict', title: 'Ordem de serviço fora do contrato vinculado', detail: 'A ordem de serviço não pertence ao contrato canonicamente vinculado a este terceiro. O servidor recusa o escopo antes de qualquer efeito.', canRetry: false },
  third_party_not_active: { kind: 'conflict', title: 'Terceiro não está ativo', detail: 'Somente terceiro em situação ativa recebe janela de acesso nova. O servidor devolve a situação atual junto do código.', canRetry: false },
  third_party_not_found: { kind: 'not_found', title: 'Terceiro não encontrado', detail: 'O terceiro informado não existe na jornada canônica.', canRetry: false },
  third_party_unavailable: { kind: 'unavailable', title: 'Jornada de terceiros indisponível', detail: 'O servidor não concluiu a operação. Nenhum efeito parcial foi mantido — e isto não é uma lista vazia de terceiros.', canRetry: true },
  unauthorized: { kind: 'denied', title: 'Sessão de equipe necessária', detail: 'Entre novamente com uma sessão de equipe válida para consultar esta área. Quem autoriza é o servidor, não o menu.', canRetry: true },
});

// ENUMs efetivamente usados pela família. Valor desconhecido é preservado cru.
const ENUMS = Object.freeze({
  // THIRD_PARTY_STATUSES no servidor canônico (migração 085, jornada 148).
  thirdPartyStatus: {
    ativo: ['Ativo', 'success'],
    inativo: ['Inativo', 'neutral'],
    suspenso: ['Suspenso', 'warning'],
    encerrado: ['Encerrado', 'danger'],
  },
  // ACCESS_SCOPE_KINDS no servidor canônico.
  scopeKind: {
    contrato: ['Contrato', 'info'],
    ordem_servico: ['Ordem de serviço', 'info'],
  },
  // `status` devolvido por deriveGrantWindow(). "Perde acesso ao término" é
  // derivação determinística de access_end, nunca marcação manual.
  windowStatus: {
    vigente: ['Acesso vigente', 'success'],
    expirado: ['Expirado — acesso perdido ao término', 'danger'],
    nao_iniciado: ['Janela futura, ainda não iniciada', 'info'],
    revogado: ['Revogado com autor e motivo', 'neutral'],
  },
  // `status` devolvido por deriveAccessSituation(). `sem_janela_registrada` é
  // AUSÊNCIA NOMEADA pelo servidor: nunca vira "liberado" nem zero.
  accessSituation: {
    sem_janela_registrada: ['Nenhuma janela de acesso registrada', 'neutral'],
    bloqueado_por_situacao_do_terceiro: ['Bloqueado pela situação do terceiro', 'danger'],
    com_acesso_vigente: ['Com acesso vigente', 'success'],
    janela_futura: ['Janela futura registrada', 'info'],
    revogado: ['Todas as janelas revogadas', 'neutral'],
    sem_acesso_vigente: ['Sem acesso vigente', 'warning'],
  },
  // `reason` devolvido por deriveAccessDecision(), no ponto de imposição.
  decisionReason: {
    janela_vigente: ['Janela canônica vigente para o escopo pedido', 'success'],
    terceiro_inexistente: ['Nenhum terceiro canônico com este identificador', 'danger'],
    terceiro_nao_ativo: ['Terceiro fora da situação ativa', 'danger'],
    sem_janela_registrada: ['Nenhuma janela registrada; acesso não é presumido', 'neutral'],
    escopo_nao_autorizado: ['Escopo não autorizado para este terceiro', 'danger'],
    janela_encerrada: ['Janela encerrada pelo término registrado', 'danger'],
    janela_nao_iniciada: ['Janela ainda não iniciada', 'warning'],
    janela_revogada: ['Janela revogada', 'neutral'],
    sem_janela_vigente: ['Nenhuma janela vigente para o escopo pedido', 'warning'],
  },
  // `status` devolvido por deriveDocumentExpiry().
  documentExpiry: {
    vigente: ['Vigente pela data registrada', 'success'],
    a_vencer: ['A vencer, dentro da antecedência da regra', 'warning'],
    vencido: ['Vencido pela data registrada', 'danger'],
    sem_data_declarada: ['Sem data de validade declarada', 'neutral'],
    desativado: ['Desativado com autor e motivo', 'neutral'],
  },
  // `alert_rule_absence` devolvido por deriveDocumentExpiry() quando não há
  // regra explícita: a ausência é nomeada pelo próprio servidor.
  documentRuleAbsence: {
    sem_regra_de_antecedencia: ['Sem regra de antecedência registrada', 'neutral'],
  },
  // `event_type` gravado por insertEvent() na jornada 148.
  thirdPartyEvent: {
    terceiro_criado: ['Terceiro registrado', 'neutral'],
    situacao_atualizada: ['Situação atualizada', 'info'],
    contrato_vinculado: ['Contrato vinculado após validação canônica', 'info'],
    acesso_concedido: ['Acesso temporário concedido', 'success'],
    acesso_revogado: ['Acesso revogado', 'neutral'],
    documento_registrado: ['Documento registrado', 'info'],
    documento_desativado: ['Documento desativado', 'neutral'],
    regra_documento_registrada: ['Regra de antecedência registrada', 'success'],
    avaliacao_registrada: ['Avaliação registrada', 'info'],
  },
});

/** Texto único para toda ausência de dado. Nunca zero, nunca data inicial. */
export const ABSENT = 'Dado ausente';

/** Nenhum responsável declarado — e isso não é "ninguém responde". */
export const NO_RESPONSIBLE = 'Sem responsável declarado no registro canônico';

/** Nenhum contrato canônico vinculado: ausência declarada, não "sem contrato". */
export const NO_CONTRACT = 'Nenhum contrato canônico vinculado';

/** Nenhuma avaliação registrada. Ausência de nota NUNCA vira nota zero. */
export const NO_EVALUATION = 'Nenhuma avaliação canônica registrada';

/** Nenhum terceiro registrado: condição declarada pelo servidor. */
export const NO_THIRD_PARTY_REGISTERED = 'Nenhum terceiro registrado no backend canônico';

/**
 * FRONTEIRA EXTERNA declarada, nunca simulada. O texto completo vem do
 * servidor (`external_actor_boundary.note`); esta constante é o resumo fixo
 * que a tela mostra mesmo antes de qualquer resposta, para que ninguém leia a
 * tela como se existisse um canal autenticado de terceiro.
 */
export const EXTERNAL_BOUNDARY =
  'Não existe hoje ator externo “terceiro” autenticado: esta tela não cria sessão, login nem canal externo de terceiro. '
  + 'A janela de acesso e o escopo autorizado são impostos pelo servidor nos registros canônicos, e o acesso do próprio '
  + 'terceiro permanece PENDENTE — declarado, não simulado.';

/**
 * `Intl.NumberFormat('pt-BR')` separa grupos com U+00A0/U+202F. Os espaços
 * rígidos quebram asserção literal em teste e colagem de texto, sem
 * acrescentar informação: são normalizados para espaço comum.
 */
const normalizeSpaces = (value) => String(value).replace(/[\u00a0\u202f]/g, ' ');

export function describeThirdPartyError(code, status = 0) {
  const normalized = code == null || String(code).trim() === '' ? null : String(code).trim();
  // `status: 0` é a falha de rede — o servidor não chegou a responder.
  if (status === 0) {
    return {
      kind: 'network',
      title: 'Servidor não respondeu',
      detail: 'A leitura não foi concluída. Isto não é uma lista vazia de terceiros nem ausência de janela de acesso.',
      status,
      canRetry: true,
      code: normalized,
    };
  }
  // Respondeu com erro, mas sem código legível: nenhum código é inventado.
  if (normalized === null) {
    return {
      kind: 'error',
      title: 'Falha sem código do servidor',
      detail: `O servidor respondeu ${status} e não devolveu um código. A leitura não foi concluída; isto não é ausência de terceiros.`,
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
export function thirdPartyErrorMessage(code, status = 0) {
  const descriptor = describeThirdPartyError(code, status);
  return `${descriptor.title}: ${descriptor.detail}${descriptor.code ? ` (${descriptor.code})` : ''}`;
}

/** Recusa de permissão é um estado próprio, distinto de falha de leitura. */
export function thirdPartyErrorVariant(descriptor) {
  return descriptor.kind === 'denied' ? 'denied' : 'error';
}

export function thirdPartyErrorFootnote(descriptor) {
  return descriptor.code ? `Código técnico: (${descriptor.code})` : 'Código técnico: indisponível';
}

export function enumLabel(group, value) {
  if (value == null || value === '') return ABSENT;
  return ENUMS[group]?.[String(value)]?.[0] ?? String(value);
}

export function enumTone(group, value) {
  return ENUMS[group]?.[String(value)]?.[1] ?? 'neutral';
}

export const thirdPartyStatusLabel = (value) => enumLabel('thirdPartyStatus', value);
export const thirdPartyStatusTone = (value) => enumTone('thirdPartyStatus', value);
export const scopeKindLabel = (value) => enumLabel('scopeKind', value);
export const scopeKindTone = (value) => enumTone('scopeKind', value);
export const windowStatusLabel = (value) => enumLabel('windowStatus', value);
export const windowStatusTone = (value) => enumTone('windowStatus', value);
export const accessSituationLabel = (value) => enumLabel('accessSituation', value);
export const accessSituationTone = (value) => enumTone('accessSituation', value);
export const decisionReasonLabel = (value) => enumLabel('decisionReason', value);
export const decisionReasonTone = (value) => enumTone('decisionReason', value);
export const documentExpiryLabel = (value) => enumLabel('documentExpiry', value);
export const documentExpiryTone = (value) => enumTone('documentExpiry', value);
export const thirdPartyEventLabel = (value) => enumLabel('thirdPartyEvent', value);
export const thirdPartyEventTone = (value) => enumTone('thirdPartyEvent', value);

/**
 * Ausência de regra de antecedência, NOMEADA pelo servidor. A resposta traz
 * `document_rule_absence` como frase ou `alert_rule_absence` como código; os
 * dois formatos passam por aqui sem virar "em dia".
 */
export function documentRuleAbsenceLabel(value) {
  if (value == null || value === '') return ABSENT;
  const text = String(value);
  const code = text.split(':')[0].trim();
  const known = ENUMS.documentRuleAbsence[code];
  return known ? known[0] : text;
}

/** Data sem hora. Ausência nunca vira 01/01/1970. */
export function honestDate(value) {
  if (value == null || value === '') return ABSENT;
  const date = new Date(String(value).length === 10 ? `${String(value)}T00:00:00Z` : String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return normalizeSpaces(new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date));
}

/** Data com hora, para a trilha imutável. Ausência continua ausência. */
export function honestDateTime(value) {
  if (value == null || value === '') return ABSENT;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return ABSENT;
  return normalizeSpaces(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short',
  }).format(date));
}

/**
 * Contagem. `0` vindo do servidor é um zero REAL e aparece como `0`
 * (`grants_registered`, `active_windows` e o tamanho de cada lista são
 * verdadeiros); ausência (`null`/`undefined`/não numérico) aparece como
 * ausência.
 */
export function count(value) {
  if (value == null || value === '') return ABSENT;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return ABSENT;
  return normalizeSpaces(new Intl.NumberFormat('pt-BR').format(numeric));
}

/** Texto curto para valor de texto ausente, sem inventar conteúdo. */
export function honestText(value) {
  if (value == null) return ABSENT;
  const text = String(value).trim();
  return text.length ? text : ABSENT;
}

/** Responsável declarado no registro: a ausência é nomeada, não deixada em branco. */
export function responsibleLabel(value) {
  if (value == null || String(value).trim() === '') return NO_RESPONSIBLE;
  return String(value).trim();
}

/**
 * Nota canônica da avaliação. Nota 0 é um valor REAL do servidor e continua
 * aparecendo como `0/10`; a AUSÊNCIA de avaliação nunca vira 0.
 */
export function evaluationScoreLabel(value) {
  if (value == null || value === '') return NO_EVALUATION;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return NO_EVALUATION;
  return `${count(numeric)}/10`;
}

/**
 * Resumo de UMA janela registrada, só com o que o servidor derivou. Nenhuma
 * data é estimada: o que ele não devolveu aparece como ausência.
 */
export function windowSummary(window) {
  if (!window || typeof window !== 'object') return ABSENT;
  const cabeca = windowStatusLabel(window.status);
  return `${cabeca}. Janela de ${honestDate(window.access_start)} a ${honestDate(window.access_end)}; data-base ${honestDate(window.base_date)}.`;
}

/**
 * Resumo do vencimento derivado pelo servidor. `a_vencer` só existe com regra
 * explícita; sem regra, a ausência é dita como ausência — nunca "em dia".
 */
export function expirySummary(expiry) {
  if (!expiry || typeof expiry !== 'object') return ABSENT;
  const cabeca = documentExpiryLabel(expiry.status);
  if (expiry.status === 'sem_data_declarada' || expiry.status === 'desativado') {
    return `${cabeca}. ${honestText(expiry.derivation)}`;
  }
  const regra = expiry.alert_rule
    ? `Regra registrada de ${count(expiry.alert_rule.alert_before_days)} dia(s) de antecedência.`
    : documentRuleAbsenceLabel(expiry.alert_rule_absence ?? 'sem_regra_de_antecedencia') + '.';
  return `${cabeca}. Vence em ${honestDate(expiry.expiry_date)}. ${regra}`;
}

/** Lista de todos os códigos traduzidos, usada pelo teste anti-deriva. */
export function errorCodes() {
  return Object.keys(ERROR_MESSAGES);
}

export { ERROR_MESSAGES, ENUMS };
