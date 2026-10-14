export type AdminAccount = {
  id: string;
  display_name: string;
  document_ref: string | null;
  status: "active" | "suspended" | "closed";
  notes: string | null;
  created_at: string;
};

/**
 * UX-PRO-06 (cadastros centrais): estado de UMA leitura independente.
 *
 * `concluiu` separa "nunca houve leitura concluída" de "já houve" — é o que
 * permite distinguir dado possivelmente desatualizado de ausência de dado.
 * `falhaAtualizacao` é a falha transitória DEPOIS de uma leitura concluída: os
 * dados anteriores continuam valendo e a faixa diz isso. Negativa de
 * autorização nunca entra em `falhaAtualizacao` — ela descarta o dado.
 */
export type Recurso<T> = {
  dado: T | null;
  carregando: boolean;
  /** Falha que ocupa a tela por não existir leitura concluída. */
  erro: AdminApiError | null;
  concluiu: boolean;
  /** Hora (relógio do navegador) da última leitura concluída; nada é gravado. */
  ultimaLeitura: string | null;
  falhaAtualizacao: AdminApiError | null;
};

export type ResultadoLeitura<T> = { ok: true; dado: T } | { ok: false; error: AdminApiError };

export function recursoInicial<T>(): Recurso<T> {
  return { dado: null, carregando: true, erro: null, concluiu: false, ultimaLeitura: null, falhaAtualizacao: null };
}

export const accountStatusLabel: Record<AdminAccount["status"], string> = {
  active: "Ativa",
  suspended: "Suspensa",
  closed: "Encerrada",
};

export const contractStatusLabel: Record<string, string> = {
  planned: "Planejado",
  active: "Ativo",
  suspended: "Suspenso",
  ended: "Encerrado",
};

export const ticketStatusLabel: Record<string, string> = {
  open: "Aberto",
  in_progress: "Em atendimento",
  waiting_client: "Aguardando cliente",
  resolved: "Resolvido",
  closed: "Encerrado",
};

export const visitStatusLabel: Record<string, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  rescheduled: "Reagendada",
  completed: "Realizada",
  cancelled: "Cancelada",
  no_show: "Não compareceu",
};

export const visitTypeLabel: Record<string, string> = {
  technical: "Visita técnica",
  maintenance: "Manutenção",
  inspection: "Vistoria",
  meeting: "Reunião",
  other: "Outro",
};

export const reportStatusLabel: Record<string, string> = {
  draft: "Rascunho",
  in_review: "Em revisão",
  approved: "Aprovado",
  rejected: "Rejeitado",
  sent: "Enviado",
  acknowledged: "Aceito/Ciente",
};

export const reportTypeLabel: Record<string, string> = {
  execution: "Execução",
  measurement: "Medição",
  acceptance: "Aceite",
  other: "Outro",
};

