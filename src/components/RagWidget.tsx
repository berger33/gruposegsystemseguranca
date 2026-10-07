"use client";
// FECH-01 — assistente (RAG) do site, do portal do cliente e das áreas privadas.
//
// O que mudou nesta fatia: o widget deixou de esconder as bases privadas atrás
// de um aviso fixo e passou a perguntar ao servidor. Quem autoriza é
// `POST /api/ai/answer` (sessão + papel + vínculo de conta/unidade verificados
// no backend); a tela apenas apresenta a resposta — inclusive as negativas.
//
// Honestidade do contrato: sem fonte aprovada o servidor não chama o modelo e
// não devolve protocolo; a tela mostra isso como ausência, nunca inventa
// protocolo, modelo, fila ou "resposta simulada". A geração local existente é
// preservada: o modelo só é usado quando há trecho publicado relacionado.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  RAG_QUESTION_MAX,
  RAG_QUESTION_MIN,
  describeRagFailure,
  describeRagSuccess,
  normalizeRagAnswer,
  ragScopeLabel,
  validateRagQuestion,
} from "@/lib/rag-widget-contract.mjs";

type Props = { ragKey: "cliente" | "rh" | "marcelo" | "publico"; title: string; description: string; placeholder?: string };

type Answer = {
  response: string;
  sources: any[];
  protocol: string | null;
  model: string | null;
  ollamaUsed: boolean;
  ragKey: string;
  reason: string | null;
};

type Failure = {
  code: string | null;
  status: number;
  state: string;
  title: string;
  detail: string;
  canRetry: boolean;
  retryAfterSeconds: number | null;
};

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
  publico: ["Quais serviços vocês oferecem?", "Como solicitar orçamento?", "Contato claro?", "FAQ por categoria?"],
};

const STATE_STYLE: React.CSSProperties = { marginTop: 12, padding: 12, borderRadius: 8, fontSize: 13, lineHeight: 1.5 };

function busyDetail(failure: Failure) {
  if (failure.state !== "busy" || !failure.retryAfterSeconds) return failure.detail;
  return `${failure.detail} Nova tentativa sugerida em ${failure.retryAfterSeconds}s.`;
}

