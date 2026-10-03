"use client";
// EXT-07 — tela staff real sobre /api/ext/compliance/*. Nada aparece como confirmado
// antes da resposta do servidor; a mesma chave de idempotência é preservada após falha.
import {FormEvent,useCallback,useEffect,useRef,useState} from "react";

type Obligation={id:string;protocol:string;obligation_type:string;title:string;scope_kind:string;scope_label:string;periodicity:string;renewal_window_days:number;criticality:string|null;status:string;temporal_state:string;responsible_display_name:string;document_version:number|null;document_valid_from:string|null;document_expiry_date:string|null;document_has_expiry:boolean|null;open_task_count:number;document_count:number;created_at:string};
type Aggregate={source:string;base_date:string;denominator:number;by_state:Record<string,number>|null;absence:string|null;tasks:{source:string;denominator:number;open:number|null;fail_closed_pending:number|null;absence:string|null}};
type DocumentRow={id:string;protocol:string;title:string;compliance_type:string;status:string;version:number;document_number:string|null;issuer:string|null;issue_date:string|null;valid_from:string;expiry_date:string|null;has_expiry:boolean;reference_kind:string;reference_declared:string;reference_source:string;reference_note:string|null;is_private:boolean;is_current:boolean;supersedes_document_id:string|null;superseded_by_document_id:string|null;renewal_justification:string|null;state_rule:unknown;state_base_date:string|null;cancellation_justification:string|null};
type TaskRow={id:string;status:string;responsible_display_name:string|null;responsible_identity_id:string|null;pending_reason:string|null;trigger_rule:unknown;trigger_facts:unknown;base_date:string;validity_period_end:string;completion_result:string|null;cancellation_justification:string|null};
type Detail={obligation:Obligation&{description:string;legal_basis:string;basis_kind:string;applicability_justification:string;closure_justification:string|null};documents:DocumentRow[];tasks:TaskRow[];events:Array<{id:string;event_type:string;payload:unknown;created_at:string}>;current_document:DocumentRow|null;storage_boundary:{kind:string;note:string;legacy_metadata_warning:string};applicability_boundary:string};
type Refs={staff:{id:string;display_name:string;role:string}[];compliance_types:string[];basis_kinds:string[];scope_kinds:string[];periodicities:string[];criticalities:string[];reference_kinds:string[];server_base_date:string};

const box:React.CSSProperties={background:"#fff",border:"1px solid #cbd5e1",borderRadius:12,padding:16,marginBottom:16};
const input:React.CSSProperties={padding:8,border:"1px solid #94a3b8",borderRadius:6,margin:3};
const button:React.CSSProperties={...input,background:"#155e75",color:"white",cursor:"pointer"};

const emptyObligation={obligation_type:"licenca",title:"",description:"",legal_basis:"",basis_kind:"declarada_interna",scope_kind:"entidade",scope_label:"",applicability_justification:"",periodicity:"anual",renewal_window_days:"30",criticality:"",responsible_identity_id:""};
const emptyDocument={compliance_type:"licenca",title:"",description:"",document_number:"",issuer:"",issue_date:"",valid_from:"",has_expiry:"true",expiry_date:"",reference_kind:"referencia_declarada",reference_declared:"",reference_source:"",reference_note:"",supersedes_document_id:"",renewal_justification:""};

async function parse(r:Response){const t=await r.text();try{return JSON.parse(t)}catch{return{error:t||String(r.status)}}}

