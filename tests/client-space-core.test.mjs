import test from "node:test";
import assert from "node:assert/strict";
import {
  DOCUMENT_CONTENT_TYPES,
  MAX_DOCUMENT_BYTES,
  TEXT_LIMITS,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  isAccountStatus,
  isContractStatus,
  isTicketStatus,
  sanitizeFilename,
  validateAccountInput,
  validateContractInput,
  validateDocumentMeta,
  validateReason,
  validateScopeNote,
  validateTicketInput,
} from "../src/lib/client-space-core.mjs";

test("account validation trims, bounds and cleans the central registry entry", () => {
  assert.equal(validateAccountInput({ displayName: "" }).error, "account_name_required");
  assert.equal(validateAccountInput({ displayName: "  " }).error, "account_name_required");
  assert.equal(validateAccountInput({ displayName: "x".repeat(161) }).error, "account_name_too_long");
  assert.equal(validateAccountInput({ displayName: "Condominio <script>" }).error, "account_name_invalid");
  assert.equal(validateAccountInput({ displayName: "Condominio Jardim", documentRef: "12.345.678/0001-90" }).value.documentRef, "12.345.678/0001-90");
  assert.equal(validateAccountInput({ displayName: "Ok", documentRef: "x".repeat(33) }).error, "document_ref_too_long");
  assert.equal(validateAccountInput({ displayName: "Ok", notes: "x".repeat(501) }).error, "notes_too_long");
  const ok = validateAccountInput({ displayName: "  Condominio Jardim  " });
  assert.equal(ok.value.displayName, "Condominio Jardim");
  assert.equal(ok.value.documentRef, null);
  assert.equal(ok.value.notes, null);
});

test("reason is mandatory and bounded for grants and revocations", () => {
  assert.equal(validateReason(undefined).error, "reason_required");
  assert.equal(validateReason("   ").error, "reason_required");
  assert.equal(validateReason("x".repeat(501)).error, "reason_too_long");
  assert.equal(validateReason("  Vínculo confirmado no contrato 114/2026  ").value, "Vínculo confirmado no contrato 114/2026");
  assert.equal(validateScopeNote("x".repeat(501)).error, "scope_note_too_long");
  assert.equal(validateScopeNote(" ").value, null);
  assert.equal(validateScopeNote("Somente sede").value, "Somente sede");
});

test("contract validation enforces titles, statuses and coherent periods", () => {
  assert.equal(validateContractInput({ title: "", service: "Monitoramento 24 Horas" }).error, "contract_title_required");
  assert.equal(validateContractInput({ title: "Ok", service: "" }).error, "contract_service_required");
  assert.equal(validateContractInput({ title: "Ok", service: "Ronda", status: "inventado" }).error, "contract_status_invalid");
  assert.equal(validateContractInput({ title: "Ok", service: "Ronda", startsOn: "27/09/2026" }).error, "contract_starts_on_invalid");
  assert.equal(validateContractInput({ title: "Ok", service: "Ronda", startsOn: "x" }).error, "contract_starts_on_invalid");
  assert.equal(
    validateContractInput({ title: "Ok", service: "Ronda", startsOn: "2026-10-01", endsOn: "2026-09-01" }).error,
    "contract_period_inverted",
  );
  assert.equal(validateContractInput({ title: "Ok", service: "Ronda", summary: "x".repeat(501) }).error, "contract_summary_too_long");
  const full = validateContractInput({ title: "Vigilância Sede", service: "Ronda", startsOn: "2026-01-15", endsOn: "2027-01-14" });
  assert.equal(full.value.status, "active");
  assert.equal(full.value.startsOn, "2026-01-15");
});

test("document metadata allows only known types and cleans filenames", () => {
  assert.equal(sanitizeFilename("..\\..\\etc\\passwd").value, "passwd");
  assert.equal(sanitizeFilename("").error, "filename_required");
  assert.equal(sanitizeFilename("..").error, "filename_invalid");
  assert.equal(sanitizeFilename("relatorio mensal.pdf").value, "relatorio mensal.pdf");
  assert.equal(validateDocumentMeta({ title: "", category: "Relatório", filename: "a.pdf" }).error, "document_title_required");
  assert.equal(validateDocumentMeta({ title: "Ok", category: "", filename: "a.pdf" }).error, "document_category_required");
  assert.equal(validateDocumentMeta({ title: "Ok", category: "x".repeat(61), filename: "a.pdf" }).error, "document_category_too_long");
  assert.equal(validateDocumentMeta({ title: "Ok", category: "Geral", filename: "a.exe" }).error, "document_type_not_allowed");
  assert.equal(validateDocumentMeta({ title: "Ok", category: "Geral", filename: "semponto" }).error, "document_type_not_allowed");
  const ok = validateDocumentMeta({ title: "Relatório setembro", category: "Relatórios", filename: "relatorio-setembro.PDF" });
  assert.equal(ok.value.contentType, "application/pdf");
  assert.ok(Object.keys(DOCUMENT_CONTENT_TYPES).length >= 6);
  assert.ok(MAX_DOCUMENT_BYTES >= 10 * 1024 * 1024);
});

test("ticket validation matches the approved prototype categories and limits", () => {
  assert.equal(TICKET_CATEGORIES.length, 4);
  assert.equal(validateTicketInput({ category: "Categoria inventada", title: "a", details: "b" }).error, "ticket_category_invalid");
  assert.equal(validateTicketInput({ category: "Acesso ao portal", title: "", details: "b" }).error, "ticket_title_required");
  assert.equal(validateTicketInput({ category: "Acesso ao portal", title: "a".repeat(121), details: "b" }).error, "ticket_title_too_long");
  assert.equal(validateTicketInput({ category: "Acesso ao portal", title: "a", details: "" }).error, "ticket_details_required");
  assert.equal(
    validateTicketInput({ category: "Acesso ao portal", title: "a", details: "b".repeat(TEXT_LIMITS.ticketDetails + 1) }).error,
    "ticket_details_too_long",
  );
  const ok = validateTicketInput({ category: "Contratos ou documentos", title: "  Dúvida  ", details: "  Detalhe aqui  " });
  assert.deepEqual(ok.value, { category: "Contratos ou documentos", title: "Dúvida", details: "Detalhe aqui" });
});

test("status guards accept only the closed lists", () => {
  assert.equal(isAccountStatus("active"), true);
  assert.equal(isAccountStatus("archived"), false);
  assert.equal(isContractStatus("planned"), true);
  assert.equal(isContractStatus("cancelled"), false);
  assert.equal(isTicketStatus("open"), true);
  assert.equal(isTicketStatus("in analysis"), false);
  assert.deepEqual([...TICKET_STATUSES], ["open", "in_progress", "resolved", "closed"]);
  assert.equal(TEXT_LIMITS.reasonMax, 500);
});
