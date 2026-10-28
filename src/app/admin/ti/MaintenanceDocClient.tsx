"use client";
// UX-PRO-03 — 2ª promoção "com prova": PLT-18, documentação de manutenção.
// Antes: protótipo órfão com `document.getElementById`, hex inline, `any`,
// nenhum estado de leitura e conteúdo cortado em 2000 caracteres. Agora: aba
// real do TiConsole, dois contratos preservados, papel admin/ti decidido no
// servidor, fonte/data-base declaradas, drill-down ao registro canônico e ao
// histórico de versões, quatro estados de leitura com retry. Nenhuma permissão,
// rota, migração ou dado de produção foi alterado.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import UiState from "@/components/ui/UiState";
import styles from "./MaintenanceDocClient.module.css";

type Doc = {
  id: string; category: string; status: string; title: string; slug: string;
  content: string; version: number; is_published: boolean; published_at: string | null;
  tags: string[]; created_at: string; created_by: string | null; updated_at?: string;
};
type Hist = {
  id: string; previous_version: number | null; next_version: number;
  change_summary: string | null; changed_by: string | null; created_at: string;
};
type ReadState = { kind: "loading" } | { kind: "ready" } | { kind: "denied" } | { kind: "error"; detail: string };

const LIST = "/api/admin/maintenance/docs";
const byId = (id: string) => `/api/admin/maintenance/docs/${id}`;
const CATS = ["configuracao", "migracao", "diagnostico", "recuperacao", "arquitetura", "operacao", "seguranca", "outro"] as const;

