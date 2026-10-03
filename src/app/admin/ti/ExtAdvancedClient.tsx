"use client";
import { useEffect, useState } from "react";

export default function ExtAdvancedClient() {
  const [compliance, setCompliance] = useState<any[]>([]);
  const [kb, setKb] = useState<any[]>([]);
  const [expPlans, setExpPlans] = useState<any[]>([]);
  const [expScenarios, setExpScenarios] = useState<any[]>([]);
  const [continuity, setContinuity] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [tokens, setTokens] = useState<any[]>([]);
  const [layouts, setLayouts] = useState<any[]>([]);
  const [msg, setMsg] = useState<string>("");

  const [kbForm, setKbForm] = useState({ slug:"", title:"", content:"", category:"", tags:"", access_roles:"" });
  const [expForm, setExpForm] = useState({ title:"", description:"", premises:"", target_location:"", capacity:0, estimated_cost_cents:0, estimated_revenue_cents:0 });
  const [scenForm, setScenForm] = useState({ plan_id:"", scenario_name:"", premises:"", projected_cost_cents:0, projected_revenue_cents:0 });
  const [contForm, setContForm] = useState({ title:"", description:"", client_account_id:"", contract_id:"", post_id:"", contacts:"", contingency_steps:"", recovery_steps:"", responsible_name:"", last_tested_at:"", next_test_due:"" });
  const [abForm, setAbForm] = useState({ hypothesis:"", description:"", variant_a:"", variant_b:"", metric_name:"" });
  const [tokenForm, setTokenForm] = useState({ token_key:"", token_value:"{\"color\":\"#000\"}", category:"" });
  const [layoutForm, setLayoutForm] = useState({ layout_key:"", layout_data:"{\"sections\":[]}", preview_url:"" });

  const load = async () => {
    try {
      const [cR, kR, eR, esR, coR, aR, tR, lR] = await Promise.all([
        fetch("/api/ext/compliance-documents").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/knowledge-base").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/expansion-plans").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/expansion-scenarios").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/continuity-plans").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/analytics-experiments").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/visual-tokens").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/visual-layouts").then(r=>r.json()).catch(()=>({items:[]})),
      ]);
      setCompliance(cR.items||[]); setKb(kR.items||[]); setExpPlans(eR.items||[]); setExpScenarios(esR.items||[]); setContinuity(coR.items||[]); setAnalytics(aR.items||[]); setTokens(tR.items||[]); setLayouts(lR.items||[]);
    } catch(e:any){ setMsg(String(e?.message||e)); }
  };
  useEffect(()=>{ load(); },[]);

  const post = async (url:string, body:any) => {
    const r = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error||"erro");
    return j;
  };

  return (
    <section style={{ marginTop:32, padding:16, border:"1px solid #ccc", borderRadius:8 }}>
      <h2>EXT-07..12 — Compliance, base conhecimento, expansão, continuidade, analytics A/B, editor visual avançado</h2>
      {msg && <p style={{color:"red"}}>{msg}</p>}

      <h3>EXT-07 Compliance — leitura legada minimizada</h3>
      <p>O escritor legado foi aposentado. Obrigações, referências privadas, avaliação, renovação e tarefas usam exclusivamente <a href="/admin/compliance">/admin/compliance</a>. Referência não significa upload, bytes, checksum, malware scan, armazenamento verificado ou download.</p>
      <ul>{compliance.map((c:any)=><li key={c.id}>{c.protocol} {c.title} tipo:{c.compliance_type} status:{c.status} versão:{c.version_no} atual:{String(c.is_current)} validade:{c.expiry_date}</li>)}</ul>

      <h3>EXT-08 Base conhecimento (slug 3..200, título 5..200, conteúdo 50..20000, categoria 3..100, tags, access_roles, versão auto, status rascunho/em_revisao/aprovado/publicado/arquivado — usuário encontra apenas conteúdo de seu escopo)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="slug 3..200" value={kbForm.slug} onChange={e=>setKbForm({...kbForm, slug:e.target.value})} />
        <input placeholder="título 5..200" value={kbForm.title} onChange={e=>setKbForm({...kbForm, title:e.target.value})} />
        <input placeholder="conteúdo 50..20000" value={kbForm.content} onChange={e=>setKbForm({...kbForm, content:e.target.value})} />
        <input placeholder="categoria 3..100" value={kbForm.category} onChange={e=>setKbForm({...kbForm, category:e.target.value})} />
        <input placeholder="tags comma" value={kbForm.tags} onChange={e=>setKbForm({...kbForm, tags:e.target.value})} />
        <input placeholder="access_roles comma" value={kbForm.access_roles} onChange={e=>setKbForm({...kbForm, access_roles:e.target.value})} />
        <button onClick={async()=>{ try{ const tags = kbForm.tags.split(",").map((t:string)=>t.trim()).filter(Boolean); const roles = kbForm.access_roles.split(",").map((t:string)=>t.trim()).filter(Boolean); await post("/api/ext/knowledge-base", {slug:kbForm.slug,title:kbForm.title,content:kbForm.content,category:kbForm.category,tags,access_roles:roles}); setMsg("KB criada versionada"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar KB</button>
      </div>
      <ul>{kb.map((k:any)=><li key={k.id}>{k.slug} v:{k.version} {k.title} cat:{k.category} status:{k.status} publicado:{String(k.is_published)} tags:{JSON.stringify(k.tags)}</li>)}</ul>

      <h3>EXT-09 Planos expansão (título 5..200, desc 10..2000, premissas 10..2000, local 3..200, capacidade, custo/receita cents, protocolo EXP-EXT-, status rascunho/em_analise/aprovado/rejeitado/em_execucao/concluido/cancelado — premissas e fonte visíveis sem projeção vendida como certeza is_estimate)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="título 5..200" value={expForm.title} onChange={e=>setExpForm({...expForm, title:e.target.value})} />
        <input placeholder="descrição 10..2000" value={expForm.description} onChange={e=>setExpForm({...expForm, description:e.target.value})} />
        <input placeholder="premissas 10..2000" value={expForm.premises} onChange={e=>setExpForm({...expForm, premises:e.target.value})} />
        <input placeholder="local alvo 3..200" value={expForm.target_location} onChange={e=>setExpForm({...expForm, target_location:e.target.value})} />
        <input type="number" placeholder="capacidade" value={expForm.capacity} onChange={e=>setExpForm({...expForm, capacity:Number(e.target.value)})} />
        <input type="number" placeholder="custo cents" value={expForm.estimated_cost_cents} onChange={e=>setExpForm({...expForm, estimated_cost_cents:Number(e.target.value)})} />
        <input type="number" placeholder="receita cents" value={expForm.estimated_revenue_cents} onChange={e=>setExpForm({...expForm, estimated_revenue_cents:Number(e.target.value)})} />
        <button onClick={async()=>{ try{ await post("/api/ext/expansion-plans", expForm); setMsg("plano expansão criado premissas visíveis sem certeza"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar plano expansão</button>
      </div>
      <ul>{expPlans.map((p:any)=><li key={p.id}>{p.protocol} {p.title} local:{p.target_location} status:{p.status} cap:{p.capacity} custo:{p.estimated_cost_cents} receita:{p.estimated_revenue_cents} margem:{p.estimated_cost_cents && p.estimated_revenue_cents ? Math.round((p.estimated_revenue_cents-p.estimated_cost_cents)/p.estimated_cost_cents*100)+"%": "n/a"} premissas:{p.premises?.slice(0,60)}</li>)}</ul>

      <h3>EXT-09 Cenários expansão (plan_id, nome 3..200 UNIQUE por plano, premissas 10..2000, custo/receita projetados, margem GENERATED)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="plan_id" value={scenForm.plan_id} onChange={e=>setScenForm({...scenForm, plan_id:e.target.value})} />
        <input placeholder="nome cenário 3..200" value={scenForm.scenario_name} onChange={e=>setScenForm({...scenForm, scenario_name:e.target.value})} />
        <input placeholder="premissas 10..2000" value={scenForm.premises} onChange={e=>setScenForm({...scenForm, premises:e.target.value})} />
        <input type="number" placeholder="custo proj cents" value={scenForm.projected_cost_cents} onChange={e=>setScenForm({...scenForm, projected_cost_cents:Number(e.target.value)})} />
        <input type="number" placeholder="receita proj cents" value={scenForm.projected_revenue_cents} onChange={e=>setScenForm({...scenForm, projected_revenue_cents:Number(e.target.value)})} />
        <button onClick={async()=>{ try{ await post("/api/ext/expansion-scenarios", scenForm); setMsg("cenário expansão criado"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar cenário</button>
      </div>
      <ul>{expScenarios.map((s:any)=><li key={s.id}>plano:{s.plan_id} {s.scenario_name} custo:{s.projected_cost_cents} receita:{s.projected_revenue_cents} margem:{s.projected_margin} premissas:{s.premises?.slice(0,40)}</li>)}</ul>

      <h3>EXT-10 Continuidade operacional (título 5..200, desc 10..2000, client_account_id, contract_id, post_id 3..200, contacts/contingency/recovery JSONB, responsável 2..200, last/next test, protocolo CONT-EXT-, status rascunho/aprovado/em_teste/testado/desatualizado/arquivado — simulado documentado com responsáveis)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="título 5..200" value={contForm.title} onChange={e=>setContForm({...contForm, title:e.target.value})} />
        <input placeholder="descrição 10..2000" value={contForm.description} onChange={e=>setContForm({...contForm, description:e.target.value})} />
        <input placeholder="client_account_id" value={contForm.client_account_id} onChange={e=>setContForm({...contForm, client_account_id:e.target.value})} />
        <input placeholder="contract_id" value={contForm.contract_id} onChange={e=>setContForm({...contForm, contract_id:e.target.value})} />
        <input placeholder="post_id 3..200" value={contForm.post_id} onChange={e=>setContForm({...contForm, post_id:e.target.value})} />
        <input placeholder="contacts JSON" value={contForm.contacts} onChange={e=>setContForm({...contForm, contacts:e.target.value})} />
        <input placeholder="contingency JSON" value={contForm.contingency_steps} onChange={e=>setContForm({...contForm, contingency_steps:e.target.value})} />
        <input placeholder="recovery JSON" value={contForm.recovery_steps} onChange={e=>setContForm({...contForm, recovery_steps:e.target.value})} />
        <input placeholder="responsável 2..200" value={contForm.responsible_name} onChange={e=>setContForm({...contForm, responsible_name:e.target.value})} />
        <input type="datetime-local" value={contForm.last_tested_at} onChange={e=>setContForm({...contForm, last_tested_at:e.target.value})} />
        <input type="datetime-local" value={contForm.next_test_due} onChange={e=>setContForm({...contForm, next_test_due:e.target.value})} />
        <button onClick={async()=>{ try{ const parse = (s:string)=>{ try{ return JSON.parse(s); } catch{ return s ? s.split(",").map((x:string)=>x.trim()) : []; } }; await post("/api/ext/continuity-plans", {title:contForm.title,description:contForm.description,client_account_id:contForm.client_account_id||null,contract_id:contForm.contract_id||null,post_id:contForm.post_id||null,contacts:parse(contForm.contacts),contingency_steps:parse(contForm.contingency_steps),recovery_steps:parse(contForm.recovery_steps),responsible_name:contForm.responsible_name||null,last_tested_at:contForm.last_tested_at||null,next_test_due:contForm.next_test_due||null}); setMsg("plano continuidade criado simulado documentado"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar plano continuidade</button>
      </div>
      <ul>{continuity.map((c:any)=><li key={c.id}>{c.protocol} {c.title} cliente:{c.client_name||c.client_account_id} status:{c.status} proxTeste:{c.next_test_due} resp:{c.responsible_name}</li>)}</ul>

      <h3>EXT-11 Analytics A/B (hipótese 20..2000, desc 10..2000, variante A/B 3..200, métrica 3..100, protocolo AB-EXT-, status rascunho/em_execucao/concluido/cancelado/arquivado, winner A/B/empate/inconclusivo — experimento reversível resultado sem dados inventados privacy_compliant)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="hipótese 20..2000" value={abForm.hypothesis} onChange={e=>setAbForm({...abForm, hypothesis:e.target.value})} />
        <input placeholder="descrição 10..2000" value={abForm.description} onChange={e=>setAbForm({...abForm, description:e.target.value})} />
        <input placeholder="variante A 3..200" value={abForm.variant_a} onChange={e=>setAbForm({...abForm, variant_a:e.target.value})} />
        <input placeholder="variante B 3..200" value={abForm.variant_b} onChange={e=>setAbForm({...abForm, variant_b:e.target.value})} />
        <input placeholder="métrica 3..100" value={abForm.metric_name} onChange={e=>setAbForm({...abForm, metric_name:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ext/analytics-experiments", abForm); setMsg("experimento A/B criado reversível"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar experimento</button>
      </div>
      <ul>{analytics.map((a:any)=><li key={a.id}>{a.protocol} {a.metric_name} A:{a.variant_a} B:{a.variant_b} status:{a.status} winner:{a.winner} resultA:{a.result_a_value} resultB:{a.result_b_value} hipó:{a.hypothesis?.slice(0,60)}</li>)}</ul>

      <h3>EXT-12 Editor visual avançado tokens (token_key 3..200, token_value JSONB, categoria 3..100, versão auto, status rascunho/em_revisao/aprovado/publicado/arquivado/revertido, is_published, preview_url — permissão real recarga consistente e rollback)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="token_key 3..200" value={tokenForm.token_key} onChange={e=>setTokenForm({...tokenForm, token_key:e.target.value})} />
        <input placeholder='token_value JSON {"color":"#000"}' value={tokenForm.token_value} onChange={e=>setTokenForm({...tokenForm, token_value:e.target.value})} />
        <input placeholder="categoria 3..100" value={tokenForm.category} onChange={e=>setTokenForm({...tokenForm, category:e.target.value})} />
        <button onClick={async()=>{ try{ const tv = JSON.parse(tokenForm.token_value); await post("/api/ext/visual-tokens", {token_key:tokenForm.token_key, token_value:tv, category:tokenForm.category}); setMsg("token visual criado versionado rollback"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar token</button>
      </div>
      <ul>{tokens.map((t:any)=><li key={t.id}>{t.token_key} v:{t.version} cat:{t.category} status:{t.status} publicado:{String(t.is_published)} valor:{JSON.stringify(t.token_value)?.slice(0,100)}</li>)}</ul>

      <h3>EXT-12 Layouts visuais (layout_key 3..200, layout_data JSONB, versão auto, preview_url, status)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="layout_key 3..200" value={layoutForm.layout_key} onChange={e=>setLayoutForm({...layoutForm, layout_key:e.target.value})} />
        <input placeholder='layout_data JSON {"sections":[]}' value={layoutForm.layout_data} onChange={e=>setLayoutForm({...layoutForm, layout_data:e.target.value})} />
        <input placeholder="preview_url" value={layoutForm.preview_url} onChange={e=>setLayoutForm({...layoutForm, preview_url:e.target.value})} />
        <button onClick={async()=>{ try{ const ld = JSON.parse(layoutForm.layout_data); await post("/api/ext/visual-layouts", {layout_key:layoutForm.layout_key, layout_data:ld, preview_url:layoutForm.preview_url||null}); setMsg("layout visual criado versionado"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar layout</button>
      </div>
      <ul>{layouts.map((l:any)=><li key={l.id}>{l.layout_key} v:{l.version} status:{l.status} publicado:{String(l.is_published)} preview:{l.preview_url}</li>)}</ul>
    </section>
  );
}
