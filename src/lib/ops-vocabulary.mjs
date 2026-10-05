// UX-07A: vocabulário de apresentação da família de operação (L06).
//
// Mesma regra das camadas de CRM (UX-03B), RH (UX-04), painel do Marcelo
// (UX-05) e portais (UX-06): os VALORES continuam canônicos e saem exatamente
// como `src/server/ops-api.mjs`, `ops-advanced-api.mjs`, `ops-advanced2-api.mjs`,
// `ops-advanced3-api.mjs` e `ops-pendency-api.mjs` esperam. Só o RÓTULO exibido
// muda para português de negócio. Valor desconhecido passa cru.
//
// Esta camada NÃO decide sessão, NÃO decide concessão, NÃO altera isolamento
// por conta e NÃO reescreve regra de jornada. Autenticação, RBAC, idempotência
// e auditoria fail-closed continuam sendo decididos no servidor; aqui apenas
// explicamos, em português, a resposta que chegou.
//
// O defeito central que esta camada existe para impedir: em
// `src/app/admin/operacao/OperacaoWorkspace.tsx` toda falha virava
// `err.message` — na prática o código canônico cru ou a frase "Falha ao
// carregar." — e um 403 de concessão ficava indistinguível de um 503 de
// leitura. Pior: painel sem leitura aparecia como painel sem registro.

/**
 * Mensagens para os códigos que os cinco servidores de operação realmente
 * devolvem. Título humano; o código canônico só aparece no rodapé, entre
 * parênteses (ver `opsErrorFootnote`).
 */
