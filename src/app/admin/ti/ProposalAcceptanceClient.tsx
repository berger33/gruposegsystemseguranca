"use client";
import { useEffect, useState } from "react";

type Link = {
  id: string;
  proposal_id: string;
  proposal_version: number;
  token_prefix: string;
  recipient_email: string;
  recipient_name: string | null;
  expires_at: string;
  status: string;
  is_used: boolean;
  legal_value_note: string | null;
  is_qualified_signature: boolean;
  is_simple_click: boolean;
};

export default function ProposalAcceptanceClient() {
  const [links, setLinks] = useState<Link[]>([]);
  const [total, setTotal] = useState(0);
  const [proposalId, setProposalId] = useState("");
  const [form, setForm] = useState({ proposal_id: "", proposal_version: "", recipient_email: "", recipient_name: "", expires_days: "7", legal_value_note: "Decisão jurídica: aceite por link seguro expirável vinculado à versão vX representa manifestação de vontade para contratação, não se confunde com assinatura qualificada ICP-Brasil. Valor do aceite: aceitação da proposta na versão vinculada, sujeita a contrato posterior. Responsável jurídico a validar.", acceptance_note: "" });
  const [msg, setMsg] = useState("");
  const [lastToken, setLastToken] = useState<{ token: string; secureLink: string } | null>(null);

  async function load() {
    const q = new URLSearchParams();
    if (proposalId) q.set("proposalId", proposalId);
    q.set("limit", "100");
    const r = await fetch(`/api/crm/proposal-acceptance-links?${q.toString()}`);
    const j = await r.json();
    if (r.ok) { setLinks(j.links || []); setTotal(j.total || 0); }
    else setMsg(`Erro listar: ${j.error}`);
  }

  useEffect(() => { load(); }, []);

  async function create() {
    setMsg(""); setLastToken(null);
    if (!form.proposal_id.trim() || !form.recipient_email.trim()) { setMsg("proposal_id e recipient_email obrigatórios"); return; }
    const body = {
      proposal_id: form.proposal_id.trim(),
      proposal_version: form.proposal_version ? Number(form.proposal_version) : null,
      recipient_email: form.recipient_email.trim(),
      recipient_name: form.recipient_name || null,
      expires_days: Number(form.expires_days),
      legal_value_note: form.legal_value_note || null,
      acceptance_note: form.acceptance_note || null,
    };
    const r = await fetch(`/api/crm/proposal-acceptance-links`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro criar: ${j.error} ${j.message || ""}`); return; }
    setMsg(`Link criado ${j.link.id} v${j.link.proposal_version} prefix ${j.link.token_prefix} expira ${j.link.expires_at}`);
    setLastToken({ token: j.token, secureLink: j.secureLink });
    setForm({ ...form, proposal_id: "", proposal_version: "", recipient_email: "", recipient_name: "" });
    load();
  }

  async function viewByToken() {
    if (!lastToken) { setMsg("Crie link primeiro"); return; }
    const r = await fetch(`/api/crm/proposals/accept/${lastToken.token}`);
    const j = await r.json();
    if (!r.ok) setMsg(`Erro view token: ${j.error}`);
    else setMsg(`View token ok: proposta v${j.proposal_version} status ${j.snapshot?.proposal?.status || "?"} — ${j.note}`);
  }

  async function acceptByToken() {
    if (!lastToken) { setMsg("Crie link primeiro"); return; }
    const signer_name = prompt("Nome do signatário para aceite?") || form.recipient_name || "Cliente";
    const r = await fetch(`/api/crm/proposals/accept/${lastToken.token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true, signer_name, acceptance_note: "Aceito proposta na versão vinculada via link seguro" }) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro aceite: ${j.error} ${j.current_status ? `status atual ${j.current_status}` : ""}`);
    else setMsg(`Aceite ok: ${j.proposal_id} v${j.proposal_version} signature ${j.signature_id} — ${j.note}`);
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
      <h2>CRM-22 — Aceite por link seguro expirável vinculado à versão</h2>
      <p style={{ fontSize: 12, color: "#555" }}>Link seguro com token_hash, token_prefix, expires_at, is_used, status ativo/usado/expirado/revogado, vinculado à versão (proposal_version) com snapshot preservado. Decisão jurídica sobre valor do aceite registrada em legal_value_note. Não chamar clique simples de assinatura qualificada: is_qualified_signature=false, is_simple_click=true, com nota explícita.</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input placeholder="proposalId filtro" value={proposalId} onChange={e => setProposalId(e.target.value)} style={{ width: 280 }} />
        <button onClick={load}>Filtrar</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, marginBottom: 12 }}>
        <input placeholder="proposal_id *" value={form.proposal_id} onChange={e => setForm({ ...form, proposal_id: e.target.value })} />
        <input placeholder="proposal_version opcional" value={form.proposal_version} onChange={e => setForm({ ...form, proposal_version: e.target.value })} />
        <input placeholder="recipient_email *" value={form.recipient_email} onChange={e => setForm({ ...form, recipient_email: e.target.value })} />
        <input placeholder="recipient_name" value={form.recipient_name} onChange={e => setForm({ ...form, recipient_name: e.target.value })} />
        <input type="number" placeholder="expires_days 1-90" value={form.expires_days} onChange={e => setForm({ ...form, expires_days: e.target.value })} />
      </div>
      <textarea placeholder="legal_value_note (decisão jurídica sobre valor do aceite)" value={form.legal_value_note} onChange={e => setForm({ ...form, legal_value_note: e.target.value })} style={{ width: "100%", minHeight: 60, marginBottom: 6 }} />
      <input placeholder="acceptance_note opcional" value={form.acceptance_note} onChange={e => setForm({ ...form, acceptance_note: e.target.value })} style={{ width: "100%", marginBottom: 8 }} />
      <button onClick={create}>Criar link seguro expirável vinculado à versão</button>

      {lastToken && (
        <div style={{ marginTop: 12, padding: 12, background: "#e6f7ff", borderRadius: 6, fontSize: 12 }}>
          <strong>Token (mostrado apenas uma vez):</strong> <code style={{ wordBreak: "break-all" }}>{lastToken.token}</code><br />
          <strong>Link seguro:</strong> <a href={lastToken.secureLink} target="_blank">{lastToken.secureLink}</a><br />
          <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
            <button onClick={viewByToken}>GET /accept/:token (view)</button>
            <button onClick={acceptByToken}>POST /accept/:token (aceitar)</button>
          </div>
        </div>
      )}

      {msg && <div style={{ marginTop: 8, fontSize: 12 }}>{msg}</div>}

      <h3 style={{ marginTop: 16 }}>Links ({total})</h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead><tr><th>proposta v</th><th>token prefix</th><th>destinatário</th><th>expira</th><th>status</th><th>usado?</th><th>jurídico</th><th>qualificada?</th><th>clique simples?</th></tr></thead>
        <tbody>
          {links.map(l => (
            <tr key={l.id} style={{ background: l.status === "usado" ? "#e6ffe6" : l.status === "expirado" ? "#ffe6e6" : l.status === "ativo" ? "#fffbe6" : "transparent" }}>
              <td>{l.proposal_id.slice(0,8)} v{l.proposal_version}</td>
              <td>{l.token_prefix}</td>
              <td>{l.recipient_email} {l.recipient_name ? `(${l.recipient_name})` : ""}</td>
              <td>{new Date(l.expires_at).toLocaleString()}</td>
              <td>{l.status}</td>
              <td>{l.is_used ? "sim" : "não"}</td>
              <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{l.legal_value_note || "-"}</td>
              <td>{l.is_qualified_signature ? "SIM (não deve para clique simples)" : "não (correto para clique simples)"}</td>
              <td>{l.is_simple_click ? "sim (aceite simples)" : "não"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
