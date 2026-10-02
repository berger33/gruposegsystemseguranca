"use client";
import { useCallback, useEffect, useState } from "react";

type Expense = { id:string; protocol:string; expense_type:string; category:string; description:string; amount_cents:number; threshold_cents:number; status:"pendente"|"aprovado"|"rejeitado"|"cancelado"; requester_name:string; requester_identity:string; approver_name:string|null; evidence_file_name:string };
type HistoryEntry={ id:string; previous_status:string|null; next_status:string; changed_by_identity:string; reason:string; authority_limit_cents:string|number|null; approver_identity:string|null; requester_identity:string|null };

const STATUS_LABEL: Record<Expense["status"], string> = { pendente:"Pendente", aprovado:"Aprovada", rejeitado:"Recusada", cancelado:"Cancelada" };
const brl = (cents:number|null|undefined) => cents==null ? "—" : new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(cents)/100);
const parseBrl = (text:string) => {
  const value = Number(text.trim().replaceAll(".","").replace(",","."));
  return Number.isFinite(value) && value>0 ? Math.round(value*100) : null;
};

export default function ExpenseWorkspace() {
  const [expenses,setExpenses]=useState<Expense[]>([]);
  const [history,setHistory]=useState<Record<string,HistoryEntry[]|undefined>>({});
  const [historyOpen,setHistoryOpen]=useState<Record<string,boolean>>({});
  const [authority,setAuthority]=useState<{max_amount_cents:number;is_active:boolean;allow_self_approval:boolean}|null|undefined>(undefined);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  const [searchApplied,setSearchApplied]=useState("");
  const [expenseType,setExpenseType]=useState("despesa");
  const [category,setCategory]=useState("Materiais de escritório");
  const [description,setDescription]=useState("");
  const [amountText,setAmountText]=useState("");
  const [thresholdText,setThresholdText]=useState("");
  const [requesterName,setRequesterName]=useState("Operação Administrativa");
  const [contractId,setContractId]=useState("");
  const [costCenterId,setCostCenterId]=useState("");
  const [supplierId,setSupplierId]=useState("");
  const [evidenceName,setEvidenceName]=useState("Nota sintética");
  const [evidenceUrl,setEvidenceUrl]=useState("synthetic://fin10/nota-fiscal");
  const [evidenceStorage,setEvidenceStorage]=useState("synthetic/fin10");
  const [idempotency,setIdempotency]=useState("fin10-");
  const [decisionReason,setDecisionReason]=useState("");

  const load = useCallback(async (term?:string) => {
    setLoading(true);
    const q = (term ?? search).trim();
    if (q !== searchApplied) setSearchApplied("");
    const [lists,policy] = await Promise.allSettled([
      fetch(`/api/fin/expenses${q?`?q=${encodeURIComponent(q)}`:""}`,{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject(new Error("expenses"))),
      fetch(`/api/fin/expense-authorities`,{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject(new Error("authorities"))),
    ]);
    if (lists.status!=="fulfilled") {
      setError("Falha ao ler despesas. Toque em Tentar novamente.");
      setLoading(false);
      return;
    }
    setExpenses(lists.value.expenses ?? []);
    setSearchApplied(q);
    setError("");
    if (policy.status==="fulfilled") setAuthority(policy.value.authority ?? null);
    setLoading(false);
  }, [search, searchApplied]);

  const loadHistory = useCallback(async (expenseId:string) => {
    const response=await fetch(`/api/fin/expense-history?expense_id=${expenseId}`,{cache:"no-store"});
    if (response.ok) {
      const json=await response.json();
      setHistory(h=>({...h,[expenseId]:json.history ?? []}));
    }
  }, []);

  useEffect(()=>{ load(""); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },[]);
  useEffect(()=>{
    for (const [id,open] of Object.entries(historyOpen)) {
      if (open && history[id]===undefined) loadHistory(id);
    }
  },[historyOpen,history,loadHistory]);

  const create = async () => {
    setNotice("");
    const amountCents=parseBrl(amountText), thresholdCents=parseBrl(thresholdText);
    const response=await fetch(`/api/fin/expenses`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      expense_type:expenseType,category,description,
      amount_cents:amountCents,threshold_cents:thresholdCents,requester_name:requesterName,
      contract_id:contractId,cost_center_id:costCenterId,supplier_id:supplierId,
      evidence_file_name:evidenceName,evidence_file_url:evidenceUrl,evidence_storage_key:evidenceStorage,
      idempotency_key:idempotency,
    })});
    const json=await response.json();
    if (!response.ok) { setNotice(`Não foi possível registrar: ${json.error}.`); return; }
    setNotice(json?.idempotent_replay ? "Solicitação já existia para esta chave de idempotência e foi reutilizada (replay, sem duplicar)." : "Solicitação registrada e pendente de aprovação por aprovador habilitado.");
    setDescription("");setAmountText("");setThresholdText("");setIdempotency(`fin10-${Date.now()}`);
    await load("");
  };

  const decide = async (id:string,status:"aprovado"|"rejeitado") => {
    setNotice("");
    const response=await fetch(`/api/fin/expenses`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status,reason:decisionReason})});
    const json=await response.json();
    if (!response.ok) { setNotice(`Decisão recusada: ${json.error}.`); return; }
    setNotice(status==="aprovado" ? `Despesa aprovada dentro da alçada vigente do aprovador autenticado (limite aplicado: ${brl(json?.expense?.approval_limit_cents!=null?Number(json.expense.approval_limit_cents):null)}).` : "Despesa recusada com motivo obrigatório.");
    setDecisionReason("");
    await load("");
    await loadHistory(id);
  };

  const policyText = authority===undefined
    ? "Política de alçada: avaliando no servidor…"
    : authority===null
      ? "Política de alçada para a sua identidade não configurada (alçadas são uma política vazia por padrão): as solicitações ficam pendentes até decisão de aprovador habilitado; ausência de política nunca aprova automaticamente."
      : authority.is_active
        ? `Política de alçada ativa para a sua identidade: você pode aprovar até ${brl(authority.max_amount_cents)} por solicitação${authority.allow_self_approval?" (autoaprovação habilitada pela política)":""}.`
        : "Política de alçada da sua identidade está inativa: as solicitações permanecem aguardando um aprovador habilitado; inatividade não aprova automaticamente.";

  const pendingCount=expenses.filter(e=>e.status==="pendente").length;

  return (
    <div style={{display:"grid",gridTemplateColumns:"1.1fr 1fr",gap:12}}>
      <section className="card">
        <h3>Solicitações de despesa, reembolso e compra</h3>
        <p className="section-desc">Solicitar, aprovar, recusar ou cancelar não cria pagamento, baixa, cobrança, recebível, pagável ou qualquer efeito financeiro externo: a solicitação fica pendente até decisão autorizada.</p>
        <div data-testid="fin10-policy">{policyText}</div>
        <div style={{display:"flex",gap:8,margin:"8px 0"}}>
          <input data-testid="fin10-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nome, protocolo ou referência" style={{flex:1}} />
          <button data-testid="fin10-search-apply" onClick={()=>load()}>Buscar</button>
          <button data-testid="fin10-reload" onClick={()=>{setSearch("");load("");}} disabled={loading}>{loading?"Carregando…":"Limpar/atualizar"}</button>
        </div>
        {error ? (
          <div data-testid="fin10-error" role="alert" style={{marginBottom:8}}>
            <strong>{error}</strong>{" "}
            <button data-testid="fin10-retry" onClick={()=>load()} disabled={loading}>Tentar novamente</button>
          </div>
        ) : null}
        <ul className="listPane" data-testid="fin10-expenses" style={{maxHeight:360,overflow:"auto",listStyle:"none",paddingLeft:0,minHeight:40}}>
          {!error && !loading && expenses.length===0 ? (
            <li data-testid="fin10-empty">{searchApplied ? "Nenhum resultado para a busca aplicada." : "Nenhuma solicitação."}</li>
          ) : null}
          {!error ? expenses.map(e=>(
            <li key={e.id} style={{borderTop:"1px solid #e3e5e6",padding:"6px 0"}}>
              <div data-testid={`fin10-expense-${e.id}`}><b>{e.protocol}</b> · {STATUS_LABEL[e.status]} · <span>{brl(e.amount_cents)}</span> · {e.category} — {e.description}</div>
              <span style={{display:"block",fontSize:12}}>Solicitante: {e.requester_name}{e.approver_name?` · Aprovador: ${e.approver_name}`:""} · Evidência sintética: {e.evidence_file_name}</span>
              {e.status==="pendente" ? <span style={{display:"block",fontSize:12}}>Decisão pendente com motivo obrigatório e aprovador habilitado.</span> : null}
              <button data-testid={`fin10-history-toggle-${e.id}`} type="button" onClick={()=>setHistoryOpen(h=>({...h,[e.id]:!h[e.id]}))} style={{marginTop:4}}>
                {historyOpen[e.id]?"Ocultar histórico":"Ver histórico"}
              </button>
              {historyOpen[e.id] ? (
                <div data-testid={`fin10-history-${e.id}`} style={{fontSize:12,marginTop:4}}>
                  {(history[e.id]||[]).map(h=>(
                    <div key={h.id}>{h.previous_status??"início"} → {h.next_status} por {h.changed_by_identity}: {h.reason}{h.authority_limit_cents!=null?` — limite aplicado ${brl(Number(h.authority_limit_cents))}`:""}</div>
                  ))}
                  {(history[e.id]===undefined)?<div>Carregando histórico…</div>:history[e.id]!.length===0?<div>Sem eventos.</div>:null}
                </div>
              ) : null}
            </li>
          )) : null}
        </ul>
        {pendingCount>0 ? <p>{pendingCount} pendente(s) de decisão.</p> : null}
      </section>
      <section className="card">
        <h3>Nova solicitação (evidência somente como metadado sintético)</h3>
        <div className="field"><span>Tipo</span>
          <select data-testid="fin10-type" value={expenseType} onChange={e=>setExpenseType(e.target.value)}>
            <option value="despesa">Despesa</option><option value="reembolso">Reembolso</option><option value="compra">Compra</option><option value="outro">Outro</option>
          </select>
        </div>
        <div className="field"><span>Categoria</span><input data-testid="fin10-category" value={category} onChange={e=>setCategory(e.target.value)} /></div>
        <div className="field"><span>Descrição (evidência sintética)</span><textarea data-testid="fin10-description" rows={3} value={description} onChange={e=>setDescription(e.target.value)} /></div>
        <div className="field"><span>Valor (R$, formato brasileiro)</span><input data-testid="fin10-amount" placeholder="750,50" value={amountText} onChange={e=>setAmountText(e.target.value)} /></div>
        <div className="field"><span>Teto (R$, formato brasileiro)</span><input data-testid="fin10-threshold" placeholder="750,50" value={thresholdText} onChange={e=>setThresholdText(e.target.value)} /></div>
        <div className="field"><span>Solicitante real</span><input data-testid="fin10-requester-name" value={requesterName} onChange={e=>setRequesterName(e.target.value)} /></div>
        <div className="field"><span>ID do contrato canônico</span><input data-testid="fin10-contract" value={contractId} onChange={e=>setContractId(e.target.value)} placeholder="UUID do contrato" /></div>
        <div className="field"><span>ID do centro de custo</span><input data-testid="fin10-cost-center" value={costCenterId} onChange={e=>setCostCenterId(e.target.value)} placeholder="UUID do centro de custo" /></div>
        <div className="field"><span>ID do fornecedor canônico</span><input data-testid="fin10-supplier" value={supplierId} onChange={e=>setSupplierId(e.target.value)} placeholder="UUID do fornecedor" /></div>
        <div className="field"><span>Evidência — nome</span><input data-testid="fin10-evidence-name" value={evidenceName} onChange={e=>setEvidenceName(e.target.value)} /></div>
        <div className="field"><span>Evidência — URL sintética</span><input data-testid="fin10-evidence-url" value={evidenceUrl} onChange={e=>setEvidenceUrl(e.target.value)} /></div>
        <div className="field"><span>Evidência — chave sintética</span><input data-testid="fin10-evidence-key" value={evidenceStorage} onChange={e=>setEvidenceStorage(e.target.value)} /></div>
        <div className="field"><span>Chave de idempotência</span><input data-testid="fin10-idempotency" value={idempotency} onChange={e=>setIdempotency(e.target.value)} /></div>
        <button data-testid="fin10-create" onClick={create}>Registrar solicitação</button>{" "}
        {notice ? <span data-testid="fin10-notice">{notice}</span> : null}
        <h4 style={{marginTop:16}}>Decisão (motivo obrigatório)</h4>
        <div className="field"><span>Motivo da decisão</span><textarea data-testid="fin10-decision-reason" rows={3} value={decisionReason} onChange={e=>setDecisionReason(e.target.value)} /></div>
        <p>Para decidir, carregue a lista ao lado e use os botões da despesa pendente correspondente.</p>
        {expenses.filter(e=>e.status==="pendente").map(e=>(
          <div key={e.id} style={{marginBottom:4}}>
            <button data-testid={`fin10-approve-${e.id}`} onClick={()=>decide(e.id,"aprovado")}>Aprovar {e.protocol} dentro da alçada</button>{" "}
            <button data-testid={`fin10-reject-${e.id}`} onClick={()=>decide(e.id,"rejeitado")}>Recusar {e.protocol}</button>
          </div>
        ))}
      </section>
    </div>
  );
}
