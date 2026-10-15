"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  classifySupplierWriteFailure,
  invalidSupplierWriteResponse,
  supplierWriteFailureDetail,
  type SupplierWriteFailure,
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

type ResourceKey = "references" | "quotations" | "orders" | "detail";

type ReadState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "failed"; error: SupplierReadError }
  | { phase: "ready"; readAt: string; refreshing: boolean; staleError?: SupplierReadError };

type SupplierWritePlan = {
  keyOperation: string;
  actionId: string;
  actionLabel: string;
  url: string;
  body: unknown;
  validate: (data: unknown) => boolean;
  onSuccess: (data: unknown) => Promise<void>;
};

type PendingSupplierWrite = Omit<SupplierWritePlan, "body"> & {
  idempotencyKey: string;
  bodyJson: string;
};

type BusySupplierWrite = { actionId: string; actionLabel: string };

type SupplierWriteOutcome = { ok: true; data: unknown } | { ok: false };

function resourceRecord(data: unknown, key: string): Record<string, unknown> | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const resource = (data as Record<string, unknown>)[key];
  return resource && typeof resource === "object" && !Array.isArray(resource)
    ? resource as Record<string, unknown>
    : null;
}

function hasStringFields(data: unknown, key: string, fields: string[]): boolean {
  const resource = resourceRecord(data, key);
  return Boolean(resource && fields.every(field => typeof resource[field] === "string" && (resource[field] as string).trim().length > 0));
}

function hasIntegerField(data: unknown, key: string, field: string): boolean {
  const resource = resourceRecord(data, key);
  return Boolean(resource && typeof resource[field] === "number" && Number.isInteger(resource[field]));
}

const validQuotationResponse = (data: unknown) => hasStringFields(data, "quotation", ["id", "protocol", "status"]);
const validDecisionResponse = (data: unknown) => hasStringFields(data, "quotation", ["id", "protocol", "status", "decision"]);
const validValidityResponse = (data: unknown) => hasStringFields(data, "validity", ["id", "valid_until"]);
const validAlertRuleResponse = (data: unknown) => hasStringFields(data, "alert_rule", ["id"]) && hasIntegerField(data, "alert_rule", "days_before");
const validDocumentResponse = (data: unknown) => hasStringFields(data, "document", ["id", "document_type"]) && hasIntegerField(data, "document", "version");
const validOrderResponse = (data: unknown) => hasStringFields(data, "order", ["id", "protocol", "status"]);
const validDeadlineResponse = (data: unknown) => hasStringFields(data, "deadline", ["id", "due_date"]);

