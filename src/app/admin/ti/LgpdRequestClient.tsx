"use client";
// UX-PRO-03 — 7ª promoção "com prova": PLT-10, pedidos do titular (acesso,
// correção, eliminação, portabilidade, oposição, revogação de consentimento,
// informação) com verificação de identidade, responsável atribuído, prazo de
// 15 dias, impedimentos legais documentados e histórico de transições.
// Antes: protótipo órfão, hex inline, `any`, quatro `fetch` sem verificação de
// status e um único bloco para sucesso, erro e exceção de rede. Agora: 19ª aba
// real do TiConsole, os quatro contratos preservados (lista, detalhe, canal
// público do titular e transição), papel admin/ti/rh decidido no servidor,
// fonte/data-base declaradas, drill-down ao registro canônico e ao histórico,
// quatro estados de leitura com retry e aviso de que a verificação de
// identidade é declarativa — a tela não envia resposta ao titular nem substitui
// parecer jurídico. Nenhuma rota, migração, permissão ou contrato mudou.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import UiState from "@/components/ui/UiState";
import styles from "./LgpdRequestClient.module.css";

type LgpdRequest = {
  id: string;
  request_type: string;
  status: string;
  requester_name: string;
  requester_email: string;
  requester_document_hash: string | null;
  description: string;
  verification_method: string | null;
  is_identity_verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  verified_by_id: string | null;
  responsible_id: string | null;
  responsible_name: string | null;
  due_date: string | null;
  legal_impediment: string | null;
  impediment_documented: boolean;
  response: string | null;
  response_sent_at: string | null;
  created_at: string;
  updated_at: string;
};
type HistoryEntry = {
  id: string;
  request_id: string;
  previous_status: string | null;
  next_status: string;
  reason: string | null;
  changed_by: string | null;
  changed_by_id: string | null;
  created_at: string;
};
type RequestDetail = { request: LgpdRequest; history: HistoryEntry[] };
type ReadState = { kind: "loading" } | { kind: "ready" } | { kind: "denied" } | { kind: "error"; detail: string };
type DetailState = { kind: "idle" } | { kind: "loading" } | { kind: "error"; detail: string };

const LIST_ENDPOINT = "/api/admin/lgpd/requests";
const PUBLIC_ENDPOINT = "/api/lgpd/requests";
const detailEndpoint = (id: string) => `/api/admin/lgpd/requests/${id}`;

const TYPES = ["acesso", "correcao", "eliminacao", "portabilidade", "oposicao", "revogacao_consentimento", "informacao", "outro"] as const;
const STATUSES = ["recebido", "em_verificacao", "em_analise", "aguardando_titular", "aprovado", "atendido", "rejeitado", "cancelado", "expirado"] as const;
const METHODS = ["email", "documento", "presencial", "video", "outro"] as const;
const LIMITS = ["20", "50", "100", "200"] as const;
// Espelho informativo da máquina de estados do servidor: a tela mostra as
// transições possíveis, mas quem decide e responde 400 é `lgpd-request-api.mjs`.
const TRANSITIONS: Record<string, string[]> = {
  recebido: ["em_verificacao", "cancelado"],
  em_verificacao: ["em_analise", "aguardando_titular", "rejeitado", "cancelado"],
  em_analise: ["aprovado", "rejeitado", "aguardando_titular", "cancelado"],
  aguardando_titular: ["em_analise", "rejeitado", "expirado", "cancelado"],
  aprovado: ["atendido", "rejeitado", "cancelado"],
  atendido: [],
  rejeitado: [],
  cancelado: [],
  expirado: [],
};
const OPEN_STATUSES = ["recebido", "em_verificacao", "em_analise", "aguardando_titular", "aprovado"];

