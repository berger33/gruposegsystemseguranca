'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import styles from './SharedEmployeeComplaints.module.css';

type Status = 'pendente' | 'em_analise' | 'em_apuracao' | 'resolvida' | 'arquivada' | 'cancelada' | 'escalonada';
type Complaint = {
  id: string;
  protocol: string;
  category: string;
  severity: string;
  status: Status;
  is_restricted: true;
  minimal_share: boolean;
  is_shared_with_hr: true;
  shared_with_hr_at: string | null;
  created_at: string;
};
type SharedField = { field: 'title' | 'minimal_description'; value: string };
type Detail = { item: Complaint; sharedFields: SharedField[] };
type ReadState = 'loading' | 'ready' | 'empty' | 'error' | 'denied';
type DetailState = 'idle' | 'loading' | 'ready' | 'error' | 'denied' | 'not-shared';

const BASE = '/api/admin/hr/employee-complaints';
const STATUSES: { value: Status; label: string }[] = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'em_analise', label: 'Em análise' },
  { value: 'em_apuracao', label: 'Em apuração' },
  { value: 'resolvida', label: 'Resolvida' },
  { value: 'arquivada', label: 'Arquivada' },
  { value: 'cancelada', label: 'Cancelada' },
  { value: 'escalonada', label: 'Escalonada' },
];
const CATEGORY_LABELS: Record<string, string> = {
  atendimento: 'Atendimento', comportamento: 'Comportamento', seguranca: 'Segurança', assédio: 'Assédio',
  discriminacao: 'Discriminação', outro: 'Outro',
};
const SEVERITY_LABELS: Record<string, string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
const ERROR_LABELS: Record<string, string> = {
  invalid_id: 'O protocolo selecionado não é válido.',
  invalid_status: 'Escolha uma situação aceita pelo sistema.',
  invalid_expected_status: 'Recarregue o relato antes de atualizar a situação.',
  invalid_reason: 'Informe um motivo com pelo menos 10 caracteres.',
  stale_status: 'A situação foi atualizada por outra pessoa. Recarregue o relato e tente novamente.',
  not_found: 'Este relato não está mais compartilhado com o RH.',
  service_unavailable: 'O serviço está temporariamente indisponível. Tente novamente.',
};

function isComplaint(value: unknown): value is Complaint {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.protocol === 'string'
    && typeof item.category === 'string' && typeof item.severity === 'string'
    && STATUSES.some(status => status.value === item.status)
    && item.is_restricted === true && item.is_shared_with_hr === true;
}

function translatedError(status: number, error: unknown) {
  if (status === 401 || status === 403) return { kind: 'denied' as const, message: 'Seu perfil não tem autorização para acessar esta jornada.' };
  const code = error && typeof error === 'object' && 'error' in error && typeof (error as { error?: unknown }).error === 'string'
    ? (error as { error: string }).error : '';
  if (status === 404 || code === 'not_found') return { kind: 'not-shared' as const, message: ERROR_LABELS.not_found };
  return { kind: 'error' as const, message: ERROR_LABELS[code] || 'Não foi possível concluir a solicitação. Tente novamente.' };
}

