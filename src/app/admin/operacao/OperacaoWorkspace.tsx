"use client";

// UX-07 (fatia A — Operação): mesma regra das demais telas já tratadas
// (CRM em UX-03B, RH em UX-04, painel do Marcelo em UX-05, portais em UX-06).
//
// O que esta fatia MUDA: vocabulário em português nos 195 códigos que os
// cinco servidores de operação podem devolver, estado honesto de leitura
// (carregando/vazio/falha/negado nunca se confundem), abas de verdade
// (tablist/tab/tabpanel com roving tabindex e teclado) e remoção do `style`
// inline da superfície própria desta tela, em favor de
// `UiWorkspace.module.css`.
//
// O que esta fatia NÃO MUDA: nenhuma URL, método, corpo, cabeçalho ou regra
// de escopo. Nenhuma validação de jornada, descanso, habilitação,
// dimensionamento ou idempotência foi tocada — tudo isso continua decidido
// em `ops-api.mjs`, `ops-advanced-api.mjs`, `ops-advanced2-api.mjs`,
// `ops-advanced3-api.mjs` e `ops-pendency-api.mjs`.
//
// Defeito corrigido aqui: toda falha de leitura caía em
// `err.message || "Falha ao carregar."` — um 503 de auditoria, uma queda de
// rede e uma recusa de regra de negócio (`overlap_detected`,
// `qualification_required`, `version_not_published`...) viravam a mesma
// frase genérica. Agora cada falha é classificada e mostra o motivo real.
//
// Pendência declarada (não corrigida nesta fatia): `OpsAdvanced2Client` e
// `OpsAdvanced3Client` (abas Supervisão, Rondas, Relatórios, Métricas,
// Limpeza e Monitoramento) continuam sendo telas legadas à parte — ver
// `docs/UX-07-OPERACAO-2026-10-05.md`, seção "O que não foi feito".
//
// UX-PRO-07D-1 (leitura honesta da superfície canônica): um corpo 2xx sem a
// lista canônica vira falha declarada (`invalid_ops_response`), nunca lista
// vazia; a resposta atrasada de uma versão de escala escolhida antes é
// descartada; a falha do detalhe da versão é declarada também nas seções de
// ciência e histórico; e a coluna "Necessidades" dos postos não afirma zero
// enquanto a leitura de estrutura não foi confirmada. Nenhuma URL, método,
// corpo, cabeçalho, permissão ou escrita mudou: `acknowledgeSchedule` e as
// abas legadas ficam para subfatias próprias — ver
// `docs/UX-PRO-07D-1-ESCOPO-ANTES-2026-10-15.md`.

import { useCallback, useEffect, useRef, useState } from "react";
import OpsAdvanced2Client from "../ti/OpsAdvanced2Client";
import OpsAdvanced3Client from "../ti/OpsAdvanced3Client";
import UiState from "../../../components/ui/UiState";
import UiBadge from "../../../components/ui/UiBadge";
import { opsRequest, type OpsErrorDescriptor, type OpsResult } from "../../../lib/ops-request";
import {
  activeLabel,
  activeTone,
  allocationStatusLabel,
  allocationStatusTone,
  checklistInstanceStatusLabel,
  checklistInstanceStatusTone,
  coverageGapStatusLabel,
  coverageGapStatusTone,
  coverageRequestStatusLabel,
  coverageRequestStatusTone,
  dimensioningStatusLabel,
  dimensioningStatusTone,
  handoverStatusLabel,
  handoverStatusTone,
  occurrenceStatusLabel,
  occurrenceStatusTone,
  opsErrorFootnote,
  opsErrorVariant,
  scheduleVersionStatusLabel,
  scheduleVersionStatusTone,
  severityLabel,
  severityTone,
  weekdayLabel,
} from "../../../lib/ops-vocabulary.mjs";
import styles from "../../../components/ui/UiWorkspace.module.css";
import { opsDateTime, opsIsoStamp } from "../../../lib/ops-dates.mjs";

