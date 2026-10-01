"use client";

// FIN-10 — despesas, reembolsos e compras.
//
// A tela nunca envia arquivo: a evidência é apenas metadado sintético local
// (`local://synthetic/...` + `synthetic/fin10/...`). Quem solicita é sempre a
// sessão autenticada e quem aprova precisa ser outra identidade com alçada
// cadastrada; o servidor e o banco recusam qualquer tentativa contrária.

import { FormEvent, useEffect, useState } from "react";

type Expense = {
  id: string; protocol: string; expense_type: string; category: string; description: string;
  amount_cents: string | number; status: string;
  requester_name: string; requester_identity: string | null;
  approver_name: string | null; approver_identity: string | null;
  approval_limit_cents: string | number | null;
  cost_center_name: string | null; supplier_name: string | null; contract_title: string | null;
  evidence_file_name: string | null; evidence_storage_key: string | null;
  rejection_reason: string | null; cancellation_reason: string | null;
};
type HistoryEntry = {
  id: string; previous_status: string | null; next_status: string; reason: string;
  authority_limit_cents: string | number | null; is_authority_verified: boolean; created_at: string;
};
type CostCenter = { id: string; name: string; is_active: boolean };
type Supplier = { id: string; name: string; is_active: boolean };
type Authority = { id: string; identity_id: string; display_name: string | null; max_amount_cents: string | number; is_active: boolean };

const EXPENSE_TYPES = [
  ["despesa", "Despesa"], ["reembolso", "Reembolso"], ["compra", "Compra"], ["outro", "Outro"],
];
const STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente", aprovado: "Aprovado", rejeitado: "Rejeitado", cancelado: "Cancelado",
};
const money = (value: string | number | null | undefined) =>
  value == null ? "Dado ausente" : `R$ ${(Number(value) / 100).toFixed(2).replace(".", ",")}`;

const emptyForm = {
  expense_type: "despesa", category: "", description: "", amount_cents: "",
  cost_center_id: "", supplier_id: "", contract_id: "", requester_name: "",
  evidence_file_name: "", evidence_file_url: "", evidence_storage_key: "", idempotency_key: "",
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return data;
}

