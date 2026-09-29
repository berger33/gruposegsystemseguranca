"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { jsonInit } from "./admin-shared";
import styles from "./AdminClientes.module.css";

// Real invite endpoint, not the historical /admin/portal/convites mock.
export default function InvitesSection() {
  const [email, setEmail] = useState("");
  const [scopeNote, setScopeNote] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setInviteUrl(""); setStatus("");
    try {
      const response = await fetch('/api/admin/invites', jsonInit('POST', { email, scopeNote }));
      const result = await response.json().catch(() => ({})) as { error?: string; emailStatus?: string; inviteUrl?: string };
      if (!response.ok) throw new Error(result.error === 'identity_exists'
        ? 'A identidade já existe. Não emita um segundo convite para ela.'
        : result.error === 'demo_synthetic_address_required'
        ? 'Neste demo use somente endereços fictícios terminados em @example.invalid.'
        : 'Não foi possível emitir o convite.');
      setInviteUrl(result.inviteUrl || '');
      setStatus(result.emailStatus === 'sent' ? 'E-mail registrado como enviado. Confira a entrega pelo canal configurado.'
        : result.emailStatus === 'not_configured' ? 'SMTP desativado. Copie o link abaixo e entregue somente ao destinatário fictício deste ensaio.'
        : 'O envio falhou. Use o link abaixo somente após revisar o canal e o destinatário.');
      setEmail(''); setScopeNote('');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Falha de conexão.'); }
    finally { setBusy(false); }
  }
  return <section className={styles.card} aria-labelledby="invite-title">
    <h2 id="invite-title">Convite de acesso do cliente</h2>
    <p>Este é o fluxo real. Para o demo local use apenas endereço <code>example.invalid</code> fictício.
      Aceitar um convite não aprova a identidade nem concede acesso a empresas. A revisão manual é separada.</p>
    <form onSubmit={create}>
      <label htmlFor="invite-email">E-mail do cliente fictício</label><br />
      <input id="invite-email" type="email" required value={email} onChange={event => setEmail(event.target.value)} /><br />
      <label htmlFor="invite-scope">Nota opcional de escopo</label><br />
      <input id="invite-scope" maxLength={500} value={scopeNote} onChange={event => setScopeNote(event.target.value)} /><br />
      <button type="submit" disabled={busy}>{busy ? 'Emitindo…' : 'Emitir convite'}</button>
    </form>
    {status ? <p role="status">{status}</p> : null}
    {inviteUrl ? <p>Link temporário, de uso único; não inclua em capturas ou relatórios:<br />
      <a href={inviteUrl} target="_blank" rel="noopener noreferrer">Abrir convite em nova aba</a>
      <br /><input aria-label="Link do convite para copiar" readOnly value={inviteUrl} style={{ width: '100%' }} /></p> : null}
    <p>Após o aceite, <Link href="/admin/verificacao-manual">revise manualmente a identidade</Link>.
      Somente depois decida se deve emitir vínculo na seção abaixo.</p>
  </section>;
}
