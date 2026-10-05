// UX-06: vocabulário de apresentação dos portais do funcionário e do cliente.
//
// Mesma regra das camadas de CRM (UX-03B), RH (UX-04) e painel do Marcelo
// (UX-05): os VALORES são canônicos e continuam saindo exatamente como
// `src/server/employee-api.mjs`, `src/server/client-space-api.mjs` e
// `src/server/client-access-api.mjs` esperam. Só o RÓTULO exibido muda para
// português de negócio.
//
// Esta camada NÃO decide sessão, NÃO decide vínculo, NÃO decide concessão e
// NÃO altera isolamento por conta. Autenticação, escopo por conta, grants,
// idempotência e auditoria continuam sendo decididos no servidor; aqui apenas
// explicamos, em português, a resposta que chegou.
//
// O defeito central que esta camada existe para impedir: nos dois portais, uma
// FALHA de leitura era apresentada como AUSÊNCIA de dado. No portal do
// funcionário, qualquer erro em `/api/employee/session` ou `/api/employee/home`
// devolvia a tela de login, como se a pessoa não estivesse autenticada. Na área
// do cliente, uma falha ao ler `/api/client/accounts` deixava a lista vazia e a
// tela dizia "sua identidade ainda não está vinculada a um cadastro" — uma
// afirmação de negócio inventada a partir de um erro de rede.

/**
 * Mensagens para os códigos que os servidores dos portais realmente devolvem.
 * O título é humano; o código canônico só aparece no rodapé, entre parênteses.
 */
