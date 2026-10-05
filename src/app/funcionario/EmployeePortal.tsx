'use client';

// UX-06 — Portal do funcionário.
//
// O que esta fatia MUDA: estado honesto de leitura, vocabulário em português,
// rótulos visíveis e associados em todo campo, abas acessíveis de verdade
// (tablist/tab/tabpanel com roving tabindex e ←/→/Home/End) e trava de duplo
// envio.
//
// O que esta fatia NÃO MUDA: nenhuma URL, método, corpo, cabeçalho,
// `Idempotency-Key`, sessão, escopo de dados ou fila offline. A pessoa continua
// vendo apenas os próprios dados, decididos no servidor.
//
// O defeito central corrigido aqui: a versão anterior fazia
// `refresh().catch(() => setSession(null))`. Qualquer falha — 503 de leitura,
// queda de rede, erro de banco — devolvia a TELA DE LOGIN, como se a pessoa não
// estivesse autenticada. Falha virava "não autenticado", que é a variante mais
// cruel de "falha vira zero": a pessoa em plantão concluía que perdeu o acesso.
// Agora só um 401 de sessão leva ao login; qualquer outra falha é dita como
// falha, com o estado anterior preservado e a opção de tentar de novo.

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import UiState from '../../components/ui/UiState';
import { portalRequest, type PortalErrorDescriptor } from '../../lib/portal-request';
import {
  EMPLOYEE_OCCURRENCE_CATEGORIES,
  EMPLOYEE_REQUEST_TYPES,
  EMPLOYEE_SEVERITIES,
  describePortalError,
  employeeItemStatusLabel,
  portalErrorFootnote,
  portalErrorVariant,
  portalShouldSignIn,
} from '../../lib/portal-vocabulary.mjs';
import styles from './EmployeePortal.module.css';

type Session = { employeeId:string; identityId:string; displayName:string; mustChangePassword:boolean };
type Home = Record<string, any[]> & { employeeId?:string };
type Tab = 'inicio'|'jornada'|'pedidos'|'documentos'|'mais';

const TABS: [Tab, string, string][] = [
  ['inicio', '⌂', 'Início'],
  ['jornada', '◷', 'Jornada'],
  ['pedidos', '＋', 'Pedidos'],
  ['documentos', '▤', 'Docs'],
  ['mais', '•••', 'Mais'],
];

/**
 * Mesma requisição de antes — mesma URL, método, corpo, cabeçalhos e
 * `credentials: 'same-origin'`. A diferença é que a falha volta DESCRITA.
 */
async function request(path:string, init:RequestInit={}) {
  const result = await portalRequest<any>(path, init);
  if (!result.ok) {
    const error = new Error(result.error.code || `http_${result.error.status}`) as Error & { descriptor?: PortalErrorDescriptor };
    error.descriptor = result.error;
    throw error;
  }
  return result.data;
}

