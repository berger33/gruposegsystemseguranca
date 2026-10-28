"use client";
import {workspaceFetch} from "@/lib/workspace-response";

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

// UX-PRO-ID3: a leitura alimenta o histórico E o <select> de pendentes. Sem o
// vínculo com a conta, uma pesquisa de A podia ser oferecida (e enviada) sob B.
type SurveysRead = { accountId: string; surveys: Survey[]; readAt: string };
type SurveysReadError = { accountId: string; message: string };

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

function readFailureMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  if (/^Sua sessão|^Seu acesso|^O registro|^O serviço|^Confira/.test(raw)) {
    return raw.replace(/\s*\(HTTP \d+, [^)]*\)$/, "");
  }
  if (raw.startsWith("A resposta")) return raw;
  return "Não foi possível carregar as pesquisas agora. Tente novamente.";
}

function formatReadTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "horário não informado" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function ClientSatisfactionPage() {
  const { activeAccount, loading: spaceLoading, notice: spaceNotice, reload } = useClientSpace();
  const [read, setRead] = useState<SurveysRead | null>(null);
  const [readError, setReadError] = useState<SurveysReadError | null>(null);
  const [readLoading, setReadLoading] = useState(false);
  const latestRequest = useRef(0);
  const [selectedId, setSelectedId] = useState("");
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const keyRef = useRef("");

  const load = useCallback(async (accountId: string) => {
    const requestId = ++latestRequest.current;
    setReadLoading(true);
    setReadError(null);
    try {
      const response = await workspaceFetch(`/api/client/satisfaction-surveys?account=${encodeURIComponent(accountId)}`, { cache: "no-store" });
      const data = await response.json() as { surveys: Survey[] };
      // Um 200 com corpo inesperado não é "nenhuma pesquisa": é falha de leitura.
      if (!Array.isArray(data.surveys)) throw new Error("A resposta não trouxe a lista de pesquisas. Tente novamente.");
      if (requestId !== latestRequest.current) return;
      setRead({ accountId, surveys: data.surveys, readAt: new Date().toISOString() });
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      setReadError({ accountId, message: readFailureMessage(error) });
    } finally {
      if (requestId !== latestRequest.current) return;
      setReadLoading(false);
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
      latestRequest.current += 1;
      setRead(null);
      setReadError(null);
      setReadLoading(false);
      return;
    }
    void load(activeAccount.id);
  }, [activeAccount, load]);

  const currentRead = activeAccount?.id === read?.accountId ? read : null;
  const currentError = activeAccount?.id === readError?.accountId ? readError : null;
  const pending = currentRead ? currentRead.surveys.filter(item => item.status === "pendente") : [];
  const selectedSurvey = pending.find(item => item.id === selectedId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeAccount || busy) return;
    const accountId = activeAccount.id;
    // Defesa em profundidade: o servidor já recusa pesquisa alheia, mas a UI
    // não deve enviar um survey_id que não veio da leitura da conta ativa.
    if (!pending.some(item => item.id === selectedId)) {
      setSubmitError("A pesquisa selecionada não pertence a esta conta. Selecione novamente.");
      return;
    }
    setBusy(true);
    setSubmitError("");
    setSuccess("");
    try {
      if (!keyRef.current) keyRef.current = newIdempotencyKey();
      // fetch direto: workspaceFetch consumiria o corpo do erro e o mapa de
      // mensagens nunca seria alcançado num 400/409.
      const response = await fetch("/api/client/satisfaction-surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": keyRef.current },
        body: JSON.stringify({ survey_id: selectedId, score: Number(score), feedback }),
      });
      const data = await response.json().catch(() => ({})) as { survey?: Survey; error?: string; replayed?: boolean };
      if (!response.ok || !data.survey) {
        const messages: Record<string, string> = {
          survey_already_answered: "Esta pesquisa já foi respondida.",
          idempotency_key_reused: "Esta tentativa conflitou com outra resposta. Recarregue a página.",
          forbidden: "A pesquisa selecionada não está disponível no seu vínculo.",
          invalid_response: "Informe uma nota inteira e um comentário de 10 a 2000 caracteres.",
          score_outside_declared_scale: "A nota precisa estar dentro da escala declarada da pesquisa.",
          invalid_request: "Não foi possível entender a resposta enviada. Revise os campos.",
          idempotency_key_required: "Não foi possível validar este envio. Recarregue a página.",
        };
        throw new Error(messages[data.error || ""] || "Não foi possível registrar a resposta.");
      }
      setSuccess(`${data.replayed ? "Resposta recuperada" : "Resposta registrada"}: protocolo ${data.survey.protocol}.`);
      setSelectedId("");
      setScore("");
      setFeedback("");
      keyRef.current = newIdempotencyKey();
      await load(accountId);
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

  const inactive = activeAccount.status !== "active";

  return <>
    <section className={appStyles.sectionCard} aria-labelledby="survey-answer-title" aria-busy={readLoading}>
      <span className={styles.badge}><Star size={12} aria-hidden="true" />{activeAccount.display_name}</span>
      <h1 id="survey-answer-title" className={appStyles.sectionTitle}>Pesquisa de satisfação</h1>
      <p className={appStyles.sectionHint}>Responda apenas pesquisas enviadas para o seu acesso. A resposta não altera contrato, cobrança ou obrigação; serve para registro e tratativa.</p>
      {inactive ? <div className={appStyles.suspendedNote}>Este cadastro não está ativo para novas respostas.</div>
      : readLoading || !currentRead ? (
        <div className={appStyles.loadingWrapWide} role={currentError ? undefined : "status"}>
          <span className={styles.spinner} aria-hidden="true" />
          {currentError ? "Aguardando uma leitura concluída…" : "Carregando pesquisas pendentes…"}
        </div>
      ) : pending.length === 0 ? <div className={appStyles.emptyState}>Nenhuma pesquisa pendente para esta conta.</div> : (
        <form className={appStyles.formGrid} onSubmit={submit}>
          <label>Pesquisa pendente
            <select className={appStyles.select} required value={selectedId} onChange={event => setSelectedId(event.target.value)}>
              <option value="">Selecione a pesquisa</option>
              {pending.map(item => <option key={item.id} value={item.id}>{item.protocol} · {typeLabel[item.survey_type] || item.survey_type}</option>)}
            </select>
          </label>
          <p className={appStyles.sectionHint}>{selectedSurvey?.purpose || "Selecione uma pesquisa para ver finalidade e escala."}</p>
          <label>Nota na escala declarada ({selectedSurvey?.scale_min ?? "–"} a {selectedSurvey?.scale_max ?? "–"})
            <input className={appStyles.inputLike} type="number" required min={selectedSurvey?.scale_min} max={selectedSurvey?.scale_max} step={1} value={score} onChange={event => setScore(event.target.value)} />
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

    <section className={appStyles.sectionCard} aria-labelledby="survey-history-title" aria-busy={readLoading}>
      <h2 id="survey-history-title" className={appStyles.sectionTitle}>Minhas pesquisas</h2>
      <p className={appStyles.sectionHint}>Somente pesquisas endereçadas a esta identidade na conta selecionada.</p>
      {inactive ? (
        <div className={appStyles.suspendedNote}>
          Cadastro {activeAccount.status === "suspended" ? "suspenso" : "encerrado"}. As pesquisas não são exibidas enquanto a situação não é regularizada.
        </div>
      ) : (
        <>
          {currentError ? (
            <p className={`${styles.message} ${styles.messageError}`} role="alert">
              {currentError.message}
              <button className={appStyles.retryButton} type="button" onClick={() => void load(activeAccount.id)}><RotateCw size={13} />Tentar novamente</button>
            </p>
          ) : null}
          {currentError && currentRead ? (
            <p className={appStyles.sectionHint} role="status">
              Os dados abaixo são da Última leitura concluída às {formatReadTime(currentRead.readAt)}. A nova consulta falhou e nada foi apagado.
            </p>
          ) : null}
          {readLoading || !currentRead ? (
            <div className={appStyles.loadingWrapWide} role={currentError ? undefined : "status"}>
              <span className={styles.spinner} aria-hidden="true" />
              {currentError ? "Aguardando uma leitura concluída…" : "Carregando pesquisas…"}
            </div>
          ) : currentRead.surveys.length === 0 ? (
            <div className={appStyles.emptyState}>Nenhuma pesquisa de satisfação registrada.</div>
          ) : (
            <ul className={appStyles.list}>{currentRead.surveys.map(item => <li className={appStyles.listItem} key={item.id}>
              <div className={appStyles.listItemMain}>
                <p className={appStyles.listItemTitle}>{typeLabel[item.survey_type] || item.survey_type} · {item.protocol}</p>
                <p className={appStyles.listItemMeta}>Enviada em {new Date(item.created_at).toLocaleString("pt-BR")}{item.response ? ` · respondida em ${new Date(item.response.responded_at).toLocaleString("pt-BR")}` : ""}</p>
                <p className={appStyles.listItemDetail}>{item.purpose} · escala {item.scale_min}–{item.scale_max} · metodologia {item.methodology} ({item.methodology_source})</p>
              </div>
              <span className={`${appStyles.chip} ${appStyles.chipOpen}`}>{statusLabel[item.status] || item.status}</span>
              {!item.response ? <p className={appStyles.listItemDetail}>Ainda sem nota registrada.</p>
                : <p className={appStyles.listItemDetail}>Sua nota: {item.response.score}. {item.response.feedback}</p>}
              {item.response ? <div className={appStyles.responseBox}><strong>Resposta recebida</strong>Quando a regra declarada exigir, haverá acompanhamento interno. Dados de funcionários, fatos internos, risco, tarefa e auditoria não são exibidos aqui.</div> : null}
            </li>)}</ul>
          )}
        </>
      )}
    </section>
  </>;
}
