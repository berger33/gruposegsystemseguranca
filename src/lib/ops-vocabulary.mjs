// UX-07 (fatia A — Operação): vocabulário de apresentação da tela
// `/admin/operacao` (OperacaoWorkspace.tsx) e das APIs que ela consome:
// `src/server/ops-api.mjs`, `ops-advanced-api.mjs`, `ops-advanced2-api.mjs`,
// `ops-advanced3-api.mjs` e `ops-pendency-api.mjs`.
//
// Mesma regra das demais camadas (CRM em UX-03B, RH em UX-04, painel do
// Marcelo em UX-05, portais em UX-06): os VALORES continuam canônicos, saindo
// exatamente como os servidores esperam. Só o RÓTULO exibido muda. Valor
// desconhecido passa cru — nunca é inventada uma tradução para um valor que o
// servidor não devolveu.
//
// Esta camada NÃO decide sessão, NÃO decide concessão, NÃO decide isolamento
// por conta/contrato/posto e NÃO decide jornada, descanso, habilitação ou
// idempotência. Tudo isso continua sendo resolvido no servidor; aqui só se
// explica, em português, a resposta que já chegou.
//
// O defeito central que esta camada corrige: a tela de Operação tratava toda
// falha de leitura com `err.message || "Falha ao carregar."` — um 503 de
// auditoria, uma queda de rede e um erro de validação de negócio viravam a
// mesma frase genérica, e o código cru (`audit_unavailable`,
// `overlap_detected`, `qualification_required`...) só aparecia quando havia
// sorte de o `message` carregar o `error` do corpo da resposta.

/**
 * Mensagens para os códigos que `ops-api.mjs`, `ops-advanced-api.mjs`,
 * `ops-advanced2-api.mjs`, `ops-advanced3-api.mjs` e `ops-pendency-api.mjs`
 * realmente devolvem (195 códigos distintos, levantados lendo os cinco
 * arquivos). O título é humano; o código canônico só aparece no rodapé,
 * entre parênteses.
 */
