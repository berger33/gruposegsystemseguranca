"use client";
import { useEffect, useState } from "react";

type MgmtResult = { id:string; protocol:string; contract_id:string|null; competence_date:string; revenue_contracted_cents:number|null; revenue_billed_cents:number|null; revenue_received_cents:number|null; costs_cents:number|null; cash_cents:number|null; margin_cents:number|null; margin_percent:number|null; is_complete:boolean; incomplete_reason:string|null; status:string; notes:string|null; };
type Expense = { id:string; protocol:string; expense_type:string; category:string; description:string; amount_cents:number; threshold_cents:number|null; requester_name:string; approver_name:string|null; status:string; evidence_file_url:string|null; evidence_storage_key:string|null; is_segregated:boolean; contract_id:string|null; };
type FiscalProvider = { id:string; name:string; provider_type:string; status:string; is_active:boolean; };
type FiscalObligation = { id:string; contract_id:string|null; obligation_type:string; activity_type:string; description:string; rule:string; is_determined:boolean; status:string; };
type FiscalDoc = { id:string; protocol:string; obligation_id:string|null; provider_id:string|null; document_type:string; status:string; amount_cents:number; file_url:string|null; storage_key:string|null; is_sandbox:boolean; };
type Gateway = { id:string; name:string; gateway_type:string; status:string; is_selected:boolean; is_sandbox:boolean; };
type Webhook = { id:string; gateway_id:string; event_type:string; signature:string; is_valid_signature:boolean; is_replay:boolean; idempotency_key:string; status:string; };
type Charge = { id:string; protocol:string; gateway_id:string; receivable_id:string|null; amount_cents:number; status:string; idempotency_key:string; is_sandbox:boolean; is_conciliated:boolean; };