const ERROR_MESSAGES = Object.freeze({
  // ----- Sessão e identidade -------------------------------------------------
  employee_session_required: {
    kind: 'auth',
    title: 'Entre com a sua identidade individual',
    detail: 'Esta área exige a sua sessão de funcionário. Nada foi carregado e nenhuma ação foi registrada.',
  },
  client_session_required: {
    kind: 'auth',
    title: 'Entre na sua conta de cliente',
    detail: 'Sua sessão expirou ou não foi reconhecida. Entre novamente para continuar.',
  },
  admin_session_required: {
    kind: 'auth',
    title: 'Esta ação exige uma sessão de equipe',
    detail: 'O pedido chegou sem uma sessão de equipe válida. Nada foi carregado nem gravado.',
  },
  individual_staff_required: {
    kind: 'denied',
    title: 'Esta ação exige identidade individual',
    detail: 'Credencial compartilhada não serve aqui: a trilha de auditoria precisa saber quem agiu.',
  },
  individual_ti_required: {
    kind: 'denied',
    title: 'Esta ação exige um TI com identidade individual',
    detail: 'A operação não foi executada. Entre com a sua própria identidade de TI.',
  },
  invalid_credentials: {
    kind: 'invalid',
    title: 'E-mail ou senha não conferem',
    detail: 'Confira os dados e tente de novo. Por segurança, não dizemos qual dos dois está errado.',
  },
  current_password_invalid: {
    kind: 'invalid',
    title: 'A senha atual não confere',
    detail: 'A troca não foi feita. Digite a senha que você usa hoje.',
  },
  password_policy: {
    kind: 'invalid',
    title: 'A nova senha não atende à política',
    detail: 'Use ao menos 12 caracteres, sem repetir a senha anterior. Nada foi alterado.',
  },
  password_change_unavailable: {
    kind: 'retry',
    title: 'Não foi possível trocar a senha agora',
    detail: 'O servidor não confirmou a troca. Sua senha atual continua valendo.',
  },
  too_many_attempts: {
    kind: 'denied',
    title: 'Muitas tentativas seguidas',
    detail: 'O acesso foi limitado por um período, por segurança. Espere alguns minutos antes de tentar de novo.',
  },
  temporarily_limited: {
    kind: 'denied',
    title: 'Acesso temporariamente limitado',
    detail: 'Houve tentativas demais a partir deste ponto. Espere alguns minutos antes de repetir.',
  },
  employee_auth_unavailable: {
    kind: 'retry',
    title: 'Não foi possível validar o acesso agora',
    detail: 'A verificação de acesso não respondeu. Isto não significa que a sua senha esteja errada.',
  },
  employee_access_inactive: {
    kind: 'denied',
    title: 'Seu acesso está inativo',
    detail: 'A conta existe, mas o acesso foi suspenso. Procure o RH para reativar.',
  },
  employee_status_blocks_access: {
    kind: 'denied',
    title: 'Sua situação cadastral impede o acesso',
    detail: 'O cadastro laboral está em uma situação que bloqueia o portal. Procure o RH.',
  },
  employee_access_unavailable: {
    kind: 'retry',
    title: 'Não foi possível consultar o seu acesso',
    detail: 'A leitura do cadastro de acesso falhou. Tente novamente em instantes.',
  },
  employee_access_already_exists: {
    kind: 'conflict',
    title: 'Esta pessoa já tem acesso criado',
    detail: 'Nada foi duplicado. Consulte o acesso existente antes de criar outro.',
  },
  email_or_access_already_exists: {
    kind: 'conflict',
    title: 'Este e-mail já está em uso',
    detail: 'Já existe uma identidade com este endereço. Nada foi criado.',
  },
  identity_exists: {
    kind: 'conflict',
    title: 'Esta identidade já existe',
    detail: 'Nada foi criado. Use o acesso existente ou peça a recuperação de senha.',
  },
  mfa_code_invalid: {
    kind: 'invalid',
    title: 'Código de verificação inválido',
    detail: 'O código não confere ou expirou. Gere um novo no seu aplicativo autenticador.',
  },
  mfa_challenge_invalid: {
    kind: 'invalid',
    title: 'A verificação em duas etapas expirou',
    detail: 'Comece o acesso de novo para receber um novo desafio.',
  },
  mfa_login_unavailable: {
    kind: 'retry',
    title: 'A verificação em duas etapas não respondeu',
    detail: 'Nada foi concluído. Tente entrar novamente em instantes.',
  },
  reset_link_invalid: {
    kind: 'invalid',
    title: 'Este link de redefinição não vale mais',
    detail: 'O link expirou ou já foi usado. Peça um novo à equipe.',
  },
  confirmation_link_invalid: {
    kind: 'invalid',
    title: 'Este link de confirmação não vale mais',
    detail: 'O link expirou ou já foi usado. Peça uma nova confirmação à equipe.',
  },
  invite_not_found: {
    kind: 'invalid',
    title: 'Convite não encontrado',
    detail: 'O convite não existe mais. Peça um novo à equipe.',
  },
  invite_already_used: {
    kind: 'conflict',
    title: 'Este convite já foi usado',
    detail: 'Entre com a identidade que ele criou, ou peça um novo convite.',
  },
  accepted_invite_required: {
    kind: 'invalid',
    title: 'É preciso aceitar o convite antes',
    detail: 'O vínculo só é criado depois do aceite. Nada foi alterado.',
  },
  invalid_invite_id: {
    kind: 'invalid',
    title: 'Convite inválido',
    detail: 'O identificador do convite não tem o formato aceito.',
  },
  verification_not_pending: {
    kind: 'conflict',
    title: 'Não há verificação pendente',
    detail: 'Esta identidade já foi verificada, ou nunca entrou na fila. Recarregue para ver o estado atual.',
  },
  manual_verification_disabled_with_smtp: {
    kind: 'denied',
    title: 'A verificação manual está desligada',
    detail: 'Com o envio de e-mail ativo, a confirmação é feita por link. Nada foi alterado.',
  },
  manual_review_fields_required: {
    kind: 'invalid',
    title: 'Faltam dados da conferência manual',
    detail: 'Informe quem conferiu e como a identidade foi confirmada. Nada foi gravado.',
  },
  mode_inactive: {
    kind: 'denied',
    title: 'Este modo de acesso está desativado',
    detail: 'A operação não foi executada. A configuração atual do servidor não permite este caminho.',
  },
  demo_synthetic_address_required: {
    kind: 'invalid',
    title: 'Use um endereço sintético nesta demonstração',
    detail: 'O ambiente de demonstração recusa endereços reais, de propósito. Nada foi criado.',
  },

  // ----- Permissão e escopo --------------------------------------------------
  forbidden: {
    kind: 'denied',
    title: 'Acesso negado para esta sessão',
    detail: 'Seu vínculo não alcança este conteúdo. Nada foi carregado e nada é exibido no lugar.',
  },
  permission_scope_denied: {
    kind: 'denied',
    title: 'Sem a concessão necessária',
    detail: 'Seu papel aparece no menu, mas a concessão específica não foi dada. Peça a liberação a quem administra acessos.',
  },
  compensation_permission_required: {
    kind: 'denied',
    title: 'Remuneração exige concessão própria',
    detail: 'Documentos de folha e informe de rendimentos dependem de uma concessão separada. Nada foi exibido nem gravado.',
  },
  organization_scope_required_for_list: {
    kind: 'denied',
    title: 'Sua concessão não alcança a lista inteira',
    detail: 'Você tem acesso pontual, não ao conjunto. A listagem completa exige concessão de organização.',
  },
  field_not_editable: {
    kind: 'denied',
    title: 'Este campo não pode ser alterado por aqui',
    detail: 'A alteração não foi gravada. Peça a correção ao RH, que registra o histórico.',
  },
  anonymous_not_supported: {
    kind: 'invalid',
    title: 'Este canal não aceita relato anônimo',
    detail: 'Para este tipo de registro é preciso identificar-se. Nada foi enviado.',
  },
  same_origin_required: {
    kind: 'invalid',
    title: 'Requisição recusada por proteção de origem',
    detail: 'Recarregue a página e repita a ação.',
  },
  method_not_allowed: {
    kind: 'invalid',
    title: 'Operação não permitida nesta rota',
    detail: 'Recarregue a página; a ação enviada não corresponde a nenhuma operação do portal.',
  },

  // ----- Conta e vínculo do cliente -----------------------------------------
  account_not_found: {
    kind: 'denied',
    title: 'Conta não encontrada no seu vínculo',
    detail: 'Esta conta não está vinculada à sua identidade. Nada foi exibido.',
  },
  account_status_invalid: {
    kind: 'denied',
    title: 'A situação desta conta impede a consulta',
    detail: 'Contas suspensas ou encerradas não exibem dados protegidos. Fale com a equipe para regularizar.',
  },
  grant_exists: {
    kind: 'conflict',
    title: 'Este vínculo já existe',
    detail: 'Nada foi duplicado. Consulte o vínculo existente.',
  },
  grant_not_found: {
    kind: 'invalid',
    title: 'Vínculo não encontrado',
    detail: 'O vínculo informado não existe mais. Recarregue para ver o estado atual.',
  },
  scope_note_too_long: {
    kind: 'invalid',
    title: 'A observação de escopo é longa demais',
    detail: 'Reduza o texto e envie de novo. Nada foi gravado.',
  },
  invalid_identity: {
    kind: 'invalid',
    title: 'Identidade inválida',
    detail: 'A identidade informada não foi aceita pelo servidor.',
  },
  invalid_display_name: {
    kind: 'invalid',
    title: 'Nome de exibição inválido',
    detail: 'Escreva um nome legível. Nada foi gravado.',
  },

  // ----- Contratos, documentos, relatórios e visitas -------------------------
  contract_not_found: {
    kind: 'invalid',
    title: 'Contrato não encontrado',
    detail: 'Este contrato não existe no seu vínculo. Volte à lista e escolha outro.',
  },
  contract_account_mismatch: {
    kind: 'denied',
    title: 'Este contrato é de outra conta',
    detail: 'O isolamento por conta impediu a leitura. Nada foi exibido.',
  },
  contract_status_invalid: {
    kind: 'conflict',
    title: 'A situação do contrato não permite esta ação',
    detail: 'Recarregue para ver a situação atual antes de repetir.',
  },
  contract_service_unknown: {
    kind: 'invalid',
    title: 'Serviço não previsto neste contrato',
    detail: 'Escolha um serviço que conste do contrato. Nada foi solicitado.',
  },
  document_not_found: {
    kind: 'invalid',
    title: 'Documento não encontrado',
    detail: 'O documento não existe ou saiu do seu escopo. Recarregue a lista.',
  },
  document_unavailable: {
    kind: 'retry',
    title: 'Não foi possível abrir o documento agora',
    detail: 'A leitura do arquivo falhou. Isto não significa que o documento não exista.',
  },
  document_file_missing: {
    kind: 'error',
    title: 'O arquivo deste documento não está mais no servidor',
    detail: 'O registro existe, mas o arquivo não foi localizado. Avise a equipe: isto é uma falha a corrigir, não um documento inexistente.',
  },
  document_integrity_failed: {
    kind: 'error',
    title: 'O arquivo não passou na conferência de integridade',
    detail: 'O download foi interrompido de propósito. Nada foi entregue pela metade; avise a equipe.',
  },
  document_empty: {
    kind: 'invalid',
    title: 'O arquivo enviado está vazio',
    detail: 'Escolha um arquivo com conteúdo. Nada foi enviado.',
  },
  document_too_large: {
    kind: 'invalid',
    title: 'O arquivo excede o tamanho aceito',
    detail: 'Reduza o arquivo e envie de novo. Nada foi gravado.',
  },
  document_content_invalid: {
    kind: 'invalid',
    title: 'O conteúdo do arquivo não foi aceito',
    detail: 'O formato não corresponde ao declarado. Nada foi enviado.',
  },
  authorized_source_required: {
    kind: 'denied',
    title: 'Publicar exige uma fonte autorizada',
    detail: 'O documento não veio de uma fonte marcada como autorizada, então não pode ser publicado ao titular. Nada foi publicado.',
  },
  report_not_found: {
    kind: 'invalid',
    title: 'Relatório não encontrado',
    detail: 'O relatório não existe no seu escopo. Recarregue a lista.',
  },
  report_not_published: {
    kind: 'denied',
    title: 'Este relatório ainda não foi publicado',
    detail: 'Enquanto não houver publicação, o conteúdo não é exibido. Isto não é uma falha.',
  },
  report_review_required: {
    kind: 'conflict',
    title: 'O relatório precisa passar por revisão antes',
    detail: 'A etapa de revisão não foi concluída. Nada foi publicado.',
  },
  report_approval_required: {
    kind: 'conflict',
    title: 'O relatório precisa de aprovação antes',
    detail: 'A aprovação não foi registrada. Nada foi publicado.',
  },
  report_status_invalid: {
    kind: 'conflict',
    title: 'A situação do relatório não permite esta ação',
    detail: 'Recarregue para ver a situação atual antes de repetir.',
  },
  report_fields_required: {
    kind: 'invalid',
    title: 'Faltam campos obrigatórios do relatório',
    detail: 'Preencha os campos destacados. Nada foi gravado.',
  },
  visit_not_found: {
    kind: 'invalid',
    title: 'Visita não encontrada',
    detail: 'A visita não existe no seu escopo. Recarregue a agenda.',
  },
  visit_account_mismatch: {
    kind: 'denied',
    title: 'Esta visita é de outra conta',
    detail: 'O isolamento por conta impediu a leitura. Nada foi exibido.',
  },
  visit_status_invalid: {
    kind: 'conflict',
    title: 'A situação da visita não permite esta ação',
    detail: 'Recarregue a agenda antes de repetir.',
  },
  visit_final_status: {
    kind: 'conflict',
    title: 'Esta visita já foi encerrada',
    detail: 'Visitas encerradas não aceitam novas decisões. Nada foi alterado.',
  },
  client_visit_action_not_allowed: {
    kind: 'denied',
    title: 'Esta decisão de visita não cabe ao cliente',
    detail: 'A ação é da equipe de operação. Nada foi alterado.',
  },
  client_acknowledgement_required: {
    kind: 'invalid',
    title: 'É preciso confirmar a ciência antes',
    detail: 'Marque a confirmação para seguir. Nada foi enviado.',
  },

  // ----- Chamados e solicitações --------------------------------------------
  ticket_not_found: {
    kind: 'invalid',
    title: 'Chamado não encontrado',
    detail: 'O chamado não existe no seu escopo. Recarregue a lista.',
  },
  ticket_account_mismatch: {
    kind: 'denied',
    title: 'Este chamado é de outra conta',
    detail: 'O isolamento por conta impediu a leitura. Nada foi exibido.',
  },
  ticket_fields_required: {
    kind: 'invalid',
    title: 'Faltam campos obrigatórios do chamado',
    detail: 'Preencha assunto e descrição. Nada foi aberto.',
  },
  ticket_message_invalid: {
    kind: 'invalid',
    title: 'A mensagem do chamado não foi aceita',
    detail: 'Escreva uma mensagem com conteúdo suficiente. Nada foi enviado.',
  },
  ticket_transition_not_allowed: {
    kind: 'conflict',
    title: 'Esta mudança de situação não é permitida',
    detail: 'O chamado está em uma situação que não aceita esta transição. Nada foi alterado.',
  },
  ticket_accept_requires_resolved: {
    kind: 'conflict',
    title: 'Só dá para aceitar um chamado já resolvido',
    detail: 'Aguarde a resolução antes de registrar o aceite. Nada foi alterado.',
  },
  ticket_reopen_only_resolved_or_closed: {
    kind: 'conflict',
    title: 'Só dá para reabrir chamado resolvido ou encerrado',
    detail: 'O chamado ainda está em andamento. Nada foi alterado.',
  },
  invalid_ticket_action: {
    kind: 'invalid',
    title: 'Ação de chamado desconhecida',
    detail: 'Recarregue a página: a ação enviada não existe no servidor.',
  },
  legacy_cli_ticket_write_retired: {
    kind: 'denied',
    title: 'Este caminho antigo de chamado foi aposentado',
    detail: 'Use a tela atual de chamados. Nada foi gravado pelo caminho antigo.',
  },
  request_not_found: {
    kind: 'invalid',
    title: 'Solicitação não encontrada',
    detail: 'A solicitação não existe mais no seu escopo. Recarregue a lista.',
  },
  request_fields_required: {
    kind: 'invalid',
    title: 'Faltam campos obrigatórios da solicitação',
    detail: 'Preencha título e descrição. Nada foi enviado.',
  },
  employee_request_unavailable: {
    kind: 'retry',
    title: 'Não foi possível registrar a solicitação agora',
    detail: 'O servidor não confirmou a gravação. Nada foi dado como enviado.',
  },
  employee_request_review_unavailable: {
    kind: 'retry',
    title: 'Não foi possível registrar a análise agora',
    detail: 'O servidor não confirmou a gravação. A solicitação continua como estava.',
  },
  review_message_required: {
    kind: 'invalid',
    title: 'O retorno à pessoa é obrigatório',
    detail: 'Escreva o retorno que a pessoa vai ler. Nada foi gravado.',
  },
  review_transition_not_allowed: {
    kind: 'conflict',
    title: 'Esta mudança de situação não é permitida',
    detail: 'A solicitação está em uma situação que não aceita esta transição. Nada foi alterado.',
  },
  invalid_review_action: {
    kind: 'invalid',
    title: 'Ação de análise desconhecida',
    detail: 'Recarregue a página: a ação enviada não existe no servidor.',
  },
  rejection_reason_required: {
    kind: 'invalid',
    title: 'Rejeitar exige um motivo',
    detail: 'Escreva o motivo que ficará registrado. Nada foi gravado.',
  },
  reason_required: {
    kind: 'invalid',
    title: 'O motivo é obrigatório',
    detail: 'Escreva o motivo da solicitação. Nada foi enviado.',
  },
  reason_details_required: {
    kind: 'invalid',
    title: 'Detalhe o motivo escolhido',
    detail: 'Para este motivo o servidor exige uma explicação. Nada foi enviado.',
  },
  message_fields_required: {
    kind: 'invalid',
    title: 'Faltam campos da mensagem',
    detail: 'Preencha a mensagem antes de enviar. Nada foi registrado.',
  },
  ticket_or_message_missing: {
    kind: 'invalid',
    title: 'Faltam dados para registrar a mensagem',
    detail: 'Recarregue a página e tente de novo. Nada foi registrado.',
  },

  // ----- Jornada, plantões e operação do funcionário -------------------------
  schedule_entry_not_found: {
    kind: 'invalid',
    title: 'Turno não encontrado',
    detail: 'O turno saiu da escala publicada. Recarregue a sua jornada.',
  },
  time_entry_not_found: {
    kind: 'invalid',
    title: 'Registro de ponto não encontrado',
    detail: 'O registro não existe mais. Recarregue a sua jornada.',
  },
  invalid_time_correction: {
    kind: 'invalid',
    title: 'Correção de ponto inválida',
    detail: 'Informe o horário correto e o motivo. Nada foi enviado.',
  },
  swap_not_found: {
    kind: 'invalid',
    title: 'Pedido de troca não encontrado',
    detail: 'A troca não existe mais. Recarregue a lista.',
  },
  swap_fields_required: {
    kind: 'invalid',
    title: 'Faltam dados da troca de plantão',
    detail: 'Informe colega, data e motivo. Nada foi solicitado.',
  },
  invalid_swap_response: {
    kind: 'invalid',
    title: 'Resposta de troca desconhecida',
    detail: 'Recarregue a página: a resposta enviada não existe no servidor.',
  },
  eligible_target_not_found: {
    kind: 'invalid',
    title: 'Colega não elegível para esta troca',
    detail: 'A pessoa indicada não pode assumir este plantão. Nada foi solicitado.',
  },
  handover_not_found: {
    kind: 'invalid',
    title: 'Passagem de serviço não encontrada',
    detail: 'O registro não existe mais. Recarregue a lista.',
  },
  handover_target_required: {
    kind: 'invalid',
    title: 'Informe quem recebe a passagem',
    detail: 'A passagem de serviço precisa de um destinatário. Nada foi registrado.',
  },
  invalid_handover_response: {
    kind: 'invalid',
    title: 'Resposta de passagem desconhecida',
    detail: 'Recarregue a página: a resposta enviada não existe no servidor.',
  },
  occurrence_fields_required: {
    kind: 'invalid',
    title: 'Faltam campos da ocorrência',
    detail: 'Preencha título e descrição do que aconteceu. Nada foi registrado.',
  },
  procedure_not_found: {
    kind: 'invalid',
    title: 'Procedimento não encontrado',
    detail: 'O procedimento saiu da lista do posto. Recarregue a página.',
  },
  communication_not_found: {
    kind: 'invalid',
    title: 'Comunicado não encontrado',
    detail: 'O comunicado não existe mais. Recarregue a página.',
  },
  enrollment_not_found: {
    kind: 'invalid',
    title: 'Matrícula de curso não encontrada',
    detail: 'A matrícula não existe mais. Recarregue a lista de cursos.',
  },
  uniform_delivery_not_found: {
    kind: 'invalid',
    title: 'Entrega de uniforme não encontrada',
    detail: 'A entrega não existe mais. Recarregue a lista.',
  },
  employee_not_found: {
    kind: 'invalid',
    title: 'Cadastro de funcionário não encontrado',
    detail: 'O cadastro não existe no seu escopo. Recarregue a lista.',
  },
  invalid_changes: {
    kind: 'invalid',
    title: 'Nenhuma alteração válida foi enviada',
    detail: 'Revise os campos. Nada foi gravado.',
  },
  invalid_offline_task: {
    kind: 'invalid',
    title: 'Tarefa offline não reconhecida',
    detail: 'O servidor recusou a tarefa guardada neste aparelho. Ela continua pendente aqui e não foi perdida.',
  },
  action_not_found: {
    kind: 'invalid',
    title: 'Ação desconhecida',
    detail: 'Recarregue a página: a ação enviada não existe no servidor.',
  },

  // ----- Idempotência e repetição -------------------------------------------
  idempotency_key_required: {
    kind: 'invalid',
    title: 'Falta a chave que impede o envio duplicado',
    detail: 'Recarregue a página para gerar uma nova chave. Nada foi gravado.',
  },
  idempotency_key_required_or_invalid: {
    kind: 'invalid',
    title: 'A chave que impede o envio duplicado está ausente ou inválida',
    detail: 'Recarregue a página para gerar uma nova. Nada foi gravado.',
  },
  idempotency_key_reused: {
    kind: 'conflict',
    title: 'Esta chave já identificou uma ação anterior',
    detail: 'Nada foi gravado duas vezes. Recarregue a página para ver o resultado da primeira vez.',
  },
  idempotency_conflict: {
    kind: 'conflict',
    title: 'A mesma chave foi reaproveitada com dados diferentes',
    detail: 'Nada foi gravado. Recarregue a página antes de repetir a ação.',
  },
  idempotency_key_unavailable: {
    kind: 'retry',
    title: 'Não foi possível registrar a chave de repetição',
    detail: 'A proteção contra envio duplicado não respondeu, então nada foi gravado, de propósito.',
  },

  // ----- Falhas de leitura e de servidor -------------------------------------
  employee_home_unavailable: {
    kind: 'retry',
    title: 'Não foi possível carregar o seu portal agora',
    detail: 'A leitura falhou. Isto NÃO significa que você não tenha plantão, documento ou pedido: nada foi lido.',
  },
  employee_api_error: {
    kind: 'retry',
    title: 'Falha no servidor do portal',
    detail: 'O servidor respondeu com erro e nada foi carregado nem gravado. Isto não é a mesma coisa que não haver registros.',
  },
  not_found: {
    kind: 'invalid',
    title: 'Registro não encontrado',
    detail: 'O endereço não corresponde a nada que você possa ver. Volte e tente pela lista.',
  },
  invalid_request: {
    kind: 'invalid',
    title: 'O servidor recusou os dados enviados',
    detail: 'Revise os campos destacados e tente novamente. Nada foi gravado.',
  },
  invalid_status: {
    kind: 'invalid',
    title: 'Situação inválida',
    detail: 'A situação enviada não existe no catálogo do servidor.',
  },
  invalid_status_filter: {
    kind: 'invalid',
    title: 'Filtro de situação inválido',
    detail: 'Escolha uma das situações oferecidas pela tela.',
  },
  invalid_email: {
    kind: 'invalid',
    title: 'E-mail inválido',
    detail: 'Escreva um endereço de e-mail válido.',
  },

  // ----- Identificadores -----------------------------------------------------
  invalid_uuid: { kind: 'invalid', title: 'Identificador inválido', detail: 'O identificador enviado não tem o formato aceito.' },
  invalid_account_id: { kind: 'invalid', title: 'Conta inválida', detail: 'O identificador da conta não tem o formato aceito.' },
  invalid_contract_id: { kind: 'invalid', title: 'Contrato inválido', detail: 'O identificador do contrato não tem o formato aceito.' },
  invalid_document_id: { kind: 'invalid', title: 'Documento inválido', detail: 'O identificador do documento não tem o formato aceito.' },
  invalid_report_id: { kind: 'invalid', title: 'Relatório inválido', detail: 'O identificador do relatório não tem o formato aceito.' },
  invalid_ticket_id: { kind: 'invalid', title: 'Chamado inválido', detail: 'O identificador do chamado não tem o formato aceito.' },
  invalid_visit_id: { kind: 'invalid', title: 'Visita inválida', detail: 'O identificador da visita não tem o formato aceito.' },
  invalid_grant_id: { kind: 'invalid', title: 'Vínculo inválido', detail: 'O identificador do vínculo não tem o formato aceito.' },
  invalid_identity_id: { kind: 'invalid', title: 'Identidade inválida', detail: 'O identificador da identidade não tem o formato aceito.' },
  invalid_employee_id: { kind: 'invalid', title: 'Cadastro inválido', detail: 'O identificador do funcionário não tem o formato aceito.' },
  invalid_request_id: { kind: 'invalid', title: 'Solicitação inválida', detail: 'O identificador da solicitação não tem o formato aceito.' },
  invalid_communication_id: { kind: 'invalid', title: 'Comunicado inválido', detail: 'O identificador do comunicado não tem o formato aceito.' },
  invalid_procedure_id: { kind: 'invalid', title: 'Procedimento inválido', detail: 'O identificador do procedimento não tem o formato aceito.' },
  invalid_enrollment_id: { kind: 'invalid', title: 'Matrícula inválida', detail: 'O identificador da matrícula não tem o formato aceito.' },
  invalid_delivery_id: { kind: 'invalid', title: 'Entrega inválida', detail: 'O identificador da entrega não tem o formato aceito.' },
  invalid_entry_id: { kind: 'invalid', title: 'Registro inválido', detail: 'O identificador do registro não tem o formato aceito.' },

  internal: {
    kind: 'retry',
    title: 'Falha no servidor',
    detail: 'O servidor respondeu com erro e nada foi carregado nem gravado. Isto não é a mesma coisa que não haver registros.',
  },
});

