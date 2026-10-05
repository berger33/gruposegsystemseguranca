// UX-05: vocabulário de apresentação do painel do Marcelo.
//
// Mesma regra das camadas de CRM (UX-03B) e RH (UX-04): os VALORES são
// canônicos e continuam saindo exatamente como `/api/adm/panel/*` espera. Só o
// RÓTULO exibido muda para português de negócio.
//
// Esta camada NÃO decide alçada, NÃO decide segregação e NÃO calcula
// indicador. Alçada (`approval_authority_exceeded`) e segregação
// (`requester_cannot_decide`) continuam sendo decididas no servidor e no
// PostgreSQL; aqui apenas explicamos a recusa em português quando ela chega.

/**
 * Mensagens para os códigos que `src/server/adm-panel-api.mjs` realmente
 * devolve. O painel já era honesto quanto a "falha não é zero"; o que faltava
 * era dizer isso numa frase em vez de despejar o token na tela.
 */
const ERROR_MESSAGES = Object.freeze({
  unauthorized: {
    kind: 'auth',
    title: 'Sessão não reconhecida',
    detail: 'Sua sessão de equipe expirou ou não foi reconhecida. Entre novamente para continuar.',
  },
  forbidden: {
    kind: 'denied',
    title: 'Acesso negado para esta sessão',
    detail: 'Seu papel não tem acesso a este painel. Nada foi carregado e nenhum número é exibido no lugar.',
  },
  read_only: {
    kind: 'denied',
    title: 'Sua sessão é somente leitura',
    detail: 'Você pode consultar este painel, mas decidir exige um papel com alçada de decisão. A consulta não foi afetada.',
  },
  forbidden_origin: {
    kind: 'invalid',
    title: 'Requisição recusada por proteção de origem',
    detail: 'Recarregue a página e repita a ação.',
  },

  // Alçada e segregação: as duas recusas que mais importam ao Marcelo.
  approval_authority_exceeded: {
    kind: 'denied',
    title: 'Valor acima da sua alçada',
    detail: 'O valor desta aprovação ultrapassa o limite registrado para a sua alçada. A decisão NÃO foi gravada. Encaminhe a quem tenha limite suficiente.',
  },
  requester_cannot_decide: {
    kind: 'denied',
    title: 'Quem pede não decide',
    detail: 'A segregação de funções impede que a mesma pessoa solicite e aprove. A decisão NÃO foi gravada.',
  },

  // Conflitos de repetição: o painel usa Idempotency-Key em toda decisão.
  duplicate_decision: {
    kind: 'conflict',
    title: 'Esta decisão já foi registrada',
    detail: 'O registro já tem uma decisão. Recarregue para ver o estado atual antes de repetir.',
  },
  duplicate_idempotency_key: {
    kind: 'conflict',
    title: 'Chave de repetição já usada',
    detail: 'Esta chave já identificou uma ação anterior. Recarregue a página para gerar uma nova.',
  },
  idempotency_key_conflict: {
    kind: 'conflict',
    title: 'A mesma chave foi reaproveitada com dados diferentes',
    detail: 'Nada foi gravado. Recarregue a página antes de repetir a ação.',
  },
  source_not_pending: {
    kind: 'conflict',
    title: 'O registro não está mais pendente',
    detail: 'Alguém já decidiu, ou o registro mudou de situação. Recarregue para ver o estado atual.',
  },
  duplicate_config_version: {
    kind: 'conflict',
    title: 'Versão de configuração já existe',
    detail: 'Já existe uma versão com esse número. Recarregue antes de salvar de novo.',
  },

  // Fonte indisponível: a diferença essencial entre "não deu para ler" e "zero".
  drilldown_source_unavailable: {
    kind: 'retry',
    title: 'Não foi possível abrir o detalhamento',
    detail: 'A fonte canônica não respondeu. A lista NÃO é apresentada vazia, porque não sabemos quantos registros existem.',
  },
  decision_source_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler as decisões',
    detail: 'A fonte canônica não respondeu. Nenhuma decisão é exibida e nada foi gravado.',
  },
  report_source_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler os relatórios',
    detail: 'A fonte canônica não respondeu. Isto não significa que não existam relatórios.',
  },
  config_source_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler as configurações',
    detail: 'A fonte canônica não respondeu. Nenhuma configuração é exibida no lugar.',
  },
  goal_source_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler as metas',
    detail: 'A fonte canônica não respondeu. Nenhuma meta é comparada com um realizado inventado.',
  },
  diary_source_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler o diário de decisões',
    detail: 'A fonte canônica não respondeu. O histórico não é apresentado vazio.',
  },
  workspace_source_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler o seu espaço de trabalho',
    detail: 'A fonte canônica não respondeu. Seus filtros e atalhos não foram perdidos.',
  },
  audit_unavailable: {
    kind: 'retry',
    title: 'A trilha de auditoria não respondeu',
    detail: 'Por isso NADA foi gravado: a operação foi desfeita por inteiro. Tente novamente mais tarde.',
  },

  // Entrada inválida.
  invalid_period: { kind: 'invalid', title: 'Período inválido', detail: 'Informe um período válido antes de aplicar.' },
  invalid_period_start: { kind: 'invalid', title: 'Data inicial inválida', detail: 'Informe a data inicial no formato ano-mês-dia.' },
  invalid_period_end: { kind: 'invalid', title: 'Data final inválida', detail: 'Informe a data final no formato ano-mês-dia.' },
  invalid_period_range: { kind: 'invalid', title: 'A data final é anterior à inicial', detail: 'Ajuste o período antes de aplicar.' },
  invalid_decision: { kind: 'invalid', title: 'Decisão inválida', detail: 'A decisão enviada não é aceita pelo servidor.' },
  invalid_json: { kind: 'invalid', title: 'Conteúdo inválido', detail: 'O conteúdo enviado não pôde ser interpretado. Revise antes de repetir.' },
  config_value_object_required: { kind: 'invalid', title: 'A configuração precisa ser um objeto', detail: 'Informe um objeto JSON válido no valor da configuração.' },
  filter_name_and_module_required: { kind: 'invalid', title: 'Nome e módulo são obrigatórios', detail: 'Dê um nome ao filtro e escolha o módulo antes de salvar.' },
  shortcut_fields_required: { kind: 'invalid', title: 'Nome e endereço são obrigatórios', detail: 'Preencha o nome e o endereço do atalho antes de salvar.' },
  shortcut_url_must_be_internal: { kind: 'invalid', title: 'O atalho precisa apontar para dentro do sistema', detail: 'Endereços externos não são aceitos aqui.' },
  unknown_indicator: { kind: 'invalid', title: 'Indicador desconhecido', detail: 'Este indicador não existe no catálogo do servidor.' },
  unknown_record_kind: { kind: 'invalid', title: 'Tipo de registro desconhecido', detail: 'Este tipo de registro não existe no catálogo do servidor.' },
  not_found: { kind: 'invalid', title: 'Registro não encontrado', detail: 'O registro não existe ou está fora do seu escopo.' },
  source_not_found: { kind: 'invalid', title: 'Registro de origem não encontrado', detail: 'O registro que originou esta pendência não foi localizado.' },

  record_source_unavailable: {
    kind: 'retry',
    title: 'Não foi possível abrir o registro',
    detail: 'A fonte canônica não respondeu. O registro existe; apenas não conseguimos lê-lo agora.',
  },
  report_indicator_source_unavailable: {
    kind: 'retry',
    title: 'Não foi possível apurar o indicador do relatório',
    detail: 'A fonte canônica não respondeu e o relatório NÃO foi gerado com número estimado.',
  },
  report_not_generated: {
    kind: 'retry',
    title: 'O relatório ainda não tem conteúdo gerado',
    detail: 'Nada foi produzido. Gere o relatório novamente antes de abrir o conteúdo.',
  },

  // Recusa de rota e de destinatário.
  method_not_allowed: {
    kind: 'invalid',
    title: 'Operação não permitida nesta rota',
    detail: 'Recarregue a página; a ação enviada não corresponde a nenhuma operação do painel.',
  },
  invalid_recipient_identity: {
    kind: 'invalid',
    title: 'Destinatário inválido',
    detail: 'Informe uma identidade de equipe válida para receber o relatório.',
  },
  recipient_not_authorized: {
    kind: 'denied',
    title: 'O destinatário não tem acesso a este conteúdo',
    detail: 'O relatório NÃO foi compartilhado. Escolha alguém com permissão para o indicador.',
  },

  // Entrada inválida detalhada: cada campo diz o que o servidor exige.
  invalid_id: { kind: 'invalid', title: 'Identificador inválido', detail: 'O identificador enviado não tem o formato aceito.' },
  invalid_source_id: { kind: 'invalid', title: 'Registro de origem inválido', detail: 'O identificador do registro pendente não tem o formato aceito.' },
  invalid_source_kind: { kind: 'invalid', title: 'Tipo de origem inválido', detail: 'Este tipo de pendência não existe no catálogo do servidor.' },
  invalid_kind: { kind: 'invalid', title: 'Tipo inválido', detail: 'O tipo enviado não existe no catálogo do servidor.' },
  invalid_contract_id: { kind: 'invalid', title: 'Contrato inválido', detail: 'O identificador do contrato não tem o formato aceito.' },
  reason_10_1000_required: { kind: 'invalid', title: 'O motivo é obrigatório', detail: 'Escreva entre 10 e 1000 caracteres explicando a decisão. Nada foi gravado.' },
  idempotency_key_8_200_required: { kind: 'invalid', title: 'A chave de idempotência é obrigatória', detail: 'Informe entre 8 e 200 caracteres. Ela impede que a mesma ação seja gravada duas vezes.' },
  query_and_module_required: { kind: 'invalid', title: 'Busca e módulo são obrigatórios', detail: 'Preencha a busca e escolha o módulo antes de salvar o favorito.' },
  title_5_200_required: { kind: 'invalid', title: 'O título é obrigatório', detail: 'Escreva entre 5 e 200 caracteres no título do relatório.' },
  config_key_3_200_required: { kind: 'invalid', title: 'A chave da configuração é obrigatória', detail: 'Escreva entre 3 e 200 caracteres na chave.' },
  category_3_100_required: { kind: 'invalid', title: 'A categoria é obrigatória', detail: 'Escreva entre 3 e 100 caracteres na categoria.' },

  internal: {
    kind: 'retry',
    title: 'Falha no servidor',
    detail: 'O servidor respondeu com erro e nada foi carregado nem gravado. Isto não é a mesma coisa que não haver registros.',
  },
});

