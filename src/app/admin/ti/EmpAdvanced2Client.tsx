"use client";
import { useEffect, useState } from "react";

type CourseEnroll = { id:string; employee_id:string; training_id?:string; session_id?:string; enrollment_date:string; status:string; presence_percent?:number; score?:number; expiry_date?:string; is_certificate_valid:boolean; employee_name?:string; training_name?:string };
type CourseProof = { id:string; enrollment_id:string; employee_id:string; file_name?:string; file_url:string; proof_type:string; status:string; expiry_date?:string; employee_name?:string };
type CourseAlert = { id:string; enrollment_id:string; employee_id:string; expiry_date:string; alert_date:string; status:string; message?:string; employee_name?:string; training_name?:string };
type Communication = { id:string; title:string; content:string; category:string; status:string; target_type:string; target_employee_id?:string; is_directed:boolean; is_active:boolean; published_at?:string };
type CommRead = { id:string; communication_id:string; employee_id:string; read_at:string; confirmed:boolean; employee_name?:string; comm_title?:string };
type Notification = { id:string; employee_id:string; communication_id?:string; type:string; title:string; message:string; is_read:boolean; is_directed:boolean; employee_name?:string; created_at:string };
type HrTicket = { id:string; protocol:string; employee_id:string; category:string; priority:string; title:string; status:string; responsible_name?:string; due_date?:string; is_private:boolean; employee_name?:string };
type HrMessage = { id:string; ticket_id:string; sender_name:string; message:string; is_private:boolean; is_internal:boolean; created_at:string };
type ConfPolicy = { id:string; role:string; access_level:string; description?:string; is_active:boolean };
type ConfReport = { id:string; protocol:string; reporter_employee_id?:string; is_anonymous:boolean; category:string; title:string; description:string; status:string; responsible_name?:string; is_anonymous_supported:boolean; is_private:boolean; reporter_name?:string };
type ConfMessage = { id:string; report_id:string; sender_name:string; message:string; is_private:boolean; is_anonymous:boolean; created_at:string };