/**
 * Classifica uma falha de portal sem suavizar o significado.
 * @param {string|null|undefined} code código canônico, quando houver
 * @param {number} status status HTTP (0 quando a requisição nem chegou)
 */
export function describePortalError(code, status = 0) {
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
  if (status === 401) return { ...ERROR_MESSAGES.client_session_required, code: code || null, status, canRetry: true };
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

/**
 * Variante visual de `UiState` correspondente à falha classificada.
 * Importante: `auth` NÃO vira "denied" aqui — uma sessão expirada é um convite
 * a entrar de novo, não uma recusa de permissão.
 */
export function portalErrorVariant(descriptor) {
  return descriptor && descriptor.kind === 'denied' ? 'denied' : 'error';
}

/**
 * Frase pronta para o rodapé de uma falha, declarando a resposta real do
 * servidor. O código canônico fica disponível para diagnóstico, entre
 * parênteses — nunca como a mensagem principal.
 */
export function portalErrorFootnote(descriptor) {
  if (!descriptor) return '';
  const resposta = descriptor.status ? `HTTP ${descriptor.status}` : 'sem resposta';
  return `Resposta do servidor: ${resposta}${descriptor.code ? ` (${descriptor.code})` : ''}.`;
}

/**
 * Uma falha de sessão (401) é a ÚNICA que autoriza a interface a mostrar a tela
 * de entrada. Qualquer outra falha precisa continuar dizendo que é falha: o
 * defeito que esta função tranca é o portal do funcionário devolver o login
 * quando o que houve foi um 503 de leitura.
 */
export function portalShouldSignIn(descriptor) {
  return Boolean(descriptor) && descriptor.kind === 'auth' && descriptor.status === 401;
}

// ---------------------------------------------------------------------------
// Rótulos. Os VALORES continuam canônicos; valor desconhecido passa cru.
// ---------------------------------------------------------------------------

/** Situação da conta de cliente, como `client-space-api` a devolve. */
const ACCOUNT_STATUS_LABELS = Object.freeze({
  active: 'Ativa', suspended: 'Suspensa', closed: 'Encerrada',
});

export function accountStatusLabel(value) {
  if (value === null || value === undefined || value === '') return '—';
  const key = String(value).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(ACCOUNT_STATUS_LABELS, key) ? ACCOUNT_STATUS_LABELS[key] : String(value);
}

export function accountStatusTone(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'active') return 'success';
  if (key === 'suspended') return 'warning';
  if (key === 'closed') return 'danger';
  return 'neutral';
}

