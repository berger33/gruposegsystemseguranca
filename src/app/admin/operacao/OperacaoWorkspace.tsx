"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import OpsAdvanced2Client from "../ti/OpsAdvanced2Client";
import OpsAdvanced3Client from "../ti/OpsAdvanced3Client";
import UiState from "../../../components/ui/UiState";
import styles from "../../../components/ui/UiWorkspace.module.css";
import {
  allocationStatusLabel,
  checklistStatusLabel,
  coverageRequestStatusLabel,
  describeOpsError,
  dimensioningStatusLabel,
  gapStatusLabel,
  handoverStatusLabel,
  occurrenceSeverityLabel,
  occurrenceStatusLabel,
  opsErrorFootnote,
  opsErrorVariant,
  postTypeLabel,
  weekdayLabel,
  roleTypeLabel,
  scheduleVersionStatusLabel,
} from "../../../lib/ops-vocabulary.mjs";
import type { OpsErrorDescriptor } from "../../../lib/ops-vocabulary.mjs";

// UX-07A: toda falha desta tela passa pelo vocabulário de operação. Antes, o
// `catch` exibia `err.message` — ou seja, o código canônico cru, ou a frase
// "Falha ao carregar." — e 403 (sem concessão) ficava indistinguível de 503
// (leitura indisponível). Agora carregando, vazio, falha e negado são estados
// distintos e declarados, e o código fica só no rodapé, entre parênteses.
function asOpsFailure(err: unknown): OpsErrorDescriptor {
  return err && typeof err === "object" && typeof (err as OpsErrorDescriptor).kind === "string"
    ? (err as OpsErrorDescriptor)
    : describeOpsError(null, 0);
}

// OPS-01: day_of_week segue a convenção 0=domingo .. 6=sábado (getDay).
// NULL significa que a necessidade não restringe o dia — exibido sem inventar
// semântica adicional. UX-07A moveu o rótulo para `weekdayLabel`, no
// vocabulário da família, para que a tela não tenha catálogo próprio.

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

// UX-07A: as abas passam a ser dados, não catorze blocos copiados. A mesma
// lista governa o `tablist`, o `tabpanel`, o nome acessível do painel e o
// roving tabindex.
const OPS_TABS = [
  ["postos", "Postos e alocações"],
  ["jornada", "Jornada e habilitação (OPS-04)"],
  ["dimensionamento", "Dimensionamento (OPS-02)"],
  ["escalas", "Escalas (OPS-03)"],
  ["cobertura", "Cobertura (OPS-05)"],
  ["passagem", "Passagem de turno (OPS-06)"],
  ["ocorrencias", "Livro de ocorrências (OPS-07)"],
  ["checklists", "Checklists de posto (OPS-08)"],
  ["supervisao", "Supervisão"],
  ["rondas", "Rondas e claviculário"],
  ["relatorios", "Relatórios"],
  ["metricas", "Métricas e escalas"],
  ["limpeza", "Limpeza"],
  ["monitoramento", "Monitoramento sintético"],
] as const satisfies readonly (readonly [string, string])[];

type OpsTabId = (typeof OPS_TABS)[number][0];

