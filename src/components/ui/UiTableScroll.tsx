import type {ReactNode} from 'react';
import styles from './UiTaskWorkspace.module.css';
export default function UiTableScroll({children}:{children:ReactNode}){return <div className={styles.tableScroll} role="region" aria-label="Tabela com rolagem horizontal" tabIndex={0}>{children}</div>;}
