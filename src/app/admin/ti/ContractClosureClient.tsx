"use client";
import { useState } from "react";

export default function ContractClosureClient() {
  const [contractId, setContractId] = useState("");
  const [closure, setClosure] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [revocations, setRevocations] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [progress, setProgress] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ closure_type: "encerramento", closure_date: "", effective_date: "", reason: "", responsible_name: "", notes: "" });
  const [statusForm, setStatusForm] = useState({ next_status: "em_andamento", reason: "" });
  const [stepForm, setStepForm] = useState({ step_id: "desmobilizacao_equipe", status: "concluido", responsible_name: "", notes: "" });
  const [revForm, setRevForm] = useState({ scope_type: "", scope_description: "", revoked_at: "", reason: "" });

  async function load() {
    if (!contractId.trim()) { setMsg("contract_id obrigatório"); return; }
    const id = contractId.trim();
    const r = await fetch(`/api/crm/contracts/${id}/closure`);
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro: ${j.error} ${j.note || ""}`); return; }
    setClosure(j.closure);
    setSteps(j.steps || []);
    setRevocations(j.revocations || []);
    setHistory(j.history || []);
    setProgress(j.progress);
    setMsg(`Contrato ${id} — ${j.closure ? `encerramento ${j.closure.status} efeito ${j.closure.effective_date} ${j.progress?.percent || 0}%` : "sem encerramento"} — ${j.note}`);
  }

  async function create() {
    if (!form.closure_date.trim() || !form.effective_date.trim() || !form.reason.trim() || form.reason.trim().length < 10) { setMsg("closure_date, effective_date, reason >=10 obrigatórios"); return; }
    const body = { closure_type: form.closure_type, closure_date: form.closure_date.trim(), effective_date: form.effective_date.trim(), reason: form.reason.trim(), responsible_name: form.responsible_name.trim() || null, notes: form.notes.trim() || null };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/closure`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro criar encerramento: ${j.error}`);
    else { setMsg(`Encerramento criado ${j.closure.id} — ${j.note}`); load(); }
  }

  async function changeStatus() {
    const body = { status: statusForm.next_status, reason: statusForm.reason.trim() || null };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/closure`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro transição: ${j.error} incomplete ${j.incomplete_count || ""} ${j.note || ""}`);
    else { setMsg(`Transição OK ${j.closure.status} — ${j.note}`); load(); }
  }

  async function updateStep() {
    const body = { step_id: stepForm.step_id, status: stepForm.status, responsible_name: stepForm.responsible_name.trim() || null, notes: stepForm.notes.trim() || null };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/closure/steps`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro atualizar step: ${j.error}`);
    else { setMsg(`Step ${j.step.step_type} ${j.step.status}`); load(); }
  }

  async function createRevocation() {
    if (!revForm.scope_type.trim() || !revForm.revoked_at.trim()) { setMsg("scope_type e revoked_at obrigatórios"); return; }
    const body = { scope_type: revForm.scope_type.trim(), scope_description: revForm.scope_description.trim() || null, revoked_at: revForm.revoked_at.trim(), reason: revForm.reason.trim() || null };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/closure/revocations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro revogar escopo: ${j.error}`);
    else { setMsg(`Escopo revogado ${j.revocation.id} — ${j.note}`); load(); }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #c0392b", borderRadius: 8 }}>
      <h2>CON-09 — Encerramento com desmobilização, devolução, cobranças/pendências, documentos e revogação de escopos; preservar histórico</h2>
      <p style={{ fontSize: 12, color: "#555" }}>Encerramento com closure_type encerramento/rescisao/distrato/termino_vigencia/outro, closure_date, effective_date (data de efeito — deixa de gerar novas rotinas sem apagar lançamentos existentes), reason ≥10, status planejado/em_andamento/concluido/cancelado, responsável. Checklist: desmobilizacao_equipe, devolucao_equipamentos, devolucao_chaves, cobrancas_pendencias, documentos_finais, revogacao_escopos, comunicacao_cliente. Revogação de escopos com scope_type, revoked_at, reason. Preservar histórico: contrato não deletado, itens preservados, status encerrado com data efeito, histórico closure e contract status.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input placeholder="contract_id *" value={contractId} onChange={e => setContractId(e.target.value)} style={{ width: 360 }} />
        <button onClick={load}>Carregar encerramento</button>
      </div>

      {msg && <div style={{ fontSize: 12, marginBottom: 8, padding: 6, background: "#fdedec" }}>{msg}</div>}

      {closure && (
        <div style={{ fontSize: 12, marginBottom: 12, border: "1px solid #ddd", padding: 8 }}>
          <strong>Encerramento:</strong> {closure.id.slice(0,8)} — tipo {closure.closure_type} — data {closure.closure_date} efeito {closure.effective_date} — status {closure.status} — resp {closure.responsible_name || "-"} — progresso {progress?.percent || 0}% ({progress?.completed || 0}/{progress?.total || 0}) — razão {closure.reason.slice(0,100)}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div>
          <h4>Criar encerramento</h4>
          <select value={form.closure_type} onChange={e => setForm({ ...form, closure_type: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="encerramento">encerramento</option><option value="rescisao">rescisao</option><option value="distrato">distrato</option><option value="termino_vigencia">termino_vigencia</option><option value="outro">outro</option>
          </select>
          <input placeholder="closure_date YYYY-MM-DD *" value={form.closure_date} onChange={e => setForm({ ...form, closure_date: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="effective_date YYYY-MM-DD * data efeito deixa gerar novas rotinas" value={form.effective_date} onChange={e => setForm({ ...form, effective_date: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <textarea placeholder="reason * >=10 motivo encerramento" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} style={{ width: "100%", minHeight: 60, marginBottom: 4 }} />
          <input placeholder="responsible_name" value={form.responsible_name} onChange={e => setForm({ ...form, responsible_name: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <textarea placeholder="notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ width: "100%", minHeight: 40, marginBottom: 4 }} />
          <button onClick={create}>Criar encerramento planejado</button>

          <h4 style={{ marginTop: 12 }}>Transição status encerramento</h4>
          <select value={statusForm.next_status} onChange={e => setStatusForm({ ...statusForm, next_status: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="em_andamento">em_andamento</option><option value="concluido">concluido</option><option value="planejado">planejado</option><option value="cancelado">cancelado</option>
          </select>
          <input placeholder="reason motivo transição" value={statusForm.reason} onChange={e => setStatusForm({ ...statusForm, reason: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <button onClick={changeStatus}>Transitar encerramento (concluido exige checklist completo)</button>
        </div>

        <div>
          <h4>Checklist desmobilização ({steps.length})</h4>
          <ul style={{ fontSize: 11, maxHeight: 250, overflowY: "auto", border: "1px solid #eee", padding: 8 }}>
            {steps.map((s: any) => (
              <li key={s.id} style={{ marginBottom: 4, color: s.status === 'concluido' ? 'green' : 'black' }}>
                <strong>{s.step_type}</strong> {s.title} — {s.status} — resp {s.responsible_name || "-"} — {s.completed_at || "-"} — {s.notes || ""}
              </li>
            ))}
          </ul>
          <h4 style={{ marginTop: 8 }}>Atualizar step encerramento</h4>
          <select value={stepForm.step_id} onChange={e => setStepForm({ ...stepForm, step_id: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="desmobilizacao_equipe">desmobilizacao_equipe</option><option value="devolucao_equipamentos">devolucao_equipamentos</option><option value="devolucao_chaves">devolucao_chaves</option><option value="cobrancas_pendencias">cobrancas_pendencias</option><option value="documentos_finais">documentos_finais</option><option value="revogacao_escopos">revogacao_escopos</option><option value="comunicacao_cliente">comunicacao_cliente</option><option value="outro">outro</option>
          </select>
          <select value={stepForm.status} onChange={e => setStepForm({ ...stepForm, status: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="pendente">pendente</option><option value="em_andamento">em_andamento</option><option value="concluido">concluido</option><option value="nao_aplicavel">nao_aplicavel</option>
          </select>
          <input placeholder="responsible_name" value={stepForm.responsible_name} onChange={e => setStepForm({ ...stepForm, responsible_name: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="notes" value={stepForm.notes} onChange={e => setStepForm({ ...stepForm, notes: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <button onClick={updateStep}>Atualizar step encerramento</button>
        </div>

        <div>
          <h4>Revogação escopos ({revocations.length}) + histórico</h4>
          <input placeholder="scope_type * ex: acesso_portal_cliente" value={revForm.scope_type} onChange={e => setRevForm({ ...revForm, scope_type: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="scope_description ex: Revoga acesso cliente ao portal" value={revForm.scope_description} onChange={e => setRevForm({ ...revForm, scope_description: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="revoked_at YYYY-MM-DD *" value={revForm.revoked_at} onChange={e => setRevForm({ ...revForm, revoked_at: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="reason motivo revogação" value={revForm.reason} onChange={e => setRevForm({ ...revForm, reason: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <button onClick={createRevocation}>Revogar escopo (preserva histórico)</button>

          <ul style={{ fontSize: 11, maxHeight: 150, overflowY: "auto", border: "1px solid #eee", padding: 8, marginTop: 8 }}>
            {revocations.map((r: any) => (
              <li key={r.id} style={{ marginBottom: 4 }}>
                <strong>{r.scope_type}</strong> — {r.scope_description || ""} — revogado {r.revoked_at} por {r.revoked_by || "-"} — {r.reason || ""} — id {r.id.slice(0,8)}
              </li>
            ))}
          </ul>

          <h4 style={{ marginTop: 8 }}>Histórico encerramento ({history.length})</h4>
          <ul style={{ fontSize: 11, maxHeight: 150, overflowY: "auto", border: "1px solid #eee", padding: 8 }}>
            {history.map((h: any) => (
              <li key={h.id}>{h.previous_status || "null"}→{h.next_status} efeito {h.effective_date} — {h.reason?.slice(0,80)} — por {h.changed_by} {new Date(h.created_at).toLocaleString()}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