const ERROR_MESSAGES = Object.freeze({
  // ----- Sessão, concessão e origem -----------------------------------------
  unauthorized: {
    kind: 'auth',
    title: 'Entre com a sua identidade de equipe',
    detail: 'O pedido chegou sem sessão válida. Nada foi lido e nada foi gravado.',
  },
  forbidden: {
    kind: 'denied',
    title: 'Seu perfil não tem concessão para esta operação',
    detail: 'O menu pode mostrar o caminho, mas a concessão é verificada no servidor. Nada foi exibido nem alterado. Peça a liberação ao TI.',
  },
  origin_forbidden: {
    kind: 'denied',
    title: 'Origem do pedido recusada',
    detail: 'A requisição veio de uma origem que o servidor não aceita. Abra a tela pelo endereço oficial do sistema.',
  },
  same_origin_required: {
    kind: 'denied',
    title: 'Esta ação só é aceita a partir da própria aplicação',
    detail: 'O servidor exige mesma origem para gravar. Nada foi gravado.',
  },
  method_not_allowed: {
    kind: 'invalid',
    title: 'Método não aceito neste endereço',
    detail: 'A tela pediu uma operação que esta rota não oferece. Nada foi alterado.',
  },

  // ----- Falhas de leitura e de infraestrutura -------------------------------
  // Todas são FALHA, nunca ausência de dado.
  read_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler os dados de operação agora',
    detail: 'A consulta falhou. Isto NÃO significa que não existam postos, escalas ou ocorrências: nada foi lido.',
  },
  audit_unavailable: {
    kind: 'retry',
    title: 'A trilha de auditoria não respondeu, então a ação foi recusada',
    detail: 'A operação é fail-closed de propósito: sem registro de auditoria, nada é gravado. Tente novamente em instantes.',
  },
  service_unavailable: {
    kind: 'retry',
    title: 'Serviço de operação indisponível',
    detail: 'O servidor não conseguiu atender ao pedido. Nada foi lido nem gravado.',
  },
  internal_error: {
    kind: 'retry',
    title: 'Falha no servidor de operação',
    detail: 'O servidor respondeu com erro e nada foi carregado nem gravado. Isto não é a mesma coisa que não haver registros.',
  },
  allocation_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler ou gravar a alocação agora',
    detail: 'A consulta de alocações falhou. A escala existente continua como está.',
  },
  employee_unavailable: {
    kind: 'retry',
    title: 'Não foi possível consultar o cadastro de funcionários',
    detail: 'Sem essa leitura não dá para afirmar quem está habilitado. Nada foi decidido.',
  },
  post_shift_need_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler a necessidade por turno',
    detail: 'A leitura falhou. Posto sem necessidade lida não é posto sem necessidade cadastrada.',
  },
  schedule_entry_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler as entradas da escala',
    detail: 'O calendário não pôde ser montado. Nenhuma entrada foi apagada.',
  },
  schedule_validation_unavailable: {
    kind: 'retry',
    title: 'Não foi possível executar a validação da escala',
    detail: 'Sem validação não há aprovação: nada foi publicado.',
  },
  validation_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler as validações',
    detail: 'A leitura das validações falhou. Ausência de conflito na tela não é ausência de conflito no dado.',
  },
  work_rule_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler as regras de jornada',
    detail: 'Sem as regras não dá para afirmar que a escala respeita limites. Nada foi aprovado.',
  },
  pendency_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler as pendências operacionais',
    detail: 'A leitura falhou. Lista vazia aqui seria mentira: nada foi lido.',
  },

  // ----- Registros não encontrados ------------------------------------------
  not_found: { kind: 'invalid', title: 'Registro não encontrado', detail: 'O endereço não corresponde a nada que você possa ver. Volte e tente pela lista.' },
  post_not_found: { kind: 'invalid', title: 'Posto não encontrado', detail: 'Este posto não existe ou está fora do seu escopo. Nada foi alterado.' },
  job_role_not_found: { kind: 'invalid', title: 'Cargo ou função não encontrado', detail: 'O cargo informado não existe no catálogo. Nada foi gravado.' },
  shift_template_not_found: { kind: 'invalid', title: 'Modelo de turno não encontrado', detail: 'O turno informado não existe. Nada foi gravado.' },
  employee_not_found: { kind: 'invalid', title: 'Funcionário não encontrado', detail: 'O cadastro informado não existe ou está fora do seu escopo.' },
  contract_not_found: { kind: 'invalid', title: 'Contrato não encontrado', detail: 'O contrato informado não existe ou está fora do seu escopo.' },
  document_not_found: { kind: 'invalid', title: 'Documento não encontrado', detail: 'O documento informado não existe ou foi removido.' },
  dimensioning_not_found: { kind: 'invalid', title: 'Dimensionamento não encontrado', detail: 'O registro de dimensionamento não existe. Nada foi alterado.' },
  coverage_request_not_found: { kind: 'invalid', title: 'Pedido de cobertura não encontrado', detail: 'O pedido informado não existe. Nada foi alterado.' },
  occurrence_not_found: { kind: 'invalid', title: 'Ocorrência não encontrada', detail: 'A ocorrência informada não existe no livro. Nada foi alterado.' },
  instance_not_found: { kind: 'invalid', title: 'Execução de checklist não encontrada', detail: 'A instância informada não existe. Nada foi alterado.' },
  template_not_found: { kind: 'invalid', title: 'Modelo não encontrado', detail: 'O modelo informado não existe. Nada foi gravado.' },
  version_not_found: { kind: 'invalid', title: 'Versão de escala não encontrada', detail: 'A versão informada não existe. Nada foi alterado.' },
  absence_not_found: { kind: 'invalid', title: 'Ausência não encontrada', detail: 'O registro de ausência informado não existe.' },
  pendency_not_found: { kind: 'invalid', title: 'Pendência não encontrada', detail: 'A pendência informada não existe ou já foi arquivada.' },

  // ----- Conflitos de estado e de regra de operação --------------------------
  duplicate_ack: { kind: 'conflict', title: 'Ciência já registrada', detail: 'Uma segunda ciência não duplica efeito. O registro anterior continua valendo.' },
  duplicate_allocation: { kind: 'conflict', title: 'Esta alocação já existe', detail: 'Mesma pessoa, mesmo posto, mesma data. Nada foi duplicado.' },
  duplicate_checklist_instance: { kind: 'conflict', title: 'Esta execução de checklist já existe', detail: 'A instância do dia já havia sido aberta. Nada foi duplicado.' },
  duplicate_coverage_request: { kind: 'conflict', title: 'Já existe pedido de cobertura em aberto', detail: 'Use o pedido existente em vez de abrir outro para a mesma falta.' },
  duplicate_entry: { kind: 'conflict', title: 'Esta entrada de escala já existe', detail: 'Mesma pessoa, mesmo posto e mesma data nesta versão. Nada foi duplicado.' },
  duplicate_need: { kind: 'conflict', title: 'Esta necessidade por turno já existe', detail: 'Já há necessidade cadastrada para este posto, turno e dia. Nada foi duplicado.' },
  duplicate_role: { kind: 'conflict', title: 'Este cargo ou função já existe', detail: 'Já há um registro com esse nome. Nada foi duplicado.' },
  duplicate_rule: { kind: 'conflict', title: 'Esta regra de jornada já existe', detail: 'Já há regra equivalente ativa. Nada foi duplicado.' },
  duplicate_template: { kind: 'conflict', title: 'Este modelo já existe', detail: 'Já há um modelo com esse nome. Nada foi duplicado.' },
  duplicate_template_version: { kind: 'conflict', title: 'Esta versão do modelo já existe', detail: 'A versão informada já foi criada. Nada foi duplicado.' },
  overlap_detected: { kind: 'conflict', title: 'Há sobreposição de turno para esta pessoa', detail: 'A pessoa já está escalada em horário que colide com este. Nada foi gravado — resolva a sobreposição antes.' },
  max_daily_hours_exceeded: { kind: 'conflict', title: 'Limite diário de horas excedido', detail: 'A escala proposta ultrapassa o máximo de horas por dia da regra de jornada vigente. Nada foi gravado.' },
  max_weekly_hours_exceeded: { kind: 'conflict', title: 'Limite semanal de horas excedido', detail: 'A escala proposta ultrapassa o máximo de horas por semana da regra de jornada vigente. Nada foi gravado.' },
  max_consecutive_days_exceeded: { kind: 'conflict', title: 'Limite de dias consecutivos excedido', detail: 'A escala proposta ultrapassa a sequência máxima de dias trabalhados. Nada foi gravado.' },
  min_rest_hours_violated: { kind: 'conflict', title: 'Intervalo mínimo de descanso não respeitado', detail: 'Entre o fim de um turno e o início do próximo falta descanso exigido pela regra. Nada foi gravado.' },
  qualification_required: { kind: 'conflict', title: 'A pessoa não tem a habilitação exigida pelo posto', detail: 'O posto exige qualificação que não consta válida no cadastro. Nada foi gravado — regularize a habilitação antes.' },
  candidate_unqualified: { kind: 'conflict', title: 'Candidato sem a habilitação exigida', detail: 'O candidato indicado não atende ao requisito do posto. A cobertura não foi aprovada.' },
  candidate_conflict: { kind: 'conflict', title: 'O candidato já está comprometido neste horário', detail: 'Há outra escala ou cobertura no mesmo intervalo. A indicação não foi aceita.' },
  role_required_by_work_rule: { kind: 'conflict', title: 'A regra de jornada exige informar o cargo', detail: 'Sem o cargo não é possível aplicar os limites da regra. Nada foi gravado.' },
  mandatory_items_pending: { kind: 'conflict', title: 'Há itens obrigatórios pendentes no checklist', detail: 'O checklist não pode ser concluído enquanto itens obrigatórios não forem respondidos. Nada foi encerrado.' },
  version_not_editable: { kind: 'conflict', title: 'Esta versão de escala não aceita mais edição', detail: 'Só rascunho, em revisão ou revisada aceitam alteração. Crie uma nova versão em vez de alterar o histórico.' },
  version_not_published: { kind: 'conflict', title: 'A versão ainda não foi publicada', detail: 'Ciência só é registrada em versão publicada ou revisada. Nada foi registrado.' },
  entry_date_out_of_validity: { kind: 'conflict', title: 'A data está fora da validade da versão', detail: 'A entrada precisa cair dentro do período de validade da versão da escala. Nada foi gravado.' },
  post_inactive: { kind: 'conflict', title: 'Posto inativo', detail: 'Um posto inativo não recebe nova alocação ou rotina. O histórico é preservado.' },
  template_inactive: { kind: 'conflict', title: 'Modelo inativo', detail: 'Este modelo foi desativado e não gera novas execuções.' },
  shift_template_inactive: { kind: 'conflict', title: 'Modelo de turno inativo', detail: 'Este turno foi desativado e não entra em nova escala.' },
  pendency_archived: { kind: 'conflict', title: 'Esta pendência já foi arquivada', detail: 'Pendência arquivada não volta a tramitar. O histórico é preservado.' },
  contract_not_operational: { kind: 'conflict', title: 'O contrato não está em situação operacional', detail: 'Contrato encerrado, cancelado ou suspenso não recebe nova alocação ou rotina. O histórico é preservado.' },
  post_not_operational: { kind: 'conflict', title: 'O posto não está em situação operacional', detail: 'O posto está ligado a um contrato não operacional ou foi desativado. Nada foi gravado.' },
  employee_not_operational: { kind: 'conflict', title: 'O funcionário não está em situação operacional', detail: 'A situação cadastral da pessoa impede nova escala. Procure o RH.' },
  responsible_employee_not_operational: { kind: 'conflict', title: 'O responsável indicado não está em situação operacional', detail: 'Escolha um responsável ativo. Nada foi gravado.' },
  same_employee: { kind: 'conflict', title: 'Origem e destino são a mesma pessoa', detail: 'Uma passagem de turno precisa de duas pessoas diferentes. Nada foi gravado.' },
  company_scope_mismatch: { kind: 'denied', title: 'Registro fora do escopo da sua empresa', detail: 'O isolamento por conta impede ler ou alterar dado de outra empresa. Nada foi exibido.' },
  unit_scope_mismatch: { kind: 'conflict', title: 'A unidade informada não corresponde ao registro', detail: 'Confira a unidade antes de repetir. Nada foi gravado.' },
  contract_company_mismatch: { kind: 'conflict', title: 'O contrato pertence a outra empresa', detail: 'Contrato e empresa precisam ser da mesma cadeia. Nada foi gravado.' },
  post_contract_mismatch: { kind: 'conflict', title: 'O posto não pertence a este contrato', detail: 'Confira a cadeia cliente → contrato → posto. Nada foi gravado.' },
  dimensioning_post_mismatch: { kind: 'conflict', title: 'O dimensionamento é de outro posto', detail: 'O registro informado não pertence ao posto selecionado. Nada foi gravado.' },
  document_outside_contract_scope: { kind: 'denied', title: 'Documento fora do escopo deste contrato', detail: 'O documento não pertence ao contrato indicado. Nada foi exibido.' },

  // ----- Campos obrigatórios e formato --------------------------------------
  invalid_json: { kind: 'invalid', title: 'O corpo enviado não é um JSON válido', detail: 'Recarregue a página e repita a ação. Nada foi gravado.' },
  no_fields: { kind: 'invalid', title: 'Nenhum campo para alterar', detail: 'O pedido chegou sem mudança nenhuma. Nada foi gravado.' },
  idempotency_key_required: { kind: 'invalid', title: 'A chave que impede o envio duplicado está ausente', detail: 'Recarregue a página para gerar uma nova chave. Nada foi gravado.' },
  allocation_date_required: { kind: 'invalid', title: 'Informe a data da alocação', detail: 'Sem data não há escala. Nada foi gravado.' },
  entry_date_required: { kind: 'invalid', title: 'Informe a data da entrada', detail: 'Sem data a entrada não entra no calendário. Nada foi gravado.' },
  scheduled_date_required: { kind: 'invalid', title: 'Informe a data programada', detail: 'Nada foi gravado.' },
  period_required: { kind: 'invalid', title: 'Informe o período', detail: 'A consulta precisa de início e fim. Nada foi lido.' },
  valid_period_required: { kind: 'invalid', title: 'Informe o período de validade', detail: 'A versão da escala precisa de início e fim de validade. Nada foi gravado.' },
  start_end_required: { kind: 'invalid', title: 'Informe o horário de início e de fim', detail: 'Nada foi gravado.' },
  gap_fields_required: { kind: 'invalid', title: 'Faltam campos da lacuna de cobertura', detail: 'Informe posto, data e intervalo não coberto. Nada foi gravado.' },
  reason_required_for_retification: { kind: 'invalid', title: 'Retificação exige motivo', detail: 'O livro de ocorrências não aceita retificação silenciosa: escreva o motivo. Nada foi alterado.' },
  rejection_reason_required: { kind: 'invalid', title: 'A recusa exige motivo', detail: 'Escreva por que o pedido foi recusado. Nada foi gravado.' },
  escalation_reason_required: { kind: 'invalid', title: 'O escalonamento exige motivo', detail: 'Escreva por que o caso sobe de nível. Nada foi gravado.' },
  archive_note_required: { kind: 'invalid', title: 'O arquivamento exige uma nota', detail: 'Registre por que a pendência está sendo arquivada. Nada foi arquivado.' },
  decision_by_required: { kind: 'invalid', title: 'Informe quem está decidindo', detail: 'A auditoria precisa saber quem decidiu. Nada foi gravado.' },

  // ----- Identificadores e valores recusados ---------------------------------
  invalid_id: { kind: 'invalid', title: 'Identificador inválido', detail: 'O identificador enviado não tem o formato aceito.' },
  invalid_ids: { kind: 'invalid', title: 'Identificadores inválidos', detail: 'Um ou mais identificadores enviados não têm o formato aceito.' },
  invalid_absence_id: { kind: 'invalid', title: 'Ausência inválida', detail: 'O identificador da ausência não tem o formato aceito.' },
  invalid_company_id: { kind: 'invalid', title: 'Empresa inválida', detail: 'O identificador da empresa não tem o formato aceito.' },
  invalid_contract_id: { kind: 'invalid', title: 'Contrato inválido', detail: 'O identificador do contrato não tem o formato aceito.' },
  invalid_coverage_request_id: { kind: 'invalid', title: 'Pedido de cobertura inválido', detail: 'O identificador do pedido não tem o formato aceito.' },
  invalid_dimensioning_id: { kind: 'invalid', title: 'Dimensionamento inválido', detail: 'O identificador do dimensionamento não tem o formato aceito.' },
  invalid_document_id: { kind: 'invalid', title: 'Documento inválido', detail: 'O identificador do documento não tem o formato aceito.' },
  invalid_employee_id: { kind: 'invalid', title: 'Funcionário inválido', detail: 'O identificador do funcionário não tem o formato aceito.' },
  invalid_from_employee_id: { kind: 'invalid', title: 'Funcionário de origem inválido', detail: 'O identificador de quem entrega o turno não tem o formato aceito.' },
  invalid_to_employee_id: { kind: 'invalid', title: 'Funcionário de destino inválido', detail: 'O identificador de quem recebe o turno não tem o formato aceito.' },
  invalid_from_post_id: { kind: 'invalid', title: 'Posto de origem inválido', detail: 'O identificador do posto de origem não tem o formato aceito.' },
  invalid_gap_id: { kind: 'invalid', title: 'Lacuna inválida', detail: 'O identificador da lacuna não tem o formato aceito.' },
  invalid_handover_id: { kind: 'invalid', title: 'Passagem de turno inválida', detail: 'O identificador da passagem não tem o formato aceito.' },
  invalid_instance_id: { kind: 'invalid', title: 'Execução de checklist inválida', detail: 'O identificador da instância não tem o formato aceito.' },
  invalid_occurrence_id: { kind: 'invalid', title: 'Ocorrência inválida', detail: 'O identificador da ocorrência não tem o formato aceito.' },
  invalid_pendency_id: { kind: 'invalid', title: 'Pendência inválida', detail: 'O identificador da pendência não tem o formato aceito.' },
  invalid_post_id: { kind: 'invalid', title: 'Posto inválido', detail: 'O identificador do posto não tem o formato aceito.' },
  invalid_responsible_id: { kind: 'invalid', title: 'Responsável inválido', detail: 'O identificador do responsável não tem o formato aceito.' },
  invalid_role_id: { kind: 'invalid', title: 'Cargo inválido', detail: 'O identificador do cargo não tem o formato aceito.' },
  invalid_shift_template_id: { kind: 'invalid', title: 'Modelo de turno inválido', detail: 'O identificador do turno não tem o formato aceito.' },
  invalid_template_id: { kind: 'invalid', title: 'Modelo inválido', detail: 'O identificador do modelo não tem o formato aceito.' },
  invalid_unit_id: { kind: 'invalid', title: 'Unidade inválida', detail: 'O identificador da unidade não tem o formato aceito.' },
  invalid_version_id: { kind: 'invalid', title: 'Versão inválida', detail: 'O identificador da versão não tem o formato aceito.' },
  invalid_post_or_shift: { kind: 'invalid', title: 'Posto ou turno inválido', detail: 'A combinação de posto e turno enviada não foi aceita.' },

  invalid_status: { kind: 'invalid', title: 'Situação inválida', detail: 'A situação enviada não existe no catálogo do servidor. Nada foi gravado.' },
  invalid_action_type: { kind: 'invalid', title: 'Tipo de ação inválido', detail: 'A ação enviada não existe no catálogo do servidor.' },
  invalid_availability_status: { kind: 'invalid', title: 'Disponibilidade inválida', detail: 'Use uma das disponibilidades oferecidas pela tela.' },
  invalid_category: { kind: 'invalid', title: 'Categoria inválida', detail: 'Use uma das categorias oferecidas pela tela.' },
  invalid_certification_type: { kind: 'invalid', title: 'Tipo de certificação inválido', detail: 'Use um dos tipos oferecidos pela tela.' },
  invalid_channel: { kind: 'invalid', title: 'Canal de aviso inválido', detail: 'Use um dos canais oferecidos pela tela.' },
  invalid_day_of_week: { kind: 'invalid', title: 'Dia da semana inválido', detail: 'Use de domingo a sábado, ou deixe sem restrição de dia.' },
  invalid_description: { kind: 'invalid', title: 'Descrição inválida', detail: 'Escreva uma descrição válida. Nada foi gravado.' },
  invalid_duration: { kind: 'invalid', title: 'Duração inválida', detail: 'A duração enviada não foi aceita.' },
  invalid_frequency: { kind: 'invalid', title: 'Frequência inválida', detail: 'Use uma das frequências oferecidas pela tela.' },
  invalid_headcount: { kind: 'invalid', title: 'Efetivo inválido', detail: 'A quantidade de pessoas precisa ser um número inteiro válido.' },
  invalid_item_description: { kind: 'invalid', title: 'Descrição de item inválida', detail: 'Um dos itens do checklist está sem descrição aceitável.' },
  invalid_max_consecutive: { kind: 'invalid', title: 'Limite de dias consecutivos inválido', detail: 'Informe um número inteiro de dias.' },
  invalid_max_daily: { kind: 'invalid', title: 'Limite diário inválido', detail: 'Informe um número válido de horas por dia.' },
  invalid_max_weekly: { kind: 'invalid', title: 'Limite semanal inválido', detail: 'Informe um número válido de horas por semana.' },
  invalid_message: { kind: 'invalid', title: 'Mensagem inválida', detail: 'Escreva uma mensagem válida. Nada foi enviado.' },
  invalid_min_rest: { kind: 'invalid', title: 'Descanso mínimo inválido', detail: 'Informe um número válido de horas de descanso.' },
  invalid_name: { kind: 'invalid', title: 'Nome inválido', detail: 'Escreva um nome válido. Nada foi gravado.' },
  invalid_period: { kind: 'invalid', title: 'Período inválido', detail: 'A data final precisa ser igual ou posterior à inicial.' },
  invalid_gap_period: { kind: 'invalid', title: 'Intervalo da lacuna inválido', detail: 'O fim do intervalo não coberto precisa vir depois do início.' },
  invalid_valid_period: { kind: 'invalid', title: 'Período de validade inválido', detail: 'O fim da validade precisa vir depois do início.' },
  invalid_post_type: { kind: 'invalid', title: 'Tipo de posto inválido', detail: 'Use um dos tipos oferecidos pela tela.' },
  invalid_recipient_type: { kind: 'invalid', title: 'Tipo de destinatário inválido', detail: 'Use um dos destinatários oferecidos pela tela.' },
  invalid_required_items: { kind: 'invalid', title: 'Itens obrigatórios inválidos', detail: 'A lista de itens obrigatórios do modelo não foi aceita.' },
  invalid_role_type: { kind: 'invalid', title: 'Tipo de cargo inválido', detail: 'Use cargo ou função.' },
  invalid_severity: { kind: 'invalid', title: 'Gravidade inválida', detail: 'Use baixa, média, alta ou crítica.' },
  invalid_shift_type: { kind: 'invalid', title: 'Tipo de turno inválido', detail: 'Use um dos turnos oferecidos pela tela.' },
  invalid_title: { kind: 'invalid', title: 'Título inválido', detail: 'Escreva um título válido. Nada foi gravado.' },
  invalid_uncovered_minutes: { kind: 'invalid', title: 'Minutos não cobertos inválidos', detail: 'Informe um número inteiro de minutos.' },
  invalid_dimensioning_values: { kind: 'invalid', title: 'Valores de dimensionamento inválidos', detail: 'Efetivo contratado, planejado e realizado precisam ser números inteiros.' },
});

