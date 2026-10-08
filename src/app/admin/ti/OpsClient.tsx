"use client";
import { useEffect, useState } from "react";

type JobRole = { id: string; name: string; role_type: string; description: string | null; is_active: boolean };
type Post = { id: string; company_id: string | null; unit_id: string | null; name: string; location: string | null; post_type: string; is_active: boolean };
type ShiftTpl = { id: string; name: string; shift_type: string; start_time: string; end_time: string; duration_hours: string };
type Need = { id: string; post_id: string; shift_template_id: string; role_id: string | null; day_of_week: number | null; required_headcount: number };
type Alloc = { id: string; post_id: string; employee_id: string; shift_template_id: string; role_id: string | null; allocation_date: string; status: string };
type Dim = { id: string; post_id: string; company_id: string | null; period_start: string; period_end: string; contracted_headcount: number; planned_headcount: number; realized_headcount: number; coverage_hours_required: string; coverage_hours_realized: string; coverage_percent: string; status: string };
type Gap = { id: string; post_id: string; gap_date: string; gap_start: string; gap_end: string; uncovered_minutes: number; reason: string | null; status: string };
type SchedVer = { id: string; company_id: string | null; version: number; status: string; valid_from: string; valid_to: string; published_at: string | null };
type SchedEntry = { id: string; version_id: string; post_id: string; employee_id: string; shift_template_id: string; entry_date: string; status: string };
type Ack = { id: string; version_id: string; employee_id: string; acknowledged_at: string };
type WorkRule = { id: string; name: string; max_daily_hours: string; min_rest_hours: string; max_consecutive_days: number; max_weekly_hours: string; is_approved: boolean; is_active: boolean };
type Qual = { id: string; employee_id: string; role_id: string | null; certification_type: string; valid_until: string | null; is_valid: boolean };
type Validation = { id: string; version_id: string | null; entry_id: string | null; employee_id: string | null; validation_type: string; is_valid: boolean; conflict_details: any; validated_at: string };

