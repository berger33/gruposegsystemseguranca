// L05 — contract workflow through real HTTP, a disposable PostgreSQL instance,
// and Chromium. SQL is used only for synthetic fixture setup and DB assertions.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { chromium } from "playwright";
import packagedChromium from "@sparticuz/chromium";
import { provisionAndLoginStaff } from "./helpers/staff-login.mjs";

const RUN = process.env.RUN_DATABASE_INTEGRATION === "1" && process.env.DATABASE_URL;
const root = path.resolve(import.meta.dirname, "..");
let server, pool, baseUrl, workDir;
const uuid = () => randomUUID();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForServer() { for (let i = 0; i < 180; i++) { try { const r = await fetch(`${baseUrl}/api/admin/session`); if ([200, 401].includes(r.status)) return; } catch {} await sleep(250); } throw new Error("server_did_not_start"); }
async function api(pathname, { method = "GET", body, cookie, origin = baseUrl, sendOrigin = true } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, { method, headers: { accept: "application/json", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...(sendOrigin ? { origin } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const raw = await response.text(); let parsed; try { parsed = JSON.parse(raw); } catch { parsed = raw; }
  return { status: response.status, body: parsed, setCookie: response.headers.getSetCookie?.() || [] };
}
async function contract(path, options) { return api(`/api/crm/contracts${path}`, options); }

before(async () => {
  if (!RUN) return;
  workDir = await mkdtemp(path.join(tmpdir(), "seg-l05-"));
  const port = 4900 + Math.floor(Math.random() * 300);
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ["server.mjs", "--dev"], { cwd: root, env: { ...process.env, PORT: String(port), BIND_HOST: "127.0.0.1", NODE_ENV: "development", NEXT_DIST_DIR: ".next/integration-l05", SITE_ADMIN_SESSION_SECRET: `${uuid()}${uuid()}`, EMPLOYEE_SESSION_SECRET: `${uuid()}${uuid()}`, ADMIN_LOGIN_MAX_ATTEMPTS: "100", OLLAMA_ENABLED: "false", MAIL_HOST: "", CLIENT_DOCS_DIR: path.join(workDir, "private") }, stdio: ["ignore", "pipe", "pipe"] });
  server.stderr.on("data", chunk => { if (process.env.QA_VERBOSE === "1") process.stderr.write(chunk); });
  await waitForServer(); pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 6 });
});
after(async () => { await pool?.end().catch(() => {}); if (server && !server.killed) { server.kill("SIGTERM"); await sleep(250); server.kill("SIGKILL"); } if (workDir) await rm(workDir, { recursive: true, force: true }); });

