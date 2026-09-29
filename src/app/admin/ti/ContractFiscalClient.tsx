"use client";
import { useState } from "react";

export default function ContractFiscalClient() {
  const [contractId, setContractId] = useState("");
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [form, setForm] = useState({ title: "", description: "", period_start: "", period_end: "", responsible_name: "" });
  const [mForm, setMForm] = useState({ service_type: "", measurement_date: "", quantity: "1", quality_score: "", notes: "" });
  const [eForm, setEForm] = useState({ title: "", evidence_type: "foto", file_url: "", description: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!contractId.trim()) { setMsg("contract_id obrigatório"); return; }
    setLoading(true); setMsg("");
    try {
      const r = await fetch(`/api/crm/contracts/${contractId.trim()}/fiscal-dossiers`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'load_failed');
      setDossiers(j.dossiers || []);
      setMsg(`Dossiês: ${j.dossiers?.length || 0} — ${j.note || ''}`);
    } catch (e: any) { setMsg(`Erro: ${e.message}`); } finally { setLoading(false); }
  }

  async function loadDetail(dossierId: string) {
    try {
      const r = await fetch(`/api/crm/contracts/${contractId.trim()}/fiscal-dossiers/${dossierId}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'detail_failed');
      setDetail(j); setSelected(j.dossier);
      setMsg(`Dossiê ${j.dossier.title} — ${j.measurements?.length || 0} medições, ${j.evidences?.length || 0} evidências`);
    } catch (e: any) { setMsg(`Erro detalhe: ${e.message}`); }
  }

  async function createDossier() {
    if (!contractId.trim()) { setMsg("contract_id obrigatório"); return; }
    if (!form.title.trim()) { setMsg("title obrigatório"); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/crm/contracts/${contractId.trim()}/fiscal-dossiers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: form.title, description: form.description || null, period_start: form.period_start || null, period_end: form.period_end || null, responsible_name: form.responsible_name || null }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'create_failed');
      setForm({ title: "", description: "", period_start: "", period_end: "", responsible_name: "" });
      await load();
      setMsg(`Dossiê criado ${j.dossier?.id} — ${j.note}`);
    } catch (e: any) { setMsg(`Erro criar: ${e.message}`); } finally { setBusy(false); }
  }

  async function updateStatus(ns: string) {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/crm/contracts/${contractId.trim()}/fiscal-dossiers/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: ns }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'status_failed');
      await load(); await loadDetail(selected.id);
    } catch (e: any) { setMsg(`Erro status: ${e.message}`); } finally { setBusy(false); }
  }

  async function createMeasurement() {
    if (!selected) return;
    if (!mForm.service_type.trim() || !mForm.measurement_date) { setMsg("service_type e measurement_date obrigatórios"); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/crm/contracts/${contractId.trim()}/fiscal-dossiers/${selected.id}/measurements`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_type: mForm.service_type, measurement_date: mForm.measurement_date, quantity: parseFloat(mForm.quantity) || 1, quality_score: mForm.quality_score ? parseFloat(mForm.quality_score) : null, notes: mForm.notes || null }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'measurement_failed');
      setMForm({ service_type: "", measurement_date: "", quantity: "1", quality_score: "", notes: "" });
      await loadDetail(selected.id);
    } catch (e: any) { setMsg(`Erro medição: ${e.message}`); } finally { setBusy(false); }
  }

  async function updateMeasurementAcceptance(mId: string, acceptance: string) {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/crm/contracts/${contractId.trim()}/fiscal-dossiers/${selected.id}/measurements/${mId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acceptance_status: acceptance }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'acceptance_failed');
      await loadDetail(selected.id);
    } catch (e: any) { setMsg(`Erro aceite: ${e.message}`); } finally { setBusy(false); }
  }

  async function createEvidence() {
    if (!selected) return;
    if (!eForm.title.trim()) { setMsg("evidence title obrigatório"); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/crm/contracts/${contractId.trim()}/fiscal-dossiers/${selected.id}/evidences`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: eForm.title, evidence_type: eForm.evidence_type, file_url: eForm.file_url || null, description: eForm.description || null }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'evidence_failed');
      setEForm({ title: "", evidence_type: "foto", file_url: "", description: "" });
      await loadDetail(selected.id);
    } catch (e: any) { setMsg(`Erro evidência: ${e.message}`); } finally { setBusy(false); }
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700 }}>CON-10 Dossiê Fiscal do Contrato</h3>
      <p style={{ fontSize: 12, color: '#6b7280' }}>Dossiê por contrato com medições, aceite e evidências de qualidade. Não apaga lançamentos, histórico preservado. Status: rascunho → em_analise → aprovado → arquivado.</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input value={contractId} onChange={e => setContractId(e.target.value)} placeholder="contract_id UUID" style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />
        <button onClick={load} disabled={loading} style={{ padding: '6px 12px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 12 }}>Carregar</button>
      </div>
      {msg && <div style={{ background: '#f3f4f6', padding: 8, borderRadius: 8, fontSize: 11, marginTop: 8, whiteSpace: 'pre-wrap' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600 }}>Dossiês ({dossiers.length})</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto', marginTop: 6 }}>
            {dossiers.map(d => (
              <button key={d.id} onClick={() => loadDetail(d.id)} style={{ textAlign: 'left', padding: 8, borderRadius: 8, border: selected?.id === d.id ? '2px solid #2563eb' : '1px solid #e5e7eb', background: selected?.id === d.id ? '#eff6ff' : '#fff' }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{d.title}</div>
                <div style={{ fontSize: 10, color: '#6b7280' }}>{d.status} • {d.period_start || '?'}→{d.period_end || '?'} • {new Date(d.created_at).toLocaleDateString('pt-BR')}</div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 12, padding: 10, border: '1px dashed #d1d5db', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Novo dossiê</div>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Título (max 200)" style={{ width: '100%', marginTop: 6, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descrição (max 2000)" style={{ width: '100%', marginTop: 6, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, minHeight: 40 }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input type="date" value={form.period_start} onChange={e => setForm({ ...form, period_start: e.target.value })} style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />
              <input type="date" value={form.period_end} onChange={e => setForm({ ...form, period_end: e.target.value })} style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />
            </div>
            <input value={form.responsible_name} onChange={e => setForm({ ...form, responsible_name: e.target.value })} placeholder="Responsável" style={{ width: '100%', marginTop: 6, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />
            <button onClick={createDossier} disabled={busy} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 12, opacity: busy ? 0.6 : 1 }}>Criar dossiê</button>
          </div>
        </div>

        <div style={{ flex: 1.4 }}>
          {!selected && <div style={{ fontSize: 12, color: '#6b7280' }}>Selecione um dossiê.</div>}
          {selected && detail && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: 13, fontWeight: 600 }}>{selected.title}</h4>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#f3f4f6' }}>{selected.status}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {['rascunho','em_analise','aprovado','arquivado','cancelado'].map(s => (
                  <button key={s} onClick={() => updateStatus(s)} disabled={busy || selected.status === s} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 11, background: selected.status === s ? '#dbeafe' : '#fff' }}>{s}</button>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <h5 style={{ fontSize: 12, fontWeight: 600 }}>Medições ({detail.measurements?.length || 0})</h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
                  {(detail.measurements || []).map((m: any) => (
                    <div key={m.id} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 11 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontWeight: 600 }}>{m.service_type} • {m.measurement_date?.slice(0,10)} • qtd {m.quantity}</span><span style={{ background: m.acceptance_status === 'aprovado' ? '#dcfce7' : m.acceptance_status === 'rejeitado' ? '#fee2e2' : '#fef3c7', padding: '1px 6px', borderRadius: 8 }}>{m.acceptance_status}</span></div>
                      {m.quality_score != null && <div>Qualidade: {m.quality_score}</div>}
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>{['aprovado','rejeitado','em_ajuste','pendente'].map(st => (<button key={st} onClick={() => updateMeasurementAcceptance(m.id, st)} disabled={busy} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid #d1d5db' }}>{st}</button>))}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8, padding: 8, border: '1px dashed #d1d5db', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>Nova medição</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <input value={mForm.service_type} onChange={e => setMForm({ ...mForm, service_type: e.target.value })} placeholder="Tipo serviço" style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                    <input type="date" value={mForm.measurement_date} onChange={e => setMForm({ ...mForm, measurement_date: e.target.value })} style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <input value={mForm.quantity} onChange={e => setMForm({ ...mForm, quantity: e.target.value })} type="number" placeholder="Qtd" style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                    <input value={mForm.quality_score} onChange={e => setMForm({ ...mForm, quality_score: e.target.value })} type="number" placeholder="Score 0-100" style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                  </div>
                  <input value={mForm.notes} onChange={e => setMForm({ ...mForm, notes: e.target.value })} placeholder="Notas" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                  <button onClick={createMeasurement} disabled={busy} style={{ marginTop: 6, padding: '4px 10px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 11 }}>Adicionar</button>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <h5 style={{ fontSize: 12, fontWeight: 600 }}>Evidências ({detail.evidences?.length || 0})</h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, maxHeight: 140, overflowY: 'auto' }}>
                  {(detail.evidences || []).map((ev: any) => (<div key={ev.id} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 11 }}><div style={{ fontWeight: 600 }}>{ev.title} • {ev.evidence_type}</div>{ev.file_url && <a href={ev.file_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontSize: 10 }}>{ev.file_url.slice(0,60)}</a>}</div>))}
                </div>
                <div style={{ marginTop: 8, padding: 8, border: '1px dashed #d1d5db', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>Nova evidência</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <input value={eForm.title} onChange={e => setEForm({ ...eForm, title: e.target.value })} placeholder="Título" style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                    <select value={eForm.evidence_type} onChange={e => setEForm({ ...eForm, evidence_type: e.target.value })} style={{ padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }}><option value="foto">foto</option><option value="relatorio">relatorio</option><option value="indicador">indicador</option><option value="checklist">checklist</option><option value="outro">outro</option></select>
                  </div>
                  <input value={eForm.file_url} onChange={e => setEForm({ ...eForm, file_url: e.target.value })} placeholder="file_url" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                  <input value={eForm.description} onChange={e => setEForm({ ...eForm, description: e.target.value })} placeholder="Descrição" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                  <button onClick={createEvidence} disabled={busy} style={{ marginTop: 6, padding: '4px 10px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 11 }}>Adicionar evidência</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
