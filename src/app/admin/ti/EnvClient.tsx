"use client";
// UX-PRO-03 — 4ª promoção "com prova": PLT-17, inventário de ambientes e
// verificações de isolamento. Antes: protótipo órfão, hex inline, `any`, fetch
// sem verificação de status, campos sem rótulo e um único <p> para qualquer
// falha. Agora: aba real do TiConsole, dois contratos preservados, papel
// admin/ti decidido no servidor, fonte/data-base, drill-down ao registro
// canônico e quatro estados de leitura com retry.
//
// HONESTIDADE (requisito extra desta família): a migração 055 semeia um
// registro chamado "production" com has_real_data=true. Esta tela é um
// INVENTÁRIO DECLARATIVO — não conecta, não configura e não ativa ambiente
// algum. Nenhuma ação aqui é virada de produção; produção segue NO-GO.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import UiState from "@/components/ui/UiState";
import styles from "./EnvClient.module.css";

type Env = {
  id: string; name: string; env_type: string; status: string;
  db_name: string; db_user: string; storage_bucket: string; domain: string | null;
  is_production: boolean; has_real_data: boolean;
  isolation_verified_at: string | null; isolation_verified_by: string | null;
  notes: string | null; created_by: string | null; created_at?: string; updated_at?: string;
};
type Check = {
  id: string; env_id: string; check_type: string; status: string;
  details: unknown; checked_by: string | null; checked_at: string;
};
type ReadState = { kind: "loading" } | { kind: "ready" } | { kind: "denied" } | { kind: "error"; detail: string };

const ENDPOINTS = {
  envs: "/api/admin/environments",
  checks: "/api/admin/environments/checks",
} as const;
const ENV_TYPES = ["development", "homologation", "production", "preview"] as const;
const CHECK_TYPES = ["real_data_scan", "preview_data_check", "isolation_verify", "account_separation"] as const;
const CHECK_STATUS = ["pendente", "passou", "falhou", "aviso"] as const;

const ERROR_LABELS: Record<string, string> = {
  forbidden: "Sua sessão não tem autorização para consultar ambientes. Entre com uma conta individual de TI ou administração.",
  unauthorized: "Sua sessão expirou. Entre novamente para consultar os ambientes.",
  name_min_3: "O nome do ambiente precisa ter pelo menos 3 caracteres.",
  invalid_env_type: "Selecione um tipo de ambiente válido.",
  db_storage_required: "Informe banco, usuário e bucket com pelo menos 3 caracteres cada.",
  production_must_have_real_data_flag: "Um ambiente marcado como produção exige o sinalizador de dados reais (regra do servidor).",
  non_production_cannot_have_real_data: "Um ambiente que não é de produção não pode ter o sinalizador de dados reais.",
  duplicate_name_or_db: "Já existe um ambiente com este nome ou com este banco.",
  invalid_id: "O ambiente selecionado não é válido. Recarregue a leitura.",
  invalid_env_id: "Selecione um ambiente válido para a verificação.",
  invalid_status: "A situação informada não é válida.",
  invalid_check_type: "Selecione um tipo de verificação válido.",
  preview_has_real_data: "O servidor recusou: um preview não pode ter dados reais.",
  non_production_has_real_data: "O servidor recusou: ambiente fora de produção não pode ter dados reais.",
  env_not_found: "O ambiente não foi localizado. Recarregue a leitura.",
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
function dateTime(value?: string | null) {
  if (!value) return "Não informada";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "Data indisponível" : parsed.toLocaleString("pt-BR");
}
function latest(values: Array<string | null | undefined>) {
  const valid = values.filter(Boolean).map(value => new Date(value as string).valueOf()).filter(Number.isFinite);
  if (!valid.length) return "Não informada";
  return new Date(Math.max(...valid)).toLocaleString("pt-BR");
}
function Field({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return <label className={styles.field}><span>{label}</span>{children}{help && <small>{help}</small>}</label>;
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: "include", cache: "no-store", ...init });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { response, data };
}

