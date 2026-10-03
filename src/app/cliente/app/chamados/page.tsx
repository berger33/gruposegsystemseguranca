"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Headphones, Send } from "lucide-react";
import { TICKET_CATEGORIES } from "@/lib/client-space-core.mjs";
import { useClientSpace } from "../ClientSpaceProvider";
import styles from "../../RealAccess.module.css";
import appStyles from "../ClientApp.module.css";

type Ticket = {
  id: string;
  category: string;
  title: string;
  details: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  created_at: string;
  updated_at: string;
  admin_response: string | null;
};

const ticketStatus: Record<Ticket["status"], { text: string; chip: string }> = {
  open: { text: "Aberto", chip: appStyles.chipOpen },
  in_progress: { text: "Em atendimento", chip: appStyles.chipProgress },
  resolved: { text: "Resolvido", chip: appStyles.chipResolved },
  closed: { text: "Encerrado", chip: appStyles.chipClosed },
};

const openErrors: Record<string, string> = {
  ticket_category_invalid: "Escolha um assunto da lista.",
  ticket_title_required: "Informe um título para o chamado.",
  ticket_title_too_long: "O título deve ter no máximo 120 caracteres.",
  ticket_details_required: "Descreva o que aconteceu para a equipe poder ajudar.",
  ticket_details_too_long: "A descrição deve ter no máximo 500 caracteres.",
  idempotency_conflict: "Este envio mudou desde a última tentativa. Revise os dados e envie novamente.",
  forbidden: "Este cadastro não permite abrir chamados no momento.",
};

export default function ClientTicketsPage() {
  const { activeAccount, loading } = useClientSpace();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [category, setCategory] = useState<string>(TICKET_CATEGORIES[0] as string);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const retryRequest = useRef<{ fingerprint: string; key: string } | null>(null);
  const loadSequence = useRef(0);

  const loadTickets = useCallback((accountId: string) => {
    const sequence = ++loadSequence.current;
    setTickets(null);
    setLoadError("");
    fetch(`/api/client/tickets?account=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("unexpected");
        const data = (await response.json()) as { tickets: Ticket[] };
        if (sequence === loadSequence.current) setTickets(data.tickets);
      })
      .catch(() => {
        if (sequence === loadSequence.current) setLoadError("Não foi possível carregar seus chamados agora.");
      });
  }, []);

  useEffect(() => {
    if (!activeAccount || activeAccount.status !== "active") {
      loadSequence.current += 1;
      setTickets(null);
      setLoadError("");
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

  if (loading) {
    return (
      <div className={appStyles.loadingWrapWide}>
        <span className={styles.spinner} aria-hidden="true" />
        Verificando sua sessão…
      </div>
    );
  }

  if (!activeAccount) {
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
          <div className={`${styles.message} ${styles.messageError}`} role="alert" data-testid="tickets-load-error">
            <span>{loadError}</span>
            <button className={styles.submit} type="button" onClick={() => loadTickets(activeAccount.id)}>
              Tentar novamente
            </button>
          </div>
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
                  {ticket.admin_response ? (
                    <div className={appStyles.responseBox}>
                      <strong>Resposta da equipe</strong>
                      {ticket.admin_response}
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
