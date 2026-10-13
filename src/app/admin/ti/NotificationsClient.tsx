'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import UiState from '@/components/ui/UiState';
import styles from './NotificationsClient.module.css';

type Notif = {
  id: string;
  dedup_key: string | null;
  recipient_kind: string;
  recipient_id: string | null;
  recipient_email: string | null;
  channel: string;
  template: string;
  payload: unknown;
  status: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  last_error: string | null;
  created_at: string;
};

type Notice = { variant: 'success' | 'denied' | 'error'; title: string; detail: string };
type FormValues = { recipientKind: string; recipientEmail: string; channel: string; template: string; payload: string; dedupKey: string };

const INITIAL_FORM: FormValues = {
  recipientKind: 'lead', recipientEmail: '', channel: 'email', template: 'lead_received',
  payload: '{\n  "leadId": "exemplo"\n}', dedupKey: '',
};

const statusLabels: Record<string, string> = {
  queued: 'Na fila', sending: 'Em processamento', sent: 'Enviada pelo provedor',
  failed: 'Falhou — nova tentativa prevista', dead: 'Falha final', local_outbox: 'Registrada na caixa local',
};
const channelLabels: Record<string, string> = {
  email: 'E-mail', whatsapp: 'WhatsApp', sms: 'SMS', push: 'Notificação push', webhook: 'Webhook', internal: 'Interno',
};
const recipientLabels: Record<string, string> = {
  client: 'Cliente', staff: 'Equipe', lead: 'Lead', system: 'Sistema', marcelo: 'Marcelo', ti: 'TI', admin: 'Administração', rh: 'RH',
};

function date(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? 'Data indisponível' : parsed.toLocaleString('pt-BR');
}

function errorMessage(status: number, error?: string) {
  if (status === 401) return 'Sua sessão administrativa expirou. Entre novamente para consultar ou operar a fila.';
  if (status === 403 || error === 'forbidden') return 'Seu perfil não tem autorização para processar a fila.';
  if (status === 503) return 'O serviço de notificações está indisponível agora. Nenhuma confirmação de envio foi recebida.';
  const messages: Record<string, string> = {
    notifications_unavailable: 'Não foi possível consultar a fila.', enqueue_failed: 'Não foi possível registrar a notificação.',
    retry_failed: 'Não foi possível solicitar uma nova tentativa.', process_failed: 'Não foi possível iniciar o processamento.',
    invalid_request: 'Confira os campos enviados e o JSON do conteúdo.', invalid_payload: 'O conteúdo precisa ser um objeto JSON válido.',
    invalid_recipient_kind: 'Selecione um tipo de destinatário aceito.', invalid_channel: 'Selecione um canal aceito.',
    invalid_template: 'Informe um modelo com até 100 caracteres.', invalid_dedup_key: 'A chave de deduplicação deve ter até 200 caracteres.',
    invalid_recipient_email: 'Informe um e-mail válido para este destinatário.', recipient_required: 'Informe um e-mail ou identificador para o destinatário.',
    not_found_or_not_retryable: 'Este registro não existe ou não está disponível para nova tentativa.',
  };
  return messages[error || ''] || 'A operação não foi concluída. Tente novamente.';
}