const apiErrors: Record<string, string> = {
  database_not_configured: "O PostgreSQL não está configurado no servidor.",
  migration_required: "A estrutura do banco ainda não foi migrada (npm run db:migrate).",
  audit_unavailable: "A auditoria obrigatória está indisponível. Nada foi alterado; tente novamente.",
  idempotency_key_required_or_invalid: "A chave segura desta tentativa não foi reconhecida. Reenvie o formulário.",
  idempotency_conflict: "Os dados mudaram durante uma repetição do envio. Revise e tente novamente.",
  individual_staff_required: "Esta operação exige uma sessão individual da equipe.",
  forbidden: "Sua conta não tem acesso a esta área.",
  admin_session_required: "Sua sessão administrativa expirou. Entre novamente.",
  admin_session_expired: "Sua sessão administrativa expirou. Entre novamente.",
  invalid_json: "O envio não foi reconhecido pelo servidor. Tente novamente.",
  account_name_required: "Informe o nome do cadastro central.",
  account_name_too_long: "Nome do cadastro muito longo (máx. 160 caracteres).",
  account_name_invalid: "O nome contém caracteres não permitidos.",
  document_ref_too_long: "Referência do documento muito longa (máx. 32 caracteres).",
  notes_too_long: "Anotações muito longas (máx. 500 caracteres).",
  account_status_invalid: "Situação de cadastro inválida.",
  identity_not_found: "Identidade não encontrada. Refaça a busca.",
  account_not_found: "Cadastro não encontrado. Recarregue a página.",
  reason_required: "Informe o motivo — ele é obrigatório e fica registrado em auditoria.",
  reason_too_long: "Motivo muito longo (máx. 500 caracteres).",
  scope_note_too_long: "Recorte do vínculo muito longo (máx. 500 caracteres).",
  grant_exists: "Já existe um vínculo ativo entre esta identidade e este cadastro.",
  grant_not_found: "Vínculo não encontrado (ou já revogado). Recarregue a página.",
  invalid_identity_id: "Identidade inválida. Refaça a busca.",
  invalid_account_id: "Cadastro inválido. Recarregue a página.",
  invalid_grant_id: "Vínculo inválido. Recarregue a página.",
  identity_disabled: "Esta identidade de acesso está desabilitada e não pode receber vínculos.",
  ticket_response_too_long: "Resposta muito longa (máx. 500 caracteres).",
  ticket_reopen_reason_required: "Informe um motivo de reabertura com pelo menos 10 caracteres.",
  ticket_reopen_reason_too_long: "Motivo de reabertura muito longo (máx. 500 caracteres).",
  ticket_reopen_only_resolved_or_closed: "Somente chamados resolvidos ou encerrados podem ser reabertos.",
  contract_title_required: "Informe o título do contrato.",
  contract_title_too_long: "Título do contrato muito longo (máx. 160 caracteres).",
  contract_service_required: "Informe o serviço do contrato.",
  contract_service_unknown: "O serviço precisa ser um serviço do catálogo público do site.",
  contract_status_invalid: "Situação de contrato inválida.",
  contract_summary_too_long: "Resumo muito longo (máx. 500 caracteres).",
  contract_starts_on_invalid: "Data de início inválida (use AAAA-MM-DD).",
  contract_ends_on_invalid: "Data de término inválida (use AAAA-MM-DD).",
  contract_period_inverted: "O término não pode ser anterior ao início.",
  contract_not_found: "Contrato não encontrado. Recarregue a página.",
  document_title_required: "Informe o título do documento.",
  document_title_too_long: "Título do documento muito longo (máx. 160 caracteres).",
  document_category_required: "Informe a categoria do documento.",
  document_category_too_long: "Categoria muito longa (máx. 60 caracteres).",
  filename_required: "Selecione um arquivo para enviar.",
  filename_invalid: "Nome de arquivo inválido.",
  document_type_not_allowed: "Tipo de arquivo não permitido (use PDF, imagem, TXT, CSV, DOCX ou XLSX).",
  document_empty: "O arquivo está vazio.",
  document_too_large: "Arquivo muito grande. O limite é 10 MB.",
  document_not_found: "Documento não encontrado. Recarregue a página.",
  document_file_missing: "Arquivo ausente no armazenamento privado. Aviso registrado.",
  ticket_category_invalid: "Categoria do chamado inválida.",
  ticket_status_invalid: "Situação do chamado inválida.",
  ticket_not_found: "Chamado não encontrado. Recarregue a página.",
  upload_too_large: "Envio muito grande. Arquivos de até 10 MB.",
  visit_status_invalid: "Situação de visita inválida.",
  visit_type_invalid: "Tipo de visita inválido.",
  visit_title_required: "Informe o título da visita.",
  visit_title_too_long: "Título da visita muito longo (máx. 160 caracteres).",
  visit_scheduled_at_invalid: "Informe data e hora válidas para a visita.",
  visit_rescheduled_to_invalid: "Informe a nova data/hora do reagendamento.",
  visit_reschedule_reason_required: "Informe o motivo do reagendamento (mín. 10 caracteres).",
  visit_final_status: "Visitas finalizadas/canceladas não podem ser alteradas pelo cliente.",
  contract_account_mismatch: "O contrato escolhido não pertence a este cadastro.",
  ticket_account_mismatch: "O chamado escolhido não pertence a este cadastro.",
  visit_account_mismatch: "A visita escolhida não pertence a este cadastro.",
  report_status_invalid: "Situação de relatório inválida.",
  report_type_invalid: "Tipo de relatório inválido.",
  report_title_required: "Informe o título do relatório.",
  report_summary_required: "Descreva o relatório com pelo menos 20 caracteres.",
  report_summary_too_long: "Resumo do relatório muito longo (máx. 1000 caracteres).",
  report_review_required: "Registre uma nota de revisão antes de avançar.",
  report_review_too_short: "Nota de revisão deve ter pelo menos 10 caracteres.",
  report_review_too_long: "Nota de revisão muito longa (máx. 1000 caracteres).",
  report_approval_required: "O relatório precisa estar aprovado antes de ser enviado.",
  report_not_published: "Este relatório ainda não foi publicado para aceite do cliente.",
  client_acknowledgement_required: "O aceite/ciente deve ser registrado pelo cliente autenticado.",
  permission_scope_denied: "Sua conta não tem concessão sobre estes chamados. Peça ao administrador uma concessão client.tickets.* em /admin/identidades.",
  legacy_cli_ticket_write_retired: "A rota antiga de edição de chamados foi aposentada. Use a fila canônica de atendimento.",
  invalid_ticket_action: "Ação inválida: use assumir ou resolver.",
  ticket_message_invalid: "A mensagem do atendimento precisa ter entre 5 e 1000 caracteres.",
  ticket_transition_not_allowed: "O chamado não está na situação exigida por esta ação (assumir exige aberto; resolver exige em atendimento).",
  ticket_accept_requires_resolved: "O aceite só pode ser registrado pelo cliente com o chamado resolvido.",
};

