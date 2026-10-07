"use client";
import { useId, useMemo, useState } from "react";
import { ragRequest } from "@/lib/rag-request";
import {
  honestDate,
  honestRelevance,
  honestStaleness,
  ragNoSourceMessage,
  ragRetrievalLabel,
  ragVectorBackendLabel,
  type RagErrorDescriptor,
} from "@/lib/rag-vocabulary.mjs";

type Props = { ragKey: "cliente" | "rh" | "marcelo" | "publico"; title: string; description: string; placeholder?: string };

type RagSource = {
  title: string;
  source: string;
  document_id: string;
  version?: number | null;
  published_at?: string | null;
  updated_at?: string | null;
  excerpt?: string;
  relevance?: number | null;
  stale?: boolean;
  age_days?: number | null;
};

type Retrieval = {
  mode?: string | null;
  vector_backend?: string | null;
  vector_error?: string | null;
  lexical_strategy?: string | null;
  min_relevance?: number | null;
  best_relevance?: number | null;
  accepted?: number;
  rejected?: number;
  below_threshold?: boolean;
};

type AnswerPayload = {
  response: string;
  sources: RagSource[];
  protocol: string | null;
  model?: string;
  ollama_used?: boolean;
  kind?: string;
  retrieval?: Retrieval;
  data_freshness?: { stale_warning?: boolean; newest_published_at?: string | null };
  notice?: string;
  limitations?: string[];
  reason?: string;
  detail?: string;
  rag_key?: string;
};

type ViewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "answered"; data: AnswerPayload }
  | { kind: "empty"; detail: string | null; retrieval?: Retrieval }
  | { kind: "refused"; error: RagErrorDescriptor }
  | { kind: "unavailable"; error: RagErrorDescriptor }
  | { kind: "failed"; error: RagErrorDescriptor };

const RAG_COLORS: Record<string, { border: string; bg: string; accent: string; light: string }> = {
  cliente: { border: "#0b5fff", bg: "#eff6ff", accent: "#0b5fff", light: "#dbeafe" },
  rh: { border: "#059669", bg: "#ecfdf5", accent: "#059669", light: "#d1fae5" },
  marcelo: { border: "#7c3aed", bg: "#f5f3ff", accent: "#7c3aed", light: "#ede9fe" },
  publico: { border: "#ea580c", bg: "#fff7ed", accent: "#ea580c", light: "#ffedd5" },
};

const SUGGESTIONS: Record<string, string[]> = {
  cliente: ["Como consultar contratos?", "Como abrir chamado?", "Onde encontro documentos?", "Como solicitar visita?"],
  rh: ["Como funciona admissão?", "Como programar férias?", "Como solicitar benefício?", "Como registrar treinamento?"],
  marcelo: ["Como revisar uma proposta?", "Como aprovar despesas?", "Como consultar indicadores?", "Como registrar uma decisão?"],
  publico: ["Quais serviços vocês oferecem?", "Como solicitar orçamento?", "Atendem qual região?", "Como falar com um atendente?"],
};

