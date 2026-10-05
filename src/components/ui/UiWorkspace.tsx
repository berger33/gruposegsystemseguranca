'use client';

// UX-03B — moldura das áreas administrativas: título único, introdução honesta
// e atalhos para as tarefas reais da tela. Não substitui o AdminGate nem muda
// autorização: é apenas a superfície onde os painéis são montados.

import type { ReactNode } from 'react';
import styles from './UiWorkspace.module.css';

export type UiWorkspaceTask = { href: string; label: string };

export default function UiWorkspace({
  title,
  intro,
  tasks,
  tasksLabel = 'Tarefas desta área',
  children,
}: {
  title: string;
  intro?: ReactNode;
  tasks?: readonly UiWorkspaceTask[];
  tasksLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.workspace} data-ui-workspace="true">
      <h1>{title}</h1>
      {intro ? <p className={styles.intro}>{intro}</p> : null}
      {tasks && tasks.length ? (
        <nav className={styles.taskNav} aria-label={tasksLabel}>
          {tasks.map((task) => (
            <a key={task.href} href={task.href}>
              {task.label}
            </a>
          ))}
        </nav>
      ) : null}
      {children}
    </div>
  );
}
