"use client";
import { useEffect, useState } from "react";

type Audit = {
  id: string;
  actor_kind: string;
  actor_id: string | null;
  action: string;
  target: string | null;
  result: string;
  detail_category: string;
  created_at: string;
};

export default function AuditClient() {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [filters, setFilters] = useState({ action: "", result: "", actorKind: "", from: "", to: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filters.action) params.set("action", filters.action);
      if (filters.result) params.set("result", filters.result);
      if (filters.actorKind) params.set("actorKind", filters.actorKind);
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      params.set("limit", "100");
      const res = await fetch(`/api/admin/audit?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setAudits(data.audits || []);
    } catch (e:any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function exportCsv() {
    try {
      const res = await fetch("/api/admin/audit/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters, format: "json" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha export");
      alert(`Exportado ${data.exported} registros (auditoria de export registrada como audit_export)`);
    } catch (e:any) {
      alert(`Erro export: ${e.message}`);
    }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
      <h2 style={{ margin: 0 }}>Auditoria — PLT-02 (consulta por autor/ação/objeto/período/resultado)</h2>
      <p style={{ fontSize: 13, opacity: 0.8 }}>Acesso restrito a admin/ti, mesma origem, sem segredos. Exportação auditada como <code>audit_export</code>, consulta como <code>audit_query</code>. Retenção 12 meses prevista.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <input placeholder="ação ex: login, permission_grant" value={filters.action} onChange={e=>setFilters({...filters, action: e.target.value})} style={{ padding: 6, minWidth: 180 }} />
        <select value={filters.result} onChange={e=>setFilters({...filters, result: e.target.value})} style={{ padding: 6 }}>
          <option value="">resultado (todos)</option>
          <option value="allowed">allowed</option>
          <option value="denied">denied</option>
          <option value="error">error</option>
        </select>
        <input placeholder="actorKind ex: staff, client" value={filters.actorKind} onChange={e=>setFilters({...filters, actorKind: e.target.value})} style={{ padding: 6 }} />
        <input type="date" value={filters.from} onChange={e=>setFilters({...filters, from: e.target.value})} style={{ padding: 6 }} />
        <input type="date" value={filters.to} onChange={e=>setFilters({...filters, to: e.target.value})} style={{ padding: 6 }} />
        <button onClick={load} disabled={loading} style={{ padding: "6px 12px" }}>{loading ? "Carregando..." : "Filtrar"}</button>
        <button onClick={exportCsv} style={{ padding: "6px 12px" }}>Exportar JSON (auditado)</button>
      </div>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <div style={{ maxHeight: 400, overflow: "auto", marginTop: 12, border: "1px solid #eee" }}>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead><tr><th>Data</th><th>Actor</th><th>Action</th><th>Target</th><th>Result</th><th>Cat</th></tr></thead>
          <tbody>
            {audits.map(a=>(
              <tr key={a.id} style={{ borderTop: "1px solid #eee" }}>
                <td>{new Date(a.created_at).toLocaleString()}</td>
                <td>{a.actor_kind}/{a.actor_id?.slice(0,8) || "-"}</td>
                <td>{a.action}</td>
                <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{a.target?.slice(0,80)}</td>
                <td>{a.result}</td>
                <td>{a.detail_category}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {audits.length===0 && <p style={{ padding: 12, fontSize: 13, opacity: 0.7 }}>Nenhum registro (ou sem permissão). Faça login como admin/ti em /api/admin/session.</p>}
      </div>
    </section>
  );
}
