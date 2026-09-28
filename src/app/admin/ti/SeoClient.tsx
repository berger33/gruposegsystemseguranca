"use client";
import { useEffect, useState } from "react";

export default function SeoClient() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [redirects, setRedirects] = useState<any[]>([]);
  const [sitemap, setSitemap] = useState<any[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [cfgForm, setCfgForm] = useState({ path:"", title:"", description:"", keywords:"", canonical_url:"", robots:"noindex, nofollow", sitemap_priority:0.5, changefreq:"weekly", is_noindex:true });
  const [redirForm, setRedirForm] = useState({ old_path:"", new_path:"", redirect_type:"301", reason:"", is_active:true });
  const [siteForm, setSiteForm] = useState({ url:"", priority:0.5, changefreq:"weekly", is_included:false, source:"manual" });
  const [domForm, setDomForm] = useState({ domain:"", verification_method:"dns_txt", verification_token:"" });

  const load = async () => {
    try{
      const [cR, rR, sR, dR] = await Promise.all([
        fetch("/api/admin/seo-configs").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/admin/seo-redirects").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/admin/seo-sitemap").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/admin/domain-verifications").then(r=>r.json()).catch(()=>({items:[]})),
      ]);
      setConfigs(cR.items||[]); setRedirects(rR.items||[]); setSitemap(sR.items||[]); setDomains(dR.items||[]);
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
      <h2>PUB-08 SEO técnico títulos sitemap redirects verificação domínio noindex preservado não produtivo</h2>
      {msg && <p style={{color:"red"}}>{msg}</p>}

      <h3>SEO configs (path 1..500 UNIQUE, title 5..200, desc 10..500, keywords, robots 5..200, og, priority 0..1, changefreq, is_noindex true por padrão preservar noindex não produtivo, is_published — publicar só após verificação domínio aprovação)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="path 1..500 ex /servicos" value={cfgForm.path} onChange={e=>setCfgForm({...cfgForm, path:e.target.value})} />
        <input placeholder="title 5..200" value={cfgForm.title} onChange={e=>setCfgForm({...cfgForm, title:e.target.value})} />
        <input placeholder="description 10..500" value={cfgForm.description} onChange={e=>setCfgForm({...cfgForm, description:e.target.value})} />
        <input placeholder="keywords vírgula" value={cfgForm.keywords} onChange={e=>setCfgForm({...cfgForm, keywords:e.target.value})} />
        <input placeholder="canonical_url 5..1000" value={cfgForm.canonical_url} onChange={e=>setCfgForm({...cfgForm, canonical_url:e.target.value})} />
        <input placeholder="robots 5..200 ex noindex, nofollow" value={cfgForm.robots} onChange={e=>setCfgForm({...cfgForm, robots:e.target.value})} />
        <input type="number" step="0.1" min="0" max="1" placeholder="priority 0..1" value={cfgForm.sitemap_priority} onChange={e=>setCfgForm({...cfgForm, sitemap_priority:Number(e.target.value)})} />
        <select value={cfgForm.changefreq} onChange={e=>setCfgForm({...cfgForm, changefreq:e.target.value})}>
          <option value="always">always</option><option value="hourly">hourly</option><option value="daily">daily</option><option value="weekly">weekly</option><option value="monthly">monthly</option><option value="yearly">yearly</option><option value="never">never</option>
        </select>
        <label><input type="checkbox" checked={cfgForm.is_noindex} onChange={e=>setCfgForm({...cfgForm, is_noindex:e.target.checked})} /> noindex (preservar não produtivo)</label>
        <button onClick={async()=>{ try{ const keywords=cfgForm.keywords.split(",").map((k:string)=>k.trim()).filter(Boolean); await post("/api/admin/seo-configs", {...cfgForm, keywords}); setMsg("SEO config criado noindex preservado"); load(); } catch(e:any){ setMsg(e.message);} }}>Criar SEO config</button>
      </div>
      <ul>{configs.map((c:any)=><li key={c.id}>{c.path} title:{c.title} robots:{c.robots} noindex:{String(c.is_noindex)} pub:{String(c.is_published)} prio:{c.sitemap_priority} freq:{c.changefreq} v{c.version} <button onClick={async()=>{ try{ await post("/api/admin/seo-configs", {id:c.id, title:c.title, description:c.description, robots:c.robots, is_noindex:c.is_noindex, is_published:false}, "PATCH"); setMsg("mantido noindex não produtivo"); load(); } catch(e:any){ setMsg(e.message);} }}>Manter noindex</button> <button onClick={async()=>{ try{ const domain=domains.find((d:any)=>d.status==="verificado"); if(!domain){ setMsg("verificação domínio pendente — não pode publicar com noindex false até verificado"); return; } await post("/api/admin/seo-configs", {id:c.id, is_noindex:false, is_published:true}, "PATCH"); setMsg("publicado após verificação domínio"); load(); } catch(e:any){ setMsg(e.message);} }}>Publicar (requer domínio verificado)</button></li>)}</ul>

      <h3>Redirects (old_path 1..500 UNIQUE, new_path 1..500, type 301/302/307/308, is_active, hits, reason 10..1000, old≠new)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="old_path" value={redirForm.old_path} onChange={e=>setRedirForm({...redirForm, old_path:e.target.value})} />
        <input placeholder="new_path" value={redirForm.new_path} onChange={e=>setRedirForm({...redirForm, new_path:e.target.value})} />
        <select value={redirForm.redirect_type} onChange={e=>setRedirForm({...redirForm, redirect_type:e.target.value})}>
          <option value="301">301</option><option value="302">302</option><option value="307">307</option><option value="308">308</option>
        </select>
        <input placeholder="reason 10..1000" value={redirForm.reason} onChange={e=>setRedirForm({...redirForm, reason:e.target.value})} />
        <label><input type="checkbox" checked={redirForm.is_active} onChange={e=>setRedirForm({...redirForm, is_active:e.target.checked})} /> ativo</label>
        <button onClick={async()=>{ try{ await post("/api/admin/seo-redirects", redirForm); setMsg("redirect criado"); load(); } catch(e:any){ setMsg(e.message);} }}>Criar redirect</button>
      </div>
      <ul>{redirects.map((r:any)=><li key={r.id}>{r.old_path} → {r.new_path} {r.redirect_type} ativo:{String(r.is_active)} hits:{r.hits} reason:{r.reason?.slice(0,60)}</li>)}</ul>

      <h3>Sitemap entries (url 5..1000 UNIQUE, lastmod, priority 0..1, changefreq, is_included bool — só incluir quando publicado e noindex false, rebuild a partir de seo_configs)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="url 5..1000" value={siteForm.url} onChange={e=>setSiteForm({...siteForm, url:e.target.value})} />
        <input type="number" step="0.1" min="0" max="1" placeholder="priority" value={siteForm.priority} onChange={e=>setSiteForm({...siteForm, priority:Number(e.target.value)})} />
        <select value={siteForm.changefreq} onChange={e=>setSiteForm({...siteForm, changefreq:e.target.value})}>
          <option value="always">always</option><option value="hourly">hourly</option><option value="daily">daily</option><option value="weekly">weekly</option><option value="monthly">monthly</option><option value="yearly">yearly</option><option value="never">never</option>
        </select>
        <label><input type="checkbox" checked={siteForm.is_included} onChange={e=>setSiteForm({...siteForm, is_included:e.target.checked})} /> incluir (só se noindex false)</label>
        <input placeholder="source" value={siteForm.source} onChange={e=>setSiteForm({...siteForm, source:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/admin/seo-sitemap", siteForm); setMsg("sitemap entry criado"); load(); } catch(e:any){ setMsg(e.message);} }}>Criar sitemap entry</button>
        <button onClick={async()=>{ try{ const j=await post("/api/admin/seo-sitemap", {action:"rebuild"}); setMsg(`sitemap rebuild ${j.rebuilt} a partir de seo_configs publicados noindex false`); load(); } catch(e:any){ setMsg(e.message);} }}>Rebuild a partir de configs publicados</button>
        <button onClick={async()=>{ try{ window.open("/api/seo-sitemap?format=xml","_blank"); } catch(e:any){ setMsg(e.message);} }}>Ver sitemap.xml público (só incluídos)</button>
      </div>
      <ul>{sitemap.map((s:any)=><li key={s.id}>{s.url} prio:{s.priority} freq:{s.changefreq} inc:{String(s.is_included)} src:{s.source} lastmod:{s.lastmod}</li>)}</ul>

      <h3>Domínio verificação (domain 3..200 UNIQUE, método dns_txt/file/meta_tag/outro, token 10..500, status pendente/verificado/falha/expirado, verified_at, na liberação)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="domain ex gruposegsystem.com.br" value={domForm.domain} onChange={e=>setDomForm({...domForm, domain:e.target.value})} />
        <select value={domForm.verification_method} onChange={e=>setDomForm({...domForm, verification_method:e.target.value})}>
          <option value="dns_txt">dns_txt</option><option value="file">file</option><option value="meta_tag">meta_tag</option><option value="outro">outro</option>
        </select>
        <input placeholder="token 10..500" value={domForm.verification_token} onChange={e=>setDomForm({...domForm, verification_token:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/admin/domain-verifications", domForm); setMsg("domínio verificação criado pendente"); load(); } catch(e:any){ setMsg(e.message);} }}>Criar verificação domínio</button>
      </div>
      <ul>{domains.map((d:any)=><li key={d.id}>{d.domain} método:{d.verification_method} status:{d.status} token:{d.verification_token?.substring(0,20)} verif:{d.verified_at} <button onClick={async()=>{ try{ await post("/api/admin/domain-verifications", {id:d.id, status:"verificado"}, "PATCH"); setMsg("domínio verificado — pode liberar produção remover noindex"); load(); } catch(e:any){ setMsg(e.message);} }}>Marcar verificado</button></li>)}</ul>
    </section>
  );
}