export default function ComplianceWorkspace(){
 const [items,setItems]=useState<Obligation[]>([]);
 const [aggregate,setAggregate]=useState<Aggregate|null>(null);
 const [emptyState,setEmptyState]=useState<string|null>(null);
 const [refs,setRefs]=useState<Refs|null>(null);
 const [detail,setDetail]=useState<Detail|null>(null);
 const [obligationForm,setObligationForm]=useState(emptyObligation);
 const [documentForm,setDocumentForm]=useState(emptyDocument);
 const [note,setNote]=useState("");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const keys=useRef<Record<string,string>>({});

 const load=useCallback(async()=>{setLoading(true);setError("");try{
   const [a,b]=await Promise.all([fetch("/api/ext/compliance/obligations"),fetch("/api/ext/compliance/references")]);
   const [x,y]=await Promise.all([parse(a),parse(b)]);
   if(!a.ok||!b.ok)throw new Error(x.error||y.error||"Falha ao carregar");
   setItems(x.obligations||[]);setAggregate(x.aggregate||null);setEmptyState(x.empty_state??null);setRefs(y);
 }catch(e){setError(e instanceof Error?e.message:"Falha ao carregar");}finally{setLoading(false)}},[]);
 useEffect(()=>{void load()},[load]);

 // A chave só é descartada após sucesso confirmado pelo servidor.
 async function mutate(op:string,url:string,payload:unknown){
  const key=keys.current[op]||`ext07-${op}-${crypto.randomUUID()}`;keys.current[op]=key;
  const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json","idempotency-key":key},body:JSON.stringify(payload)});
  const b=await parse(r);
  if(!r.ok){setError(`${b.error||r.status}. A MESMA chave de idempotência será preservada no retry: ${key}`);throw new Error(b.error||String(r.status));}
  delete keys.current[op];return b;
 }
 async function inspect(id:string){const r=await fetch(`/api/ext/compliance/obligations/${id}`),b=await parse(r);if(!r.ok){setError(b.error);return}setDetail(b)}

 async function createObligation(e:FormEvent){e.preventDefault();setError("");setNotice("");try{
   const payload={...obligationForm,renewal_window_days:Number(obligationForm.renewal_window_days),criticality:obligationForm.criticality||null};
   const b=await mutate("obligation",`/api/ext/compliance/obligations`,payload);
   setNotice(`Obrigação ${b.obligation.protocol} confirmada pelo servidor.`);setObligationForm(emptyObligation);await load();await inspect(b.obligation.id);
 }catch{}}

 async function createDocument(e:FormEvent){e.preventDefault();if(!detail)return;setError("");setNotice("");try{
   const f=documentForm;
   const payload={compliance_type:f.compliance_type,title:f.title,description:f.description,
     document_number:f.document_number||null,issuer:f.issuer||null,issue_date:f.issue_date||null,
     valid_from:f.valid_from,has_expiry:f.has_expiry==="true",expiry_date:f.has_expiry==="true"?(f.expiry_date||null):null,
     reference_kind:f.reference_kind,reference_declared:f.reference_declared,reference_source:f.reference_source,
     reference_note:f.reference_note||null,
     supersedes_document_id:f.supersedes_document_id||null,renewal_justification:f.supersedes_document_id?f.renewal_justification:null};
   const b=await mutate(`document-${detail.obligation.id}`,`/api/ext/compliance/obligations/${detail.obligation.id}/documents`,payload);
   setNotice(`Documento v${b.document.version} registrado. Estado derivado pelo servidor: ${b.temporal_state} (data-base ${b.base_date}). ${b.task_created?`Tarefa de vencimento criada: ${b.task.id}.`:"Nenhuma tarefa exigida pela regra registrada."}`);
   setDocumentForm(emptyDocument);await load();await inspect(detail.obligation.id);
 }catch{}}

 async function evaluate(){setError("");setNotice("");try{
   const b=await mutate("evaluate","/api/ext/compliance/evaluate",detail?{obligation_id:detail.obligation.id}:{});
   setNotice(`Avaliação temporal executada com data-base do servidor ${b.base_date}: denominador ${b.denominator}, tarefas criadas ${b.tasks_created}. ${b.scheduler}`);
   await load();if(detail)await inspect(detail.obligation.id);
 }catch{}}

 async function task(id:string,op:"start"|"complete"|"cancel"){setError("");setNotice("");try{
   await mutate(`task-${id}-${op}`,`/api/ext/compliance/tasks/${id}/${op}`,op==="complete"?{result:note}:op==="cancel"?{justification:note}:{note:note||"Início registrado pela gestão."});
   setNotice("Tarefa alterada somente após confirmação do servidor.");setNote("");
   await load();if(detail)await inspect(detail.obligation.id);
 }catch{}}

 async function close(status:"encerrada"|"nao_aplicavel"){if(!detail)return;setError("");setNotice("");try{
   await mutate(`close-${detail.obligation.id}`,`/api/ext/compliance/obligations/${detail.obligation.id}/close`,{status,justification:note});
   setNotice("Obrigação encerrada somente após confirmação do servidor.");setNote("");await load();await inspect(detail.obligation.id);
 }catch{}}

 return <main style={{maxWidth:1200,margin:"24px auto",padding:16,fontFamily:"system-ui",background:"#f8fafc"}}>
  <h1>Compliance corporativo — EXT-07</h1>
  <p><strong>Critério:</strong> Vencimento gera tarefa e documento privado.</p>
  <p>Jornada interna de staff. Não há portal de órgão emissor, login de seguradora/corretora, respondente externo, link público nem token documental.</p>
  <p><strong>Fronteira de armazenamento:</strong> esta fatia registra <em>referência documental privada declarada</em>. Não há upload, bytes recebidos, checksum, varredura de malware, armazenamento verificado nem download. Metadados legados da migração 086 (file_name/file_url/storage_key) não provam arquivo existente.</p>
  <p><strong>Fronteira de aplicabilidade:</strong> fundamento e aplicabilidade são declaração interna rastreável, não parecer jurídico verificado nem consulta automática a órgão público.</p>
  {loading&&<p role="status">Carregando backend real…</p>}
  {error&&<p role="alert">{error} <button style={button} onClick={()=>void load()}>Tentar novamente</button></p>}
  {notice&&<p role="status">{notice}</p>}

  <section style={box}>
   <h2>Cadastrar obrigação aplicável</h2>
   <form onSubmit={createObligation}>
    <select style={input} value={obligationForm.obligation_type} onChange={e=>setObligationForm({...obligationForm,obligation_type:e.target.value})}>{(refs?.compliance_types||[]).map(t=><option key={t} value={t}>{t}</option>)}</select>
    <input required style={input} placeholder="Título" value={obligationForm.title} onChange={e=>setObligationForm({...obligationForm,title:e.target.value})}/>
    <input required style={input} placeholder="Descrição" value={obligationForm.description} onChange={e=>setObligationForm({...obligationForm,description:e.target.value})}/>
    <input required style={input} placeholder="Fundamento/fonte declarada" value={obligationForm.legal_basis} onChange={e=>setObligationForm({...obligationForm,legal_basis:e.target.value})}/>
    <select style={input} value={obligationForm.basis_kind} onChange={e=>setObligationForm({...obligationForm,basis_kind:e.target.value})}>{(refs?.basis_kinds||[]).map(t=><option key={t} value={t}>{t}</option>)}</select>
    <select style={input} value={obligationForm.scope_kind} onChange={e=>setObligationForm({...obligationForm,scope_kind:e.target.value})}>{(refs?.scope_kinds||[]).map(t=><option key={t} value={t}>{t}</option>)}</select>
    <input required style={input} placeholder="Escopo (entidade/unidade/contrato/operação)" value={obligationForm.scope_label} onChange={e=>setObligationForm({...obligationForm,scope_label:e.target.value})}/>
    <input required style={input} placeholder="Justificativa de aplicabilidade" value={obligationForm.applicability_justification} onChange={e=>setObligationForm({...obligationForm,applicability_justification:e.target.value})}/>
    <select style={input} value={obligationForm.periodicity} onChange={e=>setObligationForm({...obligationForm,periodicity:e.target.value})}>{(refs?.periodicities||[]).map(t=><option key={t} value={t}>{t}</option>)}</select>
    <label>Janela/regra de renovação (dias): <input required style={input} type="number" min={0} max={365} value={obligationForm.renewal_window_days} onChange={e=>setObligationForm({...obligationForm,renewal_window_days:e.target.value})}/></label>
    <select style={input} value={obligationForm.criticality} onChange={e=>setObligationForm({...obligationForm,criticality:e.target.value})}><option value="">Criticidade não declarada</option>{(refs?.criticalities||[]).map(t=><option key={t} value={t}>{t}</option>)}</select>
    <select required style={input} value={obligationForm.responsible_identity_id} onChange={e=>setObligationForm({...obligationForm,responsible_identity_id:e.target.value})}><option value="">Responsável canônico (identidade staff ativa)</option>{(refs?.staff||[]).map(x=><option key={x.id} value={x.id}>{x.display_name} · {x.role}</option>)}</select>
    <button style={button}>Registrar obrigação</button>
   </form>
  </section>

  <section style={box}>
   <h2>Obrigações (projeção staff minimizada)</h2>
   <p>Número documental, referência declarada, URL, storage_key, notas internas, auditoria e conteúdo não aparecem nesta listagem.</p>
   <button style={button} onClick={()=>void evaluate()}>Executar avaliação temporal (data-base do servidor)</button>
   {!loading&&!items.length&&<p>{emptyState||"Vazio real: nenhuma obrigação canônica; a migração 153 não faz seed."}</p>}
   <ul>{items.map(x=><li key={x.id}>
    <button style={button} onClick={()=>void inspect(x.id)}>{x.protocol}</button> {x.title} · {x.obligation_type} · escopo {x.scope_kind}/{x.scope_label} · <strong>estado temporal: {x.temporal_state}</strong>
    {" · "}vencimento {x.document_has_expiry===false?"sem vencimento declarado":(x.document_expiry_date||"sem documento")}
    {" · "}janela {x.renewal_window_days}d · responsável {x.responsible_display_name} · versões {x.document_count} · tarefas abertas {x.open_task_count}
   </li>)}</ul>
   {aggregate&&<p><strong>Agregado</strong> — fonte: {aggregate.source}; data-base: {aggregate.base_date}; denominador: {aggregate.denominator};{" "}
    {aggregate.absence?<em>ausência: {aggregate.absence} (distinta de zero)</em>:<>distribuição: {JSON.stringify(aggregate.by_state)}</>};{" "}
    tarefas — fonte {aggregate.tasks.source}, denominador {aggregate.tasks.denominator}, {aggregate.tasks.absence?<em>ausência: {aggregate.tasks.absence} (distinta de zero)</em>:<>abertas {aggregate.tasks.open}, pendências fail-closed {aggregate.tasks.fail_closed_pending}</>}</p>}
  </section>

  {detail&&<section style={box}>
   <h2>{detail.obligation.protocol} — {detail.obligation.title}</h2>
   <p>{detail.obligation.description}</p>
   <p><strong>Fundamento declarado:</strong> {detail.obligation.legal_basis} ({detail.obligation.basis_kind}) · <strong>aplicabilidade:</strong> {detail.obligation.applicability_justification}</p>
   <p><em>{detail.applicability_boundary}</em></p>
   <p><strong>Estado da obrigação:</strong> {detail.obligation.status}{detail.obligation.closure_justification?` · justificativa: ${detail.obligation.closure_justification}`:""}</p>

   <h3>Registrar documento/referência privada {detail.current_document?"(renovação/substituição)":"(primeira versão)"}</h3>
   <form onSubmit={createDocument}>
    <select style={input} value={documentForm.compliance_type} onChange={e=>setDocumentForm({...documentForm,compliance_type:e.target.value})}>{(refs?.compliance_types||[]).map(t=><option key={t} value={t}>{t}</option>)}</select>
    <input required style={input} placeholder="Título do documento" value={documentForm.title} onChange={e=>setDocumentForm({...documentForm,title:e.target.value})}/>
    <input required style={input} placeholder="Descrição" value={documentForm.description} onChange={e=>setDocumentForm({...documentForm,description:e.target.value})}/>
    <input style={input} placeholder="Número documental (privado)" value={documentForm.document_number} onChange={e=>setDocumentForm({...documentForm,document_number:e.target.value})}/>
    <input style={input} placeholder="Emissor" value={documentForm.issuer} onChange={e=>setDocumentForm({...documentForm,issuer:e.target.value})}/>
    <label>Emissão <input style={input} type="date" value={documentForm.issue_date} onChange={e=>setDocumentForm({...documentForm,issue_date:e.target.value})}/></label>
    <label>Início de vigência <input required style={input} type="date" value={documentForm.valid_from} onChange={e=>setDocumentForm({...documentForm,valid_from:e.target.value})}/></label>
    <select style={input} value={documentForm.has_expiry} onChange={e=>setDocumentForm({...documentForm,has_expiry:e.target.value})}><option value="true">Com vencimento</option><option value="false">Sem vencimento declarado (ausência explícita, não é “sem risco”)</option></select>
    {documentForm.has_expiry==="true"&&<label>Vencimento <input required style={input} type="date" value={documentForm.expiry_date} onChange={e=>setDocumentForm({...documentForm,expiry_date:e.target.value})}/></label>}
    <select style={input} value={documentForm.reference_kind} onChange={e=>setDocumentForm({...documentForm,reference_kind:e.target.value})}>{(refs?.reference_kinds||[]).map(t=><option key={t} value={t}>{t}</option>)}</select>
    <input required style={input} placeholder="Referência declarada (privada, não é arquivo)" value={documentForm.reference_declared} onChange={e=>setDocumentForm({...documentForm,reference_declared:e.target.value})}/>
    <input required style={input} placeholder="Fonte da referência" value={documentForm.reference_source} onChange={e=>setDocumentForm({...documentForm,reference_source:e.target.value})}/>
    <input style={input} placeholder="Observação" value={documentForm.reference_note} onChange={e=>setDocumentForm({...documentForm,reference_note:e.target.value})}/>
    {detail.current_document&&<>
     <select required style={input} value={documentForm.supersedes_document_id} onChange={e=>setDocumentForm({...documentForm,supersedes_document_id:e.target.value})}><option value="">Documento substituído</option><option value={detail.current_document.id}>{detail.current_document.protocol} (v{detail.current_document.version})</option></select>
     <input required style={input} placeholder="Justificativa da renovação/substituição" value={documentForm.renewal_justification} onChange={e=>setDocumentForm({...documentForm,renewal_justification:e.target.value})}/>
    </>}
    <button style={button}>{detail.current_document?"Renovar/substituir":"Registrar documento"}</button>
   </form>
   <p><em>{detail.storage_boundary.note} {detail.storage_boundary.legacy_metadata_warning}</em></p>

   <h3>Histórico e versões</h3>
   <ul>{detail.documents.map(d=><li key={d.id}>
    v{d.version} · {d.protocol} · {d.status} · {d.is_current?"versão atual":"versão anterior preservada"} · privado: {String(d.is_private)}
    <br/>número: {d.document_number||"não declarado"} · emissor: {d.issuer||"não declarado"} · emissão: {d.issue_date||"não declarada"} · vigência {d.valid_from} → {d.has_expiry?d.expiry_date:"sem vencimento declarado"}
    <br/>referência ({d.reference_kind}): {d.reference_declared} · fonte: {d.reference_source}{d.reference_note?` · obs.: ${d.reference_note}`:""}
    <br/>{d.renewal_justification&&<>justificativa da renovação: {d.renewal_justification} · </>}{d.superseded_by_document_id&&<>substituído por: {d.superseded_by_document_id} · </>}data-base da avaliação: {d.state_base_date||"não avaliada"}
    <pre>{JSON.stringify({regra_de_validade:d.state_rule},null,2)}</pre>
   </li>)}</ul>

   <h3>Tarefas de vencimento</h3>
   <input style={input} placeholder="Nota, resultado ou justificativa" value={note} onChange={e=>setNote(e.target.value)}/>
   {!detail.tasks.length&&<p>Nenhuma tarefa gerada: a regra registrada ainda não foi alcançada nesta data-base.</p>}
   <ul>{detail.tasks.map(t=><li key={t.id}>
    {t.status} · responsável canônico: {t.responsible_display_name||<strong>pendente (fail-closed) — {t.pending_reason}</strong>} · vencimento do período: {t.validity_period_end} · data-base: {t.base_date}
    <pre>{JSON.stringify({regra:t.trigger_rule,fatos:t.trigger_facts},null,2)}</pre>
    {t.completion_result&&<p>Resultado: {t.completion_result}</p>}
    {t.cancellation_justification&&<p>Cancelamento: {t.cancellation_justification}</p>}
    {t.status==="aberta"&&<button style={button} onClick={()=>void task(t.id,"start")}>Iniciar</button>}
    {["aberta","em_andamento"].includes(t.status)&&<><button style={button} onClick={()=>void task(t.id,"complete")}>Concluir com resultado</button><button style={button} onClick={()=>void task(t.id,"cancel")}>Cancelar com justificativa</button></>}
   </li>)}</ul>

   <h3>Encerramento formal</h3>
   {detail.obligation.status==="ativa"
     ?<><button style={button} onClick={()=>void close("encerrada")}>Encerrar com justificativa</button><button style={button} onClick={()=>void close("nao_aplicavel")}>Marcar não aplicável com justificativa</button></>
     :<p>Estado terminal: não reabre silenciosamente.</p>}

   <h3>Eventos imutáveis</h3>
   <pre>{JSON.stringify(detail.events,null,2)}</pre>
  </section>}
 </main>;
}
