"use client";
import { useState } from "react";

export default function NotificationPreferencesClient() {
  const [prefs, setPrefs] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ recipient_kind: "staff", recipient_id: "", channel: "email", is_enabled: true });
  const [tForm, setTForm] = useState({ template_key: "", channel: "email", subject: "", body: "", status: "rascunho" });

  async function loadPrefs() {
    const r = await fetch('/api/crm/notification-preferences');
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro prefs: ${j.error}`); return; }
    setPrefs(j.preferences || []);
    setMsg(`Preferências ${j.preferences?.length || 0} — ${j.note}`);
  }

  async function loadTemplates() {
    const r = await fetch('/api/crm/notification-templates');
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro templates: ${j.error}`); return; }
    setTemplates(j.templates || []);
    setMsg(`Templates ${j.templates?.length || 0} — ${j.note}`);
  }

  async function savePref() {
    const r = await fetch('/api/crm/notification-preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro save pref: ${j.error} ${j.detail || ''}`); return; }
    setMsg(`Pref salva ${j.preference?.id}`);
    await loadPrefs();
  }

  async function createTemplate() {
    if (!tForm.template_key.trim() || !tForm.body.trim()) { setMsg("template_key e body obrigatórios"); return; }
    const r = await fetch('/api/crm/notification-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tForm) });
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro template: ${j.error} ${j.detail || ''}`); return; }
    setMsg(`Template criado ${j.template?.id} medical_safe=${j.template?.is_medical_safe}`);
    setTForm({ template_key: "", channel: "email", subject: "", body: "", status: "rascunho" });
    await loadTemplates();
  }

  async function updateTemplateStatus(id: string, status: string) {
    const body: any = { status };
    if (status === 'rejeitado') body.rejection_reason = 'Conteúdo não conforme PLT-05';
    const r = await fetch(`/api/crm/notification-templates/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { setMsg(`Erro status: ${j.error}`); return; }
    await loadTemplates();
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700 }}>PLT-05 Notificações — painel, e-mail, canais externos, preferências, templates</h3>
      <p style={{ fontSize: 12, color: '#6b7280' }}>Preferências por canal (painel/internal, e-mail, whatsapp, sms, push, webhook). Templates revisados: <strong>nenhuma informação médica em assunto/push</strong> (prontuário, diagnóstico, CID bloqueados).</p>
      {msg && <div style={{ background: '#f3f4f6', padding: 8, borderRadius: 8, fontSize: 11, marginTop: 8, whiteSpace: 'pre-wrap' }}>{msg}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={loadPrefs} style={{ padding: '6px 12px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 12 }}>Carregar preferências</button>
        <button onClick={loadTemplates} style={{ padding: '6px 12px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 12 }}>Carregar templates</button>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600 }}>Preferências ({prefs.length})</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto', marginTop: 6 }}>
            {prefs.map((p: any) => (
              <div key={p.id} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 11 }}>
                <div style={{ fontWeight: 600 }}>{p.recipient_kind} • {p.channel} • {p.is_enabled ? 'enabled' : 'disabled'}</div>
                <div style={{ color: '#6b7280' }}>email:{String(p.is_email_enabled)} push:{String(p.is_push_enabled)} wa:{String(p.is_whatsapp_enabled)} sms:{String(p.is_sms_enabled)} internal:{String(p.is_internal_enabled)} {p.quiet_hours_start ? `quiet ${p.quiet_hours_start}-${p.quiet_hours_end}` : ''}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, padding: 8, border: '1px dashed #d1d5db', borderRadius: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Nova/atualizar preferência</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              <select value={form.recipient_kind} onChange={e => setForm({ ...form, recipient_kind: e.target.value })} style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }}>
                <option value="staff">staff</option><option value="admin">admin</option><option value="ti">ti</option><option value="rh">rh</option><option value="client">client</option><option value="lead">lead</option>
              </select>
              <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })} style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }}>
                <option value="email">email</option><option value="internal">internal</option><option value="push">push</option><option value="whatsapp">whatsapp</option><option value="sms">sms</option><option value="webhook">webhook</option><option value="sistema">sistema</option>
              </select>
            </div>
            <input value={form.recipient_id} onChange={e => setForm({ ...form, recipient_id: e.target.value })} placeholder="recipient_id UUID opcional" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
            <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}><input type="checkbox" checked={form.is_enabled} onChange={e => setForm({ ...form, is_enabled: e.target.checked })} /> enabled</label>
            <button onClick={savePref} style={{ marginTop: 6, padding: '4px 10px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 11 }}>Salvar preferência</button>
          </div>
        </div>

        <div style={{ flex: 1.2 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600 }}>Templates ({templates.length})</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto', marginTop: 6 }}>
            {templates.map((t: any) => (
              <div key={t.id} style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 11, background: t.is_medical_safe ? '#fff' : '#fef2f2' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontWeight: 600 }}>{t.template_key} • {t.channel} • v{t.version}</span><span style={{ background: t.status === 'aprovado' ? '#dcfce7' : '#f3f4f6', padding: '1px 6px', borderRadius: 8 }}>{t.status}</span></div>
                <div style={{ color: '#6b7280' }}>subject: {t.subject || '—'} • safe:{String(t.is_medical_safe)}</div>
                <div style={{ marginTop: 2, whiteSpace: 'pre-wrap' }}>{t.body.slice(0, 200)}</div>
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  {['aprovado','em_revisao','arquivado','rejeitado'].map(s => (<button key={s} onClick={() => updateTemplateStatus(t.id, s)} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid #d1d5db' }}>{s}</button>))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, padding: 8, border: '1px dashed #d1d5db', borderRadius: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Novo template (PLT-05 sem info médica em assunto/push)</div>
            <input value={tForm.template_key} onChange={e => setTForm({ ...tForm, template_key: e.target.value })} placeholder="template_key ex: lead_new" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
            <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
              <select value={tForm.channel} onChange={e => setTForm({ ...tForm, channel: e.target.value })} style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }}>
                <option value="email">email</option><option value="internal">internal</option><option value="push">push</option><option value="whatsapp">whatsapp</option><option value="sms">sms</option><option value="sistema">sistema</option>
              </select>
              <select value={tForm.status} onChange={e => setTForm({ ...tForm, status: e.target.value })} style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }}>
                <option value="rascunho">rascunho</option><option value="em_revisao">em_revisao</option><option value="aprovado">aprovado</option>
              </select>
            </div>
            <input value={tForm.subject} onChange={e => setTForm({ ...tForm, subject: e.target.value })} placeholder="subject (max 200) — NÃO incluir prontuário/diagnóstico" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11 }} />
            <textarea value={tForm.body} onChange={e => setTForm({ ...tForm, body: e.target.value })} placeholder="body (max 5000) — sem info médica em push" style={{ width: '100%', marginTop: 4, padding: 4, borderRadius: 4, border: '1px solid #d1d5db', fontSize: 11, minHeight: 60 }} />
            <button onClick={createTemplate} style={{ marginTop: 6, padding: '4px 10px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 11 }}>Criar template</button>
          </div>
        </div>
      </div>
    </div>
  );
}
