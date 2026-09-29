"use client";
import { useEffect, useState } from "react";

type Notif = {
  id: string;
  dedup_key: string | null;
  recipient_kind: string;
  recipient_id: string | null;
  recipient_email: string | null;
  channel: string;
  template: string;
  payload: any;
  status: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
};

export default function NotificationsClient() {
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ recipientKind: "lead", recipientEmail: "", channel: "email", template: "lead_received", payload: '{"leadId":"exemplo"}', dedupKey: "" });
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/notifications?limit=50", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setNotifications(data.notifications || []);
    } catch (e:any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function enqueue(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const payload = JSON.parse(form.payload || "{}");
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientKind: form.recipientKind,
          recipientEmail: form.recipientEmail || undefined,
          channel: form.channel,
          template: form.template,
          payload,
          dedupKey: form.dedupKey || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha enqueue");
      await load();
    } catch (e:any) {
      setError(e.message);
    }
  }

  async function retry(id: string) {
    try {
      const res = await fetch(`/api/admin/notifications/${id}/retry`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha retry");
      await load();
    } catch (e:any) {
      alert(e.message);
    }
  }

  async function process() {
    try {
      const res = await fetch("/api/admin/notifications/process", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha process");
      alert(`Processados: ${data.processed}`);
      await load();
    } catch (e:any) {
      alert(e.message);
    }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
      <h2 style={{ margin: 0 }}>Fila de notificações — PLT-04 (durável, deduplicação, tentativas, backoff, falha final, reprocessamento)</h2>
      <p style={{ fontSize: 13, opacity: 0.8 }}>Destinatário autorizado (client/staff/lead/system), canal (email/whatsapp/sms/push/webhook/internal), template, payload JSON, dedup_key único, status queued/sending/sent/failed/dead, attempts, next_attempt_at com backoff 1m/5m/15m/60m/240m, reprocessamento via retry. Sem envio fictício — falha quando provedor não configurado.</p>
      <form onSubmit={enqueue} style={{ display: "grid", gap: 8, marginTop: 12, gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        <label>recipientKind<select value={form.recipientKind} onChange={e=>setForm({...form, recipientKind: e.target.value})} style={{ width: "100%", padding: 6 }}><option value="lead">lead</option><option value="client">client</option><option value="staff">staff</option><option value="system">system</option><option value="marcelo">marcelo</option><option value="ti">ti</option></select></label>
        <label>recipientEmail<input value={form.recipientEmail} onChange={e=>setForm({...form, recipientEmail: e.target.value})} placeholder="ex: cliente@exemplo.com" style={{ width: "100%", padding: 6 }} /></label>
        <label>channel<select value={form.channel} onChange={e=>setForm({...form, channel: e.target.value})} style={{ width: "100%", padding: 6 }}><option value="email">email</option><option value="whatsapp">whatsapp</option><option value="internal">internal</option><option value="webhook">webhook</option></select></label>
        <label>template<input value={form.template} onChange={e=>setForm({...form, template: e.target.value})} style={{ width: "100%", padding: 6 }} /></label>
        <label>dedupKey (opcional)<input value={form.dedupKey} onChange={e=>setForm({...form, dedupKey: e.target.value})} placeholder="ex: lead-123-email" style={{ width: "100%", padding: 6 }} /></label>
        <label style={{ gridColumn: "1 / -1" }}>payload JSON<textarea value={form.payload} onChange={e=>setForm({...form, payload: e.target.value})} rows={3} style={{ width: "100%", padding: 6, fontFamily: "monospace" }} /></label>
        <button type="submit" style={{ padding: "8px 12px", background: "#0b5fff", color: "#fff", border: "none", borderRadius: 6 }}>Enfileirar (deduplicável)</button>
        <button type="button" onClick={process} style={{ padding: "8px 12px" }}>Processar fila (10)</button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <div style={{ maxHeight: 400, overflow: "auto", marginTop: 12, border: "1px solid #eee" }}>
        <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
          <thead><tr><th>Data</th><th>Destinatário</th><th>Canal</th><th>Template</th><th>Status</th><th>Tent</th><th>Próx tentativa</th><th>Ação</th></tr></thead>
          <tbody>
            {notifications.map(n=>(
              <tr key={n.id} style={{ borderTop: "1px solid #eee" }}>
                <td>{new Date(n.created_at).toLocaleString()}</td>
                <td>{n.recipient_kind}/{n.recipient_email || n.recipient_id?.slice(0,8) || "-"}</td>
                <td>{n.channel}</td>
                <td>{n.template}</td>
                <td>{n.status}{n.last_error ? ` (${n.last_error.slice(0,40)})` : ""}</td>
                <td>{n.attempts}/{n.max_attempts}</td>
                <td>{new Date(n.next_attempt_at).toLocaleString()}</td>
                <td>{(n.status==="failed"||n.status==="dead") && <button onClick={()=>retry(n.id)} style={{ fontSize: 11, padding: "2px 6px" }}>Retry</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {notifications.length===0 && <p style={{ padding: 12, fontSize: 13, opacity: 0.7 }}>Fila vazia. Enfileire uma notificação — sem envio real até provedor configurado (D-08).</p>}
      </div>
    </section>
  );
}
