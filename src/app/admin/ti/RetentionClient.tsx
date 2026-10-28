"use client";
// UX-PRO-03 — 5ª promoção "com prova": PLT-11, retenção por categoria e
// descarte verificável (políticas, exceções formais, jobs e logs minimizados).
// Antes: protótipo órfão, hex inline, `any`, fetch sem verificação de status e
// um único <p> para qualquer falha. Agora: 17ª aba real do TiConsole, quatro
// contratos preservados, papel admin/ti decidido no servidor, fonte/data-base
// declaradas, drill-down ao registro canônico, quatro estados de leitura com
// retry e aviso de que o job é SIMULAÇÃO SINTÉTICA — não apaga dado pessoal
// real e não substitui parecer jurídico. Nenhuma permissão, rota ou migração
// mudou.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import UiState from "@/components/ui/UiState";
import styles from "./RetentionClient.module.css";

type Policy = {
  id: string; category: string; field_pattern: string; retention_days: number;
  description: string; legal_basis: string; legal_basis_detail: string | null;
  disposal_method: string; exceptional_retention_allowed: boolean;
  max_exception_days: number | null; is_active: boolean;
  created_by: string | null; created_at?: string; updated_at?: string;
};
type RetentionException = {
  id: string; category: string; field_reference: string; reason: string;
  justification: string; status: string; requested_retention_days: number;
  approved_retention_days: number | null; expires_at: string;
  requested_by: string; approved_by: string | null; rejection_reason?: string | null;
  policy_id?: string | null; created_at: string;
};
type DisposalJob = {
  id: string; status: string; total_scanned: number; total_expired: number;
  total_disposed: number; initiated_by: string; notes: string | null;
  created_at: string; finished_at: string | null;
};
type DisposalLog = {
  id: string; category: string; field_reference: string;
  record_reference_hash: string; disposal_method: string;
  retention_days_applied: number | null; details: string | null; disposed_at: string;
};
type ReadState = { kind: "loading" } | { kind: "ready" } | { kind: "denied" } | { kind: "error"; detail: string };

const ENDPOINTS = {
  policies: "/api/admin/retention/policies",
  exceptions: "/api/admin/retention/exceptions",
  jobs: "/api/admin/retention/disposal/jobs",
  logs: "/api/admin/retention/disposal/logs",
} as const;

const CATS = ["identificacao", "contato", "localizacao", "profissional", "financeiro", "tecnico", "comportamental", "sensivel", "outro"] as const;
const BASIS = ["consentimento", "execucao_contrato", "cumprimento_legal", "legitimo_interesse", "protecao_vida", "tutela_saude", "exercicio_direitos", "protecao_credito", "outro"] as const;
const METHODS = ["exclusao_logica", "exclusao_fisica", "anonimizacao", "arquivamento"] as const;
const EX_STATUS = ["solicitado", "em_analise", "aprovado", "rejeitado", "expirado", "revogado"] as const;

const ERROR_LABELS: Record<string, string> = {
  forbidden: "Sua sessão não tem autorização para consultar retenção de dados. Entre com uma conta individual de TI ou administração.",
  unauthorized: "Sua sessão expirou. Entre novamente para consultar a retenção.",
  invalid_category: "Selecione uma categoria de dado válida.",
  invalid_retention_days: "Informe um prazo de retenção entre 1 e 36.500 dias.",
  description_min_10: "A descrição da finalidade precisa ter pelo menos 10 caracteres.",
  invalid_legal_basis: "Selecione uma base legal válida.",
  invalid_disposal_method: "Selecione um método de descarte válido.",
  invalid_max_exception: "O máximo de dias para exceção precisa estar entre 1 e 36.500.",
  field_required: "Informe a referência do campo que terá retenção excepcional.",
  reason_min_10: "O motivo da exceção precisa ter pelo menos 10 caracteres.",
  justification_min_10: "A justificativa da exceção precisa ter pelo menos 10 caracteres.",
  invalid_requested_days: "Informe um prazo solicitado entre 1 e 36.500 dias.",
  invalid_policy_id: "A política vinculada não é um identificador válido.",
  exceptional_not_allowed: "A política selecionada não permite retenção excepcional.",
  exception_exceeds_policy: "O prazo solicitado ultrapassa o máximo permitido pela política.",
  invalid_expires_at: "A data de expiração informada não é válida.",
  invalid_status: "Selecione um status de exceção válido.",
  invalid_transition: "Esta transição de status não é permitida pelo servidor.",
  invalid_approved_days: "Os dias aprovados precisam estar entre 1 e 36.500.",
  rejection_reason_min_10: "O motivo da rejeição precisa ter pelo menos 10 caracteres.",
  invalid_id: "O registro selecionado não é válido. Recarregue a leitura.",
  not_found: "O registro não foi localizado. Recarregue a leitura.",
  job_failed: "O job de descarte falhou no servidor. Nenhum resultado foi presumido.",
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

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: "include", cache: "no-store", ...init });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { response, data };
}