/** Recupera o descritor já classificado, sem perder a informação do servidor. */
function describeThrown(error:unknown): PortalErrorDescriptor {
  const descriptor = (error as { descriptor?: PortalErrorDescriptor })?.descriptor;
  if (descriptor) return descriptor;
  return describePortalError(null, 0);
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

/** Faixa de falha com título humano, detalhe e o código só no rodapé. */
function ErrorNotice({descriptor,onRetry}:{descriptor:PortalErrorDescriptor;onRetry?:()=>void}){
  return (
    <UiState
      variant={portalErrorVariant(descriptor)}
      title={descriptor.title}
      detail={descriptor.detail}
      onRetry={descriptor.canRetry && onRetry ? onRetry : undefined}
    >
      <p className={styles.footnote}>{portalErrorFootnote(descriptor)}</p>
    </UiState>
  );
}

export default function EmployeePortal(){
  const [session,setSession]=useState<Session|null>(null);
  const [home,setHome]=useState<Home>({});
  // Cinco estados distintos, nunca confundidos entre si.
  const [sessionState,setSessionState]=useState<'loading'|'in'|'out'|'failed'>('loading');
  const [loadError,setLoadError]=useState<PortalErrorDescriptor|null>(null);
  const [tab,setTab]=useState<Tab>('inicio');
  const [message,setMessage]=useState('');
  const [actionError,setActionError]=useState<PortalErrorDescriptor|null>(null);
  const tabRefs=useRef<Record<string,HTMLButtonElement|null>>({});

  const refresh=useCallback(async()=>{
    const s=await request('/api/employee/session');
    const h=await request('/api/employee/home');
    setSession(s); setHome(h); setLoadError(null); setSessionState('in');
  },[]);

  const load=useCallback(()=>{
    setSessionState(current=>current==='in'?current:'loading');
    refresh().catch((error:unknown)=>{
      const descriptor=describeThrown(error);
      // AQUI está a regra: só um 401 de sessão manda a pessoa para o login.
      if(portalShouldSignIn(descriptor)){ setSession(null); setHome({}); setLoadError(null); setSessionState('out'); return; }
      setLoadError(descriptor);
      setSessionState(session?'in':'failed');
    });
  },[refresh,session]);

  useEffect(()=>{ load(); /* uma vez ao montar */ // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{if(!session?.employeeId)return;const employeeId=session.employeeId;const sync=()=>{syncOfflineTasks(employeeId).then(count=>{if(count){setMessage(`${count} tarefa offline recebida pelo servidor.`);refresh().catch(()=>{})}})};window.addEventListener('online',sync);if(navigator.onLine)sync();return()=>window.removeEventListener('online',sync)},[refresh,session?.employeeId]);

  async function act(path:string,body:any,headers:HeadersInit={}){
    setActionError(null); setMessage('');
    const offline=approvedOfflineTask(path,body),employeeId=session?.employeeId||'';
    if(offline&&!employeeId){setActionError(describePortalError('employee_session_required',401));return false;}
    if(offline&&!navigator.onLine){saveOfflineTasks(employeeId,[...offlineTasks(employeeId),offline]);setMessage('Ciência guardada neste dispositivo. Será enviada quando a conexão voltar.');return true;}
    try{ await request(path,{method:'POST',headers,body:JSON.stringify(body)}); setMessage('Recebido com sucesso.'); await refresh(); return true; }
    catch(error:unknown){
      const descriptor=describeThrown(error);
      if(offline&&descriptor.kind==='network'){saveOfflineTasks(employeeId,[...offlineTasks(employeeId),offline]);setMessage('Conexão indisponível: ciência guardada para sincronização.');return true;}
      setActionError(descriptor); return false;
    }
  }
  async function logout(){ await request('/api/employee/session',{method:'DELETE'}).catch(()=>{}); setSession(null); setHome({}); setSessionState('out'); }

  function onTabKeyDown(event:React.KeyboardEvent<HTMLButtonElement>){
    const index=TABS.findIndex(item=>item[0]===tab);
    let next=index;
    if(event.key==='ArrowRight') next=(index+1)%TABS.length;
    else if(event.key==='ArrowLeft') next=(index-1+TABS.length)%TABS.length;
    else if(event.key==='Home') next=0;
    else if(event.key==='End') next=TABS.length-1;
    else return;
    event.preventDefault();
    const target=TABS[next][0];
    setTab(target);
    tabRefs.current[target]?.focus();
  }

  if(sessionState==='loading'){
    return <main className={styles.shell}><div className={styles.login}><div className={styles.loginCard}>
      <UiState variant="loading" title="Verificando o seu acesso seguro" detail="Estamos confirmando a sua sessão individual no servidor." />
    </div></div></main>;
  }
  if(sessionState==='failed'){
    // Falha de leitura NÃO é "não autenticado". A pessoa continua logada; o
    // que faltou foi a resposta do servidor.
    return <main className={styles.shell}><div className={styles.login}><div className={styles.loginCard}>
      <h1>Portal do funcionário</h1>
      <p>Não conseguimos carregar o seu portal agora. Isto não encerrou a sua sessão e não significa que você esteja sem plantão, documento ou pedido.</p>
      {loadError ? <ErrorNotice descriptor={loadError} onRetry={load} /> : null}
    </div></div></main>;
  }
  if(sessionState==='out'||!session) return <Login onLogin={async()=>{setSessionState('loading');load();}}/>;

  const activeTab=TABS.find(item=>item[0]===tab)!;
  return <main className={styles.shell}><div className={styles.app}>
    <header className={styles.header}><div className={styles.brand}>SEG System • acesso próprio</div><div className={styles.headerRow}><div><h1>Olá, {session.displayName?.split(' ')[0]}</h1><p>Seus dados, sua escala e seus pedidos</p></div><button className={styles.logout} onClick={logout}>Sair</button></div></header>
    <div className={styles.content}>
      {message?<div className={styles.notice} role="status" aria-live="polite">{message}</div>:null}
      {actionError?<ErrorNotice descriptor={actionError}/>:null}
      {loadError?<ErrorNotice descriptor={loadError} onRetry={load}/>:null}
      {session.mustChangePassword&&<PasswordCard onDone={async()=>{setMessage('Senha alterada. Entre novamente.');setSession(null);setSessionState('out');}} onError={setActionError}/>}
      {!session.mustChangePassword&&(
        <div
          role="tabpanel"
          id={`portal-painel-${tab}`}
          aria-labelledby={`portal-aba-${tab}`}
          tabIndex={-1}
        >
          <h2 className={styles.visuallyHidden}>{activeTab[2]}</h2>
          {tab==='inicio'&&<HomeTab home={home} act={act} setTab={setTab}/>}
          {tab==='jornada'&&<JourneyTab home={home} act={act}/>}
          {tab==='pedidos'&&<RequestsTab home={home} act={act}/>}
          {tab==='documentos'&&<DocumentsTab home={home} act={act}/>}
          {tab==='mais'&&<MoreTab home={home} act={act}/>}
        </div>
      )}
    </div>
    <div className={styles.tabs} role="tablist" aria-label="Seções do portal do funcionário">
      {TABS.map(([id,icon,label])=>(
        <button
          key={id}
          type="button"
          role="tab"
          id={`portal-aba-${id}`}
          aria-selected={tab===id}
          aria-controls={`portal-painel-${id}`}
          tabIndex={tab === id ? 0 : -1}
          ref={element=>{ tabRefs.current[id]=element; }}
          className={`${styles.tab} ${tab===id?styles.active:''}`}
          onClick={()=>setTab(id)}
          onKeyDown={onTabKeyDown}
        >
          <span className={styles.tabIcon} aria-hidden="true">{icon}</span>{label}
        </button>
      ))}
    </div>
  </div></main>;
}

function Login({onLogin}:{onLogin:()=>Promise<void>}){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<PortalErrorDescriptor|null>(null);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(busy)return;
    setBusy(true);setError(null);
    const fd=new FormData(e.currentTarget);
    try{
      await request('/api/employee/session',{method:'POST',body:JSON.stringify({email:fd.get('email'),password:fd.get('password')})});
      await onLogin();
    }catch(err:unknown){ setError(describeThrown(err)); }
    finally{ setBusy(false); }
  }
  return <main className={styles.shell}><div className={styles.login}><section className={styles.loginCard}><div className={styles.logo}>SEG</div><h1>Portal do funcionário</h1><p>Use somente sua identidade individual. Este acesso não utiliza credenciais de RH.</p>
    {error?<ErrorNotice descriptor={error}/>:null}
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.field}><label htmlFor="portal-email">E-mail</label><input id="portal-email" className={styles.input} name="email" type="email" autoComplete="username" required/></div>
      <div className={styles.field}><label htmlFor="portal-senha">Senha</label><input id="portal-senha" className={styles.input} name="password" type="password" autoComplete="current-password" required/></div>
      <button className={styles.button} disabled={busy} aria-busy={busy}>{busy?'Entrando…':'Entrar com segurança'}</button>
    </form>
    <div className={styles.private}>Sessão individual, revogável e vinculada ao seu cadastro laboral.</div></section></div></main>;
}

function PasswordCard({onDone,onError}:{onDone:()=>void;onError:(d:PortalErrorDescriptor)=>void}){
  const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(busy)return;
    setBusy(true);
    const fd=new FormData(e.currentTarget);
    try{ await request('/api/employee/session/password',{method:'PUT',body:JSON.stringify({currentPassword:fd.get('current'),newPassword:fd.get('next')})}); onDone(); }
    catch(err:unknown){ onError(describeThrown(err)); }
    finally{ setBusy(false); }
  }
  return <section className={styles.card}><h2>Troque a senha temporária</h2><p>Use ao menos 12 caracteres. A troca encerra todas as sessões anteriores.</p>
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.field}><label htmlFor="portal-senha-atual">Senha atual</label><input id="portal-senha-atual" className={styles.input} type="password" name="current" autoComplete="current-password" required/></div>
      <div className={styles.field}><label htmlFor="portal-senha-nova">Nova senha</label><input id="portal-senha-nova" className={styles.input} type="password" name="next" minLength={12} autoComplete="new-password" required aria-describedby="portal-senha-nova-dica"/><p className={styles.hint} id="portal-senha-nova-dica">Mínimo de 12 caracteres.</p></div>
      <button className={styles.button} disabled={busy} aria-busy={busy}>Trocar senha</button>
    </form></section>;
}

