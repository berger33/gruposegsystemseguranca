"use client";
import { useEffect, useState } from "react";

type Statement = { id:string; protocol:string; source:string; file_name:string; import_date:string; total_transactions:number; total_amount_cents:number; };
type BankTx = { id:string; statement_id:string; transaction_date:string; amount_cents:number; description:string; bank_ref:string; is_conciliated:boolean; };
type Conciliation = { id:string; receivable_id:string|null; payable_id:string|null; bank_transaction_id:string|null; source:string; status:string; suggestion_reason:string|null; divergence_reason:string|null; };
type Policy = { id:string; name:string; description:string|null; is_approved:boolean; is_active:boolean; };
type Reminder = { id:string; receivable_id:string; responsible_name:string; due_date:string; reminder_type:string; status:string; content:string; is_real_message:boolean; };
type Cashflow = { id:string; competence_date:string; cashflow_type:string; total_receivable_cents:number; total_payable_cents:number; balance_cents:number; vencidos_cents:number; proximos_pagamentos_cents:number; };
type Aging = { id:string; receivable_id:string; bucket:string; amount_cents:number; due_date:string; };
type CostImport = { id:string; protocol:string; source:string; file_name:string; competence_date:string; total_costs_cents:number; total_records:number; };
type Cost = { id:string; client_account_id:string|null; contract_id:string|null; post_id:string|null; cost_source:string; competence_date:string; amount_cents:number; description:string; rateio_rule:string; rateio_percent:number; };

