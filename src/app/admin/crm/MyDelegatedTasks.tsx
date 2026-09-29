"use client";
import { useCallback, useEffect, useState } from "react";

// CRM-07: personal view of tasks explicitly delegated to the signed-in
// comercial. Acceptance transfers the task responsibility; nothing else of
// the delegator's opportunity is exposed here.
type DelegatedTask = {
  id: string; title: string; due_date: string | null; status: string; priority: string;
  delegation_status: string; delegated_at: string;
  opportunity_title: string; company_name: string; delegated_by_name: string;
};
const PAGE = 25;
const labels: Record<string, string> = { aberta: "Aberta", em_andamento: "Em andamento", concluida: "Concluída", cancelada: "Cancelada" };
const errors: Record<string, string> = {
  admin_session_required: "Entre novamente na área administrativa.",
  commercial_role_required: "Somente o papel comercial recebe delegações.",
  delegation_not_found: "A delegação não está mais pendente. Atualize a lista.",
  task_not_found: "A tarefa não está mais sob sua responsabilidade. Atualize a lista.",
  task_status_conflict: "A tarefa foi alterada em outra janela. Atualize a lista.",
  crm_tasks_unavailable: "Não foi possível consultar ou salvar. Confira a lista antes de repetir.",
};
export default function MyDelegatedTasks() {
  const [tasks, setTasks] = useState<DelegatedTask[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, { ...init, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(errors[data.error] || "Não foi possível concluir a operação.");
    return data;
  }
  const refresh = useCallback(async (nextOffset = 0) => {
    setLoading(true); setError("");
    try {
      const data = await request(`/api/crm/tasks/delegated?limit=${PAGE}&offset=${nextOffset}`);
      setTasks(data.tasks); setTotal(data.total); setOffset(data.offset);
    } catch (e) { setTasks([]); setTotal(0); setError(e instanceof Error ? e.message : "Falha ao consultar."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(0); }, [refresh]);

  async function act(work: () => Promise<void>, done: string) {
    setBusy(true); setError(""); setNotice("");
    try { await work(); setNotice(done); await refresh(offset); }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao atualizar."); }
    finally { setBusy(false); }
  }
  const respond = (task: DelegatedTask, accept: boolean) => act(async () => {
    await request(`/api/crm/tasks/delegated/${task.id}/response`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accept }) });
  }, accept ? "Delegação aceita. A tarefa agora é sua." : "Delegação recusada.");
  const change = (task: DelegatedTask, status: string) => act(async () => {
    await request(`/api/crm/tasks/delegated/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, expected_status: task.status }) });
  }, "Situação da tarefa delegada atualizada.");

  return (
    <section aria-label="Tarefas delegadas a mim" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 16, overflowWrap: "anywhere" }}>
      <h2>Tarefas delegadas a mim</h2>
      <p>Delegações explícitas de outros comerciais. Aceitar transfere a responsabilidade da tarefa; a oportunidade continua com quem delegou.</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <button type="button" onClick={() => refresh(offset)} disabled={busy}>Atualizar delegações</button>
      {loading ? <p role="status">Carregando delegações…</p> : (
        <>
          <p>{total} delegação(ões) ativa(s) — exibindo {tasks.length ? offset + 1 : 0}–{offset + tasks.length}, páginas de {PAGE}.</p>
          {tasks.length === 0 && <p>Nenhuma tarefa delegada a você.</p>}
          <ul style={{ paddingLeft: 20 }}>
            {tasks.map(task => <li key={task.id} style={{ marginTop: 12 }}>
              <strong>{task.title}</strong>
              <p>{labels[task.status]} — {task.due_date ? new Date(task.due_date).toLocaleString("pt-BR") : "Sem prazo"} — prioridade {task.priority}</p>
              <p>{task.company_name} — {task.opportunity_title} — delegada por {task.delegated_by_name}</p>
              {task.delegation_status === "pendente" && <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button disabled={busy} onClick={() => respond(task, true)}>Aceitar delegação</button>
                <button disabled={busy} onClick={() => respond(task, false)}>Recusar delegação</button>
              </div>}
              {task.delegation_status === "aceita" && ["aberta", "em_andamento"].includes(task.status) && <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {task.status === "aberta" && <button disabled={busy} onClick={() => change(task, "em_andamento")}>Iniciar delegada</button>}
                <button disabled={busy} onClick={() => change(task, "concluida")}>Concluir delegada</button>
                <button disabled={busy} onClick={() => change(task, "cancelada")}>Cancelar delegada</button>
              </div>}
            </li>)}
          </ul>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={busy || offset === 0} onClick={() => refresh(Math.max(0, offset - PAGE))}>Delegações anteriores</button>
            <button type="button" disabled={busy || offset + tasks.length >= total} onClick={() => refresh(offset + PAGE)}>Próximas delegações</button>
          </div>
        </>
      )}
    </section>
  );
}
