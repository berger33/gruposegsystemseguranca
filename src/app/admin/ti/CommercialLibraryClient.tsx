"use client";
import { useEffect, useState } from "react";

export default function CommercialLibraryClient() {
  const [library, setLibrary] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [comparisons, setComparisons] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [libForm, setLibForm] = useState({ title: "", type: "apresentacao", description: "", category: "", file_url: "", tags: "" });
  const [campForm, setCampForm] = useState({ name: "", description: "", segment_type: "setor", segment_filter: "{}", start_date: "", end_date: "" });
  const [compForm, setCompForm] = useState({ title: "", proposal_ids: "" });

  async function load() {
    const [lib, camp, comp] = await Promise.all([
      fetch("/api/crm/commercial-library?limit=100").then(r => r.json()),
      fetch("/api/crm/campaigns?limit=100").then(r => r.json()),
      fetch("/api/crm/proposal-comparisons?limit=50").then(r => r.json()),
    ]);
    if (lib.library) setLibrary(lib.library);
    if (camp.campaigns) setCampaigns(camp.campaigns);
    if (comp.comparisons) setComparisons(comp.comparisons);
  }

  useEffect(() => { load(); }, []);

  async function createLibrary() {
    if (!libForm.title) { setMsg("Título obrigatório"); return; }
    const body = { title: libForm.title, type: libForm.type, description: libForm.description, category: libForm.category, file_url: libForm.file_url, tags: libForm.tags ? libForm.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [] };
    const r = await fetch("/api/crm/commercial-library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro criar biblioteca: ${j.error}`);
    else { setMsg(`Item biblioteca criado ${j.item.id} rascunho`); load(); }
  }

  async function approveLibrary(id: string) {
    const r = await fetch(`/api/crm/commercial-library/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "aprovado" }) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro aprovar: ${j.error}`);
    else { setMsg(`Item ${id} aprovado`); load(); }
  }

  async function createCampaign() {
    if (!campForm.name) { setMsg("Nome campanha obrigatório"); return; }
    let segFilter: any = {};
    try { segFilter = campForm.segment_filter ? JSON.parse(campForm.segment_filter) : {}; } catch { setMsg("segment_filter JSON inválido"); return; }
    const body = { name: campForm.name, description: campForm.description, segment_type: campForm.segment_type, segment_filter: segFilter, start_date: campForm.start_date || null, end_date: campForm.end_date || null };
    const r = await fetch("/api/crm/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro criar campanha: ${j.error}`);
    else { setMsg(`Campanha criada ${j.campaign.id}`); load(); }
  }

  async function createComparison() {
    if (!compForm.title || !compForm.proposal_ids) { setMsg("Título e proposal_ids obrigatórios"); return; }
    const ids = compForm.proposal_ids.split(",").map((s: string) => s.trim()).filter(Boolean);
    if (ids.length < 2 || ids.length > 5) { setMsg("proposal_ids deve ter 2 a 5 UUIDs separados por vírgula"); return; }
    const body = { title: compForm.title, proposal_ids: ids };
    const r = await fetch("/api/crm/proposal-comparisons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro comparação: ${j.error} ${j.found ? `encontrados ${j.found}/${j.requested}` : ""}`);
    else { setMsg(`Comparação criada ${j.comparison.id} com ${j.comparison.comparison_data?.proposals?.length} propostas`); load(); }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
      <h2>CRM-26 — Biblioteca comercial, apresentações/cases aprovados, campanhas segmentadas e comparação de propostas</h2>
      <p style={{ fontSize: 12, color: "#555" }}>Biblioteca com tipos apresentacao/case/documento/video/planilha/imagem/outro, status rascunho/em_revisao/aprovado/rejeitado/arquivado, aprovação com approved_by/at/role, rejection_reason. Campanhas segmentadas por setor/cidade/tipo_empresa/campanha/origem/responsavel/outro com segment_filter JSONB, library_ids, targets idempotentes. Comparação de propostas 2-5 lado a lado com custos, preços, margem, escopo e itens.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <h4>Biblioteca comercial</h4>
          <input placeholder="título *" value={libForm.title} onChange={e => setLibForm({ ...libForm, title: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <select value={libForm.type} onChange={e => setLibForm({ ...libForm, type: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="apresentacao">apresentacao</option>
            <option value="case">case</option>
            <option value="documento">documento</option>
            <option value="video">video</option>
            <option value="planilha">planilha</option>
            <option value="imagem">imagem</option>
            <option value="outro">outro</option>
          </select>
          <input placeholder="categoria" value={libForm.category} onChange={e => setLibForm({ ...libForm, category: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="file_url" value={libForm.file_url} onChange={e => setLibForm({ ...libForm, file_url: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="tags separadas por vírgula" value={libForm.tags} onChange={e => setLibForm({ ...libForm, tags: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <textarea placeholder="descrição" value={libForm.description} onChange={e => setLibForm({ ...libForm, description: e.target.value })} style={{ width: "100%", minHeight: 50, marginBottom: 4 }} />
          <button onClick={createLibrary}>Criar item biblioteca</button>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 8 }}>
            <thead><tr><th>título</th><th>tipo</th><th>status</th><th>categoria</th><th>versão</th><th>ação</th></tr></thead>
            <tbody>{library.map((l: any) => (
              <tr key={l.id} style={{ background: l.status === "aprovado" ? "#e6ffe6" : l.status === "rejeitado" ? "#ffe6e6" : "transparent" }}>
                <td>{l.title}</td><td>{l.type}</td><td>{l.status}</td><td>{l.category || "-"}</td><td>v{l.version}</td>
                <td>{l.status !== "aprovado" && <button onClick={() => approveLibrary(l.id)}>Aprovar</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>

        <div>
          <h4>Campanhas segmentadas</h4>
          <input placeholder="nome *" value={campForm.name} onChange={e => setCampForm({ ...campForm, name: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <select value={campForm.segment_type} onChange={e => setCampForm({ ...campForm, segment_type: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="setor">setor</option><option value="cidade">cidade</option><option value="tipo_empresa">tipo_empresa</option><option value="campanha">campanha</option><option value="origem">origem</option><option value="responsavel">responsavel</option><option value="outro">outro</option>
          </select>
          <input placeholder='segment_filter JSON ex {"cidade":"São Paulo"}' value={campForm.segment_filter} onChange={e => setCampForm({ ...campForm, segment_filter: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="start_date YYYY-MM-DD" value={campForm.start_date} onChange={e => setCampForm({ ...campForm, start_date: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="end_date YYYY-MM-DD" value={campForm.end_date} onChange={e => setCampForm({ ...campForm, end_date: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <textarea placeholder="descrição" value={campForm.description} onChange={e => setCampForm({ ...campForm, description: e.target.value })} style={{ width: "100%", minHeight: 50, marginBottom: 4 }} />
          <button onClick={createCampaign}>Criar campanha</button>
          <ul style={{ fontSize: 11 }}>{campaigns.map((c: any) => <li key={c.id}>{c.name} {c.segment_type} {JSON.stringify(c.segment_filter)} {c.status} {c.start_date || ""}→{c.end_date || ""}</li>)}</ul>

          <h4 style={{ marginTop: 16 }}>Comparação de propostas (2-5)</h4>
          <input placeholder="título comparação *" value={compForm.title} onChange={e => setCompForm({ ...compForm, title: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="proposal_ids separados por vírgula UUIDs" value={compForm.proposal_ids} onChange={e => setCompForm({ ...compForm, proposal_ids: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <button onClick={createComparison}>Comparar propostas</button>
          <ul style={{ fontSize: 11 }}>{comparisons.map((c: any) => <li key={c.id}>{c.title} {c.proposal_ids?.length} propostas min R$ {c.comparison_data?.summary?.min_price} max R$ {c.comparison_data?.summary?.max_price} range R$ {c.comparison_data?.summary?.price_range}</li>)}</ul>
        </div>
      </div>

      {msg && <div style={{ marginTop: 8, fontSize: 12 }}>{msg}</div>}
    </section>
  );
}
