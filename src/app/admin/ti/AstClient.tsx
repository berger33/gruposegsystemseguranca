"use client";
import { useEffect, useState } from "react";

export default function AstClient() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [quotations, setQuotations] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [msg, setMsg] = useState<string>("");

  // forms
  const [supForm, setSupForm] = useState({ name:"", document:"", contact_name:"", contact_email:"", address:"", category:"" });
  const [prodForm, setProdForm] = useState({ sku:"", name:"", description:"", category:"", unit_measure:"", cost_cents:0, sale_price_cents:0, stock_min:0, location:"", supplier_id:"" });
  const [movForm, setMovForm] = useState({ product_id:"", movement_type:"entrada", quantity:1, reason:"", reference_type:"", reference_id:"", from_location:"", to_location:"" });
  const [resForm, setResForm] = useState({ product_id:"", quantity:1, reservation_type:"proposta", reference_type:"proposta", reference_id:"", expires_at:"" });
  const [assetForm, setAssetForm] = useState({ product_id:"", serial_number:"", owner_type:"empresa", owner_name:"Grupo SEG", warranty_until:"", status:"disponivel", notes:"" });
  const [delForm, setDelForm] = useState({ asset_id:"", delivery_type:"entrega", delivered_to_name:"", condition_before:"", condition_after:"", conference_notes:"" });
  const [reqForm, setReqForm] = useState({ product_id:"", quantity:1, requester_name:"", urgency:"media", reason:"" });
  const [quotForm, setQuotForm] = useState({ requisition_id:"", supplier_id:"", unit_price_cents:0, total_price_cents:0, delivery_days:0, notes:"" });
  const [orderForm, setOrderForm] = useState({ requisition_id:"", supplier_id:"", total_amount_cents:0, file_url:"", storage_key:"", notes:"" });

  const load = async () => {
    try {
      const [supR, prodR, movR, resR, assetR, delR, reqR, quotR, orderR] = await Promise.all([
        fetch("/api/ast/suppliers").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ast/products").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ast/stock-movements").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ast/reservations").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ast/serialized-assets").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ast/deliveries").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ast/requisitions").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ast/quotations").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ast/purchase-orders").then(r=>r.json()).catch(()=>({items:[]})),
      ]);
      setSuppliers(supR.items||[]); setProducts(prodR.items||[]); setMovements(movR.items||[]); setReservations(resR.items||[]); setAssets(assetR.items||[]); setDeliveries(delR.items||[]); setRequisitions(reqR.items||[]); setQuotations(quotR.items||[]); setOrders(orderR.items||[]);
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
      <h2>AST-01..06 — Produtos/SKU, fornecedores, estoque, reserva, ativos serializados, entrega, requisição/cotação/pedido</h2>
      {msg && <p style={{color:"red"}}>{msg}</p>}

      <h3>AST-01 Fornecedores (nome 3..200 UNIQUE)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="nome 3..200" value={supForm.name} onChange={e=>setSupForm({...supForm, name:e.target.value})} />
        <input placeholder="documento 3..30" value={supForm.document} onChange={e=>setSupForm({...supForm, document:e.target.value})} />
        <input placeholder="contato 2..200" value={supForm.contact_name} onChange={e=>setSupForm({...supForm, contact_name:e.target.value})} />
        <input placeholder="email 5..320" value={supForm.contact_email} onChange={e=>setSupForm({...supForm, contact_email:e.target.value})} />
        <input placeholder="endereço 10..500" value={supForm.address} onChange={e=>setSupForm({...supForm, address:e.target.value})} />
        <input placeholder="categoria 3..100" value={supForm.category} onChange={e=>setSupForm({...supForm, category:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ast/suppliers", supForm); setMsg("fornecedor criado"); setSupForm({name:"",document:"",contact_name:"",contact_email:"",address:"",category:""}); load(); } catch(e:any){ setMsg(e.message); } }}>Criar fornecedor</button>
      </div>
      <ul>{suppliers.map((s:any)=><li key={s.id}>{s.name} doc:{s.document} cat:{s.category} ativo:{String(s.is_active)}</li>)}</ul>

      <h3>AST-01 Produtos (SKU 3..100 UNIQUE, nome 3..200, desc 10..2000, categoria 3..100, unidade 2..50, custo, estoque mínimo, local 3..200)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="sku 3..100" value={prodForm.sku} onChange={e=>setProdForm({...prodForm, sku:e.target.value})} />
        <input placeholder="nome 3..200" value={prodForm.name} onChange={e=>setProdForm({...prodForm, name:e.target.value})} />
        <input placeholder="descrição 10..2000" value={prodForm.description} onChange={e=>setProdForm({...prodForm, description:e.target.value})} />
        <input placeholder="categoria 3..100" value={prodForm.category} onChange={e=>setProdForm({...prodForm, category:e.target.value})} />
        <input placeholder="unidade 2..50" value={prodForm.unit_measure} onChange={e=>setProdForm({...prodForm, unit_measure:e.target.value})} />
        <input type="number" placeholder="custo cents" value={prodForm.cost_cents} onChange={e=>setProdForm({...prodForm, cost_cents:Number(e.target.value)})} />
        <input type="number" placeholder="venda cents" value={prodForm.sale_price_cents} onChange={e=>setProdForm({...prodForm, sale_price_cents:Number(e.target.value)})} />
        <input type="number" placeholder="estoque min" value={prodForm.stock_min} onChange={e=>setProdForm({...prodForm, stock_min:Number(e.target.value)})} />
        <input placeholder="local 3..200" value={prodForm.location} onChange={e=>setProdForm({...prodForm, location:e.target.value})} />
        <input placeholder="supplier_id" value={prodForm.supplier_id} onChange={e=>setProdForm({...prodForm, supplier_id:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ast/products", prodForm); setMsg("produto criado"); setProdForm({sku:"",name:"",description:"",category:"",unit_measure:"",cost_cents:0,sale_price_cents:0,stock_min:0,location:"",supplier_id:""}); load(); } catch(e:any){ setMsg(e.message); } }}>Criar produto</button>
      </div>
      <ul>{products.map((p:any)=><li key={p.id}>{p.sku} {p.name} cat:{p.category} un:{p.unit_measure} custo:{p.cost_cents} estoque:{p.stock_current} min:{p.stock_min} local:{p.location} fornecedor:{p.supplier_name}</li>)}</ul>

      <h3>AST-02 Movimentações (entrada/saida/transferencia/ajuste/reserva/liberacao/conversao/cancelamento, quantity !=0, reason 10..1000, saldo derivado trigger)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="product_id" value={movForm.product_id} onChange={e=>setMovForm({...movForm, product_id:e.target.value})} />
        <select value={movForm.movement_type} onChange={e=>setMovForm({...movForm, movement_type:e.target.value})}>
          <option value="entrada">entrada</option><option value="saida">saida</option><option value="transferencia">transferencia</option><option value="ajuste">ajuste</option><option value="reserva">reserva</option><option value="liberacao">liberacao</option><option value="conversao">conversao</option><option value="cancelamento">cancelamento</option>
        </select>
        <input type="number" placeholder="quantity !=0" value={movForm.quantity} onChange={e=>setMovForm({...movForm, quantity:Number(e.target.value)})} />
        <input placeholder="reason 10..1000" value={movForm.reason} onChange={e=>setMovForm({...movForm, reason:e.target.value})} />
        <input placeholder="ref type 3..100" value={movForm.reference_type} onChange={e=>setMovForm({...movForm, reference_type:e.target.value})} />
        <input placeholder="ref id 3..200" value={movForm.reference_id} onChange={e=>setMovForm({...movForm, reference_id:e.target.value})} />
        <input placeholder="from loc 3..200" value={movForm.from_location} onChange={e=>setMovForm({...movForm, from_location:e.target.value})} />
        <input placeholder="to loc 3..200" value={movForm.to_location} onChange={e=>setMovForm({...movForm, to_location:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ast/stock-movements", movForm); setMsg("movimentação criada saldo derivado"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar movimento</button>
      </div>
      <ul>{movements.slice(0,20).map((m:any)=><li key={m.id}>{m.movement_type} q:{m.quantity} prod:{m.product_name} reason:{m.reason?.slice(0,60)} ref:{m.reference_type}/{m.reference_id}</li>)}</ul>

      <h3>AST-03 Reservas (proposta/implantacao/os/manutencao/outro, quantity&gt;0, ref type 3..100 ref id 3..200, status reservado/liberado/convertido/cancelado/expirado, sem confundir reserva com saída)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="product_id" value={resForm.product_id} onChange={e=>setResForm({...resForm, product_id:e.target.value})} />
        <input type="number" placeholder="quantity >0" value={resForm.quantity} onChange={e=>setResForm({...resForm, quantity:Number(e.target.value)})} />
        <select value={resForm.reservation_type} onChange={e=>setResForm({...resForm, reservation_type:e.target.value})}>
          <option value="proposta">proposta</option><option value="implantacao">implantacao</option><option value="os">os</option><option value="manutencao">manutencao</option><option value="outro">outro</option>
        </select>
        <input placeholder="ref type 3..100" value={resForm.reference_type} onChange={e=>setResForm({...resForm, reference_type:e.target.value})} />
        <input placeholder="ref id 3..200" value={resForm.reference_id} onChange={e=>setResForm({...resForm, reference_id:e.target.value})} />
        <input type="datetime-local" value={resForm.expires_at} onChange={e=>setResForm({...resForm, expires_at:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ast/reservations", resForm); setMsg("reserva criada sem confundir com saída"); load(); } catch(e:any){ setMsg(e.message); } }}>Reservar</button>
      </div>
      <ul>{reservations.map((r:any)=><li key={r.id}>{r.reservation_type} q:{r.quantity} prod:{r.product_name} status:{r.status} ref:{r.reference_type}/{r.reference_id} disponível:{r.stock_current} <button onClick={async()=>{ try{ const resp=await fetch("/api/ast/reservations", {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id:r.id, action:"liberar"})}); const j=await resp.json(); if(!resp.ok) throw new Error(j.error); setMsg("reserva liberada"); load(); } catch(e:any){ setMsg(e.message);} }}>Liberar</button> <button onClick={async()=>{ try{ const resp=await fetch("/api/ast/reservations", {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id:r.id, action:"converter"})}); const j=await resp.json(); if(!resp.ok) throw new Error(j.error); setMsg("reserva convertida em saída"); load(); } catch(e:any){ setMsg(e.message);} }}>Converter</button> <button onClick={async()=>{ try{ const resp=await fetch("/api/ast/reservations", {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id:r.id, action:"cancelar"})}); const j=await resp.json(); if(!resp.ok) throw new Error(j.error); setMsg("reserva cancelada"); load(); } catch(e:any){ setMsg(e.message);} }}>Cancelar</button></li>)}</ul>

      <h3>AST-04 Ativos serializados (serial 3..200 UNIQUE, cliente/posto/colaborador, proprietário, garantia, termo guarda file_url 5..1000 storage_key 5..500 UNIQUE)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="product_id" value={assetForm.product_id} onChange={e=>setAssetForm({...assetForm, product_id:e.target.value})} />
        <input placeholder="serial 3..200" value={assetForm.serial_number} onChange={e=>setAssetForm({...assetForm, serial_number:e.target.value})} />
        <input placeholder="owner_type 3..100" value={assetForm.owner_type} onChange={e=>setAssetForm({...assetForm, owner_type:e.target.value})} />
        <input placeholder="owner_name 2..200" value={assetForm.owner_name} onChange={e=>setAssetForm({...assetForm, owner_name:e.target.value})} />
        <input type="date" value={assetForm.warranty_until} onChange={e=>setAssetForm({...assetForm, warranty_until:e.target.value})} />
        <select value={assetForm.status} onChange={e=>setAssetForm({...assetForm, status:e.target.value})}>
          <option value="disponivel">disponivel</option><option value="em_uso">em_uso</option><option value="em_manutencao">em_manutencao</option><option value="perdido">perdido</option><option value="avariado">avariado</option><option value="devolvido">devolvido</option><option value="reservado">reservado</option><option value="baixado">baixado</option>
        </select>
        <input placeholder="notes 10..1000" value={assetForm.notes} onChange={e=>setAssetForm({...assetForm, notes:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ast/serialized-assets", assetForm); setMsg("ativo serializado criado"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar ativo</button>
      </div>
      <ul>{assets.map((a:any)=><li key={a.id}>{a.serial_number} prod:{a.product_name} owner:{a.owner_type}/{a.owner_name} status:{a.status} garantia:{a.warranty_until}</li>)}</ul>

      <h3>AST-05 Entrega/devolução/avaria/perda/conferencia/transferencia (delivered_to 2..200, condition 10..1000, fotos JSONB, conferência 10..1000)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="asset_id" value={delForm.asset_id} onChange={e=>setDelForm({...delForm, asset_id:e.target.value})} />
        <select value={delForm.delivery_type} onChange={e=>setDelForm({...delForm, delivery_type:e.target.value})}>
          <option value="entrega">entrega</option><option value="devolucao">devolucao</option><option value="avaria">avaria</option><option value="perda">perda</option><option value="conferencia">conferencia</option><option value="transferencia">transferencia</option>
        </select>
        <input placeholder="entregue para 2..200" value={delForm.delivered_to_name} onChange={e=>setDelForm({...delForm, delivered_to_name:e.target.value})} />
        <input placeholder="cond antes 10..1000" value={delForm.condition_before} onChange={e=>setDelForm({...delForm, condition_before:e.target.value})} />
        <input placeholder="cond depois 10..1000" value={delForm.condition_after} onChange={e=>setDelForm({...delForm, condition_after:e.target.value})} />
        <input placeholder="conferência 10..1000" value={delForm.conference_notes} onChange={e=>setDelForm({...delForm, conference_notes:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ast/deliveries", delForm); setMsg("entrega registrada"); load(); } catch(e:any){ setMsg(e.message); } }}>Registrar entrega</button>
      </div>
      <ul>{deliveries.slice(0,20).map((d:any)=><li key={d.id}>{d.delivery_type} asset:{d.serial_number} para:{d.delivered_to_name} antes:{d.condition_before?.slice(0,30)} depois:{d.condition_after?.slice(0,30)}</li>)}</ul>

      <h3>AST-06 Requisição (protocolo REQ-AST-YYYYMMDD-XXXX, quantity&gt;0, requester 2..200, urgency baixa/media/alta/critica, reason 10..1000, status rascunho/em_cotacao/cotado/aprovado/rejeitado/pedido/recebido_parcial/recebido_total/cancelado)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="product_id" value={reqForm.product_id} onChange={e=>setReqForm({...reqForm, product_id:e.target.value})} />
        <input type="number" placeholder="quantity >0" value={reqForm.quantity} onChange={e=>setReqForm({...reqForm, quantity:Number(e.target.value)})} />
        <input placeholder="requester 2..200" value={reqForm.requester_name} onChange={e=>setReqForm({...reqForm, requester_name:e.target.value})} />
        <select value={reqForm.urgency} onChange={e=>setReqForm({...reqForm, urgency:e.target.value})}>
          <option value="baixa">baixa</option><option value="media">media</option><option value="alta">alta</option><option value="critica">critica</option>
        </select>
        <input placeholder="reason 10..1000" value={reqForm.reason} onChange={e=>setReqForm({...reqForm, reason:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ast/requisitions", reqForm); setMsg("requisição criada"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar requisição</button>
      </div>
      <ul>{requisitions.map((r:any)=><li key={r.id}>{r.protocol} q:{r.quantity} prod:{r.product_name} status:{r.status} urg:{r.urgency} solicitante:{r.requester_name} <button onClick={async()=>{ try{ const resp=await fetch("/api/ast/requisitions", {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id:r.id, status:"em_cotacao", reason:"Em cotação requisição alçada evidência"})}); const j=await resp.json(); if(!resp.ok) throw new Error(j.error); setMsg("req em cotação"); load(); } catch(e:any){ setMsg(e.message);} }}>Cotar</button> <button onClick={async()=>{ try{ const resp=await fetch("/api/ast/requisitions", {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id:r.id, status:"aprovado", reason:"Aprovado requisição alçada evidência segregação solicitar/aprovar"})}); const j=await resp.json(); if(!resp.ok) throw new Error(j.error); setMsg("req aprovada"); load(); } catch(e:any){ setMsg(e.message);} }}>Aprovar</button></li>)}</ul>

      <h4>Cotações (supplier_id, unit_price, total_price, delivery_days, notes 10..1000, is_selected)</h4>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="requisition_id" value={quotForm.requisition_id} onChange={e=>setQuotForm({...quotForm, requisition_id:e.target.value})} />
        <input placeholder="supplier_id" value={quotForm.supplier_id} onChange={e=>setQuotForm({...quotForm, supplier_id:e.target.value})} />
        <input type="number" placeholder="unit_price cents" value={quotForm.unit_price_cents} onChange={e=>setQuotForm({...quotForm, unit_price_cents:Number(e.target.value)})} />
        <input type="number" placeholder="total_price cents" value={quotForm.total_price_cents} onChange={e=>setQuotForm({...quotForm, total_price_cents:Number(e.target.value)})} />
        <input type="number" placeholder="delivery_days" value={quotForm.delivery_days} onChange={e=>setQuotForm({...quotForm, delivery_days:Number(e.target.value)})} />
        <input placeholder="notes 10..1000" value={quotForm.notes} onChange={e=>setQuotForm({...quotForm, notes:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ast/quotations", quotForm); setMsg("cotação criada"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar cotação</button>
      </div>
      <ul>{quotations.map((q:any)=><li key={q.id}>req:{q.requisition_id?.slice(0,8)} forn:{q.supplier_name} unit:{q.unit_price_cents} total:{q.total_price_cents} sel:{String(q.is_selected)} <button onClick={async()=>{ try{ const resp=await fetch("/api/ast/quotations", {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id:q.id, is_selected:true})}); const j=await resp.json(); if(!resp.ok) throw new Error(j.error); setMsg("cotação selecionada"); load(); } catch(e:any){ setMsg(e.message);} }}>Selecionar</button></li>)}</ul>

      <h4>Pedidos (protocolo PED-AST-YYYYMMDD-XXXX, total_amount, file_url 5..1000 storage_key 5..500 UNIQUE, payable_id vínculo conta a pagar, status rascunho/enviado/recebido_parcial/recebido_total/cancelado)</h4>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="requisition_id" value={orderForm.requisition_id} onChange={e=>setOrderForm({...orderForm, requisition_id:e.target.value})} />
        <input placeholder="supplier_id" value={orderForm.supplier_id} onChange={e=>setOrderForm({...orderForm, supplier_id:e.target.value})} />
        <input type="number" placeholder="total_amount cents" value={orderForm.total_amount_cents} onChange={e=>setOrderForm({...orderForm, total_amount_cents:Number(e.target.value)})} />
        <input placeholder="file_url 5..1000" value={orderForm.file_url} onChange={e=>setOrderForm({...orderForm, file_url:e.target.value})} />
        <input placeholder="storage_key 5..500" value={orderForm.storage_key} onChange={e=>setOrderForm({...orderForm, storage_key:e.target.value})} />
        <input placeholder="notes 10..1000" value={orderForm.notes} onChange={e=>setOrderForm({...orderForm, notes:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ast/purchase-orders", orderForm); setMsg("pedido criado vínculo conta a pagar"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar pedido</button>
      </div>
      <ul>{orders.map((o:any)=><li key={o.id}>{o.protocol} total:{o.total_amount_cents} status:{o.status} forn:{o.supplier_name} req:{o.requisition_protocol} <button onClick={async()=>{ try{ const resp=await fetch("/api/ast/purchase-orders", {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id:o.id, status:"enviado", reason:"Pedido enviado fornecedor vínculo conta a pagar"})}); const j=await resp.json(); if(!resp.ok) throw new Error(j.error); setMsg("pedido enviado"); load(); } catch(e:any){ setMsg(e.message);} }}>Enviar</button> <button onClick={async()=>{ try{ const resp=await fetch("/api/ast/purchase-orders", {method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({id:o.id, status:"recebido_total", reason:"Pedido recebido total entrada estoque vínculo conta a pagar"})}); const j=await resp.json(); if(!resp.ok) throw new Error(j.error); setMsg("pedido recebido total gera entrada estoque"); load(); } catch(e:any){ setMsg(e.message);} }}>Receber total</button></li>)}</ul>
    </section>
  );
}
