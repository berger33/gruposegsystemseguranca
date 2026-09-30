"use client";
import { useEffect, useState, type FormEvent } from "react";

// CRM-08 — agenda de visitas/reuniões da oportunidade.
// Responsável agenda, reagenda, confirma, conclui, cancela e convida.
// Participante convidado apenas visualiza e responde por si.
// O horário do responsável é exclusivo: sobreposição é recusada pelo servidor.
// Quando a oportunidade veio de um lead público (PUB-03), a situação da visita
// é propagada ao lead (PUB-04) e mostrada como selo nesta lista.

type Participant = {
  identity_id: string; display_name: string; email: string;
  response: "pendente" | "confirmado" | "recusado"; responded_at: string | null;
};
type Visit = {
  id: string; title: string; status: string; scheduled_at: string; duration_minutes: number | null;
  notes: string | null; contact_id: string | null; contact_name?: string | null; version: number;
  cancel_reason: string | null; cancelled_at: string | null; reschedule_count: number;
  rescheduled_at: string | null; created_at: string; updated_at: string;
  public_lead_id: string | null; lead_sync_status: string | null;
  participants: Participant[]; viewer_is_responsible: boolean; viewer_response: string | null;
};
type Contact = { id: string; display_name: string };
type Pagination = { limit: number; offset: number; total: number; nextOffset: number | null; previousOffset: number | null };

const statusLabels: Record<string, string> = {
  solicitada: "Solicitada", em_agendamento: "Em agendamento", confirmada: "Confirmada",
  realizada: "Realizada", cancelada: "Cancelada",
};
const responseLabels: Record<string, string> = {
  pendente: "pendente", confirmado: "confirmou", recusado: "recusou",
};
const errors: Record<string, string> = {
  opportunity_not_found: "Agenda disponível apenas para o responsável ou para quem foi convidado.",
  visit_not_found: "A visita não está disponível para esta ação.",
  admin_session_required: "Entre novamente na área administrativa.",
  commercial_role_required: "Seu perfil não permite usar a agenda comercial.",
  invalid_title: "Informe um título válido (até 200 caracteres).",
  invalid_scheduled_at: "Informe uma data/hora válida.",
  scheduled_at_must_be_future: "A visita precisa ser agendada para uma data futura.",
  invalid_duration: "A duração deve ficar entre 15 e 480 minutos.",
  invalid_notes: "Observações inválidas (até 2000 caracteres).",
  invalid_contact_id: "O contato informado é inválido.",
  contact_not_available: "Selecione um contato ativo da empresa desta oportunidade.",
  invalid_participants: "Revise os participantes convidados (máximo 10 e-mails válidos).",
  participant_not_available: "Não há identidade de staff ativa com esse e-mail.",
  participant_already_invited: "Esse participante já foi convidado.",
  participant_limit_reached: "A visita já tem o máximo de 10 participantes.",
  participant_not_found: "Esse participante não está mais na visita.",
  invalid_email: "Informe um e-mail válido.",
  invalid_response: "Resposta inválida.",
  invalid_status: "Situação inválida.",
  visit_status_conflict: "Essa transição de situação não é permitida.",
  visit_status_final: "A visita já foi concluída ou cancelada.",
  visit_version_conflict: "A visita mudou em outra tela. Atualize a agenda antes de tentar novamente.",
  visit_schedule_conflict: "Conflito de agenda: você já tem uma visita ocupando esse horário. Reagende ou cancele a outra antes.",
  cancel_reason_required: "Informe o motivo do cancelamento (mínimo 3 caracteres).",
  expected_version_required: "Atualize a agenda antes de alterar esta visita.",
  visit_update_required: "Nada a alterar nesta visita.",
  invalid_pagination: "A página solicitada é inválida.",
  crm_visits_unavailable: "Não foi possível concluir a operação. Confira a agenda antes de repetir.",
};

function localDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function asIso(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export default function OpportunityVisits({ opportunityId,onChanged }: { opportunityId: string; onChanged?:()=>void }) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isResponsible, setIsResponsible] = useState(false);
  const [pagination, setPagination] = useState<Pagination>({ limit: 25, offset: 0, total: 0, nextOffset: null, previousOffset: null });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [duration, setDuration] = useState("60");
  const [contactId, setContactId] = useState("");
  const [notes, setNotes] = useState("");
  const [participantEmails, setParticipantEmails] = useState("");
  const [rescheduling, setRescheduling] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const endpoint = "/api/crm/opportunities/" + opportunityId + "/visits";

  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, { ...init, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(errors[data.error] || "Não foi possível concluir a operação.");
    return data;
  }
  async function load(offset = 0, quiet = false) {
    if (!quiet) { setLoading(true); setError(""); }
    try {
      const data = await request(`${endpoint}?limit=25&offset=${offset}`);
      setVisits(data.visits);
      setContacts(data.contacts);
      setIsResponsible(Boolean(data.viewer?.is_responsible));
      setPagination(data.pagination);
    } catch (cause) {
      if (!quiet) { setVisits([]); setContacts([]); setError(cause instanceof Error ? cause.message : "Falha ao consultar."); }
    } finally { if (!quiet) setLoading(false); }
  }
  useEffect(() => { void load(0); }, [endpoint]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(work: () => Promise<string>) {
    setBusy(true); setError(""); setNotice("");
    try { setNotice(await work()); onChanged?.(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha na operação."); }
    finally { setBusy(false); }
  }

  async function schedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const iso = asIso(scheduledAt);
    if (!iso) { setError("Informe uma data/hora válida."); return; }
    const emails = participantEmails.split(/[,;\n]/).map(value => value.trim()).filter(Boolean);
    await act(async () => {
      await request(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, scheduled_at: iso, duration_minutes: Number(duration),
          contact_id: contactId || undefined, notes: notes || undefined,
          participant_emails: emails,
        }),
      });
      setTitle(""); setScheduledAt(""); setNotes(""); setContactId(""); setParticipantEmails("");
      await load(0, true);
      return "Visita agendada.";
    });
  }

  async function patch(visit: Visit, payload: Record<string, unknown>, message: string) {
    await act(async () => {
      await request(`${endpoint}/${visit.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_version: visit.version, ...payload }),
      });
      await load(pagination.offset, true);
      return message;
    });
  }

  async function reschedule(event: FormEvent<HTMLFormElement>, visit: Visit) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const iso = asIso(String(form.get("scheduledAt") || ""));
    if (!iso) { setError("Informe uma data/hora válida."); return; }
    await patch(visit, { scheduled_at: iso }, "Visita reagendada. As confirmações voltaram a pendente.");
    setRescheduling(null);
  }

  async function cancel(event: FormEvent<HTMLFormElement>, visit: Visit) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await patch(visit, { status: "cancelada", cancel_reason: String(form.get("cancelReason") || "") }, "Visita cancelada com motivo registrado.");
    setCancelling(null);
  }

  async function invite(event: FormEvent<HTMLFormElement>, visit: Visit) {
    event.preventDefault();
    const element = event.currentTarget;
    const email = String(new FormData(element).get("email") || "");
    await act(async () => {
      await request(`${endpoint}/${visit.id}/participants`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_version: visit.version, email }),
      });
      await load(pagination.offset, true);
      element.reset();
      return "Participante convidado.";
    });
  }

  async function removeParticipant(visit: Visit, participant: Participant) {
    await act(async () => {
      await request(`${endpoint}/${visit.id}/participants/${participant.identity_id}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_version: visit.version }),
      });
      await load(pagination.offset, true);
      return "Participante removido da visita.";
    });
  }

  async function respond(visit: Visit, response: "confirmado" | "recusado") {
    await act(async () => {
      await request(`${endpoint}/${visit.id}/response`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected_version: visit.version, response }),
      });
      await load(pagination.offset, true);
      return response === "confirmado" ? "Presença confirmada." : "Presença recusada.";
    });
  }

  return (
    <section aria-label="Agenda de visitas e reuniões da oportunidade" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 16, overflowWrap: "anywhere" }}>
      <h2>Agenda de visitas e reuniões da oportunidade</h2>
      <p>
        O responsável pela oportunidade agenda, reagenda, conclui e cancela. Participantes convidados
        veem apenas as visitas em que foram incluídos e respondem somente por si. Reagendar zera as confirmações.
        Duas visitas suas não podem ocupar o mesmo horário, e visitas vindas de um lead público atualizam o lead.
      </p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading ? <p role="status">Carregando agenda…</p> : (
        <>
          {isResponsible && (
            <form onSubmit={schedule} style={{ display: "grid", gap: 12 }}>
              <label htmlFor="visit-title">Título da visita</label>
              <input id="visit-title" value={title} onChange={event => setTitle(event.target.value)} required maxLength={200} style={{ width: "100%", boxSizing: "border-box" }} />
              <label htmlFor="visit-scheduled-at">Data e hora</label>
              <input id="visit-scheduled-at" type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} required style={{ display: "block", maxWidth: "100%" }} />
              <label htmlFor="visit-duration">Duração (minutos)</label>
              <select id="visit-duration" value={duration} onChange={event => setDuration(event.target.value)} style={{ display: "block", width: "100%" }}>
                {["30", "60", "90", "120", "180"].map(value => <option key={value} value={value}>{value}</option>)}
              </select>
              <label htmlFor="visit-contact">Contato da empresa (opcional)</label>
              <select id="visit-contact" value={contactId} onChange={event => setContactId(event.target.value)} style={{ display: "block", width: "100%" }}>
                <option value="">Sem contato vinculado</option>
                {contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.display_name}</option>)}
              </select>
              <label htmlFor="visit-notes">Observações (opcional)</label>
              <textarea id="visit-notes" value={notes} onChange={event => setNotes(event.target.value)} maxLength={2000} style={{ display: "block", width: "100%", boxSizing: "border-box" }} />
              <label htmlFor="visit-participants">Participantes por e-mail (opcional, separados por vírgula)</label>
              <input id="visit-participants" value={participantEmails} onChange={event => setParticipantEmails(event.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
              <button disabled={busy} type="submit">Agendar visita</button>
            </form>
          )}
          {!isResponsible && <p>Você participa desta agenda como convidado: pode confirmar ou recusar a própria presença.</p>}
          <div aria-label="Paginação da agenda" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            <span>{pagination.total === 0 ? "Nenhuma visita" : `Exibindo ${pagination.offset + 1}–${pagination.offset + visits.length} de ${pagination.total}`}</span>
            <button type="button" disabled={busy || pagination.previousOffset === null} onClick={() => void load(pagination.previousOffset ?? 0)}>Anterior</button>
            <button type="button" disabled={busy || pagination.nextOffset === null} onClick={() => void load(pagination.nextOffset ?? pagination.offset)}>Próxima</button>
            <button type="button" disabled={busy} onClick={() => void load(pagination.offset)}>Atualizar agenda</button>
          </div>
          {visits.length === 0 && <p>Nenhuma visita agendada ainda.</p>}
          <ul style={{ paddingLeft: 20 }}>
            {visits.map(visit => {
              const final = visit.status === "realizada" || visit.status === "cancelada";
              return (
                <li key={visit.id} style={{ marginTop: 16 }}>
                  <article aria-label={`Visita ${visit.title}`}>
                    <strong>{statusLabels[visit.status] || visit.status}: {visit.title}</strong>
                    <p>{new Date(visit.scheduled_at).toLocaleString("pt-BR")}{visit.duration_minutes ? ` — ${visit.duration_minutes} min` : ""}{visit.contact_name ? ` — Contato: ${visit.contact_name}` : ""}</p>
                    {visit.public_lead_id && (
                      <p>
                        Lead público vinculado (PUB-04)
                        {visit.lead_sync_status ? ` — situação propagada: ${statusLabels[visit.lead_sync_status] || visit.lead_sync_status}` : " — nada propagado ainda"}
                      </p>
                    )}
                    {visit.reschedule_count > 0 && <p>Reagendamentos: {visit.reschedule_count}</p>}
                    {visit.cancel_reason && <p>Motivo do cancelamento: {visit.cancel_reason}</p>}
                    {visit.notes && <p>{visit.notes}</p>}
                    <ul aria-label={`Participantes de ${visit.title}`}>
                      {visit.participants.length === 0 && <li>Sem participantes convidados.</li>}
                      {visit.participants.map(participant => (
                        <li key={participant.identity_id}>
                          {participant.display_name} ({participant.email}) — {responseLabels[participant.response]}
                          {visit.viewer_is_responsible && !final && (
                            <button disabled={busy} type="button" onClick={() => void removeParticipant(visit, participant)} style={{ marginLeft: 8 }}>
                              Remover participante
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                    {visit.viewer_is_responsible ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {!final && rescheduling === visit.id ? (
                          <form onSubmit={event => void reschedule(event, visit)} style={{ display: "grid", gap: 8 }}>
                            <label htmlFor={`reschedule-${visit.id}`}>Nova data e hora</label>
                            <input id={`reschedule-${visit.id}`} name="scheduledAt" type="datetime-local" defaultValue={localDateTime(visit.scheduled_at)} required />
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button disabled={busy} type="submit">Salvar reagendamento</button>
                              <button disabled={busy} type="button" onClick={() => setRescheduling(null)}>Cancelar reagendamento</button>
                            </div>
                          </form>
                        ) : !final && (
                          <button disabled={busy} type="button" onClick={() => { setRescheduling(visit.id); setCancelling(null); }}>Reagendar visita</button>
                        )}
                        {!final && visit.status !== "confirmada" && (
                          <button disabled={busy} type="button" onClick={() => void patch(visit, { status: "confirmada" }, "Visita confirmada.")}>Confirmar agendamento</button>
                        )}
                        {!final && (
                          <button disabled={busy} type="button" onClick={() => void patch(visit, { status: "realizada" }, "Visita marcada como realizada.")}>Marcar como realizada</button>
                        )}
                        {!final && (cancelling === visit.id ? (
                          <form onSubmit={event => void cancel(event, visit)} style={{ display: "grid", gap: 8 }}>
                            <label htmlFor={`cancel-${visit.id}`}>Motivo do cancelamento</label>
                            <input id={`cancel-${visit.id}`} name="cancelReason" required minLength={3} maxLength={500} />
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button disabled={busy} type="submit">Confirmar cancelamento</button>
                              <button disabled={busy} type="button" onClick={() => setCancelling(null)}>Manter visita</button>
                            </div>
                          </form>
                        ) : (
                          <button disabled={busy} type="button" onClick={() => { setCancelling(visit.id); setRescheduling(null); }}>Cancelar visita</button>
                        ))}
                        {!final && (
                          <form onSubmit={event => void invite(event, visit)} style={{ display: "grid", gap: 8 }}>
                            <label htmlFor={`invite-${visit.id}`}>Convidar participante por e-mail</label>
                            <input id={`invite-${visit.id}`} name="email" type="email" required maxLength={254} />
                            <button disabled={busy} type="submit">Convidar participante</button>
                          </form>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <span>Sua resposta: {responseLabels[visit.viewer_response || "pendente"]}</span>
                        <button disabled={busy || final} type="button" onClick={() => void respond(visit, "confirmado")}>Confirmar presença</button>
                        <button disabled={busy || final} type="button" onClick={() => void respond(visit, "recusado")}>Recusar presença</button>
                      </div>
                    )}
                  </article>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