/**
 * Classifica uma falha da família de operação sem suavizar o significado.
 * @param {string|null|undefined} code código canônico, quando houver
 * @param {number} status status HTTP (0 quando a requisição nem chegou)
 */
export function describeOpsError(code, status = 0) {
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
  if (status === 405) return { ...ERROR_MESSAGES.method_not_allowed, code: code || null, status, canRetry: false };
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
      detail: 'Revise os campos destacados e tente novamente. Nada foi gravado.',
      code: code || null, status, canRetry: false,
    };
  }
  return { ...ERROR_MESSAGES.internal_error, code: code || null, status, canRetry: true };
}

/**
 * Variante visual de `UiState` correspondente à falha classificada.
 * `auth` NÃO vira "denied": sessão expirada é convite a entrar de novo, não
 * recusa de permissão. Só uma recusa real de concessão é "denied".
 */
export function opsErrorVariant(descriptor) {
  return descriptor && descriptor.kind === 'denied' ? 'denied' : 'error';
}

/**
 * Frase do rodapé declarando a resposta real do servidor. O código canônico
 * fica disponível para diagnóstico, entre parênteses — nunca como mensagem.
 */
export function opsErrorFootnote(descriptor) {
  if (!descriptor) return '';
  const resposta = descriptor.status ? `HTTP ${descriptor.status}` : 'sem resposta';
  return `Resposta do servidor: ${resposta}${descriptor.code ? ` (${descriptor.code})` : ''}.`;
}