export default function RagWidget({ ragKey, title, description, placeholder }: Props) {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<"idle" | "loading" | "answered" | "failed">("idle");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [statusText, setStatusText] = useState("");
  const [copied, setCopied] = useState(false);
  const inputId = useId();
  const headingId = useId();
  const helpId = `${inputId}-help`;
  const counterId = `${inputId}-counter`;
  const inFlight = useRef(false);
  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const colors = RAG_COLORS[ragKey] || RAG_COLORS.publico;
  const scopeLabel = ragScopeLabel(ragKey);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const ask = useCallback(async (raw?: string) => {
    const question = (raw ?? query).trim();
    if (inFlight.current) return; // prevenção de envio duplicado (duplo clique, Enter repetido, sugestão)
    const local = validateRagQuestion(question);
    if (!local.ok) {
      setPhase("failed");
      setAnswer(null);
      setFailure({ code: local.code, status: 0, state: "invalid_question", title: "Pergunta fora do limite", detail: local.message, canRetry: false, retryAfterSeconds: null });
      setStatusText(`Pergunta não enviada: ${local.message}`);
      return;
    }
    inFlight.current = true;
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("loading");
    setAnswer(null);
    setFailure(null);
    setStatusText("Consultando a base aprovada deste escopo.");
    try {
      const res = await fetch("/api/ai/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        signal: controller.signal,
        body: JSON.stringify({ rag_key: ragKey, query: question, origin: `${ragKey}_module` }),
      });
      const raw = await res.text();
      let payload: any = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
      if (requestSeq.current !== seq) return; // resposta atrasada: outra consulta já assumiu a tela
      if (!res.ok) {
        const described = describeRagFailure({
          status: res.status,
          error: payload?.error,
          reason: payload?.reason,
          retryAfterSeconds: Number(payload?.retry_after_seconds),
        });
        setPhase("failed");
        setFailure(described as Failure);
        setStatusText(described.title);
        return;
      }
      const normalized = normalizeRagAnswer(payload || {});
      const outcome = describeRagSuccess(normalized);
      setAnswer(normalized as Answer);
      setPhase("answered");
      setStatusText(outcome.state === "answered"
        ? `Resposta recebida com ${normalized.sources.length} fonte(s) publicada(s).`
        : `${outcome.title}.`);
    } catch (error: any) {
      if (requestSeq.current !== seq) return;
      if (error?.name === "AbortError") return;
      const described = describeRagFailure({ status: 0 });
      setPhase("failed");
      setFailure(described as Failure);
      setStatusText(described.title);
    } finally {
      if (requestSeq.current === seq) inFlight.current = false;
    }
  }, [query, ragKey]);

  function copyProtocol() {
    const protocol = answer?.protocol;
    if (!protocol) return;
    navigator.clipboard?.writeText(protocol).then(() => {
      setCopied(true);
      setStatusText("Protocolo copiado.");
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => setStatusText("Não foi possível copiar o protocolo neste navegador."));
  }

  const outcome = phase === "answered" && answer ? describeRagSuccess(answer) : null;
  const uiState = phase === "loading"
    ? "loading"
    : phase === "failed" && failure
      ? failure.state
      : phase === "answered" && answer
        ? (outcome?.state || "answered")
        : "idle";

  return (
    <section
      className="rag-widget"
      aria-labelledby={headingId}
      data-testid="rag-widget"
      data-rag-key={ragKey}
      data-ui-state={uiState}
      aria-busy={phase === "loading"}
      style={{ border: `2px solid ${colors.border}`, borderRadius: 12, padding: 20, background: colors.bg, marginTop: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
    >
      <style>{`
        .rag-widget :focus-visible { outline: 3px solid #1d4ed8; outline-offset: 2px; }
        .rag-widget .rag-spin { display:inline-block; width:16px; height:16px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation: rag-spin 0.8s linear infinite; }
        .rag-widget .rag-suggestion { font-size:11px; padding:5px 10px; border-radius:20px; background:#fff; cursor:pointer; }
        @keyframes rag-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .rag-widget .rag-spin { animation: none; } }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 id={headingId} style={{ margin: 0, fontSize: 20, fontWeight: 700, color: colors.accent }}>{title}</h2>
          <span style={{ display: "inline-block", marginTop: 6, fontSize: 11, padding: "3px 8px", borderRadius: 20, background: colors.accent, color: "#fff", fontWeight: 600 }}>
            RAG {ragKey.toUpperCase()} • escopo conferido no servidor
          </span>
        </div>
        <span data-testid="rag-scope" style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, background: colors.light, color: colors.accent, fontWeight: 600, maxWidth: 260 }}>
          {scopeLabel}
        </span>
      </div>

      <details style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Escopo declarado deste assistente</summary>
        <p style={{ margin: "8px 0 0", lineHeight: 1.5 }}>{description}</p>
      </details>

      <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {(SUGGESTIONS[ragKey] || []).map((s, i) => (
          <button
            key={i}
            type="button"
            className="rag-suggestion"
            data-testid={`rag-suggestion-${i}`}
            disabled={phase === "loading"}
            onClick={() => { setQuery(s); ask(s); }}
            style={{ border: `1px solid ${colors.border}`, color: colors.accent, opacity: phase === "loading" ? 0.6 : 1 }}
          >
            {s}
          </button>
        ))}
      </div>

      <form onSubmit={event => { event.preventDefault(); ask(); }} style={{ marginTop: 16, display: "grid", gap: 10 }}>
        <label htmlFor={inputId} style={{ fontSize: 13, fontWeight: 600 }}>
          Pergunta para {title}
        </label>
        <textarea
          id={inputId}
          data-testid="rag-question"
          placeholder={placeholder || `Digite a pergunta para a base ${ragKey}`}
          value={query}
          onChange={event => setQuery(event.target.value)}
          required
          maxLength={RAG_QUESTION_MAX}
          rows={3}
          aria-describedby={`${helpId} ${counterId}`}
          disabled={phase === "loading"}
          style={{ padding: 12, borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14, resize: "vertical", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)", width: "100%", boxSizing: "border-box" }}
        />
        <p id={helpId} style={{ margin: 0, fontSize: 11, opacity: 0.75 }}>
          Entre {RAG_QUESTION_MIN} e {RAG_QUESTION_MAX} caracteres — o mesmo limite aceito pelo servidor. Perguntas e respostas não são gravadas no painel de custo.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="submit"
            data-testid="rag-submit"
            disabled={phase === "loading"}
            style={{ padding: "10px 18px", background: colors.accent, color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: phase === "loading" ? "not-allowed" : "pointer", opacity: phase === "loading" ? 0.7 : 1, display: "flex", alignItems: "center", gap: 8 }}
          >
            {phase === "loading" ? (<><span className="rag-spin" aria-hidden="true" /> Consultando base e modelo local…</>) : `Perguntar à base ${ragKey.toUpperCase()}`}
          </button>
          <span id={counterId} data-testid="rag-counter" style={{ fontSize: 11, opacity: 0.7 }}>{query.length}/{RAG_QUESTION_MAX}</span>
        </div>
      </form>

      <p role="status" aria-live="polite" data-testid="rag-status" style={{ margin: "10px 0 0", fontSize: 12, opacity: 0.85 }}>
        {statusText}
      </p>

      {phase === "failed" && failure && (
        <div data-testid="rag-failure" role="alert" style={{ ...STATE_STYLE, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca" }}>
          <strong style={{ display: "block", marginBottom: 4 }}>{failure.title}</strong>
          {busyDetail(failure)}
          {failure.code && <span style={{ display: "block", marginTop: 6, fontSize: 11, opacity: 0.8 }}>Código técnico: {failure.code}</span>}
          {failure.canRetry && (
            <button type="button" data-testid="rag-retry" onClick={() => ask()} style={{ marginTop: 8, padding: "6px 12px", borderRadius: 6, border: "1px solid #b91c1c", background: "#fff", color: "#b91c1c", fontWeight: 600, cursor: "pointer" }}>
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {phase === "answered" && answer && (
        <div data-testid="rag-answer" data-answer-state={outcome?.state || "answered"} style={{ marginTop: 16, padding: 16, background: "#fff", borderRadius: 10, borderLeft: `5px solid ${colors.accent}`, boxShadow: "0 2px 6px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 11, opacity: 0.75, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {answer.protocol && <span>Protocolo <strong data-testid="rag-protocol">{answer.protocol}</strong></span>}
              {answer.model && <span>modelo {answer.model}</span>}
              <span data-testid="rag-answer-origin">{answer.ollamaUsed ? "Ollama local" : "Sem fonte aprovada suficiente — modelo não consultado"}</span>
            </div>
            {answer.protocol && (
              <button type="button" data-testid="rag-copy-protocol" onClick={copyProtocol} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid #e5e7eb", background: copied ? "#10b981" : "#fff", color: copied ? "#fff" : "#374151", cursor: "pointer" }}>
                {copied ? "Copiado!" : "Copiar protocolo"}
              </button>
            )}
          </div>

          <div data-testid="rag-answer-response" style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap", color: "#1f2937" }}>{answer.response}</div>

          {answer.sources.length > 0 && (
            <details data-testid="rag-sources" style={{ marginTop: 12, fontSize: 12, background: colors.bg, padding: 10, borderRadius: 8 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, color: colors.accent }}>Fontes publicadas usadas ({answer.sources.length})</summary>
              <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                {answer.sources.map((s: any, i: number) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    <strong>{s.title || s.source}</strong>
                    {s.source && <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 6 }}>({s.source})</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p style={{ fontSize: 11, color: colors.accent, marginBottom: 0 }}>
            Fontes filtradas por área e, no portal, pelas contas vinculadas à sua sessão. Confirme decisões e valores nas telas oficiais.
          </p>
        </div>
      )}
    </section>
  );
}
