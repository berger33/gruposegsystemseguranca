"use client";

import { FormEvent, useEffect, useState } from "react";

type Gateway = { id:string; name:string; gateway_code:string|null; gateway_type:string; status:string; is_selected:boolean; is_sandbox:boolean; environment:string };
type Webhook = { id:string; gateway_id:string; event_type:string; is_valid_signature:boolean; is_replay:boolean; idempotency_key:string; status:string; charge_id:string|null };
type Charge = { id:string; protocol:string; gateway_id:string; receivable_id:string|null; amount_cents:string|number; status:string; idempotency_key:string; is_sandbox:boolean; is_conciliated:boolean };

const money = (value:string|number) => `R$ ${(Number(value)/100).toFixed(2).replace(".",",")}`;
async function api(path:string, init?:RequestInit) {
  const response = await fetch(path, { ...init, headers:{ "Content-Type":"application/json", ...(init?.headers||{}) } });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return data;
}

const emptyGateway = { name:"", gateway_code:"", gateway_type:"pix", webhook_secret:"", idempotency_key:"" };
const emptyCharge = { gateway_id:"", amount_cents:"", idempotency_key:"" };
const emptyWebhook = { gateway_id:"", event_type:"payment.confirmed", charge_id:"", note:"", signature:"", idempotency_key:"" };

