"use client";

import { useEffect, useState } from "react";
import UiState from "@/components/ui/UiState";
import styles from "@/components/ui/CommercialCatalog.module.css";

type Equipment = { id: string; manufacturer: string; model: string; name: string; description: string | null; specifications: unknown; compatibilities: unknown[]; category: string | null; supplier_name: string | null; warranty_months: number | null; stock_sku: string | null; stock_location: string | null; is_active: boolean; is_validated: boolean };
type EquipmentResponse = { equipment?: Equipment[]; total?: number; limit?: number; offset?: number; error?: string };
const errorLabels: Record<string,string> = { admin_session_required: "Sua sessão expirou. Entre novamente para consultar os equipamentos.", same_origin_required: "A solicitação foi recusada pela proteção de origem.", equipment_unavailable: "A lista de equipamentos está temporariamente indisponível.", create_failed: "Não foi possível cadastrar o equipamento. Tente novamente.", invalid_fields: "Preencha fabricante, modelo, nome e identificador.", invalid_warranty: "A garantia deve estar entre 1 e 120 meses.", equipment_exists: "Já existe um equipamento com este identificador." };
const errorLabel = (error: unknown) => { const code = error instanceof Error ? error.message : ""; return errorLabels[code] || "Não foi possível concluir a operação. Tente novamente."; };
const dash = (value: unknown) => value == null || value === "" ? "Não informado" : String(value);

