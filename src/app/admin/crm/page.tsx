"use client";
import { useEffect, useState } from "react";
import OpportunitySummary from "./OpportunitySummary";
import OpportunityTasks from "./OpportunityTasks";
import OpportunityInteractions from "./OpportunityInteractions";
import OpportunityVisits from "./OpportunityVisits";
import OpportunityNotes from "./OpportunityNotes";
import MyAgenda from "./MyAgenda";
import MyDelegatedTasks from "./MyDelegatedTasks";
import CadenceClient from "./CadenceClient";

type Company = { id: string; display_name: string; type: string; city: string; segment: string | null; status: string; responsible_name: string | null; };
type Unit = { id: string; display_name: string };
type Opportunity = {
  id: string; company_id: string; title: string; stage: string; priority: string;
  service_name: string | null; need_description: string | null; responsible_name: string | null;
  unit_id: string | null; unit_name: string | null; forecast_date: string | null;
  estimated_value: string | null; next_action: string | null; next_action_date: string | null;
  origin: string | null; campaign: string | null; loss_reason: string | null;
  is_won: boolean; is_lost: boolean;
};
type ImportRow = { row_number: number; raw_data: any; mapped_data: any; status: string; errors: any[]; dedup_match: any; };

export default function CrmPage() {
  const [selectedOpportunity, setSelectedOpportunity] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [oppsTotal, setOppsTotal] = useState(0);
  const [filter, setFilter] = useState({ type: "", stage: "" });
  const [oppSearch, setOppSearch] = useState("");
  const [appliedOppSearch, setAppliedOppSearch] = useState("");
  const [oppPriority, setOppPriority] = useState("");
  const [oppView, setOppView] = useState<"kanban" | "tabela">("kanban");
  const [form, setForm] = useState({ displayName: "", city: "", type: "prospect", segment: "" });
  const [oppForm, setOppForm] = useState({ company_id: "", title: "", service_name: "", need_description: "", priority: "media", forecast_date: "", estimated_value: "", next_action: "", next_action_date: "", origin: "", unit_id: "" });
  const [oppUnits, setOppUnits] = useState<Unit[]>([]);
  const [oppFormError, setOppFormError] = useState("");
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
      // CRM-07: busca e prioridade aplicadas no servidor (com curinga escapado);
      // a listagem é pessoal — cada comercial vê só o próprio funil.
      const params = new URLSearchParams();
      if (filter.stage) params.set("stage", filter.stage);
      if (appliedOppSearch) params.set("search", appliedOppSearch);
      if (oppPriority) params.set("priority", oppPriority);
      const res = await fetch(`/api/crm/opportunities?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) { setOpps(data.opportunities || []); setOppsTotal(data.total || 0); }
    } catch {}
  }

  useEffect(() => { load(); }, [filter, appliedOppSearch, oppPriority]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadUnits(companyId: string) {
    if (!companyId) { setOppUnits([]); return; }
    try {
      const res = await fetch(`/api/crm/companies/${companyId}`, { cache: "no-store" });
      const data = await res.json();
      setOppUnits(res.ok ? (data.units || []) : []);
    } catch { setOppUnits([]); }
  }

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

  async function createOpportunity(e: React.FormEvent) {
    e.preventDefault();
    setOppFormError("");
    try {
      const res = await fetch("/api/crm/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: oppForm.company_id,
          title: oppForm.title,
          service_name: oppForm.service_name || null,
          need_description: oppForm.need_description || null,
          priority: oppForm.priority,
          forecast_date: oppForm.forecast_date || null,
          estimated_value: oppForm.estimated_value === "" ? null : Number(oppForm.estimated_value),
          next_action: oppForm.next_action || null,
          next_action_date: oppForm.next_action_date ? new Date(oppForm.next_action_date).toISOString() : null,
          origin: oppForm.origin || null,
          unit_id: oppForm.unit_id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setOppForm({ company_id: "", title: "", service_name: "", need_description: "", priority: "media", forecast_date: "", estimated_value: "", next_action: "", next_action_date: "", origin: "", unit_id: "" });
      setOppUnits([]);
      await load();
    } catch (e:any) { setOppFormError(e.message); }
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
      <p style={{ fontSize: 13, opacity: 0.8 }}>Cadastro central de empresas e contatos com tipo prospect/cliente/parceiro sem duplicar entidade (CRM-01), contato com função decisor/influenciador/usuario/financeiro (CRM-02), importar CSV com prévia, validação por linha, mapeamento, relatório, deduplicação revisável e prevenção fórmula maliciosa na exportação (CRM-03), converter lead preservando histórico com deduplicação (CRM-04), oportunidades com serviço, necessidade, responsável, unidade, previsão, valor estimado, próxima ação/data, origem, prioridade, motivo perda (CRM-05), funil novo→qualificação→vistoria→proposta_elaboração→enviada→negociação→ganho/perdido com motivo obrigatório perda e reabertura auditada, não tratar ganho como dinheiro recebido (CRM-06). O funil é pessoal: cada comercial vê apenas as próprias oportunidades.</p>

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

      <section style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Nova oportunidade (CRM-05)</h2>
        <p style={{ fontSize: 12, opacity: 0.7 }}>Todos os campos do requisito: serviço, necessidade, responsável (você, gravado na criação), unidade da mesma empresa, previsão, valor estimado, próxima ação/data, origem e prioridade. Origem/campanha e responsável são imutáveis depois de criados; motivo de perda é exigido no funil.</p>
        <form onSubmit={createOpportunity} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "flex-end" }}>
          <label htmlFor="opp-form-company" style={{ fontSize: 12 }}>Empresa</label>
          <select id="opp-form-company" value={oppForm.company_id} onChange={e=>{ setOppForm({...oppForm, company_id: e.target.value, unit_id: ""}); loadUnits(e.target.value); }} required style={{ display: "block", padding: 6, minWidth: 180 }}>
            <option value="">escolher empresa</option>
            {companies.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}
          </select>
          <label style={{ fontSize: 12 }}>Título<input value={oppForm.title} onChange={e=>setOppForm({...oppForm, title: e.target.value})} required maxLength={200} style={{ display: "block", padding: 6, minWidth: 200 }} /></label>
          <label style={{ fontSize: 12 }}>Serviço<input value={oppForm.service_name} onChange={e=>setOppForm({...oppForm, service_name: e.target.value})} maxLength={100} style={{ display: "block", padding: 6 }} /></label>
          <label style={{ fontSize: 12 }}>Necessidade<input value={oppForm.need_description} onChange={e=>setOppForm({...oppForm, need_description: e.target.value})} maxLength={2000} style={{ display: "block", padding: 6, minWidth: 180 }} /></label>
          <label htmlFor="opp-form-unit" style={{ fontSize: 12 }}>Unidade</label>
          <select id="opp-form-unit" value={oppForm.unit_id} onChange={e=>setOppForm({...oppForm, unit_id: e.target.value})} disabled={!oppForm.company_id} style={{ display: "block", padding: 6 }}>
            <option value="">sem unidade</option>
            {oppUnits.map(u=><option key={u.id} value={u.id}>{u.display_name}</option>)}
          </select>
          <label htmlFor="opp-form-priority" style={{ fontSize: 12 }}>Prioridade</label>
          <select id="opp-form-priority" value={oppForm.priority} onChange={e=>setOppForm({...oppForm, priority: e.target.value})} style={{ display: "block", padding: 6 }}>
            {["baixa","media","alta","critica"].map(p=><option key={p} value={p}>{p}</option>)}
          </select>
          <label style={{ fontSize: 12 }}>Previsão (fechamento)<input type="date" value={oppForm.forecast_date} onChange={e=>setOppForm({...oppForm, forecast_date: e.target.value})} style={{ display: "block", padding: 6 }} /></label>
          <label style={{ fontSize: 12 }}>Valor estimado<input type="number" min={0} step="0.01" value={oppForm.estimated_value} onChange={e=>setOppForm({...oppForm, estimated_value: e.target.value})} style={{ display: "block", padding: 6, width: 120 }} /></label>
          <label style={{ fontSize: 12 }}>Próxima ação<input value={oppForm.next_action} onChange={e=>setOppForm({...oppForm, next_action: e.target.value})} maxLength={200} style={{ display: "block", padding: 6 }} /></label>
          <label style={{ fontSize: 12 }}>Data da próxima ação<input type="datetime-local" value={oppForm.next_action_date} onChange={e=>setOppForm({...oppForm, next_action_date: e.target.value})} style={{ display: "block", padding: 6 }} /></label>
          <label style={{ fontSize: 12 }}>Origem<input value={oppForm.origin} onChange={e=>setOppForm({...oppForm, origin: e.target.value})} maxLength={100} style={{ display: "block", padding: 6 }} /></label>
          <button type="submit" style={{ padding: "6px 12px" }}>Criar oportunidade</button>
        </form>
        {oppFormError && <p role="alert" style={{ color: "red" }}>{oppFormError}</p>}
      </section>

      <section style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
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
        <form onSubmit={e=>{ e.preventDefault(); setAppliedOppSearch(oppSearch.trim()); }} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <label style={{ fontSize: 12 }}>Buscar oportunidade (título/necessidade)<input value={oppSearch} onChange={e=>setOppSearch(e.target.value)} maxLength={200} style={{ display: "block", padding: 6 }} /></label>
          <button type="submit" style={{ padding: "6px 12px" }}>Filtrar oportunidades</button>
        </form>
        <label htmlFor="opp-filter-priority" style={{ fontSize: 12, padding: 6 }}>Filtrar por prioridade</label>
        <select id="opp-filter-priority" value={oppPriority} onChange={e=>setOppPriority(e.target.value)} style={{ display: "block", padding: 6 }}>
          <option value="">todas prioridades</option>
          {["baixa","media","alta","critica"].map(p=><option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={load} style={{ padding: "6px 12px" }}>Atualizar</button>
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
          <h2 style={{ fontSize: 16 }}>Oportunidades ({opps.length} de {oppsTotal}) — CRM-05/06 kanban e tabela</h2>
          <p style={{ fontSize: 11, opacity: 0.7, marginTop: 0 }}>Funil pessoal: só as suas oportunidades aparecem (busca e prioridade aplicadas no servidor, com curinga escapado).</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
            <button type="button" onClick={()=>setOppView(view=>view==="kanban"?"tabela":"kanban")} style={{ padding: "6px 12px" }}>
              {oppView==="kanban" ? "Ver em tabela" : "Ver em kanban"}
            </button>
          </div>
          {(() => (
            oppView === "kanban" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, maxHeight: 500, overflow: "auto", border: "1px solid #eee", padding: 8 }}>
            {stages.map(stage=>(
              <div key={stage} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 8, background: "#f8fafc" }}>
                <h3 style={{ margin: "0 0 6px", fontSize: 12, textTransform: "uppercase" }}>{stage}</h3>
                {opps.filter(o=>o.stage===stage).map(o=>(
                  <article key={o.id} style={{ border: "1px solid #ccc", borderRadius: 4, padding: 6, marginBottom: 6, background: o.is_won ? "#dcfce7" : o.is_lost ? "#fee2e2" : "#fff", fontSize: 11 }}>
                    <strong>{o.title}</strong>
                    <button type="button" onClick={() => setSelectedOpportunity(o.id)}>Abrir tarefas</button>
                    <p style={{ margin: "2px 0 0" }}>Serviço: {o.service_name || "-"} | Prioridade: {o.priority} | Valor: {o.estimated_value || "-"}</p>
                    <p style={{ margin: "2px 0 0" }}>Responsável: {o.responsible_name || "-"} | Unidade: {o.unit_name || "-"} | Previsão: {o.forecast_date ? String(o.forecast_date).slice(0, 10) : "-"}</p>
                    <p style={{ margin: "2px 0 0" }}>Próxima: {o.next_action || "-"} {o.next_action_date ? new Date(o.next_action_date).toLocaleDateString() : ""} | Origem: {o.origin || "-"}</p>
                    {o.is_lost && <p style={{ margin: "2px 0 0" }}>Motivo de perda: {o.loss_reason || "-"}</p>}
                    <p style={{ margin: "2px 0 0", opacity: 0.7 }}>{o.is_won ? "ganho (não é dinheiro recebido)" : o.is_lost ? "perdido (motivo obrigatório)" : ""}</p>
                  </article>
                ))}
                {opps.filter(o=>o.stage===stage).length===0 && <p style={{ fontSize: 10, opacity: 0.5 }}>vazio</p>}
              </div>
            ))}
          </div>
            ) : (
          <div style={{ maxHeight: 500, overflow: "auto", border: "1px solid #eee" }}>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead><tr><th>Título</th><th>Estágio</th><th>Serviço</th><th>Responsável</th><th>Unidade</th><th>Previsão</th><th>Prioridade</th><th>Valor</th><th>Próxima ação</th><th>Origem</th><th>Motivo de perda</th><th></th></tr></thead>
              <tbody>
                {opps.map(o=>(
                  <tr key={o.id} style={{ borderTop: "1px solid #eee", background: o.is_won ? "#dcfce7" : o.is_lost ? "#fee2e2" : undefined }}>
                    <td>{o.title}</td>
                    <td>{o.stage}</td>
                    <td>{o.service_name || "-"}</td>
                    <td>{o.responsible_name || "-"}</td>
                    <td>{o.unit_name || "-"}</td>
                    <td>{o.forecast_date ? String(o.forecast_date).slice(0, 10) : "-"}</td>
                    <td>{o.priority}</td>
                    <td>{o.estimated_value || "-"}</td>
                    <td>{o.next_action || "-"} {o.next_action_date ? new Date(o.next_action_date).toLocaleDateString() : ""}</td>
                    <td>{o.origin || "-"}</td>
                    <td>{o.is_lost ? (o.loss_reason || "-") : ""}</td>
                    <td><button type="button" onClick={() => setSelectedOpportunity(o.id)}>Abrir tarefas</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {opps.length===0 && <p style={{ fontSize: 11, opacity: 0.6, padding: 8 }}>Nenhuma oportunidade neste filtro.</p>}
          </div>
            )
          ))()}
          <p style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>CRM-07 kanban e tabela, filtros, busca, tarefas vencidas, histórico ligações/reuniões, anexos e notas internas autorizadas. Tarefas pessoais (com paginação, busca, edição de prazo e delegação explícita com aceite) e histórico de interações: use Abrir tarefas na oportunidade. Delegações recebidas aparecem em Tarefas delegadas a mim. Anexos, agenda de visitas/reuniões (CRM-08) e notas internas dedicadas já entregues; cadências manuais (CRM-09) criam tarefas a partir de modelos, sem envio automático; carteira (CRM-10) ainda está pendente.</p>
        </div>
      </section>
      {selectedOpportunity && <OpportunitySummary key={"summary-" + selectedOpportunity} opportunityId={selectedOpportunity} />}
      {selectedOpportunity && <OpportunityNotes key={"notes-" + selectedOpportunity} opportunityId={selectedOpportunity} />}
      {selectedOpportunity && <OpportunityTasks key={selectedOpportunity} opportunityId={selectedOpportunity} />}
      {selectedOpportunity && <OpportunityInteractions key={"interactions-" + selectedOpportunity} opportunityId={selectedOpportunity} />}
      {selectedOpportunity && <OpportunityVisits key={"visits-" + selectedOpportunity} opportunityId={selectedOpportunity} />}
      {selectedOpportunity && <CadenceClient key={"cadence-" + selectedOpportunity} opportunityId={selectedOpportunity} />}
      <MyDelegatedTasks />
      <MyAgenda />
    </main>
  );
}
