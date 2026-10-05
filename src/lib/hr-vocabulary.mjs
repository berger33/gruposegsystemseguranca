// UX-04: vocabulário de apresentação do RH.
//
// Regra de ouro desta camada, igual à de `crm-vocabulary.mjs`: os VALORES são
// canônicos e continuam saindo exatamente como as APIs esperam
// (`em_admissao`, `solicitado`, `dispensa_sem_justa`, `published`…). Só o
// RÓTULO exibido muda para português de negócio.
//
// Nenhuma função aqui decide permissão, filtra dado sensível ou altera
// payload. O servidor (`src/server/employee-api.mjs`, `hr-api.mjs`,
// `hr-termination-api.mjs`) continua sendo a única autoridade de acesso.
// `tests/ux-hr-vocabulary.test.mjs` lê os conjuntos canônicos direto desses
// arquivos e falha se a interface e o servidor divergirem.

/** Situação do cadastro profissional — espelha EMP_STATUS em `hr-api.mjs`. */
export const EMPLOYEE_STATUS = Object.freeze([
  { value: 'em_admissao', label: 'Em admissão', hint: 'Cadastro criado, processo de entrada em andamento.' },
  { value: 'ativo', label: 'Ativo', hint: 'Trabalhando normalmente.' },
  { value: 'afastado', label: 'Afastado', hint: 'Vínculo mantido, sem prestar serviço no momento.' },
  { value: 'suspenso', label: 'Suspenso', hint: 'Vínculo mantido, atividade interrompida por decisão registrada.' },
  { value: 'desligado', label: 'Desligado', hint: 'Vínculo encerrado. O acesso do portal é revogado.' },
  { value: 'arquivado', label: 'Arquivado', hint: 'Cadastro histórico, fora da operação.' },
]);

/** Situação do processo de admissão — espelha ADMISSION_STATUS em `hr-api.mjs`. */
export const ADMISSION_STATUS = Object.freeze([
  { value: 'pendente', label: 'Pendente' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'concluida', label: 'Concluída' },
  { value: 'cancelada', label: 'Cancelada' },
  { value: 'rejeitada', label: 'Rejeitada' },
]);

/** Tipos de solicitação do funcionário — espelha SELF_REQUEST_TYPES em `employee-api.mjs`. */
export const SELF_REQUEST_TYPES = Object.freeze([
  { value: 'ferias', label: 'Férias' },
  { value: 'afastamento', label: 'Afastamento' },
  { value: 'beneficio', label: 'Benefício' },
  { value: 'reembolso', label: 'Reembolso' },
  { value: 'outro', label: 'Outro assunto' },
]);

/**
 * Situação da solicitação do funcionário — espelha `validStatuses` do
 * handler de `/api/admin/hr/l03/self-requests`.
 */
export const SELF_REQUEST_STATUS = Object.freeze([
  { value: 'solicitado', label: 'Aguardando análise', tone: 'warning' },
  { value: 'em_analise', label: 'Em análise', tone: 'info' },
  { value: 'aprovado', label: 'Aprovada', tone: 'success' },
  { value: 'rejeitado', label: 'Rejeitada', tone: 'danger' },
  { value: 'cancelado', label: 'Cancelada', tone: 'neutral' },
  { value: 'concluido', label: 'Concluída', tone: 'success' },
  { value: 'pendente', label: 'Pendente', tone: 'warning' },
  { value: 'encerrado', label: 'Encerrada', tone: 'neutral' },
]);

/** Situação do documento privado — espelha o conjunto aceito no PATCH de documentos. */
export const DOCUMENT_STATUS = Object.freeze([
  { value: 'under_review', label: 'Em revisão', tone: 'info' },
  { value: 'approved', label: 'Aprovado', tone: 'success' },
  { value: 'published', label: 'Publicado ao titular', tone: 'success' },
  { value: 'rejected', label: 'Rejeitado', tone: 'danger' },
  { value: 'superseded', label: 'Substituído', tone: 'neutral' },
]);

