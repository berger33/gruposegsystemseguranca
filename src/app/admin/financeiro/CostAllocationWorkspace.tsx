"use client";

import styles from "../../../components/ui/UiWorkspace.module.css";
import { financeErrorMessage } from "../../../lib/finance-vocabulary.mjs";
import { FormEvent, useEffect, useState } from "react";

type CostImport = {
  id: string; protocol: string; source: string; competence_date: string;
  total_costs_cents: string|number; total_records: number;
  allocated_costs_cents: string|number; allocated_records: number;
};
type Cost = {
  id: string; import_record_key?: string|null; client_name?: string; contract_title?: string|null; post_name?: string|null;
  cost_source: string; competence_date: string; source_amount_cents: string|number; amount_cents: string|number;
  rateio_percent: string|number; rateio_rule: string;
};

const sources = [
  ["pessoal", "Pessoal"], ["equipamento", "Equipamentos"], ["material", "Materiais"],
  ["supervisao", "Supervisão"], ["outro", "Outro"],
];
const initialImport = { source:"pessoal", file_name:"", file_url:"", storage_key:"", competence_date:"", total_costs_cents:"", total_records:"" };
const initialCost = { import_id:"", import_record_key:"", client_account_id:"", contract_id:"", post_id:"", cost_source:"pessoal", competence_date:"", source_amount_cents:"", description:"", rateio_rule:"", rateio_percent:"100", source_material:"" };
const money = (value:string|number|undefined) => value == null ? "Dado ausente" : `R$ ${(Number(value)/100).toFixed(2).replace(".",",")}`;
async function request(path:string, init?:RequestInit) {
  const response = await fetch(path, { ...init, headers:{ "Content-Type":"application/json", ...(init?.headers||{}) } });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(financeErrorMessage(typeof data.error === "string" ? data.error : null, response.status));
  return data;
}

