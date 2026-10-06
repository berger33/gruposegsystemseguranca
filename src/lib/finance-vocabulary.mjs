// UX-07 (fatia B — Financeiro): vocabulário de apresentação da tela
// `/admin/financeiro` (FinanceiroWorkspace.tsx e as treze áreas FIN-05..FIN-16
// que ela monta) e das APIs que ela consome: `src/server/fin-api.mjs`,
// `fin-advanced-api.mjs`, `fin-budget-api.mjs`, `fin-management-api.mjs`,
// `f03-finance-api.mjs` e `commission-api.mjs`.
//
// Mesma regra das camadas anteriores (CRM em UX-03B, RH em UX-04, painel do
// Marcelo em UX-05, portais em UX-06, Operação em UX-07 fatia A): os VALORES
// continuam canônicos, saindo exatamente como os servidores esperam. Só o
// RÓTULO exibido muda. Valor desconhecido passa cru — nunca é inventada uma
// tradução para um valor que o servidor não devolveu.
//
// Esta camada NÃO decide sessão, NÃO decide concessão, NÃO decide alçada de
// aprovação, NÃO decide idempotência, NÃO calcula margem, cobertura, bucket de
// aging nem saldo. Tudo isso continua no servidor e no banco; aqui só se
// explica, em português, a resposta que já chegou.
//
// O defeito central que esta camada corrige: a tela financeira tratava toda
// falha com `throw new Error(data.error || \`Erro ${status}\`)` e exibia o
// código cru em inglês (`already_generated`, `audit_unavailable`,
// `margin_not_accepted_calculated_server_side`...) como se fosse uma frase.

/**
 * Mensagens para os códigos que os seis servidores financeiros realmente
 * devolvem (319 códigos distintos, levantados lendo os arquivos, incluindo os
 * montados por ternário e por template literal). O título é humano; o código
 * canônico só aparece no rodapé, entre parênteses.
 */
