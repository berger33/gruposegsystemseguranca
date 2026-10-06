"use client";

// UX-07 / EXT-08 — apresentação da jornada canônica da base de conhecimento.
//
// Esta reescrita é de APRESENTAÇÃO. Nenhum método, corpo, cabeçalho, chave de
// idempotência ou regra de servidor foi alterada. As sub-rotas abaixo foram
// lidas em `handle()` de src/server/ext-knowledge-api.mjs (dispatch interno
// por pathname) e conferidas contra server.mjs (~linha 4410):
//
//   GET   /api/ext/knowledge/articles                      (?category&status&q&tag)
//   POST  /api/ext/knowledge/articles                      (idempotency-key)
//   GET   /api/ext/knowledge/articles/{id}                 (artigo + histórico + versões)
//   PATCH /api/ext/knowledge/articles/{id}                 (idempotency-key)
//   POST  /api/ext/knowledge/articles/{id}/transition      (idempotency-key)
//   POST  /api/ext/knowledge/articles/{id}/acknowledge     (idempotency-key)
//   GET   /api/ext/knowledge/articles/{id}/acknowledgments
//
// O protótipo NÃO chamava caminho inexistente: todas as URLs que ele usava
// existem no dispatch real. Nenhuma correção de rota foi necessária e nenhum
// endpoint foi inventado. As rotas legadas de knowledge-base (as de RH e a
// genérica, religadas em server.mjs ~linha 4411 para handleLegacy do próprio
// servidor canônico) NÃO são consumidas por esta tela.
//
// Quem autoriza continua sendo o servidor: `guard()` exige sessão de equipe
// (401 `unauthorized`) e papel aceito (403 `forbidden_role`); a leitura de
// versão não publicada, o escopo por papel do procedimento publicado e a
// publicação têm recusas próprias (`draft_not_accessible`,
// `forbidden_by_role_scope`, `publish_permission_required`). EXT-08 não usa
// permissão granular por grant nesta rota. O AdminGate da página não foi
// alargado.
//
// A chave de idempotência de cada operação é preservada após falha e só é
// descartada no sucesso — contrato herdado do protótipo.
//
// O ciclo de vida é o do servidor (KB_TRANSITIONS); a tela apenas APRESENTA
// as transições possíveis a partir do espelho verificado por teste
// (KB_NEXT_STATUS) e aceita o 409 do servidor como resposta final.

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import UiState from "../../../components/ui/UiState";
import UiBadge from "../../../components/ui/UiBadge";
import styles from "../../../components/ui/UiWorkspace.module.css";
import {
  knowledgeErrorFootnote,
  knowledgeErrorVariant,
  kbStatusLabel,
  kbStatusTone,
  knowledgeOriginLabel,
  knowledgeOriginTone,
  ackSourceLabel,
  accessRoleLabel,
  accessScopeLabel,
  honestDate,
  honestDateTime,
  honestText,
  count,
  KB_NEXT_STATUS,
  type KnowledgeErrorDescriptor,
} from "../../../lib/knowledge-vocabulary.mjs";
import { knowledgeRequest } from "../../../lib/knowledge-request";

type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  summary?: string | null;
  category: string;
  status: string;
  version: number | null;
  is_published?: boolean | null;
  published_at?: string | null;
  tags?: string[] | null;
  access_roles?: string[] | null;
  ack_count?: number | null;
  user_acknowledged?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ArticleDetail = ArticleRow & {
  content?: string | null;
  origin?: string | null;
  review_notes?: string | null;
  archive_reason?: string | null;
  archived_at?: string | null;
  reviewed_at?: string | null;
  creator_name?: string | null;
  reviewer_name?: string | null;
  approver_name?: string | null;
};

type HistoryRow = {
  id: string;
  previous_version?: number | null;
  next_version: number;
  change_summary: string;
  changer_name?: string | null;
  changed_by_identity?: string | null;
  created_at?: string | null;
};

type VersionRow = {
  id: string;
  version: number;
  status: string;
  is_published?: boolean | null;
  published_at?: string | null;
  created_at?: string | null;
};

type DetailPayload = { article: ArticleDetail; history: HistoryRow[]; versions: VersionRow[] };

type AckRow = {
  id: string;
  user_identity?: string | null;
  user_name?: string | null;
  user_role?: string | null;
  acknowledged_at?: string | null;
  notes?: string | null;
  source?: string | null;
};

/** Estado honesto de uma leitura independente: nunca confunde os quatro casos. */
type Load<T> =
  | { phase: "loading" }
  | { phase: "ready"; data: T }
  | { phase: "failed"; error: KnowledgeErrorDescriptor };

