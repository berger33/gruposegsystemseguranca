"use client";
import {workspaceFetch} from "@/lib/workspace-response";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { RefreshCw, RotateCw, Send } from "lucide-react";
import { useClientSpace } from "../ClientSpaceProvider";
import styles from "../../RealAccess.module.css";
import appStyles from "../ClientApp.module.css";

type Communication = {
  id: string;
  protocol: string;
  comm_type: string;
  title: string;
  content: string;
  sent_at: string;
  is_blocking: boolean;
  block_reason: string | null;
  contract_id: string | null;
  contract_title: string | null;
  contract_ends_on: string | null;
  created_at: string;
  allowed_response_kinds: string[];
};

type MyResponse = {
  id: string;
  communication_id: string;
  response_kind: string;
  message: string | null;
  created_at: string;
};

type RenewalDates = {
  as_of: string;
  contracts: { contract_id: string; title: string; status: string; ends_on: string | null; source: string }[];
  crmRenewals: { renewal_id: string; title: string; status: string; renewal_date: string | null; source: string }[];
  note: string;
};

type AccessRestriction = {
  restricted: boolean;
  reason: string | null;
  origin: string | null;
  protocol?: string;
};

type Payload = {
  communications: Communication[];
  responses: MyResponse[];
  renewalDates: RenewalDates;
  accessRestriction: AccessRestriction;
};

// UX-PRO-ID3: uma única leitura alimenta o <select> de manifestação, a lista,
// a faixa de restrição declarada e as duas listas de datas. Sem o vínculo com a
// conta, dados de A (inclusive um communication_id enviável) sobreviviam em B.
type RenewalRead = {
  accountId: string;
  communications: Communication[];
  responses: MyResponse[];
  renewalDates: RenewalDates;
  accessRestriction: AccessRestriction;
  readAt: string;
};
type RenewalReadError = { accountId: string; message: string };

const typeLabel: Record<string, string> = {
  aviso_vencimento: "Aviso de vencimento",
  proposta_renovacao: "Proposta de renovação",
  reajuste: "Reajuste",
  encerramento: "Encerramento",
  outro: "Outro",
};

const kindLabel: Record<string, string> = {
  ciencia: "Registrar ciência",
  interesse_renovar: "Tenho interesse em renovar",
  solicitar_contato: "Solicitar contato",
};

const kindDone: Record<string, string> = {
  ciencia: "Ciência registrada",
  interesse_renovar: "Interesse em renovar registrado",
  solicitar_contato: "Contato solicitado",
};

function newIdempotencyKey() {
  return `cli12-${crypto.randomUUID()}`;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null;
}

function formatReadTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "horário não informado" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function readFailureMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  if (/^Sua sessão|^Seu acesso|^O registro|^O serviço|^Confira|^A resposta/.test(raw)) {
    return raw.replace(/\s*\(HTTP \d+, [^)]*\)$/, "");
  }
  return "Não foi possível carregar as comunicações agora. Tente novamente.";
}

function submitFailureMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  if (raw && !/failed to fetch|networkerror|load failed/i.test(raw)) return raw;
  return "Não foi possível conectar agora. Tente novamente em instantes.";
}

function kindsOf(item: Communication) {
  return Array.isArray(item.allowed_response_kinds) ? item.allowed_response_kinds : [];
}

