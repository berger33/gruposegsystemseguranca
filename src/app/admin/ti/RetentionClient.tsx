"use client";
import { useEffect, useState } from "react";

type Policy = { id:string; category:string; field_pattern:string; retention_days:number; description:string; legal_basis:string; disposal_method:string; exceptional_retention_allowed:boolean; max_exception_days:number|null; is_active:boolean; created_at:string; };
type Exception = { id:string; category:string; field_reference:string; reason:string; justification:string; status:string; requested_retention_days:number; approved_retention_days:number|null; expires_at:string; requested_by:string; approved_by:string|null; created_at:string; };
type Job = { id:string; status:string; total_scanned:number; total_expired:number; total_disposed:number; initiated_by:string; created_at:string; finished_at:string|null; notes:string|null; };
type Log = { id:string; category:string; field_reference:string; record_reference_hash:string; disposal_method:string; disposed_at:string; retention_days_applied:number|null; details:string|null; };

const CATS=['identificacao','contato','localizacao','profissional','financeiro','tecnico','comportamental','sensivel','outro'];
const BASIS=['consentimento','execucao_contrato','cumprimento_legal','legitimo_interesse','protecao_vida','tutela_saude','exercicio_direitos','protecao_credito','outro'];
const METHODS=['exclusao_logica','exclusao_fisica','anonimizacao','arquivamento'];
const EX_STATUS=['solicitado','em_analise','aprovado','rejeitado','expirado','revogado'];