const ERROR_MESSAGES = Object.freeze({
  // ----- Sessão, origem e permissão ------------------------------------------
  unauthorized: {
    kind: 'auth',
    title: 'Esta ação exige uma sessão de equipe',
    detail: 'O pedido chegou sem sessão válida. Nada foi lido nem gravado.',
  },
  admin_session_required: {
    kind: 'auth',
    title: 'Esta ação exige sessão administrativa',
    detail: 'A sessão atual não é uma sessão de equipe válida para o financeiro. Nada foi feito.',
  },
  forbidden: {
    kind: 'denied',
    title: 'Seu papel não tem esta concessão',
    detail: 'O menu pode mostrar esta tela, mas a concessão específica para esta ação não está presente na sua sessão. Nada foi feito.',
  },
  forbidden_origin: {
    kind: 'denied',
    title: 'Origem da requisição recusada',
    detail: 'O servidor só aceita esta gravação a partir da própria aplicação. Nada foi gravado.',
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
  read_only: {
    kind: 'denied',
    title: 'Seu papel abre esta tela apenas para leitura',
    detail: 'TI enxerga o financeiro para diagnóstico, mas não grava. Nada foi alterado.',
  },
  role_required: {
    kind: 'denied',
    title: 'Papel financeiro exigido para esta ação',
    detail: 'O servidor exige um papel habilitado no financeiro. Nada foi feito.',
  },
  permission_scope_denied: {
    kind: 'denied',
    title: 'Fora do escopo concedido à sua sessão',
    detail: 'A sessão tem o papel, mas não o escopo deste registro. Nada foi lido nem gravado.',
  },
  management_role_required: {
    kind: 'denied',
    title: 'Esta decisão exige papel de gestão',
    detail: 'Resultado gerencial e decisões equivalentes são restritos a papéis de gestão. Nada foi gravado.',
  },
  accountant_scope_required: {
    kind: 'denied',
    title: 'Escopo contábil exigido',
    detail: 'Este conteúdo só é liberado para o escopo contábil definido no servidor. Nada foi exposto.',
  },
  accountant_limited_required: {
    kind: 'denied',
    title: 'Acesso contábil limitado exigido',
    detail: 'O servidor exige o perfil contábil limitado para esta leitura. Nada foi exposto.',
  },
  individual_staff_required: {
    kind: 'denied',
    title: 'Esta ação exige identidade individual',
    detail: 'Sessões compartilhadas ou de serviço não podem decidir aqui — a trilha precisa de uma pessoa identificada.',
  },
  requester_cannot_decide: {
    kind: 'denied',
    title: 'Quem solicitou não pode decidir',
    detail: 'A segregação de funções é verificada no servidor: aprovar ou recusar exige outra identidade.',
  },
  only_requester_can_cancel: {
    kind: 'denied',
    title: 'Só quem solicitou pode cancelar',
    detail: 'O cancelamento é restrito à identidade que abriu a solicitação. Nada foi alterado.',
  },
  authorized_by_required: {
    kind: 'invalid',
    title: 'Informe quem autorizou',
    detail: 'O servidor exige a identidade de quem autorizou esta ação. Nada foi gravado.',
  },
  invalid_authorized_by_identity: {
    kind: 'invalid',
    title: 'Identidade autorizadora inválida',
    detail: 'A identidade informada como autorizadora não foi reconhecida. Nada foi gravado.',
  },
  revision_requires_identity: {
    kind: 'invalid',
    title: 'A revisão exige identidade declarada',
    detail: 'Revisar um orçamento aprovado exige registrar quem revisou. Nada foi gravado.',
  },
  approval_requires_identity_and_date: {
    kind: 'invalid',
    title: 'A aprovação exige identidade e data',
    detail: 'Sem quem aprovou e quando, a aprovação não pode ser registrada. Nada foi gravado.',
  },

  // ----- Formato do pedido ----------------------------------------------------
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
  missing_fields: {
    kind: 'invalid',
    title: 'Faltam campos obrigatórios',
    detail: 'O servidor recusou o pedido por campos ausentes. Nada foi gravado.',
  },
  missing_id: {
    kind: 'invalid',
    title: 'O identificador do registro não foi enviado',
    detail: 'A ação precisa apontar para um registro existente. Nada foi alterado.',
  },
  missing_receivable_id: {
    kind: 'invalid',
    title: 'Informe o recebível',
    detail: 'A ação exige o recebível de referência. Nada foi gravado.',
  },
  missing_payable_id: {
    kind: 'invalid',
    title: 'Informe o pagável',
    detail: 'A ação exige a conta a pagar de referência. Nada foi gravado.',
  },
  invalid_json: {
    kind: 'invalid',
    title: 'O pedido chegou com um formato ilegível',
    detail: 'O servidor não conseguiu interpretar os dados enviados. Tente novamente.',
  },
  invalid: {
    kind: 'invalid',
    title: 'O servidor recusou os dados enviados',
    detail: 'Algum campo chegou em formato que o banco não aceita. Revise e tente de novo.',
  },
  invalid_request: {
    kind: 'invalid',
    title: 'Pedido inválido',
    detail: 'O servidor recusou a combinação de campos enviada. Nada foi gravado.',
  },
  invalid_id: {
    kind: 'invalid',
    title: 'Identificador inválido',
    detail: 'O identificador enviado não tem o formato esperado. Nada foi feito.',
  },
  payload_object_required: {
    kind: 'invalid',
    title: 'O corpo do pedido precisa ser um objeto',
    detail: 'O servidor espera um objeto JSON com os campos da ação. Nada foi gravado.',
  },
  filters_object_required: {
    kind: 'invalid',
    title: 'Os filtros precisam ser um objeto',
    detail: 'O conjunto de filtros da exportação chegou em formato inesperado. Nada foi gerado.',
  },
  totals_object_required: {
    kind: 'invalid',
    title: 'Os totais precisam ser um objeto',
    detail: 'O fechamento espera os totais declarados em um objeto. Nada foi gravado.',
  },
  no_change_requested: {
    kind: 'invalid',
    title: 'Nenhuma alteração foi pedida',
    detail: 'Informe ao menos um campo diferente do atual antes de confirmar.',
  },
  status_required: {
    kind: 'invalid',
    title: 'Informe a nova situação',
    detail: 'A transição exige a situação de destino. Nada foi alterado.',
  },
  internal: {
    kind: 'retry',
    title: 'Falha no servidor',
    detail: 'O servidor não conseguiu concluir a operação. Isto não significa lista vazia nem valor zero.',
  },
  migration_required: {
    kind: 'retry',
    title: 'Esta área ainda não está migrada neste banco',
    detail: 'A tabela correspondente não existe neste banco. Isto não é ausência de registro: é ausência de estrutura.',
  },

  // ----- Falhas de leitura, auditoria e escrita (nunca viram "zero") ---------
  audit_unavailable: {
    kind: 'retry',
    title: 'A auditoria não confirmou o registro',
    detail: 'Por segurança, a gravação é recusada quando a trilha de auditoria não pode ser garantida. Nada foi salvo.',
  },
  approval_check_unavailable: {
    kind: 'retry',
    title: 'Não foi possível verificar a alçada agora',
    detail: 'A consulta à política de alçada falhou. Nenhuma aprovação foi concedida — ausência de resposta nunca aprova.',
  },
  finance_flow_unavailable: {
    kind: 'retry',
    title: 'Não foi possível consultar o fluxo financeiro agora',
    detail: 'A leitura falhou no servidor. Isto não significa fluxo zerado.',
  },
  commission_unavailable: {
    kind: 'retry',
    title: 'Não foi possível consultar a comissão agora',
    detail: 'A leitura falhou no servidor. Isto não significa comissão inexistente.',
  },
  commissions_unavailable: {
    kind: 'retry',
    title: 'Não foi possível consultar as comissões agora',
    detail: 'A leitura falhou no servidor. Isto não significa lista vazia.',
  },
  goal_unavailable: {
    kind: 'retry',
    title: 'Não foi possível consultar a meta agora',
    detail: 'A leitura falhou no servidor. Isto não significa meta inexistente.',
  },
  goals_unavailable: {
    kind: 'retry',
    title: 'Não foi possível consultar as metas agora',
    detail: 'A leitura falhou no servidor. Isto não significa lista vazia.',
  },
  rule_unavailable: {
    kind: 'retry',
    title: 'Não foi possível consultar a regra agora',
    detail: 'A leitura falhou no servidor. Isto não significa ausência de regra.',
  },
  rules_unavailable: {
    kind: 'retry',
    title: 'Não foi possível consultar as regras agora',
    detail: 'A leitura falhou no servidor. Isto não significa lista vazia.',
  },
  rule_create_failed: {
    kind: 'retry',
    title: 'A regra não pôde ser criada',
    detail: 'O servidor não confirmou a gravação da regra. Nada foi salvo.',
  },
  rule_update_failed: {
    kind: 'retry',
    title: 'A regra não pôde ser atualizada',
    detail: 'O servidor não confirmou a alteração da regra. Nada foi salvo.',
  },
  goal_create_failed: {
    kind: 'retry',
    title: 'A meta não pôde ser criada',
    detail: 'O servidor não confirmou a gravação da meta. Nada foi salvo.',
  },
  goal_update_failed: {
    kind: 'retry',
    title: 'A meta não pôde ser atualizada',
    detail: 'O servidor não confirmou a alteração da meta. Nada foi salvo.',
  },
  commission_create_failed: {
    kind: 'retry',
    title: 'A comissão não pôde ser criada',
    detail: 'O servidor não confirmou a gravação da comissão. Nada foi salvo.',
  },
  commission_update_failed: {
    kind: 'retry',
    title: 'A comissão não pôde ser atualizada',
    detail: 'O servidor não confirmou a alteração da comissão. Nada foi salvo.',
  },

  // ----- Idempotência, duplicidade e repetição --------------------------------
  duplicate: {
    kind: 'conflict',
    title: 'O registro já existe',
    detail: 'O servidor recusou a gravação por duplicidade. Confira se a ação já havia sido feita antes de repetir.',
  },
  duplicate_name: {
    kind: 'conflict',
    title: 'Já existe um registro com este nome',
    detail: 'Nomes são únicos nesta tabela. Escolha outro nome.',
  },
  duplicate_bank_ref: {
    kind: 'conflict',
    title: 'Este movimento bancário já foi importado',
    detail: 'A referência do movimento já existe no extrato. Nada foi duplicado.',
  },
  duplicate_competence: {
    kind: 'conflict',
    title: 'Esta competência já tem registro',
    detail: 'Já existe um registro para a competência informada. Nada foi duplicado.',
  },
  duplicate_competence_account: {
    kind: 'conflict',
    title: 'Esta conta já tem registro nesta competência',
    detail: 'A combinação conta + competência é única. Nada foi duplicado.',
  },
  duplicate_competence_item: {
    kind: 'conflict',
    title: 'Este item já existe nesta competência',
    detail: 'A combinação item + competência é única. Nada foi duplicado.',
  },
  duplicate_competence_type: {
    kind: 'conflict',
    title: 'Esta competência já tem registro deste tipo',
    detail: 'A combinação competência + tipo é única. Nada foi duplicado.',
  },
  duplicate_evidence: {
    kind: 'conflict',
    title: 'Esta evidência já foi registrada',
    detail: 'A chave da evidência sintética já existe. Nada foi duplicado.',
  },
  duplicate_gateway_code: {
    kind: 'conflict',
    title: 'Já existe um gateway com este código',
    detail: 'O código do gateway é único. Escolha outro código.',
  },
  duplicate_idempotency_key: {
    kind: 'conflict',
    title: 'Esta chave de idempotência já foi usada',
    detail: 'A chave já identificou outro pedido. Gere uma chave nova para um pedido novo.',
  },
  duplicate_import_record: {
    kind: 'conflict',
    title: 'Este registro de importação já existe',
    detail: 'A chave do registro importado já consta nesta importação. Nada foi duplicado.',
  },
  duplicate_obligation_for_activity: {
    kind: 'conflict',
    title: 'Esta atividade já tem obrigação determinada',
    detail: 'A obrigação fiscal já foi determinada para a atividade do contrato. Nada foi duplicado.',
  },
  duplicate_open_charge_for_receivable: {
    kind: 'conflict',
    title: 'Este recebível já tem cobrança aberta',
    detail: 'Só pode existir uma cobrança pendente por recebível. Resolva a cobrança atual antes de abrir outra.',
  },
  duplicate_pending_request: {
    kind: 'conflict',
    title: 'Já existe solicitação pendente igual a esta',
    detail: 'A duplicidade natural (mesma descrição, valor e solicitante) foi recusada. Nada foi duplicado.',
  },
  duplicate_provider_code: {
    kind: 'conflict',
    title: 'Já existe provedor com este código',
    detail: 'O código do provedor fiscal é único. Escolha outro código.',
  },
  duplicate_recurrence_id: {
    kind: 'conflict',
    title: 'Já existe regra com este identificador',
    detail: 'O identificador da regra de recorrência é único. Escolha outro.',
  },
  duplicate_reminder: {
    kind: 'conflict',
    title: 'Este lembrete já existe',
    detail: 'A combinação política + recebível + tipo já tem lembrete. Nada foi duplicado.',
  },
  duplicate_scenario_type_for_budget: {
    kind: 'conflict',
    title: 'Este orçamento já tem cenário deste tipo',
    detail: 'Cada tipo de cenário aparece uma vez por orçamento. Nada foi duplicado.',
  },
  duplicate_storage_key: {
    kind: 'conflict',
    title: 'Esta chave de arquivo já está em uso',
    detail: 'A chave sintética de armazenamento é única. Escolha outra.',
  },
  idempotency_conflict: {
    kind: 'conflict',
    title: 'Conflito de idempotência',
    detail: 'A mesma chave já foi usada com outro conteúdo. Nada foi gravado duas vezes.',
  },
  idempotency_key_conflict: {
    kind: 'conflict',
    title: 'Conflito de chave de idempotência',
    detail: 'A mesma chave já identificou um pedido com conteúdo diferente. Nada foi gravado duas vezes.',
  },
  idempotency_key_reused_with_different_payload: {
    kind: 'conflict',
    title: 'Chave de idempotência reusada com outro conteúdo',
    detail: 'A chave pertence a um pedido anterior com dados diferentes. Gere uma chave nova.',
  },
  idempotency_key_required_or_invalid: {
    kind: 'invalid',
    title: 'Chave de idempotência ausente ou inválida',
    detail: 'Sem ela, o servidor não pode garantir que um clique duplo não grave duas vezes. Nada foi gravado.',
  },
  idempotency_key_10_200: {
    kind: 'invalid',
    title: 'A chave de idempotência precisa ter de 10 a 200 caracteres',
    detail: 'Ajuste o tamanho da chave e repita o pedido.',
  },
  idempotency_key_10_200_required: {
    kind: 'invalid',
    title: 'Informe uma chave de idempotência de 10 a 200 caracteres',
    detail: 'Ela é obrigatória para esta gravação. Nada foi gravado.',
  },
  idempotency_key_8_200: {
    kind: 'invalid',
    title: 'A chave de idempotência precisa ter de 8 a 200 caracteres',
    detail: 'Ajuste o tamanho da chave e repita o pedido.',
  },
  replay_detected: {
    kind: 'conflict',
    title: 'Repetição detectada',
    detail: 'Este webhook ou pedido já havia sido processado. O servidor recusou o reenvio — nada foi contado duas vezes.',
  },
  already_approved: {
    kind: 'conflict',
    title: 'Este registro já está aprovado',
    detail: 'A aprovação já existia. Nada foi alterado.',
  },
  already_conciliated: {
    kind: 'conflict',
    title: 'Este item já está conciliado',
    detail: 'A conciliação já existia. Nada foi alterado.',
  },
  already_confirmed: {
    kind: 'conflict',
    title: 'Esta confirmação já foi feita',
    detail: 'O registro já estava confirmado. Nada foi alterado.',
  },
  already_generated: {
    kind: 'conflict',
    title: 'A cobrança desta competência já foi gerada',
    detail: 'A regra é idempotente por competência: gerar de novo não cria uma segunda cobrança.',
  },
  already_in_status: {
    kind: 'conflict',
    title: 'O registro já está nesta situação',
    detail: 'A transição pedida não muda nada. Nada foi alterado.',
  },
  already_aged_for_competence: {
    kind: 'conflict',
    title: 'Este recebível já tem aging nesta competência',
    detail: 'A fotografia de aging já existe para a competência. Nada foi duplicado.',
  },
  charge_already_in_status: {
    kind: 'conflict',
    title: 'A cobrança já está nesta situação',
    detail: 'A transição pedida não muda nada. Nada foi alterado.',
  },
  document_already_in_status: {
    kind: 'conflict',
    title: 'O documento fiscal já está nesta situação',
    detail: 'A transição pedida não muda nada. Nada foi alterado.',
  },
  document_already_cancelled: {
    kind: 'conflict',
    title: 'Este documento fiscal já está cancelado',
    detail: 'Documento cancelado não volta atrás. Nada foi alterado.',
  },
  document_already_registered: {
    kind: 'conflict',
    title: 'Este documento fiscal já foi registrado',
    detail: 'O registro sintético já existia. Nada foi duplicado.',
  },
  gateway_already_in_status: {
    kind: 'conflict',
    title: 'O gateway já está nesta situação',
    detail: 'A transição pedida não muda nada. Nada foi alterado.',
  },
  provider_already_in_status: {
    kind: 'conflict',
    title: 'O provedor já está nesta situação',
    detail: 'A transição pedida não muda nada. Nada foi alterado.',
  },
  obligation_already_cancelled: {
    kind: 'conflict',
    title: 'Esta obrigação já está cancelada',
    detail: 'Obrigação cancelada não volta atrás. Nada foi alterado.',
  },
  webhook_already_conciliated: {
    kind: 'conflict',
    title: 'Este webhook já foi conciliado',
    detail: 'A conciliação já existia. Nada foi contado duas vezes.',
  },
  bank_transaction_already_conciliated: {
    kind: 'conflict',
    title: 'Este movimento bancário já está conciliado',
    detail: 'O movimento já foi associado a uma conta. Nada foi alterado.',
  },
  conciliation_already_final: {
    kind: 'conflict',
    title: 'Esta conciliação já está encerrada',
    detail: 'Conciliação em situação final não aceita nova decisão. Nada foi alterado.',
  },
  estorno_already_exists: {
    kind: 'conflict',
    title: 'Este pagamento já foi estornado',
    detail: 'O estorno já existia. Nada foi contado duas vezes.',
  },
  gateway_settlement_already_reversed: {
    kind: 'conflict',
    title: 'Esta liquidação já foi revertida',
    detail: 'A reversão já existia. Nada foi contado duas vezes.',
  },
  history_immutable: {
    kind: 'denied',
    title: 'O histórico é imutável',
    detail: 'Eventos de histórico não podem ser alterados nem apagados — é essa imutabilidade que torna a trilha confiável.',
  },

  // ----- Tamanho e formato de texto ------------------------------------------
  category_3_200: {
    kind: 'invalid',
    title: 'A categoria precisa ter de 3 a 200 caracteres',
    detail: 'Ajuste o texto e repita o pedido.',
  },
  description_10_1000: {
    kind: 'invalid',
    title: 'A descrição precisa ter de 10 a 1000 caracteres',
    detail: 'Ajuste o texto e repita o pedido.',
  },
  description_10_2000: {
    kind: 'invalid',
    title: 'A descrição precisa ter de 10 a 2000 caracteres',
    detail: 'Ajuste o texto e repita o pedido.',
  },
  name_3_200: {
    kind: 'invalid',
    title: 'O nome precisa ter de 3 a 200 caracteres',
    detail: 'Ajuste o texto e repita o pedido.',
  },
  name_3_200_required: {
    kind: 'invalid',
    title: 'Informe um nome de 3 a 200 caracteres',
    detail: 'O nome é obrigatório para esta gravação. Nada foi gravado.',
  },
  title_5_200: {
    kind: 'invalid',
    title: 'O título precisa ter de 5 a 200 caracteres',
    detail: 'Ajuste o texto e repita o pedido.',
  },
  event_type_3_200: {
    kind: 'invalid',
    title: 'O tipo de evento precisa ter de 3 a 200 caracteres',
    detail: 'Ajuste o texto e repita o pedido.',
  },
  file_name_1_500: {
    kind: 'invalid',
    title: 'O nome do arquivo precisa ter de 1 a 500 caracteres',
    detail: 'Ajuste o texto e repita o pedido.',
  },
  file_url_5_1000: {
    kind: 'invalid',
    title: 'A URL do arquivo precisa ter de 5 a 1000 caracteres',
    detail: 'Ajuste o endereço sintético e repita o pedido.',
  },
  storage_key_5_500: {
    kind: 'invalid',
    title: 'A chave de armazenamento precisa ter de 5 a 500 caracteres',
    detail: 'Ajuste a chave sintética e repita o pedido.',
  },
  storage_key_required_for_gerado: {
    kind: 'invalid',
    title: 'Marcar como gerado exige a chave do arquivo',
    detail: 'Sem a chave sintética, a exportação não pode ser declarada gerada. Nada foi alterado.',
  },
  requester_name_2_200: {
    kind: 'invalid',
    title: 'O nome do solicitante precisa ter de 2 a 200 caracteres',
    detail: 'Ajuste o texto e repita o pedido.',
  },
  responsible_name_2_200_required: {
    kind: 'invalid',
    title: 'Informe o responsável (2 a 200 caracteres)',
    detail: 'O lembrete precisa de uma pessoa responsável declarada. Nada foi gravado.',
  },
  content_20_2000_required: {
    kind: 'invalid',
    title: 'O conteúdo precisa ter de 20 a 2000 caracteres',
    detail: 'Ajuste o texto e repita o pedido.',
  },
  notes_10_1000_required: {
    kind: 'invalid',
    title: 'As notas precisam ter de 10 a 1000 caracteres',
    detail: 'Ajuste o texto e repita o pedido.',
  },
  notes_10_2000: {
    kind: 'invalid',
    title: 'As notas precisam ter de 10 a 2000 caracteres',
    detail: 'Ajuste o texto e repita o pedido.',
  },
  reason_10_1000_required: {
    kind: 'invalid',
    title: 'O motivo precisa ter de 10 a 1000 caracteres',
    detail: 'Decisões financeiras exigem motivo escrito. Nada foi gravado.',
  },
  close_reason_10_1000_required: {
    kind: 'invalid',
    title: 'O motivo do fechamento precisa ter de 10 a 1000 caracteres',
    detail: 'Fechar competência exige justificativa escrita. Nada foi gravado.',
  },
  reopen_reason_10_1000_required_reabertura_autorizada: {
    kind: 'invalid',
    title: 'Reabrir exige motivo autorizado de 10 a 1000 caracteres',
    detail: 'A reabertura de competência é um evento auditado e exige justificativa escrita. Nada foi alterado.',
  },
  revision_reason_10_1000_required: {
    kind: 'invalid',
    title: 'O motivo da revisão precisa ter de 10 a 1000 caracteres',
    detail: 'Revisar exige justificativa escrita. Nada foi gravado.',
  },
  divergence_reason_10_1000_required: {
    kind: 'invalid',
    title: 'A divergência precisa de motivo de 10 a 1000 caracteres',
    detail: 'Marcar divergência exige explicar a diferença. Nada foi gravado.',
  },
  suggestion_reason_10_1000_required: {
    kind: 'invalid',
    title: 'A sugestão precisa de motivo de 10 a 1000 caracteres',
    detail: 'Sugerir conciliação exige explicar o critério. Nada foi gravado.',
  },
  incomplete_reason_required_10_1000_when_incomplete: {
    kind: 'invalid',
    title: 'Base incompleta exige motivo de 10 a 1000 caracteres',
    detail: 'Declarar o resultado como incompleto exige dizer o que falta. Nada foi gravado.',
  },
  rateio_rule_10_1000_required: {
    kind: 'invalid',
    title: 'A regra de rateio precisa ter de 10 a 1000 caracteres',
    detail: 'Todo rateio precisa de critério escrito. Nada foi gravado.',
  },
  error_sanitized_10_1000_required: {
    kind: 'invalid',
    title: 'A mensagem de erro sanitizada precisa ter de 10 a 1000 caracteres',
    detail: 'O registro de falha guarda só texto sanitizado, sem dado sensível. Nada foi gravado.',
  },
  premises_10_2000_required_nao_prometer_resultado: {
    kind: 'invalid',
    title: 'O cenário exige premissas escritas (10 a 2000 caracteres)',
    detail: 'Cenário sem premissa vira promessa de resultado. O servidor recusa — declare as premissas.',
  },
  premises_10_2000_required_cenario_expansao_premissas_explicitas: {
    kind: 'invalid',
    title: 'Cenário de expansão exige premissas explícitas (10 a 2000 caracteres)',
    detail: 'Expansão sem premissa declarada não é projeção, é promessa. Nada foi gravado.',
  },
  source_material_too_long: {
    kind: 'invalid',
    title: 'O material de origem é longo demais',
    detail: 'Reduza o conteúdo enviado e repita o pedido.',
  },
  activity_type_required_canonical_code: {
    kind: 'invalid',
    title: 'Informe o código canônico da atividade',
    detail: 'A atividade precisa vir pelo código canônico, não por texto livre. Nada foi gravado.',
  },
  supported_obligations_required_nfse_nfe_nfce_cte_outro: {
    kind: 'invalid',
    title: 'Declare as obrigações suportadas (nfse, nfe, nfce, cte ou outro)',
    detail: 'O provedor precisa declarar o que sabe emitir. Nada foi gravado.',
  },
  gateway_type_required_boleto_pix_cartao_gateway_outro: {
    kind: 'invalid',
    title: 'Informe o tipo do gateway (boleto, pix, cartão, gateway ou outro)',
    detail: 'O tipo é obrigatório no cadastro do gateway. Nada foi gravado.',
  },
  signature_hmac_sha256_hex_required: {
    kind: 'invalid',
    title: 'A assinatura precisa ser HMAC-SHA256 em hexadecimal',
    detail: 'O webhook chegou com assinatura em formato inesperado. Nada foi aceito.',
  },

  // ----- Valores, datas e períodos -------------------------------------------
  amount_cents_gte_0: {
    kind: 'invalid',
    title: 'O valor em centavos precisa ser maior ou igual a zero',
    detail: 'Corrija o valor e repita o pedido.',
  },
  amount_positive_integer: {
    kind: 'invalid',
    title: 'O valor precisa ser um inteiro positivo em centavos',
    detail: 'Corrija o valor e repita o pedido.',
  },
  invalid_amount: {
    kind: 'invalid',
    title: 'Valor inválido',
    detail: 'O valor enviado não é aceito pelo servidor. Corrija e repita.',
  },
  invalid_amount_cents: {
    kind: 'invalid',
    title: 'Valor em centavos inválido',
    detail: 'O valor enviado não é aceito pelo servidor. Corrija e repita.',
  },
  invalid_amount_matched: {
    kind: 'invalid',
    title: 'Valor conciliado inválido',
    detail: 'O valor associado ao movimento não é aceito. Corrija e repita.',
  },
  invalid_source_amount: {
    kind: 'invalid',
    title: 'Valor de origem inválido',
    detail: 'O valor da fonte do custo não é aceito. Corrija e repita.',
  },
  invalid_cost_amount: {
    kind: 'invalid',
    title: 'Valor de custo inválido',
    detail: 'O valor do custo não é aceito. Corrija e repita.',
  },
  invalid_cashflow_amount: {
    kind: 'invalid',
    title: 'Valor de fluxo de caixa inválido',
    detail: 'Um dos valores do snapshot não é aceito. Corrija e repita.',
  },
  invalid_aging_amount: {
    kind: 'invalid',
    title: 'Valor de aging inválido',
    detail: 'O valor da fotografia de aging não é aceito. Corrija e repita.',
  },
  totals_gte_0: {
    kind: 'invalid',
    title: 'Os totais precisam ser maiores ou iguais a zero',
    detail: 'Corrija os totais declarados e repita o pedido.',
  },
  threshold_positive_integer: {
    kind: 'invalid',
    title: 'O teto precisa ser um inteiro positivo em centavos',
    detail: 'Corrija o teto da solicitação e repita.',
  },
  rateio_percent_0_01_100: {
    kind: 'invalid',
    title: 'O percentual de rateio precisa estar entre 0,01 e 100',
    detail: 'Corrija o percentual e repita o pedido.',
  },
  amount_paid_exceeds_amount: {
    kind: 'invalid',
    title: 'O valor pago não pode ser maior que o valor da conta',
    detail: 'Corrija o valor informado. Nada foi gravado.',
  },
  amount_exceeds_receivable: {
    kind: 'conflict',
    title: 'O valor ultrapassa o recebível',
    detail: 'A baixa não pode ser maior que a conta. Nada foi gravado.',
  },
  amount_exceeds_receivable_balance: {
    kind: 'conflict',
    title: 'O valor ultrapassa o saldo do recebível',
    detail: 'A baixa não pode ser maior que o saldo em aberto. Nada foi gravado.',
  },
  charge_amount_exceeds_receivable_balance: {
    kind: 'conflict',
    title: 'A cobrança ultrapassa o saldo do recebível',
    detail: 'Não é possível cobrar mais do que o saldo em aberto. Nada foi gravado.',
  },
  overpayment: {
    kind: 'conflict',
    title: 'A baixa ultrapassaria o saldo da conta',
    detail: 'O servidor reverteu a operação inteira para não registrar pagamento a maior.',
  },
  estorno_amount_exceeds_origin: {
    kind: 'conflict',
    title: 'O estorno ultrapassa o pagamento de origem',
    detail: 'Não é possível estornar mais do que foi pago. Nada foi gravado.',
  },
  allocated_amount_mismatch: {
    kind: 'invalid',
    title: 'A soma do rateio não bate com o valor de origem',
    detail: 'Os valores rateados precisam fechar com o valor importado. Nada foi gravado.',
  },
  invalid_import_totals: {
    kind: 'invalid',
    title: 'Totais da importação inválidos',
    detail: 'Os totais declarados não são aceitos. Corrija e repita.',
  },
  invalid_statement_totals: {
    kind: 'invalid',
    title: 'Totais do extrato inválidos',
    detail: 'Os totais declarados do extrato não são aceitos. Corrija e repita.',
  },
  gateway_settlement_balance_inconsistent: {
    kind: 'retry',
    title: 'O saldo da liquidação ficou inconsistente',
    detail: 'O servidor desfez a operação para não deixar saldo divergente. Nada foi salvo.',
  },
  due_before_competence: {
    kind: 'invalid',
    title: 'O vencimento não pode ser anterior à competência',
    detail: 'Corrija as datas e repita o pedido.',
  },
  due_date_mismatch: {
    kind: 'invalid',
    title: 'O vencimento não confere com o do recebível',
    detail: 'O vencimento canônico vem do recebível. Corrija e repita.',
  },
  end_before_start: {
    kind: 'invalid',
    title: 'A data final não pode ser anterior à inicial',
    detail: 'Corrija o período e repita o pedido.',
  },
  period_end_gte_start: {
    kind: 'invalid',
    title: 'O fim do período precisa ser maior ou igual ao início',
    detail: 'Corrija o período e repita o pedido.',
  },
  period_required: {
    kind: 'invalid',
    title: 'Informe o período',
    detail: 'A consulta ou exportação exige início e fim. Nada foi gerado.',
  },
  invalid_period: {
    kind: 'invalid',
    title: 'Período inválido',
    detail: 'As datas informadas não formam um período aceito. Corrija e repita.',
  },
  competence_date_required: {
    kind: 'invalid',
    title: 'Informe a competência',
    detail: 'A competência é obrigatória para esta gravação. Nada foi gravado.',
  },
  invalid_competence_date: {
    kind: 'invalid',
    title: 'Competência inválida',
    detail: 'A data de competência precisa estar no formato AAAA-MM-DD. Corrija e repita.',
  },
  invalid_due_date: {
    kind: 'invalid',
    title: 'Vencimento inválido',
    detail: 'A data de vencimento precisa estar no formato AAAA-MM-DD. Corrija e repita.',
  },
  invalid_issue_date: {
    kind: 'invalid',
    title: 'Data de emissão inválida',
    detail: 'A data precisa estar no formato AAAA-MM-DD. Corrija e repita.',
  },
  invalid_import_date: {
    kind: 'invalid',
    title: 'Data da importação inválida',
    detail: 'A data precisa estar no formato AAAA-MM-DD. Corrija e repita.',
  },
  invalid_provision_date: {
    kind: 'invalid',
    title: 'Data da provisão inválida',
    detail: 'A data precisa estar no formato AAAA-MM-DD. Corrija e repita.',
  },
  invalid_aging_date: {
    kind: 'invalid',
    title: 'Data do aging inválida',
    detail: 'A data precisa estar no formato AAAA-MM-DD. Corrija e repita.',
  },
  invalid_days_before: {
    kind: 'invalid',
    title: 'Antecedência inválida',
    detail: 'A quantidade de dias antes do vencimento não é aceita. Corrija e repita.',
  },
  invalid_escalation_level: {
    kind: 'invalid',
    title: 'Nível de escalonamento inválido',
    detail: 'O nível informado não é aceito pela política. Corrija e repita.',
  },

  // ----- Identificadores e referências canônicas ------------------------------
  invalid_account_id: {
    kind: 'invalid',
    title: 'Identificador de conta inválido',
    detail: 'O identificador precisa ser um UUID válido. Nada foi feito.',
  },
  invalid_client_account_id: {
    kind: 'invalid',
    title: 'Identificador da conta do cliente inválido',
    detail: 'O identificador precisa ser um UUID válido. Nada foi feito.',
  },
  invalid_contract_id: {
    kind: 'invalid',
    title: 'Identificador de contrato inválido',
    detail: 'O identificador precisa ser um UUID válido. Nada foi feito.',
  },
  invalid_receivable_id: {
    kind: 'invalid',
    title: 'Identificador de recebível inválido',
    detail: 'O identificador precisa ser um UUID válido. Nada foi feito.',
  },
  invalid_charge_id: {
    kind: 'invalid',
    title: 'Identificador de cobrança inválido',
    detail: 'O identificador precisa ser um UUID válido. Nada foi feito.',
  },
  invalid_gateway_id: {
    kind: 'invalid',
    title: 'Identificador de gateway inválido',
    detail: 'O identificador precisa ser um UUID válido. Nada foi feito.',
  },
  invalid_provider_id: {
    kind: 'invalid',
    title: 'Identificador de provedor inválido',
    detail: 'O identificador precisa ser um UUID válido. Nada foi feito.',
  },
  invalid_obligation_id: {
    kind: 'invalid',
    title: 'Identificador de obrigação inválido',
    detail: 'O identificador precisa ser um UUID válido. Nada foi feito.',
  },
  invalid_expense_id: {
    kind: 'invalid',
    title: 'Identificador de despesa inválido',
    detail: 'O identificador precisa ser um UUID válido. Nada foi feito.',
  },
  invalid_export_id: {
    kind: 'invalid',
    title: 'Identificador de exportação inválido',
    detail: 'O identificador precisa ser um UUID válido. Nada foi feito.',
  },
  invalid_closure_id: {
    kind: 'invalid',
    title: 'Identificador de fechamento inválido',
    detail: 'O identificador precisa ser um UUID válido. Nada foi feito.',
  },
  invalid_budget_id: {
    kind: 'invalid',
    title: 'Identificador de orçamento inválido',
    detail: 'O identificador precisa ser um UUID válido. Nada foi feito.',
  },
  invalid_provision_id: {
    kind: 'invalid',
    title: 'Identificador de provisão inválido',
    detail: 'O identificador precisa ser um UUID válido. Nada foi feito.',
  },
  invalid_commission_id: {
    kind: 'invalid',
    title: 'Identificador de comissão inválido',
    detail: 'O identificador precisa ser um UUID válido. Nada foi feito.',
  },
  invalid_rule_id: {
    kind: 'invalid',
    title: 'Identificador de regra inválido',
    detail: 'O identificador precisa ser um UUID válido. Nada foi feito.',
  },
  invalid_policy_id: {
    kind: 'invalid',
    title: 'Identificador de política inválido',
    detail: 'O identificador precisa ser um UUID válido. Nada foi feito.',
  },
  invalid_reminder_id: {
    kind: 'invalid',
    title: 'Identificador de lembrete inválido',
    detail: 'O identificador precisa ser um UUID válido. Nada foi feito.',
  },
  invalid_entity_id: {
    kind: 'invalid',
    title: 'Identificador da entidade inválido',
    detail: 'O identificador precisa ser um UUID válido. Nada foi feito.',
  },
  invalid_entity_type: {
    kind: 'invalid',
    title: 'Tipo de entidade inválido',
    detail: 'O histórico aceita apenas os tipos declarados pelo servidor. Nada foi feito.',
  },
  invalid_reference: {
    kind: 'invalid',
    title: 'Referência inválida',
    detail: 'A referência informada não corresponde a um registro canônico. Nada foi gravado.',
  },
  invalid_cost_reference: {
    kind: 'invalid',
    title: 'Referência de custo inválida',
    detail: 'O custo precisa apontar para cliente, contrato ou posto canônico. Nada foi gravado.',
  },
  invalid_search: {
    kind: 'invalid',
    title: 'Termo de busca inválido',
    detail: 'O servidor recusou o termo enviado. Ajuste a busca.',
  },
  invalid_cost_filter: {
    kind: 'invalid',
    title: 'Filtro de custo inválido',
    detail: 'O filtro enviado não é aceito. Ajuste e repita.',
  },
  account_not_found: {
    kind: 'invalid',
    title: 'Conta não encontrada',
    detail: 'A conta informada não existe ou não está no seu escopo.',
  },
  client_account_not_found: {
    kind: 'invalid',
    title: 'Conta de cliente não encontrada',
    detail: 'A conta do cliente informada não existe ou não está no seu escopo.',
  },
  client_account_mismatch: {
    kind: 'conflict',
    title: 'A conta do cliente não confere',
    detail: 'O registro pertence a outra conta de cliente. O isolamento por conta é verificado no servidor.',
  },
  contract_not_found: {
    kind: 'invalid',
    title: 'Contrato não encontrado',
    detail: 'O contrato informado não existe ou não está no seu escopo.',
  },
  contract_account_mismatch: {
    kind: 'conflict',
    title: 'Contrato e conta do cliente não combinam',
    detail: 'O contrato pertence a outra conta. Nada foi gravado.',
  },
  post_contract_scope_mismatch: {
    kind: 'conflict',
    title: 'O posto não pertence ao contrato informado',
    detail: 'O rateio exige posto e contrato coerentes. Nada foi gravado.',
  },
  canonical_references_required: {
    kind: 'invalid',
    title: 'Informe as referências canônicas',
    detail: 'O registro precisa apontar para cadastros canônicos, não para texto livre. Nada foi gravado.',
  },
  canonical_reference_not_found_or_inactive: {
    kind: 'invalid',
    title: 'Referência canônica inexistente ou inativa',
    detail: 'O cadastro apontado não existe ou está inativo. Nada foi gravado.',
  },
  exactly_one_account_ref_required: {
    kind: 'invalid',
    title: 'Informe exatamente uma conta: a receber ou a pagar',
    detail: 'O movimento precisa apontar para um único lado. Nada foi gravado.',
  },
  employee_not_found: {
    kind: 'invalid',
    title: 'Funcionário não encontrado',
    detail: 'O funcionário informado não existe ou não está no seu escopo.',
  },
  receivable_not_found: {
    kind: 'invalid',
    title: 'Recebível não encontrado',
    detail: 'O recebível informado não existe ou não está no seu escopo.',
  },
  receivable_reference_required: {
    kind: 'invalid',
    title: 'Informe o recebível de referência',
    detail: 'A ação exige um recebível canônico. Nada foi gravado.',
  },
  payable_not_found: {
    kind: 'invalid',
    title: 'Conta a pagar não encontrada',
    detail: 'A conta a pagar informada não existe ou não está no seu escopo.',
  },
  payment_not_found: {
    kind: 'invalid',
    title: 'Pagamento não encontrado',
    detail: 'O pagamento informado não existe ou não está no seu escopo.',
  },
  statement_not_found: {
    kind: 'invalid',
    title: 'Extrato não encontrado',
    detail: 'O extrato informado não existe ou não está no seu escopo.',
  },
  bank_transaction_not_found: {
    kind: 'invalid',
    title: 'Movimento bancário não encontrado',
    detail: 'O movimento informado não existe ou não está no seu escopo.',
  },
  bank_transaction_required: {
    kind: 'invalid',
    title: 'Informe o movimento bancário',
    detail: 'A conciliação exige um movimento de extrato. Nada foi gravado.',
  },
  transaction_fields_invalid: {
    kind: 'invalid',
    title: 'Campos do movimento inválidos',
    detail: 'O movimento bancário chegou com campos que o servidor não aceita. Nada foi gravado.',
  },
  invalid_transaction: {
    kind: 'invalid',
    title: 'Movimento bancário inválido',
    detail: 'O movimento enviado não é aceito. Corrija e repita.',
  },
  invalid_statement: {
    kind: 'invalid',
    title: 'Extrato inválido',
    detail: 'O extrato enviado não é aceito. Corrija e repita.',
  },
  invalid_conciliation: {
    kind: 'invalid',
    title: 'Conciliação inválida',
    detail: 'A conciliação enviada não é aceita. Corrija e repita.',
  },
  invalid_confirmation: {
    kind: 'invalid',
    title: 'Confirmação inválida',
    detail: 'A confirmação enviada não é aceita pelo servidor. Nada foi gravado.',
  },
  only_conciliation_is_allowed: {
    kind: 'denied',
    title: 'Aqui só é permitido conciliar',
    detail: 'Outras alterações neste movimento são recusadas pelo servidor. Nada foi alterado.',
  },
  budget_not_found: {
    kind: 'invalid',
    title: 'Orçamento não encontrado',
    detail: 'O orçamento informado não existe ou não está no seu escopo.',
  },
  budget_archived_locked: {
    kind: 'denied',
    title: 'Orçamento arquivado está bloqueado',
    detail: 'Orçamento arquivado não aceita alteração. Nada foi alterado.',
  },
  approved_budget_locked_requires_revision: {
    kind: 'conflict',
    title: 'Orçamento aprovado só muda por revisão',
    detail: 'Use a ação de revisar, com motivo e identidade — alterar direto é recusado.',
  },
  revision_required_use_action_revise: {
    kind: 'conflict',
    title: 'Esta alteração exige a ação de revisar',
    detail: 'O servidor só aceita a mudança por meio de uma revisão registrada. Nada foi alterado.',
  },
  revision_requires_approved_budget: {
    kind: 'conflict',
    title: 'Só orçamento aprovado pode ser revisado',
    detail: 'A revisão não se aplica à situação atual do orçamento. Nada foi alterado.',
  },
  invalid_version_change: {
    kind: 'invalid',
    title: 'Mudança de versão inválida',
    detail: 'A versão informada não é aceita para este registro. Nada foi alterado.',
  },
  invalid_scenario_type: {
    kind: 'invalid',
    title: 'Tipo de cenário inválido',
    detail: 'Use um dos tipos previstos: conservador, base, otimista, expansão ou pessimista.',
  },
  margin_not_accepted_calculated_server_side: {
    kind: 'invalid',
    title: 'A margem não é informada pela tela',
    detail: 'A margem é calculada no servidor a partir de receita e custo. O valor enviado foi recusado.',
  },
  margin_percent_not_accepted_calculated_from_revenue_and_cost: {
    kind: 'invalid',
    title: 'O percentual de margem não é informado pela tela',
    detail: 'Ele é derivado de receita e custo no servidor. O valor enviado foi recusado.',
  },
  complete_requires_received_costs_and_no_incomplete_reason: {
    kind: 'conflict',
    title: 'Resultado completo exige receita, custos e nenhuma pendência declarada',
    detail: 'Enquanto houver motivo de incompletude, o resultado continua incompleto. Nada foi marcado como completo.',
  },
  invalid_is_complete: {
    kind: 'invalid',
    title: 'Marcação de completude inválida',
    detail: 'O campo aceita apenas verdadeiro ou falso. Nada foi gravado.',
  },
  invalid_is_active: {
    kind: 'invalid',
    title: 'Marcação de ativo inválida',
    detail: 'O campo aceita apenas verdadeiro ou falso. Nada foi gravado.',
  },
  invalid_approval: {
    kind: 'invalid',
    title: 'Aprovação inválida',
    detail: 'A decisão enviada não é aceita pelo servidor. Nada foi gravado.',
  },
  approval_must_be_cleared: {
    kind: 'conflict',
    title: 'A aprovação precisa ser limpa antes desta mudança',
    detail: 'Alterar este registro exige remover a aprovação vigente primeiro. Nada foi alterado.',
  },
  approval_authority_exceeded: {
    kind: 'denied',
    title: 'Valor acima da sua alçada',
    detail: 'A política de alçada da sua identidade não cobre este valor. A solicitação continua pendente.',
  },
  expense_not_pending: {
    kind: 'conflict',
    title: 'A solicitação não está pendente',
    detail: 'Só solicitações pendentes aceitam decisão. Nada foi alterado.',
  },
  invalid_expense_transition: {
    kind: 'conflict',
    title: 'Transição de despesa não permitida',
    detail: 'A situação atual não permite essa mudança. Nada foi alterado.',
  },
  invalid_expense_type: {
    kind: 'invalid',
    title: 'Tipo de despesa inválido',
    detail: 'Use despesa, reembolso, compra ou outro.',
  },
  synthetic_evidence_metadata_required: {
    kind: 'invalid',
    title: 'A evidência sintética precisa de metadados',
    detail: 'Nome, endereço e chave sintéticos são obrigatórios — não há upload real de arquivo.',
  },
  synthetic_document_metadata_required: {
    kind: 'invalid',
    title: 'O documento sintético precisa de metadados',
    detail: 'Nome, endereço e chave sintéticos são obrigatórios — não há emissão real.',
  },
  file_metadata_invalid: {
    kind: 'invalid',
    title: 'Metadados de arquivo inválidos',
    detail: 'Os dados do arquivo sintético não são aceitos. Corrija e repita.',
  },
  invalid_source: {
    kind: 'invalid',
    title: 'Origem inválida',
    detail: 'A origem informada não é aceita pelo servidor. Corrija e repita.',
  },
  invalid_cost_source: {
    kind: 'invalid',
    title: 'Origem de custo inválida',
    detail: 'Use pessoal, equipamento, material, supervisão ou outro.',
  },
  invalid_cost_import: {
    kind: 'invalid',
    title: 'Importação de custo inválida',
    detail: 'Os dados da importação não são aceitos. Corrija e repita.',
  },
  invalid_cost_allocation: {
    kind: 'invalid',
    title: 'Rateio de custo inválido',
    detail: 'O rateio informado não é aceito. Corrija e repita.',
  },
  import_record_key_required: {
    kind: 'invalid',
    title: 'Informe a chave do registro importado',
    detail: 'Sem ela não há como evitar importar o mesmo registro duas vezes. Nada foi gravado.',
  },
  import_record_key_without_import: {
    kind: 'invalid',
    title: 'Chave de registro importado sem importação',
    detail: 'A chave só faz sentido dentro de uma importação declarada. Nada foi gravado.',
  },
  invalid_cashflow_snapshot: {
    kind: 'invalid',
    title: 'Snapshot de fluxo de caixa inválido',
    detail: 'Os dados do snapshot não são aceitos. Corrija e repita.',
  },
  invalid_cashflow_type: {
    kind: 'invalid',
    title: 'Tipo de fluxo inválido',
    detail: 'Use previsto ou realizado.',
  },
  invalid_aging_snapshot: {
    kind: 'invalid',
    title: 'Snapshot de aging inválido',
    detail: 'Os dados da fotografia de aging não são aceitos. Corrija e repita.',
  },
  invalid_aging_bucket: {
    kind: 'invalid',
    title: 'Faixa de aging inválida',
    detail: 'A faixa é calculada no servidor a partir do vencimento; o valor enviado foi recusado.',
  },
  invalid_policy: {
    kind: 'invalid',
    title: 'Política de cobrança inválida',
    detail: 'Os dados da política não são aceitos. Corrija e repita.',
  },
  invalid_policy_update: {
    kind: 'invalid',
    title: 'Alteração de política inválida',
    detail: 'A mudança pedida não é aceita para esta política. Nada foi alterado.',
  },
  policy_not_found: {
    kind: 'invalid',
    title: 'Política não encontrada',
    detail: 'A política informada não existe ou não está no seu escopo.',
  },
  policy_not_approved: {
    kind: 'conflict',
    title: 'A política ainda não foi aprovada',
    detail: 'Lembrete só é criado sob política aprovada. Nada foi gravado.',
  },
  policy_inactive: {
    kind: 'conflict',
    title: 'A política está inativa',
    detail: 'Política inativa não gera lembrete. Nada foi gravado.',
  },
  invalid_reminder: {
    kind: 'invalid',
    title: 'Lembrete inválido',
    detail: 'Os dados do lembrete não são aceitos. Corrija e repita.',
  },
  invalid_reminder_type: {
    kind: 'invalid',
    title: 'Tipo de lembrete inválido',
    detail: 'Use e-mail, WhatsApp, ligação, notificação no portal ou outro.',
  },
  reminder_not_found: {
    kind: 'invalid',
    title: 'Lembrete não encontrado',
    detail: 'O lembrete informado não existe ou não está no seu escopo.',
  },
  real_message_forbidden: {
    kind: 'denied',
    title: 'Envio real de mensagem é proibido aqui',
    detail: 'Esta área simula o envio e registra a trilha; nenhuma mensagem sai para o cliente.',
  },
  rule_not_found: {
    kind: 'invalid',
    title: 'Regra não encontrada',
    detail: 'A regra informada não existe ou não está no seu escopo.',
  },
  rule_not_approved: {
    kind: 'conflict',
    title: 'A regra ainda não foi aprovada',
    detail: 'Regra de recorrência só gera cobrança depois de aprovada. Nada foi gerado.',
  },
  rule_not_active: {
    kind: 'conflict',
    title: 'A regra não está ativa',
    detail: 'Regra inativa não gera cobrança. Nada foi gerado.',
  },
  rule_inactive: {
    kind: 'conflict',
    title: 'A regra está inativa',
    detail: 'Regra inativa não produz efeito. Nada foi gerado.',
  },
  rule_suspended: {
    kind: 'conflict',
    title: 'A regra está suspensa',
    detail: 'Suspensão por inadimplência ou decisão registrada impede a geração. Nada foi gerado.',
  },
  rule_is_derived_from_activity_rule: {
    kind: 'denied',
    title: 'Esta regra é derivada da regra de atividade',
    detail: 'Ela não é editada diretamente: mude a regra de atividade de origem.',
  },
  activity_rule_missing: {
    kind: 'invalid',
    title: 'Regra de atividade ausente',
    detail: 'A obrigação precisa de uma regra de atividade cadastrada. Nada foi determinado.',
  },
  activity_rule_not_found: {
    kind: 'invalid',
    title: 'Regra de atividade não encontrada',
    detail: 'A regra informada não existe ou não está no seu escopo.',
  },
  activity_rule_inactive: {
    kind: 'conflict',
    title: 'A regra de atividade está inativa',
    detail: 'Regra inativa não determina obrigação. Nada foi determinado.',
  },
  invalid_activity_code: {
    kind: 'invalid',
    title: 'Código de atividade inválido',
    detail: 'Use um código canônico de atividade. Nada foi gravado.',
  },
  invalid_activity_type: {
    kind: 'invalid',
    title: 'Tipo de atividade inválido',
    detail: 'O tipo informado não é aceito. Nada foi gravado.',
  },
  obligation_not_determined: {
    kind: 'conflict',
    title: 'A obrigação ainda não foi determinada',
    detail: 'A determinação vem da regra de atividade, no servidor. Nada foi emitido.',
  },
  obligation_not_found: {
    kind: 'invalid',
    title: 'Obrigação não encontrada',
    detail: 'A obrigação informada não existe ou não está no seu escopo.',
  },
  obligation_not_pending: {
    kind: 'conflict',
    title: 'A obrigação não está pendente',
    detail: 'Só obrigação pendente aceita esta ação. Nada foi alterado.',
  },
  obligation_reference_required: {
    kind: 'invalid',
    title: 'Informe a obrigação de referência',
    detail: 'O documento precisa apontar para uma obrigação. Nada foi gravado.',
  },
  obligation_type_determined_by_activity_rule: {
    kind: 'denied',
    title: 'O tipo da obrigação vem da regra de atividade',
    detail: 'Ele não é escolhido na tela. O valor enviado foi recusado.',
  },
  document_type_determined_by_obligation: {
    kind: 'denied',
    title: 'O tipo do documento vem da obrigação',
    detail: 'Ele não é escolhido na tela. O valor enviado foi recusado.',
  },
  invalid_document_type: {
    kind: 'invalid',
    title: 'Tipo de documento inválido',
    detail: 'Use nfse, nfe, nfce, cte ou outro.',
  },
  invalid_obligation_type: {
    kind: 'invalid',
    title: 'Tipo de obrigação inválido',
    detail: 'Use nfse, nfe, nfce, cte ou outro.',
  },
  invalid_fiscal_transition: {
    kind: 'conflict',
    title: 'Transição fiscal não permitida',
    detail: 'A situação atual não permite essa mudança. Nada foi alterado.',
  },
  provider_not_found: {
    kind: 'invalid',
    title: 'Provedor fiscal não encontrado',
    detail: 'O provedor informado não existe ou não está no seu escopo.',
  },
  provider_not_configured: {
    kind: 'conflict',
    title: 'O provedor não está configurado',
    detail: 'Configure o provedor fiscal antes desta ação. Nada foi emitido.',
  },
  provider_not_selected_obligation_pending: {
    kind: 'conflict',
    title: 'Sem provedor selecionado, a obrigação fica pendente',
    detail: 'A ausência de provedor nunca emite nada automaticamente.',
  },
  provider_does_not_support_obligation: {
    kind: 'conflict',
    title: 'O provedor não suporta esta obrigação',
    detail: 'O provedor declarou outras obrigações. Nada foi emitido.',
  },
  provider_code_required: {
    kind: 'invalid',
    title: 'Informe o código do provedor',
    detail: 'O código é obrigatório no cadastro do provedor fiscal. Nada foi gravado.',
  },
  provider_starts_nao_configurado: {
    kind: 'conflict',
    title: 'Todo provedor começa como não configurado',
    detail: 'A situação inicial é definida pelo servidor; o valor enviado foi recusado.',
  },
  real_emission_refused_sandbox_only: {
    kind: 'denied',
    title: 'Emissão real recusada: apenas ambiente de teste',
    detail: 'Esta instalação não emite documento fiscal real. Nada foi enviado para fora.',
  },
  gateway_not_found: {
    kind: 'invalid',
    title: 'Gateway não encontrado',
    detail: 'O gateway informado não existe ou não está no seu escopo.',
  },
  gateway_not_selected: {
    kind: 'conflict',
    title: 'Nenhum gateway foi selecionado',
    detail: 'A seleção do gateway é uma decisão explícita. Nada foi cobrado.',
  },
  gateway_not_selected_sandbox_required: {
    kind: 'conflict',
    title: 'Selecione o gateway e homologue em ambiente de teste',
    detail: 'Cobrar exige gateway selecionado e homologado em sandbox. Nada foi cobrado.',
  },
  gateway_code_required: {
    kind: 'invalid',
    title: 'Informe o código do gateway',
    detail: 'O código é obrigatório no cadastro do gateway. Nada foi gravado.',
  },
  gateway_starts_nao_selecionado: {
    kind: 'conflict',
    title: 'Todo gateway começa como não selecionado',
    detail: 'A situação inicial é definida pelo servidor; o valor enviado foi recusado.',
  },
  invalid_gateway_transition: {
    kind: 'conflict',
    title: 'Transição de gateway não permitida',
    detail: 'A situação atual não permite essa mudança. Nada foi alterado.',
  },
  invalid_gateway_type: {
    kind: 'invalid',
    title: 'Tipo de gateway inválido',
    detail: 'Use boleto, pix, cartão, gateway ou outro.',
  },
  selection_is_an_explicit_transition: {
    kind: 'conflict',
    title: 'Selecionar é uma transição explícita',
    detail: 'A seleção não acontece como efeito colateral de outra alteração. Nada foi alterado.',
  },
  environment_must_be_sandbox: {
    kind: 'denied',
    title: 'O ambiente precisa ser de teste',
    detail: 'Esta instalação só opera o gateway em sandbox. Nada foi enviado para fora.',
  },
  credentials_refused_sandbox_only: {
    kind: 'denied',
    title: 'Credenciais recusadas: apenas ambiente de teste',
    detail: 'Credenciais de produção não são aceitas aqui. Nada foi gravado.',
  },
  production_refused_sem_cobranca_real: {
    kind: 'denied',
    title: 'Produção recusada: não há cobrança real',
    detail: 'Esta instalação não emite cobrança real. Nada foi enviado para fora.',
  },
  real_charge_refused_sandbox_only: {
    kind: 'denied',
    title: 'Cobrança real recusada: apenas ambiente de teste',
    detail: 'A cobrança é sintética e não sai para nenhum provedor. Nada foi enviado para fora.',
  },
  charge_not_found: {
    kind: 'invalid',
    title: 'Cobrança não encontrada',
    detail: 'A cobrança informada não existe ou não está no seu escopo.',
  },
  charge_not_pending: {
    kind: 'conflict',
    title: 'A cobrança não está pendente',
    detail: 'Só cobrança pendente aceita esta ação. Nada foi alterado.',
  },
  charge_invalid_transition: {
    kind: 'conflict',
    title: 'Transição de cobrança não permitida',
    detail: 'A situação atual não permite essa mudança. Nada foi alterado.',
  },
  charge_gateway_mismatch: {
    kind: 'conflict',
    title: 'A cobrança pertence a outro gateway',
    detail: 'O gateway informado não é o da cobrança. Nada foi alterado.',
  },
  charge_gateway_not_found: {
    kind: 'invalid',
    title: 'O gateway da cobrança não foi encontrado',
    detail: 'O gateway de origem não existe mais ou saiu do seu escopo.',
  },
  charge_receivable_not_found: {
    kind: 'invalid',
    title: 'O recebível da cobrança não foi encontrado',
    detail: 'O recebível de origem não existe mais ou saiu do seu escopo.',
  },
  charge_starts_pendente: {
    kind: 'conflict',
    title: 'Toda cobrança começa pendente',
    detail: 'A situação inicial é definida pelo servidor; o valor enviado foi recusado.',
  },
  charge_paid_only_via_conciliated_webhook: {
    kind: 'denied',
    title: 'Cobrança só é dada como paga por webhook conciliado',
    detail: 'Marcar pago na tela é recusado: o pagamento vem do webhook assinado e conciliado.',
  },
  webhook_not_validated: {
    kind: 'conflict',
    title: 'O webhook ainda não foi validado',
    detail: 'Só webhook validado pode ser conciliado. Nada foi alterado.',
  },
  webhook_signature_invalid: {
    kind: 'denied',
    title: 'Assinatura do webhook inválida',
    detail: 'O servidor recusou a mensagem por assinatura que não confere. Nada foi contado.',
  },
  webhook_payload_does_not_match_charge: {
    kind: 'conflict',
    title: 'O conteúdo do webhook não bate com a cobrança',
    detail: 'Valor ou referência divergem da cobrança apontada. Nada foi conciliado.',
  },
  signature_verdict_is_server_side: {
    kind: 'denied',
    title: 'O veredito da assinatura é do servidor',
    detail: 'A tela não declara se a assinatura é válida. O valor enviado foi recusado.',
  },
  gateway_settlement_payment_not_found: {
    kind: 'invalid',
    title: 'Pagamento da liquidação não encontrado',
    detail: 'O pagamento de origem não existe mais ou saiu do seu escopo.',
  },
  settlement_transition_not_allowed: {
    kind: 'conflict',
    title: 'Transição de liquidação não permitida',
    detail: 'A situação atual não permite essa mudança. Nada foi alterado.',
  },
  payment_requires_review: {
    kind: 'conflict',
    title: 'Este pagamento exige revisão humana',
    detail: 'O servidor marcou o caso para conferência antes de qualquer efeito. Nada foi concluído.',
  },
  estorno_requires_previous: {
    kind: 'invalid',
    title: 'O estorno exige o pagamento de origem',
    detail: 'Informe qual pagamento está sendo estornado. Nada foi gravado.',
  },
  estorno_account_mismatch: {
    kind: 'conflict',
    title: 'O estorno aponta para outra conta',
    detail: 'O pagamento de origem pertence a outra conta. Nada foi gravado.',
  },
  export_not_generated: {
    kind: 'conflict',
    title: 'A exportação ainda não foi gerada',
    detail: 'Só arquivo gerado pode ser baixado ou expirado. Nada foi alterado.',
  },
  export_expired: {
    kind: 'conflict',
    title: 'Esta exportação está expirada',
    detail: 'Arquivo expirado não é mais disponibilizado. Gere uma nova exportação.',
  },
  invalid_status: {
    kind: 'invalid',
    title: 'Situação inválida',
    detail: 'A situação informada não existe para este registro. Nada foi alterado.',
  },
  invalid_status_transition: {
    kind: 'conflict',
    title: 'Transição de situação não permitida',
    detail: 'A situação atual não permite essa mudança. Nada foi alterado.',
  },
  invalid_status_update: {
    kind: 'invalid',
    title: 'Atualização de situação inválida',
    detail: 'O servidor recusou a mudança pedida. Nada foi alterado.',
  },
  invalid_transition: {
    kind: 'conflict',
    title: 'Transição não permitida',
    detail: 'A situação atual não permite essa mudança. Nada foi alterado.',
  },
  invalid_action: {
    kind: 'invalid',
    title: 'Ação inválida',
    detail: 'A ação pedida não existe neste endereço. Nada foi feito.',
  },
  initial_status_must_be_provisionada: {
    kind: 'conflict',
    title: 'Toda provisão começa como provisionada',
    detail: 'A situação inicial é definida pelo servidor; o valor enviado foi recusado.',
  },
  commission_not_approved_cannot_pay: {
    kind: 'conflict',
    title: 'Comissão não aprovada não pode ser paga',
    detail: 'O pagamento exige revisão aprovada antes. Nada foi pago.',
  },
  auto_paid_forbidden_nao_pagar_automaticamente: {
    kind: 'denied',
    title: 'Pagamento automático é proibido',
    detail: 'Nenhuma comissão é paga sem decisão humana registrada. O pedido foi recusado.',
  },
  manual_payment_confirmation_required_nao_pagar_automaticamente: {
    kind: 'invalid',
    title: 'O pagamento exige confirmação manual explícita',
    detail: 'Sem a confirmação humana, nada é pago. Nada foi alterado.',
  },
  // ----- Validação de campo e regra de comissão/meta (wrapper `bad(res, ...)`)
  // Levantados depois de estender o extrator para o helper local
  // `const bad = (res, msg) => json(res, 400, { error: msg })`.
  invalid_name: {
    kind: 'invalid',
    title: 'Nome inválido',
    detail: 'O nome informado está vazio ou acima do limite aceito. Nada foi gravado.',
  },
  invalid_title: {
    kind: 'invalid',
    title: 'Título inválido',
    detail: 'O título informado está vazio ou acima do limite aceito. Nada foi gravado.',
  },
  invalid_percent: {
    kind: 'invalid',
    title: 'Percentual inválido',
    detail: 'O percentual precisa estar dentro da faixa aceita pela regra. Nada foi gravado.',
  },
  invalid_base_type: {
    kind: 'invalid',
    title: 'Base de cálculo inválida',
    detail: 'A base da comissão precisa ser contratado, faturado ou recebido. Nada foi gravado.',
  },
  invalid_base_value: {
    kind: 'invalid',
    title: 'Valor de base inválido',
    detail: 'O valor da base de cálculo não foi aceito pelo servidor. Nada foi gravado.',
  },
  invalid_cancel_rule: {
    kind: 'invalid',
    title: 'Regra de cancelamento inválida',
    detail: 'A regra precisa ser uma das previstas para cancelamento de comissão. Nada foi gravado.',
  },
  invalid_period_type: {
    kind: 'invalid',
    title: 'Periodicidade inválida',
    detail: 'A periodicidade precisa ser uma das previstas para a regra. Nada foi gravado.',
  },
  invalid_period_start: {
    kind: 'invalid',
    title: 'Início do período inválido',
    detail: 'A data de início do período não foi aceita. Nada foi gravado.',
  },
  invalid_period_end: {
    kind: 'invalid',
    title: 'Fim do período inválido',
    detail: 'A data de fim do período não foi aceita. Nada foi gravado.',
  },
  invalid_period_range: {
    kind: 'invalid',
    title: 'Intervalo de período inválido',
    detail: 'O fim do período precisa ser posterior ao início. Nada foi gravado.',
  },
  invalid_goal_id: {
    kind: 'invalid',
    title: 'Meta inválida',
    detail: 'O identificador da meta não corresponde a nenhuma meta acessível. Nada foi gravado.',
  },
  invalid_company_id: {
    kind: 'invalid',
    title: 'Empresa inválida',
    detail: 'O identificador da empresa não corresponde a nenhuma empresa da sua carteira. Nada foi gravado.',
  },
  invalid_opportunity_id: {
    kind: 'invalid',
    title: 'Oportunidade inválida',
    detail: 'O identificador da oportunidade não corresponde a nenhuma oportunidade acessível. Nada foi gravado.',
  },
  invalid_responsible_id: {
    kind: 'invalid',
    title: 'Responsável inválido',
    detail: 'O identificador do responsável não corresponde a nenhuma pessoa da equipe. Nada foi gravado.',
  },
  invalid_target_type: {
    kind: 'invalid',
    title: 'Tipo de alvo da meta inválido',
    detail: 'O alvo precisa ser um dos tipos previstos para a meta. Nada foi gravado.',
  },
  invalid_target_value: {
    kind: 'invalid',
    title: 'Valor-alvo inválido',
    detail: 'O valor-alvo da meta não foi aceito pelo servidor. Nada foi gravado.',
  },
  no_fields: {
    kind: 'invalid',
    title: 'Nenhum campo para alterar',
    detail: 'O pedido de alteração chegou sem nenhum campo. Nada foi gravado.',
  },
  above_rule_maximum: {
    kind: 'conflict',
    title: 'Valor acima do máximo da regra',
    detail: 'A regra de comissão vigente define um teto que este valor ultrapassa. Nada foi gravado.',
  },
  below_rule_minimum: {
    kind: 'conflict',
    title: 'Valor abaixo do mínimo da regra',
    detail: 'A regra de comissão vigente define um piso que este valor não alcança. Nada foi gravado.',
  },
  approve_in_separate_request: {
    kind: 'denied',
    title: 'Aprovar exige um pedido separado',
    detail: 'Criar e aprovar são operações distintas, de propósito. Nada foi aprovado.',
  },
  cancel_reason_required: {
    kind: 'invalid',
    title: 'O motivo do cancelamento é obrigatório',
    detail: 'O servidor exige o motivo real para cancelar. Nada foi cancelado.',
  },
  payment_evidence_note_required: {
    kind: 'invalid',
    title: 'A evidência do pagamento é obrigatória',
    detail: 'Registrar pagamento exige declarar a evidência real. Nada foi gravado.',
  },
  payment_status_conflict: {
    kind: 'conflict',
    title: 'A situação de pagamento mudou',
    detail: 'O registro já não está na situação esperada para esta operação. Recarregue antes de repetir.',
  },

});

/**
 * Classifica a resposta de erro de um servidor financeiro. Código desconhecido
 * NÃO é inventado: cai no genérico correspondente ao status HTTP, preservando
 * o código cru para diagnóstico.
 */
export function describeFinanceError(code, status = 0) {
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
export function financeErrorVariant(descriptor) {
  return descriptor && (descriptor.kind === 'denied' || descriptor.kind === 'auth') ? 'denied' : 'error';
}

/**
 * Frase pronta para o rodapé de uma falha, declarando a resposta real do
 * servidor. O código canônico fica disponível para diagnóstico, entre
 * parênteses — nunca como a mensagem principal.
 */
export function financeErrorFootnote(descriptor) {
  if (!descriptor) return '';
  const resposta = descriptor.status ? `HTTP ${descriptor.status}` : 'sem resposta';
  return `Resposta do servidor: ${resposta}${descriptor.code ? ` (${descriptor.code})` : ''}.`;
}

/**
 * Mensagem de uma linha, com o código canônico entre parênteses, para as áreas
 * FIN-05..FIN-16 que ainda exibem a falha como texto simples (ver pendências
 * declaradas no documento de entrega desta fatia).
 */
export function financeErrorMessage(code, status = 0) {
  const descriptor = describeFinanceError(code, status);
  return `${descriptor.title}. ${descriptor.detail} ${financeErrorFootnote(descriptor)}`.trim();
}

// ---------------------------------------------------------------------------
// Rótulos de situação. Os VALORES continuam canônicos (vêm dos tipos ENUM do
// PostgreSQL, ver db/migrations/077 a 080 e os endurecimentos 129 a 137);
// valor desconhecido passa cru.
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

/** `fin_status` (migração 077) — situação de conta a receber/pagar. */
const ACCOUNT_STATUS_LABELS = buildLookup({
  pendente: 'Pendente', aprovado: 'Aprovada', pago: 'Paga', recebido: 'Recebida',
  vencido: 'Vencida', cancelado: 'Cancelada', em_disputa: 'Em disputa',
  renegociado: 'Renegociada', estornado: 'Estornada', parcial: 'Baixa parcial',
});
const ACCOUNT_STATUS_TONES = buildLookup({
  pendente: 'warning', aprovado: 'info', pago: 'success', recebido: 'success',
  vencido: 'danger', cancelado: 'neutral', em_disputa: 'warning',
  renegociado: 'info', estornado: 'warning', parcial: 'info',
});
export function accountStatusLabel(value) { return labelFrom(ACCOUNT_STATUS_LABELS, value); }
export function accountStatusTone(value) { return toneFrom(ACCOUNT_STATUS_TONES, value); }

/** `fin_account_type` (migração 077). */
const ACCOUNT_TYPE_LABELS = buildLookup({ receber: 'A receber', pagar: 'A pagar' });
export function accountTypeLabel(value) { return labelFrom(ACCOUNT_TYPE_LABELS, value); }

/** `fin_approval_status` (migração 077). */
const APPROVAL_STATUS_LABELS = buildLookup({ pendente: 'Pendente', aprovado: 'Aprovada', rejeitado: 'Recusada' });
const APPROVAL_STATUS_TONES = buildLookup({ pendente: 'warning', aprovado: 'success', rejeitado: 'danger' });
export function approvalStatusLabel(value) { return labelFrom(APPROVAL_STATUS_LABELS, value); }
export function approvalStatusTone(value) { return toneFrom(APPROVAL_STATUS_TONES, value); }

/** `fin_recurrence_type` (migração 077). */
const RECURRENCE_TYPE_LABELS = buildLookup({
  unica: 'Única', mensal: 'Mensal', semanal: 'Semanal',
  quinzenal: 'Quinzenal', anual: 'Anual', sob_demanda: 'Sob demanda',
});
export function recurrenceTypeLabel(value) { return labelFrom(RECURRENCE_TYPE_LABELS, value); }

/** `fin_category` (migração 077). */
const CATEGORY_LABELS = buildLookup({
  servico: 'Serviço', material: 'Material', equipamento: 'Equipamento',
  imposto: 'Imposto', taxa: 'Taxa', outro: 'Outro',
});
export function categoryLabel(value) { return labelFrom(CATEGORY_LABELS, value); }

/** `fin_payment_method` (migração 077). */
const PAYMENT_METHOD_LABELS = buildLookup({
  pix: 'Pix', boleto: 'Boleto', transferencia: 'Transferência',
  dinheiro: 'Dinheiro', cartao: 'Cartão', outro: 'Outro',
});
export function paymentMethodLabel(value) { return labelFrom(PAYMENT_METHOD_LABELS, value); }

/** `fin_conciliation_status` (migração 078). */
const CONCILIATION_STATUS_LABELS = buildLookup({
  pendente: 'Pendente', sugerida: 'Sugerida', conciliada: 'Conciliada',
  divergente: 'Divergente', ignorada: 'Ignorada',
});
const CONCILIATION_STATUS_TONES = buildLookup({
  pendente: 'warning', sugerida: 'info', conciliada: 'success',
  divergente: 'danger', ignorada: 'neutral',
});
export function conciliationStatusLabel(value) { return labelFrom(CONCILIATION_STATUS_LABELS, value); }
export function conciliationStatusTone(value) { return toneFrom(CONCILIATION_STATUS_TONES, value); }

/** `fin_conciliation_source` (migração 078). */
const CONCILIATION_SOURCE_LABELS = buildLookup({
  importacao: 'Importação', extrato: 'Extrato', provedor: 'Provedor', manual: 'Manual',
});
export function conciliationSourceLabel(value) { return labelFrom(CONCILIATION_SOURCE_LABELS, value); }

/** `fin_collection_status` (migração 078). */
const COLLECTION_STATUS_LABELS = buildLookup({
  pendente: 'Pendente', lembrete_enviado: 'Lembrete enviado (simulado)',
  em_negociacao: 'Em negociação', acordado: 'Acordada', cancelado: 'Cancelada',
});
const COLLECTION_STATUS_TONES = buildLookup({
  pendente: 'warning', lembrete_enviado: 'info', em_negociacao: 'info',
  acordado: 'success', cancelado: 'neutral',
});
export function collectionStatusLabel(value) { return labelFrom(COLLECTION_STATUS_LABELS, value); }
export function collectionStatusTone(value) { return toneFrom(COLLECTION_STATUS_TONES, value); }

/** `fin_reminder_type` (migração 078). */
const REMINDER_TYPE_LABELS = buildLookup({
  email: 'E-mail', whatsapp: 'WhatsApp', ligacao: 'Ligação',
  notificacao_portal: 'Notificação no portal', outro: 'Outro',
});
export function reminderTypeLabel(value) { return labelFrom(REMINDER_TYPE_LABELS, value); }

/** `fin_cashflow_type` (migração 078). */
const CASHFLOW_TYPE_LABELS = buildLookup({ previsto: 'Previsto', realizado: 'Realizado' });
const CASHFLOW_TYPE_TONES = buildLookup({ previsto: 'info', realizado: 'success' });
export function cashflowTypeLabel(value) { return labelFrom(CASHFLOW_TYPE_LABELS, value); }
export function cashflowTypeTone(value) { return toneFrom(CASHFLOW_TYPE_TONES, value); }

/** `fin_aging_bucket` (migração 078) — calculada no servidor. */
const AGING_BUCKET_LABELS = buildLookup({
  a_vencer: 'A vencer', vencido_0_30: 'Vencida até 30 dias',
  vencido_31_60: 'Vencida de 31 a 60 dias', vencido_61_90: 'Vencida de 61 a 90 dias',
  vencido_90_plus: 'Vencida há mais de 90 dias',
});
const AGING_BUCKET_TONES = buildLookup({
  a_vencer: 'info', vencido_0_30: 'warning', vencido_31_60: 'warning',
  vencido_61_90: 'danger', vencido_90_plus: 'danger',
});
export function agingBucketLabel(value) { return labelFrom(AGING_BUCKET_LABELS, value); }
export function agingBucketTone(value) { return toneFrom(AGING_BUCKET_TONES, value); }

/** `fin_cost_source` (migração 078). */
const COST_SOURCE_LABELS = buildLookup({
  pessoal: 'Pessoal', equipamento: 'Equipamento', material: 'Material',
  supervisao: 'Supervisão', outro: 'Outro',
});
export function costSourceLabel(value) { return labelFrom(COST_SOURCE_LABELS, value); }

/** `fin_result_status` (migração 079). */
const RESULT_STATUS_LABELS = buildLookup({
  rascunho: 'Rascunho', em_revisao: 'Em revisão', aprovado: 'Aprovado',
  incompleto: 'Base incompleta', arquivado: 'Arquivado',
});
const RESULT_STATUS_TONES = buildLookup({
  rascunho: 'neutral', em_revisao: 'warning', aprovado: 'success',
  incompleto: 'warning', arquivado: 'neutral',
});
export function resultStatusLabel(value) { return labelFrom(RESULT_STATUS_LABELS, value); }
export function resultStatusTone(value) { return toneFrom(RESULT_STATUS_TONES, value); }

/** `fin_expense_type` (migração 079). */
const EXPENSE_TYPE_LABELS = buildLookup({
  despesa: 'Despesa', reembolso: 'Reembolso', compra: 'Compra', outro: 'Outro',
});
export function expenseTypeLabel(value) { return labelFrom(EXPENSE_TYPE_LABELS, value); }

/** `fin_expense_status` (migração 079). */
const EXPENSE_STATUS_LABELS = buildLookup({
  pendente: 'Pendente', aprovado: 'Aprovada', rejeitado: 'Recusada', cancelado: 'Cancelada',
});
const EXPENSE_STATUS_TONES = buildLookup({
  pendente: 'warning', aprovado: 'success', rejeitado: 'danger', cancelado: 'neutral',
});
export function expenseStatusLabel(value) { return labelFrom(EXPENSE_STATUS_LABELS, value); }
export function expenseStatusTone(value) { return toneFrom(EXPENSE_STATUS_TONES, value); }

/** `fin_fiscal_doc_type` (migração 079). */
const FISCAL_DOC_TYPE_LABELS = buildLookup({
  nfse: 'NFS-e', nfe: 'NF-e', nfce: 'NFC-e', cte: 'CT-e', outro: 'Outro',
});
export function fiscalDocTypeLabel(value) { return labelFrom(FISCAL_DOC_TYPE_LABELS, value); }

/** `fin_fiscal_doc_status` (migração 079). */
const FISCAL_DOC_STATUS_LABELS = buildLookup({
  rascunho: 'Rascunho', emitido: 'Emitido (sintético)', cancelado: 'Cancelado', erro: 'Com erro',
});
const FISCAL_DOC_STATUS_TONES = buildLookup({
  rascunho: 'neutral', emitido: 'success', cancelado: 'neutral', erro: 'danger',
});
export function fiscalDocStatusLabel(value) { return labelFrom(FISCAL_DOC_STATUS_LABELS, value); }
export function fiscalDocStatusTone(value) { return toneFrom(FISCAL_DOC_STATUS_TONES, value); }

/** `fin_fiscal_provider_status` (migração 079). */
const FISCAL_PROVIDER_STATUS_LABELS = buildLookup({
  configurado: 'Configurado', nao_configurado: 'Não configurado', falha: 'Com falha',
});
const FISCAL_PROVIDER_STATUS_TONES = buildLookup({
  configurado: 'success', nao_configurado: 'warning', falha: 'danger',
});
export function fiscalProviderStatusLabel(value) { return labelFrom(FISCAL_PROVIDER_STATUS_LABELS, value); }
export function fiscalProviderStatusTone(value) { return toneFrom(FISCAL_PROVIDER_STATUS_TONES, value); }

/** `fin_fiscal_obligation_status` (migração 079). */
const FISCAL_OBLIGATION_STATUS_LABELS = buildLookup({
  pendente: 'Pendente', determinada: 'Determinada', cancelada: 'Cancelada',
});
const FISCAL_OBLIGATION_STATUS_TONES = buildLookup({
  pendente: 'warning', determinada: 'success', cancelada: 'neutral',
});
export function fiscalObligationStatusLabel(value) { return labelFrom(FISCAL_OBLIGATION_STATUS_LABELS, value); }
export function fiscalObligationStatusTone(value) { return toneFrom(FISCAL_OBLIGATION_STATUS_TONES, value); }

/** `jurisdiction` das regras de atividade fiscal (migração 130). */
const JURISDICTION_LABELS = buildLookup({
  municipal: 'Municipal', estadual: 'Estadual', federal: 'Federal', nao_aplicavel: 'Não aplicável',
});
export function jurisdictionLabel(value) { return labelFrom(JURISDICTION_LABELS, value); }

/** `fin_gateway_type` (migração 079). */
const GATEWAY_TYPE_LABELS = buildLookup({
  boleto: 'Boleto', pix: 'Pix', cartao: 'Cartão', gateway: 'Gateway', outro: 'Outro',
});
export function gatewayTypeLabel(value) { return labelFrom(GATEWAY_TYPE_LABELS, value); }

/** `fin_gateway_status` (migração 079). */
const GATEWAY_STATUS_LABELS = buildLookup({
  nao_selecionado: 'Não selecionado', selecionado: 'Selecionado',
  sandbox: 'Homologado em teste', producao: 'Produção', desativado: 'Desativado',
});
const GATEWAY_STATUS_TONES = buildLookup({
  nao_selecionado: 'neutral', selecionado: 'info', sandbox: 'success',
  producao: 'warning', desativado: 'neutral',
});
export function gatewayStatusLabel(value) { return labelFrom(GATEWAY_STATUS_LABELS, value); }
export function gatewayStatusTone(value) { return toneFrom(GATEWAY_STATUS_TONES, value); }

/** `fin_webhook_status` (migração 079). */
const WEBHOOK_STATUS_LABELS = buildLookup({
  recebido: 'Recebido', validado: 'Validado', rejeitado: 'Rejeitado',
  replay: 'Repetição recusada', conciliado: 'Conciliado',
});
const WEBHOOK_STATUS_TONES = buildLookup({
  recebido: 'info', validado: 'info', rejeitado: 'danger',
  replay: 'warning', conciliado: 'success',
});
export function webhookStatusLabel(value) { return labelFrom(WEBHOOK_STATUS_LABELS, value); }
export function webhookStatusTone(value) { return toneFrom(WEBHOOK_STATUS_TONES, value); }

/** `fin_charge_status` (migração 079). */
const CHARGE_STATUS_LABELS = buildLookup({
  pendente: 'Pendente', pago: 'Paga', falhou: 'Falhou',
  cancelado: 'Cancelada', estornado: 'Estornada',
});
const CHARGE_STATUS_TONES = buildLookup({
  pendente: 'warning', pago: 'success', falhou: 'danger',
  cancelado: 'neutral', estornado: 'warning',
});
export function chargeStatusLabel(value) { return labelFrom(CHARGE_STATUS_LABELS, value); }
export function chargeStatusTone(value) { return toneFrom(CHARGE_STATUS_TONES, value); }

/** `fin_budget_status` (migração 080). */
const BUDGET_STATUS_LABELS = buildLookup({
  rascunho: 'Rascunho', em_revisao: 'Em revisão', aprovado: 'Aprovado',
  rejeitado: 'Rejeitado', arquivado: 'Arquivado',
});
const BUDGET_STATUS_TONES = buildLookup({
  rascunho: 'neutral', em_revisao: 'warning', aprovado: 'success',
  rejeitado: 'danger', arquivado: 'neutral',
});
export function budgetStatusLabel(value) { return labelFrom(BUDGET_STATUS_LABELS, value); }
export function budgetStatusTone(value) { return toneFrom(BUDGET_STATUS_TONES, value); }

/** `fin_scenario_type` (migração 080). */
const SCENARIO_TYPE_LABELS = buildLookup({
  conservador: 'Conservador', base: 'Base', otimista: 'Otimista',
  expansao: 'Expansão', pessimista: 'Pessimista',
});
export function scenarioTypeLabel(value) { return labelFrom(SCENARIO_TYPE_LABELS, value); }

/** `fin_export_status` (migração 080). */
const EXPORT_STATUS_LABELS = buildLookup({
  pendente: 'Pendente', gerando: 'Gerando', gerado: 'Gerado',
  falhou: 'Falhou', expirado: 'Expirado',
});
const EXPORT_STATUS_TONES = buildLookup({
  pendente: 'warning', gerando: 'info', gerado: 'success',
  falhou: 'danger', expirado: 'neutral',
});
export function exportStatusLabel(value) { return labelFrom(EXPORT_STATUS_LABELS, value); }
export function exportStatusTone(value) { return toneFrom(EXPORT_STATUS_TONES, value); }

/** `fin_closure_status` (migração 080). */
const CLOSURE_STATUS_LABELS = buildLookup({
  aberta: 'Aberta', fechada: 'Fechada', reaberta: 'Reaberta', bloqueada: 'Bloqueada',
});
const CLOSURE_STATUS_TONES = buildLookup({
  aberta: 'info', fechada: 'success', reaberta: 'warning', bloqueada: 'danger',
});
export function closureStatusLabel(value) { return labelFrom(CLOSURE_STATUS_LABELS, value); }
export function closureStatusTone(value) { return toneFrom(CLOSURE_STATUS_TONES, value); }

/** `fin_commission_provision_status` (migração 080). */
const COMMISSION_STATUS_LABELS = buildLookup({
  provisionada: 'Provisionada', em_revisao: 'Em revisão', revisada: 'Revisada',
  paga: 'Paga', cancelada: 'Cancelada',
});
const COMMISSION_STATUS_TONES = buildLookup({
  provisionada: 'info', em_revisao: 'warning', revisada: 'success',
  paga: 'success', cancelada: 'neutral',
});
export function commissionStatusLabel(value) { return labelFrom(COMMISSION_STATUS_LABELS, value); }
export function commissionStatusTone(value) { return toneFrom(COMMISSION_STATUS_TONES, value); }

/** Situação genérica ativo/inativo usada por regra, política e provedor. */
export function activeLabel(value) { return value ? 'Ativa' : 'Inativa'; }
export function activeTone(value) { return value ? 'success' : 'neutral'; }

/**
 * Valor monetário em centavos, sempre em reais. Valor ausente NUNCA vira
 * "R$ 0,00": o zero é um dado, a ausência é outra coisa.
 */
export function money(cents) {
  if (cents === null || cents === undefined || cents === '') return 'Dado ausente';
  const value = Number(cents);
  if (!Number.isFinite(value)) return String(cents);
  // O separador que o Intl insere entre "R$" e o número é um espaço rígido
  // (U+00A0). Ele é normalizado para espaço comum: o texto exibido é o mesmo,
  // e buscas por "R$ 120,00" (inclusive as dos gates herdados) continuam
  // encontrando o valor.
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(value / 100)
    .replace(/\u00a0/g, ' ');
}
