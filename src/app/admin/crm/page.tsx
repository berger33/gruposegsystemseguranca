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
import UiState from "../../../components/ui/UiState";
import { crmRequest, type CrmErrorDescriptor } from "../../../lib/crm-request";
import {
  COMPANY_TYPES,
  OPPORTUNITY_PRIORITIES,
  OPPORTUNITY_STAGES,
  companyStatusLabel,
  companyTypeLabel,
  priorityLabel,
  stageHint,
  stageLabel,
} from "../../../lib/crm-vocabulary.mjs";
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
type ImportRow = { row_number: number; raw_data: any; mapped_data: any; status: string; errors: any[]; dedup_match: any; };

type ReadState = "loading" | "ready" | "failed";

// UX-03B: as abas do registro aberto. Uma tarefa por vez, em vez de empilhar
// seis painéis sob a lista. Os componentes e as APIs são os mesmos.
const DETAIL_TABS = [
  { id: "resumo", label: "Resumo e funil" },
  { id: "notas", label: "Notas internas" },
  { id: "tarefas", label: "Tarefas" },
  { id: "interacoes", label: "Interações" },
  { id: "visitas", label: "Visitas" },
  { id: "cadencia", label: "Cadência" },
] as const;
type DetailTab = (typeof DETAIL_TABS)[number]["id"];

function formatDate(value: string | null) {
  if (!value) return "—";
  return String(value).slice(0, 10).split("-").reverse().join("/");
}

function formatDateTime(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleString("pt-BR");
}

