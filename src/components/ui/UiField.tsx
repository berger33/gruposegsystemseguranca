import type { InputHTMLAttributes } from 'react';
import styles from './UiField.module.css';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
};

export default function UiField({ id, label, hint, error, className, ...inputProps }: Props) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [inputProps['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`${styles.field} ${className ?? ''}`} data-ui-field="true">
      <label htmlFor={id}>{label}</label>
      {hint ? <p id={hintId} className={styles.hint}>{hint}</p> : null}
      <input {...inputProps} id={id} aria-describedby={describedBy} aria-invalid={error ? true : inputProps['aria-invalid']} className={styles.input} />
      {error ? <p id={errorId} className={styles.error}>{error}</p> : null}
    </div>
  );
}
