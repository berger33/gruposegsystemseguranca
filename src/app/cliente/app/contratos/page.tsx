"use client";
import {workspaceResponse,workspaceFetch} from "@/lib/workspace-response";

import { useCallback, useEffect, useRef, useState } from "react";
import { BriefcaseBusiness, Eye, EyeOff, RotateCw } from "lucide-react";
import { useClientSpace } from "../ClientSpaceProvider";
import styles from "../../RealAccess.module.css";
import appStyles from "../ClientApp.module.css";

type ContractStatus = "planned" | "active" | "suspended" | "ended";

type Contract = {
  id: string;
  title: string;
  service: string;
  summary: string | null;
  status: ContractStatus;
  starts_on: string | null;
  ends_on: string | null;
  created_at: string;
};

type ContractRead = { accountId: string; contracts: Contract[] };
type ContractReadError = { accountId: string; message: string };

// CLI-03: o detalhe publicado é uma leitura PRÓPRIA, presa à conta ativa e ao
// contrato aberto. Ele nunca reaproveita a linha da lista como se fosse o
// detalhe, e a projeção do servidor não traz `file_url` nem `storage_key`.
type PublishedItem = {
  id: string;
  item_type: string;
  title: string;
  description: string | null;
  quantity: number | null;
  unit: string | null;
};

type PublishedVigencia = {
  id: string;
  starts_on: string | null;
  ends_on: string | null;
  status: string;
};

type PublishedDocument = {
  id: string;
  category: string;
  title: string;
  description: string | null;
  file_name: string | null;
  version: number | null;
  valid_from: string | null;
  valid_to: string | null;
};

type ContractPublishedDetails = {
  contract: {
    id: string;
    title: string;
    service: string;
    status: ContractStatus;
    starts_on: string | null;
    ends_on: string | null;
    summary: string | null;
  };
  items: PublishedItem[];
  vigencias: PublishedVigencia[];
  documents: PublishedDocument[];
};

type DetailRead = { accountId: string; contractId: string; data: ContractPublishedDetails };
type DetailReadError = { accountId: string; contractId: string; message: string };

const contractStatus: Record<ContractStatus, { text: string; chip: string }> = {
  planned: { text: "Planejado", chip: appStyles.chipPlanned },
  active: { text: "Ativo", chip: appStyles.chipActive },
  suspended: { text: "Suspenso", chip: appStyles.chipSuspended },
  ended: { text: "Encerrado", chip: appStyles.chipEnded },
};

function statusOf(status: string) {
  return contractStatus[status as ContractStatus] ?? { text: "Situação não informada", chip: appStyles.chipProgress };
}

function formatDay(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString("pt-BR");
}

function formatRange(startsOn: string | null, endsOn: string | null) {
  if (!startsOn && !endsOn) return "Vigência a definir";
  if (startsOn && !endsOn) return `Desde ${formatDay(startsOn)}`;
  if (!startsOn && endsOn) return `Até ${formatDay(endsOn)}`;
  return `${formatDay(startsOn)} a ${formatDay(endsOn)}`;
}

function formatDateRange(contract: Contract) {
  return formatRange(contract.starts_on, contract.ends_on);
}

// Mensagens específicas por motivo: sem isso o 403 de escopo de contrato e o
// 404 de contrato fora do cadastro viravam o mesmo texto genérico.
function detailFailureMessage(status: number, code?: string) {
  const byCode: Record<string, string> = {
    invalid_account_id: "Não foi possível identificar este cadastro. Recarregue a página.",
    invalid_contract_id: "Não foi possível identificar este contrato. Recarregue a página.",
    forbidden: "Seu acesso não permite ver os detalhes publicados deste contrato.",
    contract_not_found: "Este contrato não está mais disponível para este cadastro.",
    client_session_required: "Sua sessão expirou. Entre novamente.",
    same_origin_required: "A solicitação foi recusada por segurança. Recarregue a página.",
  };
  if (code && byCode[code]) return byCode[code];
  if (status === 401) return "Sua sessão expirou. Entre novamente.";
  if (status === 403) return "Seu acesso não permite ver os detalhes publicados deste contrato.";
  if (status === 404) return "Este contrato não está mais disponível para este cadastro.";
  if (status >= 500) return "O serviço está indisponível. Tente novamente em instantes.";
  return "Não foi possível carregar os detalhes publicados agora. Tente novamente.";
}

