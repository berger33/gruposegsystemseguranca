// UX-07B: vocabulário de apresentação da família financeira.
//
// Mesma regra das camadas anteriores (UX-03B CRM, UX-04 RH, UX-05 Marcelo,
// UX-06 portais, UX-07A operação): os VALORES continuam canônicos e saem
// exatamente como `src/server/fin-api.mjs`, `fin-advanced-api.mjs`,
// `fin-budget-api.mjs` e `f03-finance-api.mjs` esperam. Só o RÓTULO exibido
// muda para português de negócio. Valor desconhecido passa cru.
//
// Esta camada NÃO decide sessão, NÃO decide concessão, NÃO altera isolamento
// por conta, NÃO aprova regra e NÃO dá baixa. Autenticação, RBAC, idempotência
// e auditoria fail-closed continuam sendo decididos no servidor; aqui apenas
// explicamos, em português, a resposta que chegou.
//
// O defeito central que esta camada existe para impedir: em
// `src/app/admin/financeiro/FinanceiroWorkspace.tsx` todo erro caía em
// `new Error(data.error || 'Erro ' + status)` e era exibido cru num `<p
// role="alert">`. Dinheiro é exatamente onde "falha" não pode parecer "zero":
// uma leitura que falhou deixava a tabela de recebíveis vazia, dizendo
// "Nenhum recebível encontrado."

