'use client';

import { useState, type ReactNode } from 'react';
import UiState from '@/components/ui/UiState';
import styles from './HealthcheckClient.module.css';

type Check = {
  id?: string; name?: string; check_name?: string; dependency?: string; dependency_type?: string;
  status?: string; latency_ms?: number | null; is_degraded?: boolean; degradation_reason?: string | null;
  error_sanitized?: string | null; metadata?: Record<string, unknown> | null; checked_at?: string;
};
type StatusSnapshot = {
  id?: string; overall_status?: string; is_degraded?: boolean; degraded_dependencies?: string[] | null;
  checks?: Check[]; created_at?: string;
};
type HealthPayload = {
  status?: string; check?: string; overall_status?: string; is_degraded?: boolean; ready?: boolean;
  degraded_dependencies?: string[]; checks?: Check[]; uptime_seconds?: number; timestamp?: string; note?: string;
  error?: string;
};
type HistoryPayload = { checks?: Check[]; status_history?: StatusSnapshot[] };
type UiFeedback = { variant: 'error' | 'denied'; title: string; detail: string };

const modes = [
  ['health', 'Verificação completa'], ['live', 'Resposta do processo'],
  ['ready', 'Prontidão do serviço'], ['operational', 'Painel operacional restrito'],
] as const;
const modeDescriptions: Record<string, string> = {
  health: 'Consulta dependências monitoradas e o estado geral.',
  live: 'Confirma apenas se o processo do servidor responde; não testa dependências.',
  ready: 'Verifica se o banco crítico está disponível para receber tráfego.',
  operational: 'Consulta restrita a perfis TI e Administração; a consulta é registrada na auditoria.',
};
const statusLabels: Record<string, string> = {
  healthy: 'Saudável', degraded: 'Degradado', unhealthy: 'Indisponível', unknown: 'Não verificado',
};
const checkLabels: Record<string, string> = {
  database: 'Banco de dados', queue: 'Fila de notificações', integrations: 'Integrações', observability: 'Observabilidade',
};
const dependencyLabels: Record<string, string> = { database: 'Banco de dados', other: 'Outro serviço' };
const errorLabels: Record<string, string> = {
  same_origin_required: 'A origem desta solicitação não foi aceita. Recarregue a página e tente novamente.',
  admin_session_required: 'Sua sessão administrativa expirou. Entre novamente para acessar o painel.',
  operational_panel_restricted_admin_ti: 'Esta consulta está disponível apenas para TI e Administração.',
  operational_panel_restricted: 'Seu perfil não tem acesso ao histórico operacional.',
  operational_history_unavailable: 'O histórico operacional não pôde ser consultado agora.',
};

function asError(value: unknown, fallback: string): string {
  if (typeof value === 'string') return errorLabels[value] || fallback;
  return fallback;
}

function readableDate(value?: string | null): string {
  if (!value) return 'Não informado';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Data indisponível' : date.toLocaleString('pt-BR');
}

function statusLabel(value?: string): string { return statusLabels[value || ''] || 'Não informado'; }

function healthClass(value?: string): string {
  if (value === 'healthy') return styles.healthy;
  if (value === 'degraded') return styles.degraded;
  if (value === 'unhealthy') return styles.unhealthy;
  return styles.unknown;
}

function technicalDetails(title: string, value: unknown): ReactNode {
  if (value == null || value === '') return null;
  const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return <details className={styles.technical}><summary>{title}</summary><pre>{content}</pre></details>;
}

function CheckCard({ check, historic = false }: { check: Check; historic?: boolean }) {
  const name = check.name || check.check_name || 'Verificação';
  const status = check.status || 'unknown';
  const metadata = check.metadata || null;
  return (
    <article className={styles.checkCard}>
      <div className={styles.checkHeader}>
        <div><h4>{checkLabels[name] || name}</h4><p>{dependencyLabels[check.dependency || check.dependency_type || ''] || 'Dependência monitorada'}</p></div>
        <span className={`${styles.badge} ${healthClass(status)}`}>{statusLabel(status)}</span>
      </div>
      <dl className={styles.metrics}>
        {typeof check.latency_ms === 'number' && <div><dt>Tempo de resposta</dt><dd>{check.latency_ms} ms</dd></div>}
        {typeof metadata?.queued === 'number' && <div><dt>Itens aguardando</dt><dd>{metadata.queued}</dd></div>}
        {typeof metadata?.total === 'number' && <div><dt>Integrações avaliadas</dt><dd>{metadata.total}</dd></div>}
        {typeof metadata?.failures === 'number' && <div><dt>Falhas de integração</dt><dd>{metadata.failures}</dd></div>}
        {typeof metadata?.http_5xx === 'number' && <div><dt>Respostas HTTP 5xx recentes</dt><dd>{metadata.http_5xx}</dd></div>}
        {typeof metadata?.jobs_failed === 'number' && <div><dt>Processos com falha</dt><dd>{metadata.jobs_failed}</dd></div>}
        {check.degradation_reason && <div className={styles.wide}><dt>Motivo informado</dt><dd>{check.degradation_reason}</dd></div>}
      </dl>
      {historic && <p className={styles.recordDate}>Verificado em {readableDate(check.checked_at)}</p>}
      {(check.error_sanitized || metadata) && <div className={styles.diagnostics}>
        {check.error_sanitized && technicalDetails('Detalhe técnico sanitizado', check.error_sanitized)}
        {metadata && technicalDetails('Metadados técnicos', metadata)}
      </div>}
    </article>
  );
}

