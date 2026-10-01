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
import { chromium as playwrightChromium } from "playwright";
import packagedChromium from "@sparticuz/chromium";
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

async function insertCostSpace(label) {
  const { accountId, contractId } = await insertClientSpace(label);
  const postId = uuid();
  await pool.query(
    "INSERT INTO ops_posts (id,name,post_type,created_by) VALUES ($1,$2,'portaria','admin')",
    [postId, `QA L07 Posto ${label}`]
  );
  await pool.query(
    "INSERT INTO cli_contract_scopes (contract_id,client_account_id,post_id,scope_description) VALUES ($1,$2,$3,$4)",
    [contractId, accountId, postId, `Escopo sintético do posto para o gate L07 FIN-08 ${label}`]
  );
  return { accountId, contractId, postId };
}

async function insertExpenseSpace(label) {
  const contractId=uuid(), costCenterId=uuid(), supplierId=uuid();
  await pool.query(`INSERT INTO crm_contracts (id,proposal_version,title,status,origin,idempotency_key,created_by) VALUES ($1,1,$2,'ativo','manual',$3,'admin')`,[contractId,`Contrato sintético FIN-10 ${label}`,`fin10-contract-${label}-${contractId}`]);
  await pool.query("INSERT INTO fin_cost_centers (id,name,description) VALUES ($1,$2,$3)",[costCenterId,`Centro sintético ${label} ${costCenterId.slice(0,6)}`,`Centro de custo sintético do gate FIN-10 ${label}`]);
  await pool.query("INSERT INTO fin_suppliers (id,name,document_ref,category) VALUES ($1,$2,$3,'material')",[supplierId,`Fornecedor sintético ${label} ${supplierId.slice(0,6)}`,`SYN-${supplierId.slice(0,8)}`]);
  return {contractId,costCenterId,supplierId};
}

const expensePayload=(space,suffix,overrides={})=>({expense_type:'compra',category:'material sintético',description:'Compra sintética para validar solicitação financeira segregada',amount_cents:50000,threshold_cents:50000,requester_name:'Solicitante sintético',contract_id:space.contractId,cost_center_id:space.costCenterId,supplier_id:space.supplierId,evidence_file_name:`evidencia-${suffix}.json`,evidence_file_url:`synthetic://fin10/${suffix}.json`,evidence_storage_key:`synthetic/fin10/${suffix}.json`,idempotency_key:`fin10-${suffix}`,...overrides});

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

