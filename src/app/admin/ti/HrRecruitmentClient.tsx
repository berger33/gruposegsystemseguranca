"use client";
import { useEffect, useState } from "react";

type Vacancy={ id:string; title:string; cargo:string; description?:string; requisitos?:string; department?:string; location?:string; quantity:number; status:string; responsible_name?:string; created_at:string; };
type Candidate={ id:string; vacancy_id?:string; name:string; email?:string; phone?:string; status:string; consent_base:string; retention_until:string; is_talent_pool:boolean; resume_file_url?:string; source?:string; created_at:string; rejection_reason?:string; };
type Interview={ id:string; candidate_id:string; vacancy_id?:string; scheduled_at:string; interviewer_name?:string; interview_type:string; status:string; notes?:string; rating?:number; decision?:string; };
type Talent={ id:string; candidate_id?:string; name:string; email?:string; cargo_interesse:string; areas:string[]; skills:string[]; consent_base:string; retention_until:string; is_active:boolean; is_anonymized:boolean; discard_reason?:string; created_at:string; };
type Dossier={ id:string; employee_id:string; doc_type:string; title:string; version:number; status:string; is_cnv:boolean; requires_confirmation:boolean; confirmed_at?:string; validity_end?:string; file_url?:string; applicable_roles:string[]; is_required_for_role:boolean; created_at:string; };
type Req={ cargo:string; doc_type:string; is_required:boolean; is_cnv_applicable:boolean; description?:string; validity_days?:number; };

