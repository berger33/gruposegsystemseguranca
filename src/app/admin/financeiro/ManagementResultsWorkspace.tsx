"use client";

import styles from "../../../components/ui/UiWorkspace.module.css";
import { financeErrorMessage } from "../../../lib/finance-vocabulary.mjs";
import { FormEvent, useEffect, useState } from "react";

type Result = {
  id:string; protocol:string; competence_date:string; status:string; is_complete:boolean;
  margin_cents:number|null; computed_margin_percent:number|null; margin_basis:string; incomplete_reason:string|null;
};

const money = (value:number|string|null|undefined) => value == null
  ? "Valor conhecido ausente"
  : new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(Number(value)/100);
const percentage = (value:number|string|null|undefined) => value == null ? "Percentual indisponível" : `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits:4 })}%`;
const marginBasis = (result:Result) => {
  if (result.margin_basis === "dados_incompletos") return "Margem incompleta: a competência ainda tem dados ausentes; não há percentual calculado.";
  if (result.margin_basis === "receita_zero_sem_percentual") return "Margem sem percentual: receita recebida igual a zero.";
  return "Margem calculada a partir da receita recebida e dos custos.";
};
const api = async (path:string, options:RequestInit={}) => {
  const r=await fetch(path,{...options,headers:{"content-type":"application/json",...(options.headers||{})}});
  const b=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(financeErrorMessage(typeof b.error === "string" ? b.error : null, r.status));
  return b;
};

export default function ManagementResultsWorkspace(){
 const [rows,setRows]=useState<Result[]>([]); const [busy,setBusy]=useState(false); const [loading,setLoading]=useState(false); const [error,setError]=useState(""); const [notice,setNotice]=useState("");
 const [form,setForm]=useState({contract_id:"",client_account_id:"",competence_date:"",received:"",costs:"",reason:""});
 const load=async()=>{
   setLoading(true); setError("");
   try { const b=await api("/api/fin/management-results"); setRows(b.results||[]); }
   catch(e) { setError(e instanceof Error?e.message:"Falha ao carregar resultados"); }
   finally { setLoading(false); }
 };
 useEffect(()=>{ void load(); },[]);
 const submit=async(e:FormEvent)=>{
   e.preventDefault(); setBusy(true); setError(""); setNotice("");
   try {
     await api("/api/fin/management-results",{method:"POST",body:JSON.stringify({
       contract_id:form.contract_id||null,
       client_account_id:form.client_account_id||null,
       competence_date:form.competence_date,
       revenue_received_cents:form.received === "" ? null : Number(form.received),
       costs_cents:form.costs === "" ? null : Number(form.costs),
       is_complete:false,
       incomplete_reason:form.reason,
     })});
     setNotice("Resultado gerencial declarado como incompleto; nenhum percentual foi inventado.");
     setForm({...form,competence_date:"",received:"",costs:"",reason:""}); await load();
   }catch(e){setError(e instanceof Error?e.message:"Falha inesperada");}finally{setBusy(false);}
 };
 return <section data-testid="fin09-results" className={styles.padded}>
   <h2>Resultado gerencial</h2>
   <p>Receita recebida, custos, caixa e margem por contrato. Dado ausente é mostrado como incompleto: nunca como margem zero ou percentual estimado.</p>
   {error&&<div role="alert" data-testid="fin09-error"><p>{error}</p><button type="button" data-testid="fin09-retry" disabled={loading} onClick={()=>void load()}>Tentar novamente</button></div>}
   {notice&&<p role="status" data-testid="fin09-notice">{notice}</p>}
   {loading&&<p data-testid="fin09-loading">Carregando resultados…</p>}
   <form onSubmit={submit}>
     <input data-testid="fin09-contract" placeholder="ID do contrato" value={form.contract_id} onChange={e=>setForm({...form,contract_id:e.target.value})}/>
     <input data-testid="fin09-account" placeholder="ID da conta do cliente" value={form.client_account_id} onChange={e=>setForm({...form,client_account_id:e.target.value})}/>
     <input required data-testid="fin09-competence" type="date" value={form.competence_date} onChange={e=>setForm({...form,competence_date:e.target.value})}/>
     <input data-testid="fin09-received" type="number" min="0" placeholder="Recebido em centavos (se conhecido)" value={form.received} onChange={e=>setForm({...form,received:e.target.value})}/>
     <input data-testid="fin09-costs" type="number" min="0" placeholder="Custos em centavos (se conhecidos)" value={form.costs} onChange={e=>setForm({...form,costs:e.target.value})}/>
     <input required minLength={10} data-testid="fin09-reason" placeholder="Motivo dos dados incompletos" value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/>
     <button data-testid="fin09-create" disabled={busy}>Registrar resultado incompleto</button>
   </form>
   <ul data-testid="fin09-list">{rows.length===0&&!loading&&!error?<li>Nenhum resultado registrado.</li>:rows.map(r=><li key={r.id} data-testid={`fin09-result-${r.id}`}>
     <strong>{r.protocol}</strong> · {r.competence_date} · {r.status}<br/>
     {marginBasis(r)} Valor de margem conhecido: {money(r.margin_cents)}. {percentage(r.computed_margin_percent)}<br/>
     Base: <span data-testid={`fin09-margin-basis-${r.id}`}>{r.margin_basis}</span>{r.incomplete_reason?` · Motivo: ${r.incomplete_reason}`:""}
   </li>)}</ul>
 </section>;
}