test("L07 Fatia 2: concorrência, sobre-pagamento e estornos permanecem atômicos", { skip: !RUN, timeout: 120_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role: "financeiro" });
  const makeReceivable = async (label, amount=10000) => {
    const { accountId, contractId } = await insertClientSpace(label);
    const result = await fin("/receivables", { method:"POST", cookie:financeiro.cookie, body:{ client_account_id:accountId, contract_id:contractId, competence_date:"2026-10-01", due_date:"2026-10-10", amount_cents:amount, description:`Conta ${label}` } });
    assert.equal(result.status, 201); return result.body.receivable;
  };
  const pay = (id, amount, extra={}) => fin("/payments", { method:"POST", cookie:financeiro.cookie, body:{ account_type:"receber", receivable_id:id, amount_cents:amount, reason:"Movimento financeiro sintético válido", ...extra } });

  const concurrent = await makeReceivable("Concorrencia", 10000);
  const pair = await Promise.all([pay(concurrent.id, 7000), pay(concurrent.id, 7000)]);
  assert.deepEqual(pair.map(x=>x.status).sort(), [201,409]);
  assert.equal(pair.find(x=>x.status===409).body.error, "overpayment");
  let snapshot = await pool.query(`SELECT r.amount_cents,r.amount_paid_cents,r.status,count(p.id)::int payments,COALESCE(sum(p.amount_cents) FILTER (WHERE NOT p.is_estorno),0)::bigint total FROM fin_accounts_receivable r LEFT JOIN fin_payments p ON p.receivable_id=r.id WHERE r.id=$1 GROUP BY r.id`, [concurrent.id]);
  assert.equal(Number(snapshot.rows[0].amount_paid_cents), 7000); assert.equal(Number(snapshot.rows[0].total), 7000); assert.equal(snapshot.rows[0].payments, 1);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM fin_payments p LEFT JOIN fin_accounts_receivable r ON r.id=p.receivable_id WHERE p.account_type='receber' AND r.id IS NULL`)).rows[0].n, 0);

  const before = await pool.query(`SELECT r.amount_paid_cents,r.status,(SELECT count(*) FROM fin_payments WHERE receivable_id=r.id) payments,(SELECT count(*) FROM fin_payment_history WHERE receivable_id=r.id) history,(SELECT count(*) FROM audit_log WHERE target IN (SELECT id::text FROM fin_payments WHERE receivable_id=r.id)) audits FROM fin_accounts_receivable r WHERE id=$1`, [concurrent.id]);
  const excessive = await pay(concurrent.id, 4000); assert.equal(excessive.status,409); assert.equal(excessive.body.error,"overpayment");
  const afterExcess = await pool.query(`SELECT r.amount_paid_cents,r.status,(SELECT count(*) FROM fin_payments WHERE receivable_id=r.id) payments,(SELECT count(*) FROM fin_payment_history WHERE receivable_id=r.id) history,(SELECT count(*) FROM audit_log WHERE target IN (SELECT id::text FROM fin_payments WHERE receivable_id=r.id)) audits FROM fin_accounts_receivable r WHERE id=$1`, [concurrent.id]);
  assert.deepEqual(afterExcess.rows[0], before.rows[0], "overpayment has no business, history or audit effect");

  const originAccount = await makeReceivable("Estornos", 20000); const origin = await pay(originAccount.id, 8000); assert.equal(origin.status,201);
  const first = await pay(originAccount.id, 8000, { is_estorno:true, previous_payment_id:origin.body.payment.id }); assert.equal(first.status,201);
  const repeated = await pay(originAccount.id, 8000, { is_estorno:true, previous_payment_id:origin.body.payment.id }); assert.equal(repeated.status,409); assert.deepEqual(repeated.body,{error:"estorno_already_exists"});
  snapshot = await pool.query(`SELECT amount_paid_cents,status,(SELECT count(*) FROM fin_payments WHERE receivable_id=$1) payments,(SELECT count(*) FROM fin_payment_history WHERE receivable_id=$1) history FROM fin_accounts_receivable WHERE id=$1`,[originAccount.id]);
  assert.equal(Number(snapshot.rows[0].amount_paid_cents),0); assert.equal(Number(snapshot.rows[0].payments),2); assert.equal(Number(snapshot.rows[0].history),3);

  const limited = await makeReceivable("Limite", 20000); const limitedOrigin=await pay(limited.id,5000);
  const tooLarge=await pay(limited.id,5001,{is_estorno:true,previous_payment_id:limitedOrigin.body.payment.id}); assert.equal(tooLarge.status,400); assert.equal(tooLarge.body.error,"estorno_amount_exceeds_origin");
  const other=await makeReceivable("Outra conta",20000); const mismatch=await pay(other.id,5000,{is_estorno:true,previous_payment_id:limitedOrigin.body.payment.id}); assert.equal(mismatch.status,400); assert.equal(mismatch.body.error,"estorno_account_mismatch");
  const unaffected=await pool.query(`SELECT amount_paid_cents,(SELECT count(*) FROM fin_payments WHERE receivable_id=$1) payments FROM fin_accounts_receivable WHERE id=$1`,[other.id]); assert.equal(Number(unaffected.rows[0].amount_paid_cents),0); assert.equal(Number(unaffected.rows[0].payments),0);
  const limitedState=await pool.query(`SELECT amount_paid_cents,(SELECT count(*) FROM fin_payments WHERE receivable_id=$1) payments FROM fin_accounts_receivable WHERE id=$1`,[limited.id]); assert.equal(Number(limitedState.rows[0].amount_paid_cents),5000); assert.equal(Number(limitedState.rows[0].payments),1);
});

test("L07 Fatia 2: auditoria indisponível retorna 503 e reverte a baixa inteira", { skip: !RUN, timeout: 120_000 }, async () => {
  const financeiro=await provisionAndLoginStaff(pool,api,{role:"financeiro"});
  const paymentSpace=await insertClientSpace("Audit payment fail closed");
  const created=await fin("/receivables",{method:"POST",cookie:financeiro.cookie,body:{client_account_id:paymentSpace.accountId,contract_id:paymentSpace.contractId,competence_date:"2026-10-01",due_date:"2026-10-10",amount_cents:9000}}); assert.equal(created.status,201); const paymentAccountId=created.body.receivable.id;
  const receivableSpace=await insertClientSpace("Audit receivable fail closed"); const receivableRecurrenceId=`audit-rec-${uuid()}`;
  const payableSpace=await insertClientSpace("Audit payable fail closed"); const payableRecurrenceId=`audit-pay-${uuid()}`;
  const recurringSpace=await insertClientSpace("Audit recurring fail closed"); const recurringId=`audit-rule-${uuid()}`;
  const rule=await fin("/recurrence-rules",{method:"POST",cookie:financeiro.cookie,body:{contract_id:recurringSpace.contractId,recurrence_type:"mensal",start_date:"2026-10-01",amount_cents:12000,recurrence_id:recurringId}}); assert.equal(rule.status,201);
  const approved=await fin("/recurrence-rules",{method:"PATCH",cookie:financeiro.cookie,body:{id:rule.body.rule.id,is_approved:true}}); assert.equal(approved.status,200); assert.equal(approved.body.rule.is_approved,true);
  const beforePayment=await pool.query(`SELECT amount_paid_cents,status,(SELECT count(*) FROM fin_payments WHERE receivable_id=$1) payments,(SELECT count(*) FROM fin_payment_history WHERE receivable_id=$1) history FROM fin_accounts_receivable WHERE id=$1`,[paymentAccountId]);
  await pool.query(`ALTER TABLE audit_log RENAME TO audit_log_l07_unavailable`);
  try {
    const payment=await fin("/payments",{method:"POST",cookie:financeiro.cookie,body:{account_type:"receber",receivable_id:paymentAccountId,amount_cents:3000,reason:"Auditoria indisponível deve reverter tudo"}}); assert.equal(payment.status,503); assert.equal(payment.body.error,"audit_unavailable");
    const receivable=await fin("/receivables",{method:"POST",cookie:financeiro.cookie,body:{client_account_id:receivableSpace.accountId,contract_id:receivableSpace.contractId,competence_date:"2026-10-01",due_date:"2026-10-10",amount_cents:7000,recurrence_id:receivableRecurrenceId,description:"Recebível para provar rollback da auditoria"}}); assert.equal(receivable.status,503); assert.deepEqual(receivable.body,{error:"audit_unavailable"});
    const payable=await fin("/payables",{method:"POST",cookie:financeiro.cookie,body:{client_account_id:payableSpace.accountId,contract_id:payableSpace.contractId,competence_date:"2026-10-01",due_date:"2026-10-10",amount_cents:8000,recurrence_id:payableRecurrenceId,description:"Pagável para provar rollback da auditoria"}}); assert.equal(payable.status,503); assert.deepEqual(payable.body,{error:"audit_unavailable"});
    const recurring=await fin("/generate-recurring",{method:"POST",cookie:financeiro.cookie,body:{recurrence_rule_id:rule.body.rule.id,competence_date:"2026-10-01",due_date:"2026-10-10",client_account_id:recurringSpace.accountId}}); assert.equal(recurring.status,503); assert.deepEqual(recurring.body,{error:"audit_unavailable"});
  } finally { await pool.query(`ALTER TABLE audit_log_l07_unavailable RENAME TO audit_log`); }

  const afterPayment=await pool.query(`SELECT amount_paid_cents,status,(SELECT count(*) FROM fin_payments WHERE receivable_id=$1) payments,(SELECT count(*) FROM fin_payment_history WHERE receivable_id=$1) history FROM fin_accounts_receivable WHERE id=$1`,[paymentAccountId]); assert.deepEqual(afterPayment.rows[0],beforePayment.rows[0],"payment rollback leaves account, history and payment untouched");
  const failedReceivable=await pool.query(`SELECT id FROM fin_accounts_receivable WHERE client_account_id=$1 AND contract_id=$2 AND recurrence_id=$3`,[receivableSpace.accountId,receivableSpace.contractId,receivableRecurrenceId]); assert.equal(failedReceivable.rows.length,0,"audit failure leaves no receivable");
  const failedReceivableHistory=await pool.query(`SELECT count(*)::int n FROM fin_payment_history h JOIN fin_accounts_receivable r ON r.id=h.receivable_id WHERE r.client_account_id=$1 AND r.contract_id=$2 AND r.recurrence_id=$3`,[receivableSpace.accountId,receivableSpace.contractId,receivableRecurrenceId]); assert.equal(failedReceivableHistory.rows[0].n,0,"audit failure leaves no initial receivable history");
  const failedPayable=await pool.query(`SELECT id FROM fin_accounts_payable WHERE client_account_id=$1 AND contract_id=$2 AND recurrence_id=$3`,[payableSpace.accountId,payableSpace.contractId,payableRecurrenceId]); assert.equal(failedPayable.rows.length,0,"audit failure leaves no payable");
  const failedPayableHistory=await pool.query(`SELECT count(*)::int n FROM fin_payment_history h JOIN fin_accounts_payable p ON p.id=h.payable_id WHERE p.client_account_id=$1 AND p.contract_id=$2 AND p.recurrence_id=$3`,[payableSpace.accountId,payableSpace.contractId,payableRecurrenceId]); assert.equal(failedPayableHistory.rows[0].n,0,"audit failure leaves no initial payable history");
  const recurringState=await pool.query(`SELECT last_generated_competence::text AS last_generated_competence,(SELECT count(*)::int FROM fin_accounts_receivable WHERE recurrence_rule_id=$1) receivables,(SELECT count(*)::int FROM fin_payment_history h JOIN fin_accounts_receivable r ON r.id=h.receivable_id WHERE r.recurrence_rule_id=$1) history FROM fin_recurrence_rules WHERE id=$1`,[rule.body.rule.id]); assert.equal(recurringState.rows.length,1); assert.equal(recurringState.rows[0].last_generated_competence,null,"audit failure does not advance last_generated_competence"); assert.equal(recurringState.rows[0].receivables,0,"audit failure leaves no generated receivable"); assert.equal(recurringState.rows[0].history,0,"audit failure leaves no generated initial history");
});

test("L07 Fatia 2: Chromium percorre recorrência, duplicidade, baixa parcial e estorno", { skip: !RUN, timeout: 180_000 }, async () => {
  const financeiro=await provisionAndLoginStaff(pool,api,{role:"financeiro"}); const {accountId,contractId}=await insertClientSpace("Browser");
  const seed=await fin("/receivables",{method:"POST",cookie:financeiro.cookie,body:{client_account_id:accountId,contract_id:contractId,competence_date:"2026-09-01",due_date:"2026-09-10",amount_cents:10000,description:"Recebível do navegador"}}); assert.equal(seed.status,201);
  // Preserve the same-origin browser journey while avoiding the package's broad web-security bypass.
  const browser=await playwrightChromium.launch({executablePath:await packagedChromium.executablePath(),headless:true,args:packagedChromium.args.filter(arg=>arg!=="--disable-web-security")});
  try {
    const context=await browser.newContext(); const pair=financeiro.cookie.split(';')[0]; const separator=pair.indexOf('='); await context.addCookies([{name:pair.slice(0,separator),value:pair.slice(separator+1),url:baseUrl}]); const page=await context.newPage(); await page.setExtraHTTPHeaders({origin:baseUrl});
    await page.goto(`${baseUrl}/admin/financeiro`,{waitUntil:"networkidle"}); await page.waitForSelector('[data-testid="financeiro-workspace"]'); await page.waitForSelector('[data-testid="finance-receivables-table"]');
    await page.getByTestId('finance-tab-recurrence').click(); await page.waitForSelector('[data-testid="finance-recurrence"]'); await page.getByTestId('finance-generation-client-account').fill(accountId);
    const recurrenceId=`browser-${uuid()}`; await page.getByPlaceholder('ID do contrato').last().fill(contractId); await page.getByPlaceholder('Identificador da regra').fill(recurrenceId); await page.locator('[data-testid="finance-recurrence"] input[type=date]').fill('2026-10-01'); await page.getByPlaceholder('Valor em centavos').last().fill('12000'); await page.getByRole('button',{name:'Criar regra'}).click(); let browserRule; for(let i=0;i<40;i++){ browserRule=await pool.query('SELECT id FROM fin_recurrence_rules WHERE recurrence_id=$1',[recurrenceId]); if(browserRule.rows.length) break; await sleep(100); } assert.equal(browserRule.rows.length,1); await page.waitForSelector(`[data-testid="finance-rule-${browserRule.rows[0].id}"]`);
    const rule=page.getByTestId(`finance-rule-${browserRule.rows[0].id}`); await rule.getByRole('button',{name:'Aprovar'}).click(); await page.waitForFunction(id=>document.querySelector(`[data-testid="finance-rule-${id}"]`)?.textContent?.includes('aprovada'),browserRule.rows[0].id); await rule.getByRole('button',{name:'Gerar cobrança'}).click(); for(let i=0;i<40;i++){ const generated=await pool.query('SELECT id FROM fin_accounts_receivable WHERE recurrence_rule_id=$1',[browserRule.rows[0].id]); if(generated.rows.length) break; await sleep(100); } await rule.getByRole('button',{name:'Gerar cobrança'}).click(); await page.waitForSelector('[data-testid="finance-error"]'); assert.match(await page.getByTestId('finance-error').textContent(),/already_generated/);
    assert.equal(Number((await pool.query(`SELECT count(*)::int n FROM fin_accounts_receivable WHERE recurrence_rule_id=$1`,[browserRule.rows[0].id])).rows[0].n),1);
    await page.getByTestId('finance-tab-receivables').click(); await page.locator('tr',{hasText:seed.body.receivable.protocol}).click(); await page.getByTestId('finance-tab-payments').click(); await page.waitForSelector('[data-testid="finance-payments-table"]'); await page.getByPlaceholder('Baixa em centavos').fill('4000'); await page.getByPlaceholder('Motivo (10 a 1000 caracteres)').fill('Baixa parcial feita pelo navegador real'); await page.getByRole('button',{name:'Dar baixa'}).click(); await page.waitForFunction(()=>document.body.textContent?.includes('status parcial')&&document.body.textContent?.includes('R$ 40,00'));
    await page.getByPlaceholder('Motivo (10 a 1000 caracteres)').fill('Estorno confirmado pelo navegador real'); await page.getByRole('button',{name:/Estornar pagamento/}).click(); await page.getByRole('button',{name:'Confirmar estorno'}).click(); await page.waitForFunction(()=>document.body.textContent?.includes('status pendente')&&document.body.textContent?.includes('R$ 0,00')); assert.ok(await page.getByTestId('finance-payments-table').isVisible());
  } finally { await browser.close(); }
});

test("L07 FIN-05: extrato sintético, sugestão, confirmação e idempotência", { skip: !RUN, timeout: 120_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role: "financeiro" });
  const rh = await provisionAndLoginStaff(pool, api, { role: "rh" });
  const { accountId, contractId } = await insertClientSpace("FIN05 HTTP");
  const receivable = await fin("/receivables", {
    method: "POST",
    cookie: financeiro.cookie,
    body: {
      client_account_id: accountId,
      contract_id: contractId,
      competence_date: "2026-10-01",
      due_date: "2026-10-10",
      amount_cents: 12500,
      description: "Recebível sintético para conciliação bancária FIN-05",
    },
  });
  assert.equal(receivable.status, 201);

  assert.equal((await fin("/bank-statements")).status, 401, "anonymous statement read denied");
  assert.equal((await fin("/bank-statements", { cookie: rh.cookie })).status, 403, "rh cannot import bank statement");
  assert.equal((await fin("/bank-statements", { method: "POST", cookie: financeiro.cookie, origin: "https://externo.example", body: { file_name: "extrato.csv", file_url: "/synthetic/extrato.csv", storage_key: `fin05-origin-${uuid()}` } })).status, 403, "cross-origin statement import denied");

  const storageKey = `fin05-statement-${uuid()}`;
  const statement = await fin("/bank-statements", {
    method: "POST",
    cookie: financeiro.cookie,
    body: {
      source: "importacao",
      file_name: "extrato-fin05-sintetico.csv",
      file_url: "/synthetic/fin05/extrato-fin05-sintetico.csv",
      storage_key: storageKey,
      import_date: "2026-10-15",
    },
  });
  assert.equal(statement.status, 201, "synthetic statement imported");
  assert.match(statement.body.statement.protocol, /^EXT-FIN-\d{8}-[A-Z0-9]{4}$/);
  assert.equal(statement.body.synthetic, true);
  const duplicateStatement = await fin("/bank-statements", { method: "POST", cookie: financeiro.cookie, body: { source: "importacao", file_name: "outro.csv", file_url: "/synthetic/fin05/outro.csv", storage_key: storageKey } });
  assert.equal(duplicateStatement.status, 409, "same storage key is idempotent");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM fin_bank_statements WHERE storage_key=$1", [storageKey])).rows[0].n, 1);

  const bankRef = `FIN05-BANK-${uuid()}`;
  const transaction = await fin("/bank-transactions", {
    method: "POST",
    cookie: financeiro.cookie,
    body: { statement_id: statement.body.statement.id, transaction_date: "2026-10-10", amount_cents: 12500, description: "Recebimento contrato sintético FIN-05", bank_ref: bankRef },
  });
  assert.equal(transaction.status, 201, "synthetic bank transaction imported");
  assert.equal(transaction.body.synthetic, true);
  const duplicateTransaction = await fin("/bank-transactions", { method: "POST", cookie: financeiro.cookie, body: { statement_id: statement.body.statement.id, transaction_date: "2026-10-10", amount_cents: 12500, description: "Repetição sintética do mesmo lançamento", bank_ref: bankRef } });
  assert.equal(duplicateTransaction.status, 409, "same bank reference is not imported twice");
  const statementTotals = await pool.query("SELECT total_transactions, total_amount_cents FROM fin_bank_statements WHERE id=$1", [statement.body.statement.id]);
  assert.equal(statementTotals.rows[0].total_transactions, 1);
  assert.equal(Number(statementTotals.rows[0].total_amount_cents), 12500);

  assert.equal((await fin("/conciliations", { method: "POST", cookie: financeiro.cookie, body: { receivable_id: receivable.body.receivable.id, source: "importacao", suggestion_reason: "Sugestão sem transação vinculada" } })).status, 400, "bank transaction is required");
  assert.equal((await fin("/conciliations", { method: "POST", cookie: financeiro.cookie, body: { receivable_id: receivable.body.receivable.id, payable_id: uuid(), bank_transaction_id: transaction.body.transaction.id, source: "importacao", suggestion_reason: "Duas contas não podem ser conciliadas" } })).status, 400, "exactly one account is required");
  assert.equal((await fin("/conciliations", { method: "POST", cookie: financeiro.cookie, body: { receivable_id: receivable.body.receivable.id, bank_transaction_id: transaction.body.transaction.id, source: "importacao", suggestion_reason: "curta" } })).status, 400, "suggestion needs a documented reason");

  const suggestion = await fin("/conciliations", {
    method: "POST",
    cookie: financeiro.cookie,
    body: {
      receivable_id: receivable.body.receivable.id,
      bank_transaction_id: transaction.body.transaction.id,
      source: "importacao",
      suggestion_reason: "Mesmo valor, data de baixa e referência do extrato sintético",
      amount_matched_cents: 12500,
    },
  });
  assert.equal(suggestion.status, 201, "conciliation suggestion created");
  assert.equal(suggestion.body.conciliation.status, "sugerida");
  const duplicateSuggestion = await fin("/conciliations", {
    method: "POST",
    cookie: financeiro.cookie,
    body: { receivable_id: receivable.body.receivable.id, bank_transaction_id: transaction.body.transaction.id, source: "importacao", suggestion_reason: "Sugestão repetida do mesmo lançamento bancário" },
  });
  assert.equal(duplicateSuggestion.status, 409, "same bank transaction cannot receive a duplicate suggestion");

  const shortDivergence = await fin("/conciliations", { method: "PATCH", cookie: financeiro.cookie, body: { id: suggestion.body.conciliation.id, status: "divergente", divergence_reason: "curta" } });
  assert.equal(shortDivergence.status, 400, "divergence needs a documented reason");
  const confirmed = await fin("/conciliations", { method: "PATCH", cookie: financeiro.cookie, body: { id: suggestion.body.conciliation.id, status: "conciliada" } });
  assert.equal(confirmed.status, 200, "conciliation confirmed");
  assert.equal(confirmed.body.conciliation.status, "conciliada");
  const bankState = await pool.query("SELECT is_conciliated, conciliated_at FROM fin_bank_transactions WHERE id=$1", [transaction.body.transaction.id]);
  assert.equal(bankState.rows[0].is_conciliated, true);
  assert.ok(bankState.rows[0].conciliated_at);
  const repeatedConfirmation = await fin("/conciliations", { method: "PATCH", cookie: financeiro.cookie, body: { id: suggestion.body.conciliation.id, status: "conciliada" } });
  assert.equal(repeatedConfirmation.status, 409, "a confirmed suggestion cannot be confirmed twice");
  const audit = await pool.query("SELECT action, count(*)::int AS n FROM audit_log WHERE target=$1 GROUP BY action ORDER BY action", [suggestion.body.conciliation.id]);
  assert.deepEqual(audit.rows, [{ action: "fin_conciliation_confirm", n: 1 }, { action: "fin_conciliation_create", n: 1 }]);

  // The same fail-closed rule used by FIN-01..04 also covers every FIN-05 write.
  const failedStorage = `fin05-audit-${uuid()}`;
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_fin05_unavailable");
  try {
    const failedStatement = await fin("/bank-statements", { method: "POST", cookie: financeiro.cookie, body: { source: "extrato", file_name: "audit-off.csv", file_url: "/synthetic/fin05/audit-off.csv", storage_key: failedStorage } });
    assert.deepEqual(failedStatement.body, { error: "audit_unavailable" });
    assert.equal(failedStatement.status, 503);
    const failedTransaction = await fin("/bank-transactions", { method: "POST", cookie: financeiro.cookie, body: { statement_id: statement.body.statement.id, transaction_date: "2026-10-11", amount_cents: 100, description: "Transação que não pode persistir", bank_ref: `FIN05-AUDIT-${uuid()}` } });
    assert.deepEqual(failedTransaction.body, { error: "audit_unavailable" });
    assert.equal(failedTransaction.status, 503);
  } finally {
    await pool.query("ALTER TABLE audit_log_fin05_unavailable RENAME TO audit_log");
  }
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM fin_bank_statements WHERE storage_key=$1", [failedStorage])).rows[0].n, 0, "failed statement leaves no row");
  const afterFailedTransaction = await pool.query("SELECT total_transactions, total_amount_cents FROM fin_bank_statements WHERE id=$1", [statement.body.statement.id]);
  assert.equal(afterFailedTransaction.rows[0].total_transactions, 1, "failed transaction leaves statement aggregate unchanged");
});

test("L07 FIN-05: Chromium importa e confirma conciliação no workspace financeiro", { skip: !RUN, timeout: 180_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role: "financeiro" });
  const { accountId, contractId } = await insertClientSpace("FIN05 Chromium");
  const receivable = await fin("/receivables", { method: "POST", cookie: financeiro.cookie, body: { client_account_id: accountId, contract_id: contractId, competence_date: "2026-10-01", due_date: "2026-10-10", amount_cents: 8800, description: "Recebível sintético da jornada FIN-05 no Chromium" } });
  assert.equal(receivable.status, 201);
  const browser = await playwrightChromium.launch({ executablePath: await packagedChromium.executablePath(), headless: true, args: packagedChromium.args.filter(arg => arg !== "--disable-web-security") });
  try {
    const context = await browser.newContext();
    const pair = financeiro.cookie.split(";")[0];
    const separator = pair.indexOf("=");
    await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl }]);
    const page = await context.newPage();
    await page.setExtraHTTPHeaders({ origin: baseUrl });
    await page.goto(`${baseUrl}/admin/financeiro`, { waitUntil: "networkidle" });
    await page.getByTestId("finance-tab-reconciliation").click();
    await page.waitForSelector('[data-testid="fin05-reconciliation"]');

    const suffix = uuid().slice(0, 8);
    const bankRef = `FIN05-UI-${suffix}`;
    await page.getByTestId("fin05-file-name").fill(`fin05-${suffix}.csv`);
    await page.getByTestId("fin05-storage-key").fill(`synthetic/fin05/${suffix}`);
    await page.getByTestId("fin05-import-date").fill("2026-10-16");
    await page.getByTestId("fin05-import-statement").click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="fin05-transaction-statement"] option').length > 1);
    await page.getByTestId("fin05-transaction-statement").selectOption({ index: 1 });
    await page.getByTestId("fin05-transaction-date").fill("2026-10-10");
    await page.getByTestId("fin05-transaction-amount").fill("8800");
    await page.getByTestId("fin05-transaction-description").fill("Recebimento sintético confirmado no Chromium");
    await page.getByTestId("fin05-bank-ref").fill(bankRef);
    await page.getByTestId("fin05-import-transaction").click();
    let uiTransaction;
    for (let i = 0; i < 40; i++) {
      uiTransaction = await pool.query("SELECT id FROM fin_bank_transactions WHERE bank_ref=$1", [bankRef]);
      if (uiTransaction.rows.length) break;
      await sleep(100);
    }
    assert.equal(uiTransaction.rows.length, 1);
    await page.getByTestId("fin05-account").selectOption(receivable.body.receivable.id);
    await page.getByTestId("fin05-bank-transaction").selectOption(uiTransaction.rows[0].id);
    await page.getByTestId("fin05-suggestion-reason").fill("Referência, data e valor conferidos no extrato sintético");
    await page.getByTestId("fin05-suggest").click();
    let uiConciliation;
    for (let i = 0; i < 40; i++) {
      uiConciliation = await pool.query("SELECT id FROM fin_conciliations WHERE bank_transaction_id=$1", [uiTransaction.rows[0].id]);
      if (uiConciliation.rows.length) break;
      await sleep(100);
    }
    assert.equal(uiConciliation.rows.length, 1);
    await page.getByRole("button", { name: "Selecionar para confirmar" }).click();
    await page.getByTestId("fin05-confirm").click();
    await page.waitForFunction(() => document.querySelector('[data-testid="fin05-notice"]')?.textContent?.includes("conciliada"));
    const uiState = await pool.query("SELECT c.status, b.is_conciliated FROM fin_conciliations c JOIN fin_bank_transactions b ON b.id=c.bank_transaction_id WHERE c.id=$1", [uiConciliation.rows[0].id]);
    assert.equal(uiState.rows[0].status, "conciliada");
    assert.equal(uiState.rows[0].is_conciliated, true);
  } finally {
    await browser.close();
  }
});

test("L07 FIN-06: política de cobrança aprovada, lembretes com responsável, histórico imutável e auditoria fail-closed", { skip: !RUN, timeout: 120_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role: "financeiro" });
  const rh = await provisionAndLoginStaff(pool, api, { role: "rh" });
  const { accountId, contractId } = await insertClientSpace("FIN06 HTTP");
  const receivable = await fin("/receivables", {
    method: "POST",
    cookie: financeiro.cookie,
    body: {
      client_account_id: accountId,
      contract_id: contractId,
      competence_date: "2026-10-01",
      due_date: "2026-10-10",
      amount_cents: 15000,
      description: "Recebível sintético para cobrança FIN-06",
    },
  });
  assert.equal(receivable.status, 201);
  const receivableId = receivable.body.receivable.id;

  // 1. Anônimo é negado (fail-closed) em todas as três sub-APIs de FIN-06.
  assert.equal((await fin("/collection-policies")).status, 401, "anonymous policy read denied");
  assert.equal((await fin("/collection-reminders")).status, 401, "anonymous reminder read denied");
  assert.equal((await fin(`/collection-history?receivable_id=${receivableId}`)).status, 401, "anonymous history read denied");

  // 2. Papel fora de financeiro/admin/ti é negado.
  assert.equal((await fin("/collection-policies", { cookie: rh.cookie })).status, 403, "rh cannot read collection policies");
  assert.equal((await fin("/collection-policies", { method: "POST", cookie: rh.cookie, body: { name: `Forjada ${uuid()}` } })).status, 403, "rh cannot create collection policy");
  assert.equal((await fin("/collection-reminders", { method: "POST", cookie: rh.cookie, body: { receivable_id: receivableId } })).status, 403, "rh cannot create reminder");

  // 3. same-origin: mutação com Origin estranho é negada antes de qualquer escrita.
  assert.equal((await fin("/collection-policies", { method: "POST", cookie: financeiro.cookie, origin: "https://externo.example", body: { name: `Forjada origem ${uuid()}` } })).status, 403, "cross-origin policy create denied");

  // 4. Criação de política válida: nome único, descrição, tipo de lembrete, dias antes, escalonamento.
  const policyName = `Política QA L07 FIN-06 ${uuid().slice(0, 8)}`;
  const policy = await fin("/collection-policies", {
    method: "POST",
    cookie: financeiro.cookie,
    body: { name: policyName, description: "Política sintética de cobrança do gate L07 FIN-06", reminder_type: "email", days_before: 5, escalation_level: 1 },
  });
  assert.equal(policy.status, 201, "policy created");
  assert.equal(policy.body.policy.is_approved, false, "policy starts unapproved");
  assert.equal(policy.body.policy.is_active, true, "policy starts active");
  assert.equal(policy.body.policy.days_before, 5, "days_before persisted");
  assert.equal(policy.body.policy.escalation_level, 1, "escalation_level persisted");

  // 5. Duplicidade de nome é rejeitada.
  const duplicatePolicy = await fin("/collection-policies", { method: "POST", cookie: financeiro.cookie, body: { name: policyName } });
  assert.equal(duplicatePolicy.status, 409, "duplicate policy name rejected");
  assert.equal(duplicatePolicy.body.error, "duplicate_name");

  // 6. Tentativa de aprovação sem autorização é rejeitada (separação entre criar e aprovar).
  const unauthorizedApproval = await fin("/collection-policies", { method: "PATCH", cookie: rh.cookie, body: { id: policy.body.policy.id, is_approved: true } });
  assert.equal(unauthorizedApproval.status, 403, "rh cannot approve collection policy");

  // 7. Aprovação válida e auditada.
  const approved = await fin("/collection-policies", { method: "PATCH", cookie: financeiro.cookie, body: { id: policy.body.policy.id, is_approved: true } });
  assert.equal(approved.status, 200, "policy approved");
  assert.equal(approved.body.policy.is_approved, true);
  const approverRow = await pool.query("SELECT approved_by_identity, approved_at FROM fin_collection_policies WHERE id=$1", [policy.body.policy.id]);
  assert.equal(approverRow.rows[0].approved_by_identity, financeiro.id, "approver identity recorded");
  assert.ok(approverRow.rows[0].approved_at, "approval timestamp recorded");
  const approveAudit = await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action='fin_collection_policy_approve' AND target=$1", [policy.body.policy.id]);
  assert.equal(approveAudit.rows[0].n, 1, "audit row for policy approval");
  const doubleApproval = await fin("/collection-policies", { method: "PATCH", cookie: financeiro.cookie, body: { id: policy.body.policy.id, is_approved: true } });
  assert.equal(doubleApproval.status, 409, "already approved policy cannot be approved twice");

  // 8. Referências inválidas são rejeitadas: UUID malformado é 400, UUID inexistente é 404.
  assert.equal((await fin("/collection-reminders", { method: "POST", cookie: financeiro.cookie, body: { receivable_id: "not-a-uuid", policy_id: policy.body.policy.id, responsible_name: "Ana Responsável", due_date: "2026-10-05", content: "Lembrete sintético com referência malformada para o gate" } })).status, 400, "malformed receivable_id rejected");
  const missingReceivable = await fin("/collection-reminders", { method: "POST", cookie: financeiro.cookie, body: { receivable_id: uuid(), policy_id: policy.body.policy.id, responsible_name: "Ana Responsável", due_date: "2026-10-05", content: "Lembrete sintético referenciando recebível inexistente" } });
  assert.equal(missingReceivable.status, 404, "unknown receivable_id is 404");
  assert.equal(missingReceivable.body.error, "receivable_not_found");
  const missingPolicy = await fin("/collection-reminders", { method: "POST", cookie: financeiro.cookie, body: { receivable_id: receivableId, policy_id: uuid(), responsible_name: "Ana Responsável", due_date: "2026-10-05", content: "Lembrete sintético referenciando política inexistente" } });
  assert.equal(missingPolicy.status, 404, "unknown policy_id is 404");
  assert.equal(missingPolicy.body.error, "policy_not_found");

  // 9. Política não aprovada não pode gerar lembrete (separação criação/aprovação).
  const draftPolicy = await fin("/collection-policies", { method: "POST", cookie: financeiro.cookie, body: { name: `Rascunho QA L07 ${uuid().slice(0, 8)}` } });
  assert.equal(draftPolicy.status, 201);
  const reminderOnDraft = await fin("/collection-reminders", { method: "POST", cookie: financeiro.cookie, body: { receivable_id: receivableId, policy_id: draftPolicy.body.policy.id, responsible_name: "Ana Responsável", due_date: "2026-10-05", content: "Lembrete sintético sobre política ainda não aprovada" } });
  assert.equal(reminderOnDraft.status, 400, "reminder on unapproved policy denied");
  assert.equal(reminderOnDraft.body.error, "policy_not_approved");

  // 10. Conteúdo inválido (curto) é rejeitado.
  const shortContent = await fin("/collection-reminders", { method: "POST", cookie: financeiro.cookie, body: { receivable_id: receivableId, policy_id: policy.body.policy.id, responsible_name: "Ana Responsável", due_date: "2026-10-05", content: "curto" } });
  assert.equal(shortContent.status, 400, "short content rejected");
  assert.equal(shortContent.body.error, "content_20_2000_required");

  // 11. Responsável ausente/curto é rejeitado (campo obrigatório).
  const missingResponsible = await fin("/collection-reminders", { method: "POST", cookie: financeiro.cookie, body: { receivable_id: receivableId, policy_id: policy.body.policy.id, responsible_name: "A", due_date: "2026-10-05", content: "Lembrete sintético sem responsável válido para o gate L07" } });
  assert.equal(missingResponsible.status, 400, "too-short responsible name rejected");

  // 12. is_real_message=true é rejeitado explicitamente (nunca normalizado silenciosamente para true).
  const forgedRealMessage = await fin("/collection-reminders", {
    method: "POST",
    cookie: financeiro.cookie,
    body: { receivable_id: receivableId, policy_id: policy.body.policy.id, responsible_name: "Ana Responsável", due_date: "2026-10-05", content: "Lembrete sintético tentando forjar envio real indevido", is_real_message: true },
  });
  assert.equal(forgedRealMessage.status, 400, "is_real_message=true rejected");
  assert.equal(forgedRealMessage.body.error, "real_message_forbidden");

  // 13. Criação de lembrete válido com responsável, política aprovada e vínculo ao recebível.
  const reminder = await fin("/collection-reminders", {
    method: "POST",
    cookie: financeiro.cookie,
    body: { receivable_id: receivableId, policy_id: policy.body.policy.id, responsible_name: "Ana Responsável QA", due_date: "2026-10-05", reminder_type: "email", content: "Lembrete sintético de cobrança do gate L07 FIN-06, sem envio real" },
  });
  assert.equal(reminder.status, 201, "reminder created");
  assert.equal(reminder.body.reminder.is_real_message, false, "reminder is never a real message");
  assert.equal(reminder.body.reminder.status, "pendente", "reminder starts pendente");
  assert.equal(reminder.body.reminder.client_account_id, accountId, "reminder resolves client account via receivable");
  assert.equal(reminder.body.reminder.contract_id, contractId, "reminder resolves contract via receivable");
  const createAudit = await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action='fin_collection_reminder_create' AND target=$1", [reminder.body.reminder.id]);
  assert.equal(createAudit.rows[0].n, 1, "audit row for reminder creation");

  // 14. Envio é apenas simulado/local: muda status, marca sent_at, nunca envia mensagem real.
  const shortReason = await fin("/collection-reminders", { method: "PATCH", cookie: financeiro.cookie, body: { id: reminder.body.reminder.id, status: "lembrete_enviado", reason: "curto" } });
  assert.equal(shortReason.status, 400, "short send reason rejected");
  const sent = await fin("/collection-reminders", { method: "PATCH", cookie: financeiro.cookie, body: { id: reminder.body.reminder.id, status: "lembrete_enviado", reason: "Envio simulado confirmado pelo gate L07 FIN-06" } });
  assert.equal(sent.status, 200, "simulated send accepted");
  assert.equal(sent.body.reminder.status, "lembrete_enviado");
  assert.ok(sent.body.reminder.sent_at, "sent_at recorded for simulated send");
  assert.equal(sent.body.reminder.is_real_message, false, "still never a real message after send");
  const repeatSend = await fin("/collection-reminders", { method: "PATCH", cookie: financeiro.cookie, body: { id: reminder.body.reminder.id, status: "lembrete_enviado", reason: "Repetição do mesmo envio simulado" } });
  assert.equal(repeatSend.status, 409, "resending the same status is rejected");

  // 15. Histórico foi persistido, é imutável (trigger de banco) e nunca marca bloqueio automático.
  const history = await fin(`/collection-history?receivable_id=${receivableId}`, { cookie: financeiro.cookie });
  assert.equal(history.status, 200);
  assert.ok(history.body.history.length >= 2, "history has creation and send entries");
  assert.ok(history.body.history.every(entry => entry.is_blocking_action === false), "no history entry ever blocks the portal");
  const historyRow = await pool.query("SELECT id FROM fin_collection_history WHERE receivable_id=$1 ORDER BY created_at ASC LIMIT 1", [receivableId]);
  await assert.rejects(
    pool.query("UPDATE fin_collection_history SET reason='forjado' WHERE id=$1", [historyRow.rows[0].id]),
    /immutable/i,
    "history row cannot be updated"
  );
  await assert.rejects(
    pool.query("DELETE FROM fin_collection_history WHERE id=$1", [historyRow.rows[0].id]),
    /immutable/i,
    "history row cannot be deleted"
  );

  // 16. Nenhum bloqueio automático de portal: nenhuma coluna de bloqueio chega a true em todo o fluxo.
  const blockingCheck = await pool.query("SELECT count(*)::int AS n FROM fin_collection_history WHERE receivable_id=$1 AND is_blocking_action = true", [receivableId]);
  assert.equal(blockingCheck.rows[0].n, 0, "zero blocking actions recorded");

  // 17. Auditoria indisponível é fail-closed: 503 e rollback total, sem política/lembrete/histórico parcial.
  const auditPolicyName = `Auditoria indisponível ${uuid().slice(0, 8)}`;
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_fin06_unavailable");
  try {
    const failedPolicy = await fin("/collection-policies", { method: "POST", cookie: financeiro.cookie, body: { name: auditPolicyName } });
    assert.equal(failedPolicy.status, 503);
    assert.deepEqual(failedPolicy.body, { error: "audit_unavailable" });
    const failedApproval = await fin("/collection-policies", { method: "PATCH", cookie: financeiro.cookie, body: { id: draftPolicy.body.policy.id, is_approved: true } });
    assert.equal(failedApproval.status, 503);
    assert.deepEqual(failedApproval.body, { error: "audit_unavailable" });
    const failedReminder = await fin("/collection-reminders", {
      method: "POST",
      cookie: financeiro.cookie,
      body: { receivable_id: receivableId, policy_id: policy.body.policy.id, responsible_name: "Ana Responsável QA", due_date: "2026-10-06", content: "Lembrete que não pode persistir sem auditoria disponível" },
    });
    assert.equal(failedReminder.status, 503);
    assert.deepEqual(failedReminder.body, { error: "audit_unavailable" });
  } finally {
    await pool.query("ALTER TABLE audit_log_fin06_unavailable RENAME TO audit_log");
  }
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM fin_collection_policies WHERE name=$1", [auditPolicyName])).rows[0].n, 0, "failed policy leaves no row");
  const draftStillUnapproved = await pool.query("SELECT is_approved FROM fin_collection_policies WHERE id=$1", [draftPolicy.body.policy.id]);
  assert.equal(draftStillUnapproved.rows[0].is_approved, false, "failed approval leaves policy unapproved");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM fin_collection_reminders WHERE due_date='2026-10-06'")).rows[0].n, 0, "failed reminder leaves no row");
});

test("L07 FIN-06: Chromium cria política, aprova, cria lembrete, envia simulado e mostra histórico sem bloqueio", { skip: !RUN, timeout: 180_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role: "financeiro" });
  const { accountId, contractId } = await insertClientSpace("FIN06 Chromium");
  const receivable = await fin("/receivables", { method: "POST", cookie: financeiro.cookie, body: { client_account_id: accountId, contract_id: contractId, competence_date: "2026-10-01", due_date: "2026-10-12", amount_cents: 9900, description: "Recebível sintético da jornada FIN-06 no Chromium" } });
  assert.equal(receivable.status, 201);
  const browser = await playwrightChromium.launch({ executablePath: await packagedChromium.executablePath(), headless: true, args: packagedChromium.args.filter(arg => arg !== "--disable-web-security") });
  try {
    const context = await browser.newContext();
    const pair = financeiro.cookie.split(";")[0];
    const separator = pair.indexOf("=");
    await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl }]);
    const page = await context.newPage();
    await page.setExtraHTTPHeaders({ origin: baseUrl });
    await page.goto(`${baseUrl}/admin/financeiro`, { waitUntil: "networkidle" });
    await page.getByTestId("finance-tab-collection").click();
    await page.waitForSelector('[data-testid="fin06-collection"]');

    const suffix = uuid().slice(0, 8);
    const policyName = `Política Chromium FIN-06 ${suffix}`;
    await page.getByTestId("fin06-policy-name").fill(policyName);
    await page.getByTestId("fin06-policy-description").fill("Política sintética criada pelo Chromium para o gate L07 FIN-06");
    await page.getByTestId("fin06-policy-days-before").fill("4");
    await page.getByTestId("fin06-policy-escalation").fill("2");
    await page.getByTestId("fin06-create-policy").click();
    let uiPolicy;
    for (let i = 0; i < 40; i++) {
      uiPolicy = await pool.query("SELECT id FROM fin_collection_policies WHERE name=$1", [policyName]);
      if (uiPolicy.rows.length) break;
      await sleep(100);
    }
    assert.equal(uiPolicy.rows.length, 1);
    await page.waitForSelector(`[data-testid="fin06-policy-${uiPolicy.rows[0].id}"]`);
    await page.getByTestId(`fin06-approve-${uiPolicy.rows[0].id}`).click();
    await page.waitForFunction(id => document.querySelector(`[data-testid="fin06-policy-${id}"]`)?.textContent?.includes("aprovada"), uiPolicy.rows[0].id);

    await page.getByTestId("fin06-reminder-receivable").selectOption(receivable.body.receivable.id);
    await page.getByTestId("fin06-reminder-policy").selectOption(uiPolicy.rows[0].id);
    await page.getByTestId("fin06-reminder-responsible").fill("Responsável Chromium QA");
    await page.getByTestId("fin06-reminder-due-date").fill("2026-10-08");
    await page.getByTestId("fin06-reminder-content").fill("Lembrete sintético de cobrança criado pelo Chromium, sem envio real, apenas simulado no portal local.");
    await page.getByTestId("fin06-create-reminder").click();
    let uiReminder;
    for (let i = 0; i < 40; i++) {
      uiReminder = await pool.query("SELECT id FROM fin_collection_reminders WHERE receivable_id=$1", [receivable.body.receivable.id]);
      if (uiReminder.rows.length) break;
      await sleep(100);
    }
    assert.equal(uiReminder.rows.length, 1);
    await page.waitForSelector(`[data-testid="fin06-reminder-${uiReminder.rows[0].id}"]`);
    assert.match(await page.getByTestId(`fin06-reminder-${uiReminder.rows[0].id}`).textContent(), /simulado\/local/);

    await page.locator('[data-testid^="fin06-reminder-"] button', { hasText: "Selecionar para enviar" }).first().click();
    await page.getByTestId("fin06-send-reason").fill("Envio simulado confirmado pela jornada Chromium do gate L07");
    await page.getByTestId("fin06-send").click();
    await page.waitForFunction(() => document.querySelector('[data-testid="fin06-notice"]')?.textContent?.includes("lembrete_enviado"));
    const uiReminderState = await pool.query("SELECT status, is_real_message FROM fin_collection_reminders WHERE id=$1", [uiReminder.rows[0].id]);
    assert.equal(uiReminderState.rows[0].status, "lembrete_enviado");
    assert.equal(uiReminderState.rows[0].is_real_message, false);

    await page.getByTestId("fin06-history-receivable").fill(receivable.body.receivable.id);
    await page.getByTestId("fin06-load-history").click();
    await page.waitForFunction(() => (document.querySelector('[data-testid="fin06-history"]')?.textContent || "").includes("sem bloqueio automático"));
    const historyText = await page.getByTestId("fin06-history").textContent();
    assert.match(historyText, /sem bloqueio automático/);
    assert.doesNotMatch(historyText, /ATENÇÃO: bloqueio/);
  } finally {
    await browser.close();
  }
});

test("L07 FIN-07: fluxo previsto/realizado, vencidos, próximos pagamentos e aging auditado", { skip: !RUN, timeout: 120_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role: "financeiro" });
  const rh = await provisionAndLoginStaff(pool, api, { role: "rh" });
  const { accountId, contractId } = await insertClientSpace("FIN07 HTTP");

  assert.equal((await fin("/cashflow-snapshots")).status, 401, "anonymous cashflow read denied");
  assert.equal((await fin("/aging-receivables", { cookie: rh.cookie })).status, 403, "rh aging read denied");
  assert.equal((await fin("/cashflow-snapshots?cashflow_type=invalido", { cookie: financeiro.cookie })).status, 400, "invalid cashflow type denied");

  const forecast = await fin("/cashflow-snapshots", {
    method: "POST",
    cookie: financeiro.cookie,
    body: {
      competence_date: "2026-10-01",
      cashflow_type: "previsto",
      total_receivable_cents: 150000,
      total_payable_cents: 50000,
      vencidos_cents: 20000,
      proximos_pagamentos_cents: 70000,
      notes: "Snapshot previsto sintético do gate L07 FIN-07",
    },
  });
  assert.equal(forecast.status, 201, "forecast cashflow snapshot created");
  assert.equal(forecast.body.synthetic, true);
  assert.equal(Number(forecast.body.snapshot.balance_cents), 100000, "balance is generated from totals");
  assert.equal(forecast.body.snapshot.cashflow_type, "previsto");
  const duplicateForecast = await fin("/cashflow-snapshots", {
    method: "POST", cookie: financeiro.cookie,
    body: { competence_date: "2026-10-01", cashflow_type: "previsto", notes: "Duplicidade sintética de competência", total_receivable_cents: 1 },
  });
  assert.equal(duplicateForecast.status, 409, "same competence and type cannot be duplicated");
  const actual = await fin("/cashflow-snapshots", {
    method: "POST", cookie: financeiro.cookie,
    body: { competence_date: "2026-10-01", cashflow_type: "realizado", total_receivable_cents: 90000, total_payable_cents: 40000, vencidos_cents: 10000, proximos_pagamentos_cents: 30000, notes: "Snapshot realizado sintético do gate L07 FIN-07" },
  });
  assert.equal(actual.status, 201, "realized cashflow snapshot created alongside forecast");
  assert.equal((await fin("/cashflow-snapshots", { method: "POST", cookie: financeiro.cookie, body: { competence_date: "2026-10-02", cashflow_type: "previsto", total_receivable_cents: -1, notes: "Valor inválido não pode persistir" } })).status, 400, "negative cashflow amount rejected");
  const snapshots = await fin("/cashflow-snapshots?cashflow_type=previsto", { cookie: financeiro.cookie });
  assert.equal(snapshots.status, 200);
  assert.ok(snapshots.body.snapshots.some(row => row.id === forecast.body.snapshot.id), "forecast is listed by type");
  const cashflowAudit = await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action='fin_cashflow_snapshot_create' AND target=$1", [forecast.body.snapshot.id]);
  assert.equal(cashflowAudit.rows[0].n, 1, "cashflow creation is audited");

  const aVencer = await fin("/receivables", { method: "POST", cookie: financeiro.cookie, body: { client_account_id: accountId, contract_id: contractId, competence_date: "2026-10-01", due_date: "2026-10-10", amount_cents: 10000, description: "Recebível sintético a vencer do FIN-07" } });
  assert.equal(aVencer.status, 201);
  const aged = await fin("/aging-receivables", {
    method: "POST", cookie: financeiro.cookie,
    body: { receivable_id: aVencer.body.receivable.id, competence_date: "2026-10-01", due_date: "2026-10-10", amount_cents: 10000, amount_paid_cents: 2500 },
  });
  assert.equal(aged.status, 201, `a vencer aging snapshot created: ${JSON.stringify(aged.body)}`);
  assert.equal(aged.body.aging.bucket, "a_vencer", "future due date is a vencer");
  assert.equal(Number(aged.body.aging.days_overdue), 0);
  assert.equal(Number(aged.body.aging.amount_remaining_cents), 7500, "aging remaining amount is generated");
  assert.equal(aged.body.aging.client_account_id, accountId, "account is derived from canonical receivable");

  const overdueReceivable = await fin("/receivables", { method: "POST", cookie: financeiro.cookie, body: { client_account_id: accountId, contract_id: contractId, competence_date: "2026-08-01", due_date: "2026-08-15", amount_cents: 12000, description: "Recebível sintético vencido do FIN-07" } });
  assert.equal(overdueReceivable.status, 201);
  const overdue = await fin("/aging-receivables", {
    method: "POST", cookie: financeiro.cookie,
    body: { receivable_id: overdueReceivable.body.receivable.id, competence_date: "2026-10-01", due_date: "2026-08-15", amount_cents: 12000, amount_paid_cents: 2000 },
  });
  assert.equal(overdue.status, 201, "overdue aging snapshot created");
  assert.equal(overdue.body.aging.bucket, "vencido_31_60", "47 overdue days map to 31-60 bucket");
  assert.equal(Number(overdue.body.aging.days_overdue), 47);
  assert.equal((await fin("/aging-receivables", { method: "POST", cookie: financeiro.cookie, body: { receivable_id: aVencer.body.receivable.id, competence_date: "2026-10-01", due_date: "2026-10-10", amount_cents: 10000 } })).status, 409, "same receivable and competence cannot be duplicated");
  assert.equal((await fin("/aging-receivables", { method: "POST", cookie: financeiro.cookie, body: { receivable_id: aVencer.body.receivable.id, competence_date: "2026-11-01", due_date: "2026-10-09", amount_cents: 10000 } })).status, 400, "aging cannot override canonical due date");
  assert.equal((await fin("/aging-receivables?bucket=nao-existe", { cookie: financeiro.cookie })).status, 400, "invalid aging bucket denied");
  const agingRows = await fin("/aging-receivables?bucket=vencido_31_60", { cookie: financeiro.cookie });
  assert.equal(agingRows.status, 200);
  assert.ok(agingRows.body.aging.some(row => row.id === overdue.body.aging.id), "overdue bucket is filterable");
  const agingAudit = await pool.query("SELECT count(*)::int AS n FROM audit_log WHERE action='fin_aging_create' AND target=$1", [aged.body.aging.id]);
  assert.equal(agingAudit.rows[0].n, 1, "aging creation is audited");

  const failedCompetence = "2026-11-01";
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_fin07_unavailable");
  try {
    const failedCashflow = await fin("/cashflow-snapshots", { method: "POST", cookie: financeiro.cookie, body: { competence_date: "2026-11-02", cashflow_type: "previsto", total_receivable_cents: 1, notes: "Snapshot que deve reverter sem auditoria" } });
    assert.equal(failedCashflow.status, 503);
    assert.deepEqual(failedCashflow.body, { error: "audit_unavailable" });
    const failedAging = await fin("/aging-receivables", { method: "POST", cookie: financeiro.cookie, body: { receivable_id: overdueReceivable.body.receivable.id, competence_date: failedCompetence, due_date: "2026-08-15", amount_cents: 12000 } });
    assert.equal(failedAging.status, 503);
    assert.deepEqual(failedAging.body, { error: "audit_unavailable" });
  } finally {
    await pool.query("ALTER TABLE audit_log_fin07_unavailable RENAME TO audit_log");
  }
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM fin_cashflow_snapshots WHERE competence_date='2026-11-02'")).rows[0].n, 0, "failed cashflow leaves no row");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM fin_aging_receivables WHERE receivable_id=$1 AND competence_date=$2", [overdueReceivable.body.receivable.id, failedCompetence])).rows[0].n, 0, "failed aging leaves no row");
});

test("L07 FIN-07: Chromium registra fluxo de caixa e aging com bucket calculado", { skip: !RUN, timeout: 180_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role: "financeiro" });
  const { accountId, contractId } = await insertClientSpace("FIN07 Chromium");
  const receivable = await fin("/receivables", { method: "POST", cookie: financeiro.cookie, body: { client_account_id: accountId, contract_id: contractId, competence_date: "2026-10-01", due_date: "2026-10-20", amount_cents: 18000, description: "Recebível sintético da jornada FIN-07 no Chromium" } });
  assert.equal(receivable.status, 201);
  const browser = await playwrightChromium.launch({ executablePath: await packagedChromium.executablePath(), headless: true, args: packagedChromium.args.filter(arg => arg !== "--disable-web-security") });
  try {
    const context = await browser.newContext();
    const pair = financeiro.cookie.split(";")[0];
    const separator = pair.indexOf("=");
    await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl }]);
    const page = await context.newPage();
    await page.setExtraHTTPHeaders({ origin: baseUrl });
    await page.goto(`${baseUrl}/admin/financeiro`, { waitUntil: "networkidle" });
    await page.getByTestId("finance-tab-cashflow").click();
    await page.waitForSelector('[data-testid="fin07-cashflow"]');

    const suffix = uuid().slice(0, 8);
    await page.getByTestId("fin07-cashflow-competence").fill("2026-10-02");
    await page.getByTestId("fin07-total-receivable").fill("18000");
    await page.getByTestId("fin07-total-payable").fill("6000");
    await page.getByTestId("fin07-overdue").fill("2500");
    await page.getByTestId("fin07-upcoming").fill("9000");
    await page.getByTestId("fin07-cashflow-notes").fill(`Snapshot previsto criado pelo Chromium no gate FIN-07 ${suffix}`);
    await page.getByTestId("fin07-create-cashflow").click();
    await page.waitForSelector('[data-testid="fin07-notice"], [data-testid="fin07-error"]');
    const cashflowFeedback = await page.locator('[data-testid="fin07-notice"], [data-testid="fin07-error"]').first().textContent();
    assert.match(cashflowFeedback || "", /fluxo de caixa/, `cashflow UI feedback: ${cashflowFeedback}`);
    const uiSnapshot = await pool.query("SELECT id, balance_cents FROM fin_cashflow_snapshots WHERE competence_date='2026-10-02' AND cashflow_type='previsto' ORDER BY created_at DESC LIMIT 1");
    assert.equal(uiSnapshot.rows.length, 1);
    assert.equal(Number(uiSnapshot.rows[0].balance_cents), 12000);

    await page.getByTestId("fin07-aging-receivable").selectOption(receivable.body.receivable.id);
    await page.getByTestId("fin07-aging-competence").fill("2026-10-02");
    await page.getByTestId("fin07-aging-amount").fill("18000");
    await page.getByTestId("fin07-aging-paid").fill("3000");
    await page.getByTestId("fin07-create-aging").click();
    await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="fin07-error"]')) || (document.querySelector('[data-testid="fin07-notice"]')?.textContent || "").includes("aging sintético"));
    const agingFeedback = await page.locator('[data-testid="fin07-error"], [data-testid="fin07-notice"]').first().textContent();
    assert.match(agingFeedback || "", /aging sintético/, `aging UI feedback: ${agingFeedback}`);
    const uiAging = await pool.query("SELECT bucket, amount_remaining_cents FROM fin_aging_receivables WHERE receivable_id=$1", [receivable.body.receivable.id]);
    assert.equal(uiAging.rows.length, 1);
    assert.equal(uiAging.rows[0].bucket, "a_vencer");
    assert.equal(Number(uiAging.rows[0].amount_remaining_cents), 15000);
  } finally {
    await browser.close();
  }
});

test("L07 FIN-09: resultado gerencial incompleto, referências canônicas e auditoria transacional", { skip: !RUN, timeout: 120_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role: "financeiro" });
  const canonical = await insertClientSpace("FIN09 HTTP");
  assert.equal((await fin("/management-results")).status, 401);
  const invalid = await fin("/management-results", { method:"POST", cookie:financeiro.cookie, body:{ contract_id:"not-a-uuid", competence_date:"2026-10-01", is_complete:false, incomplete_reason:"Dados sintéticos ainda incompletos para revisão" } });
  assert.equal(invalid.status, 400);
  const created = await fin("/management-results", { method:"POST", cookie:financeiro.cookie, body:{ client_account_id:canonical.accountId, competence_date:"2026-10-01", revenue_received_cents:80000, costs_cents:50000, is_complete:false, incomplete_reason:"Receita faturada e caixa ainda dependem da conferência sintética" } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.result.status, "incompleto");
  assert.equal(Number(created.body.result.margin_cents), 30000);
  const duplicate = await fin("/management-results", { method:"POST", cookie:financeiro.cookie, body:{ client_account_id:canonical.accountId, competence_date:"2026-10-01", revenue_received_cents:80000, costs_cents:50000, is_complete:false, incomplete_reason:"Tentativa duplicada de resultado sintético para a mesma competência" } });
  assert.equal(duplicate.status, 409);
  const listed = await fin(`/management-results?client_account_id=${canonical.accountId}&is_complete=false`, { cookie:financeiro.cookie });
  assert.equal(listed.status, 200); assert.equal(listed.body.results.length, 1);
  const history = await fin(`/result-history?result_id=${created.body.result.id}`, { cookie:financeiro.cookie });
  assert.equal(history.status, 200); assert.equal(history.body.history.length, 1);
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_fin09_unavailable");
  try {
    const failed = await fin("/management-results", { method:"POST", cookie:financeiro.cookie, body:{ client_account_id:canonical.accountId, competence_date:"2026-11-01", revenue_received_cents:1000, costs_cents:500, is_complete:false, incomplete_reason:"Registro sintético deve reverter quando a auditoria está indisponível" } });
    assert.equal(failed.status, 503); assert.deepEqual(failed.body, {error:"audit_unavailable"});
  } finally { await pool.query("ALTER TABLE audit_log_fin09_unavailable RENAME TO audit_log"); }
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM fin_management_results WHERE client_account_id=$1 AND competence_date='2026-11-01'", [canonical.contractId])).rows[0].n, 0);
});

test("L07 FIN-09: Chromium registra resultado gerencial incompleto", { skip: !RUN, timeout: 180_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role:"financeiro" });
  const canonical = await insertClientSpace("FIN09 Chromium");
  const browser = await playwrightChromium.launch({ executablePath:await packagedChromium.executablePath(), headless:true, args:packagedChromium.args.filter(arg=>arg!=="--disable-web-security") });
  try { const context=await browser.newContext(); const pair=financeiro.cookie.split(";")[0], separator=pair.indexOf("="); await context.addCookies([{name:pair.slice(0,separator),value:pair.slice(separator+1),url:baseUrl}]); const page=await context.newPage(); await page.setExtraHTTPHeaders({origin:baseUrl}); await page.goto(`${baseUrl}/admin/financeiro`,{waitUntil:"networkidle"}); await page.getByTestId("finance-tab-results").click(); await page.waitForSelector('[data-testid="fin09-results"]'); await page.getByTestId("fin09-account").fill(canonical.accountId); await page.getByTestId("fin09-competence").fill("2026-12-01"); await page.getByTestId("fin09-received").fill("70000"); await page.getByTestId("fin09-costs").fill("45000"); await page.getByTestId("fin09-reason").fill("Faturamento sintético ainda aguarda conferência do período"); await page.getByTestId("fin09-create").click(); await page.waitForFunction(()=>Boolean(document.querySelector('[data-testid="fin09-notice"]'))||Boolean(document.querySelector('[data-testid="fin09-error"]'))); const feedback=await page.locator('[data-testid="fin09-notice"], [data-testid="fin09-error"]').first().textContent(); assert.match(feedback||"",/incompleto/, `FIN09 UI feedback: ${feedback}`); const row=await pool.query("SELECT status,is_complete FROM fin_management_results WHERE client_account_id=$1 AND competence_date='2026-12-01'",[canonical.accountId]); assert.equal(row.rows[0].status,"incompleto"); assert.equal(row.rows[0].is_complete,false); } finally { await browser.close(); }
});

test("L07 FIN-08: custos por cliente/contrato/posto e importação com rateio documentado", { skip: !RUN, timeout: 120_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role: "financeiro" });
  const rh = await provisionAndLoginStaff(pool, api, { role: "rh" });
  const canonical = await insertCostSpace("FIN08 HTTP");
  const other = await insertCostSpace("FIN08 OUTRO");
  const storageKey = `synthetic/fin08/${uuid()}.csv`;

  assert.equal((await fin("/cost-imports")).status, 401, "anonymous import read denied");
  assert.equal((await fin("/costs", { cookie: rh.cookie })).status, 403, "rh cost read denied");
  assert.equal((await fin("/cost-imports", { method:"POST", cookie:financeiro.cookie, origin:"https://externo.example", body:{ source:"pessoal" } })).status, 403, "cross-origin import denied");
  assert.equal((await fin("/costs?contract_id=nao-uuid", { cookie:financeiro.cookie })).status, 400, "invalid filter denied");

  const imported = await fin("/cost-imports", { method:"POST", cookie:financeiro.cookie, body:{
    source:"pessoal", file_name:"custos-pessoal-sinteticos.csv", file_url:"local://synthetic/fin08/pessoal.csv",
    storage_key:storageKey, competence_date:"2026-10-01", total_costs_cents:100000, total_records:2,
  }});
  assert.equal(imported.status, 201, JSON.stringify(imported.body));
  assert.equal(imported.body.synthetic, true);
  assert.match(imported.body.import.protocol, /^COST-IMP-\d{8}-[A-Z0-9]{4}$/);
  assert.equal((await fin("/cost-imports", { method:"POST", cookie:financeiro.cookie, body:{ source:"pessoal", file_name:"duplicado.csv", file_url:"local://synthetic/duplicado.csv", storage_key:storageKey, competence_date:"2026-10-01" } })).status, 409, "storage key is idempotent");
  assert.equal((await fin("/cost-imports", { method:"POST", cookie:financeiro.cookie, body:{ source:"invalida", file_name:"x.csv", file_url:"local://x.csv", storage_key:`synthetic/${uuid()}`, competence_date:"2026-10-01" } })).status, 400, "unknown source denied");

  const allocation = await fin("/costs", { method:"POST", cookie:financeiro.cookie, body:{
    import_id:imported.body.import.id, import_record_key:"linha-pessoal-001",
    client_account_id:canonical.accountId, contract_id:canonical.contractId, post_id:canonical.postId,
    cost_source:"pessoal", competence_date:"2026-10-01", source_amount_cents:100000,
    description:"Custo sintético de pessoal alocado ao posto do contrato FIN-08",
    rateio_rule:"Cinquenta por cento conforme escala sintética aprovada para o posto",
    rateio_percent:50,
  }});
  assert.equal(allocation.status, 201, JSON.stringify(allocation.body));
  assert.equal(Number(allocation.body.cost.source_amount_cents), 100000);
  assert.equal(Number(allocation.body.cost.amount_cents), 50000, "allocated amount is derived from source and percent");
  assert.equal(allocation.body.cost.client_account_id, canonical.accountId);
  assert.equal(allocation.body.cost.contract_id, canonical.contractId);
  assert.equal(allocation.body.cost.post_id, canonical.postId);
  assert.equal((await fin("/costs", { method:"POST", cookie:financeiro.cookie, body:{ import_id:imported.body.import.id, import_record_key:"linha-pessoal-001", client_account_id:canonical.accountId, contract_id:canonical.contractId, post_id:canonical.postId, cost_source:"pessoal", competence_date:"2026-10-01", source_amount_cents:1000, description:"Registro sintético duplicado da importação de pessoal", rateio_rule:"Rateio integral sintético para validar idempotência", rateio_percent:100 } })).status, 409, "same imported record cannot be duplicated");
  assert.equal((await fin("/costs", { method:"POST", cookie:financeiro.cookie, body:{ client_account_id:canonical.accountId, contract_id:other.contractId, cost_source:"material", competence_date:"2026-10-01", source_amount_cents:1000, description:"Custo sintético com contrato de outra conta", rateio_rule:"Rateio integral inválido entre contas diferentes", rateio_percent:100 } })).status, 400, "contract from another account denied");
  assert.equal((await fin("/costs", { method:"POST", cookie:financeiro.cookie, body:{ client_account_id:canonical.accountId, contract_id:canonical.contractId, post_id:other.postId, cost_source:"material", competence_date:"2026-10-01", source_amount_cents:1000, description:"Custo sintético com posto fora do escopo", rateio_rule:"Rateio integral inválido para posto de outro contrato", rateio_percent:100 } })).status, 400, "post outside contract scope denied");
  assert.equal((await fin("/costs", { method:"POST", cookie:financeiro.cookie, body:{ import_id:imported.body.import.id, import_record_key:"linha-material-002", client_account_id:canonical.accountId, contract_id:canonical.contractId, cost_source:"material", competence_date:"2026-10-01", source_amount_cents:1000, description:"Custo sintético com origem divergente da importação", rateio_rule:"Rateio integral sintético com origem divergente", rateio_percent:100 } })).status, 400, "cost must match import source");
  assert.equal((await fin("/costs", { method:"POST", cookie:financeiro.cookie, body:{ client_account_id:canonical.accountId, contract_id:canonical.contractId, cost_source:"supervisao", competence_date:"2026-10-01", source_amount_cents:10000, amount_cents:9000, description:"Custo sintético com cálculo de rateio adulterado", rateio_rule:"Metade do custo conforme supervisão compartilhada documentada", rateio_percent:50 } })).status, 400, "forged allocated amount denied");

  const listing = await fin(`/costs?contract_id=${canonical.contractId}&cost_source=pessoal&competence_date=2026-10-01`, { cookie:financeiro.cookie });
  assert.equal(listing.status, 200);
  assert.ok(listing.body.costs.some(cost=>cost.id===allocation.body.cost.id), "allocation is filterable");
  const importListing = await fin("/cost-imports", { cookie:financeiro.cookie });
  const importSummary = importListing.body.imports.find(item=>item.id===imported.body.import.id);
  assert.equal(Number(importSummary.allocated_costs_cents), 50000);
  assert.equal(Number(importSummary.allocated_records), 1);
  const audit = await pool.query("SELECT action FROM audit_log WHERE target IN ($1,$2) ORDER BY action", [imported.body.import.id, allocation.body.cost.id]);
  assert.deepEqual(audit.rows.map(row=>row.action), ["fin_cost_create", "fin_cost_import_create"]);

  await assert.rejects(
    pool.query(`INSERT INTO fin_costs (client_account_id,contract_id,cost_source,competence_date,source_amount_cents,amount_cents,description,rateio_rule,rateio_percent) VALUES ($1,$2,'outro','2026-10-01',10000,9000,'Custo sintético direto adulterado','Regra direta de cinquenta por cento documentada',50)`, [canonical.accountId, canonical.contractId]),
    /allocated amount does not match documented rateio/,
    "database rejects direct forged allocation"
  );

  const failedStorage = `synthetic/fin08/rollback-${uuid()}.csv`;
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_fin08_unavailable");
  try {
    const failedImport = await fin("/cost-imports", { method:"POST", cookie:financeiro.cookie, body:{ source:"material", file_name:"rollback.csv", file_url:"local://synthetic/rollback.csv", storage_key:failedStorage, competence_date:"2026-11-01", total_costs_cents:1000, total_records:1 } });
    assert.equal(failedImport.status, 503);
    assert.deepEqual(failedImport.body, { error:"audit_unavailable" });
    const failedCost = await fin("/costs", { method:"POST", cookie:financeiro.cookie, body:{ client_account_id:canonical.accountId, contract_id:canonical.contractId, cost_source:"supervisao", competence_date:"2026-11-01", source_amount_cents:7000, description:"Custo sintético que deve reverter sem auditoria", rateio_rule:"Rateio integral para testar rollback da auditoria indisponível", rateio_percent:100 } });
    assert.equal(failedCost.status, 503);
    assert.deepEqual(failedCost.body, { error:"audit_unavailable" });
  } finally {
    await pool.query("ALTER TABLE audit_log_fin08_unavailable RENAME TO audit_log");
  }
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM fin_cost_imports WHERE storage_key=$1", [failedStorage])).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM fin_costs WHERE contract_id=$1 AND competence_date='2026-11-01'", [canonical.contractId])).rows[0].n, 0);
});

test("L07 FIN-08: Chromium registra importação sintética e custo rateado", { skip: !RUN, timeout: 180_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role:"financeiro" });
  const canonical = await insertCostSpace("FIN08 Chromium");
  const suffix = uuid().slice(0,8);
  const browser = await playwrightChromium.launch({ executablePath:await packagedChromium.executablePath(), headless:true, args:packagedChromium.args.filter(arg=>arg!=="--disable-web-security") });
  try {
    const context = await browser.newContext();
    const pair=financeiro.cookie.split(";")[0]; const separator=pair.indexOf("=");
    await context.addCookies([{ name:pair.slice(0,separator), value:pair.slice(separator+1), url:baseUrl }]);
    const page=await context.newPage(); await page.setExtraHTTPHeaders({ origin:baseUrl });
    await page.goto(`${baseUrl}/admin/financeiro`, { waitUntil:"networkidle" });
    await page.getByTestId("finance-tab-costs").click();
    await page.waitForSelector('[data-testid="fin08-costs"]');

    await page.getByTestId("fin08-import-source").selectOption("material");
    await page.getByTestId("fin08-import-file-name").fill(`materiais-${suffix}.csv`);
    await page.getByTestId("fin08-import-file-url").fill(`local://synthetic/fin08/${suffix}.csv`);
    await page.getByTestId("fin08-import-storage-key").fill(`synthetic/fin08/chromium-${suffix}.csv`);
    await page.getByTestId("fin08-import-competence").fill("2026-12-01");
    await page.getByTestId("fin08-import-total").fill("30000");
    await page.getByTestId("fin08-import-records").fill("1");
    await page.getByTestId("fin08-create-import").click();
    await page.waitForFunction(()=>(document.querySelector('[data-testid="fin08-notice"]')?.textContent||"").includes("Importação sintética"));
    const imported = await pool.query("SELECT id FROM fin_cost_imports WHERE storage_key=$1", [`synthetic/fin08/chromium-${suffix}.csv`]);
    assert.equal(imported.rows.length,1);

    await page.getByTestId("fin08-cost-import").selectOption(imported.rows[0].id);
    await page.getByTestId("fin08-cost-record-key").fill("material-chromium-001");
    await page.getByTestId("fin08-cost-account").fill(canonical.accountId);
    await page.getByTestId("fin08-cost-contract").fill(canonical.contractId);
    await page.getByTestId("fin08-cost-post").fill(canonical.postId);
    await page.getByTestId("fin08-cost-source-amount").fill("30000");
    await page.getByTestId("fin08-cost-percent").fill("40");
    await page.getByTestId("fin08-cost-rule").fill("Quarenta por cento conforme consumo sintético documentado do posto");
    await page.getByTestId("fin08-cost-description").fill("Materiais sintéticos consumidos pelo posto na competência do gate Chromium");
    await page.getByTestId("fin08-cost-material").fill("Kit sintético de materiais FIN-08");
    await page.getByTestId("fin08-create-cost").click();
    await page.waitForFunction(()=>(document.querySelector('[data-testid="fin08-notice"]')?.textContent||"").includes("rateio documentado"));
    const cost = await pool.query("SELECT amount_cents,source_amount_cents,rateio_percent,client_account_id,contract_id,post_id FROM fin_costs WHERE import_id=$1", [imported.rows[0].id]);
    assert.equal(cost.rows.length,1);
    assert.equal(Number(cost.rows[0].source_amount_cents),30000);
    assert.equal(Number(cost.rows[0].amount_cents),12000);
    assert.equal(Number(cost.rows[0].rateio_percent),40);
    assert.equal(cost.rows[0].client_account_id,canonical.accountId);
    assert.equal(cost.rows[0].contract_id,canonical.contractId);
    assert.equal(cost.rows[0].post_id,canonical.postId);
    await page.waitForFunction(()=>(document.querySelector('[data-testid="fin08-cost-list"]')?.textContent||"").includes("R$ 120,00"));
    assert.match(await page.getByTestId("fin08-cost-list").textContent()||"", /R\$ 120,00/);
  } finally { await browser.close(); }
});

