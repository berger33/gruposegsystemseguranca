"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useClientSpace } from "./ClientSpaceProvider";
import styles from "../RealAccess.module.css";
import appStyles from "./ClientApp.module.css";

type AccountStatus = "active" | "suspended" | "closed";

const accountStatusLabel: Record<AccountStatus, { text: string; chip: string }> = {
  active: { text: "Ativa", chip: appStyles.chipActive },
  suspended: { text: "Suspensa", chip: appStyles.chipSuspended },
  closed: { text: "Encerrada", chip: appStyles.chipEnded },
};

type SpaceStats = { contractsTotal: number; contractsActive: number; ticketsOpen: number };

// Visão geral da área real do cliente: identidade confirmada no servidor,
// vínculos cadastrais e um resumo dos dados protegidos da conta selecionada.
export default function ClientAppPage() {
  const { session, accounts, activeAccount, loading, notice } = useClientSpace();
  const [stats, setStats] = useState<SpaceStats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);

  useEffect(() => {
    if (!activeAccount || activeAccount.status !== "active") {
      setStats(null);
      return;
    }
    const scoped = `account=${encodeURIComponent(activeAccount.id)}`;
    setStatsFailed(false);
    let cancelled = false;
    Promise.all([
      fetch(`/api/client/contracts?${scoped}`, { cache: "no-store" }),
      fetch(`/api/client/tickets?${scoped}`, { cache: "no-store" }),
    ])
      .then(async ([contractsResponse, ticketsResponse]) => {
        if (!contractsResponse.ok || !ticketsResponse.ok) throw new Error("unexpected");
        const contracts = (await contractsResponse.json()) as { contracts: { status: string }[] };
        const tickets = (await ticketsResponse.json()) as { tickets: { status: string }[] };
        if (cancelled) return;
        setStats({
          contractsTotal: contracts.contracts.length,
          contractsActive: contracts.contracts.filter(contract => contract.status === "active").length,
          ticketsOpen: tickets.tickets.filter(ticket => ["open", "in_progress"].includes(ticket.status)).length,
        });
      })
      .catch(() => {
        if (!cancelled) setStatsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeAccount]);

  if (loading || !session) {
    return (
      <div className={appStyles.loadingWrapWide}>
        <span className={styles.spinner} aria-hidden="true" />
        Verificando sua sessão…
      </div>
    );
  }

  return (
    <>
      {notice ? (
        <p className={`${styles.message} ${styles.messageError}`} role="alert">
          {notice}
        </p>
      ) : null}

      <section className={appStyles.sectionCard} aria-labelledby="overview-title">
        <span className={styles.badge}>
          <ShieldCheck size={12} aria-hidden="true" />
          Área logada real · Etapa 2
        </span>
        <h2 id="overview-title" className={appStyles.sectionTitle}>
          Olá{session.displayName ? `, ${session.displayName}` : ""}
        </h2>
        <p className={appStyles.sectionHint}>
          Sua sessão é verificada diretamente no servidor a cada solicitação. Os dados abaixo são
          sempre lidos com base no vínculo oficial entre a sua identidade e o cadastro do cliente.
        </p>
        <dl className={appStyles.metaGrid}>
          <div className={appStyles.metaItem}>
            <span>E-mail da conta</span>
            <strong>{session.email}</strong>
          </div>
          <div className={appStyles.metaItem}>
            <span>Situação do e-mail</span>
            <strong className={session.emailConfirmed ? styles.statusOk : styles.statusWarn}>
              {session.emailConfirmed ? "Confirmado por link" : "Não confirmado · identidade conferida manualmente"}
            </strong>
          </div>
          <div className={appStyles.metaItem}>
            <span>Sessão válida até</span>
            <strong>{new Date(session.expiresAt).toLocaleString("pt-BR")}</strong>
          </div>
        </dl>
        {!session.emailConfirmed ? (
          <p className={`${styles.message} ${styles.messageInfo}`} role="status" style={{ marginTop: 14 }}>
            <CheckCircle2 size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>Sua identidade foi conferida manualmente pela equipe. Ainda não foi confirmada a posse deste e-mail; nenhum link foi enviado enquanto SMTP estiver desativado.</span>
          </p>
        ) : null}
      </section>

      <section className={appStyles.sectionCard} aria-labelledby="accounts-title">
        <h2 id="accounts-title" className={appStyles.sectionTitle}>
          Suas contas de cliente
        </h2>
        <p className={appStyles.sectionHint}>
          Cadastros oficiais aos quais sua identidade foi vinculada pela equipe do Grupo SEG System.
          A navegação é por vínculo: nenhum dado é aceito com base no endereço digitado no navegador.
        </p>
        {accounts.length === 0 ? (
          <div className={styles.note}>
            Sua identidade foi criada com sucesso, mas ainda não está vinculada a um cadastro de
            cliente. A equipe fará a verificação cadastral e você verá seus contratos, documentos e
            chamados aqui assim que o vínculo for liberado.
          </div>
        ) : (
          <ul className={appStyles.list}>
            {accounts.map(account => {
              const status = accountStatusLabel[account.status];
              return (
                <li key={account.id} className={appStyles.listItem}>
                  <div className={appStyles.listItemMain}>
                    <p className={appStyles.listItemTitle}>{account.display_name}</p>
                    <p className={appStyles.listItemMeta}>
                      Vínculo desde {new Date(account.linked_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <span className={`${appStyles.chip} ${status.chip}`}>{status.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {activeAccount ? (
        <section className={appStyles.sectionCard} aria-labelledby="balance-title">
          <h2 id="balance-title" className={appStyles.sectionTitle}>
            Resumo — {activeAccount.display_name}
          </h2>
          {activeAccount.status !== "active" ? (
            <div className={appStyles.suspendedNote}>
              Este cadastro está {activeAccount.status === "suspended" ? "suspenso" : "encerrado"}, então os dados
              protegidos não são exibidos por enquanto. Fale com a equipe para regularizar a situação.
            </div>
          ) : statsFailed ? (
            <div className={appStyles.emptyState}>
              Não foi possível carregar o resumo agora. Tente recarregar a página.
            </div>
          ) : !stats ? (
            <div className={appStyles.loadingWrapWide}>
              <span className={styles.spinner} aria-hidden="true" />
              Carregando resumo…
            </div>
          ) : (
            <div className={appStyles.statsRow}>
              <div className={appStyles.statCard}>
                <span className={appStyles.statValue}>{stats.contractsActive}</span>
                <span className={appStyles.statLabel}>
                  Contrato{stats.contractsActive === 1 ? "" : "s"} ativo{stats.contractsActive === 1 ? "" : "s"}
                </span>
              </div>
              <div className={appStyles.statCard}>
                <span className={appStyles.statValue}>{stats.contractsTotal}</span>
                <span className={appStyles.statLabel}>
                  Contrato{stats.contractsTotal === 1 ? "" : "s"} cadastrado{stats.contractsTotal === 1 ? "" : "s"}
                </span>
              </div>
              <div className={appStyles.statCard}>
                <span className={appStyles.statValue}>{stats.ticketsOpen}</span>
                <span className={appStyles.statLabel}>
                  Chamado{stats.ticketsOpen === 1 ? "" : "s"} em andamento
                </span>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </>
  );
}
