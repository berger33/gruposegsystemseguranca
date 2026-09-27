"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { callApi, jsonInit, ticketStatusLabel, type AdminAccount } from "./admin-shared";
import styles from "./AdminClientes.module.css";

type AdminTicket = {
  id: string;
  account_id: string;
  account_name: string;
  opened_by_email: string;
  category: string;
  title: string;
  details: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  created_at: string;
  updated_at: string;
  admin_response: string | null;
};

const TICKET_STATUSES: AdminTicket["status"][] = ["open", "in_progress", "resolved", "closed"];

export default function TicketsSection({ accounts }: { accounts: AdminAccount[] | null }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("");
  const [tickets, setTickets] = useState<AdminTicket[] | null>(null);
  const [editing, setEditing] = useState<Record<string, { status: AdminTicket["status"]; response: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    setError("");
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (accountFilter) params.set("account", accountFilter);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    try {
      const data = await callApi(`/api/admin/tickets${suffix}`);
      setTickets((data.tickets as AdminTicket[]) ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os chamados.");
    }
  }, [statusFilter, accountFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const getEdit = (ticket: AdminTicket) =>
    editing[ticket.id] ?? { status: ticket.status, response: ticket.admin_response ?? "" };

  const setEdit = (ticket: AdminTicket, partial: Partial<{ status: AdminTicket["status"]; response: string }>) =>
    setEditing(current => ({ ...current, [ticket.id]: { ...getEdit(ticket), ...partial } }));

  async function save(ticket: AdminTicket) {
    setBusy(true);
    setError("");
    setNotice("");
    const draft = getEdit(ticket);
    try {
      await callApi(
        `/api/admin/tickets/${ticket.id}`,
        jsonInit("PATCH", { status: draft.status, adminResponse: draft.response }),
      );
      setNotice(`Chamado “${ticket.title}” atualizado para “${ticketStatusLabel[draft.status]}”.`);
      setEditing(current => {
        const next = { ...current };
        delete next[ticket.id];
        return next;
      });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o chamado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="tickets-section-title">
      <h2 id="tickets-section-title">5 · Chamados dos clientes</h2>
      <p className={styles.hint}>
        Atendimento interno complementar. Toda mudança de situação fica registrada em auditoria com quem
        alterou, quando, e de qual situação para qual; a resposta fica visível para o cliente no portal.
      </p>

      <div className={`${styles.formRow} ${styles.two}`} style={{ marginBottom: 16 }}>
        <div className={styles.field}>
          <label htmlFor="tickets-status">Filtrar por situação</label>
          <select id="tickets-status" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
            <option value="all">Todas</option>
            {TICKET_STATUSES.map(status => (
              <option key={status} value={status}>
                {ticketStatusLabel[status]}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="tickets-account">Filtrar por cadastro</label>
          <select id="tickets-account" value={accountFilter} onChange={event => setAccountFilter(event.target.value)}>
            <option value="">Todos</option>
            {(accounts ?? []).map(account => (
              <option key={account.id} value={account.id}>
                {account.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{error}</p> : null}
      {notice ? <p className={`${styles.message} ${styles.messageOk}`} role="status">{notice}</p> : null}

      <p className={styles.hint}>
        <button type="button" className={styles.ghostButton} onClick={() => void reload()} style={{ color: "#1a5db2", borderColor: "#1a5db2" }}>
          <RefreshCw size={12} aria-hidden="true" />
          Recarregar chamados
        </button>
      </p>
      {!tickets ? (
        <div className={styles.loadingWrap} style={{ color: "#5a7189" }}>
          <span className={styles.spinner} style={{ borderColor: "#5a7189", borderTopColor: "transparent" }} aria-hidden="true" />
          Carregando chamados…
        </div>
      ) : tickets.length === 0 ? (
        <div className={styles.empty}>Nenhum chamado encontrado com os filtros atuais.</div>
      ) : (
        <ul className={styles.list}>
          {tickets.map(ticket => {
            const draft = getEdit(ticket);
            const dirty = draft.status !== ticket.status || draft.response !== (ticket.admin_response ?? "");
            const chip =
              ticket.status === "open"
                ? styles.chipOpen
                : ticket.status === "in_progress"
                  ? styles.chipProgress
                  : ticket.status === "resolved"
                    ? styles.chipResolved
                    : styles.chipClosed;
            return (
              <li key={ticket.id} className={styles.listItem}>
                <div className={styles.listItemMain}>
                  <p className={styles.listItemTitle}>{ticket.title}</p>
                  <p className={styles.listItemMeta}>
                    {ticket.account_name} · aberto por {ticket.opened_by_email} · {ticket.category} ·{" "}
                    {new Date(ticket.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <span className={`${styles.chip} ${chip}`}>{ticketStatusLabel[ticket.status]}</span>
                <p className={styles.listItemDetail}>{ticket.details}</p>
                {ticket.admin_response ? (
                  <p className={styles.listItemDetail} style={{ background: "#e7f2fc", padding: "8px 10px", borderRadius: 8 }}>
                    Resposta atual ao cliente: {ticket.admin_response}
                  </p>
                ) : null}
                <div className={styles.inlineForm}>
                  <select
                    value={draft.status}
                    disabled={busy}
                    onChange={event => setEdit(ticket, { status: event.target.value as AdminTicket["status"] })}
                    aria-label={`Nova situação do chamado ${ticket.title}`}
                    style={{ flex: "0 1 170px" }}
                  >
                    {TICKET_STATUSES.map(status => (
                      <option key={status} value={status}>
                        {ticketStatusLabel[status]}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={draft.response}
                    maxLength={500}
                    disabled={busy}
                    onChange={event => setEdit(ticket, { response: event.target.value })}
                    placeholder="Resposta para o cliente (opcional, máx. 500 caracteres)"
                    aria-label={`Resposta do chamado ${ticket.title}`}
                  />
                  <button type="button" className={styles.submit} disabled={busy || !dirty} onClick={() => void save(ticket)} style={{ padding: "9px 14px" }}>
                    <Save size={13} aria-hidden="true" />
                    {busy ? "Salvando…" : "Salvar"}
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