test("L07 FIN-10: despesas, reembolsos e compras têm alçada, segregação, evidência sintética e auditoria fail-closed", { skip: !RUN, timeout: 120_000 }, async () => {
  const requester=await provisionAndLoginStaff(pool,api,{role:"financeiro"});
  const approver=await provisionAndLoginStaff(pool,api,{role:"financeiro"});
  const weakApprover=await provisionAndLoginStaff(pool,api,{role:"financeiro"});
  const rh=await provisionAndLoginStaff(pool,api,{role:"rh"});
  const space=await insertExpenseSpace("HTTP");
  await pool.query("INSERT INTO fin_expense_approval_authorities (identity_id,max_amount_cents,granted_by_identity) VALUES ($1,100000,$1)",[approver.id]);
  await pool.query("INSERT INTO fin_expense_approval_authorities (identity_id,max_amount_cents,granted_by_identity) VALUES ($1,1000,$1)",[weakApprover.id]);

  assert.equal((await fin("/expenses")).status,401);
  assert.equal((await fin("/expenses",{cookie:rh.cookie})).status,403);
  assert.equal((await fin("/expenses",{method:"POST",cookie:requester.cookie,origin:"https://externo.invalid",body:expensePayload(space,"cross-origin")})).status,403);
  const externalEvidence=await fin("/expenses",{method:"POST",cookie:requester.cookie,body:expensePayload(space,"external",{evidence_file_url:"https://storage.example/evidence.pdf"})});
  assert.equal(externalEvidence.status,400,"external evidence is denied");
  const unknownReference=await fin("/expenses",{method:"POST",cookie:requester.cookie,body:expensePayload({...space,supplierId:uuid()},"unknown-ref")});
  assert.equal(unknownReference.status,404,"unknown canonical reference is denied");

  const created=await fin("/expenses",{method:"POST",cookie:requester.cookie,body:expensePayload(space,"approve")});
  assert.equal(created.status,201,JSON.stringify(created.body));
  assert.equal(created.body.synthetic,true);
  assert.equal(created.body.expense.requester_identity,requester.id,"requester is the authenticated identity");
  assert.equal(created.body.expense.status,"pendente");
  assert.match(created.body.expense.protocol,/^DES-FIN-\d{8}-[A-Z0-9]{4}$/);
  assert.equal((await fin("/expenses",{method:"POST",cookie:requester.cookie,body:expensePayload(space,"approve",{evidence_storage_key:"synthetic/fin10/other-approve.json",evidence_file_url:"synthetic://fin10/other-approve.json"})})).status,409,"idempotency key is unique under concurrency-safe database constraint");
  assert.equal((await fin("/expenses",{method:"PATCH",cookie:requester.cookie,body:{id:created.body.expense.id,status:"aprovado",reason:"Solicitante não pode aprovar a própria compra"}})).status,403);
  assert.equal((await fin("/expenses",{method:"PATCH",cookie:weakApprover.cookie,body:{id:created.body.expense.id,status:"aprovado",reason:"Alçada insuficiente deve impedir a aprovação"}})).status,403);
  const approved=await fin("/expenses",{method:"PATCH",cookie:approver.cookie,body:{id:created.body.expense.id,status:"aprovado",reason:"Valor sintético conferido dentro da alçada cadastrada"}});
  assert.equal(approved.status,200,JSON.stringify(approved.body));
  assert.equal(approved.body.expense.approver_identity,approver.id);
  assert.equal(approved.body.expense.approved_by_identity,approver.id);
  assert.notEqual(approved.body.expense.requester_identity,approved.body.expense.approver_identity);
  assert.equal((await fin("/expenses",{method:"PATCH",cookie:approver.cookie,body:{id:created.body.expense.id,status:"rejeitado",reason:"Transição terminal não pode ser repetida"}})).status,409);

  const rejected=await fin("/expenses",{method:"POST",cookie:requester.cookie,body:expensePayload(space,"reject",{expense_type:"reembolso"})});
  assert.equal(rejected.status,201);
  assert.equal((await fin("/expenses",{method:"PATCH",cookie:approver.cookie,body:{id:rejected.body.expense.id,status:"rejeitado",reason:"Reembolso sintético rejeitado após conferência segregada"}})).status,200);
  const cancelled=await fin("/expenses",{method:"POST",cookie:requester.cookie,body:expensePayload(space,"cancel",{expense_type:"despesa"})});
  assert.equal(cancelled.status,201);
  assert.equal((await fin("/expenses",{method:"PATCH",cookie:approver.cookie,body:{id:cancelled.body.expense.id,status:"cancelado",reason:"Apenas o solicitante pode cancelar esta solicitação"}})).status,403);
  assert.equal((await fin("/expenses",{method:"PATCH",cookie:requester.cookie,body:{id:cancelled.body.expense.id,status:"cancelado",reason:"Solicitação sintética cancelada pelo próprio solicitante"}})).status,200);

  const direct=await fin("/expenses",{method:"POST",cookie:requester.cookie,body:expensePayload(space,"db-authority",{amount_cents:90000,threshold_cents:90000})});
  assert.equal(direct.status,201);
  await assert.rejects(pool.query("UPDATE fin_expenses SET status='aprovado',approver_identity=$1,approved_by_identity=$1,approved_at=NOW(),is_segregated=true,segregation_checked=true WHERE id=$2",[weakApprover.id,direct.body.expense.id]),/fin_expense_approval_authority_exceeded/,"database also enforces approval authority");

  const history=await fin(`/expense-history?expense_id=${created.body.expense.id}`,{cookie:requester.cookie});
  assert.equal(history.status,200);assert.equal(history.body.history.length,2);
  await assert.rejects(pool.query("UPDATE fin_expense_history SET reason='Tentativa de adulteração do histórico imutável' WHERE expense_id=$1",[created.body.expense.id]),/fin_expense_history_immutable/);
  await assert.rejects(pool.query("DELETE FROM fin_expense_history WHERE expense_id=$1",[created.body.expense.id]),/fin_expense_history_immutable/);

  const rollbackDecision=await fin("/expenses",{method:"POST",cookie:requester.cookie,body:expensePayload(space,"rollback-decision")});
  assert.equal(rollbackDecision.status,201);
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_fin10_unavailable");
  try {
    const failedCreate=await fin("/expenses",{method:"POST",cookie:requester.cookie,body:expensePayload(space,"rollback-create")});
    assert.equal(failedCreate.status,503);assert.deepEqual(failedCreate.body,{error:"audit_unavailable"});assert.equal("details" in failedCreate.body,false);
    const failedDecision=await fin("/expenses",{method:"PATCH",cookie:approver.cookie,body:{id:rollbackDecision.body.expense.id,status:"aprovado",reason:"Decisão deve reverter integralmente sem auditoria disponível"}});
    assert.equal(failedDecision.status,503);assert.deepEqual(failedDecision.body,{error:"audit_unavailable"});
  } finally { await pool.query("ALTER TABLE audit_log_fin10_unavailable RENAME TO audit_log"); }
  assert.equal((await pool.query("SELECT count(*)::int n FROM fin_expenses WHERE idempotency_key='fin10-rollback-create'")).rows[0].n,0);
  assert.equal((await pool.query("SELECT status FROM fin_expenses WHERE id=$1",[rollbackDecision.body.expense.id])).rows[0].status,"pendente");
  assert.equal((await pool.query("SELECT count(*)::int n FROM fin_expense_history WHERE expense_id=$1",[rollbackDecision.body.expense.id])).rows[0].n,1);
});