export default function HealthcheckClient() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [mode, setMode] = useState<string>('health');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<UiFeedback | null>(null);
  const [historyError, setHistoryError] = useState<UiFeedback | null>(null);
  const [success, setSuccess] = useState('');
  const [historySuccess, setHistorySuccess] = useState('');

  async function load() {
    setLoading(true); setError(null); setSuccess(''); setData(null);
    const urls: Record<string, string> = {
      health: '/api/health', live: '/api/health/live', ready: '/api/health/ready', operational: '/api/admin/operational',
    };
    try {
      const response = await fetch(urls[mode], { cache: 'no-store' });
      const result = await response.json() as HealthPayload;
      // Readiness deliberately returns 503 with a useful health payload when a critical dependency is not ready.
      if (!response.ok && !(mode === 'ready' && response.status === 503)) {
        const denied = response.status === 401 || response.status === 403;
        throw { denied, code: result.error };
      }
      setData(result);
      setSuccess(mode === 'live' ? 'Resposta do processo consultada.' : 'Estado do serviço consultado.');
    } catch (failure) {
      const denied = typeof failure === 'object' && failure !== null && 'denied' in failure && failure.denied === true;
      const code = typeof failure === 'object' && failure !== null && 'code' in failure ? failure.code : undefined;
      setError({
        variant: denied ? 'denied' : 'error',
        title: denied ? 'Acesso necessário' : 'Consulta não concluída',
        detail: asError(code, 'Não foi possível consultar o estado agora. Verifique a conexão e tente novamente.'),
      });
    } finally { setLoading(false); }
  }

  async function loadHistory() {
    setHistoryLoading(true); setHistoryError(null); setHistorySuccess(''); setHistory(null);
    try {
      const response = await fetch('/api/admin/operational/history?limit=50', { cache: 'no-store' });
      const result = await response.json() as HistoryPayload & { error?: string };
      if (!response.ok) {
        const denied = response.status === 401 || response.status === 403;
        throw { denied, code: result.error };
      }
      setHistory(result);
      setHistorySuccess('Histórico consultado.');
    } catch (failure) {
      const denied = typeof failure === 'object' && failure !== null && 'denied' in failure && failure.denied === true;
      const code = typeof failure === 'object' && failure !== null && 'code' in failure ? failure.code : undefined;
      setHistoryError({
        variant: denied ? 'denied' : 'error',
        title: denied ? 'Acesso necessário' : 'Histórico indisponível',
        detail: asError(code, 'Não foi possível consultar o histórico agora. Tente novamente.'),
      });
    } finally { setHistoryLoading(false); }
  }

  const overall = data?.overall_status || data?.status;
  const isLive = data?.check === 'liveness';

  return (
    <section className={styles.workspace} aria-labelledby="health-title">
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>Saúde e operação</p><h2 id="health-title">Saúde do sistema</h2>
          <p>Consulte a resposta do processo, a disponibilidade de dependências e o histórico operacional permitido ao seu perfil.</p></div>
      </header>

      <section className={styles.panel} aria-labelledby="check-title">
        <div className={styles.sectionHeading}><div><h3 id="check-title">Consultar estado atual</h3><p>Escolha o escopo da verificação. A consulta completa não substitui monitoramento contínuo.</p></div></div>
        <div className={styles.controls}>
          <label className={styles.field}>Tipo de consulta
            <select value={mode} onChange={(event) => { setMode(event.target.value); setData(null); setError(null); setSuccess(''); }} disabled={loading}>
              {modes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <span className={styles.hint}>{modeDescriptions[mode]}</span>
          </label>
          <button type="button" onClick={() => void load()} disabled={loading} className={styles.primary}>{loading ? 'Consultando…' : data ? 'Atualizar consulta' : 'Consultar agora'}</button>
        </div>
        {error && <UiState variant={error.variant} title={error.title} detail={error.detail} onRetry={() => void load()} retryLabel="Tentar novamente" />}
        {success && !loading && <UiState variant="success" title={success} detail="O resultado abaixo reflete esta consulta, não uma garantia de disponibilidade futura." />}
        {loading && <UiState variant="loading" title="Consultando o serviço" detail="A resposta será exibida quando a verificação terminar." />}
        {!loading && !error && !data && <UiState variant="empty" title="Nenhuma consulta realizada" detail="Selecione o escopo e consulte para ver o estado atual." />}
        {data && !error && <div className={styles.results}>
          <div className={styles.summary}>
            <div className={styles.summaryPrimary}>
              <span className={styles.summaryLabel}>{isLive ? 'Resposta do processo' : data.ready === false ? 'Prontidão do serviço' : 'Estado geral'}</span>
              <strong className={healthClass(data.ready === false ? 'unhealthy' : overall)}>
                {isLive ? 'Processo respondendo' : data.ready === false ? 'Não pronto' : statusLabel(overall)}
              </strong>
              {data.is_degraded && <span className={styles.degradedNote}>Há dependências degradadas</span>}
            </div>
            <dl className={styles.summaryMetrics}>
              {typeof data.uptime_seconds === 'number' && <div><dt>Tempo ativo do processo</dt><dd>{data.uptime_seconds.toLocaleString('pt-BR')} s</dd></div>}
              {data.timestamp && <div><dt>Consultado em</dt><dd>{readableDate(data.timestamp)}</dd></div>}
              {typeof data.ready === 'boolean' && <div><dt>Prontidão</dt><dd>{data.ready ? 'Pronto' : 'Não pronto'}</dd></div>}
            </dl>
          </div>
          {data.note && <p className={styles.note}>{data.note}</p>}
          {data.degraded_dependencies?.length ? <p className={styles.degradedList}><strong>Dependências com degradação:</strong> {data.degraded_dependencies.map((item) => checkLabels[item] || item).join(', ')}</p> : null}
          {data.checks && data.checks.length > 0 && <div className={styles.checkGrid}>{data.checks.map((check, index) => <CheckCard key={`${check.name || check.check_name}-${index}`} check={check} />)}</div>}
          {data.checks && data.checks.length === 0 && <UiState variant="empty" title="Nenhuma dependência retornada" detail="A resposta não incluiu verificações de dependência para este escopo." />}
          {technicalDetails('Resposta técnica completa (JSON)', data)}
        </div>}
      </section>

      <section className={styles.panel} aria-labelledby="history-title">
        <div className={styles.sectionHeading}>
          <div><h3 id="history-title">Histórico operacional</h3><p>Até 50 verificações e registros de estado. Esta consulta exige sessão de TI ou Administração.</p></div>
          <button type="button" onClick={() => void loadHistory()} disabled={historyLoading}>{historyLoading ? 'Consultando…' : history ? 'Atualizar histórico' : 'Consultar histórico'}</button>
        </div>
        {historyError && <UiState variant={historyError.variant} title={historyError.title} detail={historyError.detail} onRetry={() => void loadHistory()} retryLabel="Tentar novamente" />}
        {historySuccess && !historyLoading && <UiState variant="success" title={historySuccess} detail="Os registros correspondem ao limite retornado pelo serviço." />}
        {historyLoading && <UiState variant="loading" title="Consultando histórico" detail="Buscando os registros operacionais recentes." />}
        {!historyLoading && !historyError && !history && <UiState variant="empty" title="Histórico ainda não consultado" detail="Consulte para verificar se existem registros operacionais recentes." />}
        {history && !historyError && <div className={styles.historyGrid}>
          <section aria-labelledby="history-checks-title" className={styles.historySection}>
            <div className={styles.sectionHeading}><div><h4 id="history-checks-title">Verificações registradas</h4><p>{history.checks?.length || 0} registros retornados</p></div></div>
            {history.checks?.length ? <div className={styles.checkGrid}>{history.checks.map((check, index) => <CheckCard key={`${check.id || check.check_name}-${index}`} check={check} historic />)}</div> : <UiState variant="empty" title="Nenhuma verificação no histórico" detail="O serviço não retornou registros de verificação para o período consultado." />}
          </section>
          <section aria-labelledby="history-status-title" className={styles.historySection}>
            <div className={styles.sectionHeading}><div><h4 id="history-status-title">Mudanças de estado</h4><p>{history.status_history?.length || 0} registros retornados</p></div></div>
            {history.status_history?.length ? <ol className={styles.statusList}>{history.status_history.map((snapshot, index) => (
              <li key={`${snapshot.id || snapshot.created_at}-${index}`} className={styles.statusRecord}>
                <div className={styles.checkHeader}><div><strong>{statusLabel(snapshot.overall_status)}</strong><p>{readableDate(snapshot.created_at)}</p></div><span className={`${styles.badge} ${healthClass(snapshot.overall_status)}`}>{snapshot.is_degraded ? 'Degradação registrada' : 'Sem degradação registrada'}</span></div>
                {snapshot.degraded_dependencies?.length ? <p className={styles.degradedList}><strong>Dependências:</strong> {snapshot.degraded_dependencies.map((item) => checkLabels[item] || item).join(', ')}</p> : null}
                {snapshot.checks && technicalDetails('Verificações deste registro', snapshot.checks)}
              </li>
            ))}</ol> : <UiState variant="empty" title="Nenhuma mudança de estado no histórico" detail="O serviço não retornou registros de estado para o período consultado." />}
          </section>
        </div>}
      </section>
    </section>
  );
}
