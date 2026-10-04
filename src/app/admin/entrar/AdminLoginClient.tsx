"use client";

// F01 — Login central do staff (entrada canônica de /admin). Conta individual
// é o padrão; a chave legada só aparece quando o servidor informa que está
// habilitada (GET /api/admin/session/options). Após o login, o destino vem de
// `next` sanitizado (somente caminhos internos de /admin) ou da home do papel.
// MFA: quando a conta exige, o segundo passo aparece aqui mesmo (desafio
// descartável do servidor; nenhum cookie é emitido antes da verificação).

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import {
  legacyLoginEnabled,
  loginErrorMessage,
  resolvePostLoginTarget,
  roleLabel,
} from "../../../lib/admin-entry.mjs";
import styles from "../AdminChrome.module.css";

type Options = { individual: boolean; legacyTokens: boolean };

async function postJson(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data: data as Record<string, unknown> };
}

export default function AdminLoginClient() {
  const params = useSearchParams();
  const next = params.get("next");

  const [checking, setChecking] = useState(true);
  const [options, setOptions] = useState<Options | null>(null);
  const [mode, setMode] = useState<"individual" | "legacy">("individual");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [mfa, setMfa] = useState<{ challenge: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const goToDestination = useCallback(
    (role: string) => {
      // Redireciono por navegação completa: cada página relê a sessão nova.
      window.location.assign(resolvePostLoginTarget({ role, next }));
    },
    [next],
  );

  // Sessão já ativa? Então a entrada resolve o destino direto.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/admin/session", { cache: "no-store", headers: { accept: "application/json" } });
        if (response.ok) {
          const data = (await response.json()) as { role?: string };
          if (!cancelled) goToDestination(String(data.role || ""));
          return;
        }
      } catch {
        /* Sem sessão: formulário abaixo. */
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    void legacyLoginEnabled; // pureza no cliente vem do endpoint; não decidimos local
    (async () => {
      try {
        const response = await fetch("/api/admin/session/options", { cache: "no-store", headers: { accept: "application/json" } });
        if (response.ok) {
          const data = (await response.json()) as Options;
          if (!cancelled) setOptions(data);
        }
      } catch {
        /* Sem opções: conta individual continua sendo o padrão. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [goToDestination]);

  async function submitIndividual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { status, data } = await postJson("/api/admin/session", { email, password });
      setPassword("");
      if (status === 202 && data?.mfaRequired && typeof data.challenge === "string") {
        // Nenhum cookie foi emitido: o desafio MFA é o próximo passo.
        setMfa({ challenge: data.challenge });
        return;
      }
      if (status !== 200) {
        setError(loginErrorMessage(String(data?.error || status), "individual"));
        return;
      }
      goToDestination(String(data.role || ""));
    } catch {
      setError("Não foi possível falar com o servidor. Verifique a conexão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mfa) return;
    setBusy(true);
    setError("");
    try {
      const { status, data } = await postJson("/api/admin/session/mfa", { challenge: mfa.challenge, code });
      setCode("");
      if (status !== 200) {
        if (status === 401) setMfa(null);
        setError(loginErrorMessage(String(data?.error || status), "individual"));
        return;
      }
      goToDestination(String(data.role || ""));
    } catch {
      setError("Não foi possível falar com o servidor. Verifique a conexão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function submitLegacy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { status, data } = await postJson("/api/admin/session", { token });
      setToken("");
      if (status !== 200) {
        setError(loginErrorMessage(String(data?.error || status), "legacy"));
        return;
      }
      goToDestination(String(data.role || ""));
    } catch {
      setError("Não foi possível falar com o servidor. Verifique a conexão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <p className={styles.center}>
            <span className={styles.spinner} aria-hidden="true" />
            Verificando sessão administrativa…
          </p>
        </div>
      </main>
    );
  }

  const legacyAvailable = Boolean(options?.legacyTokens);

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
          <nav className={styles.nav} aria-label="Outras entradas">
            <Link href="/cliente/entrar" className={styles.navLink}>
              Sou cliente
            </Link>
            <Link href="/funcionario" className={styles.navLink}>
              Sou funcionário
            </Link>
          </nav>
          <Link href="/" className={styles.ghostButton}>
            <ArrowLeft size={13} aria-hidden="true" />
            Voltar ao site
          </Link>
        </header>

        <section className={styles.card} aria-labelledby="login-title" data-admin-login="true">
          <h1 id="login-title">Entrada da equipe</h1>
          <p className={styles.hint}>
            Acesso individual de cada pessoa da equipe (Marcelo, Andreia e demais papéis). A sessão administrativa
            expira em 8 horas, usa cookie HttpOnly e é separada do portal do cliente e do portal do funcionário.
            {mfa ? (
              <>
                {" "}
                Sua conta tem verificação em duas etapas: informe o código do aplicativo autenticador ou um código de
                recuperação ainda não utilizado.
              </>
            ) : null}
          </p>

          {!mfa ? (
            <>
              <div className={styles.tabs} role="group" aria-label="Modo de entrada">
                <button type="button" className={styles.tab} aria-pressed={mode === "individual"} onClick={() => setMode("individual")}>
                  <ShieldCheck size={13} aria-hidden="true" style={{ verticalAlign: -2, marginRight: 6 }} />
                  Conta individual
                </button>
                <button
                  type="button"
                  className={styles.tab}
                  data-login-tab-legacy="true"
                  aria-pressed={mode === "legacy"}
                  disabled={!legacyAvailable}
                  title={legacyAvailable ? "Bootstrap da primeira instalação" : "Desativada neste ambiente"}
                  onClick={() => legacyAvailable && setMode("legacy")}
                >
                  Chave legada (bootstrap)
                </button>
              </div>

              {mode === "individual" ? (
                <form className={styles.formGrid} onSubmit={submitIndividual} noValidate>
                  <div className={styles.field}>
                    <label htmlFor="login-email">E-mail da conta individual</label>
                    <input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      autoComplete="username"
                    />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="login-password">Senha individual</label>
                    <input
                      id="login-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  <button className={styles.submit} type="submit" disabled={busy || !email || !password}>
                    {busy ? "Verificando…" : "Entrar"}
                  </button>
                </form>
              ) : (
                <form className={styles.formGrid} onSubmit={submitLegacy} noValidate>
                  <p className={styles.hint}>
                    Chave compartilhada apenas para o bootstrap da primeira instalação. Ela deixa de funcionar sozinha
                    assim que existir a primeira conta individual.
                  </p>
                  <div className={styles.field}>
                    <label htmlFor="login-token">Chave administrativa legada</label>
                    <input
                      id="login-token"
                      type="password"
                      minLength={32}
                      value={token}
                      onChange={(event) => setToken(event.target.value)}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <button className={styles.submit} type="submit" disabled={busy || token.trim().length < 32}>
                    {busy ? "Verificando…" : "Entrar"}
                  </button>
                </form>
              )}
              {!legacyAvailable ? (
                <p className={styles.hint} data-legacy-note="true">
                  Conta individual é o padrão. A chave legada está desativada neste ambiente; se você ainda não tem
                  conta, fale com o TI.
                </p>
              ) : null}
            </>
          ) : (
            <form className={styles.formGrid} onSubmit={submitMfa} noValidate>
              <div className={styles.field}>
                <label htmlFor="login-mfa">Código de verificação (6 dígitos) ou código de recuperação</label>
                <input
                  id="login-mfa"
                  type="text"
                  inputMode="numeric"
                  minLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  autoComplete="one-time-code"
                  required
                  autoFocus
                />
              </div>
              <button className={styles.submit} type="submit" disabled={busy || code.trim().length < 6}>
                {busy ? "Verificando…" : "Confirmar e entrar"}
              </button>
              <button type="button" className={styles.ghostButton} style={{ color: "#0c3974", borderColor: "#b9cbdd" }} onClick={() => { setMfa(null); setCode(""); setError(""); }}>
                Voltar para e-mail e senha
              </button>
            </form>
          )}

          {error ? (
            <p className={`${styles.message} ${styles.messageError}`} role="alert" data-login-error="true">
              {error}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