const ERROR_LABELS: Record<string, string> = {
  same_origin_required: "A requisição precisa partir do próprio site (mesma origem). Recarregue a página e tente novamente.",
  admin_session_required: "Sua sessão expirou. Entre novamente para consultar os pedidos LGPD.",
  lgpd_restricted_admin_ti_rh: "Esta leitura é restrita às contas individuais de administração, TI ou RH.",
  lgpd_restricted: "Esta operação é restrita às contas individuais de administração, TI ou RH.",
  invalid_json: "O corpo da requisição não é um JSON válido ou ultrapassa o tamanho aceito.",
  invalid_request_type: "Selecione um tipo de pedido válido (acesso, correção, eliminação, portabilidade, oposição, revogação, informação ou outro).",
  invalid_requester_name: "Informe o nome do titular (até 200 caracteres).",
  invalid_requester_email: "Informe um e-mail válido do titular.",
  description_min_10: "A descrição do pedido precisa ter pelo menos 10 caracteres.",
  invalid_type: "O filtro de tipo não é válido.",
  invalid_status: "O filtro de status não é válido.",
  invalid_request_id: "O identificador do pedido não é um UUID válido.",
  invalid_next_status: "Selecione um status de destino válido.",
  invalid_transition: "Esta transição de status não é permitida pelo servidor.",
  identity_verification_required: "A identidade do titular precisa estar verificada antes de aprovar ou atender o pedido.",
  legal_impediment_must_be_documented: "Todo impedimento legal precisa estar documentado antes de rejeitar o pedido.",
  invalid_responsible_id: "O responsável precisa ser um identificador UUID de uma identidade existente.",
  invalid_verification_method: "Selecione um método de verificação válido (e-mail, documento, presencial, vídeo ou outro).",
  no_fields: "Informe ao menos um campo para atualizar o pedido.",
  not_found: "O pedido não foi localizado. Recarregue a leitura.",
  method_not_allowed: "Esta operação não é permitida pelo servidor.",
  lgpd_unavailable: "O banco de dados não respondeu à consulta de pedidos LGPD. Nada foi presumido.",
  lgpd_create_failed: "O servidor não conseguiu registrar o pedido. Tente novamente; se persistir, o banco está indisponível.",
  lgpd_update_failed: "O servidor não conseguiu atualizar o pedido. Tente novamente; se persistir, o banco está indisponível.",
};
function translate(code: unknown, detail: unknown, status?: number) {
  const key = typeof code === "string" ? code : "";
  const base = ERROR_LABELS[key]
    ?? (status === 401 || status === 403 ? ERROR_LABELS.admin_session_required : "");
  const extra = typeof detail === "string" && detail.trim() ? ` Detalhe do servidor: ${detail.trim()}` : "";
  if (base) return `${base}${extra}`;
  return "Não foi possível concluir a operação. Confira os dados e tente novamente.";
}

function parseDateOnly(value?: string | null) {
  if (!value) return null;
  const text = String(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}
function dateLabel(value?: string | null) {
  const parsed = parseDateOnly(value);
  return parsed ? parsed.toLocaleDateString("pt-BR") : "Não informada";
}
function dateTimeLabel(value?: string | null) {
  if (!value) return "Não informada";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "Data indisponível" : parsed.toLocaleString("pt-BR");
}
function daysUntil(value?: string | null) {
  const parsed = parseDateOnly(value);
  if (!parsed) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  return Math.round((parsed.valueOf() - today.valueOf()) / 86_400_000);
}
function isRecord(value: unknown): value is LgpdRequest {
  return typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string";
}
function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return <label className={styles.field}><span>{label}</span>{children}{help && <small>{help}</small>}</label>;
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: "include", cache: "no-store", ...init });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { response, data };
}

