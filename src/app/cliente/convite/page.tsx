"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CircleAlert, MailCheck } from "lucide-react";
import RealAccessShell from "../RealAccessShell";
import styles from "../RealAccess.module.css";

type InviteInspection =
  | { status: "pending"; email: string; expiresAt: number }
  | { status: "used" | "expired" | "revoked" | "not_found" };

const invalidInviteText: Record<string, string> = {
  used: "Este convite já foi utilizado. Se a conta é sua, entre com e-mail e senha.",
  expired: "Este convite expirou (validade de 7 dias). Peça um novo convite à equipe.",
  revoked: "Este convite foi revogado. Fale com a equipe do Grupo SEG System.",
  not_found: "Convite não encontrado. Confira se o link foi copiado por completo.",
};

// Aceite real de convite: cria a identidade do cliente (status pendente de e-mail),
// grava a senha com scrypt e dispara o link de confirmação de e-mail (7 dias).
function InviteAcceptInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [inspection, setInspection] = useState<InviteInspection | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ email: string; emailStatus: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function inspect() {
      if (!token) {
        setInspection({ status: "not_found" });
        return;
      }
      try {
        const response = await fetch(`/api/auth/invite/inspect?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const data = (await response.json()) as InviteInspection;
        if (!cancelled) setInspection(data?.status ? data : { status: "not_found" });
      } catch {
        if (!cancelled) setInspection({ status: "not_found" });
      }
    }
    inspect();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== passwordAgain) {
      setError("As senhas não coincidem. Confira os dois campos.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, displayName: displayName || undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 201) {
        setDone({ email: data.email, emailStatus: data.emailStatus });
        return;
      }
      const messages: Record<string, string> = {
        password_too_short: "A senha precisa ter pelo menos 12 caracteres.",
        password_common: "Essa senha é muito comum. Escolha uma frase-senha mais segura.",
        password_too_long: "A senha é longa demais.",
        identity_exists: "Já existe uma conta com este e-mail. Use a tela de entrada.",
        invite_used: invalidInviteText.used,
        invite_expired: invalidInviteText.expired,
        invite_revoked: invalidInviteText.revoked,
        invite_not_found: invalidInviteText.not_found,
      };
      setError(messages[data.error] || "Não foi possível concluir o aceite agora. Tente novamente mais tarde.");
    } catch {
      setError("Falha de conexão. Tente novamente em instantes.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className={styles.card} aria-labelledby="convite-done-title">
        <span className={styles.badge}>
          <MailCheck size={12} aria-hidden="true" />
          Convite aceito
        </span>
        <h1 id="convite-done-title">Cadastro inicial criado</h1>
        <p className={styles.lead}>
          Sua conta foi criada para <strong>{done.email}</strong>.{" "}
          {done.emailStatus === "sent"
            ? "Enviamos um link de confirmação para o seu e-mail (válido por 7 dias). Confirme o endereço para concluir a ativação."
            : "Não foi enviado e-mail neste ambiente. A equipe precisa conferir sua identidade manualmente antes de liberar o acesso; isso não confirma a posse do e-mail."}
        </p>
        <div className={styles.actions}>
          <Link href="/cliente/entrar" className={styles.submit} style={{ textDecoration: "none" }}>
            Ir para a entrada
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="convite-title">
      <span className={styles.badge}>Convite real · Uso único</span>
      <h1 id="convite-title">Aceitar convite</h1>
      {!inspection ? (
        <div className={styles.loadingWrap}>
          <span className={styles.spinner} aria-hidden="true" />
          Verificando o convite…
        </div>
      ) : inspection.status !== "pending" ? (
        <>
          <p className={`${styles.message} ${styles.messageError}`} role="alert">
            <CircleAlert size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{invalidInviteText[inspection.status]}</span>
          </p>
          <div className={styles.actions}>
            <Link href="/cliente/entrar" className={styles.secondaryLink}>
              Ir para a entrada
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className={styles.lead}>
            Convite válido para <strong>{inspection.email}</strong>. Defina sua senha para criar o acesso.
          </p>
          <form className={styles.form} onSubmit={submit}>
            <div className={styles.field}>
              <label htmlFor="displayName">Como devemos te chamar? (opcional)</label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                autoComplete="name"
                maxLength={120}
                value={displayName}
                onChange={event => setDisplayName(event.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="password">Senha</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={password}
                onChange={event => setPassword(event.target.value)}
              />
              <span className={styles.hint}>
                Mínimo de 12 caracteres. Frases-senha são bem-vindas; senhas muito comuns são recusadas.
              </span>
            </div>
            <div className={styles.field}>
              <label htmlFor="passwordAgain">Repita a senha</label>
              <input
                id="passwordAgain"
                name="passwordAgain"
                type="password"
                autoComplete="new-password"
                required
                value={passwordAgain}
                onChange={event => setPasswordAgain(event.target.value)}
              />
            </div>
            {error ? (
              <p className={`${styles.message} ${styles.messageError}`} role="alert">
                <CircleAlert size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{error}</span>
              </p>
            ) : null}
            <button className={styles.submit} type="submit" disabled={busy}>
              {busy ? "Criando acesso…" : "Criar meu acesso"}
            </button>
          </form>
        </>
      )}
    </section>
  );
}

export default function ClientInvitePage() {
  return (
    <RealAccessShell>
      <Suspense
        fallback={
          <section className={styles.card}>
            <div className={styles.loadingWrap}>
              <span className={styles.spinner} aria-hidden="true" />
              Carregando…
            </div>
          </section>
        }
      >
        <InviteAcceptInner />
      </Suspense>
    </RealAccessShell>
  );
}
