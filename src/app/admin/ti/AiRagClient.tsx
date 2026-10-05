"use client";
import { useEffect, useState } from "react";
import { ragDemoTemplates } from "./ragDemoTemplates";

type RagIndex = { id: string; rag_key: string; name: string; description: string; scope: string; model_name: string; ollama_host: string; max_queue_size: number; is_active: boolean; is_approved: boolean; is_published: boolean; status: string; version: number };
type RagDoc = { id: string; rag_key: string; client_account_id?: string|null; title: string; content: string; source: string; source_type: string; keywords: string[]; is_approved: boolean; is_published: boolean; status: string };
type BotConfig = { id: string; active_mode: string; whatsapp_number: string; whatsapp_message_template: string; is_dev_mode: boolean; is_beta_mode: boolean; default_rag_key: string; ollama_host: string; model_name: string; max_queue_size: number; queue_timeout_ms: number };
type BotMode = { mode_key: string; name: string; description: string; is_active: boolean };
type BotSession = { id: string; protocol: string; rag_key: string; mode: string; query: string; response: string; status: string; queue_position: number; is_whatsapp_redirect: boolean; created_at: string };
type RagQuery = { id: string; protocol: string; rag_key: string; query: string; response: string; queue_position: number; model_name: string; created_at: string };

export default function AiRagClient(){
  const [indexes, setIndexes] = useState<RagIndex[]>([]);
  const [staffRole, setStaffRole] = useState("");
  const [docs, setDocs] = useState<RagDoc[]>([]);
  const [accounts, setAccounts] = useState<{id:string;display_name:string}[]>([]);
  const [botConfig, setBotConfig] = useState<BotConfig|null>(null);
  const [modes, setModes] = useState<BotMode[]>([]);
  const [sessions, setSessions] = useState<BotSession[]>([]);
  const [queries, setQueries] = useState<RagQuery[]>([]);
  const [docForm, setDocForm] = useState({ rag_key:"cliente", client_account_id:"", title:"", content:"", source:"manual cliente", source_type:"manual", keywords:"" });
  const [configForm, setConfigForm] = useState({ active_mode:"com_ia", whatsapp_number:"551134372217", whatsapp_message_template:"Olá, vim do site Grupo SEG System. Protocolo {protocol}. Pergunta: {query}. Gostaria de atendimento humano.", default_rag_key:"publico", reason:"Alteração modo bot desenvolvedor para beta com IA" });
  const [msg, setMsg] = useState("");
  const [testQuery, setTestQuery] = useState({ rag_key:"publico", query:"Quais serviços vocês oferecem?" });

  async function load(){
    try{
      const [iRes, dRes, cfgRes, sRes, qRes, sessionRes] = await Promise.all([
        fetch("/api/admin/ai-rag-indexes").then(r=>r.json()),
        fetch("/api/admin/ai-rag-documents").then(r=>r.json()),
        fetch("/api/admin/ai-bot-config").then(r=>r.json()),
        fetch("/api/admin/ai-bot-sessions").then(r=>r.json()),
        fetch("/api/admin/ai-rag-queries").then(r=>r.json()),
        fetch("/api/admin/session").then(r=>r.json()),
      ]);
      setIndexes(iRes.items||[]);
      setStaffRole(sessionRes.role||"");
      setDocs(dRes.items||[]);
      if(sessionRes.role==="admin"||sessionRes.role==="ti") fetch("/api/admin/client-accounts?limit=100").then(r=>r.json()).then(x=>setAccounts(x.accounts||[])).catch(()=>{});
      setBotConfig(cfgRes.config||null);
      setModes(cfgRes.modes||[]);
      if(cfgRes.config){
        setConfigForm({ active_mode: cfgRes.config.active_mode, whatsapp_number: cfgRes.config.whatsapp_number||"551134372217", whatsapp_message_template: cfgRes.config.whatsapp_message_template||"Olá, vim do site Grupo SEG System. Protocolo {protocol}. Pergunta: {query}.", default_rag_key: cfgRes.config.default_rag_key||"publico", reason:"Alteração modo bot desenvolvedor" });
      }
      setSessions(sRes.items||[]);
      setQueries(qRes.items||[]);
    }catch{}
  }
  useEffect(()=>{ load(); },[]);

  async function createDoc(e: React.FormEvent){
    e.preventDefault();
    setMsg("criando doc RAG...");
    try{
      const payload = { ...docForm, keywords: docForm.keywords.split(",").map(s=>s.trim()).filter(Boolean) };
      if(payload.title.length<5) throw new Error("titulo min 5");
      if(payload.content.length<20) throw new Error("conteudo min 20");
      const res = await fetch("/api/admin/ai-rag-documents", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error||"falha");
      setMsg(`Documento ${data.title} criado em rascunho. Revise e publique antes de consultar.`);
      setDocForm({ rag_key:"cliente", client_account_id:"", title:"", content:"", source:"manual cliente", source_type:"manual", keywords:"" });
      load();
    }catch(err:any){ setMsg(`erro doc: ${err.message}`); }
  }

  async function ensureIndex(ragKey: string){
    try{
      const res=await fetch("/api/admin/ai-rag-indexes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rag_key:ragKey,scope:ragKey,name:`Base ${ragKey}`,description:`Conteúdo revisado e publicado para consultas da área ${ragKey}.`})});
      const data=await res.json();if(!res.ok)throw new Error(data.error||"falha");setMsg(`Índice ${ragKey} criado em rascunho.`);load();
    }catch(err:any){setMsg(`Erro índice: ${err.message}`)}
  }
  async function publishIndex(item:RagIndex){
    try{const res=await fetch("/api/admin/ai-rag-indexes",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:item.id,status:"publicado",is_approved:true,is_published:true,reason:"Revisão e publicação explícita da base"})});const data=await res.json();if(!res.ok)throw new Error(data.error||"falha");setMsg(`Índice ${item.rag_key} publicado.`);load();}catch(err:any){setMsg(`Erro publicação: ${err.message}`)}
  }
  async function publishDoc(item:RagDoc){
    try{const res=await fetch("/api/admin/ai-rag-documents",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:item.id,status:"publicado",is_approved:true,is_published:true})});const data=await res.json();if(!res.ok)throw new Error(data.error||"falha");setMsg(`Documento ${item.title} publicado.`);load();}catch(err:any){setMsg(`Erro publicação: ${err.message}`)}
  }
  async function archiveDoc(item:RagDoc){
    if(!window.confirm(`Retirar ${item.title} da base ${item.rag_key}?`)) return;
    try{const res=await fetch("/api/admin/ai-rag-documents",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:item.id,status:"arquivado",is_approved:false,is_published:false})});const data=await res.json();if(!res.ok)throw new Error(data.error||"falha");setMsg(`Documento ${item.title} arquivado.`);load();}catch(err:any){setMsg(`Erro ao arquivar: ${err.message}`)}
  }
  async function installDemo(ragKey:keyof typeof ragDemoTemplates){
    const accountId=ragKey==="cliente"?docForm.client_account_id:"";
    if(ragKey==="cliente"&&!accountId){setMsg("Escolha uma conta de cliente para a demonstração privada.");return;}
    if(docs.some(d=>d.rag_key===ragKey && (ragKey!=="cliente"||d.client_account_id===accountId) && d.title===ragDemoTemplates[ragKey].title && d.status!=="arquivado")){setMsg("Demonstração dessa área já existe. Revise-a na lista abaixo.");return;}
    const template=ragDemoTemplates[ragKey];
    setMsg(`Instalando demonstração ${ragKey}...`);
    try{
      const index=indexes.find(i=>i.rag_key===ragKey);
      if(!index)throw new Error("índice ausente; crie-o primeiro");
      if(!index.is_published)throw new Error("publique o índice primeiro");
      const res=await fetch("/api/admin/ai-rag-documents",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({rag_key:ragKey,client_account_id:accountId,title:template.title,content:template.content,source:"Demonstração fictícia do sistema",source_type:"manual",keywords:template.keywords})});
      const created=await res.json();if(!res.ok)throw new Error(created.error||"falha ao criar");
      const pub=await fetch("/api/admin/ai-rag-documents",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:created.id,status:"publicado",is_approved:true,is_published:true})});
      const published=await pub.json();if(!pub.ok)throw new Error(published.error||"falha ao publicar");
      setMsg(`Demonstração ${ragKey} publicada. É conteúdo fictício; substitua pelo documento oficial antes da entrega.`);load();
    }catch(err:any){setMsg(`Erro na demonstração: ${err.message}`);load();}
  }

  async function updateConfig(e: React.FormEvent){
    e.preventDefault();
    setMsg("atualizando config bot...");
    try{
      const res = await fetch("/api/admin/ai-bot-config", { method:"PATCH", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(configForm) });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error||"falha");
      setMsg(`config atualizada modo ${data.active_mode} padrão beta com IA rag ${data.default_rag_key} modelo ${data.model_name} fila ${data.max_queue_size}`);
      load();
    }catch(err:any){ setMsg(`erro config: ${err.message}`); }
  }

  async function testRag(e: React.FormEvent){
    e.preventDefault();
    setMsg(`testando RAG ${testQuery.rag_key} com Ollama Qwen3 1.7B fila...`);
    try{
      const res = await fetch("/api/ai/answer", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ rag_key: testQuery.rag_key, query: testQuery.query }) });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error||"falha");
      setMsg(`RAG ${data.rag_key}, Ollama usado: ${String(data.ollama_used)}: ${data.response.slice(0,200)}...`);
      load();
    }catch(err:any){ setMsg(`erro rag test: ${err.message}`); }
  }

  async function testBot(e: React.FormEvent){
    e.preventDefault();
    setMsg(`testando bot modo ${botConfig?.active_mode||"com_ia"}...`);
    try{
      const endpoint = testQuery.rag_key === "publico" ? "/api/ai/bot" : "/api/admin/ai-bot-sessions";
      const res = await fetch(endpoint, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ rag_key: testQuery.rag_key, query: testQuery.query, origin:"admin_ti" }) });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error||"falha");
      setMsg(`Bot ${data.mode} protocolo ${data.protocol} fila ${data.queue_position} whatsapp_redirect ${data.is_whatsapp_redirect}: ${data.response.slice(0,200)}...`);
      load();
    }catch(err:any){ setMsg(`erro bot test: ${err.message}`); }
  }

  return (
    <section style={{ marginTop:24, padding:16, border:"1px solid #7c3aed", borderRadius:8, background:"#f5f3ff" }}>
      <h2 style={{ margin:0 }}>Bases dos assistentes</h2>
      <p style={{ fontSize:13, opacity:0.8 }}>Crie o índice de cada área, revise os documentos e publique-os explicitamente. Clientes veem somente documentos vinculados às próprias contas. Testes completos de carga e homologação ainda são necessários.</p>
      <p style={{fontSize:12}}>Caminho: abra a base da área abaixo, publique o índice, instale o exemplo ou crie um documento, revise e publique. Para substituir um texto, copie-o para o formulário, crie a nova versão e arquive a anterior. Cada documento fica no banco e é administrado aqui, sem pasta manual no servidor.</p>

      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
        {(["publico","cliente","rh","marcelo"] as const).filter(key=>(staffRole==="admin"||staffRole==="ti"&&["publico","cliente"].includes(key)||staffRole==="rh"&&key==="rh")&&!indexes.some(i=>i.rag_key===key)).map(key=><button key={key} type="button" onClick={()=>ensureIndex(key)} style={{padding:"6px 10px"}}>Criar índice {key}</button>)}
      </div>
      <section style={{marginTop:12,padding:12,background:"#fff"}}>
        <strong>Documentos fictícios de demonstração por área</strong>
        <p style={{fontSize:12}}>Exemplos processuais, sem dados reais. A base cliente exige uma conta existente e só ficará visível para essa conta.</p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{(["publico","cliente","rh","marcelo"] as const).filter(key=>staffRole==="admin"||staffRole==="ti"&&["publico","cliente"].includes(key)||staffRole==="rh"&&key==="rh").map(key=><button key={key} type="button" onClick={()=>installDemo(key)} disabled={!indexes.some(i=>i.rag_key===key&&i.is_published)}>Instalar exemplo {key}</button>)}</div>
      </section>

      <details style={{ marginTop:12, background:"#fff", padding:12, borderRadius:6 }}>
        <summary style={{ fontWeight:600, cursor:"pointer" }}>RAG Indexes ({indexes.length}) — 3 separados + público</summary>
        <table style={{ width:"100%", fontSize:11, marginTop:8, borderCollapse:"collapse" }}>
          <thead><tr><th>rag_key</th><th>scope</th><th>model</th><th>queue</th><th>status</th><th>aprov</th><th>pub</th></tr></thead>
          <tbody>
            {indexes.map(i=>(
              <tr key={i.id} style={{ borderTop:"1px solid #ddd" }}>
                <td><strong>{i.rag_key}</strong></td>
                <td>{i.scope}</td>
                <td>{i.model_name}</td>
                <td>{i.max_queue_size}</td>
                <td>{i.status}</td>
                <td>{String(i.is_approved)}</td>
                <td>{String(i.is_published)}</td>
                <td>{!i.is_published&&<button type="button" onClick={()=>publishIndex(i)}>Revisar e publicar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize:11, marginTop:8 }}>A rota nova usa o host local configurado em OLLAMA_BASE_URL e atende uma pergunta por vez.</p>
      </details>

      <details style={{ marginTop:12, background:"#fff", padding:12, borderRadius:6 }}>
        <summary style={{ fontWeight:600, cursor:"pointer" }}>Configuração histórica do bot beta ({modes.length}) — não controla o RAG atual</summary>
        <ul style={{ fontSize:12 }}>
          {modes.map(m=> <li key={m.mode_key}><strong>{m.mode_key}</strong> — {m.name}: {m.description.slice(0,120)}...</li>)}
        </ul>
        {botConfig && (
          <div style={{ marginTop:8, padding:8, background:"#f5f3ff", borderRadius:4, fontSize:12 }}>
            <p>Ativo: <strong>{botConfig.active_mode}</strong> — padrão beta com IA: com_ia</p>
            <p>WhatsApp: {botConfig.whatsapp_number} — template: {botConfig.whatsapp_message_template?.slice(0,80)}...</p>
            <p>Default RAG: {botConfig.default_rag_key} — Ollama {botConfig.model_name} host {botConfig.ollama_host} queue {botConfig.max_queue_size} timeout {botConfig.queue_timeout_ms}ms — dev_mode {String(botConfig.is_dev_mode)} beta {String(botConfig.is_beta_mode)}</p>
          </div>
        )}
        <form onSubmit={updateConfig} style={{ marginTop:12, display:"grid", gap:8 }}>
          <strong>Alterar modo atendimento (dev mode)</strong>
          <select value={configForm.active_mode} onChange={e=>setConfigForm({...configForm, active_mode:e.target.value})} style={{ padding:6 }}>
            <option value="sem_ia">sem_ia — chatbot sem IA (regras aprovadas)</option>
            <option value="com_ia">com_ia — chatbot com IA Ollama Qwen3 1.7B (padrão beta)</option>
            <option value="whatsapp">whatsapp — redirecionamento WhatsApp</option>
          </select>
          <input placeholder="whatsapp_number ex: 551134372217" value={configForm.whatsapp_number} onChange={e=>setConfigForm({...configForm, whatsapp_number:e.target.value})} maxLength={20} style={{ padding:6 }} />
          <textarea placeholder="whatsapp_message_template com {protocol} {query}" value={configForm.whatsapp_message_template} onChange={e=>setConfigForm({...configForm, whatsapp_message_template:e.target.value})} maxLength={1000} rows={2} style={{ padding:6 }} />
          <select value={configForm.default_rag_key} onChange={e=>setConfigForm({...configForm, default_rag_key:e.target.value})} style={{ padding:6 }}>
            <option value="cliente">cliente — RAG portal cliente</option>
            <option value="rh">rh — RAG RH</option>
            <option value="marcelo">marcelo — RAG admin Marcelo</option>
            <option value="publico">publico — RAG site (padrão beta)</option>
          </select>
          <input placeholder="reason min 10 chars" value={configForm.reason} onChange={e=>setConfigForm({...configForm, reason:e.target.value})} required maxLength={1000} style={{ padding:6 }} />
          <button type="submit" style={{ padding:"8px 12px", background:"#7c3aed", color:"#fff", border:"none", borderRadius:4 }}>Salvar config bot modo desenvolvedor</button>
        </form>
      </details>

      <form onSubmit={createDoc} style={{ marginTop:16, display:"grid", gap:8, background:"#fff", padding:12, borderRadius:6 }}>
        <strong>Criar documento RAG por área pertinente (cliente/RH/Marcelo/publico)</strong>
        <label>Importar texto para revisão (.txt ou .md, até 20 mil caracteres)<input type="file" accept=".txt,.md,text/plain,text/markdown" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>80000){setMsg("Arquivo grande demais para um documento RAG.");return;}const content=await file.text();if(content.length>20000){setMsg("Texto excede 20 mil caracteres; divida-o em documentos menores.");return;}setDocForm(current=>({...current,title:file.name.replace(/\.(txt|md)$/i,"").slice(0,500),content,source:file.name.slice(0,500),source_type:"manual"}));setMsg("Texto carregado no formulário. Revise a área e o conteúdo antes de salvar.");}} /></label>
        <select value={docForm.rag_key} onChange={e=>setDocForm({...docForm, rag_key:e.target.value})} style={{ padding:6 }}>
          <option value="cliente">cliente — apenas portal cliente, sem RH/saúde/salário</option>
          {staffRole==="admin"&&<option value="rh">rh — apenas RH, sem dados cliente PII</option>}
          {staffRole==="admin"&&<option value="marcelo">marcelo — apenas gestão negócio, sem segredos técnicos/saúde irrestrita</option>}
          <option value="publico">publico — apenas site público, sem preço fictício</option>
        </select>
        {docForm.rag_key==="cliente" && <><select aria-label="Conta do cliente" value={docForm.client_account_id} onChange={e=>setDocForm({...docForm,client_account_id:e.target.value})} required><option value="">Selecione a conta do cliente</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.display_name} — {a.id}</option>)}</select><small>Se a conta não aparecer, cadastre-a primeiro em Clientes. O exemplo fica restrito à conta escolhida.</small></>}
        <input placeholder="title min 5 chars" value={docForm.title} onChange={e=>setDocForm({...docForm, title:e.target.value})} required maxLength={500} style={{ padding:6 }} />
        <textarea placeholder="content min 20 chars área pertinente apenas, ex: cliente=contratos/documentos/chamados, rh=admissão/férias/benefícios, marcelo=gestão comercial/operacional/financeiro" value={docForm.content} onChange={e=>setDocForm({...docForm, content:e.target.value})} required maxLength={20000} rows={4} style={{ padding:6 }} />
        <input placeholder="source ex: manual cliente" value={docForm.source} onChange={e=>setDocForm({...docForm, source:e.target.value})} required maxLength={500} style={{ padding:6 }} />
        <select value={docForm.source_type} onChange={e=>setDocForm({...docForm, source_type:e.target.value})} style={{ padding:6 }}>
          <option value="manual">manual</option>
          <option value="faq">faq</option>
          <option value="procedimento">procedimento</option>
          <option value="contrato_template">contrato_template</option>
          <option value="politica">politica</option>
          <option value="comunicado">comunicado</option>
          <option value="outro">outro</option>
        </select>
        <input placeholder="keywords csv ex: cliente, portal, contratos" value={docForm.keywords} onChange={e=>setDocForm({...docForm, keywords:e.target.value})} style={{ padding:6 }} />
        <button type="submit" style={{ padding:"8px 12px", background:"#7c3aed", color:"#fff", border:"none", borderRadius:4 }}>Criar documento em rascunho</button>
      </form>

      <section style={{marginTop:16,padding:12,background:"#fff"}}>
        <h3>Documentos para revisão ({docs.length})</h3>
        {docs.map(doc=><p key={doc.id}>{doc.rag_key} {doc.client_account_id ? `· conta ${accounts.find(a=>a.id===doc.client_account_id)?.display_name||doc.client_account_id}` : ""} · {doc.title} · {doc.status} {!doc.is_published&&doc.status!=="arquivado"&&<button type="button" onClick={()=>publishDoc(doc)}>Revisar e publicar</button>} {doc.status!=="arquivado"&&<button type="button" onClick={()=>{setDocForm({rag_key:doc.rag_key,client_account_id:doc.client_account_id||"",title:doc.title,content:doc.content,source:doc.source,source_type:doc.source_type,keywords:doc.keywords.join(", ")});setMsg("Texto copiado para o formulário. Salve como nova versão e arquive a anterior.");}}>Criar nova versão</button>} {doc.status!=="arquivado"&&<button type="button" onClick={()=>archiveDoc(doc)}>Arquivar</button>}</p>)}
      </section>

      <details style={{ marginTop:12, background:"#fff", padding:12, borderRadius:6 }}>
        <summary style={{ fontWeight:600, cursor:"pointer" }}>Docs RAG ({docs.length}) por área pertinente</summary>
        <ul style={{ fontSize:11, maxHeight:200, overflowY:"auto" }}>
          {docs.slice(0,30).map(d=> <li key={d.id}>{d.rag_key} — {d.title.slice(0,60)} — {d.source_type} — pub:{String(d.is_published)} — {d.keywords?.slice(0,3).join(",")}</li>)}
        </ul>
      </details>

      <section style={{ marginTop:16, display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <form onSubmit={testRag} style={{ background:"#fff", padding:12, borderRadius:6, display:"grid", gap:8 }}>
          <strong>Testar RAG específico com Ollama Qwen3 1.7B fila</strong>
          <select value={testQuery.rag_key} onChange={e=>setTestQuery({...testQuery, rag_key:e.target.value})} style={{ padding:6 }}>
            <option value="cliente">cliente</option>
            <option value="rh">rh</option>
            <option value="marcelo">marcelo</option>
            <option value="publico">publico (padrão beta)</option>
          </select>
          <input value={testQuery.query} onChange={e=>setTestQuery({...testQuery, query:e.target.value})} required maxLength={2000} style={{ padding:6 }} />
          <button type="submit" style={{ padding:"6px 10px", background:"#7c3aed", color:"#fff", border:"none", borderRadius:4, fontSize:12 }}>Testar RAG {testQuery.rag_key} Qwen3 1.7B</button>
        </form>

        <form onSubmit={testBot} style={{ background:"#fff", padding:12, borderRadius:6, display:"grid", gap:8 }}>
          <strong>Testar bot modo atual (sem_ia/com_ia/whatsapp)</strong>
          <select value={testQuery.rag_key} onChange={e=>setTestQuery({...testQuery, rag_key:e.target.value})} style={{ padding:6 }}>
            <option value="cliente">cliente</option>
            <option value="rh">rh</option>
            <option value="marcelo">marcelo</option>
            <option value="publico">publico</option>
          </select>
          <input value={testQuery.query} onChange={e=>setTestQuery({...testQuery, query:e.target.value})} required maxLength={2000} style={{ padding:6 }} />
          <button type="submit" disabled style={{ padding:"6px 10px", background:"#0b5fff", color:"#fff", border:"none", borderRadius:4, fontSize:12 }}>Bot beta aposentado</button>
          <p style={{ fontSize:10, opacity:0.7 }}>Modo atual: {botConfig?.active_mode||"com_ia"} — padrão beta com IA — WhatsApp {botConfig?.whatsapp_number}</p>
        </form>
      </section>

      {msg && <p style={{ marginTop:12, fontSize:12, background:"#f8fafc", padding:8, borderRadius:4, whiteSpace:"pre-wrap" }}>{msg}</p>}

      <details style={{ marginTop:12, background:"#fff", padding:12, borderRadius:6 }}>
        <summary style={{ fontWeight:600, cursor:"pointer" }}>Sessões bot ({sessions.length}) — protocolo BOT-XX-YYYYMMDD-XXXX</summary>
        <ul style={{ fontSize:11, maxHeight:200, overflowY:"auto" }}>
          {sessions.slice(0,20).map(s=> <li key={s.id}>{s.protocol} — {s.rag_key} — {s.mode} — fila:{s.queue_position} — whatsapp:{String(s.is_whatsapp_redirect)} — {s.query.slice(0,60)}... — {new Date(s.created_at).toLocaleString()}</li>)}
        </ul>
      </details>

      <details style={{ marginTop:12, background:"#fff", padding:12, borderRadius:6 }}>
        <summary style={{ fontWeight:600, cursor:"pointer" }}>Queries RAG ({queries.length}) — protocolo RAG-XXX-YYYYMMDD-XXXX Ollama Qwen3 1.7B</summary>
        <ul style={{ fontSize:11, maxHeight:200, overflowY:"auto" }}>
          {queries.slice(0,20).map(q=> <li key={q.id}>{q.protocol} — {q.rag_key} — {q.model_name} — fila:{q.queue_position} — {q.query.slice(0,60)}... — {new Date(q.created_at).toLocaleString()}</li>)}
        </ul>
      </details>

      <section style={{ marginTop:16, padding:12, background:"#fff", borderRadius:6, fontSize:12 }}>
        <strong>Estado do RAG atual:</strong> conteúdo publicado e escopo conferidos antes da chamada local ao Ollama. A recuperação é lexical; não há embedding, fila persistida, custo/token calculado ou consulta automática aos registros vivos. Quando não há fonte, a resposta informa isso. Teste cada área com uma conta própria antes da entrega.
      </section>
    </section>
  );
}