export default function CostAllocationWorkspace() {
  const [imports,setImports] = useState<CostImport[]>([]); const [costs,setCosts] = useState<Cost[]>([]);
  const [importForm,setImportForm] = useState(initialImport); const [costForm,setCostForm] = useState(initialCost);
  const [busy,setBusy] = useState(false); const [error,setError] = useState(""); const [notice,setNotice] = useState("");
  const run = async (operation:()=>Promise<void>) => { setBusy(true); setError(""); setNotice(""); try { await operation(); } catch(cause) { setError(cause instanceof Error?cause.message:"Falha inesperada"); } finally { setBusy(false); } };
  const load = async () => { const [importData,costData] = await Promise.all([request("/api/fin/cost-imports"),request("/api/fin/costs")]); setImports(importData.imports||[]); setCosts(costData.costs||[]); };
  useEffect(()=>{ void run(load); },[]); // eslint-disable-line react-hooks/exhaustive-deps

  const createImport = async (event:FormEvent) => { event.preventDefault(); await run(async()=>{
    await request("/api/fin/cost-imports", { method:"POST", body:JSON.stringify({ ...importForm, total_costs_cents:Number(importForm.total_costs_cents||0), total_records:Number(importForm.total_records||0) }) });
    setImportForm(initialImport); setNotice("Importação sintética de custos registrada; nenhum arquivo externo foi processado"); await load();
  }); };
  const selectImport = (id:string) => { const selected=imports.find(item=>item.id===id); setCostForm({ ...costForm, import_id:id, import_record_key:id?costForm.import_record_key:"", cost_source:selected?.source||costForm.cost_source, competence_date:selected?String(selected.competence_date).slice(0,10):costForm.competence_date }); };
  const createCost = async (event:FormEvent) => { event.preventDefault(); await run(async()=>{
    await request("/api/fin/costs", { method:"POST", body:JSON.stringify({ ...costForm, import_id:costForm.import_id||null, import_record_key:costForm.import_id?costForm.import_record_key:null, contract_id:costForm.contract_id||null, post_id:costForm.post_id||null, source_amount_cents:Number(costForm.source_amount_cents), rateio_percent:Number(costForm.rateio_percent), source_material:costForm.source_material||null }) });
    setCostForm(initialCost); setNotice("Custo sintético criado com rateio documentado"); await load();
  }); };

  return <section data-testid="fin08-costs" aria-labelledby="fin08-title" className={styles.stackWide}>
    <header><h2 id="fin08-title">FIN-08 · Custos e rateio documentado</h2><p>Registre metadados sintéticos de pessoal, equipamentos, materiais e supervisão por cliente, contrato e posto. Não há leitura de arquivo, folha, estoque ou integração externa.</p></header>
    {error&&<p role="alert" data-testid="fin08-error">{error}</p>}{notice&&<p role="status" data-testid="fin08-notice">{notice}</p>}

    <form data-testid="fin08-import-form" onSubmit={createImport} className={styles.stack}><h3>Metadados da importação sintética</h3>
      <label>Origem <select data-testid="fin08-import-source" value={importForm.source} onChange={e=>setImportForm({...importForm,source:e.target.value})}>{sources.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>Nome do arquivo sintético <input required maxLength={500} data-testid="fin08-import-file-name" value={importForm.file_name} onChange={e=>setImportForm({...importForm,file_name:e.target.value})}/></label>
      <label>URL local sintética <input required minLength={5} maxLength={1000} data-testid="fin08-import-file-url" value={importForm.file_url} onChange={e=>setImportForm({...importForm,file_url:e.target.value})}/></label>
      <label>Chave idempotente <input required minLength={5} maxLength={500} data-testid="fin08-import-storage-key" value={importForm.storage_key} onChange={e=>setImportForm({...importForm,storage_key:e.target.value})}/></label>
      <label>Competência <input required type="date" data-testid="fin08-import-competence" value={importForm.competence_date} onChange={e=>setImportForm({...importForm,competence_date:e.target.value})}/></label>
      <label>Total em centavos <input required type="number" min={0} data-testid="fin08-import-total" value={importForm.total_costs_cents} onChange={e=>setImportForm({...importForm,total_costs_cents:e.target.value})}/></label>
      <label>Total de registros <input required type="number" min={0} data-testid="fin08-import-records" value={importForm.total_records} onChange={e=>setImportForm({...importForm,total_records:e.target.value})}/></label>
      <button data-testid="fin08-create-import" disabled={busy}>Registrar importação sintética</button>
    </form>
    <table data-testid="fin08-imports"><thead><tr><th>Protocolo</th><th>Origem</th><th>Competência</th><th>Alocado</th><th>Registros</th></tr></thead><tbody>{imports.length===0?<tr><td colSpan={5}>Nenhuma importação.</td></tr>:imports.map(item=><tr key={item.id}><td>{item.protocol}</td><td>{item.source}</td><td>{String(item.competence_date).slice(0,10)}</td><td>{money(item.allocated_costs_cents)} / {money(item.total_costs_cents)}</td><td>{item.allocated_records} / {item.total_records}</td></tr>)}</tbody></table>

    <form data-testid="fin08-cost-form" onSubmit={createCost} className={styles.stack}><h3>Alocar custo</h3>
      <label>Importação <select data-testid="fin08-cost-import" value={costForm.import_id} onChange={e=>selectImport(e.target.value)}><option value="">Custo manual sintético</option>{imports.map(item=><option key={item.id} value={item.id}>{item.protocol} · {item.source}</option>)}</select></label>
      {costForm.import_id&&<label>Chave do registro <input required maxLength={200} data-testid="fin08-cost-record-key" value={costForm.import_record_key} onChange={e=>setCostForm({...costForm,import_record_key:e.target.value})}/></label>}
      <label>Conta do cliente <input required data-testid="fin08-cost-account" value={costForm.client_account_id} onChange={e=>setCostForm({...costForm,client_account_id:e.target.value})}/></label>
      <label>Contrato <input data-testid="fin08-cost-contract" value={costForm.contract_id} onChange={e=>setCostForm({...costForm,contract_id:e.target.value})}/></label>
      <label>Posto <input data-testid="fin08-cost-post" value={costForm.post_id} onChange={e=>setCostForm({...costForm,post_id:e.target.value})}/></label>
      <label>Origem <select data-testid="fin08-cost-source" disabled={Boolean(costForm.import_id)} value={costForm.cost_source} onChange={e=>setCostForm({...costForm,cost_source:e.target.value})}>{sources.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>Competência <input required type="date" readOnly={Boolean(costForm.import_id)} data-testid="fin08-cost-competence" value={costForm.competence_date} onChange={e=>setCostForm({...costForm,competence_date:e.target.value})}/></label>
      <label>Valor de origem (centavos) <input required type="number" min={1} data-testid="fin08-cost-source-amount" value={costForm.source_amount_cents} onChange={e=>setCostForm({...costForm,source_amount_cents:e.target.value})}/></label>
      <label>Percentual de rateio <input required type="number" min="0.01" max="100" step="0.01" data-testid="fin08-cost-percent" value={costForm.rateio_percent} onChange={e=>setCostForm({...costForm,rateio_percent:e.target.value})}/></label>
      <label>Regra de rateio <input required minLength={10} maxLength={1000} data-testid="fin08-cost-rule" value={costForm.rateio_rule} onChange={e=>setCostForm({...costForm,rateio_rule:e.target.value})}/></label>
      <label>Descrição <input required minLength={10} maxLength={1000} data-testid="fin08-cost-description" value={costForm.description} onChange={e=>setCostForm({...costForm,description:e.target.value})}/></label>
      <label>Material/referência sintética <input maxLength={500} data-testid="fin08-cost-material" value={costForm.source_material} onChange={e=>setCostForm({...costForm,source_material:e.target.value})}/></label>
      <button data-testid="fin08-create-cost" disabled={busy}>Criar custo rateado</button>
    </form>
    <table data-testid="fin08-cost-list"><thead><tr><th>Origem</th><th>Cliente / contrato / posto</th><th>Competência</th><th>Origem</th><th>Rateado</th><th>Regra</th></tr></thead><tbody>{costs.length===0?<tr><td colSpan={6}>Nenhum custo.</td></tr>:costs.map(cost=><tr key={cost.id}><td>{cost.cost_source}</td><td>{cost.client_name||"Cliente"} / {cost.contract_title||"Sem contrato"} / {cost.post_name||"Sem posto"}</td><td>{String(cost.competence_date).slice(0,10)}</td><td>{money(cost.source_amount_cents)}</td><td>{money(cost.amount_cents)} ({cost.rateio_percent}%)</td><td>{cost.rateio_rule}</td></tr>)}</tbody></table>
  </section>;
}
