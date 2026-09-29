"use client";
import { useEffect, useState, type FormEvent } from "react";

export default function AccessPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [role, setRole] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/admin/session", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null).then(data => setRole(data?.role || "")).catch(() => {});
  }, []);
  async function login(event: FormEvent, method: "staff" | "token") {
    event.preventDefault();
    setMessage("");
    try {
      const res = await fetch("/api/admin/session", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(method === "staff" ? { email, password } : { token }) });
      if (!res.ok) throw new Error(`Acesso não concedido (HTTP ${res.status}). Confira os dados do terminal e a sessão atual.`);
      const data = await res.json();
      setRole(data.role);
      setPassword(""); setToken("");
      setMessage(`Sessão administrativa: ${data.role}. Links podem exigir um papel específico.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao autenticar."); }
  }
  async function logout() {
    try { await fetch("/api/admin/session", { method: "DELETE" }); } finally { setRole(""); setMessage("Sessão encerrada."); }
  }
  return (
    <section style={{ background: "#eef4f8", padding: 18, borderRadius: 8, margin: "20px 0" }}>
      <h2>Entrar como persona de teste</h2>
      <p>Os dados mudam a cada início e aparecem <strong>somente no terminal</strong> do runner. TI, RH e Admin usam e-mail/senha individual; Marcelo usa chave temporária do fluxo legado. Cliente A entra separadamente em <a href="/cliente/entrar">/cliente/entrar</a>. Não copie senhas para arquivos nem cole-as em relatórios.</p>
      {role && <p>Papel atual: <strong>{role}</strong> <button type="button" onClick={logout}>Sair / trocar papel</button></p>}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <form onSubmit={event => login(event, "staff")} style={{ display: "grid", gap: 8, minWidth: 250 }}>
          <strong>TI, RH ou Admin (e-mail/senha)</strong>
          <input aria-label="E-mail de teste" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="ti.qa@example.invalid" required />
          <input aria-label="Senha de teste" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Senha mostrada no terminal" required />
          <button type="submit">Entrar</button>
        </form>
        <form onSubmit={event => login(event, "token")} style={{ display: "grid", gap: 8, minWidth: 250 }}>
          <strong>Marcelo (chave legada só deste QA)</strong>
          <input aria-label="Chave de teste Marcelo" type="password" value={token} onChange={event => setToken(event.target.value)} placeholder="Chave mostrada no terminal" required minLength={32} />
          <button type="submit">Entrar como Marcelo</button>
        </form>
      </div>
      {message && <p role="status">{message}</p>}
      <p><small>Troque de papel clicando Sair. O navegador mantém cookies por origem; use sempre 127.0.0.1:3000, não alterne com localhost.</small></p>
    </section>
  );
}
