// L07 (fatia 1 — fundação do gate) — financeiro: contas a receber/pagar,
// geração recorrente idempotente e baixa parcial/estorno auditada via HTTP
// real e PostgreSQL descartável. Os aliases históricos /api/hr/fin-* existem
// mas passam pela borda de RH; o gate usa somente os caminhos canônicos
// /api/fin/* — a correção da borda para os aliases é fatia posterior.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { provisionAndLoginStaff } from "./helpers/staff-login.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, "..");
let server, pool, baseUrl, workDir;
const uuid = () => randomUUID();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForServer() {
  for (let i = 0; i < 180; i++) {
    try { const r = await fetch(`${baseUrl}/api/admin/session`); if ([200, 401].includes(r.status)) return; } catch {}
    await sleep(250);
  }
  throw new Error("server_did_not_start");
}
async function api(pathname, { method = "GET", body, cookie, origin = baseUrl, sendOrigin = true } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...(sendOrigin ? { origin } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await response.text();
  let parsed; try { parsed = JSON.parse(raw); } catch { parsed = raw; }
  if (response.status >= 500) console.error("HTTP_5XX", method, pathname, JSON.stringify(parsed));
  return { status: response.status, body: parsed, setCookie: response.headers.getSetCookie?.() || [] };
}
const fin = (path, options) => api(`/api/fin${path}`, options);

// Espaço canônico do cliente (L05): conta + contrato do portal. O financeiro
// não cria entidade paralela — referencia as canônicas.
async function insertClientSpace(label) {
  const accountId = uuid();
  await pool.query("INSERT INTO client_accounts (id,display_name,status,created_by) VALUES ($1,$2,'active','marcelo')", [accountId, `QA L07 Conta ${label}`]);
  const contractId = uuid();
  await pool.query("INSERT INTO client_contracts (id,client_account_id,title,service,status,created_by) VALUES ($1,$2,$3,'Vigilância','active','marcelo')", [contractId, accountId, `QA L07 Contrato ${label}`]);
  return { accountId, contractId };
}

before(async () => {
  if (!RUN) return;
  workDir = await mkdtemp(path.join(tmpdir(), "seg-l07-"));
  const port = 5500 + Math.floor(Math.random() * 250);
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server.mjs", "--dev"], {
    cwd: root,
    env: {
      ...process.env, PORT: String(port), BIND_HOST: "127.0.0.1", NODE_ENV: "development",
      NEXT_DIST_DIR: ".next/integration-l07", SITE_ADMIN_SESSION_SECRET: `${uuid()}${uuid()}`,
      EMPLOYEE_SESSION_SECRET: `${uuid()}${uuid()}`, ADMIN_LOGIN_MAX_ATTEMPTS: "100",
      OLLAMA_ENABLED: "false", MAIL_HOST: "", CLIENT_DOCS_DIR: path.join(workDir, "private"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", chunk => { process.stderr.write(chunk); });
  server.stdout.on("data", chunk => { process.stdout.write(chunk); });
  await waitForServer();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
});
after(async () => {
  await pool?.end().catch(() => {});
  if (server && !server.killed) { server.kill("SIGTERM"); await sleep(250); server.kill("SIGKILL"); }
  if (workDir) await rm(workDir, { recursive: true, force: true });
});

test("L07 Fatia 1: FIN-01 recebível por contrato com trilha e FIN-02 pagável com aprovação; negativos padrão", { skip: !RUN, timeout: 120_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role: "financeiro" });
  const rh = await provisionAndLoginStaff(pool, api, { role: "rh" });
  const { accountId, contractId } = await insertClientSpace("A");

  // 1. Anônimo é negado (fail-closed) em leitura e escrita.
  assert.equal((await fin("/receivables")).status, 401, "anonymous receivable read denied");
  assert.equal((await fin("/payables", { method: "POST", body: { competence_date: "2026-10-01", due_date: "2026-10-10", amount_cents: 1000 } })).status, 401, "anonymous payable create denied");

  // 2. Papel indevido (rh não é papel financeiro) é negado em leitura e escrita.
  assert.equal((await fin("/payables", { cookie: rh.cookie })).status, 403, "rh cannot read payables");
  assert.equal((await fin("/receivables", { method: "POST", cookie: rh.cookie, body: { client_account_id: accountId, competence_date: "2026-10-01", due_date: "2026-10-10", amount_cents: 1000 } })).status, 403, "rh cannot create receivable");

  // 3. same-origin: mutação com Origin estranho é negada antes de qualquer escrita.
  assert.equal((await fin("/suppliers", { method: "POST", cookie: financeiro.cookie, origin: "https://externo.example", body: { name: "Fornecedor Forjado L07" } })).status, 403, "cross-origin supplier create denied");

  // 4. Fornecedor e centro de custo canônicos (FIN-02).
  const supplier = await fin("/suppliers", { method: "POST", cookie: financeiro.cookie, body: { name: `Fornecedor QA L07 ${uuid().slice(0, 8)}`, document_ref: "12345678901234", category: "servico" } });
  assert.equal(supplier.status, 201, "supplier created");
  const duplicateSupplier = await fin("/suppliers", { method: "POST", cookie: financeiro.cookie, body: { name: supplier.body.supplier.name } });
  assert.equal(duplicateSupplier.status, 409, "duplicate supplier name rejected");
  const costCenter = await fin("/cost-centers", { method: "POST", cookie: financeiro.cookie, body: { name: `Centro QA L07 ${uuid().slice(0, 8)}`, description: "Centro de custo sintético do gate L07" } });
  assert.equal(costCenter.status, 201, "cost center created");

  // 5. FIN-01: recebível vinculado a contrato/competência/vencimento com trilha inicial.
  const receivable = await fin("/receivables", { method: "POST", cookie: financeiro.cookie, body: { client_account_id: accountId, contract_id: contractId, competence_date: "2026-10-01", due_date: "2026-10-10", amount_cents: 250000, description: "Mensalidade sintética QA L07 fatia 1" } });
  assert.equal(receivable.status, 201, "receivable created");
  assert.match(receivable.body.receivable.protocol, /^REC-FIN-\d{8}-[A-Z0-9]{4}$/, "receivable protocol format");
  assert.equal(receivable.body.receivable.contract_id, contractId, "receivable linked to contract");
  assert.equal(Number(receivable.body.receivable.amount_remaining_cents), 250000, "remaining equals amount on creation");  assert.equal(receivable.body.receivable.status, "pendente", "initial status");
  const initialHistory = await pool.query("SELECT reason FROM fin_payment_history WHERE receivable_id=$1 ORDER BY created_at ASC", [receivable.body.receivable.id]);
  assert.equal(initialHistory.rows.length, 1, "one initial history row");
  assert.equal(initialHistory.rows[0].reason, "Criação inicial", "initial history reason");
  const auditRows = await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action='fin_receivable_create' AND target=$1", [receivable.body.receivable.id]);
  assert.equal(auditRows.rows[0].n, 1, "audit row for receivable create");

  // 6. Validações FIN-01: campos obrigatórios e vencimento anterior à competência.
  assert.equal((await fin("/receivables", { method: "POST", cookie: financeiro.cookie, body: { client_account_id: accountId } })).status, 400, "missing fields rejected");
  assert.equal((await fin("/receivables", { method: "POST", cookie: financeiro.cookie, body: { client_account_id: accountId, competence_date: "2026-10-10", due_date: "2026-10-01", amount_cents: 1000 } })).status, 400, "due before competence rejected");

  // 7. Leitura por contrato (FIN-01) com o papel financeiro.
  const listing = await fin(`/receivables?contract_id=${contractId}`, { cookie: financeiro.cookie });
  assert.equal(listing.status, 200, "receivable listing");
  assert.ok(listing.body.receivables.some(r => r.id === receivable.body.receivable.id), "created receivable is listed");

  // 8. FIN-02: pagável com fornecedor/categoria/centro de custo e aprovação auditada.
  const payable = await fin("/payables", { method: "POST", cookie: financeiro.cookie, body: { supplier_id: supplier.body.supplier.id, cost_center_id: costCenter.body.costCenter.id, category: "servico", competence_date: "2026-10-01", due_date: "2026-10-15", amount_cents: 90000, description: "Nota sintética de serviço QA L07" } });
  assert.equal(payable.status, 201, "payable created");
  assert.match(payable.body.payable.protocol, /^PAG-FIN-\d{8}-[A-Z0-9]{4}$/, "payable protocol format");
  assert.equal(payable.body.payable.approval_status, "pendente", "payable starts pending approval");
  assert.equal((await fin("/payables", { method: "PATCH", cookie: financeiro.cookie, body: { id: payable.body.payable.id, approval_status: "aprovado", reason: "curta" } })).status, 400, "approval requires documented reason");
  const approved = await fin("/payables", { method: "PATCH", cookie: financeiro.cookie, body: { id: payable.body.payable.id, approval_status: "aprovado", reason: "Aprovação sintética do gate L07 fatia 1" } });
  assert.equal(approved.status, 200, "payable approved");
  assert.equal(approved.body.payable.approval_status, "aprovado", "approval status persisted");
  const approvalRow = await pool.query("SELECT approved_by_identity, approved_at FROM fin_accounts_payable WHERE id=$1", [payable.body.payable.id]);
  assert.equal(approvalRow.rows[0].approved_by_identity, financeiro.id, "approver identity recorded");
  assert.ok(approvalRow.rows[0].approved_at, "approval timestamp recorded");
  const approvalAudit = await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action='fin_payable_approve' AND target=$1", [payable.body.payable.id]);
  assert.equal(approvalAudit.rows[0].n, 1, "audit row for payable approval");
});

test("L07 Fatia 1: FIN-03 regra aprovada gera cobrança idempotente por competência", { skip: !RUN, timeout: 120_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role: "financeiro" });
  const { accountId, contractId } = await insertClientSpace("B");

  // 1. Regra de recorrência com reajuste documentado.
  const rule = await fin("/recurrence-rules", { method: "POST", cookie: financeiro.cookie, body: { contract_id: contractId, recurrence_type: "mensal", start_date: "2026-01-01", amount_cents: 100000, recurrence_id: `QA-L07-R${uuid().slice(0, 6)}`, reajuste_enabled: true, reajuste_percent: 10, reajuste_rule: "Reajuste sintético de 10% no gate L07" } });
  assert.equal(rule.status, 201, "recurrence rule created");
  assert.equal(rule.body.rule.is_approved, false, "rule starts unapproved");

  // 2. Geração antes da aprovação é negada (FIN-03: regras aprovadas).
  const beforeApproval = await fin("/generate-recurring", { method: "POST", cookie: financeiro.cookie, body: { recurrence_rule_id: rule.body.rule.id, competence_date: "2026-10-01", due_date: "2026-10-10", client_account_id: accountId } });
  assert.equal(beforeApproval.status, 400, "generation before approval denied");
  assert.equal(beforeApproval.body.error, "rule_not_approved", "rule_not_approved error");

  // 3. Aprovação pela interface de API e geração com reajuste aplicado.
  const approved = await fin("/recurrence-rules", { method: "PATCH", cookie: financeiro.cookie, body: { id: rule.body.rule.id, is_approved: true } });
  assert.equal(approved.status, 200, "rule approved");
  const generated = await fin("/generate-recurring", { method: "POST", cookie: financeiro.cookie, body: { recurrence_rule_id: rule.body.rule.id, competence_date: "2026-10-01", due_date: "2026-10-10", client_account_id: accountId } });
  assert.equal(generated.status, 201, "recurring charge generated");
  assert.equal(Number(generated.body.receivable.amount_cents), 110000, "reajuste 10% applied (100000 -> 110000)");
  assert.equal(generated.body.receivable.is_recurring, true, "generated receivable is recurring");
  assert.equal(generated.body.receivable.contract_id, contractId, "generated receivable linked to contract");
  const ruleState = await pool.query("SELECT last_generated_competence::text AS competence, approved_by_identity FROM fin_recurrence_rules WHERE id=$1", [rule.body.rule.id]);
  assert.equal(ruleState.rows[0].competence, "2026-10-01", "rule records last generated competence");
  assert.equal(ruleState.rows[0].approved_by_identity, financeiro.id, "rule approver recorded");

  // 4. Idempotência: mesma competência não duplica (FIN-03).
  const regenerated = await fin("/generate-recurring", { method: "POST", cookie: financeiro.cookie, body: { recurrence_rule_id: rule.body.rule.id, competence_date: "2026-10-01", due_date: "2026-10-10", client_account_id: accountId } });
  assert.equal(regenerated.status, 409, "duplicate generation rejected");
  assert.equal(regenerated.body.error, "already_generated", "already_generated error");
  const count = await pool.query("SELECT count(*)::int AS n FROM fin_accounts_receivable WHERE contract_id=$1 AND competence_date='2026-10-01'", [contractId]);
  assert.equal(count.rows[0].n, 1, "exactly one receivable per contract/competence");

  // 5. Regra suspensa é negada com motivo (FIN-03).
  const suspendedRule = await fin("/recurrence-rules", { method: "POST", cookie: financeiro.cookie, body: { contract_id: contractId, recurrence_type: "mensal", start_date: "2026-01-01", amount_cents: 50000, recurrence_id: `QA-L07-S${uuid().slice(0, 6)}`, suspension_enabled: true, suspension_reason: "Suspensão sintética por inadimplência QA" } });
  assert.equal(suspendedRule.status, 201, "suspended rule created");
  await fin("/recurrence-rules", { method: "PATCH", cookie: financeiro.cookie, body: { id: suspendedRule.body.rule.id, is_approved: true } });
  const suspendedGenerate = await fin("/generate-recurring", { method: "POST", cookie: financeiro.cookie, body: { recurrence_rule_id: suspendedRule.body.rule.id, competence_date: "2026-10-01", due_date: "2026-10-10", client_account_id: accountId } });
  assert.equal(suspendedGenerate.status, 400, "suspended rule generation denied");
  assert.equal(suspendedGenerate.body.error, "rule_suspended", "rule_suspended error");

  // 6. Regra inativa é negada (FIN-03).
  await fin("/recurrence-rules", { method: "PATCH", cookie: financeiro.cookie, body: { id: rule.body.rule.id, is_active: false } });
  const inactiveGenerate = await fin("/generate-recurring", { method: "POST", cookie: financeiro.cookie, body: { recurrence_rule_id: rule.body.rule.id, competence_date: "2026-11-01", due_date: "2026-11-10", client_account_id: accountId } });
  assert.equal(inactiveGenerate.status, 400, "inactive rule generation denied");
  assert.equal(inactiveGenerate.body.error, "rule_inactive", "rule_inactive error");

  // 7. Regra inexistente é 404, não 500.
  assert.equal((await fin("/generate-recurring", { method: "POST", cookie: financeiro.cookie, body: { recurrence_rule_id: uuid(), competence_date: "2026-10-01", due_date: "2026-10-10", client_account_id: accountId } })).status, 404, "unknown rule is 404");
});

