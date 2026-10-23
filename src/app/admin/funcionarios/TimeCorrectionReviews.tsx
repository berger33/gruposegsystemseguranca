'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import UiBadge from '../../../components/ui/UiBadge';
import UiState from '../../../components/ui/UiState';
import UiTaskWorkspace from '../../../components/ui/UiTaskWorkspace';
import styles from '../../../components/ui/UiWorkspace.module.css';
import { hrRequest, type HrErrorDescriptor } from '../../../lib/hr-request';
import {
  hrErrorFootnote,
  hrErrorVariant,
  timeCorrectionStatusLabel,
  timeCorrectionStatusTone,
  timeEntryStatusLabel,
  timeEntryStatusTone,
  timePunchKindLabel,
} from '../../../lib/hr-vocabulary.mjs';
import localStyles from './TimeCorrectionReviews.module.css';

type EmployeeOption = { id: string; display_name: string; matricula: string };

type TimeEntryRow = {
  id: string;
  entry_date: string;
  clock_in: string | null;
  clock_out: string | null;
  hours_worked: number | string | null;
  status: string;
};

type PunchProof = {
  id: string;
  kind: string;
  recorded_at: string;
  latitude: number;
  longitude: number;
  accuracy_m: number;
  request_hash: string;
  address_label: string | null;
  address_status: string;
};

type Correction = {
  id: string;
  employee_name: string;
  matricula: string;
  time_entry_id: string;
  employee_id: string;
  entry_date: string;
  reason: string;
  status: string;
  requested_changes: Record<string, unknown>;
  original_snapshot: Record<string, unknown>;
  approved_changes?: Record<string, unknown>;
  clock_in: string | null;
  clock_out: string | null;
  hours_worked: number | string | null;
  rejection_reason?: string;
};

function formatEntryDate(value: string | null | undefined): string {
  const iso = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(`${iso}T12:00:00`));
}

function shortTime(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value).slice(0, 5);
}

function formatTimeRange(clockIn: unknown, clockOut: unknown): string {
  return `${shortTime(clockIn)}–${shortTime(clockOut)}`;
}

function formatSnapshotSummary(snapshot: Record<string, unknown> | null | undefined): string {
  if (!snapshot || typeof snapshot !== 'object') return 'Não informado';
  const parts: string[] = [];
  if (snapshot.clock_in || snapshot.clock_out) {
    parts.push(`Horário ${formatTimeRange(snapshot.clock_in, snapshot.clock_out)}`);
  }
  if (snapshot.hours_worked !== null && snapshot.hours_worked !== undefined && snapshot.hours_worked !== '') {
    parts.push(`${snapshot.hours_worked} h`);
  }
  if (typeof snapshot.justification === 'string' && snapshot.justification.trim()) {
    parts.push(snapshot.justification.trim());
  }
  return parts.length ? parts.join(' · ') : 'Sem alteração de horário detalhada';
}

function formatHereAddressStatus(punch: PunchProof): string {
  if (punch.address_label) return `Endereço via HERE: ${punch.address_label}`;
  if (punch.address_status === 'not_configured') return 'Consulta de endereço não configurada.';
  if (punch.address_status === 'not_requested') return 'Coordenadas não foram enviadas ao HERE para esta marcação.';
  return 'O endereço não foi localizado nesta consulta.';
}

