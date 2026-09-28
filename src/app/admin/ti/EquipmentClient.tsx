"use client";
import { useEffect, useState } from "react";

type Equipment = {
  id: string;
  manufacturer: string;
  model: string;
  name: string;
  description: string | null;
  specifications: any;
  compatibilities: any[];
  category: string | null;
  supplier_name: string | null;
  warranty_months: number | null;
  stock_sku: string | null;
  stock_location: string | null;
  is_active: boolean;
  is_validated: boolean;
};

export default function EquipmentClient() {
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState({ category: "", search: "" });
  const [form, setForm] = useState({ id: "", manufacturer: "", model: "", name: "", category: "", supplier: "", warranty: "" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filter.category) params.set("category", filter.category);
      if (filter.search) params.set("search", filter.search);
      const res = await fetch(`/api/crm/equipment?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setItems(data.equipment || []);
    } catch (e:any) { setError(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/crm/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          manufacturer: form.manufacturer,
          model: form.model,
          name: form.name,
          category: form.category,
          supplier_name: form.supplier,
          warranty_months: form.warranty ? parseInt(form.warranty,10) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setForm({ id: "", manufacturer: "", model: "", name: "", category: "", supplier: "", warranty: "" });
      await load();
    } catch (e:any) { setError(e.message); }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
      <h2 style={{ margin: 0 }}>Equipamentos — CRM-12 (fabricante/modelo, especificações, compatibilidades, fornecedor, garantia, ligação estoque, não confundir serviço com item físico)</h2>
      <p style={{ fontSize: 13, opacity: 0.8 }}>Tabela crm_equipment com manufacturer, model, name, description, specifications JSONB, compatibilities JSONB, category, supplier_name, warranty_months, stock_sku/location (ligação com estoque AST futuro). Serviço (service_catalog) é prestação; equipamento é item físico. API GET /api/crm/equipment?category=&manufacturer=&search= e POST cria. 3 exemplos iniciais: Hikvision DS-2CE56D0T, Intelbras VD 3104, Control iD iDFace aguardando validação técnica.</p>

      <form onSubmit={create} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <input placeholder="id (ex: hikvision_ds-2cd...)" value={form.id} onChange={e=>setForm({...form, id: e.target.value})} required style={{ padding: 6, minWidth: 180 }} />
        <input placeholder="fabricante" value={form.manufacturer} onChange={e=>setForm({...form, manufacturer: e.target.value})} required style={{ padding: 6 }} />
        <input placeholder="modelo" value={form.model} onChange={e=>setForm({...form, model: e.target.value})} required style={{ padding: 6 }} />
        <input placeholder="nome" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} required style={{ padding: 6, minWidth: 200 }} />
        <input placeholder="categoria (camera/dvr/controle_acesso)" value={form.category} onChange={e=>setForm({...form, category: e.target.value})} style={{ padding: 6 }} />
        <input placeholder="fornecedor" value={form.supplier} onChange={e=>setForm({...form, supplier: e.target.value})} style={{ padding: 6 }} />
        <input placeholder="garantia meses" value={form.warranty} onChange={e=>setForm({...form, warranty: e.target.value})} type="number" min={1} max={120} style={{ padding: 6, width: 120 }} />
        <button type="submit" style={{ padding: "6px 12px" }}>Criar equipamento</button>
        <button type="button" onClick={load} style={{ padding: "6px 12px" }}>Recarregar</button>
      </form>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input placeholder="filtrar categoria" value={filter.category} onChange={e=>setFilter({...filter, category: e.target.value})} style={{ padding: 6 }} />
        <input placeholder="buscar nome/modelo/fabricante" value={filter.search} onChange={e=>setFilter({...filter, search: e.target.value})} style={{ padding: 6, minWidth: 240 }} />
        <button onClick={load} style={{ padding: "6px 12px" }}>Filtrar</button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {loading && <p>Carregando...</p>}

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {items.map(eq=>(
          <article key={eq.id} style={{ border: "1px solid #ccc", borderRadius: 6, padding: 12, background: eq.is_active ? "#fff" : "#fee2e2" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 14 }}>{eq.name} <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#e0e7ff" }}>{eq.manufacturer} {eq.model}</span> <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: eq.is_validated ? "#dcfce7" : "#fef9c3" }}>{eq.is_validated ? "validado" : "aguarda validação"}</span></h3>
            <p style={{ margin: 0, fontSize: 12 }}><strong>Categoria:</strong> {eq.category || "-"} | <strong>Fornecedor:</strong> {eq.supplier_name || "-"} | <strong>Garantia:</strong> {eq.warranty_months ? `${eq.warranty_months}m` : "-"} | <strong>SKU estoque:</strong> {eq.stock_sku || "-"} | <strong>Local:</strong> {eq.stock_location || "-"}</p>
            <p style={{ margin: "4px 0 0", fontSize: 12 }}><strong>Descrição:</strong> {eq.description || "-"}</p>
            <p style={{ margin: "4px 0 0", fontSize: 11 }}><strong>Especificações:</strong> <code>{JSON.stringify(eq.specifications)}</code></p>
            <p style={{ margin: "4px 0 0", fontSize: 11 }}><strong>Compatibilidades:</strong> {Array.isArray(eq.compatibilities) ? eq.compatibilities.join(", ") : JSON.stringify(eq.compatibilities)}</p>
            <p style={{ margin: "4px 0 0", fontSize: 10, opacity: 0.6 }}>ID: {eq.id} | Ativo: {eq.is_active ? "sim" : "não"}</p>
          </article>
        ))}
      </div>
      <p style={{ fontSize: 11, opacity: 0.6, marginTop: 12 }}>Total: {items.length} equipamentos. Não confundir serviço (service_catalog) com item físico (crm_equipment). Ligação com estoque via stock_sku/location, futura tabela ast_stock_movements referenciará equipment_id.</p>
    </section>
  );
}
