"use client";

import { FormEvent, useEffect, useState } from "react";
import UiState from "../../../components/ui/UiState";
import {
  conciliationStatusLabel,
  describeFinError,
  finErrorFootnote,
  finErrorVariant,
} from "../../../lib/fin-vocabulary.mjs";
import type { FinErrorDescriptor } from "../../../lib/fin-vocabulary.mjs";

type Statement = {
  id: string;
  protocol: string;
  source: string;
  file_name: string;
  import_date: string;
  total_transactions: number | string;
  total_amount_cents: number | string;
};
type BankTransaction = {
  id: string;
  statement_id: string;
  transaction_date: string;
  amount_cents: number | string;
  description: string;
  bank_ref: string;
  is_conciliated: boolean;
};
type Account = { id: string; protocol: string; amount_cents: number | string; status: string };
type Conciliation = {
  id: string;
  receivable_id: string | null;
  payable_id: string | null;
  bank_transaction_id: string | null;
  source: string;
  status: string;
  suggestion_reason: string | null;
  divergence_reason: string | null;
  amount_matched_cents: number | string | null;
};

const money = (value: number | string | null | undefined) =>
  value == null ? "Dado ausente" : `R$ ${(Number(value) / 100).toFixed(2).replace(".", ",")}`;

// UX-07B: o erro carrega código e status; a frase vem do vocabulário da
// família e o código canônico fica no rodapé, entre parênteses.
async function request(path: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
  } catch {
    throw describeFinError(null, 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw describeFinError(typeof data?.error === "string" ? data.error : null, response.status);
  return data;
}
function finFailure(cause: unknown): FinErrorDescriptor {
  return cause && typeof cause === "object" && typeof (cause as FinErrorDescriptor).kind === "string"
    ? (cause as FinErrorDescriptor)
    : describeFinError(null, 0);
}

export default function BankReconciliationWorkspace() {
  const [statements, setStatements] = useState<Statement[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [receivables, setReceivables] = useState<Account[]>([]);
  const [payables, setPayables] = useState<Account[]>([]);
  const [conciliations, setConciliations] = useState<Conciliation[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState<FinErrorDescriptor|null>(null);
  const [loaded, setLoaded] = useState(false);

  const [statementForm, setStatementForm] = useState({
    source: "extrato",
    file_name: "",
    file_url: "/synthetic/finance/",
    storage_key: "",
    import_date: "",
  });
  const [transactionForm, setTransactionForm] = useState({
    statement_id: "",
    transaction_date: "",
    amount_cents: "",
    description: "",
    bank_ref: "",
  });
  const [conciliationForm, setConciliationForm] = useState({
    account_type: "receber",
    account_id: "",
    bank_transaction_id: "",
    source: "extrato",
    suggestion_reason: "Sugestão sintética por referência, data e valor do extrato",
    amount_matched_cents: "",
  });
  const [confirmationForm, setConfirmationForm] = useState({
    id: "",
    status: "conciliada",
    divergence_reason: "",
  });

  const run = async (operation: () => Promise<void>) => {
    setError(null);
    setNotice("");
    try {
      await operation();
    } catch (cause) {
      setError(finFailure(cause));
    }
  };

  async function load() {
    const [statementData, transactionData, receivableData, payableData, conciliationData] = await Promise.all([
      request("/api/fin/bank-statements"),
      request("/api/fin/bank-transactions"),
      request("/api/fin/receivables"),
      request("/api/fin/payables"),
      request("/api/fin/conciliations"),
    ]);
    setStatements(statementData.statements || []);
    setTransactions(transactionData.transactions || []);
    setReceivables(receivableData.receivables || []);
    setPayables(payableData.payables || []);
    setConciliations(conciliationData.conciliations || []);
    setLoaded(true);
  }

  useEffect(() => {
    run(load);
  }, []);

  const createStatement = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const data = await request("/api/fin/bank-statements", {
        method: "POST",
        body: JSON.stringify({
          ...statementForm,
          import_date: statementForm.import_date || undefined,
          total_transactions: 0,
          total_amount_cents: 0,
        }),
      });
      setNotice(`Extrato sintético ${data.statement.protocol} importado`);
      setStatementForm({ ...statementForm, file_name: "", storage_key: "" });
      await load();
    });
  };

  const createTransaction = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const data = await request("/api/fin/bank-transactions", {
        method: "POST",
        body: JSON.stringify({ ...transactionForm, amount_cents: Number(transactionForm.amount_cents) }),
      });
      setNotice(`Transação sintética ${data.transaction.bank_ref} importada`);
      setTransactionForm({ ...transactionForm, amount_cents: "", description: "", bank_ref: "" });
      await load();
    });
  };

  const createConciliation = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const data = await request("/api/fin/conciliations", {
        method: "POST",
        body: JSON.stringify({
          receivable_id: conciliationForm.account_type === "receber" ? conciliationForm.account_id : null,
          payable_id: conciliationForm.account_type === "pagar" ? conciliationForm.account_id : null,
          bank_transaction_id: conciliationForm.bank_transaction_id,
          source: conciliationForm.source,
          suggestion_reason: conciliationForm.suggestion_reason,
          amount_matched_cents: conciliationForm.amount_matched_cents ? Number(conciliationForm.amount_matched_cents) : null,
        }),
      });
      setNotice(`Sugestão de conciliação ${data.conciliation.id} criada`);
      await load();
    });
  };

  const confirmConciliation = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const data = await request("/api/fin/conciliations", {
        method: "PATCH",
        body: JSON.stringify(confirmationForm),
      });
      setNotice(`Conciliação ${data.conciliation.status}`);
      setConfirmationForm({ ...confirmationForm, id: "", divergence_reason: "" });
      await load();
    });
  };

  const accountOptions = conciliationForm.account_type === "receber" ? receivables : payables;

  return (
    <section data-testid="fin05-reconciliation" aria-labelledby="fin05-title" style={{ display: "grid", gap: "1rem" }}>
      <header>
        <h2 id="fin05-title">FIN-05 · Conciliação bancária sintética</h2>
        <p>
          Importação local de extrato, sugestão e confirmação. Não há conexão com banco, provedor,
          gateway ou arquivo de produção.
        </p>
      </header>
      {error && (
        <div data-testid="fin05-error">
          <UiState
            variant={finErrorVariant(error)}
            title={error.title}
            detail={`${error.detail} ${finErrorFootnote(error)}`}
          />
        </div>
      )}
      {notice && <p role="status" data-testid="fin05-notice">{notice}</p>}

      <form data-testid="fin05-statement-form" onSubmit={createStatement} style={{ display: "grid", gap: 8 }}>
        <h3>Importar extrato sintético</h3>
        <label>Origem <select data-testid="fin05-statement-source" value={statementForm.source} onChange={event => setStatementForm({ ...statementForm, source: event.target.value })}>
          <option value="extrato">Extrato</option><option value="importacao">Importação</option><option value="provedor">Provedor simulado</option><option value="manual">Manual</option>
        </select></label>
        <label>Nome do arquivo <input required data-testid="fin05-file-name" value={statementForm.file_name} onChange={event => setStatementForm({ ...statementForm, file_name: event.target.value })} /></label>
        <label>URL local do arquivo <input required data-testid="fin05-file-url" value={statementForm.file_url} onChange={event => setStatementForm({ ...statementForm, file_url: event.target.value })} /></label>
        <label>Chave de armazenamento <input required data-testid="fin05-storage-key" value={statementForm.storage_key} onChange={event => setStatementForm({ ...statementForm, storage_key: event.target.value })} /></label>
        <label>Data da importação <input type="date" data-testid="fin05-import-date" value={statementForm.import_date} onChange={event => setStatementForm({ ...statementForm, import_date: event.target.value })} /></label>
        <button type="submit" data-testid="fin05-import-statement">Importar extrato sintético</button>
      </form>

      <div>
        <h3>Extratos importados</h3>
        <ul data-testid="fin05-statements">
          {statements.length === 0 ? <li>{loaded ? "Nenhum extrato sintético importado. A leitura foi concluída com sucesso." : "Extratos ainda não lidos."}</li> : statements.map(statement => (
            <li key={statement.id}>{statement.protocol} · {statement.source} · {statement.file_name} · {statement.total_transactions} transações · {money(statement.total_amount_cents)}</li>
          ))}
        </ul>
      </div>

      <form data-testid="fin05-transaction-form" onSubmit={createTransaction} style={{ display: "grid", gap: 8 }}>
        <h3>Adicionar transação do extrato</h3>
        <label>Extrato <select required data-testid="fin05-transaction-statement" value={transactionForm.statement_id} onChange={event => setTransactionForm({ ...transactionForm, statement_id: event.target.value })}>
          <option value="">Selecione o extrato</option>{statements.map(statement => <option key={statement.id} value={statement.id}>{statement.protocol} · {statement.file_name}</option>)}
        </select></label>
        <label>Data <input required type="date" data-testid="fin05-transaction-date" value={transactionForm.transaction_date} onChange={event => setTransactionForm({ ...transactionForm, transaction_date: event.target.value })} /></label>
        <label>Valor em centavos <input required type="number" data-testid="fin05-transaction-amount" value={transactionForm.amount_cents} onChange={event => setTransactionForm({ ...transactionForm, amount_cents: event.target.value })} /></label>
        <label>Descrição <input required data-testid="fin05-transaction-description" value={transactionForm.description} onChange={event => setTransactionForm({ ...transactionForm, description: event.target.value })} /></label>
        <label>Referência bancária <input required data-testid="fin05-bank-ref" value={transactionForm.bank_ref} onChange={event => setTransactionForm({ ...transactionForm, bank_ref: event.target.value })} /></label>
        <button type="submit" data-testid="fin05-import-transaction">Importar transação sintética</button>
      </form>

      <div>
        <h3>Transações do extrato</h3>
        <ul data-testid="fin05-transactions">
          {transactions.length === 0 ? <li>{loaded ? "Nenhuma transação sintética registrada. A leitura foi concluída com sucesso." : "Transações ainda não lidas."}</li> : transactions.map(transaction => (
            <li key={transaction.id}>{transaction.bank_ref} · {transaction.transaction_date} · {transaction.description} · {money(transaction.amount_cents)} · {transaction.is_conciliated ? "conciliada" : "pendente"}</li>
          ))}
        </ul>
      </div>

      <form data-testid="fin05-conciliation-form" onSubmit={createConciliation} style={{ display: "grid", gap: 8 }}>
        <h3>Sugerir conciliação</h3>
        <label>Tipo da conta <select data-testid="fin05-account-type" value={conciliationForm.account_type} onChange={event => setConciliationForm({ ...conciliationForm, account_type: event.target.value, account_id: "" })}>
          <option value="receber">Recebível</option><option value="pagar">Pagável</option>
        </select></label>
        <label>Conta <select required data-testid="fin05-account" value={conciliationForm.account_id} onChange={event => setConciliationForm({ ...conciliationForm, account_id: event.target.value })}>
          <option value="">Selecione a conta</option>{accountOptions.map(account => <option key={account.id} value={account.id}>{account.protocol} · {money(account.amount_cents)} · {account.status}</option>)}
        </select></label>
        <label>Transação bancária <select required data-testid="fin05-bank-transaction" value={conciliationForm.bank_transaction_id} onChange={event => setConciliationForm({ ...conciliationForm, bank_transaction_id: event.target.value })}>
          <option value="">Selecione a transação</option>{transactions.filter(transaction => !transaction.is_conciliated).map(transaction => <option key={transaction.id} value={transaction.id}>{transaction.bank_ref} · {money(transaction.amount_cents)}</option>)}
        </select></label>
        <label>Fonte <select data-testid="fin05-conciliation-source" value={conciliationForm.source} onChange={event => setConciliationForm({ ...conciliationForm, source: event.target.value })}>
          <option value="extrato">Extrato</option><option value="importacao">Importação</option><option value="provedor">Provedor simulado</option><option value="manual">Manual</option>
        </select></label>
        <label>Motivo da sugestão <input required minLength={10} maxLength={1000} data-testid="fin05-suggestion-reason" value={conciliationForm.suggestion_reason} onChange={event => setConciliationForm({ ...conciliationForm, suggestion_reason: event.target.value })} /></label>
        <label>Valor conciliado em centavos (opcional) <input type="number" min="0" data-testid="fin05-matched-amount" value={conciliationForm.amount_matched_cents} onChange={event => setConciliationForm({ ...conciliationForm, amount_matched_cents: event.target.value })} /></label>
        <button type="submit" data-testid="fin05-suggest">Criar sugestão</button>
      </form>

      <div>
        <h3>Sugestões e confirmações</h3>
        <ul data-testid="fin05-conciliations">
          {conciliations.length === 0 ? <li>{loaded ? "Nenhuma sugestão de conciliação. A leitura foi concluída com sucesso — ausência de sugestão não é prova de extrato conciliado." : "Sugestões ainda não lidas."}</li> : conciliations.map(conciliation => (
            <li data-testid={`fin05-conciliation-${conciliation.id}`} key={conciliation.id}>
              {conciliationStatusLabel(conciliation.status)} <small>(status {conciliation.status})</small> · conta {conciliation.receivable_id || conciliation.payable_id} · banco {conciliation.bank_transaction_id} · {money(conciliation.amount_matched_cents)} · {conciliation.suggestion_reason}
              {conciliation.status === "sugerida" && <button type="button" onClick={() => setConfirmationForm({ ...confirmationForm, id: conciliation.id, status: "conciliada" })}>Selecionar para confirmar</button>}
            </li>
          ))}
        </ul>
      </div>

      <form data-testid="fin05-confirmation-form" onSubmit={confirmConciliation} style={{ display: "grid", gap: 8 }}>
        <h3>Confirmar ou marcar divergência</h3>
        <label>Id da sugestão <input required data-testid="fin05-confirmation-id" value={confirmationForm.id} onChange={event => setConfirmationForm({ ...confirmationForm, id: event.target.value })} /></label>
        <label>Resultado <select data-testid="fin05-confirmation-status" value={confirmationForm.status} onChange={event => setConfirmationForm({ ...confirmationForm, status: event.target.value })}>
          <option value="conciliada">Confirmar conciliação</option><option value="divergente">Marcar divergente</option><option value="ignorada">Ignorar sugestão</option>
        </select></label>
        <label>Motivo da divergência <input data-testid="fin05-divergence-reason" minLength={10} maxLength={1000} value={confirmationForm.divergence_reason} onChange={event => setConfirmationForm({ ...confirmationForm, divergence_reason: event.target.value })} /></label>
        <button type="submit" data-testid="fin05-confirm">Registrar resultado</button>
      </form>
    </section>
  );
}
