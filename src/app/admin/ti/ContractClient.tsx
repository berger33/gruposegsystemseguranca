"use client";
import { useEffect, useState } from "react";

type Contract = {
  id: string;
  proposal_id: string;
  proposal_version: number;
  company_id: string | null;
  title: string;
  status: string;
  origin: string;
  origin_details: string | null;
  total_cost: string;
  total_price: string;
  responsible_name: string | null;
  starts_on: string | null;
  ends_on: string | null;
  service_summary: string | null;
  idempotency_key: string;
  created_at: string;
};

export default function ContractClient() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [total, setTotal] = useState(0);
  const [proposalId, setProposalId] = useState("");
  const [form, setForm] = useState({ proposal_id: "", proposal_version: "" });
  const [manualForm, setManualForm] = useState({ company_id: "", title: "", responsible_name: "", starts_on: "", ends_on: "", total_price: "", origin_details: "Cadastro manual origem identificada: administração cadastrou manualmente dados reais, sem dados de demonstração", service_summary: "" });
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [unitForm, setUnitForm] = useState({ unit_id: "", role: "" });
  const [respForm, setRespForm] = useState({ responsible_name: "", role: "gestor", is_primary: true });
  const [docForm, setDocForm] = useState({ title: "", category: "", file_url: "" });

  async function load() {
    const q = new URLSearchParams();
    if (proposalId) q.set("proposalId", proposalId);
    q.set("limit", "100");
    const r = await fetch(`/api/crm/contracts?${q.toString()}`);
    const j = await r.json();
    if (r.ok) { setContracts(j.contracts || []); setTotal(j.total || 0); }
    else setMsg(`Erro listar: ${j.error}`);
  }

  useEffect(() => { load(); }, []);

  async function createFromProposal() {
    setMsg("");
    if (!form.proposal_id.trim()) { setMsg("proposal_id obrigatório"); return; }
    const body: any = { proposal_id: form.proposal_id.trim() };
    if (form.proposal_version) body.proposal_version = Number(form.proposal_version);
    const r = await fetch(`/api/crm/contracts/from-proposal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro criar contrato: ${j.error} ${j.current_status ? `status atual ${j.current_status}` : ""}`); return; }
    setMsg(`Contrato ${j.contract.id} v${j.contract.proposal_version} ${j.isNew ? "criado" : "já existia (idempotente)"} key ${j.contract.idempotency_key} — ${j.note}`);
    load();
  }

  async function createManual() {
    setMsg("");
    if (!manualForm.company_id.trim() || !manualForm.title.trim()) { setMsg("company_id e title obrigatórios para manual CON-01"); return; }
    const body = {
      company_id: manualForm.company_id.trim(),
      title: manualForm.title.trim(),
      responsible_name: manualForm.responsible_name || null,
      starts_on: manualForm.starts_on || null,
      ends_on: manualForm.ends_on || null,
      total_price: manualForm.total_price ? Number(manualForm.total_price) : 0,
      origin: "manual",
      origin_details: manualForm.origin_details,
      service_summary: manualForm.service_summary || null,
      notes: "CON-01 contrato ligado à empresa, unidades, proposta/versão, serviços, responsáveis, vigência, valor e documentos. Admissão de cadastro manual com origem identificada.",
    };
    const r = await fetch(`/api/crm/contracts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro criar contrato manual: ${j.error}`); return; }
    setMsg(`Contrato manual criado ${j.contract.id} origem ${j.contract.origin} detalhes ${j.contract.origin_details} — ${j.note}`);
    load();
  }

  async function viewContract(id: string) {
    const r = await fetch(`/api/crm/contracts/${id}`);
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro ver contrato: ${j.error}`); return; }
    setSelected(j);
  }

  async function retryCreate(contract: Contract) {
    setForm({ proposal_id: contract.proposal_id, proposal_version: String(contract.proposal_version) });
    setTimeout(() => createFromProposal(), 100);
  }

  async function addUnit() {
    if (!selected) return;
    if (!unitForm.unit_id.trim()) { setMsg("unit_id obrigatório"); return; }
    const r = await fetch(`/api/crm/contracts/${selected.contract.id}/units`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unit_id: unitForm.unit_id.trim(), role: unitForm.role || null }) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro add unidade: ${j.error}`);
    else { setMsg(`Unidade vinculada`); viewContract(selected.contract.id); }
  }

  async function addResponsible() {
    if (!selected) return;
    if (!respForm.responsible_name.trim() || !respForm.role.trim()) { setMsg("responsible_name e role obrigatórios"); return; }
    const r = await fetch(`/api/crm/contracts/${selected.contract.id}/responsibles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ responsible_name: respForm.responsible_name.trim(), role: respForm.role.trim(), is_primary: respForm.is_primary }) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro add responsável: ${j.error}`);
    else { setMsg(`Responsável vinculado`); viewContract(selected.contract.id); }
  }

  async function addDocument() {
    if (!selected) return;
    if (!docForm.title.trim()) { setMsg("title documento obrigatório"); return; }
    const r = await fetch(`/api/crm/contracts/${selected.contract.id}/documents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: docForm.title.trim(), category: docForm.category || null, file_url: docForm.file_url || null }) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro add documento: ${j.error}`);
    else { setMsg(`Documento vinculado`); viewContract(selected.contract.id); }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
      <h2>CRM-23 + CON-01 — Contrato idempotente + ligado à empresa/unidades/proposta/versão/serviços/responsáveis/vigência/valor/documentos (origem manual identificada)</h2>
      <p style={{ fontSize: 12, color: "#555" }}>CON-01: contrato ligado à empresa, unidades (crm_contract_units), proposta/versão (proposal_id/version), serviços (items + service_summary), responsáveis (responsible_id/name + crm_contract_responsibles), vigência (starts_on/ends_on), valor (total_cost/price) e documentos (crm_contract_documents). Admissão manual com origin=manual + origin_details identificada. CRM-23: idempotente UNIQUE(proposal_id,proposal_version) + idempotency_key.</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input placeholder="proposalId filtro" value={proposalId} onChange={e => setProposalId(e.target.value)} style={{ width: 280 }} />
        <button onClick={load}>Filtrar</button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input placeholder="proposal_id * (idempotente)" value={form.proposal_id} onChange={e => setForm({ ...form, proposal_id: e.target.value })} style={{ width: 320 }} />
        <input placeholder="proposal_version opcional" value={form.proposal_version} onChange={e => setForm({ ...form, proposal_version: e.target.value })} style={{ width: 120 }} />
        <button onClick={createFromProposal}>Criar contrato idempotente da proposta aceita</button>
      </div>

      <div style={{ borderTop: "1px solid #eee", paddingTop: 12, marginTop: 12 }}>
        <h4>CON-01 — Cadastro manual com origem identificada</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
          <input placeholder="company_id * (manual)" value={manualForm.company_id} onChange={e => setManualForm({ ...manualForm, company_id: e.target.value })} />
          <input placeholder="title *" value={manualForm.title} onChange={e => setManualForm({ ...manualForm, title: e.target.value })} />
          <input placeholder="responsible_name" value={manualForm.responsible_name} onChange={e => setManualForm({ ...manualForm, responsible_name: e.target.value })} />
          <input placeholder="starts_on YYYY-MM-DD" value={manualForm.starts_on} onChange={e => setManualForm({ ...manualForm, starts_on: e.target.value })} />
          <input placeholder="ends_on YYYY-MM-DD" value={manualForm.ends_on} onChange={e => setManualForm({ ...manualForm, ends_on: e.target.value })} />
          <input placeholder="total_price" type="number" value={manualForm.total_price} onChange={e => setManualForm({ ...manualForm, total_price: e.target.value })} />
        </div>
        <textarea placeholder="service_summary" value={manualForm.service_summary} onChange={e => setManualForm({ ...manualForm, service_summary: e.target.value })} style={{ width: "100%", minHeight: 40, marginTop: 4 }} />
        <textarea placeholder="origin_details * origem identificada manual" value={manualForm.origin_details} onChange={e => setManualForm({ ...manualForm, origin_details: e.target.value })} style={{ width: "100%", minHeight: 40, marginTop: 4 }} />
        <button onClick={createManual} style={{ marginTop: 6 }}>Criar contrato manual CON-01</button>
      </div>

      {msg && <div style={{ marginTop: 8, fontSize: 12, whiteSpace: "pre-wrap" }}>{msg}</div>}

      <h3 style={{ marginTop: 16 }}>Contratos ({total})</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead><tr><th>id</th><th>empresa</th><th>proposta v</th><th>título</th><th>status</th><th>origem</th><th>responsável</th><th>vigência</th><th>preço</th><th>ações</th></tr></thead>
        <tbody>
          {contracts.map(c => (
            <tr key={c.id}>
              <td>{c.id.slice(0,8)}</td>
              <td>{c.company_id ? c.company_id.slice(0,8) : "-"}</td>
              <td>{c.proposal_id.slice(0,8)} v{c.proposal_version}</td>
              <td>{c.title}</td>
              <td>{c.status}</td>
              <td>{c.origin} {c.origin_details ? `(${c.origin_details.slice(0,30)})` : ""}</td>
              <td>{c.responsible_name || "-"}</td>
              <td>{c.starts_on || "-"}→{c.ends_on || "-"}</td>
              <td>R$ {c.total_price}</td>
              <td>
                <button onClick={() => viewContract(c.id)}>Ver</button>
                <button onClick={() => retryCreate(c)} style={{ marginLeft: 4 }}>Retry</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <div style={{ marginTop: 16, padding: 12, background: "#f5f5f5", borderRadius: 6, fontSize: 12 }}>
          <h4>Contrato {selected.contract.id}</h4>
          <p>Empresa: {selected.contract.company_id} | Proposta: {selected.contract.proposal_id} v{selected.contract.proposal_version} | Origem: {selected.contract.origin} — {selected.contract.origin_details || ""}</p>
          <p>Responsável: {selected.contract.responsible_name || "-"} | Vigência: {selected.contract.starts_on || "-"} → {selected.contract.ends_on || "-"} | Valor: R$ {selected.contract.total_price} Custo R$ {selected.contract.total_cost}</p>
          <p>Serviços: {selected.contract.service_summary || "-"}</p>

          <h5>Itens serviços ({selected.items?.length || 0})</h5>
          <ul>{(selected.items || []).map((it: any) => <li key={it.id}>{it.type} {it.description} qtd {it.quantity} {it.unit} preço {it.unit_price} rec {it.recurrence_type}</li>)}</ul>

          <h5>Unidades ({selected.units?.length || 0}) — CON-01</h5>
          <ul>{(selected.units || []).map((u: any) => <li key={u.id}>{u.unit_id.slice(0,8)} {u.unit_name || ""} {u.city || ""} role {u.role || "-"}</li>)}</ul>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            <input placeholder="unit_id UUID" value={unitForm.unit_id} onChange={e => setUnitForm({ ...unitForm, unit_id: e.target.value })} style={{ width: 280 }} />
            <input placeholder="role ex filial" value={unitForm.role} onChange={e => setUnitForm({ ...unitForm, role: e.target.value })} />
            <button onClick={addUnit}>Add unidade</button>
          </div>

          <h5>Responsáveis ({selected.responsibles?.length || 0}) — CON-01</h5>
          <ul>{(selected.responsibles || []).map((r: any) => <li key={r.id}>{r.responsible_name} role {r.role} {r.is_primary ? "(primary)" : ""}</li>)}</ul>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            <input placeholder="responsible_name *" value={respForm.responsible_name} onChange={e => setRespForm({ ...respForm, responsible_name: e.target.value })} />
            <input placeholder="role *" value={respForm.role} onChange={e => setRespForm({ ...respForm, role: e.target.value })} />
            <label><input type="checkbox" checked={respForm.is_primary} onChange={e => setRespForm({ ...respForm, is_primary: e.target.checked })} /> primary</label>
            <button onClick={addResponsible}>Add responsável</button>
          </div>

          <h5>Documentos ({selected.documents?.length || 0}) — CON-01</h5>
          <ul>{(selected.documents || []).map((d: any) => <li key={d.id}>{d.title} cat {d.category || "-"} {d.file_url ? <a href={d.file_url} target="_blank">link</a> : ""}</li>)}</ul>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            <input placeholder="title *" value={docForm.title} onChange={e => setDocForm({ ...docForm, title: e.target.value })} />
            <input placeholder="category" value={docForm.category} onChange={e => setDocForm({ ...docForm, category: e.target.value })} />
            <input placeholder="file_url" value={docForm.file_url} onChange={e => setDocForm({ ...docForm, file_url: e.target.value })} style={{ width: 280 }} />
            <button onClick={addDocument}>Add documento</button>
          </div>

          <h5>Implantação</h5>
          {selected.implantation ? (
            <>
              <p>Status: {selected.implantation.status}</p>
              <pre style={{ whiteSpace: "pre-wrap", maxHeight: 200, overflow: "auto" }}>{JSON.stringify(selected.implantation.checklist, null, 2)}</pre>
            </>
          ) : <p>Sem implantação</p>}
          <button onClick={() => setSelected(null)}>Fechar</button>
        </div>
      )}
    </section>
  );
}
