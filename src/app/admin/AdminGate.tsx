"use client";

// F01 — Gate compartilhado das páginas /admin: sessão staff centralizada,
// redireciono do anônimo ao login central com retorno ao destino, estado 403
// compreensível por papel e navegação por papel. NÃO é controle de
// autorização: toda API decide acesso no servidor (readSession/requireRole);
// aqui apenas resolvemos UI — quem não tem papel vê mensagem honesta em vez
// de estrutura quebrada.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, LogOut, ShieldCheck } from "lucide-react";
import { roleLabel } from "../../lib/admin-entry.mjs";
import styles from "./AdminChrome.module.css";

type AdminSession = { role: string; identityId: string | null; mfaVerified: boolean; expiresAt: string };

type GateState =
  | { kind: "checking" }
  | { kind: "error"; detail: string }
  | { kind: "forbidden"; session: AdminSession }
  | { kind: "ready"; session: AdminSession };

/** Módulos do menu por papel. Navegação apenas; autorização vive nas APIs. */
export const ADMIN_MODULES: ReadonlyArray<{ href: string; label: string; roles: readonly string[] }> = [
  { href: "/admin/marcelo", label: "Painel do Marcelo", roles: ["marcelo", "admin", "ti"] },
  { href: "/admin/funcionarios", label: "Funcionários e RH", roles: ["rh", "marcelo", "admin", "ti"] },
  { href: "/admin/crm", label: "CRM", roles: ["comercial", "marcelo", "admin", "ti"] },
  { href: "/admin/carteira", label: "Carteira", roles: ["comercial", "marcelo", "admin", "ti"] },
  { href: "/admin/leads", label: "Pedidos do site", roles: ["comercial", "marcelo", "admin", "ti"] },
  { href: "/admin/contratos", label: "Contratos", roles: ["marcelo", "admin", "comercial"] },
  { href: "/admin/financeiro", label: "Financeiro", roles: ["financeiro", "marcelo", "admin", "ti"] },
  { href: "/admin/operacao", label: "Operação", roles: ["supervisor", "marcelo", "admin", "ti"] },
  { href: "/admin/patrimonio", label: "Patrimônio", roles: ["supervisor", "marcelo", "admin", "ti"] },
  { href: "/admin/clientes", label: "Portal do cliente", roles: ["marcelo", "ti"] },
  { href: "/admin/compliance", label: "Compliance", roles: ["marcelo", "admin", "ti"] },
  { href: "/admin/frota", label: "Frota", roles: ["marcelo", "admin", "ti"] },
  { href: "/admin/terceiros", label: "Terceiros", roles: ["marcelo", "admin", "ti"] },
  { href: "/admin/licitacoes", label: "Licitações", roles: ["marcelo", "admin", "ti"] },
  { href: "/admin/fornecedores", label: "Fornecedores", roles: ["marcelo", "admin", "ti"] },
  { href: "/admin/qualidade", label: "Qualidade", roles: ["marcelo", "admin", "ti"] },
  { href: "/admin/satisfacao", label: "Satisfação", roles: ["marcelo", "admin", "ti"] },
  { href: "/admin/portal", label: "Acessos do portal", roles: ["ti", "admin"] },
  { href: "/admin/ti", label: "TI", roles: ["ti", "admin"] },
];

export function modulesForRole(role: string) {
  const key = String(role || "").toLowerCase();
  return ADMIN_MODULES.filter((mod) => mod.roles.includes(key));
}

function currentPathWithSearch(): string {
  if (typeof window === "undefined") return "/admin";
  return window.location.pathname + window.location.search;
}

export async function adminLogout(): Promise<void> {
  try {
    await fetch("/api/admin/session", { method: "DELETE", headers: { "content-type": "application/json" }, body: "{}" });
  } catch {
    /* Mesmo com falha de rede, a sessão expira sozinha; o servidor revoga quando alcançado. */
  }
  window.location.assign("/admin/entrar");
}

