"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import UiState from "../../../components/ui/UiState";
import styles from "../../../components/ui/UiWorkspace.module.css";
import {
  accountStatusLabel,
  describeFinError,
  finErrorFootnote,
  finErrorVariant,
  moneyLabel,
} from "../../../lib/fin-vocabulary.mjs";
import type { FinErrorDescriptor } from "../../../lib/fin-vocabulary.mjs";
import BankReconciliationWorkspace from "./BankReconciliationWorkspace";
import CollectionWorkspace from "./CollectionWorkspace";
import CashflowWorkspace from "./CashflowWorkspace";
import CostAllocationWorkspace from "./CostAllocationWorkspace";
import ManagementResultsWorkspace from "./ManagementResultsWorkspace";
import ExpenseWorkspace from "./ExpenseWorkspace";
import FiscalWorkspace from "./FiscalWorkspace";
import GatewayWorkspace from "./GatewayWorkspace";
import BudgetWorkspace from "./BudgetWorkspace";
import ExportWorkspace from "./ExportWorkspace";
import ClosureWorkspace from "./ClosureWorkspace";
import CommissionWorkspace from "./CommissionWorkspace";

type Account = { id:string; protocol:string; contract_id:string|null; client_account_id:string|null; competence_date:string; due_date:string; amount_cents:string|number; amount_paid_cents:string|number; status:string; description?:string|null };
type Rule = { id:string; contract_id:string; recurrence_id:string; amount_cents:string|number; start_date:string; is_approved:boolean; is_active:boolean; suspension_enabled:boolean };
type Payment = { id:string; account_type:string; receivable_id:string|null; payable_id:string|null; amount_cents:string|number; is_estorno:boolean; created_at:string };

// UX-07B: dinheiro ausente continua sendo declarado como ausente — nunca R$ 0,00.
const money = (value: string|number|undefined) => moneyLabel(value ?? null);

// UX-07B: o erro deixa de ser `new Error(data.error)` e passa a carregar código
// E status, para que a tela saiba distinguir sessão, concessão, conflito e
// falha de leitura. O código canônico continua disponível — no rodapé.
async function api(path:string, init?:RequestInit) {
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers:{ "Content-Type":"application/json", ...(init?.headers||{}) } });
  } catch {
    throw describeFinError(null, 0);
  }
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw describeFinError(typeof data?.error === "string" ? data.error : null, response.status);
  return data;
}
function asFinFailure(err: unknown): FinErrorDescriptor {
  return err && typeof err === "object" && typeof (err as FinErrorDescriptor).kind === "string"
    ? (err as FinErrorDescriptor)
    : describeFinError(null, 0);
}

// UX-07B: as abas passam a ser dados, e governam tablist, tabpanel e teclado.
const FINANCE_TABS = [
  ["receivables","Recebíveis"],["recurrence","Recorrência"],["payments","Pagamentos"],
  ["f03reports","Relatório de baixas"],["reconciliation","Conciliação bancária"],["collection","Cobrança"],
  ["cashflow","Fluxo de caixa / Aging"],["costs","Custos / Rateio"],["results","Resultado gerencial"],
  ["expenses","Despesas / Compras"],["fiscal","Fiscal / Obrigações"],["gateway","Boletos / Pix / Gateway"],
  ["budgets","Orçamento / Cenários"],["exports","Exportações"],["closures","Fechamento"],["commissions","Comissões"],
] as const satisfies readonly (readonly [string, string])[];
type FinanceTabId = (typeof FINANCE_TABS)[number][0];

