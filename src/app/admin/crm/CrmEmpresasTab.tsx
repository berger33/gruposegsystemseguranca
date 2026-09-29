"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Badge, Notice, Section, SessionHint, apiJson, btn, btnPrimary, colors, fmtDate, input, label, tableStyle, td, th,
} from "./crm-ui";

type Company = {
  id: string; display_name: string; type: string; status: string; city: string | null;
  state: string | null; segment: string | null; document_ref: string | null;
  responsible_name: string | null; origin: string | null; campaign: string | null;
  parent_company_id: string | null; created_at: string;
};
type Contact = {
  id: string; display_name: string; email: string | null; phone: string | null;
  role: string | null; buying_role: string | null; restrictions: string | null;
  origin: string | null; is_primary: boolean;
};
type ImportRow = { row_number: number; status: string; mapped_data: any; errors: any[]; dedup_match: any };

const TYPE_LABEL: Record<string, string> = { prospect: "Prospect", client: "Cliente", partner: "Parceiro" };
const BUYING_ROLES = ["decisor", "influenciador", "usuario", "financeiro", "outro"];

export default function CrmEmpresasTab() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState({ search: "", type: "", parent: "" });
  const [selected, setSelected] = useState<Company | null>(null);
  const [detail, setDetail] = useState<{ contacts: Contact[]; units: any[]; opportunities: any[] } | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const [csvContent, setCsvContent] = useState("");
  const [fileName, setFileName] = useState("empresas.csv");
  const [preview, setPreview] = useState<{ batchId: string; report: any; rows: ImportRow[] } | null>(null);
  const [importResult, setImportResult] = useState<any>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (filter.search) params.set("q", filter.search);
      if (filter.type) params.set("type", filter.type);
      if (filter.parent) params.set("parent_id", filter.parent);
      params.set("limit", "100");
      const data = await apiJson(`/api/crm/companies?${params.toString()}`);
      setCompanies(data.companies || []);
      setTotal(data.total ?? (data.companies || []).length);
    } catch (e: any) {
      setError(e.message);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function openCompany(company: Company) {
    setSelected(company);
    setDetail(null);
    try {
      const data = await apiJson(`/api/crm/companies/${company.id}`);
      setDetail({ contacts: data.contacts || [], units: data.units || [], opportunities: data.opportunities || [] });
      if (data.company) setSelected(data.company);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function createCompany(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; // capturado antes de qualquer await
    const fd = new FormData(form);
    setBusy(true); setError(""); setOk("");
    try {
      const payload: Record<string, unknown> = {
        display_name: fd.get("display_name"),
        type: fd.get("type"),
        city: fd.get("city") || undefined,
        state: fd.get("state") || undefined,
        segment: fd.get("segment") || undefined,
        document_ref: fd.get("document_ref") || undefined,
        document_type: fd.get("document_ref") ? "cnpj" : undefined,
        responsible_name: fd.get("responsible_name") || undefined,
        origin: fd.get("origin") || undefined,
        parent_id: fd.get("parent_id") || undefined,
      };
      const data = await apiJson("/api/crm/companies", { method: "POST", body: JSON.stringify(payload) });
      setOk(`Empresa "${data.company?.display_name}" cadastrada.`);
      form.reset();
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function createContact(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (!selected) return;
    setBusy(true); setError(""); setOk("");
    try {
      await apiJson("/api/crm/contacts", {
        method: "POST",
        body: JSON.stringify({
          company_id: selected.id,
          display_name: fd.get("display_name"),
          email: fd.get("email") || undefined,
          phone: fd.get("phone") || undefined,
          buying_role: fd.get("buying_role"),
          role: fd.get("buying_role"),
          restrictions: fd.get("restrictions") || undefined,
          origin: fd.get("origin") || undefined,
          is_primary: fd.get("is_primary") === "on",
        }),
      });
      setOk("Contato registrado com função de compra.");
      form.reset();
      await openCompany(selected);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function convertLead(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true); setError(""); setOk("");
    try {
      const leadId = String(fd.get("leadId") || "").trim();
      const data = await apiJson(`/api/crm/leads/${leadId}/convert`, {
        method: "POST",
        body: JSON.stringify({ create_company: true, company_name: fd.get("companyName") || undefined }),
      });
      setOk(
        data.dedup
          ? `Lead já convertido antes — reaproveitada a oportunidade ${String(data.opportunityId).slice(0, 8)} (dedup, histórico preservado).`
          : `Lead convertido: empresa, contato e oportunidade ${String(data.opportunityId).slice(0, 8)} criados.`
      );
      form.reset();
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function previewImport() {
    if (!csvContent.trim()) { setError("Cole ou carregue um CSV antes da prévia."); return; }
    setBusy(true); setError(""); setOk(""); setImportResult(null);
    try {
      const data = await apiJson("/api/crm/imports/preview", {
        method: "POST",
        body: JSON.stringify({ fileName, csvContent, type: "companies" }),
      });
      setPreview(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function commitImport() {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      const data = await apiJson(`/api/crm/imports/${preview.batchId}/commit`, { method: "POST", body: JSON.stringify({}) });
      setImportResult(data);
      setPreview(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Section
        title="Cadastro central de empresas (CRM-01)"
        hint="Uma entidade por empresa, com tipo prospect/cliente/parceiro e vínculo de grupo (matriz → filiais). Duplicar entidade para mudar o tipo não é permitido: altere o tipo no próprio registro."
        actions={
          <a href="/api/crm/companies/export" style={{ ...btn, textDecoration: "none" }} download>
            Exportar CSV (célula de fórmula é neutralizada)
          </a>
        }
      >
        <form onSubmit={createCompany} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            <label style={label}>Nome da empresa*<input required name="display_name" maxLength={200} style={input} /></label>
            <label style={label}>Tipo
              <select name="type" defaultValue="prospect" style={input}>
                <option value="prospect">Prospect</option>
                <option value="client">Cliente</option>
                <option value="partner">Parceiro</option>
              </select>
            </label>
            <label style={label}>CNPJ<input name="document_ref" maxLength={40} style={input} /></label>
            <label style={label}>Cidade<input name="city" maxLength={100} style={input} /></label>
            <label style={label}>UF<input name="state" maxLength={2} style={input} /></label>
            <label style={label}>Segmento<input name="segment" maxLength={100} style={input} /></label>
            <label style={label}>Responsável<input name="responsible_name" maxLength={120} style={input} /></label>
            <label style={label}>Origem<input name="origin" maxLength={100} style={input} placeholder="indicação, site, evento…" /></label>
            <label style={label}>Matriz (grupo)
              <select name="parent_id" defaultValue="" style={input}>
                <option value="">sem vínculo de grupo</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="submit" disabled={busy} style={btnPrimary}>Cadastrar empresa</button>
          </div>
        </form>
        {error && <Notice kind="erro">{error}</Notice>}
        {error && <SessionHint error={error} />}
        {ok && <Notice kind="ok">{ok}</Notice>}
      </Section>

      <Section
        title="Converter pedido recebido em empresa, contato e oportunidade (CRM-04)"
        hint="A conversão preserva o histórico do lead e é deduplicada: converter o mesmo pedido duas vezes reaproveita a oportunidade existente em vez de criar outra."
      >
        <form onSubmit={convertLead} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ ...label, minWidth: 320 }}>ID do pedido (UUID)
            <input required name="leadId" style={input} placeholder="copie de Pedidos recebidos" />
          </label>
          <label style={{ ...label, minWidth: 240 }}>Nome da empresa (opcional)
            <input name="companyName" style={input} placeholder="vazio = nome de quem pediu" />
          </label>
          <button type="submit" disabled={busy} style={btn}>Converter pedido</button>
        </form>
      </Section>

      <Section
        title="Importar CSV com prévia e deduplicação revisável (CRM-03)"
        hint="A prévia valida linha a linha, mostra o mapeamento aplicado e marca duplicadas por documento ou nome. A exportação neutraliza células que começam com = + - @ (injeção de fórmula)."
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Arquivo CSV"
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              if (!file) return;
              setFileName(file.name);
              setCsvContent(await file.text());
            }}
          />
          <label style={label}>Nome do arquivo<input value={fileName} onChange={(e) => setFileName(e.target.value)} style={input} /></label>
          <button onClick={previewImport} disabled={busy} style={btn}>Gerar prévia</button>
          {preview && <button onClick={commitImport} disabled={busy} style={btnPrimary}>Confirmar {preview.report?.valid ?? 0} válidas</button>}
        </div>
        <label style={{ ...label, marginTop: 10 }}>CSV colado (primeira linha = cabeçalho)
          <textarea
            aria-label="CSV colado"
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            placeholder={"display_name,document_ref,city,type\nEmpresa A,11444777000161,Guarulhos,prospect"}
            style={{ ...input, minHeight: 80, fontFamily: "ui-monospace, monospace", fontSize: 12, width: "100%", boxSizing: "border-box" }}
          />
        </label>
        {preview && (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <p style={{ fontSize: 12, margin: "0 0 6px", color: colors.muted }}>
              Total {preview.report.total} · válidas {preview.report.valid} · inválidas {preview.report.invalid} · duplicadas {preview.report.duplicate}
            </p>
            <table style={tableStyle}>
              <thead><tr><th style={th}>#</th><th style={th}>Situação</th><th style={th}>Dados</th><th style={th}>Erros</th><th style={th}>Duplicada de</th></tr></thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.row_number}>
                    <td style={td}>{r.row_number}</td>
                    <td style={td}>
                      <Badge tone={r.status === "valid" ? "ok" : r.status === "duplicate" ? "warn" : "bad"}>{r.status}</Badge>
                    </td>
                    <td style={td}><code style={{ fontSize: 11 }}>{JSON.stringify(r.mapped_data)}</code></td>
                    <td style={td}>{(r.errors || []).map((x: any) => `${x.field}: ${x.message}`).join("; ") || "—"}</td>
                    <td style={td}>{r.dedup_match ? r.dedup_match.display_name : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {importResult && (
          <Notice kind="ok">
            Importação concluída: {importResult.created} criadas, {importResult.skipped} ignoradas, {importResult.failed} falhas.
          </Notice>
        )}
      </Section>

      <Section title={`Empresas cadastradas (${total})`} hint="Busca por nome ou documento; filtro por tipo e por grupo.">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
          <input
            aria-label="Buscar empresa"
            placeholder="Buscar por nome ou documento"
            style={{ ...input, minWidth: 240 }}
            value={filter.search}
            onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          />
          <select aria-label="Filtrar por tipo" value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })} style={input}>
            <option value="">todos os tipos</option>
            <option value="prospect">Prospect</option>
            <option value="client">Cliente</option>
            <option value="partner">Parceiro</option>
          </select>
          <button onClick={load} style={btn}>Atualizar</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Empresa</th><th style={th}>Tipo</th><th style={th}>Cidade</th>
                <th style={th}>Segmento</th><th style={th}>Situação</th><th style={th}>Grupo</th><th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td style={td}>
                    <button onClick={() => openCompany(c)} style={{ background: "none", border: "none", padding: 0, font: "inherit", fontWeight: 700, color: colors.accent, cursor: "pointer", textAlign: "left" }}>
                      {c.display_name}
                    </button>
                    <div style={{ fontSize: 11, color: colors.muted }}>{c.document_ref || "sem documento"}</div>
                  </td>
                  <td style={td}>{TYPE_LABEL[c.type] || c.type}</td>
                  <td style={td}>{c.city || "—"}</td>
                  <td style={td}>{c.segment || "—"}</td>
                  <td style={td}><Badge tone={c.status === "active" ? "ok" : "warn"}>{c.status}</Badge></td>
                  <td style={td}>{c.parent_company_id ? "filial" : "—"}</td>
                  <td style={td}><button onClick={() => openCompany(c)} style={btn}>Abrir</button></td>
                </tr>
              ))}
              {companies.length === 0 && <tr><td style={td} colSpan={7}>Nenhuma empresa encontrada com esses filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>

      {selected && (
        <Section
          title={`${selected.display_name} — contatos e vínculos (CRM-02)`}
          hint="Função de compra (decisor, influenciador, usuário, financeiro), restrições de contato e origem legítima ficam no próprio contato."
          actions={<button onClick={() => { setSelected(null); setDetail(null); }} style={btn}>Fechar</button>}
        >
          <form onSubmit={createContact} style={{ display: "grid", gap: 10, marginBottom: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <label style={label}>Nome do contato*<input required name="display_name" maxLength={120} style={input} /></label>
              <label style={label}>Função de compra
                <select name="buying_role" defaultValue="decisor" style={input}>
                  {BUYING_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label style={label}>E-mail<input name="email" type="email" style={input} /></label>
              <label style={label}>Telefone<input name="phone" style={input} /></label>
              <label style={label}>Restrições de contato<input name="restrictions" maxLength={300} style={input} placeholder="ex.: não ligar antes das 9h" /></label>
              <label style={label}>Origem legítima<input name="origin" maxLength={100} style={input} placeholder="indicação, formulário, evento" /></label>
            </div>
            <label style={{ ...label, flexDirection: "row", display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" name="is_primary" /> contato principal
            </label>
            <div><button type="submit" disabled={busy} style={btnPrimary}>Adicionar contato</button></div>
          </form>

          {!detail && <p style={{ fontSize: 12, color: colors.muted }}>Carregando vínculos…</p>}
          {detail && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ overflowX: "auto" }}>
                <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Contatos ({detail.contacts.length})</h3>
                <table style={tableStyle}>
                  <thead><tr><th style={th}>Nome</th><th style={th}>Função</th><th style={th}>Contato</th><th style={th}>Restrições</th><th style={th}>Origem</th></tr></thead>
                  <tbody>
                    {detail.contacts.map((ct) => (
                      <tr key={ct.id}>
                        <td style={td}>{ct.display_name}{ct.is_primary ? <> <Badge tone="ok">principal</Badge></> : null}</td>
                        <td style={td}>{ct.buying_role || ct.role || "—"}</td>
                        <td style={td}>{ct.email || ct.phone || "—"}</td>
                        <td style={td}>{ct.restrictions || "—"}</td>
                        <td style={td}>{ct.origin || "—"}</td>
                      </tr>
                    ))}
                    {detail.contacts.length === 0 && <tr><td style={td} colSpan={5}>Sem contatos registrados.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Oportunidades ({detail.opportunities.length})</h3>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
                  {detail.opportunities.map((o: any) => (
                    <li key={o.id}>{o.title} — <Badge>{o.stage}</Badge> · aberta em {fmtDate(o.created_at)}</li>
                  ))}
                  {detail.opportunities.length === 0 && <li style={{ color: colors.muted, listStyle: "none", marginLeft: -18 }}>Nenhuma oportunidade.</li>}
                </ul>
              </div>
              <div>
                <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Unidades ({detail.units.length})</h3>
                <p style={{ fontSize: 12, color: colors.muted, margin: 0 }}>
                  {detail.units.length === 0 ? "Sem unidades cadastradas para esta empresa." : detail.units.map((u: any) => u.display_name).join(", ")}
                </p>
              </div>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
