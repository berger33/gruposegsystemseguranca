export declare const ACCOUNT_STATUSES: readonly ["active", "suspended", "closed"];
export declare const CONTRACT_STATUSES: readonly ["planned", "active", "suspended", "ended"];
export declare const TICKET_STATUSES: readonly ["open", "in_progress", "waiting_client", "resolved", "closed"];
export declare const TICKET_REOPEN_TARGETS: readonly ["open", "in_progress"];
export declare const SLA_PAUSE_REASONS: readonly ["waiting_client", "third_party", "maintenance_window", "other"];
export declare const VISIT_TYPES: readonly ["technical", "maintenance", "inspection", "meeting", "other"];
export declare const VISIT_STATUSES: readonly ["scheduled", "confirmed", "rescheduled", "completed", "cancelled", "no_show"];
export declare const REPORT_TYPES: readonly ["execution", "measurement", "acceptance", "other"];
export declare const REPORT_STATUSES: readonly ["draft", "in_review", "approved", "rejected", "sent", "acknowledged"];
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
export type SlaPauseReason = (typeof SLA_PAUSE_REASONS)[number];
export type VisitType = (typeof VISIT_TYPES)[number];
export type VisitStatus = (typeof VISIT_STATUSES)[number];
export type ReportType = (typeof REPORT_TYPES)[number];
export type ReportStatus = (typeof REPORT_STATUSES)[number];

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

export declare function validateTicketReopenReason(candidate: unknown): { value: string } | { error: string };

export declare function validateVisitInput(input: {
  accountId?: unknown;
  contractId?: unknown;
  ticketId?: unknown;
  visitType?: unknown;
  title?: unknown;
  details?: unknown;
  scheduledAt?: unknown;
  responsibleName?: unknown;
  location?: unknown;
}): { value: { accountId: string; contractId: string | null; ticketId: string | null; visitType: VisitType; title: string; details: string | null; scheduledAt: string; responsibleName: string | null; location: string | null } } | { error: string };

export declare function validateVisitReschedule(input: { rescheduledTo?: unknown; reason?: unknown }): { value: { rescheduledTo: string; reason: string } } | { error: string };

export declare function validateReportInput(input: {
  accountId?: unknown;
  contractId?: unknown;
  visitId?: unknown;
  reportType?: unknown;
  title?: unknown;
  summary?: unknown;
  periodStart?: unknown;
  periodEnd?: unknown;
}): { value: { accountId: string; contractId: string | null; visitId: string | null; reportType: ReportType; title: string; summary: string; periodStart: string | null; periodEnd: string | null } } | { error: string };

export declare function validateReportNote(candidate: unknown, options?: { required?: boolean; field?: string }): { value: string | null } | { error: string };

export declare function isAccountStatus(candidate: unknown): candidate is AccountStatus;
export declare function isContractStatus(candidate: unknown): candidate is ContractStatus;
export declare function isTicketStatus(candidate: unknown): candidate is TicketStatus;
export declare function isSlaPauseReason(candidate: unknown): candidate is SlaPauseReason;
export declare function isVisitStatus(candidate: unknown): candidate is VisitStatus;
export declare function isVisitType(candidate: unknown): candidate is VisitType;
export declare function isReportStatus(candidate: unknown): candidate is ReportStatus;
export declare function isReportType(candidate: unknown): candidate is ReportType;
