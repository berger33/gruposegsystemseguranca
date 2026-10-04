"use client";

// F03 · conta a receber → baixa → relatório sobre a rota canônica
// /api/admin/finance/l07/receivables. A tela não inventa estado: tudo que
// aparece veio do servidor, e cada ação carrega sua própria chave de
// idempotência. Não há integração bancária, boleto, e-mail ou conciliação
// automática nesta jornada — a baixa é o registro de um recebimento
// conferido por uma pessoa autorizada.

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Settlement = {
  amountCents: number | string;
  previousStatus: string;
  nextStatus: string;
  paymentMethod: string;
  reason: string;
  createdAt: string;
};

type Receivable = {
  id: string;
  protocol: string;
  client_account_id: string;
  account_name: string;
  contract_id: string | null;
  competence_date: string;
  due_date: string;
  amount_cents: string | number;
  amount_paid_cents: string | number;
  amount_remaining_cents: string | number;
  status: string;
  description: string | null;
  settlements: Settlement[];
};

type ReportAccount = {
  accountId: string;
  accountName: string;
  receivableCount: number;
  totalCents: number;
  settledCents: number;
  openCents: number;
  settlementCount: number;
};

type ReportTotals = {
  accountCount: number;
  receivableCount: number;
  settlementCount: number;
  totalReceivableCents: number;
  totalSettledCents: number;
  totalOpenCents: number;
};

type Emission = {
  protocol: string;
  created_at: string;
  payload_sha256: string;
  matchesCurrent: boolean;
  note: string | null;
};

type Report = {
  competence: string;
  accounts: ReportAccount[];
  totals: ReportTotals;
  payloadSha256: string;
  emissions: Emission[];
};

const money = (value: string | number | null | undefined) =>
  value == null ? "Dado ausente" : `R$ ${(Number(value) / 100).toFixed(2).replace(".", ",")}`;

const newKey = (prefix: string) => `${prefix}-${globalThis.crypto.randomUUID()}`;

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(data.error || `Erro ${response.status}`));
  return data;
}

const currentCompetence = () => new Date().toISOString().slice(0, 7);

