"use client";
import { useEffect, useState } from "react";

type Budget = { id: string; company_id: string; title: string; status: string; total_cost: string; total_price: string; coverage: any; };
type Item = { id: string; role_name: string; quantity: number; salary: string; total_cost: string; total_price: string; shift_type: string | null; };

export default function LaborBudgetClient() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ companyId: "", title: "", coverage: "" });
  const [itemForm, setItemForm] = useState({ role: "", quantity: "1", salary: "", shift: "", substitution: "", supervision: "", uniform: "", displacement: "", materials: "", indirect: "" });

  async function loadBudgets() {
    setLoading(true);
    try {
      const res = await fetch("/api/crm/labor-budgets?limit=50", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setBudgets(data.budgets || []);
    } catch (e:any) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function loadItems(budgetId: string) {
    try {
      const res = await fetch(`/api/crm/labor-budgets/${budgetId}`, { cache: "no-store" });
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
      const coverage = form.coverage ? JSON.parse(form.coverage) : {};
      const res = await fetch("/api/crm/labor-budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: form.companyId, title: form.title, coverage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setForm({ companyId: "", title: "", coverage: "" });
      await loadBudgets();
    } catch (e:any) { setError(e.message); }
  }

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) { alert("Selecione orçamento"); return; }
    setError("");
    try {
      const res = await fetch(`/api/crm/labor-budgets/${selected}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role_name: itemForm.role,
          quantity: parseInt(itemForm.quantity,10),
          salary: parseFloat(itemForm.salary) || 0,
          shift_type: itemForm.shift || null,
          substitution_cost: parseFloat(itemForm.substitution) || 0,
          supervision_cost: parseFloat(itemForm.supervision) || 0,
          uniform_cost: parseFloat(itemForm.uniform) || 0,
          displacement_cost: parseFloat(itemForm.displacement) || 0,
          materials_cost: parseFloat(itemForm.materials) || 0,
          indirect_cost: parseFloat(itemForm.indirect) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setItemForm({ role: "", quantity: "1", salary: "", shift: "", substitution: "", supervision: "", uniform: "", displacement: "", materials: "", indirect: "" });
      await loadItems(selected);
      await loadBudgets();
    } catch (e:any) { setError(e.message); }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
      <h2 style={{ margin: 0 }}>Orçamento mão de obra — CRM-14 (cobertura, salários, benefícios, provisões, substituição, supervisão, uniforme/EPI, deslocamento, materiais, indiretos)</h2>
      <p style={{ fontSize: 13, opacity: 0.8 }}>Tabelas crm_labor_budgets (company_id, opportunity_id, inspection_id, title, status rascunho/em_revisao/aprovado/arquivado, coverage JSONB, total_cost/price, margin_percent, approved_by/at) + crm_labor_budget_items (budget_id, role_name, function_name, quantity, shift_type, salary, benefits JSONB, provisions JSONB, substitution_cost, supervision_cost, uniform_cost, displacement_cost, materials_cost, indirect_cost, other_costs JSONB, total_cost, unit_price, total_price). Cálculo: total por unidade = salário + benefícios + provisões + substituição + supervisão + uniforme + deslocamento + materiais + indiretos + outros, total = por unidade * quantidade. API GET /api/crm/labor-budgets, POST cria, GET /:id com items, PATCH status, POST /:id/items cria item e recalcula totais orçamento.</p>

      <form onSubmit={createBudget} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <input placeholder="company_id UUID" value={form.companyId} onChange={e=>setForm({...form, companyId: e.target.value})} required style={{ padding: 6, minWidth: 300 }} />
        <input placeholder="título orçamento" value={form.title} onChange={e=>setForm({...form, title: e.target.value})} required maxLength={200} style={{ padding: 6, minWidth: 240 }} />
        <input placeholder='coverage JSON ex: {"postos":2,"turnos":"12x36"}' value={form.coverage} onChange={e=>setForm({...form, coverage: e.target.value})} style={{ padding: 6, minWidth: 240 }} />
        <button type="submit" style={{ padding: "6px 12px" }}>Criar orçamento</button>
        <button type="button" onClick={loadBudgets} style={{ padding: "6px 12px" }}>Recarregar</button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {loading && <p>Carregando...</p>}

      <div style={{ marginTop: 12, maxHeight: 300, overflow: "auto", border: "1px solid #eee" }}>
        <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
          <thead><tr><th>Título</th><th>Status</th><th>Custo total</th><th>Preço total</th><th>Cobertura</th><th>Ação</th></tr></thead>
          <tbody>
            {budgets.map(b=>(
              <tr key={b.id} style={{ borderTop: "1px solid #eee", background: selected===b.id ? "#dbeafe" : "#fff" }}>
                <td>{b.title}</td>
                <td>{b.status}</td>
                <td>R$ {b.total_cost}</td>
                <td>R$ {b.total_price}</td>
                <td><code>{JSON.stringify(b.coverage)}</code></td>
                <td><button onClick={()=>loadItems(b.id)} style={{ padding: "2px 6px", fontSize: 10 }}>Ver itens</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #ccc", borderRadius: 6, background: "#f9fafb" }}>
          <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Itens do orçamento {selected.slice(0,8)} — composição</h3>
          <form onSubmit={createItem} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input placeholder="cargo/função ex: vigilante" value={itemForm.role} onChange={e=>setItemForm({...itemForm, role: e.target.value})} required style={{ padding: 6, minWidth: 140 }} />
            <input placeholder="qtd" value={itemForm.quantity} onChange={e=>setItemForm({...itemForm, quantity: e.target.value})} type="number" min={1} style={{ padding: 6, width: 60 }} />
            <input placeholder="salário" value={itemForm.salary} onChange={e=>setItemForm({...itemForm, salary: e.target.value})} type="number" step="0.01" style={{ padding: 6, width: 100 }} />
            <input placeholder="turno ex: 12x36" value={itemForm.shift} onChange={e=>setItemForm({...itemForm, shift: e.target.value})} style={{ padding: 6, width: 100 }} />
            <input placeholder="substituição" value={itemForm.substitution} onChange={e=>setItemForm({...itemForm, substitution: e.target.value})} type="number" step="0.01" style={{ padding: 6, width: 100 }} />
            <input placeholder="supervisão" value={itemForm.supervision} onChange={e=>setItemForm({...itemForm, supervision: e.target.value})} type="number" step="0.01" style={{ padding: 6, width: 100 }} />
            <input placeholder="uniforme/EPI" value={itemForm.uniform} onChange={e=>setItemForm({...itemForm, uniform: e.target.value})} type="number" step="0.01" style={{ padding: 6, width: 100 }} />
            <input placeholder="deslocamento" value={itemForm.displacement} onChange={e=>setItemForm({...itemForm, displacement: e.target.value})} type="number" step="0.01" style={{ padding: 6, width: 100 }} />
            <input placeholder="materiais" value={itemForm.materials} onChange={e=>setItemForm({...itemForm, materials: e.target.value})} type="number" step="0.01" style={{ padding: 6, width: 100 }} />
            <input placeholder="indiretos" value={itemForm.indirect} onChange={e=>setItemForm({...itemForm, indirect: e.target.value})} type="number" step="0.01" style={{ padding: 6, width: 100 }} />
            <button type="submit" style={{ padding: "6px 12px" }}>Adicionar item</button>
          </form>
          <div style={{ marginTop: 8, maxHeight: 300, overflow: "auto", border: "1px solid #eee", background: "#fff" }}>
            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
              <thead><tr><th>Cargo</th><th>Qtd</th><th>Turno</th><th>Salário</th><th>Custo total</th><th>Preço total</th></tr></thead>
              <tbody>
                {items.map(it=>(
                  <tr key={it.id} style={{ borderTop: "1px solid #eee" }}>
                    <td>{it.role_name}</td>
                    <td>{it.quantity}</td>
                    <td>{it.shift_type || "-"}</td>
                    <td>R$ {it.salary}</td>
                    <td>R$ {it.total_cost}</td>
                    <td>R$ {it.total_price}</td>
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
