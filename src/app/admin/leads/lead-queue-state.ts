// UX-PRO-06: validação local do contrato existente. Não projeta, renomeia ou
// remove campos; um payload inválido inteiro é recusado, nunca vira fila vazia.
export type AdminRole = "marcelo" | "ti" | "comercial" | "admin";
export type LeadStatus = "solicitada" | "em_agendamento" | "confirmada" | "realizada" | "cancelada" | "new" | "contacted" | "closed";
export type Lead = {
  id: string;
  request_kind: "quote" | "visit";
  name: string;
  phone: string;
  city: string;
  property_type: string;
  services: string[];
  visit_preference: string | null;
  details: string | null;
  status: LeadStatus;
  email_status: "not_configured" | "sent" | "failed";
  created_at: string;
  origin?: string | null;
  campaign?: string | null;
  channel?: string | null;
  responsible?: string | null;
  updated_at?: string | null;
};
export type LeadQueue = { leads: Lead[]; total: number };
export type LeadError = { kind: "auth" | "denied" | "retry" | "invalid" | "error"; title: string; detail: string; canRetry: boolean };

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validDate(value: unknown) {
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Date.parse(value));
}
function validLead(value: unknown): value is Lead {
  if (!object(value)) return false;
  if (typeof value.id !== "string" || !value.id.trim()) return false;
  if (value.request_kind !== "quote" && value.request_kind !== "visit") return false;
  if (![value.name, value.phone, value.city, value.property_type, value.status, value.email_status].every(field => typeof field === "string")) return false;
  if (!Array.isArray(value.services) || !value.services.every(service => typeof service === "string")) return false;
  if (!validDate(value.created_at)) return false;
  for (const field of ["visit_preference", "details", "origin", "campaign", "channel", "responsible", "updated_at"]) {
    if (value[field] !== undefined && value[field] !== null && typeof value[field] !== "string") return false;
  }
  return value.updated_at == null || validDate(value.updated_at);
}
export function parseLeadQueue(value: unknown): LeadQueue {
  if (!object(value) || !Array.isArray(value.leads) || !value.leads.every(validLead)
    || !Number.isSafeInteger(value.total) || (value.total as number) < 0) {
    throw new Error("invalid_response");
  }
  // Preserva também os campos que a API já devolve e esta tela não renderiza.
  return { ...value, leads: value.leads, total: value.total as number };
}

export function describeLeadError(status: number, code: unknown, operation: "read" | "update" | "convert" = "read"): LeadError {
  if (status === 401 || code === "admin_session_required") return {
    kind: "auth", title: "Sua sessão precisa ser renovada",
    detail: "A sessão expirou ou não foi reconhecida. Entre novamente para consultar a fila. Nenhuma ausência de pedidos foi inferida.", canRetry: false,
  };
  if (status === 403 || code === "forbidden") return {
    kind: "denied", title: "Acesso negado a esta leitura",
    detail: "O servidor não autorizou esta sessão a acessar a fila. Os dados anteriores foram descartados; nenhuma alteração foi confirmada por esta leitura.", canRetry: false,
  };
  if (code === "invalid_response") return {
    kind: "invalid", title: "O servidor devolveu uma resposta inválida",
    detail: "A lista de pedidos não tem o formato esperado. Isso não significa que a fila esteja vazia. Tente uma nova leitura.", canRetry: true,
  };
  if (code === "database_not_configured" || code === "migration_required") return {
    kind: "retry", title: "A leitura depende da configuração do banco",
    detail: code === "database_not_configured" ? "O PostgreSQL ainda não está configurado no servidor." : "A estrutura do banco ainda não foi migrada no servidor.", canRetry: true,
  };
  if (status === 0 || status === 408 || status === 429 || status >= 500) {
    const detail = operation === "update" ? "Não foi possível confirmar a alteração de situação do pedido. A lista não foi substituída por essa resposta; atualize a fila antes de tentar novamente."
      : operation === "convert" ? "Não foi possível confirmar a conversão em oportunidade. A fila não afirma que a conversão ocorreu; atualize e confira antes de repetir."
      : "Não foi possível concluir a leitura dos pedidos. O serviço pode estar indisponível ou a conexão foi interrompida.";
    return { kind: "retry", title: operation === "read" ? "A fila está temporariamente indisponível" : "A escrita não foi confirmada", detail, canRetry: true };
  }
  const details: Record<string, string> = {
    invalid_status: "A situação escolhida não foi aceita pelo servidor.",
    invalid_status_filter: "O filtro escolhido não foi aceito pelo servidor.",
    invalid_lead_id: "O identificador do pedido não foi aceito pelo servidor.",
    lead_not_found: "O pedido não foi encontrado. Atualize a fila para conferir os registros disponíveis.",
    same_origin_required: "A origem da solicitação não foi aceita. Recarregue a página pelo endereço do sistema.",
    company_required: "A conversão precisa de uma empresa de destino.",
    invalid_company_name: "O nome da empresa não foi aceito para a conversão.",
  };
  return { kind: "error", title: "A solicitação não foi concluída", detail: (typeof code === "string" && details[code]) || (operation === "update" ? "Não foi possível alterar a situação do pedido." : operation === "convert" ? "Não foi possível converter o pedido em oportunidade." : "Não foi possível carregar os pedidos."), canRetry: false };
}
