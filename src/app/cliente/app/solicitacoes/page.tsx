"use client";
import {workspaceFetch} from "@/lib/workspace-response";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CirclePlus, RotateCw, Send } from "lucide-react";
import { useClientSpace } from "../ClientSpaceProvider";
import styles from "../../RealAccess.module.css";
import appStyles from "../ClientApp.module.css";

type Contract = { id: string; title: string; service: string; status: string };
type ServiceRequest = {
  id: string;
  protocol: string;
  contract_id: string | null;
  title: string;
  description: string;
  status: string;
  responsible_name: string | null;
  crm_opportunity_id: string | null;
  created_at: string;
};

// UX-PRO-ID3: service-requests e contracts são lidos em paralelo, mas as duas
// listas pertencem à MESMA conta ativa. Sem esse vínculo, o <select> chegava a
// oferecer contrato de A enquanto B estava selecionada.
type RequestsRead = { accountId: string; items: ServiceRequest[]; contracts: Contract[]; readAt: string };
type RequestsReadError = { accountId: string; message: string };

const statusLabel: Record<string, string> = {
  solicitada: "Solicitada",
  em_analise: "Em análise",
  aprovada: "Aprovada",
  rejeitada: "Não aprovada",
  convertida_crm: "Encaminhada ao comercial",
  cancelada: "Cancelada",
};

function newIdempotencyKey() {
  return `cli10-${crypto.randomUUID()}`;
}

function readFailureMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  // workspaceFetch já traduz HTTP em português; removemos apenas o sufixo
  // técnico (código interno) para não vazar identificadores ao cliente.
  if (/^Sua sessão|^Seu acesso|^O registro|^O serviço|^Confira/.test(raw)) {
    return raw.replace(/\s*\(HTTP \d+, [^)]*\)$/, "");
  }
  if (raw.startsWith("A resposta")) return raw;
  return "Não foi possível carregar as solicitações agora. Tente novamente.";
}

function formatReadTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "horário não informado" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function ClientServiceRequestsPage() {
  const { activeAccount, loading: spaceLoading, notice: spaceNotice, reload } = useClientSpace();
  const [read, setRead] = useState<RequestsRead | null>(null);
  const [readError, setReadError] = useState<RequestsReadError | null>(null);
  const [readLoading, setReadLoading] = useState(false);
  const latestRequest = useRef(0);
  const [contractId, setContractId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const keyRef = useRef("");

  const load = useCallback(async (accountId: string) => {
    const requestId = ++latestRequest.current;
    setReadLoading(true);
    setReadError(null);
    try {
      const [requestResponse, contractResponse] = await Promise.all([
        workspaceFetch(`/api/client/service-requests?account=${encodeURIComponent(accountId)}`, { cache: "no-store" }),
        workspaceFetch(`/api/client/contracts?account=${encodeURIComponent(accountId)}`, { cache: "no-store" }),
      ]);
      const requestData = await requestResponse.json() as { serviceRequests: ServiceRequest[] };
      const contractData = await contractResponse.json() as { contracts: Contract[] };
      // Um 200 com corpo inesperado não é "nenhuma solicitação": é falha de leitura.
      if (!Array.isArray(requestData.serviceRequests) || !Array.isArray(contractData.contracts)) {
        throw new Error("A resposta não trouxe as listas esperadas. Tente novamente.");
      }
      if (requestId !== latestRequest.current) return;
      setRead({ accountId, items: requestData.serviceRequests, contracts: contractData.contracts, readAt: new Date().toISOString() });
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      setReadError({ accountId, message: readFailureMessage(error) });
    } finally {
      if (requestId !== latestRequest.current) return;
      setReadLoading(false);
    }
  }, []);

  useEffect(() => {
    setContractId("");
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeAccount || busy) return;
    const accountId = activeAccount.id;
    // Defesa em profundidade: o servidor já recusa contrato de outra conta, mas
    // a UI não deve enviar uma opção que não veio da leitura da conta ativa.
    if (contractId && !currentRead?.contracts.some(contract => contract.id === contractId)) {
      setSubmitError("O contrato selecionado não pertence a esta conta. Selecione novamente.");
      return;
    }
    setBusy(true);
    setSubmitError("");
    setSuccess("");
    try {
      if (!keyRef.current) keyRef.current = newIdempotencyKey();
      // fetch direto (sem workspaceFetch) para poder ler o corpo de erro e
      // traduzir os motivos do POST sem consumir o body duas vezes.
      const response = await fetch("/api/client/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": keyRef.current },
        body: JSON.stringify({
          account_id: accountId,
          contract_id: contractId || null,
          title,
          description,
        }),
      });
      const data = await response.json().catch(() => ({})) as { serviceRequest?: ServiceRequest; error?: string; replayed?: boolean };
      if (!response.ok || !data.serviceRequest) {
        const messages: Record<string, string> = {
          crm_company_link_required: "O cadastro ainda precisa ser vinculado ao CRM pela equipe.",
          crm_responsible_required: "A equipe ainda precisa definir o responsável comercial desta conta.",
          contract_forbidden: "O contrato selecionado não está disponível no seu vínculo.",
          idempotency_key_reused: "Esta tentativa conflitou com outra solicitação. Recarregue a página.",
        };
        throw new Error(messages[data.error || ""] || "Não foi possível registrar a solicitação.");
      }
      setSuccess(`${data.replayed ? "Solicitação recuperada" : "Solicitação registrada"}: protocolo ${data.serviceRequest.protocol}.`);
      setTitle("");
      setDescription("");
      setContractId("");
      keyRef.current = newIdempotencyKey();
      await load(accountId);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível registrar a solicitação.");
      // A mesma chave é preservada para que um retry após perda de conexão não duplique a solicitação.
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
    <section className={appStyles.sectionCard} aria-labelledby="new-request-title" aria-busy={readLoading}>
      <span className={styles.badge}><CirclePlus size={12} aria-hidden="true" />{activeAccount.display_name}</span>
      <h1 id="new-request-title" className={appStyles.sectionTitle}>Solicitar serviço adicional</h1>
      <p className={appStyles.sectionHint}>Descreva a necessidade para análise comercial. A solicitação não representa aceite, contratação, cobrança ou obrigação automática.</p>
      {activeAccount.status !== "active" ? <div className={appStyles.suspendedNote}>Este cadastro não está ativo para novas solicitações.</div> : (
        <form className={appStyles.formGrid} onSubmit={submit}>
          <label>Contrato relacionado (opcional)
            <select className={appStyles.select} value={contractId} onChange={event => setContractId(event.target.value)}>
              <option value="">Sem contrato específico</option>
              {currentRead ? currentRead.contracts.map(contract => <option key={contract.id} value={contract.id}>{contract.title} · {contract.service}</option>) : null}
            </select>
          </label>
          <label>Título
            <input className={appStyles.inputLike} required minLength={5} maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="Ex.: ampliar cobertura de portaria" />
          </label>
          <label>Detalhes da necessidade
            <textarea className={appStyles.textarea} required minLength={10} maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} placeholder="Informe local, necessidade e contexto. A equipe confirmará o escopo antes de qualquer contratação." />
            <span className={appStyles.charCounter}>{description.length}/2000</span>
          </label>
          {submitError ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{submitError}</p> : null}
          {success ? <p className={styles.message} role="status">{success}</p> : null}
          <button className={styles.submit} type="submit" disabled={busy}><Send size={15} aria-hidden="true" />{busy ? "Enviando…" : "Enviar para análise"}</button>
        </form>
      )}
    </section>

    <section className={appStyles.sectionCard} aria-labelledby="requests-title" aria-busy={readLoading}>
      <h2 id="requests-title" className={appStyles.sectionTitle}>Minhas solicitações</h2>
      <p className={appStyles.sectionHint}>Somente solicitações abertas por esta identidade para a conta selecionada.</p>
      {activeAccount.status !== "active" ? (
        <div className={appStyles.suspendedNote}>Cadastro {activeAccount.status === "suspended" ? "suspenso" : "encerrado"}. As solicitações não são exibidas enquanto a situação não é regularizada.</div>
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
              {currentError ? "Aguardando uma leitura concluída…" : "Carregando solicitações…"}
            </div>
          ) : currentRead.items.length === 0 ? (
            <div className={appStyles.emptyState}>Nenhuma solicitação de serviço adicional registrada.</div>
          ) : (
            <ul className={appStyles.list}>{currentRead.items.map(item => <li className={appStyles.listItem} key={item.id}>
              <div className={appStyles.listItemMain}><p className={appStyles.listItemTitle}>{item.title}</p><p className={appStyles.listItemMeta}>{item.protocol} · {new Date(item.created_at).toLocaleString("pt-BR")}</p></div>
              <span className={`${appStyles.chip} ${appStyles.chipOpen}`}>{statusLabel[item.status] || item.status}</span>
              <p className={appStyles.listItemDetail}>{item.description}</p>
              <div className={appStyles.responseBox}><strong>Encaminhamento</strong>{item.responsible_name ? `Responsável: ${item.responsible_name}. ` : "Responsável definido no CRM. "}A oportunidade é apenas para análise comercial.</div>
            </li>)}</ul>
          )}
        </>
      )}
    </section>
  </>;
}
