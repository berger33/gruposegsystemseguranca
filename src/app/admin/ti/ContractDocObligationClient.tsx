"use client";
import { useState } from "react";

export default function ContractDocObligationClient() {
  const [contractId, setContractId] = useState("");
  const [obligations, setObligations] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ title: "", category: "outro", periodicity: "unica", responsible_name: "", due_date: "", file_url: "", description: "" });
  const [statusForm, setStatusForm] = useState({ obligation_id: "", next_status: "em_analise", reason: "", rejection_reason: "", file_url: "" });

  async function load() {
    if (!contractId.trim()) { setMsg("contract_id obrigatório"); return; }
    const id = contractId.trim();
    const r = await fetch(`/api/crm/contracts/${id}/doc-obligations`);
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro: ${j.error}`); return; }
    setObligations(j.obligations || []);
    setMsg(`Contrato ${id} — ${j.obligations?.length || 0} obrigações documentais. ${j.note || ""}`);
  }

  async function create() {
    if (!form.title.trim() || !form.responsible_name.trim()) { setMsg("title e responsible_name obrigatórios"); return; }
    const body = {
      title: form.title.trim(),
      category: form.category,
      description: form.description.trim() || null,
      periodicity: form.periodicity,
      responsible_name: form.responsible_name.trim(),
      due_date: form.due_date.trim() || null,
      file_url: form.file_url.trim() || null,
    };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/doc-obligations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro criar obrigação: ${j.error}`);
    else { setMsg(`Obrigação criada ${j.obligation.id} — ${j.note}`); load(); }
  }

  async function changeStatus() {
    if (!statusForm.obligation_id.trim()) { setMsg("obligation_id obrigatório"); return; }
    const body: any = { status: statusForm.next_status, reason: statusForm.reason.trim() || null, rejection_reason: statusForm.rejection_reason.trim() || null, file_url: statusForm.file_url.trim() || null };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/doc-obligations/${statusForm.obligation_id.trim()}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro transição: ${j.error} ${j.detail || ""} allowed ${j.allowed?.join(",")}`);
    else { setMsg(`Transição OK ${j.obligation.status} — ${j.note}`); load(); }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #8e44ad", borderRadius: 8 }}>
      <h2>CON-06 — Obrigações documentais por cliente/contrato com categoria, periodicidade, responsável, aprovação e comprovante</h2>
      <p style={{ fontSize: 12, color: "#555" }}>Por cliente (company_id) e contrato (contract_id) — pelo menos um obrigatório. Categoria: certidao/alvara/licenca/comprovante/contrato/atestado/seguro/treinamento/outro. Periodicidade: unica/mensal/trimestral/semestral/anual/sob_demanda/outro com next_due_date calculado. Responsável (responsible_name/responsible_id). Aprovação: pendente→em_analise→aprovado/rejeitado, aprovado→vencido→pendente, comprovante file_url/storage_key obrigatório para em_analise. Histórico.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input placeholder="contract_id *" value={contractId} onChange={e => setContractId(e.target.value)} style={{ width: 360 }} />
        <button onClick={load}>Carregar obrigações documentais</button>
      </div>

      {msg && <div style={{ fontSize: 12, marginBottom: 8, padding: 6, background: "#f5eef8" }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <h4>Criar obrigação documental</h4>
          <input placeholder="title * ex: Certidão Negativa Federal" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="certidao">certidao</option><option value="alvara">alvara</option><option value="licenca">licenca</option><option value="comprovante">comprovante</option><option value="contrato">contrato</option><option value="atestado">atestado</option><option value="seguro">seguro</option><option value="treinamento">treinamento</option><option value="outro">outro</option>
          </select>
          <select value={form.periodicity} onChange={e => setForm({ ...form, periodicity: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="unica">unica</option><option value="mensal">mensal</option><option value="trimestral">trimestral</option><option value="semestral">semestral</option><option value="anual">anual</option><option value="sob_demanda">sob_demanda</option><option value="outro">outro</option>
          </select>
          <input placeholder="responsible_name * ex: Depto Jurídico" value={form.responsible_name} onChange={e => setForm({ ...form, responsible_name: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="due_date YYYY-MM-DD" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="file_url comprovante (opcional na criação)" value={form.file_url} onChange={e => setForm({ ...form, file_url: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <textarea placeholder="description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ width: "100%", minHeight: 50, marginBottom: 4 }} />
          <button onClick={create}>Criar obrigação documental</button>

          <ul style={{ fontSize: 11, maxHeight: 250, overflowY: "auto", border: "1px solid #eee", padding: 8, marginTop: 8 }}>
            {obligations.map((o: any) => (
              <li key={o.id} style={{ marginBottom: 4 }}>
                <strong>{o.category} {o.title}</strong> — {o.periodicity} — resp {o.responsible_name || o.responsible_id?.slice(0,8)} — status {o.status} — venc {o.due_date || "-"} prox {o.next_due_date || "-"} — comp {o.file_url ? "sim" : "não"} — id {o.id.slice(0,8)}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4>Enviar comprovante e aprovação</h4>
          <input placeholder="obligation_id *" value={statusForm.obligation_id} onChange={e => setStatusForm({ ...statusForm, obligation_id: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <select value={statusForm.next_status} onChange={e => setStatusForm({ ...statusForm, next_status: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="em_analise">em_analise (enviar comprovante)</option><option value="aprovado">aprovado</option><option value="rejeitado">rejeitado</option><option value="pendente">pendente</option><option value="vencido">vencido</option><option value="cancelado">cancelado</option>
          </select>
          <input placeholder="file_url comprovante (obrigatório para em_analise)" value={statusForm.file_url} onChange={e => setStatusForm({ ...statusForm, file_url: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="reason motivo aprovação/envio" value={statusForm.reason} onChange={e => setStatusForm({ ...statusForm, reason: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="rejection_reason se rejeitado" value={statusForm.rejection_reason} onChange={e => setStatusForm({ ...statusForm, rejection_reason: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <button onClick={changeStatus}>Transitar status obrigação</button>
          <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>pendente→em_analise/cancelado (em_analise exige comprovante), em_analise→aprovado/rejeitado/pendente/cancelado, aprovado→vencido/cancelado com next_due_date calculado por periodicidade, rejeitado→pendente/em_analise/cancelado, vencido→pendente/em_analise/cancelado.</div>
        </div>
      </div>
    </section>
  );
}
