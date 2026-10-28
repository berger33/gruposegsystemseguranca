"use client";
// UX-PRO-03 — 3ª promoção "com prova": PLT-16, orçamento operacional,
// métricas de uso e alertas. Antes: protótipo órfão, hex inline, `any`, fetch
// sem verificação de status e um único <p> para qualquer falha. Agora: aba
// real do TiConsole, três contratos preservados, papel admin/ti decidido no
// servidor, fonte/data-base declaradas, drill-down ao registro canônico e
// quatro estados de leitura com retry. Nenhuma permissão, rota ou migração
// mudou. O acknowledge de alerta (PATCH por UUID) também prova a correção E17.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import UiState from "@/components/ui/UiState";
import styles from "./BudgetClient.module.css";

type Budget = {
  id: string; name: string; category: string; period_start: string; period_end: string;
  budgeted_amount: string; actual_amount: string; currency: string;
  alert_threshold_percent: number; is_active: boolean; notes: string | null;
  created_by: string | null; created_at?: string; updated_at?: string;
};
type Metric = {
  id: string; metric: string; category: string; measured_at: string;
  value: string; unit: string; source: string; details: unknown;
};
type Alert = {
  id: string; budget_id: string | null; metric: string; category: string;
  severity: string; title: string; message: string;
  threshold_value: string; current_value: string;
  is_acknowledged: boolean; acknowledged_by: string | null; created_at: string;
};
type ReadState = { kind: "loading" } | { kind: "ready" } | { kind: "denied" } | { kind: "error"; detail: string };

const ENDPOINTS = {
  budgets: "/api/admin/budgets",
  metrics: "/api/admin/usage/metrics",
  alerts: "/api/admin/usage/alerts",
} as const;
const CATS = ["armazenamento", "mensagens", "ia", "banco", "infra", "licencas", "outro"] as const;
const METRICS = ["storage_gb", "messages_count", "ia_tokens", "db_gb", "bandwidth_gb", "cpu_hours", "api_calls", "outro"] as const;