export default function RetentionClient(){
  const [policies,setPolicies]=useState<Policy[]>([]);
  const [exceptions,setExceptions]=useState<Exception[]>([]);
  const [jobs,setJobs]=useState<Job[]>([]);
  const [logs,setLogs]=useState<Log[]>([]);
  const [msg,setMsg]=useState<string>('');
  const [policyForm,setPolicyForm]=useState({category:'contato', field_pattern:'*', retention_days:365, description:'', legal_basis:'cumprimento_legal', disposal_method:'exclusao_logica', exceptional_retention_allowed:false, max_exception_days:730});
  const [excForm,setExcForm]=useState({category:'contato', field_reference:'email', reason:'', justification:'', requested_retention_days:180, expires_at:''});
  const [excUpdate,setExcUpdate]=useState({id:'', next_status:'em_analise', approved_retention_days:'', rejection_reason:''});

  async function load(){
    try{
      const [p,e,j,l]=await Promise.all([
        fetch('/api/admin/retention/policies',{credentials:'include'}).then(r=>r.json()),
        fetch('/api/admin/retention/exceptions',{credentials:'include'}).then(r=>r.json()),
        fetch('/api/admin/retention/disposal/jobs',{credentials:'include'}).then(r=>r.json()),
        fetch('/api/admin/retention/disposal/logs',{credentials:'include'}).then(r=>r.json()),
      ]);
      if(p.policies) setPolicies(p.policies);
      if(e.exceptions) setExceptions(e.exceptions);
      if(j.jobs) setJobs(j.jobs);
      if(l.logs) setLogs(l.logs);
    }catch(err:any){ setMsg(String(err)); }
  }
  useEffect(()=>{ load(); },[]);

  async function createPolicy(){
    setMsg('salvando política...');
    const r=await fetch('/api/admin/retention/policies',{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(policyForm)});
    const j=await r.json(); if(!r.ok){ setMsg('erro: '+(j.error||r.status)); return; } setMsg('política salva '+j.policy.id); load();
  }
  async function createException(){
    setMsg('salvando exceção...');
    const r=await fetch('/api/admin/retention/exceptions',{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(excForm)});
    const j=await r.json(); if(!r.ok){ setMsg('erro: '+(j.error||r.status)); return; } setMsg('exceção criada '+j.exception.id); load();
  }
  async function updateException(){
    if(!excUpdate.id){ setMsg('id exceção obrigatório'); return; }
    setMsg('atualizando exceção...');
    const payload:any={ next_status:excUpdate.next_status };
    if(excUpdate.approved_retention_days) payload.approved_retention_days=parseInt(excUpdate.approved_retention_days,10);
    if(excUpdate.rejection_reason) payload.rejection_reason=excUpdate.rejection_reason;
    const r=await fetch(`/api/admin/retention/exceptions/${excUpdate.id}`,{method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const j=await r.json(); if(!r.ok){ setMsg('erro: '+(j.error||JSON.stringify(j))); return; } setMsg('exceção atualizada '+j.exception.status); load();
  }
  async function runJob(){
    setMsg('executando job descarte...');
    const r=await fetch('/api/admin/retention/disposal/jobs',{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({notes:'Job manual via TI'})});
    const j=await r.json(); if(!r.ok){ setMsg('erro job: '+(j.error||r.status)); return; } setMsg(`job ${j.job.id} scanned=${j.job.total_scanned} expired=${j.job.total_expired} disposed=${j.job.total_disposed}`); load();
  }

  return (
    <section style={{margin:'24px 0', padding:16, border:'1px solid #333', borderRadius:8}}>
      <h2>PLT-11 Retenção por categoria & descarte verificável</h2>
      {msg && <p style={{color:'#0af'}}>{msg}</p>}
      <button onClick={load}>Recarregar</button> <button onClick={runJob}>Executar job descarte</button>

      <h3>Políticas ({policies.length})</h3>
      <ul style={{maxHeight:160, overflow:'auto'}}>
        {policies.map(p=><li key={p.id}>{p.category}/{p.field_pattern} {p.retention_days}d {p.legal_basis} {p.disposal_method} {p.exceptional_retention_allowed?'exc-OK':''} {p.is_active?'ativa':'inativa'}</li>)}
      </ul>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:8}}>
        <select value={policyForm.category} onChange={e=>setPolicyForm({...policyForm, category:e.target.value})}>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</select>
        <input placeholder="field_pattern ex: email ou *" value={policyForm.field_pattern} onChange={e=>setPolicyForm({...policyForm, field_pattern:e.target.value})} />
        <input type="number" placeholder="retention_days" value={policyForm.retention_days} onChange={e=>setPolicyForm({...policyForm, retention_days:parseInt(e.target.value,10)||0})} />
        <select value={policyForm.legal_basis} onChange={e=>setPolicyForm({...policyForm, legal_basis:e.target.value})}>{BASIS.map(b=><option key={b} value={b}>{b}</option>)}</select>
        <select value={policyForm.disposal_method} onChange={e=>setPolicyForm({...policyForm, disposal_method:e.target.value})}>{METHODS.map(m=><option key={m} value={m}>{m}</option>)}</select>
        <label><input type="checkbox" checked={policyForm.exceptional_retention_allowed} onChange={e=>setPolicyForm({...policyForm, exceptional_retention_allowed:e.target.checked})} /> excepcional permitido</label>
        <input type="number" placeholder="max_exception_days" value={policyForm.max_exception_days||''} onChange={e=>setPolicyForm({...policyForm, max_exception_days:parseInt(e.target.value,10)||0})} />
        <textarea placeholder="descrição finalidade" value={policyForm.description} onChange={e=>setPolicyForm({...policyForm, description:e.target.value})} style={{gridColumn:'1 / span 2'}} />
      </div>
      <button onClick={createPolicy}>Salvar política (upsert)</button>

      <h3>Exceções retenção ({exceptions.length})</h3>
      <ul style={{maxHeight:160, overflow:'auto'}}>
        {exceptions.map(ex=><li key={ex.id}>{ex.status} {ex.category}/{ex.field_reference} req={ex.requested_retention_days}d apr={ex.approved_retention_days||'-'} exp={ex.expires_at?.slice(0,10)} por={ex.requested_by} motivo={ex.reason.slice(0,60)}</li>)}
      </ul>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
        <select value={excForm.category} onChange={e=>setExcForm({...excForm, category:e.target.value})}>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</select>
        <input placeholder="field_reference ex: contrato_123" value={excForm.field_reference} onChange={e=>setExcForm({...excForm, field_reference:e.target.value})} />
        <input type="number" placeholder="requested_retention_days" value={excForm.requested_retention_days} onChange={e=>setExcForm({...excForm, requested_retention_days:parseInt(e.target.value,10)||0})} />
        <input type="date" value={excForm.expires_at} onChange={e=>setExcForm({...excForm, expires_at:e.target.value})} />
        <textarea placeholder="reason min 10" value={excForm.reason} onChange={e=>setExcForm({...excForm, reason:e.target.value})} />
        <textarea placeholder="justification min 10" value={excForm.justification} onChange={e=>setExcForm({...excForm, justification:e.target.value})} />
      </div>
      <button onClick={createException}>Solicitar exceção formal</button>

      <h4>Atualizar exceção (aprovar/rejeitar/revogar)</h4>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
        <input placeholder="id exceção" value={excUpdate.id} onChange={e=>setExcUpdate({...excUpdate, id:e.target.value})} />
        <select value={excUpdate.next_status} onChange={e=>setExcUpdate({...excUpdate, next_status:e.target.value})}>{EX_STATUS.map(s=><option key={s} value={s}>{s}</option>)}</select>
        <input placeholder="approved_retention_days opcional" value={excUpdate.approved_retention_days} onChange={e=>setExcUpdate({...excUpdate, approved_retention_days:e.target.value})} />
        <textarea placeholder="rejection_reason se rejeitado min10" value={excUpdate.rejection_reason} onChange={e=>setExcUpdate({...excUpdate, rejection_reason:e.target.value})} style={{gridColumn:'1 / span 3'}} />
      </div>
      <button onClick={updateException}>Atualizar status exceção</button>

      <h3>Jobs descarte ({jobs.length})</h3>
      <ul style={{maxHeight:120, overflow:'auto'}}>
        {jobs.map(j=><li key={j.id}>{j.status} scanned={j.total_scanned} expired={j.total_expired} disposed={j.total_disposed} por={j.initiated_by} {j.created_at?.slice(0,19)} {j.finished_at?.slice(0,19)||''} {j.notes||''}</li>)}
      </ul>

      <h3>Logs descarte minimizado ({logs.length}) — histórico com hash referência, sem dado pessoal</h3>
      <ul style={{maxHeight:160, overflow:'auto'}}>
        {logs.map(l=><li key={l.id}>{l.category}/{l.field_reference} hash={l.record_reference_hash.slice(0,12)} {l.disposal_method} {l.retention_days_applied||''}d {l.disposed_at?.slice(0,19)} {l.details?.slice(0,60)||''}</li>)}
      </ul>
      <p style={{fontSize:12, color:'#888'}}>PLT-11: retenção por categoria, descarte em jobs verificáveis, retenção excepcional formal com aprovação/rejeição documentada, histórico minimizado (hash, sem conteúdo pessoal). Seed automático a partir de privacy_data_inventory.</p>
    </section>
  );
}