/** Selo de situação: o valor canônico é traduzido, o desconhecido passa cru. */
function StatusTag({value}:{value:any}){
  return <span className={styles.tag}>{employeeItemStatusLabel(value)}</span>;
}

function HomeTab({home,act,setTab}:{home:Home;act:(p:string,b:any)=>Promise<boolean>;setTab:(t:Tab)=>void}){
  const next=(home.shifts||[])[0]; const unread=(home.communications||[]).filter(x=>!x.confirmed).length;
  return <><section className={styles.hero}><strong>{next?'Próximo plantão':'Nenhum plantão pendente'}</strong><span>{next?`${date(next.shift_date)} • ${next.start_time||'horário a definir'} • ${next.location||'local a definir'}`:'Consulte novamente após a publicação da escala.'}</span></section>
  <div className={styles.grid}><div className={styles.metric}><b>{(home.schedule||[]).length}</b><span>itens de escala</span></div><div className={styles.metric}><b>{unread}</b><span>comunicados novos</span></div></div>
  <section className={styles.section}><h2>Acesso rápido</h2><div className={styles.quick}><button type="button" onClick={()=>setTab('jornada')}><span aria-hidden="true">◷</span><br/>Minha jornada</button><button type="button" onClick={()=>setTab('pedidos')}><span aria-hidden="true">＋</span><br/>Novo pedido</button><button type="button" onClick={()=>setTab('documentos')}><span aria-hidden="true">▤</span><br/>Documentos</button></div></section>
  <section className={styles.section}><h2>Comunicados</h2><div className={styles.list}>{(home.communications||[]).slice(0,5).map(item=><article className={styles.item} key={item.id}><div className={styles.itemTop}><div><h3>{item.title}</h3><p>{item.content}</p></div><span className={styles.tag}>{item.confirmed?'Lido':'Novo'}</span></div>{!item.confirmed&&<button className={`${styles.button} ${styles.secondary}`} type="button" onClick={()=>act('/api/employee/actions/communication-read',{communicationId:item.id})}>Confirmar leitura</button>}</article>)}
  {!(home.communications||[]).length&&<UiState variant="empty" title="Nenhum comunicado publicado para você" detail="A leitura foi concluída com sucesso: não há comunicado no seu escopo." />}</div></section>
  <section className={styles.section}><h2>Central de notificações</h2><div className={styles.list}>{(home.notifications||[]).slice(0,10).map(item=><article className={styles.item} key={item.id}><div className={styles.itemTop}><div><h3>{item.title}</h3><p>{item.message}</p></div><span className={styles.tag}>{item.is_read?'Lida':'Nova'}</span></div></article>)}
  {!(home.notifications||[]).length&&<UiState variant="empty" title="Nenhuma notificação" detail="A leitura foi concluída com sucesso: não há notificação no seu escopo." />}</div></section></>;
}