/**
 * Classifica uma falha do painel sem suavizar o significado.
 * @param {string|null|undefined} code código canônico, quando houver
 * @param {number} status status HTTP (0 quando a requisição nem chegou)
 */
export function describeAdmError(code, status = 0) {
  const known = code && Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : null;
  if (known) {
    return { ...known, code, status, canRetry: known.kind === 'retry' || known.kind === 'auth' };
  }
  if (status === 0) {
    return {
      kind: 'network',
      title: 'Não foi possível falar com o servidor',
      detail: 'A consulta não chegou a ser respondida. Isto não significa que não existam registros.',
      code: code || null, status, canRetry: true,
    };
  }
  if (status === 401) return { ...ERROR_MESSAGES.unauthorized, code: code || null, status, canRetry: true };
  if (status === 403) return { ...ERROR_MESSAGES.forbidden, code: code || null, status, canRetry: false };
  if (status === 404) return { ...ERROR_MESSAGES.not_found, code: code || null, status, canRetry: false };
  if (status === 409) {
    return {
      kind: 'conflict',
      title: 'Conflito com o estado atual',
      detail: 'O registro mudou ou a ação já havia sido feita. Recarregue antes de repetir.',
      code: code || null, status, canRetry: false,
    };
  }
  if (status >= 400 && status < 500) {
    return {
      kind: 'invalid',
      title: 'O servidor recusou os dados enviados',
      detail: 'Revise os campos destacados e tente novamente.',
      code: code || null, status, canRetry: false,
    };
  }
  return { ...ERROR_MESSAGES.internal, code: code || null, status, canRetry: true };
}