// OPS-03: janela de datas da validade da versão, limitada a 31 colunas para o
// calendário continuar legível. Quando a validade excede a janela, o recorte é
// declarado — nunca ocultado.
const CALENDAR_MAX_DAYS = 31;
function versionDateWindow(version: ScheduleVersion): { dates: string[]; truncated: boolean } {
  const start = new Date(`${String(version.valid_from).slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${String(version.valid_to).slice(0, 10)}T00:00:00Z`);
  const dates: string[] = [];
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { dates, truncated: false };
  const totalDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  for (let t = start.getTime(); t <= end.getTime() && dates.length < CALENDAR_MAX_DAYS; t += 86_400_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return { dates, truncated: totalDays > CALENDAR_MAX_DAYS };
}
function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

type Post = {
  id: string;
  name: string;
  post_type: string;
  is_active: boolean;
  company_id: string | null;
  unit_id: string | null;
  contract_id: string | null;
  company_name?: string | null;
  unit_name?: string | null;
  contract_title?: string | null;
};
type JobRole = {
  id: string;
  name: string;
  role_type: string;
  description: string | null;
  is_active: boolean;
};
type PostShiftNeed = {
  id: string;
  post_id: string;
  post_name: string;
  shift_template_id: string;
  shift_template_name: string | null;
  role_id: string | null;
  role_name: string | null;
  day_of_week: number | null;
  required_headcount: number;
  is_active: boolean;
};
type Allocation = {
  id: string;
  post_id: string;
  post_name?: string | null;
  employee_id: string;
  employee_name?: string | null;
  allocation_date: string;
  status: string;
};
type Dimensioning = {
  id: string;
  post_id: string;
  post_name?: string | null;
  period_start: string;
  period_end: string;
  contracted_headcount: number;
  planned_headcount: number;
  realized_headcount: number;
  coverage_hours_required: string | number;
  coverage_hours_realized: string | number;
  coverage_percent: string | number;
  status: string;
  allocated_employees?: number;
  qualified_employees?: number;
  unqualified_employees?: number;
  employees_without_requirement?: number;
  allocated_hours?: string | number;
};
type CoverageGap = {
  id: string;
  post_id: string;
  post_name?: string | null;
  gap_date: string;
  gap_start: string;
  gap_end: string;
  uncovered_minutes: number;
  reason: string | null;
  status: string;
};
type ScheduleVersion = {
  id: string;
  company_id: string | null;
  company_name?: string | null;
  unit_id: string | null;
  unit_name?: string | null;
  version: number;
  status: string;
  valid_from: string;
  valid_to: string;
  published_at: string | null;
  notes: string | null;
};
type ScheduleEntry = {
  id: string;
  version_id: string;
  post_id: string;
  post_name?: string | null;
  unit_name?: string | null;
  employee_id: string;
  employee_name?: string | null;
  shift_template_id: string;
  shift_template_name?: string | null;
  entry_date: string;
  status: string;
};
type ScheduleAck = {
  id: string;
  version_id: string;
  employee_id: string;
  employee_name?: string | null;
  acknowledged_at: string;
  notes: string | null;
};
type ScheduleHistoryItem = {
  id: string;
  version_id: string;
  previous_status: string | null;
  next_status: string;
  changed_by: string;
  reason: string | null;
  created_at: string;
};
type CoverageRequest = {
  id: string;
  post_id: string;
  status: string;
  requested_at: string;
  responsible_name: string | null;
  reason: string | null;
  coverage_date: string | null;
};
type Handover = {
  id: string;
  protocol: string;
  from_post_id: string | null;
  from_employee_id: string;
  to_employee_id: string | null;
  handover_date: string;
  status: string;
  pending_tasks: string | null;
};
type Occurrence = {
  id: string;
  protocol: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  occurred_at: string;
};
type ChecklistInstance = {
  id: string;
  template_id: string;
  post_id: string | null;
  scheduled_date: string;
  status: string;
  executed_at: string | null;
};
type WorkRule = {
  id: string;
  name: string;
  max_daily_hours: string | number;
  min_rest_hours: string | number;
  max_weekly_hours: string | number;
  max_consecutive_days: number;
  requires_certification: boolean;
  is_approved: boolean;
  is_active: boolean;
  approved_by: string | null;
};
type Qualification = {
  id: string;
  employee_id: string;
  role_id: string | null;
  certification_type: string;
  valid_until: string | null;
  is_valid: boolean;
};
type ScheduleValidation = {
  id: string;
  employee_id: string | null;
  validation_type: string;
  is_valid: boolean;
  validated_at: string;
  conflict_details: Record<string, unknown> | null;
};

// Abas nomeadas pela TAREFA; o código interno (OPS-01..16) fica na prosa de
// cada painel, não no rótulo clicável — mesma regra de UX-04.
const TABS = [
  { id: "postos", label: "Postos e alocações" },
  { id: "jornada", label: "Jornada e habilitação" },
  { id: "dimensionamento", label: "Dimensionamento" },
  { id: "escalas", label: "Escalas" },
  { id: "cobertura", label: "Cobertura" },
  { id: "passagem", label: "Passagem de turno" },
  { id: "ocorrencias", label: "Livro de ocorrências" },
  { id: "checklists", label: "Checklists de posto" },
  { id: "supervisao", label: "Supervisão" },
  { id: "rondas", label: "Rondas e claviculário" },
  { id: "relatorios", label: "Relatórios" },
  { id: "metricas", label: "Métricas e escalas assistidas" },
  { id: "limpeza", label: "Limpeza" },
  { id: "monitoramento", label: "Monitoramento sintético" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function describeThrown(error: OpsErrorDescriptor | null): OpsErrorDescriptor {
  return (
    error || {
      kind: "retry",
      title: "Falha inesperada",
      detail: "Algo deu errado e a ação não foi concluída.",
      code: null,
      status: 0,
      canRetry: true,
    }
  );
}

/** Caixa de falha de leitura, com motivo real e opção de tentar de novo. */
function ReadError({ error, onRetry }: { error: OpsErrorDescriptor; onRetry: () => void }) {
  return (
    <UiState
      variant={opsErrorVariant(error)}
      title={error.title}
      detail={`${error.detail} ${opsErrorFootnote(error)}`}
      retryLabel={error.canRetry ? "Tentar carregar novamente" : undefined}
      onRetry={error.canRetry ? onRetry : undefined}
    />
  );
}

// UX-PRO-07D-1: resposta 2xx sem a lista canônica nunca é ausência de
// registro. O código é de diagnóstico desta tela — não vem do servidor —, por
// isso não entra no vocabulário de `ops-vocabulary.mjs`, que só traduz
// códigos que os servidores de operação realmente devolvem.
const INVALID_OPS_RESPONSE = "invalid_ops_response";
function invalidOpsResponse(status: number): OpsErrorDescriptor {
  return {
    kind: "retry",
    title: "A resposta da operação não pôde ser lida",
    detail: "O servidor respondeu sem a lista esperada. Isto não significa que não existam registros.",
    code: INVALID_OPS_RESPONSE,
    status,
    canRetry: true,
  };
}

/**
 * Mesma URL, método, credenciais e cabeçalhos de `opsRequest` (que continua
 * fazendo a chamada); a única diferença é exigir a lista canônica `key` na
 * resposta 2xx, em vez de trocá-la por `[]`.
 */
async function opsReadList<T>(url: string, key: string): Promise<OpsResult<T[]>> {
  const result = await opsRequest<Record<string, unknown> | null>(url);
  if (!result.ok) return result;
  const list = result.data && typeof result.data === "object" ? result.data[key] : undefined;
  if (!Array.isArray(list)) return { ok: false, status: result.status, error: invalidOpsResponse(result.status) };
  return { ok: true, status: result.status, data: list as T[] };
}

export default function OperacaoWorkspace() {
  const [activeTab, setActiveTab] = useState<TabId>("postos");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [posts, setPosts] = useState<Post[]>([]);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [shiftNeeds, setShiftNeeds] = useState<PostShiftNeed[]>([]);
  const [dimensionings, setDimensionings] = useState<Dimensioning[]>([]);
  const [gaps, setGaps] = useState<CoverageGap[]>([]);
  const [scheduleVersions, setScheduleVersions] = useState<ScheduleVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<ScheduleVersion | null>(null);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [scheduleAcks, setScheduleAcks] = useState<ScheduleAck[]>([]);
  const [scheduleHistory, setScheduleHistory] = useState<ScheduleHistoryItem[]>([]);
  const [calendarView, setCalendarView] = useState<"posto" | "equipe" | "pessoa">("posto");
  const [ackMessage, setAckMessage] = useState("");
  const [ackError, setAckError] = useState<OpsErrorDescriptor | null>(null);
  // UX-PRO-07D-2: o envio é serializado; sua confirmação não implica leitura atual.
  const ackLock = useRef(false);
  const [ackPending, setAckPending] = useState<{ versionId: string; phase: "sending" | "reading" } | null>(null);
  const [ackReadError, setAckReadError] = useState<OpsErrorDescriptor | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [coverages, setCoverages] = useState<CoverageRequest[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [checklists, setChecklists] = useState<ChecklistInstance[]>([]);
  const [workRules, setWorkRules] = useState<WorkRule[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [validations, setValidations] = useState<ScheduleValidation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<OpsErrorDescriptor | null>(null);
  // OPS-01: o grupo de estrutura (cargo/função + necessidade por turno) carrega
  // em estado PRÓPRIO, desacoplado do Promise.all acima. Assim uma falha em um
  // grupo não derruba os painéis do outro — o acoplamento dos 9 fetches já é
  // um problema conhecido desta tela e não deve ser agravado.
  const [structureLoading, setStructureLoading] = useState(true);
  const [structureError, setStructureError] = useState<OpsErrorDescriptor | null>(null);
  // OPS-02: o painel de dimensionamento também carrega em grupo próprio,
  // desacoplado dos demais — mesma razão do grupo de estrutura.
  const [dimLoading, setDimLoading] = useState(true);
  const [dimError, setDimError] = useState<OpsErrorDescriptor | null>(null);
  // OPS-03: versões de escala em grupo próprio; o detalhe da versão selecionada
  // (entradas, ciências e histórico) carrega sob demanda, também desacoplado.
  const [schedLoading, setSchedLoading] = useState(true);
  const [schedError, setSchedError] = useState<OpsErrorDescriptor | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<OpsErrorDescriptor | null>(null);
  // UX-PRO-07D-1: cada "Ver calendário" recebe um número; só a resposta da
  // última versão escolhida é aplicada. A resposta atrasada de uma versão
  // escolhida antes é descartada em vez de sobrescrever o calendário atual.
  const detailRequest = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [postData, allocData, covData, handData, occData, checkData, ruleData, qualData, validationData] = await Promise.all([
      opsReadList<Post>("/api/ops/posts?limit=100", "posts"),
      opsReadList<Allocation>("/api/ops/allocations", "allocations"),
      opsReadList<CoverageRequest>("/api/ops/coverage-requests", "requests"),
      opsReadList<Handover>("/api/ops/handovers", "handovers"),
      opsReadList<Occurrence>("/api/ops/occurrence-book", "occurrences"),
      opsReadList<ChecklistInstance>("/api/ops/checklist-instances", "instances"),
      opsReadList<WorkRule>("/api/ops/work-rules", "rules"),
      opsReadList<Qualification>("/api/ops/qualifications", "qualifications"),
      opsReadList<ScheduleValidation>("/api/ops/validations?is_valid=false", "validations"),
    ]);
    // O painel inicial depende de todos os nove: sem qualquer um deles não há
    // número honesto a mostrar, e a tela diz exatamente qual falhou.
    const failed = [postData, allocData, covData, handData, occData, checkData, ruleData, qualData, validationData].find(r => !r.ok);
    if (failed && !failed.ok) {
      setError(failed.error);
      setLoading(false);
      return;
    }
    if (postData.ok) setPosts(postData.data);
    if (allocData.ok) setAllocations(allocData.data);
    if (covData.ok) setCoverages(covData.data);
    if (handData.ok) setHandovers(handData.data);
    if (occData.ok) setOccurrences(occData.data);
    if (checkData.ok) setChecklists(checkData.data);
    if (ruleData.ok) setWorkRules(ruleData.data);
    if (qualData.ok) setQualifications(qualData.data);
    if (validationData.ok) setValidations(validationData.data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadStructure = useCallback(async () => {
    setStructureLoading(true);
    setStructureError(null);
    const [roleData, needData] = await Promise.all([
      opsReadList<JobRole>("/api/ops/job-roles", "roles"),
      opsReadList<PostShiftNeed>("/api/ops/post-shift-needs", "needs"),
    ]);
    if (!roleData.ok) { setStructureError(roleData.error); setStructureLoading(false); return; }
    if (!needData.ok) { setStructureError(needData.error); setStructureLoading(false); return; }
    setJobRoles(roleData.data);
    setShiftNeeds(needData.data);
    setStructureLoading(false);
  }, []);

  useEffect(() => { void loadStructure(); }, [loadStructure]);

  const loadDimensioning = useCallback(async () => {
    setDimLoading(true);
    setDimError(null);
    const [dimData, gapData] = await Promise.all([
      opsReadList<Dimensioning>("/api/ops/dimensioning", "dimensionings"),
      opsReadList<CoverageGap>("/api/ops/coverage-gaps", "gaps"),
    ]);
    if (!dimData.ok) { setDimError(dimData.error); setDimLoading(false); return; }
    if (!gapData.ok) { setDimError(gapData.error); setDimLoading(false); return; }
    setDimensionings(dimData.data);
    setGaps(gapData.data);
    setDimLoading(false);
  }, []);

  useEffect(() => { void loadDimensioning(); }, [loadDimensioning]);

  const loadSchedules = useCallback(async () => {
    setSchedLoading(true);
    setSchedError(null);
    const data = await opsReadList<ScheduleVersion>("/api/ops/schedule-versions", "versions");
    if (!data.ok) { setSchedError(data.error); setSchedLoading(false); return; }
    setScheduleVersions(data.data);
    setSchedLoading(false);
  }, []);

  useEffect(() => { void loadSchedules(); }, [loadSchedules]);

  async function selectVersion(version: ScheduleVersion) {
    const requestId = ++detailRequest.current;
    setSelectedVersion(version);
    setDetailLoading(true);
    setDetailError(null);
    setAckMessage("");
    setAckError(null);
    setAckReadError(null);
    setCalendarView("posto");
    const [entryData, ackData, historyData] = await Promise.all([
      opsReadList<ScheduleEntry>(`/api/ops/schedule-entries?version_id=${version.id}`, "entries"),
      opsReadList<ScheduleAck>(`/api/ops/schedule-acks?version_id=${version.id}`, "acknowledgments"),
      opsReadList<ScheduleHistoryItem>(`/api/ops/schedule-history?version_id=${version.id}`, "history"),
    ]);
    // Outra versão foi escolhida enquanto esta era lida: a resposta é de uma
    // seleção superada e não pode substituir o calendário atual.
    if (detailRequest.current !== requestId) return;
    // O painel de detalhe não pode fingir calendário: sem leitura completa,
    // limpa as entradas e mostra o erro real.
    const failed = [entryData, ackData, historyData].find(r => !r.ok);
    if (failed && !failed.ok) {
      setScheduleEntries([]);
      setScheduleAcks([]);
      setScheduleHistory([]);
      setDetailError(failed.error);
      setDetailLoading(false);
      return;
    }
    if (entryData.ok) setScheduleEntries(entryData.data);
    if (ackData.ok) setScheduleAcks(ackData.data);
    if (historyData.ok) setScheduleHistory(historyData.data);
    setDetailLoading(false);
  }

  async function readAcknowledgments(versionId: string, requestId: number) {
    const data = await opsReadList<ScheduleAck>(`/api/ops/schedule-acks?version_id=${versionId}`, "acknowledgments");
    // A mesma guarda do detalhe protege mensagens e reconciliação da escrita.
    if (detailRequest.current !== requestId) return;
    if (data.ok) {
      setScheduleAcks(data.data);
      setAckReadError(null);
    } else if (data.error.status === 401 || data.error.status === 403) {
      setScheduleEntries([]);
      setScheduleAcks([]);
      setScheduleHistory([]);
      setDetailError(data.error);
    } else {
      // Preserva a última lista conhecida, mas não a apresenta como atual.
      setAckReadError(data.error);
    }
  }

  async function retryAcknowledgments() {
    if (!selectedVersion || ackLock.current) return;
    ackLock.current = true;
    const versionId = selectedVersion.id;
    const requestId = detailRequest.current;
    setAckPending({ versionId, phase: "reading" });
    try { await readAcknowledgments(versionId, requestId); }
    finally { ackLock.current = false; setAckPending(null); }
  }

  async function acknowledgeSchedule(employeeId: string, employeeName: string) {
    if (!selectedVersion || ackLock.current || ackReadError) return;
    // Ref antes do primeiro await: também cobre cliques antes de novo render.
    ackLock.current = true;
    const versionId = selectedVersion.id;
    const requestId = detailRequest.current;
    setAckPending({ versionId, phase: "sending" });
    setAckMessage("");
    setAckError(null);
    try {
      const result = await opsRequest<{ acknowledgment?: ScheduleAck }>("/api/ops/schedule-acks", {
        method: "POST",
        body: JSON.stringify({ version_id: versionId, employee_id: employeeId }),
      });
      if (detailRequest.current !== requestId) return;
      if (result.ok) {
        setAckMessage(`Ciência registrada para ${employeeName}.`);
      } else if (result.error.code === "duplicate_ack") {
        setAckMessage(`Ciência já registrada para ${employeeName} — segunda ciência não duplica efeito.`);
      } else {
        setAckError(result.error);
      }
      setAckPending({ versionId, phase: "reading" });
      await readAcknowledgments(versionId, requestId);
    } finally {
      ackLock.current = false;
      setAckPending(null);
    }
  }

  function onTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex(item => item.id === activeTab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    const target = TABS[next].id;
    setActiveTab(target);
    tabRefs.current[target]?.focus();
  }

  const activeTabInfo = TABS.find(item => item.id === activeTab)!;

  return (
    <div className={styles.workspace} data-admin-content="true">
      <nav aria-label="Navegação operacional" className={styles.breadcrumbNav}>
        <a href="/admin/contratos">Contratos</a> · <a href="/admin/crm">Empresas e funil</a>
      </nav>

      <h1>Operação — controle e gestão operacional</h1>
      <p className={styles.lede}>
        Superfície canônica de operação. Alocar ou cobrir não significa faturamento nem recebimento. Contrato encerrado,
        cancelado ou suspenso não recebe nova alocação ou rotina; o histórico é preservado.
      </p>

      {loading ? (
        <UiState variant="loading" title="Consultando a operação…" detail="Postos, alocações, cobertura, passagens, ocorrências, checklists, jornada e qualificações ainda não foram confirmados." />
      ) : null}

      {!loading && error ? <ReadError error={error} onRetry={() => { void load(); }} /> : null}

      {!loading && !error ? (
        <>
          <div className={styles.tabs} role="tablist" aria-label="Frentes de trabalho da operação">
            {TABS.map(item => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`ops-aba-${item.id}`}
                aria-selected={activeTab === item.id}
                aria-controls={`ops-painel-${item.id}`}
                tabIndex={activeTab === item.id ? 0 : -1}
                ref={element => { tabRefs.current[item.id] = element; }}
                className={activeTab === item.id ? styles.tabActive : styles.tab}
                onClick={() => setActiveTab(item.id)}
                onKeyDown={onTabKeyDown}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div
            className={styles.tabPanel}
            role="tabpanel"
            id={`ops-painel-${activeTab}`}
            aria-labelledby={`ops-aba-${activeTab}`}
            tabIndex={-1}
          >
            <h2 className={styles.visuallyHidden}>{activeTabInfo.label}</h2>

          {activeTab === "postos" ? (
            <PostsPanel
              posts={posts}
              shiftNeeds={shiftNeeds}
              jobRoles={jobRoles}
              allocations={allocations}
              structureLoading={structureLoading}
              structureError={structureError}
              onRetryStructure={() => { void loadStructure(); }}
            />
          ) : null}

          {activeTab === "jornada" ? (
            <JourneyPanel workRules={workRules} qualifications={qualifications} validations={validations} />
          ) : null}

          {activeTab === "dimensionamento" ? (
            <DimensioningPanel
              dimensionings={dimensionings}
              gaps={gaps}
              loading={dimLoading}
              error={dimError}
              onRetry={() => { void loadDimensioning(); }}
            />
          ) : null}

          {activeTab === "escalas" ? (
            <SchedulesPanel
              scheduleVersions={scheduleVersions}
              selectedVersion={selectedVersion}
              scheduleEntries={scheduleEntries}
              scheduleAcks={scheduleAcks}
              scheduleHistory={scheduleHistory}
              calendarView={calendarView}
              setCalendarView={setCalendarView}
              loading={schedLoading}
              error={schedError}
              onRetry={() => { void loadSchedules(); }}
              detailLoading={detailLoading}
              detailError={detailError}
              onSelectVersion={version => { void selectVersion(version); }}
              onAcknowledge={(employeeId, employeeName) => { void acknowledgeSchedule(employeeId, employeeName); }}
              ackMessage={ackMessage}
              ackError={ackError}
              ackPending={ackPending}
              ackReadError={ackReadError}
              onRetryAcknowledgments={() => { void retryAcknowledgments(); }}
            />
          ) : null}

          {activeTab === "cobertura" ? <CoveragePanel coverages={coverages} /> : null}
          {activeTab === "passagem" ? <HandoverPanel handovers={handovers} /> : null}
          {activeTab === "ocorrencias" ? <OccurrencePanel occurrences={occurrences} /> : null}
          {activeTab === "checklists" ? <ChecklistPanel checklists={checklists} /> : null}

          {(["supervisao", "rondas", "relatorios"] as const).includes(activeTab as any) ? (
            <section aria-label="Operação avançada — supervisão, rondas e relatórios" className={styles.legacy}>
              <p className={`${styles.notice} ${styles.noticeInfo}`}>
                {activeTab === "supervisao" && "Supervisão de postos, inspeções e planos de ação."}
                {activeTab === "rondas" && "Rondas e claviculário — leituras são sintéticas e não comprovam GPS ou presença real."}
                {activeTab === "relatorios" && "Relatórios e livro de serviço: liberação somente após aprovação formal."}
              </p>
              <p className={styles.hint}>
                Área legada mantida como está nesta fatia: formulários próprios, sem rótulo associado em todo campo.
                Ver pendências declaradas em docs/UX-07-OPERACAO-2026-10-05.md.
              </p>
              <OpsAdvanced2Client />
            </section>
          ) : null}
          {(["metricas", "limpeza", "monitoramento"] as const).includes(activeTab as any) ? (
            <section aria-label="Operação avançada — métricas, limpeza e monitoramento" className={styles.legacy}>
              <p className={`${styles.notice} ${styles.noticeWarning}`}>
                {activeTab === "metricas" && "Métricas com fonte, fórmula, janela e incompletude explícita; escalas exigem revisão humana."}
                {activeTab === "limpeza" && "Rotinas de limpeza, inspeção de qualidade e não conformidades."}
                {activeTab === "monitoramento" && "Monitoramento sintético: simulação sem central 24h e sem despacho externo real."}
              </p>
              <p className={styles.hint}>
                Área legada mantida como está nesta fatia: formulários próprios, sem rótulo associado em todo campo.
                Ver pendências declaradas em docs/UX-07-OPERACAO-2026-10-05.md.
              </p>
              <OpsAdvanced3Client />
            </section>
          ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatusBadge({ label, tone, srPrefix }: { label: string; tone: ReturnType<typeof activeTone>; srPrefix?: string }) {
  return <UiBadge tone={tone} srPrefix={srPrefix}>{label}</UiBadge>;
}

function PostsPanel({
  posts, shiftNeeds, jobRoles, allocations, structureLoading, structureError, onRetryStructure,
}: {
  posts: Post[]; shiftNeeds: PostShiftNeed[]; jobRoles: JobRole[]; allocations: Allocation[];
  structureLoading: boolean; structureError: OpsErrorDescriptor | null; onRetryStructure: () => void;
}) {
  return (
    <>
      <p className={`${styles.notice} ${styles.noticeInfo}`}>
        Cadeia operacional: <strong>cliente → unidade atendida → posto físico → necessidade por turno → alocação</strong>.
        Posto sem necessidade por turno cadastrada não gera cobrança de escala — a lacuna aparece como lacuna, não como
        número inventado.
      </p>

      <section className={styles.panel} aria-labelledby="posts-title">
        <h2 id="posts-title" className={styles.panelTitle}>Postos físicos</h2>
        {posts.length === 0 ? (
          <UiState variant="empty" title="Nenhum posto cadastrado ainda" detail="A consulta foi respondida pelo servidor e não encontrou postos no seu escopo." />
        ) : (
          <div className={styles.tableWrap} role="region" aria-label="Tabela com rolagem horizontal" tabIndex={0}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Posto</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Unidade atendida</th>
                  <th scope="col">Contrato</th>
                  <th scope="col">Necessidades</th>
                  <th scope="col">Situação</th>
                </tr>
              </thead>
              <tbody>
                {posts.map(post => (
                  <tr key={post.id}>
                    <td>{post.name}</td>
                    <td>{post.post_type}</td>
                    <td>{post.company_name || (post.company_id ? "—" : "sem cliente")}</td>
                    <td>{post.unit_name || (post.unit_id ? "—" : "sem unidade")}</td>
                    <td>{post.contract_title || (post.contract_id ? "—" : "sem contrato")}</td>
                    <td>
                      {structureLoading ? (
                        <span className={styles.hint} data-testid="operacao-necessidades-aguardando">Aguardando leitura</span>
                      ) : structureError ? (
                        <span className={styles.hint} data-testid="operacao-necessidades-nao-confirmadas">Não confirmado</span>
                      ) : (
                        shiftNeeds.filter(need => need.post_id === post.id && need.is_active).length
                      )}
                    </td>
                    <td><StatusBadge label={activeLabel(post.is_active)} tone={activeTone(post.is_active)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {posts.length > 0 && (structureLoading || structureError) ? (
          <p className={styles.footnote} data-testid="operacao-necessidades-aviso">
            A coluna “Necessidades” depende da leitura da estrutura operacional (cargos e necessidades por turno, logo
            abaixo). Enquanto essa leitura não for confirmada, nenhuma quantidade é exibida — “Não confirmado” não
            significa zero.
          </p>
        ) : null}
      </section>

      {structureLoading ? (
        <UiState variant="loading" title="Carregando estrutura operacional…" detail="Cargos, funções e necessidades por turno ainda não foram confirmados." />
      ) : null}
      {!structureLoading && structureError ? <ReadError error={structureError} onRetry={onRetryStructure} /> : null}

      {!structureLoading && !structureError ? (
        <>
          <section className={styles.panel} aria-labelledby="job-roles-title">
            <h2 id="job-roles-title" className={styles.panelTitle}>Cargos e funções</h2>
            {jobRoles.length === 0 ? (
              <UiState variant="empty" title="Nenhum cargo ou função cadastrado" detail="Alocação com cargo exigido depende de entidade própria registrada aqui." />
            ) : (
              <div className={styles.tableWrap} role="region" aria-label="Tabela com rolagem horizontal" tabIndex={0}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Cargo/função</th>
                      <th scope="col">Tipo</th>
                      <th scope="col">Descrição</th>
                      <th scope="col">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobRoles.map(role => (
                      <tr key={role.id}>
                        <td>{role.name}</td>
                        <td>{role.role_type}</td>
                        <td>{role.description || "—"}</td>
                        <td><StatusBadge label={activeLabel(role.is_active)} tone={activeTone(role.is_active)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="shift-needs-title">
            <h2 id="shift-needs-title" className={styles.panelTitle}>Necessidade por turno</h2>
            {shiftNeeds.length === 0 ? (
              <UiState variant="empty" title="Nenhuma necessidade por turno cadastrada" detail="Sem cadastro, o dimensionamento de posto não é inferido." />
            ) : (
              <div className={styles.tableWrap} role="region" aria-label="Tabela com rolagem horizontal" tabIndex={0}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Posto</th>
                      <th scope="col">Turno</th>
                      <th scope="col">Dia</th>
                      <th scope="col">Profissionais exigidos</th>
                      <th scope="col">Cargo exigido</th>
                      <th scope="col">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shiftNeeds.map(need => (
                      <tr key={need.id}>
                        <td>{need.post_name}</td>
                        <td>{need.shift_template_name || "—"}</td>
                        <td>{weekdayLabel(need.day_of_week)}</td>
                        <td>{need.required_headcount}</td>
                        <td>{need.role_name || "não exigido"}</td>
                        <td><StatusBadge label={activeLabel(need.is_active)} tone={activeTone(need.is_active)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      <section className={styles.panel} aria-labelledby="alloc-title">
        <h2 id="alloc-title" className={styles.panelTitle}>Alocações</h2>
        {allocations.length === 0 ? (
          <UiState variant="empty" title="Nenhuma alocação registrada ainda" detail="A consulta foi respondida pelo servidor e não encontrou alocações no seu escopo." />
        ) : (
          <div className={styles.tableWrap} role="region" aria-label="Tabela com rolagem horizontal" tabIndex={0}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Posto</th>
                  <th scope="col">Profissional</th>
                  <th scope="col">Data</th>
                  <th scope="col">Situação</th>
                </tr>
              </thead>
              <tbody>
                {allocations.map(allocation => (
                  <tr key={allocation.id}>
                    <td>{allocation.post_name || "—"}</td>
                    <td>{allocation.employee_name || "—"}</td>
                    <td>{String(allocation.allocation_date).slice(0, 10)}</td>
                    <td><StatusBadge label={allocationStatusLabel(allocation.status)} tone={allocationStatusTone(allocation.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

// UX-PRO-E3: carimbo `TIMESTAMPTZ` em São Paulo, com o fuso declarado no
// próprio texto e o instante ISO original preservado como texto secundário.
// A apresentação mudou; nenhum valor, contrato ou ordenação mudou.
function Stamp({ value }: { value: string | null | undefined }) {
  const iso = opsIsoStamp(value);
  return (
    <>
      {opsDateTime(value)}
      {iso ? <span className={styles.hint}> · {iso}</span> : null}
    </>
  );
}

function JourneyPanel({ workRules, qualifications, validations }: { workRules: WorkRule[]; qualifications: Qualification[]; validations: ScheduleValidation[] }) {
  return (
    <>
      <p className={`${styles.notice} ${styles.noticeInfo}`}>
        A alocação e a entrada de escala só são bloqueadas por jornada e descanso quando existe regra{" "}
        <strong>aprovada e ativa</strong>. Sem regra aprovada, o sistema não presume limite algum e diz isso
        explicitamente. Habilitação e documentação exigem cadastro em qualificações — competência não é inferida.
      </p>

      <section className={styles.panel} aria-labelledby="work-rules-title">
        <h2 id="work-rules-title" className={styles.panelTitle}>Regras de jornada e descanso</h2>
        {workRules.length === 0 ? (
          <UiState variant="empty" title="Nenhuma regra de jornada cadastrada" detail="Sem regra aprovada, jornada e descanso não são validados." />
        ) : (
          <>
            {workRules.every(rule => !(rule.is_approved && rule.is_active)) && (
              <p className={`${styles.notice} ${styles.noticeWarning}`} role="status">
                Nenhuma regra aprovada e ativa: jornada, descanso, jornada semanal e dias consecutivos não estão sendo aplicados.
              </p>
            )}
            <div className={styles.tableWrap} role="region" aria-label="Tabela com rolagem horizontal" tabIndex={0}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Regra</th>
                    <th scope="col">Jornada máx./dia</th>
                    <th scope="col">Descanso mín.</th>
                    <th scope="col">Jornada máx./semana</th>
                    <th scope="col">Dias consec.</th>
                    <th scope="col">Certificação</th>
                    <th scope="col">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {workRules.map(rule => {
                    const enforcing = rule.is_approved && rule.is_active;
                    return (
                      <tr key={rule.id}>
                        <td>{rule.name}</td>
                        <td>{Number(rule.max_daily_hours)} h</td>
                        <td>{Number(rule.min_rest_hours)} h</td>
                        <td>{Number(rule.max_weekly_hours)} h</td>
                        <td>{rule.max_consecutive_days}</td>
                        <td>{rule.requires_certification ? "exigida" : "não exigida"}</td>
                        <td>
                          <StatusBadge
                            label={enforcing ? "Aprovada e aplicada" : rule.is_approved ? "Aprovada, inativa" : "Não aprovada"}
                            tone={enforcing ? "success" : rule.is_approved ? "warning" : "neutral"}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="qualifications-title">
        <h2 id="qualifications-title" className={styles.panelTitle}>Habilitação e documentação</h2>
        {qualifications.length === 0 ? (
          <UiState variant="empty" title="Nenhuma qualificação cadastrada" detail="Alocar com cargo/função exige habilitação registrada e dentro da validade." />
        ) : (
          <div className={styles.tableWrap} role="region" aria-label="Tabela com rolagem horizontal" tabIndex={0}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Certificação</th>
                  <th scope="col">Cargo/função</th>
                  <th scope="col">Validade</th>
                  <th scope="col">Situação</th>
                </tr>
              </thead>
              <tbody>
                {qualifications.map(qual => {
                  const expired = !!qual.valid_until && String(qual.valid_until).slice(0, 10) < new Date().toISOString().slice(0, 10);
                  return (
                    <tr key={qual.id}>
                      <td>{qual.certification_type}</td>
                      <td>{qual.role_id ? "vinculado" : "—"}</td>
                      <td>{qual.valid_until ? String(qual.valid_until).slice(0, 10) : "sem vencimento"}</td>
                      <td>
                        <StatusBadge
                          label={!qual.is_valid ? "Inválida" : expired ? "Vencida" : "Válida"}
                          tone={!qual.is_valid || expired ? "danger" : "success"}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="validations-title">
        <h2 id="validations-title" className={styles.panelTitle}>Bloqueios registrados</h2>
        {validations.length === 0 ? (
          <UiState variant="empty" title="Nenhum bloqueio de validação registrado" />
        ) : (
          <div className={styles.tableWrap} role="region" aria-label="Tabela com rolagem horizontal" tabIndex={0}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Quando</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {validations.map(item => (
                  <tr key={item.id}>
                    <td><Stamp value={item.validated_at} /></td>
                    <td><StatusBadge label={item.validation_type} tone="danger" /></td>
                    <td>{String((item.conflict_details as { error?: string } | null)?.error || "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function DimensioningPanel({
  dimensionings, gaps, loading, error, onRetry,
}: { dimensionings: Dimensioning[]; gaps: CoverageGap[]; loading: boolean; error: OpsErrorDescriptor | null; onRetry: () => void }) {
  return (
    <>
      <p className={`${styles.notice} ${styles.noticeInfo}`}>
        Dimensionamento: contratado × planejado × realizado por faixa de tempo, cobertura por horas e profissional
        habilitado. A habilitação é recomputada ao vivo contra as alocações da faixa, com a mesma regra do motor de
        jornada — qualificação vencida ou revogada depois da alocação aparece aqui como lacuna, não como número fictício.
      </p>

      {loading ? <UiState variant="loading" title="Carregando dimensionamento…" /> : null}
      {!loading && error ? <ReadError error={error} onRetry={onRetry} /> : null}

      {!loading && !error ? (
        <>
          <section className={styles.panel} aria-labelledby="dimensioning-title">
            <h2 id="dimensioning-title" className={styles.panelTitle}>Contratado × planejado × realizado por faixa de tempo</h2>
            {dimensionings.length === 0 ? (
              <UiState variant="empty" title="Nenhum dimensionamento registrado" detail="Sem registro por faixa de tempo, cobertura não é inferida." />
            ) : (
              <div className={styles.tableWrap} role="region" aria-label="Tabela com rolagem horizontal" tabIndex={0}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Posto</th>
                      <th scope="col">Período</th>
                      <th scope="col">Contratado</th>
                      <th scope="col">Planejado</th>
                      <th scope="col">Realizado</th>
                      <th scope="col">Horas exigidas</th>
                      <th scope="col">Horas realizadas</th>
                      <th scope="col">Cobertura</th>
                      <th scope="col">Alocados na faixa</th>
                      <th scope="col">Habilitados</th>
                      <th scope="col">Sem cargo exigido</th>
                      <th scope="col">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dimensionings.map(dim => {
                      const percent = Number(dim.coverage_percent);
                      return (
                        <tr key={dim.id}>
                          <td>{dim.post_name || "—"}</td>
                          <td>{String(dim.period_start).slice(0, 10)} a {String(dim.period_end).slice(0, 10)}</td>
                          <td>{dim.contracted_headcount}</td>
                          <td>{dim.planned_headcount}</td>
                          <td>{dim.realized_headcount}</td>
                          <td>{Number(dim.coverage_hours_required)} h</td>
                          <td>{Number(dim.coverage_hours_realized)} h</td>
                          <td>
                            <StatusBadge
                              label={`${percent}%`}
                              tone={percent >= 100 ? "success" : percent >= 70 ? "warning" : "danger"}
                            />
                          </td>
                          <td>
                            {dim.allocated_employees ?? 0}
                            {Number(dim.allocated_hours || 0) > 0 && ` (${Number(dim.allocated_hours)} h alocadas)`}
                          </td>
                          <td>
                            {dim.qualified_employees ?? 0}
                            {Number(dim.unqualified_employees || 0) > 0 && (
                              <span className={styles.hint}> + {dim.unqualified_employees} sem habilitação válida</span>
                            )}
                          </td>
                          <td>{dim.employees_without_requirement ?? 0}</td>
                          <td><StatusBadge label={dimensioningStatusLabel(dim.status)} tone={dimensioningStatusTone(dim.status)} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <footer className={styles.footnote}>
              <strong>Período e fórmula.</strong> Período de cada linha: datas de início e fim do próprio registro de
              dimensionamento. Cobertura % = horas realizadas ÷ horas exigidas × 100, limitada a 100 (calculada pelo
              banco na coluna <code>coverage_percent</code>). Alocados na faixa = profissionais distintos com
              alocação não cancelada dentro do período, no posto da linha; as horas alocadas são a soma das horas
              dos turnos dessas alocações e não substituem as horas realizadas informadas no registro. Habilitados =
              alocados cujo cargo exigido na própria alocação possui qualificação válida em{" "}
              <code>ops_employee_qualifications</code> (<code>is_valid</code> e validade ≥ data da alocação) — a
              mesma regra aplicada ao alocar. Sem cargo exigido = alocados apenas em alocações sem cargo informado:
              não são contados como habilitados nem como inabilitados. Dado ausente aparece como lacuna com o
              pré-requisito de cadastro — nunca como número inventado.
            </footer>
          </section>

          <section className={styles.panel} aria-labelledby="coverage-gaps-title">
            <h2 id="coverage-gaps-title" className={styles.panelTitle}>Lacunas de cobertura</h2>
            {gaps.length === 0 ? (
              <UiState variant="empty" title="Nenhuma lacuna de cobertura registrada" detail="Ausência de lacuna registrada não é prova de cobertura — é ausência de registro." />
            ) : (
              <div className={styles.tableWrap} role="region" aria-label="Tabela com rolagem horizontal" tabIndex={0}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Posto</th>
                      <th scope="col">Data</th>
                      <th scope="col">Janela</th>
                      <th scope="col">Minutos descobertos</th>
                      <th scope="col">Motivo</th>
                      <th scope="col">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gaps.map(gap => (
                      <tr key={gap.id}>
                        <td>{gap.post_name || "—"}</td>
                        <td>{String(gap.gap_date).slice(0, 10)}</td>
                        <td><Stamp value={gap.gap_start} /> – <Stamp value={gap.gap_end} /></td>
                        <td>{gap.uncovered_minutes}</td>
                        <td>{gap.reason || "—"}</td>
                        <td><StatusBadge label={coverageGapStatusLabel(gap.status)} tone={coverageGapStatusTone(gap.status)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

function SchedulesPanel({
  scheduleVersions, selectedVersion, scheduleEntries, scheduleAcks, scheduleHistory, calendarView, setCalendarView,
  loading, error, onRetry, detailLoading, detailError, onSelectVersion, onAcknowledge, ackMessage, ackError, ackPending, ackReadError, onRetryAcknowledgments,
}: {
  scheduleVersions: ScheduleVersion[]; selectedVersion: ScheduleVersion | null; scheduleEntries: ScheduleEntry[];
  scheduleAcks: ScheduleAck[]; scheduleHistory: ScheduleHistoryItem[]; calendarView: "posto" | "equipe" | "pessoa";
  setCalendarView: (view: "posto" | "equipe" | "pessoa") => void; loading: boolean; error: OpsErrorDescriptor | null;
  onRetry: () => void; detailLoading: boolean; detailError: OpsErrorDescriptor | null;
  onSelectVersion: (version: ScheduleVersion) => void; onAcknowledge: (employeeId: string, employeeName: string) => void;
  ackMessage: string; ackError: OpsErrorDescriptor | null;
  ackPending: { versionId: string; phase: "sending" | "reading" } | null;
  ackReadError: OpsErrorDescriptor | null; onRetryAcknowledgments: () => void;
}) {
  return (
    <>
      <p className={`${styles.notice} ${styles.noticeInfo}`}>
        Escalas: versões em rascunho → publicada → revisada com validade e histórico; calendário por posto, por
        equipe e por pessoa; ciência do profissional registrada pela interface, idempotente — a segunda ciência não
        duplica efeito. Entradas só entram em versão editável e dentro da validade.
      </p>

      {loading ? <UiState variant="loading" title="Carregando versões de escala…" /> : null}
      {!loading && error ? <ReadError error={error} onRetry={onRetry} /> : null}

      {!loading && !error ? (
        <>
          <section className={styles.panel} aria-labelledby="schedule-versions-title">
            <h2 id="schedule-versions-title" className={styles.panelTitle}>Versões de escala</h2>
            {scheduleVersions.length === 0 ? (
              <UiState variant="empty" title="Nenhuma versão de escala registrada" detail="Sem versão, não há calendário — nada é presumido." />
            ) : (
              <div className={styles.tableWrap} role="region" aria-label="Tabela com rolagem horizontal" tabIndex={0}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Versão</th>
                      <th scope="col">Empresa</th>
                      <th scope="col">Unidade (equipe)</th>
                      <th scope="col">Validade</th>
                      <th scope="col">Situação</th>
                      <th scope="col">Publicada em</th>
                      <th scope="col">Calendário</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleVersions.map(version => (
                      <tr key={version.id}>
                        <td>v{version.version}</td>
                        <td>{version.company_name || (version.company_id ? "—" : "sem empresa")}</td>
                        <td>{version.unit_name || (version.unit_id ? "—" : "sem unidade")}</td>
                        <td>{String(version.valid_from).slice(0, 10)} a {String(version.valid_to).slice(0, 10)}</td>
                        <td><StatusBadge label={scheduleVersionStatusLabel(version.status)} tone={scheduleVersionStatusTone(version.status)} /></td>
                        <td>{version.published_at ? <Stamp value={version.published_at} /> : "—"}</td>
                        <td>
                          <div className={styles.actions}>
                            <button
                              type="button"
                              onClick={() => onSelectVersion(version)}
                              className={selectedVersion?.id === version.id ? styles.primary : undefined}
                            >
                              Ver calendário
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {selectedVersion ? (
            <>
              <section className={styles.panel} aria-labelledby="schedule-calendar-title">
                <h2 id="schedule-calendar-title" className={styles.panelTitle}>
                  Calendário da versão v{selectedVersion.version} — {String(selectedVersion.valid_from).slice(0, 10)} a {String(selectedVersion.valid_to).slice(0, 10)}
                </h2>
                <div role="group" aria-label="Visão do calendário" className={styles.actions}>
                  {([["posto", "Por posto"], ["equipe", "Por equipe"], ["pessoa", "Por pessoa"]] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={calendarView === key}
                      onClick={() => setCalendarView(key)}
                      className={calendarView === key ? styles.primary : undefined}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {detailLoading ? <UiState variant="loading" title="Carregando entradas da versão…" /> : null}
                {!detailLoading && detailError ? <ReadError error={detailError} onRetry={() => onSelectVersion(selectedVersion)} /> : null}
                {!detailLoading && !detailError && (() => {
                  const { dates, truncated } = versionDateWindow(selectedVersion);
                  if (dates.length === 0) {
                    return <UiState variant="error" title="Validade da versão ilegível" detail="O calendário não pode ser montado com estas datas." />;
                  }
                  const groups = new Map<string, { label: string; cells: Map<string, string> }>();
                  for (const entry of scheduleEntries) {
                    const date = String(entry.entry_date).slice(0, 10);
                    if (calendarView === "posto") {
                      const key = entry.post_id;
                      if (!groups.has(key)) groups.set(key, { label: entry.post_name || "posto sem nome", cells: new Map() });
                      const cell = groups.get(key)!.cells;
                      cell.set(date, cell.has(date) ? `${cell.get(date)}, ${entry.employee_name || "profissional sem nome"}` : (entry.employee_name || "profissional sem nome"));
                    } else if (calendarView === "equipe") {
                      const key = entry.unit_name || "sem unidade";
                      if (!groups.has(key)) groups.set(key, { label: key, cells: new Map() });
                      const cell = groups.get(key)!.cells;
                      const people = new Set(String(cell.get(date) || "").split("||").filter(Boolean));
                      people.add(entry.employee_id);
                      cell.set(date, [...people].join("||"));
                    } else {
                      const key = entry.employee_id;
                      if (!groups.has(key)) groups.set(key, { label: entry.employee_name || "profissional sem nome", cells: new Map() });
                      const cell = groups.get(key)!.cells;
                      cell.set(date, cell.has(date) ? `${cell.get(date)}, ${entry.shift_template_name || "turno sem nome"}` : (entry.shift_template_name || "turno sem nome"));
                    }
                  }
                  if (groups.size === 0) {
                    return <UiState variant="empty" title="Nenhuma entrada nesta versão" detail="Versão sem entrada é versão sem calendário — não inventamos escala." />;
                  }
                  return (
                    <>
                      <div className={styles.tableWrap} role="region" aria-label="Tabela com rolagem horizontal" tabIndex={0}>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th scope="col" className={styles.stickyCol}>
                                {calendarView === "posto" ? "Posto" : calendarView === "equipe" ? "Equipe (unidade)" : "Profissional"}
                              </th>
                              {dates.map(date => (
                                <th key={date} scope="col" align="center">{shortDate(date)}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[...groups.entries()].map(([key, group]) => (
                              <tr key={key}>
                                <td className={styles.stickyCol}>{group.label}</td>
                                {dates.map(date => {
                                  const raw = group.cells.get(date);
                                  const text = calendarView === "equipe"
                                    ? (raw ? `${raw.split("||").length}` : "")
                                    : (raw || "");
                                  return <td key={date} align="center">{text || "—"}</td>;
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {truncated ? (
                        <p className={styles.hint} role="note">
                          Validade maior que {CALENDAR_MAX_DAYS} dias: exibindo os primeiros {CALENDAR_MAX_DAYS} dias da validade.
                        </p>
                      ) : null}
                      <footer className={styles.footnote}>
                        <strong>Período e fonte.</strong> Colunas = dias da validade da versão ({String(selectedVersion.valid_from).slice(0, 10)} a{" "}
                        {String(selectedVersion.valid_to).slice(0, 10)}). Por posto = profissionais escalados no posto naquele dia; por equipe =
                        quantidade de profissionais distintos escalados na unidade naquele dia; por pessoa = turnos do profissional naquele dia.
                        Célula vazia (—) é ausência de entrada registrada, não folga confirmada.
                      </footer>
                    </>
                  );
                })()}
              </section>

              <section className={styles.panel} aria-labelledby="schedule-acks-title">
                <h2 id="schedule-acks-title" className={styles.panelTitle}>Ciência da escala</h2>
                {detailLoading ? <UiState variant="loading" title="Carregando ciências…" /> : null}
                {!detailLoading && detailError ? (
                  <p className={styles.hint} data-testid="operacao-ciencias-indisponiveis">
                    As ciências desta versão não são exibidas porque a leitura da versão falhou — o motivo está no
                    calendário acima. Nenhum profissional é apresentado como pendente ou ciente sem essa leitura.
                  </p>
                ) : null}
                {!detailLoading && !detailError && (() => {
                  const employees = [...new Map(scheduleEntries.map(entry => [entry.employee_id, entry])).values()];
                  return (
                    <>
                      <p className={styles.hint}>
                        Ciência registrada pela interface para a versão selecionada. A segunda ciência do mesmo
                        profissional na mesma versão é rejeitada sem duplicar efeito — o banco garante e a tela mostra.
                      </p>
                      {ackPending ? (
                        <UiState variant="loading"
                          title={ackPending.versionId !== selectedVersion.id ? "Há uma ciência em andamento em outra seleção" : ackPending.phase === "sending" ? "Registrando ciência…" : "Conferindo ciências…"}
                          detail="Aguarde a conclusão. Nenhum envio é repetido automaticamente; consultar a lista não envia outra ciência." />
                      ) : null}
                      {ackReadError ? (
                        <UiState variant={opsErrorVariant(ackReadError)} title="A lista de ciências não foi atualizada"
                          detail={`A última lista conhecida pode estar desatualizada. ${ackReadError.detail} ${opsErrorFootnote(ackReadError)}`}
                          retryLabel={ackReadError.canRetry && !ackPending ? "Consultar ciências novamente" : undefined}
                          onRetry={ackReadError.canRetry && !ackPending ? onRetryAcknowledgments : undefined} />
                      ) : null}
                      {employees.length === 0 ? (
                        <UiState variant="empty" title="Nenhum profissional com entrada nesta versão" detail="Ciência pressupõe escala publicada com entradas." />
                      ) : (
                        <div className={styles.tableWrap} role="region" aria-label="Tabela com rolagem horizontal" tabIndex={0}>
                          <table className={styles.table}>
                            <thead>
                              <tr>
                                <th scope="col">Profissional</th>
                                <th scope="col">Situação</th>
                                <th scope="col">Ação</th>
                              </tr>
                            </thead>
                            <tbody>
                              {employees.map(employee => {
                                const ack = scheduleAcks.find(item => item.employee_id === employee.employee_id);
                                return (
                                  <tr key={employee.employee_id}>
                                    <td>{employee.employee_name || "—"}</td>
                                    <td>
                                      <StatusBadge
                                        label={ack ? `Ciente desde ${opsDateTime(ack.acknowledged_at)}` : "Pendente"}
                                        tone={ack ? "success" : "warning"}
                                      />
                                      {ack ? <span className={styles.hint}> · {opsIsoStamp(ack.acknowledged_at)}</span> : null}
                                    </td>
                                    <td>
                                      <div className={styles.actions}>
                                        <button type="button" disabled={Boolean(ackPending || ackReadError)} onClick={() => onAcknowledge(employee.employee_id, employee.employee_name || "profissional")}>
                                          Registrar ciência
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {ackMessage ? <p className={styles.notice} role="status">{ackMessage}</p> : null}
                      {ackError ? (
                        <div className={`${styles.notice} ${styles.noticeError}`} role="alert">
                          <strong>Não foi possível confirmar o registro</strong>
                          <p className={styles.hint}>Confira a lista de ciências antes de decidir por um novo envio. Não repetimos o envio automaticamente.</p>
                          <strong>{ackError.title}</strong>
                          <p className={styles.hint}>{ackError.detail} {opsErrorFootnote(ackError)}</p>
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </section>

              <section className={styles.panel} aria-labelledby="schedule-history-title">
                <h2 id="schedule-history-title" className={styles.panelTitle}>Histórico da versão</h2>
                {detailLoading ? <UiState variant="loading" title="Carregando histórico…" /> : null}
                {!detailLoading && detailError ? (
                  <p className={styles.hint} data-testid="operacao-historico-indisponivel">
                    O histórico desta versão não é exibido porque a leitura da versão falhou — o motivo está no
                    calendário acima.
                  </p>
                ) : null}
                {!detailLoading && !detailError && scheduleHistory.length === 0 ? (
                  <UiState variant="empty" title="Nenhuma transição registrada para esta versão" />
                ) : null}
                {!detailLoading && !detailError && scheduleHistory.length > 0 ? (
                  <div className={styles.tableWrap} role="region" aria-label="Tabela com rolagem horizontal" tabIndex={0}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th scope="col">Quando</th>
                          <th scope="col">Transição</th>
                          <th scope="col">Por</th>
                          <th scope="col">Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scheduleHistory.map(item => (
                          <tr key={item.id}>
                            <td><Stamp value={item.created_at} /></td>
                            <td>
                              <StatusBadge
                                label={item.previous_status
                                  ? `${scheduleVersionStatusLabel(item.previous_status)} → ${scheduleVersionStatusLabel(item.next_status)}`
                                  : `Criada como ${scheduleVersionStatusLabel(item.next_status)}`}
                                tone="neutral"
                              />
                            </td>
                            <td>{item.changed_by}</td>
                            <td>{item.reason || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function CoveragePanel({ coverages }: { coverages: CoverageRequest[] }) {
  return (
    <section className={styles.panel} aria-labelledby="coverage-title">
      <h2 id="coverage-title" className={styles.panelTitle}>Solicitações de cobertura e substituição</h2>
      {coverages.length === 0 ? (
        <UiState variant="empty" title="Nenhuma pendência de cobertura registrada" />
      ) : (
        <div className={styles.tableWrap} role="region" aria-label="Tabela com rolagem horizontal" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Situação</th>
                <th scope="col">Responsável</th>
                <th scope="col">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {coverages.map(cov => (
                <tr key={cov.id}>
                  <td>{cov.coverage_date || String(cov.requested_at).slice(0, 10)}</td>
                  <td><StatusBadge label={coverageRequestStatusLabel(cov.status)} tone={coverageRequestStatusTone(cov.status)} /></td>
                  <td>{cov.responsible_name || "—"}</td>
                  <td>{cov.reason || "Ausência/falta"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function HandoverPanel({ handovers }: { handovers: Handover[] }) {
  return (
    <section className={styles.panel} aria-labelledby="handover-title">
      <h2 id="handover-title" className={styles.panelTitle}>Passagem de plantão</h2>
      {handovers.length === 0 ? (
        <UiState variant="empty" title="Nenhuma passagem de plantão registrada" />
      ) : (
        <div className={styles.tableWrap} role="region" aria-label="Tabela com rolagem horizontal" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Protocolo</th>
                <th scope="col">Data/hora</th>
                <th scope="col">Situação</th>
                <th scope="col">Pendências</th>
              </tr>
            </thead>
            <tbody>
              {handovers.map(h => (
                <tr key={h.id}>
                  <td><code>{h.protocol}</code></td>
                  <td><Stamp value={h.handover_date} /></td>
                  <td><StatusBadge label={handoverStatusLabel(h.status)} tone={handoverStatusTone(h.status)} /></td>
                  <td>{h.pending_tasks || "Sem pendências"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function OccurrencePanel({ occurrences }: { occurrences: Occurrence[] }) {
  return (
    <section className={styles.panel} aria-labelledby="occurrence-title">
      <h2 id="occurrence-title" className={styles.panelTitle}>Livro de ocorrências</h2>
      {occurrences.length === 0 ? (
        <UiState variant="empty" title="Nenhuma ocorrência registrada no livro" />
      ) : (
        <div className={styles.tableWrap} role="region" aria-label="Tabela com rolagem horizontal" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Protocolo</th>
                <th scope="col">Título</th>
                <th scope="col">Categoria</th>
                <th scope="col">Gravidade</th>
                <th scope="col">Situação</th>
              </tr>
            </thead>
            <tbody>
              {occurrences.map(occ => (
                <tr key={occ.id}>
                  <td><code>{occ.protocol}</code></td>
                  <td>{occ.title}</td>
                  <td>{occ.category}</td>
                  <td><StatusBadge label={severityLabel(occ.severity)} tone={severityTone(occ.severity)} /></td>
                  <td><StatusBadge label={occurrenceStatusLabel(occ.status)} tone={occurrenceStatusTone(occ.status)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ChecklistPanel({ checklists }: { checklists: ChecklistInstance[] }) {
  return (
    <section className={styles.panel} aria-labelledby="checklist-title">
      <h2 id="checklist-title" className={styles.panelTitle}>Checklists de posto e execução</h2>
      {checklists.length === 0 ? (
        <UiState variant="empty" title="Nenhuma execução de checklist registrada" />
      ) : (
        <div className={styles.tableWrap} role="region" aria-label="Tabela com rolagem horizontal" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Data agendada</th>
                <th scope="col">Situação</th>
                <th scope="col">Execução</th>
              </tr>
            </thead>
            <tbody>
              {checklists.map(inst => (
                <tr key={inst.id}>
                  <td>{String(inst.scheduled_date).slice(0, 10)}</td>
                  <td><StatusBadge label={checklistInstanceStatusLabel(inst.status)} tone={checklistInstanceStatusTone(inst.status)} /></td>
                  <td>{inst.executed_at ? <Stamp value={inst.executed_at} /> : "Pendente"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