function JourneyTab({home,act}:{home:Home;act:(p:string,b:any)=>Promise<boolean>}){
  return <><section className={styles.section}><h2>Escala publicada</h2><div className={styles.list}>{(home.schedule||[]).map(item=><article className={styles.item} key={item.id}><div className={styles.itemTop}><div><h3>{date(item.entry_date)} • {item.is_day_off?'Folga':'Trabalho'}</h3><p>{item.start_time||'—'}–{item.end_time||'—'} • {item.location||'local a definir'}</p><p>Versão {item.version}: {item.title}</p></div><span className={styles.tag}>{item.acknowledged?'Ciente':'Pendente'}</span></div>{!item.acknowledged&&<button className={styles.button} type="button" onClick={()=>act(`/api/employee/schedule/${item.id}/ack`,{})}>Dar ciência</button>}</article>)}
  {!(home.schedule||[]).length&&<UiState variant="empty" title="Nenhum item de escala publicado" detail="Assim que o RH publicar a versão da escala, ela aparece aqui." />}</div></section>
  <section className={styles.section}><h2>Jornada e correções</h2><div className={styles.list}>{(home.journey||[]).map(item=><article className={styles.item} key={item.id}><h3>{date(item.entry_date)} • {item.clock_in||'—'}–{item.clock_out||'—'}</h3><p>{item.hours_worked||0} h • {employeeItemStatusLabel(item.status)}</p><CorrectionForm entryId={item.id} act={act}/></article>)}
  {!(home.journey||[]).length&&<UiState variant="empty" title="Nenhum registro de ponto" detail="A leitura foi concluída com sucesso: não há registro de ponto no período." />}</div></section></>;
}

