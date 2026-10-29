'use client';

// UX-PRO — RH: relatos explicitamente compartilhados com o RH.
//
// Esta aba é ADITIVA em `/admin/funcionarios`. O que ela faz: lista somente os
// relatos que o servidor já devolve ao papel `rh` (projeção mínima: protocolo,
// categoria, severidade, situação e as datas do envelope), mostra o detalhe
// mínimo do relato escolhido e permite registrar uma nova situação com motivo,
// usando a operação própria `/api/admin/employee-complaint-hr-status`.
//
// O que ela NÃO faz e não promete: não exibe descrição integral, título por
// padrão, referência do colaborador, hash, conta do cliente, contatos,
// responsáveis internos, mensagens ou evidências (essas rotas têm contrato de
// visibilidade próprio e a checagem de compartilhamento do relato nelas é
// dívida registrada); não faz upload; não anonimiza; não decide autorização —
// quem decide é o servidor, a cada chamada. O `AdminGate` de
// `/admin/funcionarios` aceita `rh`, `marcelo`, `admin` e `ti`, então um papel
// pode abrir a página e receber negativa da API: a tela mostra o estado
// "negado" em vez de inventar dados.
//
// Também não usa o PATCH legado de `/api/admin/employee-complaints`, que
// responde 500 ao RH (PostgreSQL 42P08) e permanece preservado para os seus
// consumidores atuais até decisão do proprietário.

import { FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import UiBadge, { type UiBadgeTone } from '../../../components/ui/UiBadge';
import UiState from '../../../components/ui/UiState';
import UiTaskWorkspace from '../../../components/ui/UiTaskWorkspace';
import styles from '../../../components/ui/UiWorkspace.module.css';
import { hrRequest, type HrErrorDescriptor } from '../../../lib/hr-request';
import { hrErrorFootnote, hrErrorVariant } from '../../../lib/hr-vocabulary.mjs';
import localStyles from './SharedComplaints.module.css';

const LIST_ENDPOINT = '/api/admin/employee-complaints';
const DETAIL_ENDPOINT = '/api/admin/employee-complaints/';
const HR_STATUS_ENDPOINT = '/api/admin/employee-complaint-hr-status';

type SharedComplaint = {
  id: string;
  protocol: string;
  category: string;
  severity: string;
  status: string;
  is_restricted: boolean;
  minimal_share: boolean;
  is_shared_with_hr: boolean;
  shared_with_hr_at: string | null;
  created_at: string;
};

type SharedField = {
  shared_field: string;
  shared_value: string;
  justification?: string | null;
  shared_at?: string | null;
};

type HistoryEntry = {
  previous_status: string | null;
  next_status: string;
  is_hr_share: boolean;
  created_at: string;
};

type ComplaintDetail = {
  complaint: SharedComplaint;
  hr_shares: SharedField[];
  history: HistoryEntry[];
};

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  em_analise: 'Em análise',
  em_apuracao: 'Em apuração',
  escalonada: 'Escalonada',
  resolvida: 'Resolvida',
  arquivada: 'Arquivada',
  cancelada: 'Cancelada',
};

// Ordem de leitura; os VALORES são exatamente o enum `cli_complaint_status`
// que o servidor aceita. Nenhum estado novo é inventado pela interface.
const STATUS_ORDER = ['pendente', 'em_analise', 'em_apuracao', 'escalonada', 'resolvida', 'arquivada', 'cancelada'];

const STATUS_TONES: Record<string, UiBadgeTone> = {
  pendente: 'info',
  em_analise: 'info',
  em_apuracao: 'warning',
  escalonada: 'warning',
  resolvida: 'success',
  arquivada: 'neutral',
  cancelada: 'danger',
};

const CATEGORY_LABELS: Record<string, string> = {
  atendimento: 'Atendimento',
  comportamento: 'Comportamento',
  seguranca: 'Segurança',
  'assédio': 'Assédio',
  discriminacao: 'Discriminação',
  outro: 'Outro',
};

