"use client";
import { useEffect, useState } from "react";

type CovReq = { id: string; post_id: string; gap_id: string | null; status: string; requested_at: string; responsible_name: string | null; decision_by: string | null; is_human_decision: boolean };
type Cand = { id: string; coverage_request_id: string; employee_id: string; availability_status: string; qualification_match: boolean; distance_km: string | null; score: string | null; is_selected: boolean };
type CovComm = { id: string; coverage_request_id: string; recipient_type: string; channel: string; message: string; sent_at: string; is_confirmed: boolean };
type Handover = { id: string; protocol: string; from_post_id: string | null; from_employee_id: string; to_employee_id: string | null; handover_date: string; status: string; escalation_level: number; is_private: boolean };
type Occ = { id: string; protocol: string; post_id: string | null; category: string; severity: string; title: string; description: string; occurred_at: string; status: string; is_private: boolean; is_personal_data_restricted: boolean; retification_count: number };
type CheckTpl = { id: string; title: string; version: number; service_type: string | null; frequency: string; is_mandatory: boolean; status: string; is_active: boolean };
type CheckInst = { id: string; template_id: string; post_id: string | null; employee_id: string | null; scheduled_date: string; status: string; score: string | null };
type CheckItem = { id: string; instance_id: string; item_description: string; is_required: boolean; is_checked: boolean; evidence_url: string | null };

