"use client";
import { useEffect, useState } from "react";

export default function ExtReportingClient() {
  const [reports, setReports] = useState<any[]>([]);
  const [intel, setIntel] = useState<any[]>([]);
  const [emergChannels, setEmergChannels] = useState<any[]>([]);
  const [emergTests, setEmergTests] = useState<any[]>([]);
  const [central, setCentral] = useState<any[]>([]);
  const [biometry, setBiometry] = useState<any[]>([]);
  const [automations, setAutomations] = useState<any[]>([]);
  const [autoLogs, setAutoLogs] = useState<any[]>([]);
  const [msg, setMsg] = useState<string>("");

  const [repForm, setRepForm] = useState({ title:"", description:"", report_type:"mensal", period_start:"", period_end:"", filters:"{}", recipient_emails:"" });
  const [intelForm, setIntelForm] = useState({ title:"", description:"", intel_type:"mercado", source_module:"", score:5, justification:"", related_client_id:"", related_contract_id:"" });
  const [emergForm, setEmergForm] = useState({ name:"", channel_type:"telefone", recipient_contact:"", availability:"24x7", escalation:"", description:"" });
  const [emergTestForm, setEmergTestForm] = useState({ channel_id:"", test_type:"", result:"" });
  const [centralForm, setCentralForm] = useState({ title:"", description:"", scope:"", provider:"", privacy_assessment:"", client_account_id:"" });
  const [bioForm, setBioForm] = useState({ title:"", description:"", biometry_type:"facial", necessity:"", impact_assessment:"", legal_basis:"", client_account_id:"" });
  const [autoForm, setAutoForm] = useState({ name:"", description:"", automation_type:"vencimento", rules:"{}", schedule_cron:"" });

  const load = async () => {
    try {
      const [rR, iR, ecR, etR, cR, bR, aR, alR] = await Promise.all([
        fetch("/api/ext/periodic-reports").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/commercial-intelligence").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/emergency-channels").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/emergency-tests").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/central-projects").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/biometry-projects").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/ai-automations").then(r=>r.json()).catch(()=>({items:[]})),
        fetch("/api/ext/ai-automation-logs").then(r=>r.json()).catch(()=>({items:[]})),
      ]);
      setReports(rR.items||[]); setIntel(iR.items||[]); setEmergChannels(ecR.items||[]); setEmergTests(etR.items||[]); setCentral(cR.items||[]); setBiometry(bR.items||[]); setAutomations(aR.items||[]); setAutoLogs(alR.items||[]);
    } catch(e:any){ setMsg(String(e?.message||e)); }
  };
  useEffect(()=>{ load(); },[]);

  const post = async (url:string, body:any) => {
    const r = await fetch(url, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error||"erro");
    return j;
  };

  return (
    <section style={{ marginTop:32, padding:16, border:"1px solid #ccc", borderRadius:8 }}>
      <h2>EXT-13..17 + AI-10 — Relatórios programados, inteligência comercial, emergencial, central/vídeo, biometria, automações determinísticas</h2>
      {msg && <p style={{color:"red"}}>{msg}</p>}

      <h3>EXT-13 Relatórios periódicos (título 5..200, desc 10..2000, tipo diario/semanal/mensal/trimestral/anual/sob_demanda, period_start/end period_end&gt;=period_start, filters JSONB, recipient_emails array, totals JSONB, storage_key 5..500 UNIQUE, protocolo RELP-EXT-, status rascunho/gerando/gerado/enviado/falhou/cancelado — gerado apenas de dados reais escopo cliente autorizado sem dado inventado sem dado não autorizado)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="título 5..200" value={repForm.title} onChange={e=>setRepForm({...repForm, title:e.target.value})} />
        <input placeholder="descrição 10..2000" value={repForm.description} onChange={e=>setRepForm({...repForm, description:e.target.value})} />
        <select value={repForm.report_type} onChange={e=>setRepForm({...repForm, report_type:e.target.value})}>
          <option value="diario">diario</option><option value="semanal">semanal</option><option value="mensal">mensal</option><option value="trimestral">trimestral</option><option value="anual">anual</option><option value="sob_demanda">sob_demanda</option>
        </select>
        <input type="date" value={repForm.period_start} onChange={e=>setRepForm({...repForm, period_start:e.target.value})} />
        <input type="date" value={repForm.period_end} onChange={e=>setRepForm({...repForm, period_end:e.target.value})} />
        <input placeholder='filters JSON {}' value={repForm.filters} onChange={e=>setRepForm({...repForm, filters:e.target.value})} />
        <input placeholder="emails comma" value={repForm.recipient_emails} onChange={e=>setRepForm({...repForm, recipient_emails:e.target.value})} />
        <button onClick={async()=>{ try{ const filters = repForm.filters ? JSON.parse(repForm.filters) : {}; const emails = repForm.recipient_emails ? repForm.recipient_emails.split(",").map((s:string)=>s.trim()).filter(Boolean) : []; await post("/api/ext/periodic-reports", {title:repForm.title,description:repForm.description,report_type:repForm.report_type,period_start:repForm.period_start||null,period_end:repForm.period_end||null,filters,recipient_emails:emails}); setMsg("relatório programado criado apenas dados reais escopo autorizado"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar relatório</button>
      </div>
      <ul>{reports.map((r:any)=><li key={r.id}>{r.protocol} {r.title} tipo:{r.report_type} status:{r.status} período:{r.period_start}→{r.period_end} gerado:{r.generated_at} privacy:{String(r.privacy_compliant)}</li>)}</ul>

      <h3>EXT-14 Inteligência comercial (título 5..200, desc 10..2000, tipo mercado/cliente/concorrente/tendencia/risco/oportunidade, source_module 3..100, score 0..10, justificativa 10..2000 obrigatória, related_client/contract, protocolo INTEL-EXT-, status rascunho/em_analise/aprovada/rejeitada/arquivada/em_uso, is_human_approved — justificativa obrigatória uso bloqueado sem aprovação humana)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="título 5..200" value={intelForm.title} onChange={e=>setIntelForm({...intelForm, title:e.target.value})} />
        <input placeholder="descrição 10..2000" value={intelForm.description} onChange={e=>setIntelForm({...intelForm, description:e.target.value})} />
        <select value={intelForm.intel_type} onChange={e=>setIntelForm({...intelForm, intel_type:e.target.value})}>
          <option value="mercado">mercado</option><option value="cliente">cliente</option><option value="concorrente">concorrente</option><option value="tendencia">tendencia</option><option value="risco">risco</option><option value="oportunidade">oportunidade</option>
        </select>
        <input placeholder="source_module 3..100" value={intelForm.source_module} onChange={e=>setIntelForm({...intelForm, source_module:e.target.value})} />
        <input type="number" min="0" max="10" value={intelForm.score} onChange={e=>setIntelForm({...intelForm, score:Number(e.target.value)})} />
        <input placeholder="justificativa 10..2000 obrigatória" value={intelForm.justification} onChange={e=>setIntelForm({...intelForm, justification:e.target.value})} />
        <input placeholder="related_client_id" value={intelForm.related_client_id} onChange={e=>setIntelForm({...intelForm, related_client_id:e.target.value})} />
        <input placeholder="related_contract_id" value={intelForm.related_contract_id} onChange={e=>setIntelForm({...intelForm, related_contract_id:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ext/commercial-intelligence", intelForm); setMsg("inteligência comercial criada justificativa obrigatória"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar inteligência</button>
      </div>
      <ul>{intel.map((i:any)=><li key={i.id}>{i.protocol} {i.title} tipo:{i.intel_type} src:{i.source_module} score:{i.score} status:{i.status} aprovado:{String(i.is_human_approved)} justif:{i.justification?.slice(0,60)}</li>)}</ul>

      <h3>EXT-15 Canais emergenciais apoio (nome 3..200, tipo telefone/whatsapp/email/sms/push/radio/outro, recipient_contact 5..500, availability, escalation JSONB, desc 10..2000, status ativo/inativo/em_teste/falhou/suspenso, is_tested, last_tested_at, test_result CHECK tested=&gt;last_tested_at — testar recebimento e atendimento antes disponibilizar)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="nome 3..200" value={emergForm.name} onChange={e=>setEmergForm({...emergForm, name:e.target.value})} />
        <select value={emergForm.channel_type} onChange={e=>setEmergForm({...emergForm, channel_type:e.target.value})}>
          <option value="telefone">telefone</option><option value="whatsapp">whatsapp</option><option value="email">email</option><option value="sms">sms</option><option value="push">push</option><option value="radio">radio</option><option value="outro">outro</option>
        </select>
        <input placeholder="recipient 5..500" value={emergForm.recipient_contact} onChange={e=>setEmergForm({...emergForm, recipient_contact:e.target.value})} />
        <input placeholder="availability 24x7" value={emergForm.availability} onChange={e=>setEmergForm({...emergForm, availability:e.target.value})} />
        <input placeholder="escalation JSON" value={emergForm.escalation} onChange={e=>setEmergForm({...emergForm, escalation:e.target.value})} />
        <input placeholder="desc 10..2000" value={emergForm.description} onChange={e=>setEmergForm({...emergForm, description:e.target.value})} />
        <button onClick={async()=>{ try{ const esc = emergForm.escalation ? JSON.parse(emergForm.escalation) : []; await post("/api/ext/emergency-channels", {name:emergForm.name,channel_type:emergForm.channel_type,recipient_contact:emergForm.recipient_contact,availability:emergForm.availability,escalation:esc,description:emergForm.description||null}); setMsg("canal emergencial criado testar antes disponibilizar"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar canal emergencial</button>
      </div>
      <ul>{emergChannels.map((c:any)=><li key={c.id}>{c.name} tipo:{c.channel_type} recipient:{c.recipient_contact} status:{c.status} testado:{String(c.is_tested)} último:{c.last_tested_at} resultado:{c.test_result}</li>)}</ul>

      <h3>EXT-15 Testes emergenciais (channel_id, tipo 3..100, result 3..2000, marca canal testado se sucesso)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="channel_id" value={emergTestForm.channel_id} onChange={e=>setEmergTestForm({...emergTestForm, channel_id:e.target.value})} />
        <input placeholder="tipo teste 3..100" value={emergTestForm.test_type} onChange={e=>setEmergTestForm({...emergTestForm, test_type:e.target.value})} />
        <input placeholder="resultado 3..2000 sucesso/recebido/ok" value={emergTestForm.result} onChange={e=>setEmergTestForm({...emergTestForm, result:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ext/emergency-tests", emergTestForm); setMsg("teste emergencial criado se sucesso marca canal testado"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar teste emergencial</button>
      </div>
      <ul>{emergTests.slice(0,20).map((t:any)=><li key={t.id}>canal:{t.channel_id} tipo:{t.test_type} result:{t.result?.slice(0,80)}</li>)}</ul>

      <h3>EXT-16 Central projetos (título 5..200, desc 10..2000, escopo 10..2000, provider 3..200, privacy_assessment 10..5000, client_account_id, protocolo CENT-EXT-, status rascunho/em_analise_privacidade/aprovado_privacidade/em_implantacao/implantado/rejeitado/arquivado, is_privacy_approved is_approved — projeto separado privacidade aprovada antes implantação)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="título 5..200" value={centralForm.title} onChange={e=>setCentralForm({...centralForm, title:e.target.value})} />
        <input placeholder="descrição 10..2000" value={centralForm.description} onChange={e=>setCentralForm({...centralForm, description:e.target.value})} />
        <input placeholder="escopo 10..2000" value={centralForm.scope} onChange={e=>setCentralForm({...centralForm, scope:e.target.value})} />
        <input placeholder="provider 3..200" value={centralForm.provider} onChange={e=>setCentralForm({...centralForm, provider:e.target.value})} />
        <input placeholder="privacy_assessment 10..5000" value={centralForm.privacy_assessment} onChange={e=>setCentralForm({...centralForm, privacy_assessment:e.target.value})} />
        <input placeholder="client_account_id" value={centralForm.client_account_id} onChange={e=>setCentralForm({...centralForm, client_account_id:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ext/central-projects", centralForm); setMsg("central projeto criado projeto separado privacidade aprovada"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar central projeto</button>
      </div>
      <ul>{central.map((c:any)=><li key={c.id}>{c.protocol} {c.title} escopo:{c.scope?.slice(0,40)} status:{c.status} privAprov:{String(c.is_privacy_approved)} aprovado:{String(c.is_approved)}</li>)}</ul>

      <h3>EXT-17 Biometria (título 5..200, desc 10..2000, tipo facial/digital/iris/voz/outra, necessity 20..2000, impact 20..5000, legal_basis 10..2000, client_account_id, protocolo BIO-EXT-, status rascunho/em_analise_privacidade/aprovado_privacidade/em_implantacao/ativo/suspenso/arquivado/rejeitado, is_approved collection_active CHECK collection requer is_approved — biometria projeto separado privacidade aprovada não coletar por padrão)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="título 5..200" value={bioForm.title} onChange={e=>setBioForm({...bioForm, title:e.target.value})} />
        <input placeholder="descrição 10..2000" value={bioForm.description} onChange={e=>setBioForm({...bioForm, description:e.target.value})} />
        <select value={bioForm.biometry_type} onChange={e=>setBioForm({...bioForm, biometry_type:e.target.value})}>
          <option value="facial">facial</option><option value="digital">digital</option><option value="iris">iris</option><option value="voz">voz</option><option value="outra">outra</option>
        </select>
        <input placeholder="necessidade 20..2000" value={bioForm.necessity} onChange={e=>setBioForm({...bioForm, necessity:e.target.value})} />
        <input placeholder="impacto 20..5000" value={bioForm.impact_assessment} onChange={e=>setBioForm({...bioForm, impact_assessment:e.target.value})} />
        <input placeholder="base legal 10..2000" value={bioForm.legal_basis} onChange={e=>setBioForm({...bioForm, legal_basis:e.target.value})} />
        <input placeholder="client_account_id" value={bioForm.client_account_id} onChange={e=>setBioForm({...bioForm, client_account_id:e.target.value})} />
        <button onClick={async()=>{ try{ await post("/api/ext/biometry-projects", bioForm); setMsg("biometria projeto criado não coletar por padrão"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar biometria projeto</button>
      </div>
      <ul>{biometry.map((b:any)=><li key={b.id}>{b.protocol} {b.title} tipo:{b.biometry_type} status:{b.status} aprovado:{String(b.is_approved)} coleta:{String(b.collection_active)} legal:{b.legal_basis?.slice(0,40)}</li>)}</ul>

      <h3>AI-10 Automações determinísticas (nome 3..200, desc 10..2000, tipo vencimento/distribuicao_tarefa/cobranca_interna/notificacao/relatorio/outra, rules JSONB is_deterministic true, cron 5..100, status ativa/inativa/em_teste/falhou/pausada — AI desligado só automações determinísticas antes agentes autônomos AI-01..09)</h3>
      <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
        <input placeholder="nome 3..200" value={autoForm.name} onChange={e=>setAutoForm({...autoForm, name:e.target.value})} />
        <input placeholder="descrição 10..2000" value={autoForm.description} onChange={e=>setAutoForm({...autoForm, description:e.target.value})} />
        <select value={autoForm.automation_type} onChange={e=>setAutoForm({...autoForm, automation_type:e.target.value})}>
          <option value="vencimento">vencimento</option><option value="distribuicao_tarefa">distribuicao_tarefa</option><option value="cobranca_interna">cobranca_interna</option><option value="notificacao">notificacao</option><option value="relatorio">relatorio</option><option value="outra">outra</option>
        </select>
        <input placeholder='rules JSON {}' value={autoForm.rules} onChange={e=>setAutoForm({...autoForm, rules:e.target.value})} />
        <input placeholder="cron 5..100" value={autoForm.schedule_cron} onChange={e=>setAutoForm({...autoForm, schedule_cron:e.target.value})} />
        <button onClick={async()=>{ try{ const rules = autoForm.rules ? JSON.parse(autoForm.rules) : {}; await post("/api/ext/ai-automations", {name:autoForm.name,description:autoForm.description,automation_type:autoForm.automation_type,rules,schedule_cron:autoForm.schedule_cron||null}); setMsg("automação determinística criada AI-10"); load(); } catch(e:any){ setMsg(e.message); } }}>Criar automação</button>
      </div>
      <ul>{automations.map((a:any)=><li key={a.id}>{a.name} tipo:{a.automation_type} status:{a.status} determinística:{String(a.is_deterministic)} cron:{a.schedule_cron} runs:{a.run_count} erros:{a.error_count} último:{a.last_run_at}</li>)}</ul>

      <h3>AI-10 Logs automação (automation_id, action 3..200, result 3..5000, success, duration_ms, atualiza contadores)</h3>
      <ul>{autoLogs.slice(0,20).map((l:any)=><li key={l.id}>auto:{l.automation_id} ação:{l.action} success:{String(l.success)} dur:{l.duration_ms}ms result:{l.result?.slice(0,60)}</li>)}</ul>
    </section>
  );
}
