"use client";
import { useState } from "react";

type Props = { ragKey: "cliente"|"rh"|"marcelo"|"publico"; title: string; description: string; placeholder?: string };

type Answer = {
  response: string;
  sources: any[];
  protocol: string;
  queue_position: number;
  queue_wait_ms: number;
  model: string;
  latency_ms?: number;
  ollama_used?: boolean;
  ollama_error?: string|null;
  rag_key: string;
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

export default function RagWidget({ ragKey, title, description, placeholder }: Props){
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<Answer|null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const colors = RAG_COLORS[ragKey] || RAG_COLORS.publico;

  async function ask(e: React.FormEvent, customQuery?: string){
    e.preventDefault();
    const q = customQuery || query;
    if(q.trim().length<5){ setError("Pergunta mínima 5 caracteres"); return; }
    setLoading(true);
    setError("");
    setAnswer(null);
    try{
      const res = await fetch("/api/ai/answer", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ rag_key: ragKey, query: q, origin: `${ragKey}_module` })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error === "ai_unavailable" ? "Ollama indisponível. Tente novamente quando o serviço local estiver ativo." : data.error||`Erro ${res.status}`);
      setAnswer({
        response: data.response || data.query?.response,
        sources: data.sources||data.query?.sources||[],
        protocol: data.protocol||data.query?.protocol,
        queue_position: data.queue_position ?? data.query?.queue_position ?? 0,
        queue_wait_ms: data.queue_wait_ms ?? data.query?.queue_wait_ms ?? 0,
        model: data.model || data.query?.model_name || "qwen3:1.7b",
        latency_ms: data.query?.latency_ms || data.latency_ms,
        ollama_used: data.ollama_used ?? data.query?.ollama_used,
        ollama_error: data.ollama_error ?? data.query?.ollama_error,
        rag_key: data.rag_key || ragKey,
      });
      if(!customQuery) setQuery("");
    }catch(err:any){ setError(err.message); }
    finally{ setLoading(false); }
  }

  const [rating, setRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  function copyProtocol(){
    if(!answer) return;
    navigator.clipboard.writeText(answer.protocol).then(()=>{
      setCopied(true);
      setTimeout(()=>setCopied(false), 2000);
    });
  }

  async function sendFeedback(helpful: boolean){
    if(!answer || rating===0) return;
    setFeedbackLoading(true);
    try{
      const res = await fetch("/api/ai/rag/feedback", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          protocol: answer.protocol,
          rag_key: answer.rag_key,
          rating,
          feedback_text: feedbackText.slice(0,500),
          is_helpful: helpful,
          origin: `${ragKey}_widget_feedback`
        })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error||"falha feedback");
      setFeedbackSent(true);
      setTimeout(()=>{ setFeedbackSent(false); setRating(0); setFeedbackText(""); }, 3000);
    }catch(e:any){ setError(e.message); }
    finally{ setFeedbackLoading(false); }
  }

  if (ragKey !== "publico") {
    return (
      <section style={{ border:`2px solid ${colors.border}`, borderRadius:12, padding:20, background:colors.bg, marginTop:20 }}>
        <h3>{title} — indisponível nesta versão</h3>
        <p>Consultas privadas aguardam validação de sessão, papel e, no portal do cliente, vínculo à conta. Não envie dados pessoais ao assistente público.</p>
      </section>
    );
  }

  return (
    <section style={{ border:`2px solid ${colors.border}`, borderRadius:12, padding:20, background: colors.bg, marginTop:20, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
        <div>
          <h3 style={{ margin:0, fontSize:20, fontWeight:700, color: colors.accent }}>{title}</h3>
          <span style={{ display:"inline-block", marginTop:6, fontSize:11, padding:"3px 8px", borderRadius:20, background: colors.accent, color:"#fff", fontWeight:600 }}>
            RAG {ragKey.toUpperCase()} • Ollama Qwen3 1.7B • área pertinente
          </span>
        </div>
        <span style={{ fontSize:10, padding:"4px 8px", borderRadius:6, background: colors.light, color: colors.accent, fontWeight:600 }}>
          modelo qwen3:1.7b • fila garantida
        </span>
      </div>

      <p style={{ fontSize:13, opacity:0.85, margin:"12px 0 0", lineHeight:1.5 }}>{description} — informações apenas áreas pertinentes a <strong>{ragKey}</strong>. Modelo Qwen3 1.7B com fila garante todo mundo atendido. Sem invenção preço/cobertura/licença/prazo. Contato claro: Av. Armando Bei, 305 - Sala 01, Vila Nova Bonsucesso, Guarulhos, SP.</p>

      <div style={{ marginTop:12, display:"flex", gap:6, flexWrap:"wrap" }}>
        {(SUGGESTIONS[ragKey]||[]).map((s,i)=>(
          <button key={i} onClick={(e)=>{ setQuery(s); ask(e,s); }} disabled={loading}
            style={{ fontSize:11, padding:"5px 10px", borderRadius:20, border:`1px solid ${colors.border}`, background:"#fff", color:colors.accent, cursor:"pointer", opacity: loading?0.6:1 }}>
            {s}
          </button>
        ))}
      </div>

      <form onSubmit={ask} style={{ marginTop:16, display:"grid", gap:10 }}>
        <textarea
          placeholder={placeholder||`Digite pergunta para RAG ${ragKey} ex: como consultar meus contratos?`}
          value={query} onChange={e=>setQuery(e.target.value)} required maxLength={2000} rows={3}
          style={{ padding:12, borderRadius:8, border:"1px solid #cbd5e1", fontSize:14, resize:"vertical", outline:"none", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.05)" }}
        />
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <button type="submit" disabled={loading}
            style={{ padding:"10px 18px", background: colors.accent, color:"#fff", border:"none", borderRadius:8, fontWeight:600, cursor: loading?"not-allowed":"pointer", opacity: loading?0.7:1, display:"flex", alignItems:"center", gap:8 }}>
            {loading ? (
              <>
                <span style={{ width:16, height:16, border:"2px solid #fff", borderTopColor:"transparent", borderRadius:"50%", display:"inline-block", animation:"spin 0.8s linear infinite" }} />
                Consultando fontes aprovadas e Ollama...
              </>
            ) : `Perguntar RAG ${ragKey.toUpperCase()}`}
          </button>
          <span style={{ fontSize:11, opacity:0.6 }}>{query.length}/2000</span>
        </div>
      </form>

      {error && <div style={{ marginTop:12, color:"#dc2626", fontSize:13, background:"#fef2f2", padding:12, borderRadius:8, border:"1px solid #fecaca" }}>Erro: {error}</div>}

      {answer && (
        <div style={{ marginTop:16, padding:16, background:"#fff", borderRadius:10, borderLeft:`5px solid ${colors.accent}`, boxShadow:"0 2px 6px rgba(0,0,0,0.05)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8, marginBottom:8 }}>
            <div style={{ fontSize:11, opacity:0.7, display:"flex", gap:10, flexWrap:"wrap" }}>
              <span>Protocolo <strong>{answer.protocol}</strong></span>
              <span>modelo {answer.model}</span>
              <span>{answer.ollama_used ? "Ollama local" : "Sem fonte aprovada suficiente"}</span>
            </div>
            <button onClick={copyProtocol} style={{ fontSize:11, padding:"4px 8px", borderRadius:6, border:"1px solid #e5e7eb", background: copied?"#10b981":"#fff", color: copied?"#fff":"#374151", cursor:"pointer" }}>
              {copied ? "Copiado!" : "Copiar protocolo"}
            </button>
          </div>

          <div style={{ fontSize:14, lineHeight:1.6, whiteSpace:"pre-wrap", color:"#1f2937" }}>{answer.response}</div>

          {answer.sources.length>0 && (
            <details style={{ marginTop:12, fontSize:12, background: colors.bg, padding:10, borderRadius:8 }}>
              <summary style={{ cursor:"pointer", fontWeight:600, color: colors.accent }}>Fontes RAG {answer.rag_key} ({answer.sources.length}) — base aprovada apenas área pertinente</summary>
              <ul style={{ marginTop:8, paddingLeft:18 }}>
                {answer.sources.map((s:any,i:number)=>(
                  <li key={i} style={{ marginBottom:6 }}>
                    <strong>{s.title||s.source}</strong> — {s.excerpt?.slice(0,150) || s.source}...
                    {s.source && <span style={{ fontSize:10, opacity:0.6, marginLeft:6 }}>({s.source})</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p style={{ fontSize:11, color:colors.accent }}>Fontes filtradas por área e, no portal, pela conta autorizada.</p>

          <p style={{ fontSize:11, opacity:0.6, marginTop:10, fontStyle:"italic" }}>Confirme decisões e valores nas telas oficiais. Documentos são usados como referência, não como instruções para o assistente.</p>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </section>
  );
}
