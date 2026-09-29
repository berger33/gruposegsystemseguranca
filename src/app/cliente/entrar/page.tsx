"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleAlert, KeyRound } from "lucide-react";
import RealAccessShell from "../RealAccessShell";
import styles from "../RealAccess.module.css";

// Login real do portal do cliente. Mensagem genérica em caso de erro para não
// confirmar se um e-mail tem conta (decisão do documento de acesso e segurança).
export default function ClientSignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (response.ok) {
        router.replace("/cliente/app");
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (response.status === 429) {
        setError("Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.");
      } else if (data.error === "database_not_configured" || data.error === "migration_required") {
        setError("A área de acesso está temporariamente indisponível. Tente novamente mais tarde.");
      } else if (data.error === "mfa_login_unavailable") {
        setError("Esta conta exige uma verificação adicional que ainda não está disponível. Fale com a equipe responsável; sua senha não foi rejeitada.");
      } else {
        setError("E-mail ou senha não conferem. Verifique os dados e tente novamente.");
      }
    } catch {
      setError("Não foi possível concluir o acesso agora. Verifique sua conexão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <RealAccessShell>
      <section className={styles.card} aria-labelledby="entrar-title">
        <span className={styles.badge}>
          <KeyRound size={12} aria-hidden="true" />
          Acesso real · Etapa 1
        </span>
        <h1 id="entrar-title">Entrar na área do cliente</h1>
        <p className={styles.lead}>
          Use o e-mail convidado pela equipe e a senha que você definiu no aceite do convite.
        </p>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.field}>
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </div>
          {error ? (
            <p className={`${styles.message} ${styles.messageError}`} role="alert">
              <CircleAlert size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{error}</span>
            </p>
          ) : null}
          <button className={styles.submit} type="submit" disabled={busy}>
            {busy ? "Verificando…" : "Entrar"}
          </button>
          <Link href="/cliente/redefinir-senha" className={styles.secondaryLink}>
            Esqueci minha senha
          </Link>
        </form>
        <p className={styles.note}>
          Após 5 tentativas sem sucesso, uma espera progressiva é aplicada para proteger sua conta.
        </p>
      </section>
    </RealAccessShell>
  );
}
