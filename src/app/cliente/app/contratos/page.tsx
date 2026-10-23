"use client";
import {workspaceResponse,workspaceFetch} from "@/lib/workspace-response";

import { useCallback, useEffect, useRef, useState } from "react";
import { BriefcaseBusiness, RotateCw } from "lucide-react";
import { useClientSpace } from "../ClientSpaceProvider";
import styles from "../../RealAccess.module.css";
import appStyles from "../ClientApp.module.css";

type Contract = {
  id: string;
  title: string;
  service: string;
  summary: string | null;
  status: "planned" | "active" | "suspended" | "ended";
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
};

type ContractRead = { accountId: string; contracts: Contract[] };
type ContractReadError = { accountId: string; message: string };

const contractStatus: Record<Contract["status"], { text: string; chip: string }> = {
  planned: { text: "Planejado", chip: appStyles.chipPlanned },
  active: { text: "Ativo", chip: appStyles.chipActive },
  suspended: { text: "Suspenso", chip: appStyles.chipSuspended },
  ended: { text: "Encerrado", chip: appStyles.chipEnded },
};

function formatDateRange(contract: Contract) {
  if (!contract.starts_on && !contract.ends_on) return "Vigência a definir";
  const start = contract.starts_on
    ? new Date(`${contract.starts_on}T00:00:00`).toLocaleDateString("pt-BR")
    : "—";
  if (!contract.ends_on) return `Desde ${start}`;
  const end = new Date(`${contract.ends_on}T00:00:00`).toLocaleDateString("pt-BR");
  return `${start} a ${end}`;
}

export default function ClientContractsPage() {
  const { activeAccount, loading, notice, reload } = useClientSpace();
  const [read, setRead] = useState<ContractRead | null>(null);
  const [readError, setReadError] = useState<ContractReadError | null>(null);
  const [readLoading, setReadLoading] = useState(false);
  const latestRequest = useRef(0);

  const loadContracts = useCallback(async (accountId: string) => {
    const requestId = ++latestRequest.current;
    setReadLoading(true);
    setReadError(null);
    try {
      const response = await workspaceFetch(`/api/client/contracts?account=${encodeURIComponent(accountId)}`, { cache: "no-store" });
      if (!response.ok) await workspaceResponse(response);
      const data = (await workspaceResponse(response)) as { contracts: Contract[] };
      if (requestId !== latestRequest.current) return;
      setRead({ accountId, contracts: data.contracts });
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      setReadError({ accountId, message: error instanceof Error ? error.message : "Não foi possível carregar seus contratos agora." });
    } finally {
      if (requestId !== latestRequest.current) return;
      setReadLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeAccount || activeAccount.status !== "active") {
      latestRequest.current += 1;
      setRead(null);
      setReadError(null);
      setReadLoading(false);
      return;
    }
    void loadContracts(activeAccount.id);
  }, [activeAccount, loadContracts]);

  const currentRead = activeAccount?.id === read?.accountId ? read : null;
  const currentError = activeAccount?.id === readError?.accountId ? readError : null;

  if (loading) {
    return (
      <div className={appStyles.loadingWrapWide}>
        <span className={styles.spinner} aria-hidden="true" />
        Verificando sua sessão…
      </div>
    );
  }

  if (!activeAccount) {
    if (notice) {
      return (
        <section className={appStyles.sectionCard} aria-labelledby="contracts-title">
          <h2 id="contracts-title" className={appStyles.sectionTitle}>
            Contratos
          </h2>
          <p className={`${styles.message} ${styles.messageError}`} role="alert">
            <span>{notice}</span>
            <button className={appStyles.retryButton} type="button" onClick={() => reload()}>
              <RotateCw size={13} aria-hidden="true" />
              Tentar novamente
            </button>
          </p>
        </section>
      );
    }
    return (
      <div className={appStyles.emptyState}>
        Sua identidade ainda não foi vinculada a um cadastro de cliente. Assim que a equipe concluir a
        verificação cadastral, seus contratos aparecerão aqui.
      </div>
    );
  }

  return (
    <section className={appStyles.sectionCard} aria-labelledby="contracts-title" aria-busy={readLoading}>
      <span className={styles.badge}>
        <BriefcaseBusiness size={12} aria-hidden="true" />
        {activeAccount.display_name}
      </span>
      <h2 id="contracts-title" className={appStyles.sectionTitle}>
        Contratos
      </h2>
      <p className={appStyles.sectionHint}>
        Contratos registrados pela equipe para este cadastro. A lista é filtrada no servidor conforme
        o seu vínculo — sem nenhum identificador enviado de forma não verificada pelo navegador.
      </p>
      {activeAccount.scope_note ? <p className={appStyles.scopeNote}>Recorte do vínculo: {activeAccount.scope_note}</p> : null}
      {activeAccount.status !== "active" ? (
        <div className={appStyles.suspendedNote}>
          Cadastro {activeAccount.status === "suspended" ? "suspenso" : "encerrado"}. Os contratos não são
          exibidos enquanto a situação não é regularizada.
        </div>
      ) : currentError ? (
        <p className={`${styles.message} ${styles.messageError}`} role="alert">
          <span>{currentError.message}</span>
          <button
            className={appStyles.retryButton}
            type="button"
            onClick={() => activeAccount && loadContracts(activeAccount.id)}
          >
            <RotateCw size={13} aria-hidden="true" />
            Tentar novamente
          </button>
        </p>
      ) : readLoading || !currentRead ? (
        <div className={appStyles.loadingWrapWide} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          Carregando contratos…
        </div>
      ) : currentRead.contracts.length === 0 ? (
        <div className={appStyles.emptyState}>
          Nenhum contrato foi registrado ainda para este cadastro. Quando a equipe publicar os
          contratos, eles aparecerão aqui automaticamente.
        </div>
      ) : (
        <ul className={appStyles.list}>
          {currentRead.contracts.map(contract => {
            const status = contractStatus[contract.status];
            return (
              <li key={contract.id} className={appStyles.listItem}>
                <div className={appStyles.listItemMain}>
                  <p className={appStyles.listItemTitle}>{contract.title}</p>
                  <p className={appStyles.listItemMeta}>
                    {contract.service} · {formatDateRange(contract)}
                  </p>
                </div>
                <span className={`${appStyles.chip} ${status.chip}`}>{status.text}</span>
                {contract.summary ? <p className={appStyles.listItemDetail}>{contract.summary}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
