"use client";
import { useEffect, useState } from "react";

type BotConfig = { active_mode: string; whatsapp_number: string; whatsapp_message_template: string; default_rag_key: string; model_name: string; is_dev_mode: boolean; is_beta_mode: boolean; ollama_host?: string; max_queue_size?: number };

type Answer = {
  response: string;
  protocol: string;
  mode: string;
  queue_position: number;
  queue_wait_ms: number;
  is_whatsapp_redirect: boolean;
  whatsapp_number: string|null;
  rag_key: string;
  sources: any[];
  latency_ms?: number;
  ollama_used?: boolean;
  ollama_error?: string|null;
};

const MODE_COLORS: Record<string, { border: string; bg: string; accent: string; light: string; emoji: string }> = {
  sem_ia: { border: "#0b5fff", bg: "#eff6ff", accent: "#0b5fff", light: "#dbeafe", emoji: "📘" },
  com_ia: { border: "#7c3aed", bg: "#f5f3ff", accent: "#7c3aed", light: "#ede9fe", emoji: "🤖" },
  whatsapp: { border: "#25D366", bg: "#f0fdf4", accent: "#25D366", light: "#dcfce7", emoji: "💬" },
};

const QUICK_ACTIONS = [
  "Quais serviços vocês oferecem?",
  "Como solicitar orçamento?",
  "Contato claro?",
  "Como funciona visita técnica?",
];

