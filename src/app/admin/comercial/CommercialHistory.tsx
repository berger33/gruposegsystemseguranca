"use client";
import {useState} from 'react';
export default function CommercialHistory(){
 const [type,setType]=useState('crm_goals'),[id,setId]=useState(''),[rows,setRows]=useState<any[]>([]),[error,setError]=useState('');
 async function submit(e:React.FormEvent){e.preventDefault();setError('');try{const r=await fetch('/api/crm/commercial-versions?type='+type+'&id='+encodeURIComponent(id));const b=await r.json();if(!r.ok)throw Error(b.error);setRows(b.items);}catch(e:any){setError(e.message);}}
 return <section style={{padding:20}}><h2>Histórico de versões comerciais</h2><p>Consulta da gestão por identificador do registro. As versões anteriores são preservadas; nenhuma comissão é paga automaticamente.</p>
 <form onSubmit={submit}><label>Tipo de registro<select value={type} onChange={e=>setType(e.target.value)}>{[['crm_goals','Meta'],['crm_commission_rules','Regra de comissão'],['crm_commissions','Comissão'],['crm_commercial_library','Biblioteca']].map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Identificador do registro<input value={id} onChange={e=>setId(e.target.value)} required/></label><button>Consultar versões</button></form>
 {error&&<p role="alert">{error}</p>}{rows.map(r=><article key={r.version}><h3>Versão {r.version} — {r.snapshot.status}</h3><p>{r.snapshot.title||r.snapshot.name}</p><dl>{Object.entries(r.snapshot).filter(([k,v])=>v!==null&&!['id','created_by_id','responsible_id','approved_by','file_url'].includes(k)).map(([k,v])=><div key={k} style={{overflowWrap:'anywhere'}}><dt>{k}</dt><dd>{typeof v==='object'?JSON.stringify(v):String(v)}</dd></div>)}</dl></article>)}
 </section>;
}
