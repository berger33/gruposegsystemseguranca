"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import UiBadge, { type UiBadgeTone } from "@/components/ui/UiBadge";
import UiState from "@/components/ui/UiState";
import UiTaskWorkspace from "@/components/ui/UiTaskWorkspace";
import styles from "@/components/ui/UiWorkspace.module.css";
import local from "./FornecedoresWorkspace.module.css";
import {
  invalidSupplierResponse,
  supplierRead,
  supplierReadErrorDetail,
  supplierReadFailsClosed,
  type SupplierReadError,
} from "@/lib/supplier-read";
import { supplierRequest } from "@/lib/supplier-request";
import {
  describeSupplierWriteError,
  invalidSupplierWriteResponse,
  supplierWriteErrorDetail,
  supplierWriteFailsClosed,
  supplierWriteReceipts,
  supplierWriteUncertain,
  type SupplierWriteError,
} from "@/lib/supplier-write";
import {
  EXTERNAL_BOUNDARY,
  VOLUME_BOUNDARY,
  supplierDate,
  supplierLabel,
  supplierMoney,
} from "@/lib/supplier-vocabulary.mjs";

type Supplier = { id: string; name: string; category?: string | null };
type Product = { id: string; sku: string; name: string; supplier_id: string | null; unit_measure: string };
type Quotation = {
  id: string; protocol: string; supplier_id: string; supplier_name?: string | null; product_id: string;
  product_name?: string | null; quantity: number; unit_price_cents: number; total_price_cents: number;
  status: string; decision?: string | null; decision_recorded_at?: string | null; derived?: { situation?: string; validity?: { situation?: string } };
};
type Order = { id: string; protocol: string; quotation_id: string; supplier_name?: string | null; product_name?: string | null; total_price_cents: number; status: string; derived?: { situation?: string; deadline?: { situation?: string } } };
type Detail = { quotation: Quotation; validities: Array<Record<string, unknown>>; alert_rule: Record<string, unknown> | null; documents: Array<Record<string, unknown>>; orders: Order[] };

const SUPPLIER_TABS = [
  { id: "quotations", label: "Cotações" },
  { id: "detail", label: "Detalhe canônico" },
  { id: "validity", label: "Validade e alertas" },
  { id: "documents", label: "Referências documentais" },
  { id: "orders", label: "Pedidos internos" },
] as const;
type SupplierTabId = (typeof SUPPLIER_TABS)[number]["id"];

type ResourceKey = "references" | "quotations" | "orders" | "detail";

type ReadState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "failed"; error: SupplierReadError }
  | { phase: "ready"; readAt: string; refreshing: boolean; staleError?: SupplierReadError };

const INITIAL_STATES: Record<ResourceKey, ReadState> = {
  references: { phase: "idle" },
  quotations: { phase: "idle" },
  orders: { phase: "idle" },
  detail: { phase: "idle" },
};

// UX-PRO-07C-2 — as nove mutações canônicas, cada uma com a sua chave canônica
// de corpo 2xx. Os rótulos de operação (usados pelo gerador de Idempotency-Key)
// permanecem exatamente os que a tela já usava.
type SupplierWriteAction =
  | "create-quotation"
  | "quotation-status"
  | "quotation-decision"
  | "register-validity"
  | "register-alert"
  | "register-document"
  | "create-order"
  | "order-status"
  | "register-deadline";

const WRITE_ACTION_NAMES: Record<SupplierWriteAction, string> = {
  "create-quotation": "a criação da cotação",
  "quotation-status": "a transição de estado da cotação",
  "quotation-decision": "a decisão da cotação",
  "register-validity": "o registro de validade",
  "register-alert": "o registro da regra de alerta",
  "register-document": "o registro da referência documental",
  "create-order": "a criação do pedido derivado",
  "order-status": "a transição de estado do pedido",
  "register-deadline": "o registro do prazo do pedido",
};

type WriteRequest = {
  action: SupplierWriteAction;
  /** Rótulo canônico da operação: alimenta o gerador de chave e a preservação em falha. */
  operation: string;
  url: string;
  body: unknown;
  /** Valida a chave canônica do corpo 2xx antes de declarar sucesso. */
  validate: (data: unknown) => boolean;
  /**
   * Reconciliação de sucesso: limpa formulários, move seleção e relê exatamente
   * o que a tela relia antes. Fica no pedido porque a repetição explícita de
   * uma solicitação incerta precisa reconciliar da mesma forma.
   */
  onSuccess: (data: unknown) => Promise<void>;
};

type WriteState =
  | { phase: "idle" }
  | { phase: "sending"; request: WriteRequest; idempotencyKey: string; replaying: boolean }
  | { phase: "uncertain"; request: WriteRequest; idempotencyKey: string; error: SupplierWriteError }
  | { phase: "failed"; action: SupplierWriteAction; error: SupplierWriteError };

const READS = {
  references: {
    label: "Fornecedores e produtos",
    loading: "Lendo fornecedores e produtos ativos do cadastro canônico…",
    emptyTitle: "A consulta foi concluída e nenhum fornecedor ou produto ativo está vinculado.",
    emptyDetail: "A jornada não cria cadastro de exemplo. Atualize depois que um fluxo autorizado vincular um produto a um fornecedor.",
    absence: "Isso não significa que o cadastro esteja vazio.",
  },
  quotations: {
    label: "Cotações",
    loading: "Lendo cotações canônicas…",
    emptyTitle: "A consulta foi concluída e não há cotação neste recorte.",
    emptyDetail: "Nenhum preço, volume ou condição é estimado. Atualize depois que um fluxo autorizado registrar uma cotação.",
    absence: "Isso não significa que o recorte de cotações esteja vazio.",
  },
  orders: {
    label: "Pedidos internos",
    loading: "Lendo pedidos internos…",
    emptyTitle: "A consulta foi concluída e não há pedido interno neste recorte.",
    emptyDetail: "Pedido só nasce de cotação aprovada. Atualize depois que um fluxo autorizado aprovar uma cotação.",
    absence: "Isso não significa que o recorte de pedidos esteja vazio.",
  },
  detail: {
    label: "Detalhe canônico",
    loading: "Lendo o detalhe canônico da cotação selecionada…",
    emptyTitle: "Nenhuma cotação selecionada.",
    emptyDetail: "Selecione uma cotação na lista para ler validade, alerta, referências documentais e pedidos derivados.",
    absence: "Isso não significa que o detalhe esteja vazio.",
  },
} as const;

