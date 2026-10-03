"use client";
// EXT-07 — tela staff real da jornada canônica de compliance corporativo.
// Nada aparece como confirmado antes da resposta do servidor; a chave de
// idempotência é preservada após falha para permitir retry seguro.
import {FormEvent,useCallback,useEffect,useRef,useState} from "react";

type Obligation={id:string;protocol:string;obligation_type:string;title:string;scope_kind:string;scope_reference:string;periodicity:string;criticality:string|null;status:string;renewal_window_days:number;responsible_display_name:string|null;current_document_status:string|null;open_task_count:number};
type Staff={id:string;display_name:string;role:string};
type Aggregate={source:string;base_date:string;denominator:number;by_status:Record<string,number>;absence_note:string|null};
type TaskRow={id:string;protocol:string;document_id:string;trigger_rule:string;period_end:string;evaluation_base_date:string;status:string;responsible_display_name:string|null;pending_reason:string|null;trigger_rule_detail?:unknown;trigger_facts?:unknown};
type DocumentRow={id:string;protocol:string;version:number;status:string;is_current:boolean;is_private:boolean;issue_date:string|null;validity_start:string|null;expiry_date:string|null;no_expiry:boolean;renewal_window_days:number|null;document_number_masked:string|null;document_number?:string|null;issuer?:string|null;reference_kind?:string|null;reference_value?:string|null;reference_source?:string|null;reference_note?:string|null;supersedes_document_id?:string|null;superseded_by_document_id?:string|null;supersede_reason?:string|null;storage_boundary?:string};
type Detail={obligation:Obligation&{description:string;legal_basis:string;basis_source:string;applicability_justification:string;validity_rule_source:string};documents:DocumentRow[];tasks:TaskRow[];events:Array<Record<string,unknown>>};

const box:React.CSSProperties={background:"white",border:"1px solid #d1d5db",borderRadius:12,padding:16,marginBottom:16};
const input:React.CSSProperties={padding:8,border:"1px solid #9ca3af",borderRadius:6,minWidth:180,margin:3};
const button:React.CSSProperties={padding:"9px 13px",border:0,borderRadius:6,background:"#155e75",color:"white",cursor:"pointer",margin:3};
const emptyObligation={obligation_type:"licenca",title:"",description:"",legal_basis:"",basis_source:"",scope_kind:"entidade",scope_reference:"",applicability_justification:"",periodicity:"anual",validity_rule_source:"",renewal_window_days:30,criticality:"media",responsible_identity:""};
const emptyDocument={title:"",description:"",document_number:"",issuer:"",issue_date:"",validity_start:"",expiry_date:"",no_expiry:false,validity_rule_source:"",reference_kind:"referencia_declarada",reference_value:"",reference_source:"",reference_note:""};
async function body(r:Response){const t=await r.text();try{return JSON.parse(t)}catch{return{error:t||`HTTP ${r.status}`}}}