test("L07 FIN-10: Chromium solicita e outra identidade aprova no workspace financeiro", { skip: !RUN, timeout: 180_000 }, async () => {
  const requester=await provisionAndLoginStaff(pool,api,{role:"financeiro"});
  const approver=await provisionAndLoginStaff(pool,api,{role:"financeiro"});
  const space=await insertExpenseSpace("Chromium");const suffix=uuid().slice(0,8);
  await pool.query("INSERT INTO fin_expense_approval_authorities (identity_id,max_amount_cents,granted_by_identity) VALUES ($1,200000,$1)",[approver.id]);
  const browser=await playwrightChromium.launch({executablePath:await packagedChromium.executablePath(),headless:true,args:packagedChromium.args.filter(arg=>arg!=="--disable-web-security")});
  const addCookie=async(context,cookie)=>{const pair=cookie.split(";")[0],separator=pair.indexOf("=");await context.addCookies([{name:pair.slice(0,separator),value:pair.slice(separator+1),url:baseUrl}]);};
  try {
    const requestContext=await browser.newContext();await addCookie(requestContext,requester.cookie);const requestPage=await requestContext.newPage();await requestPage.setExtraHTTPHeaders({origin:baseUrl});await requestPage.goto(`${baseUrl}/admin/financeiro`,{waitUntil:"networkidle"});await requestPage.getByTestId("finance-tab-expenses").click();await requestPage.waitForSelector('[data-testid="fin10-expenses"]');
    await requestPage.getByTestId("fin10-type").selectOption("compra");await requestPage.getByTestId("fin10-category").fill("equipamento sintético");await requestPage.getByTestId("fin10-description").fill("Compra sintética percorrida integralmente pelo Chromium");await requestPage.getByTestId("fin10-amount").fill("75000");await requestPage.getByTestId("fin10-threshold").fill("75000");await requestPage.getByTestId("fin10-requester-name").fill("Solicitante Chromium");await requestPage.getByTestId("fin10-contract").fill(space.contractId);await requestPage.getByTestId("fin10-cost-center").fill(space.costCenterId);await requestPage.getByTestId("fin10-supplier").fill(space.supplierId);await requestPage.getByTestId("fin10-evidence-name").fill(`evidencia-${suffix}.json`);await requestPage.getByTestId("fin10-evidence-url").fill(`synthetic://fin10/chromium-${suffix}.json`);await requestPage.getByTestId("fin10-evidence-key").fill(`synthetic/fin10/chromium-${suffix}.json`);await requestPage.getByTestId("fin10-idempotency").fill(`fin10-chromium-${suffix}`);await requestPage.getByTestId("fin10-create").click();await requestPage.waitForFunction(()=>(document.querySelector('[data-testid="fin10-notice"]')?.textContent||"").includes("pendente"));
    const row=await pool.query("SELECT id,status,requester_identity FROM fin_expenses WHERE idempotency_key=$1",[`fin10-chromium-${suffix}`]);assert.equal(row.rows[0].status,"pendente");assert.equal(row.rows[0].requester_identity,requester.id);
    await requestContext.clearCookies();await addCookie(requestContext,approver.cookie);await requestPage.goto(`${baseUrl}/admin/financeiro`,{waitUntil:"networkidle"});await requestPage.getByTestId("finance-tab-expenses").click();await requestPage.waitForSelector(`[data-testid="fin10-expense-${row.rows[0].id}"]`);await requestPage.getByTestId("fin10-decision-reason").fill("Compra sintética conferida e aprovada por identidade distinta");await requestPage.getByTestId(`fin10-approve-${row.rows[0].id}`).click();await requestPage.waitForFunction(()=>(document.querySelector('[data-testid="fin10-notice"]')?.textContent||"").includes("alçada"));
    const final=await pool.query("SELECT status,requester_identity,approver_identity FROM fin_expenses WHERE id=$1",[row.rows[0].id]);assert.equal(final.rows[0].status,"aprovado");assert.equal(final.rows[0].approver_identity,approver.id);assert.notEqual(final.rows[0].requester_identity,final.rows[0].approver_identity);
  } finally {await browser.close();}
});

