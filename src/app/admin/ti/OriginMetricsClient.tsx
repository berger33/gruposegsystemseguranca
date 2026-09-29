"use client";
import { useEffect, useState } from "react";

export default function OriginMetricsClient() {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [abtests, setAbtests] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [metricForm, setMetricForm] = useState({ origin:"", campaign:"", channel:"", period_start:"", period_end:"", total_leads:0, converted_leads:0, total_opportunities:0, total_contracts:0, notes:"" });
  const [eventForm, setEventForm] = useState({ event_type:"lead_received", origin:"", campaign:"", channel:"", lead_id:"", ip:"", user_agent:"" });
  const [abForm, setAbForm] = useState({ test_key:"", hypothesis:"", description:"", metric_name:"", traffic_required:100, treatment:"", variant_a:"{}", variant_b:"{}" });
  const [abWinner, setAbWinner] = useState("inconclusivo");

  const load = async () => {
    try{
      const [mR, eR, aR] = await Promise.all([
        fetch("/api/admin/origin-metrics").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/admin/conversion-events").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/admin/ab-tests").then(r=>r.json()).catch(()=>({items:[]})),
      ]);
      setMetrics(mR.items||[]); setEvents(eR.items||[]); setAbtests(aR.items||[]);
    } catch(e:any){ setMsg(String(e.message||e)); }
  };
  useEffect(()=>{ load(); },[]);

  const post = async (url:string, body:any, method="POST") => {
    const r = await fetch(url, { method, headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
    const j = await r.json();
    if(!r.ok) throw new Error(j.error||"erro");
    return j;
  };

  return (
    <section style={{marginTop:32, padding:16, border:"1px solid #ccc", borderRadius:8}}>
      <h2>PUB-10 Mensuração origem conversão A/B testes minimização dados</h2>
      {msg && <p style={{color:"red"}}>{msg}</p>}

      <h3>Origem métricas (origin 3..100, campaign 3..100, channel 1..100, period_start/end UNIQUE origin/campaign/channel/period, total_leads, converted_leads ≤ total, conversion_rate auto, total_opportunities/contracts, is_minimized true, notes 10..1000)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="origin 3..100 ex site/instagram" value={metricForm.origin} onChange={e=>setMetricForm({...metricForm, origin:e.target.value})} />
        <input placeholder="campaign 3..100" value={metricForm.campaign} onChange={e=>setMetricForm({...metricForm, campaign:e.target.value})} />
        <input placeholder="channel 1..100" value={metricForm.channel} onChange={e=>setMetricForm({...metricForm, channel:e.target.value})} />
        <input type="date" value={metricForm.period_start} onChange={e=>setMetricForm({...metricForm, period_start:e.target.value})} />
        <input type="date" value={metricForm.period_end} onChange={e=>setMetricForm({...metricForm, period_end:e.target.value})} />
        <input type="number" placeholder="total leads" value={metricForm.total_leads} onChange={e=>setMetricForm({...metricForm, total_leads:Number(e.target.value)})} />
        <input type="number" placeholder="converted leads ≤ total" value={metricForm.converted_leads} onChange={e=>setMetricForm({...metricForm, converted_leads:Number(e.target.value)})} />
        <input type="number" placeholder="oportunidades" value={metricForm.total_opportunities} onChange={e=>setMetricForm({...metricForm, total_opportunities:Number(e.target.value)})} />
        <input type="number" placeholder="contratos" value={metricForm.total_contracts} onChange={e=>setMetricForm({...metricForm, total_contracts:Number(e.target.value)})} />
        <input placeholder="notes 10..1000" value={metricForm.notes} onChange={e=>setMetricForm({...metricForm, notes:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/admin/origin-metrics", metricForm); setMsg("métrica origem criada minimização"); load(); } catch(e:any){ setMsg(e.message);} }}>Criar métrica origem</button>
      </div>
      <ul>{metrics.map((m:any)=><li key={m.id}>{m.origin} camp:{m.campaign} ch:{m.channel} período:{m.period_start}→{m.period_end} leads:{m.total_leads} conv:{m.converted_leads} taxa:{Number(m.conversion_rate).toFixed(2)}% minim:{String(m.is_minimized)} notes:{m.notes?.slice(0,40)}</li>)}</ul>

      <h3>Conversão eventos (event_type lead_received/lead_converted/opportunity_created/proposal_sent/contract_created/visit_confirmed/outro, origin 3..100, campaign 3..100, lead_id/opportunity_id/contract_id, is_minimized true, ip_hash CHAR64 user_agent_hash CHAR64 — sem IP original apenas hash)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <select value={eventForm.event_type} onChange={e=>setEventForm({...eventForm, event_type:e.target.value})}>
          <option value="lead_received">lead_received</option><option value="lead_converted">lead_converted</option><option value="opportunity_created">opportunity_created</option><option value="proposal_sent">proposal_sent</option><option value="contract_created">contract_created</option><option value="visit_confirmed">visit_confirmed</option><option value="outro">outro</option>
        </select>
        <input placeholder="origin 3..100" value={eventForm.origin} onChange={e=>setEventForm({...eventForm, origin:e.target.value})} />
        <input placeholder="campaign 3..100" value={eventForm.campaign} onChange={e=>setEventForm({...eventForm, campaign:e.target.value})} />
        <input placeholder="channel" value={eventForm.channel} onChange={e=>setEventForm({...eventForm, channel:e.target.value})} />
        <input placeholder="lead_id UUID" value={eventForm.lead_id} onChange={e=>setEventForm({...eventForm, lead_id:e.target.value})} />
        <input placeholder="ip será hasheado" value={eventForm.ip} onChange={e=>setEventForm({...eventForm, ip:e.target.value})} />
        <input placeholder="user_agent será hasheado" value={eventForm.user_agent} onChange={e=>setEventForm({...eventForm, user_agent:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/admin/conversion-events", {...eventForm, ip_hash:eventForm.ip, user_agent_hash:eventForm.user_agent}); setMsg("evento conversão criado minimização ip_hash ua_hash"); load(); } catch(e:any){ setMsg(e.message);} }}>Criar evento conversão</button>
      </div>
      <ul>{events.slice(0,30).map((ev:any)=><li key={ev.id}>{ev.event_type} origin:{ev.origin} camp:{ev.campaign} lead:{ev.lead_id?.slice(0,8)} minim:{String(ev.is_minimized)} ip_hash:{ev.ip_hash?.slice(0,12)} ua_hash:{ev.user_agent_hash?.slice(0,12)} {ev.occurred_at}</li>)}</ul>

      <h3>A/B testes (test_key 3..100 UNIQUE, hypothesis 20..2000, desc 10..2000, variant_a/b JSONB, metric_name 3..200, traffic_required ≥10, treatment 10..2000, privacy_compliance_note 20..2000, is_privacy_compliant true, status rascunho/em_revisao/aprovado/em_execucao/concluido/cancelado/arquivado, winner A/B/empate/inconclusivo, result_data, somente após tráfego hipótese tratamento definidos minimização)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="test_key 3..100" value={abForm.test_key} onChange={e=>setAbForm({...abForm, test_key:e.target.value})} />
        <input placeholder="hypothesis 20..2000 ex usuários convertem mais com..." value={abForm.hypothesis} onChange={e=>setAbForm({...abForm, hypothesis:e.target.value})} style={{width:300}} />
        <input placeholder="descrição 10..2000" value={abForm.description} onChange={e=>setAbForm({...abForm, description:e.target.value})} />
        <input placeholder="metric_name 3..200 ex conversion_rate" value={abForm.metric_name} onChange={e=>setAbForm({...abForm, metric_name:e.target.value})} />
        <input type="number" placeholder="traffic_required ≥10" value={abForm.traffic_required} onChange={e=>setAbForm({...abForm, traffic_required:Number(e.target.value)})} />
        <input placeholder="treatment 10..2000" value={abForm.treatment} onChange={e=>setAbForm({...abForm, treatment:e.target.value})} style={{width:300}} />
        <textarea placeholder='variant_a JSON {"title":"..."}' value={abForm.variant_a} onChange={e=>setAbForm({...abForm, variant_a:e.target.value})} style={{width:"100%", minHeight:60}} />
        <textarea placeholder='variant_b JSON {"title":"..."}' value={abForm.variant_b} onChange={e=>setAbForm({...abForm, variant_b:e.target.value})} style={{width:"100%", minHeight:60}} />
        <button onClick={async()=>{ try{ const va=JSON.parse(abForm.variant_a||"{}"); const vb=JSON.parse(abForm.variant_b||"{}"); await post("/api/admin/ab-tests", {...abForm, variant_a:va, variant_b:vb}); setMsg("A/B criado hipótese tratamento definidos minimização"); load(); } catch(e:any){ setMsg(e.message);} }}>Criar A/B</button>
      </div>
      <p style={{margin:"4px 0"}}>
        <label htmlFor="ab-winner">Resultado a registrar na conclusão</label>{" "}
        <select id="ab-winner" value={abWinner} onChange={e=>setAbWinner(e.target.value)}>
          <option value="A">A</option><option value="B">B</option><option value="empate">empate</option><option value="inconclusivo">inconclusivo</option>
        </select>
      </p>
      <ul>{abtests.map((a:any)=><li key={a.id}>{a.test_key} status:{a.status} hipótese:{a.hypothesis?.slice(0,60)} metric:{a.metric_name} tráfegoReq:{a.traffic_required} winner:{a.winner||"—"} privacy:{String(a.is_privacy_compliant)} tratamento:{a.treatment?.slice(0,60)} <button onClick={async()=>{ try{ await post("/api/admin/ab-tests", {id:a.id, status:"aprovado", reason:"Aprovação A/B hipótese e tratamento definidos minimização tráfego verificado"}, "PATCH"); setMsg("A/B aprovado"); load(); } catch(e:any){ setMsg(e.message);} }}>Aprovar</button> <button onClick={async()=>{ try{ await post("/api/admin/ab-tests", {id:a.id, status:"em_execucao", reason:"Início execução A/B após tráfego e hipótese definidos"}, "PATCH"); setMsg("A/B em execução somente após tráfego"); load(); } catch(e:any){ setMsg(e.message);} }}>Iniciar execução</button> <button onClick={async()=>{ try{ const winner=abWinner; await post("/api/admin/ab-tests", {id:a.id, status:"concluido", winner, result_data:{conclusion:"resultado"}, reason:"Conclusão A/B minimização"}, "PATCH"); setMsg(`A/B concluído winner ${winner}`); load(); } catch(e:any){ setMsg(e.message);} }}>Concluir</button></li>)}</ul>
    </section>
  );
}
