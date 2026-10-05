"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import OpportunitySummary from "./OpportunitySummary";
import OpportunityTasks from "./OpportunityTasks";
import OpportunityInteractions from "./OpportunityInteractions";
import OpportunityVisits from "./OpportunityVisits";
import OpportunityNotes from "./OpportunityNotes";
import MyAgenda from "./MyAgenda";
import MyDelegatedTasks from "./MyDelegatedTasks";
import CadenceClient from "./CadenceClient";
import ContactManager from "./ContactManager";
import UnitManager from "./UnitManager";
import ImportDedupReview from "./ImportDedupReview";
import AdminGate from "../AdminGate";
import UiWorkspace from "../../../components/ui/UiWorkspace";
import UiPanel from "../../../components/ui/UiPanel";
import UiAsyncState, { type UiAsyncStatus } from "../../../components/ui/UiAsyncState";
import UiBadge, { type UiBadgeTone } from "../../../components/ui/UiBadge";
import { readJsonResult, failureFromCause, type UxFailure } from "../../../lib/ux-feedback.mjs";
import {
  CRM_STAGE_VALUES,
  stageLabel,
  priorityLabel,
  companyTypeLabel,
  companyStatusLabel,
  importRowStatusLabel,
  stageOptions,
  priorityOptions,
  companyTypeOptions,
  outcomeNote,
  formatCurrencyBRL,
  formatDateBR,
  formatDateTimeBR,
} from "../../../lib/crm-labels.mjs";
import ui from "../../../components/ui/UiWorkspace.module.css";
import styles from "./CrmWorkspace.module.css";

type Company = { id: string; display_name: string; type: string; city: string; segment: string | null; status: string; responsible_name: string | null; };
type Unit = { id: string; display_name: string };
type Opportunity = {
  id: string; company_id: string; title: string; stage: string; priority: string;
  service_name: string | null; need_description: string | null; responsible_name: string | null;
  unit_id: string | null; unit_name: string | null; forecast_date: string | null;
  estimated_value: string | null; next_action: string | null; next_action_date: string | null;
  origin: string | null; campaign: string | null; loss_reason: string | null;
  is_won: boolean; is_lost: boolean;
};
type ImportRow = { row_number: number; raw_data: unknown; mapped_data: unknown; status: string; errors: { field?: string; message?: string }[]; dedup_match: { id: string; display_name: string } | null; };

const TASKS = [
  { href: "#crm-cadastros", label: "Cadastrar empresa" },
  { href: "#crm-importacao", label: "Importar empresas" },
  { href: "#crm-oportunidade", label: "Criar oportunidade" },
  { href: "#crm-funil", label: "Consultar funil" },
  { href: "#crm-agenda", label: "Agenda e delegações" },
];

function priorityTone(priority: string): UiBadgeTone {
  if (priority === "critica") return "danger";
  if (priority === "alta") return "warning";
  if (priority === "baixa") return "neutral";
  return "info";
}

function stageTone(opportunity: Opportunity): UiBadgeTone {
  if (opportunity.is_won) return "success";
  if (opportunity.is_lost) return "danger";
  return "info";
}

/** Texto único para cada valor ausente: a tela nunca inventa zero nem “-”. */
function orMissing(value: string | null | undefined, missing = "não informado") {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : missing;
}

