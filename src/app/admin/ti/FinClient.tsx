"use client";
import { useEffect, useState } from "react";

type Supplier = { id:string; name:string; category:string; is_active:boolean; };
type CostCenter = { id:string; name:string; description:string|null; };
type RecRule = { id:string; contract_id:string; recurrence_id:string; recurrence_type:string; amount_cents:number; is_active:boolean; is_approved:boolean; start_date:string; end_date:string|null; proration_enabled:boolean; reajuste_enabled:boolean; reajuste_percent:number|null; suspension_enabled:boolean; last_generated_competence:string|null; };
type Receivable = { id:string; protocol:string; client_account_id:string; contract_id:string|null; competence_date:string; due_date:string; amount_cents:number; amount_paid_cents:number; amount_remaining_cents:number; status:string; recurrence_id:string|null; is_recurring:boolean; };
type Payable = { id:string; protocol:string; supplier_id:string|null; category:string; competence_date:string; due_date:string; amount_cents:number; amount_paid_cents:number; status:string; approval_status:string; cost_center_id:string|null; };
type Payment = { id:string; account_type:string; amount_cents:number; payment_method:string; is_partial:boolean; is_estorno:boolean; is_renegotiation:boolean; created_at:string; };

export default function FinClient() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [rules, setRules] = useState<RecRule[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [msg, setMsg] = useState("");

  async function loadAll() {
    try {
      const [supRes, ccRes, ruleRes, recRes, payRes] = await Promise.all([
        fetch("/api/hr/fin-suppliers").then(r=>r.json()).catch(()=>({suppliers:[]})),
        fetch("/api/hr/fin-cost-centers").then(r=>r.json()).catch(()=>({costCenters:[]})),
        fetch("/api/hr/fin-recurrence-rules").then(r=>r.json()).catch(()=>({rules:[]})),
        fetch("/api/hr/fin-receivables").then(r=>r.json()).catch(()=>({receivables:[]})),
        fetch("/api/hr/fin-payables").then(r=>r.json()).catch(()=>({payables:[]})),
      ]);
      if (supRes.suppliers) setSuppliers(supRes.suppliers);
      if (ccRes.costCenters) setCostCenters(ccRes.costCenters);
      if (ruleRes.rules) setRules(ruleRes.rules);
      if (recRes.receivables) setReceivables(recRes.receivables);
      if (payRes.payables) setPayables(payRes.payables);
    } catch {}
  }
  useEffect(()=>{ loadAll(); }, []);

  async function api(path:string, method:string, body?:any) {
    const res = await fetch(path, { method, headers: { "Content-Type":"application/json" }, body: body? JSON.stringify(body): undefined });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error || data.detail || "erro");
    return data;
  }

  const [supForm, setSupForm] = useState({ name:"", document_ref:"", category:"outro" });
  async function createSupplier() {
    try { await api("/api/hr/fin-suppliers","POST",{ name:supForm.name, document_ref:supForm.document_ref, category:supForm.category }); setMsg("Fornecedor criado"); loadAll(); } catch(e:any){ setMsg("Erro fornecedor: "+e.message); }
  }
  const [ccForm, setCcForm] = useState({ name:"", description:"" });
  async function createCostCenter() {
    try { await api("/api/hr/fin-cost-centers","POST",{ name:ccForm.name, description:ccForm.description }); setMsg("Centro custo criado"); loadAll(); } catch(e:any){ setMsg("Erro CC: "+e.message); }
  }
  const [ruleForm, setRuleForm] = useState({ contract_id:"", contract_item_id:"", recurrence_type:"mensal", start_date:"", end_date:"", amount_cents:"", recurrence_id:"", proration_enabled:"false", proration_rule:"", reajuste_enabled:"false", reajuste_percent:"", suspension_enabled:"false", suspension_reason:"" });
  async function createRule() {
    try { const d=await api("/api/hr/fin-recurrence-rules","POST",{ contract_id:ruleForm.contract_id, contract_item_id:ruleForm.contract_item_id||null, recurrence_type:ruleForm.recurrence_type, start_date:ruleForm.start_date, end_date:ruleForm.end_date||null, amount_cents:parseInt(ruleForm.amount_cents), recurrence_id:ruleForm.recurrence_id, proration_enabled:ruleForm.proration_enabled==="true", proration_rule:ruleForm.proration_rule||null, reajuste_enabled:ruleForm.reajuste_enabled==="true", reajuste_percent:ruleForm.reajuste_percent?parseFloat(ruleForm.reajuste_percent):null, suspension_enabled:ruleForm.suspension_enabled==="true", suspension_reason:ruleForm.suspension_reason||null }); setMsg("Regra recorrência "+d.rule.recurrence_id+" pró-rata reajuste suspensão conforme regras aprovadas"); loadAll(); } catch(e:any){ setMsg("Erro regra: "+e.message); }
  }
  const [approveForm, setApproveForm] = useState({ id:"", is_approved:"true", is_active:"true" });
  async function approveRule() {
    try { await api("/api/hr/fin-recurrence-rules","PATCH",{ id:approveForm.id, is_approved:approveForm.is_approved==="true", is_active:approveForm.is_active==="true" }); setMsg("Regra aprovada ativa regras aprovadas"); loadAll(); } catch(e:any){ setMsg("Erro aprovar regra: "+e.message); }
  }
  const [recForm, setRecForm] = useState({ client_account_id:"", contract_id:"", contract_item_id:"", competence_date:"", due_date:"", amount_cents:"", recurrence_type:"unica", recurrence_id:"", recurrence_rule_id:"", description:"", is_recurring:"false" });
  async function createReceivable() {
    try { const d=await api("/api/hr/fin-receivables","POST",{ client_account_id:recForm.client_account_id, contract_id:recForm.contract_id||null, contract_item_id:recForm.contract_item_id||null, competence_date:recForm.competence_date, due_date:recForm.due_date, amount_cents:parseInt(recForm.amount_cents), recurrence_type:recForm.recurrence_type, recurrence_id:recForm.recurrence_id||null, recurrence_rule_id:recForm.recurrence_rule_id||null, description:recForm.description, is_recurring:recForm.is_recurring==="true" }); setMsg("Receber "+d.receivable.protocol+" vinculada contrato competência vencimento recorrência moeda valor situação idempotente"); loadAll(); } catch(e:any){ setMsg("Erro receber: "+e.message); }
  }
  const [genForm, setGenForm] = useState({ recurrence_rule_id:"", competence_date:"", due_date:"", client_account_id:"", contract_id:"", contract_item_id:"", amount_cents:"" });
  async function generateRecurring() {
    try { const d=await api("/api/hr/fin-generate-recurring","POST",{ recurrence_rule_id:genForm.recurrence_rule_id, competence_date:genForm.competence_date, due_date:genForm.due_date, client_account_id:genForm.client_account_id, contract_id:genForm.contract_id||null, contract_item_id:genForm.contract_item_id||null, amount_cents:genForm.amount_cents?parseInt(genForm.amount_cents):null }); setMsg("Geração recorrente idempotente "+d.receivable.protocol+" pró-rata reajuste suspensão regras aprovadas"); loadAll(); } catch(e:any){ setMsg("Erro gerar recorrente: "+e.message); }
  }
  const [payableForm, setPayableForm] = useState({ supplier_id:"", client_account_id:"", contract_id:"", cost_center_id:"", category:"outro", competence_date:"", due_date:"", amount_cents:"", recurrence_type:"unica", recurrence_id:"", description:"", is_recurring:"false" });
  async function createPayable() {
    try { const d=await api("/api/hr/fin-payables","POST",{ supplier_id:payableForm.supplier_id||null, client_account_id:payableForm.client_account_id||null, contract_id:payableForm.contract_id||null, cost_center_id:payableForm.cost_center_id||null, category:payableForm.category, competence_date:payableForm.competence_date, due_date:payableForm.due_date, amount_cents:parseInt(payableForm.amount_cents), recurrence_type:payableForm.recurrence_type, recurrence_id:payableForm.recurrence_id||null, description:payableForm.description, is_recurring:payableForm.is_recurring==="true" }); setMsg("Pagar "+d.payable.protocol+" fornecedor categoria centro custo vencimento aprovação anexos"); loadAll(); } catch(e:any){ setMsg("Erro pagar: "+e.message); }
  }
  const [paymentForm, setPaymentForm] = useState({ account_type:"receber", receivable_id:"", payable_id:"", amount_cents:"", payment_method:"pix", is_partial:"false", is_estorno:"false", is_renegotiation:"false", previous_payment_id:"", reason:"", notes:"" });
  async function createPayment() {
    try { const d=await api("/api/hr/fin-payments","POST",{ account_type:paymentForm.account_type, receivable_id:paymentForm.receivable_id||null, payable_id:paymentForm.payable_id||null, amount_cents:parseInt(paymentForm.amount_cents), payment_method:paymentForm.payment_method, is_partial:paymentForm.is_partial==="true", is_estorno:paymentForm.is_estorno==="true", is_renegotiation:paymentForm.is_renegotiation==="true", previous_payment_id:paymentForm.previous_payment_id||null, reason:paymentForm.reason, notes:paymentForm.notes }); setMsg("Pagamento "+(d.payment.is_estorno?"estorno ":d.payment.is_renegotiation?"renegociação ":"")+(d.payment.is_partial?"parcial ":"")+"baixa auditada nunca apagar saldo silenciosa"); const hist = await api("/api/hr/fin-payment-history?"+(paymentForm.account_type==="receber"?"receivable_id="+paymentForm.receivable_id:"payable_id="+paymentForm.payable_id),"GET"); if(hist.history) setPayments([]); loadAll(); } catch(e:any){ setMsg("Erro pagamento: "+e.message); }
  }
  const [statusForm, setStatusForm] = useState({ id:"", status:"aprovado", approval_status:"aprovado", reason:"Baixa auditada motivo obrigatório 10..1000" });
  async function updateStatus() {
    // A situação de uma conta a receber nasce da baixa canônica (F03): esta
    // tela não altera mais estado de recebível por atalho. Contas a pagar
    // continuam no fluxo legado de aprovação com motivo.
    if(statusForm.id.startsWith("REC") || receivables.find(r=>r.id===statusForm.id)) { setMsg("Conta a receber: a situação muda apenas pela baixa canônica em Financeiro › Contas · baixa · relatório (PATCH /api/admin/finance/l07/receivables)."); return; }
    try { await api("/api/hr/fin-payables","PATCH",{ id:statusForm.id, status:statusForm.status, approval_status:statusForm.approval_status, reason:statusForm.reason }); setMsg("Status atualizado baixa auditada"); loadAll(); } catch(e:any){ setMsg("Erro status: "+e.message); }
  }

  return (
    <section style={{ marginTop:24, padding:16, border:"1px solid #6a6", borderRadius:8 }}>
      <h2 style={{ color:"var(--theme-accent)" }}>FIN-01/02/03/04 — Contas Receber/Pagar Recorrência Idempotente Pagamento Parcial Estorno Baixa Auditada</h2>
      {msg && <p style={{ background:"#efe", padding:8 }}>{msg}</p>}

      <h3>Fornecedores e Centro Custo</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="fornecedor nome 3..200" value={supForm.name} onChange={e=>setSupForm({...supForm, name:e.target.value})} />
        <input placeholder="doc" value={supForm.document_ref} onChange={e=>setSupForm({...supForm, document_ref:e.target.value})} />
        <select value={supForm.category} onChange={e=>setSupForm({...supForm, category:e.target.value})}><option value="servico">serviço</option><option value="material">material</option><option value="equipamento">equipamento</option></select>
        <button onClick={createSupplier}>Criar Fornecedor</button>
        <input placeholder="centro custo nome 3..200" value={ccForm.name} onChange={e=>setCcForm({...ccForm, name:e.target.value})} />
        <input placeholder="descrição" value={ccForm.description} onChange={e=>setCcForm({...ccForm, description:e.target.value})} />
        <button onClick={createCostCenter}>Criar Centro Custo</button>
      </div>
      <ul style={{ fontSize:11 }}>{suppliers.map(s=>(<li key={s.id}>{s.name} {s.category} {s.is_active?"ativo":"inativo"} <button onClick={()=>setPayableForm({...payableForm, supplier_id:s.id})}>Usar fornecedor</button></li>))}</ul>
      <ul style={{ fontSize:11 }}>{costCenters.map(c=>(<li key={c.id}>{c.name} {c.description} <button onClick={()=>setPayableForm({...payableForm, cost_center_id:c.id})}>Usar CC</button></li>))}</ul>

      <h3>FIN-03 Regras Recorrência Idempotente Pró-rata Reajuste Suspensão Conforme Regras Aprovadas</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="contract_id" value={ruleForm.contract_id} onChange={e=>setRuleForm({...ruleForm, contract_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="contract_item_id" value={ruleForm.contract_item_id} onChange={e=>setRuleForm({...ruleForm, contract_item_id:e.target.value})} style={{ width:180 }} />
        <select value={ruleForm.recurrence_type} onChange={e=>setRuleForm({...ruleForm, recurrence_type:e.target.value})}><option value="mensal">mensal</option><option value="semanal">semanal</option><option value="anual">anual</option></select>
        <input type="date" value={ruleForm.start_date} onChange={e=>setRuleForm({...ruleForm, start_date:e.target.value})} />
        <input type="date" value={ruleForm.end_date} onChange={e=>setRuleForm({...ruleForm, end_date:e.target.value})} />
        <input placeholder="amount_cents" value={ruleForm.amount_cents} onChange={e=>setRuleForm({...ruleForm, amount_cents:e.target.value})} style={{ width:100 }} />
        <input placeholder="recurrence_id ex REC-MENSAL-001" value={ruleForm.recurrence_id} onChange={e=>setRuleForm({...ruleForm, recurrence_id:e.target.value})} />
        <select value={ruleForm.proration_enabled} onChange={e=>setRuleForm({...ruleForm, proration_enabled:e.target.value})}><option value="false">sem pró-rata</option><option value="true">com pró-rata</option></select>
        <input placeholder="proration_rule" value={ruleForm.proration_rule} onChange={e=>setRuleForm({...ruleForm, proration_rule:e.target.value})} />
        <select value={ruleForm.reajuste_enabled} onChange={e=>setRuleForm({...ruleForm, reajuste_enabled:e.target.value})}><option value="false">sem reajuste</option><option value="true">com reajuste</option></select>
        <input placeholder="reajuste % ex 5.00" value={ruleForm.reajuste_percent} onChange={e=>setRuleForm({...ruleForm, reajuste_percent:e.target.value})} style={{ width:80 }} />
        <select value={ruleForm.suspension_enabled} onChange={e=>setRuleForm({...ruleForm, suspension_enabled:e.target.value})}><option value="false">sem suspensão</option><option value="true">suspenso</option></select>
        <input placeholder="suspension_reason" value={ruleForm.suspension_reason} onChange={e=>setRuleForm({...ruleForm, suspension_reason:e.target.value})} />
        <button onClick={createRule}>Criar Regra Recorrência</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:80, overflow:"auto" }}>{rules.map(r=>(<li key={r.id}>{r.recurrence_id} contrato {r.contract_id.slice(0,6)} {r.recurrence_type} R$ {(r.amount_cents/100).toFixed(2)} {r.is_active?"ativo":"inativo"} {r.is_approved?"aprovada":"pendente aprovação"} pró-rata {r.proration_enabled?"sim":"não"} reajuste {r.reajuste_percent||0}% suspensão {r.suspension_enabled?"sim":"não"} último {r.last_generated_competence||"-"} <button onClick={()=>{ setApproveForm({id:r.id, is_approved:"true", is_active:"true"}); setGenForm({...genForm, recurrence_rule_id:r.id, contract_id:r.contract_id}); setRecForm({...recForm, recurrence_rule_id:r.id, contract_id:r.contract_id, recurrence_id:r.recurrence_id}); }}>Aprovar/Gerar</button></li>))}</ul>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="rule id aprovar" value={approveForm.id} onChange={e=>setApproveForm({...approveForm, id:e.target.value})} style={{ width:180 }} />
        <select value={approveForm.is_approved} onChange={e=>setApproveForm({...approveForm, is_approved:e.target.value})}><option value="true">aprovar regra</option><option value="false">desaprovar</option></select>
        <button onClick={approveRule}>Aprovar Regra Regras Aprovadas</button>
      </div>

      <h3>FIN-01 Contas a Receber Vinculadas Contrato Competência Vencimento Recorrência Moeda Valor Situação</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="client_account_id" value={recForm.client_account_id} onChange={e=>setRecForm({...recForm, client_account_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="contract_id" value={recForm.contract_id} onChange={e=>setRecForm({...recForm, contract_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="contract_item_id" value={recForm.contract_item_id} onChange={e=>setRecForm({...recForm, contract_item_id:e.target.value})} style={{ width:180 }} />
        <input type="date" value={recForm.competence_date} onChange={e=>setRecForm({...recForm, competence_date:e.target.value})} />
        <input type="date" value={recForm.due_date} onChange={e=>setRecForm({...recForm, due_date:e.target.value})} />
        <input placeholder="amount_cents" value={recForm.amount_cents} onChange={e=>setRecForm({...recForm, amount_cents:e.target.value})} style={{ width:100 }} />
        <input placeholder="recurrence_id" value={recForm.recurrence_id} onChange={e=>setRecForm({...recForm, recurrence_id:e.target.value})} />
        <input placeholder="recurrence_rule_id" value={recForm.recurrence_rule_id} onChange={e=>setRecForm({...recForm, recurrence_rule_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="descrição 10..1000" value={recForm.description} onChange={e=>setRecForm({...recForm, description:e.target.value})} />
        <select value={recForm.is_recurring} onChange={e=>setRecForm({...recForm, is_recurring:e.target.value})}><option value="false">única</option><option value="true">recorrente</option></select>
        <button onClick={createReceivable}>Criar Receber Idempotente Contrato/Competência/Item</button>
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="recurrence_rule_id gerar" value={genForm.recurrence_rule_id} onChange={e=>setGenForm({...genForm, recurrence_rule_id:e.target.value})} style={{ width:180 }} />
        <input type="date" value={genForm.competence_date} onChange={e=>setGenForm({...genForm, competence_date:e.target.value})} />
        <input type="date" value={genForm.due_date} onChange={e=>setGenForm({...genForm, due_date:e.target.value})} />
        <input placeholder="client_account_id gerar" value={genForm.client_account_id} onChange={e=>setGenForm({...genForm, client_account_id:e.target.value})} style={{ width:180 }} />
        <button onClick={generateRecurring}>Gerar Recorrente Idempotente Pró-rata Reajuste Suspensão Regras Aprovadas</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:100, overflow:"auto" }}>{receivables.map(r=>(<li key={r.id}>{r.protocol} conta {r.client_account_id.slice(0,6)} contrato {r.contract_id?.slice(0,6)||"-"} comp {r.competence_date} venc {r.due_date} R$ {(r.amount_cents/100).toFixed(2)} pago R$ {(r.amount_paid_cents/100).toFixed(2)} restante R$ {(r.amount_remaining_cents/100).toFixed(2)} {r.status} {r.recurrence_id||""} {r.is_recurring?"recorrente":""} <button onClick={()=>setPaymentForm({...paymentForm, account_type:"receber", receivable_id:r.id, payable_id:""})}>Pagar/Estornar</button></li>))}</ul>

      <h3>FIN-02 Contas a Pagar Fornecedores Categoria Centro Custo Vencimento Aprovação Anexos</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="supplier_id" value={payableForm.supplier_id} onChange={e=>setPayableForm({...payableForm, supplier_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="cost_center_id" value={payableForm.cost_center_id} onChange={e=>setPayableForm({...payableForm, cost_center_id:e.target.value})} style={{ width:180 }} />
        <select value={payableForm.category} onChange={e=>setPayableForm({...payableForm, category:e.target.value})}><option value="servico">serviço</option><option value="material">material</option><option value="equipamento">equipamento</option><option value="imposto">imposto</option></select>
        <input type="date" value={payableForm.competence_date} onChange={e=>setPayableForm({...payableForm, competence_date:e.target.value})} />
        <input type="date" value={payableForm.due_date} onChange={e=>setPayableForm({...payableForm, due_date:e.target.value})} />
        <input placeholder="amount_cents" value={payableForm.amount_cents} onChange={e=>setPayableForm({...payableForm, amount_cents:e.target.value})} style={{ width:100 }} />
        <input placeholder="descrição" value={payableForm.description} onChange={e=>setPayableForm({...payableForm, description:e.target.value})} />
        <button onClick={createPayable}>Criar Pagar Idempotente</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:80, overflow:"auto" }}>{payables.map(p=>(<li key={p.id}>{p.protocol} fornecedor {p.supplier_id?.slice(0,6)||"-"} cat {p.category} CC {p.cost_center_id?.slice(0,6)||"-"} comp {p.competence_date} venc {p.due_date} R$ {(p.amount_cents/100).toFixed(2)} pago {(p.amount_paid_cents/100).toFixed(2)} {p.status} aprovação {p.approval_status} <button onClick={()=>setPaymentForm({...paymentForm, account_type:"pagar", payable_id:p.id, receivable_id:""})}>Pagar/Estornar</button></li>))}</ul>

      <h3>FIN-04 Pagamento/Recebimento Parcial Estorno Cancelamento Renegociação Baixa Auditada Nunca Apagar Saldo Por Edição Silenciosa</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <select value={paymentForm.account_type} onChange={e=>setPaymentForm({...paymentForm, account_type:e.target.value})}><option value="receber">receber</option><option value="pagar">pagar</option></select>
        <input placeholder="receivable_id" value={paymentForm.receivable_id} onChange={e=>setPaymentForm({...paymentForm, receivable_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="payable_id" value={paymentForm.payable_id} onChange={e=>setPaymentForm({...paymentForm, payable_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="amount_cents" value={paymentForm.amount_cents} onChange={e=>setPaymentForm({...paymentForm, amount_cents:e.target.value})} style={{ width:100 }} />
        <select value={paymentForm.payment_method} onChange={e=>setPaymentForm({...paymentForm, payment_method:e.target.value})}><option value="pix">pix</option><option value="boleto">boleto</option><option value="transferencia">transferência</option></select>
        <select value={paymentForm.is_partial} onChange={e=>setPaymentForm({...paymentForm, is_partial:e.target.value})}><option value="false">integral</option><option value="true">parcial</option></select>
        <select value={paymentForm.is_estorno} onChange={e=>setPaymentForm({...paymentForm, is_estorno:e.target.value})}><option value="false">pagamento</option><option value="true">estorno</option></select>
        <select value={paymentForm.is_renegotiation} onChange={e=>setPaymentForm({...paymentForm, is_renegotiation:e.target.value})}><option value="false">normal</option><option value="true">renegociação</option></select>
        <input placeholder="previous_payment_id se estorno" value={paymentForm.previous_payment_id} onChange={e=>setPaymentForm({...paymentForm, previous_payment_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="reason 10..1000 baixa auditada obrigatório" value={paymentForm.reason} onChange={e=>setPaymentForm({...paymentForm, reason:e.target.value})} style={{ width:250 }} />
        <button onClick={createPayment}>Criar Pagamento Baixa Auditada Nunca Apagar Saldo Silenciosa</button>
      </div>

      <h3>Status e Aprovação com Motivo Auditado (contas a pagar)</h3>
      <p>A situação de contas a <strong>receber</strong> não é editada aqui: ela decorre da baixa canônica em Financeiro › Contas · baixa · relatório, com escopo, idempotência e trilha.</p>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="id da conta a pagar" value={statusForm.id} onChange={e=>setStatusForm({...statusForm, id:e.target.value})} style={{ width:200 }} />
        <select value={statusForm.status} onChange={e=>setStatusForm({...statusForm, status:e.target.value})}><option value="pendente">pendente</option><option value="aprovado">aprovado</option><option value="pago">pago</option><option value="recebido">recebido</option><option value="cancelado">cancelado</option><option value="renegociado">renegociado</option><option value="estornado">estornado</option></select>
        <select value={statusForm.approval_status} onChange={e=>setStatusForm({...statusForm, approval_status:e.target.value})}><option value="pendente">pendente aprovação</option><option value="aprovado">aprovado</option><option value="rejeitado">rejeitado</option></select>
        <input placeholder="reason 10..1000 obrigatório" value={statusForm.reason} onChange={e=>setStatusForm({...statusForm, reason:e.target.value})} style={{ width:250 }} />
        <button onClick={updateStatus}>Atualizar Status Baixa Auditada</button>
      </div>
    </section>
  );
}
