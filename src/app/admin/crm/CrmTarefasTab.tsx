"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, Badge, btn, btnPrimary, card, colors, ErrorBox, fmtDate, input, label, Notice, SectionTitle, td, th } from "./crm-ui";

type Task = {
  id: string; title: string; description: string | null; status: string; priority: string;
  due_date: string | null; is_overdue: boolean; company_id: string | null; company_name: string | null;
  opportunity_id: string | null; opportunity_title: string | null;
  cadence_key: string | null; cadence_step: number | null;
};
type Cadence = { key: string; name: string; description: string; steps: { step: number; offsetDays: number; priority: string; title: string }[] };

const NEXT_ACTIONS: Record<string, [string, string][]> = {
  aberta: [["em_andamento", "Iniciar"], ["concluida", "Concluir"], ["cancelada", "Cancelar"]],
  em_andamento: [["concluida", "Concluir"], ["aberta", "Voltar para aberta"], ["cancelada", "Cancelar"]],
  concluida: [["aberta", "Reabrir"]],
  cancelada: [],
};
const STATUS_TONE: Record<string, string> = { aberta: "info", em_andamento: "warn", concluida: "ok", cancelada: "neutral" };

export default function CrmTarefasTab() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cadences, setCadences] = useState<Cadence[]>([]);
  const [companies, setCompanies] = useState<{ id: string; display_name: string }[]>([]);
  const [filter, setFilter] = useState({ status: "", overdue: false, mine: false, search: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Guarda de resposta atrasada: sem isto, a busca de um filtro antigo
  // pode chegar depois e sobrescrever o resultado do filtro atual.
  const requestSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++requestSeq.current;

    setError("");
    try {
      const params = new URLSearchParams();
      if (filter.status) params.set("status", filter.status);
      if (filter.overdue) params.set("overdue", "1");
      if (filter.mine) params.set("responsible", "me");
      if (filter.search) params.set("search", filter.search);
      params.set("limit", "200");
      const data = await apiFetch(`/api/crm/tasks?${params.toString()}`);
      if (seq !== requestSeq.current) return;
      setTasks(data.tasks || []);
    } catch (e: any) { setError(e.message); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch("/api/crm/cadences");
        setCadences(data.cadences || []);
      } catch { /* cadências indisponíveis sem sessão */ }
      try {
        const data = await apiFetch("/api/crm/companies?limit=200");
        setCompanies(data.companies || []);
      } catch { /* lista auxiliar */ }
    })();
  }, []);

  async function createTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(""); setNotice("");
    try {
      await apiFetch("/api/crm/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: fd.get("company_id"),
          title: fd.get("title"),
          description: fd.get("description") || undefined,
          due_date: fd.get("due_date") || undefined,
          priority: fd.get("priority"),
        }),
      });
      setNotice("Tarefa criada — o responsável é derivado da sessão, nunca do formulário.");
      form.reset();
      await load();
    } catch (e: any) { setError(e.message); }
  }

  async function changeStatus(task: Task, status: string) {
    setError(""); setNotice("");
    try {
      await apiFetch(`/api/crm/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setNotice(`Tarefa "${task.title}" → ${status}.`);
      await load();
    } catch (e: any) { setError(e.message); }
  }

  async function enrollCadence(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(""); setNotice("");
    try {
      const data = await apiFetch("/api/crm/cadences/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cadence_key: fd.get("cadence_key"),
          company_id: fd.get("company_id"),
          start_at: fd.get("start_at") || undefined,
        }),
      });
      setNotice(`Cadência "${data.cadence}" aderida: ${data.enrolled} tarefas criadas para execução humana (sem disparo automático).`);
      await load();
    } catch (e: any) {
      setError(e.message === "cadence_already_enrolled" ? "cadence_already_enrolled — esta empresa já está nesta cadência" : e.message);
    }
  }

  return (
    <>
      <section style={card}>
        <SectionTitle title="Nova tarefa (CRM-07)" hint="Tarefas vencidas aparecem destacadas e podem ser filtradas." />
        <ErrorBox error={error} />
        <Notice>{notice}</Notice>
        <form onSubmit={createTask} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <label style={label}>Empresa*
              <select required name="company_id" style={input} defaultValue="">
                <option value="" disabled>selecione</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
              </select>
            </label>
            <label style={label}>Título*<input required name="title" style={input} /></label>
            <label style={label}>Descrição<input name="description" style={input} /></label>
            <label style={label}>Vencimento<input name="due_date" type="datetime-local" style={input} /></label>
            <label style={label}>Prioridade
              <select name="priority" style={input} defaultValue="media">
                <option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option>
              </select>
            </label>
          </div>
          <div><button type="submit" style={btnPrimary}>Criar tarefa</button></div>
        </form>
      </section>

      <section style={card}>
        <SectionTitle title="Cadências de prospecção (CRM-09)" hint="A cadência materializa tarefas reais com prazo; não há disparo automático de mensagem (depende de autorização, opt-out e provedor)." />
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", marginBottom: 12 }}>
          {cadences.map((c) => (
            <div key={c.key} style={{ border: `1px solid ${colors.border}`, borderRadius: 8, padding: 10, background: "#f8fafc" }}>
              <h3 style={{ fontSize: 13, margin: "0 0 4px" }}>{c.name} ({c.steps.length} passos)</h3>
              <p style={{ fontSize: 11, color: colors.muted, margin: "0 0 6px" }}>{c.description}</p>
              <ol style={{ margin: 0, paddingLeft: 16, fontSize: 11 }}>
                {c.steps.map((s) => <li key={s.step}>D+{s.offsetDays}: {s.title}</li>)}
              </ol>
            </div>
          ))}
          {cadences.length === 0 && <p style={{ fontSize: 13, color: colors.muted }}>Nenhuma cadência disponível (é preciso sessão de staff).</p>}
        </div>
        <form onSubmit={enrollCadence} style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <label style={label}>Cadência*
            <select required name="cadence_key" style={input} defaultValue="">
              <option value="" disabled>selecione</option>
              {cadences.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
            </select>
          </label>
          <label style={label}>Empresa*
            <select required name="company_id" style={input} defaultValue="">
              <option value="" disabled>selecione</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
            </select>
          </label>
          <label style={label}>Início<input name="start_at" type="datetime-local" style={input} /></label>
          <div style={{ alignSelf: "end" }}><button type="submit" style={btnPrimary}>Aderir à cadência</button></div>
        </form>
      </section>

      <section style={card}>
        <SectionTitle title={`Tarefas (${tasks.length})`} hint="Filtros de situação, vencidas e responsável; busca por título ou descrição." />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
          <input aria-label="Buscar tarefa" placeholder="Buscar tarefa" style={{ ...input, minWidth: 200 }}
                 value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} />
          <select aria-label="Filtrar por situação" style={input} value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
            <option value="">Todas as situações</option>
            <option value="aberta">Aberta</option><option value="em_andamento">Em andamento</option>
            <option value="concluida">Concluída</option><option value="cancelada">Cancelada</option>
          </select>
          <label style={{ fontSize: 12, fontWeight: 600, color: colors.muted }}>
            <input type="checkbox" checked={filter.overdue} onChange={(e) => setFilter({ ...filter, overdue: e.target.checked })} /> Só vencidas
          </label>
          <label style={{ fontSize: 12, fontWeight: 600, color: colors.muted }}>
            <input type="checkbox" checked={filter.mine} onChange={(e) => setFilter({ ...filter, mine: e.target.checked })} /> Minhas
          </label>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
            <thead><tr><th style={th}>Tarefa</th><th style={th}>Vencimento</th><th style={th}>Situação</th><th style={th}>Prioridade</th><th style={th}>Ações</th></tr></thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} style={t.is_overdue ? { background: "#fff7f6" } : undefined}>
                  <td style={td}>
                    <strong>{t.title}</strong>
                    <div style={{ fontSize: 11, color: colors.muted, overflowWrap: "anywhere" }}>
                      {t.company_name || "sem empresa"}{t.opportunity_title ? ` · ${t.opportunity_title}` : ""}
                      {t.cadence_key ? <> · <Badge tone="warn">cadência {t.cadence_key} · passo {t.cadence_step}</Badge></> : null}
                    </div>
                  </td>
                  <td style={td}>{fmtDate(t.due_date)} {t.is_overdue ? <Badge tone="bad">vencida</Badge> : null}</td>
                  <td style={td}><Badge tone={STATUS_TONE[t.status] || "neutral"}>{t.status}</Badge></td>
                  <td style={td}>{t.priority}</td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {(NEXT_ACTIONS[t.status] || []).map(([next, text]) => (
                        <button key={next} style={btn} onClick={() => changeStatus(t, next)}>{text}</button>
                      ))}
                      {(NEXT_ACTIONS[t.status] || []).length === 0 && <span style={{ fontSize: 11, color: colors.muted }}>estado final</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {tasks.length === 0 && <tr><td style={td} colSpan={5}>Nenhuma tarefa para este filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
