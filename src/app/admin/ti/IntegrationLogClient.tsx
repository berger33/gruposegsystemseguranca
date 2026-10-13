"use client";

import { useEffect, useState } from "react";
import UiState from "@/components/ui/UiState";
import styles from "./IntegrationLogClient.module.css";

type Job = { id: string; job_type: string; status: string; source: string; target: string; total_records: number; processed_records: number; success_records: number; error_records: number; rate_limit_per_minute: number | null; retry_count: number; created_at: string };
type Log = { id: string; integration_name: string; direction: string; endpoint: string | null; method: string | null; response_status: number | null; duration_ms: number | null; is_error: boolean; error_message: string | null; created_at: string };
type Webhook = { id: string; name: string; url: string; events: string[]; is_active: boolean; rate_limit_per_minute: number; max_retries: number; timeout_ms: number; created_at: string };
type Delivery = { id: string; webhook_id: string; event_type: string; status: string; response_status: number | null; retry_count: number; error_message: string | null; created_at: string; delivered_at: string | null };
type Recon = { id: string; source: string; target: string; total_source: number; total_target: number; matched: number; mismatched: number; missing_in_target: number; missing_in_source: number; created_at: string };
type Collection = "jobs" | "logs" | "webhooks" | "deliveries" | "reports";
type Feedback = { variant: "error" | "denied"; title: string; detail: string };
type Tab = "jobs" | "logs" | "webhooks" | "reconciliation";

const JOB_TYPES = [["import", "Importação"], ["export", "Exportação"], ["webhook", "Webhook"], ["sync", "Sincronização"], ["reconciliacao", "Reconciliação"]] as const;
const JOB_STATUSES: Record<string, string> = { pendente: "Pendente", em_execucao: "Em execução", concluido: "Concluído", falha: "Falha", parcial: "Parcial", cancelado: "Cancelado" };
const DELIVERY_STATUSES: Record<string, string> = { pendente: "Pendente", enviado: "Registrado como enviado", falha: "Falha registrada", rejeitado: "Rejeitado", retry: "Nova tentativa" };
const ERROR_LABELS: Record<string, string> = {
  unauthorized: "Sua sessão expirou. Entre novamente para consultar as integrações.",
  forbidden: "Seu perfil não tem autorização para esta operação.",
  invalid_job_type: "Selecione um tipo de tarefa válido.",
  source_target_required: "Informe a origem e o destino.",
  invalid_rate_limit: "O limite deve estar entre 1 e 10.000 operações por minuto.",
  name_min_3: "O nome do webhook precisa ter pelo menos 3 caracteres.",
  invalid_url: "Informe uma URL HTTP ou HTTPS válida.",
  invalid_webhook_id: "Selecione um webhook válido.",
  webhook_not_found: "O webhook selecionado não foi localizado.",
  webhook_inactive: "Ative o webhook antes de registrar uma delivery.",
  rate_limit_exceeded: "O limite de registros por minuto deste webhook foi atingido.",
};
const TABS: [Tab, string][] = [["jobs", "Tarefas"], ["logs", "Registros técnicos"], ["webhooks", "Webhooks e deliveries"], ["reconciliation", "Conciliação"]];

function date(value?: string | null) {
  if (!value) return "Não informado";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "Data indisponível" : parsed.toLocaleString("pt-BR");
}
function number(value: number | null | undefined) { return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("pt-BR") : "—"; }
function errorText(code?: string) { return code ? ERROR_LABELS[code] ?? "A operação não foi concluída. Revise os dados e tente novamente." : "Não foi possível concluir a operação. Verifique a conexão e tente novamente."; }
async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...init });
  const data = await response.json().catch(() => ({})) as T;
  return { response, data };
}
function Field({ label, help, children, className }: { label: string; help?: string; children: React.ReactNode; className?: string }) {
  return <label className={`${styles.field} ${className ?? ""}`}><span>{label}</span>{children}{help && <small>{help}</small>}</label>;
}
function ListState({ loading, error, empty, retry }: { loading: boolean; error?: Feedback; empty: boolean; retry: () => void }) {
  if (loading) return <UiState variant="loading" title="Carregando registros" detail="Consultando dados internos do sistema." />;
  if (error) return <UiState variant={error.variant} title={error.title} detail={error.detail} onRetry={retry} retryLabel="Tentar novamente" />;
  if (empty) return <UiState variant="empty" title="Nenhum registro encontrado" detail="Esta lista não cria dados fictícios. Novos registros aparecerão após uma ação autorizada." />;
  return null;
}

