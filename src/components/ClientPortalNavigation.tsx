"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, FileText, Headphones, LayoutDashboard, ShieldCheck } from "lucide-react";
import styles from "./ClientPortalNavigation.module.css";

const destinations = [
  { href: "/cliente/painel", label: "Visão geral", icon: LayoutDashboard },
  { href: "/cliente/contratos", label: "Contratos e serviços", icon: BriefcaseBusiness },
  { href: "/cliente/documentos", label: "Documentos", icon: FileText },
  { href: "/cliente/chamados", label: "Solicitações e chamados", icon: Headphones },
  { href: "/cliente/conta", label: "Conta e segurança", icon: ShieldCheck },
];

const accountPreviewPaths = new Set([
  "/cliente/acesso",
  "/cliente/alterar-email",
  "/cliente/recuperar-senha",
  "/cliente/seguranca",
]);

export default function ClientPortalNavigation() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Navegação das prévias do portal do cliente">
      <span className={styles.label}>PRÉVIA DO PORTAL</span>
      <div className={styles.links}>
        {destinations.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href === "/cliente/conta" && accountPreviewPaths.has(pathname));
          return (
            <Link key={href} href={href} className={`${styles.link} ${active ? styles.active : ""}`} aria-current={active ? "page" : undefined}>
              <Icon size={14} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
