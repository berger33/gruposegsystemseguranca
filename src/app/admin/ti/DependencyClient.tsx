"use client";
// UX-PRO-03 — promoção "com prova" da família PLT-14.
// Antes: protótipo órfão, sem rota, com `alert`, estilos inline hex, `any` e
// nenhum estado de leitura. Agora: aba real do TiConsole, com os quatro
// contratos preservados, autorização decidida no servidor (admin/ti), fonte e
// data-base declaradas, drill-down ao registro canônico e quatro estados de
// leitura distintos com retry. Nenhuma permissão, rota ou migração mudou.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import UiState from "@/components/ui/UiState";
import styles from "./DependencyClient.module.css";

type Audit = {
  id: string; audit_date: string; total_dependencies: number; prod_dependencies: number;
  dev_dependencies: number; vulnerabilities_info: number; vulnerabilities_low: number;
  vulnerabilities_moderate: number; vulnerabilities_high: number; vulnerabilities_critical: number;
  outdated_count: number; status: string; notes: string | null; created_by: string | null;
};
type Vuln = {
  id: string; package_name: string; severity: string; title: string; url: string | null;
  vulnerable_versions: string | null; patched_versions: string | null; status: string;
};
type Update = {
  id: string; package_name: string; current_version: string; latest_version: string;
  update_type: string; is_breaking: boolean; status: string; notes: string | null; created_at?: string;
};
type Lock = {
  lockfile: { lockfileVersion: number; packagesCount: number } | null;
  package: { dependencies: string[]; devDependencies: string[]; scripts: string[] } | null;
};
type ReadState = { kind: "loading" } | { kind: "ready" } | { kind: "denied" } | { kind: "error"; detail: string };

const ENDPOINTS = {
  audits: "/api/admin/dependencies/audits",
  vulnerabilities: "/api/admin/dependencies/vulnerabilities",
  updates: "/api/admin/dependencies/updates",
  lockfile: "/api/admin/dependencies/lockfile",
} as const;

const ERROR_LABELS: Record<string, string> = {
  forbidden: "Sua sessão não tem autorização para consultar as dependências. Entre com uma conta individual de TI ou administração.",
  unauthorized: "Sua sessão expirou. Entre novamente para consultar as dependências.",
  lockfile_read_failed: "O servidor não conseguiu ler o lockfile. Confira o arquivo e tente novamente.",
  package_required: "Informe o nome do pacote.",
  version_required: "Informe a versão atual e a versão mais recente.",
  invalid_update_type: "Selecione um tipo de atualização válido.",
  invalid_id: "O registro selecionado não é válido. Recarregue a lista.",
  invalid_status: "A situação informada não é válida.",
  not_found: "O registro não foi localizado. Recarregue a lista.",
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
  return Number.isNaN(parsed.valueOf()) ? "Data indisponível" : parsed.toLocaleString("pt-BR");
}
function number(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("pt-BR") : "—";
}
function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return <label className={styles.field}><span>{label}</span>{children}{help && <small>{help}</small>}</label>;
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: "include", cache: "no-store", ...init });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { response, data };
}

