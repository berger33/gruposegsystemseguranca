"use client";
import {useEffect,useState} from 'react';
export default function Carteira(){
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[filter,setFilter]=useState('all'),[offset,setOffset]=useState(0),[source,setSource]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[companies,setCompanies]=useState<any[]>([]);
 const [form,setForm]=useState({kind:'renovacao',title:'',next_action:'',next_action_date:'',target_company_id:''}),[key,setKey]=useState('');
 async function load(){const r=await fetch('/api/crm/portfolio?filter='+filter+'&offset='+offset);const b=await r.json();if(!r.ok)throw Error(b.error);setData(b);}
 useEffect(()=>{load().catch(e=>setError(e.message));},[filter,offset]);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await fetch('/api/crm/portfolio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,source_id:source.id,request_key:key,next_action_date:new Date(form.next_action_date).toISOString()})});const b=await r.json();if(!r.ok)throw Error(b.error);setMessage('Oportunidade registrada no funil com próxima ação.');setSource(null);await load();}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 async function select(r:any){setSource(r);setKey(crypto.randomUUID());setForm({...form,title:'',next_action:'',next_action_date:''});try{const response=await fetch('/api/crm/companies?limit=200');const b=await response.json();if(!response.ok)throw Error(b.error);setCompanies(b.companies||[]);}catch(e:any){setError(e.message);}}
 return <main style={{maxWidth:1050,margin:'auto',padding:24,fontFamily:'system-ui',background:'#fff',color:'#17253b'}}>
 <nav><a href="/admin/comercial">Comercial</a> · <a href="/admin/crm">Empresas, unidades e funil</a></nav><h1>Carteira e próximos contatos</h1><p>Oportunidades sob sua responsabilidade, incluindo vínculos de grupo e unidade. Ganho comercial não é dinheiro recebido.</p>
 {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 <label>Filtro da carteira<select value={filter} onChange={e=>{setFilter(e.target.value);setOffset(0);}}>{[['all','Todas'],['no_next','Sem próxima ação'],['overdue','Próxima ação vencida'],['won','Ganhas'],['lost','Perdidas / reativação']].map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 {data&&<><p>{data.total} oportunidades</p>{data.items.map((r:any)=><article key={r.id} style={{border:'1px solid #94a3b8',borderRadius:8,padding:16,marginBlock:12}}><h2>{r.title}</h2><p>{r.company_name} · Grupo: {r.group_name||'não vinculado'} · Unidade: {r.unit_name||'não definida'}</p><p>{r.stage} · {r.next_action||'Sem próxima ação'} · {r.next_action_date?new Date(r.next_action_date).toLocaleString('pt-BR'):'Sem data'}</p><a href="/admin/crm">Abrir funil para atualizar</a> <button onClick={()=>select(r)}>Criar ação de carteira</button></article>)}
 <button disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-50))}>Anterior</button><button disabled={offset+50>=data.total} onClick={()=>setOffset(offset+50)}>Próxima</button>
 <h2>Resultados das ações</h2>{data.metrics.length?data.metrics.map((m:any)=><p key={m.kind}>{m.kind}: {m.total} criadas, {m.won} ganhas, {m.lost} perdidas</p>):<p>Nenhuma ação registrada.</p>}
 <h2>Ações recentes</h2>{data.actions.map((a:any)=><p key={a.id}>{a.kind} · {a.title} · {a.stage}</p>)}</>}
 {source&&<form onSubmit={submit} style={{padding:16,border:'1px solid #94a3b8'}}><h2>Nova ação a partir de {source.title}</h2>
 <label>Tipo de ação<select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value})}>{[['renovacao','Renovação'],['upsell','Ampliação do serviço'],['cross_sell','Serviço adicional'],['recuperacao','Reativação de perdida'],['indicacao','Indicação']].map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 {form.kind==='indicacao'&&<label>Empresa indicada<select required value={form.target_company_id} onChange={e=>setForm({...form,target_company_id:e.target.value})}><option value="">Selecione uma empresa cadastrada</option>{companies.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}</select></label>}
 <label>Título<input required minLength={3} maxLength={200} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
 <label>Próxima ação<input required minLength={3} maxLength={200} value={form.next_action} onChange={e=>setForm({...form,next_action:e.target.value})}/></label>
 <label>Data da próxima ação<input type="datetime-local" required value={form.next_action_date} onChange={e=>setForm({...form,next_action_date:e.target.value})}/></label>
 <button disabled={busy}>Registrar oportunidade</button><button type="button" onClick={()=>setSource(null)}>Cancelar</button></form>}
 </main>;
}
