"use client";

import { FormEvent, useEffect, useState } from "react";

type ActivityRule = { id:string; activity_code:string; activity_label:string; obligation_type:string; jurisdiction:string; rule_reference:string; rule_description:string; is_active:boolean };
type Provider = { id:string; name:string; provider_code:string|null; status:string; environment:string; supported_obligations:string[]|null; is_active:boolean };
type Obligation = { id:string; contract_id:string|null; client_account_id:string|null; obligation_type:string; activity_type:string; status:string; rule:string; determination_rule_reference:string|null };
type FiscalDocument = { id:string; protocol:string; obligation_id:string|null; provider_id:string|null; document_type:string; status:string; amount_cents:string|number; simulated:boolean; is_sandbox:boolean };

const money = (value:string|number) => `R$ ${(Number(value)/100).toFixed(2).replace(".",",")}`;
async function api(path:string, init?:RequestInit) {
  const response = await fetch(path, { ...init, headers:{ "Content-Type":"application/json", ...(init?.headers||{}) } });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return data;
}

const emptyProvider = { name:"", provider_code:"", supported_obligations:[] as string[], idempotency_key:"" };
const emptyObligation = { contract_id:"", client_account_id:"", activity_type:"", description:"", idempotency_key:"" };
const emptyDocument = { obligation_id:"", provider_id:"", amount_cents:"", file_name:"", file_url:"", storage_key:"", idempotency_key:"" };

