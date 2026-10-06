"use client";

import styles from "../../../components/ui/UiWorkspace.module.css";
import { financeErrorMessage } from "../../../lib/finance-vocabulary.mjs";
import { FormEvent, useEffect, useState } from "react";

type Snapshot = {
  id: string;
  competence_date: string;
  cashflow_type: "previsto" | "realizado";
  total_receivable_cents: string | number;
  total_payable_cents: string | number;
  balance_cents: string | number;
  vencidos_cents: string | number;
  proximos_pagamentos_cents: string | number;
  notes?: string | null;
};
type Receivable = {
  id: string;
  protocol: string;
  due_date: string;
  amount_cents: string | number;
  amount_remaining_cents: string | number;
  status: string;
};
type Aging = {
  id: string;
  receivable_id: string;
  protocol?: string;
  competence_date: string;
  due_date: string;
  bucket: string;
  days_overdue: number;
  amount_cents: string | number;
  amount_paid_cents: string | number;
  amount_remaining_cents: string | number;
};

const initialSnapshot = {
  competence_date: "",
  cashflow_type: "previsto",
  total_receivable_cents: "",
  total_payable_cents: "",
  vencidos_cents: "",
  proximos_pagamentos_cents: "",
  notes: "",
};
const initialAging = {
  receivable_id: "",
  competence_date: "",
  due_date: "",
  amount_cents: "",
  amount_paid_cents: "0",
};
const money = (value: string | number | undefined) => value == null ? "Dado ausente" : `R$ ${(Number(value) / 100).toFixed(2).replace(".", ",")}`;

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(financeErrorMessage(typeof data.error === "string" ? data.error : null, response.status));
  return data;
}

