"use client";

// EXT-10 / F06 — leitura, pelo cliente vinculado, do plano de continuidade publicado
// para a própria conta. Somente leitura: o cliente não transiciona estados, não
// documenta simulados e não aciona nada. Contatos internos, justificativas internas e
// resultados de simulado permanecem restritos à equipe (projeção minimizada no servidor).

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, RotateCw } from "lucide-react";
import { useClientSpace } from "../ClientSpaceProvider";
import styles from "../../RealAccess.module.css";
import appStyles from "../ClientApp.module.css";

type PlanStatus = "aprovado" | "em_teste" | "testado";

type ContinuityPlan = {
  id: string;
  protocol: string;
  title: string;
  description: string;
  post_id: string | null;
  status: PlanStatus;
  responsible_name: string | null;
  contingency_steps: string[];
  recovery_steps: string[];
  last_tested_at: string | null;
  next_test_due: string | null;
  client_visibility_note: string | null;
  created_at: string;
  updated_at: string;
};

const planStatus: Record<PlanStatus, { text: string; chip: string }> = {
  aprovado: { text: "Aprovado", chip: appStyles.chipResolved },
  em_teste: { text: "Em teste", chip: appStyles.chipProgress },
  testado: { text: "Testado", chip: appStyles.chipResolved },
};

const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(item => (typeof item === "string" ? item : JSON.stringify(item))).filter(Boolean) : [];

const asDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR") : null);

export default function ClientContinuityPage() {
  const { activeAccount, loading, notice, reload } = useClientSpace();
  const [plans, setPlans] = useState<ContinuityPlan[] | null>(null);
  const [loadError, setLoadError] = useState("");

  const loadPlans = useCallback((accountId: string) => {
    setLoadError("");
    fetch(`/api/client/continuity/plans?account=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("unexpected");
        const data = (await response.json()) as { plans: ContinuityPlan[] };
        setPlans(data.plans ?? []);
      })
      .catch(() => setLoadError("Não foi possível carregar os planos de continuidade agora."));
  }, []);

  useEffect(() => {
    if (!activeAccount || activeAccount.status !== "active") {
      setPlans(null);
      return;
    }
    loadPlans(activeAccount.id);
  }, [activeAccount, loadPlans]);

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
        <section className={appStyles.sectionCard} aria-labelledby="continuity-title">
          <h2 id="continuity-title" className={appStyles.sectionTitle}>Continuidade</h2>
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
    return <div className={appStyles.emptyState}>Sua identidade ainda não foi vinculada a um cadastro de cliente.</div>;
  }

  return (
    <section className={appStyles.sectionCard} aria-labelledby="continuity-title">
      <span className={styles.badge}>
        <LifeBuoy size={12} aria-hidden="true" />
        {activeAccount.display_name}
      </span>
      <h2 id="continuity-title" className={appStyles.sectionTitle}>Planos de continuidade publicados</h2>
      <p className={appStyles.sectionHint}>
        Somente leitura. Aparecem aqui apenas os planos do seu cadastro que a equipe publicou expressamente para você.
        Rascunhos, planos arquivados, contatos internos e resultados de simulado permanecem restritos à equipe. Esta tela
        não aciona plano, não abre chamado e não envia alerta, mensagem ou comunicação a nenhuma central externa.
      </p>
      {loadError ? (
        <p className={`${styles.message} ${styles.messageError}`} role="alert">
          <span>{loadError}</span>
          <button className={appStyles.retryButton} type="button" onClick={() => loadPlans(activeAccount.id)}>
            <RotateCw size={13} aria-hidden="true" />
            Tentar novamente
          </button>
        </p>
      ) : !plans ? (
        <div className={appStyles.loadingWrapWide}>
          <span className={styles.spinner} aria-hidden="true" />
          Carregando planos…
        </div>
      ) : plans.length === 0 ? (
        <div className={appStyles.emptyState}>Nenhum plano de continuidade publicado para este cadastro.</div>
      ) : (
        <ul className={appStyles.list}>
          {plans.map(plan => {
            const status = planStatus[plan.status] ?? { text: plan.status, chip: appStyles.chip };
            const contingency = asList(plan.contingency_steps);
            const recovery = asList(plan.recovery_steps);
            const lastTested = asDate(plan.last_tested_at);
            const nextDue = asDate(plan.next_test_due);
            return (
              <li key={plan.id} className={appStyles.listItem}>
                <div className={appStyles.listItemMain}>
                  <p className={appStyles.listItemTitle}>{plan.title}</p>
                  <p className={appStyles.listItemMeta}>
                    {plan.protocol}
                    {plan.post_id ? ` · posto ${plan.post_id}` : ""}
                    {plan.responsible_name ? ` · responsável ${plan.responsible_name}` : ""}
                    {lastTested ? ` · último simulado ${lastTested}` : ""}
                    {nextDue ? ` · próximo teste ${nextDue}` : ""}
                  </p>
                </div>
                <span className={`${appStyles.chip} ${status.chip}`}>{status.text}</span>
                <p className={appStyles.listItemDetail}>{plan.description}</p>
                {contingency.length ? (
                  <div className={appStyles.responseBox}>
                    <strong>Passos de contingência</strong>
                    <ol>{contingency.map((step, index) => <li key={`${plan.id}-c-${index}`}>{step}</li>)}</ol>
                  </div>
                ) : null}
                {recovery.length ? (
                  <div className={appStyles.responseBox}>
                    <strong>Passos de recuperação</strong>
                    <ol>{recovery.map((step, index) => <li key={`${plan.id}-r-${index}`}>{step}</li>)}</ol>
                  </div>
                ) : null}
                {plan.client_visibility_note ? (
                  <div className={appStyles.responseBox}>
                    <strong>Observação da equipe na publicação</strong>
                    {plan.client_visibility_note}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
