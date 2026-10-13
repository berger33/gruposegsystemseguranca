'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import styles from './EmployeePortal.module.css';
import {portalRequest} from '@/lib/portal-request';
const labels:Record<string,string>={entrada:'Entrada',saida_intervalo:'Início do intervalo',retorno_intervalo:'Fim do intervalo',saida:'Saída'};
type Punch={id:string;kind:string;recorded_at:string;latitude:number;longitude:number;accuracy_m:number;request_hash:string;address_label:string|null;address_status:string;address_provider:string|null};
type Correction={id:string;time_entry_id:string;reason:string;status:string;rejection_reason?:string;created_at:string};
type Data={allowedKinds:string[];punches:Punch[];corrections:Correction[];hereAddressEnabled:boolean;hereConsentAccepted:boolean};
export default function EmployeeTimeClock({onRecorded,revision}:{onRecorded:()=>Promise<void>;revision:unknown}){
 const [data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const lock=useRef(false),pending=useRef<{kind:string;requestId:string;position:{latitude:number;longitude:number;accuracy:number;positionAt:string}}|null>(null);
 const load=useCallback(async()=>{setLoading(true);try{const r=await fetch('/api/employee/time-clock',{cache:'no-store'});if(!r.ok)throw Error('Não foi possível consultar as marcações. Confira sua sessão e tente novamente.');setData(await r.json());}catch(e){setData(null);setMessage(e instanceof Error?e.message:'Leitura indisponível.');}finally{setLoading(false);}},[]);
 useEffect(()=>{void load();},[load,revision]);
 async function updateHereConsent(accepted:boolean){
  setBusy(true);setMessage('');
  try{const result=await portalRequest('/api/employee/here-consent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accepted})});if(!result.ok)throw Error(`${result.error.title}. ${result.error.detail}`);setData(current=>current?{...current,hereConsentAccepted:accepted}:current);setMessage(accepted?'Aceite do HERE registrado. A decisão pode ser revogada a qualquer momento.':'Consulta ao HERE desativada para suas próximas marcações.');}
  catch(error){setMessage(error instanceof Error?error.message:'Não foi possível salvar sua decisão.');}
  finally{setBusy(false);}
 }
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
 return <section className={`${styles.section} ${styles.timeClock}`} aria-busy={loading||busy} aria-labelledby="employee-time-clock-title"><h2 id="employee-time-clock-title">Registrar ponto com localização</h2><p className={styles.hint}>A localização é solicitada somente ao marcar o ponto. Não há rastreamento contínuo. O horário oficial vem do servidor, no fuso de São Paulo. A precisão informada pelo dispositivo aparece no comprovante.</p>
 {data?.hereAddressEnabled?<div className={styles.private}><label><input type="checkbox" checked={data.hereConsentAccepted} disabled={busy||loading} onChange={event=>void updateHereConsent(event.target.checked)}/> Concordo que as coordenadas de cada marcação sejam enviadas ao HERE para procurar o endereço. Li e aceito os <a href="https://legal.here.com/terms/here-end-user-terms" target="_blank" rel="noreferrer">Termos de Usuário do HERE</a> e a <a href="https://legal.here.com/privacy" target="_blank" rel="noreferrer">Política de Privacidade do HERE</a>. Você pode desmarcar para revogar o aceite; sua marcação continuará funcionando sem consulta externa.</label></div>:<p className={styles.private}>Consulta de endereço HERE não configurada. O ponto será registrado somente com coordenadas, precisão e comprovante.</p>}
 {loading&&<p role="status">Consultando ponto…</p>}{!loading&&!data&&<div className={styles.clockError} role="alert"><strong>Não foi possível consultar seu ponto.</strong><p>{message||'Sua jornada não foi alterada. Confira a conexão e tente novamente.'}</p><button type="button" className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={()=>void load()}>Tentar carregar novamente</button></div>}
 {data&&<><h3 className={styles.clockSubheading}>Próxima marcação</h3><div className={styles.quick}>{Object.entries(labels).map(([kind,label])=><button type="button" className={styles.clockAction} key={kind} disabled={busy||loading||!data.allowedKinds.includes(kind)} onClick={()=>void punch(kind)}>{label}</button>)}</div></>}
 <p className={styles.clockMessage} role="status" aria-live="polite">{message}</p>{data&&<button type="button" className={`${styles.button} ${styles.secondary}`} disabled={busy||loading} onClick={()=>void load()}>Atualizar marcações</button>}
 {data&&<><h3 className={styles.clockSubheading}>Comprovantes de marcação</h3>{data.punches.length?<div className={styles.list}>{data.punches.map(p=><article className={`${styles.item} ${styles.punchReceipt}`} key={p.id}><h4>{labels[p.kind]||p.kind}<span>{new Date(p.recorded_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</span></h4><p className={styles.punchLocation}>Localização do dispositivo: {p.latitude.toFixed(5)}, {p.longitude.toFixed(5)} · precisão aproximada {Math.round(p.accuracy_m)} m</p><p className={styles.punchAddress}>{p.address_label?`Endereço retornado pelo HERE: ${p.address_label}`:p.address_status==='not_configured'?'Consulta de endereço não configurada; as coordenadas foram mantidas no comprovante.':p.address_status==='not_requested'?'Endereço não consultado nesta marcação; as coordenadas não foram enviadas ao HERE.':p.address_status==='unavailable'?'O serviço de endereço estava indisponível; a marcação e as coordenadas foram preservadas.':'O HERE não localizou um endereço para estas coordenadas.'}</p><details className={styles.punchTechnical}><summary>Detalhes do comprovante</summary><dl><dt>Identificador do registro</dt><dd>{p.id}</dd><dt>Hash SHA-256 da solicitação</dt><dd>{p.request_hash}</dd></dl></details></article>)}</div>:<p>Nenhuma marcação registrada nesta jornada.</p>}
 <h3 className={styles.clockSubheading}>Meus pedidos de ajuste</h3>{data.corrections.length?<div className={styles.list}>{data.corrections.map(c=><article className={`${styles.item} ${styles.correctionItem}`} key={c.id}><h4>{c.status==='solicitado'?'Aguardando análise do RH':c.status==='em_analise'?'Em análise pelo RH':c.status==='aprovado'?'Ajuste aprovado pelo RH':c.status==='rejeitado'?'Ajuste rejeitado pelo RH':c.status}</h4><p><strong>Pedido enviado:</strong> {new Date(c.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</p><p><strong>O que você informou:</strong> {c.reason}</p>{c.rejection_reason&&<p><strong>Motivo informado pelo RH:</strong> {c.rejection_reason}</p>}<p className={styles.correctionNote}>O pedido não altera as marcações originais. Se aprovado, o RH registra o ajuste e mantém o histórico.</p></article>)}</div>:<p>Nenhum pedido de ajuste enviado para esta jornada.</p>}</>}
 </section>;
}
