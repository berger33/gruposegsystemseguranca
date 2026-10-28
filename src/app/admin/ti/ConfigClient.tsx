"use client";
// UX-PRO-03 — 6ª promoção "com prova": PLT-13, gestão de configurações,
// flags, manutenção, rollout e reversão, com negócio separado de
// infraestrutura. Antes: protótipo órfão, hex inline, `any`, JSON.parse sem
// tratamento, fetch sem verificação de status e um único <p> para qualquer
// falha. Agora: 18ª aba real do TiConsole, quatro contratos preservados,
// papel admin/ti no servidor, segredo declarado como mascarado,
// fonte/data-base, drill-down ao registro canônico, quatro estados de leitura
// com retry e aviso de que esta tela é INVENTÁRIO DECLARATIVO — não ativa
// produção, não liga provedor e não substitui decisão do proprietário.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import UiState from "@/components/ui/UiState";
import styles from "./ConfigClient.module.css";

type Flag = {
  id: string; key: string; category: string; status: string;
  value: unknown; default_value?: unknown; description: string;
  is_secret: boolean; is_business: boolean; environment: string;
  rollout_percentage: number; allowed_roles?: unknown;
  created_by?: string | null; created_at?: string; updated_at?: string;
};
type FlagHistory = {
  id: string; previous_value: unknown; next_value: unknown;
  previous_status: string | null; next_status: string | null;
  reason: string | null; changed_by: string | null; created_at: string;
};
type Maintenance = {
  id: string; title: string; description: string; status: string;
  scheduled_start: string; scheduled_end: string;
  actual_start: string | null; actual_end: string | null;
  affected_services: string[] | null; is_business_impact: boolean;
  rollback_plan: string | null; created_at?: string;
};
type Rollout = {
  id: string; flag_id: string | null; title: string; description: string;
  status: string; current_percentage: number; target_percentage: number;
  steps: unknown; approved_by: string | null; created_at: string;
};
type ReadState = { kind: "loading" } | { kind: "ready" } | { kind: "denied" } | { kind: "error"; detail: string };

const ENDPOINTS = {
  flags: "/api/admin/config/flags",
  maintenance: "/api/admin/config/maintenance",
  rollouts: "/api/admin/config/rollouts",
} as const;

const CATS = ["negocio", "infra", "seguranca", "operacao", "comercial", "financeiro", "rh", "outro"] as const;
const STATS = ["ativo", "inativo", "em_teste", "depreciado"] as const;
const ENVS = ["all", "development", "homologation", "production"] as const;
const MAINT_STATS = ["agendado", "em_execucao", "concluido", "cancelado", "falha"] as const;

const ERROR_LABELS: Record<string, string> = {
  forbidden: "Sua sessão não tem autorização para consultar configurações. Entre com uma conta individual de TI ou administração.",
  unauthorized: "Sua sessão expirou. Entre novamente para consultar as configurações.",
  same_origin_required: "A requisição precisa partir da mesma origem do sistema.",
  value_must_be_object: "O valor da flag precisa ser um objeto JSON.",
  key_min_3: "A chave da flag precisa ter pelo menos 3 caracteres.",
  invalid_category: "Selecione uma categoria válida (negócio ou infraestrutura).",
  invalid_status: "Selecione um status válido.",
  description_min_10: "A descrição precisa ter pelo menos 10 caracteres.",
  description_min_20: "A descrição precisa ter pelo menos 20 caracteres.",
  invalid_env: "Selecione um ambiente válido.",
  invalid_rollout_percentage: "O percentual de rollout precisa estar entre 0 e 100.",
  invalid_target_percentage: "O percentual alvo precisa estar entre 0 e 100.",
  invalid_current_percentage: "O percentual atual precisa estar entre 0 e 100.",
  secret_cannot_be_business: "Uma flag secreta de infraestrutura não pode ser marcada como regra de negócio.",
  invalid_id: "O registro selecionado não é válido. Recarregue a leitura.",
  invalid_flag_id: "A flag vinculada não é um identificador válido.",
  not_found: "O registro não foi localizado. Recarregue a leitura.",
  no_changes: "Nenhuma alteração foi informada.",
  title_min_10: "O título precisa ter pelo menos 10 caracteres.",
  schedule_required: "Informe o início e o fim da janela de manutenção.",
  invalid_schedule: "O fim da janela precisa ser posterior ao início.",
  invalid_transition: "Esta transição de status não é permitida pelo servidor.",
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
function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return <label className={styles.field}><span>{label}</span>{children}{help && <small>{help}</small>}</label>;
}
function parseObject(raw: string): { ok: true; value: Record<string, unknown> } | { ok: false } {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false };
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch { return { ok: false }; }
}
function parseArray(raw: string): unknown[] {
  try { const parsed = JSON.parse(raw) as unknown; return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: "include", cache: "no-store", ...init });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { response, data };
}