const ERROR_MESSAGES = Object.freeze({
  // ----- Sessão, origem e permissão ------------------------------------------
  unauthorized: {
    kind: 'auth',
    title: 'Esta ação exige uma sessão de equipe',
    detail: 'O pedido chegou sem sessão válida. Nada foi lido nem gravado.',
  },
  forbidden: {
    kind: 'denied',
    title: 'Seu papel não tem esta concessão',
    detail: 'O menu pode mostrar esta tela, mas a concessão específica para esta ação não está presente na sua sessão. Nada foi feito.',
  },
  origin_forbidden: {
    kind: 'denied',
    title: 'Origem da requisição recusada',
    detail: 'O servidor só aceita esta gravação a partir da própria aplicação. Nada foi gravado.',
  },
  same_origin_required: {
    kind: 'denied',
    title: 'Esta gravação só é aceita a partir da própria aplicação',
    detail: 'O pedido não veio da origem esperada. Nada foi gravado.',
  },

  // ----- Formato do pedido e idempotência -------------------------------------
  method_not_allowed: {
    kind: 'invalid',
    title: 'Operação não permitida neste endereço',
    detail: 'A interface pediu de um jeito que o servidor não aceita aqui. Nada foi alterado.',
  },
  not_found: {
    kind: 'invalid',
    title: 'Registro não encontrado',
    detail: 'O item buscado não existe ou já não está mais no seu escopo.',
  },
  no_fields: {
    kind: 'invalid',
    title: 'Nenhum campo para gravar foi enviado',
    detail: 'Preencha ao menos um campo antes de confirmar.',
  },
  invalid_json: {
    kind: 'invalid',
    title: 'O pedido chegou com um formato ilegível',
    detail: 'O servidor não conseguiu interpretar os dados enviados. Tente novamente.',
  },
  idempotency_key_required: {
    kind: 'invalid',
    title: 'Esta ação exige uma chave de idempotência',
    detail: 'Sem ela, o servidor não pode garantir que um clique duplo não grave duas vezes. Nada foi gravado.',
  },
  conflict: {
    kind: 'conflict',
    title: 'O registro já existe ou entrou em conflito',
    detail: 'O servidor recusou a gravação por duplicidade. Confira se a ação já havia sido feita antes de repetir.',
  },

  // ----- Falhas de leitura e escrita (nunca viram "zero" ou "vazio") --------
  audit_unavailable: {
    kind: 'retry',
    title: 'A auditoria não confirmou o registro',
    detail: 'Por segurança, a gravação é recusada quando a trilha de auditoria não pode ser garantida. Nada foi salvo.',
  },
  audit_or_write_unavailable: {
    kind: 'retry',
    title: 'A gravação não pôde ser confirmada com auditoria',
    detail: 'Por segurança, a gravação é recusada quando a trilha de auditoria não pode ser garantida. Nada foi salvo.',
  },
  read_unavailable: {
    kind: 'retry',
    title: 'Não foi possível consultar estes dados agora',
    detail: 'A leitura falhou no servidor. Isto não significa lista vazia — nada foi confirmado.',
  },
  validation_unavailable: {
    kind: 'retry',
    title: 'Não foi possível validar a jornada agora',
    detail: 'O motor de validação de jornada e descanso não respondeu. A ação não foi concluída.',
  },
  work_rule_unavailable: {
    kind: 'retry',
    title: 'Não foi possível consultar a regra de jornada agora',
    detail: 'A leitura das regras de jornada e descanso falhou. Isto não significa ausência de regra.',
  },
  schedule_validation_unavailable: {
    kind: 'retry',
    title: 'Não foi possível validar a escala agora',
    detail: 'A verificação de conflitos de escala não respondeu. Nada foi publicado.',
  },
  schedule_entry_unavailable: {
    kind: 'retry',
    title: 'Não foi possível gravar a entrada de escala agora',
    detail: 'O servidor não confirmou a gravação. Nada foi adicionado ao calendário.',
  },
  employee_unavailable: {
    kind: 'retry',
    title: 'Não foi possível confirmar a situação do profissional agora',
    detail: 'A consulta ao cadastro de pessoal falhou. Isto não significa profissional inexistente.',
  },
  allocation_unavailable: {
    kind: 'retry',
    title: 'Não foi possível confirmar a alocação agora',
    detail: 'A leitura de alocações falhou no servidor. Nada foi presumido.',
  },
  pendency_unavailable: {
    kind: 'retry',
    title: 'Não foi possível consultar as pendências agora',
    detail: 'A leitura falhou no servidor. Isto não significa ausência de pendência.',
  },
  post_shift_need_unavailable: {
    kind: 'retry',
    title: 'Não foi possível consultar a necessidade de turno agora',
    detail: 'A leitura falhou no servidor. Isto não significa posto sem necessidade cadastrada.',
  },
  service_unavailable: {
    kind: 'retry',
    title: 'O serviço não respondeu',
    detail: 'Tente novamente em instantes. Nada foi confirmado.',
  },
  internal_error: {
    kind: 'retry',
    title: 'Falha interna do servidor',
    detail: 'Algo deu errado ao processar o pedido. Nada foi confirmado como concluído.',
  },

  // ----- Regras de negócio: jornada, descanso e habilitação -----------------
  overlap_detected: {
    kind: 'conflict',
    title: 'Há sobreposição de horário com outra alocação',
    detail: 'O profissional já está alocado em outro posto no mesmo intervalo. A gravação foi recusada para não dobrar a escala.',
  },
  max_weekly_hours_exceeded: {
    kind: 'conflict',
    title: 'A jornada semanal máxima seria ultrapassada',
    detail: 'A regra de jornada aprovada e ativa limita as horas semanais. Esta alocação ultrapassaria o limite e foi recusada.',
  },
  max_daily_hours_exceeded: {
    kind: 'conflict',
    title: 'A jornada diária máxima seria ultrapassada',
    detail: 'A regra de jornada aprovada e ativa limita as horas por dia. Esta alocação ultrapassaria o limite e foi recusada.',
  },
  min_rest_hours_violated: {
    kind: 'conflict',
    title: 'O descanso mínimo entre jornadas não seria respeitado',
    detail: 'A regra de jornada aprovada e ativa exige um intervalo mínimo de descanso. Esta alocação violaria o intervalo e foi recusada.',
  },
  max_consecutive_days_exceeded: {
    kind: 'conflict',
    title: 'O limite de dias consecutivos seria ultrapassado',
    detail: 'A regra de jornada aprovada e ativa limita dias seguidos de trabalho. Esta alocação ultrapassaria o limite e foi recusada.',
  },
  role_required_by_work_rule: {
    kind: 'invalid',
    title: 'A regra de jornada exige certificação para este cargo',
    detail: 'Cadastre a qualificação exigida antes de alocar nesta função.',
  },
  qualification_required: {
    kind: 'conflict',
    title: 'O profissional não tem a habilitação exigida para este cargo',
    detail: 'Alocar com cargo exigido depende de qualificação válida registrada. Nada foi gravado.',
  },
  qualification_expired: {
    kind: 'conflict',
    title: 'A habilitação do profissional está vencida',
    detail: 'A qualificação existe, mas a validade já passou. Atualize o cadastro antes de alocar.',
  },
  qualification_invalid: {
    kind: 'conflict',
    title: 'A habilitação do profissional foi marcada como inválida',
    detail: 'A qualificação cadastrada não está mais válida. Atualize o cadastro antes de alocar.',
  },
  candidate_unqualified: {
    kind: 'conflict',
    title: 'O profissional indicado não tem a qualificação exigida',
    detail: 'Indique um profissional habilitado ou cadastre a qualificação antes de confirmar.',
  },
  candidate_conflict: {
    kind: 'conflict',
    title: 'O profissional indicado tem conflito de horário',
    detail: 'Há sobreposição com outra alocação já registrada. Escolha outro profissional ou horário.',
  },

  // ----- Checklists, escalas e ciência ---------------------------------------
  mandatory_items_pending: {
    kind: 'conflict',
    title: 'Itens obrigatórios do checklist ainda não foram concluídos',
    detail: 'A execução não pode ser encerrada enquanto houver item obrigatório pendente.',
  },
  version_not_published: {
    kind: 'conflict',
    title: 'A versão da escala ainda não foi publicada',
    detail: 'Esta ação exige uma versão publicada. Publique a versão antes de registrar ciência ou gerar efeito.',
  },
  version_not_editable: {
    kind: 'conflict',
    title: 'Esta versão de escala não pode mais ser editada',
    detail: 'Versões publicadas ou revisadas preservam o histórico. Crie uma nova versão para alterar.',
  },
  version_not_found: {
    kind: 'invalid',
    title: 'Versão de escala não encontrada',
    detail: 'A versão informada não existe ou não está no seu escopo.',
  },
  duplicate_ack: {
    kind: 'conflict',
    title: 'Ciência já registrada para este profissional',
    detail: 'A segunda tentativa não duplica o efeito: a primeira ciência já vale.',
  },
  entry_date_out_of_validity: {
    kind: 'invalid',
    title: 'A data está fora da validade da versão',
    detail: 'Escolha uma data dentro do período de validade da versão de escala.',
  },
  invalid_status_transition: {
    kind: 'conflict',
    title: 'Esta mudança de situação não é permitida',
    detail: 'A situação atual não aceita passar diretamente para a situação pedida.',
  },

  // ----- Postos, contratos, empresas e escopo --------------------------------
  post_inactive: {
    kind: 'conflict',
    title: 'Este posto está inativo',
    detail: 'Postos inativos não recebem nova alocação ou rotina. O histórico é preservado.',
  },
  post_not_found: {
    kind: 'invalid',
    title: 'Posto não encontrado',
    detail: 'O posto informado não existe ou não está no seu escopo.',
  },
  post_not_operational: {
    kind: 'conflict',
    title: 'Este posto não está operacional',
    detail: 'O posto depende de um contrato ativo para operar. Nada foi gravado.',
  },
  post_or_active_contract_required: {
    kind: 'conflict',
    title: 'É preciso um posto ativo com contrato operacional',
    detail: 'O posto informado não está ativo ou o contrato vinculado não está em operação. Nada foi gravado.',
  },
  post_contract_mismatch: {
    kind: 'invalid',
    title: 'O posto não pertence ao contrato informado',
    detail: 'Confira o vínculo entre posto e contrato antes de confirmar.',
  },
  contract_not_found: {
    kind: 'invalid',
    title: 'Contrato não encontrado',
    detail: 'O contrato informado não existe ou não está no seu escopo.',
  },
  contract_not_operational: {
    kind: 'conflict',
    title: 'Este contrato não está operacional',
    detail: 'Contrato encerrado, cancelado ou suspenso não recebe nova alocação ou rotina. O histórico é preservado.',
  },
  contract_company_mismatch: {
    kind: 'invalid',
    title: 'O contrato não pertence à empresa informada',
    detail: 'Confira o vínculo entre contrato e empresa antes de confirmar.',
  },
  contract_and_period_required: {
    kind: 'invalid',
    title: 'Informe o contrato e o período',
    detail: 'Os dois campos são obrigatórios para esta consulta.',
  },
  company_scope_mismatch: {
    kind: 'denied',
    title: 'Este registro não pertence à empresa do seu escopo',
    detail: 'Por isolamento de conta, a leitura ou gravação foi recusada.',
  },
  unit_scope_mismatch: {
    kind: 'denied',
    title: 'Este registro não pertence à unidade do seu escopo',
    detail: 'Por isolamento de conta, a leitura ou gravação foi recusada.',
  },
  scope_mismatch: {
    kind: 'denied',
    title: 'Este registro está fora do seu escopo',
    detail: 'O posto, contrato ou unidade informados não conferem com o registro. Nada foi gravado.',
  },
  document_outside_contract_scope: {
    kind: 'denied',
    title: 'Este documento está fora do escopo do contrato',
    detail: 'Por isolamento de conta, a leitura foi recusada.',
  },
  dimensioning_post_mismatch: {
    kind: 'invalid',
    title: 'O dimensionamento não pertence ao posto informado',
    detail: 'Confira o vínculo entre posto e dimensionamento antes de confirmar.',
  },

  // ----- Modelos de turno e demais modelos -----------------------------------
  shift_template_inactive: {
    kind: 'conflict',
    title: 'Este modelo de turno está inativo',
    detail: 'Modelos inativos não podem ser usados em nova necessidade ou entrada de escala.',
  },
  shift_template_not_found: {
    kind: 'invalid',
    title: 'Modelo de turno não encontrado',
    detail: 'O modelo de turno informado não existe ou não está no seu escopo.',
  },
  template_inactive: {
    kind: 'conflict',
    title: 'Este modelo está inativo',
    detail: 'Modelos inativos não podem ser usados em nova execução.',
  },
  template_not_found: {
    kind: 'invalid',
    title: 'Modelo não encontrado',
    detail: 'O modelo informado não existe ou não está no seu escopo.',
  },

  // ----- Duplicidade ----------------------------------------------------------
  duplicate_template: {
    kind: 'conflict',
    title: 'Já existe um modelo com estes dados',
    detail: 'Ajuste os dados para diferenciar do modelo existente, ou use o modelo já cadastrado.',
  },
  duplicate_template_version: {
    kind: 'conflict',
    title: 'Já existe uma versão deste modelo',
    detail: 'Crie uma nova versão com um número diferente, ou edite a versão existente.',
  },
  duplicate_role: {
    kind: 'conflict',
    title: 'Já existe um cargo com este nome',
    detail: 'Ajuste o nome ou utilize o cargo já cadastrado.',
  },
  duplicate_need: {
    kind: 'conflict',
    title: 'Já existe uma necessidade igual para este posto e turno',
    detail: 'Ajuste os dados ou edite a necessidade existente.',
  },
  duplicate_entry: {
    kind: 'conflict',
    title: 'Já existe uma entrada igual nesta escala',
    detail: 'A segunda tentativa não duplica o efeito.',
  },
  duplicate_allocation: {
    kind: 'conflict',
    title: 'Já existe uma alocação igual para esta data',
    detail: 'A segunda tentativa não duplica o efeito.',
  },
  duplicate_coverage_request: {
    kind: 'conflict',
    title: 'Já existe uma solicitação de cobertura igual em aberto',
    detail: 'Resolva ou cancele a solicitação existente antes de abrir outra igual.',
  },
  duplicate_checklist_instance: {
    kind: 'conflict',
    title: 'Já existe uma execução de checklist igual agendada',
    detail: 'A segunda tentativa não duplica o efeito.',
  },
  duplicate_rule: {
    kind: 'conflict',
    title: 'Já existe uma regra de jornada igual cadastrada',
    detail: 'Ajuste os dados ou edite a regra existente.',
  },

  // ----- Pessoas e movimentação -----------------------------------------------
  same_employee: {
    kind: 'invalid',
    title: 'Origem e destino não podem ser o mesmo profissional',
    detail: 'Escolha profissionais diferentes para esta movimentação.',
  },
  employee_not_found: {
    kind: 'invalid',
    title: 'Profissional não encontrado',
    detail: 'O profissional informado não existe ou não está no seu escopo.',
  },
  employee_not_operational: {
    kind: 'conflict',
    title: 'Este profissional não está ativo',
    detail: 'Profissionais inativos não recebem nova alocação. O histórico é preservado.',
  },
  responsible_employee_not_operational: {
    kind: 'conflict',
    title: 'O responsável indicado não está ativo',
    detail: 'Indique um profissional ativo para esta responsabilidade.',
  },
  active_contract_required: {
    kind: 'conflict',
    title: 'É preciso um contrato ativo',
    detail: 'O contrato vinculado precisa estar operacional para esta ação.',
  },
  active_employee_required: {
    kind: 'conflict',
    title: 'É preciso um profissional ativo',
    detail: 'O cadastro de pessoal precisa estar ativo para esta ação.',
  },
  active_executor_required: {
    kind: 'conflict',
    title: 'O executor indicado precisa estar ativo',
    detail: 'Indique um profissional ativo para registrar esta execução.',
  },
  active_supervisor_required: {
    kind: 'conflict',
    title: 'O supervisor indicado precisa estar ativo',
    detail: 'Indique um profissional ativo para esta supervisão.',
  },
  active_visit_scope_required: {
    kind: 'conflict',
    title: 'A visita precisa estar vinculada a um posto com contrato ativo',
    detail: 'Confira o posto e o contrato antes de registrar a inspeção.',
  },

  // ----- Registros não encontrados ---------------------------------------------
  job_role_not_found: {
    kind: 'invalid',
    title: 'Cargo ou função não encontrado',
    detail: 'O cargo informado não existe ou não está no seu escopo.',
  },
  document_not_found: {
    kind: 'invalid',
    title: 'Documento não encontrado',
    detail: 'O documento informado não existe ou não está no seu escopo.',
  },
  occurrence_not_found: {
    kind: 'invalid',
    title: 'Ocorrência não encontrada',
    detail: 'A ocorrência informada não existe ou não está no seu escopo.',
  },
  coverage_request_not_found: {
    kind: 'invalid',
    title: 'Solicitação de cobertura não encontrada',
    detail: 'A solicitação informada não existe ou não está no seu escopo.',
  },
  dimensioning_not_found: {
    kind: 'invalid',
    title: 'Registro de dimensionamento não encontrado',
    detail: 'O registro informado não existe ou não está no seu escopo.',
  },
  pendency_not_found: {
    kind: 'invalid',
    title: 'Pendência não encontrada',
    detail: 'A pendência informada não existe ou não está no seu escopo.',
  },
  pendency_archived: {
    kind: 'conflict',
    title: 'Esta pendência já foi arquivada',
    detail: 'Pendências arquivadas preservam o histórico e não aceitam nova ação.',
  },
  archive_note_required: {
    kind: 'invalid',
    title: 'Explique por que está arquivando esta pendência',
    detail: 'A nota de arquivamento é obrigatória para preservar o histórico com contexto.',
  },
  instance_not_found: {
    kind: 'invalid',
    title: 'Execução de checklist não encontrada',
    detail: 'A execução informada não existe ou não está no seu escopo.',
  },
  execution_not_found: {
    kind: 'invalid',
    title: 'Execução não encontrada',
    detail: 'A execução informada não existe ou não está no seu escopo.',
  },
  visit_not_found: {
    kind: 'invalid',
    title: 'Visita de supervisão não encontrada',
    detail: 'A visita informada não existe ou não está no seu escopo.',
  },
  definition_not_found: {
    kind: 'invalid',
    title: 'Definição de métrica não encontrada',
    detail: 'A definição informada não existe ou não está no seu escopo.',
  },
  key_not_found: {
    kind: 'invalid',
    title: 'Chave, rádio ou equipamento não encontrado',
    detail: 'O item informado não existe ou não está no seu escopo.',
  },
  key_already_borrowed: {
    kind: 'conflict',
    title: 'Este item já está emprestado',
    detail: 'Registre a devolução antes de uma nova retirada.',
  },
  key_not_borrowed: {
    kind: 'conflict',
    title: 'Este item não está emprestado no momento',
    detail: 'Não há retirada em aberto para registrar devolução.',
  },
  absence_not_found: {
    kind: 'invalid',
    title: 'Afastamento não encontrado',
    detail: 'O registro informado não existe ou não está no seu escopo.',
  },

  // ----- Limpeza, monitoramento sintético e relatórios ao cliente ------------
  routine_environment_mismatch: {
    kind: 'invalid',
    title: 'A rotina não pertence ao ambiente informado',
    detail: 'Confira o vínculo entre rotina e ambiente antes de confirmar.',
  },
  real_monitoring_claim_prohibited: {
    kind: 'invalid',
    title: 'Esta tela não pode registrar monitoramento real',
    detail: 'O conteúdo sugere central 24h ou despacho real. Esta superfície é só simulação sintética rotulada.',
  },
  synthetic_event_label_required: {
    kind: 'invalid',
    title: 'Este evento precisa ser rotulado como sintético',
    detail: 'A tela de monitoramento aqui é só simulação; não há central 24h nem despacho real.',
  },
  synthetic_label_required: {
    kind: 'invalid',
    title: 'Este registro precisa ser rotulado como sintético',
    detail: 'A tela aqui é só simulação; o rótulo sintético é obrigatório.',
  },
  unresolved_conflicts_require_human_review: {
    kind: 'conflict',
    title: 'Há conflitos sem revisão humana',
    detail: 'Esta proposta tem conflitos de escala em aberto; eles exigem decisão humana antes de seguir.',
  },
  human_review_explanation_required: {
    kind: 'invalid',
    title: 'Explique a decisão da revisão humana',
    detail: 'O motivo da decisão é obrigatório para preservar o histórico com contexto.',
  },
  value_required_no_implicit_zero: {
    kind: 'invalid',
    title: 'Informe o valor — zero não é presumido',
    detail: 'Sem o valor explícito, o sistema não grava zero por padrão. Preencha o campo.',
  },
  client_release_requires_approval: {
    kind: 'conflict',
    title: 'Liberar para o cliente exige aprovação prévia',
    detail: 'O relatório precisa estar aprovado antes de ser liberado para o cliente.',
  },
  formal_and_privacy_approval_required: {
    kind: 'conflict',
    title: 'Faltam a aprovação de conteúdo e a revisão de privacidade',
    detail: 'As duas aprovações são exigidas antes do envio ao cliente.',
  },
  location_unavailable_reason_required: {
    kind: 'invalid',
    title: 'Explique por que a localização não está disponível',
    detail: 'Quando a localização não pôde ser capturada, o motivo é obrigatório.',
  },

  // ----- Justificativas e trilha de auditoria ---------------------------------
  reason_required_for_retification: {
    kind: 'invalid',
    title: 'Explique o motivo da retificação',
    detail: 'Toda retificação exige justificativa registrada no histórico.',
  },
  rejection_reason_required: {
    kind: 'invalid',
    title: 'Explique o motivo da rejeição',
    detail: 'A rejeição exige justificativa registrada no histórico.',
  },
  escalation_reason_required: {
    kind: 'invalid',
    title: 'Explique o motivo da escalada',
    detail: 'A escalada exige justificativa registrada no histórico.',
  },
  decision_by_required: {
    kind: 'invalid',
    title: 'Informe quem tomou a decisão',
    detail: 'A trilha de auditoria exige saber quem decidiu.',
  },
  resolution_notes_required: {
    kind: 'invalid',
    title: 'Descreva como o item foi resolvido',
    detail: 'A nota de resolução é obrigatória para fechar o item.',
  },
  treatment_notes_required: {
    kind: 'invalid',
    title: 'Descreva o tratamento dado ao evento',
    detail: 'A nota de tratamento é obrigatória antes de avançar a situação.',
  },
  verified_by_required: {
    kind: 'invalid',
    title: 'Informe quem verificou',
    detail: 'A trilha de auditoria exige saber quem verificou.',
  },
  reviewed_by_required: {
    kind: 'invalid',
    title: 'Informe quem revisou',
    detail: 'A trilha de auditoria exige saber quem revisou.',
  },
  closed_by_required: {
    kind: 'invalid',
    title: 'Informe quem encerrou',
    detail: 'A trilha de auditoria exige saber quem encerrou.',
  },
  acknowledged_by_required: {
    kind: 'invalid',
    title: 'Informe quem reconheceu o evento',
    detail: 'A trilha de auditoria exige saber quem reconheceu.',
  },
  responsible_required: {
    kind: 'invalid',
    title: 'Informe o responsável',
    detail: 'O campo é obrigatório para esta ação.',
  },
  executor_required: {
    kind: 'invalid',
    title: 'Informe o executor',
    detail: 'O campo é obrigatório para registrar a execução.',
  },
  incompleteness_reason_required: {
    kind: 'invalid',
    title: 'Explique por que a medição está incompleta',
    detail: 'Quando a situação não é "completo", o motivo é obrigatório.',
  },
  supervisor_employee_id_required: {
    kind: 'invalid',
    title: 'Informe o supervisor responsável',
    detail: 'O campo é obrigatório para registrar a visita.',
  },

  // ----- Campos e datas obrigatórias -------------------------------------------
  scheduled_date_required: {
    kind: 'invalid',
    title: 'Informe a data agendada',
    detail: 'O campo é obrigatório para registrar o item.',
  },
  entry_date_required: {
    kind: 'invalid',
    title: 'Informe a data da entrada',
    detail: 'O campo é obrigatório para registrar a entrada na escala.',
  },
  allocation_date_required: {
    kind: 'invalid',
    title: 'Informe a data da alocação',
    detail: 'O campo é obrigatório para registrar a alocação.',
  },
  period_required: {
    kind: 'invalid',
    title: 'Informe o período',
    detail: 'Data de início e de fim são obrigatórias para esta consulta.',
  },
  valid_period_required: {
    kind: 'invalid',
    title: 'Informe a validade (início e fim)',
    detail: 'Os dois campos são obrigatórios para esta versão.',
  },
  start_end_required: {
    kind: 'invalid',
    title: 'Informe o início e o fim',
    detail: 'Os dois campos são obrigatórios para esta janela.',
  },
  gap_fields_required: {
    kind: 'invalid',
    title: 'Preencha os campos da lacuna de cobertura',
    detail: 'Data, janela e minutos descobertos são obrigatórios.',
  },
  definition_and_window_required: {
    kind: 'invalid',
    title: 'Informe a definição da métrica e a janela de tempo',
    detail: 'Os dois campos são obrigatórios para este snapshot.',
  },
  source_window_formula_required: {
    kind: 'invalid',
    title: 'Informe fonte, janela e fórmula de cálculo',
    detail: 'Os três campos são obrigatórios para esta definição de métrica.',
  },

  // ----- Campos inválidos (identificadores e valores) -------------------------
  invalid_id: { kind: 'invalid', title: 'Identificador inválido', detail: 'O identificador informado não foi aceito pelo servidor. Revise e tente novamente.' },
  invalid_ids: { kind: 'invalid', title: 'Lista de identificadores inválida', detail: 'Um ou mais identificadores informados não foram aceitos pelo servidor. Revise e tente novamente.' },
  invalid_absence_id: { kind: 'invalid', title: 'Identificador do afastamento inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_action_plan: { kind: 'invalid', title: 'Dados do plano de ação inválidos', detail: 'Confira título, descrição, responsável e prazo do plano de ação.' },
  invalid_action_type: { kind: 'invalid', title: 'Tipo de ação inválido', detail: 'O tipo informado não é aceito pelo servidor.' },
  invalid_availability_status: { kind: 'invalid', title: 'Situação de disponibilidade inválida', detail: 'O valor informado não é aceito pelo servidor.' },
  invalid_category: { kind: 'invalid', title: 'Categoria inválida', detail: 'O valor informado não é aceito pelo servidor.' },
  invalid_certification_type: { kind: 'invalid', title: 'Tipo de certificação inválido', detail: 'O valor informado não é aceito pelo servidor.' },
  invalid_channel: { kind: 'invalid', title: 'Canal inválido', detail: 'O valor informado não é aceito pelo servidor.' },
  invalid_company_id: { kind: 'invalid', title: 'Identificador da empresa inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_contract_id: { kind: 'invalid', title: 'Identificador do contrato inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_coverage_request_id: { kind: 'invalid', title: 'Identificador da solicitação de cobertura inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_day_of_week: { kind: 'invalid', title: 'Dia da semana inválido', detail: 'Use um valor de 0 (domingo) a 6 (sábado), ou deixe em branco para "sem dia específico".' },
  invalid_description: { kind: 'invalid', title: 'Descrição inválida', detail: 'O texto informado não foi aceito pelo servidor.' },
  invalid_dimensioning_id: { kind: 'invalid', title: 'Identificador do dimensionamento inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_dimensioning_values: { kind: 'invalid', title: 'Valores de dimensionamento inválidos', detail: 'Confira efetivo contratado, planejado e realizado informados.' },
  invalid_document_id: { kind: 'invalid', title: 'Identificador do documento inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_duration: { kind: 'invalid', title: 'Duração inválida', detail: 'O valor informado não é aceito pelo servidor.' },
  invalid_employee_id: { kind: 'invalid', title: 'Identificador do profissional inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_entry: { kind: 'invalid', title: 'Dados da entrada inválidos', detail: 'Confira os campos da entrada de escala antes de confirmar.' },
  invalid_event_id: { kind: 'invalid', title: 'Identificador do evento inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_frequency: { kind: 'invalid', title: 'Frequência inválida', detail: 'O valor informado não é aceito pelo servidor.' },
  invalid_from_employee_id: { kind: 'invalid', title: 'Identificador do profissional de origem inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_from_post_id: { kind: 'invalid', title: 'Identificador do posto de origem inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_gap_id: { kind: 'invalid', title: 'Identificador da lacuna inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_gap_period: { kind: 'invalid', title: 'Período da lacuna inválido', detail: 'Confira a janela de início e fim da lacuna de cobertura.' },
  invalid_handover_id: { kind: 'invalid', title: 'Identificador da passagem de plantão inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_headcount: { kind: 'invalid', title: 'Efetivo inválido', detail: 'Informe um número de profissionais válido.' },
  invalid_inspection: { kind: 'invalid', title: 'Dados da inspeção inválidos', detail: 'Confira a visita vinculada e o título da inspeção.' },
  invalid_instance_id: { kind: 'invalid', title: 'Identificador da execução inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_item_description: { kind: 'invalid', title: 'Descrição do item inválida', detail: 'O texto informado não foi aceito pelo servidor.' },
  invalid_key: { kind: 'invalid', title: 'Dados da chave inválidos', detail: 'Confira os campos do item (chave, rádio, equipamento ou material).' },
  invalid_max_consecutive: { kind: 'invalid', title: 'Máximo de dias consecutivos inválido', detail: 'Informe um número de dias válido.' },
  invalid_max_daily: { kind: 'invalid', title: 'Jornada máxima diária inválida', detail: 'Informe um número de horas válido.' },
  invalid_max_weekly: { kind: 'invalid', title: 'Jornada máxima semanal inválida', detail: 'Informe um número de horas válido.' },
  invalid_message: { kind: 'invalid', title: 'Mensagem inválida', detail: 'O texto informado não foi aceito pelo servidor.' },
  invalid_min_rest: { kind: 'invalid', title: 'Descanso mínimo inválido', detail: 'Informe um número de horas válido.' },
  invalid_movement: { kind: 'invalid', title: 'Dados do movimento inválidos', detail: 'Confira os campos da movimentação do item.' },
  invalid_name: { kind: 'invalid', title: 'Nome inválido', detail: 'O texto informado não foi aceito pelo servidor.' },
  invalid_nonconformity: { kind: 'invalid', title: 'Dados da não conformidade inválidos', detail: 'Confira tipo, descrição e gravidade informados.' },
  invalid_occurrence_id: { kind: 'invalid', title: 'Identificador da ocorrência inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_patrol_id: { kind: 'invalid', title: 'Identificador da ronda inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_pendency_id: { kind: 'invalid', title: 'Identificador da pendência inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_period: { kind: 'invalid', title: 'Período inválido', detail: 'Confira as datas de início e fim informadas.' },
  invalid_post_id: { kind: 'invalid', title: 'Identificador do posto inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_post_or_shift: { kind: 'invalid', title: 'Posto ou turno inválido', detail: 'Confira o posto e o turno informados.' },
  invalid_post_type: { kind: 'invalid', title: 'Tipo de posto inválido', detail: 'O valor informado não é aceito pelo servidor.' },
  invalid_reading: { kind: 'invalid', title: 'Dados da leitura inválidos', detail: 'Confira os campos da leitura do ponto de ronda.' },
  invalid_recipient_type: { kind: 'invalid', title: 'Tipo de destinatário inválido', detail: 'O valor informado não é aceito pelo servidor.' },
  invalid_reincidence: { kind: 'invalid', title: 'Dados de reincidência inválidos', detail: 'Confira as datas e a contagem de ocorrências informadas.' },
  invalid_report: { kind: 'invalid', title: 'Dados do relatório inválidos', detail: 'Confira os campos do relatório antes de confirmar.' },
  invalid_report_id: { kind: 'invalid', title: 'Identificador do relatório inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_required_items: { kind: 'invalid', title: 'Itens obrigatórios inválidos', detail: 'Confira a lista de itens obrigatórios do checklist.' },
  invalid_responsible_id: { kind: 'invalid', title: 'Identificador do responsável inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_role_id: { kind: 'invalid', title: 'Identificador do cargo inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_role_type: { kind: 'invalid', title: 'Tipo de cargo inválido', detail: 'O valor informado não é aceito pelo servidor.' },
  invalid_routine: { kind: 'invalid', title: 'Dados da rotina inválidos', detail: 'Confira ambiente, título e frequência da rotina de limpeza.' },
  invalid_score: { kind: 'invalid', title: 'Nota inválida', detail: 'Informe um valor entre 0 e 100.' },
  invalid_severity: { kind: 'invalid', title: 'Gravidade inválida', detail: 'O valor informado não é aceito pelo servidor.' },
  invalid_shift_template_id: { kind: 'invalid', title: 'Identificador do modelo de turno inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_shift_type: { kind: 'invalid', title: 'Tipo de turno inválido', detail: 'O valor informado não é aceito pelo servidor.' },
  invalid_status: { kind: 'invalid', title: 'Situação inválida', detail: 'O valor informado não é aceito pelo servidor.' },
  invalid_template_id: { kind: 'invalid', title: 'Identificador do modelo inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_title: { kind: 'invalid', title: 'Título inválido', detail: 'O texto informado não foi aceito pelo servidor.' },
  invalid_to_employee_id: { kind: 'invalid', title: 'Identificador do profissional de destino inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_uncovered_minutes: { kind: 'invalid', title: 'Minutos descobertos inválidos', detail: 'Informe um número de minutos válido para a lacuna de cobertura.' },
  invalid_unit_id: { kind: 'invalid', title: 'Identificador da unidade inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },
  invalid_valid_period: { kind: 'invalid', title: 'Período de validade inválido', detail: 'Confira as datas de início e fim da validade.' },
  invalid_version_id: { kind: 'invalid', title: 'Identificador da versão inválido', detail: 'O identificador informado não foi aceito pelo servidor.' },

  // ----- Fallback genérico (NUNCA usado como título dedicado — só o rodapé) --
  internal: {
    kind: 'retry',
    title: 'Falha no servidor',
    detail: 'O servidor respondeu com erro e nada foi carregado nem gravado. Isto não é a mesma coisa que não haver registros.',
  },
});

/**
 * Classifica a resposta do servidor em um descritor pronto para a interface.
 * `code` é o valor cru de `{ error: '...' }`; `status` é o HTTP da resposta.
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
export function opsErrorVariant(descriptor) {
  return descriptor && (descriptor.kind === 'denied' || descriptor.kind === 'auth') ? 'denied' : 'error';
}

/**
 * Frase pronta para o rodapé de uma falha, declarando a resposta real do
 * servidor. O código canônico fica disponível para diagnóstico, entre
 * parênteses — nunca como a mensagem principal.
 */
export function opsErrorFootnote(descriptor) {
  if (!descriptor) return '';
  const resposta = descriptor.status ? `HTTP ${descriptor.status}` : 'sem resposta';
  return `Resposta do servidor: ${resposta}${descriptor.code ? ` (${descriptor.code})` : ''}.`;
}

// ---------------------------------------------------------------------------
// Rótulos de situação. Os VALORES continuam canônicos (vêm dos tipos ENUM do
// PostgreSQL, ver db/migrations/070 a 073); valor desconhecido passa cru.
// ---------------------------------------------------------------------------

function buildLookup(map) {
  return Object.freeze(map);
}

function labelFrom(map, value) {
  if (value === null || value === undefined || value === '') return '—';
  const key = String(value).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : String(value);
}

function toneFrom(map, value, fallback = 'neutral') {
  const key = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : fallback;
}

/** `ops_allocation_status` (migração 070). */
const ALLOCATION_STATUS_LABELS = buildLookup({
  planejado: 'Planejada', confirmado: 'Confirmada', em_andamento: 'Em andamento',
  concluido: 'Concluída', cancelado: 'Cancelada', substituido: 'Substituída',
});
const ALLOCATION_STATUS_TONES = buildLookup({
  planejado: 'info', confirmado: 'success', em_andamento: 'info',
  concluido: 'success', cancelado: 'danger', substituido: 'warning',
});
export function allocationStatusLabel(value) { return labelFrom(ALLOCATION_STATUS_LABELS, value); }
export function allocationStatusTone(value) { return toneFrom(ALLOCATION_STATUS_TONES, value); }

/** `ops_dimensioning_status` (migração 070). */
const DIMENSIONING_STATUS_LABELS = buildLookup({
  rascunho: 'Rascunho', aprovado: 'Aprovado', em_execucao: 'Em execução',
  concluido: 'Concluído', arquivado: 'Arquivado',
});
const DIMENSIONING_STATUS_TONES = buildLookup({
  rascunho: 'neutral', aprovado: 'success', em_execucao: 'info',
  concluido: 'success', arquivado: 'neutral',
});
export function dimensioningStatusLabel(value) { return labelFrom(DIMENSIONING_STATUS_LABELS, value); }
export function dimensioningStatusTone(value) { return toneFrom(DIMENSIONING_STATUS_TONES, value); }

/** `ops_coverage_gap_status` (migração 070). */
const COVERAGE_GAP_STATUS_LABELS = buildLookup({
  aberto: 'Aberta', em_tratamento: 'Em tratamento', resolvido: 'Resolvida', cancelado: 'Cancelada',
});
const COVERAGE_GAP_STATUS_TONES = buildLookup({
  aberto: 'warning', em_tratamento: 'info', resolvido: 'success', cancelado: 'neutral',
});
export function coverageGapStatusLabel(value) { return labelFrom(COVERAGE_GAP_STATUS_LABELS, value); }
export function coverageGapStatusTone(value) { return toneFrom(COVERAGE_GAP_STATUS_TONES, value); }

/** `ops_schedule_status` (migração 070). */
const SCHEDULE_VERSION_STATUS_LABELS = buildLookup({
  rascunho: 'Rascunho', em_revisao: 'Em revisão', publicada: 'Publicada',
  revisada: 'Revisada', arquivada: 'Arquivada', cancelada: 'Cancelada',
});
const SCHEDULE_VERSION_STATUS_TONES = buildLookup({
  rascunho: 'neutral', em_revisao: 'warning', publicada: 'success',
  revisada: 'success', arquivada: 'neutral', cancelada: 'danger',
});
export function scheduleVersionStatusLabel(value) { return labelFrom(SCHEDULE_VERSION_STATUS_LABELS, value); }
export function scheduleVersionStatusTone(value) { return toneFrom(SCHEDULE_VERSION_STATUS_TONES, value); }

/** `ops_coverage_request_status` (migração 071). */
const COVERAGE_REQUEST_STATUS_LABELS = buildLookup({
  aberto: 'Aberta', em_busca: 'Em busca de substituto', candidato_encontrado: 'Candidato encontrado',
  aprovado: 'Aprovada', resolvido: 'Resolvida', cancelado: 'Cancelada',
});
const COVERAGE_REQUEST_STATUS_TONES = buildLookup({
  aberto: 'warning', em_busca: 'warning', candidato_encontrado: 'info',
  aprovado: 'info', resolvido: 'success', cancelado: 'neutral',
});
export function coverageRequestStatusLabel(value) { return labelFrom(COVERAGE_REQUEST_STATUS_LABELS, value); }
export function coverageRequestStatusTone(value) { return toneFrom(COVERAGE_REQUEST_STATUS_TONES, value); }

/** `ops_handover_status` (migração 071). */
const HANDOVER_STATUS_LABELS = buildLookup({
  pendente: 'Pendente', em_andamento: 'Em andamento', aceito: 'Aceita', recusado: 'Recusada',
  encerrado: 'Encerrada', cancelado: 'Cancelada', escalonado: 'Escalada',
});
const HANDOVER_STATUS_TONES = buildLookup({
  pendente: 'warning', em_andamento: 'info', aceito: 'success', recusado: 'danger',
  encerrado: 'success', cancelado: 'neutral', escalonado: 'warning',
});
export function handoverStatusLabel(value) { return labelFrom(HANDOVER_STATUS_LABELS, value); }
export function handoverStatusTone(value) { return toneFrom(HANDOVER_STATUS_TONES, value); }

/** `ops_occurrence_status` (migração 071). */
const OCCURRENCE_STATUS_LABELS = buildLookup({
  aberto: 'Aberta', em_analise: 'Em análise', em_tratamento: 'Em tratamento',
  resolvido: 'Resolvida', encerrado: 'Encerrada', cancelado: 'Cancelada', retificado: 'Retificada',
});
const OCCURRENCE_STATUS_TONES = buildLookup({
  aberto: 'warning', em_analise: 'warning', em_tratamento: 'info',
  resolvido: 'success', encerrado: 'success', cancelado: 'neutral', retificado: 'info',
});
export function occurrenceStatusLabel(value) { return labelFrom(OCCURRENCE_STATUS_LABELS, value); }
export function occurrenceStatusTone(value) { return toneFrom(OCCURRENCE_STATUS_TONES, value); }

/** `ops_occurrence_severity` (migração 071), reaproveitada em limpeza/monitoramento. */
const SEVERITY_LABELS = buildLookup({
  info: 'Informativa', baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica',
});
const SEVERITY_TONES = buildLookup({
  info: 'neutral', baixa: 'neutral', media: 'info', alta: 'warning', critica: 'danger',
});
export function severityLabel(value) { return labelFrom(SEVERITY_LABELS, value); }
export function severityTone(value) { return toneFrom(SEVERITY_TONES, value); }

/** `ops_checklist_instance_status` (migração 071). */
const CHECKLIST_INSTANCE_STATUS_LABELS = buildLookup({
  pendente: 'Pendente', em_andamento: 'Em andamento', concluido: 'Concluído',
  cancelado: 'Cancelado', nao_aplicavel: 'Não aplicável',
});
const CHECKLIST_INSTANCE_STATUS_TONES = buildLookup({
  pendente: 'warning', em_andamento: 'info', concluido: 'success',
  cancelado: 'neutral', nao_aplicavel: 'neutral',
});
export function checklistInstanceStatusLabel(value) { return labelFrom(CHECKLIST_INSTANCE_STATUS_LABELS, value); }
export function checklistInstanceStatusTone(value) { return toneFrom(CHECKLIST_INSTANCE_STATUS_TONES, value); }

/** `ops_post_type` (migração 070). */
const POST_TYPE_LABELS = buildLookup({
  portaria: 'Portaria', vigilancia: 'Vigilância', limpeza: 'Limpeza', zeladoria: 'Zeladoria',
  recepcao: 'Recepção', monitoramento: 'Monitoramento', manutencao: 'Manutenção', outro: 'Outro',
});
export function postTypeLabel(value) { return labelFrom(POST_TYPE_LABELS, value); }

/** `ops_job_role_type` (migração 070). */
const JOB_ROLE_TYPE_LABELS = buildLookup({ cargo: 'Cargo', funcao: 'Função' });
export function jobRoleTypeLabel(value) { return labelFrom(JOB_ROLE_TYPE_LABELS, value); }

/** Dia da semana de `ops_post_shift_needs.day_of_week` (convenção `getDay`: 0=domingo). */
const WEEKDAY_LABELS = Object.freeze(['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']);
export function weekdayLabel(value) {
  if (value === null || value === undefined || value === '') return 'Sem dia específico';
  const index = Number(value);
  return Number.isInteger(index) && WEEKDAY_LABELS[index] ? WEEKDAY_LABELS[index] : String(value);
}

/** Situação genérica ativo/inativo usada por posto, cargo e necessidade de turno. */
export function activeLabel(value) { return value ? 'Ativo' : 'Inativo'; }
export function activeTone(value) { return value ? 'success' : 'neutral'; }
