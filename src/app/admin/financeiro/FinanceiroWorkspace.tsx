"use client";

// UX-07 (fatia B — Financeiro): mesma regra das telas já tratadas (CRM em
// UX-03B, RH em UX-04, painel do Marcelo em UX-05, portais em UX-06, Operação
// em UX-07 fatia A).
//
// O que esta fatia MUDA nesta tela: vocabulário em português para os 319
// códigos que os seis servidores financeiros podem devolver, estado honesto de
// leitura (carregando/vazio/falha/negado nunca se confundem), abas de verdade
// (tablist/tab/tabpanel com roving tabindex e ←/→/Home/End) e remoção do
// `style` inline da superfície própria, em favor de `UiWorkspace.module.css`.
//
// O que esta fatia NÃO MUDA: nenhuma URL, método, corpo, cabeçalho ou regra de
// escopo. Nenhuma validação de alçada, idempotência, conciliação, margem,
// fechamento ou comissão foi tocada — tudo isso continua decidido em
// `fin-api.mjs`, `fin-advanced-api.mjs`, `fin-budget-api.mjs`,
// `fin-management-api.mjs`, `f03-finance-api.mjs` e `commission-api.mjs`.
//
// Defeito corrigido aqui: toda falha caía em
// `throw new Error(data.error || "Erro " + status)` e o código cru em inglês
// (`already_generated`, `audit_unavailable`, `overpayment`...) era exibido
// como se fosse uma frase para quem opera. Agora cada falha é classificada,
// explicada em português, e o código canônico fica no rodapé.
//
// Pendência declarada (não corrigida nesta fatia): as treze áreas FIN-05..
// FIN-16 montadas pelas abas seguintes continuam sendo telas próprias, com
// layout legado. Nesta fatia elas receberam apenas o vocabulário (a falha
// deixou de aparecer como código cru) — ver docs/UX-07-FINANCEIRO-2026-10-05.md.

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import BankReconciliationWorkspace from "./BankReconciliationWorkspace";
import CollectionWorkspace from "./CollectionWorkspace";
import CashflowWorkspace from "./CashflowWorkspace";
import CostAllocationWorkspace from "./CostAllocationWorkspace";
import ManagementResultsWorkspace from "./ManagementResultsWorkspace";
import ExpenseWorkspace from "./ExpenseWorkspace";
import FiscalWorkspace from "./FiscalWorkspace";
import GatewayWorkspace from "./GatewayWorkspace";
import BudgetWorkspace from "./BudgetWorkspace";
import ExportWorkspace from "./ExportWorkspace";
import ClosureWorkspace from "./ClosureWorkspace";
import CommissionWorkspace from "./CommissionWorkspace";
import UiState from "../../../components/ui/UiState";
import UiBadge from "../../../components/ui/UiBadge";
import { financeRequest, type FinanceErrorDescriptor } from "../../../lib/finance-request";
import {
  accountStatusLabel,
  accountStatusTone,
  activeLabel,
  activeTone,
  approvalStatusLabel,
  approvalStatusTone,
  financeErrorFootnote,
  financeErrorVariant,
  money,
} from "../../../lib/finance-vocabulary.mjs";
import styles from "../../../components/ui/UiWorkspace.module.css";

type Account = {
  id: string; protocol: string; contract_id: string | null; client_account_id: string | null;
  competence_date: string; due_date: string; amount_cents: string | number;
  amount_paid_cents: string | number; status: string; description?: string | null;
};
type Rule = {
  id: string; contract_id: string; recurrence_id: string; amount_cents: string | number;
  start_date: string; is_approved: boolean; is_active: boolean; suspension_enabled: boolean;
};
type Payment = {
  id: string; account_type: string; receivable_id: string | null; payable_id: string | null;
  amount_cents: string | number; is_estorno: boolean; created_at: string;
};

