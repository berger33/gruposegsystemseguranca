"use client";
import { portalRequest, type PortalErrorDescriptor } from "@/lib/portal-request";
import { portalErrorFootnote } from "@/lib/portal-vocabulary.mjs";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { useClientSpace } from "../ClientSpaceProvider";
import styles from "../../RealAccess.module.css";
import appStyles from "../ClientApp.module.css";

type Setup = { secret: string; uri: string };
type ClientSession = { id: string; created_at: string; last_seen_at: string | null; expires_at: string; current: boolean; active: boolean; user_agent: string | null };

// UX-PRO-09C (ID1): as chamadas desta página passavam por workspaceFetch, que
// LANÇA em qualquer não-2xx — todos os ramos `!ok`/`d.error` escritos abaixo
// eram código morto: senha recusada virava "erro de conexão", token inválido e
// revogação de sessão não produziam aviso algum (rejeição não tratada) e o
// código errado parecia indisponibilidade do MFA. portalRequest não lança:
// devolve {ok, status, error} com a falha classificada pelo vocabulário dos
// portais. Nenhum endpoint, payload, sessão, cookie, política ou auditoria
// mudou — só o texto que a pessoa lê, que agora corresponde ao que o servidor
// de fato respondeu.
function explain(error: PortalErrorDescriptor): string {
  return `${error.title} ${error.detail} ${portalErrorFootnote(error)}`;
}

