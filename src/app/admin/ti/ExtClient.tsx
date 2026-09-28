"use client";
import { useEffect, useState } from "react";

export default function ExtClient() {
  const [fleet, setFleet] = useState<any[]>([]);
  const [fuel, setFuel] = useState<any[]>([]);
  const [maint, setMaint] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [third, setThird] = useState<any[]>([]);
  const [thirdDocs, setThirdDocs] = useState<any[]>([]);
  const [bidding, setBidding] = useState<any[]>([]);
  const [biddingDocs, setBiddingDocs] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [nonconf, setNonconf] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [satis, setSatis] = useState<any[]>([]);
  const [msg, setMsg] = useState<string>("");

  const [fleetForm, setFleetForm] = useState({ plate:"", model:"", manufacturer:"", year:2020, fuel_type:"flex", responsible_name:"", mileage:0, cost_center:"", notes:"" });
  const [fuelForm, setFuelForm] = useState({ vehicle_id:"", fuel_date:"", liters:0, cost_cents:0, mileage:0, station:"" });
  const [maintForm, setMaintForm] = useState({ vehicle_id:"", maintenance_type:"", description:"", cost_cents:0, mileage:0, performed_at:"", next_due_date:"" });
  const [docForm, setDocForm] = useState({ vehicle_id:"", document_type:"", document_number:"", expiry_date:"", file_name:"", file_url:"", storage_key:"" });
  const [thirdForm, setThirdForm] = useState({ name:"", document:"", category:"", contract_id:"", responsible_name:"", access_start:"", access_end:"", evaluation_score:0, notes:"" });
  const [thirdDocForm, setThirdDocForm] = useState({ third_party_id:"", document_type:"", file_name:"", file_url:"", storage_key:"", expiry_date:"" });
  const [bidForm, setBidForm] = useState({ title:"", description:"", edital_number:"", publication_date:"", deadline_date:"", responsible_name:"", estimated_value_cents:0 });
  const [bidDocForm, setBidDocForm] = useState({ bidding_id:"", document_type:"", file_name:"", file_url:"", storage_key:"" });
  const [quotForm, setQuotForm] = useState({ supplier_id:"", product_id:"", quantity:1, unit_price_cents:0, total_price_cents:0, notes:"", is_visible_to_supplier:false });
  const [qualForm, setQualForm] = useState({ title:"", description:"", category:"", severity:"media", responsible_name:"", related_contract_id:"" });
  const [qualActionForm, setQualActionForm] = useState({ nonconformity_id:"", action_type:"", description:"", responsible_name:"", due_date:"" });
  const [satForm, setSatForm] = useState({ client_account_id:"", contract_id:"", survey_type:"pesquisa", score:5, comment:"", recovery_task:"" });

  const load = async () => {
    try {
      const [fR, fuR, maR, dR, tR, tdR, bR, bdR, qR, ncR, aR, sR] = await Promise.all([
        fetch("/api/ext/fleet-vehicles").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/fleet-fuel-logs").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/fleet-maintenance-logs").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/fleet-documents").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/third-parties").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/third-party-documents").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/bidding-notices").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/bidding-documents").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/supplier-portal-quotations").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/quality-nonconformities").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/quality-actions").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/satisfaction-surveys").then(r=>r.json()).catch(()=>({items:[]})),
      ]);
      setFleet(fR.items||[]); setFuel(fuR.items||[]); setMaint(maR.items||[]); setDocs(dR.items||[]); setThird(tR.items||[]); setThirdDocs(tdR.items||[]); setBidding(bR.items||[]); setBiddingDocs(bdR.items||[]); setQuotations(qR.items||[]); setNonconf(ncR.items||[]); setActions(aR.items||[]); setSatis(sR.items||[]);
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
      <h2>EXT-01..06 — Frota, terceiros, licitações, fornecedores, qualidade, satisfação</h2>
      {msg && <p style={{color:"red"}}>{msg}</p>}

      <h3>EXT-01 Veículos (placa 3..20 UNIQUE, modelo 3..200, fabricante 2..200, ano 1900..2100, combustivel gasolina/etanol/diesel/flex/eletrico/hibrido/outro, responsavel 2..200, km, centro custo 3..100, notas 10..1000, status disponivel/em_uso/em_manutencao/baixado/reservado)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="placa 3..20" value={fleetForm.plate} onChange={e=>setFleetForm({...fleetForm, plate:e.target.value})} />
        <input placeholder="modelo 3..200" value={fleetForm.model} onChange={e=>setFleetForm({...fleetForm, model:e.target.value})} />
        <input placeholder="fabricante 2..200" value={fleetForm.manufacturer} onChange={e=>setFleetForm({...fleetForm, manufacturer:e.target.value})} />
        <input type="number" placeholder="ano" value={fleetForm.year} onChange={e=>setFleetForm({...fleetForm, year:Number(e.target.value)})} />
        <select value={fleetForm.fuel_type} onChange={e=>setFleetForm({...fleetForm, fuel_type:e.target.value})}>
          <option value="gasolina">gasolina</option><option value="etanol">etanol</option><option value="diesel">diesel</option><option value="flex">flex</option><option value="eletrico">eletrico</option><option value="hibrido">hibrido</option><option value="outro">outro</option>
        </select>
        <input placeholder="responsável 2..200" value={fleetForm.responsible_name} onChange={e=>setFleetForm({...fleetForm, responsible_name:e.target.value})} />
        <input type="number" placeholder="km" value={fleetForm.mileage} onChange={e=>setFleetForm({...fleetForm, mileage:Number(e.target.value)})} />
        <input placeholder="centro custo 3..100" value={fleetForm.cost_center} onChange={e=>setFleetForm({...fleetForm, cost_center:e.target.value})} />
        <input placeholder="notas 10..1000" value={fleetForm.notes} onChange={e=>setFleetForm({...fleetForm, notes:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ext/fleet-vehicles", fleetForm); setMsg("veículo criado histórico/custo por veículo alerta manutenção"); setFleetForm({plate:"",model:"",manufacturer:"",year:2020,fuel_type:"flex",responsible_name:"",mileage:0,cost_center:"",notes:""}); load(); } catch(e:any){ setMsg(e.message); } }}>Criar veículo</button>
      </div>
      <ul>{fleet.map((v:any)=><li key={v.id}>{v.plate} {v.model} fab:{v.manufacturer} ano:{v.year} fuel:{v.fuel_type} status:{v.status} resp:{v.responsible_name} km:{v.mileage} centro:{v.cost_center} proxMan:{v.next_maintenance_date}</li>)}</ul>

      <h3>EXT-01 Abastecimentos (vehicle_id, fuel_date, liters&gt;0, cost_cents, km, posto 3..200)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="vehicle_id" value={fuelForm.vehicle_id} onChange={e=>setFuelForm({...fuelForm, vehicle_id:e.target.value})} />
        <input type="date" value={fuelForm.fuel_date} onChange={e=>setFuelForm({...fuelForm, fuel_date:e.target.value})} />
        <input type="number" step="0.01" placeholder="litros maior 0" value={fuelForm.liters} onChange={e=>setFuelForm({...fuelForm, liters:Number(e.target.value)})} />
        <input type="number" placeholder="custo cents" value={fuelForm.cost_cents} onChange={e=>setFuelForm({...fuelForm, cost_cents:Number(e.target.value)})} />
        <input type="number" placeholder="km" value={fuelForm.mileage} onChange={e=>setFuelForm({...fuelForm, mileage:Number(e.target.value)})} />
        <input placeholder="posto 3..200" value={fuelForm.station} onChange={e=>setFuelForm({...fuelForm, station:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ext/fleet-fuel-logs", fuelForm); setMsg("abastecimento registrado custo por veículo"); load(); } catch(e:any){ setMsg(e.message); } }}>Registrar abastecimento</button>
      </div>
      <ul>{fuel.slice(0,20).map((f:any)=><li key={f.id}>veíc:{f.plate||f.vehicle_id} data:{f.fuel_date} L:{f.liters} custo:{f.cost_cents} km:{f.mileage} posto:{f.station}</li>)}</ul>

      <h3>EXT-01 Manutenções (vehicle_id, tipo 3..100, desc 10..2000, custo, km, performed_at, next_due)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="vehicle_id" value={maintForm.vehicle_id} onChange={e=>setMaintForm({...maintForm, vehicle_id:e.target.value})} />
        <input placeholder="tipo 3..100" value={maintForm.maintenance_type} onChange={e=>setMaintForm({...maintForm, maintenance_type:e.target.value})} />
        <input placeholder="descrição 10..2000" value={maintForm.description} onChange={e=>setMaintForm({...maintForm, description:e.target.value})} />
        <input type="number" placeholder="custo cents" value={maintForm.cost_cents} onChange={e=>setMaintForm({...maintForm, cost_cents:Number(e.target.value)})} />
        <input type="number" placeholder="km" value={maintForm.mileage} onChange={e=>setMaintForm({...maintForm, mileage:Number(e.target.value)})} />
        <input type="datetime-local" value={maintForm.performed_at} onChange={e=>setMaintForm({...maintForm, performed_at:e.target.value})} />
        <input type="date" value={maintForm.next_due_date} onChange={e=>setMaintForm({...maintForm, next_due_date:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ext/fleet-maintenance-logs", maintForm); setMsg("manutenção registrada alerta próxima"); load(); } catch(e:any){ setMsg(e.message); } }}>Registrar manutenção</button>
      </div>
      <ul>{maint.slice(0,20).map((m:any)=><li key={m.id}>veíc:{m.plate||m.vehicle_id} tipo:{m.maintenance_type} custo:{m.cost_cents} km:{m.mileage} exec:{m.performed_at} prox:{m.next_due_date}</li>)}</ul>

      <h3>EXT-01 Documentos frota (vehicle_id, tipo 3..100, número 3..200, validade, file_name 1..500, file_url 5..1000, storage_key 5..500 UNIQUE)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="vehicle_id" value={docForm.vehicle_id} onChange={e=>setDocForm({...docForm, vehicle_id:e.target.value})} />
        <input placeholder="tipo doc 3..100" value={docForm.document_type} onChange={e=>setDocForm({...docForm, document_type:e.target.value})} />
        <input placeholder="número 3..200" value={docForm.document_number} onChange={e=>setDocForm({...docForm, document_number:e.target.value})} />
        <input type="date" value={docForm.expiry_date} onChange={e=>setDocForm({...docForm, expiry_date:e.target.value})} />
        <input placeholder="file_name 1..500" value={docForm.file_name} onChange={e=>setDocForm({...docForm, file_name:e.target.value})} />
        <input placeholder="file_url 5..1000" value={docForm.file_url} onChange={e=>setDocForm({...docForm, file_url:e.target.value})} />
        <input placeholder="storage_key 5..500 UNIQUE" value={docForm.storage_key} onChange={e=>setDocForm({...docForm, storage_key:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ext/fleet-documents", docForm); setMsg("documento frota criado"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar doc frota</button>
      </div>
      <ul>{docs.map((d:any)=><li key={d.id}>veíc:{d.vehicle_id} tipo:{d.document_type} num:{d.document_number} val:{d.expiry_date} file:{d.file_name}</li>)}</ul>

      <h3>EXT-02 Terceiros (nome 3..200, doc 3..30, categoria 3..100, contract_id FK, responsável 2..200, acesso início/fim, avaliação 0..10, notas 10..1000, status ativo/inativo/suspenso/encerrado — acessa só OS/contrato autorizado perde acesso ao término)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="nome 3..200" value={thirdForm.name} onChange={e=>setThirdForm({...thirdForm, name:e.target.value})} />
        <input placeholder="doc 3..30" value={thirdForm.document} onChange={e=>setThirdForm({...thirdForm, document:e.target.value})} />
        <input placeholder="categoria 3..100" value={thirdForm.category} onChange={e=>setThirdForm({...thirdForm, category:e.target.value})} />
        <input placeholder="contract_id" value={thirdForm.contract_id} onChange={e=>setThirdForm({...thirdForm, contract_id:e.target.value})} />
        <input placeholder="responsável 2..200" value={thirdForm.responsible_name} onChange={e=>setThirdForm({...thirdForm, responsible_name:e.target.value})} />
        <input type="datetime-local" value={thirdForm.access_start} onChange={e=>setThirdForm({...thirdForm, access_start:e.target.value})} />
        <input type="datetime-local" value={thirdForm.access_end} onChange={e=>setThirdForm({...thirdForm, access_end:e.target.value})} />
        <input type="number" min="0" max="10" step="0.1" placeholder="avaliação 0..10" value={thirdForm.evaluation_score} onChange={e=>setThirdForm({...thirdForm, evaluation_score:Number(e.target.value)})} />
        <input placeholder="notas 10..1000" value={thirdForm.notes} onChange={e=>setThirdForm({...thirdForm, notes:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ext/third-parties", thirdForm); setMsg("terceiro criado só acessa OS/contrato autorizado"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar terceiro</button>
      </div>
      <ul>{third.map((t:any)=><li key={t.id}>{t.name} doc:{t.document} cat:{t.category} contrato:{t.contract_title||t.contract_id} status:{t.status} acesso:{t.access_start}→{t.access_end} aval:{t.evaluation_score} <button onClick={async()=>{ try{ const r=await fetch("/api/ext/third-parties",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:t.id,status:"encerrado"})}); const j=await r.json(); if(!r.ok) throw new Error(j.error); setMsg("terceiro encerrado perde acesso ao término revogado"); load(); } catch(e:any){ setMsg(e.message);} }}>Encerrar</button></li>)}</ul>

      <h3>EXT-02 Documentos terceiros (third_party_id, tipo 3..100, file_name 1..500, file_url 5..1000, storage_key 5..500 UNIQUE, validade)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="third_party_id" value={thirdDocForm.third_party_id} onChange={e=>setThirdDocForm({...thirdDocForm, third_party_id:e.target.value})} />
        <input placeholder="tipo 3..100" value={thirdDocForm.document_type} onChange={e=>setThirdDocForm({...thirdDocForm, document_type:e.target.value})} />
        <input placeholder="file_name" value={thirdDocForm.file_name} onChange={e=>setThirdDocForm({...thirdDocForm, file_name:e.target.value})} />
        <input placeholder="file_url" value={thirdDocForm.file_url} onChange={e=>setThirdDocForm({...thirdDocForm, file_url:e.target.value})} />
        <input placeholder="storage_key UNIQUE" value={thirdDocForm.storage_key} onChange={e=>setThirdDocForm({...thirdDocForm, storage_key:e.target.value})} />
        <input type="date" value={thirdDocForm.expiry_date} onChange={e=>setThirdDocForm({...thirdDocForm, expiry_date:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ext/third-party-documents", thirdDocForm); setMsg("doc terceiro criado"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar doc terceiro</button>
      </div>
      <ul>{thirdDocs.map((d:any)=><li key={d.id}>terc:{d.third_party_id} tipo:{d.document_type} val:{d.expiry_date}</li>)}</ul>

      <h3>EXT-03 Licitações (título 5..200, desc 10..2000, edital 3..200 UNIQUE, publicação/deadline deadline&gt;=publication, responsável 2..200, valor estimado, status rascunho/publicado/em_analise/homologado/vencido/cancelado/deserto, protocolo LIC-EXT-)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="título 5..200" value={bidForm.title} onChange={e=>setBidForm({...bidForm, title:e.target.value})} />
        <input placeholder="descrição 10..2000" value={bidForm.description} onChange={e=>setBidForm({...bidForm, description:e.target.value})} />
        <input placeholder="edital 3..200 UNIQUE" value={bidForm.edital_number} onChange={e=>setBidForm({...bidForm, edital_number:e.target.value})} />
        <input type="date" value={bidForm.publication_date} onChange={e=>setBidForm({...bidForm, publication_date:e.target.value})} />
        <input type="date" value={bidForm.deadline_date} onChange={e=>setBidForm({...bidForm, deadline_date:e.target.value})} />
        <input placeholder="responsável 2..200" value={bidForm.responsible_name} onChange={e=>setBidForm({...bidForm, responsible_name:e.target.value})} />
        <input type="number" placeholder="valor estimado cents" value={bidForm.estimated_value_cents} onChange={e=>setBidForm({...bidForm, estimated_value_cents:Number(e.target.value)})} />
        <button onClick={async()=>{ try{ await post("/api/ext/bidding-notices", bidForm); setMsg("licitação criada checklist alerta edital"); setBidForm({title:"",description:"",edital_number:"",publication_date:"",deadline_date:"",responsible_name:"",estimated_value_cents:0}); load(); } catch(e:any){ setMsg(e.message); } }}>Criar edital</button>
      </div>
      <ul>{bidding.map((b:any)=><li key={b.id}>{b.protocol} {b.title} edital:{b.edital_number} status:{b.status} pub:{b.publication_date} prazo:{b.deadline_date} valor:{b.estimated_value_cents}</li>)}</ul>

      <h3>EXT-03 Dossiê licitação versionado (bidding_id, tipo 3..100, file_name 1..500, file_url 5..1000, storage_key 5..500 UNIQUE, versão auto)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="bidding_id" value={bidDocForm.bidding_id} onChange={e=>setBidDocForm({...bidDocForm, bidding_id:e.target.value})} />
        <input placeholder="tipo 3..100" value={bidDocForm.document_type} onChange={e=>setBidDocForm({...bidDocForm, document_type:e.target.value})} />
        <input placeholder="file_name" value={bidDocForm.file_name} onChange={e=>setBidDocForm({...bidDocForm, file_name:e.target.value})} />
        <input placeholder="file_url" value={bidDocForm.file_url} onChange={e=>setBidDocForm({...bidDocForm, file_url:e.target.value})} />
        <input placeholder="storage_key UNIQUE" value={bidDocForm.storage_key} onChange={e=>setBidDocForm({...bidDocForm, storage_key:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ext/bidding-documents", bidDocForm); setMsg("dossiê versionado criado"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar doc edital</button>
      </div>
      <ul>{biddingDocs.map((d:any)=><li key={d.id}>edital:{d.bidding_id} tipo:{d.document_type} v:{d.version} file:{d.file_name}</li>)}</ul>

      <h3>EXT-04 Portal fornecedores (supplier_id FK ast_suppliers, product_id FK ast_products, quantity&gt;0, unit/total cents, notas 10..1000, is_visible_to_supplier bool, status rascunho/enviado/em_analise/aprovado/rejeitado/cancelado, protocolo FORN-EXT- — fornecedor não vê concorrente nem dados RH)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="supplier_id" value={quotForm.supplier_id} onChange={e=>setQuotForm({...quotForm, supplier_id:e.target.value})} />
        <input placeholder="product_id" value={quotForm.product_id} onChange={e=>setQuotForm({...quotForm, product_id:e.target.value})} />
        <input type="number" placeholder="quantity maior 0" value={quotForm.quantity} onChange={e=>setQuotForm({...quotForm, quantity:Number(e.target.value)})} />
        <input type="number" placeholder="unit cents" value={quotForm.unit_price_cents} onChange={e=>setQuotForm({...quotForm, unit_price_cents:Number(e.target.value)})} />
        <input type="number" placeholder="total cents" value={quotForm.total_price_cents} onChange={e=>setQuotForm({...quotForm, total_price_cents:Number(e.target.value)})} />
        <input placeholder="notas 10..1000" value={quotForm.notes} onChange={e=>setQuotForm({...quotForm, notes:e.target.value})} />
        <label><input type="checkbox" checked={quotForm.is_visible_to_supplier} onChange={e=>setQuotForm({...quotForm, is_visible_to_supplier:e.target.checked})} /> visível ao fornecedor</label>
        <button onClick={async()=>{ try{ await post("/api/ext/supplier-portal-quotations", quotForm); setMsg("cotação fornecedor criada não vê concorrente"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar cotação fornecedor</button>
      </div>
      <ul>{quotations.map((q:any)=><li key={q.id}>{q.protocol} forn:{q.supplier_name||q.supplier_id} prod:{q.product_name||q.product_id} q:{q.quantity} unit:{q.unit_price_cents} total:{q.total_price_cents} status:{q.status} visível:{String(q.is_visible_to_supplier)}</li>)}</ul>

      <h3>EXT-05 Qualidade não conformidades (título 5..200, desc 10..2000, categoria 3..100, severidade baixa/media/alta/critica, responsável 2..200, protocolo QUAL-EXT-, status aberta/em_analise/em_acao_corretiva/verificacao/encerrada/reaberta, encerrar apenas com evidência e responsável causa/corrective/verification 10..)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="título 5..200" value={qualForm.title} onChange={e=>setQualForm({...qualForm, title:e.target.value})} />
        <input placeholder="descrição 10..2000" value={qualForm.description} onChange={e=>setQualForm({...qualForm, description:e.target.value})} />
        <input placeholder="categoria 3..100" value={qualForm.category} onChange={e=>setQualForm({...qualForm, category:e.target.value})} />
        <select value={qualForm.severity} onChange={e=>setQualForm({...qualForm, severity:e.target.value})}>
          <option value="baixa">baixa</option><option value="media">media</option><option value="alta">alta</option><option value="critica">critica</option>
        </select>
        <input placeholder="responsável 2..200" value={qualForm.responsible_name} onChange={e=>setQualForm({...qualForm, responsible_name:e.target.value})} />
        <input placeholder="related_contract_id" value={qualForm.related_contract_id} onChange={e=>setQualForm({...qualForm, related_contract_id:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ext/quality-nonconformities", qualForm); setMsg("não conformidade criada encerrar só com evidência"); setQualForm({title:"",description:"",category:"",severity:"media",responsible_name:"",related_contract_id:""}); load(); } catch(e:any){ setMsg(e.message); } }}>Criar NC</button>
      </div>
      <ul>{nonconf.map((n:any)=><li key={n.id}>{n.protocol} {n.title} cat:{n.category} sev:{n.severity} status:{n.status} resp:{n.responsible_name} causa:{n.cause?.slice(0,40)} corr:{n.corrective_action?.slice(0,40)} verif:{n.verification?.slice(0,40)}</li>)}</ul>

      <h3>EXT-05 Ações qualidade (nonconformity_id, tipo 3..100, desc 10..2000, responsável 2..200, due_date, status pendente/concluida/cancelada)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="nonconformity_id" value={qualActionForm.nonconformity_id} onChange={e=>setQualActionForm({...qualActionForm, nonconformity_id:e.target.value})} />
        <input placeholder="tipo ação 3..100" value={qualActionForm.action_type} onChange={e=>setQualActionForm({...qualActionForm, action_type:e.target.value})} />
        <input placeholder="descrição 10..2000" value={qualActionForm.description} onChange={e=>setQualActionForm({...qualActionForm, description:e.target.value})} />
        <input placeholder="responsável 2..200" value={qualActionForm.responsible_name} onChange={e=>setQualActionForm({...qualActionForm, responsible_name:e.target.value})} />
        <input type="date" value={qualActionForm.due_date} onChange={e=>setQualActionForm({...qualActionForm, due_date:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ext/quality-actions", qualActionForm); setMsg("ação qualidade criada"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar ação</button>
      </div>
      <ul>{actions.map((a:any)=><li key={a.id}>nc:{a.nonconformity_id} tipo:{a.action_type} status:{a.status} resp:{a.responsible_name} due:{a.due_date}</li>)}</ul>

      <h3>EXT-06 Satisfação (client_account_id, contract_id, tipo pesquisa/csat/nps/outro, score 0..10, comment 10..2000, recovery_task 10..2000, status pendente/em_acompanhamento/concluida/cancelada, protocolo SAT-EXT- — resposta gera acompanhamento sem expor funcionário)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="client_account_id" value={satForm.client_account_id} onChange={e=>setSatForm({...satForm, client_account_id:e.target.value})} />
        <input placeholder="contract_id" value={satForm.contract_id} onChange={e=>setSatForm({...satForm, contract_id:e.target.value})} />
        <select value={satForm.survey_type} onChange={e=>setSatForm({...satForm, survey_type:e.target.value})}>
          <option value="pesquisa">pesquisa</option><option value="csat">csat</option><option value="nps">nps</option><option value="outro">outro</option>
        </select>
        <input type="number" min="0" max="10" value={satForm.score} onChange={e=>setSatForm({...satForm, score:Number(e.target.value)})} />
        <input placeholder="comment 10..2000" value={satForm.comment} onChange={e=>setSatForm({...satForm, comment:e.target.value})} />
        <input placeholder="recovery 10..2000" value={satForm.recovery_task} onChange={e=>setSatForm({...satForm, recovery_task:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ext/satisfaction-surveys", satForm); setMsg("pesquisa satisfação criada gera acompanhamento sem expor funcionário"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar pesquisa</button>
      </div>
      <ul>{satis.map((s:any)=><li key={s.id}>{s.protocol} cliente:{s.client_name||s.client_account_id} tipo:{s.survey_type} score:{s.score} status:{s.status} comment:{s.comment?.slice(0,60)}</li>)}</ul>
    </section>
  );
}
