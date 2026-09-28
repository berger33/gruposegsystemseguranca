"use client";
import { useEffect, useState } from "react";

type Absence={ id:string; employee_id:string; employee_name?:string; lotacao?:string; type:string; start_date:string; end_date:string; expected_return_date?:string; actual_return_date?:string; status:string; is_fit_for_duty?:boolean; operational_notes?:string; has_substitution:boolean; substitute_employee_name?:string; reason?:string; indisponibilidade?:string; aptidao_operacional?:string; created_at?:string; };
type TimeEntry={ id:string; employee_id:string; entry_date:string; clock_in?:string; clock_out?:string; hours_worked?:string; source:string; status:string; justification?:string; divergence_reason?:string; competence:string; created_at:string; };
type Correction={ id:string; entry_id:string; employee_id:string; reason:string; status:string; previous_data?:any; new_data:any; created_at:string; };
type Closure={ competence:string; status:string; closed_at?:string; reopened_at?:string; reopen_reason?:string; total_entries:number; divergences_count:number; notes?:string; };
type WorkRule={ id:string; name:string; employment_type:string; convention_ref?:string; version:number; validity_start:string; validity_end?:string; approval_status:string; rules:any; created_at:string; };
type HourBank={ id:string; employee_id:string; competence:string; saldo_anterior:string; horas_extras:string; horas_falta:string; adicionais:string; saldo_atual:string; status:string; rule_id?:string; rule_version?:number; created_at:string; };
type Movement={ id:string; hour_bank_id:string; employee_id:string; movement_date:string; type:string; quantity:string; reason?:string; rule_id?:string; created_at:string; };

