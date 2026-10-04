"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { FileCheck2, RefreshCw, Save } from "lucide-react";
import {
  callApi,
  jsonInit,
  stableIdempotencyKey,
  reportStatusLabel,
  reportTypeLabel,
  ticketStatusLabel,
  type AdminAccount,
} from "./admin-shared";
import styles from "./AdminClientes.module.css";

type ReportStatus = "draft" | "in_review" | "approved" | "rejected" | "sent" | "acknowledged";
type ReportType = "execution" | "measurement" | "acceptance" | "other";

type AdminReport = {
  id: string;
  client_account_id: string;
  account_name: string;
  contract_title: string | null;
  visit_title: string | null;
  ticket_id: string | null;
  ticket_title: string | null;
  ticket_status: string | null;
  report_type: ReportType;
  title: string;
  summary: string;
  period_start: string | null;
  period_end: string | null;
  status: ReportStatus;
  review_notes: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  sent_at: string | null;
  acknowledged_at: string | null;
  acknowledgement_note: string | null;
  created_at: string;
  updated_at: string;
};

const REPORT_STATUSES: ReportStatus[] = ["draft", "in_review", "approved", "rejected", "sent", "acknowledged"];
const EDITABLE_REPORT_STATUSES: Exclude<ReportStatus, "acknowledged">[] = ["draft", "in_review", "approved", "rejected", "sent"];
const REPORT_TYPES: ReportType[] = ["execution", "measurement", "acceptance", "other"];

type ResolvedTicket = { id: string; client_account_id: string; title: string; account_name: string };

