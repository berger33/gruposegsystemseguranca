"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, LogOut, ShieldCheck } from "lucide-react";
import AccountsSection from "./AccountsSection";
import GrantsSection from "./GrantsSection";
import ContractsSection from "./ContractsSection";
import DocumentsSection from "./DocumentsSection";
import TicketsSection from "./TicketsSection";
import { callApi, jsonInit, type AdminAccount } from "./admin-shared";
import styles from "./AdminClientes.module.css";

type AdminRole = "marcelo" | "ti";

const roleNames: Record<AdminRole, string> = { marcelo: "Marcelo · administração", ti: "TI · sistema" };

// Painel operacional da etapa 2: gestão dos cadastros centrais, vínculos (grants),
// contratos, documentos e chamados. Gate reutilizado do painel de pedidos (leads):
// token de ambiente, cookie HttpOnly curto e sessão administrativa distinta do portal do cliente.
export default function ClientAdminPage() {
  const [role, setRole] = useState<AdminRole | null>(null);
  const [token, setToken] = useState("");
  const [accounts, setAccounts] = useState<AdminAccount[] | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [gateError, setGateError] = useState("");

  const loadAccounts = useCallback(async () => {
    try {
      const data = await callApi("/api/admin/client-accounts");
      setAccounts((data.accounts as AdminAccount[]) ?? []);
    } catch {
      /* As seções exibem erro próprio quando necessário. */
    }
  }, []);

  const checkSession = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/session", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.ok && (data.role === "marcelo" || data.role === "ti")) {
        setRole(data.role);
        void loadAccounts();
      } else {
        setRole(null);
      }
    } catch {
      setRole(null);
    } finally {
      setChecking(false);
    }
  }, [loadAccounts]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setGateError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.error === "admin_auth_not_configured") {
          throw new Error("A autenticação administrativa ainda não está configurada no servidor.");
        }
        if (data.error === "too_many_attempts") throw new Error("Muitas tentativas. Aguarde antes de tentar novamente.");
        throw new Error("Chave administrativa inválida ou indisponível.");
      }
      setRole(data.role);
      setToken("");
      void loadAccounts();
    } catch (cause) {
      setGateError(cause instanceof Error ? cause.message : "Falha ao autenticar.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await callApi("/api/admin/session", jsonInit("DELETE", {}));
    } catch {
      /* Mesmo com falha, a sessão expira sozinha em 8 horas. */
    }
    setRole(null);
  }

  if (checking) {
    return (
      <main className={styles.page}>
        <div className={styles.loadingWrap}>
          <span className={styles.spinner} aria-hidden="true" />
          Verificando sessão administrativa…
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.topbar}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandMark}>SEG</span>
            <span>
              <small>Grupo</small>
              <strong>SEG System</strong>
            </span>
          </Link>
          <Link href="/" className={styles.ghostButton}>
            <ArrowLeft size={13} aria-hidden="true" />
            Voltar ao site
          </Link>
          {role ? (
            <>
              <span className={styles.roleChip}>
                <ShieldCheck size={13} aria-hidden="true" />
                {roleNames[role]}
              </span>
              <button type="button" className={styles.ghostButton} onClick={logout}>
                <LogOut size={13} aria-hidden="true" />
                Sair
              </button>
            </>
          ) : null}
        </header>

        {!role ? (
          <section className={styles.card} aria-labelledby="gate-title">
            <h1 id="gate-title">Administração de clientes</h1>
            <p className={styles.hint}>
              Use a chave administrativa (marcelo ou TI) configurada no ambiente. A sessão administrativa
              expira em 8 horas, usa cookie HttpOnly e é separada do portal do cliente.
            </p>
            <form className={styles.formGrid} onSubmit={login} noValidate>
              <div className={styles.field}>
                <label htmlFor="admin-token">Chave administrativa</label>
                <input
                  id="admin-token"
                  type="password"
                  minLength={32}
                  value={token}
                  onChange={event => setToken(event.target.value)}
                  placeholder="Chave marcelo ou TI do ambiente"
                  autoComplete="off"
                  required
                />
              </div>
              <button className={styles.submit} type="submit" disabled={busy || token.trim().length < 32}>
                {busy ? "Verificando…" : "Entrar"}
              </button>
            </form>
            {gateError ? (
              <p className={`${styles.message} ${styles.messageError}`} role="alert">
                {gateError}
              </p>
            ) : null}
          </section>
        ) : (
          <>
            <section className={styles.card} aria-labelledby="intro-title" style={{ paddingBottom: 14 }}>
              <h1 id="intro-title">Administração de clientes</h1>
              <p className={styles.hint}>
                Fluxo em ordem: <strong>1</strong> crie/verifique o cadastro central → <strong>2</strong> emita o
                vínculo com a identidade de acesso (com motivo) → <strong>3</strong> registre contratos →{" "}
                <strong>4</strong> publique documentos → <strong>5</strong> acompanhe os chamados. Cada operação
                relevante vai para a trilha de auditoria sem conter dados sensíveis.
              </p>
            </section>
            <AccountsSection accounts={accounts} reloadAccounts={loadAccounts} />
            <GrantsSection accounts={accounts} />
            <ContractsSection accounts={accounts} />
            <DocumentsSection accounts={accounts} />
            <TicketsSection accounts={accounts} />
          </>
        )}
      </div>
    </main>
  );
}