export function AdminChrome({ session, children }: { session: AdminSession; children: ReactNode }) {
  const pathname = usePathname();
  const nav = modulesForRole(session.role);
  return (
    <main className={styles.page}>
      <div className={styles.container} data-admin-chrome="true">
        <header className={styles.topbar}>
          <Link href="/admin" className={styles.brand}>
            <span className={styles.brandMark}>SEG</span>
            <span>
              <small>Grupo</small>
              <strong>SEG System</strong>
            </span>
          </Link>
          {nav.length ? (
            <nav className={styles.nav} aria-label="Módulos administrativos" data-admin-nav="true">
              {nav.map((mod) => (
                <Link
                  key={mod.href}
                  href={mod.href}
                  className={styles.navLink}
                  aria-current={pathname === mod.href ? "page" : undefined}
                >
                  {mod.label}
                </Link>
              ))}
            </nav>
          ) : null}
          <span className={styles.roleChip} data-role-chip={session.role}>
            <ShieldCheck size={13} aria-hidden="true" />
            {roleLabel(session.role)}
          </span>
          <button type="button" className={styles.ghostButton} onClick={() => void adminLogout()}>
            <LogOut size={13} aria-hidden="true" />
            Sair
          </button>
        </header>
        {children}
      </div>
    </main>
  );
}

export default function AdminGate({
  allowedRoles,
  children,
}: {
  /** Papéis com acesso à área. Vazio omitido = qualquer papel staff reconhecido. */
  allowedRoles?: readonly string[];
  children: ReactNode | ((session: AdminSession) => ReactNode);
}) {
  const [state, setState] = useState<GateState>({ kind: "checking" });

  const check = useCallback(async () => {
    setState({ kind: "checking" });
    let session: AdminSession | null = null;
    try {
      const response = await fetch("/api/admin/session", { cache: "no-store", headers: { accept: "application/json" } });
      if (response.status === 401) {
        // Anônimo: login central com retorno ao caminho atual (sanitizado do
        // lado de lá; aqui só transportamos pathname+search internos).
        const next = encodeURIComponent(currentPathWithSearch());
        window.location.replace(`/admin/entrar?next=${next}`);
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(String((data as { error?: string }).error || `http_${response.status}`));
      }
      session = (await response.json()) as AdminSession;
    } catch (cause) {
      setState({ kind: "error", detail: cause instanceof Error ? cause.message : "falha_desconhecida" });
      return;
    }
    const role = String(session.role || "").toLowerCase();
    if (allowedRoles && allowedRoles.length && !allowedRoles.includes(role)) {
      setState({ kind: "forbidden", session });
      return;
    }
    setState({ kind: "ready", session });
  }, [allowedRoles]);

  useEffect(() => {
    void check();
  }, [check]);

  if (state.kind === "checking") {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <p className={styles.center} data-admin-gate="checking">
            <span className={styles.spinner} aria-hidden="true" />
            Verificando sessão administrativa…
          </p>
        </div>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <section className={styles.card} data-admin-gate="error" style={{ marginTop: 24 }}>
            <h1>Não foi possível confirmar sua sessão</h1>
            <p className={styles.hint}>
              O serviço de autenticação não respondeu como esperado. Isso não concede acesso: tente novamente e, se o
              problema persistir, contate o TI. (Detalhe: {state.detail})
            </p>
            <div className={styles.backRow}>
              <button type="button" className={styles.submit} onClick={() => void check()}>
                Tentar novamente
              </button>
              <Link href="/" className={styles.ghostButton} style={{ color: "#0c3974", borderColor: "#b9cbdd" }}>
                <ArrowLeft size={13} aria-hidden="true" />
                Voltar ao site
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (state.kind === "forbidden") {
    return (
      <AdminChrome session={state.session}>
        <section className={styles.card} data-admin-gate="forbidden">
          <h1>Acesso restrito a esta área</h1>
          <p className={styles.hint}>
            Sua sessão está ativa como <strong>{roleLabel(state.session.role)}</strong>, mas este módulo exige outro
            papel de equipe. O servidor confirma a permissão em cada ação; nada foi carregado ou alterado. Use o menu
            acima para as áreas do seu papel ou fale com o TI se acredita que deveria ter acesso.
          </p>
          <div className={styles.backRow}>
            <Link href="/admin" className={styles.submit} style={{ textDecoration: "none" }}>
              Ir para o início administrativo
            </Link>
          </div>
        </section>
      </AdminChrome>
    );
  }

  const session = state.session;
  return (
    <AdminChrome session={session}>
      {typeof children === "function" ? children(session) : children}
    </AdminChrome>
  );
}
