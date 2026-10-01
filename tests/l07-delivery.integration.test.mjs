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

test("L07 Fatia 3: FIN-05 importa extrato sintético, sugere, confirma e impede duplicidade", { skip: !RUN, timeout: 120_000 }, async () => {
  const financeiro = await provisionAndLoginStaff(pool, api, { role: "financeiro" });
  const rh = await provisionAndLoginStaff(pool, api, { role: "rh" });
  const firstSpace = await insertClientSpace("FIN05 A");
  const secondSpace = await insertClientSpace("FIN05 B");
  const first = await fin("/receivables", { method:"POST", cookie:financeiro.cookie, body:{ client_account_id:firstSpace.accountId, contract_id:firstSpace.contractId, competence_date:"2026-10-01", due_date:"2026-10-10", amount_cents:12500, description:"Recebível sintético para conciliação bancária" } });
  const second = await fin("/receivables", { method:"POST", cookie:financeiro.cookie, body:{ client_account_id:secondSpace.accountId, contract_id:secondSpace.contractId, competence_date:"2026-10-01", due_date:"2026-10-10", amount_cents:12500, description:"Segundo recebível sintético para provar unicidade" } });
  assert.equal(first.status,201); assert.equal(second.status,201);

  assert.equal((await fin("/bank-statements")).status,401,"anonymous statement listing denied");
  assert.equal((await fin("/bank-statements",{method:"POST",cookie:rh.cookie,body:{}})).status,403,"non-finance role cannot import statement");
  assert.equal((await fin("/bank-statements",{method:"POST",cookie:financeiro.cookie,origin:"https://externo.example",body:{source:"importacao",file_name:"forjado.csv",file_url:"synthetic://forjado",storage_key:`forjado-${uuid()}`,import_date:"2026-10-01",transactions:[]}})).status,403,"cross-origin import denied before any write");

  const storageKey=`qa-fin05-statement-${uuid()}`; const bankRef=`QA-FIN05-${uuid().slice(0,12)}`;
  const imported=await fin("/bank-statements",{method:"POST",cookie:financeiro.cookie,body:{source:"importacao",file_name:"extrato-qa-fin05.csv",file_url:`synthetic://${storageKey}`,storage_key:storageKey,import_date:"2026-10-01",transactions:[{transaction_date:"2026-10-10",amount_cents:12500,description:"Recebimento sintético de contrato QA",bank_ref:bankRef}]}});
  assert.equal(imported.status,201,"atomic synthetic statement import"); assert.equal(imported.body.transactions.length,1,"one bank transaction imported");
  const statementId=imported.body.statement.id; const bankTransaction=imported.body.transactions[0];
  const totals=await pool.query("SELECT total_transactions,total_amount_cents FROM fin_bank_statements WHERE id=$1",[statementId]); assert.equal(Number(totals.rows[0].total_transactions),1); assert.equal(Number(totals.rows[0].total_amount_cents),12500);
  const importAudit=await pool.query("SELECT count(*)::int n FROM audit_log WHERE action IN ('fin_bank_statement_create','fin_bank_transaction_create') AND target=ANY($1::text[])",[[statementId,bankTransaction.id]]); assert.equal(importAudit.rows[0].n,2,"statement and transaction audit in import transaction");
  const duplicateImport=await fin("/bank-statements",{method:"POST",cookie:financeiro.cookie,body:{source:"importacao",file_name:"extrato-duplicado.csv",file_url:`synthetic://${storageKey}`,storage_key:storageKey,import_date:"2026-10-01",transactions:[{transaction_date:"2026-10-10",amount_cents:12500,description:"Linha duplicada que deve reverter inteira",bank_ref:`QA-FIN05-OUTRA-${uuid().slice(0,8)}`}]}}); assert.equal(duplicateImport.status,409,"duplicate import key rejected");
  assert.equal((await pool.query("SELECT count(*)::int n FROM fin_bank_statements WHERE storage_key=$1",[storageKey])).rows[0].n,1,"duplicate import did not create a second statement");
  const duplicateBankRef=await fin("/bank-transactions",{method:"POST",cookie:financeiro.cookie,body:{statement_id:statementId,transaction_date:"2026-10-10",amount_cents:1,description:"Movimento repetido que deve ser negado",bank_ref:bankRef}}); assert.equal(duplicateBankRef.status,409,"unique bank_ref prevents a duplicate transaction");

  const competingSuggestions=await Promise.all([
    fin("/conciliations",{method:"POST",cookie:financeiro.cookie,body:{receivable_id:first.body.receivable.id,bank_transaction_id:bankTransaction.id,source:"importacao"}}),
    fin("/conciliations",{method:"POST",cookie:financeiro.cookie,body:{receivable_id:second.body.receivable.id,bank_transaction_id:bankTransaction.id,source:"importacao"}}),
  ]);
  assert.deepEqual(competingSuggestions.map(item=>item.status).sort(),[201,409],"concurrent suggestions keep one bank movement unique");
  const suggestion=competingSuggestions.find(item=>item.status===201); assert.ok(suggestion,"one suggestion created from bank movement and account"); assert.equal(suggestion.body.conciliation.status,"sugerida"); assert.equal(Number(suggestion.body.conciliation.amount_matched_cents),12500);
  const duplicateConciliation=await fin("/conciliations",{method:"POST",cookie:financeiro.cookie,body:{receivable_id:second.body.receivable.id,bank_transaction_id:bankTransaction.id,source:"importacao"}}); assert.equal(duplicateConciliation.status,409,"same bank movement cannot be suggested after the concurrent race");
  const confirmed=await fin("/conciliations",{method:"PATCH",cookie:financeiro.cookie,body:{id:suggestion.body.conciliation.id,status:"conciliada"}}); assert.equal(confirmed.status,200,"explicit confirmation succeeds"); assert.equal(confirmed.body.conciliation.status,"conciliada");
  const state=await pool.query("SELECT c.status,t.is_conciliated,(SELECT count(*)::int FROM fin_payments WHERE receivable_id=$1) payment_count FROM fin_conciliations c JOIN fin_bank_transactions t ON t.id=c.bank_transaction_id WHERE c.id=$2",[first.body.receivable.id,suggestion.body.conciliation.id]); assert.equal(state.rows[0].status,"conciliada"); assert.equal(state.rows[0].is_conciliated,true); assert.equal(state.rows[0].payment_count,0,"FIN-05 confirmation does not silently create a FIN-04 payment");
  const repeated=await fin("/conciliations",{method:"PATCH",cookie:financeiro.cookie,body:{id:suggestion.body.conciliation.id,status:"conciliada"}}); assert.equal(repeated.status,409,"resolved suggestion cannot be confirmed twice");
  const conciliationAudit=await pool.query("SELECT count(*)::int n FROM audit_log WHERE action='fin_conciliation_confirm' AND target=$1",[suggestion.body.conciliation.id]); assert.equal(conciliationAudit.rows[0].n,1,"one confirmation audit record");
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

test("L07 Fatia 2/3: auditoria indisponível retorna 503 e reverte FIN-01..05", { skip: !RUN, timeout: 120_000 }, async () => {
  const financeiro=await provisionAndLoginStaff(pool,api,{role:"financeiro"});
  const paymentSpace=await insertClientSpace("Audit payment fail closed");
  const created=await fin("/receivables",{method:"POST",cookie:financeiro.cookie,body:{client_account_id:paymentSpace.accountId,contract_id:paymentSpace.contractId,competence_date:"2026-10-01",due_date:"2026-10-10",amount_cents:9000}}); assert.equal(created.status,201); const paymentAccountId=created.body.receivable.id;
  const receivableSpace=await insertClientSpace("Audit receivable fail closed"); const receivableRecurrenceId=`audit-rec-${uuid()}`;
  const payableSpace=await insertClientSpace("Audit payable fail closed"); const payableRecurrenceId=`audit-pay-${uuid()}`;
  const recurringSpace=await insertClientSpace("Audit recurring fail closed"); const recurringId=`audit-rule-${uuid()}`;
  const rule=await fin("/recurrence-rules",{method:"POST",cookie:financeiro.cookie,body:{contract_id:recurringSpace.contractId,recurrence_type:"mensal",start_date:"2026-10-01",amount_cents:12000,recurrence_id:recurringId}}); assert.equal(rule.status,201);
  const approved=await fin("/recurrence-rules",{method:"PATCH",cookie:financeiro.cookie,body:{id:rule.body.rule.id,is_approved:true}}); assert.equal(approved.status,200); assert.equal(approved.body.rule.is_approved,true);
  const fin05AuditStorage=`audit-fin05-statement-${uuid()}`; const fin05AuditRef=`audit-fin05-ref-${uuid().slice(0,12)}`;
  const fin05BeforeAudit=await fin("/bank-statements",{method:"POST",cookie:financeiro.cookie,body:{source:"importacao",file_name:"extrato-audit-disponivel.csv",file_url:`synthetic://${fin05AuditStorage}`,storage_key:fin05AuditStorage,import_date:"2026-10-01",transactions:[{transaction_date:"2026-10-10",amount_cents:9000,description:"Movimento para testar rollback de confirmação",bank_ref:fin05AuditRef}]}}); assert.equal(fin05BeforeAudit.status,201);
  const fin05Suggestion=await fin("/conciliations",{method:"POST",cookie:financeiro.cookie,body:{receivable_id:paymentAccountId,bank_transaction_id:fin05BeforeAudit.body.transactions[0].id,source:"importacao"}}); assert.equal(fin05Suggestion.status,201);
  const fin05SuggestionRef=`audit-fin05-suggestion-ref-${uuid().slice(0,12)}`;
  const fin05SuggestionTransaction=await fin("/bank-transactions",{method:"POST",cookie:financeiro.cookie,body:{statement_id:fin05BeforeAudit.body.statement.id,transaction_date:"2026-10-10",amount_cents:1000,description:"Movimento para testar rollback da sugestão",bank_ref:fin05SuggestionRef}}); assert.equal(fin05SuggestionTransaction.status,201);
  const failedFin05Storage=`audit-fin05-failed-${uuid()}`; const failedFin05Ref=`audit-fin05-failed-ref-${uuid().slice(0,12)}`; const failedFin05IncrementalRef=`audit-fin05-incremental-${uuid().slice(0,12)}`;
  const beforePayment=await pool.query(`SELECT amount_paid_cents,status,(SELECT count(*) FROM fin_payments WHERE receivable_id=$1) payments,(SELECT count(*) FROM fin_payment_history WHERE receivable_id=$1) history FROM fin_accounts_receivable WHERE id=$1`,[paymentAccountId]);
  await pool.query(`ALTER TABLE audit_log RENAME TO audit_log_l07_unavailable`);
  try {
    const payment=await fin("/payments",{method:"POST",cookie:financeiro.cookie,body:{account_type:"receber",receivable_id:paymentAccountId,amount_cents:3000,reason:"Auditoria indisponível deve reverter tudo"}}); assert.equal(payment.status,503); assert.equal(payment.body.error,"audit_unavailable");
    const receivable=await fin("/receivables",{method:"POST",cookie:financeiro.cookie,body:{client_account_id:receivableSpace.accountId,contract_id:receivableSpace.contractId,competence_date:"2026-10-01",due_date:"2026-10-10",amount_cents:7000,recurrence_id:receivableRecurrenceId,description:"Recebível para provar rollback da auditoria"}}); assert.equal(receivable.status,503); assert.deepEqual(receivable.body,{error:"audit_unavailable"});
    const payable=await fin("/payables",{method:"POST",cookie:financeiro.cookie,body:{client_account_id:payableSpace.accountId,contract_id:payableSpace.contractId,competence_date:"2026-10-01",due_date:"2026-10-10",amount_cents:8000,recurrence_id:payableRecurrenceId,description:"Pagável para provar rollback da auditoria"}}); assert.equal(payable.status,503); assert.deepEqual(payable.body,{error:"audit_unavailable"});
    const recurring=await fin("/generate-recurring",{method:"POST",cookie:financeiro.cookie,body:{recurrence_rule_id:rule.body.rule.id,competence_date:"2026-10-01",due_date:"2026-10-10",client_account_id:recurringSpace.accountId}}); assert.equal(recurring.status,503); assert.deepEqual(recurring.body,{error:"audit_unavailable"});
    const failedFin05Import=await fin("/bank-statements",{method:"POST",cookie:financeiro.cookie,body:{source:"importacao",file_name:"extrato-audit-indisponivel.csv",file_url:`synthetic://${failedFin05Storage}`,storage_key:failedFin05Storage,import_date:"2026-10-01",transactions:[{transaction_date:"2026-10-10",amount_cents:1000,description:"Importação que deve reverter por auditoria",bank_ref:failedFin05Ref}]}}); assert.equal(failedFin05Import.status,503); assert.deepEqual(failedFin05Import.body,{error:"audit_unavailable"});
    const failedFin05Incremental=await fin("/bank-transactions",{method:"POST",cookie:financeiro.cookie,body:{statement_id:fin05BeforeAudit.body.statement.id,transaction_date:"2026-10-10",amount_cents:1000,description:"Movimento avulso que deve reverter por auditoria",bank_ref:failedFin05IncrementalRef}}); assert.equal(failedFin05Incremental.status,503); assert.deepEqual(failedFin05Incremental.body,{error:"audit_unavailable"});
    const failedFin05SuggestionCreate=await fin("/conciliations",{method:"POST",cookie:financeiro.cookie,body:{receivable_id:paymentAccountId,bank_transaction_id:fin05SuggestionTransaction.body.transaction.id,source:"importacao"}}); assert.equal(failedFin05SuggestionCreate.status,503); assert.deepEqual(failedFin05SuggestionCreate.body,{error:"audit_unavailable"});
    const failedFin05Confirmation=await fin("/conciliations",{method:"PATCH",cookie:financeiro.cookie,body:{id:fin05Suggestion.body.conciliation.id,status:"conciliada"}}); assert.equal(failedFin05Confirmation.status,503); assert.deepEqual(failedFin05Confirmation.body,{error:"audit_unavailable"});
  } finally { await pool.query(`ALTER TABLE audit_log_l07_unavailable RENAME TO audit_log`); }

  const afterPayment=await pool.query(`SELECT amount_paid_cents,status,(SELECT count(*) FROM fin_payments WHERE receivable_id=$1) payments,(SELECT count(*) FROM fin_payment_history WHERE receivable_id=$1) history FROM fin_accounts_receivable WHERE id=$1`,[paymentAccountId]); assert.deepEqual(afterPayment.rows[0],beforePayment.rows[0],"payment rollback leaves account, history and payment untouched");
  const failedReceivable=await pool.query(`SELECT id FROM fin_accounts_receivable WHERE client_account_id=$1 AND contract_id=$2 AND recurrence_id=$3`,[receivableSpace.accountId,receivableSpace.contractId,receivableRecurrenceId]); assert.equal(failedReceivable.rows.length,0,"audit failure leaves no receivable");
  const failedReceivableHistory=await pool.query(`SELECT count(*)::int n FROM fin_payment_history h JOIN fin_accounts_receivable r ON r.id=h.receivable_id WHERE r.client_account_id=$1 AND r.contract_id=$2 AND r.recurrence_id=$3`,[receivableSpace.accountId,receivableSpace.contractId,receivableRecurrenceId]); assert.equal(failedReceivableHistory.rows[0].n,0,"audit failure leaves no initial receivable history");
  const failedPayable=await pool.query(`SELECT id FROM fin_accounts_payable WHERE client_account_id=$1 AND contract_id=$2 AND recurrence_id=$3`,[payableSpace.accountId,payableSpace.contractId,payableRecurrenceId]); assert.equal(failedPayable.rows.length,0,"audit failure leaves no payable");
  const failedPayableHistory=await pool.query(`SELECT count(*)::int n FROM fin_payment_history h JOIN fin_accounts_payable p ON p.id=h.payable_id WHERE p.client_account_id=$1 AND p.contract_id=$2 AND p.recurrence_id=$3`,[payableSpace.accountId,payableSpace.contractId,payableRecurrenceId]); assert.equal(failedPayableHistory.rows[0].n,0,"audit failure leaves no initial payable history");
  const recurringState=await pool.query(`SELECT last_generated_competence::text AS last_generated_competence,(SELECT count(*)::int FROM fin_accounts_receivable WHERE recurrence_rule_id=$1) receivables,(SELECT count(*)::int FROM fin_payment_history h JOIN fin_accounts_receivable r ON r.id=h.receivable_id WHERE r.recurrence_rule_id=$1) history FROM fin_recurrence_rules WHERE id=$1`,[rule.body.rule.id]); assert.equal(recurringState.rows.length,1); assert.equal(recurringState.rows[0].last_generated_competence,null,"audit failure does not advance last_generated_competence"); assert.equal(recurringState.rows[0].receivables,0,"audit failure leaves no generated receivable"); assert.equal(recurringState.rows[0].history,0,"audit failure leaves no generated initial history");
  const failedStatement=await pool.query(`SELECT id FROM fin_bank_statements WHERE storage_key=$1`,[failedFin05Storage]); assert.equal(failedStatement.rows.length,0,"audit failure leaves no synthetic statement");
  const failedBankTransaction=await pool.query(`SELECT id FROM fin_bank_transactions WHERE bank_ref=$1`,[failedFin05Ref]); assert.equal(failedBankTransaction.rows.length,0,"audit failure leaves no synthetic bank transaction");
  const failedIncrementalTransaction=await pool.query(`SELECT id FROM fin_bank_transactions WHERE bank_ref=$1`,[failedFin05IncrementalRef]); assert.equal(failedIncrementalTransaction.rows.length,0,"audit failure leaves no incremental bank transaction");
  const statementAfterFailedIncremental=await pool.query(`SELECT total_transactions,total_amount_cents FROM fin_bank_statements WHERE id=$1`,[fin05BeforeAudit.body.statement.id]); assert.deepEqual(statementAfterFailedIncremental.rows[0],{total_transactions:2,total_amount_cents:'10000'},"audit failure does not increment statement totals");
  const failedSuggestionState=await pool.query(`SELECT id FROM fin_conciliations WHERE bank_transaction_id=$1`,[fin05SuggestionTransaction.body.transaction.id]); assert.equal(failedSuggestionState.rows.length,0,"audit failure leaves no suggested conciliation");
  const unchangedConciliation=await pool.query(`SELECT c.status,t.is_conciliated FROM fin_conciliations c JOIN fin_bank_transactions t ON t.id=c.bank_transaction_id WHERE c.id=$1`,[fin05Suggestion.body.conciliation.id]); assert.deepEqual(unchangedConciliation.rows[0],{status:"sugerida",is_conciliated:false},"audit failure leaves confirmation and bank state untouched");
});

test("L07 Fatia 2/3: Chromium percorre recorrência, baixa, estorno e conciliação FIN-05", { skip: !RUN, timeout: 180_000 }, async () => {
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
    await page.getByTestId('finance-tab-reconciliation').click(); await page.waitForSelector('[data-testid="finance-reconciliation"]');
    const browserBankRef=`BROWSER-FIN05-${uuid().slice(0,12)}`; const browserStorage=`browser-fin05-${uuid()}`;
    await page.getByPlaceholder('Nome do extrato sintético').fill('extrato-browser-fin05.csv'); await page.getByPlaceholder('Chave sintética do extrato').fill(browserStorage); await page.getByLabel('Data de importação').fill('2026-10-10'); await page.getByLabel('Data do movimento').fill('2026-10-10'); await page.getByPlaceholder('Valor do movimento em centavos').fill('10000'); await page.getByPlaceholder('Descrição do movimento sintético').fill('Recebimento sintético pelo navegador real'); await page.getByPlaceholder('Referência bancária sintética').fill(browserBankRef); await page.getByRole('button',{name:'Importar extrato sintético'}).click();
    let browserTransaction; for(let i=0;i<40;i++){ browserTransaction=await pool.query('SELECT id,is_conciliated FROM fin_bank_transactions WHERE bank_ref=$1',[browserBankRef]); if(browserTransaction.rows.length) break; await sleep(100); } assert.equal(browserTransaction.rows.length,1); await page.waitForFunction(id=>Array.from(document.querySelectorAll('[data-testid="finance-bank-transaction"] option')).some(option=>option.getAttribute('value')===id),browserTransaction.rows[0].id); await page.getByTestId('finance-bank-transaction').selectOption(browserTransaction.rows[0].id); await page.getByRole('button',{name:'Sugerir conciliação'}).click();
    let browserConciliation; for(let i=0;i<40;i++){ browserConciliation=await pool.query('SELECT id,status FROM fin_conciliations WHERE bank_transaction_id=$1',[browserTransaction.rows[0].id]); if(browserConciliation.rows.length) break; await sleep(100); } assert.equal(browserConciliation.rows[0].status,'sugerida'); await page.waitForSelector(`[data-testid="finance-conciliation-${browserConciliation.rows[0].id}"]`); const conciliationRow=page.getByTestId(`finance-conciliation-${browserConciliation.rows[0].id}`); await conciliationRow.getByRole('button',{name:'Confirmar conciliação'}).click(); await page.waitForFunction(id=>document.querySelector(`[data-testid="finance-conciliation-${id}"]`)?.textContent?.includes('conciliada'),browserConciliation.rows[0].id); const browserConfirmed=await pool.query('SELECT c.status,t.is_conciliated FROM fin_conciliations c JOIN fin_bank_transactions t ON t.id=c.bank_transaction_id WHERE c.id=$1',[browserConciliation.rows[0].id]); assert.deepEqual(browserConfirmed.rows[0],{status:'conciliada',is_conciliated:true});
  } finally { await browser.close(); }
});
