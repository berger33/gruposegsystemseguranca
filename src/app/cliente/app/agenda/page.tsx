"use client";
import {workspaceResponse,workspaceFetch} from "@/lib/workspace-response";

import { useCallback, useEffect, useState } from "react";
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

export default function ClientAgendaPage() {
  const { activeAccount, loading, notice, reload } = useClientSpace();
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "success" | "error">("idle");
  const [busy, setBusy] = useState<string | null>(null);
  const [reschedule, setReschedule] = useState<Record<string, { rescheduledTo: string; reason: string }>>({});

  const loadVisits = useCallback((accountId: string) => {
    setLoadError("");
    workspaceFetch(`/api/client/visits?account=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then(async response => {
        if (!response.ok) await workspaceResponse(response);
        const data = (await workspaceResponse(response)) as { visits: Visit[] };
        setVisits(data.visits);
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : "Não foi possível carregar a agenda agora."));
  }, []);

  useEffect(() => {
    if (!activeAccount || activeAccount.status !== "active") {
      setVisits(null);
      return;
    }
    loadVisits(activeAccount.id);
  }, [activeAccount, loadVisits]);

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
      if (activeAccount) loadVisits(activeAccount.id);
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
    <section className={appStyles.sectionCard} aria-labelledby="agenda-title">
      <span className={styles.badge}>
        <CalendarClock size={12} aria-hidden="true" />
        {activeAccount.display_name}
      </span>
      <h2 id="agenda-title" className={appStyles.sectionTitle}>Agenda de visitas e manutenções</h2>
      <p className={appStyles.sectionHint}>
        Confirme visitas agendadas ou solicite reagendamento com motivo. A resposta fica registrada no histórico auditado.
      </p>
      {message ? (
        <p className={`${styles.message} ${state === "success" ? styles.messageSuccess : styles.messageError}`} role="status">
          {message}
        </p>
      ) : null}
      {loadError ? (
        <p className={`${styles.message} ${styles.messageError}`} role="alert">
          <span>{loadError}</span>
          <button className={appStyles.retryButton} type="button" onClick={() => loadVisits(activeAccount.id)}>
            <RotateCw size={13} aria-hidden="true" />
            Tentar novamente
          </button>
        </p>
      ) : !visits ? (
        <div className={appStyles.loadingWrapWide}>
          <span className={styles.spinner} aria-hidden="true" />
          Carregando agenda…
        </div>
      ) : visits.length === 0 ? (
        <div className={appStyles.emptyState}>Nenhuma visita ou manutenção agendada para este cadastro.</div>
      ) : (
        <ul className={appStyles.list}>
          {visits.map(visit => {
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
    </section>
  );
}
