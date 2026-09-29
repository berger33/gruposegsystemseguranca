"use client";
import { useState } from "react";

export default function PrivacyClient() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ data_category: "identificacao", data_field: "", description: "", purpose: "", legal_basis: "consentimento", retention_days: "365", retention_description: "", recipients: "", is_sensitive: false, is_required: true, source: "" });
  const [pForm, setPForm] = useState({ title: "", content: "", contact_email: "contato@gruposegsystemseguranca.com.br", dpo_name: "Encarregado a definir (D-11)", dpo_contact: "contato@gruposegsystemseguranca.com.br", retention_summary: "", rights_description: "", recipients_description: "" });

  async function load() {
    setMsg("Carregando...");
    try {
      const r1 = await fetch('/api/admin/privacy/inventory');
      const j1 = await r1.json();
      if (!r1.ok) throw new Error(j1.error || 'inv_failed');
      setInventory(j1.inventory || []);
      const r2 = await fetch('/api/admin/privacy/policies');
      const j2 = await r2.json();
      if (!r2.ok) throw new Error(j2.error || 'pol_failed');
      setPolicies(j2.policies || []);
      setMsg(`Inventário ${j1.inventory?.length || 0} itens, políticas ${j2.policies?.length || 0} — ${j2.note}`);
    } catch (e: any) {
      setMsg(`Erro: ${e.message}`);
    }
  }

  async function saveInventory() {
    if (!form.data_field.trim() || !form.description.trim() || !form.purpose.trim()) { setMsg("data_field description purpose obrigatórios"); return; }
    const body = { ...form, recipients: form.recipients ? form.recipients.split(',').map(s => s.trim()).filter(Boolean) : [] };
    const r = await fetch('/api/admin/privacy/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro inv: ${j.error}`); return; }
    setMsg(`Inventário salvo ${j.item?.id}`);
    await load();
  }

  async function createPolicy() {
    if (!pForm.title.trim() || !pForm.content.trim()) { setMsg("title content obrigatórios"); return; }
    const r = await fetch('/api/admin/privacy/policies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pForm) });
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro policy: ${j.error}`); return; }
    setMsg(`Política criada v${j.policy?.version} rascunho — ${j.note}`);
    setPForm({ title: "", content: "", contact_email: "contato@gruposegsystemseguranca.com.br", dpo_name: "Encarregado a definir (D-11)", dpo_contact: "contato@gruposegsystemseguranca.com.br", retention_summary: "", rights_description: "", recipients_description: "" });
    await load();
  }

  async function updatePolicyStatus(id: string, status: string) {
    const body: any = { status };
    if (status === 'rejeitado') body.rejection_reason = 'Revisão competente pendente';
    const r = await fetch(`/api/admin/privacy/policies/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro status: ${j.error} ${j.detail || ''}`); return; }
    setMsg(`Política ${id} -> ${status} ${j.note || ''}`);
    await load();
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700 }}>PLT-09 Privacidade Completa — inventário dados/finalidades/bases/destinatários/prazos/contatos/direitos revisão competente antes publicar</h3>
      <p style={{ fontSize: 12, color: '#6b7280' }}>Inventário com categoria, campo, descrição, finalidade, base legal (consentimento/execução contrato/cumprimento legal/legítimo interesse etc), detalhe base, retenção dias + descrição, destinatários, sensível, obrigatório, fonte. Políticas com version, status rascunho/em_revisao/aprovado/publicado/arquivado/rejeitado, title, content 20000, inventory_snapshot, contato, DPO, retention_summary, rights, recipients, is_published, approved_by/at, noindex até publicado, aprovação admin.</p>
      {msg && <div style={{ background: '#f3f4f6', padding: 8, borderRadius: 8, fontSize: 11, marginTop: 8, whiteSpace: 'pre-wrap' }}>{msg}</div>}
      <button onClick={load} style={{ marginTop: 8, padding: '6px 12px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 12 }}>Carregar inventário e políticas</button>

      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600 }}>Inventário ({inventory.length})</h4>
          <div style={{ maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            {inventory.map((it: any) => (
              <div key={it.id} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 11, background: it.is_sensitive ? '#fef2f2' : '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontWeight: 600 }}>{it.data_category} • {it.data_field} {it.is_sensitive ? '(sensível)' : ''} {it.is_required ? '(obrigatório)' : ''}</span><span style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 8 }}>{it.legal_basis}</span></div>
                <div style={{ color: '#6b7280' }}>{it.description}</div>
                <div><strong>Finalidade:</strong> {it.purpose}</div>
                <div style={{ color: '#6b7280' }}>Base detalhe: {it.legal_basis_detail || '—'} • Ret {it.retention_days}d {it.retention_description || ''} • Dest {it.recipients?.join(', ') || '—'} • Fonte {it.source || '—'}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, padding: 8, border: '1px dashed #d1d5db', borderRadius: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Novo item inventário</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <select value={form.data_category} onChange={e => setForm({ ...form, data_category: e.target.value })} style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }}>
                <option value="identificacao">identificacao</option><option value="contato">contato</option><option value="localizacao">localizacao</option><option value="profissional">profissional</option><option value="financeiro">financeiro</option><option value="tecnico">tecnico</option><option value="comportamental">comportamental</option><option value="sensivel">sensivel</option><option value="outro">outro</option>
              </select>
              <select value={form.legal_basis} onChange={e => setForm({ ...form, legal_basis: e.target.value })} style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }}>
                <option value="consentimento">consentimento</option><option value="execucao_contrato">execucao_contrato</option><option value="cumprimento_legal">cumprimento_legal</option><option value="legitimo_interesse">legitimo_interesse</option><option value="protecao_vida">protecao_vida</option><option value="outro">outro</option>
              </select>
            </div>
            <input value={form.data_field} onChange={e => setForm({ ...form, data_field: e.target.value })} placeholder="data_field ex: nome" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="descrição" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
            <input value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} placeholder="finalidade" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <input value={form.retention_days} onChange={e => setForm({ ...form, retention_days: e.target.value })} placeholder="ret dias" type="number" style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
              <input value={form.recipients} onChange={e => setForm({ ...form, recipients: e.target.value })} placeholder="destinatários vírgula" style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
            </div>
            <input value={form.retention_description} onChange={e => setForm({ ...form, retention_description: e.target.value })} placeholder="ret descrição" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}><label style={{ fontSize: 11 }}><input type="checkbox" checked={form.is_sensitive} onChange={e => setForm({ ...form, is_sensitive: e.target.checked })} /> sensível</label><label style={{ fontSize: 11 }}><input type="checkbox" checked={form.is_required} onChange={e => setForm({ ...form, is_required: e.target.checked })} /> obrigatório</label></div>
            <button onClick={saveInventory} style={{ marginTop: 6, padding: '4px 10px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 11 }}>Salvar inventário</button>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600 }}>Políticas ({policies.length})</h4>
          <div style={{ maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {policies.map((p: any) => (
              <div key={p.id} style={{ padding: 8, border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 11, background: p.is_published ? '#dcfce7' : p.status === 'aprovado' ? '#dbeafe' : '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontWeight: 600 }}>v{p.version} • {p.status} {p.is_published ? 'PUBLICADO' : ''}</span><span>{new Date(p.created_at).toLocaleDateString('pt-BR')}</span></div>
                <div style={{ fontWeight: 600 }}>{p.title}</div>
                <div style={{ color: '#6b7280', whiteSpace: 'pre-wrap' }}>{p.content.slice(0,300)}{p.content.length>300?'…':''}</div>
                <div style={{ color: '#6b7280', marginTop: 4 }}>Contato {p.contact_email || '—'} • DPO {p.dpo_name || '—'} {p.dpo_contact || ''}</div>
                <div style={{ color: '#6b7280' }}>Retenção: {p.retention_summary?.slice(0,100) || '—'}</div>
                <div style={{ color: '#6b7280' }}>Direitos: {p.rights_description?.slice(0,100) || '—'}</div>
                <div style={{ color: '#6b7280' }}>Dest: {p.recipients_description?.slice(0,100) || '—'}</div>
                {p.approved_by && <div style={{ color: '#065f46' }}>Aprovado por {p.approved_by} em {p.approved_at?.slice(0,10)}</div>}
                {p.rejection_reason && <div style={{ color: '#991b1b' }}>Rejeitado: {p.rejection_reason}</div>}
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  {['em_revisao','aprovado','publicado','arquivado','rejeitado'].map(s => (<button key={s} onClick={() => updatePolicyStatus(p.id, s)} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid #d1d5db', background: p.status===s ? '#dbeafe' : '#fff' }}>{s}</button>))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, padding: 8, border: '1px dashed #d1d5db', borderRadius: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Nova política (revisão competente antes publicar)</div>
            <input value={pForm.title} onChange={e => setPForm({ ...pForm, title: e.target.value })} placeholder="Título" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
            <textarea value={pForm.content} onChange={e => setPForm({ ...pForm, content: e.target.value })} placeholder="Conteúdo completo 20000" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11, minHeight: 80 }} />
            <input value={pForm.contact_email} onChange={e => setPForm({ ...pForm, contact_email: e.target.value })} placeholder="contact_email" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <input value={pForm.dpo_name} onChange={e => setPForm({ ...pForm, dpo_name: e.target.value })} placeholder="DPO nome" style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
              <input value={pForm.dpo_contact} onChange={e => setPForm({ ...pForm, dpo_contact: e.target.value })} placeholder="DPO contato" style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
            </div>
            <textarea value={pForm.retention_summary} onChange={e => setPForm({ ...pForm, retention_summary: e.target.value })} placeholder="Resumo retenção" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11, minHeight: 40 }} />
            <textarea value={pForm.rights_description} onChange={e => setPForm({ ...pForm, rights_description: e.target.value })} placeholder="Descrição direitos titular" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11, minHeight: 40 }} />
            <textarea value={pForm.recipients_description} onChange={e => setPForm({ ...pForm, recipients_description: e.target.value })} placeholder="Descrição destinatários" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11, minHeight: 40 }} />
            <button onClick={createPolicy} style={{ marginTop: 6, padding: '4px 10px', borderRadius: 6, background: '#92400e', color: '#fff', fontSize: 11 }}>Criar política rascunho</button>
          </div>
        </div>
      </div>
    </div>
  );
}
