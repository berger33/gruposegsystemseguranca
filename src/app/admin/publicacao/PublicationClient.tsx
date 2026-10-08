"use client";
import {useEffect,useState} from 'react';
import {THEMES,getThemeTokens} from '@/lib/themes.mjs';
type Row=Record<string,any>;
async function api(url:string,method='GET',data?:unknown){const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});const b=await r.json();if(!r.ok)throw Error(b.error||'Falha na operação');return b;}
const box:React.CSSProperties={padding:16,border:'1px solid #94a3b8',borderRadius:8,marginBlock:12,overflowWrap:'anywhere'};
export default function PublicationClient({initialTab='conteudo'}:{initialTab?:string}){
 const [tab,setTab]=useState(initialTab),[items,setItems]=useState<Row[]>([]),[rules,setRules]=useState<Row[]>([]),[services,setServices]=useState<Row[]>([]),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[history,setHistory]=useState<Row|null>(null),[compare,setCompare]=useState<string[]>([]),[comparison,setComparison]=useState<Row|null>(null);
 const [draft,setDraft]=useState({slug:'',title:'',content:'',excerpt:'',content_type:'pagina',is_authorized:false});
 const [pack,setPack]=useState({name:'',description:'',service_ids:[] as string[]});
 const [theme,setTheme]=useState('institucional'),[preview,setPreview]=useState(false),[reason,setReason]=useState('');
 const endpoint=tab==='conteudo'?'/api/admin/cms-contents':tab==='temas'?'/api/admin/themes':'/api/admin/service-packages';
 async function reload(){const b=await api(endpoint);setItems(b.items);if(tab==='pacotes'){const r=await api('/api/admin/package-rules');setRules(r.items);setServices(r.services);}}
 useEffect(()=>{setItems([]);setError('');setHistory(null);reload().catch(e=>setError(e.message));},[tab]);
 async function run(fn:()=>Promise<unknown>){setBusy(true);setError('');setMessage('');try{await fn();await reload();setMessage('Operação registrada com sucesso.');}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 const tokens=getThemeTokens(theme);
 const transitions:Record<string,string[]>={rascunho:['em_revisao'],em_revisao:['aprovado','rejeitado'],aprovado:['publicado','arquivado'],publicado:['arquivado'],rejeitado:[],arquivado:[]};
 const labels:Record<string,string>={em_revisao:'Enviar para revisão',aprovado:'Aprovar',rejeitado:'Rejeitar',publicado:'Publicar',arquivado:'Arquivar'};
 return <main style={{maxWidth:1080,margin:'auto',padding:24,fontFamily:'system-ui',color:'#17253b',background:'#fff',minHeight:'100vh'}}>
 <a href="/admin/comercial">Voltar ao comercial</a><h1>Publicação do site</h1>
 <nav aria-label="Áreas de publicação" style={{display:'flex',flexWrap:'wrap',gap:12}}>{[['conteudo','Conteúdo'],['temas','Temas'],['pacotes','Pacotes']].map(([k,l])=><button key={k} aria-pressed={tab===k} onClick={()=>setTab(k)}>{l}</button>)}<a href="/conteudos">Conteúdo público</a><a href="/pacotes">Pacotes públicos</a></nav>
 {error&&<p role="alert">Não foi possível concluir: {error}. Verifique sua sessão e os dados informados.</p>}{message&&<p role="status">{message}</p>}
 <label>Justificativa das alterações<input value={reason} onChange={e=>setReason(e.target.value)} minLength={10} maxLength={1000} style={{display:'block',width:'100%'}} placeholder="Descreva o motivo com pelo menos 10 caracteres"/></label>
 {tab==='conteudo'&&<form style={box} onSubmit={e=>{e.preventDefault();run(()=>api(endpoint,'POST',draft));}}>
 <h2>Nova versão de conteúdo</h2><p>Para editar, copie uma versão abaixo. O conteúdo atual continua publicado até a aprovação e publicação da nova versão. Texto simples; não insira dados pessoais sem autorização.</p>
 <label>Endereço (slug)<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={3} maxLength={200} value={draft.slug} onChange={e=>setDraft({...draft,slug:e.target.value})}/></label>
 <label>Tipo<select value={draft.content_type} onChange={e=>setDraft({...draft,content_type:e.target.value})}>{['pagina','faq','case','blog','vaga','outro'].map(x=><option key={x}>{x}</option>)}</select></label>
 <label>Título<input required minLength={5} maxLength={200} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} style={{display:'block',width:'100%'}}/></label>
 <label>Resumo<textarea minLength={10} maxLength={1000} value={draft.excerpt} onChange={e=>setDraft({...draft,excerpt:e.target.value})} style={{display:'block',width:'100%'}}/></label>
 <label>Conteúdo<textarea required minLength={50} maxLength={20000} value={draft.content} onChange={e=>setDraft({...draft,content:e.target.value})} style={{display:'block',width:'100%',minHeight:160}}/></label>
 <label><input type="checkbox" checked={draft.is_authorized} onChange={e=>setDraft({...draft,is_authorized:e.target.checked})}/>Confirmo autorização para publicar este case e seu conteúdo</label><br/><button disabled={busy}>Salvar rascunho</button>
 </form>}
 {tab==='temas'&&<section style={box}><h2>Identidade visual</h2><p>Os temas alteram a paleta e os componentes que usam os tokens do site. A composição dos dez layouts continua disponível em <a href="/admin/aparencia">Aparência do site</a>. A prévia abaixo não publica alterações.</p>
 <label>Tema<select aria-label="Tema" value={theme} onChange={e=>{setTheme(e.target.value);setPreview(false);}}>{THEMES.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
 <button disabled={busy} onClick={()=>run(async()=>{await api('/api/admin/theme-previews?theme='+theme);setPreview(true);})}>Visualizar tema</button>
 {preview&&<article aria-label="Prévia do tema" style={{...box,background:tokens.bg,color:tokens.fg,borderColor:tokens.accent,fontFamily:tokens.font,borderRadius:tokens.radius}}><h3>SEG System</h3><p>Serviços para sua operação. Conteúdo de prévia; não publicado.</p><button style={{borderColor:tokens.accent}}>Solicitar contato</button></article>}
 <button disabled={busy||!preview||reason.length<10} onClick={()=>run(()=>api(endpoint,'POST',{theme_key:theme,reason}))}>Salvar versão do tema</button>
 <h3>Preferência pessoal</h3><p>Dia/noite não altera a identidade publicada para outros usuários.</p>
 {['claro','escuro','sistema'].map(mode=><button key={mode} disabled={busy} onClick={()=>run(async()=>{await api('/api/admin/theme-preferences','POST',{theme_mode:mode});localStorage.setItem('seg-color-mode',mode);window.dispatchEvent(new Event('seg-theme-change'));})}>{mode}</button>)}
 </section>}
 {tab==='pacotes'&&<><form style={box} onSubmit={e=>{e.preventDefault();run(()=>api(endpoint,'POST',pack));}}><h2>Montar pacote</h2><p>Composição de serviços aprovada. Preço, equipamentos e prazo serão definidos na proposta após avaliação.</p>
 <label>Nome do pacote<input required minLength={3} maxLength={200} value={pack.name} onChange={e=>setPack({...pack,name:e.target.value})}/></label>
 <label>Descrição<textarea required minLength={10} maxLength={2000} value={pack.description} onChange={e=>setPack({...pack,description:e.target.value})} style={{display:'block',width:'100%'}}/></label>
 <fieldset><legend>Serviços publicados e validados</legend>{services.map(s=><label key={s.id} style={{display:'block'}}><input type="checkbox" checked={pack.service_ids.includes(s.id)} onChange={e=>setPack({...pack,service_ids:e.target.checked?[...pack.service_ids,s.id]:pack.service_ids.filter(x=>x!==s.id)})}/>{s.name}</label>)}</fieldset><button disabled={busy||!pack.service_ids.length}>Salvar pacote</button></form>
 <details style={box}><summary>Regras aprovadas</summary>{rules.map(r=><p key={r.id}>{r.name}: {r.is_approved?'aprovada':'pendente'} <button disabled={busy} onClick={()=>run(()=>api('/api/admin/package-rules','PATCH',{id:r.id,is_approved:!r.is_approved}))}>{r.is_approved?'Revogar aprovação':'Aprovar regra'}</button></p>)}<p>Alterar aprovação recolhe os pacotes publicados para nova revisão.</p></details>
 <button disabled={busy||compare.length<2||compare.length>5} onClick={()=>run(async()=>setComparison(await api('/api/admin/package-comparisons','POST',{title:'Comparação de pacotes',package_ids:compare})))}>Comparar selecionados</button>
 {comparison&&<section aria-label="Comparação de pacotes" style={box}>{comparison.comparison_data.packages.map((p:Row)=><article key={p.id}><h3>{p.name}</h3><p>{p.service_details.map((s:Row)=>s.name).join(', ')}</p><strong>Preço sob consulta</strong></article>)}</section>}</>}
 <h2>Versões registradas</h2>{!items.length&&<p>Nenhuma versão disponível para esta sessão.</p>}
 {items.map(r=><article style={box} key={r.id}><h3>{r.title||r.name} · v{r.version}</h3><p>{r.status}{r.is_active?' · ativo':''}</p>
 {tab==='conteudo'?<><p style={{whiteSpace:'pre-wrap'}}>{r.content}</p><button disabled={busy} onClick={()=>setDraft({slug:r.slug,title:r.title,content:r.content,excerpt:r.excerpt||'',content_type:r.content_type,is_authorized:r.is_authorized})}>Copiar para nova versão</button><button disabled={busy} onClick={()=>run(async()=>setHistory(await api(endpoint+'/'+r.id)))}>Ver histórico</button><button disabled={busy||reason.length<10} onClick={()=>run(()=>api(endpoint+'/revert','POST',{id:r.id,reason}))}>Restaurar como rascunho</button></>:null}
 {tab==='temas'?<><button disabled={busy||reason.length<10||r.theme_key==='layout-06'} onClick={()=>run(()=>api(endpoint+'/'+r.id,'PATCH',{reason}))}>Publicar tema</button>{r.published_at&&<button disabled={busy||reason.length<10||r.is_active} onClick={()=>run(()=>api(endpoint+'/rollback','POST',{id:r.id,reason}))}>Restaurar tema</button>}</>:<>{(transitions[r.status]||[]).map(st=><button key={st} disabled={busy||reason.length<10} onClick={()=>run(()=>api(tab==='conteudo'?endpoint+'/'+r.id:endpoint,'PATCH',tab==='conteudo'?{status:st,reason}:{id:r.id,status:st,reason}))}>{labels[st]}</button>)}</>}
 {tab==='pacotes'&&<><p>{r.description}</p><p>{r.service_details.map((s:Row)=>s.name).join(', ')}</p><strong>Preço sob consulta</strong>{r.is_approved&&<label><input type="checkbox" checked={compare.includes(r.id)} onChange={e=>setCompare(e.target.checked?[...compare,r.id]:compare.filter(x=>x!==r.id))}/>Comparar {r.name}</label>}</>}
 </article>)}
 {history&&<section style={box}><h2>Histórico de {history.title}</h2>{history.history.map((h:Row)=><p key={h.id}>{h.previous_status||'início'} → {h.next_status}: {h.reason} ({new Date(h.created_at).toLocaleString('pt-BR')})</p>)}</section>}
 </main>;
}
