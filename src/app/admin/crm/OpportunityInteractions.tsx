"use client";
import { useEffect, useState, type FormEvent } from "react";

type Interaction = { id: string; type: string; title: string; details: string | null; occurred_at: string; created_at: string };
const typeLabels: Record<string, string> = { ligacao: "Ligação", reuniao: "Reunião", nota: "Nota" };
const errors: Record<string, string> = {
  opportunity_not_found: "Histórico disponível apenas para o responsável por esta oportunidade.",
  admin_session_required: "Entre novamente na área administrativa.",
  commercial_role_required: "Seu perfil não permite registrar interações comerciais.",
  invalid_type: "Selecione ligação, reunião ou nota.",
  invalid_title: "Informe um título válido (até 200 caracteres).",
  invalid_details: "Detalhes inválidos (até 5000 caracteres).",
  invalid_occurred_at: "Informe uma data/hora válida, sem data futura.",
  crm_interactions_unavailable: "Não foi possível salvar ou consultar o histórico. Confira a lista antes de repetir.",
};
export default function OpportunityInteractions({ opportunityId }: { opportunityId: string }) {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState("ligacao");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const endpoint = "/api/crm/opportunities/" + opportunityId + "/interactions";

  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, { ...init, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(errors[data.error] || "Não foi possível concluir a operação.");
    return data;
  }
  useEffect(() => {
    let active = true;
    request(endpoint).then(data => { if (active) setInteractions(data.interactions); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [endpoint]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const body: Record<string, unknown> = { type, title, details: details || undefined };
      if (occurredAt) {
        const date = new Date(occurredAt);
        if (!Number.isFinite(date.getTime())) { setError("Informe uma data/hora válida."); setBusy(false); return; }
        body.occurred_at = date.toISOString();
      }
      const data = await request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      setInteractions(items => [data.interaction, ...items]);
      setTitle(""); setDetails(""); setOccurredAt(""); setNotice("Interação registrada.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  }
  return (
    <section aria-label="Histórico de interações da oportunidade" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 16, overflowWrap: "anywhere" }}>
      <h2>Histórico de interações da oportunidade</h2>
      <p>Ligações, reuniões e notas registradas por quem responde por esta oportunidade.</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading ? <p role="status">Carregando histórico…</p> : (
        <>
          <form onSubmit={create} style={{ display: "grid", gap: 12 }}>
            <label htmlFor="interaction-type">Tipo</label>
            <select id="interaction-type" value={type} onChange={e => setType(e.target.value)} style={{ display: "block", width: "100%" }}>
              <option value="ligacao">Ligação</option>
              <option value="reuniao">Reunião</option>
              <option value="nota">Nota</option>
            </select>
            <label>Título<input value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} style={{ display: "block", width: "100%", boxSizing: "border-box" }} /></label>
            <label>Detalhes (opcional)<textarea value={details} onChange={e => setDetails(e.target.value)} maxLength={5000} style={{ display: "block", width: "100%", boxSizing: "border-box" }} /></label>
            <label>Data/hora (opcional, padrão agora)<input type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)} style={{ display: "block", maxWidth: "100%" }} /></label>
            <button disabled={busy} type="submit">Registrar interação</button>
          </form>
          <p>Até 200 interações recentes por oportunidade.</p>
          {interactions.length === 0 && <p>Nenhuma interação registrada ainda.</p>}
          <ul style={{ paddingLeft: 20 }}>
            {interactions.map(item => <li key={item.id} style={{ marginTop: 12 }}>
              <strong>{typeLabels[item.type] || item.type}: {item.title}</strong>
              <p>{new Date(item.occurred_at).toLocaleString("pt-BR")}</p>
              {item.details && <p>{item.details}</p>}
            </li>)}
          </ul>
        </>
      )}
    </section>
  );
}