export default function NotificationsClient() {
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormValues>(INITIAL_FORM);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<'enqueue' | 'process' | string | null>(null);
  const [lastProcess, setLastProcess] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/admin/notifications?limit=50', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        const variant = res.status === 401 || res.status === 403 ? 'denied' : 'error';
        throw { variant, detail: errorMessage(res.status, data.error) };
      }
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setTotal(Number.isFinite(data.total) ? data.total : 0);
    } catch (error) {
      const detail = typeof error === 'object' && error && 'detail' in error ? String(error.detail) : 'Não foi possível consultar a fila. Verifique a conexão e tente novamente.';
      const variant = typeof error === 'object' && error && 'variant' in error ? error.variant as Notice['variant'] : 'error';
      setLoadError({ variant, title: variant === 'denied' ? 'Acesso necessário' : 'Consulta não concluída', detail });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function enqueue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    let payload: unknown;
    try {
      payload = JSON.parse(form.payload || '{}');
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid_payload');
    } catch {
      setNotice({ variant: 'error', title: 'Conteúdo inválido', detail: 'Revise o JSON: o conteúdo deve ser um objeto, por exemplo {"leadId":"123"}.' });
      return;
    }

    setBusy('enqueue');
    try {
      const res = await fetch('/api/admin/notifications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientKind: form.recipientKind, recipientEmail: form.recipientEmail || undefined,
          channel: form.channel, template: form.template, payload, dedupKey: form.dedupKey || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const variant = res.status === 401 || res.status === 403 ? 'denied' : 'error';
        setNotice({ variant, title: variant === 'denied' ? 'Acesso necessário' : 'Não foi possível enfileirar', detail: errorMessage(res.status, data.error) });
        return;
      }
      setNotice({ variant: 'success', title: data.dedup ? 'Registro já existente' : 'Notificação registrada na fila', detail: data.dedup ? 'A chave de deduplicação correspondeu a um registro existente; nenhum duplicado foi criado.' : 'O registro foi aceito pela fila interna. Isso não confirma envio externo.' });
      await load();
    } catch {
      setNotice({ variant: 'error', title: 'Falha de conexão', detail: 'A fila não confirmou o registro. Verifique a conexão antes de tentar novamente.' });
    } finally { setBusy(null); }
  }

  async function retry(id: string) {
    setNotice(null); setBusy(id);
    try {
      const res = await fetch(`/api/admin/notifications/${id}/retry`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        const variant = res.status === 401 || res.status === 403 ? 'denied' : 'error';
        setNotice({ variant, title: variant === 'denied' ? 'Acesso necessário' : 'Nova tentativa não solicitada', detail: errorMessage(res.status, data.error) });
        return;
      }
      setNotice({ variant: 'success', title: 'Nova tentativa registrada', detail: 'O item voltou à fila interna. O envio depende da configuração e disponibilidade do provedor.' });
      await load();
    } catch {
      setNotice({ variant: 'error', title: 'Falha de conexão', detail: 'Não foi possível confirmar o pedido de nova tentativa.' });
    } finally { setBusy(null); }
  }

  async function process() {
    setNotice(null); setLastProcess(null); setBusy('process');
    try {
      const res = await fetch('/api/admin/notifications/process', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        const variant = res.status === 401 || res.status === 403 ? 'denied' : 'error';
        setNotice({ variant, title: variant === 'denied' ? 'Acesso necessário' : 'Processamento não iniciado', detail: errorMessage(res.status, data.error) });
        return;
      }
      const results = Array.isArray(data.results) ? data.results : [];
      const local = results.filter((item: { status?: string }) => item.status === 'local_outbox').length;
      const sent = results.filter((item: { status?: string }) => item.status === 'sent').length;
      const failed = results.length - local - sent;
      setLastProcess(`Itens processados nesta ação: ${data.processed}. Envio confirmado pelo provedor: ${sent}. Registrados apenas na caixa local: ${local}. Com falha ou sem provedor: ${failed}.`);
      setNotice({ variant: 'success', title: 'A fila foi processada', detail: 'O resultado abaixo separa envio confirmado, registro local e falhas. Processar a fila, por si só, não significa que houve envio externo.' });
      await load();
    } catch {
      setNotice({ variant: 'error', title: 'Falha de conexão', detail: 'Não foi possível confirmar o resultado do processamento. Consulte novamente antes de repetir.' });
    } finally { setBusy(null); }
  }

  const queued = notifications.filter((item) => item.status === 'queued').length;
  const failed = notifications.filter((item) => item.status === 'failed' || item.status === 'dead').length;

  return (
    <section className={styles.workspace} aria-labelledby="notifications-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Comunicação e operação</p>
          <h2 id="notifications-title">Notificações</h2>
          <p>Consulte a fila interna, registre uma notificação ou solicite nova tentativa. O registro na fila não comprova entrega externa.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" onClick={() => void load()} disabled={loading || busy !== null}>Atualizar fila</button>
          <button type="button" className={styles.primary} onClick={() => void process()} disabled={busy !== null || loading}>
            {busy === 'process' ? 'Processando…' : 'Processar até 10 itens'}
          </button>
        </div>
      </header>

      <aside className={styles.notice}>
        <strong>O que esta tela confirma</strong>
        <p>A fila registra pedidos e tentativas. Sem provedor configurado, um e-mail pode ficar somente na caixa local; WhatsApp, SMS, push e webhook exigem integrações próprias. Só o estado confirmado pela API é mostrado como enviado.</p>
      </aside>

      {notice && <div className={styles.stateWrap}><UiState variant={notice.variant} title={notice.title} detail={notice.detail} /></div>}
      {lastProcess && <p className={styles.processSummary} role="status" aria-live="polite">{lastProcess}</p>}

      <form className={styles.form} onSubmit={enqueue} aria-labelledby="enqueue-title">
        <div className={styles.sectionHeading}>
          <div><h3 id="enqueue-title">Registrar na fila</h3><p>Use um destinatário e modelo válidos. O conteúdo é armazenado como JSON.</p></div>
        </div>
        <div className={styles.fields}>
          <label className={styles.field}>Tipo de destinatário
            <select value={form.recipientKind} onChange={(e) => setForm({ ...form, recipientKind: e.target.value })}>
              {Object.entries(recipientLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className={styles.field}>Canal solicitado
            <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              {Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className={styles.field}>E-mail do destinatário {form.recipientKind === 'system' && <span className={styles.optional}>opcional</span>}
            <input type="email" value={form.recipientEmail} onChange={(e) => setForm({ ...form, recipientEmail: e.target.value })} autoComplete="email" placeholder="nome@empresa.com.br" required={form.recipientKind !== 'system'} />
            <span className={styles.hint}>{form.recipientKind === 'system' ? 'O destinatário Sistema pode não ter endereço associado.' : 'Obrigatório quando não há identificador de destinatário informado.'}</span>
          </label>
          <label className={styles.field}>Modelo
            <input value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })} maxLength={100} required />
            <span className={styles.hint}>Chave de modelo usada pelo processador; até 100 caracteres.</span>
          </label>
          <label className={styles.field}>Chave de deduplicação <span className={styles.optional}>opcional</span>
            <input value={form.dedupKey} onChange={(e) => setForm({ ...form, dedupKey: e.target.value })} maxLength={200} />
            <span className={styles.hint}>Se já existir, a fila retorna o registro existente em vez de criar outro.</span>
          </label>
          <label className={`${styles.field} ${styles.payload}`}>Conteúdo da notificação (JSON)
            <textarea value={form.payload} onChange={(e) => setForm({ ...form, payload: e.target.value })} rows={5} spellCheck={false} aria-describedby="payload-hint" />
            <span id="payload-hint" className={styles.hint}>Informe um objeto JSON. Não inclua dados pessoais reais em demonstrações.</span>
          </label>
        </div>
        <div className={styles.formActions}>
          <button type="submit" className={styles.primary} disabled={busy !== null || loading}>{busy === 'enqueue' ? 'Registrando…' : 'Adicionar à fila'}</button>
        </div>
      </form>

      <section className={styles.queue} aria-labelledby="queue-title">
        <div className={styles.sectionHeading}>
          <div><h3 id="queue-title">Itens recentes</h3><p>Exibindo até 50 registros mais recentes. As tentativas e o estado são mantidos pelo serviço da fila.</p></div>
          {!loading && !loadError && <div className={styles.metrics} aria-label="Resumo dos registros exibidos">
            <span><strong>{total}</strong> total</span><span><strong>{queued}</strong> na fila, entre os exibidos</span><span><strong>{failed}</strong> com falha, entre os exibidos</span>
          </div>}
        </div>

        {loading && <UiState variant="loading" title="Consultando notificações" detail="A lista será exibida quando a consulta terminar." />}
        {!loading && loadError && <UiState variant={loadError.variant} title={loadError.title} detail={loadError.detail} onRetry={() => void load()} retryLabel="Tentar novamente" />}
        {!loading && !loadError && notifications.length === 0 && <UiState variant="empty" title="A fila ainda não tem notificações" detail="Quando um processo registrar um pedido, ele aparecerá aqui. Use o formulário para criar um registro de demonstração." />}
        {!loading && !loadError && notifications.length > 0 && (
          <div className={styles.tableScroll} role="region" aria-label="Notificações recentes; tabela rolável horizontalmente" tabIndex={0}>
            <table className={styles.table}>
              <caption>Até 50 notificações recentes</caption>
              <thead><tr><th scope="col">Criada em</th><th scope="col">Destinatário</th><th scope="col">Canal e modelo</th><th scope="col">Estado</th><th scope="col">Tentativas</th><th scope="col">Próxima tentativa</th><th scope="col">Ação</th></tr></thead>
              <tbody>{notifications.map((item) => (
                <tr key={item.id}>
                  <td>{date(item.created_at)}</td>
                  <td><strong>{recipientLabels[item.recipient_kind] || item.recipient_kind}</strong><span className={styles.secondary}>{item.recipient_email || item.recipient_id || 'Sem endereço associado'}</span></td>
                  <td><strong>{channelLabels[item.channel] || item.channel}</strong><span className={styles.secondary}>{item.template}</span></td>
                  <td><span className={`${styles.badge} ${item.status === 'sent' ? styles.good : item.status === 'failed' || item.status === 'dead' ? styles.bad : ''}`}>{statusLabels[item.status] || item.status}</span>{item.last_error && <details className={styles.errorDetails}><summary>Detalhe técnico</summary><span>{item.last_error}</span></details>}</td>
                  <td>{item.attempts} de {item.max_attempts}</td>
                  <td>{date(item.next_attempt_at)}</td>
                  <td>{(item.status === 'failed' || item.status === 'dead') ? <button type="button" onClick={() => void retry(item.id)} disabled={busy !== null} aria-label={`Solicitar nova tentativa para ${item.template}`}>{busy === item.id ? 'Solicitando…' : 'Tentar novamente'}</button> : <span className={styles.muted}>—</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
