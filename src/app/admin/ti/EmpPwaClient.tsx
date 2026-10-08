"use client";
import { useEffect, useState } from "react";

type PwaConfig = {
  id: string;
  name: string;
  short_name: string;
  description: string;
  theme_color: string;
  background_color: string;
  display: string;
  scope: string;
  start_url: string;
  icons: any;
  approved_offline_tasks: string[];
  max_queue_size: number;
  max_retries: number;
  do_not_cache_patterns: string[];
  is_active: boolean;
  version: number;
};

type OfflineQueue = {
  id: string;
  employee_id: string;
  task_type: string;
  payload: any;
  idempotency_key: string;
  device_timestamp: string;
  device_timezone: string;
  server_received_at: string | null;
  status: string;
  conflict_details: any;
  retry_count: number;
  last_error: string | null;
  synced_at: string | null;
  created_at: string;
};

type Conflict = {
  id: string;
  queue_id: string;
  conflict_type: string;
  server_data: any;
  device_data: any;
  resolution: string;
  resolved_by: string | null;
  resolved_at: string | null;
  notes: string | null;
};

type Faq = {
  id: string;
  category: string;
  question: string;
  answer: string;
  status: string;
  is_simple_language: boolean;
  reading_level: string;
  is_low_data: boolean;
  has_keyboard_support: boolean;
  has_screen_reader_support: boolean;
  tags: string[];
  view_count: number;
  is_published: boolean;
  published_at: string | null;
};

type Pref = {
  id: string;
  employee_id: string;
  prefers_keyboard: boolean;
  prefers_screen_reader: boolean;
  prefers_simple_language: boolean;
  prefers_low_data: boolean;
  font_size: string;
  high_contrast: boolean;
  reduced_motion: boolean;
};

