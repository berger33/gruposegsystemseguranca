"use client";

import UiBadge, { type UiBadgeTone } from "@/components/ui/UiBadge";
import UiState from "@/components/ui/UiState";
import UiTableScroll from "@/components/ui/UiTableScroll";
import UiTaskWorkspace from "@/components/ui/UiTaskWorkspace";
import styles from "@/components/ui/UiWorkspace.module.css";
import {
  assetErrorDetail,
  assetRequest,
  invalidAssetResponse,
  type AssetErrorDescriptor,
} from "@/lib/asset-request";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

type Tab = "produtos" | "reservas" | "ativos" | "os" | "inventarios" | "requisicoes";

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit_measure: string;
  stock_current: number;
  stock_min: number;
  location?: string;
}

interface Reservation {
  id: string;
  product_id: string;
  product_name?: string;
  quantity: number;
  reservation_type: string;
  reference_type: string;
  reference_id: string;
  status: string;
}

interface Asset {
  id: string;
  product_name?: string;
  serial_number: string;
  owner_name: string;
  owner_type: string;
  status: string;
  warranty_until?: string;
}

interface Requisition {
  id: string;
  protocol: string;
  product_name?: string;
  quantity: number;
  requester_name: string;
  urgency: string;
  status: string;
  reason: string;
}

interface ServiceOrder {
  id: string;
  protocol: string;
  title: string;
  requester_name: string;
  technician_name?: string;
  priority: string;
  status: string;
  diagnosis?: string;
}

interface Inventory {
  id: string;
  protocol: string;
  title: string;
  location: string;
  status: string;
}

type AssetItem = Product | Reservation | Asset | Requisition | ServiceOrder | Inventory;
type ResourceState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "failed"; error: AssetErrorDescriptor }
  | {
      phase: "ready";
      items: AssetItem[];
      readAt: string;
      refreshing: boolean;
      staleError?: AssetErrorDescriptor;
    };

type TabConfig = {
  id: Tab;
  label: string;
  title: string;
  endpoint: string;
  loading: string;
  emptyTitle: string;
  emptyDetail: string;
  absence: string;
};

const TABS: readonly TabConfig[] = [
  {
    id: "produtos",
    label: "Produtos & Estoque",
    title: "Itens em Catálogo e Estoque",
    endpoint: "/api/ast/products",
    loading: "Lendo produtos e saldos de estoque…",
    emptyTitle: "A consulta foi concluída e nenhum produto está cadastrado.",
    emptyDetail: "O catálogo não é preenchido com exemplos. Atualize depois que um fluxo autorizado registrar o primeiro produto.",
    absence: "Isso não significa que o catálogo esteja vazio.",
  },
  {
    id: "reservas",
    label: "Reservas Operacionais",
    title: "Reservas de Estoque para Implantação ou Proposta",
    endpoint: "/api/ast/reservations",
    loading: "Lendo reservas de estoque…",
    emptyTitle: "A consulta foi concluída e não há reserva neste recorte.",
    emptyDetail: "Uma reserva só aparece depois de registrada por um fluxo autorizado. Atualize para consultar mudanças recentes.",
    absence: "Isso não significa que não existam reservas.",
  },
  {
    id: "ativos",
    label: "Ativos Serializados",
    title: "Ativos Serializados e Custódia Declarada",
    endpoint: "/api/ast/serialized-assets",
    loading: "Lendo ativos serializados…",
    emptyTitle: "A consulta foi concluída e nenhum ativo serializado está cadastrado.",
    emptyDetail: "Nenhum equipamento é criado automaticamente. Atualize depois de um cadastro autorizado.",
    absence: "Isso não significa que não existam ativos serializados.",
  },
  {
    id: "os",
    label: "Ordens de Serviço (OS)",
    title: "Ordens de Serviço de Manutenção",
    endpoint: "/api/ast/service-orders",
    loading: "Lendo ordens de serviço…",
    emptyTitle: "A consulta foi concluída e não há ordem de serviço cadastrada.",
    emptyDetail: "A ausência vale somente para o recorte respondido agora. Atualize depois da abertura de uma ordem.",
    absence: "Isso não significa que não existam ordens de serviço.",
  },
  {
    id: "inventarios",
    label: "Inventários Físicos",
    title: "Inventários Físicos e Ciclo de Contagem",
    endpoint: "/api/ast/inventories",
    loading: "Lendo inventários físicos…",
    emptyTitle: "A consulta foi concluída e nenhum inventário está cadastrado.",
    emptyDetail: "O sistema não cria contagens de exemplo. Atualize depois que um inventário for aberto.",
    absence: "Isso não significa que não existam inventários físicos.",
  },
  {
    id: "requisicoes",
    label: "Requisições Internas",
    title: "Requisições Internas de Material",
    endpoint: "/api/ast/requisitions",
    loading: "Lendo requisições internas…",
    emptyTitle: "A consulta foi concluída e nenhuma requisição está registrada.",
    emptyDetail: "A lista só contém solicitações persistidas. Atualize depois que um fluxo autorizado registrar uma requisição.",
    absence: "Isso não significa que não existam requisições.",
  },
] as const;