const TABS = [
  { id: "procedimentos", label: "Procedimentos e versões" },
  { id: "ciencia", label: "Ciência da equipe" },
  { id: "redigir", label: "Redigir e versionar" },
  { id: "ciclo", label: "Ciclo de vida" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// Os cinco estados do ciclo canônico (ext_kb_status, migração 086). A ordem é
// só de apresentação; quem transita é o servidor.
const KB_STATUSES = ["rascunho", "em_revisao", "aprovado", "publicado", "arquivado"] as const;

// STAFF_ROLES aceitos pelo servidor em `access_roles`. O valor cru decide no
// servidor; o rótulo é apresentação.
const ACCESS_ROLES = ["admin", "ti", "marcelo", "rh", "operacao", "supervisor", "comercial", "financeiro"] as const;

const TRANSITION_LABELS: Record<string, string> = {
  em_revisao: "Enviar para revisão",
  aprovado: "Aprovar tecnicamente",
  publicado: "Publicar para a equipe",
  rascunho: "Devolver a rascunho",
  arquivado: "Arquivar",
};

const EMPTY_CREATE = {
  slug: "",
  title: "",
  summary: "",
  content: "",
  category: "",
  tags: "",
  access_roles: [] as string[],
};

const EMPTY_UPDATE = {
  title: "",
  summary: "",
  content: "",
  category: "",
  change_summary: "",
};

const EMPTY_FILTERS = { q: "", category: "", status: "", tag: "" };

export default function KnowledgeWorkspace() {
  const [active, setActive] = useState<TabId>("procedimentos");
  const [articles, setArticles] = useState<Load<ArticleRow[]>>({ phase: "loading" });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<Load<DetailPayload> | null>(null);
  const [acks, setAcks] = useState<Load<AckRow[]> | null>(null);
  const [actionError, setActionError] = useState<KnowledgeErrorDescriptor | null>(null);
  const [preservedKey, setPreservedKey] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [updateForm, setUpdateForm] = useState(EMPTY_UPDATE);
  const [ackNotes, setAckNotes] = useState("");
  const [transitionNotes, setTransitionNotes] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  // Contrato herdado: a chave de idempotência de cada operação é preservada
  // após falha, para a repetição ser segura, e só é descartada após sucesso.
  const keys = useRef<Record<string, string>>({});

  const loadArticles = useCallback(async () => {
    setArticles({ phase: "loading" });
    const params = new URLSearchParams();
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.category.trim()) params.set("category", filters.category.trim());
    if (filters.status) params.set("status", filters.status);
    if (filters.tag.trim()) params.set("tag", filters.tag.trim());
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const result = await knowledgeRequest<{ items: ArticleRow[] }>(`/api/ext/knowledge/articles${suffix}`);
    if (!result.ok) {
      // Falha de leitura é estado próprio. A lista anterior NÃO é mantida nem
      // substituída por uma lista vazia.
      setArticles({ phase: "failed", error: result.error });
      return;
    }
    setArticles({ phase: "ready", data: Array.isArray(result.data?.items) ? result.data.items : [] });
  }, [filters]);

  const loadDetail = useCallback(async (id: string) => {
    setDetail({ phase: "loading" });
    const result = await knowledgeRequest<DetailPayload>(`/api/ext/knowledge/articles/${id}`);
    if (!result.ok) {
      setDetail({ phase: "failed", error: result.error });
      return;
    }
    setDetail({ phase: "ready", data: result.data });
  }, []);

  const loadAcks = useCallback(async (id: string) => {
    setAcks({ phase: "loading" });
    const result = await knowledgeRequest<{ items: AckRow[] }>(`/api/ext/knowledge/articles/${id}/acknowledgments`);
    if (!result.ok) {
      // A recusa 403 deste endpoint (papéis fora da edição) é estado NEGADO
      // próprio desta seção e não contamina o detalhe nem a lista.
      setAcks({ phase: "failed", error: result.error });
      return;
    }
    setAcks({ phase: "ready", data: Array.isArray(result.data?.items) ? result.data.items : [] });
  }, []);

  const selectArticle = useCallback(
    (id: string) => {
      setSelectedId(id);
      // Três ciclos independentes: lista, detalhe (artigo + histórico +
      // versões, uma única resposta do servidor) e ciências. A falha de um
      // não apaga os demais.
      void loadDetail(id);
      void loadAcks(id);
    },
    [loadDetail, loadAcks],
  );

  useEffect(() => {
    void loadArticles();
    // A leitura inicial usa os filtros vazios; buscas seguintes passam pelo
    // botão do formulário, que chama loadArticles com os filtros atuais.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Toda escrita passa aqui. A URL, o método, o corpo e o cabeçalho de
   * idempotência são exatamente os do servidor; em falha, a chave é
   * preservada (keys.current[op]=k permanece) e a repetição reaproveita a
   * mesma chave — o servidor devolve replay em vez de duplicar efeito.
   */
  const mutate = async <T,>(op: string, url: string, body: unknown, method = "POST"): Promise<T | null> => {
    const k = keys.current[op] || `ext08-${op}-${crypto.randomUUID()}`;
    keys.current[op]=k;
    setBusy(true);
    setActionError(null);
    setPreservedKey("");
    setNotice("");
    const result = await knowledgeRequest<T>(url, {
      method,
      headers: { "content-type": "application/json", "idempotency-key": k },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!result.ok) {
      // O servidor devolve detalhe estruturado junto do código em alguns
      // casos (`current_status`/`allowed` de invalid_status_transition,
      // `canonical` de legacy_knowledge_writer_retired). O código canônico
      // NÃO é alterado.
      const extra =
        result.payload && typeof result.payload === "object"
          ? (result.payload as { current_status?: unknown; allowed?: unknown })
          : {};
      const allowed = Array.isArray(extra.allowed)
        ? extra.allowed.map(value => kbStatusLabel(value)).join(", ")
        : "";
      const complement =
        typeof extra.current_status === "string" && allowed
          ? `O servidor informou o estado atual (${kbStatusLabel(extra.current_status)}) e as transições que aceita: ${allowed}.`
          : "";
      setActionError(complement ? { ...result.error, detail: `${result.error.detail} ${complement}` } : result.error);
      setPreservedKey(k);
      return null;
    }
    delete keys.current[op];
    return result.data;
  };

  const refreshSelected = async () => {
    await loadArticles();
    if (selectedId) {
      await Promise.all([loadDetail(selectedId), loadAcks(selectedId)]);
    }
  };

  const createArticle = async (event: FormEvent) => {
    event.preventDefault();
    const data = await mutate<{ article: ArticleRow }>("create", "/api/ext/knowledge/articles", {
      slug: createForm.slug,
      title: createForm.title,
      summary: createForm.summary || undefined,
      content: createForm.content,
      category: createForm.category,
      tags: createForm.tags.split(",").map(tag => tag.trim()).filter(Boolean),
      access_roles: createForm.access_roles,
    });
    if (!data) return;
    setCreateForm(EMPTY_CREATE);
    await loadArticles();
    if (data.article?.id) selectArticle(data.article.id);
    setNotice(`Procedimento registrado pelo servidor como rascunho, versão v${data.article?.version ?? ""}. Nada foi publicado: publicar é uma transição separada, decidida pelo servidor.`);
  };

  const updateArticle = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    const data = await mutate<{ article: ArticleRow; isNewVersion?: boolean }>(
      "update",
      `/api/ext/knowledge/articles/${selectedId}`,
      {
        ...(updateForm.title ? { title: updateForm.title } : {}),
        ...(updateForm.summary ? { summary: updateForm.summary } : {}),
        ...(updateForm.content ? { content: updateForm.content } : {}),
        ...(updateForm.category ? { category: updateForm.category } : {}),
        change_summary: updateForm.change_summary,
      },
      "PATCH",
    );
    if (!data) return;
    setUpdateForm(EMPTY_UPDATE);
    await loadArticles();
    if (data.article?.id) selectArticle(data.article.id);
    setNotice(
      data.isNewVersion
        ? `O servidor preservou a versão publicada como histórico imutável e criou a nova versão v${data.article?.version ?? ""} como rascunho.`
        : "O servidor atualizou o rascunho em edição e registrou o resumo da alteração no histórico imutável.",
    );
  };

  const transitionArticle = async (target: string) => {
    if (!selectedId) return;
    const data = await mutate<{ article: ArticleRow }>(
      `transition-${target}`,
      `/api/ext/knowledge/articles/${selectedId}/transition`,
      {
        status: target,
        ...(transitionNotes.trim() ? { notes: transitionNotes.trim() } : {}),
        ...(target === "arquivado" ? { reason: archiveReason } : {}),
      },
    );
    if (!data) return;
    setTransitionNotes("");
    setArchiveReason("");
    await refreshSelected();
    setNotice(`O servidor executou a transição: o procedimento agora está em "${kbStatusLabel(data.article?.status)}".`);
  };

  const acknowledgeArticle = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId) return;
    const data = await mutate<{ acknowledgment: AckRow; articleTitle?: string; version?: number }>(
      "acknowledge",
      `/api/ext/knowledge/articles/${selectedId}/acknowledge`,
      { ...(ackNotes.trim() ? { notes: ackNotes.trim() } : {}) },
    );
    if (!data) return;
    setAckNotes("");
    await refreshSelected();
    setNotice(`Ciência registrada pelo servidor na versão v${data.version ?? ""}. A confirmação vale para esta versão publicada, não para versões futuras.`);
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TABS.length - 1;
    const next =
      event.key === "ArrowRight" ? (index + 1) % TABS.length
      : event.key === "ArrowLeft" ? (index + last) % TABS.length
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : -1;
    if (next < 0) return;
    event.preventDefault();
    setActive(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  const renderReadFailure = (
    error: KnowledgeErrorDescriptor,
    retry: () => void,
    testId: string,
    negacao: string,
  ) => (
    <div data-testid={testId}>
      <UiState
        variant={knowledgeErrorVariant(error)}
        title={error.title}
        detail={`${error.detail} ${negacao} ${knowledgeErrorFootnote(error)}`}
        onRetry={error.canRetry ? retry : undefined}
        retryLabel="Tentar a leitura de novo"
      />
    </div>
  );

  const articleItems = articles.phase === "ready" ? articles.data : [];
  const detailData = detail?.phase === "ready" ? detail.data : null;
  const selectedArticle = detailData?.article ?? null;
  const allowedTargets = selectedArticle
    ? (KB_NEXT_STATUS[String(selectedArticle.status)] ?? [])
    : [];

  const noSelectionHint = (
    <p className={styles.hint}>
      Nenhum procedimento selecionado. Escolha um procedimento na aba
      &quot;Procedimentos e versões&quot; para esta frente de trabalho.
    </p>
  );

  return (
    <main className={styles.workspace} data-testid="knowledge-workspace">
      <nav aria-label="Trilha" className={styles.breadcrumbNav}>
        <a href="/admin">Início</a> · <span aria-current="page">Base de conhecimento</span>
      </nav>
      <p className={styles.kicker}>EXT-08</p>
      <h1>Base de conhecimento e procedimentos operacionais</h1>
      <p className={styles.lede} data-testid="knowledge-honesty">
        Jornada exclusivamente interna de equipe, regida pelo critério do servidor:{" "}
        <strong>procedimentos versionados, com ciclo de vida, controle de acesso por papel e ciência por versão publicada</strong>.
        Versão publicada é histórico imutável: editar uma versão publicada cria uma nova versão em rascunho, e a ciência confirmada
        vale para a versão em que foi registrada. A tela não inventa versão, revisão, aprovação nem ciência: tudo o que aparece veio
        do servidor, e onde não existe dado real a tela diz que não existe — nunca mostra zero no lugar.
      </p>
      <p className={styles.hint}>
        Quem pode ler, editar, publicar e registrar ciência é decidido pelo servidor: sessão de equipe válida e papel autorizado,
        conferidos em <code>src/server/ext-knowledge-api.mjs</code> antes de qualquer resposta. Abrir esta tela pelo menu não concede
        acesso nenhum — menu não é autorização. Categoria, etiquetas e identificador permanente (slug) são texto declarado pela
        equipe: o servidor valida tamanho e formato, não taxonomia, e a tela os apresenta como foram escritos. As áreas legadas da
        base de conhecimento continuam declaradas no servidor e não são consumidas por esta tela.
      </p>

      {notice ? <UiState variant="success" title={notice} /> : null}
      {actionError ? (
        <div data-testid="knowledge-action-error">
          <UiState
            variant={knowledgeErrorVariant(actionError)}
            title={actionError.title}
            detail={`${actionError.detail} ${knowledgeErrorFootnote(actionError)}`}
          >
            {preservedKey ? (
              <p className={styles.footnote}>
                Chave preservada para repetição segura: <code>{preservedKey}</code>. Repetir a mesma
                operação reaproveita a chave e não duplica efeito.
              </p>
            ) : null}
          </UiState>
        </div>
      ) : null}

      <div className={styles.tabs} role="tablist" aria-label="Jornada canônica da base de conhecimento">
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            id={`knowledge-tab-${tab.id}`}
            ref={node => { tabRefs.current[index] = node; }}
            type="button"
            role="tab"
            className={active === tab.id ? styles.tabActive : styles.tab}
            aria-selected={active === tab.id}
            aria-controls={`knowledge-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={event => onTabKey(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.tabPanel}>
        {active === "procedimentos" ? (
          <section
            id="knowledge-panel-procedimentos"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="knowledge-tab-procedimentos"
            className={styles.panel}
            data-testid="knowledge-articles"
          >
            <h2 className={styles.panelTitle}>Procedimentos registrados</h2>
            <p className={styles.hint}>
              A busca e os filtros são executados pelo servidor, que também decide o que cada papel
              enxerga: fora dos papéis de edição, só a versão publicada dentro do escopo de acesso
              aparece — e a lista não denuncia o que foi escondido.
            </p>
            <form
              className={styles.fieldRow}
              onSubmit={event => {
                event.preventDefault();
                void loadArticles();
              }}
            >
              <label className={styles.field} htmlFor="knowledge-filter-q">
                Buscar por termo
                <input id="knowledge-filter-q" value={filters.q}
                  onChange={event => setFilters({ ...filters, q: event.target.value })} />
              </label>
              <label className={styles.field} htmlFor="knowledge-filter-category">
                Categoria declarada
                <input id="knowledge-filter-category" value={filters.category}
                  onChange={event => setFilters({ ...filters, category: event.target.value })} />
              </label>
              <label className={styles.field} htmlFor="knowledge-filter-tag">
                Etiqueta declarada
                <input id="knowledge-filter-tag" value={filters.tag}
                  onChange={event => setFilters({ ...filters, tag: event.target.value })} />
              </label>
              <label className={styles.field} htmlFor="knowledge-filter-status">
                Estado do ciclo de vida
                <select id="knowledge-filter-status" value={filters.status}
                  onChange={event => setFilters({ ...filters, status: event.target.value })}>
                  <option value="">Todos os estados que o servidor me deixa ver</option>
                  {KB_STATUSES.map(value => (
                    <option key={value} value={value}>{kbStatusLabel(value)}</option>
                  ))}
                </select>
              </label>
              <div className={styles.actions}>
                <button type="submit">Buscar no servidor</button>
              </div>
            </form>

            {articles.phase === "loading" ? (
              <UiState variant="loading" title="Lendo os procedimentos registrados…" detail="Nada é exibido antes de a leitura terminar." />
            ) : null}
            {articles.phase === "failed"
              ? renderReadFailure(
                  articles.error,
                  () => void loadArticles(),
                  "knowledge-articles-error",
                  "Isto não significa que não existam procedimentos registrados.",
                )
              : null}
            {articles.phase === "ready" && articleItems.length === 0 ? (
              <UiState
                variant="empty"
                title="A leitura funcionou e nenhum procedimento está registrado para estes filtros."
                detail="O sistema não cria procedimento de exemplo. Ausência de registro não é prova de que o trabalho dispense procedimento."
              />
            ) : null}
            {articles.phase === "ready" && articleItems.length > 0 ? (
              <>
                {/* Indicadores só existem depois da leitura concluída: nunca
                    aparecem como zero durante carregamento ou falha. */}
                <ul className={styles.metrics} data-testid="knowledge-article-metrics">
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>{count(articleItems.length)}</span>
                    <span className={styles.metricLabel}>Procedimentos lidos</span>
                  </li>
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>
                      {count(articleItems.filter(item => item.status === "publicado").length)}
                    </span>
                    <span className={styles.metricLabel}>Publicados no servidor</span>
                  </li>
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>
                      {count(articleItems.filter(item => item.status === "publicado" && !item.user_acknowledged).length)}
                    </span>
                    <span className={styles.metricLabel}>Publicados aguardando a sua ciência</span>
                  </li>
                  <li className={styles.metric}>
                    <span className={styles.metricValue}>
                      {count(articleItems.reduce((total, item) => total + (Number.isFinite(Number(item.ack_count)) ? Number(item.ack_count) : 0), 0))}
                    </span>
                    <span className={styles.metricLabel}>Ciências registradas (soma real do servidor)</span>
                  </li>
                </ul>
                <div className={styles.tableWrap}>
                  <table className={styles.table} data-testid="knowledge-articles-table">
                    <caption>
                      Procedimentos devolvidos pelo servidor, ordenados por categoria, título e versão.
                      Categoria e etiquetas aparecem como foram declaradas pela equipe.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Procedimento</th>
                        <th scope="col">Categoria declarada</th>
                        <th scope="col">Estado</th>
                        <th scope="col">Versão</th>
                        <th scope="col">Ciências</th>
                        <th scope="col">Sua ciência</th>
                        <th scope="col">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {articleItems.map(item => (
                        <tr key={item.id}>
                          <th scope="row">{honestText(item.title)}</th>
                          <td>{honestText(item.category)}</td>
                          <td>
                            <UiBadge tone={kbStatusTone(item.status)} srPrefix="Estado do ciclo de vida">
                              {kbStatusLabel(item.status)}
                            </UiBadge>
                          </td>
                          <td>{item.version == null ? honestText(null) : `v${count(item.version)}`}</td>
                          <td>{count(item.ack_count)}</td>
                          <td>
                            {item.status === "publicado" ? (
                              item.user_acknowledged ? (
                                <UiBadge tone="success" srPrefix="Sua ciência">Confirmada nesta versão</UiBadge>
                              ) : (
                                <UiBadge tone="warning" srPrefix="Sua ciência">Pendente nesta versão</UiBadge>
                              )
                            ) : (
                              "Só após publicação"
                            )}
                          </td>
                          <td>
                            <button type="button" onClick={() => selectArticle(item.id)}>
                              Ver procedimento
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {detail ? (
              <div className={styles.sectionCard} data-testid="knowledge-article-detail">
                <h3>Detalhe da versão selecionada</h3>
                {detail.phase === "loading" ? (
                  <UiState variant="loading" title="Lendo o detalhe da versão…" detail="Nada é exibido antes de a leitura terminar." />
                ) : null}
                {detail.phase === "failed"
                  ? renderReadFailure(
                      detail.error,
                      () => void loadDetail(selectedId),
                      "knowledge-article-detail-error",
                      "Isto não significa que o procedimento não exista.",
                    )
                  : null}
                {detail.phase === "ready" && detailData ? (
                  <>
                    <dl className={styles.facts}>
                      <div className={styles.metaLine}>
                        <dt>Título</dt>
                        <dd>{honestText(detailData.article.title)}</dd>
                      </div>
                      <div className={styles.metaLine}>
                        <dt>Identificador permanente (slug)</dt>
                        <dd><code>{honestText(detailData.article.slug)}</code></dd>
                      </div>
                      <div className={styles.metaLine}>
                        <dt>Categoria declarada</dt>
                        <dd>{honestText(detailData.article.category)}</dd>
                      </div>
                      <div className={styles.metaLine}>
                        <dt>Estado do ciclo de vida</dt>
                        <dd>
                          <UiBadge tone={kbStatusTone(detailData.article.status)} srPrefix="Estado do ciclo de vida">
                            {kbStatusLabel(detailData.article.status)}
                          </UiBadge>
                        </dd>
                      </div>
                      <div className={styles.metaLine}>
                        <dt>Versão</dt>
                        <dd>{detailData.article.version == null ? honestText(null) : `v${count(detailData.article.version)}`}</dd>
                      </div>
                      <div className={styles.metaLine}>
                        <dt>Origem do registro</dt>
                        <dd>
                          <UiBadge tone={knowledgeOriginTone(detailData.article.origin)} srPrefix="Origem do registro">
                            {knowledgeOriginLabel(detailData.article.origin)}
                          </UiBadge>
                        </dd>
                      </div>
                      <div className={styles.metaLine}>
                        <dt>Resumo executivo</dt>
                        <dd>{honestText(detailData.article.summary)}</dd>
                      </div>
                      <div className={styles.metaLine}>
                        <dt>Etiquetas declaradas</dt>
                        <dd>
                          {Array.isArray(detailData.article.tags) && detailData.article.tags.length > 0
                            ? detailData.article.tags.join(", ")
                            : "Nenhuma etiqueta declarada"}
                        </dd>
                      </div>
                      <div className={styles.metaLine}>
                        <dt>Papéis com acesso quando publicado</dt>
                        <dd>{accessScopeLabel(detailData.article.access_roles)}</dd>
                      </div>
                      <div className={styles.metaLine}>
                        <dt>Criado por</dt>
                        <dd>{honestText(detailData.article.creator_name)}</dd>
                      </div>
                      <div className={styles.metaLine}>
                        <dt>Revisão</dt>
                        <dd>
                          {detailData.article.reviewed_at
                            ? `${honestText(detailData.article.reviewer_name)} em ${honestDateTime(detailData.article.reviewed_at)}`
                            : "Revisão pendente"}
                        </dd>
                      </div>
                      <div className={styles.metaLine}>
                        <dt>Notas de revisão</dt>
                        <dd>{honestText(detailData.article.review_notes)}</dd>
                      </div>
                      <div className={styles.metaLine}>
                        <dt>Aprovado por</dt>
                        <dd>{detailData.article.approver_name ? honestText(detailData.article.approver_name) : "Aprovação pendente"}</dd>
                      </div>
                      <div className={styles.metaLine}>
                        <dt>Publicado em</dt>
                        <dd>{detailData.article.published_at ? honestDateTime(detailData.article.published_at) : "Publicação pendente"}</dd>
                      </div>
                      <div className={styles.metaLine}>
                        <dt>Arquivamento</dt>
                        <dd>
                          {detailData.article.archived_at
                            ? `${honestDateTime(detailData.article.archived_at)} — ${honestText(detailData.article.archive_reason)}`
                            : "Não arquivado"}
                        </dd>
                      </div>
                      <div className={styles.metaLine}>
                        <dt>Ciências nesta versão</dt>
                        <dd>{count(detailData.article.ack_count)}</dd>
                      </div>
                    </dl>

                    <h4>Conteúdo do procedimento</h4>
                    <div className={styles.codeBlock} data-testid="knowledge-article-content">
                      {honestText(detailData.article.content)}
                    </div>

                    <h4>Histórico de revisões (trilha imutável do servidor)</h4>
                    {detailData.history.length === 0 ? (
                      <UiState
                        variant="empty"
                        title="A leitura funcionou e nenhuma revisão está registrada."
                        detail="O histórico é escrito pelo servidor a cada mudança; nada é reconstruído pela tela."
                      />
                    ) : (
                      <ul className={styles.scrollList} data-testid="knowledge-history">
                        {detailData.history.map(entry => (
                          <li key={entry.id} className={styles.dividedItem}>
                            <strong>
                              {entry.previous_version == null
                                ? `Criação (v${count(entry.next_version)})`
                                : `v${count(entry.previous_version)} → v${count(entry.next_version)}`}
                            </strong>{" "}
                            — {honestText(entry.change_summary)}
                            <span className={styles.footnote}>
                              {" "}
                              {honestText(entry.changer_name || entry.changed_by_identity)} · {honestDateTime(entry.created_at)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <h4>Versões deste procedimento (mesmo slug)</h4>
                    <div className={styles.tableWrap}>
                      <table className={styles.table} data-testid="knowledge-versions">
                        <caption>
                          Toda edição sobre versão publicada ou arquivada vira uma NOVA versão; as
                          anteriores permanecem como histórico imutável.
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">Versão</th>
                            <th scope="col">Estado</th>
                            <th scope="col">Publicada em</th>
                            <th scope="col">Criada em</th>
                            <th scope="col">Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailData.versions.map(version => (
                            <tr key={version.id}>
                              <th scope="row">{`v${count(version.version)}`}</th>
                              <td>
                                <UiBadge tone={kbStatusTone(version.status)} srPrefix="Estado da versão">
                                  {kbStatusLabel(version.status)}
                                </UiBadge>
                              </td>
                              <td>{version.published_at ? honestDateTime(version.published_at) : "Publicação pendente"}</td>
                              <td>{honestDateTime(version.created_at)}</td>
                              <td>
                                {version.id === selectedId ? (
                                  "Versão em exibição"
                                ) : (
                                  <button type="button" onClick={() => selectArticle(version.id)}>
                                    Ver esta versão
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {active === "ciencia" ? (
          <section
            id="knowledge-panel-ciencia"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="knowledge-tab-ciencia"
            className={styles.panel}
            data-testid="knowledge-acks"
          >
            <h2 className={styles.panelTitle}>Ciência da equipe na versão selecionada</h2>
            <p className={styles.hint}>
              O servidor só registra ciência sobre a versão publicada vigente, uma por colaborador e
              por versão. A lista de quem registrou é restrita aos papéis de edição — quem não pode
              ler recebe a recusa do servidor, não uma lista vazia.
            </p>
            {!selectedId ? noSelectionHint : null}
            {selectedId && acks ? (
              <>
                {acks.phase === "loading" ? (
                  <UiState variant="loading" title="Lendo as ciências registradas…" detail="Nada é exibido antes de a leitura terminar." />
                ) : null}
                {acks.phase === "failed"
                  ? renderReadFailure(
                      acks.error,
                      () => void loadAcks(selectedId),
                      "knowledge-acks-error",
                      "Isto não significa que não exista ciência registrada.",
                    )
                  : null}
                {acks.phase === "ready" && acks.data.length === 0 ? (
                  <UiState
                    variant="empty"
                    title="A leitura funcionou e nenhuma ciência está registrada nesta versão."
                    detail="Ciência não é criada automaticamente; o que ninguém confirmou não aparece."
                  />
                ) : null}
                {acks.phase === "ready" && acks.data.length > 0 ? (
                  <div className={styles.tableWrap}>
                    <table className={styles.table} data-testid="knowledge-acks-table">
                      <caption>
                        Ciências devolvidas pelo servidor para a versão selecionada, da mais recente à
                        mais antiga.
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Colaborador</th>
                          <th scope="col">Papel</th>
                          <th scope="col">Registrada em</th>
                          <th scope="col">Origem</th>
                          <th scope="col">Observação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {acks.data.map(entry => (
                          <tr key={entry.id}>
                            <th scope="row">{honestText(entry.user_name || entry.user_identity)}</th>
                            <td>{accessRoleLabel(entry.user_role)}</td>
                            <td>{honestDateTime(entry.acknowledged_at)}</td>
                            <td>{ackSourceLabel(entry.source)}</td>
                            <td>{honestText(entry.notes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : null}

            {selectedId && selectedArticle ? (
              <div className={styles.sectionCard}>
                <h3>Confirmar a minha ciência</h3>
                {selectedArticle.user_acknowledged ? (
                  <p className={styles.hint} data-testid="knowledge-ack-done">
                    O servidor já tem a sua ciência registrada nesta versão. Confirmar de novo apenas
                    atualiza a observação — a decisão é do servidor, não da tela.
                  </p>
                ) : null}
                {selectedArticle.status !== "publicado" ? (
                  <p className={styles.hint} data-testid="knowledge-ack-unavailable">
                    Esta versão não está publicada, então o servidor recusará o registro de ciência
                    (ciência só vale para versão publicada). O botão continua disponível porque quem
                    decide é o servidor, não a tela.
                  </p>
                ) : null}
                <form className={styles.stack} onSubmit={acknowledgeArticle}>
                  <label className={styles.field} htmlFor="knowledge-ack-notes">
                    Observação (opcional, 3 a 500 caracteres)
                    <input id="knowledge-ack-notes" value={ackNotes}
                      onChange={event => setAckNotes(event.target.value)} />
                  </label>
                  <div className={styles.actions}>
                    <button type="submit" disabled={busy}>Confirmar ciência nesta versão</button>
                  </div>
                </form>
              </div>
            ) : null}
          </section>
        ) : null}

        {active === "redigir" ? (
          <section
            id="knowledge-panel-redigir"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="knowledge-tab-redigir"
            className={styles.panel}
            data-testid="knowledge-forms"
          >
            <h2 className={styles.panelTitle}>Registrar novo procedimento operacional</h2>
            <p className={styles.hint}>
              Todo procedimento nasce como rascunho, com autor e datas gravados pelo servidor.
              Categoria, etiquetas e papéis de acesso são declarações da equipe; publicar é uma
              transição separada no ciclo de vida.
            </p>
            <form className={styles.stack} onSubmit={createArticle}>
              <div className={styles.fieldRow}>
                <label className={styles.field} htmlFor="knowledge-create-slug">
                  Identificador permanente (slug, minúsculo com hífens)
                  <input id="knowledge-create-slug" required value={createForm.slug}
                    onChange={event => setCreateForm({ ...createForm, slug: event.target.value })} />
                </label>
                <label className={styles.field} htmlFor="knowledge-create-title">
                  Título (5 a 200 caracteres)
                  <input id="knowledge-create-title" required value={createForm.title}
                    onChange={event => setCreateForm({ ...createForm, title: event.target.value })} />
                </label>
                <label className={styles.field} htmlFor="knowledge-create-category">
                  Categoria declarada (3 a 100 caracteres)
                  <input id="knowledge-create-category" required value={createForm.category}
                    onChange={event => setCreateForm({ ...createForm, category: event.target.value })} />
                </label>
              </div>
              <label className={styles.field} htmlFor="knowledge-create-summary">
                Resumo executivo (opcional, 10 a 500 caracteres)
                <input id="knowledge-create-summary" value={createForm.summary}
                  onChange={event => setCreateForm({ ...createForm, summary: event.target.value })} />
              </label>
              <label className={styles.field} htmlFor="knowledge-create-content">
                Conteúdo completo do procedimento (50 a 20000 caracteres)
                <textarea id="knowledge-create-content" required value={createForm.content}
                  onChange={event => setCreateForm({ ...createForm, content: event.target.value })} />
              </label>
              <label className={styles.field} htmlFor="knowledge-create-tags">
                Etiquetas declaradas (separadas por vírgula, opcional)
                <input id="knowledge-create-tags" value={createForm.tags}
                  onChange={event => setCreateForm({ ...createForm, tags: event.target.value })} />
              </label>
              <fieldset className={styles.fieldset}>
                <legend>Papéis com acesso quando publicado (nenhum marcado = todos os papéis de equipe)</legend>
                <div className={styles.rowWrap}>
                  {ACCESS_ROLES.map(role => (
                    <label key={role} className={styles.field} htmlFor={`knowledge-create-role-${role}`}>
                      <input
                        id={`knowledge-create-role-${role}`}
                        type="checkbox"
                        checked={createForm.access_roles.includes(role)}
                        onChange={event =>
                          setCreateForm({
                            ...createForm,
                            access_roles: event.target.checked
                              ? [...createForm.access_roles, role]
                              : createForm.access_roles.filter(value => value !== role),
                          })
                        }
                      />
                      {accessRoleLabel(role)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className={styles.footnote}>
                O escopo por papel só vale depois de publicado, e quem o aplica é o servidor. A tela
                não esconde nem revela nada por conta própria.
              </p>
              <div className={styles.actions}>
                <button type="submit" disabled={busy}>Registrar procedimento (nasce rascunho)</button>
              </div>
            </form>

            <h2 className={styles.panelTitle}>Atualizar a versão selecionada</h2>
            {!selectedId ? noSelectionHint : null}
            {selectedId && selectedArticle ? (
              <>
                <p className={styles.hint} data-testid="knowledge-update-boundary">
                  Em rascunho ou revisão, o servidor atualiza o mesmo registro. Sobre versão publicada
                  ou arquivada, o servidor <strong>preserva a versão como histórico imutável</strong> e
                  cria uma nova versão em rascunho. Campos deixados em branco permanecem como estão; o
                  resumo da alteração é obrigatório e entra no histórico.
                </p>
                <form className={styles.stack} onSubmit={updateArticle}>
                  <div className={styles.fieldRow}>
                    <label className={styles.field} htmlFor="knowledge-update-title">
                      Novo título (opcional)
                      <input id="knowledge-update-title" value={updateForm.title}
                        onChange={event => setUpdateForm({ ...updateForm, title: event.target.value })} />
                    </label>
                    <label className={styles.field} htmlFor="knowledge-update-category">
                      Nova categoria declarada (opcional)
                      <input id="knowledge-update-category" value={updateForm.category}
                        onChange={event => setUpdateForm({ ...updateForm, category: event.target.value })} />
                    </label>
                  </div>
                  <label className={styles.field} htmlFor="knowledge-update-summary">
                    Novo resumo executivo (opcional)
                    <input id="knowledge-update-summary" value={updateForm.summary}
                      onChange={event => setUpdateForm({ ...updateForm, summary: event.target.value })} />
                  </label>
                  <label className={styles.field} htmlFor="knowledge-update-content">
                    Novo conteúdo completo (opcional; 50 a 20000 caracteres quando preenchido)
                    <textarea id="knowledge-update-content" value={updateForm.content}
                      onChange={event => setUpdateForm({ ...updateForm, content: event.target.value })} />
                  </label>
                  <label className={styles.field} htmlFor="knowledge-update-change">
                    Resumo da alteração para o histórico imutável (obrigatório)
                    <input id="knowledge-update-change" required value={updateForm.change_summary}
                      onChange={event => setUpdateForm({ ...updateForm, change_summary: event.target.value })} />
                  </label>
                  <div className={styles.actions}>
                    <button type="submit" disabled={busy}>Enviar atualização ao servidor</button>
                  </div>
                </form>
              </>
            ) : null}
          </section>
        ) : null}

        {active === "ciclo" ? (
          <section
            id="knowledge-panel-ciclo"
            role="tabpanel"
            tabIndex={0}
            aria-labelledby="knowledge-tab-ciclo"
            className={styles.panel}
            data-testid="knowledge-lifecycle"
          >
            <h2 className={styles.panelTitle}>Ciclo de vida canônico</h2>
            <p className={styles.hint}>
              O ciclo abaixo é o do servidor (<code>KB_TRANSITIONS</code>), espelhado aqui apenas para
              apresentação e verificado por teste. Publicar exige papel de publicação e despublica a
              versão publicada anterior do mesmo procedimento; arquivar exige motivo escrito. Quem
              decide cada transição é o servidor — a tela só pede.
            </p>
            <ul className={styles.scrollList} data-testid="knowledge-lifecycle-map">
              {KB_STATUSES.map(status => (
                <li key={status} className={styles.dividedItem}>
                  <UiBadge tone={kbStatusTone(status)} srPrefix="Estado">{kbStatusLabel(status)}</UiBadge>{" "}
                  → {(KB_NEXT_STATUS[status] ?? []).map(target => kbStatusLabel(target)).join(", ")}
                </li>
              ))}
            </ul>

            <h2 className={styles.panelTitle}>Transicionar a versão selecionada</h2>
            {!selectedId ? noSelectionHint : null}
            {selectedId && selectedArticle ? (
              <div className={styles.sectionCard} data-testid="knowledge-transition">
                <p className={styles.hint}>
                  Estado atual no servidor:{" "}
                  <UiBadge tone={kbStatusTone(selectedArticle.status)} srPrefix="Estado atual">
                    {kbStatusLabel(selectedArticle.status)}
                  </UiBadge>
                </p>
                <label className={styles.field} htmlFor="knowledge-transition-notes">
                  Notas da transição (opcionais, usadas na aprovação)
                  <input id="knowledge-transition-notes" value={transitionNotes}
                    onChange={event => setTransitionNotes(event.target.value)} />
                </label>
                <label className={styles.field} htmlFor="knowledge-archive-reason">
                  Motivo do arquivamento (obrigatório só para arquivar, 5 a 1000 caracteres)
                  <input id="knowledge-archive-reason" value={archiveReason}
                    onChange={event => setArchiveReason(event.target.value)} />
                </label>
                <div className={styles.actions}>
                  {allowedTargets.map(target => (
                    <button
                      key={target}
                      type="button"
                      disabled={busy}
                      onClick={() => void transitionArticle(target)}
                    >
                      {TRANSITION_LABELS[target] ?? `Transicionar para ${kbStatusLabel(target)}`}
                    </button>
                  ))}
                </div>
                <p className={styles.footnote}>
                  Publicar para a equipe é recusado pelo servidor para papéis sem permissão de
                  publicação (<code>publish_permission_required</code>): editar não é publicar, e menu
                  não é autorização.
                </p>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
