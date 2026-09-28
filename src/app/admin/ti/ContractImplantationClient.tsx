"use client";
import { useState } from "react";

export default function ContractImplantationClient() {
  const [contractId, setContractId] = useState("");
  const [implantation, setImplantation] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [progress, setProgress] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [stepForm, setStepForm] = useState({ step_id: "contrato", status: "concluido", responsible_name: "", notes: "" });
  const [blockForm, setBlockForm] = useState({ title: "", description: "", block_type: "operacional", step_id: "", is_legal_requirement: false });
  const [exceptionForm, setExceptionForm] = useState({ block_id: "", step_id: "", title: "", motivation: "", legal_basis: "", applicable_rule: "", is_legal_exception: false });
  const [authForm, setAuthForm] = useState({ exception_id: "", status: "autorizada", authorization_notes: "", rejection_reason: "" });

  async function load() {
    if (!contractId.trim()) { setMsg("contract_id obrigatório"); return; }
    const id = contractId.trim();
    const [imp, b, e] = await Promise.all([
      fetch(`/api/crm/contracts/${id}/implantation`).then(r => r.json()),
      fetch(`/api/crm/contracts/${id}/implantation/blocks`).then(r => r.json()),
      fetch(`/api/crm/contracts/${id}/implantation/exceptions`).then(r => r.json()),
    ]);
    if (imp.implantation) setImplantation(imp.implantation);
    if (imp.steps) setSteps(imp.steps);
    if (imp.progress) setProgress(imp.progress);
    if (b.blocks) setBlocks(b.blocks);
    if (e.exceptions) setExceptions(e.exceptions);
    setMsg(`Implantação ${imp.implantation?.status || "-"} progresso ${imp.progress?.percent || 0}% ${imp.progress?.completed || 0}/${imp.progress?.total || 0} — ${imp.note || ""}`);
  }

  async function updateStep() {
    if (!stepForm.step_id.trim()) { setMsg("step_id obrigatório"); return; }
    const body = { status: stepForm.status, responsible_name: stepForm.responsible_name.trim() || null, notes: stepForm.notes.trim() || null };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/implantation/steps/${stepForm.step_id.trim()}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro atualizar step: ${j.error}`);
    else { setMsg(`Step ${j.step.step_id} ${j.step.status} all_completed ${j.all_completed}`); load(); }
  }

  async function createBlock() {
    if (!blockForm.title.trim() || !blockForm.description.trim()) { setMsg("title e description bloqueio obrigatórios >=20"); return; }
    const body = { title: blockForm.title.trim(), description: blockForm.description.trim(), block_type: blockForm.block_type, step_id: blockForm.step_id.trim() || null, is_legal_requirement: blockForm.is_legal_requirement, is_blocking: true };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/implantation/blocks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro criar bloqueio: ${j.error} ${j.detail || ""}`);
    else { setMsg(`Bloqueio criado ${j.block.id} legal ${j.block.is_legal_requirement} — ${j.note}`); load(); }
  }

  async function createException() {
    if (!exceptionForm.title.trim() || !exceptionForm.motivation.trim()) { setMsg("title e motivation >=20 obrigatórios"); return; }
    const body = { block_id: exceptionForm.block_id.trim() || null, step_id: exceptionForm.step_id.trim() || null, title: exceptionForm.title.trim(), motivation: exceptionForm.motivation.trim(), legal_basis: exceptionForm.legal_basis.trim() || null, applicable_rule: exceptionForm.applicable_rule.trim() || null, is_legal_exception: exceptionForm.is_legal_exception };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/implantation/exceptions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro criar exceção: ${j.error} ${j.detail || ""}`);
    else { setMsg(`Exceção criada ${j.exception.id} status ${j.exception.status} — ${j.note}`); load(); }
  }

  async function authorizeException() {
    if (!authForm.exception_id.trim()) { setMsg("exception_id obrigatório"); return; }
    const body: any = { status: authForm.status, authorization_notes: authForm.authorization_notes.trim() || null, rejection_reason: authForm.rejection_reason.trim() || null };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/implantation/exceptions/${authForm.exception_id.trim()}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro autorizar: ${j.error}`);
    else { setMsg(`Exceção ${j.exception.status} — ${j.note}`); load(); }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #d35400", borderRadius: 8 }}>
      <h2>CON-07 Implantação checklist + CON-08 Bloqueios claros exceção autorizada motivada</h2>
      <p style={{ fontSize: 12, color: "#555" }}>CON-07: contrato, data_inicio, postos, dimensionamento, contratacao_alocacao, exames_treinamentos, equipamentos, instrucoes, faturamento, convite_cliente — 10 itens obrigatórios com status pendente/em_andamento/concluido/nao_aplicavel/bloqueado, responsável, completed_at. Progresso % concluídos. CON-08: bloqueios claros para implantação incompleta com is_blocking, is_legal_requirement, description ≥20, block_type documentacao/treinamento/equipamento/legal/operacional/financeiro/outro. Exceção somente autorizada, motivada ≥20 (legal ≥50), com legal_basis e applicable_rule se is_legal_exception, não permitir contornar exigência legal com simples checkbox.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input placeholder="contract_id *" value={contractId} onChange={e => setContractId(e.target.value)} style={{ width: 360 }} />
        <button onClick={load}>Carregar implantação + checklist + bloqueios + exceções</button>
      </div>

      {msg && <div style={{ fontSize: 12, marginBottom: 8, padding: 6, background: "#fdf2e9" }}>{msg}</div>}

      {implantation && (
        <div style={{ fontSize: 12, marginBottom: 12, border: "1px solid #ddd", padding: 8 }}>
          <strong>Implantação:</strong> {implantation.id.slice(0,8)} — status {implantation.status} — data_inicio {implantation.data_inicio || implantation.started_at || "-"} — responsável {implantation.responsible_name || "-"} — progresso {progress?.percent || 0}% ({progress?.completed || 0}/{progress?.total || 0})
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div>
          <h4>Checklist 10 itens ({steps.length})</h4>
          <ul style={{ fontSize: 11, maxHeight: 250, overflowY: "auto", border: "1px solid #eee", padding: 8 }}>
            {steps.map((s: any) => (
              <li key={s.id} style={{ marginBottom: 4, color: s.status === 'concluido' ? 'green' : s.status === 'bloqueado' ? 'red' : 'black' }}>
                <strong>{s.step_id}</strong> {s.title} — {s.status} — resp {s.responsible_name || "-"} — {s.completed_at || "-"} — {s.notes || ""}
              </li>
            ))}
          </ul>
          <h4 style={{ marginTop: 8 }}>Atualizar step</h4>
          <select value={stepForm.step_id} onChange={e => setStepForm({ ...stepForm, step_id: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="contrato">contrato</option><option value="data_inicio">data_inicio</option><option value="postos">postos</option><option value="dimensionamento">dimensionamento</option><option value="contratacao_alocacao">contratacao_alocacao</option><option value="exames_treinamentos">exames_treinamentos</option><option value="equipamentos">equipamentos</option><option value="instrucoes">instrucoes</option><option value="faturamento">faturamento</option><option value="convite_cliente">convite_cliente</option>
          </select>
          <select value={stepForm.status} onChange={e => setStepForm({ ...stepForm, status: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="pendente">pendente</option><option value="em_andamento">em_andamento</option><option value="concluido">concluido</option><option value="nao_aplicavel">nao_aplicavel</option><option value="bloqueado">bloqueado</option>
          </select>
          <input placeholder="responsible_name" value={stepForm.responsible_name} onChange={e => setStepForm({ ...stepForm, responsible_name: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="notes" value={stepForm.notes} onChange={e => setStepForm({ ...stepForm, notes: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <button onClick={updateStep}>Atualizar step checklist</button>
        </div>

        <div>
          <h4>Bloqueios claros ({blocks.length}) CON-08</h4>
          <input placeholder="title bloqueio * ex: Falta documentação legal" value={blockForm.title} onChange={e => setBlockForm({ ...blockForm, title: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <textarea placeholder="description * >=20 clara ex: Cliente não enviou alvará funcionamento exigido por lei municipal" value={blockForm.description} onChange={e => setBlockForm({ ...blockForm, description: e.target.value })} style={{ width: "100%", minHeight: 60, marginBottom: 4 }} />
          <select value={blockForm.block_type} onChange={e => setBlockForm({ ...blockForm, block_type: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="documentacao">documentacao</option><option value="treinamento">treinamento</option><option value="equipamento">equipamento</option><option value="legal">legal</option><option value="operacional">operacional</option><option value="financeiro">financeiro</option><option value="outro">outro</option>
          </select>
          <input placeholder="step_id opcional ex: equipamentos" value={blockForm.step_id} onChange={e => setBlockForm({ ...blockForm, step_id: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <label style={{ fontSize: 11 }}><input type="checkbox" checked={blockForm.is_legal_requirement} onChange={e => setBlockForm({ ...blockForm, is_legal_requirement: e.target.checked })} /> is_legal_requirement (exigência legal — não contornar com checkbox)</label>
          <div><button onClick={createBlock} style={{ marginTop: 4 }}>Criar bloqueio claro</button></div>

          <ul style={{ fontSize: 11, maxHeight: 200, overflowY: "auto", border: "1px solid #eee", padding: 8, marginTop: 8 }}>
            {blocks.map((b: any) => (
              <li key={b.id} style={{ marginBottom: 4 }}>
                <strong>{b.block_type} {b.title}</strong> — {b.is_legal_requirement ? "⚖️ legal" : ""} {b.is_blocking ? "🚫 bloqueante" : "⚠️ aviso"} — step {b.step_id || "-"} — {b.description.slice(0,100)} — {b.resolved_at ? `resolvido ${new Date(b.resolved_at).toLocaleDateString()}` : "pendente"} — id {b.id.slice(0,8)}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4>Exceções autorizadas motivadas ({exceptions.length})</h4>
          <input placeholder="block_id opcional" value={exceptionForm.block_id} onChange={e => setExceptionForm({ ...exceptionForm, block_id: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="step_id opcional" value={exceptionForm.step_id} onChange={e => setExceptionForm({ ...exceptionForm, step_id: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="title * ex: Exceção temporária equipamento" value={exceptionForm.title} onChange={e => setExceptionForm({ ...exceptionForm, title: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <textarea placeholder="motivation * >=20 (legal >=50) ex: Cliente autorizou início com equipamento provisório por 15 dias devido atraso fornecedor, risco mitigado" value={exceptionForm.motivation} onChange={e => setExceptionForm({ ...exceptionForm, motivation: e.target.value })} style={{ width: "100%", minHeight: 60, marginBottom: 4 }} />
          <input placeholder="legal_basis se legal ex: Art 10 Lei 123" value={exceptionForm.legal_basis} onChange={e => setExceptionForm({ ...exceptionForm, legal_basis: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="applicable_rule ex: Norma interna 04/2026 permite provisório 15d" value={exceptionForm.applicable_rule} onChange={e => setExceptionForm({ ...exceptionForm, applicable_rule: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <label style={{ fontSize: 11 }}><input type="checkbox" checked={exceptionForm.is_legal_exception} onChange={e => setExceptionForm({ ...exceptionForm, is_legal_exception: e.target.checked })} /> is_legal_exception (exige legal_basis + applicable_rule + motivação detalhada)</label>
          <div><button onClick={createException} style={{ marginTop: 4 }}>Solicitar exceção motivada</button></div>

          <ul style={{ fontSize: 11, maxHeight: 150, overflowY: "auto", border: "1px solid #eee", padding: 8, marginTop: 8 }}>
            {exceptions.map((ex: any) => (
              <li key={ex.id} style={{ marginBottom: 4 }}>
                <strong>{ex.title}</strong> — {ex.status} — {ex.is_legal_exception ? "⚖️ legal" : ""} — block {ex.block_id ? ex.block_id.slice(0,8) : "-"} step {ex.step_id || "-"} — mot {ex.motivation.slice(0,80)} — regra {ex.applicable_rule || "-"} — id {ex.id.slice(0,8)}
              </li>
            ))}
          </ul>

          <h4 style={{ marginTop: 8 }}>Autorizar/rejeitar exceção</h4>
          <input placeholder="exception_id *" value={authForm.exception_id} onChange={e => setAuthForm({ ...authForm, exception_id: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <select value={authForm.status} onChange={e => setAuthForm({ ...authForm, status: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="autorizada">autorizada</option><option value="rejeitada">rejeitada</option><option value="em_analise">em_analise</option><option value="cancelada">cancelada</option>
          </select>
          <input placeholder="authorization_notes * se autorizada" value={authForm.authorization_notes} onChange={e => setAuthForm({ ...authForm, authorization_notes: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="rejection_reason se rejeitada" value={authForm.rejection_reason} onChange={e => setAuthForm({ ...authForm, rejection_reason: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <button onClick={authorizeException}>Autorizar/rejeitar exceção</button>
          <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>Exceção legal não pode ser contornada com simples checkbox: precisa motivação ≥50, legal_basis, applicable_rule e autorização explícita. Bloqueio legal não resolve sem exceção autorizada.</div>
        </div>
      </div>
    </section>
  );
}