// ---------------------------------------------------------------------------
// Rótulos. Os VALORES continuam canônicos; valor desconhecido passa cru.
// ---------------------------------------------------------------------------

function labelFrom(map, value) {
  if (value === null || value === undefined || value === '') return '—';
  const key = String(value).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : String(value);
}

/** Situação da alocação (`ops-api`, POST/PATCH `/api/ops/allocations`). */
const ALLOCATION_STATUS_LABELS = Object.freeze({
  planejado: 'Planejada', confirmado: 'Confirmada', em_andamento: 'Em andamento',
  concluido: 'Concluída', cancelado: 'Cancelada', substituido: 'Substituída',
});
export function allocationStatusLabel(value) { return labelFrom(ALLOCATION_STATUS_LABELS, value); }
export function allocationStatusTone(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'concluido' || key === 'confirmado') return 'success';
  if (key === 'cancelado') return 'danger';
  if (key === 'substituido') return 'warning';
  if (key === 'em_andamento' || key === 'planejado') return 'info';
  return 'neutral';
}

/** Situação da versão de escala (`ops-api`, `/api/ops/schedule-versions`). */
const SCHEDULE_VERSION_STATUS_LABELS = Object.freeze({
  rascunho: 'Rascunho', em_revisao: 'Em revisão', publicada: 'Publicada',
  revisada: 'Revisada', arquivada: 'Arquivada', cancelada: 'Cancelada',
});
export function scheduleVersionStatusLabel(value) { return labelFrom(SCHEDULE_VERSION_STATUS_LABELS, value); }
export function scheduleVersionStatusTone(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'publicada' || key === 'revisada') return 'success';
  if (key === 'cancelada') return 'danger';
  if (key === 'em_revisao') return 'warning';
  if (key === 'rascunho') return 'info';
  return 'neutral';
}