export default function HrAbsenceClient(){
  const [absences,setAbsences]=useState<Absence[]>([]);
  const [view,setView]=useState("rh");
  const [entries,setEntries]=useState<TimeEntry[]>([]);
  const [closures,setClosures]=useState<Closure[]>([]);
  const [corrections,setCorrections]=useState<Correction[]>([]);
  const [rules,setRules]=useState<WorkRule[]>([]);
  const [banks,setBanks]=useState<HourBank[]>([]);
  const [movements,setMovements]=useState<Movement[]>([]);
  const [absenceForm,setAbsenceForm]=useState({ employee_id:"", type:"atestado_medico", start_date:"", end_date:"", expected_return_date:"", reason:"", medical_document_url:"", is_fit_for_duty:"", operational_notes:"", has_substitution:"false", substitute_employee_id:"", substitute_employee_name:"" });
  const [timeForm,setTimeForm]=useState({ employee_id:"", entry_date:"", clock_in:"", clock_out:"", hours_worked:"", justification:"", competence:"" });
  const [importForm,setImportForm]=useState({ competence:"2026-09", import_batch_id:"batch-2026-09", entries_json:"" });
  const [correctionForm,setCorrectionForm]=useState({ entry_id:"", reason:"", new_clock_in:"", new_clock_out:"", new_hours_worked:"" });
  const [closureForm,setClosureForm]=useState({ competence:"2026-09", action:"fechar", reopen_reason:"", notes:"" });
  const [ruleForm,setRuleForm]=useState({ name:"", description:"", employment_type:"clt", convention_ref:"", validity_start:"2026-01-01", validity_end:"2026-12-31", rules_json:"{\"jornada\":{\"tipo\":\"variavel_por_convenção\",\"nota\":\"Não fixar 12x36/6x1 universal\",\"horas_semanais\":44}}" });
  const [bankForm,setBankForm]=useState({ employee_id:"", competence:"2026-09", saldo_anterior:"0", horas_extras:"0", horas_falta:"0", adicionais:"0", rule_id:"", notes:"" });
  const [movementForm,setMovementForm]=useState({ hour_bank_id:"", employee_id:"", movement_date:"", type:"extra", quantity:"1", reason:"", rule_id:"" });
  const [msg,setMsg]=useState("");

  async function loadAll(){
    const a=await fetch(`/api/admin/hr/absences?view=${view}`).then(r=>r.json()); if(a.absences) setAbsences(a.absences);
    const te=await fetch('/api/admin/hr/time-entries').then(r=>r.json()); if(te.entries){ setEntries(te.entries); setClosures(te.closures||[]); }
    const tc=await fetch('/api/admin/hr/time-corrections').then(r=>r.json()); if(tc.corrections) setCorrections(tc.corrections);
    const wr=await fetch('/api/admin/hr/work-rules').then(r=>r.json()); if(wr.rules) setRules(wr.rules);
    const hb=await fetch('/api/admin/hr/hour-bank').then(r=>r.json()); if(hb.hour_banks) setBanks(hb.hour_banks);
    const hm=await fetch('/api/admin/hr/hour-movements').then(r=>r.json()); if(hm.movements) setMovements(hm.movements);
  }
  useEffect(()=>{ loadAll(); },[view]);

  async function createAbsence(){
    if(!absenceForm.employee_id || !absenceForm.start_date || !absenceForm.end_date){ setMsg('employee_id start end obrigatório'); return; }
    const payload={ ...absenceForm, is_fit_for_duty: absenceForm.is_fit_for_duty===''? undefined : absenceForm.is_fit_for_duty==='true', has_substitution: absenceForm.has_substitution==='true' };
    const r=await fetch('/api/admin/hr/absences',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Afastamento criado'); setAbsenceForm({ employee_id:"", type:"atestado_medico", start_date:"", end_date:"", expected_return_date:"", reason:"", medical_document_url:"", is_fit_for_duty:"", operational_notes:"", has_substitution:"false", substitute_employee_id:"", substitute_employee_name:"" }); loadAll();
  }
  async function patchAbsence(id:string, status:string){
    const reason= status==='rejeitado'? prompt('Motivo rejeição min5')||'': undefined;
    if(status==='rejeitado' && (!reason||reason.length<5)){ setMsg('motivo obrigatório'); return; }
    const r=await fetch('/api/admin/hr/absences',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status, rejection_reason: reason })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  }
  async function createTimeEntry(){
    if(!timeForm.employee_id || !timeForm.entry_date){ setMsg('employee_id entry_date obrigatório'); return; }
    const r=await fetch('/api/admin/hr/time-entries',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...timeForm, hours_worked: timeForm.hours_worked? parseFloat(timeForm.hours_worked): undefined })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Ponto criado'); setTimeForm({ employee_id:"", entry_date:"", clock_in:"", clock_out:"", hours_worked:"", justification:"", competence:"" }); loadAll();
  }
  async function importTimeEntries(){
    if(!importForm.competence || !/^\d{4}-\d{2}$/.test(importForm.competence)){ setMsg('competence YYYY-MM obrigatório'); return; }
    let entries:any[]=[]; try{ entries=JSON.parse(importForm.entries_json); }catch{ setMsg('entries_json inválido JSON array'); return; }
    if(!Array.isArray(entries) || entries.length===0){ setMsg('entries array vazio'); return; }
    const r=await fetch('/api/admin/hr/time-entries',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ competence: importForm.competence, import_batch_id: importForm.import_batch_id, entries })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error+' '+(j.divergences? `diverg ${j.divergences}`:'')); return; } setMsg(`Importado ${j.imported} diverg ${j.divergences} comp ${j.competence}`); loadAll();
  }
  async function createCorrection(){
    if(!correctionForm.entry_id || correctionForm.reason.length<10){ setMsg('entry_id reason min10 obrigatório'); return; }
    const new_data:any={}; if(correctionForm.new_clock_in) new_data.clock_in=correctionForm.new_clock_in; if(correctionForm.new_clock_out) new_data.clock_out=correctionForm.new_clock_out; if(correctionForm.new_hours_worked) new_data.hours_worked=parseFloat(correctionForm.new_hours_worked);
    const r=await fetch('/api/admin/hr/time-corrections',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ entry_id: correctionForm.entry_id, reason: correctionForm.reason, new_data })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Correção solicitada preserva original'); setCorrectionForm({ entry_id:"", reason:"", new_clock_in:"", new_clock_out:"", new_hours_worked:"" }); loadAll();
  }
  async function patchCorrection(id:string, status:string){
    const r=await fetch('/api/admin/hr/time-corrections',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  }
  async function handleClosure(){
    if(!closureForm.competence){ setMsg('competence obrigatório'); return; }
    const r=await fetch('/api/admin/hr/competence-closures',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(closureForm)}); const j=await r.json();
    if(!r.ok){ setMsg(j.error+' '+(j.divergences? `diverg ${j.divergences}`:'')); return; } setMsg('Competência '+j.closure.status); loadAll();
  }
  async function createRule(){
    if(ruleForm.name.length<5){ setMsg('nome regra min5'); return; }
    let rules:any; try{ rules=JSON.parse(ruleForm.rules_json); }catch{ setMsg('rules_json inválido'); return; }
    const r=await fetch('/api/admin/hr/work-rules',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...ruleForm, rules })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error+' '+(j.note||'')); return; } setMsg('Regra criada v'+j.rule.version); setRuleForm({ name:"", description:"", employment_type:"clt", convention_ref:"", validity_start:"2026-01-01", validity_end:"2026-12-31", rules_json:"{\"jornada\":{\"tipo\":\"variavel_por_convenção\",\"nota\":\"Não fixar 12x36/6x1 universal\"}}" }); loadAll();
  }
  async function patchRule(id:string, status:string){
    const reason= status==='rejeitado'? prompt('Motivo rejeição min5')||'': undefined;
    if(status==='rejeitado' && (!reason||reason.length<5)){ setMsg('motivo obrigatório'); return; }
    const r=await fetch('/api/admin/hr/work-rules',{ method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, status, rejection_reason: reason })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } loadAll();
  }
  async function createBank(){
    if(!bankForm.employee_id || !bankForm.competence){ setMsg('employee_id competence obrigatório'); return; }
    const r=await fetch('/api/admin/hr/hour-bank',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...bankForm, saldo_anterior: parseFloat(bankForm.saldo_anterior)||0, horas_extras: parseFloat(bankForm.horas_extras)||0, horas_falta: parseFloat(bankForm.horas_falta)||0, adicionais: parseFloat(bankForm.adicionais)||0 })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Banco horas criado saldo '+j.hour_bank.saldo_atual); setBankForm({ employee_id:"", competence:"2026-09", saldo_anterior:"0", horas_extras:"0", horas_falta:"0", adicionais:"0", rule_id:"", notes:"" }); loadAll();
  }
  async function createMovement(){
    if(!movementForm.hour_bank_id || !movementForm.employee_id || !movementForm.movement_date){ setMsg('hour_bank_id employee_id movement_date obrigatório'); return; }
    const r=await fetch('/api/admin/hr/hour-movements',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ...movementForm, quantity: parseFloat(movementForm.quantity)||0 })}); const j=await r.json();
    if(!r.ok){ setMsg(j.error); return; } setMsg('Movimento banco horas criado'); setMovementForm({ hour_bank_id:"", employee_id:"", movement_date:"", type:"extra", quantity:"1", reason:"", rule_id:"" }); loadAll();
  }

  return (
    <div className="border rounded p-4 space-y-6 bg-white mt-6">
      <h3 className="font-semibold">HR-10 Afastamentos + HR-11 Ponto integração + HR-12 Banco horas regras versionadas</h3>
      <p className="text-xs text-gray-600">Afastamentos período retorno documentação restrita substituição supervisor vê apenas indisponibilidade/aptidão não diagnóstico, ponto integração importação provedor justificativas divergências workflow correção preserva original fechamento competência trilha reabertura, banco horas adicionais horas extras somente regras versionadas validadas vínculo/convenção não fixar 12x36/6x1 universal.</p>

      <div className="flex gap-2">
        <select value={view} onChange={e=>setView(e.target.value)} className="border p-1 text-xs"><option value="rh">view RH completo restrito</option><option value="supervisor">view supervisor indisponibilidade/aptidão</option></select>
        <button onClick={loadAll} className="border px-2 text-xs">recarregar</button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Afastamentos ({absences.length}) view {view}</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <input value={absenceForm.employee_id} onChange={e=>setAbsenceForm({...absenceForm,employee_id:e.target.value})} placeholder="employee_id UUID" className="border p-1" />
              <select value={absenceForm.type} onChange={e=>setAbsenceForm({...absenceForm,type:e.target.value})} className="border p-1"><option value="atestado_medico">atestado_medico</option><option value="licenca_maternidade">licenca_maternidade</option><option value="licenca_paternidade">licenca_paternidade</option><option value="acidente_trabalho">acidente_trabalho</option><option value="afastamento_inss">afastamento_inss</option><option value="licenca_nao_remunerada">licenca_nao_remunerada</option><option value="falta_justificada">falta_justificada</option><option value="outro">outro</option></select>
              <input value={absenceForm.start_date} onChange={e=>setAbsenceForm({...absenceForm,start_date:e.target.value})} type="date" className="border p-1" />
              <input value={absenceForm.end_date} onChange={e=>setAbsenceForm({...absenceForm,end_date:e.target.value})} type="date" className="border p-1" />
              <input value={absenceForm.expected_return_date} onChange={e=>setAbsenceForm({...absenceForm,expected_return_date:e.target.value})} type="date" className="border p-1" />
              <input value={absenceForm.medical_document_url} onChange={e=>setAbsenceForm({...absenceForm,medical_document_url:e.target.value})} placeholder="doc médico url restrito" className="border p-1" />
              <select value={absenceForm.is_fit_for_duty} onChange={e=>setAbsenceForm({...absenceForm,is_fit_for_duty:e.target.value})} className="border p-1"><option value="">aptidão?</option><option value="true">apto</option><option value="false">inapto</option></select>
              <input value={absenceForm.operational_notes} onChange={e=>setAbsenceForm({...absenceForm,operational_notes:e.target.value})} placeholder="notas operacionais aptidão" className="border p-1" />
              <select value={absenceForm.has_substitution} onChange={e=>setAbsenceForm({...absenceForm,has_substitution:e.target.value})} className="border p-1"><option value="false">sem substituição</option><option value="true">com substituição</option></select>
              <input value={absenceForm.substitute_employee_name} onChange={e=>setAbsenceForm({...absenceForm,substitute_employee_name:e.target.value})} placeholder="substituto nome" className="border p-1" />
              <textarea value={absenceForm.reason} onChange={e=>setAbsenceForm({...absenceForm,reason:e.target.value})} placeholder="motivo max1000 sem diagnóstico detalhado para supervisor" className="border p-1 col-span-2" rows={2}></textarea>
            </div>
            <button onClick={createAbsence} className="bg-blue-600 text-white px-2 py-1">criar afastamento documentação restrita</button>
          </div>
          <div className="max-h-64 overflow-auto border divide-y text-xs">
            {absences.map(a=>(
              <div key={a.id} className="p-1 flex justify-between gap-2"><div>{view==='supervisor'? <><b>{(a as any).employee_name||a.employee_id.slice(0,8)}</b> {(a as any).indisponibilidade||`${a.start_date?.slice(0,10)} a ${a.end_date?.slice(0,10)}`} aptidão {(a as any).aptidao_operacional||String(a.is_fit_for_duty)} lot {(a as any).lotacao||''} subst {(a as any).substitute_employee_name||''} status {a.status}<br/><span className="text-gray-500">{(a as any).note||''}</span></> : <><b>{a.employee_name||a.employee_id.slice(0,8)}</b> {a.type} {a.start_date?.slice(0,10)}{"->"}{a.end_date?.slice(0,10)} retorno {a.expected_return_date?.slice(0,10)||'-'} status {a.status} apto={String(a.is_fit_for_duty)} subst={String(a.has_substitution)} {a.substitute_employee_name||''}<br/><span className="text-gray-500">{a.reason?.slice(0,80)||''} {a.operational_notes||''}</span></>}</div><div className="flex flex-col gap-1"><button onClick={()=>patchAbsence(a.id,'aprovado')} className="border px-1 bg-green-100">aprovar</button><button onClick={()=>patchAbsence(a.id,'em_afastamento')} className="border px-1">em afastamento</button><button onClick={()=>patchAbsence(a.id,'retornado')} className="border px-1">retornado</button></div></div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Ponto integração ({entries.length}) fechamentos {closures.length} correções {corrections.length}</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <input value={timeForm.employee_id} onChange={e=>setTimeForm({...timeForm,employee_id:e.target.value})} placeholder="employee_id" className="border p-1" />
              <input value={timeForm.entry_date} onChange={e=>setTimeForm({...timeForm,entry_date:e.target.value})} type="date" className="border p-1" />
              <input value={timeForm.clock_in} onChange={e=>setTimeForm({...timeForm,clock_in:e.target.value})} type="time" className="border p-1" />
              <input value={timeForm.clock_out} onChange={e=>setTimeForm({...timeForm,clock_out:e.target.value})} type="time" className="border p-1" />
              <input value={timeForm.hours_worked} onChange={e=>setTimeForm({...timeForm,hours_worked:e.target.value})} type="number" step="0.1" placeholder="horas" className="border p-1" />
              <input value={timeForm.competence} onChange={e=>setTimeForm({...timeForm,competence:e.target.value})} placeholder="competence YYYY-MM" className="border p-1" />
              <textarea value={timeForm.justification} onChange={e=>setTimeForm({...timeForm,justification:e.target.value})} placeholder="justificativa" className="border p-1 col-span-2" rows={1}></textarea>
            </div>
            <button onClick={createTimeEntry} className="bg-black text-white px-2 py-1">criar ponto manual</button>
            <div className="border-t pt-1 mt-1">
              <h5 className="font-medium">Importação provedor (limite 500)</h5>
              <div className="grid grid-cols-2 gap-1">
                <input value={importForm.competence} onChange={e=>setImportForm({...importForm,competence:e.target.value})} placeholder="competence YYYY-MM" className="border p-1" />
                <input value={importForm.import_batch_id} onChange={e=>setImportForm({...importForm,import_batch_id:e.target.value})} placeholder="batch id" className="border p-1" />
                <textarea value={importForm.entries_json} onChange={e=>setImportForm({...importForm,entries_json:e.target.value})} placeholder='JSON array [{employee_id, entry_date, clock_in, clock_out, hours_worked, source}]' className="border p-1 col-span-2" rows={3}></textarea>
              </div>
              <button onClick={importTimeEntries} className="bg-blue-600 text-white px-2 py-1">importar ponto provedor divergências</button>
            </div>
            <div className="border-t pt-1 mt-1">
              <h5 className="font-medium">Correção workflow preserva original</h5>
              <div className="grid grid-cols-2 gap-1">
                <input value={correctionForm.entry_id} onChange={e=>setCorrectionForm({...correctionForm,entry_id:e.target.value})} placeholder="entry_id UUID" className="border p-1" />
                <input value={correctionForm.reason} onChange={e=>setCorrectionForm({...correctionForm,reason:e.target.value})} placeholder="motivo min10" className="border p-1" />
                <input value={correctionForm.new_clock_in} onChange={e=>setCorrectionForm({...correctionForm,new_clock_in:e.target.value})} type="time" className="border p-1" />
                <input value={correctionForm.new_clock_out} onChange={e=>setCorrectionForm({...correctionForm,new_clock_out:e.target.value})} type="time" className="border p-1" />
                <input value={correctionForm.new_hours_worked} onChange={e=>setCorrectionForm({...correctionForm,new_hours_worked:e.target.value})} type="number" step="0.1" placeholder="novas horas" className="border p-1" />
              </div>
              <button onClick={createCorrection} className="bg-yellow-600 text-white px-2 py-1">solicitar correção</button>
              <div className="max-h-20 overflow-auto border divide-y mt-1">
                {corrections.map(c=>(
                  <div key={c.id} className="p-1 flex justify-between"><span>{c.entry_id.slice(0,8)} {c.reason.slice(0,30)} status {c.status}</span><span className="flex gap-1"><button onClick={()=>patchCorrection(c.id,'aprovado')} className="border px-1 bg-green-100">aprovar preserva original</button><button onClick={()=>patchCorrection(c.id,'rejeitado')} className="border px-1 bg-red-100">rejeitar</button></span></div>
                ))}
              </div>
            </div>
            <div className="border-t pt-1 mt-1">
              <h5 className="font-medium">Fechamento competência trilha reabertura</h5>
              <div className="grid grid-cols-2 gap-1">
                <input value={closureForm.competence} onChange={e=>setClosureForm({...closureForm,competence:e.target.value})} placeholder="competence YYYY-MM" className="border p-1" />
                <select value={closureForm.action} onChange={e=>setClosureForm({...closureForm,action:e.target.value})} className="border p-1"><option value="fechar">fechar</option><option value="reabrir">reabrir</option></select>
                <input value={closureForm.reopen_reason} onChange={e=>setClosureForm({...closureForm,reopen_reason:e.target.value})} placeholder="motivo reabertura min10" className="border p-1" />
                <input value={closureForm.notes} onChange={e=>setClosureForm({...closureForm,notes:e.target.value})} placeholder="notas" className="border p-1" />
              </div>
              <button onClick={handleClosure} className="bg-black text-white px-2 py-1">fechar/reabrir competência</button>
              <div className="max-h-20 overflow-auto border divide-y mt-1">
                {closures.map(cl=>(
                  <div key={cl.competence} className="p-1">{cl.competence} status {cl.status} total {cl.total_entries} diverg {cl.divergences_count} fechado {cl.closed_at?.slice(0,10)||'-'} reaberto {cl.reopened_at?.slice(0,10)||'-'} {cl.reopen_reason||''}</div>
                ))}
              </div>
            </div>
          </div>
          <div className="max-h-32 overflow-auto border divide-y text-xs">
            {entries.map(en=>(
              <div key={en.id} className="p-1">{en.employee_id.slice(0,8)} {en.entry_date?.slice(0,10)} {en.clock_in||'-'}{"->"}{en.clock_out||'-'} {en.hours_worked||'-'}h src {en.source} status {en.status} comp {en.competence} {en.divergence_reason? `diverg: ${en.divergence_reason}`:''}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Regras trabalho versionadas validadas vínculo/convenção não fixar 12x36/6x1 universal ({rules.length})</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <input value={ruleForm.name} onChange={e=>setRuleForm({...ruleForm,name:e.target.value})} placeholder="nome regra min5" className="border p-1" />
              <input value={ruleForm.employment_type} onChange={e=>setRuleForm({...ruleForm,employment_type:e.target.value})} placeholder="employment_type clt/terceirizado/temporario/estagio/pj/outro" className="border p-1" />
              <input value={ruleForm.convention_ref} onChange={e=>setRuleForm({...ruleForm,convention_ref:e.target.value})} placeholder="convenção ref CCT" className="border p-1" />
              <input value={ruleForm.validity_start} onChange={e=>setRuleForm({...ruleForm,validity_start:e.target.value})} type="date" className="border p-1" />
              <input value={ruleForm.validity_end} onChange={e=>setRuleForm({...ruleForm,validity_end:e.target.value})} type="date" className="border p-1" />
              <textarea value={ruleForm.description} onChange={e=>setRuleForm({...ruleForm,description:e.target.value})} placeholder="descrição max2000" className="border p-1 col-span-2" rows={1}></textarea>
              <textarea value={ruleForm.rules_json} onChange={e=>setRuleForm({...ruleForm,rules_json:e.target.value})} placeholder='rules JSON {"jornada":{"tipo":"variavel_por_convenção","nota":"Não fixar 12x36/6x1 universal"}}' className="border p-1 col-span-2" rows={4}></textarea>
            </div>
            <button onClick={createRule} className="bg-green-600 text-white px-2 py-1">criar regra versionada</button>
          </div>
          <div className="max-h-40 overflow-auto border divide-y text-xs">
            {rules.map(r=>(
              <div key={r.id} className="p-1 flex justify-between"><span><b>{r.name}</b> v{r.version} {r.employment_type} conv {r.convention_ref||'-'} status {r.approval_status} valid {r.validity_start?.slice(0,10)}{"->"}{r.validity_end?.slice(0,10)||'∞'}<br/><span className="text-gray-500">{JSON.stringify(r.rules).slice(0,100)}</span></span><span className="flex flex-col gap-1"><button onClick={()=>patchRule(r.id,'aprovado')} className="border px-1 bg-green-100">aprovar</button><button onClick={()=>patchRule(r.id,'rejeitado')} className="border px-1 bg-red-100">rejeitar</button></span></div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Banco horas ({banks.length}) movimentos ({movements.length}) adicionais horas extras só regras validadas</h4>
          <div className="border p-2 space-y-1 text-xs">
            <div className="grid grid-cols-2 gap-1">
              <input value={bankForm.employee_id} onChange={e=>setBankForm({...bankForm,employee_id:e.target.value})} placeholder="employee_id" className="border p-1" />
              <input value={bankForm.competence} onChange={e=>setBankForm({...bankForm,competence:e.target.value})} placeholder="competence YYYY-MM" className="border p-1" />
              <input value={bankForm.saldo_anterior} onChange={e=>setBankForm({...bankForm,saldo_anterior:e.target.value})} type="number" step="0.1" placeholder="saldo anterior" className="border p-1" />
              <input value={bankForm.horas_extras} onChange={e=>setBankForm({...bankForm,horas_extras:e.target.value})} type="number" step="0.1" placeholder="horas extras" className="border p-1" />
              <input value={bankForm.horas_falta} onChange={e=>setBankForm({...bankForm,horas_falta:e.target.value})} type="number" step="0.1" placeholder="horas falta" className="border p-1" />
              <input value={bankForm.adicionais} onChange={e=>setBankForm({...bankForm,adicionais:e.target.value})} type="number" step="0.1" placeholder="adicionais" className="border p-1" />
              <input value={bankForm.rule_id} onChange={e=>setBankForm({...bankForm,rule_id:e.target.value})} placeholder="rule_id UUID aprovado" className="border p-1" />
              <input value={bankForm.notes} onChange={e=>setBankForm({...bankForm,notes:e.target.value})} placeholder="notas" className="border p-1" />
            </div>
            <button onClick={createBank} className="bg-blue-600 text-white px-2 py-1">criar banco horas competência regra validada</button>
            <div className="max-h-20 overflow-auto border divide-y mt-1">
              {banks.map(b=>(
                <div key={b.id} className="p-1">{b.employee_id.slice(0,8)} comp {b.competence} ant {b.saldo_anterior} extra {b.horas_extras} falta {b.horas_falta} adic {b.adicionais} atual {b.saldo_atual} status {b.status} rule v{b.rule_version||'-'}</div>
              ))}
            </div>
            <div className="border-t pt-1 mt-1">
              <h5 className="font-medium">Movimentos banco horas</h5>
              <div className="grid grid-cols-2 gap-1">
                <input value={movementForm.hour_bank_id} onChange={e=>setMovementForm({...movementForm,hour_bank_id:e.target.value})} placeholder="hour_bank_id" className="border p-1" />
                <input value={movementForm.employee_id} onChange={e=>setMovementForm({...movementForm,employee_id:e.target.value})} placeholder="employee_id" className="border p-1" />
                <input value={movementForm.movement_date} onChange={e=>setMovementForm({...movementForm,movement_date:e.target.value})} type="date" className="border p-1" />
                <select value={movementForm.type} onChange={e=>setMovementForm({...movementForm,type:e.target.value})} className="border p-1"><option value="extra">extra</option><option value="falta">falta</option><option value="adicional_noturno">adicional_noturno</option><option value="adicional_periculosidade">adicional_periculosidade</option><option value="compensacao">compensacao</option><option value="ajuste">ajuste</option><option value="feriado">feriado</option><option value="outro">outro</option></select>
                <input value={movementForm.quantity} onChange={e=>setMovementForm({...movementForm,quantity:e.target.value})} type="number" step="0.1" placeholder="qtd -24..24" className="border p-1" />
                <input value={movementForm.rule_id} onChange={e=>setMovementForm({...movementForm,rule_id:e.target.value})} placeholder="rule_id aprovado" className="border p-1" />
                <input value={movementForm.reason} onChange={e=>setMovementForm({...movementForm,reason:e.target.value})} placeholder="motivo max1000" className="border p-1 col-span-2" />
              </div>
              <button onClick={createMovement} className="bg-black text-white px-2 py-1">criar movimento banco horas regra validada</button>
              <div className="max-h-20 overflow-auto border divide-y mt-1">
                {movements.map(m=>(
                  <div key={m.id} className="p-1">{m.employee_id.slice(0,8)} bank {m.hour_bank_id.slice(0,8)} {m.movement_date?.slice(0,10)} {m.type} {m.quantity}h rule v{(m as any).rule_version||'-'} {m.reason||''}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      {msg && <div className="text-xs text-blue-700">{msg}</div>}
    </div>
  );
}