const INITIAL_STATES: Record<ResourceKey, ReadState> = {
  references: { phase: "idle" },
  quotations: { phase: "idle" },
  orders: { phase: "idle" },
  detail: { phase: "idle" },
};

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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<BusySupplierWrite | null>(null);
  const [notice, setNotice] = useState("");
  const [writeError, setWriteError] = useState<SupplierWriteFailure | null>(null);
  const [pendingWrite, setPendingWrite] = useState<PendingSupplierWrite | null>(null);
  const [denied, setDenied] = useState<SupplierReadError | null>(null);
  const writeInFlight = useRef(false);
  const pendingWriteRef = useRef<PendingSupplierWrite | null>(null);
  const keys = useRef<Record<string, string>>({});

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

  const commit = useCallback((updater: (current: Record<ResourceKey, ReadState>) => Record<ResourceKey, ReadState>) => {
    const next = updater(statesRef.current);
    statesRef.current = next;
    setStates(next);
  }, []);

  // Negativa ou ausência de sessão: a jornada inteira sai da tela. Nenhum dado
  // protegido continua visível e nenhuma repetição da mesma chamada é oferecida.
  const failClosed = useCallback((error: SupplierReadError) => {
    setDenied(error);
    setNotice("");
    setWriteError(null);
    pendingWriteRef.current = null;
    setPendingWrite(null);
    setSuppliers([]); setProducts([]); setQuotations([]); setOrders([]); setDetail(null); setSelectedId("");
    setQuoteForm({ supplier_id: "", product_id: "", quantity: "1", unit_price: "", notes: "" });
    setValidityForm({ valid_until: "", source: "registro_interno", source_reference: "", justification: "" });
    setAlertForm({ days_before: "", justification: "" });
    setDocumentForm({ document_type: "", file_name: "", file_url: "", storage_key: "" });
    setDecisionReason("");
    setOrderNotes("");
    setDeadlineForm({ order_id: "", due_date: "", source: "registro_interno", source_reference: "", justification: "" });
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

  async function executeWrite(request: PendingSupplierWrite, explicitRetry = false): Promise<SupplierWriteOutcome> {
    if (writeInFlight.current) return { ok: false };
    if (explicitRetry ? pendingWriteRef.current !== request : pendingWriteRef.current !== null) return { ok: false };

    // A trava muda sincronicamente antes de qualquer await: dois eventos no
    // mesmo tick não conseguem enviar dois POSTs, mesmo antes do novo render.
    writeInFlight.current = true;
    setBusy({ actionId: request.actionId, actionLabel: request.actionLabel });
    setWriteError(null);
    setNotice("");
    try {
      const result = await supplierRequest<unknown>(request.url, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": request.idempotencyKey },
        body: request.bodyJson,
      });
      if (!result.ok) {
        const failure = classifySupplierWriteFailure(result.status, result.error.code);
        if (failure.kind === "auth" || failure.kind === "denied") {
          const deniedError: SupplierReadError = {
            kind: failure.kind,
            title: failure.title,
            detail: failure.detail,
            code: failure.code,
            status: failure.status,
            canRetry: false,
          };
          failClosed(deniedError);
        } else {
          pendingWriteRef.current = failure.retrySameRequest ? request : null;
          setPendingWrite(failure.retrySameRequest ? request : null);
          setWriteError(failure);
        }
        return { ok: false };
      }

      if (!request.validate(result.data)) {
        const failure = invalidSupplierWriteResponse(result.status);
        pendingWriteRef.current = request;
        setPendingWrite(request);
        setWriteError(failure);
        return { ok: false };
      }

      if (keys.current[request.keyOperation] === request.idempotencyKey) delete keys.current[request.keyOperation];
      pendingWriteRef.current = null;
      setPendingWrite(null);
      setWriteError(null);
      return { ok: true, data: result.data };
    } catch {
      const failure = classifySupplierWriteFailure(0, null);
      pendingWriteRef.current = request;
      setPendingWrite(request);
      setWriteError(failure);
      return { ok: false };
    } finally {
      writeInFlight.current = false;
      setBusy(null);
    }
  }

  async function submitWrite(plan: SupplierWritePlan) {
    if (writeInFlight.current || pendingWriteRef.current) return;
    const idempotencyKey = keys.current[plan.keyOperation] || newKey(plan.keyOperation);
    keys.current[plan.keyOperation] = idempotencyKey;
    const { body, ...requestPlan } = plan;
    const request: PendingSupplierWrite = {
      ...requestPlan,
      idempotencyKey,
      bodyJson: JSON.stringify(body),
    };
    const outcome = await executeWrite(request);
    if (outcome.ok) await request.onSuccess(outcome.data);
  }

  async function retryPendingWrite() {
    const request = pendingWriteRef.current;
    if (!request || writeInFlight.current) return;
    const outcome = await executeWrite(request, true);
    if (outcome.ok) await request.onSuccess(outcome.data);
  }

  async function refresh(message: string, id = selectedId) {
    await refreshLists();
    if (id) await loadDetail(id);
    setNotice(message);
  }

  function createQuotation(event: FormEvent) {
    event.preventDefault();
    const cents = Math.round(Number(quoteForm.unit_price.replace(",", ".")) * 100);
    void submitWrite({
      keyOperation: "create-quotation",
      actionId: "create-quotation",
      actionLabel: "Criar cotação",
      url: `/api/ext/supplier/suppliers/${quoteForm.supplier_id}/products/${quoteForm.product_id}/quotations`,
      body: { quantity: Number(quoteForm.quantity), unit_price_cents: cents, notes: quoteForm.notes },
      validate: validQuotationResponse,
      onSuccess: async data => {
        const id = (data as { quotation: Quotation }).quotation.id;
        setSelectedId(id);
        setQuoteForm({ supplier_id: "", product_id: "", quantity: "1", unit_price: "", notes: "" });
        await refresh("Cotação confirmada pelo servidor; autoria veio da sessão staff.", id);
      },
    });
  }

  function transitionQuotation(status: string) {
    if (!selectedId) return;
    const operation = `quote-${selectedId}-${status}`;
    void submitWrite({
      keyOperation: operation,
      actionId: operation,
      actionLabel: `Mover cotação para ${supplierLabel(status)}`,
      url: `/api/ext/supplier/quotations/${selectedId}/status`,
      body: { status, reason: `Transição ${status} confirmada pela equipe interna.` },
      validate: validQuotationResponse,
      onSuccess: async () => { await refresh(`Estado ${status} confirmado pelo servidor.`); },
    });
  }

  function decide(decision: "aprovada" | "rejeitada") {
    if (!selectedId) return;
    void submitWrite({
      keyOperation: `decision-${selectedId}`,
      actionId: `decision-${selectedId}-${decision}`,
      actionLabel: `${decision === "aprovada" ? "Aprovar" : "Rejeitar"} cotação`,
      url: `/api/ext/supplier/quotations/${selectedId}/decision`,
      body: { decision, justification: decisionReason },
      validate: validDecisionResponse,
      onSuccess: async () => {
        setDecisionReason("");
        await refresh(`Decisão ${decision} gravada com autor e data; não será sobrescrita.`);
      },
    });
  }

  function addValidity(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    void submitWrite({
      keyOperation: `validity-${selectedId}`,
      actionId: `validity-${selectedId}`,
      actionLabel: "Registrar validade",
      url: `/api/ext/supplier/quotations/${selectedId}/validities`,
      body: validityForm,
      validate: validValidityResponse,
      onSuccess: async () => {
        setValidityForm({ valid_until: "", source: "registro_interno", source_reference: "", justification: "" });
        await refresh("Validade registrada com fonte; situação recalculada pela data-base do servidor.");
      },
    });
  }

  function addAlert(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    void submitWrite({
      keyOperation: `alert-${selectedId}`,
      actionId: `alert-${selectedId}`,
      actionLabel: "Registrar regra de alerta",
      url: `/api/ext/supplier/quotations/${selectedId}/alert-rules`,
      body: { days_before: Number(alertForm.days_before), justification: alertForm.justification },
      validate: validAlertRuleResponse,
      onSuccess: async () => {
        setAlertForm({ days_before: "", justification: "" });
        await refresh("Regra explícita registrada; somente agora existe limiar de alerta.");
      },
    });
  }

  function addDocument(event: FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    void submitWrite({
      keyOperation: `document-${selectedId}`,
      actionId: `document-${selectedId}`,
      actionLabel: "Registrar referência documental",
      url: `/api/ext/supplier/quotations/${selectedId}/documents`,
      body: documentForm,
      validate: validDocumentResponse,
      onSuccess: async () => {
        setDocumentForm({ document_type: "", file_name: "", file_url: "", storage_key: "" });
        await refresh("Referência documental versionada confirmada; isto não comprova upload.");
      },
    });
  }

  function createOrder() {
    if (!selectedId) return;
    void submitWrite({
      keyOperation: `order-${selectedId}`,
      actionId: `order-${selectedId}`,
      actionLabel: "Criar pedido derivado",
      url: `/api/ext/supplier/quotations/${selectedId}/orders`,
      body: { notes: orderNotes },
      validate: validOrderResponse,
      onSuccess: async data => {
        setOrderNotes("");
        const order = (data as { order: Order }).order;
        await refresh(`Pedido ${order.protocol} derivado da cotação aprovada.`);
      },
    });
  }

  function transitionOrder(orderId: string, status: string) {
    const operation = `order-${orderId}-${status}`;
    void submitWrite({
      keyOperation: operation,
      actionId: operation,
      actionLabel: `Mover pedido para ${supplierLabel(status)}`,
      url: `/api/ext/supplier/orders/${orderId}/status`,
      body: { status, reason: `Transição ${status} confirmada pela equipe interna.` },
      validate: validOrderResponse,
      onSuccess: async () => { await refresh(`Pedido confirmado em ${status}.`); },
    });
  }

  function addDeadline(event: FormEvent) {
    event.preventDefault();
    void submitWrite({
      keyOperation: `deadline-${deadlineForm.order_id}`,
      actionId: `deadline-${deadlineForm.order_id}`,
      actionLabel: "Registrar prazo do pedido",
      url: `/api/ext/supplier/orders/${deadlineForm.order_id}/deadlines`,
      body: deadlineForm,
      validate: validDeadlineResponse,
      onSuccess: async () => {
        setDeadlineForm({ order_id: "", due_date: "", source: "registro_interno", source_reference: "", justification: "" });
        await refresh("Prazo do pedido registrado com fonte; nenhum prazo foi estimado.");
      },
    });
  }

  const quote = detail?.quotation;
  const writeLocked = Boolean(busy) || Boolean(pendingWrite);
  const quoteTransitions: Record<string, string[]> = { rascunho: ["enviado", "cancelado"], enviado: ["em_analise", "cancelado"], em_analise: ["cancelado"] };
  const orderTransitions: Record<string, string[]> = { rascunho: ["emitido", "cancelado"], emitido: ["em_entrega", "cancelado"], em_entrega: ["recebido", "cancelado"], recebido: ["fechado"] };

  const references = states.references;
  const quotationState = states.quotations;
  const orderState = states.orders;
  const detailState = states.detail;

  const listsBusy = [references, quotationState, orderState].some(state =>
    state.phase === "loading" || (state.phase === "ready" && state.refreshing));

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
      <p className={styles.kicker}>UX-PRO-07C-2 · FORNECEDORES EXT-04</p>
      <h1>EXT-04 — Fornecedores</h1>
      <p className={styles.lede}>
        Jornada administrativa interna de cotações, referências documentais e pedidos. Cada leitura informa se ainda está
        consultando o servidor, se a consulta falhou ou se o recorte terminou vazio; uma falha nunca é apresentada como
        ausência de registros.
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
        <div data-testid="fornecedores-negado" data-ui-state="denied" data-write-http-status={denied.status}>
          <UiState
            variant="denied"
            title={denied.title}
            detail={`${supplierReadErrorDetail(denied)} HTTP ${denied.status}. A recusa veio do servidor; nenhum dado da jornada permanece na tela.`}
          />
        </div>
      ) : (
        <>
          {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
          {busy ? (
            <p role="status" aria-live="polite" aria-atomic="true" data-testid="fornecedores-escrita-enviando">
              Enviando {busy.actionLabel}. Aguardando resposta; o resultado ainda não foi reconciliado.
            </p>
          ) : null}
          {writeError ? (
            <div
              data-testid="fornecedores-escrita-falha"
              data-write-error-kind={writeError.kind}
              data-write-http-status={writeError.status}
              data-write-code={writeError.code || ""}
              data-write-uncertain={String(writeError.uncertain)}
            >
              <UiState variant="error" title={writeError.title} detail={supplierWriteFailureDetail(writeError)}>
                {pendingWrite ? (
                  <>
                    <p className={styles.hint}>A repetição usa o corpo capturado e a mesma chave da tentativa anterior; ela só acontece quando você aciona o botão.</p>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        data-testid="fornecedores-escrita-repetir"
                        disabled={Boolean(busy)}
                        onClick={() => void retryPendingWrite()}
                      >
                        Repetir operação com a mesma chave
                      </button>
                    </div>
                  </>
                ) : null}
              </UiState>
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
            {['Cotações', 'Detalhe canônico', 'Validade e alertas', 'Referências documentais', 'Pedidos internos'].map((label, index) => (
              <button key={label} type="button" role="tab" aria-selected={index === 0} tabIndex={index === 0 ? 0 : -1} className={index === 0 ? styles.tabActive : styles.tab}>{label}</button>
            ))}
          </nav>

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
                <select id="fornecedores-supplier" disabled={writeLocked} required value={quoteForm.supplier_id} onChange={e => setQuoteForm({ ...quoteForm, supplier_id: e.target.value, product_id: "" })}>
                  <option value="">Selecione</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="fornecedores-product">Produto do fornecedor</label>
                <select id="fornecedores-product" disabled={writeLocked} required value={quoteForm.product_id} onChange={e => setQuoteForm({ ...quoteForm, product_id: e.target.value })}>
                  <option value="">Selecione</option>
                  {productsForSupplier.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="fornecedores-quantity">Quantidade</label>
                <input id="fornecedores-quantity" disabled={writeLocked} required min={1} type="number" value={quoteForm.quantity} onChange={e => setQuoteForm({ ...quoteForm, quantity: e.target.value })} />
              </div>
              <div className={styles.field}>
                <label htmlFor="fornecedores-price">Preço unitário (R$)</label>
                <input id="fornecedores-price" disabled={writeLocked} required inputMode="decimal" value={quoteForm.unit_price} onChange={e => setQuoteForm({ ...quoteForm, unit_price: e.target.value })} />
              </div>
              <div className={styles.field}>
                <label htmlFor="fornecedores-notes">Notas (opcional, ≥10)</label>
                <input id="fornecedores-notes" disabled={writeLocked} value={quoteForm.notes} onChange={e => setQuoteForm({ ...quoteForm, notes: e.target.value })} />
              </div>
              <div className={styles.actions}>
                <button
                  type="submit"
                  className={styles.primary}
                  data-write-operation="create-quotation"
                  aria-busy={busy?.actionId === "create-quotation" ? "true" : undefined}
                  disabled={writeLocked}
                >
                  Confirmar no servidor
                </button>
              </div>
            </form>
          </section>

          <div className={styles.layout}>
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
                            disabled={writeLocked}
                            onClick={() => setSelectedId(q.id)}
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
                        <button
                          key={status}
                          type="button"
                          data-write-operation={`quote-${selectedId}-${status}`}
                          aria-busy={busy?.actionId === `quote-${selectedId}-${status}` ? "true" : undefined}
                          disabled={writeLocked}
                          onClick={() => transitionQuotation(status)}
                        >
                          Mover para {supplierLabel(status)}
                        </button>
                      ))}
                    </div>
                    {quote.status === "em_analise" && !quote.decision ? (
                      <div className={styles.fieldRow}>
                        <div className={styles.field}>
                          <label htmlFor="fornecedores-decisao">Justificativa da decisão (≥10)</label>
                          <input id="fornecedores-decisao" disabled={writeLocked} value={decisionReason} onChange={e => setDecisionReason(e.target.value)} />
                        </div>
                        <div className={styles.actions}>
                          <button
                            type="button"
                            className={styles.primary}
                            data-write-operation={`decision-${selectedId}-aprovada`}
                            aria-busy={busy?.actionId === `decision-${selectedId}-aprovada` ? "true" : undefined}
                            disabled={writeLocked}
                            onClick={() => decide("aprovada")}
                          >
                            Aprovar definitivamente
                          </button>
                          <button
                            type="button"
                            data-write-operation={`decision-${selectedId}-rejeitada`}
                            aria-busy={busy?.actionId === `decision-${selectedId}-rejeitada` ? "true" : undefined}
                            disabled={writeLocked}
                            onClick={() => decide("rejeitada")}
                          >
                            Rejeitar definitivamente
                          </button>
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
                          <input id="fornecedores-notas-pedido" disabled={writeLocked} value={orderNotes} onChange={e => setOrderNotes(e.target.value)} />
                        </div>
                        <div className={styles.actions}>
                          <button
                            type="button"
                            className={styles.primary}
                            data-write-operation={`order-${selectedId}`}
                            aria-busy={busy?.actionId === `order-${selectedId}` ? "true" : undefined}
                            disabled={writeLocked}
                            onClick={createOrder}
                          >
                            Criar pedido derivado
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>

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
                      <input id="fornecedores-valida-ate" disabled={writeLocked} required type="date" value={validityForm.valid_until} onChange={e => setValidityForm({ ...validityForm, valid_until: e.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="fornecedores-fonte">Fonte</label>
                      <select id="fornecedores-fonte" disabled={writeLocked} value={validityForm.source} onChange={e => setValidityForm({ ...validityForm, source: e.target.value })}>
                        <option value="registro_interno">registro interno</option>
                        <option value="documento_declarado">documento declarado</option>
                        <option value="email_declarado">e-mail declarado</option>
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="fornecedores-referencia">Referência da fonte</label>
                      <input id="fornecedores-referencia" disabled={writeLocked} value={validityForm.source_reference} onChange={e => setValidityForm({ ...validityForm, source_reference: e.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="fornecedores-justificativa">Justificativa (≥5)</label>
                      <input id="fornecedores-justificativa" disabled={writeLocked} required value={validityForm.justification} onChange={e => setValidityForm({ ...validityForm, justification: e.target.value })} />
                    </div>
                    <div className={styles.actions}>
                      <button
                        type="submit"
                        className={styles.primary}
                        data-write-operation={`validity-${selectedId}`}
                        aria-busy={busy?.actionId === `validity-${selectedId}` ? "true" : undefined}
                        disabled={writeLocked}
                      >
                        Registrar validade
                      </button>
                    </div>
                  </form>
                  {!detail?.alert_rule ? (
                    <form onSubmit={addAlert} className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="fornecedores-dias">Dias de antecedência</label>
                        <input id="fornecedores-dias" disabled={writeLocked} required min={1} max={365} type="number" value={alertForm.days_before} onChange={e => setAlertForm({ ...alertForm, days_before: e.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="fornecedores-regra">Justificativa da regra</label>
                        <input id="fornecedores-regra" disabled={writeLocked} required value={alertForm.justification} onChange={e => setAlertForm({ ...alertForm, justification: e.target.value })} />
                      </div>
                      <div className={styles.actions}>
                        <button
                          type="submit"
                          data-write-operation={`alert-${selectedId}`}
                          aria-busy={busy?.actionId === `alert-${selectedId}` ? "true" : undefined}
                          disabled={writeLocked}
                        >
                          Registrar regra explícita
                        </button>
                      </div>
                    </form>
                  ) : null}
                </section>
              ) : null}

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
                      <input id="fornecedores-tipo" disabled={writeLocked} required value={documentForm.document_type} onChange={e => setDocumentForm({ ...documentForm, document_type: e.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="fornecedores-nome">Nome declarado</label>
                      <input id="fornecedores-nome" disabled={writeLocked} required value={documentForm.file_name} onChange={e => setDocumentForm({ ...documentForm, file_name: e.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="fornecedores-url">file_url (referência)</label>
                      <input id="fornecedores-url" disabled={writeLocked} required value={documentForm.file_url} onChange={e => setDocumentForm({ ...documentForm, file_url: e.target.value })} />
                    </div>
                    <div className={styles.field}>
                      <label htmlFor="fornecedores-chave">storage_key (referência)</label>
                      <input id="fornecedores-chave" disabled={writeLocked} required value={documentForm.storage_key} onChange={e => setDocumentForm({ ...documentForm, storage_key: e.target.value })} />
                    </div>
                    <div className={styles.actions}>
                      <button
                        type="submit"
                        className={styles.primary}
                        data-write-operation={`document-${selectedId}`}
                        aria-busy={busy?.actionId === `document-${selectedId}` ? "true" : undefined}
                        disabled={writeLocked}
                      >
                        Registrar referência
                      </button>
                    </div>
                  </form>
                </section>
              ) : null}
            </div>
          </div>

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
                            <button
                              key={status}
                              type="button"
                              data-write-operation={`order-${orderItem.id}-${status}`}
                              aria-busy={busy?.actionId === `order-${orderItem.id}-${status}` ? "true" : undefined}
                              disabled={writeLocked}
                              onClick={() => transitionOrder(orderItem.id, status)}
                            >
                              Mover para {supplierLabel(status)}
                            </button>
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
                  <select id="fornecedores-pedido-prazo" disabled={writeLocked} required value={deadlineForm.order_id} onChange={e => setDeadlineForm({ ...deadlineForm, order_id: e.target.value })}>
                    <option value="">Selecione</option>
                    {orders.filter(o => !["fechado", "cancelado"].includes(o.status)).map(o => <option key={o.id} value={o.id}>{o.protocol}</option>)}
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="fornecedores-prazo-data">Data do prazo</label>
                  <input id="fornecedores-prazo-data" disabled={writeLocked} required type="date" value={deadlineForm.due_date} onChange={e => setDeadlineForm({ ...deadlineForm, due_date: e.target.value })} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="fornecedores-prazo-fonte">Fonte</label>
                  <select id="fornecedores-prazo-fonte" disabled={writeLocked} value={deadlineForm.source} onChange={e => setDeadlineForm({ ...deadlineForm, source: e.target.value })}>
                    <option value="registro_interno">registro interno</option>
                    <option value="cotacao_aprovada">cotação aprovada</option>
                    <option value="pedido_emitido">pedido emitido</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="fornecedores-prazo-referencia">Referência</label>
                  <input id="fornecedores-prazo-referencia" disabled={writeLocked} value={deadlineForm.source_reference} onChange={e => setDeadlineForm({ ...deadlineForm, source_reference: e.target.value })} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="fornecedores-prazo-justificativa">Justificativa (≥5)</label>
                  <input id="fornecedores-prazo-justificativa" disabled={writeLocked} required value={deadlineForm.justification} onChange={e => setDeadlineForm({ ...deadlineForm, justification: e.target.value })} />
                </div>
                <div className={styles.actions}>
                  <button
                    type="submit"
                    className={styles.primary}
                    data-write-operation={`deadline-${deadlineForm.order_id}`}
                    aria-busy={busy?.actionId === `deadline-${deadlineForm.order_id}` ? "true" : undefined}
                    disabled={writeLocked}
                  >
                    Registrar prazo
                  </button>
                </div>
              </form>
            ) : null}
          </section>
        </>
      )}
    </UiTaskWorkspace>
  );
}
