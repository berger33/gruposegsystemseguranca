"use client";
import { useEffect, useState, type FormEvent } from "react";

type Step = {
  id?: string;
  step_order?: number;
  title: string;
  interval_days: number;
  suggested_channel: string;
  responsible_id?: string;
};
type Template = {
  id: string;
  name: string;
  description: string | null;
  status: "ativa" | "arquivada";
  version: number;
  steps: Step[];
};
type Task = {
  id: string;
  title: string;
  due_date: string;
  status: string;
  suggested_channel: string;
  cadence_blocked_reason: string | null;
};
type Enrollment = {
  id: string;
  template_id: string;
  template_name: string;
  status: string;
  applied_at: string;
  ended_at: string | null;
  blocked_reason: string | null;
  tasks: Task[];
};
type Contact = { id: string; display_name: string; email: string | null; status: string; prospecting_opted_out: boolean } | null;

type Draft = { name: string; description: string; steps: Step[] };
const channels: Record<string, string> = {
  ligacao: "Ligação",
  email: "E-mail (manual)",
  whatsapp: "WhatsApp (manual)",
  reuniao: "Reunião",
  visita: "Visita",
  outro: "Outro",
};
const statuses: Record<string, string> = {
  ativa: "Ativa",
  bloqueada_opt_out: "Bloqueada por opt-out",
  encerrada_ganha: "Encerrada: oportunidade ganha",
  encerrada_perdida: "Encerrada: oportunidade perdida",
  encerrada_contato_inativo: "Encerrada: contato inativo",
};
const errors: Record<string, string> = {
  admin_session_required: "Entre novamente na área administrativa.",
  commercial_role_required: "Cadências são administradas apenas por usuários comerciais.",
  opportunity_not_found: "Cadência disponível apenas para o responsável por esta oportunidade.",
  template_not_found: "Este modelo não está disponível para sua conta.",
  template_version_conflict: "O modelo foi alterado. Recarregue antes de editar novamente.",
  template_steps_locked_after_application: "Passos de um modelo já aplicado não podem ser substituídos; crie outro modelo para uma nova sequência.",
  contact_opted_out: "O contato optou por não receber prospecção. Nenhuma tarefa foi criada.",
  contact_inactive: "O contato está inativo. Nenhuma tarefa foi criada.",
  opportunity_final: "Oportunidades ganhas ou perdidas não recebem novos passos.",
  cadence_already_applied: "Este modelo já foi aplicado a esta oportunidade e não duplicará tarefas.",
  same_origin_required: "A operação foi recusada por origem de navegador inválida.",
  crm_cadences_unavailable: "Não foi possível consultar ou salvar a cadência. Nenhuma mensagem foi enviada.",
};

function initialDraft(): Draft {
  return { name: "", description: "", steps: [{ title: "", interval_days: 0, suggested_channel: "ligacao" }] };
}

