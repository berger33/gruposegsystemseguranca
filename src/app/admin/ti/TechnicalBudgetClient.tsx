"use client";

import { useEffect, useState } from "react";
import UiState from "@/components/ui/UiState";
import UiTableScroll from "@/components/ui/UiTableScroll";
import styles from "@/components/ui/CommercialEstimate.module.css";

type Budget = { id: string; company_id: string; title: string; status: string; total_cost: string; total_price: string; total_materials_cost: string; total_equipment_cost: string; total_labor_cost: string; total_installation_cost: string; total_displacement_cost: string; total_infrastructure_cost: string; total_licenses_cost: string; total_warranty_cost: string; total_maintenance_cost: string; warranty_description: string | null; maintenance_description: string | null };
type Item = { id: string; type: string; description: string; quantity: string; unit: string | null; unit_cost: string; total_cost: string; total_price: string; supplier_name: string | null };

const categories = ["material", "equipamento", "mao_obra", "instalacao", "deslocamento", "infraestrutura", "licenca", "garantia", "manutencao", "outro"];
const categoryLabels: Record<string, string> = { material: "Material", equipamento: "Equipamento", mao_obra: "Mão de obra", instalacao: "Instalação", deslocamento: "Deslocamento", infraestrutura: "Infraestrutura", licenca: "Licença", garantia: "Garantia", manutencao: "Manutenção", outro: "Outro" };
const money = (value: unknown) => value == null || value === "" || !Number.isFinite(Number(value)) ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
const errorMessage = (error: unknown) => error instanceof Error && error.message ? error.message : "Não foi possível concluir a operação. Tente novamente.";

