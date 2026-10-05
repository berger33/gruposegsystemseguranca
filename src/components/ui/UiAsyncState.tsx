'use client';

// UX-03B — um único lugar para dizer a verdade sobre uma leitura:
// carregando ≠ vazio, falha ≠ zero, 403 explica a negação sem mostrar dado.
// O componente não decide acesso; apenas descreve o que o servidor respondeu.

import type { ReactNode } from 'react';
import type { UxFailure } from '../../lib/ux-feedback.mjs';
import styles from './UiAsyncState.module.css';

export type UiAsyncStatus = 'idle' | 'loading' | 'ready' | 'failed';

type Props = {
  status: UiAsyncStatus;
  failure?: UxFailure | null;
  /** Rótulo do conjunto sendo lido, usado nas mensagens. Ex.: "oportunidades". */
  label: string;
  /** Verdadeiro quando a leitura terminou com zero registros de verdade. */
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  onRetry?: () => void;
  children?: ReactNode;
};

export default function UiAsyncState({
  status,
  failure,
  label,
  isEmpty = false,
  emptyTitle,
  emptyMessage,
  onRetry,
  children,
}: Props) {
  if (status === 'loading' || status === 'idle') {
    return (
      <div className={`${styles.state} ${styles.loading}`} role="status" aria-live="polite" data-ui-async="loading">
        <span className={styles.spinner} aria-hidden="true" />
        <span>Carregando {label}… Ainda não sabemos quantos registros existem.</span>
      </div>
    );
  }

  if (status === 'failed' && failure) {
    const denied = failure.kind === 'forbidden' || failure.kind === 'unauthorized';
    return (
      <div
        className={`${styles.state} ${denied ? styles.denied : styles.failed}`}
        role="alert"
        data-ui-async={denied ? 'denied' : 'failed'}
        data-ui-async-kind={failure.kind}
      >
        <h3>{failure.title}</h3>
        <p>{failure.message}</p>
        <p className={styles.detail}>
          Nada de {label} foi exibido nesta área. Resposta do servidor:{' '}
          {failure.status ? `HTTP ${failure.status}` : 'sem resposta'}
          {failure.code ? ` (${failure.code})` : ''}.
        </p>
        {failure.canRetry && onRetry ? (
          <div className={styles.actions}>
            <button type="button" className={styles.retry} onClick={onRetry}>
              Tentar carregar novamente
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className={styles.state} data-ui-async="empty">
        <h3>{emptyTitle || `Nenhum registro de ${label}`}</h3>
        <p>{emptyMessage || 'A consulta foi respondida pelo servidor e não encontrou registros para estes filtros.'}</p>
        {onRetry ? (
          <div className={styles.actions}>
            <button type="button" className={styles.retry} onClick={onRetry}>
              Atualizar
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return <>{children}</>;
}
