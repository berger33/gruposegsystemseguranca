"use client";
import { useEffect, useState } from "react";

type Doc={ id:string; category:string; status:string; title:string; slug:string; content:string; version:number; is_published:boolean; published_at:string|null; tags:string[]; created_at:string; };
type Hist={ id:string; previous_version:number|null; next_version:number; change_summary:string|null; changed_by:string|null; created_at:string; };

const CATS=['configuracao','migracao','diagnostico','recuperacao','arquitetura','operacao','seguranca','outro'];
const STATUSES=['rascunho','em_revisao','aprovado','publicado','arquivado'];

export default function MaintenanceDocClient(){
  const [docs,setDocs]=useState<Doc[]>([]);
  const [selected,setSelected]=useState<Doc|null>(null);
  const [history,setHistory]=useState<Hist[]>([]);
  const [msg,setMsg]=useState('');
  const [form,setForm]=useState({category:'arquitetura', title:'', slug:'', content:'', tags:''});

  async function load(){
    try{
      const r=await fetch('/api/admin/maintenance/docs',{credentials:'include'}).then(r=>r.json());
      if(r.docs) setDocs(r.docs);
    }catch(e:any){ setMsg(String(e)); }
  }
  useEffect(()=>{ load(); },[]);

  async function loadDoc(id:string){
    const r=await fetch(`/api/admin/maintenance/docs/${id}`,{credentials:'include'}).then(r=>r.json());
    if(r.doc){ setSelected(r.doc); setHistory(r.history||[]); }
  }

  async function createDoc(){
    const payload={...form, tags: form.tags? form.tags.split(',').map(s=>s.trim()).filter(Boolean): []};
    const r=await fetch('/api/admin/maintenance/docs',{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const j=await r.json(); if(!r.ok){ setMsg('erro doc: '+(j.error||r.status)); return; } setMsg('doc criado v'+j.doc.version+' '+j.doc.slug); load();
  }
  async function publishDoc(){
    if(!selected){ setMsg('selecione doc'); return; }
    const r=await fetch(`/api/admin/maintenance/docs/${selected.id}`,{method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status:'publicado', publish:true, change_summary:'Publicação via TI'})});
    const j=await r.json(); if(!r.ok){ setMsg('erro publish: '+(j.error||r.status)); return; } setMsg('doc publicado '+j.doc.slug); loadDoc(j.doc.id); load();
  }
  async function updateDocContent(newContent:string){
    if(!selected){ setMsg('selecione doc'); return; }
    const r=await fetch(`/api/admin/maintenance/docs/${selected.id}`,{method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({content:newContent, change_summary:'Atualização conteúdo via TI'})});
    const j=await r.json(); if(!r.ok){ setMsg('erro update: '+(j.error||r.status)); return; } setMsg('nova versão v'+j.doc.version); loadDoc(j.doc.id); load();
  }

  return (
    <section style={{margin:'24px 0', padding:16, border:'1px solid #333', borderRadius:8}}>
      <h2>PLT-18 Documentacao para manutencao por outro programador - configuracao migracao diagnostico recuperacao</h2>
      {msg && <p style={{color:'#0af'}}>{msg}</p>}
      <button onClick={load}>Recarregar docs</button>

      <h3>Docs ({docs.length}) - arquitetura configuracao migracao diagnostico recuperacao operacao seguranca</h3>
      <ul style={{maxHeight:200, overflow:'auto'}}>
        {docs.map(d=><li key={d.id}><button onClick={()=>loadDoc(d.id)} style={{marginRight:8}}>Abrir</button>{d.status} {d.is_published?'PUBLICADO':''} v{d.version} {d.category} {d.slug} {d.title.slice(0,60)} tags={d.tags.join(',')} {d.published_at?.slice(0,10)||''}</li>)}
      </ul>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:8}}>
        <select value={form.category} onChange={e=>setForm({...form, category:e.target.value})}>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</select>
        <input placeholder="slug opcional ex: arquitetura-geral" value={form.slug} onChange={e=>setForm({...form, slug:e.target.value})} />
        <input placeholder="title min10 ex: Arquitetura geral Next.js Node PostgreSQL" value={form.title} onChange={e=>setForm({...form, title:e.target.value})} style={{gridColumn:'1 / span 2'}} />
        <textarea placeholder="content min50 ex: Sistema Next.js 16 React 19 Node custom server.mjs..." value={form.content} onChange={e=>setForm({...form, content:e.target.value})} style={{gridColumn:'1 / span 2', minHeight:100}} />
        <input placeholder="tags vírgula ex: arquitetura,nextjs,postgres" value={form.tags} onChange={e=>setForm({...form, tags:e.target.value})} style={{gridColumn:'1 / span 2'}} />
      </div>
      <button onClick={createDoc}>Criar doc (gera versao automatica)</button>

      {selected && (
        <div style={{marginTop:12, borderTop:'1px solid #555', paddingTop:8}}>
          <h4>Doc selecionado v{selected.version} {selected.slug} - {selected.status} {selected.is_published?'PUBLICADO':''}</h4>
          <p><strong>{selected.title}</strong> [{selected.category}]</p>
          <pre style={{whiteSpace:'pre-wrap', background:'#111', padding:8, maxHeight:200, overflow:'auto', fontSize:12}}>{selected.content.slice(0,2000)}</pre>
          <p>Tags: {selected.tags.join(', ')}</p>
          <button onClick={publishDoc}>Publicar (status publicado + is_published)</button>
          <h5>Histórico versões ({history.length})</h5>
          <ul>{history.map(h=><li key={h.id}>v{h.previous_version||'null'} - v{h.next_version} {h.change_summary||''} por {h.changed_by||'-'} {h.created_at.slice(0,19)}</li>)}</ul>
          <textarea placeholder="Novo conteúdo para gerar nova versão" id="newContent" style={{width:'100%', minHeight:80}} />
          <button onClick={()=>{ const el=document.getElementById('newContent') as HTMLTextAreaElement; if(el) updateDocContent(el.value); }}>Criar nova versão com conteúdo</button>
          <p style={{fontSize:12, color:'#888'}}>PLT-18: documentação para manutenção por outro programador com categoria configuracao/migracao/diagnostico/recuperacao/arquitetura/operacao/seguranca, status rascunho/em_revisao/aprovado/publicado/arquivado, slug+version UNIQUE, versionamento automático, histórico, publicação, tags, seed 7 docs essenciais arquitetura configuracao migracao diagnostico recuperacao operacao seguranca publicados.</p>
        </div>
      )}
    </section>
  );
}