export default function EquipmentClient() {
  const [items, setItems] = useState<Equipment[]>([]); const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false); const [loaded, setLoaded] = useState(false); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState({ category: "", search: "" });
  const [form, setForm] = useState({ id: "", manufacturer: "", model: "", name: "", category: "", supplier: "", warranty: "" });
  async function load(filters = filter) {
    setLoading(true); setLoaded(false); setError(""); setNotice("");
    try {
      const params = new URLSearchParams(); if (filters.category) params.set("category", filters.category); if (filters.search) params.set("search", filters.search);
      const res = await fetch(`/api/crm/equipment?${params.toString()}`, { cache: "no-store" }); const data: EquipmentResponse = await res.json();
      if (!res.ok) throw new Error(data.error || "equipment_unavailable");
      setItems(Array.isArray(data.equipment) ? data.equipment : []); setTotal(typeof data.total === "number" ? data.total : null); setLoaded(true);
    } catch (e) { setItems([]); setTotal(null); setLoaded(false); setError(errorLabel(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function create(e: React.FormEvent) {
    e.preventDefault(); setError(""); setNotice(""); setSaving(true);
    try {
      const res = await fetch("/api/crm/equipment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: form.id, manufacturer: form.manufacturer, model: form.model, name: form.name, category: form.category, supplier_name: form.supplier, warranty_months: form.warranty ? parseInt(form.warranty,10) : null }) });
      const data: EquipmentResponse = await res.json(); if (!res.ok) throw new Error(data.error || "create_failed");
      setForm({ id: "", manufacturer: "", model: "", name: "", category: "", supplier: "", warranty: "" }); await load(); setNotice("Equipamento cadastrado. Ele aparece como aguardando validação técnica.");
    } catch (e) { setError(errorLabel(e)); } finally { setSaving(false); }
  }
  return <section className={styles.workspace} aria-labelledby="equipment-title">
    <header className={styles.header}><div><p className={styles.eyebrow}>Comercial · CRM-12</p><h2 id="equipment-title">Equipamentos</h2><p>Cadastre itens físicos para consulta e composição comercial. Serviço é uma prestação; equipamento é um produto ou ativo.</p></div><div className={styles.count}><strong>{loaded ? total ?? items.length : "—"}</strong><span>equipamentos encontrados</span></div></header>
    <form className={styles.form} onSubmit={create}><h3>Novo equipamento</h3><p className={styles.hint}>O cadastro criado fica ativo e aguarda validação técnica; esta tela não aprova nem edita registros existentes.</p>
      <label className={styles.field}>Identificador<input value={form.id} onChange={e=>setForm({...form,id:e.target.value})} required maxLength={100} autoComplete="off" aria-describedby="equipment-id-help" /></label><p className={styles.hint} id="equipment-id-help">Identificador interno. O servidor normaliza letras e caracteres especiais ao salvar.</p>
      <label className={styles.field}>Fabricante<input value={form.manufacturer} onChange={e=>setForm({...form,manufacturer:e.target.value})} required maxLength={100} /></label>
      <label className={styles.field}>Modelo<input value={form.model} onChange={e=>setForm({...form,model:e.target.value})} required maxLength={100} /></label>
      <label className={styles.field}>Nome para exibição<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required maxLength={200} /></label>
      <label className={styles.field}>Categoria<input value={form.category} onChange={e=>setForm({...form,category:e.target.value})} maxLength={100} placeholder="Ex.: câmera, DVR, controle de acesso" /></label>
      <label className={styles.field}>Fornecedor<input value={form.supplier} onChange={e=>setForm({...form,supplier:e.target.value})} maxLength={200} /></label>
      <label className={styles.field}>Garantia (meses)<input value={form.warranty} onChange={e=>setForm({...form,warranty:e.target.value})} type="number" min="1" max="120" /></label>
      <div className={styles.actions}><button className={styles.primary} type="submit" disabled={saving}>{saving ? "Salvando…" : "Cadastrar equipamento"}</button><button type="button" onClick={()=>void load()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar lista"}</button></div>
    </form>
    {error && <UiState variant="error" title="Não foi possível concluir" detail={error} onRetry={()=>void load()} />}{notice && <UiState variant="success" title={notice} />}
    <form className={styles.filters} onSubmit={e=>{e.preventDefault();void load();}}><h3>Localizar equipamentos</h3>
      <label className={styles.field}>Categoria<input value={filter.category} onChange={e=>setFilter({...filter,category:e.target.value})} placeholder="Todas as categorias" /></label>
      <label className={styles.field}>Nome, modelo ou fabricante<input value={filter.search} onChange={e=>setFilter({...filter,search:e.target.value})} /></label>
      <div className={styles.actions}><button type="submit" className={styles.primary} disabled={loading}>Aplicar filtros</button><button type="button" onClick={()=>{const empty={category:"",search:""};setFilter(empty);void load(empty);}} disabled={loading}>Limpar filtros</button></div>
    </form>
    <div className={styles.sectionHeading}><div><h3>Lista de equipamentos</h3><p>{total != null ? `${items.length} exibidos de ${total} encontrados` : "Resultados conforme filtros aplicados"}</p></div></div>
    {loading && !loaded ? <UiState variant="loading" title="Carregando equipamentos" /> : null}
    {loaded && !error && items.length === 0 ? <UiState variant="empty" title="Nenhum equipamento encontrado" detail="Ajuste os filtros ou cadastre um novo equipamento." /> : null}
    {loaded && !error && items.length > 0 && <div className={styles.cards}>{items.map(eq=><article key={eq.id} className={styles.card}>
      <div className={styles.cardHeader}><div><h3>{eq.name}</h3><p>{eq.manufacturer} · {eq.model}</p></div><div className={styles.badges}><span className={`${styles.badge} ${eq.is_active ? styles.good : styles.inactive}`}>{eq.is_active ? "Ativo" : "Inativo"}</span><span className={`${styles.badge} ${eq.is_validated ? styles.good : styles.pending}`}>{eq.is_validated ? "Validado" : "Aguardando validação"}</span></div></div>
      <dl className={styles.facts}><div><dt>Categoria</dt><dd>{dash(eq.category)}</dd></div><div><dt>Fornecedor</dt><dd>{dash(eq.supplier_name)}</dd></div><div><dt>Garantia</dt><dd>{eq.warranty_months ? `${eq.warranty_months} meses` : "Não informada"}</dd></div><div><dt>SKU de referência</dt><dd>{dash(eq.stock_sku)}</dd></div><div><dt>Local de referência</dt><dd>{dash(eq.stock_location)}</dd></div></dl>
      <p className={styles.description}><strong>Descrição:</strong> {eq.description || "Não informada."}</p>
      <details className={styles.details}><summary>Ver identificador e dados técnicos</summary><div className={styles.detailsBody}><p><strong>Identificador interno</strong><code>{eq.id}</code></p><p><strong>Especificações</strong><code>{JSON.stringify(eq.specifications ?? {})}</code></p><p><strong>Compatibilidades</strong>{Array.isArray(eq.compatibilities) ? eq.compatibilities.length ? eq.compatibilities.join(", ") : "Não informadas." : JSON.stringify(eq.compatibilities ?? "Não informadas.")}</p></div></details>
    </article>)}</div>}
    {loaded && total != null && total > items.length && <p className={styles.hint}>A consulta atual mostra no máximo {items.length} registros. Refine os filtros para localizar outros itens.</p>}
    <p className={styles.note}>SKU e local são referências registradas no cadastro; esta tela não executa movimentação nem integração com estoque.</p>
  </section>;
}
