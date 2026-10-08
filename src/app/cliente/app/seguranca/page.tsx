"use client";
import {workspaceFetch} from "@/lib/workspace-response";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { useClientSpace } from "../ClientSpaceProvider";
import styles from "../../RealAccess.module.css";
import appStyles from "../ClientApp.module.css";

type Setup = { secret: string; uri: string };
type ClientSession = { id: string; created_at: string; last_seen_at: string | null; expires_at: string; current: boolean; active: boolean; user_agent: string | null };

export default function ClientMfaPage() {
  const { session, loading, notice: spaceNotice, reload } = useClientSpace();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<ClientSession[]>([]);
  const [email, setEmail] = useState("");
  const [emailToken, setEmailToken] = useState("");

  async function loadSessions() {
    const response = await workspaceFetch("/api/client/security/sessions", { cache: "no-store" });
    if (!response.ok) throw new Error("sessions");
    setSessions((await response.json()).sessions as ClientSession[]);
  }
  useEffect(() => { if (session) loadSessions().catch(() => setNotice("Não foi possível carregar as sessões. Tente novamente.")); }, [session]);

  async function post(path: string, body: object) {
    const response = await workspaceFetch(`/api/client/security/mfa/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { ok: response.ok, status: response.status, data: await response.json() as Record<string, unknown> };
  }
  async function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const { ok, data } = await post("setup", { password });
      if (!ok || typeof data.secret !== "string" || typeof data.uri !== "string") {
        setNotice("Não foi possível configurar. Confira a senha; se o MFA já estiver ativo, entre novamente para gerenciá-lo."); return;
      }
      setSetup({ secret: data.secret, uri: data.uri }); setPassword("");
    } catch { setNotice("Erro de conexão ao iniciar o MFA."); }
    finally { setBusy(false); }
  }
  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const { ok, data } = await post("activate", { code });
      if (!ok || !Array.isArray(data.recoveryCodes)) {
        setNotice("Código incorreto ou configuração indisponível. Confira seu autenticador."); return;
      }
      setSetup(null); setCode(""); setRecovery(data.recoveryCodes as string[]);
      setNotice("MFA ativado. Esta sessão antiga foi bloqueada; guarde os códigos e entre novamente.");
    } catch { setNotice("Não foi possível ativar o MFA agora."); }
    finally { setBusy(false); }
  }
  async function disable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const { ok } = await post("disable", { password, code });
      if (!ok) { setNotice("Não foi possível desativar. Confira sua senha e o código ainda não usado."); return; }
      setPassword(""); setCode(""); router.replace("/cliente/entrar");
    } catch { setNotice("Não foi possível desativar o MFA agora."); }
    finally { setBusy(false); }
  }

  if (loading) {
    return (
      <div className={appStyles.loadingWrapWide}>
        <span className={styles.spinner} aria-hidden="true" />
        Verificando sua sessão…
      </div>
    );
  }

  if (!session) {
    if (spaceNotice) {
      return (
        <section className={appStyles.sectionCard} aria-labelledby="mfa-title">
          <h1 id="mfa-title" className={appStyles.sectionTitle}>
            Segurança da conta · aplicativo autenticador
          </h1>
          <p className={`${styles.message} ${styles.messageError}`} role="alert">
            <span>{spaceNotice}</span>
            <button className={appStyles.retryButton} type="button" onClick={() => reload()}>
              <RotateCw size={13} aria-hidden="true" />
              Tentar novamente
            </button>
          </p>
        </section>
      );
    }
    return <p role="status">Verificando sua sessão…</p>;
  }
  return <section className={appStyles.sectionCard} aria-labelledby="mfa-title">
    <h1 id="mfa-title" className={appStyles.sectionTitle}>Segurança da conta · aplicativo autenticador</h1>
    <p className={appStyles.sectionHint}>Use um aplicativo autenticador TOTP. Não há envio de e-mail ou SMS. Guarde os códigos de recuperação longe deste computador.</p>
    {notice && <p role="status" className={styles.message}>{notice}</p>}
    {recovery ? <div>
      <h2>Códigos de recuperação (mostrados uma única vez)</h2>
      <p>Copie e guarde em lugar seguro. Cada código só funciona uma vez.</p>
      <ul>{recovery.map(value => <li key={value}><code>{value}</code></li>)}</ul>
      <button type="button" className={styles.submit} onClick={() => { setRecovery(null); router.replace("/cliente/entrar"); }}>Já guardei · entrar novamente</button>
    </div> : setup ? <form className={styles.form} onSubmit={activate}>
      <p>Adicione uma conta no seu autenticador usando esta chave de configuração privada:</p>
      <code style={{ wordBreak: "break-all" }}>{setup.secret}</code>
      <p>Depois informe o código atual de seis dígitos. Não compartilhe a chave nem capture esta tela.</p>
      <label htmlFor="mfa-activate-code">Código do aplicativo</label>
      <input id="mfa-activate-code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" value={code} onChange={e => setCode(e.target.value)} />
      <button className={styles.submit} disabled={busy} type="submit">{busy ? "Verificando…" : "Ativar MFA"}</button>
    </form> : <div>
      {!session.mfaEnabled && <form className={styles.form} onSubmit={begin}>
        <h2>Configurar MFA</h2><label htmlFor="setup-password">Confirme sua senha</label>
        <input id="setup-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        <button className={styles.submit} disabled={busy} type="submit">Preparar autenticador</button>
      </form>}
      {session.mfaEnabled && <form className={styles.form} onSubmit={disable}>
        <h2>Desativar MFA (se já estiver ativo)</h2>
        <p>Exige senha atual e código do autenticador ou de recuperação. Todas as sessões serão encerradas.</p>
        <label htmlFor="disable-password">Senha atual</label>
        <input id="disable-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        <label htmlFor="disable-code">Código</label>
        <input id="disable-code" autoComplete="one-time-code" required value={code} onChange={e => setCode(e.target.value)} />
        <button className={styles.submit} disabled={busy} type="submit">Desativar MFA e sair</button>
      </form>}
    </div>}
    <section aria-labelledby="sessions-title" style={{ marginTop: 28 }}>
      <h2 id="sessions-title">Sessões da conta</h2>
      <p>Somente sessões desta identidade. Tokens e hashes nunca são exibidos.</p>
      <button type="button" className={styles.submit} onClick={() => loadSessions().catch(() => setNotice("Não foi possível atualizar as sessões."))}>Atualizar sessões</button>
      <ul>{sessions.map(item => <li key={item.id}>{item.current ? "Sessão atual" : "Outra sessão"} · {new Date(item.created_at).toLocaleString("pt-BR")} · {item.active ? "ativa" : "revogada"} {!item.current && item.active && <button type="button" onClick={async () => { await workspaceFetch(`/api/client/security/sessions/${item.id}`, { method: "DELETE" }); await loadSessions(); }}>Revogar</button>}</li>)}</ul>
      <button type="button" onClick={async () => { await workspaceFetch("/api/client/security/sessions", { method: "POST" }); await loadSessions(); }}>Revogar as demais sessões</button>
    </section>
    <section aria-labelledby="email-title" style={{ marginTop: 28 }}>
      <h2 id="email-title">Trocar e-mail</h2>
      <p>O novo endereço só será aplicado após a confirmação do token manual, válido por 24 horas. A resposta do servidor define o estado.</p>
      <form className={styles.form} onSubmit={async event => { event.preventDefault(); setBusy(true); try { const r = await workspaceFetch("/api/client/security/email-change", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newEmail: email }) }); const d = await r.json(); setNotice(r.ok ? `Pedido ${d.requestId} criado; confirme antes de ${new Date(d.expiresAt).toLocaleString("pt-BR")}.` : (d.error || "Não foi possível solicitar.")); } catch { setNotice("Erro de conexão."); } finally { setBusy(false); } }}>
        <label htmlFor="new-email">Novo e-mail</label><input id="new-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} /><button className={styles.submit} disabled={busy} type="submit">Solicitar troca</button>
      </form>
      <form className={styles.form} onSubmit={async event => { event.preventDefault(); const r = await workspaceFetch("/api/client/security/email-change", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: emailToken }) }); const d = await r.json(); setNotice(r.ok ? "E-mail confirmado. Entre novamente." : (d.error || "Token inválido ou expirado.")); }}>
        <label htmlFor="email-token">Token da URL manual</label><input id="email-token" required value={emailToken} onChange={e => setEmailToken(e.target.value)} /><button className={styles.submit} type="submit">Confirmar troca</button>
      </form>
    </section>
  </section>;
}
