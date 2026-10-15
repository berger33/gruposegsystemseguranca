"use client";

// UX-07 / UX-PRO-08A / EXT-08 — Base de Conhecimento e Procedimentos Operacionais.
// A tela consome exclusivamente as rotas canônicas de ext-knowledge-api.mjs.
// Cada leitura tem estado próprio e honesto: lista, detalhe/versões, histórico e ciência
// nunca reutilizam um array vazio para esconder uma falha ou uma recusa.
// Em falhas transitórias de releitura na mesma entidade, preserva o dado anterior com
// faixa "desatualizado", carimbo de data/hora pt-BR e repetição. Em 401/403, fail-closed.

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import UiBadge, { type UiBadgeTone } from "../../../components/ui/UiBadge";
import UiState from "../../../components/ui/UiState";
import styles from "../../../components/ui/UiWorkspace.module.css";
import {
  KNOWLEDGE_ACCESS_ROLES,
  KNOWLEDGE_CATEGORY_SUGGESTIONS,
  KNOWLEDGE_TRANSITIONS,
  honestCount,
  honestDate,
  honestDateTime,
  honestText,
  knowledgeAccessRolesLabel,
  knowledgeAcknowledgmentSourceLabel,
  knowledgeCategoryLabel,
  knowledgeErrorFootnote,
  knowledgeErrorVariant,
  knowledgeHistorySummary,
  knowledgeRoleLabel,
  knowledgeStatusLabel,
  knowledgeStatusTone,
  knowledgeTagsLabel,
  type KnowledgeErrorDescriptor,
} from "../../../lib/knowledge-vocabulary.mjs";
import {
  knowledgeRequest,
  knowledgeRead,
  type KnowledgeResult,
} from "../../../lib/knowledge-request";

type KnowledgeArticle = {
  id: string;
  slug: string;
  title: string;
  summary?: string | null;
  content?: string | null;
  category?: string | null;
  status?: string | null;
  version?: number | null;
  is_published?: boolean | null;
  published_at?: string | null;
  tags?: string[] | null;
  access_roles?: string[] | null;
  ack_count?: number | null;
  user_acknowledged?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  creator_name?: string | null;
  reviewer_name?: string | null;
  approver_name?: string | null;
};

type HistoryEntry = {
  id: string;
  previous_version?: number | null;
  next_version?: number | null;
  change_summary?: string | null;
  changer_name?: string | null;
  created_at?: string | null;
};

type AcknowledgmentEntry = {
  id: string;
  user_name?: string | null;
  user_role?: string | null;
  acknowledged_at?: string | null;
  notes?: string | null;
  source?: string | null;
};

type VersionDetail = { article: KnowledgeArticle; versions: KnowledgeArticle[] };

/**
 * Estado honesto de leitura (UX-PRO-08A, padrão 07F–07L):
 * `ready` guarda a hora da última leitura concluída (`readAt`);
 * uma releitura mantém o conteúdo com `refreshing` e, se falhar de forma transitória, com `staleError`;
 * negativa (401/403) descarta o dado protegido imediatamente (fail-closed).
 */
type Load<T> =
  | { phase: "loading" }
  | { phase: "ready"; data: T; readAt: string; refreshing?: boolean; staleError?: KnowledgeErrorDescriptor }
  | { phase: "empty" }
  | { phase: "failed"; error: KnowledgeErrorDescriptor };

const isDenied = (error: KnowledgeErrorDescriptor) =>
  error.status === 401 || error.status === 403 || error.kind === "denied";

const readTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

