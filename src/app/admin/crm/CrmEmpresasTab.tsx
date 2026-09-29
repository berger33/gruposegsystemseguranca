"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, Badge, btn, btnPrimary, card, colors, ErrorBox, fmtDate, input, label, Notice, SectionTitle, td, th } from "./crm-ui";

type Company = {
  id: string; display_name: string; document_ref: string | null; type: string; status: string;
  city: string | null; state: string | null; segment: string | null; responsible_name: string | null;
  parent_company_id: string | null; origin: string | null; campaign: string | null; created_at: string;
};
type Contact = {
  id: string; display_name: string; email: string | null; phone: string | null; role: string | null;
  buying_role: string | null; restrictions: string | null; origin: string | null; is_primary: boolean;
};
type ImportRow = { row_number: number; mapped_data: any; status: string; errors: any[]; dedup_match: any };

const TYPE_LABEL: Record<string, string> = { prospect: "Prospect", client: "Cliente", partner: "Parceiro" };
const STATUS_TONE: Record<string, string> = { active: "ok", inactive: "warn", archived: "neutral" };

export default function CrmEmpresasTab() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState({ search: "", type: "", status: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [detail, setDetail] = useState<{ company: Company; units: any[]; contacts: Contact[]; opportunities: any[] } | null>(null);

  const [csvContent, setCsvContent] = useState("");
  const [fileName, setFileName] = useState("empresas.csv");
  const [preview, setPreview] = useState<{ batchId: string; report: any; rows: ImportRow[] } | null>(null);
  const [importResult, setImportResult] = useState<any>(null);

  // Guarda de resposta atrasada: sem isto, a busca de um filtro antigo
  // pode chegar depois e sobrescrever o resultado do filtro atual.
  const requestSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++requestSeq.current;

    setError("");
    try {
      const params = new URLSearchParams();
      if (filter.search) params.set("search", filter.search);
      if (filter.type) params.set("type", filter.type);
      if (filter.status) params.set("status", filter.status);
      params.set("limit", "100");
      const data = await apiFetch(`/api/crm/companies?${params.toString()}`);
      if (seq !== requestSeq.current) return;
      setCompanies(data.companies || []);
      setTotal(data.total || 0);
    } catch (e: any) { setError(e.message); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function openDetail(id: string) {
    setError("");
    try {
      const data = await apiFetch(`/api/crm/companies/${id}`);
      setDetail(data);
    } catch (e: any) { setError(e.message); }
  }

  async function createCompany(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(""); setNotice("");
    try {
      const body: Record<string, unknown> = {
        display_name: fd.get("display_name"),
        document_ref: fd.get("document_ref") || undefined,
        document_type: fd.get("document_type") || undefined,
        segment: fd.get("segment") || undefined,
        city: fd.get("city") || undefined,
        state: fd.get("state") || undefined,
        type: fd.get("type"),
        responsible_name: fd.get("responsible_name") || undefined,
        origin: fd.get("origin") || undefined,
        campaign: fd.get("campaign") || undefined,
        notes: fd.get("notes") || undefined,
      };
      const parent = String(fd.get("parent_company_id") || "");
      if (parent) body.parent_company_id = parent;
      const data = await apiFetch("/api/crm/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setNotice(`Empresa "${data.company.display_name}" cadastrada (CRM-01).`);
      form.reset();
      await load();
    } catch (e: any) { setError(e.message); }
  }

  async function createContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const companyId = detail?.company.id;
    if (!companyId) return;
    setError(""); setNotice("");
    try {
      await apiFetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          display_name: fd.get("display_name"),
          email: fd.get("email") || undefined,
          phone: fd.get("phone") || undefined,
          role: fd.get("role") || undefined,
          buying_role: fd.get("buying_role") || undefined,
          restrictions: fd.get("restrictions") || undefined,
          origin: fd.get("origin") || undefined,
          is_primary: fd.get("is_primary") === "on",
        }),
      });
      setNotice("Contato criado com papel de compra, restrições e origem registrados (CRM-02).");
      form.reset();
      await openDetail(companyId);
    } catch (e: any) { setError(e.message); }
  }

  async function convertLead(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(""); setNotice("");
    try {
      const leadId = String(fd.get("leadId") || "").trim();
      const data = await apiFetch(`/api/crm/leads/${leadId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ create_company: true, company_name: fd.get("companyName") || undefined }),
      });
      setNotice(data.dedup
        ? `Lead já convertido antes — reaproveitada a oportunidade ${data.opportunityId} (deduplicação do servidor, CRM-04).`
        : `Lead convertido: oportunidade ${data.opportunityId} criada preservando o histórico (CRM-04).`);
      form.reset();
      await load();
    } catch (e: any) { setError(e.message); }
  }

  async function previewImport() {
    setError(""); setImportResult(null);
    try {
      const data = await apiFetch("/api/crm/imports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, csvContent, type: "companies" }),
      });
      setPreview(data);
    } catch (e: any) { setError(e.message); }
  }

  async function commitImport() {
    if (!preview) return;
    setError("");
    try {
      const data = await apiFetch(`/api/crm/imports/${preview.batchId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setImportResult(data);
      setPreview(null);
      await load();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <>
      <section style={card}>
        <SectionTitle title="Cadastro de empresa (CRM-01)" hint="Grupo/unidade via empresa matriz; origem e campanha ficam registradas para a análise de origem." />
        <ErrorBox error={error} />
        <Notice>{notice}</Notice>
        <form onSubmit={createCompany} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <label style={label}>Nome da empresa*<input required name="display_name" style={input} /></label>
            <label style={label}>Documento<input name="document_ref" style={input} placeholder="CNPJ/CPF" /></label>
            <label style={label}>Tipo de documento
              <select name="document_type" style={input} defaultValue="">
                <option value="">—</option><option value="cnpj">CNPJ</option><option value="cpf">CPF</option><option value="other">Outro</option>
              </select>
            </label>
            <label style={label}>Tipo*
              <select name="type" style={input} defaultValue="prospect">
                <option value="prospect">Prospect</option><option value="client">Cliente</option><option value="partner">Parceiro</option>
              </select>
            </label>
            <label style={label}>Segmento<input name="segment" style={input} /></label>
            <label style={label}>Cidade<input name="city" style={input} /></label>
            <label style={label}>UF<input name="state" maxLength={2} style={input} /></label>
            <label style={label}>Responsável<input name="responsible_name" style={input} /></label>
            <label style={label}>Origem<input name="origin" style={input} placeholder="site, indicação…" /></label>
            <label style={label}>Campanha<input name="campaign" style={input} /></label>
            <label style={label}>Empresa matriz (grupo)
              <select name="parent_company_id" style={input} defaultValue="">
                <option value="">— sem matriz —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
              </select>
            </label>
            <label style={label}>Observações<input name="notes" style={input} /></label>
          </div>
          <div><button type="submit" style={btnPrimary}>Cadastrar empresa</button></div>
        </form>
      </section>

      <section style={card}>
        <SectionTitle title={`Empresas (${total})`} hint="Busca por nome ou documento, com filtros de tipo e situação." />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <input aria-label="Buscar empresa" placeholder="Buscar por nome ou documento" style={{ ...input, minWidth: 220 }}
                 value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} />
          <select aria-label="Filtrar por tipo" style={input} value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
            <option value="">Todos os tipos</option><option value="prospect">Prospect</option><option value="client">Cliente</option><option value="partner">Parceiro</option>
          </select>
          <select aria-label="Filtrar por situação" style={input} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
            <option value="">Todas as situações</option><option value="active">Ativa</option><option value="inactive">Inativa</option><option value="archived">Arquivada</option>
          </select>
          <a href="/api/crm/companies/export" style={{ ...btn, textDecoration: "none", lineHeight: "20px" }}>Exportar CSV</a>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
            <thead><tr><th style={th}>Empresa</th><th style={th}>Tipo</th><th style={th}>Cidade</th><th style={th}>Situação</th><th style={th}>Criada</th><th style={th}>Ações</th></tr></thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td style={td}>
                    <strong>{c.display_name}</strong>
                    {c.parent_company_id ? <> <Badge tone="info">unidade de grupo</Badge></> : null}
                    <div style={{ fontSize: 11, color: colors.muted }}>{c.document_ref || "sem documento"}{c.segment ? ` · ${c.segment}` : ""}</div>
                  </td>
                  <td style={td}>{TYPE_LABEL[c.type] || c.type}</td>
                  <td style={td}>{c.city || "—"}{c.state ? `/${c.state}` : ""}</td>
                  <td style={td}><Badge tone={STATUS_TONE[c.status] || "neutral"}>{c.status}</Badge></td>
                  <td style={td}>{fmtDate(c.created_at)}</td>
                  <td style={td}><button style={btn} onClick={() => openDetail(c.id)}>Abrir</button></td>
                </tr>
              ))}
              {companies.length === 0 && <tr><td style={td} colSpan={6}>Nenhuma empresa para este filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {detail && (
        <section style={card}>
          <SectionTitle title={`${detail.company.display_name} — contatos e oportunidades`} hint="Contato com papel de compra, preferências e restrições (CRM-02)." />
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            <div>
              <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Contatos ({detail.contacts.length})</h3>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
                {detail.contacts.map((ct) => (
                  <li key={ct.id} style={{ marginBottom: 6 }}>
                    <strong>{ct.display_name}</strong> {ct.is_primary ? <Badge tone="info">principal</Badge> : null}{" "}
                    {ct.buying_role ? <Badge tone="neutral">{ct.buying_role}</Badge> : null}
                    <div style={{ fontSize: 11, color: colors.muted }}>
                      {ct.email || "sem e-mail"} · {ct.phone || "sem telefone"}
                      {ct.restrictions ? ` · restrição: ${ct.restrictions}` : ""}
                      {ct.origin ? ` · origem: ${ct.origin}` : ""}
                    </div>
                  </li>
                ))}
                {detail.contacts.length === 0 && <li>Nenhum contato.</li>}
              </ul>
            </div>
            <div>
              <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Oportunidades ({detail.opportunities.length})</h3>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
                {detail.opportunities.map((o: any) => (
                  <li key={o.id}>{o.title} — <Badge tone="info">{o.stage}</Badge></li>
                ))}
                {detail.opportunities.length === 0 && <li>Nenhuma oportunidade.</li>}
              </ul>
              <h3 style={{ fontSize: 13, margin: "10px 0 6px" }}>Unidades ({detail.units.length})</h3>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
                {detail.units.map((u: any) => <li key={u.id}>{u.display_name}{u.city ? ` — ${u.city}` : ""}</li>)}
                {detail.units.length === 0 && <li>Nenhuma unidade cadastrada.</li>}
              </ul>
            </div>
          </div>

          <form onSubmit={createContact} style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <h3 style={{ fontSize: 13, margin: 0 }}>Novo contato</h3>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
              <label style={label}>Nome*<input required name="display_name" style={input} /></label>
              <label style={label}>E-mail<input name="email" type="email" style={input} /></label>
              <label style={label}>Telefone<input name="phone" style={input} /></label>
              <label style={label}>Papel
                <select name="role" style={input} defaultValue="">
                  <option value="">—</option><option value="decisor">Decisor</option><option value="influenciador">Influenciador</option>
                  <option value="usuario">Usuário</option><option value="financeiro">Financeiro</option><option value="outro">Outro</option>
                </select>
              </label>
              <label style={label}>Papel de compra
                <select name="buying_role" style={input} defaultValue="">
                  <option value="">—</option><option value="decisor">Decisor</option><option value="influenciador">Influenciador</option>
                  <option value="usuario">Usuário</option><option value="financeiro">Financeiro</option><option value="outro">Outro</option>
                </select>
              </label>
              <label style={label}>Restrições/preferências<input name="restrictions" style={input} placeholder="ex.: não ligar antes das 9h" /></label>
              <label style={label}>Origem legítima<input name="origin" style={input} placeholder="ex.: indicação do síndico" /></label>
              <label style={{ ...label, flexDirection: "row" }}>
                <span><input type="checkbox" name="is_primary" /> Contato principal</span>
              </label>
            </div>
            <div><button type="submit" style={btnPrimary}>Adicionar contato</button></div>
          </form>
        </section>
      )}

      <section style={card}>
        <SectionTitle title="Converter pedido recebido (CRM-04)" hint="A conversão é deduplicada no servidor: o mesmo lead nunca vira duas oportunidades." />
        <form onSubmit={convertLead} style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label style={label}>ID do lead (UUID)*<input required name="leadId" style={input} placeholder="copie de Pedidos recebidos" /></label>
          <label style={label}>Nome da empresa (nova)<input name="companyName" style={input} placeholder="vazio = nome do lead" /></label>
          <div style={{ alignSelf: "end" }}><button type="submit" style={btnPrimary}>Converter</button></div>
        </form>
      </section>

      <section style={card}>
        <SectionTitle title="Importação CSV com prévia (CRM-03)" hint="A prévia mostra válidos, inválidos e duplicados antes de gravar; a exportação neutraliza fórmulas (OWASP)." />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input aria-label="Nome do arquivo" style={input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
          <button style={btn} onClick={previewImport} type="button">Pré-visualizar</button>
          {preview && <button style={btnPrimary} onClick={commitImport} type="button">Confirmar importação</button>}
        </div>
        <textarea aria-label="CSV colado" value={csvContent} onChange={(e) => setCsvContent(e.target.value)}
          placeholder={"display_name,document_ref,city,type\nEmpresa A,11444777000161,Guarulhos,prospect"}
          style={{ ...input, width: "100%", minHeight: 80, fontFamily: "monospace", fontSize: 12, marginTop: 8, boxSizing: "border-box" }} />
        {preview && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 13, margin: "0 0 6px" }}>
              Prévia: <Badge tone="ok">{preview.report?.valid ?? 0} válidos</Badge>{" "}
              <Badge tone="bad">{preview.report?.invalid ?? 0} inválidos</Badge>{" "}
              <Badge tone="warn">{preview.report?.duplicate ?? 0} duplicados</Badge>
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead><tr><th style={th}>Linha</th><th style={th}>Nome</th><th style={th}>Situação</th><th style={th}>Motivo</th></tr></thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.row_number}>
                      <td style={td}>{r.row_number}</td>
                      <td style={td}>{r.mapped_data?.display_name || "—"}</td>
                      <td style={td}><Badge tone={r.status === "valid" ? "ok" : r.status === "duplicate" ? "warn" : "bad"}>{r.status}</Badge></td>
                      <td style={td}>{(r.errors || []).map((e: any) => e.message).join("; ") || (r.dedup_match ? "já existe no cadastro" : "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {importResult && (
          <Notice>
            Importação concluída: {importResult.created} criadas, {importResult.skipped} ignoradas, {importResult.failed} com falha.
          </Notice>
        )}
      </section>
    </>
  );
}
