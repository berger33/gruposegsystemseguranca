"use client";
import { useEffect, useState } from "react";

type Flag={ id:string; key:string; category:string; status:string; value:any; description:string; is_secret:boolean; is_business:boolean; environment:string; rollout_percentage:number; created_at:string; };
type Hist={ id:string; previous_value:any; next_value:any; previous_status:string|null; next_status:string|null; reason:string|null; changed_by:string|null; created_at:string; };
type Maint={ id:string; title:string; description:string; status:string; scheduled_start:string; scheduled_end:string; actual_start:string|null; actual_end:string|null; affected_services:string[]; is_business_impact:boolean; rollback_plan:string|null; };
type Rollout={ id:string; flag_id:string|null; title:string; description:string; status:string; current_percentage:number; target_percentage:number; steps:any; approved_by:string|null; created_at:string; };

const CATS=['negocio','infra','seguranca','operacao','comercial','financeiro','rh','outro'];
const STATS=['ativo','inativo','em_teste','depreciado'];
const ENVS=['all','development','homologation','production'];
const MAINT_STATS=['agendado','em_execucao','concluido','cancelado','falha'];
const ROLLOUT_STATS=['rascunho','aprovado','em_rollout','concluido','revertido','falha'];

export default function ConfigClient(){
  const [flags,setFlags]=useState<Flag[]>([]);
  const [selected,setSelected]=useState<Flag|null>(null);
  const [history,setHistory]=useState<Hist[]>([]);
  const [maints,setMaints]=useState<Maint[]>([]);
  const [rollouts,setRollouts]=useState<Rollout[]>([]);
  const [msg,setMsg]=useState('');
  const [form,setForm]=useState({key:'', category:'negocio', status:'ativo', description:'', environment:'all', is_secret:false, is_business:true, rollout_percentage:100, value:'{"enabled": true}'});
  const [updateForm,setUpdateForm]=useState({status:'', rollout_percentage:'', value:'', reason:''});
  const [maintForm,setMaintForm]=useState({title:'', description:'', scheduled_start:'', scheduled_end:'', affected_services:'', is_business_impact:false, rollback_plan:''});
  const [rolloutForm,setRolloutForm]=useState({flag_id:'', title:'', description:'', target_percentage:100, steps:'[]'});

  async function load(){
    try{
      const [f,m,r]=await Promise.all([
        fetch('/api/admin/config/flags',{credentials:'include'}).then(r=>r.json()),
        fetch('/api/admin/config/maintenance',{credentials:'include'}).then(r=>r.json()),
        fetch('/api/admin/config/rollouts',{credentials:'include'}).then(r=>r.json()),
      ]);
      if(f.flags) setFlags(f.flags);
      if(m.maintenances) setMaints(m.maintenances);
      if(r.rollouts) setRollouts(r.rollouts);
    }catch(e:any){ setMsg(String(e)); }
  }
  useEffect(()=>{ load(); },[]);

  async function loadFlag(id:string){
    const r=await fetch(`/api/admin/config/flags/${id}`,{credentials:'include'}).then(r=>r.json());
    if(r.flag){ setSelected(r.flag); setHistory(r.history||[]); }
  }

  async function createFlag(){
    setMsg('criando flag...');
    let val:any; try{ val=JSON.parse(form.value); }catch{ setMsg('value JSON inválido'); return; }
    const payload={...form, value:val, rollout_percentage:parseInt(String(form.rollout_percentage),10)};
    const r=await fetch('/api/admin/config/flags',{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const j=await r.json(); if(!r.ok){ setMsg('erro: '+(j.error||r.status)); return; } setMsg('flag criada '+j.flag.key); load();
  }
  async function updateFlag(){
    if(!selected){ setMsg('selecione flag'); return; }
    const payload:any={};
    if(updateForm.status) payload.status=updateForm.status;
    if(updateForm.rollout_percentage) payload.rollout_percentage=parseInt(updateForm.rollout_percentage,10);
    if(updateForm.value){ try{ payload.value=JSON.parse(updateForm.value); }catch{ setMsg('value JSON inválido'); return; } }
    if(updateForm.reason) payload.reason=updateForm.reason;
    if(!Object.keys(payload).length){ setMsg('nada para atualizar'); return; }
    setMsg('atualizando flag...');
    const r=await fetch(`/api/admin/config/flags/${selected.id}`,{method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const j=await r.json(); if(!r.ok){ setMsg('erro: '+(j.error||r.status)); return; } setMsg('flag atualizada'); loadFlag(selected.id); load();
  }
  async function rollbackFlag(histId:string){
    if(!selected){ setMsg('selecione flag'); return; }
    const r=await fetch(`/api/admin/config/flags/${selected.id}`,{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({history_id:histId, reason:'Rollback via TI'})});
    const j=await r.json(); if(!r.ok){ setMsg('erro rollback: '+(j.error||r.status)); return; } setMsg('rollback ok'); loadFlag(selected.id); load();
  }
  async function createMaint(){
    setMsg('criando janela manutenção...');
    const payload={...maintForm, affected_services: maintForm.affected_services? maintForm.affected_services.split(',').map(s=>s.trim()).filter(Boolean): []};
    const r=await fetch('/api/admin/config/maintenance',{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const j=await r.json(); if(!r.ok){ setMsg('erro maint: '+(j.error||r.status)); return; } setMsg('manutenção criada'); load();
  }
  async function updateMaint(id:string, next_status:string){
    const r=await fetch('/api/admin/config/maintenance',{method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, next_status, reason:'Atualização via TI'})});
    const j=await r.json(); if(!r.ok){ setMsg('erro maint upd: '+(j.error||JSON.stringify(j))); return; } setMsg('manutenção '+j.maintenance.status); load();
  }
  async function createRollout(){
    setMsg('criando rollout...');
    let steps:any; try{ steps=JSON.parse(rolloutForm.steps); }catch{ steps=[]; }
    const payload={flag_id: rolloutForm.flag_id||null, title: rolloutForm.title, description: rolloutForm.description, target_percentage: parseInt(String(rolloutForm.target_percentage),10), steps};
    const r=await fetch('/api/admin/config/rollouts',{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const j=await r.json(); if(!r.ok){ setMsg('erro rollout: '+(j.error||r.status)); return; } setMsg('rollout criado'); load();
  }
  async function updateRollout(id:string, next_status:string, current_percentage?:number){
    const payload:any={id, next_status, reason:'Atualização via TI'};
    if(current_percentage!=null) payload.current_percentage=current_percentage;
    const r=await fetch('/api/admin/config/rollouts',{method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const j=await r.json(); if(!r.ok){ setMsg('erro rollout upd: '+(j.error||JSON.stringify(j))); return; } setMsg('rollout '+j.rollout.status); load();
  }

  return (
    <section style={{margin:'24px 0', padding:16, border:'1px solid #333', borderRadius:8}}>
      <h2>PLT-13 Gestão configurações, flags, manutenção, rollout e reversão — negócio separado infra</h2>
      {msg && <p style={{color:'#0af'}}>{msg}</p>}
      <button onClick={load}>Recarregar</button>

      <h3>Flags ({flags.length}) — negócio vs infra</h3>
      <ul style={{maxHeight:160, overflow:'auto'}}>
        {flags.map(f=><li key={f.id}><button onClick={()=>loadFlag(f.id)} style={{marginRight:8}}>Abrir</button>{f.is_business?'[NEGOCIO]':'[INFRA]'} {f.category} {f.key} {f.status} {f.environment} {f.rollout_percentage}% {f.is_secret?'SECRETO':''} {JSON.stringify(f.value).slice(0,80)}</li>)}
      </ul>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:8}}>
        <input placeholder="key ex: catalogo_publicacao_automatica" value={form.key} onChange={e=>setForm({...form, key:e.target.value})} />
        <select value={form.category} onChange={e=>setForm({...form, category:e.target.value})}>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</select>
        <select value={form.status} onChange={e=>setForm({...form, status:e.target.value})}>{STATS.map(s=><option key={s} value={s}>{s}</option>)}</select>
        <select value={form.environment} onChange={e=>setForm({...form, environment:e.target.value})}>{ENVS.map(ev=><option key={ev} value={ev}>{ev}</option>)}</select>
        <input type="number" placeholder="rollout_percentage" value={form.rollout_percentage} onChange={e=>setForm({...form, rollout_percentage:parseInt(e.target.value,10)||0})} />
        <label><input type="checkbox" checked={form.is_business} onChange={e=>setForm({...form, is_business:e.target.checked})} /> is_business (negócio)</label>
        <label><input type="checkbox" checked={form.is_secret} onChange={e=>setForm({...form, is_secret:e.target.checked})} /> is_secret (infra secreta)</label>
        <textarea placeholder="description min10" value={form.description} onChange={e=>setForm({...form, description:e.target.value})} />
        <textarea placeholder='value JSON ex: {"enabled": true}' value={form.value} onChange={e=>setForm({...form, value:e.target.value})} />
      </div>
      <button onClick={createFlag}>Criar/atualizar flag (upsert por key+env)</button>

      {selected && (
        <div style={{marginTop:12, borderTop:'1px solid #555', paddingTop:8}}>
          <h4>Flag selecionada {selected.key} — histórico</h4>
          <p>{selected.category} {selected.status} {selected.environment} {selected.rollout_percentage}% {selected.is_business?'NEGOCIO':'INFRA'} {selected.description.slice(0,120)}</p>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
            <select value={updateForm.status} onChange={e=>setUpdateForm({...updateForm, status:e.target.value})}><option value="">manter status</option>{STATS.map(s=><option key={s} value={s}>{s}</option>)}</select>
            <input placeholder="rollout_percentage" value={updateForm.rollout_percentage} onChange={e=>setUpdateForm({...updateForm, rollout_percentage:e.target.value})} />
            <input placeholder="reason" value={updateForm.reason} onChange={e=>setUpdateForm({...updateForm, reason:e.target.value})} />
            <textarea placeholder='novo value JSON opcional' value={updateForm.value} onChange={e=>setUpdateForm({...updateForm, value:e.target.value})} style={{gridColumn:'1 / span 3'}} />
          </div>
          <button onClick={updateFlag}>Atualizar flag</button>
          <h5>Histórico ({history.length}) — rollback possível</h5>
          <ul style={{maxHeight:120, overflow:'auto'}}>
            {history.map(h=><li key={h.id}>{h.previous_status||'null'}→{h.next_status||'null'} {JSON.stringify(h.previous_value)?.slice(0,60)}→{JSON.stringify(h.next_value)?.slice(0,60)} por {h.changed_by||'-'} {h.reason||''} {h.created_at.slice(0,19)} <button onClick={()=>rollbackFlag(h.id)}>Rollback p/ anterior</button></li>)}
          </ul>
        </div>
      )}

      <h3>Manutenção ({maints.length})</h3>
      <ul style={{maxHeight:120, overflow:'auto'}}>
        {maints.map(m=><li key={m.id}>{m.status} {m.title} {m.scheduled_start.slice(0,16)}→{m.scheduled_end.slice(0,16)} {m.is_business_impact?'IMPACTO_NEGOCIO':''} {m.affected_services.join(',')} <button onClick={()=>updateMaint(m.id,'em_execucao')}>Iniciar</button> <button onClick={()=>updateMaint(m.id,'concluido')}>Concluir</button> <button onClick={()=>updateMaint(m.id,'cancelado')}>Cancelar</button></li>)}
      </ul>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
        <input placeholder="título manutenção min10" value={maintForm.title} onChange={e=>setMaintForm({...maintForm, title:e.target.value})} />
        <input placeholder="affected_services vírgula ex: api,db,storage" value={maintForm.affected_services} onChange={e=>setMaintForm({...maintForm, affected_services:e.target.value})} />
        <input type="datetime-local" value={maintForm.scheduled_start} onChange={e=>setMaintForm({...maintForm, scheduled_start:e.target.value})} />
        <input type="datetime-local" value={maintForm.scheduled_end} onChange={e=>setMaintForm({...maintForm, scheduled_end:e.target.value})} />
        <label><input type="checkbox" checked={maintForm.is_business_impact} onChange={e=>setMaintForm({...maintForm, is_business_impact:e.target.checked})} /> impacto negócio</label>
        <textarea placeholder="description min20" value={maintForm.description} onChange={e=>setMaintForm({...maintForm, description:e.target.value})} />
        <textarea placeholder="rollback_plan" value={maintForm.rollback_plan} onChange={e=>setMaintForm({...maintForm, rollback_plan:e.target.value})} />
      </div>
      <button onClick={createMaint}>Agendar manutenção</button>

      <h3>Rollout ({rollouts.length}) — rollout e reversão</h3>
      <ul style={{maxHeight:120, overflow:'auto'}}>
        {rollouts.map(r=><li key={r.id}>{r.status} {r.title} {r.current_percentage}%→{r.target_percentage}% flag={r.flag_id?.slice(0,8)||'sem flag'} <button onClick={()=>updateRollout(r.id,'aprovado')}>Aprovar</button> <button onClick={()=>updateRollout(r.id,'em_rollout',50)}>Rollout 50%</button> <button onClick={()=>updateRollout(r.id,'concluido',100)}>Concluir 100%</button> <button onClick={()=>updateRollout(r.id,'revertido')}>Reverter</button></li>)}
      </ul>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
        <input placeholder="flag_id opcional UUID" value={rolloutForm.flag_id} onChange={e=>setRolloutForm({...rolloutForm, flag_id:e.target.value})} />
        <input type="number" placeholder="target_percentage" value={rolloutForm.target_percentage} onChange={e=>setRolloutForm({...rolloutForm, target_percentage:parseInt(e.target.value,10)||0})} />
        <input placeholder="título rollout min10" value={rolloutForm.title} onChange={e=>setRolloutForm({...rolloutForm, title:e.target.value})} />
        <textarea placeholder="description min20" value={rolloutForm.description} onChange={e=>setRolloutForm({...rolloutForm, description:e.target.value})} />
        <textarea placeholder='steps JSON ex: [{"pct":25,"desc":"25%"}]' value={rolloutForm.steps} onChange={e=>setRolloutForm({...rolloutForm, steps:e.target.value})} />
      </div>
      <button onClick={createRollout}>Criar rollout plan</button>
      <p style={{fontSize:12, color:'#888'}}>PLT-13: negócio separado infra — flags com is_business, category negocio/infra, environment all/dev/homolog/prod, rollout_percentage, secret masking, history com rollback, manutenção com schedule e rollback_plan, rollout com steps current/target percentage e reversão automática para valor anterior do flag.</p>
    </section>
  );
}
