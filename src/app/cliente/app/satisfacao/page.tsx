"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { RotateCw, Send, Star } from "lucide-react";
import { useClientSpace } from "../ClientSpaceProvider";
import styles from "../../RealAccess.module.css";
import appStyles from "../ClientApp.module.css";

type Survey = {
  id: string;
  protocol: string;
  survey_type: string;
  status: string;
  purpose: string;
  methodology: "generica" | "nps" | "csat";
  methodology_source: string;
  scale_min: number;
  scale_max: number;
  reference_start: string | null;
  reference_end: string | null;
  created_at: string;
  response: {score:number;feedback:string;responded_at:string} | null;
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
          <p className={appStyles.sectionHint}>{pending.find(item=>item.id===selectedId)?.purpose || "Selecione uma pesquisa para ver finalidade e escala."}</p>
          <label>Nota na escala declarada ({pending.find(item=>item.id===selectedId)?.scale_min ?? "–"} a {pending.find(item=>item.id===selectedId)?.scale_max ?? "–"})
            <input className={appStyles.inputLike} type="number" required min={pending.find(item=>item.id===selectedId)?.scale_min} max={pending.find(item=>item.id===selectedId)?.scale_max} step={1} value={score} onChange={event => setScore(event.target.value)} />
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
            <p className={appStyles.listItemMeta}>Enviada em {new Date(item.created_at).toLocaleString("pt-BR")}{item.response ? ` · respondida em ${new Date(item.response.responded_at).toLocaleString("pt-BR")}` : ""}</p>
            <p className={appStyles.listItemDetail}>{item.purpose} · escala {item.scale_min}–{item.scale_max} · metodologia {item.methodology} ({item.methodology_source})</p>
          </div>
          <span className={`${appStyles.chip} ${appStyles.chipOpen}`}>{statusLabel[item.status] || item.status}</span>
          {!item.response ? <p className={appStyles.listItemDetail}>Ainda sem nota registrada.</p>
            : <p className={appStyles.listItemDetail}>Sua nota: {item.response.score}. {item.response.feedback}</p>}
          {item.response ? <div className={appStyles.responseBox}><strong>Resposta recebida</strong>Quando a regra declarada exigir, haverá acompanhamento interno. Dados de funcionários, fatos internos, risco, tarefa e auditoria não são exibidos aqui.</div> : null}
        </li>)}</ul>}
    </section>
  </>;
}