export default function ConfigClient() {
  const [readState, setReadState] = useState<ReadState>({ kind: "loading" });
  const [flags, setFlags] = useState<Flag[]>([]);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [rollouts, setRollouts] = useState<Rollout[]>([]);
  const [selected, setSelected] = useState<Flag | null>(null);
  const [history, setHistory] = useState<FlagHistory[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [operationError, setOperationError] = useState("");
  const [flagForm, setFlagForm] = useState({
    key: "", category: "negocio", status: "ativo", description: "",
    environment: "development", is_secret: false, is_business: true,
    rollout_percentage: "100", value: '{"enabled": true}',
  });
  const [flagUpdate, setFlagUpdate] = useState({ status: "", rollout_percentage: "", value: "", reason: "" });
  const [maintForm, setMaintForm] = useState({
    title: "", description: "", scheduled_start: "", scheduled_end: "",
    affected_services: "", is_business_impact: false, rollback_plan: "",
  });
  const [rolloutForm, setRolloutForm] = useState({
    flag_id: "", title: "", description: "", target_percentage: "100", steps: "[]",
  });
  const sequence = useRef(0);
  const operation = useRef(false);

  const clear = useCallback(() => {
    setFlags([]); setMaintenances([]); setRollouts([]);
    setSelected(null); setHistory([]);
  }, []);

  const load = useCallback(async (clearFeedback = true) => {
    const current = ++sequence.current;
    // Recarregar/remontar limpa também a seleção: uma flag que deixou de
    // existir no banco (troca de estado A → B) não pode sobrar na tela.
    // `load(false)` (após mutate) preserva o detalhe recém-atualizado.
    if (clearFeedback) { setMessage(""); setOperationError(""); setSelected(null); setHistory([]); }
    setReadState({ kind: "loading" });
    try {
      const [f, m, r] = await Promise.all([
        requestJson(ENDPOINTS.flags),
        requestJson(ENDPOINTS.maintenance),
        requestJson(ENDPOINTS.rollouts),
      ]);
      // Resposta fora de ordem: descarta e mantém a leitura mais recente.
      if (current !== sequence.current) return;
      const all = [f, m, r];
      if (all.some(item => item.response.status === 401 || item.response.status === 403)) {
        clear(); setReadState({ kind: "denied" }); return;
      }
      const failed = all.find(item => !item.response.ok);
      if (failed) {
        clear();
        setReadState({ kind: "error", detail: translate(failed.data.error, failed.response.status) });
        return;
      }
      setFlags(Array.isArray(f.data.flags) ? f.data.flags as Flag[] : []);
      setMaintenances(Array.isArray(m.data.maintenances) ? m.data.maintenances as Maintenance[] : []);
      setRollouts(Array.isArray(r.data.rollouts) ? r.data.rollouts as Rollout[] : []);
      setReadState({ kind: "ready" });
    } catch {
      if (current !== sequence.current) return;
      clear();
      setReadState({ kind: "error", detail: "Falha de rede ao consultar configurações. Verifique a conexão e tente novamente." });
    }
  }, [clear]);

  useEffect(() => { void load(); }, [load]);

  const openFlag = useCallback(async (id: string) => {
    try {
      const { response, data } = await requestJson(`${ENDPOINTS.flags}/${id}`);
      if (!response.ok) { setOperationError(translate(data.error, response.status)); return; }
      const flag = data.flag as Flag | undefined;
      if (!flag || typeof flag.id !== "string") { setOperationError("O detalhe da flag não pôde ser validado."); return; }
      setSelected(flag);
      setHistory(Array.isArray(data.history) ? data.history as FlagHistory[] : []);
      setFlagUpdate({ status: "", rollout_percentage: "", value: "", reason: "" });
    } catch {
      setOperationError("Não foi possível abrir o detalhe da flag. Tente novamente.");
    }
  }, []);

  async function mutate(path: string, method: "POST" | "PATCH", body: unknown, success: string, reset?: () => void, after?: () => Promise<void>) {
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
      await after?.();
      await load(false);
    } catch {
      setOperationError("Não foi possível concluir a operação. Confira a conexão e tente novamente.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  const businessFlags = flags.filter(flag => flag.is_business).length;
  const infraFlags = flags.length - businessFlags;
  const productionFlags = flags.filter(flag => flag.environment === "production").length;
  const latestFlag = flags.reduce<string | null>((acc, flag) => !acc || (flag.updated_at || "") > acc ? (flag.updated_at || acc) : acc, null);
  const latestMaint = maintenances[0]?.scheduled_start ?? null;
  const latestRollout = rollouts[0]?.created_at ?? null;
  const empty = flags.length === 0 && maintenances.length === 0 && rollouts.length === 0;
  const feedback = readState.kind === "loading"
    ? <UiState variant="loading" title="Carregando configurações" detail="Consultando flags, janelas de manutenção e planos de rollout." />
    : readState.kind === "denied"
      ? <UiState variant="denied" title="Acesso não autorizado" detail="Esta superfície é restrita a contas individuais de TI ou administração. Nenhum dado foi exposto." onRetry={() => load()} retryLabel="Tentar novamente" />
      : readState.kind === "error"
        ? <UiState variant="error" title="Falha na consulta" detail={readState.detail} onRetry={() => load()} retryLabel="Tentar novamente" />
        : empty
          ? <UiState variant="empty" title="Nenhuma configuração registrada" detail="As tabelas estão vazias. Os formulários abaixo registram as primeiras flags, janelas e planos informados pelo operador." onRetry={() => load()} retryLabel="Atualizar" />
          : null;

  return (
    <section className={styles.workspace} aria-busy={busy || readState.kind === "loading"}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>PLT-13 · Configuração e mudança</p>
          <h2>Configurações e rollout</h2>
          <p>Flags com <strong>negócio separado de infraestrutura</strong>, janelas de manutenção, planos de rollout e reversão auditada por histórico.</p>
          <p className={styles.source}>
            Fonte: tabelas <code>config_flags</code>, <code>config_history</code>, <code>maintenance_windows</code> e <code>rollout_plans</code>.
            {" "}Data-base: flag atualizada em <strong>{dateTime(latestFlag)}</strong>; janela mais recente em <strong>{dateTime(latestMaint)}</strong>; rollout mais recente em <strong>{dateTime(latestRollout)}</strong>.
            {" "}Negócio <strong>{businessFlags}</strong> · infra <strong>{infraFlags}</strong> · ambiente produção <strong>{productionFlags}</strong>.
          </p>
        </div>
        <button type="button" onClick={() => load()} disabled={busy || readState.kind === "loading"}>Atualizar leitura</button>
      </header>

      {feedback}
      {message && <p role="status" className={styles.success}>{message}</p>}
      {operationError && <p role="alert" className={styles.error}>{operationError}</p>}

      {readState.kind === "ready" && <>
        <section className={styles.panel} aria-labelledby="config-flags-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="config-flags-title">Flags ({flags.length})</h3><p>Valores secretos são <strong>mascarados pelo servidor</strong>; esta tela nunca exibe o conteúdo de uma flag secreta.</p></div>
            <span className={styles.count}>{productionFlags} em produção</span>
          </div>
          <ul className={styles.recordList}>
            {flags.map(flag => <li key={flag.id}>
              <strong>{flag.is_business ? "[NEGÓCIO]" : "[INFRA]"} {flag.key}</strong>
              <span>{flag.category} · {flag.status} · ambiente {flag.environment} · rollout {flag.rollout_percentage}%</span>
              <span>{flag.is_secret ? "valor secreto mascarado pelo servidor" : `valor ${JSON.stringify(flag.value)}`}</span>
              <span>{flag.description}</span>
              <span>registrada por {flag.created_by || "não informado"} · atualizada em {dateTime(flag.updated_at)}</span>
              <details className={styles.subsection}><summary>Registro canônico da flag (JSON)</summary><pre className={styles.pre}>{JSON.stringify(flag, null, 2)}</pre></details>
              <div className={styles.actions}>
                <button type="button" disabled={busy} onClick={() => void openFlag(flag.id)}>Abrir flag</button>
              </div>
            </li>)}
          </ul>
          <details className={styles.subsection}>
            <summary>Registrar flag</summary>
            <div className={styles.formGrid}>
              <Field label="Chave da flag"><input value={flagForm.key} onChange={e => setFlagForm({ ...flagForm, key: e.target.value })} /></Field>
              <Field label="Categoria"><select value={flagForm.category} onChange={e => setFlagForm({ ...flagForm, category: e.target.value })}>{CATS.map(category => <option key={category} value={category}>{category}</option>)}</select></Field>
              <Field label="Status"><select value={flagForm.status} onChange={e => setFlagForm({ ...flagForm, status: e.target.value })}>{STATS.map(status => <option key={status} value={status}>{status}</option>)}</select></Field>
              <Field label="Ambiente" help="Registro declarativo; não conecta nem ativa o ambiente."><select value={flagForm.environment} onChange={e => setFlagForm({ ...flagForm, environment: e.target.value })}>{ENVS.map(env => <option key={env} value={env}>{env}</option>)}</select></Field>
              <Field label="Percentual de rollout"><input type="number" min={0} max={100} value={flagForm.rollout_percentage} onChange={e => setFlagForm({ ...flagForm, rollout_percentage: e.target.value })} /></Field>
              <div className={styles.full}><Field label="Descrição da flag" help="Mínimo de 10 caracteres."><textarea rows={2} value={flagForm.description} onChange={e => setFlagForm({ ...flagForm, description: e.target.value })} /></Field></div>
              <div className={styles.full}><Field label="Valor (objeto JSON)" help='Ex.: {"enabled": true}'><textarea rows={2} value={flagForm.value} onChange={e => setFlagForm({ ...flagForm, value: e.target.value })} /></Field></div>
              <div className={styles.full}><label className={styles.field}><span>Regra de negócio (is_business)</span><input type="checkbox" checked={flagForm.is_business} onChange={e => setFlagForm({ ...flagForm, is_business: e.target.checked })} /></label></div>
              <div className={styles.full}><label className={styles.field}><span>Segredo de infraestrutura (is_secret)</span><input type="checkbox" checked={flagForm.is_secret} onChange={e => setFlagForm({ ...flagForm, is_secret: e.target.checked })} /></label></div>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => {
              const parsed = parseObject(flagForm.value);
              if (!parsed.ok) { setOperationError("O valor da flag precisa ser um objeto JSON válido."); return; }
              void mutate(ENDPOINTS.flags, "POST", {
                ...flagForm, value: parsed.value, rollout_percentage: Number(flagForm.rollout_percentage),
              }, "Flag registrada no inventário.", () => setFlagForm({
                key: "", category: "negocio", status: "ativo", description: "", environment: "development",
                is_secret: false, is_business: true, rollout_percentage: "100", value: '{"enabled": true}',
              }));
            }}>Salvar flag</button>
          </details>

          {selected && <section className={styles.panel} aria-labelledby="config-selected-title">
            <div className={styles.sectionHeading}>
              <div><h3 id="config-selected-title">Flag selecionada: {selected.key}</h3><p>Histórico de alterações com reversão para o valor anterior.</p></div>
            </div>
            <details className={styles.subsection}>
              <summary>Atualizar flag</summary>
              <div className={styles.formGrid}>
                <Field label="Novo status"><select value={flagUpdate.status} onChange={e => setFlagUpdate({ ...flagUpdate, status: e.target.value })}><option value="">manter status</option>{STATS.map(status => <option key={status} value={status}>{status}</option>)}</select></Field>
                <Field label="Novo rollout (%)"><input type="number" min={0} max={100} value={flagUpdate.rollout_percentage} onChange={e => setFlagUpdate({ ...flagUpdate, rollout_percentage: e.target.value })} /></Field>
                <Field label="Motivo da alteração"><input value={flagUpdate.reason} onChange={e => setFlagUpdate({ ...flagUpdate, reason: e.target.value })} /></Field>
                <div className={styles.full}><Field label="Novo valor (objeto JSON, opcional)" help="Deixe vazio para manter o valor atual."><textarea rows={2} value={flagUpdate.value} onChange={e => setFlagUpdate({ ...flagUpdate, value: e.target.value })} /></Field></div>
              </div>
              <button type="button" className={styles.primary} disabled={busy} onClick={() => {
                const payload: Record<string, unknown> = {};
                if (flagUpdate.status) payload.status = flagUpdate.status;
                if (flagUpdate.rollout_percentage) payload.rollout_percentage = Number(flagUpdate.rollout_percentage);
                if (flagUpdate.reason) payload.reason = flagUpdate.reason;
                if (flagUpdate.value) {
                  const parsed = parseObject(flagUpdate.value);
                  if (!parsed.ok) { setOperationError("O novo valor precisa ser um objeto JSON válido."); return; }
                  payload.value = parsed.value;
                }
                if (Object.keys(payload).length === 0) { setOperationError("Nenhuma alteração foi informada."); return; }
                void mutate(`${ENDPOINTS.flags}/${selected.id}`, "PATCH", payload,
                  "Flag atualizada com histórico registrado.", undefined, () => openFlag(selected.id));
              }}>Atualizar flag</button>
            </details>
            <h4>Histórico ({history.length}) — reversão auditada</h4>
            <ul className={styles.recordList}>
              {history.map(item => <li key={item.id}>
                <strong>{item.previous_status || "—"} → {item.next_status || "—"}</strong>
                <span>alterado por {item.changed_by || "não informado"} em {dateTime(item.created_at)} · {item.reason || "sem motivo"}</span>
                <details className={styles.subsection}><summary>Registro canônico do histórico (JSON)</summary><pre className={styles.pre}>{JSON.stringify(item, null, 2)}</pre></details>
                <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void mutate(
                  `${ENDPOINTS.flags}/${selected.id}`, "POST",
                  { history_id: item.id, reason: "Reversão pelo console de TI" },
                  "Flag revertida ao valor anterior do histórico.", undefined, () => openFlag(selected.id),
                )}>Reverter ao histórico</button></div>
              </li>)}
            </ul>
          </section>}
        </section>

        <section className={styles.panel} aria-labelledby="config-maint-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="config-maint-title">Janelas de manutenção ({maintenances.length})</h3><p>Agendamento com plano de reversão declarado e transições decididas no servidor.</p></div>
          </div>
          <ul className={styles.recordList}>
            {maintenances.map(item => <li key={item.id}>
              <strong>{item.status} · {item.title}</strong>
              <span>{dateTime(item.scheduled_start)} → {dateTime(item.scheduled_end)} · {item.is_business_impact ? "impacto ao negócio" : "sem impacto declarado"}</span>
              <span>serviços: {(item.affected_services || []).join(", ") || "não informados"}</span>
              <span>rollback_plan: {item.rollback_plan || "não informado"}</span>
              <details className={styles.subsection}><summary>Registro canônico da janela (JSON)</summary><pre className={styles.pre}>{JSON.stringify(item, null, 2)}</pre></details>
              <div className={styles.actions}>
                {MAINT_STATS.filter(status => ["em_execucao", "concluido", "cancelado"].includes(status)).map(status =>
                  <button key={status} type="button" disabled={busy} onClick={() => void mutate(
                    ENDPOINTS.maintenance, "PATCH",
                    { id: item.id, next_status: status, reason: `Mudança para ${status} pelo console de TI` },
                    `Janela marcada como ${status}.`,
                  )}>{status === "em_execucao" ? "Iniciar manutenção" : status === "concluido" ? "Concluir manutenção" : "Cancelar manutenção"}</button>)}
              </div>
            </li>)}
          </ul>
          <details className={styles.subsection}>
            <summary>Agendar manutenção</summary>
            <div className={styles.formGrid}>
              <Field label="Título da janela" help="Mínimo de 10 caracteres."><input value={maintForm.title} onChange={e => setMaintForm({ ...maintForm, title: e.target.value })} /></Field>
              <Field label="Serviços afetados" help="Separados por vírgula."><input value={maintForm.affected_services} onChange={e => setMaintForm({ ...maintForm, affected_services: e.target.value })} /></Field>
              <Field label="Início da janela"><input type="datetime-local" value={maintForm.scheduled_start} onChange={e => setMaintForm({ ...maintForm, scheduled_start: e.target.value })} /></Field>
              <Field label="Fim da janela"><input type="datetime-local" value={maintForm.scheduled_end} onChange={e => setMaintForm({ ...maintForm, scheduled_end: e.target.value })} /></Field>
              <div className={styles.full}><Field label="Descrição da janela" help="Mínimo de 20 caracteres."><textarea rows={2} value={maintForm.description} onChange={e => setMaintForm({ ...maintForm, description: e.target.value })} /></Field></div>
              <div className={styles.full}><Field label="Plano de reversão"><textarea rows={2} value={maintForm.rollback_plan} onChange={e => setMaintForm({ ...maintForm, rollback_plan: e.target.value })} /></Field></div>
              <div className={styles.full}><label className={styles.field}><span>Impacto ao negócio</span><input type="checkbox" checked={maintForm.is_business_impact} onChange={e => setMaintForm({ ...maintForm, is_business_impact: e.target.checked })} /></label></div>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void mutate(
              ENDPOINTS.maintenance, "POST",
              { ...maintForm, affected_services: maintForm.affected_services.split(",").map(value => value.trim()).filter(Boolean) },
              "Janela de manutenção agendada.", () => setMaintForm({
                title: "", description: "", scheduled_start: "", scheduled_end: "",
                affected_services: "", is_business_impact: false, rollback_plan: "",
              }),
            )}>Agendar manutenção</button>
          </details>
        </section>

        <section className={styles.panel} aria-labelledby="config-rollout-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="config-rollout-title">Planos de rollout ({rollouts.length})</h3><p>Aprovação, execução por percentual e reversão com restauração do valor anterior da flag.</p></div>
          </div>
          <ul className={styles.recordList}>
            {rollouts.map(item => <li key={item.id}>
              <strong>{item.status} · {item.title}</strong>
              <span>atual {item.current_percentage}% → alvo {item.target_percentage}% · aprovado por {item.approved_by || "não informado"}</span>
              <span>flag vinculada {item.flag_id || "nenhuma"} · criado em {dateTime(item.created_at)}</span>
              <details className={styles.subsection}><summary>Registro canônico do rollout (JSON)</summary><pre className={styles.pre}>{JSON.stringify(item, null, 2)}</pre></details>
              <div className={styles.actions}>
                <button type="button" disabled={busy} onClick={() => void mutate(ENDPOINTS.rollouts, "PATCH",
                  { id: item.id, next_status: "aprovado", reason: "Aprovação pelo console de TI" },
                  "Rollout aprovado.")}>Aprovar rollout</button>
                <button type="button" disabled={busy} onClick={() => void mutate(ENDPOINTS.rollouts, "PATCH",
                  { id: item.id, next_status: "em_rollout", current_percentage: 50, reason: "Execução em 50% pelo console de TI" },
                  "Rollout em execução (50%).")}>Rollout 50%</button>
                <button type="button" disabled={busy} onClick={() => void mutate(ENDPOINTS.rollouts, "PATCH",
                  { id: item.id, next_status: "concluido", current_percentage: 100, reason: "Conclusão pelo console de TI" },
                  "Rollout concluído.")}>Concluir rollout</button>
                <button type="button" disabled={busy} onClick={() => void mutate(ENDPOINTS.rollouts, "PATCH",
                  { id: item.id, next_status: "revertido", reason: "Reversão pelo console de TI" },
                  "Rollout revertido ao valor anterior.")}>Reverter rollout</button>
              </div>
            </li>)}
          </ul>
          <details className={styles.subsection}>
            <summary>Criar plano de rollout</summary>
            <div className={styles.formGrid}>
              <Field label="Flag vinculada (UUID, opcional)"><input value={rolloutForm.flag_id} onChange={e => setRolloutForm({ ...rolloutForm, flag_id: e.target.value })} /></Field>
              <Field label="Percentual alvo"><input type="number" min={0} max={100} value={rolloutForm.target_percentage} onChange={e => setRolloutForm({ ...rolloutForm, target_percentage: e.target.value })} /></Field>
              <Field label="Título do rollout" help="Mínimo de 10 caracteres."><input value={rolloutForm.title} onChange={e => setRolloutForm({ ...rolloutForm, title: e.target.value })} /></Field>
              <div className={styles.full}><Field label="Descrição do rollout" help="Mínimo de 20 caracteres."><textarea rows={2} value={rolloutForm.description} onChange={e => setRolloutForm({ ...rolloutForm, description: e.target.value })} /></Field></div>
              <div className={styles.full}><Field label="Etapas (JSON, opcional)" help='Ex.: [{"pct":25,"desc":"25%"}]'><textarea rows={2} value={rolloutForm.steps} onChange={e => setRolloutForm({ ...rolloutForm, steps: e.target.value })} /></Field></div>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void mutate(
              ENDPOINTS.rollouts, "POST",
              {
                ...rolloutForm, flag_id: rolloutForm.flag_id || null,
                target_percentage: Number(rolloutForm.target_percentage), steps: parseArray(rolloutForm.steps),
              },
              "Plano de rollout criado.", () => setRolloutForm({ flag_id: "", title: "", description: "", target_percentage: "100", steps: "[]" }),
            )}>Criar plano de rollout</button>
          </details>
        </section>

        <section className={styles.panel}>
          <h3>Limites e decisões pendentes</h3>
          <p className={styles.note}>
            Esta tela é um <strong>inventário declarativo</strong>: registra flags, janelas e planos no banco, mas <strong>não ativa produção</strong>, não conecta provedores, não altera tráfego real e não publica mudança. O campo <code>environment</code> é uma anotação de destino, não uma conexão ativa. Flags secretas têm o valor <strong>mascarado pelo servidor</strong>; nunca armazene segredo real sem cofre e decisão do proprietário. Rollout, reversão, janela de manutenção e ativação em produção dependem de aprovação e <strong>decisão do proprietário</strong>. <strong>Produção: NO-GO.</strong>
          </p>
        </section>
      </>}
    </section>
  );
}
