"use client";
import UiTaskWorkspace from "@/components/ui/UiTaskWorkspace";
import { useEffect, useState } from 'react';
type Source={id:string;name:string;rag_key:string;root_key:string;relative_path:string;is_active:boolean;last_synced_at:string|null;last_report:unknown};
export default function DirectorySourcesClient(){
 const [sources,setSources]=useState<Source[]>([]),[roots,setRoots]=useState<string[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [accounts,setAccounts]=useState<{id:string;display_name:string}[]>([]);
 const [scopes,setScopes]=useState<string[]>([]);
 const [loading,setLoading]=useState(true);
 const [runtime,setRuntime]=useState<{enabled:boolean;model:string}|null>(null);
 const [form,setForm]=useState({name:'',rag_key:'publico',client_account_id:'',root_key:'',relative_path:'.'});
 async function load(){setLoading(true);try{const r=await fetch('/api/admin/ai-rag-directory-sources');const d=await r.json();if(!r.ok)throw Error(d.error);setSources(d.items);setRoots(d.roots);setAccounts(d.accounts);setScopes(d.scopes);setRuntime(d.runtime);}catch{setMessage('Não foi possível ler as fontes. Confira a sessão, as migrações e as raízes permitidas.');}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 async function mutate(payload:object){if(busy)return;setBusy(true);try{const r=await fetch('/api/admin/ai-rag-directory-sources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw Error(d.error);setMessage(d.note?`${d.note} Novos: ${d.created}; inalterados: ${d.unchanged}; falhas: ${d.failed.length}; ausentes: ${d.missing.length}.`:'Fonte atualizada.');await load();}catch(e){setMessage(`Operação não concluída: ${e instanceof Error?e.message:'falha de rede'}`);}finally{setBusy(false);}}
 return <UiTaskWorkspace aria-busy={busy||loading}><h2>Fontes em pastas</h2><p>Importação manual de textos e Markdown em rascunho. Revise e publique na curadoria. Alterações geram outro documento; arquivos removidos não apagam publicações.</p>{loading&&<p role="status">Carregando fontes e configuração…</p>}{!loading&&!roots.length&&<p role="status">Nenhuma raiz disponível. O operador deve configurar RAG_DOCUMENT_ROOTS_JSON fora do repositório. Caminhos físicos não são publicados.</p>}
 <form onSubmit={e=>{e.preventDefault();void mutate({action:'create',...form});}}>
 <label>Nome da fonte<input required minLength={3} maxLength={120} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
 <label>Área<select value={form.rag_key} onChange={e=>setForm({...form,rag_key:e.target.value})}>{scopes.map(k=><option key={k}>{k}</option>)}</select></label>
 {runtime&&<p>Ollama no ambiente: {runtime.enabled?'habilitado':'desabilitado'} · modelo {runtime.model}. Isto descreve a configuração, não comprova saúde nem resposta do modelo.</p>}
 {form.rag_key==='cliente'&&<label>Conta cliente<select required value={form.client_account_id} onChange={e=>setForm({...form,client_account_id:e.target.value})}><option value="">Selecione a conta</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.display_name}</option>)}</select></label>}
 <label>Raiz permitida<select required value={form.root_key} onChange={e=>setForm({...form,root_key:e.target.value})}><option value="">Selecione</option>{roots.map(k=><option key={k}>{k}</option>)}</select></label>
 <label>Pasta relativa à raiz<input required maxLength={500} value={form.relative_path} onChange={e=>setForm({...form,relative_path:e.target.value})}/></label>
 <button disabled={busy||!roots.length}>Cadastrar fonte</button></form>
 <p role="status">{message}</p><button disabled={busy} onClick={()=>void load()}>Atualizar fontes</button>
 {sources.map(s=><article key={s.id}><h3>{s.name}</h3><p>{s.rag_key} · {s.root_key}/{s.relative_path} · {s.is_active?'Ativa':'Pausada'} · {s.last_synced_at?new Date(s.last_synced_at).toLocaleString('pt-BR'):'Ainda não sincronizada'}</p><button disabled={busy||!s.is_active} onClick={()=>void mutate({action:'sync',id:s.id})}>Sincronizar para revisão</button><button disabled={busy} onClick={()=>void mutate({action:'toggle',id:s.id,is_active:!s.is_active})}>{s.is_active?'Pausar':'Ativar'}</button>{s.last_report!=null&&<details><summary>Relatório da última leitura</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(s.last_report,null,2)}</pre></details>}</article>)}</UiTaskWorkspace>;
}
