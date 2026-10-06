// UX-08 / EXT-03 — vocabulário da jornada canônica de LICITAÇÕES.
// Os 64 códigos abaixo foram inventariados no arquivo real
// src/server/ext-bidding-api.mjs. Cada descrição explica a regra que produziu
// o código; código desconhecido permanece cru e não recebe causa inventada.

const E = (kind, title, detail, canRetry = false) => Object.freeze({ kind, title, detail, canRetry });

export const ERROR_MESSAGES = Object.freeze({
  alert_rule_already_registered: E('conflict', 'Regra de alerta já registrada', 'O edital já possui uma regra de antecedência ativa; o servidor não sobrepõe essa regra silenciosamente.'),
  audit_unavailable: E('unavailable', 'Auditoria indisponível', 'A mutação foi desfeita porque evento e auditoria precisam ser gravados na mesma transação.', true),
  bidding_closed: E('conflict', 'Edital encerrado', 'A situação do edital é terminal e a operação solicitada não pode reabri-lo nem alterar sua jornada.'),
  bidding_not_closed: E('conflict', 'Edital ainda não encerrado', 'O resultado só pode ser registrado depois de o edital alcançar uma situação terminal.'),
  bidding_not_found: E('not_found', 'Edital não encontrado', 'O identificador não corresponde a um edital da fonte canônica ext_bidding_notices.'),
  bidding_unavailable: E('unavailable', 'Licitações indisponíveis', 'A leitura canônica falhou; isso não significa que não existam editais.', true),
  body_too_large: E('invalid', 'Conteúdo muito extenso', 'O corpo ultrapassou o limite de leitura aceito pelo servidor.'),
  checklist_item_already_deactivated: E('conflict', 'Item já desativado', 'O item de checklist já conserva autor, data e motivo de desativação.'),
  checklist_item_already_registered: E('conflict', 'Tipo já exigido no checklist', 'Já existe item ativo para este tipo documental no edital.'),
  checklist_item_not_found: E('not_found', 'Item de checklist não encontrado', 'O identificador não aponta para um item do checklist canônico.'),
  deadline_already_registered: E('conflict', 'Prazo já registrado', 'Já existe prazo vigente dessa espécie; substitua-o pela rota explícita de retificação.'),
  deadline_already_superseded: E('conflict', 'Prazo já substituído', 'O prazo informado já foi preservado como versão anterior e não pode ser substituído outra vez.'),
  deadline_not_found: E('not_found', 'Prazo não encontrado', 'O identificador não corresponde a um prazo canônico.'),
  document_already_deactivated: E('conflict', 'Documento já desativado', 'O documento já foi desativado com motivo e autoria preservados.'),
  document_already_superseded: E('conflict', 'Documento já substituído', 'A versão documental indicada já possui sucessora no dossiê.'),
  document_deactivated: E('conflict', 'Documento desativado', 'Um documento desativado não pode servir como versão anterior de um novo registro.'),
  document_not_found: E('not_found', 'Documento não encontrado', 'O identificador não aponta para documento do dossiê canônico.'),
  document_not_in_bidding: E('conflict', 'Documento pertence a outro edital', 'A versão indicada para substituição não pertence ao edital selecionado.'),
  duplicate_edital_number: E('conflict', 'Número de edital duplicado', 'O número informado já identifica outro edital canônico.'),
  duplicate_protocol: E('conflict', 'Protocolo duplicado', 'O protocolo gerado colidiu com um registro existente; repetir com a mesma chave continua seguro.', true),
  duplicate_storage_key: E('conflict', 'Chave de armazenamento duplicada', 'A referência de armazenamento já está vinculada a outro documento.'),
  forbidden_role: E('denied', 'Papel sem acesso a licitações', 'O servidor restringe esta jornada a admin, marcelo e ti.'),
  idempotency_key_required: E('invalid', 'Chave da operação ausente', 'Toda escrita exige Idempotency-Key válida para repetição sem duplicidade.'),
  idempotency_key_reused: E('conflict', 'Chave reutilizada com outro conteúdo', 'A identidade já usou esta chave com impressão digital diferente.'),
  invalid_amount_cents: E('invalid', 'Valor da proposta inválido', 'O valor precisa ser um inteiro positivo em centavos.'),
  invalid_bidding_id: E('invalid', 'Filtro de edital inválido', 'O parâmetro bidding_id precisa ser UUID quando presente.'),
  invalid_days_before: E('invalid', 'Antecedência inválida', 'A regra aceita um número inteiro entre 1 e 365 dias.'),
  invalid_deadline_kind: E('invalid', 'Tipo de prazo inválido', 'O tipo precisa pertencer à lista DEADLINE_KINDS do servidor.'),
  invalid_description: E('invalid', 'Descrição inválida', 'A descrição do edital não respeita o tamanho exigido pelo servidor.'),
  invalid_document_type: E('invalid', 'Tipo documental inválido', 'O tipo do documento precisa respeitar o tamanho aceito.'),
  invalid_due_date: E('invalid', 'Data do prazo inválida', 'A data de vencimento precisa ser uma data ISO real no formato AAAA-MM-DD.'),
  invalid_edital_number: E('invalid', 'Número do edital inválido', 'O número do edital é obrigatório e precisa respeitar o limite de caracteres.'),
  invalid_estimated_value: E('invalid', 'Valor estimado inválido', 'Quando informado, o valor estimado precisa ser inteiro não negativo em centavos.'),
  invalid_file_name: E('invalid', 'Nome de arquivo inválido', 'O nome declarado do arquivo precisa respeitar o tamanho aceito.'),
  invalid_file_url: E('invalid', 'URL de referência inválida', 'A referência externa declarada precisa ser uma URL HTTP ou HTTPS aceita pelo servidor.'),
  invalid_justification: E('invalid', 'Justificativa inválida', 'A justificativa é obrigatória e precisa respeitar o intervalo de tamanho da operação.'),
  invalid_label: E('invalid', 'Rótulo do checklist inválido', 'O rótulo do item precisa respeitar o tamanho aceito.'),
  invalid_reason: E('invalid', 'Motivo inválido', 'O motivo de retirada, substituição ou desativação precisa ter entre 5 e 500 caracteres.'),
  invalid_reference: E('invalid', 'Identificador inválido', 'O identificador presente na URL não tem formato UUID.'),
  invalid_request: E('invalid', 'Conteúdo ilegível', 'O corpo não é um objeto JSON válido.'),
  invalid_responsible_identity: E('invalid', 'Identidade responsável inválida', 'A identidade designada precisa ser um UUID válido.'),
  invalid_result: E('invalid', 'Resultado inválido', 'O texto do resultado precisa respeitar o tamanho exigido.'),
  invalid_source: E('invalid', 'Fonte do prazo inválida', 'A fonte precisa ser edital publicado, retificação publicada ou registro interno.'),
  invalid_source_reference: E('invalid', 'Referência da fonte inválida', 'A referência que sustenta o prazo precisa respeitar o tamanho aceito.'),
  invalid_stage: E('invalid', 'Etapa inválida', 'O filtro aceita somente em_andamento ou encerrado.'),
  invalid_status: E('invalid', 'Situação inválida', 'A situação não pertence a BIDDING_STATUSES.'),
  invalid_status_transition: E('conflict', 'Transição de situação recusada', 'A máquina de estados não permite esta passagem a partir da situação atual.'),
  invalid_storage_key: E('invalid', 'Chave de armazenamento inválida', 'A referência declarada de armazenamento precisa respeitar o tamanho aceito.'),
  invalid_summary: E('invalid', 'Resumo da proposta inválido', 'O resumo da proposta precisa respeitar o tamanho exigido.'),
  invalid_supersedes_document_id: E('invalid', 'Documento anterior inválido', 'A referência da versão documental anterior precisa ser UUID.'),
  invalid_title: E('invalid', 'Título inválido', 'O título do edital precisa respeitar o tamanho exigido.'),
  legacy_mutation_retired: E('conflict', 'Escrita legada aposentada', 'O alias antigo permanece somente para leitura e informa a rota canônica de documentos.'),
  method_not_allowed: E('invalid', 'Método não permitido', 'O recurso existe, mas não aceita o método HTTP solicitado.'),
  origin_forbidden: E('denied', 'Origem recusada', 'A escrita só é aceita a partir da mesma origem da aplicação.'),
  proposal_already_withdrawn: E('conflict', 'Proposta já retirada', 'A proposta já registra retirada e não pode ser retirada novamente.'),
  proposal_not_found: E('not_found', 'Proposta não encontrada', 'O identificador não aponta para proposta canônica.'),
  responsible_identity_not_found: E('not_found', 'Identidade não encontrada', 'A identidade indicada não existe no cadastro canônico.'),
  responsible_not_active: E('conflict', 'Responsável inativo', 'A identidade existe, mas não está ativa para receber a designação.'),
  responsible_not_staff: E('denied', 'Identidade não pertence à equipe', 'Somente uma identidade staff pode ser responsável pelo edital.'),
  responsible_unchanged: E('conflict', 'Responsável não mudou', 'A identidade informada já é a responsável vigente.'),
  result_already_recorded: E('conflict', 'Resultado já registrado', 'O resultado é imutável depois de gravado com autor, data e justificativa.'),
  status_unchanged: E('conflict', 'Situação não mudou', 'A nova situação é igual à situação atual do edital.'),
  superseded_document_not_found: E('not_found', 'Versão anterior não encontrada', 'O documento indicado como versão anterior não existe.'),
  unauthorized: E('denied', 'Sessão necessária', 'A jornada exige sessão válida de equipe; abrir a rota não concede autorização.'),
});

