// UX-07 (fatia C — Contratos): vocabulário de apresentação das telas
// `/admin/contratos` (lista) e `/admin/contratos/[id]` (ciclo de vida,
// composição, alertas, obrigações, implantação, fiscalização, diário e
// encerramento) e das APIs que elas consomem: `src/server/contract-api.mjs`,
// `contract-details-api.mjs`, `contract-status-api.mjs`,
// `contract-amendment-api.mjs`, `contract-alert-api.mjs`,
// `contract-doc-obligation-api.mjs`, `contract-implantation-api.mjs`,
// `contract-closure-api.mjs`, `contract-fiscal-api.mjs`,
// `contract-management-diary-api.mjs` e `contract-l05-api.mjs`.
//
// Mesma regra das camadas anteriores (CRM em UX-03B, RH em UX-04, painel do
// Marcelo em UX-05, portais em UX-06, Operação e Financeiro em UX-07): os
// VALORES continuam canônicos, saindo exatamente como os servidores esperam.
// Só o RÓTULO exibido muda. Valor desconhecido passa cru — nunca é inventada
// uma tradução para um valor que o servidor não devolveu.
//
//
// Fronteira real, conferida em server.mjs (linha ~3022) e não suposta: HOJE
// todo `/api/crm/contracts` e `/api/crm/contracts/*` é atendido por
// `contract-l05-api.mjs`, que é a fronteira de autorização e auditoria da
// família; os outros dez servidores continuam no repositório por
// compatibilidade histórica e NÃO são alcançáveis por HTTP. O vocabulário
// cobre os onze mesmo assim, de propósito: se uma rota legada voltar a ser
// religada, o usuário vê português em vez do código cru, e o teste
// anti-deriva continua valendo para todos.
//
// Esta camada NÃO decide sessão, NÃO decide escopo de carteira, NÃO decide
// transição de situação, NÃO decide se um bloqueio legal pode ser dispensado,
// NÃO decide idempotência e NÃO conclui checklist. Tudo isso continua no
// servidor e no banco; aqui só se explica, em português, a resposta que já
// chegou.
//
// Os dois defeitos centrais que esta camada corrige:
//  1. as telas exibiam o código cru em inglês como se fosse frase
//     (`unresolved_implantation_block`, `proposal_version_not_preserved`,
//     `legal_requirement_cannot_be_bypassed_with_simple_checkbox`...);
//  2. a tela de detalhe lia oito recursos num único `Promise.all` e, se UM
//     falhasse, a página inteira virava "Contrato indisponível" — as sete
//     leituras bem-sucedidas eram descartadas.

/**
 * Mensagens para os 147 códigos que os onze servidores de contrato realmente
 * devolvem (levantados lendo os arquivos). O título é humano; o código
 * canônico só aparece no rodapé, entre parênteses.
 */
