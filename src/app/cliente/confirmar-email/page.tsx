"use client";

import { Suspense, useEffect, useRef, useState } from "react";
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

// Pedido de novo link de confirmação. O endpoint responde 202 genérico
// (anti-enumeração) quando registra ou aceita o pedido, e 503 quando o serviço
// ou a auditoria obrigatória falham e NADA foi registrado. Por isso o sucesso só
// pode ser declarado com resposta 2xx: falha de serviço ou de rede mantém o
// formulário para nova tentativa, com foco no erro e sem revelar se o endereço
// existe, qual foi o status ou o código interno.
const RESEND_FAILURE_MESSAGE =
  "Não foi possível registrar o pedido de novo link. Tente novamente em instantes; por segurança, não confirmamos se o e-mail existe.";

function ConfirmResendForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/confirm-email/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        setError(RESEND_FAILURE_MESSAGE);
        return;
      }
      setSent(true);
    } catch {
      setError(RESEND_FAILURE_MESSAGE);
    } finally {
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
      {error ? (
        <p
          ref={errorRef}
          className={`${styles.message} ${styles.messageError}`}
          role="alert"
          tabIndex={-1}
        >
          <CircleAlert size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{error}</span>
        </p>
      ) : null}
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
