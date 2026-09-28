"use client";
import { useEffect, useState } from "react";

type Env={ id:string; name:string; env_type:string; status:string; db_name:string; db_user:string; storage_bucket:string; domain:string|null; is_production:boolean; has_real_data:boolean; isolation_verified_at:string|null; isolation_verified_by:string|null; notes:string|null; };
type Check={ id:string; env_id:string; check_type:string; status:string; details:any; checked_by:string|null; checked_at:string; };

const ENV_TYPES=['development','homologation','production','preview'];
const CHECK_TYPES=['real_data_scan','preview_data_check','isolation_verify','account_separation'];

export default function EnvClient(){
  const [envs,setEnvs]=useState<Env[]>([]);
  const [checks,setChecks]=useState<Check[]>([]);
  const [msg,setMsg]=useState('');
  const [form,setForm]=useState({name:'', env_type:'development', db_name:'', db_user:'', storage_bucket:'', domain:'', is_production:false, has_real_data:false, notes:''});
  const [checkForm,setCheckForm]=useState({env_id:'', check_type:'isolation_verify', status:'passou', details:'{"verified": true, "accounts_separated": true}'});

  async function load(){
    try{
      const [e,c]=await Promise.all([
        fetch('/api/admin/environments',{credentials:'include'}).then(r=>r.json()),
        fetch('/api/admin/environments/checks',{credentials:'include'}).then(r=>r.json()),
      ]);
      if(e.environments) setEnvs(e.environments);
      if(c.checks) setChecks(c.checks);
    }catch(err:any){ setMsg(String(err)); }
  }
  useEffect(()=>{ load(); },[]);

  async function createEnv(){
    const r=await fetch('/api/admin/environments',{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form)});
    const j=await r.json(); if(!r.ok){ setMsg('erro env: '+(j.error||r.status)); return; } setMsg('env criado '+j.environment.name); load();
  }
  async function verifyEnv(id:string, status:string){
    const r=await fetch('/api/admin/environments',{method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, status})});
    const j=await r.json(); if(!r.ok){ setMsg('erro verify: '+(j.error||r.status)); return; } setMsg('env '+j.environment.status); load();
  }
  async function createCheck(){
    let details:any; try{ details=JSON.parse(checkForm.details); }catch{ details={}; }
    const r=await fetch('/api/admin/environments/checks',{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({env_id:checkForm.env_id, check_type:checkForm.check_type, status:checkForm.status, details})});
    const j=await r.json(); if(!r.ok){ setMsg('erro check: '+(j.error||JSON.stringify(j))); return; } setMsg('check criado '+j.check.check_type+' '+j.check.status); load();
  }

  return (
    <section style={{margin:'24px 0', padding:16, border:'1px solid #333', borderRadius:8}}>
      <h2>PLT-17 Isolamento dev/homolog/prod com contas e dados proprios; previews sem dados reais</h2>
      {msg && <p style={{color:'#0af'}}>{msg}</p>}
      <button onClick={load}>Recarregar</button>

      <h3>Environments ({envs.length}) - isolado/compartilhado</h3>
      <ul style={{maxHeight:200, overflow:'auto'}}>
        {envs.map(e=><li key={e.id} style={{color: e.is_production?'red': e.env_type==='preview'?'orange':'#ccc'}}>
          {e.status} {e.env_type} {e.name} db={e.db_name} user={e.db_user} bucket={e.storage_bucket} domain={e.domain||'-'} prod={e.is_production?'SIM':'nao'} real_data={e.has_real_data?'SIM':'nao'} verified={e.isolation_verified_at?.slice(0,19)||'nunca'} por={e.isolation_verified_by||'-'}
          <button onClick={()=>verifyEnv(e.id,'isolado')} style={{marginLeft:8}}>Verificar isolado</button>
          <button onClick={()=>setCheckForm({...checkForm, env_id:e.id})} style={{marginLeft:4}}>Usar p/ check</button>
        </li>)}
      </ul>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
        <input placeholder="name ex: development-local" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
        <select value={form.env_type} onChange={e=>setForm({...form, env_type:e.target.value})}>{ENV_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select>
        <input placeholder="db_name ex: grupo_seg_dev" value={form.db_name} onChange={e=>setForm({...form, db_name:e.target.value})} />
        <input placeholder="db_user ex: dev_user" value={form.db_user} onChange={e=>setForm({...form, db_user:e.target.value})} />
        <input placeholder="storage_bucket ex: seg-system-dev-bucket" value={form.storage_bucket} onChange={e=>setForm({...form, storage_bucket:e.target.value})} />
        <input placeholder="domain ex: dev.gruposegsystem.local" value={form.domain} onChange={e=>setForm({...form, domain:e.target.value})} />
        <label><input type="checkbox" checked={form.is_production} onChange={e=>setForm({...form, is_production:e.target.checked})} /> is_production</label>
        <label><input type="checkbox" checked={form.has_real_data} onChange={e=>setForm({...form, has_real_data:e.target.checked})} /> has_real_data (apenas prod)</label>
        <textarea placeholder="notes" value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})} style={{gridColumn:'1 / span 2'}} />
      </div>
      <button onClick={createEnv}>Criar environment (valida prod must have real data, non-prod cannot have real data)</button>

      <h3>Checks ({checks.length}) - real_data_scan preview_data_check isolation_verify account_separation</h3>
      <ul style={{maxHeight:160, overflow:'auto'}}>
        {checks.map(c=><li key={c.id}>{c.status} {c.check_type} env={c.env_id.slice(0,8)} por={c.checked_by||'-'} {c.checked_at.slice(0,19)} details={JSON.stringify(c.details||{}).slice(0,80)}</li>)}
      </ul>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
        <input placeholder="env_id UUID" value={checkForm.env_id} onChange={e=>setCheckForm({...checkForm, env_id:e.target.value})} />
        <select value={checkForm.check_type} onChange={e=>setCheckForm({...checkForm, check_type:e.target.value})}>{CHECK_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select>
        <select value={checkForm.status} onChange={e=>setCheckForm({...checkForm, status:e.target.value})}><option value="passou">passou</option><option value="falhou">falhou</option><option value="aviso">aviso</option><option value="pendente">pendente</option></select>
        <textarea placeholder='details JSON ex: {"verified": true}' value={checkForm.details} onChange={e=>setCheckForm({...checkForm, details:e.target.value})} style={{gridColumn:'1 / span 3'}} />
      </div>
      <button onClick={createCheck}>Registrar check (preview must not have real data, non-prod cannot have real data, isolation_verify passou atualiza env isolado)</button>
      <p style={{fontSize:12, color:'#888'}}>PLT-17: isolamento dev/homolog/prod com db_name/user/storage_bucket/domain separados, is_production has_real_data flags, status isolado/compartilhado/em_verificacao/falha, verificacao isolation_verified_at/by, checks real_data_scan preview_data_check isolation_verify account_separation, preview sem dados reais validado, contas proprias por ambiente, seed 4 envs dev/homolog/prod/preview.</p>
    </section>
  );
}