/** Variante visual de `UiState` correspondente à falha classificada. */
export function admErrorVariant(descriptor) {
  return descriptor && (descriptor.kind === 'denied' || descriptor.kind === 'auth') ? 'denied' : 'error';
}

/**
 * Frase pronta para o rodapé de uma falha, declarando a resposta real do
 * servidor. O código canônico fica disponível para diagnóstico, entre
 * parênteses — nunca como a mensagem principal.
 */
export function admErrorFootnote(descriptor) {
  if (!descriptor) return '';
  const resposta = descriptor.status ? `HTTP ${descriptor.status}` : 'sem resposta';
  return `Resposta do servidor: ${resposta}${descriptor.code ? ` (${descriptor.code})` : ''}.`;
}

/** Situação da pendência de aprovação, em linguagem de negócio. */
export const APPROVAL_DECISIONS = Object.freeze([
  { value: 'aprovada', label: 'Aprovar', tone: 'success' },
  { value: 'rejeitada', label: 'Rejeitar', tone: 'danger' },
]);

/** Prioridade exibida no detalhamento, traduzida sem alterar o valor. */
const PRIORITY_LABELS = Object.freeze({
  baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica',
  normal: 'Normal', urgente: 'Urgente',
});

export function admPriorityLabel(value) {
  if (value === null || value === undefined || value === '') return '—';
  const key = String(value).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(PRIORITY_LABELS, key) ? PRIORITY_LABELS[key] : String(value);
}

/** Tom do selo de prioridade. A cor é apoio; o texto sempre carrega o sentido. */
export function admPriorityTone(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'critica' || key === 'urgente') return 'danger';
  if (key === 'alta') return 'warning';
  if (key === 'media' || key === 'normal') return 'info';
  return 'neutral';
}
