"use client";
import { useEffect, useState } from "react";

type Delivery = {
  id: string;
  proposal_id: string;
  proposal_version: number;
  recipient_email: string;
  recipient_name: string | null;
  channel: string;
  status: string;
  provider_message_id: string | null;
  last_error_sanitized: string | null;
  attempts: number;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
};

export default function ProposalDeliveryClient() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [total, setTotal] = useState(0);
  const [proposalId, setProposalId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState({ proposal_id: "", proposal_version: "", recipient_email: "", recipient_name: "", channel: "email" });
  const [msg, setMsg] = useState("");

  async function load() {
    const q = new URLSearchParams();
    if (proposalId) q.set("proposalId", proposalId);
    if (statusFilter) q.set("status", statusFilter);
    q.set("limit", "100");
    const r = await fetch(`/api/crm/proposal-deliveries?${q.toString()}`);
    const j = await r.json();
    if (r.ok) { setDeliveries(j.deliveries || []); setTotal(j.total || 0); }
    else setMsg(`Erro listar: ${j.error}`);
  }

  useEffect(() => { load(); }, []);

  async function create() {
    setMsg("");
    if (!form.proposal_id.trim() || !form.recipient_email.trim()) { setMsg("proposal_id e recipient_email obrigatórios"); return; }
    const body = {
      proposal_id: form.proposal_id.trim(),
      proposal_version: form.proposal_version ? Number(form.proposal_version) : null,
      recipient_email: form.recipient_email.trim(),
      recipient_name: form.recipient_name || null,
      channel: form.channel,
    };
    const r = await fetch(`/api/crm/proposal-deliveries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro criar: ${j.error}`); return; }
    setMsg(`Entrega criada ${j.delivery.id} status ${j.delivery.status} — ${j.note}`);
    setForm({ proposal_id: "", proposal_version: "", recipient_email: "", recipient_name: "", channel: "email" });
    load();
  }

  async function send(id: string) {
    const r = await fetch(`/api/crm/proposal-deliveries/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send" }) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro enviar: ${j.error} status ${j.status || ""}`);
    else { setMsg(`Envio: ${j.delivery.status} — ${j.note}`); load(); }
  }

  async function confirmDelivery(id: string, newStatus: string) {
    // Simula webhook com proof — entrega/leitura só quando comprovadas
    const proof = { provider: "smtp", message_id: `prov-${Date.now()}`, timestamp: new Date().toISOString(), event: newStatus, signature: "simulated-proof-signature" };
    const r = await fetch(`/api/crm/proposal-deliveries/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus, proof, provider_message_id: proof.message_id }) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro confirmar ${newStatus}: ${j.error} ${j.proof_required_for_delivery_read ? "(proof obrigatório)" : ""}`);
    else { setMsg(`Confirmado ${newStatus}: ${j.delivery.status} — ${j.note}`); load(); }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
      <h2>CRM-21 — Envio rastreado com estados realistas (fila, enviado pelo provedor, falhou; entrega/leitura só quando comprovadas), aceite e assinatura por integração</h2>
      <p style={{ fontSize: 12, color: "#555" }}>Estados: fila → enviado_pelo_provedor → falhou / entregue_comprovada / leitura_comprovada / aceito / recusado. Entrega/leitura só com proof (webhook). Sem simulação de entrega sem comprovação. Aceite cria assinatura por integração em crm_proposal_signatures.</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input placeholder="proposalId filtro" value={proposalId} onChange={e => setProposalId(e.target.value)} style={{ width: 280 }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos status</option>
          <option value="fila">fila</option>
          <option value="enviado_pelo_provedor">enviado_pelo_provedor</option>
          <option value="falhou">falhou</option>
          <option value="entregue_comprovada">entregue_comprovada</option>
          <option value="leitura_comprovada">leitura_comprovada</option>
          <option value="aceito">aceito</option>
          <option value="recusado">recusado</option>
        </select>
        <button onClick={load}>Filtrar</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8, marginBottom: 12 }}>
        <input placeholder="proposal_id *" value={form.proposal_id} onChange={e => setForm({ ...form, proposal_id: e.target.value })} />
        <input placeholder="proposal_version opcional" value={form.proposal_version} onChange={e => setForm({ ...form, proposal_version: e.target.value })} />
        <input placeholder="recipient_email *" value={form.recipient_email} onChange={e => setForm({ ...form, recipient_email: e.target.value })} />
        <input placeholder="recipient_name" value={form.recipient_name} onChange={e => setForm({ ...form, recipient_name: e.target.value })} />
        <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}>
          <option value="email">email</option>
          <option value="whatsapp">whatsapp</option>
          <option value="outro">outro</option>
        </select>
      </div>
      <button onClick={create}>Criar entrega (fila)</button>

      {msg && <div style={{ marginTop: 8, fontSize: 12 }}>{msg}</div>}

      <h3 style={{ marginTop: 16 }}>Entregas ({total})</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead><tr><th>proposta v</th><th>destinatário</th><th>canal</th><th>status</th><th>provider_msg_id</th><th>tentativas</th><th>enviado/entregue/lido</th><th>erro sanitizado</th><th>ações</th></tr></thead>
        <tbody>
          {deliveries.map(d => (
            <tr key={d.id} style={{ background: d.status === "falhou" ? "#ffe6e6" : d.status === "fila" ? "#fffbe6" : d.status === "enviado_pelo_provedor" ? "#e6f0ff" : d.status.includes("comprovada") ? "#e6ffe6" : "transparent" }}>
              <td>{d.proposal_id.slice(0,8)} v{d.proposal_version}</td>
              <td>{d.recipient_email} {d.recipient_name ? `(${d.recipient_name})` : ""}</td>
              <td>{d.channel}</td>
              <td><strong>{d.status}</strong></td>
              <td>{d.provider_message_id || "-"}</td>
              <td>{d.attempts}</td>
              <td>{d.sent_at ? new Date(d.sent_at).toLocaleString("pt-BR") : "-"} / {d.delivered_at ? new Date(d.delivered_at).toLocaleString("pt-BR") : "-"} / {d.read_at ? new Date(d.read_at).toLocaleString("pt-BR") : "-"}</td>
              <td style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }}>{d.last_error_sanitized || "-"}</td>
              <td>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <button onClick={() => send(d.id)}>Enviar provedor</button>
                  <button onClick={() => confirmDelivery(d.id, "entregue_comprovada")}>Webhook entregue (com proof)</button>
                  <button onClick={() => confirmDelivery(d.id, "leitura_comprovada")}>Webhook leitura (com proof)</button>
                  <button onClick={() => confirmDelivery(d.id, "aceito")}>Aceite (cria assinatura)</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
