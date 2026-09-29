"use client";
import { useEffect, useState } from "react";

// CRM-08 — agenda pessoal: visitas em que a identidade autenticada é
// responsável ou participante convidado. Nenhuma outra agenda é exposta.

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

export default function MyAgenda() {
  const [visits, setVisits] = useState<AgendaVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
    </section>
  );
}
