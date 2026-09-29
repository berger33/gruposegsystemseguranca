"use client";
import { useEffect, useState } from "react";
import OpportunityTasks from "./OpportunityTasks";
import OpportunityInteractions from "./OpportunityInteractions";
import OpportunityVisits from "./OpportunityVisits";
import MyAgenda from "./MyAgenda";
import CadenceClient from "./CadenceClient";

type Company = { id: string; display_name: string; type: string; city: string; segment: string | null; status: string; responsible_name: string | null; };
type Opportunity = { id: string; title: string; company_id: string; stage: string; priority: string; estimated_value: string | null; next_action: string | null; next_action_date: string | null; is_won: boolean; is_lost: boolean; };
type ImportRow = { row_number: number; raw_data: any; mapped_data: any; status: string; errors: any[]; dedup_match: any; };

export default function CrmPage() {
  const [selectedOpportunity, setSelectedOpportunity] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [filter, setFilter] = useState({ type: "", stage: "" });
  const [form, setForm] = useState({ displayName: "", city: "", type: "prospect", segment: "" });
  const [error, setError] = useState("");
  const [csvContent, setCsvContent] = useState("");
  const [fileName, setFileName] = useState("empresas.csv");
  const [importPreview, setImportPreview] = useState<{ batchId: string; fileName?: string; report: any; rows: ImportRow[]; totalRows: number; previewTruncated: boolean } | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [importLoading, setImportLoading] = useState(false);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (filter.type) params.set("type", filter.type);
      const res = await fetch(`/api/crm/companies?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setCompanies(data.companies || []);
    } catch (e:any) { setError(e.message); }

    try {
      const params = new URLSearchParams();
      if (filter.stage) params.set("stage", filter.stage);
      const res = await fetch(`/api/crm/opportunities?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setOpps(data.opportunities || []);
    } catch {}
  }

  useEffect(() => { load(); }, [filter]);

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/crm/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: form.displayName, city: form.city, type: form.type, segment: form.segment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setForm({ displayName: "", city: "", type: "prospect", segment: "" });
      await load();
    } catch (e:any) { setError(e.message); }
  }

  async function convertLead() {
    const leadId = prompt("ID do lead (UUID) para converter em contato/oportunidade preservando histórico (CRM-04):");
    if (!leadId) return;
    const companyName = prompt("Nome da empresa para criar ou vincular (se deixar vazio, usa nome do lead):");
    try {
      const res = await fetch(`/api/crm/leads/${leadId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ create_company: true, company_name: companyName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha conversão");
      alert(`Convertido: oportunidade ${data.opportunityId} ${data.dedup ? "(já existia, dedup)" : ""}`);
      await load();
    } catch (e:any) { alert(e.message); }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setCsvContent(text);
  }

  async function previewImport() {
    if (!csvContent.trim()) { alert("Cole ou carregue CSV"); return; }
    setImportLoading(true);
    setError("");
    setImportResult(null);
    try {
      const res = await fetch("/api/crm/imports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, csvContent, type: "companies" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha preview");
      setImportPreview(data);
    } catch (e:any) { setError(e.message); }
    finally { setImportLoading(false); }
  }

  async function commitImport() {
    if (!importPreview) return;
    setImportLoading(true);
    try {
      const res = await fetch(`/api/crm/imports/${importPreview.batchId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha commit");
      setImportResult(data);
      await load();
    } catch (e:any) { setError(e.message); }
    finally { setImportLoading(false); }
  }

  async function exportCompanies() {
    try {
      const res = await fetch("/api/crm/companies/export", { cache: "no-store" });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || "falha export"); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `empresas-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e:any) { alert(e.message); }
  }

  const stages = ["novo","qualificacao","vistoria","proposta_elaboracao","proposta_enviada","negociacao","ganho","perdido"];

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      <h1>CRM — Empresas, contatos e funil (CRM-01..10 + CRM-03 import)</h1>
      <p style={{ fontSize: 13, opacity: 0.8 }}>Cadastro central de empresas e contatos com tipo prospect/cliente/parceiro sem duplicar entidade (CRM-01), contato com função decisor/influenciador/usuario/financeiro (CRM-02), importar CSV com prévia, validação por linha, mapeamento, relatório, deduplicação revisável e prevenção fórmula maliciosa na exportação (CRM-03), converter lead preservando histórico com deduplicação (CRM-04), oportunidades com serviço, necessidade, responsável, unidade, previsão, valor estimado, próxima ação/data, origem, prioridade, motivo perda (CRM-05), funil novo→qualificação→vistoria→proposta_elaboração→enviada→negociação→ganho/perdido com motivo obrigatório perda e reabertura auditada, não tratar ganho como dinheiro recebido (CRM-06).</p>

      <section style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Nova empresa (CRM-01)</h2>
        <form onSubmit={createCompany} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <input placeholder="Nome empresa" value={form.displayName} onChange={e=>setForm({...form, displayName: e.target.value})} required maxLength={200} style={{ padding: 6, minWidth: 200 }} />
          <input placeholder="Cidade" value={form.city} onChange={e=>setForm({...form, city: e.target.value})} maxLength={100} style={{ padding: 6 }} />
          <input placeholder="Segmento" value={form.segment} onChange={e=>setForm({...form, segment: e.target.value})} maxLength={100} style={{ padding: 6 }} />
          <select value={form.type} onChange={e=>setForm({...form, type: e.target.value})} style={{ padding: 6 }}>
            <option value="prospect">prospect</option>
            <option value="client">client</option>
            <option value="partner">partner</option>
          </select>
          <button type="submit" style={{ padding: "6px 12px" }}>Criar</button>
          <button type="button" onClick={convertLead} style={{ padding: "6px 12px" }}>Converter lead (CRM-04)</button>
          <button type="button" onClick={exportCompanies} style={{ padding: "6px 12px" }}>Exportar CSV (CRM-03 prevenção fórmula)</button>
        </form>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </section>

      <section style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 8, background: "#f9fafb" }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Importar CSV (CRM-03)</h2>
        <p style={{ fontSize: 12, opacity: 0.7 }}>Prévia, validação por linha, mapeamento automático, relatório, deduplicação revisável (document_ref exact + display_name ILIKE) e prevenção de fórmula maliciosa na exportação (OWASP: prefixo ' para = + - @). Máx 5000 linhas, 800KB. Campos suportados: Nome/display_name, CNPJ/document_ref, Segmento/segment, Cidade/city, Estado/state, Tipo/type (prospect/client/partner), Email/email, Telefone/phone, Origem/origin, Campanha/campaign, Responsável/responsible_name, Observação/notes.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
          <input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
          <input placeholder="Nome arquivo" value={fileName} onChange={e=>setFileName(e.target.value)} style={{ padding: 6, minWidth: 200 }} />
          <button onClick={previewImport} disabled={importLoading} style={{ padding: "6px 12px" }}>{importLoading ? "Processando..." : "Prévia (CRM-03)"}</button>
          {importPreview && <button onClick={commitImport} disabled={importLoading} style={{ padding: "6px 12px", background: "#16a34a", color: "#fff" }}>Confirmar importação {importPreview.report.valid} válidas</button>}
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: 12 }}>Ou cole CSV (primeira linha cabeçalhos):</label>
          <textarea value={csvContent} onChange={e=>setCsvContent(e.target.value)} placeholder={"display_name,document_ref,city,segment,type\nEmpresa A,123,Barueri,Segurança,prospect\nEmpresa B,456,Osasco,Condomínio,client"} style={{ width: "100%", minHeight: 100, fontFamily: "monospace", fontSize: 12, padding: 6, marginTop: 4 }} />
        </div>
        {importPreview && (
          <div style={{ marginTop: 12, border: "1px solid #ccc", borderRadius: 6, padding: 8, background: "#fff" }}>
            <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Relatório prévia — {importPreview.fileName || fileName} — batch {importPreview.batchId.slice(0,8)}</h3>
            <p style={{ fontSize: 12, margin: 0 }}>Total: {importPreview.report.total} | Válidas: {importPreview.report.valid} | Inválidas: {importPreview.report.invalid} | Duplicadas: {importPreview.report.duplicate} | Mapeamento: {JSON.stringify(importPreview.report.mapping)} | Fórmula prevenção: {importPreview.report.formula_prevention}</p>
            <div style={{ maxHeight: 300, overflow: "auto", marginTop: 8, border: "1px solid #eee" }}>
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <thead><tr><th>#</th><th>Status</th><th>Mapped</th><th>Erros</th><th>Dedup</th></tr></thead>
                <tbody>
                  {importPreview.rows.map(r=>(
                    <tr key={r.row_number} style={{ borderTop: "1px solid #eee", background: r.status==="valid" ? "#dcfce7" : r.status==="duplicate" ? "#fef9c3" : "#fee2e2" }}>
                      <td>{r.row_number}</td>
                      <td>{r.status}</td>
                      <td><code style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(r.mapped_data)}</code></td>
                      <td>{r.errors.map((e:any)=>`${e.field}: ${e.message}`).join("; ") || "-"}</td>
                      <td>{r.dedup_match ? `${r.dedup_match.display_name} (${r.dedup_match.id.slice(0,8)})` : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {importPreview.previewTruncated && <p style={{ fontSize: 11, opacity: 0.6 }}>Prévia truncada em 100 linhas, total {importPreview.totalRows}</p>}
          </div>
        )}
        {importResult && (
          <div style={{ marginTop: 8, padding: 8, background: "#dcfce7", borderRadius: 6, fontSize: 12 }}>
            Importação concluída: criadas {importResult.created}, ignoradas {importResult.skipped}, falhas {importResult.failed} — batch {importResult.batch?.id.slice(0,8)}
          </div>
        )}
      </section>

      <section style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <select value={filter.type} onChange={e=>setFilter({...filter, type: e.target.value})} style={{ padding: 6 }}>
          <option value="">todos tipos</option>
          <option value="prospect">prospect</option>
          <option value="client">client</option>
          <option value="partner">partner</option>
        </select>
        <select value={filter.stage} onChange={e=>setFilter({...filter, stage: e.target.value})} style={{ padding: 6 }}>
          <option value="">todos estágios</option>
          {stages.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={load} style={{ padding: "6px 12px" }}>Filtrar</button>
      </section>

      <section style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 16 }}>Empresas ({companies.length}) — CRM-01</h2>
          <div style={{ maxHeight: 500, overflow: "auto", border: "1px solid #eee" }}>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead><tr><th>Nome</th><th>Tipo</th><th>Cidade</th><th>Segmento</th><th>Status</th></tr></thead>
              <tbody>
                {companies.map(c=>(
                  <tr key={c.id} style={{ borderTop: "1px solid #eee" }}>
                    <td>{c.display_name}</td>
                    <td>{c.type}</td>
                    <td>{c.city || "-"}</td>
                    <td>{c.segment || "-"}</td>
                    <td>{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2 style={{ fontSize: 16 }}>Oportunidades ({opps.length}) — CRM-05/06 kanban e tabela</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, maxHeight: 500, overflow: "auto", border: "1px solid #eee", padding: 8 }}>
            {stages.map(stage=>(
              <div key={stage} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 8, background: "#f8fafc" }}>
                <h3 style={{ margin: "0 0 6px", fontSize: 12, textTransform: "uppercase" }}>{stage}</h3>
                {opps.filter(o=>o.stage===stage).map(o=>(
                  <article key={o.id} style={{ border: "1px solid #ccc", borderRadius: 4, padding: 6, marginBottom: 6, background: o.is_won ? "#dcfce7" : o.is_lost ? "#fee2e2" : "#fff", fontSize: 11 }}>
                    <strong>{o.title}</strong>
                    <button type="button" onClick={() => setSelectedOpportunity(o.id)}>Abrir tarefas</button>
                    <p style={{ margin: "2px 0 0" }}>Prioridade: {o.priority} | Valor: {o.estimated_value || "-"}</p>
                    <p style={{ margin: "2px 0 0" }}>Próxima: {o.next_action || "-"} {o.next_action_date ? new Date(o.next_action_date).toLocaleDateString() : ""}</p>
                    <p style={{ margin: "2px 0 0", opacity: 0.7 }}>{o.is_won ? "ganho (não é dinheiro recebido)" : o.is_lost ? "perdido (motivo obrigatório)" : ""}</p>
                  </article>
                ))}
                {opps.filter(o=>o.stage===stage).length===0 && <p style={{ fontSize: 10, opacity: 0.5 }}>vazio</p>}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>CRM-07 kanban e tabela, filtros, busca, tarefas vencidas, histórico ligações/reuniões, anexos e notas internas autorizadas. Tarefas pessoais e histórico de interações: use Abrir tarefas na oportunidade. Anexos e agenda de visitas/reuniões (CRM-08) já entregues; cadências manuais (CRM-09) criam tarefas a partir de modelos, sem envio automático; carteira (CRM-10) ainda está pendente.</p>
        </div>
      </section>
      {selectedOpportunity && <OpportunityTasks key={selectedOpportunity} opportunityId={selectedOpportunity} />}
      {selectedOpportunity && <OpportunityInteractions key={"interactions-" + selectedOpportunity} opportunityId={selectedOpportunity} />}
      {selectedOpportunity && <OpportunityVisits key={"visits-" + selectedOpportunity} opportunityId={selectedOpportunity} />}
      {selectedOpportunity && <CadenceClient key={"cadence-" + selectedOpportunity} opportunityId={selectedOpportunity} />}
      <MyAgenda />
    </main>
  );
}
