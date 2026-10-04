"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type KnowledgeArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  content: string;
  category: string;
  status: "rascunho" | "em_revisao" | "aprovado" | "publicado" | "arquivado";
  version: number;
  is_published: boolean;
  published_at: string | null;
  tags: string[];
  access_roles: string[];
  ack_count: number;
  user_acknowledged: boolean;
  created_at: string;
  updated_at: string;
  creator_name?: string;
  reviewer_name?: string;
  approver_name?: string;
};

type HistoryEntry = {
  id: string;
  kb_id: string;
  previous_version: number | null;
  next_version: number;
  change_summary: string;
  changed_by_identity: string | null;
  changer_name?: string;
  created_at: string;
};

type AcknowledgmentEntry = {
  id: string;
  kb_id: string;
  user_identity: string;
  user_name?: string;
  user_role?: string;
  acknowledged_at: string;
  notes?: string;
  source: string;
};

const cardStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid #d1d5db",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
};

const inputStyle: React.CSSProperties = {
  padding: 8,
  border: "1px solid #9ca3af",
  borderRadius: 6,
  minWidth: 190,
};

async function parseResponse(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || res.statusText };
  }
}

export default function KnowledgeWorkspace() {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [acknowledgments, setAcknowledgments] = useState<AcknowledgmentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Filtros
  const [filterCategory, setFilterCategory] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Formulários
  const [formSlug, setFormSlug] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formSummary, setFormSummary] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState("operacional");
  const [formTags, setFormTags] = useState("");
  const [formRoles, setFormRoles] = useState("");

  // Transição
  const [transitionStatus, setTransitionStatus] = useState<string>("em_revisao");
  const [transitionNotes, setTransitionNotes] = useState("");
  const [transitionReason, setTransitionReason] = useState("");

  // Ciência
  const [ackNotes, setAckNotes] = useState("");

  const keys = useRef<Record<string, string>>({});

  const loadArticles = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filterCategory) params.set("category", filterCategory);
      if (filterQuery) params.set("q", filterQuery);
      if (filterStatus) params.set("status", filterStatus);

      const res = await fetch(`/api/ext/knowledge/articles?${params.toString()}`, { cache: "no-store" });
      const data = await parseResponse(res);
      if (!res.ok) throw new Error(data.error || String(res.status));
      setArticles(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar artigos");
    } finally {
      setLoading(false);
    }
  }, [filterCategory, filterQuery, filterStatus]);

  useEffect(() => {
    void loadArticles();
  }, [loadArticles]);

  const loadDetail = useCallback(async (id: string) => {
    setError("");
    try {
      const res = await fetch(`/api/ext/knowledge/articles/${id}`, { cache: "no-store" });
      const data = await parseResponse(res);
      if (!res.ok) throw new Error(data.error || String(res.status));
      setSelectedArticle(data.article);
      setHistory(data.history || []);

      // Se tiver permissão, carrega lista de ciências
      const ackRes = await fetch(`/api/ext/knowledge/articles/${id}/acknowledgments`, { cache: "no-store" });
      if (ackRes.ok) {
        const ackData = await parseResponse(ackRes);
        setAcknowledgments(ackData.items || []);
      } else {
        setAcknowledgments([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar detalhe do artigo");
    }
  }, []);

  async function mutate(name: string, url: string, method = "POST", value?: unknown) {
    const key = keys.current[name] || `ext08-${name}-${crypto.randomUUID()}`;
    keys.current[name] = key;
    setError("");
    try {
      const res = await fetch(url, {
        method,
        headers: {
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body: value !== undefined ? JSON.stringify(value) : "{}",
      });
      const data = await parseResponse(res);
      if (!res.ok) throw new Error(data.error || String(res.status));
      delete keys.current[name];
      return data;
    } catch (err) {
      setError(`${err instanceof Error ? err.message : "Falha"}. Chave preservada para retry.`);
      throw err;
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    try {
      const tags = formTags.split(",").map(t => t.trim()).filter(Boolean);
      const roles = formRoles.split(",").map(r => r.trim()).filter(Boolean);
      const payload = {
        slug: formSlug,
        title: formTitle,
        summary: formSummary || undefined,
        content: formContent,
        category: formCategory,
        tags,
        access_roles: roles,
      };
      const res = await mutate("create-article", "/api/ext/knowledge/articles", "POST", payload);
      setNotice(`Procedimento '${res.article?.title}' criado com sucesso v${res.article?.version}.`);
      setFormSlug("");
      setFormTitle("");
      setFormSummary("");
      setFormContent("");
      await loadArticles();
      if (res.article?.id) void loadDetail(res.article.id);
    } catch {}
  }

  async function handleTransition(e: FormEvent) {
    e.preventDefault();
    if (!selectedArticle) return;
    try {
      const payload = {
        status: transitionStatus,
        notes: transitionNotes || undefined,
        reason: transitionReason || undefined,
      };
      const res = await mutate(
        `transition-${selectedArticle.id}`,
        `/api/ext/knowledge/articles/${selectedArticle.id}/transition`,
        "POST",
        payload
      );
      setNotice(`Estado atualizado para '${res.article?.status}'.`);
      setTransitionNotes("");
      setTransitionReason("");
      await loadArticles();
      void loadDetail(selectedArticle.id);
    } catch {}
  }

  async function handleAcknowledge() {
    if (!selectedArticle) return;
    try {
      await mutate(
        `ack-${selectedArticle.id}`,
        `/api/ext/knowledge/articles/${selectedArticle.id}/acknowledge`,
        "POST",
        { notes: ackNotes || undefined }
      );
      setNotice(`Ciência formal confirmada na versão v${selectedArticle.version}.`);
      setAckNotes("");
      await loadArticles();
      void loadDetail(selectedArticle.id);
    } catch {}
  }

  return (
    <main style={{ maxWidth: 1180, margin: "24px auto", padding: 16, fontFamily: "system-ui", background: "#f8fafc" }}>
      <h1>Base de Conhecimento e Procedimentos — EXT-08</h1>
      <p>
        <strong>Critério:</strong> Procedimentos operacionais versionados, busca por escopo, histórico imutável e confirmação de ciência por versão.
      </p>

      {loading && <p role="status">Carregando procedimentos canônicos…</p>}
      {error && (
        <div role="alert" style={{ ...cardStyle, borderColor: "#dc2626", color: "#991b1b" }}>
          {error} <button onClick={() => void loadArticles()} style={{ marginLeft: 8 }}>Tentar novamente</button>
        </div>
      )}
      {notice && <p role="status" style={{ color: "#166534", fontWeight: 600 }}>{notice}</p>}

      {/* Seção 1: Filtro e Busca */}
      <section style={cardStyle}>
        <h2>Buscar e Filtrar Procedimentos</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            style={inputStyle}
            placeholder="Buscar por termo ou POP..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />
          <select
            style={inputStyle}
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">Todas as categorias</option>
            <option value="operacional">Operacional</option>
            <option value="seguranca">Segurança</option>
            <option value="rh">RH / Pessoas</option>
            <option value="ti">TI / Sistemas</option>
            <option value="compliance">Compliance</option>
          </select>
          <select
            style={inputStyle}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">Todos os status</option>
            <option value="publicado">Publicado</option>
            <option value="aprovado">Aprovado</option>
            <option value="em_revisao">Em Revisão</option>
            <option value="rascunho">Rascunho</option>
            <option value="arquivado">Arquivado</option>
          </select>
          <button onClick={() => void loadArticles()} style={{ padding: "8px 16px", cursor: "pointer" }}>
            Buscar
          </button>
        </div>
      </section>

      {/* Seção 2: Lista de Artigos */}
      <section style={cardStyle}>
        <h2>Procedimentos Cadastrados ({articles.length})</h2>
        {!loading && articles.length === 0 && <p>Nenhum procedimento encontrado com os filtros atuais.</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {articles.map((art) => (
            <div
              key={art.id}
              onClick={() => void loadDetail(art.id)}
              style={{
                border: selectedArticle?.id === art.id ? "2px solid #2563eb" : "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 12,
                cursor: "pointer",
                background: selectedArticle?.id === art.id ? "#eff6ff" : "white",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 12, textTransform: "uppercase", color: "#6b7280", fontWeight: 600 }}>
                  {art.category} · v{art.version}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: art.status === "publicado" ? "#dcfce7" : art.status === "aprovado" ? "#e0e7ff" : "#fef3c7",
                    color: art.status === "publicado" ? "#166534" : art.status === "aprovado" ? "#3730a3" : "#92400e",
                  }}
                >
                  {art.status}
                </span>
              </div>
              <strong style={{ fontSize: 16 }}>{art.title}</strong>
              <p style={{ fontSize: 13, color: "#4b5563", margin: "6px 0" }}>
                {art.summary || (art.content ? art.content.slice(0, 90) + "..." : "")}
              </p>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280" }}>
                <span>Ciências: {art.ack_count}</span>
                {art.user_acknowledged ? (
                  <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ Ciente</span>
                ) : art.status === "publicado" ? (
                  <span style={{ color: "#dc2626", fontWeight: 600 }}>Pendente ciência</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Seção 3: Detalhe do Artigo Selecionado */}
      {selectedArticle && (
        <section style={{ ...cardStyle, borderLeft: "4px solid #2563eb" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <h2>{selectedArticle.title}</h2>
              <p style={{ color: "#6b7280", margin: "4px 0" }}>
                Slug: <code>{selectedArticle.slug}</code> | Versão: <strong>v{selectedArticle.version}</strong> | Status: <strong>{selectedArticle.status}</strong> | Categoria: <strong>{selectedArticle.category}</strong>
              </p>
            </div>
            {selectedArticle.status === "publicado" && (
              <div style={{ textAlign: "right" }}>
                {selectedArticle.user_acknowledged ? (
                  <span style={{ background: "#dcfce7", color: "#166534", padding: "6px 12px", borderRadius: 6, fontWeight: 600 }}>
                    ✓ Você já confirmou ciência nesta versão
                  </span>
                ) : (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      style={inputStyle}
                      placeholder="Observação (opcional)"
                      value={ackNotes}
                      onChange={(e) => setAckNotes(e.target.value)}
                    />
                    <button
                      onClick={() => void handleAcknowledge()}
                      style={{ padding: "8px 16px", background: "#16a34a", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
                    >
                      Confirmar Ciência
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ margin: "16px 0", padding: 12, background: "#f1f5f9", borderRadius: 8 }}>
            <h3 style={{ fontSize: 14, color: "#475569", marginBottom: 6 }}>Conteúdo do Procedimento</h3>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{selectedArticle.content}</div>
          </div>

          {/* Transição de Estado */}
          <div style={{ margin: "16px 0", padding: 12, border: "1px dashed #cbd5e1", borderRadius: 8 }}>
            <h3>Gerenciar Estado do Procedimento</h3>
            <form onSubmit={handleTransition} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select
                style={inputStyle}
                value={transitionStatus}
                onChange={(e) => setTransitionStatus(e.target.value)}
              >
                <option value="em_revisao">Enviar para Revisão</option>
                <option value="aprovado">Aprovar Tecnicamente</option>
                <option value="publicado">Publicar para Equipe</option>
                <option value="rascunho">Retornar para Rascunho</option>
                <option value="arquivado">Arquivar</option>
              </select>
              {transitionStatus === "aprovado" && (
                <input
                  style={inputStyle}
                  placeholder="Notas de revisão/aprovação"
                  value={transitionNotes}
                  onChange={(e) => setTransitionNotes(e.target.value)}
                />
              )}
              {transitionStatus === "arquivado" && (
                <input
                  style={inputStyle}
                  required
                  placeholder="Motivo do arquivamento"
                  value={transitionReason}
                  onChange={(e) => setTransitionReason(e.target.value)}
                />
              )}
              <button type="submit" style={{ padding: "8px 16px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>
                Executar Transição
              </button>
            </form>
          </div>

          {/* Histórico e Ciências */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <h3>Histórico de Versões e Modificações</h3>
              {history.length === 0 ? (
                <p style={{ color: "#6b7280" }}>Nenhuma alteração registrada.</p>
              ) : (
                <ul style={{ paddingLeft: 16 }}>
                  {history.map((h) => (
                    <li key={h.id} style={{ marginBottom: 6, fontSize: 13 }}>
                      <strong>v{h.next_version}</strong>: {h.change_summary} ({new Date(h.created_at).toLocaleDateString("pt-BR")})
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3>Ciências Registradas ({acknowledgments.length})</h3>
              {acknowledgments.length === 0 ? (
                <p style={{ color: "#6b7280" }}>Nenhum colaborador registrou ciência nesta versão ainda.</p>
              ) : (
                <ul style={{ paddingLeft: 16 }}>
                  {acknowledgments.map((a) => (
                    <li key={a.id} style={{ marginBottom: 6, fontSize: 13 }}>
                      <strong>{a.user_name || "Colaborador"}</strong> ({a.user_role || "staff"}) — {new Date(a.acknowledged_at).toLocaleDateString("pt-BR")}
                      {a.notes && <span style={{ color: "#6b7280" }}> ({a.notes})</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Seção 4: Criação de Novo Procedimento */}
      <section style={cardStyle}>
        <h2>Novo Procedimento Operacional Padrão (POP)</h2>
        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              style={inputStyle}
              required
              placeholder="Slug único (ex: pop-portaria-v1)"
              value={formSlug}
              onChange={(e) => setFormSlug(e.target.value)}
            />
            <input
              style={{ ...inputStyle, flex: 1 }}
              required
              placeholder="Título do Procedimento (5 a 200 caracteres)"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />
            <select
              style={inputStyle}
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
            >
              <option value="operacional">Operacional</option>
              <option value="seguranca">Segurança</option>
              <option value="rh">RH / Pessoas</option>
              <option value="ti">TI / Sistemas</option>
              <option value="compliance">Compliance</option>
            </select>
          </div>

          <input
            style={inputStyle}
            placeholder="Resumo executivo (opcional, 10 a 500 caracteres)"
            value={formSummary}
            onChange={(e) => setFormSummary(e.target.value)}
          />

          <textarea
            required
            rows={5}
            style={{ padding: 8, border: "1px solid #9ca3af", borderRadius: 6, fontFamily: "inherit" }}
            placeholder="Conteúdo completo do procedimento operacional (mínimo 50 caracteres)..."
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
          />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="Tags separadas por vírgula (ex: portaria, ronda, controle-acesso)"
              value={formTags}
              onChange={(e) => setFormTags(e.target.value)}
            />
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="Papéis com acesso (ex: admin, ti, operacao, supervisor — vazio = todos)"
              value={formRoles}
              onChange={(e) => setFormRoles(e.target.value)}
            />
          </div>

          <button
            type="submit"
            style={{ alignSelf: "flex-start", padding: "10px 20px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}
          >
            Cadastrar Procedimento (Rascunho)
          </button>
        </form>
      </section>
    </main>
  );
}