/** Situação de chamado do cliente. */
const TICKET_STATUS_LABELS = Object.freeze({
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting_client: 'Aguardando você',
  resolved: 'Resolvido',
  closed: 'Encerrado',
  accepted: 'Aceito',
  reopened: 'Reaberto',
});

export function ticketStatusLabel(value) {
  if (value === null || value === undefined || value === '') return '—';
  const key = String(value).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(TICKET_STATUS_LABELS, key) ? TICKET_STATUS_LABELS[key] : String(value);
}

export function ticketStatusTone(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'waiting_client') return 'warning';
  if (key === 'resolved' || key === 'accepted') return 'success';
  if (key === 'closed') return 'neutral';
  if (key === 'open' || key === 'reopened' || key === 'in_progress') return 'info';
  return 'neutral';
}

/** Situação das solicitações e registros do funcionário. */
const EMPLOYEE_ITEM_STATUS_LABELS = Object.freeze({
  pendente: 'Pendente',
  em_analise: 'Em análise',
  aprovada: 'Aprovada',
  aprovado: 'Aprovado',
  rejeitada: 'Rejeitada',
  rejeitado: 'Rejeitado',
  concluida: 'Concluída',
  concluido: 'Concluído',
  cancelada: 'Cancelada',
  aberta: 'Aberta',
  aberto: 'Aberto',
  registrada: 'Registrada',
  submitted: 'Enviado',
  under_review: 'Em revisão',
  approved: 'Aprovado',
  published: 'Publicado',
  rejected: 'Rejeitado',
  superseded: 'Substituído',
});

