'use client';

// UX-03B — rótulo de estado. O significado vem sempre do texto; a cor é apoio.
// `srPrefix` nomeia o que o estado descreve para quem usa leitor de tela.

import styles from './UiBadge.module.css';

export type UiBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export default function UiBadge({
  children,
  tone = 'neutral',
  srPrefix,
}: {
  children: React.ReactNode;
  tone?: UiBadgeTone;
  srPrefix?: string;
}) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`} data-ui-badge={tone}>
      {srPrefix ? <span className={styles.srOnly}>{srPrefix}: </span> : null}
      {children}
    </span>
  );
}