export default function FiscalWorkspace() {
  const [rules,setRules] = useState<ActivityRule[]>([]);
  const [providers,setProviders] = useState<Provider[]>([]);
  const [obligations,setObligations] = useState<Obligation[]>([]);
  const [documents,setDocuments] = useState<FiscalDocument[]>([]);
  const [provider,setProvider] = useState(emptyProvider);
  const [obligation,setObligation] = useState(emptyObligation);
  const [fiscalDocument,setFiscalDocument] = useState(emptyDocument);
  const [reason,setReason] = useState("");
  const [busy,setBusy] = useState(false); const [loading,setLoading] = useState(false); const [error,setError] = useState(""); const [notice,setNotice] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const [r,p,o,d] = await Promise.all([
        api("/api/fin/fiscal-activity-rules"),
        api("/api/fin/fiscal-providers"),
        api("/api/fin/fiscal-obligations"),
        api("/api/fin/fiscal-documents"),
      ]);
      setRules(r.rules||[]); setProviders(p.providers||[]); setObligations(o.obligations||[]); setDocuments(d.documents||[]);
    } catch (e) { setError(e instanceof Error?e.message:"Falha ao carregar dados fiscais"); }
    finally { setLoading(false); }
  };
  useEffect(()=>{ void load(); },[]);
  const run = async (fn:()=>Promise<void>) => { setBusy(true); setError(""); setNotice(""); try { await fn(); } catch(e) { setError(e instanceof Error?e.message:"Falha inesperada"); } finally { setBusy(false); } };

  const selectedRule = rules.find(rule=>rule.activity_code===obligation.activity_type);
  const providersForObligation = (item:Obligation) => providers.filter(provider => provider.status === "configurado" && provider.is_active && (provider.supported_obligations||[]).includes(item.obligation_type));
  const pendingProviderObligations = obligations.filter(item => item.status === "determinada" && providersForObligation(item).length === 0);
  const selectedDocumentObligation = obligations.find(item => item.id === fiscalDocument.obligation_id);

  const createProvider = (event:FormEvent) => { event.preventDefault(); run(async()=>{
    await api("/api/fin/fiscal-providers",{method:"POST",body:JSON.stringify(provider)});
    setProvider(emptyProvider); setNotice("Provedor fiscal sandbox cadastrado como nao_configurado, sem credenciais reais."); await load();
  }); };
  const transitionProvider = (item:Provider, status:string) => run(async()=>{
    await api("/api/fin/fiscal-providers",{method:"PATCH",body:JSON.stringify({id:item.id,status,reason,error_sanitized:status==="falha"?reason:undefined})});
    setReason(""); setNotice(`Provedor em transição explícita para ${status}.`); await load();
  });
  const createObligation = (event:FormEvent) => { event.preventDefault(); run(async()=>{
    const data = await api("/api/fin/fiscal-obligations",{method:"POST",body:JSON.stringify(obligation)});
    setObligation(emptyObligation);
    setNotice(data.provider_pending
      ? `Obrigação determinada como ${data.obligation.obligation_type}; pendente de provedor sandbox configurado. Nenhuma emissão foi simulada.`
      : `Obrigação determinada pela atividade: ${data.obligation.obligation_type} conforme ${data.activity_rule.rule_reference}.`);
    await load();
  }); };
  const transitionObligation = (item:Obligation, status:string) => run(async()=>{
    await api("/api/fin/fiscal-obligations",{method:"PATCH",body:JSON.stringify({id:item.id,status,reason})});
    setReason(""); setNotice(status==="determinada"?`Obrigação ${item.obligation_type} determinada pela regra explícita da atividade.`:"Obrigação cancelada."); await load();
  });
  const createDocument = (event:FormEvent) => { event.preventDefault(); run(async()=>{
    const data = await api("/api/fin/fiscal-documents",{method:"POST",body:JSON.stringify({...fiscalDocument,amount_cents:Number(fiscalDocument.amount_cents)})});
    setFiscalDocument(emptyDocument);
    setNotice(`Documento sintético ${data.document.protocol} preparado em rascunho. Nenhuma emissão fiscal real foi executada.`);
    await load();
  }); };
  const transitionDocument = (item:FiscalDocument, status:string) => run(async()=>{
    await api("/api/fin/fiscal-documents",{method:"PATCH",body:JSON.stringify({id:item.id,status,reason,error_sanitized:status==="erro"?reason:undefined})});
    setReason(""); setNotice(status==="emitido"?"Registro sintético concluído pelo simulador; nenhuma emissão fiscal real.":`Documento em ${status}.`); await load();
  });

  return <section data-testid="fin11-fiscal">
    <h2>Integração contábil/fiscal mediante provedor</h2>
    <p>O provedor e a obrigação são entidades separadas. A obrigação não é assumida: ela é determinada pela atividade do contrato através de uma regra explícita, podendo ser NFS-e, NF-e, NFC-e, CT-e ou outra obrigação. Nada aqui emite documento fiscal real — o ambiente é sandbox e as respostas são sintéticas.</p>
    {error&&<div role="alert" data-testid="fin11-error"><p>{error}</p><button type="button" data-testid="fin11-retry" disabled={loading} onClick={()=>void load()}>Tentar novamente</button></div>}
    {notice&&<p role="status" data-testid="fin11-notice">{notice}</p>}
    {loading&&<p data-testid="fin11-loading">Carregando dados fiscais…</p>}

    <h3>Regras canônicas de atividade</h3>
    <table data-testid="fin11-rules-table"><thead><tr><th>Atividade</th><th>Obrigação</th><th>Competência</th><th>Regra</th></tr></thead><tbody>
      {rules.length===0?<tr><td colSpan={4}>Nenhuma regra cadastrada.</td></tr>:rules.map(rule=>
        <tr key={rule.id} data-testid={`fin11-rule-${rule.activity_code}`}><td>{rule.activity_label}</td><td data-testid={`fin11-rule-type-${rule.activity_code}`}>{rule.obligation_type}</td><td>{rule.jurisdiction}</td><td>{rule.rule_reference}</td></tr>)}
    </tbody></table>

    <h3>Provedor fiscal (sandbox)</h3>
    <form onSubmit={createProvider} data-testid="fin11-provider-form">
      <input required minLength={3} maxLength={200} data-testid="fin11-provider-name" placeholder="Nome do provedor" value={provider.name} onChange={e=>setProvider({...provider,name:e.target.value})}/>
      <input required data-testid="fin11-provider-code" placeholder="codigo-canonico-do-provedor" value={provider.provider_code} onChange={e=>setProvider({...provider,provider_code:e.target.value})}/>
      <fieldset data-testid="fin11-provider-obligations"><legend>Obrigações suportadas</legend>
        {["nfse","nfe","nfce","cte","outro"].map(type=>
          <label key={type}><input type="checkbox" data-testid={`fin11-provider-supports-${type}`} checked={provider.supported_obligations.includes(type)} onChange={e=>setProvider({...provider,supported_obligations:e.target.checked?[...provider.supported_obligations,type]:provider.supported_obligations.filter(item=>item!==type)})}/>{type}</label>)}
      </fieldset>
      <input required minLength={8} maxLength={200} data-testid="fin11-provider-idempotency" placeholder="Chave de idempotência" value={provider.idempotency_key} onChange={e=>setProvider({...provider,idempotency_key:e.target.value})}/>
      <button data-testid="fin11-provider-create" disabled={busy}>Cadastrar provedor</button>
    </form>
    <label>Motivo da transição <input minLength={10} maxLength={1000} data-testid="fin11-reason" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Motivo (10 a 1000 caracteres)"/></label>
    <table data-testid="fin11-providers-table"><thead><tr><th>Provedor</th><th>Código</th><th>Ambiente</th><th>Suporta</th><th>Status</th><th>Transição</th></tr></thead><tbody>
      {providers.length===0?<tr><td colSpan={6}>Nenhum provedor.</td></tr>:providers.map(item=>
        <tr key={item.id} data-testid={`fin11-provider-${item.id}`}><td>{item.name}</td><td>{item.provider_code||"sem código"}</td><td>{item.environment}</td><td>{(Array.isArray(item.supported_obligations)?item.supported_obligations:[]).join(", ")||"nenhuma"}</td><td data-testid={`fin11-provider-status-${item.id}`}>{item.status}</td>
          <td>{item.status!=="configurado"&&<button disabled={busy||reason.length<10} data-testid={`fin11-provider-configure-${item.id}`} onClick={()=>transitionProvider(item,"configurado")}>Configurar</button>}
              {item.status!=="falha"&&<button disabled={busy||reason.length<10} onClick={()=>transitionProvider(item,"falha")}>Marcar falha</button>}</td></tr>)}
    </tbody></table>

    <h3>Obrigação fiscal determinada pela atividade</h3>
    <form onSubmit={createObligation} data-testid="fin11-obligation-form">
      <input required data-testid="fin11-obligation-contract" placeholder="ID do contrato canônico" value={obligation.contract_id} onChange={e=>setObligation({...obligation,contract_id:e.target.value})}/>
      <input required data-testid="fin11-obligation-account" placeholder="ID da conta do cliente" value={obligation.client_account_id} onChange={e=>setObligation({...obligation,client_account_id:e.target.value})}/>
      <select required data-testid="fin11-obligation-activity" value={obligation.activity_type} onChange={e=>setObligation({...obligation,activity_type:e.target.value})}>
        <option value="">Selecione a atividade</option>
        {rules.filter(rule=>rule.is_active).map(rule=><option key={rule.id} value={rule.activity_code}>{rule.activity_label}</option>)}
      </select>
      <p data-testid="fin11-obligation-determined-type">{selectedRule?`Obrigação determinada: ${selectedRule.obligation_type} (${selectedRule.rule_reference})`:"Selecione a atividade para a regra determinar a obrigação."}</p>
      <input required minLength={10} maxLength={1000} data-testid="fin11-obligation-description" placeholder="Descrição sintética" value={obligation.description} onChange={e=>setObligation({...obligation,description:e.target.value})}/>
      <input required minLength={8} maxLength={200} data-testid="fin11-obligation-idempotency" placeholder="Chave de idempotência" value={obligation.idempotency_key} onChange={e=>setObligation({...obligation,idempotency_key:e.target.value})}/>
      <button data-testid="fin11-obligation-create" disabled={busy}>Criar obrigação</button>
    </form>
    <table data-testid="fin11-obligations-table"><thead><tr><th>Atividade</th><th>Obrigação</th><th>Status</th><th>Regra aplicada</th><th>Transição</th></tr></thead><tbody>
      {obligations.length===0?<tr><td colSpan={5}>Nenhuma obrigação.</td></tr>:obligations.map(item=>
        <tr key={item.id} data-testid={`fin11-obligation-${item.id}`}><td>{item.activity_type}</td><td data-testid={`fin11-obligation-type-${item.id}`}>{item.obligation_type}</td><td data-testid={`fin11-obligation-status-${item.id}`}>{item.status}</td><td>{item.determination_rule_reference||item.rule}</td>
          <td>{item.status==="pendente"&&<button disabled={busy||reason.length<10} data-testid={`fin11-obligation-determine-${item.id}`} onClick={()=>transitionObligation(item,"determinada")}>Determinar</button>}
              {item.status!=="cancelada"&&<button disabled={busy||reason.length<10} onClick={()=>transitionObligation(item,"cancelada")}>Cancelar</button>}</td></tr>)}
    </tbody></table>
    {pendingProviderObligations.length>0&&<aside role="status" data-testid="fin11-provider-pending" style={{margin:"1rem 0",padding:".75rem",borderLeft:"4px solid #b45309"}}>
      Pendente de provedor sandbox selecionado/configurado para: {pendingProviderObligations.map(item=>`${item.activity_type} (${item.obligation_type})`).join(", ")}. Nenhum documento ou emissão é simulado enquanto essa pendência existir.
    </aside>}

    <h3>Documento fiscal sintético</h3>
    <form onSubmit={createDocument} data-testid="fin11-document-form">
      <select required data-testid="fin11-document-obligation" value={fiscalDocument.obligation_id} onChange={e=>setFiscalDocument({...fiscalDocument,obligation_id:e.target.value})}>
        <option value="">Obrigação determinada</option>
        {obligations.filter(item=>item.status==="determinada").map(item=><option key={item.id} value={item.id}>{item.activity_type} · {item.obligation_type}</option>)}
      </select>
      <select required data-testid="fin11-document-provider" value={fiscalDocument.provider_id} onChange={e=>setFiscalDocument({...fiscalDocument,provider_id:e.target.value})}>
        <option value="">Provedor configurado</option>
        {(selectedDocumentObligation ? providersForObligation(selectedDocumentObligation) : []).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <input required type="number" min="1" data-testid="fin11-document-amount" placeholder="Valor em centavos" value={fiscalDocument.amount_cents} onChange={e=>setFiscalDocument({...fiscalDocument,amount_cents:e.target.value})}/>
      <input required data-testid="fin11-document-file-name" placeholder="Nome do metadado" value={fiscalDocument.file_name} onChange={e=>setFiscalDocument({...fiscalDocument,file_name:e.target.value})}/>
      <input required data-testid="fin11-document-file-url" placeholder="synthetic://fin11/documento.json" value={fiscalDocument.file_url} onChange={e=>setFiscalDocument({...fiscalDocument,file_url:e.target.value})}/>
      <input required data-testid="fin11-document-storage-key" placeholder="synthetic/fin11/documento.json" value={fiscalDocument.storage_key} onChange={e=>setFiscalDocument({...fiscalDocument,storage_key:e.target.value})}/>
      <input required minLength={8} maxLength={200} data-testid="fin11-document-idempotency" placeholder="Chave de idempotência" value={fiscalDocument.idempotency_key} onChange={e=>setFiscalDocument({...fiscalDocument,idempotency_key:e.target.value})}/>
      <button data-testid="fin11-document-create" disabled={busy}>Preparar documento</button>
    </form>
    <table data-testid="fin11-documents-table"><thead><tr><th>Protocolo</th><th>Tipo</th><th>Valor</th><th>Simulado</th><th>Status</th><th>Transição</th></tr></thead><tbody>
      {documents.length===0?<tr><td colSpan={6}>Nenhum documento.</td></tr>:documents.map(item=>
        <tr key={item.id} data-testid={`fin11-document-${item.id}`}><td>{item.protocol}</td><td data-testid={`fin11-document-type-${item.id}`}>{item.document_type}</td><td>{money(item.amount_cents)}</td><td>{item.simulated?"sintético":"NÃO SIMULADO"}</td><td data-testid={`fin11-document-status-${item.id}`}>{item.status}</td>
          <td>{item.status==="rascunho"&&<button disabled={busy||reason.length<10} data-testid={`fin11-document-register-${item.id}`} onClick={()=>transitionDocument(item,"emitido")}>Registrar sintético</button>}
              {item.status!=="cancelado"&&<button disabled={busy||reason.length<10} onClick={()=>transitionDocument(item,"cancelado")}>Cancelar</button>}</td></tr>)}
    </tbody></table>
  </section>;
}