export default function CadenceClient({ opportunityId }: { opportunityId: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [contact, setContact] = useState<Contact>(null);
  const [stage, setStage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, { ...init, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(errors[data.error] || "Não foi possível concluir a operação.");
    return data;
  }
  async function refresh() {
    setLoading(true); setError("");
    try {
      const [templateData, cadenceData] = await Promise.all([
        request("/api/crm/cadences/templates"),
        request(`/api/crm/opportunities/${opportunityId}/cadences`),
      ]);
      setTemplates(templateData.templates || []);
      setEnrollments(cadenceData.enrollments || []);
      setContact(cadenceData.contact || null);
      setStage(cadenceData.opportunity?.stage || "");
      setSelectedTemplate(current => current || (templateData.templates?.find((item: Template) => item.status === "ativa")?.id || ""));
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao carregar cadências."); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, [opportunityId]);

  function resetEditor() {
    setDraft(initialDraft()); setEditingId(null); setEditingVersion(null);
  }
  function editTemplate(template: Template) {
    setEditingId(template.id); setEditingVersion(template.version);
    setDraft({ name: template.name, description: template.description || "", steps: template.steps.map(step => ({ title: step.title, interval_days: step.interval_days, suggested_channel: step.suggested_channel })) });
    setError(""); setNotice("Edite o nome, a descrição ou os passos antes de salvar.");
  }
  function updateStep(index: number, patch: Partial<Step>) {
    setDraft(current => ({ ...current, steps: current.steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step) }));
  }
  function addStep() {
    if (draft.steps.length >= 20) return;
    setDraft(current => ({ ...current, steps: [...current.steps, { title: "", interval_days: 1, suggested_channel: "ligacao" }] }));
  }
  function removeStep(index: number) {
    if (draft.steps.length <= 1) return;
    setDraft(current => ({ ...current, steps: current.steps.filter((_, stepIndex) => stepIndex !== index) }));
  }
  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const url = editingId ? `/api/crm/cadences/templates/${editingId}` : "/api/crm/cadences/templates";
      const body = editingId ? { ...draft, expected_version: editingVersion } : draft;
      await request(url, { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      resetEditor(); await refresh(); setNotice("Modelo de cadência salvo. Os passos continuam sendo tarefas manuais.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao salvar o modelo."); }
    finally { setBusy(false); }
  }
  async function archiveTemplate(template: Template) {
    if (!window.confirm(`Arquivar o modelo “${template.name}”? Aplicações existentes permanecem no histórico.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/crm/cadences/templates/${template.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "arquivada", expected_version: template.version }) });
      await refresh(); setNotice("Modelo arquivado; não pode ser aplicado a novas oportunidades.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao arquivar o modelo."); }
    finally { setBusy(false); }
  }
  async function applyTemplate() {
    if (!selectedTemplate) { setError("Selecione um modelo ativo."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/crm/opportunities/${opportunityId}/cadences`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template_id: selectedTemplate }) });
      await refresh(); setNotice("Cadência aplicada: tarefas criadas para execução manual, sem envio automático.");
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao aplicar a cadência."); }
    finally { setBusy(false); }
  }
  async function optOut() {
    if (!window.confirm("Registrar que este contato não deseja prospecção? Os passos pendentes serão cancelados e não voltarão automaticamente.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await request(`/api/crm/opportunities/${opportunityId}/cadence-contact`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ opted_out: true }) });
      setContact(data.contact); await refresh(); setNotice(`${data.blockedTasks || 0} tarefa(s) pendente(s) bloqueada(s) por opt-out.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao registrar opt-out."); }
    finally { setBusy(false); }
  }

  return (
    <section aria-label="Cadências manuais de prospecção" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 16, marginTop: 16, overflowWrap: "anywhere", background: "#fffdf5" }}>
      <h2>CRM-09 — Cadências manuais</h2>
      <p>Modelos privados de passos, intervalo em dias, canal sugerido e responsável. Aplicar um modelo cria tarefas no CRM agora; não envia e-mail, WhatsApp ou qualquer mensagem.</p>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading ? <p role="status">Carregando cadências…</p> : (
        <>
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>Modelos deste usuário comercial</h3>
            <p style={{ fontSize: 13 }}>Somente o proprietário comercial cria, edita, arquiva e aplica seu modelo. Papéis administrativos não fazem bypass.</p>
            {templates.length === 0 && <p>Nenhum modelo ainda. Crie o primeiro abaixo.</p>}
            <ul style={{ paddingLeft: 20 }}>
              {templates.map(template => <li key={template.id} style={{ marginBottom: 8 }}>
                <strong>{template.name}</strong> — {template.status === "ativa" ? "ativo" : "arquivado"}; {template.steps.length} passo(s)
                <span style={{ marginLeft: 8, display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => editTemplate(template)} disabled={busy}>Editar</button>
                  {template.status === "ativa" && <button type="button" onClick={() => archiveTemplate(template)} disabled={busy}>Arquivar</button>}
                </span>
                <ol style={{ marginTop: 4 }}>
                  {template.steps.map((step, index) => <li key={step.id || `${template.id}-${index}`}>{step.title} — +{step.interval_days} dia(s) — {channels[step.suggested_channel] || step.suggested_channel} — responsável: você</li>)}
                </ol>
              </li>)}
            </ul>
          </div>

          <form onSubmit={saveTemplate} style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: 12, marginTop: 12 }}>
            <h3 style={{ marginTop: 0 }}>{editingId ? "Editar modelo" : "Novo modelo"}</h3>
            <label>Nome do modelo<input value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} required maxLength={120} style={{ display: "block", width: "100%", boxSizing: "border-box" }} /></label>
            <label>Descrição (opcional)<textarea value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} maxLength={500} style={{ display: "block", width: "100%", boxSizing: "border-box" }} /></label>
            <h4>Passos e tarefas</h4>
            {draft.steps.map((step, index) => <fieldset key={index} style={{ marginBottom: 8 }}>
              <legend>Passo {index + 1}</legend>
              <label>Tarefa<input value={step.title} onChange={event => updateStep(index, { title: event.target.value })} required maxLength={200} /></label>{" "}
              <label>Intervalo (dias)<input type="number" min={0} max={365} value={step.interval_days} onChange={event => updateStep(index, { interval_days: Number(event.target.value) })} required /></label>{" "}
              <label>Canal sugerido<select aria-label="Canal sugerido" value={step.suggested_channel} onChange={event => updateStep(index, { suggested_channel: event.target.value })}>{Object.entries(channels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{" "}
              {draft.steps.length > 1 && <button type="button" onClick={() => removeStep(index)} disabled={busy}>Remover passo</button>}
            </fieldset>)}
            <button type="button" onClick={addStep} disabled={busy || draft.steps.length >= 20}>Adicionar passo</button>{" "}
            <button type="submit" disabled={busy}>{editingId ? "Salvar edição" : "Criar modelo"}</button>{" "}
            {editingId && <button type="button" onClick={resetEditor} disabled={busy}>Cancelar edição</button>}
          </form>

          <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: 12, marginTop: 12 }}>
            <h3 style={{ marginTop: 0 }}>Aplicar ao responsável desta oportunidade</h3>
            <p>Uma cadência só pode ser aplicada à oportunidade que você possui. Passos futuros serão tarefas abertas com o responsável atual; você decide quando executar o canal sugerido.</p>
            {contact ? <p><strong>Contato:</strong> {contact.display_name} {contact.email ? `(${contact.email})` : ""} — {contact.status === "active" ? "ativo" : "inativo"} {contact.prospecting_opted_out ? "— opt-out registrado" : ""}</p> : <p>Esta oportunidade não tem contato ativo vinculado.</p>}
            <select aria-label="Modelo de cadência" value={selectedTemplate} onChange={event => setSelectedTemplate(event.target.value)} disabled={busy}>
              <option value="">Selecione um modelo</option>
              {templates.filter(template => template.status === "ativa").map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>{" "}
            <button type="button" onClick={applyTemplate} disabled={busy || !selectedTemplate || !contact || contact.prospecting_opted_out || stage === "ganho" || stage === "perdido"}>Criar tarefas da cadência</button>{" "}
            {contact && !contact.prospecting_opted_out && <button type="button" onClick={optOut} disabled={busy}>Registrar opt-out do contato</button>}
          </div>

          <div style={{ marginTop: 12 }}>
            <h3>Aplicações e tarefas criadas</h3>
            {enrollments.length === 0 && <p>Nenhuma cadência aplicada nesta oportunidade.</p>}
            {enrollments.map(enrollment => <article key={enrollment.id} style={{ borderTop: "1px solid #e5e7eb", padding: "8px 0" }}>
              <strong>{enrollment.template_name}</strong> — {statuses[enrollment.status] || enrollment.status} — aplicada em {new Date(enrollment.applied_at).toLocaleString("pt-BR")}
              {enrollment.blocked_reason && <p>Motivo: {enrollment.blocked_reason}</p>}
              <ul>{enrollment.tasks.map(task => <li key={task.id}>{task.title} — {task.status} — {new Date(task.due_date).toLocaleString("pt-BR")} — {channels[task.suggested_channel] || task.suggested_channel}{task.cadence_blocked_reason ? ` — bloqueada: ${task.cadence_blocked_reason}` : ""}</li>)}</ul>
            </article>)}
          </div>
        </>
      )}
    </section>
  );
}