function money(cents: number | null | undefined) { return supplierMoney(cents); }
function newKey(operation: string) { return `ext04-${operation}-${crypto.randomUUID()}`; }

function readTime(value: string): string {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function tone(value: string): UiBadgeTone {
  if (["aprovado", "recebido", "fechado", "vigente"].includes(value)) return "success";
  if (["cancelado", "rejeitado", "vencido", "desativado"].includes(value)) return "danger";
  if (["em_analise", "em_entrega", "a_vencer", "substituido"].includes(value)) return "warning";
  if (["enviado", "emitido", "em_teste"].includes(value)) return "info";
  return "neutral";
}

export default function FornecedoresWorkspace() {
  const [activeTab, setActiveTab] = useState<SupplierTabId>("quotations");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [notice, setNotice] = useState("");
  const [write, setWrite] = useState<WriteState>({ phase: "idle" });
  const [denied, setDenied] = useState<SupplierReadError | null>(null);
  const keys = useRef<Record<string, string>>({});
  const sendingRef = useRef<string | null>(null);

  const [states, setStates] = useState<Record<ResourceKey, ReadState>>(INITIAL_STATES);
  const statesRef = useRef(states);
  const requestIds = useRef<Record<ResourceKey, number>>({ references: 0, quotations: 0, orders: 0, detail: 0 });

  const [quoteForm, setQuoteForm] = useState({ supplier_id: "", product_id: "", quantity: "1", unit_price: "", notes: "" });
  const [validityForm, setValidityForm] = useState({ valid_until: "", source: "registro_interno", source_reference: "", justification: "" });
  const [alertForm, setAlertForm] = useState({ days_before: "", justification: "" });
  const [documentForm, setDocumentForm] = useState({ document_type: "", file_name: "", file_url: "", storage_key: "" });
  const [decisionReason, setDecisionReason] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [deadlineForm, setDeadlineForm] = useState({ order_id: "", due_date: "", source: "registro_interno", source_reference: "", justification: "" });

  const productsForSupplier = useMemo(() => products.filter(p => p.supplier_id === quoteForm.supplier_id), [products, quoteForm.supplier_id]);

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = SUPPLIER_TABS.findIndex(tab => tab.id === activeTab);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % SUPPLIER_TABS.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + SUPPLIER_TABS.length) % SUPPLIER_TABS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = SUPPLIER_TABS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = SUPPLIER_TABS[nextIndex];
    setActiveTab(nextTab.id);
    document.getElementById(`fornecedores-tab-${nextTab.id}`)?.focus();
  }

  const commit = useCallback((updater: (current: Record<ResourceKey, ReadState>) => Record<ResourceKey, ReadState>) => {
    const next = updater(statesRef.current);
    statesRef.current = next;
    setStates(next);
  }, []);

  // Negativa ou ausência de sessão: a jornada inteira sai da tela. Nenhum dado
  // protegido continua visível e nenhuma repetição da mesma chamada é oferecida.
  const failClosed = useCallback((error: SupplierReadError) => {
    setDenied(error);
    setSuppliers([]); setProducts([]); setQuotations([]); setOrders([]); setDetail(null); setSelectedId("");
    setQuoteForm({ supplier_id: "", product_id: "", quantity: "1", unit_price: "", notes: "" });
    commit(() => ({
      references: { phase: "failed", error },
      quotations: { phase: "failed", error },
      orders: { phase: "failed", error },
      detail: { phase: "failed", error },
    }));
  }, [commit]);

  const readResource = useCallback(async function readResource<T>(
    key: ResourceKey,
    url: string,
    validate: (data: T) => boolean,
    apply: (data: T) => void,
  ) {
    const previous = statesRef.current[key];
    const preserved = previous.phase === "ready" ? previous : null;
    const requestId = ++requestIds.current[key];

    commit(current => ({
      ...current,
      [key]: preserved ? { ...preserved, refreshing: true, staleError: undefined } : { phase: "loading" },
    }));

    const result = await supplierRead<T>(url);
    if (requestIds.current[key] !== requestId) return;

    if (!result.ok) {
      if (supplierReadFailsClosed(result.error)) { failClosed(result.error); return; }
      commit(current => ({
        ...current,
        [key]: preserved
          ? { ...preserved, refreshing: false, staleError: result.error }
          : { phase: "failed", error: result.error },
      }));
      return;
    }

    if (!validate(result.data)) {
      const error = invalidSupplierResponse(result.status);
      commit(current => ({
        ...current,
        [key]: preserved ? { ...preserved, refreshing: false, staleError: error } : { phase: "failed", error },
      }));
      return;
    }

    apply(result.data);
    commit(current => ({ ...current, [key]: { phase: "ready", readAt: new Date().toISOString(), refreshing: false } }));
  }, [commit, failClosed]);

  const loadReferences = useCallback(() => readResource<{ suppliers?: Supplier[]; products?: Product[] }>(
    "references",
    "/api/ext/supplier/references",
    data => Array.isArray(data?.suppliers) && Array.isArray(data?.products),
    data => { setSuppliers(data.suppliers ?? []); setProducts(data.products ?? []); },
  ), [readResource]);

  const loadQuotations = useCallback(() => readResource<{ quotations?: Quotation[] }>(
    "quotations",
    "/api/ext/supplier/quotations",
    data => Array.isArray(data?.quotations),
    data => setQuotations(data.quotations ?? []),
  ), [readResource]);

  const loadOrders = useCallback(() => readResource<{ orders?: Order[] }>(
    "orders",
    "/api/ext/supplier/orders",
    data => Array.isArray(data?.orders),
    data => setOrders(data.orders ?? []),
  ), [readResource]);

  const loadDetail = useCallback((id: string) => {
    if (!id) { setDetail(null); commit(current => ({ ...current, detail: { phase: "idle" } })); return Promise.resolve(); }
    return readResource<Detail>(
      "detail",
      `/api/ext/supplier/quotations/${id}`,
      data => Boolean(data?.quotation?.id),
      data => setDetail(data),
    );
  }, [commit, readResource]);

  /** Exatamente os três GETs de lista que a tela já usava na carga inicial. */
  const refreshLists = useCallback(async () => {
    await Promise.all([loadReferences(), loadQuotations(), loadOrders()]);
  }, [loadReferences, loadQuotations, loadOrders]);

  useEffect(() => { void refreshLists(); }, [refreshLists]);

  // C7: trocar a cotação selecionada relê somente o detalhe — as três leituras
  // de lista não são relançadas por uma mudança de seleção.
  useEffect(() => { void loadDetail(selectedId); }, [selectedId, loadDetail]);

  // UX-PRO-07C-2 — a escrita como operação com estado próprio. A guarda síncrona
  // (ref) é verificada antes do primeiro await: um segundo clique no mesmo tick
  // não dispara segundo POST. O transporte continua sendo `supplierRequest`,
  // com o mesmo verbo, URL, corpo e Idempotency-Key; a chave é preservada
  // enquanto houver falha e só uma resposta real bem-sucedida a encerra. O
  // sucesso reconcilia via `request.onSuccess` — inclusive na repetição
  // explícita da solicitação incerta, que é o caso em que o chamador original
  // já retornou.
  async function runWrite(request: WriteRequest, replaying = false): Promise<unknown | null> {
    if (sendingRef.current) return null;
    sendingRef.current = request.operation;
    const key = keys.current[request.operation] || newKey(request.operation);
    keys.current[request.operation] = key; // preservada enquanto houver falha
    setWrite({ phase: "sending", request, idempotencyKey: key, replaying });
    setNotice("");
    let confirmed: unknown = null;
    try {
      const result = await supplierRequest<unknown>(request.url, {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify(request.body),
      });
      if (!result.ok) {
        failWrite(request, key, describeSupplierWriteError(result.error));
        return null;
      }
      if (!request.validate(result.data)) {
        // 2xx sem a chave canônica: nunca sucesso, nunca ausência.
        failWrite(request, key, invalidSupplierWriteResponse(result.status));
        return null;
      }
      delete keys.current[request.operation]; // só uma resposta real bem-sucedida encerra a tentativa
      setWrite({ phase: "idle" });
      confirmed = result.data;
    } finally {
      sendingRef.current = null;
    }
    await request.onSuccess(confirmed);
    return confirmed;
  }

  function failWrite(request: WriteRequest, key: string, error: SupplierWriteError) {
    if (supplierWriteFailsClosed(error)) {
      // Negativa ou perda de sessão: a releitura pelo caminho existente da
      // leitura falha fechado e remove listas, detalhe e formulários protegidos.
      setWrite({ phase: "failed", action: request.action, error });
      void refreshLists();
      return;
    }
    if (supplierWriteUncertain(error)) {
      // Resultado incerto: a solicitação original é retida para repetição
      // explícita com a mesma URL, o mesmo corpo e a mesma chave.
      setWrite({ phase: "uncertain", request, idempotencyKey: key, error });
      return;
    }
    setWrite({ phase: "failed", action: request.action, error });
  }

  /** Repetição explícita da solicitação incerta: mesma URL, mesmo corpo, mesma chave. */
  async function repeatWrite() {
    if (write.phase !== "uncertain") return;
    await runWrite(write.request, true);
  }

  async function refresh(message: string, id = selectedId) {
    await refreshLists();
    if (id) await loadDetail(id);
    setNotice(message);
  }

  async function createQuotation(event: FormEvent) {
    event.preventDefault();
    const cents = Math.round(Number(quoteForm.unit_price.replace(",", ".")) * 100);
    await runWrite({
      action: "create-quotation",
      operation: "create-quotation",
      url: `/api/ext/supplier/suppliers/${quoteForm.supplier_id}/products/${quoteForm.product_id}/quotations`,
      body: { quantity: Number(quoteForm.quantity), unit_price_cents: cents, notes: quoteForm.notes },
      validate: supplierWriteReceipts.quotation,
      onSuccess: data => {
        const id = String((data as { quotation: { id: string } }).quotation.id);
        setSelectedId(id); setQuoteForm({ supplier_id: "", product_id: "", quantity: "1", unit_price: "", notes: "" });
        setActiveTab("detail");
        return refresh("Cotação confirmada pelo servidor; autoria veio da sessão staff.", id);
      },
    });
  }

  async function transitionQuotation(status: string) {
    if (!selectedId) return;
    const quotationId = selectedId;
    await runWrite({
      action: "quotation-status",
      operation: `quote-${quotationId}-${status}`,
      url: `/api/ext/supplier/quotations/${quotationId}/status`,
      body: { status, reason: `Transição ${status} confirmada pela equipe interna.` },
      validate: supplierWriteReceipts.quotation,
      onSuccess: () => refresh(`Estado ${status} confirmado pelo servidor.`, quotationId),
    });
  }
  async function decide(decision: "aprovada" | "rejeitada") {
    if (!selectedId) return;
    const quotationId = selectedId;
    await runWrite({
      action: "quotation-decision",
      operation: `decision-${quotationId}`,
      url: `/api/ext/supplier/quotations/${quotationId}/decision`,
      body: { decision, justification: decisionReason },
      validate: supplierWriteReceipts.quotation,
      onSuccess: () => { setDecisionReason(""); return refresh(`Decisão ${decision} gravada com autor e data; não será sobrescrita.`, quotationId); },
    });
  }
  async function addValidity(event: FormEvent) {
    event.preventDefault(); if (!selectedId) return;
    const quotationId = selectedId;
    await runWrite({
      action: "register-validity",
      operation: `validity-${quotationId}`,
      url: `/api/ext/supplier/quotations/${quotationId}/validities`,
      body: validityForm,
      validate: supplierWriteReceipts.validity,
      onSuccess: () => {
        setValidityForm({ valid_until: "", source: "registro_interno", source_reference: "", justification: "" });
        return refresh("Validade registrada com fonte; situação recalculada pela data-base do servidor.", quotationId);
      },
    });
  }
  async function addAlert(event: FormEvent) {
    event.preventDefault(); if (!selectedId) return;
    const quotationId = selectedId;
    await runWrite({
      action: "register-alert",
      operation: `alert-${quotationId}`,
      url: `/api/ext/supplier/quotations/${quotationId}/alert-rules`,
      body: { days_before: Number(alertForm.days_before), justification: alertForm.justification },
      validate: supplierWriteReceipts.alertRule,
      onSuccess: () => {
        setAlertForm({ days_before: "", justification: "" });
        return refresh("Regra explícita registrada; somente agora existe limiar de alerta.", quotationId);
      },
    });
  }
  async function addDocument(event: FormEvent) {
    event.preventDefault(); if (!selectedId) return;
    const quotationId = selectedId;
    await runWrite({
      action: "register-document",
      operation: `document-${quotationId}`,
      url: `/api/ext/supplier/quotations/${quotationId}/documents`,
      body: documentForm,
      validate: supplierWriteReceipts.document,
      onSuccess: () => {
        setDocumentForm({ document_type: "", file_name: "", file_url: "", storage_key: "" });
        return refresh("Referência documental versionada confirmada; isto não comprova upload.", quotationId);
      },
    });
  }
  async function createOrder() {
    if (!selectedId) return;
    const quotationId = selectedId;
    await runWrite({
      action: "create-order",
      operation: `order-${quotationId}`,
      url: `/api/ext/supplier/quotations/${quotationId}/orders`,
      body: { notes: orderNotes },
      validate: supplierWriteReceipts.order,
      onSuccess: data => {
        const protocol = String((data as { order: { protocol: string } }).order.protocol);
        setOrderNotes("");
        return refresh(`Pedido ${protocol} derivado da cotação aprovada.`, quotationId);
      },
    });
  }
  async function transitionOrder(orderId: string, status: string) {
    await runWrite({
      action: "order-status",
      operation: `order-${orderId}-${status}`,
      url: `/api/ext/supplier/orders/${orderId}/status`,
      body: { status, reason: `Transição ${status} confirmada pela equipe interna.` },
      validate: supplierWriteReceipts.order,
      onSuccess: () => refresh(`Pedido confirmado em ${status}.`, selectedId),
    });
  }
  async function addDeadline(event: FormEvent) {
    event.preventDefault();
    const orderId = deadlineForm.order_id;
    await runWrite({
      action: "register-deadline",
      operation: `deadline-${orderId}`,
      url: `/api/ext/supplier/orders/${orderId}/deadlines`,
      body: deadlineForm,
      validate: supplierWriteReceipts.deadline,
      onSuccess: () => {
        setDeadlineForm({ order_id: "", due_date: "", source: "registro_interno", source_reference: "", justification: "" });
        return refresh("Prazo do pedido registrado com fonte; nenhum prazo foi estimado.", selectedId);
      },
    });
  }

  const quote = detail?.quotation;
  const quoteTransitions: Record<string, string[]> = { rascunho: ["enviado", "cancelado"], enviado: ["em_analise", "cancelado"], em_analise: ["cancelado"] };
  const orderTransitions: Record<string, string[]> = { rascunho: ["emitido", "cancelado"], emitido: ["em_entrega", "cancelado"], em_entrega: ["recebido", "cancelado"], recebido: ["fechado"] };

  const references = states.references;
  const quotationState = states.quotations;
  const orderState = states.orders;
  const detailState = states.detail;

  const listsBusy = [references, quotationState, orderState].some(state =>
    state.phase === "loading" || (state.phase === "ready" && state.refreshing));

  // UX-PRO-07C-2 — envio em curso ou resultado incerto bloqueiam as nove
  // escritas (elas tocam a mesma máquina de estados canônica; o servidor
  // continua sendo a autoridade). Os controles de leitura seguem disponíveis.
  const writesBlocked = write.phase === "sending" || write.phase === "uncertain";
  const sendingOperation = write.phase === "sending" ? write.request.operation : null;

  const lastListRead = [references, quotationState, orderState]
    .filter(state => state.phase === "ready")
    .map(state => (state as { readAt: string }).readAt)
    .sort()
    .at(-1);

  /** Repetição executa exatamente o mesmo GET já usado pela carga inicial. */
  function retry(key: ResourceKey) {
    if (key === "references") return loadReferences();
    if (key === "quotations") return loadQuotations();
    if (key === "orders") return loadOrders();
    return loadDetail(selectedId);
  }

  function resourceBand(key: ResourceKey) {
    const state = states[key];
    const config = READS[key];
    if (state.phase === "loading") {
      return (
        <div data-testid={`fornecedores-${key}-carregando`}>
          <UiState variant="loading" title={config.loading} detail="Aguarde a resposta do servidor; nenhum vazio, total ou situação é presumido durante a leitura." />
        </div>
      );
    }
    if (state.phase === "failed") {
      return (
        <div data-testid={`fornecedores-${key}-falha`}>
          <UiState
            variant="error"
            title={state.error.title}
            detail={`${supplierReadErrorDetail(state.error)} ${config.absence}`}
            onRetry={state.error.canRetry ? () => void retry(key) : undefined}
          />
        </div>
      );
    }
    return null;
  }

  function staleBand(key: ResourceKey) {
    const state = states[key];
    if (state.phase !== "ready" || !state.staleError) return null;
    const config = READS[key];
    return (
      <div className={`${styles.notice} ${styles.noticeWarning}`} role="alert" data-testid={`fornecedores-${key}-desatualizado`}>
        <strong>Não foi possível atualizar {config.label.toLowerCase()}.</strong>
        <p>
          {supplierReadErrorDetail(state.staleError)} {config.absence} O conteúdo abaixo é da última leitura concluída às {readTime(state.readAt)} e pode estar desatualizado.
        </p>
        {state.staleError.canRetry ? (
          <div className={styles.actions}>
            <button type="button" onClick={() => void retry(key)}>Tentar novamente</button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <UiTaskWorkspace className={styles.workspace}>
      <p className={styles.kicker}>UX-PRO-07C · FORNECEDORES EXT-04</p>
      <h1>EXT-04 — Fornecedores</h1>
      <p className={styles.lede}>
        Jornada administrativa interna de cotações, referências documentais e pedidos. Cada leitura informa se ainda está
        consultando o servidor, se a consulta falhou ou se o recorte terminou vazio; uma falha nunca é apresentada como
        ausência de registros. Cada escrita declara o envio em curso, valida a resposta do servidor antes de confirmar
        sucesso e, quando o resultado é incerto, repete somente por decisão explícita e com a mesma chave de idempotência.
      </p>

      <section aria-label="Condição de volume" className={local.boundary}>
        <strong>Condição “se volume justificar”: SEM EVIDÊNCIA.</strong>
        <p>{VOLUME_BOUNDARY} O plano apenas declara a condição em <code className={local.codeInline}>docs/PLANO-MESTRE-IMPLEMENTACAO.md:423</code>; a auditoria em <code className={local.codeInline}>docs/AUDITORIA-TERRENO-L08.md:85</code> registra handler/tabelas sem jornada provada. Confirmação do proprietário pendente.</p>
      </section>
      <section aria-label="Fronteira externa" className={local.boundary}>
        <strong>Fronteira externa PENDENTE.</strong>
        <p>{EXTERNAL_BOUNDARY} A tela usa somente sessão staff. <code className={local.codeInline}>file_url</code>/<code className={local.codeInline}>storage_key</code> são referências declaradas, não arquivos enviados. “Escopo próprio” do ator fornecedor não é afirmado nem simulado.</p>
      </section>

      {denied ? (
        <div data-testid="fornecedores-negado" data-ui-state="denied">
          <UiState
            variant="denied"
            title={denied.title}
            detail={`${supplierReadErrorDetail(denied)} A recusa veio do servidor; nenhum dado da jornada permanece na tela.`}
          />
        </div>
      ) : (
        <>
          {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
          {write.phase === "sending" ? (
            <p className={`${styles.notice} ${styles.noticeInfo}`} role="status" data-testid="fornecedores-escrita-enviando">
              {write.replaying ? "Reenviando" : "Enviando"} {WRITE_ACTION_NAMES[write.request.action]}… O resultado ainda
              não foi confirmado; as listas e o detalhe continuam sendo das últimas leituras concluídas.
            </p>
          ) : null}
          {write.phase === "uncertain" ? (
            <div className={`${styles.notice} ${styles.noticeWarning}`} role="alert" data-testid="fornecedores-escrita-incerta">
              <strong>{write.error.title}</strong>
              <p>
                {supplierWriteErrorDetail(write.error)} A tela não repete a escrita automaticamente. “Repetir com a mesma
                chave” reenvia exatamente esta solicitação — mesma URL, mesmo corpo e a mesma chave de idempotência
                (<code className={local.codeInline}>{write.idempotencyKey}</code>) — para confirmar o resultado sem criar
                registro duplicado. Não inicie outra escrita até a confirmação; atualize as listas para conferir o estado atual.
              </p>
              <div className={styles.actions}>
                <button type="button" data-testid="fornecedores-escrita-repetir" onClick={() => void repeatWrite()}>
                  Repetir com a mesma chave
                </button>
              </div>
            </div>
          ) : null}
          {write.phase === "failed" ? (
            <div role="alert" data-testid="fornecedores-escrita-falha">
              <UiState variant="error" title={write.error.title} detail={supplierWriteErrorDetail(write.error)} />
            </div>
          ) : null}

          <div className={styles.rowWrap}>
            <div className={styles.grow}>
              <h2 className={styles.panelTitle}>Leitura da jornada</h2>
              <p className={styles.hint}>
                {lastListRead
                  ? `Listas atualizadas pela última leitura concluída às ${readTime(lastListRead)}.`
                  : "Os dados só aparecem depois de uma resposta válida do servidor."}
              </p>
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                data-testid="fornecedores-atualizar-listas"
                disabled={listsBusy}
                onClick={() => void refreshLists()}
              >
                {listsBusy ? "Atualizando…" : "Atualizar listas"}
              </button>
            </div>
          </div>

          <nav aria-label="Etapas da jornada de fornecedores" role="tablist" className={styles.tabs}>
            {SUPPLIER_TABS.map(tab => (
              <button
                key={tab.id}
                id={`fornecedores-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`fornecedores-panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                className={activeTab === tab.id ? styles.tabActive : styles.tab}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={handleTabKeyDown}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div id="fornecedores-panel-quotations" className={styles.tabPanel} role="tabpanel" aria-labelledby="fornecedores-tab-quotations" tabIndex={0} hidden={activeTab !== "quotations"}>
          <section className={styles.panel} aria-labelledby="fornecedores-nova-cotacao">
            <h2 className={styles.panelTitle} id="fornecedores-nova-cotacao">Nova cotação interna</h2>
            {resourceBand("references")}
            {staleBand("references")}
            {references.phase === "ready" ? (
              suppliers.length === 0 || products.length === 0 ? (
                <div data-testid="fornecedores-references-vazio">
                  <UiState variant="empty" title={READS.references.emptyTitle} detail={READS.references.emptyDetail} />
                </div>
              ) : (
                <div data-testid="fornecedores-references-pronto">
                  <p className={styles.hint}>{suppliers.length} fornecedor(es) e {products.length} produto(s) ativo(s) na última leitura concluída às {readTime((references as { readAt: string }).readAt)}.</p>
                </div>
              )
            ) : null}
            <form onSubmit={createQuotation} className={styles.fieldRow}>
              <div className={styles.field}>
                <label htmlFor="fornecedores-supplier">Fornecedor</label>
                <select id="fornecedores-supplier" required value={quoteForm.supplier_id} onChange={e => setQuoteForm({ ...quoteForm, supplier_id: e.target.value, product_id: "" })}>
                  <option value="">Selecione</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="fornecedores-product">Produto do fornecedor</label>
                <select id="fornecedores-product" required value={quoteForm.product_id} onChange={e => setQuoteForm({ ...quoteForm, product_id: e.target.value })}>
                  <option value="">Selecione</option>
                  {productsForSupplier.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="fornecedores-quantity">Quantidade</label>
                <input id="fornecedores-quantity" required min={1} type="number" value={quoteForm.quantity} onChange={e => setQuoteForm({ ...quoteForm, quantity: e.target.value })} />
              </div>
              <div className={styles.field}>
                <label htmlFor="fornecedores-price">Preço unitário (R$)</label>
                <input id="fornecedores-price" required inputMode="decimal" value={quoteForm.unit_price} onChange={e => setQuoteForm({ ...quoteForm, unit_price: e.target.value })} />
              </div>
              <div className={styles.field}>
                <label htmlFor="fornecedores-notes">Notas (opcional, ≥10)</label>
                <input id="fornecedores-notes" value={quoteForm.notes} onChange={e => setQuoteForm({ ...quoteForm, notes: e.target.value })} />
              </div>
              <div className={styles.actions}>
                <button type="submit" className={styles.primary} disabled={writesBlocked} aria-busy={sendingOperation === "create-quotation"}>Confirmar no servidor</button>
              </div>
            </form>
          </section>

            <section className={styles.panel} aria-labelledby="fornecedores-cotacoes">
              <h2 className={styles.panelTitle} id="fornecedores-cotacoes">Cotações</h2>
              {resourceBand("quotations")}
              {staleBand("quotations")}
              {quotationState.phase === "ready" ? (
                quotations.length === 0 ? (
                  <div data-testid="fornecedores-quotations-vazio">
                    <UiState variant="empty" title={READS.quotations.emptyTitle} detail={READS.quotations.emptyDetail} />
                  </div>
                ) : (
                  <div data-testid="fornecedores-quotations-lista">
                    <p className={styles.hint}>{quotations.length} cotação(ões) na última leitura concluída às {readTime(quotationState.readAt)}.</p>
                    <ul className={local.quoteList}>
                      {quotations.map(q => (
                        <li key={q.id} className={local.quoteItem}>
                          <button
                            type="button"
                            className={local.quoteButton}
                            data-selected={selectedId === q.id ? "true" : "false"}
                            onClick={() => { setSelectedId(q.id); setActiveTab("detail"); }}
                          >
                            <span className={local.quoteProtocol}>{q.protocol}</span>
                            <span>{q.supplier_name || "Fornecedor não retornado"} · {q.product_name || "Produto não retornado"}</span>
                            <span className={local.quoteMeta}>{money(q.total_price_cents)} · {supplierLabel(q.status)} · {supplierLabel(q.derived?.situation || "sem_situacao")}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              ) : null}
            </section>
          </div>

          <div id="fornecedores-panel-detail" className={styles.tabPanel} role="tabpanel" aria-labelledby="fornecedores-tab-detail" tabIndex={0} hidden={activeTab !== "detail"}>
            <div className={styles.stackWide}>
              <section className={styles.panel} aria-labelledby="fornecedores-detalhe">
                <div className={styles.rowWrap}>
                  <div className={styles.grow}>
                    <h2 className={styles.panelTitle} id="fornecedores-detalhe">Detalhe canônico</h2>
                  </div>
                  {selectedId ? (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        data-testid="fornecedores-atualizar-detalhe"
                        disabled={detailState.phase === "loading" || (detailState.phase === "ready" && detailState.refreshing)}
                        onClick={() => void loadDetail(selectedId)}
                      >
                        {(detailState.phase === "ready" && detailState.refreshing) || detailState.phase === "loading" ? "Atualizando…" : "Atualizar detalhe"}
                      </button>
                    </div>
                  ) : null}
                </div>
                {detailState.phase === "idle" ? (
                  <div data-testid="fornecedores-detalhe-vazio">
                    <UiState variant="empty" title={READS.detail.emptyTitle} detail={READS.detail.emptyDetail} />
                  </div>
                ) : null}
                {resourceBand("detail")}
                {staleBand("detail")}
                {detailState.phase === "ready" && quote ? (
                  <div data-testid="fornecedores-detalhe-painel">
                    <dl className={local.facts}>
                      <div><dt>Protocolo</dt><dd className={local.codeInline}>{quote.protocol}</dd></div>
                      <div><dt>Fornecedor</dt><dd>{quote.supplier_name || "Não retornado"}</dd></div>
                      <div><dt>Produto</dt><dd>{quote.product_name || "Não retornado"}</dd></div>
                      <div><dt>Quantidade × unitário</dt><dd>{quote.quantity} × {money(quote.unit_price_cents)} = {money(quote.total_price_cents)}</dd></div>
                    </dl>
                    <div className={local.badgeRow}>
                      <UiBadge tone={tone(quote.status)} srPrefix="Estado da cotação">{supplierLabel(quote.status)}</UiBadge>
                      <UiBadge tone={tone(quote.derived?.situation || "")} srPrefix="Situação derivada">{supplierLabel(quote.derived?.situation || "sem_situacao")}</UiBadge>
                      <UiBadge tone={tone(quote.derived?.validity?.situation || "")} srPrefix="Validade">{supplierLabel(quote.derived?.validity?.situation || "validade_ausente")}</UiBadge>
                    </div>
                    <p className={styles.hint}>Leitura concluída às {readTime(detailState.readAt)}.</p>
                    <div className={styles.actions}>
                      {(quoteTransitions[quote.status] || []).map(status => (
                        <button key={status} type="button" disabled={writesBlocked} aria-busy={sendingOperation === `quote-${selectedId}-${status}`} onClick={() => void transitionQuotation(status)}>Mover para {supplierLabel(status)}</button>
                      ))}
                    </div>
                    {quote.status === "em_analise" && !quote.decision ? (
                      <div className={styles.fieldRow}>
                        <div className={styles.field}>
                          <label htmlFor="fornecedores-decisao">Justificativa da decisão (≥10)</label>
                          <input id="fornecedores-decisao" value={decisionReason} onChange={e => setDecisionReason(e.target.value)} />
                        </div>
                        <div className={styles.actions}>
                          <button type="button" className={styles.primary} disabled={writesBlocked} aria-busy={sendingOperation === `decision-${selectedId}`} onClick={() => void decide("aprovada")}>Aprovar definitivamente</button>
                          <button type="button" disabled={writesBlocked} aria-busy={sendingOperation === `decision-${selectedId}`} onClick={() => void decide("rejeitada")}>Rejeitar definitivamente</button>
                        </div>
                      </div>
                    ) : null}
                    {quote.decision ? (
                      <p className={styles.hint}>Decisão imutável: <strong>{supplierLabel(quote.decision)}</strong>, registrada em {quote.decision_recorded_at ? supplierDate(quote.decision_recorded_at) : "data ausente"}.</p>
                    ) : null}
                    {quote.status === "aprovado" ? (
                      <div className={styles.fieldRow}>
                        <div className={styles.field}>
                          <label htmlFor="fornecedores-notas-pedido">Notas do pedido (opcional)</label>
                          <input id="fornecedores-notas-pedido" value={orderNotes} onChange={e => setOrderNotes(e.target.value)} />
                        </div>
                        <div className={styles.actions}>
                          <button type="button" className={styles.primary} disabled={writesBlocked} aria-busy={sendingOperation === `order-${selectedId}`} onClick={() => void createOrder()}>Criar pedido derivado</button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            </div>
          </div>

          <div id="fornecedores-panel-validity" className={styles.tabPanel} role="tabpanel" aria-labelledby="fornecedores-tab-validity" tabIndex={0} hidden={activeTab !== "validity"}>
              {quote ? (
                <section className={styles.panel} aria-labelledby="fornecedores-validade">
                  <h2 className={styles.panelTitle} id="fornecedores-validade">Validade e alerta</h2>
                  <p>
                    {detail?.validities.length
                      ? `${detail.validities.length} registro(s) de validade; anteriores nunca são sobrescritos.`
                      : "Validade ausente declarada; nenhuma data estimada."} {detail?.alert_rule
                      ? "Regra de antecedência explícita registrada."
                      : "Sem regra: o sistema não chama prazo de “a vencer”."}
                  </p>
                  <form onSubmit={addValidity} className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label htmlFor="fornecedores-valida-ate">Válida até</label>
                      <input id="fornecedores-valida-ate" required type="date" value={validityForm.valid_until} onChange={e => setValidityForm({ ...validityForm, valid_until: e.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="fornecedores-fonte">Fonte</label>
                      <select id="fornecedores-fonte" value={validityForm.source} onChange={e => setValidityForm({ ...validityForm, source: e.target.value })}>
                        <option value="registro_interno">registro interno</option>
                        <option value="documento_declarado">documento declarado</option>
                        <option value="email_declarado">e-mail declarado</option>
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="fornecedores-referencia">Referência da fonte</label>
                      <input id="fornecedores-referencia" value={validityForm.source_reference} onChange={e => setValidityForm({ ...validityForm, source_reference: e.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="fornecedores-justificativa">Justificativa (≥5)</label>
                      <input id="fornecedores-justificativa" required value={validityForm.justification} onChange={e => setValidityForm({ ...validityForm, justification: e.target.value })} />
                    </div>
                    <div className={styles.actions}>
                      <button type="submit" className={styles.primary} disabled={writesBlocked} aria-busy={sendingOperation === `validity-${selectedId}`}>Registrar validade</button>
                    </div>
                  </form>
                  {!detail?.alert_rule ? (
                    <form onSubmit={addAlert} className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="fornecedores-dias">Dias de antecedência</label>
                        <input id="fornecedores-dias" required min={1} max={365} type="number" value={alertForm.days_before} onChange={e => setAlertForm({ ...alertForm, days_before: e.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="fornecedores-regra">Justificativa da regra</label>
                        <input id="fornecedores-regra" required value={alertForm.justification} onChange={e => setAlertForm({ ...alertForm, justification: e.target.value })} />
                      </div>
                      <div className={styles.actions}>
                        <button type="submit" disabled={writesBlocked} aria-busy={sendingOperation === `alert-${selectedId}`}>Registrar regra explícita</button>
                      </div>
                    </form>
                  ) : null}
                </section>
              ) : <UiState variant="empty" title="Selecione uma cotação para consultar validade e alertas." detail="Abra a etapa Cotações e selecione um registro. Nenhuma validade é estimada." />}
          </div>

          <div id="fornecedores-panel-documents" className={styles.tabPanel} role="tabpanel" aria-labelledby="fornecedores-tab-documents" tabIndex={0} hidden={activeTab !== "documents"}>
              {quote ? (
                <section className={styles.panel} aria-labelledby="fornecedores-documentos">
                  <h2 className={styles.panelTitle} id="fornecedores-documentos">Referências documentais</h2>
                  <p><strong>Sem upload real.</strong> Versão é alocada sob transação e lock no servidor.</p>
                  {!detail?.documents.length ? (
                    <div data-testid="fornecedores-documentos-vazio">
                      <UiState variant="empty" title="Nenhuma referência documental neste recorte." detail="Nenhum arquivo é presumido: file_url e storage_key são declarações da equipe, não prova de upload." />
                    </div>
                  ) : (
                    <ul className={local.documentList}>
                      {detail.documents.map((d, index) => (
                        <li key={String(d.id || index)}>
                          {supplierLabel(String(d.document_type || "tipo_legado"))} v{String(d.version || "legado")} — {String(d.file_name || "sem nome")} — {supplierLabel(String(d.situation))}
                        </li>
                      ))}
                    </ul>
                  )}
                  <form onSubmit={addDocument} className={styles.fieldRow}>
                    <div className={styles.field}>
                      <label htmlFor="fornecedores-tipo">Tipo</label>
                      <input id="fornecedores-tipo" required value={documentForm.document_type} onChange={e => setDocumentForm({ ...documentForm, document_type: e.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="fornecedores-nome">Nome declarado</label>
                      <input id="fornecedores-nome" required value={documentForm.file_name} onChange={e => setDocumentForm({ ...documentForm, file_name: e.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="fornecedores-url">file_url (referência)</label>
                      <input id="fornecedores-url" required value={documentForm.file_url} onChange={e => setDocumentForm({ ...documentForm, file_url: e.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="fornecedores-chave">storage_key (referência)</label>
                      <input id="fornecedores-chave" required value={documentForm.storage_key} onChange={e => setDocumentForm({ ...documentForm, storage_key: e.target.value })} />
                    </div>
                    <div className={styles.actions}>
                      <button type="submit" className={styles.primary} disabled={writesBlocked} aria-busy={sendingOperation === `document-${selectedId}`}>Registrar referência</button>
                    </div>
                  </form>
                </section>
              ) : <UiState variant="empty" title="Selecione uma cotação para consultar referências documentais." detail="Abra a etapa Cotações e selecione um registro. Nenhum arquivo é presumido ou enviado." />}
          </div>

          <div id="fornecedores-panel-orders" className={styles.tabPanel} role="tabpanel" aria-labelledby="fornecedores-tab-orders" tabIndex={0} hidden={activeTab !== "orders"}>
          <section className={styles.panel} aria-labelledby="fornecedores-pedidos">
            <h2 className={styles.panelTitle} id="fornecedores-pedidos">Pedidos internos</h2>
            {resourceBand("orders")}
            {staleBand("orders")}
            {orderState.phase === "ready" ? (
              orders.length === 0 ? (
                <div data-testid="fornecedores-orders-vazio">
                  <UiState variant="empty" title={READS.orders.emptyTitle} detail={READS.orders.emptyDetail} />
                </div>
              ) : (
                <div data-testid="fornecedores-orders-lista">
                  <p className={styles.hint}>{orders.length} pedido(s) na última leitura concluída às {readTime(orderState.readAt)}.</p>
                  <div className={local.orderList}>
                    {orders.map(orderItem => (
                      <article key={orderItem.id} className={local.orderItem}>
                        <span className={local.orderProtocol}>{orderItem.protocol}</span>
                        <span>{orderItem.supplier_name || "Fornecedor não retornado"} / {orderItem.product_name || "Produto não retornado"} — {money(orderItem.total_price_cents)}</span>
                        <div className={local.badgeRow}>
                          <UiBadge tone={tone(orderItem.status)} srPrefix="Estado do pedido">{supplierLabel(orderItem.status)}</UiBadge>
                          <UiBadge tone={tone(orderItem.derived?.situation || "")} srPrefix="Situação do pedido">{supplierLabel(orderItem.derived?.situation || "sem_situacao")}</UiBadge>
                          <UiBadge tone={tone(orderItem.derived?.deadline?.situation || "")} srPrefix="Prazo">{supplierLabel(orderItem.derived?.deadline?.situation || "prazo_ausente")}</UiBadge>
                        </div>
                        <div className={styles.actions}>
                          {(orderTransitions[orderItem.status] || []).map(status => (
                            <button key={status} type="button" disabled={writesBlocked} aria-busy={sendingOperation === `order-${orderItem.id}-${status}`} onClick={() => void transitionOrder(orderItem.id, status)}>Mover para {supplierLabel(status)}</button>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )
            ) : null}
            {orders.length > 0 ? (
              <form onSubmit={addDeadline} className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="fornecedores-pedido-prazo">Pedido para prazo</label>
                  <select id="fornecedores-pedido-prazo" required value={deadlineForm.order_id} onChange={e => setDeadlineForm({ ...deadlineForm, order_id: e.target.value })}>
                    <option value="">Selecione</option>
                    {orders.filter(o => !["fechado", "cancelado"].includes(o.status)).map(o => <option key={o.id} value={o.id}>{o.protocol}</option>)}
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="fornecedores-prazo-data">Data do prazo</label>
                  <input id="fornecedores-prazo-data" required type="date" value={deadlineForm.due_date} onChange={e => setDeadlineForm({ ...deadlineForm, due_date: e.target.value })} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="fornecedores-prazo-fonte">Fonte</label>
                  <select id="fornecedores-prazo-fonte" value={deadlineForm.source} onChange={e => setDeadlineForm({ ...deadlineForm, source: e.target.value })}>
                    <option value="registro_interno">registro interno</option>
                    <option value="cotacao_aprovada">cotação aprovada</option>
                    <option value="pedido_emitido">pedido emitido</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="fornecedores-prazo-referencia">Referência</label>
                  <input id="fornecedores-prazo-referencia" value={deadlineForm.source_reference} onChange={e => setDeadlineForm({ ...deadlineForm, source_reference: e.target.value })} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="fornecedores-prazo-justificativa">Justificativa (≥5)</label>
                  <input id="fornecedores-prazo-justificativa" required value={deadlineForm.justification} onChange={e => setDeadlineForm({ ...deadlineForm, justification: e.target.value })} />
                </div>
                <div className={styles.actions}>
                  <button type="submit" className={styles.primary} disabled={writesBlocked} aria-busy={sendingOperation === `deadline-${deadlineForm.order_id}`}>Registrar prazo</button>
                </div>
              </form>
            ) : null}
          </section>
          </div>
        </>
      )}
    </UiTaskWorkspace>
  );
}