export function employeeItemStatusLabel(value) {
  if (value === null || value === undefined || value === '') return '—';
  const key = String(value).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(EMPLOYEE_ITEM_STATUS_LABELS, key)
    ? EMPLOYEE_ITEM_STATUS_LABELS[key]
    : String(value);
}

export function employeeItemStatusTone(value) {
  const key = String(value || '').trim().toLowerCase();
  if (['aprovada', 'aprovado', 'approved', 'published', 'concluida', 'concluido'].includes(key)) return 'success';
  if (['rejeitada', 'rejeitado', 'rejected', 'cancelada'].includes(key)) return 'danger';
  if (['em_analise', 'under_review'].includes(key)) return 'warning';
  if (['pendente', 'aberta', 'aberto', 'registrada', 'submitted'].includes(key)) return 'info';
  return 'neutral';
}

/**
 * Tipos de solicitação que o portal do funcionário oferece. Os valores são os
 * que `employee-api` aceita; o rótulo é o que a pessoa lê.
 */
export const EMPLOYEE_REQUEST_TYPES = Object.freeze([
  { value: 'ferias', label: 'Férias' },
  { value: 'beneficio', label: 'Benefício' },
  { value: 'afastamento', label: 'Afastamento' },
  { value: 'reembolso', label: 'Reembolso' },
  { value: 'outro', label: 'Outro assunto' },
]);

/** Gravidade da ocorrência registrada pelo funcionário. */
export const EMPLOYEE_SEVERITIES = Object.freeze([
  { value: 'baixa', label: 'Baixa', tone: 'neutral' },
  { value: 'media', label: 'Média', tone: 'info' },
  { value: 'alta', label: 'Alta', tone: 'warning' },
  { value: 'critica', label: 'Crítica', tone: 'danger' },
]);

/** Categorias de ocorrência aceitas pelo servidor. */
export const EMPLOYEE_OCCURRENCE_CATEGORIES = Object.freeze([
  { value: 'operacional', label: 'Operacional' },
  { value: 'seguranca', label: 'Segurança' },
  { value: 'equipamento', label: 'Equipamento' },
  { value: 'outro', label: 'Outro' },
]);