// FIN-11 — integração contábil/fiscal mediante provedor. A obrigação é
// determinada pela atividade através de regra canônica explícita; o gate prova
// que NFS-e não é assumida para tudo e que nada é emitido de verdade.
async function insertFiscalSpace(label) {
  const contractId = uuid(), accountId = uuid();
  await pool.query("INSERT INTO crm_contracts (id,proposal_version,title,status,origin,idempotency_key,created_by) VALUES ($1,1,$2,'ativo','manual',$3,'admin')",[contractId,`Contrato sintético FIN-11 ${label}`,`fin11-contract-${label}-${contractId}`]);
  await pool.query("INSERT INTO client_accounts (id,display_name,status,created_by) VALUES ($1,$2,'active','marcelo')",[accountId,`QA L07 FIN-11 Conta ${label} ${accountId.slice(0,6)}`]);
  return { contractId, accountId };
}
const providerPayload = (suffix, overrides = {}) => ({ name:`Provedor sintético ${suffix}`, provider_code:`prov-${suffix}`, supported_obligations:["nfse"], idempotency_key:`fin11-prov-${suffix}`, ...overrides });
const obligationPayload = (space, suffix, overrides = {}) => ({ contract_id:space.contractId, client_account_id:space.accountId, activity_type:"vigilancia_patrimonial", description:"Obrigação sintética determinada pela atividade do contrato", idempotency_key:`fin11-obl-${suffix}`, ...overrides });
const documentPayload = (suffix, overrides = {}) => ({ amount_cents:125000, file_name:`documento-${suffix}.json`, file_url:`synthetic://fin11/${suffix}.json`, storage_key:`synthetic/fin11/${suffix}.json`, idempotency_key:`fin11-doc-${suffix}`, ...overrides });

test("L07 FIN-11: provedor e obrigação separados, obrigação determinada pela atividade, nenhuma emissão real e auditoria fail-closed", { skip: !RUN, timeout: 120_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role:"financeiro" });
  const rh = await provisionAndLoginStaff(pool, api, { role:"rh" });
  const tag = uuid().slice(0,8);
  const space = await insertFiscalSpace(`http-${tag}`);

  // Autorização e borda
  assert.equal((await fin("/fiscal-providers")).status, 401);
  assert.equal((await fin("/fiscal-obligations", { cookie: rh.cookie })).status, 403);
  assert.equal((await fin("/fiscal-activity-rules", { cookie: rh.cookie })).status, 403);
  assert.equal((await fin("/fiscal-providers", { method:"POST", cookie: financeiro.cookie, origin:"https://externo.invalid", body: providerPayload(`origin-${tag}`) })).status, 403);

  // O catálogo de regras cobre obrigações distintas: nenhuma nota única.
  const rules = await fin("/fiscal-activity-rules", { cookie: financeiro.cookie });
  assert.equal(rules.status, 200);
  const byType = new Set(rules.body.rules.map(rule => rule.obligation_type));
  for (const expected of ["nfse","nfe","nfce","cte","outro"]) assert.ok(byType.has(expected), `catálogo precisa determinar ${expected}`);
  const vigilancia = rules.body.rules.find(rule => rule.activity_code === "vigilancia_patrimonial");
  const venda = rules.body.rules.find(rule => rule.activity_code === "venda_equipamento_seguranca");
  assert.equal(vigilancia.obligation_type, "nfse");
  assert.equal(venda.obligation_type, "nfe");

  // Provedor: sandbox, sem credenciais, idempotente, estados explícitos.
  assert.equal((await fin("/fiscal-providers", { method:"POST", cookie: financeiro.cookie, body: providerPayload(`nocode-${tag}`, { provider_code:"X" }) })).status, 400);
  assert.equal((await fin("/fiscal-providers", { method:"POST", cookie: financeiro.cookie, body: providerPayload(`creds-${tag}`, { config:{ token:"abc" } }) })).status, 400);
  assert.equal((await fin("/fiscal-providers", { method:"POST", cookie: financeiro.cookie, body: providerPayload(`empty-${tag}`, { supported_obligations:[] }) })).status, 400);
  const provider = await fin("/fiscal-providers", { method:"POST", cookie: financeiro.cookie, body: providerPayload(`main-${tag}`, { supported_obligations:["nfse","nfe"] }) });
  assert.equal(provider.status, 201, JSON.stringify(provider.body));
  assert.equal(provider.body.provider.status, "nao_configurado");
  assert.equal(provider.body.provider.environment, "sandbox");
  assert.deepEqual(provider.body.provider.supported_obligations, ["nfse","nfe"]);
  assert.equal((await fin("/fiscal-providers", { method:"POST", cookie: financeiro.cookie, body: providerPayload(`main-${tag}`, { name:`Outro ${tag}`, provider_code:`outro-${tag}` }) })).status, 409, "idempotência do provedor");
  assert.equal((await fin("/fiscal-providers", { method:"PATCH", cookie: financeiro.cookie, body:{ id: provider.body.provider.id, status:"configurado", reason:"curto" } })).status, 400);
  assert.equal((await fin("/fiscal-providers", { method:"PATCH", cookie: financeiro.cookie, body:{ id: provider.body.provider.id, status:"emitido", reason:"Transição inexistente deve ser recusada" } })).status, 400);
  const configured = await fin("/fiscal-providers", { method:"PATCH", cookie: financeiro.cookie, body:{ id: provider.body.provider.id, status:"configurado", reason:"Provedor sandbox conferido com configuração sintética" } });
  assert.equal(configured.status, 200, JSON.stringify(configured.body));
  assert.equal(configured.body.provider.status, "configurado");
  assert.ok(configured.body.provider.last_processed_at);
  assert.equal((await fin("/fiscal-providers", { method:"PATCH", cookie: financeiro.cookie, body:{ id: provider.body.provider.id, status:"configurado", reason:"Repetir o mesmo estado não é transição" } })).status, 409);

  // Obrigação: determinada pela regra da atividade; o cliente não escolhe.
  assert.equal((await fin("/fiscal-obligations", { method:"POST", cookie: financeiro.cookie, body: obligationPayload(space, `rule-${tag}`, { rule:"texto livre proibido" }) })).status, 400);
  assert.equal((await fin("/fiscal-obligations", { method:"POST", cookie: financeiro.cookie, body: obligationPayload(space, `unknown-${tag}`, { activity_type:"atividade_inexistente" }) })).status, 404);
  const forced = await fin("/fiscal-obligations", { method:"POST", cookie: financeiro.cookie, body: obligationPayload(space, `forced-${tag}`, { obligation_type:"nfe" }) });
  assert.equal(forced.status, 409, "não se assume a obrigação: ela vem da regra da atividade");
  assert.equal(forced.body.error, "obligation_type_determined_by_activity_rule");
  assert.equal(forced.body.determined_obligation_type, "nfse");
  assert.equal((await fin("/fiscal-obligations", { method:"POST", cookie: financeiro.cookie, body: obligationPayload({ contractId: uuid(), accountId: space.accountId }, `ref-${tag}`) })).status, 404);

  const servico = await fin("/fiscal-obligations", { method:"POST", cookie: financeiro.cookie, body: obligationPayload(space, `servico-${tag}`) });
  assert.equal(servico.status, 201, JSON.stringify(servico.body));
  assert.equal(servico.body.obligation.obligation_type, "nfse");
  assert.equal(servico.body.obligation.status, "pendente");
  assert.equal(servico.body.obligation.is_determined, false);
  assert.match(servico.body.obligation.rule, /LC 116\/2003/);
  // Mesma empresa, outra atividade, OUTRA obrigação: prova de que não há nota única.
  const mercadoria = await fin("/fiscal-obligations", { method:"POST", cookie: financeiro.cookie, body: obligationPayload(space, `mercadoria-${tag}`, { activity_type:"venda_equipamento_seguranca" }) });
  assert.equal(mercadoria.status, 201, JSON.stringify(mercadoria.body));
  assert.equal(mercadoria.body.obligation.obligation_type, "nfe");
  const transporte = await fin("/fiscal-obligations", { method:"POST", cookie: financeiro.cookie, body: obligationPayload(space, `transporte-${tag}`, { activity_type:"transporte_valores_interestadual" }) });
  assert.equal(transporte.body.obligation.obligation_type, "cte");
  const locacao = await fin("/fiscal-obligations", { method:"POST", cookie: financeiro.cookie, body: obligationPayload(space, `locacao-${tag}`, { activity_type:"locacao_equipamento_seguranca" }) });
  assert.equal(locacao.body.obligation.obligation_type, "outro");
  assert.equal((await fin("/fiscal-obligations", { method:"POST", cookie: financeiro.cookie, body: obligationPayload(space, `servico-${tag}`, { description:"Outra descrição sintética para a mesma chave" }) })).status, 409, "idempotência da obrigação");
  assert.equal((await fin("/fiscal-obligations", { method:"POST", cookie: financeiro.cookie, body: obligationPayload(space, `duplicada-${tag}`) })).status, 409, "mesma atividade no mesmo contrato não duplica");

  // Documento exige obrigação determinada.
  assert.equal((await fin("/fiscal-documents", { method:"POST", cookie: financeiro.cookie, body: documentPayload(`early-${tag}`, { obligation_id: servico.body.obligation.id, provider_id: provider.body.provider.id }) })).status, 409);
  const determined = await fin("/fiscal-obligations", { method:"PATCH", cookie: financeiro.cookie, body:{ id: servico.body.obligation.id, status:"determinada", reason:"Atividade conferida contra a regra canônica do catálogo" } });
  assert.equal(determined.status, 200, JSON.stringify(determined.body));
  assert.equal(determined.body.obligation.is_determined, true);
  assert.equal(determined.body.obligation.determination_rule_reference, vigilancia.rule_reference);
  assert.equal((await fin("/fiscal-obligations", { method:"PATCH", cookie: financeiro.cookie, body:{ id: servico.body.obligation.id, status:"determinada", reason:"Determinar duas vezes não é transição válida" } })).status, 409);

  // Documento: tipo vem da obrigação, provedor precisa suportar, nada externo.
  assert.equal((await fin("/fiscal-documents", { method:"POST", cookie: financeiro.cookie, body: documentPayload(`external-${tag}`, { obligation_id: servico.body.obligation.id, provider_id: provider.body.provider.id, file_url:"https://nfse.example/real.xml" }) })).status, 400);
  const forcedType = await fin("/fiscal-documents", { method:"POST", cookie: financeiro.cookie, body: documentPayload(`forcedtype-${tag}`, { obligation_id: servico.body.obligation.id, provider_id: provider.body.provider.id, document_type:"cte" }) });
  assert.equal(forcedType.status, 409);
  assert.equal(forcedType.body.error, "document_type_determined_by_obligation");

  const narrowProvider = await fin("/fiscal-providers", { method:"POST", cookie: financeiro.cookie, body: providerPayload(`narrow-${tag}`, { supported_obligations:["cte"] }) });
  await fin("/fiscal-providers", { method:"PATCH", cookie: financeiro.cookie, body:{ id: narrowProvider.body.provider.id, status:"configurado", reason:"Provedor sandbox restrito a conhecimento de transporte" } });
  assert.equal((await fin("/fiscal-documents", { method:"POST", cookie: financeiro.cookie, body: documentPayload(`narrow-${tag}`, { obligation_id: servico.body.obligation.id, provider_id: narrowProvider.body.provider.id }) })).status, 409);

  const document = await fin("/fiscal-documents", { method:"POST", cookie: financeiro.cookie, body: documentPayload(`main-${tag}`, { obligation_id: servico.body.obligation.id, provider_id: provider.body.provider.id }) });
  assert.equal(document.status, 201, JSON.stringify(document.body));
  assert.equal(document.body.document.document_type, "nfse");
  assert.equal(document.body.document.status, "rascunho");
  assert.equal(document.body.document.simulated, true);
  assert.equal(document.body.document.is_sandbox, true);
  assert.equal(document.body.emitted, false);
  assert.match(document.body.document.protocol, /^NF-FIN-\d{8}-[A-Z0-9]{4}$/);
  assert.equal((await fin("/fiscal-documents", { method:"POST", cookie: financeiro.cookie, body: documentPayload(`main-${tag}`, { obligation_id: servico.body.obligation.id, provider_id: provider.body.provider.id, file_url:`synthetic://fin11/outro-${tag}.json`, storage_key:`synthetic/fin11/outro-${tag}.json` }) })).status, 409, "idempotência do documento");

  const registered = await fin("/fiscal-documents", { method:"PATCH", cookie: financeiro.cookie, body:{ id: document.body.document.id, status:"emitido", reason:"Registro sintético concluído pelo simulador do provedor" } });
  assert.equal(registered.status, 200, JSON.stringify(registered.body));
  assert.equal(registered.body.document.status, "emitido");
  assert.equal(registered.body.emitted, false, "o gate nunca emite documento fiscal real");
  assert.equal(registered.body.document.provider_response.mode, "synthetic");
  assert.equal(registered.body.document.provider_response.emission, "none");
  assert.equal((await fin("/fiscal-documents", { method:"PATCH", cookie: financeiro.cookie, body:{ id: document.body.document.id, status:"erro", reason:"Voltar de registrado para erro não é transição válida", error_sanitized:"Mensagem sanitizada do simulador" } })).status, 409);
  const cancelled = await fin("/fiscal-documents", { method:"PATCH", cookie: financeiro.cookie, body:{ id: document.body.document.id, status:"cancelado", reason:"Documento sintético cancelado após conferência" } });
  assert.equal(cancelled.status, 200);
  assert.equal((await fin("/fiscal-documents", { method:"PATCH", cookie: financeiro.cookie, body:{ id: document.body.document.id, status:"emitido", reason:"Documento cancelado não volta a ser registrado" } })).status, 409);

  // O banco repete as garantias para escrita direta.
  await assert.rejects(pool.query("UPDATE fin_fiscal_obligations SET obligation_type='cte' WHERE id=$1",[mercadoria.body.obligation.id]), /fin_fiscal_obligation_determination_fields_immutable|fin_fiscal_obligation_type_must_follow_activity_rule/);
  await assert.rejects(pool.query("UPDATE fin_fiscal_obligations SET status='determinada',is_determined=true,determined_by_identity=$1,determined_at=NOW(),determination_rule_reference='regra inventada' WHERE id=$2",[financeiro.id, mercadoria.body.obligation.id]), /fin_fiscal_obligation_determination_reference_mismatch/);
  await assert.rejects(pool.query("UPDATE fin_fiscal_providers SET environment='producao' WHERE id=$1",[provider.body.provider.id]), /fin_fiscal_provider_identity_fields_immutable/);
  await assert.rejects(pool.query("UPDATE fin_fiscal_documents SET simulated=false WHERE id=$1",[document.body.document.id]), /fin_fiscal_document/);
  await assert.rejects(pool.query("UPDATE fin_fiscal_activity_rules SET obligation_type='nfse' WHERE activity_code='venda_equipamento_seguranca'"), /fin_fiscal_activity_rule_immutable/);

  // Histórico imutável e visível.
  const history = await fin(`/fiscal-history?entity_type=obligation&entity_id=${servico.body.obligation.id}`, { cookie: financeiro.cookie });
  assert.equal(history.status, 200);
  assert.equal(history.body.history.length, 2);
  await assert.rejects(pool.query("UPDATE fin_fiscal_history SET reason='Tentativa de adulteração do histórico' WHERE entity_id=$1",[servico.body.obligation.id]), /fin_fiscal_history_immutable/);
  await assert.rejects(pool.query("DELETE FROM fin_fiscal_history WHERE entity_id=$1",[servico.body.obligation.id]), /fin_fiscal_history_immutable/);

  // Auditoria fail-closed com rollback integral e resposta sem detalhe SQL.
  const rollbackObligation = await fin("/fiscal-obligations", { method:"POST", cookie: financeiro.cookie, body: obligationPayload(space, `rollback-${tag}`, { activity_type:"portaria_e_recepcao" }) });
  assert.equal(rollbackObligation.status, 201);
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_fin11_unavailable");
  try {
    const failedProvider = await fin("/fiscal-providers", { method:"POST", cookie: financeiro.cookie, body: providerPayload(`rollback-${tag}`) });
    assert.equal(failedProvider.status, 503); assert.deepEqual(failedProvider.body, { error:"audit_unavailable" });
    const failedObligation = await fin("/fiscal-obligations", { method:"POST", cookie: financeiro.cookie, body: obligationPayload(space, `rollback-create-${tag}`, { activity_type:"monitoramento_eletronico" }) });
    assert.equal(failedObligation.status, 503); assert.equal("details" in failedObligation.body, false);
    const failedTransition = await fin("/fiscal-obligations", { method:"PATCH", cookie: financeiro.cookie, body:{ id: rollbackObligation.body.obligation.id, status:"determinada", reason:"Determinação deve reverter sem auditoria disponível" } });
    assert.equal(failedTransition.status, 503); assert.deepEqual(failedTransition.body, { error:"audit_unavailable" });
  } finally { await pool.query("ALTER TABLE audit_log_fin11_unavailable RENAME TO audit_log"); }
  assert.equal((await pool.query("SELECT count(*)::int n FROM fin_fiscal_providers WHERE idempotency_key=$1",[`fin11-prov-rollback-${tag}`])).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int n FROM fin_fiscal_obligations WHERE idempotency_key=$1",[`fin11-obl-rollback-create-${tag}`])).rows[0].n, 0);
  const preserved = await pool.query("SELECT status,is_determined FROM fin_fiscal_obligations WHERE id=$1",[rollbackObligation.body.obligation.id]);
  assert.equal(preserved.rows[0].status, "pendente");
  assert.equal(preserved.rows[0].is_determined, false);
  assert.equal((await pool.query("SELECT count(*)::int n FROM fin_fiscal_history WHERE entity_id=$1",[rollbackObligation.body.obligation.id])).rows[0].n, 1);
  assert.equal((await pool.query("SELECT count(*)::int n FROM fin_fiscal_documents WHERE status='emitido' AND simulated=false")).rows[0].n, 0, "nenhum documento real foi emitido");
});