const ERROR_LABELS: Record<string, string> = {
  forbidden: "Sua sessão não tem autorização para esta documentação. Entre com uma conta individual de TI ou administração.",
  unauthorized: "Sua sessão expirou. Entre novamente para consultar a documentação.",
  invalid_category: "Selecione uma categoria válida.",
  title_min_10: "O título precisa ter pelo menos 10 caracteres.",
  content_min_50: "O conteúdo precisa ter pelo menos 50 caracteres.",
  slug_min_3: "Informe um slug com pelo menos 3 caracteres ou deixe em branco para gerar do título.",
  invalid_status: "A situação informada não é válida.",
  invalid_id: "O documento selecionado não é válido. Recarregue a lista.",
  not_found: "O documento não foi localizado. Recarregue a lista.",
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

export default function MaintenanceDocClient() {
  const [readState, setReadState] = useState<ReadState>({ kind: "loading" });
  const [detailState, setDetailState] = useState<ReadState | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selected, setSelected] = useState<Doc | null>(null);
  const [history, setHistory] = useState<Hist[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [operationError, setOperationError] = useState("");
  const [form, setForm] = useState({ category: "arquitetura", title: "", slug: "", content: "", tags: "" });
  const [newContent, setNewContent] = useState("");
  const [lastOpenedId, setLastOpenedId] = useState<string | null>(null);
  const sequence = useRef(0);
  const detailSequence = useRef(0);
  const operation = useRef(false);

  const clear = useCallback(() => {
    setDocs([]); setSelected(null); setHistory([]); setDetailState(null);
  }, []);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setReadState({ kind: "loading" });
    try {
      const { response, data } = await requestJson(LIST);
      // Resposta fora de ordem: descarta e mantém a leitura mais recente.
      if (current !== sequence.current) return;
      if (response.status === 401 || response.status === 403) {
        clear(); setReadState({ kind: "denied" }); return;
      }
      if (!response.ok) {
        clear(); setReadState({ kind: "error", detail: translate(data.error, response.status) }); return;
      }
      // Payload validado: lista ausente ou inesperada vira vazio honesto.
      setDocs(Array.isArray(data.docs) ? data.docs as Doc[] : []);
      setSelected(null); setHistory([]); setDetailState(null);
      setReadState({ kind: "ready" });
    } catch {
      if (current !== sequence.current) return;
      clear();
      setReadState({ kind: "error", detail: "Falha de rede ao consultar a documentação. Verifique a conexão e tente novamente." });
    }
  }, [clear]);

  useEffect(() => { void load(); }, [load]);

  const openDoc = useCallback(async (id: string) => {
    const current = ++detailSequence.current;
    setDetailState({ kind: "loading" });
    setLastOpenedId(id);
    setSelected(null); setHistory([]);
    try {
      const { response, data } = await requestJson(byId(id));
      if (current !== detailSequence.current) return;
      if (response.status === 401 || response.status === 403) {
        setDetailState({ kind: "denied" }); return;
      }
      if (!response.ok) {
        setDetailState({ kind: "error", detail: translate(data.error, response.status) }); return;
      }
      const doc = data.doc && typeof data.doc === "object" ? data.doc as Doc : null;
      setSelected(doc);
      setHistory(Array.isArray(data.history) ? data.history as Hist[] : []);
      setDetailState(doc ? { kind: "ready" } : { kind: "error", detail: "O servidor não devolveu o documento solicitado." });
    } catch {
      if (current !== detailSequence.current) return;
      setDetailState({ kind: "error", detail: "Falha de rede ao abrir o documento. Tente novamente." });
    }
  }, []);

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
      const doc = data.doc && typeof data.doc === "object" ? data.doc as Doc : null;
      setMessage(doc ? `${success} v${doc.version} · ${doc.slug}` : success);
      reset?.();
      await load();
      // Reabre o registro canônico devolvido (uma nova versão tem outro id).
      if (doc?.id) await openDoc(doc.id);
    } catch {
      setOperationError("Não foi possível concluir a operação. Confira a conexão e tente novamente.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }

  const lastPublished = docs.find(doc => doc.published_at) ?? null;
  const dataBase = lastPublished ? date(lastPublished.published_at) : "nenhuma publicação registrada";
  const empty = docs.length === 0;
  const feedback = readState.kind === "loading"
    ? <UiState variant="loading" title="Carregando documentação" detail="Consultando os documentos de manutenção e suas versões." />
    : readState.kind === "denied"
      ? <UiState variant="denied" title="Acesso não autorizado" detail="Esta superfície é restrita a contas individuais de TI ou administração. Nenhum conteúdo foi exposto." onRetry={load} retryLabel="Tentar novamente" />
      : readState.kind === "error"
        ? <UiState variant="error" title="Falha na consulta" detail={readState.detail} onRetry={load} retryLabel="Tentar novamente" />
        : empty
          ? <UiState variant="empty" title="Nenhum documento de manutenção" detail="Não há registros no banco. O formulário abaixo cria o primeiro, com versão e histórico." onRetry={load} retryLabel="Atualizar" />
          : null;

  const detailFeedback = detailState?.kind === "loading"
    ? <UiState variant="loading" title="Abrindo documento" detail="Consultando o conteúdo completo e o histórico de versões." />
    : detailState?.kind === "denied"
      ? <UiState variant="denied" title="Acesso não autorizado" detail="Sua sessão não pode abrir este documento." onRetry={() => lastOpenedId && openDoc(lastOpenedId)} retryLabel="Tentar novamente" />
      : detailState?.kind === "error"
        ? <UiState variant="error" title="Falha ao abrir o documento" detail={detailState.detail} onRetry={load} retryLabel="Recarregar lista" />
        : null;

  return (
    <section className={styles.workspace} aria-busy={busy || readState.kind === "loading"}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>PLT-18 · Documentação técnica</p>
          <h2>Documentação de manutenção</h2>
          <p>Registros versionados para outro programador: configuração, migração, diagnóstico, recuperação, arquitetura, operação e segurança.</p>
          <p className={styles.source}>
            Fonte: tabelas <code>maintenance_docs</code> e <code>maintenance_doc_history</code>.
            {" "}Data-base: publicação mais recente em <strong>{dataBase}</strong>. Conteúdo e versões vêm do banco; nada é inventado na tela.
          </p>
        </div>
        <button type="button" onClick={load} disabled={busy || readState.kind === "loading"}>Atualizar leitura</button>
      </header>

      {feedback}
      {message && <p role="status" className={styles.success}>{message}</p>}
      {operationError && <p role="alert" className={styles.error}>{operationError}</p>}

      {readState.kind === "ready" && <>
        <section className={styles.panel} aria-labelledby="maint-list-title">
          <div className={styles.sectionHeading}>
            <div><h3 id="maint-list-title">Documentos ({docs.length})</h3><p>Ordenados por categoria, slug e versão. Abrir mostra o conteúdo integral e o histórico.</p></div>
            <span className={styles.count}>{docs.length} registro(s)</span>
          </div>
          <ul className={styles.recordList}>
            {docs.map(doc => <li key={doc.id}>
              <strong>{doc.title}</strong>
              <span>v{doc.version} · {doc.category} · {doc.status} · {doc.is_published ? "visível na leitura pública" : "interno"}</span>
              <span>slug {doc.slug} · publicado em {date(doc.published_at)} · criado em {date(doc.created_at)} · por {doc.created_by || "não informado"}</span>
              <span>tags: {Array.isArray(doc.tags) && doc.tags.length ? doc.tags.join(", ") : "nenhuma"}</span>
              <div className={styles.actions}>
                <button type="button" disabled={busy} onClick={() => openDoc(doc.id)}>Abrir e ver histórico</button>
              </div>
            </li>)}
          </ul>
          <details className={styles.subsection}>
            <summary>Registrar documento</summary>
            <p className={styles.note}>O servidor gera a versão automaticamente por slug, grava o histórico e decide o papel. Título mínimo de 10 caracteres; conteúdo mínimo de 50.</p>
            <div className={styles.formGrid}>
              <Field label="Categoria"><select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATS.map(category => <option key={category} value={category}>{category}</option>)}</select></Field>
              <Field label="Slug" help="Opcional; gerado a partir do título quando vazio."><input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} /></Field>
              <Field label="Título"><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
              <Field label="Tags separadas por vírgula"><input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} /></Field>
              <div className={styles.full}><Field label="Conteúdo"><textarea rows={6} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} /></Field></div>
            </div>
            <button type="button" className={styles.primary} disabled={busy} onClick={() => mutate(
              LIST, "POST",
              { ...form, tags: form.tags ? form.tags.split(",").map(item => item.trim()).filter(Boolean) : [] },
              "Documento registrado.",
              () => setForm({ category: "arquitetura", title: "", slug: "", content: "", tags: "" }),
            )}>Registrar documento</button>
          </details>
        </section>

        {detailState && <section className={styles.panel} aria-labelledby="maint-detail-title">
          <div className={styles.sectionHeading}><div><h3 id="maint-detail-title">Documento selecionado</h3><p>Leitura integral, registro canônico e decisões de versão.</p></div></div>
          {detailFeedback}
          {selected && detailState.kind === "ready" && <>
            <h4 className={styles.detailTitle}>{selected.title} · v{selected.version}</h4>
            <p className={styles.note}>{selected.status} · {selected.is_published ? "publicado" : "não publicado"} · {selected.category} · slug {selected.slug} · publicado em {date(selected.published_at)} · tags {Array.isArray(selected.tags) ? selected.tags.join(", ") : ""}</p>
            <pre className={styles.pre}>{selected.content}</pre>
            <details className={styles.subsection}><summary>Registro canônico do documento (JSON)</summary><pre className={styles.pre}>{JSON.stringify(selected, null, 2)}</pre></details>
            <h4 className={styles.detailTitle}>Histórico de versões ({history.length})</h4>
            <ul className={styles.recordList}>
              {history.map(item => <li key={item.id}>
                <strong>v{item.previous_version ?? "—"} → v{item.next_version}</strong>
                <span>{item.change_summary || "Sem resumo de alteração"}</span>
                <span>por {item.changed_by || "não informado"} em {date(item.created_at)}</span>
              </li>)}
            </ul>
            <div className={styles.actions}>
              <button type="button" disabled={busy} onClick={() => mutate(
                byId(selected.id), "PATCH",
                { status: "publicado", publish: true, change_summary: "Publicação via TI" },
                "Documento publicado.",
              )}>Publicar</button>
            </div>
            <details className={styles.subsection}>
              <summary>Nova versão com conteúdo revisado</summary>
              <Field label="Novo conteúdo (mínimo de 50 caracteres)" help="Uma versão nova cria outro registro e preserva o anterior no histórico.">
                <textarea rows={5} value={newContent} onChange={e => setNewContent(e.target.value)} />
              </Field>
              <button type="button" className={styles.primary} disabled={busy} onClick={() => mutate(
                byId(selected.id), "PATCH",
                { content: newContent, change_summary: "Atualização de conteúdo via TI" },
                "Nova versão registrada.",
                () => setNewContent(""),
              )}>Nova versão</button>
            </details>
          </>}
        </section>}

        <section className={styles.panel}>
          <h3>Limites</h3>
          <p className={styles.note}>Os sete documentos semeados pela migração 056 são conteúdo sintético de exemplo, não procedimentos homologados. Publicar torna o registro visível na leitura pública de <code>/api/docs</code>; a decisão de publicar continua humana e auditada no servidor. Esta tela não executa migrações, backup ou restauração.</p>
        </section>
      </>}
    </section>
  );
}
