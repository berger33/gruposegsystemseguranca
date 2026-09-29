'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import styles from './EmployeePortal.module.css';

type Session = { employeeId:string; identityId:string; displayName:string; mustChangePassword:boolean };
type Home = Record<string, any[]> & { employeeId?:string };
type Tab = 'inicio'|'jornada'|'pedidos'|'documentos'|'mais';

async function request(path:string, init:RequestInit={}) {
  const response = await fetch(path, {
    ...init,
    credentials:'same-origin',
    headers:{ accept:'application/json', ...(init.body ? {'content-type':'application/json'} : {}), ...(init.headers||{}) },
  });
  const text = await response.text();
  let data:any; try{ data=JSON.parse(text); }catch{ data={ error:text || `http_${response.status}` }; }
  if(!response.ok) throw new Error(data?.error || `http_${response.status}`);
  return data;
}
function date(value:any){ return value ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short'}).format(new Date(`${String(value).slice(0,10)}T12:00:00`)) : '—'; }
async function filePayload(file:File){
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary=''; for(let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
  return { filename:file.name, contentType:file.type || 'application/octet-stream', contentBase64:btoa(binary) };
}

const OFFLINE_QUEUE_PREFIX='seg.employee.approved-offline.v1';
type OfflineTask={taskType:'procedure_ack';idempotencyKey:string;deviceTimestamp:string;deviceTimezone:string;payload:{procedureId:string}};
function approvedOfflineTask(path:string,body:any):OfflineTask|null{
  if(path!=='/api/employee/actions/procedure-ack'||!body?.procedureId)return null;
  return {taskType:'procedure_ack',idempotencyKey:`employee-${crypto.randomUUID()}`,deviceTimestamp:new Date().toISOString(),deviceTimezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Sao_Paulo',payload:{procedureId:String(body.procedureId)}};
}
function offlineQueueKey(employeeId:string){return `${OFFLINE_QUEUE_PREFIX}.${employeeId}`}
function offlineTasks(employeeId:string):OfflineTask[]{try{const parsed=JSON.parse(localStorage.getItem(offlineQueueKey(employeeId))||'[]');return Array.isArray(parsed)?parsed:[]}catch{return[]}}
function saveOfflineTasks(employeeId:string,tasks:OfflineTask[]){localStorage.setItem(offlineQueueKey(employeeId),JSON.stringify(tasks.slice(-50)))}
async function syncOfflineTasks(employeeId:string){
  const pending=offlineTasks(employeeId);if(!pending.length)return 0;
  const remaining:OfflineTask[]=[];let synced=0;
  for(const task of pending){try{await request('/api/employee/offline',{method:'POST',body:JSON.stringify(task)});synced+=1}catch{remaining.push(task)}}
  saveOfflineTasks(employeeId,remaining);return synced;
}

export default function EmployeePortal(){
  const [session,setSession]=useState<Session|null>(null);
  const [home,setHome]=useState<Home>({});
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState<Tab>('inicio');
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');

  const refresh=useCallback(async()=>{
    const [s,h]=await Promise.all([request('/api/employee/session'),request('/api/employee/home')]);
    setSession(s); setHome(h);
  },[]);
  useEffect(()=>{ refresh().catch(()=>setSession(null)).finally(()=>setLoading(false)); },[refresh]);
  useEffect(()=>{if(!session?.employeeId)return;const employeeId=session.employeeId;const sync=()=>{syncOfflineTasks(employeeId).then(count=>{if(count){setMessage(`${count} tarefa offline recebida pelo servidor.`);refresh().catch(()=>{})}})};window.addEventListener('online',sync);if(navigator.onLine)sync();return()=>window.removeEventListener('online',sync)},[refresh,session?.employeeId]);
  async function act(path:string,body:any){
    setError(''); setMessage('');
    const offline=approvedOfflineTask(path,body),employeeId=session?.employeeId||'';
    if(offline&&!employeeId){setError('employee_session_required');return false;}
    if(offline&&!navigator.onLine){saveOfflineTasks(employeeId,[...offlineTasks(employeeId),offline]);setMessage('Ciência guardada neste dispositivo. Será enviada quando a conexão voltar.');return true;}
    try{ await request(path,{method:'POST',body:JSON.stringify(body)}); setMessage('Recebido com sucesso.'); await refresh(); return true; }
    catch(e:any){
      if(offline&&e instanceof TypeError){saveOfflineTasks(employeeId,[...offlineTasks(employeeId),offline]);setMessage('Conexão indisponível: ciência guardada para sincronização.');return true;}
      setError(e.message); return false;
    }
  }
  async function logout(){ await request('/api/employee/session',{method:'DELETE'}).catch(()=>{}); setSession(null); setHome({}); }

  if(loading) return <main className={styles.shell}><div className={styles.login}><div className={styles.loginCard}>Carregando acesso seguro…</div></div></main>;
  if(!session) return <Login onLogin={async()=>{setLoading(true); await refresh(); setLoading(false);}} error={error} setError={setError}/>;

  const tabs:[Tab,string,string][]=[['inicio','⌂','Início'],['jornada','◷','Jornada'],['pedidos','＋','Pedidos'],['documentos','▤','Docs'],['mais','•••','Mais']];
  return <main className={styles.shell}><div className={styles.app}>
    <header className={styles.header}><div className={styles.brand}>SEG System • acesso próprio</div><div className={styles.headerRow}><div><h1>Olá, {session.displayName?.split(' ')[0]}</h1><p>Seus dados, sua escala e seus pedidos</p></div><button className={styles.logout} onClick={logout}>Sair</button></div></header>
    <div className={styles.content}>
      {message&&<div className={styles.notice}>{message}</div>}{error&&<div className={`${styles.notice} ${styles.error}`}>{error}</div>}
      {session.mustChangePassword&&<PasswordCard onDone={async()=>{setMessage('Senha alterada. Entre novamente.');setSession(null);}} setError={setError}/>}
      {!session.mustChangePassword&&tab==='inicio'&&<HomeTab home={home} act={act} setTab={setTab}/>}
      {!session.mustChangePassword&&tab==='jornada'&&<JourneyTab home={home} act={act}/>}
      {!session.mustChangePassword&&tab==='pedidos'&&<RequestsTab home={home} act={act}/>}
      {!session.mustChangePassword&&tab==='documentos'&&<DocumentsTab home={home} act={act}/>}
      {!session.mustChangePassword&&tab==='mais'&&<MoreTab home={home} act={act}/>}
    </div>
    <nav className={styles.tabs} aria-label="Navegação principal">{tabs.map(([id,icon,label])=><button key={id} className={`${styles.tab} ${tab===id?styles.active:''}`} onClick={()=>setTab(id)}><span className={styles.tabIcon}>{icon}</span>{label}</button>)}</nav>
  </div></main>;
}

function Login({onLogin,error,setError}:{onLogin:()=>Promise<void>;error:string;setError:(s:string)=>void}){
  const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');const fd=new FormData(e.currentTarget);try{await request('/api/employee/session',{method:'POST',body:JSON.stringify({email:fd.get('email'),password:fd.get('password')})});await onLogin();}catch(err:any){setError(err.message==='invalid_credentials'?'E-mail ou senha inválidos.':err.message);}finally{setBusy(false);}}
  return <main className={styles.shell}><div className={styles.login}><section className={styles.loginCard}><div className={styles.logo}>SEG</div><h1>Portal do funcionário</h1><p>Use somente sua identidade individual. Este acesso não utiliza credenciais de RH.</p>{error&&<div className={`${styles.notice} ${styles.error}`}>{error}</div>}<form className={styles.form} onSubmit={submit}><label>E-mail<input className={styles.input} name="email" type="email" autoComplete="username" required/></label><label>Senha<input className={styles.input} name="password" type="password" autoComplete="current-password" required/></label><button className={styles.button} disabled={busy}>{busy?'Entrando…':'Entrar com segurança'}</button></form><div className={styles.private}>Sessão individual, revogável e vinculada ao seu cadastro laboral.</div></section></div></main>;
}
function PasswordCard({onDone,setError}:{onDone:()=>void;setError:(s:string)=>void}){
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const fd=new FormData(e.currentTarget);try{await request('/api/employee/session/password',{method:'PUT',body:JSON.stringify({currentPassword:fd.get('current'),newPassword:fd.get('next')})});onDone();}catch(err:any){setError(err.message);}}
  return <section className={styles.card}><h2>Troque a senha temporária</h2><p>Use ao menos 12 caracteres. A troca encerra todas as sessões anteriores.</p><form className={styles.form} onSubmit={submit}><label>Senha atual<input className={styles.input} type="password" name="current" required/></label><label>Nova senha<input className={styles.input} type="password" name="next" minLength={12} required/></label><button className={styles.button}>Trocar senha</button></form></section>;
}
function HomeTab({home,act,setTab}:{home:Home;act:(p:string,b:any)=>Promise<boolean>;setTab:(t:Tab)=>void}){
  const next=(home.shifts||[])[0]; const unread=(home.communications||[]).filter(x=>!x.confirmed).length;
  return <><section className={styles.hero}><strong>{next?'Próximo plantão':'Nenhum plantão pendente'}</strong><span>{next?`${date(next.shift_date)} • ${next.start_time||'horário a definir'} • ${next.location||'local a definir'}`:'Consulte novamente após a publicação da escala.'}</span></section><div className={styles.grid}><div className={styles.metric}><b>{(home.schedule||[]).length}</b><span>itens de escala</span></div><div className={styles.metric}><b>{unread}</b><span>comunicados novos</span></div></div><section className={styles.section}><h2>Acesso rápido</h2><div className={styles.quick}><button onClick={()=>setTab('jornada')}>◷<br/>Minha jornada</button><button onClick={()=>setTab('pedidos')}>＋<br/>Novo pedido</button><button onClick={()=>setTab('documentos')}>▤<br/>Documentos</button></div></section><section className={styles.section}><h2>Comunicados</h2><div className={styles.list}>{(home.communications||[]).slice(0,5).map(item=><article className={styles.item} key={item.id}><div className={styles.itemTop}><div><h3>{item.title}</h3><p>{item.content}</p></div><span className={styles.tag}>{item.confirmed?'lido':'novo'}</span></div>{!item.confirmed&&<button className={`${styles.button} ${styles.secondary}`} onClick={()=>act('/api/employee/actions/communication-read',{communicationId:item.id})}>Confirmar leitura</button>}</article>)}{!(home.communications||[]).length&&<div className={styles.empty}>Sem comunicados.</div>}</div></section><section className={styles.section}><h2>Central de notificações</h2><div className={styles.list}>{(home.notifications||[]).slice(0,10).map(item=><article className={styles.item} key={item.id}><div className={styles.itemTop}><div><h3>{item.title}</h3><p>{item.message}</p></div><span className={styles.tag}>{item.is_read?'lida':'nova'}</span></div></article>)}{!(home.notifications||[]).length&&<div className={styles.empty}>Nenhuma notificação.</div>}</div></section></>;
}
function JourneyTab({home,act}:{home:Home;act:(p:string,b:any)=>Promise<boolean>}){
  return <><section className={styles.section}><h2>Escala publicada</h2><div className={styles.list}>{(home.schedule||[]).map(item=><article className={styles.item} key={item.id}><div className={styles.itemTop}><div><h3>{date(item.entry_date)} • {item.is_day_off?'Folga':'Trabalho'}</h3><p>{item.start_time||'—'}–{item.end_time||'—'} • {item.location||'local a definir'}</p><p>Versão {item.version}: {item.title}</p></div><span className={styles.tag}>{item.acknowledged?'ciente':'pendente'}</span></div>{!item.acknowledged&&<button className={styles.button} onClick={()=>act(`/api/employee/schedule/${item.id}/ack`,{})}>Dar ciência</button>}</article>)}{!(home.schedule||[]).length&&<div className={styles.empty}>A escala publicada aparecerá aqui.</div>}</div></section><section className={styles.section}><h2>Jornada e correções</h2><div className={styles.list}>{(home.journey||[]).map(item=><article className={styles.item} key={item.id}><h3>{date(item.entry_date)} • {item.clock_in||'—'}–{item.clock_out||'—'}</h3><p>{item.hours_worked||0} h • {item.status}</p><CorrectionForm entryId={item.id} act={act}/></article>)}{!(home.journey||[]).length&&<div className={styles.empty}>Sem registros de ponto.</div>}</div></section></>;
}
function CorrectionForm({entryId,act}:{entryId:string;act:(p:string,b:any)=>Promise<boolean>}){const [open,setOpen]=useState(false);if(!open)return <button className={`${styles.button} ${styles.secondary}`} onClick={()=>setOpen(true)}>Solicitar correção</button>;return <form className={styles.form} onSubmit={e=>{e.preventDefault();const fd=new FormData(e.currentTarget);act('/api/employee/actions/time-correction',{timeEntryId:entryId,reason:fd.get('reason'),requestedChanges:{clock_in:fd.get('clockIn'),clock_out:fd.get('clockOut')}}).then(ok=>ok&&setOpen(false));}}><input className={styles.input} name="clockIn" type="time"/><input className={styles.input} name="clockOut" type="time"/><textarea className={styles.textarea} name="reason" minLength={10} placeholder="Explique a correção" required/><button className={styles.button}>Enviar correção</button></form>}
function RequestsTab({home,act}:{home:Home;act:(p:string,b:any)=>Promise<boolean>}){
  const [mode,setMode]=useState<'absence'|'request'|'occurrence'>('absence');
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget,fd=Object.fromEntries(new FormData(form));const path=mode==='absence'?'/api/employee/actions/absence':mode==='request'?'/api/employee/actions/request':'/api/employee/actions/occurrence';const body=mode==='absence'?{noticeType:fd.noticeType,shiftDate:fd.shiftDate,reasonCode:fd.reasonCode,details:fd.details}:mode==='request'?{requestType:fd.requestType,title:fd.title,description:fd.description}:{category:fd.category,severity:fd.severity,title:fd.title,description:fd.description,location:fd.location};if(await act(path,body))form.reset();}
  return <><section className={styles.card}><h2>Novo registro</h2><div className={styles.quick}><button onClick={()=>setMode('absence')}>Ausência</button><button onClick={()=>setMode('request')}>Solicitação</button><button onClick={()=>setMode('occurrence')}>Ocorrência</button></div><form className={styles.form} onSubmit={submit} style={{marginTop:12}}>{mode==='absence'?<><label>Tipo<select className={styles.select} name="noticeType"><option value="ausencia">Ausência</option><option value="atraso">Atraso</option></select></label><label>Data do plantão<input className={styles.input} name="shiftDate" type="date" required/></label><label>Motivo<select className={styles.select} name="reasonCode"><option value="transporte">Transporte</option><option value="doenca">Doença</option><option value="familiar">Familiar</option><option value="pessoal">Pessoal</option><option value="outro">Outro</option></select></label><textarea className={styles.textarea} name="details" placeholder="Detalhes importantes"/></>:mode==='request'?<><label>Assunto<select className={styles.select} name="requestType"><option value="ferias">Férias</option><option value="beneficio">Benefício</option><option value="afastamento">Afastamento</option><option value="reembolso">Reembolso</option><option value="outro">Outro</option></select></label><input className={styles.input} name="title" minLength={5} placeholder="Título" required/><textarea className={styles.textarea} name="description" minLength={10} placeholder="Descreva a solicitação" required/></>:<><div className={styles.grid}><select className={styles.select} name="category"><option value="operacional">Operacional</option><option value="seguranca">Segurança</option><option value="equipamento">Equipamento</option><option value="outro">Outro</option></select><select className={styles.select} name="severity"><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></div><input className={styles.input} name="title" minLength={5} placeholder="Título" required/><textarea className={styles.textarea} name="description" minLength={10} placeholder="O que ocorreu?" required/><input className={styles.input} name="location" placeholder="Local"/></>}<button className={styles.button}>Enviar</button></form></section><section className={styles.section}><h2>Acompanhamento</h2><div className={styles.list}>{[...(home.absences||[]),...(home.requests||[]),...(home.occurrences||[])].slice(0,20).map(item=><article className={styles.item} key={item.id}><div className={styles.itemTop}><div><h3>{item.protocol} • {item.title||item.notice_type||item.request_type}</h3><p>{date(item.created_at||item.occurred_at)}</p></div><span className={styles.tag}>{item.status}</span></div></article>)}</div></section></>;
}
function DocumentsTab({home,act}:{home:Home;act:(p:string,b:any)=>Promise<boolean>}){
  async function upload(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;const fd=new FormData(form);const file=fd.get('file') as File;if(!file?.size)return;const payload=await filePayload(file);if(await act('/api/employee/documents',{...payload,title:fd.get('title'),category:fd.get('category'),documentKind:'submission'}))form.reset();}
  async function proof(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;const fd=new FormData(form);const file=fd.get('file') as File;if(!file?.size)return;const payload=await filePayload(file);if(await act('/api/employee/actions/course-proof',{...payload,title:fd.get('title'),enrollmentId:fd.get('enrollmentId'),proofType:'certificado'}))form.reset();}
  return <><section className={styles.card}><h2>Enviar documento</h2><form className={styles.form} onSubmit={upload}><input className={styles.input} name="title" placeholder="Nome do documento" minLength={3} required/><select className={styles.select} name="category"><option value="admissao">Admissão</option><option value="pessoal">Pessoal</option><option value="solicitacao">Solicitação</option></select><input className={styles.input} name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" required/><button className={styles.button}>Enviar para revisão</button></form></section><section className={styles.section}><h2>Meus documentos e holerites</h2><div className={styles.list}>{(home.documents||[]).map(doc=><article className={styles.item} key={doc.id}><div className={styles.itemTop}><div><h3>{doc.title}</h3><p>{doc.competence||doc.category} • versão {doc.version}</p></div><span className={styles.tag}>{doc.status}</span></div><a className={styles.button} style={{display:'block',textAlign:'center',boxSizing:'border-box'}} href={`/api/employee/documents/${doc.id}/download`}>Baixar</a></article>)}{!(home.documents||[]).length&&<div className={styles.empty}>Nenhum documento disponível.</div>}</div></section>{(home.courses||[]).length>0&&<section className={styles.card} style={{marginTop:20}}><h2>Comprovante de curso</h2><form className={styles.form} onSubmit={proof}><select className={styles.select} name="enrollmentId">{home.courses.map(course=><option key={course.id} value={course.id}>{course.training_name||'Curso'} • {course.status}</option>)}</select><input className={styles.input} name="title" placeholder="Nome do certificado" required/><input className={styles.input} name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" required/><button className={styles.button}>Enviar comprovante</button></form></section>}</>;
}
function MoreTab({home,act}:{home:Home;act:(p:string,b:any)=>Promise<boolean>}){
  return <><section className={styles.card}><h2>Procedimentos do posto</h2><div className={styles.list}>{(home.procedures||[]).map(item=><article className={styles.item} key={item.id}><h3>{item.title} • v{item.version}</h3><p>{item.content}</p>{!item.acknowledged&&<button className={styles.button} onClick={()=>act('/api/employee/actions/procedure-ack',{procedureId:item.id})}>Confirmar ciência</button>}</article>)}</div></section><ActionForm title="Atendimento privado com RH" button="Abrir protocolo" fields={[['title','Assunto'],['description','Descreva sua dúvida']]} onSubmit={v=>act('/api/employee/actions/hr-ticket',{...v,category:'rh',priority:'media'})}/><ActionForm title="Canal confidencial" button="Registrar relato sigiloso" fields={[['title','Assunto'],['description','Relato (mínimo de 20 caracteres)']]} onSubmit={v=>act('/api/employee/actions/confidential',{...v,category:'etica',anonymous:false})}/><ActionForm title="Troca de plantão" button="Solicitar troca" fields={[['targetEmployeeId','Identificador do colega informado pela operação'],['swapDate','Data AAAA-MM-DD'],['reason','Motivo da troca']]} onSubmit={v=>act('/api/employee/actions/shift-swap',v)}/><ActionForm title="Passagem de serviço" button="Registrar passagem" fields={[['toEmployeeId','Identificador de quem recebe'],['pendingTasks','Pendências'],['occurrencesSummary','Resumo das ocorrências']]} onSubmit={v=>act('/api/employee/actions/handover',v)}/><Uniforms home={home} act={act}/><section className={styles.card} style={{marginTop:14}}><h2>Acessibilidade</h2><button className={`${styles.button} ${styles.secondary}`} onClick={()=>act('/api/employee/actions/accessibility',{prefersSimpleLanguage:true,fontSize:'grande',highContrast:true,reducedMotion:true})}>Ativar texto maior e alto contraste</button></section><section className={styles.section}><h2>FAQ interno</h2>{(home.faq||[]).map(item=><details className={styles.item} key={item.id}><summary><b>{item.question}</b></summary><p>{item.answer}</p></details>)}</section></>;
}
function Uniforms({home,act}:{home:Home;act:(p:string,b:any)=>Promise<boolean>}){
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget,fd=Object.fromEntries(new FormData(form));if(await act('/api/employee/actions/uniform',fd))form.reset();}
  return <section className={styles.card} style={{marginTop:14}}><h2>Uniforme, EPI e equipamento</h2><form className={styles.form} onSubmit={submit}><div className={styles.grid}><select className={styles.select} name="requestType"><option value="entrega">Solicitar entrega</option><option value="substituicao">Solicitar troca</option><option value="devolucao">Solicitar devolução</option><option value="outro">Outro</option></select><input className={styles.input} name="size" placeholder="Tamanho, se aplicável"/></div><input className={styles.input} name="quantity" type="number" min="1" max="100" defaultValue="1"/><textarea className={styles.textarea} name="reason" minLength={10} placeholder="Motivo da solicitação" required/><button className={styles.button}>Enviar solicitação</button></form><div className={styles.list} style={{marginTop:12}}>{(home.uniformDeliveries||[]).map(item=><article className={styles.item} key={item.id}><div className={styles.itemTop}><div><h3>{item.item_name||'Item entregue'} • {item.quantity} un.</h3><p>{date(item.delivery_date)} • {item.size||'sem tamanho'} • {item.is_epi?'EPI':item.item_type||'uniforme'}</p></div><span className={styles.tag}>{item.employee_confirmed?'recebido':'a confirmar'}</span></div>{!item.employee_confirmed&&<button className={`${styles.button} ${styles.secondary}`} onClick={()=>act('/api/employee/actions/uniform-receipt',{deliveryId:item.id})}>Confirmar recebimento</button>}</article>)}</div><p className={styles.private}>A confirmação é um recibo operacional no portal; não é assinatura eletrônica qualificada.</p></section>;
}
function ActionForm({title,button,fields,onSubmit}:{title:string;button:string;fields:string[][];onSubmit:(v:any)=>Promise<boolean>}){return <section className={styles.card} style={{marginTop:14}}><h2>{title}</h2><form className={styles.form} onSubmit={async e=>{e.preventDefault();const form=e.currentTarget,values=Object.fromEntries(new FormData(form));if(await onSubmit(values))form.reset();}}>{fields.map(([name,label],i)=>i===fields.length-1?<textarea key={name} className={styles.textarea} name={name} placeholder={label} minLength={name==='description'?20:undefined} required/>:<input key={name} className={styles.input} name={name} placeholder={label} required/>)}<button className={styles.button}>{button}</button></form></section>}