const ERROR_MESSAGES = Object.freeze({
  // ----- Sessão, identidade, concessão e origem ------------------------------
  unauthorized: {
    kind: 'auth',
    title: 'Entre com a sua identidade de equipe',
    detail: 'O pedido chegou sem sessão válida. Nada foi lido e nada foi gravado.',
  },
  admin_session_required: {
    kind: 'auth',
    title: 'Esta área exige uma sessão de equipe',
    detail: 'Sua sessão expirou ou não foi reconhecida. Entre novamente para continuar.',
  },
  individual_staff_required: {
    kind: 'denied',
    title: 'Esta ação exige identidade individual',
    detail: 'Credencial compartilhada não serve aqui: a trilha financeira precisa saber quem agiu.',
  },
  forbidden: {
    kind: 'denied',
    title: 'Seu perfil não tem concessão para esta operação financeira',
    detail: 'O menu pode mostrar o caminho, mas a concessão é verificada no servidor. Nada foi exibido nem alterado. Peça a liberação ao TI.',
  },
  permission_scope_denied: {
    kind: 'denied',
    title: 'Sem a concessão específica para este escopo',
    detail: 'Seu papel aparece no menu, mas a concessão para este conjunto de dados não foi dada. Nada foi exibido.',
  },
  accountant_scope_required: {
    kind: 'denied',
    title: 'Esta leitura é exclusiva do escopo contábil',
    detail: 'O acesso contábil é concedido à parte. Nada foi exibido.',
  },
  accountant_limited_required: {
    kind: 'denied',
    title: 'Este acesso contábil é limitado e precisa ser concedido',
    detail: 'O perfil contábil restrito não cobre esta leitura. Nada foi exibido.',
  },
  read_only: {
    kind: 'denied',
    title: 'Este acesso é somente leitura',
    detail: 'O perfil pode consultar, mas não alterar. Nada foi gravado.',
  },
  forbidden_origin: {
    kind: 'denied',
    title: 'Origem do pedido recusada',
    detail: 'A requisição veio de uma origem que o servidor não aceita. Abra a tela pelo endereço oficial do sistema.',
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

  // ----- Falhas de leitura, infraestrutura e auditoria ------------------------
  finance_flow_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler o financeiro agora',
    detail: 'A consulta falhou. Isto NÃO significa que não existam contas, baixas ou regras: nada foi lido. Nenhum valor exibido como zero representa saldo real.',
  },
  audit_unavailable: {
    kind: 'retry',
    title: 'A trilha de auditoria não respondeu, então a ação foi recusada',
    detail: 'O financeiro é fail-closed de propósito: sem registro de auditoria, nenhum lançamento é gravado. Tente novamente em instantes.',
  },
  internal: {
    kind: 'retry',
    title: 'Falha no servidor financeiro',
    detail: 'O servidor respondeu com erro e nada foi carregado nem gravado. Isto não é a mesma coisa que não haver lançamentos.',
  },
  migration_required: {
    kind: 'retry',
    title: 'O banco ainda não tem a estrutura desta função',
    detail: 'A migração correspondente não foi aplicada neste ambiente. Nada foi lido nem gravado — procure o TI.',
  },

  // ----- Registros não encontrados -------------------------------------------
  not_found: { kind: 'invalid', title: 'Registro não encontrado', detail: 'O endereço não corresponde a nada que você possa ver. Volte e tente pela lista.' },
  account_not_found: { kind: 'invalid', title: 'Conta não encontrada', detail: 'A conta informada não existe ou está fora do seu escopo.' },
  client_account_not_found: { kind: 'invalid', title: 'Conta do cliente não encontrada', detail: 'A conta de cliente informada não existe ou está fora do seu escopo.' },
  receivable_not_found: { kind: 'invalid', title: 'Recebível não encontrado', detail: 'O recebível informado não existe ou está fora do seu escopo.' },
  payment_not_found: { kind: 'invalid', title: 'Pagamento não encontrado', detail: 'O lançamento informado não existe. Nada foi alterado.' },
  rule_not_found: { kind: 'invalid', title: 'Regra de recorrência não encontrada', detail: 'A regra informada não existe. Nada foi alterado.' },
  policy_not_found: { kind: 'invalid', title: 'Política de cobrança não encontrada', detail: 'A política informada não existe. Nada foi alterado.' },
  reminder_not_found: { kind: 'invalid', title: 'Lembrete de cobrança não encontrado', detail: 'O lembrete informado não existe. Nada foi alterado.' },
  statement_not_found: { kind: 'invalid', title: 'Extrato bancário não encontrado', detail: 'O extrato informado não existe. Nada foi alterado.' },
  bank_transaction_not_found: { kind: 'invalid', title: 'Lançamento bancário não encontrado', detail: 'O lançamento do extrato não existe. Nada foi conciliado.' },
  budget_not_found: { kind: 'invalid', title: 'Orçamento não encontrado', detail: 'O orçamento informado não existe. Nada foi alterado.' },
  employee_not_found: { kind: 'invalid', title: 'Funcionário não encontrado', detail: 'O cadastro informado não existe ou está fora do seu escopo.' },
  export_not_generated: { kind: 'invalid', title: 'Esta exportação ainda não foi gerada', detail: 'Não há arquivo para baixar: gere a exportação antes.' },
  export_expired: { kind: 'invalid', title: 'Esta exportação expirou', detail: 'O arquivo não está mais disponível para download. Gere uma nova exportação.' },

  // ----- Conflitos de estado --------------------------------------------------
  already_approved: { kind: 'conflict', title: 'Este registro já está aprovado', detail: 'Nada foi aprovado duas vezes. A aprovação anterior continua valendo.' },
  already_conciliated: { kind: 'conflict', title: 'Este lançamento já foi conciliado', detail: 'Nada foi conciliado duas vezes. Consulte a conciliação existente.' },
  bank_transaction_already_conciliated: { kind: 'conflict', title: 'Este lançamento bancário já está conciliado', detail: 'Um lançamento do extrato só concilia uma vez. Nada foi duplicado.' },
  already_generated: { kind: 'conflict', title: 'Esta cobrança já foi gerada', detail: 'A geração é idempotente: nada foi duplicado. Consulte a cobrança existente.' },
  already_in_status: { kind: 'conflict', title: 'O registro já está nesta situação', detail: 'Nada mudou, e nada foi gravado novamente.' },
  already_aged_for_competence: { kind: 'conflict', title: 'Já existe aging apurado para esta competência', detail: 'Nada foi recalculado por cima. Consulte o snapshot existente.' },
  history_immutable: { kind: 'conflict', title: 'O histórico financeiro não pode ser alterado', detail: 'Lançamento histórico não é editado nem apagado: registre um estorno ou uma revisão.' },
  estorno_already_exists: { kind: 'conflict', title: 'Este pagamento já foi estornado', detail: 'Nada foi estornado duas vezes. Consulte o estorno existente.' },
  estorno_requires_previous: { kind: 'conflict', title: 'O estorno precisa apontar o pagamento de origem', detail: 'Sem o lançamento original não há o que estornar. Nada foi gravado.' },
  estorno_amount_exceeds_origin: { kind: 'conflict', title: 'O estorno é maior que o pagamento de origem', detail: 'Não é possível estornar mais do que foi pago. Nada foi gravado.' },
  estorno_account_mismatch: { kind: 'conflict', title: 'O estorno aponta para outra conta', detail: 'Origem e estorno precisam ser da mesma conta. Nada foi gravado.' },
  amount_exceeds_receivable: { kind: 'conflict', title: 'O valor é maior que o saldo do recebível', detail: 'A baixa não foi registrada. Confira o saldo em aberto.' },
  amount_paid_exceeds_amount: { kind: 'conflict', title: 'O total pago ficaria acima do valor da conta', detail: 'A baixa não foi registrada. Confira o valor.' },
  overpayment: { kind: 'conflict', title: 'O valor informado gera pagamento a maior', detail: 'A baixa não foi registrada. Ajuste o valor ou registre o excedente de forma explícita.' },
  settlement_transition_not_allowed: { kind: 'conflict', title: 'Esta baixa não é permitida na situação atual da conta', detail: 'Nada foi gravado. Confira a situação da conta antes de repetir.' },
  invalid_status_transition: { kind: 'conflict', title: 'Esta mudança de situação não é permitida', detail: 'O caminho entre as duas situações não existe no fluxo. Nada foi gravado.' },
  payment_requires_review: { kind: 'conflict', title: 'Este pagamento precisa de revisão humana', detail: 'O lançamento ficou retido para conferência e não foi efetivado automaticamente.' },
  auto_paid_forbidden_nao_pagar_automaticamente: {
    kind: 'denied',
    title: 'O sistema não paga automaticamente',
    detail: 'Baixa automática é proibida por decisão de produto: todo pagamento exige confirmação humana. Nada foi pago.',
  },
  manual_payment_confirmation_required_nao_pagar_automaticamente: {
    kind: 'conflict',
    title: 'Este pagamento exige confirmação manual',
    detail: 'O sistema não paga sozinho. Confirme o pagamento explicitamente — nada foi pago até lá.',
  },
  real_message_forbidden: {
    kind: 'denied',
    title: 'Envio real de mensagem não é permitido aqui',
    detail: 'A cobrança registra o lembrete, mas não dispara e-mail, SMS ou WhatsApp reais. Nada foi enviado.',
  },
  policy_inactive: { kind: 'conflict', title: 'Política de cobrança inativa', detail: 'Uma política inativa não gera lembrete. Nada foi gravado.' },
  policy_not_approved: { kind: 'conflict', title: 'Política de cobrança ainda não aprovada', detail: 'Sem aprovação, a política não produz efeito. Nada foi gravado.' },
  rule_inactive: { kind: 'conflict', title: 'Regra de recorrência inativa', detail: 'Uma regra inativa não gera cobrança. Nada foi gravado.' },
  rule_not_approved: { kind: 'conflict', title: 'Regra de recorrência ainda não aprovada', detail: 'Sem aprovação, a regra não gera cobrança. Nada foi gravado.' },
  rule_suspended: { kind: 'conflict', title: 'Regra de recorrência suspensa', detail: 'A suspensão impede novas gerações. O histórico é preservado.' },
  budget_archived_locked: { kind: 'conflict', title: 'Orçamento arquivado não aceita alteração', detail: 'O histórico é preservado. Crie um novo orçamento em vez de reescrever este.' },
  approved_budget_locked_requires_revision: { kind: 'conflict', title: 'Orçamento aprovado só muda por revisão', detail: 'Edição direta de orçamento aprovado não é permitida: registre uma revisão, com motivo.' },
  revision_required_use_action_revise: { kind: 'conflict', title: 'Use a ação de revisão para alterar este orçamento', detail: 'A alteração direta foi recusada para preservar o histórico. Nada foi gravado.' },
  revision_requires_approved_budget: { kind: 'conflict', title: 'Só orçamento aprovado pode ser revisado', detail: 'Revisão pressupõe aprovação anterior. Nada foi gravado.' },
  revision_requires_identity: { kind: 'conflict', title: 'A revisão exige identidade de quem revisa', detail: 'A trilha precisa saber quem revisou. Nada foi gravado.' },
  approval_requires_identity_and_date: { kind: 'conflict', title: 'A aprovação exige quem aprovou e quando', detail: 'Sem identidade e data não há aprovação registrável. Nada foi gravado.' },
  approval_must_be_cleared: { kind: 'conflict', title: 'A aprovação anterior precisa ser retirada antes', detail: 'Não é possível sobrepor uma aprovação existente. Nada foi gravado.' },
  invalid_version_change: { kind: 'conflict', title: 'Mudança de versão inválida', detail: 'A versão informada não sucede a versão atual. Nada foi gravado.' },
  initial_status_must_be_provisionada: { kind: 'conflict', title: 'O lançamento precisa começar como provisionada', detail: 'A situação inicial é fixa no fluxo. Nada foi gravado.' },
  margin_percent_not_accepted_calculated_from_revenue_and_cost: {
    kind: 'invalid',
    title: 'A margem não é digitada: ela é calculada',
    detail: 'O percentual de margem vem de receita e custo, para não haver número inventado. Informe receita e custo.',
  },
  premises_10_2000_required_cenario_expansao_premissas_explicitas: {
    kind: 'invalid',
    title: 'Cenário de expansão exige premissas explícitas',
    detail: 'Escreva de 10 a 2000 caracteres de premissas. Projeção sem premissa declarada não é aceita.',
  },
  premises_10_2000_required_nao_prometer_resultado: {
    kind: 'invalid',
    title: 'O cenário exige premissas escritas, e não promete resultado',
    detail: 'Escreva de 10 a 2000 caracteres de premissas. O sistema projeta cenário, não garante resultado.',
  },
  duplicate_bank_ref: { kind: 'conflict', title: 'Esta referência bancária já existe', detail: 'O mesmo lançamento já foi importado. Nada foi duplicado.' },
  duplicate_competence: { kind: 'conflict', title: 'Esta competência já existe', detail: 'Já há registro para a mesma competência. Nada foi duplicado.' },
  duplicate_competence_item: { kind: 'conflict', title: 'Este item já existe nesta competência', detail: 'Nada foi duplicado.' },
  duplicate_competence_type: { kind: 'conflict', title: 'Já existe registro deste tipo nesta competência', detail: 'Nada foi duplicado.' },
  duplicate_import_record: { kind: 'conflict', title: 'Este registro de importação já existe', detail: 'A importação é idempotente: nada foi duplicado.' },
  duplicate_name: { kind: 'conflict', title: 'Já existe registro com este nome', detail: 'Nada foi duplicado.' },
  duplicate_recurrence_id: { kind: 'conflict', title: 'Este identificador de recorrência já existe', detail: 'Nada foi duplicado. Use outro identificador.' },
  duplicate_reminder: { kind: 'conflict', title: 'Este lembrete já foi registrado', detail: 'Nada foi duplicado.' },
  duplicate_scenario_type_for_budget: { kind: 'conflict', title: 'Este orçamento já tem um cenário deste tipo', detail: 'Nada foi duplicado. Edite o cenário existente.' },
  duplicate_storage_key: { kind: 'conflict', title: 'Esta chave de arquivo já está em uso', detail: 'Nada foi sobrescrito.' },
  client_account_mismatch: { kind: 'conflict', title: 'A conta do cliente não corresponde ao registro', detail: 'Confira a conta antes de repetir. Nada foi gravado.' },
  contract_account_mismatch: { kind: 'conflict', title: 'Contrato e conta não pertencem ao mesmo cliente', detail: 'Nada foi gravado. Confira a cadeia cliente → contrato → conta.' },
  post_contract_scope_mismatch: { kind: 'conflict', title: 'O posto não pertence a este contrato', detail: 'Nada foi gravado. Confira o escopo antes de repetir.' },
  due_date_mismatch: { kind: 'conflict', title: 'O vencimento não corresponde ao esperado', detail: 'Nada foi gravado. Confira a data de vencimento.' },
  due_before_competence: { kind: 'invalid', title: 'O vencimento é anterior à competência', detail: 'Uma conta não vence antes do período a que se refere. Nada foi gravado.' },
  allocated_amount_mismatch: { kind: 'conflict', title: 'A soma do rateio não fecha com o valor total', detail: 'Nada foi gravado: rateio precisa somar exatamente o valor da conta.' },
  no_change_requested: { kind: 'invalid', title: 'Nenhuma alteração foi pedida', detail: 'O pedido chegou sem mudança nenhuma. Nada foi gravado.' },

  // ----- Idempotência ---------------------------------------------------------
  idempotency_key_required_or_invalid: { kind: 'invalid', title: 'A chave que impede o envio duplicado está ausente ou inválida', detail: 'Recarregue a página para gerar uma nova. Nada foi gravado.' },
  idempotency_key_8_200: { kind: 'invalid', title: 'A chave de repetição tem tamanho inválido', detail: 'Use de 8 a 200 caracteres. Nada foi gravado.' },
  idempotency_key_conflict: { kind: 'conflict', title: 'Esta chave já identificou outra ação', detail: 'Nada foi gravado duas vezes. Recarregue a página para ver o resultado da primeira.' },
  idempotency_key_reused_with_different_payload: { kind: 'conflict', title: 'A mesma chave foi reaproveitada com dados diferentes', detail: 'Nada foi gravado. Recarregue a página antes de repetir a ação.' },
  idempotency_conflict: { kind: 'conflict', title: 'Conflito de repetição', detail: 'A ação já havia sido registrada com outros dados. Nada foi gravado duas vezes.' },

  // ----- Campos obrigatórios, formato e limites -------------------------------
  invalid_json: { kind: 'invalid', title: 'O corpo enviado não é um JSON válido', detail: 'Recarregue a página e repita a ação. Nada foi gravado.' },
  invalid_request: { kind: 'invalid', title: 'O servidor recusou os dados enviados', detail: 'Revise os campos destacados e tente novamente. Nada foi gravado.' },
  missing_fields: { kind: 'invalid', title: 'Faltam campos obrigatórios', detail: 'Preencha os campos pedidos. Nada foi gravado.' },
  missing_id: { kind: 'invalid', title: 'Falta o identificador do registro', detail: 'Nada foi gravado.' },
  missing_receivable_id: { kind: 'invalid', title: 'Informe o recebível', detail: 'Sem o recebível não há a que vincular o lançamento. Nada foi gravado.' },
  missing_payable_id: { kind: 'invalid', title: 'Informe a conta a pagar', detail: 'Sem a conta não há a que vincular o lançamento. Nada foi gravado.' },
  exactly_one_account_ref_required: { kind: 'invalid', title: 'Informe exatamente uma conta: a receber OU a pagar', detail: 'As duas ao mesmo tempo, ou nenhuma, tornam o lançamento ambíguo. Nada foi gravado.' },
  bank_transaction_required: { kind: 'invalid', title: 'Informe o lançamento bancário', detail: 'A conciliação precisa apontar a linha do extrato. Nada foi gravado.' },
  competence_date_required: { kind: 'invalid', title: 'Informe a competência', detail: 'Nada foi gravado.' },
  period_required: { kind: 'invalid', title: 'Informe o período', detail: 'A consulta precisa de início e fim. Nada foi lido.' },
  period_end_gte_start: { kind: 'invalid', title: 'O fim do período é anterior ao início', detail: 'Corrija as datas e tente novamente.' },
  end_before_start: { kind: 'invalid', title: 'A data final é anterior à inicial', detail: 'Corrija as datas e tente novamente.' },
  invalid_period: { kind: 'invalid', title: 'Período inválido', detail: 'A data final precisa ser igual ou posterior à inicial.' },
  status_required: { kind: 'invalid', title: 'Informe a situação', detail: 'Nada foi gravado.' },
  authorized_by_required: { kind: 'invalid', title: 'Informe quem autorizou', detail: 'A trilha financeira precisa saber quem autorizou. Nada foi gravado.' },
  invalid_authorized_by_identity: { kind: 'invalid', title: 'A identidade de quem autorizou é inválida', detail: 'Nada foi gravado.' },
  responsible_name_2_200_required: { kind: 'invalid', title: 'Informe o responsável', detail: 'Use de 2 a 200 caracteres. Nada foi gravado.' },
  storage_key_required_for_gerado: { kind: 'invalid', title: 'Exportação gerada exige a chave do arquivo', detail: 'Sem a chave não há arquivo a entregar. Nada foi gravado.' },
  import_record_key_required: { kind: 'invalid', title: 'Informe a chave do registro importado', detail: 'Nada foi gravado.' },
  import_record_key_without_import: { kind: 'invalid', title: 'A chave de importação veio sem a importação correspondente', detail: 'Nada foi gravado.' },
  file_metadata_invalid: { kind: 'invalid', title: 'Os dados do arquivo são inválidos', detail: 'Nada foi anexado.' },
  file_name_1_500: { kind: 'invalid', title: 'Nome de arquivo inválido', detail: 'Use de 1 a 500 caracteres.' },
  file_url_5_1000: { kind: 'invalid', title: 'Endereço de arquivo inválido', detail: 'Use de 5 a 1000 caracteres.' },
  storage_key_5_500: { kind: 'invalid', title: 'Chave de arquivo inválida', detail: 'Use de 5 a 500 caracteres.' },
  name_3_200: { kind: 'invalid', title: 'Nome inválido', detail: 'Use de 3 a 200 caracteres.' },
  name_3_200_required: { kind: 'invalid', title: 'Informe o nome', detail: 'Use de 3 a 200 caracteres. Nada foi gravado.' },
  title_5_200: { kind: 'invalid', title: 'Título inválido', detail: 'Use de 5 a 200 caracteres.' },
  description_10_1000: { kind: 'invalid', title: 'Descrição inválida', detail: 'Use de 10 a 1000 caracteres.' },
  description_10_2000: { kind: 'invalid', title: 'Descrição inválida', detail: 'Use de 10 a 2000 caracteres.' },
  content_20_2000_required: { kind: 'invalid', title: 'Escreva o conteúdo', detail: 'Use de 20 a 2000 caracteres. Nada foi gravado.' },
  notes_10_1000_required: { kind: 'invalid', title: 'Escreva a observação', detail: 'Use de 10 a 1000 caracteres. Nada foi gravado.' },
  notes_10_2000: { kind: 'invalid', title: 'Observação inválida', detail: 'Use de 10 a 2000 caracteres.' },
  reason_10_1000_required: { kind: 'invalid', title: 'Escreva o motivo', detail: 'Em dinheiro, motivo não é opcional: use de 10 a 1000 caracteres. Nada foi gravado.' },
  divergence_reason_10_1000_required: { kind: 'invalid', title: 'Escreva o motivo da divergência', detail: 'Conciliação com diferença exige justificativa de 10 a 1000 caracteres. Nada foi gravado.' },
  revision_reason_10_1000_required: { kind: 'invalid', title: 'Escreva o motivo da revisão', detail: 'Use de 10 a 1000 caracteres. Nada foi gravado.' },
  suggestion_reason_10_1000_required: { kind: 'invalid', title: 'Escreva o motivo da sugestão', detail: 'Use de 10 a 1000 caracteres. Nada foi gravado.' },
  rateio_rule_10_1000_required: { kind: 'invalid', title: 'Escreva a regra de rateio', detail: 'Use de 10 a 1000 caracteres. Nada foi gravado.' },
  rateio_percent_0_01_100: { kind: 'invalid', title: 'Percentual de rateio inválido', detail: 'Use um valor entre 0,01 e 100.' },
  source_material_too_long: { kind: 'invalid', title: 'O material de origem é longo demais', detail: 'Reduza o texto enviado. Nada foi gravado.' },
  filters_object_required: { kind: 'invalid', title: 'Os filtros precisam ser enviados como objeto', detail: 'Nada foi gravado.' },
  totals_object_required: { kind: 'invalid', title: 'Os totais precisam ser enviados como objeto', detail: 'Nada foi gravado.' },
  totals_gte_0: { kind: 'invalid', title: 'Totais não podem ser negativos', detail: 'Corrija os valores e tente novamente.' },
  amount_cents_gte_0: { kind: 'invalid', title: 'O valor não pode ser negativo', detail: 'Informe um valor em centavos maior ou igual a zero.' },
  invalid_amount_cents: { kind: 'invalid', title: 'Valor inválido', detail: 'Informe o valor em centavos, como número inteiro.' },
  invalid_amount_matched: { kind: 'invalid', title: 'Valor conciliado inválido', detail: 'Informe o valor conciliado em centavos.' },
  invalid_source_amount: { kind: 'invalid', title: 'Valor de origem inválido', detail: 'Informe um valor numérico válido.' },
  invalid_cost_amount: { kind: 'invalid', title: 'Valor de custo inválido', detail: 'Informe um valor numérico válido.' },
  invalid_cashflow_amount: { kind: 'invalid', title: 'Valor de fluxo de caixa inválido', detail: 'Informe um valor numérico válido.' },
  invalid_aging_amount: { kind: 'invalid', title: 'Valor de aging inválido', detail: 'Informe um valor numérico válido.' },
  invalid_days_before: { kind: 'invalid', title: 'Antecedência inválida', detail: 'Informe um número inteiro de dias.' },
  invalid_escalation_level: { kind: 'invalid', title: 'Nível de escalonamento inválido', detail: 'Use um dos níveis oferecidos pela tela.' },

  // ----- Identificadores e catálogos -----------------------------------------
  invalid_id: { kind: 'invalid', title: 'Identificador inválido', detail: 'O identificador enviado não tem o formato aceito.' },
  invalid_account_id: { kind: 'invalid', title: 'Conta inválida', detail: 'O identificador da conta não tem o formato aceito.' },
  invalid_client_account_id: { kind: 'invalid', title: 'Conta do cliente inválida', detail: 'O identificador da conta do cliente não tem o formato aceito.' },
  invalid_receivable_id: { kind: 'invalid', title: 'Recebível inválido', detail: 'O identificador do recebível não tem o formato aceito.' },
  invalid_rule_id: { kind: 'invalid', title: 'Regra inválida', detail: 'O identificador da regra não tem o formato aceito.' },
  invalid_policy_id: { kind: 'invalid', title: 'Política inválida', detail: 'O identificador da política não tem o formato aceito.' },
  invalid_reminder_id: { kind: 'invalid', title: 'Lembrete inválido', detail: 'O identificador do lembrete não tem o formato aceito.' },
  invalid_budget_id: { kind: 'invalid', title: 'Orçamento inválido', detail: 'O identificador do orçamento não tem o formato aceito.' },
  invalid_closure_id: { kind: 'invalid', title: 'Fechamento inválido', detail: 'O identificador do fechamento não tem o formato aceito.' },
  invalid_export_id: { kind: 'invalid', title: 'Exportação inválida', detail: 'O identificador da exportação não tem o formato aceito.' },
  invalid_provision_id: { kind: 'invalid', title: 'Provisão inválida', detail: 'O identificador da provisão não tem o formato aceito.' },
  invalid_provision_date: { kind: 'invalid', title: 'Data de provisão inválida', detail: 'Informe uma data válida.' },
  invalid_competence_date: { kind: 'invalid', title: 'Competência inválida', detail: 'Informe uma data de competência válida.' },
  invalid_due_date: { kind: 'invalid', title: 'Vencimento inválido', detail: 'Informe uma data de vencimento válida.' },
  invalid_import_date: { kind: 'invalid', title: 'Data de importação inválida', detail: 'Informe uma data válida.' },
  invalid_aging_date: { kind: 'invalid', title: 'Data de aging inválida', detail: 'Informe uma data válida.' },
  invalid_aging_bucket: { kind: 'invalid', title: 'Faixa de aging inválida', detail: 'Use uma das faixas oferecidas pela tela.' },
  invalid_aging_snapshot: { kind: 'invalid', title: 'Snapshot de aging inválido', detail: 'Os dados enviados não formam um snapshot aceitável.' },
  invalid_cashflow_snapshot: { kind: 'invalid', title: 'Snapshot de fluxo de caixa inválido', detail: 'Os dados enviados não formam um snapshot aceitável.' },
  invalid_cashflow_type: { kind: 'invalid', title: 'Tipo de fluxo de caixa inválido', detail: 'Use um dos tipos oferecidos pela tela.' },
  invalid_cost_allocation: { kind: 'invalid', title: 'Rateio de custo inválido', detail: 'Revise a distribuição informada.' },
  invalid_cost_filter: { kind: 'invalid', title: 'Filtro de custo inválido', detail: 'Revise os filtros informados.' },
  invalid_cost_import: { kind: 'invalid', title: 'Importação de custo inválida', detail: 'Revise o arquivo ou os dados enviados.' },
  invalid_cost_reference: { kind: 'invalid', title: 'Referência de custo inválida', detail: 'Revise a referência informada.' },
  invalid_cost_source: { kind: 'invalid', title: 'Origem de custo inválida', detail: 'Use uma das origens oferecidas pela tela.' },
  invalid_source: { kind: 'invalid', title: 'Origem inválida', detail: 'Use uma das origens oferecidas pela tela.' },
  invalid_reference: { kind: 'invalid', title: 'Referência inválida', detail: 'Revise a referência informada.' },
  invalid_reminder: { kind: 'invalid', title: 'Lembrete inválido', detail: 'Revise os dados do lembrete.' },
  invalid_reminder_type: { kind: 'invalid', title: 'Tipo de lembrete inválido', detail: 'Use um dos tipos oferecidos pela tela.' },
  invalid_policy: { kind: 'invalid', title: 'Política inválida', detail: 'Revise os dados da política de cobrança.' },
  invalid_policy_update: { kind: 'invalid', title: 'Alteração de política inválida', detail: 'Revise os campos enviados. Nada foi gravado.' },
  invalid_statement: { kind: 'invalid', title: 'Extrato inválido', detail: 'Revise os dados do extrato bancário.' },
  invalid_statement_totals: { kind: 'invalid', title: 'Totais do extrato inválidos', detail: 'Os totais informados não batem com o formato esperado.' },
  invalid_transaction: { kind: 'invalid', title: 'Lançamento bancário inválido', detail: 'Revise os dados da linha do extrato.' },
  transaction_fields_invalid: { kind: 'invalid', title: 'Campos do lançamento bancário inválidos', detail: 'Revise os campos e tente novamente.' },
  invalid_conciliation: { kind: 'invalid', title: 'Conciliação inválida', detail: 'Revise os dados da conciliação. Nada foi gravado.' },
  invalid_confirmation: { kind: 'invalid', title: 'Confirmação inválida', detail: 'A confirmação enviada não foi aceita. Nada foi gravado.' },
  invalid_approval: { kind: 'invalid', title: 'Aprovação inválida', detail: 'Os dados da aprovação não foram aceitos. Nada foi gravado.' },
  invalid_action: { kind: 'invalid', title: 'Ação inválida', detail: 'A ação enviada não existe no catálogo do servidor.' },
  invalid_status: { kind: 'invalid', title: 'Situação inválida', detail: 'A situação enviada não existe no catálogo do servidor.' },
  invalid_status_update: { kind: 'invalid', title: 'Alteração de situação inválida', detail: 'Revise a situação informada. Nada foi gravado.' },
  invalid_scenario_type: { kind: 'invalid', title: 'Tipo de cenário inválido', detail: 'Use um dos tipos oferecidos pela tela.' },
  invalid_import_totals: { kind: 'invalid', title: 'Totais de importação inválidos', detail: 'Os totais informados não batem com os registros enviados.' },
});

