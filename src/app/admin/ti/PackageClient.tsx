"use client";
import { useEffect, useState } from "react";

export default function PackageClient() {
  const [rules, setRules] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [comparisons, setComparisons] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [ruleForm, setRuleForm] = useState({ rule_key:"", name:"", description:"", rule_type:"outro", rule_data:"{}" });
  const [pkgForm, setPkgForm] = useState({ name:"", description:"", service_ids:"", total_cost_cents:0, total_price_cents:0, margin_percent:0, is_demo:false });
  const [compForm, setCompForm] = useState({ title:"", package_ids:"", notes:"" });

  const load = async () => {
    try{
      const [rR, pR, cR] = await Promise.all([
        fetch("/api/admin/package-rules").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/admin/service-packages").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/admin/package-comparisons").then(r=>r.json()).catch(()=>({items:[]})),
      ]);
      setRules(rR.items||[]); setPackages(pR.items||[]); setComparisons(cR.items||[]);
    } catch(e:any){ setMsg(String(e.message||e)); }
  };
  useEffect(()=>{ load(); },[]);

  const post = async (url:string, body:any, method="POST") => {
    const r = await fetch(url, { method, headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
    const j = await r.json();
    if(!r.ok) throw new Error(j.error||"erro");
    return j;
  };

  return (
    <section style={{marginTop:32, padding:16, border:"1px solid #ccc", borderRadius:8}}>
      <h2>PUB-09 Montador pacote comparador serviços e planos somente catálogo e regras aprovadas; nenhuma promessa/preço demonstração produção</h2>
      {msg && <p style={{color:"red"}}>{msg}</p>}

      <h3>Regras pacote (rule_key 3..100 UNIQUE, name 3..200, desc 10..2000, type inclusao_obrigatoria/exclusao/compatibilidade/preco_minimo/desconto_maximo/outro, is_approved, approved_by, rule_data JSONB — a partir catálogo validado)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="rule_key 3..100 ex catalogo_apenas_validado" value={ruleForm.rule_key} onChange={e=>setRuleForm({...ruleForm, rule_key:e.target.value})} />
        <input placeholder="nome 3..200" value={ruleForm.name} onChange={e=>setRuleForm({...ruleForm, name:e.target.value})} />
        <input placeholder="descrição 10..2000" value={ruleForm.description} onChange={e=>setRuleForm({...ruleForm, description:e.target.value})} />
        <select value={ruleForm.rule_type} onChange={e=>setRuleForm({...ruleForm, rule_type:e.target.value})}>
          <option value="inclusao_obrigatoria">inclusao_obrigatoria</option><option value="exclusao">exclusao</option><option value="compatibilidade">compatibilidade</option><option value="preco_minimo">preco_minimo</option><option value="desconto_maximo">desconto_maximo</option><option value="outro">outro</option>
        </select>
        <textarea placeholder='rule_data JSON {"constraint":"..."}' value={ruleForm.rule_data} onChange={e=>setRuleForm({...ruleForm, rule_data:e.target.value})} style={{width:"100%", minHeight:60}} />
        <button onClick={async()=>{ try{ const rd=JSON.parse(ruleForm.rule_data||"{}"); await post("/api/admin/package-rules", {...ruleForm, rule_data:rd}); setMsg("regra pacote criada"); load(); } catch(e:any){ setMsg(e.message);} }}>Criar regra</button>
      </div>
      <ul>{rules.map((r:any)=><li key={r.id}>{r.rule_key} {r.name} tipo:{r.rule_type} aprovado:{String(r.is_approved)} v{r.version} {r.description?.slice(0,60)} <button onClick={async()=>{ try{ await post("/api/admin/package-rules", {id:r.id, is_approved:true}, "PATCH"); setMsg("regra aprovada catálogo validado"); load(); } catch(e:any){ setMsg(e.message);} }}>Aprovar regra</button></li>)}</ul>

      <h3>Pacotes serviço (protocol PKG-PUB-YYYYMMDD-XXXX UNIQUE, name 3..200, desc 10..2000, service_ids UUID[] mínimo 1 validados, service_details JSONB, rules_applied TEXT[], cost_cents, price_cents, margin -100..100, status rascunho/em_revisao/aprovado/rejeitado/arquivado/publicado, is_demo bool, is_price_from_approved_catalog true, is_published — demo não pode ser publicado nenhuma promessa preço demonstração produção)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="nome 3..200" value={pkgForm.name} onChange={e=>setPkgForm({...pkgForm, name:e.target.value})} />
        <input placeholder="descrição 10..2000" value={pkgForm.description} onChange={e=>setPkgForm({...pkgForm, description:e.target.value})} />
        <input placeholder="service_ids UUID vírgula" value={pkgForm.service_ids} onChange={e=>setPkgForm({...pkgForm, service_ids:e.target.value})} />
        <input type="number" placeholder="custo cents" value={pkgForm.total_cost_cents} onChange={e=>setPkgForm({...pkgForm, total_cost_cents:Number(e.target.value)})} />
        <input type="number" placeholder="preço cents" value={pkgForm.total_price_cents} onChange={e=>setPkgForm({...pkgForm, total_price_cents:Number(e.target.value)})} />
        <input type="number" step="0.1" placeholder="margem -100..100" value={pkgForm.margin_percent} onChange={e=>setPkgForm({...pkgForm, margin_percent:Number(e.target.value)})} />
        <label><input type="checkbox" checked={pkgForm.is_demo} onChange={e=>setPkgForm({...pkgForm, is_demo:e.target.checked})} /> demo (não pode publicar produção)</label>
        <button onClick={async()=>{ try{ const ids=pkgForm.service_ids.split(",").map((s:string)=>s.trim()).filter(Boolean); await post("/api/admin/service-packages", {...pkgForm, service_ids:ids}); setMsg("pacote criado somente catálogo e regras aprovadas preço catálogo aprovado"); load(); } catch(e:any){ setMsg(e.message);} }}>Criar pacote</button>
      </div>
      <ul>{packages.map((p:any)=><li key={p.id}>{p.protocol} {p.name} status:{p.status} demo:{String(p.is_demo)} pub:{String(p.is_published)} preçoCatálogo:{String(p.is_price_from_approved_catalog)} custo:{p.total_cost_cents} preço:{p.total_price_cents} margem:{p.margin_percent} serviços:{(p.service_ids||[]).length} regras:{(p.rules_applied||[]).join(",")} <button onClick={async()=>{ try{ await post("/api/admin/service-packages", {id:p.id, status:"em_revisao", reason:"Envio revisão pacote catálogo aprovado"}, "PATCH"); setMsg("pacote em revisão"); load(); } catch(e:any){ setMsg(e.message);} }}>Revisão</button> <button onClick={async()=>{ try{ await post("/api/admin/service-packages", {id:p.id, status:"aprovado", reason:"Aprovado pacote somente catálogo aprovado"}, "PATCH"); setMsg("pacote aprovado"); load(); } catch(e:any){ setMsg(e.message);} }}>Aprovar</button> <button onClick={async()=>{ try{ await post("/api/admin/service-packages", {id:p.id, status:"publicado", reason:"Publicação autorizada pacote preço catálogo aprovado sem promessa demo"}, "PATCH"); setMsg("pacote publicado autorizado sem preço demo produção"); load(); } catch(e:any){ setMsg(e.message);} }}>Publicar (bloqueia demo)</button></li>)}</ul>

      <h3>Comparador (title 3..200, package_ids 2..5 UUID aprovados, comparison_data JSONB summary min_price max_price range count, notes 10..2000)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="título 3..200" value={compForm.title} onChange={e=>setCompForm({...compForm, title:e.target.value})} />
        <input placeholder="package_ids 2..5 UUID vírgula" value={compForm.package_ids} onChange={e=>setCompForm({...compForm, package_ids:e.target.value})} />
        <input placeholder="notes 10..2000" value={compForm.notes} onChange={e=>setCompForm({...compForm, notes:e.target.value})} />
        <button onClick={async()=>{ try{ const ids=compForm.package_ids.split(",").map((s:string)=>s.trim()).filter(Boolean); await post("/api/admin/package-comparisons", {...compForm, package_ids:ids}); setMsg("comparação criada 2..5 pacotes aprovados"); load(); } catch(e:any){ setMsg(e.message);} }}>Criar comparação</button>
      </div>
      <ul>{comparisons.map((c:any)=><li key={c.id}>{c.title} pacotes:{(c.package_ids||[]).length} min:{c.comparison_data?.summary?.min_price} max:{c.comparison_data?.summary?.max_price} range:{c.comparison_data?.summary?.price_range} notes:{c.notes?.slice(0,60)}</li>)}</ul>
    </section>
  );
}