/** Situação da entrada de escala (`/api/ops/schedule-entries`). */
const SCHEDULE_ENTRY_STATUS_LABELS = Object.freeze({
  planejado: 'Planejada', confirmado: 'Confirmada', em_andamento: 'Em andamento',
  realizado: 'Realizada', falta: 'Falta', substituido: 'Substituída', cancelado: 'Cancelada',
});
export function scheduleEntryStatusLabel(value) { return labelFrom(SCHEDULE_ENTRY_STATUS_LABELS, value); }

/** Situação do dimensionamento (`/api/ops/dimensioning`). */
const DIMENSIONING_STATUS_LABELS = Object.freeze({
  rascunho: 'Rascunho', aprovado: 'Aprovado', em_execucao: 'Em execução',
  concluido: 'Concluído', arquivado: 'Arquivado',
});
export function dimensioningStatusLabel(value) { return labelFrom(DIMENSIONING_STATUS_LABELS, value); }

/** Situação da lacuna de cobertura (`/api/ops/coverage-gaps`). */
const GAP_STATUS_LABELS = Object.freeze({
  aberto: 'Aberta', em_tratamento: 'Em tratamento', resolvido: 'Resolvida', cancelado: 'Cancelada',
});
export function gapStatusLabel(value) { return labelFrom(GAP_STATUS_LABELS, value); }

