"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarClock, RefreshCw, Save } from "lucide-react";
import {
  callApi,
  jsonInit,
  visitStatusLabel,
  visitTypeLabel,
  type AdminAccount,
} from "./admin-shared";
import styles from "./AdminClientes.module.css";

type VisitStatus = "scheduled" | "confirmed" | "rescheduled" | "completed" | "cancelled" | "no_show";
type VisitType = "technical" | "maintenance" | "inspection" | "meeting" | "other";

type AdminVisit = {
  id: string;
  client_account_id: string;
  account_name: string;
  contract_title: string | null;
  ticket_title: string | null;
  visit_type: VisitType;
  title: string;
  details: string | null;
  scheduled_at: string;
  status: VisitStatus;
  confirmed_at: string | null;
  rescheduled_from: string | null;
  rescheduled_to: string | null;
  reschedule_reason: string | null;
  responsible_name: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
};

const VISIT_STATUSES: VisitStatus[] = ["scheduled", "confirmed", "rescheduled", "completed", "cancelled", "no_show"];
const VISIT_TYPES: VisitType[] = ["technical", "maintenance", "inspection", "meeting", "other"];

function toDateTimeLocal(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function VisitsSection({ accounts }: { accounts: AdminAccount[] | null }) {
  const [accountFilter, setAccountFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [visits, setVisits] = useState<AdminVisit[] | null>(null);
  const [form, setForm] = useState({
    accountId: "",
    visitType: "technical" as VisitType,
    title: "",
    details: "",
    scheduledAt: "",
    responsibleName: "",
    location: "",
  });
  const [editing, setEditing] = useState<Record<string, { status: VisitStatus; reason: string; rescheduledTo: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    setError("");
    const params = new URLSearchParams();
    if (accountFilter) params.set("account", accountFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    const suffix = params.size ? `?${params.toString()}` : "";
    try {
      const data = await callApi(`/api/admin/client-visits${suffix}`);
      setVisits((data.visits as AdminVisit[]) ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a agenda.");
    }
  }, [accountFilter, statusFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function createVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await callApi("/api/admin/client-visits", jsonInit("POST", form));
      setNotice("Visita/manutenção agendada com histórico inicial.");
      setForm(current => ({ ...current, title: "", details: "", scheduledAt: "", responsibleName: "", location: "" }));
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível agendar a visita.");
    } finally {
      setBusy(false);
    }
  }

  const getEdit = (visit: AdminVisit) =>
    editing[visit.id] ?? { status: visit.status, reason: "", rescheduledTo: toDateTimeLocal(visit.scheduled_at) };

  const setEdit = (visit: AdminVisit, partial: Partial<{ status: VisitStatus; reason: string; rescheduledTo: string }>) =>
    setEditing(current => ({ ...current, [visit.id]: { ...getEdit(visit), ...partial } }));

  async function saveVisit(visit: AdminVisit) {
    const draft = getEdit(visit);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await callApi(
        `/api/admin/client-visits/${visit.id}`,
        jsonInit("PATCH", { status: draft.status, reason: draft.reason, rescheduledTo: draft.rescheduledTo }),
      );
      setNotice(`Visita “${visit.title}” atualizada para “${visitStatusLabel[draft.status]}”.`);
      setEditing(current => {
        const next = { ...current };
        delete next[visit.id];
        return next;
      });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar a visita.");
    } finally {
      setBusy(false);
    }
  }

  const activeAccounts = accounts ?? [];

  return (
    <section className={styles.card} aria-labelledby="visits-section-title">
      <h2 id="visits-section-title">6 · Agenda de visitas e manutenções</h2>
      <p className={styles.hint}>
        CLI-07 promovido para fluxo real: a equipe agenda, o cliente confirma ou solicita reagendamento,
        e cada alteração mantém histórico com autor, motivo e data anterior/nova.
      </p>

      <form className={styles.formGrid} onSubmit={createVisit} noValidate>
        <div className={`${styles.formRow} ${styles.three}`}>
          <div className={styles.field}>
            <label htmlFor="visit-account">Cadastro</label>
            <select id="visit-account" value={form.accountId} onChange={event => setForm({ ...form, accountId: event.target.value })} required>
              <option value="">Selecione</option>
              {activeAccounts.map(account => <option key={account.id} value={account.id}>{account.display_name}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="visit-type">Tipo</label>
            <select id="visit-type" value={form.visitType} onChange={event => setForm({ ...form, visitType: event.target.value as VisitType })}>
              {VISIT_TYPES.map(type => <option key={type} value={type}>{visitTypeLabel[type]}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="visit-scheduled">Data e hora</label>
            <input id="visit-scheduled" type="datetime-local" value={form.scheduledAt} onChange={event => setForm({ ...form, scheduledAt: event.target.value })} required />
          </div>
        </div>
        <div className={`${styles.formRow} ${styles.two}`}>
          <div className={styles.field}>
            <label htmlFor="visit-title">Título</label>
            <input id="visit-title" value={form.title} maxLength={160} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Manutenção preventiva mensal" required />
          </div>
          <div className={styles.field}>
            <label htmlFor="visit-responsible">Responsável / local</label>
            <input id="visit-responsible" value={form.responsibleName} maxLength={160} onChange={event => setForm({ ...form, responsibleName: event.target.value })} placeholder="Supervisor responsável" />
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="visit-details">Detalhes</label>
          <textarea id="visit-details" value={form.details} maxLength={1000} onChange={event => setForm({ ...form, details: event.target.value })} placeholder="Escopo da visita, local, itens que serão conferidos." />
        </div>
        <button className={styles.submit} type="submit" disabled={busy || !form.accountId || !form.title || !form.scheduledAt}>
          <CalendarClock size={14} aria-hidden="true" />
          {busy ? "Agendando…" : "Agendar visita"}
        </button>
      </form>

      <div className={`${styles.formRow} ${styles.two}`} style={{ marginBottom: 16 }}>
        <div className={styles.field}>
          <label htmlFor="visit-filter-account">Filtrar por cadastro</label>
          <select id="visit-filter-account" value={accountFilter} onChange={event => setAccountFilter(event.target.value)}>
            <option value="">Todos</option>
            {activeAccounts.map(account => <option key={account.id} value={account.id}>{account.display_name}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="visit-filter-status">Filtrar por situação</label>
          <select id="visit-filter-status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
            <option value="all">Todas</option>
            {VISIT_STATUSES.map(status => <option key={status} value={status}>{visitStatusLabel[status]}</option>)}
          </select>
        </div>
      </div>

      {error ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{error}</p> : null}
      {notice ? <p className={`${styles.message} ${styles.messageOk}`} role="status">{notice}</p> : null}
      <p className={styles.hint}>
        <button type="button" className={styles.ghostButton} onClick={() => void reload()} style={{ color: "#1a5db2", borderColor: "#1a5db2" }}>
          <RefreshCw size={12} aria-hidden="true" />
          Recarregar agenda
        </button>
      </p>

      {!visits ? (
        <div className={styles.loadingWrap} style={{ color: "#5a7189" }}>Carregando agenda…</div>
      ) : visits.length === 0 ? (
        <div className={styles.empty}>Nenhuma visita/manutenção encontrada.</div>
      ) : (
        <ul className={styles.list}>
          {visits.map(visit => {
            const draft = getEdit(visit);
            const dirty = draft.status !== visit.status || (draft.status === "rescheduled" && draft.rescheduledTo !== toDateTimeLocal(visit.scheduled_at));
            return (
              <li key={visit.id} className={styles.listItem}>
                <div className={styles.listItemMain}>
                  <p className={styles.listItemTitle}>{visit.title}</p>
                  <p className={styles.listItemMeta}>
                    {visit.account_name} · {visitTypeLabel[visit.visit_type]} · {new Date(visit.scheduled_at).toLocaleString("pt-BR")}
                    {visit.contract_title ? ` · contrato: ${visit.contract_title}` : ""}
                  </p>
                </div>
                <span className={`${styles.chip} ${visit.status === "completed" ? styles.chipResolved : visit.status === "cancelled" ? styles.chipClosed : styles.chipProgress}`}>
                  {visitStatusLabel[visit.status]}
                </span>
                {visit.details ? <p className={styles.listItemDetail}>{visit.details}</p> : null}
                {visit.reschedule_reason ? <p className={styles.listItemDetail}>Motivo do último reagendamento: {visit.reschedule_reason}</p> : null}
                <div className={styles.inlineForm}>
                  <select value={draft.status} disabled={busy} onChange={event => setEdit(visit, { status: event.target.value as VisitStatus })}>
                    {VISIT_STATUSES.map(status => <option key={status} value={status}>{visitStatusLabel[status]}</option>)}
                  </select>
                  {draft.status === "rescheduled" ? (
                    <input type="datetime-local" value={draft.rescheduledTo} disabled={busy} onChange={event => setEdit(visit, { rescheduledTo: event.target.value })} aria-label={`Nova data da visita ${visit.title}`} />
                  ) : null}
                  <textarea value={draft.reason} maxLength={500} disabled={busy} onChange={event => setEdit(visit, { reason: event.target.value })} placeholder="Motivo/contexto da mudança" />
                  <button type="button" className={styles.submit} disabled={busy || !dirty} onClick={() => void saveVisit(visit)} style={{ padding: "9px 14px" }}>
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
