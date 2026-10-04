"use client";

// F03 — conta → baixa → relatório sobre a rota canônica
// /api/admin/finance/l07/settlements. A tela não promete nada que o servidor
// não faça: sem integração bancária, sem envio de e-mail, sem exportação
// assinada. Falha de leitura vira erro visível (não lista vazia), recusa de
// escopo vira texto explícito e cada tentativa de escrita leva a sua própria
// chave de idempotência.

import { FormEvent, useCallback, useEffect, useState } from "react";

type Account = {
  kind: "receber" | "pagar";
  id: string;
  protocol: string;
  client_account_id: string | null;
  account_name: string | null;
  competence_date: string;
  due_date: string;
  amount_cents: string | number;
  amount_paid_cents: string | number;
  amount_remaining_cents: string | number;
  status: string;
  description: string | null;
  canonical: boolean;
};

type ReportTotals = { accounts: number; totalCents: number; settledCents: number; openCents: number };
type Report = {
  competence: string;
  totals: { receber: ReportTotals; pagar: ReportTotals };
  accounts: Array<Pick<Account, "kind" | "id" | "protocol" | "status" | "due_date" | "canonical"> & {
    amount_cents: string | number; amount_paid_cents: string | number; amount_remaining_cents: string | number;
  }>;
  note: string;
};

const QUEUE_URL = "/api/admin/finance/l07/settlements";
const REPORT_URL = "/api/admin/finance/l07/settlement-report";

const money = (value: string | number | null | undefined) =>
  value === null || value === undefined ? "Valor ausente" : `R$ ${(Number(value) / 100).toFixed(2).replace(".", ",")}`;

function attemptKey(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

async function call(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof data?.error === "string" ? data.error : `erro_${response.status}`;
    throw new Error(code);
  }
  return data;
}

function describe(code: string) {
  if (code === "permission_scope_denied") return "Sua identidade não tem concessão ativa de finance.settlements para este recorte.";
  if (code === "admin_session_required") return "Sessão administrativa necessária.";
  if (code === "settlement_exceeds_balance") return "A baixa informada é maior que o saldo em aberto da conta.";
  if (code === "settlement_transition_not_allowed") return "A situação atual da conta não aceita baixa.";
  if (code === "idempotency_conflict") return "A mesma chave de idempotência já foi usada com conteúdo diferente.";
  return `Falha: ${code}`;
}

