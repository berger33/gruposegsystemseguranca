"use client";
import { useState } from "react";

export default function ContractAlertClient() {
  const [contractId, setContractId] = useState("");
  const [rules, setRules] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [ruleForm, setRuleForm] = useState({ alert_type: "vencimento", title: "", days_before: "30", channel: "sistema", responsible_name: "", opportunity_id: "", description: "" });
  const [alertForm, setAlertForm] = useState({ rule_id: "", due_date: "", scheduled_date: "", title: "", responsible_name: "", opportunity_id: "", notes: "", create_task: true });

  async function load() {
    if (!contractId.trim()) { setMsg("contract_id obrigatório"); return; }
    const id = contractId.trim();
    const [r, a] = await Promise.all([
      fetch(`/api/crm/contracts/${id}/alert-rules`).then(x => x.json()),
      fetch(`/api/crm/contracts/${id}/alerts`).then(x => x.json()),
    ]);
    if (r.rules) setRules(r.rules);
    if (a.alerts) setAlerts(a.alerts);
    setMsg(`Contrato ${id} — ${r.rules?.length || 0} regras, ${a.alerts?.length || 0} alertas. ${r.note || ""}`);
  }

  async function createRule() {
    if (!ruleForm.title.trim() || !ruleForm.days_before.trim() || !ruleForm.responsible_name.trim()) { setMsg("title, days_before, responsible_name obrigatórios"); return; }
    const body = {
      alert_type: ruleForm.alert_type,
      title: ruleForm.title.trim(),
      description: ruleForm.description.trim() || null,
      days_before: Number(ruleForm.days_before),
      channel: ruleForm.channel,
      responsible_name: ruleForm.responsible_name.trim(),
      opportunity_id: ruleForm.opportunity_id.trim() || null,
      is_enabled: true,
    };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/alert-rules`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro criar regra: ${j.error}`);
    else { setMsg(`Regra criada ${j.rule.id} — ${j.note}`); load(); }
  }

  async function createAlert() {
    if (!contractId.trim()) { setMsg("contract_id obrigatório"); return; }
    const body: any = {
      rule_id: alertForm.rule_id.trim() || null,
      due_date: alertForm.due_date.trim() || null,
      scheduled_date: alertForm.scheduled_date.trim() || null,
      title: alertForm.title.trim() || null,
      responsible_name: alertForm.responsible_name.trim() || null,
      opportunity_id: alertForm.opportunity_id.trim() || null,
      notes: alertForm.notes.trim() || null,
      create_task: alertForm.create_task,
    };
    const r = await fetch(`/api/crm/contracts/${contractId.trim()}/alerts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) setMsg(`Erro criar alerta: ${j.error}`);
    else { setMsg(`Alerta criado ${j.alert.id} task ${j.task_id} — ${j.note}`); load(); }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #27ae60", borderRadius: 8 }}>
      <h2>CON-05 — Alertas configuráveis de vencimento/renovação, tarefas com responsável e negociação vinculada ao CRM</h2>
      <p style={{ fontSize: 12, color: "#555" }}>Regras configuráveis: alert_type vencimento/renovacao/reajuste/vigencia_fim/faturamento/outro, days_before 1..365, is_enabled, channel email/whatsapp/sistema/outro, responsável (responsible_name/responsible_id) e negociação vinculada (opportunity_id). Alertas gerados com scheduled_date = due_date - days_before, criam tarefa em crm_tasks com contract_id, company_id, opportunity_id, responsible_id, due_date = scheduled_date, status aberta prioridade alta. Tarefas com responsável e negociação vinculada ao CRM.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input placeholder="contract_id *" value={contractId} onChange={e => setContractId(e.target.value)} style={{ width: 360 }} />
        <button onClick={load}>Carregar regras e alertas</button>
      </div>

      {msg && <div style={{ fontSize: 12, marginBottom: 8, padding: 6, background: "#eafaf1" }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <h4>Regras configuráveis ({rules.length})</h4>
          <select value={ruleForm.alert_type} onChange={e => setRuleForm({ ...ruleForm, alert_type: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="vencimento">vencimento</option>
            <option value="renovacao">renovacao</option>
            <option value="reajuste">reajuste</option>
            <option value="vigencia_fim">vigencia_fim</option>
            <option value="faturamento">faturamento</option>
            <option value="outro">outro</option>
          </select>
          <input placeholder="title * ex: Alerta 30 dias vencimento" value={ruleForm.title} onChange={e => setRuleForm({ ...ruleForm, title: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="days_before * 1..365 ex: 30" type="number" value={ruleForm.days_before} onChange={e => setRuleForm({ ...ruleForm, days_before: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <select value={ruleForm.channel} onChange={e => setRuleForm({ ...ruleForm, channel: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="sistema">sistema</option><option value="email">email</option><option value="whatsapp">whatsapp</option><option value="outro">outro</option>
          </select>
          <input placeholder="responsible_name * ex: João Comercial" value={ruleForm.responsible_name} onChange={e => setRuleForm({ ...ruleForm, responsible_name: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="opportunity_id negociação vinculada (UUID opcional)" value={ruleForm.opportunity_id} onChange={e => setRuleForm({ ...ruleForm, opportunity_id: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <textarea placeholder="description" value={ruleForm.description} onChange={e => setRuleForm({ ...ruleForm, description: e.target.value })} style={{ width: "100%", minHeight: 50, marginBottom: 4 }} />
          <button onClick={createRule}>Criar regra configurável</button>

          <ul style={{ fontSize: 11, maxHeight: 200, overflowY: "auto", border: "1px solid #eee", padding: 8, marginTop: 8 }}>
            {rules.map((r: any) => (
              <li key={r.id} style={{ marginBottom: 4 }}>
                <strong>{r.alert_type} {r.title}</strong> — {r.days_before}d antes — canal {r.channel} — resp {r.responsible_name || r.responsible_id?.slice(0,8)} — opp {r.opportunity_id ? r.opportunity_id.slice(0,8) : "-"} — {r.is_enabled ? "ativa" : "desativa"} — id {r.id.slice(0,8)}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4>Alertas gerados ({alerts.length}) + tarefas</h4>
          <input placeholder="rule_id (se usar regra, calcula scheduled = due - days_before)" value={alertForm.rule_id} onChange={e => setAlertForm({ ...alertForm, rule_id: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="due_date YYYY-MM-DD (vencimento contrato) *" value={alertForm.due_date} onChange={e => setAlertForm({ ...alertForm, due_date: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="scheduled_date YYYY-MM-DD (quando alertar) auto se regra" value={alertForm.scheduled_date} onChange={e => setAlertForm({ ...alertForm, scheduled_date: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="title (se sem regra)" value={alertForm.title} onChange={e => setAlertForm({ ...alertForm, title: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="responsible_name (se sem regra)" value={alertForm.responsible_name} onChange={e => setAlertForm({ ...alertForm, responsible_name: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="opportunity_id negociação vinculada" value={alertForm.opportunity_id} onChange={e => setAlertForm({ ...alertForm, opportunity_id: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <textarea placeholder="notes" value={alertForm.notes} onChange={e => setAlertForm({ ...alertForm, notes: e.target.value })} style={{ width: "100%", minHeight: 40, marginBottom: 4 }} />
          <label style={{ fontSize: 11 }}><input type="checkbox" checked={alertForm.create_task} onChange={e => setAlertForm({ ...alertForm, create_task: e.target.checked })} /> create_task (cria tarefa com responsável e negociação vinculada)</label>
          <div><button onClick={createAlert} style={{ marginTop: 4 }}>Gerar alerta + tarefa</button></div>

          <ul style={{ fontSize: 11, maxHeight: 300, overflowY: "auto", border: "1px solid #eee", padding: 8, marginTop: 8 }}>
            {alerts.map((a: any) => (
              <li key={a.id} style={{ marginBottom: 4 }}>
                <strong>{a.alert_type} {a.title}</strong> — agendado {a.scheduled_date} venc {a.due_date} — status {a.status} — resp {a.responsible_name || a.responsible_id?.slice(0,8)} — opp {a.opportunity_id ? a.opportunity_id.slice(0,8) : "-"} — task {a.task_id ? a.task_id.slice(0,8) : "-"} — id {a.id.slice(0,8)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
