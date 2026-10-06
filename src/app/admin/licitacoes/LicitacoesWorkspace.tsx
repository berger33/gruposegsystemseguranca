"use client";

// EXT-03 — licitações ligadas ao backend canônico real.
// Estados reais: carregamento, vazio declarado, erro com retry e confirmação
// somente após resposta do servidor. Cada mutação usa uma chave de
// idempotência própria, PRESERVADA em falha para que o retry não duplique.
// Nada é inventado: sem registro canônico a tela declara a ausência; situação
// de prazo, aceitação de proposta e atendimento de checklist vêm somente da
// resposta do servidor, com fonte e data-base declaradas.
//
// A condição do critério ("se mercado relevante") e a fronteira externa (não
// há portal público integrado nem upload real) são declaradas pelo servidor e
// exibidas aqui — não são simuladas.

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import UiState from "../../../components/ui/UiState";
import styles from "../../../components/ui/UiWorkspace.module.css";
import { biddingRequest } from "../../../lib/bidding-request";
import { biddingErrorFootnote, biddingErrorVariant, biddingStatusLabel, deadlineKindLabel, deadlineSourceLabel, deadlineSituationLabel, proposalDecisionLabel, honestMoney, honestDate, honestDateTime, type BiddingErrorDescriptor } from "../../../lib/bidding-vocabulary.mjs";

interface MarketRelevance {
  condicao: string;
  situacao: string;
  evidencia: string;
  pendencia: string;
  efeito: string;
}

interface ExternalChannelBoundary {
  portal_publico_integrado: boolean;
  importacao_automatica_de_edital: boolean;
  envio_de_proposta_a_orgao: boolean;
  upload_real_de_arquivo: boolean;
  declaracao: string;
}

interface Notice {
  id: string;
  protocol: string;
  title: string;
  description: string;
  edital_number: string;
  status: string;
  stage: string;
  origin: string;
  estimated_value_cents: number | null;
  responsible_identity: string | null;
  responsible_assigned_at: string | null;
  result: string | null;
  result_recorded_at: string | null;
  result_justification: string | null;
  closed_at: string | null;
  created_at: string;
  legacy_publication_date: string | null;
  legacy_deadline_date: string | null;
  legacy_responsible_name: string | null;
}

interface NoticesResponse {
  notices: Notice[];
  source: string;
  base_date: string;
  filters: Record<string, string | null>;
  market_relevance: MarketRelevance;
  external_channel_boundary: ExternalChannelBoundary;
  empty_state: string | null;
}

interface DerivedDeadline {
  situation: string;
  due_date: string | null;
  declared_source: string | null;
  source_reference: string | null;
  base_date: string;
  days_remaining?: number;
  days_overdue?: number;
  alert?: { days_before: number; threshold_date: string } | null;
  alert_rule_absence?: string;
  alert_rule_note?: string;
  superseded_at?: string;
}

interface Deadline {
  id: string;
  deadline_kind: string;
  due_date: string | null;
  source: string;
  source_reference: string | null;
  justification: string;
  superseded_at: string | null;
  supersede_reason: string | null;
  derived: DerivedDeadline;
}

interface ProposalWindow {
  decision: string;
  accepts_proposal: boolean;
  due_date?: string;
  declared_source?: string;
  days_remaining?: number;
  days_overdue?: number;
  missing?: string;
  bidding_status?: string;
  source: string;
  base_date: string;
  deadline_kind: string;
}

interface Proposal {
  id: string;
  version: number;
  amount_cents: number;
  summary: string;
  deadline_date_at_submission: string | null;
  deadline_source_at_submission: string;
  submitted_on: string | null;
  submitted_at: string;
  submitted_by_identity: string;
  withdrawn_at: string | null;
  withdraw_reason: string | null;
  situation: string;
}

interface BiddingDocument {
  id: string;
  document_type: string;
  file_name: string;
  version: number;
  situation: string;
  storage_kind: string;
  superseded_at: string | null;
  deactivated_at: string | null;
  deactivate_reason: string | null;
}

interface ChecklistEntry {
  checklist_item_id: string;
  document_type: string;
  label: string;
  required: boolean;
  status: string;
  satisfied_by: { document_id: string; version: number; file_name: string | null } | null;
  deactivate_reason?: string | null;
}

interface ChecklistSummary {
  total: number;
  atendidos: number;
  pendentes: number;
  pendentes_obrigatorios: number;
  checklist_absence: string | null;
}

interface BiddingEvent {
  id: string;
  event_type: string;
  summary: string;
  created_at: string;
  created_by_identity: string;
}

interface ResponsibleAssignment {
  id: string;
  responsible_identity: string;
  responsible_role: string;
  justification: string;
  assigned_at: string;
  released_at: string | null;
}

interface Dossier {
  notice: Notice;
  deadlines: Deadline[];
  proposal_window: ProposalWindow;
  proposals: Proposal[];
  documents: BiddingDocument[];
  checklist: ChecklistEntry[];
  checklist_summary: ChecklistSummary;
  alert_rule: { id: string; days_before: number; justification: string } | null;
  alert_rule_absence: string | null;
  responsibles: ResponsibleAssignment[];
  events: BiddingEvent[];
  base_date: string;
  market_relevance: MarketRelevance;
  external_channel_boundary: ExternalChannelBoundary;
}

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  publicado: "Publicado",
  em_analise: "Em análise",
  homologado: "Homologado",
  vencido: "Vencido",
  cancelado: "Cancelado",
  deserto: "Deserto",
};

