"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import { callApi, jsonInit, ticketStatusLabel, type AdminAccount } from "./admin-shared";
import styles from "./AdminClientes.module.css";

type TicketMessage = {
  kind: "attendance" | "resolution" | "acceptance";
  message: string;
  author_kind: "client" | "staff";
  author_name: string | null;
  created_at: string;
};

type AdminTicket = {
  id: string;
  client_account_id: string;
  account_name: string;
  opened_by_email: string;
  category: string;
  title: string;
  details: string;
  status: "open" | "in_progress" | "waiting_client" | "resolved" | "closed";
  created_at: string;
  updated_at: string;
  admin_response: string | null;
  sla_paused_at: string | null;
  sla_pause_reason: string | null;
  sla_total_paused_seconds: number | string | null;
  reopen_count: number | null;
  last_reopen_reason: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  messages: TicketMessage[] | null;
};

const TICKET_STATUSES: AdminTicket["status"][] = ["open", "in_progress", "waiting_client", "resolved", "closed"];

const messageKindLabel: Record<TicketMessage["kind"], string> = {
  attendance: "Atendimento",
  resolution: "Resolução",
  acceptance: "Aceite do cliente",
};

// Jornada canônica F03 (cliente → chamado → atendimento → aceite): o staff
// assume chamados abertos (ou aguardando cliente) e resolve chamados em
// atendimento, sempre com devolutiva escrita. O fechamento é exclusivamente o
// aceite do cliente no portal — não há "salvar situação" arbitrário aqui.
export default function TicketsSection({ accounts }: { accounts: AdminAccount[] | null }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("");
  const [tickets, setTickets] = useState<AdminTicket[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyTicket, setBusyTicket] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [noScope, setNoScope] = useState(false);

  const reload = useCallback(async () => {
    setError("");
    setNoScope(false);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (accountFilter) params.set("account", accountFilter);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    try {
      const data = await callApi(`/api/admin/client/l08/tickets${suffix}`);
      setTickets((data.tickets as AdminTicket[]) ?? []);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível carregar os chamados.";
      setNoScope(true);
      setTickets([]);
      setError(message);
    }
  }, [statusFilter, accountFilter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const availableActions = (ticket: AdminTicket): { action: "assumir" | "resolver"; label: string }[] => {
    if (ticket.status === "open" || ticket.status === "waiting_client") {
      return [{ action: "assumir", label: "Assumir chamado" }];
    }
    if (ticket.status === "in_progress") {
      return [{ action: "resolver", label: "Resolver chamado" }];
    }
    return [];
  };

  async function transition(ticket: AdminTicket, action: "assumir" | "resolver") {
    const message = (drafts[ticket.id] ?? "").trim();
    setBusyTicket(ticket.id);
    setError("");
    setNotice("");
    try {
      const init = jsonInit("PATCH", { id: ticket.id, action, message });
      // Cada clicada é uma intenção distinta: nova chave. O retry seguro do
      // mesmo envio é feito pelo servidor via replay desta mesma chave.
      init.headers = { ...(init.headers as Record<string, string>), "Idempotency-Key": `ticket-${action}-${crypto.randomUUID()}` };
      await callApi("/api/admin/client/l08/tickets", init);
      setNotice(
        action === "assumir"
          ? `Chamado “${ticket.title}” assumido e devolutiva registrada em auditoria, visível ao cliente.`
          : `Chamado “${ticket.title}” resolvido. Aguardando o aceite do cliente no portal.`,
      );
      setDrafts(current => {
        const next = { ...current };
        delete next[ticket.id];
        return next;
      });
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o chamado.");
    } finally {
      setBusyTicket("");
    }
  }

  return (
    <section className={styles.card} aria-labelledby="tickets-section-title">
      <h2 id="tickets-section-title">5 · Chamados dos clientes</h2>
      <p className={styles.hint}>
        Atendimento canônico: assuma chamados abertos e resolva chamados em atendimento sempre com
        devolutiva escrita. Cada passo fica na trilha do chamado e na auditoria com quem agiu e quando.
        O fechamento é o aceite do próprio cliente no portal.
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
      {noScope ? (
        <p className={styles.hint} role="note">
          A fila responde apenas dentro das concessões ativas de <code>client.tickets.read</code> da sua
          identidade. Se o atendimento ficou indisponível de repente, a concessão pode ter sido revogada.
        </p>
      ) : null}

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
            const actions = availableActions(ticket);
            const chip =
              ticket.status === "open"
                ? styles.chipOpen
                : ticket.status === "in_progress" || ticket.status === "waiting_client"
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
                {(ticket.messages ?? []).length > 0 ? (
                  <ul className={styles.listItemDetail} style={{ background: "#f2f7fd", padding: "8px 10px", borderRadius: 8, listStyle: "none", margin: 0 }}>
                    {(ticket.messages ?? []).map((message, index) => (
                      <li key={`${ticket.id}-${index}`} style={{ marginTop: index === 0 ? 0 : 6 }}>
                        <strong>{messageKindLabel[message.kind]}</strong>
                        {message.author_name ? ` · ${message.author_name}` : ""} ·{" "}
                        {new Date(message.created_at).toLocaleString("pt-BR")}
                        <br />
                        {message.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {ticket.sla_paused_at ? (
                  <p className={styles.listItemDetail} style={{ background: "#fdf6e3", padding: "8px 10px", borderRadius: 8 }}>
                    SLA pausado: aguardando cliente desde {new Date(ticket.sla_paused_at).toLocaleString("pt-BR")}. Pausas acumuladas: {Math.round(Number(ticket.sla_total_paused_seconds ?? 0) / 60)} min.
                  </p>
                ) : null}
                {ticket.reopen_count ? (
                  <p className={styles.listItemDetail}>
                    Reaberturas: {ticket.reopen_count}{ticket.last_reopen_reason ? ` · último motivo: ${ticket.last_reopen_reason}` : ""}
                  </p>
                ) : null}
                {ticket.status === "resolved" ? (
                  <p className={styles.listItemDetail} style={{ background: "#eef6ee", padding: "8px 10px", borderRadius: 8 }}>
                    Resolvido em {ticket.resolved_at ? new Date(ticket.resolved_at).toLocaleString("pt-BR") : "—"} · aguardando o aceite do cliente no portal.
                  </p>
                ) : null}
                {ticket.closed_at ? (
                  <p className={styles.listItemDetail}>Encerrado com aceite do cliente em {new Date(ticket.closed_at).toLocaleString("pt-BR")}.</p>
                ) : null}
                {actions.length > 0 ? (
                  <div className={styles.inlineForm}>
                    <textarea
                      value={drafts[ticket.id] ?? ""}
                      maxLength={1000}
                      disabled={busyTicket !== ""}
                      onChange={event => setDrafts(current => ({ ...current, [ticket.id]: event.target.value }))}
                      placeholder="Devolutiva para o cliente (obrigatória, 5 a 1000 caracteres) — fica na trilha do chamado e no portal."
                      aria-label={`Devolutiva do chamado ${ticket.title}`}
                    />
                    {actions.map(({ action, label }) => (
                      <button
                        key={action}
                        type="button"
                        className={styles.submit}
                        disabled={busyTicket !== "" || (drafts[ticket.id] ?? "").trim().length < 5}
                        onClick={() => void transition(ticket, action)}
                        style={{ padding: "9px 14px" }}
                      >
                        <Send size={13} aria-hidden="true" />
                        {busyTicket === ticket.id ? "Registrando…" : label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
