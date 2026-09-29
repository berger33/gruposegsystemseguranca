"use client";
import { useState } from "react";

export default function ContractStatusClient() {
  const [contractId, setContractId] = useState("");
  const [contract, setContract] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ next_status: "em_revisao", effective_date: "", reason: "", is_signature_event: false, is_operational_activation: false, signed_by: "", suspension_reason: "", closure_reason: "" });
  const [sigForm, setSigForm] = useState({ signed_at: "", signed_by: "", reason: "" });

  async function load() {
    if (!contractId.trim()) { setMsg("contract_id obrigatório"); return; }
    const id = contractId.trim();
    const r = await fetch(`/api/crm/contracts/${id}/status-history`);
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro: ${j.error}`); return; }
    setContract(j.contract);
    setHistory(j.history || []);
    setAllowed(j.allowed_transitions || []);
    setMsg(`Contrato ${id} status ${j.contract.status} efeito ${j.contract.current_status_effective_date || "-"} assinatura ${j.contract.signed_at ? new Date(j.contract.signed_at).toLocaleDateString() : "-"} ativação operacional ${j.contract.operational_activated_at ? new Date(j.contract.operational_activated_at).toLocaleDateString() : "-"}`);
  }

  async function transition() {
    if (!contractId.trim()) { setMsg("contract_id obrigatório"); return; }
    if (!form.effective_date.trim()) { setMsg("effective_date obrigatória (data de efeito)"); return; }
    const body: any = {
      next_status: form.next_status,
      effective_date: form.effective_date.trim(),
      reason: form.reason.trim() || null,
      is_signature_event: form.is_signature_event,
      is_operational_activation: form.is_operational_activation,
      signed_by: form.signed_by.trim() || null,
      suspension_reason: form.suspension_reason.trim() || null,
      closure_reason: form.closure_reason.trim() || null,
    };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro transição: ${j.error} ${j.detail || ""} allowed: ${(j.allowed||[]).join(",")}`);
    else { setMsg(`Transição OK ${j.contract.status} efeito ${j.contract.current_status_effective_date} hist ${j.history_id} — Assinatura distinta de ativação operacional`); load(); }
  }

  async function registerSignature() {
    if (!contractId.trim()) { setMsg("contract_id obrigatório"); return; }
    const body = { signed_at: sigForm.signed_at.trim() || new Date().toISOString(), signed_by: sigForm.signed_by.trim() || null, reason: sigForm.reason.trim() || "Assinatura registrada" };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/signature`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro assinatura: ${j.error}`);
    else { setMsg(`Assinatura registrada ${j.contract.signed_at} por ${j.contract.signed_by} — Não confunde com ativação operacional`); load(); }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #4a90e2", borderRadius: 8 }}>
      <h2>CON-03 — Estados rascunho, em revisão, aguardando assinatura, ativo, suspenso, encerrado; transições autorizadas e data de efeito</h2>
      <p style={{ fontSize: 12, color: "#555" }}>Estados: rascunho → em_revisao → aguardando_assinatura → ativo → suspenso/encerrado. Transições autorizadas validadas. Data de efeito obrigatória. Assinatura (signed_at) distinta de ativação operacional (operational_activated_at). Não confundir assinatura com ativação operacional. Assinatura pode ser registrada separadamente enquanto em aguardando_assinatura.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input placeholder="contract_id *" value={contractId} onChange={e => setContractId(e.target.value)} style={{ width: 360 }} />
        <button onClick={load}>Carregar status/histórico</button>
      </div>

      {msg && <div style={{ fontSize: 12, marginBottom: 8, padding: 6, background: "#f5f5f5" }}>{msg}</div>}

      {contract && (
        <div style={{ fontSize: 12, marginBottom: 12, border: "1px solid #ddd", padding: 8 }}>
          <strong>Contrato:</strong> {contract.id} — <span style={{ fontWeight: "bold" }}>{contract.status}</span> — efeito: {contract.current_status_effective_date || "-"} — assinatura: {contract.signed_at ? `${new Date(contract.signed_at).toLocaleString()} por ${contract.signed_by||"-"}` : "não assinado"} — ativação operacional: {contract.operational_activated_at ? new Date(contract.operational_activated_at).toLocaleString() : "não ativado"} — suspensão: {contract.suspension_reason || "-"} — encerramento: {contract.closure_reason || "-"}
          <br />
          <em>Permitidas a partir de {contract.status}:</em> {allowed.length ? allowed.join(", ") : "nenhuma (terminal)"} — Todos: rascunho, em_revisao, aguardando_assinatura, ativo, suspenso, encerrado, cancelado
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <h4>Transição de estado (com data de efeito)</h4>
          <select value={form.next_status} onChange={e => setForm({ ...form, next_status: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="rascunho">rascunho</option>
            <option value="em_revisao">em_revisao (em revisão)</option>
            <option value="aguardando_assinatura">aguardando_assinatura</option>
            <option value="ativo">ativo</option>
            <option value="suspenso">suspenso</option>
            <option value="encerrado">encerrado</option>
            <option value="cancelado">cancelado</option>
          </select>
          <input placeholder="effective_date YYYY-MM-DD * (data de efeito)" value={form.effective_date} onChange={e => setForm({ ...form, effective_date: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <textarea placeholder="reason / motivo" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} style={{ width: "100%", minHeight: 50, marginBottom: 4 }} />
          <input placeholder="signed_by (quem assinou)" value={form.signed_by} onChange={e => setForm({ ...form, signed_by: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="suspension_reason (se suspenso)" value={form.suspension_reason} onChange={e => setForm({ ...form, suspension_reason: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="closure_reason (se encerrado)" value={form.closure_reason} onChange={e => setForm({ ...form, closure_reason: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <label style={{ fontSize: 11, display: "block", marginBottom: 4 }}><input type="checkbox" checked={form.is_signature_event} onChange={e => setForm({ ...form, is_signature_event: e.target.checked })} /> is_signature_event (marca assinatura)</label>
          <label style={{ fontSize: 11, display: "block", marginBottom: 4 }}><input type="checkbox" checked={form.is_operational_activation} onChange={e => setForm({ ...form, is_operational_activation: e.target.checked })} /> is_operational_activation (marca ativação operacional — só para ativo)</label>
          <button onClick={transition}>Transitar status com data de efeito</button>
          <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>Regras: rascunho→em_revisao/cancelado, em_revisao→rascunho/aguardando_assinatura/cancelado, aguardando_assinatura→em_revisao/ativo/cancelado (ativo exige assinatura), ativo→suspenso/encerrado/cancelado, suspenso→ativo/encerrado/cancelado, encerrado/cancelado terminal. Assinatura ≠ ativação operacional.</div>
        </div>

        <div>
          <h4>Registrar assinatura separada (distinta de ativação)</h4>
          <input placeholder="signed_at ISO ou YYYY-MM-DD" value={sigForm.signed_at} onChange={e => setSigForm({ ...sigForm, signed_at: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="signed_by" value={sigForm.signed_by} onChange={e => setSigForm({ ...sigForm, signed_by: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <textarea placeholder="reason assinatura" value={sigForm.reason} onChange={e => setSigForm({ ...sigForm, reason: e.target.value })} style={{ width: "100%", minHeight: 40, marginBottom: 4 }} />
          <button onClick={registerSignature}>Registrar assinatura (não ativa operacionalmente)</button>
          <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>Usar quando contrato está em aguardando_assinatura e cliente assinou, mas ativação operacional ocorrerá depois com data de efeito própria.</div>

          <h4 style={{ marginTop: 16 }}>Histórico ({history.length})</h4>
          <ul style={{ fontSize: 11, maxHeight: 300, overflowY: "auto", border: "1px solid #eee", padding: 8 }}>
            {history.map((h: any) => (
              <li key={h.id} style={{ marginBottom: 4 }}>
                <strong>{h.previous_status || "null"} → {h.next_status}</strong> efeito {h.effective_date} {h.is_signature_event ? "✍️ assinatura" : ""} {h.is_operational_activation ? "🚀 ativação operacional" : ""} — {h.reason || "-"} — por {h.changed_by} em {new Date(h.created_at).toLocaleString()}
                {h.signed_at ? ` signed_at ${new Date(h.signed_at).toLocaleDateString()}` : ""} {h.operational_activated_at ? ` op_ativ ${new Date(h.operational_activated_at).toLocaleDateString()}` : ""}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
