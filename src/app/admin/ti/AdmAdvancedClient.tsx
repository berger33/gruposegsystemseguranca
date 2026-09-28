"use client";
import { useEffect, useState } from "react";

type SearchFav = { id:string; query:string; module:string; filters:any; is_favorite:boolean; };
type SavedFilter = { id:string; filter_name:string; module:string; filters:any; is_shared:boolean; };
type Shortcut = { id:string; shortcut_name:string; context:string; url:string; icon:string|null; is_favorite:boolean; };
type Report = { id:string; protocol:string; report_type:string; title:string; period_start:string|null; period_end:string|null; status:string; file_url:string|null; storage_key:string|null; recipient_email:string|null; is_limited:boolean; limited_fields:string[]; generated_at:string|null; sent_at:string|null; };
type BusinessConfig = { id:string; config_key:string; config_value:any; version:number; status:string; category:string; description:string|null; is_active:boolean; };
type GoalsComp = { id:string; goal_id:string|null; scenario_id:string|null; budget_id:string|null; period_start:string; period_end:string; predicted_value:number|null; realized_value:number|null; variance_value:number|null; variance_percent:number|null; is_estimate:boolean; estimate_note:string; };
type Expansion = { id:string; title:string; description:string; premises:string; analysis_type:string; data:any; source_module:string; is_estimate:boolean; estimate_note:string; is_real_data:boolean; };