export default function ComplianceWorkspace(){
 const [obligations,setObligations]=useState<Obligation[]>([]),[staff,setStaff]=useState<Staff[]>([]),[tasks,setTasks]=useState<TaskRow[]>([]);
 const [aggregate,setAggregate]=useState<Aggregate|null>(null),[taskAggregate,setTaskAggregate]=useState<Aggregate|null>(null);
 const [selected,setSelected]=useState(""),[detail,setDetail]=useState<Detail|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[emptyState,setEmptyState]=useState("");
 const [form,setForm]=useState(emptyObligation),[docForm,setDocForm]=useState(emptyDocument),[renewForm,setRenewForm]=useState({...emptyDocument,supersede_reason:""});
 const [justification,setJustification]=useState(""),[taskNote,setTaskNote]=useState("");
 const keys=useRef<Record<string,string>>({});

 const loadDetail=useCallback(async(id:string)=>{if(!id){setDetail(null);return;}const r=await fetch(`/api/ext/compliance/obligations/${id}`);const b=await body(r);if(!r.ok)throw new Error(b.error);setDetail(b);},[]);
 const load=useCallback(async()=>{setLoading(true);setError("");try{
  const [a,b2,c]=await Promise.all([fetch("/api/ext/compliance/obligations"),fetch("/api/ext/compliance/references"),fetch("/api/ext/compliance/tasks")]);
  const [x,y,z]=await Promise.all([body(a),body(b2),body(c)]);
  if(!a.ok||!b2.ok||!c.ok)throw new Error(x.error||y.error||z.error);
  setObligations(x.obligations||[]);setAggregate(x.aggregate||null);setEmptyState(x.empty_state||"");
  setStaff(y.staff||[]);setTasks(z.tasks||[]);setTaskAggregate(z.aggregate||null);
  if(selected)await loadDetail(selected);
 }catch(e){setError(e instanceof Error?e.message:"Falha ao carregar")}finally{setLoading(false)}},[selected,loadDetail]);
 useEffect(()=>{void load()},[load]);

 async function mutate(op:string,url:string,payload:unknown){
  const k=keys.current[op]||`ext07-${op}-${crypto.randomUUID()}`;keys.current[op]=k;setBusy(op);setError("");setNotice("");
  try{
   const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json","idempotency-key":k},body:JSON.stringify(payload)});
   const b=await body(r);
   if(!r.ok)throw new Error(`${b.error||r.status}${b.pending_reason?`: ${b.pending_reason}`:""}`);
   delete keys.current[op];return b;
  }catch(e){setError(`${e instanceof Error?e.message:"Falha"}. Chave preservada para retry seguro: ${k}`);throw e;}
  finally{setBusy("")}
 }
 async function done(message:string,id=selected){await load();if(id)await loadDetail(id);setNotice(message);}
 async function createObligation(e:FormEvent){e.preventDefault();try{const b=await mutate("obligation","/api/ext/compliance/obligations",{...form,renewal_window_days:Number(form.renewal_window_days)});setSelected(b.obligation.id);setForm(emptyObligation);await done("Obrigação confirmada pelo servidor.",b.obligation.id);}catch{}}
 async function createDocument(e:FormEvent){e.preventDefault();if(!selected)return;try{await mutate(`document-${selected}`,`/api/ext/compliance/obligations/${selected}/documents`,docForm);setDocForm(emptyDocument);await done("Documento privado registrado; estado derivado da data-base do servidor.");}catch{}}
 async function renew(e:FormEvent,documentId:string){e.preventDefault();try{await mutate(`renew-${documentId}`,`/api/ext/compliance/documents/${documentId}/renew`,renewForm);await done("Renovação confirmada: nova versão criada e versão anterior preservada.");}catch{}}
 async function evaluate(){try{const b=await mutate("evaluate","/api/ext/compliance/evaluate",{});await done(`Avaliação temporal executada em ${b.evaluation.base_date}: ${b.evaluation.tasks_created} tarefa(s) criada(s) sobre denominador ${b.evaluation.denominator}.`);}catch{}}

 const current=detail?.documents.find(d=>d.is_current)||null;
 return <main style={{maxWidth:1200,margin:"24px auto",padding:16,fontFamily:"system-ui",background:"#f8fafc"}}>
  <h1>Compliance corporativo — EXT-07</h1>
  <p><strong>Critério:</strong> Vencimento gera tarefa e documento privado.</p>
  <p>Jornada exclusivamente interna de staff. Não há portal de órgão emissor, seguradora, corretora, contador, fornecedor, link público ou token documental.</p>
  <p><strong>Fronteira de armazenamento:</strong> os documentos são <em>referências documentais privadas declaradas</em>. O sistema não recebeu upload, não armazena bytes, não calcula checksum, não executa varredura de malware e não oferece download. A aplicabilidade é declarada pela equipe interna com fonte; não é confirmação de órgão público nem parecer jurídico verificado.</p>
  <p><strong>Monitoramento:</strong> a avaliação temporal é uma operação administrativa explícita. Não existe scheduler canônico; geração automática contínua dependeria de execução agendada futura.</p>

  {loading&&<p role="status">Carregando dados reais do backend…</p>}
  {error&&<div role="alert" style={{...box,borderColor:"#dc2626"}}>{error} <button style={button} onClick={()=>void load()}>Tentar novamente</button></div>}
  {notice&&<p role="status" style={{color:"#166534"}}>{notice}</p>}

  <section style={box}>
   <h2>Agregados</h2>
   {aggregate
     ?<p>Fonte: {aggregate.source} · data-base: {aggregate.base_date} · denominador: {aggregate.denominator} · por estado: {JSON.stringify(aggregate.by_status)}{aggregate.absence_note&&<> · <strong>{aggregate.absence_note}</strong></>}</p>
     :<p>Ausência de agregado: o servidor ainda não respondeu. Ausência não é zero.</p>}
   {taskAggregate&&<p>Tarefas — fonte: {taskAggregate.source} · data-base: {taskAggregate.base_date} · denominador: {taskAggregate.denominator} · por estado: {JSON.stringify(taskAggregate.by_status)}{taskAggregate.absence_note&&<> · <strong>{taskAggregate.absence_note}</strong></>}</p>}
   <button style={button} disabled={!!busy} onClick={()=>void evaluate()}>Executar avaliação temporal (gera tarefa por vencimento)</button>
  </section>

  <section style={box}><h2>Nova obrigação aplicável</h2>
   <form onSubmit={createObligation}>
    <select style={input} value={form.obligation_type} onChange={e=>setForm({...form,obligation_type:e.target.value})}>{["licenca","certidao","seguro","alvara","outro"].map(v=><option key={v}>{v}</option>)}</select>
    {(["title","description","legal_basis","basis_source","scope_reference","applicability_justification","validity_rule_source"] as const).map(k=>
      <input key={k} style={input} required placeholder={k} value={String(form[k])} onChange={e=>setForm({...form,[k]:e.target.value})}/>)}
    <select style={input} value={form.scope_kind} onChange={e=>setForm({...form,scope_kind:e.target.value})}>{["entidade","unidade","contrato","operacao","outro"].map(v=><option key={v}>{v}</option>)}</select>
    <select style={input} value={form.periodicity} onChange={e=>setForm({...form,periodicity:e.target.value})}>{["unica","mensal","trimestral","semestral","anual","sem_vencimento","outra"].map(v=><option key={v}>{v}</option>)}</select>
    <input style={input} type="number" min={0} max={365} placeholder="janela de renovação (dias)" value={form.renewal_window_days} onChange={e=>setForm({...form,renewal_window_days:Number(e.target.value)})}/>
    <select style={input} value={form.criticality} onChange={e=>setForm({...form,criticality:e.target.value})}>{["baixa","media","alta","critica"].map(v=><option key={v}>{v}</option>)}</select>
    <select style={input} required value={form.responsible_identity} onChange={e=>setForm({...form,responsible_identity:e.target.value})}>
     <option value="">Responsável canônico (identidade staff ativa)</option>
     {staff.map(s=><option key={s.id} value={s.id}>{s.display_name} — {s.role}</option>)}
    </select>
    <button style={button} disabled={!!busy}>Registrar obrigação</button>
   </form>
   <p><small>O nome exibido é projeção da identidade canônica; nome livre não é fonte de autoridade.</small></p>
  </section>

  <section style={box}><h2>Obrigações</h2>
   {!loading&&!obligations.length&&<p>{emptyState||"Nenhuma obrigação registrada no backend canônico. O sistema não cria seed."}</p>}
   <ul>{obligations.map(o=><li key={o.id}>
    <button style={{...button,background:selected===o.id?"#0f172a":"#475569"}} onClick={()=>{setSelected(o.id);void loadDetail(o.id)}}>{o.protocol} — {o.title}</button>
    {" "}{o.obligation_type} · escopo {o.scope_kind}/{o.scope_reference} · obrigação: <strong>{o.status}</strong> · documento atual: {o.current_document_status||"sem documento"} · tarefas abertas: {o.open_task_count} · responsável: {o.responsible_display_name||"—"}
   </li>)}</ul>
  </section>

  {detail&&<>
   <section style={box}><h2>{detail.obligation.protocol}: {detail.obligation.title}</h2>
    <p>Fundamento declarado: {detail.obligation.legal_basis} · fonte: {detail.obligation.basis_source}</p>
    <p>Justificativa de aplicabilidade: {detail.obligation.applicability_justification}</p>
    <p>Regra de validade: {detail.obligation.validity_rule_source} · periodicidade {detail.obligation.periodicity} · janela {detail.obligation.renewal_window_days} dia(s)</p>
    <input style={input} placeholder="Justificativa (10..1000)" value={justification} onChange={e=>setJustification(e.target.value)}/>
    <button style={button} disabled={!!busy} onClick={()=>void mutate(`close-${selected}`,`/api/ext/compliance/obligations/${selected}/close`,{status:"nao_aplicavel",justification}).then(()=>done("Obrigação marcada como não aplicável com justificativa.")).catch(()=>{})}>Marcar não aplicável</button>
    <button style={button} disabled={!!busy} onClick={()=>void mutate(`end-${selected}`,`/api/ext/compliance/obligations/${selected}/close`,{status:"encerrada",justification}).then(()=>done("Obrigação encerrada com justificativa.")).catch(()=>{})}>Encerrar obrigação</button>
   </section>

   {!current&&<section style={box}><h3>Registrar documento/referência privada</h3>
    <form onSubmit={createDocument}>
     {(["title","description","document_number","issuer","validity_rule_source","reference_value","reference_source","reference_note"] as const).map(k=>
       <input key={k} style={input} placeholder={k} value={String(docForm[k])} onChange={e=>setDocForm({...docForm,[k]:e.target.value})}/>)}
     <label style={{margin:6}}>emissão <input style={input} type="date" value={docForm.issue_date} onChange={e=>setDocForm({...docForm,issue_date:e.target.value})}/></label>
     <label style={{margin:6}}>início de vigência <input style={input} type="date" value={docForm.validity_start} onChange={e=>setDocForm({...docForm,validity_start:e.target.value})}/></label>
     <label style={{margin:6}}>vencimento <input style={input} type="date" value={docForm.expiry_date} disabled={docForm.no_expiry} onChange={e=>setDocForm({...docForm,expiry_date:e.target.value})}/></label>
     <label style={{margin:6}}><input type="checkbox" checked={docForm.no_expiry} onChange={e=>setDocForm({...docForm,no_expiry:e.target.checked})}/> sem vencimento (declarado, distinto de ausência de data)</label>
     <select style={input} value={docForm.reference_kind} onChange={e=>setDocForm({...docForm,reference_kind:e.target.value})}><option value="referencia_declarada">referencia_declarada</option><option value="sem_referencia">sem_referencia</option></select>
     <button style={button} disabled={!!busy}>Registrar documento privado</button>
    </form>
    <p><small>Metadado/referência declarada, não arquivo verificado. O servidor impõe is_private e deriva o estado temporal.</small></p>
   </section>}

   <section style={box}><h3>Documento atual, histórico e versões</h3>
    {!detail.documents.length&&<p>Nenhum documento registrado para esta obrigação. Ausência de documento é distinta de documento vencido.</p>}
    <ul>{detail.documents.map(d=><li key={d.id}>
     v{d.version} · {d.protocol} · <strong>{d.status}</strong>{d.is_current?" (atual)":""} · privado: {String(d.is_private)} · número: {d.document_number_masked} · emissão {d.issue_date} · vigência {d.validity_start} → {d.no_expiry?"sem vencimento declarado":d.expiry_date}
     {d.reference_kind&&<> · referência: {d.reference_kind}{d.reference_value?` (${d.reference_value}, fonte ${d.reference_source})`:""}</>}
     {d.superseded_by_document_id&&<> · substituída: {d.supersede_reason}</>}
     {d.is_current&&<><button style={button} disabled={!!busy} onClick={()=>void mutate(`renewal-start-${d.id}`,`/api/ext/compliance/documents/${d.id}/renewal-start`,{justification}).then(()=>done("Renovação iniciada; versão anterior preservada.")).catch(()=>{})}>Iniciar renovação</button>
      <button style={button} disabled={!!busy} onClick={()=>void mutate(`cancel-doc-${d.id}`,`/api/ext/compliance/documents/${d.id}/cancel`,{justification}).then(()=>done("Documento cancelado com justificativa.")).catch(()=>{})}>Cancelar documento</button></>}
     {d.is_current&&d.status==="em_renovacao"&&<form onSubmit={e=>renew(e,d.id)} style={{marginTop:8}}>
      {(["title","description","document_number","issuer","validity_rule_source","reference_value","reference_source","supersede_reason"] as const).map(k=>
        <input key={k} style={input} placeholder={`nova versão: ${k}`} value={String(renewForm[k])} onChange={e=>setRenewForm({...renewForm,[k]:e.target.value})}/>)}
      <input style={input} type="date" value={renewForm.issue_date} onChange={e=>setRenewForm({...renewForm,issue_date:e.target.value})}/>
      <input style={input} type="date" value={renewForm.validity_start} onChange={e=>setRenewForm({...renewForm,validity_start:e.target.value})}/>
      <input style={input} type="date" value={renewForm.expiry_date} onChange={e=>setRenewForm({...renewForm,expiry_date:e.target.value})}/>
      <button style={button} disabled={!!busy}>Concluir renovação com nova versão</button>
     </form>}
    </li>)}</ul>
    <p><small>Renovação nunca apaga o período anterior: a versão anterior é formalmente substituída e permanece no histórico.</small></p>
   </section>

   <section style={box}><h3>Tarefas de vencimento desta obrigação</h3>
    {!detail.tasks.length&&<p>Nenhuma tarefa gerada. Ausência de tarefa é distinta de zero tarefas medidas: a regra só cria tarefa quando a janela registrada ou o vencimento é alcançado na data-base do servidor.</p>}
    <ul>{detail.tasks.map(t=><li key={t.id}>
     {t.protocol} · regra <strong>{t.trigger_rule}</strong> · período até {t.period_end} · data-base {t.evaluation_base_date} · estado <strong>{t.status}</strong> · responsável: {t.responsible_display_name||"—"}
     {t.pending_reason&&<> · <strong>pendência fail-closed:</strong> {t.pending_reason}</>}
     <pre style={{whiteSpace:"pre-wrap"}}>{JSON.stringify({regra:t.trigger_rule_detail,fatos:t.trigger_facts},null,2)}</pre>
    </li>)}</ul>
   </section>
  </>}

  <section style={box}><h2>Tarefas geradas por vencimento</h2>
   <input style={input} placeholder="Resultado da conclusão / justificativa do cancelamento (10+)" value={taskNote} onChange={e=>setTaskNote(e.target.value)}/>
   {!loading&&!tasks.length&&<p>Nenhuma tarefa de vencimento no backend canônico. O sistema não cria seed e não declara monitoramento contínuo.</p>}
   <ul>{tasks.map(t=><li key={t.id}>
    {t.protocol} · {t.trigger_rule} · vence {t.period_end} · data-base {t.evaluation_base_date} · <strong>{t.status}</strong> · responsável: {t.responsible_display_name||"—"}
    {t.pending_reason&&<> · <strong>pendência fail-closed:</strong> {t.pending_reason}</>}
    {t.status==="aberta"&&<button style={button} disabled={!!busy} onClick={()=>void mutate(`task-start-${t.id}`,`/api/ext/compliance/tasks/${t.id}/start`,{note:taskNote||"Início registrado pela equipe interna."}).then(()=>done("Tarefa iniciada pelo servidor.")).catch(()=>{})}>Iniciar</button>}
    {t.status==="em_andamento"&&<button style={button} disabled={!!busy} onClick={()=>void mutate(`task-complete-${t.id}`,`/api/ext/compliance/tasks/${t.id}/complete`,{result:taskNote}).then(()=>done("Tarefa concluída com responsável e resultado.")).catch(()=>{})}>Concluir</button>}
    {["aberta","em_andamento"].includes(t.status)&&<button style={button} disabled={!!busy} onClick={()=>void mutate(`task-cancel-${t.id}`,`/api/ext/compliance/tasks/${t.id}/cancel`,{justification:taskNote}).then(()=>done("Tarefa cancelada com justificativa.")).catch(()=>{})}>Cancelar</button>}
   </li>)}</ul>
   <p><small>Conclusão exige responsável canônico e resultado; cancelamento exige justificativa; estado terminal não reabre.</small></p>
  </section>
 </main>;
}
