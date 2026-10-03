"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { RotateCw, Send, Star } from "lucide-react";
import { useClientSpace } from "../ClientSpaceProvider";
import styles from "../../RealAccess.module.css";
import appStyles from "../ClientApp.module.css";

type Facts = {
  score: number;
  open_tickets: number;
  overdue_charges: number;
  previous_low_scores: number;
  sources: string[];
  as_of: string;
};

type Survey = {
  id: string;
  protocol: string;
  contract_id: string | null;
  survey_type: string;
  status: string;
  score: number | null;
  feedback: string | null;
  renewal_risk: string | null;
  renewal_risk_reason: string | null;
  facts_json: Facts | null;
  action_plan_pending_reason: string | null;
  created_at: string;
  responded_at: string | null;
};

const statusLabel: Record<string, string> = {
  pendente: "Aguardando sua resposta",
  respondida: "Respondida",
  em_acao: "Em plano de ação",
  concluida: "Concluída",
};

const typeLabel: Record<string, string> = {
  pos_atendimento: "Pós-atendimento",
  periodica: "Periódica",
  outro: "Outro",
};

const riskLabel: Record<string, string> = {
  baixo: "Risco de renovação baixo",
  medio: "Risco de renovação médio",
  alto: "Risco de renovação alto",
};

function newIdempotencyKey() {
  return `cli11-${crypto.randomUUID()}`;
}