export default function IntegrationLogClient() {
  const [active, setActive] = useState<Tab>("jobs");
  const [jobs, setJobs] = useState<Job[]>([]); const [logs, setLogs] = useState<Log[]>([]); const [webhooks, setWebhooks] = useState<Webhook[]>([]); const [deliveries, setDeliveries] = useState<Delivery[]>([]); const [reports, setReports] = useState<Recon[]>([]);
  const [loading, setLoading] = useState<Record<Collection, boolean>>({ jobs: true, logs: true, webhooks: true, deliveries: true, reports: true });
  const [errors, setErrors] = useState<Partial<Record<Collection, Feedback>>>({}); const [saving, setSaving] = useState(""); const [message, setMessage] = useState(""); const [operationError, setOperationError] = useState<Feedback | null>(null);
  const [jobForm, setJobForm] = useState({ job_type: "import", source: "crm_companies", target: "external_erp", total_records: 100, rate_limit_per_minute: 60, max_retries: 3, file_reference: "" });
  const [webhookForm, setWebhookForm] = useState({ name: "ERP Sync", url: "https://example.com/webhook", secret: "", events: "lead.created,contract.activated", rate_limit_per_minute: 60, max_retries: 3, timeout_ms: 10000 });
  const [deliveryForm, setDeliveryForm] = useState({ webhook_id: "", event_type: "lead.created", payload: '{"tipo":"evento de demonstração"}' });
  const [reconForm, setReconForm] = useState({ source: "crm_companies", target: "external_erp", total_source: 100, total_target: 98, matched: 95, mismatched: 3, missing_in_target: 2, missing_in_source: 0 });

  async function load() {
    const endpoints: [Collection, string, (data: Record<string, unknown>) => void][] = [
      ["jobs", "/api/admin/integrations/jobs", data => setJobs(Array.isArray(data.jobs) ? data.jobs as Job[] : [])],
      ["logs", "/api/admin/integrations/logs", data => setLogs(Array.isArray(data.logs) ? data.logs as Log[] : [])],
      ["webhooks", "/api/admin/integrations/webhooks", data => setWebhooks(Array.isArray(data.webhooks) ? data.webhooks as Webhook[] : [])],
      ["deliveries", "/api/admin/integrations/webhooks/deliveries", data => setDeliveries(Array.isArray(data.deliveries) ? data.deliveries as Delivery[] : [])],
      ["reports", "/api/admin/integrations/reconciliation", data => setReports(Array.isArray(data.reports) ? data.reports as Recon[] : [])],
    ];
    setLoading(current => Object.fromEntries(Object.keys(current).map(key => [key, true])) as Record<Collection, boolean>);
    setErrors({});
    await Promise.all(endpoints.map(async ([key, url, apply]) => {
      try {
        const { response, data } = await request<Record<string, unknown>>(url);
        if (!response.ok) throw { status: response.status, code: data.error };
        apply(data);
      } catch (failure) {
        const denied = typeof failure === "object" && failure !== null && "status" in failure && ((failure as { status: number }).status === 401 || (failure as { status: number }).status === 403);
        const code = typeof failure === "object" && failure !== null && "code" in failure ? String((failure as { code: string }).code) : undefined;
        setErrors(current => ({ ...current, [key]: { variant: denied ? "denied" : "error", title: denied ? "Acesso necessário" : "Consulta indisponível", detail: errorText(code) } }));
      } finally { setLoading(current => ({ ...current, [key]: false })); }
    }));
  }
  useEffect(() => { void load(); }, []);

  async function mutate(key: string, url: string, method: string, payload: unknown, success: string): Promise<boolean> {
    setSaving(key); setMessage(""); setOperationError(null);
    try {
      const { response, data } = await request<Record<string, unknown>>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw { status: response.status, code: data.error };
      await load(); setMessage(success); return true;
    } catch (failure) {
      const denied = typeof failure === "object" && failure !== null && "status" in failure && ((failure as { status: number }).status === 401 || (failure as { status: number }).status === 403);
      const code = typeof failure === "object" && failure !== null && "code" in failure ? String((failure as { code: string }).code) : undefined;
      setOperationError({ variant: denied ? "denied" : "error", title: denied ? "Acesso necessário" : "A operação não foi concluída", detail: errorText(code) }); return false;
    } finally { setSaving(""); }
  }
  async function createJob(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate("job", "/api/admin/integrations/jobs", "POST", jobForm, "Tarefa demonstrativa registrada. A conclusão foi simulada pelo serviço local.");
  }
  async function createWebhook(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { ...webhookForm, events: webhookForm.events.split(",").map(value => value.trim()).filter(Boolean) };
    const saved = await mutate("webhook", "/api/admin/integrations/webhooks", "POST", payload, "Configuração de webhook registrada no sistema.");
    if (saved) setWebhookForm(current => ({ ...current, secret: "" }));
  }
  async function toggleWebhook(id: string, is_active: boolean) {
    await mutate(`toggle-${id}`, "/api/admin/integrations/webhooks", "PATCH", { id, is_active }, is_active ? "Webhook ativado no cadastro interno." : "Webhook desativado no cadastro interno.");
  }
  async function deliverWebhook(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setOperationError(null); setMessage("");
    if (!deliveryForm.webhook_id) { setOperationError({ variant: "error", title: "Selecione um webhook", detail: "Escolha uma configuração ativa antes de registrar o evento." }); return; }
    let payload: unknown;
    try { payload = JSON.parse(deliveryForm.payload); } catch { setOperationError({ variant: "error", title: "JSON inválido", detail: "Revise o conteúdo do evento e tente novamente." }); return; }
    await mutate("delivery", "/api/admin/integrations/webhooks/deliveries", "POST", { webhook_id: deliveryForm.webhook_id, event_type: deliveryForm.event_type, payload }, "Delivery demonstrativa registrada. Nenhuma requisição foi enviada ao endereço configurado.");
  }
  async function createReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate("report", "/api/admin/integrations/reconciliation", "POST", reconForm, "Relatório de conciliação manual registrado com os valores informados.");
  }

  const metric = (key: Collection, value: number) => loading[key] ? "…" : errors[key] ? "Indisponível" : number(value);
  const jobCount = jobs.length; const errorCount = logs.filter(item => item.is_error).length;
  return <section className={styles.workspace} aria-labelledby="integration-title">
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Saúde e operação</p><h2 id="integration-title">Registros de integração</h2><p>Consulte tarefas, registros técnicos, cadastros de webhook e conciliações internas. Esta tela não conecta provedores externos.</p></div>
      <button type="button" onClick={() => void load()} disabled={Object.values(loading).some(Boolean)}>{Object.values(loading).some(Boolean) ? "Atualizando…" : "Atualizar dados"}</button>
    </header>
    <aside className={styles.notice} aria-label="Limite operacional"><strong>Modo demonstrativo interno</strong><p>Jobs e deliveries são concluídos/registrados pelo próprio serviço sem chamar sistemas externos. Conciliações guardam contagens informadas manualmente; não comparam bases automaticamente. Não use estes resultados como confirmação de integração real.</p></aside>
    <div className={styles.summary} aria-label="Resumo dos registros"><div><span>Tarefas retornadas</span><strong>{metric("jobs", jobCount)}</strong></div><div><span>Registros técnicos</span><strong>{metric("logs", logs.length)}</strong></div><div><span>Erros registrados</span><strong>{metric("logs", errorCount)}</strong></div><div><span>Webhooks cadastrados</span><strong>{metric("webhooks", webhooks.length)}</strong></div></div>
    <nav className={styles.tabs} aria-label="Tarefas de integração">{TABS.map(([key, label]) => <button key={key} type="button" aria-pressed={active === key} onClick={() => setActive(key)}>{label}</button>)}</nav>
    {operationError && <UiState variant={operationError.variant} title={operationError.title} detail={operationError.detail} />}
    {message && <UiState variant="success" title={message} />}

    {active === "jobs" && <section className={styles.panel} aria-labelledby="jobs-title"><div className={styles.sectionHeading}><div><h3 id="jobs-title">Tarefas registradas</h3><p>Até 200 itens mais recentes. A criação atual simula execução e grava um resultado local.</p></div><span className={styles.count}>{loading.jobs ? "Consultando…" : `${number(jobs.length)} registros`}</span></div>
      <ListState loading={loading.jobs} error={errors.jobs} empty={!jobs.length} retry={() => void load()} />
      {!loading.jobs && !errors.jobs && jobs.length > 0 && <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Tabela rolável de tarefas"><table><thead><tr><th>Tipo e situação</th><th>Origem → destino</th><th>Registros</th><th>Limite e tentativas</th><th>Criada em</th></tr></thead><tbody>{jobs.map(job => <tr key={job.id}><td><strong>{JOB_TYPES.find(([key]) => key === job.job_type)?.[1] ?? job.job_type}</strong><span className={styles.badge}>{JOB_STATUSES[job.status] ?? job.status}</span></td><td>{job.source} <span aria-hidden="true">→</span> {job.target}</td><td>{number(job.processed_records)} processados <small>{number(job.success_records)} concluídos · {number(job.error_records)} com erro</small></td><td>{number(job.rate_limit_per_minute)}/min <small>{number(job.retry_count)} tentativas</small></td><td>{date(job.created_at)}</td></tr>)}</tbody></table></div>}
      <details className={styles.formDetails}><summary>Registrar tarefa demonstrativa</summary><p>O serviço marca a tarefa como concluída e cria um registro interno sem importar, exportar ou sincronizar dados externos.</p><form className={styles.form} onSubmit={event => void createJob(event)}><div className={styles.formGrid}>
        <Field label="Tipo de tarefa"><select value={jobForm.job_type} onChange={event => setJobForm({ ...jobForm, job_type: event.target.value })}>{JOB_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="Origem"><input required maxLength={100} value={jobForm.source} onChange={event => setJobForm({ ...jobForm, source: event.target.value })} /></Field>
        <Field label="Destino"><input required maxLength={100} value={jobForm.target} onChange={event => setJobForm({ ...jobForm, target: event.target.value })} /></Field>
        <Field label="Total de registros informado"><input type="number" min="0" step="1" value={jobForm.total_records} onChange={event => setJobForm({ ...jobForm, total_records: Number.parseInt(event.target.value, 10) || 0 })} /></Field>
        <Field label="Limite por minuto"><input type="number" min="1" max="10000" step="1" value={jobForm.rate_limit_per_minute} onChange={event => setJobForm({ ...jobForm, rate_limit_per_minute: Number.parseInt(event.target.value, 10) || 0 })} /></Field>
        <Field label="Máximo de tentativas"><input type="number" min="0" max="10" step="1" value={jobForm.max_retries} onChange={event => setJobForm({ ...jobForm, max_retries: Number.parseInt(event.target.value, 10) || 0 })} /></Field>
        <Field label="Referência de arquivo (opcional)" help="É apenas um texto de referência; nenhum arquivo é enviado." className={styles.full}><input maxLength={500} value={jobForm.file_reference} onChange={event => setJobForm({ ...jobForm, file_reference: event.target.value })} /></Field>
      </div><button className={styles.primary} type="submit" disabled={Boolean(saving)}>{saving === "job" ? "Registrando…" : "Registrar tarefa demonstrativa"}</button></form></details>
    </section>}

    {active === "logs" && <section className={styles.panel} aria-labelledby="logs-title"><div className={styles.sectionHeading}><div><h3 id="logs-title">Registros técnicos</h3><p>Até 200 itens. Endereço, método, resposta e duração são metadados internos; mensagens de erro são exibidas separadamente.</p></div><span className={styles.count}>{loading.logs ? "Consultando…" : `${number(logs.length)} registros`}</span></div>
      <ListState loading={loading.logs} error={errors.logs} empty={!logs.length} retry={() => void load()} />
      {!loading.logs && !errors.logs && logs.length > 0 && <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Tabela rolável de registros técnicos"><table><thead><tr><th>Resultado</th><th>Integração e direção</th><th>Requisição</th><th>Resposta e duração</th><th>Data</th></tr></thead><tbody>{logs.map(log => <tr key={log.id}><td><span className={`${styles.badge} ${log.is_error ? styles.badgeError : styles.badgeSuccess}`}>{log.is_error ? "Erro" : "Registro sem erro"}</span>{log.error_message && <details className={styles.technical}><summary>Ver mensagem técnica</summary><p>{log.error_message}</p></details>}</td><td>{log.integration_name}<small>{log.direction === "in" ? "Entrada registrada" : log.direction === "out" ? "Saída registrada internamente" : log.direction}</small></td><td><code>{log.method || "—"}</code><small className={styles.break}>{log.endpoint || "Sem endereço"}</small></td><td>{number(log.response_status)}<small>{log.duration_ms == null ? "Duração não informada" : `${number(log.duration_ms)} ms`}</small></td><td>{date(log.created_at)}</td></tr>)}</tbody></table></div>}
    </section>}

    {active === "webhooks" && <div className={styles.stack}>
      <section className={styles.panel} aria-labelledby="webhooks-title"><div className={styles.sectionHeading}><div><h3 id="webhooks-title">Webhooks cadastrados</h3><p>O cadastro guarda URL, eventos e limites. Ativar aqui não inicia chamadas externas.</p></div><span className={styles.count}>{loading.webhooks ? "Consultando…" : `${number(webhooks.length)} registros`}</span></div>
        <ListState loading={loading.webhooks} error={errors.webhooks} empty={!webhooks.length} retry={() => void load()} />
        {!loading.webhooks && !errors.webhooks && webhooks.length > 0 && <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Tabela rolável de webhooks"><table><thead><tr><th>Cadastro</th><th>URL e eventos</th><th>Limites</th><th>Situação e ações</th></tr></thead><tbody>{webhooks.map(webhook => <tr key={webhook.id}><td><strong>{webhook.name}</strong><small>Criado em {date(webhook.created_at)}</small></td><td><span className={styles.break}>{webhook.url}</span><small>{webhook.events.length ? webhook.events.join(", ") : "Nenhum evento informado"}</small></td><td>{number(webhook.rate_limit_per_minute)}/min<small>{number(webhook.max_retries)} tentativas · {number(webhook.timeout_ms)} ms</small></td><td><span className={`${styles.badge} ${webhook.is_active ? styles.badgeSuccess : ""}`}>{webhook.is_active ? "Ativo no cadastro" : "Inativo"}</span><div className={styles.rowActions}><button type="button" onClick={() => setDeliveryForm(current => ({ ...current, webhook_id: webhook.id }))}>Selecionar</button><button type="button" disabled={Boolean(saving)} onClick={() => void toggleWebhook(webhook.id, !webhook.is_active)}>{saving === `toggle-${webhook.id}` ? "Salvando…" : webhook.is_active ? "Desativar" : "Ativar"}</button></div></td></tr>)}</tbody></table></div>}
        <details className={styles.formDetails}><summary>Cadastrar webhook</summary><p>O segredo, quando informado, é armazenado como hash. Não é possível recuperá-lo depois. A tela não envia requisições ao endereço cadastrado.</p><form className={styles.form} onSubmit={event => void createWebhook(event)}><div className={styles.formGrid}>
          <Field label="Nome"><input required minLength={3} maxLength={200} value={webhookForm.name} onChange={event => setWebhookForm({ ...webhookForm, name: event.target.value })} /></Field>
          <Field label="URL de destino" help="Endereço cadastrado; não será chamado por esta demonstração."><input required type="url" maxLength={500} value={webhookForm.url} onChange={event => setWebhookForm({ ...webhookForm, url: event.target.value })} /></Field>
          <Field label="Segredo para assinatura (opcional)" help="Use um valor de demonstração. Nunca informe segredo de produção nesta tela."><input type="password" autoComplete="new-password" value={webhookForm.secret} onChange={event => setWebhookForm({ ...webhookForm, secret: event.target.value })} /></Field>
          <Field label="Eventos" help="Separe os nomes por vírgula."><input value={webhookForm.events} onChange={event => setWebhookForm({ ...webhookForm, events: event.target.value })} /></Field>
          <Field label="Limite por minuto"><input type="number" min="1" max="10000" value={webhookForm.rate_limit_per_minute} onChange={event => setWebhookForm({ ...webhookForm, rate_limit_per_minute: Number.parseInt(event.target.value, 10) || 0 })} /></Field>
          <Field label="Máximo de tentativas" help="Parâmetro do cadastro; não há reenvio automático nesta demonstração."><input type="number" min="0" max="10" value={webhookForm.max_retries} onChange={event => setWebhookForm({ ...webhookForm, max_retries: Number.parseInt(event.target.value, 10) || 0 })} /></Field>
          <Field label="Tempo limite (ms)" help="Parâmetro armazenado; não controla uma chamada externa nesta demonstração."><input type="number" min="1000" max="60000" step="1000" value={webhookForm.timeout_ms} onChange={event => setWebhookForm({ ...webhookForm, timeout_ms: Number.parseInt(event.target.value, 10) || 0 })} /></Field>
        </div><button className={styles.primary} type="submit" disabled={Boolean(saving)}>{saving === "webhook" ? "Salvando…" : "Cadastrar configuração"}</button></form></details>
      </section>
      <section className={styles.panel} aria-labelledby="deliveries-title"><div className={styles.sectionHeading}><div><h3 id="deliveries-title">Deliveries registradas</h3><p>O serviço grava uma resposta demonstrativa e um log interno; não faz chamada de rede nem comprova entrega.</p></div><span className={styles.count}>{loading.deliveries ? "Consultando…" : `${number(deliveries.length)} registros`}</span></div>
        <ListState loading={loading.deliveries} error={errors.deliveries} empty={!deliveries.length} retry={() => void load()} />
        {!loading.deliveries && !errors.deliveries && deliveries.length > 0 && <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Tabela rolável de deliveries"><table><thead><tr><th>Evento e situação</th><th>Webhook</th><th>Resposta e tentativas</th><th>Data</th></tr></thead><tbody>{deliveries.map(delivery => <tr key={delivery.id}><td>{delivery.event_type}<small><span className={styles.badge}>{DELIVERY_STATUSES[delivery.status] ?? delivery.status}</span></small>{delivery.error_message && <details className={styles.technical}><summary>Ver detalhe</summary><p>{delivery.error_message}</p></details>}</td><td><code>{delivery.webhook_id}</code></td><td>{number(delivery.response_status)}<small>{number(delivery.retry_count)} tentativas registradas</small></td><td>{date(delivery.created_at)}<small>Data marcada pelo serviço: {date(delivery.delivered_at)}</small></td></tr>)}</tbody></table></div>}
        <details className={styles.formDetails}><summary>Registrar delivery demonstrativa</summary><p>Selecione um webhook ativo. O corpo abaixo é armazenado no registro interno; nenhum sistema externo receberá o evento.</p><form className={styles.form} onSubmit={event => void deliverWebhook(event)}><div className={styles.formGrid}>
          <Field label="Webhook ativo"><select required value={deliveryForm.webhook_id} onChange={event => setDeliveryForm({ ...deliveryForm, webhook_id: event.target.value })}><option value="">Selecione</option>{webhooks.filter(webhook => webhook.is_active).map(webhook => <option key={webhook.id} value={webhook.id}>{webhook.name}</option>)}</select></Field>
          <Field label="Tipo do evento"><input required maxLength={100} value={deliveryForm.event_type} onChange={event => setDeliveryForm({ ...deliveryForm, event_type: event.target.value })} /></Field>
          <Field label="Corpo do evento (JSON)" help="Use dados fictícios. O conteúdo será registrado no banco da demonstração." className={styles.full}><textarea required rows={5} spellCheck={false} value={deliveryForm.payload} onChange={event => setDeliveryForm({ ...deliveryForm, payload: event.target.value })} /></Field>
        </div><button className={styles.primary} type="submit" disabled={Boolean(saving)}>{saving === "delivery" ? "Registrando…" : "Registrar delivery demonstrativa"}</button></form></details>
      </section>
    </div>}

    {active === "reconciliation" && <section className={styles.panel} aria-labelledby="reconciliation-title"><div className={styles.sectionHeading}><div><h3 id="reconciliation-title">Relatórios de conciliação</h3><p>Os totais abaixo são informados pela pessoa que registra. O sistema não consulta nem compara as origens.</p></div><span className={styles.count}>{loading.reports ? "Consultando…" : `${number(reports.length)} registros`}</span></div>
      <ListState loading={loading.reports} error={errors.reports} empty={!reports.length} retry={() => void load()} />
      {!loading.reports && !errors.reports && reports.length > 0 && <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Tabela rolável de relatórios de conciliação"><table><thead><tr><th>Origem → destino</th><th>Totais informados</th><th>Resultado informado</th><th>Criado em</th></tr></thead><tbody>{reports.map(report => <tr key={report.id}><td>{report.source} → {report.target}</td><td>{number(report.total_source)} na origem<small>{number(report.total_target)} no destino</small></td><td>{number(report.matched)} conciliados<small>{number(report.mismatched)} divergências · {number(report.missing_in_target)} ausentes no destino · {number(report.missing_in_source)} ausentes na origem</small></td><td>{date(report.created_at)}</td></tr>)}</tbody></table></div>}
      <details className={styles.formDetails}><summary>Registrar contagens para conciliação</summary><p>Este formulário não executa uma comparação. Registre apenas números obtidos por processo externo e identifique as duas fontes.</p><form className={styles.form} onSubmit={event => void createReport(event)}><div className={styles.formGrid}>
        <Field label="Nome da origem"><input required maxLength={100} value={reconForm.source} onChange={event => setReconForm({ ...reconForm, source: event.target.value })} /></Field><Field label="Nome do destino"><input required maxLength={100} value={reconForm.target} onChange={event => setReconForm({ ...reconForm, target: event.target.value })} /></Field>
        <Field label="Total na origem"><input type="number" min="0" step="1" value={reconForm.total_source} onChange={event => setReconForm({ ...reconForm, total_source: Number.parseInt(event.target.value, 10) || 0 })} /></Field><Field label="Total no destino"><input type="number" min="0" step="1" value={reconForm.total_target} onChange={event => setReconForm({ ...reconForm, total_target: Number.parseInt(event.target.value, 10) || 0 })} /></Field>
        <Field label="Registros correspondentes"><input type="number" min="0" step="1" value={reconForm.matched} onChange={event => setReconForm({ ...reconForm, matched: Number.parseInt(event.target.value, 10) || 0 })} /></Field><Field label="Registros divergentes"><input type="number" min="0" step="1" value={reconForm.mismatched} onChange={event => setReconForm({ ...reconForm, mismatched: Number.parseInt(event.target.value, 10) || 0 })} /></Field>
        <Field label="Ausentes no destino"><input type="number" min="0" step="1" value={reconForm.missing_in_target} onChange={event => setReconForm({ ...reconForm, missing_in_target: Number.parseInt(event.target.value, 10) || 0 })} /></Field><Field label="Ausentes na origem"><input type="number" min="0" step="1" value={reconForm.missing_in_source} onChange={event => setReconForm({ ...reconForm, missing_in_source: Number.parseInt(event.target.value, 10) || 0 })} /></Field>
      </div><button className={styles.primary} type="submit" disabled={Boolean(saving)}>{saving === "report" ? "Registrando…" : "Registrar contagens informadas"}</button></form></details>
    </section>}
  </section>;
}