export default function ClientMfaPage() {
  const { session, loading, notice: spaceNotice, reload } = useClientSpace();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<string | "others" | null>(null);
  const [sessions, setSessions] = useState<ClientSession[]>([]);
  const [email, setEmail] = useState("");
  const [emailToken, setEmailToken] = useState("");

  async function loadSessions() {
    const result = await portalRequest<{ sessions: ClientSession[] }>("/api/client/security/sessions", { cache: "no-store" });
    if (!result.ok || !Array.isArray(result.data?.sessions)) {
      throw new Error(result.ok ? "sessions_payload_invalid" : `sessions_failed_${result.status}`);
    }
    setSessions(result.data.sessions);
  }
  useEffect(() => { if (session) loadSessions().catch(() => setNotice("Não foi possível carregar as sessões. Tente novamente.")); }, [session]);

  async function post(path: string, body: object) {
    return portalRequest<{ secret?: unknown; uri?: unknown; recoveryCodes?: unknown }>(`/api/client/security/mfa/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  }
  async function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    const result = await post("setup", { password });
    if (result.ok && typeof result.data?.secret === "string" && typeof result.data?.uri === "string") {
      setSetup({ secret: result.data.secret, uri: result.data.uri }); setPassword("");
    } else if (!result.ok && result.error.code === "invalid_credentials") {
      setNotice("Não foi possível configurar. Confira a senha; se o MFA já estiver ativo, entre novamente para gerenciá-lo.");
    } else {
      setNotice(result.ok
        ? "Não foi possível configurar. Confira a senha; se o MFA já estiver ativo, entre novamente para gerenciá-lo."
        : `Não foi possível configurar. ${explain(result.error)}`);
    }
    setBusy(false);
  }
  async function activate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    const result = await post("activate", { code });
    if (result.ok && Array.isArray(result.data?.recoveryCodes)) {
      setSetup(null); setCode(""); setRecovery(result.data.recoveryCodes as string[]);
      // Texto verdadeiro medido nesta fatia: o servidor BLOQUEIA a sessão antiga
      // na ativação (readClientSession exige mfa_verified_at posterior a
      // activated_at; /api/auth/me → 401, provado no teste ID1g).
      setNotice("MFA ativado. Esta sessão antiga foi bloqueada; guarde os códigos e entre novamente.");
    } else if (!result.ok && result.error.code === "mfa_code_invalid") {
      setNotice("Código incorreto ou configuração indisponível. Confira seu autenticador.");
    } else {
      setNotice(result.ok
        ? "Código incorreto ou configuração indisponível. Confira seu autenticador."
        : `Não foi possível ativar o MFA. ${explain(result.error)}`);
    }
    setBusy(false);
  }
  async function disable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    const result = await post("disable", { password, code });
    if (result.ok) {
      setPassword(""); setCode("");
      router.replace("/cliente/entrar");
    } else if (!result.ok && result.error.code === "invalid_credentials") {
      setNotice("Não foi possível desativar. Confira sua senha e o código ainda não usado.");
    } else {
      setNotice(`Não foi possível desativar o MFA. ${explain(result.error)}`);
    }
    setBusy(false);
  }

  async function revokeSession(id: string) {
    if (revoking) return;
    setRevoking(id); setNotice("");
    try {
      const result = await portalRequest(`/api/client/security/sessions/${id}`, { method: "DELETE" });
      if (!result.ok) {
        setNotice(`Não foi possível revogar esta sessão. ${explain(result.error)}`);
        return;
      }
      await loadSessions();
      setNotice("Sessão revogada.");
    } catch {
      setNotice("Sessão revogada, mas não foi possível atualizar a lista. Use “Atualizar sessões”.");
    } finally { setRevoking(null); }
  }
  async function revokeOthers() {
    if (revoking) return;
    setRevoking("others"); setNotice("");
    try {
      const result = await portalRequest("/api/client/security/sessions", { method: "POST" });
      if (!result.ok) {
        setNotice(`Não foi possível revogar as demais sessões. ${explain(result.error)}`);
        return;
      }
      await loadSessions();
      setNotice("As demais sessões foram revogadas.");
    } catch {
      setNotice("As demais sessões foram revogadas, mas não foi possível atualizar a lista. Use “Atualizar sessões”.");
    } finally { setRevoking(null); }
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
        <button className={styles.submit} disabled={busy} type="submit">{busy ? "Preparando…" : "Preparar autenticador"}</button>
      </form>}
      {session.mfaEnabled && <form className={styles.form} onSubmit={disable}>
        <h2>Desativar MFA (se já estiver ativo)</h2>
        <p>Exige senha atual e código do autenticador ou de recuperação. Todas as sessões serão encerradas.</p>
        <label htmlFor="disable-password">Senha atual</label>
        <input id="disable-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        <label htmlFor="disable-code">Código</label>
        <input id="disable-code" autoComplete="one-time-code" required value={code} onChange={e => setCode(e.target.value)} />
        <button className={styles.submit} disabled={busy} type="submit">{busy ? "Desativando…" : "Desativar MFA e sair"}</button>
      </form>}
    </div>}
    <section aria-labelledby="sessions-title" style={{ marginTop: 28 }}>
      <h2 id="sessions-title">Sessões da conta</h2>
      <p>Somente sessões desta identidade. Tokens e hashes nunca são exibidos.</p>
      <button type="button" className={styles.submit} onClick={() => loadSessions().catch(() => setNotice("Não foi possível atualizar as sessões."))}>Atualizar sessões</button>
      <ul>{sessions.map(item => <li key={item.id}>{item.current ? "Sessão atual" : "Outra sessão"} · {new Date(item.created_at).toLocaleString("pt-BR")} · {item.active ? "ativa" : "revogada"} {!item.current && item.active && <button type="button" disabled={revoking === item.id} onClick={() => { void revokeSession(item.id); }}>{revoking === item.id ? "Revogando…" : "Revogar"}</button>}</li>)}</ul>
      <button type="button" disabled={revoking !== null} onClick={() => { void revokeOthers(); }}>{revoking === "others" ? "Revogando…" : "Revogar as demais sessões"}</button>
    </section>
    <section aria-labelledby="email-title" style={{ marginTop: 28 }}>
      <h2 id="email-title">Trocar e-mail</h2>
      <p>O novo endereço só será aplicado após a confirmação do token manual, válido por 24 horas. A resposta do servidor define o estado.</p>
      <form className={styles.form} onSubmit={async event => { event.preventDefault(); setBusy(true); const result = await portalRequest<{ requestId?: string; expiresAt?: string }>("/api/client/security/email-change", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newEmail: email }) }); if (result.ok) { setNotice(`Pedido ${result.data?.requestId} criado; confirme antes de ${new Date(String(result.data?.expiresAt)).toLocaleString("pt-BR")}.`); } else if (result.error.code === "email_change_pending") { setNotice("Já existe uma troca de e-mail em andamento. Aguarde a conclusão ou confirme o token atual."); } else if (result.error.code === "email_already_in_use") { setNotice("Este novo e-mail já pertence a outra conta. Nada foi solicitado."); } else if (result.error.code === "new_email_different_required") { setNotice("Informe um e-mail diferente do e-mail atual."); } else { setNotice(`Não foi possível solicitar a troca. ${explain(result.error)}`); } setBusy(false); }}>
        <label htmlFor="new-email">Novo e-mail</label><input id="new-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} /><button className={styles.submit} disabled={busy} type="submit">{busy ? "Solicitando…" : "Solicitar troca"}</button>
      </form>
      <form className={styles.form} onSubmit={async event => { event.preventDefault(); setBusy(true); const result = await portalRequest("/api/client/security/email-change", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: emailToken }) }); if (result.ok) { setNotice("E-mail confirmado. Entre novamente."); } else if (result.error.code === "invalid_or_expired_token") { setNotice("Token inválido ou expirado. Solicite a troca de e-mail novamente."); } else { setNotice(`Não foi possível confirmar a troca. ${explain(result.error)}`); } setBusy(false); }}>
        <label htmlFor="email-token">Token da URL manual</label><input id="email-token" required value={emailToken} onChange={e => setEmailToken(e.target.value)} /><button className={styles.submit} disabled={busy} type="submit">{busy ? "Confirmando…" : "Confirmar troca"}</button>
      </form>
    </section>
  </section>;
}
