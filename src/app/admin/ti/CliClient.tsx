"use client";
import { useEffect, useState } from "react";

type EntryPoint = { path:string; description:string; is_primary:boolean; };
type OldRoute = { old_path:string; new_path:string; action:string; reason:string|null; };
type Contact = { id:string; client_account_id:string; display_name:string; email:string; role:string; status:string; can_delegate:boolean; delegated_by_contact_id:string|null; };
type Scope = { id:string; contact_id:string; client_account_id:string; unit_id:string|null; contract_id:string|null; role:string; can_delegate:boolean; };
type ContractItem = { id:string; contract_id:string; item_type:string; title:string; description:string|null; quantity:number|null; is_internal:boolean; };
type ContractScope = { id:string; contract_id:string; client_account_id:string; scope_description:string; is_internal:boolean; };
type Vigencia = { id:string; contract_id:string; starts_on:string; ends_on:string|null; status:string; };
type Doc = { id:string; client_account_id:string; contract_id:string|null; category:string; title:string; file_name:string; version:number; status:string; valid_from:string|null; valid_to:string|null; is_internal:boolean; is_private:boolean; };

export default function CliClient() {
  const [entryPoints, setEntryPoints] = useState<EntryPoint[]>([]);
  const [oldRoutes, setOldRoutes] = useState<OldRoute[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [items, setItems] = useState<ContractItem[]>([]);
  const [contractScopes, setContractScopes] = useState<ContractScope[]>([]);
  const [vigencias, setVigencias] = useState<Vigencia[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [msg, setMsg] = useState("");

  async function loadAll() {
    try {
      const [epRes, orRes, cRes, dRes] = await Promise.all([
        fetch("/api/hr/cli-entry-points").then(r=>r.json()).catch(()=>({entryPoints:[]})),
        fetch("/api/hr/cli-old-routes").then(r=>r.json()).catch(()=>({oldRoutes:[]})),
        fetch("/api/hr/cli-client-contacts").then(r=>r.json()).catch(()=>({contacts:[]})),
        fetch("/api/hr/cli-client-documents-v2").then(r=>r.json()).catch(()=>({documents:[]})),
      ]);
      if (epRes.entryPoints) setEntryPoints(epRes.entryPoints);
      if (orRes.oldRoutes) setOldRoutes(orRes.oldRoutes);
      if (cRes.contacts) setContacts(cRes.contacts);
      if (dRes.documents) setDocs(dRes.documents);
    } catch {}
  }
  useEffect(()=>{ loadAll(); }, []);

  async function api(path:string, method:string, body?:any) {
    const res = await fetch(path, { method, headers: { "Content-Type":"application/json" }, body: body? JSON.stringify(body): undefined });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error || data.detail || "erro");
    return data;
  }

  // CLI-01
  const [oldForm, setOldForm] = useState({ old_path:"", new_path:"", reason:"" });
  async function createOldRoute() {
    try { await api("/api/hr/cli-old-routes","POST",{ old_path:oldForm.old_path, new_path:oldForm.new_path, reason:oldForm.reason, action:"redirect" }); setMsg("Rota antiga mapeada redirect"); loadAll(); } catch(e:any){ setMsg("Erro rota: "+e.message); }
  }

  // CLI-02
  const [contactForm, setContactForm] = useState({ client_account_id:"", display_name:"", email:"", role:"operacional", can_delegate:"false", phone:"" });
  async function createContact() {
    try { await api("/api/hr/cli-client-contacts","POST",{ client_account_id:contactForm.client_account_id, display_name:contactForm.display_name, email:contactForm.email, role:contactForm.role, can_delegate:contactForm.can_delegate==="true", phone:contactForm.phone }); setMsg("Contato cliente criado papel"); loadAll(); } catch(e:any){ setMsg("Erro contato: "+e.message); }
  }
  const [scopeForm, setScopeForm] = useState({ contact_id:"", client_account_id:"", contract_id:"", unit_id:"", role:"operacional", can_delegate:"false" });
  async function createScope() {
    try { await api("/api/hr/cli-contact-scopes","POST",{ contact_id:scopeForm.contact_id, client_account_id:scopeForm.client_account_id, contract_id:scopeForm.contract_id||null, unit_id:scopeForm.unit_id||null, role:scopeForm.role, can_delegate:scopeForm.can_delegate==="true" }); setMsg("Escopo contato criado sem ampliação fora escopo próprio"); const d=await api("/api/hr/cli-contact-scopes?contact_id="+scopeForm.contact_id,"GET"); if(d.scopes) setScopes(d.scopes); } catch(e:any){ setMsg("Erro escopo: "+e.message); }
  }
  const [delegateForm, setDelegateForm] = useState({ delegator_contact_id:"", target_email:"", display_name:"", role:"operacional" });
  async function delegate() {
    try { await api("/api/hr/cli-contact-delegate","POST",{ delegator_contact_id:delegateForm.delegator_contact_id, target_email:delegateForm.target_email, display_name:delegateForm.display_name, role:delegateForm.role }); setMsg("Delegação autorizada sem ampliação fora escopo"); loadAll(); } catch(e:any){ setMsg("Erro delegação: "+e.message); }
  }

  // CLI-03
  const [itemForm, setItemForm] = useState({ contract_id:"", title:"", item_type:"vigilancia", description:"", quantity:"", is_internal:"false" });
  async function createItem() {
    try { await api("/api/hr/cli-contract-items","POST",{ contract_id:itemForm.contract_id, title:itemForm.title, item_type:itemForm.item_type, description:itemForm.description, quantity:itemForm.quantity?parseFloat(itemForm.quantity):null, is_internal:itemForm.is_internal==="true" }); setMsg("Item contrato criado "+(itemForm.is_internal==="true"?"interno não publicado":"publicado")); const d=await api("/api/hr/cli-contract-items?contract_id="+itemForm.contract_id,"GET"); if(d.items) setItems(d.items); } catch(e:any){ setMsg("Erro item: "+e.message); }
  }
  const [cScopeForm, setCScopeForm] = useState({ contract_id:"", client_account_id:"", scope_description:"", is_internal:"false", unit_id:"", post_id:"" });
  async function createContractScope() {
    try { await api("/api/hr/cli-contract-scopes","POST",{ contract_id:cScopeForm.contract_id, client_account_id:cScopeForm.client_account_id, scope_description:cScopeForm.scope_description, is_internal:cScopeForm.is_internal==="true", unit_id:cScopeForm.unit_id||null, post_id:cScopeForm.post_id||null }); setMsg("Escopo contrato criado claro"); const d=await api("/api/hr/cli-contract-scopes?contract_id="+cScopeForm.contract_id,"GET"); if(d.scopes) setContractScopes(d.scopes); } catch(e:any){ setMsg("Erro escopo contrato: "+e.message); }
  }
  const [vigForm, setVigForm] = useState({ contract_id:"", starts_on:"", ends_on:"", status:"vigente" });
  async function createVigencia() {
    try { await api("/api/hr/cli-contract-vigencia","POST",{ contract_id:vigForm.contract_id, starts_on:vigForm.starts_on, ends_on:vigForm.ends_on||null, status:vigForm.status }); setMsg("Vigência contrato criada"); const d=await api("/api/hr/cli-contract-vigencia?contract_id="+vigForm.contract_id,"GET"); if(d.vigencias) setVigencias(d.vigencias); } catch(e:any){ setMsg("Erro vigência: "+e.message); }
  }

  // CLI-04
  const [docForm, setDocForm] = useState({ client_account_id:"", contract_id:"", category:"outro", title:"", file_name:"", file_url:"", storage_key:"", valid_from:"", valid_to:"", is_internal:"false", status:"rascunho" });
  async function createDoc() {
    try { await api("/api/hr/cli-client-documents-v2","POST",{ client_account_id:docForm.client_account_id, contract_id:docForm.contract_id||null, category:docForm.category, title:docForm.title, file_name:docForm.file_name, file_url:docForm.file_url, storage_key:docForm.storage_key, valid_from:docForm.valid_from||null, valid_to:docForm.valid_to||null, is_internal:docForm.is_internal==="true", status:docForm.status }); setMsg("Documento criado categoria/validade/versão auto"); loadAll(); } catch(e:any){ setMsg("Erro doc: "+e.message); }
  }
  async function downloadDoc(id:string) {
    try { const d=await api("/api/hr/cli-document-download?document_id="+id,"GET"); setMsg("Download autorizado: "+d.download_url.slice(0,60)+" - "+d.note); } catch(e:any){ setMsg("Erro download: "+e.message); }
  }
  async function searchDocs() {
    const q = prompt("Buscar documentos (título/descrição):"); if(!q) return;
    try { const d=await api("/api/hr/cli-client-documents-v2?search="+encodeURIComponent(q),"GET"); if(d.documents) setDocs(d.documents); setMsg("Busca privada "+d.documents.length+" resultados"); } catch(e:any){ setMsg(e.message); }
  }

  return (
    <section style={{ marginTop:24, padding:16, border:"1px solid #66a", borderRadius:8 }}>
      <h2 style={{ color:"var(--theme-accent)" }}>CLI-01/02/03/04 — Portal Cliente Identidade Contatos Contratos Documentos</h2>
      {msg && <p style={{ background:"#eef", padding:8 }}>{msg}</p>}

      <h3>CLI-01 Entrada única e rotas antigas</h3>
      <p style={{ fontSize:12 }}>Entrada única: {entryPoints.find(e=>e.is_primary)?.path || "/cliente/entrar"} — rotas antigas identificadas/redirecionadas com cuidado</p>
      <ul style={{ fontSize:11 }}>{oldRoutes.map(r=>(<li key={r.old_path}>{r.old_path} → {r.new_path} [{r.action}] {r.reason}</li>))}</ul>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="old_path ex /cliente/acesso" value={oldForm.old_path} onChange={e=>setOldForm({...oldForm, old_path:e.target.value})} style={{ width:180 }} />
        <input placeholder="new_path ex /cliente/entrar" value={oldForm.new_path} onChange={e=>setOldForm({...oldForm, new_path:e.target.value})} style={{ width:180 }} />
        <input placeholder="reason" value={oldForm.reason} onChange={e=>setOldForm({...oldForm, reason:e.target.value})} />
        <button onClick={createOldRoute}>Mapear Rota Antiga Redirect</button>
      </div>

      <h3>CLI-02 Múltiplos contatos e papéis por conta/unidade/contrato delegação autorizada sem ampliação escopo</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="client_account_id UUID" value={contactForm.client_account_id} onChange={e=>setContactForm({...contactForm, client_account_id:e.target.value})} style={{ width:200 }} />
        <input placeholder="nome 2..200" value={contactForm.display_name} onChange={e=>setContactForm({...contactForm, display_name:e.target.value})} />
        <input placeholder="email" value={contactForm.email} onChange={e=>setContactForm({...contactForm, email:e.target.value})} />
        <input placeholder="phone" value={contactForm.phone} onChange={e=>setContactForm({...contactForm, phone:e.target.value})} style={{ width:120 }} />
        <select value={contactForm.role} onChange={e=>setContactForm({...contactForm, role:e.target.value})}><option value="titular">titular</option><option value="financeiro">financeiro</option><option value="operacional">operacional</option><option value="rh">rh</option><option value="comercial">comercial</option><option value="tecnico">técnico</option></select>
        <select value={contactForm.can_delegate} onChange={e=>setContactForm({...contactForm, can_delegate:e.target.value})}><option value="false">sem delegar</option><option value="true">pode delegar</option></select>
        <button onClick={createContact}>Criar Contato</button>
      </div>
      <ul style={{ fontSize:12, maxHeight:100, overflow:"auto" }}>{contacts.map(c=>(<li key={c.id}>{c.display_name} {c.email} {c.role} {c.status} {c.can_delegate?"pode delegar":""} {c.delegated_by_contact_id?`delegado por ${c.delegated_by_contact_id.slice(0,6)}`:""} <button onClick={()=>{ setScopeForm({...scopeForm, contact_id:c.id, client_account_id:c.client_account_id}); setDelegateForm({...delegateForm, delegator_contact_id:c.id}); }}>Escopo/Delegar</button></li>))}</ul>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="contact_id" value={scopeForm.contact_id} onChange={e=>setScopeForm({...scopeForm, contact_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="account_id" value={scopeForm.client_account_id} onChange={e=>setScopeForm({...scopeForm, client_account_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="contract_id" value={scopeForm.contract_id} onChange={e=>setScopeForm({...scopeForm, contract_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="unit_id" value={scopeForm.unit_id} onChange={e=>setScopeForm({...scopeForm, unit_id:e.target.value})} style={{ width:180 }} />
        <select value={scopeForm.role} onChange={e=>setScopeForm({...scopeForm, role:e.target.value})}><option value="operacional">operacional</option><option value="financeiro">financeiro</option><option value="titular">titular</option></select>
        <select value={scopeForm.can_delegate} onChange={e=>setScopeForm({...scopeForm, can_delegate:e.target.value})}><option value="false">sem delegar</option><option value="true">pode delegar</option></select>
        <button onClick={createScope}>Criar Escopo (sem ampliação fora próprio escopo)</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:80, overflow:"auto" }}>{scopes.map(s=>(<li key={s.id}>contato {s.contact_id.slice(0,6)} conta {s.client_account_id.slice(0,6)} contrato {s.contract_id?.slice(0,6)||"-"} unit {s.unit_id?.slice(0,6)||"-"} role {s.role} {s.can_delegate?"delegável":""}</li>))}</ul>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="delegator_contact_id" value={delegateForm.delegator_contact_id} onChange={e=>setDelegateForm({...delegateForm, delegator_contact_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="target_email" value={delegateForm.target_email} onChange={e=>setDelegateForm({...delegateForm, target_email:e.target.value})} />
        <input placeholder="display_name" value={delegateForm.display_name} onChange={e=>setDelegateForm({...delegateForm, display_name:e.target.value})} />
        <select value={delegateForm.role} onChange={e=>setDelegateForm({...delegateForm, role:e.target.value})}><option value="operacional">operacional</option><option value="financeiro">financeiro</option></select>
        <button onClick={delegate}>Delegar (só se autorizado, mesma conta)</button>
      </div>

      <h3>CLI-03 Contratos itens serviço vigência escopo claro conteúdo técnico interno não publicado automaticamente</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="contract_id" value={itemForm.contract_id} onChange={e=>setItemForm({...itemForm, contract_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="título item 3..200" value={itemForm.title} onChange={e=>setItemForm({...itemForm, title:e.target.value})} />
        <select value={itemForm.item_type} onChange={e=>setItemForm({...itemForm, item_type:e.target.value})}><option value="vigilancia">vigilância</option><option value="portaria">portaria</option><option value="limpeza">limpeza</option><option value="equipamento">equipamento</option></select>
        <input placeholder="qtd" value={itemForm.quantity} onChange={e=>setItemForm({...itemForm, quantity:e.target.value})} style={{ width:80 }} />
        <select value={itemForm.is_internal} onChange={e=>setItemForm({...itemForm, is_internal:e.target.value})}><option value="false">público</option><option value="true">interno não publicado auto</option></select>
        <button onClick={createItem}>Criar Item Contrato</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:80, overflow:"auto" }}>{items.map(i=>(<li key={i.id}>{i.title} {i.item_type} qtd {i.quantity} {i.is_internal?"INTERNO":""}</li>))}</ul>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="contract_id" value={cScopeForm.contract_id} onChange={e=>setCScopeForm({...cScopeForm, contract_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="account_id" value={cScopeForm.client_account_id} onChange={e=>setCScopeForm({...cScopeForm, client_account_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="escopo 10..2000" value={cScopeForm.scope_description} onChange={e=>setCScopeForm({...cScopeForm, scope_description:e.target.value})} style={{ width:250 }} />
        <select value={cScopeForm.is_internal} onChange={e=>setCScopeForm({...cScopeForm, is_internal:e.target.value})}><option value="false">público</option><option value="true">interno</option></select>
        <button onClick={createContractScope}>Criar Escopo Contrato</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:60, overflow:"auto" }}>{contractScopes.map(s=>(<li key={s.id}>{s.scope_description.slice(0,60)} {s.is_internal?"INTERNO":""}</li>))}</ul>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="contract_id vigência" value={vigForm.contract_id} onChange={e=>setVigForm({...vigForm, contract_id:e.target.value})} style={{ width:180 }} />
        <input type="date" value={vigForm.starts_on} onChange={e=>setVigForm({...vigForm, starts_on:e.target.value})} />
        <input type="date" value={vigForm.ends_on} onChange={e=>setVigForm({...vigForm, ends_on:e.target.value})} />
        <select value={vigForm.status} onChange={e=>setVigForm({...vigForm, status:e.target.value})}><option value="vigente">vigente</option><option value="encerrado">encerrado</option><option value="suspenso">suspenso</option></select>
        <button onClick={createVigencia}>Criar Vigência</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:60, overflow:"auto" }}>{vigencias.map(v=>(<li key={v.id}>{v.starts_on}→{v.ends_on||"∞"} {v.status}</li>))}</ul>

      <h3>CLI-04 Documentos categoria validade versão busca download privado autorização testada todos caminhos</h3>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
        <input placeholder="account_id" value={docForm.client_account_id} onChange={e=>setDocForm({...docForm, client_account_id:e.target.value})} style={{ width:180 }} />
        <input placeholder="contract_id" value={docForm.contract_id} onChange={e=>setDocForm({...docForm, contract_id:e.target.value})} style={{ width:180 }} />
        <select value={docForm.category} onChange={e=>setDocForm({...docForm, category:e.target.value})}><option value="contrato">contrato</option><option value="relatorio">relatório</option><option value="fatura">fatura</option><option value="vistoria">vistoria</option><option value="certidao">certidão</option><option value="outro">outro</option></select>
        <input placeholder="título 3..200" value={docForm.title} onChange={e=>setDocForm({...docForm, title:e.target.value})} style={{ width:180 }} />
        <input placeholder="file_name" value={docForm.file_name} onChange={e=>setDocForm({...docForm, file_name:e.target.value})} />
        <input placeholder="file_url" value={docForm.file_url} onChange={e=>setDocForm({...docForm, file_url:e.target.value})} style={{ width:200 }} />
        <input placeholder="storage_key" value={docForm.storage_key} onChange={e=>setDocForm({...docForm, storage_key:e.target.value})} />
        <input type="date" value={docForm.valid_from} onChange={e=>setDocForm({...docForm, valid_from:e.target.value})} />
        <input type="date" value={docForm.valid_to} onChange={e=>setDocForm({...docForm, valid_to:e.target.value})} />
        <select value={docForm.is_internal} onChange={e=>setDocForm({...docForm, is_internal:e.target.value})}><option value="false">público</option><option value="true">interno não publicado auto</option></select>
        <select value={docForm.status} onChange={e=>setDocForm({...docForm, status:e.target.value})}><option value="rascunho">rascunho</option><option value="publicado">publicado</option></select>
        <button onClick={createDoc}>Criar Documento V2 categoria/validade/versão auto</button>
        <button onClick={searchDocs}>Buscar Privado</button>
      </div>
      <ul style={{ fontSize:11, maxHeight:120, overflow:"auto" }}>
        {docs.map(d=>(
          <li key={d.id}>{d.title} {d.category} v{d.version} {d.status} {d.valid_from||""}→{d.valid_to||"∞"} {d.is_internal?"INTERNO":""} <button onClick={()=>downloadDoc(d.id)}>Download Privado Autorização Testada</button></li>
        ))}
      </ul>
    </section>
  );
}
