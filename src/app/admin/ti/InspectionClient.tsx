"use client";
import { useEffect, useState } from "react";

type Template = { id: string; service_id: string | null; name: string; description: string | null; checklist: any[]; };
type Inspection = { id: string; company_id: string; opportunity_id: string | null; service_id: string | null; title: string; status: string; responsible_name: string | null; scheduled_at: string | null; coverage: any; quantities: any; infrastructure: any; limitations: string | null; photos: any[]; };

export default function InspectionClient() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ companyId: "", serviceId: "", title: "", templateId: "", responsible: "" });

  async function loadTemplates() {
    try {
      const res = await fetch("/api/crm/inspection-templates", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setTemplates(data.templates || []);
    } catch {}
  }

  async function loadInspections() {
    setLoading(true);
    try {
      const res = await fetch("/api/crm/inspections?limit=50", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setInspections(data.inspections || []);
    } catch (e:any) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadTemplates(); loadInspections(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/crm/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: form.companyId,
          service_id: form.serviceId || null,
          title: form.title,
          template_id: form.templateId || null,
          responsible_name: form.responsible || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setForm({ companyId: "", serviceId: "", title: "", templateId: "", responsible: "" });
      await loadInspections();
    } catch (e:any) { setError(e.message); }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
      <h2 style={{ margin: 0 }}>Vistorias — CRM-13 (checklist por serviço, quantidades, cobertura/turnos, infraestrutura, fotos autorizadas, limitações, responsável técnico)</h2>
      <p style={{ fontSize: 13, opacity: 0.8 }}>Tabelas crm_inspection_templates (id, service_id, name, checklist JSONB, version) + crm_inspections (company_id, opportunity_id, unit_id, template_id, service_id, title, status rascunho/em_andamento/concluida/cancelada, responsible_id/name, scheduled_at/completed_at, coverage JSONB, quantities JSONB, infrastructure JSONB, limitations 2000, photos JSONB com authorized flag, notes) + crm_inspection_answers (inspection_id, item_id, question, answer, quantity, observed, photo_ref). Checklist por serviço: seg_desarmada (cobertura área, turnos, qtd profissionais, infra energia, riscos, fotos autorizadas), cftv (qtd câmeras, cobertura, infra rede, armazenamento LGPD, acesso remoto, limitações, fotos), portaria (entradas, turnos, controle veículos, infra). Fotos autorizadas: photos array com file_name, authorized bool, description — somente fotos com authorized true consideradas válidas. Responsável técnico: responsible_id/name.</p>

      <form onSubmit={create} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <input placeholder="company_id UUID (crm_companies)" value={form.companyId} onChange={e=>setForm({...form, companyId: e.target.value})} required style={{ padding: 6, minWidth: 300 }} />
        <input placeholder="service_id (ex: cftv)" value={form.serviceId} onChange={e=>setForm({...form, serviceId: e.target.value})} style={{ padding: 6 }} />
        <input placeholder="título vistoria" value={form.title} onChange={e=>setForm({...form, title: e.target.value})} required maxLength={200} style={{ padding: 6, minWidth: 240 }} />
        <select value={form.templateId} onChange={e=>setForm({...form, templateId: e.target.value})} style={{ padding: 6, minWidth: 200 }}>
          <option value="">sem template</option>
          {templates.map(t=><option key={t.id} value={t.id}>{t.name} ({t.service_id || "geral"})</option>)}
        </select>
        <input placeholder="responsável técnico" value={form.responsible} onChange={e=>setForm({...form, responsible: e.target.value})} style={{ padding: 6 }} />
        <button type="submit" style={{ padding: "6px 12px" }}>Criar vistoria</button>
        <button type="button" onClick={loadInspections} style={{ padding: "6px 12px" }}>Recarregar</button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {loading && <p>Carregando...</p>}

      <div style={{ marginTop: 12 }}>
        <h3 style={{ fontSize: 13 }}>Templates ({templates.length})</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 8 }}>
          {templates.map(t=>(
            <article key={t.id} style={{ border: "1px solid #ccc", borderRadius: 6, padding: 8, background: "#f8fafc" }}>
              <strong>{t.name}</strong> <span style={{ fontSize: 10, padding: "2px 6px", background: "#e0e7ff", borderRadius: 4 }}>{t.service_id || "geral"}</span>
              <p style={{ fontSize: 11, margin: "4px 0 0" }}>{t.description}</p>
              <ul style={{ fontSize: 10, margin: "4px 0 0", paddingLeft: 14 }}>
                {t.checklist.map((it:any)=><li key={it.id}><strong>{it.id}</strong>: {it.question} [{it.type}] {it.required ? "*" : ""}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 13 }}>Vistorias ({inspections.length})</h3>
        <div style={{ maxHeight: 500, overflow: "auto", border: "1px solid #eee" }}>
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
            <thead><tr><th>Título</th><th>Serviço</th><th>Status</th><th>Responsável</th><th>Cobertura</th><th>Quantidades</th><th>Infra</th><th>Limitações</th><th>Fotos autorizadas</th></tr></thead>
            <tbody>
              {inspections.map(ins=>(
                <tr key={ins.id} style={{ borderTop: "1px solid #eee" }}>
                  <td>{ins.title}</td>
                  <td>{ins.service_id || "-"}</td>
                  <td>{ins.status}</td>
                  <td>{ins.responsible_name || "-"}</td>
                  <td><code style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(ins.coverage)}</code></td>
                  <td><code>{JSON.stringify(ins.quantities)}</code></td>
                  <td><code>{JSON.stringify(ins.infrastructure)}</code></td>
                  <td>{ins.limitations || "-"}</td>
                  <td>{Array.isArray(ins.photos) ? ins.photos.filter((p:any)=>p.authorized).length + "/" + ins.photos.length + " autorizadas" : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