test("L07 FIN-11: Chromium determina a obrigação pela atividade e registra documento sintético no workspace financeiro", { skip: !RUN, timeout: 180_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role:"financeiro" });
  const tag = uuid().slice(0,8);
  const space = await insertFiscalSpace(`chromium-${tag}`);
  const browser = await playwrightChromium.launch({ executablePath: await packagedChromium.executablePath(), headless:true, args: packagedChromium.args.filter(arg => arg !== "--disable-web-security") });
  try {
    const context = await browser.newContext();
    const pair = financeiro.cookie.split(";")[0], separator = pair.indexOf("=");
    await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator+1), url: baseUrl }]);
    const page = await context.newPage();
    await page.setExtraHTTPHeaders({ origin: baseUrl });
    await page.goto(`${baseUrl}/admin/financeiro`, { waitUntil:"networkidle" });
    await page.getByTestId("finance-tab-fiscal").click();
    await page.waitForSelector('[data-testid="fin11-fiscal"]');
    await page.waitForSelector('[data-testid="fin11-rule-venda_equipamento_seguranca"]');
    assert.equal((await page.getByTestId("fin11-rule-type-venda_equipamento_seguranca").textContent())?.trim(), "nfe");
    assert.equal((await page.getByTestId("fin11-rule-type-vigilancia_patrimonial").textContent())?.trim(), "nfse");

    await page.getByTestId("fin11-provider-name").fill(`Provedor Chromium ${tag}`);
    await page.getByTestId("fin11-provider-code").fill(`chromium-${tag}`);
    await page.getByTestId("fin11-provider-supports-nfe").check();
    await page.getByTestId("fin11-provider-idempotency").fill(`fin11-ui-prov-${tag}`);
    await page.getByTestId("fin11-provider-create").click();
    await page.waitForFunction(() => (document.querySelector('[data-testid="fin11-notice"]')?.textContent||"").includes("nao_configurado"));
    const providerRow = (await pool.query("SELECT id FROM fin_fiscal_providers WHERE idempotency_key=$1",[`fin11-ui-prov-${tag}`])).rows[0];
    await page.getByTestId("fin11-reason").fill("Provedor sandbox conferido na interface pelo papel financeiro");
    await page.getByTestId(`fin11-provider-configure-${providerRow.id}`).click();
    await page.waitForFunction(id => (document.querySelector(`[data-testid="fin11-provider-status-${id}"]`)?.textContent||"") === "configurado", providerRow.id);

    await page.getByTestId("fin11-obligation-contract").fill(space.contractId);
    await page.getByTestId("fin11-obligation-account").fill(space.accountId);
    await page.getByTestId("fin11-obligation-activity").selectOption("venda_equipamento_seguranca");
    await page.waitForFunction(() => (document.querySelector('[data-testid="fin11-obligation-determined-type"]')?.textContent||"").includes("nfe"));
    await page.getByTestId("fin11-obligation-description").fill("Venda sintética de equipamento conferida na interface do financeiro");
    await page.getByTestId("fin11-obligation-idempotency").fill(`fin11-ui-obl-${tag}`);
    await page.getByTestId("fin11-obligation-create").click();
    await page.waitForFunction(() => (document.querySelector('[data-testid="fin11-notice"]')?.textContent||"").includes("nfe"));
    const obligationRow = (await pool.query("SELECT id,obligation_type,status FROM fin_fiscal_obligations WHERE idempotency_key=$1",[`fin11-ui-obl-${tag}`])).rows[0];
    assert.equal(obligationRow.obligation_type, "nfe", "a atividade de venda determina NF-e, não NFS-e");
    assert.equal(obligationRow.status, "pendente");

    await page.getByTestId("fin11-reason").fill("Obrigação conferida contra a regra canônica antes de determinar");
    await page.getByTestId(`fin11-obligation-determine-${obligationRow.id}`).click();
    await page.waitForFunction(id => (document.querySelector(`[data-testid="fin11-obligation-status-${id}"]`)?.textContent||"") === "determinada", obligationRow.id);

    await page.getByTestId("fin11-document-obligation").selectOption(obligationRow.id);
    await page.getByTestId("fin11-document-provider").selectOption(providerRow.id);
    await page.getByTestId("fin11-document-amount").fill("98000");
    await page.getByTestId("fin11-document-file-name").fill(`documento-${tag}.json`);
    await page.getByTestId("fin11-document-file-url").fill(`synthetic://fin11/ui-${tag}.json`);
    await page.getByTestId("fin11-document-storage-key").fill(`synthetic/fin11/ui-${tag}.json`);
    await page.getByTestId("fin11-document-idempotency").fill(`fin11-ui-doc-${tag}`);
    await page.getByTestId("fin11-document-create").click();
    await page.waitForFunction(() => (document.querySelector('[data-testid="fin11-notice"]')?.textContent||"").includes("Nenhuma emissão fiscal real"));
    const documentRow = (await pool.query("SELECT id,document_type,status FROM fin_fiscal_documents WHERE idempotency_key=$1",[`fin11-ui-doc-${tag}`])).rows[0];
    assert.equal(documentRow.document_type, "nfe");
    assert.equal(documentRow.status, "rascunho");

    await page.getByTestId("fin11-reason").fill("Registro sintético confirmado na interface sem emissão real");
    await page.getByTestId(`fin11-document-register-${documentRow.id}`).click();
    await page.waitForFunction(id => (document.querySelector(`[data-testid="fin11-document-status-${id}"]`)?.textContent||"") === "emitido", documentRow.id);
    const final = (await pool.query("SELECT status,simulated,is_sandbox,provider_response FROM fin_fiscal_documents WHERE id=$1",[documentRow.id])).rows[0];
    assert.equal(final.status, "emitido");
    assert.equal(final.simulated, true);
    assert.equal(final.is_sandbox, true);
    assert.equal(final.provider_response.mode, "synthetic");
    assert.equal(final.provider_response.emission, "none");
  } finally { await browser.close(); }
});

// FIN-12 — boletos/Pix/gateway. O gate prova que a cobrança só existe depois
// de seleção explícita e homologação em sandbox, que a assinatura do webhook é
// verificada de verdade, que o replay é recusado por idempotência, que a
// conciliação é o único caminho para "pago" e que nada cobra de verdade.
const gatewayPayload = (suffix, overrides = {}) => ({ name:`Gateway sintético ${suffix}`, gateway_code:`gw-${suffix}`, gateway_type:"pix", idempotency_key:`fin12-gw-${suffix}`, ...overrides });
async function createReceivable(cookie, space, amount, label) {
  const created = await fin("/receivables", { method:"POST", cookie, body:{ client_account_id: space.accountId, contract_id: space.contractId, competence_date:"2026-11-01", due_date:"2026-11-10", amount_cents: amount, description:`Recebível sintético FIN-12 ${label}` } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body.receivable;
}
async function sandboxGateway(cookie, suffix) {
  const created = await fin("/payment-gateways", { method:"POST", cookie, body: gatewayPayload(suffix) });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.gateway.id;
  assert.equal((await fin("/payment-gateways", { method:"PATCH", cookie, body:{ id, status:"selecionado", reason:"Gateway escolhido explicitamente para a jornada sintética" } })).status, 200);
  assert.equal((await fin("/payment-gateways", { method:"PATCH", cookie, body:{ id, status:"sandbox", reason:"Gateway homologado em sandbox antes de qualquer cobrança" } })).status, 200);
  return id;
}

test("L07 FIN-12: cobrança só após seleção e sandbox, assinatura de webhook verificada, replay recusado, conciliação explícita e auditoria fail-closed", { skip: !RUN, timeout: 120_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role:"financeiro" });
  const rh = await provisionAndLoginStaff(pool, api, { role:"rh" });
  const tag = uuid().slice(0,8);
  const space = await insertClientSpace(`fin12-http-${tag}`);

  // Autorização e borda
  assert.equal((await fin("/payment-gateways")).status, 401);
  assert.equal((await fin("/gateway-charges", { cookie: rh.cookie })).status, 403);
  assert.equal((await fin("/gateway-history", { cookie: rh.cookie })).status, 403);
  assert.equal((await fin("/payment-gateways", { method:"POST", cookie: financeiro.cookie, origin:"https://externo.invalid", body: gatewayPayload(`origin-${tag}`) })).status, 403);

  // Cadastro: sandbox obrigatório, sem credenciais, sem seleção implícita.
  assert.equal((await fin("/payment-gateways", { method:"POST", cookie: financeiro.cookie, body: gatewayPayload(`bad-${tag}`, { gateway_code:"X" }) })).status, 400);
  assert.equal((await fin("/payment-gateways", { method:"POST", cookie: financeiro.cookie, body: gatewayPayload(`creds-${tag}`, { config:{ api_key:"abc" } }) })).status, 400);
  assert.equal((await fin("/payment-gateways", { method:"POST", cookie: financeiro.cookie, body: gatewayPayload(`type-${tag}`, { gateway_type:"carne" }) })).status, 400);
  assert.equal((await fin("/payment-gateways", { method:"POST", cookie: financeiro.cookie, body: gatewayPayload(`selected-${tag}`, { is_selected:true }) })).status, 400, "seleção é transição explícita, não campo de criação");
  assert.equal((await fin("/payment-gateways", { method:"POST", cookie: financeiro.cookie, body: gatewayPayload(`prod-${tag}`, { environment:"producao" }) })).status, 400);

  const created = await fin("/payment-gateways", { method:"POST", cookie: financeiro.cookie, body: gatewayPayload(`main-${tag}`) });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const gatewayId = created.body.gateway.id;
  assert.equal(created.body.gateway.status, "nao_selecionado");
  assert.equal(created.body.gateway.environment, "sandbox");
  assert.equal(created.body.gateway.is_selected, false);
  assert.equal(created.body.gateway.charge_enabled, false);
  assert.equal(created.body.real_charge, false);
  assert.equal("webhook_secret_sandbox" in created.body.gateway, false, "o segredo do simulador não sai do servidor");
  assert.equal((await fin("/payment-gateways", { method:"POST", cookie: financeiro.cookie, body: gatewayPayload(`main-${tag}`, { name:`Outro ${tag}`, gateway_code:`outro-${tag}` }) })).status, 409, "idempotência do gateway");
  assert.equal((await fin("/payment-gateways", { method:"PATCH", cookie: financeiro.cookie, body:{ id: gatewayId, status:"producao", reason:"Produção precisa ser recusada sem cobrança real" } })).status, 400);

  const receivable = await createReceivable(financeiro.cookie, space, 250000, `principal-${tag}`);

  // Nenhuma cobrança antes de seleção e homologação em sandbox.
  const tooEarly = await fin("/gateway-charges", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: gatewayId, receivable_id: receivable.id, amount_cents: 1000, idempotency_key:`fin12-chg-early-${tag}` } });
  assert.equal(tooEarly.status, 409);
  assert.equal(tooEarly.body.error, "gateway_not_selected_sandbox_required");
  assert.equal((await fin("/payment-gateways", { method:"PATCH", cookie: financeiro.cookie, body:{ id: gatewayId, status:"selecionado", reason:"Gateway escolhido explicitamente pelo financeiro" } })).status, 200);
  const selectedOnly = await fin("/gateway-charges", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: gatewayId, receivable_id: receivable.id, amount_cents: 1000, idempotency_key:`fin12-chg-selected-${tag}` } });
  assert.equal(selectedOnly.status, 409, "selecionado ainda não basta: falta homologação sandbox");
  assert.equal(selectedOnly.body.gateway_status, "selecionado");
  const homologated = await fin("/payment-gateways", { method:"PATCH", cookie: financeiro.cookie, body:{ id: gatewayId, status:"sandbox", reason:"Homologação sandbox concluída com simulador local" } });
  assert.equal(homologated.status, 200, JSON.stringify(homologated.body));
  assert.equal(homologated.body.gateway.charge_enabled, true);
  assert.ok(homologated.body.gateway.sandbox_validated_at);
  assert.equal((await fin("/payment-gateways", { method:"PATCH", cookie: financeiro.cookie, body:{ id: gatewayId, status:"sandbox", reason:"Repetir o mesmo estado não é transição" } })).status, 409);
  const backwards = await fin("/payment-gateways", { method:"PATCH", cookie: financeiro.cookie, body:{ id: gatewayId, status:"selecionado", reason:"Voltar de sandbox para selecionado não é transição válida" } });
  assert.equal(backwards.status, 400);
  assert.equal(backwards.body.error, "fin_gateway_invalid_status_transition");

  // Cobrança sintética ligada ao recebível canônico.
  assert.equal((await fin("/gateway-charges", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: gatewayId, amount_cents: 1000, idempotency_key:`fin12-chg-noref-${tag}` } })).status, 400);
  assert.equal((await fin("/gateway-charges", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: gatewayId, receivable_id: receivable.id, amount_cents: 0, idempotency_key:`fin12-chg-zero-${tag}` } })).status, 400);
  const overflow = await fin("/gateway-charges", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: gatewayId, receivable_id: receivable.id, amount_cents: 999999999, idempotency_key:`fin12-chg-over-${tag}` } });
  assert.equal(overflow.status, 400);
  assert.equal(overflow.body.error, "amount_exceeds_receivable_balance");

  const charge = await fin("/gateway-charges", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: gatewayId, receivable_id: receivable.id, amount_cents: 250000, idempotency_key:`fin12-chg-main-${tag}` } });
  assert.equal(charge.status, 201, JSON.stringify(charge.body));
  assert.equal(charge.body.charge.status, "pendente");
  assert.equal(charge.body.charge.simulated, true);
  assert.equal(charge.body.charge.is_sandbox, true);
  assert.equal(charge.body.real_charge, false);
  assert.match(charge.body.charge.protocol, /^CHG-FIN-\d{8}-[A-Z0-9]{4}$/);
  assert.match(charge.body.charge.provider_charge_id, /^synthetic-chg-[0-9a-f]{12}$/);
  const otherReceivable = await createReceivable(financeiro.cookie, space, 90000, `idem-${tag}`);
  assert.equal((await fin("/gateway-charges", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: gatewayId, receivable_id: otherReceivable.id, amount_cents: 1000, idempotency_key:`fin12-chg-main-${tag}` } })).body.error, "duplicate_idempotency_key");
  const doubleCharge = await fin("/gateway-charges", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: gatewayId, receivable_id: receivable.id, amount_cents: 1000, idempotency_key:`fin12-chg-double-${tag}` } });
  assert.equal(doubleCharge.status, 409);
  assert.equal(doubleCharge.body.error, "duplicate_open_charge_for_receivable");
  const forcedPaid = await fin("/gateway-charges", { method:"PATCH", cookie: financeiro.cookie, body:{ id: charge.body.charge.id, status:"pago", reason:"Pagar por edição direta precisa ser recusado" } });
  assert.equal(forcedPaid.status, 409);
  assert.equal(forcedPaid.body.error, "charge_paid_only_via_conciliated_webhook");

  // Webhook: o veredito da assinatura é do servidor, não do cliente.
  const payload = { protocol: charge.body.charge.protocol, amount_cents: 250000, settlement:"synthetic" };
  assert.equal((await fin("/gateway-webhooks", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: gatewayId, event_type:"charge.paid", idempotency_key:`fin12-wh-hex-${tag}`, payload, signature:"assinatura-invalida" } })).status, 400);
  assert.equal((await fin("/gateway-webhooks", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: gatewayId, event_type:"charge.paid", idempotency_key:`fin12-wh-verdict-${tag}`, payload, signature:"a".repeat(64), is_valid_signature:true } })).status, 400, "o cliente não declara o veredito da assinatura");

  const signed = await fin("/gateway-webhook-sign", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: gatewayId, event_type:"charge.paid", idempotency_key:`fin12-wh-main-${tag}`, payload } });
  assert.equal(signed.status, 200, JSON.stringify(signed.body));
  assert.match(signed.body.signature, /^[0-9a-f]{64}$/);
  assert.equal(signed.body.signature_algorithm, "hmac-sha256");
  assert.equal(signed.body.real_provider, false);

  const forged = await fin("/gateway-webhooks", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: gatewayId, event_type:"charge.paid", idempotency_key:`fin12-wh-forged-${tag}`, payload, signature:"f".repeat(64) } });
  assert.equal(forged.status, 400);
  assert.equal(forged.body.error, "webhook_signature_invalid");
  const forgedRow = (await pool.query("SELECT status,is_valid_signature,error_sanitized FROM fin_gateway_webhooks WHERE idempotency_key=$1",[`fin12-wh-forged-${tag}`])).rows[0];
  assert.equal(forgedRow.status, "rejeitado");
  assert.equal(forgedRow.is_valid_signature, false);
  assert.ok(forgedRow.error_sanitized);

  // Assinatura válida só vale para o payload exato que foi assinado.
  assert.equal((await fin("/gateway-webhooks", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: gatewayId, event_type:"charge.paid", idempotency_key:`fin12-wh-tampered-${tag}`, payload:{ ...payload, amount_cents: 1 }, signature: signed.body.signature } })).body.error, "webhook_signature_invalid");

  const webhook = await fin("/gateway-webhooks", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: gatewayId, event_type:"charge.paid", idempotency_key:`fin12-wh-main-${tag}`, payload, signature: signed.body.signature } });
  assert.equal(webhook.status, 201, JSON.stringify(webhook.body));
  assert.equal(webhook.body.webhook.status, "validado");
  assert.equal(webhook.body.webhook.is_valid_signature, true);
  assert.equal(webhook.body.webhook.replay_attempts, 0);

  // Replay: idempotente, sem alterar o recebimento original.
  const replay = await fin("/gateway-webhooks", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: gatewayId, event_type:"charge.paid", idempotency_key:`fin12-wh-main-${tag}`, payload, signature: signed.body.signature } });
  assert.equal(replay.status, 409);
  assert.equal(replay.body.error, "replay_detected");
  assert.equal(replay.body.applied, false);
  assert.equal(replay.body.replay_attempts, 1);
  assert.equal((await fin("/gateway-webhooks", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: gatewayId, event_type:"charge.paid", idempotency_key:`fin12-wh-main-${tag}`, payload, signature: signed.body.signature } })).body.replay_attempts, 2);
  assert.equal((await pool.query("SELECT count(*)::int n FROM fin_gateway_webhooks WHERE idempotency_key=$1",[`fin12-wh-main-${tag}`])).rows[0].n, 1, "replay não cria recebimento novo");

  // Conciliação: webhook rejeitado não concilia e cobrança de outro gateway não casa.
  const rejectedId = (await pool.query("SELECT id FROM fin_gateway_webhooks WHERE idempotency_key=$1",[`fin12-wh-forged-${tag}`])).rows[0].id;
  assert.equal((await fin("/gateway-webhooks", { method:"PATCH", cookie: financeiro.cookie, body:{ id: rejectedId, charge_id: charge.body.charge.id, reason:"Webhook rejeitado não pode conciliar cobrança" } })).body.error, "webhook_not_validated");
  const otherGatewayId = await sandboxGateway(financeiro.cookie, `other-${tag}`);
  const otherCharge = await fin("/gateway-charges", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: otherGatewayId, receivable_id: otherReceivable.id, amount_cents: 90000, idempotency_key:`fin12-chg-other-${tag}` } });
  assert.equal(otherCharge.status, 201, JSON.stringify(otherCharge.body));
  assert.equal((await fin("/gateway-webhooks", { method:"PATCH", cookie: financeiro.cookie, body:{ id: webhook.body.webhook.id, charge_id: otherCharge.body.charge.id, reason:"Webhook de um gateway não concilia cobrança de outro" } })).body.error, "charge_gateway_mismatch");

  const conciliated = await fin("/gateway-webhooks", { method:"PATCH", cookie: financeiro.cookie, body:{ id: webhook.body.webhook.id, status:"conciliado", charge_id: charge.body.charge.id, reason:"Conciliação sintética do webhook validado com a cobrança pendente" } });
  assert.equal(conciliated.status, 200, JSON.stringify(conciliated.body));
  assert.equal(conciliated.body.webhook.status, "conciliado");
  assert.equal(conciliated.body.charge.status, "pago");
  assert.equal(conciliated.body.charge.is_conciliated, true);
  assert.equal(conciliated.body.real_charge, false);
  assert.ok(conciliated.body.charge.settled_at);
  assert.equal((await fin("/gateway-webhooks", { method:"PATCH", cookie: financeiro.cookie, body:{ id: webhook.body.webhook.id, charge_id: charge.body.charge.id, reason:"Conciliar duas vezes precisa ser recusado" } })).body.error, "webhook_already_conciliated");
  const refunded = await fin("/gateway-charges", { method:"PATCH", cookie: financeiro.cookie, body:{ id: charge.body.charge.id, status:"estornado", reason:"Estorno sintético auditado da cobrança conciliada" } });
  assert.equal(refunded.status, 200, JSON.stringify(refunded.body));
  assert.equal(refunded.body.charge.status, "estornado");

  // O banco repete as garantias para escrita direta.
  await assert.rejects(pool.query("UPDATE fin_payment_gateways SET status='producao' WHERE id=$1",[gatewayId]), /fin_gateway_production_refused_sem_cobranca_real/);
  await assert.rejects(pool.query("UPDATE fin_payment_gateways SET environment='producao' WHERE id=$1",[gatewayId]), /fin_gateway_production_refused_sem_cobranca_real|fin_gateway_identity_fields_immutable/);
  await assert.rejects(pool.query("UPDATE fin_gateway_charges SET status='pago',is_conciliated=true,conciliated_at=NOW(),settled_at=NOW() WHERE id=$1",[otherCharge.body.charge.id]), /fin_gateway_charge/);
  await assert.rejects(pool.query("UPDATE fin_gateway_charges SET simulated=false WHERE id=$1",[otherCharge.body.charge.id]), /fin_gateway_charge/);
  await assert.rejects(pool.query("UPDATE fin_gateway_webhooks SET payload='{}'::jsonb WHERE id=$1",[webhook.body.webhook.id]), /fin_gateway_webhook_receipt_fields_immutable/);
  await assert.rejects(pool.query("UPDATE fin_gateway_webhooks SET is_valid_signature=true WHERE id=$1",[rejectedId]), /fin_gateway_webhook_receipt_fields_immutable/);

  // Histórico imutável e visível.
  const history = await fin(`/gateway-history?entity_type=charge&entity_id=${charge.body.charge.id}`, { cookie: financeiro.cookie });
  assert.equal(history.status, 200);
  assert.equal(history.body.history.length, 3, "criação, conciliação e estorno");
  await assert.rejects(pool.query("UPDATE fin_gateway_history SET reason='Tentativa de adulteração do histórico' WHERE entity_id=$1",[charge.body.charge.id]), /fin_gateway_history_immutable/);
  await assert.rejects(pool.query("DELETE FROM fin_gateway_history WHERE entity_id=$1",[charge.body.charge.id]), /fin_gateway_history_immutable/);

  // Auditoria fail-closed com rollback integral e resposta sem detalhe SQL.
  const rollbackReceivable = await createReceivable(financeiro.cookie, space, 70000, `rollback-${tag}`);
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_fin12_unavailable");
  try {
    const failedGateway = await fin("/payment-gateways", { method:"POST", cookie: financeiro.cookie, body: gatewayPayload(`rollback-${tag}`) });
    assert.equal(failedGateway.status, 503); assert.deepEqual(failedGateway.body, { error:"audit_unavailable" });
    const failedCharge = await fin("/gateway-charges", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: gatewayId, receivable_id: rollbackReceivable.id, amount_cents: 70000, idempotency_key:`fin12-chg-rollback-${tag}` } });
    assert.equal(failedCharge.status, 503); assert.equal("details" in failedCharge.body, false);
    const rollbackSigned = await fin("/gateway-webhook-sign", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: gatewayId, event_type:"charge.paid", idempotency_key:`fin12-wh-rollback-${tag}`, payload } });
    const failedWebhook = await fin("/gateway-webhooks", { method:"POST", cookie: financeiro.cookie, body:{ gateway_id: gatewayId, event_type:"charge.paid", idempotency_key:`fin12-wh-rollback-${tag}`, payload, signature: rollbackSigned.body.signature } });
    assert.equal(failedWebhook.status, 503); assert.deepEqual(failedWebhook.body, { error:"audit_unavailable" });
  } finally { await pool.query("ALTER TABLE audit_log_fin12_unavailable RENAME TO audit_log"); }
  assert.equal((await pool.query("SELECT count(*)::int n FROM fin_payment_gateways WHERE idempotency_key=$1",[`fin12-gw-rollback-${tag}`])).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int n FROM fin_gateway_charges WHERE idempotency_key=$1",[`fin12-chg-rollback-${tag}`])).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int n FROM fin_gateway_webhooks WHERE idempotency_key=$1",[`fin12-wh-rollback-${tag}`])).rows[0].n, 0);
  assert.equal((await pool.query("SELECT count(*)::int n FROM fin_gateway_charges WHERE simulated=false")).rows[0].n, 0, "nenhuma cobrança real foi criada");
  assert.equal((await pool.query("SELECT count(*)::int n FROM fin_payment_gateways WHERE status='producao' OR environment<>'sandbox'")).rows[0].n, 0, "nenhum gateway em produção");
});

