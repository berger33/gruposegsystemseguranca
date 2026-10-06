"use client";

// EXT-10 / F06 — leitura, pelo cliente vinculado, do plano de continuidade publicado
// para a própria conta. Somente leitura: o cliente não transiciona estados, não
// documenta simulados e não aciona nada. Contatos internos, justificativas internas e
// resultados de simulado permanecem restritos à equipe (projeção minimizada no servidor).

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, RotateCw } from "lucide-react";
import { continuityRequest, type ContinuityErrorDescriptor } from "../../../../lib/continuity-request";
import {
  continuityErrorFootnote,
  continuityStatusLabels,
  describeContinuityError,
  honestNextTest,
  honestTestDate,
} from "../../../../lib/continuity-vocabulary.mjs";
import { useClientSpace } from "../ClientSpaceProvider";
import styles from "../../RealAccess.module.css";
import appStyles from "../ClientApp.module.css";

type ContinuityPlan = {
  id: string;
  protocol: string;
  title: string;
  description: string;
  post_id: string | null;
  status: string;
  responsible_name: string | null;
  contingency_steps: unknown;
  recovery_steps: unknown;
  last_tested_at: string | null;
  next_test_due: string | null;
  client_visibility_note: string | null;
  created_at: string;
  updated_at: string;
};

type PlansResponse = { plans?: unknown };
type PlanDetailResponse = { plan?: unknown };
type PlansPhase = "loading" | "ready" | "failed";
type DetailLoad =
  | { phase: "loading"; planId: string }
  | { phase: "ready"; data: ContinuityPlan }
  | { phase: "failed"; planId: string; error: ContinuityErrorDescriptor };

const planStatus = (status: string) => ({
  text: continuityStatusLabels[status] ?? status,
  chip: status === "em_teste" ? appStyles.chipProgress : status === "aprovado" || status === "testado" ? appStyles.chipResolved : appStyles.chip,
});

const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(item => (typeof item === "string" ? item : JSON.stringify(item))).filter(Boolean) : [];

const isContinuityPlan = (value: unknown): value is ContinuityPlan =>
  Boolean(value) && typeof value === "object" &&
  typeof (value as ContinuityPlan).id === "string" &&
  typeof (value as ContinuityPlan).title === "string" &&
  typeof (value as ContinuityPlan).protocol === "string";

function incompletePlansResponse(status: number): ContinuityErrorDescriptor {
  return {
    ...describeContinuityError(null, status),
    kind: "unavailable",
    title: "Resposta de planos incompleta",
    detail: "O servidor respondeu sem uma lista de planos. Isto não é uma lista vazia.",
    canRetry: true,
  };
}

function incompleteDetailResponse(status: number): ContinuityErrorDescriptor {
  return {
    ...describeContinuityError(null, status),
    kind: "unavailable",
    title: "Resposta de detalhes incompleta",
    detail: "O servidor respondeu sem os detalhes publicados do plano. Isto não é uma lista vazia.",
    canRetry: true,
  };
}

function PlanLoadFailure({ error, onRetry }: { error: ContinuityErrorDescriptor; onRetry: () => void }) {
  const state = error.kind === "denied" ? "denied" : "error";
  const footnote = continuityErrorFootnote(error);
  return (
    <div className={`${styles.message} ${styles.messageError}`} role="alert" data-ui-state={state}>
      <div>
        <strong>{error.title}</strong>
        <div>{error.detail}</div>
        {footnote || error.status === 0 ? <small>{footnote ? `${footnote}${error.status ? ` · HTTP ${error.status}` : " · sem resposta HTTP"}` : "Sem resposta HTTP (status 0)"}</small> : null}
      </div>
      {error.canRetry ? (
        <button className={appStyles.retryButton} type="button" onClick={onRetry}>
          <RotateCw size={13} aria-hidden="true" />
          Tentar novamente
        </button>
      ) : null}
    </div>
  );
}

function PublishedPlanDetail({ plan }: { plan: ContinuityPlan }) {
  const contingency = asList(plan.contingency_steps);
  const recovery = asList(plan.recovery_steps);
  const status = planStatus(plan.status);
  return (
    <section className={appStyles.responseBox} data-ui-state="ready" data-testid="client-continuity-detail-content" aria-labelledby="continuity-detail-title">
      <strong id="continuity-detail-title">Detalhes publicados</strong>
      <p className={appStyles.listItemTitle}>{plan.title}</p>
      <p className={appStyles.listItemMeta}>
        {plan.protocol} · {status.text} · último simulado {honestTestDate(plan.last_tested_at)} · próximo teste {honestNextTest(plan.next_test_due)}
      </p>
      <p className={appStyles.listItemDetail}>{plan.description}</p>
      {contingency.length ? (
        <div className={appStyles.responseBox}>
          <strong>Passos de contingência publicados</strong>
          <ol>{contingency.map((step, index) => <li key={`${plan.id}-detail-c-${index}`}>{step}</li>)}</ol>
        </div>
      ) : null}
      {recovery.length ? (
        <div className={appStyles.responseBox}>
          <strong>Passos de recuperação publicados</strong>
          <ol>{recovery.map((step, index) => <li key={`${plan.id}-detail-r-${index}`}>{step}</li>)}</ol>
        </div>
      ) : null}
      <p className={appStyles.listItemMeta}>A visão de detalhes não exibe contatos internos, justificativas internas, trilha nem resultado textual de simulado.</p>
    </section>
  );
}