/**
 * Classifica uma falha financeira sem suavizar o significado.
 * @param {string|null|undefined} code código canônico, quando houver
 * @param {number} status status HTTP (0 quando a requisição nem chegou)
 */
export function describeFinError(code, status = 0) {
  const known = code && Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : null;
  if (known) {
    return { ...known, code, status, canRetry: known.kind === 'retry' || known.kind === 'auth' };
  }
  if (status === 0) {
    return {
      kind: 'network',
      title: 'Não foi possível falar com o servidor',
      detail: 'A consulta não chegou a ser respondida. Nenhum valor desta tela pode ser lido como saldo real.',
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
  return { ...ERROR_MESSAGES.internal, code: code || null, status, canRetry: true };
}

/** Variante visual de `UiState`. Sessão expirada não é recusa de permissão. */
export function finErrorVariant(descriptor) {
  return descriptor && descriptor.kind === 'denied' ? 'denied' : 'error';
}

/** Rodapé declarando a resposta real do servidor; código só entre parênteses. */
export function finErrorFootnote(descriptor) {
  if (!descriptor) return '';
  const resposta = descriptor.status ? `HTTP ${descriptor.status}` : 'sem resposta';
  return `Resposta do servidor: ${resposta}${descriptor.code ? ` (${descriptor.code})` : ''}.`;
}

// ---------------------------------------------------------------------------
// Rótulos e formatação. VALOR canônico; desconhecido passa cru.
// ---------------------------------------------------------------------------

function labelFrom(map, value) {
  if (value === null || value === undefined || value === '') return '—';
  const key = String(value).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : String(value);
}

/**
 * Situação de conta a receber/pagar — enum `fin_status` do banco. Os valores
 * saem do servidor exatamente assim; só o rótulo muda.
 */
const ACCOUNT_STATUS_LABELS = Object.freeze({
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  pago: 'Pago',
  recebido: 'Recebido',
  vencido: 'Vencido',
  cancelado: 'Cancelado',
  em_disputa: 'Em disputa',
  renegociado: 'Renegociado',
  estornado: 'Estornado',
  parcial: 'Parcialmente baixada',
});
export function accountStatusLabel(value) { return labelFrom(ACCOUNT_STATUS_LABELS, value); }
export function accountStatusTone(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'pago' || key === 'recebido') return 'success';
  if (key === 'cancelado' || key === 'estornado') return 'neutral';
  if (key === 'vencido' || key === 'em_disputa') return 'danger';
  if (key === 'parcial' || key === 'renegociado') return 'warning';
  if (key === 'pendente' || key === 'aprovado') return 'info';
  return 'neutral';
}

/** Situação de conciliação bancária — enum `fin_conciliation_status`. */
const CONCILIATION_STATUS_LABELS = Object.freeze({
  pendente: 'Pendente',
  sugerida: 'Sugerida',
  conciliada: 'Conciliada',
  divergente: 'Divergente',
  ignorada: 'Ignorada',
});
export function conciliationStatusLabel(value) { return labelFrom(CONCILIATION_STATUS_LABELS, value); }
export function conciliationStatusTone(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'conciliada') return 'success';
  if (key === 'divergente') return 'danger';
  if (key === 'sugerida') return 'warning';
  if (key === 'pendente') return 'info';
  return 'neutral';
}

/** Situação de orçamento — enum `fin_budget_status`. */
const BUDGET_STATUS_LABELS = Object.freeze({
  rascunho: 'Rascunho',
  em_revisao: 'Em revisão',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  arquivado: 'Arquivado',
});
export function budgetStatusLabel(value) { return labelFrom(BUDGET_STATUS_LABELS, value); }

/**
 * Dinheiro em centavos, como o servidor devolve. Valor ausente NÃO vira zero:
 * é declarado como ausente. Esta é a regra que impede "falha" de virar "R$
 * 0,00" numa tela financeira.
 */
export function moneyLabel(cents) {
  if (cents === null || cents === undefined || cents === '') return 'Dado ausente';
  const numero = Number(cents);
  if (!Number.isFinite(numero)) return 'Dado ausente';
  return `R$ ${(numero / 100).toFixed(2).replace('.', ',')}`;
}
