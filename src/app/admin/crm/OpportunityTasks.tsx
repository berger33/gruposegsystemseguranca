"use client";
import { useEffect, useState, type FormEvent } from "react";

type Task = { id: string; title: string; due_date: string | null; status: string };
const labels: Record<string, string> = { aberta: "Aberta", em_andamento: "Em andamento", concluida: "Concluída", cancelada: "Cancelada" };
const errors: Record<string, string> = {
  opportunity_not_found: "Tarefas disponíveis apenas para o responsável por esta oportunidade.",
  admin_session_required: "Entre novamente na área administrativa.",
  commercial_role_required: "Seu perfil não permite operar tarefas comerciais.",
  task_status_conflict: "A tarefa foi alterada ou encerrada. Atualize a lista antes de tentar novamente.",
  crm_tasks_unavailable: "Não foi possível salvar ou consultar as tarefas. Confira a lista antes de repetir.",
};
export default function OpportunityTasks({ opportunityId }: { opportunityId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const endpoint = "/api/crm/opportunities/" + opportunityId + "/tasks";

  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, { ...init, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(errors[data.error] || "Não foi possível concluir a operação.");
    return data;
  }
  async function refresh() {
    setLoading(true); setError("");
    try { const data = await request(endpoint); setTasks(data.tasks); }
    catch (e) { setTasks([]); setError(e instanceof Error ? e.message : "Falha ao consultar."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    request(endpoint).then(data => { if (active) setTasks(data.tasks); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [endpoint]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const date = new Date(due);
    if (!Number.isFinite(date.getTime())) { setError("Informe um prazo válido."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, due_date: date.toISOString() }) });
      setTasks(items => [...items, data.task].sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))));
      setTitle(""); setDue(""); setNotice("Tarefa salva.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  }
  async function change(task: Task, status: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await request(endpoint + "/" + task.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, expected_status: task.status }) });
      setTasks(items => items.map(item => item.id === task.id ? data.task : item));
      setNotice("Situação da tarefa atualizada.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao atualizar."); }
    finally { setBusy(false); }
  }
  const overdue = (task: Task) => !!task.due_date && new Date(task.due_date).getTime() < Date.now() && ["aberta", "em_andamento"].includes(task.status);
  const visible = tasks.filter(task => !overdueOnly || overdue(task));
  return (
    <section aria-label="Minhas tarefas da oportunidade" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 16, overflowWrap: "anywhere" }}>
      <h2>Minhas tarefas da oportunidade</h2>
      <p>Acompanhamento pessoal do responsável comercial. Prazos exibidos no horário deste dispositivo.</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading ? <p role="status">Carregando tarefas…</p> : (
        <>
          <form onSubmit={create} style={{ display: "grid", gap: 12 }}>
            <label>Título da tarefa<input value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} style={{ display: "block", width: "100%", boxSizing: "border-box" }} /></label>
            <label>Prazo da tarefa<input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} required style={{ display: "block", maxWidth: "100%" }} /></label>
            <button disabled={busy} type="submit">Criar tarefa</button>
          </form>
          <p><label><input type="checkbox" checked={overdueOnly} onChange={e => setOverdueOnly(e.target.checked)} /> Somente vencidas</label></p>
          <button type="button" onClick={refresh} disabled={busy}>Atualizar tarefas</button>
          <p>Até 200 tarefas recentes por oportunidade.</p>
          {visible.length === 0 && <p>Nenhuma tarefa neste filtro.</p>}
          <ul style={{ paddingLeft: 20 }}>
            {visible.map(task => <li key={task.id} style={{ marginTop: 12 }}>
              <strong>{task.title}</strong>
              <p>{labels[task.status]} — {task.due_date ? new Date(task.due_date).toLocaleString("pt-BR") : "Sem prazo"} {overdue(task) && <strong>— Vencida</strong>}</p>
              {["aberta", "em_andamento"].includes(task.status) && <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {task.status === "aberta" && <button disabled={busy} onClick={() => change(task, "em_andamento")}>Iniciar</button>}
                <button disabled={busy} onClick={() => change(task, "concluida")}>Concluir</button>
                <button disabled={busy} onClick={() => change(task, "cancelada")}>Cancelar tarefa</button>
              </div>}
            </li>)}
          </ul>
        </>
      )}
    </section>
  );
}
