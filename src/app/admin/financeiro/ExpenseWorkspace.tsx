"use client";

// FIN-10 — despesas, reembolsos e compras (jornada canônica).
//
// Solicitar e decidir são identidades distintas; os valores são informados em
// reais e exibidos com Intl.NumberFormat pt-BR. A evidência é apenas metadado
// sintético local (`synthetic://...`) — nenhum arquivo, recibo ou nota externa
// é lido, gravado ou prometido, e nenhuma decisão gera pagamento, baixa,
// cobrança ou efeito financeiro automático. Quando a política de alçada está
// ausente/inativa, a tela declara a pendência em vez de prometer aprovação.

import { FormEvent, useEffect, useState } from "react";

type Expense = {
  id:string; protocol:string; expense_type:string; category:string; description:string;
  amount_cents:string|number; threshold_cents:string|number; status:string;
  requester_name:string; requester_identity:string|null;
  approver_name:string|null; approver_identity:string|null;
  contract_id:string|null; cost_center_id:string|null; supplier_id:string|null;
  cost_center_name:string|null; supplier_name:string|null; contract_title:string|null;
  evidence_file_name:string|null; evidence_storage_key:string|null;
  applied_authority_limit_cents:string|number|null; rejection_reason:string|null;
};
type HistoryEntry = {
  id:string; previous_status:string|null; next_status:string; reason:string;
  changed_by_identity:string|null; authority_limit_cents:string|number|null;
  is_authority_verified:boolean; created_at:string;
};
type CostCenter = { id:string; name:string; is_active:boolean };
type Supplier = { id:string; name:string; is_active:boolean };
type Authority = { identity_id:string; display_name:string|null; max_amount_cents:string|number; is_active:boolean };