export default function EmpAdvanced2Client(){
  const [enrollments,setEnrollments]=useState<CourseEnroll[]>([]);
  const [proofs,setProofs]=useState<CourseProof[]>([]);
  const [alerts,setAlerts]=useState<CourseAlert[]>([]);
  const [comms,setComms]=useState<Communication[]>([]);
  const [reads,setReads]=useState<CommRead[]>([]);
  const [notifs,setNotifs]=useState<Notification[]>([]);
  const [hrTickets,setHrTickets]=useState<HrTicket[]>([]);
  const [hrMessages,setHrMessages]=useState<HrMessage[]>([]);
  const [confPolicies,setConfPolicies]=useState<ConfPolicy[]>([]);
  const [confReports,setConfReports]=useState<ConfReport[]>([]);
  const [confMessages,setConfMessages]=useState<ConfMessage[]>([]);

  const [enrollForm,setEnrollForm]=useState({ employee_id:'', training_id:'', session_id:'', status:'inscrito', presence_percent:100, score:80, expiry_date:'', alert_days_before:30, notes:'' });
  const [proofForm,setProofForm]=useState({ enrollment_id:'', employee_id:'', file_name:'', file_url:'', proof_type:'certificado', expiry_date:'', notes:'' });
  const [commForm,setCommForm]=useState({ title:'', content:'', category:'geral', target_type:'todos', target_employee_id:'', target_group:'', is_directed:false });
  const [readForm,setReadForm]=useState({ communication_id:'', employee_id:'', confirmed:false, notes:'' });
  const [hrTicketForm,setHrTicketForm]=useState({ employee_id:'', category:'rh', priority:'media', title:'', description:'', responsible_name:'', due_date:'' });
  const [hrMsgForm,setHrMsgForm]=useState({ ticket_id:'', sender_name:'RH', message:'', is_internal:false });
  const [confPolicyForm,setConfPolicyForm]=useState({ role:'compliance', access_level:'admin', description:'' });
  const [confReportForm,setConfReportForm]=useState({ reporter_employee_id:'', is_anonymous:false, is_anonymous_supported:false, anonymous_token:'', category:'etica', title:'', description:'', responsible_name:'', anonymous_supported_note:'' });
  const [confMsgForm,setConfMsgForm]=useState({ report_id:'', sender_name:'Compliance', message:'', is_anonymous:false });

  const [selectedComm,setSelectedComm]=useState<string>('');
  const [selectedHrTicket,setSelectedHrTicket]=useState<string>('');
  const [selectedConfReport,setSelectedConfReport]=useState<string>('');

  async function api(path:string, opts?:any){
    const res=await fetch(path, { ...opts, headers:{ 'Content-Type':'application/json', ...(opts?.headers||{}) } });
    const j=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(j.error||`HTTP ${res.status}`);
    return j;
  }

  async function loadAll(){
    try{
      const [en,pr,al,co,nc,ht,cp,cr]=await Promise.all([
        api('/api/admin/hr/course-enrollments'),
        api('/api/admin/hr/course-proofs'),
        api('/api/admin/hr/course-alerts'),
        api('/api/admin/hr/communications'),
        api('/api/admin/hr/notifications-center'),
        api('/api/admin/hr/hr-tickets'),
        api('/api/admin/hr/confidential-policies'),
        api('/api/admin/hr/confidential-reports'),
      ]);
      setEnrollments(en.enrollments||[]); setProofs(pr.proofs||[]); setAlerts(al.alerts||[]); setComms(co.communications||[]); setNotifs(nc.notifications||[]); setHrTickets(ht.tickets||[]); setConfPolicies(cp.policies||[]); setConfReports(cr.reports||[]);
    }catch(e){ console.error(e); }
  }
  useEffect(()=>{ loadAll(); },[]);

  async function loadCommReads(comm_id:string){
    try{
      const r=await api(`/api/admin/hr/communication-reads?communication_id=${comm_id}`);
      setReads(r.reads||[]); setSelectedComm(comm_id);
    }catch(e){ console.error(e); }
  }
  async function loadHrMessages(ticket_id:string){
    try{
      const m=await api(`/api/admin/hr/hr-messages?ticket_id=${ticket_id}`);
      setHrMessages(m.messages||[]); setSelectedHrTicket(ticket_id);
    }catch(e){ console.error(e); }
  }
  async function loadConfMessages(report_id:string){
    try{
      const m=await api(`/api/admin/hr/confidential-messages?report_id=${report_id}`);
      setConfMessages(m.messages||[]); setSelectedConfReport(report_id);
    }catch(e){ console.error(e); }
  }

  // EMP-14
  async function createEnroll(){
    try{ await api('/api/admin/hr/course-enrollments',{ method:'POST', body:JSON.stringify(enrollForm) }); setEnrollForm({ employee_id:'', training_id:'', session_id:'', status:'inscrito', presence_percent:100, score:80, expiry_date:'', alert_days_before:30, notes:'' }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function patchEnroll(id:string, patch:any){
    try{ await api('/api/admin/hr/course-enrollments',{ method:'PATCH', body:JSON.stringify({ id, ...patch }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function createProof(){
    try{ await api('/api/admin/hr/course-proofs',{ method:'POST', body:JSON.stringify(proofForm) }); setProofForm({ enrollment_id:'', employee_id:'', file_name:'', file_url:'', proof_type:'certificado', expiry_date:'', notes:'' }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function patchProof(id:string, status:string){
    try{ await api('/api/admin/hr/course-proofs',{ method:'PATCH', body:JSON.stringify({ id, status }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function patchAlert(id:string, status:string){
    try{ await api('/api/admin/hr/course-alerts',{ method:'PATCH', body:JSON.stringify({ id, status }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }

  // EMP-15
  async function createComm(){
    try{ await api('/api/admin/hr/communications',{ method:'POST', body:JSON.stringify(commForm) }); setCommForm({ title:'', content:'', category:'geral', target_type:'todos', target_employee_id:'', target_group:'', is_directed:false }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function patchComm(id:string, status:string){
    try{ await api('/api/admin/hr/communications',{ method:'PATCH', body:JSON.stringify({ id, status }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function createRead(){
    try{ await api('/api/admin/hr/communication-reads',{ method:'POST', body:JSON.stringify(readForm) }); setReadForm({ communication_id:readForm.communication_id, employee_id:'', confirmed:false, notes:'' }); if(readForm.communication_id) loadCommReads(readForm.communication_id); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function patchNotif(id:string, is_read:boolean){
    try{ await api('/api/admin/hr/notifications-center',{ method:'PATCH', body:JSON.stringify({ id, is_read }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }

  // EMP-16
  async function createHrTicket(){
    try{ await api('/api/admin/hr/hr-tickets',{ method:'POST', body:JSON.stringify(hrTicketForm) }); setHrTicketForm({ employee_id:'', category:'rh', priority:'media', title:'', description:'', responsible_name:'', due_date:'' }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function patchHrTicket(id:string, status:string){
    try{ await api('/api/admin/hr/hr-tickets',{ method:'PATCH', body:JSON.stringify({ id, status }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function createHrMsg(){
    try{ await api('/api/admin/hr/hr-messages',{ method:'POST', body:JSON.stringify(hrMsgForm) }); setHrMsgForm({ ticket_id:hrMsgForm.ticket_id, sender_name:'RH', message:'', is_internal:false }); if(hrMsgForm.ticket_id) loadHrMessages(hrMsgForm.ticket_id); }catch(e:any){ alert(e.message); }
  }

  // EMP-17
  async function createConfPolicy(){
    try{ await api('/api/admin/hr/confidential-policies',{ method:'POST', body:JSON.stringify(confPolicyForm) }); setConfPolicyForm({ role:'compliance', access_level:'admin', description:'' }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function createConfReport(){
    try{ await api('/api/admin/hr/confidential-reports',{ method:'POST', body:JSON.stringify(confReportForm) }); setConfReportForm({ reporter_employee_id:'', is_anonymous:false, is_anonymous_supported:false, anonymous_token:'', category:'etica', title:'', description:'', responsible_name:'', anonymous_supported_note:'' }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function patchConfReport(id:string, status:string){
    try{ await api('/api/admin/hr/confidential-reports',{ method:'PATCH', body:JSON.stringify({ id, status }) }); loadAll(); }catch(e:any){ alert(e.message); }
  }
  async function createConfMsg(){
    try{ await api('/api/admin/hr/confidential-messages',{ method:'POST', body:JSON.stringify(confMsgForm) }); setConfMsgForm({ report_id:confMsgForm.report_id, sender_name:'Compliance', message:'', is_anonymous:false }); if(confMsgForm.report_id) loadConfMessages(confMsgForm.report_id); }catch(e:any){ alert(e.message); }
  }

  return (
    <div className="space-y-8 border-t pt-8 mt-8">
      <h2 className="text-xl font-bold">EMP-14..17 cursos comunicados atendimento confidencial (lote 33)</h2>

      {/* EMP-14 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">EMP-14 cursos reciclagens comprovantes alertas vencimento</h3>
        <div className="grid grid-cols-3 gap-2">
          <input className="border p-1" placeholder="employee_id" value={enrollForm.employee_id} onChange={e=>setEnrollForm({...enrollForm,employee_id:e.target.value})} />
          <input className="border p-1" placeholder="training_id" value={enrollForm.training_id} onChange={e=>setEnrollForm({...enrollForm,training_id:e.target.value})} />
          <input className="border p-1" placeholder="session_id opcional" value={enrollForm.session_id} onChange={e=>setEnrollForm({...enrollForm,session_id:e.target.value})} />
          <input className="border p-1" type="number" placeholder="presença %" value={enrollForm.presence_percent} onChange={e=>setEnrollForm({...enrollForm,presence_percent:Number(e.target.value)})} />
          <input className="border p-1" type="number" placeholder="score" value={enrollForm.score} onChange={e=>setEnrollForm({...enrollForm,score:Number(e.target.value)})} />
          <input className="border p-1" type="date" placeholder="expiry_date" value={enrollForm.expiry_date} onChange={e=>setEnrollForm({...enrollForm,expiry_date:e.target.value})} />
          <input className="border p-1" type="number" placeholder="alert_days_before" value={enrollForm.alert_days_before} onChange={e=>setEnrollForm({...enrollForm,alert_days_before:Number(e.target.value)})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createEnroll}>Inscrever curso (gera alerta vencimento)</button>
        <div className="space-y-1 text-sm max-h-40 overflow-auto">
          {enrollments.slice(0,20).map(en=>(
            <div key={en.id} className="border p-1 flex justify-between">
              <span>{en.employee_name||en.employee_id.slice(0,8)} {en.training_name||en.training_id?.slice(0,8)} {en.status} presença {en.presence_percent}% score {en.score} exp {en.expiry_date} {en.is_certificate_valid?'✔ cert válido':''}</span>
              <span className="space-x-1">
                <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchEnroll(en.id,{ status:'concluido', completion_date:new Date().toISOString().slice(0,10) })}>concluir</button>
                <button className="bg-yellow-600 text-white px-1 rounded" onClick={()=>patchEnroll(en.id,{ status:'vencido' })}>vencido</button>
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <input className="border p-1" placeholder="enrollment_id" value={proofForm.enrollment_id} onChange={e=>setProofForm({...proofForm,enrollment_id:e.target.value})} />
          <input className="border p-1" placeholder="employee_id" value={proofForm.employee_id} onChange={e=>setProofForm({...proofForm,employee_id:e.target.value})} />
          <input className="border p-1" placeholder="file_url" value={proofForm.file_url} onChange={e=>setProofForm({...proofForm,file_url:e.target.value})} />
          <input className="border p-1" placeholder="file_name" value={proofForm.file_name} onChange={e=>setProofForm({...proofForm,file_name:e.target.value})} />
          <select className="border p-1" value={proofForm.proof_type} onChange={e=>setProofForm({...proofForm,proof_type:e.target.value})}><option value="certificado">certificado</option><option value="comprovante">comprovante</option><option value="declaracao">declaracao</option><option value="outro">outro</option></select>
          <input className="border p-1" type="date" value={proofForm.expiry_date} onChange={e=>setProofForm({...proofForm,expiry_date:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createProof}>Enviar comprovante curso</button>
        <div className="space-y-1 text-sm max-h-40 overflow-auto">
          {proofs.slice(0,20).map(p=>(
            <div key={p.id} className="border p-1 flex justify-between">
              <span>{p.employee_name||p.employee_id.slice(0,8)} {p.proof_type} {p.file_name} {p.status} exp {p.expiry_date}</span>
              <span className="space-x-1"><button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchProof(p.id,'aprovado')}>aprovar</button><button className="bg-red-600 text-white px-1 rounded" onClick={()=>patchProof(p.id,'rejeitado')}>rejeitar</button></span>
            </div>
          ))}
        </div>

        <div className="space-y-1 text-sm max-h-40 overflow-auto pt-2 border-t">
          <div className="font-semibold">Alertas vencimento:</div>
          {alerts.slice(0,20).map(a=>(
            <div key={a.id} className="border p-1 flex justify-between">
              <span>{a.employee_name||a.employee_id.slice(0,8)} {a.training_name||a.enrollment_id.slice(0,8)} exp {a.expiry_date} alerta {a.alert_date} {a.status} {a.message?.slice(0,30)}</span>
              <span className="space-x-1"><button className="bg-blue-500 text-white px-1 rounded" onClick={()=>patchAlert(a.id,'enviado')}>enviado</button><button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchAlert(a.id,'confirmado')}>confirmado</button></span>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-600">Inscrição curso UNIQUE(employee,training,session) status presence score certificate expiry alert_days_before 30 gera alerta expiry - alert_days_before, comprovantes enrollment_id FK employee_id FK file_url proof_type certificado/comprovante, alertas vencimento enrollment_id employee_id training_id expiry alert_date status pendente/enviado/confirmado message, audit enroll/proof_upload</div>
      </div>

      {/* EMP-15 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">EMP-15 comunicados direcionados confirmação leitura central notificações</h3>
        <div className="grid grid-cols-3 gap-2">
          <input className="border p-1" placeholder="título min5" value={commForm.title} onChange={e=>setCommForm({...commForm,title:e.target.value})} />
          <select className="border p-1" value={commForm.category} onChange={e=>setCommForm({...commForm,category:e.target.value})}><option value="geral">geral</option><option value="treinamento">treinamento</option><option value="seguranca">seguranca</option><option value="rh">rh</option><option value="operacional">operacional</option><option value="beneficio">beneficio</option><option value="comunicado">comunicado</option><option value="outro">outro</option></select>
          <select className="border p-1" value={commForm.target_type} onChange={e=>setCommForm({...commForm,target_type:e.target.value})}><option value="todos">todos</option><option value="individual">individual</option><option value="grupo">grupo</option><option value="cargo">cargo</option><option value="lotacao">lotacao</option><option value="outro">outro</option></select>
          <input className="border p-1" placeholder="target_employee_id se individual" value={commForm.target_employee_id} onChange={e=>setCommForm({...commForm,target_employee_id:e.target.value})} />
          <input className="border p-1" placeholder="target_group cargo/lotacao" value={commForm.target_group} onChange={e=>setCommForm({...commForm,target_group:e.target.value})} />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={commForm.is_directed} onChange={e=>setCommForm({...commForm,is_directed:e.target.checked})} /> direcionado?</label>
          <textarea className="border p-1 col-span-3" placeholder="conteúdo min20" value={commForm.content} onChange={e=>setCommForm({...commForm,content:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createComm}>Criar comunicado direcionado</button>
        <div className="space-y-1 text-sm max-h-40 overflow-auto">
          {comms.slice(0,20).map(c=>(
            <div key={c.id} className="border p-1 flex justify-between">
              <span>{c.title} {c.category} {c.target_type} {c.is_directed?'[direcionado]':''} {c.status} {c.is_active?'ativo':''}</span>
              <span className="space-x-1">
                <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchComm(c.id,'publicado')}>publicar gera notificações</button>
                <button className="bg-blue-500 text-white px-1 rounded" onClick={()=>{ setReadForm({...readForm,communication_id:c.id}); loadCommReads(c.id); }}>leituras</button>
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <input className="border p-1" placeholder="communication_id" value={readForm.communication_id} onChange={e=>setReadForm({...readForm,communication_id:e.target.value})} />
          <input className="border p-1" placeholder="employee_id leitura" value={readForm.employee_id} onChange={e=>setReadForm({...readForm,employee_id:e.target.value})} />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={readForm.confirmed} onChange={e=>setReadForm({...readForm,confirmed:e.target.checked})} /> confirma leitura?</label>
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createRead}>Confirmar leitura comunicado</button>
        <div className="text-sm">Leituras comunicado {selectedComm}: {reads.slice(0,10).map(r=>`${r.employee_name||r.employee_id.slice(0,8)} ${r.read_at.slice(0,16)} ${r.confirmed?'✔ confirmado':''}`).join(' | ')}</div>

        <div className="space-y-1 text-sm max-h-40 overflow-auto pt-2 border-t">
          <div className="font-semibold">Central notificações:</div>
          {notifs.slice(0,20).map(n=>(
            <div key={n.id} className="border p-1 flex justify-between">
              <span>{n.employee_name||n.employee_id.slice(0,8)} {n.type} {n.title.slice(0,30)} {n.is_read?'lido':'não lido'} {n.is_directed?'[direcionado]':''} {n.created_at.slice(0,16)}</span>
              <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchNotif(n.id,true)}>marcar lido</button>
            </div>
          ))}
        </div>
        <div className="text-xs text-gray-600">Comunicados direcionados target_type individual/grupo/todos/cargo/lotacao is_directed bool, status rascunho/publicado/arquivado, content min20, publicar gera notificações emp_notifications_center para todos ativos ou individual, confirmação leitura UNIQUE(communication,employee) read_at confirmed confirmed_at ip_hash audit read, central notificações is_read read_at is_directed</div>
      </div>

      {/* EMP-16 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">EMP-16 atendimento RH protocolo categoria mensagens privadas acompanhamento</h3>
        <div className="grid grid-cols-3 gap-2">
          <input className="border p-1" placeholder="employee_id" value={hrTicketForm.employee_id} onChange={e=>setHrTicketForm({...hrTicketForm,employee_id:e.target.value})} />
          <select className="border p-1" value={hrTicketForm.category} onChange={e=>setHrTicketForm({...hrTicketForm,category:e.target.value})}><option value="folha">folha</option><option value="ponto">ponto</option><option value="beneficios">beneficios</option><option value="ferias">ferias</option><option value="afastamento">afastamento</option><option value="documentos">documentos</option><option value="uniforme">uniforme</option><option value="treinamento">treinamento</option><option value="saude">saude</option><option value="rh">rh</option><option value="outro">outro</option></select>
          <select className="border p-1" value={hrTicketForm.priority} onChange={e=>setHrTicketForm({...hrTicketForm,priority:e.target.value})}><option value="baixa">baixa</option><option value="media">media</option><option value="alta">alta</option><option value="critica">critica</option></select>
          <input className="border p-1" placeholder="título min5" value={hrTicketForm.title} onChange={e=>setHrTicketForm({...hrTicketForm,title:e.target.value})} />
          <input className="border p-1" placeholder="descrição min10" value={hrTicketForm.description} onChange={e=>setHrTicketForm({...hrTicketForm,description:e.target.value})} />
          <input className="border p-1" placeholder="responsável nome" value={hrTicketForm.responsible_name} onChange={e=>setHrTicketForm({...hrTicketForm,responsible_name:e.target.value})} />
          <input className="border p-1" type="date" value={hrTicketForm.due_date} onChange={e=>setHrTicketForm({...hrTicketForm,due_date:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createHrTicket}>Criar atendimento RH protocolo</button>
        <div className="space-y-1 text-sm max-h-40 overflow-auto">
          {hrTickets.slice(0,20).map(t=>(
            <div key={t.id} className="border p-1 flex justify-between">
              <span>{t.protocol} {t.category}/{t.priority} {t.title} {t.status} resp {t.responsible_name} {t.is_private?'privado':''}</span>
              <span className="space-x-1">
                <button className="bg-blue-500 text-white px-1 rounded" onClick={()=>{ setHrMsgForm({...hrMsgForm,ticket_id:t.id}); loadHrMessages(t.id); }}>msgs</button>
                <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchHrTicket(t.id,'em_atendimento')}>em atendimento</button>
                <button className="bg-purple-600 text-white px-1 rounded" onClick={()=>patchHrTicket(t.id,'resolvido')}>resolver</button>
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <input className="border p-1" placeholder="ticket_id" value={hrMsgForm.ticket_id} onChange={e=>setHrMsgForm({...hrMsgForm,ticket_id:e.target.value})} />
          <input className="border p-1" placeholder="sender_name" value={hrMsgForm.sender_name} onChange={e=>setHrMsgForm({...hrMsgForm,sender_name:e.target.value})} />
          <input className="border p-1" placeholder="mensagem privada" value={hrMsgForm.message} onChange={e=>setHrMsgForm({...hrMsgForm,message:e.target.value})} />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={hrMsgForm.is_internal} onChange={e=>setHrMsgForm({...hrMsgForm,is_internal:e.target.checked})} /> interna?</label>
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createHrMsg}>Enviar mensagem privada RH</button>
        <div className="text-sm">Mensagens ticket {selectedHrTicket}: {hrMessages.slice(0,10).map(m=>`${m.sender_name}:${m.message.slice(0,30)}${m.is_private?'[privado]':''}${m.is_internal?'[interna]':''}`).join(' | ')}</div>
        <div className="text-xs text-gray-600">Protocolo RH, categoria folha/ponto/beneficios/ferias/afastamento/documentos/uniforme/treinamento/saude/rh, priority, title/description, status aberto/em_atendimento/aguardando_colaborador/aguardando_rh/resolvido/encerrado, responsible due_date, is_private true mensagens privadas, acompanhamento mensagens privadas, audit ticket_create</div>
      </div>

      {/* EMP-17 */}
      <div className="border rounded p-4 space-y-3">
        <h3 className="font-semibold">EMP-17 canal confidencial separado responsáveis política acesso anonimato somente se efetivamente suportado</h3>
        <div className="grid grid-cols-3 gap-2">
          <select className="border p-1" value={confPolicyForm.role} onChange={e=>setConfPolicyForm({...confPolicyForm,role:e.target.value})}><option value="rh">rh</option><option value="compliance">compliance</option><option value="diretoria">diretoria</option><option value="ti">ti</option><option value="admin">admin</option><option value="outro">outro</option></select>
          <select className="border p-1" value={confPolicyForm.access_level} onChange={e=>setConfPolicyForm({...confPolicyForm,access_level:e.target.value})}><option value="leitura">leitura</option><option value="escrita">escrita</option><option value="admin">admin</option></select>
          <input className="border p-1" placeholder="descrição política acesso" value={confPolicyForm.description} onChange={e=>setConfPolicyForm({...confPolicyForm,description:e.target.value})} />
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createConfPolicy}>Criar política acesso confidencial</button>
        <div className="text-sm">Políticas: {confPolicies.map(p=>`${p.role}:${p.access_level}${p.is_active?' ativo':''}`).join(' | ')}</div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <input className="border p-1" placeholder="reporter_employee_id ou vazio se anônimo" value={confReportForm.reporter_employee_id} onChange={e=>setConfReportForm({...confReportForm,reporter_employee_id:e.target.value})} />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={confReportForm.is_anonymous} onChange={e=>setConfReportForm({...confReportForm,is_anonymous:e.target.checked})} /> anônimo?</label>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={confReportForm.is_anonymous_supported} onChange={e=>setConfReportForm({...confReportForm,is_anonymous_supported:e.target.checked})} /> anonimato suportado?</label>
          <input className="border p-1" placeholder="anonymous_token se anônimo" value={confReportForm.anonymous_token} onChange={e=>setConfReportForm({...confReportForm,anonymous_token:e.target.value})} />
          <select className="border p-1" value={confReportForm.category} onChange={e=>setConfReportForm({...confReportForm,category:e.target.value})}><option value="assedio">assedio</option><option value="discriminacao">discriminacao</option><option value="fraude">fraude</option><option value="seguranca">seguranca</option><option value="etica">etica</option><option value="comportamento">comportamento</option><option value="outro">outro</option></select>
          <input className="border p-1" placeholder="título min5" value={confReportForm.title} onChange={e=>setConfReportForm({...confReportForm,title:e.target.value})} />
          <textarea className="border p-1 col-span-3" placeholder="descrição min20" value={confReportForm.description} onChange={e=>setConfReportForm({...confReportForm,description:e.target.value})} />
          <input className="border p-1" placeholder="responsável nome" value={confReportForm.responsible_name} onChange={e=>setConfReportForm({...confReportForm,responsible_name:e.target.value})} />
          <input className="border p-1" placeholder="anonymous_supported_note" value={confReportForm.anonymous_supported_note} onChange={e=>setConfReportForm({...confReportForm,anonymous_supported_note:e.target.value})} />
        </div>
        <button className="bg-red-600 text-white px-3 py-1 rounded" onClick={createConfReport}>Registrar relato confidencial (anonimato só se suportado)</button>
        <div className="space-y-1 text-sm max-h-40 overflow-auto">
          {confReports.slice(0,20).map(r=>(
            <div key={r.id} className="border p-1 flex justify-between">
              <span>{r.protocol} {r.category} {r.title} {r.status} {r.is_anonymous?'[ANÔNIMO]':''} {r.is_anonymous_supported?'anonimato suportado ✔':''} {r.is_private?'privado':''} resp {r.responsible_name}</span>
              <span className="space-x-1">
                <button className="bg-blue-500 text-white px-1 rounded" onClick={()=>{ setConfMsgForm({...confMsgForm,report_id:r.id}); loadConfMessages(r.id); }}>msgs</button>
                <button className="bg-yellow-600 text-white px-1 rounded" onClick={()=>patchConfReport(r.id,'em_investigacao')}>em investigação</button>
                <button className="bg-green-600 text-white px-1 rounded" onClick={()=>patchConfReport(r.id,'resolvido')}>resolver</button>
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <input className="border p-1" placeholder="report_id" value={confMsgForm.report_id} onChange={e=>setConfMsgForm({...confMsgForm,report_id:e.target.value})} />
          <input className="border p-1" placeholder="sender_name" value={confMsgForm.sender_name} onChange={e=>setConfMsgForm({...confMsgForm,sender_name:e.target.value})} />
          <input className="border p-1" placeholder="mensagem min5" value={confMsgForm.message} onChange={e=>setConfMsgForm({...confMsgForm,message:e.target.value})} />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={confMsgForm.is_anonymous} onChange={e=>setConfMsgForm({...confMsgForm,is_anonymous:e.target.checked})} /> anônimo?</label>
        </div>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={createConfMsg}>Enviar mensagem confidencial privada</button>
        <div className="text-sm">Mensagens relato {selectedConfReport}: {confMessages.slice(0,10).map(m=>`${m.sender_name}:${m.message.slice(0,30)}${m.is_private?'[privado]':''}${m.is_anonymous?'[anônimo]':''}`).join(' | ')}</div>
        <div className="text-xs text-gray-600">Canal confidencial separado responsáveis política acesso role compliance/rh/diretoria/ti/admin access_level leitura/escrita/admin, reports protocol CONF reporter nullable is_anonymous bool anonymous_token_hash category title description status responsible is_anonymous_supported bool anon só se suportado 400 anonymous_only_if_supported, anonymous cannot have reporter_id, is_private true, mensagens privadas is_private true is_anonymous, audit confidential_report/access</div>
      </div>
    </div>
  );
}