export default function RetentionClient() {
  const [readState, setReadState] = useState<ReadState>({ kind: "loading" });
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [exceptions, setExceptions] = useState<RetentionException[]>([]);
  const [jobs, setJobs] = useState<DisposalJob[]>([]);
  const [logs, setLogs] = useState<DisposalLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [operationError, setOperationError] = useState("");
  const [policyForm, setPolicyForm] = useState({
    category: "contato", field_pattern: "email", retention_days: "365",
    description: "", legal_basis: "cumprimento_legal", disposal_method: "exclusao_logica",
    exceptional_retention_allowed: false, max_exception_days: "730",
  });
  const [exceptionForm, setExceptionForm] = useState({
    category: "contato", field_reference: "", reason: "", justification: "",
    requested_retention_days: "180", expires_at: "", policy_id: "",
  });
  const [exceptionUpdate, setExceptionUpdate] = useState({
    id: "", next_status: "em_analise", approved_retention_days: "", rejection_reason: "",
  });
  const [jobNotes, setJobNotes] = useState("");
  const sequence = useRef(0);
  const operation = useRef(false);

  const clear = useCallback(() => {
    setPolicies([]); setExceptions([]); setJobs([]); setLogs([]);
    setExceptionUpdate({ id: "", next_status: "em_analise", approved_retention_days: "", rejection_reason: "" });
  }, []);

  // `clearFeedback=false` é usado por mutate: a mensagem de sucesso precisa
  // sobreviver ao reload interno. Botão/retry/montagem limpam mensagens velhas.
  const load = useCallback(async (clearFeedback = true) => {
    const current = ++sequence.current;
    if (clearFeedback) { setMessage(""); setOperationError(""); }
    setReadState({ kind: "loading" });
    try {
      const [p, e, j, l] = await Promise.all([
        requestJson(ENDPOINTS.policies),
        requestJson(ENDPOINTS.exceptions),
        requestJson(ENDPOINTS.jobs),
        requestJson(ENDPOINTS.logs),
      ]);
      // Resposta fora de ordem: descarta e mantém a leitura mais recente.
      if (current !== sequence.current) return;
      const all = [p, e, j, l];
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
      setPolicies(Array.isArray(p.data.policies) ? p.data.policies as Policy[] : []);
      setExceptions(Array.isArray(e.data.exceptions) ? e.data.exceptions as RetentionException[] : []);
      setJobs(Array.isArray(j.data.jobs) ? j.data.jobs as DisposalJob[] : []);
      setLogs(Array.isArray(l.data.logs) ? l.data.logs as DisposalLog[] : []);
      setReadState({ kind: "ready" });
    } catch {
      if (current !== sequence.current) return;
      clear();
      setReadState({ kind: "error", detail: "Falha de rede ao consultar a retenção. Verifique a conexão e tente novamente." });
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

  const latestJob = jobs[0] ? dateTime(jobs[0].created_at) : "nenhum job registrado";
  const latestLog = logs[0] ? dateTime(logs[0].disposed_at) : "nenhum descarte registrado";
  const activePolicies = policies.filter(policy => policy.is_active).length;
  const empty = policies.length === 0 && exceptions.length === 0 && jobs.length === 0 && logs.length === 0;
  const feedback = readState.kind === "loading"
    ? <UiState variant="loading" title="Carregando retenção" detail="Consultando políticas, exceções formais, jobs e histórico minimizado de descarte." />
    : readState.kind === "denied"
      ? <UiState variant="denied" title="Acesso não autorizado" detail="Esta superfície é restrita a contas individuais de TI ou administração. Nenhum dado foi exposto." onRetry={() => load()} retryLabel="Tentar novamente" />
      : readState.kind === "error"
        ? <UiState variant="error" title="Falha na consulta" detail={readState.detail} onRetry={() => load()} retryLabel="Tentar novamente" />
        : empty
          ? <UiState variant="empty" title="Nenhuma política de retenção" detail="As tabelas estão vazias. Os formulários abaixo registram as primeiras políticas e exceções formais informadas pelo operador." onRetry={() => load()} retryLabel="Atualizar" />
          : null;

  return (
    <section className={styles.workspace} aria-busy={busy || readState.kind === "loading"}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>PLT-11 · LGPD e retenção</p>
          <h2>Retenção e descarte</h2>
          <p>Políticas por categoria, exceções formais com aprovação documentada, jobs de descarte e histórico minimizado por hash de referência.</p>
          <p className={styles.source}>
            Fonte: tabelas <code>data_retention_policies</code>, <code>retention_exceptions</code>, <code>disposal_jobs</code> e <code>disposal_logs</code>.
            {" "}Data-base: job mais recente em <strong>{latestJob}</strong>; descarte mais recente em <strong>{latestLog}</strong>.
            {" "}Políticas ativas: <strong>{activePolicies}</strong>.
          </p>
        </div>
        <button type="button" onClick={() => load()} disabled={busy || readState.kind === "loading"}>Atualizar leitura</button>
      </header>

      {feedback}
      {message && <p role="status" className={styles.success}>{message}</p>}
      {operationError && <p role="alert" className={styles.error}>{operationError}</p>}

      {readState.kind === "ready" && <>
        <section className={styles.panel} aria-labelledby="retention-policies-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="retention-policies-title">Políticas ({policies.length})</h3><p>Prazo, base legal e método de descarte por categoria e padrão de campo.</p></div>
            <span className={styles.count}>{activePolicies} ativa(s)</span>
          </div>
          <ul className={styles.recordList}>
            {policies.map(policy => <li key={policy.id}>
              <strong>{policy.category} / {policy.field_pattern} · {policy.retention_days} dias</strong>
              <span>base {policy.legal_basis} · descarte {policy.disposal_method} · {policy.is_active ? "ativa" : "inativa"}</span>
              <span>{policy.description}</span>
              <span>exceção {policy.exceptional_retention_allowed ? `permitida (máx. ${policy.max_exception_days ?? "—"} dias)` : "não permitida"} · registrada por {policy.created_by || "não informado"} em {date(policy.created_at)}</span>
              <details className={styles.subsection}><summary>Registro canônico da política (JSON)</summary><pre className={styles.pre}>{JSON.stringify(policy, null, 2)}</pre></details>
            </li>)}
          </ul>
          <details className={styles.subsection}>
            <summary>Registrar política de retenção</summary>
            <div className={styles.formGrid}>
              <Field label="Categoria"><select value={policyForm.category} onChange={e => setPolicyForm({ ...policyForm, category: e.target.value })}>{CATS.map(category => <option key={category} value={category}>{category}</option>)}</select></Field>
              <Field label="Padrão de campo"><input value={policyForm.field_pattern} onChange={e => setPolicyForm({ ...policyForm, field_pattern: e.target.value })} /></Field>
              <Field label="Dias de retenção"><input type="number" min={1} value={policyForm.retention_days} onChange={e => setPolicyForm({ ...policyForm, retention_days: e.target.value })} /></Field>
              <Field label="Base legal"><select value={policyForm.legal_basis} onChange={e => setPolicyForm({ ...policyForm, legal_basis: e.target.value })}>{BASIS.map(basis => <option key={basis} value={basis}>{basis}</option>)}</select></Field>
              <Field label="Método de descarte"><select value={policyForm.disposal_method} onChange={e => setPolicyForm({ ...policyForm, disposal_method: e.target.value })}>{METHODS.map(method => <option key={method} value={method}>{method}</option>)}</select></Field>
              <Field label="Máximo de dias excepcional"><input type="number" min={1} value={policyForm.max_exception_days} onChange={e => setPolicyForm({ ...policyForm, max_exception_days: e.target.value })} /></Field>
              <div className={styles.full}><Field label="Descrição da finalidade" help="Mínimo de 10 caracteres; descreve a finalidade declarada da retenção."><textarea rows={3} value={policyForm.description} onChange={e => setPolicyForm({ ...policyForm, description: e.target.value })} /></Field></div>
              <div className={styles.full}><label className={styles.field}><span>Permitir retenção excepcional</span><input type="checkbox" checked={policyForm.exceptional_retention_allowed} onChange={e => setPolicyForm({ ...policyForm, exceptional_retention_allowed: e.target.checked })} /></label></div>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => mutate(
              ENDPOINTS.policies, "POST",
              {
                ...policyForm,
                retention_days: Number(policyForm.retention_days),
                max_exception_days: policyForm.exceptional_retention_allowed ? Number(policyForm.max_exception_days) : null,
              },
              "Política de retenção registrada.",
              () => setPolicyForm({ category: "contato", field_pattern: "email", retention_days: "365", description: "", legal_basis: "cumprimento_legal", disposal_method: "exclusao_logica", exceptional_retention_allowed: false, max_exception_days: "730" }),
            )}>Salvar política</button>
          </details>
        </section>

        <section className={styles.panel} aria-labelledby="retention-exceptions-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="retention-exceptions-title">Exceções formais ({exceptions.length})</h3><p>Solicitação, análise, aprovação ou rejeição documentadas; transições decididas no servidor.</p></div>
          </div>
          <ul className={styles.recordList}>
            {exceptions.map(exception => <li key={exception.id}>
              <strong>{exception.status} · {exception.category} / {exception.field_reference}</strong>
              <span>solicitado {exception.requested_retention_days}d · aprovado {exception.approved_retention_days ?? "—"}d · expira em {date(exception.expires_at)}</span>
              <span>por {exception.requested_by} · revisado por {exception.approved_by || "não informado"} · criado em {date(exception.created_at)}</span>
              <span>motivo: {exception.reason}</span>
              <span>justificativa: {exception.justification}</span>
              <details className={styles.subsection}><summary>Registro canônico da exceção (JSON)</summary><pre className={styles.pre}>{JSON.stringify(exception, null, 2)}</pre></details>
              <div className={styles.actions}>
                <button type="button" disabled={busy} onClick={() => setExceptionUpdate({
                  id: exception.id, next_status: exception.status === "solicitado" ? "em_analise" : "aprovado",
                  approved_retention_days: "", rejection_reason: "",
                })}>Usar para revisão</button>
              </div>
            </li>)}
          </ul>
          <details className={styles.subsection}>
            <summary>Solicitar exceção formal</summary>
            <div className={styles.formGrid}>
              <Field label="Categoria da exceção"><select value={exceptionForm.category} onChange={e => setExceptionForm({ ...exceptionForm, category: e.target.value })}>{CATS.map(category => <option key={category} value={category}>{category}</option>)}</select></Field>
              <Field label="Referência do campo"><input value={exceptionForm.field_reference} onChange={e => setExceptionForm({ ...exceptionForm, field_reference: e.target.value })} /></Field>
              <Field label="Dias solicitados"><input type="number" min={1} value={exceptionForm.requested_retention_days} onChange={e => setExceptionForm({ ...exceptionForm, requested_retention_days: e.target.value })} /></Field>
              <Field label="Expira em" help="Se vazio, o servidor calcula a partir dos dias solicitados."><input type="date" value={exceptionForm.expires_at} onChange={e => setExceptionForm({ ...exceptionForm, expires_at: e.target.value })} /></Field>
              <Field label="Política vinculada" help="Opcional: ID UUID de uma política que permita exceção."><input value={exceptionForm.policy_id} onChange={e => setExceptionForm({ ...exceptionForm, policy_id: e.target.value })} /></Field>
              <div className={styles.full}><Field label="Motivo da exceção" help="Mínimo de 10 caracteres."><textarea rows={2} value={exceptionForm.reason} onChange={e => setExceptionForm({ ...exceptionForm, reason: e.target.value })} /></Field></div>
              <div className={styles.full}><Field label="Justificativa da exceção" help="Mínimo de 10 caracteres; registra a base da decisão."><textarea rows={2} value={exceptionForm.justification} onChange={e => setExceptionForm({ ...exceptionForm, justification: e.target.value })} /></Field></div>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => mutate(
              ENDPOINTS.exceptions, "POST",
              { ...exceptionForm, requested_retention_days: Number(exceptionForm.requested_retention_days) },
              "Exceção formal registrada.",
              () => setExceptionForm({ category: "contato", field_reference: "", reason: "", justification: "", requested_retention_days: "180", expires_at: "", policy_id: "" }),
            )}>Solicitar exceção formal</button>
          </details>
          <details className={styles.subsection}>
            <summary>Atualizar status da exceção</summary>
            <div className={styles.formGrid}>
              <Field label="ID da exceção"><input value={exceptionUpdate.id} onChange={e => setExceptionUpdate({ ...exceptionUpdate, id: e.target.value })} /></Field>
              <Field label="Próximo status"><select value={exceptionUpdate.next_status} onChange={e => setExceptionUpdate({ ...exceptionUpdate, next_status: e.target.value })}>{EX_STATUS.map(status => <option key={status} value={status}>{status}</option>)}</select></Field>
              <Field label="Dias aprovados"><input type="number" min={1} value={exceptionUpdate.approved_retention_days} onChange={e => setExceptionUpdate({ ...exceptionUpdate, approved_retention_days: e.target.value })} /></Field>
              <Field label="Motivo da rejeição" help="Obrigatório (mínimo 10 caracteres) quando o status for rejeitado."><input value={exceptionUpdate.rejection_reason} onChange={e => setExceptionUpdate({ ...exceptionUpdate, rejection_reason: e.target.value })} /></Field>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => mutate(
              `${ENDPOINTS.exceptions}/${exceptionUpdate.id}`, "PATCH",
              {
                next_status: exceptionUpdate.next_status,
                ...(exceptionUpdate.approved_retention_days ? { approved_retention_days: Number(exceptionUpdate.approved_retention_days) } : {}),
                ...(exceptionUpdate.rejection_reason ? { rejection_reason: exceptionUpdate.rejection_reason } : {}),
              },
              "Status da exceção atualizado.",
            )}>Atualizar status da exceção</button>
          </details>
        </section>

        <section className={styles.panel} aria-labelledby="retention-jobs-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="retention-jobs-title">Jobs de descarte ({jobs.length})</h3><p>Execução registrada com contagens de varredura, expirados e descartes simulados.</p></div>
          </div>
          <ul className={styles.recordList}>
            {jobs.map(job => <li key={job.id}>
              <strong>{job.status} · job {job.id.slice(0, 8)}</strong>
              <span>total_scanned {job.total_scanned} · total_expired {job.total_expired} · total_disposed {job.total_disposed}</span>
              <span>iniciado por {job.initiated_by} em {dateTime(job.created_at)} · finalizado em {dateTime(job.finished_at)}</span>
              <span>notas: {job.notes || "nenhuma"}</span>
              <details className={styles.subsection}><summary>Registro canônico do job (JSON)</summary><pre className={styles.pre}>{JSON.stringify(job, null, 2)}</pre></details>
            </li>)}
          </ul>
          <div className={styles.formGrid}>
            <div className={styles.full}><Field label="Notas do job"><textarea rows={2} value={jobNotes} onChange={e => setJobNotes(e.target.value)} /></Field></div>
          </div>
          <button type="button" className={styles.primary} disabled={busy} onClick={() => mutate(
            ENDPOINTS.jobs, "POST", { notes: jobNotes || "Job manual via console de TI" },
            "Job de descarte executado (simulação sintética).",
            () => setJobNotes(""),
          )}>Executar job de descarte</button>
        </section>

        <section className={styles.panel} aria-labelledby="retention-logs-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="retention-logs-title">Histórico minimizado ({logs.length})</h3><p>Somente hash de referência, categoria, método e data — sem conteúdo pessoal.</p></div>
          </div>
          <ul className={styles.recordList}>
            {logs.map(log => <li key={log.id}>
              <strong>{log.category} / {log.field_reference}</strong>
              <span>hash {String(log.record_reference_hash).slice(0, 16)} · método {log.disposal_method} · {log.retention_days_applied ?? "—"} dias</span>
              <span>descartado em {dateTime(log.disposed_at)} · {log.details || "sem detalhe"}</span>
              <details className={styles.subsection}><summary>Registro canônico do log (JSON)</summary><pre className={styles.pre}>{JSON.stringify(log, null, 2)}</pre></details>
            </li>)}
          </ul>
        </section>

        <section className={styles.panel}>
          <h3>Limites e decisões pendentes</h3>
          <p className={styles.note}>
            O job de descarte é uma <strong>simulação sintética</strong>: conta políticas e exceções expiradas e grava logs minimizados, mas <strong>não apaga dados pessoais reais</strong> em produção. As políticas e prazos semeados são exemplos; a retenção efetiva, as bases legais, o descarte real e a retenção excepcional exigem <strong>parecer jurídico</strong> e decisão do proprietário (LGPD, CLT e obrigações fiscais). Esta tela não envia dados a provedores, não configura produção e não substitui validação legal. <strong>Produção: NO-GO.</strong>
          </p>
        </section>
      </>}
    </section>
  );
}
