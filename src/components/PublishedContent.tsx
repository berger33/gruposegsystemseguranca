"use client";
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';
export default function PublishedContent({packages=false}:{packages?:boolean}){
 const params=useParams(),slug=params?.slug;const [items,setItems]=useState<any[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[selected,setSelected]=useState<string[]>([]);
 useEffect(()=>{let active=true;fetch(packages?'/api/public/packages':'/api/public/cms').then(async r=>{if(!r.ok)throw Error();return r.json();}).then(b=>{if(active)setItems(b.items);}).catch(()=>{if(active)setError('Conteúdo indisponível no momento. Tente novamente.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[packages]);
 const visible=slug?items.filter(r=>r.slug===slug):items;
 return <main className="publication-surface" style={{maxWidth:1000,margin:'auto',padding:24,minHeight:'100vh',overflowWrap:'anywhere'}}>
 <nav aria-label="Site" style={{display:'flex',flexWrap:'wrap',gap:16}}><a href="/">Início</a><a href="/servicos">Serviços</a><a href="/conteudos">Conteúdos</a><a href="/pacotes">Pacotes</a><a href="/faq">Perguntas frequentes</a></nav>
 <h1>{packages?'Pacotes de serviços':slug?(visible[0]?.title||'Conteúdo'):'Conteúdos publicados'}</h1>
 {loading&&<p role="status">Carregando…</p>}{error&&<p role="alert">{error}</p>}{!loading&&!error&&!visible.length&&<p>{slug?'Este conteúdo não está disponível.':'Não há publicações disponíveis no momento.'}</p>}
 {packages&&<p>Compare os serviços incluídos. Preço, cobertura e prazo dependem de avaliação e proposta.</p>}
 {visible.map(r=><article key={r.id} style={{border:'1px solid currentColor',padding:16,marginBlock:16,borderRadius:'var(--theme-radius)'}}>
 <h2>{packages?r.name:<a href={'/conteudos/'+r.slug}>{r.title}</a>}</h2>
 <p style={{whiteSpace:'pre-wrap'}}>{packages?r.description:slug?r.content:r.excerpt||r.content.slice(0,240)}</p>
 {packages&&<><ul>{r.service_details.map((s:any)=><li key={s.id}>{s.name}</li>)}</ul><p><strong>Preço sob consulta</strong></p><label><input type="checkbox" disabled={!selected.includes(r.id)&&selected.length===5} checked={selected.includes(r.id)} onChange={e=>setSelected(e.target.checked?[...selected,r.id]:selected.filter(x=>x!==r.id))}/>Comparar {r.name}</label></>}
 </article>)}
 {packages&&selected.length>=2&&<section aria-label="Comparação de serviços"><h2>Comparação</h2>{items.filter(p=>selected.includes(p.id)).map(p=><article key={p.id}><h3>{p.name}</h3><p>{p.service_details.map((s:any)=>s.name).join(' · ')}</p><p>Preço sob consulta</p></article>)}</section>}
 <a href="/contato">Solicitar atendimento</a>
 </main>;
}
