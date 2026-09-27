"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, LogOut, ShieldCheck } from "lucide-react";
import RealAccessShell from "../RealAccessShell";
import styles from "../RealAccess.module.css";

type SessionInfo = {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
  emailConfirmed: boolean;
  expiresAt: number;
};

// Primeira rota real protegida por sessão do portal do cliente.
// Sem sessão válida, /api/auth/me responde 401 e a pessoa é encaminhada ao login.
export default function ClientAppPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [state, setState] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        if (response.status === 401) {
          router.replace("/cliente/entrar");
          return;
        }
        if (!response.ok) throw new Error("unexpected");
        const data = (await response.json()) as SessionInfo;
        if (!cancelled) {
          setSession(data);
          setState("ready");
        }
      } catch {
        if (!cancelled) router.replace("/cliente/entrar");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/cliente/entrar");
    }
  }, [router]);

  return (
    <RealAccessShell>
      <section className={styles.card} aria-labelledby="app-title">
        <span className={styles.badge}>
          <ShieldCheck size={12} aria-hidden="true" />
          Área logada real · Etapa 1
        </span>
        <h1 id="app-title">Área do cliente</h1>
        {state === "loading" || !session ? (
          <div className={styles.loadingWrap}>
            <span className={styles.spinner} aria-hidden="true" />
            Verificando sua sessão…
          </div>
        ) : (
          <>
            <p className={styles.lead}>
              Sessão verificada no servidor. Esta é a base autenticada sobre a qual contratos,
              documentos e chamados reais serão ligados nas próximas etapas.
            </p>
            <ul className={styles.metaList}>
              <li>
                <span>E-mail da conta</span>
                <span>{session.email}</span>
              </li>
              {session.displayName ? (
                <li>
                  <span>Nome de exibição</span>
                  <span>{session.displayName}</span>
                </li>
              ) : null}
              <li>
                <span>Situação da conta</span>
                <span className={session.emailConfirmed ? styles.statusOk : styles.statusWarn}>
                  {session.emailConfirmed ? "E-mail confirmado" : "Aguardando confirmação de e-mail"}
                </span>
              </li>
              <li>
                <span>Sessão válida até</span>
                <span>{new Date(session.expiresAt).toLocaleString("pt-BR")}</span>
              </li>
            </ul>
            {!session.emailConfirmed ? (
              <p className={`${styles.message} ${styles.messageInfo}`} role="status">
                <CheckCircle2 size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  Enviamos um link de confirmação para o seu e-mail (válido por 7 dias). Se não
                  encontrar a mensagem, peça um novo reenvio na tela de redefinição ou fale com a equipe.
                </span>
              </p>
            ) : null}
            <div className={styles.actions}>
              <button className={styles.submit} type="button" onClick={logout}>
                <LogOut size={15} aria-hidden="true" />
                Sair da conta
              </button>
              <Link href="/cliente/painel" className={styles.secondaryLink}>
                Ver a prévia planejada do painel (demonstração)
              </Link>
            </div>
          </>
        )}
      </section>
    </RealAccessShell>
  );
}
