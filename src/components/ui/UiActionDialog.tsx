"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import styles from "./UiActionDialog.module.css";

export type UiActionField = {
  name: string;
  label: string;
  required?: boolean;
  multiline?: boolean;
  maxLength?: number;
  help?: string;
};

export type UiActionDialogRequest = {
  key: string;
  title: string;
  description: string;
  submitLabel: string;
  fields: UiActionField[];
  onSubmit: (values: Record<string, string>) => Promise<void>;
};

type Props = {
  request: UiActionDialogRequest | null;
  onCancel: () => void;
};

export default function UiActionDialog({ request, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!request) {
      if (dialog.open) dialog.close();
      return;
    }

    setValues(Object.fromEntries(request.fields.map(field => [field.name, ""])));
    setError("");
    setBusy(false);
    if (!dialog.open) dialog.showModal();
    const frame = requestAnimationFrame(() => {
      dialog.querySelector<HTMLElement>("input, textarea")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [request?.key]);

  function cancel() {
    if (!busy) onCancel();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!request || busy) return;

    const normalized = Object.fromEntries(
      Object.entries(values).map(([name, value]) => [name, value.trim()]),
    );
    const missing = request.fields.find(field => field.required && !normalized[field.name]);
    if (missing) {
      setError(`Preencha o campo “${missing.label}”.`);
      return;
    }

    setBusy(true);
    setError("");
    try {
      await request.onSubmit(normalized);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a ação.");
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
      onCancel={event => {
        event.preventDefault();
        cancel();
      }}
    >
      {request ? (
        <form className={styles.form} onSubmit={submit} aria-busy={busy} noValidate>
          <div>
            <h2 id={titleId}>{request.title}</h2>
            <p id={descriptionId} className={styles.description}>{request.description}</p>
          </div>

          {request.fields.map(field => {
            const fieldId = `${titleId}-${field.name}`;
            const helpId = field.help ? `${fieldId}-help` : undefined;
            const shared = {
              id: fieldId,
              name: field.name,
              value: values[field.name] ?? "",
              required: field.required,
              maxLength: field.maxLength,
              disabled: busy,
              "aria-describedby": helpId,
              onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                setValues(current => ({ ...current, [field.name]: event.target.value })),
            };
            return (
              <label className={styles.field} key={field.name} htmlFor={fieldId}>
                <span>{field.label}{field.required ? " *" : ""}</span>
                {field.multiline ? <textarea {...shared} rows={4} /> : <input {...shared} type="text" />}
                {field.help ? <small id={helpId}>{field.help}</small> : null}
              </label>
            );
          })}

          {error ? <p id={errorId} className={styles.error} role="alert">{error}</p> : null}

          <div className={styles.actions}>
            <button type="button" onClick={cancel} disabled={busy}>Cancelar</button>
            <button className={styles.primary} type="submit" disabled={busy}>
              {busy ? "Salvando…" : request.submitLabel}
            </button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}