export default function ClientRenewalPage() {
  const { activeAccount, loading: spaceLoading, notice: spaceNotice, reload } = useClientSpace();
  const [read, setRead] = useState<RenewalRead | null>(null);
  const [readError, setReadError] = useState<RenewalReadError | null>(null);
  const [readLoading, setReadLoading] = useState(false);
  const latestRequest = useRef(0);
  const [selectedId, setSelectedId] = useState("");
  const [kind, setKind] = useState("");
  const [message, setMessage] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const keyRef = useRef("");

  const load = useCallback(async (accountId: string) => {
    const requestId = ++latestRequest.current;
    setReadLoading(true);
    setReadError(null);
    try {
      const response = await workspaceFetch(`/api/client/renewal-communications?account=${encodeURIComponent(accountId)}`, { cache: "no-store" });
      const data = await response.json() as Payload;
      // Um 200 com corpo inesperado não é "nenhuma comunicação" nem "nenhum
      // vencimento": é falha de leitura, declarada sem apagar a última leitura.
      if (!Array.isArray(data.communications) || !Array.isArray(data.responses)
        || !data.renewalDates || !Array.isArray(data.renewalDates.contracts) || !Array.isArray(data.renewalDates.crmRenewals)
        || typeof data.renewalDates.as_of !== "string" || typeof data.renewalDates.note !== "string"
        || !data.accessRestriction || typeof data.accessRestriction.restricted !== "boolean") {
        throw new Error("A resposta não trouxe as comunicações e as datas da conta. Tente novamente.");
      }
      if (requestId !== latestRequest.current) return;
      setRead({ accountId, communications: data.communications, responses: data.responses, renewalDates: data.renewalDates, accessRestriction: data.accessRestriction, readAt: new Date().toISOString() });
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
    setKind("");
    setMessage("");
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
  const communications = currentRead ? currentRead.communications : [];
  const myResponses = currentRead ? currentRead.responses : [];
  const selected = communications.find(item => item.id === selectedId) || null;
  const respondedKinds = (communicationId: string) =>
    myResponses.filter(item => item.communication_id === communicationId).map(item => item.response_kind);
  const availableKinds = selected
    ? kindsOf(selected).filter(item => !respondedKinds(selected.id).includes(item))
    : [];
  const actionable = communications.filter(item =>
    kindsOf(item).some(k => !respondedKinds(item.id).includes(k)));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeAccount || busy) return;
    const accountId = activeAccount.id;
    // Defesa em profundidade: o servidor já recusa comunicação alheia, mas a
    // UI não deve enviar um communication_id que não veio da conta ativa.
    if (!currentRead || !currentRead.communications.some(item => item.id === selectedId)) {
      setSubmitError("A comunicação selecionada não pertence a esta conta. Selecione novamente.");
      return;
    }
    setBusy(true);
    setSubmitError("");
    setSuccess("");
    try {
      if (!keyRef.current) keyRef.current = newIdempotencyKey();
      const trimmed = message.trim();
      // fetch direto: workspaceFetch consumiria o corpo do 409/400 e o mapa de
      // mensagens nunca seria alcançado.
      const response = await fetch("/api/client/renewal-communications", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": keyRef.current },
        body: JSON.stringify({ communication_id: selectedId, response_kind: kind, message: trimmed.length > 0 ? trimmed : undefined }),
      });
      const data = await response.json().catch(() => ({})) as { response?: MyResponse; error?: string; replayed?: boolean };
      if (!response.ok || !data.response) {
        const messages: Record<string, string> = {
          response_already_registered: "Esta manifestação já está registrada para esta comunicação.",
          response_kind_not_allowed_for_type: "Este tipo de comunicação não aceita esta manifestação.",
          idempotency_key_reused: "Esta tentativa conflitou com outra manifestação. Recarregue a página.",
          forbidden: "A comunicação selecionada não está disponível no seu vínculo.",
          message_5_1000: "A mensagem opcional precisa ter entre 5 e 1000 caracteres.",
          invalid_reference: "A comunicação selecionada não é válida. Selecione novamente.",
          invalid_response_kind: "Escolha uma das manifestações disponíveis para esta comunicação.",
          idempotency_key_required: "Não foi possível validar este envio. Recarregue a página.",
          invalid_request: "Não foi possível entender a manifestação enviada. Revise os campos.",
          body_too_large: "A mensagem enviada é muito longa. Reduza o texto.",
          origin_forbidden: "Esta tentativa foi recusada por segurança. Recarregue a página.",
          client_session_required: "Sua sessão expirou. Entre novamente para registrar a manifestação.",
          renewal_communication_unavailable: "O serviço de comunicações está indisponível. Tente novamente em instantes.",
        };
        throw new Error(messages[data.error || ""] || "Não foi possível registrar a manifestação.");
      }
      setSuccess(payloadNote(data.replayed));
      setSelectedId("");
      setKind("");
      setMessage("");
      keyRef.current = newIdempotencyKey();
      await load(accountId);
    } catch (error) {
      setSubmitError(submitFailureMessage(error));
      // A chave é preservada: um retry após queda de conexão não duplica a manifestação.
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
  const inactiveLabel = activeAccount.status === "suspended" ? "suspenso" : "encerrado";

  return <>
    {currentRead?.accessRestriction.restricted ? (
      <section className={appStyles.sectionCard} aria-labelledby="restriction-title">
        <h1 id="restriction-title" className={appStyles.sectionTitle}>Restrição de acesso declarada</h1>
        <div className={appStyles.suspendedNote}>
          Motivo registrado: {currentRead.accessRestriction.reason}. Origem: comunicação de encerramento
          {currentRead.accessRestriction.protocol ? ` ${currentRead.accessRestriction.protocol}` : ""} registrada em {currentRead.accessRestriction.origin}.
          Nenhuma restrição é aplicada por inadimplência isoladamente.
        </div>
      </section>
    ) : null}

    <section className={appStyles.sectionCard} aria-labelledby="renewal-answer-title" aria-busy={readLoading}>
      <span className={styles.badge}><RefreshCw size={12} aria-hidden="true" />{activeAccount.display_name}</span>
      <h1 id="renewal-answer-title" className={appStyles.sectionTitle}>Renovação e comunicação contratual</h1>
      <p className={appStyles.sectionHint}>Registre ciência das comunicações da sua conta e, quando o tipo permitir, manifeste interesse em renovar ou peça contato. A manifestação não renova contrato, não cria cobrança e não altera valor.</p>
      {inactive ? <div className={appStyles.suspendedNote}>Este cadastro não está ativo para novas manifestações.</div>
      : readLoading || !currentRead ? (
        <div className={appStyles.loadingWrapWide} role={currentError ? undefined : "status"}>
          <span className={styles.spinner} aria-hidden="true" />
          {currentError ? "Aguardando uma leitura concluída…" : "Carregando comunicações para manifestação…"}
        </div>
      ) : actionable.length === 0 ? <div className={appStyles.emptyState}>Nenhuma comunicação aguardando manifestação nesta conta.</div> : (
        <form className={appStyles.formGrid} onSubmit={submit}>
          <label>Comunicação
            <select className={appStyles.select} required value={selectedId} onChange={event => { setSelectedId(event.target.value); setKind(""); }}>
              <option value="">Selecione a comunicação</option>
              {actionable.map(item => <option key={item.id} value={item.id}>{item.protocol} · {typeLabel[item.comm_type] || item.comm_type} · {item.title}</option>)}
            </select>
          </label>
          <label>Manifestação
            <select className={appStyles.select} required value={kind} onChange={event => setKind(event.target.value)} disabled={!selected}>
              <option value="">Selecione a manifestação</option>
              {availableKinds.map(item => <option key={item} value={item}>{kindLabel[item] || item}</option>)}
            </select>
          </label>
          <label>Mensagem (opcional)
            <textarea className={appStyles.textarea} maxLength={1000} value={message} onChange={event => setMessage(event.target.value)} placeholder="Se quiser, acrescente um contexto (5 a 1000 caracteres). A mensagem fica registrada junto da manifestação." />
            <span className={appStyles.charCounter}>{message.length}/1000</span>
          </label>
          {submitError ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{submitError}</p> : null}
          {success ? <p className={styles.message} role="status">{success}</p> : null}
          <button className={styles.submit} type="submit" disabled={busy || !selectedId || !kind}><Send size={15} aria-hidden="true" />{busy ? "Enviando…" : "Registrar manifestação"}</button>
        </form>
      )}
      {currentError && currentRead ? <p className={appStyles.sectionHint}>O formulário usa a última leitura concluída; uma nova consulta falhou.</p> : null}
    </section>

    <section className={appStyles.sectionCard} aria-labelledby="renewal-list-title" aria-busy={readLoading}>
      <h2 id="renewal-list-title" className={appStyles.sectionTitle}>Comunicações da conta</h2>
      <p className={appStyles.sectionHint}>Somente comunicações registradas e enviadas para esta conta. Nada é gerado para preencher a tela.</p>
      {inactive ? (
        <div className={appStyles.suspendedNote}>Cadastro {inactiveLabel}. As comunicações não são exibidas enquanto a situação não é regularizada.</div>
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
              {currentError ? "Aguardando uma leitura concluída…" : "Carregando comunicações…"}
            </div>
          ) : currentRead.communications.length === 0 ? (
            <div className={appStyles.emptyState}>Nenhuma comunicação de renovação registrada para esta conta.</div>
          ) : (
            <ul className={appStyles.list}>{currentRead.communications.map(item => <li className={appStyles.listItem} key={item.id}>
              <div className={appStyles.listItemMain}>
                <p className={appStyles.listItemTitle}>{typeLabel[item.comm_type] || item.comm_type} · {item.protocol}</p>
                <p className={appStyles.listItemMeta}>Enviada em {new Date(item.sent_at).toLocaleString("pt-BR")}{item.contract_title ? ` · contrato ${item.contract_title}` : ""}{item.contract_ends_on ? ` · vigência até ${formatDate(item.contract_ends_on)} (client_contracts.ends_on)` : item.contract_id ? " · contrato sem data de término registrada" : ""}</p>
              </div>
              <span className={`${appStyles.chip} ${appStyles.chipOpen}`}>{item.title}</span>
              <p className={appStyles.listItemDetail}>{item.content}</p>
              {item.is_blocking && item.block_reason ? <div className={appStyles.suspendedNote}>Comunicação de encerramento com restrição declarada. Motivo: {item.block_reason}</div> : null}
              {currentRead.responses.filter(r => r.communication_id === item.id).map(r => (
                <div className={appStyles.responseBox} key={r.id}>
                  <strong>{kindDone[r.response_kind] || r.response_kind}</strong>
                  Em {new Date(r.created_at).toLocaleString("pt-BR")}.{r.message ? ` Mensagem: ${r.message}` : ""}
                </div>
              ))}
            </li>)}</ul>
          )}
        </>
      )}
    </section>

    <section className={appStyles.sectionCard} aria-labelledby="renewal-dates-title" aria-busy={readLoading}>
      <h2 id="renewal-dates-title" className={appStyles.sectionTitle}>Vencimentos e renovações registrados</h2>
      {inactive ? (
        <div className={appStyles.suspendedNote}>Cadastro {inactiveLabel}. As datas não são exibidas enquanto a situação não é regularizada.</div>
      ) : readLoading || !currentRead ? (
        <div className={appStyles.loadingWrapWide} role={currentError ? undefined : "status"}>
          <span className={styles.spinner} aria-hidden="true" />
          {currentError ? "Aguardando uma leitura concluída…" : "Carregando datas…"}
        </div>
      ) : (
        <>
          <p className={appStyles.sectionHint}>Data-base da consulta: {new Date(currentRead.renewalDates.as_of).toLocaleString("pt-BR")}. {currentRead.renewalDates.note}</p>
          {currentError ? <p className={appStyles.sectionHint}>Esta é a última leitura concluída; uma nova consulta falhou.</p> : null}
          {currentRead.renewalDates.contracts.length === 0 && currentRead.renewalDates.crmRenewals.length === 0
            ? <div className={appStyles.emptyState}>Nenhum contrato ou renovação com registro canônico nesta conta.</div>
            : <ul className={appStyles.list}>
                {currentRead.renewalDates.contracts.map(item => <li className={appStyles.listItem} key={item.contract_id}>
                  <div className={appStyles.listItemMain}>
                    <p className={appStyles.listItemTitle}>{item.title}</p>
                    <p className={appStyles.listItemMeta}>Fonte: {item.source}</p>
                  </div>
                  <p className={appStyles.listItemDetail}>{item.ends_on ? `Término registrado em ${formatDate(item.ends_on)}.` : "Sem data de término registrada; a ausência é declarada, não significa contrato em dia."}</p>
                </li>)}
                {currentRead.renewalDates.crmRenewals.map(item => <li className={appStyles.listItem} key={item.renewal_id}>
                  <div className={appStyles.listItemMain}>
                    <p className={appStyles.listItemTitle}>{item.title}</p>
                    <p className={appStyles.listItemMeta}>Fonte: {item.source} · situação {item.status}</p>
                  </div>
                  <p className={appStyles.listItemDetail}>{item.renewal_date ? `Renovação registrada para ${formatDate(item.renewal_date)}.` : "Sem data de renovação registrada; a ausência é declarada."}</p>
                </li>)}
              </ul>}
        </>
      )}
    </section>
  </>;
}

function payloadNote(replayed?: boolean) {
  return replayed
    ? "Manifestação recuperada: já estava registrada."
    : "Manifestação registrada. Ela não renova contrato, não cria cobrança e não altera valor.";
}
