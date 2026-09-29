"use client";
import { useEffect, useMemo, useState } from "react";

// CRM-08 — agenda pessoal: visitas em que a identidade autenticada é
// responsável ou participante convidado. Nenhuma outra agenda é exposta.
//
// Visão de calendário por semana (residual de CRM-08, ver
// docs/PROMPT-CONTINUACAO-CRM-AGENDA-CALENDARIO.md): reaproveita o MESMO
// endpoint /api/crm/visits/agenda com from/to, sem rota nova e sem mudança de
// autorização. É somente leitura — confirmar/recusar continua na lista.

type AgendaVisit = {
  id: string; opportunity_id: string | null; title: string; status: string; scheduled_at: string;
  duration_minutes: number | null; version: number; cancel_reason: string | null; reschedule_count: number;
  viewer_is_responsible: boolean; company_name: string | null;
  participant_count: number; confirmed_count: number; viewer_response: string | null;
};

const statusLabels: Record<string, string> = {
  solicitada: "Solicitada", em_agendamento: "Em agendamento", confirmada: "Confirmada",
  realizada: "Realizada", cancelada: "Cancelada",
};
const errors: Record<string, string> = {
  admin_session_required: "Entre novamente na área administrativa.",
  commercial_role_required: "Seu perfil não permite usar a agenda comercial.",
  invalid_range: "Informe um período válido.",
  invalid_pagination: "A página solicitada é inválida.",
  visit_not_found: "A visita não está disponível para esta ação.",
  visit_version_conflict: "A visita mudou em outra tela. Atualize a agenda antes de tentar novamente.",
  visit_status_final: "A visita já foi concluída ou cancelada.",
  crm_visits_unavailable: "Não foi possível consultar a agenda agora.",
};

const WEEKDAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function pad2(value: number) { return String(value).padStart(2, "0"); }
function dateLabel(date: Date) { return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`; }
function fullDateLabel(date: Date) { return `${dateLabel(date)}/${date.getFullYear()}`; }

/** Segunda-feira 00:00 local da semana deslocada por `weekOffset` semanas a partir de hoje. */
function mondayOf(weekOffset: number) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const day = now.getDay(); // 0=domingo..6=sábado
  const diffToMonday = day === 0 ? -6 : 1 - day;
  now.setDate(now.getDate() + diffToMonday + weekOffset * 7);
  return now;
}

export default function MyAgenda() {
  const [visits, setVisits] = useState<AgendaVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viewMode, setViewMode] = useState<"lista" | "semana">("lista");
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekVisits, setWeekVisits] = useState<AgendaVisit[]>([]);
  const [weekTotal, setWeekTotal] = useState(0);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekError, setWeekError] = useState("");

  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, { ...init, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(errors[data.error] || "Não foi possível concluir a operação.");
    return data;
  }
  async function load(quiet = false) {
    if (!quiet) { setLoading(true); setError(""); }
    try {
      const data = await request("/api/crm/visits/agenda?limit=25&offset=0");
      setVisits(data.visits);
    } catch (cause) {
      setVisits([]);
      setError(cause instanceof Error ? cause.message : "Falha ao consultar a agenda.");
    } finally { if (!quiet) setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const week = useMemo(() => {
    const monday = mondayOf(weekOffset);
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(date.getDate() + index);
      return date;
    });
    const sunday = new Date(days[6]);
    sunday.setHours(23, 59, 59, 999);
    return { monday, sunday, days };
  }, [weekOffset]);

  useEffect(() => {
    if (viewMode !== "semana") return;
    let cancelled = false;
    setWeekLoading(true); setWeekError("");
    request(`/api/crm/visits/agenda?limit=100&offset=0&from=${encodeURIComponent(week.monday.toISOString())}&to=${encodeURIComponent(week.sunday.toISOString())}`)
      .then(data => {
        if (cancelled) return;
        setWeekVisits(data.visits);
        setWeekTotal(data.pagination?.total ?? data.visits.length);
      })
      .catch(cause => {
        if (cancelled) return;
        setWeekVisits([]);
        setWeekTotal(0);
        setWeekError(cause instanceof Error ? cause.message : "Falha ao consultar a semana.");
      })
      .finally(() => { if (!cancelled) setWeekLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, weekOffset]);

  async function respond(visit: AgendaVisit, response: "confirmado" | "recusado") {
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/crm/opportunities/${visit.opportunity_id}/visits/${visit.id}/response`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_version: visit.version, response }),
      });
      await load(true);
      setNotice(response === "confirmado" ? "Presença confirmada." : "Presença recusada.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao responder."); }
    finally { setBusy(false); }
  }

  return (
    <section aria-label="Minha agenda de visitas e reuniões" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 16, overflowWrap: "anywhere" }}>
      <h2>Minha agenda de visitas e reuniões</h2>
      <p>Somente visitas em que você é responsável ou participante convidado, em ordem cronológica.</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div role="group" aria-label="Modo de visualização da agenda" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button type="button" aria-pressed={viewMode === "lista"} onClick={() => setViewMode("lista")}>Ver em lista</button>
        <button type="button" aria-pressed={viewMode === "semana"} onClick={() => setViewMode("semana")}>Ver por semana</button>
      </div>

      {viewMode === "lista" && (
        <>
          <button type="button" disabled={busy} onClick={() => void load()}>Atualizar minha agenda</button>
          {loading ? <p role="status">Carregando minha agenda…</p> : (
            <ul style={{ paddingLeft: 20 }}>
              {visits.length === 0 && <li>Nenhuma visita na sua agenda.</li>}
              {visits.map(visit => (
                <li key={visit.id} style={{ marginTop: 12 }}>
                  <article aria-label={`Agenda ${visit.title}`}>
                    <strong>{statusLabels[visit.status] || visit.status}: {visit.title}</strong>
                    <p>
                      {new Date(visit.scheduled_at).toLocaleString("pt-BR")}
                      {visit.company_name ? ` — ${visit.company_name}` : ""}
                      {visit.viewer_is_responsible ? " — você é o responsável" : " — você é participante"}
                    </p>
                    <p>Confirmações: {visit.confirmed_count}/{visit.participant_count}</p>
                    {!visit.viewer_is_responsible && visit.opportunity_id && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span>Sua resposta: {visit.viewer_response || "pendente"}</span>
                        <button type="button" disabled={busy || ["realizada", "cancelada"].includes(visit.status)} onClick={() => void respond(visit, "confirmado")}>Confirmar presença na agenda</button>
                        <button type="button" disabled={busy || ["realizada", "cancelada"].includes(visit.status)} onClick={() => void respond(visit, "recusado")}>Recusar presença na agenda</button>
                      </div>
                    )}
                  </article>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {viewMode === "semana" && (
        <section aria-label="Semana da agenda" style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" disabled={weekLoading} onClick={() => setWeekOffset(offset => offset - 1)}>Semana anterior</button>
            <button type="button" disabled={weekLoading || weekOffset === 0} onClick={() => setWeekOffset(0)}>Semana atual</button>
            <button type="button" disabled={weekLoading} onClick={() => setWeekOffset(offset => offset + 1)}>Próxima semana</button>
            <span>Semana de {fullDateLabel(week.monday)} a {fullDateLabel(week.days[6])}</span>
          </div>
          <p>Esta visão é somente leitura. Para confirmar, recusar, reagendar ou cancelar, use a lista.</p>
          {weekError && <p role="alert">{weekError}</p>}
          {weekLoading ? <p role="status">Carregando a semana…</p> : (
            <>
              {weekTotal > weekVisits.length && (
                <p role="status">Há mais compromissos do que os exibidos nesta semana.</p>
              )}
              <div style={{ display: "grid", gap: 8 }}>
                {week.days.map(day => {
                  const dayVisits = weekVisits.filter(visit => {
                    const scheduled = new Date(visit.scheduled_at);
                    return scheduled.getFullYear() === day.getFullYear()
                      && scheduled.getMonth() === day.getMonth()
                      && scheduled.getDate() === day.getDate();
                  });
                  const label = `Dia da agenda ${WEEKDAY_NAMES[day.getDay()]} ${dateLabel(day)}`;
                  return (
                    <article key={day.toISOString()} aria-label={label} style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: 8 }}>
                      <strong>{WEEKDAY_NAMES[day.getDay()]} — {dateLabel(day)}</strong>
                      {dayVisits.length === 0 ? (
                        <p>Nenhuma visita nesse dia.</p>
                      ) : (
                        <ul style={{ paddingLeft: 20, margin: "4px 0 0" }}>
                          {dayVisits.map(visit => (
                            <li key={visit.id}>
                              {new Date(visit.scheduled_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                              {" — "}{statusLabels[visit.status] || visit.status}: {visit.title}
                              {visit.company_name ? ` — ${visit.company_name}` : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}
    </section>
  );
}