export default function GatewayWorkspace() {
  const [gateways,setGateways] = useState<Gateway[]>([]);
  const [webhooks,setWebhooks] = useState<Webhook[]>([]);
  const [charges,setCharges] = useState<Charge[]>([]);
  const [secrets,setSecrets] = useState<Record<string,string>>({});
  const [gateway,setGateway] = useState(emptyGateway);
  const [charge,setCharge] = useState(emptyCharge);
  const [webhook,setWebhook] = useState(emptyWebhook);
  const [reason,setReason] = useState("");
  const [busy,setBusy] = useState(false); const [error,setError] = useState(""); const [notice,setNotice] = useState("");

  const load = async () => {
    const [g,w,c] = await Promise.all([
      api("/api/fin/payment-gateways"),
      api("/api/fin/gateway-webhooks"),
      api("/api/fin/gateway-charges"),
    ]);
    setGateways(g.gateways||[]); setWebhooks(w.webhooks||[]); setCharges(c.charges||[]);
  };
  useEffect(()=>{ load().catch(e=>setError(e instanceof Error?e.message:"Falha ao carregar")); },[]);
  const run = async (fn:()=>Promise<void>) => { setBusy(true); setError(""); setNotice(""); try { await fn(); } catch(e) { setError(e instanceof Error?e.message:"Falha inesperada"); } finally { setBusy(false); } };

  const createGateway = (event:FormEvent) => { event.preventDefault(); run(async()=>{
    const data = await api("/api/fin/payment-gateways",{method:"POST",body:JSON.stringify(gateway)});
    setSecrets(prev=>({...prev,[data.gateway.id]:data.gateway.webhook_secret}));
    setGateway(emptyGateway);
    setNotice(`Gateway sandbox cadastrado. Copie o segredo agora, não será mostrado novamente: ${data.gateway.webhook_secret}`);
    await load();
  }); };
  const transitionGateway = (item:Gateway, status:string) => run(async()=>{
    await api("/api/fin/payment-gateways",{method:"PATCH",body:JSON.stringify({id:item.id,status,reason})});
    setReason(""); setNotice(status==="sandbox"?"Gateway testado em sandbox: cobranças liberadas.":`Gateway em transição para ${status}.`); await load();
  });

  const createCharge = (event:FormEvent) => { event.preventDefault(); run(async()=>{
    const data = await api("/api/fin/gateway-charges",{method:"POST",body:JSON.stringify({...charge,amount_cents:Number(charge.amount_cents)})});
    setCharge(emptyCharge);
    setNotice(`Cobrança sintética ${data.charge.protocol} criada como pendente. ${data.note}`);
    await load();
  }); };
  const cancelCharge = (item:Charge) => run(async()=>{
    await api("/api/fin/gateway-charges",{method:"PATCH",body:JSON.stringify({id:item.id,status:"cancelado",reason})});
    setReason(""); setNotice("Cobrança cancelada antes de qualquer desfecho de webhook."); await load();
  });

  const calcSignature = () => run(async()=>{
    if (!webhook.gateway_id) throw new Error("Selecione o gateway antes de calcular a assinatura");
    const data = await api("/api/fin/gateway-webhook-sign",{method:"POST",body:JSON.stringify({gateway_id:webhook.gateway_id,payload:{note:webhook.note}})});
    setWebhook(prev=>({...prev,signature:data.signature}));
    setNotice("Assinatura calculada pelo simulador sandbox do lado do gateway (fora do caminho de verificação).");
  });
  const createWebhook = (event:FormEvent) => { event.preventDefault(); run(async()=>{
    const data = await api("/api/fin/gateway-webhooks",{method:"POST",body:JSON.stringify({
      gateway_id: webhook.gateway_id,
      event_type: webhook.event_type,
      charge_id: webhook.event_type==="gateway.ping" ? null : webhook.charge_id,
      payload: { note: webhook.note },
      signature: webhook.signature,
      idempotency_key: webhook.idempotency_key,
    })});
    setWebhook(emptyWebhook);
    setNotice(data.webhook.is_valid_signature?"Assinatura recomputada no servidor: válida.":"Assinatura recomputada no servidor: rejeitada.");
    await load();
  }); };
  const conciliate = (item:Webhook) => run(async()=>{
    await api("/api/fin/gateway-webhooks",{method:"PATCH",body:JSON.stringify({id:item.id,action:"conciliate",reason})});
    setReason(""); setNotice("Webhook validado conciliado com a cobrança referenciada."); await load();
  });

  const sandboxGateways = gateways.filter(item=>item.status==="sandbox");

  return <section data-testid="fin12-gateway">
    <h2>Boletos/Pix/gateway (sandbox)</h2>
    <p>Uma cobrança só existe depois que o gateway é selecionado E testado em sandbox. A assinatura do webhook é sempre recalculada pelo servidor com o segredo do gateway — nenhuma afirmação do cliente é aceita. Replay é detectado pela chave de idempotência e a conciliação liga um webhook validado a uma cobrança específica. Nenhuma cobrança real é processada.</p>
    {error&&<p role="alert" data-testid="fin12-error">{error}</p>}
    {notice&&<p role="status" data-testid="fin12-notice">{notice}</p>}

    <h3>Gateway</h3>
    <form onSubmit={createGateway} data-testid="fin12-gateway-form">
      <input required minLength={3} maxLength={200} data-testid="fin12-gateway-name" placeholder="Nome do gateway" value={gateway.name} onChange={e=>setGateway({...gateway,name:e.target.value})}/>
      <input required data-testid="fin12-gateway-code" placeholder="codigo-canonico-do-gateway" value={gateway.gateway_code} onChange={e=>setGateway({...gateway,gateway_code:e.target.value})}/>
      <select data-testid="fin12-gateway-type" value={gateway.gateway_type} onChange={e=>setGateway({...gateway,gateway_type:e.target.value})}>
        <option value="pix">pix</option><option value="boleto">boleto</option><option value="cartao">cartao</option><option value="gateway">gateway</option><option value="outro">outro</option>
      </select>
      <input required data-testid="fin12-gateway-secret" placeholder="sandbox_XXXXXXXXXXXXXXXX" value={gateway.webhook_secret} onChange={e=>setGateway({...gateway,webhook_secret:e.target.value})}/>
      <input required minLength={8} maxLength={200} data-testid="fin12-gateway-idempotency" placeholder="Chave de idempotência" value={gateway.idempotency_key} onChange={e=>setGateway({...gateway,idempotency_key:e.target.value})}/>
      <button data-testid="fin12-gateway-create" disabled={busy}>Cadastrar gateway</button>
    </form>
    <label>Motivo da transição <input minLength={10} maxLength={1000} data-testid="fin12-reason" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Motivo (10 a 1000 caracteres)"/></label>
    <table data-testid="fin12-gateways-table"><thead><tr><th>Gateway</th><th>Código</th><th>Tipo</th><th>Status</th><th>Transição</th></tr></thead><tbody>
      {gateways.length===0?<tr><td colSpan={5}>Nenhum gateway.</td></tr>:gateways.map(item=>
        <tr key={item.id} data-testid={`fin12-gateway-${item.id}`}><td>{item.name}</td><td>{item.gateway_code||"sem código"}</td><td>{item.gateway_type}</td><td data-testid={`fin12-gateway-status-${item.id}`}>{item.status}</td>
          <td>{item.status==="nao_selecionado"&&<button disabled={busy||reason.length<10} data-testid={`fin12-gateway-select-${item.id}`} onClick={()=>transitionGateway(item,"selecionado")}>Selecionar</button>}
              {item.status==="selecionado"&&<button disabled={busy||reason.length<10} data-testid={`fin12-gateway-test-${item.id}`} onClick={()=>transitionGateway(item,"sandbox")}>Testar sandbox</button>}
              {item.status!=="desativado"&&<button disabled={busy||reason.length<10} onClick={()=>transitionGateway(item,"desativado")}>Desativar</button>}</td></tr>)}
    </tbody></table>

    <h3>Cobrança sintética</h3>
    <form onSubmit={createCharge} data-testid="fin12-charge-form">
      <select required data-testid="fin12-charge-gateway" value={charge.gateway_id} onChange={e=>setCharge({...charge,gateway_id:e.target.value})}>
        <option value="">Gateway selecionado e testado em sandbox</option>
        {sandboxGateways.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <input required type="number" min="1" data-testid="fin12-charge-amount" placeholder="Valor em centavos" value={charge.amount_cents} onChange={e=>setCharge({...charge,amount_cents:e.target.value})}/>
      <input required minLength={10} maxLength={200} data-testid="fin12-charge-idempotency" placeholder="Chave de idempotência" value={charge.idempotency_key} onChange={e=>setCharge({...charge,idempotency_key:e.target.value})}/>
      <button data-testid="fin12-charge-create" disabled={busy}>Criar cobrança</button>
    </form>
    <table data-testid="fin12-charges-table"><thead><tr><th>Protocolo</th><th>Valor</th><th>Status</th><th>Conciliada</th><th>Ação</th></tr></thead><tbody>
      {charges.length===0?<tr><td colSpan={5}>Nenhuma cobrança.</td></tr>:charges.map(item=>
        <tr key={item.id} data-testid={`fin12-charge-${item.id}`}><td>{item.protocol}</td><td>{money(item.amount_cents)}</td><td data-testid={`fin12-charge-status-${item.id}`}>{item.status}</td><td>{String(item.is_conciliated)}</td>
          <td>{item.status==="pendente"&&<button disabled={busy||reason.length<10} data-testid={`fin12-charge-cancel-${item.id}`} onClick={()=>cancelCharge(item)}>Cancelar</button>}</td></tr>)}
    </tbody></table>

    <h3>Webhook sandbox</h3>
    <form onSubmit={createWebhook} data-testid="fin12-webhook-form">
      <select required data-testid="fin12-webhook-gateway" value={webhook.gateway_id} onChange={e=>setWebhook({...webhook,gateway_id:e.target.value})}>
        <option value="">Gateway</option>
        {gateways.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select data-testid="fin12-webhook-event" value={webhook.event_type} onChange={e=>setWebhook({...webhook,event_type:e.target.value})}>
        <option value="payment.confirmed">payment.confirmed</option>
        <option value="payment.failed">payment.failed</option>
        <option value="payment.refunded">payment.refunded</option>
        <option value="gateway.ping">gateway.ping</option>
      </select>
      {webhook.event_type!=="gateway.ping"&&<select required data-testid="fin12-webhook-charge" value={webhook.charge_id} onChange={e=>setWebhook({...webhook,charge_id:e.target.value})}>
        <option value="">Cobrança referenciada</option>
        {charges.filter(item=>item.gateway_id===webhook.gateway_id).map(item=><option key={item.id} value={item.id}>{item.protocol} · {item.status}</option>)}
      </select>}
      <input data-testid="fin12-webhook-note" placeholder="Conteúdo sintético do evento" value={webhook.note} onChange={e=>setWebhook({...webhook,note:e.target.value})}/>
      <input required minLength={10} maxLength={200} data-testid="fin12-webhook-idempotency" placeholder="Chave de idempotência" value={webhook.idempotency_key} onChange={e=>setWebhook({...webhook,idempotency_key:e.target.value})}/>
      <button type="button" data-testid="fin12-webhook-calc-signature" disabled={busy} onClick={calcSignature}>Calcular assinatura (simulador sandbox)</button>
      <input required minLength={10} maxLength={1000} data-testid="fin12-webhook-signature" placeholder="Assinatura (hex)" value={webhook.signature} onChange={e=>setWebhook({...webhook,signature:e.target.value})}/>
      <button data-testid="fin12-webhook-create" disabled={busy}>Enviar webhook</button>
    </form>
    <table data-testid="fin12-webhooks-table"><thead><tr><th>Evento</th><th>Assinatura válida</th><th>Replay</th><th>Status</th><th>Ação</th></tr></thead><tbody>
      {webhooks.length===0?<tr><td colSpan={5}>Nenhum webhook.</td></tr>:webhooks.map(item=>
        <tr key={item.id} data-testid={`fin12-webhook-${item.id}`}><td>{item.event_type}</td><td data-testid={`fin12-webhook-valid-${item.id}`}>{String(item.is_valid_signature)}</td><td>{String(item.is_replay)}</td><td data-testid={`fin12-webhook-status-${item.id}`}>{item.status}</td>
          <td>{item.status==="validado"&&<button disabled={busy||reason.length<10} data-testid={`fin12-webhook-conciliate-${item.id}`} onClick={()=>conciliate(item)}>Conciliar</button>}</td></tr>)}
    </tbody></table>
  </section>;
}
