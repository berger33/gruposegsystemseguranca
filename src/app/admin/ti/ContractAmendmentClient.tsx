"use client";
import { useState } from "react";

export default function ContractAmendmentClient() {
  const [contractId, setContractId] = useState("");
  const [amendments, setAmendments] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    type: "aditivo",
    title: "",
    base_type: "outro",
    base_description: "",
    base_value: "",
    justification: "",
    vigencia_start: "",
    vigencia_end: "",
    effective_date: "",
    previous_total_price: "",
    new_total_price: "",
  });
  const [statusForm, setStatusForm] = useState({ amendment_id: "", next_status: "em_revisao", reason: "", rejection_reason: "" });

  async function load() {
    if (!contractId.trim()) { setMsg("contract_id obrigatório"); return; }
    const id = contractId.trim();
    const r = await fetch(`/api/crm/contracts/${id}/amendments`);
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro: ${j.error}`); return; }
    setAmendments(j.amendments || []);
    setMsg(`Contrato ${id} — ${j.amendments?.length || 0} aditivos/reajustes. Nota: ${j.note}`);
  }

  async function create() {
    if (!contractId.trim()) { setMsg("contract_id obrigatório"); return; }
    if (!form.title.trim() || !form.justification.trim() || form.justification.trim().length < 10) { setMsg("title e justification >=10 obrigatórios"); return; }
    if (!form.vigencia_start.trim() || !form.effective_date.trim()) { setMsg("vigencia_start e effective_date obrigatórios"); return; }
    const body: any = {
      type: form.type,
      title: form.title.trim(),
      base_type: form.base_type,
      base_description: form.base_description.trim() || null,
      base_value: form.base_value ? Number(form.base_value) : null,
      justification: form.justification.trim(),
      vigencia_start: form.vigencia_start.trim(),
      vigencia_end: form.vigencia_end.trim() || null,
      effective_date: form.effective_date.trim(),
      previous_total_price: form.previous_total_price ? Number(form.previous_total_price) : null,
      new_total_price: form.new_total_price ? Number(form.new_total_price) : null,
    };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/amendments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro criar aditivo: ${j.error}`);
    else { setMsg(`Aditivo criado ${j.amendment?.id || j.existing_id} — ${j.note}`); load(); }
  }

  async function changeStatus() {
    if (!contractId.trim() || !statusForm.amendment_id.trim()) { setMsg("contract_id e amendment_id obrigatórios"); return; }
    const body: any = { status: statusForm.next_status, reason: statusForm.reason.trim() || null, rejection_reason: statusForm.rejection_reason.trim() || null };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/amendments/${statusForm.amendment_id.trim()}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro transição: ${j.error} allowed ${j.allowed?.join(",")}`);
    else { setMsg(`Transição OK ${j.amendment.status} v${j.amendment.version} — ${j.note}`); load(); }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #e67e22", borderRadius: 8 }}>
      <h2>CON-04 — Aditivos e reajustes com base, vigência, justificativa, aprovação e histórico</h2>
      <p style={{ fontSize: 12, color: "#555" }}>Aditivo/reajuste com base (índice IGPM/IPCA/INPC, dissídio, convenção, alteração escopo, prorrogação prazo, reajuste contratual, acordo comercial, outro), vigência (vigencia_start/end), effective_date (data de efeito), justificativa obrigatória ≥10 chars, aprovação (rascunho→em_revisao→aprovado/rejeitado→cancelado), histórico. Não sobrescrever valores históricos (previous_total preservado) e não gerar cobrança duplicada (idempotency_key). Mudar aditivo não altera faturas anteriores.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input placeholder="contract_id *" value={contractId} onChange={e => setContractId(e.target.value)} style={{ width: 360 }} />
        <button onClick={load}>Carregar aditivos</button>
      </div>

      {msg && <div style={{ fontSize: 12, marginBottom: 8, padding: 6, background: "#fdf2e9" }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <h4>Criar aditivo/reajuste</h4>
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="aditivo">aditivo</option>
            <option value="reajuste">reajuste</option>
            <option value="repactuacao">repactuacao</option>
            <option value="prorrogacao">prorrogacao</option>
            <option value="supressao">supressao</option>
            <option value="outro">outro</option>
          </select>
          <input placeholder="title * 1..200" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <select value={form.base_type} onChange={e => setForm({ ...form, base_type: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="indice_igpm">indice_igpm</option>
            <option value="indice_ipca">indice_ipca</option>
            <option value="indice_inpc">indice_inpc</option>
            <option value="dissidio_coletivo">dissidio_coletivo</option>
            <option value="convencao_coletiva">convencao_coletiva</option>
            <option value="alteracao_escopo">alteracao_escopo</option>
            <option value="prorrogacao_prazo">prorrogacao_prazo</option>
            <option value="reajuste_contratual">reajuste_contratual</option>
            <option value="acordo_comercial">acordo_comercial</option>
            <option value="outro">outro</option>
          </select>
          <input placeholder="base_description ex: IGPM 5,2% ou Dissídio 2026" value={form.base_description} onChange={e => setForm({ ...form, base_description: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="base_value % ex: 5.2" type="number" value={form.base_value} onChange={e => setForm({ ...form, base_value: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <textarea placeholder="justification * >=10 chars motivo base vigência" value={form.justification} onChange={e => setForm({ ...form, justification: e.target.value })} style={{ width: "100%", minHeight: 60, marginBottom: 4 }} />
          <input placeholder="vigencia_start YYYY-MM-DD *" value={form.vigencia_start} onChange={e => setForm({ ...form, vigencia_start: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="vigencia_end YYYY-MM-DD" value={form.vigencia_end} onChange={e => setForm({ ...form, vigencia_end: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="effective_date YYYY-MM-DD * data de efeito" value={form.effective_date} onChange={e => setForm({ ...form, effective_date: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="previous_total_price (auto se vazio usa contrato atual)" type="number" value={form.previous_total_price} onChange={e => setForm({ ...form, previous_total_price: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="new_total_price" type="number" value={form.new_total_price} onChange={e => setForm({ ...form, new_total_price: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <button onClick={create}>Criar aditivo/reajuste (idempotente)</button>
          <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>Idempotency: contract+type+title+effective_date. Não sobrescreve histórico (previous preservado). Não gera cobrança duplicada. Faturas anteriores não alteradas.</div>
        </div>

        <div>
          <h4>Lista ({amendments.length}) e aprovação</h4>
          <ul style={{ fontSize: 11, maxHeight: 200, overflowY: "auto", border: "1px solid #eee", padding: 8, marginBottom: 8 }}>
            {amendments.map((a: any) => (
              <li key={a.id} style={{ marginBottom: 4 }}>
                <strong>{a.type} {a.title}</strong> — base {a.base_type} {a.base_description || ""} {a.base_value != null ? `${a.base_value}%` : ""} — vigência {a.vigencia_start}→{a.vigencia_end || "-"} efeito {a.effective_date} — status {a.status} v{a.version} — prev R${a.previous_total_price} → novo R${a.new_total_price || "-"} — id {a.id.slice(0,8)}
                <br />just: {a.justification.slice(0,100)}
              </li>
            ))}
          </ul>

          <h4>Transição aprovação</h4>
          <input placeholder="amendment_id *" value={statusForm.amendment_id} onChange={e => setStatusForm({ ...statusForm, amendment_id: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <select value={statusForm.next_status} onChange={e => setStatusForm({ ...statusForm, next_status: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="em_revisao">em_revisao</option>
            <option value="aprovado">aprovado</option>
            <option value="rejeitado">rejeitado</option>
            <option value="rascunho">rascunho</option>
            <option value="cancelado">cancelado</option>
          </select>
          <input placeholder="reason motivo aprovação/rejeição" value={statusForm.reason} onChange={e => setStatusForm({ ...statusForm, reason: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="rejection_reason se rejeitado" value={statusForm.rejection_reason} onChange={e => setStatusForm({ ...statusForm, rejection_reason: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <button onClick={changeStatus}>Transitar status aditivo</button>
          <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>rascunho→em_revisao/cancelado, em_revisao→rascunho/aprovado/rejeitado/cancelado, aprovado→cancelado (não sobrescreve histórico), rejeitado→rascunho/em_revisao/cancelado. Aprovado não altera faturas anteriores automaticamente.</div>
        </div>
      </div>
    </section>
  );
}