export function describeBiddingError(code, status = 0) {
  if (!code && status === 0) return { code: null, status, ...E('network', 'Servidor inacessível', 'Não foi possível ler licitações; isso não representa uma lista vazia.', true) };
  const known = code ? ERROR_MESSAGES[code] : null;
  if (known) return { code, status, ...known };
  return { code: code ?? null, status, ...E('error', 'Falha no servidor', code ? `O servidor devolveu o código não traduzido ${code}; a causa não foi presumida.` : 'O servidor respondeu sem código técnico legível.', status >= 500) };
}
export const biddingErrorVariant = error => error?.kind === 'denied' ? 'denied' : 'error';
export const biddingErrorFootnote = error => `Código técnico: ${error?.code ? `(${error.code})` : 'indisponível'}`;

const labels = Object.freeze({
  rascunho:'Rascunho', publicado:'Publicado', em_analise:'Em análise', homologado:'Homologado', vencido:'Vencido', cancelado:'Cancelado', deserto:'Deserto',
  publicacao:'Publicação', esclarecimento:'Esclarecimentos', impugnacao:'Impugnação', entrega_proposta:'Entrega da proposta', sessao_abertura:'Sessão de abertura', recurso:'Recurso', assinatura:'Assinatura',
  edital_publicado:'Edital publicado', retificacao_publicada:'Retificação publicada', registro_interno:'Registro interno',
  em_andamento:'Em andamento', encerrado:'Encerrado', vigente:'Vigente', a_vencer:'A vencer', substituido:'Substituído', sem_data_declarada:'Sem data declarada', prazo_inexistente:'Prazo não registrado',
  prazo_vigente:'Prazo vigente — proposta aceita', prazo_encerrado:'Prazo encerrado — proposta recusada', sem_prazo_registrado:'Sem prazo — proposta recusada', edital_encerrado:'Edital encerrado — proposta recusada', edital_inexistente:'Edital inexistente',
  atendido:'Atendido', pendente:'Pendente', desativado:'Desativado', indicada_nao_confirmada:'Indicada, não confirmada', sem_regra_de_antecedencia:'Sem regra de antecedência'
});
export const biddingLabel = value => value == null || value === '' ? 'Não informado' : (labels[value] ?? String(value));
export const biddingStatusLabel = biddingLabel;
export const deadlineKindLabel = biddingLabel;
export const deadlineSourceLabel = biddingLabel;
export const deadlineSituationLabel = biddingLabel;
export const proposalDecisionLabel = biddingLabel;
export const checklistStatusLabel = biddingLabel;
export const honestText = value => value == null || value === '' ? 'Não informado' : String(value);
export const honestDate = value => value ? new Intl.DateTimeFormat('pt-BR', { timeZone:'UTC' }).format(new Date(`${String(value).slice(0,10)}T00:00:00Z`)) : 'Não informada';
export const honestDateTime = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short' }).format(new Date(value)) : 'Não informado';
export const honestMoney = cents => cents == null ? 'Não informado' : new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(cents)/100);
export const count = (value, singular, plural) => value == null ? 'Não apurado' : `${value} ${Number(value) === 1 ? singular : plural}`;
export const EXTERNAL_BOUNDARY = 'Não existe integração com portal público nem armazenamento de arquivo; referências são declaradas pela equipe.';
