"use client";

import styles from "../../../components/ui/UiWorkspace.module.css";
import { financeErrorMessage } from "../../../lib/finance-vocabulary.mjs";
import { FormEvent, useEffect, useState } from "react";

type Policy = {
  id: string;
  name: string;
  description: string | null;
  reminder_type: string;
  days_before: number | string;
  escalation_level: number | string;
  is_approved: boolean;
  is_active: boolean;
};
type Account = { id: string; protocol: string; amount_cents: number | string; status: string };
type Reminder = {
  id: string;
  receivable_id: string;
  policy_id: string | null;
  responsible_name: string;
  due_date: string;
  reminder_type: string;
  status: string;
  content: string;
  sent_at: string | null;
  is_real_message: boolean;
};
type HistoryEntry = {
  id: string;
  previous_status: string | null;
  next_status: string;
  reason: string;
  is_blocking_action: boolean;
  created_at: string;
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(financeErrorMessage(typeof data.error === "string" ? data.error : null, response.status));
  return data;
}

export default function CollectionWorkspace() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [receivables, setReceivables] = useState<Account[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [policyForm, setPolicyForm] = useState({ name: "", description: "", reminder_type: "notificacao_portal", days_before: "3", escalation_level: "0" });
  const [reminderForm, setReminderForm] = useState({ receivable_id: "", policy_id: "", responsible_name: "", due_date: "", reminder_type: "notificacao_portal", content: "" });
  const [sendForm, setSendForm] = useState({ id: "", status: "lembrete_enviado", reason: "" });
  const [historyReceivableId, setHistoryReceivableId] = useState("");

  const run = async (operation: () => Promise<void>) => {
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha inesperada");
    }
  };

  async function load() {
    const [policyData, receivableData, reminderData] = await Promise.all([
      request("/api/fin/collection-policies"),
      request("/api/fin/receivables"),
      request("/api/fin/collection-reminders"),
    ]);
    setPolicies(policyData.policies || []);
    setReceivables(receivableData.receivables || []);
    setReminders(reminderData.reminders || []);
  }

  useEffect(() => {
    run(load);
  }, []);

  const createPolicy = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const data = await request("/api/fin/collection-policies", {
        method: "POST",
        body: JSON.stringify({
          ...policyForm,
          days_before: Number(policyForm.days_before),
          escalation_level: Number(policyForm.escalation_level),
        }),
      });
      setNotice(`Política sintética "${data.policy.name}" criada; aguardando aprovação`);
      setPolicyForm({ name: "", description: "", reminder_type: "notificacao_portal", days_before: "3", escalation_level: "0" });
      await load();
    });
  };

  const approvePolicy = (policy: Policy) =>
    run(async () => {
      await request("/api/fin/collection-policies", { method: "PATCH", body: JSON.stringify({ id: policy.id, is_approved: true }) });
      setNotice(`Política "${policy.name}" aprovada`);
      await load();
    });

  const toggleActive = (policy: Policy) =>
    run(async () => {
      await request("/api/fin/collection-policies", { method: "PATCH", body: JSON.stringify({ id: policy.id, is_active: !policy.is_active }) });
      setNotice(`Política "${policy.name}" ${policy.is_active ? "desativada" : "ativada"}`);
      await load();
    });

  const createReminder = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const data = await request("/api/fin/collection-reminders", { method: "POST", body: JSON.stringify({ ...reminderForm, is_real_message: false }) });
      setNotice(`Lembrete sintético criado para ${data.reminder.responsible_name}`);
      setReminderForm({ ...reminderForm, responsible_name: "", due_date: "", content: "" });
      await load();
    });
  };

  const sendReminder = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const data = await request("/api/fin/collection-reminders", { method: "PATCH", body: JSON.stringify(sendForm) });
      setNotice(`Lembrete marcado como ${data.reminder.status} (envio simulado, sem mensagem real)`);
      setSendForm({ id: "", status: "lembrete_enviado", reason: "" });
      await load();
    });
  };

  const loadHistory = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const data = await request(`/api/fin/collection-history?receivable_id=${encodeURIComponent(historyReceivableId)}`);
      setHistory(data.history || []);
    });
  };

  return (
    <section data-testid="fin06-collection" aria-labelledby="fin06-title" className={styles.stackWide}>
      <header>
        <h2 id="fin06-title">FIN-06 · Cobrança com responsável, lembretes e histórico</h2>
        <p>
          Política precisa ser aprovada antes de qualquer lembrete. Lembretes são sempre sintéticos e simulados:
          não há e-mail, WhatsApp, SMS ou gateway reais, e nenhuma ação aqui bloqueia o portal do cliente
          automaticamente.
        </p>
      </header>
      {error && <p role="alert" data-testid="fin06-error">{error}</p>}
      {notice && <p role="status" data-testid="fin06-notice">{notice}</p>}

      <form data-testid="fin06-policy-form" onSubmit={createPolicy} className={styles.stack}>
        <h3>Criar política de cobrança (rascunho)</h3>
        <label>Nome único <input required minLength={3} maxLength={200} data-testid="fin06-policy-name" value={policyForm.name} onChange={event => setPolicyForm({ ...policyForm, name: event.target.value })} /></label>
        <label>Descrição <input minLength={10} maxLength={1000} data-testid="fin06-policy-description" value={policyForm.description} onChange={event => setPolicyForm({ ...policyForm, description: event.target.value })} /></label>
        <label>Tipo de lembrete <select data-testid="fin06-policy-reminder-type" value={policyForm.reminder_type} onChange={event => setPolicyForm({ ...policyForm, reminder_type: event.target.value })}>
          <option value="notificacao_portal">Notificação no portal</option><option value="email">E-mail simulado</option><option value="whatsapp">WhatsApp simulado</option><option value="ligacao">Ligação simulada</option><option value="outro">Outro</option>
        </select></label>
        <label>Dias antes do vencimento <input required type="number" min={0} max={365} data-testid="fin06-policy-days-before" value={policyForm.days_before} onChange={event => setPolicyForm({ ...policyForm, days_before: event.target.value })} /></label>
        <label>Nível de escalonamento <input required type="number" min={0} max={5} data-testid="fin06-policy-escalation" value={policyForm.escalation_level} onChange={event => setPolicyForm({ ...policyForm, escalation_level: event.target.value })} /></label>
        <button type="submit" data-testid="fin06-create-policy">Criar política (rascunho, não aprovada)</button>
      </form>

      <div>
        <h3>Políticas de cobrança</h3>
        <ul data-testid="fin06-policies">
          {policies.length === 0 ? <li>Nenhuma política cadastrada.</li> : policies.map(policy => (
            <li data-testid={`fin06-policy-${policy.id}`} key={policy.id}>
              {policy.name} · {policy.reminder_type} · {policy.days_before} dias antes · escalonamento {policy.escalation_level} ·{" "}
              {policy.is_approved ? "aprovada" : "não aprovada"} · {policy.is_active ? "ativa" : "inativa"}{" "}
              <button type="button" disabled={policy.is_approved} data-testid={`fin06-approve-${policy.id}`} onClick={() => approvePolicy(policy)}>Aprovar</button>{" "}
              <button type="button" onClick={() => toggleActive(policy)}>{policy.is_active ? "Desativar" : "Ativar"}</button>
            </li>
          ))}
        </ul>
      </div>

      <form data-testid="fin06-reminder-form" onSubmit={createReminder} className={styles.stack}>
        <h3>Criar lembrete de cobrança sintético</h3>
        <label>Recebível <select required data-testid="fin06-reminder-receivable" value={reminderForm.receivable_id} onChange={event => setReminderForm({ ...reminderForm, receivable_id: event.target.value })}>
          <option value="">Selecione o recebível</option>{receivables.map(account => <option key={account.id} value={account.id}>{account.protocol} · {account.status}</option>)}
        </select></label>
        <label>Política aprovada <select required data-testid="fin06-reminder-policy" value={reminderForm.policy_id} onChange={event => setReminderForm({ ...reminderForm, policy_id: event.target.value })}>
          <option value="">Selecione a política</option>{policies.filter(policy => policy.is_approved && policy.is_active).map(policy => <option key={policy.id} value={policy.id}>{policy.name}</option>)}
        </select></label>
        <label>Responsável <input required minLength={2} maxLength={200} data-testid="fin06-reminder-responsible" value={reminderForm.responsible_name} onChange={event => setReminderForm({ ...reminderForm, responsible_name: event.target.value })} /></label>
        <label>Data do lembrete <input required type="date" data-testid="fin06-reminder-due-date" value={reminderForm.due_date} onChange={event => setReminderForm({ ...reminderForm, due_date: event.target.value })} /></label>
        <label>Tipo de lembrete <select data-testid="fin06-reminder-type" value={reminderForm.reminder_type} onChange={event => setReminderForm({ ...reminderForm, reminder_type: event.target.value })}>
          <option value="notificacao_portal">Notificação no portal</option><option value="email">E-mail simulado</option><option value="whatsapp">WhatsApp simulado</option><option value="ligacao">Ligação simulada</option><option value="outro">Outro</option>
        </select></label>
        <label>Conteúdo do lembrete (sintético) <textarea required minLength={20} maxLength={2000} data-testid="fin06-reminder-content" value={reminderForm.content} onChange={event => setReminderForm({ ...reminderForm, content: event.target.value })} /></label>
        <button type="submit" data-testid="fin06-create-reminder">Criar lembrete (simulado/local)</button>
      </form>

      <div>
        <h3>Lembretes</h3>
        <ul data-testid="fin06-reminders">
          {reminders.length === 0 ? <li>Nenhum lembrete sintético.</li> : reminders.map(reminder => (
            <li data-testid={`fin06-reminder-${reminder.id}`} key={reminder.id}>
              {reminder.responsible_name} · {reminder.reminder_type} · {reminder.status} · {reminder.is_real_message ? "ATENÇÃO: mensagem real" : "simulado/local"}
              {reminder.status !== "lembrete_enviado" && (
                <button type="button" onClick={() => setSendForm({ ...sendForm, id: reminder.id, status: "lembrete_enviado" })}>Selecionar para enviar (simulado)</button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <form data-testid="fin06-send-form" onSubmit={sendReminder} className={styles.stack}>
        <h3>Registrar envio simulado</h3>
        <label>Id do lembrete <input required data-testid="fin06-send-id" value={sendForm.id} onChange={event => setSendForm({ ...sendForm, id: event.target.value })} /></label>
        <label>Novo estado <select data-testid="fin06-send-status" value={sendForm.status} onChange={event => setSendForm({ ...sendForm, status: event.target.value })}>
          <option value="lembrete_enviado">Lembrete enviado (simulado)</option><option value="em_negociacao">Em negociação</option><option value="acordado">Acordado</option><option value="cancelado">Cancelado</option>
        </select></label>
        <label>Motivo <input required minLength={10} maxLength={1000} data-testid="fin06-send-reason" value={sendForm.reason} onChange={event => setSendForm({ ...sendForm, reason: event.target.value })} /></label>
        <button type="submit" data-testid="fin06-send">Confirmar (apenas simulado/local)</button>
      </form>

      <form data-testid="fin06-history-form" onSubmit={loadHistory} className={styles.stack}>
        <h3>Histórico imutável por recebível</h3>
        <label>Recebível <input required data-testid="fin06-history-receivable" value={historyReceivableId} onChange={event => setHistoryReceivableId(event.target.value)} /></label>
        <button type="submit" data-testid="fin06-load-history">Carregar histórico</button>
      </form>
      <ul data-testid="fin06-history">
        {history.length === 0 ? <li>Nenhum histórico carregado.</li> : history.map(entry => (
          <li key={entry.id}>
            {entry.previous_status || "criação"} → {entry.next_status} · {entry.reason} ·{" "}
            {entry.is_blocking_action ? "ATENÇÃO: bloqueio" : "sem bloqueio automático"}
          </li>
        ))}
      </ul>
    </section>
  );
}
