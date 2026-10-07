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

export default function ClientRenewalPage() {
  const { activeAccount, loading: spaceLoading, notice: spaceNotice, reload } = useClientSpace();
  const [data, setData] = useState<Payload | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [kind, setKind] = useState("");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const keyRef = useRef("");

  const load = useCallback(async (accountId: string) => {
    setLoadError("");
    setData(null);
    try {
      const response = await workspaceFetch(`/api/client/renewal-communications?account=${encodeURIComponent(accountId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load_failed");
      const payload = await response.json() as Payload;
      setData(payload);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Não foi possível carregar as comunicações agora.");
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
      setData(null);
      return;
    }
    void load(activeAccount.id);
  }, [activeAccount, load]);

  const communications = data?.communications || [];
  const myResponses = data?.responses || [];
  const selected = communications.find(item => item.id === selectedId) || null;
  const respondedKinds = (communicationId: string) =>
    myResponses.filter(item => item.communication_id === communicationId).map(item => item.response_kind);
  const availableKinds = selected
    ? selected.allowed_response_kinds.filter(item => !respondedKinds(selected.id).includes(item))
    : [];
  const actionable = communications.filter(item =>
    item.allowed_response_kinds.some(k => !respondedKinds(item.id).includes(k)));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeAccount || busy) return;
    setBusy(true);
    setSubmitError("");
    setSuccess("");
    try {
      if (!keyRef.current) keyRef.current = newIdempotencyKey();
      const trimmed = message.trim();
      const response = await workspaceFetch("/api/client/renewal-communications", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": keyRef.current },
        body: JSON.stringify({ communication_id: selectedId, response_kind: kind, message: trimmed.length > 0 ? trimmed : undefined }),
      });
      const payload = await response.json() as { response?: MyResponse; error?: string; replayed?: boolean };
      if (!response.ok || !payload.response) {
        const messages: Record<string, string> = {
          response_already_registered: "Esta manifestação já está registrada para esta comunicação.",
          response_kind_not_allowed_for_type: "Este tipo de comunicação não aceita esta manifestação.",
          idempotency_key_reused: "Esta tentativa conflitou com outra manifestação. Recarregue a página.",
          forbidden: "A comunicação selecionada não está disponível no seu vínculo.",
          message_5_1000: "A mensagem opcional precisa ter entre 5 e 1000 caracteres.",
        };
        throw new Error(messages[payload.error || ""] || "Não foi possível registrar a manifestação.");
      }
      setSuccess(payload.replayed ? "Manifestação recuperada: já estava registrada." : "Manifestação registrada. Ela não renova contrato, não cria cobrança e não altera valor.");
      setSelectedId("");
      setKind("");
      setMessage("");
      keyRef.current = newIdempotencyKey();
      await load(activeAccount.id);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível registrar a manifestação.");
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

  return <>
    {data?.accessRestriction.restricted ? (
      <section className={appStyles.sectionCard} aria-labelledby="restriction-title">
        <h1 id="restriction-title" className={appStyles.sectionTitle}>Restrição de acesso declarada</h1>
        <div className={appStyles.suspendedNote}>
          Motivo registrado: {data.accessRestriction.reason}. Origem: comunicação de encerramento
          {data.accessRestriction.protocol ? ` ${data.accessRestriction.protocol}` : ""} registrada em {data.accessRestriction.origin}.
          Nenhuma restrição é aplicada por inadimplência isoladamente.
        </div>
      </section>
    ) : null}

    <section className={appStyles.sectionCard} aria-labelledby="renewal-answer-title">
      <span className={styles.badge}><RefreshCw size={12} aria-hidden="true" />{activeAccount.display_name}</span>
      <h1 id="renewal-answer-title" className={appStyles.sectionTitle}>Renovação e comunicação contratual</h1>
      <p className={appStyles.sectionHint}>Registre ciência das comunicações da sua conta e, quando o tipo permitir, manifeste interesse em renovar ou peça contato. A manifestação não renova contrato, não cria cobrança e não altera valor.</p>
      {activeAccount.status !== "active" ? <div className={appStyles.suspendedNote}>Este cadastro não está ativo para novas manifestações.</div>
      : !data ? null
      : actionable.length === 0 ? <div className={appStyles.emptyState}>Nenhuma comunicação aguardando manifestação nesta conta.</div> : (
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
    </section>

    <section className={appStyles.sectionCard} aria-labelledby="renewal-list-title">
      <h2 id="renewal-list-title" className={appStyles.sectionTitle}>Comunicações da conta</h2>
      <p className={appStyles.sectionHint}>Somente comunicações registradas e enviadas para esta conta. Nada é gerado para preencher a tela.</p>
      {loadError ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{loadError}<button className={appStyles.retryButton} type="button" onClick={() => void load(activeAccount.id)}><RotateCw size={13} />Tentar novamente</button></p>
      : !data ? <div className={appStyles.loadingWrapWide}><span className={styles.spinner} aria-hidden="true" />Carregando comunicações…</div>
      : communications.length === 0 ? <div className={appStyles.emptyState}>Nenhuma comunicação de renovação registrada para esta conta.</div>
      : <ul className={appStyles.list}>{communications.map(item => <li className={appStyles.listItem} key={item.id}>
          <div className={appStyles.listItemMain}>
            <p className={appStyles.listItemTitle}>{typeLabel[item.comm_type] || item.comm_type} · {item.protocol}</p>
            <p className={appStyles.listItemMeta}>Enviada em {new Date(item.sent_at).toLocaleString("pt-BR")}{item.contract_title ? ` · contrato ${item.contract_title}` : ""}{item.contract_ends_on ? ` · vigência até ${formatDate(item.contract_ends_on)} (client_contracts.ends_on)` : item.contract_id ? " · contrato sem data de término registrada" : ""}</p>
          </div>
          <span className={`${appStyles.chip} ${appStyles.chipOpen}`}>{item.title}</span>
          <p className={appStyles.listItemDetail}>{item.content}</p>
          {item.is_blocking && item.block_reason ? <div className={appStyles.suspendedNote}>Comunicação de encerramento com restrição declarada. Motivo: {item.block_reason}</div> : null}
          {myResponses.filter(r => r.communication_id === item.id).map(r => (
            <div className={appStyles.responseBox} key={r.id}>
              <strong>{kindDone[r.response_kind] || r.response_kind}</strong>
              Em {new Date(r.created_at).toLocaleString("pt-BR")}.{r.message ? ` Mensagem: ${r.message}` : ""}
            </div>
          ))}
        </li>)}</ul>}
    </section>

    <section className={appStyles.sectionCard} aria-labelledby="renewal-dates-title">
      <h2 id="renewal-dates-title" className={appStyles.sectionTitle}>Vencimentos e renovações registrados</h2>
      {!data ? (loadError ? null : <div className={appStyles.loadingWrapWide}><span className={styles.spinner} aria-hidden="true" />Carregando datas…</div>) : <>
        <p className={appStyles.sectionHint}>Data-base da consulta: {new Date(data.renewalDates.as_of).toLocaleString("pt-BR")}. {data.renewalDates.note}</p>
        {data.renewalDates.contracts.length === 0 && data.renewalDates.crmRenewals.length === 0
          ? <div className={appStyles.emptyState}>Nenhum contrato ou renovação com registro canônico nesta conta.</div>
          : <ul className={appStyles.list}>
              {data.renewalDates.contracts.map(item => <li className={appStyles.listItem} key={item.contract_id}>
                <div className={appStyles.listItemMain}>
                  <p className={appStyles.listItemTitle}>{item.title}</p>
                  <p className={appStyles.listItemMeta}>Fonte: {item.source}</p>
                </div>
                <p className={appStyles.listItemDetail}>{item.ends_on ? `Término registrado em ${formatDate(item.ends_on)}.` : "Sem data de término registrada; a ausência é declarada, não significa contrato em dia."}</p>
              </li>)}
              {data.renewalDates.crmRenewals.map(item => <li className={appStyles.listItem} key={item.renewal_id}>
                <div className={appStyles.listItemMain}>
                  <p className={appStyles.listItemTitle}>{item.title}</p>
                  <p className={appStyles.listItemMeta}>Fonte: {item.source} · situação {item.status}</p>
                </div>
                <p className={appStyles.listItemDetail}>{item.renewal_date ? `Renovação registrada para ${formatDate(item.renewal_date)}.` : "Sem data de renovação registrada; a ausência é declarada."}</p>
              </li>)}
            </ul>}
      </>}
    </section>
  </>;
}
