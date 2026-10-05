"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CircleAlert, KeyRound } from "lucide-react";
import RealAccessShell from "../RealAccessShell";
import styles from "../RealAccess.module.css";

// Dois modos em uma rota:
// - sem ?token: pedido de recuperação (resposta sempre genérica, sem revelar se a conta existe);
// - com ?token: definição da nova senha (link de uso único, válido por 1 hora).
function PasswordRecoveryInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  return token ? <ResetForm token={token} /> : <RequestForm />;
}

function RequestForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await fetch("/api/auth/recovery/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setSent(true);
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="recuperar-title">
      <span className={styles.badge}>
        <KeyRound size={12} aria-hidden="true" />
        Recuperação real
      </span>
      <h1 id="recuperar-title">Recuperar senha</h1>
      {sent ? (
        <>
          <p className={`${styles.message} ${styles.messageInfo}`} role="status">
            <span>
              Se existir uma conta elegível, a equipe de TI poderá validar o pedido por um canal conhecido.
              Nenhum e-mail foi enviado e, por segurança, não confirmamos se o endereço tem conta.
            </span>
          </p>
          <div className={styles.actions}>
            <Link href="/cliente/entrar" className={styles.secondaryLink}>
              Voltar para a entrada
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className={styles.lead}>Informe o e-mail da conta para abrir uma solicitação de validação manual. Este ambiente não usa SMTP.</p>
          <form className={styles.form} onSubmit={submit}>
            <div className={styles.field}>
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
              />
            </div>
            <button className={styles.submit} type="submit" disabled={busy}>
              {busy ? "Registrando…" : "Solicitar validação manual"}
            </button>
            <Link href="/cliente/entrar" className={styles.secondaryLink}>
              Voltar para a entrada
            </Link>
          </form>
        </>
      )}
    </section>
  );
}

function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== passwordAgain) {
      setError("As senhas não coincidem. Confira os dois campos.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setDone(true);
        return;
      }
      const messages: Record<string, string> = {
        password_too_short: "A senha precisa ter pelo menos 12 caracteres.",
        password_common: "Essa senha é muito comum. Escolha uma frase-senha mais segura.",
        reset_link_invalid: "Este link de redefinição não é mais válido. Ele vale 1 hora, tem uso único e é substituído quando um novo é emitido. Peça outro link.",
      };
      setError(messages[data.error] || "Não foi possível redefinir agora. Tente novamente mais tarde.");
    } catch {
      setError("Falha de conexão. Tente novamente em instantes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="redefinir-title">
      <span className={styles.badge}>
        <KeyRound size={12} aria-hidden="true" />
        Nova senha
      </span>
      <h1 id="redefinir-title">Definir nova senha</h1>
      {done ? (
        <>
          <p className={`${styles.message} ${styles.messageSuccess}`} role="status">
            <span>
              Senha redefinida. Por segurança, todas as sessões anteriores foram encerradas;
              entre novamente com a nova senha.
            </span>
          </p>
          <div className={styles.actions}>
            <Link href="/cliente/entrar" className={styles.submit} style={{ textDecoration: "none" }}>
              Ir para a entrada
            </Link>
          </div>
        </>
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.field}>
            <label htmlFor="newPassword">Nova senha</label>
            <input
              id="newPassword"
              name="newPassword"
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
            <label htmlFor="newPasswordAgain">Repita a nova senha</label>
            <input
              id="newPasswordAgain"
              name="newPasswordAgain"
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
            {busy ? "Redefinindo…" : "Redefinir senha"}
          </button>
        </form>
      )}
    </section>
  );
}

export default function ClientPasswordRecoveryPage() {
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
        <PasswordRecoveryInner />
      </Suspense>
    </RealAccessShell>
  );
}