const SEVERITY_LABELS: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};

// Únicos campos que a interface exibe ALÉM da projeção mínima — e somente
// quando aparecem em `hr_shares`, isto é, quando foram expressamente
// compartilhados. Qualquer outro nome de campo é ignorado.
const SHARED_EXTRA_LABELS: Record<string, string> = {
  title: 'Título compartilhado',
  minimal_description: 'Descrição mínima compartilhada',
};

const ERROR_LABELS: Record<string, { title: string; detail: string; denied?: boolean }> = {
  forbidden: {
    denied: true,
    title: 'Requisição recusada por proteção de origem',
    detail: 'A chamada não veio da própria aplicação. Recarregue a página e repita a ação.',
  },
  unauthorized: {
    denied: true,
    title: 'Sessão não reconhecida',
    detail: 'Sua sessão de equipe expirou ou não foi reconhecida. Entre novamente. Nada foi exibido nem gravado.',
  },
  admin_session_required: {
    denied: true,
    title: 'Sessão não reconhecida',
    detail: 'Sua sessão de equipe expirou ou não foi reconhecida. Entre novamente. Nada foi exibido nem gravado.',
  },
  forbidden_restricted_channel: {
    denied: true,
    title: 'Seu papel não opera este canal',
    detail: 'O canal restrito de reclamações sobre colaborador é decidido no servidor: o seu papel não está autorizado. Nada foi exibido nem gravado.',
  },
  not_found: {
    denied: true,
    title: 'Este relato não está disponível para o RH',
    detail: 'O relato não existe ou não foi explicitamente compartilhado com o RH. Por isso nenhum dado é exibido e nenhuma alteração é aceita.',
  },
  invalid_id: {
    title: 'Relato inválido',
    detail: 'O identificador enviado não é válido. Selecione o relato novamente.',
  },
  invalid_status: {
    title: 'Situação não aceita',
    detail: 'Escolha uma das situações aceitas pelo servidor.',
  },
  invalid_reason: {
    title: 'Motivo inválido',
    detail: 'O motivo precisa ter entre 10 e 1000 caracteres.',
  },
  invalid_expected_status: {
    title: 'Situação esperada inválida',
    detail: 'O relato precisa ser relido antes de registrar a nova situação.',
  },
  status_conflict: {
    title: 'O relato mudou enquanto você decidia',
    detail: 'A situação atual é diferente da que estava em tela. O servidor não alterou nada: releia o relato e repita a operação.',
  },
  status_unchanged: {
    title: 'A situação escolhida já é a atual',
    detail: 'Nada foi gravado e nenhum histórico foi criado. Escolha uma situação diferente da atual.',
  },
  complaint_status_unavailable: {
    title: 'Não foi possível registrar a situação',
    detail: 'O servidor não confirmou a gravação. Situação, histórico e auditoria são uma única transação: nada foi dado como feito.',
  },
  invalid_payload: {
    title: 'Resposta em formato inesperado',
    detail: 'O servidor respondeu sem os campos esperados (payload inválido). Isto não é a mesma coisa que não haver relatos.',
  },
};

function errorLabel(descriptor: HrErrorDescriptor | null): { title: string; detail: string; denied: boolean } | null {
  if (!descriptor) return null;
  const label = descriptor.code ? ERROR_LABELS[descriptor.code] : undefined;
  const denied = Boolean(label?.denied) || descriptor.kind === 'denied' || descriptor.status === 401 || descriptor.status === 403;
  return {
    title: label?.title || descriptor.title,
    detail: label?.detail || descriptor.detail,
    denied,
  };
}

/**
 * Falha de servidor/rede na ESCRITA: a operação de situação é uma transação
 * única (situação + histórico + auditoria), então nada foi confirmado. A
 * mensagem fala da operação, não de "falha genérica" — e nunca mostra o código
 * cru do servidor.
 */