export default function CashflowWorkspace() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [aging, setAging] = useState<Aging[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [snapshotForm, setSnapshotForm] = useState(initialSnapshot);
  const [agingForm, setAgingForm] = useState(initialAging);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try { await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha inesperada"); }
    finally { setBusy(false); }
  };
  const load = async () => {
    const [cashflow, agingData, receivableData] = await Promise.all([
      request("/api/fin/cashflow-snapshots"),
      request("/api/fin/aging-receivables"),
      request("/api/fin/receivables"),
    ]);
    setSnapshots(cashflow.snapshots || []);
    setAging(agingData.aging || []);
    setReceivables(receivableData.receivables || []);
  };
  useEffect(() => { void run(load); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createSnapshot = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      await request("/api/fin/cashflow-snapshots", {
        method: "POST",
        body: JSON.stringify({
          ...snapshotForm,
          total_receivable_cents: Number(snapshotForm.total_receivable_cents || 0),
          total_payable_cents: Number(snapshotForm.total_payable_cents || 0),
          vencidos_cents: Number(snapshotForm.vencidos_cents || 0),
          proximos_pagamentos_cents: Number(snapshotForm.proximos_pagamentos_cents || 0),
        }),
      });
      setSnapshotForm(initialSnapshot);
      setNotice("Snapshot de fluxo de caixa criado");
      await load();
    });
  };

  const createAging = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      await request("/api/fin/aging-receivables", {
        method: "POST",
        body: JSON.stringify({
          ...agingForm,
          amount_cents: Number(agingForm.amount_cents),
          amount_paid_cents: Number(agingForm.amount_paid_cents || 0),
        }),
      });
      setAgingForm(initialAging);
      setNotice("Snapshot de aging sintético criado com bucket calculado no servidor");
      await load();
    });
  };

  const selectReceivable = (id: string) => {
    const selected = receivables.find(receivable => receivable.id === id);
    setAgingForm({
      ...agingForm,
      receivable_id: id,
      due_date: selected?.due_date?.slice(0, 10) || "",
      amount_cents: selected ? String(selected.amount_remaining_cents) : "",
    });
  };

  return (
    <section data-testid="fin07-cashflow" aria-labelledby="fin07-title" className={styles.stackWide}>
      <header>
        <h2 id="fin07-title">FIN-07 · Fluxo de caixa e aging de recebíveis</h2>
        <p>
          Registre snapshots sintéticos de fluxo previsto/realizado e aging por competência. Vencidos, próximos pagamentos,
          saldo e bucket são dados auditados; não há integração bancária nem baixa automática.
        </p>
      </header>
      {error && <p role="alert" data-testid="fin07-error">{error}</p>}
      {notice && <p role="status" data-testid="fin07-notice">{notice}</p>}

      <form data-testid="fin07-cashflow-form" onSubmit={createSnapshot} className={styles.stack}>
        <h3>Snapshot de fluxo de caixa</h3>
        <label>Competência <input required type="date" data-testid="fin07-cashflow-competence" value={snapshotForm.competence_date} onChange={event => setSnapshotForm({ ...snapshotForm, competence_date: event.target.value })} /></label>
        <label>Tipo <select data-testid="fin07-cashflow-type" value={snapshotForm.cashflow_type} onChange={event => setSnapshotForm({ ...snapshotForm, cashflow_type: event.target.value })}>
          <option value="previsto">Previsto</option><option value="realizado">Realizado</option>
        </select></label>
        <label>Total a receber (centavos) <input required type="number" min={0} data-testid="fin07-total-receivable" value={snapshotForm.total_receivable_cents} onChange={event => setSnapshotForm({ ...snapshotForm, total_receivable_cents: event.target.value })} /></label>
        <label>Total a pagar (centavos) <input required type="number" min={0} data-testid="fin07-total-payable" value={snapshotForm.total_payable_cents} onChange={event => setSnapshotForm({ ...snapshotForm, total_payable_cents: event.target.value })} /></label>
        <label>Vencidos (centavos) <input required type="number" min={0} data-testid="fin07-overdue" value={snapshotForm.vencidos_cents} onChange={event => setSnapshotForm({ ...snapshotForm, vencidos_cents: event.target.value })} /></label>
        <label>Próximos pagamentos (centavos) <input required type="number" min={0} data-testid="fin07-upcoming" value={snapshotForm.proximos_pagamentos_cents} onChange={event => setSnapshotForm({ ...snapshotForm, proximos_pagamentos_cents: event.target.value })} /></label>
        <label>Notas <input required minLength={10} maxLength={1000} data-testid="fin07-cashflow-notes" value={snapshotForm.notes} onChange={event => setSnapshotForm({ ...snapshotForm, notes: event.target.value })} /></label>
        <button type="submit" data-testid="fin07-create-cashflow" disabled={busy}>Criar snapshot sintético</button>
      </form>

      <div>
        <h3>Snapshots registrados</h3>
        <table data-testid="fin07-snapshots"><thead><tr><th>Competência</th><th>Tipo</th><th>Saldo</th><th>Vencidos</th><th>Próximos pagamentos</th></tr></thead><tbody>
          {snapshots.length === 0 ? <tr><td colSpan={5}>Nenhum snapshot registrado.</td></tr> : snapshots.map(snapshot => <tr key={snapshot.id}><td>{String(snapshot.competence_date).slice(0, 10)}</td><td>{snapshot.cashflow_type}</td><td>{money(snapshot.balance_cents)}</td><td>{money(snapshot.vencidos_cents)}</td><td>{money(snapshot.proximos_pagamentos_cents)}</td></tr>)}
        </tbody></table>
      </div>

      <form data-testid="fin07-aging-form" onSubmit={createAging} className={styles.stack}>
        <h3>Aging de recebíveis por competência</h3>
        <label>Recebível <select required data-testid="fin07-aging-receivable" value={agingForm.receivable_id} onChange={event => selectReceivable(event.target.value)}>
          <option value="">Selecione o recebível</option>{receivables.map(receivable => <option key={receivable.id} value={receivable.id}>{receivable.protocol} · {receivable.status} · {money(receivable.amount_remaining_cents)} restante</option>)}
        </select></label>
        <label>Competência do aging <input required type="date" data-testid="fin07-aging-competence" value={agingForm.competence_date} onChange={event => setAgingForm({ ...agingForm, competence_date: event.target.value })} /></label>
        <label>Vencimento canônico <input required type="date" data-testid="fin07-aging-due-date" value={agingForm.due_date} readOnly /></label>
        <label>Valor da fotografia (centavos) <input required type="number" min={0} data-testid="fin07-aging-amount" value={agingForm.amount_cents} onChange={event => setAgingForm({ ...agingForm, amount_cents: event.target.value })} /></label>
        <label>Valor já pago (centavos) <input required type="number" min={0} data-testid="fin07-aging-paid" value={agingForm.amount_paid_cents} onChange={event => setAgingForm({ ...agingForm, amount_paid_cents: event.target.value })} /></label>
        <button type="submit" data-testid="fin07-create-aging" disabled={busy}>Criar aging sintético</button>
      </form>

      <div>
        <h3>Aging registrado</h3>
        <table data-testid="fin07-aging"><thead><tr><th>Recebível</th><th>Competência</th><th>Bucket</th><th>Dias vencidos</th><th>Restante</th></tr></thead><tbody>
          {aging.length === 0 ? <tr><td colSpan={5}>Nenhum aging registrado.</td></tr> : aging.map(item => <tr key={item.id}><td>{item.protocol || item.receivable_id}</td><td>{String(item.competence_date).slice(0, 10)}</td><td>{item.bucket}</td><td>{item.days_overdue}</td><td>{money(item.amount_remaining_cents)}</td></tr>)}
        </tbody></table>
      </div>
    </section>
  );
}
