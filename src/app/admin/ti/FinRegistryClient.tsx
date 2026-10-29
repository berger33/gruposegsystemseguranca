"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import UiState from "@/components/ui/UiState";
import styles from "./FinRegistryClient.module.css";

// UX-PRO-03 — 8ª aba com prova do console de TI, escopo de LACUNA da família
// financeiro. `/admin/financeiro` é a rota dona das escritas de contas, baixa,
// orçamento, conciliação, fiscal e gateway (13 workspaces). Esta tela cobre
// apenas o que não existia em nenhuma superfície: cadastro de fornecedores,
// cadastro de centros de custo e o drill-down do histórico de baixa.
// A leitura de contas a receber/pagar existe SÓ para escolher a conta do
// histórico; nenhuma escrita daqueles recursos volta para cá.

const ENDPOINTS = {
  suppliers: "/api/fin/suppliers",
  costCenters: "/api/fin/cost-centers",
  receivables: "/api/fin/receivables",
  payables: "/api/fin/payables",
  paymentHistory: "/api/fin/payment-history",
} as const;

type Row = Record<string, unknown>;
type ReadState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "empty" }
  | { kind: "error"; detail: string }
  | { kind: "denied" };

// Motivos devolvidos pelo servidor (`fin-api.mjs`) traduzidos para o operador.
// Um código novo cai no fallback genérico — nunca em "nenhum registro".
const ERROR_LABELS: Record<string, string> = {
  unauthorized: "A sessão de equipe expirou. Entre novamente para continuar.",
  forbidden: "Seu papel não tem permissão para este cadastro financeiro.",
  origin_forbidden: "A requisição veio de outra origem. Recarregue a página e tente de novo.",
  employee_permission_required: "A borda legada de RH negou a requisição; use o alias canônico do financeiro.",
  name_3_200: "O nome precisa ter entre 3 e 200 caracteres.",
  duplicate_name: "Já existe um registro com este nome neste cadastro.",
  missing_fields: "Preencha os campos obrigatórios antes de enviar.",
  method_not_allowed: "O servidor não aceita este método para o recurso.",
  missing_id: "Escolha uma conta (receber ou pagar) antes de consultar o histórico.",
  receivable_not_found: "A conta a receber informada não foi encontrada.",
  payable_not_found: "A conta a pagar informada não foi encontrada.",
  payment_not_found: "O pagamento de origem do estorno não foi encontrado.",
  overpayment: "O valor excede o saldo em aberto da conta.",
  estorno_requires_previous: "O estorno precisa apontar o pagamento de origem.",
  estorno_account_mismatch: "O estorno só vale para a mesma conta do pagamento de origem.",
  estorno_amount_exceeds_origin: "O estorno não pode ser maior que o pagamento original.",
  estorno_already_exists: "Este pagamento já foi estornado.",
  missing_receivable_id: "Informe a conta a receber.",
  missing_payable_id: "Informe a conta a pagar.",
  reason_10_1000_required: "A baixa exige motivo entre 10 e 1000 caracteres.",
  duplicate_storage_key: "Já existe um anexo com esta referência de armazenamento.",
  audit_unavailable: "A auditoria transacional está indisponível; nada foi gravado.",
  legacy_finance_settlement_write_retired: "A escrita de baixa foi retirada do alias legado; use /admin/financeiro.",
  not_found: "O registro não foi localizado. Atualize a leitura.",
  internal: "O servidor não conseguiu concluir a operação. Confira os dados e tente novamente.",
};

function translate(code: unknown, status?: number) {
  const key = typeof code === "string" ? code : "";
  if (ERROR_LABELS[key]) return ERROR_LABELS[key];
  if (status === 401) return ERROR_LABELS.unauthorized;
  if (status === 403) return ERROR_LABELS.forbidden;
  return "Não foi possível concluir a operação. Confira os dados e tente novamente.";
}

