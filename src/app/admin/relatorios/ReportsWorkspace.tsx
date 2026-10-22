"use client";

import UiTaskWorkspace from "@/components/ui/UiTaskWorkspace";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./ReportsWorkspace.module.css";

type Report = {
  id: string;
  protocol: string;
  title: string;
  report_type: string;
  period_start: string;
  period_end: string;
  status: string;
  totals?: Record<string, unknown> | string | null;
  total_records?: number | null;
  recipient_emails?: string[] | null;
  generated_at?: string | null;
  sent_at?: string | null;
  approved_at?: string | null;
  created_at?: string | null;
  approval_note?: string | null;
  send_note?: string | null;
};

type ReportEvent = {
  id: string;
  event_type: string;
  summary: string;
  created_at: string | null;
};

type ReportDetail = { report: Report; events: ReportEvent[] };
type ApiError = { status: number; code: string };
type ListState =
  | { phase: "loading" }
  | { phase: "failed" | "denied"; error: ApiError }
  | { phase: "ready"; data: Report[]; readAt: string }
  | { phase: "refreshing"; data: Report[]; readAt: string }
  | { phase: "stale"; data: Report[]; readAt: string; error: ApiError };
type DetailState =
  | { phase: "loading" }
  | { phase: "failed" | "denied"; error: ApiError }
  | { phase: "ready"; data: ReportDetail; readAt: string }
  | { phase: "refreshing"; data: ReportDetail; readAt: string }
  | { phase: "stale"; data: ReportDetail; readAt: string; error: ApiError };

const REPORT_TYPES = ["comercial", "operacional", "financeiro", "qualidade", "satisfacao", "compliance"];
const TYPE_LABELS: Record<string, string> = {
  comercial: "Comercial",
  operacional: "Operacional",
  financeiro: "Financeiro",
  qualidade: "Qualidade",
  satisfacao: "Satisfação",
  compliance: "Conformidade",
};
const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
  arquivado: "Arquivado",
  gerado: "Totais contados",
  envio_registrado: "Envio registrado internamente",
};
const EVENT_LABELS: Record<string, string> = {
  report_created: "Definição criada",
  report_em_revisao: "Enviado para revisão",
  report_aprovado: "Aprovação registrada",
  report_arquivado: "Arquivamento registrado",
  report_generated: "Totais contados",
  report_dispatch_registered: "Registro interno de envio",
};
const SOURCE_LABELS: Record<string, string> = {
  public_leads: "Leads recebidos",
  crm_contacts: "Contatos do CRM",
  client_tickets: "Chamados de clientes",
  fin_accounts_receivable: "Contas a receber",
  fin_payments: "Pagamentos",
  ext_quality_nonconformities: "Não conformidades",
  ext_quality_actions: "Ações de qualidade",
  ext_satisfaction_surveys: "Pesquisas de satisfação",
  ext_compliance_documents: "Documentos de conformidade",
  ext_compliance_obligations: "Obrigações de conformidade",
};

class RequestFailure extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

