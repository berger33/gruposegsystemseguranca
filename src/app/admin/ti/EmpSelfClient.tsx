"use client";
import { useEffect, useState } from "react";

type DocSub = { id:string; employee_id:string; doc_type:string; title:string; file_url:string; version:number; status:string; is_restricted:boolean; employee_name?:string; rejection_reason?:string };
type AccessLog = { id:string; employee_id:string; doc_type:string; competence?:string; accessed_at:string; is_private:boolean; employee_name?:string; document_title?:string };
type Availability = { id:string; employee_id:string; document_id?:string; submission_id?:string; made_available_at:string; source_name?:string; is_from_authorized_source:boolean; employee_name?:string };
type SelfReq = { id:string; protocol:string; employee_id:string; request_type:string; category:string; title:string; status:string; due_date?:string; responsible_name?:string; is_restricted:boolean; employee_name?:string; rejection_reason?:string };
type Follow = { id:string; request_id:string; message:string; status?:string; created_by_name?:string; created_at:string };
type UniformReq = { id:string; protocol:string; employee_id:string; uniform_id?:string; request_type:string; reason:string; size?:string; quantity:number; status:string; due_date?:string; employee_name?:string; uniform_name?:string };
type Receipt = { id:string; delivery_id:string; employee_id:string; receipt_signed:boolean; receipt_url?:string; signed_at?:string; employee_name?:string };