export default function OperacaoWorkspace() {
  const [activeTab, setActiveTab] = useState<OpsTabId>("postos");
  const tabRefs = useRef<Partial<Record<OpsTabId, HTMLButtonElement | null>>>({});
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

  async function fetchJson(path: string) {
    let response: Response;
    try {
      response = await fetch(path, { cache: "no-store", headers: { accept: "application/json" } });
    } catch {
      // A requisição nem chegou a ser respondida. Isso é falha de rede, nunca
      // ausência de registro.
      throw describeOpsError(null, 0);
    }
    const value = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw describeOpsError(typeof value?.error === "string" ? value.error : null, response.status);
    }
    return value;
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [postData, allocData, covData, handData, occData, checkData, ruleData, qualData, validationData] = await Promise.all([
        fetchJson("/api/ops/posts?limit=100"),
        fetchJson("/api/ops/allocations"),
        fetchJson("/api/ops/coverage-requests"),
        fetchJson("/api/ops/handovers"),
        fetchJson("/api/ops/occurrence-book"),
        fetchJson("/api/ops/checklist-instances"),
        fetchJson("/api/ops/work-rules"),
        fetchJson("/api/ops/qualifications"),
        fetchJson("/api/ops/validations?is_valid=false"),
      ]);
      setPosts(postData.posts || []);
      setAllocations(allocData.allocations || []);
      setCoverages(covData.requests || []);
      setHandovers(handData.handovers || []);
      setOccurrences(occData.occurrences || []);
      setChecklists(checkData.instances || []);
      setWorkRules(ruleData.rules || []);
      setQualifications(qualData.qualifications || []);
      setValidations(validationData.validations || []);
    } catch (err: unknown) {
      setError(asOpsFailure(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function loadStructure() {
    setStructureLoading(true);
    setStructureError(null);
    try {
      const [roleData, needData] = await Promise.all([
        fetchJson("/api/ops/job-roles"),
        fetchJson("/api/ops/post-shift-needs"),
      ]);
      setJobRoles(roleData.roles || []);
      setShiftNeeds(needData.needs || []);
    } catch (err: unknown) {
      setStructureError(asOpsFailure(err));
    } finally {
      setStructureLoading(false);
    }
  }

  useEffect(() => { void loadStructure(); }, []);

  async function loadDimensioning() {
    setDimLoading(true);
    setDimError(null);
    try {
      const [dimData, gapData] = await Promise.all([
        fetchJson("/api/ops/dimensioning"),
        fetchJson("/api/ops/coverage-gaps"),
      ]);
      setDimensionings(dimData.dimensionings || []);
      setGaps(gapData.gaps || []);
    } catch (err: unknown) {
      setDimError(asOpsFailure(err));
    } finally {
      setDimLoading(false);
    }
  }

  useEffect(() => { void loadDimensioning(); }, []);

  async function loadSchedules() {
    setSchedLoading(true);
    setSchedError(null);
    try {
      const data = await fetchJson("/api/ops/schedule-versions");
      setScheduleVersions(data.versions || []);
    } catch (err: unknown) {
      setSchedError(asOpsFailure(err));
    } finally {
      setSchedLoading(false);
    }
  }

  useEffect(() => { void loadSchedules(); }, []);

  async function selectVersion(version: ScheduleVersion) {
    setSelectedVersion(version);
    setDetailLoading(true);
    setAckMessage("");
    setCalendarView("posto");
    try {
      const [entryData, ackData, historyData] = await Promise.all([
        fetchJson(`/api/ops/schedule-entries?version_id=${version.id}`),
        fetchJson(`/api/ops/schedule-acks?version_id=${version.id}`),
        fetchJson(`/api/ops/schedule-history?version_id=${version.id}`),
      ]);
      setScheduleEntries(entryData.entries || []);
      setScheduleAcks(ackData.acknowledgments || []);
      setScheduleHistory(historyData.history || []);
    } catch (err: unknown) {
      // O painel de detalhe não pode fingir calendário: sem leitura completa,
      // limpa as entradas e mostra o erro.
      setScheduleEntries([]);
      setScheduleAcks([]);
      setScheduleHistory([]);
      setSchedError(asOpsFailure(err));
    } finally {
      setDetailLoading(false);
    }
  }

  async function acknowledgeSchedule(employeeId: string, employeeName: string) {
    if (!selectedVersion) return;
    setAckMessage("");
    try {
      const response = await fetch("/api/ops/schedule-acks", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ version_id: selectedVersion.id, employee_id: employeeId }),
      });
      const value = await response.json().catch(() => ({}));
      if (response.status === 201) {
        setAckMessage(`Ciência registrada para ${employeeName}.`);
      } else if (value.error === "duplicate_ack") {
        setAckMessage(`Ciência já registrada para ${employeeName} — segunda ciência não duplica efeito.`);
      } else {
        const falha = describeOpsError(typeof value?.error === "string" ? value.error : null, response.status);
        setAckMessage(`Ciência não registrada. ${falha.title}. ${falha.detail} ${opsErrorFootnote(falha)}`);
      }
      const ackData = await fetchJson(`/api/ops/schedule-acks?version_id=${selectedVersion.id}`);
      setScheduleAcks(ackData.acknowledgments || []);
    } catch (err: unknown) {
      const falha = asOpsFailure(err);
      setAckMessage(`${falha.title} ${falha.detail} ${opsErrorFootnote(falha)}`);
    }
  }

  const activeTabLabel = (OPS_TABS.find(([id]) => id === activeTab) ?? OPS_TABS[0])[1];

  // UX-07A: roving tabindex de verdade. Só a aba ativa fica na ordem de
  // tabulação; ←/→ circulam e Home/End vão aos extremos, como manda o padrão
  // de `tablist` — antes as abas eram botões soltos com `role="tab"`, sem
  // `tabpanel`, sem teclado e sem foco gerenciado.
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = OPS_TABS.findIndex(([id]) => id === activeTab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % OPS_TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + OPS_TABS.length) % OPS_TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = OPS_TABS.length - 1;
    else return;
    event.preventDefault();
    const target = OPS_TABS[next][0];
    setActiveTab(target);
    tabRefs.current[target]?.focus();
  }

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 18px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <nav aria-label="Navegação operacional" style={{ marginBottom: 16 }}>
        <a href="/admin/contratos">Contratos</a> · <a href="/admin/crm">Empresas e funil</a>
      </nav>

      <h1>Operação — Controle e Gestão Operacional (L06)</h1>
      <p style={{ color: "#475569", marginBottom: 24 }}>
        Superfície canônica de operação. Alocar ou cobrir não significa faturamento nem recebimento. Contrato encerrado, cancelado ou suspenso não recebe nova alocação ou rotina; o histórico é preservado.
      </p>

      <div className={styles.tabs} role="tablist" aria-label="Seções da operação">
        {OPS_TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`ops-aba-${id}`}
            aria-selected={activeTab === id}
            aria-controls={`ops-painel-${id}`}
            tabIndex={activeTab === id ? 0 : -1}
            ref={node => { tabRefs.current[id] = node; }}
            className={activeTab === id ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab(id)}
            onKeyDown={onTabKeyDown}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`ops-painel-${activeTab}`}
        aria-labelledby={`ops-aba-${activeTab}`}
        tabIndex={-1}
        className={styles.tabPanel}
      >
      <h2 className={styles.visuallyHidden}>{activeTabLabel}</h2>
      {loading && (
        <UiState
          variant="loading"
          title="Carregando a operação…"
          detail="Lendo postos, alocações, coberturas, passagens, ocorrências, checklists, regras de jornada, qualificações e validações."
        />
      )}
      {!loading && error && (
        <UiState
          variant={opsErrorVariant(error)}
          title={error.title}
          detail={`${error.detail} ${opsErrorFootnote(error)}`}
          retryLabel={error.canRetry ? "Tentar novamente" : undefined}
          onRetry={error.canRetry ? () => { void load(); } : undefined}
        />
      )}

      {!loading && !error && activeTab === "postos" && (
        <>
          <p style={{ padding: 10, background: "#eff6ff", borderRadius: 6, marginBottom: 12 }}>
            Cadeia operacional (OPS-01): <strong>cliente → unidade atendida → posto físico → necessidade por turno →
            alocação</strong>. Posto sem necessidade por turno cadastrada não gera cobrança de escala — a lacuna aparece
            como lacuna, não como número inventado.
          </p>
          <section className={styles.legacy} aria-labelledby="posts-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 12 }}>
            <h2 id="posts-title">Postos físicos</h2>
            {posts.length === 0 ? (
              <UiState variant="empty" title="Nenhum posto cadastrado" detail="A leitura foi concluída com sucesso: não há posto físico registrado para o seu escopo." />
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <th align="left" style={{ padding: 8 }}>Posto</th>
                    <th align="left" style={{ padding: 8 }}>Tipo</th>
                    <th align="left" style={{ padding: 8 }}>Cliente</th>
                    <th align="left" style={{ padding: 8 }}>Unidade atendida</th>
                    <th align="left" style={{ padding: 8 }}>Contrato</th>
                    <th align="left" style={{ padding: 8 }}>Necessidades</th>
                    <th align="left" style={{ padding: 8 }}>Ativo</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map(post => (
                    <tr key={post.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: 8 }}>{post.name}</td>
                      <td style={{ padding: 8 }}>{postTypeLabel(post.post_type)}</td>
                      <td style={{ padding: 8 }}>{post.company_name || (post.company_id ? "—" : "sem cliente")}</td>
                      <td style={{ padding: 8 }}>{post.unit_name || (post.unit_id ? "—" : "sem unidade")}</td>
                      <td style={{ padding: 8 }}>{post.contract_title || (post.contract_id ? "—" : "sem contrato")}</td>
                      <td style={{ padding: 8 }}>
                        {shiftNeeds.filter(need => need.post_id === post.id && need.is_active).length}
                      </td>
                      <td style={{ padding: 8 }}>{post.is_active ? "sim" : "não"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {structureLoading && <UiState variant="loading" title="Carregando a estrutura operacional…" detail="Lendo cargos, funções e necessidades por turno." />}
          {!structureLoading && structureError && (
            <UiState
              variant={opsErrorVariant(structureError)}
              title={structureError.title}
              detail={`${structureError.detail} ${opsErrorFootnote(structureError)}`}
              retryLabel={structureError.canRetry ? "Tentar novamente" : undefined}
              onRetry={structureError.canRetry ? () => { void loadStructure(); } : undefined}
            />
          )}

          {!structureLoading && !structureError && (
            <>
              <section className={styles.legacy} aria-labelledby="job-roles-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 20 }}>
                <h2 id="job-roles-title">Cargos e funções (OPS-01)</h2>
                {jobRoles.length === 0 ? (
                  <UiState variant="empty" title="Nenhum cargo ou função cadastrado" detail="A leitura foi concluída com sucesso. Alocação com cargo exigido depende de entidade própria registrada aqui." />
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <th align="left" style={{ padding: 8 }}>Cargo/função</th>
                        <th align="left" style={{ padding: 8 }}>Tipo</th>
                        <th align="left" style={{ padding: 8 }}>Descrição</th>
                        <th align="left" style={{ padding: 8 }}>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobRoles.map(role => (
                        <tr key={role.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: 8 }}>{role.name}</td>
                          <td style={{ padding: 8 }}>{roleTypeLabel(role.role_type)}</td>
                          <td style={{ padding: 8 }}>{role.description || "—"}</td>
                          <td style={{ padding: 8 }}>
                            <span style={{ padding: "2px 8px", borderRadius: 4, background: role.is_active ? "#dcfce7" : "#f1f5f9" }}>
                              {role.is_active ? "ativo" : "inativo"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section className={styles.legacy} aria-labelledby="shift-needs-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 20 }}>
                <h2 id="shift-needs-title">Necessidade por turno (OPS-01)</h2>
                {shiftNeeds.length === 0 ? (
                  <UiState variant="empty" title="Nenhuma necessidade por turno cadastrada" detail="A leitura foi concluída com sucesso. Sem cadastro, o dimensionamento de posto não é inferido." />
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <th align="left" style={{ padding: 8 }}>Posto</th>
                        <th align="left" style={{ padding: 8 }}>Turno</th>
                        <th align="left" style={{ padding: 8 }}>Dia</th>
                        <th align="left" style={{ padding: 8 }}>Profissionais exigidos</th>
                        <th align="left" style={{ padding: 8 }}>Cargo exigido</th>
                        <th align="left" style={{ padding: 8 }}>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shiftNeeds.map(need => (
                        <tr key={need.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: 8 }}>{need.post_name}</td>
                          <td style={{ padding: 8 }}>{need.shift_template_name || "—"}</td>
                          <td style={{ padding: 8 }}>
                            {weekdayLabel(need.day_of_week)}
                          </td>
                          <td style={{ padding: 8 }}>{need.required_headcount}</td>
                          <td style={{ padding: 8 }}>{need.role_name || "não exigido"}</td>
                          <td style={{ padding: 8 }}>
                            <span style={{ padding: "2px 8px", borderRadius: 4, background: need.is_active ? "#dcfce7" : "#f1f5f9" }}>
                              {need.is_active ? "ativo" : "inativo"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          )}

          <section className={styles.legacy} aria-labelledby="alloc-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 20 }}>
            <h2 id="alloc-title">Alocações</h2>
            {allocations.length === 0 ? (
              <UiState variant="empty" title="Nenhuma alocação registrada" detail="A leitura foi concluída com sucesso: não há alocação no seu escopo." />
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <th align="left" style={{ padding: 8 }}>Posto</th>
                    <th align="left" style={{ padding: 8 }}>Profissional</th>
                    <th align="left" style={{ padding: 8 }}>Data</th>
                    <th align="left" style={{ padding: 8 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.map(allocation => (
                    <tr key={allocation.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: 8 }}>{allocation.post_name || "—"}</td>
                      <td style={{ padding: 8 }}>{allocation.employee_name || "—"}</td>
                      <td style={{ padding: 8 }}>{String(allocation.allocation_date).slice(0, 10)}</td>
                      <td style={{ padding: 8 }}>{allocationStatusLabel(allocation.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {!loading && !error && activeTab === "jornada" && (
        <>
          <p style={{ padding: 10, background: "#eff6ff", borderRadius: 6 }}>
            A alocação e a entrada de escala só são bloqueadas por jornada e descanso quando existe regra{" "}
            <strong>aprovada e ativa</strong>. Sem regra aprovada, o sistema não presume limite algum e diz isso
            explicitamente. Habilitação e documentação exigem cadastro em qualificações — competência não é inferida.
          </p>

          <section className={styles.legacy} aria-labelledby="work-rules-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 12 }}>
            <h2 id="work-rules-title">Regras de jornada e descanso</h2>
            {workRules.length === 0 ? (
              <UiState variant="empty" title="Nenhuma regra de jornada cadastrada" detail="A leitura foi concluída com sucesso. Sem regra aprovada, jornada e descanso não são validados." />
            ) : (
              <>
                {workRules.every(rule => !(rule.is_approved && rule.is_active)) && (
                  <p role="status" style={{ padding: 8, background: "#fef3c7", borderRadius: 6 }}>
                    Nenhuma regra aprovada e ativa: jornada, descanso, jornada semanal e dias consecutivos não estão sendo aplicados.
                  </p>
                )}
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <th align="left" style={{ padding: 8 }}>Regra</th>
                      <th align="left" style={{ padding: 8 }}>Jornada máx./dia</th>
                      <th align="left" style={{ padding: 8 }}>Descanso mín.</th>
                      <th align="left" style={{ padding: 8 }}>Jornada máx./semana</th>
                      <th align="left" style={{ padding: 8 }}>Dias consec.</th>
                      <th align="left" style={{ padding: 8 }}>Certificação</th>
                      <th align="left" style={{ padding: 8 }}>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workRules.map(rule => {
                      const enforcing = rule.is_approved && rule.is_active;
                      return (
                        <tr key={rule.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: 8 }}>{rule.name}</td>
                          <td style={{ padding: 8 }}>{Number(rule.max_daily_hours)} h</td>
                          <td style={{ padding: 8 }}>{Number(rule.min_rest_hours)} h</td>
                          <td style={{ padding: 8 }}>{Number(rule.max_weekly_hours)} h</td>
                          <td style={{ padding: 8 }}>{rule.max_consecutive_days}</td>
                          <td style={{ padding: 8 }}>{rule.requires_certification ? "exigida" : "não exigida"}</td>
                          <td style={{ padding: 8 }}>
                            <span style={{ padding: "2px 8px", borderRadius: 4, background: enforcing ? "#dcfce7" : "#fef3c7" }}>
                              {enforcing ? "aprovada e aplicada" : rule.is_approved ? "aprovada, inativa" : "não aprovada"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </section>

          <section className={styles.legacy} aria-labelledby="qualifications-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 20 }}>
            <h2 id="qualifications-title">Habilitação e documentação</h2>
            {qualifications.length === 0 ? (
              <UiState variant="empty" title="Nenhuma qualificação cadastrada" detail="A leitura foi concluída com sucesso. Alocar com cargo ou função exige habilitação registrada e dentro da validade." />
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <th align="left" style={{ padding: 8 }}>Certificação</th>
                    <th align="left" style={{ padding: 8 }}>Cargo/função</th>
                    <th align="left" style={{ padding: 8 }}>Validade</th>
                    <th align="left" style={{ padding: 8 }}>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {qualifications.map(qual => {
                    const expired = !!qual.valid_until && String(qual.valid_until).slice(0, 10) < new Date().toISOString().slice(0, 10);
                    return (
                      <tr key={qual.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: 8 }}>{qual.certification_type}</td>
                        <td style={{ padding: 8 }}>{qual.role_id ? "vinculado" : "—"}</td>
                        <td style={{ padding: 8 }}>{qual.valid_until ? String(qual.valid_until).slice(0, 10) : "sem vencimento"}</td>
                        <td style={{ padding: 8 }}>
                          <span style={{ padding: "2px 8px", borderRadius: 4, background: !qual.is_valid || expired ? "#fee2e2" : "#dcfce7" }}>
                            {!qual.is_valid ? "inválida" : expired ? "vencida" : "válida"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section className={styles.legacy} aria-labelledby="validations-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 20 }}>
            <h2 id="validations-title">Bloqueios registrados</h2>
            {validations.length === 0 ? (
              <UiState variant="empty" title="Nenhum bloqueio de validação registrado" detail="A leitura foi concluída com sucesso: nenhuma validação inválida consta no período." />
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <th align="left" style={{ padding: 8 }}>Quando</th>
                    <th align="left" style={{ padding: 8 }}>Tipo</th>
                    <th align="left" style={{ padding: 8 }}>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {validations.map(item => (
                    <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: 8 }}>{String(item.validated_at).slice(0, 16).replace("T", " ")}</td>
                      <td style={{ padding: 8 }}>
                        <span style={{ padding: "2px 8px", borderRadius: 4, background: "#fee2e2", color: "#991b1b" }}>
                          {item.validation_type}
                        </span>
                      </td>
                      <td style={{ padding: 8 }}>{String((item.conflict_details as { error?: string } | null)?.error || "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {!loading && !error && activeTab === "dimensionamento" && (
        <>
          <p style={{ padding: 10, background: "#eff6ff", borderRadius: 6, marginBottom: 12 }}>
            Dimensionamento (OPS-02): contratado × planejado × realizado por faixa de tempo, cobertura por horas e
            profissional habilitado. A habilitação é recomputada ao vivo contra as alocações da faixa, com a mesma
            regra do motor OPS-04 — qualificação vencida ou revogada depois da alocação aparece aqui como lacuna,
            não como número fictício.
          </p>

          {dimLoading && <UiState variant="loading" title="Carregando o dimensionamento…" detail="Lendo contratado, planejado, realizado e lacunas de cobertura." />}
          {!dimLoading && dimError && (
            <UiState
              variant={opsErrorVariant(dimError)}
              title={dimError.title}
              detail={`${dimError.detail} ${opsErrorFootnote(dimError)}`}
              retryLabel={dimError.canRetry ? "Tentar novamente" : undefined}
              onRetry={dimError.canRetry ? () => { void loadDimensioning(); } : undefined}
            />
          )}

          {!dimLoading && !dimError && (
            <>
              <section className={styles.legacy} aria-labelledby="dimensioning-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 12 }}>
                <h2 id="dimensioning-title">Contratado × planejado × realizado por faixa de tempo</h2>
                {dimensionings.length === 0 ? (
                  <UiState variant="empty" title="Nenhum dimensionamento registrado" detail="A leitura foi concluída com sucesso. Sem registro por faixa de tempo, cobertura não é inferida." />
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <th align="left" style={{ padding: 8 }}>Posto</th>
                        <th align="left" style={{ padding: 8 }}>Período</th>
                        <th align="left" style={{ padding: 8 }}>Contratado</th>
                        <th align="left" style={{ padding: 8 }}>Planejado</th>
                        <th align="left" style={{ padding: 8 }}>Realizado</th>
                        <th align="left" style={{ padding: 8 }}>Horas exigidas</th>
                        <th align="left" style={{ padding: 8 }}>Horas realizadas</th>
                        <th align="left" style={{ padding: 8 }}>Cobertura</th>
                        <th align="left" style={{ padding: 8 }}>Alocados na faixa</th>
                        <th align="left" style={{ padding: 8 }}>Habilitados</th>
                        <th align="left" style={{ padding: 8 }}>Sem cargo exigido</th>
                        <th align="left" style={{ padding: 8 }}>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dimensionings.map(dim => (
                        <tr key={dim.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: 8 }}>{dim.post_name || "—"}</td>
                          <td style={{ padding: 8 }}>{String(dim.period_start).slice(0, 10)} a {String(dim.period_end).slice(0, 10)}</td>
                          <td style={{ padding: 8 }}>{dim.contracted_headcount}</td>
                          <td style={{ padding: 8 }}>{dim.planned_headcount}</td>
                          <td style={{ padding: 8 }}>{dim.realized_headcount}</td>
                          <td style={{ padding: 8 }}>{Number(dim.coverage_hours_required)} h</td>
                          <td style={{ padding: 8 }}>{Number(dim.coverage_hours_realized)} h</td>
                          <td style={{ padding: 8 }}>
                            <span style={{
                              padding: "2px 8px", borderRadius: 4,
                              background: Number(dim.coverage_percent) >= 100 ? "#dcfce7" : Number(dim.coverage_percent) >= 70 ? "#fef3c7" : "#fee2e2",
                            }}>
                              {Number(dim.coverage_percent)}%
                            </span>
                          </td>
                          <td style={{ padding: 8 }}>
                            {dim.allocated_employees ?? 0}
                            {Number(dim.allocated_hours || 0) > 0 && ` (${Number(dim.allocated_hours)} h alocadas)`}
                          </td>
                          <td style={{ padding: 8 }}>
                            {dim.qualified_employees ?? 0}
                            {Number(dim.unqualified_employees || 0) > 0 && (
                              <span style={{ color: "#991b1b" }}> + {dim.unqualified_employees} sem habilitação válida</span>
                            )}
                          </td>
                          <td style={{ padding: 8 }}>{dim.employees_without_requirement ?? 0}</td>
                          <td style={{ padding: 8 }}>{dimensioningStatusLabel(dim.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <footer style={{ marginTop: 12, padding: 10, background: "#f8fafc", borderRadius: 6, color: "#475569", fontSize: 14 }}>
                  <strong>Período e fórmula.</strong> Período de cada linha: datas de início e fim do próprio registro de
                  dimensionamento. Cobertura % = horas realizadas ÷ horas exigidas × 100, limitada a 100 (calculada pelo
                  banco na coluna <code>coverage_percent</code>). Alocados na faixa = profissionais distintos com
                  alocação não cancelada dentro do período, no posto da linha; as horas alocadas são a soma das horas
                  dos turnos dessas alocações e não substituem as horas realizadas informadas no registro. Habilitados =
                  alocados cujo cargo exigido na própria alocação possui qualificação válida em{" "}
                  <code>ops_employee_qualifications</code> (<code>is_valid</code> e validade ≥ data da alocação) — a
                  mesma regra aplicada ao alocar (OPS-04). Sem cargo exigido = alocados apenas em alocações sem cargo
                  informado: não são contados como habilitados nem como inabilitados. Dado ausente aparece como lacuna
                  com o pré-requisito de cadastro — nunca como número inventado.
                </footer>
              </section>

              <section className={styles.legacy} aria-labelledby="coverage-gaps-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 20 }}>
                <h2 id="coverage-gaps-title">Lacunas de cobertura (OPS-02)</h2>
                {gaps.length === 0 ? (
                  <UiState variant="empty" title="Nenhuma lacuna de cobertura registrada" detail="A leitura foi concluída com sucesso. Ausência de lacuna registrada não é prova de cobertura: é ausência de registro." />
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <th align="left" style={{ padding: 8 }}>Posto</th>
                        <th align="left" style={{ padding: 8 }}>Data</th>
                        <th align="left" style={{ padding: 8 }}>Janela</th>
                        <th align="left" style={{ padding: 8 }}>Minutos descobertos</th>
                        <th align="left" style={{ padding: 8 }}>Motivo</th>
                        <th align="left" style={{ padding: 8 }}>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gaps.map(gap => (
                        <tr key={gap.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: 8 }}>{gap.post_name || "—"}</td>
                          <td style={{ padding: 8 }}>{String(gap.gap_date).slice(0, 10)}</td>
                          <td style={{ padding: 8 }}>{String(gap.gap_start).slice(0, 16).replace("T", " ")} – {String(gap.gap_end).slice(0, 16).replace("T", " ")}</td>
                          <td style={{ padding: 8 }}>{gap.uncovered_minutes}</td>
                          <td style={{ padding: 8 }}>{gap.reason || "—"}</td>
                          <td style={{ padding: 8 }}>
                            <span style={{ padding: "2px 8px", borderRadius: 4, background: gap.status === "resolvido" ? "#dcfce7" : "#fef3c7" }}>
                              {gapStatusLabel(gap.status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          )}
        </>
      )}

      {!loading && !error && activeTab === "escalas" && (
        <>
          <p style={{ padding: 10, background: "#eff6ff", borderRadius: 6, marginBottom: 12 }}>
            Escalas (OPS-03): versões em rascunho → publicada → revisada com validade e histórico; calendário por
            posto, por equipe e por pessoa; ciência do profissional registrada pela interface, idempotente — a
            segunda ciência não duplica efeito. Entradas só entram em versão editável e dentro da validade.
          </p>

          {schedLoading && <UiState variant="loading" title="Carregando as versões de escala…" detail="Lendo as versões, sua validade e sua situação." />}
          {!schedLoading && schedError && (
            <UiState
              variant={opsErrorVariant(schedError)}
              title={schedError.title}
              detail={`${schedError.detail} ${opsErrorFootnote(schedError)}`}
              retryLabel={schedError.canRetry ? "Tentar novamente" : undefined}
              onRetry={schedError.canRetry ? () => { void loadSchedules(); } : undefined}
            />
          )}

          {!schedLoading && !schedError && (
            <>
              <section className={styles.legacy} aria-labelledby="schedule-versions-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 12 }}>
                <h2 id="schedule-versions-title">Versões de escala</h2>
                {scheduleVersions.length === 0 ? (
                  <UiState variant="empty" title="Nenhuma versão de escala registrada" detail="A leitura foi concluída com sucesso. Sem versão não há calendário, e nada é presumido." />
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                        <th align="left" style={{ padding: 8 }}>Versão</th>
                        <th align="left" style={{ padding: 8 }}>Empresa</th>
                        <th align="left" style={{ padding: 8 }}>Unidade (equipe)</th>
                        <th align="left" style={{ padding: 8 }}>Validade</th>
                        <th align="left" style={{ padding: 8 }}>Situação</th>
                        <th align="left" style={{ padding: 8 }}>Publicada em</th>
                        <th align="left" style={{ padding: 8 }}>Calendário</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scheduleVersions.map(version => (
                        <tr key={version.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: 8 }}>v{version.version}</td>
                          <td style={{ padding: 8 }}>{version.company_name || (version.company_id ? "—" : "sem empresa")}</td>
                          <td style={{ padding: 8 }}>{version.unit_name || (version.unit_id ? "—" : "sem unidade")}</td>
                          <td style={{ padding: 8 }}>{String(version.valid_from).slice(0, 10)} a {String(version.valid_to).slice(0, 10)}</td>
                          <td style={{ padding: 8 }}>
                            <span style={{
                              padding: "2px 8px", borderRadius: 4,
                              background: version.status === "publicada" || version.status === "revisada" ? "#dcfce7" : "#fef3c7",
                            }}>
                              {scheduleVersionStatusLabel(version.status)}
                            </span>
                          </td>
                          <td style={{ padding: 8 }}>{version.published_at ? String(version.published_at).slice(0, 16).replace("T", " ") : "—"}</td>
                          <td style={{ padding: 8 }}>
                            <button
                              type="button"
                              onClick={() => { void selectVersion(version); }}
                              style={{ padding: "4px 10px", cursor: "pointer", border: "1px solid #94a3b8", borderRadius: 6, background: selectedVersion?.id === version.id ? "#2563eb" : "#fff", color: selectedVersion?.id === version.id ? "#fff" : "#1e293b" }}
                            >
                              Ver calendário
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              {selectedVersion && (
                <>
                  <section className={styles.legacy} aria-labelledby="schedule-calendar-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 20 }}>
                    <h2 id="schedule-calendar-title">
                      Calendário da versão v{selectedVersion.version} — {String(selectedVersion.valid_from).slice(0, 10)} a {String(selectedVersion.valid_to).slice(0, 10)}
                    </h2>
                    <div role="group" aria-label="Visão do calendário" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                      {([["posto", "Por posto"], ["equipe", "Por equipe"], ["pessoa", "Por pessoa"]] as const).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={calendarView === key}
                          onClick={() => setCalendarView(key)}
                          style={{ padding: "6px 14px", cursor: "pointer", border: "1px solid #94a3b8", borderRadius: 6, background: calendarView === key ? "#2563eb" : "#fff", color: calendarView === key ? "#fff" : "#1e293b" }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {detailLoading && <p role="status">Carregando entradas da versão…</p>}
                    {!detailLoading && (() => {
                      const { dates, truncated } = versionDateWindow(selectedVersion);
                      if (dates.length === 0) return <p role="alert">Validade da versão ilegível — calendário não pode ser montado.</p>;
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
                        return <UiState variant="empty" title="Nenhuma entrada nesta versão" detail="A leitura foi concluída com sucesso. Versão sem entrada é versão sem calendário: nenhuma escala é inventada." />;
                      }
                      return (
                        <>
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                                  <th align="left" style={{ padding: 6, position: "sticky", left: 0, background: "#fff", minWidth: 180 }}>
                                    {calendarView === "posto" ? "Posto" : calendarView === "equipe" ? "Equipe (unidade)" : "Profissional"}
                                  </th>
                                  {dates.map(date => (
                                    <th key={date} align="center" style={{ padding: 6, borderLeft: "1px solid #f1f5f9" }}>{shortDate(date)}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {[...groups.entries()].map(([key, group]) => (
                                  <tr key={key} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                    <td style={{ padding: 6, position: "sticky", left: 0, background: "#fff", fontWeight: 500 }}>{group.label}</td>
                                    {dates.map(date => {
                                      const raw = group.cells.get(date);
                                      const text = calendarView === "equipe"
                                        ? (raw ? `${raw.split("||").length}` : "")
                                        : (raw || "");
                                      return (
                                        <td key={date} align="center" style={{ padding: 6, borderLeft: "1px solid #f1f5f9", fontSize: 13, background: text ? "#eff6ff" : "transparent" }}>
                                          {text || "—"}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {truncated && (
                            <p role="note" style={{ marginTop: 8, color: "#92400e" }}>
                              Validade maior que {CALENDAR_MAX_DAYS} dias: exibindo os primeiros {CALENDAR_MAX_DAYS} dias da validade.
                            </p>
                          )}
                          <footer style={{ marginTop: 12, padding: 10, background: "#f8fafc", borderRadius: 6, color: "#475569", fontSize: 14 }}>
                            <strong>Período e fonte.</strong> Colunas = dias da validade da versão ({String(selectedVersion.valid_from).slice(0, 10)} a{" "}
                            {String(selectedVersion.valid_to).slice(0, 10)}). Por posto = profissionais escalados no posto naquele dia; por equipe =
                            quantidade de profissionais distintos escalados na unidade naquele dia; por pessoa = turnos do profissional naquele dia.
                            Célula vazia (—) é ausência de entrada registrada, não folga confirmada.
                          </footer>
                        </>
                      );
                    })()}
                  </section>

                  <section className={styles.legacy} aria-labelledby="schedule-acks-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 20 }}>
                    <h2 id="schedule-acks-title">Ciência da escala (OPS-03)</h2>
                    {detailLoading && <p role="status">Carregando ciências…</p>}
                    {!detailLoading && (() => {
                      const employees = [...new Map(scheduleEntries.map(entry => [entry.employee_id, entry])).values()];
                      return (
                        <>
                          <p style={{ color: "#475569" }}>
                            Ciência registrada pela interface para a versão selecionada. A segunda ciência do mesmo
                            profissional na mesma versão é rejeitada sem duplicar efeito — o banco garante e a tela mostra.
                          </p>
                          {employees.length === 0 ? (
                            <UiState variant="empty" title="Nenhum profissional com entrada nesta versão" detail="A leitura foi concluída com sucesso. A ciência pressupõe escala publicada com entradas." />
                          ) : (
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                                  <th align="left" style={{ padding: 8 }}>Profissional</th>
                                  <th align="left" style={{ padding: 8 }}>Situação</th>
                                  <th align="left" style={{ padding: 8 }}>Ação</th>
                                </tr>
                              </thead>
                              <tbody>
                                {employees.map(employee => {
                                  const ack = scheduleAcks.find(item => item.employee_id === employee.employee_id);
                                  return (
                                    <tr key={employee.employee_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                      <td style={{ padding: 8 }}>{employee.employee_name || "—"}</td>
                                      <td style={{ padding: 8 }}>
                                        <span style={{ padding: "2px 8px", borderRadius: 4, background: ack ? "#dcfce7" : "#fef3c7" }}>
                                          {ack ? `ciente desde ${String(ack.acknowledged_at).slice(0, 16).replace("T", " ")}` : "pendente"}
                                        </span>
                                      </td>
                                      <td style={{ padding: 8 }}>
                                        <button
                                          type="button"
                                          onClick={() => { void acknowledgeSchedule(employee.employee_id, employee.employee_name || "profissional"); }}
                                          style={{ padding: "4px 10px", cursor: "pointer", border: "1px solid #94a3b8", borderRadius: 6, background: "#fff" }}
                                        >
                                          Registrar ciência
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                          {ackMessage && <p role="status" style={{ marginTop: 10, padding: 8, background: ackMessage.includes("não") ? "#fef2f2" : "#dcfce7", borderRadius: 6 }}>{ackMessage}</p>}
                        </>
                      );
                    })()}
                  </section>

                  <section className={styles.legacy} aria-labelledby="schedule-history-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 20 }}>
                    <h2 id="schedule-history-title">Histórico da versão</h2>
                    {detailLoading && <p role="status">Carregando histórico…</p>}
                    {!detailLoading && scheduleHistory.length === 0 && (
                      <UiState variant="empty" title="Nenhuma transição registrada para esta versão" detail="A leitura foi concluída com sucesso: o histórico desta versão está vazio." />
                    )}
                    {!detailLoading && scheduleHistory.length > 0 && (
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                            <th align="left" style={{ padding: 8 }}>Quando</th>
                            <th align="left" style={{ padding: 8 }}>Transição</th>
                            <th align="left" style={{ padding: 8 }}>Por</th>
                            <th align="left" style={{ padding: 8 }}>Motivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scheduleHistory.map(item => (
                            <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: 8 }}>{String(item.created_at).slice(0, 16).replace("T", " ")}</td>
                              <td style={{ padding: 8 }}>
                                <span style={{ padding: "2px 8px", borderRadius: 4, background: "#f1f5f9" }}>
                                  {item.previous_status ? `${item.previous_status} → ${item.next_status}` : `criada como ${item.next_status}`}
                                </span>
                              </td>
                              <td style={{ padding: 8 }}>{item.changed_by}</td>
                              <td style={{ padding: 8 }}>{item.reason || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </>
      )}

      {!loading && !error && activeTab === "cobertura" && (
        <section className={styles.legacy} aria-labelledby="coverage-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16 }}>
          <h2 id="coverage-title">Solicitações de Cobertura e Substituição (OPS-05)</h2>
          {coverages.length === 0 ? (
            <UiState variant="empty" title="Nenhuma pendência de cobertura registrada" detail="A leitura foi concluída com sucesso: não há pedido de cobertura no seu escopo." />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <th align="left" style={{ padding: 8 }}>Data</th>
                  <th align="left" style={{ padding: 8 }}>Status</th>
                  <th align="left" style={{ padding: 8 }}>Responsável</th>
                  <th align="left" style={{ padding: 8 }}>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {coverages.map(cov => (
                  <tr key={cov.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 8 }}>{cov.coverage_date || String(cov.requested_at).slice(0, 10)}</td>
                    <td style={{ padding: 8 }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, background: cov.status === "resolvido" ? "#dcfce7" : "#fef3c7" }}>
                        {coverageRequestStatusLabel(cov.status)}
                      </span>
                    </td>
                    <td style={{ padding: 8 }}>{cov.responsible_name || "—"}</td>
                    <td style={{ padding: 8 }}>{cov.reason || "Ausência/falta"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {!loading && !error && activeTab === "passagem" && (
        <section className={styles.legacy} aria-labelledby="handover-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16 }}>
          <h2 id="handover-title">Passagem de Plantão (OPS-06)</h2>
          {handovers.length === 0 ? (
            <UiState variant="empty" title="Nenhuma passagem de plantão registrada" detail="A leitura foi concluída com sucesso: não há passagem de turno no seu escopo." />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <th align="left" style={{ padding: 8 }}>Protocolo</th>
                  <th align="left" style={{ padding: 8 }}>Data/Hora</th>
                  <th align="left" style={{ padding: 8 }}>Status</th>
                  <th align="left" style={{ padding: 8 }}>Pendências</th>
                </tr>
              </thead>
              <tbody>
                {handovers.map(h => (
                  <tr key={h.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 8 }}><code>{h.protocol}</code></td>
                    <td style={{ padding: 8 }}>{String(h.handover_date).slice(0, 16).replace("T", " ")}</td>
                    <td style={{ padding: 8 }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, background: h.status === "aceito" ? "#dcfce7" : "#fef3c7" }}>
                        {handoverStatusLabel(h.status)}
                      </span>
                    </td>
                    <td style={{ padding: 8 }}>{h.pending_tasks || "Sem pendências"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {!loading && !error && activeTab === "ocorrencias" && (
        <section className={styles.legacy} aria-labelledby="occurrence-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16 }}>
          <h2 id="occurrence-title">Livro de Ocorrências (OPS-07)</h2>
          {occurrences.length === 0 ? (
            <UiState variant="empty" title="Nenhuma ocorrência registrada no livro" detail="A leitura foi concluída com sucesso: o livro de ocorrências está vazio no seu escopo." />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <th align="left" style={{ padding: 8 }}>Protocolo</th>
                  <th align="left" style={{ padding: 8 }}>Título</th>
                  <th align="left" style={{ padding: 8 }}>Categoria</th>
                  <th align="left" style={{ padding: 8 }}>Severidade</th>
                  <th align="left" style={{ padding: 8 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {occurrences.map(occ => (
                  <tr key={occ.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 8 }}><code>{occ.protocol}</code></td>
                    <td style={{ padding: 8 }}>{occ.title}</td>
                    <td style={{ padding: 8 }}>{occ.category}</td>
                    <td style={{ padding: 8 }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 4,
                        background: occ.severity === "critica" ? "#fee2e2" : occ.severity === "alta" ? "#ffedd5" : "#f1f5f9",
                        color: occ.severity === "critica" ? "#991b1b" : "#1e293b"
                      }}>
                        {occurrenceSeverityLabel(occ.severity)}
                      </span>
                    </td>
                    <td style={{ padding: 8 }}>{occurrenceStatusLabel(occ.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {!loading && !error && activeTab === "checklists" && (
        <section className={styles.legacy} aria-labelledby="checklist-title" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16 }}>
          <h2 id="checklist-title">Checklists de Posto e Execução (OPS-08)</h2>
          {checklists.length === 0 ? (
            <UiState variant="empty" title="Nenhuma execução de checklist registrada" detail="A leitura foi concluída com sucesso: não há instância de checklist no seu escopo." />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <th align="left" style={{ padding: 8 }}>Data Agendada</th>
                  <th align="left" style={{ padding: 8 }}>Status</th>
                  <th align="left" style={{ padding: 8 }}>Execução</th>
                </tr>
              </thead>
              <tbody>
                {checklists.map(inst => (
                  <tr key={inst.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: 8 }}>{String(inst.scheduled_date).slice(0, 10)}</td>
                    <td style={{ padding: 8 }}>
                      <span style={{ padding: "2px 8px", borderRadius: 4, background: inst.status === "concluido" ? "#dcfce7" : "#fef3c7" }}>
                        {checklistStatusLabel(inst.status)}
                      </span>
                    </td>
                    <td style={{ padding: 8 }}>{inst.executed_at ? String(inst.executed_at).slice(0, 16).replace("T", " ") : "Pendente"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {!loading && !error && (["supervisao", "rondas", "relatorios"] as const).includes(activeTab as any) && (
        <section className={styles.legacy} aria-label="Operação avançada OPS-09 a OPS-12">
          <p style={{ padding: 10, background: "#eff6ff", borderRadius: 6 }}>
            {activeTab === "supervisao" && "Supervisão de postos, inspeções e planos de ação."}
            {activeTab === "rondas" && "Rondas e claviculário — leituras são sintéticas e não comprovam GPS ou presença real."}
            {activeTab === "relatorios" && "Relatórios e livro de serviço: liberação somente após aprovação formal."}
          </p>
          <OpsAdvanced2Client />
        </section>
      )}
      {!loading && !error && (["metricas", "limpeza", "monitoramento"] as const).includes(activeTab as any) && (
        <section className={styles.legacy} aria-label="Operação avançada OPS-13 a OPS-16">
          <p style={{ padding: 10, background: "#fff7ed", borderRadius: 6 }}>
            {activeTab === "metricas" && "Métricas com fonte, fórmula, janela e incompletude explícita; escalas exigem revisão humana."}
            {activeTab === "limpeza" && "Rotinas de limpeza, inspeção de qualidade e não conformidades."}
            {activeTab === "monitoramento" && "Monitoramento Sintético: simulação sem central 24h e sem despacho externo real."}
          </p>
          <OpsAdvanced3Client />
        </section>
      )}
      </div>
    </main>
  );
}
