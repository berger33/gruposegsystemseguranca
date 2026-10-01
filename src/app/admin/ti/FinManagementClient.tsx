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

  // FIN-11: a escrita fiscal canônica vive em /admin/financeiro (aba Fiscal).
  // Esta tela de TI permanece somente como leitura para diagnóstico.

  // FIN-12: a escrita canônica de gateway/webhook/cobrança vive em
  // /admin/financeiro (aba Boletos/Pix/Gateway). Esta tela de TI permanece
  // somente como leitura para diagnóstico.

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

      <h3>FIN-11 Integração contábil/fiscal mediante provedor (somente leitura)</h3>
      <p style={{ fontSize:12 }}>A obrigação é determinada pela atividade através de regra canônica explícita (NFS-e, NF-e, NFC-e, CT-e ou outra obrigação); nenhuma nota única é assumida e nenhuma emissão fiscal real é executada. A criação e as transições ficam em <a href="/admin/financeiro">/admin/financeiro</a>, aba Fiscal / Obrigações.</p>
      <ul>{providers.slice(0,10).map(p=><li key={p.id}>{p.name} tipo:{p.provider_type} status:{p.status} ativo:{String(p.is_active)}</li>)}</ul>
      <ul>{obligations.slice(0,20).map(o=><li key={o.id}>{o.obligation_type} atividade:{o.activity_type} determinada:{String(o.is_determined)} status:{o.status} rule:{o.rule.slice(0,60)}</li>)}</ul>
      <ul>{docs.slice(0,10).map(d=><li key={d.id}>{d.protocol} tipo:{d.document_type} status:{d.status} amount:{d.amount_cents} sandbox:{String(d.is_sandbox)} storage:{d.storage_key?.slice(0,20)||"—"}</li>)}</ul>

      <h3>FIN-12 Boletos/Pix/gateway somente após seleção e sandbox (somente leitura)</h3>
      <p style={{ fontSize:12 }}>A cobrança só existe depois de o gateway ser selecionado e testado em sandbox; a assinatura do webhook é sempre recalculada no servidor e a conciliação liga um webhook validado a uma cobrança específica. A criação e as transições ficam em <a href="/admin/financeiro">/admin/financeiro</a>, aba Boletos/Pix/Gateway.</p>
      <ul>{gateways.slice(0,10).map(g=><li key={g.id}>{g.name} tipo:{g.gateway_type} status:{g.status} selecionado:{String(g.is_selected)} sandbox:{String(g.is_sandbox)} is_sandbox=true CHECK sem cobrança real</li>)}</ul>
      <ul>{webhooks.slice(0,10).map(w=><li key={w.id}>gw:{w.gateway_id.slice(0,8)} evento:{w.event_type} valid_sig:{String(w.is_valid_signature)} replay:{String(w.is_replay)} idemp:{w.idempotency_key.slice(0,20)} status:{w.status} validar assinatura replay idempotência conciliação</li>)}</ul>
      <ul>{charges.slice(0,10).map(c=><li key={c.id}>{c.protocol} gw:{c.gateway_id.slice(0,8)} amount:{c.amount_cents} status:{c.status} idemp:{c.idempotency_key.slice(0,20)} sandbox:{String(c.is_sandbox)} CHECK is_sandbox=true sem cobrança real conciliado:{String(c.is_conciliated)}</li>)}</ul>
    </section>
  );
}