export default function ClientContractsPage() {
  const { activeAccount, loading, notice, reload } = useClientSpace();
  const [read, setRead] = useState<ContractRead | null>(null);
  const [readError, setReadError] = useState<ContractReadError | null>(null);
  const [readLoading, setReadLoading] = useState(false);
  const latestRequest = useRef(0);

  const [openContractId, setOpenContractId] = useState<string | null>(null);
  const [detailRead, setDetailRead] = useState<DetailRead | null>(null);
  const [detailError, setDetailError] = useState<DetailReadError | null>(null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const latestDetailRequest = useRef(0);

  const loadContracts = useCallback(async (accountId: string) => {
    const requestId = ++latestRequest.current;
    setReadLoading(true);
    setReadError(null);
    try {
      const response = await workspaceFetch(`/api/client/contracts?account=${encodeURIComponent(accountId)}`, { cache: "no-store" });
      if (!response.ok) await workspaceResponse(response);
      const data = (await workspaceResponse(response)) as { contracts: Contract[] };
      if (requestId !== latestRequest.current) return;
      setRead({ accountId, contracts: data.contracts });
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      setReadError({ accountId, message: error instanceof Error ? error.message : "Não foi possível carregar seus contratos agora." });
    } finally {
      if (requestId !== latestRequest.current) return;
      setReadLoading(false);
    }
  }, []);

  const loadDetails = useCallback(async (accountId: string, contractId: string) => {
    const requestId = ++latestDetailRequest.current;
    setDetailLoading(contractId);
    setDetailError(null);
    try {
      // fetch direto: `workspaceFetch` consumiria o corpo do 403/404 antes do
      // mapa de mensagens, e o cliente veria só um erro genérico.
      const response = await fetch(
        `/api/client/contracts/${contractId}/published-details?account=${encodeURIComponent(accountId)}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (requestId !== latestDetailRequest.current) return;
      if (!response.ok) {
        setDetailRead(null);
        setDetailError({ accountId, contractId, message: detailFailureMessage(response.status, payload?.error) });
        return;
      }
      setDetailRead({ accountId, contractId, data: payload as unknown as ContractPublishedDetails });
    } catch {
      if (requestId !== latestDetailRequest.current) return;
      setDetailRead(null);
      setDetailError({ accountId, contractId, message: "Não foi possível carregar os detalhes publicados agora. Tente novamente." });
    } finally {
      if (requestId !== latestDetailRequest.current) return;
      setDetailLoading(null);
    }
  }, []);

  function closeDetails() {
    latestDetailRequest.current += 1;
    setOpenContractId(null);
    setDetailRead(null);
    setDetailError(null);
    setDetailLoading(null);
  }

  function toggleDetails(contractId: string) {
    if (!activeAccount || activeAccount.status !== "active") return;
    const accountId = activeAccount.id;
    if (openContractId === contractId) {
      closeDetails();
      return;
    }
    setOpenContractId(contractId);
    setDetailError(null);
    // Só reaproveita uma leitura que seja da MESMA conta e do MESMO contrato.
    const reusable = detailRead?.accountId === accountId && detailRead?.contractId === contractId;
    setDetailRead(reusable ? detailRead : null);
    setDetailLoading(null);
    latestDetailRequest.current += 1;
    if (!reusable) void loadDetails(accountId, contractId);
  }

  useEffect(() => {
    if (!activeAccount || activeAccount.status !== "active") {
      latestRequest.current += 1;
      latestDetailRequest.current += 1;
      setRead(null);
      setReadError(null);
      setReadLoading(false);
      setOpenContractId(null);
      setDetailRead(null);
      setDetailError(null);
      setDetailLoading(null);
      return;
    }
    // Troca de conta invalida qualquer detalhe aberto da conta anterior.
    latestDetailRequest.current += 1;
    setOpenContractId(null);
    setDetailRead(null);
    setDetailError(null);
    setDetailLoading(null);
    void loadContracts(activeAccount.id);
  }, [activeAccount, loadContracts]);

  const currentRead = activeAccount?.id === read?.accountId ? read : null;
  const currentError = activeAccount?.id === readError?.accountId ? readError : null;
  const currentDetail =
    activeAccount?.id === detailRead?.accountId && detailRead?.contractId === openContractId ? detailRead : null;
  const currentDetailError =
    activeAccount?.id === detailError?.accountId && detailError?.contractId === openContractId ? detailError : null;

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
        <section className={appStyles.sectionCard} aria-labelledby="contracts-title">
          <h2 id="contracts-title" className={appStyles.sectionTitle}>
            Contratos
          </h2>
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
    return (
      <div className={appStyles.emptyState}>
        Sua identidade ainda não foi vinculada a um cadastro de cliente. Assim que a equipe concluir a
        verificação cadastral, seus contratos aparecerão aqui.
      </div>
    );
  }

  return (
    <section className={appStyles.sectionCard} aria-labelledby="contracts-title" aria-busy={readLoading}>
      <span className={styles.badge}>
        <BriefcaseBusiness size={12} aria-hidden="true" />
        {activeAccount.display_name}
      </span>
      <h2 id="contracts-title" className={appStyles.sectionTitle}>
        Contratos
      </h2>
      <p className={appStyles.sectionHint}>
        Contratos registrados pela equipe para este cadastro. A lista é filtrada no servidor conforme
        o seu vínculo — sem nenhum identificador enviado de forma não verificada pelo navegador.
      </p>
      {activeAccount.scope_note ? <p className={appStyles.scopeNote}>Recorte do vínculo: {activeAccount.scope_note}</p> : null}
      {activeAccount.status !== "active" ? (
        <div className={appStyles.suspendedNote}>
          Cadastro {activeAccount.status === "suspended" ? "suspenso" : "encerrado"}. Os contratos não são
          exibidos enquanto a situação não é regularizada.
        </div>
      ) : currentError ? (
        <p className={`${styles.message} ${styles.messageError}`} role="alert">
          <span>{currentError.message}</span>
          <button
            className={appStyles.retryButton}
            type="button"
            onClick={() => activeAccount && loadContracts(activeAccount.id)}
          >
            <RotateCw size={13} aria-hidden="true" />
            Tentar novamente
          </button>
        </p>
      ) : readLoading || !currentRead ? (
        <div className={appStyles.loadingWrapWide} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          Carregando contratos…
        </div>
      ) : currentRead.contracts.length === 0 ? (
        <div className={appStyles.emptyState}>
          Nenhum contrato foi registrado ainda para este cadastro. Quando a equipe publicar os
          contratos, eles aparecerão aqui automaticamente.
        </div>
      ) : (
        <ul className={appStyles.list}>
          {currentRead.contracts.map(contract => {
            const status = contractStatus[contract.status];
            const isOpen = openContractId === contract.id;
            const isLoadingDetail = detailLoading === contract.id && isOpen;
            return (
              <li key={contract.id} className={appStyles.listItem}>
                <div className={appStyles.listItemMain}>
                  <p className={appStyles.listItemTitle}>{contract.title}</p>
                  <p className={appStyles.listItemMeta}>
                    {contract.service} · {formatDateRange(contract)}
                  </p>
                </div>
                <span className={`${appStyles.chip} ${status.chip}`}>{status.text}</span>
                {contract.summary ? <p className={appStyles.listItemDetail}>{contract.summary}</p> : null}
                <div className={appStyles.inlineAction}>
                  <button
                    className={appStyles.downloadButton}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`contract-published-details-${contract.id}`}
                    onClick={() => toggleDetails(contract.id)}
                  >
                    {isOpen ? (
                      <>
                        <EyeOff size={13} aria-hidden="true" />
                        Ocultar detalhes publicados
                      </>
                    ) : (
                      <>
                        <Eye size={13} aria-hidden="true" />
                        Ver detalhes publicados
                      </>
                    )}
                  </button>
                </div>
                {isOpen ? (
                  <div
                    className={appStyles.inlineAction}
                    id={`contract-published-details-${contract.id}`}
                    role="region"
                    aria-label={`Detalhes publicados do contrato ${contract.title}`}
                    aria-busy={isLoadingDetail}
                  >
                    {currentDetailError ? (
                      <p className={`${styles.message} ${styles.messageError}`} role="alert">
                        <span>{currentDetailError.message}</span>
                        <button
                          className={appStyles.retryButton}
                          type="button"
                          onClick={() => loadDetails(activeAccount.id, contract.id)}
                        >
                          <RotateCw size={13} aria-hidden="true" />
                          Tentar novamente
                        </button>
                      </p>
                    ) : isLoadingDetail || !currentDetail ? (
                      <p className={appStyles.listItemMeta} role="status">
                        Carregando detalhes publicados…
                      </p>
                    ) : (
                      <>
                        <div className={appStyles.metaGrid}>
                          <div className={appStyles.metaItem}>
                            <span>Serviço</span>
                            <strong>{currentDetail.data.contract.service || "Não informado"}</strong>
                          </div>
                          <div className={appStyles.metaItem}>
                            <span>Situação</span>
                            <strong>{statusOf(currentDetail.data.contract.status).text}</strong>
                          </div>
                          <div className={appStyles.metaItem}>
                            <span>Vigência do contrato</span>
                            <strong>
                              {formatRange(currentDetail.data.contract.starts_on, currentDetail.data.contract.ends_on)}
                            </strong>
                          </div>
                          <div className={appStyles.metaItem}>
                            <span>Vigências vigentes</span>
                            <strong>{currentDetail.data.vigencias.length}</strong>
                          </div>
                        </div>

                        <div>
                          <p className={appStyles.listItemTitle}>Itens de serviço publicados</p>
                          {currentDetail.data.items.length === 0 ? (
                            <p className={appStyles.listItemMeta}>
                              Nenhum item de serviço foi publicado para este contrato.
                            </p>
                          ) : (
                            <ul className={appStyles.list}>
                              {currentDetail.data.items.map(item => (
                                <li key={item.id} className={appStyles.listItem}>
                                  <div className={appStyles.listItemMain}>
                                    <p className={appStyles.listItemTitle}>{item.title}</p>
                                    <p className={appStyles.listItemMeta}>
                                      {item.item_type}
                                      {item.quantity !== null
                                        ? ` · ${item.quantity}${item.unit ? ` ${item.unit}` : ""}`
                                        : ""}
                                    </p>
                                  </div>
                                  {item.description ? (
                                    <p className={appStyles.listItemDetail}>{item.description}</p>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div>
                          <p className={appStyles.listItemTitle}>Vigências vigentes</p>
                          {currentDetail.data.vigencias.length === 0 ? (
                            <p className={appStyles.listItemMeta}>
                              Nenhuma vigência está ativa nesta data.
                            </p>
                          ) : (
                            <ul className={appStyles.list}>
                              {currentDetail.data.vigencias.map(vigencia => (
                                <li key={vigencia.id} className={appStyles.listItem}>
                                  <div className={appStyles.listItemMain}>
                                    <p className={appStyles.listItemTitle}>
                                      {formatRange(vigencia.starts_on, vigencia.ends_on)}
                                    </p>
                                    <p className={appStyles.listItemMeta}>Situação registrada: {vigencia.status}</p>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div>
                          <p className={appStyles.listItemTitle}>Documentos publicados</p>
                          {currentDetail.data.documents.length === 0 ? (
                            <p className={appStyles.listItemMeta}>
                              Nenhum documento foi publicado para este contrato.
                            </p>
                          ) : (
                            <>
                              <ul className={appStyles.list}>
                                {currentDetail.data.documents.map(document => (
                                  <li key={document.id} className={appStyles.listItem}>
                                    <div className={appStyles.listItemMain}>
                                      <p className={appStyles.listItemTitle}>{document.title}</p>
                                      <p className={appStyles.listItemMeta}>
                                        {document.category}
                                        {document.version !== null ? ` · versão ${document.version}` : ""}
                                        {` · válido de ${formatDay(document.valid_from)} a ${formatDay(document.valid_to)}`}
                                      </p>
                                    </div>
                                    {document.description ? (
                                      <p className={appStyles.listItemDetail}>{document.description}</p>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                              {/* Honestidade: o detalhe publicado não devolve link
                                  nem chave de arquivo — o download não é oferecido aqui. */}
                              <p className={appStyles.listItemMeta}>
                                O arquivo destes documentos é entregue pela equipe. Esta consulta mostra
                                somente o registro publicado, sem link de download.
                              </p>
                            </>
                          )}
                        </div>
                      </>
                    )}
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