async function responseBody(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

function statusLabel(status: string) {
  return STATUSES.find(item => item.value === status)?.label || 'Situação não reconhecida';
}

function dateLabel(value: string | null | undefined) {
  if (!value) return 'Não informada';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Data indisponível' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(parsed);
}

function sharedFields(value: unknown): SharedField[] | null {
  if (!Array.isArray(value)) return null;
  const output: SharedField[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    if ((record.field !== 'title' && record.field !== 'minimal_description') || typeof record.value !== 'string') return null;
    output.push({ field: record.field, value: record.value });
  }
  return output;
}

export default function SharedEmployeeComplaints() {
  const [items, setItems] = useState<Complaint[]>([]);
  const [listState, setListState] = useState<ReadState>('loading');
  const [listError, setListError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailState, setDetailState] = useState<DetailState>('idle');
  const [detailError, setDetailError] = useState('');
  const [nextStatus, setNextStatus] = useState<Status>('pendente');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [writeError, setWriteError] = useState('');
  const listSequence = useRef(0);
  const detailSequence = useRef(0);
  const listHeading = useRef<HTMLHeadingElement>(null);

  const loadList = useCallback(async (initial = false) => {
    const sequence = ++listSequence.current;
    if (!initial) {
      setSelectedId(null);
      setDetail(null);
      setDetailState('idle');
      detailSequence.current += 1;
    }
    setListState('loading');
    setListError('');
    setNotice('');
    try {
      const response = await fetch(BASE, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const body = await responseBody(response);
      if (sequence !== listSequence.current) return;
      if (!response.ok) {
        const failure = translatedError(response.status, body);
        setListError(failure.message);
        setListState(failure.kind === 'denied' ? 'denied' : 'error');
        setItems([]);
        return;
      }
      const rows = body && typeof body === 'object' ? (body as { items?: unknown }).items : null;
      if (!Array.isArray(rows) || !rows.every(isComplaint)) {
        setItems([]);
        setListError('A resposta recebida não está no formato esperado. Tente carregar novamente.');
        setListState('error');
        return;
      }
      setItems(rows);
      setListState(rows.length ? 'ready' : 'empty');
    } catch {
      if (sequence !== listSequence.current) return;
      setItems([]);
      setListError('Não foi possível conectar ao serviço. Tente carregar novamente.');
      setListState('error');
    }
  }, []);

  useEffect(() => { void loadList(true); return () => { listSequence.current += 1; detailSequence.current += 1; }; }, [loadList]);

  const openDetail = useCallback(async (id: string) => {
    const sequence = ++detailSequence.current;
    setSelectedId(id);
    setDetail(null);
    setDetailState('loading');
    setDetailError('');
    setReason('');
    setWriteError('');
    setNotice('');
    try {
      const response = await fetch(`${BASE}/${encodeURIComponent(id)}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const body = await responseBody(response);
      if (sequence !== detailSequence.current) return;
      if (!response.ok) {
        const failure = translatedError(response.status, body);
        setDetailError(failure.message);
        setDetailState(failure.kind);
        return;
      }
      const payload = body && typeof body === 'object' ? body as { item?: unknown; sharedFields?: unknown } : {};
      const fields = sharedFields(payload.sharedFields);
      if (!isComplaint(payload.item) || !fields) {
        setDetailError('Os dados do relato não estão no formato esperado. Tente novamente.');
        setDetailState('error');
        return;
      }
      setDetail({ item: payload.item, sharedFields: fields });
      setNextStatus(payload.item.status);
      setDetailState('ready');
    } catch {
      if (sequence !== detailSequence.current) return;
      setDetailError('Não foi possível conectar ao serviço. Tente carregar novamente.');
      setDetailState('error');
    }
  }, []);

  async function updateStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || busy) return;
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 10 || trimmedReason.length > 1000) {
      setWriteError('Explique o motivo da atualização (de 10 a 1000 caracteres).');
      return;
    }
    const requestSequence = detailSequence.current;
    setBusy(true);
    setWriteError('');
    setNotice('');
    try {
      const response = await fetch(`${BASE}/${encodeURIComponent(detail.item.id)}`, {
        method: 'PATCH', credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, expected_status: detail.item.status, reason: trimmedReason }),
      });
      const body = await responseBody(response);
      if (requestSequence !== detailSequence.current) return;
      if (!response.ok) {
        const failure = translatedError(response.status, body);
        if (failure.kind === 'denied' || failure.kind === 'not-shared') {
          setDetailError(failure.message);
          setDetailState(failure.kind);
          setDetail(null);
        } else setWriteError(failure.message);
        return;
      }
      const payload = body && typeof body === 'object' ? body as { item?: unknown } : {};
      if (!isComplaint(payload.item)) {
        setWriteError('O servidor não confirmou uma situação válida. Recarregue o relato antes de tentar novamente.');
        return;
      }
      const updated = payload.item;
      setDetail(current => current ? { ...current, item: updated } : current);
      setItems(current => current.map(item => item.id === updated.id ? updated : item));
      setNotice('Situação atualizada e registrada com o motivo informado.');
      setReason('');
    } catch {
      if (requestSequence === detailSequence.current) setWriteError('Não foi possível confirmar a atualização. Confira o serviço e tente novamente.');
    } finally {
      if (requestSequence === detailSequence.current) setBusy(false);
    }
  }

  return (
    <section className={styles.workspace} aria-labelledby="shared-complaints-title" aria-busy={listState === 'loading' || detailState === 'loading'}>
      <header className={styles.header}>
        <div>
          <h2 id="shared-complaints-title" ref={listHeading}>Reclamações compartilhadas com o RH</h2>
          <p>Consulte os relatos que foram compartilhados e acompanhe sua situação. O servidor valida o acesso a cada leitura e atualização.</p>
        </div>
        <button type="button" className={styles.secondaryButton} onClick={() => { void loadList(); }} disabled={listState === 'loading'}>Atualizar lista</button>
      </header>

      <p className={styles.privacyNotice}>São exibidos somente protocolo, categoria, severidade, situação e informações adicionais que tenham sido explicitamente compartilhadas. Descrição integral, referência, hash, conta e identidades restritas não são apresentados.</p>
      {notice ? <p className={styles.success} role="status" aria-live="polite">{notice}</p> : null}

      <div className={styles.columns}>
        <section className={styles.listPanel} aria-labelledby="shared-complaints-list-title" aria-busy={listState === 'loading'}>
          <h3 id="shared-complaints-list-title">Relatos compartilhados</h3>
          {listState === 'loading' ? <p className={styles.state} role="status">Carregando relatos compartilhados…</p> : null}
          {listState === 'denied' ? <p className={styles.error} role="alert">{listError}</p> : null}
          {listState === 'error' ? <div className={styles.error} role="alert"><p>{listError}</p><button type="button" className={styles.retryButton} onClick={() => { void loadList(); }}>Tentar novamente</button></div> : null}
          {listState === 'empty' ? <p className={styles.state}>Não há relatos compartilhados com o RH no momento.</p> : null}
          {listState === 'ready' ? (
            <ul className={styles.items}>
              {items.map(item => (
                <li key={item.id}>
                  <button type="button" className={`${styles.itemButton} ${selectedId === item.id ? styles.itemSelected : ''}`} aria-current={selectedId === item.id ? 'true' : undefined} onClick={() => { void openDetail(item.id); }}>
                    <span className={styles.protocol}>{item.protocol}</span>
                    <span>{CATEGORY_LABELS[item.category] || 'Outra categoria'} · Severidade {SEVERITY_LABELS[item.severity] || 'não informada'}</span>
                    <span className={styles.statusLine}>Situação: {statusLabel(item.status)}</span>
                    <span className={styles.dateLine}>Recebida {dateLabel(item.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className={styles.detailPanel} aria-labelledby="shared-complaint-detail-title" aria-live="polite">
          <h3 id="shared-complaint-detail-title">Detalhe e atualização</h3>
          {!selectedId ? <p className={styles.state}>Selecione um relato da lista para consultar os campos compartilhados e atualizar a situação.</p> : null}
          {detailState === 'loading' ? <p className={styles.state} role="status">Carregando detalhe do relato…</p> : null}
          {detailState === 'denied' || detailState === 'not-shared' ? <p className={styles.error} role="alert">{detailError}</p> : null}
          {detailState === 'error' ? <div className={styles.error} role="alert"><p>{detailError}</p><button type="button" className={styles.retryButton} onClick={() => { if (selectedId) void openDetail(selectedId); }}>Tentar novamente</button></div> : null}
          {detailState === 'ready' && detail ? (
            <>
              <dl className={styles.facts}>
                <div><dt>Protocolo</dt><dd>{detail.item.protocol}</dd></div>
                <div><dt>Categoria</dt><dd>{CATEGORY_LABELS[detail.item.category] || 'Outra categoria'}</dd></div>
                <div><dt>Severidade</dt><dd>{SEVERITY_LABELS[detail.item.severity] || 'Não informada'}</dd></div>
                <div><dt>Situação</dt><dd>{statusLabel(detail.item.status)}</dd></div>
                <div><dt>Compartilhado em</dt><dd>{dateLabel(detail.item.shared_with_hr_at)}</dd></div>
                {detail.sharedFields.map((field, index) => (
                  <div key={`${field.field}-${index}`}>
                    <dt>{field.field === 'title' ? 'Título compartilhado' : 'Descrição mínima compartilhada'}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
              <form className={styles.form} onSubmit={event => { void updateStatus(event); }}>
                <h4>Atualizar situação</h4>
                <div className={styles.field}>
                  <label htmlFor="shared-complaint-status">Nova situação</label>
                  <select id="shared-complaint-status" value={nextStatus} onChange={event => setNextStatus(event.target.value as Status)}>
                    {STATUSES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <p id="shared-complaint-status-help" className={styles.hint}>Use uma situação aceita pelo sistema. A mudança só é gravada após confirmar.</p>
                </div>
                <div className={styles.field}>
                  <label htmlFor="shared-complaint-reason">Motivo da atualização</label>
                  <textarea id="shared-complaint-reason" rows={4} minLength={10} maxLength={1000} required value={reason} onChange={event => setReason(event.target.value)} aria-describedby="shared-complaint-reason-help" />
                  <p id="shared-complaint-reason-help" className={styles.hint}>Obrigatório, de 10 a 1000 caracteres. O motivo acompanha a alteração na trilha do relato.</p>
                </div>
                {writeError ? (
                  <div className={styles.error} role="alert">
                    <p>{writeError}</p>
                    <button type="button" className={styles.retryButton} disabled={busy} onClick={() => { if (selectedId) void openDetail(selectedId); }}>Recarregar relato</button>
                  </div>
                ) : null}
                <button type="submit" className={styles.primaryButton} disabled={busy || reason.trim().length < 10} aria-busy={busy}>{busy ? 'Salvando situação…' : 'Salvar situação'}</button>
              </form>
            </>
          ) : null}
        </section>
      </div>
      <p className={styles.limitNote}>Esta jornada registra somente a mudança de situação e o motivo. Não inclui mensagens, evidências, upload, anonimização ou cópia da descrição completa.</p>
    </section>
  );
}
