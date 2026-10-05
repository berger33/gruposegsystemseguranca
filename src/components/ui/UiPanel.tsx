'use client';

// UX-03B — seção com título inequívoco, descrição curta e uma área de ações.
// Serve às telas administrativas para substituir estilos inline divergentes
// sem alterar nenhuma chamada de API.

import type { ReactNode } from 'react';
import styles from './UiPanel.module.css';

type Props = {
  id?: string;
  title: string;
  /** Texto curto acima do título, para situar a tarefa. */
  eyebrow?: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** `h2` por padrão; use `h3` dentro de uma seção já titulada. */
  level?: 2 | 3;
  quiet?: boolean;
  className?: string;
  headingId?: string;
  children: ReactNode;
};

export default function UiPanel({
  id,
  title,
  eyebrow,
  description,
  actions,
  level = 2,
  quiet = false,
  className,
  headingId,
  children,
}: Props) {
  const Heading = level === 3 ? 'h3' : 'h2';
  const resolvedHeadingId = headingId || (id ? `${id}-titulo` : undefined);
  return (
    <section
      id={id}
      className={`${styles.panel} ${quiet ? styles.quiet : ''} ${className ?? ''}`}
      aria-labelledby={resolvedHeadingId}
      data-ui-panel="true"
    >
      <div className={styles.header}>
        <div className={styles.heading}>
          {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
          <Heading id={resolvedHeadingId}>{title}</Heading>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      <div className={styles.body}>{children}</div>
    </section>
  );
}
