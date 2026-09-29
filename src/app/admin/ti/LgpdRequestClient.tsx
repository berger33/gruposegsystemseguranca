"use client";
import { useState } from "react";

export default function LgpdRequestClient() {
  const [requests, setRequests] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [detail, setDetail] = useState<any>(null);
  const [form, setForm] = useState({ request_type: "acesso", requester_name: "", requester_email: "", requester_document: "", description: "" });
  const [updateForm, setUpdateForm] = useState({ next_status: "em_verificacao", reason: "", responsible_name: "", verification_method: "email", is_identity_verified: false, legal_impediment: "", impediment_documented: false, response: "" });

  async function load() {
    setMsg("Carregando...");
    const r = await fetch('/api/admin/lgpd/requests');
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro: ${j.error}`); return; }
    setRequests(j.requests || []);
    setMsg(`Pedidos ${j.requests?.length || 0} — ${j.note}`);
  }

  async function loadDetail(id: string) {
    const r = await fetch(`/api/admin/lgpd/requests/${id}`);
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro detalhe: ${j.error}`); return; }
    setDetail(j);
    setMsg(`Detalhe ${id} status ${j.request?.status} verificado ${j.request?.is_identity_verified}`);
  }

  async function createPublic() {
    if (!form.requester_name.trim() || !form.requester_email.trim() || !form.description.trim()) { setMsg("nome email description obrigatórios"); return; }
    const r = await fetch('/api/lgpd/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro criar: ${j.error} ${j.detail || ''}`); return; }
    setMsg(`Pedido criado ${j.request?.id} prazo ${j.request?.due_date} — ${j.note}`);
    setForm({ request_type: "acesso", requester_name: "", requester_email: "", requester_document: "", description: "" });
    await load();
  }

  async function updateRequest() {
    if (!detail?.request?.id) { setMsg("Selecione um pedido"); return; }
    const r = await fetch(`/api/admin/lgpd/requests/${detail.request.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updateForm) });
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro update: ${j.error} ${j.detail || ''}`); return; }
    setMsg(`Atualizado ${j.request?.id} -> ${j.request?.status} — ${j.note}`);
    await loadDetail(detail.request.id);
    await load();
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700 }}>PLT-10 Pedidos LGPD — acesso/correção/eliminação com verificação identidade, responsável, prazo e impedimentos legais documentados</h3>
      <p style={{ fontSize: 12, color: '#6b7280' }}>Tipos: acesso/correcao/eliminacao/portabilidade/oposicao/revogacao_consentimento/informacao/outro. Status: recebido→em_verificacao→em_analise→aprovado→atendido (prazo 15 dias). Verificação identidade obrigatória antes aprovar/atender (email/documento/presencial/video/outro). Responsável atribuído, due_date 15 dias, legal_impediment + impediment_documented obrigatório para rejeitar por impedimento legal. Histórico status, audit, sem segredos (document hash).</p>
      {msg && <div style={{ background: '#f3f4f6', padding: 8, borderRadius: 8, fontSize: 11, marginTop: 8, whiteSpace: 'pre-wrap' }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button onClick={load} style={{ padding: '6px 12px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 12 }}>Carregar pedidos</button>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600 }}>Pedidos ({requests.length})</h4>
          <div style={{ maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            {requests.map((rq: any) => (
              <button key={rq.id} onClick={() => loadDetail(rq.id)} style={{ textAlign: 'left', padding: 6, borderRadius: 6, border: detail?.request?.id === rq.id ? '2px solid #2563eb' : '1px solid #e5e7eb', background: detail?.request?.id === rq.id ? '#eff6ff' : '#fff', fontSize: 11 }}>
                <div style={{ fontWeight: 600 }}>{rq.request_type} • {rq.status} • {rq.is_identity_verified ? 'verificado' : 'não verificado'} • prazo {rq.due_date?.slice(0,10)}</div>
                <div style={{ color: '#6b7280' }}>{rq.requester_name} {rq.requester_email} • resp {rq.responsible_name || '—'} • {new Date(rq.created_at).toLocaleDateString('pt-BR')}</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{rq.description.slice(0,120)}</div>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 12, padding: 8, border: '1px dashed #d1d5db', borderRadius: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Novo pedido (público, mesmo endpoint usado em /privacidade)</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <select value={form.request_type} onChange={e => setForm({ ...form, request_type: e.target.value })} style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }}>
                <option value="acesso">acesso</option><option value="correcao">correcao</option><option value="eliminacao">eliminacao</option><option value="portabilidade">portabilidade</option><option value="oposicao">oposicao</option><option value="revogacao_consentimento">revogacao_consentimento</option><option value="informacao">informacao</option><option value="outro">outro</option>
              </select>
            </div>
            <input value={form.requester_name} onChange={e => setForm({ ...form, requester_name: e.target.value })} placeholder="Nome solicitante" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
            <input value={form.requester_email} onChange={e => setForm({ ...form, requester_email: e.target.value })} placeholder="E-mail" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
            <input value={form.requester_document} onChange={e => setForm({ ...form, requester_document: e.target.value })} placeholder="Documento (será hasheado)" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descrição min 10" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11, minHeight: 60 }} />
            <button onClick={createPublic} style={{ marginTop: 6, padding: '4px 10px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 11 }}>Criar pedido público</button>
          </div>
        </div>

        <div style={{ flex: 1 }}>
          {!detail && <div style={{ fontSize: 12, color: '#6b7280' }}>Selecione um pedido para ver detalhes e atualizar.</div>}
          {detail && (
            <>
              <h4 style={{ fontSize: 13, fontWeight: 600 }}>Detalhe {detail.request?.id?.slice(0,8)} — {detail.request?.status}</h4>
              <div style={{ fontSize: 11, background: '#f9fafb', padding: 8, borderRadius: 6, marginTop: 6, whiteSpace: 'pre-wrap' }}>
                <div><strong>Tipo:</strong> {detail.request?.request_type} • <strong>Status:</strong> {detail.request?.status} • <strong>Verificado:</strong> {String(detail.request?.is_identity_verified)} {detail.request?.verified_by ? `por ${detail.request.verified_by}` : ''}</div>
                <div><strong>Solicitante:</strong> {detail.request?.requester_name} {detail.request?.requester_email} doc_hash {detail.request?.requester_document_hash?.slice(0,12) || '—'}</div>
                <div><strong>Descrição:</strong> {detail.request?.description}</div>
                <div><strong>Verificação:</strong> {detail.request?.verification_method || '—'} • <strong>Responsável:</strong> {detail.request?.responsible_name || '—'} {detail.request?.responsible_id?.slice(0,8) || ''} • <strong>Prazo:</strong> {detail.request?.due_date?.slice(0,10)}</div>
                <div><strong>Impedimento legal:</strong> {detail.request?.legal_impediment || '—'} doc {String(detail.request?.impediment_documented)}</div>
                <div><strong>Resposta:</strong> {detail.request?.response || '—'} {detail.request?.response_sent_at ? `enviada ${detail.request.response_sent_at.slice(0,10)}` : ''}</div>
              </div>
              <div style={{ marginTop: 8 }}>
                <h5 style={{ fontSize: 11, fontWeight: 600 }}>Histórico ({detail.history?.length || 0})</h5>
                <div style={{ maxHeight: 150, overflowY: 'auto', fontSize: 10, fontFamily: 'monospace' }}>
                  {(detail.history || []).map((h: any) => (<div key={h.id} style={{ padding: 2, borderBottom: '1px solid #f3f4f6' }}>{new Date(h.created_at).toLocaleString('pt-BR')} {h.previous_status || '—'} → {h.next_status} por {h.changed_by} {h.reason || ''}</div>))}
                </div>
              </div>

              <div style={{ marginTop: 10, padding: 8, border: '1px dashed #d1d5db', borderRadius: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>Atualizar pedido (admin/ti/rh)</div>
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  <select value={updateForm.next_status} onChange={e => setUpdateForm({ ...updateForm, next_status: e.target.value })} style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }}>
                    <option value="em_verificacao">em_verificacao</option><option value="em_analise">em_analise</option><option value="aguardando_titular">aguardando_titular</option><option value="aprovado">aprovado (exige verif identidade)</option><option value="atendido">atendido (exige verif)</option><option value="rejeitado">rejeitado (se impedimento, documentar)</option><option value="cancelado">cancelado</option><option value="expirado">expirado</option>
                  </select>
                  <select value={updateForm.verification_method} onChange={e => setUpdateForm({ ...updateForm, verification_method: e.target.value })} style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }}>
                    <option value="email">email</option><option value="documento">documento</option><option value="presencial">presencial</option><option value="video">video</option><option value="outro">outro</option>
                  </select>
                </div>
                <input value={updateForm.responsible_name} onChange={e => setUpdateForm({ ...updateForm, responsible_name: e.target.value })} placeholder="Responsável nome" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                <input value={updateForm.reason} onChange={e => setUpdateForm({ ...updateForm, reason: e.target.value })} placeholder="Motivo transição" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
                <textarea value={updateForm.legal_impediment} onChange={e => setUpdateForm({ ...updateForm, legal_impediment: e.target.value })} placeholder="Impedimento legal (se houver, documentar)" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11, minHeight: 40 }} />
                <textarea value={updateForm.response} onChange={e => setUpdateForm({ ...updateForm, response: e.target.value })} placeholder="Resposta ao titular" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11, minHeight: 50 }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <label style={{ fontSize: 11 }}><input type="checkbox" checked={updateForm.is_identity_verified} onChange={e => setUpdateForm({ ...updateForm, is_identity_verified: e.target.checked })} /> identidade verificada</label>
                  <label style={{ fontSize: 11 }}><input type="checkbox" checked={updateForm.impediment_documented} onChange={e => setUpdateForm({ ...updateForm, impediment_documented: e.target.checked })} /> impedimento documentado</label>
                </div>
                <button onClick={updateRequest} style={{ marginTop: 6, padding: '4px 10px', borderRadius: 6, background: '#92400e', color: '#fff', fontSize: 11 }}>Atualizar</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
