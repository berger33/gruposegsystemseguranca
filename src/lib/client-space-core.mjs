// Validações puras do espaço do cliente (etapa 2): contas, contratos, documentos
// e chamados. Sem acesso a banco ou disco — as regras são testadas em
// tests/client-space-core.test.mjs e usadas também pelo servidor.

export const ACCOUNT_STATUSES = Object.freeze(["active", "suspended", "closed"]);
export const CONTRACT_STATUSES = Object.freeze(["planned", "active", "suspended", "ended"]);
export const TICKET_STATUSES = Object.freeze(["open", "in_progress", "waiting_client", "resolved", "closed"]);
export const TICKET_REOPEN_TARGETS = Object.freeze(["open", "in_progress"]);

// F03 — jornada cliente -> chamado -> atendimento -> aceite.
// Transições que a EQUIPE pode comandar sobre um chamado. "closed" não aparece
// em nenhum destino: o encerramento nasce do aceite do cliente sobre o
// relatório de aceite vinculado, nunca de uma decisão unilateral da equipe.
export const TICKET_SERVICE_TRANSITIONS = Object.freeze({
  open: Object.freeze(["in_progress"]),
  in_progress: Object.freeze(["waiting_client", "resolved"]),
  waiting_client: Object.freeze(["in_progress"]),
  resolved: Object.freeze(["open", "in_progress"]),
  closed: Object.freeze(["open", "in_progress"]),
});
export const SLA_PAUSE_REASONS = Object.freeze(["waiting_client", "third_party", "maintenance_window", "other"]);

export const VISIT_TYPES = Object.freeze(["technical", "maintenance", "inspection", "meeting", "other"]);
export const VISIT_STATUSES = Object.freeze(["scheduled", "confirmed", "rescheduled", "completed", "cancelled", "no_show"]);
export const REPORT_TYPES = Object.freeze(["execution", "measurement", "acceptance", "other"]);
export const REPORT_STATUSES = Object.freeze(["draft", "in_review", "approved", "rejected", "sent", "acknowledged"]);

// Mesma lista do protótipo de chamados já apresentado ao responsável.
export const TICKET_CATEGORIES = Object.freeze([
  "Acesso ao portal",
  "Contratos ou documentos",
  "Atendimento sobre serviço",
  "Outro assunto",
]);

export const TEXT_LIMITS = Object.freeze({
  accountName: 160,
  documentRef: 32,
  notes: 500,
  reasonMin: 1,
  reasonMax: 500,
  scopeNote: 500,
  contractTitle: 160,
  contractService: 120,
  contractSummary: 500,
  documentTitle: 160,
  documentCategory: 60,
  documentFilename: 200,
  ticketTitle: 120,
  ticketDetails: 500,
  ticketResponse: 500,
  ticketServiceNoteMin: 5,
  ticketReopenReasonMin: 10,
  ticketReopenReason: 500,
  ticketSlaPauseNotes: 500,
  visitTitle: 160,
  visitDetails: 1000,
  visitReasonMin: 10,
  visitReason: 500,
  visitResponsible: 160,
  visitLocation: 200,
  reportTitle: 160,
  reportSummaryMin: 20,
  reportSummary: 1000,
  reportReviewMin: 10,
  reportReview: 1000,
  reportAcknowledgementMin: 3,
  reportAcknowledgement: 500,
});

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

// Extensões permitidas nesta etapa e seus tipos de conteúdo.
export const DOCUMENT_CONTENT_TYPES = Object.freeze({
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  txt: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});

function trimToString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasControlOrAngles(text) {
  return /[\u0000-\u001F<>]/.test(text);
}

export function validateAccountInput({ displayName, documentRef, notes } = {}) {
  const name = trimToString(displayName);
  if (!name) return { error: "account_name_required" };
  if (name.length > TEXT_LIMITS.accountName) return { error: "account_name_too_long" };
  if (hasControlOrAngles(name)) return { error: "account_name_invalid" };
  const ref = trimToString(documentRef);
  if (ref && ref.length > TEXT_LIMITS.documentRef) return { error: "document_ref_too_long" };
  const noteText = trimToString(notes);
  if (noteText && noteText.length > TEXT_LIMITS.notes) return { error: "notes_too_long" };
  return { value: { displayName: name, documentRef: ref || null, notes: noteText || null } };
}

export function validateReason(candidate) {
  const reason = trimToString(candidate);
  if (reason.length < TEXT_LIMITS.reasonMin) return { error: "reason_required" };
  if (reason.length > TEXT_LIMITS.reasonMax) return { error: "reason_too_long" };
  return { value: reason };
}

export function validateScopeNote(candidate) {
  const note = trimToString(candidate);
  if (note.length > TEXT_LIMITS.scopeNote) return { error: "scope_note_too_long" };
  return { value: note || null };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDate(candidate, field) {
  const value = trimToString(candidate);
  if (!value) return { value: null };
  if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    return { error: `${field}_invalid` };
  }
  return { value };
}