const ERROR_MESSAGES = Object.freeze({
  // ----- Sessão, origem, escopo e permissão ----------------------------------
  admin_session_required: {
    kind: 'auth',
    title: 'Esta ação exige sessão de equipe',
    detail: 'O pedido chegou sem sessão administrativa válida. Nada foi lido nem gravado.',
  },
  restricted_access: {
    kind: 'denied',
    title: 'Este conteúdo é restrito ao seu papel',
    detail: 'O menu pode mostrar a tela, mas a concessão específica para este conteúdo não está na sua sessão. Nada foi exibido nem gravado.',
  },
  contract_access_forbidden: {
    kind: 'denied',
    title: 'Este contrato está fora da sua carteira',
    detail: 'O servidor revalida o escopo a cada leitura. Nada deste contrato foi exibido.',
  },
  contract_management_forbidden: {
    kind: 'denied',
    title: 'Gerir este contrato exige outra concessão',
    detail: 'Ver o contrato e administrá-lo são permissões diferentes. Nada foi gravado.',
  },
  same_origin_required: {
    kind: 'denied',
    title: 'Esta gravação só é aceita a partir da própria aplicação',
    detail: 'O pedido não veio da origem esperada. Nada foi gravado.',
  },
  method_not_allowed: {
    kind: 'invalid',
    title: 'Método não previsto para este endereço',
    detail: 'A tela pediu uma operação que este recurso não oferece. Nada foi feito.',
  },
  not_found: {
    kind: 'invalid',
    title: 'Recurso não encontrado',
    detail: 'O endereço pedido não existe ou está fora do seu escopo.',
  },
  database_not_configured: {
    kind: 'retry',
    title: 'Banco de dados indisponível para esta área',
    detail: 'A conexão não está configurada neste ambiente. Isto não significa que não existam contratos.',
  },

  // ----- Contrato: criação, leitura e edição (CON-01, L05) -------------------
  contracts_unavailable: {
    kind: 'retry',
    title: 'Não foi possível listar os contratos agora',
    detail: 'A leitura falhou no servidor. Isto não significa que a carteira esteja vazia.',
  },
  contract_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler este contrato agora',
    detail: 'A leitura falhou no servidor. O contrato continua existindo.',
  },
  contract_not_found: {
    kind: 'invalid',
    title: 'Contrato não encontrado',
    detail: 'O identificador não corresponde a nenhum contrato acessível à sua carteira.',
  },
  contract_create_failed: {
    kind: 'retry',
    title: 'O contrato não chegou a ser criado',
    detail: 'A gravação foi desfeita por inteiro. Nenhum contrato parcial ficou no banco.',
  },
  contract_update_failed: {
    kind: 'retry',
    title: 'A alteração do contrato não foi gravada',
    detail: 'A gravação foi desfeita por inteiro. O contrato continua como estava.',
  },
  contract_not_editable: {
    kind: 'conflict',
    title: 'Este contrato não aceita mais edição',
    detail: 'A situação atual do contrato impede alterações. Registre um aditivo ou mude a situação primeiro.',
  },
  invalid_manual_contract: {
    kind: 'invalid',
    title: 'Dados do cadastro manual incompletos ou inválidos',
    detail: 'Cadastro manual exige empresa, título, escopo, data de início e a origem real declarada. Nada foi gravado.',
  },
  source_required: {
    kind: 'invalid',
    title: 'A origem do contrato precisa ser declarada',
    detail: 'O servidor exige saber se o contrato nasce de proposta aceita ou de cadastro manual identificado.',
  },
  company_not_found: {
    kind: 'invalid',
    title: 'Empresa cliente não encontrada',
    detail: 'A empresa informada não existe ou está fora da sua carteira. Nada foi gravado.',
  },
  contract_start_date_required: {
    kind: 'invalid',
    title: 'A data de início é obrigatória',
    detail: 'Sem data de início não há vigência nem implantação. Nada foi gravado.',
  },
  contract_posts_required: {
    kind: 'invalid',
    title: 'O contrato precisa de ao menos um posto',
    detail: 'A etapa pedida depende da composição de postos já registrada. Nada foi concluído.',
  },

  // ----- Contrato a partir de proposta aceita (CON-01) -----------------------
  proposal_not_found: {
    kind: 'invalid',
    title: 'Proposta não encontrada',
    detail: 'A proposta informada não existe ou está fora da sua carteira. Nada foi gravado.',
  },
  proposal_not_accepted: {
    kind: 'conflict',
    title: 'A proposta ainda não foi aceita',
    detail: 'Só proposta aceita vira contrato. Registre o aceite antes de gerar o contrato.',
  },
  contract_proposal_missing: {
    kind: 'invalid',
    title: 'Referência de proposta ausente',
    detail: 'A operação pedida precisa indicar qual proposta originou o contrato. Nada foi gravado.',
  },
  invalid_proposal_reference: {
    kind: 'invalid',
    title: 'Referência de proposta inválida',
    detail: 'O identificador ou a versão da proposta não conferem. Nada foi gravado.',
  },
  proposal_version_not_preserved: {
    kind: 'conflict',
    title: 'A versão aceita da proposta não está preservada',
    detail: 'O contrato precisa apontar exatamente a versão que o cliente aceitou. Nada foi gravado.',
  },
  accepted_current_proposal_version_required: {
    kind: 'conflict',
    title: 'A versão aceita precisa ser a versão vigente',
    detail: 'A proposta foi revisada depois do aceite. Obtenha um novo aceite antes de gerar o contrato.',
  },
  version_not_preserved_cannot_create_contract: {
    kind: 'conflict',
    title: 'Sem versão preservada não é possível criar o contrato',
    detail: 'O vínculo entre contrato e versão aceita é obrigatório e não pode ser reconstruído depois. Nada foi gravado.',
  },

  // ----- Composição: unidades, postos, SLA, responsáveis (CON-01, CON-02) ----
  units_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler as unidades agora',
    detail: 'A leitura falhou no servidor. Isto não significa que o contrato não tenha unidades.',
  },
  unit_add_failed: {
    kind: 'retry',
    title: 'A unidade não foi vinculada',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  unit_remove_failed: {
    kind: 'retry',
    title: 'A unidade não foi desvinculada',
    detail: 'A gravação foi desfeita por inteiro. O vínculo continua como estava.',
  },
  unit_outside_contract_company: {
    kind: 'denied',
    title: 'Esta unidade é de outra empresa',
    detail: 'Só unidades da empresa contratante podem entrar na composição. Nada foi gravado.',
  },
  posts_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler os postos agora',
    detail: 'A leitura falhou no servidor. Isto não significa que o contrato não tenha postos.',
  },
  post_create_failed: {
    kind: 'retry',
    title: 'O posto não foi registrado',
    detail: 'A gravação foi desfeita por inteiro. Nenhum posto parcial ficou no banco.',
  },
  post_remove_failed: {
    kind: 'retry',
    title: 'O posto não foi removido',
    detail: 'A gravação foi desfeita por inteiro. O posto continua como estava.',
  },
  sla_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler os SLAs agora',
    detail: 'A leitura falhou no servidor. Isto não significa que o contrato não tenha SLA.',
  },
  sla_create_failed: {
    kind: 'retry',
    title: 'O SLA não foi registrado',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  responsibles_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler os responsáveis agora',
    detail: 'A leitura falhou no servidor. Isto não significa que o contrato não tenha responsável.',
  },
  responsible_add_failed: {
    kind: 'retry',
    title: 'O responsável não foi vinculado',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  responsible_remove_failed: {
    kind: 'retry',
    title: 'O responsável não foi desvinculado',
    detail: 'A gravação foi desfeita por inteiro. O vínculo continua como estava.',
  },
  responsible_not_found: {
    kind: 'invalid',
    title: 'Responsável não encontrado',
    detail: 'O vínculo informado não existe neste contrato. Nada foi gravado.',
  },
  schedule_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler a escala contratada agora',
    detail: 'A leitura falhou no servidor. Isto não significa que não exista escala registrada.',
  },
  schedule_create_failed: {
    kind: 'retry',
    title: 'A escala contratada não foi registrada',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  schedule_update_failed: {
    kind: 'retry',
    title: 'A escala contratada não foi alterada',
    detail: 'A gravação foi desfeita por inteiro. A escala continua como estava.',
  },

  // ----- Ciclo de vida e assinatura (CON-03) ---------------------------------
  status_transition_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler as transições possíveis agora',
    detail: 'A leitura falhou no servidor. Isto não significa que não haja transição permitida.',
  },
  status_history_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler o histórico de situações agora',
    detail: 'A leitura falhou no servidor. O histórico continua gravado e imutável.',
  },
  status_transition_failed: {
    kind: 'retry',
    title: 'A mudança de situação não foi gravada',
    detail: 'A gravação foi desfeita por inteiro. O contrato continua na situação anterior.',
  },
  contract_status_change_failed: {
    kind: 'retry',
    title: 'A mudança de situação do contrato não foi gravada',
    detail: 'A gravação foi desfeita por inteiro. O contrato continua na situação anterior.',
  },
  contract_status_check_failed: {
    kind: 'retry',
    title: 'Não foi possível conferir a situação atual do contrato',
    detail: 'A verificação falhou no servidor; por segurança, nada foi alterado.',
  },
  invalid_transition: {
    kind: 'conflict',
    title: 'Esta transição de situação não é permitida',
    detail: 'O caminho entre a situação atual e a pedida não existe no ciclo de vida do contrato. Nada foi alterado.',
  },
  already_in_status: {
    kind: 'conflict',
    title: 'O contrato já está nesta situação',
    detail: 'Nada foi alterado, e repetir o pedido não cria um segundo registro.',
  },
  contract_already_encerrado: {
    kind: 'conflict',
    title: 'Este contrato já está encerrado',
    detail: 'Contrato encerrado não recebe nova transição. Nada foi alterado.',
  },
  signature_required_before_activation: {
    kind: 'conflict',
    title: 'Ativar exige assinatura registrada antes',
    detail: 'Assinatura e ativação operacional são etapas distintas. Registre a assinatura primeiro.',
  },
  signature_evidence_required: {
    kind: 'invalid',
    title: 'A evidência da assinatura é obrigatória',
    detail: 'O servidor exige declarar qual é a evidência real da assinatura. Nada foi gravado.',
  },
  signature_only_in_aguardando_or_ativo: {
    kind: 'conflict',
    title: 'A assinatura só pode ser registrada nestas situações',
    detail: 'O contrato precisa estar aguardando assinatura ou já ativo para receber o registro. Nada foi gravado.',
  },
  signature_required_for_contract_step: {
    kind: 'conflict',
    title: 'Esta etapa de implantação exige a assinatura registrada',
    detail: 'A etapa não pode ser concluída enquanto a assinatura do contrato não existir.',
  },
  signature_failed: {
    kind: 'retry',
    title: 'O registro da assinatura não foi gravado',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  unresolved_implantation_block: {
    kind: 'conflict',
    title: 'Há bloqueio de implantação em aberto',
    detail: 'A ativação operacional depende de resolver os bloqueios registrados. Nada foi alterado.',
  },
  implantation_checklist_incomplete: {
    kind: 'conflict',
    title: 'O checklist de implantação ainda não está completo',
    detail: 'Nenhuma etapa é marcada como concluída automaticamente. Conclua as etapas pendentes antes.',
  },
  portal_contract_link_required: {
    kind: 'conflict',
    title: 'Falta o vínculo com o contrato do portal do cliente',
    detail: 'A operação precisa saber qual contrato do portal corresponde a este. Nada foi alterado.',
  },

  // ----- Aditivos e reajustes (CON-04) ---------------------------------------
  amendments_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler os aditivos agora',
    detail: 'A leitura falhou no servidor. Isto não significa que não existam aditivos.',
  },
  amendment_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler este aditivo agora',
    detail: 'A leitura falhou no servidor. O aditivo continua existindo.',
  },
  amendment_not_found: {
    kind: 'invalid',
    title: 'Aditivo não encontrado',
    detail: 'O identificador não corresponde a nenhum aditivo deste contrato.',
  },
  amendment_create_failed: {
    kind: 'retry',
    title: 'O aditivo não chegou a ser criado',
    detail: 'A gravação foi desfeita por inteiro. Nenhum aditivo parcial ficou no banco.',
  },
  amendment_update_failed: {
    kind: 'retry',
    title: 'A alteração do aditivo não foi gravada',
    detail: 'A gravação foi desfeita por inteiro. O aditivo continua como estava.',
  },
  amendment_delete_failed: {
    kind: 'retry',
    title: 'O aditivo não foi excluído',
    detail: 'A exclusão foi desfeita por inteiro. O aditivo continua registrado.',
  },
  amendment_status_change_failed: {
    kind: 'retry',
    title: 'A mudança de situação do aditivo não foi gravada',
    detail: 'A gravação foi desfeita por inteiro. O aditivo continua na situação anterior.',
  },
  amendment_finalized: {
    kind: 'conflict',
    title: 'Este aditivo já foi finalizado',
    detail: 'Aditivo aprovado ou rejeitado não volta a ser editado. Registre um novo aditivo se for preciso corrigir.',
  },
  already_finalized: {
    kind: 'conflict',
    title: 'Este registro já foi finalizado',
    detail: 'Registro finalizado não aceita nova alteração. Nada foi gravado.',
  },
  only_rascunho_rejeitado_can_delete_or_not_found: {
    kind: 'conflict',
    title: 'Só rascunho ou rejeitado pode ser excluído',
    detail: 'O registro pedido não está em rascunho nem rejeitado — ou não existe no seu escopo. Nada foi excluído.',
  },

  // ----- Alertas contratuais (CON-05) ----------------------------------------
  alert_rules_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler as regras de alerta agora',
    detail: 'A leitura falhou no servidor. Isto não significa que não existam regras configuradas.',
  },
  alert_rule_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler esta regra de alerta agora',
    detail: 'A leitura falhou no servidor. A regra continua existindo.',
  },
  alert_rule_not_found: {
    kind: 'invalid',
    title: 'Regra de alerta não encontrada',
    detail: 'O identificador não corresponde a nenhuma regra deste contrato.',
  },
  alert_rule_create_failed: {
    kind: 'retry',
    title: 'A regra de alerta não foi criada',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  alert_rule_update_failed: {
    kind: 'retry',
    title: 'A regra de alerta não foi alterada',
    detail: 'A gravação foi desfeita por inteiro. A regra continua como estava.',
  },
  alert_rule_delete_failed: {
    kind: 'retry',
    title: 'A regra de alerta não foi excluída',
    detail: 'A exclusão foi desfeita por inteiro. A regra continua registrada.',
  },
  alerts_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler os alertas gerados agora',
    detail: 'A leitura falhou no servidor. Isto não significa que nenhum alerta tenha sido gerado.',
  },
  alert_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler este alerta agora',
    detail: 'A leitura falhou no servidor. O alerta continua registrado.',
  },
  alert_create_failed: {
    kind: 'retry',
    title: 'O alerta não foi gerado',
    detail: 'A gravação foi desfeita por inteiro. Nenhum alerta parcial ficou na caixa de saída local.',
  },
  alert_update_failed: {
    kind: 'retry',
    title: 'O alerta não foi atualizado',
    detail: 'A gravação foi desfeita por inteiro. O alerta continua como estava.',
  },
  rule_not_found: {
    kind: 'invalid',
    title: 'Regra não encontrada',
    detail: 'O identificador não corresponde a nenhuma regra acessível. Nada foi feito.',
  },
  rule_disabled: {
    kind: 'conflict',
    title: 'Esta regra está desativada',
    detail: 'Regra desativada não processa alerta. Reative a regra antes de pedir o processamento.',
  },

  // ----- Obrigações documentais (CON-06) -------------------------------------
  doc_obligations_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler as obrigações documentais agora',
    detail: 'A leitura falhou no servidor. Isto não significa que não existam obrigações.',
  },
  doc_obligation_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler esta obrigação documental agora',
    detail: 'A leitura falhou no servidor. A obrigação continua registrada.',
  },
  doc_obligation_create_failed: {
    kind: 'retry',
    title: 'A obrigação documental não foi criada',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  doc_obligation_update_failed: {
    kind: 'retry',
    title: 'A obrigação documental não foi alterada',
    detail: 'A gravação foi desfeita por inteiro. A obrigação continua como estava.',
  },
  doc_obligation_status_change_failed: {
    kind: 'retry',
    title: 'A mudança de situação da obrigação não foi gravada',
    detail: 'A gravação foi desfeita por inteiro. A obrigação continua na situação anterior.',
  },
  obligations_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler as obrigações agora',
    detail: 'A leitura falhou no servidor. Isto não significa que não existam obrigações.',
  },
  obligation_create_failed: {
    kind: 'retry',
    title: 'A obrigação não foi criada',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  obligation_not_found: {
    kind: 'invalid',
    title: 'Obrigação não encontrada',
    detail: 'O identificador não corresponde a nenhuma obrigação deste contrato.',
  },
  comprovante_required_for_analysis: {
    kind: 'conflict',
    title: 'Enviar para análise exige o comprovante',
    detail: 'A obrigação só entra em análise com o documento comprobatório anexado. Nada foi alterado.',
  },
  documents_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler os documentos agora',
    detail: 'A leitura falhou no servidor. Isto não significa que não existam documentos anexados.',
  },
  document_upload_failed: {
    kind: 'retry',
    title: 'O documento não foi anexado',
    detail: 'O envio foi desfeito por inteiro. Nenhum arquivo parcial ficou armazenado.',
  },
  private_document_proof_required: {
    kind: 'invalid',
    title: 'É obrigatório indicar o documento comprobatório',
    detail: 'O servidor exige a referência ao documento privado que comprova o registro. Nada foi gravado.',
  },
  private_document_outside_contract_scope: {
    kind: 'denied',
    title: 'Este documento pertence a outro contrato',
    detail: 'Documentos privados não cruzam escopo de contrato. Nada foi vinculado.',
  },

  // ----- Implantação, bloqueios e exceções (CON-07 e CON-08) -----------------
  implantation_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler a implantação agora',
    detail: 'A leitura falhou no servidor. Isto não significa que a implantação não exista.',
  },
  implantation_not_found: {
    kind: 'invalid',
    title: 'Implantação não encontrada',
    detail: 'Este contrato ainda não tem checklist de implantação iniciado.',
  },
  implantation_update_failed: {
    kind: 'retry',
    title: 'A alteração da implantação não foi gravada',
    detail: 'A gravação foi desfeita por inteiro. A implantação continua como estava.',
  },
  implantation_step_not_found: {
    kind: 'invalid',
    title: 'Etapa de implantação não encontrada',
    detail: 'O identificador não corresponde a nenhuma etapa deste checklist.',
  },
  implantation_block_not_found: {
    kind: 'invalid',
    title: 'Bloqueio de implantação não encontrado',
    detail: 'O identificador não corresponde a nenhum bloqueio deste contrato.',
  },
  steps_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler as etapas agora',
    detail: 'A leitura falhou no servidor. Isto não significa que o checklist esteja vazio.',
  },
  steps_init_failed: {
    kind: 'retry',
    title: 'O checklist de implantação não foi iniciado',
    detail: 'A gravação foi desfeita por inteiro. Nenhuma etapa parcial ficou no banco.',
  },
  step_update_failed: {
    kind: 'retry',
    title: 'A etapa não foi atualizada',
    detail: 'A gravação foi desfeita por inteiro. A etapa continua como estava.',
  },
  blocks_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler os bloqueios agora',
    detail: 'A leitura falhou no servidor. Isto não significa que não existam bloqueios abertos.',
  },
  block_create_failed: {
    kind: 'retry',
    title: 'O bloqueio não foi registrado',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  block_not_found: {
    kind: 'invalid',
    title: 'Bloqueio não encontrado',
    detail: 'O identificador não corresponde a nenhum bloqueio deste contrato.',
  },
  block_resolve_failed: {
    kind: 'retry',
    title: 'O bloqueio não foi marcado como resolvido',
    detail: 'A gravação foi desfeita por inteiro. O bloqueio continua aberto.',
  },
  legal_requirement_not_waivable: {
    kind: 'denied',
    title: 'Exigência legal não pode ser dispensada',
    detail: 'Este bloqueio decorre de exigência legal e não admite dispensa. Nada foi alterado.',
  },
  legal_requirement_cannot_be_bypassed_with_simple_checkbox: {
    kind: 'denied',
    title: 'Exigência legal não se resolve marcando uma caixa',
    detail: 'É preciso uma exceção formal, com base legal declarada e autorização registrada. Nada foi alterado.',
  },
  legal_requirement_block_cannot_be_resolved_without_exception: {
    kind: 'conflict',
    title: 'Este bloqueio legal exige exceção autorizada',
    detail: 'Registre e faça autorizar uma exceção antes de resolver o bloqueio. Nada foi alterado.',
  },
  legal_exception_requires_legal_basis: {
    kind: 'invalid',
    title: 'A exceção legal exige base legal declarada',
    detail: 'O servidor não aceita exceção sem a fundamentação real escrita. Nada foi gravado.',
  },
  exceptions_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler as exceções agora',
    detail: 'A leitura falhou no servidor. Isto não significa que não existam exceções registradas.',
  },
  exception_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler esta exceção agora',
    detail: 'A leitura falhou no servidor. A exceção continua registrada.',
  },
  exception_create_failed: {
    kind: 'retry',
    title: 'A exceção não foi registrada',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  exception_status_change_failed: {
    kind: 'retry',
    title: 'A decisão sobre a exceção não foi gravada',
    detail: 'A gravação foi desfeita por inteiro. A exceção continua na situação anterior.',
  },
  exception_not_authorizable: {
    kind: 'denied',
    title: 'Seu papel não autoriza esta exceção',
    detail: 'Quem solicita e quem autoriza a exceção são papéis distintos. Nada foi alterado.',
  },

  // ----- Encerramento (CON-09) ------------------------------------------------
  closure_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler o encerramento agora',
    detail: 'A leitura falhou no servidor. Isto não significa que não exista encerramento planejado.',
  },
  closure_not_found: {
    kind: 'invalid',
    title: 'Encerramento não encontrado',
    detail: 'Este contrato ainda não tem encerramento planejado.',
  },
  closure_already_exists: {
    kind: 'conflict',
    title: 'Já existe um encerramento planejado',
    detail: 'Repetir o pedido não cria um segundo encerramento. Abra o que já existe.',
  },
  closure_create_failed: {
    kind: 'retry',
    title: 'O encerramento não foi planejado',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  closure_update_failed: {
    kind: 'retry',
    title: 'A alteração do encerramento não foi gravada',
    detail: 'A gravação foi desfeita por inteiro. O encerramento continua como estava.',
  },
  closure_status_change_failed: {
    kind: 'retry',
    title: 'A mudança de situação do encerramento não foi gravada',
    detail: 'A gravação foi desfeita por inteiro. O encerramento continua na situação anterior.',
  },
  closure_finalized: {
    kind: 'conflict',
    title: 'Este encerramento já foi concluído',
    detail: 'Encerramento concluído não volta a ser editado. Nada foi alterado.',
  },
  closure_step_not_found: {
    kind: 'invalid',
    title: 'Etapa de encerramento não encontrada',
    detail: 'O identificador não corresponde a nenhuma etapa deste encerramento.',
  },
  closure_steps_incomplete: {
    kind: 'conflict',
    title: 'O checklist de encerramento ainda tem etapas pendentes',
    detail: 'Desmobilização, devoluções e pendências precisam estar resolvidas antes de concluir. Nada foi alterado.',
  },
  revocations_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler as revogações de acesso agora',
    detail: 'A leitura falhou no servidor. Isto não significa que nenhum acesso tenha sido revogado.',
  },
  revocation_create_failed: {
    kind: 'retry',
    title: 'A revogação de acesso não foi registrada',
    detail: 'A gravação foi desfeita por inteiro. O acesso continua como estava.',
  },
  exclusions_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler as exclusões de escopo agora',
    detail: 'A leitura falhou no servidor. Isto não significa que não existam exclusões.',
  },
  exclusion_create_failed: {
    kind: 'retry',
    title: 'A exclusão de escopo não foi registrada',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  exclusion_remove_failed: {
    kind: 'retry',
    title: 'A exclusão de escopo não foi removida',
    detail: 'A gravação foi desfeita por inteiro. A exclusão continua valendo.',
  },

  // ----- Dossiê fiscal, medições e evidências (CON-10) -----------------------
  dossiers_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler os dossiês fiscais agora',
    detail: 'A leitura falhou no servidor. Isto não significa que não existam dossiês.',
  },
  dossier_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler este dossiê agora',
    detail: 'A leitura falhou no servidor. O dossiê continua registrado.',
  },
  dossier_not_found: {
    kind: 'invalid',
    title: 'Dossiê fiscal não encontrado',
    detail: 'O identificador não corresponde a nenhum dossiê deste contrato.',
  },
  dossier_create_failed: {
    kind: 'retry',
    title: 'O dossiê fiscal não foi criado',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  dossier_update_failed: {
    kind: 'retry',
    title: 'A alteração do dossiê não foi gravada',
    detail: 'A gravação foi desfeita por inteiro. O dossiê continua como estava.',
  },
  measurements_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler as medições agora',
    detail: 'A leitura falhou no servidor. Isto não significa que não existam medições.',
  },
  measurement_not_found: {
    kind: 'invalid',
    title: 'Medição não encontrada',
    detail: 'O identificador não corresponde a nenhuma medição deste contrato.',
  },
  measurement_create_failed: {
    kind: 'retry',
    title: 'A medição não foi registrada',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  measurement_update_failed: {
    kind: 'retry',
    title: 'A alteração da medição não foi gravada',
    detail: 'A gravação foi desfeita por inteiro. A medição continua como estava.',
  },
  evidences_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler as evidências de qualidade agora',
    detail: 'A leitura falhou no servidor. Isto não significa que não existam evidências.',
  },
  evidence_create_failed: {
    kind: 'retry',
    title: 'A evidência não foi registrada',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },

  // ----- Diário de gestão (CON-11) -------------------------------------------
  diary_unavailable: {
    kind: 'retry',
    title: 'Não foi possível ler o diário de gestão agora',
    detail: 'A leitura falhou no servidor. Isto não significa que não existam decisões registradas.',
  },
  diary_search_unavailable: {
    kind: 'retry',
    title: 'Não foi possível pesquisar o diário agora',
    detail: 'A busca falhou no servidor. Isto não significa que nada tenha sido encontrado.',
  },
  diary_create_failed: {
    kind: 'retry',
    title: 'A decisão não foi registrada no diário',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  diary_update_failed: {
    kind: 'retry',
    title: 'A alteração no diário não foi gravada',
    detail: 'A gravação foi desfeita por inteiro. O registro continua como estava.',
  },
  diary_delete_failed: {
    kind: 'retry',
    title: 'O registro do diário não foi excluído',
    detail: 'A exclusão foi desfeita por inteiro. O registro continua gravado.',
  },
  secret_or_medical_record_not_allowed: {
    kind: 'denied',
    title: 'Este conteúdo não pode entrar aqui',
    detail: 'Senha, token, prontuário e dado sensível equivalente são recusados pelo servidor. Nada foi gravado.',
  },
  secret_or_medical_record_not_allowed_in_free_notes: {
    kind: 'denied',
    title: 'Campo livre não aceita segredo nem dado de saúde',
    detail: 'O servidor recusou o texto por conter segredo ou prontuário. Reescreva sem esse conteúdo; nada foi gravado.',
  },
  opportunity_outside_contract_company: {
    kind: 'denied',
    title: 'Esta oportunidade é de outra empresa',
    detail: 'O vínculo só é aceito dentro da empresa contratante. Nada foi gravado.',
  },

  // ----- Validação de campo e regra (wrapper local `bad(res, ...)`) ---------
  // Estes 158 códigos só aparecem através dos helpers locais de cada
  // servidor (`const bad = (res, msg) => json(res, 400, { error: msg })` e
  // `unavailable(res, msg)`), e por isso escaparam da primeira versão do
  // levantamento. O extrator do teste anti-deriva foi corrigido junto.
  invalid_id: {
    kind: 'invalid',
    title: 'Identificador inválido',
    detail: 'O identificador enviado não tem o formato esperado. Nada foi feito.',
  },
  invalid_contract_id: {
    kind: 'invalid',
    title: 'Contrato inválido',
    detail: 'O identificador do contrato não corresponde a nenhum contrato acessível. Nada foi feito.',
  },
  invalid_company_id: {
    kind: 'invalid',
    title: 'Empresa inválida',
    detail: 'O identificador da empresa não corresponde a nenhuma empresa da sua carteira. Nada foi gravado.',
  },
  invalid_proposal_id: {
    kind: 'invalid',
    title: 'Proposta inválida',
    detail: 'O identificador da proposta não corresponde a nenhuma proposta acessível. Nada foi gravado.',
  },
  invalid_proposal_version: {
    kind: 'invalid',
    title: 'Versão da proposta inválida',
    detail: 'A versão informada não corresponde à versão aceita. Nada foi gravado.',
  },
  invalid_proposal_id_for_manual: {
    kind: 'invalid',
    title: 'Cadastro manual não aceita proposta',
    detail: 'Contrato manual não pode apontar para uma proposta: declare a origem real. Nada foi gravado.',
  },
  invalid_opportunity_id: {
    kind: 'invalid',
    title: 'Oportunidade inválida',
    detail: 'O identificador da oportunidade não corresponde a nenhuma oportunidade acessível. Nada foi gravado.',
  },
  invalid_related_opportunity_id: {
    kind: 'invalid',
    title: 'Oportunidade relacionada inválida',
    detail: 'A oportunidade vinculada não existe ou está fora do seu escopo. Nada foi gravado.',
  },
  invalid_responsible_id: {
    kind: 'invalid',
    title: 'Responsável inválido',
    detail: 'O identificador do responsável não corresponde a nenhum vínculo deste contrato. Nada foi gravado.',
  },
  invalid_unit_id: {
    kind: 'invalid',
    title: 'Unidade inválida',
    detail: 'O identificador da unidade não corresponde a nenhuma unidade deste contrato. Nada foi gravado.',
  },
  invalid_rule_id: {
    kind: 'invalid',
    title: 'Regra inválida',
    detail: 'O identificador da regra não corresponde a nenhuma regra deste contrato. Nada foi feito.',
  },
  invalid_alert_id: {
    kind: 'invalid',
    title: 'Alerta inválido',
    detail: 'O identificador do alerta não corresponde a nenhum alerta deste contrato. Nada foi feito.',
  },
  invalid_amendment_id: {
    kind: 'invalid',
    title: 'Aditivo inválido',
    detail: 'O identificador do aditivo não corresponde a nenhum aditivo deste contrato. Nada foi feito.',
  },
  invalid_block_id: {
    kind: 'invalid',
    title: 'Bloqueio inválido',
    detail: 'O identificador do bloqueio não corresponde a nenhum bloqueio deste contrato. Nada foi feito.',
  },
  invalid_exception_id: {
    kind: 'invalid',
    title: 'Exceção inválida',
    detail: 'O identificador da exceção não corresponde a nenhuma exceção deste contrato. Nada foi feito.',
  },
  invalid_obligation_id: {
    kind: 'invalid',
    title: 'Obrigação inválida',
    detail: 'O identificador da obrigação não corresponde a nenhuma obrigação deste contrato. Nada foi feito.',
  },
  invalid_dossier_id: {
    kind: 'invalid',
    title: 'Dossiê inválido',
    detail: 'O identificador do dossiê não corresponde a nenhum dossiê deste contrato. Nada foi feito.',
  },
  invalid_measurement_id: {
    kind: 'invalid',
    title: 'Medição inválida',
    detail: 'O identificador da medição não corresponde a nenhuma medição deste contrato. Nada foi feito.',
  },
  invalid_entry_id: {
    kind: 'invalid',
    title: 'Registro de diário inválido',
    detail: 'O identificador não corresponde a nenhum registro do diário deste contrato. Nada foi feito.',
  },
  invalid_step_id: {
    kind: 'invalid',
    title: 'Etapa inválida',
    detail: 'O identificador da etapa não corresponde a nenhuma etapa deste checklist. Nada foi feito.',
  },
  step_id_required: {
    kind: 'invalid',
    title: 'A etapa precisa ser indicada',
    detail: 'O pedido chegou sem dizer qual etapa deve ser alterada. Nada foi feito.',
  },
  invalid_title: {
    kind: 'invalid',
    title: 'Título inválido',
    detail: 'O título está vazio ou acima do limite aceito. Nada foi gravado.',
  },
  title_required: {
    kind: 'invalid',
    title: 'O título é obrigatório',
    detail: 'O servidor não aceita o registro sem título. Nada foi gravado.',
  },
  title_and_description_required: {
    kind: 'invalid',
    title: 'Título e descrição são obrigatórios',
    detail: 'Os dois campos precisam estar preenchidos. Nada foi gravado.',
  },
  invalid_description: {
    kind: 'invalid',
    title: 'Descrição inválida',
    detail: 'A descrição está vazia ou acima do limite aceito. Nada foi gravado.',
  },
  description_min_20_required_for_clear_block: {
    kind: 'invalid',
    title: 'Resolver o bloqueio exige 20 caracteres de descrição',
    detail: 'O servidor exige explicar concretamente como o bloqueio foi resolvido. Nada foi alterado.',
  },
  invalid_reason: {
    kind: 'invalid',
    title: 'Motivo inválido',
    detail: 'O motivo está vazio ou acima do limite aceito. Nada foi gravado.',
  },
  reason_min_10_required: {
    kind: 'invalid',
    title: 'O motivo precisa de ao menos 10 caracteres',
    detail: 'O servidor recusa motivo genérico ou vazio. Nada foi gravado.',
  },
  closure_reason_required: {
    kind: 'invalid',
    title: 'O motivo do encerramento é obrigatório',
    detail: 'Encerrar exige o motivo real escrito. Nada foi alterado.',
  },
  suspension_reason_required: {
    kind: 'invalid',
    title: 'O motivo da suspensão é obrigatório',
    detail: 'Suspender exige o motivo real escrito. Nada foi alterado.',
  },
  rejection_reason_required: {
    kind: 'invalid',
    title: 'O motivo da recusa é obrigatório',
    detail: 'Recusar exige o motivo real escrito. Nada foi alterado.',
  },
  invalid_justification: {
    kind: 'invalid',
    title: 'Justificativa inválida',
    detail: 'A justificativa está vazia ou acima do limite aceito. Nada foi gravado.',
  },
  justification_required_min_10: {
    kind: 'invalid',
    title: 'A justificativa precisa de ao menos 10 caracteres',
    detail: 'O servidor recusa justificativa genérica. Nada foi gravado.',
  },
  motivation_min_20_required: {
    kind: 'invalid',
    title: 'A motivação precisa de ao menos 20 caracteres',
    detail: 'O servidor exige motivação concreta para esta operação. Nada foi gravado.',
  },
  invalid_decision: {
    kind: 'invalid',
    title: 'Decisão inválida',
    detail: 'O texto da decisão está vazio, curto demais ou acima do limite. Nada foi gravado.',
  },
  decision_min_10_required: {
    kind: 'invalid',
    title: 'A decisão precisa de ao menos 10 caracteres',
    detail: 'Registro de diário sem conteúdo real é recusado. Nada foi gravado.',
  },
  invalid_search: {
    kind: 'invalid',
    title: 'Termo de busca inválido',
    detail: 'O termo pesquisado não foi aceito pelo servidor. Nenhuma busca foi feita.',
  },
  search_required: {
    kind: 'invalid',
    title: 'O termo de busca é obrigatório',
    detail: 'A pesquisa precisa de um termo. Nenhuma busca foi feita.',
  },
  invalid_process_ref: {
    kind: 'invalid',
    title: 'Referência de processo inválida',
    detail: 'A referência informada não foi aceita pelo servidor. Nada foi gravado.',
  },
  invalid_or_sensitive_diary_entry: {
    kind: 'denied',
    title: 'Registro de diário recusado por conteúdo',
    detail: 'O texto está inválido ou contém dado sensível que o servidor não aceita. Nada foi gravado.',
  },
  secret_not_allowed: {
    kind: 'denied',
    title: 'Este campo não aceita segredo',
    detail: 'Senha, token e credencial equivalente são recusados pelo servidor. Nada foi gravado.',
  },
  invalid_due_date: {
    kind: 'invalid',
    title: 'Prazo inválido',
    detail: 'A data de prazo não tem o formato esperado. Nada foi gravado.',
  },
  due_date_required: {
    kind: 'invalid',
    title: 'O prazo é obrigatório',
    detail: 'Esta operação exige a data de vencimento. Nada foi gravado.',
  },
  due_date_required_when_contract_has_no_ends_on: {
    kind: 'invalid',
    title: 'Sem fim de vigência, o prazo é obrigatório',
    detail: 'Como o contrato não tem data de término, o alerta precisa de prazo próprio. Nada foi gravado.',
  },
  invalid_effective_date: {
    kind: 'invalid',
    title: 'Data de efeito inválida',
    detail: 'A data de efeito não tem o formato esperado. Nada foi gravado.',
  },
  invalid_effective_date_required: {
    kind: 'invalid',
    title: 'A data de efeito é obrigatória',
    detail: 'A operação precisa saber a partir de quando passa a valer. Nada foi gravado.',
  },
  effective_date_required_for_status_change: {
    kind: 'invalid',
    title: 'Mudar de situação exige data de efeito',
    detail: 'O histórico de situações guarda a data real do efeito. Nada foi alterado.',
  },
  effective_date_too_far_future: {
    kind: 'invalid',
    title: 'Data de efeito distante demais',
    detail: 'O servidor recusa efeito tão à frente no tempo. Nada foi gravado.',
  },
  effective_must_be_after_closure: {
    kind: 'conflict',
    title: 'O efeito precisa vir depois do encerramento',
    detail: 'As duas datas estão em ordem incoerente. Nada foi gravado.',
  },
  invalid_closure_date: {
    kind: 'invalid',
    title: 'Data de encerramento inválida',
    detail: 'A data não tem o formato esperado. Nada foi gravado.',
  },
  invalid_closure_date_required: {
    kind: 'invalid',
    title: 'A data de encerramento é obrigatória',
    detail: 'Planejar o encerramento exige a data. Nada foi gravado.',
  },
  invalid_starts_on: {
    kind: 'invalid',
    title: 'Data de início inválida',
    detail: 'A data de início não tem o formato esperado. Nada foi gravado.',
  },
  invalid_ends_on: {
    kind: 'invalid',
    title: 'Data de término inválida',
    detail: 'A data de término não tem o formato esperado. Nada foi gravado.',
  },
  invalid_data_inicio: {
    kind: 'invalid',
    title: 'Data de início inválida',
    detail: 'A data de início da implantação não tem o formato esperado. Nada foi gravado.',
  },
  invalid_vigencia_start: {
    kind: 'invalid',
    title: 'Início de vigência inválido',
    detail: 'A data de início da vigência não tem o formato esperado. Nada foi gravado.',
  },
  invalid_vigencia_start_required: {
    kind: 'invalid',
    title: 'O início de vigência é obrigatório',
    detail: 'Sem início de vigência não há contrato vigente. Nada foi gravado.',
  },
  invalid_vigencia_end: {
    kind: 'invalid',
    title: 'Fim de vigência inválido',
    detail: 'A data de fim da vigência não tem o formato esperado. Nada foi gravado.',
  },
  invalid_vigencia_range: {
    kind: 'conflict',
    title: 'Intervalo de vigência incoerente',
    detail: 'O fim da vigência precisa ser posterior ao início. Nada foi gravado.',
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
    kind: 'conflict',
    title: 'Intervalo de período incoerente',
    detail: 'O fim do período precisa ser posterior ao início. Nada foi gravado.',
  },
  invalid_signed_at: {
    kind: 'invalid',
    title: 'Data de assinatura inválida',
    detail: 'A data da assinatura não tem o formato esperado. Nada foi gravado.',
  },
  invalid_started_at: {
    kind: 'invalid',
    title: 'Data de início inválida',
    detail: 'A data informada não tem o formato esperado. Nada foi gravado.',
  },
  invalid_completed_at: {
    kind: 'invalid',
    title: 'Data de conclusão inválida',
    detail: 'A data informada não tem o formato esperado. Nada foi gravado.',
  },
  invalid_completed_date: {
    kind: 'invalid',
    title: 'Data de conclusão inválida',
    detail: 'A data informada não tem o formato esperado. Nada foi gravado.',
  },
  invalid_captured_at: {
    kind: 'invalid',
    title: 'Data da evidência inválida',
    detail: 'A data de captura da evidência não tem o formato esperado. Nada foi gravado.',
  },
  invalid_planned_date: {
    kind: 'invalid',
    title: 'Data planejada inválida',
    detail: 'A data planejada não tem o formato esperado. Nada foi gravado.',
  },
  invalid_scheduled_date: {
    kind: 'invalid',
    title: 'Data programada inválida',
    detail: 'A data programada não tem o formato esperado. Nada foi gravado.',
  },
  scheduled_date_required: {
    kind: 'invalid',
    title: 'A data programada é obrigatória',
    detail: 'Esta operação precisa saber para quando está programada. Nada foi gravado.',
  },
  scheduled_must_be_before_due: {
    kind: 'conflict',
    title: 'A data programada precisa vir antes do prazo',
    detail: 'Programar depois do vencimento não faz sentido para o alerta. Nada foi gravado.',
  },
  invalid_decision_date: {
    kind: 'invalid',
    title: 'Data da decisão inválida',
    detail: 'A data da decisão não tem o formato esperado. Nada foi gravado.',
  },
  invalid_decision_date_required: {
    kind: 'invalid',
    title: 'A data da decisão é obrigatória',
    detail: 'Toda decisão registrada no diário precisa da data real. Nada foi gravado.',
  },
  invalid_measurement_date_required: {
    kind: 'invalid',
    title: 'A data da medição é obrigatória',
    detail: 'Toda medição precisa da data real do serviço medido. Nada foi gravado.',
  },
  invalid_revoked_at_required: {
    kind: 'invalid',
    title: 'A data da revogação é obrigatória',
    detail: 'Revogar acesso exige registrar quando aconteceu. Nada foi gravado.',
  },
  invalid_status: {
    kind: 'invalid',
    title: 'Situação inválida',
    detail: 'O valor de situação não é um dos previstos. Nada foi alterado.',
  },
  invalid_next_status: {
    kind: 'invalid',
    title: 'Próxima situação inválida',
    detail: 'O valor informado não é uma situação prevista para o contrato. Nada foi alterado.',
  },
  invalid_status_transition: {
    kind: 'conflict',
    title: 'Transição de situação inválida',
    detail: 'O caminho entre a situação atual e a pedida não existe. Nada foi alterado.',
  },
  invalid_type: {
    kind: 'invalid',
    title: 'Tipo inválido',
    detail: 'O tipo informado não é um dos previstos. Nada foi gravado.',
  },
  invalid_category: {
    kind: 'invalid',
    title: 'Categoria inválida',
    detail: 'A categoria informada não é uma das previstas. Nada foi gravado.',
  },
  invalid_origin: {
    kind: 'invalid',
    title: 'Origem inválida',
    detail: 'A origem precisa ser proposta aceita, cadastro manual ou importação. Nada foi gravado.',
  },
  invalid_role: {
    kind: 'invalid',
    title: 'Função inválida',
    detail: 'A função do responsável não foi aceita. Nada foi gravado.',
  },
  invalid_responsible_name: {
    kind: 'invalid',
    title: 'Nome do responsável inválido',
    detail: 'O nome está vazio ou acima do limite aceito. Nada foi gravado.',
  },
  responsible_required: {
    kind: 'invalid',
    title: 'O responsável é obrigatório',
    detail: 'Esta operação exige indicar quem responde por ela. Nada foi gravado.',
  },
  invalid_shift: {
    kind: 'invalid',
    title: 'Turno inválido',
    detail: 'O turno informado não é um dos previstos. Nada foi gravado.',
  },
  invalid_quantity: {
    kind: 'invalid',
    title: 'Quantidade inválida',
    detail: 'A quantidade precisa ser um número inteiro positivo. Nada foi gravado.',
  },
  invalid_recurrence_type: {
    kind: 'invalid',
    title: 'Tipo de recorrência inválido',
    detail: 'O valor informado não é uma recorrência prevista. Nada foi gravado.',
  },
  invalid_service_type: {
    kind: 'invalid',
    title: 'Tipo de serviço inválido',
    detail: 'O serviço do SLA precisa ser um dos previstos. Nada foi gravado.',
  },
  invalid_party: {
    kind: 'invalid',
    title: 'Parte responsável inválida',
    detail: 'A obrigação precisa apontar contratante, contratada ou ambas. Nada foi gravado.',
  },
  invalid_periodicity: {
    kind: 'invalid',
    title: 'Periodicidade inválida',
    detail: 'A periodicidade informada não é uma das previstas. Nada foi gravado.',
  },
  invalid_channel: {
    kind: 'invalid',
    title: 'Canal inválido',
    detail: 'O canal do alerta não é um dos previstos. Nada foi gravado.',
  },
  invalid_alert_type: {
    kind: 'invalid',
    title: 'Tipo de alerta inválido',
    detail: 'O tipo informado não é um dos previstos. Nada foi gravado.',
  },
  invalid_alert_rule: {
    kind: 'invalid',
    title: 'Regra de alerta inválida',
    detail: 'Os dados da regra não foram aceitos pelo servidor. Nada foi gravado.',
  },
  invalid_days_before: {
    kind: 'invalid',
    title: 'Dias de antecedência inválidos',
    detail: 'O valor precisa ser um número inteiro de dias. Nada foi gravado.',
  },
  invalid_days_before_1_365: {
    kind: 'invalid',
    title: 'A antecedência precisa ficar entre 1 e 365 dias',
    detail: 'O valor informado está fora dessa faixa. Nada foi gravado.',
  },
  invalid_block_type: {
    kind: 'invalid',
    title: 'Tipo de bloqueio inválido',
    detail: 'O tipo informado não é um dos previstos. Nada foi gravado.',
  },
  invalid_step_type: {
    kind: 'invalid',
    title: 'Tipo de etapa inválido',
    detail: 'O tipo informado não é uma etapa prevista. Nada foi gravado.',
  },
  invalid_closure_type: {
    kind: 'invalid',
    title: 'Tipo de encerramento inválido',
    detail: 'O tipo precisa ser encerramento, rescisão, distrato ou término de vigência. Nada foi gravado.',
  },
  invalid_closure: {
    kind: 'invalid',
    title: 'Dados do encerramento inválidos',
    detail: 'O servidor não aceitou os dados enviados para o encerramento. Nada foi gravado.',
  },
  invalid_closure_step: {
    kind: 'invalid',
    title: 'Etapa de encerramento inválida',
    detail: 'Os dados da etapa não foram aceitos. Nada foi gravado.',
  },
  invalid_evidence_type: {
    kind: 'invalid',
    title: 'Tipo de evidência inválido',
    detail: 'A evidência precisa ser foto, relatório, indicador, checklist ou outro. Nada foi gravado.',
  },
  invalid_visibility: {
    kind: 'invalid',
    title: 'Visibilidade inválida',
    detail: 'A visibilidade informada não é uma das previstas para o diário. Nada foi gravado.',
  },
  invalid_scope_type: {
    kind: 'invalid',
    title: 'Tipo de escopo inválido',
    detail: 'O escopo informado não é um dos previstos. Nada foi gravado.',
  },
  invalid_acceptance_status: {
    kind: 'invalid',
    title: 'Situação de aceite inválida',
    detail: 'O valor informado não é uma situação de aceite prevista. Nada foi gravado.',
  },
  invalid_amendment_status: {
    kind: 'invalid',
    title: 'Situação do aditivo inválida',
    detail: 'O valor informado não é uma situação prevista para aditivo. Nada foi gravado.',
  },
  invalid_document_obligation_status: {
    kind: 'invalid',
    title: 'Situação da obrigação inválida',
    detail: 'O valor informado não é uma situação prevista para obrigação documental. Nada foi gravado.',
  },
  invalid_implantation_exception_status: {
    kind: 'invalid',
    title: 'Situação da exceção inválida',
    detail: 'O valor informado não é uma situação prevista para exceção de implantação. Nada foi gravado.',
  },
  invalid_base_type: {
    kind: 'invalid',
    title: 'Tipo de base do reajuste inválido',
    detail: 'A base precisa ser um dos índices ou motivos previstos. Nada foi gravado.',
  },
  invalid_base_value: {
    kind: 'invalid',
    title: 'Valor da base do reajuste inválido',
    detail: 'O valor informado não foi aceito pelo servidor. Nada foi gravado.',
  },
  invalid_milestone: {
    kind: 'invalid',
    title: 'Marco inválido',
    detail: 'O marco informado não foi aceito pelo servidor. Nada foi gravado.',
  },
  invalid_json: {
    kind: 'invalid',
    title: 'Conteúdo enviado em formato inválido',
    detail: 'O corpo da requisição não é um JSON válido. Nada foi feito.',
  },
  no_fields: {
    kind: 'invalid',
    title: 'Nenhum campo para alterar',
    detail: 'O pedido de alteração chegou sem nenhum campo. Nada foi gravado.',
  },
  field_not_editable: {
    kind: 'conflict',
    title: 'Este campo não é editável aqui',
    detail: 'A alteração pedida não é permitida nesta situação do registro. Nada foi gravado.',
  },
  invalid_total_cost: {
    kind: 'invalid',
    title: 'Custo total inválido',
    detail: 'O custo informado não é um número aceito. Nada foi gravado.',
  },
  invalid_total_price: {
    kind: 'invalid',
    title: 'Preço total inválido',
    detail: 'O preço informado não é um número aceito. Nada foi gravado.',
  },
  invalid_previous_total_cost: {
    kind: 'invalid',
    title: 'Custo anterior inválido',
    detail: 'O custo anterior informado não é um número aceito. Nada foi gravado.',
  },
  invalid_previous_total_price: {
    kind: 'invalid',
    title: 'Preço anterior inválido',
    detail: 'O preço anterior informado não é um número aceito. Nada foi gravado.',
  },
  invalid_new_total_cost: {
    kind: 'invalid',
    title: 'Novo custo inválido',
    detail: 'O novo custo informado não é um número aceito. Nada foi gravado.',
  },
  invalid_new_total_price: {
    kind: 'invalid',
    title: 'Novo preço inválido',
    detail: 'O novo preço informado não é um número aceito. Nada foi gravado.',
  },
  invalid_quality_score: {
    kind: 'invalid',
    title: 'Nota de qualidade inválida',
    detail: 'A nota informada não é um número aceito. Nada foi gravado.',
  },
  invalid_quality_score_0_100: {
    kind: 'invalid',
    title: 'A nota de qualidade precisa ficar entre 0 e 100',
    detail: 'O valor informado está fora dessa faixa. Nada foi gravado.',
  },
  invalid_contract_composition: {
    kind: 'invalid',
    title: 'Composição do contrato inválida',
    detail: 'Os dados da composição não foram aceitos pelo servidor. Nada foi gravado.',
  },
  invalid_contract_item: {
    kind: 'invalid',
    title: 'Item do contrato inválido',
    detail: 'Os dados do item não foram aceitos pelo servidor. Nada foi gravado.',
  },
  invalid_contract_unit: {
    kind: 'invalid',
    title: 'Unidade do contrato inválida',
    detail: 'Os dados da unidade não foram aceitos pelo servidor. Nada foi gravado.',
  },
  invalid_contract_responsible: {
    kind: 'invalid',
    title: 'Responsável do contrato inválido',
    detail: 'Os dados do responsável não foram aceitos pelo servidor. Nada foi gravado.',
  },
  invalid_amendment: {
    kind: 'invalid',
    title: 'Dados do aditivo inválidos',
    detail: 'O servidor não aceitou os dados enviados para o aditivo. Nada foi gravado.',
  },
  invalid_checklist: {
    kind: 'invalid',
    title: 'Checklist inválido',
    detail: 'Os dados do checklist não foram aceitos pelo servidor. Nada foi gravado.',
  },
  invalid_implantation_step: {
    kind: 'invalid',
    title: 'Etapa de implantação inválida',
    detail: 'Os dados da etapa não foram aceitos pelo servidor. Nada foi gravado.',
  },
  invalid_implantation_block: {
    kind: 'invalid',
    title: 'Bloqueio de implantação inválido',
    detail: 'Os dados do bloqueio não foram aceitos pelo servidor. Nada foi gravado.',
  },
  invalid_implantation_exception: {
    kind: 'invalid',
    title: 'Exceção de implantação inválida',
    detail: 'Os dados da exceção não foram aceitos pelo servidor. Nada foi gravado.',
  },
  invalid_document_obligation: {
    kind: 'invalid',
    title: 'Obrigação documental inválida',
    detail: 'Os dados da obrigação não foram aceitos pelo servidor. Nada foi gravado.',
  },
  invalid_fiscal_dossier: {
    kind: 'invalid',
    title: 'Dossiê fiscal inválido',
    detail: 'Os dados do dossiê não foram aceitos pelo servidor. Nada foi gravado.',
  },
  invalid_service_measurement: {
    kind: 'invalid',
    title: 'Medição de serviço inválida',
    detail: 'Os dados da medição não foram aceitos pelo servidor. Nada foi gravado.',
  },
  invalid_quality_evidence: {
    kind: 'invalid',
    title: 'Evidência de qualidade inválida',
    detail: 'Os dados da evidência não foram aceitos pelo servidor. Nada foi gravado.',
  },
  invalid_portal_link: {
    kind: 'invalid',
    title: 'Vínculo com o portal inválido',
    detail: 'O contrato do portal informado não foi aceito. Nada foi gravado.',
  },
  invalid_private_document_link: {
    kind: 'invalid',
    title: 'Vínculo de documento privado inválido',
    detail: 'O documento informado não foi aceito para este vínculo. Nada foi gravado.',
  },
  origin_details_required_for_manual: {
    kind: 'invalid',
    title: 'Cadastro manual exige a origem declarada',
    detail: 'O servidor recusa contrato manual sem dizer de onde ele veio de verdade. Nada foi gravado.',
  },
  operational_activation_only_for_ativo: {
    kind: 'conflict',
    title: 'Ativação operacional só vale para contrato ativo',
    detail: 'A situação atual do contrato não permite esta ativação. Nada foi alterado.',
  },
  only_closure_completion_supported: {
    kind: 'conflict',
    title: 'Aqui só é possível concluir o encerramento',
    detail: 'Outras mudanças de situação do encerramento usam outro caminho. Nada foi alterado.',
  },
  legal_basis_required_for_legal_requirement: {
    kind: 'invalid',
    title: 'Exigência legal precisa de base legal escrita',
    detail: 'Sem a fundamentação real o servidor recusa o registro. Nada foi gravado.',
  },
  legal_exception_motivation_min_50: {
    kind: 'invalid',
    title: 'A exceção legal exige 50 caracteres de motivação',
    detail: 'O servidor recusa motivação curta para dispensa de exigência legal. Nada foi gravado.',
  },
  legal_exception_requires_legal_basis_and_applicable_rule: {
    kind: 'invalid',
    title: 'A exceção legal exige base legal e norma aplicável',
    detail: 'Os dois campos precisam estar preenchidos com conteúdo real. Nada foi gravado.',
  },
  authorization_notes_required_for_authorized: {
    kind: 'invalid',
    title: 'Autorizar exige a nota de autorização',
    detail: 'Quem autoriza precisa registrar por escrito o fundamento. Nada foi alterado.',
  },
  contract_composition_write_failed: {
    kind: 'retry',
    title: 'A composição do contrato não foi gravada',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  contract_item_write_failed: {
    kind: 'retry',
    title: 'O item do contrato não foi gravado',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  contract_unit_write_failed: {
    kind: 'retry',
    title: 'A unidade do contrato não foi gravada',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  contract_responsible_write_failed: {
    kind: 'retry',
    title: 'O responsável do contrato não foi gravado',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  alert_run_failed: {
    kind: 'retry',
    title: 'O processamento do alerta não foi concluído',
    detail: 'A operação foi desfeita por inteiro. Nenhum alerta parcial ficou na caixa de saída local.',
  },
  obligation_update_failed: {
    kind: 'retry',
    title: 'A obrigação não foi alterada',
    detail: 'A gravação foi desfeita por inteiro. A obrigação continua como estava.',
  },
  implantation_step_update_failed: {
    kind: 'retry',
    title: 'A etapa de implantação não foi atualizada',
    detail: 'A gravação foi desfeita por inteiro. A etapa continua como estava.',
  },
  implantation_block_create_failed: {
    kind: 'retry',
    title: 'O bloqueio de implantação não foi registrado',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  implantation_exception_create_failed: {
    kind: 'retry',
    title: 'A exceção de implantação não foi registrada',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  implantation_exception_update_failed: {
    kind: 'retry',
    title: 'A exceção de implantação não foi alterada',
    detail: 'A gravação foi desfeita por inteiro. A exceção continua como estava.',
  },
  closure_step_update_failed: {
    kind: 'retry',
    title: 'A etapa de encerramento não foi atualizada',
    detail: 'A gravação foi desfeita por inteiro. A etapa continua como estava.',
  },
  closure_complete_failed: {
    kind: 'retry',
    title: 'A conclusão do encerramento não foi gravada',
    detail: 'A gravação foi desfeita por inteiro. O encerramento continua em andamento.',
  },
  fiscal_dossier_create_failed: {
    kind: 'retry',
    title: 'O dossiê fiscal não foi criado',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  quality_evidence_create_failed: {
    kind: 'retry',
    title: 'A evidência de qualidade não foi registrada',
    detail: 'A gravação foi desfeita por inteiro. Nada ficou pela metade.',
  },
  portal_link_failed: {
    kind: 'retry',
    title: 'O vínculo com o portal do cliente não foi gravado',
    detail: 'A gravação foi desfeita por inteiro. O vínculo continua como estava.',
  },
  private_document_link_failed: {
    kind: 'retry',
    title: 'O vínculo do documento privado não foi gravado',
    detail: 'A gravação foi desfeita por inteiro. O vínculo continua como estava.',
  },
});

/**
 * Fallbacks por faixa de status HTTP. Ficam FORA de `ERROR_MESSAGES` de
 * propósito: o teste anti-deriva confere que todo código traduzido existe nos
 * servidores, e estes textos não correspondem a código algum.
 */
const FALLBACK_NETWORK = Object.freeze({
  kind: 'network',
  title: 'Não foi possível falar com o servidor',
  detail: 'A consulta não chegou a ser respondida. Isto não significa que não existam registros.',
});
const FALLBACK_AUTH = Object.freeze({
  kind: 'auth',
  title: 'Esta ação exige sessão de equipe',
  detail: 'O pedido chegou sem sessão válida. Nada foi lido nem gravado.',
});
const FALLBACK_DENIED = Object.freeze({
  kind: 'denied',
  title: 'Seu papel não tem esta concessão',
  detail: 'O menu pode mostrar esta tela, mas a concessão específica para esta ação não está na sua sessão. Nada foi feito.',
});
const FALLBACK_CONFLICT = Object.freeze({
  kind: 'conflict',
  title: 'Conflito com o estado atual',
  detail: 'O registro mudou ou a ação já havia sido feita. Recarregue antes de repetir.',
});
const FALLBACK_INVALID = Object.freeze({
  kind: 'invalid',
  title: 'O servidor recusou os dados enviados',
  detail: 'Revise os campos destacados e tente novamente.',
});
const FALLBACK_SERVER = Object.freeze({
  kind: 'retry',
  title: 'Falha no servidor',
  detail: 'A operação não foi concluída. Isto não significa resultado vazio nem zero.',
});

/**
 * Classifica a resposta de erro de um servidor de contrato.
 * O código continua disponível em `code`, para diagnóstico.
 */
export function describeContractError(code, status = 0) {
  const known = code && Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : null;
  if (known) {
    return { ...known, code, status, canRetry: known.kind === 'retry' || known.kind === 'auth' };
  }
  if (status === 0) return { ...FALLBACK_NETWORK, code: code || null, status, canRetry: true };
  if (status === 401) return { ...FALLBACK_AUTH, code: code || null, status, canRetry: true };
  if (status === 403) return { ...FALLBACK_DENIED, code: code || null, status, canRetry: false };
  if (status === 404) return { ...ERROR_MESSAGES.not_found, code: code || null, status, canRetry: false };
  if (status === 409) return { ...FALLBACK_CONFLICT, code: code || null, status, canRetry: false };
  if (status >= 400 && status < 500) return { ...FALLBACK_INVALID, code: code || null, status, canRetry: false };
  return { ...FALLBACK_SERVER, code: code || null, status, canRetry: true };
}

export function contractErrorVariant(descriptor) {
  return descriptor && (descriptor.kind === 'denied' || descriptor.kind === 'auth') ? 'denied' : 'error';
}

/**
 * Frase pronta para o rodapé de uma falha, declarando a resposta real do
 * servidor. O código canônico fica disponível para diagnóstico, entre
 * parênteses — nunca como a mensagem principal.
 */
export function contractErrorFootnote(descriptor) {
  if (!descriptor) return '';
  const resposta = descriptor.status ? `HTTP ${descriptor.status}` : 'sem resposta';
  return `Resposta do servidor: ${resposta}${descriptor.code ? ` (${descriptor.code})` : ''}.`;
}

/** Mensagem de uma linha, com o código canônico entre parênteses. */
export function contractErrorMessage(code, status = 0) {
  const descriptor = describeContractError(code, status);
  return `${descriptor.title}. ${descriptor.detail} ${contractErrorFootnote(descriptor)}`.trim();
}

// ---------------------------------------------------------------------------
// Rótulos de situação. Os VALORES continuam canônicos (vêm dos tipos ENUM do
// PostgreSQL, ver db/migrations/027 e 032 a 042, mais a canonicalização 118);
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

/** `crm_contract_status` (migração 027). */
const CONTRACT_STATUS_LABELS = buildLookup({
  rascunho: 'Rascunho', ativo: 'Ativo', suspenso: 'Suspenso',
  encerrado: 'Encerrado', cancelado: 'Cancelado',
  aguardando_assinatura: 'Aguardando assinatura',
});
const CONTRACT_STATUS_TONES = buildLookup({
  rascunho: 'neutral', ativo: 'success', suspenso: 'warning',
  encerrado: 'neutral', cancelado: 'danger', aguardando_assinatura: 'info',
});
export function contractStatusLabel(value) { return labelFrom(CONTRACT_STATUS_LABELS, value); }
export function contractStatusTone(value) { return toneFrom(CONTRACT_STATUS_TONES, value); }

/** `crm_contract_origin` (migração 027). */
const CONTRACT_ORIGIN_LABELS = buildLookup({
  manual: 'Cadastro manual identificado',
  crm_proposal_acceptance: 'Proposta aceita no CRM',
  importacao: 'Importação',
});
export function contractOriginLabel(value) { return labelFrom(CONTRACT_ORIGIN_LABELS, value); }

/** `crm_implantation_status` (migração 027). */
const IMPLANTATION_STATUS_LABELS = buildLookup({
  planejada: 'Planejada', em_andamento: 'Em andamento',
  concluida: 'Concluída', cancelada: 'Cancelada',
});
const IMPLANTATION_STATUS_TONES = buildLookup({
  planejada: 'info', em_andamento: 'warning', concluida: 'success', cancelada: 'neutral',
});
export function implantationStatusLabel(value) { return labelFrom(IMPLANTATION_STATUS_LABELS, value); }
export function implantationStatusTone(value) { return toneFrom(IMPLANTATION_STATUS_TONES, value); }

/** `crm_implantation_step_id` (migração 038) — as dez etapas canônicas. */
const IMPLANTATION_STEP_LABELS = buildLookup({
  contrato: 'Contrato assinado',
  data_inicio: 'Data de início definida',
  postos: 'Postos definidos',
  dimensionamento: 'Dimensionamento',
  contratacao_alocacao: 'Contratação e alocação',
  exames_treinamentos: 'Exames e treinamentos',
  equipamentos: 'Equipamentos',
  instrucoes: 'Instruções operacionais',
  faturamento: 'Faturamento',
  convite_cliente: 'Convite do cliente ao portal',
});
export function implantationStepLabel(value) { return labelFrom(IMPLANTATION_STEP_LABELS, value); }

/** `crm_implantation_step_status` (migração 038). */
const STEP_STATUS_LABELS = buildLookup({
  pendente: 'Pendente', em_andamento: 'Em andamento', concluido: 'Concluída',
  nao_aplicavel: 'Não se aplica', bloqueado: 'Bloqueada',
});
const STEP_STATUS_TONES = buildLookup({
  pendente: 'warning', em_andamento: 'info', concluido: 'success',
  nao_aplicavel: 'neutral', bloqueado: 'danger',
});
export function stepStatusLabel(value) { return labelFrom(STEP_STATUS_LABELS, value); }
export function stepStatusTone(value) { return toneFrom(STEP_STATUS_TONES, value); }

/** `crm_implantation_block_type` (migração 039). */
const BLOCK_TYPE_LABELS = buildLookup({
  documentacao: 'Documentação', treinamento: 'Treinamento', equipamento: 'Equipamento',
  legal: 'Exigência legal', operacional: 'Operacional', financeiro: 'Financeiro', outro: 'Outro',
});
export function blockTypeLabel(value) { return labelFrom(BLOCK_TYPE_LABELS, value); }

/** `crm_implantation_exception_status` (migração 039). */
const EXCEPTION_STATUS_LABELS = buildLookup({
  solicitada: 'Solicitada', em_analise: 'Em análise', autorizada: 'Autorizada',
  rejeitada: 'Recusada', cancelada: 'Cancelada',
});
const EXCEPTION_STATUS_TONES = buildLookup({
  solicitada: 'info', em_analise: 'warning', autorizada: 'success',
  rejeitada: 'danger', cancelada: 'neutral',
});
export function exceptionStatusLabel(value) { return labelFrom(EXCEPTION_STATUS_LABELS, value); }
export function exceptionStatusTone(value) { return toneFrom(EXCEPTION_STATUS_TONES, value); }

/** `crm_amendment_type` (migração 035). */
const AMENDMENT_TYPE_LABELS = buildLookup({
  aditivo: 'Aditivo', reajuste: 'Reajuste', repactuacao: 'Repactuação',
  prorrogacao: 'Prorrogação', supressao: 'Supressão', outro: 'Outro',
});
export function amendmentTypeLabel(value) { return labelFrom(AMENDMENT_TYPE_LABELS, value); }

/** `crm_amendment_base_type` (migração 035). */
const AMENDMENT_BASE_LABELS = buildLookup({
  indice_igpm: 'Índice IGP-M', indice_ipca: 'Índice IPCA', indice_inpc: 'Índice INPC',
  dissidio_coletivo: 'Dissídio coletivo', convencao_coletiva: 'Convenção coletiva',
  alteracao_escopo: 'Alteração de escopo', prorrogacao_prazo: 'Prorrogação de prazo',
  reajuste_contratual: 'Reajuste contratual', acordo_comercial: 'Acordo comercial', outro: 'Outro',
});
export function amendmentBaseLabel(value) { return labelFrom(AMENDMENT_BASE_LABELS, value); }

/** `crm_amendment_status` (migração 035). */
const AMENDMENT_STATUS_LABELS = buildLookup({
  rascunho: 'Rascunho', em_revisao: 'Em revisão', aprovado: 'Aprovado',
  rejeitado: 'Recusado', cancelado: 'Cancelado',
});
const AMENDMENT_STATUS_TONES = buildLookup({
  rascunho: 'neutral', em_revisao: 'warning', aprovado: 'success',
  rejeitado: 'danger', cancelado: 'neutral',
});
export function amendmentStatusLabel(value) { return labelFrom(AMENDMENT_STATUS_LABELS, value); }
export function amendmentStatusTone(value) { return toneFrom(AMENDMENT_STATUS_TONES, value); }

/** `crm_alert_type` (migração 036). */
const ALERT_TYPE_LABELS = buildLookup({
  vencimento: 'Vencimento', renovacao: 'Renovação', reajuste: 'Reajuste',
  vigencia_fim: 'Fim de vigência', faturamento: 'Faturamento', outro: 'Outro',
});
export function alertTypeLabel(value) { return labelFrom(ALERT_TYPE_LABELS, value); }

/** `crm_alert_channel` (migração 036). O envio real NÃO acontece aqui. */
const ALERT_CHANNEL_LABELS = buildLookup({
  email: 'E-mail (caixa de saída local)', whatsapp: 'WhatsApp (caixa de saída local)',
  sistema: 'Aviso no sistema', outro: 'Outro',
});
export function alertChannelLabel(value) { return labelFrom(ALERT_CHANNEL_LABELS, value); }

/** `crm_alert_status` (migração 036). */
const ALERT_STATUS_LABELS = buildLookup({
  pendente: 'Pendente', enviado: 'Na caixa de saída local', confirmado: 'Confirmado',
  cancelado: 'Cancelado', concluido: 'Concluído',
});
const ALERT_STATUS_TONES = buildLookup({
  pendente: 'warning', enviado: 'info', confirmado: 'success',
  cancelado: 'neutral', concluido: 'success',
});
export function alertStatusLabel(value) { return labelFrom(ALERT_STATUS_LABELS, value); }
export function alertStatusTone(value) { return toneFrom(ALERT_STATUS_TONES, value); }

/** `crm_doc_obligation_category` (migração 037). */
const OBLIGATION_CATEGORY_LABELS = buildLookup({
  certidao: 'Certidão', alvara: 'Alvará', licenca: 'Licença', comprovante: 'Comprovante',
  contrato: 'Contrato', atestado: 'Atestado', seguro: 'Seguro',
  treinamento: 'Treinamento', outro: 'Outro',
});
export function obligationCategoryLabel(value) { return labelFrom(OBLIGATION_CATEGORY_LABELS, value); }

/** `crm_doc_obligation_periodicity` (migração 037). */
const OBLIGATION_PERIODICITY_LABELS = buildLookup({
  unica: 'Única', mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral',
  anual: 'Anual', sob_demanda: 'Sob demanda', outro: 'Outra',
});
export function obligationPeriodicityLabel(value) { return labelFrom(OBLIGATION_PERIODICITY_LABELS, value); }

/** `crm_doc_obligation_status` (migração 037). */
const OBLIGATION_STATUS_LABELS = buildLookup({
  pendente: 'Pendente', em_analise: 'Em análise', aprovado: 'Aprovada',
  rejeitado: 'Recusada', vencido: 'Vencida', cancelado: 'Cancelada',
});
const OBLIGATION_STATUS_TONES = buildLookup({
  pendente: 'warning', em_analise: 'info', aprovado: 'success',
  rejeitado: 'danger', vencido: 'danger', cancelado: 'neutral',
});
export function obligationStatusLabel(value) { return labelFrom(OBLIGATION_STATUS_LABELS, value); }
export function obligationStatusTone(value) { return toneFrom(OBLIGATION_STATUS_TONES, value); }

/** `crm_obligation_party` (migração 033). */
const OBLIGATION_PARTY_LABELS = buildLookup({
  contratante: 'Contratante', contratada: 'Contratada', ambas: 'Ambas as partes',
});
export function obligationPartyLabel(value) { return labelFrom(OBLIGATION_PARTY_LABELS, value); }

/** `crm_closure_type` (migração 040). */
const CLOSURE_TYPE_LABELS = buildLookup({
  encerramento: 'Encerramento', rescisao: 'Rescisão', distrato: 'Distrato',
  termino_vigencia: 'Término de vigência', outro: 'Outro',
});
export function closureTypeLabel(value) { return labelFrom(CLOSURE_TYPE_LABELS, value); }

/** `crm_closure_status` (migração 040). */
const CLOSURE_STATUS_LABELS = buildLookup({
  planejado: 'Planejado', em_andamento: 'Em andamento',
  concluido: 'Concluído', cancelado: 'Cancelado',
});
const CLOSURE_STATUS_TONES = buildLookup({
  planejado: 'info', em_andamento: 'warning', concluido: 'success', cancelado: 'neutral',
});
export function closureStatusLabel(value) { return labelFrom(CLOSURE_STATUS_LABELS, value); }
export function closureStatusTone(value) { return toneFrom(CLOSURE_STATUS_TONES, value); }

/** `crm_closure_step_type` (migração 040). */
const CLOSURE_STEP_LABELS = buildLookup({
  desmobilizacao_equipe: 'Desmobilização da equipe',
  devolucao_equipamentos: 'Devolução de equipamentos',
  devolucao_chaves: 'Devolução de chaves',
  cobrancas_pendencias: 'Cobranças e pendências',
  documentos_finais: 'Documentos finais',
  revogacao_escopos: 'Revogação de escopos de acesso',
  comunicacao_cliente: 'Comunicação ao cliente',
  outro: 'Outra etapa',
});
export function closureStepLabel(value) { return labelFrom(CLOSURE_STEP_LABELS, value); }

/** `crm_closure_step_status` (migração 040). */
const CLOSURE_STEP_STATUS_LABELS = buildLookup({
  pendente: 'Pendente', em_andamento: 'Em andamento',
  concluido: 'Concluída', nao_aplicavel: 'Não se aplica',
});
const CLOSURE_STEP_STATUS_TONES = buildLookup({
  pendente: 'warning', em_andamento: 'info', concluido: 'success', nao_aplicavel: 'neutral',
});
export function closureStepStatusLabel(value) { return labelFrom(CLOSURE_STEP_STATUS_LABELS, value); }
export function closureStepStatusTone(value) { return toneFrom(CLOSURE_STEP_STATUS_TONES, value); }

/** `crm_fiscal_dossier_status` (migração 041). */
const DOSSIER_STATUS_LABELS = buildLookup({
  rascunho: 'Rascunho', em_analise: 'Em análise', aprovado: 'Aprovado',
  arquivado: 'Arquivado', cancelado: 'Cancelado',
});
const DOSSIER_STATUS_TONES = buildLookup({
  rascunho: 'neutral', em_analise: 'warning', aprovado: 'success',
  arquivado: 'neutral', cancelado: 'neutral',
});
export function dossierStatusLabel(value) { return labelFrom(DOSSIER_STATUS_LABELS, value); }
export function dossierStatusTone(value) { return toneFrom(DOSSIER_STATUS_TONES, value); }

/** `crm_service_measurement_status` (migração 041). */
const MEASUREMENT_STATUS_LABELS = buildLookup({
  pendente: 'Pendente', aprovado: 'Aprovada', rejeitado: 'Recusada', em_ajuste: 'Em ajuste',
});
const MEASUREMENT_STATUS_TONES = buildLookup({
  pendente: 'warning', aprovado: 'success', rejeitado: 'danger', em_ajuste: 'info',
});
export function measurementStatusLabel(value) { return labelFrom(MEASUREMENT_STATUS_LABELS, value); }
export function measurementStatusTone(value) { return toneFrom(MEASUREMENT_STATUS_TONES, value); }

/** `crm_quality_evidence_type` (migração 041). */
const EVIDENCE_TYPE_LABELS = buildLookup({
  foto: 'Foto', relatorio: 'Relatório', indicador: 'Indicador',
  checklist: 'Checklist', outro: 'Outro',
});
export function evidenceTypeLabel(value) { return labelFrom(EVIDENCE_TYPE_LABELS, value); }

/** `crm_management_diary_category` (migração 042). */
const DIARY_CATEGORY_LABELS = buildLookup({
  decisao: 'Decisão', risco: 'Risco', negociacao: 'Negociação', comercial: 'Comercial',
  operacional: 'Operacional', financeiro: 'Financeiro', juridico: 'Jurídico', outro: 'Outro',
});
export function diaryCategoryLabel(value) { return labelFrom(DIARY_CATEGORY_LABELS, value); }

/** `crm_management_diary_visibility` (migração 042). */
const DIARY_VISIBILITY_LABELS = buildLookup({
  restrito: 'Restrito a quem registrou', equipe_gestao: 'Equipe de gestão',
  diretoria: 'Diretoria', outro: 'Outra',
});
export function diaryVisibilityLabel(value) { return labelFrom(DIARY_VISIBILITY_LABELS, value); }

/** `crm_post_shift` (migração 033). */
const POST_SHIFT_LABELS = buildLookup({
  diurno: 'Diurno', noturno: 'Noturno', '12x36_dia': '12x36 diurno',
  '12x36_noite': '12x36 noturno', '24x48': '24x48', comercial: 'Comercial',
  madrugada: 'Madrugada', outro: 'Outro',
});
export function postShiftLabel(value) { return labelFrom(POST_SHIFT_LABELS, value); }

/** `crm_sla_service` (migração 033). */
const SLA_SERVICE_LABELS = buildLookup({
  vigilancia: 'Vigilância', portaria: 'Portaria', limpeza: 'Limpeza',
  monitoramento: 'Monitoramento', manutencao: 'Manutenção',
  atendimento: 'Atendimento', outro: 'Outro',
});
export function slaServiceLabel(value) { return labelFrom(SLA_SERVICE_LABELS, value); }

/** Situação genérica ativo/inativo usada por regra de alerta. */
export function activeLabel(value) { return value ? 'Ativa' : 'Inativa'; }
export function activeTone(value) { return value ? 'success' : 'neutral'; }

/**
 * Data ISO (`YYYY-MM-DD`) no formato brasileiro. Data ausente NUNCA vira uma
 * data inventada nem string vazia: a ausência é declarada.
 */
export function shortDate(value, ausente = 'Não definida') {
  if (value === null || value === undefined || value === '') return ausente;
  const texto = String(value).slice(0, 10);
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!partes) return String(value);
  return `${partes[3]}/${partes[2]}/${partes[1]}`;
}

/**
 * Valor em reais já formatado pelo servidor (os contratos guardam `numeric`,
 * não centavos). Valor ausente NUNCA vira "R$ 0,00": o zero é um dado, a
 * ausência é outra coisa. O espaço após "R$" é comum, não rígido.
 */
export function brl(value) {
  if (value === null || value === undefined || value === '') return 'Dado ausente';
  const numero = Number(value);
  if (!Number.isFinite(numero)) return String(value);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(numero)
    .replace(/\u00a0/g, ' ');
}