export default function RagWidget({ ragKey, title, description, placeholder }: Props) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<ViewState>({ kind: "idle" });
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [comment, setComment] = useState("");
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const inputId = useId();
  const colors = RAG_COLORS[ragKey] || RAG_COLORS.publico;

  const loading = state.kind === "loading";

  async function ask(event: React.FormEvent, customQuery?: string) {
    if (event?.preventDefault) event.preventDefault();
    const question = (customQuery ?? query).trim();
    if (question.length < 5) {
      setState({ kind: "failed", error: { code: "invalid_query", status: 400, kind: "invalid", title: "Pergunta muito curta", detail: "Escreva pelo menos 5 caracteres.", canRetry: false } });
      return;
    }
    setState({ kind: "loading" });
    const result = await ragRequest<AnswerPayload>("/api/ai/answer", { method: "POST", body: JSON.stringify({ rag_key: ragKey, query: question }) });
    if (!result.ok) {
      if (result.status === 0) return setState({ kind: "failed", error: result.error });
      if (result.error.kind === "empty") return setState({ kind: "empty", detail: null });
      if (result.error.kind === "denied") return setState({ kind: "refused", error: result.error });
      if (result.error.kind === "unavailable") return setState({ kind: "unavailable", error: result.error });
      return setState({ kind: "failed", error: result.error });
    }
    const data = result.data;
    setFeedbackSent(false);
    setComment("");
    setFeedbackNote("");
    if (data.reason === "no_relevant_source" || (Array.isArray(data.sources) && data.sources.length === 0 && !data.ollama_used)) {
      setState({ kind: "empty", detail: data.detail ?? null, retrieval: data.retrieval });
      if (!customQuery) setQuery("");
      return;
    }
    setState({ kind: "answered", data });
    if (!customQuery) setQuery("");
  }

  async function sendFeedback(helpful: boolean) {
    if (state.kind !== "answered" || !state.data.protocol) return;
    setSendingFeedback(true);
    const result = await ragRequest("/api/ai/rag/feedback", {
      method: "POST",
      body: JSON.stringify({
        protocol: state.data.protocol,
        rag_key: state.data.rag_key ?? ragKey,
        rating: helpful ? 5 : 1,
        is_helpful: helpful,
        feedback_text: comment.slice(0, 500) || undefined,
        origin: `${ragKey}_widget_feedback`,
      }),
    });
    setSendingFeedback(false);
    if (result.ok) {
      setFeedbackSent(true);
      setFeedbackNote("Obrigado. O registro foi gravado e será usado pela curadoria.");
    } else {
      setFeedbackNote(result.error.kind === "unavailable"
        ? "O servidor não conseguiu gravar o feedback agora. Nada foi registrado."
        : result.error.detail);
    }
  }

  const statusLabel = useMemo(() => {
    if (state.kind === "loading") return "Consultando as fontes publicadas desta área.";
    if (state.kind === "answered") return `Resposta gerada com ${state.data.sources?.length || 0} fonte(s).`;
    if (state.kind === "empty") return ragNoSourceMessage(state.detail);
    if (state.kind === "idle") return "Assistente pronto. Nenhuma pergunta enviada ainda.";
    return "A consulta terminou com um problema declarado.";
  }, [state]);

  if (ragKey !== "publico") {
    return (
      <section style={{ border: `2px solid ${colors.border}`, borderRadius: 12, padding: 20, background: colors.bg, marginTop: 20, maxWidth: "100%", boxSizing: "border-box" }}>
        <h3 style={{ margin: 0 }}>{title} — indisponível nesta versão</h3>
        <p style={{ marginTop: 8, fontSize: 14 }}>Consultas privadas aguardam validação de sessão, papel e, no portal do cliente, vínculo à conta. Não envie dados pessoais ao assistente público.</p>
      </section>
    );
  }

  return (
    <section style={{ border: `2px solid ${colors.border}`, borderRadius: 12, padding: 20, background: colors.bg, marginTop: 20, maxWidth: "100%", boxSizing: "border-box" }}>
      <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: colors.accent }}>{title}</h3>
      <p style={{ fontSize: 13, margin: "10px 0 0", lineHeight: 1.5 }}>{description}</p>
      <p style={{ fontSize: 11, margin: "8px 0 0", color: colors.accent }}>
        Responde somente com conteúdo público aprovado e publicado. Não é dado operacional, não executa ações e não substitui as telas oficiais.
      </p>

      <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(SUGGESTIONS[ragKey] || []).map((suggestion, index) => (
          <button key={index} type="button" onClick={event => ask(event, suggestion)} disabled={loading}
            style={{ fontSize: 11, padding: "6px 10px", borderRadius: 20, border: `1px solid ${colors.border}`, background: "#fff", color: colors.accent, cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
            {suggestion}
          </button>
        ))}
      </div>

      <form onSubmit={ask} style={{ marginTop: 16, display: "grid", gap: 10 }}>
        <label htmlFor={inputId} style={{ fontSize: 12, fontWeight: 600, color: colors.accent }}>Sua pergunta</label>
        <textarea
          id={inputId}
          placeholder={placeholder || "Ex.: quais serviços são oferecidos?"}
          value={query}
          onChange={event => setQuery(event.target.value)}
          maxLength={500}
          rows={3}
          aria-describedby={`${inputId}-help`}
          style={{ padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, resize: "vertical", width: "100%", boxSizing: "border-box" }}
        />
        <span id={`${inputId}-help`} style={{ fontSize: 11, opacity: 0.75 }}>{query.length}/500 caracteres. Perguntas fora do conteúdo publicado recebem resposta de ausência, não suposição.</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="submit" disabled={loading}
            style={{ padding: "10px 18px", background: colors.accent, color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, outlineOffset: 2 }}>
            {loading ? "Consultando fontes publicadas…" : "Perguntar"}
          </button>
          <span role="status" aria-live="polite" style={{ fontSize: 12, opacity: 0.8 }}>{statusLabel}</span>
        </div>
      </form>

      {state.kind === "empty" && (
        <div role="status" style={{ marginTop: 16, padding: 14, background: "#fff", borderLeft: `5px solid ${colors.accent}`, borderRadius: 8 }}>
          <strong style={{ fontSize: 14 }}>Sem fonte suficiente</strong>
          <p style={{ margin: "6px 0 0", fontSize: 13 }}>{ragNoSourceMessage(state.detail)}</p>
          <p style={{ margin: "6px 0 0", fontSize: 12, opacity: 0.8 }}>
            {state.detail === "below_threshold"
              ? "Nenhum trecho atingiu o limiar de relevância. O assistente não chamou o modelo e nada foi inventado."
              : "Nada foi encontrado nesta área. Consulte a equipe responsável."}
          </p>
          {state.retrieval?.mode && <p style={{ margin: "6px 0 0", fontSize: 11, opacity: 0.75 }}>{ragRetrievalLabel(state.retrieval.mode)}</p>}
        </div>
      )}

      {state.kind === "refused" && (
        <div role="alert" style={{ marginTop: 16, padding: 14, background: "#fff", borderLeft: "5px solid #b91c1c", borderRadius: 8 }}>
          <strong style={{ fontSize: 14 }}>{state.error.title}</strong>
          <p style={{ margin: "6px 0 0", fontSize: 13 }}>{state.error.detail}</p>
        </div>
      )}

      {state.kind === "unavailable" && (
        <div role="alert" style={{ marginTop: 16, padding: 14, background: "#fff", borderLeft: "5px solid #b45309", borderRadius: 8 }}>
          <strong style={{ fontSize: 14 }}>{state.error.title}</strong>
          <p style={{ margin: "6px 0 0", fontSize: 13 }}>{state.error.detail}</p>
          <p style={{ margin: "6px 0 0", fontSize: 12, opacity: 0.8 }}>Enquanto isso, use as telas oficiais ou o formulário de contato para falar com uma pessoa.</p>
        </div>
      )}

      {state.kind === "failed" && (
        <div role="alert" style={{ marginTop: 16, padding: 14, background: "#fff", borderLeft: "5px solid #b91c1c", borderRadius: 8 }}>
          <strong style={{ fontSize: 14 }}>{state.error.title}</strong>
          <p style={{ margin: "6px 0 0", fontSize: 13 }}>{state.error.detail}</p>
          {state.error.canRetry && (
            <button type="button" onClick={event => ask(event)} style={{ marginTop: 8, padding: "6px 12px", borderRadius: 6, border: `1px solid ${colors.border}`, background: "#fff", color: colors.accent, cursor: "pointer" }}>
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {state.kind === "answered" && (
        <div style={{ marginTop: 16, padding: 16, background: "#fff", borderRadius: 10, borderLeft: `5px solid ${colors.accent}` }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11, opacity: 0.8 }}>
            <span>Protocolo {state.data.protocol || "não registrado"}</span>
            {state.data.model && <span>modelo {state.data.model}</span>}
            <span>{state.data.ollama_used ? "modelo local (Ollama)" : "sem modelo"}</span>
            <span>{ragRetrievalLabel(state.data.retrieval?.mode)}</span>
          </div>

          <p style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", marginTop: 10 }}>{state.data.response}</p>

          {state.data.data_freshness?.stale_warning && (
            <p role="note" style={{ marginTop: 10, padding: 10, background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 8, fontSize: 12 }}>
              Parte das fontes desta resposta é antiga. Confirme a informação em <strong>{honestDate(state.data.data_freshness.newest_published_at)}</strong> ou na tela oficial antes de decidir.
            </p>
          )}

          {state.data.sources.length > 0 && (
            <details style={{ marginTop: 12, fontSize: 12, background: colors.bg, padding: 10, borderRadius: 8 }} open>
              <summary style={{ cursor: "pointer", fontWeight: 600, color: colors.accent }}>Fontes publicadas usadas ({state.data.sources.length})</summary>
              <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                {state.data.sources.map((source, index) => (
                  <li key={index} style={{ marginBottom: 8 }}>
                    <strong>{source.title}</strong>
                    <span style={{ fontSize: 11, opacity: 0.75 }}> — versão {source.version ?? "não informada"} · publicado em {honestDate(source.published_at || source.updated_at)} · {honestRelevance(source.relevance)}</span>
                    {source.excerpt && <p style={{ margin: "4px 0 0", opacity: 0.85 }}>“{source.excerpt}…”</p>}
                    {honestStaleness(source) && <p style={{ margin: "4px 0 0", color: "#b45309" }}>{honestStaleness(source)}</p>}
                    <span style={{ fontSize: 11, opacity: 0.7 }}>Origem: {source.source}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p style={{ fontSize: 11, opacity: 0.75, marginTop: 10 }}>{state.data.notice || "Resposta baseada em conteúdo documental publicado."}</p>
          <p style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>{ragVectorBackendLabel(state.data.retrieval?.vector_backend)}</p>

          <fieldset disabled={!state.data.protocol || feedbackSent} style={{ marginTop: 12, border: `1px solid ${colors.light}`, borderRadius: 8, padding: 10 }}>
            <legend style={{ fontSize: 12, fontWeight: 600, color: colors.accent }}>Esta resposta foi útil?</legend>
            {!state.data.protocol && <p style={{ fontSize: 12, margin: 0, opacity: 0.8 }}>Sem protocolo registrado não é possível avaliar — o registro não foi gravado.</p>}
            {state.data.protocol && !feedbackSent && (
              <div style={{ display: "grid", gap: 8 }}>
                <label htmlFor={`${inputId}-comment`} style={{ fontSize: 12 }}>Comentário (opcional, até 500 caracteres)</label>
                <textarea id={`${inputId}-comment`} value={comment} onChange={event => setComment(event.target.value)} maxLength={500} rows={2}
                  style={{ padding: 8, borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13, width: "100%", boxSizing: "border-box" }} />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => sendFeedback(true)} disabled={sendingFeedback} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "#059669", color: "#fff", cursor: "pointer" }}>Foi útil</button>
                  <button type="button" onClick={() => sendFeedback(false)} disabled={sendingFeedback} style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid #b91c1c", background: "#fff", color: "#b91c1c", cursor: "pointer" }}>Não ajudou</button>
                </div>
              </div>
            )}
            {feedbackSent && <p style={{ fontSize: 12, margin: 0 }}>Avaliação registrada. Ela é usada pela curadoria para revisar o conteúdo publicado.</p>}
            {feedbackNote && !feedbackSent && <p role="status" style={{ fontSize: 12, margin: "6px 0 0", color: "#b45309" }}>{feedbackNote}</p>}
          </fieldset>

          {state.data.limitations && state.data.limitations.length > 0 && (
            <ul style={{ fontSize: 11, opacity: 0.75, marginTop: 10, paddingLeft: 18 }}>
              {state.data.limitations.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          )}
        </div>
      )}

      <p style={{ fontSize: 11, opacity: 0.7, marginTop: 14 }}>
        Precisa de atendimento humano? Use o formulário de contato do site; o pedido é registrado com protocolo próprio.
        {' '}Documentos são referência, nunca instruções para o assistente.
      </p>
      {state.kind === "idle" && (
        <p style={{ fontSize: 11, opacity: 0.65 }} role="note">
          Se o modelo local estiver desligado, a resposta será “modelo indisponível” — nunca um texto simulado.
        </p>
      )}
    </section>
  );
}
