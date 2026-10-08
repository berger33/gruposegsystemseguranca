"use client";
import { useEffect, useState } from "react";

type Proposal = {
  id: string;
  company_id: string | null;
  opportunity_id: string | null;
  technical_budget_id: string | null;
  labor_budget_id: string | null;
  price_scenario_id: string | null;
  title: string;
  status: string;
  version: number;
  scope_description: string | null;
  exclusions: string | null;
  implementation_details: string | null;
  deadline_description: string | null;
  readjustment_forecast: string | null;
  validity_days: number | null;
  validity_until: string | null;
  conditions: string | null;
  total_cost: string;
  total_price: string;
};

type Item = {
  id: string;
  type: string;
  description: string;
  quantity: string;
  unit: string;
  unit_cost: string;
  total_cost: string;
  unit_price: string;
  total_price: string;
  recurrence_type: string;
};

export default function ProposalClient() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Proposal | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [form, setForm] = useState({ company_id: "", opportunity_id: "", technical_budget_id: "", labor_budget_id: "", price_scenario_id: "", discount_request_id: "", title: "", scope_description: "", exclusions: "", implementation_details: "", deadline_description: "", readjustment_forecast: "", validity_days: "30", validity_until: "", conditions: "", notes: "" });
  const [itemForm, setItemForm] = useState({ type: "servico", description: "", quantity: "1", unit: "un", unit_cost: "100", unit_price: "150", recurrence_type: "avulso", recurrence_details: "", supplier_name: "", notes: "" });
  const [msg, setMsg] = useState("");

  async function loadProposals() {
    const r = await fetch(`/api/crm/proposals?limit=100`);
    const j = await r.json();
    if (r.ok) { setProposals(j.proposals || []); setTotal(j.total || 0); }
  }

  async function loadProposal(id: string) {
    const r = await fetch(`/api/crm/proposals/${id}`);
    const j = await r.json();
    if (r.ok) { setSelected(j.proposal); setItems(j.items || []); setVersions(j.versions || []); }
    else setMsg(`Erro carregar proposta: ${j.error}`);
  }

  useEffect(() => { loadProposals(); }, []);

  async function createProposal() {
    setMsg("");
    if (!form.company_id.trim() || !form.title.trim()) { setMsg("company_id e title obrigatórios"); return; }
    const body = {
      company_id: form.company_id.trim(),
      opportunity_id: form.opportunity_id || null,
      technical_budget_id: form.technical_budget_id || null,
      labor_budget_id: form.labor_budget_id || null,
      price_scenario_id: form.price_scenario_id || null,
      discount_request_id: form.discount_request_id || null,
      title: form.title.trim(),
      scope_description: form.scope_description || null,
      exclusions: form.exclusions || null,
      implementation_details: form.implementation_details || null,
      deadline_description: form.deadline_description || null,
      readjustment_forecast: form.readjustment_forecast || null,
      validity_days: form.validity_days ? Number(form.validity_days) : null,
      validity_until: form.validity_until || null,
      conditions: form.conditions || null,
      notes: form.notes || null,
    };
    const r = await fetch(`/api/crm/proposals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro criar: ${j.error}`); return; }
    setMsg(`Proposta criada ${j.proposal.id} v${j.proposal.version}`);
    setForm({ company_id: "", opportunity_id: "", technical_budget_id: "", labor_budget_id: "", price_scenario_id: "", discount_request_id: "", title: "", scope_description: "", exclusions: "", implementation_details: "", deadline_description: "", readjustment_forecast: "", validity_days: "30", validity_until: "", conditions: "", notes: "" });
    loadProposals();
  }

  async function addItem() {
    if (!selected) { setMsg("Selecione proposta"); return; }
    if (!itemForm.description.trim()) { setMsg("descrição item obrigatória"); return; }
    const body = {
      type: itemForm.type,
      description: itemForm.description.trim(),
      quantity: Number(itemForm.quantity),
      unit: itemForm.unit,
      unit_cost: Number(itemForm.unit_cost),
      unit_price: Number(itemForm.unit_price),
      recurrence_type: itemForm.recurrence_type,
      recurrence_details: itemForm.recurrence_details || null,
      supplier_name: itemForm.supplier_name || null,
      notes: itemForm.notes || null,
    };
    const r = await fetch(`/api/crm/proposals/${selected.id}/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro add item: ${j.error} ${j.message || ""}`); return; }
    setMsg(`Item adicionado ${j.item.id}`);
    loadProposal(selected.id);
  }

  async function updateStatus(newStatus: string) {
    if (!selected) return;
    const reason = prompt(`Motivo para mudar para ${newStatus}? (opcional, mas para preservar versão enviada informe)`) || "";
    const body: any = { status: newStatus };
    if (reason) body.version_reason = reason;
    if (newStatus === "aprovada_para_envio" || newStatus === "enviada") {
      body.accounting_approval_note = reason || "Aprovação para envio";
    }
    const r = await fetch(`/api/crm/proposals/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro status: ${j.error}`);
    else { setMsg(`Status ${newStatus} v${j.proposal.version}`); loadProposal(selected.id); loadProposals(); }
  }

  async function downloadPdf(version?: number) {
    if (!selected) return;
    const url = version ? `/api/crm/proposals/${selected.id}/pdf?version=${version}` : `/api/crm/proposals/${selected.id}/pdf`;
    const r = await fetch(url);
    if (!r.ok) { const j = await r.json(); setMsg(`Erro PDF: ${j.error}`); return; }
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `proposta-${selected.id}-v${version || selected.version}.pdf`;
    a.click();
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
      <h2>CRM-19 — Proposta versionada (itens, recorrência, implantação, escopo, exclusões, prazo, reajuste, validade, condições, PDF mesma versão)</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, marginBottom: 12 }}>
        <input placeholder="company_id *" value={form.company_id} onChange={e => setForm({ ...form, company_id: e.target.value })} />
        <input placeholder="opportunity_id" value={form.opportunity_id} onChange={e => setForm({ ...form, opportunity_id: e.target.value })} />
        <input placeholder="technical_budget_id" value={form.technical_budget_id} onChange={e => setForm({ ...form, technical_budget_id: e.target.value })} />
        <input placeholder="labor_budget_id" value={form.labor_budget_id} onChange={e => setForm({ ...form, labor_budget_id: e.target.value })} />
        <input placeholder="price_scenario_id" value={form.price_scenario_id} onChange={e => setForm({ ...form, price_scenario_id: e.target.value })} />
        <input placeholder="discount_request_id" value={form.discount_request_id} onChange={e => setForm({ ...form, discount_request_id: e.target.value })} />
        <input placeholder="título *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
        <input type="number" placeholder="validade dias" value={form.validity_days} onChange={e => setForm({ ...form, validity_days: e.target.value })} />
        <input type="date" placeholder="validade até" value={form.validity_until} onChange={e => setForm({ ...form, validity_until: e.target.value })} />
      </div>
      <textarea placeholder="escopo (scope_description)" value={form.scope_description} onChange={e => setForm({ ...form, scope_description: e.target.value })} style={{ width: "100%", minHeight: 50, marginBottom: 6 }} />
      <textarea placeholder="exclusões" value={form.exclusions} onChange={e => setForm({ ...form, exclusions: e.target.value })} style={{ width: "100%", minHeight: 50, marginBottom: 6 }} />
      <textarea placeholder="implantação (implementation_details)" value={form.implementation_details} onChange={e => setForm({ ...form, implementation_details: e.target.value })} style={{ width: "100%", minHeight: 50, marginBottom: 6 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
        <input placeholder="prazo (deadline_description)" value={form.deadline_description} onChange={e => setForm({ ...form, deadline_description: e.target.value })} />
        <input placeholder="reajuste previsto" value={form.readjustment_forecast} onChange={e => setForm({ ...form, readjustment_forecast: e.target.value })} />
      </div>
      <textarea placeholder="condições" value={form.conditions} onChange={e => setForm({ ...form, conditions: e.target.value })} style={{ width: "100%", minHeight: 50, marginBottom: 6 }} />
      <button onClick={createProposal}>Criar proposta</button>

      <h3 style={{ marginTop: 16 }}>Propostas ({total})</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead><tr><th>título</th><th>status</th><th>versão</th><th>custo</th><th>preço</th><th>validade</th><th>ação</th></tr></thead>
        <tbody>
          {proposals.map(p => (
            <tr key={p.id}><td>{p.title}</td><td>{p.status}</td><td>{p.version}</td><td>{p.total_cost}</td><td>{p.total_price}</td><td>{p.validity_days}d até {p.validity_until || "-"}</td><td><button onClick={() => loadProposal(p.id)}>Ver</button></td></tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <div style={{ marginTop: 16, padding: 12, background: "#f9f9f9", borderRadius: 6 }}>
          <h4>Proposta selecionada: {selected.title} v{selected.version} [{selected.status}]</h4>
          <p style={{ fontSize: 12 }}>Escopo: {selected.scope_description || "-"} | Exclusões: {selected.exclusions || "-"} | Implantação: {selected.implementation_details || "-"} | Prazo: {selected.deadline_description || "-"} | Reajuste: {selected.readjustment_forecast || "-"} | Condições: {selected.conditions || "-"}</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <button onClick={() => updateStatus("em_revisao")}>Em revisão</button>
            <button onClick={() => updateStatus("aprovada_para_envio")}>Aprovada p/ envio</button>
            <button onClick={() => updateStatus("enviada")}>Enviada (preserva versão)</button>
            <button onClick={() => updateStatus("aceita")}>Aceita</button>
            <button onClick={() => updateStatus("recusada")}>Recusada</button>
            <button onClick={() => downloadPdf()}>PDF versão atual (mesma versão persistida)</button>
          </div>

          <h5>Adicionar item (quantidades, recorrência)</h5>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6, marginBottom: 8 }}>
            <select value={itemForm.type} onChange={e => setItemForm({ ...itemForm, type: e.target.value })}>
              <option value="servico">servico</option><option value="material">material</option><option value="equipamento">equipamento</option><option value="mao_obra">mao_obra</option><option value="instalacao">instalacao</option><option value="deslocamento">deslocamento</option><option value="infraestrutura">infraestrutura</option><option value="licenca">licenca</option><option value="garantia">garantia</option><option value="manutencao">manutencao</option><option value="outro">outro</option>
            </select>
            <input placeholder="descrição 500" value={itemForm.description} onChange={e => setItemForm({ ...itemForm, description: e.target.value })} />
            <input type="number" step="0.01" placeholder="qtd" value={itemForm.quantity} onChange={e => setItemForm({ ...itemForm, quantity: e.target.value })} />
            <input placeholder="un" value={itemForm.unit} onChange={e => setItemForm({ ...itemForm, unit: e.target.value })} />
            <input type="number" step="0.01" placeholder="custo unit" value={itemForm.unit_cost} onChange={e => setItemForm({ ...itemForm, unit_cost: e.target.value })} />
            <input type="number" step="0.01" placeholder="preço unit" value={itemForm.unit_price} onChange={e => setItemForm({ ...itemForm, unit_price: e.target.value })} />
            <select value={itemForm.recurrence_type} onChange={e => setItemForm({ ...itemForm, recurrence_type: e.target.value })}>
              <option value="avulso">avulso</option><option value="recorrente">recorrente</option><option value="implantacao">implantacao</option><option value="outro">outro</option>
            </select>
            <input placeholder="recorrência detalhes" value={itemForm.recurrence_details} onChange={e => setItemForm({ ...itemForm, recurrence_details: e.target.value })} />
            <input placeholder="fornecedor" value={itemForm.supplier_name} onChange={e => setItemForm({ ...itemForm, supplier_name: e.target.value })} />
          </div>
          <button onClick={addItem}>Adicionar item</button>

          <h5 style={{ marginTop: 12 }}>Itens v{selected.version} ({items.length})</h5>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead><tr><th>tipo</th><th>descrição</th><th>qtd</th><th>un</th><th>custo unit/total</th><th>preço unit/total</th><th>recorrência</th></tr></thead>
            <tbody>
              {items.map(it => (
                <tr key={it.id}><td>{it.type}</td><td>{it.description}</td><td>{it.quantity}</td><td>{it.unit}</td><td>{it.unit_cost}/{it.total_cost}</td><td>{it.unit_price}/{it.total_price}</td><td>{it.recurrence_type}</td></tr>
              ))}
            </tbody>
          </table>

          <h5 style={{ marginTop: 12 }}>Versões preservadas</h5>
          <ul style={{ fontSize: 11 }}>
            {versions.map((v: any) => (
              <li key={v.id}>v{v.version} — {v.reason || "-"} — {new Date(v.created_at).toLocaleString("pt-BR")} — <button onClick={() => downloadPdf(v.version)}>PDF v{v.version}</button></li>
            ))}
          </ul>
        </div>
      )}

      {msg && <div style={{ marginTop: 8, fontSize: 12 }}>{msg}</div>}
    </section>
  );
}