export default function AiBotWidget({ defaultRagKey = "publico" as "cliente"|"rh"|"marcelo"|"publico", showDevConfig = false }){
  const [config, setConfig] = useState<BotConfig|null>(null);
  const [query, setQuery] = useState("");
  const [visitorName, setVisitorName] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<Answer|null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function loadConfig(){
    try{
      const res = await fetch("/api/ai-bot-config");
      const data = await res.json();
      if(data.config) setConfig(data.config);
    }catch{}
  }
  useEffect(()=>{ if (defaultRagKey === "publico") loadConfig(); },[defaultRagKey]);

  async function ask(e: React.FormEvent, customQuery?: string){
    e.preventDefault();
    const q = customQuery || query;
    if(q.trim().length<5){ setError("Pergunta mínima 5 caracteres"); return; }
    setLoading(true);
    setError("");
    setAnswer(null);
    try{
      const ragKey = defaultRagKey === "publico" ? "publico" : defaultRagKey; // configuração não amplia o escopo público
      const res = await fetch("/api/ai/bot", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ rag_key: ragKey, query: q, visitor_name: visitorName||null, origin:"site_bot_widget" })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error||`Erro ${res.status}`);
      setAnswer({
        response: data.response || data.session?.response,
        protocol: data.protocol || data.session?.protocol,
        mode: data.mode || data.session?.mode,
        queue_position: data.queue_position ?? data.session?.queue_position ?? 0,
        queue_wait_ms: data.queue_wait_ms ?? data.session?.queue_wait_ms ?? 0,
        is_whatsapp_redirect: data.is_whatsapp_redirect ?? data.session?.is_whatsapp_redirect ?? false,
        whatsapp_number: data.whatsapp_number ?? data.session?.whatsapp_number ?? null,
        rag_key: data.rag_key || data.session?.rag_key || ragKey,
        sources: data.sources||data.session?.sources||[],
        latency_ms: data.session?.latency_ms,
        ollama_used: data.ollama_used ?? data.session?.ollama_used,
        ollama_error: data.ollama_error ?? data.session?.ollama_error,
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
          origin: `bot_widget_feedback_${answer.mode}`
        })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error||"falha feedback");
      setFeedbackSent(true);
      setTimeout(()=>{ setFeedbackSent(false); setRating(0); setFeedbackText(""); }, 3000);
    }catch(e:any){ setError(e.message); }
    finally{ setFeedbackLoading(false); }
  }

  const activeMode = config?.active_mode || "com_ia";
  const isBeta = config?.is_beta_mode ?? true;
  const modelName = config?.model_name || "qwen3:1.7b";
  const colors = MODE_COLORS[activeMode] || MODE_COLORS.com_ia;

  if (defaultRagKey !== "publico") {
    return (
      <section style={{ border:`2px solid ${colors.border}`, borderRadius:14, padding:20, background:colors.bg, marginTop:20 }}>
        <h3>Bot {defaultRagKey} — indisponível nesta versão</h3>
        <p>Atendimento privado desativado até autorização e isolamento de dados serem comprovados. Não envie dados pessoais ao bot público.</p>
      </section>
    );
  }

  return (
    <section style={{ border:`2px solid ${colors.border}`, borderRadius:14, padding:20, background: colors.bg, marginTop:20, boxShadow:"0 4px 12px rgba(0,0,0,0.08)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:24 }}>{colors.emoji}</span>
          <div>
            <h3 style={{ margin:0, fontSize:19, fontWeight:700, color: colors.accent }}>
              Assistente SEG System — {activeMode==="sem_ia"?"Bot sem IA":activeMode==="com_ia"?`Bot com IA ${modelName} (beta)`:"WhatsApp"}
            </h3>
            <p style={{ margin:"2px 0 0", fontSize:11, opacity:0.7 }}>
              Assistente público • Ollama não verificado nesta sessão; fallback beta • {isBeta?"beta":"configuração não homologada"}
            </p>
          </div>
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <span style={{ fontSize:11, padding:"4px 10px", borderRadius:20, background: colors.accent, color:"#fff", fontWeight:700 }}>
            {activeMode.toUpperCase()} {isBeta?"BETA":""}
          </span>
          {config?.is_dev_mode && <span style={{ fontSize:10, padding:"3px 6px", borderRadius:6, background:"#fef3c7", color:"#92400e" }}>DEV</span>}
        </div>
      </div>

      <p style={{ fontSize:13, opacity:0.85, margin:"14px 0 0", lineHeight:1.5 }}>
        {activeMode==="sem_ia" && "Bot baseado em regras aprovadas (pub_faq_assisted_rules), sem LLM, sem invenção preço/cobertura/licença/prazo, transferência humana quando sensível ou fora base."}
        {activeMode==="com_ia" && `Assistente de informações públicas em beta. Modelo configurado ${modelName}, sujeito a disponibilidade; se indisponível, resposta de fallback a partir da base pública publicada. Os assistentes privados aguardam autorização e homologação.`}
        {activeMode==="whatsapp" && `Redirecionamento para WhatsApp ${config?.whatsapp_number||"551134372217"} com mensagem template preservando protocolo {protocol} {query}. Sem bot, direto humano.`}
        {" "}Funcionalidade beta, sem garantia de resposta por IA real ou atendimento humano automático.
      </p>

      {showDevConfig && config && (
        <details style={{ marginTop:14, background:"#fff", padding:12, borderRadius:8, fontSize:12, border:"1px solid #e5e7eb" }}>
          <summary style={{ cursor:"pointer", fontWeight:600 }}>Config dev atual (admin pode alterar em /admin/ti → AiRag)</summary>
          <div style={{ marginTop:8, display:"grid", gap:4, fontFamily:"monospace", fontSize:11 }}>
            <div>Modo: <strong>{config.active_mode}</strong> — RAG padrão: {config.default_rag_key} — Modelo: {config.model_name} — Host: {config.ollama_host}</div>
            <div>WhatsApp: {config.whatsapp_number} — Queue: {config.max_queue_size} — dev {String(config.is_dev_mode)} beta {String(config.is_beta_mode)}</div>
            <div>Template: {config.whatsapp_message_template}</div>
          </div>
        </details>
      )}

      <div style={{ marginTop:14, display:"flex", gap:6, flexWrap:"wrap" }}>
        {QUICK_ACTIONS.map((a,i)=>(
          <button key={i} onClick={(e)=>{ setQuery(a); ask(e,a); }} disabled={loading}
            style={{ fontSize:11, padding:"6px 12px", borderRadius:20, border:`1px solid ${colors.border}`, background:"#fff", color:colors.accent, cursor:"pointer", opacity: loading?0.6:1 }}>
            {a}
          </button>
        ))}
      </div>

      <form onSubmit={ask} style={{ marginTop:16, display:"grid", gap:10 }}>
        <input placeholder="Seu nome (opcional) — para protocolo e atendimento humano" value={visitorName} onChange={e=>setVisitorName(e.target.value)} maxLength={100}
          style={{ padding:10, borderRadius:8, border:"1px solid #cbd5e1", fontSize:13, outline:"none" }} />
        <textarea
          placeholder={activeMode==="whatsapp"?`Mensagem para WhatsApp ${config?.whatsapp_number||"551134372217"} (protocolo preservado)`:activeMode==="sem_ia"?`Pergunta para bot sem IA ex: quais serviços oferecem?`:`Pergunta para bot com IA ${modelName} RAG ${config?.default_rag_key||defaultRagKey} ex: quais serviços oferecem? como funciona visita?`}
          value={query} onChange={e=>setQuery(e.target.value)} required maxLength={2000} rows={3}
          style={{ padding:12, borderRadius:8, border:"1px solid #cbd5e1", fontSize:14, resize:"vertical", outline:"none", boxShadow:"inset 0 1px 2px rgba(0,0,0,0.05)" }}
        />
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <button type="submit" disabled={loading}
            style={{ padding:"10px 20px", background: colors.accent, color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor: loading?"not-allowed":"pointer", opacity: loading?0.7:1, display:"flex", alignItems:"center", gap:8 }}>
            {loading ? (
              <>
                <span style={{ width:16, height:16, border:"2px solid #fff", borderTopColor:"transparent", borderRadius:"50%", display:"inline-block", animation:"spin 0.8s linear infinite" }} />
                Processando {activeMode} fila Ollama Qwen3 1.7B...
              </>
            ) : activeMode==="whatsapp" ? `Enviar para WhatsApp ${config?.whatsapp_number||""}` : activeMode==="com_ia" ? `Perguntar com IA ${modelName}` : "Perguntar sem IA"}
          </button>
          <span style={{ fontSize:11, opacity:0.6 }}>{query.length}/2000</span>
        </div>
      </form>

      {error && <div style={{ marginTop:12, color:"#dc2626", fontSize:13, background:"#fef2f2", padding:12, borderRadius:8, border:"1px solid #fecaca" }}>Erro: {error}</div>}

      {answer && (
        <div style={{ marginTop:16, padding:16, background:"#fff", borderRadius:10, borderLeft:`5px solid ${colors.accent}`, boxShadow:"0 2px 8px rgba(0,0,0,0.06)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8, marginBottom:10 }}>
            <div style={{ fontSize:11, opacity:0.7, display:"flex", gap:10, flexWrap:"wrap" }}>
              <span>Protocolo <strong>{answer.protocol}</strong></span>
              <span>modo {answer.mode}</span>
              <span>RAG {answer.rag_key}</span>
              <span>fila pos {answer.queue_position} wait {answer.queue_wait_ms}ms</span>
              {answer.latency_ms && <span>lat {answer.latency_ms}ms</span>}
              {answer.is_whatsapp_redirect && <span style={{ color:colors.accent, fontWeight:700 }}>WhatsApp {answer.whatsapp_number}</span>}
              <span style={{ color: answer.ollama_used ? "#059669" : "#6b7280", fontWeight:700 }}>
                {answer.ollama_used ? "Ollama REAL" : answer.ollama_error ? `fallback ${answer.ollama_error}` : "simulado"}
              </span>
            </div>
            <button onClick={copyProtocol} style={{ fontSize:11, padding:"4px 10px", borderRadius:6, border:"1px solid #e5e7eb", background: copied?"#10b981":"#fff", color: copied?"#fff":"#374151", cursor:"pointer" }}>
              {copied ? "Copiado!" : "Copiar protocolo"}
            </button>
          </div>

          <div style={{ fontSize:14, lineHeight:1.6, whiteSpace:"pre-wrap", color:"#1f2937" }}>{answer.response}</div>

          {answer.is_whatsapp_redirect && answer.whatsapp_number && (
            <a href={`https://wa.me/${answer.whatsapp_number}?text=${encodeURIComponent(`Olá, vim do site Grupo SEG System. Protocolo ${answer.protocol}. Pergunta: ${query || answer.protocol}`)}`}
              target="_blank" rel="noopener noreferrer"
              style={{ display:"inline-flex", alignItems:"center", gap:8, marginTop:14, padding:"10px 16px", background: colors.accent, color:"#fff", borderRadius:8, textDecoration:"none", fontWeight:700, fontSize:14 }}>
              <span>💬</span> Abrir WhatsApp {answer.whatsapp_number} com protocolo {answer.protocol}
            </a>
          )}

          {answer.sources.length>0 && (
            <details style={{ marginTop:12, fontSize:12, background: colors.bg, padding:10, borderRadius:8 }}>
              <summary style={{ cursor:"pointer", fontWeight:600, color: colors.accent }}>Fontes RAG {answer.rag_key} ({answer.sources.length}) — base aprovada apenas área pertinente</summary>
              <ul style={{ marginTop:8, paddingLeft:18 }}>
                {answer.sources.map((s:any,i:number)=>(
                  <li key={i} style={{ marginBottom:6 }}>
                    <strong>{s.title||s.source}</strong> — {s.excerpt?.slice(0,150) || s.source}...
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div style={{ marginTop:12, display:"flex", gap:6, flexWrap:"wrap" }}>
            <span style={{ fontSize:10, padding:"3px 8px", borderRadius:20, background:"#f3f4f6", color:"#6b7280" }}>sem invenção preço</span>
            <span style={{ fontSize:10, padding:"3px 8px", borderRadius:20, background:"#f3f4f6", color:"#6b7280" }}>sem cobertura inventada</span>
            <span style={{ fontSize:10, padding:"3px 8px", borderRadius:20, background:"#f3f4f6", color:"#6b7280" }}>sem licença/prazo inventado</span>
            <span style={{ fontSize:10, padding:"3px 8px", borderRadius:20, background: colors.light, color: colors.accent }}>RAG {answer.rag_key} área pertinente</span>
            <span style={{ fontSize:10, padding:"3px 8px", borderRadius:20, background: colors.light, color: colors.accent }}>fila Ollama {modelName}</span>
          </div>

          <div style={{ marginTop:14, padding:12, background: colors.bg, borderRadius:8, border:`1px dashed ${colors.border}` }}>
            <p style={{ fontSize:12, fontWeight:600, margin:"0 0 8px", color: colors.accent }}>Avalie — feedback para curadoria base, custo/token e rollback (AI-09)</p>
            <div style={{ display:"flex", gap:4, marginBottom:8 }}>
              {[1,2,3,4,5].map((n)=>(
                <button key={n} onClick={()=>setRating(n)} style={{ fontSize:18, background: n<=rating ? colors.accent : "#fff", color: n<=rating ? "#fff" : "#cbd5e1", border:`1px solid ${colors.border}`, borderRadius:6, width:32, height:32, cursor:"pointer" }}>
                  {n<=rating ? "★" : "☆"}
                </button>
              ))}
              <span style={{ fontSize:11, opacity:0.7, marginLeft:8 }}>{rating?`${rating}/5`:"selecione 1..5"}</span>
            </div>
            <textarea placeholder="Comentário opcional (max 500) — para curadoria versão/publicação" value={feedbackText} onChange={e=>setFeedbackText(e.target.value)} maxLength={500} rows={2}
              style={{ width:"100%", padding:8, borderRadius:6, border:"1px solid #cbd5e1", fontSize:12, marginBottom:8 }} />
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>sendFeedback(true)} disabled={rating===0||feedbackLoading||feedbackSent}
                style={{ padding:"6px 12px", background: feedbackSent?"#10b981":colors.accent, color:"#fff", border:"none", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", opacity: rating===0?0.5:1 }}>
                {feedbackLoading?"Enviando...":feedbackSent?"Feedback enviado ✅":"Útil 👍"}
              </button>
              <button onClick={()=>sendFeedback(false)} disabled={rating===0||feedbackLoading||feedbackSent}
                style={{ padding:"6px 12px", background:"#fff", color:colors.accent, border:`1px solid ${colors.border}`, borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", opacity: rating===0?0.5:1 }}>
                Não útil 👎
              </button>
              {feedbackSent && <span style={{ fontSize:11, color:"#10b981", fontWeight:600 }}>Obrigado! Feedback registrado.</span>}
            </div>
            <p style={{ fontSize:10, opacity:0.6, marginTop:6 }}>Feedback → ai_rag_feedback + custo/token → ai_rag_cost_tracking protocolo {answer.protocol} prompt/completion tokens, cost_cents, ollama_used, latência, para avaliação rollback</p>
          </div>

          <p style={{ fontSize:11, opacity:0.6, marginTop:10, fontStyle:"italic" }}>
            Guardrails: base aprovada apenas {answer.rag_key}, sem preço fictício, transferência humana disponível. Protocolo {answer.protocol} preservado. Modo dev altera dinâmica {activeMode}. Custo/token tracking em ai_rag_cost_tracking.
          </p>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </section>
  );
}