export default function EmpPwaClient() {
  const [configs, setConfigs] = useState<PwaConfig[]>([]);
  const [queues, setQueues] = useState<OfflineQueue[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [msg, setMsg] = useState<string>("");

  // forms
  const [pwaForm, setPwaForm] = useState({ name: "Grupo SEG System - Portal Funcionário", short_name: "SEG Func", description: "Portal do funcionário com suporte offline limitado para tarefas operacionais aprovadas.", theme_color: "#0f172a", background_color: "#ffffff", display: "standalone", scope: "/", start_url: "/funcionario", max_queue_size: 50 });
  const [queueForm, setQueueForm] = useState({ employee_id: "", task_type: "occurrence", idempotency_key: "", device_timestamp: new Date().toISOString(), payload: '{"title":"Teste offline ocorrência","description":"Descrição teste offline com idempotência"}' });
  const [faqForm, setFaqForm] = useState({ category: "geral", question: "", answer: "", status: "publicado", is_simple_language: true, is_low_data: true, reading_level: "simples", tags: "geral,offline" });
  const [prefForm, setPrefForm] = useState({ employee_id: "", prefers_keyboard: true, prefers_screen_reader: false, prefers_simple_language: true, prefers_low_data: false, font_size: "medio", high_contrast: false });
  const [accessLogForm, setAccessLogForm] = useState({ faq_id: "", employee_id: "", device_type: "mobile", is_keyboard_navigation: true, is_screen_reader: false, data_saver: false });

  async function api(path: string, opts?: any) {
    const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }

  async function loadAll() {
    try {
      const [c, q, cf, f, p] = await Promise.all([
        api('/api/hr/pwa-configs').catch(() => ({ configs: [] })),
        api('/api/hr/offline-queue?limit=50').catch(() => ({ queues: [] })),
        api('/api/hr/offline-conflicts').catch(() => ({ conflicts: [] })),
        api('/api/hr/faq-internal?limit=50').catch(() => ({ faqs: [] })),
        api('/api/hr/accessibility-preferences').catch(() => ({ preferences: [] })),
      ]);
      setConfigs(c.configs || []);
      setQueues(q.queues || []);
      setConflicts(cf.conflicts || []);
      setFaqs(f.faqs || []);
      setPrefs(p.preferences || []);
    } catch (e: any) { setMsg(e.message); }
  }

  useEffect(() => { loadAll(); }, []);

  async function createPwa() {
    try {
      setMsg("Criando PWA config...");
      await api('/api/hr/pwa-configs', { method: 'POST', body: JSON.stringify(pwaForm) });
      setMsg("PWA config criado - manifest em /api/pwa/manifest.json e SW em /api/pwa/sw.js");
      loadAll();
    } catch (e: any) { setMsg(e.message); }
  }

  async function createQueue() {
    try {
      setMsg("Enfileirando offline com idempotência...");
      // Gera idempotency_key se vazio
      let key = queueForm.idempotency_key.trim();
      if (!key) {
        key = `offline-${queueForm.task_type}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      }
      const payloadObj = JSON.parse(queueForm.payload || '{}');
      await api('/api/hr/offline-queue', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: queueForm.employee_id,
          task_type: queueForm.task_type,
          payload: payloadObj,
          idempotency_key: key,
          device_timestamp: queueForm.device_timestamp || new Date().toISOString(),
          device_timezone: 'America/Sao_Paulo',
        })
      });
      setMsg(`Fila offline criada idempotency_key=${key} device_timestamp separado de server_received_at`);
      loadAll();
    } catch (e: any) { setMsg(e.message); }
  }

  async function syncQueue(id: string) {
    try {
      await api('/api/hr/offline-queue', { method: 'PATCH', body: JSON.stringify({ id, status: 'sincronizado' }) });
      setMsg(`Queue ${id.slice(0,8)} sincronizado - device_timestamp vs server_received_at separados`);
      loadAll();
    } catch (e: any) { setMsg(e.message); }
  }

  async function resolveConflict(id: string, resolution: string) {
    try {
      await api('/api/hr/offline-conflicts', { method: 'PATCH', body: JSON.stringify({ id, resolution, notes: `Resolvido ${resolution} em ${new Date().toISOString()}` }) });
      setMsg(`Conflito ${id.slice(0,8)} resolvido ${resolution} explícito`);
      loadAll();
    } catch (e: any) { setMsg(e.message); }
  }

  async function createFaq() {
    try {
      setMsg("Criando FAQ interna linguagem simples baixo consumo...");
      await api('/api/hr/faq-internal', {
        method: 'POST',
        body: JSON.stringify({
          category: faqForm.category,
          question: faqForm.question,
          answer: faqForm.answer,
          status: faqForm.status,
          is_simple_language: faqForm.is_simple_language,
          is_low_data: faqForm.is_low_data,
          reading_level: faqForm.reading_level,
          tags: faqForm.tags.split(',').map(s=>s.trim()).filter(Boolean),
          has_keyboard_support: true,
          has_screen_reader_support: true,
        })
      });
      setMsg("FAQ criada publicada com suporte teclado/leitor linguagem simples baixo consumo");
      setFaqForm({ ...faqForm, question: "", answer: "" });
      loadAll();
    } catch (e: any) { setMsg(e.message); }
  }

  async function createPref() {
    try {
      await api('/api/hr/accessibility-preferences', { method: 'POST', body: JSON.stringify(prefForm) });
      setMsg(`Preferência acessibilidade salva employee ${prefForm.employee_id.slice(0,8)} teclado=${prefForm.prefers_keyboard} leitor=${prefForm.prefers_screen_reader} simples=${prefForm.prefers_simple_language} low_data=${prefForm.prefers_low_data}`);
      loadAll();
    } catch (e: any) { setMsg(e.message); }
  }

  async function logAccess() {
    try {
      await api('/api/hr/faq-access-logs', { method: 'POST', body: JSON.stringify(accessLogForm) });
      setMsg(`Acesso FAQ logado faq ${accessLogForm.faq_id.slice(0,8)} teclado=${accessLogForm.is_keyboard_navigation} leitor=${accessLogForm.is_screen_reader} data_saver=${accessLogForm.data_saver}`);
      loadAll();
    } catch (e: any) { setMsg(e.message); }
  }

  return (
    <section style={{ marginTop: 32, padding: 16, border: '2px solid #0f172a', borderRadius: 8 }}>
      <h2>EMP-18/19 — PWA instalável, fila offline limitada e FAQ interna acessível</h2>
      <p style={{ fontSize: 13, background: '#f0f9ff', padding: 8 }}>
        EMP-18: PWA manifest <code>/api/pwa/manifest.json</code> + SW <code>/api/pwa/sw.js</code> + offline page <code>/api/pwa/offline</code>. Fila offline limitada (max 50) tarefas aprovadas occurrence/handover/absence_notice/procedure_ack/journey_proof com idempotency_key UNIQUE, conflito explícito duplicate/version_conflict, device_timestamp vs server_received_at separados, não cachear médicos/salariais por padrão DO_NOT_CACHE patterns.
        <br/>EMP-19: FAQ interna linguagem simples baixo consumo, acessibilidade teclado/leitor, logs acesso com is_keyboard_navigation/is_screen_reader/data_saver, preferências acessibilidade prefers_keyboard/screen_reader/simple_language/low_data font_size high_contrast.
      </p>
      {msg && <div style={{ padding: 8, background: '#fef3c7', margin: '8px 0', fontSize: 13 }}>{msg}</div>}

      <h3>PWA Config (instalável)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <input placeholder="name 3-100" value={pwaForm.name} onChange={e=>setPwaForm({...pwaForm,name:e.target.value})} />
        <input placeholder="short_name 2-20" value={pwaForm.short_name} onChange={e=>setPwaForm({...pwaForm,short_name:e.target.value})} />
        <input placeholder="description 10-500" value={pwaForm.description} onChange={e=>setPwaForm({...pwaForm,description:e.target.value})} />
        <input placeholder="theme_color #hex" value={pwaForm.theme_color} onChange={e=>setPwaForm({...pwaForm,theme_color:e.target.value})} />
        <input placeholder="scope /" value={pwaForm.scope} onChange={e=>setPwaForm({...pwaForm,scope:e.target.value})} />
        <input placeholder="start_url /funcionario" value={pwaForm.start_url} onChange={e=>setPwaForm({...pwaForm,start_url:e.target.value})} />
        <input type="number" placeholder="max_queue_size 1-200" value={pwaForm.max_queue_size} onChange={e=>setPwaForm({...pwaForm,max_queue_size:Number(e.target.value)})} />
      </div>
      <button onClick={createPwa}>Criar PWA config</button>
      <div style={{ maxHeight: 150, overflow: 'auto', fontSize: 12, margin: '8px 0', background: '#f8fafc', padding: 8 }}>
        {configs.map(c=><div key={c.id}>[{c.version}] {c.name} short={c.short_name} display={c.display} maxQueue={c.max_queue_size} approved={c.approved_offline_tasks?.join(',')} active={String(c.is_active)} doNotCache={c.do_not_cache_patterns?.slice(0,3).join(',')}... <a href="/api/pwa/manifest.json" target="_blank">manifest</a> <a href="/api/pwa/sw.js" target="_blank">sw.js</a></div>)}
      </div>

      <h3>Fila Offline Limitada (idempotência + conflito explícito + horários separados)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <input placeholder="employee_id UUID hr_employees" value={queueForm.employee_id} onChange={e=>setQueueForm({...queueForm,employee_id:e.target.value})} />
        <select value={queueForm.task_type} onChange={e=>setQueueForm({...queueForm,task_type:e.target.value})}>
          <option value="occurrence">occurrence</option>
          <option value="handover">handover</option>
          <option value="absence_notice">absence_notice</option>
          <option value="shift_swap">shift_swap</option>
          <option value="procedure_ack">procedure_ack</option>
          <option value="journey_proof">journey_proof</option>
          <option value="absence_followup">absence_followup</option>
          <option value="occurrence_action">occurrence_action</option>
        </select>
        <input placeholder="idempotency_key 10-200 (auto se vazio)" value={queueForm.idempotency_key} onChange={e=>setQueueForm({...queueForm,idempotency_key:e.target.value})} />
        <input type="datetime-local" value={queueForm.device_timestamp ? new Date(queueForm.device_timestamp).toISOString().slice(0,16) : ''} onChange={e=>setQueueForm({...queueForm,device_timestamp: new Date(e.target.value).toISOString()})} />
        <textarea placeholder='payload JSON {"title":"..."}' value={queueForm.payload} onChange={e=>setQueueForm({...queueForm,payload:e.target.value})} style={{ gridColumn: 'span 2' }} rows={3} />
      </div>
      <button onClick={createQueue}>Enfileirar offline (idempotente)</button>
      <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 12, margin: '8px 0', background: '#f8fafc', padding: 8 }}>
        {queues.map(q=><div key={q.id} style={{ borderBottom: '1px solid #e5e7eb', padding: '4px 0' }}>
          {q.id.slice(0,8)} emp={q.employee_id.slice(0,8)} type={q.task_type} status={q.status} idem={q.idempotency_key.slice(0,20)} device={new Date(q.device_timestamp).toLocaleString("pt-BR")} server_recv={q.server_received_at ? new Date(q.server_received_at).toLocaleString("pt-BR") : 'null'} retry={q.retry_count} synced={q.synced_at ? new Date(q.synced_at).toLocaleString("pt-BR") : '-'} conflict={q.conflict_details ? JSON.stringify(q.conflict_details).slice(0,100) : '-'}
          <button onClick={()=>syncQueue(q.id)} style={{ marginLeft: 8 }}>Sincronizar (server_received_at separado)</button>
        </div>)}
      </div>

      <h4>Conflitos Explícitos</h4>
      <div style={{ maxHeight: 150, overflow: 'auto', fontSize: 12, margin: '8px 0', background: '#fef2f2', padding: 8 }}>
        {conflicts.map(c=><div key={c.id}>{c.id.slice(0,8)} queue={c.queue_id.slice(0,8)} type={c.conflict_type} resolution={c.resolution} server={JSON.stringify(c.server_data).slice(0,80)} device={JSON.stringify(c.device_data).slice(0,80)}
          <button onClick={()=>resolveConflict(c.id,'manual_resolvido')} style={{ marginLeft: 4 }}>Manual resolvido</button>
          <button onClick={()=>resolveConflict(c.id,'auto_resolvido')} style={{ marginLeft: 4 }}>Auto resolvido</button>
          <button onClick={()=>resolveConflict(c.id,'ignorado')} style={{ marginLeft: 4 }}>Ignorar</button>
        </div>)}
        {conflicts.length===0 && <div>Nenhum conflito - idempotência previne duplicidade, payload diferente gera conflito explícito</div>}
      </div>

      <h3>FAQ Interna (linguagem simples, baixo consumo, acessibilidade teclado/leitor)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <select value={faqForm.category} onChange={e=>setFaqForm({...faqForm,category:e.target.value})}>
          <option value="geral">geral</option><option value="escala">escala</option><option value="ponto">ponto</option><option value="beneficios">beneficios</option><option value="uniformes">uniformes</option><option value="seguranca">seguranca</option><option value="procedimentos">procedimentos</option><option value="rh">rh</option><option value="tecnico">tecnico</option><option value="outro">outro</option>
        </select>
        <select value={faqForm.status} onChange={e=>setFaqForm({...faqForm,status:e.target.value})}>
          <option value="rascunho">rascunho</option><option value="em_revisao">em_revisao</option><option value="publicado">publicado</option><option value="arquivado">arquivado</option>
        </select>
        <input placeholder="pergunta 10-500 linguagem simples" value={faqForm.question} onChange={e=>setFaqForm({...faqForm,question:e.target.value})} style={{ gridColumn: 'span 2' }} />
        <textarea placeholder="resposta 20-5000 linguagem simples baixo consumo" value={faqForm.answer} onChange={e=>setFaqForm({...faqForm,answer:e.target.value})} style={{ gridColumn: 'span 2' }} rows={3} />
        <label><input type="checkbox" checked={faqForm.is_simple_language} onChange={e=>setFaqForm({...faqForm,is_simple_language:e.target.checked})} /> linguagem simples</label>
        <label><input type="checkbox" checked={faqForm.is_low_data} onChange={e=>setFaqForm({...faqForm,is_low_data:e.target.checked})} /> baixo consumo</label>
        <input placeholder="tags csv" value={faqForm.tags} onChange={e=>setFaqForm({...faqForm,tags:e.target.value})} />
        <select value={faqForm.reading_level} onChange={e=>setFaqForm({...faqForm,reading_level:e.target.value})}>
          <option value="simples">simples</option><option value="medio">medio</option><option value="tecnico">tecnico</option>
        </select>
      </div>
      <button onClick={createFaq}>Criar FAQ interna acessível</button>
      <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 12, margin: '8px 0', background: '#f0fdf4', padding: 8 }}>
        {faqs.map(f=><div key={f.id} style={{ borderBottom: '1px solid #e5e7eb', padding: '4px 0' }}>
          <strong>[{f.category}]</strong> {f.question.slice(0,80)} - {f.answer.slice(0,100)}... status={f.status} simples={String(f.is_simple_language)} low_data={String(f.is_low_data)} leitura={f.reading_level} teclado={String(f.has_keyboard_support)} leitor={String(f.has_screen_reader_support)} views={f.view_count} publicado={String(f.is_published)}
        </div>)}
      </div>

      <h4>Log Acesso FAQ (teclado/leitor/baixo consumo)</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input placeholder="faq_id UUID" value={accessLogForm.faq_id} onChange={e=>setAccessLogForm({...accessLogForm,faq_id:e.target.value})} />
        <input placeholder="employee_id UUID" value={accessLogForm.employee_id} onChange={e=>setAccessLogForm({...accessLogForm,employee_id:e.target.value})} />
        <select value={accessLogForm.device_type} onChange={e=>setAccessLogForm({...accessLogForm,device_type:e.target.value})}>
          <option value="mobile">mobile</option><option value="desktop">desktop</option><option value="tablet">tablet</option><option value="outro">outro</option>
        </select>
        <label><input type="checkbox" checked={accessLogForm.is_keyboard_navigation} onChange={e=>setAccessLogForm({...accessLogForm,is_keyboard_navigation:e.target.checked})} /> navegação teclado</label>
        <label><input type="checkbox" checked={accessLogForm.is_screen_reader} onChange={e=>setAccessLogForm({...accessLogForm,is_screen_reader:e.target.checked})} /> leitor tela</label>
        <label><input type="checkbox" checked={accessLogForm.data_saver} onChange={e=>setAccessLogForm({...accessLogForm,data_saver:e.target.checked})} /> economia dados</label>
      </div>
      <button onClick={logAccess}>Registrar acesso FAQ (acessibilidade)</button>

      <h3>Preferências Acessibilidade (teclado/leitor/linguagem simples/baixo consumo)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <input placeholder="employee_id UUID" value={prefForm.employee_id} onChange={e=>setPrefForm({...prefForm,employee_id:e.target.value})} />
        <select value={prefForm.font_size} onChange={e=>setPrefForm({...prefForm,font_size:e.target.value})}>
          <option value="pequeno">pequeno</option><option value="medio">medio</option><option value="grande">grande</option><option value="extra_grande">extra_grande</option>
        </select>
        <label><input type="checkbox" checked={prefForm.prefers_keyboard} onChange={e=>setPrefForm({...prefForm,prefers_keyboard:e.target.checked})} /> prefere teclado</label>
        <label><input type="checkbox" checked={prefForm.prefers_screen_reader} onChange={e=>setPrefForm({...prefForm,prefers_screen_reader:e.target.checked})} /> prefere leitor</label>
        <label><input type="checkbox" checked={prefForm.prefers_simple_language} onChange={e=>setPrefForm({...prefForm,prefers_simple_language:e.target.checked})} /> prefere linguagem simples</label>
        <label><input type="checkbox" checked={prefForm.prefers_low_data} onChange={e=>setPrefForm({...prefForm,prefers_low_data:e.target.checked})} /> prefere baixo consumo</label>
        <label><input type="checkbox" checked={prefForm.high_contrast} onChange={e=>setPrefForm({...prefForm,high_contrast:e.target.checked})} /> alto contraste</label>
      </div>
      <button onClick={createPref}>Salvar preferência acessibilidade</button>
      <div style={{ maxHeight: 120, overflow: 'auto', fontSize: 12, margin: '8px 0', background: '#f8fafc', padding: 8 }}>
        {prefs.map(p=><div key={p.id}>emp={p.employee_id.slice(0,8)} teclado={String(p.prefers_keyboard)} leitor={String(p.prefers_screen_reader)} simples={String(p.prefers_simple_language)} low_data={String(p.prefers_low_data)} font={p.font_size} contraste={String(p.high_contrast)}</div>)}
      </div>

      <details style={{ marginTop: 12 }}>
        <summary>Detalhes técnicos EMP-18/19</summary>
        <ul style={{ fontSize: 12 }}>
          <li>PWA manifest em /api/pwa/manifest.json com name/short_name/description/theme_color/background_color/display/scope/start_url/icons/categories/lang</li>
          <li>Service Worker em /api/pwa/sw.js com DO_NOT_CACHE patterns médicos/salariais, network_first navegação, cache_first assets, offline queue sync tag offline-queue-sync, skipWaiting message</li>
          <li>Offline page /api/pwa/offline explica idempotência, horários separados, conflito explícito, não cachear médicos/salariais</li>
          <li>Fila offline: idempotency_key UNIQUE 10-200, device_timestamp obrigatório separado de server_received_at (server set NOW()), payload JSONB, approved_offline_tasks check config, max_queue_size 50 check 429 queue_limit_exceeded, duplicate key com payload diferente gera conflito explícito duplicate + tabela conflicts, idempotente replay retorna 200 dedup true</li>
          <li>Conflitos: duplicate/version_conflict/stale_data/permission_denied/expired/already_resolved, server_data vs device_data, resolution pendente/manual_resolvido/auto_resolvido/ignorado, resolvido atualiza queue sincronizado</li>
          <li>FAQ interna: category geral/escala/ponto/beneficios/uniformes/seguranca/procedimentos/rh/tecnico/outro, question 10-500 answer 20-5000 status rascunho/em_revisao/publicado/arquivado, is_simple_language true, reading_level simples/medio/tecnico, is_low_data true baixo consumo, has_keyboard_support true, has_screen_reader_support true, tags, view_count, is_published</li>
          <li>Access logs: faq_id employee_id device_type mobile/desktop/tablet/outro is_keyboard_navigation is_screen_reader data_saver ip_hash, increment view_count, audit emp_faq_access</li>
          <li>Preferências: employee_id UNIQUE prefers_keyboard/screen_reader/simple_language/low_data font_size pequeno/medio/grande/extra_grande high_contrast reduced_motion, ON CONFLICT upsert</li>
          <li>Acessibilidade: teclado Tab/Enter, leitor ARIA, linguagem simples, baixo consumo sem imagens pesadas, font_size ajustável, alto contraste</li>
        </ul>
      </details>
    </section>
  );
}