const INITIAL_RESOURCES = Object.fromEntries(TABS.map(tab => [tab.id, { phase: "idle" }])) as Record<Tab, ResourceState>;

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  reservado: "Reservada",
  liberado: "Liberada",
  convertido: "Convertida em saída",
  cancelado: "Cancelada",
  cancelada: "Cancelada",
  disponivel: "Disponível",
  em_uso: "Em uso",
  em_manutencao: "Em manutenção",
  baixado: "Baixado",
  perdida: "Perdida",
  aberta: "Aberta",
  em_execucao: "Em execução",
  aguardando_peca: "Aguardando peça",
  aguardando_aprovacao: "Aguardando aprovação",
  concluida: "Concluída",
  em_contagem: "Em contagem",
  divergente: "Com divergência",
  ajustado: "Ajustado",
  aprovado: "Aprovada",
  rejeitado: "Rejeitada",
  em_cotacao: "Em cotação",
  comprado: "Compra registrada",
  recebido: "Recebida",
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

function readable(value: string | undefined): string {
  if (!value) return "Não informado";
  return STATUS_LABELS[value] || value.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());
}

function tone(value: string): UiBadgeTone {
  if (["concluida", "aprovado", "ajustado", "recebido", "disponivel"].includes(value)) return "success";
  if (["cancelado", "cancelada", "rejeitado", "perdida", "critica"].includes(value)) return "danger";
  if (["em_manutencao", "aguardando_peca", "aguardando_aprovacao", "divergente", "alta"].includes(value)) return "warning";
  if (["aberta", "em_execucao", "em_contagem", "em_cotacao", "em_uso", "convertido"].includes(value)) return "info";
  return "neutral";
}