export default function FinanceiroWorkspace() {
  const [tab,setTab] = useState<FinanceTabId>("receivables");
  const [accounts,setAccounts] = useState<Account[]>([]); const [rules,setRules] = useState<Rule[]>([]); const [payments,setPayments] = useState<Payment[]>([]);
  const [contractFilter,setContractFilter] = useState(""); const [selected,setSelected] = useState<Account|null>(null); const [busy,setBusy] = useState(false); const [error,setError] = useState<FinErrorDescriptor|null>(null); const [notice,setNotice] = useState("");
  const [loaded,setLoaded] = useState(false);
  const tabRefs = useRef<Partial<Record<FinanceTabId, HTMLButtonElement|null>>>({});
  const [newAccount,setNewAccount] = useState({ client_account_id:"", contract_id:"", competence_date:"", due_date:"", amount_cents:"", description:"" });
  const [newRule,setNewRule] = useState({ contract_id:"", recurrence_id:"", start_date:"", amount_cents:"" }); const [generationClientAccountId,setGenerationClientAccountId] = useState("");
  const [paymentAmount,setPaymentAmount] = useState(""); const [reason,setReason] = useState(""); const [estorno,setEstorno] = useState<Payment|null>(null); const [history,setHistory] = useState<Record<string,unknown>[]>([]);
  const [reportForm,setReportForm] = useState({account_id:"",period_start:"",period_end:""}); const [reports,setReports] = useState<Record<string,unknown>[]>([]);
  const run = async (fn:()=>Promise<void>) => { setBusy(true); setError(null); setNotice(""); try { await fn(); } catch(e) { setError(asFinFailure(e)); } finally { setBusy(false); } };
  const load = () => run(async()=> { const [a,r,p] = await Promise.all([api("/api/admin/finance/f03/receivables"), api("/api/fin/recurrence-rules"), api("/api/fin/payments")]); const received:Account[]=a.receivables||[]; const nextAccounts=contractFilter?received.filter(item=>item.contract_id===contractFilter):received; setAccounts(nextAccounts); setRules(r.rules||[]); setPayments(p.payments||[]); if(selected){ setSelected(nextAccounts.find(item=>item.id===selected.id)||selected); const h=await api(`/api/fin/payment-history?receivable_id=${selected.id}`); setHistory(h.history||[]); } setLoaded(true); });
  useEffect(()=>{ load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const createAccount = async (event:FormEvent) => { event.preventDefault(); await run(async()=> { await api("/api/fin/receivables", {method:"POST",body:JSON.stringify({...newAccount, amount_cents:Number(newAccount.amount_cents), is_recurring:false})}); setNotice("Recebível criado"); setNewAccount({client_account_id:"",contract_id:"",competence_date:"",due_date:"",amount_cents:"",description:""}); await load(); }); };
  const createRule = async (event:FormEvent) => { event.preventDefault(); await run(async()=> { await api("/api/fin/recurrence-rules", {method:"POST",body:JSON.stringify({...newRule, amount_cents:Number(newRule.amount_cents), recurrence_type:"mensal"})}); setNotice("Regra criada e aguardando aprovação"); setNewRule({contract_id:"",recurrence_id:"",start_date:"",amount_cents:""}); await load(); }); };
  const approve = (rule:Rule) => run(async()=> { await api("/api/fin/recurrence-rules",{method:"PATCH",body:JSON.stringify({id:rule.id,is_approved:true})}); setNotice("Regra aprovada"); await load(); });
  const generate = (rule:Rule) => run(async()=> { if(!generationClientAccountId) throw new Error("Informe a conta do cliente para gerar a cobrança"); const date=rule.start_date.slice(0,10); await api("/api/fin/generate-recurring",{method:"POST",body:JSON.stringify({recurrence_rule_id:rule.id,competence_date:date,due_date:date,client_account_id:generationClientAccountId,contract_id:rule.contract_id,amount_cents:Number(rule.amount_cents)})}); setNotice("Cobrança gerada"); await load(); });
  const pay = async (event:FormEvent) => { event.preventDefault(); if(!selected) return; await run(async()=> { const data=await api(`/api/admin/finance/f03/receivables/${selected.id}/settlements`,{method:"POST",headers:{"Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({amount_cents:Number(paymentAmount),reason})}); setNotice(data.note||"Baixa registrada"); setPaymentAmount(""); setReason(""); await load(); }); };
  const doEstorno = async () => { if(!selected||!estorno) return; await run(async()=> { await api("/api/fin/payments",{method:"POST",body:JSON.stringify({account_type:"receber",receivable_id:selected.id,amount_cents:Number(estorno.amount_cents),reason,is_estorno:true,previous_payment_id:estorno.id})}); setNotice("Estorno registrado"); setEstorno(null); setReason(""); await load(); }); };
  const openAccount = (account:Account) => run(async()=> { setSelected(account); const data=await api(`/api/fin/payment-history?receivable_id=${account.id}`); setHistory(data.history||[]); });
  const loadReports = () => run(async()=>{ const data=await api("/api/admin/finance/f03/reports"); setReports(data.reports||[]); });
  const generateReport = (event:FormEvent) => { event.preventDefault(); return run(async()=>{ const data=await api("/api/admin/finance/f03/reports",{method:"POST",headers:{"Idempotency-Key":crypto.randomUUID()},body:JSON.stringify(reportForm)}); setNotice(data.note||"Relatório interno gerado"); await loadReports(); }); };
  // UX-07B: roving tabindex de verdade. Antes eram botões soltos com
  // `aria-selected` dentro de um <nav>, sem `role="tab"` e sem `tabpanel`:
  // ARIA inválido e nenhuma navegação por teclado.
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = FINANCE_TABS.findIndex(([id]) => id === tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % FINANCE_TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + FINANCE_TABS.length) % FINANCE_TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = FINANCE_TABS.length - 1;
    else return;
    event.preventDefault();
    const target = FINANCE_TABS[next][0];
    setTab(target);
    tabRefs.current[target]?.focus();
  }
  const activeTabLabel = (FINANCE_TABS.find(([id]) => id === tab) ?? FINANCE_TABS[0])[1];

  return <main data-testid="financeiro-workspace" style={{padding:"2rem",maxWidth:1200,margin:"auto"}}>
    <header><h1>Financeiro</h1><p>Contas, recorrência e pagamentos com auditoria transacional.</p></header>
    <div className={styles.tabs} role="tablist" aria-label="Abas financeiras">{FINANCE_TABS.map(([id,label])=>(
      <button
        key={id}
        type="button"
        role="tab"
        id={`finance-aba-${id}`}
        data-testid={`finance-tab-${id}`}
        aria-selected={tab===id}
        aria-controls={`finance-painel-${id}`}
        tabIndex={tab===id?0:-1}
        ref={node=>{ tabRefs.current[id]=node; }}
        className={tab===id?styles.tabActive:styles.tab}
        onClick={()=>setTab(id)}
        onKeyDown={onTabKeyDown}
      >{label}</button>))}</div>
    {error&&<div data-testid="finance-error"><UiState
      variant={finErrorVariant(error)}
      title={error.title}
      detail={`${error.detail} ${finErrorFootnote(error)}`}
      retryLabel={error.canRetry?"Tentar novamente":undefined}
      onRetry={error.canRetry?()=>{ load(); }:undefined}
    /></div>}
    {notice&&<div data-testid="finance-notice"><UiState variant="success" title={notice} /></div>}
    {busy&&<div data-testid="finance-loading"><UiState variant="loading" title="Carregando o financeiro…" detail="Lendo recebíveis, regras de recorrência e pagamentos. Nenhum valor abaixo pode ser lido como saldo enquanto a leitura não termina." /></div>}
    <div role="tabpanel" id={`finance-painel-${tab}`} aria-labelledby={`finance-aba-${tab}`} tabIndex={-1} className={styles.tabPanel}>
    <h2 className={styles.visuallyHidden}>{activeTabLabel}</h2>
    {tab==="receivables"&&<section data-testid="finance-receivables"><h2>Recebíveis</h2><form onSubmit={createAccount}><input required placeholder="ID da conta do cliente" value={newAccount.client_account_id} onChange={e=>setNewAccount({...newAccount,client_account_id:e.target.value})}/><input placeholder="ID do contrato" value={newAccount.contract_id} onChange={e=>setNewAccount({...newAccount,contract_id:e.target.value})}/><input required type="date" aria-label="Competência" value={newAccount.competence_date} onChange={e=>setNewAccount({...newAccount,competence_date:e.target.value})}/><input required type="date" aria-label="Vencimento" value={newAccount.due_date} onChange={e=>setNewAccount({...newAccount,due_date:e.target.value})}/><input required type="number" min="1" placeholder="Valor em centavos" value={newAccount.amount_cents} onChange={e=>setNewAccount({...newAccount,amount_cents:e.target.value})}/><button disabled={busy}>Criar recebível</button></form><hr/><form onSubmit={e=>{e.preventDefault();load()}}><input data-testid="finance-contract-filter" placeholder="Filtrar por contrato" value={contractFilter} onChange={e=>setContractFilter(e.target.value)}/><button>Filtrar</button></form><AccountTable accounts={accounts} onSelect={openAccount} loaded={loaded&&!error}/></section>}
    {tab==="recurrence"&&<section data-testid="finance-recurrence"><h2>Recorrência</h2><label>Conta do cliente para geração <input required data-testid="finance-generation-client-account" placeholder="ID da conta do cliente para geração" value={generationClientAccountId} onChange={e=>setGenerationClientAccountId(e.target.value)}/></label><form onSubmit={createRule}><input required placeholder="ID do contrato" value={newRule.contract_id} onChange={e=>setNewRule({...newRule,contract_id:e.target.value})}/><input required placeholder="Identificador da regra" value={newRule.recurrence_id} onChange={e=>setNewRule({...newRule,recurrence_id:e.target.value})}/><input required type="date" value={newRule.start_date} onChange={e=>setNewRule({...newRule,start_date:e.target.value})}/><input required type="number" min="1" placeholder="Valor em centavos" value={newRule.amount_cents} onChange={e=>setNewRule({...newRule,amount_cents:e.target.value})}/><button>Criar regra</button></form><ul>{rules.length===0?<li data-testid="finance-recurrence-empty">Nenhuma regra encontrada. A leitura foi concluída com sucesso: não há regra de recorrência cadastrada.</li>:rules.map(rule=><li data-testid={`finance-rule-${rule.id}`} key={rule.id}>Contrato {rule.contract_id} · {money(rule.amount_cents)} · {rule.is_approved?"aprovada":"pendente"} <button disabled={rule.is_approved} onClick={()=>approve(rule)}>Aprovar</button> <button disabled={!rule.is_approved||!rule.is_active} onClick={()=>generate(rule)}>Gerar cobrança</button></li>)}</ul></section>}
    {tab==="payments"&&<section data-testid="finance-payments"><h2>Pagamentos</h2><PaymentTable payments={payments}/>{selected&&<><h3>Conta {selected.protocol}</h3><p>Saldo pago: {money(selected.amount_paid_cents)} de {money(selected.amount_cents)} · situação {accountStatusLabel(selected.status)} <small>(status {selected.status})</small></p><form onSubmit={pay}><input required type="number" min="1" placeholder="Baixa em centavos" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)}/><input required minLength={10} maxLength={1000} placeholder="Motivo (10 a 1000 caracteres)" value={reason} onChange={e=>setReason(e.target.value)}/><button>Dar baixa</button></form><ul>{history.map((item,i)=><li key={i}>{String(item.reason||"Histórico sem motivo")} · {String(item.next_status||"")}</li>)}</ul>{payments.filter(p=>p.receivable_id===selected.id&&!p.is_estorno).map(p=><button key={p.id} onClick={()=>setEstorno(p)}>Estornar pagamento de {money(p.amount_cents)}</button>)}{estorno&&<button onClick={doEstorno}>Confirmar estorno</button>}</>}</section>}
    {tab==="f03reports"&&<section data-testid="finance-f03-reports"><h2>Relatório interno de contas e baixas</h2><p>Snapshot calculado das fontes canônicas. Não há integração bancária, baixa automática, SMTP ou envio externo.</p><form onSubmit={generateReport}><input required placeholder="ID da conta do cliente" value={reportForm.account_id} onChange={e=>setReportForm({...reportForm,account_id:e.target.value})}/><input required aria-label="Início do relatório" type="date" value={reportForm.period_start} onChange={e=>setReportForm({...reportForm,period_start:e.target.value})}/><input required aria-label="Fim do relatório" type="date" value={reportForm.period_end} onChange={e=>setReportForm({...reportForm,period_end:e.target.value})}/><button disabled={busy}>Gerar snapshot</button><button type="button" onClick={loadReports}>Atualizar lista</button></form><ul>{reports.map(item=><li key={String(item.id)}>{String(item.protocol)} · {String(item.period_start)} a {String(item.period_end)} · total {money(item.amount_cents as string|number)} · baixado {money(item.settled_cents as string|number)} · saldo {money(item.remaining_cents as string|number)}</li>)}</ul></section>}
    {tab==="reconciliation"&&<BankReconciliationWorkspace/>}
    {tab==="collection"&&<CollectionWorkspace/>}
    {tab==="cashflow"&&<CashflowWorkspace/>}
    {tab==="costs"&&<CostAllocationWorkspace/>}
    {tab==="results"&&<ManagementResultsWorkspace/>}
    {tab==="expenses"&&<ExpenseWorkspace/>}
    {tab==="fiscal"&&<FiscalWorkspace/>}
    {tab==="gateway"&&<GatewayWorkspace/>}
    {tab==="budgets"&&<BudgetWorkspace/>}
    {tab==="exports"&&<ExportWorkspace/>}
    {tab==="closures"&&<ClosureWorkspace/>}
    {tab==="commissions"&&<CommissionWorkspace/>}
    </div>
  </main>;
}
function AccountTable({accounts,onSelect,loaded}:{accounts:Account[];onSelect:(a:Account)=>void;loaded:boolean}) {
  // UX-07B: a linha de "nenhum recebível" só aparece depois de uma leitura que
  // deu certo. Antes, qualquer falha deixava a tabela vazia e a tela afirmava
  // ausência de cobrança — em dinheiro, a afirmação mais cara possível.
  return <table data-testid="finance-receivables-table"><thead><tr><th>Protocolo</th><th>Contrato</th><th>Valor</th><th>Situação</th></tr></thead><tbody>{accounts.length===0?<tr><td colSpan={4} data-testid="finance-receivables-empty">{loaded?"Nenhum recebível encontrado. A leitura foi concluída com sucesso: não há cobrança registrada neste filtro.":"Recebíveis ainda não lidos — nada aqui representa saldo."}</td></tr>:accounts.map(a=><tr key={a.id} onClick={()=>onSelect(a)}><td>{a.protocol}</td><td>{a.contract_id||"Contrato ausente"}</td><td>{money(a.amount_cents)}</td><td>{accountStatusLabel(a.status)} <small>(status {a.status})</small></td></tr>)}</tbody></table>; }
function PaymentTable({payments}:{payments:Payment[]}) { return <table data-testid="finance-payments-table"><thead><tr><th>Conta</th><th>Valor</th><th>Tipo</th></tr></thead><tbody>{payments.length===0?<tr><td colSpan={3}>Nenhum pagamento encontrado. A leitura foi concluída com sucesso: não há baixa nem estorno registrado.</td></tr>:payments.map(p=><tr key={p.id}><td>{p.receivable_id||p.payable_id||"Conta ausente"}</td><td>{money(p.amount_cents)}</td><td>{p.is_estorno?"Estorno":"Baixa"}</td></tr>)}</tbody></table>; }
