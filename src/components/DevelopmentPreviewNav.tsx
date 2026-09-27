import Link from "next/link";
import styles from "./DevelopmentPreviewNav.module.css";

export default function DevelopmentPreviewNav() {
  if (process.env.NODE_ENV !== "development") return null;

  return (
    <nav className={styles.nav} aria-label="Atalhos das prévias administrativas">
      <span>PRÉVIAS · SOMENTE DESENVOLVIMENTO</span>
      <Link href="/admin/leads">Administração</Link>
      <Link href="/admin/portal">Configuração do portal</Link>
      <Link href="/admin/portal/permissoes">Permissões do portal</Link>
    </nav>
  );
}