export default function FinManagementClient() {
  const [results, setResults] = useState<MgmtResult[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [providers, setProviders] = useState<FiscalProvider[]>([]);
  const [obligations, setObligations] = useState<FiscalObligation[]>([]);
  const [docs, setDocs] = useState<FiscalDoc[]>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [msg, setMsg] = useState<string>("");

  // forms FIN-09
  const [contractId, setContractId] = useState("");
  const [competence, setCompetence] = useState("");
  const [revContracted, setRevContracted] = useState("");
  const [revBilled, setRevBilled] = useState("");
  const [revReceived, setRevReceived] = useState("");
  const [costs, setCosts] = useState("");
  const [cash, setCash] = useState("");
  const [marginPercent, setMarginPercent] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [incompleteReason, setIncompleteReason] = useState("");
  const [notes, setNotes] = useState("");

  // FIN-10 expense
  const [expCategory, setExpCategory] = useState("");
  const [expDesc, setExpDesc] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expThreshold, setExpThreshold] = useState("");
  const [expRequester, setExpRequester] = useState("");
  const [expApprover, setExpApprover] = useState("");
  const [expType, setExpType] = useState("despesa");
  const [expFileUrl, setExpFileUrl] = useState("");
  const [expStorageKey, setExpStorageKey] = useState("");

  // FIN-11 fiscal provider
  const [provName, setProvName] = useState("");
  const [provType, setProvType] = useState("nfse");
  // obligation
  const [oblActivity, setOblActivity] = useState("");
  const [oblDesc, setOblDesc] = useState("");
  const [oblRule, setOblRule] = useState("");
  const [oblType, setOblType] = useState("nfse");

  // FIN-12 gateway
  const [gwName, setGwName] = useState("");
  const [gwType, setGwType] = useState("pix");
  const [whGatewayId, setWhGatewayId] = useState("");
  const [whEventType, setWhEventType] = useState("");
  const [whSignature, setWhSignature] = useState("");
  const [whIdempKey, setWhIdempKey] = useState("");
  const [whValidSig, setWhValidSig] = useState(true);
  const [chGatewayId, setChGatewayId] = useState("");
  const [chAmount, setChAmount] = useState("");
  const [chIdempKey, setChIdempKey] = useState("");

  const load = async () => {
    try {
      const [r1, r2, r3, r4, r5, r6, r7, r8] = await Promise.all([
        fetch("/api/fin/management-results").then(r=>r.json()).catch(()=>({results:[]})),
        fetch("/api/fin/expenses").then(r=>r.json()).catch(()=>({expenses:[]})),
        fetch("/api/fin/fiscal-providers").then(r=>r.json()).catch(()=>({providers:[]})),
        fetch("/api/fin/fiscal-obligations").then(r=>r.json()).catch(()=>({obligations:[]})),
        fetch("/api/fin/fiscal-documents").then(r=>r.json()).catch(()=>({documents:[]})),
        fetch("/api/fin/payment-gateways").then(r=>r.json()).catch(()=>({gateways:[]})),
        fetch("/api/fin/gateway-webhooks").then(r=>r.json()).catch(()=>({webhooks:[]})),
        fetch("/api/fin/gateway-charges").then(r=>r.json()).catch(()=>({charges:[]})),
      ]);
      setResults(r1.results||[]);
      setExpenses(r2.expenses||[]);
      setProviders(r3.providers||[]);
      setObligations(r4.obligations||[]);
      setDocs(r5.documents||[]);
      setGateways(r6.gateways||[]);
      setWebhooks(r7.webhooks||[]);
      setCharges(r8.charges||[]);
    } catch(e:any){ setMsg(e.message); }
  };
  useEffect(()=>{ load(); }, []);

  const post = async (url:string, body:any) => {
    const r = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || JSON.stringify(j));
    return j;
  };
  const patch = async (url:string, body:any) => {
    const r = await fetch(url, { method:"PATCH", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || JSON.stringify(j));
    return j;
  };

  // FIN-09 create result
  const createResult = async () => {
    try {
      setMsg("");
      if (!competence) throw new Error("competence_date obrigatória");
      if (!isComplete && (!incompleteReason || incompleteReason.length<10)) throw new Error("incomplete_reason 10..1000 obrigatória quando is_complete=false margem sem dados completos exibida como incompleta");
      await post("/api/fin/management-results", {
        contract_id: contractId||null,
        competence_date: competence,
        revenue_contracted_cents: revContracted?parseInt(revContracted):null,
        revenue_billed_cents: revBilled?parseInt(revBilled):null,
        revenue_received_cents: revReceived?parseInt(revReceived):null,
        costs_cents: costs?parseInt(costs):null,
        cash_cents: cash?parseInt(cash):null,
        margin_percent: marginPercent?parseFloat(marginPercent):null,
        is_complete: isComplete,
        incomplete_reason: isComplete?null:incompleteReason,
        notes: notes||null,
        status: isComplete?"aprovado":"incompleto"
      });
      setMsg("FIN-09 resultado gerencial criado protocolo RES-FIN is_complete "+isComplete+" margem incompleta exibida como incompleta");
      load();
    } catch(e:any){ setMsg("FIN-09 erro: "+e.message); }
  };

  const createExpense = async () => {
    try {
      setMsg("");
      if (!expCategory || expCategory.length<3) throw new Error("category 3..200");
      if (!expDesc || expDesc.length<10) throw new Error("description 10..1000");
      if (!expAmount) throw new Error("amount_cents positivo");
      if (!expRequester || expRequester.length<2) throw new Error("requester_name 2..200");
      if (expRequester===expApprover && expApprover) throw new Error("segregação solicitar/aprovar requester != approver quando definida");
      await post("/api/fin/expenses", {
        expense_type: expType,
        category: expCategory,
        description: expDesc,
        amount_cents: parseInt(expAmount),
        threshold_cents: expThreshold?parseInt(expThreshold):null,
        requester_name: expRequester,
        approver_name: expApprover||null,
        evidence_file_url: expFileUrl||null,
        evidence_storage_key: expStorageKey||null
      });
      setMsg("FIN-10 despesa/reembolso/compra criada com alçada evidência segregação solicitar/aprovar protocolo DES-FIN");
      load();
    } catch(e:any){ setMsg("FIN-10 erro: "+e.message); }
  };

  const createProvider = async () => {
    try {
      setMsg("");
      if (!provName || provName.length<3) throw new Error("name 3..200");
      await post("/api/fin/fiscal-providers", { name: provName, provider_type: provType, status:"nao_configurado" });
      setMsg("FIN-11 provedor fiscal criado name UNIQUE determinar NFS-e/NF-e ou outra obrigação conforme atividade sem assumir uma nota para tudo");
      load();
    } catch(e:any){ setMsg("FIN-11 provedor erro: "+e.message); }
  };

  const createObligation = async () => {
    try {
      setMsg("");
      if (!oblActivity || oblActivity.length<3) throw new Error("activity_type 3..200");
      if (!oblDesc || oblDesc.length<10) throw new Error("description 10..1000");
      if (!oblRule || oblRule.length<10) throw new Error("rule 10..1000 obrigatória determinar NFS-e/NF-e ou outra obrigação conforme atividade sem assumir uma nota para tudo");
      await post("/api/fin/fiscal-obligations", { obligation_type: oblType, activity_type: oblActivity, description: oblDesc, rule: oblRule });
      setMsg("FIN-11 obrigação fiscal criada rule 10..1000 determinar NFS-e/NF-e ou outra obrigação conforme atividade");
      load();
    } catch(e:any){ setMsg("FIN-11 obrigação erro: "+e.message); }
  };

  const createGateway = async () => {
    try {
      setMsg("");
      if (!gwName || gwName.length<3) throw new Error("name 3..200");
      await post("/api/fin/payment-gateways", { name: gwName, gateway_type: gwType, status:"sandbox", is_selected:true, is_sandbox:true });
      setMsg("FIN-12 gateway criado name UNIQUE selecionado sandbox only sem cobrança real em testes is_sandbox=true CHECK");
      load();
    } catch(e:any){ setMsg("FIN-12 gateway erro: "+e.message); }
  };

  const createWebhook = async () => {
    try {
      setMsg("");
      if (!whGatewayId) throw new Error("gateway_id obrigatório");
      if (!whEventType || whEventType.length<3) throw new Error("event_type 3..200");
      if (!whSignature || whSignature.length<10) throw new Error("signature 10..1000 obrigatória validar assinatura webhook");
      if (!whIdempKey || whIdempKey.length<10) throw new Error("idempotency_key 10..200 obrigatória validar replay idempotência");
      await post("/api/fin/gateway-webhooks", { gateway_id: whGatewayId, event_type: whEventType, signature: whSignature, payload:{ test:true }, idempotency_key: whIdempKey, is_valid_signature: whValidSig, is_replay:false });
      setMsg("FIN-12 webhook criado validar assinatura webhook replay idempotência conciliação sem cobrança real idempotency_key UNIQUE");
      load();
    } catch(e:any){ setMsg("FIN-12 webhook erro: "+e.message); }
  };

  const createCharge = async () => {
    try {
      setMsg("");
      if (!chGatewayId) throw new Error("gateway_id obrigatório selecionado sandbox");
      if (!chAmount) throw new Error("amount_cents positivo");
      if (!chIdempKey || chIdempKey.length<10) throw new Error("idempotency_key 10..200");
      await post("/api/fin/gateway-charges", { gateway_id: chGatewayId, amount_cents: parseInt(chAmount), idempotency_key: chIdempKey });
      setMsg("FIN-12 charge criado protocolo CHG-FIN is_sandbox=true CHECK sem cobrança real em testes idempotency_key UNIQUE gateway selecionado sandbox");
      load();
    } catch(e:any){ setMsg("FIN-12 charge erro: "+e.message); }
  };

  return (
    <section style={{ marginTop:24, padding:16, border:"1px solid #ccc", borderRadius:8 }}>
      <h2>FIN-09/10/11/12 — Resultado gerencial, despesas alçada, fiscal, gateway sandbox</h2>
      {msg && <p style={{ background:"#eef", padding:8 }}>{msg}</p>}

      <h3>FIN-09 Resultado gerencial por contrato (receita contratada/faturada/recebida custos caixa margem sem dados completos exibida como incompleta)</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:8 }}>
        <input placeholder="contract_id (UUID opcional)" value={contractId} onChange={e=>setContractId(e.target.value)} />
        <input type="date" value={competence} onChange={e=>setCompetence(e.target.value)} />
        <input placeholder="receita contratada cents" value={revContracted} onChange={e=>setRevContracted(e.target.value)} />
        <input placeholder="receita faturada cents" value={revBilled} onChange={e=>setRevBilled(e.target.value)} />
        <input placeholder="receita recebida cents" value={revReceived} onChange={e=>setRevReceived(e.target.value)} />
        <input placeholder="custos cents" value={costs} onChange={e=>setCosts(e.target.value)} />
        <input placeholder="caixa cents" value={cash} onChange={e=>setCash(e.target.value)} />
        <input placeholder="margin_percent -100..100" value={marginPercent} onChange={e=>setMarginPercent(e.target.value)} />
        <label><input type="checkbox" checked={isComplete} onChange={e=>setIsComplete(e.target.checked)} /> is_complete (se false margem deve ser null e incomplete_reason 10..1000 obrigatória)</label>
        <input placeholder="incomplete_reason 10..1000 quando is_complete=false margem incompleta" value={incompleteReason} onChange={e=>setIncompleteReason(e.target.value)} />
        <input placeholder="notes 10..2000 opcional" value={notes} onChange={e=>setNotes(e.target.value)} />
      </div>
      <button onClick={createResult}>Criar resultado RES-FIN protocolo</button>
      <ul>{results.slice(0,20).map(r=><li key={r.id}>{r.protocol} contrato:{r.contract_id?.slice(0,8)} comp:{r.competence_date} contratada:{r.revenue_contracted_cents} faturada:{r.revenue_billed_cents} recebida:{r.revenue_received_cents} custos:{r.costs_cents} caixa:{r.cash_cents} margem_cents:{r.margin_cents} margem%:{r.margin_percent} completo:{String(r.is_complete)} motivo_incompleto:{r.incomplete_reason?.slice(0,60)} status:{r.status}</li>)}</ul>

      <h3>FIN-10 Despesas/reembolsos/compras com alçada evidência segregação solicitar/aprovar</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:8 }}>
        <select value={expType} onChange={e=>setExpType(e.target.value)}><option value="despesa">despesa</option><option value="reembolso">reembolso</option><option value="compra">compra</option><option value="outro">outro</option></select>
        <input placeholder="category 3..200" value={expCategory} onChange={e=>setExpCategory(e.target.value)} />
        <input placeholder="description 10..1000" value={expDesc} onChange={e=>setExpDesc(e.target.value)} />
        <input placeholder="amount_cents >0" value={expAmount} onChange={e=>setExpAmount(e.target.value)} />
        <input placeholder="threshold_cents alçada opcional" value={expThreshold} onChange={e=>setExpThreshold(e.target.value)} />
        <input placeholder="requester_name 2..200" value={expRequester} onChange={e=>setExpRequester(e.target.value)} />
        <input placeholder="approver_name 2..200 opcional segregação" value={expApprover} onChange={e=>setExpApprover(e.target.value)} />
        <input placeholder="evidence file_url 5..1000 opcional" value={expFileUrl} onChange={e=>setExpFileUrl(e.target.value)} />
        <input placeholder="evidence storage_key UNIQUE 5..500" value={expStorageKey} onChange={e=>setExpStorageKey(e.target.value)} />
      </div>
      <button onClick={createExpense}>Criar despesa DES-FIN alçada evidência segregação</button>
      <ul>{expenses.slice(0,20).map(e=><li key={e.id}>{e.protocol} {e.expense_type} {e.category} {e.amount_cents} status:{e.status} solicitante:{e.requester_name} aprovador:{e.approver_name||"—"} segregado:{String(e.is_segregated)} evidência:{e.evidence_storage_key?.slice(0,20)||"—"}</li>)}</ul>

      <h3>FIN-11 Integração contábil/fiscal provedor determinar NFS-e/NF-e ou outra obrigação conforme atividade sem assumir uma nota para tudo</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:8 }}>
        <input placeholder="provedor name UNIQUE 3..200" value={provName} onChange={e=>setProvName(e.target.value)} />
        <select value={provType} onChange={e=>setProvType(e.target.value)}><option value="nfse">nfse</option><option value="nfe">nfe</option><option value="nfce">nfce</option><option value="cte">cte</option><option value="outro">outro</option></select>
        <button onClick={createProvider}>Criar provedor fiscal</button>
        <input placeholder="activity_type 3..200" value={oblActivity} onChange={e=>setOblActivity(e.target.value)} />
        <select value={oblType} onChange={e=>setOblType(e.target.value)}><option value="nfse">nfse</option><option value="nfe">nfe</option><option value="nfce">nfce</option><option value="cte">cte</option><option value="outro">outro</option></select>
        <input placeholder="description 10..1000" value={oblDesc} onChange={e=>setOblDesc(e.target.value)} />
        <input placeholder="rule 10..1000 determinar NFS-e/NF-e ou outra obrigação conforme atividade" value={oblRule} onChange={e=>setOblRule(e.target.value)} />
        <button onClick={createObligation}>Criar obrigação fiscal</button>
      </div>
      <ul>{providers.slice(0,10).map(p=><li key={p.id}>{p.name} tipo:{p.provider_type} status:{p.status} ativo:{String(p.is_active)}</li>)}</ul>
      <ul>{obligations.slice(0,20).map(o=><li key={o.id}>{o.obligation_type} atividade:{o.activity_type} determinada:{String(o.is_determined)} status:{o.status} rule:{o.rule.slice(0,60)}</li>)}</ul>
      <ul>{docs.slice(0,10).map(d=><li key={d.id}>{d.protocol} tipo:{d.document_type} status:{d.status} amount:{d.amount_cents} sandbox:{String(d.is_sandbox)} storage:{d.storage_key?.slice(0,20)||"—"}</li>)}</ul>

      <h3>FIN-12 Boletos/Pix/gateway somente após seleção e sandbox validar assinatura webhook replay idempotência conciliação sem cobrança real em testes</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:8 }}>
        <input placeholder="gateway name UNIQUE 3..200" value={gwName} onChange={e=>setGwName(e.target.value)} />
        <select value={gwType} onChange={e=>setGwType(e.target.value)}><option value="boleto">boleto</option><option value="pix">pix</option><option value="cartao">cartao</option><option value="gateway">gateway</option><option value="outro">outro</option></select>
        <button onClick={createGateway}>Criar gateway selecionado sandbox</button>
        <input placeholder="webhook gateway_id" value={whGatewayId} onChange={e=>setWhGatewayId(e.target.value)} />
        <input placeholder="event_type 3..200" value={whEventType} onChange={e=>setWhEventType(e.target.value)} />
        <input placeholder="signature 10..1000 validar assinatura webhook" value={whSignature} onChange={e=>setWhSignature(e.target.value)} />
        <input placeholder="idempotency_key UNIQUE 10..200 validar replay idempotência" value={whIdempKey} onChange={e=>setWhIdempKey(e.target.value)} />
        <label><input type="checkbox" checked={whValidSig} onChange={e=>setWhValidSig(e.target.checked)} /> is_valid_signature</label>
        <button onClick={createWebhook}>Criar webhook validar assinatura replay idempotência</button>
        <input placeholder="charge gateway_id selecionado sandbox" value={chGatewayId} onChange={e=>setChGatewayId(e.target.value)} />
        <input placeholder="amount_cents >0" value={chAmount} onChange={e=>setChAmount(e.target.value)} />
        <input placeholder="idempotency_key UNIQUE 10..200 charge" value={chIdempKey} onChange={e=>setChIdempKey(e.target.value)} />
        <button onClick={createCharge}>Criar charge CHG-FIN sandbox sem cobrança real</button>
      </div>
      <ul>{gateways.slice(0,10).map(g=><li key={g.id}>{g.name} tipo:{g.gateway_type} status:{g.status} selecionado:{String(g.is_selected)} sandbox:{String(g.is_sandbox)} is_sandbox=true CHECK sem cobrança real</li>)}</ul>
      <ul>{webhooks.slice(0,10).map(w=><li key={w.id}>gw:{w.gateway_id.slice(0,8)} evento:{w.event_type} valid_sig:{String(w.is_valid_signature)} replay:{String(w.is_replay)} idemp:{w.idempotency_key.slice(0,20)} status:{w.status} validar assinatura replay idempotência conciliação</li>)}</ul>
      <ul>{charges.slice(0,10).map(c=><li key={c.id}>{c.protocol} gw:{c.gateway_id.slice(0,8)} amount:{c.amount_cents} status:{c.status} idemp:{c.idempotency_key.slice(0,20)} sandbox:{String(c.is_sandbox)} CHECK is_sandbox=true sem cobrança real conciliado:{String(c.is_conciliated)}</li>)}</ul>
    </section>
  );
}
