"use client";
// UX-PRO-03 — 7ª promoção "com prova": CLI-05, CLI-06, CLI-07 e CLI-08 — lado administrativo
// (staff) dos recursos v2 do portal do cliente — chamados com protocolo, SLA e
// histórico, agenda de visitas com confirmação/reagendamento e relatórios de
// execução/medição/aceite com revisão obrigatória.
//
// Antes: protótipo órfão com hex inline, `any`, fetch sem verificação de status,
// campos sem rótulo, um único <p> para qualquer falha e ids digitados à mão.
// Agora: aba real do TiConsole, contratos preservados, papel decidido no
// servidor (`ensureAuth` exige admin/ti), fonte/data-base, drill-down ao
// registro canônico, quatro estados de leitura com retry e descarte de
// resposta fora de ordem.
//
// HONESTIDADE (limites desta superfície, todos declarados na própria tela):
//  - não existe upload real de arquivos nesta instalação; o registro de anexo
//    grava apenas metadados declarados e NÃO envia bytes;
//  - até a matriz de autorização por conta/unidade/contrato (A3) existir, os
//    handlers v2 aceitam apenas admin/ti e não provam vínculo com a conta do
//    cliente — RH/comercial são negados de propósito pelo servidor;
//  - nada é enviado ao cliente por e-mail (sem SMTP real);
//  - aceite humano 0/222 e produção NO-GO: esta tela não muda isso.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import UiState from "@/components/ui/UiState";
import styles from "./CliAdvancedClient.module.css";

type Row = Record<string, unknown>;
type ReadState = { kind: "loading" } | { kind: "ready" } | { kind: "denied" } | { kind: "error"; detail: string };

const ENDPOINTS = {
  tickets: "/api/cli/tickets-v2",
  ticketMessages: "/api/cli/ticket-messages",
  ticketAttachments: "/api/cli/ticket-attachments",
  ticketHistory: "/api/cli/ticket-history",
  slaPauses: "/api/cli/ticket-sla-pauses",
  visits: "/api/cli/visits",
  visitHistory: "/api/cli/visit-history",
  reports: "/api/cli/reports-v2",
  reportHistory: "/api/cli/report-history-v2",
} as const;

const TICKET_CATEGORIES = ["atendimento_servico", "acesso_portal", "contratos_documentos", "financeiro", "reclamacao", "sugestao", "outro"] as const;
const TICKET_PRIORITIES = ["baixa", "media", "alta", "critica"] as const;
const TICKET_STATUSES = ["aberto", "em_atendimento", "aguardando_cliente", "resolvido", "encerrado"] as const;
const SLA_REASONS = ["aguardando_cliente", "aguardando_terceiro", "feriado", "manutencao", "outro"] as const;
const VISIT_TYPES = ["visita_tecnica", "manutencao_preventiva", "manutencao_corretiva", "vistoria", "reuniao", "outro"] as const;
const VISIT_STATUSES = ["agendada", "confirmada", "reagendada", "realizada", "cancelada", "nao_compareceu"] as const;
const REPORT_TYPES = ["execucao", "medicao", "aceite", "outro"] as const;
const REPORT_STATUSES = ["rascunho", "em_revisao", "aprovado", "rejeitado", "enviado"] as const;

// Motivos devolvidos por `cli-advanced-api.mjs`, traduzidos para o operador.
// A mensagem nunca inventa sucesso: o estado só muda quando o servidor grava.
const ERROR_LABELS: Record<string, string> = {
  unauthorized: "Sua sessão expirou. Entre novamente.",
  forbidden: "Esta superfície administrativa é restrita a contas admin/ti. Nenhum dado foi exposto.",
  origin_forbidden: "A requisição veio de outra origem. Recarregue a página e tente novamente.",
  missing_fields: "Preencha os campos obrigatórios antes de registrar.",
  title_3_200: "O título do chamado precisa ter entre 3 e 200 caracteres.",
  title_5_200: "O título precisa ter entre 5 e 200 caracteres.",
  description_10_5000: "A descrição do chamado precisa ter entre 10 e 5000 caracteres.",
  content_1_5000: "A mensagem precisa ter entre 1 e 5000 caracteres.",
  content_20_10000: "O conteúdo do relatório precisa ter entre 20 e 10000 caracteres.",
  duplicate_protocol: "O protocolo gerado colidiu com um já existente. Tente novamente.",
  duplicate_storage_key: "Já existe um anexo com esta referência de armazenamento.",
  internal: "O servidor não conseguiu concluir a operação. Confira os dados e tente novamente.",
  missing_id: "Nenhum registro selecionado. Escolha um item da lista.",
  missing_status: "Selecione o novo estado antes de confirmar.",
  missing_ticket_id: "Selecione um chamado para consultar o detalhe.",
  missing_visit_id: "Selecione uma visita para consultar o histórico.",
  missing_report_id: "Selecione um relatório para consultar o histórico.",
  not_found: "O registro não foi localizado. Recarregue a leitura.",
  invalid_status: "O estado informado não é aceito pelo servidor para este recurso.",
  invalid_action: "Escolha pausar ou retomar para alterar o SLA.",
  already_paused: "O SLA deste chamado já está pausado. Retome antes de pausar de novo.",
  not_paused: "O SLA deste chamado não está pausado; não há pausa a retomar.",
  reopen_reason_10_1000_required: "Reabrir exige motivo entre 10 e 1000 caracteres.",
  reschedule_to_and_reason_required: "Reagendar exige a nova data e o motivo.",
  reschedule_reason_10_1000: "O motivo do reagendamento precisa ter entre 10 e 1000 caracteres.",
  period_end_before_start: "O fim do período não pode ser anterior ao início.",
  review_required_before_approve: "O relatório precisa passar por revisão antes da aprovação.",
  must_be_approved_before_send: "O relatório precisa estar aprovado antes de ser marcado como enviado.",
  method_not_allowed: "Esta operação não é permitida pelo servidor para este recurso.",
  operation_unavailable: "O serviço está indisponível agora. Tente novamente em instantes.",
};

function translate(code: unknown, status?: number) {
  const key = typeof code === "string" ? code : "";
  if (ERROR_LABELS[key]) return ERROR_LABELS[key];
  if (status === 401) return ERROR_LABELS.unauthorized;
  if (status === 403) return ERROR_LABELS.forbidden;
  return "Não foi possível concluir a operação. Confira os dados e tente novamente.";
}

/** Payload só é aceito quando é, de fato, uma lista de objetos. */
function records(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Row => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}
const s = (value: unknown) => (typeof value === "string" ? value : "");
const n = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const b = (value: unknown) => value === true;