const ERROR_LABELS: Record<string, string> = {
  forbidden: "Sua sessão não tem autorização para consultar orçamentos. Entre com uma conta individual de TI ou administração.",
  unauthorized: "Sua sessão expirou. Entre novamente para consultar os orçamentos.",
  name_min_3: "O nome do orçamento precisa ter pelo menos 3 caracteres.",
  invalid_category: "Selecione uma categoria válida.",
  period_required: "Informe o início e o fim do período.",
  invalid_period: "O período informado não é válido; o fim não pode ser anterior ao início.",
  invalid_budgeted_amount: "Informe um valor orçado válido, maior ou igual a zero.",
  invalid_actual_amount: "Informe um valor de uso válido, maior ou igual a zero.",
  invalid_value: "Informe um valor de métrica válido, maior ou igual a zero.",
  invalid_metric: "Selecione uma métrica válida.",
  invalid_id: "O registro selecionado não é válido. Recarregue a leitura.",
  not_found: "O registro não foi localizado. Recarregue a leitura.",
  no_changes: "Nenhuma alteração foi informada.",
  method_not_allowed: "Esta operação não é permitida pelo servidor.",
};
function translate(code: unknown, status?: number) {
  const key = typeof code === "string" ? code : "";
  if (ERROR_LABELS[key]) return ERROR_LABELS[key];
  if (status === 401 || status === 403) return ERROR_LABELS.forbidden;
  return "Não foi possível concluir a operação. Confira os dados e tente novamente.";
}
function date(value?: string | null) {
  if (!value) return "Não informada";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "Data indisponível" : parsed.toLocaleDateString("pt-BR");
}
function dateTime(value?: string | null) {
  if (!value) return "Não informada";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "Data indisponível" : parsed.toLocaleString("pt-BR");
}
function amount(value: string | number | undefined, currency = "BRL") {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return `${parsed.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}
function percent(actual: string, budgeted: string) {
  const b = Number(budgeted);
  if (!Number.isFinite(b) || b <= 0) return 0;
  return (Number(actual) / b) * 100;
}
function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return <label className={styles.field}><span>{label}</span>{children}{help && <small>{help}</small>}</label>;
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: "include", cache: "no-store", ...init });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { response, data };
}

export default function BudgetClient() {
  const [readState, setReadState] = useState<ReadState>({ kind: "loading" });
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [operationError, setOperationError] = useState("");
  const [usageDraft, setUsageDraft] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ name: "", category: "infra", period_start: "", period_end: "", budgeted_amount: "200", currency: "BRL", alert_threshold_percent: "80", notes: "" });
  const [metricForm, setMetricForm] = useState({ metric: "storage_gb", category: "armazenamento", value: "10", unit: "GB", source: "system" });
  const sequence = useRef(0);
  const operation = useRef(false);

  const clear = useCallback(() => {
    setBudgets([]); setMetrics([]); setAlerts([]); setUsageDraft({});
  }, []);

  // `clearFeedback=false` é usado por mutate: a mensagem de sucesso da
  // operação precisa sobreviver ao reload interno. Já o botão/retry/montagem
  // limpam mensagens e erros antigos para não misturar leituras distintas.
  const load = useCallback(async (clearFeedback = true) => {
    const current = ++sequence.current;
    if (clearFeedback) { setMessage(""); setOperationError(""); }
    setReadState({ kind: "loading" });
    try {
      const [b, m, a] = await Promise.all([
        requestJson(ENDPOINTS.budgets),
        requestJson(ENDPOINTS.metrics),
        requestJson(ENDPOINTS.alerts),
      ]);
      // Resposta fora de ordem: descarta e mantém a leitura mais recente.
      if (current !== sequence.current) return;
      const all = [b, m, a];
      if (all.some(item => item.response.status === 401 || item.response.status === 403)) {
        clear(); setReadState({ kind: "denied" }); return;
      }
      const failed = all.find(item => !item.response.ok);
      if (failed) {
        clear();
        setReadState({ kind: "error", detail: translate(failed.data.error, failed.response.status) });
        return;
      }
      // Payload validado: lista ausente ou inesperada vira vazio honesto.
      setBudgets(Array.isArray(b.data.budgets) ? b.data.budgets as Budget[] : []);
      setMetrics(Array.isArray(m.data.metrics) ? m.data.metrics as Metric[] : []);
      setAlerts(Array.isArray(a.data.alerts) ? a.data.alerts as Alert[] : []);
      setUsageDraft({});
      setReadState({ kind: "ready" });
    } catch {
      if (current !== sequence.current) return;
      clear();
      setReadState({ kind: "error", detail: "Falha de rede ao consultar orçamentos. Verifique a conexão e tente novamente." });
    }
  }, [clear]);

  useEffect(() => { void load(); }, [load]);

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
      if (!response.ok) { setOperationError(translate(data.error, response.status)); return; }
      setMessage(success);
      reset?.();
      await load(false);
    } catch {
      setOperationError("Não foi possível concluir a operação. Confira a conexão e tente novamente.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  const latestPeriod = budgets[0] ? `${date(budgets[0].period_start)} a ${date(budgets[0].period_end)}` : "nenhum período registrado";
  const latestMeasure = metrics[0] ? dateTime(metrics[0].measured_at) : "nenhuma medição registrada";
  const openAlerts = alerts.filter(alert => !alert.is_acknowledged).length;
  const empty = budgets.length === 0 && metrics.length === 0 && alerts.length === 0;
  const feedback = readState.kind === "loading"
    ? <UiState variant="loading" title="Carregando orçamentos" detail="Consultando orçamentos, métricas de uso e alertas." />
    : readState.kind === "denied"
      ? <UiState variant="denied" title="Acesso não autorizado" detail="Esta superfície é restrita a contas individuais de TI ou administração. Nenhum dado foi exposto." onRetry={() => load()} retryLabel="Tentar novamente" />
      : readState.kind === "error"
        ? <UiState variant="error" title="Falha na consulta" detail={readState.detail} onRetry={() => load()} retryLabel="Tentar novamente" />
        : empty
          ? <UiState variant="empty" title="Nenhum orçamento ou métrica" detail="As tabelas estão vazias. Os formulários abaixo registram os primeiros valores informados pelo operador." onRetry={() => load()} retryLabel="Atualizar" />
          : null;

  return (
    <section className={styles.workspace} aria-busy={busy || readState.kind === "loading"}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>PLT-16 · Custos operacionais</p>
          <h2>Orçamento e uso</h2>
          <p>Orçamentos por categoria e período, métricas de uso informadas e alertas gerados pelo servidor quando um limite é atingido.</p>
          <p className={styles.source}>
            Fonte: tabelas <code>operational_budgets</code>, <code>usage_metrics</code> e <code>usage_alerts</code>.
            {" "}Data-base: período do orçamento mais recente <strong>{latestPeriod}</strong>; medição mais recente em <strong>{latestMeasure}</strong>.
            {" "}Alertas em aberto: <strong>{openAlerts}</strong>.
          </p>
        </div>
        <button type="button" onClick={() => load()} disabled={busy || readState.kind === "loading"}>Atualizar leitura</button>
      </header>

      {feedback}
      {message && <p role="status" className={styles.success}>{message}</p>}
      {operationError && <p role="alert" className={styles.error}>{operationError}</p>}

      {readState.kind === "ready" && <>
        <section className={styles.panel} aria-labelledby="budget-list-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="budget-list-title">Orçamentos ({budgets.length})</h3><p>Percentual calculado a partir do valor orçado e do uso informado; o servidor gera o alerta.</p></div>
            <span className={styles.count}>{budgets.length} registro(s)</span>
          </div>
          <ul className={styles.recordList}>
            {budgets.map(budget => {
              const pct = percent(budget.actual_amount, budget.budgeted_amount);
              const reached = pct >= budget.alert_threshold_percent;
              return <li key={budget.id}>
                <strong>{budget.name} · {budget.category}</strong>
                <span>{date(budget.period_start)} a {date(budget.period_end)} · orçado {amount(budget.budgeted_amount, budget.currency)} · uso {amount(budget.actual_amount, budget.currency)}</span>
                <span className={reached ? styles.warning : styles.ok}>
                  {pct.toFixed(1)}% do limite · alerta a partir de {budget.alert_threshold_percent}% · {budget.is_active ? "ativo" : "inativo"}
                </span>
                <span>registrado por {budget.created_by || "não informado"}{budget.notes ? ` · ${budget.notes}` : ""}</span>
                <details className={styles.subsection}><summary>Registro canônico do orçamento (JSON)</summary><pre className={styles.pre}>{JSON.stringify(budget, null, 2)}</pre></details>
                <div className={styles.inlineForm}>
                  <Field label="Novo valor de uso"><input type="number" min={0} step="0.01" value={usageDraft[budget.id] ?? budget.actual_amount} onChange={e => setUsageDraft({ ...usageDraft, [budget.id]: e.target.value })} /></Field>
                  <button type="button" disabled={busy} onClick={() => mutate(
                    ENDPOINTS.budgets, "PATCH",
                    { id: budget.id, actual_amount: Number(usageDraft[budget.id] ?? budget.actual_amount) },
                    "Uso atualizado.",
                  )}>Atualizar uso</button>
                </div>
              </li>;
            })}
          </ul>
          <details className={styles.subsection}>
            <summary>Registrar orçamento</summary>
            <div className={styles.formGrid}>
              <Field label="Nome"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Categoria"><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATS.map(category => <option key={category} value={category}>{category}</option>)}</select></Field>
              <Field label="Início do período"><input type="date" value={form.period_start} onChange={e => setForm({ ...form, period_start: e.target.value })} /></Field>
              <Field label="Fim do período"><input type="date" value={form.period_end} onChange={e => setForm({ ...form, period_end: e.target.value })} /></Field>
              <Field label="Valor orçado"><input type="number" min={0} step="0.01" value={form.budgeted_amount} onChange={e => setForm({ ...form, budgeted_amount: e.target.value })} /></Field>
              <Field label="Moeda"><input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} /></Field>
              <Field label="Limite de alerta (%)"><input type="number" min={1} max={100} value={form.alert_threshold_percent} onChange={e => setForm({ ...form, alert_threshold_percent: e.target.value })} /></Field>
              <div className={styles.full}><Field label="Observações"><textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => mutate(
              ENDPOINTS.budgets, "POST",
              { ...form, budgeted_amount: Number(form.budgeted_amount), alert_threshold_percent: Number(form.alert_threshold_percent) },
              "Orçamento registrado.",
              () => setForm({ name: "", category: "infra", period_start: "", period_end: "", budgeted_amount: "200", currency: "BRL", alert_threshold_percent: "80", notes: "" }),
            )}>Registrar orçamento</button>
          </details>
        </section>

        <section className={styles.panel} aria-labelledby="budget-metrics-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="budget-metrics-title">Métricas de uso ({metrics.length})</h3><p>Valores informados pelo operador; nenhuma coleta automática é feita por esta tela.</p></div>
          </div>
          <ul className={styles.recordList}>
            {metrics.map(metric => <li key={metric.id}>
              <strong>{metric.metric} · {metric.category}</strong>
              <span>{amount(metric.value, metric.unit)} · origem {metric.source} · medido em {dateTime(metric.measured_at)}</span>
              <details className={styles.subsection}><summary>Registro canônico da métrica (JSON)</summary><pre className={styles.pre}>{JSON.stringify(metric, null, 2)}</pre></details>
            </li>)}
          </ul>
          <details className={styles.subsection}>
            <summary>Registrar métrica</summary>
            <div className={styles.formGrid}>
              <Field label="Métrica"><select value={metricForm.metric} onChange={e => setMetricForm({ ...metricForm, metric: e.target.value })}>{METRICS.map(metric => <option key={metric} value={metric}>{metric}</option>)}</select></Field>
              <Field label="Categoria"><select value={metricForm.category} onChange={e => setMetricForm({ ...metricForm, category: e.target.value })}>{CATS.map(category => <option key={category} value={category}>{category}</option>)}</select></Field>
              <Field label="Valor"><input type="number" min={0} step="0.01" value={metricForm.value} onChange={e => setMetricForm({ ...metricForm, value: e.target.value })} /></Field>
              <Field label="Unidade"><input value={metricForm.unit} onChange={e => setMetricForm({ ...metricForm, unit: e.target.value })} /></Field>
              <Field label="Origem"><input value={metricForm.source} onChange={e => setMetricForm({ ...metricForm, source: e.target.value })} /></Field>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => mutate(
              ENDPOINTS.metrics, "POST",
              { ...metricForm, value: Number(metricForm.value) },
              "Métrica registrada.",
            )}>Registrar métrica</button>
          </details>
        </section>

        <section className={styles.panel} aria-labelledby="budget-alerts-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="budget-alerts-title">Alertas ({alerts.length})</h3><p>Gerados pelo servidor quando uso ou métrica atingem o limite; o reconhecimento é auditado.</p></div>
            <span className={styles.count}>{openAlerts} em aberto</span>
          </div>
          <ul className={styles.recordList}>
            {alerts.map(alert => <li key={alert.id}>
              <strong className={alert.severity === "critical" ? styles.critical : styles.warning}>{alert.severity} · {alert.title}</strong>
              <span>{alert.message}</span>
              <span>{alert.category} · {alert.metric} · atual {alert.current_value} · limite {alert.threshold_value} · criado em {dateTime(alert.created_at)}</span>
              <span>{alert.is_acknowledged ? `reconhecido por ${alert.acknowledged_by || "não informado"}` : "em aberto"}</span>
              <details className={styles.subsection}><summary>Registro canônico do alerta (JSON)</summary><pre className={styles.pre}>{JSON.stringify(alert, null, 2)}</pre></details>
              {!alert.is_acknowledged && <div className={styles.actions}>
                <button type="button" disabled={busy} onClick={() => mutate(
                  ENDPOINTS.alerts, "PATCH", { id: alert.id }, "Alerta reconhecido.",
                )}>Reconhecer alerta</button>
              </div>}
            </li>)}
          </ul>
        </section>

        <section className={styles.panel}>
          <h3>Limites e decisões pendentes</h3>
          <p className={styles.note}>
            Os cinco orçamentos semeados pela migração 054 são <strong>planejamento sintético</strong>: não são fatura, contrato, cobrança nem limite aprovado. A referência a um teto de hospedagem é apenas anotação histórica — o <strong>teto de hospedagem</strong>, os provedores e o orçamento real dependem de <strong>decisão do proprietário</strong> e seguem em aberto. Esta tela não contrata provedor, não envia mensagem e não executa cobrança; ela apenas registra valores informados e os alertas deles derivados.
          </p>
        </section>
      </>}
    </section>
  );
}
