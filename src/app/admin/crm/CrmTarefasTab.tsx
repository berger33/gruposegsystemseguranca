"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Badge, Notice, Section, SessionHint, apiJson, btn, btnPrimary, colors, fmtDate, input, label, tableStyle, td, th,
} from "./crm-ui";

type Task = {
  id: string; title: string; description: string | null; status: string; priority: string;
  due_date: string | null; is_overdue: boolean; company_name: string | null;
  opportunity_title: string | null; responsible_display: string | null;
  cadence_key: string | null; cadence_step: number | null;
};
type Cadence = { key: string; name: string; description: string; steps: { step: number; offsetDays: number; priority: string; title: string }[] };

const NEXT_ACTIONS: Record<string, { status: string; label: string }[]> = {
  aberta: [{ status: "em_andamento", label: "Iniciar" }, { status: "cancelada", label: "Cancelar" }],
  em_andamento: [{ status: "concluida", label: "Concluir" }, { status: "cancelada", label: "Cancelar" }],
  concluida: [{ status: "aberta", label: "Reabrir" }],
  cancelada: [],
};

export default function CrmTarefasTab() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [companies, setCompanies] = useState<{ id: string; display_name: string }[]>([]);
  const [opps, setOpps] = useState<{ id: string; title: string; company_id: string }[]>([]);
  const [cadences, setCadences] = useState<Cadence[]>([]);
  const [filter, setFilter] = useState({ status: "", overdue: false, mine: false, search: "" });
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams();
      if (filter.status) params.set("status", filter.status);
      if (filter.overdue) params.set("overdue", "1");
      if (filter.mine) params.set("responsible", "me");
      if (filter.search) params.set("search", filter.search);
      params.set("limit", "200");
      const data = await apiJson(`/api/crm/tasks?${params.toString()}`);
      setTasks(data.tasks || []);
      setTotal(data.total || 0);
    } catch (e: any) { setError(e.message); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const c = await apiJson("/api/crm/companies?limit=200");
        setCompanies((c.companies || []).map((x: any) => ({ id: x.id, display_name: x.display_name })));
      } catch { /* auxiliar */ }
      try {
        const o = await apiJson("/api/crm/opportunities?limit=200");
        setOpps((o.opportunities || []).map((x: any) => ({ id: x.id, title: x.title, company_id: x.company_id })));
      } catch { /* auxiliar */ }
      try {
        const cad = await apiJson("/api/crm/cadences");
        setCadences(cad.cadences || []);
      } catch { /* auxiliar */ }
    })();
  }, []);

  async function createTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true); setError(""); setOk("");
    try {
      const opportunityId = String(fd.get("opportunity_id") || "");
      const companyId = String(fd.get("company_id") || "");
      await apiJson("/api/crm/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: fd.get("title"),
          description: fd.get("description") || undefined,
          priority: fd.get("priority"),
          due_date: fd.get("due_date") || undefined,
          company_id: companyId || undefined,
          opportunity_id: opportunityId || undefined,
        }),
      });
      setOk("Tarefa criada com responsável derivado da sua sessão.");
      form.reset();
      await load();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  async function changeStatus(task: Task, status: string) {
    setBusy(true); setError(""); setOk("");
    try {
      await apiJson(`/api/crm/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      setOk(`Tarefa "${task.title}" agora está ${status}.`);
      await load();
    } catch (e: any) {
      const payload = (e as any).payload;
      setError(payload?.current ? `Transição recusada: de "${payload.current}" não é possível ir para "${payload.target}".` : e.message);
    } finally { setBusy(false); }
  }

  async function enroll(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true); setError(""); setOk("");
    try {
      const data = await apiJson("/api/crm/cadences/enroll", {
        method: "POST",
        body: JSON.stringify({
          cadence_key: fd.get("cadence_key"),
          company_id: fd.get("company_id"),
          opportunity_id: fd.get("opportunity_id") || undefined,
          start_at: fd.get("start_at") || undefined,
        }),
      });
      setOk(`Cadência "${data.cadence}" aderida: ${data.enrolled} tarefas criadas. Nenhuma mensagem é disparada automaticamente.`);
      await load();
    } catch (e: any) {
      setError(e.message === "cadence_already_enrolled" ? "Este alvo já aderiu a esta cadência — a adesão é idempotente para não duplicar fila de trabalho." : e.message);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Section
        title="Nova tarefa (CRM-07)"
        hint="Toda tarefa pertence a uma empresa ou a uma oportunidade. O responsável é derivado da sessão; o prazo alimenta a lista de vencidas."
      >
        <form onSubmit={createTask} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            <label style={label}>Título*<input required name="title" maxLength={200} style={input} /></label>
            <label style={label}>Empresa
              <select name="company_id" defaultValue="" style={input}>
                <option value="">—</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
              </select>
            </label>
            <label style={label}>Oportunidade (opcional)
              <select name="opportunity_id" defaultValue="" style={input}>
                <option value="">—</option>
                {opps.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
              </select>
            </label>
            <label style={label}>Prioridade
              <select name="priority" defaultValue="media" style={input}>
                <option value="baixa">baixa</option><option value="media">média</option>
                <option value="alta">alta</option><option value="critica">crítica</option>
              </select>
            </label>
            <label style={label}>Vencimento<input name="due_date" type="datetime-local" style={input} /></label>
          </div>
          <label style={label}>Descrição<textarea name="description" maxLength={2000} style={{ ...input, minHeight: 50, width: "100%", boxSizing: "border-box" }} /></label>
          <div><button type="submit" disabled={busy} style={btnPrimary}>Criar tarefa</button></div>
        </form>
        {error && <Notice kind="erro">{error}</Notice>}
        {error && <SessionHint error={error} />}
        {ok && <Notice kind="ok">{ok}</Notice>}
      </Section>

      <Section
        title="Cadências de prospecção (CRM-09)"
        hint="Cadência é fila de trabalho humano: cada passo vira uma tarefa com prazo. Nenhuma mensagem é enviada automaticamente — automação exigiria autorização do titular, opt-out e provedor contratado."
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10, marginBottom: 12 }}>
          {cadences.map((c) => (
            <div key={c.key} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 10, background: "#f8fafc", minWidth: 0 }}>
              <h3 style={{ fontSize: 13, margin: "0 0 4px" }}>{c.name} ({c.steps.length} passos)</h3>
              <p style={{ fontSize: 11.5, color: colors.muted, margin: "0 0 6px" }}>{c.description}</p>
              <ol style={{ margin: 0, paddingLeft: 16, fontSize: 11.5 }}>
                {c.steps.map((s) => <li key={s.step}>D+{s.offsetDays}: {s.title}</li>)}
              </ol>
            </div>
          ))}
          {cadences.length === 0 && <p style={{ fontSize: 12, color: colors.muted }}>Nenhum modelo de cadência disponível.</p>}
        </div>
        <form onSubmit={enroll} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={label}>Cadência
            <select name="cadence_key" defaultValue={cadences[0]?.key || ""} style={input}>
              {cadences.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
            </select>
          </label>
          <label style={label}>Empresa*
            <select required name="company_id" defaultValue="" style={input}>
              <option value="" disabled>selecione…</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
            </select>
          </label>
          <label style={label}>Oportunidade (opcional)
            <select name="opportunity_id" defaultValue="" style={input}>
              <option value="">—</option>
              {opps.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
          </label>
          <label style={label}>Início<input name="start_at" type="date" style={input} /></label>
          <button type="submit" disabled={busy} style={btn}>Aderir à cadência</button>
        </form>
      </Section>

      <Section title={`Tarefas (${total})`} hint="Filtros por situação, vencidas e responsável; busca por título ou descrição.">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <input
            aria-label="Buscar tarefa"
            placeholder="Buscar por título ou descrição"
            style={{ ...input, minWidth: 220 }}
            value={filter.search}
            onChange={(e) => setFilter({ ...filter, search: e.target.value })}
          />
          <select aria-label="Filtrar por situação" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} style={input}>
            <option value="">todas as situações</option>
            <option value="aberta">aberta</option><option value="em_andamento">em andamento</option>
            <option value="concluida">concluída</option><option value="cancelada">cancelada</option>
          </select>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
            <input type="checkbox" checked={filter.overdue} onChange={(e) => setFilter({ ...filter, overdue: e.target.checked })} /> só vencidas
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
            <input type="checkbox" checked={filter.mine} onChange={(e) => setFilter({ ...filter, mine: e.target.checked })} /> minhas
          </label>
          <button onClick={load} style={btn}>Atualizar</button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={th}>Tarefa</th><th style={th}>Vínculo</th><th style={th}>Prazo</th>
                <th style={th}>Situação</th><th style={th}>Responsável</th><th style={th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} style={t.is_overdue ? { background: "#fff8f8" } : undefined}>
                  <td style={td}>
                    <strong>{t.title}</strong>
                    {t.cadence_key && <div style={{ marginTop: 4 }}><Badge tone="warn">cadência {t.cadence_key} · passo {t.cadence_step}</Badge></div>}
                    {t.description && <div style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{t.description}</div>}
                  </td>
                  <td style={td}>{t.opportunity_title || t.company_name || "—"}</td>
                  <td style={td}>
                    {fmtDate(t.due_date, true)}
                    {t.is_overdue && <div><Badge tone="bad">vencida</Badge></div>}
                  </td>
                  <td style={td}><Badge tone={t.status === "concluida" ? "ok" : t.status === "cancelada" ? "neutral" : "warn"}>{t.status}</Badge></td>
                  <td style={td}>{t.responsible_display || "—"}</td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(NEXT_ACTIONS[t.status] || []).map((a) => (
                        <button key={a.status} onClick={() => changeStatus(t, a.status)} disabled={busy} style={btn}>{a.label}</button>
                      ))}
                      {(NEXT_ACTIONS[t.status] || []).length === 0 && <span style={{ fontSize: 11.5, color: colors.muted }}>estado final</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {tasks.length === 0 && <tr><td style={td} colSpan={6}>Nenhuma tarefa com esses filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
