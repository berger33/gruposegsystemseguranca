"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./RealAccess.module.css";

// Estrutura visual das páginas REAIS de acesso do cliente (etapa 1).
// Diferente das rotas de prévia (/cliente/acesso, /cliente/painel...), estas telas
// conversam com a API /api/auth/* e com o PostgreSQL de verdade.
export default function RealAccessShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark}>SEG</span>
          <span>
            <small>Grupo</small>
            <strong>SEG System</strong>
          </span>
        </Link>
        <Link href="/cliente" className={styles.headerLink}>
          Sobre o portal
        </Link>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        Área de acesso real (etapa 1). As rotas marcadas como prévia continuam sendo demonstrações sem autenticação.
        Dúvidas sobre acesso: fale com a equipe do Grupo SEG System.
      </footer>
    </div>
  );
}