export default function SettlementWorkspace() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({ accountId: "", competenceDate: "", dueDate: "", amountCents: "", description: "" });
  const [settlement, setSettlement] = useState<Record<string, { amountCents: string; reason: string }>>({});
  const [competence, setCompetence] = useState("");
  const [report, setReport] = useState<Report | null>(null);

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (failure) { setError(describe(failure instanceof Error ? failure.message : "desconhecida")); }
    finally { setBusy(false); }
  };

  const loadQueue = useCallback(async () => {
    setError("");
    try {
      const data = await call(QUEUE_URL);
      setAccounts(data.accounts || []);
      setQueueLoaded(true);
    } catch (failure) {
      setQueueLoaded(false);
      setError(describe(failure instanceof Error ? failure.message : "desconhecida"));
    }
  }, []);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  const submitOpen = (event: FormEvent) => {
    event.preventDefault();
    return run(async () => {
      const data = await call(QUEUE_URL, {
        method: "POST",
        headers: { "Idempotency-Key": attemptKey("ui-fin-open") },
        body: JSON.stringify({
          kind: "receber",
          accountId: open.accountId.trim(),
          competenceDate: open.competenceDate,
          dueDate: open.dueDate,
          amountCents: Number(open.amountCents),
          description: open.description.trim(),
        }),
      });
      setNotice(`Conta ${data.protocol} aberta na rota canônica e aguardando baixa.`);
      setOpen({ accountId: "", competenceDate: "", dueDate: "", amountCents: "", description: "" });
      await loadQueue();
    });
  };

  const submitSettlement = (account: Account) => (event: FormEvent) => {
    event.preventDefault();
    const form = settlement[account.id] || { amountCents: "", reason: "" };
    return run(async () => {
      const data = await call(QUEUE_URL, {
        method: "PATCH",
        headers: { "Idempotency-Key": attemptKey("ui-fin-settle") },
        body: JSON.stringify({
          kind: account.kind,
          id: account.id,
          amountCents: Number(form.amountCents),
          reason: form.reason.trim(),
          method: "pix",
        }),
      });
      setNotice(data.status === "parcial"
        ? `Baixa parcial registrada: saldo em aberto de ${money(data.remainingCents)}.`
        : "Baixa integral registrada; a conta foi liquidada com trilha auditada.");
      setSettlement(previous => ({ ...previous, [account.id]: { amountCents: "", reason: "" } }));
      await loadQueue();
    });
  };

  const loadReport = (event: FormEvent) => {
    event.preventDefault();
    return run(async () => {
      const data = await call(`${REPORT_URL}?competence=${encodeURIComponent(competence)}`);
      setReport(data);
      setNotice(`Relatório da competência ${data.competence} calculado sobre as fontes canônicas.`);
    });
  };

  const settleable = (status: string) => ["pendente", "vencido", "parcial"].includes(status);

  return (
    <section data-testid="fin-f03-settlements" style={{ display: "grid", gap: "1rem", maxWidth: "100%" }}>
      <h2>Contas, baixa e relatório (jornada canônica)</h2>
      <p>
        Fila restrita às concessões ativas <code>finance.settlements.read</code>; a baixa exige
        <code> finance.settlements.write</code> no escopo da conta e nasce somente aqui.
      </p>
      {error && <p role="alert" data-testid="fin-f03-error">{error}</p>}
      {notice && <p role="status" data-testid="fin-f03-notice">{notice}</p>}
      {busy && <p data-testid="fin-f03-busy">Processando…</p>}

      <form onSubmit={submitOpen} data-testid="fin-f03-open-form" style={{ display: "grid", gap: ".5rem" }}>
        <h3>1 · Abrir conta a receber</h3>
        <label htmlFor="fin-f03-account">Conta do cliente (identificador)</label>
        <input id="fin-f03-account" required value={open.accountId} onChange={e => setOpen({ ...open, accountId: e.target.value })} />
        <label htmlFor="fin-f03-competence-date">Competência</label>
        <input id="fin-f03-competence-date" type="date" required value={open.competenceDate} onChange={e => setOpen({ ...open, competenceDate: e.target.value })} />
        <label htmlFor="fin-f03-due-date">Vencimento</label>
        <input id="fin-f03-due-date" type="date" required value={open.dueDate} onChange={e => setOpen({ ...open, dueDate: e.target.value })} />
        <label htmlFor="fin-f03-amount">Valor em centavos</label>
        <input id="fin-f03-amount" type="number" min={1} required value={open.amountCents} onChange={e => setOpen({ ...open, amountCents: e.target.value })} />
        <label htmlFor="fin-f03-description">Descrição (10 a 1000 caracteres)</label>
        <textarea id="fin-f03-description" required minLength={10} maxLength={1000} value={open.description} onChange={e => setOpen({ ...open, description: e.target.value })} />
        <button type="submit" disabled={busy}>Abrir conta</button>
      </form>

      <div data-testid="fin-f03-queue">
        <h3>2 · Fila de contas no seu escopo</h3>
        {!queueLoaded && !error && <p data-testid="fin-f03-queue-loading">Carregando a fila…</p>}
        {queueLoaded && accounts.length === 0 && <p data-testid="fin-f03-queue-empty">Nenhuma conta no seu escopo.</p>}
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: ".75rem" }}>
          {accounts.map(account => (
            <li key={account.id} data-testid={`fin-f03-account-${account.id}`} style={{ border: "1px solid #ccc", padding: ".75rem", overflowWrap: "anywhere" }}>
              <p>
                <strong>{account.protocol}</strong> · {account.kind === "receber" ? "a receber" : "a pagar"} · vence {account.due_date}
              </p>
              <p>{account.description || "Descrição ausente"}</p>
              <p>
                Situação <strong data-testid={`fin-f03-status-${account.id}`}>{account.status}</strong> · total {money(account.amount_cents)} ·
                baixado {money(account.amount_paid_cents)} · em aberto {money(account.amount_remaining_cents)}
                {account.canonical ? " · governança canônica" : " · conta legada"}
              </p>
              {settleable(account.status) ? (
                <form onSubmit={submitSettlement(account)} style={{ display: "grid", gap: ".5rem" }}>
                  <label htmlFor={`fin-f03-settle-amount-${account.id}`}>Baixa em centavos</label>
                  <input
                    id={`fin-f03-settle-amount-${account.id}`}
                    type="number"
                    min={1}
                    required
                    value={settlement[account.id]?.amountCents || ""}
                    onChange={e => setSettlement(previous => ({ ...previous, [account.id]: { amountCents: e.target.value, reason: previous[account.id]?.reason || "" } }))}
                  />
                  <label htmlFor={`fin-f03-settle-reason-${account.id}`}>Motivo da baixa (10 a 1000 caracteres)</label>
                  <textarea
                    id={`fin-f03-settle-reason-${account.id}`}
                    required
                    minLength={10}
                    maxLength={1000}
                    value={settlement[account.id]?.reason || ""}
                    onChange={e => setSettlement(previous => ({ ...previous, [account.id]: { amountCents: previous[account.id]?.amountCents || "", reason: e.target.value } }))}
                  />
                  <button type="submit" disabled={busy}>Registrar baixa</button>
                </form>
              ) : (
                <p data-testid={`fin-f03-settled-${account.id}`}>Conta liquidada ou encerrada: não há baixa pendente.</p>
              )}
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={loadReport} data-testid="fin-f03-report-form" style={{ display: "grid", gap: ".5rem" }}>
        <h3>3 · Relatório da competência</h3>
        <label htmlFor="fin-f03-report-competence">Competência (AAAA-MM)</label>
        <input id="fin-f03-report-competence" required pattern="\d{4}-\d{2}" placeholder="2026-10" value={competence} onChange={e => setCompetence(e.target.value)} />
        <button type="submit" disabled={busy}>Gerar relatório</button>
      </form>
      {report && (
        <div data-testid="fin-f03-report">
          <h4>Competência {report.competence}</h4>
          <p data-testid="fin-f03-report-receber">
            A receber: {report.totals.receber.accounts} conta(s) · total {money(report.totals.receber.totalCents)} ·
            baixado {money(report.totals.receber.settledCents)} · em aberto {money(report.totals.receber.openCents)}
          </p>
          <p data-testid="fin-f03-report-pagar">
            A pagar: {report.totals.pagar.accounts} conta(s) · total {money(report.totals.pagar.totalCents)} ·
            baixado {money(report.totals.pagar.settledCents)} · em aberto {money(report.totals.pagar.openCents)}
          </p>
          <ul>
            {report.accounts.length === 0 && <li data-testid="fin-f03-report-empty">Nenhuma conta nesta competência dentro do seu escopo.</li>}
            {report.accounts.map(line => (
              <li key={`${line.kind}-${line.id}`}>{line.protocol} · {line.status} · baixado {money(line.amount_paid_cents)} de {money(line.amount_cents)}</li>
            ))}
          </ul>
          <p>{report.note}</p>
        </div>
      )}
    </section>
  );
}
