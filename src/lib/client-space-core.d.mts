export declare const ACCOUNT_STATUSES: readonly ["active", "suspended", "closed"];
export declare const CONTRACT_STATUSES: readonly ["planned", "active", "suspended", "ended"];
export declare const TICKET_STATUSES: readonly ["open", "in_progress", "resolved", "closed"];
export declare const TICKET_CATEGORIES: readonly [
  "Acesso ao portal",
  "Contratos ou documentos",
  "Atendimento sobre serviço",
  "Outro assunto",
];
export declare const TEXT_LIMITS: Readonly<Record<string, number>>;
export declare const MAX_DOCUMENT_BYTES: number;
export declare const DOCUMENT_CONTENT_TYPES: Readonly<Record<string, string>>;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export declare function validateAccountInput(input: {
  displayName?: unknown;
  documentRef?: unknown;
  notes?: unknown;
}): { value: { displayName: string; documentRef: string | null; notes: string | null } } | { error: string };

export declare function validateReason(candidate: unknown): { value: string } | { error: string };
export declare function validateScopeNote(candidate: unknown): { value: string | null } | { error: string };

export declare function validateContractInput(input: {
  title?: unknown;
  service?: unknown;
  status?: unknown;
  startsOn?: unknown;
  endsOn?: unknown;
  summary?: unknown;
}): {
  value: {
    title: string;
    service: string;
    status: ContractStatus;
    startsOn: string | null;
    endsOn: string | null;
    summary: string | null;
  };
} | { error: string };

export declare function sanitizeFilename(candidate: unknown): { value: string } | { error: string };

export declare function validateDocumentMeta(input: {
  title?: unknown;
  category?: unknown;
  filename?: unknown;
}): {
  value: { title: string; category: string; originalFilename: string; contentType: string };
} | { error: string };

export declare function validateTicketInput(input: {
  category?: unknown;
  title?: unknown;
  details?: unknown;
}): { value: { category: string; title: string; details: string } } | { error: string };

export declare function isAccountStatus(candidate: unknown): candidate is AccountStatus;
export declare function isContractStatus(candidate: unknown): candidate is ContractStatus;
export declare function isTicketStatus(candidate: unknown): candidate is TicketStatus;
