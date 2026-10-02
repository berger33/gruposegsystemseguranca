"use client";

import { FormEvent, useEffect, useState } from "react";

type Gateway = { id:string; name:string; gateway_code:string|null; gateway_type:string; status:string; environment:string; is_selected:boolean; is_sandbox:boolean; is_active:boolean; charge_enabled?:boolean; has_sandbox_secret?:boolean };
type Webhook = { id:string; gateway_id:string; event_type:string; status:string; is_valid_signature:boolean; is_replay:boolean; replay_attempts:number; idempotency_key:string; charge_id:string|null };
type Charge = { id:string; protocol:string; gateway_id:string; receivable_id:string|null; amount_cents:string|number; status:string; is_conciliated:boolean; simulated:boolean; idempotency_key:string };

const money = (value:string|number|undefined) => value == null ? "Dado ausente" : `R$ ${(Number(value)/100).toFixed(2).replace(".",",")}`;
async function api(path:string, init?:RequestInit) {
  const response = await fetch(path, { ...init, headers:{ "Content-Type":"application/json", ...(init?.headers||{}) } });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return data;
}

export default function GatewayWorkspace() {
  const [gateways,setGateways] = useState<Gateway[]>([]);
  const [webhooks,setWebhooks] = useState<Webhook[]>([]);
  const [charges,setCharges] = useState<Charge[]>([]);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [reason,setReason] = useState("");
  const [gateway,setGateway] = useState({ name:"", gateway_code:"", gateway_type:"pix", idempotency_key:"" });
  const [charge,setCharge] = useState({ gateway_id:"", receivable_id:"", amount_cents:"", idempotency_key:"" });

  const run = async (fn:()=>Promise<void>) => { setBusy(true); setError(""); setNotice(""); try { await fn(); } catch(e) { setError(e instanceof Error?e.message:"Falha inesperada"); } finally { setBusy(false); } };
  // load() não usa run(): recarregar a lista não pode apagar o aviso da ação.
  const load = async () => {
    setLoading(true); setError("");
    try {
      const [g,w,c] = await Promise.all([api("/api/fin/payment-gateways"), api("/api/fin/gateway-webhooks"), api("/api/fin/gateway-charges")]);
      setGateways(g.gateways||[]); setWebhooks(w.webhooks||[]); setCharges(c.charges||[]);
    } catch (e) { setError(e instanceof Error?e.message:"Falha ao carregar gateway"); }
    finally { setLoading(false); }
  };
  useEffect(()=>{ void load(); }, []);

  const createGateway = async (event:FormEvent) => { event.preventDefault(); await run(async()=>{
    const data = await api("/api/fin/payment-gateways",{method:"POST",body:JSON.stringify(gateway)});
    setNotice(`Gateway cadastrado em ${data.gateway.status}; nenhuma cobrança real é possível antes de seleção e sandbox.`);
    setGateway({ name:"", gateway_code:"", gateway_type:"pix", idempotency_key:"" });
    await load();
  }); };

  const transitionGateway = (item:Gateway, status:string) => run(async()=>{
    await api("/api/fin/payment-gateways",{method:"PATCH",body:JSON.stringify({ id:item.id, status, reason, error_sanitized: status==="desativado"?reason:undefined })});
    setNotice(status==="sandbox"?"Gateway homologado em sandbox; cobrança sintética liberada.":`Gateway em ${status}.`);
    setReason(""); await load();
  });

  const createCharge = async (event:FormEvent) => { event.preventDefault(); await run(async()=>{
    await api("/api/fin/gateway-charges",{method:"POST",body:JSON.stringify({ ...charge, amount_cents:Number(charge.amount_cents) })});
    setNotice("Cobrança sintética criada em sandbox; nenhuma cobrança real foi emitida.");
    setCharge({ gateway_id:"", receivable_id:"", amount_cents:"", idempotency_key:"" });
    await load();
  }); };

  // O simulador local assina a mensagem canônica; o servidor reconfere a
  // assinatura antes de aceitar o webhook e só então concilia a cobrança.
  const simulateWebhook = (item:Charge, forgeSignature:boolean) => run(async()=>{
    if (reason.length < 10) throw new Error("reason_10_1000_required");
    const idempotency_key = `fin12-ui-${item.protocol}-${forgeSignature?"forjado":"valido"}`;
    const payload = { protocol:item.protocol, amount_cents:Number(item.amount_cents), settlement:"synthetic" };
    const signed = await api("/api/fin/gateway-webhook-sign",{method:"POST",body:JSON.stringify({ gateway_id:item.gateway_id, event_type:"charge.paid", idempotency_key, payload })});
    const signature = forgeSignature ? "f".repeat(64) : signed.signature;
    try {
      const received = await api("/api/fin/gateway-webhooks",{method:"POST",body:JSON.stringify({ gateway_id:item.gateway_id, event_type:"charge.paid", idempotency_key, payload, signature })});
      await api("/api/fin/gateway-webhooks",{method:"PATCH",body:JSON.stringify({ id:received.webhook.id, status:"conciliado", charge_id:item.id, reason })});
      setNotice("Webhook assinado, validado e conciliado; a baixa do recebível canônico foi registrada apenas no simulador.");
    } catch(e) {
      const message = e instanceof Error ? e.message : "falha";
      if (message === "webhook_signature_invalid") setNotice("Assinatura inválida recusada pelo servidor; nada foi conciliado.");
      else if (message === "replay_detected") setNotice("Replay recusado pela chave de idempotência; nada foi aplicado duas vezes.");
      else throw e;
    }
    setReason(""); await load();
  });

  const transitionCharge = (item:Charge, status:string) => run(async()=>{
    await api("/api/fin/gateway-charges",{method:"PATCH",body:JSON.stringify({ id:item.id, status, reason, error_sanitized: status==="falhou"?reason:undefined })});
    setNotice(`Cobrança sintética em ${status}.`); setReason(""); await load();
  });

  return <section data-testid="fin12-gateway">
    <h2>Boletos, Pix e gateway em sandbox</h2>
    <p>Cobrança só existe depois de seleção explícita e homologação em sandbox. A assinatura do webhook é verificada pelo servidor (HMAC-SHA256 sobre mensagem canônica), o replay é recusado pela chave de idempotência e a quitação só acontece por conciliação de webhook validado. Nada aqui gera cobrança real: o provedor é um simulador local.</p>
    {error&&<div role="alert" data-testid="fin12-error"><p>{error}</p><button type="button" data-testid="fin12-retry" disabled={loading} onClick={()=>void load()}>Tentar novamente</button></div>}
    {notice&&<p role="status" data-testid="fin12-notice">{notice}</p>}
    {loading&&<p data-testid="fin12-loading">Carregando gateway…</p>}

    <h3>Gateway de pagamento (sandbox)</h3>
    <form onSubmit={createGateway} data-testid="fin12-gateway-form">
      <input required minLength={3} maxLength={200} data-testid="fin12-gateway-name" placeholder="Nome do gateway" value={gateway.name} onChange={e=>setGateway({...gateway,name:e.target.value})}/>
      <input required data-testid="fin12-gateway-code" placeholder="codigo-canonico-do-gateway" value={gateway.gateway_code} onChange={e=>setGateway({...gateway,gateway_code:e.target.value})}/>
      <select required data-testid="fin12-gateway-type" value={gateway.gateway_type} onChange={e=>setGateway({...gateway,gateway_type:e.target.value})}>
        {["boleto","pix","cartao","gateway","outro"].map(type=><option key={type} value={type}>{type}</option>)}
      </select>
      <input required minLength={8} maxLength={200} data-testid="fin12-gateway-idempotency" placeholder="Chave de idempotência" value={gateway.idempotency_key} onChange={e=>setGateway({...gateway,idempotency_key:e.target.value})}/>
      <button data-testid="fin12-gateway-create" disabled={busy}>Cadastrar gateway</button>
    </form>
    <label>Motivo da transição <input minLength={10} maxLength={1000} data-testid="fin12-reason" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Motivo (10 a 1000 caracteres)"/></label>
    <table data-testid="fin12-gateways-table"><thead><tr><th>Gateway</th><th>Código</th><th>Tipo</th><th>Ambiente</th><th>Status</th><th>Cobrança liberada</th><th>Transição</th></tr></thead><tbody>
      {gateways.length===0?<tr><td colSpan={7}>Nenhum gateway cadastrado.</td></tr>:gateways.map(item=>
        <tr key={item.id} data-testid={`fin12-gateway-${item.id}`}>
          <td>{item.name}</td><td>{item.gateway_code||"sem código"}</td><td>{item.gateway_type}</td><td>{item.environment}</td>
          <td data-testid={`fin12-gateway-status-${item.id}`}>{item.status}</td>
          <td data-testid={`fin12-gateway-charge-enabled-${item.id}`}>{item.charge_enabled?"sim":"não"}</td>
          <td>
            {item.status==="nao_selecionado"&&<button disabled={busy||reason.length<10} data-testid={`fin12-gateway-select-${item.id}`} onClick={()=>transitionGateway(item,"selecionado")}>Selecionar</button>}
            {item.status==="selecionado"&&<button disabled={busy||reason.length<10} data-testid={`fin12-gateway-sandbox-${item.id}`} onClick={()=>transitionGateway(item,"sandbox")}>Homologar sandbox</button>}
            {item.status!=="desativado"&&<button disabled={busy||reason.length<10} data-testid={`fin12-gateway-disable-${item.id}`} onClick={()=>transitionGateway(item,"desativado")}>Desativar</button>}
          </td>
        </tr>)}
    </tbody></table>

    <h3>Cobrança sintética</h3>
    <form onSubmit={createCharge} data-testid="fin12-charge-form">
      <select required data-testid="fin12-charge-gateway" value={charge.gateway_id} onChange={e=>setCharge({...charge,gateway_id:e.target.value})}>
        <option value="">Gateway selecionado e homologado</option>
        {gateways.filter(item=>item.charge_enabled).map(item=><option key={item.id} value={item.id}>{item.name} · {item.gateway_type}</option>)}
      </select>
      <input required data-testid="fin12-charge-receivable" placeholder="ID do recebível canônico" value={charge.receivable_id} onChange={e=>setCharge({...charge,receivable_id:e.target.value})}/>
      <input required type="number" min="1" data-testid="fin12-charge-amount" placeholder="Valor em centavos" value={charge.amount_cents} onChange={e=>setCharge({...charge,amount_cents:e.target.value})}/>
      <input required minLength={10} maxLength={200} data-testid="fin12-charge-idempotency" placeholder="Chave de idempotência" value={charge.idempotency_key} onChange={e=>setCharge({...charge,idempotency_key:e.target.value})}/>
      <button data-testid="fin12-charge-create" disabled={busy}>Criar cobrança</button>
    </form>
    <table data-testid="fin12-charges-table"><thead><tr><th>Protocolo</th><th>Valor</th><th>Simulada</th><th>Status</th><th>Conciliada</th><th>Simulador</th></tr></thead><tbody>
      {charges.length===0?<tr><td colSpan={6}>Nenhuma cobrança.</td></tr>:charges.map(item=>
        <tr key={item.id} data-testid={`fin12-charge-${item.id}`}>
          <td>{item.protocol}</td><td>{money(item.amount_cents)}</td><td>{item.simulated?"sintética":"NÃO SIMULADA"}</td>
          <td data-testid={`fin12-charge-status-${item.id}`}>{item.status}</td>
          <td>{item.is_conciliated?"sim":"não"}</td>
          <td>
            {item.status==="pendente"&&<button disabled={busy||reason.length<10} data-testid={`fin12-charge-webhook-${item.id}`} onClick={()=>simulateWebhook(item,false)}>Simular webhook assinado</button>}
            {item.status==="pendente"&&<button disabled={busy||reason.length<10} data-testid={`fin12-charge-forge-${item.id}`} onClick={()=>simulateWebhook(item,true)}>Simular assinatura inválida</button>}
            {item.status==="pendente"&&<button disabled={busy||reason.length<10} data-testid={`fin12-charge-cancel-${item.id}`} onClick={()=>transitionCharge(item,"cancelado")}>Cancelar</button>}
            {item.status==="pago"&&<button disabled={busy||reason.length<10} data-testid={`fin12-charge-refund-${item.id}`} onClick={()=>transitionCharge(item,"estornado")}>Estornar</button>}
          </td>
        </tr>)}
    </tbody></table>

    <h3>Webhooks recebidos</h3>
    <table data-testid="fin12-webhooks-table"><thead><tr><th>Evento</th><th>Assinatura</th><th>Status</th><th>Replays</th><th>Cobrança</th></tr></thead><tbody>
      {webhooks.length===0?<tr><td colSpan={5}>Nenhum webhook recebido.</td></tr>:webhooks.map(item=>
        <tr key={item.id} data-testid={`fin12-webhook-${item.id}`}>
          <td>{item.event_type}</td>
          <td data-testid={`fin12-webhook-signature-${item.id}`}>{item.is_valid_signature?"válida":"inválida"}</td>
          <td data-testid={`fin12-webhook-status-${item.id}`}>{item.status}</td>
          <td data-testid={`fin12-webhook-replays-${item.id}`}>{item.replay_attempts}</td>
          <td>{item.charge_id?item.charge_id.slice(0,8):"não conciliado"}</td>
        </tr>)}
    </tbody></table>
  </section>;
}