export default function TechnicalBudgetClient() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ companyId: "", title: "", warranty: "", maintenance: "" });
  const [itemForm, setItemForm] = useState({ type: "material", description: "", quantity: "1", unit: "un", unitCost: "", unitPrice: "", supplier: "" });

  async function loadBudgets() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/crm/technical-budgets?limit=50", { cache: "no-store" }); const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar orçamentos.");
      setBudgets(Array.isArray(data.budgets) ? data.budgets : []);
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }
  async function loadItems(budgetId: string) {
    setError("");
    try {
      const res = await fetch(`/api/crm/technical-budgets/${budgetId}`, { cache: "no-store" }); const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao consultar os itens.");
      setItems(Array.isArray(data.items) ? data.items : []); setSelected(budgetId);
    } catch (e) { setError(errorMessage(e)); }
  }
  useEffect(() => { void loadBudgets(); }, []);

  async function createBudget(e: React.FormEvent) {
    e.preventDefault(); setError(""); setNotice(""); setSaving(true);
    try {
      const res = await fetch("/api/crm/technical-budgets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company_id: form.companyId, title: form.title, warranty_description: form.warranty || null, maintenance_description: form.maintenance || null }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Falha ao criar orçamento.");
      setForm({ companyId: "", title: "", warranty: "", maintenance: "" }); setNotice("Orçamento técnico criado."); await loadBudgets();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  }
  async function createItem(e: React.FormEvent) {
    e.preventDefault(); if (!selected) return; setError(""); setNotice(""); setSaving(true);
    try {
      const res = await fetch(`/api/crm/technical-budgets/${selected}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: itemForm.type, description: itemForm.description, quantity: parseFloat(itemForm.quantity) || 1, unit: itemForm.unit || "un", unit_cost: parseFloat(itemForm.unitCost) || 0, unit_price: parseFloat(itemForm.unitPrice) || parseFloat(itemForm.unitCost) || 0, supplier_name: itemForm.supplier || null }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || "Falha ao adicionar item.");
      setItemForm({ type: "material", description: "", quantity: "1", unit: "un", unitCost: "", unitPrice: "", supplier: "" }); setNotice("Item adicionado e totais atualizados."); await loadItems(selected); await loadBudgets();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  }

  return <section className={styles.workspace} aria-labelledby="technical-budget-title">
    <header className={styles.header}><div><p className={styles.eyebrow}>Comercial · CRM-15</p><h2 id="technical-budget-title">Orçamento técnico</h2><p>Monte o custo e o preço da proposta por categoria. Os totais são calculados pelo sistema a partir dos itens cadastrados.</p></div><div className={styles.count}><strong>{budgets.length}</strong><span>orçamentos carregados · limite 50</span></div></header>
    <form className={styles.form} onSubmit={createBudget}>
      <h3>Novo orçamento</h3><p className={styles.hint}>Vincule o orçamento à empresa pelo identificador UUID já utilizado no CRM.</p>
      <label className={styles.field}>Identificador da empresa (UUID)<input value={form.companyId} onChange={e=>setForm({...form, companyId:e.target.value})} required autoComplete="off" /></label>
      <label className={styles.field}>Título do orçamento<input value={form.title} onChange={e=>setForm({...form, title:e.target.value})} required maxLength={200} /></label>
      <label className={styles.field}>Descrição da garantia<input value={form.warranty} onChange={e=>setForm({...form, warranty:e.target.value})} /></label>
      <label className={styles.field}>Descrição da manutenção<input value={form.maintenance} onChange={e=>setForm({...form, maintenance:e.target.value})} /></label>
      <div className={styles.actions}><button className={styles.primary} disabled={saving}>{saving ? "Salvando…" : "Criar orçamento"}</button><button type="button" onClick={()=>void loadBudgets()} disabled={loading}>Atualizar lista</button></div>
    </form>
    {error && <UiState variant="error" title="Não foi possível atualizar esta área" detail={error} />}{notice && <UiState variant="success" title={notice} />}
    <div className={styles.sectionHeading}><div><h3>Orçamentos cadastrados</h3><p>Custos por categoria ficam disponíveis nos itens do orçamento.</p></div></div>
    {loading ? <UiState variant="loading" title="Carregando orçamentos" /> : budgets.length ? <UiTableScroll><table className={styles.table}><caption>Até 50 orçamentos técnicos mais recentes</caption><thead><tr><th>Orçamento</th><th>Situação</th><th>Custo total</th><th>Preço total</th><th>Ação</th></tr></thead><tbody>{budgets.map(b=><tr key={b.id} aria-current={selected===b.id ? "true" : undefined}><th scope="row">{b.title}<span className={styles.secondary}>Empresa · {b.company_id}</span></th><td><span className={styles.badge}>{b.status}</span></td><td>{money(b.total_cost)}</td><td>{money(b.total_price)}</td><td><button type="button" onClick={()=>void loadItems(b.id)}>Ver composição</button></td></tr>)}</tbody></table></UiTableScroll> : <UiState variant="empty" title="Nenhum orçamento técnico encontrado" detail="Crie um orçamento para começar a detalhar os materiais, serviços e custos." />}
    {selected && <section className={styles.detail} aria-labelledby="technical-items-title"><header className={styles.sectionHeading}><div><p className={styles.eyebrow}>Composição</p><h3 id="technical-items-title">Itens do orçamento</h3><p>Identificador do orçamento: <code>{selected}</code></p></div><div className={styles.count}><strong>{items.length}</strong><span>itens</span></div></header>
      <form className={styles.form} onSubmit={createItem}><h3>Adicionar item</h3>
        <label className={styles.field}>Categoria<select value={itemForm.type} onChange={e=>setItemForm({...itemForm,type:e.target.value})}>{categories.map(c=><option key={c} value={c}>{categoryLabels[c]}</option>)}</select></label>
        <label className={styles.field}>Descrição<input value={itemForm.description} onChange={e=>setItemForm({...itemForm,description:e.target.value})} required maxLength={500} /></label>
        <label className={styles.field}>Quantidade<input value={itemForm.quantity} onChange={e=>setItemForm({...itemForm,quantity:e.target.value})} type="number" min="0.01" step="0.01" required /></label>
        <label className={styles.field}>Unidade<input value={itemForm.unit} onChange={e=>setItemForm({...itemForm,unit:e.target.value})} /></label>
        <label className={styles.field}>Custo unitário (R$)<input value={itemForm.unitCost} onChange={e=>setItemForm({...itemForm,unitCost:e.target.value})} type="number" min="0" step="0.01" /></label>
        <label className={styles.field}>Preço unitário (R$)<input value={itemForm.unitPrice} onChange={e=>setItemForm({...itemForm,unitPrice:e.target.value})} type="number" min="0" step="0.01" /></label>
        <label className={styles.field}>Fornecedor<input value={itemForm.supplier} onChange={e=>setItemForm({...itemForm,supplier:e.target.value})} /></label>
        <div className={styles.actions}><button className={styles.primary} disabled={saving}>{saving ? "Salvando…" : "Adicionar item"}</button></div>
      </form>
      {items.length ? <UiTableScroll><table className={styles.table}><caption>Composição de custo e preço</caption><thead><tr><th>Categoria</th><th>Descrição</th><th>Quantidade</th><th>Unidade</th><th>Custo unitário</th><th>Custo total</th><th>Preço total</th><th>Fornecedor</th></tr></thead><tbody>{items.map(it=><tr key={it.id}><td>{categoryLabels[it.type] || it.type}</td><th scope="row">{it.description}</th><td>{it.quantity}</td><td>{it.unit || "—"}</td><td>{money(it.unit_cost)}</td><td>{money(it.total_cost)}</td><td>{money(it.total_price)}</td><td>{it.supplier_name || "—"}</td></tr>)}</tbody></table></UiTableScroll> : <UiState variant="empty" title="Este orçamento ainda não tem itens" detail="Use o formulário acima para registrar a composição." />}
    </section>}
  </section>;
}
