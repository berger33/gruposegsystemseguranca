"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { RotateCw, Send, Star } from "lucide-react";
import { useClientSpace } from "../ClientSpaceProvider";
import styles from "../../RealAccess.module.css";
import appStyles from "../ClientApp.module.css";

// EXT-06: esta página nunca exibe responsável, autor interno, nota de risco
// interna ou fatos internos (chamados/cobranças). A API já deixou de
// devolver esses campos (src/server/cli-finance-api.mjs); a página também
// não lê nenhum campo equivalente, mesmo que a resposta do backend mude.
type Survey = {
  id: string;
  protocol: string;
  contract_id: string | null;
  survey_type: string;
  status: string;
  methodology: string;
  scale_min: number | null;
  scale_max: number | null;
  score: number | null;
  feedback: string | null;
  score_classification: string | null;
  created_at: string;
  responded_at: string | null;
};

const statusLabel: Record<string, string> = {
  pendente: "Aguardando sua resposta",
  respondida: "Respondida",
  em_acao: "Em acompanhamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const typeLabel: Record<string, string> = {
  pos_atendimento: "Pós-atendimento",
  periodica: "Periódica",
  outro: "Outro",
};

const classificationLabel: Record<string, string> = {
  promotor: "Promotor",
  neutro: "Neutro",
  detrator: "Detrator",
  satisfeito: "Satisfeito",
  insatisfeito: "Insatisfeito",
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
  const selected = pending.find(item => item.id === selectedId) || null;
  const scaleMin = selected?.scale_min ?? 0;
  const scaleMax = selected?.scale_max ?? 10;
  const scaleHint = useMemo(() => `Nota de ${scaleMin} a ${scaleMax}`, [scaleMin, scaleMax]);

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
      const data = await response.json() as { survey?: Survey; error?: string; replayed?: boolean; follow_up_required?: boolean };
      if (!response.ok || !data.survey) {
        const messages: Record<string, string> = {
          survey_already_answered: "Esta pesquisa já foi respondida.",
          idempotency_key_reused: "Esta tentativa conflitou com outra resposta. Recarregue a página.",
          forbidden: "A pesquisa selecionada não está disponível no seu vínculo.",
          score_out_of_declared_scale: "A nota informada está fora da escala desta pesquisa.",
        };
        throw new Error(messages[data.error || ""] || "Não foi possível registrar a resposta.");
      }
      const followUp = data.follow_up_required
        ? " Sua resposta gerou um acompanhamento interno; nossa equipe entrará em contato."
        : "";
      setSuccess(`${data.replayed ? "Resposta recuperada" : "Resposta registrada"}: protocolo ${data.survey.protocol}.${followUp}`);
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
          <label>{scaleHint}
            <input className={appStyles.inputLike} type="number" required min={scaleMin} max={scaleMax} step={1} value={score} onChange={event => setScore(event.target.value)} />
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
      <p className={appStyles.sectionHint}>Somente pesquisas endereçadas a esta identidade na conta selecionada. Dados internos de equipe não são exibidos aqui.</p>
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
            : <p className={appStyles.listItemDetail}>Nota {item.score}{item.scale_max != null ? `/${item.scale_max}` : ""}{item.score_classification ? ` · ${classificationLabel[item.score_classification] || item.score_classification}` : ""}. {item.feedback}</p>}
          {item.status === "em_acao" ? <div className={appStyles.responseBox}><strong>Acompanhamento em andamento</strong>Sua resposta gerou um acompanhamento interno; nossa equipe cuida do retorno.</div> : null}
          {item.status === "concluida" ? <div className={appStyles.responseBox}><strong>Encerrado</strong>Este acompanhamento foi concluído pela nossa equipe.</div> : null}
        </li>)}</ul>}
    </section>
  </>;
}
