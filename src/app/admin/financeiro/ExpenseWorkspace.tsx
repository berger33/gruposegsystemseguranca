"use client";

import { FormEvent, useEffect, useState } from "react";

type Expense = { id:string; protocol:string; expense_type:string; category:string; description:string; amount_cents:string|number; threshold_cents:string|number; requester_name:string; requester_identity:string; approver_identity:string|null; status:string; contract_id:string; cost_center_id:string; supplier_id:string; evidence_file_name:string };
const money=(value:string|number)=>`R$ ${(Number(value)/100).toFixed(2).replace(".",",")}`;
async function api(path:string,init?:RequestInit){const response=await fetch(path,{...init,headers:{"Content-Type":"application/json",...(init?.headers||{})}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Erro ${response.status}`);return data;}
const empty={expense_type:"despesa",category:"",description:"",amount_cents:"",threshold_cents:"",requester_name:"",contract_id:"",cost_center_id:"",supplier_id:"",evidence_file_name:"",evidence_file_url:"",evidence_storage_key:"",idempotency_key:""};

export default function ExpenseWorkspace(){
  const [expenses,setExpenses]=useState<Expense[]>([]);const [form,setForm]=useState(empty);const [reason,setReason]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [notice,setNotice]=useState("");
  const load=async()=>{const data=await api("/api/fin/expenses");setExpenses(data.expenses||[]);};
  useEffect(()=>{load().catch(e=>setError(e instanceof Error?e.message:"Falha ao carregar"));},[]);
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError("");setNotice("");try{await fn();}catch(e){setError(e instanceof Error?e.message:"Falha inesperada");}finally{setBusy(false);}};
  const create=(event:FormEvent)=>{event.preventDefault();run(async()=>{await api("/api/fin/expenses",{method:"POST",body:JSON.stringify({...form,amount_cents:Number(form.amount_cents),threshold_cents:Number(form.threshold_cents)})});setForm(empty);setNotice("Solicitação sintética registrada e pendente de decisão segregada.");await load();});};
  const decide=(expense:Expense,status:"aprovado"|"rejeitado"|"cancelado")=>run(async()=>{await api("/api/fin/expenses",{method:"PATCH",body:JSON.stringify({id:expense.id,status,reason,approver_name:"Aprovador autenticado"})});setReason("");setNotice(status==="aprovado"?"Despesa aprovada dentro da alçada.":status==="rejeitado"?"Despesa rejeitada.":"Solicitação cancelada.");await load();});
  return <section data-testid="fin10-expenses"><h2>Despesas, reembolsos e compras</h2><p>A solicitação e a decisão usam identidades distintas. A evidência abaixo é somente metadado sintético; nenhuma compra ou integração externa é executada.</p>
    {error&&<p role="alert" data-testid="fin10-error">{error}</p>}{notice&&<p role="status" data-testid="fin10-notice">{notice}</p>}
    <form onSubmit={create} data-testid="fin10-create-form">
      <select data-testid="fin10-type" value={form.expense_type} onChange={e=>setForm({...form,expense_type:e.target.value})}><option value="despesa">Despesa</option><option value="reembolso">Reembolso</option><option value="compra">Compra</option><option value="outro">Outro</option></select>
      <input required minLength={3} maxLength={200} data-testid="fin10-category" placeholder="Categoria" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/>
      <input required minLength={10} maxLength={1000} data-testid="fin10-description" placeholder="Descrição sintética" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
      <input required type="number" min="1" data-testid="fin10-amount" placeholder="Valor em centavos" value={form.amount_cents} onChange={e=>setForm({...form,amount_cents:e.target.value})}/>
      <input required type="number" min="1" data-testid="fin10-threshold" placeholder="Alçada requerida em centavos" value={form.threshold_cents} onChange={e=>setForm({...form,threshold_cents:e.target.value})}/>
      <input required minLength={2} maxLength={200} data-testid="fin10-requester-name" placeholder="Nome do solicitante autenticado" value={form.requester_name} onChange={e=>setForm({...form,requester_name:e.target.value})}/>
      <input required data-testid="fin10-contract" placeholder="ID do contrato canônico" value={form.contract_id} onChange={e=>setForm({...form,contract_id:e.target.value})}/>
      <input required data-testid="fin10-cost-center" placeholder="ID do centro de custo canônico" value={form.cost_center_id} onChange={e=>setForm({...form,cost_center_id:e.target.value})}/>
      <input required data-testid="fin10-supplier" placeholder="ID do fornecedor canônico" value={form.supplier_id} onChange={e=>setForm({...form,supplier_id:e.target.value})}/>
      <input required data-testid="fin10-evidence-name" placeholder="Nome do metadado de evidência" value={form.evidence_file_name} onChange={e=>setForm({...form,evidence_file_name:e.target.value})}/>
      <input required data-testid="fin10-evidence-url" placeholder="synthetic://fin10/evidencia.json" value={form.evidence_file_url} onChange={e=>setForm({...form,evidence_file_url:e.target.value})}/>
      <input required data-testid="fin10-evidence-key" placeholder="synthetic/fin10/evidencia.json" value={form.evidence_storage_key} onChange={e=>setForm({...form,evidence_storage_key:e.target.value})}/>
      <input required minLength={8} maxLength={200} data-testid="fin10-idempotency" placeholder="Chave de idempotência" value={form.idempotency_key} onChange={e=>setForm({...form,idempotency_key:e.target.value})}/>
      <button data-testid="fin10-create" disabled={busy}>Solicitar</button>
    </form>
    <label>Motivo da decisão <input minLength={10} maxLength={1000} data-testid="fin10-decision-reason" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Motivo (10 a 1000 caracteres)"/></label>
    <table><thead><tr><th>Protocolo</th><th>Tipo</th><th>Valor</th><th>Solicitante</th><th>Status</th><th>Decisão</th></tr></thead><tbody>{expenses.length===0?<tr><td colSpan={6}>Nenhuma solicitação.</td></tr>:expenses.map(expense=><tr key={expense.id} data-testid={`fin10-expense-${expense.id}`}><td>{expense.protocol}</td><td>{expense.expense_type}</td><td>{money(expense.amount_cents)}</td><td>{expense.requester_name}</td><td>{expense.status}</td><td>{expense.status==="pendente"&&<><button disabled={busy||reason.length<10} data-testid={`fin10-approve-${expense.id}`} onClick={()=>decide(expense,"aprovado")}>Aprovar</button><button disabled={busy||reason.length<10} onClick={()=>decide(expense,"rejeitado")}>Rejeitar</button><button disabled={busy||reason.length<10} onClick={()=>decide(expense,"cancelado")}>Cancelar</button></>}</td></tr>)}</tbody></table>
  </section>;
}