function CrmPageContent() {
  const [selectedOpportunity, setSelectedOpportunity] = useState<Opportunity | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesStatus, setCompaniesStatus] = useState<UiAsyncStatus>("idle");
  const [companiesFailure, setCompaniesFailure] = useState<UxFailure | null>(null);
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [oppsTotal, setOppsTotal] = useState(0);
  const [oppsStatus, setOppsStatus] = useState<UiAsyncStatus>("idle");
  const [oppsFailure, setOppsFailure] = useState<UxFailure | null>(null);
  const [filter, setFilter] = useState({ type: "", stage: "" });
  const [oppSearch, setOppSearch] = useState("");
  const [appliedOppSearch, setAppliedOppSearch] = useState("");
  const [oppPriority, setOppPriority] = useState("");
  const [oppView, setOppView] = useState<"kanban" | "tabela">("kanban");
  const [form, setForm] = useState({ displayName: "", city: "", type: "prospect", segment: "" });
  const [companyBusy, setCompanyBusy] = useState(false);
  const [companyNotice, setCompanyNotice] = useState("");
  const [oppForm, setOppForm] = useState({ company_id: "", title: "", service_name: "", need_description: "", priority: "media", forecast_date: "", estimated_value: "", next_action: "", next_action_date: "", origin: "", unit_id: "" });
  const [oppUnits, setOppUnits] = useState<Unit[]>([]);
  const [oppUnitsFailure, setOppUnitsFailure] = useState<UxFailure | null>(null);
  const [oppBusy, setOppBusy] = useState(false);
  const [oppNotice, setOppNotice] = useState("");
  const [oppFormError, setOppFormError] = useState("");
  const [error, setError] = useState("");
  const [convertForm, setConvertForm] = useState({ leadId: "", companyName: "" });
  const [convertBusy, setConvertBusy] = useState(false);
  const [convertError, setConvertError] = useState("");
  const [convertNotice, setConvertNotice] = useState("");
  const [exportError, setExportError] = useState("");
  const [csvContent, setCsvContent] = useState("");
  const [fileName, setFileName] = useState("empresas.csv");
  const [importPreview, setImportPreview] = useState<{ batchId: string; fileName?: string; report: { total: number; valid: number; invalid: number; duplicate: number; mapping: unknown; formula_prevention: string }; rows: ImportRow[]; totalRows: number; previewTruncated: boolean } | null>(null);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; failed: number; batch?: { id: string } } | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const funnelHeadingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    setCompaniesStatus("loading");
    setCompaniesFailure(null);
    try {
      const params = new URLSearchParams();
      if (filter.type) params.set("type", filter.type);
      const res = await fetch(`/api/crm/companies?${params.toString()}`, { cache: "no-store" });
      const result = await readJsonResult<{ companies?: Company[] }>(res);
      if (!result.ok) {
        setCompanies([]);
        setCompaniesFailure(result.failure);
        setCompaniesStatus("failed");
      } else {
        setCompanies(result.data.companies || []);
        setCompaniesStatus("ready");
      }
    } catch (cause) {
      setCompanies([]);
      setCompaniesFailure(failureFromCause(cause));
      setCompaniesStatus("failed");
    }

    // CRM-07: busca e prioridade aplicadas no servidor (com curinga escapado);
    // a listagem é pessoal — cada comercial vê só o próprio funil. UX-03B: a
    // falha deixou de ser silenciosa; lista vazia e erro são estados distintos.
    setOppsStatus("loading");
    setOppsFailure(null);
    try {
      const params = new URLSearchParams();
      if (filter.stage) params.set("stage", filter.stage);
      if (appliedOppSearch) params.set("search", appliedOppSearch);
      if (oppPriority) params.set("priority", oppPriority);
      const res = await fetch(`/api/crm/opportunities?${params.toString()}`, { cache: "no-store" });
      const result = await readJsonResult<{ opportunities?: Opportunity[]; total?: number }>(res);
      if (!result.ok) {
        setOpps([]);
        setOppsTotal(0);
        setOppsFailure(result.failure);
        setOppsStatus("failed");
      } else {
        setOpps(result.data.opportunities || []);
        setOppsTotal(result.data.total || 0);
        setOppsStatus("ready");
      }
    } catch (cause) {
      setOpps([]);
      setOppsTotal(0);
      setOppsFailure(failureFromCause(cause));
      setOppsStatus("failed");
    }
  }, [filter, appliedOppSearch, oppPriority]);

  useEffect(() => { void load(); }, [load]);

  async function loadUnits(companyId: string) {
    setOppUnitsFailure(null);
    if (!companyId) { setOppUnits([]); return; }
    try {
      const res = await fetch(`/api/crm/companies/${companyId}`, { cache: "no-store" });
      const result = await readJsonResult<{ units?: Unit[] }>(res);
      if (!result.ok) { setOppUnits([]); setOppUnitsFailure(result.failure); return; }
      setOppUnits(result.data.units || []);
    } catch (cause) { setOppUnits([]); setOppUnitsFailure(failureFromCause(cause)); }
  }

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    if (companyBusy) return;
    setError("");
    setCompanyNotice("");
    setCompanyBusy(true);
    try {
      const res = await fetch("/api/crm/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: form.displayName, city: form.city, type: form.type, segment: form.segment }),
      });
      const result = await readJsonResult<{ company?: { display_name: string } }>(res);
      if (!result.ok) { setError(result.failure.message); return; }
      setCompanyNotice(`Empresa “${result.data.company?.display_name || form.displayName}” cadastrada.`);
      setForm({ displayName: "", city: "", type: "prospect", segment: "" });
      await load();
    } catch (cause) { setError(failureFromCause(cause).message); }
    finally { setCompanyBusy(false); }
  }

  async function createOpportunity(e: React.FormEvent) {
    e.preventDefault();
    if (oppBusy) return;
    setOppFormError("");
    setOppNotice("");
    setOppBusy(true);
    try {
      const res = await fetch("/api/crm/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: oppForm.company_id,
          title: oppForm.title,
          service_name: oppForm.service_name || null,
          need_description: oppForm.need_description || null,
          priority: oppForm.priority,
          forecast_date: oppForm.forecast_date || null,
          estimated_value: oppForm.estimated_value === "" ? null : Number(oppForm.estimated_value),
          next_action: oppForm.next_action || null,
          next_action_date: oppForm.next_action_date ? new Date(oppForm.next_action_date).toISOString() : null,
          origin: oppForm.origin || null,
          unit_id: oppForm.unit_id || null,
        }),
      });
      const result = await readJsonResult<{ opportunity?: { title: string } }>(res);
      if (!result.ok) { setOppFormError(result.failure.message); return; }
      setOppNotice(`Oportunidade “${result.data.opportunity?.title || oppForm.title}” criada. Você é a pessoa responsável.`);
      setOppForm({ company_id: "", title: "", service_name: "", need_description: "", priority: "media", forecast_date: "", estimated_value: "", next_action: "", next_action_date: "", origin: "", unit_id: "" });
      setOppUnits([]);
      await load();
    } catch (cause) { setOppFormError(failureFromCause(cause).message); }
    finally { setOppBusy(false); }
  }

  // CRM-04: conversão preserva o histórico do lead. UX-03B trocou os diálogos
  // nativos (prompt/alert) por um formulário com rótulos, erro associado e
  // resultado anunciado — o payload enviado continua idêntico.
  async function convertLead(e: React.FormEvent) {
    e.preventDefault();
    if (convertBusy) return;
    setConvertError("");
    setConvertNotice("");
    setConvertBusy(true);
    try {
      const res = await fetch(`/api/crm/leads/${convertForm.leadId.trim()}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ create_company: true, company_name: convertForm.companyName.trim() || undefined }),
      });
      const result = await readJsonResult<{ opportunityId: string; dedup?: boolean }>(res);
      if (!result.ok) { setConvertError(result.failure.message); return; }
      setConvertNotice(result.data.dedup
        ? "O lead já havia sido convertido: nada foi duplicado e a oportunidade existente foi reaproveitada."
        : "Lead convertido em oportunidade, com o histórico preservado.");
      setConvertForm({ leadId: "", companyName: "" });
      await load();
    } catch (cause) { setConvertError(failureFromCause(cause).message); }
    finally { setConvertBusy(false); }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setCsvContent(text);
  }

  async function previewImport() {
    if (!csvContent.trim()) { setImportError("Escolha um arquivo ou cole o conteúdo do CSV antes de pedir a prévia."); return; }
    setImportLoading(true);
    setImportError("");
    setImportResult(null);
    try {
      const res = await fetch("/api/crm/imports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, csvContent, type: "companies" }),
      });
      const result = await readJsonResult<NonNullable<typeof importPreview>>(res);
      if (!result.ok) { setImportError(result.failure.message); return; }
      setImportPreview(result.data);
    } catch (cause) { setImportError(failureFromCause(cause).message); }
    finally { setImportLoading(false); }
  }

  async function commitImport() {
    if (!importPreview) return;
    setImportLoading(true);
    setImportError("");
    try {
      const res = await fetch(`/api/crm/imports/${importPreview.batchId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await readJsonResult<NonNullable<typeof importResult>>(res);
      if (!result.ok) { setImportError(result.failure.message); return; }
      setImportResult(result.data);
      await load();
    } catch (cause) { setImportError(failureFromCause(cause).message); }
    finally { setImportLoading(false); }
  }

  async function exportCompanies() {
    setExportError("");
    try {
      const res = await fetch("/api/crm/companies/export", { cache: "no-store" });
      if (!res.ok) {
        const result = await readJsonResult(res);
        setExportError(result.ok ? "Não foi possível exportar." : result.failure.message);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `empresas-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (cause) { setExportError(failureFromCause(cause).message); }
  }

  function openOpportunity(opportunity: Opportunity) {
    setSelectedOpportunity(opportunity);
    // Foco previsível: quem abriu pelo teclado chega ao título do detalhe.
    window.setTimeout(() => detailHeadingRef.current?.focus(), 30);
  }

  function closeOpportunity() {
    setSelectedOpportunity(null);
    window.setTimeout(() => funnelHeadingRef.current?.focus(), 30);
  }

  const duplicates = importPreview?.report.duplicate ?? 0;
  const importStep = importResult ? 4 : importPreview ? 3 : csvContent.trim() ? 2 : 1;
  const stepState = (step: number) => (importStep > step ? "concluida" : importStep === step ? "atual" : "pendente");
  const stepStateLabel = (step: number) => (importStep > step ? "Concluída" : importStep === step ? "Etapa atual" : "Aguardando a etapa anterior");

  return (
    <UiWorkspace
      title="Empresas e oportunidades"
      intro="Cadastre empresas, acompanhe suas oportunidades e organize os próximos contatos. Cada pessoa da equipe comercial acessa o próprio funil; o servidor confirma a permissão em todas as consultas e ações."
      tasks={TASKS}
      tasksLabel="Tarefas do CRM"
    >
      <UiPanel
        id="crm-cadastros"
        eyebrow="Passo 1 — base de empresas"
        title="Nova empresa"
        description="O nome é o único campo obrigatório. Cidade, segmento e tipo ajudam a localizar a empresa depois."
        actions={
          <button type="button" className={ui.secondary} onClick={() => void exportCompanies()}>
            Exportar CSV
          </button>
        }
      >
        <form onSubmit={createCompany} aria-label="Cadastro de empresa">
          <div className={ui.formGrid}>
            <div className={ui.field}>
              <label htmlFor="crm-company-name">Nome da empresa</label>
              <span className={ui.required} aria-hidden="true">Campo obrigatório</span>
              <input id="crm-company-name" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} required aria-required="true" maxLength={200} autoComplete="organization" />
            </div>
            <div className={ui.field}>
              <label htmlFor="crm-company-city">Cidade</label>
              <input id="crm-company-city" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} maxLength={100} autoComplete="address-level2" />
            </div>
            <div className={ui.field}>
              <label htmlFor="crm-company-segment">Segmento</label>
              <p className={ui.fieldHint} id="crm-company-segment-hint">Exemplo: condomínio, indústria, varejo.</p>
              <input id="crm-company-segment" aria-describedby="crm-company-segment-hint" value={form.segment} onChange={e => setForm({ ...form, segment: e.target.value })} maxLength={100} />
            </div>
            <div className={ui.field}>
              <label htmlFor="crm-company-type">Tipo da empresa</label>
              <select id="crm-company-type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {companyTypeOptions().map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          </div>
          <div className={ui.formActions}>
            <button type="submit" className={ui.primary} disabled={companyBusy}>
              {companyBusy ? "Cadastrando…" : "Cadastrar empresa"}
            </button>
          </div>
          <p className={ui.formStatus} role="status" aria-live="polite">
            {companyNotice ? <span className={ui.formStatusOk}>{companyNotice}</span> : null}
          </p>
          {error ? <p className={ui.fieldError} role="alert">{error}</p> : null}
          {exportError ? <p className={ui.fieldError} role="alert">{exportError}</p> : null}
        </form>

        <details>
          <summary>Converter um pedido do site em oportunidade</summary>
          <form onSubmit={convertLead} aria-label="Conversão de lead" style={{ marginTop: "var(--ux-space-3)" }}>
            <p className={ui.fieldHint}>
              A conversão preserva o histórico do pedido e não duplica registros: se o lead já tiver sido convertido,
              o sistema reaproveita a oportunidade existente e avisa.
            </p>
            <div className={ui.formGrid}>
              <div className={ui.field}>
                <label htmlFor="crm-convert-lead">Identificador do pedido do site</label>
                <span className={ui.required} aria-hidden="true">Campo obrigatório</span>
                <p className={ui.fieldHint} id="crm-convert-lead-hint">Código UUID mostrado na tela Pedidos do site.</p>
                <input id="crm-convert-lead" aria-describedby="crm-convert-lead-hint" value={convertForm.leadId} onChange={e => setConvertForm({ ...convertForm, leadId: e.target.value })} required aria-required="true" maxLength={64} />
              </div>
              <div className={ui.field}>
                <label htmlFor="crm-convert-company">Nome da empresa a criar ou vincular</label>
                <p className={ui.fieldHint} id="crm-convert-company-hint">Deixe em branco para usar o nome informado no pedido.</p>
                <input id="crm-convert-company" aria-describedby="crm-convert-company-hint" value={convertForm.companyName} onChange={e => setConvertForm({ ...convertForm, companyName: e.target.value })} maxLength={200} />
              </div>
            </div>
            <div className={ui.formActions}>
              <button type="submit" className={ui.secondary} disabled={convertBusy}>
                {convertBusy ? "Convertendo…" : "Converter lead"}
              </button>
            </div>
            <p className={ui.formStatus} role="status" aria-live="polite">
              {convertNotice ? <span className={ui.formStatusOk}>{convertNotice}</span> : null}
            </p>
            {convertError ? <p className={ui.fieldError} role="alert">{convertError}</p> : null}
          </form>
        </details>
      </UiPanel>

      <UiPanel
        id="crm-importacao"
        eyebrow="Entrada em lote"
        title="Importar empresas por CSV"
        description="Quatro etapas: escolher o conteúdo, revisar a prévia, decidir cada duplicata e confirmar. Nada é gravado antes da sua confirmação explícita. Limite de 5.000 linhas e 800 KB."
      >
        <ol className={styles.importSteps}>
          <li className={styles.importStep} data-state={stepState(1)}>
            <h3 className={styles.importStepTitle}>
              1. Escolher o arquivo ou colar o conteúdo
              <span className={styles.importStepState}>{stepStateLabel(1)}</span>
            </h3>
            <div className={styles.importControls}>
              <div className={ui.field}>
                <label htmlFor="crm-csv-file">Arquivo CSV de empresas</label>
                <input id="crm-csv-file" type="file" accept=".csv,text/csv" onChange={handleFileChange} />
              </div>
              <div className={ui.field}>
                <label htmlFor="crm-csv-name">Nome do arquivo no relatório</label>
                <input id="crm-csv-name" value={fileName} onChange={e => setFileName(e.target.value)} maxLength={200} />
              </div>
            </div>
            <div className={ui.field} style={{ marginTop: "var(--ux-space-3)" }}>
              <label htmlFor="crm-csv-content">Ou cole o CSV (a primeira linha são os cabeçalhos)</label>
              <textarea
                id="crm-csv-content"
                value={csvContent}
                onChange={e => setCsvContent(e.target.value)}
                className={styles.mono}
                placeholder={"display_name,document_ref,city,segment,type\nEmpresa A,123,Barueri,Segurança,prospect\nEmpresa B,456,Osasco,Condomínio,client"}
              />
            </div>
            <details>
              <summary>Colunas e formato aceitos</summary>
              <p>
                Nome/display_name, CNPJ/document_ref, Segmento/segment, Cidade/city, Estado/state, Tipo/type
                (prospect/client/partner), Email/email, Telefone/phone, Origem/origin, Campanha/campaign,
                Responsável/responsible_name e Observação/notes. A prévia mostra o mapeamento aplicado e a revisão das
                duplicações.
              </p>
            </details>
          </li>

          <li className={styles.importStep} data-state={stepState(2)}>
            <h3 className={styles.importStepTitle}>
              2. Revisar a prévia
              <span className={styles.importStepState}>{stepStateLabel(2)}</span>
            </h3>
            <p className={ui.fieldHint}>A prévia roda no servidor, valida linha a linha e aponta duplicatas. Nenhuma empresa é criada nesta etapa.</p>
            <div className={ui.formActions}>
              <button type="button" className={ui.primary} onClick={() => void previewImport()} disabled={importLoading}>
                {importLoading ? "Processando…" : "Revisar prévia"}
              </button>
            </div>
            {importError ? <p className={ui.fieldError} role="alert">{importError}</p> : null}
            {importPreview ? (
              <>
                <h4>Relatório da prévia — {importPreview.fileName || fileName}</h4>
                <ul className={styles.importSummary}>
                  <li><strong className={ui.numeric}>{importPreview.report.total}</strong> linhas lidas</li>
                  <li><strong className={ui.numeric}>{importPreview.report.valid}</strong> prontas para importar</li>
                  <li><strong className={ui.numeric}>{importPreview.report.invalid}</strong> com erro</li>
                  <li><strong className={ui.numeric}>{importPreview.report.duplicate}</strong> possíveis duplicatas</li>
                </ul>
                <p className={ui.fieldHint}>
                  Lote {importPreview.batchId.slice(0, 8)} · prevenção de fórmula: {importPreview.report.formula_prevention} ·
                  mapeamento aplicado: <span className={styles.mono}>{JSON.stringify(importPreview.report.mapping)}</span>
                </p>
                <div className={ui.tableFrame}>
                  <table>
                    <caption>Linhas da prévia, com erro e possível duplicata declarados.</caption>
                    <thead>
                      <tr><th scope="col">Linha</th><th scope="col">Situação</th><th scope="col">Dados mapeados</th><th scope="col">Erros</th><th scope="col">Possível duplicata</th></tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.map(row => (
                        <tr
                          key={row.row_number}
                          className={row.status === "valid" ? styles.rowValid : row.status === "duplicate" ? styles.rowDuplicate : styles.rowInvalid}
                        >
                          <th scope="row" className={ui.numeric}>{row.row_number}</th>
                          <td>{importRowStatusLabel(row.status)}</td>
                          <td><span className={styles.mono}>{JSON.stringify(row.mapped_data)}</span></td>
                          <td>{row.errors.map(item => `${item.field}: ${item.message}`).join("; ") || "nenhum"}</td>
                          <td>{row.dedup_match ? `${row.dedup_match.display_name} (${row.dedup_match.id.slice(0, 8)})` : "nenhuma"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importPreview.previewTruncated ? (
                  <p className={ui.fieldHint}>Prévia truncada em 100 linhas; o lote tem {importPreview.totalRows} linhas e todas serão avaliadas na confirmação.</p>
                ) : null}
              </>
            ) : null}
          </li>

          <li className={styles.importStep} data-state={stepState(3)}>
            <h3 className={styles.importStepTitle}>
              3. Decidir cada possível duplicata
              <span className={styles.importStepState}>{stepStateLabel(3)}</span>
            </h3>
            {!importPreview ? (
              <p className={ui.fieldHint}>Disponível depois da prévia.</p>
            ) : duplicates === 0 ? (
              <p className={ui.fieldHint}>Esta prévia não encontrou duplicatas. Ainda assim, a confirmação continua sendo manual na etapa 4.</p>
            ) : (
              <p className={ui.fieldHint}>
                {duplicates} linha(s) parecem já existir. A confirmação fica bloqueada até você decidir cada uma; o
                sistema não escolhe por você e não esconde nenhuma duplicata.
              </p>
            )}
            {importPreview ? (
              <ImportDedupReview batchId={importPreview.batchId} onCommitted={() => { void load(); }} />
            ) : null}
          </li>

          <li className={styles.importStep} data-state={stepState(4)}>
            <h3 className={styles.importStepTitle}>
              4. Confirmar e ler o relatório
              <span className={styles.importStepState}>{stepStateLabel(4)}</span>
            </h3>
            {importPreview && duplicates === 0 ? (
              <div className={ui.formActions}>
                <button type="button" className={ui.primary} onClick={() => void commitImport()} disabled={importLoading}>
                  Confirmar importação de {importPreview.report.valid} empresa(s)
                </button>
              </div>
            ) : null}
            {importPreview && duplicates > 0 ? (
              <p className={ui.fieldHint}>Use o botão “Confirmar importação revisada” da etapa 3 depois de decidir todas as duplicatas.</p>
            ) : null}
            {!importPreview ? <p className={ui.fieldHint}>Disponível depois da prévia.</p> : null}
            <p className={ui.formStatus} role="status" aria-live="polite">
              {importResult ? (
                <span className={ui.formStatusOk}>
                  Importação concluída: {importResult.created} criada(s), {importResult.skipped} ignorada(s), {importResult.failed} com falha
                  {importResult.batch ? ` — lote ${importResult.batch.id.slice(0, 8)}` : ""}.
                </span>
              ) : null}
            </p>
          </li>
        </ol>
      </UiPanel>

      <UiPanel
        id="crm-oportunidade"
        eyebrow="Passo 2 — funil"
        title="Nova oportunidade"
        description="Você fica como pessoa responsável. Escolha a empresa, descreva a necessidade e defina o próximo contato. Origem e responsável ficam preservados no histórico; registrar perda exige motivo."
      >
        <form onSubmit={createOpportunity} aria-label="Cadastro de oportunidade">
          <fieldset className={ui.fieldset}>
            <legend>Quem e o quê</legend>
            <div className={ui.formGrid}>
              <div className={ui.field}>
                <label htmlFor="opp-form-company">Empresa</label>
                <span className={ui.required} aria-hidden="true">Campo obrigatório</span>
                <select
                  id="opp-form-company"
                  value={oppForm.company_id}
                  onChange={e => { setOppForm({ ...oppForm, company_id: e.target.value, unit_id: "" }); void loadUnits(e.target.value); }}
                  required
                  aria-required="true"
                >
                  <option value="">Escolher empresa</option>
                  {companies.map(company => <option key={company.id} value={company.id}>{company.display_name}</option>)}
                </select>
                {companiesStatus === "failed" ? (
                  <p className={ui.fieldError}>A lista de empresas não carregou, então ela está vazia por falha e não por ausência de cadastro.</p>
                ) : null}
              </div>
              <div className={ui.field}>
                <label htmlFor="opp-form-title">Título</label>
                <span className={ui.required} aria-hidden="true">Campo obrigatório</span>
                <input id="opp-form-title" value={oppForm.title} onChange={e => setOppForm({ ...oppForm, title: e.target.value })} required aria-required="true" maxLength={200} />
              </div>
              <div className={ui.field}>
                <label htmlFor="opp-form-service">Serviço</label>
                <input id="opp-form-service" value={oppForm.service_name} onChange={e => setOppForm({ ...oppForm, service_name: e.target.value })} maxLength={100} />
              </div>
              <div className={ui.field}>
                <label htmlFor="opp-form-need">Necessidade</label>
                <input id="opp-form-need" value={oppForm.need_description} onChange={e => setOppForm({ ...oppForm, need_description: e.target.value })} maxLength={2000} />
              </div>
              <div className={ui.field}>
                <label htmlFor="opp-form-unit">Unidade</label>
                <select id="opp-form-unit" value={oppForm.unit_id} onChange={e => setOppForm({ ...oppForm, unit_id: e.target.value })} disabled={!oppForm.company_id}>
                  <option value="">Sem unidade específica</option>
                  {oppUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.display_name}</option>)}
                </select>
                {oppUnitsFailure ? <p className={ui.fieldError}>{oppUnitsFailure.message}</p> : null}
              </div>
            </div>
          </fieldset>

          <fieldset className={ui.fieldset}>
            <legend>Prazo, valor e próximo contato</legend>
            <div className={ui.formGrid}>
              <div className={ui.field}>
                <label htmlFor="opp-form-priority">Prioridade</label>
                <select id="opp-form-priority" value={oppForm.priority} onChange={e => setOppForm({ ...oppForm, priority: e.target.value })}>
                  {priorityOptions().map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className={ui.field}>
                <label htmlFor="opp-form-forecast">Previsão (fechamento)</label>
                <input id="opp-form-forecast" type="date" value={oppForm.forecast_date} onChange={e => setOppForm({ ...oppForm, forecast_date: e.target.value })} />
              </div>
              <div className={ui.field}>
                <label htmlFor="opp-form-value">Valor estimado</label>
                <p className={ui.fieldHint} id="opp-form-value-hint">Em reais. Valor estimado não representa receita confirmada.</p>
                <input id="opp-form-value" aria-describedby="opp-form-value-hint" type="number" min={0} step="0.01" value={oppForm.estimated_value} onChange={e => setOppForm({ ...oppForm, estimated_value: e.target.value })} />
              </div>
              <div className={ui.field}>
                <label htmlFor="opp-form-next">Próxima ação</label>
                <input id="opp-form-next" value={oppForm.next_action} onChange={e => setOppForm({ ...oppForm, next_action: e.target.value })} maxLength={200} />
              </div>
              <div className={ui.field}>
                <label htmlFor="opp-form-next-date">Data da próxima ação</label>
                <input id="opp-form-next-date" type="datetime-local" value={oppForm.next_action_date} onChange={e => setOppForm({ ...oppForm, next_action_date: e.target.value })} />
              </div>
              <div className={ui.field}>
                <label htmlFor="opp-form-origin">Origem</label>
                <p className={ui.fieldHint} id="opp-form-origin-hint">Fica imutável depois de criada a oportunidade.</p>
                <input id="opp-form-origin" aria-describedby="opp-form-origin-hint" value={oppForm.origin} onChange={e => setOppForm({ ...oppForm, origin: e.target.value })} maxLength={100} />
              </div>
            </div>
          </fieldset>

          <div className={ui.formActions}>
            <button type="submit" className={ui.primary} disabled={oppBusy}>
              {oppBusy ? "Criando…" : "Criar oportunidade"}
            </button>
          </div>
          <p className={ui.formStatus} role="status" aria-live="polite">
            {oppNotice ? <span className={ui.formStatusOk}>{oppNotice}</span> : null}
          </p>
          {oppFormError ? <p className={ui.fieldError} role="alert">{oppFormError}</p> : null}
        </form>
      </UiPanel>

      <UiPanel
        id="crm-filtros"
        eyebrow="Consulta"
        title="Filtrar empresas e oportunidades"
        description="Os filtros são aplicados pelo servidor. As etapas e prioridades aparecem em português, mas os valores enviados à API continuam sendo os códigos internos."
      >
        <form
          className={ui.filterBar}
          aria-label="Filtros de empresas e oportunidades"
          onSubmit={e => { e.preventDefault(); setAppliedOppSearch(oppSearch.trim()); }}
        >
          <div className={ui.field}>
            <label htmlFor="crm-filter-type">Tipo de empresa</label>
            <select id="crm-filter-type" value={filter.type} onChange={e => setFilter({ ...filter, type: e.target.value })}>
              <option value="">Todos os tipos</option>
              {companyTypeOptions().map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className={ui.field}>
            <label htmlFor="crm-filter-stage">Etapa do funil</label>
            <select id="crm-filter-stage" value={filter.stage} onChange={e => setFilter({ ...filter, stage: e.target.value })}>
              <option value="">Todas as etapas</option>
              {stageOptions().map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className={ui.field}>
            <label htmlFor="crm-filter-priority">Filtrar por prioridade</label>
            <select id="crm-filter-priority" value={oppPriority} onChange={e => setOppPriority(e.target.value)}>
              <option value="">Todas as prioridades</option>
              {priorityOptions().map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className={ui.field}>
            <label htmlFor="crm-filter-search">Buscar oportunidade (título/necessidade)</label>
            <input id="crm-filter-search" value={oppSearch} onChange={e => setOppSearch(e.target.value)} maxLength={200} />
          </div>
          <div className={ui.formActions} style={{ marginTop: 0 }}>
            <button type="submit" className={ui.primary}>Filtrar oportunidades</button>
            <button type="button" className={ui.secondary} onClick={() => void load()}>Atualizar listas</button>
          </div>
        </form>
      </UiPanel>

      <section id="crm-funil" aria-labelledby="crm-funil-titulo" className={styles.results}>
        <h2 id="crm-funil-titulo" className={ui.visuallyHidden}>Resultados: empresas e funil</h2>
        <div>
          <UiPanel
            title={`Empresas${companiesStatus === "ready" ? ` (${companies.length})` : ""}`}
            eyebrow="Carteira de cadastros"
            level={2}
            description="Lista filtrada pelo tipo escolhido acima."
          >
            <UiAsyncState
              status={companiesStatus}
              failure={companiesFailure}
              label="empresas"
              isEmpty={companies.length === 0}
              emptyTitle="Nenhuma empresa neste filtro"
              emptyMessage="O servidor respondeu sem registros para este tipo. Cadastre uma empresa ou limpe o filtro."
              onRetry={() => void load()}
            >
              <div className={ui.tableFrame}>
                <table>
                  <caption>{companies.length} empresa(s) listada(s). Em telas estreitas, a tabela rola na horizontal dentro desta moldura.</caption>
                  <thead>
                    <tr><th scope="col">Nome</th><th scope="col">Tipo</th><th scope="col">Cidade</th><th scope="col">Segmento</th><th scope="col">Situação</th></tr>
                  </thead>
                  <tbody>
                    {companies.map(company => (
                      <tr key={company.id}>
                        <th scope="row">{company.display_name}</th>
                        <td>{companyTypeLabel(company.type)}</td>
                        <td>{orMissing(company.city, "não informada")}</td>
                        <td>{orMissing(company.segment)}</td>
                        <td>{companyStatusLabel(company.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </UiAsyncState>
          </UiPanel>
        </div>

        <div>
          <UiPanel
            title="Oportunidades"
            eyebrow="Funil pessoal"
            level={2}
            headingId="crm-oportunidades-titulo"
            description={
              oppsStatus === "ready"
                ? `Mostrando ${opps.length} de ${oppsTotal} oportunidade(s) sob sua responsabilidade. Busca e prioridade são aplicadas no servidor.`
                : "Só aparecem as oportunidades sob sua responsabilidade. Busca e prioridade são aplicadas no servidor."
            }
            actions={
              <div className={styles.viewSwitch}>
                <button
                  type="button"
                  className={ui.secondary}
                  onClick={() => setOppView(view => (view === "kanban" ? "tabela" : "kanban"))}
                  aria-pressed={oppView === "tabela"}
                >
                  {oppView === "kanban" ? "Ver em tabela" : "Ver em kanban"}
                </button>
              </div>
            }
          >
            <h3 ref={funnelHeadingRef} tabIndex={-1} className={ui.visuallyHidden}>Resultado do funil</h3>
            <UiAsyncState
              status={oppsStatus}
              failure={oppsFailure}
              label="oportunidades"
              isEmpty={opps.length === 0}
              emptyTitle="Nenhuma oportunidade neste filtro"
              emptyMessage="A consulta foi respondida e não encontrou oportunidades suas com estes filtros. Isso não indica falha nem falta de permissão."
              onRetry={() => void load()}
            >
              {oppView === "kanban" ? (
                <div className={styles.kanban}>
                  {CRM_STAGE_VALUES.map(stage => {
                    const stageOpps = opps.filter(opportunity => opportunity.stage === stage);
                    return (
                      <div key={stage} className={styles.column}>
                        <h4 className={styles.columnTitle}>
                          {stageLabel(stage)}
                          <span aria-label={`${stageOpps.length} oportunidade(s)`}>{stageOpps.length}</span>
                        </h4>
                        {stageOpps.map(opportunity => (
                          <article
                            key={opportunity.id}
                            className={styles.oppCard}
                            aria-label={`Oportunidade ${opportunity.title}`}
                            data-outcome={opportunity.is_won ? "ganho" : opportunity.is_lost ? "perdido" : "aberta"}
                            data-selected={selectedOpportunity?.id === opportunity.id ? "true" : "false"}
                          >
                            <h5 className={styles.oppTitle}>{opportunity.title}</h5>
                            <p className={styles.badges}>
                              <UiBadge tone={stageTone(opportunity)} srPrefix="Etapa">{stageLabel(opportunity.stage)}</UiBadge>
                              <UiBadge tone={priorityTone(opportunity.priority)} srPrefix="Prioridade">{priorityLabel(opportunity.priority)}</UiBadge>
                            </p>
                            <dl className={styles.facts}>
                              <div className={styles.fact}><dt>Serviço</dt><dd data-field="service_name">{orMissing(opportunity.service_name)}</dd></div>
                              <div className={styles.fact}><dt>Valor estimado</dt><dd data-field="estimated_value" className={ui.numeric}>{formatCurrencyBRL(opportunity.estimated_value)}</dd></div>
                              <div className={styles.fact}><dt>Responsável</dt><dd data-field="responsible_name">{orMissing(opportunity.responsible_name, "não atribuído")}</dd></div>
                              <div className={styles.fact}><dt>Unidade</dt><dd data-field="unit_name">{orMissing(opportunity.unit_name, "não informada")}</dd></div>
                              <div className={styles.fact}><dt>Previsão</dt><dd data-field="forecast_date">{formatDateBR(opportunity.forecast_date)}</dd></div>
                              <div className={styles.fact}><dt>Próxima ação</dt><dd data-field="next_action">{orMissing(opportunity.next_action, "não definida")}{opportunity.next_action_date ? ` — ${formatDateTimeBR(opportunity.next_action_date)}` : ""}</dd></div>
                              <div className={styles.fact}><dt>Origem</dt><dd data-field="origin">{orMissing(opportunity.origin, "não informada")}</dd></div>
                              {opportunity.is_lost ? (
                                <div className={styles.fact}><dt>Motivo da perda</dt><dd data-field="loss_reason">{orMissing(opportunity.loss_reason)}</dd></div>
                              ) : null}
                            </dl>
                            {outcomeNote(opportunity) ? <p className={styles.outcome}>{outcomeNote(opportunity)}</p> : null}
                            <button type="button" className={ui.secondary} onClick={() => openOpportunity(opportunity)}>
                              Abrir tarefas
                            </button>
                          </article>
                        ))}
                        {stageOpps.length === 0 ? <p className={styles.columnEmpty}>Sem oportunidades nesta etapa.</p> : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={ui.tableFrame}>
                  <table>
                    <caption>{opps.length} oportunidade(s) listada(s). As colunas críticas continuam visíveis com rolagem horizontal nesta moldura.</caption>
                    <thead>
                      <tr>
                        <th scope="col">Título</th><th scope="col">Etapa</th><th scope="col">Serviço</th><th scope="col">Responsável</th>
                        <th scope="col">Unidade</th><th scope="col">Previsão</th><th scope="col">Prioridade</th><th scope="col">Valor estimado</th>
                        <th scope="col">Próxima ação</th><th scope="col">Origem</th><th scope="col">Motivo da perda</th><th scope="col">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {opps.map(opportunity => (
                        <tr key={opportunity.id} data-outcome={opportunity.is_won ? "ganho" : opportunity.is_lost ? "perdido" : "aberta"}>
                          <th scope="row">{opportunity.title}</th>
                          <td data-field="stage">{stageLabel(opportunity.stage)}</td>
                          <td data-field="service_name">{orMissing(opportunity.service_name)}</td>
                          <td data-field="responsible_name">{orMissing(opportunity.responsible_name, "não atribuído")}</td>
                          <td data-field="unit_name">{orMissing(opportunity.unit_name, "não informada")}</td>
                          <td data-field="forecast_date">{formatDateBR(opportunity.forecast_date)}</td>
                          <td data-field="priority">{priorityLabel(opportunity.priority)}</td>
                          <td data-field="estimated_value" className={ui.numeric}>{formatCurrencyBRL(opportunity.estimated_value)}</td>
                          <td data-field="next_action">{orMissing(opportunity.next_action, "não definida")}{opportunity.next_action_date ? ` — ${formatDateTimeBR(opportunity.next_action_date)}` : ""}</td>
                          <td data-field="origin">{orMissing(opportunity.origin, "não informada")}</td>
                          <td data-field="loss_reason">{opportunity.is_lost ? orMissing(opportunity.loss_reason) : "não se aplica"}</td>
                          <td>
                            <button type="button" className={ui.secondary} onClick={() => openOpportunity(opportunity)}>
                              Abrir tarefas
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </UiAsyncState>
            <p className={ui.fieldHint}>
              Use “Abrir tarefas” para ver o resumo, registrar contatos, organizar visitas e acompanhar a oportunidade.
              Cadências criam tarefas manuais e não enviam mensagens automaticamente.
            </p>
          </UiPanel>
        </div>
      </section>

      {selectedOpportunity ? (
        <section id="crm-detalhe" aria-labelledby="crm-detalhe-titulo" className={`${styles.detail}`} data-crm-detail={selectedOpportunity.id}>
          <UiPanel
            title={`Oportunidade aberta: ${selectedOpportunity.title}`}
            eyebrow="Detalhe e ações"
            headingId="crm-detalhe-titulo"
            description="Tudo abaixo pertence a esta oportunidade. Feche o detalhe para voltar ao funil; as permissões continuam sendo verificadas em cada ação."
            actions={
              <>
                <button type="button" className={ui.secondary} onClick={closeOpportunity}>Fechar detalhe</button>
                <a className={ui.secondary} href="#crm-funil" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Voltar ao funil</a>
              </>
            }
          >
            <h3 ref={detailHeadingRef} tabIndex={-1} className={ui.visuallyHidden}>
              Detalhe da oportunidade {selectedOpportunity.title}
            </h3>
            <div className={styles.detailParts}>
              <OpportunitySummary key={"summary-" + selectedOpportunity.id} opportunityId={selectedOpportunity.id} />
              <OpportunityNotes key={"notes-" + selectedOpportunity.id} opportunityId={selectedOpportunity.id} />
              <OpportunityTasks key={selectedOpportunity.id} opportunityId={selectedOpportunity.id} />
              <OpportunityInteractions key={"interactions-" + selectedOpportunity.id} opportunityId={selectedOpportunity.id} />
              <OpportunityVisits key={"visits-" + selectedOpportunity.id} opportunityId={selectedOpportunity.id} />
              <CadenceClient key={"cadence-" + selectedOpportunity.id} opportunityId={selectedOpportunity.id} />
            </div>
          </UiPanel>
        </section>
      ) : null}

      <UnitManager companies={companies} />
      <ContactManager companies={companies} />

      <section id="crm-agenda" aria-label="Agenda e delegações">
        <MyDelegatedTasks />
        <MyAgenda />
      </section>
    </UiWorkspace>
  );
}

// F01: sessão central obrigatória — anônimo vai ao login e retorna ao CRM.
// Papéis espelham o comercial; as permissões finas (delegação, escopo por
// responsável) seguem decididas em cada /api/crm/* no servidor.
export default function CrmPage() {
  return (
    <AdminGate allowedRoles={["comercial", "marcelo", "admin", "ti"]}>
      <CrmPageContent />
    </AdminGate>
  );
}