export default function ReceivableJourneyWorkspace() {
  const [competence, setCompetence] = useState(currentCompetence());
  const [rows, setRows] = useState<Receivable[]>([]);
  const [listError, setListError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [reportError, setReportError] = useState("");
  const [reportNote, setReportNote] = useState("");
  const [openForm, setOpenForm] = useState({
    accountId: "",
    contractId: "",
    competenceDate: "",
    dueDate: "",
    amountCents: "",
    description: "",
  });
  const [settleForm, setSettleForm] = useState({ amountCents: "", reason: "", paymentMethod: "pix" });

  // Uma resposta atrasada de uma competência anterior não pode sobrescrever a
  // leitura atual: a tela mostraria uma lista vazia que não corresponde ao
  // banco. Cada leitura carrega sua ordem e só a mais recente pode pintar.
  const readOrder = useRef(0);

  const load = useCallback(async (month: string) => {
    const ticket = readOrder.current + 1;
    readOrder.current = ticket;
    try {
      const data = await api(`/api/admin/finance/l07/receivables?competence=${encodeURIComponent(month)}`);
      if (ticket !== readOrder.current) return;
      setRows(data.receivables || []);
      setListError("");
    } catch (error) {
      if (ticket !== readOrder.current) return;
      setRows([]);
      setListError(`Não foi possível ler as contas a receber: ${error instanceof Error ? error.message : "falha"}`);
    } finally {
      if (ticket === readOrder.current) setLoaded(true);
    }
  }, []);

  useEffect(() => { void load(competence); }, [load, competence]);

  const selected = rows.find(item => item.id === selectedId) || null;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setNotice("");
    setActionError("");
    try {
      await work();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "falha inesperada");
    } finally {
      setBusy(false);
    }
  };

  const openReceivable = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const data = await api("/api/admin/finance/l07/receivables", {
        method: "POST",
        headers: { "Idempotency-Key": newKey("f03fin-open") },
        body: JSON.stringify({
          accountId: openForm.accountId.trim(),
          contractId: openForm.contractId.trim() || null,
          competenceDate: openForm.competenceDate,
          dueDate: openForm.dueDate,
          amountCents: Number(openForm.amountCents),
          description: openForm.description,
        }),
      });
      setNotice(`Conta ${data.protocol} aberta em situação ${data.status}.`);
      setOpenForm({ accountId: "", contractId: "", competenceDate: "", dueDate: "", amountCents: "", description: "" });
      await load(competence);
    });
  };

  const settle = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    void run(async () => {
      const data = await api("/api/admin/finance/l07/receivables", {
        method: "PATCH",
        headers: { "Idempotency-Key": newKey("f03fin-settle") },
        body: JSON.stringify({
          id: selected.id,
          action: "baixar",
          amountCents: Number(settleForm.amountCents),
          reason: settleForm.reason,
          paymentMethod: settleForm.paymentMethod,
        }),
      });
      setNotice(
        data.status === "recebido"
          ? `Baixa registrada: conta ${selected.protocol} quitada, saldo em aberto ${money(0)}.`
          : `Baixa parcial registrada: restam ${money(data.remainingCents)} na conta ${selected.protocol}.`,
      );
      setSettleForm({ amountCents: "", reason: "", paymentMethod: "pix" });
      await load(competence);
    });
  };

  const computeReport = () => void run(async () => {
    try {
      const data = await api(`/api/admin/finance/l07/receivables/report?competence=${encodeURIComponent(competence)}`);
      setReport(data);
      setReportError("");
      setNotice(`Relatório de ${competence} recalculado a partir das contas e baixas canônicas.`);
    } catch (error) {
      setReport(null);
      setReportError(`Não foi possível calcular o relatório: ${error instanceof Error ? error.message : "falha"}`);
    }
  });

  const emitReport = () => void run(async () => {
    const data = await api("/api/admin/finance/l07/receivables/report", {
      method: "POST",
      headers: { "Idempotency-Key": newKey("f03fin-report") },
      body: JSON.stringify({ competence, note: reportNote.trim() || null }),
    });
    setNotice(`Relatório ${data.protocol} emitido para a competência ${competence}.`);
    setReportNote("");
    const refreshed = await api(`/api/admin/finance/l07/receivables/report?competence=${encodeURIComponent(competence)}`);
    setReport(refreshed);
    setReportError("");
  });

  return (
    <section data-testid="f03fin-workspace">
      <h2>Contas a receber, baixa e relatório</h2>
      <p>
        Fila restrita às contas em que a sua identidade tem concessão ativa (finance.receivables.*). A baixa é
        registrada com motivo, trilha e auditoria na mesma transação; não há cobrança bancária, boleto nem envio de
        e-mail nesta tela.
      </p>

      <label>
        Competência (AAAA-MM){" "}
        <input
          data-testid="f03fin-competence"
          type="month"
          value={competence}
          onChange={event => { setCompetence(event.target.value || currentCompetence()); setReport(null); setSelectedId(""); }}
        />
      </label>

      {listError && (
        <div>
          <p role="alert" data-testid="f03fin-read-error">{listError}</p>
          <button type="button" data-testid="f03fin-retry" onClick={() => void load(competence)}>Tentar novamente</button>
        </div>
      )}
      {notice && <p role="status" data-testid="f03fin-notice">{notice}</p>}
      {actionError && <p role="alert" data-testid="f03fin-action-error">{actionError}</p>}
      {busy && <p data-testid="f03fin-busy">Processando…</p>}

      <h3>Abrir conta a receber</h3>
      <form data-testid="f03fin-open-form" onSubmit={openReceivable}>
        <label>
          Conta do cliente{" "}
          <input data-testid="f03fin-account" required value={openForm.accountId}
            onChange={event => setOpenForm({ ...openForm, accountId: event.target.value })} />
        </label>
        <label>
          Contrato (opcional){" "}
          <input data-testid="f03fin-contract" value={openForm.contractId}
            onChange={event => setOpenForm({ ...openForm, contractId: event.target.value })} />
        </label>
        <label>
          Competência{" "}
          <input data-testid="f03fin-competence-date" required type="date" value={openForm.competenceDate}
            onChange={event => setOpenForm({ ...openForm, competenceDate: event.target.value })} />
        </label>
        <label>
          Vencimento{" "}
          <input data-testid="f03fin-due-date" required type="date" value={openForm.dueDate}
            onChange={event => setOpenForm({ ...openForm, dueDate: event.target.value })} />
        </label>
        <label>
          Valor em centavos{" "}
          <input data-testid="f03fin-amount" required type="number" min={1} value={openForm.amountCents}
            onChange={event => setOpenForm({ ...openForm, amountCents: event.target.value })} />
        </label>
        <label>
          Descrição (10 a 1000 caracteres){" "}
          <input data-testid="f03fin-description" required minLength={10} maxLength={1000} value={openForm.description}
            onChange={event => setOpenForm({ ...openForm, description: event.target.value })} />
        </label>
        <button data-testid="f03fin-open-submit" disabled={busy}>Abrir conta a receber</button>
      </form>

      <h3>Contas da competência</h3>
      {!listError && loaded && rows.length === 0 && (
        <p data-testid="f03fin-empty">Nenhuma conta a receber autorizada nesta competência.</p>
      )}
      <ul data-testid="f03fin-list">
        {rows.map(item => (
          <li key={item.id} data-testid={`f03fin-item-${item.id}`}>
            <button type="button" data-testid={`f03fin-select-${item.id}`} onClick={() => setSelectedId(item.id)}>
              Selecionar {item.protocol}
            </button>{" "}
            {item.account_name} · vence {item.due_date?.slice(0, 10)} · {money(item.amount_cents)} ·
            {" "}baixado {money(item.amount_paid_cents)} · em aberto {money(item.amount_remaining_cents)} ·
            {" "}situação <strong>{item.status}</strong>
            <ul>
              {(item.settlements || []).map((settlement, index) => (
                <li key={`${item.id}-${index}`}>
                  Baixa de {money(settlement.amountCents)} ({settlement.previousStatus} → {settlement.nextStatus}) ·
                  {" "}{settlement.paymentMethod} · {settlement.reason}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {selected && (
        <div data-testid="f03fin-detail">
          <h3>Baixa da conta {selected.protocol}</h3>
          <p>
            Em aberto: <strong data-testid="f03fin-remaining">{money(selected.amount_remaining_cents)}</strong> de{" "}
            {money(selected.amount_cents)} · situação {selected.status}
          </p>
          <form data-testid="f03fin-settle-form" onSubmit={settle}>
            <label>
              Valor da baixa em centavos{" "}
              <input data-testid="f03fin-settle-amount" required type="number" min={1} value={settleForm.amountCents}
                onChange={event => setSettleForm({ ...settleForm, amountCents: event.target.value })} />
            </label>
            <label>
              Meio do recebimento{" "}
              <select data-testid="f03fin-settle-method" value={settleForm.paymentMethod}
                onChange={event => setSettleForm({ ...settleForm, paymentMethod: event.target.value })}>
                {["pix", "boleto", "transferencia", "dinheiro", "cartao", "outro"].map(method => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
            </label>
            <label>
              Motivo da baixa (10 a 1000 caracteres){" "}
              <input data-testid="f03fin-settle-reason" required minLength={10} maxLength={1000} value={settleForm.reason}
                onChange={event => setSettleForm({ ...settleForm, reason: event.target.value })} />
            </label>
            <button data-testid="f03fin-settle-submit" disabled={busy || !["pendente", "parcial", "vencido"].includes(selected.status)}>
              Registrar baixa
            </button>
          </form>
          {!["pendente", "parcial", "vencido"].includes(selected.status) && (
            <p data-testid="f03fin-settle-blocked">Esta conta não aceita mais baixa: situação {selected.status}.</p>
          )}
        </div>
      )}

      <h3>Relatório da competência</h3>
      <button type="button" data-testid="f03fin-report-compute" disabled={busy} onClick={computeReport}>
        Calcular relatório
      </button>
      <label>
        Observação da emissão (opcional, 10 a 1000 caracteres){" "}
        <input data-testid="f03fin-report-note" maxLength={1000} value={reportNote}
          onChange={event => setReportNote(event.target.value)} />
      </label>
      <button type="button" data-testid="f03fin-report-emit" disabled={busy} onClick={emitReport}>
        Emitir relatório
      </button>
      {reportError && <p role="alert" data-testid="f03fin-report-error">{reportError}</p>}
      {report && (
        <div data-testid="f03fin-report">
          <p data-testid="f03fin-report-totals">
            {report.totals.receivableCount} conta(s) · total {money(report.totals.totalReceivableCents)} · baixado{" "}
            {money(report.totals.totalSettledCents)} · em aberto {money(report.totals.totalOpenCents)} ·{" "}
            {report.totals.settlementCount} baixa(s)
          </p>
          <ul data-testid="f03fin-report-accounts">
            {report.accounts.map(account => (
              <li key={account.accountId}>
                {account.accountName}: {account.receivableCount} conta(s), total {money(account.totalCents)}, baixado{" "}
                {money(account.settledCents)}, em aberto {money(account.openCents)}
              </li>
            ))}
          </ul>
          {report.accounts.length === 0 && (
            <p data-testid="f03fin-report-empty">Nenhuma conta autorizada nesta competência; o relatório sai zerado.</p>
          )}
          <ul data-testid="f03fin-report-emissions">
            {report.emissions.map(emission => (
              <li key={emission.protocol}>
                {emission.protocol} · emitido em {emission.created_at?.slice(0, 10)} ·{" "}
                {emission.matchesCurrent ? "ainda confere com o banco" : "desatualizado: o banco mudou desde a emissão"}
              </li>
            ))}
          </ul>
          {report.emissions.length === 0 && (
            <p data-testid="f03fin-emissions-empty">Nenhum relatório emitido por você nesta competência.</p>
          )}
        </div>
      )}
    </section>
  );
}