export default function LgpdRequestClient() {
  const [readState, setReadState] = useState<ReadState>({ kind: "loading" });
  const [requests, setRequests] = useState<LgpdRequest[]>([]);
  const [sourceNote, setSourceNote] = useState("");
  const [filters, setFilters] = useState({ type: "", status: "", email: "", limit: "50" });
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [detailState, setDetailState] = useState<DetailState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [operationError, setOperationError] = useState("");
  const [createForm, setCreateForm] = useState({
    request_type: "acesso", requester_name: "", requester_email: "", requester_document: "", description: "",
  });
  const [updateForm, setUpdateForm] = useState({
    next_status: "em_verificacao", reason: "", responsible_name: "", verification_method: "email",
    is_identity_verified: false, legal_impediment: "", impediment_documented: false, response: "",
  });
  const sequence = useRef(0);
  const detailSequence = useRef(0);
  const operation = useRef(false);

  const buildUrl = useCallback((current: typeof filters) => {
    const params = new URLSearchParams();
    if (current.type) params.set("type", current.type);
    if (current.status) params.set("status", current.status);
    if (current.email.trim()) params.set("email", current.email.trim());
    if (current.limit) params.set("limit", current.limit);
    const query = params.toString();
    return query ? `${LIST_ENDPOINT}?${query}` : LIST_ENDPOINT;
  }, []);

  // `clearFeedback=false` é usado por mutate: a mensagem de sucesso precisa
  // sobreviver ao reload interno. Botão, retry e montagem limpam o feedback velho.
  // `override` permite limpar os filtros e reler no mesmo clique, sem depender do
  // estado ainda não aplicado (o setState é assíncrono).
  const load = useCallback(async (clearFeedback = true, override?: typeof filters) => {
    const current = ++sequence.current;
    if (clearFeedback) { setMessage(""); setOperationError(""); }
    setReadState({ kind: "loading" });
    try {
      const { response, data } = await requestJson(buildUrl(override ?? filters));
      // Resposta fora de ordem: descarta e mantém a leitura mais recente.
      if (current !== sequence.current) return;
      if (response.status === 401 || response.status === 403) {
        setRequests([]); setDetail(null); setDetailState({ kind: "idle" }); setSourceNote("");
        setReadState({ kind: "denied" });
        return;
      }
      if (!response.ok) {
        setRequests([]); setDetail(null); setDetailState({ kind: "idle" }); setSourceNote("");
        setReadState({ kind: "error", detail: translate(data.error, data.detail, response.status) });
        return;
      }
      // Payload validado: lista ausente ou inesperada vira vazio honesto.
      const list = Array.isArray(data.requests) ? (data.requests as unknown[]).filter(isRecord) : [];
      setRequests(list);
      setSourceNote(typeof data.note === "string" ? data.note : "");
      // O detalhe aberto só é descartado quando o pedido sai da leitura: reler a
      // fila depois de uma transição não pode fechar o registro em análise.
      setDetail(previous => {
        if (!previous) return null;
        return list.some(item => item.id === previous.request.id) ? previous : null;
      });
      setReadState({ kind: "ready" });
    } catch {
      if (current !== sequence.current) return;
      setRequests([]); setDetail(null); setDetailState({ kind: "idle" }); setSourceNote("");
      setReadState({ kind: "error", detail: "Falha de rede ao consultar os pedidos LGPD. Verifique a conexão e tente novamente." });
    }
  }, [buildUrl, filters]);

  // A leitura inicial acontece uma única vez: digitar nos filtros não pode
  // disparar uma consulta por tecla — quem lê é o botão "Aplicar filtros".
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    void load();
  }, [load]);

  const openDetail = useCallback(async (id: string) => {
    const current = ++detailSequence.current;
    setDetailState({ kind: "loading" });
    try {
      const { response, data } = await requestJson(detailEndpoint(id));
      if (current !== detailSequence.current) return;
      if (response.status === 401 || response.status === 403) {
        setRequests([]); setDetail(null); setDetailState({ kind: "idle" });
        setReadState({ kind: "denied" });
        return;
      }
      if (!response.ok) {
        setDetail(null);
        setDetailState({ kind: "error", detail: translate(data.error, data.detail, response.status) });
        return;
      }
      if (!isRecord(data.request)) {
        setDetail(null);
        setDetailState({ kind: "error", detail: "O servidor devolveu um detalhe sem pedido. Recarregue a leitura." });
        return;
      }
      const request = data.request;
      setDetail({ request, history: Array.isArray(data.history) ? data.history as HistoryEntry[] : [] });
      setUpdateForm(previous => ({
        ...previous,
        next_status: (TRANSITIONS[request.status] ?? [])[0] ?? request.status,
        is_identity_verified: request.is_identity_verified,
        impediment_documented: request.impediment_documented,
        responsible_name: request.responsible_name ?? "",
        verification_method: request.verification_method ?? previous.verification_method,
        legal_impediment: request.legal_impediment ?? "",
        response: request.response ?? "",
      }));
      setDetailState({ kind: "idle" });
    } catch {
      if (current !== detailSequence.current) return;
      setDetail(null);
      setDetailState({ kind: "error", detail: "Falha de rede ao abrir o detalhe do pedido. Tente novamente." });
    }
  }, []);

  async function mutate(path: string, method: "POST" | "PATCH", body: unknown, success: string, reset?: () => void) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true); setOperationError(""); setMessage("");
    try {
      const { response, data } = await requestJson(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) { setOperationError(translate(data.error, data.detail, response.status)); return; }
      setMessage(success);
      if (method === "POST") {
        reset?.();
        await load(false);
        return;
      }
      // Transição: relê o registro aberto (com o novo histórico) e a fila.
      if (detail) await openDetail(detail.request.id);
      await load(false);
    } catch {
      setOperationError("Não foi possível concluir a operação. Confira a conexão e tente novamente.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  const stats = useMemo(() => {
    const open = requests.filter(item => OPEN_STATUSES.includes(item.status));
    const verified = requests.filter(item => item.is_identity_verified);
    const pendingDeadlines = open
      .map(item => daysUntil(item.due_date))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    const nearest = pendingDeadlines.length ? pendingDeadlines[0] : null;
    const overdue = pendingDeadlines.filter(value => value < 0).length;
    return { open: open.length, verified: verified.length, nearest, overdue };
  }, [requests]);

  const newest = requests[0] ? dateTimeLabel(requests[0].created_at) : "nenhum pedido carregado";
  const nearestLabel = stats.nearest === null
    ? "nenhum prazo em aberto"
    : stats.nearest < 0
      ? `vencido há ${Math.abs(stats.nearest)} dia(s)`
      : stats.nearest === 0
        ? "vence hoje"
        : `faltam ${stats.nearest} dia(s)`;
  const allowedNext = detail ? (TRANSITIONS[detail.request.status] ?? []) : [];
  const feedback = readState.kind === "loading"
    ? <UiState variant="loading" title="Carregando pedidos LGPD" detail="Consultando a fila de pedidos do titular, o histórico e os prazos de 15 dias." />
    : readState.kind === "denied"
      ? <UiState variant="denied" title="Acesso não autorizado" detail="Esta superfície é restrita às contas individuais de administração, TI ou RH. Nenhum dado de titular foi exposto." onRetry={() => load()} retryLabel="Tentar novamente" />
      : readState.kind === "error"
        ? <UiState variant="error" title="Falha na consulta" detail={readState.detail} onRetry={() => load()} retryLabel="Tentar novamente" />
        : requests.length === 0
          ? <UiState variant="empty" title="Nenhum pedido para esta leitura" detail="A consulta terminou sem registros com os filtros aplicados. Isso é diferente de falha: nenhum pedido foi apagado e nada foi presumido." onRetry={() => load()} retryLabel="Atualizar" />
          : null;

  return (
    <section className={styles.workspace} aria-busy={busy || readState.kind === "loading"}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>PLT-10 · LGPD e direitos do titular</p>
          <h2>Pedidos LGPD</h2>
          <p>Acesso, correção, eliminação, portabilidade, oposição, revogação de consentimento e informação: verificação de identidade, responsável atribuído, prazo de 15 dias, impedimentos legais documentados e histórico de transições.</p>
          <p className={styles.source}>
            Fonte: tabelas <code>lgpd_requests</code> e <code>lgpd_request_history</code> via <code>{LIST_ENDPOINT}</code>.
            {" "}Data-base: pedido mais recente recebido em <strong>{newest}</strong>; prazo mais próximo <strong>{nearestLabel}</strong>.
            {" "}Carregados: <strong>{requests.length}</strong> · em aberto: <strong>{stats.open}</strong> · identidade verificada: <strong>{stats.verified}</strong> · prazos vencidos: <strong>{stats.overdue}</strong>.
            {sourceNote && <> Nota da API: {sourceNote}.</>}
          </p>
        </div>
        <button type="button" onClick={() => load()} disabled={busy || readState.kind === "loading"}>Carregar pedidos</button>
      </header>

      {feedback}
      {message && <p role="status" className={styles.success}>{message}</p>}
      {operationError && <p role="alert" className={styles.error}>{operationError}</p>}

      {readState.kind === "ready" && <>
        <div className={styles.split}>
          <section className={styles.panel} aria-labelledby="lgpd-list-title">
            <div className={styles.sectionHeading}>
              <div>
                <h3 id="lgpd-list-title">Fila de pedidos</h3>
                <p>Filtros aplicados à leitura administrativa; quem autoriza e ordena é o servidor.</p>
              </div>
              <span className={styles.count}>{requests.length}</span>
            </div>
            <div className={styles.inlineForm}>
              <Field label="Filtrar por tipo"><select value={filters.type} onChange={event => setFilters({ ...filters, type: event.target.value })}>
                <option value="">todos</option>
                {TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select></Field>
              <Field label="Filtrar por status"><select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}>
                <option value="">todos</option>
                {STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
              </select></Field>
              <Field label="Filtrar por e-mail" help="Busca parcial, sem revelar mais do que a consulta devolve."><input value={filters.email} onChange={event => setFilters({ ...filters, email: event.target.value })} /></Field>
              <Field label="Limite de registros"><select value={filters.limit} onChange={event => setFilters({ ...filters, limit: event.target.value })}>
                {LIMITS.map(limit => <option key={limit} value={limit}>{limit}</option>)}
              </select></Field>
              <div className={styles.actions}>
                <button type="button" className={styles.primary} disabled={busy} onClick={() => load()}>Aplicar filtros</button>
                <button type="button" disabled={busy} onClick={() => { const cleared = { type: "", status: "", email: "", limit: "50" }; setFilters(cleared); void load(true, cleared); }}>Limpar filtros</button>
              </div>
            </div>
            <ul className={styles.recordList}>
              {requests.map(item => {
                const remaining = daysUntil(item.due_date);
                const open = OPEN_STATUSES.includes(item.status);
                const deadlineTone = !open || remaining === null ? styles.note
                  : remaining < 0 ? styles.critical : remaining <= 3 ? styles.warning : styles.ok;
                const deadlineText = remaining === null ? "prazo não informado"
                  : remaining < 0 ? `prazo vencido há ${Math.abs(remaining)} dia(s)`
                    : remaining === 0 ? "prazo vence hoje"
                      : `faltam ${remaining} dia(s)`;
                return (
                  <li key={item.id} aria-current={detail?.request.id === item.id ? "true" : undefined}>
                    <strong>{item.request_type} · {item.status}</strong>
                    <span>{item.requester_name} · {item.requester_email} · recebido em {dateTimeLabel(item.created_at)}</span>
                    <span className={deadlineTone}>prazo {dateLabel(item.due_date)} — {deadlineText}</span>
                    <span>
                      identidade {item.is_identity_verified ? `verificada (${item.verification_method ?? "método não informado"}) em ${dateTimeLabel(item.verified_at)} por ${item.verified_by ?? "não informado"}` : "não verificada"}
                      {" · "}responsável {item.responsible_name ?? "não atribuído"}
                      {" · "}doc. hash {item.requester_document_hash ? String(item.requester_document_hash).slice(0, 12) : "sem documento"}
                    </span>
                    <span>{item.description}</span>
                    <div className={styles.actions}>
                      <button type="button" disabled={busy || detailState.kind === "loading"} onClick={() => openDetail(item.id)}>Abrir detalhe e histórico</button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <details className={styles.subsection}>
              <summary>Registrar pedido pelo canal público do titular</summary>
              <p className={styles.note}>
                Usa <code>POST {PUBLIC_ENDPOINT}</code> — o mesmo contrato público, de mesma origem, com corpo limitado a 10 KB. O documento informado é armazenado apenas como hash: a tela nunca o exibe de volta. O prazo de 15 dias é calculado pelo servidor no registro.
              </p>
              <div className={styles.formGrid}>
                <Field label="Tipo do pedido"><select value={createForm.request_type} onChange={event => setCreateForm({ ...createForm, request_type: event.target.value })}>
                  {TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select></Field>
                <Field label="Nome do titular"><input value={createForm.requester_name} onChange={event => setCreateForm({ ...createForm, requester_name: event.target.value })} /></Field>
                <Field label="E-mail do titular"><input type="email" value={createForm.requester_email} onChange={event => setCreateForm({ ...createForm, requester_email: event.target.value })} /></Field>
                <Field label="Documento do titular" help="Opcional; armazenado apenas como hash (SHA-256 truncado)."><input value={createForm.requester_document} onChange={event => setCreateForm({ ...createForm, requester_document: event.target.value })} /></Field>
                <div className={styles.full}><Field label="Descrição do pedido" help="Mínimo de 10 caracteres."><textarea rows={3} value={createForm.description} onChange={event => setCreateForm({ ...createForm, description: event.target.value })} /></Field></div>
              </div>
              <button type="button" className={styles.primary} disabled={busy} onClick={() => mutate(
                PUBLIC_ENDPOINT, "POST",
                {
                  request_type: createForm.request_type,
                  requester_name: createForm.requester_name.trim(),
                  requester_email: createForm.requester_email.trim(),
                  requester_document: createForm.requester_document.trim() || null,
                  description: createForm.description.trim(),
                },
                "Pedido registrado pelo canal público. A identidade ainda precisa ser verificada.",
                () => setCreateForm({ request_type: "acesso", requester_name: "", requester_email: "", requester_document: "", description: "" }),
              )}>Criar pedido público</button>
            </details>
          </section>

          <section className={styles.panel} aria-labelledby="lgpd-detail-title">
            <div className={styles.sectionHeading}>
              <div>
                <h3 id="lgpd-detail-title">Detalhe e transição</h3>
                <p>Registro canônico, histórico de status e as transições permitidas pelo servidor.</p>
              </div>
            </div>
            {detailState.kind === "loading" && <UiState variant="loading" title="Abrindo o pedido" detail="Consultando o registro canônico e o histórico de transições." />}
            {detailState.kind === "error" && <UiState variant="error" title="Não foi possível abrir o pedido" detail={detailState.detail} onRetry={() => load()} retryLabel="Recarregar a leitura" />}
            {/* Nada foi lido ainda: isto é ausência de seleção, não leitura vazia —
                por isso não usa UiState nem entra como `data-ui-state`. */}
            {detailState.kind === "idle" && !detail && <p className={styles.note}>Nenhum pedido aberto. Escolha um pedido na fila para ver o registro canônico, o histórico e as transições possíveis.</p>}
            {detailState.kind === "idle" && detail && <>
              <p><strong>{detail.request.request_type} · {detail.request.status}</strong> · pedido {detail.request.id}</p>
              <p className={styles.note}>
                Titular: {detail.request.requester_name} ({detail.request.requester_email}) · doc. hash {detail.request.requester_document_hash ? String(detail.request.requester_document_hash).slice(0, 16) : "sem documento"}
                {" · "}prazo {dateLabel(detail.request.due_date)}
                {" · "}verificação {detail.request.verification_method ?? "não informada"}
                {" · "}responsável {detail.request.responsible_name ?? "não atribuído"}
                {" · "}impedimento legal {detail.request.legal_impediment ?? "não informado"} ({detail.request.impediment_documented ? "documentado" : "não documentado"})
                {" · "}resposta ao titular {detail.request.response ? "registrada" : "não registrada"}{detail.request.response_sent_at ? ` em ${dateTimeLabel(detail.request.response_sent_at)}` : ""}
                {" · "}atualizado em {dateTimeLabel(detail.request.updated_at)}
              </p>
              <details className={styles.subsection} open><summary>Histórico de transições ({detail.history.length})</summary>
                {detail.history.length === 0
                  ? <p className={styles.note}>Nenhuma transição registrada para este pedido.</p>
                  : <ul className={styles.historyList}>
                    {detail.history.map(entry => <li key={entry.id}>
                      {dateTimeLabel(entry.created_at)} — {entry.previous_status ?? "—"} → <strong>{entry.next_status}</strong> por {entry.changed_by ?? "não informado"}{entry.reason ? ` · ${entry.reason}` : ""}
                    </li>)}
                  </ul>}
              </details>
              <details className={styles.subsection}><summary>Registro canônico do pedido (JSON)</summary><pre className={styles.pre}>{JSON.stringify(detail.request, null, 2)}</pre></details>
              <div className={styles.formGrid}>
                <Field label="Próximo status" help={allowedNext.length ? `Permitido pelo servidor a partir de ${detail.request.status}.` : "Este status é final: o servidor não permite nova transição."}>
                  <select value={updateForm.next_status} onChange={event => setUpdateForm({ ...updateForm, next_status: event.target.value })}>
                    {(allowedNext.length ? allowedNext : STATUSES).map(status => <option key={status} value={status}>{status}</option>)}
                  </select>
                </Field>
                <Field label="Método de verificação"><select value={updateForm.verification_method} onChange={event => setUpdateForm({ ...updateForm, verification_method: event.target.value })}>
                  {METHODS.map(method => <option key={method} value={method}>{method}</option>)}
                </select></Field>
                <Field label="Responsável pelo pedido" help="Nome de quem conduz o atendimento."><input value={updateForm.responsible_name} onChange={event => setUpdateForm({ ...updateForm, responsible_name: event.target.value })} /></Field>
                <Field label="Motivo da transição" help="Gravado no histórico; obrigatório para auditar a decisão."><input value={updateForm.reason} onChange={event => setUpdateForm({ ...updateForm, reason: event.target.value })} /></Field>
                <div className={styles.full}><Field label="Impedimento legal" help="Se houver, marque também a documentação: o servidor rejeita impedimento sem documento."><textarea rows={2} value={updateForm.legal_impediment} onChange={event => setUpdateForm({ ...updateForm, legal_impediment: event.target.value })} /></Field></div>
                <div className={styles.full}><Field label="Resposta ao titular" help="Registrada no pedido; o envio efetivo depende de provedor de e-mail e decisão do proprietário."><textarea rows={3} value={updateForm.response} onChange={event => setUpdateForm({ ...updateForm, response: event.target.value })} /></Field></div>
              </div>
              <div className={styles.checkRow}>
                <label><input type="checkbox" checked={updateForm.is_identity_verified} onChange={event => setUpdateForm({ ...updateForm, is_identity_verified: event.target.checked })} /> identidade verificada</label>
                <label><input type="checkbox" checked={updateForm.impediment_documented} onChange={event => setUpdateForm({ ...updateForm, impediment_documented: event.target.checked })} /> impedimento documentado</label>
              </div>
              <p className={styles.note}>Aprovar ou atender exige identidade verificada; rejeitar com impedimento legal exige documento. As duas regras são decididas no servidor (<code>identity_verification_required</code>, <code>legal_impediment_must_be_documented</code>).</p>
              <button type="button" className={styles.primary} disabled={busy} onClick={() => mutate(
                detailEndpoint(detail.request.id), "PATCH",
                {
                  next_status: updateForm.next_status,
                  reason: updateForm.reason.trim(),
                  responsible_name: updateForm.responsible_name.trim(),
                  verification_method: updateForm.verification_method,
                  is_identity_verified: updateForm.is_identity_verified,
                  legal_impediment: updateForm.legal_impediment.trim(),
                  impediment_documented: updateForm.impediment_documented,
                  response: updateForm.response.trim(),
                },
                "Pedido atualizado. A transição foi registrada no histórico pelo servidor.",
              )}>Atualizar pedido</button>
            </>}
          </section>
        </div>

        <section className={styles.panel}>
          <h3>Limites e decisões pendentes</h3>
          <p className={styles.note}>
            A lista e o detalhe exibem nome e e-mail do titular porque a API <strong>já devolve</strong> esses campos às contas individuais de administração, TI ou RH (<code>lgpd_restricted_admin_ti_rh</code>); nenhuma permissão foi ampliada e o documento do titular não existe aqui — ele é armazenado apenas como hash. Marcar <strong>identidade verificada</strong> é uma declaração do operador, não uma prova: o procedimento de verificação, o responsável formal (DPO/encarregado), a resposta efetiva ao titular e o tratamento de impedimentos legais dependem de <strong>parecer jurídico</strong> e de decisão do proprietário (LGPD, prazo de 15 dias, CLT e obrigações fiscais). Esta tela <strong>não envia</strong> e-mail, <strong>não elimina</strong> dados e <strong>não</strong> substitui o canal público do titular. <strong>Produção: NO-GO.</strong>
          </p>
        </section>
      </>}
    </section>
  );
}
