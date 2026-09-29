"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, Badge, btn, btnPrimary, card, colors, ErrorBox, fmtDate, input, label, Notice, SectionTitle } from "./crm-ui";

type Interaction = {
  id: string; type: string; title: string; details: string | null; occurred_at: string;
  contact_name: string | null; attachment_count: number; opportunity_id: string | null;
};
type Attachment = { id: string; display_name: string; content_type: string | null; size_bytes: number; content_sha256: string; created_at: string };

const TYPE_TONE: Record<string, string> = { ligacao: "info", reuniao: "info", nota: "warn", email: "neutral", whatsapp: "neutral", visita: "ok", outro: "neutral" };

export default function CrmHistoricoTab() {
  const [companies, setCompanies] = useState<{ id: string; display_name: string }[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [attachments, setAttachments] = useState<Record<string, Attachment[]>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch("/api/crm/companies?limit=200");
        setCompanies(data.companies || []);
        if (!companyId && data.companies?.length) setCompanyId(data.companies[0].id);
      } catch (e: any) { setError(e.message); }
    })();
    // seleção inicial só na montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!companyId) { setInteractions([]); return; }
    setError("");
    try {
      const params = new URLSearchParams({ company_id: companyId, limit: "100" });
      if (typeFilter) params.set("type", typeFilter);
      const data = await apiFetch(`/api/crm/interactions?${params.toString()}`);
      setInteractions(data.interactions || []);
      setOpen({});
      setAttachments({});
    } catch (e: any) { setError(e.message); }
  }, [companyId, typeFilter]);

  useEffect(() => { load(); }, [load]);

  async function createInteraction(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(""); setNotice("");
    try {
      await apiFetch("/api/crm/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          type: fd.get("type"),
          title: fd.get("title"),
          details: fd.get("details") || undefined,
          occurred_at: fd.get("occurred_at") || undefined,
        }),
      });
      setNotice("Registro incluído no histórico. Notas internas só são visíveis para staff autenticado.");
      form.reset();
      await load();
    } catch (e: any) { setError(e.message); }
  }

  async function toggleAttachments(id: string) {
    const willOpen = !open[id];
    setOpen((prev) => ({ ...prev, [id]: willOpen }));
    if (!willOpen || attachments[id]) return;
    try {
      const data = await apiFetch(`/api/crm/interactions/${id}/attachments`);
      setAttachments((prev) => ({ ...prev, [id]: data.attachments || [] }));
    } catch (e: any) { setError(e.message); }
  }

  async function uploadAttachment(e: React.ChangeEvent<HTMLInputElement>, interactionId: string) {
    const fileInput = e.currentTarget;
    const file = fileInput.files?.[0];
    if (!file) return;
    setError(""); setNotice("");
    try {
      const buf = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const contentBase64 = btoa(binary);
      await apiFetch(`/api/crm/interactions/${interactionId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: file.name, content_type: file.type || "application/octet-stream", contentBase64 }),
      });
      setNotice(`Anexo "${file.name}" armazenado com hash conferido no download (integridade).`);
      const data = await apiFetch(`/api/crm/interactions/${interactionId}/attachments`);
      setAttachments((prev) => ({ ...prev, [interactionId]: data.attachments || [] }));
      setOpen((prev) => ({ ...prev, [interactionId]: true }));
      await load();
    } catch (err: any) {
      setError(err.message === "attachment_too_large" ? "attachment_too_large — limite de 5 MB por anexo" : err.message);
    } finally {
      try { fileInput.value = ""; } catch { /* input já desmontado */ }
    }
  }

  return (
    <>
      <section style={card}>
        <SectionTitle title="Histórico de ligações, reuniões e notas (CRM-07)" hint="Escolha a empresa para ver a linha do tempo; anexos ficam fora do banco com hash conferido no download." />
        <ErrorBox error={error} />
        <Notice>{notice}</Notice>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <label style={label}>Empresa
            <select style={input} value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">selecione</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
            </select>
          </label>
          <label style={label}>Tipo
            <select style={input} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">Todos</option>
              <option value="ligacao">Ligação</option><option value="reuniao">Reunião</option><option value="email">E-mail</option>
              <option value="whatsapp">WhatsApp</option><option value="visita">Visita</option><option value="nota">Nota interna</option><option value="outro">Outro</option>
            </select>
          </label>
        </div>

        <form onSubmit={createInteraction} style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label style={label}>Tipo*
            <select required name="type" style={input} defaultValue="ligacao">
              <option value="ligacao">Ligação</option><option value="reuniao">Reunião</option><option value="email">E-mail</option>
              <option value="whatsapp">WhatsApp</option><option value="visita">Visita</option><option value="nota">Nota interna (só staff)</option><option value="outro">Outro</option>
            </select>
          </label>
          <label style={label}>Título*<input required name="title" style={input} /></label>
          <label style={label}>Detalhes<input name="details" style={input} /></label>
          <label style={label}>Quando<input name="occurred_at" type="datetime-local" style={input} /></label>
          <div style={{ alignSelf: "end" }}><button type="submit" style={btnPrimary} disabled={!companyId}>Registrar</button></div>
        </form>
      </section>

      <section style={card}>
        <SectionTitle title={`Linha do tempo (${interactions.length})`} />
        {interactions.map((i) => (
          <div key={i.id} style={{ borderLeft: `3px solid ${colors.border}`, paddingLeft: 10, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Badge tone={TYPE_TONE[i.type] || "neutral"}>{i.type}</Badge>
              <strong style={{ fontSize: 14 }}>{i.title}</strong>
              <span style={{ fontSize: 12, color: colors.muted }}>{fmtDate(i.occurred_at)}</span>
              {i.contact_name ? <span style={{ fontSize: 12, color: colors.muted }}>· {i.contact_name}</span> : null}
            </div>
            {i.details ? <p style={{ fontSize: 13, margin: "6px 0 0", overflowWrap: "anywhere" }}>{i.details}</p> : null}
            <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button style={btn} onClick={() => toggleAttachments(i.id)}>
                Anexos ({i.attachment_count ?? 0})
              </button>
              <label style={{ fontSize: 12, color: colors.muted }}>
                anexar arquivo
                <input type="file" style={{ marginLeft: 6, fontSize: 12 }} onChange={(e) => uploadAttachment(e, i.id)} />
              </label>
            </div>
            {open[i.id] && (
              <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 12 }}>
                {(attachments[i.id] || []).map((a) => (
                  <li key={a.id}>
                    <a href={`/api/crm/interaction-attachments/${a.id}/download`}>{a.display_name}</a>{" "}
                    <span style={{ color: colors.muted }}>({a.size_bytes} bytes · sha256 {a.content_sha256.slice(0, 12)}…)</span>
                  </li>
                ))}
                {(attachments[i.id] || []).length === 0 && <li style={{ color: colors.muted }}>sem anexos</li>}
              </ul>
            )}
          </div>
        ))}
        {interactions.length === 0 && <p style={{ fontSize: 13, color: colors.muted }}>Nenhum registro para esta empresa.</p>}
      </section>
    </>
  );
}