test("L07 Fatia 1: FIN-04 baixa parcial, conclusão e estorno com histórico imutável e valor validado", { skip: !RUN, timeout: 120_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role: "financeiro" });
  const comercial = await provisionAndLoginStaff(pool, api, { role: "comercial" });
  const { accountId, contractId } = await insertClientSpace("C");

  const receivable = await fin("/receivables", { method: "POST", cookie: financeiro.cookie, body: { client_account_id: accountId, contract_id: contractId, competence_date: "2026-10-01", due_date: "2026-10-10", amount_cents: 100000, description: "Cobrança sintética para baixa QA L07" } });
  assert.equal(receivable.status, 201, "receivable created");
  const receivableId = receivable.body.receivable.id;

  // 1. Negativos de autorização e entrada.
  assert.equal((await fin("/payments", { method: "POST", body: { account_type: "receber", receivable_id: receivableId, amount_cents: 1000, reason: "Qualquer razão sintética longa" } })).status, 401, "anonymous payment denied");
  assert.equal((await fin("/payments", { method: "POST", cookie: comercial.cookie, body: { account_type: "receber", receivable_id: receivableId, amount_cents: 1000, reason: "Comercial não pode dar baixa sintética" } })).status, 403, "comercial cannot register payments");
  assert.equal((await fin("/payments", { method: "POST", cookie: financeiro.cookie, origin: "https://externo.example", body: { account_type: "receber", receivable_id: receivableId, amount_cents: 1000, reason: "Origem estranha não pode dar baixa" } })).status, 403, "cross-origin payment denied");
  assert.equal((await fin("/payments", { method: "POST", cookie: financeiro.cookie, body: { account_type: "receber", receivable_id: receivableId, amount_cents: 0, reason: "Valor zero deve ser recusado no gate" } })).status, 400, "zero amount rejected as 400");
  assert.equal((await fin("/payments", { method: "POST", cookie: financeiro.cookie, body: { account_type: "receber", receivable_id: receivableId, amount_cents: -500, reason: "Valor negativo deve ser recusado" } })).status, 400, "negative amount rejected as 400");
  assert.equal((await fin("/payments", { method: "POST", cookie: financeiro.cookie, body: { account_type: "receber", receivable_id: receivableId, amount_cents: 1000, reason: "curta" } })).status, 400, "short reason rejected");
  assert.equal((await fin("/payments", { method: "POST", cookie: financeiro.cookie, body: { account_type: "receber", receivable_id: receivableId, amount_cents: 1000, reason: "Estorno sem pagamento de origem", is_estorno: true } })).status, 400, "estorno without previous payment rejected");

  // 2. Baixa parcial deixa saldo (FIN-04).
  const partial = await fin("/payments", { method: "POST", cookie: financeiro.cookie, body: { account_type: "receber", receivable_id: receivableId, amount_cents: 40000, is_partial: true, payment_method: "pix", reason: "Recebimento parcial sintético QA L07" } });
  assert.equal(partial.status, 201, "partial payment registered");
  let state = await pool.query("SELECT status, amount_paid_cents, amount_remaining_cents FROM fin_accounts_receivable WHERE id=$1", [receivableId]);
  assert.equal(state.rows[0].status, "parcial", "partial status");
  assert.equal(Number(state.rows[0].amount_paid_cents), 40000, "partial paid amount");
  assert.equal(Number(state.rows[0].amount_remaining_cents), 60000, "remaining after partial");

  // 3. Baixa complementar conclui e registra data (FIN-04).
  const completion = await fin("/payments", { method: "POST", cookie: financeiro.cookie, body: { account_type: "receber", receivable_id: receivableId, amount_cents: 60000, payment_method: "pix", reason: "Recebimento complementar sintético QA L07" } });
  assert.equal(completion.status, 201, "completion payment registered");
  state = await pool.query("SELECT status, amount_paid_cents, paid_at FROM fin_accounts_receivable WHERE id=$1", [receivableId]);
  assert.equal(state.rows[0].status, "recebido", "received status");
  assert.equal(Number(state.rows[0].amount_paid_cents), 100000, "fully paid");
  assert.ok(state.rows[0].paid_at, "paid_at recorded");

  // 4. Estorno devolve saldo sem apagar histórico (FIN-04).
  const estorno = await fin("/payments", { method: "POST", cookie: financeiro.cookie, body: { account_type: "receber", receivable_id: receivableId, amount_cents: 25000, is_estorno: true, previous_payment_id: completion.body.payment.id, reason: "Estorno sintético do gate L07 fatia 1" } });
  assert.equal(estorno.status, 201, "estorno registered");
  state = await pool.query("SELECT status, amount_paid_cents FROM fin_accounts_receivable WHERE id=$1", [receivableId]);
  assert.equal(state.rows[0].status, "parcial", "back to partial after estorno");
  assert.equal(Number(state.rows[0].amount_paid_cents), 75000, "estorno returns balance");

  // 5. Estorno total devolve a conta a pendente, sem data de liquidação (FIN-04).
  const { accountId: accountIdB, contractId: contractIdB } = await insertClientSpace("D");
  const receivableB = await fin("/receivables", { method: "POST", cookie: financeiro.cookie, body: { client_account_id: accountIdB, contract_id: contractIdB, competence_date: "2026-10-01", due_date: "2026-10-10", amount_cents: 50000, description: "Cobrança sintética para estorno total QA" } });
  assert.equal(receivableB.status, 201, "second receivable created");
  const fullPayment = await fin("/payments", { method: "POST", cookie: financeiro.cookie, body: { account_type: "receber", receivable_id: receivableB.body.receivable.id, amount_cents: 50000, payment_method: "pix", reason: "Recebimento integral sintético QA L07" } });
  assert.equal(fullPayment.status, 201, "full payment registered");
  let stateB = await pool.query("SELECT status, amount_paid_cents, paid_at FROM fin_accounts_receivable WHERE id=$1", [receivableB.body.receivable.id]);
  assert.equal(stateB.rows[0].status, "recebido", "full payment settles");
  assert.ok(stateB.rows[0].paid_at, "settlement records paid_at");
  const fullEstorno = await fin("/payments", { method: "POST", cookie: financeiro.cookie, body: { account_type: "receber", receivable_id: receivableB.body.receivable.id, amount_cents: 50000, is_estorno: true, previous_payment_id: fullPayment.body.payment.id, reason: "Estorno integral sintético QA L07 fatia 1" } });
  assert.equal(fullEstorno.status, 201, "full estorno registered");
  stateB = await pool.query("SELECT status, amount_paid_cents, paid_at FROM fin_accounts_receivable WHERE id=$1", [receivableB.body.receivable.id]);
  assert.equal(stateB.rows[0].status, "pendente", "full estorno returns account to pendente");
  assert.equal(Number(stateB.rows[0].amount_paid_cents), 0, "full estorno zeroes paid amount");
  assert.equal(stateB.rows[0].paid_at, null, "full estorno clears paid_at");

  // 6. Histórico imutável com toda a cadeia e pagamentos consultáveis.
  const history = await fin(`/payment-history?receivable_id=${receivableId}`, { cookie: financeiro.cookie });
  assert.equal(history.status, 200, "payment history readable");
  const statuses = history.body.history.map(h => h.next_status);
  assert.deepEqual(statuses.slice(0, 4).sort(), ["parcial", "parcial", "pendente", "recebido"].sort(), "history chain covers create/partial/received/estorno");
  assert.ok(history.body.history.some(h => h.is_estorno === true), "estorno flagged in history");
  const payments = await fin(`/payments?receivable_id=${receivableId}`, { cookie: financeiro.cookie });
  assert.equal(payments.body.payments.length, 3, "two payments plus one estorno");
  const auditEstorno = await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action='fin_payment_estorno' AND target=$1", [estorno.body.payment.id]);
  assert.equal(auditEstorno.rows[0].n, 1, "audit row for estorno");

  // 7. Baixa sobre conta inexistente é 404, sem inventar efeito (nem pagamento órfão).
  const ghostId = uuid();
  const ghost = await fin("/payments", { method: "POST", cookie: financeiro.cookie, body: { account_type: "receber", receivable_id: ghostId, amount_cents: 1000, reason: "Recebível inexistente deve falhar" } });
  assert.equal(ghost.status, 404, "payment on unknown receivable is 404");
  const ghostPayments = await pool.query("SELECT count(*)::int AS n FROM fin_payments WHERE receivable_id=$1", [ghostId]);
  assert.equal(ghostPayments.rows[0].n, 0, "no orphan payment row was created");
  const ghostAccount = await pool.query("SELECT count(*)::int AS n FROM fin_accounts_receivable WHERE id=$1", [ghostId]);
  assert.equal(ghostAccount.rows[0].n, 0, "no receivable was invented");
});