export default function AdmAdvancedClient() {
  const [searchFavs, setSearchFavs] = useState<SearchFav[]>([]);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [configs, setConfigs] = useState<BusinessConfig[]>([]);
  const [goalsComp, setGoalsComp] = useState<GoalsComp[]>([]);
  const [expansions, setExpansions] = useState<Expansion[]>([]);
  const [msg, setMsg] = useState("");

  const [query, setQuery] = useState("");
  const [module, setModule] = useState("crm");

  const [filterName, setFilterName] = useState("");
  const [filterModule, setFilterModule] = useState("crm");

  const [shortcutName, setShortcutName] = useState("");
  const [shortcutContext, setShortcutContext] = useState("");
  const [shortcutUrl, setShortcutUrl] = useState("");

  const [reportType, setReportType] = useState("comercial");
  const [reportTitle, setReportTitle] = useState("");
  const [reportStart, setReportStart] = useState("");
  const [reportEnd, setReportEnd] = useState("");
  const [reportRecipient, setReportRecipient] = useState("");

  const [configKey, setConfigKey] = useState("");
  const [configCategory, setConfigCategory] = useState("catalogo");
  const [configDesc, setConfigDesc] = useState("");
  const [configValue, setConfigValue] = useState("{}");

  const [gcStart, setGcStart] = useState("");
  const [gcEnd, setGcEnd] = useState("");
  const [gcPredicted, setGcPredicted] = useState("");
  const [gcRealized, setGcRealized] = useState("");

  const [expTitle, setExpTitle] = useState("");
  const [expDesc, setExpDesc] = useState("");
  const [expPremises, setExpPremises] = useState("");
  const [expType, setExpType] = useState("expansao");

  const load = async () => {
    try {
      const [a,b,c,d,e,f,g] = await Promise.all([
        fetch("/api/adm/search-favorites").then(r=>r.json()).catch(()=>({favorites:[]})),
        fetch("/api/adm/saved-filters").then(r=>r.json()).catch(()=>({filters:[]})),
        fetch("/api/adm/shortcuts").then(r=>r.json()).catch(()=>({shortcuts:[]})),
        fetch("/api/adm/reports").then(r=>r.json()).catch(()=>({reports:[]})),
        fetch("/api/adm/business-configs").then(r=>r.json()).catch(()=>({configs:[]})),
        fetch("/api/adm/goals-comparison").then(r=>r.json()).catch(()=>({comparisons:[]})),
        fetch("/api/adm/expansion-analyses").then(r=>r.json()).catch(()=>({analyses:[]})),
      ]);
      setSearchFavs(a.favorites||[]);
      setSavedFilters(b.filters||[]);
      setShortcuts(c.shortcuts||[]);
      setReports(d.reports||[]);
      setConfigs(e.configs||[]);
      setGoalsComp(f.comparisons||[]);
      setExpansions(g.analyses||[]);
    } catch(e:any){ setMsg(e.message); }
  };
  useEffect(()=>{ load(); }, []);

  const post = async (url:string, body:any) => {
    const r = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || JSON.stringify(j));
    return j;
  };

  const createSearchFav = async () => {
    try {
      setMsg("");
      if (!query || query.length<2) throw new Error("query 2..500");
      if (!module || module.length<2) throw new Error("module 2..100");
      await post("/api/adm/search-favorites", { query, module, filters:{ authorized:true } });
      setMsg("ADM-07 busca autorizada favorito criado query 2..500 module 2..100 filtros autorizados");
      load();
    } catch(e:any){ setMsg("ADM-07 busca erro: "+e.message); }
  };
  const createSavedFilter = async () => {
    try {
      setMsg("");
      if (!filterName || filterName.length<3) throw new Error("filter_name 3..200");
      if (!filterModule || filterModule.length<2) throw new Error("module 2..100");
      await post("/api/adm/saved-filters", { filter_name:filterName, module:filterModule, filters:{ status:"ativo" }, is_shared:false });
      setMsg("ADM-07 filtro salvo criado filter_name 3..200 module filtros salvos");
      load();
    } catch(e:any){ setMsg("ADM-07 filtro erro: "+e.message); }
  };
  const createShortcut = async () => {
    try {
      setMsg("");
      if (!shortcutName || shortcutName.length<3) throw new Error("shortcut_name 3..200");
      if (!shortcutContext || shortcutContext.length<3) throw new Error("context 3..500");
      if (!shortcutUrl || shortcutUrl.length<5) throw new Error("url 5..500");
      await post("/api/adm/shortcuts", { shortcut_name:shortcutName, context:shortcutContext, url:shortcutUrl, is_favorite:true });
      setMsg("ADM-07 atalho criado shortcut_name 3..200 context 3..500 url 5..500 atalhos com contexto");
      load();
    } catch(e:any){ setMsg("ADM-07 atalho erro: "+e.message); }
  };
  const createReport = async () => {
    try {
      setMsg("");
      if (!reportTitle || reportTitle.length<5) throw new Error("title 5..200");
      await post("/api/adm/reports", { report_type:reportType, title:reportTitle, period_start:reportStart||null, period_end:reportEnd||null, filters:{ type:reportType }, totals:{ conciliavel:true }, recipient_email:reportRecipient||null, scheduled_at:reportStart?new Date(reportStart).toISOString():null });
      setMsg("ADM-08 relatório exportável agendado criado protocolo REL-ADM destinatários autorizados registrar geração/envio limitar dados is_limited=true");
      load();
    } catch(e:any){ setMsg("ADM-08 relatório erro: "+e.message); }
  };
  const createConfig = async () => {
    try {
      setMsg("");
      if (!configKey || configKey.length<3) throw new Error("config_key 3..200");
      if (!configCategory || configCategory.length<3) throw new Error("category 3..100");
      let val:any; try { val = JSON.parse(configValue); } catch { throw new Error("config_value JSON inválido"); }
      await post("/api/adm/business-configs", { config_key:configKey, config_value:val, category:configCategory, description:configDesc||null });
      setMsg("ADM-09 configuração negócio versionada criada config_key 3..200 version 1 status rascunho category catalogo preços alçadas conteúdo SLA preferências");
      load();
    } catch(e:any){ setMsg("ADM-09 config erro: "+e.message); }
  };
  const createGoalsComp = async () => {
    try {
      setMsg("");
      if (!gcStart || !gcEnd) throw new Error("period_start/end obrigatórios");
      await post("/api/adm/goals-comparison", { period_start:gcStart, period_end:gcEnd, predicted_value:gcPredicted?parseFloat(gcPredicted):null, realized_value:gcRealized?parseFloat(gcRealized):null, variance_percent:null });
      setMsg("ADM-10 metas cenários comparação prevista/realizada criada sem confundir estimativa com resultado is_estimate=true");
      load();
    } catch(e:any){ setMsg("ADM-10 metas erro: "+e.message); }
  };
  const createExpansion = async () => {
    try {
      setMsg("");
      if (!expTitle || expTitle.length<5) throw new Error("title 5..200");
      if (!expDesc || expDesc.length<10) throw new Error("description 10..2000");
      if (!expPremises || expPremises.length<10) throw new Error("premises 10..2000 obrigatória análises expansão qualidade oportunidades alimentadas pelos módulos reais");
      await post("/api/adm/expansion-analyses", { title:expTitle, description:expDesc, premises:expPremises, analysis_type:expType, data:{ source:"modulos_reais", modules:["crm","con","fin","ops"] }, source_module:"adm" });
      setMsg("ADM-12 análise expansão qualidade oportunidades criada is_real_data=true alimentada pelos módulos reais sem prometer resultado");
      load();
    } catch(e:any){ setMsg("ADM-12 expansão erro: "+e.message); }
  };

  return (
    <section style={{ marginTop:24, padding:16, border:"1px solid #333", borderRadius:8 }}>
      <h2>ADM-07..12 — Busca autorizada, relatórios agendados, configs versionadas, metas comparação, diário, expansão</h2>
      {msg && <p style={{ background:"#eef", padding:8 }}>{msg}</p>}

      <h3>ADM-07 Busca autorizada favoritos filtros salvos atalhos com contexto</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:8 }}>
        <input placeholder="query 2..500 busca autorizada" value={query} onChange={e=>setQuery(e.target.value)} />
        <input placeholder="module 2..100" value={module} onChange={e=>setModule(e.target.value)} />
        <button onClick={createSearchFav}>Criar busca favorita autorizada</button>
        <input placeholder="filter_name 3..200" value={filterName} onChange={e=>setFilterName(e.target.value)} />
        <input placeholder="filter module" value={filterModule} onChange={e=>setFilterModule(e.target.value)} />
        <button onClick={createSavedFilter}>Criar filtro salvo</button>
        <input placeholder="shortcut_name 3..200" value={shortcutName} onChange={e=>setShortcutName(e.target.value)} />
        <input placeholder="context 3..500 atalho contexto" value={shortcutContext} onChange={e=>setShortcutContext(e.target.value)} />
        <input placeholder="url 5..500" value={shortcutUrl} onChange={e=>setShortcutUrl(e.target.value)} />
        <button onClick={createShortcut}>Criar atalho com contexto</button>
      </div>
      <ul>{searchFavs.slice(0,10).map(f=><li key={f.id}>{f.query} módulo:{f.module} favorito:{String(f.is_favorite)} filtros:{JSON.stringify(f.filters).slice(0,40)}</li>)}</ul>
      <ul>{savedFilters.slice(0,10).map(f=><li key={f.id}>{f.filter_name} módulo:{f.module} compartilhado:{String(f.is_shared)} filtros:{JSON.stringify(f.filters).slice(0,40)}</li>)}</ul>
      <ul>{shortcuts.slice(0,10).map(s=><li key={s.id}>{s.shortcut_name} contexto:{s.context.slice(0,40)} url:{s.url} favorito:{String(s.is_favorite)}</li>)}</ul>

      <h3>ADM-08 Relatórios exportáveis e agendados destinatários autorizados registrar geração/envio limitar dados</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:8 }}>
        <select value={reportType} onChange={e=>setReportType(e.target.value)}><option value="meu_dia">meu_dia</option><option value="comercial">comercial</option><option value="operacional">operacional</option><option value="financeiro">financeiro</option><option value="renovacao">renovacao</option><option value="aprovacao">aprovacao</option><option value="expansao">expansao</option><option value="qualidade">qualidade</option><option value="outro">outro</option></select>
        <input placeholder="title 5..200" value={reportTitle} onChange={e=>setReportTitle(e.target.value)} />
        <input type="date" value={reportStart} onChange={e=>setReportStart(e.target.value)} />
        <input type="date" value={reportEnd} onChange={e=>setReportEnd(e.target.value)} />
        <input placeholder="recipient_email 5..320 opcional" value={reportRecipient} onChange={e=>setReportRecipient(e.target.value)} />
        <button onClick={createReport}>Criar relatório agendado REL-ADM</button>
      </div>
      <ul>{reports.slice(0,10).map(r=><li key={r.id}>{r.protocol} tipo:{r.report_type} {r.title} período:{r.period_start||"—"}→{r.period_end||"—"} status:{r.status} limitado:{String(r.is_limited)} campos_limitados:{r.limited_fields?.length||0} destinatário:{r.recipient_email||"—"} gerado:{r.generated_at?.slice(0,10)||"—"} enviado:{r.sent_at?.slice(0,10)||"—"}</li>)}</ul>

      <h3>ADM-09 Configurações de negócio versionadas catálogo preços alçadas conteúdo SLA preferências</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:8 }}>
        <input placeholder="config_key 3..200" value={configKey} onChange={e=>setConfigKey(e.target.value)} />
        <select value={configCategory} onChange={e=>setConfigCategory(e.target.value)}><option value="catalogo">catalogo</option><option value="precos">precos</option><option value="alcadas">alcadas</option><option value="conteudo">conteudo</option><option value="sla">sla</option><option value="preferencias">preferencias</option><option value="outro">outro</option></select>
        <input placeholder="description 10..1000 opcional" value={configDesc} onChange={e=>setConfigDesc(e.target.value)} />
        <input placeholder='config_value JSON ex: {"preco":100}' value={configValue} onChange={e=>setConfigValue(e.target.value)} />
        <button onClick={createConfig}>Criar config versionada</button>
      </div>
      <ul>{configs.slice(0,20).map(c=><li key={c.id}>{c.config_key} v:{c.version} categoria:{c.category} status:{c.status} ativo:{String(c.is_active)} valor:{JSON.stringify(c.config_value).slice(0,60)} desc:{c.description?.slice(0,40)||"—"}</li>)}</ul>

      <h3>ADM-10 Metas e cenários comparação prevista/realizada sem confundir estimativa com resultado</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px,1fr))", gap:8 }}>
        <input type="date" value={gcStart} onChange={e=>setGcStart(e.target.value)} />
        <input type="date" value={gcEnd} onChange={e=>setGcEnd(e.target.value)} />
        <input placeholder="predicted_value" value={gcPredicted} onChange={e=>setGcPredicted(e.target.value)} />
        <input placeholder="realized_value" value={gcRealized} onChange={e=>setGcRealized(e.target.value)} />
        <button onClick={createGoalsComp}>Criar comparação metas cenários</button>
      </div>
      <ul>{goalsComp.slice(0,10).map(g=><li key={g.id}>período:{g.period_start}→{g.period_end} previsto:{g.predicted_value} realizado:{g.realized_value} variância:{g.variance_value} %:{g.variance_percent} estimate:{String(g.is_estimate)} note:{g.estimate_note.slice(0,40)}</li>)}</ul>

      <h3>ADM-11 Trilha e diário de decisões CON-11 acessíveis conforme permissão</h3>
      <p style={{ fontSize:12 }}>Diário CON-11 já existe em crm_management_diary; ADM-11 registra acesso autorizado via adm_management_diary_access com accessor_identity, access_type, accessed_at. Auditoria adm_diary_access. Acesso restrito admin/ti conforme permissão.</p>

      <h3>ADM-12 Análises de expansão qualidade e oportunidades adicionais alimentadas pelos módulos reais</h3>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px,1fr))", gap:8 }}>
        <input placeholder="title 5..200" value={expTitle} onChange={e=>setExpTitle(e.target.value)} />
        <input placeholder="description 10..2000" value={expDesc} onChange={e=>setExpDesc(e.target.value)} />
        <input placeholder="premises 10..2000 obrigatória módulos reais" value={expPremises} onChange={e=>setExpPremises(e.target.value)} />
        <select value={expType} onChange={e=>setExpType(e.target.value)}><option value="expansao">expansao</option><option value="qualidade">qualidade</option><option value="oportunidade">oportunidade</option><option value="risco">risco</option><option value="outro">outro</option></select>
        <button onClick={createExpansion}>Criar análise expansão qualidade oportunidade</button>
      </div>
      <ul>{expansions.slice(0,10).map(a=><li key={a.id}>{a.title} tipo:{a.analysis_type} módulo:{a.source_module} real_data:{String(a.is_real_data)} estimate:{String(a.is_estimate)} note:{a.estimate_note.slice(0,40)} premises:{a.premises.slice(0,40)}</li>)}</ul>
    </section>
  );
}
