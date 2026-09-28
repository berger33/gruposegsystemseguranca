"use client";
import { useEffect, useState } from "react";

export default function AstAdvancedClient() {
  const [inventories, setInventories] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [serviceOrders, setServiceOrders] = useState<any[]>([]);
  const [evidences, setEvidences] = useState<any[]>([]);
  const [maintenancePlans, setMaintenancePlans] = useState<any[]>([]);
  const [executions, setExecutions] = useState<any[]>([]);
  const [cftvDossiers, setCftvDossiers] = useState<any[]>([]);
  const [cleaningMaterials, setCleaningMaterials] = useState<any[]>([]);
  const [msg, setMsg] = useState("");

  const [invForm, setInvForm] = useState({ title:"", description:"", location:"" });
  const [invItemForm, setInvItemForm] = useState({ inventory_id:"", product_id:"", expected_quantity:0, counted_quantity:0, adjustment_quantity:"", adjustment_reason:"", is_approved:false });
  const [osForm, setOsForm] = useState({ title:"", description:"", requester_name:"", client_account_id:"", contract_id:"", technician_name:"", priority:"media", scheduled_at:"", diagnosis:"" });
  const [evForm, setEvForm] = useState({ service_order_id:"", evidence_type:"", file_name:"", file_url:"", storage_key:"", before_after:"antes", is_client_visible:false, warranty_until:"", cost_cents:"" });
  const [maintForm, setMaintForm] = useState({ asset_id:"", maintenance_type:"preventiva", title:"", description:"", periodicity_days:30, next_due_date:"", alert_days_before:7 });
  const [execForm, setExecForm] = useState({ plan_id:"", asset_id:"", executed_at:"", executed_by_name:"", result:"", next_due_date:"", cost_cents:"", evidence_file_url:"", evidence_storage_key:"" });
  const [cftvForm, setCftvForm] = useState({ client_account_id:"", contract_id:"", location:"", model:"", manufacturer:"", serial_number:"", ip_address:"", warranty_until:"", installation_date:"", documentation_file_url:"", documentation_storage_key:"", notes:"", password_reference:"", password_storage_hint:"" });
  const [cleanForm, setCleanForm] = useState({ product_id:"", location:"", expected_consumption:0, actual_consumption:0, period_start:"", period_end:"", needs_replacement:false });

  const load = async () => {
    try {
      const [invR, osR, evR, maintR, execR, cftvR, cleanR] = await Promise.all([
        fetch("/api/ast/inventories").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ast/service-orders").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ast/service-order-evidences").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ast/maintenance-plans").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ast/maintenance-executions").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ast/cftv-dossiers").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ast/cleaning-materials").then(r=>r.json()).catch(()=>({items:[]})),
      ]);
      setInventories(invR.items||[]); setServiceOrders(osR.items||[]); setEvidences(evR.items||[]); setMaintenancePlans(maintR.items||[]); setExecutions(execR.items||[]); setCftvDossiers(cftvR.items||[]); setCleaningMaterials(cleanR.items||[]);
    } catch(e:any){ setMsg(String(e?.message||e)); }
  };
  useEffect(()=>{ load(); },[]);

  const post = async (url:string, body:any) => {
    const r = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error||"erro");
    return j;
  };

  return (
    <section style={{ marginTop:32, padding:16, border:"1px solid #ccc", borderRadius:8 }}>
      <h2>AST-07..12 — Inventário, OS, evidências, manutenção, dossiê CFTV, materiais limpeza</h2>
      {msg && <p style={{color:"red"}}>{msg}</p>}

      <h3>AST-07 Inventário físico (protocolo INV-AST-YYYYMMDD-XXXX, title 5..200, desc 10..2000, location 3..200, status rascunho/em_contagem/divergente/ajustado/aprovado/cancelado, divergências ajuste aprovado)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="title 5..200" value={invForm.title} onChange={e=>setInvForm({...invForm, title:e.target.value})} />
        <input placeholder="description 10..2000" value={invForm.description} onChange={e=>setInvForm({...invForm, description:e.target.value})} />
        <input placeholder="location 3..200" value={invForm.location} onChange={e=>setInvForm({...invForm, location:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ast/inventories", invForm); setMsg("inventário criado"); load(); } catch(e:any){ setMsg(e.message);} }}>Criar inventário</button>
      </div>
      <ul>{inventories.map((i:any)=><li key={i.id}>{i.protocol} {i.title} loc:{i.location} status:{i.status} <button onClick={async()=>{ try{ const resp=await fetch("/api/ast/inventories", {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id:i.id, status:"em_contagem", reason:"Em contagem inventário físico divergências ajuste"})}); const j=await resp.json(); if(!resp.ok) throw new Error(j.error); setMsg("inventário em contagem"); load(); } catch(e:any){ setMsg(e.message);} }}>Contagem</button> <button onClick={async()=>{ try{ const resp=await fetch("/api/ast/inventories", {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id:i.id, status:"aprovado", reason:"Aprovado inventário físico divergências ajuste aprovado"})}); const j=await resp.json(); if(!resp.ok) throw new Error(j.error); setMsg("inventário aprovado gera ajustes"); load(); } catch(e:any){ setMsg(e.message);} }}>Aprovar</button></li>)}</ul>

      <h4>Itens inventário (expected, counted, divergence GENERATED counted-expected, adjustment, reason 10..1000, is_approved)</h4>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="inventory_id" value={invItemForm.inventory_id} onChange={e=>setInvItemForm({...invItemForm, inventory_id:e.target.value})} />
        <input placeholder="product_id" value={invItemForm.product_id} onChange={e=>setInvItemForm({...invItemForm, product_id:e.target.value})} />
        <input type="number" placeholder="expected >=0" value={invItemForm.expected_quantity} onChange={e=>setInvItemForm({...invItemForm, expected_quantity:Number(e.target.value)})} />
        <input type="number" placeholder="counted >=0" value={invItemForm.counted_quantity} onChange={e=>setInvItemForm({...invItemForm, counted_quantity:Number(e.target.value)})} />
        <input type="number" placeholder="adjustment" value={invItemForm.adjustment_quantity} onChange={e=>setInvItemForm({...invItemForm, adjustment_quantity:e.target.value})} />
        <input placeholder="adjust reason 10..1000" value={invItemForm.adjustment_reason} onChange={e=>setInvItemForm({...invItemForm, adjustment_reason:e.target.value})} />
        <label><input type="checkbox" checked={invItemForm.is_approved} onChange={e=>setInvItemForm({...invItemForm, is_approved:e.target.checked})} /> aprovado</label>
        <button onClick={async()=>{ try{ const body={...invItemForm, adjustment_quantity: invItemForm.adjustment_quantity===""? null: Number(invItemForm.adjustment_quantity)}; await post("/api/ast/inventory-items", body); setMsg("item inventário criado"); } catch(e:any){ setMsg(e.message);} }}>Adicionar item</button>
        <button onClick={async()=>{ try{ if(!invItemForm.inventory_id) throw new Error("inventory_id obrigatório"); const r=await fetch(`/api/ast/inventory-items?inventory_id=${invItemForm.inventory_id}`); const j=await r.json(); setInventoryItems(j.items||[]); } catch(e:any){ setMsg(e.message);} }}>Listar itens</button>
      </div>
      <ul>{inventoryItems.map((it:any)=><li key={it.id}>prod:{it.product_name} exp:{it.expected_quantity} cont:{it.counted_quantity} div:{it.divergence} adj:{it.adjustment_quantity} aprov:{String(it.is_approved)}</li>)}</ul>

      <h3>AST-08 Ordem serviço (protocolo OS-AST-YYYYMMDD-XXXX, title 5..200, desc 10..2000, requester 2..200, cliente/contrato, técnico, prioridade baixa/media/alta/critica, agenda, diagnóstico 10..2000, checklist JSONB, peças JSONB, execução)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="title 5..200" value={osForm.title} onChange={e=>setOsForm({...osForm, title:e.target.value})} />
        <input placeholder="description 10..2000" value={osForm.description} onChange={e=>setOsForm({...osForm, description:e.target.value})} />
        <input placeholder="requester 2..200" value={osForm.requester_name} onChange={e=>setOsForm({...osForm, requester_name:e.target.value})} />
        <input placeholder="client_account_id" value={osForm.client_account_id} onChange={e=>setOsForm({...osForm, client_account_id:e.target.value})} />
        <input placeholder="contract_id" value={osForm.contract_id} onChange={e=>setOsForm({...osForm, contract_id:e.target.value})} />
        <input placeholder="tecnico 2..200" value={osForm.technician_name} onChange={e=>setOsForm({...osForm, technician_name:e.target.value})} />
        <select value={osForm.priority} onChange={e=>setOsForm({...osForm, priority:e.target.value})}><option value="baixa">baixa</option><option value="media">media</option><option value="alta">alta</option><option value="critica">critica</option></select>
        <input type="datetime-local" value={osForm.scheduled_at} onChange={e=>setOsForm({...osForm, scheduled_at:e.target.value})} />
        <input placeholder="diagnóstico 10..2000" value={osForm.diagnosis} onChange={e=>setOsForm({...osForm, diagnosis:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ast/service-orders", osForm); setMsg("OS criada"); load(); } catch(e:any){ setMsg(e.message);} }}>Criar OS</button>
      </div>
      <ul>{serviceOrders.map((o:any)=><li key={o.id}>{o.protocol} {o.title} status:{o.status} prio:{o.priority} cliente:{o.client_name} <button onClick={async()=>{ try{ const resp=await fetch("/api/ast/service-orders", {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id:o.id, status:"aberta", reason:"Abertura OS solicitante contrato técnico agenda"})}); const j=await resp.json(); if(!resp.ok) throw new Error(j.error); setMsg("OS aberta"); load(); } catch(e:any){ setMsg(e.message);} }}>Abrir</button> <button onClick={async()=>{ try{ const resp=await fetch("/api/ast/service-orders", {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id:o.id, status:"concluida", reason:"Conclusão OS execução evidências antes/depois aceite garantia retorno custo"})}); const j=await resp.json(); if(!resp.ok) throw new Error(j.error); setMsg("OS concluída"); load(); } catch(e:any){ setMsg(e.message);} }}>Concluir</button></li>)}</ul>

      <h3>AST-09 Evidências antes/depois (evidence_type 3..100, file_name 1..500, file_url 5..1000, storage_key 5..500 UNIQUE, before_after antes/depois/outro, is_client_visible false até aprovado, is_approved, warranty, cost)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="service_order_id" value={evForm.service_order_id} onChange={e=>setEvForm({...evForm, service_order_id:e.target.value})} />
        <input placeholder="evidence_type 3..100" value={evForm.evidence_type} onChange={e=>setEvForm({...evForm, evidence_type:e.target.value})} />
        <input placeholder="file_name 1..500" value={evForm.file_name} onChange={e=>setEvForm({...evForm, file_name:e.target.value})} />
        <input placeholder="file_url 5..1000" value={evForm.file_url} onChange={e=>setEvForm({...evForm, file_url:e.target.value})} />
        <input placeholder="storage_key 5..500" value={evForm.storage_key} onChange={e=>setEvForm({...evForm, storage_key:e.target.value})} />
        <select value={evForm.before_after} onChange={e=>setEvForm({...evForm, before_after:e.target.value})}><option value="antes">antes</option><option value="depois">depois</option><option value="outro">outro</option></select>
        <label><input type="checkbox" checked={evForm.is_client_visible} onChange={e=>setEvForm({...evForm, is_client_visible:e.target.checked})} /> cliente visível (só se aprovado)</label>
        <input type="date" value={evForm.warranty_until} onChange={e=>setEvForm({...evForm, warranty_until:e.target.value})} />
        <input type="number" placeholder="cost_cents" value={evForm.cost_cents} onChange={e=>setEvForm({...evForm, cost_cents:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ast/service-order-evidences", {...evForm, cost_cents: evForm.cost_cents===""? null: Number(evForm.cost_cents)}); setMsg("evidência criada"); load(); } catch(e:any){ setMsg(e.message);} }}>Criar evidência</button>
      </div>
      <ul>{evidences.map((ev:any)=><li key={ev.id}>{ev.evidence_type} {ev.before_after} file:{ev.file_name} visível cliente:{String(ev.is_client_visible)} aprovado:{String(ev.is_approved)} custo:{ev.cost_cents} <button onClick={async()=>{ try{ const resp=await fetch("/api/ast/service-order-evidences", {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id:ev.id, is_approved:true, is_client_visible:true})}); const j=await resp.json(); if(!resp.ok) throw new Error(j.error); setMsg("evidência aprovada visível cliente"); load(); } catch(e:any){ setMsg(e.message);} }}>Aprovar visível cliente</button></li>)}</ul>

      <h3>AST-10 Manutenção preventiva/corretiva (asset_id, tipo preventiva/corretiva/preditiva/outro, title 5..200, desc 10..2000, periodicidade dias &gt;0, next_due_date, alerta dias, status agendada/em_execucao/concluida/atrasada/cancelada, próxima visita histórico por ativo)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="asset_id" value={maintForm.asset_id} onChange={e=>setMaintForm({...maintForm, asset_id:e.target.value})} />
        <select value={maintForm.maintenance_type} onChange={e=>setMaintForm({...maintForm, maintenance_type:e.target.value})}><option value="preventiva">preventiva</option><option value="corretiva">corretiva</option><option value="preditiva">preditiva</option><option value="outro">outro</option></select>
        <input placeholder="title 5..200" value={maintForm.title} onChange={e=>setMaintForm({...maintForm, title:e.target.value})} />
        <input placeholder="description 10..2000" value={maintForm.description} onChange={e=>setMaintForm({...maintForm, description:e.target.value})} />
        <input type="number" placeholder="periodicidade dias >0" value={maintForm.periodicity_days} onChange={e=>setMaintForm({...maintForm, periodicity_days:Number(e.target.value)})} />
        <input type="date" value={maintForm.next_due_date} onChange={e=>setMaintForm({...maintForm, next_due_date:e.target.value})} />
        <input type="number" placeholder="alerta dias" value={maintForm.alert_days_before} onChange={e=>setMaintForm({...maintForm, alert_days_before:Number(e.target.value)})} />
        <button onClick={async()=>{ try{ await post("/api/ast/maintenance-plans", maintForm); setMsg("plano manutenção criado"); load(); } catch(e:any){ setMsg(e.message);} }}>Criar plano</button>
      </div>
      <ul>{maintenancePlans.map((p:any)=><li key={p.id}>{p.title} tipo:{p.maintenance_type} asset:{p.serial_number} prox:{p.next_due_date} status:{p.status} periodicidade:{p.periodicity_days}d alerta:{p.alert_days_before}d</li>)}</ul>

      <h4>Execuções manutenção (executed_at, by 2..200, result 10..2000, next_due_date, cost, evidence storage_key UNIQUE)</h4>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="plan_id" value={execForm.plan_id} onChange={e=>setExecForm({...execForm, plan_id:e.target.value})} />
        <input placeholder="asset_id" value={execForm.asset_id} onChange={e=>setExecForm({...execForm, asset_id:e.target.value})} />
        <input type="date" value={execForm.executed_at} onChange={e=>setExecForm({...execForm, executed_at:e.target.value})} />
        <input placeholder="executado por 2..200" value={execForm.executed_by_name} onChange={e=>setExecForm({...execForm, executed_by_name:e.target.value})} />
        <input placeholder="result 10..2000" value={execForm.result} onChange={e=>setExecForm({...execForm, result:e.target.value})} />
        <input type="date" value={execForm.next_due_date} onChange={e=>setExecForm({...execForm, next_due_date:e.target.value})} />
        <input type="number" placeholder="cost_cents" value={execForm.cost_cents} onChange={e=>setExecForm({...execForm, cost_cents:e.target.value})} />
        <input placeholder="evidence file_url 5..1000" value={execForm.evidence_file_url} onChange={e=>setExecForm({...execForm, evidence_file_url:e.target.value})} />
        <input placeholder="evidence storage_key 5..500" value={execForm.evidence_storage_key} onChange={e=>setExecForm({...execForm, evidence_storage_key:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ast/maintenance-executions", {...execForm, cost_cents: execForm.cost_cents===""? null: Number(execForm.cost_cents)}); setMsg("execução manutenção criada"); load(); } catch(e:any){ setMsg(e.message);} }}>Registrar execução</button>
      </div>
      <ul>{executions.slice(0,20).map((ex:any)=><li key={ex.id}>plan:{ex.plan_id?.slice(0,8)} asset:{ex.asset_id?.slice(0,8)} exec:{ex.executed_at} por:{ex.executed_by_name} result:{ex.result?.slice(0,60)}</li>)}</ul>

      <h3>AST-11 Dossiê técnico CFTV (location 3..200, model 3..200, manufacturer 2..200, serial 3..200, ip 7..45, warranty, installation, doc file_url 5..1000 storage_key 5..500 UNIQUE, notes 10..2000, senhas fora cadastro/log comum password_reference 5..200 hint 10..500)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="client_account_id" value={cftvForm.client_account_id} onChange={e=>setCftvForm({...cftvForm, client_account_id:e.target.value})} />
        <input placeholder="contract_id" value={cftvForm.contract_id} onChange={e=>setCftvForm({...cftvForm, contract_id:e.target.value})} />
        <input placeholder="location 3..200" value={cftvForm.location} onChange={e=>setCftvForm({...cftvForm, location:e.target.value})} />
        <input placeholder="model 3..200" value={cftvForm.model} onChange={e=>setCftvForm({...cftvForm, model:e.target.value})} />
        <input placeholder="manufacturer 2..200" value={cftvForm.manufacturer} onChange={e=>setCftvForm({...cftvForm, manufacturer:e.target.value})} />
        <input placeholder="serial 3..200" value={cftvForm.serial_number} onChange={e=>setCftvForm({...cftvForm, serial_number:e.target.value})} />
        <input placeholder="ip 7..45" value={cftvForm.ip_address} onChange={e=>setCftvForm({...cftvForm, ip_address:e.target.value})} />
        <input type="date" value={cftvForm.warranty_until} onChange={e=>setCftvForm({...cftvForm, warranty_until:e.target.value})} />
        <input type="date" value={cftvForm.installation_date} onChange={e=>setCftvForm({...cftvForm, installation_date:e.target.value})} />
        <input placeholder="doc file_url 5..1000" value={cftvForm.documentation_file_url} onChange={e=>setCftvForm({...cftvForm, documentation_file_url:e.target.value})} />
        <input placeholder="doc storage_key 5..500" value={cftvForm.documentation_storage_key} onChange={e=>setCftvForm({...cftvForm, documentation_storage_key:e.target.value})} />
        <input placeholder="notes 10..2000" value={cftvForm.notes} onChange={e=>setCftvForm({...cftvForm, notes:e.target.value})} />
        <input placeholder="password ref 5..200" value={cftvForm.password_reference} onChange={e=>setCftvForm({...cftvForm, password_reference:e.target.value})} />
        <input placeholder="password hint 10..500" value={cftvForm.password_storage_hint} onChange={e=>setCftvForm({...cftvForm, password_storage_hint:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ast/cftv-dossiers", cftvForm); setMsg("dossiê CFTV criado senhas fora log"); load(); } catch(e:any){ setMsg(e.message);} }}>Criar dossiê CFTV</button>
      </div>
      <ul>{cftvDossiers.map((d:any)=><li key={d.id}>{d.model} loc:{d.location} serial:{d.serial_number} ip:{d.ip_address} garantia:{d.warranty_until} passRef:{d.password_reference}</li>)}</ul>

      <h3>AST-12 Materiais limpeza (product_id, location 3..200, expected &gt;=0, actual &gt;=0, variance GENERATED actual-expected, variance_percent GENERATED, period_start end CHECK end&gt;=start, needs_replacement, UNIQUE product/location/period)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="product_id" value={cleanForm.product_id} onChange={e=>setCleanForm({...cleanForm, product_id:e.target.value})} />
        <input placeholder="location 3..200" value={cleanForm.location} onChange={e=>setCleanForm({...cleanForm, location:e.target.value})} />
        <input type="number" placeholder="expected >=0" value={cleanForm.expected_consumption} onChange={e=>setCleanForm({...cleanForm, expected_consumption:Number(e.target.value)})} />
        <input type="number" placeholder="actual >=0" value={cleanForm.actual_consumption} onChange={e=>setCleanForm({...cleanForm, actual_consumption:Number(e.target.value)})} />
        <input type="date" value={cleanForm.period_start} onChange={e=>setCleanForm({...cleanForm, period_start:e.target.value})} />
        <input type="date" value={cleanForm.period_end} onChange={e=>setCleanForm({...cleanForm, period_end:e.target.value})} />
        <label><input type="checkbox" checked={cleanForm.needs_replacement} onChange={e=>setCleanForm({...cleanForm, needs_replacement:e.target.checked})} /> precisa reposição</label>
        <button onClick={async()=>{ try{ await post("/api/ast/cleaning-materials", cleanForm); setMsg("material limpeza criado variance GENERATED"); load(); } catch(e:any){ setMsg(e.message);} }}>Criar consumo limpeza</button>
      </div>
      <ul>{cleaningMaterials.map((c:any)=><li key={c.id}>prod:{c.product_name} loc:{c.location} exp:{c.expected_consumption} real:{c.actual_consumption} var:{c.variance} var%:{c.variance_percent} período:{c.period_start}/{c.period_end} reposição:{String(c.needs_replacement)}</li>)}</ul>
    </section>
  );
}