function readTime(value: string): string {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function Status({ value, prefix = "Situação" }: { value: string; prefix?: string }) {
  return <UiBadge tone={tone(value)} srPrefix={prefix}>{readable(value)}</UiBadge>;
}

export default function PatrimonioWorkspace() {
  const [activeTab, setActiveTab] = useState<Tab>("produtos");
  const [resources, setResources] = useState<Record<Tab, ResourceState>>(INITIAL_RESOURCES);
  const resourcesRef = useRef(resources);
  const requestIds = useRef<Record<Tab, number>>({ produtos: 0, reservas: 0, ativos: 0, os: 0, inventarios: 0, requisicoes: 0 });
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const commit = useCallback((updater: (current: Record<Tab, ResourceState>) => Record<Tab, ResourceState>) => {
    const next = updater(resourcesRef.current);
    resourcesRef.current = next;
    setResources(next);
  }, []);

  const loadData = useCallback(async (tab: Tab) => {
    const config = TABS.find(item => item.id === tab)!;
    const previous = resourcesRef.current[tab];
    const preserved = previous.phase === "ready" ? previous : null;
    const requestId = ++requestIds.current[tab];

    commit(current => ({
      ...current,
      [tab]: preserved
        ? { ...preserved, refreshing: true, staleError: undefined }
        : { phase: "loading" },
    }));

    const result = await assetRequest<{ items?: AssetItem[] }>(config.endpoint);
    if (requestIds.current[tab] !== requestId) return;

    if (!result.ok || !Array.isArray(result.data?.items)) {
      const error = result.ok ? invalidAssetResponse(result.status) : result.error;
      const failClosed = error.kind === "auth" || error.kind === "denied";
      commit(current => ({
        ...current,
        [tab]: preserved && !failClosed
          ? { ...preserved, refreshing: false, staleError: error }
          : { phase: "failed", error },
      }));
      return;
    }

    commit(current => ({
      ...current,
      [tab]: {
        phase: "ready",
        items: result.data.items,
        readAt: new Date().toISOString(),
        refreshing: false,
      },
    }));
  }, [commit]);

  useEffect(() => {
    void loadData(activeTab);
  }, [activeTab, loadData]);

  function selectTab(tab: Tab, focus = false) {
    setActiveTab(tab);
    if (focus) {
      const index = TABS.findIndex(item => item.id === tab);
      requestAnimationFrame(() => tabRefs.current[index]?.focus());
    }
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index + TABS.length - 1) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    selectTab(TABS[next].id, true);
  }

  const config = TABS.find(item => item.id === activeTab)!;
  const state = resources[activeTab];

  return (
    <UiTaskWorkspace className={styles.workspace}>
      <p className={styles.kicker}>UX-PRO-07A · PATRIMÔNIO E ALMOXARIFADO</p>
      <h1>Patrimônio, Almoxarifado e Ativos</h1>
      <p className={styles.lede}>
        Consulte estoque, reservas, custódia, manutenção, inventários e requisições. Cada aba informa se ainda está lendo,
        se a consulta falhou ou se o recorte terminou vazio; uma falha nunca é apresentada como ausência de registros.
      </p>

      <div className={styles.tabs} role="tablist" aria-label="Frentes de patrimônio e almoxarifado">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            ref={element => { tabRefs.current[index] = element; }}
            id={`patrimonio-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`patrimonio-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={activeTab === tab.id ? styles.tabActive : styles.tab}
            onClick={() => selectTab(tab.id)}
            onKeyDown={event => handleTabKey(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section
        className={`${styles.panel} ${styles.tabPanel}`}
        id={`patrimonio-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`patrimonio-tab-${activeTab}`}
        tabIndex={0}
        data-testid={`patrimonio-${activeTab}-painel`}
      >
        <div className={styles.rowWrap}>
          <div className={styles.grow}>
            <h2 className={styles.panelTitle}>{config.title}</h2>
            {state.phase === "ready" ? (
              <p className={styles.hint}>Última leitura concluída às {readTime(state.readAt)}.</p>
            ) : (
              <p className={styles.hint}>Os dados só aparecem depois de uma resposta válida do servidor.</p>
            )}
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              aria-label={`Atualizar ${config.label.replace(" & ", " e ").toLocaleLowerCase("pt-BR")}`}
              disabled={state.phase === "loading" || (state.phase === "ready" && state.refreshing)}
              onClick={() => void loadData(activeTab)}
            >
              {state.phase === "ready" && state.refreshing ? "Atualizando…" : "Atualizar dados"}
            </button>
          </div>
        </div>

        {(state.phase === "idle" || state.phase === "loading") ? (
          <div data-testid={`patrimonio-${activeTab}-carregando`}>
            <UiState
              variant="loading"
              title={config.loading}
              detail="Aguarde a resposta desta aba; nenhum vazio ou total é presumido durante a leitura."
            />
          </div>
        ) : null}

        {state.phase === "failed" ? (
          <div data-testid={`patrimonio-${activeTab}-${state.error.kind === "denied" || state.error.kind === "auth" ? "negado" : "falha"}`}>
            <UiState
              variant={state.error.kind === "denied" || state.error.kind === "auth" ? "denied" : "error"}
              title={state.error.title}
              detail={`${assetErrorDetail(state.error)} ${config.absence}`}
              onRetry={state.error.canRetry ? () => void loadData(activeTab) : undefined}
            />
          </div>
        ) : null}

        {state.phase === "ready" ? (
          <>
            {state.refreshing ? (
              <p className={`${styles.notice} ${styles.noticeInfo}`} role="status" data-testid={`patrimonio-${activeTab}-atualizando`}>
                Atualizando esta aba. O conteúdo abaixo continua sendo o da última leitura concluída às {readTime(state.readAt)}.
              </p>
            ) : null}
            {state.staleError ? (
              <div className={`${styles.notice} ${styles.noticeWarning}`} role="alert" data-testid={`patrimonio-${activeTab}-desatualizado`}>
                <strong>Não foi possível atualizar esta aba.</strong>
                <p>
                  {assetErrorDetail(state.staleError)} {config.absence} O conteúdo abaixo é da última leitura concluída às {readTime(state.readAt)} e pode estar desatualizado.
                </p>
                {state.staleError.canRetry ? (
                  <div className={styles.actions}>
                    <button type="button" onClick={() => void loadData(activeTab)}>Tentar novamente</button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {state.items.length === 0 ? (
              <div data-testid={`patrimonio-${activeTab}-vazio`}>
                <UiState variant="empty" title={config.emptyTitle} detail={config.emptyDetail} />
              </div>
            ) : renderTable(activeTab, state.items)
            }
          </>
        ) : null}
      </section>
    </UiTaskWorkspace>
  );
}

function renderTable(tab: Tab, items: AssetItem[]) {
  if (tab === "produtos") {
    const products = items as Product[];
    return (
      <div className={styles.tableWrap} data-testid="patrimonio-produtos-tabela">
        <UiTableScroll>
          <table className={styles.table}>
            <caption>{products.length} produto(s) na última leitura concluída.</caption>
            <thead><tr><th>SKU</th><th>Produto</th><th>Categoria</th><th>Unidade</th><th>Estoque atual</th><th>Estoque mínimo</th><th>Nível</th><th>Localização</th></tr></thead>
            <tbody>{products.map(product => {
              const belowMinimum = product.stock_current < product.stock_min;
              return <tr key={product.id}>
                <td><code>{product.sku}</code></td><td>{product.name}</td><td>{product.category}</td><td>{product.unit_measure}</td>
                <td>{product.stock_current}</td><td>{product.stock_min}</td>
                <td><UiBadge tone={belowMinimum ? "warning" : "success"} srPrefix="Nível de estoque">{belowMinimum ? "Abaixo do mínimo" : "Dentro do mínimo"}</UiBadge></td>
                <td>{product.location || "Não informada"}</td>
              </tr>;
            })}</tbody>
          </table>
        </UiTableScroll>
      </div>
    );
  }

  if (tab === "reservas") {
    const reservations = items as Reservation[];
    return (
      <div className={styles.tableWrap} data-testid="patrimonio-reservas-tabela"><UiTableScroll>
        <table className={styles.table}><caption>{reservations.length} reserva(s) na última leitura concluída.</caption>
          <thead><tr><th>Produto</th><th>Quantidade</th><th>Tipo</th><th>Referência</th><th>Situação</th></tr></thead>
          <tbody>{reservations.map(item => <tr key={item.id}><td>{item.product_name || item.product_id}</td><td>{item.quantity}</td><td>{readable(item.reservation_type)}</td><td>{readable(item.reference_type)} · {item.reference_id}</td><td><Status value={item.status} prefix="Situação da reserva" /></td></tr>)}</tbody>
        </table>
      </UiTableScroll></div>
    );
  }

  if (tab === "ativos") {
    const assets = items as Asset[];
    return (
      <div className={styles.tableWrap} data-testid="patrimonio-ativos-tabela"><UiTableScroll>
        <table className={styles.table}><caption>{assets.length} ativo(s) na última leitura concluída.</caption>
          <thead><tr><th>Número de série</th><th>Item</th><th>Custodiante ou titular</th><th>Garantia declarada</th><th>Situação</th></tr></thead>
          <tbody>{assets.map(item => <tr key={item.id}><td><code>{item.serial_number}</code></td><td>{item.product_name || "Equipamento sem nome retornado"}</td><td>{item.owner_name} · {readable(item.owner_type)}</td><td>{item.warranty_until ? new Date(`${item.warranty_until}T12:00:00`).toLocaleDateString("pt-BR") : "Não informada"}</td><td><Status value={item.status} prefix="Situação do ativo" /></td></tr>)}</tbody>
        </table>
      </UiTableScroll></div>
    );
  }

  if (tab === "os") {
    const orders = items as ServiceOrder[];
    return (
      <div className={styles.tableWrap} data-testid="patrimonio-os-tabela"><UiTableScroll>
        <table className={styles.table}><caption>{orders.length} ordem(ns) de serviço na última leitura concluída.</caption>
          <thead><tr><th>Protocolo</th><th>Ordem</th><th>Solicitante</th><th>Responsável técnico</th><th>Prioridade</th><th>Situação</th><th>Diagnóstico</th></tr></thead>
          <tbody>{orders.map(item => <tr key={item.id}><td><code>{item.protocol}</code></td><td>{item.title}</td><td>{item.requester_name}</td><td>{item.technician_name || "Ainda não atribuído"}</td><td><Status value={item.priority} prefix="Prioridade" /></td><td><Status value={item.status} prefix="Situação da ordem" /></td><td>{item.diagnosis || "Ainda não informado"}</td></tr>)}</tbody>
        </table>
      </UiTableScroll></div>
    );
  }

  if (tab === "inventarios") {
    const inventories = items as Inventory[];
    return (
      <div className={styles.tableWrap} data-testid="patrimonio-inventarios-tabela"><UiTableScroll>
        <table className={styles.table}><caption>{inventories.length} inventário(s) na última leitura concluída.</caption>
          <thead><tr><th>Protocolo</th><th>Inventário</th><th>Local</th><th>Situação do ciclo</th></tr></thead>
          <tbody>{inventories.map(item => <tr key={item.id}><td><code>{item.protocol}</code></td><td>{item.title}</td><td>{item.location}</td><td><Status value={item.status} prefix="Situação do inventário" /></td></tr>)}</tbody>
        </table>
      </UiTableScroll></div>
    );
  }

  const requisitions = items as Requisition[];
  return (
    <div className={styles.tableWrap} data-testid="patrimonio-requisicoes-tabela"><UiTableScroll>
      <table className={styles.table}><caption>{requisitions.length} requisição(ões) na última leitura concluída.</caption>
        <thead><tr><th>Protocolo</th><th>Produto</th><th>Quantidade</th><th>Solicitante</th><th>Urgência</th><th>Situação</th><th>Motivo</th></tr></thead>
        <tbody>{requisitions.map(item => <tr key={item.id}><td><code>{item.protocol}</code></td><td>{item.product_name || "Produto não retornado"}</td><td>{item.quantity}</td><td>{item.requester_name}</td><td><Status value={item.urgency} prefix="Urgência" /></td><td><Status value={item.status} prefix="Situação da requisição" /></td><td>{item.reason}</td></tr>)}</tbody>
      </table>
    </UiTableScroll></div>
  );
}
