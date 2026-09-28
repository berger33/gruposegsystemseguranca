"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

function ConviteInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [status, setStatus] = useState<any>(null);
  const [form, setForm] = useState({ displayName: "", password: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/auth/invite/inspect?token=${encodeURIComponent(token)}`)
      .then(r=>r.json())
      .then(setStatus)
      .catch(()=>setStatus({ status: "error" }));
  }, [token]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/auth/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, displayName: form.displayName, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "falha");
      setDone(true);
    } catch (e:any) {
      setError(e.message);
    }
  }

  if (!token) return <main style={{ padding:24 }}><p>Token não informado.</p></main>;
  if (!status) return <main style={{ padding:24 }}><p>Carregando convite...</p></main>;
  if (status.status !== "pending") return <main style={{ padding:24 }}><h1>Convite {status.status}</h1><p>Este convite não está mais válido.</p></main>;

  if (done) return <main style={{ padding:24 }}><h1>Conta criada</h1><p>Email: {status.email} — Kind: {status.kind} {status.role ? `(${status.role})` : ""}. Faça login em /admin com email e senha.</p></main>;

  return (
    <main style={{ padding:24, maxWidth:600, margin:"0 auto" }}>
      <h1>Aceitar convite administrativo</h1>
      <p>Email: {status.email} — Papel: {status.role || status.kind}</p>
      <form onSubmit={accept} style={{ display:"grid", gap:12, marginTop:16 }}>
        <label>Nome exibido<br /><input value={form.displayName} onChange={e=>setForm({...form, displayName:e.target.value})} maxLength={120} style={{ width:"100%", padding:8 }} /></label>
        <label>Senha (12+ caracteres, frase-senha aceita)<br /><input type="password" value={form.password} onChange={e=>setForm({...form, password:e.target.value})} required style={{ width:"100%", padding:8 }} /></label>
        {error && <p style={{ color:"red" }}>{error}</p>}
        <button type="submit" style={{ padding:"10px 16px", background:"#0b5fff", color:"#fff", border:"none", borderRadius:6 }}>Criar conta</button>
      </form>
    </main>
  );
}

export default function AdminConvitePage() {
  return (
    <Suspense fallback={<main style={{ padding:24 }}><p>Carregando...</p></main>}>
      <ConviteInner />
    </Suspense>
  );
}