export default function ClientSatisfactionPage() {
  const { activeAccount, loading: spaceLoading, notice: spaceNotice, reload } = useClientSpace();
  const [items, setItems] = useState<Survey[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const keyRef = useRef("");

  const load = useCallback(async (accountId: string) => {
    setLoadError("");
    setItems(null);
    try {
      const response = await fetch(`/api/client/satisfaction-surveys?account=${encodeURIComponent(accountId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load_failed");
      const data = await response.json() as { surveys: Survey[] };
      setItems(data.surveys);
    } catch {
      setLoadError("Não foi possível carregar as pesquisas agora.");
    }
  }, []);

  useEffect(() => {
    setSelectedId("");
    setScore("");
    setFeedback("");
    setSubmitError("");
    setSuccess("");
    keyRef.current = newIdempotencyKey();
    if (!activeAccount || activeAccount.status !== "active") {
      setItems(null);
      return;
    }
    void load(activeAccount.id);
  }, [activeAccount, load]);

  const pending = (items || []).filter(item => item.status === "pendente");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeAccount || busy) return;
    setBusy(true);
    setSubmitError("");
    setSuccess("");
    try {
      if (!keyRef.current) keyRef.current = newIdempotencyKey();
      const response = await fetch("/api/client/satisfaction-surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": keyRef.current },
        body: JSON.stringify({ survey_id: selectedId, score: Number(score), feedback }),
      });
      const data = await response.json() as { survey?: Survey; error?: string; replayed?: boolean };
      if (!response.ok || !data.survey) {
        const messages: Record<string, string> = {
          survey_already_answered: "Esta pesquisa já foi respondida.",
          idempotency_key_reused: "Esta tentativa conflitou com outra resposta. Recarregue a página.",
          forbidden: "A pesquisa selecionada não está disponível no seu vínculo.",
        };
        throw new Error(messages[data.error || ""] || "Não foi possível registrar a resposta.");
      }
      setSuccess(`${data.replayed ? "Resposta recuperada" : "Resposta registrada"}: protocolo ${data.survey.protocol}.`);
      setSelectedId("");
      setScore("");
      setFeedback("");
      keyRef.current = newIdempotencyKey();
      await load(activeAccount.id);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível registrar a resposta.");
      // A chave é preservada: um retry após queda de conexão não duplica a resposta.
    } finally {
      setBusy(false);
    }
  }

  if (spaceLoading) return <div className={appStyles.loadingWrapWide}><span className={styles.spinner} aria-hidden="true" />Verificando sua sessão…</div>;
  if (!activeAccount) return spaceNotice ? (
    <p className={`${styles.message} ${styles.messageError}`} role="alert">
      {spaceNotice}<button className={appStyles.retryButton} type="button" onClick={() => reload()}><RotateCw size={13} />Tentar novamente</button>
    </p>
  ) : <div className={appStyles.emptyState}>Seu acesso ainda não possui uma conta vinculada.</div>;

  return <>
    <section className={appStyles.sectionCard} aria-labelledby="survey-answer-title">
      <span className={styles.badge}><Star size={12} aria-hidden="true" />{activeAccount.display_name}</span>
      <h1 id="survey-answer-title" className={appStyles.sectionTitle}>Pesquisa de satisfação</h1>
      <p className={appStyles.sectionHint}>Responda apenas pesquisas enviadas para o seu acesso. A resposta não altera contrato, cobrança ou obrigação; serve para registro e tratativa.</p>
      {activeAccount.status !== "active" ? <div className={appStyles.suspendedNote}>Este cadastro não está ativo para novas respostas.</div>
      : !items ? null
      : pending.length === 0 ? <div className={appStyles.emptyState}>Nenhuma pesquisa pendente para esta conta.</div> : (
        <form className={appStyles.formGrid} onSubmit={submit}>
          <label>Pesquisa pendente
            <select className={appStyles.select} required value={selectedId} onChange={event => setSelectedId(event.target.value)}>
              <option value="">Selecione a pesquisa</option>
              {pending.map(item => <option key={item.id} value={item.id}>{item.protocol} · {typeLabel[item.survey_type] || item.survey_type}</option>)}
            </select>
          </label>
          <label>Nota de 0 a 10
            <input className={appStyles.inputLike} type="number" required min={0} max={10} step={1} value={score} onChange={event => setScore(event.target.value)} />
          </label>
          <label>Comentário
            <textarea className={appStyles.textarea} required minLength={10} maxLength={2000} value={feedback} onChange={event => setFeedback(event.target.value)} placeholder="Descreva o que motivou a nota. O comentário fica registrado junto da pesquisa." />
            <span className={appStyles.charCounter}>{feedback.length}/2000</span>
          </label>
          {submitError ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{submitError}</p> : null}
          {success ? <p className={styles.message} role="status">{success}</p> : null}
          <button className={styles.submit} type="submit" disabled={busy}><Send size={15} aria-hidden="true" />{busy ? "Enviando…" : "Enviar resposta"}</button>
        </form>
      )}
    </section>

    <section className={appStyles.sectionCard} aria-labelledby="survey-history-title">
      <h2 id="survey-history-title" className={appStyles.sectionTitle}>Minhas pesquisas</h2>
      <p className={appStyles.sectionHint}>Somente pesquisas endereçadas a esta identidade na conta selecionada.</p>
      {loadError ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{loadError}<button className={appStyles.retryButton} type="button" onClick={() => void load(activeAccount.id)}><RotateCw size={13} />Tentar novamente</button></p>
      : !items ? <div className={appStyles.loadingWrapWide}><span className={styles.spinner} aria-hidden="true" />Carregando pesquisas…</div>
      : items.length === 0 ? <div className={appStyles.emptyState}>Nenhuma pesquisa de satisfação registrada.</div>
      : <ul className={appStyles.list}>{items.map(item => <li className={appStyles.listItem} key={item.id}>
          <div className={appStyles.listItemMain}>
            <p className={appStyles.listItemTitle}>{typeLabel[item.survey_type] || item.survey_type} · {item.protocol}</p>
            <p className={appStyles.listItemMeta}>Enviada em {new Date(item.created_at).toLocaleString("pt-BR")}{item.responded_at ? ` · respondida em ${new Date(item.responded_at).toLocaleString("pt-BR")}` : ""}</p>
          </div>
          <span className={`${appStyles.chip} ${appStyles.chipOpen}`}>{statusLabel[item.status] || item.status}</span>
          {item.score === null ? <p className={appStyles.listItemDetail}>Ainda sem nota registrada.</p>
            : <p className={appStyles.listItemDetail}>Nota {item.score}/10. {item.feedback}</p>}
          {item.renewal_risk && item.facts_json ? (
            <div className={appStyles.responseBox}>
              <strong>{riskLabel[item.renewal_risk] || item.renewal_risk}</strong>
              Base factual em {new Date(item.facts_json.as_of).toLocaleString("pt-BR")}: chamados abertos {item.facts_json.open_tickets}, cobranças vencidas {item.facts_json.overdue_charges}, respostas anteriores com nota até 6: {item.facts_json.previous_low_scores}.
            </div>
          ) : item.score !== null ? (
            <div className={appStyles.responseBox}><strong>Risco de renovação</strong>Não classificado: os registros existentes não sustentam uma classificação.</div>
          ) : null}
          {item.action_plan_pending_reason ? <div className={appStyles.responseBox}><strong>Plano de ação</strong>{item.action_plan_pending_reason}</div> : null}
          {item.status === "em_acao" ? <div className={appStyles.responseBox}><strong>Plano de ação</strong>Um plano de ação foi aberto com o responsável comercial da sua conta.</div> : null}
        </li>)}</ul>}
    </section>
  </>;
}
