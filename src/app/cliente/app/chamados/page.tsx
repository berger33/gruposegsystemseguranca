"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Headphones, RotateCw, Send } from "lucide-react";
import { TICKET_CATEGORIES } from "@/lib/client-space-core.mjs";
import { useClientSpace } from "../ClientSpaceProvider";
import styles from "../../RealAccess.module.css";
import appStyles from "../ClientApp.module.css";

type TicketMessage = {
  kind: "attendance" | "resolution" | "acceptance";
  message: string;
  author_kind: "client" | "staff";
  author_name: string | null;
  created_at: string;
};

type Ticket = {
  id: string;
  category: string;
  title: string;
  details: string;
  status: "open" | "in_progress" | "waiting_client" | "resolved" | "closed";
  created_at: string;
  updated_at: string;
  admin_response: string | null;
  sla_due_at: string | null;
  sla_paused_at: string | null;
  sla_pause_reason: string | null;
  sla_total_paused_seconds: number | string | null;
  reopen_count: number | null;
  last_reopen_reason: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  messages: TicketMessage[] | null;
};

const ticketStatus: Record<Ticket["status"], { text: string; chip: string }> = {
  open: { text: "Aberto", chip: appStyles.chipOpen },
  in_progress: { text: "Em atendimento", chip: appStyles.chipProgress },
  waiting_client: { text: "Aguardando cliente", chip: appStyles.chipProgress },
  resolved: { text: "Resolvido", chip: appStyles.chipResolved },
  closed: { text: "Encerrado", chip: appStyles.chipClosed },
};

const messageKindLabel: Record<TicketMessage["kind"], string> = {
  attendance: "Atendimento da equipe",
  resolution: "Resolução da equipe",
  acceptance: "Seu aceite",
};

const openErrors: Record<string, string> = {
  ticket_category_invalid: "Escolha um assunto da lista.",
  ticket_title_required: "Informe um título para o chamado.",
  ticket_title_too_long: "O título deve ter no máximo 120 caracteres.",
  ticket_details_required: "Descreva o que aconteceu para a equipe poder ajudar.",
  ticket_details_too_long: "A descrição deve ter no máximo 500 caracteres.",
  idempotency_conflict: "Este envio mudou desde a última tentativa. Revise os dados e envie novamente.",
  forbidden: "Este cadastro não permite abrir chamados no momento.",
  ticket_reopen_reason_required: "Informe um motivo de reabertura com pelo menos 10 caracteres.",
  ticket_reopen_reason_too_long: "O motivo de reabertura deve ter no máximo 500 caracteres.",
  ticket_reopen_only_resolved_or_closed: "Somente chamados resolvidos ou encerrados podem ser reabertos.",
  ticket_accept_requires_resolved: "O aceite só pode ser registrado quando o chamado está resolvido pela equipe. Se algo ficou pendente, reabra o chamado.",
  ticket_message_invalid: "O comentário do aceite deve ter entre 5 e 1000 caracteres (ou ficar em branco).",
};