const STATUS_CLASS: Record<string, string> = {
  rascunho: "bg-gray-100 text-gray-700 border-gray-300",
  publicado: "bg-blue-50 text-blue-800 border-blue-300",
  em_analise: "bg-amber-50 text-amber-900 border-amber-300",
  homologado: "bg-green-50 text-green-800 border-green-300",
  vencido: "bg-slate-100 text-slate-700 border-slate-300",
  cancelado: "bg-red-50 text-red-800 border-red-300",
  deserto: "bg-slate-100 text-slate-700 border-slate-300",
};

const DEADLINE_SITUATION_LABEL: Record<string, string> = {
  vigente: "Vigente",
  a_vencer: "A vencer",
  vencido: "Vencido",
  substituido: "Substituído",
  sem_data_declarada: "Sem data declarada",
};

const DEADLINE_SITUATION_CLASS: Record<string, string> = {
  vigente: "text-green-800",
  a_vencer: "text-amber-800",
  vencido: "text-red-800",
  substituido: "text-gray-500 line-through",
  sem_data_declarada: "text-gray-600",
};

const PROPOSAL_DECISION_LABEL: Record<string, string> = {
  prazo_vigente: "Prazo de entrega vigente — proposta aceita",
  prazo_encerrado: "Prazo de entrega encerrado — proposta recusada",
  sem_prazo_registrado: "Sem prazo de entrega registrado — proposta recusada",
  sem_data_declarada: "Prazo sem data declarada — proposta recusada",
  edital_encerrado: "Edital encerrado — proposta recusada",
  edital_inexistente: "Edital inexistente",
};

const DEADLINE_KINDS = [
  "publicacao", "esclarecimento", "impugnacao", "entrega_proposta",
  "sessao_abertura", "recurso", "assinatura",
];

const DEADLINE_SOURCES = ["edital_publicado", "retificacao_publicada", "registro_interno"];

function newIdempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function formatCents(value: number | null): string {
  return honestMoney(value);
}

const JOURNEY_SECTIONS = [
  ["editais", "Editais"], ["novo", "Novo edital"], ["resumo", "Dossiê"],
  ["prazos", "Prazos"], ["propostas", "Propostas"], ["documentos", "Documentos"],
  ["governanca", "Governança"], ["historico", "Histórico"],
] as const;

