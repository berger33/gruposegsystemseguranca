"use client";
import UiTaskWorkspace from "@/components/ui/UiTaskWorkspace";
import { useEffect, useState } from "react";
import styles from "./DirectorySourcesClient.module.css";

type Source = { id: string; name: string; rag_key: string; client_account_id: string | null; root_key: string; relative_path: string; is_active: boolean; last_synced_at: string | null; last_report: unknown };
type Report = { created?: number; unchanged?: number; failed?: unknown[]; missing?: unknown[] };

export default function DirectorySourcesClient() {
  const [sources, setSources] = useState<Source[]>([]);
  const [roots, setRoots] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<{ id: string; display_name: string }[]>([]);
  const [scopes, setScopes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [runtime, setRuntime] = useState<{ enabled: boolean; model: string } | null>(null);
  const [form, setForm] = useState({ name: "", rag_key: "publico", client_account_id: "", root_key: "", relative_path: "." });

  async function load() {
    setLoading(true); setError(false);
    try {
      const response = await fetch("/api/admin/ai-rag-directory-sources");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSources(data.items); setRoots(data.roots); setAccounts(data.accounts); setScopes(data.scopes); setRuntime(data.runtime);
    } catch {
      setError(true);
      setMessage("Não foi possível carregar as fontes. Confira sua sessão, as migrações e as raízes permitidas no servidor.");
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function mutate(payload: object) {
    if (busy) return;
    setBusy(true); setError(false);
    try {
      const response = await fetch("/api/admin/ai-rag-directory-sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage(data.note ? `${data.note} Novos: ${data.created}; sem alteração: ${data.unchanged}; falhas: ${data.failed.length}; arquivos ausentes: ${data.missing.length}.` : "Fonte atualizada.");
      await load();
    } catch (cause) {
      setError(true); setMessage(`Operação não concluída: ${cause instanceof Error ? cause.message : "falha de rede"}`);
    } finally { setBusy(false); }
  }

  return <UiTaskWorkspace className={styles.workspace} aria-busy={busy || loading}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>Conhecimento e assistentes</p><h2>Fontes em pastas</h2>
        <p>Cadastre pastas autorizadas do servidor para importar arquivos de texto e Markdown como rascunhos. A equipe revisa e publica os documentos na curadoria de bases.</p></div>
      <button type="button" className={styles.secondary} disabled={busy || loading} onClick={() => void load()}>Atualizar fontes</button>
    </header>

    <div className={styles.notice}>
      <strong>Como funciona</strong>
      <ol><li>Escolha uma raiz já autorizada no servidor e informe a pasta relativa.</li><li>Sincronize para criar ou atualizar rascunhos para revisão.</li><li>Revise o conteúdo e publique cada documento na tela “Bases dos assistentes”.</li></ol>
      <p>Arquivos removidos da pasta não apagam documentos já publicados. Essa tela não mostra caminhos físicos do computador.</p>
    </div>

    {runtime && <p className={styles.runtime}><strong>Configuração de IA:</strong> Ollama {runtime.enabled ? "habilitado" : "desabilitado"}; modelo {runtime.model || "não informado"}. Isso descreve a configuração, não confirma que o serviço está saudável ou respondendo.</p>}
    {loading && <p role="status" className={styles.state}>Carregando fontes e configuração…</p>}
    {!loading && roots.length === 0 && <div className={styles.empty} role="status"><strong>Nenhuma raiz de documentos está configurada.</strong><p>O operador do servidor precisa configurar <code>RAG_DOCUMENT_ROOTS_JSON</code> fora do repositório. Caminhos e segredos não devem ser adicionados ao GitHub.</p></div>}

    <form className={styles.form} onSubmit={event => { event.preventDefault(); void mutate({ action: "create", ...form }); }}>
      <div className={styles.sectionTitle}><div><h3>Cadastrar uma fonte</h3><p>Defina o escopo antes de apontar para a pasta. A fonte nova começa sem conteúdo publicado.</p></div></div>
      <div className={styles.fields}>
        <label>Nome para identificação<input required minLength={3} maxLength={120} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
        <label>Área da base<select value={form.rag_key} onChange={event => setForm({ ...form, rag_key: event.target.value, client_account_id: "" })}>{scopes.map(key => <option key={key} value={key}>{key}</option>)}</select></label>
        {form.rag_key === "cliente" && <label>Conta do cliente<select required value={form.client_account_id} onChange={event => setForm({ ...form, client_account_id: event.target.value })}><option value="">Selecione uma conta</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.display_name}</option>)}</select><small>A sincronização fica vinculada somente à conta escolhida.</small></label>}
        <label>Raiz permitida<select required value={form.root_key} onChange={event => setForm({ ...form, root_key: event.target.value })}><option value="">Selecione uma raiz</option>{roots.map(key => <option key={key} value={key}>{key}</option>)}</select><small>As opções são configuradas no ambiente do servidor.</small></label>
        <label>Pasta dentro da raiz<input required maxLength={500} value={form.relative_path} onChange={event => setForm({ ...form, relative_path: event.target.value })} /><small>Use um caminho relativo, por exemplo: procedimentos/rh. Não informe um caminho absoluto.</small></label>
      </div>
      <button type="submit" disabled={busy || !roots.length}>{busy ? "Salvando…" : "Cadastrar fonte"}</button>
    </form>

    <section className={styles.sources} aria-labelledby="directory-sources-title">
      <div className={styles.sectionTitle}><div><h3 id="directory-sources-title">Fontes cadastradas <span className={styles.count}>{sources.length}</span></h3><p>Estado operacional e última sincronização. Relatórios técnicos ficam recolhidos por padrão.</p></div></div>
      {!loading && sources.length === 0 && roots.length > 0 && <p className={styles.empty}>Ainda não há fontes cadastradas. Use o formulário acima para começar.</p>}
      <div className={styles.sourceList}>{sources.map(source => {
        const report = source.last_report && typeof source.last_report === "object" ? source.last_report as Report : null;
        return <article className={styles.source} key={source.id}>
          <div className={styles.sourceHeader}><div><h4>{source.name}</h4><p>{source.rag_key}{source.rag_key === "cliente" && accounts.find(account => account.id === source.client_account_id)?.display_name ? ` · ${accounts.find(account => account.id === source.client_account_id)?.display_name}` : ""}</p></div><span className={`${styles.badge} ${source.is_active ? styles.active : styles.paused}`}>{source.is_active ? "Ativa" : "Pausada"}</span></div>
          <dl className={styles.meta}><div><dt>Última sincronização</dt><dd>{source.last_synced_at ? new Date(source.last_synced_at).toLocaleString("pt-BR") : "Ainda não sincronizada"}</dd></div>{report && <div><dt>Resultado da última leitura</dt><dd>{report.created ?? "—"} novos · {report.unchanged ?? "—"} sem alteração · {report.failed?.length ?? "—"} falhas · {report.missing?.length ?? "—"} ausentes</dd></div>}</dl>
          <div className={styles.actions}><button type="button" disabled={busy || !source.is_active} onClick={() => void mutate({ action: "sync", id: source.id })}>Sincronizar para revisão</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => void mutate({ action: "toggle", id: source.id, is_active: !source.is_active })}>{source.is_active ? "Pausar fonte" : "Ativar fonte"}</button></div>
          <details className={styles.diagnostics}><summary>Configuração da pasta</summary><dl className={styles.meta}><div><dt>Raiz permitida</dt><dd>{source.root_key}</dd></div><div><dt>Pasta relativa</dt><dd><code>{source.relative_path}</code></dd></div></dl><p className={styles.pathHint}>São identificadores da configuração autorizada; o caminho físico do servidor não é exposto.</p></details>
          {source.last_report != null && <details className={styles.diagnostics}><summary>Detalhes técnicos da sincronização (JSON)</summary><pre>{JSON.stringify(source.last_report, null, 2)}</pre></details>}
        </article>;
      })}</div>
    </section>
    {message && <p role={error ? "alert" : "status"} className={`${styles.message} ${error ? styles.error : ""}`}>{message}</p>}
  </UiTaskWorkspace>;
}