export default function DependencyClient() {
  const [readState, setReadState] = useState<ReadState>({ kind: "loading" });
  const [audits, setAudits] = useState<Audit[]>([]);
  const [vulns, setVulns] = useState<Vuln[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [lock, setLock] = useState<Lock | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [operationError, setOperationError] = useState("");
  const [auditForm, setAuditForm] = useState({ total_dependencies: 77, prod_dependencies: 31, dev_dependencies: 7, vulnerabilities_info: 0, vulnerabilities_low: 0, vulnerabilities_moderate: 0, vulnerabilities_high: 0, vulnerabilities_critical: 0, outdated_count: 0, notes: "" });
  const [updateForm, setUpdateForm] = useState({ package_name: "", current_version: "", latest_version: "", update_type: "patch", is_breaking: false, notes: "" });
  const sequence = useRef(0);
  const operation = useRef(false);

  const clear = useCallback(() => {
    setAudits([]); setVulns([]); setUpdates([]); setLock(null);
  }, []);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setReadState({ kind: "loading" });
    try {
      const [a, v, u, l] = await Promise.all([
        requestJson(ENDPOINTS.audits),
        requestJson(ENDPOINTS.vulnerabilities),
        requestJson(ENDPOINTS.updates),
        requestJson(ENDPOINTS.lockfile),
      ]);
      // Resposta fora de ordem: descarta e mantém a leitura mais recente.
      if (current !== sequence.current) return;
      const all = [a, v, u, l];
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
      setAudits(Array.isArray(a.data.audits) ? a.data.audits as Audit[] : []);
      setVulns(Array.isArray(v.data.vulnerabilities) ? v.data.vulnerabilities as Vuln[] : []);
      setUpdates(Array.isArray(u.data.updates) ? u.data.updates as Update[] : []);
      setLock(l.data.lockfile || l.data.package
        ? { lockfile: (l.data.lockfile as Lock["lockfile"]) ?? null, package: (l.data.package as Lock["package"]) ?? null }
        : null);
      setReadState({ kind: "ready" });
    } catch {
      if (current !== sequence.current) return;
      clear();
      setReadState({ kind: "error", detail: "Falha de rede ao consultar as dependências. Verifique a conexão e tente novamente." });
    }
  }, [clear]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(path: string, method: "POST" | "PATCH", body: unknown, success: string) {
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
      await load();
    } catch {
      setOperationError("Não foi possível concluir a operação. Confira a conexão e tente novamente.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  const latestAudit = audits[0];
  const dataBase = latestAudit ? date(latestAudit.audit_date) : "nenhuma auditoria registrada";
  const empty = audits.length === 0 && vulns.length === 0 && updates.length === 0 && !lock;
  const feedback = readState.kind === "loading"
    ? <UiState variant="loading" title="Carregando dependências" detail="Consultando auditorias, vulnerabilidades, atualizações e o lockfile do servidor." />
    : readState.kind === "denied"
      ? <UiState variant="denied" title="Acesso não autorizado" detail="Esta superfície é restrita a contas individuais de TI ou administração. Nenhum dado foi exposto." onRetry={load} retryLabel="Tentar novamente" />
      : readState.kind === "error"
        ? <UiState variant="error" title="Falha na consulta" detail={readState.detail} onRetry={load} retryLabel="Tentar novamente" />
        : empty
          ? <UiState variant="empty" title="Nenhum registro de dependências" detail="As tabelas estão vazias. O formulário abaixo registra a primeira auditoria informada pelo operador." onRetry={load} retryLabel="Atualizar" />
          : null;

  return (
    <section className={styles.workspace} aria-busy={busy || readState.kind === "loading"}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>PLT-14 · Operação de TI</p>
          <h2>Dependências, vulnerabilidades e atualizações</h2>
          <p>Auditorias informadas pelo operador, vulnerabilidades registradas, atualizações pendentes e o lockfile lido no servidor.</p>
          <p className={styles.source}>
            Fonte: tabelas <code>dependency_audits</code>, <code>dependency_vulnerabilities</code>, <code>dependency_updates</code> e <code>package-lock.json</code>.
            {" "}Data-base: auditoria mais recente em <strong>{dataBase}</strong>. As contas vêm do banco; nenhum número é inventado na tela.
          </p>
        </div>
        <button type="button" onClick={load} disabled={busy || readState.kind === "loading"}>Atualizar leitura</button>
      </header>

      {feedback}
      {message && <p role="status" className={styles.success}>{message}</p>}
      {operationError && <p role="alert" className={styles.error}>{operationError}</p>}

      {readState.kind === "ready" && <>
        <section className={styles.panel} aria-labelledby="dep-lock-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="dep-lock-title">Lockfile e package.json</h3><p>Leitura feita no servidor; o arquivo não é enviado ao navegador por upload.</p></div>
            <span className={styles.count}>versão {lock?.lockfile?.lockfileVersion ?? "—"}</span>
          </div>
          <p className={styles.note}>
            lockfileVersion <strong>{number(lock?.lockfile?.lockfileVersion)}</strong> · pacotes no lockfile <strong>{number(lock?.lockfile?.packagesCount)}</strong> · dependências declaradas <strong>{number(lock?.package?.dependencies?.length)}</strong> · dependências de desenvolvimento <strong>{number(lock?.package?.devDependencies?.length)}</strong>.
          </p>
          <details className={styles.subsection}><summary>Registro canônico do lockfile (JSON)</summary><pre className={styles.pre}>{JSON.stringify(lock, null, 2)}</pre></details>
        </section>

        <section className={styles.panel} aria-labelledby="dep-audits-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="dep-audits-title">Auditorias ({audits.length})</h3><p>Ordenadas pela data de auditoria. Cada registro abre o conteúdo completo.</p></div>
            <span className={styles.count}>{audits.length} registro(s)</span>
          </div>
          <ul className={styles.recordList}>
            {audits.map(audit => <li key={audit.id}>
              <strong>{date(audit.audit_date)} · {audit.status}</strong>
              <span>total {number(audit.total_dependencies)} · produção {number(audit.prod_dependencies)} · desenvolvimento {number(audit.dev_dependencies)} · desatualizados {number(audit.outdated_count)}</span>
              <span>vulnerabilidades: alta {number(audit.vulnerabilities_high)} · crítica {number(audit.vulnerabilities_critical)} · moderada {number(audit.vulnerabilities_moderate)} · baixa {number(audit.vulnerabilities_low)} · informativa {number(audit.vulnerabilities_info)}</span>
              <span>registrado por {audit.created_by || "não informado"}</span>
              <details className={styles.subsection}><summary>Registro canônico da auditoria (JSON)</summary><pre className={styles.pre}>{JSON.stringify(audit, null, 2)}</pre></details>
              <div className={styles.actions}>
                <button type="button" disabled={busy} onClick={() => mutate(ENDPOINTS.audits, "PATCH", { id: audit.id, status: "aprovado", notes: "Revisado via TI" }, "Auditoria aprovada.")}>Aprovar</button>
                <button type="button" disabled={busy} onClick={() => mutate(ENDPOINTS.audits, "PATCH", { id: audit.id, status: "corrigido", notes: "Corrigido via TI" }, "Auditoria marcada como corrigida.")}>Corrigido</button>
              </div>
            </li>)}
          </ul>
          <details className={styles.subsection}>
            <summary>Registrar auditoria informada manualmente</summary>
            <p className={styles.note}>Este formulário não executa <code>npm audit</code>: ele registra os números informados pelo operador, com data do servidor. A apuração automática continua sendo feita pelo CI.</p>
            <div className={styles.formGrid}>
              <Field label="Total de dependências"><input type="number" min={0} value={auditForm.total_dependencies} onChange={e => setAuditForm({ ...auditForm, total_dependencies: Number(e.target.value) || 0 })} /></Field>
              <Field label="Dependências de produção"><input type="number" min={0} value={auditForm.prod_dependencies} onChange={e => setAuditForm({ ...auditForm, prod_dependencies: Number(e.target.value) || 0 })} /></Field>
              <Field label="Dependências de desenvolvimento"><input type="number" min={0} value={auditForm.dev_dependencies} onChange={e => setAuditForm({ ...auditForm, dev_dependencies: Number(e.target.value) || 0 })} /></Field>
              <Field label="Vulnerabilidades altas"><input type="number" min={0} value={auditForm.vulnerabilities_high} onChange={e => setAuditForm({ ...auditForm, vulnerabilities_high: Number(e.target.value) || 0 })} /></Field>
              <Field label="Vulnerabilidades críticas"><input type="number" min={0} value={auditForm.vulnerabilities_critical} onChange={e => setAuditForm({ ...auditForm, vulnerabilities_critical: Number(e.target.value) || 0 })} /></Field>
              <Field label="Pacotes desatualizados"><input type="number" min={0} value={auditForm.outdated_count} onChange={e => setAuditForm({ ...auditForm, outdated_count: Number(e.target.value) || 0 })} /></Field>
              <Field label="Observações" help="Opcional; fica no registro da auditoria."><textarea rows={3} value={auditForm.notes} onChange={e => setAuditForm({ ...auditForm, notes: e.target.value })} /></Field>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => mutate(ENDPOINTS.audits, "POST", { ...auditForm, audit_raw: { source: "operator_informed", date: new Date().toISOString() } }, "Auditoria registrada.")}>Registrar auditoria</button>
          </details>
        </section>

        <section className={styles.panel} aria-labelledby="dep-vulns-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="dep-vulns-title">Vulnerabilidades ({vulns.length})</h3><p>Ordenadas por severidade. Nenhum aviso é criado automaticamente pela tela.</p></div>
          </div>
          <ul className={styles.recordList}>
            {vulns.map(vuln => <li key={vuln.id}>
              <strong>{vuln.severity} · {vuln.package_name} · {vuln.status}</strong>
              <span>{vuln.title}</span>
              <span>{vuln.vulnerable_versions || "—"} → {vuln.patched_versions || "—"}</span>
              {vuln.url && <a href={vuln.url} target="_blank" rel="noopener noreferrer">Referência pública</a>}
            </li>)}
          </ul>
        </section>

        <section className={styles.panel} aria-labelledby="dep-updates-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="dep-updates-title">Atualizações pendentes ({updates.length})</h3><p>Aprovação e aplicação continuam registradas na auditoria do servidor.</p></div>
          </div>
          <ul className={styles.recordList}>
            {updates.map(update => <li key={update.id}>
              <strong>{update.package_name} · {update.current_version} → {update.latest_version}</strong>
              <span>{update.update_type} · {update.status}{update.is_breaking && <> · <strong className={styles.breaking}>BREAKING (mudança incompatível)</strong></>}</span>
              {update.notes && <span>{update.notes}</span>}
              <div className={styles.actions}>
                <button type="button" disabled={busy} onClick={() => mutate(ENDPOINTS.updates, "PATCH", { id: update.id, status: "aprovado", notes: "Aprovado via TI" }, "Atualização aprovada.")}>Aprovar</button>
                <button type="button" disabled={busy} onClick={() => mutate(ENDPOINTS.updates, "PATCH", { id: update.id, status: "corrigido", notes: "Aplicado via TI" }, "Atualização marcada como aplicada.")}>Aplicado</button>
              </div>
            </li>)}
          </ul>
          <details className={styles.subsection}>
            <summary>Registrar atualização pendente</summary>
            <div className={styles.formGrid}>
              <Field label="Nome do pacote"><input value={updateForm.package_name} onChange={e => setUpdateForm({ ...updateForm, package_name: e.target.value })} /></Field>
              <Field label="Tipo de atualização"><select value={updateForm.update_type} onChange={e => setUpdateForm({ ...updateForm, update_type: e.target.value })}><option value="major">major</option><option value="minor">minor</option><option value="patch">patch</option><option value="security">security</option></select></Field>
              <Field label="Versão atual"><input value={updateForm.current_version} onChange={e => setUpdateForm({ ...updateForm, current_version: e.target.value })} /></Field>
              <Field label="Versão mais recente"><input value={updateForm.latest_version} onChange={e => setUpdateForm({ ...updateForm, latest_version: e.target.value })} /></Field>
              <Field label="Observações / changelog"><textarea rows={3} value={updateForm.notes} onChange={e => setUpdateForm({ ...updateForm, notes: e.target.value })} /></Field>
              <label className={styles.check}><input type="checkbox" checked={updateForm.is_breaking} onChange={e => setUpdateForm({ ...updateForm, is_breaking: e.target.checked })} />Mudança incompatível (breaking)</label>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => mutate(ENDPOINTS.updates, "POST", updateForm, "Atualização pendente registrada.")}>Registrar atualização</button>
          </details>
        </section>

        <section className={styles.panel}>
          <h3>CI e limites</h3>
          <p className={styles.note}>O workflow de CI executa <code>npm ci</code>, <code>npm audit</code>, <code>npm test</code>, typecheck, build e a verificação de migrações. Esta tela <strong>não</strong> instala pacotes, não executa comandos no servidor e não aplica atualizações: apenas registra a decisão humana. O status real do CI precisa ser conferido no GitHub Actions; os números abaixo vêm exclusivamente do banco e do lockfile lido agora.</p>
        </section>
      </>}
    </section>
  );
}
