"use client";
import { useEffect, useState } from "react";

type Policy = {
  id: string;
  name: string;
  scope_type: string;
  min_discount_percent: string;
  max_discount_percent: string;
  requires_approval: boolean;
  approver_role: string | null;
  approval_status: string;
  version: number;
};

type Request = {
  id: string;
  policy_id: string | null;
  company_id: string | null;
  opportunity_id: string | null;
  technical_budget_id: string | null;
  labor_budget_id: string | null;
  price_scenario_id: string | null;
  requested_discount_percent: string;
  original_price: string;
  discounted_price: string;
  reason: string;
  requester_role: string | null;
  approver_role: string | null;
  status: string;
  version: number;
  reapproval_required: boolean;
  reapproval_reason: string | null;
};

export default function DiscountClient() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [policyForm, setPolicyForm] = useState({ name: "", scope_type: "global", min_discount_percent: "0", max_discount_percent: "10", requires_approval: true, approver_role: "admin", notes: "" });
  const [requestForm, setRequestForm] = useState({ policy_id: "", company_id: "", opportunity_id: "", technical_budget_id: "", labor_budget_id: "", price_scenario_id: "", requested_discount_percent: "5", original_price: "10000", discounted_price: "9500", reason: "Desconto para fechamento dentro da alçada, cliente com potencial de expansão, margem preservada. Solicito aprovação.", requester_name: "", notes: "" });
  const [msg, setMsg] = useState("");
  const [filterReapproval, setFilterReapproval] = useState(false);

  async function loadPolicies() {
    const r = await fetch(`/api/crm/discount-policies?limit=100`);
    const j = await r.json();
    if (r.ok) setPolicies(j.policies || []);
  }

  async function loadRequests() {
    const q = new URLSearchParams();
    q.set("limit", "100");
    if (filterReapproval) q.set("reapproval_required", "true");
    const r = await fetch(`/api/crm/discount-requests?${q.toString()}`);
    const j = await r.json();
    if (r.ok) setRequests(j.requests || []);
    else setMsg(`Erro listar requests: ${j.error || r.status}`);
  }

  useEffect(() => { loadPolicies(); loadRequests(); }, []);

  async function createPolicy() {
    setMsg("");
    if (!policyForm.name.trim()) { setMsg("nome política obrigatório"); return; }
    const body = {
      name: policyForm.name.trim(),
      scope_type: policyForm.scope_type,
      min_discount_percent: Number(policyForm.min_discount_percent),
      max_discount_percent: Number(policyForm.max_discount_percent),
      requires_approval: policyForm.requires_approval,
      approver_role: policyForm.approver_role || null,
      notes: policyForm.notes || null,
    };
    const r = await fetch(`/api/crm/discount-policies`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro criar política: ${j.error}`); return; }
    setMsg(`Política criada ${j.policy.id}`);
    setPolicyForm({ name: "", scope_type: "global", min_discount_percent: "0", max_discount_percent: "10", requires_approval: true, approver_role: "admin", notes: "" });
    loadPolicies();
  }

  async function createRequest() {
    setMsg("");
    if (requestForm.reason.trim().length < 10) { setMsg("motivo >=10 chars obrigatório"); return; }
    const body = {
      policy_id: requestForm.policy_id || null,
      company_id: requestForm.company_id || null,
      opportunity_id: requestForm.opportunity_id || null,
      technical_budget_id: requestForm.technical_budget_id || null,
      labor_budget_id: requestForm.labor_budget_id || null,
      price_scenario_id: requestForm.price_scenario_id || null,
      requested_discount_percent: Number(requestForm.requested_discount_percent),
      original_price: Number(requestForm.original_price),
      discounted_price: Number(requestForm.discounted_price),
      reason: requestForm.reason.trim(),
      requester_name: requestForm.requester_name || null,
      notes: requestForm.notes || null,
    };
    const r = await fetch(`/api/crm/discount-requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro criar solicitação: ${j.error}`); return; }
    setMsg(`Solicitação criada ${j.request.id} status ${j.request.status}`);
    setRequestForm({ policy_id: "", company_id: "", opportunity_id: "", technical_budget_id: "", labor_budget_id: "", price_scenario_id: "", requested_discount_percent: "5", original_price: "10000", discounted_price: "9500", reason: "Desconto para fechamento dentro da alçada, cliente com potencial de expansão, margem preservada. Solicito aprovação.", requester_name: "", notes: "" });
    loadRequests();
  }

  async function approveRequest(id: string) {
    const note = prompt("Nota de aprovação contábil (se necessário) ou motivo aprovação (min 10 chars para margem)? Deixe vazio se não precisar");
    const body: any = { status: "aprovado" };
    if (note) body.approver_name = note.slice(0,120);
    const r = await fetch(`/api/crm/discount-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro aprovar: ${j.error}`);
    else { setMsg(`Aprovado ${id}`); loadRequests(); }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
      <h2>CRM-18 — Alçadas desconto e exceções</h2>
      <p style={{ fontSize: 13, color: "#555" }}>Motivo, solicitante, aprovador, versão. Alteração de itens/custos após aprovação reabre aprovação (reapproval_required, status volta para em_analise).</p>

      <h3>Políticas de desconto (alçadas)</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, marginBottom: 12 }}>
        <input placeholder="nome ex: Alçada até 10% comercial" value={policyForm.name} onChange={e => setPolicyForm({ ...policyForm, name: e.target.value })} />
        <select value={policyForm.scope_type} onChange={e => setPolicyForm({ ...policyForm, scope_type: e.target.value })}>
          <option value="global">global</option>
          <option value="company">company</option>
          <option value="opportunity">opportunity</option>
          <option value="technical_budget">technical_budget</option>
          <option value="labor_budget">labor_budget</option>
          <option value="price_scenario">price_scenario</option>
          <option value="outro">outro</option>
        </select>
        <input type="number" step="0.1" placeholder="min % desconto" value={policyForm.min_discount_percent} onChange={e => setPolicyForm({ ...policyForm, min_discount_percent: e.target.value })} />
        <input type="number" step="0.1" placeholder="max % desconto" value={policyForm.max_discount_percent} onChange={e => setPolicyForm({ ...policyForm, max_discount_percent: e.target.value })} />
        <label style={{ fontSize: 12 }}><input type="checkbox" checked={policyForm.requires_approval} onChange={e => setPolicyForm({ ...policyForm, requires_approval: e.target.checked })} /> requer aprovação</label>
        <input placeholder="approver_role ex: admin" value={policyForm.approver_role} onChange={e => setPolicyForm({ ...policyForm, approver_role: e.target.value })} />
        <input placeholder="notas" value={policyForm.notes} onChange={e => setPolicyForm({ ...policyForm, notes: e.target.value })} />
      </div>
      <button onClick={createPolicy}>Criar política</button>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 12 }}>
        <thead><tr><th style={{ borderBottom: "1px solid #ccc" }}>nome</th><th>escopo</th><th>min%</th><th>max%</th><th>requer aprovação</th><th>aprovador</th><th>status</th><th>versão</th></tr></thead>
        <tbody>
          {policies.map(p => (
            <tr key={p.id}><td>{p.name}</td><td>{p.scope_type}</td><td>{p.min_discount_percent}</td><td>{p.max_discount_percent}</td><td>{p.requires_approval ? "sim" : "não"}</td><td>{p.approver_role || "-"}</td><td>{p.approval_status}</td><td>{p.version}</td></tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: 20 }}>Solicitações / exceções</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <label style={{ fontSize: 12 }}><input type="checkbox" checked={filterReapproval} onChange={e => setFilterReapproval(e.target.checked)} /> só reapproval_required</label>
        <button onClick={loadRequests}>Filtrar</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, marginBottom: 12 }}>
        <input placeholder="policy_id opcional" value={requestForm.policy_id} onChange={e => setRequestForm({ ...requestForm, policy_id: e.target.value })} />
        <input placeholder="company_id" value={requestForm.company_id} onChange={e => setRequestForm({ ...requestForm, company_id: e.target.value })} />
        <input placeholder="opportunity_id" value={requestForm.opportunity_id} onChange={e => setRequestForm({ ...requestForm, opportunity_id: e.target.value })} />
        <input placeholder="technical_budget_id" value={requestForm.technical_budget_id} onChange={e => setRequestForm({ ...requestForm, technical_budget_id: e.target.value })} />
        <input placeholder="labor_budget_id" value={requestForm.labor_budget_id} onChange={e => setRequestForm({ ...requestForm, labor_budget_id: e.target.value })} />
        <input placeholder="price_scenario_id" value={requestForm.price_scenario_id} onChange={e => setRequestForm({ ...requestForm, price_scenario_id: e.target.value })} />
        <input type="number" step="0.1" placeholder="desconto %" value={requestForm.requested_discount_percent} onChange={e => setRequestForm({ ...requestForm, requested_discount_percent: e.target.value })} />
        <input type="number" step="0.01" placeholder="preço original" value={requestForm.original_price} onChange={e => setRequestForm({ ...requestForm, original_price: e.target.value })} />
        <input type="number" step="0.01" placeholder="preço com desconto" value={requestForm.discounted_price} onChange={e => setRequestForm({ ...requestForm, discounted_price: e.target.value })} />
        <input placeholder="requester_name" value={requestForm.requester_name} onChange={e => setRequestForm({ ...requestForm, requester_name: e.target.value })} />
      </div>
      <textarea placeholder="motivo (obrigatório >=10 chars) ex: Cliente estratégico, concorrência, margem preservada" value={requestForm.reason} onChange={e => setRequestForm({ ...requestForm, reason: e.target.value })} style={{ width: "100%", minHeight: 60, marginBottom: 8 }} />
      <button onClick={createRequest}>Criar solicitação</button>

      {msg && <div style={{ marginTop: 8, fontSize: 12 }}>{msg}</div>}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 12 }}>
        <thead><tr><th>desconto%</th><th>original</th><th>com desconto</th><th>motivo</th><th>solicitante</th><th>aprovador</th><th>status</th><th>versão</th><th>reapproval?</th><th>ação</th></tr></thead>
        <tbody>
          {requests.map(r => (
            <tr key={r.id} style={{ background: r.reapproval_required ? "#ffe6e6" : "transparent" }}>
              <td>{r.requested_discount_percent}%</td>
              <td>{r.original_price}</td>
              <td>{r.discounted_price}</td>
              <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{r.reason}</td>
              <td>{r.requester_role || "-"}</td>
              <td>{r.approver_role || "-"}</td>
              <td>{r.status}</td>
              <td>{r.version}</td>
              <td>{r.reapproval_required ? `sim: ${r.reapproval_reason}` : "não"}</td>
              <td><button onClick={() => approveRequest(r.id)}>Aprovar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
