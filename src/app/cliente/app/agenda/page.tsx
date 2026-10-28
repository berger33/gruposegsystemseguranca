"use client";
import {workspaceResponse,workspaceFetch} from "@/lib/workspace-response";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, RotateCw } from "lucide-react";
import { useClientSpace } from "../ClientSpaceProvider";
import styles from "../../RealAccess.module.css";
import appStyles from "../ClientApp.module.css";

type VisitStatus = "scheduled" | "confirmed" | "rescheduled" | "completed" | "cancelled" | "no_show";
type VisitType = "technical" | "maintenance" | "inspection" | "meeting" | "other";

type Visit = {
  id: string;
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

// UX-PRO-ID3: a leitura pertence a uma conta. Sem isso, trocar de A para B
// deixava os dados de A visíveis durante a consulta de B e permitia que uma
// resposta antiga de A substituísse o resultado de B.
type VisitRead = { accountId: string; visits: Visit[]; readAt: string };
type VisitReadError = { accountId: string; message: string };

const visitStatus: Record<VisitStatus, { text: string; chip: string }> = {
  scheduled: { text: "Agendada", chip: appStyles.chipProgress },
  confirmed: { text: "Confirmada", chip: appStyles.chipResolved },
  rescheduled: { text: "Reagendada", chip: appStyles.chipProgress },
  completed: { text: "Realizada", chip: appStyles.chipResolved },
  cancelled: { text: "Cancelada", chip: appStyles.chipClosed },
  no_show: { text: "Não compareceu", chip: appStyles.chipClosed },
};

const visitTypeLabel: Record<VisitType, string> = {
  technical: "Visita técnica",
  maintenance: "Manutenção",
  inspection: "Vistoria",
  meeting: "Reunião",
  other: "Outro",
};

const actionErrors: Record<string, string> = {
  visit_rescheduled_to_invalid: "Informe a nova data/hora desejada.",
  visit_reschedule_reason_required: "Informe o motivo do reagendamento com pelo menos 10 caracteres.",
  visit_final_status: "Esta visita já foi finalizada ou cancelada.",
  client_visit_action_not_allowed: "Esta ação não está disponível no portal do cliente.",
};

function toDateTimeLocal(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatReadTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "horário não informado" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function ClientAgendaPage() {
  const { activeAccount, loading, notice, reload } = useClientSpace();
  const [read, setRead] = useState<VisitRead | null>(null);
  const [readError, setReadError] = useState<VisitReadError | null>(null);
  const [readLoading, setReadLoading] = useState(false);
  const latestRequest = useRef(0);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "success" | "error">("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [reschedule, setReschedule] = useState<Record<string, { rescheduledTo: string; reason: string }>>({});

  const loadVisits = useCallback(async (accountId: string) => {
    const requestId = ++latestRequest.current;
    setReadLoading(true);
    setReadError(null);
    try {
      const response = await workspaceFetch(`/api/client/visits?account=${encodeURIComponent(accountId)}`, { cache: "no-store" });
      const data = (await workspaceResponse(response)) as { visits: Visit[] };
      // Um 200 com corpo inesperado não é "nenhuma visita": é uma falha de leitura.
      if (!Array.isArray(data.visits)) throw new Error("A resposta da agenda não trouxe a lista de visitas. Tente novamente.");
      if (requestId !== latestRequest.current) return;
      setRead({ accountId, visits: data.visits, readAt: new Date().toISOString() });
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      setReadError({ accountId, message: error instanceof Error ? error.message : "Não foi possível carregar a agenda agora." });
    } finally {
      if (requestId !== latestRequest.current) return;
      setReadLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeAccount || activeAccount.status !== "active") {
      latestRequest.current += 1;
      setRead(null);
      setReadError(null);
      setReadLoading(false);
      return;
    }
    void loadVisits(activeAccount.id);
  }, [activeAccount, loadVisits]);

  const currentRead = activeAccount?.id === read?.accountId ? read : null;
  const currentError = activeAccount?.id === readError?.accountId ? readError : null;

  async function updateVisit(visit: Visit, status: "confirmed" | "rescheduled") {
    const draft = reschedule[visit.id] ?? { rescheduledTo: toDateTimeLocal(visit.scheduled_at), reason: "" };
    setBusy(visit.id);
    setMessage("");
    try {
      const response = await workspaceFetch(`/api/client/visits/${visit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(status === "confirmed" ? { status } : { status, ...draft }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setState("error");
        setMessage(actionErrors[payload.error ?? ""] ?? "Não foi possível atualizar a agenda agora.");
        return;
      }
      setState("success");
      setMessage(status === "confirmed" ? "Visita confirmada." : "Solicitação de reagendamento registrada no histórico.");
      if (activeAccount) void loadVisits(activeAccount.id);
    } catch {
      setState("error");
      setMessage("Não foi possível conectar agora. Tente novamente em instantes.");
    } finally {
      setBusy(null);
    }
  }

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
        <section className={appStyles.sectionCard} aria-labelledby="agenda-title">
          <h2 id="agenda-title" className={appStyles.sectionTitle}>Agenda</h2>
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
    return <div className={appStyles.emptyState}>Sua identidade ainda não foi vinculada a um cadastro de cliente.</div>;
  }

  return (
    <section className={appStyles.sectionCard} aria-labelledby="agenda-title" aria-busy={readLoading}>
      <span className={styles.badge}>
        <CalendarClock size={12} aria-hidden="true" />
        {activeAccount.display_name}
      </span>
      <h2 id="agenda-title" className={appStyles.sectionTitle}>Agenda de visitas e manutenções</h2>
      <p className={appStyles.sectionHint}>
        Confirme visitas agendadas ou solicite reagendamento com motivo. A resposta fica registrada no histórico auditado.
      </p>
      {activeAccount.scope_note ? <p className={appStyles.scopeNote}>Recorte do vínculo: {activeAccount.scope_note}</p> : null}
      {message ? (
        <p className={`${styles.message} ${state === "success" ? styles.messageSuccess : styles.messageError}`} role="status">
          {message}
        </p>
      ) : null}
      {activeAccount.status !== "active" ? (
        <div className={appStyles.suspendedNote}>
          Cadastro {activeAccount.status === "suspended" ? "suspenso" : "encerrado"}. A agenda não é exibida enquanto a situação não é regularizada.
        </div>
      ) : (
        <>
          {currentError ? (
            <p className={`${styles.message} ${styles.messageError}`} role="alert">
              <span>{currentError.message}</span>
              <button className={appStyles.retryButton} type="button" onClick={() => void loadVisits(activeAccount.id)}>
                <RotateCw size={13} aria-hidden="true" />
                Tentar novamente
              </button>
            </p>
          ) : null}
          {currentError && currentRead ? (
            <p className={appStyles.sectionHint} role="status">
              Os dados abaixo são da Última leitura concluída às {formatReadTime(currentRead.readAt)}. A nova consulta falhou e nada foi apagado.
            </p>
          ) : null}
          {readLoading || !currentRead ? (
            <div className={appStyles.loadingWrapWide} role={currentError ? undefined : "status"}>
              <span className={styles.spinner} aria-hidden="true" />
              {currentError ? "Aguardando uma leitura concluída…" : "Carregando agenda…"}
            </div>
          ) : currentRead.visits.length === 0 ? (
            <div className={appStyles.emptyState}>Nenhuma visita ou manutenção agendada para este cadastro.</div>
          ) : (
            <ul className={appStyles.list}>
              {currentRead.visits.map(visit => {
                const status = visitStatus[visit.status];
                const draft = reschedule[visit.id] ?? { rescheduledTo: toDateTimeLocal(visit.scheduled_at), reason: "" };
                const finalStatus = ["completed", "cancelled", "no_show"].includes(visit.status);
                return (
                  <li key={visit.id} className={appStyles.listItem}>
                    <div className={appStyles.listItemMain}>
                      <p className={appStyles.listItemTitle}>{visit.title}</p>
                      <p className={appStyles.listItemMeta}>
                        {visitTypeLabel[visit.visit_type]} · {new Date(visit.scheduled_at).toLocaleString("pt-BR")}
                        {visit.responsible_name ? ` · ${visit.responsible_name}` : ""}
                      </p>
                    </div>
                    <span className={`${appStyles.chip} ${status.chip}`}>{status.text}</span>
                    {visit.details ? <p className={appStyles.listItemDetail}>{visit.details}</p> : null}
                    {visit.location ? <p className={appStyles.listItemDetail}>Local: {visit.location}</p> : null}
                    {visit.reschedule_reason ? <p className={appStyles.listItemDetail}>Último reagendamento: {visit.reschedule_reason}</p> : null}
                    {!finalStatus ? (
                      <div className={appStyles.inlineAction}>
                        <button className={appStyles.retryButton} type="button" disabled={busy === visit.id} onClick={() => void updateVisit(visit, "confirmed")}>
                          <CheckCircle2 size={13} aria-hidden="true" />
                          Confirmar
                        </button>
                        <input
                          className={appStyles.inputLike}
                          type="datetime-local"
                          value={draft.rescheduledTo}
                          onChange={event => setReschedule(current => ({ ...current, [visit.id]: { ...draft, rescheduledTo: event.target.value } }))}
                          aria-label={`Nova data para ${visit.title}`}
                        />
                        <textarea
                          className={appStyles.textarea}
                          value={draft.reason}
                          maxLength={500}
                          onChange={event => setReschedule(current => ({ ...current, [visit.id]: { ...draft, reason: event.target.value } }))}
                          placeholder="Motivo do reagendamento (mín. 10 caracteres)"
                        />
                        <button className={appStyles.retryButton} type="button" disabled={busy === visit.id} onClick={() => void updateVisit(visit, "rescheduled")}>
                          <RotateCw size={13} aria-hidden="true" />
                          Solicitar reagendamento
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