/** Natureza do documento privado — espelha a lista de `documentKind` em `employee-api.mjs`. */
export const DOCUMENT_KINDS = Object.freeze([
  { value: 'submission', label: 'Envio do funcionário' },
  { value: 'payroll', label: 'Holerite' },
  { value: 'income_report', label: 'Informe de rendimentos' },
  { value: 'course_proof', label: 'Comprovante de curso' },
  { value: 'request_attachment', label: 'Anexo de solicitação' },
  { value: 'general', label: 'Documento geral' },
]);

/** Tipo de desligamento — espelha TERMINATION_TYPE em `hr-termination-api.mjs`. */
export const TERMINATION_TYPES = Object.freeze([
  { value: 'pedido_demissao', label: 'Pedido de demissão' },
  { value: 'dispensa_sem_justa', label: 'Dispensa sem justa causa' },
  { value: 'dispensa_com_justa', label: 'Dispensa com justa causa' },
  { value: 'termino_contrato', label: 'Término de contrato' },
  { value: 'acordo', label: 'Acordo entre as partes' },
  { value: 'outro', label: 'Outro motivo' },
]);

/** Documentos cuja leitura/escrita exige concessão de remuneração separada. */
export const COMPENSATION_DOCUMENT_KINDS = Object.freeze(['payroll', 'income_report']);

function entry(list, value) {
  if (value === null || value === undefined || value === '') return null;
  const key = String(value).trim().toLowerCase();
  return list.find(item => item.value === key) || null;
}

function toLabel(list, value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  const found = entry(list, value);
  // Valor desconhecido continua visível como veio: a tela não esconde dado real
  // nem inventa um rótulo para um estado que o servidor passou a emitir.
  return found ? found.label : String(value);
}

export function employeeStatusLabel(value) { return toLabel(EMPLOYEE_STATUS, value); }
export function employeeStatusHint(value) { return entry(EMPLOYEE_STATUS, value)?.hint || ''; }
export function admissionStatusLabel(value) { return toLabel(ADMISSION_STATUS, value); }
export function selfRequestTypeLabel(value) { return toLabel(SELF_REQUEST_TYPES, value); }
export function selfRequestStatusLabel(value) { return toLabel(SELF_REQUEST_STATUS, value); }
export function selfRequestStatusTone(value) { return entry(SELF_REQUEST_STATUS, value)?.tone || 'neutral'; }
export function documentStatusLabel(value) { return toLabel(DOCUMENT_STATUS, value); }
export function documentStatusTone(value) { return entry(DOCUMENT_STATUS, value)?.tone || 'neutral'; }
export function documentKindLabel(value) { return toLabel(DOCUMENT_KINDS, value); }
export function terminationTypeLabel(value) { return toLabel(TERMINATION_TYPES, value); }

/** Situação do cadastro em que ainda faz sentido oferecer desligamento. */
export function isTerminable(status) {
  return String(status || '').toLowerCase() !== 'desligado';
}

/**
 * Mensagens para os códigos de erro que as APIs de RH realmente devolvem.
 *
 * O ponto central para a Andreia: `permission_scope_denied` é a resposta de um
 * papel que PASSA no `AdminGate` do menu mas NÃO tem a concessão fina exigida
 * pela rota. Menu não é autorização — a tela precisa dizer isso em vez de
 * mostrar indicadores zerados.
 */
