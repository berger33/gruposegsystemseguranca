"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Badge, Notice, Section, SessionHint, apiJson, btn, btnPrimary, colors, fmtDate, input, label,
} from "./crm-ui";

type Visit = {
  id: string; title: string; status: string; scheduled_at: string; duration_minutes: number | null;
  company_name: string; opportunity_title: string | null; contact_name: string | null;
  responsible_display: string | null; participants: string[] | null; notes: string | null;
};

const ACTIONS: Record<string, { action: string; label: string; needsDate?: boolean }[]> = {
  solicitada: [
    { action: "agendar", label: "Agendar", needsDate: true },
    { action: "confirmar", label: "Confirmar" },
    { action: "cancelar", label: "Cancelar" },
  ],
  em_agendamento: [
    { action: "confirmar", label: "Confirmar" },
    { action: "reagendar", label: "Reagendar", needsDate: true },
    { action: "cancelar", label: "Cancelar" },
  ],
  confirmada: [
    { action: "realizar", label: "Marcar como realizada" },
    { action: "reagendar", label: "Reagendar", needsDate: true },
    { action: "cancelar", label: "Cancelar" },
  ],
  realizada: [],
  cancelada: [],
};

export default function CrmAgendaTab() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [companies, setCompanies] = useState<{ id: string; display_name: string }[]>([]);
  const [opps, setOpps] = useState<{ id: string; title: string }[]>([]);
  const [filter, setFilter] = useState({ status: "", mine: false, upcoming: true });
  const [pending, setPending] = useState<{ id: string; action: string } | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (filter.status) params.set("status", filter.status);
      if (filter.mine) params.set("responsible", "me");
      if (filter.upcoming) params.set("from", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
      params.set("limit", "200");
      const data = await apiJson(`/api/crm/visits?${params.toString()}`);
      setVisits(data.visits || []);
    } catch (e: any) { setError(e.message); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const c = await apiJson("/api/crm/companies?limit=200");
        setCompanies((c.companies || []).map((x: any) => ({ id: x.id, display_name: x.display_name })));
      } catch { /* auxiliar */ }
      try {
        const o = await apiJson("/api/crm/opportunities?limit=200");
        setOpps((o.opportunities || []).map((x: any) => ({ id: x.id, title: x.title })));
      } catch { /* auxiliar */ }
    })();
  }, []);

  async function createVisit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true); setError(""); setOk("");
    try {
      const participantsRaw = String(fd.get("participants") || "").trim();
      await apiJson("/api/crm/visits", {
        method: "POST",
        body: JSON.stringify({
          company_id: fd.get("company_id"),
          opportunity_id: fd.get("opportunity_id") || undefined,
          title: fd.get("title"),
          scheduled_at: fd.get("scheduled_at"),
          duration_minutes: fd.get("duration_minutes") || undefined,
          participants: participantsRaw ? participantsRaw.split(",").map((p) => p.trim()).filter(Boolean) : undefined,
          notes: fd.get("notes") || undefined,
        }),
      });
      setOk("Visita criada em agendamento — confirme com o cliente para passar a confirmada.");
      form.reset();
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function act(visit: Visit, action: string, form?: HTMLFormElement) {
    setBusy(true); setError(""); setOk("");
    try {
      const body: Record<string, unknown> = { action };
      if (form) {
        const fd = new FormData(form);
        const when = fd.get("scheduled_at");
        const reason = fd.get("reason");
        if (when) body.scheduled_at = when;
        if (reason) body.reason = reason;
      }
      const data = await apiJson(`/api/crm/visits/${visit.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setOk(
        action === "reagendar"
          ? "Visita reagendada — voltou para 'em agendamento' porque exige nova confirmação do cliente."
          : `Visita agora está ${data.visit?.status}.`
      );
      setPending(null);
      await load();
    } catch (e: any) {
      const payload = (e as any).payload;
      setError(payload?.current ? `Ação recusada: visita em "${payload.current}" não aceita "${payload.action}".` : e.message);
    } finally { setBusy(false); }
  }

  const grouped = visits.reduce<Record<string, Visit[]>>((acc, v) => {
    const day = new Date(v.scheduled_at).toLocaleDateString("pt-BR");
    (acc[day] = acc[day] || []).push(v);
    return acc;
  }, {});

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Section
        title="Agendar visita (CRM-08)"
        hint="A visita nasce em 'em agendamento'. Confirmação, reagendamento e cancelamento ficam registrados na própria visita e na auditoria — nada é dado como confirmado sem ação explícita."
      >
        <form onSubmit={createVisit} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            <label style={label}>Empresa*
              <select required name="company_id" defaultValue="" style={input}>
                <option value="" disabled>selecione…</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
              </select>
            </label>
            <label style={label}>Oportunidade (opcional)
              <select name="opportunity_id" defaultValue="" style={input}>
                <option value="">—</option>
                {opps.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
              </select>
            </label>
            <label style={label}>Título*<input required name="title" maxLength={200} style={input} /></label>
            <label style={label}>Data e hora*<input required name="scheduled_at" type="datetime-local" style={input} /></label>
            <label style={label}>Duração (min)<input name="duration_minutes" type="number" min={15} max={480} step={15} style={input} /></label>
            <label style={label}>Participantes<input name="participants" maxLength={400} style={input} placeholder="separados por vírgula" /></label>
          </div>
          <label style={label}>Observações<textarea name="notes" maxLength={2000} style={{ ...input, minHeight: 50, width: "100%", boxSizing: "border-box" }} /></label>
          <div><button type="submit" disabled={busy} style={btnPrimary}>Criar visita</button></div>
        </form>
        {error && <Notice kind="erro">{error}</Notice>}
        {error && <SessionHint error={error} />}
        {ok && <Notice kind="ok">{ok}</Notice>}
      </Section>

      <Section title={`Agenda (${visits.length})`} hint="Ordenada por data. Reagendar sempre exige nova confirmação.">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <select aria-label="Filtrar por situação da visita" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} style={input}>
            <option value="">todas as situações</option>
            <option value="solicitada">solicitada</option><option value="em_agendamento">em agendamento</option>
            <option value="confirmada">confirmada</option><option value="realizada">realizada</option>
            <option value="cancelada">cancelada</option>
          </select>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
            <input type="checkbox" checked={filter.mine} onChange={(e) => setFilter({ ...filter, mine: e.target.checked })} /> minhas
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
            <input type="checkbox" checked={filter.upcoming} onChange={(e) => setFilter({ ...filter, upcoming: e.target.checked })} /> só a partir de ontem
          </label>
          <button onClick={load} style={btn}>Atualizar</button>
        </div>

        {Object.keys(grouped).length === 0 && <p style={{ fontSize: 12.5, color: colors.muted }}>Nenhuma visita na agenda com esses filtros.</p>}

        <div style={{ display: "grid", gap: 14 }}>
          {Object.entries(grouped).map(([day, items]) => (
            <div key={day}>
              <h3 style={{ fontSize: 13, margin: "0 0 8px", color: colors.muted }}>{day}</h3>
              <div style={{ display: "grid", gap: 8 }}>
                {items.map((v) => (
                  <article key={v.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between" }}>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ fontSize: 14 }}>{v.title}</strong>
                        <div style={{ fontSize: 12, color: colors.muted }}>
                          {v.company_name}{v.opportunity_title ? ` · ${v.opportunity_title}` : ""} · {fmtDate(v.scheduled_at, true)}
                          {v.duration_minutes ? ` · ${v.duration_minutes} min` : ""}
                        </div>
                        {Array.isArray(v.participants) && v.participants.length > 0 && (
                          <div style={{ fontSize: 11.5, color: colors.muted }}>Participantes: {v.participants.join(", ")}</div>
                        )}
                      </div>
                      <Badge tone={v.status === "confirmada" ? "ok" : v.status === "cancelada" ? "bad" : v.status === "realizada" ? "ok" : "warn"}>{v.status}</Badge>
                    </div>

                    {v.notes && <pre style={{ margin: "8px 0 0", fontSize: 11.5, color: colors.muted, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{v.notes}</pre>}

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      {(ACTIONS[v.status] || []).map((a) => (
                        <button
                          key={a.action}
                          onClick={() => (a.needsDate ? setPending({ id: v.id, action: a.action }) : act(v, a.action))}
                          disabled={busy}
                          style={btn}
                        >
                          {a.label}
                        </button>
                      ))}
                      {(ACTIONS[v.status] || []).length === 0 && <span style={{ fontSize: 11.5, color: colors.muted }}>estado final — crie uma nova visita se precisar retomar</span>}
                    </div>

                    {pending?.id === v.id && (
                      <form
                        onSubmit={(e) => { e.preventDefault(); act(v, pending.action, e.currentTarget); }}
                        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10, borderTop: `1px solid ${colors.border}`, paddingTop: 10 }}
                      >
                        <label style={label}>Nova data e hora*<input required name="scheduled_at" type="datetime-local" style={input} /></label>
                        <label style={{ ...label, minWidth: 220 }}>Motivo<input name="reason" maxLength={500} style={input} /></label>
                        <button type="submit" disabled={busy} style={btnPrimary}>Confirmar {pending.action}</button>
                        <button type="button" onClick={() => setPending(null)} style={btn}>Cancelar</button>
                      </form>
                    )}
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