test("L07 FIN-12: Chromium seleciona, homologa em sandbox, cria cobrança e concilia webhook assinado no workspace financeiro", { skip: !RUN, timeout: 180_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role:"financeiro" });
  const tag = uuid().slice(0,8);
  const space = await insertClientSpace(`fin12-ui-${tag}`);
  const receivable = await createReceivable(financeiro.cookie, space, 180000, `ui-${tag}`);
  const browser = await playwrightChromium.launch({ executablePath: await packagedChromium.executablePath(), headless:true, args: packagedChromium.args.filter(arg => arg !== "--disable-web-security") });
  try {
    const context = await browser.newContext();
    const pair = financeiro.cookie.split(";")[0], separator = pair.indexOf("=");
    await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator+1), url: baseUrl }]);
    const page = await context.newPage();
    await page.setExtraHTTPHeaders({ origin: baseUrl });
    await page.goto(`${baseUrl}/admin/financeiro`, { waitUntil:"networkidle" });
    await page.getByTestId("finance-tab-gateway").click();
    await page.waitForSelector('[data-testid="fin12-gateway"]');
    await page.waitForSelector('[data-testid="fin12-gateways-table"]');

    await page.getByTestId("fin12-gateway-name").fill(`Gateway Chromium ${tag}`);
    await page.getByTestId("fin12-gateway-code").fill(`chromium-${tag}`);
    await page.getByTestId("fin12-gateway-type").selectOption("boleto");
    await page.getByTestId("fin12-gateway-idempotency").fill(`fin12-ui-gw-${tag}`);
    await page.getByTestId("fin12-gateway-create").click();
    await page.waitForFunction(() => (document.querySelector('[data-testid="fin12-notice"]')?.textContent||"").includes("nao_selecionado"));
    const gatewayRow = (await pool.query("SELECT id FROM fin_payment_gateways WHERE idempotency_key=$1",[`fin12-ui-gw-${tag}`])).rows[0];
    assert.equal((await page.getByTestId(`fin12-gateway-charge-enabled-${gatewayRow.id}`).textContent())?.trim(), "não", "cobrança bloqueada antes de seleção e sandbox");

    await page.getByTestId("fin12-reason").fill("Gateway escolhido explicitamente na interface do financeiro");
    await page.getByTestId(`fin12-gateway-select-${gatewayRow.id}`).click();
    await page.waitForFunction(id => (document.querySelector(`[data-testid="fin12-gateway-status-${id}"]`)?.textContent||"") === "selecionado", gatewayRow.id);
    await page.getByTestId("fin12-reason").fill("Homologação sandbox conferida na interface antes de cobrar");
    await page.getByTestId(`fin12-gateway-sandbox-${gatewayRow.id}`).click();
    await page.waitForFunction(id => (document.querySelector(`[data-testid="fin12-gateway-charge-enabled-${id}"]`)?.textContent||"") === "sim", gatewayRow.id);

    await page.getByTestId("fin12-charge-gateway").selectOption(gatewayRow.id);
    await page.getByTestId("fin12-charge-receivable").fill(receivable.id);
    await page.getByTestId("fin12-charge-amount").fill("180000");
    await page.getByTestId("fin12-charge-idempotency").fill(`fin12-ui-chg-${tag}`);
    await page.getByTestId("fin12-charge-create").click();
    await page.waitForFunction(() => (document.querySelector('[data-testid="fin12-notice"]')?.textContent||"").includes("nenhuma cobrança real"));
    const chargeRow = (await pool.query("SELECT id,protocol,status FROM fin_gateway_charges WHERE idempotency_key=$1",[`fin12-ui-chg-${tag}`])).rows[0];
    assert.equal(chargeRow.status, "pendente");

    await page.getByTestId("fin12-reason").fill("Tentativa sintética com assinatura forjada para provar a recusa");
    await page.getByTestId(`fin12-charge-forge-${chargeRow.id}`).click();
    await page.waitForFunction(() => (document.querySelector('[data-testid="fin12-notice"]')?.textContent||"").includes("Assinatura inválida recusada"));
    assert.equal((await pool.query("SELECT status FROM fin_gateway_charges WHERE id=$1",[chargeRow.id])).rows[0].status, "pendente", "assinatura inválida não quita cobrança");

    await page.getByTestId("fin12-reason").fill("Webhook sintético assinado e conciliado na interface do financeiro");
    await page.getByTestId(`fin12-charge-webhook-${chargeRow.id}`).click();
    await page.waitForFunction(id => (document.querySelector(`[data-testid="fin12-charge-status-${id}"]`)?.textContent||"") === "pago", chargeRow.id);
    const settled = (await pool.query("SELECT status,is_conciliated,simulated,conciliated_webhook_id,settled_at FROM fin_gateway_charges WHERE id=$1",[chargeRow.id])).rows[0];
    assert.equal(settled.status, "pago");
    assert.equal(settled.is_conciliated, true);
    assert.equal(settled.simulated, true);
    assert.ok(settled.conciliated_webhook_id);
    assert.ok(settled.settled_at);
    const conciliatedWebhook = (await pool.query("SELECT status,is_valid_signature FROM fin_gateway_webhooks WHERE id=$1",[settled.conciliated_webhook_id])).rows[0];
    assert.equal(conciliatedWebhook.status, "conciliado");
    assert.equal(conciliatedWebhook.is_valid_signature, true);
  } finally { await browser.close(); }
});

test("L07 FIN-13: orçamento gerencial exige premissas, transições controladas, cenários permitidos e auditoria fail-closed", { skip: !RUN, timeout: 120_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role: "financeiro" });
  const ti = await provisionAndLoginStaff(pool, api, { role: "ti" });
  const rh = await provisionAndLoginStaff(pool, api, { role: "rh" });
  const tag = uuid().slice(0, 8);
  const budgetPayload = (suffix, overrides = {}) => ({
    title: `Orçamento sintético FIN-13 ${tag} ${suffix}`,
    description: "Orçamento gerencial sintético para validar controles transacionais do gate FIN-13",
    premises: "Premissas sintéticas documentadas; estimativa sem promessa de resultado financeiro.",
    period_start: "2026-10-01",
    period_end: "2026-12-31",
    total_revenue_cents: 300000,
    total_cost_cents: 180000,
    ...overrides,
  });
  const scenarioPayload = (budget_id, scenario_type, overrides = {}) => ({
    budget_id,
    scenario_type,
    title: `Cenário ${scenario_type} FIN-13 ${tag}`,
    premises: `Premissas sintéticas do cenário ${scenario_type}; estimativa sem promessa de resultado.`,
    projected_revenue_cents: 320000,
    projected_cost_cents: 190000,
    projected_margin_percent: 12.5,
    ...overrides,
  });

  assert.equal((await fin("/budgets")).status, 401, "anonymous budget read denied");
  assert.equal((await fin("/budgets", { cookie: rh.cookie })).status, 403, "rh cannot read budgets");
  const crossOrigin = await fin("/budgets", { method: "POST", cookie: financeiro.cookie, origin: "https://externo.example", body: budgetPayload("cross") });
  assert.equal(crossOrigin.status, 403, "cross-origin budget mutation denied");
  assert.deepEqual(crossOrigin.body, { error: "forbidden_origin" });

  const tiRead = await fin("/budgets", { cookie: ti.cookie });
  assert.equal(tiRead.status, 200, "ti can read budget domain");
  const tiWrite = await fin("/budgets", { method: "POST", cookie: ti.cookie, body: budgetPayload("ti") });
  assert.equal(tiWrite.status, 403, "ti cannot mutate budgets");
  assert.deepEqual(tiWrite.body, { error: "read_only" });
  const tiScenarioWrite = await fin("/budget-scenarios", { method: "POST", cookie: ti.cookie, body: scenarioPayload(uuid(), "base") });
  assert.equal(tiScenarioWrite.status, 403, "ti cannot mutate scenarios");
  assert.deepEqual(tiScenarioWrite.body, { error: "read_only" });

  const missingPremises = await fin("/budgets", { method: "POST", cookie: financeiro.cookie, body: budgetPayload("sem-premissas", { premises: "" }) });
  assert.equal(missingPremises.status, 400, "premises are mandatory");
  assert.equal(missingPremises.body.error, "premises_10_2000_required_nao_prometer_resultado");
  assert.equal("details" in missingPremises.body, false, "no SQL details in validation errors");

  const created = await fin("/budgets", { method: "POST", cookie: financeiro.cookie, body: budgetPayload("principal") });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.match(created.body.budget.protocol, /^ORC-FIN-\d{8}-[A-Z0-9]{4}$/);
  assert.equal(created.body.budget.status, "rascunho");
  assert.equal(created.body.budget.is_estimate, true);
  assert.match(created.body.budget.estimate_note, /não prometer/i);
  assert.match(created.body.note, /nao_prometer_resultado/);
  assert.equal(created.body.budget.created_by_identity, financeiro.id);
  const budgetId = created.body.budget.id;

  const directApprove = await fin("/budgets", { method: "PATCH", cookie: financeiro.cookie, body: { id: budgetId, status: "aprovado" } });
  assert.equal(directApprove.status, 409, "rascunho cannot jump to approved");
  assert.deepEqual(directApprove.body, { error: "invalid_status_transition" });

  const review = await fin("/budgets", { method: "PATCH", cookie: financeiro.cookie, body: { id: budgetId, status: "em_revisao" } });
  assert.equal(review.status, 200, JSON.stringify(review.body));
  assert.equal(review.body.budget.status, "em_revisao");
  const approved = await fin("/budgets", { method: "PATCH", cookie: financeiro.cookie, body: { id: budgetId, status: "aprovado" } });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.budget.status, "aprovado");
  assert.equal(approved.body.budget.approved_by_identity, financeiro.id);
  assert.ok(approved.body.budget.approved_at, "approval timestamp returned");
  const approvedRow = await pool.query("SELECT approved_by_identity, approved_at FROM fin_budgets WHERE id=$1", [budgetId]);
  assert.equal(approvedRow.rows[0].approved_by_identity, financeiro.id, "approver persisted");
  assert.ok(approvedRow.rows[0].approved_at, "approval date persisted");

  const invalidScenario = await fin("/budget-scenarios", { method: "POST", cookie: financeiro.cookie, body: scenarioPayload(budgetId, "agressivo") });
  assert.equal(invalidScenario.status, 400, "invalid scenario type rejected before SQL");
  assert.deepEqual(invalidScenario.body, { error: "invalid_scenario_type" });
  for (const scenarioType of ["conservador", "base", "otimista", "expansao", "pessimista"]) {
    const scenario = await fin("/budget-scenarios", { method: "POST", cookie: financeiro.cookie, body: scenarioPayload(budgetId, scenarioType) });
    assert.equal(scenario.status, 201, JSON.stringify(scenario.body));
    assert.equal(scenario.body.scenario.scenario_type, scenarioType);
    assert.equal(scenario.body.scenario.is_estimate, true);
    assert.match(scenario.body.note, /nao_prometer_resultado/);
  }
  const duplicateScenario = await fin("/budget-scenarios", { method: "POST", cookie: financeiro.cookie, body: scenarioPayload(budgetId, "base", { title: `Base duplicado FIN-13 ${tag}` }) });
  assert.equal(duplicateScenario.status, 409, "duplicate scenario per budget/type rejected");
  assert.deepEqual(duplicateScenario.body, { error: "duplicate_scenario_type_for_budget" });
  const scenarioList = await fin(`/budget-scenarios?budget_id=${budgetId}`, { cookie: financeiro.cookie });
  assert.equal(scenarioList.status, 200);
  assert.equal(scenarioList.body.scenarios.length, 5, "all allowed scenario types listed");

  const history = await pool.query("SELECT previous_status, next_status FROM fin_budget_history WHERE budget_id=$1 ORDER BY changed_at ASC", [budgetId]);
  assert.deepEqual(history.rows.map(row => row.next_status), ["rascunho", "em_revisao", "aprovado"], "history captures creation and controlled transitions");
  await assert.rejects(pool.query("UPDATE fin_budget_history SET reason='Tentativa de adulteração' WHERE budget_id=$1", [budgetId]), /fin_budget_history_immutable/);
  await assert.rejects(pool.query("DELETE FROM fin_budget_history WHERE budget_id=$1", [budgetId]), /fin_budget_history_immutable/);
  const auditRows = await pool.query("SELECT action, meta FROM audit_log WHERE target=$1 ORDER BY id", [budgetId]);
  assert.ok(auditRows.rows.some(row => row.action === "fin_budget_create"), "budget creation audited");
  assert.ok(auditRows.rows.some(row => row.action === "fin_budget_update" && row.meta?.next_status === "aprovado"), "approval transition audited");

  const rollbackBudget = await fin("/budgets", { method: "POST", cookie: financeiro.cookie, body: budgetPayload("rollback-base") });
  assert.equal(rollbackBudget.status, 201, JSON.stringify(rollbackBudget.body));
  const failedBudgetTitle = `Orçamento rollback FIN-13 ${tag}`;
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_fin13_unavailable");
  try {
    const failedBudget = await fin("/budgets", { method: "POST", cookie: financeiro.cookie, body: budgetPayload("rollback", { title: failedBudgetTitle }) });
    assert.equal(failedBudget.status, 503, JSON.stringify(failedBudget.body));
    assert.deepEqual(failedBudget.body, { error: "audit_unavailable" });
    const failedScenario = await fin("/budget-scenarios", { method: "POST", cookie: financeiro.cookie, body: scenarioPayload(rollbackBudget.body.budget.id, "base", { title: `Cenário rollback FIN-13 ${tag}` }) });
    assert.equal(failedScenario.status, 503, JSON.stringify(failedScenario.body));
    assert.equal("details" in failedScenario.body, false, "audit failure response is sanitized");
  } finally {
    await pool.query("ALTER TABLE audit_log_fin13_unavailable RENAME TO audit_log");
  }
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM fin_budgets WHERE title=$1", [failedBudgetTitle])).rows[0].n, 0, "failed audited budget rolled back fully");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM fin_budget_scenarios WHERE budget_id=$1 AND scenario_type='base'", [rollbackBudget.body.budget.id])).rows[0].n, 0, "failed audited scenario rolled back fully");
});

test("L07 FIN-13: Chromium abre a nova aba de orçamento financeiro e cadastra estimativa e cenário", { skip: !RUN, timeout: 180_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role: "financeiro" });
  const tag = uuid().slice(0, 8);
  const title = `Orçamento Chromium FIN-13 ${tag}`;
  const scenarioTitle = `Cenário Chromium FIN-13 ${tag}`;
  const browser = await playwrightChromium.launch({ executablePath: await packagedChromium.executablePath(), headless: true, args: packagedChromium.args.filter(arg => arg !== "--disable-web-security") });
  try {
    const context = await browser.newContext();
    const pair = financeiro.cookie.split(";")[0], separator = pair.indexOf("=");
    await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: baseUrl }]);
    const page = await context.newPage();
    await page.setExtraHTTPHeaders({ origin: baseUrl });
    await page.goto(`${baseUrl}/admin/financeiro`, { waitUntil: "networkidle" });
    await page.getByTestId("finance-tab-budgets").click();
    await page.waitForSelector('[data-testid="finance-budget-workspace"]');
    assert.match(await page.getByTestId("fin13-disclaimer").textContent(), /não prometemos resultado financeiro/);

    await page.getByTestId("fin13-budget-title").fill(title);
    await page.getByTestId("fin13-budget-description").fill("Orçamento criado pelo Chromium para validar a nova aba financeira");
    await page.getByTestId("fin13-budget-premises").fill("Premissas sintéticas da jornada Chromium; estimativa sem promessa de resultado.");
    await page.getByTestId("fin13-budget-start").fill("2026-10-01");
    await page.getByTestId("fin13-budget-end").fill("2026-12-31");
    await page.getByTestId("fin13-budget-revenue").fill("410000");
    await page.getByTestId("fin13-budget-cost").fill("270000");
    await page.getByTestId("fin13-budget-create").click();
    await page.waitForFunction(() => (document.querySelector('[data-testid="fin13-notice"]')?.textContent || "").includes("ORC-FIN"));
    const budgetRow = (await pool.query("SELECT id, protocol, status, is_estimate FROM fin_budgets WHERE title=$1", [title])).rows[0];
    assert.ok(budgetRow, "budget created through Chromium");
    assert.match(budgetRow.protocol, /^ORC-FIN-\d{8}-[A-Z0-9]{4}$/);
    assert.equal(budgetRow.status, "rascunho");
    assert.equal(budgetRow.is_estimate, true);

    await page.waitForFunction(id => {
      const select = document.querySelector('[data-testid="fin13-scenario-budget"]');
      return Boolean(select) && Array.from(select.options).some(option => option.value === id);
    }, budgetRow.id);
    await page.getByTestId("fin13-scenario-budget").selectOption(budgetRow.id);
    await page.getByTestId("fin13-scenario-type").selectOption("expansao");
    await page.getByTestId("fin13-scenario-title").fill(scenarioTitle);
    await page.getByTestId("fin13-scenario-premises").fill("Premissas sintéticas do cenário de expansão; estimativa sem promessa de resultado.");
    await page.getByTestId("fin13-scenario-revenue").fill("450000");
    await page.getByTestId("fin13-scenario-cost").fill("300000");
    await page.getByTestId("fin13-scenario-margin").fill("15");
    await page.getByTestId("fin13-scenario-create").click();
    await page.waitForFunction(() => (document.querySelector('[data-testid="fin13-notice"]')?.textContent || "").includes("expansao"));
    const scenarioRow = (await pool.query("SELECT scenario_type, is_estimate FROM fin_budget_scenarios WHERE budget_id=$1 AND title=$2", [budgetRow.id, scenarioTitle])).rows[0];
    assert.ok(scenarioRow, "scenario created through Chromium");
    assert.equal(scenarioRow.scenario_type, "expansao");
    assert.equal(scenarioRow.is_estimate, true);
  } finally {
    await browser.close();
  }
});