export default function HrRecruitmentClient(){
  const [vacancies,setVacancies]=useState<Vacancy[]>([]);
  const [candidates,setCandidates]=useState<Candidate[]>([]);
  const [interviews,setInterviews]=useState<Interview[]>([]);
  const [talentPool,setTalentPool]=useState<Talent[]>([]);
  const [dossiers,setDossiers]=useState<Dossier[]>([]);
  const [requirements,setRequirements]=useState<Req[]>([]);
  const [pendencias,setPendencias]=useState<{employee_id:string; pendentes:number}[]>([]);
  const [expiredCount,setExpiredCount]=useState(0);
  const [vacForm,setVacForm]=useState({ title:"", cargo:"vigilante", description:"", requisitos:"", department:"", location:"", quantity:"1", salary_range_note:"", responsible_name:"" });
  const [candForm,setCandForm]=useState({ vacancy_id:"", name:"", email:"", phone:"", resume_file_url:"", resume_text_excerpt:"", source:"", consent_base:"consentimento", retention_days:"365", notes:"" });
  const [interviewForm,setInterviewForm]=useState({ candidate_id:"", vacancy_id:"", scheduled_at:"", interviewer_name:"", interview_type:"presencial", location:"", notes:"" });
  const [talentForm,setTalentForm]=useState({ candidate_id:"", name:"", email:"", phone:"", cargo_interesse:"vigilante", areas:"", skills:"", consent_base:"consentimento", retention_days:"365", resume_file_url:"", source:"" });
  const [dossierForm,setDossierForm]=useState({ employee_id:"", doc_type:"rg", title:"", description:"", file_url:"", validity_start:"", validity_end:"", applicable_roles:"", is_cnv:"false", requires_confirmation:"false" });
  const [filterVac,setFilterVac]=useState(""); const [filterCand,setFilterCand]=useState("");
  const [msg,setMsg]=useState("");

  async function loadAll(){
    const v=await fetch('/api/admin/hr/vacancies').then(r=>r.json()); if(v.vacancies) setVacancies(v.vacancies);
    const c=await fetch('/api/admin/hr/candidates').then(r=>r.json()); if(c.candidates) setCandidates(c.candidates);
    const i=await fetch('/api/admin/hr/interviews').then(r=>r.json()); if(i.interviews) setInterviews(i.interviews);
    const tp=await fetch('/api/admin/hr/talent-pool').then(r=>r.json()); if(tp.talent_pool){ setTalentPool(tp.talent_pool); setExpiredCount(tp.expired_count||0); }
    const d=await fetch('/api/admin/hr/dossiers').then(r=>r.json()); if(d.dossiers){ setDossiers(d.dossiers); setRequirements(d.requirements||[]); setPendencias(d.pendencias||[]); }
  }
  useEffect(()=>{ loadAll(); },[]);

  async function createVacancy(){
    if(vacForm.title.length<5 || vacForm.cargo.length<2){ setMsg('titulo min5 cargo min2'); return; }
    const r=await fetch('/api/admin/hr/vacancies',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...vacForm, quantity: parseInt(vacForm.quantity)||1 })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Vaga criada'); setVacForm({ title:"", cargo:"vigilante", description:"", requisitos:"", department:"", location:"", quantity:"1", salary_range_note:"", responsible_name:"" }); loadAll();
  }
  async function patchVacancy(id:string, status:string){
    const r=await fetch('/api/admin/hr/vacancies',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  }
  async function createCandidate(){
    if(candForm.name.length<3){ setMsg('nome min3'); return; }
    const r=await fetch('/api/admin/hr/candidates',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...candForm, retention_days: parseInt(candForm.retention_days)||365 })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Candidato inscrito retenção '+j.candidate.retention_until); setCandForm({ vacancy_id:"", name:"", email:"", phone:"", resume_file_url:"", resume_text_excerpt:"", source:"", consent_base:"consentimento", retention_days:"365", notes:"" }); loadAll();
  }
  async function patchCandidate(id:string, status:string){
    const reason= status==='rejeitado'? prompt('Motivo rejeição min5')||'': undefined;
    if(status==='rejeitado' && (!reason||reason.length<5)){ setMsg('motivo obrigatório'); return; }
    const r=await fetch('/api/admin/hr/candidates',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status, reason })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  }
  async function createInterview(){
    if(!candForm.name && !interviewForm.candidate_id){ setMsg('candidate_id obrigatório'); return; }
    const r=await fetch('/api/admin/hr/interviews',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(interviewForm)}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Entrevista agendada'); setInterviewForm({ candidate_id:"", vacancy_id:"", scheduled_at:"", interviewer_name:"", interview_type:"presencial", location:"", notes:"" }); loadAll();
  }
  async function patchInterview(id:string, status:string){
    const r=await fetch('/api/admin/hr/interviews',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  }
  async function createTalent(){
    if(talentForm.name.length<3 || talentForm.cargo_interesse.length<2){ setMsg('nome min3 cargo interesse min2'); return; }
    const payload={ ...talentForm, areas: talentForm.areas? talentForm.areas.split(',').map(s=>s.trim()).filter(Boolean): [], skills: talentForm.skills? talentForm.skills.split(',').map(s=>s.trim()).filter(Boolean): [], retention_days: parseInt(talentForm.retention_days)||365 };
    const r=await fetch('/api/admin/hr/talent-pool',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Talento adicionado retenção '+j.talent.retention_until); setTalentForm({ candidate_id:"", name:"", email:"", phone:"", cargo_interesse:"vigilante", areas:"", skills:"", consent_base:"consentimento", retention_days:"365", resume_file_url:"", source:"" }); loadAll();
  }
  async function patchTalent(id:string, action:string){
    const reason= action==='descartar'? prompt('Motivo descarte min5 (LGPD)')||'': undefined;
    if(action==='descartar' && (!reason||reason.length<5)){ setMsg('motivo obrigatório'); return; }
    const r=await fetch('/api/admin/hr/talent-pool',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, action, discard_reason: reason })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  }
  async function createDossier(){
    if(!dossierForm.employee_id || dossierForm.title.length<3){ setMsg('employee_id e titulo min3'); return; }
    const payload={ ...dossierForm, applicable_roles: dossierForm.applicable_roles? dossierForm.applicable_roles.split(',').map(s=>s.trim()).filter(Boolean): [], is_cnv: dossierForm.is_cnv==='true' || dossierForm.doc_type==='cnv', requires_confirmation: dossierForm.requires_confirmation==='true' || dossierForm.doc_type==='cnv' };
    const r=await fetch('/api/admin/hr/dossiers',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}); const j=await r.json();
    if(!r.ok){ setMsg(j.error+' '+(j.note||'')); return; } setMsg('Dossiê criado v'+j.dossier.version+' CNV='+j.dossier.is_cnv); setDossierForm({ employee_id:"", doc_type:"rg", title:"", description:"", file_url:"", validity_start:"", validity_end:"", applicable_roles:"", is_cnv:"false", requires_confirmation:"false" }); loadAll();
  }
  async function patchDossier(id:string, status:string, confirmed?:boolean){
    const reason= status==='rejeitado'? prompt('Motivo rejeição min5')||'': undefined;
    if(status==='rejeitado' && (!reason||reason.length<5)){ setMsg('motivo obrigatório'); return; }
    const r=await fetch('/api/admin/hr/dossiers',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status, rejection_reason: reason, confirmed })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  }

  return (
    <div className="border rounded p-4 space-y-6 bg-white mt-6">
      <h3 className="font-semibold">HR-03 Recrutamento + HR-04 Banco talentos + HR-06 Dossiê CNV restrito</h3>
      <p className="text-xs text-gray-600">Vaga com requisitos pertinentes, candidatos com consentimento LGPD retenção 30..1825 dias, triagem/entrevista/decisão/comunicação, histórico, banco talentos autorização/base aplicável descarte configurado sem acúmulo indefinido, dossiê tipos versões validade pendências aprovador CNV apenas funções aplicáveis após confirmação.</p>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Vagas ({vacancies.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <input value={vacForm.title} onChange={e=>setVacForm({...vacForm,title:e.target.value})} placeholder="título vaga min5" className="border p-1" />
              <input value={vacForm.cargo} onChange={e=>setVacForm({...vacForm,cargo:e.target.value})} placeholder="cargo" className="border p-1" />
              <textarea value={vacForm.description} onChange={e=>setVacForm({...vacForm,description:e.target.value})} placeholder="descrição max5000" className="border p-1 col-span-2" rows={2}></textarea>
              <textarea value={vacForm.requisitos} onChange={e=>setVacForm({...vacForm,requisitos:e.target.value})} placeholder="requisitos pertinentes max2000" className="border p-1 col-span-2" rows={2}></textarea>
              <input value={vacForm.department} onChange={e=>setVacForm({...vacForm,department:e.target.value})} placeholder="departamento" className="border p-1" />
              <input value={vacForm.location} onChange={e=>setVacForm({...vacForm,location:e.target.value})} placeholder="local" className="border p-1" />
              <input value={vacForm.quantity} onChange={e=>setVacForm({...vacForm,quantity:e.target.value})} placeholder="qtd" type="number" className="border p-1" />
              <input value={vacForm.salary_range_note} onChange={e=>setVacForm({...vacForm,salary_range_note:e.target.value})} placeholder="faixa salarial nota sensível" className="border p-1" />
              <input value={vacForm.responsible_name} onChange={e=>setVacForm({...vacForm,responsible_name:e.target.value})} placeholder="responsável" className="border p-1" />
            </div>
            <button onClick={createVacancy} className="bg-blue-600 text-white px-2 py-1">criar vaga rascunho</button>
          </div>
          <div className="max-h-64 overflow-auto border divide-y text-xs">
            {vacancies.map(v=>(
              <div key={v.id} className="p-1 flex justify-between gap-2"><div><b>{v.title}</b> {v.cargo} qtd {v.quantity} status {v.status} {v.location||''} {v.responsible_name||''}<br/><span className="text-gray-500">{v.requisitos?.slice(0,80)||''}</span></div><div className="flex flex-col gap-1"><button onClick={()=>patchVacancy(v.id,'aberta')} className="border px-1">abrir</button><button onClick={()=>patchVacancy(v.id,'em_triagem')} className="border px-1">triagem</button><button onClick={()=>patchVacancy(v.id,'entrevista')} className="border px-1">entrevista</button><button onClick={()=>patchVacancy(v.id,'fechada')} className="border px-1 bg-gray-200">fechar</button></div></div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Candidatos ({candidates.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <input value={candForm.vacancy_id} onChange={e=>setCandForm({...candForm,vacancy_id:e.target.value})} placeholder="vacancy_id UUID opcional" className="border p-1" />
              <input value={candForm.name} onChange={e=>setCandForm({...candForm,name:e.target.value})} placeholder="nome candidato min3" className="border p-1" />
              <input value={candForm.email} onChange={e=>setCandForm({...candForm,email:e.target.value})} placeholder="email" className="border p-1" />
              <input value={candForm.phone} onChange={e=>setCandForm({...candForm,phone:e.target.value})} placeholder="telefone" className="border p-1" />
              <input value={candForm.resume_file_url} onChange={e=>setCandForm({...candForm,resume_file_url:e.target.value})} placeholder="currículo file_url" className="border p-1" />
              <input value={candForm.source} onChange={e=>setCandForm({...candForm,source:e.target.value})} placeholder="origem legítima" className="border p-1" />
              <select value={candForm.consent_base} onChange={e=>setCandForm({...candForm,consent_base:e.target.value})} className="border p-1"><option value="consentimento">consentimento</option><option value="legitimo_interesse">legitimo_interesse</option><option value="execucao_contrato">execucao_contrato</option><option value="cumprimento_legal">cumprimento_legal</option><option value="outro">outro</option></select>
              <input value={candForm.retention_days} onChange={e=>setCandForm({...candForm,retention_days:e.target.value})} placeholder="retenção dias 30..1825" type="number" className="border p-1" />
              <textarea value={candForm.resume_text_excerpt} onChange={e=>setCandForm({...candForm,resume_text_excerpt:e.target.value})} placeholder="resumo currículo max2000" className="border p-1 col-span-2" rows={2}></textarea>
              <textarea value={candForm.notes} onChange={e=>setCandForm({...candForm,notes:e.target.value})} placeholder="notas max2000 sem coleta indiscriminada" className="border p-1 col-span-2" rows={1}></textarea>
            </div>
            <button onClick={createCandidate} className="bg-black text-white px-2 py-1">inscrever candidato LGPD</button>
          </div>
          <div className="max-h-64 overflow-auto border divide-y text-xs">
            {candidates.map(c=>(
              <div key={c.id} className="p-1 flex justify-between gap-2"><div><b>{c.name}</b> {c.email||''} status {c.status} base {c.consent_base} retenção até {c.retention_until?.slice(0,10)} talent={String(c.is_talent_pool)}<br/>vaga {c.vacancy_id?.slice(0,8)||'-'} {c.source||''} {c.rejection_reason? `rejeitado: ${c.rejection_reason}`:''}</div><div className="flex flex-col gap-1"><button onClick={()=>patchCandidate(c.id,'em_triagem')} className="border px-1">triagem</button><button onClick={()=>patchCandidate(c.id,'entrevista')} className="border px-1">entrevista</button><button onClick={()=>patchCandidate(c.id,'aprovado')} className="border px-1 bg-green-100">aprovar</button><button onClick={()=>patchCandidate(c.id,'rejeitado')} className="border px-1 bg-red-100">rejeitar</button><button onClick={()=>setInterviewForm({...interviewForm,candidate_id:c.id, vacancy_id:c.vacancy_id||''})} className="border px-1">entrevistar</button></div></div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Entrevistas ({interviews.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <input value={interviewForm.candidate_id} onChange={e=>setInterviewForm({...interviewForm,candidate_id:e.target.value})} placeholder="candidate_id UUID" className="border p-1" />
              <input value={interviewForm.vacancy_id} onChange={e=>setInterviewForm({...interviewForm,vacancy_id:e.target.value})} placeholder="vacancy_id opcional" className="border p-1" />
              <input value={interviewForm.scheduled_at} onChange={e=>setInterviewForm({...interviewForm,scheduled_at:e.target.value})} type="datetime-local" className="border p-1" />
              <input value={interviewForm.interviewer_name} onChange={e=>setInterviewForm({...interviewForm,interviewer_name:e.target.value})} placeholder="entrevistador" className="border p-1" />
              <select value={interviewForm.interview_type} onChange={e=>setInterviewForm({...interviewForm,interview_type:e.target.value})} className="border p-1"><option value="presencial">presencial</option><option value="video">video</option><option value="telefone">telefone</option><option value="outro">outro</option></select>
              <input value={interviewForm.location} onChange={e=>setInterviewForm({...interviewForm,location:e.target.value})} placeholder="local" className="border p-1" />
              <textarea value={interviewForm.notes} onChange={e=>setInterviewForm({...interviewForm,notes:e.target.value})} placeholder="notas entrevista" className="border p-1 col-span-2" rows={1}></textarea>
            </div>
            <button onClick={createInterview} className="bg-blue-600 text-white px-2 py-1">agendar entrevista</button>
          </div>
          <div className="max-h-40 overflow-auto border divide-y text-xs">
            {interviews.map(iv=>(
              <div key={iv.id} className="p-1 flex justify-between"><span>{iv.candidate_id.slice(0,8)} {new Date(iv.scheduled_at).toLocaleString()} {iv.interviewer_name||''} {iv.interview_type} {iv.status} rating {iv.rating||'-'} {iv.decision?.slice(0,30)||''}</span><span className="flex gap-1"><button onClick={()=>patchInterview(iv.id,'realizada')} className="border px-1">realizada</button><button onClick={()=>patchInterview(iv.id,'nao_compareceu')} className="border px-1">não compareceu</button></span></div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Banco talentos ({talentPool.length}) expirados {expiredCount} sem acúmulo indefinido</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <input value={talentForm.candidate_id} onChange={e=>setTalentForm({...talentForm,candidate_id:e.target.value})} placeholder="candidate_id opcional" className="border p-1" />
              <input value={talentForm.name} onChange={e=>setTalentForm({...talentForm,name:e.target.value})} placeholder="nome min3" className="border p-1" />
              <input value={talentForm.email} onChange={e=>setTalentForm({...talentForm,email:e.target.value})} placeholder="email" className="border p-1" />
              <input value={talentForm.phone} onChange={e=>setTalentForm({...talentForm,phone:e.target.value})} placeholder="telefone" className="border p-1" />
              <input value={talentForm.cargo_interesse} onChange={e=>setTalentForm({...talentForm,cargo_interesse:e.target.value})} placeholder="cargo interesse" className="border p-1" />
              <input value={talentForm.areas} onChange={e=>setTalentForm({...talentForm,areas:e.target.value})} placeholder="áreas vírgula" className="border p-1" />
              <input value={talentForm.skills} onChange={e=>setTalentForm({...talentForm,skills:e.target.value})} placeholder="skills vírgula" className="border p-1" />
              <select value={talentForm.consent_base} onChange={e=>setTalentForm({...talentForm,consent_base:e.target.value})} className="border p-1"><option value="consentimento">consentimento</option><option value="legitimo_interesse">legitimo_interesse</option><option value="execucao_contrato">execucao_contrato</option><option value="cumprimento_legal">cumprimento_legal</option><option value="outro">outro</option></select>
              <input value={talentForm.retention_days} onChange={e=>setTalentForm({...talentForm,retention_days:e.target.value})} type="number" placeholder="retenção 30..1825" className="border p-1" />
              <input value={talentForm.resume_file_url} onChange={e=>setTalentForm({...talentForm,resume_file_url:e.target.value})} placeholder="currículo url" className="border p-1" />
              <input value={talentForm.source} onChange={e=>setTalentForm({...talentForm,source:e.target.value})} placeholder="origem" className="border p-1" />
            </div>
            <button onClick={createTalent} className="bg-green-600 text-white px-2 py-1">adicionar talento com autorização/base</button>
          </div>
          <div className="max-h-40 overflow-auto border divide-y text-xs">
            {talentPool.map(tp=>(
              <div key={tp.id} className="p-1 flex justify-between gap-2"><div><b>{tp.name}</b> {tp.cargo_interesse} base {tp.consent_base} até {tp.retention_until?.slice(0,10)} ativo={String(tp.is_active)} anon={String(tp.is_anonymized)} {tp.areas?.join(',')||''} {tp.skills?.join(',')||''} {tp.discard_reason? `descarte: ${tp.discard_reason}`:''}</div><div className="flex flex-col gap-1"><button onClick={()=>patchTalent(tp.id,'descartar')} className="border px-1 bg-red-100">descartar LGPD</button><button onClick={()=>patchTalent(tp.id,'reativar')} className="border px-1">reativar</button></div></div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="font-medium text-sm">Dossiê tipos versões validade pendências aprovador CNV funções aplicáveis após confirmação ({dossiers.length}) pendentes por funcionário {pendencias.length}</h4>
        <div className="border p-2 space-y-1 text-xs">
          <div className="grid grid-cols-3 gap-1">
            <input value={dossierForm.employee_id} onChange={e=>setDossierForm({...dossierForm,employee_id:e.target.value})} placeholder="employee_id UUID" className="border p-1" />
            <select value={dossierForm.doc_type} onChange={e=>setDossierForm({...dossierForm,doc_type:e.target.value})} className="border p-1"><option value="rg">rg</option><option value="cpf">cpf</option><option value="cnh">cnh</option><option value="cnv">cnv (só funções aplicáveis após confirmação)</option><option value="ctps">ctps</option><option value="comprovante_residencia">comprovante_residencia</option><option value="certidao">certidao</option><option value="curso">curso</option><option value="aso">aso</option><option value="treinamento">treinamento</option><option value="foto">foto</option><option value="outro">outro</option></select>
            <input value={dossierForm.title} onChange={e=>setDossierForm({...dossierForm,title:e.target.value})} placeholder="título min3" className="border p-1" />
            <input value={dossierForm.file_url} onChange={e=>setDossierForm({...dossierForm,file_url:e.target.value})} placeholder="file_url" className="border p-1" />
            <input value={dossierForm.validity_start} onChange={e=>setDossierForm({...dossierForm,validity_start:e.target.value})} type="date" className="border p-1" />
            <input value={dossierForm.validity_end} onChange={e=>setDossierForm({...dossierForm,validity_end:e.target.value})} type="date" className="border p-1" />
            <input value={dossierForm.applicable_roles} onChange={e=>setDossierForm({...dossierForm,applicable_roles:e.target.value})} placeholder="applicable_roles vírgula ex vigilante,porteiro" className="border p-1" />
            <select value={dossierForm.is_cnv} onChange={e=>setDossierForm({...dossierForm,is_cnv:e.target.value})} className="border p-1"><option value="false">is_cnv false</option><option value="true">is_cnv true</option></select>
            <select value={dossierForm.requires_confirmation} onChange={e=>setDossierForm({...dossierForm,requires_confirmation:e.target.value})} className="border p-1"><option value="false">requires_confirmation false</option><option value="true">requires_confirmation true</option></select>
            <textarea value={dossierForm.description} onChange={e=>setDossierForm({...dossierForm,description:e.target.value})} placeholder="descrição max1000" className="border p-1 col-span-3" rows={1}></textarea>
          </div>
          <button onClick={createDossier} className="bg-black text-white px-2 py-1">criar dossiê versão automática CNV restrito</button>
          <div className="text-[10px] text-gray-600">Requisitos por cargo: {requirements.map(r=>`${r.cargo}:${r.doc_type}${r.is_required?'*':''}${r.is_cnv_applicable?'(CNV)':''}`).join(' | ')}</div>
          <div className="text-[10px] text-gray-600">Pendências: {pendencias.map(p=>`${p.employee_id.slice(0,8)}:${p.pendentes}`).join(' ')}</div>
        </div>
        <div className="max-h-64 overflow-auto border divide-y text-xs">
          {dossiers.map(d=>(
            <div key={d.id} className="p-1 flex justify-between gap-2"><div><b>{d.employee_id.slice(0,8)}</b> {d.doc_type} v{d.version} {d.title} status {d.status} CNV={String(d.is_cnv)} conf={String(d.requires_confirmation)} confirmado {d.confirmed_at? new Date(d.confirmed_at).toLocaleDateString(): '-'} validade {d.validity_end?.slice(0,10)||'-'} reqRole={String(d.is_required_for_role)} roles {d.applicable_roles?.join(',')||''} {d.file_url? 'arquivo': 'sem arquivo'}</div><div className="flex flex-col gap-1"><button onClick={()=>patchDossier(d.id,'em_analise')} className="border px-1">em análise</button><button onClick={()=>patchDossier(d.id,'aprovado')} className="border px-1 bg-green-100">aprovar</button><button onClick={()=>patchDossier(d.id,'',true)} className="border px-1 bg-blue-100">confirmar CNV aplicável</button><button onClick={()=>patchDossier(d.id,'rejeitado')} className="border px-1 bg-red-100">rejeitar</button></div></div>
          ))}
        </div>
      </div>
      {msg && <div className="text-xs text-blue-700">{msg}</div>}
    </div>
  );
}