function dateTime(value: unknown) {
  const raw = s(value);
  if (!raw) return "não informada";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? "data indisponível" : parsed.toLocaleString("pt-BR");
}
function day(value: unknown) {
  const raw = s(value);
  if (!raw) return "não informado";
  const parsed = new Date(`${raw}T00:00:00`);
  return Number.isNaN(parsed.valueOf()) ? "data indisponível" : parsed.toLocaleDateString("pt-BR");
}
function latest(values: unknown[]) {
  const stamps = values.map(value => new Date(s(value)).valueOf()).filter(Number.isFinite);
  if (!stamps.length) return "sem registro";
  return new Date(Math.max(...stamps)).toLocaleString("pt-BR");
}
function shortId(value: unknown) {
  const raw = s(value);
  return raw ? raw.slice(0, 8) : "—";
}

/** `datetime-local` devolve hora local sem fuso; o servidor grava timestamptz. */
function toIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.valueOf()) ? "" : parsed.toISOString();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return <label className={styles.field}><span>{label}</span>{children}{help && <small>{help}</small>}</label>;
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: "include", cache: "no-store", ...init });
  const data = await response.json().catch(() => ({})) as Row;
  return { response, data };
}

export default function CliAdvancedClient() {
  const [readState, setReadState] = useState<ReadState>({ kind: "loading" });
  const [tickets, setTickets] = useState<Row[]>([]);
  const [visits, setVisits] = useState<Row[]>([]);
  const [reports, setReports] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [operationError, setOperationError] = useState("");

  const [openTicketId, setOpenTicketId] = useState("");
  const [detailState, setDetailState] = useState<ReadState>({ kind: "ready" });
  const [messages, setMessages] = useState<Row[]>([]);
  const [attachments, setAttachments] = useState<Row[]>([]);
  const [ticketHistory, setTicketHistory] = useState<Row[]>([]);
  const [slaPauses, setSlaPauses] = useState<Row[]>([]);
  const [visitHistory, setVisitHistory] = useState<Row[]>([]);
  const [visitHistoryFor, setVisitHistoryFor] = useState("");
  const [reportHistory, setReportHistory] = useState<Row[]>([]);
  const [reportHistoryFor, setReportHistoryFor] = useState("");

  const [ticketForm, setTicketForm] = useState({ client_account_id: "", contact_id: "", contract_id: "", category: "atendimento_servico", priority: "media", title: "", description: "", sla_due_at: "" });
  const [statusForm, setStatusForm] = useState({ id: "", status: "em_atendimento", reason: "", reopen_reason: "", responsible_name: "" });
  const [messageForm, setMessageForm] = useState({ ticket_id: "", content: "", is_internal: "false" });
  const [attachmentForm, setAttachmentForm] = useState({ ticket_id: "", file_name: "", file_url: "", storage_key: "" });
  const [slaForm, setSlaForm] = useState({ ticket_id: "", reason: "aguardando_cliente", notes: "", action: "pause" });
  const [visitForm, setVisitForm] = useState({ client_account_id: "", contract_id: "", ticket_id: "", visit_type: "visita_tecnica", title: "", description: "", scheduled_at: "", responsible_name: "", location: "" });
  const [visitStatusForm, setVisitStatusForm] = useState({ id: "", status: "confirmada", rescheduled_to: "", reschedule_reason: "", responsible_name: "" });
  const [reportForm, setReportForm] = useState({ client_account_id: "", contract_id: "", visit_id: "", report_type: "execucao", title: "", content: "", period_start: "", period_end: "" });
  const [reportStatusForm, setReportStatusForm] = useState({ id: "", status: "em_revisao", review_notes: "", reason: "" });

  const sequence = useRef(0);
  const detailSequence = useRef(0);
  const operation = useRef(false);

  const clear = useCallback(() => {
    setTickets([]); setVisits([]); setReports([]);
    setOpenTicketId(""); setMessages([]); setAttachments([]);
    setTicketHistory([]); setSlaPauses([]); setVisitHistory([]); setReportHistory([]);
    setVisitHistoryFor(""); setReportHistoryFor("");
  }, []);

  // `clearFeedback=false` sobrevive ao reload interno pós-mutação, para a
  // mensagem de sucesso não desaparecer antes de o operador lê-la.
  const load = useCallback(async (clearFeedback = true) => {
    const current = ++sequence.current;
    if (clearFeedback) { setMessage(""); setOperationError(""); }
    setReadState({ kind: "loading" });
    try {
      const [t, v, r] = await Promise.all([
        requestJson(ENDPOINTS.tickets),
        requestJson(ENDPOINTS.visits),
        requestJson(ENDPOINTS.reports),
      ]);
      if (current !== sequence.current) return;
      const all = [t, v, r];
      if (all.some(item => item.response.status === 401 || item.response.status === 403)) {
        clear(); setReadState({ kind: "denied" }); return;
      }
      const failed = all.find(item => !item.response.ok);
      if (failed) {
        clear();
        setReadState({ kind: "error", detail: translate(failed.data.error, failed.response.status) });
        return;
      }
      setTickets(records(t.data.tickets));
      setVisits(records(v.data.visits));
      setReports(records(r.data.reports));
      setReadState({ kind: "ready" });
    } catch {
      if (current !== sequence.current) return;
      clear();
      setReadState({ kind: "error", detail: "Falha de rede ao consultar o portal do cliente. Verifique a conexão e tente novamente." });
    }
  }, [clear]);

  useEffect(() => { void load(); }, [load]);

  const openTicket = useCallback(async (ticketId: string) => {
    const current = ++detailSequence.current;
    setOpenTicketId(ticketId);
    setDetailState({ kind: "loading" });
    setMessage(""); setOperationError("");
    try {
      const [m, a, h, p] = await Promise.all([
        requestJson(`${ENDPOINTS.ticketMessages}?ticket_id=${encodeURIComponent(ticketId)}`),
        requestJson(`${ENDPOINTS.ticketAttachments}?ticket_id=${encodeURIComponent(ticketId)}`),
        requestJson(`${ENDPOINTS.ticketHistory}?ticket_id=${encodeURIComponent(ticketId)}`),
        requestJson(`${ENDPOINTS.slaPauses}?ticket_id=${encodeURIComponent(ticketId)}`),
      ]);
      if (current !== detailSequence.current) return;
      const all = [m, a, h, p];
      if (all.some(item => item.response.status === 401 || item.response.status === 403)) {
        setMessages([]); setAttachments([]); setTicketHistory([]); setSlaPauses([]);
        setDetailState({ kind: "denied" }); return;
      }
      const failed = all.find(item => !item.response.ok);
      if (failed) {
        setMessages([]); setAttachments([]); setTicketHistory([]); setSlaPauses([]);
        setDetailState({ kind: "error", detail: translate(failed.data.error, failed.response.status) }); return;
      }
      setMessages(records(m.data.messages));
      setAttachments(records(a.data.attachments));
      setTicketHistory(records(h.data.history));
      setSlaPauses(records(p.data.pauses));
      setDetailState({ kind: "ready" });
    } catch {
      if (current !== detailSequence.current) return;
      setMessages([]); setAttachments([]); setTicketHistory([]); setSlaPauses([]);
      setDetailState({ kind: "error", detail: "Falha de rede ao consultar o detalhe do chamado." });
    }
  }, []);

  async function loadVisitHistory(visitId: string) {
    setMessage(""); setOperationError("");
    try {
      const { response, data } = await requestJson(`${ENDPOINTS.visitHistory}?visit_id=${encodeURIComponent(visitId)}`);
      if (!response.ok) { setOperationError(translate(data.error, response.status)); return; }
      setVisitHistory(records(data.history));
      setVisitHistoryFor(visitId);
    } catch {
      setOperationError("Falha de rede ao consultar o histórico da visita.");
    }
  }

  async function loadReportHistory(reportId: string) {
    setMessage(""); setOperationError("");
    try {
      const { response, data } = await requestJson(`${ENDPOINTS.reportHistory}?report_id=${encodeURIComponent(reportId)}`);
      if (!response.ok) { setOperationError(translate(data.error, response.status)); return; }
      setReportHistory(records(data.history));
      setReportHistoryFor(reportId);
    } catch {
      setOperationError("Falha de rede ao consultar o histórico do relatório.");
    }
  }

  async function mutate(path: string, method: "POST" | "PATCH", body: unknown, success: string, after?: () => void) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true); setOperationError(""); setMessage("");
    try {
      const { response, data } = await requestJson(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) { setOperationError(translate(data.error, response.status)); return; }
      setMessage(success);
      after?.();
      await load(false);
    } catch {
      setOperationError("Não foi possível concluir a operação. Confira a conexão e tente novamente.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  function requireAccount(value: string) {
    if (!UUID_RE.test(value.trim())) {
      setOperationError("Informe o identificador (UUID) da conta do cliente.");
      return false;
    }
    return true;
  }

  function createTicket() {
    if (!requireAccount(ticketForm.client_account_id)) return;
    if (ticketForm.title.trim().length < 3 || ticketForm.title.trim().length > 200) { setOperationError(ERROR_LABELS.title_3_200); return; }
    if (ticketForm.description.trim().length < 10) { setOperationError(ERROR_LABELS.description_10_5000); return; }
    void mutate(ENDPOINTS.tickets, "POST", {
      client_account_id: ticketForm.client_account_id.trim(),
      contact_id: ticketForm.contact_id.trim() || null,
      contract_id: ticketForm.contract_id.trim() || null,
      category: ticketForm.category,
      priority: ticketForm.priority,
      title: ticketForm.title.trim(),
      description: ticketForm.description.trim(),
      sla_due_at: toIso(ticketForm.sla_due_at) || null,
    }, "Chamado registrado com protocolo, categoria, prioridade e SLA.", () => {
      setTicketForm({ client_account_id: "", contact_id: "", contract_id: "", category: "atendimento_servico", priority: "media", title: "", description: "", sla_due_at: "" });
    });
  }

  function updateTicketStatus() {
    if (!statusForm.id) { setOperationError(ERROR_LABELS.missing_id); return; }
    if (statusForm.reason.trim() && statusForm.reason.trim().length < 10) { setOperationError("O motivo precisa ter pelo menos 10 caracteres."); return; }
    if (!statusForm.reason.trim() && !statusForm.reopen_reason.trim()) { setOperationError("Informe o motivo da transição (10 a 1000 caracteres)."); return; }
    void mutate(ENDPOINTS.tickets, "PATCH", {
      id: statusForm.id,
      status: statusForm.status,
      reason: statusForm.reason.trim() || null,
      reopen_reason: statusForm.reopen_reason.trim() || null,
      responsible_name: statusForm.responsible_name.trim() || null,
    }, "Estado do chamado atualizado; o histórico e as pausas de SLA seguem o que o servidor gravou.");
  }

  function createMessage() {
    if (!messageForm.ticket_id) { setOperationError(ERROR_LABELS.missing_ticket_id); return; }
    if (!messageForm.content.trim()) { setOperationError(ERROR_LABELS.content_1_5000); return; }
    void mutate(ENDPOINTS.ticketMessages, "POST", {
      ticket_id: messageForm.ticket_id,
      content: messageForm.content.trim(),
      is_internal: messageForm.is_internal === "true",
    }, "Mensagem registrada no chamado.", () => {
      setMessageForm({ ticket_id: messageForm.ticket_id, content: "", is_internal: messageForm.is_internal });
      if (openTicketId) void openTicket(openTicketId);
    });
  }

  function createAttachment() {
    if (!attachmentForm.ticket_id) { setOperationError(ERROR_LABELS.missing_ticket_id); return; }
    if (!attachmentForm.file_name.trim()) { setOperationError("Informe o nome do arquivo."); return; }
    if (attachmentForm.file_url.trim().length < 5) { setOperationError("A referência do arquivo precisa ter pelo menos 5 caracteres."); return; }
    if (attachmentForm.storage_key.trim().length < 5) { setOperationError("A chave de armazenamento precisa ter pelo menos 5 caracteres."); return; }
    void mutate(ENDPOINTS.ticketAttachments, "POST", {
      ticket_id: attachmentForm.ticket_id,
      file_name: attachmentForm.file_name.trim(),
      file_url: attachmentForm.file_url.trim(),
      storage_key: attachmentForm.storage_key.trim(),
    }, "Metadado de anexo registrado. Nenhum byte foi enviado: não há armazenamento de arquivos nesta instalação.", () => {
      setAttachmentForm({ ticket_id: attachmentForm.ticket_id, file_name: "", file_url: "", storage_key: "" });
      if (openTicketId) void openTicket(openTicketId);
    });
  }

  function slaAction() {
    if (!slaForm.ticket_id) { setOperationError(ERROR_LABELS.missing_ticket_id); return; }
    if (slaForm.notes.trim() && slaForm.notes.trim().length < 10) { setOperationError("As observações precisam ter pelo menos 10 caracteres."); return; }
    void mutate(ENDPOINTS.slaPauses, "POST", {
      ticket_id: slaForm.ticket_id,
      reason: slaForm.reason,
      notes: slaForm.notes.trim() || null,
      action: slaForm.action,
    }, slaForm.action === "pause" ? "Pausa de SLA registrada explicitamente." : "SLA retomado; o tempo pausado foi somado pelo servidor.",
    () => { if (openTicketId) void openTicket(openTicketId); });
  }

  function createVisit() {
    if (!requireAccount(visitForm.client_account_id)) return;
    if (visitForm.title.trim().length < 5 || visitForm.title.trim().length > 200) { setOperationError(ERROR_LABELS.title_5_200); return; }
    const scheduled = toIso(visitForm.scheduled_at);
    if (!scheduled) { setOperationError("Informe a data e a hora do agendamento."); return; }
    if (visitForm.location.trim() && visitForm.location.trim().length < 3) { setOperationError("O local precisa ter pelo menos 3 caracteres."); return; }
    void mutate(ENDPOINTS.visits, "POST", {
      client_account_id: visitForm.client_account_id.trim(),
      contract_id: visitForm.contract_id.trim() || null,
      ticket_id: visitForm.ticket_id.trim() || null,
      visit_type: visitForm.visit_type,
      title: visitForm.title.trim(),
      description: visitForm.description.trim() || null,
      scheduled_at: scheduled,
      responsible_name: visitForm.responsible_name.trim() || null,
      location: visitForm.location.trim() || null,
    }, "Visita agendada com protocolo VIS-CLI.", () => {
      setVisitForm({ client_account_id: "", contract_id: "", ticket_id: "", visit_type: "visita_tecnica", title: "", description: "", scheduled_at: "", responsible_name: "", location: "" });
    });
  }

  function updateVisitStatus() {
    if (!visitStatusForm.id) { setOperationError(ERROR_LABELS.missing_id); return; }
    if (visitStatusForm.status === "reagendada") {
      if (!visitStatusForm.rescheduled_to.trim()) { setOperationError(ERROR_LABELS.reschedule_to_and_reason_required); return; }
      if (visitStatusForm.reschedule_reason.trim().length < 10) { setOperationError(ERROR_LABELS.reschedule_reason_10_1000); return; }
    }
    void mutate(ENDPOINTS.visits, "PATCH", {
      id: visitStatusForm.id,
      status: visitStatusForm.status,
      rescheduled_to: visitStatusForm.status === "reagendada" ? toIso(visitStatusForm.rescheduled_to) : null,
      reschedule_reason: visitStatusForm.status === "reagendada" ? visitStatusForm.reschedule_reason.trim() : null,
      responsible_name: visitStatusForm.responsible_name.trim() || null,
    }, `Visita atualizada para ${visitStatusForm.status}.`);
  }

  function createReport() {
    if (!requireAccount(reportForm.client_account_id)) return;
    if (reportForm.title.trim().length < 5 || reportForm.title.trim().length > 200) { setOperationError(ERROR_LABELS.title_5_200); return; }
    if (reportForm.content.trim().length < 20) { setOperationError(ERROR_LABELS.content_20_10000); return; }
    if (reportForm.period_start && reportForm.period_end && reportForm.period_end < reportForm.period_start) {
      setOperationError(ERROR_LABELS.period_end_before_start); return;
    }
    void mutate(ENDPOINTS.reports, "POST", {
      client_account_id: reportForm.client_account_id.trim(),
      contract_id: reportForm.contract_id.trim() || null,
      visit_id: reportForm.visit_id.trim() || null,
      report_type: reportForm.report_type,
      title: reportForm.title.trim(),
      content: reportForm.content.trim(),
      period_start: reportForm.period_start || null,
      period_end: reportForm.period_end || null,
    }, "Relatório criado como rascunho com protocolo REP-CLI.", () => {
      setReportForm({ client_account_id: "", contract_id: "", visit_id: "", report_type: "execucao", title: "", content: "", period_start: "", period_end: "" });
    });
  }

  function updateReportStatus() {
    if (!reportStatusForm.id) { setOperationError(ERROR_LABELS.missing_id); return; }
    if (reportStatusForm.review_notes.trim() && reportStatusForm.review_notes.trim().length < 10) {
      setOperationError("As notas de revisão precisam ter pelo menos 10 caracteres."); return;
    }
    if (reportStatusForm.status === "em_revisao" && reportStatusForm.review_notes.trim().length < 10) {
      setOperationError("Enviar para revisão exige notas entre 10 e 2000 caracteres."); return;
    }
    void mutate(ENDPOINTS.reports, "PATCH", {
      id: reportStatusForm.id,
      status: reportStatusForm.status,
      review_notes: reportStatusForm.review_notes.trim() || null,
      reason: reportStatusForm.reason.trim() || null,
    }, `Relatório atualizado para ${reportStatusForm.status}.`);
  }

  const empty = tickets.length === 0 && visits.length === 0 && reports.length === 0;
  const feedback = readState.kind === "loading"
    ? <UiState variant="loading" title="Carregando o console do cliente" detail="Consultando chamados, agenda de visitas e relatórios v2." />
    : readState.kind === "denied"
      ? <UiState variant="denied" title="Acesso não autorizado" detail="Estes recursos v2 são restritos a admin/ti até existir autorização por conta, unidade e contrato. Nenhum dado foi exposto." onRetry={() => load()} retryLabel="Tentar novamente" />
      : readState.kind === "error"
        ? <UiState variant="error" title="Falha na consulta" detail={readState.detail} onRetry={() => load()} retryLabel="Tentar novamente" />
        : empty
          ? <UiState variant="empty" title="Nenhum registro v2" detail="Não há chamados, visitas ou relatórios v2 nesta instalação. Os formulários abaixo criam o primeiro registro." onRetry={() => load()} retryLabel="Atualizar" />
          : null;

  const selectedTicket = tickets.find(ticket => s(ticket.id) === openTicketId) ?? null;

  return (
    <section className={styles.workspace} aria-busy={busy || readState.kind === "loading"}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>CLI-05 · 06 · 07 · 08 · Portal do cliente (v2)</p>
          <h2>Chamados, visitas e relatórios do cliente</h2>
          <p>Lado administrativo dos recursos v2: protocolo, categoria, prioridade, responsável, mensagens, anexos, SLA e histórico; agenda de visitas com confirmação e reagendamento; relatórios de execução, medição e aceite com revisão obrigatória.</p>
          <p className={styles.source}>
            Fonte: tabelas <code>cli_tickets_v2</code>, <code>cli_ticket_messages</code>, <code>cli_ticket_attachments</code>,
            {" "}<code>cli_ticket_history</code>, <code>cli_ticket_sla_pauses</code>, <code>cli_visits</code>,
            {" "}<code>cli_visit_history</code>, <code>cli_client_reports_v2</code> e <code>cli_client_report_history_v2</code> (migração 075).
            {" "}Data-base: chamado mais recente em <strong>{latest(tickets.map(ticket => ticket.created_at))}</strong>;
            {" "}visita mais recente em <strong>{latest(visits.map(visit => visit.scheduled_at))}</strong>;
            {" "}relatório mais recente em <strong>{latest(reports.map(report => report.created_at))}</strong>.
          </p>
        </div>
        <button type="button" onClick={() => load()} disabled={busy || readState.kind === "loading"}>Atualizar leitura</button>
      </header>

      <aside className={styles.notice} aria-label="Limites desta superfície">
        <strong>O que esta tela faz — e o que ela não faz.</strong>
        <p>Ela registra e acompanha os recursos v2 <em>no banco desta instalação</em>. Ela <strong>não abre sessão de cliente</strong> e não substitui o portal do cliente.</p>
        <p><strong>Sem upload real:</strong> não há armazenamento de arquivos nesta instalação. Registrar um anexo grava apenas metadados declarados (<code>file_name</code>, <code>file_url</code>, <code>storage_key</code>) e <strong>nenhum byte é enviado</strong> — a decisão de armazenamento segue pendente com o proprietário.</p>
        <p><strong>Sem escopo por conta (A3):</strong> enquanto a matriz de autorização por conta, unidade e contrato não existir, os handlers v2 aceitam apenas <code>admin</code>/<code>ti</code> e <strong>não comprovam vínculo</strong> com a conta do cliente. RH e comercial são negados de propósito; a leitura lista registros de todas as contas.</p>
        <p><strong>Sem envio ao cliente:</strong> não há SMTP real. Marcar um relatório como <em>enviado</em> registra o estado no banco, não entrega e-mail.</p>
        <p><strong>Produção: NO-GO</strong> — <code>docs/PRODUCAO-GATE.md</code> mantém 10 itens em aberto e o aceite humano segue <strong>0/222</strong>. Nada aqui autoriza publicação ou virada de ambiente.</p>
      </aside>

      {feedback}
      {message && <p role="status" className={styles.success}>{message}</p>}
      {operationError && <p role="alert" className={styles.error}>{operationError}</p>}

      {readState.kind === "ready" && <>
        <section className={styles.panel} aria-labelledby="cli-tickets-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="cli-tickets-title">Chamados v2 ({tickets.length})</h3><p>Protocolo, categoria, prioridade, responsável, SLA, pausas explícitas, reabertura com motivo e histórico.</p></div>
            <span className={styles.count}>{tickets.length} registro(s)</span>
          </div>
          <ul className={styles.recordList}>
            {tickets.map(ticket => <li key={s(ticket.id)}>
              <strong>{s(ticket.protocol)} · {s(ticket.title)}</strong>
              <span>estado {s(ticket.status)} · categoria {s(ticket.category)} · prioridade {s(ticket.priority)} · responsável {s(ticket.responsible_name) || "não atribuído"}</span>
              <span>SLA até {dateTime(ticket.sla_due_at)} · pausado {b(ticket.sla_paused_at) || s(ticket.sla_paused_at) ? "sim" : "não"} ({s(ticket.sla_pause_reason) || "sem motivo"}) · total pausado {n(ticket.sla_total_paused_seconds)}s · reaberturas {n(ticket.reopen_count)}</span>
              <span>conta {s(ticket.client_account_id)} · contato {s(ticket.contact_id) || "não informado"} · contrato {s(ticket.contract_id) || "não informado"}</span>
              <details className={styles.subsection}><summary>Registro canônico do chamado (JSON)</summary><pre className={styles.pre}>{JSON.stringify(ticket, null, 2)}</pre></details>
              <div className={styles.actions}>
                <button type="button" disabled={busy} onClick={() => openTicket(s(ticket.id))}>Abrir mensagens, anexos, SLA e histórico</button>
                <button type="button" disabled={busy} onClick={() => {
                  setStatusForm({ id: s(ticket.id), status: s(ticket.status), reason: "", reopen_reason: "", responsible_name: s(ticket.responsible_name) });
                  setMessageForm({ ticket_id: s(ticket.id), content: "", is_internal: "false" });
                  setAttachmentForm({ ticket_id: s(ticket.id), file_name: "", file_url: "", storage_key: "" });
                  setSlaForm({ ticket_id: s(ticket.id), reason: "aguardando_cliente", notes: "", action: "pause" });
                }}>Usar este chamado nos formulários</button>
              </div>
            </li>)}
          </ul>

          {openTicketId && <section className={styles.subsection} aria-labelledby="cli-ticket-detail-title">
            <h4 id="cli-ticket-detail-title">Detalhe do chamado {s(selectedTicket?.protocol) || shortId(openTicketId)}</h4>
            {detailState.kind === "loading" && <UiState variant="loading" title="Carregando detalhe" detail="Consultando mensagens, anexos, histórico e pausas de SLA do chamado." />}
            {detailState.kind === "denied" && <UiState variant="denied" title="Acesso não autorizado" detail="A leitura do detalhe foi negada pelo servidor." onRetry={() => openTicket(openTicketId)} retryLabel="Tentar novamente" />}
            {detailState.kind === "error" && <UiState variant="error" title="Falha no detalhe" detail={detailState.detail} onRetry={() => openTicket(openTicketId)} retryLabel="Tentar novamente" />}
            {detailState.kind === "ready" && <>
              <p className={styles.note}>Mensagens ({messages.length}) · anexos ({attachments.length}) · histórico ({ticketHistory.length}) · pausas de SLA ({slaPauses.length}).</p>
              <ul className={styles.recordList}>
                {messages.map(item => <li key={s(item.id)}>
                  <strong>{b(item.is_internal) ? "nota interna" : "mensagem ao cliente"} · {s(item.message_type) || "mensagem"}</strong>
                  <span>{s(item.content)}</span>
                  <span>por {s(item.identity_id) ? shortId(item.identity_id) : "sistema"} · em {dateTime(item.created_at)}</span>
                </li>)}
              </ul>
              <ul className={styles.recordList}>
                {attachments.map(item => <li key={s(item.id)}>
                  <strong>{s(item.file_name)}</strong>
                  <span>metadado declarado · chave {s(item.storage_key)} · enviado por {shortId(item.uploaded_by_identity)} · nenhum byte armazenado</span>
                  <details className={styles.subsection}><summary>Registro canônico do anexo (JSON)</summary><pre className={styles.pre}>{JSON.stringify(item, null, 2)}</pre></details>
                </li>)}
              </ul>
              <details className={styles.subsection}>
                <summary>Histórico de estados ({ticketHistory.length})</summary>
                <ul className={styles.recordList}>
                  {ticketHistory.map(item => <li key={s(item.id)}>
                    <strong>{s(item.previous_status) || "criação"} → {s(item.next_status)}{b(item.is_reopen) ? " · reabertura" : ""}</strong>
                    <span>{s(item.reason) || "sem motivo registrado"} · em {dateTime(item.created_at)}</span>
                  </li>)}
                </ul>
              </details>
              <details className={styles.subsection}>
                <summary>Pausas de SLA ({slaPauses.length})</summary>
                <ul className={styles.recordList}>
                  {slaPauses.map(item => <li key={s(item.id)}>
                    <strong>{s(item.reason)} · {s(item.resumed_at) ? `retomada (${n(item.pause_duration_seconds)}s)` : "em aberto"}</strong>
                    <span>pausada em {dateTime(item.paused_at)} · {s(item.notes) || "sem observação"}</span>
                  </li>)}
                </ul>
              </details>
            </>}
          </section>}

          <details className={styles.subsection}>
            <summary>Registrar chamado</summary>
            <p className={styles.note}>O protocolo (CLI-AAAAMMDD-XXXX) é gerado pelo servidor. Informe o UUID da conta do cliente já existente; nenhuma conta é criada aqui.</p>
            <div className={styles.formGrid}>
              <Field label="Conta do cliente (UUID)" help="Obrigatório. Sem escopo por conta (A3) o servidor não valida vínculo."><input value={ticketForm.client_account_id} onChange={e => setTicketForm({ ...ticketForm, client_account_id: e.target.value })} /></Field>
              <Field label="Contato (UUID)" help="Opcional."><input value={ticketForm.contact_id} onChange={e => setTicketForm({ ...ticketForm, contact_id: e.target.value })} /></Field>
              <Field label="Contrato (UUID)" help="Opcional."><input value={ticketForm.contract_id} onChange={e => setTicketForm({ ...ticketForm, contract_id: e.target.value })} /></Field>
              <Field label="Categoria"><select value={ticketForm.category} onChange={e => setTicketForm({ ...ticketForm, category: e.target.value })}>{TICKET_CATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
              <Field label="Prioridade"><select value={ticketForm.priority} onChange={e => setTicketForm({ ...ticketForm, priority: e.target.value })}>{TICKET_PRIORITIES.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
              <Field label="Prazo de SLA" help="Opcional; data e hora locais."><input type="datetime-local" value={ticketForm.sla_due_at} onChange={e => setTicketForm({ ...ticketForm, sla_due_at: e.target.value })} /></Field>
              <Field label="Título" help="3 a 200 caracteres."><input value={ticketForm.title} onChange={e => setTicketForm({ ...ticketForm, title: e.target.value })} /></Field>
              <div className={styles.full}><Field label="Descrição" help="10 a 5000 caracteres."><textarea rows={3} value={ticketForm.description} onChange={e => setTicketForm({ ...ticketForm, description: e.target.value })} /></Field></div>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={createTicket}>Registrar chamado</button>
          </details>

          <details className={styles.subsection}>
            <summary>Alterar estado, responsável e reabertura</summary>
            <p className={styles.note}>Reabrir (de <code>resolvido</code>/<code>encerrado</code> para <code>aberto</code>/<code>em_atendimento</code>) exige motivo. Ir para <code>aguardando_cliente</code> pausa o SLA explicitamente e retomar soma o tempo pausado.</p>
            <div className={styles.formGrid}>
              <Field label="Chamado"><select value={statusForm.id} onChange={e => setStatusForm({ ...statusForm, id: e.target.value })}><option value="">Selecione um chamado</option>{tickets.map(ticket => <option key={s(ticket.id)} value={s(ticket.id)}>{s(ticket.protocol)} · {s(ticket.status)}</option>)}</select></Field>
              <Field label="Novo estado"><select value={statusForm.status} onChange={e => setStatusForm({ ...statusForm, status: e.target.value })}>{TICKET_STATUSES.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
              <Field label="Responsável" help="Opcional; 2 a 200 caracteres."><input value={statusForm.responsible_name} onChange={e => setStatusForm({ ...statusForm, responsible_name: e.target.value })} /></Field>
              <Field label="Motivo da transição" help="10 a 1000 caracteres."><input value={statusForm.reason} onChange={e => setStatusForm({ ...statusForm, reason: e.target.value })} /></Field>
              <div className={styles.full}><Field label="Motivo da reabertura" help="Obrigatório apenas ao reabrir (10 a 1000 caracteres)."><input value={statusForm.reopen_reason} onChange={e => setStatusForm({ ...statusForm, reopen_reason: e.target.value })} /></Field></div>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={updateTicketStatus}>Atualizar estado do chamado</button>
          </details>

          <details className={styles.subsection}>
            <summary>Mensagem no chamado</summary>
            <div className={styles.formGrid}>
              <Field label="Chamado"><select value={messageForm.ticket_id} onChange={e => setMessageForm({ ...messageForm, ticket_id: e.target.value })}><option value="">Selecione um chamado</option>{tickets.map(ticket => <option key={s(ticket.id)} value={s(ticket.id)}>{s(ticket.protocol)}</option>)}</select></Field>
              <Field label="Visibilidade"><select value={messageForm.is_internal} onChange={e => setMessageForm({ ...messageForm, is_internal: e.target.value })}><option value="false">visível ao cliente</option><option value="true">nota interna</option></select></Field>
              <div className={styles.full}><Field label="Mensagem" help="1 a 5000 caracteres."><textarea rows={2} value={messageForm.content} onChange={e => setMessageForm({ ...messageForm, content: e.target.value })} /></Field></div>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={createMessage}>Registrar mensagem</button>
          </details>

          <details className={styles.subsection}>
            <summary>Metadado de anexo</summary>
            <p className={styles.note}><strong>Não é upload.</strong> Nenhum arquivo é transferido e nenhum byte é armazenado; o registro é declarativo e aponta para uma referência já existente.</p>
            <div className={styles.formGrid}>
              <Field label="Chamado"><select value={attachmentForm.ticket_id} onChange={e => setAttachmentForm({ ...attachmentForm, ticket_id: e.target.value })}><option value="">Selecione um chamado</option>{tickets.map(ticket => <option key={s(ticket.id)} value={s(ticket.id)}>{s(ticket.protocol)}</option>)}</select></Field>
              <Field label="Nome do arquivo" help="1 a 500 caracteres."><input value={attachmentForm.file_name} onChange={e => setAttachmentForm({ ...attachmentForm, file_name: e.target.value })} /></Field>
              <Field label="Referência do arquivo" help="5 a 1000 caracteres; nenhum byte é lido."><input value={attachmentForm.file_url} onChange={e => setAttachmentForm({ ...attachmentForm, file_url: e.target.value })} /></Field>
              <Field label="Chave de armazenamento" help="5 a 500 caracteres; deve ser única."><input value={attachmentForm.storage_key} onChange={e => setAttachmentForm({ ...attachmentForm, storage_key: e.target.value })} /></Field>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={createAttachment}>Registrar metadado de anexo</button>
          </details>

          <details className={styles.subsection}>
            <summary>Pausa e retomada de SLA</summary>
            <div className={styles.formGrid}>
              <Field label="Chamado"><select value={slaForm.ticket_id} onChange={e => setSlaForm({ ...slaForm, ticket_id: e.target.value })}><option value="">Selecione um chamado</option>{tickets.map(ticket => <option key={s(ticket.id)} value={s(ticket.id)}>{s(ticket.protocol)} · {b(ticket.sla_paused_at) || s(ticket.sla_paused_at) ? "pausado" : "correndo"}</option>)}</select></Field>
              <Field label="Motivo da pausa"><select value={slaForm.reason} onChange={e => setSlaForm({ ...slaForm, reason: e.target.value })}>{SLA_REASONS.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
              <Field label="Ação"><select value={slaForm.action} onChange={e => setSlaForm({ ...slaForm, action: e.target.value })}><option value="pause">pausar</option><option value="resume">retomar</option></select></Field>
              <Field label="Observações" help="Opcional; 10 a 1000 caracteres."><input value={slaForm.notes} onChange={e => setSlaForm({ ...slaForm, notes: e.target.value })} /></Field>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={slaAction}>Aplicar ação de SLA</button>
          </details>
        </section>

        <section className={styles.panel} aria-labelledby="cli-visits-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="cli-visits-title">Agenda de visitas ({visits.length})</h3><p>Visita técnica, manutenção, vistoria e reunião: agendamento, confirmação, reagendamento com motivo e histórico.</p></div>
            <span className={styles.count}>{visits.length} registro(s)</span>
          </div>
          <ul className={styles.recordList}>
            {visits.map(visit => <li key={s(visit.id)}>
              <strong>{s(visit.protocol)} · {s(visit.title)}</strong>
              <span>estado {s(visit.status)} · tipo {s(visit.visit_type)} · agendada {dateTime(visit.scheduled_at)} · confirmada {dateTime(visit.confirmed_at)}</span>
              <span>reagendada de {dateTime(visit.rescheduled_from)} para {dateTime(visit.rescheduled_to)} · motivo {s(visit.reschedule_reason) || "não informado"}</span>
              <span>local {s(visit.location) || "não informado"} · responsável {s(visit.responsible_name) || "não informado"} · conta {s(visit.client_account_id)}</span>
              <details className={styles.subsection}><summary>Registro canônico da visita (JSON)</summary><pre className={styles.pre}>{JSON.stringify(visit, null, 2)}</pre></details>
              <div className={styles.actions}>
                <button type="button" disabled={busy} onClick={() => loadVisitHistory(s(visit.id))}>Ver histórico</button>
                <button type="button" disabled={busy} onClick={() => setVisitStatusForm({ id: s(visit.id), status: s(visit.status), rescheduled_to: "", reschedule_reason: "", responsible_name: s(visit.responsible_name) })}>Usar esta visita para confirmar/reagendar</button>
              </div>
              {visitHistoryFor === s(visit.id) && <details className={styles.subsection} open>
                <summary>Histórico da visita ({visitHistory.length})</summary>
                <ul className={styles.recordList}>
                  {visitHistory.map(item => <li key={s(item.id)}>
                    <strong>{s(item.previous_status) || "criação"} → {s(item.next_status)}</strong>
                    <span>{s(item.reason) || "sem motivo registrado"} · em {dateTime(item.created_at)}</span>
                  </li>)}
                </ul>
              </details>}
            </li>)}
          </ul>

          <details className={styles.subsection}>
            <summary>Agendar visita</summary>
            <div className={styles.formGrid}>
              <Field label="Conta do cliente (UUID)" help="Obrigatório."><input value={visitForm.client_account_id} onChange={e => setVisitForm({ ...visitForm, client_account_id: e.target.value })} /></Field>
              <Field label="Contrato (UUID)" help="Opcional."><input value={visitForm.contract_id} onChange={e => setVisitForm({ ...visitForm, contract_id: e.target.value })} /></Field>
              <Field label="Chamado relacionado (UUID)" help="Opcional."><input value={visitForm.ticket_id} onChange={e => setVisitForm({ ...visitForm, ticket_id: e.target.value })} /></Field>
              <Field label="Tipo de visita"><select value={visitForm.visit_type} onChange={e => setVisitForm({ ...visitForm, visit_type: e.target.value })}>{VISIT_TYPES.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
              <Field label="Título" help="5 a 200 caracteres."><input value={visitForm.title} onChange={e => setVisitForm({ ...visitForm, title: e.target.value })} /></Field>
              <Field label="Data e hora" help="Obrigatória."><input type="datetime-local" value={visitForm.scheduled_at} onChange={e => setVisitForm({ ...visitForm, scheduled_at: e.target.value })} /></Field>
              <Field label="Responsável" help="Opcional."><input value={visitForm.responsible_name} onChange={e => setVisitForm({ ...visitForm, responsible_name: e.target.value })} /></Field>
              <Field label="Local" help="Opcional; 3 a 500 caracteres."><input value={visitForm.location} onChange={e => setVisitForm({ ...visitForm, location: e.target.value })} /></Field>
              <div className={styles.full}><Field label="Descrição" help="Opcional; 10 a 2000 caracteres."><textarea rows={2} value={visitForm.description} onChange={e => setVisitForm({ ...visitForm, description: e.target.value })} /></Field></div>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={createVisit}>Agendar visita</button>
          </details>

          <details className={styles.subsection}>
            <summary>Confirmar, reagendar ou encerrar visita</summary>
            <p className={styles.note}>Reagendar exige a nova data e o motivo (10 a 1000 caracteres); o servidor guarda de/para e o histórico.</p>
            <div className={styles.formGrid}>
              <Field label="Visita"><select value={visitStatusForm.id} onChange={e => setVisitStatusForm({ ...visitStatusForm, id: e.target.value })}><option value="">Selecione uma visita</option>{visits.map(visit => <option key={s(visit.id)} value={s(visit.id)}>{s(visit.protocol)} · {s(visit.status)}</option>)}</select></Field>
              <Field label="Novo estado"><select value={visitStatusForm.status} onChange={e => setVisitStatusForm({ ...visitStatusForm, status: e.target.value })}>{VISIT_STATUSES.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
              <Field label="Nova data e hora" help="Obrigatória apenas ao reagendar."><input type="datetime-local" value={visitStatusForm.rescheduled_to} onChange={e => setVisitStatusForm({ ...visitStatusForm, rescheduled_to: e.target.value })} /></Field>
              <Field label="Responsável" help="Opcional."><input value={visitStatusForm.responsible_name} onChange={e => setVisitStatusForm({ ...visitStatusForm, responsible_name: e.target.value })} /></Field>
              <div className={styles.full}><Field label="Motivo do reagendamento" help="Obrigatório ao reagendar (10 a 1000 caracteres)."><input value={visitStatusForm.reschedule_reason} onChange={e => setVisitStatusForm({ ...visitStatusForm, reschedule_reason: e.target.value })} /></Field></div>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={updateVisitStatus}>Atualizar visita</button>
          </details>
        </section>

        <section className={styles.panel} aria-labelledby="cli-reports-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="cli-reports-title">Relatórios de execução, medição e aceite ({reports.length})</h3><p>Rascunho → em revisão → aprovado → enviado. A revisão é obrigatória antes da aprovação e a aprovação antes do envio.</p></div>
            <span className={styles.count}>{reports.length} registro(s)</span>
          </div>
          <ul className={styles.recordList}>
            {reports.map(report => <li key={s(report.id)}>
              <strong>{s(report.protocol)} · {s(report.title)}</strong>
              <span>estado {s(report.status)} · tipo {s(report.report_type)} · período {day(report.period_start)} → {day(report.period_end)}</span>
              <span>revisado em {dateTime(report.reviewed_at)} · aprovado em {dateTime(report.approved_at)} · enviado em {dateTime(report.sent_at)}</span>
              <span>conta {s(report.client_account_id)} · contrato {s(report.contract_id) || "não informado"} · visita {s(report.visit_id) || "não informada"} · privado {b(report.is_private) ? "sim" : "não"}</span>
              <details className={styles.subsection}><summary>Registro canônico do relatório (JSON)</summary><pre className={styles.pre}>{JSON.stringify(report, null, 2)}</pre></details>
              <div className={styles.actions}>
                <button type="button" disabled={busy} onClick={() => loadReportHistory(s(report.id))}>Ver histórico</button>
                <button type="button" disabled={busy} onClick={() => setReportStatusForm({ id: s(report.id), status: s(report.status), review_notes: "", reason: "" })}>Usar este relatório na revisão</button>
              </div>
              {reportHistoryFor === s(report.id) && <details className={styles.subsection} open>
                <summary>Histórico do relatório ({reportHistory.length})</summary>
                <ul className={styles.recordList}>
                  {reportHistory.map(item => <li key={s(item.id)}>
                    <strong>{s(item.previous_status) || "criação"} → {s(item.next_status)}{b(item.is_review) ? " · revisão" : ""}</strong>
                    <span>{s(item.reason) || "sem motivo registrado"} · em {dateTime(item.created_at)}</span>
                  </li>)}
                </ul>
              </details>}
            </li>)}
          </ul>

          <details className={styles.subsection}>
            <summary>Criar relatório</summary>
            <div className={styles.formGrid}>
              <Field label="Conta do cliente (UUID)" help="Obrigatório."><input value={reportForm.client_account_id} onChange={e => setReportForm({ ...reportForm, client_account_id: e.target.value })} /></Field>
              <Field label="Contrato (UUID)" help="Opcional."><input value={reportForm.contract_id} onChange={e => setReportForm({ ...reportForm, contract_id: e.target.value })} /></Field>
              <Field label="Visita relacionada (UUID)" help="Opcional."><input value={reportForm.visit_id} onChange={e => setReportForm({ ...reportForm, visit_id: e.target.value })} /></Field>
              <Field label="Tipo de relatório"><select value={reportForm.report_type} onChange={e => setReportForm({ ...reportForm, report_type: e.target.value })}>{REPORT_TYPES.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
              <Field label="Início do período" help="Opcional."><input type="date" value={reportForm.period_start} onChange={e => setReportForm({ ...reportForm, period_start: e.target.value })} /></Field>
              <Field label="Fim do período" help="Opcional; não pode ser anterior ao início."><input type="date" value={reportForm.period_end} onChange={e => setReportForm({ ...reportForm, period_end: e.target.value })} /></Field>
              <Field label="Título" help="5 a 200 caracteres."><input value={reportForm.title} onChange={e => setReportForm({ ...reportForm, title: e.target.value })} /></Field>
              <div className={styles.full}><Field label="Conteúdo" help="20 a 10000 caracteres; texto simples."><textarea rows={4} value={reportForm.content} onChange={e => setReportForm({ ...reportForm, content: e.target.value })} /></Field></div>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={createReport}>Criar relatório</button>
          </details>

          <details className={styles.subsection}>
            <summary>Revisar, aprovar, rejeitar ou marcar como enviado</summary>
            <div className={styles.formGrid}>
              <Field label="Relatório"><select value={reportStatusForm.id} onChange={e => setReportStatusForm({ ...reportStatusForm, id: e.target.value })}><option value="">Selecione um relatório</option>{reports.map(report => <option key={s(report.id)} value={s(report.id)}>{s(report.protocol)} · {s(report.status)}</option>)}</select></Field>
              <Field label="Novo estado"><select value={reportStatusForm.status} onChange={e => setReportStatusForm({ ...reportStatusForm, status: e.target.value })}>{REPORT_STATUSES.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
              <Field label="Notas de revisão" help="10 a 2000 caracteres; obrigatórias para enviar à revisão."><input value={reportStatusForm.review_notes} onChange={e => setReportStatusForm({ ...reportStatusForm, review_notes: e.target.value })} /></Field>
              <Field label="Motivo no histórico" help="Opcional; 10 a 1000 caracteres."><input value={reportStatusForm.reason} onChange={e => setReportStatusForm({ ...reportStatusForm, reason: e.target.value })} /></Field>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={updateReportStatus}>Atualizar relatório</button>
          </details>
        </section>
      </>}
    </section>
  );
}