export default function OpsClient() {
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [shifts, setShifts] = useState<ShiftTpl[]>([]);
  const [needs, setNeeds] = useState<Need[]>([]);
  const [allocs, setAllocs] = useState<Alloc[]>([]);
  const [dims, setDims] = useState<Dim[]>([]);
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [versions, setVersions] = useState<SchedVer[]>([]);
  const [entries, setEntries] = useState<SchedEntry[]>([]);
  const [acks, setAcks] = useState<Ack[]>([]);
  const [rules, setRules] = useState<WorkRule[]>([]);
  const [quals, setQuals] = useState<Qual[]>([]);
  const [validations, setValidations] = useState<Validation[]>([]);
  const [msg, setMsg] = useState("");

  const [roleForm, setRoleForm] = useState({ name: "", role_type: "funcao", description: "" });
  const [postForm, setPostForm] = useState({ name: "", company_id: "", unit_id: "", post_type: "portaria", location: "" });
  const [allocForm, setAllocForm] = useState({ post_id: "", employee_id: "", shift_template_id: "", role_id: "", allocation_date: "" });
  const [dimForm, setDimForm] = useState({ post_id: "", company_id: "", period_start: "", period_end: "", contracted_headcount: 5, planned_headcount: 5, realized_headcount: 4, coverage_hours_required: 720, coverage_hours_realized: 680 });
  const [gapForm, setGapForm] = useState({ post_id: "", gap_date: "", gap_start: "", gap_end: "", uncovered_minutes: 60, reason: "" });
  const [verForm, setVerForm] = useState({ company_id: "", unit_id: "", valid_from: "", valid_to: "" });
  const [entryForm, setEntryForm] = useState({ version_id: "", post_id: "", employee_id: "", shift_template_id: "", role_id: "", entry_date: "" });
  const [ackForm, setAckForm] = useState({ version_id: "", employee_id: "" });
  const [ruleForm, setRuleForm] = useState({ name: "", description: "", max_daily_hours: 8, min_rest_hours: 11, max_consecutive_days: 6, max_weekly_hours: 44 });
  const [qualForm, setQualForm] = useState({ employee_id: "", role_id: "", certification_type: "CNV", valid_until: "" });

  async function api(path: string, opts?: any) {
    const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  async function loadAll() {
    try {
      const [jr, p, st, pn, al, d, g, v, e, ak, wr, q, va] = await Promise.all([
        api('/api/hr/ops-job-roles').catch(() => ({ roles: [] })),
        api('/api/hr/ops-posts?limit=100').catch(() => ({ posts: [] })),
        api('/api/hr/ops-shift-templates').catch(() => ({ templates: [] })),
        api('/api/hr/ops-post-shift-needs').catch(() => ({ needs: [] })),
        api('/api/hr/ops-allocations').catch(() => ({ allocations: [] })),
        api('/api/hr/ops-dimensioning').catch(() => ({ dimensionings: [] })),
        api('/api/hr/ops-coverage-gaps').catch(() => ({ gaps: [] })),
        api('/api/hr/ops-schedule-versions').catch(() => ({ versions: [] })),
        api('/api/hr/ops-schedule-entries').catch(() => ({ entries: [] })),
        api('/api/hr/ops-schedule-acks').catch(() => ({ acknowledgments: [] })),
        api('/api/hr/ops-work-rules').catch(() => ({ rules: [] })),
        api('/api/hr/ops-qualifications').catch(() => ({ qualifications: [] })),
        api('/api/hr/ops-validations?is_valid=false').catch(() => ({ validations: [] })),
      ]);
      setRoles(jr.roles || []); setPosts(p.posts || []); setShifts(st.templates || []); setNeeds(pn.needs || []); setAllocs(al.allocations || []);
      setDims(d.dimensionings || []); setGaps(g.gaps || []); setVersions(v.versions || []); setEntries(e.entries || []); setAcks(ak.acknowledgments || []);
      setRules(wr.rules || []); setQuals(q.qualifications || []); setValidations(va.validations || []);
    } catch (e: any) { setMsg(e.message); }
  }

  useEffect(() => { loadAll(); }, []);

  async function createRole() {
    try { await api('/api/hr/ops-job-roles', { method: 'POST', body: JSON.stringify(roleForm) }); setMsg(`Cargo/função criado ${roleForm.name} tipo ${roleForm.role_type} entidade própria`); setRoleForm({ name: "", role_type: "funcao", description: "" }); loadAll(); } catch (e: any) { setMsg(e.message); }
  }
  async function createPost() {
    try { await api('/api/hr/ops-posts', { method: 'POST', body: JSON.stringify(postForm) }); setMsg(`Posto físico criado ${postForm.name} cliente->unidade->posto`); setPostForm({ name: "", company_id: "", unit_id: "", post_type: "portaria", location: "" }); loadAll(); } catch (e: any) { setMsg(e.message); }
  }
  async function createAlloc() {
    try { await api('/api/hr/ops-allocations', { method: 'POST', body: JSON.stringify(allocForm) }); setMsg(`Alocação criada posto ${allocForm.post_id.slice(0,8)} emp ${allocForm.employee_id.slice(0,8)} data ${allocForm.allocation_date} validada sobreposição/habilitação`); loadAll(); } catch (e: any) { setMsg(e.message); }
  }
  async function createDim() {
    try { await api('/api/hr/ops-dimensioning', { method: 'POST', body: JSON.stringify(dimForm) }); setMsg(`Dimensionamento criado contratado ${dimForm.contracted_headcount} planejado ${dimForm.planned_headcount} realizado ${dimForm.realized_headcount} cobertura ${dimForm.coverage_hours_required}h req ${dimForm.coverage_hours_realized}h real`); loadAll(); } catch (e: any) { setMsg(e.message); }
  }
  async function createGap() {
    try {
      const gap_start = gapForm.gap_start ? new Date(gapForm.gap_start).toISOString() : new Date().toISOString();
      const gap_end = gapForm.gap_end ? new Date(gapForm.gap_end).toISOString() : new Date(Date.now()+60*60*1000).toISOString();
      await api('/api/hr/ops-coverage-gaps', { method: 'POST', body: JSON.stringify({ post_id: gapForm.post_id, gap_date: gapForm.gap_date, gap_start, gap_end, uncovered_minutes: gapForm.uncovered_minutes, reason: gapForm.reason }) });
      setMsg(`Gap cobertura criado posto ${gapForm.post_id.slice(0,8)} descoberto ${gapForm.uncovered_minutes}min`); loadAll();
    } catch (e: any) { setMsg(e.message); }
  }
  async function createVersion() {
    try { await api('/api/hr/ops-schedule-versions', { method: 'POST', body: JSON.stringify(verForm) }); setMsg(`Versão escala criada validade ${verForm.valid_from} a ${verForm.valid_to} status rascunho histórico`); loadAll(); } catch (e: any) { setMsg(e.message); }
  }
  async function publishVersion(id: string) {
    try { await api('/api/hr/ops-schedule-versions', { method: 'PATCH', body: JSON.stringify({ id, status: 'publicada', reason: 'Publicação autorizada após validação regras' }) }); setMsg(`Versão ${id.slice(0,8)} publicada histórico registrado`); loadAll(); } catch (e: any) { setMsg(e.message); }
  }
  async function createEntry() {
    try { await api('/api/hr/ops-schedule-entries', { method: 'POST', body: JSON.stringify(entryForm) }); setMsg(`Entrada escala criada versão ${entryForm.version_id.slice(0,8)} posto ${entryForm.post_id.slice(0,8)} emp ${entryForm.employee_id.slice(0,8)} data ${entryForm.entry_date} validada sobreposição/indisponibilidade`); loadAll(); } catch (e: any) { setMsg(e.message); }
  }
  async function createAck() {
    try { await api('/api/hr/ops-schedule-acks', { method: 'POST', body: JSON.stringify(ackForm) }); setMsg(`Ciência escala registrada versão ${ackForm.version_id.slice(0,8)} emp ${ackForm.employee_id.slice(0,8)}`); loadAll(); } catch (e: any) { setMsg(e.message); }
  }
  async function createRule() {
    try { await api('/api/hr/ops-work-rules', { method: 'POST', body: JSON.stringify({ ...ruleForm, is_approved: true }) }); setMsg(`Regra jornada/descanso criada ${ruleForm.name} aprovada ${ruleForm.max_daily_hours}h dia ${ruleForm.min_rest_hours}h descanso`); loadAll(); } catch (e: any) { setMsg(e.message); }
  }
  async function createQual() {
    try { await api('/api/hr/ops-qualifications', { method: 'POST', body: JSON.stringify(qualForm) }); setMsg(`Qualificação criada emp ${qualForm.employee_id.slice(0,8)} cert ${qualForm.certification_type} válida`); loadAll(); } catch (e: any) { setMsg(e.message); }
  }

  return (
    <section style={{ marginTop: 32, padding: 16, border: '2px solid #065f46', borderRadius: 8 }}>
      <h2>OPS-01/02/03/04 — Estrutura, Dimensionamento, Escala, Validação</h2>
      <p style={{ fontSize: 13, background: '#ecfdf5', padding: 8 }}>
        OPS-01: cliente → unidade → posto físico → necessidade por turno → alocação; cargo/função entidade própria ops_job_roles type cargo/funcao.<br/>
        OPS-02: dimensionamento contratado vs planejado vs realizado, cobertura horas req vs real, gaps tempo descoberto.<br/>
        OPS-03: escala rascunho/publicada/revisada validade histórico calendário por posto/equipe/pessoa e ciência versão.<br/>
        OPS-04: validar sobreposição, indisponibilidade, habilitação, documentação e regras jornada/descanso configuradas e aprovadas.
      </p>
      {msg && <div style={{ padding: 8, background: '#fef3c7', margin: '8px 0', fontSize: 13 }}>{msg}</div>}

      <h3>OPS-01 Cargo/Função entidade própria</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input placeholder="nome 3-100 Vigilante/Porteiro/Ronda" value={roleForm.name} onChange={e=>setRoleForm({...roleForm,name:e.target.value})} />
        <select value={roleForm.role_type} onChange={e=>setRoleForm({...roleForm,role_type:e.target.value})}><option value="cargo">cargo</option><option value="funcao">funcao</option></select>
        <input placeholder="descrição" value={roleForm.description} onChange={e=>setRoleForm({...roleForm,description:e.target.value})} />
        <button onClick={createRole}>Criar cargo/função</button>
      </div>
      <div style={{ maxHeight: 100, overflow: 'auto', fontSize: 12, background: '#f8fafc', padding: 8 }}>{roles.map(r=><div key={r.id}>[{r.role_type}] {r.name} ativo={String(r.is_active)} - {r.description?.slice(0,60)}</div>)}</div>

      <h3>OPS-01 Posto Físico (cliente → unidade → posto)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input placeholder="nome posto 3-200 Portaria Central" value={postForm.name} onChange={e=>setPostForm({...postForm,name:e.target.value})} />
        <input placeholder="company_id UUID crm_companies" value={postForm.company_id} onChange={e=>setPostForm({...postForm,company_id:e.target.value})} />
        <input placeholder="unit_id UUID crm_company_units" value={postForm.unit_id} onChange={e=>setPostForm({...postForm,unit_id:e.target.value})} />
        <select value={postForm.post_type} onChange={e=>setPostForm({...postForm,post_type:e.target.value})}><option value="portaria">portaria</option><option value="vigilancia">vigilancia</option><option value="limpeza">limpeza</option><option value="zeladoria">zeladoria</option><option value="recepcao">recepcao</option><option value="monitoramento">monitoramento</option><option value="manutencao">manutencao</option><option value="outro">outro</option></select>
        <input placeholder="localização" value={postForm.location} onChange={e=>setPostForm({...postForm,location:e.target.value})} />
        <button onClick={createPost}>Criar posto físico</button>
      </div>
      <div style={{ maxHeight: 100, overflow: 'auto', fontSize: 12, background: '#f8fafc', padding: 8 }}>{posts.map(p=><div key={p.id}>{p.name} type={p.post_type} company={p.company_id?.slice(0,8)||'-'} unit={p.unit_id?.slice(0,8)||'-'} ativo={String(p.is_active)}</div>)}</div>

      <h4>Turnos e Necessidades</h4>
      <div style={{ maxHeight: 80, overflow: 'auto', fontSize: 12, background: '#f0f9ff', padding: 8 }}>
        Turnos: {shifts.map(s=><span key={s.id} style={{ marginRight: 8 }}>{s.name} {s.shift_type} {s.start_time}-{s.end_time} {s.duration_hours}h</span>)}<br/>
        Necessidades: {needs.map(n=><span key={n.id} style={{ marginRight: 8 }}>posto {n.post_id.slice(0,6)} turno {n.shift_template_id.slice(0,6)} dia {n.day_of_week} req {n.required_headcount}</span>)}
      </div>

      <h3>OPS-01 Alocação (validada sobreposição/habilitação)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input placeholder="post_id UUID ops_posts" value={allocForm.post_id} onChange={e=>setAllocForm({...allocForm,post_id:e.target.value})} />
        <input placeholder="employee_id UUID hr_employees" value={allocForm.employee_id} onChange={e=>setAllocForm({...allocForm,employee_id:e.target.value})} />
        <input placeholder="shift_template_id UUID" value={allocForm.shift_template_id} onChange={e=>setAllocForm({...allocForm,shift_template_id:e.target.value})} />
        <input placeholder="role_id UUID ops_job_roles" value={allocForm.role_id} onChange={e=>setAllocForm({...allocForm,role_id:e.target.value})} />
        <input type="date" value={allocForm.allocation_date} onChange={e=>setAllocForm({...allocForm,allocation_date:e.target.value})} />
        <button onClick={createAlloc}>Criar alocação (valida sobreposição/habilitação)</button>
      </div>
      <div style={{ maxHeight: 100, overflow: 'auto', fontSize: 12, background: '#f8fafc', padding: 8 }}>{allocs.map(a=><div key={a.id}>posto {a.post_id.slice(0,6)} emp {a.employee_id.slice(0,6)} data {a.allocation_date} turno {a.shift_template_id.slice(0,6)} role {a.role_id?.slice(0,6)||'-'} status {a.status}</div>)}</div>

      <h3>OPS-02 Dimensionamento contratado vs planejado vs realizado</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input placeholder="post_id UUID" value={dimForm.post_id} onChange={e=>setDimForm({...dimForm,post_id:e.target.value})} />
        <input placeholder="company_id UUID" value={dimForm.company_id} onChange={e=>setDimForm({...dimForm,company_id:e.target.value})} />
        <input type="date" value={dimForm.period_start} onChange={e=>setDimForm({...dimForm,period_start:e.target.value})} />
        <input type="date" value={dimForm.period_end} onChange={e=>setDimForm({...dimForm,period_end:e.target.value})} />
        <input type="number" placeholder="contratado" value={dimForm.contracted_headcount} onChange={e=>setDimForm({...dimForm,contracted_headcount:Number(e.target.value)})} />
        <input type="number" placeholder="planejado" value={dimForm.planned_headcount} onChange={e=>setDimForm({...dimForm,planned_headcount:Number(e.target.value)})} />
        <input type="number" placeholder="realizado" value={dimForm.realized_headcount} onChange={e=>setDimForm({...dimForm,realized_headcount:Number(e.target.value)})} />
        <input type="number" placeholder="horas req" value={dimForm.coverage_hours_required} onChange={e=>setDimForm({...dimForm,coverage_hours_required:Number(e.target.value)})} />
        <input type="number" placeholder="horas real" value={dimForm.coverage_hours_realized} onChange={e=>setDimForm({...dimForm,coverage_hours_realized:Number(e.target.value)})} />
        <button onClick={createDim}>Criar dimensionamento</button>
      </div>
      <div style={{ maxHeight: 100, overflow: 'auto', fontSize: 12, background: '#f8fafc', padding: 8 }}>{dims.map(d=><div key={d.id}>posto {d.post_id.slice(0,6)} período {d.period_start}→{d.period_end} cont {d.contracted_headcount} plan {d.planned_headcount} real {d.realized_headcount} cobertura {d.coverage_hours_required}h req {d.coverage_hours_realized}h real {d.coverage_percent}% status {d.status}</div>)}</div>

      <h4>Gaps Cobertura (tempo descoberto)</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input placeholder="post_id UUID" value={gapForm.post_id} onChange={e=>setGapForm({...gapForm,post_id:e.target.value})} />
        <input type="date" value={gapForm.gap_date} onChange={e=>setGapForm({...gapForm,gap_date:e.target.value})} />
        <input type="datetime-local" value={gapForm.gap_start} onChange={e=>setGapForm({...gapForm,gap_start:e.target.value})} />
        <input type="datetime-local" value={gapForm.gap_end} onChange={e=>setGapForm({...gapForm,gap_end:e.target.value})} />
        <input type="number" placeholder="minutos descoberto" value={gapForm.uncovered_minutes} onChange={e=>setGapForm({...gapForm,uncovered_minutes:Number(e.target.value)})} />
        <input placeholder="motivo" value={gapForm.reason} onChange={e=>setGapForm({...gapForm,reason:e.target.value})} />
        <button onClick={createGap}>Registrar gap cobertura</button>
      </div>
      <div style={{ maxHeight: 80, overflow: 'auto', fontSize: 12, background: '#fef2f2', padding: 8 }}>{gaps.map(g=><div key={g.id}>posto {g.post_id.slice(0,6)} data {g.gap_date} {new Date(g.gap_start).toLocaleString("pt-BR")}→{new Date(g.gap_end).toLocaleString("pt-BR")} desc {g.uncovered_minutes}min motivo {g.reason?.slice(0,40)} status {g.status}</div>)}</div>

      <h3>OPS-03 Escala rascunho/publicada/revisada validade histórico calendário ciência</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input placeholder="company_id UUID" value={verForm.company_id} onChange={e=>setVerForm({...verForm,company_id:e.target.value})} />
        <input placeholder="unit_id UUID" value={verForm.unit_id} onChange={e=>setVerForm({...verForm,unit_id:e.target.value})} />
        <input type="date" value={verForm.valid_from} onChange={e=>setVerForm({...verForm,valid_from:e.target.value})} />
        <input type="date" value={verForm.valid_to} onChange={e=>setVerForm({...verForm,valid_to:e.target.value})} />
        <button onClick={createVersion}>Criar versão escala (rascunho)</button>
      </div>
      <div style={{ maxHeight: 100, overflow: 'auto', fontSize: 12, background: '#f8fafc', padding: 8 }}>{versions.map(v=><div key={v.id}>v{v.version} company {v.company_id?.slice(0,6)||'-'} status {v.status} validade {v.valid_from}→{v.valid_to} publicada {v.published_at ? new Date(v.published_at).toLocaleString("pt-BR") : '-'} <button onClick={()=>publishVersion(v.id)}>Publicar</button></div>)}</div>

      <h4>Entradas Escala + Ciência</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input placeholder="version_id UUID" value={entryForm.version_id} onChange={e=>setEntryForm({...entryForm,version_id:e.target.value})} />
        <input placeholder="post_id UUID" value={entryForm.post_id} onChange={e=>setEntryForm({...entryForm,post_id:e.target.value})} />
        <input placeholder="employee_id UUID" value={entryForm.employee_id} onChange={e=>setEntryForm({...entryForm,employee_id:e.target.value})} />
        <input placeholder="shift_template_id UUID" value={entryForm.shift_template_id} onChange={e=>setEntryForm({...entryForm,shift_template_id:e.target.value})} />
        <input placeholder="role_id UUID" value={entryForm.role_id} onChange={e=>setEntryForm({...entryForm,role_id:e.target.value})} />
        <input type="date" value={entryForm.entry_date} onChange={e=>setEntryForm({...entryForm,entry_date:e.target.value})} />
        <button onClick={createEntry}>Criar entrada escala (valida sobreposição/indisponibilidade)</button>
      </div>
      <div style={{ maxHeight: 80, overflow: 'auto', fontSize: 12, background: '#f8fafc', padding: 8 }}>{entries.map(en=><div key={en.id}>ver {en.version_id.slice(0,6)} posto {en.post_id.slice(0,6)} emp {en.employee_id.slice(0,6)} data {en.entry_date} turno {en.shift_template_id.slice(0,6)} status {en.status}</div>)}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input placeholder="version_id UUID" value={ackForm.version_id} onChange={e=>setAckForm({...ackForm,version_id:e.target.value})} />
        <input placeholder="employee_id UUID" value={ackForm.employee_id} onChange={e=>setAckForm({...ackForm,employee_id:e.target.value})} />
        <button onClick={createAck}>Registrar ciência versão publicada</button>
      </div>
      <div style={{ maxHeight: 80, overflow: 'auto', fontSize: 12, background: '#f0fdf4', padding: 8 }}>{acks.map(a=><div key={a.id}>ver {a.version_id.slice(0,6)} emp {a.employee_id.slice(0,6)} ciência {new Date(a.acknowledged_at).toLocaleString("pt-BR")}</div>)}</div>

      <h3>OPS-04 Regras jornada/descanso configuradas e aprovadas + Qualificações</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input placeholder="nome regra CLT 44h / 12x36" value={ruleForm.name} onChange={e=>setRuleForm({...ruleForm,name:e.target.value})} />
        <input placeholder="descrição" value={ruleForm.description} onChange={e=>setRuleForm({...ruleForm,description:e.target.value})} />
        <input type="number" placeholder="max diária h" value={ruleForm.max_daily_hours} onChange={e=>setRuleForm({...ruleForm,max_daily_hours:Number(e.target.value)})} />
        <input type="number" placeholder="min descanso h" value={ruleForm.min_rest_hours} onChange={e=>setRuleForm({...ruleForm,min_rest_hours:Number(e.target.value)})} />
        <input type="number" placeholder="max dias consecutivos" value={ruleForm.max_consecutive_days} onChange={e=>setRuleForm({...ruleForm,max_consecutive_days:Number(e.target.value)})} />
        <input type="number" placeholder="max semanal h" value={ruleForm.max_weekly_hours} onChange={e=>setRuleForm({...ruleForm,max_weekly_hours:Number(e.target.value)})} />
        <button onClick={createRule}>Criar regra jornada aprovada</button>
      </div>
      <div style={{ maxHeight: 80, overflow: 'auto', fontSize: 12, background: '#f8fafc', padding: 8 }}>{rules.map(r=><div key={r.id}>{r.name} maxDia {r.max_daily_hours}h minDesc {r.min_rest_hours}h maxConsec {r.max_consecutive_days}d maxSem {r.max_weekly_hours}h aprovada={String(r.is_approved)} ativa={String(r.is_active)}</div>)}</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
        <input placeholder="employee_id UUID" value={qualForm.employee_id} onChange={e=>setQualForm({...qualForm,employee_id:e.target.value})} />
        <input placeholder="role_id UUID" value={qualForm.role_id} onChange={e=>setQualForm({...qualForm,role_id:e.target.value})} />
        <input placeholder="certificação CNV etc" value={qualForm.certification_type} onChange={e=>setQualForm({...qualForm,certification_type:e.target.value})} />
        <input type="date" value={qualForm.valid_until} onChange={e=>setQualForm({...qualForm,valid_until:e.target.value})} />
        <button onClick={createQual}>Criar qualificação habilitação</button>
      </div>
      <div style={{ maxHeight: 80, overflow: 'auto', fontSize: 12, background: '#f8fafc', padding: 8 }}>{quals.map(q=><div key={q.id}>emp {q.employee_id.slice(0,6)} role {q.role_id?.slice(0,6)||'-'} cert {q.certification_type} válida {String(q.is_valid)} até {q.valid_until||'indeterminado'}</div>)}</div>

      <h4>Validações (sobreposição/indisponibilidade/habilitação/documentação/jornada/descanso)</h4>
      <div style={{ maxHeight: 100, overflow: 'auto', fontSize: 12, background: '#fef3c7', padding: 8 }}>
        {validations.map(v=><div key={v.id}>[{v.validation_type}] válida={String(v.is_valid)} emp {v.employee_id?.slice(0,6)||'-'} ver {v.version_id?.slice(0,6)||'-'} entry {v.entry_id?.slice(0,6)||'-'} conflito {JSON.stringify(v.conflict_details).slice(0,120)} em {new Date(v.validated_at).toLocaleString("pt-BR")}</div>)}
        {validations.length===0 && <div>Nenhuma validação falha - sobreposição/indisponibilidade/habilitação OK</div>}
      </div>
    </section>
  );
}
