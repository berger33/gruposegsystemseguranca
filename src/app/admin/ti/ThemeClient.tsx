"use client";
import { useEffect, useState } from "react";

export default function ThemeClient() {
  const [items, setItems] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ theme_key:"", name:"", description:"", config:"{}", tokens:"{}", layout:"{}", preview_url:"" });
  const [detail, setDetail] = useState<any>(null);
  const [pref, setPref] = useState<any>(null);
  const [prefForm, setPrefForm] = useState({ theme_mode:"sistema", theme_key:"" });

  const load = async () => {
    try{
      const r = await fetch("/api/admin/themes").then(r=>r.json()).catch(()=>({items:[]}));
      setItems(r.items||[]);
      const p = await fetch("/api/admin/theme-preferences").then(r=>r.json()).catch(()=>({}));
      setPref(p.preference||null);
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
      <h2>PUB-07 Temas preview publicação autorizada configuração persistida rollback; preferência dia/noite separada identidade global</h2>
      {msg && <p style={{color:"red"}}>{msg}</p>}
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="theme_key 3..100 ex layout-06" value={form.theme_key} onChange={e=>setForm({...form, theme_key:e.target.value})} />
        <input placeholder="nome 3..200" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
        <input placeholder="descrição 10..2000" value={form.description} onChange={e=>setForm({...form, description:e.target.value})} />
        <input placeholder="preview_url 5..1000" value={form.preview_url} onChange={e=>setForm({...form, preview_url:e.target.value})} />
        <textarea placeholder='config JSON {"primary":"#0f172a"}' value={form.config} onChange={e=>setForm({...form, config:e.target.value})} style={{width:"100%", minHeight:60}} />
        <textarea placeholder='tokens JSON {"brand":"default"}' value={form.tokens} onChange={e=>setForm({...form, tokens:e.target.value})} style={{width:"100%", minHeight:60}} />
        <textarea placeholder='layout JSON {"sections":"default"}' value={form.layout} onChange={e=>setForm({...form, layout:e.target.value})} style={{width:"100%", minHeight:60}} />
        <button onClick={async()=>{ try{ const cfg=JSON.parse(form.config||"{}"); const tok=JSON.parse(form.tokens||"{}"); const lay=JSON.parse(form.layout||"{}"); await post("/api/admin/themes", {...form, config:cfg, tokens:tok, layout:lay}); setMsg("tema criado rascunho versionado"); load(); } catch(e:any){ setMsg(e.message);} }}>Criar tema rascunho</button>
      </div>
      <ul>{items.map((t:any)=><li key={t.id}>{t.theme_key} v{t.version} {t.name} status:{t.status} pub:{String(t.is_published)} ativo:{String(t.is_active)} preview:{t.preview_url?.slice(0,40)} <button onClick={async()=>{ try{ const d=await fetch(`/api/admin/themes/${t.id}`).then(r=>r.json()); setDetail(d);} catch(e:any){ setMsg(e.message);} }}>Ver histórico</button> <button onClick={async()=>{ try{ await post("/api/admin/themes", {id:t.id, status:"em_revisao", reason:"Envio para revisão tema"}, "PATCH"); setMsg("tema em revisão"); load(); } catch(e:any){ setMsg(e.message);} }}>Revisão</button> <button onClick={async()=>{ try{ await post("/api/admin/themes", {id:t.id, status:"aprovado", reason:"Aprovação competente tema antes publicação autorizada"}, "PATCH"); setMsg("tema aprovado"); load(); } catch(e:any){ setMsg(e.message);} }}>Aprovar</button> <button onClick={async()=>{ try{ await post("/api/admin/themes", {id:t.id, status:"publicado", make_active:true, reason:"Publicação autorizada tema configuração persistida"}, "PATCH"); setMsg("tema publicado autorizado e ativado persistido"); load(); } catch(e:any){ setMsg(e.message);} }}>Publicar e ativar</button> <button onClick={async()=>{ try{ const preview_url=prompt("preview_url 5..1000")||t.preview_url||"/"; const r=await post("/api/admin/theme-previews", {theme_id:t.id, preview_url}); setMsg(`preview criado token ${r.preview_token?.substring(0,8)} expira ${r.expires_at} — preview publicação autorizada`); } catch(e:any){ setMsg(e.message);} }}>Criar preview</button></li>)}</ul>

      {detail && <div style={{marginTop:16, padding:12, border:"1px solid #999", background:"#f9f9f9"}}>
        <h4>Detalhe {detail.theme?.theme_key} v{detail.theme?.version} — rollback</h4>
        <h5>Versões snapshot</h5>
        <ul>{(detail.versions||[]).map((v:any)=><li key={v.id}>v{v.version} {v.change_summary?.slice(0,80)} <button onClick={async()=>{ try{ const reason=prompt("Motivo rollback 10..1000")||"Rollback tema"; await post("/api/admin/themes/rollback", {theme_id:detail.theme.id, version:v.version, reason}); setMsg(`rollback para v${v.version} nova versão revertido`); load(); } catch(e:any){ setMsg(e.message);} }}>Rollback para v{v.version}</button></li>)}</ul>
        <h5>Histórico imutável</h5>
        <ul>{(detail.history||[]).map((h:any)=><li key={h.id}>v{h.previous_version}→v{h.next_version} {h.previous_status}→{h.next_status} {h.reason?.slice(0,80)}</li>)}</ul>
        <h5>Previews</h5>
        <ul>{(detail.previews||[]).map((p:any)=><li key={p.id}>token:{p.preview_token?.substring(0,8)} url:{p.preview_url} expira:{p.expires_at}</li>)}</ul>
      </div>}

      <h3>Preferência dia/noite separada da identidade global</h3>
      <p>Atual: {pref? `${pref.theme_mode} tema:${pref.theme_key||"nenhum"} separada:${pref.is_separate_from_global}` : "nenhuma"}</p>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <select value={prefForm.theme_mode} onChange={e=>setPrefForm({...prefForm, theme_mode:e.target.value})}>
          <option value="claro">claro</option><option value="escuro">escuro</option><option value="sistema">sistema</option>
        </select>
        <input placeholder="theme_key 3..100" value={prefForm.theme_key} onChange={e=>setPrefForm({...prefForm, theme_key:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/admin/theme-preferences", prefForm, "POST"); setMsg("preferência dia/noite salva separada identidade global"); load(); } catch(e:any){ setMsg(e.message);} }}>Salvar preferência</button>
      </div>
    </section>
  );
}
