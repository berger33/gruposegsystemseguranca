"use client";

import { FormEvent, useEffect, useState } from "react";

type Company = { id: string; display_name: string; city?: string | null; };
type Proposal = { id: string; title: string; version: number; company_id: string; total_price: string; };
type Contract = { id: string; title: string; status: string; origin: string; company_name?: string; starts_on?: string | null; total_price: string; };

const today = () => new Date().toISOString().slice(0, 10);

export default function ContractWorkspace() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [manual, setManual] = useState({ company_id: "", title: "", service_summary: "", starts_on: today(), ends_on: "", total_cost: "0", total_price: "0", origin_details: "" });
  const [proposalId, setProposalId] = useState("");

  async function fetchJson(path: string, init?: RequestInit) {
    const response = await fetch(path, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(value.error || "Não foi possível concluir a operação.");
    return value;
  }
  async function load() {
    setLoading(true);
    try {
      const [companyData, proposalData, contractData] = await Promise.all([
        fetchJson("/api/crm/companies?type=client"),
        fetchJson("/api/crm/proposals?status=aceita&limit=100"),
        fetchJson("/api/crm/contracts"),
      ]);
      setCompanies(companyData.companies || []);
      setProposals(proposalData.proposals || []);
      setContracts(contractData.contracts || []);
    } catch (error: any) { setMessage(error.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function createManual(event: FormEvent) {
    event.preventDefault(); setMessage("");
    try {
      const result = await fetchJson("/api/crm/contracts", { method: "POST", body: JSON.stringify({
        source: "manual", request_key: crypto.randomUUID(), company_id: manual.company_id, title: manual.title,
        service_summary: manual.service_summary, starts_on: manual.starts_on, ends_on: manual.ends_on || null,
        total_cost: Number(manual.total_cost), total_price: Number(manual.total_price), origin_details: manual.origin_details,
      }) });
      setMessage(`Contrato manual ${result.created ? "registrado" : "já existente"}. Ele começa em rascunho; assinatura e ativação operacional são etapas separadas.`);
      setManual({ company_id: "", title: "", service_summary: "", starts_on: today(), ends_on: "", total_cost: "0", total_price: "0", origin_details: "" });
      await load();
    } catch (error: any) { setMessage(error.message); }
  }
  async function createFromProposal(event: FormEvent) {
    event.preventDefault(); setMessage("");
    const proposal = proposals.find(item => item.id === proposalId);
    if (!proposal) { setMessage("Selecione uma proposta aceita."); return; }
    try {
      const result = await fetchJson("/api/crm/contracts", { method: "POST", body: JSON.stringify({ source: "proposal", proposal_id: proposal.id, proposal_version: proposal.version }) });
      setMessage(`Contrato da proposta ${result.created ? "criado" : "já existente"}; repetição não cria uma segunda implantação.`);
      await load();
    } catch (error: any) { setMessage(error.message); }
  }

  return <main style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 18px" }}>
    <nav aria-label="Navegação comercial"><a href="/admin/comercial">Comercial</a> · <a href="/admin/crm">Empresas e funil</a></nav>
    <h1>Contratos e implantação</h1>
    <p>Área contratual canônica. Contrato comercial não é cobrança, pagamento, assinatura externa nem e-mail entregue.</p>
    {message && <p role="status" style={{ padding: 12, background: "#eff6ff", borderRadius: 6 }}>{message}</p>}
    <section aria-labelledby="proposal-contract-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 20 }}>
      <h2 id="proposal-contract-title">Criar a partir de proposta aceita</h2>
      <p>Escolha uma proposta aceita e sua versão preservada. A operação é idempotente.</p>
      <form onSubmit={createFromProposal}>
        <label>Proposta aceita<br/><select aria-label="Proposta aceita" value={proposalId} onChange={event => setProposalId(event.target.value)} required><option value="">Selecione</option>{proposals.map(proposal => <option value={proposal.id} key={proposal.id}>{proposal.title} · versão {proposal.version} · R$ {proposal.total_price}</option>)}</select></label>
        <button type="submit" style={{ marginLeft: 8 }}>Criar contrato</button>
      </form>
      {!loading && proposals.length === 0 && <p>Nenhuma proposta aceita disponível para sua carteira.</p>}
    </section>
    <section aria-labelledby="manual-contract-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 20 }}>
      <h2 id="manual-contract-title">Cadastro manual identificado</h2>
      <p>Não cria proposta fictícia. Informe a origem real e o motivo do registro.</p>
      <form onSubmit={createManual} style={{ display: "grid", gap: 10, maxWidth: 680 }}>
        <label>Empresa cliente<select aria-label="Empresa cliente" required value={manual.company_id} onChange={event => setManual({ ...manual, company_id: event.target.value })}><option value="">Selecione a empresa</option>{companies.map(company => <option value={company.id} key={company.id}>{company.display_name}{company.city ? ` — ${company.city}` : ""}</option>)}</select></label>
        <label>Título<input aria-label="Título do contrato" required maxLength={200} value={manual.title} onChange={event => setManual({ ...manual, title: event.target.value })}/></label>
        <label>Serviço ou escopo<textarea aria-label="Serviço ou escopo" required maxLength={2000} value={manual.service_summary} onChange={event => setManual({ ...manual, service_summary: event.target.value })}/></label>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><label>Início<input aria-label="Início" type="date" required value={manual.starts_on} onChange={event => setManual({ ...manual, starts_on: event.target.value })}/></label><label>Fim (se houver)<input aria-label="Fim" type="date" value={manual.ends_on} onChange={event => setManual({ ...manual, ends_on: event.target.value })}/></label><label>Preço estimado<input aria-label="Preço estimado" type="number" min="0" step="0.01" value={manual.total_price} onChange={event => setManual({ ...manual, total_price: event.target.value })}/></label></div>
        <label>Origem e motivo do cadastro<textarea aria-label="Origem e motivo" required minLength={10} maxLength={500} value={manual.origin_details} onChange={event => setManual({ ...manual, origin_details: event.target.value })}/></label>
        <button type="submit">Registrar contrato manual</button>
      </form>
    </section>
    <section aria-labelledby="contracts-title" style={{ marginTop: 28 }}><h2 id="contracts-title">Contratos da carteira</h2>{loading ? <p>Carregando contratos…</p> : contracts.length === 0 ? <p>Nenhum contrato acessível.</p> : <ul>{contracts.map(contract => <li key={contract.id} style={{ marginBottom: 10 }}><strong>{contract.title}</strong> — {contract.company_name || "Empresa"} — {contract.status} — {contract.origin} — R$ {contract.total_price}<br/><a href={`/admin/contratos/${contract.id}`}>Abrir composição e implantação</a></li>)}</ul>}</section>
  </main>;
}