export default function LicitacoesWorkspace() {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeSection, setActiveSection] = useState("editais");
  function goToSection(id: string, focus = false) {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (focus) tabRefs.current[JOURNEY_SECTIONS.findIndex(([key]) => key === id)]?.focus();
  }
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % JOURNEY_SECTIONS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + JOURNEY_SECTIONS.length) % JOURNEY_SECTIONS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = JOURNEY_SECTIONS.length - 1;
    else return;
    event.preventDefault(); goToSection(JOURNEY_SECTIONS[next][0], true);
  }

  const [listing, setListing] = useState<NoticesResponse | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<BiddingErrorDescriptor | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossierError, setDossierError] = useState<BiddingErrorDescriptor | null>(null);

  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<BiddingErrorDescriptor | null>(null);
  const [busy, setBusy] = useState(false);

  // Cada formulário mantém a sua chave de idempotência, preservada em falha.
  const [noticeForm, setNoticeForm] = useState({ title: "", description: "", edital_number: "", estimated_value_cents: "" });
  const [noticeKey, setNoticeKey] = useState(() => newIdempotencyKey("ext03-edt"));
  const [statusForm, setStatusForm] = useState({ status: "", justification: "" });
  const [statusKey, setStatusKey] = useState(() => newIdempotencyKey("ext03-sta"));
  const [responsibleForm, setResponsibleForm] = useState({ responsible_identity: "", justification: "" });
  const [responsibleKey, setResponsibleKey] = useState(() => newIdempotencyKey("ext03-rsp"));
  const [deadlineForm, setDeadlineForm] = useState({ deadline_kind: "entrega_proposta", due_date: "", source: "edital_publicado", source_reference: "", justification: "" });
  const [deadlineKey, setDeadlineKey] = useState(() => newIdempotencyKey("ext03-prz"));
  const [supersedeForm, setSupersedeForm] = useState({ deadline_id: "", due_date: "", source: "retificacao_publicada", source_reference: "", reason: "" });
  const [supersedeKey, setSupersedeKey] = useState(() => newIdempotencyKey("ext03-sub"));
  const [proposalForm, setProposalForm] = useState({ amount_cents: "", summary: "" });
  const [proposalKey, setProposalKey] = useState(() => newIdempotencyKey("ext03-prp"));
  const [withdrawForm, setWithdrawForm] = useState({ proposal_id: "", reason: "" });
  const [withdrawKey, setWithdrawKey] = useState(() => newIdempotencyKey("ext03-ret"));
  const [docForm, setDocForm] = useState({ document_type: "", file_name: "", file_url: "", storage_key: "", supersedes_document_id: "" });
  const [docKey, setDocKey] = useState(() => newIdempotencyKey("ext03-doc"));
  const [checklistForm, setChecklistForm] = useState({ document_type: "", label: "", required: true });
  const [checklistKey, setChecklistKey] = useState(() => newIdempotencyKey("ext03-chk"));
  const [ruleForm, setRuleForm] = useState({ days_before: "15", justification: "" });
  const [ruleKey, setRuleKey] = useState(() => newIdempotencyKey("ext03-alr"));
  const [resultForm, setResultForm] = useState({ result: "", justification: "" });
  const [resultKey, setResultKey] = useState(() => newIdempotencyKey("ext03-res"));

  const loadNotices = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    const result = await biddingRequest<NoticesResponse>("/api/ext/bidding/notices");
    if (result.ok) setListing(result.data);
    else { setListing(null); setListError(result.error); }
    try { /* estado final compartilhado */ } finally {
      setListLoading(false);
    }
  }, []);

  const loadDossier = useCallback(async (id: string) => {
    setDossierLoading(true);
    setDossierError(null);
    const result = await biddingRequest<Dossier>(`/api/ext/bidding/notices/${id}`);
    if (result.ok) setDossier(result.data);
    else { setDossier(null); setDossierError(result.error); }
    try { /* estado final compartilhado */ } finally {
      setDossierLoading(false);
    }
  }, []);

  useEffect(() => { loadNotices(); }, [loadNotices]);
  useEffect(() => {
    if (selectedId) loadDossier(selectedId);
    else setDossier(null);
  }, [selectedId, loadDossier]);

  // Mutação genérica: confirmação apenas com resposta real; em falha a chave
  // de idempotência É PRESERVADA para o retry não duplicar.
  async function mutate(url: string, method: string, body: unknown, key: string, onSuccess: (payload: Record<string, unknown>) => void) {
    setBusy(true);
    setMutationError(null);
    setConfirmation(null);
    const result = await biddingRequest<Record<string, unknown>>(url, {
      method, headers: { "Idempotency-Key": key }, body: JSON.stringify(body),
    });
    if (result.ok) onSuccess(result.data);
    else setMutationError(result.error);
    try { /* a chave só é trocada pelos callbacks de sucesso */ } finally {
      setBusy(false);
    }
  }

  const refreshAfterMutation = useCallback(() => {
    loadNotices();
    if (selectedId) loadDossier(selectedId);
  }, [loadNotices, loadDossier, selectedId]);

  const relevance = dossier?.market_relevance ?? listing?.market_relevance ?? null;
  const boundary = dossier?.external_channel_boundary ?? listing?.external_channel_boundary ?? null;
  const window_ = dossier?.proposal_window ?? null;

  return (
    <main className={styles.workspace}>
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Licitações — EXT-03</h1>
        <p className="text-sm text-gray-500 mt-1">
          Edital, prazos, documentos, responsáveis, proposta e resultado ligados ao backend canônico real.
          A proposta só é aceita dentro do prazo de entrega registrado e o resultado só existe com o edital
          encerrado — ambos por derivação determinística dos registros, nunca por campo livre.
        </p>
      </div>

      {relevance && (
        <div className="p-3 text-sm text-blue-900 bg-blue-50 border border-blue-300 rounded" role="note">
          <strong>Condição do critério &quot;{relevance.condicao}&quot;: {relevance.situacao.replace(/_/g, " ")}.</strong>
          <p className="text-xs mt-1">Evidência: {relevance.evidencia}</p>
          <p className="text-xs">Pendência: {relevance.pendencia}</p>
          <p className="text-xs">Efeito: {relevance.efeito}</p>
        </div>
      )}

      {boundary && (
        <div className="p-3 text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded" role="note">
          <strong>Fronteira externa declarada:</strong> {boundary.declaracao}
        </div>
      )}

      <nav className={styles.tabs} role="tablist" aria-label="Etapas da jornada de licitações">
        {JOURNEY_SECTIONS.map(([id, label], index) => (
          <button key={id} ref={node => { tabRefs.current[index] = node; }} type="button" role="tab"
            aria-selected={activeSection === id} aria-controls={id} tabIndex={activeSection === id ? 0 : -1}
            className={activeSection === id ? styles.tabActive : styles.tab}
            onClick={() => goToSection(id)} onKeyDown={event => onTabKeyDown(event, index)}>{label}</button>
        ))}
      </nav>

      {confirmation && (
        <div className="p-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded" role="status">{confirmation}</div>
      )}
      {mutationError && (
        <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded" role="alert">
          {mutationError.title}: {mutationError.detail} — a chave de idempotência foi preservada; repetir não duplica.
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      <section id="editais" role="tabpanel" className={styles.panel}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Editais registrados</h2>
          <button onClick={loadNotices} className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50">Recarregar</button>
        </div>

        {listLoading && <div className="p-4 text-sm text-gray-500">Carregando licitações…</div>}

        {!listLoading && listError && (
          <div className="p-4 text-sm bg-red-50 border border-red-200 rounded" role="alert">
            <p className="text-red-700">{listError.title}: {listError.detail}</p>
            <button onClick={loadNotices} className="mt-2 px-3 py-1.5 text-sm border border-red-300 rounded hover:bg-red-100">
              Tentar novamente
            </button>
          </div>
        )}

        {!listLoading && !listError && listing && listing.notices.length === 0 && (
          <div className="p-4 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded">
            {listing.empty_state}
            <p className="text-xs text-gray-500 mt-1">Fonte: {listing.source} · data-base {listing.base_date}.</p>
          </div>
        )}

        {!listLoading && !listError && listing && listing.notices.length > 0 && (
          <div className="overflow-x-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Protocolo</th>
                  <th className="px-3 py-2 font-medium">Edital</th>
                  <th className="px-3 py-2 font-medium">Título</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                  <th className="px-3 py-2 font-medium">Etapa</th>
                  <th className="px-3 py-2 font-medium">Valor estimado</th>
                  <th className="px-3 py-2 font-medium">Origem</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {listing.notices.map(notice => (
                  <tr key={notice.id} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">{notice.protocol}</td>
                    <td className="px-3 py-2">{notice.edital_number}</td>
                    <td className="px-3 py-2">{notice.title}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 text-xs border rounded ${STATUS_CLASS[notice.status] ?? ""}`}>
                        {biddingStatusLabel(notice.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{notice.stage === "encerrado" ? "Encerrado" : "Em andamento"}</td>
                    <td className="px-3 py-2">{formatCents(notice.estimated_value_cents)}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{notice.origin}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setSelectedId(notice.id === selectedId ? null : notice.id)}
                        className="px-2 py-1 text-xs border rounded hover:bg-gray-50"
                      >
                        {notice.id === selectedId ? "Fechar" : "Abrir dossiê"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {listing && (
          <p className="text-xs text-gray-500">Fonte: {listing.source} · data-base {listing.base_date}.</p>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      <section id="novo" role="tabpanel" className={styles.panel}>
        <h2 className="text-lg font-semibold">Registrar edital</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <input className="border rounded px-3 py-2 text-sm" placeholder="Título (5–200)"
            value={noticeForm.title} onChange={e => setNoticeForm({ ...noticeForm, title: e.target.value })} />
          <input className="border rounded px-3 py-2 text-sm" placeholder="Número do edital"
            value={noticeForm.edital_number} onChange={e => setNoticeForm({ ...noticeForm, edital_number: e.target.value })} />
          <input className="border rounded px-3 py-2 text-sm" placeholder="Valor estimado em centavos (opcional)"
            value={noticeForm.estimated_value_cents} onChange={e => setNoticeForm({ ...noticeForm, estimated_value_cents: e.target.value })} />
          <textarea className="border rounded px-3 py-2 text-sm md:col-span-2" rows={2} placeholder="Descrição (10–2000)"
            value={noticeForm.description} onChange={e => setNoticeForm({ ...noticeForm, description: e.target.value })} />
        </div>
        <button
          disabled={busy}
          onClick={() => {
            const estimated = noticeForm.estimated_value_cents.trim();
            mutate("/api/ext/bidding/notices", "POST", {
              title: noticeForm.title,
              description: noticeForm.description,
              edital_number: noticeForm.edital_number,
              ...(estimated ? { estimated_value_cents: Number(estimated) } : {}),
            }, noticeKey, payload => {
              const notice = (payload.notice ?? {}) as Notice;
              setConfirmation(`Edital ${notice.edital_number} registrado com protocolo ${notice.protocol} (resposta do servidor).`);
              setNoticeForm({ title: "", description: "", edital_number: "", estimated_value_cents: "" });
              setNoticeKey(newIdempotencyKey("ext03-edt"));
              refreshAfterMutation();
            });
          }}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {busy ? "Enviando…" : "Registrar edital"}
        </button>
        <p className="text-xs text-gray-500">Chave de idempotência desta operação: <code>{noticeKey}</code></p>
      </section>

      {/* ------------------------------------------------------------------ */}
      {selectedId && dossierLoading && <div className="p-4 text-sm text-gray-500">Carregando dossiê…</div>}

      {selectedId && !dossierLoading && dossierError && (
        <div className="p-4 text-sm bg-red-50 border border-red-200 rounded" role="alert">
          <p className="text-red-700">{dossierError.title}: {dossierError.detail}</p>
          <button onClick={() => loadDossier(selectedId)} className="mt-2 px-3 py-1.5 text-sm border border-red-300 rounded hover:bg-red-100">
            Tentar novamente
          </button>
        </div>
      )}

      {selectedId && !dossierLoading && !dossierError && dossier && (
        <div className="space-y-6">
          <section id="resumo" role="tabpanel" className={styles.panel}>
            <h2 className="text-lg font-semibold">
              Dossiê — {dossier.notice.edital_number}
              <span className={`ml-2 inline-block px-2 py-0.5 text-xs border rounded ${STATUS_CLASS[dossier.notice.status] ?? ""}`}>
                {STATUS_LABEL[dossier.notice.status] ?? dossier.notice.status}
              </span>
            </h2>
            <p className="text-sm text-gray-700">{dossier.notice.description}</p>
            <dl className="grid gap-2 md:grid-cols-3 text-sm">
              <div><dt className="text-xs text-gray-500">Protocolo</dt><dd className="font-mono text-xs">{dossier.notice.protocol}</dd></div>
              <div><dt className="text-xs text-gray-500">Valor estimado</dt><dd>{formatCents(dossier.notice.estimated_value_cents)}</dd></div>
              <div><dt className="text-xs text-gray-500">Responsável (identidade canônica)</dt>
                <dd className="font-mono text-xs">{dossier.notice.responsible_identity ?? "não designado"}</dd></div>
            </dl>
            {dossier.notice.legacy_responsible_name && (
              <p className="text-xs text-gray-500">
                Campo legado da 085 — responsável em texto livre: {dossier.notice.legacy_responsible_name}. Não é fonte canônica.
              </p>
            )}
            <p className="text-xs text-gray-500">Data-base da derivação: {dossier.base_date}.</p>
          </section>

          {/* Prazos */}
          <section id="prazos" role="tabpanel" className={styles.panel}>
            <h3 className="font-semibold">Prazos</h3>
            {dossier.deadlines.length === 0 && (
              <p className="text-sm text-gray-600">Nenhum prazo registrado para este edital. Nenhuma data é estimada.</p>
            )}
            {dossier.deadlines.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">Tipo</th>
                      <th className="px-3 py-2 font-medium">Data</th>
                      <th className="px-3 py-2 font-medium">Situação derivada</th>
                      <th className="px-3 py-2 font-medium">Fonte declarada</th>
                      <th className="px-3 py-2 font-medium">Alerta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.deadlines.map(deadline => (
                      <tr key={deadline.id} className="border-t">
                        <td className="px-3 py-2">{deadline.deadline_kind.replace(/_/g, " ")}</td>
                        <td className="px-3 py-2">{deadline.due_date}</td>
                        <td className={`px-3 py-2 ${DEADLINE_SITUATION_CLASS[deadline.derived.situation] ?? ""}`}>
                          {deadlineSituationLabel(deadline.derived.situation)}
                          {deadline.derived.days_overdue !== undefined && ` (${deadline.derived.days_overdue} dia(s) atrás)`}
                          {deadline.derived.days_remaining !== undefined && ` (faltam ${deadline.derived.days_remaining} dia(s))`}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {deadline.source}
                          {deadline.source_reference ? ` · ${deadline.source_reference}` : ""}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600">
                          {deadline.derived.alert_rule_absence
                            ? "sem regra de antecedência"
                            : deadline.derived.alert
                              ? `${deadline.derived.alert.days_before} dia(s) antes`
                              : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {dossier.alert_rule_absence && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                {dossier.alert_rule_absence}: sem regra registrada o sistema não calcula &quot;a vencer&quot;. A ausência é declarada em vez de estimada.
              </p>
            )}

            <div className="grid gap-2 md:grid-cols-5 pt-2 border-t">
              <select className="border rounded px-2 py-2 text-sm" value={deadlineForm.deadline_kind}
                onChange={e => setDeadlineForm({ ...deadlineForm, deadline_kind: e.target.value })}>
                {DEADLINE_KINDS.map(kind => <option key={kind} value={kind}>{kind.replace(/_/g, " ")}</option>)}
              </select>
              <input type="date" className="border rounded px-2 py-2 text-sm" value={deadlineForm.due_date}
                onChange={e => setDeadlineForm({ ...deadlineForm, due_date: e.target.value })} />
              <select className="border rounded px-2 py-2 text-sm" value={deadlineForm.source}
                onChange={e => setDeadlineForm({ ...deadlineForm, source: e.target.value })}>
                {DEADLINE_SOURCES.map(src => <option key={src} value={src}>{src.replace(/_/g, " ")}</option>)}
              </select>
              <input className="border rounded px-2 py-2 text-sm" placeholder="Referência da fonte"
                value={deadlineForm.source_reference} onChange={e => setDeadlineForm({ ...deadlineForm, source_reference: e.target.value })} />
              <input className="border rounded px-2 py-2 text-sm" placeholder="Justificativa"
                value={deadlineForm.justification} onChange={e => setDeadlineForm({ ...deadlineForm, justification: e.target.value })} />
            </div>
            <button
              disabled={busy}
              onClick={() => mutate(`/api/ext/bidding/notices/${selectedId}/deadlines`, "POST", {
                deadline_kind: deadlineForm.deadline_kind,
                due_date: deadlineForm.due_date,
                source: deadlineForm.source,
                ...(deadlineForm.source_reference ? { source_reference: deadlineForm.source_reference } : {}),
                justification: deadlineForm.justification,
              }, deadlineKey, () => {
                setConfirmation("Prazo registrado com fonte declarada (resposta do servidor).");
                setDeadlineForm({ ...deadlineForm, due_date: "", source_reference: "", justification: "" });
                setDeadlineKey(newIdempotencyKey("ext03-prz"));
                refreshAfterMutation();
              })}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Registrar prazo
            </button>

            <div className="grid gap-2 md:grid-cols-5 pt-2 border-t">
              <input className="border rounded px-2 py-2 text-sm font-mono text-xs" placeholder="ID do prazo a substituir"
                value={supersedeForm.deadline_id} onChange={e => setSupersedeForm({ ...supersedeForm, deadline_id: e.target.value })} />
              <input type="date" className="border rounded px-2 py-2 text-sm" value={supersedeForm.due_date}
                onChange={e => setSupersedeForm({ ...supersedeForm, due_date: e.target.value })} />
              <select className="border rounded px-2 py-2 text-sm" value={supersedeForm.source}
                onChange={e => setSupersedeForm({ ...supersedeForm, source: e.target.value })}>
                {DEADLINE_SOURCES.map(src => <option key={src} value={src}>{src.replace(/_/g, " ")}</option>)}
              </select>
              <input className="border rounded px-2 py-2 text-sm" placeholder="Referência da fonte"
                value={supersedeForm.source_reference} onChange={e => setSupersedeForm({ ...supersedeForm, source_reference: e.target.value })} />
              <input className="border rounded px-2 py-2 text-sm" placeholder="Motivo da substituição"
                value={supersedeForm.reason} onChange={e => setSupersedeForm({ ...supersedeForm, reason: e.target.value })} />
            </div>
            <button
              disabled={busy}
              onClick={() => mutate(`/api/ext/bidding/deadlines/${supersedeForm.deadline_id}/supersede`, "POST", {
                due_date: supersedeForm.due_date,
                source: supersedeForm.source,
                ...(supersedeForm.source_reference ? { source_reference: supersedeForm.source_reference } : {}),
                reason: supersedeForm.reason,
              }, supersedeKey, () => {
                setConfirmation("Prazo substituído; o anterior permanece no histórico (resposta do servidor).");
                setSupersedeForm({ ...supersedeForm, deadline_id: "", due_date: "", source_reference: "", reason: "" });
                setSupersedeKey(newIdempotencyKey("ext03-sub"));
                refreshAfterMutation();
              })}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Substituir prazo
            </button>
          </section>

          {/* Proposta */}
          <section id="propostas" role="tabpanel" className={styles.panel}>
            <h3 className="font-semibold">Proposta</h3>
            {window_ && (
              <div className={`p-2 text-sm border rounded ${window_.accepts_proposal ? "bg-green-50 border-green-200 text-green-900" : "bg-red-50 border-red-200 text-red-900"}`}>
                <strong>{proposalDecisionLabel(window_.decision)}</strong>
                {window_.due_date && <span> · prazo {window_.due_date}</span>}
                {window_.days_remaining !== undefined && <span> · faltam {window_.days_remaining} dia(s)</span>}
                {window_.days_overdue !== undefined && <span> · encerrado há {window_.days_overdue} dia(s)</span>}
                {window_.missing && <p className="text-xs mt-1">{window_.missing}</p>}
                <p className="text-xs mt-1">Fonte: {window_.source} · data-base {window_.base_date}.</p>
              </div>
            )}
            {dossier.proposals.length === 0 && (
              <p className="text-sm text-gray-600">Nenhuma proposta registrada para este edital. Nenhum valor é estimado.</p>
            )}
            {dossier.proposals.length > 0 && (
              <ul className="text-sm space-y-1">
                {dossier.proposals.map(proposal => (
                  <li key={proposal.id} className="border rounded px-3 py-2">
                    <span className="font-medium">v{proposal.version}</span> · {formatCents(proposal.amount_cents)} ·{" "}
                    <span className={proposal.situation === "retirada" ? "text-gray-500" : "text-green-800"}>{proposal.situation}</span>
                    <p className="text-xs text-gray-600">{proposal.summary}</p>
                    <p className="text-xs text-gray-500">
                      Prazo vigente no ato: {proposal.deadline_date_at_submission} (fonte {proposal.deadline_source_at_submission}) ·
                      registrada em {proposal.submitted_on}
                    </p>
                    {proposal.withdrawn_at && <p className="text-xs text-gray-500">Retirada: {proposal.withdraw_reason}</p>}
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-2 md:grid-cols-2 pt-2 border-t">
              <input className="border rounded px-2 py-2 text-sm" placeholder="Valor em centavos"
                value={proposalForm.amount_cents} onChange={e => setProposalForm({ ...proposalForm, amount_cents: e.target.value })} />
              <input className="border rounded px-2 py-2 text-sm" placeholder="Resumo da proposta (10–2000)"
                value={proposalForm.summary} onChange={e => setProposalForm({ ...proposalForm, summary: e.target.value })} />
            </div>
            <button
              disabled={busy}
              onClick={() => mutate(`/api/ext/bidding/notices/${selectedId}/proposals`, "POST", {
                amount_cents: Number(proposalForm.amount_cents),
                summary: proposalForm.summary,
              }, proposalKey, payload => {
                const proposal = (payload.proposal ?? {}) as Proposal;
                setConfirmation(`Proposta versão ${proposal.version} registrada dentro do prazo (resposta do servidor).`);
                setProposalForm({ amount_cents: "", summary: "" });
                setProposalKey(newIdempotencyKey("ext03-prp"));
                refreshAfterMutation();
              })}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Registrar proposta
            </button>
            <div className="grid gap-2 md:grid-cols-2 pt-2 border-t">
              <input className="border rounded px-2 py-2 text-sm font-mono text-xs" placeholder="ID da proposta a retirar"
                value={withdrawForm.proposal_id} onChange={e => setWithdrawForm({ ...withdrawForm, proposal_id: e.target.value })} />
              <input className="border rounded px-2 py-2 text-sm" placeholder="Motivo da retirada"
                value={withdrawForm.reason} onChange={e => setWithdrawForm({ ...withdrawForm, reason: e.target.value })} />
            </div>
            <button
              disabled={busy}
              onClick={() => mutate(`/api/ext/bidding/proposals/${withdrawForm.proposal_id}/withdraw`, "POST", { reason: withdrawForm.reason }, withdrawKey, () => {
                setConfirmation("Proposta retirada; o registro permanece no histórico (resposta do servidor).");
                setWithdrawForm({ proposal_id: "", reason: "" });
                setWithdrawKey(newIdempotencyKey("ext03-ret"));
                refreshAfterMutation();
              })}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Retirar proposta
            </button>
          </section>

          {/* Checklist e dossiê */}
          <section id="documentos" role="tabpanel" className={styles.panel}>
            <h3 className="font-semibold">Checklist e dossiê versionado</h3>
            {dossier.checklist_summary.checklist_absence && (
              <p className="text-sm text-gray-600">Nenhum item de checklist registrado para este edital.</p>
            )}
            {dossier.checklist.length > 0 && (
              <>
                <p className="text-sm">
                  {dossier.checklist_summary.atendidos} de {dossier.checklist_summary.total} itens atendidos ·{" "}
                  {dossier.checklist_summary.pendentes_obrigatorios} obrigatório(s) pendente(s).
                  <span className="text-xs text-gray-500"> Derivado dos documentos ativos, nunca marcado à mão.</span>
                </p>
                <ul className="text-sm space-y-1">
                  {dossier.checklist.map(entry => (
                    <li key={entry.checklist_item_id} className="border rounded px-3 py-2 flex items-center justify-between">
                      <span>
                        {entry.label} <span className="text-xs text-gray-500">({entry.document_type}{entry.required ? ", obrigatório" : ", opcional"})</span>
                      </span>
                      <span className={entry.status === "atendido" ? "text-green-800 text-sm" : entry.status === "desativado" ? "text-gray-500 text-sm" : "text-amber-800 text-sm"}>
                        {entry.status}
                        {entry.satisfied_by && <span className="text-xs text-gray-500"> · v{entry.satisfied_by.version}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="grid gap-2 md:grid-cols-3 pt-2 border-t">
              <input className="border rounded px-2 py-2 text-sm" placeholder="Tipo de documento exigido"
                value={checklistForm.document_type} onChange={e => setChecklistForm({ ...checklistForm, document_type: e.target.value })} />
              <input className="border rounded px-2 py-2 text-sm" placeholder="Rótulo do item"
                value={checklistForm.label} onChange={e => setChecklistForm({ ...checklistForm, label: e.target.value })} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={checklistForm.required}
                  onChange={e => setChecklistForm({ ...checklistForm, required: e.target.checked })} />
                Obrigatório
              </label>
            </div>
            <button
              disabled={busy}
              onClick={() => mutate(`/api/ext/bidding/notices/${selectedId}/checklist`, "POST", {
                document_type: checklistForm.document_type,
                label: checklistForm.label,
                required: checklistForm.required,
              }, checklistKey, () => {
                setConfirmation("Item de checklist registrado (resposta do servidor).");
                setChecklistForm({ document_type: "", label: "", required: true });
                setChecklistKey(newIdempotencyKey("ext03-chk"));
                refreshAfterMutation();
              })}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Exigir item no checklist
            </button>

            {dossier.documents.length === 0 && (
              <p className="text-sm text-gray-600 pt-2 border-t">Nenhum documento registrado para este edital.</p>
            )}
            {dossier.documents.length > 0 && (
              <ul className="text-sm space-y-1 pt-2 border-t">
                {dossier.documents.map(doc => (
                  <li key={doc.id} className="border rounded px-3 py-2">
                    <span className="font-medium">v{doc.version}</span> · {doc.document_type} · {doc.file_name} ·{" "}
                    <span className={doc.situation === "vigente" ? "text-green-800" : "text-gray-500"}>{doc.situation}</span>
                    <p className="text-xs text-gray-500">Armazenamento: {doc.storage_kind} — referência declarada, não arquivo recebido.</p>
                    {doc.deactivate_reason && <p className="text-xs text-gray-500">Motivo da desativação: {doc.deactivate_reason}</p>}
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-2 md:grid-cols-5 pt-2 border-t">
              <input className="border rounded px-2 py-2 text-sm" placeholder="Tipo"
                value={docForm.document_type} onChange={e => setDocForm({ ...docForm, document_type: e.target.value })} />
              <input className="border rounded px-2 py-2 text-sm" placeholder="Nome do arquivo"
                value={docForm.file_name} onChange={e => setDocForm({ ...docForm, file_name: e.target.value })} />
              <input className="border rounded px-2 py-2 text-sm" placeholder="URL de referência"
                value={docForm.file_url} onChange={e => setDocForm({ ...docForm, file_url: e.target.value })} />
              <input className="border rounded px-2 py-2 text-sm" placeholder="Chave de armazenamento"
                value={docForm.storage_key} onChange={e => setDocForm({ ...docForm, storage_key: e.target.value })} />
              <input className="border rounded px-2 py-2 text-sm font-mono text-xs" placeholder="Substitui documento (opcional)"
                value={docForm.supersedes_document_id} onChange={e => setDocForm({ ...docForm, supersedes_document_id: e.target.value })} />
            </div>
            <button
              disabled={busy}
              onClick={() => mutate(`/api/ext/bidding/notices/${selectedId}/documents`, "POST", {
                document_type: docForm.document_type,
                file_name: docForm.file_name,
                file_url: docForm.file_url,
                storage_key: docForm.storage_key,
                ...(docForm.supersedes_document_id ? { supersedes_document_id: docForm.supersedes_document_id } : {}),
              }, docKey, () => {
                setConfirmation("Documento registrado no dossiê versionado (resposta do servidor).");
                setDocForm({ document_type: "", file_name: "", file_url: "", storage_key: "", supersedes_document_id: "" });
                setDocKey(newIdempotencyKey("ext03-doc"));
                refreshAfterMutation();
              })}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Registrar documento
            </button>
          </section>

          {/* Regra de alerta, responsável, situação e resultado */}
          <section id="governanca" role="tabpanel" className={styles.panel}>
            <h3 className="font-semibold">Alerta, responsável, situação e resultado</h3>

            <div className="grid gap-2 md:grid-cols-2">
              <input className="border rounded px-2 py-2 text-sm" placeholder="Antecedência de alerta (dias)"
                value={ruleForm.days_before} onChange={e => setRuleForm({ ...ruleForm, days_before: e.target.value })} />
              <input className="border rounded px-2 py-2 text-sm" placeholder="Justificativa da antecedência"
                value={ruleForm.justification} onChange={e => setRuleForm({ ...ruleForm, justification: e.target.value })} />
            </div>
            <button
              disabled={busy}
              onClick={() => mutate(`/api/ext/bidding/notices/${selectedId}/alert-rules`, "POST", {
                days_before: Number(ruleForm.days_before),
                justification: ruleForm.justification,
              }, ruleKey, () => {
                setConfirmation("Regra de antecedência registrada; o alerta passa a existir por regra explícita (resposta do servidor).");
                setRuleKey(newIdempotencyKey("ext03-alr"));
                refreshAfterMutation();
              })}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Registrar regra de alerta
            </button>

            <div className="grid gap-2 md:grid-cols-2 pt-2 border-t">
              <input className="border rounded px-2 py-2 text-sm font-mono text-xs" placeholder="Identidade do responsável (UUID)"
                value={responsibleForm.responsible_identity} onChange={e => setResponsibleForm({ ...responsibleForm, responsible_identity: e.target.value })} />
              <input className="border rounded px-2 py-2 text-sm" placeholder="Justificativa da designação"
                value={responsibleForm.justification} onChange={e => setResponsibleForm({ ...responsibleForm, justification: e.target.value })} />
            </div>
            <button
              disabled={busy}
              onClick={() => mutate(`/api/ext/bidding/notices/${selectedId}/responsible`, "POST", responsibleForm, responsibleKey, () => {
                setConfirmation("Responsável designado após validação canônica da identidade (resposta do servidor).");
                setResponsibleForm({ responsible_identity: "", justification: "" });
                setResponsibleKey(newIdempotencyKey("ext03-rsp"));
                refreshAfterMutation();
              })}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Designar responsável
            </button>
            {dossier.responsibles.length > 0 && (
              <ul className="text-xs text-gray-600 space-y-1">
                {dossier.responsibles.map(assignment => (
                  <li key={assignment.id}>
                    <span className="font-mono">{assignment.responsible_identity}</span> · papel no ato: {assignment.responsible_role} ·{" "}
                    {assignment.released_at ? `encerrado em ${assignment.released_at}` : "vigente"}
                  </li>
                ))}
              </ul>
            )}

            <div className="grid gap-2 md:grid-cols-2 pt-2 border-t">
              <select className="border rounded px-2 py-2 text-sm" value={statusForm.status}
                onChange={e => setStatusForm({ ...statusForm, status: e.target.value })}>
                <option value="">Selecionar nova situação…</option>
                {Object.keys(STATUS_LABEL).map(status => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
              </select>
              <input className="border rounded px-2 py-2 text-sm" placeholder="Justificativa da transição"
                value={statusForm.justification} onChange={e => setStatusForm({ ...statusForm, justification: e.target.value })} />
            </div>
            <button
              disabled={busy}
              onClick={() => mutate(`/api/ext/bidding/notices/${selectedId}`, "PATCH", statusForm, statusKey, payload => {
                const transition = (payload.transition ?? {}) as { from: string; to: string };
                setConfirmation(`Situação alterada de ${transition.from} para ${transition.to} (resposta do servidor).`);
                setStatusForm({ status: "", justification: "" });
                setStatusKey(newIdempotencyKey("ext03-sta"));
                refreshAfterMutation();
              })}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Alterar situação
            </button>
            <p className="text-xs text-gray-500">
              Situação terminal (homologado, vencido, cancelado, deserto) é final: o edital não reabre.
            </p>

            <div className="grid gap-2 md:grid-cols-2 pt-2 border-t">
              <textarea className="border rounded px-2 py-2 text-sm" rows={2} placeholder="Resultado (10–2000)"
                value={resultForm.result} onChange={e => setResultForm({ ...resultForm, result: e.target.value })} />
              <textarea className="border rounded px-2 py-2 text-sm" rows={2} placeholder="Justificativa do resultado (10–2000)"
                value={resultForm.justification} onChange={e => setResultForm({ ...resultForm, justification: e.target.value })} />
            </div>
            <button
              disabled={busy}
              onClick={() => mutate(`/api/ext/bidding/notices/${selectedId}/result`, "POST", resultForm, resultKey, () => {
                setConfirmation("Resultado registrado com autor, data e justificativa; agora é imutável (resposta do servidor).");
                setResultForm({ result: "", justification: "" });
                setResultKey(newIdempotencyKey("ext03-res"));
                refreshAfterMutation();
              })}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Registrar resultado
            </button>
            {dossier.notice.result_recorded_at && (
              <div className="p-2 text-sm bg-gray-50 border rounded">
                <p>{dossier.notice.result}</p>
                <p className="text-xs text-gray-500">
                  Registrado em {dossier.notice.result_recorded_at} · justificativa: {dossier.notice.result_justification}
                </p>
              </div>
            )}
            {!dossier.notice.result_recorded_at && (
              <p className="text-xs text-gray-600">
                Resultado ainda não registrado. Ele só é aceito com o edital encerrado — nenhum resultado é presumido.
              </p>
            )}
          </section>

          {/* Histórico */}
          <section id="historico" role="tabpanel" className={styles.panel}>
            <h3 className="font-semibold">Histórico (apenas-acréscimo)</h3>
            {dossier.events.length === 0 && <p className="text-sm text-gray-600">Nenhum evento registrado.</p>}
            <ul className="text-xs space-y-1">
              {dossier.events.map(event => (
                <li key={event.id} className="border-l-2 border-gray-200 pl-2">
                  <span className="font-medium">{event.event_type}</span> · {event.summary}
                  <span className="text-gray-500"> · {event.created_at}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}