export default function FinAdvancedClient() {
  const [statements, setStatements] = useState<Statement[]>([]);
  const [bankTxs, setBankTxs] = useState<BankTx[]>([]);
  const [conciliations, setConciliations] = useState<Conciliation[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [cashflows, setCashflows] = useState<Cashflow[]>([]);
  const [agings, setAgings] = useState<Aging[]>([]);
  const [costImports, setCostImports] = useState<CostImport[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [msg, setMsg] = useState("");

  async function loadAll() {
    try {
      const [stRes, polRes, cfRes, impRes, costRes] = await Promise.all([
        fetch("/api/hr/fin-bank-statements").then(r=>r.json()).catch(()=>({statements:[]})),
        fetch("/api/hr/fin-collection-policies").then(r=>r.json()).catch(()=>({policies:[]})),
        fetch("/api/hr/fin-cashflow-snapshots").then(r=>r.json()).catch(()=>({snapshots:[]})),
        fetch("/api/hr/fin-cost-imports").then(r=>r.json()).catch(()=>({imports:[]})),
        fetch("/api/hr/fin-costs").then(r=>r.json()).catch(()=>({costs:[]})),
      ]);
      if (stRes.statements) setStatements(stRes.statements);
      if (polRes.policies) setPolicies(polRes.policies);
      if (cfRes.snapshots) setCashflows(cfRes.snapshots);
      if (impRes.imports) setCostImports(impRes.imports);
      if (costRes.costs) setCosts(costRes.costs);
    } catch {}
  }
  useEffect(()=>{ loadAll(); }, []);

  async function api(path:string, method:string, body?:any) {
    const res = await fetch(path, { method, headers: { "Content-Type":"application/json" }, body: body? JSON.stringify(body): undefined });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error || data.detail || "erro");
    return data;
  }

  // FIN-05
  const [stForm, setStForm] = useState({ source:"extrato", file_name:"", file_url:"", storage_key:"", import_date:"", total_transactions:"", total_amount_cents:"" });
  async function createStatement() {
    try { const d=await api("/api/hr/fin-bank-statements","POST",{ source:stForm.source, file_name:stForm.file_name, file_url:stForm.file_url, storage_key:stForm.storage_key, import_date:stForm.import_date||null, total_transactions:stForm.total_transactions?parseInt(stForm.total_transactions):0, total_amount_cents:stForm.total_amount_cents?parseInt(stForm.total_amount_cents):0 }); setMsg("Extrato "+d.statement.protocol+" importação"); loadAll(); } catch(e:any){ setMsg("Erro extrato: "+e.message); }
  }
  const [txForm, setTxForm] = useState({ statement_id:"", transaction_date:"", amount_cents:"", description:"", bank_ref:"" });
  async function createBankTx() {
    try { const d=await api("/api/hr/fin-bank-transactions","POST",{ statement_id:txForm.statement_id, transaction_date:txForm.transaction_date, amount_cents:parseInt(txForm.amount_cents), description:txForm.description, bank_ref:txForm.bank_ref }); setMsg("Transação banco "+d.transaction.bank_ref+" evitar duplicar UNIQUE"); const list=await api("/api/hr/fin-bank-transactions?statement_id="+txForm.statement_id,"GET"); if(list.transactions) setBankTxs(list.transactions); } catch(e:any){ setMsg("Erro tx banco: "+e.message); }
  }
  const [concForm, setConcForm] = useState({ receivable_id:"", payable_id:"", bank_transaction_id:"", source:"extrato", suggestion_reason:"", amount_matched_cents:"" });
  async function createConciliation() {
    try { const d=await api("/api/hr/fin-conciliations","POST",{ receivable_id:concForm.receivable_id||null, payable_id:concForm.payable_id||null, bank_transaction_id:concForm.bank_transaction_id||null, source:concForm.source, suggestion_reason:concForm.suggestion_reason, amount_matched_cents:concForm.amount_matched_cents?parseInt(concForm.amount_matched_cents):null }); setMsg("Conciliação sugerida "+d.conciliation.id+" evitar duplicar"); loadAllConciliations(); } catch(e:any){ setMsg("Erro conciliação: "+e.message); }
  }
  async function loadAllConciliations() {
    try { const r=await api("/api/hr/fin-conciliations","GET"); if(r.conciliations) setConciliations(r.conciliations); } catch {}
  }
  const [concStatusForm, setConcStatusForm] = useState({ id:"", status:"conciliada", divergence_reason:"" });
  async function updateConciliation() {
    try { const d=await api("/api/hr/fin-conciliations","PATCH",{ id:concStatusForm.id, status:concStatusForm.status, divergence_reason:concStatusForm.divergence_reason }); setMsg("Conciliação "+d.conciliation.status+" confirmação"); loadAllConciliations(); } catch(e:any){ setMsg("Erro status conciliação: "+e.message); }
  }

  // FIN-06
  const [polForm, setPolForm] = useState({ name:"", description:"" });
  async function createPolicy() {
    try { const d=await api("/api/hr/fin-collection-policies","POST",{ name:polForm.name, description:polForm.description }); setMsg("Política cobrança "+d.policy.name+" aprovada"); loadAll(); } catch(e:any){ setMsg("Erro política: "+e.message); }
  }
  const [remForm, setRemForm] = useState({ receivable_id:"", policy_id:"", responsible_name:"", due_date:"", reminder_type:"notificacao_portal", content:"" });
  async function createReminder() {
    try { const d=await api("/api/hr/fin-collection-reminders","POST",{ receivable_id:remForm.receivable_id, policy_id:remForm.policy_id||null, responsible_name:remForm.responsible_name, due_date:remForm.due_date, reminder_type:remForm.reminder_type, content:remForm.content }); setMsg("Lembrete cobrança "+d.reminder.id+" responsável política aprovada sem mensagens reais"); const list=await api("/api/hr/fin-collection-reminders?receivable_id="+remForm.receivable_id,"GET"); if(list.reminders) setReminders(list.reminders); } catch(e:any){ setMsg("Erro lembrete: "+e.message); }
  }
  const [remStatusForm, setRemStatusForm] = useState({ id:"", status:"lembrete_enviado", reason:"Lembrete enviado motivo obrigatório 10..1000 sem mensagens reais" });
  async function updateReminderStatus() {
    try { const d=await api("/api/hr/fin-collection-reminders","PATCH",{ id:remStatusForm.id, status:remStatusForm.status, reason:remStatusForm.reason }); setMsg("Lembrete status "+d.reminder.status+" sem mensagens reais sem bloqueio automático"); } catch(e:any){ setMsg("Erro status lembrete: "+e.message); }
  }

  // FIN-07
  const [cfForm, setCfForm] = useState({ competence_date:"", cashflow_type:"previsto", total_receivable_cents:"", total_payable_cents:"", vencidos_cents:"", proximos_pagamentos_cents:"", notes:"" });
  async function createCashflow() {
    try { const d=await api("/api/hr/fin-cashflow-snapshots","POST",{ competence_date:cfForm.competence_date, cashflow_type:cfForm.cashflow_type, total_receivable_cents:cfForm.total_receivable_cents?parseInt(cfForm.total_receivable_cents):0, total_payable_cents:cfForm.total_payable_cents?parseInt(cfForm.total_payable_cents):0, vencidos_cents:cfForm.vencidos_cents?parseInt(cfForm.vencidos_cents):0, proximos_pagamentos_cents:cfForm.proximos_pagamentos_cents?parseInt(cfForm.proximos_pagamentos_cents):0, notes:cfForm.notes }); setMsg("Fluxo caixa "+d.snapshot.cashflow_type+" "+d.snapshot.competence_date+" saldo R$ "+(d.snapshot.balance_cents/100).toFixed(2)+" vencidos próximos"); loadAll(); } catch(e:any){ setMsg("Erro fluxo: "+e.message); }
  }
  const [agingForm, setAgingForm] = useState({ receivable_id:"", client_account_id:"", competence_date:"", due_date:"", amount_cents:"" });
  async function createAging() {
    try { const d=await api("/api/hr/fin-aging-receivables","POST",{ receivable_id:agingForm.receivable_id, client_account_id:agingForm.client_account_id, competence_date:agingForm.competence_date, due_date:agingForm.due_date, amount_cents:parseInt(agingForm.amount_cents) }); setMsg("Aging "+d.aging.bucket+" vencidos próximos"); const list=await api("/api/hr/fin-aging-receivables","GET"); if(list.aging) setAgings(list.aging); } catch(e:any){ setMsg("Erro aging: "+e.message); }
  }

  // FIN-08
  const [costImpForm, setCostImpForm] = useState({ source:"pessoal", file_name:"", file_url:"", storage_key:"", competence_date:"", total_costs_cents:"", total_records:"" });
  async function createCostImport() {
    try { const d=await api("/api/hr/fin-cost-imports","POST",{ source:costImpForm.source, file_name:costImpForm.file_name, file_url:costImpForm.file_url, storage_key:costImpForm.storage_key, competence_date:costImpForm.competence_date, total_costs_cents:costImpForm.total_costs_cents?parseInt(costImpForm.total_costs_cents):0, total_records:costImpForm.total_records?parseInt(costImpForm.total_records):0 }); setMsg("Importação custos "+d.import.protocol+" pessoal equipamentos materiais supervisão rateio documentado"); loadAll(); } catch(e:any){ setMsg("Erro import custos: "+e.message); }
  }
  const [costForm, setCostForm] = useState({ import_id:"", client_account_id:"", contract_id:"", post_id:"", cost_source:"pessoal", competence_date:"", amount_cents:"", description:"", source_employee_id:"", rateio_rule:"", rateio_percent:"" });
  async function createCost() {
    try { const d=await api("/api/hr/fin-costs","POST",{ import_id:costForm.import_id||null, client_account_id:costForm.client_account_id||null, contract_id:costForm.contract_id||null, post_id:costForm.post_id||null, cost_source:costForm.cost_source, competence_date:costForm.competence_date, amount_cents:parseInt(costForm.amount_cents), description:costForm.description, source_employee_id:costForm.source_employee_id||null, rateio_rule:costForm.rateio_rule, rateio_percent:parseFloat(costForm.rateio_percent) }); setMsg("Custo "+d.cost.cost_source+" contrato/posto rateio "+d.cost.rateio_percent+"% documentado"); const list=await api("/api/hr/fin-costs","GET"); if(list.costs) setCosts(list.costs); } catch(e:any){ setMsg("Erro custo: "+e.message); }
  }

  return (
    <section style={{ marginTop:24, padding:16, border:"1px solid #66a", borderRadius:8 }}>
      <h2 style={{ color:"var(--theme-accent)" }}>FIN-05/06/07/08 — Conciliação Cobrança Fluxo Caixa Aging Custos Cliente/Contrato/Posto Rateio</h2>
      {msg && <p style={{ background:"#eef", padding:8 }}>{msg}</p>}

      <h3>FIN-05 Conciliação por importação/extrato ou provedor sugestão e confirmação evitar duplicar transações</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <select value={stForm.source} onChange={e=>setStForm({...stForm, source:e.target.value})}><option value="extrato">extrato</option><option value="importacao">importação</option><option value="provedor">provedor</option></select>
        <input placeholder="file_name" value={stForm.file_name} onChange={e=>setStForm({...stForm, file_name:e.target.value})} />
        <input placeholder="file_url" value={stForm.file_url} onChange={e=>setStForm({...stForm, file_url:e.target.value})} style={{ width:200 }} />
        <input placeholder="storage_key" value={stForm.storage_key} onChange={e=>setStForm({...stForm, storage_key:e.target.value})} />
        <input type="date" value={stForm.import_date} onChange={e=>setStForm({...stForm, import_date:e.target.value})} />
        <button onClick={createStatement}>Criar Extrato Protocolo</button>
      </div>
      <ul style={{ fontSize:11 }}>{statements.map(s=>(<li key={s.id}>{s.protocol} {s.source} {s.file_name} {s.import_date} tx {s.total_transactions} R$ {(s.total_amount_cents/100).toFixed(2)} <button onClick={()=>{ setTxForm({...txForm, statement_id:s.id}); }}>Add Tx</button></li>))}</ul>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="statement_id" value={txForm.statement_id} onChange={e=>setTxForm({...txForm, statement_id:e.target.value})} style={{ width:180 }} />
        <input type="date" value={txForm.transaction_date} onChange={e=>setTxForm({...txForm, transaction_date:e.target.value})} />
        <input placeholder="amount_cents" value={txForm.amount_cents} onChange={e=>setTxForm({...txForm, amount_cents:e.target.value})} style={{ width:100 }} />
        <input placeholder="descrição 3..500" value={txForm.description} onChange={e=>setTxForm({...txForm, description:e.target.value})} />
        <input placeholder="bank_ref UNIQUE evitar duplicar" value={txForm.bank_ref} onChange={e=>setTxForm({...txForm, bank_ref:e.target.value})} />
        <button onClick={createBankTx}>Criar Transação Banco UNIQUE bank_ref</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:60, overflow:"auto" }}>{bankTxs.map(t=>(<li key={t.id}>{t.bank_ref} {t.transaction_date} R$ {(t.amount_cents/100).toFixed(2)} {t.description.slice(0,30)} {t.is_conciliated?"conciliada":"pendente"} <button onClick={()=>setConcForm({...concForm, bank_transaction_id:t.id})}>Conciliar</button></li>))}</ul>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="receivable_id" value={concForm.receivable_id} onChange={e=>setConcForm({...concForm, receivable_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="payable_id" value={concForm.payable_id} onChange={e=>setConcForm({...concForm, payable_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="bank_transaction_id" value={concForm.bank_transaction_id} onChange={e=>setConcForm({...concForm, bank_transaction_id:e.target.value})} style={{ width:180 }} />
        <select value={concForm.source} onChange={e=>setConcForm({...concForm, source:e.target.value})}><option value="extrato">extrato</option><option value="importacao">importação</option><option value="provedor">provedor</option></select>
        <input placeholder="sugestão motivo 10..1000" value={concForm.suggestion_reason} onChange={e=>setConcForm({...concForm, suggestion_reason:e.target.value})} />
        <input placeholder="amount_matched_cents" value={concForm.amount_matched_cents} onChange={e=>setConcForm({...concForm, amount_matched_cents:e.target.value})} style={{ width:120 }} />
        <button onClick={createConciliation}>Sugerir Conciliação Evitar Duplicar UNIQUE receivable+bank</button>
        <button onClick={loadAllConciliations}>Listar Conciliações</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:60, overflow:"auto" }}>{conciliations.map(c=>(<li key={c.id}>{c.source} {c.status} rec {c.receivable_id?.slice(0,6)||"-"} pag {c.payable_id?.slice(0,6)||"-"} bank {c.bank_transaction_id?.slice(0,6)||"-"} motivo {c.suggestion_reason?.slice(0,20)||"-"} <button onClick={()=>setConcStatusForm({...concStatusForm, id:c.id})}>Confirmar/Divergir</button></li>))}</ul>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="conciliation id" value={concStatusForm.id} onChange={e=>setConcStatusForm({...concStatusForm, id:e.target.value})} style={{ width:180 }} />
        <select value={concStatusForm.status} onChange={e=>setConcStatusForm({...concStatusForm, status:e.target.value})}><option value="conciliada">conciliada</option><option value="divergente">divergente</option><option value="ignorada">ignorada</option></select>
        <input placeholder="divergence_reason 10..1000 se divergente" value={concStatusForm.divergence_reason} onChange={e=>setConcStatusForm({...concStatusForm, divergence_reason:e.target.value})} />
        <button onClick={updateConciliation}>Confirmar Conciliação</button>
      </div>

      <h3>FIN-06 Cobrança com responsável lembretes histórico política aprovada sem mensagens reais ou bloqueio portal automático</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="política nome 3..200" value={polForm.name} onChange={e=>setPolForm({...polForm, name:e.target.value})} />
        <input placeholder="descrição 10..1000" value={polForm.description} onChange={e=>setPolForm({...polForm, description:e.target.value})} />
        <button onClick={createPolicy}>Criar Política Cobrança</button>
      </div>
      <ul style={{ fontSize:11 }}>{policies.map(p=>(<li key={p.id}>{p.name} {p.is_approved?"aprovada":"pendente aprovação"} {p.is_active?"ativa":"inativa"} — {p.description} <button onClick={()=>setRemForm({...remForm, policy_id:p.id})}>Usar política</button></li>))}</ul>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="receivable_id cobrança" value={remForm.receivable_id} onChange={e=>setRemForm({...remForm, receivable_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="policy_id" value={remForm.policy_id} onChange={e=>setRemForm({...remForm, policy_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="responsável 2..200" value={remForm.responsible_name} onChange={e=>setRemForm({...remForm, responsible_name:e.target.value})} />
        <input type="date" value={remForm.due_date} onChange={e=>setRemForm({...remForm, due_date:e.target.value})} />
        <select value={remForm.reminder_type} onChange={e=>setRemForm({...remForm, reminder_type:e.target.value})}><option value="notificacao_portal">notificação portal</option><option value="email">email</option><option value="whatsapp">whatsapp</option></select>
        <input placeholder="conteúdo 20..2000 sem mensagens reais" value={remForm.content} onChange={e=>setRemForm({...remForm, content:e.target.value})} style={{ width:250 }} />
        <button onClick={createReminder}>Criar Lembrete Responsável Política Aprovada Sem Mensagens Reais</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:60, overflow:"auto" }}>{reminders.map(r=>(<li key={r.id}>rec {r.receivable_id.slice(0,6)} resp {r.responsible_name} {r.reminder_type} {r.status} {r.is_real_message?"REAL":"SEM_MSG_REAL"} <button onClick={()=>setRemStatusForm({...remStatusForm, id:r.id})}>Enviar/Acordar</button></li>))}</ul>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="reminder id" value={remStatusForm.id} onChange={e=>setRemStatusForm({...remStatusForm, id:e.target.value})} style={{ width:180 }} />
        <select value={remStatusForm.status} onChange={e=>setRemStatusForm({...remStatusForm, status:e.target.value})}><option value="lembrete_enviado">lembrete enviado</option><option value="em_negociacao">em negociação</option><option value="acordado">acordado</option></select>
        <input placeholder="reason 10..1000" value={remStatusForm.reason} onChange={e=>setRemStatusForm({...remStatusForm, reason:e.target.value})} style={{ width:250 }} />
        <button onClick={updateReminderStatus}>Atualizar Lembrete Sem Mensagens Reais Sem Bloqueio Automático</button>
      </div>

      <h3>FIN-07 Fluxo Caixa Previsto/Realizado Vencidos Próximos Pagamentos Aging Recebíveis</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input type="date" value={cfForm.competence_date} onChange={e=>setCfForm({...cfForm, competence_date:e.target.value})} />
        <select value={cfForm.cashflow_type} onChange={e=>setCfForm({...cfForm, cashflow_type:e.target.value})}><option value="previsto">previsto</option><option value="realizado">realizado</option></select>
        <input placeholder="total_receber_cents" value={cfForm.total_receivable_cents} onChange={e=>setCfForm({...cfForm, total_receivable_cents:e.target.value})} style={{ width:120 }} />
        <input placeholder="total_pagar_cents" value={cfForm.total_payable_cents} onChange={e=>setCfForm({...cfForm, total_payable_cents:e.target.value})} style={{ width:120 }} />
        <input placeholder="vencidos_cents" value={cfForm.vencidos_cents} onChange={e=>setCfForm({...cfForm, vencidos_cents:e.target.value})} style={{ width:100 }} />
        <input placeholder="próximos_cents" value={cfForm.proximos_pagamentos_cents} onChange={e=>setCfForm({...cfForm, proximos_pagamentos_cents:e.target.value})} style={{ width:100 }} />
        <button onClick={createCashflow}>Criar Fluxo Caixa Snapshot</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:60, overflow:"auto" }}>{cashflows.map(c=>(<li key={c.id}>{c.competence_date} {c.cashflow_type} receber R$ {(c.total_receivable_cents/100).toFixed(2)} pagar R$ {(c.total_payable_cents/100).toFixed(2)} saldo R$ {(c.balance_cents/100).toFixed(2)} vencidos R$ {(c.vencidos_cents/100).toFixed(2)} próximos R$ {(c.proximos_pagamentos_cents/100).toFixed(2)}</li>))}</ul>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="receivable_id aging" value={agingForm.receivable_id} onChange={e=>setAgingForm({...agingForm, receivable_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="account_id" value={agingForm.client_account_id} onChange={e=>setAgingForm({...agingForm, client_account_id:e.target.value})} style={{ width:180 }} />
        <input type="date" value={agingForm.competence_date} onChange={e=>setAgingForm({...agingForm, competence_date:e.target.value})} />
        <input type="date" value={agingForm.due_date} onChange={e=>setAgingForm({...agingForm, due_date:e.target.value})} />
        <input placeholder="amount_cents" value={agingForm.amount_cents} onChange={e=>setAgingForm({...agingForm, amount_cents:e.target.value})} style={{ width:100 }} />
        <button onClick={createAging}>Criar Aging Recebíveis</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:60, overflow:"auto" }}>{agings.map(a=>(<li key={a.id}>rec {a.receivable_id.slice(0,6)} {a.bucket} R$ {(a.amount_cents/100).toFixed(2)} venc {a.due_date}</li>))}</ul>

      <h3>FIN-08 Custo por Cliente/Contrato/Posto Importação Custos Pessoal Equipamentos Materiais Supervisão Rateio Documentado</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <select value={costImpForm.source} onChange={e=>setCostImpForm({...costImpForm, source:e.target.value})}><option value="pessoal">pessoal</option><option value="equipamento">equipamento</option><option value="material">material</option><option value="supervisao">supervisão</option></select>
        <input placeholder="file_name" value={costImpForm.file_name} onChange={e=>setCostImpForm({...costImpForm, file_name:e.target.value})} />
        <input placeholder="file_url" value={costImpForm.file_url} onChange={e=>setCostImpForm({...costImpForm, file_url:e.target.value})} style={{ width:200 }} />
        <input placeholder="storage_key" value={costImpForm.storage_key} onChange={e=>setCostImpForm({...costImpForm, storage_key:e.target.value})} />
        <input type="date" value={costImpForm.competence_date} onChange={e=>setCostImpForm({...costImpForm, competence_date:e.target.value})} />
        <input placeholder="total_costs_cents" value={costImpForm.total_costs_cents} onChange={e=>setCostImpForm({...costImpForm, total_costs_cents:e.target.value})} style={{ width:120 }} />
        <button onClick={createCostImport}>Criar Importação Custos Protocolo</button>
      </div>
      <ul style={{ fontSize:11 }}>{costImports.map(i=>(<li key={i.id}>{i.protocol} {i.source} {i.file_name} {i.competence_date} R$ {(i.total_costs_cents/100).toFixed(2)} registros {i.total_records} <button onClick={()=>setCostForm({...costForm, import_id:i.id, competence_date:i.competence_date})}>Add Custo</button></li>))}</ul>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="import_id" value={costForm.import_id} onChange={e=>setCostForm({...costForm, import_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="account_id" value={costForm.client_account_id} onChange={e=>setCostForm({...costForm, client_account_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="contract_id" value={costForm.contract_id} onChange={e=>setCostForm({...costForm, contract_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="post_id" value={costForm.post_id} onChange={e=>setCostForm({...costForm, post_id:e.target.value})} style={{ width:180 }} />
        <select value={costForm.cost_source} onChange={e=>setCostForm({...costForm, cost_source:e.target.value})}><option value="pessoal">pessoal</option><option value="equipamento">equipamento</option><option value="material">material</option><option value="supervisao">supervisão</option></select>
        <input type="date" value={costForm.competence_date} onChange={e=>setCostForm({...costForm, competence_date:e.target.value})} />
        <input placeholder="amount_cents" value={costForm.amount_cents} onChange={e=>setCostForm({...costForm, amount_cents:e.target.value})} style={{ width:100 }} />
        <input placeholder="descrição 10..1000" value={costForm.description} onChange={e=>setCostForm({...costForm, description:e.target.value})} style={{ width:200 }} />
        <input placeholder="rateio_rule 10..1000 documentado obrigatório" value={costForm.rateio_rule} onChange={e=>setCostForm({...costForm, rateio_rule:e.target.value})} style={{ width:250 }} />
        <input placeholder="rateio % 0..100" value={costForm.rateio_percent} onChange={e=>setCostForm({...costForm, rateio_percent:e.target.value})} style={{ width:80 }} />
        <button onClick={createCost}>Criar Custo Cliente/Contrato/Posto Rateio Documentado</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:80, overflow:"auto" }}>{costs.map(c=>(<li key={c.id}>{c.cost_source} conta {c.client_account_id?.slice(0,6)||"-"} contrato {c.contract_id?.slice(0,6)||"-"} posto {c.post_id?.slice(0,6)||"-"} {c.competence_date} R$ {(c.amount_cents/100).toFixed(2)} rateio {c.rateio_percent}% {c.rateio_rule.slice(0,30)}</li>))}</ul>
    </section>
  );
}
