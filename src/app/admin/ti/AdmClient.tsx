"use client";

// ADM-01..06 — pauta do dia, retratos comercial/operacional/financeiro, risco
// de renovação e aprovação unificada. A tela preserva as seis escritas do
// protótipo e acrescenta as transições que a API já autorizava (situação da
// pauta, revisão do risco e decisão da aprovação), além do histórico da
// aprovação. Papel e origem continuam sendo decididos no servidor: a interface
// não concede acesso que o handler não conceda.
import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import UiState from "@/components/ui/UiState";
import styles from "./AdmClient.module.css";

type Row = Record<string, unknown>;
type ReadState = { kind: "loading" } | { kind: "ready" } | { kind: "denied" } | { kind: "error"; detail: string };
type FamilyKey = "myDay" | "commercial" | "operational" | "financial" | "risks" | "approvals";

const FAMILIES = ["myDay", "commercial", "operational", "financial", "risks", "approvals"] as const;
const ENDPOINTS: Record<FamilyKey | "approvalHistory", string> = {
  myDay: "/api/adm/my-day",
  commercial: "/api/adm/commercial-snapshots",
  operational: "/api/adm/operational-snapshots",
  financial: "/api/adm/financial-snapshots",
  risks: "/api/adm/renewal-risks",
  approvals: "/api/adm/approvals",
  approvalHistory: "/api/adm/approval-history",
};
const LIST_KEYS: Record<FamilyKey, string> = {
  myDay: "items", commercial: "snapshots", operational: "snapshots",
  financial: "snapshots", risks: "risks", approvals: "approvals",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NEW_MY_DAY = { title: "", description: "", priority: "media", responsible_name: "", action_type: "", due_date: "", source_module: "adm" };
const NEW_COMMERCIAL = { snapshot_date: "", new_leads_count: "", stalled_opportunities_count: "", proposals_count: "", total_value_cents: "", notes: "" };
const NEW_OPERATIONAL = { snapshot_date: "", coverage_required_hours: "", coverage_covered_hours: "", critical_occurrences_count: "", sla_breach_count: "", implantation_pending_count: "", notes: "" };
const NEW_FINANCIAL = { competence_date: "", source: "geral", total_receivables_cents: "", total_payables_cents: "", overdue_cents: "", upcoming_cents: "", notes: "" };
const NEW_RISK = { contract_id: "", client_account_id: "", renewal_date: "", risk_level: "medio", risk_score: "0", justification: "", reincidence_count: "0", is_justified: true };
const NEW_APPROVAL = { approval_type: "desconto", amount_cents: "", threshold_cents: "", requester_name: "", scope: "", reason: "" };
const NEW_DECISION = { approval_id: "", status: "aprovado", approver_identity: "", approver_name: "", reason: "" };

// Motivos medidos no servidor (PostgreSQL 17 descartável) e traduzidos aqui
// para o operador nunca ler o código cru nem a mensagem SQL.
const ERROR_LABELS: Record<string, string> = {
  unauthorized: "A sessão não tem acesso a esta operação. Entre novamente com uma conta autorizada.",
  forbidden: "Seu papel não acessa este painel. A leitura e a escrita são decididas no servidor.",
  forbidden_origin: "A escrita precisa partir deste site. Recarregue a página e tente novamente.",
  invalid_json: "O servidor não entendeu o pedido. Recarregue a página e tente novamente.",
  id_required: "Selecione um registro antes de atualizar a situação.",
  not_found: "O registro não foi encontrado. Atualize a lista antes de tentar novamente.",
  method_not_allowed: "O servidor não aceita esta operação para o recurso solicitado.",
  title_5_200: "O título precisa ter entre 5 e 200 caracteres.",
  description_10_1000: "A descrição precisa ter entre 10 e 1000 caracteres.",
  responsible_name_2_200: "O nome da pessoa responsável precisa ter entre 2 e 200 caracteres.",
  action_type_3_100: "O tipo de ação precisa ter entre 3 e 100 caracteres.",
  invalid_priority: "Escolha uma prioridade entre baixa, média, alta e crítica.",
  invalid_status: "A situação escolhida não é aceita pelo servidor.",
  invalid_source_module: "Escolha um módulo de origem aceito pelo servidor.",
  invalid_due_date: "Informe o vencimento como uma data válida ou deixe o campo vazio.",
  duplicate_snapshot_date: "Já existe um retrato para esta data. Escolha outra data.",
  duplicate_competence_source: "Já existe um retrato desta fonte para esta competência.",
  duplicate: "Este registro já existe. Ajuste os dados e tente novamente.",
  notes_10_1000: "A observação precisa ter entre 10 e 1000 caracteres ou ficar vazia.",
  competence_date_required: "Informe a competência do retrato financeiro.",
  source_3_100: "A fonte do retrato financeiro precisa ter entre 3 e 100 caracteres.",
  renewal_date_required: "Informe a data prevista de renovação.",
  invalid_renewal_date: "Informe a renovação como uma data válida.",
  justification_10_1000_required_risco_perda_justificado: "A justificativa do risco precisa ter entre 10 e 1000 caracteres.",
  justification_required_when_justified: "Marque a justificativa para registrar o risco como justificado.",
  risk_score_0_100: "A pontuação de risco precisa estar entre 0 e 100.",
  invalid_risk_level: "Escolha um nível de risco entre baixo, médio, alto e crítico.",
  invalid_reincidence_count: "A reincidência precisa ser um número inteiro de 0 em diante.",
  invalid_contract_id: "O identificador do contrato precisa ser um UUID válido ou ficar vazio.",
  invalid_client_account_id: "O identificador da conta precisa ser um UUID válido ou ficar vazio.",
  invalid_reference: "O identificador informado não existe no cadastro.",
  requester_name_2_200: "O nome de quem solicita precisa ter entre 2 e 200 caracteres.",
  reason_10_1000: "O motivo precisa ter entre 10 e 1000 caracteres ou ficar vazio.",
  reason_10_1000_required: "Toda decisão de aprovação exige um motivo entre 10 e 1000 caracteres.",
  scope_3_200: "O escopo precisa ter entre 3 e 200 caracteres ou ficar vazio.",
  invalid_approval_type: "Escolha um tipo de aprovação aceito pelo servidor.",
  amount_cents_gte_0: "O valor precisa ser um número inteiro de 0 em diante, em centavos.",
  threshold_cents_gte_0: "A alçada precisa ser um número inteiro de 0 em diante, em centavos.",
  approver_required_above_threshold_alcada: "Acima da alçada, o aprovador é obrigatório: registre a aprovação dentro da alçada ou informe o aprovador na decisão.",
  invalid_reference_id: "O identificador da referência precisa ser um UUID válido ou ficar vazio.",
  invalid_reference_type: "O tipo da referência precisa ter entre 3 e 100 caracteres ou ficar vazio.",
  status_required: "Escolha a situação de destino da aprovação.",
  invalid_approver_identity: "O identificador do aprovador precisa ser um UUID válido ou ficar vazio.",
  invalid_approver_or_reference: "O aprovador informado não existe no cadastro.",
  approver_name_2_200: "O nome do aprovador precisa ter entre 2 e 200 caracteres ou ficar vazio.",
  requester_approver_must_differ_segregacao: "Por segregação de funções, quem solicita não pode aprovar o mesmo pedido.",
  invalid_approval_id: "Selecione uma aprovação antes de consultar o histórico.",
  internal: "O servidor não conseguiu concluir a operação. Confira os dados e tente novamente.",
};
function translate(code: unknown, status?: number) {
  const key = typeof code === "string" ? code : "";
  if (ERROR_LABELS[key]) return ERROR_LABELS[key];
  if (status === 401 || status === 403) return ERROR_LABELS.forbidden;
  if (status && status >= 500) return "O serviço está indisponível. Tente novamente em instantes.";
  return "Não foi possível concluir a operação. Confira os dados e tente novamente.";
}
function isRow(value: unknown): value is Row {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function records(value: unknown): Row[] | null {
  if (!Array.isArray(value) || !value.every(isRow)) return null;
  return value;
}
const text = (value: unknown) => (typeof value === "string" ? value : "");
const yesNo = (value: unknown) => (value === true ? "sim" : "não");
const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

// DATE não é um instante: preservar o dia escrito antes de usar o fuso local.
function parseDateOnly(value: unknown) {
  const raw = text(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isNaN(date.valueOf()) ? null : date;
}
function dateOnly(value: unknown) {
  return parseDateOnly(value)?.toLocaleDateString("pt-BR") || "Não informada";
}
function dateTime(value: unknown) {
  const raw = text(value);
  if (!raw) return "Não informada";
  const date = new Date(raw);
  return Number.isNaN(date.valueOf()) ? "Data indisponível" : date.toLocaleString("pt-BR");
}
// Centavos vindos do banco chegam como número ou string; ausência nunca vira zero.
function cents(value: unknown) {
  if (value === null || value === undefined || value === "") return "Não informado";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "Não informado";
  return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function integer(value: unknown) {
  const parsed = number(value);
  return parsed === null ? "Não informado" : String(parsed);
}
function hours(value: unknown) {
  const parsed = number(value);
  return parsed === null ? "Não informada" : `${parsed.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h`;
}
function percent(value: unknown) {
  const parsed = number(value);
  return parsed === null ? "Calculada pelo banco ao registrar" : `${parsed.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}
function parseOptionalInt(value: string) {
  const raw = value.trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
}
function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const control = isValidElement<Record<string, unknown>>(children)
    ? cloneElement(children, { id, "aria-describedby": helpId }) : children;
  return <div className={styles.field}><label htmlFor={id}>{label}</label>{control}{help && <small id={helpId}>{help}</small>}</div>;
}
function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  const id = useId();
  return <div className={styles.checkField}><label htmlFor={id}><input id={id} type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />{label}</label></div>;
}
async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: "include", cache: "no-store", ...init });
  const payload: unknown = await response.json().catch(() => null);
  return { response, data: isRow(payload) ? payload : {} };
}
const initialStates = (): Record<FamilyKey, ReadState> => ({
  myDay: { kind: "loading" }, commercial: { kind: "loading" }, operational: { kind: "loading" },
  financial: { kind: "loading" }, risks: { kind: "loading" }, approvals: { kind: "loading" },
});
const emptyLists = (): Record<FamilyKey, Row[]> => ({
  myDay: [], commercial: [], operational: [], financial: [], risks: [], approvals: [],
});

export default function AdmClient() {
  const [states, setStates] = useState<Record<FamilyKey, ReadState>>(initialStates);
  const [lists, setLists] = useState<Record<FamilyKey, Row[]>>(emptyLists);
  const [lastRead, setLastRead] = useState("");
  const [selectedApproval, setSelectedApproval] = useState<string | null>(null);
  const [history, setHistory] = useState<Row[] | null>(null);
  const [historyState, setHistoryState] = useState<ReadState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [operationError, setOperationError] = useState("");
  const [myDayForm, setMyDayForm] = useState(NEW_MY_DAY);
  const [commercialForm, setCommercialForm] = useState(NEW_COMMERCIAL);
  const [operationalForm, setOperationalForm] = useState(NEW_OPERATIONAL);
  const [financialForm, setFinancialForm] = useState(NEW_FINANCIAL);
  const [riskForm, setRiskForm] = useState(NEW_RISK);
  const [approvalForm, setApprovalForm] = useState(NEW_APPROVAL);
  const [decisionForm, setDecisionForm] = useState(NEW_DECISION);
  const sequences = useRef<Record<FamilyKey, number>>({ myDay: 0, commercial: 0, operational: 0, financial: 0, risks: 0, approvals: 0 });
  const historySequence = useRef(0);
  const operationSequence = useRef(0);
  const operationInFlight = useRef(false);

  const loadFamily = useCallback(async (family: FamilyKey, clearFeedback = true) => {
    const current = ++sequences.current[family];
    setStates(previous => ({ ...previous, [family]: { kind: "loading" } }));
    if (clearFeedback) { setMessage(""); setOperationError(""); }
    if (family === "approvals") { setSelectedApproval(null); setHistory(null); setHistoryState({ kind: "loading" }); }
    try {
      const { response, data } = await requestJson(ENDPOINTS[family]);
      if (current !== sequences.current[family]) return;
      if (response.status === 401 || response.status === 403) { setStates(previous => ({ ...previous, [family]: { kind: "denied" } })); return; }
      if (!response.ok) { setStates(previous => ({ ...previous, [family]: { kind: "error", detail: translate(data.error, response.status) } })); return; }
      const rows = records(data[LIST_KEYS[family]]);
      if (!rows || rows.some(row => !text(row.id))) {
        setStates(previous => ({ ...previous, [family]: { kind: "error", detail: "O serviço devolveu um payload inválido. Tente consultar novamente." } }));
        return;
      }
      setLists(previous => ({ ...previous, [family]: rows }));
      setStates(previous => ({ ...previous, [family]: { kind: "ready" } }));
      if (family === "approvals") void loadHistory(rows[0] ? text(rows[0].id) : null, false);
    } catch {
      if (current === sequences.current[family]) {
        setStates(previous => ({ ...previous, [family]: { kind: "error", detail: "Falha de rede ao consultar o painel. Verifique a conexão e tente novamente." } }));
      }
    }
    setLastRead(new Date().toISOString());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadHistory = useCallback(async (approvalId: string | null, clearFeedback = true) => {
    const current = ++historySequence.current;
    if (!approvalId) { setSelectedApproval(null); setHistory(null); setHistoryState({ kind: "ready" }); return; }
    setSelectedApproval(approvalId);
    setHistory(null);
    setHistoryState({ kind: "loading" });
    if (clearFeedback) { setMessage(""); setOperationError(""); }
    try {
      const { response, data } = await requestJson(`${ENDPOINTS.approvalHistory}?approval_id=${encodeURIComponent(approvalId)}`);
      if (current !== historySequence.current) return;
      if (response.status === 401 || response.status === 403) { setHistoryState({ kind: "denied" }); return; }
      if (!response.ok) { setHistoryState({ kind: "error", detail: translate(data.error, response.status) }); return; }
      const rows = records(data.history);
      if (!rows) { setHistoryState({ kind: "error", detail: "O serviço devolveu um payload inválido para o histórico. Tente novamente." }); return; }
      setHistory(rows);
      setHistoryState({ kind: "ready" });
    } catch {
      if (current === historySequence.current) setHistoryState({ kind: "error", detail: "Falha de rede ao consultar o histórico. Tente novamente." });
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLastRead("");
    await Promise.all(FAMILIES.map(family => loadFamily(family, false)));
  }, [loadFamily]);

  useEffect(() => {
    void loadAll();
    return () => {
      for (const family of FAMILIES) sequences.current[family] += 1;
      historySequence.current += 1;
      operationSequence.current += 1;
    };
  }, [loadAll]);

  async function mutate(family: FamilyKey, path: string, method: "POST" | "PATCH", body: Row, success: string, reset?: () => void) {
    if (operationInFlight.current) return;
    const current = ++operationSequence.current;
    operationInFlight.current = true; setBusy(true); setMessage(""); setOperationError("");
    try {
      const { response, data } = await requestJson(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (current !== operationSequence.current) return;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          sequences.current[family] += 1;
          setLists(previous => ({ ...previous, [family]: [] }));
          setStates(previous => ({ ...previous, [family]: { kind: "denied" } }));
        }
        setOperationError(translate(data.error, response.status));
        return;
      }
      reset?.();
      setMessage(success);
      await loadFamily(family, false);
      if (family === "approvals" && selectedApproval) await loadHistory(selectedApproval, false);
    } catch {
      if (current === operationSequence.current) setOperationError("Falha de rede. Confira a lista antes de repetir a operação: o servidor pode ter recebido o pedido.");
    } finally {
      if (current === operationSequence.current) { operationInFlight.current = false; setBusy(false); }
    }
  }

  function optionalUuid(value: string, label: string) {
    const raw = value.trim();
    if (!raw) return undefined;
    if (!UUID_RE.test(raw)) { setMessage(""); setOperationError(label); return null; }
    return raw;
  }
  function requiredInt(value: string, label: string) {
    const parsed = parseOptionalInt(value);
    if (parsed === undefined || Number.isNaN(parsed)) { setMessage(""); setOperationError(label); return null; }
    return parsed;
  }

  function submitMyDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: Row = {
      title: myDayForm.title, description: myDayForm.description, priority: myDayForm.priority,
      responsible_name: myDayForm.responsible_name, action_type: myDayForm.action_type,
      due_date: myDayForm.due_date || null, source_module: myDayForm.source_module,
    };
    void mutate("myDay", ENDPOINTS.myDay, "POST", body, "Pendência da pauta registrada.", () => setMyDayForm(NEW_MY_DAY));
  }
  function updateMyDay(id: string, status: string) {
    void mutate("myDay", ENDPOINTS.myDay, "PATCH", { id, status }, `Pauta marcada como ${status.replaceAll("_", " ")}.`);
  }
  function submitCommercial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const counts = ["new_leads_count", "stalled_opportunities_count", "proposals_count", "total_value_cents"].map(key => requiredInt(commercialForm[key as keyof typeof commercialForm], "Os contadores do retrato comercial precisam ser números inteiros."));
    if (counts.some(value => value === null)) return;
    const body: Row = { snapshot_date: commercialForm.snapshot_date || null, next_actions: [], notes: commercialForm.notes || null };
    ["new_leads_count", "stalled_opportunities_count", "proposals_count", "total_value_cents"].forEach((key, index) => { body[key] = counts[index]; });
    void mutate("commercial", ENDPOINTS.commercial, "POST", body, "Retrato comercial registrado.", () => setCommercialForm(NEW_COMMERCIAL));
  }
  function submitOperational(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const counts = ["critical_occurrences_count", "sla_breach_count", "implantation_pending_count"].map(key => requiredInt(operationalForm[key as keyof typeof operationalForm], "Os contadores do retrato operacional precisam ser números inteiros."));
    if (counts.some(value => value === null)) return;
    const hoursRequired = parseOptionalInt(operationalForm.coverage_required_hours);
    const hoursCovered = parseOptionalInt(operationalForm.coverage_covered_hours);
    if (hoursRequired === undefined || Number.isNaN(hoursRequired) || hoursCovered === undefined || Number.isNaN(hoursCovered)) {
      setMessage(""); setOperationError("As horas de cobertura precisam ser números."); return;
    }
    const body: Row = {
      snapshot_date: operationalForm.snapshot_date || null,
      coverage_required_hours: hoursRequired === undefined ? 0 : hoursRequired,
      coverage_covered_hours: hoursCovered === undefined ? 0 : hoursCovered,
      notes: operationalForm.notes || null,
    };
    ["critical_occurrences_count", "sla_breach_count", "implantation_pending_count"].forEach((key, index) => { body[key] = counts[index]; });
    void mutate("operational", ENDPOINTS.operational, "POST", body, "Retrato operacional registrado.", () => setOperationalForm(NEW_OPERATIONAL));
  }
  function submitFinancial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!financialForm.competence_date) { setMessage(""); setOperationError(ERROR_LABELS.competence_date_required); return; }
    const values = ["total_receivables_cents", "total_payables_cents", "overdue_cents", "upcoming_cents"].map(key => requiredInt(financialForm[key as keyof typeof financialForm], "Os valores do retrato financeiro precisam ser inteiros, em centavos."));
    if (values.some(value => value === null)) return;
    const body: Row = { competence_date: financialForm.competence_date, source: financialForm.source, margin_by_contract: {}, notes: financialForm.notes || null };
    ["total_receivables_cents", "total_payables_cents", "overdue_cents", "upcoming_cents"].forEach((key, index) => { body[key] = values[index]; });
    void mutate("financial", ENDPOINTS.financial, "POST", body, "Retrato financeiro registrado.", () => setFinancialForm(NEW_FINANCIAL));
  }
  function submitRisk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!riskForm.renewal_date) { setMessage(""); setOperationError(ERROR_LABELS.renewal_date_required); return; }
    const contract = optionalUuid(riskForm.contract_id, ERROR_LABELS.invalid_contract_id);
    const account = optionalUuid(riskForm.client_account_id, ERROR_LABELS.invalid_client_account_id);
    if (contract === null || account === null) return;
    const score = requiredInt(riskForm.risk_score, ERROR_LABELS.risk_score_0_100);
    const reincidence = requiredInt(riskForm.reincidence_count, ERROR_LABELS.invalid_reincidence_count);
    if (score === null || reincidence === null) return;
    const body: Row = {
      contract_id: contract ?? null, client_account_id: account ?? null, renewal_date: riskForm.renewal_date,
      risk_level: riskForm.risk_level, risk_score: score, justification: riskForm.justification,
      reincidence_count: reincidence, is_justified: riskForm.is_justified, facts_json: { origem: "declarado_no_console" },
    };
    void mutate("risks", ENDPOINTS.risks, "POST", body, "Risco de renovação registrado.", () => setRiskForm(NEW_RISK));
  }
  function reviewRisk(id: string, risk_level: string) {
    void mutate("risks", ENDPOINTS.risks, "PATCH", { id, risk_level }, `Risco reavaliado como ${risk_level}.`);
  }
  function submitApproval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = parseOptionalInt(approvalForm.amount_cents);
    const threshold = parseOptionalInt(approvalForm.threshold_cents);
    if ((amount !== undefined && Number.isNaN(amount)) || (threshold !== undefined && Number.isNaN(threshold))) {
      setMessage(""); setOperationError("Valor e alçada precisam ser inteiros, em centavos, ou ficar vazios."); return;
    }
    if (amount !== undefined && threshold !== undefined && amount > threshold) {
      setMessage(""); setOperationError(ERROR_LABELS.approver_required_above_threshold_alcada); return;
    }
    const body: Row = {
      approval_type: approvalForm.approval_type,
      amount_cents: amount === undefined ? null : amount,
      threshold_cents: threshold === undefined ? null : threshold,
      requester_name: approvalForm.requester_name,
      scope: approvalForm.scope || null,
      reason: approvalForm.reason || null,
    };
    void mutate("approvals", ENDPOINTS.approvals, "POST", body, "Aprovação registrada com protocolo próprio.", () => setApprovalForm(NEW_APPROVAL));
  }
  function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = decisionForm.approval_id || selectedApproval || "";
    if (!UUID_RE.test(id)) { setMessage(""); setOperationError(ERROR_LABELS.invalid_approval_id); return; }
    const approver = optionalUuid(decisionForm.approver_identity, ERROR_LABELS.invalid_approver_identity);
    if (approver === null) return;
    const body: Row = { id, status: decisionForm.status, reason: decisionForm.reason };
    if (approver) { body.approver_identity = approver; body.approver_name = decisionForm.approver_name || "Aprovador informado no console"; }
    void mutate("approvals", ENDPOINTS.approvals, "PATCH", body, `Aprovação marcada como ${decisionForm.status}.`, () => setDecisionForm(NEW_DECISION));
  }

  const panel = (family: FamilyKey, title: string, description: string, children: ReactNode) => {
    const state = states[family];
    const rows = lists[family];
    return <section className={styles.panel} aria-labelledby={`adm-${family}-title`} aria-busy={state.kind === "loading"}>
      <div className={styles.panelHead}>
        <div><h3 id={`adm-${family}-title`}>{title}</h3><p>{description}</p></div>
        <span className={styles.count}>{state.kind === "ready" ? `${rows.length} registro(s)` : "—"}</span>
      </div>
      {state.kind === "loading" && <UiState variant="loading" title={`Consultando ${title.toLowerCase()}`} />}
      {state.kind === "denied" && <UiState variant="denied" title="Acesso não autorizado" detail="Nenhum registro foi exibido." onRetry={() => void loadFamily(family)} />}
      {state.kind === "error" && <UiState variant="error" title={`Não foi possível consultar ${title.toLowerCase()}`} detail={state.detail} onRetry={() => void loadFamily(family)} />}
      {state.kind === "ready" && rows.length === 0 && <UiState variant="empty" title="Nenhum registro encontrado" detail="A leitura foi concluída e não retornou registros." />}
      {state.kind === "ready" && rows.length > 0 && children}
    </section>;
  };

  return <section className={styles.workspace} aria-labelledby="adm-title" aria-busy={busy}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Gestão ADM-01..06</p><h2 id="adm-title">Pauta, retratos e aprovações</h2>
        <p>Acompanhe a pauta do dia, os retratos comercial, operacional e financeiro, o risco de renovação e a aprovação unificada com alçada.</p></div>
      <button type="button" disabled={busy} onClick={() => void loadAll()}>Atualizar painel</button>
    </header>
    <p className={styles.source}><strong>Fonte:</strong> tabelas <code>adm_my_day_items</code>, <code>adm_commercial_snapshots</code>, <code>adm_operational_snapshots</code>, <code>adm_financial_snapshots</code>, <code>adm_renewal_risks</code>, <code>adm_approvals</code> e <code>adm_approval_history</code>. <strong>Data-base:</strong> {lastRead ? dateTime(lastRead) : "leitura ainda não concluída"}.</p>
    <aside className={styles.limit} aria-label="Limites do painel">
      <strong>Limites declarados:</strong> os retratos são <strong>valores declarados pelo operador</strong> e não são calculados aqui a partir dos módulos; o saldo do retrato financeiro e a porcentagem de cobertura são colunas geradas pelo banco.
      A criação de uma aprovação acima da alçada é recusada pelo servidor: o aprovador é registrado na decisão, e quem solicita não pode aprovar o mesmo pedido.
      Esta tela não envia e-mail, não move dinheiro, não faz upload e não substitui parecer jurídico ou contábil. A auditoria é tentativa, não garantia transacional.
      Papel e origem são decididos no servidor; não há aceite humano registrado e a produção segue <strong>NO-GO</strong> (0/222).
    </aside>
    {message && <p className={styles.success} role="status">{message}</p>}
    {operationError && <p className={styles.error} role="alert">{operationError}</p>}
    {busy && <p role="status">Operação em andamento. Aguarde a confirmação do servidor.</p>}

    <div className={styles.grid}>
      {panel("myDay", "ADM-01 Pauta do dia", "Pendências reais com prioridade, responsável e ação.", <ul className={styles.recordList}>{lists.myDay.map(item => {
        const id = text(item.id);
        return <li key={id}>
          <strong>{text(item.title)}</strong>
          <span>Prioridade: {text(item.priority)} · Responsável: {text(item.responsible_name)} · Ação: {text(item.action_type)}</span>
          <span>Situação: {text(item.status)} · Vencimento: {dateOnly(item.due_date)} · Módulo: {text(item.source_module)} · Pendência real: {yesNo(item.is_real_pending)}</span>
          <div className={styles.actions}>
            <button type="button" disabled={busy} onClick={() => updateMyDay(id, "em_andamento")}>Em andamento</button>
            <button type="button" disabled={busy} onClick={() => updateMyDay(id, "concluida")}>Concluir</button>
            <button type="button" disabled={busy} onClick={() => updateMyDay(id, "cancelada")}>Cancelar</button>
          </div>
        </li>;
      })}</ul>)}

      {panel("commercial", "ADM-02 Retrato comercial", "Leads novos, oportunidades paradas e propostas.", <ul className={styles.recordList}>{lists.commercial.map(item => <li key={text(item.id)}>
        <strong>{dateOnly(item.snapshot_date)}</strong>
        <span>Leads novos: {integer(item.new_leads_count)} · Oportunidades paradas: {integer(item.stalled_opportunities_count)} · Propostas: {integer(item.proposals_count)}</span>
        <span>Valor total: {cents(item.total_value_cents)}</span>
      </li>)}</ul>)}

      {panel("operational", "ADM-03 Retrato operacional", "Cobertura, ocorrências críticas, SLA e implantação.", <ul className={styles.recordList}>{lists.operational.map(item => <li key={text(item.id)}>
        <strong>{dateOnly(item.snapshot_date)}</strong>
        <span>Cobertura: {hours(item.coverage_covered_hours)} de {hours(item.coverage_required_hours)} · Percentual: {percent(item.coverage_percent)}</span>
        <span>Ocorrências críticas: {integer(item.critical_occurrences_count)} · SLA estourado: {integer(item.sla_breach_count)} · Implantações pendentes: {integer(item.implantation_pending_count)}</span>
      </li>)}</ul>)}

      {panel("financial", "ADM-04 Retrato financeiro", "Recebíveis, pagáveis, vencidos, próximos e margem por contrato.", <ul className={styles.recordList}>{lists.financial.map(item => <li key={text(item.id)}>
        <strong>{dateOnly(item.competence_date)} · {text(item.source)}</strong>
        <span>Recebíveis: {cents(item.total_receivables_cents)} · Pagáveis: {cents(item.total_payables_cents)} · Saldo: {cents(item.balance_cents)}</span>
        <span>Vencidos: {cents(item.overdue_cents)} · Próximos: {cents(item.upcoming_cents)}</span>
        <span>Margem por contrato: {JSON.stringify(item.margin_by_contract ?? {})}</span>
      </li>)}</ul>)}

      {panel("risks", "ADM-05 Risco de renovação", "Contratos próximos de renovar com reincidência e justificativa.", <ul className={styles.recordList}>{lists.risks.map(item => {
        const id = text(item.id);
        return <li key={id}>
          <strong>{dateOnly(item.renewal_date)} · nível {text(item.risk_level)}</strong>
          <span>Pontuação: {integer(item.risk_score)} · Reincidência: {integer(item.reincidence_count)} · Justificado: {yesNo(item.is_justified)}</span>
          <span>Contrato: {text(item.contract_id) || "Não informado"} · Conta: {text(item.client_account_id) || "Não informada"}</span>
          <span>{text(item.justification)}</span>
          <div className={styles.actions}>
            <button type="button" disabled={busy} onClick={() => reviewRisk(id, "alto")}>Marcar alto</button>
            <button type="button" disabled={busy} onClick={() => reviewRisk(id, "critico")}>Marcar crítico</button>
            <button type="button" disabled={busy} onClick={() => reviewRisk(id, "baixo")}>Marcar baixo</button>
          </div>
        </li>;
      })}</ul>)}

      {panel("approvals", "ADM-06 Aprovação unificada", "Descontos, compras, despesas e exceções com alçada por valor e escopo.", <ul className={styles.recordList}>{lists.approvals.map(item => {
        const id = text(item.id);
        return <li key={id} aria-current={selectedApproval === id ? "true" : undefined}>
          <strong>{text(item.protocol)} · {text(item.approval_type)}</strong>
          <span>Situação: {text(item.status)} · Solicitante: {text(item.requester_name)} · Aprovador: {text(item.approver_name) || "Não informado"}</span>
          <span>Valor: {cents(item.amount_cents)} · Alçada: {cents(item.threshold_cents)} · Escopo: {text(item.scope) || "Não informado"}</span>
          <div className={styles.actions}>
            <button type="button" disabled={busy} onClick={() => void loadHistory(id)}>Ver histórico</button>
          </div>
        </li>;
      })}</ul>)}
    </div>

    <div className={styles.grid}>
      <section className={styles.panel} aria-labelledby="adm-history-title" aria-busy={historyState.kind === "loading"}>
        <div className={styles.panelHead}>
          <div><h3 id="adm-history-title">Histórico da aprovação</h3><p>Selecionado: {selectedApproval || "nenhuma aprovação"}.</p></div>
          <span className={styles.count}>{history ? `${history.length} lançamento(s)` : "—"}</span>
        </div>
        {historyState.kind === "loading" && <UiState variant="loading" title="Consultando histórico" />}
        {historyState.kind === "denied" && <UiState variant="denied" title="Histórico não autorizado" detail="Nenhum lançamento foi exibido." onRetry={() => { if (selectedApproval) void loadHistory(selectedApproval); }} />}
        {historyState.kind === "error" && <UiState variant="error" title="Não foi possível consultar o histórico" detail={historyState.detail} onRetry={() => { if (selectedApproval) void loadHistory(selectedApproval); }} />}
        {historyState.kind === "ready" && (!history || history.length === 0) && <UiState variant="empty" title="Nenhum lançamento no histórico" detail="A leitura foi concluída e não retornou registros." />}
        {historyState.kind === "ready" && history && history.length > 0 && <ul className={styles.historyList}>{history.map((item, index) => <li key={text(item.id) || index}>{text(item.previous_status) || "início"} → {text(item.next_status)} · {dateTime(item.created_at)}<br />{text(item.reason)}</li>)}</ul>}
      </section>

      <section className={styles.panel} aria-labelledby="adm-decision-title">
        <div className={styles.panelHead}><div><h3 id="adm-decision-title">Registrar decisão da aprovação</h3><p>A decisão exige motivo e, acima da alçada, o aprovador.</p></div></div>
        <form onSubmit={submitDecision} noValidate><fieldset disabled={busy} className={styles.formGrid}>
          <Field label="Identificador da aprovação" help="Por padrão, usa a aprovação selecionada no histórico."><input value={decisionForm.approval_id || selectedApproval || ""} onChange={event => setDecisionForm({ ...decisionForm, approval_id: event.target.value })} /></Field>
          <Field label="Situação de destino"><select value={decisionForm.status} onChange={event => setDecisionForm({ ...decisionForm, status: event.target.value })}><option value="aprovado">Aprovado</option><option value="rejeitado">Rejeitado</option><option value="cancelado">Cancelado</option><option value="pendente">Pendente</option></select></Field>
          <Field label="Identificador do aprovador" help="Obrigatório quando o valor passa da alçada; UUID de uma identidade existente."><input value={decisionForm.approver_identity} onChange={event => setDecisionForm({ ...decisionForm, approver_identity: event.target.value })} /></Field>
          <Field label="Nome do aprovador" help="Opcional; de 2 a 200 caracteres."><input value={decisionForm.approver_name} onChange={event => setDecisionForm({ ...decisionForm, approver_name: event.target.value })} /></Field>
          <Field label="Motivo da decisão" help="De 10 a 1000 caracteres; é registrado no histórico."><textarea value={decisionForm.reason} onChange={event => setDecisionForm({ ...decisionForm, reason: event.target.value })} /></Field>
          <button type="submit">Registrar decisão da aprovação</button>
        </fieldset></form>
      </section>
    </div>

    <details className={styles.subsection}><summary>Nova pendência da pauta (ADM-01)</summary><form onSubmit={submitMyDay} noValidate><fieldset disabled={busy} className={styles.formGrid}>
      <Field label="Título da pendência" help="De 5 a 200 caracteres."><input value={myDayForm.title} onChange={event => setMyDayForm({ ...myDayForm, title: event.target.value })} /></Field>
      <Field label="Descrição da pendência" help="De 10 a 1000 caracteres."><textarea value={myDayForm.description} onChange={event => setMyDayForm({ ...myDayForm, description: event.target.value })} /></Field>
      <Field label="Prioridade"><select value={myDayForm.priority} onChange={event => setMyDayForm({ ...myDayForm, priority: event.target.value })}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></Field>
      <Field label="Pessoa responsável" help="De 2 a 200 caracteres."><input value={myDayForm.responsible_name} onChange={event => setMyDayForm({ ...myDayForm, responsible_name: event.target.value })} /></Field>
      <Field label="Tipo de ação" help="De 3 a 100 caracteres."><input value={myDayForm.action_type} onChange={event => setMyDayForm({ ...myDayForm, action_type: event.target.value })} /></Field>
      <Field label="Vencimento" help="Opcional."><input type="date" value={myDayForm.due_date} onChange={event => setMyDayForm({ ...myDayForm, due_date: event.target.value })} /></Field>
      <Field label="Módulo de origem"><select value={myDayForm.source_module} onChange={event => setMyDayForm({ ...myDayForm, source_module: event.target.value })}><option value="adm">Administrativo</option><option value="crm">CRM</option><option value="con">Contratos</option><option value="hr">RH</option><option value="ops">Operação</option><option value="fin">Financeiro</option><option value="cli">Cliente</option><option value="plt">Plataforma</option><option value="outro">Outro</option></select></Field>
      <button type="submit">Registrar pendência da pauta</button>
    </fieldset></form></details>

    <details className={styles.subsection}><summary>Novo retrato comercial (ADM-02)</summary><form onSubmit={submitCommercial} noValidate><fieldset disabled={busy} className={styles.formGrid}>
      <Field label="Data do retrato" help="Não é possível repetir a mesma data."><input type="date" value={commercialForm.snapshot_date} onChange={event => setCommercialForm({ ...commercialForm, snapshot_date: event.target.value })} /></Field>
      <Field label="Leads novos"><input value={commercialForm.new_leads_count} onChange={event => setCommercialForm({ ...commercialForm, new_leads_count: event.target.value })} /></Field>
      <Field label="Oportunidades paradas"><input value={commercialForm.stalled_opportunities_count} onChange={event => setCommercialForm({ ...commercialForm, stalled_opportunities_count: event.target.value })} /></Field>
      <Field label="Propostas"><input value={commercialForm.proposals_count} onChange={event => setCommercialForm({ ...commercialForm, proposals_count: event.target.value })} /></Field>
      <Field label="Valor total em centavos"><input value={commercialForm.total_value_cents} onChange={event => setCommercialForm({ ...commercialForm, total_value_cents: event.target.value })} /></Field>
      <Field label="Observação" help="Opcional, de 10 a 1000 caracteres."><textarea value={commercialForm.notes} onChange={event => setCommercialForm({ ...commercialForm, notes: event.target.value })} /></Field>
      <button type="submit">Registrar retrato comercial</button>
    </fieldset></form></details>

    <details className={styles.subsection}><summary>Novo retrato operacional (ADM-03)</summary><form onSubmit={submitOperational} noValidate><fieldset disabled={busy} className={styles.formGrid}>
      <Field label="Data do retrato" help="Não é possível repetir a mesma data."><input type="date" value={operationalForm.snapshot_date} onChange={event => setOperationalForm({ ...operationalForm, snapshot_date: event.target.value })} /></Field>
      <Field label="Horas de cobertura exigidas"><input value={operationalForm.coverage_required_hours} onChange={event => setOperationalForm({ ...operationalForm, coverage_required_hours: event.target.value })} /></Field>
      <Field label="Horas de cobertura cobertas"><input value={operationalForm.coverage_covered_hours} onChange={event => setOperationalForm({ ...operationalForm, coverage_covered_hours: event.target.value })} /></Field>
      <Field label="Ocorrências críticas"><input value={operationalForm.critical_occurrences_count} onChange={event => setOperationalForm({ ...operationalForm, critical_occurrences_count: event.target.value })} /></Field>
      <Field label="SLA estourado"><input value={operationalForm.sla_breach_count} onChange={event => setOperationalForm({ ...operationalForm, sla_breach_count: event.target.value })} /></Field>
      <Field label="Implantações pendentes"><input value={operationalForm.implantation_pending_count} onChange={event => setOperationalForm({ ...operationalForm, implantation_pending_count: event.target.value })} /></Field>
      <Field label="Observação" help="Opcional, de 10 a 1000 caracteres."><textarea value={operationalForm.notes} onChange={event => setOperationalForm({ ...operationalForm, notes: event.target.value })} /></Field>
      <button type="submit">Registrar retrato operacional</button>
    </fieldset></form></details>

    <details className={styles.subsection}><summary>Novo retrato financeiro (ADM-04)</summary><form onSubmit={submitFinancial} noValidate><fieldset disabled={busy} className={styles.formGrid}>
      <Field label="Competência" help="Obrigatória; não é possível repetir competência e fonte."><input type="date" value={financialForm.competence_date} onChange={event => setFinancialForm({ ...financialForm, competence_date: event.target.value })} /></Field>
      <Field label="Fonte" help="De 3 a 100 caracteres."><input value={financialForm.source} onChange={event => setFinancialForm({ ...financialForm, source: event.target.value })} /></Field>
      <Field label="Recebíveis em centavos"><input value={financialForm.total_receivables_cents} onChange={event => setFinancialForm({ ...financialForm, total_receivables_cents: event.target.value })} /></Field>
      <Field label="Pagáveis em centavos"><input value={financialForm.total_payables_cents} onChange={event => setFinancialForm({ ...financialForm, total_payables_cents: event.target.value })} /></Field>
      <Field label="Vencidos em centavos"><input value={financialForm.overdue_cents} onChange={event => setFinancialForm({ ...financialForm, overdue_cents: event.target.value })} /></Field>
      <Field label="Próximos em centavos"><input value={financialForm.upcoming_cents} onChange={event => setFinancialForm({ ...financialForm, upcoming_cents: event.target.value })} /></Field>
      <Field label="Observação" help="Opcional, de 10 a 1000 caracteres."><textarea value={financialForm.notes} onChange={event => setFinancialForm({ ...financialForm, notes: event.target.value })} /></Field>
      <button type="submit">Registrar retrato financeiro</button>
    </fieldset></form></details>

    <details className={styles.subsection}><summary>Novo risco de renovação (ADM-05)</summary><form onSubmit={submitRisk} noValidate><fieldset disabled={busy} className={styles.formGrid}>
      <Field label="Identificador do contrato" help="Opcional; UUID de um contrato existente."><input value={riskForm.contract_id} onChange={event => setRiskForm({ ...riskForm, contract_id: event.target.value })} /></Field>
      <Field label="Identificador da conta" help="Opcional; UUID de uma conta existente."><input value={riskForm.client_account_id} onChange={event => setRiskForm({ ...riskForm, client_account_id: event.target.value })} /></Field>
      <Field label="Data prevista de renovação" help="Obrigatória."><input type="date" value={riskForm.renewal_date} onChange={event => setRiskForm({ ...riskForm, renewal_date: event.target.value })} /></Field>
      <Field label="Nível de risco"><select value={riskForm.risk_level} onChange={event => setRiskForm({ ...riskForm, risk_level: event.target.value })}><option value="baixo">Baixo</option><option value="medio">Médio</option><option value="alto">Alto</option><option value="critico">Crítico</option></select></Field>
      <Field label="Pontuação de risco" help="De 0 a 100."><input value={riskForm.risk_score} onChange={event => setRiskForm({ ...riskForm, risk_score: event.target.value })} /></Field>
      <Field label="Reincidências"><input value={riskForm.reincidence_count} onChange={event => setRiskForm({ ...riskForm, reincidence_count: event.target.value })} /></Field>
      <Field label="Justificativa do risco" help="De 10 a 1000 caracteres; obrigatória para risco justificado."><textarea value={riskForm.justification} onChange={event => setRiskForm({ ...riskForm, justification: event.target.value })} /></Field>
      <CheckField label="Risco de perda justificado" checked={riskForm.is_justified} onChange={value => setRiskForm({ ...riskForm, is_justified: value })} />
      <button type="submit">Registrar risco de renovação</button>
    </fieldset></form></details>

    <details className={styles.subsection}><summary>Nova aprovação unificada (ADM-06)</summary><form onSubmit={submitApproval} noValidate><fieldset disabled={busy} className={styles.formGrid}>
      <Field label="Tipo de aprovação"><select value={approvalForm.approval_type} onChange={event => setApprovalForm({ ...approvalForm, approval_type: event.target.value })}><option value="desconto">Desconto</option><option value="compra">Compra</option><option value="despesa">Despesa</option><option value="excecao">Exceção</option><option value="outro">Outro</option></select></Field>
      <Field label="Valor em centavos" help="Acima da alçada, o aprovador é registrado na decisão, não na criação."><input value={approvalForm.amount_cents} onChange={event => setApprovalForm({ ...approvalForm, amount_cents: event.target.value })} /></Field>
      <Field label="Alçada em centavos"><input value={approvalForm.threshold_cents} onChange={event => setApprovalForm({ ...approvalForm, threshold_cents: event.target.value })} /></Field>
      <Field label="Nome de quem solicita" help="De 2 a 200 caracteres."><input value={approvalForm.requester_name} onChange={event => setApprovalForm({ ...approvalForm, requester_name: event.target.value })} /></Field>
      <Field label="Escopo" help="Opcional, de 3 a 200 caracteres."><input value={approvalForm.scope} onChange={event => setApprovalForm({ ...approvalForm, scope: event.target.value })} /></Field>
      <Field label="Motivo" help="Opcional, de 10 a 1000 caracteres."><textarea value={approvalForm.reason} onChange={event => setApprovalForm({ ...approvalForm, reason: event.target.value })} /></Field>
      <button type="submit">Registrar aprovação unificada</button>
    </fieldset></form></details>
  </section>;
}
