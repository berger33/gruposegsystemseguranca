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

export default function ClientServiceRequestsPage() {
  const { activeAccount, loading: spaceLoading, notice: spaceNotice, reload } = useClientSpace();
  const [items, setItems] = useState<ServiceRequest[] | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractId, setContractId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const keyRef = useRef("");

  const load = useCallback(async (accountId: string) => {
    setLoadError("");
    setItems(null);
    try {
      const [requestResponse, contractResponse] = await Promise.all([
        workspaceFetch(`/api/client/service-requests?account=${encodeURIComponent(accountId)}`, { cache: "no-store" }),
        workspaceFetch(`/api/client/contracts?account=${encodeURIComponent(accountId)}`, { cache: "no-store" }),
      ]);
      if (!requestResponse.ok || !contractResponse.ok) throw new Error("load_failed");
      const requestData = await requestResponse.json() as { serviceRequests: ServiceRequest[] };
      const contractData = await contractResponse.json() as { contracts: Contract[] };
      setItems(requestData.serviceRequests);
      setContracts(contractData.contracts);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Não foi possível carregar as solicitações agora.");
    }
  }, []);

  useEffect(() => {
    setContractId("");
    setSubmitError("");
    setSuccess("");
    keyRef.current = newIdempotencyKey();
    if (!activeAccount || activeAccount.status !== "active") {
      setItems(null);
      setContracts([]);
      return;
    }
    void load(activeAccount.id);
  }, [activeAccount, load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeAccount || busy) return;
    setBusy(true);
    setSubmitError("");
    setSuccess("");
    try {
      if (!keyRef.current) keyRef.current = newIdempotencyKey();
      const response = await workspaceFetch("/api/client/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": keyRef.current },
        body: JSON.stringify({
          account_id: activeAccount.id,
          contract_id: contractId || null,
          title,
          description,
        }),
      });
      const data = await response.json() as { serviceRequest?: ServiceRequest; error?: string; replayed?: boolean };
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
      await load(activeAccount.id);
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
    <section className={appStyles.sectionCard} aria-labelledby="new-request-title">
      <span className={styles.badge}><CirclePlus size={12} aria-hidden="true" />{activeAccount.display_name}</span>
      <h1 id="new-request-title" className={appStyles.sectionTitle}>Solicitar serviço adicional</h1>
      <p className={appStyles.sectionHint}>Descreva a necessidade para análise comercial. A solicitação não representa aceite, contratação, cobrança ou obrigação automática.</p>
      {activeAccount.status !== "active" ? <div className={appStyles.suspendedNote}>Este cadastro não está ativo para novas solicitações.</div> : (
        <form className={appStyles.formGrid} onSubmit={submit}>
          <label>Contrato relacionado (opcional)
            <select className={appStyles.select} value={contractId} onChange={event => setContractId(event.target.value)}>
              <option value="">Sem contrato específico</option>
              {contracts.map(contract => <option key={contract.id} value={contract.id}>{contract.title} · {contract.service}</option>)}
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

    <section className={appStyles.sectionCard} aria-labelledby="requests-title">
      <h2 id="requests-title" className={appStyles.sectionTitle}>Minhas solicitações</h2>
      <p className={appStyles.sectionHint}>Somente solicitações abertas por esta identidade para a conta selecionada.</p>
      {loadError ? <p className={`${styles.message} ${styles.messageError}`} role="alert">{loadError}<button className={appStyles.retryButton} type="button" onClick={() => void load(activeAccount.id)}><RotateCw size={13} />Tentar novamente</button></p>
      : !items ? <div className={appStyles.loadingWrapWide}><span className={styles.spinner} aria-hidden="true" />Carregando solicitações…</div>
      : items.length === 0 ? <div className={appStyles.emptyState}>Nenhuma solicitação de serviço adicional registrada.</div>
      : <ul className={appStyles.list}>{items.map(item => <li className={appStyles.listItem} key={item.id}>
          <div className={appStyles.listItemMain}><p className={appStyles.listItemTitle}>{item.title}</p><p className={appStyles.listItemMeta}>{item.protocol} · {new Date(item.created_at).toLocaleString("pt-BR")}</p></div>
          <span className={`${appStyles.chip} ${appStyles.chipOpen}`}>{statusLabel[item.status] || item.status}</span>
          <p className={appStyles.listItemDetail}>{item.description}</p>
          <div className={appStyles.responseBox}><strong>Encaminhamento</strong>{item.responsible_name ? `Responsável: ${item.responsible_name}. ` : "Responsável definido no CRM. "}A oportunidade é apenas para análise comercial.</div>
        </li>)}</ul>}
    </section>
  </>;
}
