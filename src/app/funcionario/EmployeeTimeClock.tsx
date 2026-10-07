'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import styles from './EmployeePortal.module.css';
import {portalRequest} from '@/lib/portal-request';
const labels:Record<string,string>={entrada:'Entrada',saida_intervalo:'Início do intervalo',retorno_intervalo:'Fim do intervalo',saida:'Saída'};
type Punch={id:string;kind:string;recorded_at:string;latitude:number;longitude:number;accuracy_m:number};
type Correction={id:string;time_entry_id:string;reason:string;status:string;rejection_reason?:string;created_at:string};
type Data={allowedKinds:string[];punches:Punch[];corrections:Correction[]};
export default function EmployeeTimeClock({onRecorded,revision}:{onRecorded:()=>Promise<void>;revision:unknown}){
 const [data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const lock=useRef(false),pending=useRef<{kind:string;requestId:string;position:{latitude:number;longitude:number;accuracy:number;positionAt:string}}|null>(null);
 const load=useCallback(async()=>{setLoading(true);try{const r=await fetch('/api/employee/time-clock',{cache:'no-store'});if(!r.ok)throw Error('Não foi possível consultar as marcações. Confira sua sessão e tente novamente.');setData(await r.json());}catch(e){setData(null);setMessage(e instanceof Error?e.message:'Leitura indisponível.');}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load,revision]);
 async function punch(kind:string){
  if(lock.current)return;lock.current=true;setBusy(true);setMessage('');
  try{
   if(pending.current&&pending.current.kind!==kind){setMessage('Primeiro repita a marcação anterior para confirmar se ela foi recebida.');return;}
   if(!pending.current){
    if(!window.isSecureContext)throw Error('A localização exige HTTPS ou localhost. Abra o link seguro do sistema.');
    if(!navigator.geolocation)throw Error('Seu navegador não oferece localização. Procure o RH para registrar a ocorrência.');
    const p=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:0}));
    pending.current={kind,requestId:crypto.randomUUID(),position:{latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,positionAt:new Date(p.timestamp).toISOString()}};
   }
   const result=await portalRequest('/api/employee/time-clock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending.current)});
   if(result.ok){pending.current=null;setMessage('Marcação confirmada pelo servidor.');await load();try{await onRecorded();}catch{setMessage('Marcação confirmada. Não foi possível atualizar o restante da jornada; atualize a página.');}}
   else if(result.error.status>=400&&result.error.status<500){pending.current=null;setMessage(`${result.error.title}. ${result.error.detail}`);await load();}
   else setMessage('Sem confirmação. Repita a mesma marcação: a repetição usa o mesmo identificador e não duplica o registro.');
  }catch(e){const code=(e as GeolocationPositionError)?.code;setMessage(code===1?'Localização não autorizada. Permita a localização nas configurações do navegador e tente novamente.':code===2||code===3?'Não foi possível obter sua localização. Tente novamente em um local com melhor sinal.':e instanceof Error?e.message:'Marcação não concluída.');}
  finally{setBusy(false);lock.current=false;}
 }
 return <section className={styles.section} aria-busy={loading||busy}><h2>Registrar ponto com localização</h2><p className={styles.hint}>A localização é solicitada somente ao marcar o ponto. Não há rastreamento contínuo. O horário oficial vem do servidor, no fuso de São Paulo. A precisão informada pelo dispositivo aparece no comprovante.</p>
 {loading&&<p role="status">Consultando ponto…</p>}<div className={styles.quick}>{Object.entries(labels).map(([kind,label])=><button type="button" className={styles.button} key={kind} disabled={busy||loading||!data?.allowedKinds.includes(kind)} onClick={()=>void punch(kind)}>{label}</button>)}</div>
 <p role="status">{message}</p><button type="button" className={`${styles.button} ${styles.secondary}`} disabled={busy||loading} onClick={()=>void load()}>Atualizar marcações</button>
 {data&&<><h3>Comprovantes de marcação</h3><div className={styles.list}>{data.punches.map(p=><article className={styles.item} key={p.id}><h4>{labels[p.kind]} · {new Date(p.recorded_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</h4><p>Localização: {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)} · precisão aproximada {Math.round(p.accuracy_m)} m</p><small>Comprovante: {p.id}</small></article>)}</div>{!data.punches.length&&<p>Nenhuma marcação registrada.</p>}
 <h3>Meus pedidos de ajuste</h3><div className={styles.list}>{data.corrections.map(c=><article className={styles.item} key={c.id}><h4>{c.status==='solicitado'?'Aguardando RH':c.status==='em_analise'?'Em análise':c.status==='aprovado'?'Aprovado':c.status==='rejeitado'?'Rejeitado':c.status}</h4><p>{c.reason}</p>{c.rejection_reason&&<p>Motivo da rejeição: {c.rejection_reason}</p>}</article>)}</div>{!data.corrections.length&&<p>Nenhum pedido de ajuste.</p>}</>}
 </section>;
}