/** Situação do pedido de cobertura (`ops-advanced-api`). */
const COVERAGE_REQUEST_STATUS_LABELS = Object.freeze({
  aberto: 'Aberto', em_busca: 'Em busca de cobertura', candidato_encontrado: 'Candidato encontrado',
  aprovado: 'Aprovado', resolvido: 'Resolvido', cancelado: 'Cancelado',
});
export function coverageRequestStatusLabel(value) { return labelFrom(COVERAGE_REQUEST_STATUS_LABELS, value); }

/** Situação da passagem de turno (`ops-advanced-api`). */
const HANDOVER_STATUS_LABELS = Object.freeze({
  pendente: 'Pendente', em_andamento: 'Em andamento', aceito: 'Aceita', recusado: 'Recusada',
  encerrado: 'Encerrada', cancelado: 'Cancelada', escalonado: 'Escalonada',
});
export function handoverStatusLabel(value) { return labelFrom(HANDOVER_STATUS_LABELS, value); }

/** Situação da ocorrência do livro (`ops-advanced-api`). */
const OCCURRENCE_STATUS_LABELS = Object.freeze({
  aberto: 'Aberta', em_analise: 'Em análise', em_tratamento: 'Em tratamento', resolvido: 'Resolvida',
  encerrado: 'Encerrada', cancelado: 'Cancelada', retificado: 'Retificada',
});
export function occurrenceStatusLabel(value) { return labelFrom(OCCURRENCE_STATUS_LABELS, value); }