const TABS = [
  { id: "procedimentos", label: "Procedimentos" },
  { id: "detalhe", label: "Detalhe e versões" },
  { id: "historico", label: "Histórico e ciência" },
  { id: "novo", label: "Novo POP" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Apresenta o ciclo de cada leitura sem jamais converter falha em coleção vazia. */
function ReadBoundary<T>({
  state,
  subject,
  emptyTitle,
  emptyDetail,
  onRetry,
  children,
}: {
  state: Load<T>;
  subject: string;
  emptyTitle: string;
  emptyDetail: string;
  onRetry?: () => void;
  children: (data: T) => ReactNode;
}) {
  if (state.phase === "loading") {
    return <UiState variant="loading" title={`Carregando ${subject}…`} detail="A consulta ainda não terminou." />;
  }
  if (state.phase === "failed") {
    const error = state.error;
    if (isDenied(error)) {
      return (
        <UiState
          variant="denied"
          title={error.title}
          detail={`${error.detail} Menu não é autorização: a navegação não substitui a decisão do servidor. ${knowledgeErrorFootnote(error)}`}
          onRetry={error.canRetry ? onRetry : undefined}
        />
      );
    }
    return (
      <UiState
        variant="error"
        title={error.title}
        detail={`${error.detail} A falha não significa que não existam ${subject}. ${knowledgeErrorFootnote(error)}`}
        onRetry={error.canRetry ? onRetry : undefined}
      />
    );
  }
  if (state.phase === "empty") {
    return <UiState variant="empty" title={emptyTitle} detail={emptyDetail} />;
  }
  return <>{children(state.data)}</>;
}

const newOperationKey = (label: string) => `ext08-ui-${label}-${crypto.randomUUID()}`;

export default function KnowledgeWorkspace() {
  const [activeTab, setActiveTab] = useState<TabId>("procedimentos");
  const [articles, setArticles] = useState<Load<KnowledgeArticle[]>>({ phase: "loading" });
  const [versionDetail, setVersionDetail] = useState<Load<VersionDetail>>({ phase: "empty" });
  const [history, setHistory] = useState<Load<HistoryEntry[]>>({ phase: "empty" });
  const [acknowledgments, setAcknowledgments] = useState<Load<AcknowledgmentEntry[]>>({ phase: "empty" });
  const [selectedId, setSelectedId] = useState("");
  const selectedIdRef = useRef("");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const idempotencyKeys = useRef<Record<string, string>>({});

  const [filterCategory, setFilterCategory] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [mutationError, setMutationError] = useState<KnowledgeErrorDescriptor | null>(null);
  const [notice, setNotice] = useState("");

  const [formSlug, setFormSlug] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formSummary, setFormSummary] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState("operacional");
  const [formTags, setFormTags] = useState("");
  const [formRoles, setFormRoles] = useState<string[]>([]);

  const [transitionStatus, setTransitionStatus] = useState("");
  const [transitionNotes, setTransitionNotes] = useState("");
  const [transitionReason, setTransitionReason] = useState("");
  const [ackNotes, setAckNotes] = useState("");

  const applyRead = <T,>(
    setter: (updater: (previous: Load<T>) => Load<T>) => void,
    result: KnowledgeResult<T>,
    isEmpty: (data: T) => boolean,
  ) => {
    if (!result.ok) {
      setter(previous => {
        if (previous.phase === "ready" && !isDenied(result.error)) {
          return { ...previous, refreshing: false, staleError: result.error };
        }
        return { phase: "failed", error: result.error };
      });
      return;
    }
    if (isEmpty(result.data)) {
      setter(() => ({ phase: "empty" }));
      return;
    }
    setter(() => ({ phase: "ready", data: result.data, readAt: new Date().toISOString() }));
  };

  const beginRead = <T,>(setter: (updater: (previous: Load<T>) => Load<T>) => void) => {
    setter(previous =>
      previous.phase === "ready"
        ? { ...previous, refreshing: true, staleError: undefined }
        : { phase: "loading" },
    );
  };

  const loadArticles = useCallback(async () => {
    beginRead<KnowledgeArticle[]>(setArticles);
    const params = new URLSearchParams();
    if (filterCategory) params.set("category", filterCategory);
    if (filterQuery) params.set("q", filterQuery);
    if (filterStatus) params.set("status", filterStatus);
    const suffix = params.toString();
    const result = await knowledgeRead<{ items?: KnowledgeArticle[] }>(
      `/api/ext/knowledge/articles${suffix ? `?${suffix}` : ""}`,
      data => !!data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items),
    );
    applyRead<KnowledgeArticle[]>(
      setArticles,
      result.ok ? { ...result, data: result.data.items || [] } : result,
      items => items.length === 0,
    );
  }, [filterCategory, filterQuery, filterStatus]);

  const loadVersionDetail = useCallback(async (id: string) => {
    setVersionDetail(prev => (prev.phase === "ready" && selectedIdRef.current === id ? { ...prev, refreshing: true, staleError: undefined } : { phase: "loading" }));
    const result = await knowledgeRead<{ article?: KnowledgeArticle; versions?: KnowledgeArticle[] }>(
      `/api/ext/knowledge/articles/${id}`,
      data => !!data && typeof data === "object" && !!(data as { article?: unknown }).article && typeof (data as { article?: unknown }).article === "object",
    );
    if (selectedIdRef.current !== id) return;
    if (!result.ok) {
      setVersionDetail(previous => {
        if (previous.phase === "ready" && !isDenied(result.error)) {
          return { ...previous, refreshing: false, staleError: result.error };
        }
        return { phase: "failed", error: result.error };
      });
      return;
    }
    if (!result.data.article) {
      setVersionDetail({ phase: "empty" });
      return;
    }
    setVersionDetail({
      phase: "ready",
      data: {
        article: result.data.article,
        versions: Array.isArray(result.data.versions) ? result.data.versions : [],
      },
      readAt: new Date().toISOString(),
    });
  }, []);

  const loadHistory = useCallback(async (id: string) => {
    setHistory(prev => (prev.phase === "ready" && selectedIdRef.current === id ? { ...prev, refreshing: true, staleError: undefined } : { phase: "loading" }));
    const result = await knowledgeRead<{ history?: HistoryEntry[] }>(
      `/api/ext/knowledge/articles/${id}`,
      data => !!data && typeof data === "object" && Array.isArray((data as { history?: unknown }).history),
    );
    if (selectedIdRef.current !== id) return;
    applyRead<HistoryEntry[]>(
      setHistory,
      result.ok ? { ...result, data: result.data.history || [] } : result,
      items => items.length === 0,
    );
  }, []);

  const loadAcknowledgments = useCallback(async (id: string) => {
    setAcknowledgments(prev => (prev.phase === "ready" && selectedIdRef.current === id ? { ...prev, refreshing: true, staleError: undefined } : { phase: "loading" }));
    const result = await knowledgeRead<{ items?: AcknowledgmentEntry[] }>(
      `/api/ext/knowledge/articles/${id}/acknowledgments`,
      data => !!data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items),
    );
    if (selectedIdRef.current !== id) return;
    applyRead<AcknowledgmentEntry[]>(
      setAcknowledgments,
      result.ok ? { ...result, data: result.data.items || [] } : result,
      items => items.length === 0,
    );
  }, []);

  useEffect(() => {
    void loadArticles();
  }, [loadArticles]);

  const selectArticle = useCallback((article: KnowledgeArticle) => {
    selectedIdRef.current = article.id;
    setSelectedId(article.id);
    setTransitionStatus(KNOWLEDGE_TRANSITIONS[article.status || ""]?.[0] || "");
    setTransitionNotes("");
    setTransitionReason("");
    // Preservação é POR PROCEDIMENTO: trocar de artigo descarta o detalhe/histórico anterior
    setVersionDetail({ phase: "loading" });
    setHistory({ phase: "loading" });
    setAcknowledgments({ phase: "loading" });
    setActiveTab("detalhe");
    void loadVersionDetail(article.id);
    void loadHistory(article.id);
    void loadAcknowledgments(article.id);
  }, [loadAcknowledgments, loadHistory, loadVersionDetail]);

  async function mutate<T>(name: string, url: string, method: "POST" | "PATCH", value?: unknown): Promise<T | null> {
    const currentKey = idempotencyKeys.current[name] || newOperationKey(name);
    idempotencyKeys.current[name] = currentKey;
    setMutationError(null);
    const result = await knowledgeRequest<T>(url, {
      method,
      headers: { "idempotency-key": currentKey },
      body: value === undefined ? "{}" : JSON.stringify(value),
    });
    if (!result.ok) {
      setMutationError(result.error);
      return null;
    }
    delete idempotencyKeys.current[name];
    return result.data;
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const article = await mutate<{ article?: KnowledgeArticle }>("create-article", "/api/ext/knowledge/articles", "POST", {
      slug: formSlug,
      title: formTitle,
      summary: formSummary || undefined,
      content: formContent,
      category: formCategory,
      tags: formTags.split(",").map(tag => tag.trim()).filter(Boolean),
      access_roles: formRoles,
    });
    if (!article?.article) return;
    setNotice(`Procedimento “${article.article.title}” criado como ${knowledgeStatusLabel(article.article.status)} na versão ${honestCount(article.article.version)}.`);
    setFormSlug("");
    setFormTitle("");
    setFormSummary("");
    setFormContent("");
    setFormTags("");
    setFormRoles([]);
    await loadArticles();
    selectArticle(article.article);
  }

  async function handleTransition(event: FormEvent<HTMLFormElement>, article: KnowledgeArticle) {
    event.preventDefault();
    if (!transitionStatus) return;
    const response = await mutate<{ article?: KnowledgeArticle }>(`transition-${article.id}`, `/api/ext/knowledge/articles/${article.id}/transition`, "POST", {
      status: transitionStatus,
      notes: transitionNotes || undefined,
      reason: transitionReason || undefined,
    });
    if (!response?.article) return;
    setNotice(`Ciclo de vida atualizado para ${knowledgeStatusLabel(response.article.status)}.`);
    setTransitionNotes("");
    setTransitionReason("");
    await loadArticles();
    selectArticle(response.article);
  }

  async function handleAcknowledge(article: KnowledgeArticle) {
    const response = await mutate<{ version?: number }>(`ack-${article.id}`, `/api/ext/knowledge/articles/${article.id}/acknowledge`, "POST", { notes: ackNotes || undefined });
    if (!response) return;
    setNotice(`Ciência formal confirmada na versão ${honestCount(response.version)}.`);
    setAckNotes("");
    await loadArticles();
    selectArticle(article);
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight"
      ? (index + 1) % TABS.length
      : event.key === "ArrowLeft"
        ? (index + TABS.length - 1) % TABS.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? TABS.length - 1
            : -1;
    if (next < 0) return;
    event.preventDefault();
    setActiveTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  const renderStale = <T,>(state: Load<T>, retry: () => void, testId: string) => {
    if (state.phase !== "ready") return null;
    return (
      <>
        <p className={styles.hint} data-testid={`${testId}-leitura`}>
          Última leitura concluída às {readTime(state.readAt)}.
          {state.refreshing ? " Atualizando agora — o conteúdo exibido é o dessa leitura." : ""}
        </p>
        {state.staleError ? (
          <div role="alert" data-testid={`${testId}-desatualizado`}>
            <UiState
              variant={knowledgeErrorVariant(state.staleError)}
              title="A releitura falhou; o conteúdo abaixo é da última leitura concluída e pode estar desatualizado."
              detail={`${state.staleError.detail} Última leitura concluída às ${readTime(state.readAt)}. ${knowledgeErrorFootnote(state.staleError)}`}
              onRetry={state.staleError.canRetry ? retry : undefined}
              retryLabel="Tentar a leitura de novo"
            />
          </div>
        ) : null}
      </>
    );
  };

  return (
    <main className={styles.workspace}>
      <nav aria-label="Trilha" className={styles.breadcrumbNav}>
        <a href="/admin">Início</a> · <span aria-current="page">Base de conhecimento</span>
      </nav>
      <p className={styles.kicker}>EXT-08 · UX-07 · UX-PRO-08A</p>
      <h1>Base de Conhecimento e Procedimentos Operacionais</h1>
      <p className={styles.lede}>Procedimentos versionados, busca por escopo, ciclo de vida canônico, histórico imutável e ciência vinculada à versão. A tela não presume acesso: cada consulta é confirmada pelo servidor.</p>

      {notice ? <UiState variant="success" title={notice} /> : null}
      {mutationError ? <UiState variant={mutationError.kind === "denied" ? "denied" : "error"} title={mutationError.title} detail={`${mutationError.detail} ${mutationError.kind === "denied" ? "Menu não é autorização: a decisão é do servidor." : ""} ${knowledgeErrorFootnote(mutationError)}`} /> : null}

      <div className={styles.tabs} role="tablist" aria-label="Jornada da base de conhecimento">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            id={`knowledge-tab-${tab.id}`}
            ref={node => { tabRefs.current[index] = node; }}
            className={activeTab === tab.id ? styles.tabActive : styles.tab}
            role="tab"
            type="button"
            aria-selected={activeTab === tab.id}
            aria-controls={`knowledge-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={event => onTabKey(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.tabPanel}>
        {activeTab === "procedimentos" ? (
          <section id="knowledge-panel-procedimentos" role="tabpanel" aria-labelledby="knowledge-tab-procedimentos" tabIndex={0} className={styles.panel} data-testid="knowledge-articles">
            <h2 className={styles.panelTitle}>Procedimentos canônicos</h2>
            <form className={styles.fieldset} onSubmit={event => { event.preventDefault(); void loadArticles(); }}>
              <legend>Busca e filtros</legend>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label htmlFor="knowledge-query">Buscar</label>
                  <input id="knowledge-query" value={filterQuery} onChange={event => setFilterQuery(event.target.value)} placeholder="Título, conteúdo ou identificador" />
                </div>
                <div className={styles.field}>
                  <label htmlFor="knowledge-category">Categoria</label>
                  <select id="knowledge-category" value={filterCategory} onChange={event => setFilterCategory(event.target.value)}>
                    <option value="">Todas as categorias</option>
                    {KNOWLEDGE_CATEGORY_SUGGESTIONS.map(category => <option key={category} value={category}>{knowledgeCategoryLabel(category)}</option>)}
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="knowledge-status">Situação</label>
                  <select id="knowledge-status" value={filterStatus} onChange={event => setFilterStatus(event.target.value)}>
                    <option value="">Todas as situações</option>
                    {Object.keys(KNOWLEDGE_TRANSITIONS).map(status => <option key={status} value={status}>{knowledgeStatusLabel(status)}</option>)}
                  </select>
                </div>
              </div>
              <div className={styles.actions}><button className="primary" type="submit">Aplicar filtros</button></div>
            </form>

            {renderStale(articles, () => void loadArticles(), "knowledge-articles-list")}

            <ReadBoundary state={articles} subject="os procedimentos" emptyTitle="Nenhum procedimento encontrado" emptyDetail="A leitura funcionou; não há procedimento no escopo ou nos filtros atuais." onRetry={() => void loadArticles()}>
              {items => <div className={styles.cards} data-testid="knowledge-articles-list">
                {items.map(article => <article className={`${styles.card} ${selectedId === article.id ? styles.knowledgeCardSelected : ""}`} key={article.id}>
                  <button type="button" className={styles.knowledgeArticleButton} onClick={() => selectArticle(article)} aria-label={`Abrir procedimento ${article.title}`}>
                    <span className={styles.knowledgeCardHeader}>
                      <span className={styles.knowledgeEyebrow}>{knowledgeCategoryLabel(article.category)} · versão {honestCount(article.version)}</span>
                      <UiBadge tone={knowledgeStatusTone(article.status) as UiBadgeTone} srPrefix="Situação">{knowledgeStatusLabel(article.status)}</UiBadge>
                    </span>
                    <strong className={styles.cardTitle}>{honestText(article.title)}</strong>
                    <span className={styles.knowledgeSummary}>{honestText(article.summary, "Resumo não informado.")}</span>
                    <span className={styles.knowledgeMeta}>Etiquetas: {knowledgeTagsLabel(article.tags)} · Ciências: {honestCount(article.ack_count)}</span>
                    <span className={styles.knowledgeMeta}>{article.user_acknowledged ? "Sua ciência está registrada nesta versão." : article.status === "publicado" ? "Sua ciência ainda não foi registrada nesta versão." : "Ciência disponível somente após publicação."}</span>
                  </button>
                </article>)}
              </div>}
            </ReadBoundary>
          </section>
        ) : null}

        {activeTab === "detalhe" ? (
          <section id="knowledge-panel-detalhe" role="tabpanel" aria-labelledby="knowledge-tab-detalhe" tabIndex={0} className={styles.panel} data-testid="knowledge-detail">
            <h2 className={styles.panelTitle}>Detalhe da versão e ciclo de vida</h2>
            {renderStale(versionDetail, () => selectedId && void loadVersionDetail(selectedId), "knowledge-version-detail")}
            <ReadBoundary state={versionDetail} subject="o detalhe da versão" emptyTitle="Nenhum procedimento selecionado" emptyDetail="Escolha um procedimento na lista para consultar a versão e seu ciclo de vida." onRetry={() => selectedId && void loadVersionDetail(selectedId)}>
              {detail => {
                const article = detail.article;
                const transitions = KNOWLEDGE_TRANSITIONS[article.status || ""] || [];
                return <div className={styles.stackWide}>
                  <article className={styles.notice} data-testid="knowledge-version-detail">
                    <div className={styles.knowledgeDetailHeader}>
                      <div>
                        <h3 className={styles.cardTitle}>{honestText(article.title)}</h3>
                        <p className={styles.hint}>Identificador: {honestText(article.slug)} · versão {honestCount(article.version)}</p>
                      </div>
                      <UiBadge tone={knowledgeStatusTone(article.status) as UiBadgeTone} srPrefix="Situação">{knowledgeStatusLabel(article.status)}</UiBadge>
                    </div>
                    <dl className={styles.facts}>
                      <div><dt>Categoria</dt><dd>{knowledgeCategoryLabel(article.category)}</dd></div>
                      <div><dt>Resumo</dt><dd>{honestText(article.summary, "Resumo não informado.")}</dd></div>
                      <div><dt>Acesso</dt><dd>{knowledgeAccessRolesLabel(article.access_roles)}</dd></div>
                      <div><dt>Publicado em</dt><dd>{honestDateTime(article.published_at)}</dd></div>
                      <div><dt>Responsável pela criação</dt><dd>{honestText(article.creator_name)}</dd></div>
                    </dl>
                    <section className={styles.knowledgeContent} aria-labelledby="knowledge-content-heading">
                      <h4 id="knowledge-content-heading" className={styles.knowledgeSubheading}>Conteúdo do procedimento</h4>
                      <p>{honestText(article.content)}</p>
                    </section>
                    {article.status === "publicado" ? (
                      <section className={styles.knowledgeAcknowledgmentAction} aria-labelledby="knowledge-self-ack-heading">
                        <h4 id="knowledge-self-ack-heading" className={styles.knowledgeSubheading}>Sua ciência nesta versão</h4>
                        {article.user_acknowledged ? <p className={styles.hint}>Sua ciência já está registrada para esta versão.</p> : <div className={styles.rowWrap}>
                          <div className={styles.grow}><label htmlFor="knowledge-ack-notes">Observação opcional</label><input id="knowledge-ack-notes" value={ackNotes} onChange={event => setAckNotes(event.target.value)} /></div>
                          <div className={styles.actions}><button className="primary" type="button" onClick={() => void handleAcknowledge(article)}>Confirmar ciência</button></div>
                        </div>}
                      </section>
                    ) : <p className={styles.hint}>A ciência fica disponível depois que esta versão for publicada.</p>}
                  </article>

                  <section className={styles.sectionCard} data-testid="knowledge-versions">
                    <div className={styles.padded}>
                      <h3 className={styles.cardTitle}>Versões do procedimento</h3>
                      {!detail.versions.length ? <UiState variant="empty" title="Nenhuma versão relacionada retornada" detail="A leitura do detalhe funcionou, mas não retornou outras versões para este identificador." /> : <ul className={styles.knowledgeList}>
                        {detail.versions.map(version => <li key={version.id || `${version.version}-${version.created_at}`} className={styles.knowledgeListItem}>
                          <span>Versão {honestCount(version.version)} · {knowledgeStatusLabel(version.status)}</span>
                          <span>{honestDate(version.published_at || version.created_at)}</span>
                        </li>)}
                      </ul>}
                    </div>
                  </section>

                  <section className={styles.sectionCard} data-testid="knowledge-transition">
                    <div className={styles.padded}>
                      <h3 className={styles.cardTitle}>Gerenciar ciclo de vida</h3>
                      {!transitions.length ? <UiState variant="empty" title="Nenhuma transição disponível" detail="O ciclo de vida devolvido pelo servidor não tem uma próxima etapa configurada." /> : <form className={styles.stack} onSubmit={event => void handleTransition(event, article)}>
                        <div className={styles.fieldRow}>
                          <div className={styles.field}><label htmlFor="knowledge-transition-status">Próxima situação</label><select id="knowledge-transition-status" value={transitionStatus} onChange={event => setTransitionStatus(event.target.value)}>{transitions.map(status => <option key={status} value={status}>{knowledgeStatusLabel(status)}</option>)}</select></div>
                          {transitionStatus === "aprovado" ? <div className={styles.field}><label htmlFor="knowledge-transition-notes">Notas de revisão</label><input id="knowledge-transition-notes" value={transitionNotes} onChange={event => setTransitionNotes(event.target.value)} /></div> : null}
                          {transitionStatus === "arquivado" ? <div className={styles.field}><label htmlFor="knowledge-transition-reason">Motivo do arquivamento</label><input id="knowledge-transition-reason" required value={transitionReason} onChange={event => setTransitionReason(event.target.value)} /></div> : null}
                        </div>
                        <p className={styles.hint}>O servidor valida a transição, o papel e a origem. O menu não concede essa autorização.</p>
                        <div className={styles.actions}><button className="primary" type="submit">Registrar transição</button></div>
                      </form>}
                    </div>
                  </section>
                </div>;
              }}
            </ReadBoundary>
          </section>
        ) : null}

        {activeTab === "historico" ? (
          <section id="knowledge-panel-historico" role="tabpanel" aria-labelledby="knowledge-tab-historico" tabIndex={0} className={styles.panel}>
            <h2 className={styles.panelTitle}>Histórico imutável e ciência</h2>
            <div className={styles.twoColumns}>
              <section className={styles.sectionCard} data-testid="knowledge-history">
                <div className={styles.padded}>
                  <h3 className={styles.cardTitle}>Revisões da versão</h3>
                  {renderStale(history, () => selectedId && void loadHistory(selectedId), "knowledge-history")}
                  <ReadBoundary state={history} subject="o histórico de revisões" emptyTitle="Nenhuma revisão registrada" emptyDetail="A leitura funcionou; não há alteração histórica para o procedimento selecionado." onRetry={() => selectedId && void loadHistory(selectedId)}>
                    {entries => <ul className={styles.knowledgeList}>{entries.map(entry => <li key={entry.id} className={styles.knowledgeListItem}><span>Versão {honestCount(entry.next_version)} · {knowledgeHistorySummary(entry.change_summary)}</span><span>{honestText(entry.changer_name, "Responsável não informado")} · {honestDateTime(entry.created_at)}</span></li>)}</ul>}
                  </ReadBoundary>
                </div>
              </section>
              <section className={styles.sectionCard} data-testid="knowledge-acknowledgments">
                <div className={styles.padded}>
                  <h3 className={styles.cardTitle}>Ciências e métricas</h3>
                  {renderStale(acknowledgments, () => selectedId && void loadAcknowledgments(selectedId), "knowledge-acknowledgments")}
                  <ReadBoundary state={acknowledgments} subject="as ciências registradas" emptyTitle="Nenhuma ciência registrada" emptyDetail="A leitura funcionou; nenhum colaborador confirmou ciência nesta versão." onRetry={() => selectedId && void loadAcknowledgments(selectedId)}>
                    {entries => <ul className={styles.knowledgeList}>{entries.map(entry => <li key={entry.id} className={styles.knowledgeListItem}><span>{honestText(entry.user_name, "Colaborador não informado")} · {knowledgeRoleLabel(entry.user_role)}</span><span>{honestDateTime(entry.acknowledged_at)} · {knowledgeAcknowledgmentSourceLabel(entry.source)}</span>{entry.notes ? <span>{entry.notes}</span> : <span>Sem observação registrada.</span>}</li>)}</ul>}
                  </ReadBoundary>
                </div>
              </section>
            </div>
          </section>
        ) : null}

        {activeTab === "novo" ? (
          <section id="knowledge-panel-novo" role="tabpanel" aria-labelledby="knowledge-tab-novo" tabIndex={0} className={styles.panel}>
            <h2 className={styles.panelTitle}>Novo Procedimento Operacional Padrão</h2>
            <p className={styles.hint}>A criação inicia em rascunho. A permissão de criar e de publicar é confirmada pelo servidor; o acesso ao menu não a substitui.</p>
            <form className={styles.stackWide} onSubmit={event => void handleCreate(event)}>
              <div className={styles.fieldRow}>
                <div className={styles.field}><label htmlFor="knowledge-form-slug">Identificador curto</label><input id="knowledge-form-slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={formSlug} onChange={event => setFormSlug(event.target.value)} placeholder="pop-controle-acesso" /></div>
                <div className={styles.field}><label htmlFor="knowledge-form-title">Título</label><input id="knowledge-form-title" required minLength={5} maxLength={200} value={formTitle} onChange={event => setFormTitle(event.target.value)} /></div>
                <div className={styles.field}><label htmlFor="knowledge-form-category">Categoria</label><select id="knowledge-form-category" value={formCategory} onChange={event => setFormCategory(event.target.value)}>{KNOWLEDGE_CATEGORY_SUGGESTIONS.map(category => <option key={category} value={category}>{knowledgeCategoryLabel(category)}</option>)}</select></div>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}><label htmlFor="knowledge-form-summary">Resumo executivo <span className={styles.required}>opcional</span></label><input id="knowledge-form-summary" minLength={10} maxLength={500} value={formSummary} onChange={event => setFormSummary(event.target.value)} /></div>
              </div>
              <div className={styles.field}><label htmlFor="knowledge-form-content">Conteúdo completo</label><textarea id="knowledge-form-content" required minLength={50} maxLength={20000} rows={7} value={formContent} onChange={event => setFormContent(event.target.value)} /></div>
              <div className={styles.fieldRow}>
                <div className={styles.field}><label htmlFor="knowledge-form-tags">Etiquetas <span className={styles.required}>opcional</span></label><input id="knowledge-form-tags" value={formTags} onChange={event => setFormTags(event.target.value)} placeholder="portaria, acesso, visitantes" /><p className={styles.hint}>As etiquetas são texto livre aceito pelo contrato, separadas por vírgula.</p></div>
                <div className={styles.field}><label htmlFor="knowledge-form-roles">Papéis com acesso <span className={styles.required}>opcional</span></label><select id="knowledge-form-roles" multiple value={formRoles} onChange={event => setFormRoles(Array.from(event.currentTarget.selectedOptions, option => option.value))}>{KNOWLEDGE_ACCESS_ROLES.map(role => <option key={role} value={role}>{knowledgeRoleLabel(role)}</option>)}</select><p className={styles.hint}>Sem seleção, o contrato declara acesso para todos os papéis de equipe. Use Ctrl ou Cmd para selecionar mais de um.</p></div>
              </div>
              <div className={styles.actions}><button className="primary" type="submit">Criar rascunho</button></div>
            </form>
          </section>
        ) : null}
      </div>
    </main>
  );
}
