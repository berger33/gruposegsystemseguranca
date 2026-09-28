"use client";
import { useEffect, useState } from "react";

export default function CommissionClient() {
  const [goals, setGoals] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [goalForm, setGoalForm] = useState({ title: "", target_value: "", period_start: "", period_end: "", target_type: "contratado", responsible_name: "" });
  const [ruleForm, setRuleForm] = useState({ name: "", base_type: "contratado", period_type: "mensal", percent: "5", cancel_rule: "estorna_proporcional", requires_approval: true, approver_role: "marcelo" });
  const [commForm, setCommForm] = useState({ rule_id: "", base_value: "", period_start: "", period_end: "", responsible_name: "" });

  async function load() {
    const [g, r, c] = await Promise.all([
      fetch("/api/crm/goals?limit=100").then(res => res.json()),
      fetch("/api/crm/commission-rules?limit=100").then(res => res.json()),
      fetch("/api/crm/commissions?limit=100").then(res => res.json()),
    ]);
    if (g.goals) setGoals(g.goals);
    if (r.rules) setRules(r.rules);
    if (c.commissions) setCommissions(c.commissions);
  }

  useEffect(() => { load(); }, []);

  async function createGoal() {
    if (!goalForm.title || !goalForm.target_value || !goalForm.period_start || !goalForm.period_end) { setMsg("Título, valor, período obrigatórios"); return; }
    const body = { title: goalForm.title, target_value: Number(goalForm.target_value), period_start: goalForm.period_start, period_end: goalForm.period_end, target_type: goalForm.target_type, responsible_name: goalForm.responsible_name };
    const res = await fetch("/api/crm/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json();
    if (!res.ok) setMsg(`Erro criar meta: ${j.error}`);
    else { setMsg(`Meta criada ${j.goal.id}`); load(); }
  }

  async function createRule() {
    if (!ruleForm.name || !ruleForm.percent) { setMsg("Nome e percentual obrigatórios"); return; }
    const body = { name: ruleForm.name, base_type: ruleForm.base_type, period_type: ruleForm.period_type, percent: Number(ruleForm.percent), cancel_rule: ruleForm.cancel_rule, requires_approval: ruleForm.requires_approval, approver_role: ruleForm.approver_role };
    const res = await fetch("/api/crm/commission-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json();
    if (!res.ok) setMsg(`Erro criar regra: ${j.error}`);
    else { setMsg(`Regra criada ${j.rule.id}`); load(); }
  }

  async function createCommission() {
    if (!commForm.rule_id || !commForm.base_value || !commForm.period_start || !commForm.period_end) { setMsg("rule_id, base_value, período obrigatórios"); return; }
    const body = { rule_id: commForm.rule_id, base_value: Number(commForm.base_value), period_start: commForm.period_start, period_end: commForm.period_end, responsible_name: commForm.responsible_name };
    const res = await fetch("/api/crm/commissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json();
    if (!res.ok) setMsg(`Erro criar comissão: ${j.error}`);
    else { setMsg(`Comissão criada ${j.commission.id} valor calculado R$ ${j.commission.calculated_value} — sem pagamento automático`); load(); }
  }

  async function approveCommission(id: string) {
    const res = await fetch(`/api/crm/commissions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "aprovada", approval_notes: "Aprovada pela gestão" }) });
    const j = await res.json();
    if (!res.ok) setMsg(`Erro aprovar: ${j.error}`);
    else { setMsg(`Comissão ${id} aprovada`); load(); }
  }

  async function payCommission(id: string) {
    const res = await fetch(`/api/crm/commissions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_paid: true, paid_note: "Pagamento manual registrado, não automático" }) });
    const j = await res.json();
    if (!res.ok) setMsg(`Erro pagar: ${j.error} ${j.current_status ? `status atual ${j.current_status}` : ""}`);
    else { setMsg(`Comissão ${id} marcada como paga manualmente`); load(); }
  }

  return (
    <section style={{ marginTop: 24, padding: 16, border: "1px solid #ccc", borderRadius: 8 }}>
      <h2>CRM-25 — Metas e comissões versionadas</h2>
      <p style={{ fontSize: 12, color: "#555" }}>Base de cálculo contratado/faturado/recebido, período, cancelamento e aprovação configuráveis, sem pagamento automático. Metas versionadas, regras versionadas, comissões com status rascunho/pendente_aprovacao/aprovada/rejeitada/cancelada/estornada, is_paid manual.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <h4>Meta</h4>
          <input placeholder="título" value={goalForm.title} onChange={e => setGoalForm({ ...goalForm, title: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="target_value" type="number" value={goalForm.target_value} onChange={e => setGoalForm({ ...goalForm, target_value: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="period_start YYYY-MM-DD" value={goalForm.period_start} onChange={e => setGoalForm({ ...goalForm, period_start: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <input placeholder="period_end YYYY-MM-DD" value={goalForm.period_end} onChange={e => setGoalForm({ ...goalForm, period_end: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <select value={goalForm.target_type} onChange={e => setGoalForm({ ...goalForm, target_type: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="contratado">contratado</option>
            <option value="faturado">faturado</option>
            <option value="recebido">recebido</option>
          </select>
          <input placeholder="responsible_name" value={goalForm.responsible_name} onChange={e => setGoalForm({ ...goalForm, responsible_name: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <button onClick={createGoal}>Criar meta</button>
          <ul style={{ fontSize: 11 }}>{goals.map(g => <li key={g.id}>{g.title} R$ {g.target_value} {g.target_type} {g.period_start}→{g.period_end} {g.status} v{g.version}</li>)}</ul>
        </div>

        <div>
          <h4>Regra comissão</h4>
          <input placeholder="nome" value={ruleForm.name} onChange={e => setRuleForm({ ...ruleForm, name: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <select value={ruleForm.base_type} onChange={e => setRuleForm({ ...ruleForm, base_type: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="contratado">contratado</option>
            <option value="faturado">faturado</option>
            <option value="recebido">recebido</option>
          </select>
          <select value={ruleForm.period_type} onChange={e => setRuleForm({ ...ruleForm, period_type: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="mensal">mensal</option>
            <option value="trimestral">trimestral</option>
            <option value="semestral">semestral</option>
            <option value="anual">anual</option>
            <option value="por_contrato">por_contrato</option>
          </select>
          <input placeholder="percent" type="number" value={ruleForm.percent} onChange={e => setRuleForm({ ...ruleForm, percent: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <select value={ruleForm.cancel_rule} onChange={e => setRuleForm({ ...ruleForm, cancel_rule: e.target.value })} style={{ width: "100%", marginBottom: 4 }}>
            <option value="mantem">mantem</option>
            <option value="estorna_proporcional">estorna_proporcional</option>
            <option value="estorna_total">estorna_total</option>
            <option value="recalcula">recalcula</option>
          </select>
          <label style={{ fontSize: 11 }}><input type="checkbox" checked={ruleForm.requires_approval} onChange={e => setRuleForm({ ...ruleForm, requires_approval: e.target.checked })} /> requires_approval</label>
          <input placeholder="approver_role" value={ruleForm.approver_role} onChange={e => setRuleForm({ ...ruleForm, approver_role: e.target.value })} style={{ width: "100%", marginBottom: 4 }} />
          <button onClick={createRule}>Criar regra</button>
          <ul style={{ fontSize: 11 }}>{rules.map(r => <li key={r.id}>{r.name} {r.base_type} {r.period_type} {r.percent}% cancel {r.cancel_rule} {r.requires_approval ? "aprovação" : "sem aprovação"} {r.status} v{r.version}</li>)}</ul>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <h4>Comissão</h4>
        <input placeholder="rule_id *" value={commForm.rule_id} onChange={e => setCommForm({ ...commForm, rule_id: e.target.value })} style={{ width: 320 }} />
        <input placeholder="base_value *" type="number" value={commForm.base_value} onChange={e => setCommForm({ ...commForm, base_value: e.target.value })} style={{ width: 120, marginLeft: 4 }} />
        <input placeholder="period_start" value={commForm.period_start} onChange={e => setCommForm({ ...commForm, period_start: e.target.value })} style={{ width: 140, marginLeft: 4 }} />
        <input placeholder="period_end" value={commForm.period_end} onChange={e => setCommForm({ ...commForm, period_end: e.target.value })} style={{ width: 140, marginLeft: 4 }} />
        <input placeholder="responsible_name" value={commForm.responsible_name} onChange={e => setCommForm({ ...commForm, responsible_name: e.target.value })} style={{ width: 140, marginLeft: 4 }} />
        <button onClick={createCommission} style={{ marginLeft: 4 }}>Criar comissão</button>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 8 }}>
          <thead><tr><th>id</th><th>regra</th><th>base tipo</th><th>base valor</th><th>%</th><th>calculado</th><th>período</th><th>status</th><th>pago?</th><th>ações</th></tr></thead>
          <tbody>{commissions.map(c => (
            <tr key={c.id}>
              <td>{c.id.slice(0,8)}</td>
              <td>{c.rule_id.slice(0,8)}</td>
              <td>{c.base_type}</td>
              <td>R$ {c.base_value}</td>
              <td>{c.percent}%</td>
              <td>R$ {c.calculated_value}</td>
              <td>{c.period_start}→{c.period_end}</td>
              <td>{c.status}</td>
              <td>{c.is_paid ? "sim" : "não (sem pagamento automático)"}</td>
              <td>
                <button onClick={() => approveCommission(c.id)}>Aprovar</button>
                <button onClick={() => payCommission(c.id)} style={{ marginLeft: 4 }}>Pagar manual</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      {msg && <div style={{ marginTop: 8, fontSize: 12 }}>{msg}</div>}
    </section>
  );
}
