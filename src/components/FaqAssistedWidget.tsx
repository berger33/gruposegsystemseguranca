"use client";
import { useState } from "react";

type Answer = { session?: { protocol: string; id: string }; answer: string; matched_rule?: { rule_key: string; category: string; is_human_handoff_required: boolean }|null; need_handoff: boolean; protocol: string };

const QUICK = ["Quais serviços oferecem?", "Contato claro?", "Como solicitar orçamento?", "Quanto custa?"];

export default function FaqAssistedWidget(){
  const [question, setQuestion] = useState("");
  const [visitorName, setVisitorName] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<Answer|null>(null);
  const [error, setError] = useState("");
  const [handoffRequested, setHandoffRequested] = useState(false);
  const [copied, setCopied] = useState(false);

  async function ask(e: React.FormEvent, custom?: string){
    e.preventDefault();
    const q = custom || question;
    if(q.trim().length<5){ setError("Pergunta mínima 5 caracteres"); return; }
    setLoading(true);
    setError("");
    setAnswer(null);
    setHandoffRequested(false);
    try{
      const res = await fetch("/api/faq-assisted", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ question: q, visitor_name: visitorName||null, origin:"site", campaign:"faq_assistida" })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error||"falha");
      setAnswer(data);
      if(!custom) setQuestion("");
    }catch(err:any){ setError(err.message); }
    finally{ setLoading(false); }
  }

  async function requestHandoff(){
    if(!answer?.session?.id) return;
    try{
      const res = await fetch("/api/faq-assisted-handoff", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          session_id: answer.session.id,
          reason: `Solicitação transferência humana FAQ assistida protocolo ${answer.protocol} — pergunta sensível preço/cobertura/licença/prazo ou cliente solicitou humano`,
          requested_by: visitorName||"visitante"
        })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error||"falha handoff");
      setHandoffRequested(true);
    }catch(err:any){ setError(err.message); }
  }

  function copyProtocol(){
    if(!answer) return;
    navigator.clipboard.writeText(answer.protocol).then(()=>{
      setCopied(true);
      setTimeout(()=>setCopied(false), 2000);
    });
  }

  return (
    <section style={{ border:"2px solid #0b5fff", borderRadius:14, padding:20, background:"#eff6ff", marginTop:24, boxShadow:"0 4px 12px rgba(0,0,0,0.06)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
        <h3 style={{ margin:0, fontSize:19, fontWeight:700, color:"#0b5fff" }}>📘 FAQ assistida — PUB-05 • sem invenção preço/cobertura/licença/prazo</h3>
        <span style={{ fontSize:10, padding:"4px 10px", borderRadius:20, background:"#0b5fff", color:"#fff", fontWeight:700 }}>BASE APROVADA • TRANSFERÊNCIA HUMANA</span>
      </div>
      <p style={{ fontSize:13, opacity:0.85, margin:"10px 0 0", lineHeight:1.5 }}>
        Base aprovada revisada, bot não inventa preço, cobertura, licença ou prazo. Transferência humana quando sensível. IA/RAG só após base aprovada e controles capítulo 19. Protocolos PUB-FAQ e HND-PUB. Contato claro: Av. Armando Bei, 305 - Sala 01, Vila Nova Bonsucesso, Guarulhos, SP 07175-000, tel (11) 3437-2217.
      </p>

      <div style={{ marginTop:12, display:"flex", gap:6, flexWrap:"wrap" }}>
        {QUICK.map((q,i)=>(
          <button key={i} onClick={(e)=>{ setQuestion(q); ask(e,q); }} disabled={loading}
            style={{ fontSize:11, padding:"6px 12px", borderRadius:20, border:"1px solid #0b5fff", background:"#fff", color:"#0b5fff", cursor:"pointer", opacity: loading?0.6:1 }}>
            {q}
          </button>
        ))}
      </div>

      <form onSubmit={ask} style={{ marginTop:16, display:"grid", gap:10 }}>
        <input placeholder="Seu nome (opcional)" value={visitorName} onChange={e=>setVisitorName(e.target.value)} maxLength={100}
          style={{ padding:10, borderRadius:8, border:"1px solid #cbd5e1", fontSize:13, outline:"none" }} />
        <textarea placeholder="Digite sua pergunta ex: quais serviços vocês oferecem? como solicitar orçamento? qual preço? vocês atendem minha região?"
          value={question} onChange={e=>setQuestion(e.target.value)} required maxLength={1000} rows={3}
          style={{ padding:12, borderRadius:8, border:"1px solid #cbd5e1", fontSize:14, resize:"vertical", outline:"none" }} />
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <button type="submit" disabled={loading}
            style={{ padding:"10px 18px", background:"#0b5fff", color:"#fff", border:"none", borderRadius:8, fontWeight:700, cursor: loading?"not-allowed":"pointer", opacity: loading?0.7:1, display:"flex", alignItems:"center", gap:8 }}>
            {loading ? (
              <>
                <span style={{ width:16, height:16, border:"2px solid #fff", borderTopColor:"transparent", borderRadius:"50%", display:"inline-block", animation:"spin 0.8s linear infinite" }} />
                Consultando base aprovada...
              </>
            ) : "Perguntar FAQ assistida"}
          </button>
          <span style={{ fontSize:11, opacity:0.6 }}>{question.length}/1000</span>
        </div>
      </form>

      {error && <div style={{ marginTop:12, color:"#dc2626", fontSize:13, background:"#fef2f2", padding:12, borderRadius:8, border:"1px solid #fecaca" }}>Erro: {error}</div>}

      {answer && (
        <div style={{ marginTop:16, padding:16, background:"#fff", borderRadius:10, borderLeft:"5px solid #0b5fff", boxShadow:"0 2px 6px rgba(0,0,0,0.05)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8, marginBottom:8 }}>
            <div style={{ fontSize:11, opacity:0.7 }}>
              Protocolo: <strong>{answer.protocol}</strong> {answer.matched_rule?`— regra ${answer.matched_rule.rule_key} (${answer.matched_rule.category})`:"— fallback sem invenção"}
            </div>
            <button onClick={copyProtocol} style={{ fontSize:11, padding:"4px 10px", borderRadius:6, border:"1px solid #e5e7eb", background: copied?"#10b981":"#fff", color: copied?"#fff":"#374151", cursor:"pointer" }}>
              {copied?"Copiado!":"Copiar protocolo"}
            </button>
          </div>

          <div style={{ fontSize:14, lineHeight:1.6, whiteSpace:"pre-wrap", color:"#1f2937" }}>{answer.answer}</div>

          {answer.need_handoff && (
            <div style={{ marginTop:12, fontSize:12, color:"#92400e", background:"#fffbeb", padding:12, borderRadius:8, border:"1px solid #fde68a" }}>
              ⚠️ Esta pergunta é sensível (preço/cobertura/licença/prazo) — bot não inventa, transferência humana recomendada. {answer.matched_rule?.is_human_handoff_required?"Handoff automático solicitado.":"Solicite humano se precisar."}
            </div>
          )}

          <div style={{ marginTop:12, display:"flex", gap:8, flexWrap:"wrap" }}>
            <button onClick={requestHandoff} disabled={handoffRequested}
              style={{ padding:"8px 14px", background: handoffRequested?"#22c55e":"#0b5fff", color:"#fff", border:"none", borderRadius:8, fontSize:12, fontWeight:600, cursor: handoffRequested?"default":"pointer" }}>
              {handoffRequested?"Handoff solicitado (HND-PUB) ✅":"Solicitar transferência humana"}
            </button>
            <a href="/contato" style={{ padding:"8px 14px", background:"#f8fafc", border:"1px solid #0b5fff", color:"#0b5fff", borderRadius:8, fontSize:12, textDecoration:"none", fontWeight:600 }}>Ir para /contato</a>
            <a href="/faq" style={{ padding:"8px 14px", background:"#f8fafc", border:"1px solid #cbd5e1", borderRadius:8, fontSize:12, textDecoration:"none" }}>Ver FAQ revisada</a>
          </div>

          <p style={{ fontSize:10, opacity:0.6, marginTop:10 }}>Guardrails: is_invented_price=false, is_invented_coverage=false, is_invented_license=false, is_invented_deadline=false — CHECK constraints. Histórico imutável pub_faq_assisted_history.</p>
        </div>
      )}

      <details style={{ marginTop:16, fontSize:11, background:"#fff", padding:12, borderRadius:8, border:"1px solid #dbeafe" }}>
        <summary style={{ cursor:"pointer", fontWeight:600, color:"#0b5fff" }}>Como funciona (aceite PUB-05) — clique para detalhes</summary>
        <ul style={{ marginTop:10, paddingLeft:18, lineHeight:1.6 }}>
          <li>Base aprovada: pub_faq_assisted_rules com status rascunho→em_revisao→aprovado→publicado, revisão competente antes publicar, approved_by_identity</li>
          <li>Bot não inventa preço/cobertura/licença/prazo: CHECK is_price_invented=false etc, answer_template sem R$ inventado, guardrail API retorna erro se detecta</li>
          <li>Transferência humana: quando is_price_sensitive||is_coverage_sensitive||is_license_sensitive||is_deadline_sensitive e is_human_handoff_required true, cria sessão status em_handoff, handoff_request protocol HND-PUB, responsável comercial</li>
          <li>IA/RAG só depois base aprovada: sem LLM externo, apenas match keywords e question_pattern em regras aprovadas publicadas</li>
          <li>Protocolos: PUB-FAQ-YYYYMMDD-XXXX sessão, HND-PUB-YYYYMMDD-XXXX handoff, mensagens pub_faq_messages sender_type usuario/bot/humano/sistema</li>
          <li>Contato claro: endereço Av. Armando Bei, 305 - Sala 01, Vila Nova Bonsucesso, Guarulhos SP 07175-000, tel (11) 3437-2217, /contato formulário mesma API leads</li>
        </ul>
      </details>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </section>
  );
}
