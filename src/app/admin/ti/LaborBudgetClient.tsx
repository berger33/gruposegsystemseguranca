"use client";

import { useEffect, useState } from "react";
import UiState from "@/components/ui/UiState";
import UiTableScroll from "@/components/ui/UiTableScroll";
import styles from "@/components/ui/CommercialEstimate.module.css";

type Budget = { id: string; company_id: string; title: string; status: string; total_cost: string; total_price: string; coverage: unknown };
type Item = { id: string; role_name: string; quantity: number; salary: string; total_cost: string; total_price: string; shift_type: string | null };
const money = (value: unknown) => value == null || value === "" || !Number.isFinite(Number(value)) ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));
const errorMessage = (error: unknown) => error instanceof Error && error.message ? error.message : "Não foi possível concluir a operação. Tente novamente.";

export default function LaborBudgetClient() {
  const [budgets, setBudgets] = useState<Budget[]>([]); const [items, setItems] = useState<Item[]>([]); const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ companyId: "", title: "", coverage: "" });
  const [itemForm, setItemForm] = useState({ role: "", quantity: "1", salary: "", shift: "", substitution: "", supervision: "", uniform: "", displacement: "", materials: "", indirect: "" });
  async function loadBudgets() {
    setLoading(true); setError("");
    try { const res = await fetch("/api/crm/labor-budgets?limit=50", { cache: "no-store" }); const data = await res.json(); if (!res.ok) throw new Error(data.error || "Falha ao carregar orçamentos."); setBudgets(Array.isArray(data.budgets) ? data.budgets : []); }
    catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }
  async function loadItems(id: string) {
    setError(""); try { const res = await fetch(`/api/crm/labor-budgets/${id}`, { cache: "no-store" }); const data = await res.json(); if (!res.ok) throw new Error(data.error || "Falha ao consultar a composição."); setItems(Array.isArray(data.items) ? data.items : []); setSelected(id); }
    catch (e) { setError(errorMessage(e)); }
  }
  useEffect(() => { void loadBudgets(); }, []);
  async function createBudget(e: React.FormEvent) {
    e.preventDefault(); setError(""); setNotice(""); setSaving(true);
    try {
      const coverage = form.coverage ? JSON.parse(form.coverage) : {};
      const res = await fetch("/api/crm/labor-budgets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company_id: form.companyId, title: form.title, coverage }) }); const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao criar orçamento."); setForm({ companyId: "", title: "", coverage: "" }); setNotice("Orçamento de mão de obra criado."); await loadBudgets();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  }
  async function createItem(e: React.FormEvent) {
    e.preventDefault(); if (!selected) return; setError(""); setNotice(""); setSaving(true);
    try {
      const res = await fetch(`/api/crm/labor-budgets/${selected}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role_name: itemForm.role, quantity: parseInt(itemForm.quantity,10), salary: parseFloat(itemForm.salary) || 0, shift_type: itemForm.shift || null, substitution_cost: parseFloat(itemForm.substitution) || 0, supervision_cost: parseFloat(itemForm.supervision) || 0, uniform_cost: parseFloat(itemForm.uniform) || 0, displacement_cost: parseFloat(itemForm.displacement) || 0, materials_cost: parseFloat(itemForm.materials) || 0, indirect_cost: parseFloat(itemForm.indirect) || 0 }) }); const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao adicionar composição."); setItemForm({ role: "", quantity: "1", salary: "", shift: "", substitution: "", supervision: "", uniform: "", displacement: "", materials: "", indirect: "" }); setNotice("Composição adicionada e totais atualizados."); await loadItems(selected); await loadBudgets();
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  }
  return <section className={styles.workspace} aria-labelledby="labor-budget-title">
    <header className={styles.header}><div><p className={styles.eyebrow}>Comercial · CRM-14</p><h2 id="labor-budget-title">Orçamento de mão de obra</h2><p>Estime a composição por função e turno, incluindo os custos operacionais já previstos no cadastro.</p></div><div className={styles.count}><strong>{budgets.length}</strong><span>orçamentos carregados · limite 50</span></div></header>
    <form className={styles.form} onSubmit={createBudget}><h3>Novo orçamento</h3>
      <label className={styles.field}>Identificador da empresa (UUID)<input value={form.companyId} onChange={e=>setForm({...form,companyId:e.target.value})} required autoComplete="off" /></label>
      <label className={styles.field}>Título do orçamento<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required maxLength={200} /></label>
      <label className={styles.field}>Cobertura da operação (JSON)<textarea value={form.coverage} onChange={e=>setForm({...form,coverage:e.target.value})} rows={3} placeholder='Ex.: {"postos":2,"turnos":"12x36"}' aria-describedby="coverage-help" /></label>
      <p className={styles.hint} id="coverage-help">Campo técnico mantido para detalhar postos e turnos; deixe vazio se não houver informação. JSON inválido será informado antes do envio.</p>
      <div className={styles.actions}><button className={styles.primary} disabled={saving}>{saving ? "Salvando…" : "Criar orçamento"}</button><button type="button" onClick={()=>void loadBudgets()} disabled={loading}>Atualizar lista</button></div>
    </form>
    {error && <UiState variant="error" title="Não foi possível atualizar esta área" detail={error} />}{notice && <UiState variant="success" title={notice} />}
    <div className={styles.sectionHeading}><div><h3>Orçamentos cadastrados</h3><p>Os dados de cobertura ficam recolhidos no detalhe de cada orçamento.</p></div></div>
    {loading ? <UiState variant="loading" title="Carregando orçamentos" /> : budgets.length ? <UiTableScroll><table className={styles.table}><caption>Até 50 orçamentos de mão de obra mais recentes</caption><thead><tr><th>Orçamento</th><th>Situação</th><th>Custo total</th><th>Preço total</th><th>Ação</th></tr></thead><tbody>{budgets.map(b=><tr key={b.id} aria-current={selected===b.id ? "true" : undefined}><th scope="row">{b.title}<span className={styles.secondary}>Empresa · {b.company_id}</span></th><td><span className={styles.badge}>{b.status}</span></td><td>{money(b.total_cost)}</td><td>{money(b.total_price)}</td><td><button type="button" onClick={()=>void loadItems(b.id)}>Ver composição</button></td></tr>)}</tbody></table></UiTableScroll> : <UiState variant="empty" title="Nenhum orçamento de mão de obra encontrado" detail="Crie um orçamento para começar a estimar funções, turnos e custos." />}
    {selected && <section className={styles.detail} aria-labelledby="labor-items-title"><header className={styles.sectionHeading}><div><p className={styles.eyebrow}>Composição</p><h3 id="labor-items-title">Equipe e custos</h3><p>Identificador do orçamento: <code>{selected}</code></p></div><div className={styles.count}><strong>{items.length}</strong><span>funções</span></div></header>
      <details><summary>Ver cobertura informada (dados técnicos)</summary><pre className={styles.json}>{JSON.stringify(budgets.find(b=>b.id===selected)?.coverage ?? {}, null, 2)}</pre></details>
      <form className={styles.form} onSubmit={createItem}><h3>Adicionar função à composição</h3>
        <label className={styles.field}>Cargo ou função<input value={itemForm.role} onChange={e=>setItemForm({...itemForm,role:e.target.value})} required /></label>
        <label className={styles.field}>Quantidade<input value={itemForm.quantity} onChange={e=>setItemForm({...itemForm,quantity:e.target.value})} type="number" min="1" step="1" required /></label>
        <label className={styles.field}>Salário mensal (R$)<input value={itemForm.salary} onChange={e=>setItemForm({...itemForm,salary:e.target.value})} type="number" min="0" step="0.01" /></label>
        <label className={styles.field}>Turno<input value={itemForm.shift} onChange={e=>setItemForm({...itemForm,shift:e.target.value})} placeholder="Ex.: 12x36" /></label>
        <label className={styles.field}>Substituição (R$)<input value={itemForm.substitution} onChange={e=>setItemForm({...itemForm,substitution:e.target.value})} type="number" min="0" step="0.01" /></label>
        <label className={styles.field}>Supervisão (R$)<input value={itemForm.supervision} onChange={e=>setItemForm({...itemForm,supervision:e.target.value})} type="number" min="0" step="0.01" /></label>
        <label className={styles.field}>Uniforme e EPI (R$)<input value={itemForm.uniform} onChange={e=>setItemForm({...itemForm,uniform:e.target.value})} type="number" min="0" step="0.01" /></label>
        <label className={styles.field}>Deslocamento (R$)<input value={itemForm.displacement} onChange={e=>setItemForm({...itemForm,displacement:e.target.value})} type="number" min="0" step="0.01" /></label>
        <label className={styles.field}>Materiais (R$)<input value={itemForm.materials} onChange={e=>setItemForm({...itemForm,materials:e.target.value})} type="number" min="0" step="0.01" /></label>
        <label className={styles.field}>Custos indiretos (R$)<input value={itemForm.indirect} onChange={e=>setItemForm({...itemForm,indirect:e.target.value})} type="number" min="0" step="0.01" /></label>
        <div className={styles.actions}><button className={styles.primary} disabled={saving}>{saving ? "Salvando…" : "Adicionar função"}</button></div>
      </form>
      {items.length ? <UiTableScroll><table className={styles.table}><caption>Resumo das funções e valores</caption><thead><tr><th>Função</th><th>Quantidade</th><th>Turno</th><th>Salário</th><th>Custo total</th><th>Preço total</th></tr></thead><tbody>{items.map(it=><tr key={it.id}><th scope="row">{it.role_name}</th><td>{it.quantity}</td><td>{it.shift_type || "—"}</td><td>{money(it.salary)}</td><td>{money(it.total_cost)}</td><td>{money(it.total_price)}</td></tr>)}</tbody></table></UiTableScroll> : <UiState variant="empty" title="Nenhuma função cadastrada" detail="Adicione uma função para visualizar a composição do orçamento." />}
    </section>}
  </section>;
}
