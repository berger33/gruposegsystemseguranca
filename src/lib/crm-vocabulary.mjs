// UX-03B: vocabulário de apresentação do CRM.
//
// Regra de ouro desta camada: os VALORES são canônicos e continuam saindo
// exatamente como a API espera (`novo`, `proposta_elaboracao`, `prospect`…).
// Só o RÓTULO exibido muda para português de negócio. Nenhuma função aqui
// decide permissão, filtra dado sigiloso ou altera payload: ela apenas
// traduz. O servidor permanece a única autoridade de acesso.

/** Estágios canônicos do funil, na ordem de leitura do processo comercial. */
export const OPPORTUNITY_STAGES = Object.freeze([
  { value: 'novo', label: 'Novo', hint: 'Entrou no funil e ainda não foi qualificado.' },
  { value: 'qualificacao', label: 'Qualificação', hint: 'Confirmando necessidade, porte e decisor.' },
  { value: 'vistoria', label: 'Vistoria', hint: 'Visita técnica para dimensionar o serviço.' },
  { value: 'proposta_elaboracao', label: 'Proposta em elaboração', hint: 'Orçamento e preço em preparação.' },
  { value: 'proposta_enviada', label: 'Proposta enviada', hint: 'Entregue ao cliente, aguardando resposta.' },
  { value: 'negociacao', label: 'Negociação', hint: 'Ajuste de escopo, prazo ou preço.' },
  { value: 'ganho', label: 'Ganho', hint: 'Estado de funil. Não significa dinheiro recebido.' },
  { value: 'perdido', label: 'Perdido', hint: 'Encerrado sem contrato. Exige motivo registrado.' },
]);

/** Estágios em que a oportunidade segue aberta (espelha OPP_OPEN_STAGES na API). */
export const OPEN_OPPORTUNITY_STAGES = Object.freeze([
  'novo', 'qualificacao', 'vistoria', 'proposta_elaboracao', 'proposta_enviada', 'negociacao',
]);

export const OPPORTUNITY_PRIORITIES = Object.freeze([
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Média' },
  { value: 'alta', label: 'Alta' },
  { value: 'critica', label: 'Crítica' },
]);

export const COMPANY_TYPES = Object.freeze([
  { value: 'prospect', label: 'Potencial cliente' },
  { value: 'client', label: 'Cliente' },
  { value: 'partner', label: 'Parceiro' },
]);

export const COMPANY_STATUS = Object.freeze([
  { value: 'active', label: 'Ativa' },
  { value: 'inactive', label: 'Inativa' },
  { value: 'archived', label: 'Arquivada' },
]);

export const IMPORT_ROW_STATUS = Object.freeze([
  { value: 'ok', label: 'Pronta para importar' },
  { value: 'error', label: 'Com erro' },
  { value: 'duplicate', label: 'Possível duplicata' },
  { value: 'skipped', label: 'Ignorada' },
]);

function toLabel(list, value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  const found = list.find(item => item.value === value);
  return found ? found.label : String(value);
}

export function stageLabel(value) { return toLabel(OPPORTUNITY_STAGES, value); }
export function stageHint(value) {
  const found = OPPORTUNITY_STAGES.find(item => item.value === value);
  return found ? found.hint : '';
}
export function priorityLabel(value) { return toLabel(OPPORTUNITY_PRIORITIES, value); }
export function companyTypeLabel(value) { return toLabel(COMPANY_TYPES, value); }
export function companyStatusLabel(value) { return toLabel(COMPANY_STATUS, value); }
export function importRowStatusLabel(value) { return toLabel(IMPORT_ROW_STATUS, value); }

export function isOpenStage(value) { return OPEN_OPPORTUNITY_STAGES.includes(value); }

/**
 * Mensagens honestas de leitura/escrita do CRM.
 *
 * `kind` separa o que a pessoa pode fazer: `denied` não oferece repetir a
 * mesma chamada, `auth` manda entrar de novo, `retry` permite tentar de novo,
 * `invalid` pede correção no próprio formulário.
 */