const ERROR_MESSAGES = Object.freeze({
  admin_session_required: {
    kind: 'auth',
    title: 'Sessão não reconhecida',
    detail: 'Sua sessão de equipe expirou ou não foi reconhecida. Entre novamente para continuar.',
  },
  permission_scope_denied: {
    kind: 'denied',
    title: 'Sem a concessão necessária',
    detail: 'Seu papel abre esta página, mas a concessão específica desta consulta não está ativa para a sua conta. Aparecer no menu não concede acesso: a permissão é verificada no servidor a cada chamada. Peça ao TI a concessão correspondente.',
  },
  compensation_permission_required: {
    kind: 'denied',
    title: 'Remuneração exige concessão própria',
    detail: 'Holerite e informe de rendimentos dependem das concessões employees.compensation.read/write, separadas do acesso geral de RH. Nada foi exibido nem gravado.',
  },
  employee_not_found: {
    kind: 'invalid',
    title: 'Cadastro não encontrado',
    detail: 'O cadastro informado não existe ou está fora do seu escopo.',
  },
  same_origin_required: {
    kind: 'invalid',
    title: 'Requisição recusada por proteção de origem',
    detail: 'Recarregue a página e repita a ação.',
  },
  authorized_source_required: {
    kind: 'invalid',
    title: 'Publicação exige fonte autorizada',
    detail: 'O documento só pode ser publicado ao titular depois de marcado como vindo de fonte autorizada.',
  },
  rejection_reason_required: {
    kind: 'invalid',
    title: 'Motivo obrigatório',
    detail: 'Rejeitar exige um motivo com ao menos 5 caracteres, que fica registrado.',
  },
  invalid_review_action: {
    kind: 'invalid',
    title: 'Ação de análise inválida',
    detail: 'A análise só aceita iniciar, aprovar ou rejeitar.',
  },
  invalid_status: {
    kind: 'invalid',
    title: 'Situação inválida',
    detail: 'A situação enviada não é aceita pelo servidor.',
  },
  duplicate_matricula: {
    kind: 'invalid',
    title: 'Matrícula já utilizada',
    detail: 'Já existe um cadastro com esta matrícula. Confira antes de criar outro.',
  },
});

/**
 * Classifica uma falha de leitura ou escrita do RH sem suavizar o significado.
 * Carregando não vira vazio, falha não vira zero e negativa não vira silêncio.
 *
 * @param {string|null} code código canônico devolvido pela API, se houver
 * @param {number} status status HTTP (0 quando a requisição nem chegou)
 */
export function describeHrError(code, status) {
  const known = code && Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code) ? ERROR_MESSAGES[code] : null;
  if (known) return { ...known, code, status, canRetry: known.kind === 'auth' };

  if (status === 0) {
    return {
      kind: 'network',
      title: 'Não foi possível falar com o servidor',
      detail: 'A consulta não chegou a ser respondida. Isto não significa que não existam registros.',
      code,
      status,
      canRetry: true,
    };
  }
  if (status === 401) {
    return { ...ERROR_MESSAGES.admin_session_required, code, status, canRetry: true };
  }
  if (status === 403) {
    return { ...ERROR_MESSAGES.permission_scope_denied, code, status, canRetry: false };
  }
  if (status === 404) {
    return {
      kind: 'invalid',
      title: 'Registro não encontrado',
      detail: 'O registro não existe ou não pertence ao seu escopo.',
      code,
      status,
      canRetry: false,
    };
  }
  if (status === 409) {
    return {
      kind: 'conflict',
      title: 'Conflito com o estado atual',
      detail: 'O registro mudou ou a ação já havia sido feita. Recarregue antes de repetir.',
      code,
      status,
      canRetry: false,
    };
  }
  if (status >= 400 && status < 500) {
    return {
      kind: 'invalid',
      title: 'O servidor recusou os dados enviados',
      detail: 'Revise os campos destacados e tente novamente.',
      code,
      status,
      canRetry: false,
    };
  }
  return {
    kind: 'retry',
    title: 'Falha no servidor',
    detail: 'O servidor respondeu com erro e nada foi carregado nem gravado. Isto não é a mesma coisa que não haver registros.',
    code,
    status,
    canRetry: true,
  };
}

/** Variante visual de `UiState` correspondente à falha classificada. */
export function hrErrorVariant(descriptor) {
  return descriptor && (descriptor.kind === 'denied' || descriptor.kind === 'auth') ? 'denied' : 'error';
}