function writeFailure(descriptor: HrErrorDescriptor): HrErrorDescriptor {
  const known = descriptor.code ? ERROR_LABELS[descriptor.code] : undefined;
  if (known || (descriptor.status >= 400 && descriptor.status < 500)) return descriptor;
  const label = ERROR_LABELS.complaint_status_unavailable;
  return {
    kind: 'retry',
    title: label.title,
    detail: label.detail,
    code: 'complaint_status_unavailable',
    status: descriptor.status,
    canRetry: true,
  };
}

function invalidPayloadError(scope: string): HrErrorDescriptor {
  const label = ERROR_LABELS.invalid_payload;
  return { kind: 'invalid', title: label.title, detail: `${label.detail} (${scope})`, code: 'invalid_payload', status: 200, canRetry: true };
}

function statusLabel(value: unknown): string {
  const key = String(value ?? '');
  return STATUS_LABELS[key] || key || '—';
}

function categoryLabel(value: unknown): string {
  const key = String(value ?? '');
  return CATEGORY_LABELS[key] || key || '—';
}

function severityLabel(value: unknown): string {
  const key = String(value ?? '');
  return SEVERITY_LABELS[key] || key || '—';
}

/** Data (YYYY-MM-DD ou ISO) em pt-BR, sem cortar o texto do servidor. */
function parseDateOnly(value: unknown): string {
  const raw = String(value ?? '');
  if (!raw) return '—';
  const day = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const parsed = new Date(`${day}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(parsed);
    }
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseComplaint(value: unknown): SharedComplaint | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.protocol !== 'string' || typeof value.status !== 'string') return null;
  return {
    id: value.id,
    protocol: value.protocol,
    category: typeof value.category === 'string' ? value.category : '',
    severity: typeof value.severity === 'string' ? value.severity : '',
    status: value.status,
    is_restricted: value.is_restricted === true,
    minimal_share: value.minimal_share === true,
    is_shared_with_hr: value.is_shared_with_hr === true,
    shared_with_hr_at: typeof value.shared_with_hr_at === 'string' ? value.shared_with_hr_at : null,
    created_at: typeof value.created_at === 'string' ? value.created_at : '',
  };
}

function parseComplaintList(payload: unknown): SharedComplaint[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.items)) return null;
  const parsed: SharedComplaint[] = [];
  for (const item of payload.items) {
    const complaint = parseComplaint(item);
    if (!complaint) return null;
    parsed.push(complaint);
  }
  return parsed;
}

function parseSharedFields(value: unknown): SharedField[] | null {
  if (!Array.isArray(value)) return null;
  const parsed: SharedField[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.shared_field !== 'string') return null;
    parsed.push({
      shared_field: item.shared_field,
      shared_value: typeof item.shared_value === 'string' ? item.shared_value : String(item.shared_value ?? ''),
      justification: typeof item.justification === 'string' ? item.justification : null,
      shared_at: typeof item.shared_at === 'string' ? item.shared_at : null,
    });
  }
  return parsed;
}

function parseHistory(value: unknown): HistoryEntry[] | null {
  if (!Array.isArray(value)) return null;
  const parsed: HistoryEntry[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.next_status !== 'string') return null;
    parsed.push({
      previous_status: typeof item.previous_status === 'string' ? item.previous_status : null,
      next_status: item.next_status,
      is_hr_share: item.is_hr_share === true,
      created_at: typeof item.created_at === 'string' ? item.created_at : '',
    });
  }
  return parsed;
}

function parseDetail(payload: unknown): ComplaintDetail | null {
  if (!isRecord(payload)) return null;
  const complaint = parseComplaint(payload.complaint);
  const shares = parseSharedFields(payload.hr_shares);
  const history = parseHistory(payload.history);
  if (!complaint || !shares || !history) return null;
  return { complaint, hr_shares: shares, history };
}

export default function SharedComplaints() {
  const baseId = useId();
  const statusFieldId = `${baseId}-nova-situacao`;
  const statusHintId = `${baseId}-nova-situacao-dica`;
  const reasonFieldId = `${baseId}-motivo`;
  const reasonHintId = `${baseId}-motivo-dica`;
  const actionAlertRef = useRef<HTMLDivElement>(null);
  // Sequências independentes: uma resposta fora de ordem não substitui a
  // leitura mais recente da lista nem a do detalhe.
  const listSequence = useRef(0);
  const detailSequence = useRef(0);

  const [items, setItems] = useState<SharedComplaint[] | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [readError, setReadError] = useState<HrErrorDescriptor | null>(null);
  const [detail, setDetail] = useState<ComplaintDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<HrErrorDescriptor | null>(null);
  const [statusDraft, setStatusDraft] = useState('');
  const [reasonDraft, setReasonDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState<HrErrorDescriptor | null>(null);

  const focusActionAlert = useCallback(() => {
    requestAnimationFrame(() => { actionAlertRef.current?.focus(); });
  }, []);

  const loadList = useCallback(async (successNotice = '') => {
    const sequence = ++listSequence.current;
    setListLoading(true);
    const result = await hrRequest<unknown>(LIST_ENDPOINT);
    if (sequence !== listSequence.current) return;
    setListLoading(false);
    if (!result.ok) {
      // Falha de leitura não vira lista vazia: a última leitura fica em tela.
      setReadError(result.error);
      if (successNotice) setNotice(`${successNotice} A releitura falhou; a lista em tela pode estar desatualizada.`);
      return;
    }
    const parsed = parseComplaintList(result.data);
    if (!parsed) {
      setReadError(invalidPayloadError('lista de relatos compartilhados'));
      return;
    }
    setItems(parsed);
    setReadError(null);
    if (successNotice) setNotice(successNotice);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const sequence = ++detailSequence.current;
    setDetailLoading(true);
    setDetailError(null);
    const result = await hrRequest<unknown>(`${DETAIL_ENDPOINT}${id}`);
    if (sequence !== detailSequence.current) return;
    setDetailLoading(false);
    if (!result.ok) {
      setDetail(null);
      setDetailError(result.error);
      return;
    }
    const parsed = parseDetail(result.data);
    if (!parsed) {
      setDetail(null);
      setDetailError(invalidPayloadError('detalhe do relato'));
      return;
    }
    setDetail(parsed);
    setStatusDraft('');
    setReasonDraft('');
    setActionError(null);
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);

  function selectComplaint(id: string) {
    setNotice('');
    setActionError(null);
    setStatusDraft('');
    setReasonDraft('');
    // A resposta anterior (de outro relato) não pode repintar esta seleção.
    detailSequence.current += 1;
    void loadDetail(id);
  }

  async function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || saving) return;
    const current = detail.complaint;
    setActionError(null);
    setNotice('');
    if (!statusDraft) {
      setActionError({ kind: 'invalid', title: ERROR_LABELS.invalid_status.title, detail: 'Escolha a nova situação do relato antes de registrar.', code: 'invalid_status', status: 400, canRetry: false });
      focusActionAlert();
      return;
    }
    if (statusDraft === current.status) {
      setActionError({ kind: 'conflict', title: ERROR_LABELS.status_unchanged.title, detail: ERROR_LABELS.status_unchanged.detail, code: 'status_unchanged', status: 409, canRetry: false });
      focusActionAlert();
      return;
    }
    if (reasonDraft.trim().length < 10) {
      setActionError({ kind: 'invalid', title: ERROR_LABELS.invalid_reason.title, detail: ERROR_LABELS.invalid_reason.detail, code: 'invalid_reason', status: 400, canRetry: false });
      focusActionAlert();
      return;
    }
    setSaving(true);
    const result = await hrRequest<unknown>(HR_STATUS_ENDPOINT, {
      method: 'PATCH',
      body: JSON.stringify({
        id: current.id,
        status: statusDraft,
        reason: reasonDraft.trim(),
        // Situação que estava em tela: o servidor recusa sobrescrever decisão
        // concorrente em vez de aplicar "por cima".
        expected_status: current.status,
      }),
    });
    setSaving(false);
    if (!result.ok) {
      setActionError(writeFailure(result.error));
      focusActionAlert();
      return;
    }
    if (!isRecord(result.data)) {
      setActionError(invalidPayloadError('confirmação da atualização'));
      focusActionAlert();
      return;
    }
    const updated = parseComplaint(result.data.complaint);
    if (!updated) {
      setActionError(invalidPayloadError('confirmação da atualização'));
      focusActionAlert();
      return;
    }
    setItems(previous => previous ? previous.map(item => (item.id === updated.id ? { ...item, ...updated } : item)) : previous);
    const createdHistory = parseHistory([result.data.history]);
    setDetail(previous => {
      if (!previous || previous.complaint.id !== updated.id) return previous;
      return {
        ...previous,
        complaint: updated,
        history: createdHistory && createdHistory.length ? [createdHistory[0], ...previous.history] : previous.history,
      };
    });
    setNotice(`Situação registrada: ${statusLabel(updated.status)}. O histórico e a auditoria foram gravados na mesma transação.`);
    setStatusDraft('');
    setReasonDraft('');
  }

  const failure = errorLabel(readError);
  const detailFailure = errorLabel(detailError);
  const actionFailure = errorLabel(actionError);
  const sharedExtras = detail ? detail.hr_shares.filter(share => Boolean(SHARED_EXTRA_LABELS[share.shared_field])) : [];
  const blocked = Boolean(failure?.denied);

  return (
    <UiTaskWorkspace className={localStyles.taskContainer} aria-busy={listLoading || detailLoading || saving}>
      <section className={styles.panel} aria-labelledby="rh-reclamacoes-compartilhadas-titulo">
        <div className={localStyles.sectionHeader}>
          <div>
            <h3 id="rh-reclamacoes-compartilhadas-titulo" className={styles.panelTitle}>
              Reclamações compartilhadas
              {items && !readError ? ` (${items.length})` : ''}
            </h3>
            <p className={styles.hint}>
              Somente relatos sobre colaborador que foram explicitamente compartilhados com o RH aparecem aqui, com o
              envelope mínimo: protocolo, categoria, severidade e situação. Descrição integral, referência do
              colaborador, hash, conta do cliente e identidades internas não são exibidos nesta jornada.
            </p>
          </div>
          <div className={styles.actions}>
            <button type="button" disabled={listLoading} aria-busy={listLoading} onClick={() => { setNotice(''); void loadList(); }}>
              {listLoading ? 'Atualizando relatos…' : 'Atualizar relatos'}
            </button>
          </div>
        </div>

        {notice ? (
          <p className={styles.notice} role="status" aria-live="polite">{notice}</p>
        ) : null}

        {actionFailure ? (
          <div ref={actionAlertRef} tabIndex={-1} className={`${styles.notice} ${styles.noticeError}`} role="alert">
            <strong>{actionFailure.title}</strong>
            <p className={styles.hint}>{actionFailure.detail}</p>
            <p className={styles.hint}>{hrErrorFootnote(actionError)}</p>
          </div>
        ) : null}

        {listLoading && !items && !readError ? (
          <UiState
            variant="loading"
            title="Consultando os relatos compartilhados com o RH…"
            detail="Aguarde a resposta do servidor. Nenhum relato é dado como inexistente antes da leitura."
          />
        ) : null}

        {failure ? (
          blocked ? (
            <UiState
              variant="denied"
              title={failure.title}
              detail={`${failure.detail} ${hrErrorFootnote(readError)}`}
            />
          ) : (
            <UiState
              variant={hrErrorVariant(readError)}
              title={failure.title}
              detail={`${failure.detail} ${items ? 'A lista anterior foi preservada; não é possível confirmar se houve mudanças.' : 'Isto não significa que não existam relatos compartilhados.'} ${hrErrorFootnote(readError)}`}
              retryLabel={readError?.canRetry ? 'Tentar novamente' : undefined}
              onRetry={readError?.canRetry ? () => { void loadList(); } : undefined}
            />
          )
        ) : null}

        {!failure && items && !items.length ? (
          <UiState
            variant="empty"
            title="Nenhum relato compartilhado com o RH"
            detail="O servidor respondeu: não há reclamações sobre colaborador explicitamente compartilhadas com o RH no momento. Compartilhar é uma decisão registrada, com campo, valor e justificativa."
          />
        ) : null}

        {!failure && items && items.length ? (
          <ul className={localStyles.list} aria-label="Relatos compartilhados com o RH">
            {items.map(item => (
              <li key={item.id} className={localStyles.listItem}>
                <div className={localStyles.listMeta}>
                  <strong>{item.protocol}</strong>
                  <UiBadge tone={STATUS_TONES[item.status] || 'neutral'} srPrefix="Situação">{statusLabel(item.status)}</UiBadge>
                </div>
                <p className={styles.hint}>
                  Categoria {categoryLabel(item.category)} · severidade {severityLabel(item.severity)} · compartilhado em {parseDateOnly(item.shared_with_hr_at)}
                </p>
                <div className={styles.actions}>
                  <button
                    type="button"
                    aria-expanded={detail?.complaint.id === item.id}
                    onClick={() => selectComplaint(item.id)}
                  >
                    Ver detalhes
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {!failure && !detail && !detailLoading ? (
          <p className={styles.hint}>Selecione um relato em “Ver detalhes” para consultar o envelope compartilhado e registrar a situação.</p>
        ) : null}

        {detailLoading ? (
          <UiState
            variant="loading"
            title="Consultando o envelope do relato…"
            detail="Buscando somente os campos explicitamente compartilhados com o RH."
          />
        ) : null}

        {!detailLoading && detailFailure ? (
          detailFailure.denied ? (
            <UiState
              variant="denied"
              title={detailFailure.title}
              detail={`${detailFailure.detail} ${hrErrorFootnote(detailError)}`}
            />
          ) : detailError?.code === 'invalid_payload' ? (
            <UiState
              variant="error"
              title={detailFailure.title}
              detail={`${detailFailure.detail} ${hrErrorFootnote(detailError)}`}
              retryLabel="Tentar novamente"
              onRetry={() => { if (detail) void loadDetail(detail.complaint.id); }}
            />
          ) : (
            <UiState
              variant={hrErrorVariant(detailError)}
              title={detailFailure.title}
              detail={`${detailFailure.detail} ${hrErrorFootnote(detailError)}`}
              retryLabel={detailError?.canRetry ? 'Tentar novamente' : undefined}
              onRetry={detailError?.canRetry ? () => { void loadList(); } : undefined}
            />
          )
        ) : null}

        {detail && !detailLoading ? (
          <section className={localStyles.detail} aria-labelledby="rh-reclamacao-detalhe-titulo">
            <h4 id="rh-reclamacao-detalhe-titulo" className={styles.panelTitle}>Detalhe do relato {detail.complaint.protocol}</h4>
            <dl className={styles.facts}>
              <div><dt>Protocolo</dt><dd>{detail.complaint.protocol}</dd></div>
              <div><dt>Categoria</dt><dd>{categoryLabel(detail.complaint.category)}</dd></div>
              <div><dt>Severidade</dt><dd>{severityLabel(detail.complaint.severity)}</dd></div>
              <div><dt>Situação</dt><dd>{statusLabel(detail.complaint.status)}</dd></div>
              <div><dt>Compartilhado em</dt><dd>{parseDateOnly(detail.complaint.shared_with_hr_at)}</dd></div>
              <div><dt>Aberto em</dt><dd>{parseDateOnly(detail.complaint.created_at)}</dd></div>
            </dl>

            <h5 className={localStyles.subheading}>Campos adicionais expressamente compartilhados</h5>
            {sharedExtras.length ? (
              <ul className={localStyles.sharedList}>
                {sharedExtras.map(share => (
                  <li key={`${share.shared_field}-${share.shared_at || ''}`}>
                    <strong>{SHARED_EXTRA_LABELS[share.shared_field]}</strong>: {share.shared_value}
                    {share.justification ? <span className={styles.hint}> — justificativa registrada: {share.justification}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.hint}>Nenhum campo além da projeção mínima foi compartilhado com o RH. Título e descrição mínima só aparecem aqui quando registrados como compartilhamento justificado.</p>
            )}

            <h5 className={localStyles.subheading}>Histórico de situação</h5>
            {detail.history.length ? (
              <ul className={localStyles.sharedList}>
                {detail.history.map(entry => (
                  <li key={`${entry.next_status}-${entry.created_at}`}>
                    {entry.previous_status ? `${statusLabel(entry.previous_status)} → ` : ''}{statusLabel(entry.next_status)}
                    {entry.is_hr_share ? ' · registro de compartilhamento' : ''} · {parseDateOnly(entry.created_at)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.hint}>O servidor não devolveu registros de histórico para este relato.</p>
            )}

            <form className={localStyles.form} onSubmit={submitUpdate} aria-describedby={statusHintId}>
              <div className={styles.field}>
                <label htmlFor={statusFieldId}>Nova situação</label>
                <select
                  id={statusFieldId}
                  value={statusDraft}
                  disabled={saving}
                  aria-describedby={statusHintId}
                  onChange={event => setStatusDraft(event.target.value)}
                >
                  <option value="">Selecione a nova situação</option>
                  {STATUS_ORDER.map(value => (
                    <option key={value} value={value} disabled={value === detail.complaint.status}>
                      {STATUS_LABELS[value]}{value === detail.complaint.status ? ' (situação atual)' : ''}
                    </option>
                  ))}
                </select>
                <p
                  id={statusHintId}
                  className={`${styles.hint} ${localStyles.statusHint}`}
                  data-conflict={statusDraft && statusDraft === detail.complaint.status ? 'true' : undefined}
                >
                  Situação atual: {statusLabel(detail.complaint.status)}. Somente as situações aceitas pelo servidor são
                  oferecidas; registrar a mesma situação não cria histórico.
                </p>
              </div>
              <div className={styles.field}>
                <label htmlFor={reasonFieldId}>Motivo da atualização</label>
                <textarea
                  id={reasonFieldId}
                  value={reasonDraft}
                  rows={3}
                  minLength={10}
                  maxLength={1000}
                  disabled={saving}
                  aria-describedby={reasonHintId}
                  onChange={event => setReasonDraft(event.target.value)}
                />
                <p id={reasonHintId} className={styles.hint}>
                  Entre 10 e 1000 caracteres. O motivo fica no histórico imutável do relato e não pode ser editado depois.
                </p>
              </div>
              <div className={styles.actions}>
                <button type="submit" className={styles.primary} disabled={saving || !statusDraft} aria-busy={saving}>
                  {saving ? 'Registrando situação…' : 'Registrar situação'}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <p className={styles.footnote}>
          <strong>Limites desta jornada:</strong> o RH vê somente relatos explicitamente compartilhados, com o envelope
          mínimo; compartilhar é decisão registrada campo a campo, com justificativa. Esta aba não faz upload, não
          anonimiza, não exibe mensagens nem evidências (essas rotas têm contrato de visibilidade próprio e a checagem
          de compartilhamento do relato nelas é dívida registrada), não envia e-mail e não define retenção. A atualização
          de situação grava negócio, histórico e auditoria na mesma transação. A leitura administrativa é global, sem
          escopo automático por conta, e a auditoria administrativa das demais rotas não tem garantia transacional
          provada. Produção: NO-GO. Aceite humano: não registrado.
        </p>
      </section>
    </UiTaskWorkspace>
  );
}