function PunchProofList({ punches, emptyDetail }: { punches: PunchProof[]; emptyDetail: string }) {
  if (!punches.length) {
    return (
      <UiState
        variant="empty"
        title="Sem marcações geográficas para esta jornada"
        detail={emptyDetail}
      />
    );
  }
  return (
    <div className={styles.cards}>
      {punches.map(punch => (
        <article key={punch.id} className={styles.card}>
          <h5 className={styles.cardTitle}>
            {timePunchKindLabel(punch.kind)} ·{' '}
            {new Date(punch.recorded_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
          </h5>
          <p className={styles.hint}>
            Coordenadas {punch.latitude.toFixed(5)}, {punch.longitude.toFixed(5)} · precisão {Math.round(punch.accuracy_m)} m
          </p>
          <p className={styles.hint}>{formatHereAddressStatus(punch)}</p>
          <details className={localStyles.technicalDetails}>
            <summary>Identificador e hash SHA-256</summary>
            <dl className={localStyles.technicalMeta}>
              <dt>Código da marcação</dt>
              <dd>{punch.id}</dd>
              <dt>Hash SHA-256 da solicitação</dt>
              <dd>{punch.request_hash}</dd>
            </dl>
          </details>
        </article>
      ))}
    </div>
  );
}

export default function TimeCorrectionReviews({ employees }: { employees: EmployeeOption[] }) {
  const [items, setItems] = useState<Correction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<HrErrorDescriptor | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async (successNotice = '') => {
    setLoading(true);
    const result = await hrRequest<{ corrections?: Correction[] }>('/api/admin/hr/l03/time-corrections');
    if (result.ok) {
      setItems(result.data.corrections || []);
      setReadError(null);
      if (successNotice) setNotice(successNotice);
    } else {
      // Falha de leitura nunca apaga a última fila carregada nem se disfarça de fila vazia.
      setReadError(result.error);
      if (successNotice) setNotice(`${successNotice} A releitura automática falhou; tente atualizar a fila.`);
    }
    setLoaded(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <UiTaskWorkspace className={localStyles.taskContainer} aria-busy={loading}>
      <ClockHistory employees={employees} />

      <section className={styles.panel} aria-labelledby="rh-ajustes-ponto-titulo">
        <div className={localStyles.sectionHeader}>
          <div>
            <h3 id="rh-ajustes-ponto-titulo" className={styles.panelTitle}>
              Ajustes de ponto solicitados pelos funcionários {loaded && !readError ? `(${items.length})` : ''}
            </h3>
            <p className={styles.hint}>
              Leia o motivo e confira os horários e as horas efetivamente trabalhadas, descontando os intervalos.
              Aprovar atualiza o resumo da jornada; as marcações e a localização originais permanecem preservadas.
            </p>
          </div>
          <div className={styles.actions}>
            <button type="button" disabled={loading} aria-busy={loading} onClick={() => { setNotice(''); void load(); }}>
              {loading ? 'Atualizando pedidos…' : 'Atualizar pedidos'}
            </button>
          </div>
        </div>

        {notice ? (
          <p className={styles.notice} role="status" aria-live="polite">{notice}</p>
        ) : null}

        {!loaded && loading ? (
          <UiState
            variant="loading"
            title="Consultando os pedidos de ajuste no seu escopo…"
            detail="Aguarde a resposta do servidor. Nenhum pedido é dado como inexistente antes da leitura."
          />
        ) : null}

        {readError ? (
          <UiState
            variant={hrErrorVariant(readError)}
            title={readError.title}
            detail={`${readError.detail} ${items.length ? 'A lista anterior foi preservada; não é possível confirmar se houve novos pedidos.' : 'Isto não significa que a fila esteja vazia.'} ${hrErrorFootnote(readError)}`}
            retryLabel={readError.canRetry ? 'Tentar carregar novamente' : undefined}
            onRetry={readError.canRetry ? () => { void load(); } : undefined}
          />
        ) : null}

        {loaded && !readError && !items.length ? (
          <UiState
            variant="empty"
            title="Nenhum pedido no seu escopo de acesso"
            detail="A consulta foi respondida pelo servidor e não há pedidos de ajuste de ponto aguardando ou históricos nas suas concessões."
          />
        ) : null}

        {items.length ? (
          <div className={styles.cards}>
            {items.map(item => (
              <Review key={`${item.id}:${item.status}`} item={item} refresh={load} />
            ))}
          </div>
        ) : null}
      </section>
    </UiTaskWorkspace>
  );
}

function ClockHistory({ employees }: { employees: EmployeeOption[] }) {
  const baseId = useId();
  const selectId = `${baseId}-funcionario`;
  const [employeeId, setEmployeeId] = useState('');
  const [reloadNonce, setReloadNonce] = useState(0);
  const [entries, setEntries] = useState<TimeEntryRow[] | null>(null);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<HrErrorDescriptor | null>(null);
  const [selectedEntryDate, setSelectedEntryDate] = useState('');
  const [proofsEntryId, setProofsEntryId] = useState('');
  const [proofs, setProofs] = useState<PunchProof[] | null>(null);
  const [proofsLoading, setProofsLoading] = useState(false);
  const [proofsError, setProofsError] = useState<HrErrorDescriptor | null>(null);

  useEffect(() => {
    let active = true;
    setProofs(null);
    setProofsEntryId('');
    setProofsError(null);
    setEntriesError(null);
    if (!employeeId) {
      setEntries(null);
      setEntriesLoading(false);
      return;
    }
    setEntriesLoading(true);
    hrRequest<{ entries?: TimeEntryRow[] }>(`/api/admin/hr/l03/time-clock?employee_id=${encodeURIComponent(employeeId)}`)
      .then(result => {
        if (!active) return;
        if (result.ok) {
          setEntries(result.data.entries || []);
          setEntriesError(null);
        } else {
          setEntriesError(result.error);
        }
      })
      .finally(() => {
        if (active) setEntriesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [employeeId, reloadNonce]);

  async function showProofs(entry: TimeEntryRow) {
    setProofsLoading(true);
    setProofsEntryId(entry.id);
    setSelectedEntryDate(formatEntryDate(entry.entry_date));
    setProofs(null);
    setProofsError(null);
    const result = await hrRequest<{ punches?: PunchProof[] }>(
      `/api/admin/hr/l03/time-punches?employee_id=${encodeURIComponent(employeeId)}&entry_id=${encodeURIComponent(entry.id)}`,
    );
    if (result.ok) {
      setProofs(result.data.punches || []);
    } else {
      setProofsError(result.error);
    }
    setProofsLoading(false);
  }

  return (
    <section className={styles.panel} aria-labelledby="rh-historico-ponto-titulo">
      <h3 id="rh-historico-ponto-titulo" className={styles.panelTitle}>Consultar ponto por funcionário</h3>
      <div className={styles.field}>
        <label htmlFor={selectId}>Funcionário</label>
        <select
          id={selectId}
          disabled={entriesLoading}
          value={employeeId}
          onChange={event => setEmployeeId(event.target.value)}
        >
          <option value="">Selecione a pessoa</option>
          {employees.map(employee => (
            <option key={employee.id} value={employee.id}>
              {employee.display_name} · {employee.matricula}
            </option>
          ))}
        </select>
        <p className={styles.hint}>
          Exibe o espelho de jornadas registradas e permite inspecionar as marcações originais com coordenadas.
        </p>
      </div>

      {entriesLoading ? (
        <UiState
          variant="loading"
          title="Consultando o histórico de ponto…"
          detail="Buscando os registros autorizados da pessoa selecionada."
        />
      ) : null}

      {entriesError ? (
        <UiState
          variant={hrErrorVariant(entriesError)}
          title={entriesError.title}
          detail={`${entriesError.detail} ${hrErrorFootnote(entriesError)}`}
          retryLabel={entriesError.canRetry ? 'Tentar carregar novamente' : undefined}
          onRetry={entriesError.canRetry ? () => setReloadNonce(current => current + 1) : undefined}
        />
      ) : null}

      {!entriesLoading && !entriesError && entries?.length === 0 ? (
        <UiState
          variant="empty"
          title="Sem registros de ponto para este funcionário"
          detail="A consulta foi concluída com sucesso e não há jornadas registradas para a pessoa selecionada."
        />
      ) : null}

      {entries && entries.length > 0 ? (
        <div className={styles.cards}>
          {entries.map(entry => (
            <article key={entry.id} className={styles.card}>
              <dl className={styles.facts}>
                <div><dt>Data</dt><dd>{formatEntryDate(entry.entry_date)}</dd></div>
                <div><dt>Horários</dt><dd>{formatTimeRange(entry.clock_in, entry.clock_out)}</dd></div>
                <div><dt>Horas</dt><dd>{entry.hours_worked ?? '—'} h</dd></div>
                <div>
                  <dt>Situação</dt>
                  <dd>
                    <UiBadge tone={timeEntryStatusTone(entry.status)} srPrefix="Situação">
                      {timeEntryStatusLabel(entry.status)}
                    </UiBadge>
                  </dd>
                </div>
              </dl>
              <div className={styles.actions}>
                <button
                  type="button"
                  disabled={entriesLoading || proofsLoading}
                  onClick={() => void showProofs(entry)}
                >
                  Ver marcações e localização
                  <span className={styles.visuallyHidden}> da jornada de {formatEntryDate(entry.entry_date)}</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {proofsLoading ? (
        <UiState variant="loading" title="Consultando as marcações originais…" />
      ) : null}

      {proofsError ? (
        <UiState
          variant={hrErrorVariant(proofsError)}
          title={proofsError.title}
          detail={`${proofsError.detail} ${hrErrorFootnote(proofsError)}`}
          retryLabel={proofsError.canRetry && proofsEntryId ? 'Tentar carregar novamente' : undefined}
          onRetry={proofsError.canRetry && proofsEntryId ? () => {
            const target = entries?.find(item => item.id === proofsEntryId);
            if (target) void showProofs(target);
          } : undefined}
        />
      ) : null}

      {proofs ? (
        <div>
          <h4 className={localStyles.proofHeading}>
            Marcações originais da jornada selecionada {selectedEntryDate ? `(${selectedEntryDate})` : ''}
          </h4>
          <PunchProofList
            punches={proofs}
            emptyDetail="Registro manual ou importado sem marcações geográficas associadas."
          />
        </div>
      ) : null}
    </section>
  );
}

function Review({ item: c, refresh }: { item: Correction; refresh: (successNotice?: string) => Promise<void> }) {
  const [clockIn, setClockIn] = useState(String(c.requested_changes.clock_in || c.clock_in || '').slice(0, 5));
  const [clockOut, setClockOut] = useState(String(c.requested_changes.clock_out || c.clock_out || '').slice(0, 5));
  const [hours, setHours] = useState(c.requested_changes.hours_worked == null ? '' : String(c.requested_changes.hours_worked));
  const [reason, setReason] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [decisionError, setDecisionError] = useState<HrErrorDescriptor | null>(null);
  const [punches, setPunches] = useState<PunchProof[] | null>(null);
  const [punchesLoading, setPunchesLoading] = useState(false);
  const [punchesError, setPunchesError] = useState<HrErrorDescriptor | null>(null);
  const lock = useRef(false);

  const pending = ['solicitado', 'em_analise'].includes(c.status);
  const clockInId = `ajuste-entrada-${c.id}`;
  const clockOutId = `ajuste-saida-${c.id}`;
  const hoursId = `ajuste-horas-${c.id}`;
  const reviewedId = `ajuste-revisado-${c.id}`;
  const reasonId = `ajuste-motivo-${c.id}`;

  async function decide(status: 'em_analise' | 'aprovado' | 'rejeitado') {
    if (lock.current) return;
    setValidationError('');
    setDecisionError(null);

    if (status === 'aprovado') {
      const numericHours = Number(hours);
      if (!reviewed || hours === '' || !Number.isFinite(numericHours) || numericHours < 0 || numericHours > 24) {
        setValidationError('Confirme a revisão e informe as horas efetivamente trabalhadas entre 0 e 24.');
        document.getElementById(hours === '' || !Number.isFinite(numericHours) ? hoursId : reviewedId)?.focus();
        return;
      }
    }
    if (status === 'rejeitado' && reason.trim().length < 5) {
      setValidationError('Informe um motivo de rejeição com ao menos 5 caracteres para a pessoa titular.');
      document.getElementById(reasonId)?.focus();
      return;
    }

    lock.current = true;
    setBusy(true);
    try {
      const result = await hrRequest('/api/admin/hr/l03/time-corrections', {
        method: 'PATCH',
        body: JSON.stringify({
          id: c.id,
          status,
          rejection_reason: reason,
          approved_changes: status === 'aprovado'
            ? { clock_in: clockIn, clock_out: clockOut, hours_worked: Number(hours) }
            : undefined,
        }),
      });
      if (!result.ok) {
        setDecisionError(result.error);
        return;
      }
      const successNotice = status === 'em_analise'
        ? `Pedido de ajuste de ${c.employee_name} colocado em análise.`
        : status === 'aprovado'
          ? `Ajuste de ponto de ${c.employee_name} aprovado. As marcações originais permanecem preservadas.`
          : `Ajuste de ponto de ${c.employee_name} rejeitado com motivo registrado para o titular.`;
      await refresh(successNotice);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function loadPunches() {
    setPunchesLoading(true);
    setPunchesError(null);
    const result = await hrRequest<{ punches?: PunchProof[] }>(
      `/api/admin/hr/l03/time-punches?employee_id=${encodeURIComponent(c.employee_id)}&entry_id=${encodeURIComponent(c.time_entry_id)}`,
    );
    if (result.ok) {
      setPunches(result.data.punches || []);
    } else {
      setPunchesError(result.error);
    }
    setPunchesLoading(false);
  }

  return (
    <article className={styles.card} aria-labelledby={`ajuste-titulo-${c.id}`}>
      <h4 id={`ajuste-titulo-${c.id}`} className={styles.cardTitle}>
        {c.employee_name} · {c.matricula} · {formatEntryDate(c.entry_date)}
      </h4>

      <dl className={styles.facts}>
        <div>
          <dt>Situação do pedido</dt>
          <dd>
            <UiBadge tone={timeCorrectionStatusTone(c.status)} srPrefix="Situação">
              {timeCorrectionStatusLabel(c.status)}
            </UiBadge>
          </dd>
        </div>
        <div><dt>Registro atual</dt><dd>{formatTimeRange(c.clock_in, c.clock_out)} · {c.hours_worked ?? '—'} h</dd></div>
        <div><dt>Registro original</dt><dd>{formatSnapshotSummary(c.original_snapshot)}</dd></div>
        <div><dt>Alteração solicitada</dt><dd>{formatSnapshotSummary(c.requested_changes)}</dd></div>
        {c.approved_changes ? (
          <div><dt>Ajuste aprovado</dt><dd>{formatSnapshotSummary(c.approved_changes)}</dd></div>
        ) : null}
        <div><dt>Motivo informado</dt><dd>{c.reason}</dd></div>
        {c.rejection_reason ? (
          <div><dt>Motivo da rejeição</dt><dd>{c.rejection_reason}</dd></div>
        ) : null}
      </dl>

      <details className={localStyles.technicalDetails}>
        <summary>Original preservado e alteração solicitada (detalhes técnicos)</summary>
        <pre className={styles.codeBlock}>
          {JSON.stringify({ original: c.original_snapshot, solicitado: c.requested_changes, aprovado: c.approved_changes }, null, 2)}
        </pre>
      </details>

      <div className={styles.actions}>
        <button type="button" disabled={busy || punchesLoading} onClick={() => void loadPunches()}>
          {punchesLoading ? 'Consultando marcações…' : 'Consultar marcações e localização'}
        </button>
      </div>

      {punchesError ? (
        <UiState
          variant={hrErrorVariant(punchesError)}
          title={punchesError.title}
          detail={`${punchesError.detail} ${hrErrorFootnote(punchesError)}`}
          retryLabel={punchesError.canRetry ? 'Tentar carregar novamente' : undefined}
          onRetry={punchesError.canRetry ? () => { void loadPunches(); } : undefined}
        />
      ) : null}

      {punches ? (
        <PunchProofList
          punches={punches}
          emptyDetail="Registro manual ou importado sem marcações geográficas."
        />
      ) : null}

      {pending ? (
        <fieldset className={`${styles.fieldset} ${localStyles.decisionFieldset}`} disabled={busy}>
          <legend>Decisão do RH</legend>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label htmlFor={clockInId}>Entrada aprovada</label>
              <input
                id={clockInId}
                type="time"
                value={clockIn}
                onChange={event => setClockIn(event.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={clockOutId}>Saída aprovada</label>
              <input
                id={clockOutId}
                type="time"
                value={clockOut}
                onChange={event => setClockOut(event.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={hoursId}>Horas trabalhadas após ajuste</label>
              <input
                id={hoursId}
                type="number"
                min="0"
                max="24"
                step="0.01"
                value={hours}
                aria-describedby={`${hoursId}-dica`}
                onChange={event => setHours(event.target.value)}
              />
              <p className={styles.hint} id={`${hoursId}-dica`}>
                Informe de 0 a 24 h, já descontando os intervalos.
              </p>
            </div>
          </div>

          <div className={localStyles.checkRow}>
            <input
              id={reviewedId}
              className={localStyles.checkboxControl}
              type="checkbox"
              checked={reviewed}
              onChange={event => setReviewed(event.target.checked)}
            />
            <label htmlFor={reviewedId} className={localStyles.checkLabel}>
              Revisei o original, a solicitação e as horas trabalhadas.
            </label>
          </div>

          <div className={styles.actions}>
            {c.status === 'solicitado' ? (
              <button type="button" onClick={() => void decide('em_analise')}>
                Colocar em análise
              </button>
            ) : null}
            <button
              type="button"
              className={`${styles.primary} ${localStyles.primaryAction}`}
              disabled={!reviewed || hours === ''}
              aria-busy={busy}
              onClick={() => void decide('aprovado')}
            >
              Aprovar ajuste
            </button>
          </div>

          <div className={localStyles.rejectionBlock}>
            <div className={styles.field}>
              <label htmlFor={reasonId}>Motivo da rejeição</label>
              <textarea
                id={reasonId}
                rows={3}
                minLength={5}
                maxLength={1000}
                value={reason}
                placeholder="Informe o motivo (mínimo de 5 caracteres)"
                aria-describedby={`${reasonId}-dica`}
                onChange={event => setReason(event.target.value)}
              />
              <p className={styles.hint} id={`${reasonId}-dica`}>
                Obrigatório apenas para rejeitar; fica registrado e visível apenas ao funcionário titular.
              </p>
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                disabled={reason.trim().length < 5}
                aria-busy={busy}
                onClick={() => void decide('rejeitado')}
              >
                Rejeitar ajuste
              </button>
            </div>
          </div>
        </fieldset>
      ) : null}

      {validationError ? (
        <p className={`${styles.notice} ${styles.noticeError}`} role="alert">{validationError}</p>
      ) : null}

      {decisionError ? (
        <div className={`${styles.notice} ${styles.noticeError}`} role="alert">
          <strong>{decisionError.title}</strong>
          <p className={styles.hint}>{decisionError.detail}</p>
          <p className={styles.hint}>{hrErrorFootnote(decisionError)} Nada foi gravado por esta tentativa.</p>
        </div>
      ) : null}
    </article>
  );
}
