"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type Task = {
  id: string; title: string; due_date: string | null; status: string; priority: string;
  version: number; delegation_status: string | null; delegated_to_email: string | null;
};
const PAGE = 25;
const labels: Record<string, string> = { aberta: "Aberta", em_andamento: "Em andamento", concluida: "Concluída", cancelada: "Cancelada" };
const errors: Record<string, string> = {
  opportunity_not_found: "Tarefas disponíveis apenas para o responsável por esta oportunidade.",
  admin_session_required: "Entre novamente na área administrativa.",
  commercial_role_required: "Seu perfil não permite operar tarefas comerciais.",
  task_status_conflict: "A tarefa foi alterada ou encerrada. Atualize a lista antes de tentar novamente.",
  task_version_conflict: "A tarefa foi alterada em outra janela. Atualize a lista antes de editar o prazo.",
  task_not_open: "Somente tarefas abertas ou em andamento podem ser alteradas.",
  task_delegated: "Esta tarefa está delegada. Revogue a delegação pendente ou aguarde o delegado.",
  cadence_task_not_delegable: "Tarefas de cadência são privadas e não podem ser delegadas.",
  delegate_not_available: "Nenhum comercial ativo disponível com este e-mail.",
  delegation_already_accepted: "A delegação já foi aceita e não pode ser revogada.",
  no_pending_delegation: "Não há delegação pendente para revogar.",
  invalid_email: "Informe um e-mail válido.",
  crm_tasks_unavailable: "Não foi possível salvar ou consultar as tarefas. Confira a lista antes de repetir.",
};
export default function OpportunityTasks({ opportunityId }: { opportunityId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [editingDue, setEditingDue] = useState<Record<string, string>>({});
  const [delegateEmail, setDelegateEmail] = useState<Record<string, string>>({});
  const endpoint = "/api/crm/opportunities/" + opportunityId + "/tasks";

  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, { ...init, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(errors[data.error] || "Não foi possível concluir a operação.");
    return data;
  }
  const refresh = useCallback(async (nextOffset = offset) => {
    setLoading(true); setError("");
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(nextOffset) });
    if (statusFilter) params.set("status", statusFilter);
    if (appliedSearch) params.set("q", appliedSearch);
    if (overdueOnly) params.set("overdue", "1");
    try {
      const data = await request(endpoint + "?" + params.toString());
      setTasks(data.tasks); setTotal(data.total); setOffset(data.offset);
    } catch (e) { setTasks([]); setTotal(0); setError(e instanceof Error ? e.message : "Falha ao consultar."); }
    finally { setLoading(false); }
  }, [endpoint, statusFilter, appliedSearch, overdueOnly, offset]);
  useEffect(() => { refresh(0); }, [endpoint, statusFilter, appliedSearch, overdueOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const date = new Date(due);
    if (!Number.isFinite(date.getTime())) { setError("Informe um prazo válido."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, due_date: date.toISOString() }) });
      setTitle(""); setDue(""); setNotice("Tarefa salva.");
      await refresh(0);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar."); }
    finally { setBusy(false); }
  }
  async function act(work: () => Promise<void>, done: string) {
    setBusy(true); setError(""); setNotice("");
    try { await work(); setNotice(done); }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao atualizar."); }
    finally { setBusy(false); }
  }
  const change = (task: Task, status: string) => act(async () => {
    const data = await request(endpoint + "/" + task.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, expected_status: task.status }) });
    setTasks(items => items.map(item => item.id === task.id ? { ...item, ...data.task } : item));
  }, "Situação da tarefa atualizada.");
  const saveDue = (task: Task) => act(async () => {
    const date = new Date(editingDue[task.id] || "");
    if (!Number.isFinite(date.getTime())) throw new Error("Informe um prazo válido.");
    const data = await request(endpoint + "/" + task.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ due_date: date.toISOString(), expected_version: task.version }) });
    setTasks(items => items.map(item => item.id === task.id ? { ...item, ...data.task } : item));
    setEditingDue(state => { const next = { ...state }; delete next[task.id]; return next; });
  }, "Prazo da tarefa atualizado.");
  const delegate = (task: Task) => act(async () => {
    const data = await request(endpoint + "/" + task.id + "/delegation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: (delegateEmail[task.id] || "").trim() }) });
    setTasks(items => items.map(item => item.id === task.id ? { ...item, ...data.task } : item));
    setDelegateEmail(state => { const next = { ...state }; delete next[task.id]; return next; });
  }, "Delegação registrada. Aguardando aceite.");
  const revoke = (task: Task) => act(async () => {
    const data = await request(endpoint + "/" + task.id + "/delegation", { method: "DELETE" });
    setTasks(items => items.map(item => item.id === task.id ? { ...item, ...data.task } : item));
  }, "Delegação revogada.");

  const overdue = (task: Task) => !!task.due_date && new Date(task.due_date).getTime() < Date.now() && ["aberta", "em_andamento"].includes(task.status);
  const delegatedAway = (task: Task) => task.delegation_status === "pendente" || task.delegation_status === "aceita";
  return (
    <section aria-label="Minhas tarefas da oportunidade" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 16, overflowWrap: "anywhere" }}>
      <h2>Minhas tarefas da oportunidade</h2>
      <p>Acompanhamento pessoal do responsável comercial. Prazos exibidos no horário deste dispositivo. Delegação explícita por e-mail para outro comercial ativo, com aceite; sem fila de equipe.</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <form onSubmit={create} style={{ display: "grid", gap: 12 }}>
        <label>Título da tarefa<input value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} style={{ display: "block", width: "100%", boxSizing: "border-box" }} /></label>
        <label>Prazo da tarefa<input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} required style={{ display: "block", maxWidth: "100%" }} /></label>
        <button disabled={busy} type="submit">Criar tarefa</button>
      </form>
      <form onSubmit={e => { e.preventDefault(); setAppliedSearch(search.trim()); }} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 12 }}>
        <label>Buscar por título<input value={search} onChange={e => setSearch(e.target.value)} maxLength={200} style={{ display: "block" }} /></label>
        <button type="submit" disabled={busy}>Buscar tarefas</button>
        <label>Situação
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ display: "block" }}>
            <option value="">todas</option>
            {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label><input type="checkbox" checked={overdueOnly} onChange={e => setOverdueOnly(e.target.checked)} /> Somente vencidas</label>
        <button type="button" onClick={() => refresh()} disabled={busy}>Atualizar tarefas</button>
      </form>
      {loading ? <p role="status">Carregando tarefas…</p> : (
        <>
          <p>{total} tarefa(s) neste filtro — exibindo {tasks.length ? offset + 1 : 0}–{offset + tasks.length}, páginas de {PAGE}.</p>
          {tasks.length === 0 && <p>Nenhuma tarefa neste filtro.</p>}
          <ul style={{ paddingLeft: 20 }}>
            {tasks.map(task => <li key={task.id} style={{ marginTop: 12 }}>
              <strong>{task.title}</strong>
              <p>{labels[task.status]} — {task.due_date ? new Date(task.due_date).toLocaleString("pt-BR") : "Sem prazo"} {overdue(task) && <strong>— Vencida</strong>}</p>
              {task.delegation_status === "pendente" && <p>Delegada a {task.delegated_to_email} — aguardando aceite. <button disabled={busy} onClick={() => revoke(task)}>Revogar delegação</button></p>}
              {task.delegation_status === "aceita" && <p>Delegada a {task.delegated_to_email} — aceita. Somente o delegado altera a situação.</p>}
              {task.delegation_status === "recusada" && <p>Delegação recusada por {task.delegated_to_email}. A tarefa continua sua.</p>}
              {!delegatedAway(task) && ["aberta", "em_andamento"].includes(task.status) && <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {task.status === "aberta" && <button disabled={busy} onClick={() => change(task, "em_andamento")}>Iniciar</button>}
                <button disabled={busy} onClick={() => change(task, "concluida")}>Concluir</button>
                <button disabled={busy} onClick={() => change(task, "cancelada")}>Cancelar tarefa</button>
              </div>}
              {!delegatedAway(task) && ["aberta", "em_andamento"].includes(task.status) && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6, alignItems: "center" }}>
                {editingDue[task.id] === undefined
                  ? <button disabled={busy} onClick={() => setEditingDue(state => ({ ...state, [task.id]: "" }))}>Editar prazo</button>
                  : <>
                      <label>Novo prazo<input type="datetime-local" value={editingDue[task.id]} onChange={e => setEditingDue(state => ({ ...state, [task.id]: e.target.value }))} style={{ display: "block" }} /></label>
                      <button disabled={busy} onClick={() => saveDue(task)}>Salvar prazo</button>
                      <button disabled={busy} onClick={() => setEditingDue(state => { const next = { ...state }; delete next[task.id]; return next; })}>Descartar edição</button>
                    </>}
                <label>E-mail do comercial<input type="email" value={delegateEmail[task.id] || ""} onChange={e => setDelegateEmail(state => ({ ...state, [task.id]: e.target.value }))} maxLength={254} style={{ display: "block" }} /></label>
                <button disabled={busy || !(delegateEmail[task.id] || "").trim()} onClick={() => delegate(task)}>Delegar</button>
              </div>}
            </li>)}
          </ul>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={busy || offset === 0} onClick={() => refresh(Math.max(0, offset - PAGE))}>Página anterior</button>
            <button type="button" disabled={busy || offset + tasks.length >= total} onClick={() => refresh(offset + PAGE)}>Próxima página</button>
          </div>
        </>
      )}
    </section>
  );
}
