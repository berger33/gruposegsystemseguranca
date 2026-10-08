"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import AdminThemeToggle from "../AdminThemeToggle";

type Pending = { id: string; email: string; display_name: string | null; status: string; created_at: string };
const frame = { maxWidth: 790, margin: "32px auto", padding: 24, fontFamily: "system-ui, sans-serif", lineHeight: 1.6 };
const field = { display: "block", width: "100%", padding: 10, margin: "6px 0 18px" };

export default function ManualVerificationPage() {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [selected, setSelected] = useState("");
  const [expectedEmail, setExpectedEmail] = useState("");
  const [method, setMethod] = useState("in_person");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch('/api/admin/client-verifications', { cache: 'no-store' });
    if (!response.ok) { setAuthorized(false); throw new Error('Acesso restrito ao TI com conta individual ativa.'); }
    const data = await response.json() as { pending: Pending[] };
    setPending(data.pending);
    setSelected(current => data.pending.some(item => item.id === current) ? current : '');
    setAuthorized(true);
  }
  useEffect(() => {
    load().catch(() => setMessage('Entre com uma conta individual de TI para revisar a fila.')).finally(() => setLoading(false));
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch('/api/admin/session', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: staffEmail, password: staffPassword }) });
      setStaffPassword("");
      if (!response.ok) throw new Error('Não foi possível autenticar a conta individual de TI.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão.'); }
    finally { setBusy(false); }
  }
  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/client-verifications/${selected}/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedEmail, method, reason, password }),
      });
      setPassword("");
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error === 'verification_not_pending'
          ? 'A conta ou o e-mail não confere, ou o pedido já foi encerrado. Atualize a fila.'
          : data.error === 'invalid_credentials' ? 'Senha de TI incorreta.'
          : data.error === 'temporarily_limited' ? 'Tentativas limitadas; aguarde antes de tentar novamente.'
          : 'Aprovação não realizada. Confira os dados e o acesso.');
      }
      setReason(''); setExpectedEmail(''); setSelected('');
      await load(); setMessage('Identidade aprovada manualmente e registrada. O e-mail NÃO foi confirmado.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão.'); }
    finally { setBusy(false); }
  }

  return <main style={frame} data-admin-theme-scope="true">
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
      <AdminThemeToggle />
    </div>
    <p><Link href="/admin/clientes">← Administração de clientes</Link></p>
    <h1>Verificação manual do cliente</h1>
    <p><strong>Somente TI com conta individual.</strong> Use apenas massa fictícia nesta etapa. Esta decisão não comprova posse do e-mail: antes de aprovar, confira a identidade por contato presencial ou retorno para contato previamente conhecido (nunca o número informado no pedido).</p>
    {message && <p role="status">{message}</p>}
    {loading ? <p>Verificando sessão…</p> : !authorized ? <form onSubmit={login}>
      <label htmlFor="ti-email">E-mail da conta individual de TI</label>
      <input id="ti-email" style={field} type="email" required value={staffEmail} onChange={e => setStaffEmail(e.target.value)} />
      <label htmlFor="ti-password">Senha de TI</label>
      <input id="ti-password" style={field} type="password" autoComplete="current-password" required value={staffPassword} onChange={e => setStaffPassword(e.target.value)} />
      <button type="submit" disabled={busy}>Entrar e consultar pendências</button>
    </form> : <>
      <p>Cadastros aguardando revisão: <strong>{pending.length}</strong>. Não vincule contratos/documentos reais até o gate de segurança e backup.</p>
      {pending.length === 0 ? <p>Nenhum convite aceito aguarda decisão.</p> : <form onSubmit={approve}>
        <label htmlFor="identity">Identidade criada após aceite de convite</label>
        <select id="identity" style={field} value={selected} required onChange={e => { setSelected(e.target.value); setExpectedEmail(''); }}>
          <option value="">Selecione um cadastro</option>
          {pending.map(item => <option key={item.id} value={item.id}>{item.display_name || 'Sem nome'} — {item.email} ({item.status})</option>)}
        </select>
        <label htmlFor="expected-email">Digite o e-mail exibido para confirmar o alvo (não valida a caixa)</label>
        <input id="expected-email" style={field} type="email" required value={expectedEmail} onChange={e => setExpectedEmail(e.target.value)} />
        <label htmlFor="method">Como a identidade foi conferida fora do sistema?</label>
        <select id="method" style={field} value={method} onChange={e => setMethod(e.target.value)}>
          <option value="in_person">Presencialmente</option>
          <option value="known_contact_callback">Retorno para contato já conhecido</option>
        </select>
        <label htmlFor="reason">Justificativa auditável, sem documentos ou informações sensíveis (30–500 caracteres)</label>
        <textarea id="reason" style={field} required minLength={30} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
        <label htmlFor="confirm-password">Confirme novamente sua senha individual de TI</label>
        <input id="confirm-password" style={field} type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        <button type="submit" disabled={busy || !selected}>{busy ? 'Registrando…' : 'Aprovar identidade manualmente'}</button>
      </form>}
    </>}
  </main>;
}
