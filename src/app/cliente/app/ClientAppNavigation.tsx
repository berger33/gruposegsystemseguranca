"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, CalendarClock, ClipboardCheck, FileText, Headphones, LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import { useClientSpace } from "./ClientSpaceProvider";
import styles from "./ClientApp.module.css";

const destinations = [
  { href: "/cliente/app", label: "Visão geral", icon: LayoutDashboard },
  { href: "/cliente/app/contratos", label: "Contratos", icon: BriefcaseBusiness },
  { href: "/cliente/app/documentos", label: "Documentos", icon: FileText },
  { href: "/cliente/app/chamados", label: "Chamados", icon: Headphones },
  { href: "/cliente/app/agenda", label: "Agenda", icon: CalendarClock },
  { href: "/cliente/app/relatorios", label: "Relatórios", icon: ClipboardCheck },
  { href: "/cliente/app/seguranca", label: "Segurança", icon: ShieldCheck },
];

export default function ClientAppNavigation() {
  const pathname = usePathname();
  const { session, accounts, activeAccount, setAccountId, logout } = useClientSpace();

  return (
    <nav className={styles.nav} aria-label="Navegação da área do cliente">
      <div className={styles.tabs}>
        {destinations.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} className={`${styles.tab} ${active ? styles.tabActive : ""}`} aria-current={active ? "page" : undefined}>
              <Icon size={14} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </div>
      <div className={styles.navTools}>
        {accounts.length > 1 && activeAccount ? (
          <select
            className={styles.accountSelect}
            value={activeAccount.id}
            onChange={event => setAccountId(event.target.value)}
            aria-label="Conta de cliente selecionada"
          >
            {accounts.map(account => (
              <option key={account.id} value={account.id}>
                {account.display_name}
                {account.status !== "active" ? ` (${account.status === "suspended" ? "suspensa" : "encerrada"})` : ""}
              </option>
            ))}
          </select>
        ) : null}
        {accounts.length === 1 && activeAccount ? (
          <span className={styles.accountSelect} role="status">
            {activeAccount.display_name}
          </span>
        ) : null}
        {session ? (
          <button type="button" className={styles.logoutButton} onClick={logout}>
            <LogOut size={14} aria-hidden="true" />
            Sair
          </button>
        ) : null}
      </div>
    </nav>
  );
}