export function validateContractInput({ title, service, status, startsOn, endsOn, summary } = {}) {
  const name = trimToString(title);
  if (!name) return { error: "contract_title_required" };
  if (name.length > TEXT_LIMITS.contractTitle) return { error: "contract_title_too_long" };
  if (hasControlOrAngles(name)) return { error: "contract_title_invalid" };
  const serviceName = trimToString(service);
  if (!serviceName) return { error: "contract_service_required" };
  if (serviceName.length > TEXT_LIMITS.contractService) return { error: "contract_service_too_long" };
  const resolvedStatus = status === undefined || status === "" ? "active" : String(status);
  if (!CONTRACT_STATUSES.includes(resolvedStatus)) return { error: "contract_status_invalid" };
  const start = normalizeDate(startsOn, "contract_starts_on");
  if (start.error) return { error: start.error };
  const end = normalizeDate(endsOn, "contract_ends_on");
  if (end.error) return { error: end.error };
  if (start.value && end.value && end.value < start.value) return { error: "contract_period_inverted" };
  const summaryText = trimToString(summary);
  if (summaryText.length > TEXT_LIMITS.contractSummary) return { error: "contract_summary_too_long" };
  return {
    value: {
      title: name,
      service: serviceName,
      status: resolvedStatus,
      startsOn: start.value,
      endsOn: end.value,
      summary: summaryText || null,
    },
  };
}

export function sanitizeFilename(candidate) {
  const raw = trimToString(candidate);
  if (!raw) return { error: "filename_required" };
  const withoutPath = raw.replace(/\\/g, "/").split("/").pop();
  const cleaned = withoutPath.replace(/["\u002A\u003A\u003C\u003E\u003F\u007C\u0000-\u001F]/g, "").trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return { error: "filename_invalid" };
  if (cleaned.length > TEXT_LIMITS.documentFilename) return { error: "filename_too_long" };
  return { value: cleaned };
}

export function validateDocumentMeta({ title, category, filename } = {}) {
  const name = trimToString(title);
  if (!name) return { error: "document_title_required" };
  if (name.length > TEXT_LIMITS.documentTitle) return { error: "document_title_too_long" };
  if (hasControlOrAngles(name)) return { error: "document_title_invalid" };
  const cat = trimToString(category);
  if (!cat) return { error: "document_category_required" };
  if (cat.length > TEXT_LIMITS.documentCategory) return { error: "document_category_too_long" };
  if (hasControlOrAngles(cat)) return { error: "document_category_invalid" };
  const file = sanitizeFilename(filename);
  if (file.error) return { error: file.error };
  const extension = file.value.includes(".") ? file.value.split(".").pop().toLowerCase() : "";
  const contentType = DOCUMENT_CONTENT_TYPES[extension];
  if (!contentType) return { error: "document_type_not_allowed" };
  return {
    value: { title: name, category: cat, originalFilename: file.value, contentType },
  };
}

export function validateTicketInput({ category, title, details } = {}) {
  const cat = trimToString(category);
  if (!TICKET_CATEGORIES.includes(cat)) return { error: "ticket_category_invalid" };
  const name = trimToString(title);
  if (!name) return { error: "ticket_title_required" };
  if (name.length > TEXT_LIMITS.ticketTitle) return { error: "ticket_title_too_long" };
  if (hasControlOrAngles(name)) return { error: "ticket_title_invalid" };
  const body = trimToString(details);
  if (!body) return { error: "ticket_details_required" };
  if (body.length > TEXT_LIMITS.ticketDetails) return { error: "ticket_details_too_long" };
  return { value: { category: cat, title: name, details: body } };
}

export function validateTicketReopenReason(candidate) {
  const reason = trimToString(candidate);
  if (reason.length < TEXT_LIMITS.ticketReopenReasonMin) return { error: "ticket_reopen_reason_required" };
  if (reason.length > TEXT_LIMITS.ticketReopenReason) return { error: "ticket_reopen_reason_too_long" };
  return { value: reason };
}

// A equipe só avança o chamado pelos passos declarados acima; o mesmo estado
// repetido não é "transição" e precisa ser resolvido como replay idempotente.
export function isTicketServiceTransitionAllowed(previous, next) {
  if (!TICKET_STATUSES.includes(previous) || !TICKET_STATUSES.includes(next)) return false;
  return (TICKET_SERVICE_TRANSITIONS[previous] || []).includes(next);
}

export function isTicketServiceReopen(previous, next) {
  return ["resolved", "closed"].includes(previous) && TICKET_REOPEN_TARGETS.includes(next);
}

// Cada passo de atendimento devolve algo ao cliente: a mensagem é obrigatória
// e tem mínimo explícito, como na devolutiva do RH (F03 fatia anterior).
export function validateTicketServiceNote(candidate) {
  const note = trimToString(candidate);
  if (note.length < TEXT_LIMITS.ticketServiceNoteMin) return { error: "ticket_service_note_required" };
  if (note.length > TEXT_LIMITS.ticketResponse) return { error: "ticket_response_too_long" };
  if (hasControlOrAngles(note)) return { error: "ticket_service_note_invalid" };
  return { value: note };
}

export function validateVisitInput({ accountId, contractId, ticketId, visitType, title, details, scheduledAt, responsibleName, location } = {}) {
  const type = trimToString(visitType) || "technical";
  if (!VISIT_TYPES.includes(type)) return { error: "visit_type_invalid" };
  const name = trimToString(title);
  if (!name) return { error: "visit_title_required" };
  if (name.length > TEXT_LIMITS.visitTitle) return { error: "visit_title_too_long" };
  if (hasControlOrAngles(name)) return { error: "visit_title_invalid" };
  const detail = trimToString(details);
  if (detail.length > TEXT_LIMITS.visitDetails) return { error: "visit_details_too_long" };
  const schedule = trimToString(scheduledAt);
  if (!schedule || Number.isNaN(Date.parse(schedule))) return { error: "visit_scheduled_at_invalid" };
  const responsible = trimToString(responsibleName);
  if (responsible.length > TEXT_LIMITS.visitResponsible) return { error: "visit_responsible_too_long" };
  const visitLocation = trimToString(location);
  if (visitLocation.length > TEXT_LIMITS.visitLocation) return { error: "visit_location_too_long" };
  return {
    value: {
      accountId: trimToString(accountId),
      contractId: trimToString(contractId) || null,
      ticketId: trimToString(ticketId) || null,
      visitType: type,
      title: name,
      details: detail || null,
      scheduledAt: schedule,
      responsibleName: responsible || null,
      location: visitLocation || null,
    },
  };
}

export function validateVisitReschedule({ rescheduledTo, reason } = {}) {
  const scheduledAt = trimToString(rescheduledTo);
  if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt))) return { error: "visit_rescheduled_to_invalid" };
  const text = trimToString(reason);
  if (text.length < TEXT_LIMITS.visitReasonMin) return { error: "visit_reschedule_reason_required" };
  if (text.length > TEXT_LIMITS.visitReason) return { error: "visit_reschedule_reason_too_long" };
  return { value: { rescheduledTo: scheduledAt, reason: text } };
}