export default function EmpSelfClient(){
  const [docSubs,setDocSubs]=useState<DocSub[]>([]);
  const [accessLogs,setAccessLogs]=useState<AccessLog[]>([]);
  const [avail,setAvail]=useState<Availability[]>([]);
  const [selfReqs,setSelfReqs]=useState<SelfReq[]>([]);
  const [follows,setFollows]=useState<Follow[]>([]);
  const [uniformReqs,setUniformReqs]=useState<UniformReq[]>([]);
  const [receipts,setReceipts]=useState<Receipt[]>([]);

  const [docForm,setDocForm]=useState({ employee_id:'', doc_type:'rg', title:'', file_url:'', notes:'' });
  const [accessForm,setAccessForm]=useState({ employee_id:'', document_id:'', doc_type:'holerite', competence:'', ip:'127.0.0.1', user_agent:'test' });
  const [availForm,setAvailForm]=useState({ employee_id:'', document_id:'', source_id:'', notes:'', is_from_authorized_source:true });
  const [selfForm,setSelfForm]=useState({ employee_id:'', request_type:'ferias', category:'ferias', title:'', description:'', due_date:'', responsible_name:'', is_restricted:false, attachment_url:'', notes:'' });
  const [followForm,setFollowForm]=useState({ request_id:'', message:'', status:'em_analise', created_by_name:'RH' });
  const [uniformForm,setUniformForm]=useState({ employee_id:'', uniform_id:'', request_type:'entrega', reason:'', size:'', quantity:1, due_date:'', notes:'' });
  const [receiptForm,setReceiptForm]=useState({ delivery_id:'', employee_id:'', receipt_signed:false, receipt_url:'', notes:'' });

  const [selectedReq,setSelectedReq]=useState<string>('');

  async function api(path:string, opts?:any){
    const res=await fetch(path, { ...opts, headers:{ 'Content-Type':'application/json', ...(opts?.headers||{}) } });
    const j=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(j.error||`HTTP ${res.status}`);
    return j;
  }

  async function loadAll(){
    try{
      const [ds,al,av,sr,ur,rc]=await Promise.all([
        api('/api/admin/hr/document-submissions'),
        api('/api/admin/hr/own-doc-access-logs'),
        api('/api/admin/hr/doc-availability'),
        api('/api/admin/hr/self-requests'),
        api('/api/admin/hr/uniform-self-requests'),
        api('/api/admin/hr/uniform-receipts'),
      ]);
      setDocSubs(ds.submissions||[]); setAccessLogs(al.logs||[]); setAvail(av.history||[]); setSelfReqs(sr.requests||[]); setUniformReqs(ur.requests||[]); setReceipts(rc.receipts||[]);
    }catch(e){ console.error(e); }
  }
  useEffect(()=>{ loadAll(); },[]);

  async function loadFollows(request_id:string){
    try{
      const f=await api(`/api/admin/hr/self-request-followups?request_id=${request_id}`);
      setFollows(f.followups||[]); setSelectedReq(request_id);
    }catch(e){ console.error(e); }
  }

  // EMP-10
  async function createDocSub(){
    try{ await api('/api/admin/hr/document-submissions',{ method:'POST', body:JSON.stringify(docForm) }); setDocForm({ employee_id:'', doc_type:'rg', title:'', file_url:'', notes:'' }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function patchDocSub(id:string, status:string){
    try{ await api('/api/admin/hr/document-submissions',{ method:'PATCH', body:JSON.stringify({ id, status, rejection_reason: status==='rejeitado'?'Documento ilegível, enviar nova versão':undefined }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }

  // EMP-11
  async function createAccessLog(){
    try{ await api('/api/admin/hr/own-doc-access-logs',{ method:'POST', body:JSON.stringify(accessForm) }); setAccessForm({ employee_id:'', document_id:'', doc_type:'holerite', competence:'', ip:'127.0.0.1', user_agent:'test' }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function createAvail(){
    try{ await api('/api/admin/hr/doc-availability',{ method:'POST', body:JSON.stringify(availForm) }); setAvailForm({ employee_id:'', document_id:'', source_id:'', notes:'', is_from_authorized_source:true }); loadAll(); }catch(e:any){ alert(e.message); }
  }

  // EMP-12
  async function createSelfReq(){
    try{ await api('/api/admin/hr/self-requests',{ method:'POST', body:JSON.stringify(selfForm) }); setSelfForm({ employee_id:'', request_type:'ferias', category:'ferias', title:'', description:'', due_date:'', responsible_name:'', is_restricted:false, attachment_url:'', notes:'' }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function patchSelfReq(id:string, status:string){
    try{ await api('/api/admin/hr/self-requests',{ method:'PATCH', body:JSON.stringify({ id, status, rejection_reason: status==='rejeitado'?'Fora do prazo ou sem saldo':undefined }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function createFollow(){
    try{ await api('/api/admin/hr/self-request-followups',{ method:'POST', body:JSON.stringify(followForm) }); setFollowForm({ request_id:followForm.request_id, message:'', status:'em_analise', created_by_name:'RH' }); if(followForm.request_id) loadFollows(followForm.request_id); }catch(e:any){ alert(e.message); }
  }

  // EMP-13
  async function createUniformReq(){
    try{ await api('/api/admin/hr/uniform-self-requests',{ method:'POST', body:JSON.stringify(uniformForm) }); setUniformForm({ employee_id:'', uniform_id:'', request_type:'entrega', reason:'', size:'', quantity:1, due_date:'', notes:'' }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function patchUniformReq(id:string, status:string){
    try{ await api('/api/admin/hr/uniform-self-requests',{ method:'PATCH', body:JSON.stringify({ id, status, rejection_reason: status==='rejeitado'?'Sem estoque no momento':undefined }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function createReceipt(){
    try{ await api('/api/admin/hr/uniform-receipts',{ method:'POST', body:JSON.stringify(receiptForm) }); setReceiptForm({ delivery_id:'', employee_id:'', receipt_signed:false, receipt_url:'', notes:'' }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function patchReceipt(id:string, receipt_signed:boolean){
    try{ await api('/api/admin/hr/uniform-receipts',{ method:'PATCH', body:JSON.stringify({ id, receipt_signed }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }

  return (
    <div className="space-y-8 border-t pt-8 mt-8">
      <h2 className="text-xl font-bold">EMP-10..13 documentos holerites próprios solicitações uniformes (lote 32)</h2>

      {/* EMP-10 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">EMP-10 envio documentos solicitados status pendente/em análise/aprovado/rejeitado motivo nova versão</h3>
        <div className="grid grid-cols-3 gap-2">
          <input className="border p-1" placeholder="employee_id" value={docForm.employee_id} onChange={e=>setDocForm({...docForm,employee_id:e.target.value})} />
          <input className="border p-1" placeholder="doc_type rg/cpf/cnh/cnv" value={docForm.doc_type} onChange={e=>setDocForm({...docForm,doc_type:e.target.value})} />
          <input className="border p-1" placeholder="título" value={docForm.title} onChange={e=>setDocForm({...docForm,title:e.target.value})} />
          <input className="border p-1" placeholder="file_url" value={docForm.file_url} onChange={e=>setDocForm({...docForm,file_url:e.target.value})} />
          <input className="border p-1" placeholder="notes" value={docForm.notes} onChange={e=>setDocForm({...docForm,notes:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createDocSub}>Enviar documento (nova versão automática)</button>
        <div className="space-y-1 text-sm max-h-60 overflow-auto">
          {docSubs.slice(0,20).map(d=>(
            <div key={d.id} className="border p-1 flex justify-between">
              <span>{d.employee_name||d.employee_id.slice(0,8)} {d.doc_type} {d.title} v{d.version} {d.status} {d.is_restricted?'restrito':''}</span>
              <span className="space-x-1">
                <button className="bg-yellow-600 text-white px-1 rounded" onClick={()=>patchDocSub(d.id,'em_analise')}>em análise</button>
                <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchDocSub(d.id,'aprovado')}>aprovar</button>
                <button className="bg-red-600 text-white px-1 rounded" onClick={()=>patchDocSub(d.id,'rejeitado')}>rejeitar com motivo</button>
              </span>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-600">Versionamento UNIQUE(employee,doc_type,version) version auto MAX+1, status pendente/em_analise/aprovado/rejeitado/arquivado/cancelado/solicitado, rejection_reason obrigatório se rejeitado, is_restricted true, requested_by/at, reviewed_by/at, audit document_submit/review, nova versão quando rejeitado</div>
      </div>

      {/* EMP-11 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">EMP-11 holerites/informes/documentos próprios acesso privado histórico disponibilização fonte autorizada</h3>
        <div className="grid grid-cols-3 gap-2">
          <input className="border p-1" placeholder="employee_id acesso" value={accessForm.employee_id} onChange={e=>setAccessForm({...accessForm,employee_id:e.target.value})} />
          <input className="border p-1" placeholder="document_id holerite" value={accessForm.document_id} onChange={e=>setAccessForm({...accessForm,document_id:e.target.value})} />
          <input className="border p-1" placeholder="doc_type holerite/informe_rendimentos" value={accessForm.doc_type} onChange={e=>setAccessForm({...accessForm,doc_type:e.target.value})} />
          <input className="border p-1" placeholder="competência YYYY-MM" value={accessForm.competence} onChange={e=>setAccessForm({...accessForm,competence:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createAccessLog}>Registrar acesso privado (valida fonte autorizada e propriedade)</button>
        <div className="text-sm max-h-40 overflow-auto">Logs acesso privado: {accessLogs.slice(0,10).map(l=>`${l.employee_name||l.employee_id.slice(0,8)} ${l.doc_type} ${l.competence} ${l.accessed_at.slice(0,16)} ${l.is_private?'privado':''}`).join(' | ')}</div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <input className="border p-1" placeholder="employee_id disponibilidade" value={availForm.employee_id} onChange={e=>setAvailForm({...availForm,employee_id:e.target.value})} />
          <input className="border p-1" placeholder="document_id" value={availForm.document_id} onChange={e=>setAvailForm({...availForm,document_id:e.target.value})} />
          <input className="border p-1" placeholder="source_id fonte autorizada" value={availForm.source_id} onChange={e=>setAvailForm({...availForm,source_id:e.target.value})} />
          <input className="border p-1" placeholder="notes" value={availForm.notes} onChange={e=>setAvailForm({...availForm,notes:e.target.value})} />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={availForm.is_from_authorized_source} onChange={e=>setAvailForm({...availForm,is_from_authorized_source:e.target.checked})} /> fonte autorizada?</label>
        </div>
        <button className="bg-green-600 text-white px-3 py-1 rounded" onClick={createAvail}>Registrar disponibilização fonte autorizada</button>
        <div className="text-sm max-h-40 overflow-auto">Histórico disponibilização: {avail.slice(0,10).map(h=>`${h.employee_name||h.employee_id.slice(0,8)} doc ${h.document_id?.slice(0,8)} fonte ${h.source_name||h.document_id?.slice(0,8)} ${h.is_from_authorized_source?'✔ autorizada':''} ${h.made_available_at.slice(0,16)}`).join(' | ')}</div>
        <div className="text-xs text-gray-600">Acesso privado is_private true ip_hash user_agent_hash, valida document pertence employee e source is_authorized true senão 409 source_not_authorized, histórico disponibilização made_available_at/by source_id is_from_authorized_source true, audit own_doc_access, publicação proveniente fonte autorizada</div>
      </div>

      {/* EMP-12 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">EMP-12 férias afastamentos benefícios reembolsos solicitação anexos restritos aprovação prazo resposta</h3>
        <div className="grid grid-cols-3 gap-2">
          <input className="border p-1" placeholder="employee_id" value={selfForm.employee_id} onChange={e=>setSelfForm({...selfForm,employee_id:e.target.value})} />
          <select className="border p-1" value={selfForm.request_type} onChange={e=>setSelfForm({...selfForm,request_type:e.target.value})}><option value="ferias">ferias</option><option value="afastamento">afastamento</option><option value="beneficio">beneficio</option><option value="reembolso">reembolso</option><option value="outro">outro</option></select>
          <select className="border p-1" value={selfForm.category} onChange={e=>setSelfForm({...selfForm,category:e.target.value})}><option value="ferias">ferias</option><option value="afastamento">afastamento</option><option value="beneficio">beneficio</option><option value="reembolso">reembolso</option><option value="documento">documento</option><option value="uniforme">uniforme</option><option value="outro">outro</option></select>
          <input className="border p-1" placeholder="título min5" value={selfForm.title} onChange={e=>setSelfForm({...selfForm,title:e.target.value})} />
          <input className="border p-1" placeholder="descrição min10" value={selfForm.description} onChange={e=>setSelfForm({...selfForm,description:e.target.value})} />
          <input className="border p-1" type="date" value={selfForm.due_date} onChange={e=>setSelfForm({...selfForm,due_date:e.target.value})} />
          <input className="border p-1" placeholder="responsável nome" value={selfForm.responsible_name} onChange={e=>setSelfForm({...selfForm,responsible_name:e.target.value})} />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={selfForm.is_restricted} onChange={e=>setSelfForm({...selfForm,is_restricted:e.target.checked})} /> anexo restrito?</label>
          <input className="border p-1" placeholder="attachment_url" value={selfForm.attachment_url} onChange={e=>setSelfForm({...selfForm,attachment_url:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createSelfReq}>Criar solicitação (prazo resposta)</button>
        <div className="space-y-1 text-sm max-h-60 overflow-auto">
          {selfReqs.slice(0,20).map(r=>(
            <div key={r.id} className="border p-1 flex justify-between">
              <span>{r.protocol} {r.request_type}/{r.category} {r.title} {r.status} resp {r.responsible_name} venc {r.due_date} {r.is_restricted?'[restrito]':''}</span>
              <span className="space-x-1">
                <button className="bg-blue-500 text-white px-1 rounded" onClick={()=>{ setFollowForm({...followForm,request_id:r.id}); loadFollows(r.id); }}>acompanhar</button>
                <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchSelfReq(r.id,'aprovado')}>aprovar</button>
                <button className="bg-red-600 text-white px-1 rounded" onClick={()=>patchSelfReq(r.id,'rejeitado')}>rejeitar</button>
                <button className="bg-gray-600 text-white px-1 rounded" onClick={()=>patchSelfReq(r.id,'concluido')}>concluir</button>
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <input className="border p-1" placeholder="request_id followup" value={followForm.request_id} onChange={e=>setFollowForm({...followForm,request_id:e.target.value})} />
          <input className="border p-1" placeholder="mensagem min5" value={followForm.message} onChange={e=>setFollowForm({...followForm,message:e.target.value})} />
          <select className="border p-1" value={followForm.status} onChange={e=>setFollowForm({...followForm,status:e.target.value})}><option value="em_analise">em_analise</option><option value="aprovado">aprovado</option><option value="rejeitado">rejeitado</option><option value="concluido">concluido</option></select>
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createFollow}>Adicionar acompanhamento</button>
        <div className="text-sm">Followups solicitação {selectedReq}: {follows.map(f=>`${f.created_by_name}:${f.message.slice(0,30)}[${f.status}]`).join(' | ')}</div>
        <div className="text-xs text-gray-600">Protocolo REQ, request_type ferias/afastamento/beneficio/reembolso/outro, category, title/description, status solicitado/em_analise/aprovado/rejeitado/concluido, due_date futuro obrigatório se informado, responsible_id/name, is_restricted bool anexos restritos, attachment_url, response_deadline prazo resposta, responded_at quando aprovado/rejeitado/concluido, audit create/approve, followups mensagem min5</div>
      </div>

      {/* EMP-13 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">EMP-13 uniformes/EPI/equipamentos entrega recibo solicitação troca devolução</h3>
        <div className="grid grid-cols-3 gap-2">
          <input className="border p-1" placeholder="employee_id" value={uniformForm.employee_id} onChange={e=>setUniformForm({...uniformForm,employee_id:e.target.value})} />
          <input className="border p-1" placeholder="uniform_id" value={uniformForm.uniform_id} onChange={e=>setUniformForm({...uniformForm,uniform_id:e.target.value})} />
          <select className="border p-1" value={uniformForm.request_type} onChange={e=>setUniformForm({...uniformForm,request_type:e.target.value})}><option value="entrega">entrega</option><option value="substituicao">substituicao</option><option value="devolucao">devolucao</option><option value="outro">outro</option></select>
          <input className="border p-1" placeholder="reason min10" value={uniformForm.reason} onChange={e=>setUniformForm({...uniformForm,reason:e.target.value})} />
          <input className="border p-1" placeholder="size" value={uniformForm.size} onChange={e=>setUniformForm({...uniformForm,size:e.target.value})} />
          <input className="border p-1" type="number" value={uniformForm.quantity} onChange={e=>setUniformForm({...uniformForm,quantity:Number(e.target.value)})} />
          <input className="border p-1" type="date" value={uniformForm.due_date} onChange={e=>setUniformForm({...uniformForm,due_date:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createUniformReq}>Solicitar uniforme/EPI troca devolução</button>
        <div className="space-y-1 text-sm max-h-60 overflow-auto">
          {uniformReqs.slice(0,20).map(u=>(
            <div key={u.id} className="border p-1 flex justify-between">
              <span>{u.protocol} {u.request_type} {u.uniform_name||u.uniform_id?.slice(0,8)} {u.size} qtd {u.quantity} {u.status} {u.employee_name||u.employee_id.slice(0,8)}</span>
              <span className="space-x-1">
                <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchUniformReq(u.id,'aprovado')}>aprovar</button>
                <button className="bg-blue-600 text-white px-1 rounded" onClick={()=>patchUniformReq(u.id,'entregue')}>entregue</button>
                <button className="bg-red-600 text-white px-1 rounded" onClick={()=>patchUniformReq(u.id,'rejeitado')}>rejeitar</button>
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <input className="border p-1" placeholder="delivery_id" value={receiptForm.delivery_id} onChange={e=>setReceiptForm({...receiptForm,delivery_id:e.target.value})} />
          <input className="border p-1" placeholder="employee_id recibo" value={receiptForm.employee_id} onChange={e=>setReceiptForm({...receiptForm,employee_id:e.target.value})} />
          <input className="border p-1" placeholder="receipt_url" value={receiptForm.receipt_url} onChange={e=>setReceiptForm({...receiptForm,receipt_url:e.target.value})} />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={receiptForm.receipt_signed} onChange={e=>setReceiptForm({...receiptForm,receipt_signed:e.target.checked})} /> recibo assinado?</label>
        </div>
        <button className="bg-green-600 text-white px-3 py-1 rounded" onClick={createReceipt}>Confirmar entrega recibo (valida propriedade)</button>
        <div className="space-y-1 text-sm max-h-40 overflow-auto">
          {receipts.slice(0,20).map(r=>(
            <div key={r.id} className="border p-1 flex justify-between">
              <span>delivery {r.delivery_id.slice(0,8)} emp {r.employee_name||r.employee_id.slice(0,8)} {r.receipt_signed?'✔ assinado':''} {r.signed_at?.slice(0,16)}</span>
              <button className="bg-blue-500 text-white px-1 rounded" onClick={()=>patchReceipt(r.id,true)}>assinar recibo</button>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-600">Protocolo UNI, request_type entrega/substituicao/devolucao, reason min10, size quantity, status solicitado/em_analise/aprovado/rejeitado/entregue/cancelado, due_date, delivery_id link, recibo confirmação UNIQUE(delivery,employee) receipt_signed receipt_url signed_at valida delivery pertence employee senão 400, atualiza hr_uniform_deliveries receipt_signed, audit uniform_self_request/receipt_confirm</div>
      </div>
    </div>
  );
}
