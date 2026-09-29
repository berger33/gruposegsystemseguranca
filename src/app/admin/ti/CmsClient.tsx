"use client";
import { useEffect, useState } from "react";

export default function CmsClient() {
  const [items, setItems] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ slug:"", title:"", excerpt:"", content:"", content_type:"pagina", tags:"", seo_title:"", seo_description:"", is_authorized:false, metadata:"{}" });
  const [detail, setDetail] = useState<any>(null);

  const load = async () => {
    try{
      const r = await fetch("/api/admin/cms-contents").then(r=>r.json()).catch(()=>({items:[]}));
      setItems(r.items||[]);
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
      <h2>PUB-06 CMS páginas FAQ cases blog vagas rascunho/revisão/publicação histórico reversão</h2>
      {msg && <p style={{color:"red"}}>{msg}</p>}
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="slug 3..200" value={form.slug} onChange={e=>setForm({...form, slug:e.target.value})} />
        <input placeholder="título 5..200" value={form.title} onChange={e=>setForm({...form, title:e.target.value})} />
        <input placeholder="excerpt 10..1000" value={form.excerpt} onChange={e=>setForm({...form, excerpt:e.target.value})} />
        <select value={form.content_type} onChange={e=>setForm({...form, content_type:e.target.value})}>
          <option value="pagina">pagina</option><option value="faq">faq</option><option value="case">case</option><option value="blog">blog</option><option value="vaga">vaga</option><option value="outro">outro</option>
        </select>
        <input placeholder="tags vírgula" value={form.tags} onChange={e=>setForm({...form, tags:e.target.value})} />
        <input placeholder="seo_title 5..200" value={form.seo_title} onChange={e=>setForm({...form, seo_title:e.target.value})} />
        <input placeholder="seo_desc 10..500" value={form.seo_description} onChange={e=>setForm({...form, seo_description:e.target.value})} />
        <label><input type="checkbox" checked={form.is_authorized} onChange={e=>setForm({...form, is_authorized:e.target.checked})} /> autorizado (cases)</label>
        <textarea placeholder="content 50..20000" value={form.content} onChange={e=>setForm({...form, content:e.target.value})} style={{width:"100%", minHeight:80}} />
        <textarea placeholder='metadata JSON {"requirements":"...","location":"..."} para vaga/blog' value={form.metadata} onChange={e=>setForm({...form, metadata:e.target.value})} style={{width:"100%", minHeight:60}} />
        <button onClick={async()=>{ try{ const tags=form.tags.split(",").map((t:string)=>t.trim()).filter(Boolean); const meta=JSON.parse(form.metadata||"{}"); await post("/api/admin/cms-contents", {...form, tags, metadata:meta}); setMsg("conteúdo CMS criado rascunho"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar CMS rascunho</button>
      </div>
      <ul>{items.map((c:any)=><li key={c.id}>{c.content_type} {c.slug} v{c.version} {c.title} status:{c.status} pub:{String(c.is_published)} auth:{String(c.is_authorized)} <button onClick={async()=>{ try{ const d=await fetch(`/api/admin/cms-contents/${c.id}`).then(r=>r.json()); setDetail(d); } catch(e:any){ setMsg(e.message);} }}>Ver histórico/versões</button> <button onClick={async()=>{ try{ await post("/api/admin/cms-contents", {id:c.id, status:"em_revisao", reason:"Envio para revisão CMS"}, "PATCH"); setMsg("enviado para revisão"); load(); } catch(e:any){ setMsg(e.message);} }}>Revisão</button> <button onClick={async()=>{ try{ await post("/api/admin/cms-contents", {id:c.id, status:"aprovado", reason:"Aprovado revisão competente antes de publicar"}, "PATCH"); setMsg("aprovado"); load(); } catch(e:any){ setMsg(e.message);} }}>Aprovar</button> <button onClick={async()=>{ try{ await post("/api/admin/cms-contents", {id:c.id, status:"publicado", reason:"Publicação autorizada conteúdo aprovado"}, "PATCH"); setMsg("publicado autorizado histórico preservado"); load(); } catch(e:any){ setMsg(e.message);} }}>Publicar</button> <button onClick={async()=>{ try{ await post("/api/admin/cms-contents", {id:c.id, status:"arquivado", reason:"Arquivamento conteúdo"}, "PATCH"); setMsg("arquivado"); load(); } catch(e:any){ setMsg(e.message);} }}>Arquivar</button></li>)}</ul>
      {detail && <div style={{marginTop:16, padding:12, border:"1px solid #999", background:"#f9f9f9"}}>
        <h4>Detalhe {detail.content?.slug} v{detail.content?.version} — versões e histórico</h4>
        <p>Título: {detail.content?.title} | Tipo: {detail.content?.content_type} | Status: {detail.content?.status}</p>
        <h5>Versões (snapshot JSONB, change_summary)</h5>
        <ul>{(detail.versions||[]).map((v:any)=><li key={v.id}>v{v.version} {v.change_summary?.slice(0,80)} por {v.created_by_name||"system"} <button onClick={async()=>{ try{ const reason=prompt("Motivo reversão 10..1000")||"Reversão para versão anterior"; await post("/api/admin/cms-contents/revert", {content_id:detail.content.id, version:v.version, reason}); setMsg(`revertido para v${v.version} nova versão rascunho criada`); load(); } catch(e:any){ setMsg(e.message);} }}>Reverter para v{v.version}</button></li>)}</ul>
        <h5>Histórico imutável</h5>
        <ul>{(detail.history||[]).map((h:any)=><li key={h.id}>v{h.previous_version}→v{h.next_version} {h.previous_status}→{h.next_status} motivo:{h.reason?.slice(0,100)} por {h.changed_by_name}</li>)}</ul>
      </div>}
    </section>
  );
}