export default function ClientTicketsPage() {
  const { activeAccount, loading, notice, reload } = useClientSpace();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [category, setCategory] = useState<string>(TICKET_CATEGORIES[0] as string);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [reopenReason, setReopenReason] = useState<Record<string, string>>({});
  const [reopenBusy, setReopenBusy] = useState<string | null>(null);
  const [acceptNote, setAcceptNote] = useState<Record<string, string>>({});
  const [acceptBusy, setAcceptBusy] = useState<string | null>(null);
  const retryRequest = useRef<{ fingerprint: string; key: string } | null>(null);

  const loadTickets = useCallback((accountId: string) => {
    setLoadError("");
    fetch(`/api/client/tickets?account=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("unexpected");
        const data = (await response.json()) as { tickets: Ticket[] };
        setTickets(data.tickets);
      })
      .catch(() => setLoadError("Não foi possível carregar seus chamados agora."));
  }, []);

  useEffect(() => {
    if (!activeAccount || activeAccount.status !== "active") {
      setTickets(null);
      return;
    }
    loadTickets(activeAccount.id);
  }, [activeAccount, loadTickets]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeAccount) return;
    setState("submitting");
    setMessage("");
    const requestBody = { accountId: activeAccount.id, category, title, details };
    const requestFingerprint = JSON.stringify(requestBody);
    if (!retryRequest.current || retryRequest.current.fingerprint !== requestFingerprint) {
      retryRequest.current = { fingerprint: requestFingerprint, key: crypto.randomUUID() };
    }
    try {
      const response = await fetch("/api/client/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": retryRequest.current.key,
        },
        body: requestFingerprint,
      });
      const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        if (response.status < 500) retryRequest.current = null;
        setState("error");
        setMessage(
          openErrors[payload.error ?? ""] ?? "Não foi possível abrir o chamado agora. Tente novamente em instantes.",
        );
        return;
      }
      retryRequest.current = null;
      setState("success");
      setMessage("Chamado registrado. A equipe acompanha pelo portal e responde por aqui mesmo.");
      setTitle("");
      setDetails("");
      loadTickets(activeAccount.id);
    } catch {
      setState("error");
      setMessage("Não foi possível conectar agora. Tente novamente em instantes.");
    }
  };

  const acceptTicket = async (ticket: Ticket) => {
    const note = (acceptNote[ticket.id] ?? "").trim();
    setAcceptBusy(ticket.id);
    setState("idle");
    setMessage("");
    try {
      const response = await fetch(`/api/client/tickets/${ticket.id}/accept`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          // Cada clique é uma intenção distinta; o retry seguro do servidor
          // responde replay ao reaplicar a mesma chave após falha transitória.
          "Idempotency-Key": `ticket-accept-${crypto.randomUUID()}`,
        },
        body: JSON.stringify(note ? { message: note } : {}),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setState("error");
        setMessage(openErrors[payload.error ?? ""] ?? "Não foi possível registrar o aceite agora.");
        return;
      }
      setAcceptNote(current => ({ ...current, [ticket.id]: "" }));
      setState("success");
      setMessage("Aceite registrado. O chamado foi encerrado e o histórico completo fica auditado.");
      if (activeAccount) loadTickets(activeAccount.id);
    } catch {
      setState("error");
      setMessage("Não foi possível conectar agora. Tente novamente em instantes.");
    } finally {
      setAcceptBusy(null);
    }
  };

  const reopenTicket = async (ticket: Ticket) => {
    const reason = (reopenReason[ticket.id] ?? "").trim();
    setReopenBusy(ticket.id);
    setState("idle");
    setMessage("");
    try {
      const response = await fetch(`/api/client/tickets/${ticket.id}/reopen`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setState("error");
        setMessage(openErrors[payload.error ?? ""] ?? "Não foi possível reabrir o chamado agora.");
        return;
      }
      setReopenReason(current => ({ ...current, [ticket.id]: "" }));
      setState("success");
      setMessage("Chamado reaberto. A equipe receberá a justificativa pelo histórico auditado.");
      if (activeAccount) loadTickets(activeAccount.id);
    } catch {
      setState("error");
      setMessage("Não foi possível conectar agora. Tente novamente em instantes.");
    } finally {
      setReopenBusy(null);
    }
  };

  if (loading) {
    return (
      <div className={appStyles.loadingWrapWide}>
        <span className={styles.spinner} aria-hidden="true" />
        Verificando sua sessão…
      </div>
    );
  }

  if (!activeAccount) {
    if (notice) {
      return (
        <section className={appStyles.sectionCard} aria-labelledby="tickets-title">
          <h2 id="tickets-title" className={appStyles.sectionTitle}>
            Chamados
          </h2>
          <p className={`${styles.message} ${styles.messageError}`} role="alert">
            <span>{notice}</span>
            <button className={appStyles.retryButton} type="button" onClick={() => reload()}>
              <RotateCw size={13} aria-hidden="true" />
              Tentar novamente
            </button>
          </p>
        </section>
      );
    }
    return (
      <div className={appStyles.emptyState}>
        Sua identidade ainda não foi vinculada a um cadastro de cliente. Assim que o vínculo for liberado,
        você poderá abrir e acompanhar chamados por aqui.
      </div>
    );
  }

  return (
    <>
      <section className={appStyles.sectionCard} aria-labelledby="tickets-title">
        <span className={styles.badge}>
          <Headphones size={12} aria-hidden="true" />
          {activeAccount.display_name}
        </span>
        <h2 id="tickets-title" className={appStyles.sectionTitle}>
          Abrir novo chamado
        </h2>
        <p className={appStyles.sectionHint}>
          Este é o canal interno de atendimento, complementar aos canais que você já conhece. Cada
          chamado fica registrado com a data e o acompanhamento da equipe.
        </p>
        {activeAccount.status !== "active" ? (
          <div className={appStyles.suspendedNote}>
            Cadastro {activeAccount.status === "suspended" ? "suspenso" : "encerrado"}. Novos chamados só podem ser
            abertos com o cadastro regularizado.
          </div>
        ) : (
          <form className={appStyles.formGrid} onSubmit={submit} noValidate>
            <div className={styles.field}>
              <label htmlFor="ticket-category">Assunto</label>
              <select
                id="ticket-category"
                className={appStyles.select}
                value={category}
                onChange={event => setCategory(event.target.value)}
              >
                {TICKET_CATEGORIES.map(item => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="ticket-title">Título</label>
              <input
                id="ticket-title"
                value={title}
                maxLength={120}
                onChange={event => setTitle(event.target.value)}
                placeholder="Resumo do que está acontecendo"
                required
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="ticket-details">Descrição (máx. 500 caracteres)</label>
              <textarea
                id="ticket-details"
                className={appStyles.textarea}
                value={details}
                maxLength={500}
                onChange={event => setDetails(event.target.value)}
                placeholder="Detalhe o contexto: datas, locais e nomes ajudam a equipe a responder mais rápido."
                required
              />
              <span className={appStyles.charCounter}>{details.trim().length}/500</span>
            </div>
            <button className={styles.submit} type="submit" disabled={state === "submitting"}>
              <Send size={15} aria-hidden="true" />
              {state === "submitting" ? "Registrando…" : "Registrar chamado"}
            </button>
            {message ? (
              <p
                className={`${styles.message} ${state === "success" ? styles.messageSuccess : styles.messageError}`}
                role="status"
              >
                {message}
              </p>
            ) : null}
          </form>
        )}
      </section>

      <section className={appStyles.sectionCard} aria-labelledby="tickets-list-title">
        <h2 id="tickets-list-title" className={appStyles.sectionTitle}>
          Seus chamados
        </h2>
        <p className={appStyles.sectionHint}>
          Histórico de solicitações deste cadastro, na ordem da mais recente para a mais antiga.
        </p>
        {!activeAccount || activeAccount.status !== "active" ? null : loadError ? (
          <p className={`${styles.message} ${styles.messageError}`} role="alert">
            <span>{loadError}</span>
            <button
              className={appStyles.retryButton}
              type="button"
              onClick={() => activeAccount && loadTickets(activeAccount.id)}
            >
              <RotateCw size={13} aria-hidden="true" />
              Tentar novamente
            </button>
          </p>
        ) : !tickets ? (
          <div className={appStyles.loadingWrapWide}>
            <span className={styles.spinner} aria-hidden="true" />
            Carregando chamados…
          </div>
        ) : tickets.length === 0 ? (
          <div className={appStyles.emptyState}>
            Você ainda não abriu chamados para este cadastro. Use o formulário acima quando precisar.
          </div>
        ) : (
          <ul className={appStyles.list}>
            {tickets.map(ticket => {
              const status = ticketStatus[ticket.status];
              return (
                <li key={ticket.id} className={appStyles.listItem}>
                  <div className={appStyles.listItemMain}>
                    <p className={appStyles.listItemTitle}>{ticket.title}</p>
                    <p className={appStyles.listItemMeta}>
                      {ticket.category} · Aberto em {new Date(ticket.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <span className={`${appStyles.chip} ${status.chip}`}>{status.text}</span>
                  <p className={appStyles.listItemDetail}>{ticket.details}</p>
                  {(ticket.messages ?? []).length > 0 ? (
                    <div className={appStyles.responseBox}>
                      <strong>Trilha do atendimento</strong>
                      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                        {(ticket.messages ?? []).map((entry, index) => (
                          <li key={`${ticket.id}-msg-${index}`} style={{ marginTop: index === 0 ? 0 : 8 }}>
                            <strong>{messageKindLabel[entry.kind]}</strong>
                            {entry.author_name ? ` · ${entry.author_name}` : ""} ·{" "}
                            {new Date(entry.created_at).toLocaleString("pt-BR")}
                            <br />
                            {entry.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : ticket.admin_response ? (
                    <div className={appStyles.responseBox}>
                      <strong>Resposta da equipe</strong>
                      {ticket.admin_response}
                    </div>
                  ) : null}
                  {ticket.sla_paused_at ? (
                    <div className={appStyles.responseBox}>
                      <strong>SLA pausado</strong>
                      A equipe marcou este chamado como aguardando cliente em {new Date(ticket.sla_paused_at).toLocaleString("pt-BR")}.
                    </div>
                  ) : null}
                  {ticket.status === "resolved" ? (
                    <div className={appStyles.inlineAction}>
                      <textarea
                        className={appStyles.textarea}
                        value={acceptNote[ticket.id] ?? ""}
                        maxLength={1000}
                        onChange={event => setAcceptNote(current => ({ ...current, [ticket.id]: event.target.value }))}
                        placeholder="Comentário do aceite (opcional, 5 a 1000 caracteres)"
                        aria-label={`Comentário do aceite do chamado ${ticket.title}`}
                      />
                      <button
                        type="button"
                        className={styles.submit}
                        disabled={acceptBusy === ticket.id}
                        onClick={() => void acceptTicket(ticket)}
                      >
                        <Send size={13} aria-hidden="true" />
                        {acceptBusy === ticket.id ? "Registrando…" : "Aceitar atendimento e encerrar"}
                      </button>
                    </div>
                  ) : null}
                  {ticket.status === "resolved" || ticket.status === "closed" ? (
                    <div className={appStyles.inlineAction}>
                      <textarea
                        className={appStyles.textarea}
                        value={reopenReason[ticket.id] ?? ""}
                        maxLength={500}
                        onChange={event => setReopenReason(current => ({ ...current, [ticket.id]: event.target.value }))}
                        placeholder="Motivo da reabertura (mín. 10 caracteres)"
                        aria-label={`Motivo para reabrir chamado ${ticket.title}`}
                      />
                      <button
                        type="button"
                        className={appStyles.retryButton}
                        disabled={reopenBusy === ticket.id}
                        onClick={() => void reopenTicket(ticket)}
                      >
                        <RotateCw size={13} aria-hidden="true" />
                        {reopenBusy === ticket.id ? "Reabrindo…" : "Reabrir chamado"}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
