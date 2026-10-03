"use client";

import type { ReactNode } from "react";
import { useClientSpace } from "./ClientSpaceProvider";
import ClientAppNavigation from "./ClientAppNavigation";
import styles from "../RealAccess.module.css";
import appStyles from "./ClientApp.module.css";

export default function ClientAppFrame({ children }: { children: ReactNode }) {
  const { session, loading, notice, reload } = useClientSpace();

  if (loading) {
    return (
      <div className={appStyles.wide}>
        <div className={appStyles.loadingWrapWide}>
          <span className={styles.spinner} aria-hidden="true" />
          Verificando sua sessão…
        </div>
      </div>
    );
  }

  if (notice) {
    return (
      <div className={appStyles.wide}>
        <div className={`${styles.message} ${styles.messageError}`} role="alert" data-testid="client-space-load-error">
          <span>{notice}</span>
          <button className={styles.submit} type="button" onClick={() => void reload()}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // A resposta 401 dispara o redirecionamento no provider. Não renderizamos um
  // estado vazio enquanto a navegação troca para a entrada.
  if (!session) {
    return (
      <div className={appStyles.wide}>
        <div className={appStyles.loadingWrapWide}>Redirecionando para a entrada…</div>
      </div>
    );
  }

  return (
    <div className={appStyles.wide}>
      <ClientAppNavigation />
      {children}
    </div>
  );
}
