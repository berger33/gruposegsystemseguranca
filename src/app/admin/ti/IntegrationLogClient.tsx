"use client";
import { useEffect, useState } from "react";

type Job={ id:string; job_type:string; status:string; source:string; target:string; total_records:number; processed_records:number; success_records:number; error_records:number; rate_limit_per_minute:number|null; retry_count:number; created_at:string; };
type Log={ id:string; integration_name:string; direction:string; endpoint:string|null; method:string|null; response_status:number|null; duration_ms:number|null; is_error:boolean; error_message:string|null; created_at:string; };
type Webhook={ id:string; name:string; url:string; events:string[]; is_active:boolean; rate_limit_per_minute:number; max_retries:number; timeout_ms:number; created_at:string; };
type Delivery={ id:string; webhook_id:string; event_type:string; status:string; response_status:number|null; retry_count:number; error_message:string|null; created_at:string; delivered_at:string|null; };
type Recon={ id:string; source:string; target:string; total_source:number; total_target:number; matched:number; mismatched:number; missing_in_target:number; missing_in_source:number; created_at:string; };

const JOB_TYPES=['import','export','webhook','sync','reconciliacao'];

export default function IntegrationLogClient(){
  const [jobs,setJobs]=useState<Job[]>([]);
  const [logs,setLogs]=useState<Log[]>([]);
  const [webhooks,setWebhooks]=useState<Webhook[]>([]);
  const [deliveries,setDeliveries]=useState<Delivery[]>([]);
  const [recons,setRecons]=useState<Recon[]>([]);
  const [msg,setMsg]=useState('');
  const [jobForm,setJobForm]=useState({job_type:'import', source:'crm_companies', target:'external_erp', total_records:100, rate_limit_per_minute:60, max_retries:3, file_reference:''});
  const [whForm,setWhForm]=useState({name:'ERP Sync', url:'https://example.com/webhook', secret:'supersecret', events:'lead.created,contract.activated', rate_limit_per_minute:60, max_retries:3, timeout_ms:10000});
  const [deliveryForm,setDeliveryForm]=useState({webhook_id:'', event_type:'lead.created', payload:'{"id":"123","type":"lead.created"}'});
  const [reconForm,setReconForm]=useState({source:'crm_companies', target:'external_erp', total_source:100, total_target:98, matched:95, mismatched:3, missing_in_target:2, missing_in_source:0});

  async function load(){
    try{
      const [j,l,w,d,r]=await Promise.all([
        fetch('/api/admin/integrations/jobs',{credentials:'include'}).then(r=>r.json()),
        fetch('/api/admin/integrations/logs',{credentials:'include'}).then(r=>r.json()),
        fetch('/api/admin/integrations/webhooks',{credentials:'include'}).then(r=>r.json()),
        fetch('/api/admin/integrations/webhooks/deliveries',{credentials:'include'}).then(r=>r.json()),
        fetch('/api/admin/integrations/reconciliation',{credentials:'include'}).then(r=>r.json()),
      ]);
      if(j.jobs) setJobs(j.jobs);
      if(l.logs) setLogs(l.logs);
      if(w.webhooks) setWebhooks(w.webhooks);
      if(d.deliveries) setDeliveries(d.deliveries);
      if(r.reports) setRecons(r.reports);
    }catch(e:any){ setMsg(String(e)); }
  }
  useEffect(()=>{ load(); },[]);

  async function createJob(){
    setMsg('criando job integração...');
    const r=await fetch('/api/admin/integrations/jobs',{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(jobForm)});
    const j=await r.json(); if(!r.ok){ setMsg('erro job: '+(j.error||r.status)); return; } setMsg('job criado '+j.job.id+' status='+j.job.status+' processed='+j.job.processed_records); load();
  }
  async function createWebhook(){
    setMsg('criando webhook...');
    const payload={...whForm, events: whForm.events.split(',').map(s=>s.trim()).filter(Boolean)};
    const r=await fetch('/api/admin/integrations/webhooks',{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const j=await r.json(); if(!r.ok){ setMsg('erro wh: '+(j.error||r.status)); return; } setMsg('webhook criado '+j.webhook.id); load();
  }
  async function toggleWebhook(id:string, is_active:boolean){
    const r=await fetch('/api/admin/integrations/webhooks',{method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, is_active})});
    const j=await r.json(); if(!r.ok){ setMsg('erro toggle: '+(j.error||r.status)); return; } setMsg('webhook '+(is_active?'ativado':'desativado')); load();
  }
  async function deliverWebhook(){
    if(!deliveryForm.webhook_id){ setMsg('webhook_id obrigatório'); return; }
    let payload:any; try{ payload=JSON.parse(deliveryForm.payload); }catch{ setMsg('payload JSON inválido'); return; }
    setMsg('enviando webhook autenticado...');
    const r=await fetch('/api/admin/integrations/webhooks/deliveries',{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({webhook_id:deliveryForm.webhook_id, event_type:deliveryForm.event_type, payload})});
    const j=await r.json(); if(!r.ok){ setMsg('erro delivery: '+(j.error||JSON.stringify(j))); return; } setMsg('delivery enviado status='+j.delivery.status+' signature='+(j.delivery.request_signature?.slice(0,16)||'none')+' retry='+j.delivery.retry_count); load();
  }
  async function createRecon(){
    setMsg('criando relatório reconciliação...');
    const r=await fetch('/api/admin/integrations/reconciliation',{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(reconForm)});
    const j=await r.json(); if(!r.ok){ setMsg('erro recon: '+(j.error||r.status)); return; } setMsg('reconciliation criado matched='+j.report.matched+' mismatched='+j.report.mismatched); load();
  }

  return (
    <section style={{margin:'24px 0', padding:16, border:'1px solid #333', borderRadius:8}}>
      <h2>PLT-15 Importação/exportação, logs integração, limites, webhooks autenticados, retries e reconciliação</h2>
      {msg && <p style={{color:'#0af'}}>{msg}</p>}
      <button onClick={load}>Recarregar</button>

      <h3>Jobs integração ({jobs.length}) — import/export/sync com limites e retries</h3>
      <ul style={{maxHeight:120, overflow:'auto'}}>
        {jobs.map(j=><li key={j.id}>{j.status} {j.job_type} {j.source}→{j.target} total={j.total_records} proc={j.processed_records} ok={j.success_records} err={j.error_records} rate={j.rate_limit_per_minute||'-'}/min retry={j.retry_count} {j.created_at.slice(0,19)}</li>)}
      </ul>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
        <select value={jobForm.job_type} onChange={e=>setJobForm({...jobForm, job_type:e.target.value})}>{JOB_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select>
        <input placeholder="source" value={jobForm.source} onChange={e=>setJobForm({...jobForm, source:e.target.value})} />
        <input placeholder="target" value={jobForm.target} onChange={e=>setJobForm({...jobForm, target:e.target.value})} />
        <input type="number" placeholder="total_records" value={jobForm.total_records} onChange={e=>setJobForm({...jobForm, total_records:parseInt(e.target.value,10)||0})} />
        <input type="number" placeholder="rate_limit/min" value={jobForm.rate_limit_per_minute} onChange={e=>setJobForm({...jobForm, rate_limit_per_minute:parseInt(e.target.value,10)||0})} />
        <input type="number" placeholder="max_retries" value={jobForm.max_retries} onChange={e=>setJobForm({...jobForm, max_retries:parseInt(e.target.value,10)||0})} />
        <input placeholder="file_reference opcional" value={jobForm.file_reference} onChange={e=>setJobForm({...jobForm, file_reference:e.target.value})} style={{gridColumn:'1 / span 3'}} />
      </div>
      <button onClick={createJob}>Criar job (simula execução com log)</button>

      <h3>Logs integração ({logs.length}) — request/response sanitizado, duração, erro</h3>
      <ul style={{maxHeight:120, overflow:'auto'}}>
        {logs.map(l=><li key={l.id}>{l.is_error?'ERRO':'OK'} {l.direction} {l.integration_name} {l.method||''} {l.endpoint||''} status={l.response_status||'-'} {l.duration_ms||'-'}ms {l.error_message?.slice(0,60)||''} {l.created_at.slice(0,19)}</li>)}
      </ul>

      <h3>Webhooks ({webhooks.length}) — autenticados HMAC, limites, retries</h3>
      <ul style={{maxHeight:120, overflow:'auto'}}>
        {webhooks.map(w=><li key={w.id}>{w.is_active?'ATIVO':'INATIVO'} {w.name} {w.url} events={w.events.join(',')} rate={w.rate_limit_per_minute}/min retries={w.max_retries} timeout={w.timeout_ms}ms <button onClick={()=>toggleWebhook(w.id, !w.is_active)}>{w.is_active?'Desativar':'Ativar'}</button> <button onClick={()=>setDeliveryForm({...deliveryForm, webhook_id:w.id})}>Usar p/ delivery</button></li>)}
      </ul>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
        <input placeholder="name webhook" value={whForm.name} onChange={e=>setWhForm({...whForm, name:e.target.value})} />
        <input placeholder="url https://..." value={whForm.url} onChange={e=>setWhForm({...whForm, url:e.target.value})} />
        <input placeholder="secret para HMAC (armazenado hash)" value={whForm.secret} onChange={e=>setWhForm({...whForm, secret:e.target.value})} />
        <input placeholder="events vírgula ex: lead.created,contract.activated" value={whForm.events} onChange={e=>setWhForm({...whForm, events:e.target.value})} />
        <input type="number" placeholder="rate_limit_per_minute" value={whForm.rate_limit_per_minute} onChange={e=>setWhForm({...whForm, rate_limit_per_minute:parseInt(e.target.value,10)||0})} />
        <input type="number" placeholder="max_retries" value={whForm.max_retries} onChange={e=>setWhForm({...whForm, max_retries:parseInt(e.target.value,10)||0})} />
        <input type="number" placeholder="timeout_ms" value={whForm.timeout_ms} onChange={e=>setWhForm({...whForm, timeout_ms:parseInt(e.target.value,10)||0})} />
      </div>
      <button onClick={createWebhook}>Criar webhook autenticado</button>

      <h4>Deliveries ({deliveries.length}) — retry, assinatura HMAC, rate limit</h4>
      <ul style={{maxHeight:120, overflow:'auto'}}>
        {deliveries.map(d=><li key={d.id}>{d.status} {d.event_type} webhook={d.webhook_id.slice(0,8)} resp={d.response_status||'-'} retry={d.retry_count} err={d.error_message?.slice(0,40)||''} {d.created_at.slice(0,19)} delivered={d.delivered_at?.slice(0,19)||'-'}</li>)}
      </ul>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
        <input placeholder="webhook_id" value={deliveryForm.webhook_id} onChange={e=>setDeliveryForm({...deliveryForm, webhook_id:e.target.value})} />
        <input placeholder="event_type ex: lead.created" value={deliveryForm.event_type} onChange={e=>setDeliveryForm({...deliveryForm, event_type:e.target.value})} />
        <textarea placeholder='payload JSON ex: {"id":"123"}' value={deliveryForm.payload} onChange={e=>setDeliveryForm({...deliveryForm, payload:e.target.value})} style={{gridColumn:'1 / span 2'}} />
      </div>
      <button onClick={deliverWebhook}>Enviar webhook (verifica rate limit, gera HMAC, log)</button>

      <h3>Reconciliação ({recons.length}) — source vs target matched/mismatched/missing</h3>
      <ul style={{maxHeight:120, overflow:'auto'}}>
        {recons.map(r=><li key={r.id}>{r.source}→{r.target} src={r.total_source} tgt={r.total_target} matched={r.matched} mismatched={r.mismatched} miss_tgt={r.missing_in_target} miss_src={r.missing_in_source} {r.created_at.slice(0,19)}</li>)}
      </ul>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
        <input placeholder="source" value={reconForm.source} onChange={e=>setReconForm({...reconForm, source:e.target.value})} />
        <input placeholder="target" value={reconForm.target} onChange={e=>setReconForm({...reconForm, target:e.target.value})} />
        <input type="number" placeholder="total_source" value={reconForm.total_source} onChange={e=>setReconForm({...reconForm, total_source:parseInt(e.target.value,10)||0})} />
        <input type="number" placeholder="total_target" value={reconForm.total_target} onChange={e=>setReconForm({...reconForm, total_target:parseInt(e.target.value,10)||0})} />
        <input type="number" placeholder="matched" value={reconForm.matched} onChange={e=>setReconForm({...reconForm, matched:parseInt(e.target.value,10)||0})} />
        <input type="number" placeholder="mismatched" value={reconForm.mismatched} onChange={e=>setReconForm({...reconForm, mismatched:parseInt(e.target.value,10)||0})} />
        <input type="number" placeholder="missing_in_target" value={reconForm.missing_in_target} onChange={e=>setReconForm({...reconForm, missing_in_target:parseInt(e.target.value,10)||0})} />
        <input type="number" placeholder="missing_in_source" value={reconForm.missing_in_source} onChange={e=>setReconForm({...reconForm, missing_in_source:parseInt(e.target.value,10)||0})} />
      </div>
      <button onClick={createRecon}>Criar relatório reconciliação</button>
      <p style={{fontSize:12, color:'#888'}}>PLT-15: importação/exportação com jobs, logs integração com request/response sanitizado duração erro retry, webhooks com secret hash HMAC assinatura, rate_limit por minuto, max_retries, timeout, deliveries com retry_count next_retry_at, reconciliação source vs target matched/mismatched/missing, auditoria completa.</p>
    </section>
  );
}