const key = (label: string) => `ext13-ui-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new RequestFailure(0, "network_error");
  }
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new RequestFailure(response.status, typeof data?.error === "string" ? data.error : "request_failed");
  }
  return data as T;
}

function failureOf(error: unknown): ApiError {
  return error instanceof RequestFailure ? { status: error.status, code: error.code } : { status: 0, code: "network_error" };
}

function errorCopy(error: ApiError): { title: string; detail: string } {
  if (error.status === 401) return { title: "Sua sessão precisa ser renovada", detail: "Entre novamente para consultar relatórios." };
  if (error.status === 403) return { title: "Acesso não autorizado", detail: "A permissão necessária não foi concedida. A tela não substitui a decisão do servidor." };
  if (error.code === "network_error") return { title: "Não foi possível conectar ao serviço", detail: "Confira a conexão e tente consultar novamente." };
  if (error.code === "database_error" || error.code === "internal_error") return { title: "O serviço de relatórios está indisponível", detail: "A leitura não foi concluída. Os dados anteriores, se houver, continuam identificados como a última leitura válida." };
  if (error.code === "invalid_period") return { title: "Período inválido", detail: "A data final precisa ser igual ou posterior à data inicial." };
  if (error.code === "invalid_recipients" || error.code === "recipient_not_active_staff") return { title: "Destinatários não confirmados", detail: "O servidor aceita somente endereços válidos de pessoas staff ativas." };
  if (error.code === "audit_unavailable") return { title: "A operação não foi registrada", detail: "A trilha de auditoria está indisponível; o servidor reverteu a operação." };
  if (error.code === "approval_required") return { title: "Aprovação necessária", detail: "O relatório precisa estar aprovado antes de contar os totais." };
  if (error.code === "generation_required") return { title: "Geração necessária", detail: "Os totais precisam ser contados antes de registrar o envio interno." };
  if (error.code === "justification_required" || error.code === "send_note_required") return { title: "Justificativa obrigatória", detail: "Escreva o motivo da decisão no campo correspondente antes de repetir a ação." };
  if (error.code === "invalid_transition") return { title: "Etapa indisponível para este estado", detail: "Atualize a leitura e confira o ciclo de vida registrado pelo servidor." };
  return { title: "A operação não foi concluída", detail: "Confira o estado atual do relatório e tente novamente se a ação continuar disponível." };
}

function reportTypeLabel(value: string): string { return TYPE_LABELS[value] || "Tipo não reconhecido"; }
function reportStatusLabel(value: string): string { return STATUS_LABELS[value] || "Estado não reconhecido"; }
function reportStatusTone(value: string): string {
  if (value === "aprovado" || value === "gerado" || value === "envio_registrado") return styles.success;
  if (value === "em_revisao") return styles.warning;
  if (value === "arquivado") return styles.muted;
  return styles.neutral;
}
function dateLabel(value: string | null | undefined): string {
  if (!value) return "Não informado";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00-03:00`);
  return Number.isNaN(date.valueOf()) ? "Data não reconhecida" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(date);
}
function dateTimeLabel(value: string | null | undefined): string {
  if (!value) return "Não informado";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Data não reconhecida" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date);
}
function readTimeLabel(value: string): string {
  return `${dateTimeLabel(value)} (fuso de São Paulo)`;
}
function measuredCount(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("pt-BR").format(value) : "Não contado";
}
function normalizeTotals(value: Report["totals"]): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { const parsed: unknown = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null; } catch { return null; }
  }
  return null;
}