function formatMoney(value: string | null) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return String(value);
  return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function CrmPageContent() {
  const [selectedOpportunity, setSelectedOpportunity] = useState<string | null>(null);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [detailTab, setDetailTab] = useState<DetailTab>("resumo");

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesState, setCompaniesState] = useState<ReadState>("loading");
  const [companiesError, setCompaniesError] = useState<CrmErrorDescriptor | null>(null);

  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [oppsTotal, setOppsTotal] = useState(0);
  const [oppsState, setOppsState] = useState<ReadState>("loading");
  const [oppsError, setOppsError] = useState<CrmErrorDescriptor | null>(null);

  const [filter, setFilter] = useState({ type: "", stage: "" });
  const [oppSearch, setOppSearch] = useState("");
  const [appliedOppSearch, setAppliedOppSearch] = useState("");
  const [oppPriority, setOppPriority] = useState("");
  const [oppView, setOppView] = useState<"kanban" | "tabela">("kanban");

  const [form, setForm] = useState({ displayName: "", city: "", type: "prospect", segment: "" });
  const [companySubmitting, setCompanySubmitting] = useState(false);
  const [companyNotice, setCompanyNotice] = useState("");
  const [oppForm, setOppForm] = useState({ company_id: "", title: "", service_name: "", need_description: "", priority: "media", forecast_date: "", estimated_value: "", next_action: "", next_action_date: "", origin: "", unit_id: "" });
  const [oppUnits, setOppUnits] = useState<Unit[]>([]);
  const [oppUnitsError, setOppUnitsError] = useState<CrmErrorDescriptor | null>(null);
  const [oppSubmitting, setOppSubmitting] = useState(false);
  const [oppNotice, setOppNotice] = useState("");
  const [oppFormError, setOppFormError] = useState<CrmErrorDescriptor | null>(null);
  const [error, setError] = useState<CrmErrorDescriptor | null>(null);

  const [convertOpen, setConvertOpen] = useState(false);
  const [convertForm, setConvertForm] = useState({ leadId: "", companyName: "" });
  const [convertBusy, setConvertBusy] = useState(false);
  const [convertError, setConvertError] = useState<CrmErrorDescriptor | null>(null);
  const [convertNotice, setConvertNotice] = useState("");

  const [exportError, setExportError] = useState<CrmErrorDescriptor | null>(null);
  const [exportNotice, setExportNotice] = useState("");

  const [csvContent, setCsvContent] = useState("");
  const [fileName, setFileName] = useState("empresas.csv");
  const [importPreview, setImportPreview] = useState<{ batchId: string; fileName?: string; report: any; rows: ImportRow[]; totalRows: number; previewTruncated: boolean } | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<CrmErrorDescriptor | null>(null);

  const detailHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  const loadCompanies = useCallback(async () => {
    setCompaniesState("loading");
    setCompaniesError(null);
    const params = new URLSearchParams();
    if (filter.type) params.set("type", filter.type);
    const result = await crmRequest<{ companies?: Company[] }>(`/api/crm/companies?${params.toString()}`);
    if (!result.ok) {
      // UX-03B: falha de leitura não vira lista vazia. A tela diz o que houve.
      setCompanies([]);
      setCompaniesError(result.error);
      setCompaniesState("failed");
      return;
    }
    setCompanies(result.data.companies || []);
    setCompaniesState("ready");
  }, [filter.type]);

  const loadOpportunities = useCallback(async () => {
    setOppsState("loading");
    setOppsError(null);
    // CRM-07: busca e prioridade aplicadas no servidor (com curinga escapado);
    // a listagem é pessoal — cada comercial vê só o próprio funil.
    const params = new URLSearchParams();
    if (filter.stage) params.set("stage", filter.stage);
    if (appliedOppSearch) params.set("search", appliedOppSearch);
    if (oppPriority) params.set("priority", oppPriority);
    const result = await crmRequest<{ opportunities?: Opportunity[]; total?: number }>(`/api/crm/opportunities?${params.toString()}`);
    if (!result.ok) {
      setOpps([]);
      setOppsTotal(0);
      setOppsError(result.error);
      setOppsState("failed");
      return;
    }
    setOpps(result.data.opportunities || []);
    setOppsTotal(result.data.total || 0);
    setOppsState("ready");
  }, [filter.stage, appliedOppSearch, oppPriority]);

  const load = useCallback(async () => {
    await Promise.all([loadCompanies(), loadOpportunities()]);
  }, [loadCompanies, loadOpportunities]);

  useEffect(() => { loadCompanies(); }, [loadCompanies]);
  useEffect(() => { loadOpportunities(); }, [loadOpportunities]);

  async function loadUnits(companyId: string) {
    setOppUnitsError(null);
    if (!companyId) { setOppUnits([]); return; }
    const result = await crmRequest<{ units?: Unit[] }>(`/api/crm/companies/${companyId}`);
    if (!result.ok) { setOppUnits([]); setOppUnitsError(result.error); return; }
    setOppUnits(result.data.units || []);
  }

  function openOpportunity(opportunity: Opportunity, trigger: HTMLElement | null) {
    lastTriggerRef.current = trigger;
    setSelectedOpportunity(opportunity.id);
    setSelectedTitle(opportunity.title);
    setDetailTab("resumo");
  }

  function closeOpportunity() {
    setSelectedOpportunity(null);
    setSelectedTitle("");
    const trigger = lastTriggerRef.current;
    if (trigger && document.body.contains(trigger)) trigger.focus();
  }

  // Foco previsível: ao abrir um registro, a leitura começa no título dele.
  useEffect(() => {
    if (selectedOpportunity && detailHeadingRef.current) detailHeadingRef.current.focus();
  }, [selectedOpportunity]);

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    if (companySubmitting) return;
    setError(null);
    setCompanyNotice("");
    setCompanySubmitting(true);
    const result = await crmRequest("/api/crm/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: form.displayName, city: form.city, type: form.type, segment: form.segment }),
    });
    setCompanySubmitting(false);
    if (!result.ok) { setError(result.error); return; }
    setCompanyNotice(`Empresa "${form.displayName}" cadastrada. Ela já aparece na lista e no seletor de oportunidades.`);
    setForm({ displayName: "", city: "", type: "prospect", segment: "" });
    await load();
  }

  async function createOpportunity(e: React.FormEvent) {
    e.preventDefault();
    if (oppSubmitting) return;
    setOppFormError(null);
    setOppNotice("");
    setOppSubmitting(true);
    const result = await crmRequest("/api/crm/opportunities", {
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
    setOppSubmitting(false);
    if (!result.ok) { setOppFormError(result.error); return; }
    setOppNotice(`Oportunidade "${oppForm.title}" criada no estágio Novo, com você como responsável.`);
    setOppForm({ company_id: "", title: "", service_name: "", need_description: "", priority: "media", forecast_date: "", estimated_value: "", next_action: "", next_action_date: "", origin: "", unit_id: "" });
    setOppUnits([]);
    await load();
  }

  async function convertLead(e: React.FormEvent) {
    e.preventDefault();
    if (convertBusy) return;
    setConvertBusy(true);
    setConvertError(null);
    setConvertNotice("");
    const result = await crmRequest<{ opportunityId: string; dedup?: boolean }>(`/api/crm/leads/${convertForm.leadId.trim()}/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ create_company: true, company_name: convertForm.companyName.trim() || undefined }),
    });
    setConvertBusy(false);
    if (!result.ok) { setConvertError(result.error); return; }
    setConvertNotice(result.data.dedup
      ? "Pedido já tinha oportunidade: o histórico foi preservado e nada foi duplicado."
      : "Pedido convertido em oportunidade. O histórico do lead continua vinculado.");
    setConvertForm({ leadId: "", companyName: "" });
    await load();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setCsvContent(text);
  }

  async function previewImport() {
    if (importLoading) return;
    setImportError(null);
    if (!csvContent.trim()) {
      setImportError({ code: "csv_required", kind: "invalid", title: "Nenhum conteúdo para revisar", detail: "Escolha um arquivo CSV ou cole o conteúdo antes de pedir a prévia." });
      return;
    }
    setImportLoading(true);
    setImportResult(null);
    const result = await crmRequest<any>("/api/crm/imports/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, csvContent, type: "companies" }),
    });
    setImportLoading(false);
    if (!result.ok) { setImportError(result.error); return; }
    setImportPreview(result.data);
  }

  async function commitImport() {
    if (!importPreview || importLoading) return;
    setImportLoading(true);
    setImportError(null);
    const result = await crmRequest<any>(`/api/crm/imports/${importPreview.batchId}/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setImportLoading(false);
    if (!result.ok) { setImportError(result.error); return; }
    setImportResult(result.data);
    await load();
  }

  async function exportCompanies() {
    setExportError(null);
    setExportNotice("");
    try {
      const res = await fetch("/api/crm/companies/export", { cache: "no-store" });
      if (!res.ok) {
        let code: string | null = null;
        try { code = (await res.json())?.error ?? null; } catch { code = null; }
        const { describeCrmError } = await import("../../../lib/crm-vocabulary.mjs");
        setExportError(describeCrmError(code, res.status));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `empresas-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setExportNotice("Arquivo das empresas do seu escopo gerado pelo navegador.");
    } catch {
      const { describeCrmError } = await import("../../../lib/crm-vocabulary.mjs");
      setExportError(describeCrmError("network", 0));
    }
  }

  const importStepTwoDone = Boolean(importPreview);
  const duplicatesPending = Boolean(importPreview && importPreview.report?.duplicate > 0);

  return (
    <main className={styles.workspace}>
      <h1>Empresas e oportunidades</h1>
      <p className={styles.lede}>Cadastre empresas, acompanhe suas oportunidades e organize os próximos contatos. Cada comercial acessa seu próprio funil; as permissões continuam verificadas no servidor.</p>
      <nav className={styles.taskNav} aria-label="Tarefas do CRM">
        <a href="#crm-cadastros">Cadastrar empresa</a>
        <a href="#crm-importacao">Importar empresas</a>
        <a href="#crm-oportunidade">Criar oportunidade</a>
        <a href="#crm-funil">Consultar funil</a>
        <a href="#crm-agenda">Agenda e delegações</a>
      </nav>

      <section id="crm-cadastros" aria-labelledby="crm-cadastros-titulo" className={styles.panel}>
        <h2 id="crm-cadastros-titulo" className={styles.panelTitle}>Nova empresa</h2>
        <form onSubmit={createCompany} className={styles.formGrid} noValidate={false}>
          <fieldset className={styles.fieldset} disabled={companySubmitting}>
            <legend>Identificação da empresa</legend>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label htmlFor="company-name">Nome da empresa</label>
                <input id="company-name" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} required maxLength={200} autoComplete="organization" />
                <p className={styles.requiredNote}>Obrigatório</p>
              </div>
              <div className={styles.field}>
                <label htmlFor="company-city">Cidade</label>
                <input id="company-city" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} maxLength={100} autoComplete="address-level2" />
              </div>
              <div className={styles.field}>
                <label htmlFor="company-segment">Segmento</label>
                <input id="company-segment" value={form.segment} onChange={e => setForm({ ...form, segment: e.target.value })} maxLength={100} />
                <p className={styles.hint} id="company-segment-hint">Exemplo: condomínio, indústria, varejo.</p>
              </div>
              <div className={styles.field}>
                <label htmlFor="company-type">Tipo da empresa</label>
                <select id="company-type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  {COMPANY_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>
            <div className={styles.actions}>
              <button type="submit" className={styles.primary} aria-busy={companySubmitting}>
                {companySubmitting ? "Cadastrando…" : "Cadastrar empresa"}
              </button>
            </div>
          </fieldset>
        </form>
        {error ? <UiState variant={error.kind === "denied" || error.kind === "auth" ? "denied" : "error"} title={error.title} detail={error.detail} /> : null}
        {companyNotice ? <UiState variant="success" title={companyNotice} /> : null}

        <div className={styles.secondaryActions}>
          <button type="button" onClick={() => setConvertOpen(open => !open)} aria-expanded={convertOpen} aria-controls="crm-converter-lead">
            {convertOpen ? "Fechar conversão de pedido" : "Converter pedido recebido em oportunidade"}
          </button>
          <button type="button" onClick={exportCompanies}>Baixar empresas em CSV</button>
        </div>
        {exportError ? <UiState variant="error" title={exportError.title} detail={exportError.detail} /> : null}
        {exportNotice ? <UiState variant="success" title={exportNotice} /> : null}

        {convertOpen ? (
          <form id="crm-converter-lead" onSubmit={convertLead} className={styles.subPanel}>
            <h3 className={styles.panelSubtitle}>Converter pedido recebido</h3>
            <p className={styles.hint}>Informe o identificador do pedido público. O histórico é preservado e, se já houver oportunidade, o servidor não duplica o registro.</p>
            <fieldset className={styles.fieldset} disabled={convertBusy}>
              <legend className={styles.visuallyHidden}>Dados da conversão</legend>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="convert-lead-id">Identificador do pedido</label>
                  <input id="convert-lead-id" value={convertForm.leadId} onChange={e => setConvertForm({ ...convertForm, leadId: e.target.value })} required aria-describedby="convert-lead-id-hint" />
                  <p className={styles.requiredNote}>Obrigatório</p>
                  <p className={styles.hint} id="convert-lead-id-hint">Código técnico do pedido, copiado de Pedidos recebidos.</p>
                </div>
                <div className={styles.field}>
                  <label htmlFor="convert-company-name">Nome da empresa a criar ou vincular</label>
                  <input id="convert-company-name" value={convertForm.companyName} onChange={e => setConvertForm({ ...convertForm, companyName: e.target.value })} aria-describedby="convert-company-hint" />
                  <p className={styles.hint} id="convert-company-hint">Em branco, o sistema usa o nome informado no pedido.</p>
                </div>
              </div>
              <div className={styles.actions}>
                <button type="submit" className={styles.primary} aria-busy={convertBusy}>{convertBusy ? "Convertendo…" : "Converter pedido"}</button>
              </div>
            </fieldset>
            {convertError ? <UiState variant={convertError.kind === "denied" ? "denied" : "error"} title={convertError.title} detail={convertError.detail} /> : null}
            {convertNotice ? <UiState variant="success" title={convertNotice} /> : null}
          </form>
        ) : null}
      </section>

      <section id="crm-importacao" aria-labelledby="crm-importacao-titulo" className={styles.panel}>
        <h2 id="crm-importacao-titulo" className={styles.panelTitle}>Importar empresas por CSV</h2>
        <p>Quatro passos: escolher o conteúdo, revisar a prévia, decidir o que fazer com as duplicatas e confirmar. Nada é gravado antes da confirmação. Limite: 5.000 linhas e 800 KB.</p>

        <ol className={styles.steps}>
          <li aria-current={!importStepTwoDone ? "step" : undefined}>
            <h3 className={styles.stepTitle}>1. Escolher o conteúdo</h3>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label htmlFor="crm-csv-file">Arquivo CSV de empresas</label>
                <input id="crm-csv-file" type="file" accept=".csv,text/csv" onChange={handleFileChange} />
              </div>
              <div className={styles.field}>
                <label htmlFor="crm-csv-filename">Nome do arquivo no relatório</label>
                <input id="crm-csv-filename" value={fileName} onChange={e => setFileName(e.target.value)} />
              </div>
            </div>
            <div className={styles.field}>
              <label htmlFor="crm-csv-content">Ou cole o CSV (a primeira linha é o cabeçalho)</label>
              <textarea id="crm-csv-content" value={csvContent} onChange={e => setCsvContent(e.target.value)} rows={5} className={styles.code}
                placeholder={"display_name,document_ref,city,segment,type\nEmpresa A,123,Barueri,Segurança,prospect\nEmpresa B,456,Osasco,Condomínio,client"} />
            </div>
            <details className={styles.details}>
              <summary>Colunas e formato aceitos</summary>
              <p>Nome/display_name, CNPJ/document_ref, Segmento/segment, Cidade/city, Estado/state, Tipo/type (prospect/client/partner), Email/email, Telefone/phone, Origem/origin, Campanha/campaign, Responsável/responsible_name e Observação/notes. A prévia mostra o mapeamento aplicado e a revisão das duplicações.</p>
            </details>
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={previewImport} disabled={importLoading} aria-busy={importLoading}>
                {importLoading ? "Processando…" : "Revisar prévia"}
              </button>
            </div>
            {importError ? <UiState variant={importError.kind === "denied" ? "denied" : "error"} title={importError.title} detail={importError.detail} /> : null}
          </li>

          <li aria-current={importStepTwoDone && !importResult ? "step" : undefined}>
            <h3 className={styles.stepTitle}>2. Revisar a prévia</h3>
            {!importPreview ? (
              <p className={styles.hint}>A prévia aparece aqui depois do passo 1. Ela não grava nada.</p>
            ) : (
              <div>
                <h4 className={styles.panelSubtitle}>Arquivo {importPreview.fileName || fileName}</h4>
                <ul className={styles.summaryList}>
                  <li><strong>{importPreview.report.total}</strong> linhas lidas</li>
                  <li><strong>{importPreview.report.valid}</strong> prontas para importar</li>
                  <li><strong>{importPreview.report.invalid}</strong> com erro</li>
                  <li><strong>{importPreview.report.duplicate}</strong> possíveis duplicatas</li>
                </ul>
                <details className={styles.details}>
                  <summary>Detalhes técnicos do lote</summary>
                  <p>Identificador do lote: <code>{importPreview.batchId}</code></p>
                  <p>Mapeamento de colunas: <code>{JSON.stringify(importPreview.report.mapping)}</code></p>
                  <p>Prevenção de fórmula em planilha: <code>{String(importPreview.report.formula_prevention)}</code></p>
                </details>
                <div className={styles.tableScroll}>
                  <table>
                    <caption className={styles.visuallyHidden}>Linhas da prévia de importação</caption>
                    <thead>
                      <tr><th scope="col">Linha</th><th scope="col">Situação</th><th scope="col">Dados reconhecidos</th><th scope="col">Erros</th><th scope="col">Possível duplicata</th></tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.map(row => (
                        <tr key={row.row_number} data-row-status={row.status}>
                          <td>{row.row_number}</td>
                          <td>{row.status === "valid" ? "Pronta para importar" : row.status === "duplicate" ? "Possível duplicata" : "Com erro"}</td>
                          <td><code className={styles.code}>{JSON.stringify(row.mapped_data)}</code></td>
                          <td>{row.errors.map((e: any) => `${e.field}: ${e.message}`).join("; ") || "—"}</td>
                          <td>{row.dedup_match ? `${row.dedup_match.display_name}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importPreview.previewTruncated ? <p className={styles.hint}>Prévia limitada a 100 linhas; o arquivo tem {importPreview.totalRows} linhas e todas serão avaliadas na confirmação.</p> : null}
              </div>
            )}
          </li>

          <li>
            <h3 className={styles.stepTitle}>3. Decidir as duplicatas</h3>
            {!importPreview ? (
              <p className={styles.hint}>Sem prévia, não há duplicata para decidir.</p>
            ) : duplicatesPending ? (
              <ImportDedupReview batchId={importPreview.batchId} onCommitted={() => { load(); }} />
            ) : (
              <p className={styles.hint}>Nenhuma duplicata encontrada neste arquivo. Siga para a confirmação.</p>
            )}
          </li>

          <li>
            <h3 className={styles.stepTitle}>4. Confirmar a importação</h3>
            {!importPreview ? (
              <p className={styles.hint}>A confirmação só é liberada depois da prévia.</p>
            ) : duplicatesPending ? (
              <p className={styles.hint}>Confirme pelo painel de duplicatas do passo 3. Enquanto houver decisão pendente, o servidor recusa o commit — a tela não decide por você.</p>
            ) : (
              <div className={styles.actions}>
                <button type="button" className={styles.primary} onClick={commitImport} disabled={importLoading} aria-busy={importLoading}>
                  {importLoading ? "Importando…" : `Confirmar importação de ${importPreview.report.valid} linha(s)`}
                </button>
              </div>
            )}
            {importResult ? (
              <UiState
                variant="success"
                title="Importação concluída."
                detail={`Criadas: ${importResult.created}. Ignoradas: ${importResult.skipped}. Falhas: ${importResult.failed}.`}
              />
            ) : null}
          </li>
        </ol>
      </section>

      <section id="crm-oportunidade" aria-labelledby="crm-oportunidade-titulo" className={styles.panel}>
        <h2 id="crm-oportunidade-titulo" className={styles.panelTitle}>Nova oportunidade</h2>
        <p>Você será o responsável pela oportunidade. Escolha uma empresa, descreva a necessidade e defina o próximo contato. Origem e responsável ficam preservados no histórico; a perda exige um motivo.</p>
        <form onSubmit={createOpportunity} className={styles.formGrid}>
          <fieldset className={styles.fieldset} disabled={oppSubmitting}>
            <legend>Empresa e necessidade</legend>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label htmlFor="opp-form-company">Empresa</label>
                <select id="opp-form-company" value={oppForm.company_id} required
                  onChange={e => { setOppForm({ ...oppForm, company_id: e.target.value, unit_id: "" }); loadUnits(e.target.value); }}>
                  <option value="">Escolha uma empresa</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
                </select>
                <p className={styles.requiredNote}>Obrigatório</p>
                {companiesState === "failed" ? <p className={styles.errorText}>A lista de empresas não carregou. Use “Tentar novamente” na seção do funil.</p> : null}
              </div>
              <div className={styles.field}>
                <label htmlFor="opp-form-title">Título</label>
                <input id="opp-form-title" value={oppForm.title} onChange={e => setOppForm({ ...oppForm, title: e.target.value })} required maxLength={200} />
                <p className={styles.requiredNote}>Obrigatório</p>
              </div>
              <div className={styles.field}>
                <label htmlFor="opp-form-service">Serviço</label>
                <input id="opp-form-service" value={oppForm.service_name} onChange={e => setOppForm({ ...oppForm, service_name: e.target.value })} maxLength={100} />
              </div>
              <div className={styles.field}>
                <label htmlFor="opp-form-need">Necessidade</label>
                <input id="opp-form-need" value={oppForm.need_description} onChange={e => setOppForm({ ...oppForm, need_description: e.target.value })} maxLength={2000} />
              </div>
              <div className={styles.field}>
                <label htmlFor="opp-form-unit">Unidade</label>
                <select id="opp-form-unit" value={oppForm.unit_id} onChange={e => setOppForm({ ...oppForm, unit_id: e.target.value })} disabled={!oppForm.company_id}>
                  <option value="">Sem unidade específica</option>
                  {oppUnits.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                </select>
                {oppUnitsError ? <p className={styles.errorText}>{oppUnitsError.title}. {oppUnitsError.detail}</p> : null}
              </div>
            </div>
          </fieldset>

          <fieldset className={styles.fieldset} disabled={oppSubmitting}>
            <legend>Acompanhamento</legend>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label htmlFor="opp-form-priority">Prioridade</label>
                <select id="opp-form-priority" value={oppForm.priority} onChange={e => setOppForm({ ...oppForm, priority: e.target.value })}>
                  {OPPORTUNITY_PRIORITIES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="opp-form-forecast">Previsão de fechamento</label>
                <input id="opp-form-forecast" type="date" value={oppForm.forecast_date} onChange={e => setOppForm({ ...oppForm, forecast_date: e.target.value })} />
              </div>
              <div className={styles.field}>
                <label htmlFor="opp-form-value">Valor estimado (R$)</label>
                <input id="opp-form-value" type="number" min={0} step="0.01" value={oppForm.estimated_value} onChange={e => setOppForm({ ...oppForm, estimated_value: e.target.value })} aria-describedby="opp-form-value-hint" />
                <p className={styles.hint} id="opp-form-value-hint">Estimativa comercial. Não é receita reconhecida.</p>
              </div>
              <div className={styles.field}>
                <label htmlFor="opp-form-next">Próxima ação</label>
                <input id="opp-form-next" value={oppForm.next_action} onChange={e => setOppForm({ ...oppForm, next_action: e.target.value })} maxLength={200} />
              </div>
              <div className={styles.field}>
                <label htmlFor="opp-form-next-date">Data da próxima ação</label>
                <input id="opp-form-next-date" type="datetime-local" value={oppForm.next_action_date} onChange={e => setOppForm({ ...oppForm, next_action_date: e.target.value })} />
              </div>
              <div className={styles.field}>
                <label htmlFor="opp-form-origin">Origem</label>
                <input id="opp-form-origin" value={oppForm.origin} onChange={e => setOppForm({ ...oppForm, origin: e.target.value })} maxLength={100} aria-describedby="opp-form-origin-hint" />
                <p className={styles.hint} id="opp-form-origin-hint">Registrada uma vez; depois é imutável no histórico.</p>
              </div>
            </div>
            <div className={styles.actions}>
              <button type="submit" className={styles.primary} aria-busy={oppSubmitting}>{oppSubmitting ? "Criando…" : "Criar oportunidade"}</button>
            </div>
          </fieldset>
        </form>
        {oppFormError ? <UiState variant={oppFormError.kind === "denied" ? "denied" : "error"} title={oppFormError.title} detail={oppFormError.detail} /> : null}
        {oppNotice ? <UiState variant="success" title={oppNotice} /> : null}
      </section>

      <section id="crm-filtros" aria-labelledby="crm-filtros-titulo" className={styles.panel}>
        <h2 id="crm-filtros-titulo" className={styles.panelTitle}>Filtrar o que aparece abaixo</h2>
        <form
          className={styles.filterBar}
          onSubmit={e => { e.preventDefault(); setAppliedOppSearch(oppSearch.trim()); }}
        >
          <fieldset className={styles.fieldset}>
            <legend>Empresas</legend>
            <div className={styles.field}>
              <label htmlFor="filtro-tipo">Filtrar por tipo de empresa</label>
              <select id="filtro-tipo" value={filter.type} onChange={e => setFilter({ ...filter, type: e.target.value })}>
                <option value="">Todos os tipos</option>
                {COMPANY_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          </fieldset>
          <fieldset className={styles.fieldset}>
            <legend>Oportunidades</legend>
            <div className={styles.fieldRow}>
              <div className={styles.field}>
                <label htmlFor="filtro-estagio">Filtrar por estágio do funil</label>
                <select id="filtro-estagio" value={filter.stage} onChange={e => setFilter({ ...filter, stage: e.target.value })}>
                  <option value="">Todos os estágios</option>
                  {OPPORTUNITY_STAGES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="filtro-prioridade">Filtrar por prioridade</label>
                <select id="filtro-prioridade" value={oppPriority} onChange={e => setOppPriority(e.target.value)}>
                  <option value="">Todas as prioridades</option>
                  {OPPORTUNITY_PRIORITIES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="filtro-busca">Buscar no título ou na necessidade</label>
                <input id="filtro-busca" value={oppSearch} onChange={e => setOppSearch(e.target.value)} maxLength={200} aria-describedby="filtro-busca-hint" />
                <p className={styles.hint} id="filtro-busca-hint">A busca roda no servidor, dentro do seu escopo.</p>
              </div>
            </div>
          </fieldset>
          <div className={styles.actions}>
            <button type="submit" className={styles.primary}>Aplicar busca</button>
            <button type="button" onClick={() => { load(); }}>Atualizar listas</button>
          </div>
        </form>
      </section>

      <section id="crm-funil" aria-labelledby="crm-funil-titulo" className={styles.results}>
        <h2 id="crm-funil-titulo" className={styles.visuallyHidden}>Empresas e funil</h2>
        <div>
          <h3 className={styles.panelTitle}>Empresas{companiesState === "ready" ? ` (${companies.length})` : ""}</h3>
          {companiesState === "loading" ? (
            <UiState variant="loading" title="Consultando as empresas do seu escopo…" />
          ) : companiesState === "failed" && companiesError ? (
            <UiState
              variant={companiesError.kind === "denied" || companiesError.kind === "auth" ? "denied" : "error"}
              title={companiesError.title}
              detail={companiesError.detail}
              onRetry={companiesError.kind === "retry" ? () => loadCompanies() : undefined}
            />
          ) : companies.length === 0 ? (
            <UiState variant="empty" title="Nenhuma empresa neste filtro." detail="Ajuste o filtro de tipo ou cadastre a primeira empresa em “Nova empresa”." />
          ) : (
            <div className={styles.tableScroll}>
              <table>
                <caption className={styles.visuallyHidden}>Empresas do seu escopo</caption>
                <thead><tr><th scope="col">Nome</th><th scope="col">Tipo</th><th scope="col">Cidade</th><th scope="col">Segmento</th><th scope="col">Situação</th></tr></thead>
                <tbody>
                  {companies.map(c => (
                    <tr key={c.id}>
                      <td>{c.display_name}</td>
                      <td>{companyTypeLabel(c.type)}</td>
                      <td>{c.city || "—"}</td>
                      <td>{c.segment || "—"}</td>
                      <td>{companyStatusLabel(c.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className={styles.panelTitle}>
            Oportunidades{oppsState === "ready" ? ` (${opps.length} de ${oppsTotal})` : ""}
          </h3>
          <p className={styles.hint}>Funil pessoal: aparecem apenas as oportunidades sob sua responsabilidade.</p>
          <div className={styles.actions}>
            <button type="button" onClick={() => setOppView(view => view === "kanban" ? "tabela" : "kanban")}>
              {oppView === "kanban" ? "Ver em tabela" : "Ver em quadro"}
            </button>
          </div>

          {oppsState === "loading" ? (
            <UiState variant="loading" title="Consultando o seu funil…" />
          ) : oppsState === "failed" && oppsError ? (
            <UiState
              variant={oppsError.kind === "denied" || oppsError.kind === "auth" ? "denied" : "error"}
              title={oppsError.title}
              detail={oppsError.detail}
              onRetry={oppsError.kind === "retry" ? () => loadOpportunities() : undefined}
            />
          ) : opps.length === 0 ? (
            <UiState variant="empty" title="Nenhuma oportunidade neste filtro." detail="Limpe os filtros acima ou crie uma oportunidade em “Nova oportunidade”." />
          ) : oppView === "kanban" ? (
            <div className={styles.kanban}>
              {OPPORTUNITY_STAGES.map(stage => {
                const items = opps.filter(o => o.stage === stage.value);
                return (
                  <div key={stage.value} className={styles.kanbanColumn}>
                    <h4 className={styles.kanbanTitle}>{stage.label} ({items.length})</h4>
                    {items.map(o => (
                      <article key={o.id} className={styles.card} data-outcome={o.is_won ? "ganho" : o.is_lost ? "perdido" : "aberto"}>
                        <h5 className={styles.cardTitle}>{o.title}</h5>
                        <dl className={styles.cardFacts}>
                          <div><dt>Serviço</dt><dd>{o.service_name || "—"}</dd></div>
                          <div><dt>Prioridade</dt><dd>{priorityLabel(o.priority)}</dd></div>
                          <div><dt>Valor estimado</dt><dd>{formatMoney(o.estimated_value)}</dd></div>
                          <div><dt>Unidade</dt><dd>{o.unit_name || "—"}</dd></div>
                          <div><dt>Previsão</dt><dd>{formatDate(o.forecast_date)}</dd></div>
                          <div><dt>Próxima ação</dt><dd>{o.next_action || "—"} {formatDateTime(o.next_action_date)}</dd></div>
                        </dl>
                        {o.is_won ? <p className={styles.outcome}>Ganho — estado de funil, não é dinheiro recebido.</p> : null}
                        {o.is_lost ? <p className={styles.outcome}>Perdido — motivo: {o.loss_reason || "—"}</p> : null}
                        <button type="button" className={styles.primary} onClick={e => openOpportunity(o, e.currentTarget)}>
                          Abrir oportunidade<span className={styles.visuallyHidden}> {o.title}</span>
                        </button>
                      </article>
                    ))}
                    {items.length === 0 ? <p className={styles.hint}>Sem oportunidades neste estágio.</p> : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.tableScroll}>
              <table>
                <caption className={styles.visuallyHidden}>Oportunidades do seu funil</caption>
                <thead>
                  <tr>
                    <th scope="col">Título</th><th scope="col">Estágio</th><th scope="col">Serviço</th><th scope="col">Responsável</th>
                    <th scope="col">Unidade</th><th scope="col">Previsão</th><th scope="col">Prioridade</th><th scope="col">Valor estimado</th>
                    <th scope="col">Próxima ação</th><th scope="col">Origem</th><th scope="col">Motivo de perda</th><th scope="col">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {opps.map(o => (
                    <tr key={o.id} data-outcome={o.is_won ? "ganho" : o.is_lost ? "perdido" : "aberto"}>
                      <td>{o.title}</td>
                      <td>{stageLabel(o.stage)}</td>
                      <td>{o.service_name || "—"}</td>
                      <td>{o.responsible_name || "—"}</td>
                      <td>{o.unit_name || "—"}</td>
                      <td>{formatDate(o.forecast_date)}</td>
                      <td>{priorityLabel(o.priority)}</td>
                      <td>{formatMoney(o.estimated_value)}</td>
                      <td>{o.next_action || "—"} {formatDateTime(o.next_action_date)}</td>
                      <td>{o.origin || "—"}</td>
                      <td>{o.is_lost ? (o.loss_reason || "—") : ""}</td>
                      <td>
                        <button type="button" onClick={e => openOpportunity(o, e.currentTarget)}>
                          Abrir<span className={styles.visuallyHidden}> {o.title}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {selectedOpportunity ? (
        <section id="crm-detalhe" aria-labelledby="crm-detalhe-titulo" className={styles.detail}>
          <div className={styles.detailHeader}>
            <div>
              <p className={styles.detailKicker}>Registro aberto</p>
              <h2 id="crm-detalhe-titulo" tabIndex={-1} ref={detailHeadingRef} className={styles.detailTitle}>
                {selectedTitle || "Oportunidade"}
              </h2>
              <p className={styles.hint}>
                {stageHint(opps.find(o => o.id === selectedOpportunity)?.stage)} As ações abaixo valem só para esta oportunidade.
              </p>
            </div>
            <button type="button" onClick={closeOpportunity} className={styles.closeButton}>Fechar oportunidade</button>
          </div>

          <div className={styles.tabs} role="tablist" aria-label="Seções da oportunidade aberta">
            {DETAIL_TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`crm-tab-${tab.id}`}
                aria-selected={detailTab === tab.id}
                aria-controls={`crm-painel-${tab.id}`}
                tabIndex={detailTab === tab.id ? 0 : -1}
                className={detailTab === tab.id ? styles.tabActive : styles.tab}
                onClick={() => setDetailTab(tab.id)}
                onKeyDown={e => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  e.preventDefault();
                  const index = DETAIL_TABS.findIndex(item => item.id === detailTab);
                  const next = e.key === "ArrowRight"
                    ? DETAIL_TABS[(index + 1) % DETAIL_TABS.length]
                    : DETAIL_TABS[(index - 1 + DETAIL_TABS.length) % DETAIL_TABS.length];
                  setDetailTab(next.id);
                  document.getElementById(`crm-tab-${next.id}`)?.focus();
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div id={`crm-painel-${detailTab}`} role="tabpanel" aria-labelledby={`crm-tab-${detailTab}`} tabIndex={0} className={styles.tabPanel}>
            {detailTab === "resumo" ? <OpportunitySummary key={"summary-" + selectedOpportunity} opportunityId={selectedOpportunity} /> : null}
            {detailTab === "notas" ? <OpportunityNotes key={"notes-" + selectedOpportunity} opportunityId={selectedOpportunity} /> : null}
            {detailTab === "tarefas" ? <OpportunityTasks key={selectedOpportunity} opportunityId={selectedOpportunity} /> : null}
            {detailTab === "interacoes" ? <OpportunityInteractions key={"interactions-" + selectedOpportunity} opportunityId={selectedOpportunity} /> : null}
            {detailTab === "visitas" ? <OpportunityVisits key={"visits-" + selectedOpportunity} opportunityId={selectedOpportunity} /> : null}
            {detailTab === "cadencia" ? <CadenceClient key={"cadence-" + selectedOpportunity} opportunityId={selectedOpportunity} /> : null}
          </div>
          <p className={styles.hint}>Cadências criam tarefas manuais; não enviam mensagens automaticamente.</p>
        </section>
      ) : (
        <section aria-labelledby="crm-detalhe-vazio" className={styles.panel}>
          <h2 id="crm-detalhe-vazio" className={styles.panelTitle}>Detalhe da oportunidade</h2>
          <UiState
            variant="empty"
            title="Nenhuma oportunidade aberta."
            detail="Use “Abrir oportunidade” no funil acima para ver resumo, notas, tarefas, interações, visitas e cadência de um único registro por vez."
          />
        </section>
      )}

      <UnitManager companies={companies} />
      <ContactManager companies={companies} />

      <section id="crm-agenda" aria-labelledby="crm-agenda-titulo" className={styles.panel}>
        <h2 id="crm-agenda-titulo" className={styles.panelTitle}>Agenda e delegações</h2>
        <MyDelegatedTasks />
        <MyAgenda />
      </section>
    </main>
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
