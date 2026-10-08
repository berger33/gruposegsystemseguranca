"use client";
import { useEffect, useState } from "react";

type Rule = { id: string; rule_key: string; question_pattern: string; answer_template: string; category: string; keywords: string[]; is_price_sensitive: boolean; is_coverage_sensitive: boolean; is_license_sensitive: boolean; is_deadline_sensitive: boolean; is_human_handoff_required: boolean; handoff_reason: string|null; is_approved: boolean; is_published: boolean; status: string; version: number };
type Session = { id: string; protocol: string; visitor_name: string|null; origin: string|null; status: string; is_human_handoff: boolean; handoff_reason: string|null; created_at: string };
type Handoff = { id: string; session_id: string; protocol: string; reason: string; status: string; responsible_name: string|null; created_at: string };
type Segment = { id: string; segment_key: string; name: string; description: string; segment_type: string; services: string[]; is_published: boolean; is_validated: boolean };

export default function PubFaqAssistedClient(){
  const [rules, setRules] = useState<Rule[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [form, setForm] = useState({ rule_key: "", question_pattern: "", answer_template: "", category: "servicos", keywords: "", is_price_sensitive: false, is_coverage_sensitive: false, is_license_sensitive: false, is_deadline_sensitive: false, is_human_handoff_required: false, handoff_reason: "" });
  const [msg, setMsg] = useState("");

  async function load(){
    try{
      const [rRes, sRes, hRes, segRes] = await Promise.all([
        fetch("/api/admin/faq-assisted-rules").then(r=>r.json()),
        fetch("/api/admin/pub-faq-sessions").then(r=>r.json()),
        fetch("/api/admin/faq-handoff").then(r=>r.json()),
        fetch("/api/admin/pub-segments").then(r=>r.json()),
      ]);
      setRules(rRes.items||[]);
      setSessions(sRes.items||[]);
      setHandoffs(hRes.items||[]);
      setSegments(segRes.items||[]);
    }catch{}
  }
  useEffect(()=>{ load(); },[]);

  async function createRule(e: React.FormEvent){
    e.preventDefault();
    setMsg("criando...");
    try{
      const payload = { ...form, keywords: form.keywords.split(",").map(s=>s.trim()).filter(Boolean), handoff_reason: form.handoff_reason||null };
      if((payload.is_price_sensitive||payload.is_coverage_sensitive||payload.is_license_sensitive||payload.is_deadline_sensitive) && !payload.is_human_handoff_required){
        setMsg("sensível requer handoff humano marcado");
        return;
      }
      if(payload.is_human_handoff_required && (!payload.handoff_reason || payload.handoff_reason.length<10)){
        setMsg("handoff_reason mínimo 10 chars quando handoff requerido");
        return;
      }
      // guardrails client-side
      if(payload.answer_template.match(/R\$\s*\d+/) && !payload.is_price_sensitive){
        setMsg("bot não inventa preço: marcar is_price_sensitive e handoff");
        return;
      }
      const res = await fetch("/api/admin/faq-assisted-rules", { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error||"falha");
      setMsg(`regra ${data.rule_key} criada protocolo PUB-02/PUB-05`);
      setForm({ rule_key:"", question_pattern:"", answer_template:"", category:"servicos", keywords:"", is_price_sensitive:false, is_coverage_sensitive:false, is_license_sensitive:false, is_deadline_sensitive:false, is_human_handoff_required:false, handoff_reason:"" });
      load();
    }catch(err:any){ setMsg(`erro: ${err.message}`); }
  }

  async function publish(id:string, status:string){
    try{
      const res = await fetch("/api/admin/faq-assisted-rules", { method:"PATCH", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ id, status, is_approved: status==="aprovado"||status==="publicado", is_published: status==="publicado", reason: `Mudança status FAQ assistida para ${status} — revisão competente, bot não inventa preço/cobertura/licença/prazo` }) });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error||"falha");
      setMsg(`regra ${id.slice(0,8)} status ${status}`);
      load();
    }catch(err:any){ setMsg(`erro publish: ${err.message}`); }
  }

  async function resolveHandoff(id:string, status:string){
    try{
      const res = await fetch("/api/admin/faq-handoff", { method:"PATCH", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ id, status, response: status==="concluido"? "Atendimento humano concluído, cliente orientado sem invenção preço/cobertura/licença/prazo" : "Handoff cancelado", responsible_name: "Responsável comercial" }) });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error||"falha");
      setMsg(`handoff ${id.slice(0,8)} ${status}`);
      load();
    }catch(err:any){ setMsg(`erro handoff: ${err.message}`); }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #0b5fff", borderRadius: 8, background: "#f0f7ff" }}>
      <h2 style={{ margin:0 }}>PUB-02 + PUB-05 — Páginas por serviço e segmento, FAQ assistida e transferência humana</h2>
      <p style={{ fontSize:13, opacity:0.8 }}>Páginas por serviço/segmento validados, contato claro, FAQ revisada, cases autorizados, acessibilidade navegação desempenho. FAQ assistida: bot não inventa preço/cobertura/licença/prazo, transferência humana quando sensível, base aprovada antes IA/RAG. Protocolos PUB-FAQ e HND-PUB.</p>

      <details style={{ marginTop:12, background:"#fff", padding:12, borderRadius:6 }}>
        <summary style={{ fontWeight:600, cursor:"pointer" }}>Segmentos validados ({segments.length}) — PUB-02 páginas por segmento</summary>
        <ul style={{ fontSize:12 }}>
          {segments.map(s=> <li key={s.id}>{s.segment_key} — {s.name} — {s.segment_type} — pub:{String(s.is_published)} val:{String(s.is_validated)} — {s.services?.join(", ")}</li>)}
        </ul>
      </details>

      <form onSubmit={createRule} style={{ marginTop:16, display:"grid", gap:8, background:"#fff", padding:12, borderRadius:6 }}>
        <strong>Criar regra FAQ assistida (PUB-05 guardrails)</strong>
        <input placeholder="rule_key ex: faq_assistida_preco2" value={form.rule_key} onChange={e=>setForm({...form, rule_key:e.target.value})} required maxLength={100} style={{ padding:6 }} />
        <input placeholder="question_pattern ex: qual preço" value={form.question_pattern} onChange={e=>setForm({...form, question_pattern:e.target.value})} required maxLength={500} style={{ padding:6 }} />
        <textarea placeholder="answer_template sem R$ inventado, sem cobertura/licença/prazo garantido" value={form.answer_template} onChange={e=>setForm({...form, answer_template:e.target.value})} required maxLength={5000} rows={4} style={{ padding:6 }} />
        <input placeholder="category ex: servicos, contratacao, visita, preco, cobertura, licenca" value={form.category} onChange={e=>setForm({...form, category:e.target.value})} required maxLength={100} style={{ padding:6 }} />
        <input placeholder="keywords csv ex: preço, valor, quanto custa" value={form.keywords} onChange={e=>setForm({...form, keywords:e.target.value})} style={{ padding:6 }} />
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", fontSize:12 }}>
          <label><input type="checkbox" checked={form.is_price_sensitive} onChange={e=>setForm({...form, is_price_sensitive:e.target.checked})} /> preço sensível</label>
          <label><input type="checkbox" checked={form.is_coverage_sensitive} onChange={e=>setForm({...form, is_coverage_sensitive:e.target.checked})} /> cobertura sensível</label>
          <label><input type="checkbox" checked={form.is_license_sensitive} onChange={e=>setForm({...form, is_license_sensitive:e.target.checked})} /> licença sensível</label>
          <label><input type="checkbox" checked={form.is_deadline_sensitive} onChange={e=>setForm({...form, is_deadline_sensitive:e.target.checked})} /> prazo sensível</label>
          <label><input type="checkbox" checked={form.is_human_handoff_required} onChange={e=>setForm({...form, is_human_handoff_required:e.target.checked})} /> requer handoff humano</label>
        </div>
        <input placeholder="handoff_reason min 10 chars quando sensível ex: Preço requer qualificação vistoria transferência humano" value={form.handoff_reason} onChange={e=>setForm({...form, handoff_reason:e.target.value})} maxLength={1000} style={{ padding:6 }} />
        <button type="submit" style={{ padding:"8px 12px", background:"#0b5fff", color:"#fff", border:"none", borderRadius:4 }}>Criar regra PUB-05</button>
        {msg && <p style={{ fontSize:12, background:"#f8fafc", padding:8, borderRadius:4 }}>{msg}</p>}
      </form>

      <details style={{ marginTop:12, background:"#fff", padding:12, borderRadius:6 }}>
        <summary style={{ fontWeight:600, cursor:"pointer" }}>Regras FAQ assistida ({rules.length}) — bot não inventa preço/cobertura/licença/prazo</summary>
        <table style={{ width:"100%", fontSize:11, marginTop:8, borderCollapse:"collapse" }}>
          <thead><tr><th style={{ textAlign:"left" }}>key</th><th>cat</th><th>status</th><th>aprov</th><th>pub</th><th>sensível</th><th>handoff</th><th>ações</th></tr></thead>
          <tbody>
            {rules.map(r=>(
              <tr key={r.id} style={{ borderTop:"1px solid #ddd" }}>
                <td>{r.rule_key}</td>
                <td>{r.category}</td>
                <td>{r.status}</td>
                <td>{String(r.is_approved)}</td>
                <td>{String(r.is_published)}</td>
                <td>{[r.is_price_sensitive&&"preço", r.is_coverage_sensitive&&"cob", r.is_license_sensitive&&"lic", r.is_deadline_sensitive&&"prazo"].filter(Boolean).join(",")||"não"}</td>
                <td>{String(r.is_human_handoff_required)}</td>
                <td style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                  <button onClick={()=>publish(r.id,"em_revisao")} style={{ fontSize:10, padding:"2px 4px" }}>revisão</button>
                  <button onClick={()=>publish(r.id,"aprovado")} style={{ fontSize:10, padding:"2px 4px", background:"#22c55e", color:"#fff", border:"none" }}>aprovar</button>
                  <button onClick={()=>publish(r.id,"publicado")} style={{ fontSize:10, padding:"2px 4px", background:"#0b5fff", color:"#fff", border:"none" }}>publicar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details style={{ marginTop:12, background:"#fff", padding:12, borderRadius:6 }}>
        <summary style={{ fontWeight:600, cursor:"pointer" }}>Sessões FAQ assistida ({sessions.length}) — protocolo PUB-FAQ</summary>
        <ul style={{ fontSize:11 }}>
          {sessions.slice(0,20).map(s=> <li key={s.id}>{s.protocol} — {s.visitor_name||"visitante"} — {s.status} — handoff:{String(s.is_human_handoff)} — {s.handoff_reason?.slice(0,80)||""} — {new Date(s.created_at).toLocaleString("pt-BR")}</li>)}
        </ul>
      </details>

      <details style={{ marginTop:12, background:"#fff", padding:12, borderRadius:6 }}>
        <summary style={{ fontWeight:600, cursor:"pointer" }}>Handoffs humanos ({handoffs.length}) — protocolo HND-PUB transferência humana</summary>
        <table style={{ width:"100%", fontSize:11, marginTop:8 }}>
          <thead><tr><th>protocol</th><th>reason</th><th>status</th><th>ações</th></tr></thead>
          <tbody>
            {handoffs.slice(0,20).map(h=>(
              <tr key={h.id} style={{ borderTop:"1px solid #ddd" }}>
                <td>{h.protocol}</td>
                <td style={{ maxWidth:200, overflow:"hidden", textOverflow:"ellipsis" }}>{h.reason.slice(0,100)}</td>
                <td>{h.status}</td>
                <td>
                  <button onClick={()=>resolveHandoff(h.id,"em_atendimento")} style={{ fontSize:10, marginRight:4 }}>atender</button>
                  <button onClick={()=>resolveHandoff(h.id,"concluido")} style={{ fontSize:10, background:"#22c55e", color:"#fff", border:"none" }}>concluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <section style={{ marginTop:16, padding:12, background:"#fff", borderRadius:6, fontSize:12 }}>
        <strong>Aceite PUB-02:</strong> páginas por serviço /servicos/[id] e por segmento /segmentos/[key] validados, contato claro /contato e /faq, cases/imagens somente autorizados is_authorized, acessibilidade keyboard/screen_reader/simple_language/alt_text/contrast aprovados, navegação consistente breadcrumbs estados vazios, desempenho lighthouse medido.<br/>
        <strong>Aceite PUB-05:</strong> FAQ assistida base aprovada revisada, bot não inventa preço/cobertura/licença/prazo guardrails CHECK is_invented=false, transferência humana quando sensível protocolo HND-PUB, sessão PUB-FAQ, mensagens com is_human_handoff_suggestion, IA/RAG só após base aprovada.<br/>
        <strong>Segurança:</strong> sameOrigin, requireSession requireRole admin/ti, auditLog, CHECK is_price_invented=false etc, token 32 chars não aplicável aqui mas protocolos validados.
      </section>
    </section>
  );
}