export default function OpsAdvancedClient() {
  const [covReqs, setCovReqs] = useState<CovReq[]>([]);
  const [cands, setCands] = useState<Cand[]>([]);
  const [comms, setComms] = useState<CovComm[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [occs, setOccs] = useState<Occ[]>([]);
  const [tpls, setTpls] = useState<CheckTpl[]>([]);
  const [insts, setInsts] = useState<CheckInst[]>([]);
  const [items, setItems] = useState<CheckItem[]>([]);
  const [msg, setMsg] = useState("");

  const [covForm, setCovForm] = useState({ post_id: "", gap_id: "", absence_id: "", responsible_name: "" });
  const [candForm, setCandForm] = useState({ coverage_request_id: "", employee_id: "", availability_status: "disponivel", distance_km: "", score: "" });
  const [commForm, setCommForm] = useState({ coverage_request_id: "", recipient_type: "employee", channel: "sistema", message: "", recipient_name: "" });
  const [handoverForm, setHandoverForm] = useState({ from_post_id: "", from_employee_id: "", to_employee_id: "", pending_tasks: "", occurrences_summary: "" });
  const [occForm, setOccForm] = useState({ post_id: "", employee_id: "", category: "operacional", severity: "media", title: "", description: "", location: "" });
  const [tplForm, setTplForm] = useState({ title: "", service_type: "portaria", frequency: "diaria", is_mandatory: true, description: "", required_items: '[{"desc":"Chaves conferidas","required":true},{"desc":"Rádio testado","required":true}]' });
  const [instForm, setInstForm] = useState({ template_id: "", post_id: "", employee_id: "", scheduled_date: "" });
  const [itemCheck, setItemCheck] = useState({ id: "", is_checked: true, evidence_url: "" });

  async function api(path: string, opts?: any) {
    const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  async function loadAll() {
    try {
      const [cr, ca, cc, ho, ob, ct, ci] = await Promise.all([
        api('/api/hr/ops-coverage-requests').catch(() => ({ requests: [] })),
        api('/api/hr/ops-substitution-candidates').catch(() => ({ candidates: [] })),
        api('/api/hr/ops-handovers').catch(() => ({ handovers: [] })),
        api('/api/hr/ops-occurrence-book').catch(() => ({ occurrences: [] })),
        api('/api/hr/ops-checklist-templates').catch(() => ({ templates: [] })),
        api('/api/hr/ops-checklist-instances').catch(() => ({ instances: [] })),
        api('/api/hr/ops-work-rules').catch(() => ({ rules: [] })),
      ]);
      setCovReqs(cr.requests || []); setCands(ca.candidates || []); setHandovers(cc.handovers || []); setOccs(ho.occurrences || []); setTpls(ob.templates || []); setInsts(ct.instances || []);
    } catch (e: any) { setMsg(e.message); }
  }

  useEffect(() => { loadAll(); }, []);

  async function createCovReq() {
    try { await api('/api/hr/ops-coverage-requests', { method: 'POST', body: JSON.stringify(covForm) }); setMsg(`Cobertura criada posto ${covForm.post_id.slice(0,8)} ausência abre pendência`); loadAll(); } catch (e: any) { setMsg(e.message); }
  }
  async function approveCovReq(id: string) {
    try { await api('/api/hr/ops-coverage-requests', { method: 'PATCH', body: JSON.stringify({ id, status: 'aprovado', decision_by: 'supervisor', decision_reason: 'Candidato qualificado aprovado decisão humana' }) }); setMsg(`Cobertura ${id.slice(0,8)} aprovada decisão humana`); loadAll(); } catch (e: any) { setMsg(e.message); }
  }
  async function createCand() {
    try { await api('/api/hr/ops-substitution-candidates', { method: 'POST', body: JSON.stringify({ coverage_request_id: candForm.coverage_request_id, employee_id: candForm.employee_id, availability_status: candForm.availability_status, distance_km: candForm.distance_km ? Number(candForm.distance_km) : null, score: candForm.score ? Number(candForm.score) : null }) }); setMsg(`Candidato ${candForm.employee_id.slice(0,8)} disponibilidade ${candForm.availability_status} qualificação verificada`); loadAll(); } catch (e: any) { setMsg(e.message); }
  }
  async function selectCand(id: string) {
    try { await api('/api/hr/ops-substitution-candidates', { method: 'PATCH', body: JSON.stringify({ id, is_selected: true }) }); setMsg(`Candidato ${id.slice(0,8)} selecionado decisão humana`); loadAll(); } catch (e: any) { setMsg(e.message); }
  }
  async function createComm() {
    try { await api('/api/hr/ops-coverage-communications', { method: 'POST', body: JSON.stringify(commForm) }); setMsg(`Comunicação cobertura enviada ${commForm.channel} para ${commForm.recipient_type}`); loadAll(); } catch (e: any) { setMsg(e.message); }
  }
  async function createHandover() {
    try { await api('/api/hr/ops-handovers', { method: 'POST', body: JSON.stringify(handoverForm) }); setMsg(`Passagem plantão criada origem ${handoverForm.from_employee_id.slice(0,8)} destino ${handoverForm.to_employee_id.slice(0,8)} pendências`); loadAll(); } catch (e: any) { setMsg(e.message); }
  }
  async function acceptHandover(id: string) { try { await api('/api/hr/ops-handovers', { method: 'PATCH', body: JSON.stringify({ id, status: 'aceito' }) }); setMsg(`Passagem ${id.slice(0,8)} aceita`); loadAll(); } catch (e: any) { setMsg(e.message); } }
  async function escalateHandover(id: string) { try { await api('/api/hr/ops-handovers', { method: 'PATCH', body: JSON.stringify({ id, status: 'escalonado', reason: 'Não aceite em 30min, escalonado supervisor', escalated_to: 'supervisor' }) }); setMsg(`Passagem ${id.slice(0,8)} escalonada não aceite`); loadAll(); } catch (e: any) { setMsg(e.message); } }
  async function createOcc() {
    try { await api('/api/hr/ops-occurrence-book', { method: 'POST', body: JSON.stringify(occForm) }); setMsg(`Ocorrência criada ${occForm.title} categoria ${occForm.category} severidade ${occForm.severity} privada`); loadAll(); } catch (e: any) { setMsg(e.message); }
  }
  async function resolveOcc(id: string) { try { await api('/api/hr/ops-occurrence-book', { method: 'PATCH', body: JSON.stringify({ id, status: 'resolvido', resolution_notes: 'Resolvido com ação corretiva' }) }); setMsg(`Ocorrência ${id.slice(0,8)} resolvida`); loadAll(); } catch (e: any) { setMsg(e.message); } }
  async function retifyOcc(id: string) { try { await api('/api/hr/ops-occurrence-book', { method: 'PATCH', body: JSON.stringify({ id, status: 'retificado', description: 'Descrição retificada com correção ortográfica', reason: 'Retificação ortográfica', is_retification: true }) }); setMsg(`Ocorrência ${id.slice(0,8)} retificada histórico imutável`); loadAll(); } catch (e: any) { setMsg(e.message); } }
  async function createTpl() {
    try {
      const required_items = JSON.parse(tplForm.required_items || '[]');
      await api('/api/hr/ops-checklist-templates', { method: 'POST', body: JSON.stringify({ title: tplForm.title, service_type: tplForm.service_type, frequency: tplForm.frequency, is_mandatory: tplForm.is_mandatory, description: tplForm.description, required_items }) });
      setMsg(`Checklist template criado ${tplForm.title} v auto itens obrigatórios`); loadAll();
    } catch (e: any) { setMsg(e.message); }
  }
  async function createInst() {
    try { await api('/api/hr/ops-checklist-instances', { method: 'POST', body: JSON.stringify(instForm) }); setMsg(`Instância checklist criada template ${instForm.template_id.slice(0,8)} posto ${instForm.post_id.slice(0,8)} data ${instForm.scheduled_date} itens obrigatórios gerados`); loadAll(); } catch (e: any) { setMsg(e.message); }
  }
  async function loadItems(instance_id: string) {
    try { const j = await api(`/api/hr/ops-checklist-items?instance_id=${instance_id}`); setItems(j.items || []); setMsg(`Itens carregados inst ${instance_id.slice(0,8)} evidências proporcionais`); } catch (e: any) { setMsg(e.message); }
  }
  async function checkItem() {
    try { await api('/api/hr/ops-checklist-items', { method: 'PATCH', body: JSON.stringify({ id: itemCheck.id, is_checked: itemCheck.is_checked, evidence_url: itemCheck.evidence_url }) }); setMsg(`Item ${itemCheck.id.slice(0,8)} checked ${itemCheck.is_checked} evidência ${itemCheck.evidence_url ? 'com' : 'sem'} - se todos obrigatórios checked instancia concluida`); } catch (e: any) { setMsg(e.message); }
  }

  return (
    <section style={{ marginTop: 32, padding: 16, border: '2px solid #065f46', borderRadius: 8 }}>
      <h2>OPS-05/06/07/08 — Cobertura, Passagem, Ocorrências, Checklists</h2>
      <p style={{ fontSize: 13, background: '#ecfdf5', padding: 8 }}>
        OPS-05: ausência abre pendência cobertura, candidatos substituição disponibilidade/qualificação decisão humana comunicação.<br/>
        OPS-06: passagem plantão origem/destino pendências aceite escalonamento não aceite.<br/>
        OPS-07: livro ocorrências categoria/severidade responsável ações encerramento evidências privadas histórico imutável retificação.<br/>
        OPS-08: checklists por serviço/cliente versão frequência itens obrigatórios evidências proporcionais.
      </p>
      {msg && <div style={{ padding: 8, background: '#fef3c7', margin: '8px 0', fontSize: 13 }}>{msg}</div>}

      <h3>OPS-05 Cobertura (ausência → pendência)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input placeholder="post_id UUID ops_posts" value={covForm.post_id} onChange={e=>setCovForm({...covForm,post_id:e.target.value})} />
        <input placeholder="gap_id UUID ops_coverage_gaps" value={covForm.gap_id} onChange={e=>setCovForm({...covForm,gap_id:e.target.value})} />
        <input placeholder="absence_id UUID hr_absences" value={covForm.absence_id} onChange={e=>setCovForm({...covForm,absence_id:e.target.value})} />
        <input placeholder="responsible_name" value={covForm.responsible_name} onChange={e=>setCovForm({...covForm,responsible_name:e.target.value})} />
        <button onClick={createCovReq}>Criar pendência cobertura (ausência abre)</button>
      </div>
      <div style={{ maxHeight: 100, overflow: 'auto', fontSize: 12, background: '#f8fafc', padding: 8 }}>
        {covReqs.map(r=><div key={r.id}>{r.id.slice(0,8)} posto {r.post_id.slice(0,6)} status {r.status} solicitado {new Date(r.requested_at).toLocaleString("pt-BR")} resp {r.responsible_name||'-'} decisão_humana={String(r.is_human_decision)} decisão_por {r.decision_by||'-'} <button onClick={()=>approveCovReq(r.id)}>Aprovar decisão humana</button></div>)}
      </div>

      <h4>Candidatos Substituição (disponibilidade/qualificação)</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input placeholder="coverage_request_id UUID" value={candForm.coverage_request_id} onChange={e=>setCandForm({...candForm,coverage_request_id:e.target.value})} />
        <input placeholder="employee_id UUID" value={candForm.employee_id} onChange={e=>setCandForm({...candForm,employee_id:e.target.value})} />
        <select value={candForm.availability_status} onChange={e=>setCandForm({...candForm,availability_status:e.target.value})}><option value="disponivel">disponivel</option><option value="indisponivel">indisponivel</option><option value="em_validacao">em_validacao</option><option value="em_descanso">em_descanso</option><option value="em_outro_posto">em_outro_posto</option></select>
        <input placeholder="distância km" value={candForm.distance_km} onChange={e=>setCandForm({...candForm,distance_km:e.target.value})} />
        <input placeholder="score 0-100" value={candForm.score} onChange={e=>setCandForm({...candForm,score:e.target.value})} />
        <button onClick={createCand}>Adicionar candidato (disponibilidade/qualificação)</button>
      </div>
      <div style={{ maxHeight: 100, overflow: 'auto', fontSize: 12, background: '#f0fdf4', padding: 8 }}>
        {cands.map(c=><div key={c.id}>req {c.coverage_request_id.slice(0,6)} emp {c.employee_id.slice(0,6)} disp {c.availability_status} qual_match={String(c.qualification_match)} dist {c.distance_km}km score {c.score} selecionado={String(c.is_selected)} <button onClick={()=>selectCand(c.id)}>Selecionar decisão humana</button></div>)}
      </div>

      <h4>Comunicação Cobertura</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input placeholder="coverage_request_id UUID" value={commForm.coverage_request_id} onChange={e=>setCommForm({...commForm,coverage_request_id:e.target.value})} />
        <select value={commForm.recipient_type} onChange={e=>setCommForm({...commForm,recipient_type:e.target.value})}><option value="employee">employee</option><option value="supervisor">supervisor</option><option value="rh">rh</option><option value="outro">outro</option></select>
        <select value={commForm.channel} onChange={e=>setCommForm({...commForm,channel:e.target.value})}><option value="sistema">sistema</option><option value="email">email</option><option value="whatsapp">whatsapp</option><option value="outro">outro</option></select>
        <input placeholder="recipient_name" value={commForm.recipient_name} onChange={e=>setCommForm({...commForm,recipient_name:e.target.value})} />
        <input placeholder="mensagem 10-2000 decisão humana" value={commForm.message} onChange={e=>setCommForm({...commForm,message:e.target.value})} style={{ gridColumn: 'span 2' }} />
        <button onClick={createComm}>Enviar comunicação cobertura</button>
      </div>

      <h3>OPS-06 Passagem Plantão (origem/destino pendências aceite escalonamento não aceite)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input placeholder="from_post_id UUID" value={handoverForm.from_post_id} onChange={e=>setHandoverForm({...handoverForm,from_post_id:e.target.value})} />
        <input placeholder="from_employee_id UUID" value={handoverForm.from_employee_id} onChange={e=>setHandoverForm({...handoverForm,from_employee_id:e.target.value})} />
        <input placeholder="to_employee_id UUID" value={handoverForm.to_employee_id} onChange={e=>setHandoverForm({...handoverForm,to_employee_id:e.target.value})} />
        <input placeholder="pendências" value={handoverForm.pending_tasks} onChange={e=>setHandoverForm({...handoverForm,pending_tasks:e.target.value})} />
        <input placeholder="ocorrências resumo" value={handoverForm.occurrences_summary} onChange={e=>setHandoverForm({...handoverForm,occurrences_summary:e.target.value})} />
        <button onClick={createHandover}>Criar passagem plantão</button>
      </div>
      <div style={{ maxHeight: 100, overflow: 'auto', fontSize: 12, background: '#f8fafc', padding: 8 }}>
        {handovers.map(h=><div key={h.id}>{h.protocol} posto {h.from_post_id?.slice(0,6)||'-'} de {h.from_employee_id.slice(0,6)} para {h.to_employee_id?.slice(0,6)||'-'} data {new Date(h.handover_date).toLocaleString("pt-BR")} status {h.status} esc_level {h.escalation_level} privada={String(h.is_private)} <button onClick={()=>acceptHandover(h.id)}>Aceite</button><button onClick={()=>escalateHandover(h.id)} style={{ marginLeft: 4 }}>Escalonar não aceite</button></div>)}
      </div>

      <h3>OPS-07 Livro Ocorrências (categoria/severidade responsável ações encerramento evidências privadas histórico imutável retificação)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input placeholder="post_id UUID" value={occForm.post_id} onChange={e=>setOccForm({...occForm,post_id:e.target.value})} />
        <input placeholder="employee_id UUID" value={occForm.employee_id} onChange={e=>setOccForm({...occForm,employee_id:e.target.value})} />
        <select value={occForm.category} onChange={e=>setOccForm({...occForm,category:e.target.value})}><option value="seguranca">seguranca</option><option value="operacional">operacional</option><option value="manutencao">manutencao</option><option value="limpeza">limpeza</option><option value="comportamental">comportamental</option><option value="cliente">cliente</option><option value="equipamento">equipamento</option><option value="acesso">acesso</option><option value="outro">outro</option></select>
        <select value={occForm.severity} onChange={e=>setOccForm({...occForm,severity:e.target.value})}><option value="baixa">baixa</option><option value="media">media</option><option value="alta">alta</option><option value="critica">critica</option></select>
        <input placeholder="título 5-200" value={occForm.title} onChange={e=>setOccForm({...occForm,title:e.target.value})} />
        <input placeholder="descrição 10-5000" value={occForm.description} onChange={e=>setOccForm({...occForm,description:e.target.value})} style={{ gridColumn: 'span 2' }} />
        <input placeholder="local" value={occForm.location} onChange={e=>setOccForm({...occForm,location:e.target.value})} />
        <button onClick={createOcc}>Registrar ocorrência privada</button>
      </div>
      <div style={{ maxHeight: 120, overflow: 'auto', fontSize: 12, background: '#fef2f2', padding: 8 }}>
        {occs.map(o=><div key={o.id}>{o.protocol} posto {o.post_id?.slice(0,6)||'-'} cat {o.category} sev {o.severity} título {o.title.slice(0,40)} status {o.status} privada={String(o.is_private)} restrita={String(o.is_personal_data_restricted)} retif {o.retification_count} <button onClick={()=>resolveOcc(o.id)}>Resolver</button><button onClick={()=>retifyOcc(o.id)} style={{ marginLeft: 4 }}>Retificar histórico imutável</button></div>)}
      </div>

      <h3>OPS-08 Checklists por serviço/cliente versão frequência itens obrigatórios evidências proporcionais</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input placeholder="título checklist 5-200 Portaria Abertura" value={tplForm.title} onChange={e=>setTplForm({...tplForm,title:e.target.value})} />
        <select value={tplForm.service_type} onChange={e=>setTplForm({...tplForm,service_type:e.target.value})}><option value="portaria">portaria</option><option value="vigilancia">vigilancia</option><option value="limpeza">limpeza</option><option value="zeladoria">zeladoria</option><option value="monitoramento">monitoramento</option><option value="outro">outro</option></select>
        <select value={tplForm.frequency} onChange={e=>setTplForm({...tplForm,frequency:e.target.value})}><option value="diaria">diaria</option><option value="semanal">semanal</option><option value="quinzenal">quinzenal</option><option value="mensal">mensal</option><option value="trimestral">trimestral</option><option value="sob_demanda">sob_demanda</option><option value="por_visita">por_visita</option><option value="outro">outro</option></select>
        <label><input type="checkbox" checked={tplForm.is_mandatory} onChange={e=>setTplForm({...tplForm,is_mandatory:e.target.checked})} /> obrigatório</label>
        <input placeholder="descrição" value={tplForm.description} onChange={e=>setTplForm({...tplForm,description:e.target.value})} style={{ gridColumn: 'span 2' }} />
        <textarea placeholder='required_items JSON [{"desc":"Chaves","required":true}]' value={tplForm.required_items} onChange={e=>setTplForm({...tplForm,required_items:e.target.value})} style={{ gridColumn: 'span 3' }} rows={2} />
        <button onClick={createTpl}>Criar template checklist versionado</button>
      </div>
      <div style={{ maxHeight: 80, overflow: 'auto', fontSize: 12, background: '#f8fafc', padding: 8 }}>{tpls.map(t=><div key={t.id}>[{t.version}] {t.title} service {t.service_type} freq {t.frequency} obrigatório={String(t.is_mandatory)} status {t.status} ativo={String(t.is_active)}</div>)}</div>

      <h4>Instâncias Checklist + Itens + Evidências proporcionais</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input placeholder="template_id UUID" value={instForm.template_id} onChange={e=>setInstForm({...instForm,template_id:e.target.value})} />
        <input placeholder="post_id UUID" value={instForm.post_id} onChange={e=>setInstForm({...instForm,post_id:e.target.value})} />
        <input placeholder="employee_id UUID" value={instForm.employee_id} onChange={e=>setInstForm({...instForm,employee_id:e.target.value})} />
        <input type="date" value={instForm.scheduled_date} onChange={e=>setInstForm({...instForm,scheduled_date:e.target.value})} />
        <button onClick={createInst}>Criar instância checklist (gera itens obrigatórios)</button>
      </div>
      <div style={{ maxHeight: 80, overflow: 'auto', fontSize: 12, background: '#f0fdf4', padding: 8 }}>
        {insts.map(ins=><div key={ins.id}>tpl {ins.template_id.slice(0,6)} posto {ins.post_id?.slice(0,6)||'-'} emp {ins.employee_id?.slice(0,6)||'-'} data {ins.scheduled_date} status {ins.status} score {ins.score||'-'} <button onClick={()=>loadItems(ins.id)}>Ver itens</button></div>)}
      </div>
      <div style={{ maxHeight: 100, overflow: 'auto', fontSize: 12, background: '#f8fafc', padding: 8, marginTop: 8 }}>
        {items.map(it=><div key={it.id}>{it.item_description} obrigatório={String(it.is_required)} checked={String(it.is_checked)} evidência={it.evidence_url ? 'com' : 'sem'} {it.evidence_url?.slice(0,40)}</div>)}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input placeholder="item id UUID" value={itemCheck.id} onChange={e=>setItemCheck({...itemCheck,id:e.target.value})} />
          <label><input type="checkbox" checked={itemCheck.is_checked} onChange={e=>setItemCheck({...itemCheck,is_checked:e.target.checked})} /> checked</label>
          <input placeholder="evidence_url" value={itemCheck.evidence_url} onChange={e=>setItemCheck({...itemCheck,evidence_url:e.target.value})} />
          <button onClick={checkItem}>Marcar item + evidência proporcional</button>
        </div>
      </div>
    </section>
  );
}