export default function ClientContinuityPage() {
  const { activeAccount, loading, notice, reload } = useClientSpace();
  const [plans, setPlans] = useState<ContinuityPlan[] | null>(null);
  const [phase, setPhase] = useState<PlansPhase>("loading");
  const [loadError, setLoadError] = useState<ContinuityErrorDescriptor | null>(null);
  const [detail, setDetail] = useState<DetailLoad | null>(null);

  const loadPlans = useCallback(async (accountId: string) => {
    setLoadError(null);
    setPhase("loading");

    const result = await continuityRequest<PlansResponse>(
      `/api/client/continuity/plans?account=${encodeURIComponent(accountId)}`,
    );
    if (!result.ok) {
      setPlans(null);
      setLoadError(result.error);
      setPhase("failed");
      return;
    }

    if (!Array.isArray(result.data.plans)) {
      setPlans(null);
      setLoadError(incompletePlansResponse(result.status));
      setPhase("failed");
      return;
    }

    setPlans(result.data.plans as ContinuityPlan[]);
    setPhase("ready");
  }, []);

  const loadDetail = useCallback(async (planId: string) => {
    setDetail({ phase: "loading", planId });
    const result = await continuityRequest<PlanDetailResponse>(`/api/client/continuity/plans/${planId}`);
    if (!result.ok) {
      // Uma falha no detalhe não invalida a lista já lida: em especial, 404
      // pode indicar que a disponibilidade mudou depois da listagem.
      setDetail({ phase: "failed", planId, error: result.error });
      return;
    }
    if (!isContinuityPlan(result.data.plan)) {
      setDetail({ phase: "failed", planId, error: incompleteDetailResponse(result.status) });
      return;
    }
    setDetail({ phase: "ready", data: result.data.plan });
  }, []);

  useEffect(() => {
    if (!activeAccount || activeAccount.status !== "active") {
      setPlans(null);
      setLoadError(null);
      setDetail(null);
      return;
    }
    void loadPlans(activeAccount.id);
  }, [activeAccount, loadPlans]);

  if (loading) {
    return (
      <div className={appStyles.loadingWrapWide} data-ui-state="loading">
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
          <p className={`${styles.message} ${styles.messageError}`} role="alert" data-ui-state="error">
            <span>{notice}</span>
            <button className={appStyles.retryButton} type="button" onClick={() => void reload()}>
              <RotateCw size={13} aria-hidden="true" />
              Tentar novamente
            </button>
          </p>
        </section>
      );
    }
    return <div className={appStyles.emptyState} data-ui-state="empty">Sua identidade ainda não foi vinculada a um cadastro de cliente.</div>;
  }

  const reloadPlans = () => void loadPlans(activeAccount.id);
  const accountIsActive = activeAccount.status === "active";

  return (
    <section className={appStyles.sectionCard} aria-labelledby="continuity-title" data-testid="client-continuity-workspace">
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
      {accountIsActive && phase !== "failed" ? (
        <p className={appStyles.inlineAction}>
          <button className={appStyles.retryButton} type="button" onClick={reloadPlans}>
            <RotateCw size={13} aria-hidden="true" />
            Atualizar lista
          </button>
        </p>
      ) : null}
      {!accountIsActive ? (
        <div className={`${styles.message} ${styles.messageError}`} role="alert" data-ui-state="denied">
          A conta selecionada não está ativa para leitura de planos publicados.
        </div>
      ) : phase === "failed" && loadError ? (
        <PlanLoadFailure error={loadError} onRetry={reloadPlans} />
      ) : phase === "loading" || !plans ? (
        <div className={appStyles.loadingWrapWide} data-ui-state="loading">
          <span className={styles.spinner} aria-hidden="true" />
          Carregando planos…
        </div>
      ) : plans.length === 0 ? (
        <div className={appStyles.emptyState} data-ui-state="empty">Nenhum plano de continuidade publicado para este cadastro.</div>
      ) : (
        <ul className={appStyles.list} data-ui-state="ready" data-testid="client-continuity-list">
          {plans.map(plan => {
            const status = planStatus(plan.status);
            const contingency = asList(plan.contingency_steps);
            const recovery = asList(plan.recovery_steps);
            const detailIsLoading = detail?.phase === "loading" && detail.planId === plan.id;
            return (
              <li key={plan.id} className={appStyles.listItem} data-testid="client-continuity-plan" data-plan={plan.id}>
                <div className={appStyles.listItemMain}>
                  <p className={appStyles.listItemTitle}>{plan.title}</p>
                  <p className={appStyles.listItemMeta}>
                    {plan.protocol}
                    {plan.post_id ? ` · posto ${plan.post_id}` : ""}
                    {plan.responsible_name ? ` · responsável ${plan.responsible_name}` : ""}
                    {` · último simulado ${honestTestDate(plan.last_tested_at)}`}
                    {` · próximo teste ${honestNextTest(plan.next_test_due)}`}
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
                <div className={appStyles.inlineAction}>
                  <button className={appStyles.retryButton} type="button" onClick={() => void loadDetail(plan.id)} disabled={detailIsLoading}>
                    {detailIsLoading ? "Abrindo detalhes…" : "Abrir detalhes"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {detail ? (
        <div className={appStyles.inlineAction} data-testid="client-continuity-detail" aria-live="polite">
          {detail.phase === "loading" ? (
            <div className={appStyles.loadingWrapWide} data-ui-state="loading">
              <span className={styles.spinner} aria-hidden="true" />
              Carregando detalhes publicados…
            </div>
          ) : detail.phase === "failed" ? (
            <PlanLoadFailure error={detail.error} onRetry={() => void loadDetail(detail.planId)} />
          ) : (
            <PublishedPlanDetail plan={detail.data} />
          )}
        </div>
      ) : null}
    </section>
  );
}
