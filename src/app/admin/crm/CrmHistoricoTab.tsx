"use client";
import { useEffect, useState } from "react";
import {
  Badge, Notice, Section, SessionHint, apiJson, btn, btnPrimary, colors, fmtDate, input, label,
} from "./crm-ui";

type Interaction = {
  id: string; type: string; title: string; details: string | null; occurred_at: string;
  contact_name: string | null; author_display: string | null; attachment_count: number;
  opportunity_id: string | null;
};
type Attachment = {
  id: string; display_name: string; content_type: string | null; size_bytes: number;
  content_sha256: string; uploaded_by_role: string | null; created_at: string;
};

const TYPES = ["ligacao", "reuniao", "email", "whatsapp", "visita", "nota", "outro"];

export default function CrmHistoricoTab() {
  const [companies, setCompanies] = useState<{ id: string; display_name: string }[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [attachments, setAttachments] = useState<Record<string, Attachment[]>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const c = await apiJson("/api/crm/companies?limit=200");
        const list = (c.companies || []).map((x: any) => ({ id: x.id, display_name: x.display_name }));
        setCompanies(list);
        if (!companyId && list[0]) setCompanyId(list[0].id);
      } catch (e: any) { setError(e.message); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (companyId) load(companyId, typeFilter); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [companyId, typeFilter]);

  async function load(cid: string, type: string) {
    setError("");
    try {
      const params = new URLSearchParams({ company_id: cid, limit: "100" });
      if (type) params.set("type", type);
      const data = await apiJson(`/api/crm/interactions?${params.toString()}`);
      setInteractions(data.interactions || []);
      setOpen({});
      setAttachments({});
    } catch (e: any) { setError(e.message); }
  }

  async function createInteraction(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true); setError(""); setOk("");
    try {
      await apiJson("/api/crm/interactions", {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId,
          type: fd.get("type"),
          title: fd.get("title"),
          details: fd.get("details") || undefined,
          occurred_at: fd.get("occurred_at") || undefined,
        }),
      });
      setOk("Registro adicionado ao histórico.");
      form.reset();
      await load(companyId, typeFilter);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function toggleAttachments(interactionId: string) {
    const isOpen = !!open[interactionId];
    setOpen({ ...open, [interactionId]: !isOpen });
    if (isOpen || attachments[interactionId]) return;
    try {
      const data = await apiJson(`/api/crm/interactions/${interactionId}/attachments`);
      setAttachments((prev) => ({ ...prev, [interactionId]: data.attachments || [] }));
    } catch (e: any) { setError(e.message); }
  }

  async function uploadAttachment(e: React.ChangeEvent<HTMLInputElement>, interactionId: string) {
    const fileInput = e.currentTarget; // capturado antes do await
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Anexo acima de 5 MB não é aceito."); fileInput.value = ""; return; }
    setBusy(true); setError(""); setOk("");
    try {
      const buffer = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      await apiJson(`/api/crm/interactions/${interactionId}/attachments`, {
        method: "POST",
        body: JSON.stringify({
          display_name: file.name,
          content_type: file.type || undefined,
          contentBase64: btoa(binary),
        }),
      });
      setOk(`Anexo "${file.name}" guardado com hash de integridade.`);
      fileInput.value = "";
      const data = await apiJson(`/api/crm/interactions/${interactionId}/attachments`);
      setAttachments((prev) => ({ ...prev, [interactionId]: data.attachments || [] }));
      setOpen((prev) => ({ ...prev, [interactionId]: true }));
      await load(companyId, typeFilter);
      setOpen((prev) => ({ ...prev, [interactionId]: true }));
    } catch (e: any) {
      setError(e.message === "attachment_too_large" ? "Anexo acima de 5 MB não é aceito." : e.message);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Section
        title="Histórico de relacionamento (CRM-07)"
        hint="Ligações, reuniões, e-mails, visitas e notas internas ficam no mesmo fio do tempo. Notas internas são visíveis só para staff autenticado; o cliente nunca as vê no portal."
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
          <label style={{ ...label, minWidth: 240 }}>Empresa
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} style={input}>
              <option value="" disabled>selecione…</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
            </select>
          </label>
          <label style={label}>Tipo
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={input}>
              <option value="">todos</option>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <button onClick={() => companyId && load(companyId, typeFilter)} style={btn}>Atualizar</button>
        </div>

        <form onSubmit={createInteraction} style={{ display: "grid", gap: 10, borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            <label style={label}>Tipo*
              <select name="type" defaultValue="ligacao" style={input}>
                {TYPES.map((t) => <option key={t} value={t}>{t === "nota" ? "nota interna (só staff)" : t}</option>)}
              </select>
            </label>
            <label style={label}>Assunto*<input required name="title" maxLength={200} style={input} /></label>
            <label style={label}>Quando<input name="occurred_at" type="datetime-local" style={input} /></label>
          </div>
          <label style={label}>Detalhes<textarea name="details" maxLength={5000} style={{ ...input, minHeight: 60, width: "100%", boxSizing: "border-box" }} /></label>
          <div><button type="submit" disabled={busy || !companyId} style={btnPrimary}>Registrar no histórico</button></div>
        </form>

        {error && <Notice kind="erro">{error}</Notice>}
        {error && <SessionHint error={error} />}
        {ok && <Notice kind="ok">{ok}</Notice>}
      </Section>

      <Section title={`Linha do tempo (${interactions.length})`} hint="Anexos são guardados fora do banco, com hash verificado no download: bytes adulterados são recusados.">
        {interactions.length === 0 && <p style={{ fontSize: 12.5, color: colors.muted }}>Sem registros para esta empresa.</p>}
        <div style={{ display: "grid", gap: 10 }}>
          {interactions.map((i) => (
            <article key={i.id} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 12, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ minWidth: 0 }}>
                  <Badge tone={i.type === "nota" ? "warn" : "neutral"}>{i.type === "nota" ? "nota interna" : i.type}</Badge>{" "}
                  <strong style={{ fontSize: 14 }}>{i.title}</strong>
                  <div style={{ fontSize: 11.5, color: colors.muted }}>
                    {fmtDate(i.occurred_at, true)} · registrado por {i.author_display || "staff"}
                    {i.contact_name ? ` · contato ${i.contact_name}` : ""}
                  </div>
                </div>
                <button onClick={() => toggleAttachments(i.id)} style={btn}>
                  Anexos ({i.attachment_count ?? 0})
                </button>
              </div>
              {i.details && <p style={{ margin: "8px 0 0", fontSize: 12.5, whiteSpace: "pre-wrap" }}>{i.details}</p>}

              {open[i.id] && (
                <div style={{ marginTop: 10, borderTop: `1px solid ${colors.border}`, paddingTop: 10 }}>
                  <ul style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: 12 }}>
                    {(attachments[i.id] || []).map((a) => (
                      <li key={a.id}>
                        <a href={`/api/crm/interaction-attachments/${a.id}/download`}>{a.display_name}</a>{" "}
                        <span style={{ color: colors.muted }}>
                          ({(a.size_bytes / 1024).toFixed(1)} kB · sha256 {a.content_sha256.slice(0, 12)}…)
                        </span>
                      </li>
                    ))}
                    {(attachments[i.id] || []).length === 0 && <li style={{ listStyle: "none", marginLeft: -18, color: colors.muted }}>Nenhum anexo.</li>}
                  </ul>
                  <label style={{ ...label, fontSize: 11.5 }}>
                    Anexar arquivo (até 5 MB)
                    <input type="file" onChange={(e) => uploadAttachment(e, i.id)} disabled={busy} />
                  </label>
                </div>
              )}
            </article>
          ))}
        </div>
      </Section>
    </div>
  );
}
