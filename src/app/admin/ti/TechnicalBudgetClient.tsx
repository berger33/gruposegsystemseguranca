"use client";
import { useEffect, useState } from "react";

type Budget = { id: string; company_id: string; title: string; status: string; total_cost: string; total_price: string; total_materials_cost: string; total_equipment_cost: string; total_labor_cost: string; total_installation_cost: string; total_displacement_cost: string; total_infrastructure_cost: string; total_licenses_cost: string; total_warranty_cost: string; total_maintenance_cost: string; warranty_description: string | null; maintenance_description: string | null; };
type Item = { id: string; type: string; description: string; quantity: string; unit: string | null; unit_cost: string; total_cost: string; total_price: string; supplier_name: string | null; };

export default function TechnicalBudgetClient() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ companyId: "", title: "", warranty: "", maintenance: "" });
  const [itemForm, setItemForm] = useState({ type: "material", description: "", quantity: "1", unit: "un", unitCost: "", unitPrice: "", supplier: "" });

  async function loadBudgets() {
    setLoading(true);
    try {
      const res = await fetch("/api/crm/technical-budgets?limit=50", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setBudgets(data.budgets || []);
    } catch (e:any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function loadItems(budgetId: string) {
    try {
      const res = await fetch(`/api/crm/technical-budgets/${budgetId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setItems(data.items || []);
      setSelected(budgetId);
    } catch (e:any) { setError(e.message); }
  }

  useEffect(() => { loadBudgets(); }, []);

  async function createBudget(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/crm/technical-budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: form.companyId, title: form.title, warranty_description: form.warranty || null, maintenance_description: form.maintenance || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setForm({ companyId: "", title: "", warranty: "", maintenance: "" });
      await loadBudgets();
    } catch (e:any) { setError(e.message); }
  }

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) { alert("Selecione orçamento"); return; }
    setError("");
    try {
      const res = await fetch(`/api/crm/technical-budgets/${selected}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: itemForm.type,
          description: itemForm.description,
          quantity: parseFloat(itemForm.quantity) || 1,
          unit: itemForm.unit || "un",
          unit_cost: parseFloat(itemForm.unitCost) || 0,
          unit_price: parseFloat(itemForm.unitPrice) || parseFloat(itemForm.unitCost) || 0,
          supplier_name: itemForm.supplier || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setItemForm({ type: "material", description: "", quantity: "1", unit: "un", unitCost: "", unitPrice: "", supplier: "" });
      await loadItems(selected);
      await loadBudgets();
    } catch (e:any) { setError(e.message); }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
      <h2 style={{ margin: 0 }}>Orçamento técnico — CRM-15 (materiais, equipamentos, mão de obra, instalação, deslocamento, infraestrutura, licenças, garantia, manutenção)</h2>
      <p style={{ fontSize: 13, opacity: 0.8 }}>Tabelas crm_technical_budgets (company_id, opportunity_id, inspection_id, labor_budget_id, title, status rascunho/em_revisao/aprovado/arquivado, totais por tipo materials/equipment/labor/installation/displacement/infrastructure/licenses/warranty/maintenance, total_cost/price, margin_percent, warranty_description, maintenance_description, approved_by/at) + crm_technical_budget_items (budget_id, type material/equipamento/mao_obra/instalacao/deslocamento/infraestrutura/licenca/garantia/manutencao/outro, description 500, equipment_id FK crm_equipment, quantity numeric, unit 50, unit_cost/total_cost/unit_price/total_price numeric 12,2, supplier_name, notes). Cálculo: total_cost = quantity * unit_cost, total_price = quantity * unit_price, totais por tipo somados no orçamento. API GET /api/crm/technical-budgets, POST cria, GET /:id com items, PATCH status, POST /:id/items cria item e recalcula totais por tipo.</p>

      <form onSubmit={createBudget} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <input placeholder="company_id UUID" value={form.companyId} onChange={e=>setForm({...form, companyId: e.target.value})} required style={{ padding: 6, minWidth: 300 }} />
        <input placeholder="título orçamento técnico" value={form.title} onChange={e=>setForm({...form, title: e.target.value})} required maxLength={200} style={{ padding: 6, minWidth: 240 }} />
        <input placeholder="garantia descrição" value={form.warranty} onChange={e=>setForm({...form, warranty: e.target.value})} style={{ padding: 6, minWidth: 200 }} />
        <input placeholder="manutenção descrição" value={form.maintenance} onChange={e=>setForm({...form, maintenance: e.target.value})} style={{ padding: 6, minWidth: 200 }} />
        <button type="submit" style={{ padding: "6px 12px" }}>Criar orçamento técnico</button>
        <button type="button" onClick={loadBudgets} style={{ padding: "6px 12px" }}>Recarregar</button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {loading && <p>Carregando...</p>}

      <div style={{ marginTop: 12, maxHeight: 350, overflow: "auto", border: "1px solid #eee" }}>
        <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
          <thead><tr><th>Título</th><th>Status</th><th>Custo total</th><th>Preço total</th><th>Materiais</th><th>Equip</th><th>Mão obra</th><th>Instalação</th><th>Desloc</th><th>Infra</th><th>Licenças</th><th>Garantia</th><th>Manut</th><th>Ação</th></tr></thead>
          <tbody>
            {budgets.map(b=>(
              <tr key={b.id} style={{ borderTop: "1px solid #eee", background: selected===b.id ? "#dbeafe" : "#fff" }}>
                <td>{b.title}</td>
                <td>{b.status}</td>
                <td>R$ {b.total_cost}</td>
                <td>R$ {b.total_price}</td>
                <td>R$ {b.total_materials_cost}</td>
                <td>R$ {b.total_equipment_cost}</td>
                <td>R$ {b.total_labor_cost}</td>
                <td>R$ {b.total_installation_cost}</td>
                <td>R$ {b.total_displacement_cost}</td>
                <td>R$ {b.total_infrastructure_cost}</td>
                <td>R$ {b.total_licenses_cost}</td>
                <td>R$ {b.total_warranty_cost}</td>
                <td>R$ {b.total_maintenance_cost}</td>
                <td><button onClick={()=>loadItems(b.id)} style={{ padding: "2px 6px", fontSize: 10 }}>Ver itens</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #ccc", borderRadius: 6, background: "#f9fafb" }}>
          <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Itens do orçamento técnico {selected.slice(0,8)} — materiais, equipamentos, mão de obra, instalação, deslocamento, infraestrutura, licenças, garantia, manutenção</h3>
          <form onSubmit={createItem} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <select value={itemForm.type} onChange={e=>setItemForm({...itemForm, type: e.target.value})} style={{ padding: 6 }}>
              <option value="material">material</option>
              <option value="equipamento">equipamento</option>
              <option value="mao_obra">mao_obra</option>
              <option value="instalacao">instalacao</option>
              <option value="deslocamento">deslocamento</option>
              <option value="infraestrutura">infraestrutura</option>
              <option value="licenca">licenca</option>
              <option value="garantia">garantia</option>
              <option value="manutencao">manutencao</option>
              <option value="outro">outro</option>
            </select>
            <input placeholder="descrição ex: Câmera Dome, Cabo, Instalação" value={itemForm.description} onChange={e=>setItemForm({...itemForm, description: e.target.value})} required maxLength={500} style={{ padding: 6, minWidth: 200 }} />
            <input placeholder="qtd" value={itemForm.quantity} onChange={e=>setItemForm({...itemForm, quantity: e.target.value})} type="number" step="0.01" style={{ padding: 6, width: 70 }} />
            <input placeholder="un (un, m, h)" value={itemForm.unit} onChange={e=>setItemForm({...itemForm, unit: e.target.value})} style={{ padding: 6, width: 60 }} />
            <input placeholder="custo unit" value={itemForm.unitCost} onChange={e=>setItemForm({...itemForm, unitCost: e.target.value})} type="number" step="0.01" style={{ padding: 6, width: 100 }} />
            <input placeholder="preço unit" value={itemForm.unitPrice} onChange={e=>setItemForm({...itemForm, unitPrice: e.target.value})} type="number" step="0.01" style={{ padding: 6, width: 100 }} />
            <input placeholder="fornecedor" value={itemForm.supplier} onChange={e=>setItemForm({...itemForm, supplier: e.target.value})} style={{ padding: 6, width: 140 }} />
            <button type="submit" style={{ padding: "6px 12px" }}>Adicionar item</button>
          </form>
          <div style={{ marginTop: 8, maxHeight: 300, overflow: "auto", border: "1px solid #eee", background: "#fff" }}>
            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
              <thead><tr><th>Tipo</th><th>Descrição</th><th>Qtd</th><th>Un</th><th>Custo unit</th><th>Custo total</th><th>Preço total</th><th>Fornecedor</th></tr></thead>
              <tbody>
                {items.map(it=>(
                  <tr key={it.id} style={{ borderTop: "1px solid #eee" }}>
                    <td>{it.type}</td>
                    <td>{it.description}</td>
                    <td>{it.quantity}</td>
                    <td>{it.unit || "-"}</td>
                    <td>R$ {it.unit_cost}</td>
                    <td>R$ {it.total_cost}</td>
                    <td>R$ {it.total_price}</td>
                    <td>{it.supplier_name || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
