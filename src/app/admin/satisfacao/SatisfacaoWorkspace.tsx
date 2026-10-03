"use client";
import {FormEvent,useCallback,useEffect,useRef,useState} from "react";
type Account={id:string;display_name:string;status:string};
type Target={id:string;display_name:string;email:string};
type Ref={id:string;title?:string;protocol?:string};
type Survey={id:string;protocol:string;client_account_id:string;survey_type:string;status:string;methodology:string;scale_min:number;scale_max:number;score:number|null;score_classification:string|null;recovery_required:boolean|null;created_at:string;responded_at:string|null};
type Plan={id:string;survey_id:string;status:string;action:string;responsible_name:string|null;due_date:string};
type Detail={survey:Survey;action_plans:Plan[];events:Array<Record<string,unknown>>};
const box:React.CSSProperties={background:"white",border:"1px solid #d1d5db",borderRadius:12,padding:16,marginBottom:16};
const input:React.CSSProperties={padding:8,border:"1px solid #9ca3af",borderRadius:6,minWidth:160,margin:3};
const button:React.CSSProperties={padding:"9px 13px",border:0,borderRadius:6,background:"#155e75",color:"white",cursor:"pointer",margin:3};
const emptyForm={client_account_id:"",target_identity_id:"",contract_id:"",ticket_id:"",visit_id:"",survey_type:"pos_atendimento",methodology:"none",scale_min:0,scale_max:10,methodology_source:"",detractor_max:6,passive_max:8,positive_min:4,recovery_trigger:"none",recovery_threshold:6};
async function json(r:Response){const t=await r.text();try{return JSON.parse(t)}catch{return{error:t||`HTTP ${r.status}`}}}
export default function SatisfacaoWorkspace(){
 const [accounts,setAccounts]=useState<Account[]>([]),[targets,setTargets]=useState<Target[]>([]),[contracts,setContracts]=useState<Ref[]>([]),[tickets,setTickets]=useState<Ref[]>([]),[visits,setVisits]=useState<Ref[]>([]);
 const [items,setItems]=useState<Survey[]>([]),[selected,setSelected]=useState(""),[detail,setDetail]=useState<Detail|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [form,setForm]=useState(emptyForm),[justification,setJustification]=useState(""),[conclusionResult,setConclusionResult]=useState(""),[completionResult,setCompletionResult]=useState("");
 const keys=useRef<Record<string,string>>({});
 const loadReferences=useCallback(async(accountId:string)=>{
   const r=await fetch(`/api/ext/satisfaction/references${accountId?`?account_id=${accountId}`:""}`);
   const b=await json(r); if(!r.ok) throw new Error(b.error);
   setAccounts(b.accounts||[]); setTargets(b.targets||[]); setContracts(b.contracts||[]); setTickets(b.tickets||[]); setVisits(b.visits||[]);
 },[]);
 const loadDetail=useCallback(async(id:string)=>{if(!id){setDetail(null);return;}const r=await fetch(`/api/ext/satisfaction/surveys/${id}`);const b=await json(r);if(!r.ok)throw new Error(b.error);setDetail(b);},[]);
 const load=useCallback(async()=>{setLoading(true);setError("");try{
   await loadReferences(form.client_account_id);
   const r=await fetch("/api/ext/satisfaction/surveys");const b=await json(r);if(!r.ok)throw new Error(b.error);setItems(b.surveys||[]);
   if(selected) await loadDetail(selected);
 }catch(e){setError(e instanceof Error?e.message:"Falha ao carregar");}finally{setLoading(false);}},[form.client_account_id,selected,loadDetail,loadReferences]);
 useEffect(()=>{void load()},[]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{void loadReferences(form.client_account_id);},[form.client_account_id,loadReferences]);
 async function mutate(op:string,url:string,body:unknown){
   const k=keys.current[op]||`ext06-${op}-${crypto.randomUUID()}`; keys.current[op]=k; setBusy(op); setError(""); setNotice("");
   try{const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json","idempotency-key":k},body:JSON.stringify(body)});
     const b=await json(r); if(!r.ok) throw new Error(`${b.error||r.status}${b.details?`: ${b.details.join(", ")}`:""}`);
     delete keys.current[op]; return b;
   }catch(e){setError(`${e instanceof Error?e.message:"Falha"}. Chave preservada para retry seguro: ${k}`); throw e;}
   finally{setBusy("");}
 }
 async function done(message:string,id=selected){await load();if(id)await loadDetail(id);setNotice(message);}
 async function create(e:FormEvent){
   e.preventDefault();
   const classification_rule=form.methodology==="nps"?{detractor_max:Number(form.detractor_max),passive_max:Number(form.passive_max)}:form.methodology==="csat"?{positive_min:Number(form.positive_min)}:null;
   const recovery_rule=form.recovery_trigger==="score_at_or_below"?{trigger:"score_at_or_below",threshold:Number(form.recovery_threshold)}:{trigger:form.recovery_trigger};
   const body={
     client_account_id:form.client_account_id,target_identity_id:form.target_identity_id,
     contract_id:form.contract_id||null,ticket_id:form.ticket_id||null,visit_id:form.visit_id||null,
     survey_type:form.survey_type,methodology:form.methodology,
     scale_min:form.methodology==="nps"?0:Number(form.scale_min),scale_max:form.methodology==="nps"?10:Number(form.scale_max),
     methodology_source:form.methodology==="none"?null:form.methodology_source,
     classification_rule,recovery_rule,
   };
   try{const b=await mutate("create","/api/ext/satisfaction/surveys",body);setSelected(b.survey.id);setForm({...emptyForm,client_account_id:form.client_account_id});await done("Pesquisa criada com metodologia declarada.",b.survey.id);}catch{/* erro exibido */}
 }
 async function cancelSurvey(){if(!selected)return;try{await mutate(`cancel-${selected}`,`/api/ext/satisfaction/surveys/${selected}/cancel`,{justification});await done("Pesquisa cancelada antes da resposta.");}catch{/* erro exibido */}}
 async function concludeSurvey(){if(!selected)return;try{await mutate(`conclude-${selected}`,`/api/ext/satisfaction/surveys/${selected}/conclude`,{conclusion_result:conclusionResult});await done("Pesquisa concluída pela equipe interna.");}catch{/* erro exibido */}}
 async function openPlan(){if(!selected)return;try{await mutate(`plan-create-${selected}`,`/api/ext/satisfaction/surveys/${selected}/action-plan`,{});await done("Plano de recuperação aberto com responsável canônico.");}catch{/* erro exibido */}}
 async function planOp(planId:string,op:"start"|"complete"|"cancel"){
   const body=op==="complete"?{completion_result:completionResult}:op==="cancel"?{justification}:{};
   try{await mutate(`plan-${op}-${planId}`,`/api/ext/satisfaction/action-plans/${planId}/${op}`,body);await done(`Plano ${op==="start"?"iniciado":op==="complete"?"concluído":"cancelado"}.`);}catch{/* erro exibido */}
 }
 return <main style={{maxWidth:1200,margin:"24px auto",padding:16,fontFamily:"system-ui",background:"#f8fafc"}}>
  <h1>Satisfação/Carteira — EXT-06</h1>
  <p><strong>Critério:</strong> Resposta gera acompanhamento sem expor funcionário.</p>
  <p>Fonte canônica: cli_satisfaction_surveys / cli_satisfaction_action_plans (CLI-11, endurecida). Metodologia e escala são declaradas por pesquisa; não há limiar global embutido.</p>
  {loading&&<p role="status">Carregando dados reais do backend…</p>}
  {error&&<div role="alert" style={{...box,borderColor:"#dc2626"}}>{error} <button style={button} onClick={()=>void load()}>Tentar novamente</button></div>}
  {notice&&<p role="status" style={{color:"#166534"}}>{notice}</p>}

  <section style={box}><h2>Nova pesquisa</h2>
   <form onSubmit={create}>
    <select style={input} required value={form.client_account_id} onChange={e=>setForm({...form,client_account_id:e.target.value,target_identity_id:""})}>
     <option value="">Conta do cliente</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.display_name}</option>)}
    </select>
    <select style={input} required value={form.target_identity_id} onChange={e=>setForm({...form,target_identity_id:e.target.value})}>
     <option value="">Destinatário (identidade cliente)</option>{targets.map(t=><option key={t.id} value={t.id}>{t.display_name} ({t.email})</option>)}
    </select>
    <select style={input} value={form.contract_id} onChange={e=>setForm({...form,contract_id:e.target.value})}><option value="">Contrato (opcional)</option>{contracts.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select>
    <select style={input} value={form.ticket_id} onChange={e=>setForm({...form,ticket_id:e.target.value})}><option value="">Chamado (opcional)</option>{tickets.map(t=><option key={t.id} value={t.id}>{t.protocol}</option>)}</select>
    <select style={input} value={form.visit_id} onChange={e=>setForm({...form,visit_id:e.target.value})}><option value="">Visita (opcional)</option>{visits.map(v=><option key={v.id} value={v.id}>{v.protocol}</option>)}</select>
    <select style={input} value={form.survey_type} onChange={e=>setForm({...form,survey_type:e.target.value})}><option value="pos_atendimento">pós-atendimento</option><option value="periodica">periódica</option><option value="outro">outro</option></select>
    <select style={input} value={form.methodology} onChange={e=>setForm({...form,methodology:e.target.value})}><option value="none">sem metodologia (genérica)</option><option value="csat">CSAT</option><option value="nps">NPS</option></select>
    {form.methodology!=="nps"&&<><input style={input} type="number" min={0} max={10} placeholder="escala mín." value={form.scale_min} onChange={e=>setForm({...form,scale_min:Number(e.target.value)})}/><input style={input} type="number" min={0} max={10} placeholder="escala máx." value={form.scale_max} onChange={e=>setForm({...form,scale_max:Number(e.target.value)})}/></>}
    {form.methodology==="nps"&&<span>Escala fixa NPS: 0 a 10.</span>}
    {form.methodology!=="none"&&<input style={{...input,minWidth:260}} required placeholder="Fonte/metodologia declarada (ex.: pesquisa pós-atendimento padrão X)" value={form.methodology_source} onChange={e=>setForm({...form,methodology_source:e.target.value})}/>}
    {form.methodology==="nps"&&<><input style={input} type="number" placeholder="limite detrator (≤)" value={form.detractor_max} onChange={e=>setForm({...form,detractor_max:Number(e.target.value)})}/><input style={input} type="number" placeholder="limite neutro (≤)" value={form.passive_max} onChange={e=>setForm({...form,passive_max:Number(e.target.value)})}/></>}
    {form.methodology==="csat"&&<input style={input} type="number" placeholder="nota mínima satisfeito" value={form.positive_min} onChange={e=>setForm({...form,positive_min:Number(e.target.value)})}/>}
    <select style={input} value={form.recovery_trigger} onChange={e=>setForm({...form,recovery_trigger:e.target.value})}>
     <option value="none">sem acompanhamento automático</option>
     <option value="never">nunca exigir acompanhamento</option>
     <option value="score_at_or_below">nota menor ou igual a um limite declarado</option>
     {form.methodology==="nps"&&<option value="nps_detractor">detrator NPS</option>}
     {form.methodology==="csat"&&<option value="csat_below_positive">abaixo do satisfeito CSAT</option>}
    </select>
    {form.recovery_trigger==="score_at_or_below"&&<input style={input} type="number" placeholder="limite" value={form.recovery_threshold} onChange={e=>setForm({...form,recovery_threshold:Number(e.target.value)})}/>}
    <button style={button} disabled={!!busy}>Criar pesquisa</button>
   </form>
  </section>

  <section style={box}><h2>Pesquisas canônicas</h2>
   {!loading&&!items.length&&<p>Nenhuma pesquisa canônica registrada; o cluster limpo não recebe seed.</p>}
   <ul>{items.map(s=><li key={s.id}>
     <button style={{...button,background:selected===s.id?"#0f172a":"#475569"}} onClick={()=>{setSelected(s.id);void loadDetail(s.id)}}>{s.protocol}</button>
     {" "}{s.survey_type} · {s.methodology} · {s.status} {s.score!=null&&<>· nota {s.score}{s.score_classification?` (${s.score_classification})`:""}</>}
   </li>)}</ul>
  </section>

  {detail&&<>
   <section style={box}>
    <h2>{detail.survey.protocol}</h2>
    <p>Estado: <strong>{detail.survey.status}</strong> · escala {detail.survey.scale_min}–{detail.survey.scale_max} · metodologia {detail.survey.methodology}</p>
    <p>O responsável pelo acompanhamento é interno; não é exibido ao cliente em nenhuma rota do portal.</p>
    {detail.survey.status==="pendente"&&<><input style={input} placeholder="Justificativa de cancelamento" value={justification} onChange={e=>setJustification(e.target.value)}/><button style={button} onClick={()=>void cancelSurvey()}>Cancelar pesquisa</button></>}
    {["respondida","em_acao"].includes(detail.survey.status)&&<><input style={{...input,minWidth:260}} placeholder="Resultado da conclusão" value={conclusionResult} onChange={e=>setConclusionResult(e.target.value)}/><button style={button} onClick={()=>void concludeSurvey()}>Concluir pesquisa</button></>}
    {detail.survey.status==="respondida"&&!detail.action_plans.length&&<button style={button} onClick={()=>void openPlan()}>Abrir plano de recuperação com responsável canônico</button>}
   </section>
   <section style={box}><h3>Planos de acompanhamento</h3>
    {!detail.action_plans.length&&<p>Nenhum plano aberto para esta pesquisa.</p>}
    <ul>{detail.action_plans.map(p=><li key={p.id}>{p.action} — <strong>{p.status}</strong> (prazo {p.due_date})
     {p.status==="aberta"&&<button style={button} onClick={()=>void planOp(p.id,"start")}>Iniciar</button>}
     {["aberta","em_andamento"].includes(p.status)&&<><input style={input} placeholder="Resultado/justificativa" value={completionResult} onChange={e=>setCompletionResult(e.target.value)}/>
       <button style={button} onClick={()=>void planOp(p.id,"complete")}>Concluir</button>
       <input style={input} placeholder="Justificativa de cancelamento" value={justification} onChange={e=>setJustification(e.target.value)}/>
       <button style={button} onClick={()=>void planOp(p.id,"cancel")}>Cancelar</button></>}
    </li>)}</ul>
   </section>
   <section style={box}><h3>Histórico (eventos imutáveis)</h3><pre>{JSON.stringify(detail.events,null,2)}</pre></section>
  </>}
 </main>;
}