const ERROR_MESSAGES = Object.freeze({
  admin_session_required: { kind: 'auth', title: 'Sessão administrativa encerrada', detail: 'Entre novamente na área administrativa para continuar. Nada foi perdido no servidor.' },
  commercial_role_required: { kind: 'denied', title: 'Sem permissão para o funil comercial', detail: 'Seu perfil não autoriza esta consulta. Peça liberação a quem administra os acessos; nenhum dado é exibido sem autorização.' },
  permission_scope_denied: { kind: 'denied', title: 'Permissão específica ausente', detail: 'A sessão existe, mas não tem a concessão necessária para estes dados.' },
  same_origin_required: { kind: 'retry', title: 'Requisição recusada por origem', detail: 'Recarregue a página e repita a ação a partir do próprio sistema.' },
  opportunity_not_found: { kind: 'denied', title: 'Oportunidade indisponível', detail: 'Ela não existe ou está sob responsabilidade de outra pessoa. O funil é pessoal.' },
  company_not_found: { kind: 'denied', title: 'Empresa indisponível', detail: 'O cadastro não foi encontrado no seu escopo.' },
  crm_unavailable: { kind: 'retry', title: 'Não foi possível consultar agora', detail: 'A origem dos dados não respondeu. Isto não significa zero registros: tente novamente.' },
  create_failed: { kind: 'retry', title: 'Não foi possível gravar', detail: 'O servidor recusou a gravação. Nada foi criado; revise e tente de novo.' },
  update_failed: { kind: 'retry', title: 'Não foi possível salvar', detail: 'O servidor recusou a alteração. O registro continua como estava.' },
  invalid_request: { kind: 'invalid', title: 'Dados do formulário inválidos', detail: 'Revise os campos destacados e envie novamente.' },
  invalid_type: { kind: 'invalid', title: 'Tipo de empresa inválido', detail: 'Escolha potencial cliente, cliente ou parceiro.' },
  invalid_status: { kind: 'invalid', title: 'Situação inválida', detail: 'Escolha uma situação da lista.' },
  invalid_stage: { kind: 'invalid', title: 'Estágio inválido', detail: 'Escolha um estágio do funil.' },
  invalid_priority: { kind: 'invalid', title: 'Prioridade inválida', detail: 'Escolha baixa, média, alta ou crítica.' },
  invalid_display_name: { kind: 'invalid', title: 'Nome inválido', detail: 'Informe um nome com ao menos dois caracteres.' },
  document_exists: { kind: 'invalid', title: 'Documento já cadastrado', detail: 'Já existe empresa com este documento. Abra o cadastro existente em vez de duplicar.' },
  company_required: { kind: 'invalid', title: 'Empresa obrigatória', detail: 'Escolha a empresa antes de continuar.' },
  no_fields: { kind: 'invalid', title: 'Nada para salvar', detail: 'Altere ao menos um campo antes de enviar.' },
  method_not_allowed: { kind: 'retry', title: 'Operação não suportada', detail: 'Recarregue a página e tente novamente.' },
  import_not_found: { kind: 'denied', title: 'Importação indisponível', detail: 'O lote não existe ou pertence a outra pessoa.' },
  invalid_csv: { kind: 'invalid', title: 'Arquivo CSV inválido', detail: 'Confira o cabeçalho e o separador do arquivo antes de reenviar.' },
  network: { kind: 'retry', title: 'Falha de rede', detail: 'O navegador não conseguiu falar com o servidor. Verifique a conexão e tente novamente.' },
});

const UNKNOWN_ERROR = Object.freeze({
  kind: 'retry',
  title: 'Não foi possível concluir',
  detail: 'O servidor respondeu com um erro não previsto nesta tela. Tente novamente; se persistir, registre o horário e avise a TI.',
});

/**
 * Traduz código de erro + status HTTP numa mensagem exibível.
 * Nunca inventa sucesso e nunca converte falha em lista vazia.
 */
export function describeCrmError(code, status) {
  const known = code ? ERROR_MESSAGES[code] : null;
  if (known) return { code: code || 'unknown', ...known };
  if (status === 401) return { code: code || 'unauthenticated', ...ERROR_MESSAGES.admin_session_required };
  if (status === 403) return { code: code || 'forbidden', ...ERROR_MESSAGES.commercial_role_required };
  if (status === 404) return { code: code || 'not_found', kind: 'denied', title: 'Registro indisponível', detail: 'Não encontrado no seu escopo de acesso.' };
  if (typeof status === 'number' && status >= 500) return { code: code || 'server_error', ...ERROR_MESSAGES.crm_unavailable };
  return { code: code || 'unknown', ...UNKNOWN_ERROR };
}

/** `true` quando faz sentido oferecer o botão de tentar de novo. */
export function isRetryable(descriptor) {
  return Boolean(descriptor) && descriptor.kind === 'retry';
}