test("L07 FIN-14: exportação do período com trilha imutável, idempotência por chave, acesso limitado do contador e auditoria fail-closed", { skip: !RUN, timeout: 120_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role: "financeiro" });
  const ti = await provisionAndLoginStaff(pool, api, { role: "ti" });
  const rh = await provisionAndLoginStaff(pool, api, { role: "rh" });
  const tag = uuid().slice(0, 8);
  const exportPayload = (suffix, overrides = {}) => ({
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    filters: { competencia: "2026-09", origem: "sintetico" },
    totals: { recebiveis_cents: 150000, pagaveis_cents: 90000 },
    total_records: 12,
    total_amount_cents: 240000,
    file_name: `exportacao-fin14-${tag}-${suffix}.json`,
    storage_key: `synthetic/fin14/${tag}/${suffix}.json`,
    ...overrides,
  });

  // 1. Sessão, papel e same-origin seguem a mesma borda do FIN-13.
  assert.equal((await fin("/exports")).status, 401, "anonymous export read denied");
  assert.equal((await fin("/export-logs")).status, 401, "anonymous export log read denied");
  assert.equal((await fin("/exports", { cookie: rh.cookie })).status, 403, "rh cannot read exports");
  const crossOrigin = await fin("/exports", { method: "POST", cookie: financeiro.cookie, origin: "https://externo.example", body: exportPayload("cross") });
  assert.equal(crossOrigin.status, 403, "cross-origin export mutation denied");
  assert.deepEqual(crossOrigin.body, { error: "forbidden_origin" });
  assert.equal((await fin("/exports", { cookie: ti.cookie })).status, 200, "ti reads the export domain");
  const tiWrite = await fin("/exports", { method: "POST", cookie: ti.cookie, body: exportPayload("ti") });
  assert.equal(tiWrite.status, 403, "ti cannot create exports");
  assert.deepEqual(tiWrite.body, { error: "read_only" });

  // 2. Validação allowlist antes do SQL, sem vazar detalhe de banco.
  const invalidFilter = await fin("/exports?status=qualquer", { cookie: financeiro.cookie });
  assert.equal(invalidFilter.status, 400, "export status filter is allowlisted");
  assert.deepEqual(invalidFilter.body, { error: "invalid_status" });
  const invalidPeriod = await fin("/exports", { method: "POST", cookie: financeiro.cookie, body: exportPayload("periodo", { period_start: "30/09/2026" }) });
  assert.equal(invalidPeriod.status, 400, "period must be ISO");
  assert.deepEqual(invalidPeriod.body, { error: "period_required" });
  const invertedPeriod = await fin("/exports", { method: "POST", cookie: financeiro.cookie, body: exportPayload("invertido", { period_end: "2026-08-01" }) });
  assert.equal(invertedPeriod.status, 400, "period end cannot precede start");
  const unlimited = await fin("/exports", { method: "POST", cookie: financeiro.cookie, body: exportPayload("sem-limite", { is_accountant_limited: false }) });
  assert.equal(unlimited.status, 400, "accountant limited access cannot be disabled");
  assert.deepEqual(unlimited.body, { error: "accountant_limited_required" });

  // 3. Exportação criada com trilha e acesso limitado do contador.
  const created = await fin("/exports", { method: "POST", cookie: financeiro.cookie, body: exportPayload("principal") });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.match(created.body.export.protocol, /^EXP-FIN-\d{8}-[A-Z0-9]{4}$/);
  assert.equal(created.body.export.status, "pendente");
  assert.equal(created.body.export.is_accountant_limited, true);
  assert.equal(created.body.export.access_role, "contador");
  assert.equal(created.body.export.requested_by_identity, financeiro.id);
  assert.deepEqual(created.body.export.filters, { competencia: "2026-09", origem: "sintetico" });
  const exportId = created.body.export.id;
  const logsAfterCreate = await fin(`/export-logs?export_id=${exportId}`, { cookie: financeiro.cookie });
  assert.equal(logsAfterCreate.status, 200);
  assert.equal(logsAfterCreate.body.logs.length, 1, "creation is recorded in the export trail");
  assert.equal(logsAfterCreate.body.logs[0].action, "export_create");

  // 4. Idempotência/duplicidade pela chave de armazenamento.
  const duplicate = await fin("/exports", { method: "POST", cookie: financeiro.cookie, body: exportPayload("principal") });
  assert.equal(duplicate.status, 409, "duplicate storage key rejected");
  assert.deepEqual(duplicate.body, { error: "duplicate_storage_key" });
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM fin_exports WHERE storage_key=$1", [exportPayload("principal").storage_key])).rows[0].n, 1, "duplicate attempt did not create a second export");

  // 5. Transições controladas de geração.
  const jump = await fin("/exports", { method: "PATCH", cookie: financeiro.cookie, body: { id: exportId, status: "gerado" } });
  assert.equal(jump.status, 409, "pendente cannot jump to gerado");
  assert.deepEqual(jump.body, { error: "invalid_status_transition" });
  const generating = await fin("/exports", { method: "PATCH", cookie: financeiro.cookie, body: { id: exportId, status: "gerando" } });
  assert.equal(generating.status, 200, JSON.stringify(generating.body));
  const generated = await fin("/exports", { method: "PATCH", cookie: financeiro.cookie, body: { id: exportId, status: "gerado" } });
  assert.equal(generated.status, 200, JSON.stringify(generated.body));
  assert.ok(generated.body.export.generated_at, "generation timestamp recorded");
  assert.ok(generated.body.export.expires_at, "accountant access window recorded");
  assert.equal(generated.body.export.is_accountant_limited, true);

  const withoutKey = await fin("/exports", { method: "POST", cookie: financeiro.cookie, body: exportPayload("sem-chave", { storage_key: undefined }) });
  assert.equal(withoutKey.status, 201, JSON.stringify(withoutKey.body));
  assert.equal((await fin("/exports", { method: "PATCH", cookie: financeiro.cookie, body: { id: withoutKey.body.export.id, status: "gerando" } })).status, 200);
  const missingKey = await fin("/exports", { method: "PATCH", cookie: financeiro.cookie, body: { id: withoutKey.body.export.id, status: "gerado" } });
  assert.equal(missingKey.status, 400, "generated export requires a storage key");
  assert.deepEqual(missingKey.body, { error: "storage_key_required_for_gerado" });

  // 6. Trilha imutável e auditoria registrada.
  const trail = await fin(`/export-logs?export_id=${exportId}`, { cookie: financeiro.cookie });
  assert.equal(trail.body.logs.length, 3, "every mutation appends to the trail");
  await assert.rejects(pool.query("UPDATE fin_export_logs SET action='adulterado' WHERE export_id=$1", [exportId]), /fin_export_log_immutable/);
  await assert.rejects(pool.query("DELETE FROM fin_export_logs WHERE export_id=$1", [exportId]), /fin_export_log_immutable/);
  const auditRows = await pool.query("SELECT action, meta FROM audit_log WHERE target=$1 ORDER BY id", [exportId]);
  assert.ok(auditRows.rows.some(row => row.action === "fin_export_create"), "export creation audited");
  assert.ok(auditRows.rows.some(row => row.action === "fin_export_update" && row.meta?.next_status === "gerado"), "export generation audited");

  // 7. Auditoria indisponível reverte a exportação inteira.
  const failedKey = `synthetic/fin14/${tag}/audit-down.json`;
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_fin14_unavailable");
  let failedCreate, failedUpdate;
  try {
    failedCreate = await fin("/exports", { method: "POST", cookie: financeiro.cookie, body: exportPayload("audit-down", { storage_key: failedKey }) });
    failedUpdate = await fin("/exports", { method: "PATCH", cookie: financeiro.cookie, body: { id: withoutKey.body.export.id, status: "falhou" } });
  } finally {
    await pool.query("ALTER TABLE audit_log_fin14_unavailable RENAME TO audit_log");
  }
  assert.equal(failedCreate.status, 503, JSON.stringify(failedCreate.body));
  assert.deepEqual(failedCreate.body, { error: "audit_unavailable" });
  assert.equal(failedUpdate.status, 503, JSON.stringify(failedUpdate.body));
  assert.equal("details" in failedUpdate.body, false, "audit failure response is sanitized");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM fin_exports WHERE storage_key=$1", [failedKey])).rows[0].n, 0, "export rolled back when audit is unavailable");
  assert.equal((await pool.query("SELECT status FROM fin_exports WHERE id=$1", [withoutKey.body.export.id])).rows[0].status, "gerando", "export status unchanged when audit is unavailable");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM fin_export_logs WHERE export_id=$1", [withoutKey.body.export.id])).rows[0].n, 2, "export trail rolled back with the transaction");
});

test("L07 FIN-15: fechamento de competência, reabertura autorizada, versões preservadas e auditoria fail-closed", { skip: !RUN, timeout: 120_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role: "financeiro" });
  const ti = await provisionAndLoginStaff(pool, api, { role: "ti" });
  const rh = await provisionAndLoginStaff(pool, api, { role: "rh" });
  const competence = `2026-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}-01`;
  const closurePayload = (date = competence) => ({ competence_date: date, notes: "Fechamento sintético do gate FIN-15 com versões preservadas." });

  assert.equal((await fin("/competence-closures")).status, 401, "anonymous closure read denied");
  assert.equal((await fin("/report-versions")).status, 401, "anonymous version read denied");
  assert.equal((await fin("/competence-closures", { cookie: rh.cookie })).status, 403, "rh cannot read closures");
  const crossOrigin = await fin("/competence-closures", { method: "POST", cookie: financeiro.cookie, origin: "https://externo.example", body: closurePayload() });
  assert.equal(crossOrigin.status, 403, "cross-origin closure mutation denied");
  assert.deepEqual(crossOrigin.body, { error: "forbidden_origin" });
  assert.equal((await fin("/competence-closures", { cookie: ti.cookie })).status, 200, "ti reads the closure domain");
  const tiWrite = await fin("/competence-closures", { method: "POST", cookie: ti.cookie, body: closurePayload() });
  assert.equal(tiWrite.status, 403, "ti cannot close a competence");
  assert.deepEqual(tiWrite.body, { error: "read_only" });

  const invalidDate = await fin("/competence-closures", { method: "POST", cookie: financeiro.cookie, body: closurePayload("01/2026") });
  assert.equal(invalidDate.status, 400, "competence date must be ISO");
  assert.deepEqual(invalidDate.body, { error: "competence_date_required" });

  const created = await fin("/competence-closures", { method: "POST", cookie: financeiro.cookie, body: closurePayload() });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.closure.status, "fechada");
  assert.equal(created.body.closure.closed_by_identity, financeiro.id);
  const closureId = created.body.closure.id;
  const duplicate = await fin("/competence-closures", { method: "POST", cookie: financeiro.cookie, body: closurePayload() });
  assert.equal(duplicate.status, 409, "the same competence cannot be closed twice");
  assert.deepEqual(duplicate.body, { error: "duplicate_competence" });

  const invalidAction = await fin("/competence-closures", { method: "PATCH", cookie: financeiro.cookie, body: { id: closureId, action: "apagar" } });
  assert.equal(invalidAction.status, 400, "closure actions are allowlisted");
  assert.deepEqual(invalidAction.body, { error: "invalid_action" });
  const reopenWithoutReason = await fin("/competence-closures", { method: "PATCH", cookie: financeiro.cookie, body: { id: closureId, action: "reopen" } });
  assert.equal(reopenWithoutReason.status, 400, "reopening requires a justification");
  assert.equal(reopenWithoutReason.body.error, "reopen_reason_10_1000_required_reabertura_autorizada");
  assert.equal("details" in reopenWithoutReason.body, false, "no SQL details in validation errors");

  const reopened = await fin("/competence-closures", { method: "PATCH", cookie: financeiro.cookie, body: { id: closureId, action: "reopen", reopen_reason: "Reabertura autorizada sintética para reconferência do gate FIN-15." } });
  assert.equal(reopened.status, 200, JSON.stringify(reopened.body));
  assert.equal(reopened.body.closure.status, "reaberta");
  assert.equal(reopened.body.closure.authorized_by_identity, financeiro.id, "reopening records the authorizing identity");
  assert.ok(reopened.body.closure.authorized_at, "reopening records the authorization date");
  assert.equal(reopened.body.version, 2, "reopening preserves a new report version");

  const doubleReopen = await fin("/competence-closures", { method: "PATCH", cookie: financeiro.cookie, body: { id: closureId, action: "reopen", reopen_reason: "Segunda reabertura sintética sem fechamento intermediário." } });
  assert.equal(doubleReopen.status, 409, "an already reopened competence cannot be reopened again");
  assert.deepEqual(doubleReopen.body, { error: "invalid_status_transition" });

  const reclosed = await fin("/competence-closures", { method: "PATCH", cookie: financeiro.cookie, body: { id: closureId, action: "close", close_reason: "Novo fechamento sintético após conferência do gate FIN-15." } });
  assert.equal(reclosed.status, 200, JSON.stringify(reclosed.body));
  assert.equal(reclosed.body.closure.status, "fechada");
  assert.equal(reclosed.body.version, 3);

  const versions = await fin(`/report-versions?closure_id=${closureId}`, { cookie: financeiro.cookie });
  assert.equal(versions.status, 200);
  assert.deepEqual(versions.body.versions.map(row => row.version), [3, 2, 1], "every closure step keeps its own preserved version");
  assert.ok(versions.body.versions.every(row => row.is_preserved === true), "versions are preserved");
  await assert.rejects(pool.query("UPDATE fin_report_versions SET report_type='adulterado' WHERE closure_id=$1", [closureId]), /fin_report_version_immutable/);
  await assert.rejects(pool.query("DELETE FROM fin_report_versions WHERE closure_id=$1", [closureId]), /fin_report_version_immutable/);
  const auditRows = await pool.query("SELECT action FROM audit_log WHERE target=$1 ORDER BY id", [closureId]);
  assert.deepEqual(auditRows.rows.map(row => row.action), ["fin_closure_create", "fin_closure_reopen", "fin_closure_close"], "closure lifecycle fully audited");

  const failedCompetence = "2027-03-01";
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_fin15_unavailable");
  let failedCreate, failedReopen;
  try {
    failedCreate = await fin("/competence-closures", { method: "POST", cookie: financeiro.cookie, body: closurePayload(failedCompetence) });
    failedReopen = await fin("/competence-closures", { method: "PATCH", cookie: financeiro.cookie, body: { id: closureId, action: "reopen", reopen_reason: "Reabertura sintética durante indisponibilidade da auditoria." } });
  } finally {
    await pool.query("ALTER TABLE audit_log_fin15_unavailable RENAME TO audit_log");
  }
  assert.equal(failedCreate.status, 503, JSON.stringify(failedCreate.body));
  assert.deepEqual(failedCreate.body, { error: "audit_unavailable" });
  assert.equal(failedReopen.status, 503, JSON.stringify(failedReopen.body));
  assert.equal("details" in failedReopen.body, false, "audit failure response is sanitized");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM fin_competence_closures WHERE competence_date=$1", [failedCompetence])).rows[0].n, 0, "closure rolled back when audit is unavailable");
  assert.equal((await pool.query("SELECT status FROM fin_competence_closures WHERE id=$1", [closureId])).rows[0].status, "fechada", "reopening rolled back when audit is unavailable");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM fin_report_versions WHERE closure_id=$1", [closureId])).rows[0].n, 3, "no version created when audit is unavailable");
});

test("L07 FIN-16: provisão de comissão CRM-25 com revisão obrigatória, sem pagamento automático, histórico imutável e auditoria fail-closed", { skip: !RUN, timeout: 120_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role: "financeiro" });
  const ti = await provisionAndLoginStaff(pool, api, { role: "ti" });
  const rh = await provisionAndLoginStaff(pool, api, { role: "rh" });
  const tag = uuid().slice(0, 8);
  const ruleId = uuid();
  await pool.query(
    "INSERT INTO crm_commission_rules (id,name,description,percent,status,created_by) VALUES ($1,$2,$3,5.00,'ativa','admin')",
    [ruleId, `Regra sintética CRM-25 ${tag}`, "Regra sintética do gate FIN-16; provisão e revisão sem pagamento automático."]
  );
  const provisionPayload = (overrides = {}) => ({
    rule_id: ruleId,
    provision_date: "2026-09-30",
    amount_cents: 125000,
    notes: "Provisão sintética do gate FIN-16 ligada à regra CRM-25.",
    ...overrides,
  });

  assert.equal((await fin("/commission-provisions")).status, 401, "anonymous provision read denied");
  assert.equal((await fin("/commission-provision-history")).status, 401, "anonymous provision history read denied");
  assert.equal((await fin("/commission-provisions", { cookie: rh.cookie })).status, 403, "rh cannot read provisions");
  const crossOrigin = await fin("/commission-provisions", { method: "POST", cookie: financeiro.cookie, origin: "https://externo.example", body: provisionPayload() });
  assert.equal(crossOrigin.status, 403, "cross-origin provision mutation denied");
  assert.deepEqual(crossOrigin.body, { error: "forbidden_origin" });
  assert.equal((await fin("/commission-provisions", { cookie: ti.cookie })).status, 200, "ti reads the provision domain");
  const tiWrite = await fin("/commission-provisions", { method: "POST", cookie: ti.cookie, body: provisionPayload() });
  assert.equal(tiWrite.status, 403, "ti cannot create provisions");
  assert.deepEqual(tiWrite.body, { error: "read_only" });

  const autoPaid = await fin("/commission-provisions", { method: "POST", cookie: financeiro.cookie, body: provisionPayload({ is_auto_paid: true }) });
  assert.equal(autoPaid.status, 400, "automatic payment is refused at creation");
  assert.deepEqual(autoPaid.body, { error: "auto_paid_forbidden_nao_pagar_automaticamente" });
  const negative = await fin("/commission-provisions", { method: "POST", cookie: financeiro.cookie, body: provisionPayload({ amount_cents: -1 }) });
  assert.equal(negative.status, 400, "negative provisions are refused");
  assert.deepEqual(negative.body, { error: "amount_cents_gte_0" });
  const preStatus = await fin("/commission-provisions", { method: "POST", cookie: financeiro.cookie, body: provisionPayload({ status: "paga" }) });
  assert.equal(preStatus.status, 400, "a provision cannot be born paid");
  assert.deepEqual(preStatus.body, { error: "initial_status_must_be_provisionada" });

  const created = await fin("/commission-provisions", { method: "POST", cookie: financeiro.cookie, body: provisionPayload() });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.provision.status, "provisionada");
  assert.equal(created.body.provision.is_auto_paid, false);
  assert.equal(created.body.provision.rule_id, ruleId, "provision stays linked to the CRM-25 rule");
  assert.match(created.body.note, /nao_pagar_automaticamente/);
  const provisionId = created.body.provision.id;

  const directPay = await fin("/commission-provisions", { method: "PATCH", cookie: financeiro.cookie, body: { id: provisionId, status: "paga", reason: "Tentativa sintética de pagamento sem revisão prévia.", manual_payment_confirmation: true } });
  assert.equal(directPay.status, 409, "payment requires a previous review");
  assert.deepEqual(directPay.body, { error: "payment_requires_review" });
  const noReason = await fin("/commission-provisions", { method: "PATCH", cookie: financeiro.cookie, body: { id: provisionId, status: "em_revisao" } });
  assert.equal(noReason.status, 400, "every provision change needs a reason");
  assert.deepEqual(noReason.body, { error: "reason_10_1000_required" });
  const noRevisionReason = await fin("/commission-provisions", { method: "PATCH", cookie: financeiro.cookie, body: { id: provisionId, status: "em_revisao", reason: "Revisão sintética iniciada pelo gate FIN-16." } });
  assert.equal(noRevisionReason.status, 400, "review requires its documented reason");
  assert.deepEqual(noRevisionReason.body, { error: "revision_reason_10_1000_required" });
  const invalidStatus = await fin("/commission-provisions", { method: "PATCH", cookie: financeiro.cookie, body: { id: provisionId, status: "quitada", reason: "Status fora da allowlist sintético." } });
  assert.equal(invalidStatus.status, 400, "provision status is allowlisted before SQL");
  assert.deepEqual(invalidStatus.body, { error: "invalid_status" });

  const review = await fin("/commission-provisions", { method: "PATCH", cookie: financeiro.cookie, body: { id: provisionId, status: "em_revisao", reason: "Revisão sintética iniciada pelo gate FIN-16.", revision_reason: "Conferência sintética da base de cálculo da comissão." } });
  assert.equal(review.status, 200, JSON.stringify(review.body));
  assert.equal(review.body.provision.status, "em_revisao");
  assert.equal(review.body.provision.reviewed_by_identity, financeiro.id);
  const reviewed = await fin("/commission-provisions", { method: "PATCH", cookie: financeiro.cookie, body: { id: provisionId, status: "revisada", reason: "Revisão sintética concluída pelo gate FIN-16.", revision_reason: "Base conferida; valor mantido na revisão sintética.", amount_cents: 120000 } });
  assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
  assert.equal(reviewed.body.provision.status, "revisada");
  assert.equal(Number(reviewed.body.provision.amount_cents), 120000);

  const payWithoutConfirmation = await fin("/commission-provisions", { method: "PATCH", cookie: financeiro.cookie, body: { id: provisionId, status: "paga", reason: "Baixa sintética sem confirmação manual explícita." } });
  assert.equal(payWithoutConfirmation.status, 400, "payment is never implicit");
  assert.deepEqual(payWithoutConfirmation.body, { error: "manual_payment_confirmation_required_nao_pagar_automaticamente" });
  const autoPayPatch = await fin("/commission-provisions", { method: "PATCH", cookie: financeiro.cookie, body: { id: provisionId, status: "paga", reason: "Tentativa sintética de marcar pagamento automático.", manual_payment_confirmation: true, is_auto_paid: true } });
  assert.equal(autoPayPatch.status, 400, "automatic payment stays forbidden on update");
  assert.deepEqual(autoPayPatch.body, { error: "auto_paid_forbidden_nao_pagar_automaticamente" });

  const paid = await fin("/commission-provisions", { method: "PATCH", cookie: financeiro.cookie, body: { id: provisionId, status: "paga", reason: "Baixa manual sintética registrada após revisão do gate FIN-16.", manual_payment_confirmation: true } });
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.equal(paid.body.provision.status, "paga");
  assert.equal(paid.body.provision.is_auto_paid, false, "registering the payment never flags automatic payment");
  assert.equal(paid.body.provision.paid_by_identity, financeiro.id);
  assert.match(paid.body.note, /sem_pagamento_automatico/);
  const afterPaid = await fin("/commission-provisions", { method: "PATCH", cookie: financeiro.cookie, body: { id: provisionId, status: "cancelada", reason: "Tentativa sintética de cancelar após a baixa manual." } });
  assert.equal(afterPaid.status, 409, "a paid provision is terminal");
  assert.deepEqual(afterPaid.body, { error: "invalid_status_transition" });

  const history = await fin(`/commission-provision-history?provision_id=${provisionId}`, { cookie: financeiro.cookie });
  assert.equal(history.status, 200);
  assert.equal(history.body.history.length, 4, "creation, review, revision and payment are historized");
  assert.ok(history.body.history.every(row => row.is_auto_paid_attempt === false), "history never registers an automatic payment");
  await assert.rejects(pool.query("UPDATE fin_commission_provision_history SET reason='Tentativa de adulteração' WHERE provision_id=$1", [provisionId]), /immutable/);
  await assert.rejects(pool.query("DELETE FROM fin_commission_provision_history WHERE provision_id=$1", [provisionId]), /immutable/);
  const auditRows = await pool.query("SELECT action FROM audit_log WHERE target=$1 ORDER BY id", [provisionId]);
  assert.deepEqual(auditRows.rows.map(row => row.action), [
    "fin_commission_provision_create",
    "fin_commission_provision_review",
    "fin_commission_provision_review",
    "fin_commission_provision_pay",
  ], "provision lifecycle fully audited");

  const rollbackProvision = await fin("/commission-provisions", { method: "POST", cookie: financeiro.cookie, body: provisionPayload({ amount_cents: 99000 }) });
  assert.equal(rollbackProvision.status, 201, JSON.stringify(rollbackProvision.body));
  const rollbackId = rollbackProvision.body.provision.id;
  await pool.query("ALTER TABLE audit_log RENAME TO audit_log_fin16_unavailable");
  let failedCreate, failedReview;
  try {
    failedCreate = await fin("/commission-provisions", { method: "POST", cookie: financeiro.cookie, body: provisionPayload({ amount_cents: 77000 }) });
    failedReview = await fin("/commission-provisions", { method: "PATCH", cookie: financeiro.cookie, body: { id: rollbackId, status: "em_revisao", reason: "Revisão sintética durante indisponibilidade da auditoria.", revision_reason: "Conferência sintética durante indisponibilidade da auditoria." } });
  } finally {
    await pool.query("ALTER TABLE audit_log_fin16_unavailable RENAME TO audit_log");
  }
  assert.equal(failedCreate.status, 503, JSON.stringify(failedCreate.body));
  assert.deepEqual(failedCreate.body, { error: "audit_unavailable" });
  assert.equal(failedReview.status, 503, JSON.stringify(failedReview.body));
  assert.equal("details" in failedReview.body, false, "audit failure response is sanitized");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM fin_commission_provisions WHERE rule_id=$1 AND amount_cents=77000", [ruleId])).rows[0].n, 0, "provision rolled back when audit is unavailable");
  assert.equal((await pool.query("SELECT status FROM fin_commission_provisions WHERE id=$1", [rollbackId])).rows[0].status, "provisionada", "review rolled back when audit is unavailable");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM fin_commission_provision_history WHERE provision_id=$1", [rollbackId])).rows[0].n, 1, "history rolled back with the transaction");
});