const brl = new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" });
const money = (value:string|number|null|undefined) => value==null ? "—" : brl.format(Number(value)/100);
const parseBrl = (raw:string):number|null => {
  const text=raw.trim().replace(/[^\d.,]/g,"");
  if(!text) return null;
  const lastComma=text.lastIndexOf(","), lastDot=text.lastIndexOf(".");
  const normalized = lastComma>=0 && lastComma>lastDot
    ? `${text.slice(0,lastComma).replace(/[.,]/g,"")}.${text.slice(lastComma+1)}`
    : text.replace(/,/g,"");
  if(!/^\d{1,12}(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized)*100);
};
async function api(path:string, init?:RequestInit) {
  const response=await fetch(path,{...init,headers:{"Content-Type":"application/json",...(init?.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||`Erro ${response.status}`);
  return data;
}

const emptyForm={expense_type:"despesa",category:"",description:"",amount:"",threshold:"",contract_id:"",cost_center_id:"",supplier_id:"",evidence_file_name:"",evidence_file_url:"",evidence_storage_key:"",idempotency_key:""};
const STATUS_LABELS:Record<string,string>={pendente:"Pendente",aprovado:"Aprovado",rejeitado:"Rejeitado",cancelado:"Cancelado"};

export default function ExpenseWorkspace(){
  const [expenses,setExpenses]=useState<Expense[]>([]);
  const [centers,setCenters]=useState<CostCenter[]>([]);
  const [suppliers,setSuppliers]=useState<Supplier[]>([]);
  const [authorities,setAuthorities]=useState<Authority[]>([]);
  const [history,setHistory]=useState<HistoryEntry[]>([]);
  const [selectedId,setSelectedId]=useState("");
  const [search,setSearch]=useState("");
  const [form,setForm]=useState(emptyForm);
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false); const [loading,setLoading]=useState(false);
  const [error,setError]=useState(""); const [notice,setNotice]=useState("");

  const load=async(term:string=search)=>{
    setLoading(true); setError("");
    try{
      const [expenseData,centerData,supplierData,authorityData]=await Promise.all([
        api(`/api/fin/expenses${term.trim()?`?search=${encodeURIComponent(term.trim())}`:""}`),
        api("/api/fin/cost-centers"),
        api("/api/fin/suppliers"),
        api("/api/fin/expense-authorities"),
      ]);
      setExpenses(expenseData.expenses||[]);
      setCenters(centerData.costCenters||[]);
      setSuppliers(supplierData.suppliers||[]);
      setAuthorities(authorityData.authorities||[]);
    }catch(e){ setError(e instanceof Error?e.message:"Falha ao carregar despesas"); }
    finally{ setLoading(false); }
  };
  useEffect(()=>{ void load(); },[]); // eslint-disable-line react-hooks/exhaustive-deps
  const run=async(fn:()=>Promise<void>)=>{ setBusy(true); setError(""); setNotice(""); try{ await fn(); } catch(e){ setError(e instanceof Error?e.message:"Falha inesperada"); } finally{ setBusy(false); } };

  const activeAuthorities=authorities.filter(item=>item.is_active);
  const selected=expenses.find(item=>item.id===selectedId)||null;

  const create=(event:FormEvent)=>{ event.preventDefault(); run(async()=>{
    const amount=parseBrl(form.amount), threshold=parseBrl(form.threshold);
    if(amount==null||amount<=0) throw new Error("Informe o valor em reais (ex.: 750,00).");
    if(threshold==null||threshold<=0) throw new Error("Informe a alçada declarada em reais (ex.: 750,00).");
    const data=await api("/api/fin/expenses",{method:"POST",body:JSON.stringify({...form,amount_cents:amount,threshold_cents:threshold})});
    setForm(emptyForm); setSearch("");
    setNotice(data.idempotent_replay
      ?`Retry idempotente: a solicitação ${data.expense.protocol} já estava registrada como pendente.`
      :`Solicitação ${data.expense.protocol} registrada como pendente de decisão segregada; nada foi comprado ou pago.`);
    await load("");
  }); };

  const select=(id:string)=>run(async()=>{
    setSelectedId(id);
    const data=await api(`/api/fin/expense-history?expense_id=${encodeURIComponent(id)}`);
    setHistory(data.history||[]);
  });

  const decide=(expense:Expense,status:"aprovado"|"rejeitado"|"cancelado")=>run(async()=>{
    const data=await api("/api/fin/expenses",{method:"PATCH",body:JSON.stringify({id:expense.id,status,reason})});
    setReason("");
    setNotice(status==="aprovado"
      ?`Solicitação ${data.expense.protocol} aprovada dentro da alçada aplicada ${money(data.expense.applied_authority_limit_cents)} por identidade distinta.`
      :status==="rejeitado"
        ?`Solicitação ${data.expense.protocol} rejeitada com motivo registrado.`
        :`Solicitação ${data.expense.protocol} cancelada pelo próprio solicitante.`);
    await load(search);
    const refreshed=await api(`/api/fin/expense-history?expense_id=${encodeURIComponent(expense.id)}`);
    setHistory(refreshed.history||[]);
  });

  return <section data-testid="fin10-expenses">
    <h2>Despesas, reembolsos e compras</h2>
    <p>Solicitar e decidir são identidades distintas. A aprovação exige alçada ativa que cubra o valor e evidência sintética; a ausência de política de alçada nunca vira aprovação automática. Nenhuma compra, pagamento ou integração externa é executada aqui.</p>
    {error&&<div role="alert" data-testid="fin10-error"><p>{error}</p><button type="button" data-testid="fin10-retry" disabled={loading} onClick={()=>void load(search)}>Tentar novamente</button></div>}
    {notice&&<p role="status" data-testid="fin10-notice">{notice}</p>}
    {loading&&<p data-testid="fin10-loading">Carregando…</p>}

    <h3>Política de alçada</h3>
    {activeAuthorities.length===0
      ?<p data-testid="fin10-policy-missing">Nenhuma alçada ativa configurada. A política de alçada (quem aprova e até quanto) é decisão do proprietário e ainda não foi definida; enquanto isso, nenhuma solicitação pode ser aprovada e todas permanecem pendentes.</p>
      :<ul data-testid="fin10-policy-list">{activeAuthorities.map(item=><li key={item.identity_id}>{item.display_name||item.identity_id} · limite {money(item.max_amount_cents)}</li>)}</ul>}

    <h3>Nova solicitação</h3>
    <form onSubmit={create} data-testid="fin10-create-form">
      <select data-testid="fin10-type" value={form.expense_type} onChange={e=>setForm({...form,expense_type:e.target.value})}>
        <option value="despesa">Despesa</option><option value="reembolso">Reembolso</option><option value="compra">Compra</option><option value="outro">Outro</option>
      </select>
      <input required minLength={3} maxLength={200} data-testid="fin10-category" placeholder="Categoria" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/>
      <input required minLength={10} maxLength={1000} data-testid="fin10-description" placeholder="Descrição sintética (10 a 1000 caracteres)" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
      <input required data-testid="fin10-amount" placeholder="Valor em R$ (ex.: 750,00)" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value,threshold:e.target.value})}/>
      <input required data-testid="fin10-threshold" placeholder="Alçada declarada em R$ (ex.: 750,00)" value={form.threshold} onChange={e=>setForm({...form,threshold:e.target.value})}/>
      <select required data-testid="fin10-cost-center" value={form.cost_center_id} onChange={e=>setForm({...form,cost_center_id:e.target.value})}>
        <option value="">Selecione o centro de custo canônico</option>
        {centers.filter(item=>item.is_active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select required data-testid="fin10-supplier" value={form.supplier_id} onChange={e=>setForm({...form,supplier_id:e.target.value})}>
        <option value="">Selecione o fornecedor canônico</option>
        {suppliers.filter(item=>item.is_active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <input required data-testid="fin10-contract" placeholder="ID do contrato canônico" value={form.contract_id} onChange={e=>setForm({...form,contract_id:e.target.value})}/>
      <input required data-testid="fin10-evidence-name" placeholder="Nome do metadado de evidência sintética" value={form.evidence_file_name} onChange={e=>setForm({...form,evidence_file_name:e.target.value})}/>
      <input required data-testid="fin10-evidence-url" placeholder="synthetic://fin10/evidencia.json" value={form.evidence_file_url} onChange={e=>setForm({...form,evidence_file_url:e.target.value})}/>
      <input required data-testid="fin10-evidence-key" placeholder="synthetic/fin10/evidencia.json" value={form.evidence_storage_key} onChange={e=>setForm({...form,evidence_storage_key:e.target.value})}/>
      <input required minLength={8} maxLength={200} data-testid="fin10-idempotency" placeholder="Chave de idempotência (8 a 200)" value={form.idempotency_key} onChange={e=>setForm({...form,idempotency_key:e.target.value})}/>
      <button data-testid="fin10-create" disabled={busy}>Solicitar</button>
    </form>

    <h3>Solicitações</h3>
    <form onSubmit={e=>{e.preventDefault(); void load(search);}} data-testid="fin10-search-form">
      <input data-testid="fin10-search" placeholder="Buscar por protocolo, solicitante ou descrição" value={search} onChange={e=>setSearch(e.target.value)}/>
      <button type="submit" data-testid="fin10-search-submit" disabled={loading}>Buscar</button>
    </form>
    {!error&&
      <table data-testid="fin10-list">
        <thead><tr><th>Protocolo</th><th>Tipo</th><th>Valor</th><th>Solicitante</th><th>Status</th><th>Abrir</th></tr></thead>
        <tbody>
          {expenses.length===0
            ?<tr><td colSpan={6} data-testid="fin10-empty">Nenhuma solicitação encontrada.</td></tr>
            :expenses.map(expense=>
              <tr key={expense.id} data-testid={`fin10-expense-${expense.id}`}>
                <td>{expense.protocol}</td><td>{expense.expense_type}</td><td>{money(expense.amount_cents)}</td><td>{expense.requester_name}</td><td>{STATUS_LABELS[expense.status]||expense.status}</td>
                <td><button type="button" data-testid={`fin10-select-${expense.id}`} onClick={()=>void select(expense.id)}>Abrir</button></td>
              </tr>)}
        </tbody>
      </table>}

    {selected&&
      <div data-testid="fin10-detail">
        <h3>{selected.protocol}</h3>
        <p data-testid="fin10-detail-summary">
          {selected.description} · {money(selected.amount_cents)} · solicitado por {selected.requester_name} · status {STATUS_LABELS[selected.status]||selected.status} ·
          centro {selected.cost_center_name||"ausente"} · fornecedor {selected.supplier_name||"ausente"} ·
          evidência sintética {selected.evidence_storage_key||"ausente"} ·
          alçada aplicada {selected.applied_authority_limit_cents==null?"não aplicada":money(selected.applied_authority_limit_cents)}
        </p>
        {selected.status==="pendente"&&
          <aside role="status" data-testid="fin10-pending">
            {activeAuthorities.length===0
              ?"Aguardando decisão: nenhuma alçada ativa está configurada, então a solicitação permanece pendente até o proprietário definir a política de aprovação."
              :"Aguardando decisão de identidade com alçada ativa que cubra o valor; quem solicita não decide a própria solicitação."}
          </aside>}
        {selected.rejection_reason&&<p>Motivo da rejeição: {selected.rejection_reason}</p>}
        <label>Motivo da decisão <input minLength={10} maxLength={1000} data-testid="fin10-decision-reason" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Motivo (10 a 1000 caracteres)"/></label>
        {selected.status==="pendente"&&<>
          <button type="button" disabled={busy||reason.length<10} data-testid={`fin10-approve-${selected.id}`} onClick={()=>void decide(selected,"aprovado")}>Aprovar</button>
          <button type="button" disabled={busy||reason.length<10} onClick={()=>void decide(selected,"rejeitado")}>Rejeitar</button>
          <button type="button" disabled={busy||reason.length<10} onClick={()=>void decide(selected,"cancelado")}>Cancelar</button>
        </>}
        <h4>Histórico imutável</h4>
        <ul data-testid="fin10-history">
          {history.length===0
            ?<li>Histórico não carregado.</li>
            :history.map(entry=>
              <li key={entry.id}>
                {entry.previous_status||"criação"} → {STATUS_LABELS[entry.next_status]||entry.next_status} · {entry.reason} ·
                alçada {entry.is_authority_verified?money(entry.authority_limit_cents):"não aplicada"}
              </li>)}
        </ul>
      </div>}
  </section>;
}