function CorrectionForm({entryId,act}:{entryId:string;act:(p:string,b:any)=>Promise<boolean>}){
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  if(!open)return <button className={`${styles.button} ${styles.secondary}`} type="button" onClick={()=>setOpen(true)}>Solicitar correção</button>;
  return <form className={styles.form} onSubmit={async e=>{
    e.preventDefault();
    if(busy)return;
    setBusy(true);
    const fd=new FormData(e.currentTarget);
    try{
      const ok=await act('/api/employee/actions/time-correction',{timeEntryId:entryId,reason:fd.get('reason'),requestedChanges:{clock_in:fd.get('clockIn'),clock_out:fd.get('clockOut')}});
      if(ok)setOpen(false);
    } finally { setBusy(false); }
  }}>
    <div className={styles.field}><label htmlFor={`correcao-entrada-${entryId}`}>Entrada correta</label><input id={`correcao-entrada-${entryId}`} className={styles.input} name="clockIn" type="time"/></div>
    <div className={styles.field}><label htmlFor={`correcao-saida-${entryId}`}>Saída correta</label><input id={`correcao-saida-${entryId}`} className={styles.input} name="clockOut" type="time"/></div>
    <div className={styles.field}><label htmlFor={`correcao-motivo-${entryId}`}>Motivo da correção</label><textarea id={`correcao-motivo-${entryId}`} className={styles.textarea} name="reason" minLength={10} required aria-describedby={`correcao-motivo-dica-${entryId}`}/><p className={styles.hint} id={`correcao-motivo-dica-${entryId}`}>Mínimo de 10 caracteres. O texto é lido por quem analisa.</p></div>
    <button className={styles.button} disabled={busy} aria-busy={busy}>Enviar correção</button>
  </form>;
}

