"use client";

// F01 — Gate compartilhado das páginas /admin: sessão staff centralizada,
// redireciono do anônimo ao login central com retorno ao destino, estado 403
// compreensível por papel e navegação por papel. NÃO é controle de
// autorização: toda API decide acesso no servidor (readSession/requireRole);
// aqui apenas resolvemos UI — quem não tem papel vê mensagem honesta em vez
// de estrutura quebrada.

import BrandLogo from "@/components/BrandLogo";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, LogOut, Menu, Search, ShieldCheck, X } from "lucide-react";
import { roleLabel } from "../../lib/admin-entry.mjs";
import { groupAdminModules, searchAdminGroups } from "../../lib/admin-navigation.mjs";
import AdminThemeToggle from "./AdminThemeToggle";
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
  { href: "/admin/conhecimento", label: "Conhecimento", roles: ["marcelo", "admin", "ti"] },
  { href: "/admin/expansao", label: "Expansão", roles: ["comercial", "financeiro", "marcelo", "admin", "ti"] },
  { href: "/admin/analytics", label: "Analytics", roles: ["marcelo", "admin", "ti"] },
  { href: "/admin/aparencia", label: "Aparência do site", roles: ["admin", "marcelo", "ti"] },
  { href: "/admin/relatorios", label: "Relatórios periódicos", roles: ["admin", "ti"] },
  { href: "/admin/inteligencia", label: "Inteligência comercial", roles: ["admin", "ti"] },
  { href: "/admin/emergencial", label: "Apoio emergencial", roles: ["admin", "ti"] },
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
  const groups = groupAdminModules(nav);
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sideNavRef = useRef<HTMLElement>(null);
  const visibleGroups = searchAdminGroups(groups, search);
  const currentModule = nav.find((module) => pathname === module.href || pathname.startsWith(`${module.href}/`));
  const currentGroup = groups.find((group) => group.modules.some((module) => module.href === currentModule?.href));

  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    // The drawer transitions from visibility:hidden; focusing before it is
    // visible silently fails in Chromium.
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 230);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      } else if (event.key === "Tab" && window.matchMedia("(max-width: 900px)").matches) {
        const items = [...(sideNavRef.current?.querySelectorAll<HTMLElement>('button, a, input, summary') || [])]
          .filter((item) => item.getClientRects().length > 0 && (item.tagName === 'SUMMARY' || !item.closest('details:not([open])')));
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.clearTimeout(focusTimer); window.removeEventListener("keydown", onKeyDown); };
  }, [menuOpen]);

  return (
    <main className={styles.page} data-admin-theme-scope="true">
      <div className={`${styles.container} ${styles.adminContainer}`} data-admin-chrome="true">
        <header className={styles.topbar}>
          <Link href="/admin" className={styles.brand}>
            <BrandLogo size={48} alt=""/>
            <span>
              <small>Grupo</small>
              <strong>SEG System</strong>
            </span>
          </Link>
          {nav.length ? <button ref={menuButtonRef} type="button" className={styles.menuToggle} aria-controls="admin-module-nav" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
            {menuOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />} Menu
          </button> : null}
          <span className={styles.roleChip} data-role-chip={session.role}>
            <ShieldCheck size={13} aria-hidden="true" />
            {roleLabel(session.role)}
          </span>
          <AdminThemeToggle />
          <button type="button" className={styles.ghostButton} onClick={() => void adminLogout()}>
            <LogOut size={13} aria-hidden="true" />
            Sair
          </button>
        </header>
        {menuOpen ? <button type="button" className={styles.navBackdrop} aria-label="Fechar menu" onClick={() => { setMenuOpen(false); menuButtonRef.current?.focus(); }} /> : null}
        <div className={styles.workArea}>
          {nav.length ? (
            <nav ref={sideNavRef} id="admin-module-nav" className={`${styles.sideNav} ${menuOpen ? styles.sideNavOpen : ""}`} aria-label="Módulos administrativos" data-admin-nav="true">
              <div className={styles.drawerHeader}><strong>Áreas do sistema</strong><button type="button" onClick={() => { setMenuOpen(false); menuButtonRef.current?.focus(); }}>Fechar</button></div>
              <Link href="/admin" className={styles.homeLink} aria-current={pathname === "/admin" ? "page" : undefined} onClick={() => setMenuOpen(false)}>Início</Link>
              <label className={styles.moduleSearch}>
                <Search size={16} aria-hidden="true" />
                <span className={styles.visuallyHidden}>Buscar módulo</span>
                <input ref={searchRef} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar módulo" />
              </label>
              <div className={styles.sideGroups}>
                {visibleGroups.map((group) => (
                  <details key={group.id} className={styles.sideGroup} open={Boolean(search) || group.id === currentGroup?.id || groups.length === 1 ? true : undefined}>
                    <summary>{group.label}<span>{group.modules.length}</span></summary>
                    <div className={styles.sideLinks}>
                      {group.modules.map((mod) => (
                        <Link key={mod.href} href={mod.href} className={styles.sideLink} aria-current={pathname === mod.href || pathname.startsWith(`${mod.href}/`) ? "page" : undefined} onClick={() => setMenuOpen(false)}>{mod.label}</Link>
                      ))}
                    </div>
                  </details>
                ))}
                {visibleGroups.length === 0 ? <p className={styles.noResults}>Nenhum módulo do seu papel corresponde à busca.</p> : null}
              </div>
            </nav>
          ) : null}
          <div className={styles.mainContent}>
            <nav className={styles.breadcrumb} aria-label="Você está aqui">
              {pathname === "/admin" ? <span aria-current="page">Início</span> : <><Link href="/admin">Início</Link><span aria-hidden="true">/</span><span aria-current="page">{currentModule?.label || "Área administrativa"}</span></>}
            </nav>
            {children}
          </div>
        </div>
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
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch("/api/admin/session", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
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
      const timedOut = cause instanceof DOMException && cause.name === "AbortError";
      setState({
        kind: "error",
        detail: timedOut ? "tempo_limite_sessao" : cause instanceof Error ? cause.message : "falha_desconhecida",
      });
      return;
    } finally {
      window.clearTimeout(timeout);
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
      <main className={styles.page} data-admin-theme-scope="true">
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
      <main className={styles.page} data-admin-theme-scope="true">
        <div className={styles.container}>
          <section className={styles.card} data-admin-gate="error" style={{ marginTop: 24 }}>
            <h1>Não foi possível confirmar sua sessão</h1>
            <p className={styles.hint}>
            {state.detail === "tempo_limite_sessao"
              ? "A verificação de sessão demorou mais que o esperado. A página não concedeu acesso. Tente novamente; se o problema persistir, confira se o servidor local está ativo."
              : `O serviço de autenticação não respondeu como esperado. Isso não concede acesso: tente novamente e, se o problema persistir, contate o TI. (Detalhe: ${state.detail})`}
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