export function explainApiError(code: unknown, fallback = "O servidor respondeu de forma inesperada.") {
  if (typeof code !== "string" || !code) return fallback;
  return apiErrors[code] ?? fallback;
}

/**
 * UX-PRO-06: classificação do erro de leitura. A mensagem continua sendo a
 * frase em português que os formulários já exibem; o que passa a existir é o
 * `status` e o código canônico devolvidos pelo servidor, que permitem separar
 * três situações que antes eram a mesma coisa:
 *  - `auth`/`denied` — a autorização caiu: descartar o dado (falha fechada);
 *  - `transient` — o servidor falhou agora: preservar o que já foi lido.
 */
export type AdminErrorKind = "auth" | "denied" | "transient";

const AUTH_CODES = new Set(["admin_session_required", "admin_session_expired"]);
const DENIED_CODES = new Set(["forbidden", "individual_staff_required", "permission_scope_denied"]);

export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly kind: AdminErrorKind;

  constructor(message: string, { status = 0, code = "" }: { status?: number; code?: string } = {}) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
    this.kind = status === 401 || AUTH_CODES.has(code) ? "auth"
      : status === 403 || DENIED_CODES.has(code) ? "denied"
      : "transient";
  }

  get negado() {
    return this.kind === "auth" || this.kind === "denied";
  }
}

export function comoAdminApiError(causa: unknown, fallback: string): AdminApiError {
  if (causa instanceof AdminApiError) return causa;
  return new AdminApiError(causa instanceof Error ? causa.message : fallback);
}

/**
 * UX-PRO-06: o mesmo padrão já entregue no funil, na carteira, no comercial, na
 * lista de contratos e no detalhe do contrato. Releitura em curso NÃO apaga o
 * que já foi lido; falha transitória depois de uma leitura concluída vira faixa
 * de "desatualizado" (dados preservados); negativa de autorização continua
 * falha fechada — descarta o dado e ocupa a tela, sem repetir a mesma chamada.
 */
export function resolverLeitura<T>(atual: Recurso<T>, resultado: ResultadoLeitura<T>): Recurso<T> {
  if (resultado.ok) {
    return {
      dado: resultado.dado, carregando: false, erro: null,
      concluiu: true, ultimaLeitura: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      falhaAtualizacao: null,
    };
  }
  if (resultado.error.negado) {
    return { dado: null, carregando: false, erro: resultado.error, concluiu: false, ultimaLeitura: null, falhaAtualizacao: null };
  }
  if (atual.concluiu) {
    return { ...atual, carregando: false, erro: null, falhaAtualizacao: resultado.error };
  }
  return { dado: null, carregando: false, erro: resultado.error, concluiu: false, ultimaLeitura: null, falhaAtualizacao: null };
}

export async function callApi(path: string, init: RequestInit = {}) {
  const response = await fetch(path, { cache: "no-store", ...init });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new AdminApiError(explainApiError(payload.error), {
      status: response.status,
      code: typeof payload.error === "string" ? payload.error : "",
    });
  }
  return payload;
}

export function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