function RequestsTab({home,act}:{home:Home;act:(p:string,b:any,headers?:HeadersInit)=>Promise<boolean>}){
  const [mode,setMode]=useState<'absence'|'request'|'occurrence'>('absence');
  const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(busy)return;
    setBusy(true);
    const form=e.currentTarget,fd=Object.fromEntries(new FormData(form)) as Record<string,any>;
    const path=mode==='absence'?'/api/employee/actions/absence':mode==='request'?'/api/employee/actions/request':'/api/employee/actions/occurrence';
    const body=mode==='absence'?{noticeType:fd.noticeType,shiftDate:fd.shiftDate,reasonCode:fd.reasonCode,details:fd.details}:mode==='request'?{requestType:fd.requestType,title:fd.title,description:fd.description}:{category:fd.category,severity:fd.severity,title:fd.title,description:fd.description,location:fd.location};
    const headers:HeadersInit=mode==='request'?{'Idempotency-Key':`employee-request-${crypto.randomUUID()}`} : {};
    try{ if(await act(path,body,headers))form.reset(); } finally { setBusy(false); }
  }
  const entries=[...(home.absences||[]),...(home.requests||[]),...(home.occurrences||[])].slice(0,20);
  return <>
    <section className={styles.card}><h2>Novo registro</h2>
      <div className={styles.quick} role="group" aria-label="Tipo de registro">
        <button type="button" aria-pressed={mode==='absence'} onClick={()=>setMode('absence')}>Ausência</button>
        <button type="button" aria-pressed={mode==='request'} onClick={()=>setMode('request')}>Solicitação</button>
        <button type="button" aria-pressed={mode==='occurrence'} onClick={()=>setMode('occurrence')}>Ocorrência</button>
      </div>
      <form className={styles.form} onSubmit={submit}>
        {mode==='absence'?<>
          <div className={styles.field}><label htmlFor="pedido-tipo-aviso">Tipo de aviso</label><select id="pedido-tipo-aviso" className={styles.select} name="noticeType"><option value="ausencia">Ausência</option><option value="atraso">Atraso</option></select></div>
          <div className={styles.field}><label htmlFor="pedido-data">Data do plantão</label><input id="pedido-data" className={styles.input} name="shiftDate" type="date" required/></div>
          <div className={styles.field}><label htmlFor="pedido-motivo">Motivo</label><select id="pedido-motivo" className={styles.select} name="reasonCode"><option value="transporte">Transporte</option><option value="doenca">Doença</option><option value="familiar">Familiar</option><option value="pessoal">Pessoal</option><option value="outro">Outro</option></select></div>
          <div className={styles.field}><label htmlFor="pedido-detalhes">Detalhes</label><textarea id="pedido-detalhes" className={styles.textarea} name="details" aria-describedby="pedido-detalhes-dica"/><p className={styles.hint} id="pedido-detalhes-dica">Se o motivo for “Outro”, o servidor exige esta explicação.</p></div>
        </>:mode==='request'?<>
          <div className={styles.field}><label htmlFor="pedido-assunto">Assunto</label><select id="pedido-assunto" className={styles.select} name="requestType">{EMPLOYEE_REQUEST_TYPES.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <div className={styles.field}><label htmlFor="pedido-titulo">Título</label><input id="pedido-titulo" className={styles.input} name="title" minLength={5} required aria-describedby="pedido-titulo-dica"/><p className={styles.hint} id="pedido-titulo-dica">Mínimo de 5 caracteres.</p></div>
          <div className={styles.field}><label htmlFor="pedido-descricao">Descrição</label><textarea id="pedido-descricao" className={styles.textarea} name="description" minLength={10} required aria-describedby="pedido-descricao-dica"/><p className={styles.hint} id="pedido-descricao-dica">Mínimo de 10 caracteres.</p></div>
        </>:<>
          <div className={styles.field}><label htmlFor="ocorrencia-categoria">Categoria</label><select id="ocorrencia-categoria" className={styles.select} name="category">{EMPLOYEE_OCCURRENCE_CATEGORIES.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <div className={styles.field}><label htmlFor="ocorrencia-gravidade">Gravidade</label><select id="ocorrencia-gravidade" className={styles.select} name="severity">{EMPLOYEE_SEVERITIES.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <div className={styles.field}><label htmlFor="ocorrencia-titulo">Título</label><input id="ocorrencia-titulo" className={styles.input} name="title" minLength={5} required/></div>
          <div className={styles.field}><label htmlFor="ocorrencia-descricao">O que ocorreu</label><textarea id="ocorrencia-descricao" className={styles.textarea} name="description" minLength={10} required/></div>
          <div className={styles.field}><label htmlFor="ocorrencia-local">Local</label><input id="ocorrencia-local" className={styles.input} name="location"/></div>
        </>}
        <button className={styles.button} disabled={busy} aria-busy={busy}>Enviar</button>
      </form>
    </section>
    <section className={styles.section}><h2>Acompanhamento</h2><div className={styles.list}>{entries.map(item=><article className={styles.item} key={item.id}><div className={styles.itemTop}><div><h3>{item.protocol} • {item.title||item.notice_type||item.request_type}</h3><p>{date(item.created_at||item.occurred_at)}</p></div><StatusTag value={item.status}/></div>{Array.isArray(item.followups)&&item.followups.map((follow:any,index:number)=><p key={`${item.id}-${index}`} className={styles.private}><b>Retorno do RH:</b> {follow.message} <span>• {employeeItemStatusLabel(follow.status)}</span></p>)}</article>)}
    {!entries.length&&<UiState variant="empty" title="Nenhuma solicitação ou registro para acompanhar" detail="A leitura foi concluída com sucesso: você ainda não registrou nada por aqui." />}</div></section></>;
}

function DocumentsTab({home,act}:{home:Home;act:(p:string,b:any)=>Promise<boolean>}){
  const [uploading,setUploading]=useState(false);
  const [sendingProof,setSendingProof]=useState(false);
  async function upload(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(uploading)return;
    const form=e.currentTarget;const fd=new FormData(form);const file=fd.get('file') as File;if(!file?.size)return;
    setUploading(true);
    try{ const payload=await filePayload(file); if(await act('/api/employee/documents',{...payload,title:fd.get('title'),category:fd.get('category'),documentKind:'submission'}))form.reset(); }
    finally{ setUploading(false); }
  }
  async function proof(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(sendingProof)return;
    const form=e.currentTarget;const fd=new FormData(form);const file=fd.get('file') as File;if(!file?.size)return;
    setSendingProof(true);
    try{ const payload=await filePayload(file); if(await act('/api/employee/actions/course-proof',{...payload,title:fd.get('title'),enrollmentId:fd.get('enrollmentId'),proofType:'certificado'}))form.reset(); }
    finally{ setSendingProof(false); }
  }
  return <>
    <section className={styles.card}><h2>Enviar documento</h2>
      <form className={styles.form} onSubmit={upload}>
        <div className={styles.field}><label htmlFor="doc-titulo">Nome do documento</label><input id="doc-titulo" className={styles.input} name="title" minLength={3} required/></div>
        <div className={styles.field}><label htmlFor="doc-categoria">Categoria</label><select id="doc-categoria" className={styles.select} name="category"><option value="admissao">Admissão</option><option value="pessoal">Pessoal</option><option value="solicitacao">Solicitação</option></select></div>
        <div className={styles.field}><label htmlFor="doc-arquivo">Arquivo</label><input id="doc-arquivo" className={styles.input} name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" required aria-describedby="doc-arquivo-dica"/><p className={styles.hint} id="doc-arquivo-dica">PDF, PNG, JPG ou TXT. O arquivo fica privado e o acesso é auditado.</p></div>
        <button className={styles.button} disabled={uploading} aria-busy={uploading}>Enviar para revisão</button>
      </form>
    </section>
    <section className={styles.section}><h2>Meus documentos e holerites</h2><div className={styles.list}>{(home.documents||[]).map(doc=><article className={styles.item} key={doc.id}><div className={styles.itemTop}><div><h3>{doc.title}</h3><p>{doc.competence||doc.category} • versão {doc.version}</p></div><StatusTag value={doc.status}/></div><a className={`${styles.button} ${styles.blockLink}`} href={`/api/employee/documents/${doc.id}/download`}>Baixar<span className={styles.visuallyHidden}> o documento {doc.title}</span></a></article>)}
    {!(home.documents||[]).length&&<UiState variant="empty" title="Nenhum documento disponível" detail="A leitura foi concluída com sucesso: não há documento publicado para você." />}</div></section>
    {(home.courses||[]).length>0&&<section className={`${styles.card} ${styles.spaced}`}><h2>Comprovante de curso</h2>
      <form className={styles.form} onSubmit={proof}>
        <div className={styles.field}><label htmlFor="curso-matricula">Curso</label><select id="curso-matricula" className={styles.select} name="enrollmentId">{home.courses.map(course=><option key={course.id} value={course.id}>{course.training_name||'Curso'} • {employeeItemStatusLabel(course.status)}</option>)}</select></div>
        <div className={styles.field}><label htmlFor="curso-titulo">Nome do certificado</label><input id="curso-titulo" className={styles.input} name="title" required/></div>
        <div className={styles.field}><label htmlFor="curso-arquivo">Arquivo do certificado</label><input id="curso-arquivo" className={styles.input} name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" required/></div>
        <button className={styles.button} disabled={sendingProof} aria-busy={sendingProof}>Enviar comprovante</button>
      </form>
    </section>}
  </>;
}

function MoreTab({home,act}:{home:Home;act:(p:string,b:any)=>Promise<boolean>}){
  return <>
    <section className={styles.card}><h2>Procedimentos do posto</h2><div className={styles.list}>{(home.procedures||[]).map(item=><article className={styles.item} key={item.id}><h3>{item.title} • v{item.version}</h3><p>{item.content}</p>{!item.acknowledged&&<button className={styles.button} type="button" onClick={()=>act('/api/employee/actions/procedure-ack',{procedureId:item.id})}>Confirmar ciência</button>}</article>)}
    {!(home.procedures||[]).length&&<UiState variant="empty" title="Nenhum procedimento publicado para o seu posto" detail="A leitura foi concluída com sucesso: não há procedimento no seu escopo." />}</div></section>
    <ActionForm id="rh" title="Atendimento privado com RH" button="Abrir protocolo" fields={[['title','Assunto'],['description','Descreva sua dúvida']]} onSubmit={v=>act('/api/employee/actions/hr-ticket',{...v,category:'rh',priority:'media'})}/>
    <ActionForm id="confidencial" title="Canal confidencial" button="Registrar relato sigiloso" fields={[['title','Assunto'],['description','Relato']]} hints={{description:'Mínimo de 20 caracteres. O relato é tratado com sigilo e a trilha registra apenas o protocolo.'}} onSubmit={v=>act('/api/employee/actions/confidential',{...v,category:'etica',anonymous:false})}/>
    <ActionForm id="troca" title="Troca de plantão" button="Solicitar troca" fields={[['targetEmployeeId','Identificador do colega informado pela operação'],['swapDate','Data da troca'],['reason','Motivo da troca']]} hints={{swapDate:'Use o formato AAAA-MM-DD.'}} onSubmit={v=>act('/api/employee/actions/shift-swap',v)}/>
    <ActionForm id="passagem" title="Passagem de serviço" button="Registrar passagem" fields={[['toEmployeeId','Identificador de quem recebe'],['pendingTasks','Pendências'],['occurrencesSummary','Resumo das ocorrências']]} onSubmit={v=>act('/api/employee/actions/handover',v)}/>
    <Uniforms home={home} act={act}/>
    <section className={`${styles.card} ${styles.spaced}`}><h2>Acessibilidade</h2><p className={styles.hint}>Aplica texto maior, alto contraste e menos animação à sua conta, em todos os aparelhos.</p><button className={`${styles.button} ${styles.secondary}`} type="button" onClick={()=>act('/api/employee/actions/accessibility',{prefersSimpleLanguage:true,fontSize:'grande',highContrast:true,reducedMotion:true})}>Ativar texto maior e alto contraste</button></section>
    <section className={styles.section}><h2>FAQ interno</h2>{(home.faq||[]).map(item=><details className={styles.item} key={item.id}><summary><b>{item.question}</b></summary><p>{item.answer}</p></details>)}
    {!(home.faq||[]).length&&<UiState variant="empty" title="Nenhuma pergunta publicada" detail="A leitura foi concluída com sucesso: o FAQ interno está vazio." />}</section>
  </>;
}

function Uniforms({home,act}:{home:Home;act:(p:string,b:any)=>Promise<boolean>}){
  const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(busy)return;
    setBusy(true);
    const form=e.currentTarget,fd=Object.fromEntries(new FormData(form));
    try{ if(await act('/api/employee/actions/uniform',fd))form.reset(); } finally { setBusy(false); }
  }
  return <section className={`${styles.card} ${styles.spaced}`}><h2>Uniforme, EPI e equipamento</h2>
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.field}><label htmlFor="uniforme-tipo">Tipo de pedido</label><select id="uniforme-tipo" className={styles.select} name="requestType"><option value="entrega">Solicitar entrega</option><option value="substituicao">Solicitar troca</option><option value="devolucao">Solicitar devolução</option><option value="outro">Outro</option></select></div>
      <div className={styles.field}><label htmlFor="uniforme-tamanho">Tamanho</label><input id="uniforme-tamanho" className={styles.input} name="size" aria-describedby="uniforme-tamanho-dica"/><p className={styles.hint} id="uniforme-tamanho-dica">Preencha apenas se aplicável ao item.</p></div>
      <div className={styles.field}><label htmlFor="uniforme-quantidade">Quantidade</label><input id="uniforme-quantidade" className={styles.input} name="quantity" type="number" min="1" max="100" defaultValue="1"/></div>
      <div className={styles.field}><label htmlFor="uniforme-motivo">Motivo da solicitação</label><textarea id="uniforme-motivo" className={styles.textarea} name="reason" minLength={10} required/></div>
      <button className={styles.button} disabled={busy} aria-busy={busy}>Enviar solicitação</button>
    </form>
    <div className={`${styles.list} ${styles.spacedList}`}>{(home.uniformDeliveries||[]).map(item=><article className={styles.item} key={item.id}><div className={styles.itemTop}><div><h3>{item.item_name||'Item entregue'} • {item.quantity} un.</h3><p>{date(item.delivery_date)} • {item.size||'sem tamanho'} • {item.is_epi?'EPI':item.item_type||'uniforme'}</p></div><span className={styles.tag}>{item.employee_confirmed?'Recebido':'A confirmar'}</span></div>{!item.employee_confirmed&&<button className={`${styles.button} ${styles.secondary}`} type="button" onClick={()=>act('/api/employee/actions/uniform-receipt',{deliveryId:item.id})}>Confirmar recebimento</button>}</article>)}</div>
    <p className={styles.private}>A confirmação é um recibo operacional no portal; não é assinatura eletrônica qualificada.</p></section>;
}

