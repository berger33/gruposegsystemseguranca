"use client";
import { useEffect, useState } from "react";

type Permission = {
  id: string;
  identity_id: string;
  email: string;
  kind: string;
  permission: string;
  scope_type: string;
  scope_id: string | null;
  reason: string;
  granted_by_role: string | null;
  created_at: string;
};

export default function RbacClient() {
  const [perms, setPerms] = useState<Permission[]>([]);
  const [known, setKnown] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ identityId: "", permission: "leads.read", scopeType: "global", scopeId: "", reason: "" });
  const [session, setSession] = useState<{ role: string; identityId?: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/session").then(r=>r.json()).then(d=>{
      if (d.role) setSession(d);
    }).catch(()=>{});
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/permissions");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "failed");
      setPerms(data.permissions || []);
      setKnown(data.knownPermissions || []);
    } catch (e:any) {
      setError(e.message || "erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/admin/permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identityId: form.identityId,
          permission: form.permission,
          scopeType: form.scopeType,
          scopeId: form.scopeId || null,
          reason: form.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha ao conceder");
      setForm({ identityId: "", permission: "leads.read", scopeType: "global", scopeId: "", reason: "" });
      await load();
    } catch (e:any) {
      setError(e.message);
    }
  }

  async function revoke(id: string) {
    const reason = prompt("Motivo da revogação (obrigatório, até 500 caracteres):");
    if (!reason) return;
    try {
      const res = await fetch(`/api/admin/permissions/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha ao revogar");
      await load();
    } catch (e:any) {
      setError(e.message);
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h2>Permissões granulares (domain.action + escopo)</h2>
      <p style={{ fontSize: 13, opacity: 0.8 }}>Sessão atual: {session ? `${session.role}${session.identityId ? ` (${session.identityId.slice(0,8)})` : " (token legado)"}` : "não autenticado — faça login via /api/admin/session"}</p>
      {error && <p style={{ color: "red" }}>{error}</p>}
      <form onSubmit={grant} style={{ display: "grid", gap: 8, maxWidth: 600, marginBottom: 24, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
        <label>Identity ID (UUID staff/client) *<br /><input value={form.identityId} onChange={e=>setForm({...form, identityId:e.target.value})} required style={{ width:"100%", padding:6 }} /></label>
        <label>Permissão *<br />
          <select value={form.permission} onChange={e=>setForm({...form, permission:e.target.value})} style={{ width:"100%", padding:6 }}>
            {known.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>Scope Type<br />
          <select value={form.scopeType} onChange={e=>setForm({...form, scopeType:e.target.value})} style={{ width:"100%", padding:6 }}>
            <option value="global">global</option>
            <option value="own">own</option>
            <option value="team">team</option>
            <option value="unit">unit</option>
            <option value="account">account</option>
            <option value="contract">contract</option>
            <option value="organization">organization</option>
          </select>
        </label>
        <label>Scope ID (UUID opcional)<br /><input value={form.scopeId} onChange={e=>setForm({...form, scopeId:e.target.value})} style={{ width:"100%", padding:6 }} /></label>
        <label>Motivo (1-500) *<br /><input value={form.reason} onChange={e=>setForm({...form, reason:e.target.value})} required maxLength={500} style={{ width:"100%", padding:6 }} /></label>
        <button type="submit" style={{ padding:"8px 12px", background:"#0b5fff", color:"#fff", border:"none", borderRadius:6 }}>Conceder permissão</button>
      </form>

      {loading ? <p>Carregando...</p> : (
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead><tr style={{ textAlign:"left", borderBottom:"1px solid #ccc" }}><th>Email</th><th>Permissão</th><th>Escopo</th><th>Motivo</th><th>Ação</th></tr></thead>
          <tbody>
            {perms.map(p=>(
              <tr key={p.id} style={{ borderBottom:"1px solid #eee" }}>
                <td>{p.email} ({p.kind})<br /><small>{p.identity_id.slice(0,8)}</small></td>
                <td>{p.permission}</td>
                <td>{p.scope_type}{p.scope_id ? `:${p.scope_id.slice(0,8)}` : ""}</td>
                <td>{p.reason}</td>
                <td><button onClick={()=>revoke(p.id)} style={{ padding:"4px 8px", border:"1px solid #c00", color:"#c00", background:"#fff", borderRadius:4 }}>Revogar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ fontSize:11, opacity:0.6, marginTop:12 }}>Toda concessão/revogação exige motivo obrigatório e é auditada em auth_access_audit (permission_grant/permission_revoke). Admin/ti têm bypass provisório até RBAC completo (F2). Negação por padrão em falha.</p>
    </div>
  );
}