export default function ReportsSection({ accounts }: { accounts: AdminAccount[] | null }) {
  const [accountFilter, setAccountFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reports, setReports] = useState<AdminReport[] | null>(null);
  const [form, setForm] = useState({
    accountId: "",
    reportType: "execution" as ReportType,
    ticketId: "",
    title: "",
    summary: "",
    periodStart: "",
    periodEnd: "",
  });
  const [resolvedTickets, setResolvedTickets] = useState<ResolvedTicket[] | null>(null);
  const [editing, setEditing] = useState<Record<string, { status: Exclude<ReportStatus, "acknowledged">; reviewNotes: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const createSlot = useRef<{ fingerprint: string; key: string } | null>(null);

  const reload = useCallback(async () => {
    setError("");
    const params = new URLSearchParams();
    if (accountFilter) params.set("account", accountFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    const suffix = params.size ? `?${params.toString()}` : "";
    try {
      const data = await callApi(`/api/admin/client-reports${suffix}`);
      setReports((data.reports as AdminReport[]) ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os relatórios.");
    }
  }, [accountFilter, statusFilter]);

  // Só chamados já resolvidos podem receber um relatório de aceite; a lista é
  // carregada do servidor, que é quem decide o recorte.
  const loadResolvedTickets = useCallback(async () => {
    try {
      const data = await callApi("/api/admin/tickets?status=resolved");
      setResolvedTickets((data.tickets as ResolvedTicket[]) ?? []);
    } catch {
      setResolvedTickets([]);
    }
  }, []);

  useEffect(() => {
    void reload();
    void loadResolvedTickets();
  }, [reload, loadResolvedTickets]);

  async function createReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const payload = { ...form, ticketId: form.reportType === "acceptance" ? form.ticketId : "" };
    const key = stableIdempotencyKey(createSlot, JSON.stringify(payload));
    try {
      await callApi("/api/admin/client-reports", jsonInit("POST", payload, key));
      createSlot.current = null;
      setNotice(
        payload.ticketId
          ? "Relatório de aceite criado como rascunho e vinculado ao chamado. Revise, aprove e envie para o cliente poder aceitar."
          : "Relatório criado como rascunho. Revise antes de publicar ao cliente.",
      );
      setForm(current => ({ ...current, ticketId: "", title: "", summary: "", periodStart: "", periodEnd: "" }));
      await reload();
      await loadResolvedTickets();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o relatório.");
    } finally {
      setBusy(false);
    }
  }

  const getEdit = (report: AdminReport) =>
    editing[report.id] ?? {
      status: report.status === "acknowledged" ? "sent" : report.status,
      reviewNotes: report.review_notes ?? "",
    };

  const setEdit = (report: AdminReport, partial: Partial<{ status: Exclude<ReportStatus, "acknowledged">; reviewNotes: string }>) =>
    setEditing(current => ({ ...current, [report.id]: { ...getEdit(report), ...partial } }));

  async function saveReport(report: AdminReport) {
    const draft = getEdit(report);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await callApi(
        `/api/admin/client-reports/${report.id}`,
        jsonInit("PATCH", { status: draft.status, reviewNotes: draft.reviewNotes, reason: draft.reviewNotes }),
      );
      setNotice(`Relatório “${report.title}” atualizado para “${reportStatusLabel[draft.status]}”.`);
      setEditing(current => {
        const next = { ...current };
        delete next[report.id];
        return next;
      });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o relatório.");
    } finally {
      setBusy(false);
    }
  }

  const activeAccounts = accounts ?? [];

  return (
    <section className={styles.card} aria-labelledby="reports-section-title">
      <h2 id="reports-section-title">7 · Relatórios de execução, medição e aceite</h2>
      <p className={styles.hint}>
        CLI-08 promovido para fluxo real: rascunho, revisão registrada, aprovação, envio ao portal
        e aceite/ciência do cliente autenticado. Rascunhos e rejeitados não aparecem para o cliente.
        Um relatório do tipo <strong>Aceite</strong> pode ser vinculado a um chamado já resolvido: quando o
        cliente registrar o aceite dele no portal, o chamado é encerrado na mesma transação. Nada é
        enviado por e-mail — a publicação acontece dentro do portal do cliente.
      </p>

      <form className={styles.formGrid} onSubmit={createReport} noValidate>
        <div className={`${styles.formRow} ${styles.three}`}>
          <div className={styles.field}>
            <label htmlFor="report-account">Cadastro</label>
            <select id="report-account" value={form.accountId} onChange={event => setForm({ ...form, accountId: event.target.value })} required>
              <option value="">Selecione</option>
              {activeAccounts.map(account => <option key={account.id} value={account.id}>{account.display_name}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="report-type">Tipo</label>
            <select id="report-type" value={form.reportType} onChange={event => setForm({ ...form, reportType: event.target.value as ReportType })}>
              {REPORT_TYPES.map(type => <option key={type} value={type}>{reportTypeLabel[type]}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="report-period-start">Período inicial</label>
            <input id="report-period-start" type="date" value={form.periodStart} onChange={event => setForm({ ...form, periodStart: event.target.value })} />
          </div>
        </div>
        {form.reportType === "acceptance" ? (
          <div className={styles.field}>
            <label htmlFor="report-ticket">Chamado resolvido a encerrar pelo aceite (opcional)</label>
            <select id="report-ticket" value={form.ticketId} onChange={event => setForm({ ...form, ticketId: event.target.value })}>
              <option value="">Sem vínculo com chamado</option>
              {(resolvedTickets ?? [])
                .filter(ticket => !form.accountId || ticket.client_account_id === form.accountId)
                .map(ticket => (
                  <option key={ticket.id} value={ticket.id}>
                    {ticket.title} · {ticket.account_name}
                  </option>
                ))}
            </select>
          </div>
        ) : null}
        <div className={`${styles.formRow} ${styles.two}`}>
          <div className={styles.field}>
            <label htmlFor="report-title">Título</label>
            <input id="report-title" value={form.title} maxLength={160} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Relatório operacional mensal" required />
          </div>
          <div className={styles.field}>
            <label htmlFor="report-period-end">Período final</label>
            <input id="report-period-end" type="date" value={form.periodEnd} onChange={event => setForm({ ...form, periodEnd: event.target.value })} />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="report-summary">Resumo do relatório</label>
          <textarea id="report-summary" value={form.summary} maxLength={1000} onChange={event => setForm({ ...form, summary: event.target.value })} placeholder="Resumo sintético da execução, medições realizadas e pontos de aceite." required />
        </div>
        <button className={styles.submit} type="submit" disabled={busy || !form.accountId || form.title.trim().length < 3 || form.summary.trim().length < 20}>
          <FileCheck2 size={14} aria-hidden="true" />
          {busy ? "Criando…" : "Criar relatório"}
        </button>
      </form>

      <div className={`${styles.formRow} ${styles.two}`} style={{ marginBottom: 16 }}>
        <div className={styles.field}>
          <label htmlFor="report-filter-account">Filtrar por cadastro</label>
          <select id="report-filter-account" value={accountFilter} onChange={event => setAccountFilter(event.target.value)}>
            <option value="">Todos</option>
            {activeAccounts.map(account => <option key={account.id} value={account.id}>{account.display_name}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="report-filter-status">Filtrar por situação</label>
          <select id="report-filter-status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
            <option value="all">Todas</option>
            {REPORT_STATUSES.map(status => <option key={status} value={status}>{reportStatusLabel[status]}</option>)}
          </select>
        </div>
      </div>

      {error ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{error}</p> : null}
      {notice ? <p className={`${styles.message} ${styles.messageOk}`} role="status">{notice}</p> : null}
      <p className={styles.hint}>
        <button type="button" className={styles.ghostButton} onClick={() => void reload()} style={{ color: "#1a5db2", borderColor: "#1a5db2" }}>
          <RefreshCw size={12} aria-hidden="true" />
          Recarregar relatórios
        </button>
      </p>

      {!reports ? (
        <div className={styles.loadingWrap} style={{ color: "#5a7189" }}>Carregando relatórios…</div>
      ) : reports.length === 0 ? (
        <div className={styles.empty}>Nenhum relatório encontrado.</div>
      ) : (
        <ul className={styles.list}>
          {reports.map(report => {
            const draft = getEdit(report);
            const dirty = draft.status !== report.status || draft.reviewNotes !== (report.review_notes ?? "");
            return (
              <li key={report.id} className={styles.listItem}>
                <div className={styles.listItemMain}>
                  <p className={styles.listItemTitle}>{report.title}</p>
                  <p className={styles.listItemMeta}>
                    {report.account_name} · {reportTypeLabel[report.report_type]} · criado em {new Date(report.created_at).toLocaleString("pt-BR")}
                    {report.period_start ? ` · período ${new Date(`${report.period_start}T00:00:00`).toLocaleDateString("pt-BR")}` : ""}
                    {report.period_end ? ` a ${new Date(`${report.period_end}T00:00:00`).toLocaleDateString("pt-BR")}` : ""}
                  </p>
                </div>
                <span className={`${styles.chip} ${report.status === "approved" || report.status === "sent" || report.status === "acknowledged" ? styles.chipResolved : report.status === "rejected" ? styles.chipClosed : styles.chipProgress}`}>
                  {reportStatusLabel[report.status]}
                </span>
                <p className={styles.listItemDetail}>{report.summary}</p>
                {report.ticket_id ? (
                  <p className={styles.listItemDetail}>
                    Chamado vinculado: {report.ticket_title ?? report.ticket_id}
                    {report.ticket_status ? ` · ${ticketStatusLabel[report.ticket_status] ?? report.ticket_status}` : ""}
                  </p>
                ) : null}
                {report.review_notes ? <p className={styles.listItemDetail}>Revisão: {report.review_notes}</p> : null}
                {report.acknowledged_at ? <p className={styles.listItemDetail}>Cliente deu ciência em {new Date(report.acknowledged_at).toLocaleString("pt-BR")}{report.acknowledgement_note ? ` · ${report.acknowledgement_note}` : ""}</p> : null}
                <div className={styles.inlineForm}>
                  <select value={draft.status} disabled={busy || report.status === "acknowledged"} onChange={event => setEdit(report, { status: event.target.value as Exclude<ReportStatus, "acknowledged"> })}>
                    {EDITABLE_REPORT_STATUSES.map(status => <option key={status} value={status}>{reportStatusLabel[status]}</option>)}
                  </select>
                  <textarea value={draft.reviewNotes} maxLength={1000} disabled={busy || report.status === "acknowledged"} onChange={event => setEdit(report, { reviewNotes: event.target.value })} placeholder="Nota de revisão obrigatória para revisar/rejeitar; preserve conteúdo sintético." />
                  <button type="button" className={styles.submit} disabled={busy || !dirty || report.status === "acknowledged"} onClick={() => void saveReport(report)} style={{ padding: "9px 14px" }}>
                    <Save size={13} aria-hidden="true" />
                    Salvar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