test("L05: canonical contract, composition, controlled lifecycle, local alert, closure and restricted diary", { skip: !RUN, timeout: 180_000 }, async () => {
  const manager = await provisionAndLoginStaff(pool, api, { role: "admin" });
  const commercial = await provisionAndLoginStaff(pool, api, { role: "comercial" });
  const companyId = uuid(); const unitId = uuid();
  await pool.query("INSERT INTO crm_companies (id,display_name,type,status,created_by) VALUES ($1,'QA L05 Empresa','client','active','admin')", [companyId]);
  await pool.query("INSERT INTO crm_company_units (id,company_id,display_name,is_main) VALUES ($1,$2,'QA Unidade',true)", [unitId, companyId]);

  assert.equal((await contract("", { cookie: commercial.cookie, method: "POST", body: { source: "manual" } })).status, 403, "commercial cannot mutate another contract domain");
  assert.equal((await contract("", { method: "GET" })).status, 401, "anonymous contract read fails closed");
  const manual = { source: "manual", request_key: uuid(), company_id: companyId, title: "Contrato sintético L05", service_summary: "Cobertura sintética de segurança para validação local", starts_on: "2026-10-01", total_cost: 100, total_price: 150, origin_details: "Registro manual sintético por administradora para teste integrado." };
  const created = await contract("", { cookie: manager.cookie, method: "POST", body: manual });
  assert.equal(created.status, 201); const contractId = created.body.contract.id;
  const retry = await contract("", { cookie: manager.cookie, method: "POST", body: manual });
  assert.equal(retry.status, 200); assert.equal(retry.body.contract.id, contractId, "manual retry is idempotent");
  const canonical = await pool.query("SELECT proposal_id,status FROM crm_contracts WHERE id=$1", [contractId]);
  assert.equal(canonical.rows[0].proposal_id, null, "manual origin has no invented proposal"); assert.equal(canonical.rows[0].status, "rascunho");
  assert.equal(Number((await pool.query("SELECT count(*) FROM crm_contract_implantations WHERE contract_id=$1", [contractId])).rows[0].count), 1);
  assert.equal(Number((await pool.query("SELECT count(*) FROM crm_implantation_steps WHERE contract_id=$1", [contractId])).rows[0].count), 10);

  // A real CRM opportunity/proposal acceptance reaches the canonical L05
  // contract transaction. Repeating the canonical creation does not duplicate it.
  const opportunity = await api("/api/crm/opportunities", { cookie: manager.cookie, method: "POST", body: { company_id: companyId, title: "Oportunidade QA L05", priority: "media", origin: "qa-l05" } });
  assert.equal(opportunity.status, 201);
  const proposal = await api("/api/crm/proposals", { cookie: manager.cookie, method: "POST", body: { company_id: companyId, opportunity_id: opportunity.body.opportunity.id, title: "Proposta QA L05" } });
  assert.equal(proposal.status, 201);
  const accepted = await api(`/api/crm/proposals/${proposal.body.proposal.id}`, { cookie: manager.cookie, method: "PATCH", body: { status: "aceita" } });
  assert.equal(accepted.status, 200); assert.ok(accepted.body.contract?.id, "accepted proposal creates canonical contract");
  const acceptedContractId = accepted.body.contract.id;
  const acceptanceRetries = await Promise.all([contract("", { cookie: manager.cookie, method: "POST", body: { source: "proposal", proposal_id: proposal.body.proposal.id, proposal_version: accepted.body.proposal.version } }), contract("", { cookie: manager.cookie, method: "POST", body: { source: "proposal", proposal_id: proposal.body.proposal.id, proposal_version: accepted.body.proposal.version } })]);
  assert.ok(acceptanceRetries.every(result => [200, 201].includes(result.status)));
  assert.equal(Number((await pool.query("SELECT count(*) FROM crm_contracts WHERE proposal_id=$1 AND proposal_version=$2", [proposal.body.proposal.id, accepted.body.proposal.version])).rows[0].count), 1, "accepted version has exactly one contract despite retries");
  assert.equal(Number((await pool.query("SELECT count(*) FROM crm_contract_implantations WHERE contract_id=$1", [acceptedContractId])).rows[0].count), 1);

  assert.equal((await contract(`/${contractId}/units`, { cookie: manager.cookie, method: "POST", body: { unit_id: unitId, role: "principal" } })).status, 201);
  assert.equal((await contract(`/${contractId}/units`, { cookie: manager.cookie, method: "POST", body: { unit_id: uuid(), role: "intrusa" } })).status, 409, "cross-company unit is denied");
  assert.equal((await contract(`/${contractId}/responsibles`, { cookie: manager.cookie, method: "POST", body: { responsible_name: "Gestora QA", role: "gestora", is_primary: true } })).status, 201);
  assert.equal((await contract(`/${contractId}/items`, { cookie: manager.cookie, method: "POST", body: { type: "servico", description: "Serviço recorrente QA", quantity: 1, unit: "mês", unit_cost: 100, unit_price: 150, recurrence_type: "recorrente" } })).status, 201);
  assert.equal((await contract(`/${contractId}/posts`, { cookie: manager.cookie, method: "POST", body: { title: "Posto QA", shift: "comercial", quantity: 1, schedule: { dias: ["seg"], inicio: "08:00", fim: "18:00" }, recurrence_type: "recorrente" } })).status, 201);
  assert.equal((await contract(`/${contractId}/sla`, { cookie: manager.cookie, method: "POST", body: { service_type: "vigilancia", description: "SLA sintético", response_time_minutes: 60, resolution_time_minutes: 240 } })).status, 201);

  const portalAccount = uuid(), portalContract = uuid(), otherPortalContract = uuid(), documentId = uuid(), portalIdentity = uuid();
  await pool.query("INSERT INTO client_accounts (id,display_name,status,created_by) VALUES ($1,'Portal QA','active','marcelo')", [portalAccount]);
  await pool.query("INSERT INTO client_contracts (id,client_account_id,title,service,status,created_by) VALUES ($1,$2,'Portal QA','Teste','active','marcelo'),($3,$2,'Outro contrato QA','Teste','active','marcelo')", [portalContract, portalAccount, otherPortalContract]);
  await pool.query("INSERT INTO auth_identities (id,kind,email,display_name,status) VALUES ($1,'client',$2,'Cliente Portal QA','active')", [portalIdentity, `portal-${portalIdentity.slice(0, 8)}@exemplo.invalid`]);
  await pool.query("INSERT INTO client_access_grants (id,identity_id,client_account_id,reason,granted_by,contract_scope_mode) VALUES ($1,$2,$3,'Grant sintético L05','marcelo','all')", [uuid(), portalIdentity, portalAccount]);
  await pool.query("INSERT INTO client_documents (id,client_account_id,contract_id,title,category,original_filename,content_type,size_bytes,storage_key,uploaded_by) VALUES ($1,$2,$3,'Comprovante QA','contratual','qa.pdf','application/pdf',1,$4,'marcelo')", [documentId, portalAccount, portalContract, `qa${uuid().replaceAll("-", "").slice(0, 30)}`]);
  assert.equal((await contract(`/${contractId}/portal-link`, { cookie: manager.cookie, method: "PUT", body: { client_contract_id: portalContract, note: "Vínculo explícito para o contrato sintético QA." } })).status, 200);
  assert.equal((await contract(`/${contractId}/documents`, { cookie: manager.cookie, method: "POST", body: { client_document_id: documentId, category: "contrato" } })).status, 201);
  const obligation = await contract(`/${contractId}/document-obligations`, { cookie: manager.cookie, method: "POST", body: { title: "Comprovante contratual", category: "comprovante", periodicity: "anual", due_date: "2026-12-31" } });
  assert.equal(obligation.status, 201);
  const obligationUpdate = await contract(`/${contractId}/document-obligations/${obligation.body.obligation.id}`, { cookie: manager.cookie, method: "PATCH", body: { status: "aprovado", reason: "Arquivo privado QA conferido", client_document_id: documentId } }); assert.equal(obligationUpdate.status, 200);

  assert.equal((await contract(`/${contractId}/status`, { cookie: manager.cookie, method: "POST", body: { next_status: "em_revisao", effective_date: "2026-10-01", reason: "Revisão QA" } })).status, 200);
  assert.equal((await contract(`/${contractId}/status`, { cookie: manager.cookie, method: "POST", body: { next_status: "aguardando_assinatura", effective_date: "2026-10-01", reason: "Aguardando assinatura QA" } })).status, 200);
  assert.equal((await contract(`/${contractId}/status`, { cookie: manager.cookie, method: "POST", body: { next_status: "ativo", effective_date: "2026-10-01", reason: "Não pode ativar incompleto", signature_evidence: "QA" } })).status, 409, "incomplete implantation blocks activation");
  assert.equal((await contract(`/${contractId}/status`, { cookie: manager.cookie, method: "POST", body: { next_status: "aguardando_assinatura", effective_date: "2026-10-01", reason: "Assinatura QA", signed_at: "2026-10-01", signature_evidence: "Evidência sintética preservada" } })).status, 200);
  const implementation = await contract(`/${contractId}/implantation`, { cookie: manager.cookie });
  for (const step of implementation.body.steps) {
    const response = await contract(`/${contractId}/implantation/steps/${step.id}`, { cookie: manager.cookie, method: "PATCH", body: { status: "concluido", evidence_basis: `Base de verificação sintética QA para ${step.step_id}` } });
    assert.equal(response.status, 200);
  }
  assert.equal((await contract(`/${contractId}/status`, { cookie: manager.cookie, method: "POST", body: { next_status: "ativo", effective_date: "2026-10-01", reason: "Pré-requisitos QA concluídos" } })).status, 200);

  const amendment = await contract(`/${contractId}/amendments`, { cookie: manager.cookie, method: "POST", body: { request_key: uuid(), type: "reajuste", title: "Reajuste QA", base_type: "indice_ipca", justification: "Reajuste sintético com base e vigência preservadas.", vigencia_start: "2026-11-01", effective_date: "2026-11-01", new_total_cost: 110, new_total_price: 165 } });
  assert.equal(amendment.status, 201);
  assert.equal((await contract(`/${contractId}/amendments/${amendment.body.amendment.id}`, { cookie: manager.cookie, method: "PATCH", body: { status: "aprovado", reason: "Aprovação QA" } })).status, 200);
  const unchanged = await pool.query("SELECT total_price FROM crm_contracts WHERE id=$1", [contractId]); assert.equal(String(unchanged.rows[0].total_price), "150.00", "approval does not rewrite historic total");

  const rule = await contract(`/${contractId}/alert-rules`, { cookie: manager.cookie, method: "POST", body: { alert_type: "renovacao", title: "Renovação QA", days_before: 30, channel: "sistema" } });
  assert.equal(rule.status, 201);
  const run = await contract(`/${contractId}/alert-rules/${rule.body.rule.id}/run`, { cookie: manager.cookie, method: "POST", body: { due_date: "2026-12-01" } }); assert.equal(run.status, 201);
  const runRetry = await contract(`/${contractId}/alert-rules/${rule.body.rule.id}/run`, { cookie: manager.cookie, method: "POST", body: { due_date: "2026-12-01" } }); assert.equal(runRetry.status, 200);
  const durableRun = await pool.query("SELECT task_id,opportunity_id,notification_id FROM crm_contract_alert_runs WHERE alert_rule_id=$1", [rule.body.rule.id]);
  assert.equal(durableRun.rows.length, 1, "alert run has durable de-duplication"); assert.ok(durableRun.rows[0].task_id && durableRun.rows[0].opportunity_id && durableRun.rows[0].notification_id, "one run ties task, CRM negotiation and local outbox row");

  const diary = await contract(`/${contractId}/management-diary`, { cookie: manager.cookie, method: "POST", body: { title: "Decisão QA", decision: "Decisão sintética registrada para a gestão do contrato.", category: "decisao", decision_date: "2026-10-01", tags: [] } }); assert.equal(diary.status, 201);
  assert.equal((await contract(`/${contractId}/management-diary`, { cookie: commercial.cookie })).status, 403, "commercial cannot read restricted diary");
  const dossier = await contract(`/${contractId}/fiscal/dossiers`, { cookie: manager.cookie, method: "POST", body: { title: "Dossiê QA" } }); assert.equal(dossier.status, 201);
  assert.equal((await contract(`/${contractId}/fiscal/measurements`, { cookie: manager.cookie, method: "POST", body: { dossier_id: dossier.body.dossier.id, service_type: "vigilancia", measurement_date: "2026-10-02", quantity: 1, quality_score: 95 } })).status, 201);

  const closure = await contract(`/${contractId}/closure`, { cookie: manager.cookie, method: "POST", body: { closure_type: "encerramento", closure_date: "2026-12-31", effective_date: "2026-12-31", reason: "Encerramento sintético com pendências e histórico preservados." } });
  assert.equal(closure.status, 201);
  const closureState = await contract(`/${contractId}/closure`, { cookie: manager.cookie });
  for (const step of closureState.body.steps) {
    assert.equal((await contract(`/${contractId}/closure/steps/${step.id}`, { cookie: manager.cookie, method: "PATCH", body: { status: "concluido", notes: "Evidência sintética de encerramento QA" } })).status, 200);
  }
  assert.equal((await contract(`/${contractId}/closure`, { cookie: manager.cookie, method: "PATCH", body: { status: "concluido", reason: "Checklist de encerramento QA concluído." } })).status, 200);
  assert.equal((await pool.query("SELECT status FROM crm_contracts WHERE id=$1", [contractId])).rows[0].status, "encerrado");
  assert.equal((await pool.query("SELECT status FROM client_contracts WHERE id=$1", [portalContract])).rows[0].status, "ended", "only linked portal contract is ended");
  const grant = await pool.query("SELECT contract_scope_mode,allowed_contract_ids FROM client_access_grants WHERE identity_id=$1", [portalIdentity]);
  assert.equal(grant.rows[0].contract_scope_mode, "selected"); assert.deepEqual(grant.rows[0].allowed_contract_ids, [otherPortalContract], "other active contract stays authorized");

  const browser = await chromium.launch({ executablePath: await packagedChromium.executablePath(), args: packagedChromium.args.filter(arg => arg !== "--disable-web-security"), headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies(manager.cookie.split("; ").map(pair => { const [name, value] = pair.split("="); return { name, value, domain: "127.0.0.1", path: "/" }; }));
    const page = await context.newPage(); await page.goto(`${baseUrl}/admin/contratos`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Contratos e implantação" }).waitFor();
    await page.getByRole("heading", { name: "Cadastro manual identificado" }).waitFor();
    await context.close();
  } finally { await browser.close(); }

  const audit = await pool.query("SELECT count(*) FROM auth_access_audit WHERE action LIKE 'l05_%' AND target=$1", [contractId]); assert.ok(Number(audit.rows[0].count) >= 10, "mutations left durable L05 audit trail");
  // Fault injection: audit persistence is part of the mutation transaction.
  // The disposable fixture removes only rows that would intentionally violate
  // the temporary failure constraint; application history is never removed.
  await pool.query("DELETE FROM auth_access_audit WHERE action='l05_contract_create'");
  await pool.query("ALTER TABLE auth_access_audit DROP CONSTRAINT auth_access_audit_action_check");
  await pool.query("ALTER TABLE auth_access_audit ADD CONSTRAINT auth_access_audit_action_check CHECK (action <> 'l05_contract_create')");
  const auditFailureKey = uuid();
  const auditFailure = await contract("", { cookie: manager.cookie, method: "POST", body: { ...manual, request_key: auditFailureKey, title: "Contrato que deve sofrer rollback" } });
  assert.equal(auditFailure.status, 503, "audit failure fails closed");
  assert.equal(Number((await pool.query("SELECT count(*) FROM crm_contracts WHERE idempotency_key=$1", [`manual:${auditFailureKey}`])).rows[0].count), 0, "audit failure leaves no partial contract");
});
