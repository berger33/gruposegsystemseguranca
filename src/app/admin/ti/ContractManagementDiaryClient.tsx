"use client";
import { useState } from "react";

export default function ContractManagementDiaryClient() {
  const [contractId, setContractId] = useState("");
  const [entries, setEntries] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState("");
  const [form, setForm] = useState({ title: "", decision: "", category: "decisao", visibility: "restrito", process_ref: "", decision_date: "", responsible_name: "", tags: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!contractId.trim()) { setMsg("contract_id obrigatório"); return; }
    setMsg(""); setBusy(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (categoryFilter) params.set('category', categoryFilter);
      if (visibilityFilter) params.set('visibility', visibilityFilter);
      const r = await fetch(`/api/crm/contracts/${contractId.trim()}/management-diary?${params.toString()}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error + (j.detail ? ': ' + j.detail : ''));
      setEntries(j.diary || []);
      setMsg(`Total ${j.total} — ${j.note || ''}`);
    } catch (e: any) { setMsg(`Erro: ${e.message}`); } finally { setBusy(false); }
  }

  async function createEntry() {
    if (!contractId.trim()) { setMsg("contract_id obrigatório"); return; }
    if (!form.title.trim() || !form.decision.trim()) { setMsg("title e decision obrigatórios"); return; }
    if (form.decision.trim().length < 10) { setMsg("decision min 10"); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/crm/contracts/${contractId.trim()}/management-diary`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title, decision: form.decision, category: form.category, visibility: form.visibility,
          process_ref: form.process_ref || null, decision_date: form.decision_date || new Date().toISOString().slice(0,10),
          responsible_name: form.responsible_name || null, tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : []
        })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error + (j.detail ? ': ' + j.detail : ''));
      setForm({ title: "", decision: "", category: "decisao", visibility: "restrito", process_ref: "", decision_date: "", responsible_name: "", tags: "" });
      await load();
      setMsg(`Criado ${j.entry?.id} — ${j.note}`);
    } catch (e: any) { setMsg(`Erro criar: ${e.message}`); } finally { setBusy(false); }
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 16, background: '#fffbeb' }}>
      <h3 style={{ fontSize: 16, fontWeight: 700 }}>CON-11 Diário de Decisões de Gestão</h3>
      <p style={{ fontSize: 12, color: '#6b7280' }}>Acesso restrito admin/ti/rh. Vínculo contrato/processo, busca por título/decisão/tags. <strong>Não armazenar segredos ou prontuários em notas livres</strong> (bloqueio automático CON-11).</p>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input value={contractId} onChange={e => setContractId(e.target.value)} placeholder="contract_id UUID" style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />
        <button onClick={load} disabled={busy} style={{ padding: '6px 12px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 12 }}>Carregar</button>
      </div>
      {msg && <div style={{ background: '#f3f4f6', padding: 8, borderRadius: 8, fontSize: 11, marginTop: 8, whiteSpace: 'pre-wrap' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Busca título/decisão/tags/processo" style={{ flex: 1, minWidth: 180, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }}>
          <option value="">Todas categorias</option><option value="decisao">decisao</option><option value="risco">risco</option><option value="negociacao">negociacao</option><option value="comercial">comercial</option><option value="operacional">operacional</option><option value="financeiro">financeiro</option><option value="juridico">juridico</option><option value="outro">outro</option>
        </select>
        <select value={visibilityFilter} onChange={e => setVisibilityFilter(e.target.value)} style={{ padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }}>
          <option value="">Todas visibilidades</option><option value="restrito">restrito</option><option value="equipe_gestao">equipe_gestao</option><option value="diretoria">diretoria</option><option value="outro">outro</option>
        </select>
        <button onClick={load} style={{ padding: '6px 12px', borderRadius: 6, background: '#92400e', color: '#fff', fontSize: 12 }}>Buscar</button>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600 }}>Registros ({entries.length})</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto', marginTop: 6 }}>
            {entries.map((en: any) => (
              <div key={en.id} style={{ padding: 8, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 12, fontWeight: 600 }}>{en.title}</span><span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: en.visibility === 'restrito' ? '#fee2e2' : '#f3f4f6' }}>{en.visibility}</span></div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{en.category} • {en.decision_date?.slice(0,10)} • {en.process_ref || 'sem processo'} • {en.responsible_name || 'sem responsável'}</div>
                <div style={{ fontSize: 11, marginTop: 4, whiteSpace: 'pre-wrap' }}>{en.decision.slice(0, 400)}{en.decision.length > 400 ? '…' : ''}</div>
                {en.tags && en.tags.length > 0 && <div style={{ fontSize: 10, color: '#2563eb', marginTop: 4 }}>{en.tags.join(', ')}</div>}
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ padding: 10, border: '1px dashed #d1d5db', borderRadius: 8, background: '#fff' }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Novo registro (acesso restrito)</div>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Título (max 200)" style={{ width: '100%', marginTop: 6, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />
            <textarea value={form.decision} onChange={e => setForm({ ...form, decision: e.target.value })} placeholder="Decisão (min 10, max 5000) – NÃO incluir senha, CPF, prontuário" style={{ width: '100%', marginTop: 6, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, minHeight: 90 }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }}><option value="decisao">decisao</option><option value="risco">risco</option><option value="negociacao">negociacao</option><option value="comercial">comercial</option><option value="operacional">operacional</option><option value="financeiro">financeiro</option><option value="juridico">juridico</option><option value="outro">outro</option></select>
              <select value={form.visibility} onChange={e => setForm({ ...form, visibility: e.target.value })} style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }}><option value="restrito">restrito</option><option value="equipe_gestao">equipe_gestao</option><option value="diretoria">diretoria</option><option value="outro">outro</option></select>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input value={form.process_ref} onChange={e => setForm({ ...form, process_ref: e.target.value })} placeholder="Processo ref" style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />
              <input type="date" value={form.decision_date} onChange={e => setForm({ ...form, decision_date: e.target.value })} style={{ flex: 1, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />
            </div>
            <input value={form.responsible_name} onChange={e => setForm({ ...form, responsible_name: e.target.value })} placeholder="Responsável nome" style={{ width: '100%', marginTop: 6, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />
            <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="Tags separadas por vírgula" style={{ width: '100%', marginTop: 6, padding: 6, borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12 }} />
            <button onClick={createEntry} disabled={busy} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, background: '#92400e', color: '#fff', fontSize: 12, opacity: busy ? 0.6 : 1 }}>Registrar decisão</button>
          </div>
        </div>
      </div>
    </div>
  );
}