const TABS = [
  { id: "receivables", label: "Recebíveis" },
  { id: "recurrence", label: "Recorrência" },
  { id: "payments", label: "Pagamentos" },
  { id: "f03reports", label: "Relatório de baixas" },
  { id: "reconciliation", label: "Conciliação bancária" },
  { id: "collection", label: "Cobrança" },
  { id: "cashflow", label: "Fluxo de caixa e aging" },
  { id: "costs", label: "Custos e rateio" },
  { id: "results", label: "Resultado gerencial" },
  { id: "expenses", label: "Despesas e compras" },
  { id: "fiscal", label: "Fiscal e obrigações" },
  { id: "gateway", label: "Boletos, Pix e gateway" },
  { id: "budgets", label: "Orçamento e cenários" },
  { id: "exports", label: "Exportações" },
  { id: "closures", label: "Fechamento" },
  { id: "commissions", label: "Comissões" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Falha de leitura/escrita, sempre com o código canônico no rodapé. */
function FinanceFailure({ error, onRetry, testId }: { error: FinanceErrorDescriptor; onRetry?: () => void; testId: string }) {
  return (
    <div data-testid={testId}>
      <UiState
        variant={financeErrorVariant(error)}
        title={error.title}
        detail={`${error.detail} ${financeErrorFootnote(error)}`}
        onRetry={error.canRetry ? onRetry : undefined}
        retryLabel="Tentar novamente"
      />
    </div>
  );
}

export default function FinanceiroWorkspace() {
  const [tab, setTab] = useState<TabId>("receivables");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [contractFilter, setContractFilter] = useState("");
  const [selected, setSelected] = useState<Account | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<FinanceErrorDescriptor | null>(null);
  const [actionError, setActionError] = useState<FinanceErrorDescriptor | null>(null);
  const [notice, setNotice] = useState("");
  const [newAccount, setNewAccount] = useState({ client_account_id: "", contract_id: "", competence_date: "", due_date: "", amount_cents: "", description: "" });
  const [newRule, setNewRule] = useState({ contract_id: "", recurrence_id: "", start_date: "", amount_cents: "" });
  const [generationClientAccountId, setGenerationClientAccountId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [reason, setReason] = useState("");
  const [estorno, setEstorno] = useState<Payment | null>(null);
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [reportForm, setReportForm] = useState({ account_id: "", period_start: "", period_end: "" });
  const [reports, setReports] = useState<Record<string, unknown>[]>([]);

  /**
   * Leitura do painel próprio (recebíveis, regras e pagamentos). Falha de
   * leitura NUNCA vira lista vazia: as três listas são descartadas e o erro
   * real aparece com o código canônico e opção de repetir.
   */
  const load = useCallback(async () => {
    setLoading(true);
    setReadError(null);
    const [a, r, p] = await Promise.all([
      financeRequest<{ receivables?: Account[] }>("/api/admin/finance/f03/receivables"),
      financeRequest<{ rules?: Rule[] }>("/api/fin/recurrence-rules"),
      financeRequest<{ payments?: Payment[] }>("/api/fin/payments"),
    ]);
    const failed = [a, r, p].find(result => !result.ok);
    if (failed && !failed.ok) {
      setAccounts([]);
      setRules([]);
      setPayments([]);
      setReadError(failed.error);
      setLoading(false);
      return;
    }
    const received: Account[] = (a.ok && a.data.receivables) || [];
    const nextAccounts = contractFilter ? received.filter(item => item.contract_id === contractFilter) : received;
    setAccounts(nextAccounts);
    setRules((r.ok && r.data.rules) || []);
    setPayments((p.ok && p.data.payments) || []);
    if (selected) {
      setSelected(nextAccounts.find(item => item.id === selected.id) || selected);
      const h = await financeRequest<{ history?: Record<string, unknown>[] }>(`/api/fin/payment-history?receivable_id=${selected.id}`);
      if (h.ok) setHistory(h.data.history || []);
      else setActionError(h.error);
    }
    setLoading(false);
  }, [contractFilter, selected]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Escrita: o resultado volta descrito, nunca como `Error` genérico. */
  const run = async (operation: () => Promise<FinanceErrorDescriptor | null>) => {
    setBusy(true);
    setActionError(null);
    setNotice("");
    const failure = await operation();
    if (failure) setActionError(failure);
    setBusy(false);
  };

  const createAccount = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const result = await financeRequest("/api/fin/receivables", {
        method: "POST",
        body: JSON.stringify({ ...newAccount, amount_cents: Number(newAccount.amount_cents), is_recurring: false }),
      });
      if (!result.ok) return result.error;
      setNotice("Recebível criado.");
      setNewAccount({ client_account_id: "", contract_id: "", competence_date: "", due_date: "", amount_cents: "", description: "" });
      await load();
      return null;
    });
  };

  const createRule = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const result = await financeRequest("/api/fin/recurrence-rules", {
        method: "POST",
        body: JSON.stringify({ ...newRule, amount_cents: Number(newRule.amount_cents), recurrence_type: "mensal" }),
      });
      if (!result.ok) return result.error;
      setNotice("Regra criada e aguardando aprovação.");
      setNewRule({ contract_id: "", recurrence_id: "", start_date: "", amount_cents: "" });
      await load();
      return null;
    });
  };

  const approve = (rule: Rule) => run(async () => {
    const result = await financeRequest("/api/fin/recurrence-rules", {
      method: "PATCH",
      body: JSON.stringify({ id: rule.id, is_approved: true }),
    });
    if (!result.ok) return result.error;
    setNotice("Regra aprovada.");
    await load();
    return null;
  });

  const generate = (rule: Rule) => run(async () => {
    if (!generationClientAccountId) {
      return {
        kind: "invalid" as const, code: null, status: 0, canRetry: false,
        title: "Informe a conta do cliente para gerar a cobrança",
        detail: "A geração precisa saber para qual conta de cliente a cobrança será criada. Nada foi gerado.",
      };
    }
    const date = rule.start_date.slice(0, 10);
    const result = await financeRequest("/api/fin/generate-recurring", {
      method: "POST",
      body: JSON.stringify({
        recurrence_rule_id: rule.id, competence_date: date, due_date: date,
        client_account_id: generationClientAccountId, contract_id: rule.contract_id,
        amount_cents: Number(rule.amount_cents),
      }),
    });
    if (!result.ok) return result.error;
    setNotice("Cobrança gerada.");
    await load();
    return null;
  });

  const pay = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    await run(async () => {
      const result = await financeRequest<{ note?: string }>(`/api/admin/finance/f03/receivables/${selected.id}/settlements`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ amount_cents: Number(paymentAmount), reason }),
      });
      if (!result.ok) return result.error;
      setNotice(result.data?.note || "Baixa registrada.");
      setPaymentAmount("");
      setReason("");
      await load();
      return null;
    });
  };

  const doEstorno = async () => {
    if (!selected || !estorno) return;
    await run(async () => {
      const result = await financeRequest("/api/fin/payments", {
        method: "POST",
        body: JSON.stringify({
          account_type: "receber", receivable_id: selected.id,
          amount_cents: Number(estorno.amount_cents), reason, is_estorno: true,
          previous_payment_id: estorno.id,
        }),
      });
      if (!result.ok) return result.error;
      setNotice("Estorno registrado.");
      setEstorno(null);
      setReason("");
      await load();
      return null;
    });
  };

  const openAccount = (account: Account) => run(async () => {
    setSelected(account);
    const result = await financeRequest<{ history?: Record<string, unknown>[] }>(`/api/fin/payment-history?receivable_id=${account.id}`);
    if (!result.ok) { setHistory([]); return result.error; }
    setHistory(result.data.history || []);
    return null;
  });

  const loadReports = () => run(async () => {
    const result = await financeRequest<{ reports?: Record<string, unknown>[] }>("/api/admin/finance/f03/reports");
    if (!result.ok) return result.error;
    setReports(result.data.reports || []);
    return null;
  });

  const generateReport = (event: FormEvent) => {
    event.preventDefault();
    return run(async () => {
      const result = await financeRequest<{ note?: string }>("/api/admin/finance/f03/reports", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(reportForm),
      });
      if (!result.ok) return result.error;
      setNotice(result.data?.note || "Relatório interno gerado.");
      const listed = await financeRequest<{ reports?: Record<string, unknown>[] }>("/api/admin/finance/f03/reports");
      if (!listed.ok) return listed.error;
      setReports(listed.data.reports || []);
      return null;
    });
  };

  function onTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex(item => item.id === tab);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    const target = TABS[next].id;
    setTab(target);
    tabRefs.current[target]?.focus();
  }

  const activeTabInfo = TABS.find(item => item.id === tab)!;

  return (
    <main className={styles.workspace} data-testid="financeiro-workspace">
      <nav aria-label="Navegação financeira" className={styles.breadcrumbNav}>
        <a href="/admin/contratos">Contratos</a> · <a href="/admin/crm">Empresas e funil</a>
      </nav>

      <h1>Financeiro — contas, recorrência e baixas</h1>
      <p className={styles.lede}>
        Contas a receber e a pagar, regras de recorrência e baixas com auditoria transacional. Gerar cobrança não é
        receber: nenhuma baixa acontece sem lançamento registrado, e toda recusa de auditoria desfaz a operação inteira.
      </p>

      {loading ? (
        <UiState
          variant="loading"
          title="Consultando o financeiro…"
          detail="Recebíveis, regras de recorrência e pagamentos ainda não foram confirmados."
        />
      ) : null}

      {!loading && readError ? (
        <FinanceFailure error={readError} onRetry={() => { void load(); }} testId="finance-read-error" />
      ) : null}

      {!loading && !readError ? (
        <>
          <div className={styles.tabs} role="tablist" aria-label="Frentes de trabalho do financeiro">
            {TABS.map(item => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`fin-aba-${item.id}`}
                data-testid={`finance-tab-${item.id}`}
                aria-selected={tab === item.id}
                aria-controls={`fin-painel-${item.id}`}
                tabIndex={tab === item.id ? 0 : -1}
                ref={element => { tabRefs.current[item.id] = element; }}
                className={tab === item.id ? styles.tabActive : styles.tab}
                onClick={() => setTab(item.id)}
                onKeyDown={onTabKeyDown}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div
            className={styles.tabPanel}
            role="tabpanel"
            id={`fin-painel-${tab}`}
            aria-labelledby={`fin-aba-${tab}`}
            tabIndex={-1}
          >
            <h2 className={styles.visuallyHidden}>{activeTabInfo.label}</h2>

            {actionError ? <FinanceFailure error={actionError} testId="finance-error" /> : null}
            {notice ? <p role="status" data-testid="finance-notice" className={`${styles.notice} ${styles.noticeInfo}`}>{notice}</p> : null}
            {busy ? <p data-testid="finance-loading" className={styles.hint}>Enviando ao servidor…</p> : null}

            {tab === "receivables" ? (
              <section data-testid="finance-receivables" className={styles.sectionCard} aria-label="Recebíveis">
                <div className={styles.panel}>
                  <h3 className={styles.panelTitle}>Novo recebível</h3>
                  <form onSubmit={createAccount}>
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="fin-novo-conta">Conta do cliente <span className={styles.required}>(obrigatório)</span></label>
                        <input id="fin-novo-conta" required placeholder="ID da conta do cliente" value={newAccount.client_account_id} onChange={e => setNewAccount({ ...newAccount, client_account_id: e.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="fin-novo-contrato">Contrato</label>
                        <input id="fin-novo-contrato" placeholder="ID do contrato" value={newAccount.contract_id} onChange={e => setNewAccount({ ...newAccount, contract_id: e.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="fin-novo-competencia">Competência <span className={styles.required}>(obrigatório)</span></label>
                        <input id="fin-novo-competencia" required type="date" aria-label="Competência" value={newAccount.competence_date} onChange={e => setNewAccount({ ...newAccount, competence_date: e.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="fin-novo-vencimento">Vencimento <span className={styles.required}>(obrigatório)</span></label>
                        <input id="fin-novo-vencimento" required type="date" aria-label="Vencimento" value={newAccount.due_date} onChange={e => setNewAccount({ ...newAccount, due_date: e.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="fin-novo-valor">Valor em centavos <span className={styles.required}>(obrigatório)</span></label>
                        <input id="fin-novo-valor" required type="number" min="1" placeholder="Valor em centavos" value={newAccount.amount_cents} onChange={e => setNewAccount({ ...newAccount, amount_cents: e.target.value })} />
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <button type="submit" className={styles.primary} disabled={busy}>Criar recebível</button>
                    </div>
                  </form>
                </div>

                <div className={styles.panel}>
                  <h3 className={styles.panelTitle}>Contas a receber</h3>
                  <form onSubmit={e => { e.preventDefault(); void load(); }}>
                    <div className={styles.field}>
                      <label htmlFor="fin-filtro-contrato">Filtrar por contrato</label>
                      <input id="fin-filtro-contrato" data-testid="finance-contract-filter" placeholder="Filtrar por contrato" value={contractFilter} onChange={e => setContractFilter(e.target.value)} />
                    </div>
                    <div className={styles.actions}><button type="submit">Filtrar</button></div>
                  </form>
                  <AccountTable accounts={accounts} onSelect={openAccount} />
                  <p className={styles.footnote}>
                    Situação, saldo e protocolo vêm do banco. Abrir uma conta aqui não dá baixa: a baixa é uma gravação
                    própria, com motivo escrito e chave de idempotência.
                  </p>
                </div>
              </section>
            ) : null}

            {tab === "recurrence" ? (
              <section data-testid="finance-recurrence" className={styles.sectionCard} aria-label="Regras de recorrência">
                <div className={styles.panel}>
                  <h3 className={styles.panelTitle}>Conta do cliente usada na geração</h3>
                  <div className={styles.field}>
                    <label htmlFor="fin-geracao-conta">Conta do cliente para geração <span className={styles.required}>(obrigatório)</span></label>
                    <input id="fin-geracao-conta" required data-testid="finance-generation-client-account" placeholder="ID da conta do cliente para geração" value={generationClientAccountId} onChange={e => setGenerationClientAccountId(e.target.value)} />
                  </div>
                </div>

                <div className={styles.panel}>
                  <h3 className={styles.panelTitle}>Nova regra mensal</h3>
                  <form onSubmit={createRule}>
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="fin-regra-contrato">Contrato <span className={styles.required}>(obrigatório)</span></label>
                        <input id="fin-regra-contrato" required placeholder="ID do contrato" value={newRule.contract_id} onChange={e => setNewRule({ ...newRule, contract_id: e.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="fin-regra-id">Identificador da regra <span className={styles.required}>(obrigatório)</span></label>
                        <input id="fin-regra-id" required placeholder="Identificador da regra" value={newRule.recurrence_id} onChange={e => setNewRule({ ...newRule, recurrence_id: e.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="fin-regra-inicio">Início da vigência <span className={styles.required}>(obrigatório)</span></label>
                        <input id="fin-regra-inicio" required type="date" value={newRule.start_date} onChange={e => setNewRule({ ...newRule, start_date: e.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="fin-regra-valor">Valor em centavos <span className={styles.required}>(obrigatório)</span></label>
                        <input id="fin-regra-valor" required type="number" min="1" placeholder="Valor em centavos" value={newRule.amount_cents} onChange={e => setNewRule({ ...newRule, amount_cents: e.target.value })} />
                      </div>
                    </div>
                    <div className={styles.actions}><button type="submit" className={styles.primary}>Criar regra</button></div>
                  </form>
                </div>

                <div className={styles.panel}>
                  <h3 className={styles.panelTitle}>Regras cadastradas</h3>
                  {rules.length === 0 ? (
                    <UiState variant="empty" title="Nenhuma regra encontrada." detail="Nenhuma regra de recorrência está cadastrada neste escopo." />
                  ) : (
                    <ul className={styles.cards}>
                      {rules.map(rule => (
                        <li key={rule.id} data-testid={`finance-rule-${rule.id}`} className={styles.card}>
                          <p className={styles.cardTitle}>Contrato {rule.contract_id}</p>
                          <dl className={styles.facts}>
                            <div><dt>Valor</dt><dd>{money(rule.amount_cents)}</dd></div>
                            <div><dt>Identificador</dt><dd>{rule.recurrence_id}</dd></div>
                            <div><dt>Início</dt><dd>{String(rule.start_date).slice(0, 10)}</dd></div>
                          </dl>
                          <div className={styles.badgeRow}>
                            <UiBadge tone={approvalStatusTone(rule.is_approved ? "aprovado" : "pendente")} srPrefix="Aprovação">
                              {rule.is_approved ? "Regra aprovada" : approvalStatusLabel("pendente")}
                            </UiBadge>
                            <UiBadge tone={activeTone(rule.is_active)} srPrefix="Vigência">{activeLabel(rule.is_active)}</UiBadge>
                            {rule.suspension_enabled ? <UiBadge tone="warning" srPrefix="Suspensão">Suspensão habilitada</UiBadge> : null}
                          </div>
                          <div className={styles.actions}>
                            <button type="button" disabled={rule.is_approved} onClick={() => approve(rule)}>Aprovar</button>
                            <button type="button" disabled={!rule.is_approved || !rule.is_active} onClick={() => generate(rule)}>Gerar cobrança</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className={styles.footnote}>
                    A geração é idempotente por competência: pedir de novo a mesma competência não cria uma segunda
                    cobrança — o servidor responde que ela já existe.
                  </p>
                </div>
              </section>
            ) : null}

            {tab === "payments" ? (
              <section data-testid="finance-payments" className={styles.sectionCard} aria-label="Pagamentos e baixas">
                <div className={styles.panel}>
                  <h3 className={styles.panelTitle}>Movimentos registrados</h3>
                  <PaymentTable payments={payments} />
                </div>
                {selected ? (
                  <div className={styles.panel}>
                    <h3 className={styles.panelTitle}>Conta {selected.protocol}</h3>
                    <dl className={styles.facts}>
                      <div><dt>Baixado</dt><dd>{money(selected.amount_paid_cents)} de {money(selected.amount_cents)}</dd></div>
                      <div>
                        <dt>Situação</dt>
                        <dd>
                          <UiBadge tone={accountStatusTone(selected.status)} srPrefix="Situação da conta">
                            {accountStatusLabel(selected.status)}
                          </UiBadge>
                        </dd>
                      </div>
                    </dl>
                    <form onSubmit={pay}>
                      <div className={styles.fieldRow}>
                        <div className={styles.field}>
                          <label htmlFor="fin-baixa-valor">Baixa em centavos <span className={styles.required}>(obrigatório)</span></label>
                          <input id="fin-baixa-valor" required type="number" min="1" placeholder="Baixa em centavos" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="fin-baixa-motivo">Motivo <span className={styles.required}>(obrigatório)</span></label>
                          <input id="fin-baixa-motivo" required minLength={10} maxLength={1000} placeholder="Motivo (10 a 1000 caracteres)" value={reason} onChange={e => setReason(e.target.value)} />
                        </div>
                      </div>
                      <div className={styles.actions}><button type="submit" className={styles.primary}>Dar baixa</button></div>
                    </form>

                    <h4 className={styles.panelTitle}>Histórico da conta</h4>
                    {history.length === 0 ? (
                      <p className={styles.hint}>Nenhum evento de histórico foi lido para esta conta.</p>
                    ) : (
                      <ul className={styles.cards}>
                        {history.map((item, index) => (
                          <li key={index} className={styles.card}>
                            {String(item.reason || "Histórico sem motivo")} · {accountStatusLabel(String(item.next_status || ""))}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className={styles.actions}>
                      {payments.filter(p => p.receivable_id === selected.id && !p.is_estorno).map(p => (
                        <button type="button" key={p.id} onClick={() => setEstorno(p)}>Estornar pagamento de {money(p.amount_cents)}</button>
                      ))}
                      {estorno ? <button type="button" className={styles.primary} onClick={doEstorno}>Confirmar estorno</button> : null}
                    </div>
                    <p className={styles.footnote}>
                      O estorno exige o pagamento de origem e motivo escrito; ele não apaga o pagamento, acrescenta um
                      lançamento contrário à trilha.
                    </p>
                  </div>
                ) : (
                  <div className={styles.panel}>
                    <UiState
                      variant="empty"
                      title="Nenhuma conta selecionada."
                      detail="Abra uma conta na aba Recebíveis para registrar baixa, ver histórico e estornar."
                    />
                  </div>
                )}
              </section>
            ) : null}

            {tab === "f03reports" ? (
              <section data-testid="finance-f03-reports" className={styles.sectionCard} aria-label="Relatório interno de contas e baixas">
                <div className={styles.panel}>
                  <h3 className={styles.panelTitle}>Relatório interno de contas e baixas</h3>
                  <p className={styles.hint}>
                    Fotografia calculada a partir das fontes canônicas. Não há integração bancária, baixa automática,
                    SMTP nem envio externo.
                  </p>
                  <form onSubmit={generateReport}>
                    <div className={styles.fieldRow}>
                      <div className={styles.field}>
                        <label htmlFor="fin-rel-conta">Conta do cliente <span className={styles.required}>(obrigatório)</span></label>
                        <input id="fin-rel-conta" required placeholder="ID da conta do cliente" value={reportForm.account_id} onChange={e => setReportForm({ ...reportForm, account_id: e.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="fin-rel-inicio">Início do relatório <span className={styles.required}>(obrigatório)</span></label>
                        <input id="fin-rel-inicio" required aria-label="Início do relatório" type="date" value={reportForm.period_start} onChange={e => setReportForm({ ...reportForm, period_start: e.target.value })} />
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="fin-rel-fim">Fim do relatório <span className={styles.required}>(obrigatório)</span></label>
                        <input id="fin-rel-fim" required aria-label="Fim do relatório" type="date" value={reportForm.period_end} onChange={e => setReportForm({ ...reportForm, period_end: e.target.value })} />
                      </div>
                    </div>
                    <div className={styles.actions}>
                      <button type="submit" className={styles.primary} disabled={busy}>Gerar snapshot</button>
                      <button type="button" onClick={loadReports}>Atualizar lista</button>
                    </div>
                  </form>
                  {reports.length === 0 ? (
                    <p className={styles.hint}>Nenhum relatório foi lido ainda. Use “Atualizar lista” para consultar.</p>
                  ) : (
                    <ul className={styles.cards}>
                      {reports.map(item => (
                        <li key={String(item.id)} className={styles.card}>
                          <p className={styles.cardTitle}>{String(item.protocol)}</p>
                          <dl className={styles.facts}>
                            <div><dt>Período</dt><dd>{String(item.period_start)} a {String(item.period_end)}</dd></div>
                            <div><dt>Total</dt><dd>{money(item.amount_cents as string | number)}</dd></div>
                            <div><dt>Baixado</dt><dd>{money(item.settled_cents as string | number)}</dd></div>
                            <div><dt>Saldo</dt><dd>{money(item.remaining_cents as string | number)}</dd></div>
                          </dl>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            ) : null}

            {/* Áreas FIN-05..FIN-16: telas próprias, com layout legado nesta fatia.
                Ver pendências declaradas em docs/UX-07-FINANCEIRO-2026-10-05.md. */}
            {tab === "reconciliation" ? <div className={styles.legacy}><BankReconciliationWorkspace /></div> : null}
            {tab === "collection" ? <div className={styles.legacy}><CollectionWorkspace /></div> : null}
            {tab === "cashflow" ? <div className={styles.legacy}><CashflowWorkspace /></div> : null}
            {tab === "costs" ? <div className={styles.legacy}><CostAllocationWorkspace /></div> : null}
            {tab === "results" ? <div className={styles.legacy}><ManagementResultsWorkspace /></div> : null}
            {tab === "expenses" ? <div className={styles.legacy}><ExpenseWorkspace /></div> : null}
            {tab === "fiscal" ? <div className={styles.legacy}><FiscalWorkspace /></div> : null}
            {tab === "gateway" ? <div className={styles.legacy}><GatewayWorkspace /></div> : null}
            {tab === "budgets" ? <div className={styles.legacy}><BudgetWorkspace /></div> : null}
            {tab === "exports" ? <div className={styles.legacy}><ExportWorkspace /></div> : null}
            {tab === "closures" ? <div className={styles.legacy}><ClosureWorkspace /></div> : null}
            {tab === "commissions" ? <div className={styles.legacy}><CommissionWorkspace /></div> : null}
          </div>
        </>
      ) : null}
    </main>
  );
}

function AccountTable({ accounts, onSelect }: { accounts: Account[]; onSelect: (account: Account) => void }) {
  if (accounts.length === 0) {
    return (
      <>
        <table data-testid="finance-receivables-table" className={styles.table}>
          <caption>Contas a receber no escopo da sua sessão.</caption>
          <thead><tr><th scope="col">Protocolo</th><th scope="col">Contrato</th><th scope="col">Valor</th><th scope="col">Situação</th><th scope="col">Ação</th></tr></thead>
          <tbody><tr><td colSpan={5} data-testid="finance-receivables-empty">Nenhum recebível encontrado.</td></tr></tbody>
        </table>
      </>
    );
  }
  return (
    <div className={styles.tableWrap}>
      <table data-testid="finance-receivables-table" className={styles.table}>
        <caption>Contas a receber no escopo da sua sessão.</caption>
        <thead>
          <tr><th scope="col">Protocolo</th><th scope="col">Contrato</th><th scope="col">Valor</th><th scope="col">Situação</th><th scope="col">Ação</th></tr>
        </thead>
        <tbody>
          {accounts.map(account => (
            <tr key={account.id} onClick={() => onSelect(account)}>
              <td>{account.protocol}</td>
              <td>{account.contract_id || "Contrato ausente"}</td>
              <td>{money(account.amount_cents)}</td>
              <td>
                <UiBadge tone={accountStatusTone(account.status)} srPrefix="Situação">
                  {accountStatusLabel(account.status)}
                </UiBadge>
              </td>
              <td>
                <button type="button" onClick={event => { event.stopPropagation(); onSelect(account); }}>
                  Abrir conta {account.protocol}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentTable({ payments }: { payments: Payment[] }) {
  return (
    <div className={styles.tableWrap}>
      <table data-testid="finance-payments-table" className={styles.table}>
        <caption>Baixas e estornos registrados, na ordem em que o servidor devolveu.</caption>
        <thead>
          <tr><th scope="col">Conta</th><th scope="col">Valor</th><th scope="col">Tipo</th></tr>
        </thead>
        <tbody>
          {payments.length === 0 ? (
            <tr><td colSpan={3}>Nenhum pagamento encontrado.</td></tr>
          ) : payments.map(payment => (
            <tr key={payment.id}>
              <td>{payment.receivable_id || payment.payable_id || "Conta ausente"}</td>
              <td>{money(payment.amount_cents)}</td>
              <td>
                <UiBadge tone={payment.is_estorno ? "warning" : "success"} srPrefix="Tipo de movimento">
                  {payment.is_estorno ? "Estorno" : "Baixa"}
                </UiBadge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