export default function ExpenseWorkspace() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [authorities, setAuthorities] = useState<Authority[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [form, setForm] = useState(emptyForm);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice("");
    try { await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha inesperada"); }
    finally { setBusy(false); }
  };

  const load = async () => {
    const [expenseData, centerData, supplierData, authorityData] = await Promise.all([
      request("/api/fin/expenses"),
      request("/api/fin/cost-centers"),
      request("/api/fin/suppliers"),
      request("/api/fin/expense-authorities"),
    ]);
    setExpenses(expenseData.expenses || []);
    setCostCenters(centerData.costCenters || []);
    setSuppliers(supplierData.suppliers || []);
    setAuthorities(authorityData.authorities || []);
  };
  useEffect(() => { void run(load); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadHistory = async (expenseId: string) => {
    const data = await request(`/api/fin/expense-history?expense_id=${encodeURIComponent(expenseId)}`);
    setHistory(data.history || []);
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      const payload = {
        ...form,
        amount_cents: Number(form.amount_cents),
        supplier_id: form.supplier_id || null,
        contract_id: form.contract_id || null,
        idempotency_key: form.idempotency_key || null,
      };
      const data = await request("/api/fin/expenses", { method: "POST", body: JSON.stringify(payload) });
      setForm(emptyForm);
      setNotice(`Solicitação ${data.expense.protocol} criada como pendente; evidência sintética registrada sem arquivo externo`);
      await load();
    });
  };

  const select = (expenseId: string) => run(async () => {
    setSelected(expenseId); setReason("");
    await loadHistory(expenseId);
  });

  const act = (action: "aprovar" | "rejeitar" | "cancelar") => run(async () => {
    if (!selected) throw new Error("selecione_uma_solicitacao");
    const data = await request("/api/fin/expenses", { method: "PATCH", body: JSON.stringify({ id: selected, action, reason }) });
    const label = STATUS_LABELS[data.expense.status] || data.expense.status;
    setNotice(`Solicitação ${data.expense.protocol} agora está ${label.toLowerCase()} com trilha de auditoria`);
    setReason("");
    await load();
    await loadHistory(selected);
  });

  const current = expenses.find(item => item.id === selected) || null;

  return (
    <section data-testid="fin10-expenses" style={{ padding: "1rem" }}>
      <h2>Despesas, reembolsos e compras</h2>
      <p>
        Solicitar e aprovar são identidades distintas. A aprovação exige alçada cadastrada que cubra o valor e
        evidência sintética; nenhuma compra real ou integração externa é executada.
      </p>
      {error && <p role="alert" data-testid="fin10-error">{error}</p>}
      {notice && <p role="status" data-testid="fin10-notice">{notice}</p>}
      {busy && <p data-testid="fin10-loading">Carregando...</p>}

      <form onSubmit={create}>
        <h3>Nova solicitação</h3>
        <label>Tipo
          <select data-testid="fin10-type" value={form.expense_type} onChange={e => setForm({ ...form, expense_type: e.target.value })}>
            {EXPENSE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <input required data-testid="fin10-category" placeholder="Categoria" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
        <input required data-testid="fin10-description" minLength={10} maxLength={1000} placeholder="Descrição (10 a 1000 caracteres)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        <input required data-testid="fin10-amount" type="number" min="1" placeholder="Valor em centavos" value={form.amount_cents} onChange={e => setForm({ ...form, amount_cents: e.target.value })} />
        <label>Centro de custo
          <select required data-testid="fin10-cost-center" value={form.cost_center_id} onChange={e => setForm({ ...form, cost_center_id: e.target.value })}>
            <option value="">Selecione o centro de custo canônico</option>
            {costCenters.filter(item => item.is_active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>Fornecedor (obrigatório para compra)
          <select data-testid="fin10-supplier" value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
            <option value="">Sem fornecedor</option>
            {suppliers.filter(item => item.is_active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <input data-testid="fin10-contract" placeholder="ID do contrato canônico (opcional)" value={form.contract_id} onChange={e => setForm({ ...form, contract_id: e.target.value })} />
        <input required data-testid="fin10-requester-name" placeholder="Nome do solicitante" value={form.requester_name} onChange={e => setForm({ ...form, requester_name: e.target.value })} />
        <input required data-testid="fin10-evidence-name" placeholder="Nome da evidência sintética" value={form.evidence_file_name} onChange={e => setForm({ ...form, evidence_file_name: e.target.value })} />
        <input required data-testid="fin10-evidence-url" placeholder="local://synthetic/..." value={form.evidence_file_url} onChange={e => setForm({ ...form, evidence_file_url: e.target.value })} />
        <input required data-testid="fin10-evidence-key" placeholder="synthetic/fin10/..." value={form.evidence_storage_key} onChange={e => setForm({ ...form, evidence_storage_key: e.target.value })} />
        <input data-testid="fin10-idempotency" placeholder="Chave de idempotência (opcional, 10 a 200)" value={form.idempotency_key} onChange={e => setForm({ ...form, idempotency_key: e.target.value })} />
        <button data-testid="fin10-create" disabled={busy}>Criar solicitação</button>
      </form>

      <h3>Alçadas cadastradas</h3>
      <ul data-testid="fin10-authorities">
        {authorities.length === 0
          ? <li data-testid="fin10-authorities-empty">Nenhuma alçada cadastrada; nenhuma despesa pode ser aprovada.</li>
          : authorities.map(item => (
            <li key={item.id}>
              {item.display_name || item.identity_id} · limite {money(item.max_amount_cents)} · {item.is_active ? "ativa" : "inativa"}
            </li>
          ))}
      </ul>

      <h3>Solicitações</h3>
      <table data-testid="fin10-list">
        <thead><tr><th>Protocolo</th><th>Tipo</th><th>Valor</th><th>Centro de custo</th><th>Status</th><th>Ação</th></tr></thead>
        <tbody>
          {expenses.length === 0
            ? <tr><td colSpan={6} data-testid="fin10-empty">Nenhuma solicitação registrada.</td></tr>
            : expenses.map(item => (
              <tr key={item.id} data-testid={`fin10-row-${item.id}`}>
                <td>{item.protocol}</td>
                <td>{item.expense_type}</td>
                <td>{money(item.amount_cents)}</td>
                <td>{item.cost_center_name || "Centro de custo ausente"}</td>
                <td>{STATUS_LABELS[item.status] || item.status}</td>
                <td><button type="button" data-testid={`fin10-select-${item.id}`} onClick={() => select(item.id)}>Abrir</button></td>
              </tr>
            ))}
        </tbody>
      </table>

      {current && (
        <div data-testid="fin10-detail">
          <h3>{current.protocol}</h3>
          <p data-testid="fin10-detail-summary">
            {current.description} · {money(current.amount_cents)} · solicitado por {current.requester_name} ·
            status {STATUS_LABELS[current.status] || current.status} ·
            evidência {current.evidence_storage_key || "ausente"} ·
            alçada aplicada {current.approval_limit_cents == null ? "não aplicada" : money(current.approval_limit_cents)}
          </p>
          <input data-testid="fin10-reason" minLength={10} maxLength={1000} placeholder="Justificativa (10 a 1000 caracteres)" value={reason} onChange={e => setReason(e.target.value)} />
          <button type="button" data-testid="fin10-approve" disabled={busy || current.status !== "pendente"} onClick={() => act("aprovar")}>Aprovar</button>
          <button type="button" data-testid="fin10-reject" disabled={busy || current.status !== "pendente"} onClick={() => act("rejeitar")}>Rejeitar</button>
          <button type="button" data-testid="fin10-cancel" disabled={busy || current.status !== "pendente"} onClick={() => act("cancelar")}>Cancelar</button>
          <ul data-testid="fin10-history">
            {history.length === 0
              ? <li>Histórico ainda não carregado.</li>
              : history.map(entry => (
                <li key={entry.id}>
                  {entry.previous_status || "criação"} → {entry.next_status} · {entry.reason} ·
                  alçada {entry.is_authority_verified ? money(entry.authority_limit_cents) : "não verificada"}
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
