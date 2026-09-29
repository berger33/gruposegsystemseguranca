"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, CircleAlert, MailCheck } from "lucide-react";
import RealAccessShell from "../RealAccessShell";
import styles from "../RealAccess.module.css";

// Consome o link de confirmação de e-mail (válido por 7 dias, uso único).
function ConfirmEmailInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [state, setState] = useState<"working" | "ok" | "failed">("working");

  useEffect(() => {
    let cancelled = false;
    async function confirm() {
      if (!token) {
        setState("failed");
        return;
      }
      try {
        const response = await fetch("/api/auth/confirm-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!cancelled) setState(response.ok ? "ok" : "failed");
      } catch {
        if (!cancelled) setState("failed");
      }
    }
    confirm();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <section className={styles.card} aria-labelledby="confirmar-title">
      <span className={styles.badge}>
        <MailCheck size={12} aria-hidden="true" />
        Confirmação de e-mail
      </span>
      <h1 id="confirmar-title">
        {state === "working" ? "Confirmando seu e-mail…" : state === "ok" ? "E-mail confirmado" : "Não foi possível confirmar"}
      </h1>
      {state === "working" ? (
        <div className={styles.loadingWrap}>
          <span className={styles.spinner} aria-hidden="true" />
          Validando o link de confirmação…
        </div>
      ) : state === "ok" ? (
        <>
          <p className={`${styles.message} ${styles.messageSuccess}`} role="status">
            <CheckCircle2 size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>Seu endereço de e-mail foi confirmado e sua conta está ativa.</span>
          </p>
          <div className={styles.actions}>
            <Link href="/cliente/entrar" className={styles.submit} style={{ textDecoration: "none" }}>
              Entrar na área do cliente
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className={`${styles.message} ${styles.messageError}`} role="alert">
            <CircleAlert size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Este link de confirmação não é mais válido (ele vale 7 dias, tem uso único e é
              substituído quando um novo é emitido). Você pode pedir um novo link.
            </span>
          </p>
          <ConfirmResendForm />
        </>
      )}
    </section>
  );
}

function ConfirmResendForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await fetch("/api/auth/confirm-email/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setSent(true);
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p className={`${styles.message} ${styles.messageInfo}`} role="status">
        <span>
          Se houver um cadastro aguardando confirmação, a equipe poderá orientar sobre o acesso. Um pedido de link não garante envio: sem SMTP configurado, nenhuma mensagem é entregue. Por segurança, não confirmamos se o e-mail existe.
        </span>
      </p>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.field}>
        <label htmlFor="resendEmail">Seu e-mail</label>
        <input
          id="resendEmail"
          name="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
        />
      </div>
      <button className={styles.submit} type="submit" disabled={busy}>
        {busy ? "Enviando…" : "Pedir novo link de confirmação"}
      </button>
    </form>
  );
}

export default function ClientConfirmEmailPage() {
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
        <ConfirmEmailInner />
      </Suspense>
    </RealAccessShell>
  );
}
