export type AdminAccount = {
  id: string;
  display_name: string;
  document_ref: string | null;
  status: "active" | "suspended" | "closed";
  notes: string | null;
  created_at: string;
};

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
  resolved: "Resolvido",
  closed: "Encerrado",
};

const apiErrors: Record<string, string> = {
  database_not_configured: "O PostgreSQL não está configurado no servidor.",
  migration_required: "A estrutura do banco ainda não foi migrada (npm run db:migrate).",
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
};

export function explainApiError(code: unknown, fallback = "O servidor respondeu de forma inesperada.") {
  if (typeof code !== "string" || !code) return fallback;
  return apiErrors[code] ?? fallback;
}

export async function callApi(path: string, init: RequestInit = {}) {
  const response = await fetch(path, { cache: "no-store", ...init });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(explainApiError(payload.error));
  return payload;
}

export function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