/** Situação da execução de checklist (`ops-advanced-api`). */
const CHECKLIST_STATUS_LABELS = Object.freeze({
  pendente: 'Pendente', em_andamento: 'Em andamento', concluido: 'Concluído',
  cancelado: 'Cancelado', nao_aplicavel: 'Não aplicável',
});
export function checklistStatusLabel(value) { return labelFrom(CHECKLIST_STATUS_LABELS, value); }

/** Gravidade da ocorrência. */
const SEVERITY_LABELS = Object.freeze({ baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' });
export function occurrenceSeverityLabel(value) { return labelFrom(SEVERITY_LABELS, value); }
export function occurrenceSeverityTone(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'critica') return 'danger';
  if (key === 'alta') return 'warning';
  if (key === 'media') return 'info';
  if (key === 'baixa') return 'neutral';
  return 'neutral';
}

/** Tipo de posto físico (`ops-api`). */
const POST_TYPE_LABELS = Object.freeze({
  portaria: 'Portaria', vigilancia: 'Vigilância', limpeza: 'Limpeza', zeladoria: 'Zeladoria',
  recepcao: 'Recepção', monitoramento: 'Monitoramento', manutencao: 'Manutenção', outro: 'Outro',
});
export function postTypeLabel(value) { return labelFrom(POST_TYPE_LABELS, value); }

/** Tipo de cargo/função. */
const ROLE_TYPE_LABELS = Object.freeze({ cargo: 'Cargo', funcao: 'Função' });
export function roleTypeLabel(value) { return labelFrom(ROLE_TYPE_LABELS, value); }

/** Tipo de turno do modelo. */
const SHIFT_TYPE_LABELS = Object.freeze({
  diurno: 'Diurno', noturno: 'Noturno', '12x36_dia': '12x36 diurno', '12x36_noite': '12x36 noturno',
  '24x48': '24x48', comercial: 'Comercial', madrugada: 'Madrugada', flexivel: 'Flexível', outro: 'Outro',
});
export function shiftTypeLabel(value) { return labelFrom(SHIFT_TYPE_LABELS, value); }

/**
 * Dia da semana na convenção do banco (0=domingo .. 6=sábado). `null` significa
 * que a necessidade não restringe o dia — e isso é dito, não inventado.
 */
const WEEKDAY_LABELS = Object.freeze(['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']);
export function weekdayLabel(value) {
  // NULL não é "todos os dias": é ausência de restrição registrada. Dizer
  // "todos os dias" seria inventar cobertura que o cadastro não afirma.
  if (value === null || value === undefined || value === '') return 'Sem dia específico';
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index <= 6 ? WEEKDAY_LABELS[index] : String(value);
}
