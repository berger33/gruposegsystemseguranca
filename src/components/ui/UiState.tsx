import type { ReactNode } from 'react';
import styles from './UiState.module.css';

export type UiStateVariant = 'loading' | 'empty' | 'error' | 'denied' | 'success';

type Props = {
  variant: UiStateVariant;
  title: string;
  detail?: string;
  /** Rótulo do botão de repetir. Só aparece quando `onRetry` também existe. */
  retryLabel?: string;
  onRetry?: () => void;
  children?: ReactNode;
  className?: string;
};

// UX-03B: estado honesto de leitura. Carregando não é vazio, falha não é zero
// e acesso negado explica a ausência sem revelar o dado protegido.
const TAGS: Record<UiStateVariant, string> = {
  loading: 'Carregando',
  empty: 'Nenhum registro',
  error: 'Falha na consulta',
  denied: 'Acesso negado',
  success: 'Concluído',
};

export default function UiState({ variant, title, detail, retryLabel, onRetry, children, className }: Props) {
  const live = variant === 'error' || variant === 'denied' ? 'assertive' : 'polite';
  const role = variant === 'error' || variant === 'denied' ? 'alert' : 'status';
  return (
    <div
      className={`${styles.state} ${styles[variant]} ${className ?? ''}`}
      data-ui-state={variant}
      role={role}
      aria-live={live}
    >
      <span className={styles.tag}>
        {variant === 'loading' ? <span className={styles.spinner} aria-hidden="true" /> : null}
        {TAGS[variant]}
      </span>
      <p className={styles.title}>{title}</p>
      {detail ? <p className={styles.detail}>{detail}</p> : null}
      {children}
      {onRetry ? (
        <div className={styles.actions}>
          <button type="button" onClick={onRetry}>{retryLabel ?? 'Tentar novamente'}</button>
        </div>
      ) : null}
    </div>
  );
}