function ActionForm({id,title,button,fields,hints,onSubmit}:{id:string;title:string;button:string;fields:string[][];hints?:Record<string,string>;onSubmit:(v:any)=>Promise<boolean>}){
  const [busy,setBusy]=useState(false);
  return <section className={`${styles.card} ${styles.spaced}`}><h2>{title}</h2>
    <form className={styles.form} onSubmit={async e=>{
      e.preventDefault();
      if(busy)return;
      setBusy(true);
      const form=e.currentTarget,values=Object.fromEntries(new FormData(form));
      try{ if(await onSubmit(values))form.reset(); } finally { setBusy(false); }
    }}>
      {fields.map(([name,label],index)=>{
        const fieldId=`${id}-${name}`;
        const hint=hints?.[name];
        const last=index===fields.length-1;
        return <div className={styles.field} key={name}>
          <label htmlFor={fieldId}>{label}</label>
          {last
            ? <textarea id={fieldId} className={styles.textarea} name={name} minLength={name==='description'?20:undefined} required aria-describedby={hint?`${fieldId}-dica`:undefined}/>
            : <input id={fieldId} className={styles.input} name={name} required aria-describedby={hint?`${fieldId}-dica`:undefined}/>}
          {hint?<p className={styles.hint} id={`${fieldId}-dica`}>{hint}</p>:null}
        </div>;
      })}
      <button className={styles.button} disabled={busy} aria-busy={busy}>{button}</button>
    </form></section>;
}
