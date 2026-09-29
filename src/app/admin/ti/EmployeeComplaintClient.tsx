"use client";
import { useEffect, useState } from "react";

export default function EmployeeComplaintClient() {
  const [items, setItems] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ client_account_id:"", contract_id:"", contact_id:"", employee_id:"", employee_reference:"", category:"outro", severity:"media", title:"", description:"", is_anonymous:false });
  const [msgForm, setMsgForm] = useState({ complaint_id:"", message:"", sender_type:"cliente", is_internal:false, is_hr_visible:false });
  const [evForm, setEvForm] = useState({ complaint_id:"", file_name:"", file_url:"", storage_key:"", is_hr_visible:false });
  const [shareForm, setShareForm] = useState({ complaint_id:"", shared_field:"category", shared_value:"", justification:"" });

  const load = async () => {
    try{
      const r = await fetch("/api/admin/employee-complaints").then(r=>r.json()).catch(()=>({items:[]}));
      setItems(r.items||[]);
    } catch(e:any){ setMsg(String(e.message||e)); }
  };
  useEffect(()=>{ load(); },[]);

  const post = async (url:string, body:any, method="POST") => {
    const r = await fetch(url, { method, headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
    const j = await r.json();
    if(!r.ok) throw new Error(j.error||"erro");
    return j;
  };

  return (
    <section style={{marginTop:32, padding:16, border:"1px solid #ccc", borderRadius:8}}>
      <h2>CLI-15 Reclamação colaborador canal restrito RH mínimo — is_restricted true minimal_share true is_shared_with_hr, compartilhamento mínimo justificado</h2>
      {msg && <p style={{color:"red"}}>{msg}</p>}

      <h3>Criar reclamação (protocol CLI-COMP-YYYYMMDD-XXXX UNIQUE, client_account_id, contract_id, contact_id, employee_id, employee_reference 3..200 + hash CHAR64, category atendimento/comportamento/seguranca/assédio/discriminacao/outro, severity baixa/media/alta/critica, title 5..200, desc 20..5000, is_anonymous, is_restricted true, minimal_share true, status pendente/em_analise/em_apuracao/resolvida/arquivada/cancelada/escalonada, responsible, due, resolved)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="client_account_id" value={form.client_account_id} onChange={e=>setForm({...form, client_account_id:e.target.value})} />
        <input placeholder="contract_id" value={form.contract_id} onChange={e=>setForm({...form, contract_id:e.target.value})} />
        <input placeholder="contact_id" value={form.contact_id} onChange={e=>setForm({...form, contact_id:e.target.value})} />
        <input placeholder="employee_id" value={form.employee_id} onChange={e=>setForm({...form, employee_id:e.target.value})} />
        <input placeholder="employee_reference 3..200 será hasheado" value={form.employee_reference} onChange={e=>setForm({...form, employee_reference:e.target.value})} />
        <select value={form.category} onChange={e=>setForm({...form, category:e.target.value})}>
          <option value="atendimento">atendimento</option><option value="comportamento">comportamento</option><option value="seguranca">seguranca</option><option value="assédio">assédio</option><option value="discriminacao">discriminacao</option><option value="outro">outro</option>
        </select>
        <select value={form.severity} onChange={e=>setForm({...form, severity:e.target.value})}>
          <option value="baixa">baixa</option><option value="media">media</option><option value="alta">alta</option><option value="critica">critica</option>
        </select>
        <input placeholder="título 5..200" value={form.title} onChange={e=>setForm({...form, title:e.target.value})} />
        <textarea placeholder="descrição 20..5000 canal restrito" value={form.description} onChange={e=>setForm({...form, description:e.target.value})} style={{width:"100%", minHeight:80}} />
        <label><input type="checkbox" checked={form.is_anonymous} onChange={e=>setForm({...form, is_anonymous:e.target.checked})} /> anônima</label>
        <button onClick={async()=>{ try{ await post("/api/admin/employee-complaints", form); setMsg("reclamação criada canal restrito compartilhamento mínimo RH"); load(); } catch(e:any){ setMsg(e.message);} }}>Criar reclamação canal restrito</button>
      </div>
      <ul>{items.map((c:any)=><li key={c.id}>{c.protocol} {c.title} cat:{c.category} sev:{c.severity} status:{c.status} restrito:{String(c.is_restricted)} minimal:{String(c.minimal_share)} sharedHR:{String(c.is_shared_with_hr)} <button onClick={async()=>{ try{ const d=await fetch(`/api/admin/employee-complaints/${c.id}`).then(r=>r.json()); setDetail(d); } catch(e:any){ setMsg(e.message);} }}>Ver mensagens/evidências/HR shares</button> <button onClick={async()=>{ try{ await post("/api/admin/employee-complaints", {id:c.id, status:"em_analise", reason:"Análise inicial reclamação canal restrito responsável definido"}, "PATCH"); setMsg("em análise"); load(); } catch(e:any){ setMsg(e.message);} }}>Em análise</button> <button onClick={async()=>{ try{ await post("/api/admin/employee-complaints", {id:c.id, status:"resolvida", reason:"Resolução reclamação colaborador canal restrito ação corretiva definida"}, "PATCH"); setMsg("resolvida"); load(); } catch(e:any){ setMsg(e.message);} }}>Resolver</button></li>)}</ul>

      {detail && <div style={{marginTop:16, padding:12, border:"1px solid #999", background:"#f9f9f9"}}>
        <h4>Detalhe {detail.complaint?.protocol} — {detail.complaint?.title} status:{detail.complaint?.status} restrito:{String(detail.complaint?.is_restricted)} minimal:{String(detail.complaint?.minimal_share)}</h4>
        <p>Desc: {detail.complaint?.description?.slice(0,200)} | Cat: {detail.complaint?.category} Sev: {detail.complaint?.severity}</p>
        <h5>Mensagens (complaint_id, sender_type cliente/rh/compliance/gestao/sistema, sender_identity/name 2..200, message 10..5000, is_internal, is_restricted true, is_hr_visible false default — canal restrito)</h5>
        <ul>{(detail.messages||[]).map((m:any)=><li key={m.id}>{m.sender_type} {m.sender_name||""} interno:{String(m.is_internal)} restrito:{String(m.is_restricted)} hrVis:{String(m.is_hr_visible)}: {m.message?.slice(0,80)}</li>)}</ul>
        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          <input placeholder="complaint_id" value={msgForm.complaint_id||detail.complaint?.id||""} onChange={e=>setMsgForm({...msgForm, complaint_id:e.target.value})} />
          <input placeholder="mensagem 10..5000" value={msgForm.message} onChange={e=>setMsgForm({...msgForm, message:e.target.value})} />
          <select value={msgForm.sender_type} onChange={e=>setMsgForm({...msgForm, sender_type:e.target.value})}>
            <option value="cliente">cliente</option><option value="rh">rh</option><option value="compliance">compliance</option><option value="gestao">gestao</option><option value="sistema">sistema</option>
          </select>
          <label><input type="checkbox" checked={msgForm.is_internal} onChange={e=>setMsgForm({...msgForm, is_internal:e.target.checked})} /> interno</label>
          <label><input type="checkbox" checked={msgForm.is_hr_visible} onChange={e=>setMsgForm({...msgForm, is_hr_visible:e.target.checked})} /> visível RH (requer role)</label>
          <button onClick={async()=>{ try{ const cid=msgForm.complaint_id||detail.complaint?.id; await post("/api/admin/employee-complaint-messages", {...msgForm, complaint_id:cid}); setMsg("mensagem criada canal restrito"); const d=await fetch(`/api/admin/employee-complaints/${cid}`).then(r=>r.json()); setDetail(d);} catch(e:any){ setMsg(e.message);} }}>Enviar mensagem restrita</button>
        </div>

        <h5>Evidências (complaint_id, file_name 1..500, file_url 5..1000, storage_key 5..500 UNIQUE, is_restricted true, is_hr_visible false, uploaded_by)</h5>
        <ul>{(detail.evidences||[]).map((ev:any)=><li key={ev.id}>{ev.file_name} url:{ev.file_url?.slice(0,40)} storage:{ev.storage_key} restrito:{String(ev.is_restricted)} hrVis:{String(ev.is_hr_visible)}</li>)}</ul>
        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          <input placeholder="complaint_id" value={evForm.complaint_id||detail.complaint?.id||""} onChange={e=>setEvForm({...evForm, complaint_id:e.target.value})} />
          <input placeholder="file_name 1..500" value={evForm.file_name} onChange={e=>setEvForm({...evForm, file_name:e.target.value})} />
          <input placeholder="file_url 5..1000" value={evForm.file_url} onChange={e=>setEvForm({...evForm, file_url:e.target.value})} />
          <input placeholder="storage_key 5..500 UNIQUE" value={evForm.storage_key} onChange={e=>setEvForm({...evForm, storage_key:e.target.value})} />
          <label><input type="checkbox" checked={evForm.is_hr_visible} onChange={e=>setEvForm({...evForm, is_hr_visible:e.target.checked})} /> visível RH</label>
          <button onClick={async()=>{ try{ const cid=evForm.complaint_id||detail.complaint?.id; await post("/api/admin/employee-complaint-evidences", {...evForm, complaint_id:cid}); setMsg("evidência criada restrita"); const d=await fetch(`/api/admin/employee-complaints/${cid}`).then(r=>r.json()); setDetail(d);} catch(e:any){ setMsg(e.message);} }}>Anexar evidência restrita</button>
        </div>

        <h5>Histórico imutável + HR shares (compartilhamento mínimo justificado apenas campos permitidos category/severity/title/status/protocol/minimal_description)</h5>
        <ul>{(detail.history||[]).map((h:any)=><li key={h.id}>v {h.previous_status}→{h.next_status} hrShare:{String(h.is_hr_share)} motivo:{h.reason?.slice(0,100)} por {h.changed_by_name}</li>)}</ul>
        <ul>{(detail.hr_shares||[]).map((s:any)=><li key={s.id}>campo:{s.shared_field} valor:{s.shared_value?.slice(0,60)} justificativa:{s.justification?.slice(0,80)} por {s.shared_by_name} em {s.shared_at}</li>)}</ul>
        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          <input placeholder="complaint_id" value={shareForm.complaint_id||detail.complaint?.id||""} onChange={e=>setShareForm({...shareForm, complaint_id:e.target.value})} />
          <select value={shareForm.shared_field} onChange={e=>setShareForm({...shareForm, shared_field:e.target.value})}>
            <option value="category">category</option><option value="severity">severity</option><option value="title">title</option><option value="status">status</option><option value="protocol">protocol</option><option value="minimal_description">minimal_description</option>
          </select>
          <input placeholder="shared_value 1..1000" value={shareForm.shared_value} onChange={e=>setShareForm({...shareForm, shared_value:e.target.value})} />
          <input placeholder="justificativa 10..1000" value={shareForm.justification} onChange={e=>setShareForm({...shareForm, justification:e.target.value})} />
          <button onClick={async()=>{ try{ const cid=shareForm.complaint_id||detail.complaint?.id; await post("/api/admin/employee-complaint-hr-shares", {...shareForm, complaint_id:cid}); setMsg("compartilhamento mínimo com RH justificado"); const d=await fetch(`/api/admin/employee-complaints/${cid}`).then(r=>r.json()); setDetail(d); load(); } catch(e:any){ setMsg(e.message);} }}>Compartilhar mínimo com RH justificado</button>
        </div>
      </div>}
    </section>
  );
}