export default function ReportsWorkspace() {
  const [listState, setListState] = useState<ListState>({ phase: "loading" });
  const [detailState, setDetailState] = useState<DetailState>({ phase: "loading" });
  const listStateRef = useRef(listState);
  const detailStateRef = useRef(detailState);
  const [title, setTitle] = useState("Relatório mensal comercial");
  const [reportType, setReportType] = useState("comercial");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [recipients, setRecipients] = useState("");
  const [approvalNote, setApprovalNote] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [actionError, setActionError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const detailRequest = useRef(0);

  function updateListState(next: ListState) {
    listStateRef.current = next;
    setListState(next);
  }

  function updateDetailState(next: DetailState) {
    detailStateRef.current = next;
    setDetailState(next);
  }

  const loadReports = useCallback(async () => {
    const current = listStateRef.current;
    const previous = "data" in current ? current.data : null;
    const previousReadAt = "readAt" in current ? current.readAt : null;
    updateListState(previous && previousReadAt ? { phase: "refreshing", data: previous, readAt: previousReadAt } : { phase: "loading" });
    try {
      const payload = await requestJson<{ items: Report[] }>("/api/ext/reports/periodic", { cache: "no-store" });
      if (!payload || !Array.isArray(payload.items)) throw new RequestFailure(502, "invalid_response");
      const readAt = new Date().toISOString();
      updateListState({ phase: "ready", data: payload.items, readAt });
      setSelectedId(current => current && payload.items.some(item => item.id === current) ? current : payload.items[0]?.id || "");
      return true;
    } catch (cause) {
      const error = failureOf(cause);
      if (error.status === 401 || error.status === 403) {
        updateListState({ phase: "denied", error });
        setSelectedId("");
        updateDetailState({ phase: "denied", error });
      } else if (previous && previousReadAt) {
        updateListState({ phase: "stale", data: previous, readAt: previousReadAt, error });
      } else {
        updateListState({ phase: "failed", error });
      }
      return false;
    }
  }, []);

  const loadDetail = useCallback(async (id: string, preserve = false) => {
    if (!id) { updateDetailState({ phase: "loading" }); return false; }
    const requestId = ++detailRequest.current;
    const current = detailStateRef.current;
    const previous = preserve && "data" in current && current.data.report.id === id ? current.data : null;
    const previousReadAt = previous && "readAt" in current ? current.readAt : null;
    updateDetailState(previous && previousReadAt ? { phase: "refreshing", data: previous, readAt: previousReadAt } : { phase: "loading" });
    try {
      const data = await requestJson<ReportDetail>(`/api/ext/reports/periodic/${id}`, { cache: "no-store" });
      if (!data?.report || !Array.isArray(data.events)) throw new RequestFailure(502, "invalid_response");
      if (requestId === detailRequest.current) updateDetailState({ phase: "ready", data, readAt: new Date().toISOString() });
      return true;
    } catch (cause) {
      if (requestId !== detailRequest.current) return false;
      const error = failureOf(cause);
      if (error.status === 401) {
        updateListState({ phase: "denied", error });
        setSelectedId("");
        updateDetailState({ phase: "denied", error });
      } else if (error.status === 403) updateDetailState({ phase: "denied", error });
      else if (previous && previousReadAt) updateDetailState({ phase: "stale", data: previous, readAt: previousReadAt, error });
      else updateDetailState({ phase: "failed", error });
      return false;
    }
  }, []);

  useEffect(() => { void loadReports(); }, [loadReports]);
  useEffect(() => {
    if (!selectedId) {
      if (detailStateRef.current.phase !== "denied") updateDetailState({ phase: "loading" });
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function createReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setActionError(null); setNotice("");
    const emails = recipients.split(",").map(item => item.trim()).filter(Boolean);
    try {
      const data = await requestJson<{ report: Report }>("/api/ext/reports/periodic", {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": key("create") },
        body: JSON.stringify({ title, report_type: reportType, period_start: periodStart, period_end: periodEnd, recipient_emails: emails, change_summary: "Definição de relatório criada pela interface EXT-13" }),
      });
      setNotice(`Relatório ${data.report.protocol} criado como rascunho.`);
      setSelectedId(data.report.id);
      await loadReports();
    } catch (cause) { setActionError(failureOf(cause)); }
    finally { setBusy(false); }
  }

  async function act(path: "/transition" | "/generate" | "/send", body: Record<string, unknown>, label: string) {
    const report = "data" in listState ? listState.data.find(item => item.id === selectedId) : null;
    if (!report) { setActionError({ status: 0, code: "select_report" }); return; }
    if (busy) return;
    setBusy(true); setActionError(null); setNotice("");
    try {
      const result = await requestJson<{ note?: string }>(`/api/ext/reports/periodic/${report.id}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": key(label) },
        body: JSON.stringify(body),
      });
      setNotice(result.note || `O servidor confirmou: ${label}.`);
      await loadReports();
      await loadDetail(report.id, true);
    } catch (cause) {
      const error = failureOf(cause);
      setActionError(error);
      if (error.status === 401) {
        updateListState({ phase: "denied", error });
        setSelectedId("");
        updateDetailState({ phase: "denied", error });
      }
    } finally { setBusy(false); }
  }

  const reports = "data" in listState ? listState.data : [];
  const selectedDetail = "data" in detailState ? detailState.data : null;
  const selectedReport = selectedDetail?.report || reports.find(item => item.id === selectedId) || null;

  return (
    <UiTaskWorkspace id="periodic-reports-workspace">
      <div className={styles.workspace}>
        <header className={styles.header}>
          <p className={styles.kicker}>EXT-13 · Relatórios internos</p>
          <h1>Relatórios periódicos</h1>
          <p className={styles.lede}>Defina um período e uma fonte, acompanhe a revisão e consulte as contagens registradas.</p>
          <p className={styles.boundary}>
            Esta tela não usa os handlers legados como cobertura. Os totais são contados de tabelas internas reais no período informado. O envio é um registro interno autorizado e auditado:
            nenhum arquivo é gerado e nenhum e-mail ou mensagem externa é enviado.
          </p>
        </header>

        {actionError ? <div className={styles.error} role="alert"><strong>{errorCopy(actionError).title}</strong><span>{actionError.code === "select_report" ? "Selecione um relatório carregado antes de escolher uma ação." : errorCopy(actionError).detail}</span></div> : null}
        {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

        <div className={styles.topGrid}>
          <form className={styles.card} onSubmit={createReport}>
            <h2>Nova definição</h2>
            <p className={styles.sectionIntro}>A definição registra somente os campos e destinatários; a contagem acontece após aprovação.</p>
            <div className={styles.formGrid}>
              <label className={styles.field} htmlFor="periodic-report-title">Título
                <input id="periodic-report-title" minLength={5} maxLength={200} required value={title} onChange={event => setTitle(event.target.value)} />
              </label>
              <label className={styles.field} htmlFor="periodic-report-type">Tipo e fonte
                <select id="periodic-report-type" value={reportType} onChange={event => setReportType(event.target.value)}>
                  {REPORT_TYPES.map(item => <option key={item} value={item}>{reportTypeLabel(item)}</option>)}
                </select>
              </label>
              <label className={styles.field} htmlFor="periodic-report-start">Início do período
                <input id="periodic-report-start" type="date" required value={periodStart} onChange={event => setPeriodStart(event.target.value)} />
              </label>
              <label className={styles.field} htmlFor="periodic-report-end">Fim do período
                <input id="periodic-report-end" type="date" min={periodStart || undefined} required value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} />
              </label>
              <label className={`${styles.field} ${styles.fullField}`} htmlFor="periodic-report-recipients">E-mails de pessoas staff ativas, separados por vírgula
                <input id="periodic-report-recipients" type="text" required value={recipients} onChange={event => setRecipients(event.target.value)} aria-describedby="periodic-report-recipients-help" />
                <small id="periodic-report-recipients-help">O servidor confirma que cada destinatário pertence ao quadro staff ativo. Nenhuma mensagem será enviada por esta tela.</small>
              </label>
            </div>
            <button type="submit" className={styles.primaryButton} disabled={busy}>{busy ? "Salvando…" : "Criar definição de relatório"}</button>
          </form>

          <section className={styles.card} aria-labelledby="report-lifecycle-title">
            <h2 id="report-lifecycle-title">Ciclo de vida</h2>
            <p className={styles.sectionIntro}>As ações são autorizadas e registradas pelo servidor conforme o estado atual.</p>
            <label className={styles.field} htmlFor="periodic-report-selected">Relatório selecionado
              <select id="periodic-report-selected" value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={!reports.length}>
                <option value="">{reports.length ? "Selecione um relatório" : "Nenhum relatório carregado"}</option>
                {reports.map(report => <option key={report.id} value={report.id}>{report.protocol} · {reportStatusLabel(report.status)}</option>)}
              </select>
            </label>
            <div className={styles.actionGroup}>
              <button type="button" className={styles.secondaryButton} disabled={busy || !selectedReport} onClick={() => void act("/transition", { status: "em_revisao" }, "revisao")}>Enviar para revisão</button>
              <label className={styles.field} htmlFor="periodic-report-approval-note">Justificativa da aprovação (mínimo de 10 caracteres)
                <textarea id="periodic-report-approval-note" minLength={10} maxLength={1000} required value={approvalNote} onChange={event => setApprovalNote(event.target.value)} />
              </label>
              <button type="button" className={styles.secondaryButton} disabled={busy || !selectedReport || approvalNote.trim().length < 10} onClick={() => void act("/transition", { status: "aprovado", approval_note: approvalNote.trim() }, "aprovacao")}>Registrar aprovação com justificativa</button>
              <button type="button" className={styles.secondaryButton} disabled={busy || !selectedReport} onClick={() => void act("/generate", { generation_note: "Contagem executada nas fontes internas definidas para o período." }, "geracao")}>Contar totais das fontes</button>
              <label className={styles.field} htmlFor="periodic-report-send-note">Nota para o registro interno de envio (mínimo de 10 caracteres)
                <textarea id="periodic-report-send-note" minLength={10} maxLength={1000} required value={sendNote} onChange={event => setSendNote(event.target.value)} />
              </label>
              <button type="button" className={styles.secondaryButton} disabled={busy || !selectedReport || sendNote.trim().length < 10} onClick={() => void act("/send", { send_note: sendNote.trim() }, "envio")}>Registrar envio interno</button>
            </div>
          </section>
        </div>

        <section className={styles.card} aria-labelledby="reports-list-title">
          <div className={styles.sectionHeading}>
            <div><h2 id="reports-list-title">Relatórios canônicos</h2><p className={styles.sectionIntro}>Período, estado, contagem e destinatários da última leitura válida.</p></div>
            <button type="button" className={styles.secondaryButton} onClick={() => void loadReports()} disabled={listState.phase === "loading" || listState.phase === "refreshing"}>Atualizar relatórios</button>
          </div>
          {listState.phase === "loading" ? <p className={styles.loading} role="status" data-report-state="loading">Carregando relatórios. A lista vazia só será confirmada após a resposta.</p> : null}
          {listState.phase === "failed" || listState.phase === "denied" ? (
            <div className={styles.error} role="alert" data-report-state={listState.phase}><strong>{errorCopy(listState.error).title}</strong><span>{errorCopy(listState.error).detail}</span>{listState.phase !== "denied" && listState.error.status !== 403 ? <button type="button" className={styles.secondaryButton} onClick={() => void loadReports()}>Tentar novamente</button> : null}</div>
          ) : null}
          {listState.phase === "refreshing" ? <p className={styles.loading} role="status" data-report-state="refreshing">Atualizando. A leitura anterior continua visível enquanto o serviço responde.</p> : null}
          {listState.phase === "stale" ? (
            <div className={styles.error} role="alert" data-report-state="stale"><strong>A atualização falhou; os dados abaixo são da última leitura válida.</strong><span>{errorCopy(listState.error).detail}</span><small>Última leitura: {readTimeLabel(listState.readAt)}</small>{listState.error.status !== 403 ? <button type="button" className={styles.secondaryButton} onClick={() => void loadReports()}>Tentar novamente</button> : null}</div>
          ) : null}
          {"data" in listState && listState.data.length === 0 ? <p className={styles.empty} data-report-state="empty">A leitura foi concluída em {readTimeLabel(listState.readAt)} e não encontrou relatórios canônicos. Isso não representa totais de fontes nem uma aprovação.</p> : null}
          {reports.length > 0 ? <div className={styles.reportList} data-report-state={listState.phase === "stale" ? "stale" : "ready"}>
            {"readAt" in listState ? <p className={styles.readAt}>Última leitura válida: {readTimeLabel(listState.readAt)}</p> : null}
            {reports.map(report => <article key={report.id} className={`${styles.reportCard} ${selectedId === report.id ? styles.selectedReport : ""}`}>
              <div className={styles.reportTitleRow}><div><h3>{report.title}</h3><p className={styles.protocol}>Protocolo {report.protocol}</p></div><span className={`${styles.status} ${reportStatusTone(report.status)}`}>{reportStatusLabel(report.status)}</span></div>
              <dl className={styles.reportFacts}>
                <div><dt>Tipo</dt><dd>{reportTypeLabel(report.report_type)}</dd></div>
                <div><dt>Período definido</dt><dd>{dateLabel(report.period_start)} a {dateLabel(report.period_end)}</dd></div>
                <div><dt>Registros contados</dt><dd>{measuredCount(report.total_records)}</dd></div>
                <div><dt>Destinatários registrados</dt><dd>{Array.isArray(report.recipient_emails) && report.recipient_emails.length ? report.recipient_emails.join(", ") : "Não informados"}</dd></div>
              </dl>
              <button type="button" className={styles.linkButton} aria-pressed={selectedId === report.id} onClick={() => setSelectedId(report.id)}>{selectedId === report.id ? "Detalhe selecionado" : "Ver detalhe e trilha"}</button>
            </article>)}
          </div> : null}
        </section>

        <section className={styles.card} aria-labelledby="report-detail-title">
          <div className={styles.sectionHeading}><div><h2 id="report-detail-title">Detalhe e trilha</h2><p className={styles.sectionIntro}>Campos canônicos do relatório; eventos são somente leitura.</p></div></div>
          {detailState.phase === "loading" ? <p className={styles.loading} role="status">Selecione um relatório acima para carregar o detalhe.</p> : null}
          {detailState.phase === "failed" || detailState.phase === "denied" ? <div className={styles.error} role="alert"><strong>{errorCopy(detailState.error).title}</strong><span>{errorCopy(detailState.error).detail}</span>{detailState.phase !== "denied" && detailState.error.status !== 403 ? <button type="button" className={styles.secondaryButton} onClick={() => void loadDetail(selectedId, true)}>Tentar novamente</button> : null}</div> : null}
          {detailState.phase === "refreshing" ? <p className={styles.loading} role="status">Atualizando o detalhe; a leitura válida continua visível.</p> : null}
          {detailState.phase === "stale" ? <div className={styles.error} role="alert"><strong>A atualização do detalhe falhou; os dados anteriores continuam visíveis.</strong><span>{errorCopy(detailState.error).detail}</span><small>Última leitura: {readTimeLabel(detailState.readAt)}</small><button type="button" className={styles.secondaryButton} onClick={() => void loadDetail(selectedId, true)}>Tentar novamente</button></div> : null}
          {selectedDetail ? <ReportDetailView detail={selectedDetail} /> : null}
        </section>
      </div>
    </UiTaskWorkspace>
  );
}

function ReportDetailView({ detail }: { detail: ReportDetail }) {
  const report = detail.report;
  const totals = normalizeTotals(report.totals);
  const sources = totals?.sources && typeof totals.sources === "object" && !Array.isArray(totals.sources) ? totals.sources as Record<string, unknown> : null;
  return <div className={styles.detail}>
    <header className={styles.detailHeader}><div><p className={styles.kicker}>{reportTypeLabel(report.report_type)} · {report.protocol}</p><h3>{report.title}</h3></div><span className={`${styles.status} ${reportStatusTone(report.status)}`}>{reportStatusLabel(report.status)}</span></header>
    <dl className={styles.detailFacts}>
      <div><dt>Período</dt><dd>{dateLabel(report.period_start)} a {dateLabel(report.period_end)}</dd></div>
      <div><dt>Estado</dt><dd>{reportStatusLabel(report.status)}</dd></div>
      <div><dt>Total contado</dt><dd>{measuredCount(report.total_records)}</dd></div>
      <div><dt>Destinatários</dt><dd>{Array.isArray(report.recipient_emails) && report.recipient_emails.length ? report.recipient_emails.join(", ") : "Não informados"}</dd></div>
      <div><dt>Criado em</dt><dd>{dateTimeLabel(report.created_at)}</dd></div>
      <div><dt>Totais contados em</dt><dd>{dateTimeLabel(report.generated_at)}</dd></div>
      <div><dt>Envio registrado em</dt><dd>{dateTimeLabel(report.sent_at)}</dd></div>
      {report.approval_note ? <div className={styles.fullFact}><dt>Justificativa da aprovação registrada</dt><dd>{report.approval_note}</dd></div> : null}
      {report.send_note ? <div className={styles.fullFact}><dt>Nota do registro interno de envio</dt><dd>{report.send_note}</dd></div> : null}
    </dl>
    <section className={styles.subsection} aria-labelledby="report-sources-title">
      <h4 id="report-sources-title">Fontes e contagens</h4>
      {sources ? <>
        <p className={styles.sectionIntro}>Contagem real executada pelo servidor por data de criação dentro do período definido.</p>
        <dl className={styles.sourceList}>{Object.entries(sources).map(([source, value]) => <div key={source}><dt>{SOURCE_LABELS[source] || "Fonte interna"}</dt><dd>{measuredCount(value)}</dd></div>)}</dl>
        <p className={styles.boundary}>A soma exibida é o resultado registrado pelo servidor. Ela não indica taxa de conversão, qualidade, significância ou comparação entre períodos.</p>
      </> : <p className={styles.empty}>Nenhuma contagem canônica foi registrada ainda. Ausência de totais não significa total zero.</p>}
    </section>
    <section className={styles.subsection} aria-labelledby="report-events-title">
      <h4 id="report-events-title">Trilha imutável</h4>
      {detail.events.length ? <ol className={styles.eventList}>{detail.events.map(event => <li key={event.id}><div><strong>{EVENT_LABELS[event.event_type] || "Evento registrado"}</strong><time dateTime={event.created_at || undefined}>{dateTimeLabel(event.created_at)}</time></div><p>{event.summary}</p></li>)}</ol> : <p className={styles.empty}>Nenhum evento foi retornado para este relatório.</p>}
      <p className={styles.footnote}>A tela somente consulta a trilha. Eventos não podem ser editados ou removidos pela interface.</p>
    </section>
  </div>;
}