export default function EnvClient() {
  const [readState, setReadState] = useState<ReadState>({ kind: "loading" });
  const [envs, setEnvs] = useState<Env[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [operationError, setOperationError] = useState("");
  const [form, setForm] = useState({ name: "", env_type: "development", db_name: "", db_user: "", storage_bucket: "", domain: "", is_production: false, has_real_data: false, notes: "" });
  const [checkForm, setCheckForm] = useState({ env_id: "", check_type: "isolation_verify", status: "passou", details: '{"verified": true}' });
  const sequence = useRef(0);
  const operation = useRef(false);

  const clear = useCallback(() => {
    setEnvs([]); setChecks([]);
  }, []);

  // `clearFeedback=false` é usado por mutate: a mensagem de sucesso precisa
  // sobreviver ao reload interno. Botão/retry/montagem limpam mensagens velhas.
  const load = useCallback(async (clearFeedback = true) => {
    const current = ++sequence.current;
    if (clearFeedback) { setMessage(""); setOperationError(""); }
    setReadState({ kind: "loading" });
    try {
      const [e, c] = await Promise.all([
        requestJson(ENDPOINTS.envs),
        requestJson(ENDPOINTS.checks),
      ]);
      // Resposta fora de ordem: descarta e mantém a leitura mais recente.
      if (current !== sequence.current) return;
      const all = [e, c];
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
      setEnvs(Array.isArray(e.data.environments) ? e.data.environments as Env[] : []);
      setChecks(Array.isArray(c.data.checks) ? c.data.checks as Check[] : []);
      setReadState({ kind: "ready" });
    } catch {
      if (current !== sequence.current) return;
      clear();
      setReadState({ kind: "error", detail: "Falha de rede ao consultar ambientes. Verifique a conexão e tente novamente." });
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

  const dataBaseCheck = latest(checks.map(check => check.checked_at));
  const dataBaseIsolation = latest(envs.map(env => env.isolation_verified_at));
  const empty = envs.length === 0 && checks.length === 0;
  const feedback = readState.kind === "loading"
    ? <UiState variant="loading" title="Carregando ambientes" detail="Consultando o inventário de ambientes e as verificações de isolamento." />
    : readState.kind === "denied"
      ? <UiState variant="denied" title="Acesso não autorizado" detail="Esta superfície é restrita a contas individuais de TI ou administração. Nenhum dado foi exposto." onRetry={() => load()} retryLabel="Tentar novamente" />
      : readState.kind === "error"
        ? <UiState variant="error" title="Falha na consulta" detail={readState.detail} onRetry={() => load()} retryLabel="Tentar novamente" />
        : empty
          ? <UiState variant="empty" title="Nenhum ambiente registrado" detail="As tabelas estão vazias. O formulário abaixo registra o primeiro ambiente declarado." onRetry={() => load()} retryLabel="Atualizar" />
          : null;

  function registerCheck() {
    let details: unknown;
    try { details = JSON.parse(checkForm.details || "{}"); }
    catch { setOperationError("O campo de detalhes precisa conter um JSON válido."); return; }
    if (!checkForm.env_id) { setOperationError("Selecione um ambiente para a verificação."); return; }
    void mutate(ENDPOINTS.checks, "POST",
      { env_id: checkForm.env_id, check_type: checkForm.check_type, status: checkForm.status, details },
      "Verificação registrada.");
  }

  return (
    <section className={styles.workspace} aria-busy={busy || readState.kind === "loading"}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>PLT-17 · Inventário de ambientes</p>
          <h2>Ambientes e isolamento</h2>
          <p>Registro declarativo de ambientes, contas, buckets e verificações de isolamento informadas pela equipe.</p>
          <p className={styles.source}>
            Fonte: tabelas <code>environments</code> e <code>env_data_checks</code>.
            {" "}Data-base: verificação mais recente em <strong>{dataBaseCheck}</strong>; isolamento confirmado em <strong>{dataBaseIsolation}</strong>.
          </p>
        </div>
        <button type="button" onClick={() => load()} disabled={busy || readState.kind === "loading"}>Atualizar leitura</button>
      </header>

      <aside className={styles.notice} aria-label="Aviso sobre o escopo desta tela">
        <strong>Este é um inventário declarativo.</strong>
        <p>A tela <strong>não conecta</strong>, <strong>não configura</strong> e <strong>não ativa</strong> nenhum ambiente. Registrar um ambiente aqui não cria banco, bucket, domínio, conta ou provedor — apenas grava metadados no banco desta instalação.</p>
        <p>Os quatro registros semeados pela migração 055, inclusive o chamado <code>production</code>, são <strong>exemplos sintéticos</strong>: não representam um ambiente em execução, não contêm dados reais nesta instalação e não autorizam publicação.</p>
        <p><strong>Produção: NO-GO.</strong> O gate <code>docs/PRODUCAO-GATE.md</code> mantém 10 itens em aberto; domínio, CNPJ, provedores, segredos, backup e a autorização de publicação dependem de <strong>decisão do proprietário</strong>. Nenhuma ação desta tela é virada de produção.</p>
      </aside>

      {feedback}
      {message && <p role="status" className={styles.success}>{message}</p>}
      {operationError && <p role="alert" className={styles.error}>{operationError}</p>}

      {readState.kind === "ready" && <>
        <section className={styles.panel} aria-labelledby="env-list-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="env-list-title">Ambientes registrados ({envs.length})</h3><p>Ordenados por tipo; cada card abre o registro canônico completo.</p></div>
            <span className={styles.count}>{envs.length} registro(s)</span>
          </div>
          <ul className={styles.recordList}>
            {envs.map(env => <li key={env.id}>
              <strong>{env.name} · {env.env_type} · {env.status}</strong>
              <span>banco {env.db_name} · usuário {env.db_user} · bucket {env.storage_bucket} · domínio {env.domain || "não informado"}</span>
              <span className={env.is_production || env.has_real_data ? styles.warning : styles.ok}>
                sinalizadores declarativos: produção {env.is_production ? "sim" : "não"} · dados reais {env.has_real_data ? "sim" : "não"}
              </span>
              <span>isolamento verificado em {dateTime(env.isolation_verified_at)} por {env.isolation_verified_by || "não informado"} · criado por {env.created_by || "não informado"}</span>
              {env.notes && <span>{env.notes}</span>}
              <details className={styles.subsection}><summary>Registro canônico do ambiente (JSON)</summary><pre className={styles.pre}>{JSON.stringify(env, null, 2)}</pre></details>
              <div className={styles.actions}>
                <button type="button" disabled={busy} onClick={() => mutate(
                  ENDPOINTS.envs, "PATCH", { id: env.id, status: "isolado" }, "Isolamento confirmado.",
                )}>Verificar isolamento</button>
                <button type="button" disabled={busy} onClick={() => setCheckForm({ ...checkForm, env_id: env.id })}>Usar para verificação</button>
              </div>
            </li>)}
          </ul>
          <details className={styles.subsection}>
            <summary>Registrar ambiente</summary>
            <p className={styles.note}>Os campos abaixo alimentam apenas este inventário. As regras do servidor exigem coerência entre <code>is_production</code> e <code>has_real_data</code>; nenhum provedor é contatado.</p>
            <div className={styles.formGrid}>
              <Field label="Nome"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Tipo de ambiente"><select value={form.env_type} onChange={e => setForm({ ...form, env_type: e.target.value })}>{ENV_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select></Field>
              <Field label="Banco"><input value={form.db_name} onChange={e => setForm({ ...form, db_name: e.target.value })} /></Field>
              <Field label="Usuário do banco"><input value={form.db_user} onChange={e => setForm({ ...form, db_user: e.target.value })} /></Field>
              <Field label="Bucket de armazenamento"><input value={form.storage_bucket} onChange={e => setForm({ ...form, storage_bucket: e.target.value })} /></Field>
              <Field label="Domínio" help="Opcional; apenas texto descritivo no inventário."><input value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} /></Field>
              <label className={styles.check}><input type="checkbox" checked={form.is_production} onChange={e => setForm({ ...form, is_production: e.target.checked })} />Sinalizador declarativo: produção</label>
              <label className={styles.check}><input type="checkbox" checked={form.has_real_data} onChange={e => setForm({ ...form, has_real_data: e.target.checked })} />Sinalizador declarativo: dados reais</label>
              <div className={styles.full}><Field label="Observações"><textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => mutate(
              ENDPOINTS.envs, "POST", form, "Ambiente registrado no inventário.",
              () => setForm({ name: "", env_type: "development", db_name: "", db_user: "", storage_bucket: "", domain: "", is_production: false, has_real_data: false, notes: "" }),
            )}>Registrar ambiente</button>
          </details>
        </section>

        <section className={styles.panel} aria-labelledby="env-checks-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="env-checks-title">Verificações de isolamento ({checks.length})</h3><p>Resultados informados pela equipe; o servidor valida as combinações e recusa previews com dados reais.</p></div>
            <span className={styles.count}>{checks.length} registro(s)</span>
          </div>
          <ul className={styles.recordList}>
            {checks.map(check => <li key={check.id}>
              <strong>{check.check_type} · {check.status}</strong>
              <span>ambiente {envs.find(env => env.id === check.env_id)?.name || check.env_id} · por {check.checked_by || "não informado"} · em {dateTime(check.checked_at)}</span>
              <details className={styles.subsection}><summary>Registro canônico da verificação (JSON)</summary><pre className={styles.pre}>{JSON.stringify(check, null, 2)}</pre></details>
            </li>)}
          </ul>
          <details className={styles.subsection}>
            <summary>Registrar verificação</summary>
            <div className={styles.formGrid}>
              <Field label="Ambiente"><select value={checkForm.env_id} onChange={e => setCheckForm({ ...checkForm, env_id: e.target.value })}><option value="">Selecione um ambiente</option>{envs.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}</select></Field>
              <Field label="Tipo de verificação"><select value={checkForm.check_type} onChange={e => setCheckForm({ ...checkForm, check_type: e.target.value })}>{CHECK_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select></Field>
              <Field label="Resultado"><select value={checkForm.status} onChange={e => setCheckForm({ ...checkForm, status: e.target.value })}>{CHECK_STATUS.map(status => <option key={status} value={status}>{status}</option>)}</select></Field>
              <div className={styles.full}><Field label="Detalhes (JSON)" help="Opcional; precisa ser um JSON válido."><textarea rows={3} value={checkForm.details} onChange={e => setCheckForm({ ...checkForm, details: e.target.value })} /></Field></div>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={registerCheck}>Registrar verificação</button>
          </details>
        </section>
      </>}
    </section>
  );
}