export function validateReportInput({ accountId, contractId, visitId, ticketId, reportType, title, summary, periodStart, periodEnd } = {}) {
  const type = trimToString(reportType) || "execution";
  if (!REPORT_TYPES.includes(type)) return { error: "report_type_invalid" };
  const name = trimToString(title);
  if (!name) return { error: "report_title_required" };
  if (name.length > TEXT_LIMITS.reportTitle) return { error: "report_title_too_long" };
  if (hasControlOrAngles(name)) return { error: "report_title_invalid" };
  const body = trimToString(summary);
  if (body.length < TEXT_LIMITS.reportSummaryMin) return { error: "report_summary_required" };
  if (body.length > TEXT_LIMITS.reportSummary) return { error: "report_summary_too_long" };
  const start = normalizeDate(periodStart, "report_period_start");
  if (start.error) return { error: start.error };
  const end = normalizeDate(periodEnd, "report_period_end");
  if (end.error) return { error: end.error };
  if (start.value && end.value && end.value < start.value) return { error: "report_period_inverted" };
  return {
    value: {
      accountId: trimToString(accountId),
      contractId: trimToString(contractId) || null,
      visitId: trimToString(visitId) || null,
      ticketId: trimToString(ticketId) || null,
      reportType: type,
      title: name,
      summary: body,
      periodStart: start.value,
      periodEnd: end.value,
    },
  };
}

export function validateReportNote(candidate, { required = false, field = "report_review" } = {}) {
  const note = trimToString(candidate);
  const min = field === "report_acknowledgement" ? TEXT_LIMITS.reportAcknowledgementMin : TEXT_LIMITS.reportReviewMin;
  const max = field === "report_acknowledgement" ? TEXT_LIMITS.reportAcknowledgement : TEXT_LIMITS.reportReview;
  if (required && note.length < min) return { error: `${field}_required` };
  if (note && note.length < min) return { error: `${field}_too_short` };
  if (note.length > max) return { error: `${field}_too_long` };
  return { value: note || null };
}

export function isAccountStatus(candidate) {
  return ACCOUNT_STATUSES.includes(candidate);
}

export function isContractStatus(candidate) {
  return CONTRACT_STATUSES.includes(candidate);
}

export function isTicketStatus(candidate) {
  return TICKET_STATUSES.includes(candidate);
}

export function isSlaPauseReason(candidate) {
  return SLA_PAUSE_REASONS.includes(candidate);
}

export function isVisitStatus(candidate) {
  return VISIT_STATUSES.includes(candidate);
}

export function isVisitType(candidate) {
  return VISIT_TYPES.includes(candidate);
}

export function isReportStatus(candidate) {
  return REPORT_STATUSES.includes(candidate);
}

export function isReportType(candidate) {
  return REPORT_TYPES.includes(candidate);
}