/** Payload só é aceito quando é, de fato, uma lista de objetos. */
function records(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Row => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

const s = (value: unknown) => (typeof value === "string" ? value : "");
const n = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const b = (value: unknown) => value === true;

function money(cents: unknown) {
  return n(cents).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function day(value: unknown) {
  const raw = s(value);
  if (!raw) return "não informada";
  const parsed = new Date(`${raw.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.valueOf()) ? "data indisponível" : parsed.toLocaleDateString("pt-BR");
}

function stamp(value: unknown) {
  const raw = s(value);
  if (!raw) return "sem registro";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.valueOf()) ? "data indisponível" : parsed.toLocaleString("pt-BR");
}

function latest(values: unknown[]) {
  const stamps = values.map(value => new Date(s(value)).valueOf()).filter(Number.isFinite);
  if (!stamps.length) return "sem registro";
  return new Date(Math.max(...stamps)).toLocaleString("pt-BR");
}

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: "include", cache: "no-store", ...init });
  const data = (await response.json().catch(() => ({}))) as Row;
  return { response, data };
}

export default function FinRegistryClient() {
  const fieldId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [readState, setReadState] = useState<ReadState>({ kind: "loading" });
  const [suppliers, setSuppliers] = useState<Row[]>([]);
  const [costCenters, setCostCenters] = useState<Row[]>([]);
  const [receivables, setReceivables] = useState<Row[]>([]);
  const [payables, setPayables] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [operationError, setOperationError] = useState("");

  const [historyState, setHistoryState] = useState<ReadState>({ kind: "ready" });
  const [history, setHistory] = useState<Row[]>([]);
  const [historyFor, setHistoryFor] = useState("");

  const [supplierForm, setSupplierForm] = useState({ name: "", document_ref: "", category: "servico" });
  const [centerForm, setCenterForm] = useState({ name: "", description: "" });
  const [historyForm, setHistoryForm] = useState({ account_type: "receber", account_id: "" });

  const sequence = useRef(0);
  const historySequence = useRef(0);
  const operation = useRef(false);

  const clear = useCallback(() => {
    setSuppliers([]); setCostCenters([]); setReceivables([]); setPayables([]);
    setHistory([]); setHistoryFor(""); setHistoryState({ kind: "ready" });
  }, []);

  // `clearFeedback=false` sobrevive ao reload interno pós-mutação: a mensagem
  // de sucesso não pode desaparecer antes de o operador lê-la. O botão
  // "Tentar novamente" continua limpando.
  const load = useCallback(async (clearFeedback = true) => {
    const current = ++sequence.current;
    if (clearFeedback) { setMessage(""); setOperationError(""); }
    setReadState({ kind: "loading" });
    try {
      const [sup, cc, rec, pay] = await Promise.all([
        requestJson(ENDPOINTS.suppliers),
        requestJson(ENDPOINTS.costCenters),
        requestJson(ENDPOINTS.receivables),
        requestJson(ENDPOINTS.payables),
      ]);
      if (current !== sequence.current) return;
      const all = [sup, cc, rec, pay];
      if (all.some(item => item.response.status === 401 || item.response.status === 403)) {
        clear(); setReadState({ kind: "denied" }); return;
      }
      const failed = all.find(item => !item.response.ok);
      if (failed) {
        clear();
        setReadState({ kind: "error", detail: translate(failed.data.error, failed.response.status) });
        return;
      }
      const nextSuppliers = records(sup.data.suppliers);
      const nextCenters = records(cc.data.costCenters);
      setSuppliers(nextSuppliers);
      setCostCenters(nextCenters);
      setReceivables(records(rec.data.receivables));
      setPayables(records(pay.data.payables));
      setReadState(nextSuppliers.length === 0 && nextCenters.length === 0 ? { kind: "empty" } : { kind: "ready" });
    } catch (error) {
      if (current !== sequence.current) return;
      clear();
      setReadState({
        kind: "error",
        detail: error instanceof Error && error.message
          ? `Falha de rede ao consultar os cadastros financeiros (${error.message}). Tente novamente.`
          : "Falha de rede ao consultar os cadastros financeiros. Verifique a conexão e tente novamente.",
      });
    }
  }, [clear]);

  useEffect(() => { void load(); }, [load]);

  const openHistory = useCallback(async (accountType: string, accountId: string, clearFeedback = true) => {
    const current = ++historySequence.current;
    setHistoryFor(accountId);
    setHistoryState({ kind: "loading" });
    if (clearFeedback) { setMessage(""); setOperationError(""); }
    if (!accountId) { setHistory([]); setHistoryState({ kind: "empty" }); return; }
    const parameter = accountType === "pagar" ? "payable_id" : "receivable_id";
    try {
      const result = await requestJson(`${ENDPOINTS.paymentHistory}?${parameter}=${encodeURIComponent(accountId)}`);
      if (current !== historySequence.current) return;
      if (result.response.status === 401 || result.response.status === 403) {
        setHistory([]); setHistoryState({ kind: "denied" }); return;
      }
      if (!result.response.ok) {
        setHistory([]);
        setHistoryState({ kind: "error", detail: translate(result.data.error, result.response.status) });
        return;
      }
      const rows = records(result.data.history);
      setHistory(rows);
      setHistoryState({ kind: rows.length === 0 ? "empty" : "ready" });
    } catch (error) {
      if (current !== historySequence.current) return;
      setHistory([]);
      setHistoryState({
        kind: "error",
        detail: error instanceof Error && error.message
          ? `Falha de rede ao consultar o histórico (${error.message}). Tente novamente.`
          : "Falha de rede ao consultar o histórico de baixa. Tente novamente.",
      });
    }
  }, []);

  const send = useCallback(async (path: string, body: Row, successMessage: string) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setMessage("");
    setOperationError("");
    try {
      const { response, data } = await requestJson(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: window.location.origin },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setOperationError(translate(data.error, response.status));
        return;
      }
      setMessage(successMessage);
      // Recarrega a leitura preservando o aviso de sucesso.
      await load(false);
    } catch (error) {
      setOperationError(error instanceof Error && error.message
        ? `Falha de rede ao gravar (${error.message}). O registro pode não ter sido criado.`
        : "Falha de rede ao gravar. O registro pode não ter sido criado.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }, [load]);

  async function createSupplier() {
    await send(ENDPOINTS.suppliers, {
      name: supplierForm.name.trim(),
      document_ref: supplierForm.document_ref.trim() || null,
      category: supplierForm.category,
    }, `Fornecedor “${supplierForm.name.trim()}” criado no cadastro financeiro.`);
  }

  async function createCostCenter() {
    await send(ENDPOINTS.costCenters, {
      name: centerForm.name.trim(),
      description: centerForm.description.trim() || null,
    }, `Centro de custo “${centerForm.name.trim()}” criado no cadastro financeiro.`);
  }

  const accounts = historyForm.account_type === "pagar"
    ? payables.map(row => ({ id: s(row.id), label: `${s(row.protocol)} · ${s(row.category)} · ${money(row.amount_cents)} venc. ${day(row.due_date)}` }))
    : receivables.map(row => ({ id: s(row.id), label: `${s(row.protocol)} · ${s(row.status)} · ${money(row.amount_cents)} venc. ${day(row.due_date)}` }));
  const openedAccount = historyForm.account_type === "pagar"
    ? payables.find(row => s(row.id) === historyFor) ?? null
    : receivables.find(row => s(row.id) === historyFor) ?? null;

  const feedback = readState.kind === "loading"
    ? <UiState variant="loading" title="Carregando os cadastros financeiros" detail="Consultando fornecedores, centros de custo e as contas usadas para o histórico de baixa." />
    : readState.kind === "denied"
      ? <UiState variant="denied" title="Acesso não autorizado" detail="Estes cadastros exigem papel admin, ti ou financeiro, decidido no servidor. Nenhum dado foi exposto." onRetry={() => load()} retryLabel="Tentar novamente" />
      : readState.kind === "error"
        ? <UiState variant="error" title="Falha na consulta" detail={readState.detail} onRetry={() => load()} retryLabel="Tentar novamente" />
        : null;

  return (
    <section className={styles.workspace} aria-busy={busy || readState.kind === "loading"}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>FIN · Cadastros de apoio</p>
          <h2>Fornecedores, centros de custo e histórico de baixa</h2>
          <p>Esta aba cobre apenas a lacuna que nenhuma tela viva atendia. A escrita de contas a receber e a pagar, baixa, recorrência, orçamento, conciliação, fiscal e gateway continua em <a href="/admin/financeiro">/admin/financeiro</a>.</p>
          <p className={styles.source}>
            Fonte: tabelas <code>fin_suppliers</code>, <code>fin_cost_centers</code> e <code>fin_payment_history</code>
            {" "}(contas lidas de <code>fin_accounts_receivable</code> e <code>fin_accounts_payable</code>).
            {" "}Data-base: fornecedor mais recente em <strong>{latest(suppliers.map(row => row.created_at))}</strong>;
            {" "}centro de custo mais recente em <strong>{latest(costCenters.map(row => row.created_at))}</strong>;
            {" "}última baixa lida em <strong>{latest(history.map(row => row.created_at))}</strong>.
          </p>
        </div>
        <button type="button" onClick={() => load()} disabled={busy || readState.kind === "loading"}>Atualizar leitura</button>
      </header>

      <aside className={styles.notice} aria-label="Limites desta superfície">
        <strong>O que esta tela faz — e o que ela não faz.</strong>
        <p>Ela cadastra <em>fornecedores</em> e <em>centros de custo</em> e mostra o <em>histórico imutável de baixa</em> de uma conta. Não cria conta, não baixa, não estorna e não renegocia: essas operações ficam em <a href="/admin/financeiro">/admin/financeiro</a>, para não haver dois caminhos de escrita sobre o mesmo dado.</p>
        <p><strong>Sem upload:</strong> não há armazenamento de arquivos nesta instalação; nenhum byte de documento fiscal é enviado por esta tela.</p>
        <p><strong>Sem provedores:</strong> não há SMTP, gateway de pagamento nem emissor fiscal reais ligados — os cadastros são dados declarativos do banco desta instalação.</p>
        <p><strong>Produção: NO-GO</strong> — <code>docs/PRODUCAO-GATE.md</code> mantém 10 itens em aberto e o aceite humano segue <strong>0/222</strong>.</p>
      </aside>

      {feedback}
      {message && <p role="status" className={styles.success}>{message}</p>}
      {operationError && <p role="alert" className={styles.error}>{operationError}</p>}

      {readState.kind !== "loading" && readState.kind !== "denied" && readState.kind !== "error" && <>
        {readState.kind === "empty" && <UiState variant="empty" title="Nenhum cadastro ainda" detail="Não há fornecedor nem centro de custo nesta instalação. Os formulários abaixo criam o primeiro registro." onRetry={() => load()} retryLabel="Atualizar" />}

        <section className={styles.panel} aria-labelledby="fin-cadastros-suppliers-title">
          <div className={styles.sectionHeading}>
            <div>
              <h3 id="fin-cadastros-suppliers-title">Fornecedores ({suppliers.length})</h3>
              <p>Cadastro de apoio usado pelas contas a pagar. Nome único, documento declarado e categoria.</p>
            </div>
            <span className={styles.count}>{suppliers.length} registro(s)</span>
          </div>
          <ul className={styles.recordList}>
            {suppliers.map(row => <li key={s(row.id)}>
              <strong>{s(row.name)}</strong>
              <span>categoria {s(row.category)} · documento {s(row.document_ref) || "não informado"} · {b(row.is_active) ? "ativo" : "inativo"}</span>
              <span>criado em {stamp(row.created_at)} · id {s(row.id)}</span>
              <details className={styles.subsection}>
                <summary>Registro canônico do fornecedor (JSON)</summary>
                <pre className={styles.pre}>{JSON.stringify(row, null, 2)}</pre>
              </details>
            </li>)}
          </ul>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label htmlFor={`${fieldId}-supplier-name`}>Nome do fornecedor</label>
              <input id={`${fieldId}-supplier-name`} value={supplierForm.name} aria-describedby={`${fieldId}-supplier-name-help`}
                onChange={event => setSupplierForm({ ...supplierForm, name: event.target.value })} />
              <small id={`${fieldId}-supplier-name-help`}>Entre 3 e 200 caracteres. O servidor recusa nome repetido.</small>
            </div>
            <div className={styles.field}>
              <label htmlFor={`${fieldId}-supplier-document`}>Documento declarado (opcional)</label>
              <input id={`${fieldId}-supplier-document`} value={supplierForm.document_ref} aria-describedby={`${fieldId}-supplier-document-help`}
                onChange={event => setSupplierForm({ ...supplierForm, document_ref: event.target.value })} />
              <small id={`${fieldId}-supplier-document-help`}>Referência textual; esta tela não valida CNPJ nem consulta receita.</small>
            </div>
            <div className={styles.field}>
              <label htmlFor={`${fieldId}-supplier-category`}>Categoria do fornecedor</label>
              <select id={`${fieldId}-supplier-category`} value={supplierForm.category}
                onChange={event => setSupplierForm({ ...supplierForm, category: event.target.value })}>
                <option value="servico">serviço</option>
                <option value="material">material</option>
                <option value="equipamento">equipamento</option>
                <option value="outro">outro</option>
              </select>
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.primary} disabled={busy} onClick={() => createSupplier()}>Cadastrar fornecedor</button>
            </div>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="fin-cadastros-centers-title">
          <div className={styles.sectionHeading}>
            <div>
              <h3 id="fin-cadastros-centers-title">Centros de custo ({costCenters.length})</h3>
              <p>Rateio declarativo das despesas. A alocação por contrato é feita em <code>/admin/financeiro</code>.</p>
            </div>
            <span className={styles.count}>{costCenters.length} registro(s)</span>
          </div>
          <ul className={styles.recordList}>
            {costCenters.map(row => <li key={s(row.id)}>
              <strong>{s(row.name)}</strong>
              <span>{s(row.description) || "sem descrição"}</span>
              <span>criado em {stamp(row.created_at)} · id {s(row.id)}</span>
              <details className={styles.subsection}>
                <summary>Registro canônico do centro de custo (JSON)</summary>
                <pre className={styles.pre}>{JSON.stringify(row, null, 2)}</pre>
              </details>
            </li>)}
          </ul>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label htmlFor={`${fieldId}-center-name`}>Nome do centro de custo</label>
              <input id={`${fieldId}-center-name`} value={centerForm.name} aria-describedby={`${fieldId}-center-name-help`}
                onChange={event => setCenterForm({ ...centerForm, name: event.target.value })} />
              <small id={`${fieldId}-center-name-help`}>Entre 3 e 200 caracteres. O nome é único neste cadastro.</small>
            </div>
            <div className={styles.field}>
              <label htmlFor={`${fieldId}-center-description`}>Descrição (opcional)</label>
              <input id={`${fieldId}-center-description`} value={centerForm.description}
                onChange={event => setCenterForm({ ...centerForm, description: event.target.value })} />
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.primary} disabled={busy} onClick={() => createCostCenter()}>Cadastrar centro de custo</button>
            </div>
          </div>
        </section>

        <section className={styles.panel} aria-labelledby="fin-cadastros-history-title">
          <div className={styles.sectionHeading}>
            <div>
              <h3 id="fin-cadastros-history-title">Histórico de baixa ({history.length})</h3>
              <p>Trilha imutável de cada baixa: estado anterior e seguinte, saldo anterior e seguinte, motivo declarado e autor. A baixa em si continua em <code>/admin/financeiro</code>.</p>
            </div>
            <span className={styles.count}>{history.length} registro(s)</span>
          </div>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label htmlFor={`${fieldId}-history-type`}>Tipo de conta</label>
              <select id={`${fieldId}-history-type`} value={historyForm.account_type} aria-describedby={`${fieldId}-history-type-help`}
                onChange={event => {
                  setHistoryForm({ account_type: event.target.value, account_id: "" });
                  setHistory([]); setHistoryFor(""); setHistoryState({ kind: "ready" });
                }}>
                <option value="receber">conta a receber</option>
                <option value="pagar">conta a pagar</option>
              </select>
              <small id={`${fieldId}-history-type-help`}>A lista abaixo é somente leitura; a escrita da conta fica em /admin/financeiro.</small>
            </div>
            <div className={styles.field}>
              <label htmlFor={`${fieldId}-history-account`}>Conta para consultar</label>
              <select id={`${fieldId}-history-account`} value={historyForm.account_id} aria-describedby={`${fieldId}-history-account-help`}
                onChange={event => {
                  setHistoryForm({ ...historyForm, account_id: event.target.value });
                  void openHistory(historyForm.account_type, event.target.value);
                }}>
                <option value="">selecione uma conta</option>
                {accounts.map(account => <option key={account.id} value={account.id}>{account.label}</option>)}
              </select>
              <small id={`${fieldId}-history-account-help`}>{accounts.length} conta(s) nesta instalação. Sem conta, o histórico não é consultado.</small>
            </div>
            <div className={styles.actions}>
              <button type="button" disabled={busy || !historyForm.account_id}
                onClick={() => openHistory(historyForm.account_type, historyForm.account_id)}>Consultar histórico da baixa</button>
            </div>
          </div>

          {historyState.kind === "loading" && <UiState variant="loading" title="Consultando o histórico de baixa" detail="Lendo a trilha imutável da conta selecionada." />}
          {historyState.kind === "denied" && <UiState variant="denied" title="Acesso negado ao histórico" detail="O servidor negou a leitura desta conta. Nenhum registro foi exposto." onRetry={() => openHistory(historyForm.account_type, historyFor)} retryLabel="Tentar novamente" />}
          {historyState.kind === "error" && <UiState variant="error" title="Falha ao ler o histórico" detail={historyState.detail} onRetry={() => openHistory(historyForm.account_type, historyFor)} retryLabel="Tentar novamente" />}
          {historyState.kind === "empty" && <UiState variant="empty" title="Sem baixa registrada" detail={historyFor ? "Esta conta não tem nenhuma baixa registrada." : "Escolha uma conta para consultar o histórico."} onRetry={() => openHistory(historyForm.account_type, historyFor)} retryLabel="Atualizar" />}

          {openedAccount && <p className={styles.note}>
            Conta aberta: <strong>{s(openedAccount.protocol)}</strong> · vencimento {day(openedAccount.due_date)} ·
            {" "}valor {money(openedAccount.amount_cents)} · pago {money(openedAccount.amount_paid_cents)} ·
            {" "}situação {s(openedAccount.status)}
          </p>}

          {history.length > 0 && <ul className={styles.recordList}>
            {history.map(row => <li key={s(row.id)}>
              <strong>{s(row.previous_status) || "novo"} → {s(row.next_status)}</strong>
              <span>saldo {money(row.previous_paid_cents)} → {money(row.next_paid_cents)} · motivo {s(row.reason) || "não informado"}</span>
              <span>{b(row.is_estorno) ? "estorno" : b(row.is_renegociacao) ? "renegociação" : "baixa"} em {stamp(row.created_at)}</span>
              <details className={styles.subsection}>
                <summary>Registro canônico da baixa (JSON)</summary>
                <pre className={styles.pre}>{JSON.stringify(row, null, 2)}</pre>
              </details>
            </li>)}
          </ul>}
        </section>
      </>}
    </section>
  );
}
