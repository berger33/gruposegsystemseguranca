"use client";
import { useEffect, useState } from "react";

type Budget={ id:string; name:string; category:string; period_start:string; period_end:string; budgeted_amount:string; actual_amount:string; currency:string; alert_threshold_percent:number; is_active:boolean; notes:string|null; };
type Metric={ id:string; metric:string; category:string; measured_at:string; value:string; unit:string; source:string; };
type Alert={ id:string; budget_id:string|null; metric:string; category:string; severity:string; title:string; message:string; threshold_value:string; current_value:string; is_acknowledged:boolean; created_at:string; };

const CATS=['armazenamento','mensagens','ia','banco','infra','licencas','outro'];
const METRICS=['storage_gb','messages_count','ia_tokens','db_gb','bandwidth_gb','cpu_hours','api_calls','outro'];

export default function BudgetClient(){
  const [budgets,setBudgets]=useState<Budget[]>([]);
  const [metrics,setMetrics]=useState<Metric[]>([]);
  const [alerts,setAlerts]=useState<Alert[]>([]);
  const [msg,setMsg]=useState('');
  const [form,setForm]=useState({name:'', category:'infra', period_start:'', period_end:'', budgeted_amount:200, currency:'BRL', alert_threshold_percent:80, notes:''});
  const [metricForm,setMetricForm]=useState({metric:'storage_gb', category:'armazenamento', value:10, unit:'GB', source:'system'});

  async function load(){
    try{
      const [b,m,a]=await Promise.all([
        fetch('/api/admin/budgets',{credentials:'include'}).then(r=>r.json()),
        fetch('/api/admin/usage/metrics',{credentials:'include'}).then(r=>r.json()),
        fetch('/api/admin/usage/alerts',{credentials:'include'}).then(r=>r.json()),
      ]);
      if(b.budgets) setBudgets(b.budgets);
      if(m.metrics) setMetrics(m.metrics);
      if(a.alerts) setAlerts(a.alerts);
    }catch(e:any){ setMsg(String(e)); }
  }
  useEffect(()=>{ load(); },[]);

  async function createBudget(){
    const r=await fetch('/api/admin/budgets',{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form)});
    const j=await r.json(); if(!r.ok){ setMsg('erro budget: '+(j.error||r.status)); return; } setMsg('budget criado '+j.budget.name); load();
  }
  async function updateBudget(id:string, actual_amount:number){
    const r=await fetch('/api/admin/budgets',{method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, actual_amount})});
    const j=await r.json(); if(!r.ok){ setMsg('erro upd: '+(j.error||r.status)); return; }
    const pct = parseFloat(j.budget.budgeted_amount)>0 ? (parseFloat(j.budget.actual_amount)/parseFloat(j.budget.budgeted_amount)*100) : 0;
    setMsg('budget atualizado pct='+pct.toFixed(1)+'%'); load();
  }
  async function createMetric(){
    const r=await fetch('/api/admin/usage/metrics',{method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(metricForm)});
    const j=await r.json(); if(!r.ok){ setMsg('erro metric: '+(j.error||r.status)); return; } setMsg('metric criada '+j.metric.metric+' '+j.metric.value+j.metric.unit); load();
  }
  async function ackAlert(id:string){
    const r=await fetch('/api/admin/usage/alerts',{method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id})});
    const j=await r.json(); if(!r.ok){ setMsg('erro ack: '+(j.error||r.status)); return; } setMsg('alert acknowledged'); load();
  }

  return (
    <section style={{margin:'24px 0', padding:16, border:'1px solid #333', borderRadius:8}}>
      <h2>PLT-16 Orcamento operacional e alertas uso</h2>
      {msg && <p style={{color:'#0af'}}>{msg}</p>}
      <button onClick={load}>Recarregar</button>

      <h3>Budgets ({budgets.length}) - R$200/mes hospedagem nao cobre todo ecossistema</h3>
      <ul style={{maxHeight:160, overflow:'auto'}}>
        {budgets.map(b=>{
          const pct = parseFloat(b.budgeted_amount)>0 ? (parseFloat(b.actual_amount)/parseFloat(b.budgeted_amount)*100) : 0;
          return (
            <li key={b.id}>
              {b.is_active?'ATIVO':'INATIVO'} {b.category} {b.name} {b.budgeted_amount}{b.currency} atual={b.actual_amount} {pct.toFixed(1)}% thresh={b.alert_threshold_percent}% {b.period_start.slice(0,10)}-{b.period_end.slice(0,10)}
              <button onClick={()=>updateBudget(b.id, parseFloat(b.actual_amount)+10)} style={{marginLeft:8}}>+10 uso</button>
              <button onClick={()=>updateBudget(b.id, parseFloat(b.budgeted_amount)*0.9)} style={{marginLeft:4}}>Simular 90%</button>
            </li>
          );
        })}
      </ul>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
        <input placeholder="name ex: Hospedagem base" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} />
        <select value={form.category} onChange={e=>setForm({...form, category:e.target.value})}>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</select>
        <input type="number" placeholder="budgeted_amount" value={form.budgeted_amount} onChange={e=>setForm({...form, budgeted_amount:parseFloat(e.target.value)||0})} />
        <input type="date" value={form.period_start} onChange={e=>setForm({...form, period_start:e.target.value})} />
        <input type="date" value={form.period_end} onChange={e=>setForm({...form, period_end:e.target.value})} />
        <input type="number" placeholder="alert_threshold %" value={form.alert_threshold_percent} onChange={e=>setForm({...form, alert_threshold_percent:parseInt(e.target.value,10)||0})} />
        <textarea placeholder="notes" value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})} style={{gridColumn:'1 / span 3'}} />
      </div>
      <button onClick={createBudget}>Criar orcamento operacional</button>

      <h3>Usage metrics ({metrics.length})</h3>
      <ul style={{maxHeight:120, overflow:'auto'}}>
        {metrics.map(m=><li key={m.id}>{m.metric} {m.category} {m.value}{m.unit} src={m.source} {m.measured_at.slice(0,19)}</li>)}
      </ul>
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8}}>
        <select value={metricForm.metric} onChange={e=>setMetricForm({...metricForm, metric:e.target.value})}>{METRICS.map(m=><option key={m} value={m}>{m}</option>)}</select>
        <select value={metricForm.category} onChange={e=>setMetricForm({...metricForm, category:e.target.value})}>{CATS.map(c=><option key={c} value={c}>{c}</option>)}</select>
        <input type="number" placeholder="value" value={metricForm.value} onChange={e=>setMetricForm({...metricForm, value:parseFloat(e.target.value)||0})} />
        <input placeholder="unit ex: GB" value={metricForm.unit} onChange={e=>setMetricForm({...metricForm, unit:e.target.value})} />
        <input placeholder="source" value={metricForm.source} onChange={e=>setMetricForm({...metricForm, source:e.target.value})} />
      </div>
      <button onClick={createMetric}>Registrar metrica uso</button>

      <h3>Alerts ({alerts.length})</h3>
      <ul style={{maxHeight:160, overflow:'auto'}}>
        {alerts.map(a=><li key={a.id} style={{color: a.severity==='critical'?'red': a.severity==='warning'?'orange':'#888'}}>{a.is_acknowledged?'[ACK]':''} {a.severity} {a.category} {a.metric} {a.title} curr={a.current_value} thresh={a.threshold_value} {a.created_at.slice(0,19)} <button onClick={()=>ackAlert(a.id)} style={{marginLeft:8}}>Acknowledge</button></li>)}
      </ul>
      <p style={{fontSize:12, color:'#888'}}>PLT-16: orcamentos por categoria period budgeted/actual threshold alerta automatico warning/critical acknowledgment seed 5 budgets infra/armazenamento/mensagens/ia/banco com R$200/mes hospedagem nao cobre todo ecossistema dimensionar separado.</p>
    </section>
  );
}
