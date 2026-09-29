"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, Badge, btn, btnPrimary, card, colors, ErrorBox, fmtDate, fmtDay, input, label, Notice, SectionTitle } from "./crm-ui";

type Visit = {
  id: string; title: string; status: string; scheduled_at: string; duration_minutes: number | null;
  company_id: string; company_name: string | null; participants: string[]; notes: string | null;
  opportunity_title: string | null; contact_name: string | null;
};

const STATUS_TONE: Record<string, string> = {
  solicitada: "neutral", em_agendamento: "warn", confirmada: "info", realizada: "ok", cancelada: "bad",
};

const ACTIONS: Record<string, [string, string][]> = {
  solicitada: [["agendar", "Agendar"], ["confirmar", "Confirmar"], ["cancelar", "Cancelar"]],
  em_agendamento: [["confirmar", "Confirmar"], ["reagendar", "Reagendar"], ["cancelar", "Cancelar"]],
  confirmada: [["realizar", "Marcar realizada"], ["reagendar", "Reagendar"], ["cancelar", "Cancelar"]],
  realizada: [],
  cancelada: [],
};

export default function CrmAgendaTab() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [companies, setCompanies] = useState<{ id: string; display_name: string }[]>([]);
  const [filter, setFilter] = useState({ status: "", mine: false, upcomingOnly: true });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rescheduleFor, setRescheduleFor] = useState<string | null>(null);
  const [newDate, setNewDate] = useState("");

  // Guarda de resposta atrasada: sem isto, a busca de um filtro antigo
  // pode chegar depois e sobrescrever o resultado do filtro atual.
  const requestSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++requestSeq.current;

    setError("");
    try {
      const params = new URLSearchParams();
      if (filter.status) params.set("status", filter.status);
      if (filter.mine) params.set("responsible", "me");
      if (filter.upcomingOnly) params.set("from", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
      params.set("limit", "200");
      const data = await apiFetch(`/api/crm/visits?${params.toString()}`);
      if (seq !== requestSeq.current) return;
      setVisits(data.visits || []);
    } catch (e: any) { setError(e.message); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch("/api/crm/companies?limit=200");
        setCompanies(data.companies || []);
      } catch { /* lista auxiliar */ }
    })();
  }, []);

  async function createVisit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(""); setNotice("");
    try {
      const participantsRaw = String(fd.get("participants") || "").trim();
      await apiFetch("/api/crm/visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: fd.get("company_id"),
          title: fd.get("title"),
          scheduled_at: fd.get("scheduled_at"),
          duration_minutes: fd.get("duration_minutes") ? Number(fd.get("duration_minutes")) : undefined,
          participants: participantsRaw ? participantsRaw.split(",").map((p) => p.trim()).filter(Boolean) : undefined,
          notes: fd.get("notes") || undefined,
        }),
      });
      setNotice("Visita criada em agendamento — precisa de confirmação para valer como compromisso (CRM-08).");
      form.reset();
      await load();
    } catch (e: any) { setError(e.message); }
  }

  async function act(visit: Visit, action: string) {
    setError(""); setNotice("");
    if ((action === "reagendar" || action === "agendar") && rescheduleFor !== visit.id) {
      setRescheduleFor(visit.id);
      setNewDate("");
      return;
    }
    try {
      const body: Record<string, unknown> = { action };
      if (action === "reagendar" || action === "agendar") {
        if (!newDate) { setError("informe a nova data antes de reagendar"); return; }
        body.scheduled_at = new Date(newDate).toISOString();
      }
      await apiFetch(`/api/crm/visits/${visit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setNotice(action === "reagendar"
        ? "Visita reagendada — volta para 'em agendamento' e exige nova confirmação (CRM-08)."
        : `Visita "${visit.title}": ${action}.`);
      setRescheduleFor(null);
      setNewDate("");
      await load();
    } catch (e: any) { setError(e.message); }
  }

  const groups = visits.reduce<Record<string, Visit[]>>((acc, v) => {
    const key = fmtDay(v.scheduled_at);
    (acc[key] ||= []).push(v);
    return acc;
  }, {});

  return (
    <>
      <section style={card}>
        <SectionTitle title="Agendar visita (CRM-08)" hint="Responsável vem da sessão; participantes, confirmação, reagendamento e cancelamento ficam registrados nas observações." />
        <ErrorBox error={error} />
        <Notice>{notice}</Notice>
        <form onSubmit={createVisit} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
            <label style={label}>Empresa*
              <select required name="company_id" style={input} defaultValue="">
                <option value="" disabled>selecione</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
              </select>
            </label>
            <label style={label}>Título*<input required name="title" style={input} placeholder="ex.: vistoria técnica" /></label>
            <label style={label}>Data e hora*<input required name="scheduled_at" type="datetime-local" style={input} /></label>
            <label style={label}>Duração (min)<input name="duration_minutes" type="number" min={15} max={480} step={15} style={input} /></label>
            <label style={label}>Participantes (separados por vírgula)<input name="participants" style={input} /></label>
            <label style={label}>Observações<input name="notes" style={input} /></label>
          </div>
          <div><button type="submit" style={btnPrimary}>Criar visita</button></div>
        </form>
      </section>

      <section style={card}>
        <SectionTitle title={`Agenda (${visits.length})`} hint="Agrupada por dia, com filtros de situação e responsável." />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
          <select aria-label="Filtrar por situação" style={input} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
            <option value="">Todas as situações</option>
            <option value="solicitada">Solicitada</option><option value="em_agendamento">Em agendamento</option>
            <option value="confirmada">Confirmada</option><option value="realizada">Realizada</option><option value="cancelada">Cancelada</option>
          </select>
          <label style={{ fontSize: 12, fontWeight: 600, color: colors.muted }}>
            <input type="checkbox" checked={filter.mine} onChange={(e) => setFilter({ ...filter, mine: e.target.checked })} /> Minhas
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, color: colors.muted }}>
            <input type="checkbox" checked={filter.upcomingOnly} onChange={(e) => setFilter({ ...filter, upcomingOnly: e.target.checked })} /> Só a partir de hoje
          </label>
        </div>

        {Object.entries(groups).map(([day, items]) => (
          <div key={day} style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 12, textTransform: "uppercase", color: colors.muted, margin: "0 0 6px" }}>{day}</h3>
            {items.map((v) => (
              <div key={v.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 10, marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <strong style={{ fontSize: 14 }}>{v.title}</strong>
                  <Badge tone={STATUS_TONE[v.status] || "neutral"}>{v.status}</Badge>
                  <span style={{ fontSize: 12, color: colors.muted }}>{fmtDate(v.scheduled_at)}{v.duration_minutes ? ` · ${v.duration_minutes} min` : ""}</span>
                </div>
                <div style={{ fontSize: 12, color: colors.muted, marginTop: 4, overflowWrap: "anywhere" }}>
                  {v.company_name || "empresa"}{v.opportunity_title ? ` · ${v.opportunity_title}` : ""}
                  {Array.isArray(v.participants) && v.participants.length > 0 ? ` · participantes: ${v.participants.join(", ")}` : ""}
                </div>
                {v.notes ? <pre style={{ fontSize: 11, color: colors.muted, whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{v.notes}</pre> : null}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
                  {(ACTIONS[v.status] || []).map(([action, text]) => (
                    <button key={action} style={btn} onClick={() => act(v, action)}>{text}</button>
                  ))}
                  {(ACTIONS[v.status] || []).length === 0 && <span style={{ fontSize: 11, color: colors.muted }}>estado final — sem novas transições</span>}
                  {rescheduleFor === v.id && (
                    <>
                      <input aria-label="Nova data e hora" type="datetime-local" style={input} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                      <button style={btnPrimary} onClick={() => act(v, v.status === "solicitada" ? "agendar" : "reagendar")}>Confirmar nova data</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
        {visits.length === 0 && <p style={{ fontSize: 13, color: colors.muted }}>Nenhuma visita para este filtro.</p>}
      </section>
    </>
  );
}
